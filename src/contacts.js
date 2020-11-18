define("xabber-contacts", function () {
    return function (xabber) {
        var env = xabber.env,
            constants = env.constants,
            templates = env.templates.contacts,
            utils = env.utils,
            $ = env.$,
            $iq = env.$iq,
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
                subscription: undefined,
                subscription_request_in: false,
                subscription_request_out: false,
                groups: [],
                group_chat: false
            },

            initialize: function (_attrs, options) {
                this.on("change:group_chat", this.onChangedGroupchat, this);
                this.account = options.account;
                var attrs = _.clone(_attrs);
                (this.account && this.account.domain === attrs.jid) && _.extend(attrs, {is_server: true, bot: true});
                attrs.name = attrs.roster_name || attrs.jid;
                if (!attrs.image) {
                    attrs.photo_hash = "";
                    attrs.image = Images.getDefaultAvatar(attrs.name);
                }
                this.cached_image = Images.getCachedImage(attrs.image);
                attrs.vcard = utils.vcard.getBlank(attrs.jid);
                this.set(attrs);
                this.onChangedGroupchat();
                this.domain = Strophe.getDomainFromJid(this.get('jid'));
                !this.get('group_chat') && this.set('group_chat', _.contains(this.account.chat_settings.get('group_chat'), this.get('jid')));
                this.hash_id = env.b64_sha1(this.account.get('jid') + '-' + attrs.jid);
                this.resources = new xabber.ContactResources(null, {contact: this});
                this.details_view = (this.get('group_chat')) ? new xabber.GroupChatDetailsView({model: this}) : new xabber.ContactDetailsView({model: this});
                this.on("change:photo_hash", this.getContactInfo, this);
                this.on("change:roster_name", this.updateName, this);
                !xabber.servers.get(this.domain) && xabber.servers.create({domain: this.domain, account: this.account});
                this.account.dfd_presence.done(function () {
                    if (!this.get('blocked'))
                        this.getContactInfo();
                }.bind(this));
            },

            getStatusMessage: function () {
                let subscription = this.get('subscription'),
                    in_request = this.get('subscription_request_in'),
                    out_request = this.get('subscription_request_out'),
                    status_text = "";
                if (this.get('blocked'))
                    status_text = 'Contact blocked';
                else if (subscription === 'from') {
                    if (out_request)
                        status_text = 'Subscription request pending';
                    else
                        status_text = 'Subscribed to your status';
                } else if (!subscription) {
                    if (out_request)
                        status_text =  'Subscription request pending';
                    else if (in_request)
                        status_text = 'Incoming subscription request';
                    else if (_.isNull(subscription))
                        status_text = 'No subscriptions';
                    else
                        status_text = 'Not in your contacts';
                } else if (this.get('group_info')) {
                    status_text = this.get('group_info').members_num;
                    if (this.get('group_info').members_num > 1)
                        status_text += ' members';
                    else
                        status_text += ' member';
                    if (this.get('group_info').online_members_num > 0)
                        status_text += ', ' + this.get('group_info').online_members_num + ' online';
                } else
                    status_text = this.get('status_message') || constants.STATUSES[this.get('status')];
                return status_text;
            },

            getIcon: function () {
                if (this.get('blocked'))
                    return 'ic-blocked';
                if (this.get('invitation'))
                    return 'ic-invitation-chat';
                if (this.get('group_chat')) {
                    if (this.get('private_chat'))
                        return 'ic-private-chat';
                    if (this.get('incognito_chat'))
                        return 'ic-incognito-chat';
                    return 'ic-group-chat';
                }
                if (this.get('bot'))
                    return 'ic-bot-chat';
                return;
            },

            getContactInfo: function () {
                xabber.cached_contacts_info.getContactInfo(this.get('jid'), function (contact_info) {
                    if (!_.isNull(contact_info)) {
                        if ((contact_info.hash === this.get('photo_hash')) || contact_info.hash && !this.get('photo_hash') && !_.isNull(this.get('photo_hash'))) {
                            this.cached_image = Images.getCachedImage(contact_info.avatar);
                            contact_info.avatar_priority && this.set('avatar_priority', contact_info.avatar_priority);
                            this.set('photo_hash', contact_info.hash);
                            this.set('image', contact_info.avatar);
                        }
                        if (!this.get('roster_name') && contact_info.name)
                            this.set('name', contact_info.name);
                        return;
                    }
                    if (!this.get('group_chat'))
                        this.getVCard();
                }.bind(this));
            },

            getVCard: function (callback) {
                var jid = this.get('jid'),
                    is_callback = _.isFunction(callback);
                this.account.connection.vcard.get(jid,
                    function (vcard) {
                        if (vcard.group_info) {
                            let group_info = this.get('group_info') || {};
                            group_info = _.extend(group_info, vcard.group_info);
                            this.set({group_info});
                            delete vcard.group_info;
                        }
                        let attrs = {
                            vcard: vcard,
                            vcard_updated: moment.now(),
                            name: this.get('roster_name')
                        };
                        if (!attrs.name) {
                            if (this.get('group_chat'))
                                attrs.name = vcard.nickname || this.get('name');
                            else
                                attrs.name = vcard.nickname || (vcard.first_name + ' ' + vcard.last_name).trim() || vcard.fullname || jid;
                        }
                        if (!this.get('avatar_priority') || this.get('avatar_priority') <= constants.AVATAR_PRIORITIES.VCARD_AVATAR) {
                            if (vcard.photo.image) {
                                attrs.avatar_priority = constants.AVATAR_PRIORITIES.VCARD_AVATAR;
                                attrs.image = vcard.photo.image;
                            }
                            else
                                attrs.image = Images.getDefaultAvatar(attrs.name);
                            this.cached_image = Images.getCachedImage(attrs.image);
                        }
                        this.set(attrs);
                        let cached_info = {
                            jid: this.get('jid'),
                            name: this.get('name')
                        };
                        if (this.get('photo_hash') || vcard.photo.image)
                            _.extend(cached_info, {hash: (this.get('photo_hash') || this.account.getAvatarHash(vcard.photo.image)), avatar_priority: this.get('avatar_priority'), avatar: this.get('image')});
                        xabber.cached_contacts_info.putContactInfo(cached_info);
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
                    this.participants = new xabber.Participants(null, {contact: this});
                }
            },

            updateCounters: function () {
                xabber.toolbar_view.recountAllMessageCounter();
            },

            getLastSeen: function() {
                if (this.get('status') == 'offline') {
                    if (!Strophe.getNodeFromJid(this.get('jid'))) {
                        this.set({status_message: 'Server'});
                        return;
                    }
                    var iq = $iq({from: this.account.get('jid'), type: 'get', to: this.get('jid') }).c('query', {xmlns: Strophe.NS.LAST});
                    this.account.sendIQ(iq, function (iq) {
                        var last_seen = this.getLastSeenStatus(iq);
                        if (this.get('status') == 'offline')
                            this.set({status_message: last_seen});
                        return this;
                    }.bind(this));
                }
            },

            membersRequest: function (options, callback) {
                options = options || {};
                let participant_id = options.id,
                    version = options.version || 0;
                var iq = $iq({from: this.account.get('jid'), to: this.get('jid'), type: 'get'});
                if (participant_id != undefined) {
                    if (!participant_id) {
                        if (options.properties)
                            iq.c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#members', id: participant_id});
                        else
                            iq.c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#rights'}).c('user', {xmlns: Strophe.NS.GROUP_CHAT, id: participant_id});
                    }
                    else
                        iq.c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#rights'}).c('user', {
                            xmlns: Strophe.NS.GROUP_CHAT,
                            id: participant_id
                        });
                }
                else
                    iq.c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#members', version: version});
                this.account.sendIQ(iq, function (response) {
                    callback && callback(response);
                });
            },

            getMyInfo: function (callback) {
                this.membersRequest({id: '', properties: true}, function (response) {
                    let $item = $($(response).find('query user')),
                        cached_avatar = this.account.chat_settings.getAvatarInfoById($item.find('id').text());
                    $item.length && this.participants && this.participants.createFromStanza($item);
                    cached_avatar && (cached_avatar.avatar_hash == this.my_info.get('avatar')) && this.my_info.set('b64_avatar', cached_avatar.avatar_b64);
                    this.trigger('update_my_info');
                    this.membersRequest({id: ''}, function (response) {
                        let data_form = this.account.parseDataForm($(response).find('x[xmlns="' + Strophe.NS.DATAFORM + '"]'));
                        this.my_rights = data_form;
                        this.trigger('permissions_changed');
                        callback && callback();
                    }.bind(this));
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
                            }.bind(this),
                            function (data_error) {
                                errback && errback(data_error);
                            });
                    }.bind(this),
                    function (data_error) {
                        errback && errback(data_error);
                    }.bind(this));
            },

            getLastSeenStatus: function(iq) {
                var seconds = $(iq).children('query').attr('seconds'),
                    message_time = moment.now() - 1000*seconds;
                this.set({ last_seen: message_time });
                return utils.pretty_last_seen(seconds);
            },

            pres: function (type) {
                var pres = $pres({to: this.get('jid'), type: type});
                this.account.sendPres(pres);
                return this;
            },

            pushInRoster: function (attrs, callback, errback) {
                attrs || (attrs = {});
                var name = attrs.name || this.get('roster_name'),
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
                this.account.cached_roster.removeFromCachedRoster(this.get('jid'));
                this.account.sendIQ(iq, callback, errback);
                this.set('known', false);
                return this;
            },

            acceptRequest: function (callback) {
                this.pres('subscribed');
                callback && callback();
            },

            askRequest: function (callback) {
                this.pres('subscribe');
                callback && callback();
            },

            blockRequest: function (callback) {
                this.pres('unsubscribed');
                this.block(callback);
            },

            declineRequest: function (callback) {
                this.pres('unsubscribed');
                this.removeFromRoster(callback);
            },

            declineSubscription: function () {
                this.pres('unsubscribe');
                this.set('subscription_request_out', false);
            },

            declineSubscribe: function () {
                this.pres('unsubscribed');
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

            sendPresent: function () {
                var pres = $pres({from: this.account.connection.jid, to: this.get('jid')})
                    .c('x', {xmlns: Strophe.NS.GROUP_CHAT + '#present'});
                this.account.sendPres(pres);
            },

            sendNotPresent: function () {
                var pres = $pres({from: this.account.connection.jid, to: this.get('jid')})
                    .c('x', {xmlns: Strophe.NS.GROUP_CHAT + '#not-present'});
                this.account.sendPres(pres);
            },

            handlePresence: function (presence) {
                var $presence = $(presence),
                    type = presence.getAttribute('type'),
                    $vcard_update = $presence.find('x[xmlns="'+Strophe.NS.VCARD_UPDATE+'"]');
                if ($vcard_update.length && this.get('avatar_priority') && this.get('avatar_priority') <= constants.AVATAR_PRIORITIES.VCARD_AVATAR)
                    this.set('photo_hash', $vcard_update.find('photo').text());
                if (type === 'subscribe') {
                    this.set('subscription_request_in', true);
                    if (this.get('in_roster') || this.get('subscription_preapproved')) {
                        this.pres('subscribed');
                    } else {
                        this.trigger('presence', this, 'subscribe');
                    }
                } else if (type === 'subscribed') {
                    if (this.get('subscription') === 'to') {
                        // this.pres('subscribed');
                    }
                    this.trigger('presence', this, 'subscribed');
                } else if (type === 'unsubscribe') {
                    if (this.get('group_chat')) {
                        this.removeFromRoster();
                        let chat = this.account.chats.getChat(this);
                        chat.deleteFromSynchronization(function () {
                            chat.trigger("close_chat");
                            this.destroy();
                        }.bind(this), function () {
                            chat.trigger("close_chat");
                            this.destroy();
                        }.bind(this));
                    }
                } else if (type === 'unsubscribed') {
                    this.set('subscription_request_out', false);
                    // this.trigger('presence', this, 'unsubscribed');
                } else {
                    var jid = presence.getAttribute('from'),
                        resource = Strophe.getResourceFromJid(jid),
                        priority = Number($presence.find('priority').text()),
                        status = $presence.find('show').text() || 'online',
                        $status_message = $presence.find('status'),
                        status_message = $status_message.text();
                    _.isNaN(priority) && (priority = 0);
                    clearTimeout(this._reset_status_timeout);
                    let resource_obj = this.resources.get(resource);
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
                let $group_chat_info = $(presence).find('x[xmlns="'+Strophe.NS.GROUP_CHAT +'"]');
                if ($group_chat_info.length > 0 && $group_chat_info.children().length) {
                    if (!this.get('group_chat')) {
                        this.set('group_chat', true);
                        this.account.chat_settings.updateGroupChatsList(this.get('jid'), this.get('group_chat'));
                    }
                    if (!this.details_view.child('participants')) {
                        this.details_view = new xabber.GroupChatDetailsView({model: this});
                    }
                    let group_chat_info = this.parseGroupInfo($(presence));
                    this.set('group_info', group_chat_info);
                    if (!this.get('roster_name') && (group_chat_info.name !== this.get('name')))
                        this.set('name', group_chat_info.name);
                    this.set({status: group_chat_info.status, status_updated: moment.now(), status_message: (group_chat_info.members_num + ' members, ' + group_chat_info.online_members_num + ' online')});
                }
            },

            parseGroupInfo: function ($presence) {
                var $group_chat = $presence.find('x[xmlns="'+Strophe.NS.GROUP_CHAT +'"]'),
                    name = $group_chat.find('name').text(),
                    model = $group_chat.find('membership').text(),
                    status = $presence.children('show').text() || (($presence.attr('type') === 'unavailable') ? 'unavailable' : 'online'),
                    status_msg = $presence.children('status').text(),
                    anonymous = $group_chat.find('privacy').text(),
                    searchable = $group_chat.find('index').text(),
                    description = $group_chat.find('description').text(),
                    pinned_message = Number($group_chat.find('pinned-message').text()),
                    private_chat = $group_chat.find('parent-chat').text() || false,
                    members_num = parseInt($group_chat.find('members').text()),
                    online_members_num = parseInt($group_chat.find('present').text()),
                    info = {
                        jid: this.get('jid'),
                        name: name,
                        anonymous: anonymous,
                        searchable: searchable,
                        model: model,
                        status: status,
                        status_msg: status_msg || status,
                        description: description,
                        members_num: members_num,
                        online_members_num: online_members_num
                    };
                private_chat && this.set('private_chat', private_chat);
                anonymous === 'incognito' && this.set('incognito_chat', true);
                var chat = this.account.chats.get(this.hash_id), pinned_msg_elem;
                if (chat)
                    pinned_msg_elem = chat.item_view.content.$pinned_message;
                if (pinned_msg_elem) {
                    if (pinned_message) {
                        this.getMessageByStanzaId(pinned_message, function ($message) {
                            this.parsePinnedMessage($message, pinned_msg_elem);
                        }.bind(this));
                    }
                    else {
                        this.set('pinned_message', undefined);
                        this.parsePinnedMessage(undefined, pinned_msg_elem);
                    }
                }

                return info;
            },

            getAllRights: function (callback) {
                let iq_get_rights = iq = $iq({from: this.account.get('jid'), type: 'get', to: this.get('jid') })
                    .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#rights' });
                this.account.sendIQ(iq_get_rights, function(iq_all_rights) {
                    var all_permissions = $(iq_all_rights).find('permission'),
                        all_restrictions = $(iq_all_rights).find('restriction');
                    this.all_rights = {permissions: all_permissions, restrictions: all_restrictions};
                    callback && callback();
                }.bind(this));
            },

            getMessageByStanzaId: function (stanza_id, callback) {
                var queryid = uuid(),
                    iq = $iq({type: 'set', to: this.get('jid')})
                        .c('query', {xmlns: Strophe.NS.MAM, queryid: queryid})
                        .c('x', {xmlns: Strophe.NS.DATAFORM, type: 'submit'})
                        .c('field', {'var': 'FORM_TYPE', type: 'hidden'})
                        .c('value').t(Strophe.NS.MAM).up().up()
                        .c('field', {'var': '{urn:xmpp:sid:0}stanza-id'})
                        .c('value').t(stanza_id);
                var handler = this.account.connection.addHandler(function (message) {
                    var $msg = $(message);
                    if ($msg.find('result').attr('queryid') === queryid)
                        callback && callback($msg);
                    return true;
                }.bind(this), Strophe.NS.MAM);
                this.account.sendIQ(iq,
                    function () {
                        this.account.connection.deleteHandler(handler);
                    }.bind(this),
                    function () {
                        this.account.connection.deleteHandler(handler);
                    }.bind(this)
                );
            },

            parsePinnedMessage: function ($message, pinned_msg_elem) {
                if (!$message) {
                    this.renderPinnedMessage(null, pinned_msg_elem);
                }
                else {
                    var $msg = $message.find('result message').first();
                    if (this.get('pinned_message'))
                        if (this.get('pinned_message').stanza_id === $msg.find('stanza-id').attr('id'))
                            return;
                    var message = this.account.chats.receiveChatMessage($message, {pinned_message: true});
                    this.set('pinned_message', message);
                    this.renderPinnedMessage(message, pinned_msg_elem);
                }
            },

            renderPinnedMessage: function (message, pinned_msg_elem) {
                if (!message) {
                    pinned_msg_elem.html("");
                    pinned_msg_elem.siblings('.chat-content').css({'height':'100%'});
                }
                else {
                    var images = message.get('images'),
                        files = message.get('files'),
                        fwd_message = message.get('forwarded_message'),
                        fwd_msg_author = null,
                        msg_text = _.escape(message.get('message'));
                    if (fwd_message) {
                        let user_info = fwd_message[0].get('user_info') || {};
                        if (msg_text) {
                        } else if (fwd_message.length > 1)
                            msg_text = fwd_message.length + ' forwarded messages';
                        else {
                            msg_text = fwd_message[0].get('message') || fwd_message[0].get('forwarded_message') && (fwd_message[0].get('forwarded_message').length + ' forwarded messages');
                            fwd_msg_author = user_info.nickname || fwd_message[0].get('from_jid') || user_info.id;
                        }
                    }
                    if (images) {
                        if (images.length == 1)
                            msg_text = '<span class=text-color-500>Image: </span>' + images[0].name;
                        if (images.length > 1)
                            msg_text = '<span class=text-color-500>' + images.length + ' images</span>';
                    }
                    if (files) {
                        if (files.length == 1)
                            msg_text = '<span class=text-color-500>File: </span>' + files[0].name + ' (' + files[0].size + ')';
                        if (files.length > 1)
                            msg_text = '<span class=text-color-500>' + files.length + ' files</span>';
                    }

                    let user_info = message.get('user_info') || {},
                        chat_content = this.account.chats.get(this.hash_id).item_view.content,
                        is_scrolled = chat_content.isScrolledToBottom(),
                        msg_author = user_info.nickname || message.get('from_jid') || user_info.id,
                        pinned_msg = {
                            author: msg_author,
                            time: utils.pretty_datetime(message.get('time')),
                            message: msg_text,
                            fwd_author: fwd_msg_author
                        },
                        pinned_msg_html = $(templates.group_chats.pinned_message(pinned_msg));
                    pinned_msg_elem.html(pinned_msg_html).emojify('.chat-msg-content', {emoji_size: 18});
                    var height_pinned_msg = pinned_msg_elem.height();
                    pinned_msg_elem.siblings('.chat-content').css({
                        'height': 'calc(100% - ' + height_pinned_msg + 'px)'
                    });
                    if (is_scrolled)
                        chat_content.scrollToBottom();
                    pinned_msg_elem.attr('data-uniqueid', message.get('unique_id'));
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

            searchByParticipants: function (query, callback) {
                let participants_list = [];
                this.participants.forEach(function (participant) {
                    let jid = participant.get('jid');
                    // if (jid !== this.account.get('jid')) {
                        if (query) {
                            query = query.toLowerCase();
                            let nickname = participant.get('nickname'),
                                id = participant.get('id');
                            if (jid && jid.toLowerCase().indexOf(query) > -1 || /*id && id.toLowerCase().indexOf(query) > -1 ||*/ nickname && nickname.toLowerCase().indexOf(query) > -1)
                                participants_list.push(participant);
                        } else
                            participants_list.push(participant);
                    // }
                }.bind(this));
                callback && callback(participants_list);
            },

            updateName: function () {
                if (this.get('roster_name') && this.get('name') !== this.get('roster_name'))
                    this.set('name', this.get('roster_name'));
            },

            showDetails: function (screen) {
                screen || (screen = 'contacts');
                xabber.body.setScreen(screen, {right: 'contact_details', contact: this});
            }
        });

        xabber.SetGroupchatStatusView = xabber.BasicView.extend({
            className: 'modal main-modal change-status-modal',
            template: templates.group_chats.set_status,

            events: {
                "click .status-values li": "changeStatus"
            },

            open: function (contact) {
                this.contact = contact;
                this.account = this.contact.account;
                this.show();
                this.getStatuses();
            },

            highlightStatus: function (status) {
                this.$('.status-values li[data-value="'+status+'"]').addClass('active')
                    .siblings().removeClass('active');
            },

            getStatuses: function () {
                let iq_get_properties = $iq({to: this.contact.get('jid'), type: 'get'})
                    .c('query', {xmlns: Strophe.NS.GROUP_CHAT});
                this.account.sendIQ(iq_get_properties, function (properties) {
                    this.data_form = this.account.parseDataForm($(properties).find('x[xmlns="' + Strophe.NS.DATAFORM + '"]'));
                    let options = (this.data_form.fields.find(field => field.var == 'status') || []).options || [];
                    if (!options.length) {
                        this.closeModal();
                        utils.dialogs.error("You have no permission to set group chat's status");
                        return;
                    }
                    this.renderStatuses(options);
                }.bind(this));
            },

            renderStatuses: function (options) {
                this.$('.status-values').html("");
                options.forEach(function (option) {
                    let $status_item = $(templates.group_chats.status_item({option: option}));
                    this.$('.status-values').append($status_item);
                }.bind(this));
                this.highlightStatus(this.contact.get('status'));
            },

            changeStatus: function (ev) {
                var status = $(ev.target).closest('li').data('value');
                this.highlightStatus(status);
                this.do_change();
                this.closeModal();
            },

            do_change: function () {
                var status = this.$('.status-values li.active').data('value');
                this.setStatus(status);
            },

            render: function () {
                this.$el.openModal({
                    complete: this.close.bind(this)
                });
            },

            setStatus: function (status) {
                if (!this.data_form || this.contact.get('group_info').status === status)
                    return;
                let iq_set_status = $iq({to: this.contact.get('jid'), type: 'set'})
                        .c('query', {xmlns: Strophe.NS.GROUP_CHAT}),
                    status_field = this.data_form.fields.find(field => field.var === 'status'),
                    idx = this.data_form.fields.indexOf(status_field);
                status_field.values = [status];
                this.data_form.fields[idx] = status_field;
                iq_set_status = this.account.addDataFormToStanza(iq_set_status, this.data_form);
                this.account.sendIQ(iq_set_status);
            },

            onHide: function () {
                this.$el.detach();
            },

            close: function () {
                var value = this.$('.status-message').val();
                if (!value) {
                    this.do_change();
                }
                this.closeModal();
            },

            closeModal: function () {
                this.$el.closeModal({ complete: this.hide.bind(this) });
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
                this.updateGroupChat();
                this.updateIcon();
                this.model.on("change:name", this.updateName, this);
                this.model.on("change:image", this.updateAvatar, this);
                this.model.on("change:status_updated", this.updateStatus, this);
                this.model.on("change:private_chat", this.updateIcon, this);
                this.model.on("change:incognito_chat", this.updateIcon, this);
                this.model.on("change:bot", this.updateIcon, this);
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
                this.$('.chat-icon').attr('data-status', this.model.get('status'));
                this.$('.status-message').text(this.model.getStatusMessage());
                if (this.model.get('status') == 'offline') {
                    if (!Strophe.getNodeFromJid(this.model.get('jid'))) {
                        this.model.set({status_message: 'Server'});
                        return;
                    }
                    if (this.model.get('last_seen')) {
                    var seconds = (moment.now() - this.model.get('last_seen'))/1000,
                        new_status = utils.pretty_last_seen(seconds);
                    this.model.set({ status_message: new_status });
                    }
                }
            },

            selectView: function () {
                if (this.model.get('group_chat')) {
                    this.$('.private-chat').addClass('hidden');
                    this.$('.group_chat').removeClass('hidden');
                }
            },

            lastSeenUpdated: function () {
                if (this.model.get('status') == 'offline' && this.model.get('last_seen') && _.isUndefined(this.interval_last)) {
                    this.interval_last = setInterval(function() {
                        var seconds = (moment.now() - this.model.get('last_seen'))/1000,
                            new_status = utils.pretty_last_seen(seconds);
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
                this.$('.status').hideIf(is_group_chat);
                this.updateIcon();
            },

            updateIcon: function () {
                let ic_name;
                this.$('.chat-icon').addClass('hidden');
                if (this.model.get('blocked')) {
                    ic_name = 'ic-blocked';
                } else {
                    if (this.model.get('invitation')) {
                        return;
                    } else if (this.model.get('group_chat')) {
                        if (this.model.get('private_chat'))
                            ic_name = 'ic-private-contact';
                        else if (this.model.get('incognito_chat'))
                            ic_name = 'ic-incognito-contact';
                        else
                            ic_name = 'ic-group-contact';
                    } else if (this.model.get('bot'))
                        ic_name = 'ic-bot-contact';
                }
                ic_name && this.$('.chat-icon').removeClass('hidden').children('svg').html(env.templates.svg[ic_name]());
            },

            updateStatusMsg: function() {
                this.$('.status-message').text(this.model.getStatusMessage());
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
                let attrs = {status_updated: moment.now()};
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
            onResourceAdded: function (resource) {
                this.addChild(resource.get('resource'),
                    xabber.ResourceView, {model: resource});
                this.updatePosition(resource);
                this.$el.removeClass('hidden');
                this.parent.updateScrollBar();
            },

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
                "click .btn-vcard-refresh": "refresh",
                "click .details-icon": "onClickIcon"
            }
        });

        xabber.ContactDetailsView = xabber.BasicView.extend({
            className: 'details-panel contact-details-panel',
            template: templates.contact_details,
            ps_selector: '.panel-content-wrap',
            avatar_size: constants.AVATAR_SIZES.CONTACT_DETAILS,

            events: {
                "click .btn-escape": "openChat",
                "click .btn-chat": "openChat",
                "click .btn-voice-call": "voiceCall",
                "click .btn-add": "addContact",
                "click .btn-delete": "deleteContact",
                "click .btn-block": "blockContact",
                "click .btn-qr-code": "showQRCode",
                "click .btn-unblock": "unblockContact",
                "click .btn-mute": "changeNotifications",
                "click .btn-auth-request": "requestAuthorization",
                "change .subscription-info-wrap input": "onChangedSubscription"
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
                xabber.on("change:video", this.updateJingleButtons, this);
                xabber.on("change:audio", this.updateJingleButtons, this);
            },

            render: function (options) {
                if (!this.model.get('vcard_updated')) {
                    this.vcard_view.refresh();
                }
                let dropdown_settings = {
                    inDuration: 100,
                    outDuration: 100,
                    constrainWidth: false,
                    hover: false,
                    alignment: 'right'
                };
                this.$('.main-info .dropdown-button').dropdown(dropdown_settings);
                this.updateSubscriptions();
                this.updateJingleButtons();
                this.updateStatusMsg();
                this.updateName();
                this.model.resources.models.forEach(function (resource) {this.model.resources.requestInfo(resource)}.bind(this));
            },

            onChangedVisibility: function () {
                this.model.set('display', this.isVisible());
            },

            updateJingleButtons: function () {
                this.$('.btn-voice-call').switchClass('non-active', !xabber.get('audio'));
            },

            update: function () {
                var changed = this.model.changed;
                if (_.has(changed, 'name')) this.updateName();
                if (_.has(changed, 'image')) this.updateAvatar();
                if (_.has(changed, 'status_updated')) this.updateStatus();
                if (_.has(changed, 'muted')) this.updateNotifications();
                if (_.has(changed, 'subscription')) this.updateSubscriptions();
                if (_.has(changed, 'subscription_request_in')) this.updateSubscriptions();
                if (_.has(changed, 'blocked')) this.updateStatusMsg();
                if (_.has(changed, 'status_message')) this.updateStatusMsg();
                if (_.has(changed, 'in_roster') || _.has(changed, 'blocked') ||
                    _.has(changed, 'subscription')) {
                    this.updateButtons();
                }
            },

            updateName: function () {
                this.$('.main-info .contact-name').text(this.model.get('name'));
                if (this.model.get('name') != this.model.get('roster_name'))
                    this.$('.main-info .contact-name').addClass('name-is-custom');
                else
                    this.$('.main-info .contact-name').removeClass('name-is-custom');
            },

            updateStatus: function () {
                this.$('.main-info .status').attr('data-status', this.model.get('status'));
                this.$('.main-info .status-message').text(this.model.getStatusMessage());
            },

            updateStatusMsg: function () {
                this.$('.main-info .status-message').text(this.model.getStatusMessage());
            },

            updateAvatar: function () {
                var image = this.model.cached_image;
                this.$('.circle-avatar').setAvatar(image, this.avatar_size);
            },

            updateButtons: function () {
                var in_roster = this.model.get('in_roster'),
                    is_blocked = this.model.get('blocked'),
                    is_server = this.model.get('is_server'),
                    subscription = this.model.get('subscription');
                this.$('.btn-add').hideIf(in_roster);
                this.$('.btn-delete').showIf(in_roster);
                this.$('.btn-block-wrap i').switchClass('btn-block', !is_blocked).switchClass('btn-unblock', is_blocked);
                this.$('.btn-block-wrap .btn-name').text(is_blocked ? 'Unblock' : 'Block');
                this.$('.buttons-wrap .button-wrap:not(.btn-block-wrap)').switchClass('non-active', is_blocked);
                this.$('.btn-auth-request').showIf(!is_server && in_roster && !is_blocked &&
                    subscription !== 'both' && subscription !== 'to');
            },

            updateNotifications: function () {
                this.$('.btn-mute').switchClass('mdi-bell-off', this.model.get('muted'));
                this.$('.btn-mute').switchClass('mdi-bell', !this.model.get('muted'));
            },

            showQRCode: function () {
                let qrcode = new VanillaQR({
                    url: 'xmpp:' + this.model.get('jid'),
                    noBorder: true
                });
                utils.dialogs.ask("QR-code", null, {canvas: qrcode.domElement, bottom_text: ('<div class="name">' + this.model.get('name') + '</div><div class="jid">' + this.model.get('jid') + '</div>')}, { ok_button_text: 'copy'}).done(function (result) {
                    if (result) {
                        qrcode.domElement.toBlob(blob => navigator.clipboard.write([new ClipboardItem({'image/png': blob})]));
                    }
                }.bind(this));
            },

            updateSubscriptions: function () {
                let subscription = this.model.get('subscription'),
                    in_request = this.model.get('subscription_request_in'),
                    out_request = this.model.get('subscription_request_out'),
                    $label_outcoming = this.$('label[for="outcoming-subscription"]'),
                    $label_incoming = this.$('label[for="incoming-subscription"]');
                if (subscription === 'both') {
                    $label_incoming.text('Send presence updates').prev('input').prop('checked', true);
                    $label_outcoming.text('Receive presence updates').prev('input').prop('checked', true);
                } else if (subscription === 'from') {
                    $label_incoming.text('Send presence updates').prev('input').prop('checked', true);
                    $label_outcoming.text('Ask for presence updates').prev('input').prop('checked', false);
                } else if (subscription === 'to') {
                    $label_incoming.text('Preemptively grant subscription request').prev('input').prop('checked', this.model.get('subscription_preapproved') ? true : false);
                    $label_outcoming.text('Receive presence updates').prev('input').prop('checked', true);
                }
                else if (!subscription) {
                    $label_incoming.text('Preemptively grant subscription request').prev('input').prop('checked', this.model.get('subscription_preapproved') ? true : false);
                    $label_outcoming.text('Ask for presence updates').prev('input').prop('checked', false);
                }
                if (in_request) {
                    $label_incoming.text('Send presence updates').prev('input').prop('checked', false);
                }
                if (out_request) {
                    $label_outcoming.text('Ask for presence updates').prev('input').prop('checked', true);
                }
            },

            onChangedSubscription: function (ev) {
                let contact = this.model,
                    $target = $(ev.target),
                    is_checked = $target.prop('checked');
                if (is_checked) {
                    if ($target.attr('id') === "outcoming-subscription")
                        contact.askRequest();
                    else {
                        contact.acceptRequest();
                        contact.set('subscription_preapproved', true);
                    }
                }
                else {
                    if ($target.attr('id') === "outcoming-subscription")
                        contact.declineSubscription();
                    else
                        contact.declineSubscribe();
                }
            },

            openChat: function (ev) {
                if (ev && ($(ev.target).closest('.button-wrap').hasClass('non-active') || $(ev.target).closest('.button-wrap').length && this.model.get('blocked')))
                    return;
                this.model.trigger("open_chat", this.model);
            },

            voiceCall: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active') || this.model.get('blocked'))
                    return;
                if (xabber.get('audio'))
                    this.initCall(ev);
            },

            initCall: function (ev) {
                if (xabber.current_voip_call) {
                    utils.callback_popup_message('Voice call is already in progress', 1000);
                    return;
                }
                this.openChat();
                let chat = this.account.chats.getChat(this.model);
                chat.item_view.content.initJingleMessage();
            },

            changeNotifications: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active') || this.model.get('blocked'))
                    return;
                var muted = !this.model.get('muted');
                this.model.set('muted', muted);
                this.account.chat_settings.updateMutedList(this.model.get('jid'), muted);
            },

            addContact: function () {
                xabber.add_contact_view.show({account: this.account, jid: this.model.get('jid')});
            },

            deleteContact: function () {
                var contact = this.model;
                utils.dialogs.ask("Delete contact", "Do you really want to delete contact "+ contact.get('name').bold() +
                    " from account " + this.account.get('jid').bold() + "?",
                    [{ name: 'delete_history', checked: false, text: 'Delete chat history'}],
                    { ok_button_text: 'delete'}).done(function (result) {
                        if (result) {
                            contact.removeFromRoster();
                            if (result.delete_history) {
                                let chat = this.account.chats.getChat(contact);
                                chat.retractAllMessages(false);
                                chat.deleteFromSynchronization();
                                xabber.body.setScreen('all-chats', {right: undefined});
                            }
                            xabber.trigger("clear_search");
                        }
                    }.bind(this));
            },

            blockContact: function () {
                var contact = this.model;
                utils.dialogs.ask_extended("Block contact", "Do you really want to block " + contact.get('name').bold() +
                    " from account " + this.account.get('jid').bold() +
                    "?\nYou will be unable to exchange messages and presence updates with " + contact.get('jid').bold(), null,
                    { ok_button_text: 'block', optional_button: 'block & delete'}).done(function (result) {
                    if (result) {
                        let chat = this.account.chats.getChat(contact);
                        if (result === 'block & delete') {
                            contact.removeFromRoster();
                            chat.retractAllMessages(false);
                            chat.deleteFromSynchronization();
                        }
                        contact.blockRequest();
                        xabber.trigger("clear_search");
                        xabber.body.setScreen('all-chats', {right: undefined});
                        chat.set('active', false);
                    }
                }.bind(this));
            },

            unblockContact: function () {
                var contact = this.model;
                utils.dialogs.ask("Unblock contact", "Do you really want to unblock "+
                    " from account " + this.account.get('jid').bold() + "?", null,
                    { ok_button_text: 'unblock'}).done(function (result) {
                    if (result) {
                        contact.unblock();
                        xabber.trigger("clear_search");
                    }
                });
            },

            requestAuthorization: function () {
                this.model.pres('subscribe');
                this.model.trigger('presence', this.model, 'subscribe_from');
                this.openChat();
            }
        });

        xabber.GroupChatDetailsView = xabber.BasicView.extend({
            className: 'details-panel groupchat-details-panel',
            template: templates.group_chats.group_chat_details,
            ps_selector: '.panel-content-wrap',
            avatar_size: constants.AVATAR_SIZES.CONTACT_DETAILS,
            member_avatar_size: constants.AVATAR_SIZES.GROUPCHAT_MEMBER_ITEM,

            events: {
                "click .btn-mute": "changeNotifications",
                "click .btn-qr-code": "showQRCode",
                "click .btn-leave": "leaveGroupChat",
                "click .btn-invite": "inviteUser",
                "click .btn-delete-group": "deleteGroupChat",
                "click .btn-edit-settings": "editProperties",
                "click .btn-default-restrictions": "editDefaultRestrictions",
                "click .btn-chat": "openChat",
                "click .btn-escape": "openChat",
                "click .btn-clear-history": "retractAllMessages",
                "change .circle-avatar input": "changeAvatar",
                "click .list-variant": "changeList"
            },

            _initialize: function () {
                this.account = this.model.account;
                this.name_field = new xabber.ContactNameWidget({
                    el: this.$('.name-wrap')[0],
                    model: this.model
                });
                this.participants = this.addChild('participants', xabber.ParticipantsView, {model: this.model, el: this.$('.participants-wrap')[0]});
                this.edit_groups_view = this.addChild('groups',
                    xabber.ContactEditGroupsView, {el: this.$('.groups-block-wrap')[0]});
                this.group_chat_properties = this.addChild('properties_view', xabber.GroupChatPropertiesView, {model:this.model, el: this.$('.group-chat-properties-wrap')[0]});
                this.group_chat_status = this.addChild('status_view', xabber.GroupChatStatusView, {model:this.model, el: this.$('.status-block-wrap')[0]});
                this.group_chat_properties_edit = new xabber.GroupChatPropertiesEditView({model: this.model});
                this.default_restrictions_edit = new xabber.DefaultRestrictionsView({model: this.model});
                this.updateName();
                this.updateStatus();
                this.updateAvatar();
                this.updateColorScheme();
                this.account.settings.on("change:color", this.updateColorScheme, this);
                this.model.on("change", this.update, this);
                this.model.on("permissions_changed", this.updateButtons, this);
            },

            render: function (options) {
                this.updateName();
                this.updateButtons();
                if (!this.model.my_rights)
                    this.model.getMyInfo(function () {
                        this.updateButtons();
                    }.bind(this));
                this.$('.btn-delete').showIf(this.model.get('subscription') === "both");
                this.$('.btn-join').showIf(this.model.get('subscription') !== "both");
                let dropdown_settings = {
                    inDuration: 100,
                    outDuration: 100,
                    constrainWidth: false,
                    hover: false,
                    alignment: 'right'
                };
                this.$('.select-users-list-wrap .dropdown-button').dropdown(dropdown_settings);
                this.$('.main-info .dropdown-button').dropdown(dropdown_settings);
                this.updateList('participants');
                this.$('.tabs .indicator').remove();
                this.$('.tabs').tabs();
                this.$('.indicator').addClass('ground-color-500');
                return this;
            },

            update: function () {
                var changed = this.model.changed;
                if (_.has(changed, 'name')) this.updateName();
                if (_.has(changed, 'image')) this.updateAvatar();
                if (_.has(changed, 'muted')) this.updateNotifications();
                if (_.has(changed, 'status_updated') || _.has(changed, 'status_message')) this.updateStatus();
            },

            updateColorScheme: function () {
                this.$el.attr('data-color', this.account.settings.get('color'));
            },

            updateButtons: function () {
                let has_permission = this.model.my_rights && this.model.my_rights.fields.find(permission => (permission.var == 'owner' || permission.var == 'administrator') && permission.values),
                    is_blocked = this.model.get('blocked');
                this.$('.btn-settings-wrap').switchClass('non-active', !has_permission);
                this.$('.btn-leave-wrap').switchClass('non-active', this.model.get('subscription') != 'both');
                this.$('.btn-invite-wrap').switchClass('non-active', this.model.get('subscription') != 'both');
                this.$('.btn-default-restrictions-wrap').switchClass('non-active', !has_permission);
                this.$('.btn-invite-wrap').switchClass('non-active', this.model.get('private_chat'));
                this.$('.btn-block').hideIf(is_blocked);
                this.$('.btn-unblock').showIf(is_blocked);
            },

            updateName: function () {
                this.$('.main-info .contact-name').text(this.model.get('name'));
                if (this.model.get('name') != this.model.get('roster_name'))
                    this.$('.main-info .contact-name').addClass('name-is-custom');
                else
                    this.$('.main-info .contact-name').removeClass('name-is-custom');
            },

            changeNotifications: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active') || this.model.get('blocked'))
                    return;
                var muted = !this.model.get('muted');
                this.model.set('muted', muted);
                this.account.chat_settings.updateMutedList(this.model.get('jid'), muted);
            },

            updateNotifications: function () {
                this.$('.btn-mute').switchClass('mdi-bell-off', this.model.get('muted'));
                this.$('.btn-mute').switchClass('mdi-bell', !this.model.get('muted'));
            },

            deleteGroupChat: function () {
                var contact = this.model;
                utils.dialogs.ask("Delete groupchat", "Do you want to delete groupchat "+
                    contact.get('name')+"?", null, { ok_button_text: 'delete'}).done(function (result) {
                    if (result) {
                        let jid = contact.get('jid'),
                            domain = Strophe.getDomainFromJid(jid),
                            localpart = Strophe.getNodeFromJid(jid),
                            iq = $iq({to: domain, type: 'set'})
                                .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#delete'}).t(localpart);
                        this.account.sendIQ(iq, function () {
                            contact.declineSubscription();
                            contact.removeFromRoster();
                            let chat = this.account.chats.getChat(contact);
                            chat.trigger("close_chat");
                            xabber.body.setScreen('all-chats', {right: undefined});
                        }.bind(this));
                    }
                }.bind(this));
            },

            showQRCode: function () {
                let qrcode = new VanillaQR({
                    url: 'xmpp:' + this.model.get('jid'),
                    noBorder: true
                });
                utils.dialogs.ask("QR-code", null, {canvas: qrcode.domElement, bottom_text: ('<div class="name">' + this.model.get('name') + '</div><div class="jid">' + this.model.get('jid') + '</div>')}, { ok_button_text: 'copy'}).done(function (result) {
                    if (result) {
                        qrcode.domElement.toBlob(blob => navigator.clipboard.write([new ClipboardItem({'image/png': blob})]));
                    }
                }.bind(this));
            },

            editProperties: function (ev) {
                if (!$(ev.target).closest('.button-wrap').hasClass('non-active')) {
                        let iq_get_properties = $iq({to: this.model.get('jid'), type: 'get'})
                            .c('query', {xmlns: Strophe.NS.GROUP_CHAT});
                        this.account.sendIQ(iq_get_properties, function (properties) {
                            let data_form = this.account.parseDataForm($(properties).find('x[xmlns="' + Strophe.NS.DATAFORM + '"]'));
                            this.group_chat_properties_edit.open(data_form);
                        }.bind(this));
                }
            },

            editDefaultRestrictions: function (ev) {
                if (!$(ev.target).closest('.button-wrap').hasClass('non-active'))
                    this.default_restrictions_edit.open();
            },

            leaveGroupChat: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active'))
                    return;
                var contact = this.model;
                utils.dialogs.ask("Leave groupchat", "Do you want to leave groupchat "+
                    contact.get('name')+"?", null, { ok_button_text: 'leave'}).done(function (result) {
                    if (result) {
                        contact.declineSubscription();
                        contact.removeFromRoster();
                        let chat = this.account.chats.getChat(contact);
                        chat.deleteFromSynchronization(function () {
                            chat.trigger("close_chat");
                            xabber.body.setScreen('all-chats', {right: undefined});
                        }.bind(this), function () {
                            chat.trigger("close_chat");
                            xabber.body.setScreen('all-chats', {right: undefined});
                        }.bind(this));
                    }
                }.bind(this));
            },

            inviteUser: function (ev) {
                if (!$(ev.target).closest('.button-wrap').hasClass('non-active'))
                    xabber.invite_panel.open(this.account, this.model);
            },

            changeList: function (ev) {
                let $target = $(ev.target).closest('.list-variant'),
                    list_name = $target.data('value');
                this.updateList(list_name);
            },

            updateList: function (name) {
                let view = this.child(name);
                !view && (view = this.addList(name));
                if (view) {
                    this.$('.tabs .list-variant a').removeClass('active');
                    this.$('.tabs .list-variant[data-value="' + name + '"] a').addClass('active');
                    view._render();
                }
            },

            addList: function (name) {
                let constructor_func;
                switch (name) {
                    case 'blocked':
                        constructor_func = xabber.BlockedView;
                        break;
                    case 'invitations':
                        constructor_func = xabber.InvitationsView;
                        break;
                };
                if (constructor_func)
                    return this.addChild(name, constructor_func, {model: this.model, el: this.$('.participants-wrap')[0]});
                else
                    return;
            },

            getInvitations: function (callback, errback) {
                let iq = $iq({
                    type: 'get',
                    to: this.model.get('jid')})
                    .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#invite'});
                this.account.sendIQ(iq, callback, errback);
            },

            getBlockedParticipants: function (callback, errback) {
                let iq = $iq({
                    type: 'get',
                    to: this.model.get('jid')})
                    .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#block'});
                this.account.sendIQ(iq, callback, errback);
            },

            deleteContact: function (ev) {
                var contact = this.model;
                utils.dialogs.ask("Delete contact", "Do you want to delete "+
                    contact.get('name')+" from contacts?", null, { ok_button_text: 'delete'}).done(function (result) {
                    if (result) {
                        contact.removeFromRoster();
                        contact.trigger('archive_chat');
                        xabber.trigger("clear_search");
                    }
                });
            },

            blockContact: function () {
                var contact = this.model;
                utils.dialogs.ask("Block group chat", "Do you want to block "+
                    contact.get('name')+"?", null, { ok_button_text: 'block'}).done(function (result) {
                    if (result) {
                        contact.blockRequest();
                        xabber.trigger("clear_search");
                    }
                });
            },

            unblockContact: function () {
                var contact = this.model;
                utils.dialogs.ask("Unblock contact", "Do you want to unblock "+
                    contact.get('name')+"?", null, { ok_button_text: 'unblock'}).done(function (result) {
                    if (result) {
                        contact.unblock();
                        xabber.trigger("clear_search");
                    }
                });
            },

            updateStatus: function () {
                this.$('.main-info .status-message').text(this.model.getStatusMessage());
            },

            updateAvatar: function () {
                let image = this.model.cached_image;
                this.$('.main-info .circle-avatar').setAvatar(image, this.avatar_size);
            },

            openChat: function () {
                this.model.trigger("open_chat", this.model);
            },

            changeAvatar: function (ev) {
                var field = ev.target;
                if (!field.files.length) {
                    return;
                }
                $(field).siblings('.preloader-wrap').addClass('visible').find('.preloader-wrapper').addClass('active');
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
                        this.model.pubAvatar(file, "", function () {
                            $(field).siblings('.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');
                        }, function (error) {
                            $(field).siblings('.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');
                            let error_text = $(error).find('text').text() || 'You have no permissions to change avatar';
                            utils.dialogs.error(error_text);
                        });
                    }
                }.bind(this));
            },

            retractAllMessages: function () {
                var group_chat = this.account.chats.getChat(this.model);
                utils.dialogs.ask("Clear message archive", "Do you want to delete all messages from archive?", null, { ok_button_text: 'delete'}).done(function (result) {
                    if (result) {
                        group_chat.retractAllMessages(true);
                    }
                }.bind(this));
            }
        });

        xabber.GroupChatStatusView = xabber.BasicView.extend({
            template: templates.group_chats.group_status,
            events: {
                "click .status-wrap": "setStatus",
                "click .btn-edit-status": "setStatus"
            },

            _initialize: function () {
                this.$el.html(this.template());
                this.render();
                this.model.on("change:group_info", this.render, this);
            },

            render: function () {
                let group_info;
                this.model.get('group_info') && (group_info = this.model.get('group_info'));
                if (!group_info)
                    return;
                this.$('.status').attr('data-status', this.model.get('status'));
                this.$('.status-message').text(group_info.status_msg);
            },

            setStatus: function () {
                let set_status_view = new xabber.SetGroupchatStatusView();
                set_status_view.open(this.model);
            }
        });

        xabber.GroupChatPropertiesView = xabber.BasicView.extend({
            template: templates.group_chats.group_chat_properties,

            events: {
                "click .group-chat-properties .details-icon": "onClickIcon"
            },

            _initialize: function () {
                this.$el.html(this.template());
                this.contact = this.model;
                this.account = this.model.account;
                this.model.on("change:name", this.updateName, this);
                this.model.on("change:group_info", this.update, this);
            },

            render: function () {
                if (!this.model.get('vcard_updated'))
                    this.model.vcard &&  this.model.vcard.refresh();
                this.update();
            },

            update: function () {
                let info = this.model.get('group_info') || {};
                this.$('.block-name').text((info.anonymous || (this.model.get('incognito_group') || this.model.get('private_group')) && 'Incognito') + " group");
                this.$('.jabber-id .value').text(info.jid);
                this.$('.name .value').text(info.name);
                this.$('.description .value').text(info.description);
                this.$('.model .value').text(utils.pretty_name(info.model));
                this.$('.status .value').text(utils.pretty_name(info.status));
                this.$('.searchable .value').text((info.searchable === 'none') ? 'No' : utils.pretty_name(info.searchable));
                this.$('.name-info-wrap').switchClass('hidden', !info.name);
                this.$('.description-info-wrap').switchClass('hidden', !info.description);
                this.$('.model-info-wrap').switchClass('hidden', !info.model);
                this.$('.status-info-wrap').switchClass('hidden', !info.status);
                this.$('.searchable-info-wrap').switchClass('hidden', !info.searchable);
            },

            onClickIcon: function (ev) {
                let $target_info = $(ev.target).closest('.info-wrap'),
                    $target_value = $target_info.find('.value'), copied_text = "";
                $target_value.each(function (idx, item) {
                    let $item = $(item),
                        value_text = $item.text();
                    if ($target_info.hasClass('searchable-info-wrap')) {
                        let label_name = $target_info.find('.label').first().text();
                        if (value_text === 'No')
                            value_text += ' ' + label_name.toLowerCase();
                        else
                            if (value_text === 'Yes')
                                value_text = label_name;
                    }
                    value_text && (copied_text != "") && (copied_text += '\n');
                    value_text && (copied_text += value_text);
                    copied_text && utils.copyTextToClipboard(copied_text, 'Copied in clipboard', 'ERROR: Not copied in clipboard');
                }.bind(this));
            }
        });

        xabber.GroupChatPropertiesEditView = xabber.BasicView.extend({
            className: 'modal dialog-modal group-chat-properties-edit',

            events: {
                "click .btn-save": "saveChanges",
                "click .btn-cancel": "close",
                "change input": "updateSaveButton",
                "keyup .property-wrap .text-field": "updateSaveButton"
            },

            _initialize: function () {
                this.account = this.model.account;
                this.contact = this.model;
                this.model.on("change:name", this.updateName, this);
            },

            open: function (data_form) {
                this.data_form = data_form;
                this.$el.html(templates.group_chats.group_chat_properties_edit({fields: data_form.fields, anonymous: utils.pretty_name(this.contact.get('group_info').anonymous), jid: this.model.get('jid')}));
                this.$el.openModal({
                    ready: function () {
                        this.$('.modal-content').css('height', this.$el.height() - 115).perfectScrollbar({theme: 'item-list'});
                        this.updateScrollBar();
                    }.bind(this),
                    complete: function () {
                        this.$el.detach();
                        this.$('.modal-content').css('height', '100%');
                        this.data.set('visible', false);
                    }.bind(this)
                });
            },

            close: function () {
                this.$el.closeModal({
                    complete: function () {
                        this.hide.bind(this);
                    }.bind(this)
                });
            },

            updateName: function () {
                this.$('.name-info-wrap').find('.name').find('.value').text(this.model.get('name'));
            },

            saveChanges: function() {
                if (this.$('.btn-save').hasClass('non-active'))
                    return;

                let has_changes = false,
                    iq = $iq({type: 'set', to: this.contact.get('jid')})
                        .c('query', {xmlns: Strophe.NS.GROUP_CHAT});
                this.data_form.fields.forEach(function (field) {
                    if (field.type === 'hidden' || field.type === 'fixed')
                        return;
                    var value = field.values ? field.values[0] : null,
                        checked_inp = this.$('.' + field.var + '-field input:checked'),
                        text_inp = this.$('.' + field.var + '-field input[type="text"]'),
                        textarea = this.$('.' + field.var + '-field textarea'),
                        new_value = "";
                    checked_inp.length && (new_value = checked_inp[0].id);
                    text_inp.length && (new_value = text_inp.val());
                    textarea.length && (new_value = textarea.val());
                    if (value !== new_value) {
                        let field_idx = this.data_form.fields.indexOf(field);
                        field.values = [new_value];
                        this.data_form.fields[field_idx] = field;
                        has_changes = true;
                    }
                }.bind(this));

                if (has_changes) {
                    iq = this.account.addDataFormToStanza(iq, this.data_form);
                    this.account.sendIQ(iq, function (result) {
                        let $result  = $(result),
                            group_info = _.clone(this.contact.get('group_info')),
                            attrs = {
                                name: $result.find('field[var="name"] value').text(),
                                searchable: $result.find('field[var="index"]').children('value').text(),
                                model: $result.find('field[var="membership"]').children('value').text(),
                                description: $result.find('field[var="description"] value').text(),
                                status: $result.find('field[var="status"]').children('value').text()
                        };
                        this.$('button').addClass('non-active');
                        this.close();
                        _.extend(group_info, attrs);
                        this.model.set('group_info', group_info);
                    }.bind(this), function (error) {
                        this.$('button').addClass('non-active');
                        let err_text = $(error).find('error text').text() || 'You have no permission to change chat properties';
                        this.close();
                        utils.dialogs.error(err_text);
                    }.bind(this));
                } else
                    this.$('button').removeClass('non-active');
            },

            updateSaveButton: function () {
                let has_changes = false;
                this.data_form.fields.forEach(function (field) {
                    if (field.type === 'hidden' || field.type === 'fixed')
                        return;
                    var value = field.values ? field.values[0] : null,
                        checked_inp = this.$('.' + field.var + '-field input:checked'),
                        text_inp = this.$('.' + field.var + '-field input[type="text"]'),
                        textarea = this.$('.' + field.var + '-field textarea'),
                        new_value = "";
                    checked_inp.length && (new_value = checked_inp[0].id);
                    text_inp.length && (new_value = text_inp.val());
                    textarea.length && (new_value = textarea.val());
                    (value !== new_value) && (has_changes = true);
                }.bind(this));
                this.$('.btn-save').switchClass('non-active', !has_changes);
            }

        });

        xabber.InvitationsView = xabber.BasicView.extend({
            events: {
                "click .revoke-invitation": "revokeInvitation"
            },
            status: 'invitations',
            member_avatar_size: constants.AVATAR_SIZES.GROUPCHAT_MEMBER_ITEM,

            _initialize: function (options) {
                this.contact = options.model;
                this.account = this.contact.account;
                this.$error = $('<p class="errors"/>');
            },

            _render: function () {
                this.$el.html($(templates.preloader()));
                this.updateInvitations();
            },

            updateInvitations: function () {
                this.parent.getInvitations(function (response) {
                        if (this.$el.prev().find('.list-variant[data-value="' + this.status +'"] a').hasClass('active')) {
                            this.$el.html("");
                            $(response).find('query').find('user').each(function (idx, item) {
                                let user = {jid: $(item).attr('jid'), status: this.status},
                                    $item_view = $(templates.group_chats.invited_member_item(user)),
                                    avatar = Images.getDefaultAvatar(user.jid);
                                this.$el.append($item_view);
                                $item_view.find('.circle-avatar').setAvatar(avatar, this.member_avatar_size);
                            }.bind(this));
                            if (!$(response).find('query').find('user').length)
                                this.$el.html(this.$error.text('No pending invitations'));
                        }
                    }.bind(this),
                    function(err) {
                        if (this.$el.prev().find('.list-variant[data-value="' + this.status +'"] a').hasClass('active'))
                            this.$el.html(this.$error.text($(err).find('text').text() || 'You do not have permission to see the list of invitations.'));
                    }.bind(this));
            },

            revokeInvitation: function (ev) {
                let $member_item = $(ev.target).closest('.invitations-user'),
                    member_jid = $member_item.data('jid'),
                    iq = $iq({from: this.account.get('jid'), to: this.contact.get('jid'), type: 'set'})
                        .c('revoke', {xmlns: Strophe.NS.GROUP_CHAT + '#invite'})
                        .c('jid').t(member_jid);
                this.account.sendIQ(iq, function () {
                    $member_item.remove();
                    !this.$el.children().length && this.$el.html(this.$error.text('No pending invitations'));
                }.bind(this));
            }
        });

        xabber.BlockedView = xabber.BasicView.extend({
            events: {
                "click .unblock-user": "unblockUser"
            },
            status: 'blocked',
            member_avatar_size: constants.AVATAR_SIZES.GROUPCHAT_MEMBER_ITEM,

            _initialize: function (options) {
                this.contact = options.model;
                this.account = this.contact.account;
                this.$error = $('<p class="errors"/>');
            },

            _render: function () {
                this.$el.html($(templates.preloader()));
                this.updateBlockedParticipants();
            },

            updateBlockedParticipants: function () {
                this.parent.getBlockedParticipants(function (response) {
                        if (this.$el.prev().find('.list-variant[data-value="' + this.status +'"] a').hasClass('active')) {
                            this.$el.html("");
                            $(response).find('query').find('user').each(function (idx, item) {
                                let user = {jid: $(item).attr('jid'), status: this.status},
                                    $item_view = $(templates.group_chats.invited_member_item(user)),
                                    avatar = Images.getDefaultAvatar(user.jid);
                                this.$el.append($item_view);
                                $item_view.find('.circle-avatar').setAvatar(avatar, this.member_avatar_size);
                            }.bind(this));
                            if (!$(response).find('query').find('user').length)
                                this.$el.html(this.$error.text('Block list is empty'));
                        }
                    }.bind(this),
                    function(err) {
                        if (this.$el.prev().find('.list-variant[data-value="' + this.status +'"] a').hasClass('active'))
                            this.$el.html(this.$error.text($(err).find('text').text() || 'You do not have permission to see the list of blocked users.'));
                    }.bind(this));
            },

            unblockUser: function (ev) {
                var $member_item = $(ev.target).closest('.blocked-user'),
                    member_jid = $member_item.data('jid'),
                    iq = $iq({from: this.account.get('jid'), type: 'set', to: this.contact.get('jid') })
                        .c('unblock', {xmlns: Strophe.NS.GROUP_CHAT + '#block' })
                        .c('jid').t(member_jid);
                this.account.sendIQ(iq, function () {
                    $member_item.remove();
                    !this.$el.children().length && this.$el.html(this.$error.text('Block list is empty'));
                }.bind(this));
            }
        });

        xabber.ParticipantsView = xabber.BasicView.extend({
            className: 'overflow-visible',
            ps_selector: '.members-list-wrap',
            ps_settings: {theme: 'item-list'},
            template: templates.group_chats.participants,
            member_avatar_size: constants.AVATAR_SIZES.GROUPCHAT_MEMBER_ITEM,

            events: {
                "click .participant-wrap": "showParticipantProperties",
                "keyup .participants-search-form" : "keyUpSearch",
                "click .close-search-icon": "clearSearch",
                "click .btn-block": "blockParticipant",
                "click .btn-kick": "kickParticipant"
            },

            _initialize: function () {
                this.account = this.model.account;
                this.participants = this.model.participants;
                this.model.on("update_participants", this.updateParticipants, this);
                this.$(this.ps_selector).perfectScrollbar(this.ps_settings);
            },

            _render: function () {
                this.$el.html(this.template()).addClass('request-waiting');
                this.participant_properties_panel = new xabber.ParticipantPropertiesView({model: this});
                this.updateParticipants();
                this.$('.members-list-wrap').perfectScrollbar({theme: 'item-list'});
                if (!this.model.all_rights)
                    this.model.getAllRights();
                return this;
            },

            updateParticipants: function () {
                this.participantsRequest(function (version) {
                    if (this.model.get('group_info')) {
                        (this.participants.version === 0) && (this.model.get('group_info').members_num = this.participants.length);
                        if (this.model.get('group_info').status === 'inactive')
                            return;
                        if (this.participants.length != this.model.get('group_info').members_num) {
                            this.account.groupchat_settings.resetParticipantsList(this.model.get('jid'));
                            this.participants.resetParticipants();
                            this.model.get('group_info').members_num = 0;
                            this.updateParticipants();
                            return;
                        }
                    }
                    if (this.participants.version > version)
                        return;
                    version && this.account.groupchat_settings.setParticipantsListVersion(this.model.get('jid'), version);
                    (this.participants.version < version) && this.participants.updateVersion();
                    this.participants.each(function (participant) {
                        this.renderMemberItem(participant);
                    }.bind(this));
                    this.$el.removeClass('request-waiting');
                }.bind(this));
            },

            blockParticipant: function (ev) {
                let $target = $(ev.target).closest('.participant-wrap');
                utils.dialogs.ask("Block member", "Do you want to block "+
                    $target.find('.participant-info .nickname').text() + "?", null, { ok_button_text: 'block'}).done(function (result) {
                    if (result) {
                        let participant = this.participants.get($target.attr('data-id'));
                        if (participant)
                            participant.block(function () {
                                    $target.remove();
                                    this.parent.updateScrollBar();
                                }.bind(this),
                                function (error) {
                                    if ($(error).find('not-allowed').length)
                                        utils.dialogs.error("You have no permission to block members");
                                });
                    }
                }.bind(this));
            },

            kickParticipant: function (ev) {
                let $target = $(ev.target).closest('.participant-wrap');
                utils.dialogs.ask("Kick member", "Do you want to kick "+
                    $target.find('.participant-info .nickname').text() + "?", null, { ok_button_text: 'kick'}).done(function (result) {
                    if (result) {
                        let participant = this.participants.get($target.attr('data-id'));
                        if (participant)
                            participant.kick(function () {
                                    $target.remove();
                                    this.parent.updateScrollBar();
                                }.bind(this),
                                function (error) {
                                    if ($(error).find('not-allowed').length)
                                        utils.dialogs.error("You have no permission to kick members");
                                });
                    }
                }.bind(this));
            },

            participantsRequest: function (callback) {
                this.model.membersRequest({version: this.participants.version }, function (response) {
                    let $response = $(response),
                        version = $response.find('query').attr('version');
                    (this.participants.version === 0) && this.participants.resetParticipants();
                    $response.find('query user').each(function (idx, item) {
                        let $item = $(item),
                            subscription = $item.find('subscription').text(),
                            id = $item.find('id').text();
                        if (subscription === 'none') {
                            this.participants.get(id) && this.participants.get(id).destroy();
                            this.account.groupchat_settings.removeParticipantFromList(this.model.get('jid'), id);
                        }
                        else
                            this.participants.createFromStanza($item);
                    }.bind(this));
                    callback && callback(version);
                }.bind(this));
            },

            renderMemberItem: function (participant) {
                let attrs = _.clone(participant.attributes);
                attrs.nickname = _.escape(attrs.nickname);
                attrs.badge = _.escape(attrs.badge);
                attrs.is_me = attrs.jid == this.account.get('jid');
                attrs.pretty_present = attrs.present ? (moment(attrs.present).isValid() ? moment(attrs.present).fromNow() : moment(attrs.present.substr(0, attrs.present.length - 1)).fromNow()) : "";
                let $item_view = $(templates.group_chats.group_member_item(attrs)),
                    view = this.$('tr[data-id="' + attrs.id + '"]');
                $item_view.emojify('.badge', {emoji_size: 16});
                if (view.length) {
                    view.hasClass('active') && $item_view.addClass('active');
                    $item_view.insertBefore(view);
                    view.detach();
                }
                else {
                    if (attrs.is_me) {
                        $item_view.prependTo(this.$('.members-list-wrap tbody'));
                    }
                    else
                        $item_view.appendTo(this.$('.members-list-wrap tbody'));
                }
                this.updateMemberAvatar(attrs);
            },

            updateMemberAvatar: function (member) {
                let image = Images.getDefaultAvatar(member.nickname || member.jid || member.id);
                var $avatar = (member.id) ? this.$('tr[data-id="'+ member.id +'"] .circle-avatar') : this.$('.list-item[data-jid="'+ member.jid +'"] .circle-avatar');
                $avatar.setAvatar(image, this.member_avatar_size);
                if (member.avatar) {
                    let cached_avatar = this.account.chat_settings.getB64Avatar(member.id);
                    if (this.account.chat_settings.getHashAvatar(member.id) == member.avatar && cached_avatar) {
                        $avatar.setAvatar(cached_avatar, this.member_avatar_size);
                    }
                    else {
                        var node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + member.id;
                        this.model.getAvatar(member.avatar, node, function (avatar) {
                            this.account.chat_settings.updateCachedAvatars(member.id, member.avatar, avatar);
                            this.$('.list-item[data-id="'+ member.id +'"] .circle-avatar').setAvatar(avatar, this.member_avatar_size);
                            if (this.account.get('jid') === member.jid) {
                                this.model.my_info.set('b64_avatar', avatar);
                                this.model.trigger('update_my_info');
                            }
                        }.bind(this));
                    }
                }
            },

            showParticipantProperties: function (ev) {
                let $target = $(ev.target);
                if ($target.closest('.buttons-wrap').length)
                    return;
                let participant_item = $target.closest('.participant-wrap'),
                    participant_id = participant_item.attr('data-id'),
                    participant = this.model.participants.get(participant_id);
                (participant_item.attr('data-jid') && participant_item.attr('data-jid') === this.account.get('jid')) && (participant_id = '');
                this.model.membersRequest({id: participant_id}, function (response) {
                    let data_form = this.account.parseDataForm($(response).find('x[xmlns="' + Strophe.NS.DATAFORM + '"]'));
                    this.participant_properties_panel.open(participant, data_form);
                }.bind(this));
            },

            keyUpSearch: function (ev) {
                if (ev.keyCode === constants.KEY_ESCAPE)
                    this.clearSearch(ev);
                else
                    this.searchParticipant();
            },

            searchParticipant: function () {
                let query = this.$('.participants-search-form input').val().toLowerCase();
                this.$('.members-list-wrap .participant-wrap').each(function (idx, item) {
                    let $this = $(item),
                        participant_id = $this.data('id'),
                        participant = this.model.participants.find(participant => participant.get('id') === participant_id);
                    var jid = participant.get('jid').toLowerCase(),
                        name = participant.get('nickname').toLowerCase();
                    $this.hideIf(name.indexOf(query) < 0 && jid.indexOf(query) < 0);
                }.bind(this));
                if (query)
                    this.$('.close-search-icon').show();
                else
                    this.$('.close-search-icon').hide();
            },

            clearSearch: function (ev) {
                if (ev)
                    ev && ev.preventDefault();
                this.$('.search-input').val('');
                this.searchParticipant();
            }
        });

        xabber.ParticipantPropertiesView = xabber.BasicView.extend({
            className: 'modal dialog-modal edit-rights',
            template: templates.group_chats.participant_rights,
            member_details_avatar_size: constants.AVATAR_SIZES.PARTICIPANT_DETAILS_ITEM,
            ps_selector: '.modal-content',
            ps_settings: {theme: 'item-list'},

            events: {
                "click .btn-cancel-changes": "close",
                "change .clickable-field input": "changeRights",
                "click .btn-save-user-rights": "saveRights",
                "click .participant-details-item:not(.unsubscribed) .nickname": "editNickname",
                "change .circle-avatar input": "changeAvatar",
                "click .btn-block-participant": "block",
                "click .btn-kick-participant": "kick",
                "click .btn-set-badge": "editBadge",
                "click .btn-participant-messages": "getMessages",
                "click .btn-chat": "getPrivateChat",
                "click .property-variant": "changeTimerValue",
                "keydown .rich-textarea": "checkKeydown",
                "keyup .rich-textarea": "checkKeyup"
            },

            _initialize: function () {
                this.account = this.model.account;
                this.contact = this.model.model;
            },

            open: function (participant, data_form) {
                if (!participant) return;
                this.participant = participant;
                this.participant.on("change:badge", this.onBadgeUpdated, this);
                this.data_form = data_form;
                this.render();
                this.$el.openModal({
                    ready: function () {
                        this.$el.css('height', "");
                        if (($(window).height() * 0.1 + this.$el.height()) > $(window).height())
                            this.$el.css('height', $(window).height() * 0.9);
                        this.$('.modal-content').css('max-height', 'calc(100% - ' + (64 + this.$('.header').height()) + 'px)');
                        this.scrollToTop();
                        this.updateSaveButton();
                        let dropdown_settings = {
                            inDuration: 100,
                            outDuration: 100,
                            constrainWidth: false,
                            hover: false,
                            alignment: 'left'
                        };
                        this.$('.select-timer .dropdown-button').dropdown(dropdown_settings);
                        this.$('.participant-details-item .dropdown-button').dropdown(_.extend(dropdown_settings, {alignment: 'right'}));
                    }.bind(this),
                    complete: function () {
                        this.render();
                        this.$el.detach();
                        this.data.set('visible', false);
                    }.bind(this)
                });
            },

            close: function () {
                this.$el.closeModal({
                    complete: function () {
                        this.render();
                        this.$el.detach();
                        this.data.set('visible', false);
                    }.bind(this)
                });
            },

            render: function () {
                this.new_avatar = "";
                let attrs = _.clone(this.participant.attributes);
                attrs.nickname = _.escape(attrs.nickname);
                attrs.blocked = attrs.blocked;
                attrs.subscription = attrs.subscription === null ? null : 'both';
                attrs.badge = _.escape(attrs.badge);
                attrs.is_myself = attrs.jid === this.account.get('jid');
                attrs.incognito_chat = (this.contact.get('group_info') && this.contact.get('group_info').anonymous === 'incognito') ? true : false;
                let $member_info_view;
                if (this.contact.get('private_chat')) {
                    this.$el.addClass('edit-rights-private');
                    $member_info_view = $(templates.group_chats.private_participant_details(attrs));
                }
                else
                    $member_info_view = $(templates.group_chats.participant_details_item(attrs));
                this.$('.header').html($member_info_view);
                this.$('.buttons-wrap .button-wrap:not(.btn-chat-wrap):not(.btn-participant-messages-wrap)').switchClass('non-active', attrs.subscription === null);
                this.$('.btn-chat-wrap').switchClass('non-active', this.participant.get('jid') === this.account.get('jid'));
                this.updateMemberAvatar(this.participant);
                this.participant_messages = [];
                this.actual_rights = [];
                if (!this.contact.get('private_chat'))
                    this.setActualRights();
                else {
                    this.$('.modal-content').addClass('hidden');
                    this.$('.modal-footer').switchClass('hidden', this.participant.get('jid') !== this.account.get('jid'));
                }
                this.updateScrollBar();
                this.$('.participant-info #edit-nickname').on("focusout", function () {
                    let new_nickname = this.$('#edit-nickname').getTextFromRichTextarea().trim();
                    if (new_nickname === "")
                        new_nickname = this.participant.get('nickname');
                    this.$('.participant-info #edit-nickname').hide();
                    this.$('.participant-info .nickname').show();
                    this.updateNickname(new_nickname);
                }.bind(this));
                this.$('.content').perfectScrollbar({theme: 'item-list'});
            },

            updateMemberAvatar: function (member) {
                let participant_id = member.get('id'),
                    $avatar = this.$('.participant-details-item[data-id="'+ participant_id +'"] .circle-avatar');
                member.image = Images.getDefaultAvatar(member.get('nickname') || member.get('jid') || participant_id);
                $avatar.setAvatar(member.image, this.member_details_avatar_size);
                this.$('.participant-details-item[data-id="'+ member.id +'"]').emojify('.badge', {emoji_size: 18});
                if (member.get('avatar')) {
                    if (this.account.chat_settings.getHashAvatar(participant_id) == member.get('avatar') && (this.account.chat_settings.getB64Avatar(participant_id))) {
                        $avatar.setAvatar(this.account.chat_settings.getB64Avatar(participant_id), this.member_details_avatar_size);
                    }
                    else {
                        let node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + participant_id;
                        this.contact.getAvatar(member.avatar, node, function (avatar) {
                            this.$('.participant-details-item[data-id="'+ participant_id +'"] .circle-avatar').setAvatar(avatar, this.member_details_avatar_size);
                        }.bind(this));
                    }
                }
                else {
                    if (this.account.chat_settings.getHashAvatar(participant_id))
                        $avatar.setAvatar(this.account.chat_settings.getB64Avatar(participant_id), this.member_details_avatar_size);
                }
            },

            updateRightsView: function (ev) {
                !$(ev.target).hasClass('non-active') && this.render(this.participant);
            },

            getMessages: function (options, callback) {
                this.contact.messages_view = new xabber.ParticipantMessagesView({contact: this.contact, model: this.participant.attributes });
                this.contact.messages_view.messagesRequest(options, function () {
                    this.close();
                    xabber.body.setScreen('all-chats', {right: 'participant_messages', contact: this.contact});
                }.bind(this));
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
                        this.new_avatar = file;
                        this.$('.circle-avatar').addClass('changed').setAvatar(image, this.member_details_avatar_size);
                        this.updateSaveButton();
                    }
                }.bind(this));
            },

            changeTimerValue: function (ev) {
                let $property_item = $(ev.target),
                    $property_value = $property_item.closest('.select-timer').find('.property-value'),
                    $input_item = $property_item.closest('.right-item').find('input');
                if ($property_item.attr('data-value') !== $property_value.attr('data-value')) {
                    $property_item.closest('.right-item').addClass('changed-timer changed');
                    this.updateSaveButton();
                }
                $property_value.text($property_item.text());
                $property_value.attr('data-value', $property_item.attr('data-value'));
                if ($property_item.attr('data-value') === '0') {
                    $property_value.addClass('default-value').text('set timer');
                } else if ($property_value.hasClass('default-value'))
                    $property_value.removeClass('default-value');
                if (!$input_item.prop('checked')) {
                    $input_item.click();
                }
            },

            onBadgeUpdated: function (participant) {
                let badge = _.escape(participant.get('badge'));
                this.updateBadge(badge);
            },

            updateBadge: function (badge) {
                this.$('.badge').html(badge).switchClass('hidden', !badge);
                this.$('.participant-info').emojify('.badge');
            },

            updateButtons: function (has_changes) {
                this.$('.btn-save-user-rights').switchClass('non-active', !has_changes);
            },

            updateSaveButton: function () {
                let has_changes = this.$('.changed').length;
                this.updateButtons(has_changes);
            },

            updateNickname: function (nickname) {
                let $member_item = this.$('.participant-details-item[data-id="' + this.participant.get('id') + '"]'),
                    $member_item_nickname = $member_item.find('.nickname');
                $member_item_nickname.html(Strophe.xmlescape(nickname));
                $member_item.emojify('.nickname');
                if (nickname !== this.participant.get('nickname'))
                    $member_item_nickname.addClass('changed');
                else
                    $member_item_nickname.removeClass('changed');
                this.updateSaveButton();
            },

            editNickname: function () {
                if (this.contact.get('private_chat') && this.account.get('jid') !== this.participant.get('jid'))
                    return;
                this.$('.participant-info .nickname').hide();
                this.$('.participant-info #edit-nickname').text(this.$('.participant-info .nickname').text()).show().placeCaretAtEnd();
            },

            editBadge: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active'))
                    return;
                this.edit_badge_panel = new xabber.EditBadgeView({model: this});
            },

            checkKeydown: function (ev) {
                if (ev.keyCode === constants.KEY_ENTER) {
                    ev.preventDefault();
                    $(document.activeElement).blur();
                }
            },

            checkKeyup: function (ev) {
                let $richtextarea = $(ev.target),
                    new_value = $richtextarea.getTextFromRichTextarea().trim();
                if (ev.target.id === 'edit-nickname') {
                    let has_changes = (new_value !== this.participant.get('nickname'));
                    this.updateButtons(has_changes);
                }
            },

            retractUserMessages: function () {
                utils.dialogs.ask("User messages retraction", "Do you want to delete all messages of " + (this.participant.get('nickname') || this.participant.get('jid') || this.participant.get('id')) + " in this groupchat?", null, { ok_button_text: 'delete'}).done(function (result) {
                    if (result) {
                        if (this.participant.get('id')) {
                            let group_chat = this.account.chats.getChat(this.model.model);
                            group_chat.retractMessagesByUser(this.participant.get('id'));
                        }
                    }
                }.bind(this));
            },

            block: function () {
                utils.dialogs.ask("Block member", "Do you want to block "+
                    this.participant.get('nickname') + "?", null, { ok_button_text: 'block'}).done(function (result) {
                    if (result) {
                        this.participant.block(function () {
                                this.close();
                                this.model.$el.find('.members-list-wrap .participant-wrap[data-id="' + this.participant.get('id') + '"]').remove();
                                this.model.$el.find('.members-list-wrap').perfectScrollbar('update');
                            }.bind(this),
                            function (error) {
                                if ($(error).find('not-allowed').length)
                                    utils.dialogs.error("You have no permission to block members");
                            });
                    }
                }.bind(this));
            },

            kick: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active'))
                    return;
                utils.dialogs.ask("Kick member", "Do you want to kick "+
                    this.participant.get('nickname') + "?", null, { ok_button_text: 'kick'}).done(function (result) {
                    if (result) {
                        this.participant.kick(function () {
                                this.close();
                                this.model.$el.find('.members-list-wrap .participant-wrap[data-id="' + this.participant.get('id') + '"]').remove();
                                this.model.$el.find('.members-list-wrap').perfectScrollbar('update');
                            }.bind(this),
                            function (error) {
                                if ($(error).find('not-allowed').length)
                                    utils.dialogs.error("You have no permission to kick members");
                            });
                    }
                }.bind(this));
            },

            setActualRights: function () {
                this.$('.rights-wrap').html("");
                this.data_form.fields && this.data_form.fields.forEach(function (field) {
                    field = _.clone(field);
                    if (field.type  === 'list-single' || field.type  === 'fixed' && (!field.values || field.values[0] == 0)) {
                        !field.values && (field.values = []);
                        let attrs = {
                                pretty_name: field.label,
                                name: field.var,
                                expires: field.values ? field.values[0] : undefined
                            },
                            restriction_item = $(templates.group_chats.restriction_item({name: attrs.name, pretty_name: attrs.pretty_name, type: field.type})),
                            restriction_expire;
                        if (field.options) {
                            restriction_expire = $(templates.group_chats.right_expire_variants({
                                right_name: ('default-' + attrs.name),
                                expire_options: field.options
                            }));
                            restriction_item.append(restriction_expire);
                        }
                        this.$('.rights-wrap').append(restriction_item);
                        if (attrs.expires) {
                            this.actual_rights.push({name: attrs.name, expires: attrs.expires});
                            this.$('.right-item #' + attrs.name).prop('checked', true).addClass(attrs.expires);
                            if (attrs.expires != 0) {
                                let $current_restriction = this.$('.right-item.restriction-' + attrs.name);
                                $current_restriction.find('.select-timer .property-value').attr('data-value', attrs.expires)
                                    .removeClass('default-value')
                                    .text(moment(Number(attrs.expires)*1000).fromNow());
                            }
                        }
                    } else if (field.type  === 'fixed')
                        field.values && this.$('.rights-wrap').append($('<div class="rights-header"/>').text(field.values[0]));
                }.bind(this));
            },

            getPrivateChat: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active'))
                    return;
                let participant_jid = this.participant.get('jid'),
                    participant_in_roster = this.account.contacts.get(participant_jid);
                if (!participant_jid || this.contact.get('incognito_chat')) {
                    let iq = $iq({from: this.account.get('jid'), to: this.contact.domain, type: 'set'})
                        .c('query', { xmlns: Strophe.NS.GROUP_CHAT + '#create'})
                        .c('peer-to-peer', { jid: this.contact.get('jid'),  id: this.participant.get('id')});
                    this.account.sendIQ(iq, function (iq_response) {
                        let group_jid = $(iq_response).find('query localpart').text() + '@' + this.contact.domain,
                            contact = this.account.contacts.mergeContact(group_jid);
                        contact.set('group_chat', true);
                        contact.pres('subscribed');
                        contact.pushInRoster(null, function () {
                            contact.pres('subscribe');
                            contact.getMyInfo();
                            this.close();
                            contact.sendPresent();
                            this.account.chats.openChat(contact);
                            let chat = this.account.chats.getChat(contact);
                            chat.messages.createSystemMessage({
                                from_jid: group_jid,
                                message: 'Initiating private chat with ' + this.participant.get('nickname') + ' from ' + this.contact.get('jid') + '. If your invitation is accepted, you won\'t see each other\'s real XMPP IDs.'
                            });
                        }.bind(this));
                    }.bind(this), function (error) {
                        let $error = $(error),
                            private_chat_jid = $error.find('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"] jid').text();
                        if (private_chat_jid) {
                            let contact = this.account.contacts.mergeContact(private_chat_jid),
                                chat = this.account.chats.getChat(contact);
                            this.close();
                            chat && chat.trigger('open');
                            return;
                        }
                        let err_text = $(error).find('text[lang="en"]').text() || $(error).find('text').first().text() || 'You have already sent an invitation to peer-to-peer chat';
                        this.close();
                        utils.dialogs.error(err_text);
                    }.bind(this));
                }
                else {
                    if (participant_in_roster)
                        if (participant_in_roster.get('in_roster')) {
                            this.close();
                            participant_in_roster.trigger('open_chat', participant_in_roster);
                            return;
                        }
                    this.close();
                    xabber.add_contact_view.show({
                        account: this.account,
                        jid: participant_jid
                    });
                }
            },

            changeRights: function (ev) {
                let $target = $(ev.target),
                    $right_item = $target.closest('.right-item'),
                    right_name = $target.prop('id');
                if ($target.prop('checked')) {
                    if (!this.actual_rights.find(right => right.name === right_name))
                        $right_item.addClass('changed');
                    else
                        if ($right_item.hasClass('changed-timer'))
                            $right_item.addClass('changed');
                        else
                            $right_item.removeClass('changed');
                }
                else {
                    if (this.actual_rights.find(right => right.name === right_name))
                        $right_item.addClass('changed');
                    else {
                        $right_item.removeClass('changed');
                        if ($right_item.hasClass('changed-timer'))
                            $right_item.find('.timer-item-wrap .property-value').addClass('default-value').text('set timer').attr('data-value', "");
                    }
                }
                this.updateSaveButton();
            },

            saveRights: function (ev) {
                if ($(ev.target).hasClass('non-active'))
                    return;
                let $btn = $(ev.target),
                    jid = this.account.get('jid'),
                    member_id = this.participant.get('id'),
                    $participant_avatar = this.$('.participant-details-item .circle-avatar'),
                    nickname_value = this.$('.participant-info .nickname').text(),
                    changed_avatar = this.new_avatar,
                    rights_changed = false,
                    has_changes = false,
                    iq_changes = $iq({from: jid, type: 'set', to: this.contact.get('jid')})
                        .c('query', {xmlns: Strophe.NS.GROUP_CHAT + "#members"})
                        .c('user', {xmlns: Strophe.NS.GROUP_CHAT, id: member_id});
                this.$('.buttons-wrap .btn-save-user-rights').addClass('non-active');
                changed_avatar && $participant_avatar.find('.preloader-wrap').addClass('visible').find('.preloader-wrapper').addClass('active');
                if (nickname_value != this.participant.get('nickname')) {
                    has_changes = true;
                    iq_changes.c('nickname').t(nickname_value).up();
                }
                this.$('.right-item').each(function(idx, right_item) {
                    if ($(right_item).hasClass('changed')) {
                        var $right_item = $(right_item),
                            right_name = $right_item.find('.field input')[0].id;
                        if ($right_item.find('.field input:checked').val()) {
                            let right_expire = $right_item.find('.select-timer .timer-item-wrap .property-value').attr('data-value'),
                                field = this.data_form.fields.find(f => f.var === right_name),
                                field_idx = this.data_form.fields.indexOf(field);
                            field.values = [right_expire];
                            this.data_form.fields[field_idx] = field;
                            rights_changed = true;
                        }
                        else {
                            let field = this.data_form.fields.find(f => f.var === right_name);
                            if (field.values.length) {
                                let field_idx = this.data_form.fields.indexOf(field);
                                field.values = [];
                                this.data_form.fields[field_idx] = field;
                                rights_changed = true;
                            }
                        }
                    }
                }.bind(this));
                if (changed_avatar)
                    this.contact.pubAvatar(changed_avatar, ('#' + member_id), function () {
                        this.$('.buttons-wrap button').removeClass('non-active');
                        $participant_avatar.find('.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');
                        this.model.$('.members-list-wrap .list-item[data-id="'+ member_id +'"] .circle-avatar').setAvatar(changed_avatar.base64, this.member_avatar_size);
                        this.$('.participant-details-item[data-id="'+ member_id +'"] .circle-avatar').setAvatar(changed_avatar.base64, this.member_details_avatar_size);
                        this.close();
                    }.bind(this), function (error) {
                        this.$('.buttons-wrap button').removeClass('non-active');
                        $participant_avatar.find('.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');
                        let error_text = $(error).find('text').text() || 'You have no permissions to change avatar';
                        !has_changes && utils.dialogs.error(error_text);
                    });
                if (has_changes)
                    this.account.sendIQ(iq_changes,
                        function () {
                            this.$('.buttons-wrap button').removeClass('non-active');
                            this.participant.set('nickname', nickname_value);
                            this.close();
                        }.bind(this),
                        function (error) {
                            this.$('.buttons-wrap button').removeClass('non-active');
                            this.close();
                            if ($(error).find('not-allowed').length) {
                                utils.dialogs.error("You have no permission to change member's info");
                            }
                        }.bind(this));
                if (rights_changed) {
                    let iq_rights_changes = $iq({from: jid, type: 'set', to: this.contact.get('jid')})
                        .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#rights'});
                    iq_rights_changes = this.account.addDataFormToStanza(iq_rights_changes, this.data_form);
                    this.account.sendIQ(iq_rights_changes, function () {
                            this.close();
                        }.bind(this),
                        function (error) {
                            this.close();
                            if ($(error).find('not-allowed').length)
                                utils.dialogs.error("You have no permission to change member's info");
                        }.bind(this));
                }
                $btn.blur();
            }
        });

        xabber.EditBadgeView = xabber.BasicView.extend({
            className: 'modal edit-badge',
            template: templates.group_chats.badge_edit_view,

            events: {
                "click .btn-cancel": "close",
                "click .btn-save": "saveNewBadge",
                "keydown .badge-text": "checkKey"
            },

            _initialize: function () {
                this.account = this.model.account;
                this.contact = this.model.contact;
                this.participant = this.model.participant;
                this.$el.openModal({
                    ready: function () {
                        if (this.participant.get('badge'))
                            this.typeEmoticon(this.participant.get('badge'));
                        else
                            this.$('.badge-text').focus();
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

                for (var emoji_list in Emoji.all) {
                    let $emoji_list_wrap = $(`<div class="emoji-list-wrap"/>`),
                        list_name = emoji_list.replace(/ /g, '_');
                    $(`<div id=${list_name} class="emoji-list-header">${constants.EMOJI_LIST_NAME(emoji_list)}</div>`).appendTo($emoji_list_wrap);
                    _.each(Emoji.all[emoji_list], function (emoji) {
                        $('<div class="emoji-wrap"/>').html(
                            emoji.emojify({emoji_size: 24, sprite: list_name})
                        ).appendTo($emoji_list_wrap);
                    });
                    $emoji_list_wrap.appendTo($emoji_panel);
                    $emoji_panel.siblings('.emoji-menu').append(Emoji.all[emoji_list][0].emojify({href: list_name, title: constants.EMOJI_LIST_NAME(emoji_list), tag_name: 'a', emoji_size: 20}));
                }
                $emoji_panel.perfectScrollbar(
                    _.extend({theme: 'item-list'}, xabber.ps_settings));
                this.$('.emoji-menu .emoji').click(function (ev) {
                    $emoji_panel[0].scrollTop = this.$('.emoji-list-wrap ' + ev.target.attributes.href.value)[0].offsetTop - 4;
                }.bind(this));
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
            },

            close: function () {
                this.$el.closeModal({ complete: this.hide.bind(this) });
            },

            saveNewBadge: function () {
                let new_badge = this.$('.badge-text').getTextFromRichTextarea();
                if (Array.from(new_badge).length > 32) {
                    this.$('.modal-content .error').text("Badge can't be longer than 32 symbols");
                }
                else {
                    if (new_badge != this.participant.get('badge')) {
                        let iq_changes = $iq({from: this.account.get('jid'), type: 'set', to: this.contact.get('jid')})
                            .c('query', {xmlns: Strophe.NS.GROUP_CHAT + "#members"})
                            .c('user', {xmlns: Strophe.NS.GROUP_CHAT, id: this.participant.get('id')})
                            .c('badge').t(new_badge);
                        this.account.sendIQ(iq_changes, function () {
                                this.model.updateBadge(new_badge);
                                this.close();
                            }.bind(this),
                            function () {
                                this.$('.modal-content .error').text("You have no permission");
                            }.bind(this))
                    }
                }
            },

            typeEmoticon: function (emoji) {
                var emoji_node = emoji.emojify({tag_name: 'span'}),
                    $textarea = this.$('.badge-text');
                $textarea.focus().pasteHtmlAtCaret(emoji_node);
            },

            checkKey: function (ev) {
                if (ev.keyCode === constants.KEY_ENTER) {
                    ev.preventDefault();
                    this.saveNewBadge();
                }
            }

        });

        xabber.DefaultRestrictionsView = xabber.BasicView.extend({
            className: 'modal dialog-modal edit-default-restrictions',
            template: templates.group_chats.default_restrictions,
            events: {
                "click .btn-default-restrictions-save": "saveChanges",
                "click .btn-default-restrictions-cancel": "close",
                "change #default_restriction_expires": "changeExpiresTime",
                "click .group-info-editor .property-variant": "changePropertyValue",
                "click .select-timer .property-variant": "changeTimerValue",
                "click .clickable-field input": "changeRestriction",
                "keyup .clickable-field input": "keyUpInput",
                "change .clickable-field input": "updateSaveButton"
            },

            _initialize: function () {
                this.contact = this.model;
                this.account = this.contact.account;
            },

            open: function () {
                this.update(function () {
                    this.$el.openModal({
                        ready: function () {
                            this.updateScrollBar();
                        }.bind(this),
                        complete: function () {
                            this.$el.detach();
                            this.data.set('visible', false);
                        }.bind(this)
                    });
                }.bind(this));
            },

            close: function () {
                this.$el.closeModal({
                    complete: function () {
                        this.hide.bind(this);
                    }.bind(this)
                });
            },

            update: function (callback) {
                this.$('.btn-default-restrictions-save').addClass('non-active');
                this.default_restrictions = [];
                this.actual_default_restrictions = [];
                this.$('button').blur();
                let iq_get_rights = $iq({from: this.account.get('jid'), type: 'get', to: this.contact.get('jid') })
                    .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#default-rights'});
                this.account.sendIQ(iq_get_rights, function(iq_all_rights) {
                    this.showDefaultRestrictions(iq_all_rights);
                    let dropdown_settings = {
                        inDuration: 100,
                        outDuration: 100,
                        constrainWidth: false,
                        hover: false,
                        alignment: 'left'
                    };
                    this.$('.property-field .dropdown-button').dropdown(dropdown_settings);
                    callback && callback();
                }.bind(this),
                    function () {
                        utils.callback_popup_message("You have no permission to change default restrictions", 3000);
                    }.bind(this));
            },

            updateSaveButton: function () {
                let has_changes = false;
                this.$('.default-restrictions-list-wrap .right-item').each(function (idx, item) {
                    let $item = $(item),
                        restriction_name = $item.find('input').attr('id'),
                        restriction_expires = $item.find('.select-timer .property-value').attr('data-value');
                    restriction_name = restriction_name.slice(8, restriction_name.length);
                    if (!this.actual_default_restrictions.find(restriction => ((restriction.name == restriction_name) && (restriction.expires == restriction_expires)))) {
                        if ($item.find('input').prop('checked'))
                            has_changes = true;
                        else if (this.actual_default_restrictions.find(restriction => restriction.name == restriction_name))
                            has_changes = true;
                    }
                }.bind(this));
                this.$('.btn-default-restrictions-save').switchClass('non-active', !has_changes);
            },

            changeRestriction: function (ev) {
                let $target = $(ev.target);
                if (!$target.prop('checked')) {
                    $target.closest('.right-item').find('.select-timer .property-value').attr('data-value', "").addClass('default-value')
                        .text('set timer');
                }
            },

            keyUpInput: function (ev) {
                if (ev.keyCode === constants.KEY_ENTER)
                    $(ev.target).click();
            },

            changePropertyValue: function (ev) {
                let $property_item = $(ev.target),
                    $property_value = $property_item.closest('.property-field').find('.property-value');
                $property_value.text($property_item.text());
                $property_value.attr('data-value', $property_item.attr('data-value'));
            },

            changeTimerValue: function (ev) {
                let $property_item = $(ev.target),
                    $property_value = $property_item.closest('.select-timer').find('.property-value'),
                    $input_item = $property_item.closest('.right-item').find('input');
                $property_value.text($property_item.text());
                $property_value.attr('data-value', $property_item.attr('data-value'));
                if ($property_item.attr('data-value') == 0) {
                    $property_value.addClass('default-value');
                    $property_value.text('set timer');
                } else if ($property_value.hasClass('default-value'))
                    $property_value.removeClass('default-value');
                if (!$input_item.prop('checked'))
                    $input_item.prop('checked', true);
                this.updateSaveButton();
            },

            showDefaultRestrictions: function (iq_all_rights) {
                let data_form = this.account.parseDataForm($(iq_all_rights).find('x[xmlns="' + Strophe.NS.DATAFORM + '"]'));
                data_form && (this.default_restrictions = _.clone(data_form));
                data_form.fields.forEach(function (field) {
                    if (field.type === 'fixed' || field.type === 'hidden')
                        return;
                    let attrs = {
                            pretty_name: field.label,
                            name: field.var,
                            expires: field.values ? field.values[0] : undefined
                        },
                        view = this.$('.default-restrictions-list-wrap .right-item.restriction-default-' + attrs.name),
                        restriction_item = $(templates.group_chats.restriction_item({name: ('default-' + attrs.name), pretty_name: attrs.pretty_name, type: field.type})),
                        restriction_expire = $(templates.group_chats.right_expire_variants({right_name: ('default-' + attrs.name), expire_options: field.options}));
                    if (view.length)
                        view.detach();
                    restriction_item.append(restriction_expire);
                    this.$('.default-restrictions-list-wrap').append(restriction_item);
                    if (attrs.expires) {
                        this.actual_default_restrictions.push({name: attrs.name, expires: attrs.expires});
                        this.$('.right-item #default-' + attrs.name).prop('checked', true).addClass(attrs.expires);
                        if (attrs.expires != 0) {
                            let $current_restriction = this.$('.right-item.restriction-default-' + attrs.name);
                            $current_restriction.find('.select-timer .property-value').attr('data-value', attrs.expires)
                                .removeClass('default-value')
                                .text(attrs.expires);
                        }
                    }
                }.bind(this));
                this.$('.select-timer .dropdown-button').dropdown({
                    inDuration: 100,
                    outDuration: 100,
                    constrainWidth: false,
                    hover: false,
                    alignment: 'left'
                });
            },

            saveChanges: function () {
                if (this.$('.btn-default-restrictions-save').hasClass('non-active'))
                    return;
                this.$('button').blur();
                let iq_change_default_rights = $iq({from: this.account.get('jid'), to: this.contact.get('jid'), type: 'set'})
                        .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#default-rights'}),
                    has_new_default_restrictions = false,
                    data_form = _.clone(this.default_restrictions);
                this.$('.default-restrictions-list-wrap .right-item').each(function (idx, item) {
                    let $item = $(item),
                        restriction_name = $item.find('input').attr('id'),
                        restriction_expires = $item.find('.select-timer .property-value').attr('data-value');
                    restriction_name = restriction_name.slice(8, restriction_name.length);
                    if (!this.actual_default_restrictions.find(restriction => ((restriction.name == restriction_name) && (restriction.expires == restriction_expires)))) {
                        if ($item.find('input').prop('checked')) {
                            let field = data_form.fields.find(f => f.var === restriction_name),
                                field_idx = data_form.fields.indexOf(field);
                            field.values = [restriction_expires];
                            data_form.fields[field_idx] = field;
                            has_new_default_restrictions = true;
                        }
                        else if (this.actual_default_restrictions.find(restriction => restriction.name == restriction_name)) {
                            let field = data_form.fields.find(f => f.var === restriction_name),
                                field_idx = data_form.fields.indexOf(field);
                            field.values = [""];
                            data_form.fields[field_idx] = field;
                            has_new_default_restrictions = true;
                        }
                    }
                }.bind(this));

                if (has_new_default_restrictions) {
                    this.account.addDataFormToStanza(iq_change_default_rights, data_form);
                    this.account.sendIQ(iq_change_default_rights, function () {
                        this.close();
                    }.bind(this), function (error) {
                        let err_text = $(error).find('error text').text() || 'You have no permission to change default restrictions';
                        utils.dialogs.error(err_text);
                        this.close();
                    }.bind(this));
                }
            },

            changeExpiresTime: function (ev) {
                var expire_time_item = $(ev.target),
                    new_expire_time = expire_time_item.val(),
                    $restriction_item = expire_time_item.prev();
                if (expire_time_item.val() == '0')
                    $restriction_item .find('.restriction-description').text('Indefinitely');
                else
                    $restriction_item .find('.restriction-description').text('For ' + new_expire_time);
                $restriction_item .find('input').removeClass().addClass(new_expire_time);
                expire_time_item.remove();
            }
        });

        xabber.Participant = Backbone.Model.extend({
            idAttribute: 'id',

            initialize: function (_attrs, options) {
                let attrs = _.clone(_attrs);
                this.contact = options.contact;
                this.account = this.contact.account;
                this.on("change:avatar", this.getBase64Avatar, this);
                this.set(attrs);
                this.getBase64Avatar();
            },

            getBase64Avatar: function () {
                if (this.get('avatar')) {
                    let cached_info = this.account.chat_settings.getAvatarInfoById(this.get('id'));
                    if (cached_info) {
                        if (cached_info.avatar_hash == this.get('avatar')) {
                            this.set('b64_avatar', cached_info.avatar_b64);
                            (this.get('jid') === this.account.get('jid')) && this.contact.trigger('update_my_info');
                            return;
                        }
                    }
                    let node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + this.get('id');
                    this.contact.getAvatar(this.get('avatar'), node, function (avatar) {
                        this.account.chat_settings.updateCachedAvatars(this.get('id'), this.get('avatar'), avatar);
                        this.set('b64_avatar', avatar);
                        (this.get('jid') === this.account.get('jid')) && this.contact.trigger('update_my_info');
                    }.bind(this));
                }
            },

            kick: function (callback, errback) {
                let id = this.get('id'),
                    jid = this.get('jid'),
                    iq = $iq({type: 'set', to: this.contact.get('jid')})
                        .c('kick', {xmlns: Strophe.NS.GROUP_CHAT});
                if (jid)
                    iq.c('jid').t(jid);
                else
                    iq.c('id').t(id);
                this.account.sendIQ(iq, function () {
                    callback && callback();
                }.bind(this), function (err) {
                    errback && errback(err);
                });
            },

            block: function (callback, errback) {
                let id = this.get('id'),
                    iq = $iq({type: 'set', to: this.contact.get('jid')})
                        .c('block', {xmlns: Strophe.NS.GROUP_CHAT + '#block'})
                        .c('id').t(id);
                this.account.sendIQ(iq, function () {
                    callback && callback();
                }.bind(this), function (err) {
                    errback && errback(err);
                });
            }
        });

        xabber.Participants = Backbone.Collection.extend({
            model: xabber.Participant,
            comparator: 'nickname',

            initialize: function (models, options) {
                this.contact = options.contact;
                this.account = this.contact.account;
                this.version = this.account.groupchat_settings.getParticipantsListVersion(this.contact.get('jid'));
                this.getCachedParticipants();
                this.on("change:nickname", this.sort, this);
            },

            updateVersion: function () {
                this.version = this.account.groupchat_settings.getParticipantsListVersion(this.contact.get('jid')) || this.version;
            },

            getCachedParticipants: function () {
                this.account.groupchat_settings.getParticipantsList(this.contact.get('jid')).forEach(function (participant) {
                    this.mergeParticipant(participant);
                }.bind(this));
            },

            mergeParticipant: function (attrs) {
                if (typeof attrs !== "object")
                    attrs = {id: attrs};
                let participant = this.get(attrs.id);
                if (participant)
                    participant.set(attrs);
                else {
                    participant = this.create(attrs, {contact: this.contact});
                }
                return participant;
            },

            resetParticipants: function () {
                this.version = 0;
                _.each(_.clone(this.models), function (participant) {
                    participant.destroy();
                });
            },

            getRights: function (rights) {
                let pretty_rights = [];
                $(rights).each(function(idx, permission) {
                    let name = $(permission).attr('name'),
                        pretty_name = $(permission).attr('translation'),
                        issued_time = $(permission).attr('issued-at'),
                        expires_time = $(permission).attr('expires');
                    pretty_rights.push({
                        name: name,
                        pretty_name: pretty_name,
                        issued_time: issued_time,
                        expires_time: expires_time
                    });
                }.bind(this));
                return pretty_rights;
            },

            createFromStanza: function ($item) {
                let jid = $item.find('jid').text(),
                    nickname = $item.find('nickname').text(),
                    id = $item.attr('id'),
                    badge = $item.find('badge').text(),
                    present = $item.find('present').text(),
                    photo = $item.find('metadata[xmlns="' + Strophe.NS.PUBSUB_AVATAR_METADATA + '"]').find('info').attr('id'),
                    role = $item.find('role').text();
                !nickname.trim().length && (nickname = jid || id);

                let attrs = {
                    jid: jid,
                    id: id,
                    avatar: photo,
                    nickname: nickname,
                    badge: badge,
                    present: present,
                    role: role
                };

                let participant = this.mergeParticipant(attrs);
                (this.account.get('jid') === participant.get('jid')) && (this.contact.my_info = participant) && this.contact.trigger('update_my_info');
                this.account.groupchat_settings.updateParticipant(this.contact.get('jid'), attrs);
                return participant;
            }
        });

        xabber.GroupChatSettings = Backbone.ModelWithStorage.extend({
            defaults: {
                participants_lists: []
            },

            getParticipantsListVersion: function (jid) {
                let all_participants_lists = _.clone(this.get('participants_lists')),
                    result = all_participants_lists.find(list => list.jid === jid);
                if (result)
                    return result.version;
                else
                    return 0;
            },

            setParticipantsListVersion: function (jid, version) {
                let all_participants_lists = _.clone(this.get('participants_lists')),
                    participants_list = all_participants_lists.find(list => list.jid === jid),
                    participants_list_idx = all_participants_lists.indexOf(participants_list);
                if (participants_list_idx != -1) {
                    all_participants_lists.splice(participants_list_idx, 1);
                }
                if (!participants_list) {
                    participants_list = {jid: jid, participants_list: [], version: 0};
                }
                else
                    participants_list.version = version;
                all_participants_lists.push(participants_list);
                this.save('participants_lists', all_participants_lists);
            },

            getParticipantsList: function (jid) {
                let all_participants_lists = _.clone(this.get('participants_lists')),
                    result = all_participants_lists.find(list => list.jid === jid);
                if (result && result.participants_list)
                    return result.participants_list;
                else
                    return [];
            },

            updateParticipant: function (jid, participant_info) {
                let all_participants_lists = _.clone(this.get('participants_lists')),
                    chat_participants = all_participants_lists.find(list => list.jid === jid),
                    version = chat_participants && chat_participants.version || 0,
                    participants_list = chat_participants && chat_participants.participants_list || [],
                    participants_list_idx = all_participants_lists.indexOf(chat_participants);
                if (participants_list.length) {
                    let participant = participants_list.find(participant_item => participant_item.id === participant_info.id),
                        participant_idx = participants_list.indexOf(participant);
                    if (participant_idx != -1)
                        participants_list[participant_idx] = participant_info;
                    else
                        participants_list.push(participant_info);
                }
                else
                    participants_list.push(participant_info);
                if (participants_list_idx != -1) {
                    all_participants_lists.splice(participants_list_idx, 1);
                }
                all_participants_lists.push({jid: jid, participants_list: participants_list, version: version});
                this.save('participants_lists', all_participants_lists);
            },

            setParticipantsList: function (jid, updated_participants_list) {
                let all_participants_lists = _.clone(this.get('participants_lists')),
                    participants_list = all_participants_lists.find(list => list.jid === jid) || [],
                    participants_list_idx = all_participants_lists.indexOf(participants_list);
                if (participants_list_idx != -1) {
                    all_participants_lists.splice(participants_list_idx, 1);
                }
                all_participants_lists.push({jid: jid, participants_list: updated_participants_list, version: participants_list.version});
                this.save('participants_lists', all_participants_lists);
            },

            removeParticipantFromList: function (jid, participant_id) {
                let participants_list = this.getParticipantsList(jid);
                if (participants_list.length) {
                    var participant_idx = participants_list.indexOf(participants_list.find(participant => participant.id === participant_id));
                    if (participant_idx != -1)
                        participants_list.splice(participant_idx, 1);
                    this.setParticipantsList(jid, participants_list);
                }
            },

            resetParticipantsList: function (jid) {
                let all_participants_lists = _.clone(this.get('participants_lists')),
                    participants_list_idx = all_participants_lists.indexOf(all_participants_lists.find(list => list.jid === jid));
                if (participants_list_idx != -1) {
                    all_participants_lists.splice(participants_list_idx, 1);
                }
                all_participants_lists.push({jid: jid, participants_list: [], version: 0});
                this.save('participants_lists', all_participants_lists);
            }
        });

        xabber.GroupchatInvitationView = xabber.BasicView.extend({
            className: 'details-panel invitation-view',
            template: templates.group_chats.invitation,
            ps_selector: '.panel-content',
            avatar_size: constants.AVATAR_SIZES.CONTACT_DETAILS,

            events: {
                "click .btn-chat": "openChat",
                "click .btn-accept": "joinGroupChat",
                "click .btn-join": "joinGroupChat",
                "click .btn-decline": "declineContact",
                "click .btn-decline-all": "declineAll",
                "click .btn-block": "blockContact",
                "click .btn-escape": "closeInvitationView"
            },

            _initialize: function (options) {
                this.account = this.model.account;
                this.$('.invite-msg-text').text(options.message && options.message.get('message') ? options.message.get('message') : 'You are invited to group chat. If you accept, ' + this.account.get('jid') + ' username shall be visible to group chat members');
                this.message = options.message;
                this.model.on("change", this.update, this);
            },

            render: function (options) {
                this.updateAvatar();
                this.updateName();
                this.renderButtons();
            },

            update: function () {
                var changed = this.model.changed;
                if (_.has(changed, 'name')) this.updateName();
                if (_.has(changed, 'image')) this.updateAvatar();
            },

            openChat: function () {
                this.model.set('in_roster', true);
                this.model.trigger("open_chat", this.model);
            },

            closeChat: function () {
                let chat = this.account.chats.getChat(this.model);
                chat.set({'opened': false, 'display': false, 'active': false});
                xabber.body.setScreen('all-chats', { right: undefined });
                chat.item_view.content.readMessages();
            },

            updateAvatar: function () {
                var image = this.model.cached_image;
                this.$('.circle-avatar').setAvatar(image, this.avatar_size);
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

            renderButtons: function () {
                this.$('.buttons-wrap .btn-accept').hideIf(!this.private_invite);
                this.$('.buttons-wrap .btn-block').hideIf(this.private_invite);
                this.$('.buttons-wrap .btn-join').showIf(!this.private_invite);
                this.$('.buttons-wrap .btn-decline-all').showIf(this.private_invite);
            },

            blockInvitation: function () {
                if (this.account.connection && this.account.connection.do_synchronization)
                    return;
                let contact_jid = this.model.get('jid'),
                    iq_get_blocking = $iq({type: 'get'}).c('blocklist', {xmlns: Strophe.NS.BLOCKING}),
                    iq_unblocking = $iq({type: 'set'}).c('unblock', {xmlns: Strophe.NS.BLOCKING}),
                    iq_set_blocking = $iq({type: 'set'}).c('block', {xmlns: Strophe.NS.BLOCKING})
                    .c('item', {jid: this.model.get('jid') + '/' + moment.now()});
                this.account.sendIQ(iq_get_blocking, function (iq_blocking_items) {
                    let items = $(iq_blocking_items).find('item');
                    if (items.length > 0) {
                        items.each(function (idx, item) {
                            let item_jid = $(item).attr('jid');
                            if (item_jid.indexOf(contact_jid) > -1)
                                iq_unblocking.c('item', {jid: item_jid}).up();
                        });
                    }
                    if ($(iq_unblocking.nodeTree).find('item').length)
                        this.account.sendIQ(iq_unblocking, function () {
                            this.account.sendIQ(iq_set_blocking);
                        }.bind(this));
                    else
                        this.account.sendIQ(iq_set_blocking);
                }.bind(this));
            },

            joinGroupChat: function () {
                let contact = this.model;
                contact.acceptRequest();
                contact.pushInRoster(null, function () {
                    contact.askRequest();
                    this.blockInvitation();
                    contact.getMyInfo();
                    contact.sendPresent();
                }.bind(this));
                contact.trigger('remove_invite', contact);
                this.openChat();
            },

            declineContact: function () {
                let contact = this.model;
                this.closeChat();
                let iq = $iq({to: contact.get('jid'), type: 'set'})
                    .c('decline', {xmlns: `${Strophe.NS.GROUP_CHAT}#invite`});
                this.account.sendIQ(iq, () => {}, () => {
                    contact.declineRequest();
                    this.blockInvitation();
                });
            },

            declineAll: function () {
                if (this.model.get('private_chat') && this.model.get('private_chat') !== true) {
                    let pres = $pres({from: this.account.connection.jid, to: this.model.get('private_chat')})
                        .c('peer-to-peer').t(false);
                    this.account.sendPres(pres);
                }
                this.model.trigger('remove_invite', this.model);
                this.closeChat();
            },

            blockContact: function (ev) {
                var contact = this.model;
                utils.dialogs.ask("Block contact", "Do you want to block "+
                    contact.get('name')+"?", null, { ok_button_text: 'block'}).done(function (result) {
                    if (result) {
                        contact.trigger('remove_invite', contact);
                        contact.block();
                        xabber.trigger("clear_search");
                    }
                });
                this.blockInvitation();
                this.closeChat();
            }
        });

        xabber.ContactNameWidget = xabber.InputWidget.extend({
            field_name: 'contact-name',
            placeholder: "",
            model_field: 'name',

            setValue: function (value) {
                if (name === "") {
                    this.model.set('roster_name', null);
                    let name = this.getDefaultName();
                    this.model.set('name', name);
                }
                this.model.pushInRoster({name: value});
            },

            getDefaultName: function () {
                let name = null;
                if (this.model.get('group_chat')) {
                    if (this.model.get('group_info'))
                        name = this.model.get('group_info').name;
                    else
                        name = this.model.get('jid');
                }
                else {
                    let vcard = this.model.get('vcard');
                    name = vcard.nickname || (vcard.first_name + ' ' + vcard.last_name).trim() || vcard.fullname || this.model.get('jid');
                }
                return name;
            },

            keyUp: function (ev) {
                var value = this.getValue();
                this.$input.switchClass('changed', this.$input.val() !== value);
                if (!this.$input.val())
                    this.$input.prop('placeholder', this.getDefaultName() || 'Set contact name');
            }
        });

        xabber.ContactEditGroupsView = xabber.BasicView.extend({
            template: templates.groups,
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
                this.$el.html(this.template());
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
                    group_name = $input.attr('data-groupname'),
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
                var changed = contact.changed;
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
                this.$('.participant-counter').text('('+counter.online+'/'+counter.all+')');
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
                    var jid = item.getAttribute('jid'),
                        resource = Strophe.getResourceFromJid(jid),
                        domain = Strophe.getDomainFromJid(jid),
                        attrs = {jid: jid, blocked: blocked};
                    resource && (attrs.resource = true);
                    (domain === jid) && (attrs.domain = true);
                    this.account.contacts.mergeContact(attrs);
                }.bind(this));
                return true;
            }
        });

        xabber.Roster = xabber.ContactsBase.extend({
            initialize: function (models, options) {
                this.account = options.account;
                this.roster_version = this.account.get('roster_version') || 0;
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

            syncFromServer: function (options) {
                options = options || {};
                let request_attrs = {xmlns: Strophe.NS.SYNCHRONIZATION};
                if (!options.after) {
                    if (options.stamp)
                        request_attrs.stamp = options.stamp;
                    else if (this.account.last_msg_timestamp)
                        request_attrs.stamp = this.account.last_msg_timestamp * 1000;
                }
                delete(options.stamp);
                let iq = $iq({type: 'get'}).c('query', request_attrs).cnode(new Strophe.RSM(options).toXML());
                this.account.sendIQ(iq, function (response) {
                    this.onSyncIQ(response, request_attrs.stamp);
                }.bind(this));
            },

            onSyncIQ: function (iq, request_with_stamp) {
                this.account.last_msg_timestamp = Math.round($(iq).children('synchronization').attr('stamp')/1000);
                let last_chat_msg_id = $(iq).find('set last');
                if (!request_with_stamp)
                    last_chat_msg_id.length ? (this.last_chat_msg_id = last_chat_msg_id.text()) : (this.conversations_loaded = true);
                if (!$(iq).find('conversation').length && !xabber.accounts.connected.find(account => !account.roster.conversations_loaded)) {
                    xabber.chats_view.$('.load-chats-feedback').text('All chats loaded');
                    return;
                }
                $(iq).find('conversation').each(function (idx, item) {
                    let $item = $(item),
                        jid = $item.attr('jid');
                    if (jid === this.account.get('jid'))
                        return;
                    let $sync_metadata = $item.children('metadata[node="' + Strophe.NS.SYNCHRONIZATION + '"]'),
                        type = $item.attr('type'),
                        is_private =  type === 'private',
                        is_incognito =  type === 'incognito',
                        is_group_chat =  type === 'group' || is_private || is_incognito,
                        encrypted = type === 'encrypted',
                        contact = this.contacts.mergeContact({jid: jid, group_chat: is_group_chat, private_chat: is_private, incognito_chat: is_incognito}),
                        chat = this.account.chats.getChat(contact, encrypted && 'encrypted'),
                        message = $sync_metadata.children('last-message').children('message'),
                        $group_metadata = $item.children('metadata[node="' + Strophe.NS.GROUP_CHAT + '"]'),
                        current_call = $item.children('metadata[node="' + Strophe.NS.JINGLE_MSG + '"]').children('call'),//$sync_metadata.children('call'),
                        $unread_messages = $sync_metadata.children('unread'),
                        last_delivered_msg = $sync_metadata.children('delivered').attr('id'),
                        last_displayed_msg = $sync_metadata.children('displayed').attr('id'),
                        unread_msgs_count = parseInt($unread_messages.attr('count')),
                        msg_retraction_version = $item.children('metadata[node="' + Strophe.NS.REWRITE + '"]').children('retract').attr('version'),
                        msg, options = {synced_msg: true, stanza_id: (is_group_chat ? message.children('stanza-id[by="' + jid + '"]') : message.children('stanza-id[by="' + this.account.get('jid') + '"]')).attr('id')};
                    if ($sync_metadata.children('deleted').length) {
                        chat.set('opened', false);
                        chat.set('const_unread', 0);
                        xabber.toolbar_view.recountAllMessageCounter();
                        xabber.chats_view.clearSearch();
                    }
                    if ($group_metadata.length) {
                        contact.participants && contact.participants.createFromStanza($group_metadata.children(`user[xmlns="${Strophe.NS.GROUP_CHAT}"]`));
                    }
                    if (current_call.length) {
                        let $jingle_message = current_call.children('message'),
                            full_jid = $jingle_message.attr('from'),
                            session_id = $jingle_message.children('propose').attr('id');
                        chat.initIncomingCall(full_jid, session_id);
                    }
                    if (!message.length) {
                        chat.set('timestamp', Math.trunc(Number($item.attr('stamp'))/1000));
                        chat.item_view.updateEmptyChat();
                    }
                    if (request_with_stamp) {
                        let unread_messages = _.clone(chat.messages_unread.models);
                        chat.trigger('get_missed_history', request_with_stamp/1000);
                        chat.set('unread', 0);
                        chat.set('const_unread', 0);
                        _.each(unread_messages, function (unread_msg) {
                            unread_msg.set('is_unread', false);
                        }.bind(this));
                        if (chat.message_retraction_version != msg_retraction_version)
                            chat.trigger("get_retractions_list");
                    } else {
                        chat.message_retraction_version = msg_retraction_version;
                    }
                    chat.set('last_delivered_id', last_delivered_msg);
                    chat.set('last_displayed_id', last_displayed_msg);
                    unread_msgs_count && (options.is_unread = true);
                    options.delay = message.children('time');
                    unread_msgs_count && unread_msgs_count--;
                    message.length && (msg = this.account.chats.receiveChatMessage(message, options));
                    chat.set('const_unread', unread_msgs_count);
                    if (msg) {
                        if ($unread_messages.attr('count') > 0 && !msg.isSenderMe() && ($unread_messages.attr('after') < msg.get('stanza_id') || $unread_messages.attr('after') < msg.get('contact_stanza_id')))
                            msg.set('is_unread', true);
                        chat.set('first_archive_id', msg.get('stanza_id'));
                    }
                    xabber.toolbar_view.recountAllMessageCounter();
                }.bind(this));
                xabber.chats_view.hideChatsFeedback();
                return true;
            },

            getFromServer: function () {
                let request_ver = this.roster_version,
                    iq = $iq({type: 'get'}).c('query', {xmlns: Strophe.NS.ROSTER, ver: request_ver});
                this.account.sendIQ(iq, function (iq) {
                    this.onRosterIQ(iq);
                    this.account.sendPresence();
                    if (!$(iq).children('query').find('item').length)
                        this.account.cached_roster.getAllFromRoster(function (roster_items) {
                            $(roster_items).each(function (idx, roster_item) {
                                this.contacts.mergeContact(roster_item);
                            }.bind(this));
                            if (!roster_items.length && request_ver != 0) {
                                this.roster_version = 0;
                                this.getFromServer();
                            }
                        }.bind(this));
                    this.account.dfd_presence.resolve();
                }.bind(this));
            },

            onRosterIQ: function (iq) {
                let new_roster_version = $(iq).children('query').attr('ver');
                if (iq.getAttribute('type') === 'set') {
                    this.account.sendIQ($iq({
                        type: 'result', id: iq.getAttribute('id'),
                        from: this.account.jid
                    }));
                }
                else
                    new_roster_version && (this.roster_version != new_roster_version) && this.account.cached_roster.clearDataBase();
                new_roster_version && (this.roster_version = new_roster_version);
                this.account.save('roster_version', this.roster_version);
                $(iq).children('query').find('item').each(function (idx, item) {
                    this.onRosterItem(item);
                }.bind(this));
                return true;
            },

            onRosterItem: function (item) {
                var jid = item.getAttribute('jid');
                if (jid === this.account.get('jid'))
                    return;
                var contact = this.contacts.mergeContact(jid);
                var subscription = item.getAttribute("subscription"),
                    ask = item.getAttribute("ask");
                if (contact.get('invitation') && (subscription === 'both' || subscription === 'to')) {
                    contact.set('invitation', false);
                    contact.trigger('remove_invite');
                }
                if (subscription === 'remove') {
                    !contact.get('group_chat') && contact.trigger('roster_push', contact, "remove");
                    contact.set({
                        in_roster: false,
                        known: false,
                        name: contact.get('jid'),
                        subscription: undefined,
                        subscription_request_out: false
                    });
                    this.account.cached_roster.removeFromCachedRoster(jid);
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
                if (subscription === 'both') {
                    attrs.subscription_request_out = false;
                    attrs.subscription_request_in = false;
                }
                if (subscription === 'from')
                    attrs.subscription_request_in = false;
                if (subscription === 'to')
                    attrs.subscription_request_out = false;
                if (ask === 'subscribe')
                    attrs.subscription_request_out = true;
                this.account.cached_roster.putInRoster(_.extend(_.clone(attrs), {jid: jid}));
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
                if (this.model.get('resource')) {
                    this.parent.$('.blocked-invitations-wrap').removeClass('hidden');
                    this.$el.appendTo(this.parent.$('.blocked-invitations'));
                }
                else if (this.model.get('domain')) {
                    this.parent.$('.blocked-domains-wrap').removeClass('hidden');
                    let $desc = this.parent.$('.blocked-domains-wrap .blocked-item-description');
                    $desc.text($desc.text() + ($desc.text() ? ', ' : "") + this.model.get('jid'));
                    this.parent.$('.blocked-item-description').text();
                    this.$el.appendTo(this.parent.$('.blocked-domains'));
                }
                else {
                    this.parent.$('.blocked-contacts-wrap').removeClass('hidden');
                    let $desc = this.parent.$('.blocked-contacts-wrap .blocked-item-description');
                    $desc.text($desc.text() + ($desc.text() ? ', ' : "") + this.model.get('jid'));
                    this.$el.appendTo(this.parent.$('.blocked-contacts'));
                }
                this.$el.attr({'data-jid': this.model.get('jid')});
                this.$('.jid').text(this.model.get('jid'));
                this.$('.circle-avatar').setAvatar(this.model.cached_image, this.avatar_size);
                this.on("remove", this.onRemoved, this);
            },

            unblockContact: function (ev) {
                ev.stopPropagation();
                this.model.unblock();
            },

            showDetails: function (ev) {
                if (!$(ev.target).closest('.blocked-invitations-wrap').length)
                    this.model.showDetails();
            },

            onRemoved: function () {
                let blocked_list = this.$el.closest('.blocked-list'),
                    jid = this.model.get('jid'),
                    reg = new RegExp(('\\,\\s' + jid + '|' + jid + '\\,\\s' + '|' + jid)),
                    blocked_contacts_desc = this.$el.closest('.blocked-contacts-wrap').showIf(blocked_list.children().length > 1).find('.blocked-item-description'),
                    blocked_domains_desc = this.$el.closest('.blocked-domains-wrap').showIf(blocked_list.children().length > 1).find('.blocked-item-description');
                this.$el.closest('.blocked-invitations-wrap').showIf(blocked_list.children().length > 1);
                blocked_contacts_desc.text(blocked_contacts_desc.text().replace(reg, ""));
                blocked_domains_desc.text(blocked_domains_desc.text().replace(reg, ""));
            }
        });

        xabber.BlockListView = xabber.BasicView.extend({
            events: {
                "click .blocked-item": "toggleItems",
                "click .btn-block": "openBlockWindow"
            },

            _initialize: function (options) {
                this.account = options.account;
                this.account.contacts.on("add_to_blocklist", this.onContactAdded, this);
                this.account.contacts.on("remove_from_blocklist", this.onContactRemoved, this);
            },

            toggleItems: function (ev) {
                let $item = $(ev.target).closest('.blocked-item'),
                    $list = $item.siblings('.blocked-list'),
                    is_hidden = $list.hasClass('hidden');
                $list.switchClass('hidden', !is_hidden);
                $item.find('.toggle-items').switchClass('mdi-chevron-right', !is_hidden).switchClass('mdi-chevron-down', is_hidden);
                this.parent.updateScrollBar();
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
            },

            openBlockWindow: function () {
                utils.dialogs.ask_enter_value("Block", "Block a specific xmpp address", {input_placeholder_value: 'name@example.com'}, { ok_button_text: 'block'}).done(function (result) {
                    if (result) {
                        let contact = this.account.contacts.mergeContact(result);
                        contact.block();
                    }
                }.bind(this));
            }
        });

        xabber.RosterView = xabber.SearchPanelView.extend({
            ps_selector: '.contact-list-wrap',

            _initialize: function () {
                this._settings = xabber._roster_settings;
                this.model.on("activate", this.updateOneRosterView, this);
                this.model.on("update_order", this.updateRosterViews, this);
                this.model.on("deactivate destroy", this.removeRosterView, this);
                this.on("before_hide", this.saveScrollBarOffset, this);
                this.$('input').on('input', this.updateSearch.bind(this));
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
            main_container: '.contact-list',
            account_roster_view: xabber.AccountRosterLeftView,

            __initialize: function () {
                this.model.on("list_changed", this.updateLeftIndicator, this);
                this.ps_container.on("ps-scroll-y", this.onScrollY.bind(this));
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
                (options.right !== 'chat' && options.right !== 'contact_details' && options.right !== 'message_context' && options.right !== 'participant_messages' || options.clear_search && options.right === 'chat') && this.clearSearch();
            },

            searchAll: function () {
                _.each(this.children, function (view) {
                    view.searchAll();
                });
            },

            selectItem: function (id, arrow) {
                if (!id) {
                    (arrow === 'up') && (this.ps_container[0].scrollTop = 0);
                    return;
                }
                this.clearSearchSelection();
                var $selection = this.$('.list-item[data-id="'+id+'"]');
                if ($selection.length) {
                    this.selection_id = id;
                } else {
                    this.ps_container[0].scrollTop = 0;
                    $selection = this.$('.list-item:visible').first();
                    this.selection_id = $selection.data('id');
                }
                if ($selection.length && arrow === 'down' && ($selection[0].clientHeight + $selection[0].offsetTop + $selection.parent()[0].offsetTop + $selection.closest('.account-roster-wrap')[0].offsetTop >= this.ps_container[0].clientHeight + this.ps_container[0].scrollTop
                || $selection[0].clientHeight + $selection[0].offsetTop + $selection.parent()[0].offsetTop + $selection.closest('.account-roster-wrap')[0].offsetTop < this.ps_container[0].scrollTop))
                    this.ps_container[0].scrollTop = $selection[0].offsetTop + $selection.parent()[0].offsetTop + $selection.closest('.account-roster-wrap')[0].offsetTop;
                if ($selection.length && arrow === 'up' && ($selection[0].offsetTop + $selection.parent()[0].offsetTop + $selection.closest('.account-roster-wrap')[0].offsetTop <= this.ps_container[0].scrollTop
                || $selection[0].offsetTop + $selection.parent()[0].offsetTop + $selection.closest('.account-roster-wrap')[0].offsetTop > this.ps_container[0].scrollTop + this.ps_container[0].clientHeight))
                    this.ps_container[0].scrollTop = $selection[0].offsetTop + $selection.parent()[0].offsetTop + $selection.closest('.account-roster-wrap')[0].offsetTop;
                $selection.addClass('selected');
            },

            onEnterPressed: function (selection) {
                let view;
                if (selection.closest('.searched-lists-wrap').length) {
                    this.clearSearch();
                    this.$('.list-item.active').removeClass('active');
                    if (selection.hasClass('chat-item')) {
                        view = xabber.chats_view.child(selection.data('id'));
                        view && view.open({screen: xabber.body.screen.get('name'), clear_search: false});
                        selection.addClass('active');
                    }
                    if (selection.hasClass('roster-contact')) {
                        view = xabber.accounts.get(selection.data('account')).chats.get(xabber.accounts.get(selection.data('account')).contacts.get(selection.data('jid')).hash_id);
                        view && (view = view.item_view);
                        view && xabber.chats_view.openChat(view, {clear_search: false, screen: xabber.body.screen.get('name')});
                        selection.addClass('active');
                    }
                    if (selection.hasClass('message-item')) {
                        selection.click();
                    }
                }
                else {
                    var contact = this.getContactForItem(selection);
                    contact && contact.showDetails();
                }
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
            avatar_size: constants.AVATAR_SIZES.SYNCHRONIZE_ACCOUNT_ITEM,

            events: {
                "click .account-field .dropdown-content": "selectAccount",
                "click .existing-group-field label": "editGroup",
                "change .new-group-name input": "checkNewGroup",
                "keyup .new-group-name input": "checkNewGroup",
                "keyup .name-field #new_contact_username": "checkJid",
                "focusout .name-field #new_contact_username": "focusoutInputField",
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

            focusoutInputField: function () {
                if (!this.$('input[name=username]').val().trim()) {
                    this.$('input[name=username]').removeClass('invalid');
                    this.$('span.errors').text('').addClass('hidden');
                }
            },

            checkJid: function () {
                let jid = this.$('input[name=username]').val().trim(),
                    error_text,
                    regexp_full_jid = /^(([^<>()[\]\\.,;:\s%@\"]+(\.[^<>()[\]\\.,;:\s%@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([^<>()[\]\\.,;:\s%@\"]+(\.[^<>()[\]\\.,;:\s%@\"]+)*)|(\".+\"))|(([0-9]{1,3}\.){3}[0-9]{1,3})|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
                if (!regexp_full_jid.test(jid) && jid) {
                    error_text = 'Invalid jid';
                }
                if (error_text) {
                    this.$('input[name=username]').addClass('invalid')
                        .siblings('.errors').text(error_text);
                }
                else {
                    this.$('input[name=username]').removeClass('invalid');
                    this.$('span.errors').text('').addClass('hidden');
                }
            },

            addContact: function () {
                this.$('span.errors').text('').addClass('hidden');
                var jid = this.$('input[name=username]').removeClass('invalid').val().trim(),
                    name = this.$('input[name=contact_name]').removeClass('invalid').val(),
                    groups = this.group_data.get('selected'),
                    contact, error_text,
                    regexp = /^(([^<>()[\]\\.,;:\s%@\"]+(\.[^<>()[\]\\.,;:\s%@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
                jid = Strophe.getBareJidFromJid(jid);
                if (!jid) {
                    error_text = 'Input username!';
                } else if (jid === this.account.get('jid')) {
                    error_text = 'Can not add yourself to contacts!';
                } else if (!regexp.test(jid)) {
                    error_text = 'Invalid jid';
                }
                else {
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
                        contact.trigger('presence', contact, 'subscribe_from');
                        contact.trigger("open_chat", contact);
                    }.bind(this), function () {
                        contact.destroy();
                    });
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

        xabber.CachedContactsInfo = Backbone.ModelWithDataBase.extend({
            defaults: {
                contacts: []
            },

            putContactInfo: function (value, callback) {
                this.database.put('contacts', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            getContactInfo: function (value, callback) {
                this.database.get('contacts', value, function (response_value) {
                    callback && callback(response_value);
                });
            }
        });

        xabber.CachedRoster = Backbone.ModelWithDataBase.extend({
            putInRoster: function (value, callback) {
                this.database.put('roster_items', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            getItemFromRoster: function (value, callback) {
                this.database.get('roster_items', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            getAllFromRoster: function (callback) {
                this.database.get_all('roster_items', null, function (response_value) {
                    callback && callback(response_value || []);
                });
            },

            removeFromCachedRoster: function (value, callback) {
                this.database.remove('roster_items', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            clearDataBase: function () {
                this.database.clear_database('roster_items');
            }
        });

        xabber.Account.addInitPlugin(function () {
            this.groups_settings = new xabber.GroupsSettings(null, {
                account: this,
                storage_name: xabber.getStorageName() + '-groups-settings-' + this.get('jid')
            });
            this.cached_roster = new xabber.CachedRoster(null, {
                name:'cached-roster-list-' + this.get('jid'),
                objStoreName: 'roster_items',
                primKey: 'jid'
            });

            this.groupchat_settings = new xabber.GroupChatSettings({id: 'group-chat-settings'}, {
                account: this,
                storage_name: xabber.getStorageName() + '-group-chat-settings-' + this.get('jid'),
                fetch: 'after'
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
                if (this.connection && this.connection.do_synchronization) {
                    let options = {},
                        max_count = Math.trunc(xabber.chats_view.$el[0].clientHeight/56) > 20 ? Math.trunc(xabber.chats_view.$el[0].clientHeight/56) : 20;
                    !this.roster.last_chat_msg_id && (options.max = max_count);
                    this.roster.syncFromServer(options);
                }
                this.roster.getFromServer();
                this.blocklist.getFromServer();
            }, this);
        });

        xabber.Account.addConnPlugin(function () {
            this.registerIQHandler();
            this.registerSyncedIQHandler();
            this.roster.registerHandler();
            this.blocklist.registerHandler();
        }, true, true);

        xabber.once("start", function () {
            this._roster_settings = new this.RosterSettings({id: 'roster-settings'},
                {storage_name: this.getStorageName(), fetch: 'after'});
            this.settings.roster = this._roster_settings.attributes;
            this.roster_settings_view = xabber.settings_view.addChild(
                'roster_settings', this.RosterSettingsView, {model: this._roster_settings});
            this.cached_contacts_info = new xabber.CachedContactsInfo(null, {
                name:'cached-contacts-list',
                objStoreName: 'contacts',
                primKey: 'jid'
            });
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
