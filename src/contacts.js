define("xabber-contacts", function () {
    return function (xabber) {
        var env = xabber.env,
            constants = env.constants,
            templates = env.templates.contacts,
            utils = env.utils,
            $ = env.$,
            $iq = env.$iq,
            $msg = env.$msg,
            $pres = env.$pres,
            Strophe = env.Strophe,
            _ = env._,
            moment = env.moment,
            uuid = env.uuid,
            Images = utils.images,
            Emoji = utils.emoji;

        xabber.Contact = Backbone.Model.extend({
            idAttribute: 'jid',
            defaults: {
                status: "offline",
                status_message: "",
                subscription: null,
                groups: [],
                group_chat: false,
                group_chat_owner: false
            },

            initialize: function (_attrs, options) {
                this.account = options.account;
                var attrs = _.clone(_attrs);
                attrs.name = attrs.roster_name || attrs.jid;
                if (!attrs.image) {
                    attrs.image = Images.getDefaultAvatar(attrs.name);
                }
                this.cached_image = Images.getCachedImage(attrs.image);
                attrs.vcard = utils.vcard.getBlank(attrs.jid);
                this.set(attrs);
                this.hash_id = env.b64_sha1(this.account.get('jid') + '-' + attrs.jid);
                this.resources = new xabber.ContactResources(null, {contact: this});
                this.details_view = new xabber.ContactDetailsView({model: this});
                this.invitation = new xabber.ContactInvitationView({model: this});
                this.on("change:photo_hash", this.getVCard, this);
                this.on("change:group_chat", this.onChangedGroupchat, this);
                this.account.dfd_presence.done(function () {
                    this.getVCard();
                    this.getLastSeen();
                }.bind(this));
            },

            getStatusMessage: function () {
                return this.get('status_message') || constants.STATUSES[this.get('status')];
            },

            getVCard: function (callback) {
                var jid = this.get('jid'),
                    is_callback = _.isFunction(callback);
                this.account.connection.vcard.get(jid,
                    function (vcard) {
                        var attrs = {
                            vcard: vcard,
                            vcard_updated: moment.now(),
                            name: this.get('roster_name') || this.get('name')
                        }
                        if (attrs.name == jid || !attrs.name) {
                            attrs.name = vcard.nickname || vcard.fullname || (vcard.first_name + ' ' + vcard.last_name).trim() || jid;
                        }
                        if (vcard.photo.image)
                            attrs.hash_avatar = sha1(vcard.photo.image);
                        attrs.image = vcard.photo.image || Images.getDefaultAvatar(attrs.name);
                        this.cached_image = Images.getCachedImage(attrs.image);
                        this.set(attrs);
                        is_callback && callback(vcard);
                    }.bind(this),
                    function () {
                        is_callback && callback(null);
                    }
                );
            },

            onChangedGroupchat: function () {
                if (this.get('group_chat')) {
                    this.updateCounters();
                    this.getMyRights();
                }
            },

            updateCounters: function () {
                xabber.toolbar_view.recountAllMessageCounter();
            },

            getLastSeen: function() {
                if (this.get('status') == 'offline') {
                    var iq = $iq({from: this.account.get('jid'), type: 'get', to: this.get('jid') }).c('query', {xmlns: Strophe.NS.LAST});
                    this.account.sendIQ(iq, function (iq) {
                        var last_seen = this.getLastSeenStatus(iq);
                        if (this.get('status') == 'offline')
                            this.set({status_message: last_seen });
                        return this;
                    }.bind(this));
                }
            },

            getMyRights: function () {
                var iq = $iq({from: this.account.get('jid'), to: this.get('jid'), type: 'get'})
                    .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#members', id: ''});
                this.account.sendIQ(iq, function (iq) {
                    var permissions = [], restrictions = [],
                        badge = $(iq).find('badge').text(), nickname = $(iq).find('nickname').text(),
                        member_id = $(iq).find('id').text(),
                        avatar = $(iq).find('metadata[xmlns="' + Strophe.NS.PUBSUB_AVATAR_METADATA + '"]').find('info').attr('id'),
                        last_present = $(iq).find('present').text(), avatar_base64,
                        role;

                    if (this.account.chat_settings.getHashAvatar(member_id))
                        avatar_base64 = this.account.chat_settings.getB64Avatar(member_id);
                    else {
                        var node = Strophe.NS.PUBSUB_AVATAR_DATA + '#';
                        this.getAvatar(avatar, node, function (pubsub_avatar) {
                            this.account.chat_settings.updateCachedAvatars(member_id, avatar, pubsub_avatar);
                            this.my_info.b64_avatar = pubsub_avatar;
                        }.bind(this));
                    }

                    $(iq).find('permission').each(function(idx, permission) {
                        permissions.push($(permission).attr('name'));
                    }.bind(this));
                    $(iq).find('restriction').each(function(idx, restriction) {
                        restrictions.push($(restriction).attr('name'));
                    }.bind(this));
                    if (permissions.length > 0) {
                        role = 'Admin';
                        if (permissions.find(permission => permission === 'owner'))
                            role = 'Owner';
                    }
                    else
                        role = 'Member';

                    this.my_info = {id: member_id, nickname: nickname, avatar: avatar, b64_avatar: avatar_base64, badge: badge, role: role, permissions: $(iq).find('permission'), restrictions: $(iq).find('restriction')};
                    this.my_rights = { permissions: permissions, restrictions: restrictions};
                }.bind(this));
            },

            getAvatar: function (avatar, node, callback, errback) {
                var iq_request_avatar = $iq({from: this.account.get('jid'), type: 'get', to: this.get('jid')})
                    .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                    .c('items', {node: node})
                    .c('item', {id: avatar});
                this.account.sendIQ(iq_request_avatar, function (iq) {
                    var pubsub_avatar = $(iq).find('data').text();
                    if (pubsub_avatar == "")
                        errback && errback("Node is empty");
                    else
                        callback && callback(pubsub_avatar);
                }.bind(this));
            },

            pubAvatar: function (image, node, callback, errback) {
                var avatar_hash = sha1(image.base64),
                    iq_pub_data = $iq({from: this.account.get('jid'), type: 'set', to: this.get('jid') })
                        .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                        .c('publish', {node: Strophe.NS.PUBSUB_AVATAR_DATA + node})
                        .c('item', {id: avatar_hash})
                        .c('data', {xmlns: Strophe.NS.PUBSUB_AVATAR_DATA}).t(image.base64),
                    iq_pub_metadata = $iq({from: this.account.get('jid'), type: 'set', to: this.get('jid') })
                        .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                        .c('publish', {node: Strophe.NS.PUBSUB_AVATAR_METADATA + node})
                        .c('item', {id: avatar_hash})
                        .c('metadata', {xmlns: Strophe.NS.PUBSUB_AVATAR_METADATA})
                        .c('info', {bytes: image.size, id: avatar_hash, type: image.type});
                this.account.sendIQ(iq_pub_data, function () {
                    this.account.sendIQ(iq_pub_metadata, function () {
                        callback && callback(avatar_hash);
                    }.bind(this));
                }.bind(this));
            },

            getLastSeenStatus: function(iq) {
                var seconds = $(iq).children('query').attr('seconds'),
                    message_time = moment.now() - 1000*seconds;
                this.set({ last_seen: message_time });
                return this.lastSeenNewFormat(seconds, message_time);
            },

            pres: function (type) {
                var pres = $pres({to: this.get('jid'), type: type});
                this.account.sendPres(pres);
                this.trigger('presence', this, type + '_from');
                return this;
            },

            pushInRoster: function (attrs, callback, errback) {
                attrs || (attrs = {});
                var name = attrs.name || this.get('name'),
                    groups = attrs.groups || this.get('groups');
                var iq = $iq({type: 'set'})
                    .c('query', {xmlns: Strophe.NS.ROSTER})
                    .c('item', {jid: this.get('jid'), name: name});
                _.each(groups, function (group) {
                    iq.c('group').t(group).up();
                });
                this.account.sendIQ(iq, callback, errback);
                this.set('known', true);
                return this;
            },

            removeFromRoster: function (callback, errback) {
                var iq = $iq({type: 'set'})
                    .c('query', {xmlns: Strophe.NS.ROSTER})
                    .c('item', {jid: this.get('jid'), subscription: "remove"});
                this.account.sendIQ(iq, callback, errback);
                this.set('known', false);
                return this;
            },

            acceptRequest: function (callback) {
                this.pres('subscribed');
                callback && callback();
            },

            acceptGroupRequest: function (callback) {
                this.pres('subscribe');
                callback && callback();
            },

            blockRequest: function (callback) {
                this.pres('unsubscribed');
                this.removeFromRoster().block(callback);
            },

            declineRequest: function (callback) {
                this.pres('unsubscribed');
                this.removeFromRoster(callback);
            },

            declineSubscription: function () {
                this.pres('unsubscribe');
            },

            block: function (callback, errback) {
                var iq = $iq({type: 'set'}).c('block', {xmlns: Strophe.NS.BLOCKING})
                    .c('item', {jid: this.get('jid')});
                this.account.sendIQ(iq, callback, errback);
                this.set('known', false);
            },

            unblock: function (callback, errback) {
                var iq = $iq({type: 'set'}).c('unblock', {xmlns: Strophe.NS.BLOCKING})
                    .c('item', {jid: this.get('jid')});
                this.account.sendIQ(iq, callback, errback);
            },

            handlePresence: function (presence) {
                if (($(presence).find('x[xmlns="'+Strophe.NS.GROUP_CHAT +'"]').length > 0)&&!($(presence).attr('type') == 'unavailable')) {
                    this.details_view = new xabber.GroupChatDetailsView({model: this});
                    if (!this.get('group_chat')) {
                        this.set('group_chat', true);
                        this.account.chat_settings.updateGroupChatsList(this.get('jid'), this.get('group_chat'));
                    }
                    var group_chat_info = this.parseGroupInfo($(presence));
                    this.set('group_info', group_chat_info);
                    if (group_chat_info.name) {
                        if (this.get('roster_name') == this.get('jid'))
                            this.set('roster_name', group_chat_info.name);
                        this.set('name', group_chat_info.name)
                    }
                    var chat = this.account.chats.get(this.hash_id);
                    if (chat.item_view.content.head)
                        chat.item_view.content.head.updateStatusMsg();
                }

                var $presence = $(presence),
                    type = presence.getAttribute('type'),
                    $vcard_update = $presence.find('x[xmlns="'+Strophe.NS.VCARD_UPDATE+'"]');
                if ($vcard_update.length) {
                    if (($vcard_update.children().length == 1)&&($vcard_update.children('photo').length == 1))
                    {
                       if (this.get('hash_avatar') != $vcard_update.find('photo').text()) {
                           this.set('hash_avatar', $vcard_update.find('photo').text());
                           this.set('photo_hash', $vcard_update.find('photo').text());
                       }
                    }
                    else
                        this.getVCard();
                }
                if (type === 'subscribe') {
                    if (this.get('in_roster')) {
                        this.pres('subscribed');
                    } else {
                        this.trigger('presence', this, 'subscribe');
                    }
                } else if (type === 'subscribed') {
                    if (this.get('subscription') === 'to') {
                        this.pres('subscribed');
                    }
                    this.trigger('presence', this, 'subscribed');
                } else if (type === 'unsubscribe') {

                } else if (type === 'unsubscribed') {
                    this.trigger('presence', this, 'unsubscribed');
                } else {
                    var jid = presence.getAttribute('from'),
                        resource = Strophe.getResourceFromJid(jid),
                        priority = Number($presence.find('priority').text()),
                        status = $presence.find('show').text() || 'online',
                        $status_message = $presence.find('status'),
                        status_message = $status_message.text();
                    _.isNaN(priority) && (priority = 0);
                    clearTimeout(this._reset_status_timeout);
                    var resource_obj = this.resources.get(resource);
                    if (type === 'unavailable') {
                        this.set({ last_seen: moment.now() });
                        resource_obj && resource_obj.destroy();
                    } else {
                        this.set({ last_seen: undefined });
                        var attrs = {
                            resource: resource,
                            priority: priority,
                            status: status
                        };
                        $status_message.length && (attrs.status_message = status_message);
                        if (!resource_obj) {
                            resource_obj = this.resources.create(attrs);
                        } else {
                            resource_obj.set(attrs);
                        }
                    }
                }
            },

            parseGroupInfo: function ($presence) {
                var jid = Strophe.getBareJidFromJid($presence.attr('from')),
                    $group_chat = $presence.find('x[xmlns="'+Strophe.NS.GROUP_CHAT +'"]'),
                    name = $group_chat.find('name').text(),
                    model = $group_chat.find('model').text(),
                    anonymous = $group_chat.find('anonymous').text(),
                    searchable = $group_chat.find('searchable').text(),
                    description = $group_chat.find('description').text(),
                    pinned_message = $group_chat.find('pinned-message').text(),
                    members_num = parseInt($group_chat.find('members').text()),
                    online_members_num = parseInt($group_chat.find('present').text()),
                    info = {
                        jid: jid,
                        name: name,
                        anonymous: anonymous,
                        searchable: searchable,
                        model: model,
                        description: description,
                        members_num: members_num,
                        online_members_num: online_members_num
                    };
                var pinned_msg_elem = this.account.chats.get(this.hash_id).item_view.content.$pinned_message;
                if (pinned_message && pinned_message != "") {
                    var queryid = uuid(),
                        iq = $iq({type: 'set', to: jid})
                            .c('query', {xmlns: Strophe.NS.MAM, queryid: queryid})
                            .c('x', {xmlns: Strophe.NS.XFORM, type: 'submit'})
                            .c('field', {'var': 'FORM_TYPE', type: 'hidden'})
                            .c('value').t(Strophe.NS.MAM).up().up()
                            .c('field', {'var': '{urn:xmpp:sid:0}stanza-id'})
                            .c('value').t(pinned_message);
                    var handler = this.account.connection.addHandler(function (message) {
                        var $msg = $(message);
                        if ($msg.find('result').attr('queryid') === queryid) {
                            this.set('pinned_message', $msg);
                            this.parsePinnedMessage($msg, pinned_msg_elem);
                        }
                        return true;
                    }.bind(this), Strophe.NS.MAM);
                    this.account.sendIQ(iq,
                        function (res) {
                            this.account.connection.deleteHandler(handler);
                        }.bind(this),
                        function (err) {
                            this.account.connection.deleteHandler(handler);
                        }.bind(this)
                    );
                }
                if (pinned_message == "") {
                    this.set('pinned_message', undefined);
                    this.parsePinnedMessage(undefined, pinned_msg_elem);
                }

                return info;
            },

            parsePinnedMessage: function ($message, pinned_msg_elem) {
                if ($message === undefined) {
                    pinned_msg_elem.html("");
                    pinned_msg_elem.siblings('.chat-content').css({'height':'100%'});
                    return;
                }
                else {
                    var $msg = $message.find('message').first(),
                        this_chat = this.account.chats.get(this.hash_id),
                        message_from_stanza = this_chat.messages.createFromStanza($msg, {pinned_message: true}),
                        pinned_msg_elem = this_chat.item_view.content.$pinned_message,
                        $forwarded_msg = $msg.find('forwarded'), msg_author, msg_text, msg_timestamp, fwd_msg_author;
                        msg_author = $msg.find('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"]').first().find('nickname').text() ||
                            $msg.find('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"]').first().find('jid').text() ||
                            $msg.find('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"]').first().find('id').text();
                        msg_text = message_from_stanza.message;
                        msg_timestamp = utils.pretty_datetime($message.find('delay').last().attr('stamp'));
                    if ($forwarded_msg.length > 0) {
                        fwd_msg_author = $forwarded_msg.find('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"]').find('nickname').text() ||
                            $forwarded_msg.find('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"]').find('jid').text() ||
                            $forwarded_msg.find('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"]').find('id').text();
                        if (!fwd_msg_author)
                            fwd_msg_author = ($forwarded_msg.find('message').attr('from') == this.account.get('jid')) ? this.account.get('name') : this.account.contacts.mergeContact(Strophe.getBareJidFromJid($forwarded_msg.find('message').attr('from'))).get('name');
                        msg_text = _.escape($forwarded_msg.find('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"]').find('body').text()) || _.escape($forwarded_msg.find('body').text());
                    }

                    var images = message_from_stanza.images,
                        files = message_from_stanza.files;
                    if (images) {
                        if (images.length == 1)
                            msg_text = '<span class=text-color-500>Image</span>';
                        if (images.length > 1)
                            msg_text = '<span class=text-color-500>' + images.length + ' images</span>';
                    }
                    if (files) {
                        if (files.length == 1)
                            msg_text = '<span class=text-color-500>File</span>';
                        if (files.length > 1)
                            msg_text = '<span class=text-color-500>' + files.length + ' files</span>';
                    }

                    var pinned_msg = {
                            author: msg_author,
                            time: msg_timestamp,
                            message: msg_text,
                            fwd_author: fwd_msg_author
                        },
                        pinned_msg_html = $(templates.pinned_message(pinned_msg));
                    pinned_msg_elem.html(pinned_msg_html).emojify('.chat-msg-content', {emoji_size: 18});
                    var height_pinned_msg = pinned_msg_elem.height();
                    pinned_msg_elem.siblings('.chat-content').css({
                        'height': 'calc(100% - ' + height_pinned_msg + 'px)'
                    });
                    pinned_msg_elem.attr('data-msgid', $message.find('message').attr('id'));
                }
            },

            resetStatus: function (timeout) {
                clearTimeout(this._reset_status_timeout);
                this._reset_status_timeout = setTimeout(function () {
                    this.set({
                        status_updated: moment.now(),
                        status: 'offline',
                        status_message: ''
                    });
                }.bind(this), timeout || 5000);
            },

            lastSeenNewFormat: function (seconds) {
                if ((seconds >= 0)&&(seconds < 60))
                    return 'last seen just now';
                if ((seconds > 60)&&(seconds < 3600))
                    return ('last seen ' + Math.trunc(seconds/60) + ((seconds < 120) ? ' minute ago' : ' minutes ago'));
                if ((seconds >= 3600)&&(seconds < 7200))
                    return ('last seen hour ago');
                if ((seconds >= 3600*48*2))
                    return ('last seen '+ moment().subtract(seconds, 'seconds').format('LL'));
                else
                    return ('last seen '+ (moment().subtract(seconds, 'seconds').calendar()).toLowerCase());
            },

            showDetails: function (screen) {
                screen || (screen = 'contacts');
                xabber.body.setScreen(screen, {right: 'contact_details', contact: this});
            }
        });


        xabber.ContactItemView = xabber.BasicView.extend({
            className: 'roster-contact list-item',

            _initialize: function (options) {
                this.account = this.model.account;
                this.$el.attr({'data-id': uuid(), 'data-jid': this.model.get('jid')});
                this.$('.jid').text(this.model.get('jid'));
                this.interval_last;
                this.updateName();
                this.updateStatus();
                this.updateAvatar();
                this.selectView();
                this.model.on("change:name", this.updateName, this);
                this.model.on("change:image", this.updateAvatar, this);
                this.model.on("change:status_updated", this.updateStatus, this);
                this.model.on("change:status_message", this.updateStatusMsg, this);
                this.model.on("change:last_seen", this.lastSeenUpdated, this);
                this.model.on("change:group_chat", this.updateGroupChat, this);
            },

            updateName: function () {
                this.$('.name').text(this.model.get('name'));
            },

            updateAvatar: function () {
                this.$('.circle-avatar').setAvatar(this.model.cached_image, this.avatar_size);
            },

            updateStatus: function () {
                this.$('.status').attr('data-status', this.model.get('status'));
                var group_text = 'Group chat';
                if (this.model.get('group_info')) {
                    group_text = this.model.get('group_info').members_num;
                    if (this.model.get('group_info').members_num > 1)
                        group_text += ' members';
                    else
                        group_text += ' member';
                }
                this.model.get('group_chat') ? this.$('.status-message').text(group_text) : this.$('.status-message').text(this.model.getStatusMessage());
                if ((this.model.get('status') == 'offline')&&(this.model.get('last_seen'))) {
                    var seconds = (moment.now() - this.model.get('last_seen'))/1000,
                        new_status = this.model.lastSeenNewFormat(seconds, this.model.get('last_seen'));
                    this.model.set({ status_message: new_status });
                }
            },

            selectView: function () {
                if (this.model.get('group_chat')) {
                    this.$('.private-chat').addClass('hidden');
                    this.$('.group_chat').removeClass('hidden');
                }
            },

            lastSeenUpdated: function () {
                if ((this.model.get('status') == 'offline')&&(this.model.get('last_seen'))&&(_.isUndefined(this.interval_last))) {
                    this.interval_last = setInterval(function() {
                        var seconds = (moment.now() - this.model.get('last_seen'))/1000,
                            new_status = this.model.lastSeenNewFormat(seconds, this.model.get('last_seen'));
                        this.model.set({ status_message: new_status });
                    }.bind(this), 60000);
                }
                else
                {
                    clearInterval(this.interval_last);
                }
            },

            updateGroupChat: function () {
                var is_group_chat = this.model.get('group_chat');
                this.$('.mdi-account-multiple').showIf(is_group_chat);
                this.$('.status').hideIf(is_group_chat);
                this.$('.group-chat-icon').showIf(is_group_chat);
                if (is_group_chat) {
                    this.$('.name').css('font-weight', '500');
                }
            },

            updateStatusMsg: function() {
                var group_text = 'Group chat';
                if (this.model.get('group_info')) {
                    group_text = this.model.get('group_info').members_num;
                    if (this.model.get('group_info').members_num > 1)
                        group_text += ' members';
                    else
                        group_text += ' member';
                }
                this.model.get('group_chat') ? this.$('.status-message').text(group_text) : this.$('.status-message').text(this.model.getStatusMessage());
            }
        });

        xabber.ContactItemRightView = xabber.ContactItemView.extend({
            template: templates.contact_right_item,
            avatar_size: constants.AVATAR_SIZES.CONTACT_RIGHT_ITEM,

            events: {
                "click": "clickOnItem",
                "mouseover": "showJid",
                "mouseleave": "hideJid",
            },

            showJid: function () {
                if (this.$('.name').text() !== this.model.get('jid')) {
                    this.$('.status-message').addClass('hidden');
                    this.$('.jid').removeClass('hidden');
                }
            },

            hideJid: function () {
                this.$('.jid').addClass('hidden');
                this.$('.status-message').removeClass('hidden');
            },

            clickOnItem: function () {
                this.model.trigger("open_chat", this.model);
            }
        });

        xabber.ContactItemLeftView = xabber.ContactItemView.extend({
            template: templates.contact_left_item,
            avatar_size: constants.AVATAR_SIZES.CONTACT_LEFT_ITEM,

            events: {
                "click": "clickOnItem"
            },

            __initialize: function () {
                this.updateDisplayStatus();
                this.updateBlockedState();
                this.updateMutedState();
                this.model.on("change:display", this.updateDisplayStatus, this);
                this.model.on("change:blocked", this.updateBlockedState, this);
                this.model.on("change:muted", this.updateMutedState, this);
                this.model.on("change:group_chat", this.updateGroupChat, this);
            },

            updateDisplayStatus: function () {
                this.$el.switchClass('active', this.model.get('display'));
            },

            updateBlockedState: function () {
                this.$el.switchClass('blocked', this.model.get('blocked'));
            },

            updateMutedState: function () {
                this.$('.muted-icon').showIf(this.model.get('muted'));
                this.updateCSS();
            },

            updateCSS: function () {
                if (this.$el.is(':visible')) {
                    var name_width = this.$('.name-wrap').width();
                    this.model.get('muted') && (name_width -= 24);
                    this.$('.name').css('max-width', name_width);
                }
            },

            clickOnItem: function () {
                this.model.showDetails();
            }
        });

        xabber.ContactResources = xabber.Resources.extend({
            initialize: function (models, options) {
                this.contact = options.contact;
                this.jid = options.contact.get('jid');
                this.connection = options.contact.account.connection;
                this.on("add change", this.onResourceUpdated, this);
                this.on("remove", this.onResourceRemoved, this);
            },

            onResourceUpdated: function (resource) {
                if (resource === this.first()) {
                    this.contact.set({
                        status_updated: moment.now(),
                        status: resource.get('status'),
                        status_message: resource.get('status_message')
                    });
                }
            },

            onResourceRemoved: function (resource) {
                var attrs = {status_updated: moment.now()};
                if (this.length) {
                    attrs.status = this.first().get('status');
                    attrs.status_message = this.first().get('status_message');
                } else {
                    attrs.status = 'offline';
                    attrs.status_message = '';
                }
                this.contact.set(attrs);
            }
        });

        xabber.ContactResourcesView = xabber.ResourcesView.extend({
            onResourceRemoved: function (resource) {
                this.removeChild(resource.get('resource'));
                this.$el.showIf(this.model.length);
                this.parent.updateScrollBar();
            },

            onReset: function () {
                this.removeChildren();
                this.$el.addClass('hidden');
                this.parent.updateScrollBar();
            },

            updatePosition: function (resource) {
                var view = this.child(resource.get('resource'));
                if (!view) return;
                view.$el.detach();
                var index = this.model.indexOf(resource);
                if (index === 0) {
                    this.$('.resources-wrap').prepend(view.$el);
                } else {
                    this.$('.resource-wrap').eq(index - 1).after(view.$el);
                }
                this.updateScrollBar();
            }
        });

        xabber.ContactVCardView = xabber.VCardView.extend({
            events: {
                "click .btn-vcard-refresh": "refresh"
            }
        });

        xabber.ContactDetailsView = xabber.BasicView.extend({
            className: 'details-panel contact-details-panel',
            template: templates.contact_details,
            ps_selector: '.panel-content',
            avatar_size: constants.AVATAR_SIZES.CONTACT_DETAILS,

            events: {
                "click .btn-escape": "openChat",
                "click .btn-chat": "openChat",
                "click .btn-add": "addContact",
                "click .btn-delete": "deleteContact",
                "click .btn-block": "blockContact",
                "click .btn-unblock": "unblockContact",
                "click .btn-auth-request": "requestAuthorization"
            },

            _initialize: function () {
                this.account = this.model.account;
                this.name_field = new xabber.ContactNameWidget({
                    el: this.$('.name-wrap')[0],
                    model: this.model
                });
                this.resources_view = this.addChild('resources',
                    xabber.ContactResourcesView, {model: this.model.resources,
                        el: this.$('.resources-block-wrap')[0]});
                this.vcard_view = this.addChild('vcard', xabber.ContactVCardView,
                    {model: this.model, el: this.$('.vcard')[0]});
                this.edit_groups_view = this.addChild('groups',
                    xabber.ContactEditGroupsView, {el: this.$('.groups-block-wrap')[0]});
                this.updateName();
                this.updateStatus();
                this.updateAvatar();
                this.updateButtons();
                this.model.on("change", this.update, this);
            },

            render: function (options) {
                this.$('.btn-escape').showIf(options.name === 'chats');
            },

            onChangedVisibility: function () {
                this.model.set('display', this.isVisible());
            },

            update: function () {
                var changed = this.model.changed;
                if (_.has(changed, 'name')) this.updateName();
                if (_.has(changed, 'image')) this.updateAvatar();
                if (_.has(changed, 'status_updated')) this.updateStatus();
                if (_.has(changed, 'status_message')) this.updateStatusMsg();
                if (_.has(changed, 'in_roster') || _.has(changed, 'blocked') ||
                    _.has(changed, 'subscription')) {
                    this.updateButtons();
                }
            },

            updateName: function () {
                this.$('.main-info .contact-name').text(this.model.get('name'));
                var vcard = this.model.get('vcard');
                if ((this.model.get('name') == vcard.nickname) || (this.model.get('name') == vcard.fullname) || (this.model.get('name') == (vcard.first_name + ' ' + vcard.last_name).trim()) || (this.model.get('name') == this.model.get('jid')))
                    this.$('.main-info .contact-name').addClass('name-is-custom');
                else
                    if (this.model.get('name') == this.model.get('roster_name'))
                        this.$('.main-info .contact-name').removeClass('name-is-custom');
            },

            updateStatus: function () {
                this.$('.status').attr('data-status', this.model.get('status'));
                this.$('.status-message').text(this.model.getStatusMessage());
            },

            updateStatusMsg: function () {
                this.$('.status-message').text(this.model.getStatusMessage());
            },

            updateAvatar: function () {
                var image = this.model.cached_image;
                this.$('.circle-avatar').setAvatar(image, this.avatar_size);
            },

            updateButtons: function () {
                var in_roster = this.model.get('in_roster'),
                    is_blocked = this.model.get('blocked'),
                    subscription = this.model.get('subscription');
                this.$('.btn-add').hideIf(in_roster);
                this.$('.btn-delete').showIf(in_roster);
                this.$('.btn-block').hideIf(is_blocked);
                this.$('.btn-unblock').showIf(is_blocked);
                this.$('.btn-auth-request').showIf(in_roster && !is_blocked &&
                    subscription !== 'both' && subscription !== 'to');
                this.$('.buttons-wrap button').addClass('btn-dark')
                    .filter(':not(.hidden)').first().removeClass('btn-dark');
            },

            openChat: function () {
                this.model.trigger("open_chat", this.model);
            },

            addContact: function () {
                xabber.add_contact_view.show({account: this.account, jid: this.model.get('jid')});
            },

            deleteContact: function (ev) {
                var contact = this.model;
                utils.dialogs.ask("Remove contact", "Do you want to remove "+
                    contact.get('name')+" from contacts?", null, { ok_button_text: 'remove'}).done(function (result) {
                    if (result) {
                        contact.removeFromRoster();
                        xabber.trigger("clear_search");
                    }
                });
            },

            blockContact: function (ev) {
                var contact = this.model;
                utils.dialogs.ask("Block contact", "Do you want to block "+
                    contact.get('name')+"?", null, { ok_button_text: 'block'}).done(function (result) {
                    if (result) {
                        contact.blockRequest();
                        xabber.trigger("clear_search");
                    }
                });
            },

            unblockContact: function (ev) {
                var contact = this.model;
                utils.dialogs.ask("Unblock contact", "Do you want to unblock "+
                    contact.get('name')+"?", null, { ok_button_text: 'unblock'}).done(function (result) {
                    if (result) {
                        contact.unblock();
                        xabber.trigger("clear_search");
                    }
                });
            },

            requestAuthorization: function () {
                this.model.pres('subscribe');
                this.openChat();
            }
        });

        xabber.EditBadgeView = xabber.BasicView.extend({
            className: 'modal edit-badge',
            template: templates.edit_badge,

            events: {
                "click .btn-cancel": "close",
                "click .btn-save": "saveNewBadge",
                "keydown .badge-text": "checkKey"
            },

            _initialize: function () {
                this.account = this.model.account;
                this.contact = this.model.contact;
                this.member = this.model.member;
                this.$el.openModal({
                    ready: function () {
                        this.updateScrollBar();
                        this.$el.find('.badge-text').text(this.member.badge);
                        this.$el.emojify('.badge-text', {emoji_size: 18});
                    }.bind(this),
                    complete: function () {
                        this.$el.detach();
                        this.data.set('visible', false);
                    }.bind(this)
                });
                var $insert_emoticon = this.$('.insert-emoticon'),
                    $emoji_panel_wrap = this.$('.emoticons-panel-wrap'),
                    $emoji_panel = this.$('.emoticons-panel'),
                    _timeout;

                _.each(Emoji.all, function (emoji) {
                    $('<div class="emoji-wrap"/>').html(
                        emoji.emojify({tag_name: 'div', emoji_size: 25})
                    ).appendTo($emoji_panel);
                });
                $emoji_panel.perfectScrollbar(
                    _.extend({theme: 'item-list'}, xabber.ps_settings));
                $insert_emoticon.hover(function (ev) {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    $emoji_panel_wrap.addClass('opened');
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }
                    $emoji_panel.perfectScrollbar('update');
                }.bind(this), function (ev) {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }
                    _timeout = setTimeout(function () {
                        if (!$emoji_panel_wrap.is(':hover')) {
                            $emoji_panel_wrap.removeClass('opened');
                        }
                    }, 800);
                }.bind(this));
                $emoji_panel_wrap.hover(null, function (ev) {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }
                    _timeout = setTimeout(function () {
                        $emoji_panel_wrap.removeClass('opened');
                    }, 200);
                }.bind(this));
                $emoji_panel_wrap.mousedown(function (ev) {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    if (ev.button) {
                        return;
                    }
                    var $target = $(ev.target).closest('.emoji-wrap').find('.emoji');
                    $target.length && this.typeEmoticon($target.data('emoji'));
                }.bind(this));
                this.$('.badge-text').focus();
            },

            close: function () {
                this.$el.closeModal({ complete: this.hide.bind(this) });
            },

            saveNewBadge: function () {
                var new_badge = _.escape(this.$('.badge-text').getTextFromRichTextarea().trim()),
                    iq = $iq({from: this.account.get('jid'), to: this.contact.get('jid'), type: 'set'})
                        .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#members', id: this.member.id})
                        .c('badge').t(new_badge);
                if (new_badge.length > 8) {
                    utils.dialogs.error("Badge can't be longer than 8 symbols");
                }
                else {
                    this.account.sendIQ(iq, function () {
                        this.model.member.badge = new_badge;
                        this.model.updateBadge();
                    }.bind(this));
                    this.close();
                }
            },

            typeEmoticon: function (emoji) {
                var emoji_node = emoji.emojify({tag_name: 'img'}),
                    $textarea = this.$('.badge-text');
                $textarea.focus();
                window.document.execCommand('insertHTML', false, emoji_node);
            },

            checkKey: function (ev) {
                if (ev.keyCode === constants.KEY_ENTER) {
                    ev.preventDefault();
                    this.saveNewBadge();
                }
            }

        });

        xabber.ShowRightsView = xabber.SearchView.extend({
            className: 'modal edit-rights',
            template: templates.permissions_and_restrictions,
            avatar_size: constants.AVATAR_SIZES.CHAT_ITEM,
            ps_selector: '.modal-content',

            events: {
                "click .btn-escape": "close",
                "click .clickable-field input": "changeRights",
                "click .btn-remove-user": "removeMember",
                "click .btn-block-user": "blockMember",
                "click .btn-save-user-rights": "saveRights",
                "click .nickname": "editNickname",
                "change .circle-avatar input": "changeAvatar",
                "click .btn-add-badge": "addBadge"
            },

            open: function (model, this_member) {
                this.account = model.account;
                this.contact = model.model;
                this.all_rights = model.all_rights;
                this.model = model;
                var $member_info_view = $(templates.group_member_item(this_member));
                this.$('.modal-header .member-info-item').html($member_info_view);
                this.updateMemberAvatar(this_member);
                this.member = this_member;
                $('<input title="Change avatar" type="file"/>').prependTo($member_info_view.find('.member-item .circle-avatar'));
                $member_info_view.find('.role-star').remove();
                this.renderAllRights();
                this.setActualRights();
                this.renderButtons();
                this.$el.openModal({
                    ready: function () {
                        this.updateScrollBar();
                    }.bind(this),
                    complete: function () {
                        this.$el.detach();
                        this.data.set('visible', false);
                    }.bind(this)
                });
                $('<input>').attr({
                    type: 'text',
                    id: 'edit-nickname'
                }).hide().prependTo(this.$('.member-info'));
                this.$('.member-info #edit-nickname').on("focusout", function () {
                    var new_nickname = this.$('.member-info #edit-nickname').val();
                    if (new_nickname == "")
                        new_nickname = this.member.nickname;
                    this.$('.member-info #edit-nickname').hide();
                    this.$('.member-info .nickname').text(new_nickname).show();
                    this.$('.member-info .badge').show();
                }.bind(this));
            },

            updateMemberAvatar: function (member) {
                member.image = Images.getDefaultAvatar(member.nickname || member.jid || member.id);
                var $avatar = (member.id) ? this.$('.list-item[data-id="'+ member.id +'"] .circle-avatar') : this.$('.list-item[data-jid="'+ member.jid +'"] .circle-avatar');
                $avatar.setAvatar(member.image, this.avatar_size);
                this.$('.list-item[data-id="'+ member.id +'"]').emojify('.badge', {emoji_size: 16});
                if (member.avatar) {
                    if (this.account.chat_settings.getHashAvatar(member.id) == member.avatar && (this.account.chat_settings.getB64Avatar(member.id))) {
                        $avatar.setAvatar(this.account.chat_settings.getB64Avatar(member.id), this.avatar_size);
                    }
                    else {
                        var node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + member.id;
                        this.contact.getAvatar(member.avatar, node, function (avatar) {
                            this.$('.list-item[data-id="'+ member.id +'"] .circle-avatar').setAvatar(avatar, this.avatar_size);
                        }.bind(this));
                    }
                }
                else {
                    if (this.account.chat_settings.getHashAvatar(member.id))
                        $avatar.setAvatar(this.account.chat_settings.getB64Avatar(member.id), this.avatar_size);
                }
            },

            renderButtons: function () {
                if ((this.member.jid == this.account.get('jid')) || (this.member.id == this.contact.my_info.id)) {
                    this.$('.btn-remove-user').hide();
                    this.$('.btn-block-user').hide();
                    this.$('.btn-save-user-rights').show();
                    this.$('.btn-add-badge').show();
                }
                else {
                    var change_rights = this.contact.my_rights.permissions.find(permission => permission === 'change-restriction'),
                        change_nickname = this.contact.my_rights.permissions.find(permission => permission === 'change-nickname');
                    this.$('.btn-save-user-rights').showIf(change_rights || change_nickname);

                    var change_badge = this.contact.my_rights.permissions.find(permission => permission === 'change-badge');
                    this.$('.btn-add-badge').showIf(change_badge);

                    var block_member = this.contact.my_rights.permissions.find(permission => permission === 'block-member');
                    this.$('.btn-block-user').showIf(block_member);

                    var remove_member = this.contact.my_rights.permissions.find(permission => permission === 'remove-member');
                    this.$('.btn-remove-user').showIf(remove_member);
                }
            },

            close: function () {
                this.$el.closeModal({ complete: this.hide.bind(this) });
            },

            changeAvatar: function (ev) {
                var field = ev.target;
                if (!field.files.length) {
                    return;
                }
                var file = field.files[0];
                field.value = '';
                if (file.size > constants.MAX_AVATAR_FILE_SIZE) {
                    utils.dialogs.error('File is too large');
                } else if (!file.type.startsWith('image')) {
                    utils.dialogs.error('Wrong image');
                }

                utils.images.getAvatarFromFile(file).done(function (image) {
                    if (image) {
                        file.base64 = image;
                        this.$('.circle-avatar').setAvatar(image, this.member_avatar_size);
                        this.contact.pubAvatar(file, ('#' + this.member.id), function (avatar_hash) {
                            this.account.chat_settings.updateCachedAvatars(this.member.id, avatar_hash, image);
                            this.model.$('.members-list-wrap .list-item[data-id="'+ this.member.id +'"] .circle-avatar').setAvatar(image, this.member_avatar_size);
                        }.bind(this));
                    }
                }.bind(this));
            },

            updateBadge: function () {
                this.$('.group-chat-members[data-id="' + this.member.id + '"] .badge').html(this.member.badge);
                this.$('.group-chat-members[data-id="' + this.member.id + '"]').emojify('.badge');
            },

            editNickname: function () {
                this.$('.member-info .nickname').hide();
                this.$('.member-info .badge').hide();
                    this.$('.member-info #edit-nickname').val(this.$('.member-info .nickname').text()).show().focus();
            },

            addBadge: function () {
                this.edit_badge_panel = new xabber.EditBadgeView({model: this});
            },

            removeMember: function () {
                var contact_jid = this.member.jid;
                if (contact_jid == this.account.get('jid')) {
                    this.contact.declineSubscription();
                    this.close();
                    return;
                }
                var jid = this.account.resources.connection.jid,
                    iq = $iq({from: jid, type: 'set', to: this.contact.get('jid')})
                        .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#members'})
                        .c('item', {id: this.member.id, role: 'none'});
                this.account.sendIQ(iq, function () {
                    this.close();
                    if (this.member_item)
                        this.member_item.remove();
                }.bind(this));
            },

            blockMember: function (ev) {
                var contact_id = this.member.id,
                    jid = this.account.resources.connection.jid,
                    iq = $iq({from: jid, type: 'set', to: this.contact.get('jid')})
                        .c('block', {xmlns: Strophe.NS.GROUP_CHAT + '#block'})
                        .c('id').t(contact_id);
                this.account.sendIQ(iq, function () {
                    this.close();
                    if (this.member_item)
                        this.member_item.remove();
                }.bind(this));
            },

            renderAllRights: function () {
                if (this.all_rights) {
                    this.all_rights.restrictions.each(function (idx, restriction) {
                        var name = $(restriction).attr('name'),
                            pretty_name = name[0].toUpperCase() + name.replace(/-/g, ' ').substr(1, name.length - 1),
                            restriction_item = $(templates.restriction_item({name: name, pretty_name: pretty_name}));
                        this.$('.dialog-restrictions-edit').append(restriction_item);
                        this.$('.right-item #' + name).prop('checked', false);
                    }.bind(this));
                    this.all_rights.permissions.each(function (idx, permission) {
                        var name = $(permission).attr('name'),
                            pretty_name = name[0].toUpperCase() + name.replace(/-/g, ' ').substr(1, name.length - 1),
                            permission_item = $(templates.permission_item({name: name, pretty_name: pretty_name}));
                        this.$('.dialog-permissions-edit').append(permission_item);
                        this.$('.right-item #' + name).prop('checked', false);
                    }.bind(this));
                }
            },

            setActualRights: function () {
                var $permissions = this.member.permissions, $restrictions = this.member.restrictions;
                if ($permissions)
                    $permissions.each(function(idx, permission) {
                        var permission_name = $(permission).attr('name');
                        this.$('.right-item #' + permission_name).prop('checked', true);
                        var expires_year = parseInt(moment($(permission).attr('expires')).format('YYYY')),
                            issued_at_year = parseInt(moment($(permission).attr('issued-at')).format('YYYY'));
                        if (!isNaN(expires_year) && !isNaN(issued_at_year)) {
                            if (expires_year - issued_at_year > 1)
                                this.$('.right-item.permission-'+ permission_name +' .permission-description').text('Indefinitely');
                            else
                                this.$('.right-item.permission-'+ permission_name +' .permission-description').text('Until ' + $(permission).attr('expires'));

                        }
                        else
                            this.$('.right-item.permission-'+ permission_name +' .permission-description').text('For ' + $(permission).attr('expires'));
                    }.bind(this));
                if ($restrictions)
                    $restrictions.each(function(idx, restriction) {
                        var restriction_name = $(restriction).attr('name');
                        this.$('.right-item #' + restriction_name).prop('checked', true);
                        var expires_year = parseInt(moment($(restriction).attr('expires')).format('YYYY')),
                            issued_at_year = parseInt(moment($(restriction).attr('issued-at')).format('YYYY'));
                        if (!isNaN(expires_year) && !isNaN(issued_at_year)) {
                            if (expires_year - issued_at_year > 1)
                                this.$('.right-item.restriction-'+ restriction_name +' .restriction-description').text('Indefinitely');
                            else
                                this.$('.right-item.restriction-'+ restriction_name +' .restriction-description').text('Until ' + $(restriction).attr('expires'));
                        }
                        else
                            this.$('.right-item.restriction-'+ restriction_name +' .restriction-description').text('For ' + $(restriction).attr('expires'));

                    }.bind(this));
            },

            close: function () {
                this.$el.closeModal({ complete: this.hide.bind(this) });
            },

            changeRights: function (ev) {
                var target = ev.target,
                    $right_item = $(target).closest('.right-item');
                if (!this.contact.my_rights.permissions.find(permission => permission === 'change-restriction')) {
                    ev.preventDefault();
                    return;
                }
                $right_item.addClass('changed');
            },

            saveRights: function () {
                var jid = this.account.resources.connection.jid,
                    nickname_value = this.$('.member-info .nickname').text();
                if (nickname_value != this.member.nickname) {
                    var iq_new_nickname = $iq({from: jid, type: 'set', to: this.contact.get('jid')})
                        .c('query', {xmlns: Strophe.NS.GROUP_CHAT + "#members", id: this.member.id})
                        .c('nickname').t(nickname_value);
                    this.account.sendIQ(iq_new_nickname, function () {
                        $(this.member_item).find('.nickname.one-line').text(nickname_value);
                    }.bind(this));
                }
                var iq = $iq({from: jid, type: 'set', to: this.contact.get('jid')})
                    .c('query', {xmlns: Strophe.NS.GROUP_CHAT + "#members"})
                    .c('item', {id: this.member.id}),
                    has_changes = false;
                this.$('.right-item').each(function(idx, right_item) {
                    if ($(right_item).hasClass('changed')) {
                        has_changes = true;
                        var $right_item = $(right_item),
                            right_type = $right_item.hasClass('restriction') ? 'restriction' : 'permission',
                            right_name = $right_item.find('.field-value input')[0].id;
                        if ($right_item.find('.field-value input:checked').val())
                            iq.c(right_type, {name: right_name, expires: 'never'}).up();
                        else
                            iq.c(right_type, {name: right_name, expires: 'none'}).up();
                    }
                }.bind(this));
                if (has_changes)
                    this.account.sendIQ(iq);
                this.close();
            }
        });

        xabber.GroupChatDetailsView = xabber.BasicView.extend({
            className: 'details-panel contact-details-panel groupchat-details-panel',
            template: templates.group_chat_details,
            ps_selector: '.panel-content',
            avatar_size: constants.AVATAR_SIZES.CONTACT_DETAILS,
            member_avatar_size: constants.AVATAR_SIZES.CHAT_ITEM,

            events: {
                "click .btn-escape": "openChat",
                "click .btn-chat": "openChat",
                "click .btn-join": "joinChat",
                "click .btn-delete": "deleteContact",
                "click .group-chat-members": "editMemberRights",
                "click .btn-group-info-edit": "updateGroupChatParams",
                "change .circle-avatar input": "changeAvatar",
                "click .invited-list": "setInvitedList",
                "click .chat-members-list": "setMembersList",
                "click .blocked-list": "setBlockedList",
                "click .revoke-invitation": "revokeInvitation",
                "click .unblock-user": "unblockUser"
            },

            _initialize: function () {
                this.account = this.model.account;
                this.members = [];
                this.name_field = new xabber.ContactNameWidget({
                    el: this.$('.name-wrap')[0],
                    model: this.model
                });
                this.model.my_rights = this.model.my_rights || {permissions: [], restrictions: []};
                this.edit_groups_view = this.addChild('groups',
                    xabber.ContactEditGroupsView, {el: this.$('.groups-block-wrap')[0]});
                this.group_info_view = this.addChild('group_info', xabber.GroupInfo,
                    {model: this.model, el: this.$('.groupchat-info')[0]});
                this.group_info_editor_view = this.addChild('group_info_editor', xabber.GroupInfoEdit,
                    {model: this.model, el: this.$('.groupchat-info')[0]});
                this.updateName();
                this.updateStatus();
                this.updateAvatar();
                this.getAllRights();
                this.model.on("change", this.update, this);
                this.$('.members-list-wrap').perfectScrollbar({theme: 'item-list'});
                this.$('.groups-wrap').perfectScrollbar({theme: 'item-list'});
            },

            render: function (options) {
                this.$('.btn-escape').showIf(options.name === 'chats');
                this.setMembersList();
                this.updateGroupInfo();
                this.$('.btn-delete').showIf(this.model.get('in_roster'));
                this.$('.btn-join').showIf(!this.model.get('in_roster'));
            },

            update: function () {
                var changed = this.model.changed;
                if (_.has(changed, 'name')) this.updateName();
                if (_.has(changed, 'group_info')) this.updateGroupInfo();
                if (_.has(changed, 'image')) this.updateAvatar();
                if (_.has(changed, 'status_updated')) this.updateStatus();
                if (_.has(changed, 'status_message')) this.updateStatusMsg();
            },

            updateName: function () {
                this.$('.main-info .contact-name').text(this.model.get('name'));
                var group_info = this.model.get('group_info');
                if (this.model.get('name') == this.model.get('jid'))
                    this.$('.main-info .contact-name').addClass('name-is-custom');
                else
                if (this.model.get('name') == this.model.get('roster_name'))
                    this.$('.main-info .contact-name').removeClass('name-is-custom');
            },

            joinChat: function () {
                this.model.invitation.joinGroupChat();
            },

            updateGroupInfo: function () {
                this.group_info_view.render();
            },

            updateStatus: function () {
                this.$('.status').attr('data-status', this.model.get('status'));
                this.$('.status-message').text(this.model.getStatusMessage());
            },

            updateStatusMsg: function () {
                var group_text = 'Group chat';
                if (this.model.get('group_info')) {
                    group_text = this.model.get('group_info').members_num;
                    if (this.model.get('group_info').members_num > 1)
                        group_text += ' members';
                    else
                        group_text += ' member';
                }
                this.$('.status-message').text(group_text);
            },

            updateAvatar: function () {
                var image = this.model.cached_image;
                this.$('.circle-avatar').setAvatar(image, this.avatar_size);
            },

            openChat: function () {
                this.model.trigger("open_chat", this.model);
            },

            revokeInvitation: function (ev) {
                var $member_item = $(ev.target).closest('.invited-user'),
                    member_jid = $member_item.data('jid'),
                    iq = $iq({from: this.account.get('jid'), to: this.model.get('jid'), type: 'set'})
                        .c('revoke', {xmlns: Strophe.NS.GROUP_CHAT + '#invite'})
                        .c('jid').t(member_jid);
                this.account.sendIQ(iq, function () {
                    $member_item.remove();
                }.bind(this));
            },

            unblockUser: function (ev) {
                var $member_item = $(ev.target).closest('.blocked-user'),
                    member_jid = $member_item.data('jid'),
                    iq = $iq({from: this.account.get('jid'), type: 'set', to: this.model.get('jid') })
                        .c('unblock', {xmlns: Strophe.NS.GROUP_CHAT + '#block' })
                        .c('jid').t(member_jid);
                this.account.sendIQ(iq, function () {
                    $member_item.remove();
                }.bind(this));
            },

            clearMembersList: function () {
                this.$('.preloader-wrapper').remove();
                this.$('.members-list-wrap .owners').html('');
                this.$('.members-list-wrap .admins').html('');
                this.$('.members-list-wrap .members').html('');
            },

            getMembersList: function (list_name) {
                var iq = $iq({
                    from: this.account.get('jid'),
                    type: 'get',
                    to: this.model.get('jid')
                });
                if (list_name == 'invited') {
                    iq.c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#invite'});
                }
                if (list_name == 'blocked') {
                    iq.c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#block'});
                }
                this.account.sendIQ(iq, function (iq) {
                        this.clearMembersList();
                        $(iq).find('query').find('user').each(function (idx, item) {
                            var member = { jid: $(item).attr('jid'), list_name: list_name};
                            var $item_view = $(templates.invited_member_item(member));
                            var view = this.child(member.id);
                            if (view) {
                                view.$el.detach();
                            }
                            else {
                                $item_view.appendTo(this.$('.members-list-wrap .members'));
                                this.updateMemberAvatar(member);
                            }
                        }.bind(this));
                        if (!$(iq).find('query').find('user').length) {
                            this.$('.members-list-wrap .members').html($('<p class="errors"/>'));
                            this.$('.members-list-wrap .members .errors').text('List is empty');
                        }
                    }.bind(this),
                    function (err) {
                        this.clearMembersList();
                        this.$('.members-list-wrap .members').html($('<p class="errors"/>'));
                        this.$('.members-list-wrap .members .errors').text($(err).find('text').text());
                    }.bind(this));
            },

            setActiveList: function (list_name) {
                this.$('.active-list').addClass('hidden-list').removeClass('active-list');
                this.$('.' + list_name + '-list').addClass('active-list').removeClass('hidden-list');
            },

            setInvitedList: function () {
                var list_name = 'invited';
                this.setActiveList(list_name);
                this.getMembersList(list_name);
            },

            setMembersList: function () {
                this.setActiveList('chat-members');
                this.getGroupChatMembers();
            },

            setBlockedList: function () {
                var list_name = 'blocked';
                this.setActiveList(list_name);
                this.getMembersList(list_name);
            },

            changeAvatar: function (ev) {
                var field = ev.target;
                if (!field.files.length) {
                    return;
                }
                var file = field.files[0];
                field.value = '';
                if (file.size > constants.MAX_AVATAR_FILE_SIZE) {
                    utils.dialogs.error('File is too large');
                } else if (!file.type.startsWith('image')) {
                    utils.dialogs.error('Wrong image');
                }

                utils.images.getAvatarFromFile(file).done(function (image) {
                    if (image) {
                        file.base64 = image;
                        this.model.pubAvatar(file, "");
                    }
                }.bind(this));
            },

            /*pubAvatar: function (image, member_id, callback) {
                var avatar_id = sha1(image.base64),
                    iq_pub = $iq({from: this.account.get('jid'), type: 'set', to: this.model.get('jid') })
                        .c('pubsub', {xmlns: Strophe.NS.PUBSUB}),
                    iq_sub = $iq({from: this.account.get('jid'), type: 'set', to: this.model.get('jid') })
                        .c('pubsub', {xmlns: Strophe.NS.PUBSUB});

                if (member_id) {
                    this.rights_panel.$('.circle-avatar').setAvatar(image.base64, this.member_avatar_size);
                }
                else {
                    this.$('.main-info .circle-avatar').setAvatar(image.base64, this.avatar_size);
                }

                if (member_id) {
                     iq_pub.c('publish', {node: Strophe.NS.PUBSUB_AVATAR_DATA + '#' + member_id});
                     iq_sub.c('publish', {node: Strophe.NS.PUBSUB_AVATAR_METADATA + '#' + member_id});
                 }
                 else {
                     iq_pub.c('publish', {node: Strophe.NS.PUBSUB_AVATAR_DATA});
                     iq_sub.c('publish', {node: Strophe.NS.PUBSUB_AVATAR_METADATA});
                 }

                 iq_pub.c('item', {id: avatar_id})
                     .c('data', {xmlns: Strophe.NS.PUBSUB_AVATAR_DATA}).t(image.base64);
                 iq_sub.c('item', {id: avatar_id})
                     .c('metadata', {xmlns: Strophe.NS.PUBSUB_AVATAR_METADATA})
                     .c('info', {bytes: image.size, id: avatar_id, type: image.type});
                 this.account.sendIQ(iq_pub, function () {
                     this.account.sendIQ(iq_sub, function () {
                         callback && callback(avatar_id);
                     }.bind(this));
                 }.bind(this));
            },*/

            getAllRights: function () {
                var iq_get_rights = iq = $iq({from: this.account.get('jid'), type: 'get', to: this.model.get('jid') })
                    .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#rights' });
                this.account.sendIQ(iq_get_rights, function(iq_all_rights) {
                    var all_permissions = $(iq_all_rights).find('permission'),
                        all_restrictions = $(iq_all_rights).find('restriction');
                    this.all_rights = {permissions: all_permissions, restrictions: all_restrictions};
                }.bind(this));
            },

            updateGroupChatParams: function () {
                if (this.model.my_rights.permissions.find(permission => permission === 'change-chat'))
                    this.group_info_editor_view.renderEditor();
            },

            getGroupChatMembers: function () {
                this.members = [];
                var iq = $iq({from: this.account.get('jid'), type: 'get', to: this.model.get('jid') })
                        .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#members' });
                this.account.sendIQ(iq, function (iq) {
                    this.clearMembersList();
                    $(iq).find('query').find('item').each(function (idx, item) {
                        var member = this.getMemberInfo(item);
                        this.members.push(member);
                        var $item_view = this.addMemberItem(member);
                        var view = this.child(member.id);
                        if (view) {
                            view.$el.detach();
                        }
                        else {
                            if (member.jid == this.account.get('jid')) {
                                $item_view.prependTo(this.$('.members-list-wrap .owners'));
                                $item_view.find('.jid.one-line').html(member.jid + '<span class="myself-member-item">(this is you)</span>');
                                $item_view.find('.myself-member-item').css('color', this.account.settings.get('color'));
                            }
                            else if (member.role == 'Admin')
                                $item_view.appendTo(this.$('.members-list-wrap .admins'));
                            else if (member.role == 'Member')
                                $item_view.appendTo(this.$('.members-list-wrap .members'));
                            else if (member.role == 'Owner')
                                $item_view.appendTo(this.$('.members-list-wrap .owners'));
                            this.updateMemberAvatar(member);
                        }
                    }.bind(this));
                }.bind(this));
            },

            getMemberInfo: function (item) {
                var member_jid = $(item).find('jid').text(), member_role, member = {},
                    member_nickname = $(item).find('nickname').text(),
                    member_id = $(item).find('id').text(),
                    member_badge = $(item).find('badge').text(),
                    member_present = $(item).find('present').text(),
                    member_photo = $(item).find('metadata[xmlns="' + Strophe.NS.PUBSUB_AVATAR_METADATA + '"]').find('info').attr('id'),
                    permissions = $(item).find('permission'),
                    restrictions = $(item).find('restriction');
                if (permissions.length < 1)
                    member_role = 'Member';
                else
                {
                    $(permissions).each(function(perm_idx, permission) {
                        if ($(permission).attr('name') == 'owner')
                            member_role = 'Owner';
                    }.bind(this));
                }
                member.jid = member_jid;
                member.id = member_id;
                member.avatar = member_photo;
                member.nickname = member_nickname;
                member.badge = member_badge;
                member.present = member_present;
                member.role = member_role || 'Admin';
                member.permissions = (permissions.length > 0) ? permissions : undefined;
                member.restrictions = (restrictions.length > 0) ? restrictions : undefined;

                return member;
            },

            editMemberRights: function (ev) {
                var member_item = $(ev.target).closest('.group-chat-members'),
                    iq = $iq({from: this.account.get('jid'), type: 'get', to: this.model.get('jid') })
                    .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#members', id: member_item.attr('data-id')});

                this.account.sendIQ(iq, function (iq) {
                    var this_member = this.getMemberInfo($(iq).find('item')),
                        member_index = this.members.indexOf(this.members.find(member => member.id === member_item.attr('data-id')));
                    if (member_index != -1) {
                        this.members.splice(member_index, 1);
                        this.members.push(this_member);
                    }
                    this.rights_panel = new xabber.ShowRightsView();
                    this.rights_panel.open(this, this_member);
                }.bind(this));
            },

            addMemberItem: function (item) {
                return $(templates.group_member_item(item));
            },

            updateMemberAvatar: function (member) {
                member.image = Images.getDefaultAvatar(member.nickname || member.jid || member.id);
                var $avatar = (member.id) ? this.$('.list-item[data-id="'+ member.id +'"] .circle-avatar') : this.$('.list-item[data-jid="'+ member.jid +'"] .circle-avatar');
                $avatar.setAvatar(member.image, this.member_avatar_size);
                this.$('.list-item[data-id="'+ member.id +'"]').emojify('.badge', {emoji_size: 16});
                if (member.avatar) {
                    if (this.account.chat_settings.getHashAvatar(member.id) == member.avatar && (this.account.chat_settings.getB64Avatar(member.id))) {
                        $avatar.setAvatar(this.account.chat_settings.getB64Avatar(member.id), this.member_avatar_size);
                    }
                    else {
                        var node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + member.id;
                        this.model.getAvatar(member.avatar, node, function (avatar) {
                            this.$('.list-item[data-id="'+ member.id +'"] .circle-avatar').setAvatar(avatar, this.member_avatar_size);
                        }.bind(this));
                    }
                }
                else {
                    if (this.account.chat_settings.getHashAvatar(member.id))
                        $avatar.setAvatar(this.account.chat_settings.getB64Avatar(member.id), this.member_avatar_size);
                }

            },

            onChangedVisibility: function () {
                this.model.set('display', this.isVisible());
            },

            addContact: function () {
                xabber.add_contact_view.show({account: this.account, jid: this.model.get('jid')});
            },

            deleteContact: function (ev) {
                var contact = this.model;
                utils.dialogs.ask("Leave groupchat", "Do you want to leave groupchat "+
                    contact.get('name')+"?", null, { ok_button_text: 'leave'}).done(function (result) {
                    if (result) {
                        contact.removeFromRoster();
                        xabber.trigger("clear_search");
                        this.openChat();
                    }
                }.bind(this));
            }
        });

        xabber.GroupInfo = xabber.BasicView.extend({
            template: templates.group_info,

            _initialize: function () {
                this.model.on("change: name", this.updateName, this);
                this.model.on("change: group_info", this.update, this);
            },

            render: function (options) {
                this.$el.html(this.template());
                this.update();
                this.renderButtons();
            },


            renderButtons: function () {
                var change_chat =  this.model.my_rights.permissions.find(permission => permission === 'change-chat') ? true : false;
                this.$el.find('.btn-group-info-edit').showIf(change_chat);
            },

            updateName: function () {
                this.$('.name-info-wrap').find('.name').find('.value').text(this.model.get('name'));
            },

            update: function () {
                var $group_info_view, info = this.model.get('group_info');
                $group_info_view = this.$('.jid-info-wrap').showIf(info.jid);
                $group_info_view.find('.jabber-id').find('.value').text(info.jid);

                $group_info_view = this.$('.name-info-wrap').showIf(info.name);
                $group_info_view.find('.name').find('.value').text(info.name);

                $group_info_view = this.$('.description-info-wrap').showIf(info.description);
                $group_info_view.find('.description').find('.value').text(info.description);

                var value =  info.model[0].toUpperCase() + info.model.substr(1, info.model.length - 1);
                $group_info_view = this.$('.model-info-wrap').showIf(info.model);
                $group_info_view.find('.model').find('.value').text(value);

                value = info.anonymous == 'true' ? 'Yes' : 'No';
                $group_info_view = this.$('.anonymous-info-wrap').showIf(info.anonymous);
                $group_info_view.find('.anonymous').find('.value').text(value);

                value = info.searchable == 'true' ? 'Yes' : 'No';
                $group_info_view = this.$('.searchable-info-wrap').showIf(info.searchable);
                $group_info_view.find('.searchable').find('.value').text(value);
            }
        });

        xabber.GroupInfoEdit = xabber.BasicView.extend({
            template: templates.group_info_edit,
            events: {
                "click .btn-group-info-save": "saveChanges",
                "click .clickable-field input": "setDefaultRestrictions",
                "change #default_restriction_expires": "changeExpiresTime"
            },

            _initialize: function () {
                this.account = this.model.account;
                this.contact = this.model;
            },

            renderEditor: function (options) {
                this.actual_default_restrictions = [];
                this.new_default_restrictions = [];
                this.$el.html(this.template());
                this.update();
                this.showDefaultRestrictions();
            },

            saveChanges: function() {
                var $group_info_view, info = this.model.get('group_info'), jid = this.account.get('jid'), hasChanges = false;

                $group_info_view = this.$('.name-info-wrap');
                var new_name = $group_info_view.find('.name').find('.value input').val();

                $group_info_view = this.$('.description-info-wrap');
                var new_description = $group_info_view.find('.description').find('.value input').val();

                $group_info_view = this.$('.searchable-info-wrap');
                var new_searchable = ($group_info_view.find('.searchable').find('.field-value input:checked').length > 0).toString();

                $group_info_view = this.$('.model-info-wrap');
                var new_model = $group_info_view.find('#new_chat_model').val();

                var iq = $iq({from: jid, type: 'set', to: this.contact.get('jid')})
                    .c('update', {xmlns: Strophe.NS.GROUP_CHAT});
                if (info.name != new_name) {
                    hasChanges = true;
                    iq.c('name').t(new_name).up();
                }
                if (info.description != new_description) {
                    hasChanges = true;
                    iq.c('description').t(new_description).up();
                }
                if (info.searchable != new_searchable) {
                    hasChanges = true;
                    iq.c('searchable').t(new_searchable).up();
                }
                if (info.model != new_model) {
                    hasChanges = true;
                    iq.c('model').t(new_model).up();
                }
                if (hasChanges)
                    this.account.sendIQ(iq);


                var iq_change_default_rights = $iq({from: jid, to: this.contact.get('jid'), type: 'set'})
                    .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#rights'}),
                    has_new_default_restrictions = false;
                this.$('.edit-default-restrictions .right-item').each(function (idx, item) {
                    var $item = $(item),
                        restriction_name = $item.find('input').attr('id'),
                        restriction_expires = $item.find('input').attr('class');
                    if (!this.actual_default_restrictions.find(restriction => ((restriction.name == restriction_name) && (restriction.expires == restriction_expires)))) {
                        if (($item.find('input').prop('checked'))) {
                            iq_change_default_rights.c('restriction', {
                                name: restriction_name,
                                expires: restriction_expires
                            }).up();
                            has_new_default_restrictions = true;
                        }
                        else if (this.actual_default_restrictions.find(restriction => restriction.name == restriction_name)) {
                            iq_change_default_rights.c('restriction', {name: restriction_name, expires: 'none'}).up();
                            has_new_default_restrictions = true;
                        }
                    }
                }.bind(this));
                if (has_new_default_restrictions)
                    this.account.sendIQ(iq_change_default_rights);
                this.model.details_view.group_info_view.render();
            },

            update: function () {
                var $group_info_view, info = this.model.get('group_info');
                $group_info_view = this.$('.jid-info-wrap');
                $group_info_view.find('.jabber-id').find('.value').text(info.jid);

                $group_info_view = this.$('.name-info-wrap');
                $group_info_view.find('.name').find('.value input').val(info.name);

                $group_info_view = this.$('.description-info-wrap');
                $group_info_view.find('.description').find('.value input').val(info.description);

                $group_info_view = this.$('.model-info-wrap');
                $group_info_view.find('#new_chat_model').find('option[value="' + info.model +'"]').attr('selected', true);

                if (info.anonymous === 'true') {
                    $group_info_view = this.$('.anonymous-info-wrap');
                    $group_info_view.find('.anonymous').find('.field-value input').click();
                }

                if (info.searchable === 'true') {
                    $group_info_view = this.$('.searchable-info-wrap');
                    $group_info_view.find('.searchable').find('.field-value input').click();
                }
            },

            showDefaultRestrictions: function () {
                var iq_get_rights = iq = $iq({from: this.account.get('jid'), type: 'get', to: this.contact.get('jid') })
                    .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#rights' });
                this.account.sendIQ(iq_get_rights, function(iq_all_rights) {
                    var all_permissions = $(iq_all_rights).find('permission'),
                        all_restrictions = $(iq_all_rights).find('restriction');
                    this.model.details_view.all_rights = {permissions: all_permissions, restrictions: all_restrictions};
                    $('<div/>', {class: 'edit-default-restrictions'}).insertAfter(this.$('.group-info-editor'));
                    this.$('.edit-default-restrictions').append($('<div/>', {class: 'default-restrictions-header'}).text('Default restrictions'));
                    this.model.details_view.all_rights.restrictions.each(function (idx, restriction) {
                        var name = $(restriction).attr('name'),
                            expires_restriction = $(restriction).attr('expires'),
                            pretty_name = name[0].toUpperCase() + name.replace(/-/g, ' ').substr(1, name.length - 1),
                            restriction_item = $(templates.restriction_item({name: name, pretty_name: pretty_name}));
                        this.actual_default_restrictions.push({ name: name, expires: expires_restriction});
                        this.$('.edit-default-restrictions').append(restriction_item);
                        if (expires_restriction) {
                            this.$('.right-item #' + name).prop('checked', true).addClass(expires_restriction);
                            if (expires_restriction == 'never')
                                this.$('.right-item.restriction-' + name + ' .restriction-description').text('Indefinitely');
                            else
                                this.$('.right-item.restriction-' + name + ' .restriction-description').text('For ' + expires_restriction);
                        }
                        else
                            this.$('.right-item #' + name).prop('checked', false);
                    }.bind(this));
                }.bind(this));
            },

            setDefaultRestrictions: function (ev) {
                var $restriction_item = $(ev.target).closest('.right-item');
                if ($restriction_item.find('input').prop('checked')) {
                    this.$('#default_restriction_expires').remove();
                    var $select_expires_time = $('<select size="1" id="default_restriction_expires" name="expires_time">' +
                        '<option value="5 minutes">5 minutes</option><option value="15 minutes">15 minutes</option>' +
                        '<option value="30 minutes">30 minutes</option><option value="1 hour">1 hour</option>' +
                        '<option value="1 day">1 day</option><option value="1 month">1 month</option><option value="never">always</option>' +
                        '</select>');
                    $select_expires_time.insertAfter($restriction_item);
                    var new_expire_time = $select_expires_time.val();
                    $restriction_item.find('.restriction-description').text('For ' + new_expire_time);
                    $restriction_item.find('input').removeClass().addClass(new_expire_time);
                }
                else {
                    if ($restriction_item.next().attr('id') == 'default_restriction_expires')
                        $restriction_item.next().remove();
                    $restriction_item.find('.restriction-description').text('Not able');
                    $restriction_item.find('input').removeClass();
                }
            },

            changeExpiresTime: function (ev) {
                var expire_time_item = $(ev.target),
                    new_expire_time = expire_time_item.val(),
                    $restriction_item = expire_time_item.prev();
                if (expire_time_item.val() == 'never')
                    $restriction_item .find('.restriction-description').text('Indefinitely');
                else
                    $restriction_item .find('.restriction-description').text('For ' + new_expire_time);
                $restriction_item .find('input').removeClass().addClass(new_expire_time);
                expire_time_item.remove();
            }
        });

        xabber.ContactInvitationView = xabber.BasicView.extend({
            className: 'details-panel contact-details-panel invitation',
            template: templates.group_chat_invitation,
            ps_selector: '.panel-content',
            avatar_size: constants.AVATAR_SIZES.CONTACT_DETAILS,

            events: {
                "click .btn-chat": "openChat",
                "click .btn-accept": "addContact",
                "click .btn-join": "joinGroupChat",
                "click .btn-decline": "declineContact",
                "click .btn-block": "blockContact",
                "click .btn-escape": "closeInvitationView"
            },

            _initialize: function () {
                this.account = this.model.account;
                this.timestamp = null;
                this.name_field = this.model.get('name');
                this.updateName();
                this.updateStatus();
                this.updateAvatar();
                this.$('.invite-msg .invite-msg-text')
                    .text('User requests permission to add you to his contact list. If you accept, '+ this.model.get('jid') + ' will also be added to ' +  this.account.get('jid') + ' contacts');
                this.model.on("change", this.update, this);
                this.on("change: invite_message", this.onChangedInviteMessage, this);
            },

            render: function (options) {
                this.$('.btn-escape').showIf(!this.model.get('group_chat'));
            },

            onChangedVisibility: function () {
                if (this.isVisible()) {
                    this.model.set({display: true, active: true});
                } else {
                    this.model.set({display: false});
                }
            },

            update: function () {
                var changed = this.model.changed;
                if (_.has(changed, 'name')) this.updateName();
                if (_.has(changed, 'image')) this.updateAvatar();
                if (_.has(changed, 'status_updated')) this.updateStatus();
                if (_.has(changed, 'group_chat')) this.updateGroupChat();
            },

            updateName: function () {
                this.$('.main-info  .name-wrap').text(this.model.get('name'));
                if (this.model.get('name-wrap') == this.model.get('jid')) {
                    this.$('.main-info .name-wrap').addClass('name-is-jid');
                    this.$('.main-info  .jid').text('');
                }
                else {
                    this.$('.main-info .name-wrap').removeClass('name-is-jid');
                    this.$('.main-info  .jid').text(this.model.get('jid'));
                }
            },

            updateStatus: function () {
                this.$('.status').attr('data-status', this.model.get('status'));
                this.$('.status-message').text(this.model.getStatusMessage());
            },

            updateAvatar: function () {
                var image = this.model.cached_image;
                this.$('.circle-avatar').setAvatar(image, this.avatar_size);
            },

            updateGroupChat: function () {
                this.$('.buttons-wrap .btn-accept').hideIf(this.model.get('group_chat'));
                this.$('.buttons-wrap .btn-join').showIf(this.model.get('group_chat'));
                if (this.model.get('group_chat')) {
                    this.updateInviteMsg('User invites you to join group chat. If you accept, ' + this.account.get('jid') + ' username shall be visible to groupchat members');
                }
            },

            updateInviteMsg: function (msg) {
                this.$('.invite-msg .invite-msg-text').text(msg);
            },

            openChat: function () {
                this.model.set('in_roster', true);
                this.model.trigger("open_chat", this.model);
            },

            addContact: function () {
                var contact = this.model;
                contact.acceptRequest();
                this.changeInviteStatus();
                contact.trigger('remove_invite', contact);
                contact.showDetails('chats');
            },

            blockInvitation: function () {
                var iq_unblocking = $iq({type: 'set'}).c('unblock', {xmlns: Strophe.NS.BLOCKING})
                    .c('item', {jid: this.model.get('jid')}),
                iq_blocking = $iq({type: 'set'}).c('block', {xmlns: Strophe.NS.BLOCKING})
                    .c('item', {jid: this.model.get('jid') + '/' + this.timestamp});
                this.account.sendIQ(iq_unblocking, function () {
                    this.account.sendIQ(iq_blocking);
                }.bind(this));
            },

            changeInviteStatus: function() {
                var contact = this.model;
                var chat = this.account.chats.get(contact.hash_id);
                chat.set('is_accepted', true);
                chat.item_view.content.readMessages();
                var invites = chat.item_view.content.$('.auth-request');
                if (invites.length > 0) {
                    invites.each(function (idx, item) {
                        var msg = chat.messages.get(item.dataset.msgid);
                        msg.set('is_accepted', true);
                    }.bind(this));
                }
            },

            joinGroupChat: function () {
                var contact = this.model;
                contact.acceptRequest();
                contact.acceptGroupRequest();
                this.changeInviteStatus();
                contact.set('in_roster', true);
                this.blockInvitation();
                contact.trigger('remove_invite', contact);
                this.openChat();
            },

            declineContact: function (ev) {
                var contact = this.model;
                this.changeInviteStatus();
                contact.declineRequest();
                this.blockInvitation();
                contact.trigger('remove_invite', contact);
                var declined_chat =  xabber.chats_view.active_chat;
                declined_chat.model.set('active', false);
                declined_chat.content.head.closeChat();
                xabber.body.setScreen('all-chats', {right: null});
            },

            closeInvitationView: function () {
                this.changeInviteStatus();
                this.openChat();
            },

            blockContact: function (ev) {
                var contact = this.model;
                this.changeInviteStatus();
                utils.dialogs.ask("Block contact", "Do you want to block "+
                    contact.get('name')+"?", null, { ok_button_text: 'block'}).done(function (result) {
                    if (result) {
                        contact.trigger('remove_invite', contact);
                        contact.block();
                        xabber.trigger("clear_search");
                    }
                })
                if (contact.get('group_chat'))
                    this.blockInvitation();
                this.openChat();
            }
        });

        xabber.ContactNameWidget = xabber.InputWidget.extend({
            field_name: 'contact-name',
            placeholder: 'Set contact name',
            model_field: 'name',

            setValue: function (value) {
                this.model.pushInRoster({name: value});
            }
        });

        xabber.ContactEditGroupsView = xabber.BasicView.extend({

            events: {
                'click .existing-group-field label': 'editGroup',
                'change .new-group-name input': 'checkNewGroup',
                'keyup .new-group-name input': 'checkNewGroup',
                'click .new-group-checkbox': 'addNewGroup'
            },

            _initialize: function (options) {
                this.account = this.parent.account;
                this.model = this.parent.model;
                this.model.on("change:in_roster update_groups", this.render, this);
            },

            render: function () {
                if (this.model.get('in_roster')) {
                    var groups = _.clone(this.model.get('groups')),
                        all_groups = _.map(this.account.groups.notSpecial(), function (group) {
                            var name = group.get('name');
                            return {name: name, checked: _.contains(groups, name), id: uuid()};
                        });
                    this.$('.groups').html(templates.groups_checkbox_list({
                        groups: all_groups
                    })).appendTo(this.$('.groups-wrap'));
                }
                this.$el.showIf(this.model.get('in_roster'));
                this.parent.updateScrollBar();
            },

            editGroup: function (ev) {
                var $target = $(ev.target),
                    $input = $target.siblings('input'),
                    checked = !$input.prop('checked'),
                    group_name = $input.attr('data-groupname');
                groups = _.clone(this.model.get('groups')),
                    idx = groups.indexOf(group_name);
                $input.prop('checked', checked);
                if (checked) {
                    groups.push(group_name);
                } else if (idx >= 0) {
                    groups.splice(idx, 1);
                }
                this.model.pushInRoster({groups: groups});
            },

            checkNewGroup: function (ev) {
                var name = $(ev.target).val(),
                    $checkbox = this.$('.new-group-checkbox');
                $checkbox.showIf(name && !this.account.groups.get(name));
            },

            addNewGroup: function (ev) {
                var $input = this.$('.new-group-name input'),
                    name = $input.val(),
                    groups = _.clone(this.model.get('groups')),
                    idx = groups.indexOf(name);
                if (idx < 0) {
                    groups.push(name);
                }
                this.model.pushInRoster({groups: groups});
            }
        });

        xabber.ContactsBase = Backbone.Collection.extend({
            model: xabber.Contact
        });

        xabber.GroupContacts = xabber.ContactsBase.extend({
            initialize: function (models, options) {
                this.group = options.group;
                this.on("change", this.onContactChanged, this);
            },

            comparator: function (contact1, contact2) {
                if (xabber.settings.roster.sorting === 'online-first') {
                    var s1 = contact1.get('status'),
                        s2 = contact2.get('status'),
                        sw1 = constants.STATUS_WEIGHTS[s1],
                        sw2 = constants.STATUS_WEIGHTS[s2],
                        sw1_offline = sw1 >= constants.STATUS_WEIGHTS.offline,
                        sw2_offline = sw2 >= constants.STATUS_WEIGHTS.offline;
                    if (sw1_offline ^ sw2_offline) {
                        return sw1_offline ? 1 : -1;
                    }
                }
                var name1, name2;
                name1 = contact1.get('name').toLowerCase();
                name2 = contact2.get('name').toLowerCase();
                return name1 < name2 ? -1 : (name1 > name2 ? 1 : 0);
            },

            onContactChanged: function (contact) {
                var changed = contact.changed
                if (_.has(changed, 'name') || _.has(changed, 'status_updated')) {
                    this.sort();
                    this.trigger('update_contact_item', contact);
                }
            }
        });

        xabber.Group = Backbone.Model.extend({
            defaults: {
                counter: {all: 0, online: 0}
            },

            initialize: function (attrs, options) {
                this.account = options.account;
                attrs.name || (attrs.name = attrs.id);
                this.set(attrs);
                this._settings = this.account.groups_settings.get(attrs.name);
                if (!this._settings) {
                    this._settings = this.account.groups_settings.create({name: attrs.name});
                }
                this.settings = this._settings.attributes;
                this.contacts = new xabber.GroupContacts(null, {group: this});
                this.settings_view = new xabber.GroupSettingsView({model: this});
                this.contacts.on("add update_contact_item", this.updateCounter, this);
                this.contacts.on("destroy", this.onContactRemoved, this);
                xabber._roster_settings.on("change", this.onChangedRosterSettings, this);
            },

            isSpecial: function () {
                return _.isNumber(this.get('id'));
            },

            updateCounter: function () {
                var all = this.contacts.length,
                    online = all - this.contacts.where({status: 'offline'}).length;
                this.set('counter', {all: all, online: online});
            },

            renameGroup: function (new_name) {
                var name = this.get('name'),
                    attrs = _.clone(this.settings);
                attrs.name = new_name;
                this._settings.destroy();
                this._settings = this.account.groups_settings.create(attrs);
                this.settings = this._settings.attributes;
                this.set({id: new_name, name: new_name});
                this.trigger('rename', this, name);
                _.each(_.clone(this.contacts.models), function (contact) {
                    var groups = _.clone(contact.get('groups')),
                        index = groups.indexOf(name);
                    if (index >= 0) {
                        groups.splice(index, 1);
                    }
                    index = groups.indexOf(new_name);
                    if (index < 0) {
                        groups.push(new_name);
                    }
                    contact.pushInRoster({groups: groups});
                });
            },

            deleteGroup: function () {
                var name = this.get('name');
                this._settings.destroy();
                _.each(_.clone(this.contacts.models), function (contact) {
                    var groups = _.clone(contact.get('groups')),
                        index = groups.indexOf(name);
                    if (index >= 0) {
                        groups.splice(index, 1);
                    }
                    contact.pushInRoster({groups: groups});
                });
            },

            removeContact: function (contact) {
                if (this.contacts.get(contact)) {
                    this.contacts.remove(contact);
                    this.onContactRemoved(contact);
                }
            },

            onContactRemoved: function (contact) {
                this.updateCounter();
                this.trigger('remove_contact', contact);
                this.contacts.length || this.destroy();
            },

            onChangedRosterSettings: function () {
                var changed = xabber._roster_settings.changed;
                if (_.has(changed, 'show_offline')) {
                    this._settings.trigger('change:show_offline');
                }
                if (_.has(changed, 'sorting')) {
                    this.contacts.sort();
                    this._settings.trigger('change:sorting');
                }
            },

            showSettings: function () {
                this.settings_view.show();
            }
        });

        xabber.GroupView = xabber.BasicView.extend({
            className: 'roster-group',
            events: {
                "click .group-head": "toggle",
                "click .group-head .group-icon": "showGroupSettings",
                "mouseover .group-head": "showSettingsIcon",
                "mouseleave .group-head": "updateGroupIcon"
            },

            _initialize: function () {
                this.account = this.model.account;
                this.updateName();
                this.updateGroupIcon();
                this.updateMembersCounter();
                this.model.contacts.on("add", this.onContactAdded, this);
                this.model.on("remove_contact", this.onContactRemoved, this);
                this.model.contacts.on("update_contact_item", this.updateContactItem, this);
                this.model.on("change:name", this.updateName, this);
                this.model.on("change:counter", this.updateMembersCounter, this);
                this.model._settings.on("change:show_offline", this.onChangedOfflineSetting, this);
                this.model._settings.on("change:sorting", this.onChangedSortingSetting, this);
                this.data.on("change:expanded", this.updateExpanded, this);
            },

            updateExpanded: function () {
                var expanded = this.data.get('expanded');
                this.$el.switchClass('shrank', !expanded);
                this.$('.arrow').switchClass('mdi-chevron-down', expanded);
                this.$('.arrow').switchClass('mdi-chevron-right', !expanded);
                this.$('.roster-contact').showIf(expanded);
                this.parent.parent.onListChanged();
            },

            updateGroupIcon: function () {
                var mdi_icon, show_offline = this.model.settings.show_offline;
                if (show_offline === 'default') {
                    mdi_icon = 'settings';
                } else if (show_offline === 'yes') {
                    mdi_icon = 'group-filled';
                } else if (show_offline === 'no') {
                    mdi_icon = 'group-outline';
                }
                this.$('.group-icon').attr('data-mdi', mdi_icon).hideIf(mdi_icon === 'settings');
            },

            updateName: function () {
                this.$('.group-name').text(this.model.get('name'));
            },

            updateMembersCounter: function () {
                var counter = this.model.get('counter');
                this.$('.member-counter').text('('+counter.online+'/'+counter.all+')');
            },

            onContactAdded: function (contact) {
                var view = this.addChild(contact.get('jid'), this.item_view, {model: contact});
                this.updateContactItem(contact);
            },

            onContactRemoved: function (contact) {
                this.removeChild(contact.get('jid'));
                this.parent.parent.onListChanged();
            },

            updateContactItem: function (contact) {
                var view = this.child(contact.get('jid'));
                if (!view) return;
                var roster_settings = xabber.settings.roster,
                    group_settings = this.model.settings,
                    is_default_show_offline = group_settings.show_offline === 'default',
                    show_offline = group_settings.show_offline === 'yes' ||
                        (is_default_show_offline && roster_settings.show_offline === 'yes'),
                    is_offline = constants.STATUS_WEIGHTS[contact.get('status')] >= 6;

                view.$el.switchClass('invisible', is_offline && !show_offline).detach();
                var index = this.model.contacts.indexOf(contact);
                if (index === 0) {
                    this.$('.group-head').after(view.$el);
                } else {
                    this.$('.roster-contact').eq(index - 1).after(view.$el);
                }
                view.$el.showIf(this.data.get('expanded'));
                view.$el.find('.mdi-account-multiple').showIf(contact.get('group_chat'));
                this.parent.parent.onListChanged();
                return view;
            },

            showSettingsIcon: function (ev) {
                this.$('.group-icon').attr('data-mdi', 'settings').removeClass('hidden');
            },

            showGroupSettings: function (ev) {
                ev.stopPropagation();
                this.model.showSettings();
            },

            onChangedOfflineSetting: function () {
                this.updateGroupIcon();
                var roster_settings = xabber.settings.roster,
                    group_settings = this.model.settings,
                    is_default_show_offline = group_settings.show_offline === 'default',
                    show_offline = group_settings.show_offline === 'yes' ||
                        (is_default_show_offline && roster_settings.show_offline === 'yes');
                _.each(this.children, function (view) {
                    var is_offline = constants.STATUS_WEIGHTS[view.model.get('status')] >= 6;
                    view.$el.switchClass('invisible', is_offline && !show_offline);
                });
                this.parent.parent.onListChanged();
            },

            onChangedSortingSetting: function () {
                _.each(this.children, function (view) { view.$el.detach(); });
                this.model.contacts.each(function (c) { this.updateContactItem(c); }.bind(this));
                this.parent.parent.onListChanged();
            }
        });

        xabber.GroupRightView = xabber.GroupView.extend({
            template: templates.group_right,
            item_view: xabber.ContactItemRightView,

            __initialize: function () {
                this.data.set('expanded', this.model.settings.expanded);
            },

            toggle: function () {
                var expanded = !this.data.get('expanded');
                this.data.set('expanded', expanded);
                this.model._settings.save('expanded', expanded);
            }
        });

        xabber.GroupLeftView = xabber.GroupView.extend({
            template: templates.group_left,
            item_view: xabber.ContactItemLeftView,

            __initialize: function () {
                this.data.set('expanded', true);
            },

            toggle: function (ev) {
                ev.stopPropagation();
                this.data.set('expanded', !this.data.get('expanded'));
            }
        });

        xabber.GroupSettingsView = xabber.BasicView.extend({
            className: 'modal main-modal group-settings',
            template: templates.group_settings,
            ps_selector: '.modal-content',
            avatar_size: constants.AVATAR_SIZES.GROUP_SETTINGS,

            events: {
                "change .offline input[type=radio][name=offline]": "setOffline",
                "click .btn-apply": "applySettings",
                "click .btn-delete": "deleteGroup",
                "click .btn-cancel": "close"
            },

            _initialize: function () {
                this._settings = this.model._settings;
                var name = this.model.get('name');
                if (this.model.isSpecial()) {
                    this.$('.group-name input').attr('readonly', true);
                    this.$('.btn-delete').addClass('hidden');
                }
                this.model.on("destroy", this.onDestroy, this);
            },

            render: function () {
                this.$('.group-name input').val(this.model.get('name'));
                this.$('.group-name .errors').addClass('hidden');
                this.$('.offline input[type=radio][name=offline][value='+
                    (this.model.settings.show_offline)+']').prop('checked', true);
                this.$el.openModal({
                    ready: function () {
                        Materialize.updateTextFields();
                    },
                    complete: this.hide.bind(this)
                });
            },

            setOffline: function (ev) {
                this.model._settings.save('show_offline', ev.target.value);
            },

            validateName: function (name) {
                if (!name) {
                    return 'Please input name!';
                }
                if (this.model.collection.get(name)) {
                    return 'Wrong name';
                }
            },

            applySettings: function () {
                var new_name = this.$('.group-name input').val();
                if (new_name !== this.model.get('name')) {
                    var name_error = this.validateName(new_name);
                    if (name_error) {
                        this.$('.group-name .errors').text(name_error).removeClass('hidden');
                        return;
                    } else {
                        this.model.renameGroup(new_name);
                    }
                }
                this.close();
            },

            deleteGroup: function () {
                var name = this.model.get('name');
                utils.dialogs.ask('Remove group', "Do you want to remove group "+name+"?", null, { ok_button_text: 'remove'})
                    .done(function (result) {
                        result && this.model.deleteGroup();
                    }.bind(this));
            },

            onHide: function () {
                this.$el.detach();
            },

            close: function () {
                this.$el.closeModal({ complete: this.hide.bind(this) });
            },

            onDestroy: function () {
                this.$el.closeModal({ complete: this.remove.bind(this) });
            }
        });

        xabber.Groups = Backbone.Collection.extend({
            model: xabber.Group,

            initialize: function (models, options) {
                this.account = options.account;
                this.on("add", this.onGroupAdded, this);
                this.on("change:id", this.sort, this);
            },

            comparator: function (a, b) {
                if (a.isSpecial() === b.isSpecial()) {
                    return a.get('id') < b.get('id') ? -1 : 1;
                }
                return a.isSpecial() ? 1 : -1;
            },

            notSpecial: function () {
                return this.filter(function (group) { return !group.isSpecial(); });
            },

            onGroupAdded: function (group) {
                group.acc_view = new xabber.AccountGroupView({model: group});
            }
        });

        xabber.Contacts = xabber.ContactsBase.extend({
            initialize: function (models, options) {
                this.account = options.account;
                this.account.on("deactivate destroy", this.removeAllContacts, this);
                this.collections = [];
                this.on("add", _.bind(this.updateInCollections, this, 'add'));
                this.on("change", _.bind(this.updateInCollections, this, 'change'));
            },

            addCollection: function (collection) {
                this.collections.push(collection);
            },

            updateInCollections: function (event, contact) {
                _.each(this.collections, function (collection) {
                    collection.update(contact, event);
                });
            },

            mergeContact: function (attrs) {
                if (typeof attrs !== "object") {
                    attrs = {jid: attrs};
                }
                var contact = this.get(attrs.jid);
                if (contact) {
                    contact.set(attrs);
                } else {
                    contact = this.create(attrs, {account: this.account});
                }
                return contact;
            },

            removeAllContacts: function () {
                _.each(_.clone(this.models), function (contact) {
                    contact.destroy();
                });
            },

            handlePresence: function (presence, jid) {
                var contact = this.mergeContact(jid);
                contact.handlePresence(presence);
            }
        });

        xabber.BlockList = xabber.ContactsBase.extend({
            initialize: function (models, options) {
                this.account = options.account;
                this.contacts = this.account.contacts;
                this.contacts.on("remove_from_blocklist", this.onContactRemoved, this);
            },

            update: function (contact, event) {
                var contains = contact.get('blocked');
                if (contains) {
                    if (!this.get(contact)) {
                        this.add(contact);
                        contact.trigger("add_to_blocklist", contact);
                    }
                } else if (this.get(contact)) {
                    this.remove(contact);
                    contact.trigger("remove_from_blocklist", contact);
                }
            },

            onContactRemoved: function (contact) {
                contact.getVCard();
            },

            registerHandler: function () {
                this.account.connection.deleteHandler(this._stanza_handler);
                this._stanza_handler = this.account.connection.addHandler(
                    this.onBlockingIQ.bind(this),
                    Strophe.NS.BLOCKING, 'iq', "set", null, this.account.get('jid')
                );
            },

            getFromServer: function () {
                var iq = $iq({type: 'get'}).c('blocklist', {xmlns: Strophe.NS.BLOCKING});
                this.account.sendIQ(iq, this.onBlockingIQ.bind(this));
            },

            onBlockingIQ: function (iq) {
                var $elem = $(iq).find('[xmlns="' + Strophe.NS.BLOCKING + '"]'),
                    tag = $elem[0].tagName.toLowerCase(),
                    blocked = tag.startsWith('block');
                $elem.find('item').each(function (idx, item) {
                    var jid = item.getAttribute('jid');
                    this.account.contacts.mergeContact({jid: jid, blocked: blocked});
                }.bind(this));
                return true;
            }
        });

        xabber.Roster = xabber.ContactsBase.extend({
            initialize: function (models, options) {
                this.account = options.account;
                this.groups = this.account.groups;
                this.contacts = this.account.contacts;
                this.contacts.on("add_to_roster", this.onContactAdded, this);
                this.contacts.on("change_in_roster", this.onContactChanged, this);
                this.contacts.on("remove_from_roster", this.onContactRemoved, this);
            },

            update: function (contact, event) {
                var contains = contact.get('in_roster') || contact.get('known');
                if (contains) {
                    if (!this.get(contact)) {
                        this.add(contact);
                        contact.trigger("add_to_roster", contact);
                    } else if (event === 'change') {
                        contact.trigger("change_in_roster", contact);
                    }
                } else if (this.get(contact)) {
                    this.remove(contact);
                    contact.trigger("remove_from_roster", contact);
                }
            },

            onContactAdded: function (contact) {
                if (!contact.get('in_roster')) {
                    this.addContactToGroup(contact, constants.NON_ROSTER_GROUP_ID);
                    return;
                }
                var groups = contact.get('groups');
                if (!groups.length) {
                    this.addContactToGroup(contact, constants.GENERAL_GROUP_ID);
                } else {
                    _.each(groups, _.bind(this.addContactToGroup, this, contact));
                }
            },

            onContactChanged: function (contact) {
                var changed = contact.changed,
                    known_changed = _.has(changed, 'known'),
                    in_roster_changed = _.has(changed, 'in_roster'),
                    groups_changed = _.has(changed, 'groups');
                if (in_roster_changed || known_changed || groups_changed) {
                    var groups;
                    if (contact.get('in_roster')) {
                        groups = _.clone(contact.get('groups'));
                        if (!groups.length) {
                            groups.push(constants.GENERAL_GROUP_ID);
                        }
                    } else if (contact.get('known')) {
                        groups = [constants.NON_ROSTER_GROUP_ID];
                    } else {
                        groups = [];
                    }
                    // TODO: optimize
                    var groups_to_remove = this.groups.filter(function (group) {
                        return !_.contains(groups, group.get('id'));
                    });
                    _.each(groups_to_remove, function (group) {
                        group.removeContact(contact);
                    });
                    _.each(groups, _.bind(this.addContactToGroup, this, contact));
                    contact.trigger('update_groups');
                }
            },

            onContactRemoved: function (contact) {
                _.each(this.groups.filter(), function (group) {
                    group.removeContact(contact);
                });
            },

            getGroup: function (name) {
                var group = this.groups.get(name);
                if (group) {
                    return group;
                }
                var attrs = {id: name};
                if (name === constants.GENERAL_GROUP_ID) {
                    attrs.name = xabber.settings.roster.general_group_name;
                } else if (name === constants.NON_ROSTER_GROUP_ID) {
                    attrs.name = xabber.settings.roster.non_roster_group_name;
                }
                return this.groups.create(attrs, {account: this.account});
            },

            addContactToGroup: function (contact, name) {
                var group = this.getGroup(name);
                group.contacts.add(contact);
            },

            registerHandler: function () {
                this.account.connection.deleteHandler(this._stanza_handler);
                this._stanza_handler = this.account.connection.addHandler(
                    this.onRosterIQ.bind(this),
                    Strophe.NS.ROSTER, 'iq', "set", null, this.account.get('jid')
                );
            },

            getFromServer: function () {
                var iq = $iq({type: 'get'}).c('query', {xmlns: Strophe.NS.ROSTER});
                this.account.sendIQ(iq, function (iq) {
                    this.onRosterIQ(iq);
                    this.account.sendPresence();
                    this.account.dfd_presence.resolve();
                }.bind(this));
            },

            onRosterIQ: function (iq) {
                if (iq.getAttribute('type') === 'set') {
                    this.account.sendIQ($iq({
                        type: 'result', id: iq.getAttribute('id'),
                        from: this.account.jid
                    }));
                }
                $(iq).children('query').find('item').each(function (idx, item) {
                    this.onRosterItem(item);
                }.bind(this));
                return true;
            },

            onRosterItem: function (item) {
                var jid = item.getAttribute('jid');
                if (jid === this.account.get('jid')) {
                    return;
                }
                var contact = this.contacts.mergeContact(jid);
                var subscription = item.getAttribute("subscription");
                if (subscription === 'remove') {
                    contact.set({
                        in_roster: false,
                        known: false,
                        subscription: null
                    });
                    return;
                }
                var groups = [];
                $(item).find('group').each(function () {
                    var group = $(this).text();
                    groups.indexOf(group) < 0 && groups.push(group);
                });
                var attrs = {
                    subscription: subscription,
                    in_roster: true,
                    roster_name: item.getAttribute("name"),
                    groups: groups
                };
                if (attrs.roster_name)
                    attrs.roster_name && (attrs.name = attrs.roster_name);
                contact.set(attrs);
            }
        });

        xabber.AccountRosterView = xabber.BasicView.extend({
            className: 'account-roster-wrap',

            events: {
                "click .roster-account-info-wrap .status-button": "openChangeStatus",
                "click .roster-account-info": "toggle"
            },

            _initialize: function (options) {
                this.account = options.account;
                this.groups = this.account.groups;
                this.roster = this.account.roster;
                this.contacts = this.account.contacts;
                this.$el.attr('data-jid', this.account.get('jid'));
                this.$el.appendTo(this.parent.$('.contact-list'));
                this.$info = this.$('.roster-account-info-wrap');
                this.updateName();
                this.updateStatus();
                this.updateAvatar();
                this.updateColorScheme();
                this.account.on("change:name", this.updateName, this);
                this.account.on("change:image", this.updateAvatar, this);
                this.account.on("change:status_updated", this.updateStatus, this);
                this.account.settings.on("change:color", this.updateColorScheme, this);
                this.groups.on("add", this.onGroupAdded, this);
                this.groups.on("rename", this.onGroupRenamed, this);
                this.groups.on("destroy", this.onGroupRemoved, this);
                this.data.on("change:expanded", this.updateExpanded, this);
                this.data.set('expanded', true);
            },

            updateName: function () {
                this.$info.find('.name').text(this.account.get('name'));
            },

            updateStatus: function () {
                this.$info.find('.status').attr('data-status', this.account.get('status'));
                this.$info.find('.status-message').text(this.account.getStatusMessage());
            },

            updateAvatar: function () {
                var image = this.account.cached_image;
                this.$info.find('.circle-avatar').setAvatar(image, this.avatar_size);
            },

            updateColorScheme: function () {
                this.$el.attr('data-color', this.account.settings.get('color'));
            },

            updateExpanded: function () {
                var expanded = this.data.get('expanded');
                this.$el.switchClass('shrank', !expanded);
                this.parent.updateScrollBar();
            },

            updateGroupPosition: function (view) {
                view.$el.detach();
                var index = this.groups.indexOf(view.model);
                if (index === 0) {
                    this.$info.after(view.$el);
                } else {
                    this.$('.roster-group').eq(index - 1).after(view.$el);
                }
                this.parent.updateScrollBar();
            },

            onGroupAdded: function (group) {
                var view = this.addChild(group.get('id'), this.group_view, {model: group});
                this.updateGroupPosition(view);
            },

            onGroupRenamed: function (group, old_name) {
                var view = this.child(old_name);
                delete this.children[old_name];
                this.children[group.get('name')] = view;
                view && this.updateGroupPosition(view);
            },

            onGroupRemoved: function (group) {
                this.removeChild(group.get('id'));
            },

            toggle: function (ev) {
                this.data.set('expanded', !this.data.get('expanded'));
            },

            openChangeStatus: function (ev) {
                xabber.change_status_view.open(this.account);
            }
        });

        xabber.AccountRosterRightView = xabber.AccountRosterView.extend({
            template: templates.account_roster_right,
            group_view: xabber.GroupRightView,
            avatar_size: constants.AVATAR_SIZES.ROSTER_RIGHT_ACCOUNT_ITEM,

            __initialize: function () {
                this.contacts.on("add_to_roster change_in_roster remove_from_roster",
                    this.updateCounter, this);
                this.contacts.on("add_to_roster remove_from_roster",
                    this.updateGlobalCounter, this);
            },

            updateCounter: function (contact) {
                var all = this.roster.length,
                    online = all - this.roster.where({status: 'offline'}).length;
                this.$info.find('.counter').text(online + '/' + all);
            },

            updateGlobalCounter: function (contact) {
                this.parent.updateCounter();
            }
        });

        xabber.AccountRosterLeftView = xabber.AccountRosterView.extend({
            template: templates.account_roster_left,
            group_view: xabber.GroupLeftView,
            avatar_size: constants.AVATAR_SIZES.ROSTER_LEFT_ACCOUNT_ITEM,

            __initialize: function () {
                this.$info.find('.jid').text(this.account.get('jid'));
            },

            search: function (query) {
                this.$el.removeClass('shrank');
                this.$('.group-head').addClass('hidden');
                var count = 0, hashes = {};
                this.$('.roster-contact').each(function (idx, item) {
                    var $item = $(item),
                        jid = $item.data('jid'),
                        contact = this.roster.get(jid);
                    if (!contact) return;
                    if (hashes[contact.hash_id]) {
                        $item.addClass('hidden');
                        return;
                    }
                    hashes[contact.hash_id] = true;
                    var name = contact.get('name').toLowerCase(),
                        hide = name.indexOf(query) < 0 && jid.indexOf(query) < 0;
                    $item.hideIf(hide);
                    hide || count++;
                }.bind(this));
                this.$('.roster-account-info-wrap').showIf(count);
            },

            searchAll: function () {
                this.$el.switchClass('shrank', !this.data.get('expanded'));
                this.$('.roster-account-info-wrap').removeClass('hidden');
                this.$('.group-head').removeClass('hidden');
                this.$('.list-item').removeClass('hidden');
            }
        });

        xabber.BlockedItemView = xabber.BasicView.extend({
            className: 'blocked-contact',
            template: templates.contact_blocked_item,
            avatar_size: constants.AVATAR_SIZES.CONTACT_BLOCKED_ITEM,

            events: {
                "click .btn-unblock": "unblockContact",
                "click": "showDetails"
            },

            _initialize: function (options) {
                this.$el.appendTo(this.parent.$('.blocked-contacts'));
                this.$el.attr({'data-jid': this.model.get('jid')});
                this.$('.jid').text(this.model.get('jid'));
                this.$('.circle-avatar').setAvatar(this.model.cached_image, this.avatar_size);
            },

            unblockContact: function (ev) {
                ev.stopPropagation();
                this.model.unblock();
            },

            showDetails: function (ev) {
                this.model.showDetails();
            }
        });

        xabber.BlockListView = xabber.BasicView.extend({
            _initialize: function (options) {
                this.account = options.account;
                this.account.contacts.on("add_to_blocklist", this.onContactAdded, this);
                this.account.contacts.on("remove_from_blocklist", this.onContactRemoved, this);
            },

            onContactAdded: function (contact) {
                if (!contact.get('group_chat')) {
                    this.addChild(contact.get('jid'), xabber.BlockedItemView, {model: contact});
                    this.$('.placeholder').addClass('hidden');
                    this.parent.updateScrollBar();
                }
            },

            onContactRemoved: function (contact) {
                this.removeChild(contact.get('jid'));
                this.$('.placeholder').hideIf(this.account.blocklist.length);
                this.parent.updateScrollBar();
            }
        });

        xabber.RosterView = xabber.SearchView.extend({
            ps_selector: '.contact-list-wrap',

            _initialize: function () {
                this._settings = xabber._roster_settings;
                this.model.on("activate", this.updateOneRosterView, this);
                this.model.on("update_order", this.updateRosterViews, this);
                this.model.on("deactivate destroy", this.removeRosterView, this);
                this.on("before_hide", this.saveScrollBarOffset, this);
            },

            updateOneRosterView: function (account) {
                var jid = account.get('jid'),
                    view = this.child(jid);
                if (view) {
                    view.$el.detach();
                } else if (account.isConnected()) {
                    view = this.addChild(jid, this.account_roster_view, {account: account});
                } else {
                    return;
                }
                var index = this.model.connected.indexOf(account);
                if (index === 0) {
                    this.$('.contact-list').prepend(view.$el);
                } else {
                    this.$('.contact-list').children().eq(index - 1).after(view.$el);
                }
                this.updateScrollBar();
            },

            updateRosterViews: function () {
                _.each(this.children, function (view) { view.detach(); });
                this.model.each(function (account) {
                    var jid = account.get('jid'), view = this.child(jid);
                    view && this.$('.contact-list').append(view.$el);
                }.bind(this));
                this.updateScrollBar();
            },

            removeRosterView: function (account) {
                this.removeChild(account.get('jid'));
                this.updateScrollBar();
            }
        });

        xabber.RosterRightView = xabber.RosterView.extend({
            className: 'roster-right-container container',
            template: templates.roster_right,
            ps_settings: {theme: 'roster-right'},
            account_roster_view: xabber.AccountRosterRightView,

            events: {
                "mouseover .collapsed-wrap": "expand",
                "mouseleave .expanded-wrap": "collaps",
                "click .btn-pin": "pinUnpin"
            },

            __initialize: function () {
                this.updateCounter();
                this.model.on("activate deactivate destroy", this.updateCounter, this);
                this.data.on("change", this.updateLayout, this);
                var pinned = this._settings.get('pinned');
                this.data.set({expanded: pinned, pinned: pinned});
            },

            expand: function () {
                this.data.set('expanded', true);
            },

            collaps: function () {
                if (!this.data.get('pinned')) {
                    this.data.set('expanded', false);
                }
            },

            pinUnpin: function () {
                var pinned = !this.data.get('pinned');
                this._settings.save('pinned', pinned);
                this.data.set('pinned', pinned);
            },

            updateLayout: function () {
                var changed = this.data.changed;
                if (_.has(changed, 'expanded') || _.has(changed, 'pinned')) {
                    xabber.trigger('update_layout', {roster_state_changed: true});
                }
            },

            updateCounter: function () {
                this.$('.all-contacts-counter').text(
                    _.reduce(this.children, function (counter, view) {
                        return counter + view.roster.length;
                    }, 0)
                );
            },

            onListChanged: function () {
                this.updateScrollBar();
            }
        });

        xabber.RosterLeftView = xabber.RosterView.extend({
            className: 'roster-left-container container',
            template: templates.roster_left,
            ps_settings: {theme: 'item-list'},
            account_roster_view: xabber.AccountRosterLeftView,

            __initialize: function () {
                this.model.on("list_changed", this.updateLeftIndicator, this);
            },

            updateLeftIndicator: function () {
                this.$el.attr('data-indicator', this.model.connected.length > 1);
            },

            getContactForItem: function (item) {
                var $item = $(item),
                    account_jid = $item.parent().parent().data('jid'),
                    jid = $item.data('jid'),
                    roster_view = this.child(account_jid);
                return roster_view && roster_view.roster.get(jid);
            },

            render: function (options) {
                options.right !== 'contact_details' && this.clearSearch();
            },

            search: function (query) {
                _.each(this.children, function (view) {
                    view.search(query);
                });
            },

            searchAll: function () {
                _.each(this.children, function (view) {
                    view.searchAll();
                });
            },

            onEnterPressed: function (selection) {
                var contact = this.getContactForItem(selection);
                contact && contact.showDetails();
            },

            onListChanged: function () {
                this.updateSearch();
            }
        });

        xabber.RosterSettingsView = xabber.BasicView.extend({
            className: 'roster-settings-wrap',
            template: templates.roster_settings,

            events: {
                "change .offline-contacts input": "setOfflineSetting",
                "change .sorting-contacts input": "setSortingSetting"
            },

            _initialize: function () {
                this.$el.appendTo(this.parent.$('.settings-block-wrap.contact-list'));
            },

            render: function () {
                this.$('.offline-contacts input[type=radio][name=offline-contacts][value='+
                    (this.model.get('show_offline'))+']').prop('checked', true);
                this.$('.sorting-contacts input[type=radio][name=sorting-contacts][value='+
                    (this.model.get('sorting'))+']').prop('checked', true);
            },

            setOfflineSetting: function () {
                this.model.save('show_offline',
                    this.$('.offline-contacts input[type=radio][name=offline-contacts]:checked').val());
            },

            setSortingSetting: function () {
                this.model.save('sorting',
                    this.$('.sorting-contacts input[type=radio][name=sorting-contacts]:checked').val());
            }
        });

        xabber.AccountGroupView = xabber.BasicView.extend({
            className: 'group',
            template: function () {
                this.$el.append('<span class="group-name"/>');
            },

            events: {
                "click .group-name": "showGroupSettings"
            },

            _initialize: function (options) {
                this.$('.group-name').text(this.model.get('name'));
                var index = this.model.collection.indexOf(this.model),
                    $parent_el = this.model.account.settings_right.$('.groups');
                if (index === 0) {
                    $parent_el.prepend(this.$el);
                } else {
                    $parent_el.children().eq(index - 1).after(this.$el);
                }
                this.model.on("destroy", this.remove, this);
            },

            showGroupSettings: function () {
                this.model.showSettings();
            }
        });

        xabber.ContactPlaceholderView = xabber.BasicView.extend({
            className: 'placeholder-wrap contact-placeholder-wrap noselect',
            template: templates.contact_placeholder
        });

        xabber.AddContactView = xabber.BasicView.extend({
            className: 'modal main-modal add-contact-modal',
            template: templates.add_contact,
            ps_selector: '.modal-content',
            avatar_size: constants.AVATAR_SIZES.ACCOUNT_ITEM,

            events: {
                "click .account-field .dropdown-content": "selectAccount",
                "click .existing-group-field label": "editGroup",
                "change .new-group-name input": "checkNewGroup",
                "keyup .new-group-name input": "checkNewGroup",
                "click .new-group-checkbox": "addNewGroup",
                "click .btn-add": "addContact",
                "click .btn-cancel": "close"
            },

            _initialize: function () {
                this.group_data = new Backbone.Model;
                this.group_data.on("change", this.updateGroups, this);
            },

            render: function (options) {
                if (!xabber.accounts.connected.length) {
                    utils.dialogs.error('No connected accounts found.');
                    return;
                }
                options || (options = {});
                var accounts = options.account ? [options.account] : xabber.accounts.connected,
                    jid = options.jid || '';
                this.$('input[name="username"]').val(jid).attr('readonly', !!jid)
                    .removeClass('invalid');
                this.$('.single-acc').showIf(accounts.length === 1);
                this.$('.multiple-acc').hideIf(accounts.length === 1);
                this.$('.account-field .dropdown-content').empty();
                _.each(accounts, function (account) {
                    this.$('.account-field .dropdown-content').append(
                        this.renderAccountItem(account));
                }.bind(this));
                this.bindAccount(accounts[0]);
                this.$('span.errors').text('');
                this.$el.openModal({
                    ready: function () {
                        Materialize.updateTextFields();
                        this.$('.account-field .dropdown-button').dropdown({
                            inDuration: 100,
                            outDuration: 100,
                            constrainWidth: false,
                            hover: false,
                            alignment: 'left'
                        });
                    }.bind(this),
                    complete: this.hide.bind(this)
                });
                return this;
            },

            bindAccount: function (account) {
                this.account = account;
                this.$('.account-field .dropdown-button .account-item-wrap')
                    .replaceWith(this.renderAccountItem(account));
                this.renderGroupsForAccount(account);
            },

            renderAccountItem: function (account) {
                var $item = $(templates.add_contact_account_item({jid: account.get('jid')}));
                $item.find('.circle-avatar').setAvatar(account.cached_image, this.avatar_size);
                return $item;
            },

            renderGroupsForAccount: function (account) {
                this.group_data.set({
                    selected: [],
                    groups: _.map(account.groups.notSpecial(), function (group) {
                        return group.get('name');
                    })
                }, {silent: true});
                this.updateGroups();
            },

            updateGroups: function () {
                var selected = this.group_data.get('selected');
                this.$('.groups').html(templates.groups_checkbox_list({
                    groups: _.map(this.group_data.get('groups'), function (name) {
                        return { name: name, id: uuid(), checked: _.contains(selected, name) };
                    })
                }));
                this.updateScrollBar();
            },

            selectAccount: function (ev) {
                var $item = $(ev.target).closest('.account-item-wrap'),
                    account = xabber.accounts.get($item.data('jid'));
                this.bindAccount(account);
            },

            editGroup: function (ev) {
                ev.preventDefault();
                var $target = $(ev.target),
                    $input = $target.siblings('input'),
                    checked = !$input.prop('checked'),
                    group_name = $input.attr('data-groupname'),
                    selected = _.clone(this.group_data.get('selected')),
                    idx = selected.indexOf(group_name);
                $input.prop('checked', checked);
                if (checked) {
                    idx < 0 && selected.push(group_name);
                } else if (idx >= 0) {
                    selected.splice(idx, 1);
                }
                this.group_data.set('selected', selected);
            },

            checkNewGroup: function (ev) {
                var name = $(ev.target).val(),
                    $checkbox = this.$('.new-group-checkbox');
                $checkbox.showIf(name && !_.contains(this.group_data.get('groups'), name));
            },

            addNewGroup: function (ev) {
                ev.preventDefault();
                var $input = this.$('.new-group-name input'),
                    name = $input.val(),
                    groups = _.clone(this.group_data.get('groups')),
                    idx = groups.indexOf(name);
                if (idx < 0) {
                    var selected = _.clone(this.group_data.get('selected'));
                    selected.push(name);
                    groups.push(name);
                    this.group_data.set({groups: groups, selected: selected});
                }
                this.scrollToBottom();
            },

            addContact: function (ev) {
                this.$('span.errors').text('').addClass('hidden');
                var jid = this.$('input[name=username]').removeClass('invalid').val(),
                    name = this.$('input[name=contact_name]').removeClass('invalid').val(),
                    groups = this.group_data.get('selected'),
                    contact, error_text;
                jid = Strophe.getBareJidFromJid(jid);
                if (!jid) {
                    error_text = 'Input username!';
                } else if (jid === this.account.get('jid')) {
                    error_text = 'Can not add yourself to contacts!';
                } else {
                    contact = this.account.contacts.mergeContact(jid);
                    if (contact.get('in_roster')) {
                        error_text = 'Contact is already in your roster!';
                    }
                }
                if (error_text) {
                    this.$('input[name=username]').addClass('invalid')
                        .siblings('.errors').text(error_text);
                } else {
                    contact.pres('subscribed');
                    contact.pushInRoster({name: name, groups: groups}, function () {
                        contact.pres('subscribe');
                        contact.trigger("open_chat", contact);
                    }.bind(this));
                    this.close();
                }
            },

            onHide: function () {
                this.$el.detach();
            },

            close: function () {
                this.$el.closeModal({ complete: this.hide.bind(this) });
            }
        });

        xabber.GroupSettings = Backbone.Model.extend({
            idAttribute: 'name',
            defaults: {
                expanded: true,
                show_offline: 'default',
                sorting: 'default',
                custom_notifications: false,
                notifications: false,
                message_preview: false
            }
        });

        xabber.GroupsSettings = Backbone.CollectionWithStorage.extend({
            model: xabber.GroupSettings,

            _initialize: function (models, options) {
                this.account = options.account;
                this.account.on("destroy", this.clearStorage, this);
                this.fetch();
            }
        });

        xabber.RosterSettings = Backbone.ModelWithStorage.extend({
            defaults: {
                pinned: true,
                show_offline: 'yes',
                sorting: 'online-first',
                general_group_name: 'General',
                non_roster_group_name: 'Not in roster'
            }
        });


        xabber.Account.addInitPlugin(function () {
            this.groups_settings = new xabber.GroupsSettings(null, {
                account: this,
                storage_name: xabber.getStorageName() + '-groups-settings-' + this.get('jid')
            });

            this.groups = new xabber.Groups(null, {account: this});
            this.contacts = new xabber.Contacts(null, {account: this});
            this.contacts.addCollection(this.roster = new xabber.Roster(null, {account: this}));
            this.contacts.addCollection(this.blocklist = new xabber.BlockList(null, {account: this}));

            this.settings_right.addChild('blocklist', xabber.BlockListView,
                {account: this, el: this.settings_right.$('.blocklist-info')[0]});

            this._added_pres_handlers.push(this.contacts.handlePresence.bind(this.contacts));

            this.on("ready_to_get_roster", function () {
                this.resources.reset();
                this.contacts.each(function (contact) {
                    contact.resources.reset();
                    contact.resetStatus();
                });
                this.blocklist.getFromServer();
                this.roster.getFromServer();
            }, this);
        });

        xabber.Account.addConnPlugin(function () {
            this.roster.registerHandler();
            this.blocklist.registerHandler();
        }, true, true);

        xabber.once("start", function () {
            this._roster_settings = new this.RosterSettings({id: 'roster-settings'},
                {storage_name: this.getStorageName(), fetch: 'after'});
            this.settings.roster = this._roster_settings.attributes;
            this.roster_settings_view = xabber.settings_view.addChild(
                'roster_settings', this.RosterSettingsView, {model: this._roster_settings});

            this.contacts_view = this.left_panel.addChild('contacts', this.RosterLeftView,
                {model: this.accounts});
            this.roster_view = this.body.addChild('roster', this.RosterRightView,
                {model: this.accounts});
            this.details_container = this.right_panel.addChild('details', this.Container);
            this.contact_placeholder = this.right_panel.addChild('contact_placeholder',
                this.ContactPlaceholderView);
            this.add_contact_view = new this.AddContactView();
            this.on("add_contact", function () {
                this.add_contact_view.show();
            }, this);
        }, xabber);

        return xabber;
    };
});
