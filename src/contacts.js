define("xabber-contacts", function () {
    return function (xabber) {
        let env = xabber.env,
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
            Emoji = utils.emoji,
            pretty_datetime = (timestamp) => { return utils.pretty_datetime(timestamp, (xabber.settings.language == 'ru-RU' || xabber.settings.language == 'default' && xabber.get("default_language") == 'ru-RU') && 'D MMMM YYYY HH:mm:ss')};

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
                if (_attrs.avatar) {
                    _attrs.image = _attrs.avatar;
                    delete _attrs.avatar;
                }
                let attrs = _.clone(_attrs);
                if (attrs.resource) {
                    attrs.full_jid = attrs.jid + '/' + attrs.resource;
                } else if (attrs.group_chat) {
                    attrs.full_jid = attrs.jid + '/Group';
                }
                (this.account && this.account.domain === attrs.jid) && _.extend(attrs, {server: true, status: 'online'});
                attrs.name = attrs.roster_name || attrs.name || attrs.jid;
                if (!attrs.image) {
                    attrs.photo_hash = "";
                    attrs.image = Images.getDefaultAvatar(attrs.name);
                }
                if (this.account.blocklist.isBlocked(attrs.jid))
                    attrs.blocked = true;
                this.cached_image = Images.getCachedImage(attrs.image);
                attrs.vcard = utils.vcard.getBlank(attrs.jid);
                this.set(attrs);
                this.onChangedGroupchat();
                this.domain = Strophe.getDomainFromJid(this.get('jid'));
                !this.get('group_chat') && this.set('group_chat', _.contains(this.account.chat_settings.get('group_chat'), this.get('jid')));
                this.hash_id = env.b64_sha1(this.account.get('jid') + '-' + attrs.jid);
                this.resources = new xabber.ContactResources(null, {contact: this});
                this.on("update_avatar", this.updateAvatar, this);
                this.on("change:full_jid", this.updateCachedInfo, this);
                this.on("change:roster_name", this.updateName, this);
                this.account.dfd_presence.done(() => {
                    if (!this.get('blocked') && !this.get('vcard_updated'))
                        this.getVCard();
                });
            },

            getStatusMessage: function () {
                let subscription = this.get('subscription'),
                    in_request = this.get('subscription_request_in'),
                    out_request = this.get('subscription_request_out'),
                    status_text = "";
                if (this.get('blocked'))
                    status_text = xabber.getString("action_contact_blocked");
                else if (this.get('group_chat')) {
                    if (this.get('group_info')) {
                        if (this.get('group_info').members_num)
                            status_text += xabber.getQuantityString("contact_groupchat_status_member", this.get('group_info').members_num);
                        if (this.get('group_info').online_members_num > 0)
                            status_text += xabber.getString("contact_groupchat_status_online", [this.get('group_info').online_members_num || 0]);
                    } else if (!subscription)
                        status_text = xabber.getString("contact_state_no_subscriptions");
                    else
                        status_text = this.get('status_message') || xabber.getString(this.get('status'));
                } else {
                    if (subscription === 'from') {
                        if (out_request)
                            status_text = xabber.getString("contact_state_outgoing_request");
                        else
                            status_text = xabber.getString("chat_receives_presence_updates");
                    } else if (subscription === 'none') {
                        if (out_request)
                            status_text = xabber.getString("contact_state_outgoing_request");
                        else if (in_request)
                            status_text = xabber.getString("contact_state_in_contact_list");
                        else
                            status_text = xabber.getString("contact_state_in_contact_list");
                    }
                    else if (!subscription)
                        status_text = xabber.getString("contact_state_not_in_contact_list");
                    else
                        status_text = this.get('status_message') || xabber.getString(this.get('status'));
                }
                return status_text;
            },

            getSubscriptionStatuses: function () {
                let subscription = this.get('subscription'),
                    subscription_preapproved = this.get('subscription_preapproved'),
                    in_request = this.get('subscription_request_in'),
                    out_request = this.get('subscription_request_out'),
                    status_description = "",
                    status_out_color = "",
                    status_in_color = "",
                    status_out_text = "",
                    status_in_text = "";
                if (this.get('blocked'))
                    status_out_text = xabber.getString("action_contact_blocked");
                if (subscription === 'both') {
                    status_out_text = xabber.getString("subscription_status_out_to");
                    status_in_text = xabber.getString("subscription_status_in_from");
                    status_description = xabber.getString("subscription_status_description_both");
                }
                else if (subscription === 'from') {
                    if (out_request){
                        status_out_text = xabber.getString("subscription_status_out_requested");
                        status_in_text = xabber.getString("subscription_status_in_from");
                        status_description = xabber.getString("subscription_status_description_out_requested_in_from");
                    }
                    else {
                        status_out_text = xabber.getString("subscription_status_out_none");
                        status_in_text = xabber.getString("subscription_status_in_from");
                        status_description = xabber.getString("subscription_status_description_out_none_in_from");
                    }
                }
                else if (subscription === 'to') {
                    if (in_request){
                        status_out_text = xabber.getString("subscription_status_out_to");
                        status_in_text = xabber.getString("subscription_status_in_request_incoming");
                        status_description = xabber.getString("subscription_status_description_out_to_in_request_incoming");
                    }
                    else {
                        status_out_text = xabber.getString("subscription_status_out_to");
                        status_in_text = xabber.getString("subscription_status_in_not_allowed");
                        status_description = xabber.getString("subscription_status_description_out_to_in_not_allowed");
                        if (subscription_preapproved){
                            status_in_text = xabber.getString("subscription_status_is_allowed");
                            status_description = xabber.getString("subscription_status_description_out_to_in_allowed");
                        }
                    }
                } else if (subscription === 'none') {
                    if (out_request && in_request){
                        status_out_text = xabber.getString("subscription_status_out_requested");
                        status_in_text = xabber.getString("subscription_status_in_request_incoming");
                        status_description = xabber.getString("subscription_status_description_out_requested_in_request_incoming");
                    }
                    else if (out_request){
                        status_out_text = xabber.getString("subscription_status_out_requested");
                        status_in_text = xabber.getString("subscription_status_in_not_allowed");
                        status_description = xabber.getString("subscription_status_description_out_requested_in_not_allowed");
                        if (subscription_preapproved){
                            status_in_text = xabber.getString("subscription_status_is_allowed");
                            status_description = xabber.getString("subscription_status_description_out_request_in_allowed");
                        }
                    }
                    else if (in_request){
                        status_out_text = xabber.getString("subscription_status_out_none");
                        status_in_text = xabber.getString("subscription_status_in_request_incoming");
                        status_description = xabber.getString("subscription_status_description_out_none_in_request_incoming");
                    }
                    else {
                        status_out_text = xabber.getString("subscription_status_out_none");
                        status_in_text = xabber.getString("subscription_status_in_not_allowed");
                        status_description = xabber.getString("subscription_status_description_out_none_in_not_allowed");
                        if (subscription_preapproved){
                            status_in_text = xabber.getString("subscription_status_is_allowed");
                            status_description = xabber.getString("subscription_status_description_out_none_in_allowed");
                        }
                    }
                }
                else if (!subscription)
                    status_out_text = xabber.getString("contact_add");

                if (out_request)
                    status_out_color = "request";
                if (in_request)
                    status_in_color = "request";
                if (subscription === 'to')
                    status_out_color = "subbed";
                if (subscription === 'from')
                    status_in_color = "subbed";
                if (subscription === 'both') {
                    status_out_color = "subbed";
                    status_in_color = "subbed";
                }
                return {
                    status_out: status_out_text,
                    status_in: status_in_text,
                    status_out_color: status_out_color,
                    status_in_color: status_in_color,
                    status_description: status_description,
                };
            },

            getIcon: function () {
                if (this.get('blocked'))
                    return 'blocked';
                if (this.get('invitation'))
                    return 'group-invite';
                if (this.get('group_chat')) {
                    if (this.get('jid').includes('redmine_issue_'))
                        return 'task';
                    if (this.get('private_chat'))
                        return 'group-private';
                    if (this.get('incognito_chat'))
                        return 'group-incognito';
                    return 'group-public';
                }
                if (this.get('server'))
                    return 'server';
                if (this.get('bot'))
                    return 'bot';
                return;
            },

            updateAvatar: function () {
                this.account.cached_roster.getFromRoster(this.get('jid'), (cached_info) => {
                    if (cached_info && this.get('photo_hash') === cached_info.photo_hash)
                        return;
                    this.getVCard();
                });
            },

            getVCard: function (callback) {
                let jid = this.get('jid'),
                    is_callback = _.isFunction(callback);
                this.account.getConnectionForIQ().vcard.get(jid,
                     (vcard) => {
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
                        if (this.get('in_roster')) {
                            this.updateCachedInfo();
                        }
                        is_callback && callback(vcard);
                    },
                    function () {
                        is_callback && callback(null);
                    }
                );
            },

            updateCachedInfo: function () {
                let roster_info = {
                    jid: this.get('jid'),
                    in_roster: this.get('in_roster'),
                    groups: this.get('groups'),
                    subscription: this.get('subscription'),
                    roster_name: this.get('roster_name'),
                    subscription_request_out: this.get('subscription_request_out'),
                    subscription_request_in: this.get('subscription_request_in'),
                    name: this.get('name'),
                    vcard_updated: this.get('vcard_updated')
                }, full_jid = this.get('full_jid');
                if (this.get('photo_hash') || this.get('image'))
                    _.extend(roster_info, {
                        photo_hash: (this.get('photo_hash') || this.account.getAvatarHash(this.get('image'))),
                        avatar_priority: this.get('avatar_priority'),
                        avatar: this.get('image')
                    });
                if (full_jid)
                    roster_info.resource = Strophe.getResourceFromJid(full_jid);
                this.account.cached_roster.putInRoster(roster_info);
            },

            onChangedGroupchat: function () {
                if (this.get('group_chat')) {
                    this.updateCounters();
                    this.participants = new xabber.Participants(null, {contact: this});
                }
            },

            getBlockedParticipants: function (callback, errback) {
                let iq = $iq({
                    type: 'get',
                    to: this.get('full_jid') || this.get('jid')})
                    .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#block'});
                this.account.sendFast(iq, callback, errback);
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
                    let iq = $iq({from: this.account.get('jid'), type: 'get', to: this.get('jid') }).c('query', {xmlns: Strophe.NS.LAST});
                    this.account.sendIQFast(iq, (iq) => {
                        let last_seen = this.getLastSeenStatus(iq);
                        if (this.get('status') == 'offline')
                            this.set({status_message: last_seen});
                        return this;
                    });
                }
            },

            getMyInfo: function (callback) {
                this.participants.participantsRequest({id: '', properties: true}, (response) => {
                    let $item = $($(response).find('query user')),
                        cached_avatar = this.account.chat_settings.getAvatarInfoById($item.find('id').text());
                    $item.length && this.participants && this.participants.createFromStanza($item);
                    cached_avatar && (cached_avatar.avatar_hash == this.my_info.get('avatar')) && this.my_info.set('b64_avatar', cached_avatar.avatar_b64);
                    this.trigger('update_my_info');
                    this.participants.participantsRequest({id: ''}, (response) => {
                        let data_form = this.account.parseDataForm($(response).find(`x[xmlns="${Strophe.NS.DATAFORM}"]`));
                        this.my_rights = data_form;
                        this.trigger('permissions_changed');
                        callback && callback();
                    });
                });
            },

            getAvatar: function (avatar, node, callback, errback) {
                let jid = this.get('group_chat') ? this.get('full_jid') : this.get('jid'),
                    iq_request_avatar = $iq({from: this.account.get('jid'), type: 'get', to: jid})
                    .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                    .c('items', {node: node})
                    .c('item', {id: avatar});
                this.account.sendIQFast(iq_request_avatar, (iq) => {
                    let pubsub_avatar = $(iq).find('data').text();
                    if (pubsub_avatar == "")
                        errback && errback(xabber.getString("pubsub__error__text_empty_node"));
                    else
                        callback && callback(pubsub_avatar);
                });
            },

            pubAvatar: function (image, node, callback, errback) {
                let avatar_hash = sha1(image.base64),
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
                this.account.sendIQFast(iq_pub_data, () => {
                        this.account.sendIQFast(iq_pub_metadata, () => {
                                callback && callback(avatar_hash);
                            },
                            function (data_error) {
                                errback && errback(data_error);
                            });
                    }, (data_error) => {
                        errback && errback(data_error);
                    });
            },

            getLastSeenStatus: function(iq) {
                let seconds = $(iq).children('query').attr('seconds'),
                    message_time = moment.now() - 1000*seconds;
                this.set({ last_seen: message_time });
                return xabber.pretty_last_seen(seconds);
            },

            pres: function (type) {
                let pres = $pres({to: this.get('jid'), from: this.account.jid, type: type});
                this.account.sendPres(pres);
                return this;
            },

            pushInRoster: function (attrs, callback, errback) {
                attrs || (attrs = {});
                let name = attrs.name || this.get('roster_name'),
                    groups = attrs.groups || this.get('groups');
                let iq = $iq({type: 'set'})
                    .c('query', {xmlns: Strophe.NS.ROSTER})
                    .c('item', {jid: this.get('jid'), name: name});
                _.each(groups, function (group) {
                    iq.c('group').t(group).up();
                });
                this.account.sendIQFast(iq, callback, errback);
                this.set('known', true);
                this.set('removed', false);
                return this;
            },

            removeFromRoster: function (callback, errback) {
                if (!this.get('removed')){
                    let iq = $iq({type: 'set'})
                        .c('query', {xmlns: Strophe.NS.ROSTER})
                        .c('item', {jid: this.get('jid'), subscription: "remove"});
                    this.account.cached_roster.removeFromRoster(this.get('jid'));
                    this.account.sendIQFast(iq, callback, errback);
                    this.set('known', false);
                    this.set('removed', true);
                }
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
                !this.account.server_features.get(Strophe.NS.SUBSCRIPTION_PREAPPROVAL) && this.set('subscription_preapproved', false)
            },

            deleteWithDialog: function () {
                let is_group = this.get('group_chat'),
                    header = is_group ? xabber.getString("group_remove") : xabber.getString("remove_contact"),
                    msg_text = is_group ? xabber.getString("group_remove_confirm", [this.get('name').bold()]) : xabber.getString("contact_delete_confirm_short", [this.get('name').bold()]),
                    optional_buttons = is_group ? null : [{ name: 'delete_history', checked: false, text: xabber.getString("delete_contact__label_delete_history")}];
                utils.dialogs.ask(header, msg_text, optional_buttons, { ok_button_text: xabber.getString("delete")}).done((result) => {
                    if (result) {
                        if (is_group) {
                            let domain = this.domain,
                                localpart = Strophe.getNodeFromJid(this.get('jid')),
                                iq = $iq({to: domain, type: 'set'})
                                    .c('query', {xmlns: `${Strophe.NS.GROUP_CHAT}#delete`}).t(localpart);
                            this.account.sendIQFast(iq, () => {
                                this.declineSubscription();
                                this.removeFromRoster();
                                let chat = this.account.chats.getChat(this);
                                chat.trigger("close_chat");
                                xabber.body.setScreen('all-chats', {right_contact: '', right: undefined});
                            });
                        } else {
                            this.removeFromRoster();
                            if (result.delete_history) {
                                let chat = this.account.chats.getChat(this);
                                chat.retractAllMessages(false);
                                chat.deleteFromSynchronization();
                                xabber.body.setScreen('all-chats', {right_contact: '', right: undefined});
                            }
                            xabber.trigger("clear_search");
                        }
                    }
                });
            },

            blockWithDialog: function () {
                let is_group = this.get('group_chat'),
                    contact = this,
                    header = is_group ? xabber.getString("block_group__header") : xabber.getString("contact_block"),
                    buttons = { ok_button_text: xabber.getString("contact_bar_block")},
                    msg_text = xabber.getString("block_contact_confirm_short", [this.get('name').bold()]);
                if (!is_group) {
                    buttons.optional_button = xabber.getString("contact_block_and_delete");
                    msg_text += `\n${xabber.getString("block_contact_warning", [this.get('jid')])}`;
                }
                utils.dialogs.ask(header, msg_text, null, buttons).done(function (result) {
                    if (result) {
                       if (!is_group) {
                            let chat = contact.account.chats.getChat(contact);
                            if (result === 'block & delete') {
                                contact.removeFromRoster();
                                chat.retractAllMessages(false);
                                chat.deleteFromSynchronization();
                                chat.set('active', false);
                            }
                        }
                        contact.blockRequest();
                        xabber.trigger("clear_search");
                        if (!is_group)
                            xabber.body.setScreen('all-chats', {right_contact: '', right: undefined});
                    }
                });
            },

            unblockWithDialog: function () {
                let contact = this;
                utils.dialogs.ask(xabber.getString("chat_settings__button_unblock_contact"), xabber.getString("unblock_contact_confirm_short", [this.get('name')]), null, { ok_button_text: xabber.getString("contact_bar_unblock")}).done(function (result) {
                    if (result) {
                        contact.unblock();
                        xabber.trigger("clear_search");
                    }
                });
            },

            block: function (callback, errback) {
                let iq = $iq({type: 'set'}).c('block', {xmlns: Strophe.NS.BLOCKING})
                    .c('item', {jid: this.get('jid')});
                this.account.sendIQFast(iq, callback, errback);
                this.set('blocked', true);
                this.set('known', false);
            },

            unblock: function (callback, errback) {
                let iq = $iq({type: 'set'}).c('unblock', {xmlns: Strophe.NS.BLOCKING})
                    .c('item', {jid: this.get('jid')});
                this.account.sendIQFast(iq, callback, errback);
                this.set('blocked', false);
            },

            sendPresent: function () {
                let pres = $pres({from: this.account.connection.jid, to: this.get('jid')})
                    .c('x', {xmlns: `${Strophe.NS.GROUP_CHAT}#present`});
                this.account.sendPres(pres);
                clearInterval(this._sending_present_interval);
                this._sending_present_interval = setInterval(() => {
                    this.account.sendPres(pres);
                }, constants.PRESENT_INTERVAL);
            },

            sendNotPresent: function () {
                let pres = $pres({from: this.account.connection.jid, to: this.get('jid')})
                    .c('x', {xmlns: `${Strophe.NS.GROUP_CHAT}#not-present`});
                this.account.sendPres(pres);
                clearInterval(this._sending_present_interval);
            },

            handlePresence: function (presence) {
                let $presence = $(presence),
                    type = presence.getAttribute('type'),
                    $vcard_update = $presence.find(`x[xmlns="${Strophe.NS.VCARD_UPDATE}"]`);
                if ($vcard_update.length && this.get('avatar_priority') && this.get('avatar_priority') <= constants.AVATAR_PRIORITIES.VCARD_AVATAR) {
                    this.set('photo_hash', $vcard_update.find('photo').text());
                    this.trigger('update_avatar');
                }
                let $group_chat_info = $(presence).find(`x[xmlns="${Strophe.NS.GROUP_CHAT}"]`);
                if ($group_chat_info.length > 0 && $group_chat_info.children().length) {
                    this.set('full_jid', $presence.attr('from'));
                    if (!this.get('group_chat')) {
                        this.set('group_chat', true);
                        this.account.chat_settings.updateGroupChatsList(this.get('jid'), this.get('group_chat'));
                    }
                    if (this.details_view && !this.details_view.child('participants')) {
                        this.details_view = new xabber.GroupChatDetailsView({model: this});
                    }
                    let group_chat_info = this.parseGroupInfo($(presence)),
                        prev_group_info = this.get('group_info') || {};
                    if (this.details_view && this.details_view.isVisible() && group_chat_info.online_members_num != prev_group_info.online_members_num)
                        this.trigger('update_participants');
                    _.extend(prev_group_info, group_chat_info);
                    this.set('group_info', prev_group_info);
                    if (!this.get('roster_name') && (prev_group_info.name !== this.get('name')))
                        this.set('name', prev_group_info.name);
                    this.set({status: prev_group_info.status, status_updated: moment.now(), status_message: (prev_group_info.members_num + ' members' + xabber.getString("contact_groupchat_status_online", [prev_group_info.online_members_num || 0]))});
                }
                if (type === 'subscribe') {
                    this.set('subscription_request_in', true);
                    if (this.get('subscription_preapproved')) {
                        this.pres('subscribed');
                    } else {
                        this.trigger('presence', this, 'subscribe');
                    }
                } else if (type === 'subscribed') {
                    if (this.get('group_chat') && (this.get('subscription_request_out') || this.get('subscription') === 'to')) {

                    }
                    if (this.get('subscription') === 'to') {
                        // this.pres('subscribed');
                    }
                    this.trigger('presence', this, 'subscribed');
                } else if (type === 'unsubscribe') {
                    this.set('subscription_request_in', false);
                    if (this.get('group_chat')) {
                        this.removeFromRoster();
                        let chat = this.account.chats.getChat(this);
                        if (!this.get('sync_deleted')){
                            chat.deleteFromSynchronization(() => {
                                chat.trigger("close_chat");
                                this.destroy();
                            }, () => {
                                chat.trigger("close_chat");
                                this.destroy();
                            });
                        } else {
                            chat.trigger("close_chat");
                            this.destroy();
                        }
                    }
                } else if (type === 'unsubscribed') {
                    this.set('subscription_request_out', false);
                    // this.trigger('presence', this, 'unsubscribed');
                } else {
                    let jid = presence.getAttribute('from'),
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
                        let attrs = {
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
                let jid = this.get('jid'),
                    $group_chat = $presence.find(`x[xmlns="${Strophe.NS.GROUP_CHAT}"]`),
                    name = $group_chat.find('name').text(),
                    $model = $group_chat.find('membership'),
                    status = $presence.children('show').text() || (($presence.attr('type') === 'unavailable') ? 'unavailable' : 'online'),
                    status_msg = $presence.children('status').text(),
                    privacy = $group_chat.find('privacy').text(),
                    $index = $group_chat.find('index'),
                    $description = $group_chat.find('description'),
                    pinned_message = Number($group_chat.find('pinned-message').text()),
                    prev_pinned_message = this.get('pinned_message') ? this.get('pinned_message').get('stanza_id') : 0,
                    private_chat = $group_chat.find('parent-chat').text() || false,
                    members_num = Number($group_chat.find('members').text()),
                    $online_members_num = $group_chat.find('present'),
                    info = {jid, name, status_msg, privacy, status, members_num};
                $index.length && (info.searchable = $index.text());
                $model.length && (info.model = $model.text());
                $description.length && (info.description = $description.text());
                $online_members_num.length && (info.online_members_num = Number($online_members_num.text()));
                private_chat && this.set('private_chat', private_chat);
                privacy === 'incognito' && this.set('incognito_chat', true);
                let chat = this.account.chats.get(this.hash_id), pinned_msg_elem;
                if ($group_chat.find('pinned-message').length) {
                    if (prev_pinned_message != pinned_message) {
                        if (chat) {
                            if (chat.item_view && !chat.item_view.content)
                                chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                            pinned_msg_elem = chat.item_view.content.$pinned_message;
                        }
                        if (pinned_msg_elem) {
                            if (pinned_message) {
                                this.getMessageByStanzaId(pinned_message, ($message) => {
                                    this.parsePinnedMessage($message, pinned_msg_elem);
                                });
                            }
                            else {
                                this.set('pinned_message', undefined);
                                this.parsePinnedMessage(undefined, pinned_msg_elem);
                            }
                        }
                    }
                }
                return info;
            },

            getAllRights: function (callback) {
                let iq_get_rights = iq = $iq({from: this.account.get('jid'), type: 'get', to: this.get('full_jid') || this.get('jid') })
                    .c('query', {xmlns: `${Strophe.NS.GROUP_CHAT}#rights` });
                this.account.sendIQFast(iq_get_rights, (iq_all_rights) => {
                    let all_permissions = $(iq_all_rights).find('permission'),
                        all_restrictions = $(iq_all_rights).find('restriction');
                    this.all_rights = {permissions: all_permissions, restrictions: all_restrictions};
                    callback && callback();
                });
            },

            getMessageByStanzaId: function (stanza_id, callback) {
                let queryid = uuid(),
                    iq = $iq({type: 'set', to: this.get('full_jid') || this.get('jid')})
                        .c('query', {xmlns: Strophe.NS.MAM, queryid: queryid})
                        .c('x', {xmlns: Strophe.NS.DATAFORM, type: 'submit'})
                        .c('field', {'var': 'FORM_TYPE', type: 'hidden'})
                        .c('value').t(Strophe.NS.MAM).up().up()
                        .c('field', {'var': '{urn:xmpp:sid:0}stanza-id'})
                        .c('value').t(stanza_id);
                let handler = this.account.connection.addHandler((message) => {
                    let $msg = $(message);
                    if ($msg.find('result').attr('queryid') === queryid)
                        callback && callback($msg);
                    return true;
                }, Strophe.NS.MAM);
                this.account.sendIQFast(iq, () => {
                        this.account.connection.deleteHandler(handler);
                    }, () => {
                        this.account.connection.deleteHandler(handler);
                    }
                );
            },

            MAMRequest: function (options, callback, errback) {
                let account = this.account,
                    is_fast = options.fast && account.fast_connection && !account.fast_connection.disconnecting && account.fast_connection.authenticated && account.fast_connection.connected && account.get('status') !== 'offline',
                    conn = is_fast ? account.fast_connection : account.connection,
                    contact = this,
                    messages = [], queryid = uuid(),
                    is_groupchat = contact && contact.get('group_chat'), success = true, iq;
                delete options.fast;
                if (is_groupchat)
                    iq = $iq({type: 'set', to: contact.get('full_jid') || contact.get('jid')});
                else
                    iq = $iq({type: 'set'});
                iq.c('query', {xmlns: Strophe.NS.MAM, queryid: queryid})
                    .c('x', {xmlns: Strophe.NS.DATAFORM, type: 'submit'})
                    .c('field', {'var': 'FORM_TYPE', type: 'hidden'})
                    .c('value').t(Strophe.NS.MAM).up().up();
                if (this.account.server_features.get(Strophe.NS.ARCHIVE) && options.encrypted)    {
                    iq.c('field', {'var': `{${Strophe.NS.ARCHIVE}}filter_encrypted`})
                        .c('value').t(options.encrypted).up().up();
                }
                if (this.account.server_features.get(Strophe.NS.ARCHIVE) && !options.encrypted)    {
                    if (options.filter_image)
                        iq.c('field', {'var': `{${Strophe.NS.ARCHIVE}}filter_image`})
                            .c('value').t(options.filter_image).up().up();
                    if (options.filter_video)
                        iq.c('field', {'var': `{${Strophe.NS.ARCHIVE}}filter_video`})
                            .c('value').t(options.filter_video).up().up();
                    if (options.filter_voice)
                        iq.c('field', {'var': `{${Strophe.NS.ARCHIVE}}filter_voice`})
                            .c('value').t(options.filter_voice).up().up();
                    if (options.filter_files){
                        iq.c('field', {'var': `{${Strophe.NS.ARCHIVE}}filter_image`})
                            .c('value').t('false').up().up();
                        iq.c('field', {'var': `{${Strophe.NS.ARCHIVE}}filter_video`})
                            .c('value').t('false').up().up();
                        iq.c('field', {'var': `{${Strophe.NS.ARCHIVE}}filter_voice`})
                            .c('value').t('false').up().up();
                        iq.c('field', {'var': `{${Strophe.NS.ARCHIVE}}filter_sticker`})
                            .c('value').t('false').up().up();
                    }
                }
                if (!is_groupchat)
                    iq.c('field', {'var': 'with'})
                        .c('value').t(this.get('jid')).up().up();
                if (options.var)
                    options.var.forEach((opt_var) => {
                        iq.c('field', {'var': opt_var.var})
                            .c('value').t(opt_var.value).up().up();
                    });
                iq.up().cnode(new Strophe.RSM(options).toXML());
                let deferred = new $.Deferred();
                account.chats.onStartedMAMRequest(deferred);
                deferred.done(function () {
                    let handler = conn.addHandler(function (message) {
                        if ((contact && is_groupchat == contact.get('group_chat'))) {
                            let $msg = $(message);
                            if ($msg.find('result').attr('queryid') === queryid) {
                                messages.push(message);
                            }
                        }
                        else {
                            messages = [];
                            success = false;
                        }
                        return true;
                    }, Strophe.NS.MAM);
                    let callb = function (res) {
                            conn.deleteHandler(handler);
                            account.chats.onCompletedMAMRequest(deferred);
                            let $fin = $(res).find(`fin[xmlns="${Strophe.NS.MAM}"]`);
                            if ($fin.length && $fin.attr('queryid') === queryid) {
                                let rsm = new Strophe.RSM({xml: $fin.find('set')[0]});
                                rsm.complete = ($fin.attr('complete') === 'true') ? true : false;
                                callback && callback(success, messages, rsm);
                            }
                        },
                        errb = function (err) {
                            conn.deleteHandler(handler);
                            xabber.error("MAM error");
                            xabber.error(err);
                            account.chats.onCompletedMAMRequest(deferred);
                            errback && errback(err);
                        };
                    if (is_fast)
                        account.sendFast(iq, callb, errb);
                    else
                        account.sendIQ(iq, callb, errb);
                });
            },

            getFilesFromStanza: function ($message, options) {
                $message = $message.find('message')
                let references = $message.children(`reference[xmlns="${Strophe.NS.REFERENCE}"]`).length ?
                    $message.children(`reference[xmlns="${Strophe.NS.REFERENCE}"]`) :
                    $message.children('envelope').children('content').children(`reference[xmlns="${Strophe.NS.REFERENCE}"]`),
                    items = [];

                references.each((idx, reference) => {
                    let $reference = $(reference),
                        type = $reference.attr('type');
                    if (type === 'mutable') {
                        let $file_sharing = $reference.find(`file-sharing[xmlns="${Strophe.NS.FILES}"]`).first();
                        if ($file_sharing.length) {
                            let type = $file_sharing.parent(`voice-message[xmlns="${Strophe.NS.VOICE_MESSAGE}"]`).length ? 'voice' : 'file',
                                $file = $file_sharing.children('file'), file_attrs = {}, sources = [];
                            $file_sharing.children('sources').children('uri').each((i, uri) => {sources.push($(uri).text());});
                            file_attrs = {
                                name: $file.children('name').text(),
                                hash: $file.children(`hash[xmlns="${Strophe.NS.HASH}"]`).text(),
                                size: $file.children('size').text(),
                                uniqueid: $message.attr('id'),
                                id: $file.children('gallery-id').text(),
                                created_at: $file.children('created').text(),
                                thumbnail: $file.children('thumbnail-uri').text(),
                                media_type: $file.children('media-type').text(),
                                duration: $file.children('duration').text(),
                                description: $file.children('desc').text(),
                                height: $file.children('height').text(),
                                width: $file.children('width').text(),
                                voice: type === 'voice',
                                sources: sources
                            };
                            if (sources[0].indexOf('aescbc') == 0) {
                                let uri = sources[0].replace(/^aescbc/, 'https'),
                                    key = utils.fromBase64toArrayBuffer(uri.slice(uri.length - 64));
                                uri = uri.slice(0, uri.length - 64 - 1);
                                _.extend(file_attrs, {sources: [uri], key: key});
                                file_attrs.has_encrypted_files = true;
                            }
                            items.push(file_attrs);
                        }
                    }
                });
                return items
            },

            parsePinnedMessage: function ($message, pinned_msg_elem) {
                if (!$message) {
                    this.renderPinnedMessage(null, pinned_msg_elem);
                }
                else {
                    let $msg = $message.find('result message').first();
                    if (this.get('pinned_message'))
                        if (this.get('pinned_message').stanza_id === $msg.find('stanza-id').attr('id'))
                            return;
                    let message = this.account.chats.receiveChatMessage($message, {pinned_message: true});
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
                    let images = message.get('images') || [],
                        files = message.get('files') || [],
                        locations = message.get('locations'),
                        fwd_message = message.get('forwarded_message'),
                        fwd_msg_author = null,
                        msg_text = _.escape(message.get('message'));
                    message.get('videos') && message.get('videos').length && (files = files.concat(message.get('videos')));
                    if (fwd_message) {
                        let user_info = fwd_message[0].get('user_info') || {};
                        if (msg_text) {
                        } else if (fwd_message.length > 1)
                            msg_text = xabber.getQuantityString("forwarded_messages_count", fwd_message.length);
                        else {
                            msg_text = fwd_message[0].get('message') || fwd_message[0].get('forwarded_message') && xabber.getString("forwarded_messages_count_plural_0", [fwd_message[0].get('forwarded_message').length]);
                            fwd_msg_author = user_info.nickname || fwd_message[0].get('from_jid') || user_info.id;
                        }
                    }
                    if ((images && images.length) && (files && files.length))
                        msg_text = `<span class=text-color-500>${xabber.getString("recent_chat__last_message__attachments", [images.length + files.length])}</span>`;
                    else {
                        if (images && images.length) {
                            if (images.length == 1)
                                msg_text = `<span class=text-color-500>${xabber.getString("recent_chat__last_message__images_plural_0")}: </span>` + images[0].name;
                            if (images.length > 1)
                                msg_text = `<span class=text-color-500>${xabber.getQuantityString("recent_chat__last_message__images", images.length)}</span>`;
                        }
                        if (files && files.length) {
                            if (files.length == 1)
                                msg_text = `<span class=text-color-500>${xabber.getString("recent_chat__last_message__files_plural_0")}: </span>` + files[0].name + ' (' + files[0].size + ')';
                            if (files.length > 1)
                                msg_text = `<span class=text-color-500>${xabber.getQuantityString("recent_chat__last_message__files", files.length)}</span>`;
                        }
                    }
                    if (locations && locations.length) {
                        if (locations.length == 1)
                            msg_text = `<span class=text-color-500>${xabber.getString("recent_chat__last_message__locations_plural_0")}</span>`;
                        if (locations.length > 1)
                            msg_text = `<span class=text-color-500>${xabber.getQuantityString("recent_chat__last_message__locations", locations.length)}</span>`;
                    }
                    let user_info = message.get('user_info') || {},
                        chat_content = this.account.chats.get(this.hash_id).item_view.content,
                        is_scrolled = chat_content.isScrolledToBottom(),
                        msg_author = user_info.nickname || message.get('from_jid') || user_info.id,
                        pinned_msg = {
                            author: msg_author,
                            time: pretty_datetime(message.get('time')),
                            message: msg_text,
                            fwd_author: fwd_msg_author
                        },
                        pinned_msg_html = $(templates.group_chats.pinned_message(pinned_msg));
                    pinned_msg_elem.html(pinned_msg_html).emojify('.chat-msg-content', {emoji_size: 18});
                    let height_pinned_msg = pinned_msg_elem.height();
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
                this._reset_status_timeout = setTimeout(() => {
                    this.set({
                        status_updated: moment.now(),
                        status: 'offline',
                        status_message: ''
                    });
                }, timeout || 5000);
            },

            searchByParticipants: function (query, callback) {
                if (!this.participants.version) {
                    this.participants.participantsRequest({}, () => {
                        let participants_list = this.participants.search(query);
                        callback && callback(participants_list);
                    });
                } else {
                    let participants_list = this.participants.search(query);
                    callback && callback(participants_list);
                }
            },

            updateName: function () {
                if (this.get('roster_name') && this.get('name') !== this.get('roster_name'))
                    this.set('name', this.get('roster_name'));
            },

            showDetails: function (screen) {
                if (!this.details_view)
                    this.details_view = (this.get('group_chat')) ? new xabber.GroupChatDetailsView({model: this}) : new xabber.ContactDetailsView({model: this});
                screen || (screen = 'contacts');
                xabber.body.setScreen(screen, {right: 'contact_details', contact: this});
            },

            showDetailsRight: function (screen, options) {
                let chat = this.account.chats.getChat(this),
                     scrolled_top_chats_view, scrolled_top_chat;
                if (chat)
                    if (!chat.item_view.content)
                        chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                    scrolled_top_chat = chat.item_view.content.getScrollTop()
                if (xabber.chats_view)
                    scrolled_top_chats_view = xabber.chats_view.getScrollTop();
                options = options || {};
                if (!this.details_view_right && !options.encrypted)
                    this.details_view_right = (this.get('group_chat')) ? new xabber.GroupChatDetailsViewRight({model: this}) : new xabber.ContactDetailsViewRight({model: this});
                if (!this.details_view_right_encrypted && options.encrypted)
                    this.details_view_right_encrypted = new xabber.ContactDetailsViewRight({model: this, encrypted: true});
                screen || (screen = 'contacts');
                if (xabber.body.screen.get('right_contact') && options.type != 'search' && options.type != 'members' && options.type != 'participant' && !options.right_saved) {
                    this.set('search_hidden', true)
                    xabber.body.setScreen(screen, {right_contact: '', contact: this});
                }
                else {
                    if (options.encrypted)
                        xabber.body.setScreen(screen, {right_contact: 'contact_details_encrypted', contact: this});
                    else
                        xabber.body.setScreen(screen, {right_contact: 'contact_details', contact: this});
                    if (this.details_view_right && this.details_view_right.contact_searched_messages_view){
                        this.details_view_right.contact_searched_messages_view.hideSearch();
                        if (options.type === 'search') {
                            this.details_view_right.contact_searched_messages_view.clearSearch();
                            this.details_view_right.showSearchMessages();
                        }
                        if (options.type === 'members') {
                            this.details_view_right.$('.tabs:not(.participant-tabs) .list-variant[data-value="participants"]').click()
                        }
                        this.details_view_right.onScroll()
                    }
                }
                if (scrolled_top_chat)
                    chat.item_view.content.scrollTo(scrolled_top_chat);
                if (scrolled_top_chats_view)
                    xabber.chats_view.scrollTo(scrolled_top_chats_view);
            },
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

            updateIcons: function () {
                let ic_name = this.contact.getIcon();
                this.$('.status-bulb').addClass('hidden');
                ic_name && this.$('.status-bulb').removeClass('hidden').switchClass(ic_name, ic_name == 'server' || ic_name == 'blocked').html(env.templates.svg[ic_name]());
            },

            highlightStatus: function (status) {
                this.$(`.status-values li[data-value="${status}"]`).addClass('active')
                    .siblings().removeClass('active');
                this.updateIcons();
            },

            getStatuses: function () {
                let iq_get_properties = $iq({to: this.contact.get('full_jid') || this.contact.get('jid'), type: 'get'})
                    .c('query', {xmlns: `${Strophe.NS.GROUP_CHAT}#status`});
                this.account.sendFast(iq_get_properties, (properties) => {
                    this.data_form = this.account.parseDataForm($(properties).find('x[xmlns="' + Strophe.NS.DATAFORM + '"]'));
                    let status_field = this.data_form.fields.find(field => field.var == 'status'),
                        options = (this.data_form.fields.find(field => field.var == 'status') || []).options || [];
                    if (!options.length || status_field.type == 'fixed') {
                        this.closeModal();
                        utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                        return;
                    }
                    this.renderStatuses(options);
                }, () => {
                    this.closeModal();
                    utils.dialogs.error(xabber.getString("set_group_status__error__service_unavailable"));
                    return;
                });
            },

            renderStatuses: function (options) {
                this.$('.status-values').html("");
                options.forEach((option) => {
                    let status = option,
                        status_field = this.data_form.fields.find(f => f.var == status.value);
                    if (status_field)
                        status.show = status_field.values[0];
                    else
                        status.show = status.value;
                    let $status_item = $(templates.group_chats.status_item({status}));
                    this.$('.status-values').append($status_item);
                });
                this.highlightStatus(this.contact.get('status'));
            },

            changeStatus: function (ev) {
                let status = $(ev.target).closest('li').data('value');
                this.highlightStatus(status);
                this.do_change();
                this.closeModal();
            },

            do_change: function () {
                let status = this.$('.status-values li.active').data('value');
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
                let iq_set_status = $iq({to: this.contact.get('full_jid') || this.contact.get('jid'), type: 'set'})
                        .c('query', {xmlns: `${Strophe.NS.GROUP_CHAT}#status`}),
                    status_field = this.data_form.fields.find(field => field.var === 'status'),
                    idx = this.data_form.fields.indexOf(status_field);
                status_field.values = [status];
                this.data_form.fields[idx] = status_field;
                iq_set_status = this.account.addDataFormToStanza(iq_set_status, this.data_form);
                this.account.sendFast(iq_set_status);
            },

            onHide: function () {
                this.$el.detach();
            },

            close: function () {
                let value = this.$('.status-message').val();
                if (!value)
                    this.do_change();
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
                this.model.on("change:subscription", this.updateStatus, this);
                this.model.on("change:subscription_preapproved", this.updateStatus, this);
                this.model.on("change:subscription_request_in", this.updateStatus, this);
                this.model.on("change:subscription_request_out", this.updateStatus, this);
                this.model.on("change:private_chat", this.updateIcon, this);
                this.model.on("change:incognito_chat", this.updateIcon, this);
                this.model.on("change:bot", this.updateIcon, this);
                this.model.on("change:blocked", this.onBlocked, this);
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
                    let seconds = (moment.now() - this.model.get('last_seen'))/1000,
                        new_status = xabber.pretty_last_seen(seconds);
                    this.model.set({ status_message: new_status });
                    }
                }
            },

            onBlocked: function () {
                this.updateIcon();
                this.$el.switchClass('blocked', this.model.get('blocked'));
            },

            selectView: function () {
                if (this.model.get('group_chat')) {
                    this.$('.private-chat').addClass('hidden');
                    this.$('.group_chat').removeClass('hidden');
                }
            },

            lastSeenUpdated: function () {
                if (this.model.get('status') == 'offline' && this.model.get('last_seen') && _.isUndefined(this.interval_last)) {
                    this.interval_last = setInterval(() => {
                        let seconds = (moment.now() - this.model.get('last_seen'))/1000,
                            new_status = xabber.pretty_last_seen(seconds);
                        this.model.set({ status_message: new_status });
                    }, 60000);
                }
                else
                {
                    clearInterval(this.interval_last);
                }
            },

            updateGroupChat: function () {
                let is_group_chat = this.model.get('group_chat');
                this.$('.status').hideIf(is_group_chat);
                this.updateIcon();
            },

            updateIcon: function () {
                let ic_name = this.model.getIcon();
                this.$('.chat-icon').addClass('hidden');
                if (this.model.get('invitation'))
                    return;
                ic_name && this.$('.chat-icon').removeClass('hidden').switchClass(ic_name, ic_name == 'server' || ic_name == 'blocked').html(env.templates.svg[ic_name]());
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
                this.updateGroupChat();
                this.model.on("change:display", this.updateDisplayStatus, this);
                this.model.on("change:blocked", this.updateBlockedState, this);
                this.model.on("change:group_chat", this.updateGroupChat, this);
            },

            updateDisplayStatus: function () {
                this.$el.switchClass('active', this.model.get('display'));
            },

            updateBlockedState: function () {
                this.$el.switchClass('blocked', this.model.get('blocked'));
            },
            updateMutedState: function () {
                this.$('.muted-icon').hide();
            },

            clickOnItem: function () {
                let options = {};
                (xabber.chats_view.active_chat && xabber.chats_view.active_chat.model.get('jid') === this.model.get('jid') && xabber.chats_view.active_chat.model.get('encrypted')) && (options.encrypted = true);
                this.model.trigger("open_chat", this.model, options);
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

            onResourceRemoved: function () {
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
                let view = this.child(resource.get('resource'));
                if (!view) return;
                view.$el.detach();
                let index = this.model.indexOf(resource);
                if (index === 0) {
                    this.$('.resources-wrap').prepend(view.$el);
                } else {
                    this.$('.resource-wrap').eq(index - 1).after(view.$el);
                }
                this.updateScrollBar();
            }
        });

        xabber.ContactResourcesRightView = xabber.ResourcesView.extend({
            className: 'modal main-modal resource-modal',

            _initialize: function () {
                this.model.on("remove", this.onResourceRemoved, this);
                this.model.on("reset", this.onReset, this);
                this.model.on("change:priority", this.onPriorityChanged, this);
            },

            renderByInit: function () {
                this.model.each((resource) => {
                    this.onResourceAdded(resource);
                });
            },

            open: function () {
                if (this.model.length) {
                    this.$el.openModal({
                        ready: () => {
                            this.$el.html('<svg class="details-icon mdi mdi-24px "></svg><div class="resources-wrap"></div>')
                            this.$el.find('.details-icon').html(env.templates.svg['ic-jabber']())
                            this.renderByInit();
                        },
                        // complete: () => {
                        //     this.$el.detach();
                        //     this.data.set('visible', false);
                        // }
                    });
                }
            },

            onResourceAdded: function (resource) {
                this.model.requestInfo(resource);
                this.addChild(resource.get('resource'),
                    xabber.ResourceRightView, {model: resource});
                this.updatePosition(resource);
                this.$el.removeClass('hidden');
            },

            onResourceRemoved: function (resource) {
                this.removeChild(resource.get('resource'));
                this.$el.showIf(this.model.length);
            },

            onReset: function () {
                this.removeChildren();
                this.$el.addClass('hidden');
            },

            updatePosition: function (resource) {
                let view = this.child(resource.get('resource'));
                if (!view) return;
                view.$el.detach();
                let index = this.model.indexOf(resource);
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

        xabber.ContactRightVCardView = xabber.VCardRightView.extend({
            events: {
                "click .btn-vcard-refresh": "refresh",
                "click .info-hover": "onClickIcon",
                "click .info-wrap.more": "showVCard",
                "click .btn-back": "hideVCard"
            },


            showVCard: function (ev) {
                this.model.set('vcard_hidden', false);
                this.$('.full-vcard-wrap').hideIf(this.model.get('vcard_hidden'))
                this.model.getVCard(() => {
                    this.updateName()
                    this.update();
                });
                this.parent.$('.main-info').removeClass('fixed-scroll');
                this.$('.vcard-header').css({width: xabber.right_contact_panel.$el.find('.details-panel-right').width()});
                this.parent.scrollToTop();
                if (this.parent.ps_container.length) {
                    this.parent.ps_container.perfectScrollbar('destroy')
                }
            },

            hideVCard: function (ev) {
                this.model.set('vcard_hidden', true);
                if (this.parent.ps_container.length) {
                    this.parent.ps_container.perfectScrollbar(
                        _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                    );
                }
                this.scrollToTop();
                this.onScroll();
                this.parent.onScroll();
                this.$('.full-vcard-wrap').hideIf(this.model.get('vcard_hidden'))
            },

            updateName: function () {
                this.$('.main-info .name-wrap').text(this.model.get('name'));
                if (this.model.get('name') != this.model.get('roster_name'))
                    this.$('.main-info .name-wrap').addClass('name-is-custom');
                else
                    this.$('.main-info .name-wrap').removeClass('name-is-custom');
            },
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
                this.setButtonsWidth();
                this.model.resources.models.forEach((resource) => {this.model.resources.requestInfo(resource)});
            },

            setButtonsWidth: function () {
                let widths = [];
                this.$('.main-info .button-wrap').each((i, button) => {widths.push(button.clientWidth)});
                this.$('.main-info .button-wrap').css('width', `${Math.max.apply(null, widths)}px`);
            },

            onChangedVisibility: function () {
                this.model.set('display', this.isVisible());
            },

            updateJingleButtons: function () {
                this.$('.btn-voice-call').switchClass('non-active', !xabber.get('audio'));
            },

            update: function () {
                let changed = this.model.changed;
                if (_.has(changed, 'name')) this.updateName();
                if (_.has(changed, 'image')) this.updateAvatar();
                if (_.has(changed, 'status_updated')) this.updateStatus();
                // if (_.has(changed, 'muted')) this.updateNotifications();
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
                let image = this.model.cached_image;
                this.$('.circle-avatar').setAvatar(image, this.avatar_size);
            },

            updateButtons: function () {
                let in_roster = this.model.get('in_roster'),
                    is_blocked = this.model.get('blocked'),
                    is_server = this.model.get('server'),
                    subscription = this.model.get('subscription');
                this.$('.btn-add').hideIf(in_roster);
                this.$('.btn-delete').showIf(in_roster);
                this.$('.btn-block-wrap i').switchClass('btn-block', !is_blocked).switchClass('btn-unblock', is_blocked);
                this.$('.btn-block-wrap .btn-name').text(is_blocked ? xabber.getString("contact_bar_unblock") : xabber.getString("contact_bar_block"));
                this.$('.buttons-wrap .button-wrap:not(.btn-block-wrap)').switchClass('non-active', is_blocked);
                this.$('.btn-auth-request').showIf(!is_server && in_roster && !is_blocked &&
                    subscription !== 'both' && subscription !== 'to');
            },

            // updateNotifications: function () {
            //     let chat = this.account.chats.getChat(this.model);
            //     this.$('.btn-mute').switchClass('mdi-bell-off', chat.get('muted'));
            //     this.$('.btn-mute').switchClass('mdi-bell', !chat.get('muted'));
            // },

            showQRCode: function () {
                let qrcode = new VanillaQR({
                    url: 'xmpp:' + this.model.get('jid'),
                    noBorder: true
                });
                utils.dialogs.ask(xabber.getString("dialog_show_qr_code__header"), null, {escape_button: true, canvas: qrcode.domElement, bottom_text: ('<div class="name">' + this.model.get('name') + '</div><div class="jid">' + this.model.get('jid') + '</div>')}, { cancel_button_text: ' ', ok_button_text: ' '}, 'hidden').done((result) => {
                });
            },

            updateSubscriptions: function () {
                let subscription = this.model.get('subscription'),
                    in_request = this.model.get('subscription_request_in'),
                    out_request = this.model.get('subscription_request_out'),
                    $label_outcoming = this.$('label[for="outcoming-subscription"]'),
                    $label_incoming = this.$('label[for="incoming-subscription"]');
                if (subscription === 'both') {
                    $label_incoming.text(xabber.getString("contact_subscription_send")).prev('input').prop('checked', true);
                    $label_outcoming.text(xabber.getString("contact_subscription_receive")).prev('input').prop('checked', true);
                } else if (subscription === 'from') {
                    $label_incoming.text(xabber.getString("contact_subscription_send")).prev('input').prop('checked', true);
                    $label_outcoming.text(xabber.getString("contact_subscription_ask")).prev('input').prop('checked', false);
                } else if (subscription === 'to') {
                    $label_incoming.text(xabber.getString("contact_subscription_accept")).prev('input').prop('checked', this.model.get('subscription_preapproved') ? true : false);
                    $label_outcoming.text(xabber.getString("contact_subscription_receive")).prev('input').prop('checked', true);
                }
                else if (!subscription || subscription === 'none') {
                    $label_incoming.text(xabber.getString("contact_subscription_accept")).prev('input').prop('checked', this.model.get('subscription_preapproved') ? true : false);
                    $label_outcoming.text(xabber.getString("contact_subscription_ask")).prev('input').prop('checked', false);
                }
                if (in_request && subscription !== 'both') {
                    $label_incoming.text(xabber.getString("contact_subscription_send")).prev('input').prop('checked', false);
                }
                if (out_request) {
                    $label_outcoming.text(xabber.getString("contact_subscription_ask")).prev('input').prop('checked', true);
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
                        contact.set('subscription_preapproved', true);
                        contact.acceptRequest();
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
                let options = {};
                (xabber.chats_view.active_chat && xabber.chats_view.active_chat.model.get('jid') === this.model.get('jid') && xabber.chats_view.active_chat.model.get('encrypted')) && (options.encrypted = true);
                this.model.trigger("open_chat", this.model, options);
            },

            voiceCall: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active') || this.model.get('blocked'))
                    return;
                if (xabber.get('audio'))
                    this.initCall(ev);
            },

            initCall: function () {
                if (xabber.current_voip_call) {
                    utils.callback_popup_message(xabber.getString("jingle__error__call_in_progress"), 1000);
                    return;
                }
                this.openChat();
                let chat = this.account.chats.getChat(this.model);
                if (!chat.item_view.content)
                    chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                chat.item_view.content.initJingleMessage();
            },

            deleteContact: function () {
                this.model.deleteWithDialog();
            },

            blockContact: function () {
                this.model.blockWithDialog();
            },

            unblockContact: function () {
                this.model.unblockWithDialog();
            },

            changeNotifications: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active') || this.model.get('blocked'))
                    return
                let chat = this.account.chats.getChat(this.model);
                chat.muteChat();
            },

            addContact: function () {
                xabber.add_contact_view.show({account: this.account, jid: this.model.get('jid')});
            },

            requestAuthorization: function () {
                this.model.pres('subscribe');
                this.model.trigger('presence', this.model, 'subscribe_from');
                this.openChat();
            }
        });

        xabber.ContactDetailsViewRight = xabber.ContactDetailsView.extend({
            className: 'details-panel-right contact-details-panel',
            template: templates.contact_details_right,
            avatar_size: constants.AVATAR_SIZES.CONTACT_DETAILS,

            events: {
                "click .btn-escape:not(.btn-top)": "openChat",
                "click .btn-escape.btn-top": "scrollToTopSmooth",
                "click .btn-edit": "showEdit",
                "click .btn-chat": "openChat",
                "click .panel-background-clickable": "openChat",
                "click .btn-search": "showSearchMessages",
                "click .btn-voice-call": "voiceCall",
                "click .btn-add": "addContact",
                "click .btn-delete": "deleteContact",
                "click .btn-block": "blockContact",
                "click .btn-qr-code": "showQRCode",
                "click .btn-unblock": "unblockContact",
                "click .btn-mute-dropdown": "muteChat",
                "click .btn-mute.muted": "unmuteChat",
                "click .list-variant": "changeList",
                "click .btn-auth-request": "requestAuthorization",
            },

            _initialize: function (options) {
                this.encrypted = options.encrypted;
                this.ps_container = this.$('.panel-content-wrap');
                this.account = this.model.account;
                this.chat = this.account.chats.getChat(this.model, options.encrypted && 'encrypted');
                this.name_field = new xabber.ContactNameWidget({
                    el: this.$('.name-wrap')[0],
                    model: this.model
                });
                this.name_field.$('.contact-name-input').prop('disabled', true)
                if (!this.encrypted){
                    this.contact_edit_view = this.addChild('edit', xabber.ContactEditView,
                        {model: this.model, el: this.$('.edit-block-wrap')[0]});
                }
                this.contact_searched_messages_view = this.addChild('search', xabber.ContactSearchedMessagesView,
                    {model: this.account.chats.getChat(this.model), query_text: '1', el: this.$('.search-messages-block-wrap')[0]});
                this.vcard_view = this.addChild('vcard', xabber.ContactRightVCardView,
                    {model: this.model, el: this.$('.vcard')[0]});
                this.edit_groups_view = this.addChild('groups',
                    xabber.ContactEditGroupsView, {el: this.$('.groups-block-wrap')[0]});
                this.updateName();
                this.updateStatus();
                this.updateAvatar();
                this.updateButtons();
                this.updateColorScheme();
                this.account.settings.on("change:color", this.updateColorScheme, this);
                this.ps_container.on("ps-scroll-up ps-scroll-down", this.onScroll.bind(this));
                this.model.on("change", this.update, this);
                this.chat.on("change:muted", this.updateNotifications, this);
                xabber.on("change:video", this.updateJingleButtons, this);
                xabber.on("change:audio", this.updateJingleButtons, this);
            },

            render: function (options) {
                if (!this.model.get('vcard_updated')) {
                    this.vcard_view.refresh();
                }
                if (!this.model.get('saved_search_panel')) {
                    if (this.ps_container.length) {
                        this.ps_container.perfectScrollbar(
                            _.extend(this.ps_settings || {}, xabber.ps_settings)
                        );
                    }
                }
                else {
                    this.ps_container.perfectScrollbar('destroy');
                }
                this.$('.btn-mute').dropdown({
                    inDuration: 100,
                    outDuration: 100,
                    hover: false
                });
                if (this.encrypted){
                    this.$('.btn-search-messages').remove()
                    this.$('.btn-edit').remove()
                    this.$('.btn-qr-code').remove()
                }
                this.updateChilds();
                this.updateSubscriptions();
                this.updateJingleButtons();
                this.updateStatusMsg();
                this.updateName();
                this.updateNotifications();
                this.setButtonsWidth();
                this.updateList('image');
                xabber.once("update_css", this.updateIndicator, this);
                this.onScroll();
                this.model.resources.models.forEach((resource) => {this.model.resources.requestInfo(resource)});
                $(window).bind("keydown.contact_panel", this.keydownHandler.bind(this));
            },

            updateChilds: function () {
                if (this.vcard_view && !this.model.get('vcard_hidden'))
                    this.vcard_view.hideVCard();
                if (this.contact_edit_view && !this.model.get('edit_hidden'))
                    this.contact_edit_view.hideEdit();
            },

            updateIndicator: function () {
                this.$('.tabs .indicator').remove();
                this.$('.tabs').tabs();
                this.$('.indicator').addClass('ground-color-500');
            },


            keydownHandler: function (ev) {
                if (!xabber.body.$el.siblings('.mfp-ready').length && !$.magnificPopup.instance.isOpen && ev.keyCode === constants.KEY_ESCAPE && !xabber.body.$el.siblings('#modals').children('.open').length) {
                    this.model.showDetailsRight('all-chats');
                    $(window).unbind("keydown.contact_panel");
                }
            },

            openChat: function (ev) {
                this.model.showDetailsRight('all-chats');
            },

            updateColorScheme: function () {
                this.$el.attr('data-color', this.account.settings.get('color'));
            },

            scrollToTopSmooth: function () {
                this.ps_container.animate(
                    {scrollTop: 0},
                    400,
                    () => {
                        this.onScroll();
                    });
            },

            setButtonsWidth: function () {
                let widths = [];
                this.$('.main-info .button-wrap').each((i, button) => {widths.push(button.clientWidth)});
                this.$('.main-info .button-wrap').css('width', `${Math.max.apply(null, widths)}px`);
            },

            onChangedVisibility: function () {
                this.model.set('display', this.isVisible());
            },

            updateJingleButtons: function () {
                this.$('.btn-voice-call').switchClass('non-active', !xabber.get('audio'));
            },

            update: function () {
                let changed = this.model.changed;
                if (_.has(changed, 'name')) this.updateName();
                if (_.has(changed, 'image')) this.updateAvatar();
                if (_.has(changed, 'status_updated')) this.updateStatus();
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
                this.$('.main-info .name-wrap').text(this.model.get('name'));
                if (this.model.get('roster_name') && this.model.get('name') != this.model.get('roster_name'))
                    this.$('.main-info .name-wrap').addClass('name-is-custom');
                else
                    this.$('.main-info .name-wrap').removeClass('name-is-custom');
            },

            onScroll: function () {
                if (this.model.get('saved_search_panel') && !this.model.get('search_hidden')){
                    this.ps_container.perfectScrollbar('destroy');
                    return true;
                }
                let bottom_block_scroll;
                if (this.$('.bottom-block:not(.edit-bottom-block)'))
                    bottom_block_scroll = this.$('.bottom-block:not(.edit-bottom-block)').get(0).getBoundingClientRect().top;

                if(this.ps_container[0].scrollTop >= 200) {
                    this.$('.header-buttons').css({'background-color': 'rgba(255,255,255,1)'});
                    this.$('.main-info').addClass('fixed-scroll');
                    this.$('.main-info').css({width: xabber.right_contact_panel.$el.find('.details-panel-right').width()});
                    this.$('.block-wrap.vcard').css({'padding-top': '340px'})
                    this.$('.main-info .block-name:not(.second-text)').removeClass('fade-out');
                    this.$('.main-info .block-name.second-text').addClass('fade-out');
                }
                else if(this.ps_container[0].scrollTop >= 40) {
                    this.$('.header-buttons').css({'background-color': 'rgba(255,255,255,0.5)'});
                    this.$('.main-info').removeClass('fixed-scroll');
                    this.$('.block-wrap.vcard').css({'padding-top': '0'});
                    this.$('.main-info .block-name').addClass('fade-out');
                }
                else{
                    this.$('.header-buttons').css({'background-color': 'rgba(255,255,255,0)'});
                    this.$('.main-info').removeClass('fixed-scroll');
                    this.$('.block-wrap.vcard').css({'padding-top': '0'});
                    this.$('.main-info .block-name').addClass('fade-out');
                }
                if (bottom_block_scroll && bottom_block_scroll < 150) {
                    this.$('.bottom-block:not(.edit-bottom-block) .tabs').addClass('fixed-scroll');
                    this.$('.btn-escape').addClass('btn-top');
                    this.$('.btn-escape i').addClass('mdi-arrow-right').removeClass('mdi-close');
                    this.$('.bottom-block:not(.edit-bottom-block) .participants-search-form').addClass('fixed-scroll');
                    this.$('.buttons-wrap').hideIf(true);
                    this.$('.btn-edit').hideIf(true);
                    this.$('.btn-qr-code').hideIf(true);
                    this.$('.main-info .block-name:not(.second-text)').addClass('fade-out');
                    this.$('.main-info .block-name.second-text').removeClass('fade-out');
                    this.$('.main-info .block-name.second-text').text(this.$('.list-variant .active').text())
                }
                else {
                    this.$('.btn-escape').removeClass('btn-top');
                    this.$('.btn-escape i').addClass('mdi-close').removeClass('mdi-arrow-right');
                    this.$('.bottom-block:not(.edit-bottom-block) .tabs').removeClass('fixed-scroll');
                    this.$('.bottom-block:not(.edit-bottom-block) .participants-search-form').removeClass('fixed-scroll');
                    this.$('.buttons-wrap').hideIf(false);
                    this.$('.btn-edit').hideIf(false);
                    this.$('.btn-qr-code').hideIf(false);
                }
            },

            updateStatus: function () {
                this.$('.main-info .status').attr('data-status', this.model.get('status'));
                this.$('.main-info .status-message').text(this.model.getStatusMessage());
            },

            updateStatusMsg: function () {
                this.$('.main-info .status-message').text(this.model.getStatusMessage());
            },

            updateAvatar: function () {
                let image = this.model.cached_image;
                this.$('.circle-avatar').setAvatar(image, this.avatar_size);
            },

            updateButtons: function () {
                let in_roster = this.model.get('in_roster'),
                    is_blocked = this.model.get('blocked'),
                    is_server = this.model.get('server'),
                    subscription = this.model.get('subscription');
                this.$('.btn-add').hideIf(in_roster);
                this.$('.btn-block-wrap .contact-btn').switchClass('btn-block', !is_blocked).switchClass('btn-unblock', is_blocked);
                this.$('.btn-block-wrap .btn-name').text(is_blocked ? xabber.getString("contact_bar_unblock") : xabber.getString("contact_bar_block"));
                this.$('.buttons-wrap .button-wrap:not(.btn-block-wrap):not(.btn-search-messages)').switchClass('non-active', is_blocked);
                this.$('.contact-mute-dropdown').hideIf(is_blocked);
                this.$('.btn-auth-request').showIf(!is_server && in_roster && !is_blocked &&
                    subscription !== 'both' && subscription !== 'to');
            },

            updateNotifications: function () {
                if (this.chat.isMuted()) {
                    if (this.chat.isMuted() > 4800000000)
                        this.$('.btn-mute').html(env.templates.svg['bell-off']());
                    else
                        this.$('.btn-mute').html(env.templates.svg['bell-sleep']());
                    this.$('.btn-mute').addClass('muted').addClass('active')
                }
                else {
                    this.$('.btn-mute').html(env.templates.svg['bell']());
                    this.$('.btn-mute').removeClass('muted')
                }
                this.$('.btn-mute-dropdown').hideIf(this.chat.isMuted());
                this.$('.btn-unmute-dropdown').hideIf(!this.chat.isMuted());
            },

            showQRCode: function () {
                let qrcode = new VanillaQR({
                    url: 'xmpp:' + this.model.get('jid'),
                    noBorder: true
                });
                utils.dialogs.ask(xabber.getString("dialog_show_qr_code__header"), null, {escape_button: true, canvas: qrcode.domElement, bottom_text: ('<div class="name">' + this.model.get('name') + '</div><div class="jid">' + this.model.get('jid') + '</div>')}, { cancel_button_text: ' ', ok_button_text: ' '}, 'hidden').done((result) => {
                });
            },

            updateSubscriptions: function () {
                let subscription = this.model.get('subscription'),
                    in_request = this.model.get('subscription_request_in'),
                    out_request = this.model.get('subscription_request_out'),
                    $label_outcoming = this.$('label[for="outcoming-subscription"]'),
                    $label_incoming = this.$('label[for="incoming-subscription"]');
                if (subscription === 'both') {
                    $label_incoming.text(xabber.getString("contact_subscription_send")).prev('input').prop('checked', true);
                    $label_outcoming.text(xabber.getString("contact_subscription_receive")).prev('input').prop('checked', true);
                } else if (subscription === 'from') {
                    $label_incoming.text(xabber.getString("contact_subscription_send")).prev('input').prop('checked', true);
                    $label_outcoming.text(xabber.getString("contact_subscription_ask")).prev('input').prop('checked', false);
                } else if (subscription === 'to') {
                    $label_incoming.text(xabber.getString("contact_subscription_accept")).prev('input').prop('checked', this.model.get('subscription_preapproved') ? true : false);
                    $label_outcoming.text(xabber.getString("contact_subscription_receive")).prev('input').prop('checked', true);
                }
                else if (!subscription || subscription === 'none') {
                    $label_incoming.text(xabber.getString("contact_subscription_accept")).prev('input').prop('checked', this.model.get('subscription_preapproved') ? true : false);
                    $label_outcoming.text(xabber.getString("contact_subscription_ask")).prev('input').prop('checked', false);
                }
                if (in_request && subscription !== 'both') {
                    $label_incoming.text(xabber.getString("contact_subscription_send")).prev('input').prop('checked', false);
                }
                if (out_request) {
                    $label_outcoming.text(xabber.getString("contact_subscription_ask")).prev('input').prop('checked', true);
                }
            },

            showEdit: function (ev) {
                this.contact_edit_view.showEdit();
            },

            voiceCall: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active') || this.model.get('blocked'))
                    return;
                if (xabber.get('audio'))
                    this.initCall(ev);
            },

            initCall: function () {
                if (xabber.current_voip_call) {
                    utils.callback_popup_message(xabber.getString("jingle__error__call_in_progress"), 1000);
                    return;
                }
                let chat = this.account.chats.getChat(this.model);
                if (!chat.item_view.content)
                    chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                chat.item_view.content.initJingleMessage();
            },

            deleteContact: function () {
                this.model.deleteWithDialog();
            },

            blockContact: function () {
                this.model.blockWithDialog();
            },

            unblockContact: function () {
                this.model.unblockWithDialog();
            },

            muteChat: function (ev) {
                if (this.model.get('blocked'))
                    return;
                let mute_type = $(ev.target).closest('.btn-mute-dropdown').data('mute'),
                    muted_seconds;
                if (mute_type === 'minutes15')
                    muted_seconds = 900
                if (mute_type === 'hours1')
                    muted_seconds = 3600
                if (mute_type === 'hours2')
                    muted_seconds = 7200
                if (mute_type === 'day')
                    muted_seconds = 86400
                if (mute_type === 'forever')
                    muted_seconds = 0
                this.chat.muteChat(muted_seconds);
            },

            unmuteChat: function (ev) {
                if (this.model.get('blocked'))
                    return;
                this.chat.muteChat('');
            },

            showSearchMessages: function (ev) {
                this.scrollToTop();
                if (this.ps_container.length) {
                    this.ps_container.perfectScrollbar('destroy');
                }
                this.model.set('search_hidden', false);
                this.$('.search-wrap').hideIf(this.model.get('search_hidden'));
                this.contact_searched_messages_view.$search_form.find('input').focus();
            },

            addContact: function () {
                xabber.add_contact_view.show({account: this.account, jid: this.model.get('jid')});
            },

            changeList: function (ev) {
                let $target = $(ev.target).closest('.list-variant'),
                    list_name = $target.data('value');
                this.$('.tabs').animate({scrollLeft: $target.position().left}, 400);
                this.ps_container.animate(
                    {scrollTop: this.$('.bottom-block:not(.edit-bottom-block)').position().top + this.ps_container.scrollTop()-110},
                    200,
                    () => {
                        this.onScroll();
                        this.ps_container.animate(
                            {scrollTop: this.$('.bottom-block:not(.edit-bottom-block)').position().top + this.ps_container.scrollTop()-110},
                            0,
                        );
                });
                this.$('.header-buttons .block-name.second-text').text($target.text())
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
                    case 'image':
                        constructor_func = xabber.MediaImagesView;
                        break;
                    case 'video':
                        constructor_func = xabber.MediaVideosView;
                        break;
                    case 'files':
                        constructor_func = xabber.MediaFilesView;
                        break;
                    case 'voice':
                        constructor_func = xabber.MediaVoiceView;
                        break;
                };
                if (constructor_func)
                    return this.addChild(name, constructor_func, {model: this.model, encrypted: this.encrypted, el: this.$('.participants-wrap')[0]});
                else
                    return;
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
                "click .btn-delete-group": "deleteGroup",
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
                this.model.on("change:subscription", this.updateButtons, this);
            },

            render: function () {
                this.updateName();
                this.updateButtons();
                if (!this.model.my_rights)
                    this.model.getMyInfo(() => {
                        this.updateButtons();
                    });
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
                this.setButtonsWidth();
                return this;
            },

            update: function () {
                let changed = this.model.changed;
                if (_.has(changed, 'name')) this.updateName();
                if (_.has(changed, 'image')) this.updateAvatar();
                // if (_.has(changed, 'muted')) this.updateNotifications();
                if (_.has(changed, 'status_updated') || _.has(changed, 'status_message')) this.updateStatus();
            },

            updateColorScheme: function () {
                this.$el.attr('data-color', this.account.settings.get('color'));
            },

            setButtonsWidth: function () {
                let widths = [];
                this.$('.main-info .button-wrap').each((i, button) => {widths.push(button.clientWidth)});
                this.$('.main-info .button-wrap').css('width', `${Math.max.apply(null, widths)}px`);
            },

            updateButtons: function () {
                let is_owner = this.model.my_rights && this.model.my_rights.fields.find(permission => permission.var == 'owner' && permission.values),
                    change_group = this.model.my_rights && this.model.my_rights.fields.find(permission => permission.var == 'change-group' && permission.values),
                    is_blocked = this.model.get('blocked');
                this.$('.btn-settings-wrap').switchClass('non-active', !is_owner);
                this.$('.btn-edit-settings').switchClass('hidden', !(is_owner || change_group));
                this.$('.btn-leave-wrap').switchClass('non-active', this.model.get('subscription') != 'both');
                this.$('.btn-invite-wrap').switchClass('non-active', this.model.get('private_chat') || this.model.get('subscription') != 'both');
                this.$('.btn-default-restrictions-wrap').switchClass('non-active', !is_owner);
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
                let chat = this.account.chats.getChat(this.model);
                chat.muteChat();
            },

            // updateNotifications: function () {
            //     let chat = this.account.chats.getChat(this.model);
            //     this.$('.btn-mute').switchClass('mdi-bell-off', chat.get('muted'));
            //     this.$('.btn-mute').switchClass('mdi-bell', !chat.get('muted'));
            // },

            showQRCode: function () {
                let qrcode = new VanillaQR({
                    url: 'xmpp:' + this.model.get('jid'),
                    noBorder: true
                });
                utils.dialogs.ask(xabber.getString("dialog_show_qr_code__header"), null, {escape_button: true, canvas: qrcode.domElement, bottom_text: ('<div class="name">' + this.model.get('name') + '</div><div class="jid">' + this.model.get('jid') + '</div>')}, { cancel_button_text: ' ', ok_button_text: ' '}, 'hidden').done((result) => {
                });
            },

            editProperties: function (ev) {
                if (!$(ev.target).closest('.button-wrap').hasClass('non-active')) {
                        let iq_get_properties = $iq({to: this.model.get('full_jid') || this.model.get('jid'), type: 'get'})
                            .c('query', {xmlns: Strophe.NS.GROUP_CHAT});
                        this.account.sendIQFast(iq_get_properties, (properties) => {
                            let data_form = this.account.parseDataForm($(properties).find(`x[xmlns="${Strophe.NS.DATAFORM}"]`));
                            this.group_chat_properties_edit.open(data_form);
                        }, () => {
                            utils.callback_popup_message(xabber.getString("groupchat_you_have_no_permissions_to_do_it"), 3000);
                        });
                }
            },

            editDefaultRestrictions: function (ev) {
                if (!$(ev.target).closest('.button-wrap').hasClass('non-active'))
                    this.default_restrictions_edit.open();
            },

            leaveGroupChat: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active'))
                    return;
                let contact = this.model;
                utils.dialogs.ask(xabber.getString("groupchat_leave_full"), xabber.getString("groupchat_leave_confirm", [contact.get('name')]), null, { ok_button_text: xabber.getString("groupchat_leave")}).done((result) => {
                    if (result) {
                        contact.declineSubscription();
                        contact.removeFromRoster();
                        let chat = this.account.chats.getChat(contact);
                        chat.deleteFromSynchronization(() => {
                            chat.trigger("close_chat");
                            xabber.body.setScreen('all-chats', {right: undefined});
                        }, () => {
                            chat.trigger("close_chat");
                            xabber.body.setScreen('all-chats', {right: undefined});
                        });
                    }
                });
            },

            inviteUser: function (ev) {
                if (!$(ev.target).closest('.button-wrap').hasClass('non-active')) {
                    if (!xabber.invite_panel)
                        xabber.invite_panel = new xabber.InvitationPanelView({ model: xabber.opened_chats });
                    xabber.invite_panel.open(this.account, this.model);
                }
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
                    to: this.model.get('full_jid') || this.model.get('jid')})
                    .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#invite'});
                this.account.sendFast(iq, callback, errback);
            },

            deleteGroup: function () {
                this.model.deleteWithDialog();
            },

            blockContact: function () {
                this.model.blockWithDialog();
            },

            unblockContact: function () {
                this.model.unblockWithDialog();
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
                let field = ev.target;
                if (!field.files.length) {
                    return;
                }
                let file = field.files[0];
                field.value = '';
                if (file.size > constants.MAX_AVATAR_FILE_SIZE) {
                    utils.dialogs.error(xabber.getString("group_settings__error__avatar_too_large"));
                    return;
                } else if (!file.type.startsWith('image')) {
                    utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                    return;
                }
                $(field).siblings('.preloader-wrap').addClass('visible').find('.preloader-wrapper').addClass('active');
                utils.images.getAvatarFromFile(file).done((image) => {
                    if (image) {
                        file.base64 = image;
                        this.model.pubAvatar(file, "", function () {
                            $(field).siblings('.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');
                        }, function (error) {
                            $(field).siblings('.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');

                            let error_text = $(error).find('text').text() || xabber.getString("groupchat_you_have_no_permissions_to_do_it");
                            utils.dialogs.error(error_text);
                        });
                    }
                });
            },

            retractAllMessages: function () {
                let group_chat = this.account.chats.getChat(this.model);
                utils.dialogs.ask(xabber.getString("delete_messages__header"), xabber.getString("delete_messages__confirm"), null, { ok_button_text: xabber.getString("delete")}).done((result) => {
                    if (result) {
                        group_chat.retractAllMessages(true);
                    }
                });
            },
        });

        xabber.GroupChatDetailsViewRight = xabber.BasicView.extend({
            className: 'details-panel-right groupchat-details-panel',
            template: templates.group_chats.group_chat_details_right,
            ps_selector: '.panel-content-wrap',
            avatar_size: constants.AVATAR_SIZES.CONTACT_DETAILS,
            member_avatar_size: constants.AVATAR_SIZES.GROUPCHAT_MEMBER_ITEM,

            events: {
                "click .btn-mute-dropdown": "muteChat",
                "click .btn-mute.muted": "unmuteChat",
                "click .btn-edit": "showEdit",
                "click .btn-search": "showSearchMessages",
                "click .btn-clear-history-chat": "clearHistory",
                "click .btn-qr-code": "showQRCode",
                "click .btn-leave": "leaveGroupChat",
                "click .btn-invite": "inviteUser",
                "click .btn-delete-group": "deleteGroup",
                "click .btn-edit-settings": "editProperties",
                "click .btn-default-restrictions": "showRestrictions",
                "click .btn-chat": "openChat",
                "click .panel-background-clickable": "openChat",
                "click .btn-escape:not(.btn-top)": "openChat",
                "click .btn-escape.btn-top": "scrollToTopSmooth",
                "click .btn-clear-history": "retractAllMessages",
                "change .circle-avatar input": "changeAvatar",
                "click .tabs:not(.participant-tabs) .list-variant": "changeList",
                "click .edit-pictured-buttons .list-variant": "changeList"
            },

            _initialize: function () {
                this.account = this.model.account;
                this.chat = this.account.chats.getChat(this.model);
                this.name_field = new xabber.ContactNameWidget({
                    el: this.$('.name-wrap')[0],
                    model: this.model
                });
                this.name_field.$('.contact-name-input').prop('disabled', true)
                this.participants = this.addChild('participants', xabber.ParticipantsViewRight, {model: this.model, el: this.$('.participants-wrap')[0]});
                this.edit_groups_view = this.addChild('groups',
                    xabber.ContactEditGroupsView, {el: this.$('.groups-block-wrap')[0]});
                this.contact_edit_view = this.addChild('edit', xabber.GroupEditView,
                    {model: this.model, el: this.$('.edit-block-wrap')[0]});
                this.group_chat_properties = this.addChild('properties_view', xabber.GroupChatPropertiesViewRight, {model:this.model, el: this.$('.group-chat-properties-wrap')[0]});
                this.group_chat_status = this.addChild('status_view', xabber.GroupChatStatusViewRight, {model:this.model, el: this.$('.status-block-wrap')[0]});
                this.contact_searched_messages_view = this.addChild('search', xabber.ContactSearchedMessagesView,
                    {model: this.account.chats.getChat(this.model), query_text: '1', el: this.$('.search-messages-block-wrap')[0]});
                this.group_chat_properties_edit = new xabber.GroupChatPropertiesEditView({model: this.model});
                this.default_restrictions_edit_right = this.addChild('restrictions',
                    xabber.DefaultRestrictionsRightView,
                    {model: this.model, el: this.$('.restrictions-block-wrap')[0]});
                this.updateName();
                this.updateStatus();
                this.updateAvatar();
                this.updateColorScheme();
                this.ps_container.on("ps-scroll-up ps-scroll-down", this.onScroll.bind(this));
                this.account.settings.on("change:color", this.updateColorScheme, this);
                this.model.on("change", this.update, this);
                this.chat.on("change:muted", this.updateNotifications, this);
                this.model.on("permissions_changed", this.updateButtons, this);
                this.model.on("change:subscription", this.updateButtons, this);
            },

            render: function () {
                this.updateName();
                this.updateButtons();
                if (!this.model.my_rights)
                    this.model.getMyInfo(() => {
                        this.updateButtons();
                    });
                if (!this.model.get('saved_search_panel')) {
                    if (this.ps_container.length) {
                        this.ps_container.perfectScrollbar(
                            _.extend(this.ps_settings || {}, xabber.ps_settings)
                        );
                    }
                }
                else {
                    this.ps_container.perfectScrollbar('destroy');
                }
                this.$('.btn-mute').dropdown({
                    inDuration: 100,
                    outDuration: 100,
                    hover: false
                });
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
                this.onScroll();
                this.updateChilds();
                this.updateNotifications();
                this.updateList('participants');
                this.setButtonsWidth();
                xabber.once("update_css", this.updateIndicator, this);
                $(window).bind("keydown.contact_panel", this.keydownHandler.bind(this));
                return this;
            },

            updateIndicator: function () {
                this.$('.tabs.not-edit .indicator').remove();
                this.$('.tabs.not-edit').tabs();
                this.$('.tabs.not-edit .indicator').addClass('ground-color-500');
            },

            updateChilds: function () {
                if (!this.model.get('vcard_hidden'))
                    this.group_chat_properties.hideVCard();
                if (!this.model.get('edit_hidden'))
                    this.contact_edit_view.hideEdit();
                if (!this.model.get('restrictions_hidden'))
                    this.default_restrictions_edit_right.hideRestrictions();
                this.model.set('participant_hidden', true);
                this.$('.participant-details-wrap').hideIf(this.model.get('participant_hidden'))
            },

            showEdit: function (ev) {
                this.contact_edit_view.showEdit();
            },

            showRestrictions: function (ev) {
                this.default_restrictions_edit_right.showRestrictions();
            },

            hideRestrictions: function (ev) {
                this.model.set('restrictions_hidden', true);
                this.$('.restrictions-wrap').hideIf(this.model.get('restrictions_hidden'));
                this.showEdit();
            },


            keydownHandler: function (ev) {
                if (!xabber.body.$el.siblings('.mfp-ready').length && !$.magnificPopup.instance.isOpen && ev.keyCode === constants.KEY_ESCAPE && !xabber.body.$el.siblings('#modals').children('.open').length) {
                    this.model.showDetailsRight('all-chats');
                    $(window).unbind("keydown.contact_panel");
                }
            },

            updateNotifications: function () {
                if (this.chat.isMuted()) {
                    if (this.chat.isMuted() > 4800000000)
                        this.$('.btn-mute').html(env.templates.svg['bell-off']());
                    else
                        this.$('.btn-mute').html(env.templates.svg['bell-sleep']());
                    this.$('.btn-mute').addClass('muted').addClass('active')
                }
                else {
                    this.$('.btn-mute').html(env.templates.svg['bell']());
                    this.$('.btn-mute').removeClass('muted')
                }
                this.$('.btn-mute-dropdown').hideIf(this.chat.isMuted());
            },

            update: function () {
                let changed = this.model.changed;
                if (_.has(changed, 'name')) this.updateName();
                if (_.has(changed, 'image')) this.updateAvatar();
                // if (_.has(changed, 'muted')) this.updateNotifications();
                if (_.has(changed, 'status_updated') || _.has(changed, 'status_message')) this.updateStatus();
            },

            updateColorScheme: function () {
                this.$el.attr('data-color', this.account.settings.get('color'));
            },

            setButtonsWidth: function () {
                let widths = [];
                this.$('.main-info .button-wrap').each((i, button) => {widths.push(button.clientWidth)});
                this.$('.main-info .button-wrap').css('width', `${Math.max.apply(null, widths)}px`);
            },

            updateButtons: function () {
                let is_owner = this.model.my_rights && this.model.my_rights.fields.find(permission => permission.var == 'owner' && permission.values),
                    change_group = this.model.my_rights && this.model.my_rights.fields.find(permission => permission.var == 'change-group' && permission.values),
                    is_blocked = this.model.get('blocked');
                this.$('.btn-settings-wrap').switchClass('non-active', !is_owner);
                this.$('.btn-edit-settings').switchClass('hidden', !(is_owner || change_group));
                this.$('.btn-leave-wrap').switchClass('non-active', this.model.get('subscription') != 'both');
                this.$('.btn-invite-wrap').switchClass('non-active', this.model.get('private_chat') || this.model.get('subscription') != 'both');
                this.$('.btn-default-restrictions-wrap').switchClass('non-active', !is_owner);
                this.$('.btn-block').hideIf(is_blocked);
                this.$('.btn-unblock').showIf(is_blocked);
            },

            updateName: function () {
                this.$('.main-info .contact-name').text(this.model.get('name'));
            },

            muteChat: function (ev) {
                if (this.model.get('blocked'))
                    return;
                let mute_type = $(ev.target).closest('.btn-mute-dropdown').data('mute'),
                    muted_seconds;
                if (mute_type === 'minutes15')
                    muted_seconds = 900
                if (mute_type === 'hours1')
                    muted_seconds = 3600
                if (mute_type === 'hours2')
                    muted_seconds = 7200
                if (mute_type === 'day')
                    muted_seconds = 86400
                if (mute_type === 'forever')
                    muted_seconds = 0
                this.chat.muteChat(muted_seconds);
            },

            unmuteChat: function (ev) {
                if (this.model.get('blocked'))
                    return;
                this.chat.muteChat('');
            },

            showSearchMessages: function (ev) {
                this.scrollToTop();
                if (this.ps_container.length) {
                    this.ps_container.perfectScrollbar('destroy');
                }
                this.model.set('search_hidden', false);
                this.$('.search-wrap').hideIf(this.model.get('search_hidden'));
                this.contact_searched_messages_view.$search_form.find('input').focus();
            },

            onScroll: function () {
                if (this.model.get('saved_search_panel') && !this.model.get('search_hidden')){
                    this.ps_container.perfectScrollbar('destroy');
                    return true;
                }
                let bottom_block_scroll;
                if (this.$('.bottom-block:not(.edit-bottom-block):not(.participant-bottom-block)'))
                    bottom_block_scroll = this.$('.bottom-block:not(.edit-bottom-block):not(.participant-bottom-block)').get(0).getBoundingClientRect().top;

                if(this.ps_container[0].scrollTop >= 200) {
                    this.$('.header-buttons').css({'background-color': 'rgba(255,255,255,1)'});
                    this.$('.main-info').addClass('fixed-scroll');
                    this.$('.main-info').css({width: xabber.right_contact_panel.$el.find('.details-panel-right').width()});
                    this.$('.block-wrap.vcard').css({'padding-top': '340px'})
                    this.$('.header-buttons .block-name:not(.second-text)').removeClass('fade-out');
                    this.$('.header-buttons .block-name.second-text').addClass('fade-out');
                }
                else if(this.ps_container[0].scrollTop >= 40) {
                    this.$('.header-buttons').css({'background-color': 'rgba(255,255,255,0.5)'});
                    this.$('.main-info').removeClass('fixed-scroll');
                    this.$('.block-wrap.vcard').css({'padding-top': '0'});
                    this.$('.header-buttons .block-name').addClass('fade-out');
                }
                else{
                    this.$('.header-buttons').css({'background-color': 'rgba(255,255,255,0)'});
                    this.$('.main-info').removeClass('fixed-scroll');
                    this.$('.block-wrap.vcard').css({'padding-top': '0'});
                    this.$('.header-buttons .block-name').addClass('fade-out');
                }
                if (bottom_block_scroll && bottom_block_scroll < 150) {
                    this.$('.bottom-block:not(.edit-bottom-block):not(.participant-bottom-block) .tabs').addClass('fixed-scroll');
                    this.$('.btn-escape').addClass('btn-top');
                    this.$('.btn-escape i').addClass('mdi-arrow-right').removeClass('mdi-close');
                    this.$('.bottom-block:not(.edit-bottom-block):not(.participant-bottom-block) .participants-search-form').addClass('fixed-scroll');
                    this.$('.main-info .buttons-wrap').hideIf(true);
                    this.$('.btn-edit').hideIf(true);
                    this.$('.btn-qr-code').hideIf(true);
                    this.$('.header-buttons .block-name:not(.second-text)').addClass('fade-out');
                    this.$('.header-buttons .block-name.second-text').removeClass('fade-out');
                    this.$('.header-buttons .block-name.second-text').text(this.$('.tabs:not(.participant-tabs) .list-variant .active').text())
                }
                else {
                    this.$('.btn-escape').removeClass('btn-top');
                    this.$('.btn-escape i').addClass('mdi-close').removeClass('mdi-arrow-right');
                    this.$('.bottom-block:not(.edit-bottom-block):not(.participant-bottom-block) .tabs').removeClass('fixed-scroll');
                    this.$('.bottom-block:not(.edit-bottom-block):not(.participant-bottom-block) .participants-search-form').removeClass('fixed-scroll');
                    this.$('.main-info .buttons-wrap').hideIf(false);
                    this.$('.btn-edit').hideIf(false);
                    this.$('.btn-qr-code').hideIf(false);
                }
            },

            clearHistory: function () {
                if (this.chat && this.chat.item_view && this.chat.item_view.content && this.chat.item_view.content.head){
                    this.chat.item_view.content.head.clearHistory()
                }
            },

            showQRCode: function () {
                let qrcode = new VanillaQR({
                    url: 'xmpp:' + this.model.get('jid'),
                    noBorder: true
                });
                utils.dialogs.ask(xabber.getString("dialog_show_qr_code__header"), null, {escape_button: true, canvas: qrcode.domElement, bottom_text: ('<div class="name">' + this.model.get('name') + '</div><div class="jid">' + this.model.get('jid') + '</div>')}, { cancel_button_text: ' ', ok_button_text: ' '}, 'hidden').done((result) => {
                });
            },

            editProperties: function (ev) {
                if (!$(ev.target).closest('.button-wrap').hasClass('non-active')) {
                        let iq_get_properties = $iq({to: this.model.get('full_jid') || this.model.get('jid'), type: 'get'})
                            .c('query', {xmlns: Strophe.NS.GROUP_CHAT});
                        this.account.sendIQFast(iq_get_properties, (properties) => {
                            let data_form = this.account.parseDataForm($(properties).find(`x[xmlns="${Strophe.NS.DATAFORM}"]`));
                            this.group_chat_properties_edit.open(data_form);
                        }, () => {
                            utils.callback_popup_message(xabber.getString("groupchat_you_have_no_permissions_to_do_it"), 3000);
                        });
                }
            },

            leaveGroupChat: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active'))
                    return;
                let contact = this.model;
                utils.dialogs.ask(xabber.getString("groupchat_leave_full"), xabber.getString("groupchat_leave_confirm", [contact.get('name')]), null, { ok_button_text: xabber.getString("groupchat_leave")}).done((result) => {
                    if (result) {
                        contact.declineSubscription();
                        contact.removeFromRoster();
                        let chat = this.account.chats.getChat(contact);
                        chat.deleteFromSynchronization(() => {
                            chat.trigger("close_chat");
                            xabber.body.setScreen('all-chats', {right: undefined});
                        }, () => {
                            chat.trigger("close_chat");
                            xabber.body.setScreen('all-chats', {right: undefined});
                        });
                    }
                });
            },

            inviteUser: function (ev) {
                if (!$(ev.target).closest('.button-wrap').hasClass('non-active')) {
                    if (!xabber.invite_panel)
                        xabber.invite_panel = new xabber.InvitationPanelView({ model: xabber.opened_chats });
                    xabber.invite_panel.open(this.account, this.model);
                }
            },

            scrollToTopSmooth: function () {
                this.ps_container.animate(
                    {scrollTop: 0},
                    400,
                    () => {
                        this.onScroll();
                    });
            },

            changeList: function (ev) {
                let $target = $(ev.target).closest('.list-variant'),
                    list_name = $target.data('value');
                if (list_name != 'blocked' && list_name != 'invitations') {
                    this.$('.main-info .header-buttons .block-name.second-text').text($target.text())
                    this.$('.tabs').animate({scrollLeft: $target.position().left - 80}, 400);
                    this.ps_container.animate(
                        {scrollTop: this.$('.bottom-block:not(.edit-bottom-block):not(.participant-bottom-block)').position().top + this.ps_container.scrollTop() - 110},
                        400,
                        () => {
                            this.onScroll();
                            this.ps_container.animate(
                                {scrollTop: this.$('.bottom-block:not(.edit-bottom-block):not(.participant-bottom-block)').position().top + this.ps_container.scrollTop() - 110},
                                0,
                            );
                        });
                }
                this.updateList(list_name);
            },

            updateList: function (name) {
                let view = this.child(name);
                !view && (view = this.addList(name));
                if (view) {
                    if (name === 'invitations' || name === 'blocked'){
                        this.$('.edit-wrap .tabs .list-variant a').removeClass('active');
                        this.$('.edit-wrap .tabs .list-variant[data-value="' + name + '"] a').addClass('active');
                    }
                    else {
                        this.$('.tabs.not-edit .list-variant a').removeClass('active');
                        this.$('.tabs.not-edit .list-variant[data-value="' + name + '"] a').addClass('active');
                    }
                    view._render();
                }
            },

            addList: function (name) {
                let constructor_func, edit_view;
                switch (name) {
                    case 'image':
                        constructor_func = xabber.MediaImagesView;
                        break;
                    case 'video':
                        constructor_func = xabber.MediaVideosView;
                        break;
                    case 'files':
                        constructor_func = xabber.MediaFilesView;
                        break;
                    case 'voice':
                        constructor_func = xabber.MediaVoiceView;
                        break;
                    case 'blocked':
                        constructor_func = xabber.BlockedView;
                        edit_view = true;
                        break;
                    case 'invitations':
                        constructor_func = xabber.InvitationsView;
                        edit_view = true;
                        break;
                };
                if (constructor_func && edit_view)
                    return this.addChild(name, constructor_func, {model: this.model, el: this.$('.participants-edit-wrap')[0]});
                else if (constructor_func)
                    return this.addChild(name, constructor_func, {model: this.model, el: this.$('.participants-wrap')[0]});
                else
                    return;
            },

            getInvitations: function (callback, errback) {
                let iq = $iq({
                    type: 'get',
                    to: this.model.get('full_jid') || this.model.get('jid')})
                    .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#invite'});
                this.account.sendFast(iq, callback, errback);
            },

            deleteGroup: function () {
                this.model.deleteWithDialog();
            },

            blockContact: function () {
                this.model.blockWithDialog();
            },

            unblockContact: function () {
                this.model.unblockWithDialog();
            },

            updateStatus: function () {
                this.$('.main-info .status-message').text(this.model.getStatusMessage());
            },

            updateAvatar: function () {
                let image = this.model.cached_image;
                this.$('.main-info .circle-avatar').setAvatar(image, this.avatar_size);
            },

            openChat: function (ev) {
                this.model.showDetailsRight('all-chats');
            },

            changeAvatar: function (ev) {
                let field = ev.target;
                if (!field.files.length) {
                    return;
                }
                let file = field.files[0];
                field.value = '';
                if (file.size > constants.MAX_AVATAR_FILE_SIZE) {
                    utils.dialogs.error(xabber.getString("group_settings__error__avatar_too_large"));
                    return;
                } else if (!file.type.startsWith('image')) {
                    utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                    return;
                }
                $(field).siblings('.preloader-wrap').addClass('visible').find('.preloader-wrapper').addClass('active');
                utils.images.getAvatarFromFile(file).done((image) => {
                    if (image) {
                        file.base64 = image;
                        this.model.pubAvatar(file, "", function () {
                            $(field).siblings('.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');
                        }, function (error) {
                            $(field).siblings('.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');

                            let error_text = $(error).find('text').text() || xabber.getString("groupchat_you_have_no_permissions_to_do_it");
                            utils.dialogs.error(error_text);
                        });
                    }
                });
            },

            retractAllMessages: function () {
                let group_chat = this.account.chats.getChat(this.model);
                utils.dialogs.ask(xabber.getString("delete_messages__header"), xabber.getString("delete_messages__confirm"), null, { ok_button_text: xabber.getString("delete")}).done((result) => {
                    if (result) {
                        group_chat.retractAllMessages(true);
                    }
                });
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
                this.model.on("change:status", this.render, this);
                this.model.on("change:group_info", this.render, this);
            },

            render: function () {
                let group_info = this.model.get('group_info');
                if (!group_info)
                    return;
                this.$('.status').attr('data-status', group_info.status || this.model.get('status'));
                this.$('.status-message').text(group_info.status_msg);
            },

            setStatus: function () {
                let set_status_view = new xabber.SetGroupchatStatusView();
                set_status_view.open(this.model);
            }
        });

        xabber.GroupChatStatusViewRight = xabber.BasicView.extend({
            template: templates.group_chats.group_status_right,
            events: {
                "click .group-chat-status-wrap": "setStatus",
                "click .btn-edit-status": "setStatus"
            },

            _initialize: function () {
                this.$el.html(this.template());
                this.render();
                this.model.on("change:status", this.render, this);
                this.model.on("change:group_info", this.render, this);
            },

            render: function () {
                let group_info = this.model.get('group_info');
                if (!group_info)
                    return;
                this.updateIcon()
                this.$('.status').attr('data-status', group_info.status || this.model.get('status'));
                this.$('.status-message').text(group_info.status_msg);
            },

            updateIcon: function () {
                let ic_name = this.model.getIcon();
                this.$('.status-bulb').addClass('hidden');
                if (this.model.get('invitation'))
                    return;
                ic_name && this.$('.status-bulb').removeClass('hidden').switchClass(ic_name, ic_name == 'server' || ic_name == 'blocked').html(env.templates.svg[ic_name]());
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
                this.model.on("change:group_info", this.update, this);
                this.model.on("change:vcard_updated", this.update, this);
            },

            render: function () {
                if (!this.model.get('vcard_updated'))
                    this.model.vcard && this.model.vcard.refresh();
                this.update();
            },

            update: function () {
                let info = this.model.get('group_info') || {};
                this.$('.block-name').text(this.model.get('incognito_group') ? xabber.getString("incognito_group_settings__header") : xabber.getString("public_group_settings__header"));
                this.$('.jabber-id .value').text(info.jid);
                this.$('.name .value').text(info.name);
                this.$('.description .value').text(info.description);
                this.$('.model .value').text(utils.pretty_name(info.model));
                this.$('.status .value').text(utils.pretty_name(info.status));
                this.$('.searchable .value').text((info.searchable === 'none') ? xabber.getString("groupchat_index_type_none") : utils.pretty_name(info.searchable));
                this.$('.name-info-wrap').switchClass('hidden', !info.name);
                this.$('.description-info-wrap').switchClass('hidden', !info.description);
                this.$('.model-info-wrap').switchClass('hidden', !info.model);
                this.$('.status-info-wrap').switchClass('hidden', !info.status);
                this.$('.searchable-info-wrap').switchClass('hidden', !info.searchable);
            },

            onClickIcon: function (ev) {
                let $target_info = $(ev.target).closest('.info-wrap'),
                    $target_value = $target_info.find('.value'), copied_text = "";
                $target_value.each((idx, item) => {
                    let $item = $(item),
                        value_text = $item.text();
                    if ($target_info.hasClass('searchable-info-wrap')) {
                        let label_name = $target_info.find('.label').first().text();
                        if (value_text === xabber.getString("groupchat_index_type_none"))
                            value_text += ' ' + label_name.toLowerCase();
                    }
                    value_text && (copied_text != "") && (copied_text += '\n');
                    value_text && (copied_text += value_text);
                    copied_text && utils.copyTextToClipboard(copied_text, xabber.getString("toast__copied_in_clipboard"), xabber.getString("toast__not_copied_in_clipboard"));
                });
            }
        });

        xabber.GroupChatPropertiesViewRight = xabber.BasicView.extend({
            template: templates.group_chats.group_chat_properties_right,

            events: {
                "click .btn-vcard-refresh": "refresh",
                "click .info-hover": "onClickIcon",
                "click .btn-back": "hideVCard"
            },

            _initialize: function () {
                this.$el.html(this.template());
                this.contact = this.model;
                this.account = this.model.account;
                this.model.on("change:group_info", this.update, this);
                this.model.on("change:vcard_updated", this.update, this);
                this.ps_container = this.$('.full-vcard-content');
                if (this.ps_container.length) {
                    this.ps_container.perfectScrollbar(
                        _.extend(this.ps_settings || {}, xabber.ps_settings)
                    );
                }
                this.ps_container.on("ps-scroll-up ps-scroll-down", this.onScroll.bind(this));
                this.model.set('vcard_hidden', true)
            },

            render: function () {
                if (!this.model.get('vcard_updated'))
                    this.model.vcard && this.model.vcard.refresh();
                this.$('.full-vcard-wrap').hideIf(this.model.get('vcard_hidden'))
                if (this.parent.ps_container.length) {
                    if(!this.model.get('vcard_hidden'))
                        this.parent.ps_container.perfectScrollbar('destroy')
                    else
                        this.parent.ps_container.perfectScrollbar(
                            _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                        );
                }
                this.model.updateName();
                this.model.updateAvatar();
                this.hideMoreDescription();
                this.model.getVCard(() => {
                    this.updateName()
                    this.update();
                    if (this.parent.contact_edit_view)
                        this.parent.contact_edit_view.update();
                });
            },

            onScroll: function () {
                if(this.ps_container[0].scrollTop >= 170) {
                    this.$('.vcard-header-title').addClass('fixed-scroll');
                    this.$('.vcard-header-title').css({'background-color': 'rgba(255,255,255,1)'});
                }
                else if(this.ps_container[0].scrollTop >= 40) {
                    this.$('.vcard-header-title').removeClass('fixed-scroll');
                    this.$('.vcard-header-title').css({'background-color': 'rgba(255,255,255,0.5)'});
                }
                else {
                    this.$('.vcard-header-title').removeClass('fixed-scroll');
                    this.$('.vcard-header-title').css({'background-color': 'rgba(255,255,255,0)'});
                }

            },

            hideMoreDescription: function (ev) {
                if (!this.$('.vcard-wrap .info.description').hasClass('short')) {
                    this.$('.vcard-wrap .info.description').addClass('short');
                    this.$('.show-vcard').hideIf(false);
                }
            },


            showVCard: function (ev) {
                this.model.set('vcard_hidden', false);
                this.$('.full-vcard-wrap').hideIf(this.model.get('vcard_hidden'))
                this.model.getVCard(() => {
                    this.updateName()
                    this.update();
                });
                this.parent.$('.main-info').removeClass('fixed-scroll');
                this.$('.vcard-header').css({width: xabber.right_contact_panel.$el.find('.details-panel-right').width()});
                this.parent.scrollToTop();
                if (this.parent.ps_container.length) {
                    this.parent.ps_container.perfectScrollbar('destroy')
                }
            },

            hideVCard: function (ev) {
                this.model.set('vcard_hidden', true);
                if (this.parent.ps_container.length) {
                    this.parent.ps_container.perfectScrollbar(
                        _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                    );
                }
                this.scrollToTop();
                this.onScroll();
                this.parent.onScroll();
                this.$('.full-vcard-wrap').hideIf(this.model.get('vcard_hidden'))
            },

            updateName: function () {
                this.$('.main-info .name-wrap').text(this.model.get('name'));
                if (this.model.get('name') != this.model.get('roster_name'))
                    this.$('.main-info .name-wrap').addClass('name-is-custom');
                else
                    this.$('.main-info .name-wrap').removeClass('name-is-custom');
            },

            update: function () {
                let info = this.model.get('group_info') || {};
                this.$('.block-name').text(this.model.get('incognito_group') ? xabber.getString("incognito_group_settings__header") : xabber.getString("public_group_settings__header"));
                this.$('.jabber-id .value').text(info.jid);
                this.$('.name .value').text(info.name);
                this.$('.description .value').text(info.description);
                this.$('.model .value').text(utils.pretty_name(info.model));
                this.$('.status .value').text(utils.pretty_name(info.status));
                this.$('.searchable .value').text((info.searchable === 'none') ? xabber.getString("groupchat_index_type_none") : utils.pretty_name(info.searchable));
                this.$('.name-info-wrap').switchClass('hidden', !info.name);
                this.$('.description-info-wrap').switchClass('hidden', !info.description);
                this.$('.model-info-wrap').switchClass('hidden', !info.model);
                this.$('.status-info-wrap').switchClass('hidden', !info.status);
                this.$('.searchable-info-wrap').switchClass('hidden', !info.searchable);
            },

            onClickIcon: function (ev) {
                let $target_info = $(ev.target),
                    $target_value = $target_info.find('.value'), copied_text = "";
                $target_value.each((idx, item) => {
                    let $item = $(item),
                        value_text = $item.text();
                    value_text && (copied_text != "") && (copied_text += '\n');
                    value_text && (copied_text += value_text);
                    copied_text && utils.copyTextToClipboard(copied_text, xabber.getString("toast__copied_in_clipboard"), xabber.getString("toast__not_copied_in_clipboard"));
                });
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
                let all_fixed = this.data_form.fields.filter(f => f.type == 'fixed' || f.type == 'hidden').length == this.data_form.fields.length;
                this.$el.html(templates.group_chats.group_chat_properties_edit({all_fixed: all_fixed, fields: data_form.fields, privacy: this.contact.get('incognito_group'), jid: this.model.get('jid')}));
                this.$el.openModal({
                    ready: () => {
                        this.$('.modal-content').css('height', this.$el.height() - 115).perfectScrollbar({theme: 'item-list'});
                        this.updateScrollBar();
                    },
                    complete: () => {
                        this.$el.detach();
                        this.$('.modal-content').css('height', '100%');
                        this.data.set('visible', false);
                    }
                });
            },

            close: function () {
                this.$el.closeModal({
                    complete: () => {
                        this.$el.detach();
                        this.$('.modal-content').css('height', '100%');
                        this.data.set('visible', false);
                    }
                });
            },

            updateName: function () {
                this.$('.name-info-wrap').find('.name').find('.value').text(this.model.get('name'));
            },

            saveChanges: function() {
                if (this.$('.btn-save').hasClass('non-active'))
                    return;

                let has_changes = false,
                    iq = $iq({type: 'set', to: this.contact.get('full_jid') || this.contact.get('jid')})
                        .c('query', {xmlns: Strophe.NS.GROUP_CHAT});
                this.data_form.fields.forEach((field) => {
                    if (field.type === 'hidden' || field.type === 'fixed')
                        return;
                    let value = field.values ? field.values[0] : null,
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
                });

                if (has_changes) {
                    iq = this.account.addDataFormToStanza(iq, this.data_form);
                    this.account.sendIQFast(iq, (result) => {
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
                    }, (error) => {
                        this.$('button').addClass('non-active');
                        let err_text = $(error).find('error text').text() || xabber.getString("groupchat_you_have_no_permissions_to_do_it");
                        this.close();
                        utils.dialogs.error(err_text);
                    });
                } else
                    this.$('button').removeClass('non-active');
            },

            updateSaveButton: function () {
                let has_changes = false;
                this.data_form.fields.forEach((field) => {
                    if (field.type === 'hidden' || field.type === 'fixed')
                        return;
                    let value = field.values ? field.values[0] : null,
                        checked_inp = this.$('.' + field.var + '-field input:checked'),
                        text_inp = this.$('.' + field.var + '-field input[type="text"]'),
                        textarea = this.$('.' + field.var + '-field textarea'),
                        new_value = "";
                    checked_inp.length && (new_value = checked_inp[0].id);
                    text_inp.length && (new_value = text_inp.val());
                    textarea.length && (new_value = textarea.val());
                    (value !== new_value) && (has_changes = true);
                });
                this.$('.btn-save').switchClass('non-active', !has_changes);
            }

        });

        xabber.InvitationsView = xabber.BasicView.extend({
            events: {
            },
            status: 'invitations',
            member_avatar_size: constants.AVATAR_SIZES.GROUPCHAT_MEMBER_ITEM,

            _initialize: function (options) {
                this.contact = options.model;
                this.contact.participants.on("participants_updated", this._render, this);
                this.contact.on("invitations_send", this._render, this);
                this.account = this.contact.account;
                this.$error = $('<p class="errors"/>');
            },

            _render: function () {
                if (this.$el.length && this.$el.closest("body").length == 0)
                    this.$el = this.parent.$('.participants-edit-wrap')
                this.$el.html($(templates.preloader()));
                this.updateInvitations();
            },

            updateInvitations: function () {
                this.parent.$('.block-name-panel:not(.second-text)').html(xabber.getString("groupchat_invitations"))
                this.parent.getInvitations((response) => {
                    this.$el.html("");
                    $(response).find('query').find('user').each((idx, item) => {
                        let user = {jid: $(item).attr('jid'), status: this.status},
                            $item_view = $(templates.group_chats.invited_member_item(user)),
                            avatar = Images.getDefaultAvatar(user.jid);
                        this.$el.append($item_view);
                        $item_view.find('.circle-avatar').setAvatar(avatar, this.member_avatar_size);
                    });
                    if (!$(response).find('query').find('user').length)
                        this.$el.html(this.$error.text(xabber.getString("group_settings__invitations__no_pending_invitations")));
                    if (this.parent.contact_edit_view)
                        this.parent.contact_edit_view.showInviteButton();
                }, (err) => {

                    this.$el.html(this.$error.text($(err).find('text').text() || xabber.getString("groupchat_you_have_no_permissions_to_do_it")));
                });
            },

            revokeInvitation: function (ev) {
                let $member_item = $(ev.target).closest('.invitations-user'),
                    member_jid = $member_item.data('jid'),
                    iq = $iq({from: this.account.get('jid'), to: this.contact.get('full_jid') || this.contact.get('jid'), type: 'set'})
                        .c('revoke', {xmlns: `${Strophe.NS.GROUP_CHAT}#invite`})
                        .c('jid').t(member_jid);
                this.account.sendIQFast(iq, () => {
                    $member_item.remove();
                    if (this.parent.contact_edit_view)
                        this.parent.contact_edit_view.updateRemoveParticipantButton();
                    !this.$el.children().length && this.$el.html(this.$error.text(xabber.getString("group_settings__invitations__no_pending_invitations")));
                });
            },

            revokeInvitationByElement: function ($member_item) {
                let member_jid = $member_item.data('jid'),
                    iq = $iq({from: this.account.get('jid'), to: this.contact.get('full_jid') || this.contact.get('jid'), type: 'set'})
                        .c('revoke', {xmlns: `${Strophe.NS.GROUP_CHAT}#invite`})
                        .c('jid').t(member_jid);
                this.account.sendIQFast(iq, () => {
                    $member_item.remove();
                    !this.$el.children().length && this.$el.html(this.$error.text(xabber.getString("group_settings__invitations__no_pending_invitations")));
                });
            }
        });

        xabber.MediaBaseView = xabber.BasicView.extend({
            status: 'base',
            member_avatar_size: constants.AVATAR_SIZES.GROUPCHAT_MEMBER_ITEM,

            _initialize: function (options) {
                this.contact = options.model;
                this.participant = options.participant;
                this.encrypted = options.encrypted;
                this.account = this.contact.account;
                this.chat = this.account.chats.getChat(this.contact, this.encrypted && 'encrypted');
                this.temporary_items = []
                this.parent.ps_container.on("ps-scroll-up.mediagallery ps-scroll-down.mediagallery", this.onScroll.bind(this));
            },

            _render: function () {
                if (this.$el.length && this.$el.closest("body").length == 0)
                    this.$el = this.parent.$('.participants-details-media-wrap')
                this.$el.html($(templates.preloader()));
                this.all_messages_loaded = false;
                this.temporary_items = [];
                this.messagesFileRequest({}, () => {
                    this.$el.html("<div class='gallery-files'></div>");
                    this.updateMedia();
                });
            },

            onScroll: function () {
                if (!this.active)
                    return
                let scrollTop = this.parent.ps_container[0].scrollTop,
                    scrollHeight = this.parent.ps_container[0].scrollHeight,
                    offsetHeight = this.parent.ps_container[0].offsetHeight,
                    persentScrolled = scrollTop / (scrollHeight - offsetHeight);
                if (persentScrolled > 0.8 && this.last_rsm_message && !this.all_messages_loaded && !this.loading_messages){
                    this.loadMoreFiles();
                }
            },

            updateForParticipant: function () {
                this.delegateEvents({})
                this.parent.ps_container.off('ps-scroll-up.mediagallery').off('ps-scroll-down.mediagallery').on("ps-scroll-up.mediagallery ps-scroll-down.mediagallery", this.onScroll.bind(this));
                this.$('.gallery-file').on('click', (ev) => {
                    this.onClickFile(ev);
                });
            },

            loadMoreFiles: function () {
                $(templates.preloader()).appendTo(this.$('.gallery-files'))
                this.messagesFileRequest({[this.filter_type]: true, before: this.last_rsm_message}, () => {
                    this.updateMedia(true);
                });
            },

            filterEncryptedFiles: function () {
                return this.temporary_items;
            },

            encryptedFilesHandler: function () {
                let files_count = 0;
                this.temporary_items = this.filterEncryptedFiles();

                if (this.temporary_items.length)
                    this.temporary_items.forEach((item, idx) => {
                        let source = item.sources[0];
                        if (!item.key){
                            files_count++;
                            return;
                        }
                        this.chat.messages.decryptFile(source, item.key).then((result) => {
                            if (!this.active)
                                return
                            item.sources[0] = result
                            files_count++;
                            if (files_count === this.temporary_items.length) {
                                this.updateEncryptedMedia()
                                this.loading_messages = false;
                            }
                        });
                    });
                else {
                    this.updateEncryptedMedia()
                    this.loading_messages = false;
                    if (!this.all_messages_loaded){
                        this.loadMoreFiles();
                    }
                }
            },

            updateEncryptedMedia: function (is_loaded) {
                !this.$('.gallery-files').length && this.$el.html("<div class='gallery-files'></div>");
                this.updateMedia();
            },

            updateMedia: function (is_loaded) {
                if (!this.active)
                    return;
                if (this.temporary_items.length){
                    this.temporary_items.reverse();
                    this.temporary_items.forEach((item) => {
                        if (this.filter_type === 'filter_voice')
                            item.true_voice = true;
                        let $gallery_file = $(templates.media_item({file: item, svg_icon: utils.file_type_icon_svg(item.media_type), filesize: utils.pretty_size(item.size), duration: utils.pretty_duration(item.duration)}));
                        $gallery_file.appendTo(this.$('.gallery-files'));
                    });
                }
                this.temporary_items = [];
                this.$('.gallery-files .gallery-empty').remove();
                $(templates.media_items_empty()).appendTo(this.$('.gallery-files'));
                this.$('.gallery-files .preloader-wrapper').remove();
            },

            messagesFileRequest: function (query, callback) {
                if (!this.active || this.loading_messages)
                    return;
                let options = query || {},
                    queryid = uuid();
                this.loading_messages = true;
                !options.max && (options.max = xabber.settings.mam_messages_limit);
                !options.after && !options.before && (options.before = '');
                this.encrypted && (options.encrypted = this.encrypted)
                this.parent.participant && (options.var = [{var: 'with', value: this.parent.participant.id}]);
                this.contact.MAMRequest(options, (success, messages, rsm) => {
                    let messages_count = 0;
                    if (this.encrypted) {
                        $(templates.preloader()).appendTo(this.$('.gallery-files'))
                    }
                    $(messages).each((idx, message) => {
                        let $message = $(message),
                            msg_items = [];
                        if (this.encrypted) {
                            let deferred = new $.Deferred();
                            deferred.done(($msg) => {
                                msg_items = this.contact.getFilesFromStanza($msg);
                                if (msg_items.length)
                                    this.temporary_items = this.temporary_items.concat(msg_items)
                                messages_count++;
                                if (messages_count === messages.length){
                                    this.last_rsm_message = rsm.first;
                                    this.encryptedFilesHandler();
                                }
                            }).fail(() => {
                                messages_count++;
                                if (messages_count === messages.length){
                                    this.last_rsm_message = rsm.first;
                                    this.all_messages_loaded = true;
                                    this.encryptedFilesHandler();
                                }
                            });
                            this.account.omemo.receiveChatMessage($message, {
                                searched_message: true,
                                gallery: true,
                                query: query
                            }, deferred);
                        } else{
                            msg_items = this.contact.getFilesFromStanza($message);
                            this.account.chats.receiveChatMessage($message, {
                                searched_message: true,
                                query: query
                            });
                            if (msg_items.length)
                                this.temporary_items = this.temporary_items.concat(msg_items)
                        }
                    });
                    if (!this.encrypted){
                        this.last_rsm_message = rsm.first;
                        if (!messages.length)
                            this.all_messages_loaded = true;
                        this.loading_messages = false;
                        (this.filter_type === 'filter_files') && (this.temporary_items = this.temporary_items.filter(file => !(file.media_type && (file.media_type.includes('image') || (file.media_type.includes('video') && !file.has_encrypted_files)))));
                        if (!(this.temporary_items.length >= xabber.settings.mam_messages_limit) && this.filter_type === 'filter_files' && !this.all_messages_loaded) {
                            this.messagesFileRequest({[this.filter_type]: true, before: this.last_rsm_message}, callback);
                        }else
                            callback && callback();
                    }
                }, () => {

                });
            },

            onClickFile: function (ev) {
                let $elem = $(ev.target);
                if ($elem.hasClass('no-uploaded') || $elem.hasClass('gallery-audio-file-not-uploaded')) {
                    let $audio_elem = $elem.closest('.gallery-file'),
                        f_url = $audio_elem.attr('data-file');
                    $audio_elem.find('.mdi-play').removeClass('audio-file-play');
                    $audio_elem[0].voice_message = this.renderVoiceMessage($audio_elem.find('.gallery-file-audio-container')[0], f_url);
                    this.prev_audio_message && this.prev_audio_message.voice_message.pause();
                    this.prev_audio_message = $audio_elem[0];
                    return;
                }
                else if ($elem.hasClass('mdi-play') || $elem.children('.mdi-play').length) {
                    let $audio_elem = $elem.closest('.gallery-file');
                    this.prev_audio_message.voice_message.pause();
                    this.prev_audio_message = $audio_elem[0];
                    $audio_elem[0].voice_message.play();
                    return;
                }
                else if ($elem.hasClass('mdi-pause') || $elem.children('.mdi-pause').length) {
                    this.prev_audio_message.voice_message.pause();
                    return;
                }
                else if (!$elem.parents('.gallery-file-audio-container').length) {
                    let $file = $elem.closest('.gallery-file');
                    this.parent.saveScrollBarOffset()
                    xabber.body.data.set('contact_details_view', this.parent)
                    this.chat.getMessageContext($file.data('uniqueid'), {searched_messages: true, encrypted: this.encrypted});
                }
            },

            renderVoiceMessage: function (element, file_url) {
                let not_expanded_msg = element.innerHTML,
                    unique_id = 'waveform' + moment.now(),
                    $elem = $(element),
                    $msg_element = $elem.closest('.gallery-file');
                $elem.addClass('voice-message-rendering').html($(templates.audio_file_waveform({waveform_id: unique_id})));
                let aud = this.createAudio(file_url, unique_id);

                aud.on('ready', () => {
                    $msg_element.find('.gallery-file-placeholder-background .mdi').removeClass('no-uploaded');
                    $msg_element.find('.gallery-file-placeholder-background').removeClass('gallery-audio-file-not-uploaded');
                    let duration = Math.round(aud.getDuration());
                    $elem.find('.voice-msg-total-time').text(utils.pretty_duration(duration));
                    aud.play();
                });

                aud.on('error', () => {
                    $elem.removeClass('voice-message-rendering');
                    element.innerHTML = not_expanded_msg;
                    aud.unAll();
                    $elem.find('.voice-message-play').get(0).remove();
                    utils.callback_popup_message(xabber.getString("jingle__error__audio_not_supported"), 3000);
                });

                aud.on('play', () => {
                    $msg_element.find('.gallery-file-placeholder-background .mdi').addClass('mdi-pause').removeClass('mdi-play');
                    $msg_element.addClass('playing');
                    let timerId = setInterval(function() {
                        let cur_time = Math.round(aud.getCurrentTime());
                        if (aud.isPlaying())
                            $elem.find('.voice-msg-current-time').text(utils.pretty_duration(cur_time));
                        else
                            clearInterval(timerId);
                    }, 100);
                });

                aud.on('finish', () => {
                    $msg_element.find('.gallery-file-placeholder-background .mdi').removeClass('mdi-pause').addClass('mdi-play');
                    $msg_element.removeClass('playing');
                });

                aud.on('pause', () => {
                    $msg_element.find('.gallery-file-placeholder-background .mdi').removeClass('mdi-pause').addClass('mdi-play');
                    $msg_element.removeClass('playing');
                });

                $elem.find('.voice-message-volume')[0].onchange = () => {
                    aud.setVolume($elem.find('.voice-message-volume').val()/100);
                };
                return aud;
            },

            createAudio: function(file_url, unique_id) {
                let audio = WaveSurfer.create({
                    container: "#" + unique_id,
                    scrollParent: false,
                    barWidth: 3,
                    height: 48,
                    barHeight: 48,
                    cursorColor: 'rgba(211,47,47,0.8)',
                    autoCenter: false,
                    normalize: true,
                    hideScrollBar: true,
                    progressColor: '#757575'
                });
                audio.load(file_url);
                audio.setVolume(0.5);
                return audio;
            },
        });

        xabber.MediaImagesView = xabber.MediaBaseView.extend({
            events: {
                "click .gallery-files.images .gallery-file": "onClickFile",
            },
            status: 'image',

            _render: function () {
                if (this.$el.length && this.$el.closest("body").length == 0)
                    this.$el = this.parent.$('.participants-details-media-wrap')
                this.$el.html($(templates.preloader()));
                this.active = true;
                this.parent.children.video && (this.parent.children.video.active = false);
                this.parent.children.files && (this.parent.children.files.active = false);
                this.parent.children.voice && (this.parent.children.voice.active = false);
                this.all_messages_loaded = false;
                this.filter_type = 'filter_image';
                this.temporary_items = [];
                this.messagesFileRequest({[this.filter_type]: true}, () => {
                    this.temporary_items = this.temporary_items.filter(item => utils.pretty_file_type(item.media_type) === 'image')
                    this.$el.html("<div class='gallery-files images grid'></div>");
                    this.updateMedia();
                    this.participant && this.updateForParticipant();
                });
            },

            filterEncryptedFiles: function () {
                return this.temporary_items.filter(item => utils.pretty_file_type(item.media_type) === 'image');
            },

            updateEncryptedMedia: function (is_loaded) {
                !this.$('.gallery-files.images.grid').length && this.$el.html("<div class='gallery-files images grid'></div>");
                this.updateMedia();
            },

            loadMoreFiles: function () {
                $(templates.preloader()).appendTo(this.$('.gallery-files'))
                this.messagesFileRequest({[this.filter_type]: true, before: this.last_rsm_message}, () => {
                    this.temporary_items = this.temporary_items.filter(item => utils.pretty_file_type(item.media_type) === 'image')
                    this.updateMedia(true);
                });
            },

        });

        xabber.MediaVideosView = xabber.MediaBaseView.extend({
            events: {
                "click .gallery-files.videos .gallery-file": "onClickFile",
            },
            status: 'video',

            _render: function () {
                if (this.$el.length && this.$el.closest("body").length == 0)
                    this.$el = this.parent.$('.participants-details-media-wrap')
                this.$el.html($(templates.preloader()));
                this.active = true;
                this.parent.children.image && (this.parent.children.image.active = false);
                this.parent.children.files && (this.parent.children.files.active = false);
                this.parent.children.voice && (this.parent.children.voice.active = false);
                this.all_messages_loaded = false;
                this.filter_type = 'filter_video';
                this.temporary_items = [];
                this.messagesFileRequest({[this.filter_type]: true}, () => {
                    this.temporary_items = this.temporary_items.filter(item => utils.pretty_file_type(item.media_type) === 'video')
                    this.$el.html("<div class='gallery-files videos grid'></div>");
                    this.updateMedia();
                    this.participant && this.updateForParticipant();
                });
            },

            filterEncryptedFiles: function () {
                return this.temporary_items.filter(item => utils.pretty_file_type(item.media_type) === 'video');
            },

            updateEncryptedMedia: function (is_loaded) {
                !this.$('.gallery-files.videos.grid').length && this.$el.html("<div class='gallery-files videos grid'></div>");
                this.updateMedia();
            },

            loadMoreFiles: function () {
                $(templates.preloader()).appendTo(this.$('.gallery-files'))
                this.messagesFileRequest({[this.filter_type]: true, before: this.last_rsm_message}, () => {
                    this.temporary_items = this.temporary_items.filter(item => utils.pretty_file_type(item.media_type) === 'video')
                    this.updateMedia(true);
                });
            },
        });

        xabber.MediaFilesView = xabber.MediaBaseView.extend({
            events: {
                "click .gallery-files.files .gallery-file": "onClickFile",
            },
            status: 'files',

            _render: function () {
                if (this.$el.length && this.$el.closest("body").length == 0)
                    this.$el = this.parent.$('.participants-details-media-wrap')
                this.$el.html($(templates.preloader()));
                this.active = true;
                this.parent.children.image && (this.parent.children.image.active = false);
                this.parent.children.video && (this.parent.children.video.active = false);
                this.parent.children.voice && (this.parent.children.voice.active = false);
                this.all_messages_loaded = false;
                this.filter_type = 'filter_files';
                this.temporary_items = [];
                this.messagesFileRequest({[this.filter_type]: true}, () => {
                    this.temporary_items = this.temporary_items.filter(item => (utils.pretty_file_type(item.media_type) != 'video' && utils.pretty_file_type(item.media_type) != 'image'))
                    this.$el.html("<div class='gallery-files files'></div>");
                    this.updateMedia();
                    this.participant && this.updateForParticipant();
                });
            },

            filterEncryptedFiles: function () {
                return this.temporary_items.filter(item => (utils.pretty_file_type(item.media_type) != 'video' && utils.pretty_file_type(item.media_type) != 'image'));
            },

            updateEncryptedMedia: function (is_loaded) {
                !this.$('.gallery-files.files').length && this.$el.html("<div class='gallery-files files'></div>");
                this.updateMedia();
            },

            loadMoreFiles: function () {
                $(templates.preloader()).appendTo(this.$('.gallery-files'))
                this.messagesFileRequest({[this.filter_type]: true, before: this.last_rsm_message}, () => {
                    this.temporary_items = this.temporary_items.filter(item => (utils.pretty_file_type(item.media_type) != 'video' && utils.pretty_file_type(item.media_type) != 'image'))
                    this.updateMedia(true);
                });
            },
        });

        xabber.MediaVoiceView = xabber.MediaBaseView.extend({
            events: {
                "click .gallery-files.voice .gallery-file": "onClickFile",
            },
            status: 'files',

            _render: function () {
                if (this.$el.length && this.$el.closest("body").length == 0)
                    this.$el = this.parent.$('.participants-details-media-wrap')
                this.$el.html($(templates.preloader()));
                this.active = true;
                this.parent.children.image && (this.parent.children.image.active = false);
                this.parent.children.video && (this.parent.children.video.active = false);
                this.parent.children.files && (this.parent.children.files.active = false);
                this.all_messages_loaded = false;
                this.filter_type = 'filter_voice'
                this.temporary_items = [];
                this.messagesFileRequest({[this.filter_type]: true}, () => {
                    this.temporary_items = this.temporary_items.filter(item => item.voice)
                    this.$el.html("<div class='gallery-files voice'></div>");
                    this.updateMedia();
                    this.participant && this.updateForParticipant();
                });
            },

            filterEncryptedFiles: function () {
                return this.temporary_items.filter(item => item.voice);
            },

            updateEncryptedMedia: function (is_loaded) {
                !this.$('.gallery-files.voice').length && this.$el.html("<div class='gallery-files voice'></div>");
                this.updateMedia();
            },

            loadMoreFiles: function () {
                $(templates.preloader()).appendTo(this.$('.gallery-files'))
                this.messagesFileRequest({[this.filter_type]: true, before: this.last_rsm_message}, () => {
                    this.temporary_items = this.temporary_items.filter(item => item.voice)
                    this.updateMedia(true);
                });
            },
        });

        xabber.BlockedView = xabber.BasicView.extend({
            status: 'blocked',
            member_avatar_size: constants.AVATAR_SIZES.GROUPCHAT_MEMBER_ITEM,

            _initialize: function (options) {
                this.contact = options.model;
                this.account = this.contact.account;
                this.$error = $('<p class="errors"/>');
            },

            _render: function () {
                if (this.$el.length && this.$el.closest("body").length == 0)
                    this.$el = this.parent.$('.participants-edit-wrap')
                this.$el.html($(templates.preloader()));
                this.updateBlockedParticipants();
            },

            updateBlockedParticipants: function () {
                this.parent.$('.block-name-panel:not(.second-text)').html(xabber.getString("group_settings__block_list__header"))
                this.contact.getBlockedParticipants((response) => {
                    this.$el.html("");
                    $(response).find('query').children().each((idx, item) => {
                        let jid = $(item).attr('jid') ? $(item).attr('jid') : $(item).text(),
                            user = {jid: jid, status: this.status},
                            $item_view = $(templates.group_chats.invited_member_item(user)),
                            avatar = Images.getDefaultAvatar(user.jid);
                        this.$el.append($item_view);
                        $item_view.find('.circle-avatar').setAvatar(avatar, this.member_avatar_size);
                    });
                    if (!$(response).find('query').children.length)
                        this.$el.append(this.$error.text(xabber.getString("groupchat_blocklist_empty")));
                    if (this.parent.contact_edit_view)
                        this.parent.contact_edit_view.showBlockButton();
                }, (err) => {

                    this.$el.html(this.$error.text($(err).find('text').text() || xabber.getString("groupchat_you_have_no_permissions_to_do_it")));
                });
            },

            unblockUser: function (ev) {
                let $member_item = $(ev.target).closest('.blocked-user'),
                    member_jid = $member_item.data('jid'),
                    tag = member_jid.toString().includes('@') ? 'jid' : 'domain',
                    iq = $iq({type: 'set', to: this.contact.get('full_jid') || this.contact.get('jid')})
                        .c('unblock', {xmlns: `${Strophe.NS.GROUP_CHAT}#block`})
                        .c(tag).t(member_jid);
                this.account.sendFast(iq, () => {
                    $member_item.remove();
                    if (this.parent.contact_edit_view)
                        this.parent.contact_edit_view.updateRemoveParticipantButton();
                    !this.$el.children().length && this.$el.html(this.$error.text(xabber.getString("groupchat_blocklist_empty")));
                });
            },

            unblockUserByElement: function ($member_item) {
                let member_jid = $member_item.data('jid'),
                    tag = member_jid.toString().includes('@') ? 'jid' : 'domain',
                    iq = $iq({type: 'set', to: this.contact.get('full_jid') || this.contact.get('jid')})
                        .c('unblock', {xmlns: `${Strophe.NS.GROUP_CHAT}#block`})
                        .c(tag).t(member_jid);
                this.account.sendFast(iq, () => {
                    $member_item.remove();
                    !this.$el.children().length && this.$el.html(this.$error.text(xabber.getString("groupchat_blocklist_empty")));
                });
            },

            blockId: function () {
                utils.dialogs.ask_enter_value(xabber.getString("contact_bar_block"), xabber.getString("groupchat_dialog_block__text"), {input_placeholder_value: xabber.getString("groupchat_dialog_block__input_placeholder")}, { ok_button_text: xabber.getString("contact_bar_block")}).done((result) => {
                    if (result) {
                        let tag = result.includes('@') ? 'jid' : 'domain',
                            iq = $iq({type: 'set', to: this.contact.get('full_jid') || this.contact.get('jid')})
                                .c('block', {xmlns: `${Strophe.NS.GROUP_CHAT}#block`})
                                .c(tag).t(result);
                        this.account.sendIQFast(iq, () => {
                            this.updateBlockedParticipants()
                        }, function (err) {
                            utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                        });
                    }
                });
            },
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
                this.participants.on("participants_updated", this.onParticipantsUpdated, this);
                this.model.on("change:status_updated", this.updateParticipantsList, this);
                this.$(this.ps_selector).perfectScrollbar(this.ps_settings);
            },

            _render: function () {
                this.$el.html(this.template()).addClass('request-waiting');
                this.participant_properties_panel = new xabber.ParticipantPropertiesView({model: this.model});
                this.updateParticipants();
                this.$('.members-list-wrap').perfectScrollbar({theme: 'item-list'});
                if (!this.model.all_rights)
                    this.model.getAllRights();
                return this;
            },

            updateParticipants: function () {
                this.model.participants.participantsRequest({version: this.participants.version }, (response) => {
                    let $response = $(response),
                        version = $response.find('query').attr('version');
                    if (this.model.get('group_info')) {
                        (this.participants.version === 0) && (this.model.get('group_info').members_num = this.participants.length);
                        if (this.participants.length != this.model.get('group_info').members_num) {
                            this.account.groupchat_settings.resetParticipantsList(this.model.get('jid'));
                            this.participants.resetParticipants();
                            this.updateParticipants();
                            return;
                        }
                    }
                    if (this.participants.version > version)
                        return;
                    version && this.account.groupchat_settings.setParticipantsListVersion(this.model.get('jid'), version);
                    (this.participants.version < version) && this.participants.updateVersion();
                    this.renderParticipants();
                }, () => {
                    this.$el.removeClass('request-waiting');
                });
            },

            updateParticipantsList: function () {
                this.$el.find('.members-list-wrap tbody').html('');
                this.updateParticipants();
                if (!this.model.all_rights)
                    this.model.getAllRights();
            },

            onParticipantsUpdated: function () {
                this.isVisible() && this.renderParticipants();
            },

            renderParticipants: function () {
                this.participants.each((participant) => {
                    this.renderMemberItem(participant);
                });
                this.$el.removeClass('request-waiting');
            },

            blockParticipant: function (ev) {
                let $target = $(ev.target).closest('.participant-wrap');
                utils.dialogs.ask(xabber.getString("groupchat__dialog_block_member__header"), xabber.getString("groupchat__dialog_block_member__confirm", [$target.find('.participant-info .nickname').text()]),
                    null, { ok_button_text: xabber.getString("groupchat_block")}).done((result) => {
                    if (result) {
                        let participant = this.participants.get($target.attr('data-id'));
                        if (participant)
                            participant.block(() => {
                                    $target.remove();
                                    this.parent.updateScrollBar();
                                }, (error) => {
                                    if ($(error).find('not-allowed').length)
                                        utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                                });
                    }
                });
            },

            kickParticipant: function (ev) {
                let $target = $(ev.target).closest('.participant-wrap');
                utils.dialogs.ask(xabber.getString("groupchat_kick_member"), xabber.getString("groupchat_do_you_really_want_to_kick_membername", [$target.find('.participant-info .nickname').text()]),
                    null, { ok_button_text: xabber.getString("groupchat_kick")}).done((result) => {
                    if (result) {
                        let participant = this.participants.get($target.attr('data-id'));
                        if (participant)
                            participant.kick(() => {
                                    $target.remove();
                                    this.parent.updateScrollBar();
                                }, (error) => {
                                    if ($(error).find('not-allowed').length)
                                        utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                                });
                    }
                });
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
                let image = Images.getDefaultAvatar(member.nickname || member.jid || member.id),
                    $avatar = (member.id) ? this.$('tr[data-id="'+ member.id +'"] .circle-avatar') : this.$('.list-item[data-jid="'+ member.jid +'"] .circle-avatar');
                $avatar.setAvatar(image, this.member_avatar_size);
                if (member.avatar) {
                    let cached_avatar = this.account.chat_settings.getB64Avatar(member.id);
                    if (this.account.chat_settings.getHashAvatar(member.id) == member.avatar && cached_avatar)
                        $avatar.setAvatar(cached_avatar, this.member_avatar_size);
                    else {
                        if (member.avatar_url){
                            this.account.chat_settings.updateCachedAvatars(member.id, member.avatar, member.avatar_url);
                            this.$('.list-item[data-id="'+ member.id +'"] .circle-avatar').setAvatar(member.avatar_url, this.member_avatar_size);
                            if (this.account.get('jid') === member.jid) {
                                this.model.my_info.set({avatar: member.avatar, 'b64_avatar': member.avatar_url});
                                this.model.trigger('update_my_info');
                            }
                        }
                        else {
                            let node = `${Strophe.NS.PUBSUB_AVATAR_DATA}#${member.id}`;
                            this.model.getAvatar(member.avatar, node, (avatar) => {
                                this.account.chat_settings.updateCachedAvatars(member.id, member.avatar, avatar);
                                this.$('.list-item[data-id="'+ member.id +'"] .circle-avatar').setAvatar(avatar, this.member_avatar_size);
                                if (this.account.get('jid') === member.jid) {
                                    this.model.my_info.set('b64_avatar', avatar);
                                    this.model.trigger('update_my_info');
                                }
                            });
                        }
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
                this.model.participants.participantsRequest({id: participant_id}, (response) => {
                    let data_form = this.account.parseDataForm($(response).find(`x[xmlns="${Strophe.NS.DATAFORM}"]`));
                    this.participant_properties_panel.open(participant, data_form);
                });
            },

            keyUpSearch: function (ev) {
                if (ev.keyCode === constants.KEY_ESCAPE && !xabber.body.screen.get('right_contact'))
                    this.clearSearch(ev);
                else
                    this.searchParticipant();
            },

            searchParticipant: function () {
                let query = this.$('.participants-search-form input').val().toLowerCase();
                this.$('.members-list-wrap .participant-wrap').each((idx, item) => {
                    let $this = $(item),
                        participant_id = $this.data('id'),
                        participant = this.model.participants.find(participant => participant.get('id') === participant_id),
                        jid = participant.get('jid').toLowerCase(),
                        name = participant.get('nickname').toLowerCase();
                    $this.hideIf(name.indexOf(query) < 0 && jid.indexOf(query) < 0);
                });
                if (query)
                    this.$('.close-search-icon').show();
                else
                    this.$('.close-search-icon').hide();
            },

            clearSearch: function (ev) {
                ev && ev.preventDefault();
                this.$('.search-input').val('');
                this.searchParticipant();
            }
        });

        xabber.ParticipantsViewRight = xabber.BasicView.extend({
            className: 'overflow-visible',
            ps_settings: {theme: 'item-list'},
            template: templates.group_chats.participants_right_panel,
            member_avatar_size: constants.AVATAR_SIZES.GROUPCHAT_MEMBER_ITEM,

            events: {
                "click .participant-wrap": "showParticipantProperties",
                "keyup .participants-search-form" : "keyUpSearch",
                "click .close-search-icon": "clearSearch",
                "click .btn-kick": "kickParticipantDialog",
                "click .btn-edit-member": "showParticipantPropertiesEdit",
                "click .btn-mute": "kickParticipantDialog",
            },

            _initialize: function () {
                this.account = this.model.account;
                this.participants = this.model.participants;
                this.participants.on("change", this.onParticipantsChanged, this);
                this.participants.on("participants_updated", this.onParticipantsUpdated, this);
                this.model.on("change:status_updated", this.updateParticipantsList, this);
                this.participant_properties_panel = this.addChild('participant_properties_panel', xabber.ParticipantPropertiesViewRight, {model: this.model, el: this.parent.$('.participant-view-wrap')[0], parent: this.parent});
            },

            _render: function () {
                this.$el.html(this.template()).addClass('request-waiting');
                this.updateParticipants();
                if (!this.model.all_rights)
                    this.model.getAllRights();
                return this;
            },

            updateParticipants: function () {
                this.model.participants.participantsRequest({version: this.participants.version }, (response) => {
                    let $response = $(response),
                        version = $response.find('query').attr('version');
                    if (this.model.get('group_info')) {
                        (this.participants.version === 0) && (this.model.get('group_info').members_num = this.participants.length);
                        if (this.participants.length != this.model.get('group_info').members_num) {
                            this.account.groupchat_settings.resetParticipantsList(this.model.get('jid'));
                            this.participants.resetParticipants();
                            this.updateParticipants();
                            return;
                        }
                    }
                    if (this.participants.version > version)
                        return;
                    version && this.account.groupchat_settings.setParticipantsListVersion(this.model.get('jid'), version);
                    (this.participants.version < version) && this.participants.updateVersion();
                    this.renderParticipants();
                }, () => {
                    this.$el.removeClass('request-waiting');
                });
            },

            updateParticipantsList: function () {
                this.updateParticipants();
                if (!this.model.all_rights)
                    this.model.getAllRights();
            },

            onParticipantsUpdated: function () {
                this.isVisible() && this.renderParticipants();
            },

            onParticipantsChanged: function () {
                this.updateParticipants();
            },

            renderParticipants: function () {
                this.participants.each((participant) => {
                    this.renderMemberItem(participant);
                });
                if (this.$('.participants-search-form input').val())
                    this.searchParticipant();
                this.$el.removeClass('request-waiting');
            },

            blockParticipant: function (ev) {
                let $target = $(ev.target).closest('.participant-wrap');
                utils.dialogs.ask(xabber.getString("groupchat__dialog_block_member__header"), xabber.getString("groupchat__dialog_block_member__confirm", [$target.find('.participant-info .nickname').text()]),
                    null, { ok_button_text: xabber.getString("groupchat_block")}).done((result) => {
                    if (result) {
                        let participant = this.participants.get($target.attr('data-id'));
                        if (participant)
                            participant.block(() => {
                                    $target.remove();
                                    this.parent.updateScrollBar();
                                }, (error) => {
                                    if ($(error).find('not-allowed').length)

                                        utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                                });
                    }
                });
            },

            kickParticipant: function (ev) {
                let $target = $(ev.target).closest('.participant-wrap');
                utils.dialogs.ask(xabber.getString("groupchat_kick_member"), xabber.getString("groupchat_do_you_really_want_to_kick_membername", [$target.find('.participant-info .nickname').text()]),
                    null, { ok_button_text: xabber.getString("groupchat_kick")}).done((result) => {
                    if (result) {
                        let participant = this.participants.get($target.attr('data-id'));
                        if (participant)
                            participant.kick(() => {
                                    $target.remove();
                                    this.parent.updateScrollBar();
                                }, (error) => {

                                    if ($(error).find('not-allowed').length)
                                        utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                                });
                    }
                });
            },

            kickParticipantDialog: function (ev) {
                let $target = $(ev.target).closest('.participant-wrap');
                utils.dialogs.ask_extended(xabber.getString("groupchat_kick_member"), xabber.getString("groupchat_do_you_really_want_to_kick_membername", [$target.find('.participant-info .nickname').text()]), null, { ok_button_text: xabber.getString("groupchat_kick"), optional_button: 'block', optional_button_text: xabber.getString("groupchat_block")}).done((result) => {
                    if (result) {
                        if (result === 'block'){
                            let participant = this.participants.get($target.attr('data-id'));
                            if (participant)
                                participant.block(() => {
                                    $target.remove();
                                    this.parent.updateScrollBar();
                                }, (error) => {
                                    if ($(error).find('not-allowed').length)

                                        utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                                });
                        }
                        else{
                            let participant = this.participants.get($target.attr('data-id'));
                            participant.kick(() => {
                                $target.remove();
                                this.parent.updateScrollBar();
                            }, (error) => {

                                if ($(error).find('not-allowed').length)
                                    utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                            });
                        }
                    }
                });
            },

            renderMemberItem: function (participant) {
                let attrs = _.clone(participant.attributes);
                attrs.nickname = _.escape(attrs.nickname);
                attrs.badge = _.escape(attrs.badge);
                attrs.is_me = attrs.jid == this.account.get('jid');
                attrs.pretty_present = attrs.present ? (moment(attrs.present).isValid() ? moment(attrs.present).fromNow() : moment(attrs.present.substr(0, attrs.present.length - 1)).fromNow()) : "";
                let $item_view = $(templates.group_chats.group_member_item_right(attrs)),
                    view = this.$('tr[data-id="' + attrs.id + '"]');
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
                let image = Images.getDefaultAvatar(member.nickname || member.jid || member.id),
                    $avatar = (member.id) ? this.$('tr[data-id="'+ member.id +'"] .circle-avatar') : this.$('.list-item[data-jid="'+ member.jid +'"] .circle-avatar');
                $avatar.setAvatar(image, this.member_avatar_size);
                if (member.avatar) {
                    let cached_avatar = this.account.chat_settings.getB64Avatar(member.id);
                    if (this.account.chat_settings.getHashAvatar(member.id) == member.avatar && cached_avatar)
                        $avatar.setAvatar(cached_avatar, this.member_avatar_size);
                    else {
                        if (member.avatar_url){
                            this.account.chat_settings.updateCachedAvatars(member.id, member.avatar, member.avatar_url);
                            this.$('.list-item[data-id="'+ member.id +'"] .circle-avatar').setAvatar(member.avatar_url, this.member_avatar_size);
                            if (this.account.get('jid') === member.jid) {
                                this.model.my_info.set({avatar: member.avatar, 'b64_avatar': member.avatar_url});
                                this.model.trigger('update_my_info');
                            }
                        }
                        else {
                            let node = `${Strophe.NS.PUBSUB_AVATAR_DATA}#${member.id}`;
                            this.model.getAvatar(member.avatar, node, (avatar) => {
                                this.account.chat_settings.updateCachedAvatars(member.id, member.avatar, avatar);
                                this.$('.list-item[data-id="'+ member.id +'"] .circle-avatar').setAvatar(avatar, this.member_avatar_size);
                                if (this.account.get('jid') === member.jid) {
                                    this.model.my_info.set('b64_avatar', avatar);
                                    this.model.trigger('update_my_info');
                                }
                            });
                        }
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
                this.model.participants.participantsRequest({id: participant_id}, (response) => {
                    let data_form = this.account.parseDataForm($(response).find(`x[xmlns="${Strophe.NS.DATAFORM}"]`));
                    this.participant_properties_panel.open(participant, data_form);
                });
            },

            showParticipantPropertiesEdit: function (ev) {
                let $target = $(ev.target),
                    participant_item = $target.closest('.participant-wrap'),
                    participant_id = participant_item.attr('data-id'),
                    participant = this.model.participants.get(participant_id);
                (participant_item.attr('data-jid') && participant_item.attr('data-jid') === this.account.get('jid')) && (participant_id = '');
                this.model.participants.participantsRequest({id: participant_id}, (response) => {
                    let data_form = this.account.parseDataForm($(response).find(`x[xmlns="${Strophe.NS.DATAFORM}"]`));
                    this.participant_properties_panel.open(participant, data_form);
                    this.participant_properties_panel.showNamePanel();
                    this.participant_properties_panel.changeBackButton();
                });
            },

            keyUpSearch: function (ev) {
                if (ev.keyCode === constants.KEY_ESCAPE && !xabber.body.screen.get('right_contact'))
                    this.clearSearch(ev);
                else
                    this.searchParticipant();
            },

            searchParticipant: function () {
                let query = this.$('.participants-search-form input').val().toLowerCase();
                this.$('.members-list-wrap .participant-wrap').each((idx, item) => {
                    let $this = $(item),
                        participant_id = $this.data('id'),
                        participant = this.model.participants.find(participant => participant.get('id') === participant_id),
                        jid = participant.get('jid').toLowerCase(),
                        name = participant.get('nickname').toLowerCase();
                    $this.hideIf(name.indexOf(query) < 0 && jid.indexOf(query) < 0);
                });
                if (query)
                    this.$('.close-search-icon').show();
                else
                    this.$('.close-search-icon').hide();
            },

            clearSearch: function (ev) {
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
                this.contact = this.model;
                this.account = this.model.account;
            },

            open: function (participant, data_form) {
                if (!participant) return;
                this.participant = participant;
                this.participant.on("change:badge", this.onBadgeUpdated, this);
                this.data_form = data_form;
                this.render();
                this.$el.openModal({
                    ready: () => {
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
                    },
                    complete: () => {
                        this.render();
                        this.$el.detach();
                        this.data.set('visible', false);
                    }
                });
            },

            close: function () {
                this.$el.closeModal({
                    complete: () => {
                        this.render();
                        this.$el.detach();
                        this.data.set('visible', false);
                    }
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
                attrs.is_blocked_contact = this.account.blocklist.isBlocked(attrs.jid);
                attrs.incognito_chat = (this.contact.get('group_info') && this.contact.get('group_info').privacy === 'incognito') ? true : false;
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
                this.$('.participant-info #edit-nickname').on("focusout", () => {
                    let new_nickname = this.$('#edit-nickname').getTextFromRichTextarea().trim();
                    if (new_nickname === "")
                        new_nickname = this.participant.get('nickname');
                    this.$('.participant-info #edit-nickname').hide();
                    this.$('.participant-info .nickname').show();
                    this.updateNickname(new_nickname);
                });
                this.$('.content').perfectScrollbar({theme: 'item-list'});
            },

            updateMemberAvatar: function (member) {
                let participant_id = member.get('id'),
                    $avatar = this.$(`.participant-details-item[data-id="${participant_id}"] .circle-avatar`);
                member.image = Images.getDefaultAvatar(member.get('nickname') || member.get('jid') || participant_id);
                $avatar.setAvatar(member.image, this.member_details_avatar_size);
                this.$('.participant-details-item[data-id="'+ member.id +'"]').emojify('.badge', {emoji_size: 18});
                if (member.get('avatar')) {
                    if (this.account.chat_settings.getHashAvatar(participant_id) == member.get('avatar') && (this.account.chat_settings.getB64Avatar(participant_id)))
                        $avatar.setAvatar(this.account.chat_settings.getB64Avatar(participant_id), this.member_details_avatar_size);
                    else {
                        if (member.get('avatar_url')){
                            $avatar.setAvatar(member.get('avatar_url'), this.member_details_avatar_size);
                        }
                        else {
                            let node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + participant_id;
                            this.contact.getAvatar(member.get('avatar'), node, (avatar) => {
                                this.$(`.circle-avatar`).setAvatar(avatar, this.member_details_avatar_size);
                            });
                        }
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

            getMessages: function (options) {
                let chat = this.account.chats.getChat(this.contact);
                chat.messages_view = new xabber.ParticipantMessagesView({ model: chat, contact: this.contact, participant: this.participant.attributes });
                chat.messages_view.messagesRequest(options, () => {
                    this.close();
                    xabber.body.setScreen('all-chats', {right: 'participant_messages', model: chat});
                });
            },

            changeAvatar: function (ev) {
                let field = ev.target;
                if (!field.files.length)
                    return;
                let file = field.files[0];
                field.value = '';
                if (file.size > constants.MAX_AVATAR_FILE_SIZE) {
                    utils.dialogs.error(xabber.getString("group_settings__error__avatar_too_large"));
                    return;
                } else if (!file.type.startsWith('image')) {
                    utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                    return;
                }

                utils.images.getAvatarFromFile(file).done((image) => {
                    if (image) {
                        file.base64 = image;
                        this.new_avatar = file;
                        this.$('.circle-avatar').addClass('changed').setAvatar(image, this.member_details_avatar_size);
                        this.updateSaveButton();
                    }
                });
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
                    $property_value.addClass('default-value').text(xabber.getString("dialog_rights__button_set_timer"));
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
                if (ev && ev.keyCode === constants.KEY_ENTER) {
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
                utils.dialogs.ask(xabber.getString("dialog_delete_user_messages__header"), xabber.getString("dialog_delete_user_messages__header", [this.participant.get('nickname') || this.participant.get('jid') || this.participant.get('id')]), null, { ok_button_text: xabber.getString("delete")}).done((result) => {
                    if (result) {
                        if (this.participant.get('id')) {
                            let group_chat = this.account.chats.getChat(this.contact);
                            group_chat.retractMessagesByUser(this.participant.get('id'));
                        }
                    }
                });
            },

            block: function () {
                utils.dialogs.ask(xabber.getString("groupchat__dialog_block_member__header"), xabber.getString("groupchat__dialog_block_member__confirm", [this.participant.get('nickname')]),
                    null, { ok_button_text: xabber.getString("groupchat_block")}).done((result) => {
                    if (result) {
                        this.participant.block(() => {this.close();},
                            function (error) {
                                if ($(error).find('not-allowed').length)
                                    utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                            });
                    }
                });
            },

            kick: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active'))
                    return;
                utils.dialogs.ask(xabber.getString("groupchat_kick_member"), xabber.getString("groupchat_do_you_really_want_to_kick_membername", [this.participant.get('nickname')]),
                    null, { ok_button_text: xabber.getString("groupchat_kick")}).done((result) => {
                    if (result) {
                        this.participant.kick(() => {
                                this.close();
                            }, (error) => {
                                if ($(error).find('not-allowed').length)
                                    utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                            });
                    }
                });
            },

            setActualRights: function () {
                this.$('.rights-wrap').html("");
                this.data_form.fields && this.data_form.fields.forEach((field) => {
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
                });
            },

            getPrivateChat: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active'))
                    return;
                let participant_jid = this.participant.get('jid'),
                    participant_in_roster = this.account.contacts.get(participant_jid);
                if (!participant_jid || this.contact.get('incognito_chat')) {
                    let iq = $iq({to: this.contact.domain, type: 'set'})
                        .c('query', {xmlns: `${Strophe.NS.GROUP_CHAT}#create`})
                        .c('peer-to-peer', { jid: this.contact.get('jid'),  id: this.participant.get('id')});
                    this.account.sendIQFast(iq, (iq_response) => {
                        let group_jid = $(iq_response).find('query localpart').text() + '@' + this.contact.domain,
                            contact = this.account.contacts.mergeContact(group_jid);
                        contact.set('group_chat', true);
                        contact.set('subscription_preapproved', true);
                        contact.pres('subscribed');
                        contact.pushInRoster(null, () => {
                            contact.pres('subscribe');
                            contact.getMyInfo();
                            this.close();
                            contact.sendPresent();
                            this.account.chats.openChat(contact);
                            let chat = this.account.chats.getChat(contact);
                            chat.messages.createSystemMessage({
                                from_jid: group_jid,
                                message: xabber.getString("groupchat__private_chat__text_message_init", [this.participant.get('nickname'), this.contact.get('jid')])
                            });
                        });
                    }, (error) => {
                        let $error = $(error),
                            private_chat_jid = $error.find(`x[xmlns="${Strophe.NS.GROUP_CHAT}"] jid`).text();
                        if (private_chat_jid) {
                            let contact = this.account.contacts.mergeContact(private_chat_jid),
                                chat = this.account.chats.getChat(contact);
                            this.close();
                            chat && chat.trigger('open');
                            return;
                        }
                        let err_text = $(error).find('text[lang="en"]').text() || $(error).find('text').first().text() || xabber.getString("groupchat_you_have_no_permissions_to_do_it");
                        this.close();
                        utils.dialogs.error(err_text);
                    });
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
                            $right_item.find('.timer-item-wrap .property-value').addClass('default-value').text(xabber.getString("dialog_rights__button_set_timer")).attr('data-value', "");
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
                    iq_changes = $iq({from: jid, type: 'set', to: this.contact.get('full_jid') || this.contact.get('jid')})
                        .c('query', {xmlns: Strophe.NS.GROUP_CHAT + "#members"})
                        .c('user', {xmlns: Strophe.NS.GROUP_CHAT, id: member_id});
                this.$('.buttons-wrap .btn-save-user-rights').addClass('non-active');
                changed_avatar && $participant_avatar.find('.preloader-wrap').addClass('visible').find('.preloader-wrapper').addClass('active');
                if (nickname_value != this.participant.get('nickname')) {
                    has_changes = true;
                    iq_changes.c('nickname').t(nickname_value).up();
                }
                this.$('.right-item').each((idx, right_item) => {
                    if ($(right_item).hasClass('changed')) {
                        let $right_item = $(right_item),
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
                });
                if (changed_avatar)
                    this.contact.pubAvatar(changed_avatar, ('#' + member_id), () => {
                        this.$('.buttons-wrap button').removeClass('non-active');
                        $participant_avatar.find('.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');
                        this.$(`.participant-details-item[data-id="${member_id}"] .circle-avatar`).setAvatar(changed_avatar.base64, this.member_details_avatar_size);
                        this.close();
                    }, function (error) {
                        this.$('.buttons-wrap button').removeClass('non-active');
                        $participant_avatar.find('.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');

                        let error_text = $(error).find('text').text() || xabber.getString("groupchat_you_have_no_permissions_to_do_it");
                        !has_changes && utils.dialogs.error(error_text);
                    });
                if (has_changes)
                    this.account.sendIQFast(iq_changes,
                        () => {
                            this.$('.buttons-wrap button').removeClass('non-active');
                            this.participant.set('nickname', nickname_value);
                            this.close();
                        },
                        (error) => {
                            this.$('.buttons-wrap button').removeClass('non-active');
                            this.close();

                            if ($(error).find('not-allowed').length)
                                utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                        });
                if (rights_changed) {
                    let iq_rights_changes = $iq({from: jid, type: 'set', to: this.contact.get('full_jid') || this.contact.get('jid')})
                        .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#rights'});
                    iq_rights_changes = this.account.addDataFormToStanza(iq_rights_changes, this.data_form);
                    this.account.sendIQFast(iq_rights_changes, () => {
                            this.close();
                        },
                        (error) => {
                            this.close();
                            if ($(error).find('not-allowed').length)
                                utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                        });
                }
                $btn.blur();
            }
        });

        xabber.ParticipantPropertiesViewRight = xabber.BasicView.extend({
            className: 'modal dialog-modal edit-rights',
            template: templates.group_chats.participant_details_right,
            member_details_avatar_size: constants.AVATAR_SIZES.PARTICIPANT_DETAILS_ITEM,

            events: {
                "click .btn-back:not(.btn-top)": "close",
                "click .btn-back.btn-top": "scrollToTopSmooth",
                'click .btn-edit-participant': 'showNamePanel',
                'click .btn-back-name': 'hidePanel',
                "change .clickable-field input": "changeRights",
                "click .btn-reset": "render",
                "click .btn-reset-name": "resetPanel",
                "click .btn-save-user-rights": "saveRights",
                "change .circle-avatar input": "changeAvatar",
                "click .btn-kick-participant": "kickParticipantDialog",
                "click .btn-set-visibility-wrap": "setVisibility",
                "click .info-hover": "onClickIcon",
                "click .btn-set-badge": "editBadge",
                "click .btn-participant-messages": "getMessages",
                "click .btn-chat-participant": "getPrivateChat",
                "click .property-variant": "changeTimerValue",
                "click .set-groupchat-avatar-text": "clickAvatarInput",
                "keydown .rich-textarea": "checkKeydown",
                "keyup .rich-textarea": "checkKeyup",
                "click .list-variant": "changeList"
            },

            _initialize: function () {
                this.contact = this.model;
                this.account = this.model.account;
            },

            open: function (participant, data_form) {
                this.model.set('participant_hidden', false);
                this.parent.scrollToTop();
                if (this.parent.ps_container.length) {
                    this.parent.ps_container.perfectScrollbar('destroy')
                }
                this.$('.participant-details-wrap').hideIf(this.model.get('participant_hidden'))
                if (!participant) return;
                this.participant = participant;
                this.participant.on("change:badge", this.onBadgeUpdated, this);
                this.data_form = data_form;
                this.render();
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
            },

            close: function () {
                this.model.set('participant_hidden', true);
                if (this.parent.ps_container.length) {
                    this.parent.ps_container.perfectScrollbar(
                        _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                    );
                    this.parent.onScroll();
                };
                if (this.ps_container && this.ps_container.length) {
                    this.ps_container.perfectScrollbar('destroy')
                }
                this.$('.participant-details-wrap').hideIf(this.model.get('participant_hidden'));
            },

            render: function () {
                this.$el.html(this.template(_.extend({view: this}, constants)));
                this.new_avatar = "";
                let attrs = _.clone(this.participant.attributes);
                attrs.nickname = _.escape(attrs.nickname);
                attrs.blocked = attrs.blocked;
                attrs.pretty_present = attrs.present ? (moment(attrs.present).isValid() ? moment(attrs.present).fromNow() : moment(attrs.present.substr(0, attrs.present.length - 1)).fromNow()) : "";
                attrs.subscription = attrs.subscription === null ? null : 'both';
                attrs.badge = _.escape(attrs.badge);
                attrs.is_myself = attrs.jid === this.account.get('jid');
                attrs.is_blocked_contact = this.account.blocklist.isBlocked(attrs.jid);
                attrs.incognito_chat = (this.contact.get('group_info') && this.contact.get('group_info').privacy === 'incognito') ? true : false;
                let $member_info_view;
                if (this.contact.get('private_chat')) {
                    this.$el.addClass('edit-rights-private');
                    $member_info_view = $(templates.group_chats.private_participant_details_item_right(attrs));
                }
                else
                    $member_info_view = $(templates.group_chats.participant_details_item_right(attrs));
                this.$('.participant-details-info-wrap').html($member_info_view);
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
                this.$('.participant-info #edit-nickname').on("focusout", () => {
                    let new_nickname = this.$('#edit-nickname').getTextFromRichTextarea().trim();
                    if (new_nickname === "")
                        new_nickname = this.participant.get('nickname');
                    this.$('.participant-info #edit-nickname').hide();
                    this.$('.participant-info .nickname').show();
                    this.updateNickname(new_nickname);
                });
                this.ps_container = this.$('.participant-details-wrap');
                if (this.ps_container.length) {
                    this.ps_container.perfectScrollbar(
                        _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                    );
                }
                this.ps_container.on("ps-scroll-up ps-scroll-down", this.onScroll.bind(this));
                this.onScroll();
                this.participant_name_field = new xabber.ParticipantNameRightWidget({
                    el: this.$('.edit-participant-name-wrap')[0],
                    model: this.participant,
                    parent: this,
                });
                this.participant_badge_field = new xabber.ParticipantBadgeRightWidget({
                    el: this.$('.edit-participant-badge-wrap')[0],
                    model: this.participant,
                    parent: this,
                });
                this.updateList('image');
                xabber.once("update_css", this.updateIndicator, this);
                this.updateIndicator()
                this.$('.participant-details-edit-wrap').hideIf(true);
                this.$('.block-name:not(.second-text)').hideIf(true);
            },

            updateIndicator: function () {
                this.$('.tabs .indicator').remove();
                this.$('.tabs').tabs();
                this.$('.indicator').addClass('ground-color-500');
            },

            showNamePanel: function () {
                this.$('.participant-details-edit-wrap').hideIf(false)
                this.$('.btn-edit-participant').hideIf(true)
                this.$('.parent-btn').hideIf(true)
                this.$('.child-btn').hideIf(false)
                this.$('.block-header').css({'background-color': 'rgba(255,255,255,0)'});
                this.$('.block-name.second-text').text('');
                this.$('.block-name:not(.second-text)').text(xabber.getString("groupchat_member_edit"));
                this.$('.block-name:not(.second-text)').hideIf(false);
                if (this.ps_container && this.ps_container.length) {
                    this.ps_container.perfectScrollbar('destroy')
                }
                this.ps_container = this.$('.participant-details-edit-wrap');
                if (this.ps_container.length) {
                    this.ps_container.perfectScrollbar(
                        _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                    );
                }
            },

            changeBackButton: function () {
                this.$('.parent-btn').hideIf(false)
                this.$('.child-btn').hideIf(true)
            },

            hidePanel: function () {
                this.$('.participant-details-edit-wrap').hideIf(true)
                this.$('.btn-edit-participant').hideIf(false)
                this.$('.parent-btn').hideIf(false)
                this.$('.child-btn').hideIf(true)
                this.$('.block-name:not(.second-text)').hideIf(true);
                this.ps_container = this.$('.participant-details-wrap');
                if (this.ps_container.length) {
                    this.ps_container.perfectScrollbar(
                        _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                    );
                }
                if (this.ps_container && this.ps_container.length) {
                    this.ps_container.perfectScrollbar(
                        _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                    );
                }
                this.onScroll();
            },

            resetPanel: function () {
                this.participant_name_field.updateValue(true);
                this.participant_badge_field.updateValue(true);
                this.new_avatar = "";
                this.updateMemberAvatar(this.participant);
                this.updateSaveButton()
            },

            changeList: function (ev) {
                let $target = $(ev.target).closest('.list-variant'),
                    list_name = $target.data('value');
                this.$('.tabs').animate({scrollLeft: $target.position().left}, 400);
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
                    case 'image':
                        constructor_func = xabber.MediaImagesView;
                        break;
                    case 'video':
                        constructor_func = xabber.MediaVideosView;
                        break;
                    case 'files':
                        constructor_func = xabber.MediaFilesView;
                        break;
                    case 'voice':
                        constructor_func = xabber.MediaVoiceView;
                        break;
                };
                if (constructor_func)
                    return this.addChild(name, constructor_func, {model: this.model, participant: true, el: this.$('.participants-details-media-wrap')[0]});
                else
                    return;
            },

            changeName: function (value) {
                this.updateSaveButton()
            },

            changeBadge: function (value) {
                this.updateSaveButton()
            },

            onClickIcon: function (ev) {
                let $target_info = $(ev.target),
                    $target_value = $target_info.find('.value'), copied_text = "";
                $target_value.each((idx, item) => {
                    let $item = $(item),
                        value_text = $item.text();
                    value_text && (copied_text != "") && (copied_text += '\n');
                    value_text && (copied_text += value_text);
                    copied_text && utils.copyTextToClipboard(copied_text, xabber.getString("toast__copied_in_clipboard"), xabber.getString("toast__not_copied_in_clipboard"));
                });
            },

            scrollToTopSmooth: function () {
                this.ps_container.animate(
                    {scrollTop: 0},
                    400,
                    () => {
                        this.onScroll();
                    });
            },

            onScroll: function () {
                if(this.ps_container[0].scrollTop >= 220) {
                    this.$('.block-header').css({'background-color': 'rgba(255,255,255,1)'});
                    this.$('.block-name.second-text').text(this.participant.get('nickname'));
                    this.$('.block-name.second-text').removeClass('fade-out');
                    this.$('.block-name:not(.second-text)').addClass('fade-out');
                }
                else if(this.ps_container[0].scrollTop >= 170) {
                    this.$('.block-header').css({'background-color': 'rgba(255,255,255,1)'});
                    this.$('.block-name.second-text').addClass('fade-out');
                    this.$('.block-name:not(.second-text)').removeClass('fade-out');
                }
                else if(this.ps_container[0].scrollTop >= 1) {
                    this.$('.block-header').css({'background-color': 'rgba(255,255,255,0.5)'});
                    this.$('.block-name.second-text').addClass('fade-out');
                    this.$('.block-name:not(.second-text)').removeClass('fade-out');
                }
                else {
                    this.$('.block-header').css({'background-color': 'rgba(255,255,255,0)'});
                    this.$('.block-name.second-text').text('');
                    this.$('.block-name.second-text').addClass('fade-out');
                    this.$('.block-name:not(.second-text)').removeClass('fade-out');
                }
                let bottom_block_scroll
                if (this.$('.bottom-block'))
                    bottom_block_scroll = this.$('.bottom-block').get(0).getBoundingClientRect().top;
                if (bottom_block_scroll && bottom_block_scroll < 150) {
                    this.$('.bottom-block .tabs').addClass('fixed-scroll');
                    this.$('.btn-back').addClass('btn-top');
                    this.$('.btn-back i').addClass('mdi-arrow-right').removeClass('mdi-close');
                    this.$('.bottom-block .participants-search-form').addClass('fixed-scroll');
                    this.$('.buttons-wrap').hideIf(true);
                    this.$('.btn-edit').hideIf(true);
                    this.$('.btn-qr-code').hideIf(true);
                    this.$('.header-buttons .block-name:not(.second-text)').addClass('fade-out');
                    this.$('.header-buttons .block-name.second-text').removeClass('fade-out');
                    this.$('.header-buttons .block-name.second-text').text(this.$('.tabs:not(.participant-tabs) .list-variant .active').text())
                }
                else {
                    this.$('.btn-back').removeClass('btn-top');
                    this.$('.btn-back i').addClass('mdi-close').removeClass('mdi-arrow-right');
                    this.$('.bottom-block .tabs').removeClass('fixed-scroll');
                    this.$('.bottom-block .participants-search-form').removeClass('fixed-scroll');
                    this.$('.buttons-wrap').hideIf(false);
                    this.$('.btn-edit').hideIf(false);
                    this.$('.btn-qr-code').hideIf(false);
                }
            },

            clickAvatarInput: function (ev) {
                this.$('.circle-avatar input').click();
            },

            updateMemberAvatar: function (member) {
                let participant_id = member.get('id'),
                    $avatar = this.$(`.circle-avatar`);
                member.image = Images.getDefaultAvatar(member.get('nickname') || member.get('jid') || participant_id);
                $avatar.setAvatar(member.image, this.member_details_avatar_size);
                $avatar.removeClass('changed');
                if (member.get('avatar')) {
                    if (this.account.chat_settings.getHashAvatar(participant_id) == member.get('avatar') && (this.account.chat_settings.getB64Avatar(participant_id)))
                        $avatar.setAvatar(this.account.chat_settings.getB64Avatar(participant_id), this.member_details_avatar_size);
                    else {
                        if (member.get('avatar_url')){
                            $avatar.setAvatar(member.get('avatar_url'), this.member_details_avatar_size);
                        }
                        else {
                            let node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + participant_id;
                            this.contact.getAvatar(member.get('avatar'), node, (avatar) => {
                                this.$(`.circle-avatar`).setAvatar(avatar, this.member_details_avatar_size);
                            });
                        }
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

            getMessages: function (options) {
                let chat = this.account.chats.getChat(this.contact);
                chat.messages_view = new xabber.ParticipantMessagesView({ model: chat, contact: this.contact, participant: this.participant.attributes });
                chat.messages_view.messagesRequest(options, () => {
                    xabber.body.setScreen('all-chats', {right: 'participant_messages', model: chat});
                    this.open(this.participant, this.data_form);
                });
            },

            changeAvatar: function (ev) {
                let field = ev.target;
                if (!field.files.length)
                    return;
                let file = field.files[0];
                field.value = '';
                if (file.size > constants.MAX_AVATAR_FILE_SIZE) {
                    utils.dialogs.error(xabber.getString("group_settings__error__avatar_too_large"));
                    return;
                } else if (!file.type.startsWith('image')) {
                    utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                    return;
                }

                utils.images.getAvatarFromFile(file).done((image) => {
                    if (image) {
                        file.base64 = image;
                        this.new_avatar = file;
                        this.$('.participant-details-edit-wrap .circle-avatar').addClass('changed');
                        this.$('.circle-avatar').setAvatar(image, this.member_details_avatar_size);
                        this.updateSaveButton();
                    }
                });
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
                    $property_value.addClass('default-value').text(xabber.getString("dialog_rights__button_set_timer"));
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
                this.$('.participant-info').emojify('.participant-edit-badge');
            },

            updateButtons: function (has_changes) {
                this.$('.btn-save-user-rights').switchClass('non-active', !has_changes);
                this.$('.btn-save-user-rights').switchClass('fade-out', !has_changes);
                this.$('.btn-edit-participant').switchClass('fade-out', has_changes);
                if (has_changes) {
                    this.$('.block-name.second-text').html(xabber.getString("edit_vcard"))
                    this.$('.block-header .details-icon').removeClass('mdi-arrow-right').addClass('mdi-close')
                    this.$('.block-header .details-icon.parent-btn').removeClass('btn-back').addClass('btn-reset')
                    this.$('.block-header .details-icon.child-btn').removeClass('btn-back-name').addClass('btn-reset-name')
                    this.$('.block-header .block-name:not(.second-text)').addClass('fade-out');
                    this.$('.block-header .block-name.second-text').removeClass('fade-out');
                }
                else{
                    this.$('.block-header .details-icon').addClass('mdi-arrow-right').removeClass('mdi-close')
                    this.$('.block-header .details-icon.parent-btn').addClass('btn-back').removeClass('btn-reset')
                    this.$('.block-header .details-icon.child-btn').addClass('btn-back-name').removeClass('btn-reset-name')
                    this.$('.block-header .block-name:not(.second-text)').removeClass('fade-out');
                    this.$('.block-header .block-name.second-text').addClass('fade-out');
                }
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
                if (ev && ev.keyCode === constants.KEY_ENTER) {
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
                utils.dialogs.ask(xabber.getString("dialog_delete_user_messages__header"), xabber.getString("dialog_delete_user_messages__header", [this.participant.get('nickname') || this.participant.get('jid') || this.participant.get('id')]), null, { ok_button_text: xabber.getString("delete")}).done((result) => {
                    if (result) {
                        if (this.participant.get('id')) {
                            let group_chat = this.account.chats.getChat(this.contact);
                            group_chat.retractMessagesByUser(this.participant.get('id'));
                        }
                    }
                });
            },

            block: function () {
                utils.dialogs.ask(xabber.getString("groupchat__dialog_block_member__header"), xabber.getString("groupchat__dialog_block_member__confirm", [this.participant.get('nickname')]),
                    null, { ok_button_text: xabber.getString("groupchat_block")}).done((result) => {
                    if (result) {
                        this.participant.block(() => {this.close();},
                            function (error) {

                                if ($(error).find('not-allowed').length)
                                    utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                            });
                    }
                });
            },

            kick: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active'))
                    return;
                utils.dialogs.ask(xabber.getString("groupchat_kick_member"), xabber.getString("groupchat_do_you_really_want_to_kick_membername", [this.participant.get('nickname')]),
                    null, { ok_button_text: xabber.getString("groupchat_kick")}).done((result) => {
                    if (result) {
                        this.participant.kick(() => {
                                this.close();
                            }, (error) => {

                                if ($(error).find('not-allowed').length)
                                    utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                            });
                    }
                });
            },

            kickParticipantDialog: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active'))
                    return;
                utils.dialogs.ask_extended(xabber.getString("groupchat_kick_member"), xabber.getString("groupchat_do_you_really_want_to_kick_membername", [this.participant.get('nickname')]), null, { ok_button_text: xabber.getString("groupchat_kick"), optional_button: 'block', optional_button_text: xabber.getString("groupchat_block")}).done((result) => {
                    if (result) {
                        if (result === 'block'){
                            this.participant.block(() => {
                                this.close();
                                },
                                function (error) {

                                    if ($(error).find('not-allowed').length)
                                        utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                                });
                        }
                        else{
                            this.participant.kick(() => {
                                this.close();
                            }, (error) => {

                                if ($(error).find('not-allowed').length)
                                    utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                            });
                        }
                    }
                });
            },

            setVisibility: function (ev) {
                    utils.dialogs.error('Feature not yet implemented')
            },

            setActualRights: function () {
                this.$('.rights-wrap').html("");
                this.data_form.fields && this.data_form.fields.forEach((field) => {
                    field = _.clone(field);
                    if (field.type  === 'list-single' || field.type  === 'fixed' && (!field.values || field.values[0] == 0 || field.values && field.label)) {
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
                                if ($current_restriction.find('.select-timer .property-value').length)
                                    $current_restriction.find('.select-timer .property-value').attr('data-value', attrs.expires)
                                        .removeClass('default-value')
                                        .text(moment(Number(attrs.expires)*1000).fromNow());
                                else{
                                    $current_restriction.append($('<div class="select-timer"/>'));
                                    $current_restriction.find('.select-timer').attr('data-value', attrs.expires)
                                        .text(moment(Number(attrs.expires)*1000).fromNow())
                                }
                            }
                        }
                    } else if (field.type  === 'fixed')
                        field.values && this.$('.rights-wrap').append($('<div class="rights-header"/>').text(field.values[0]));
                });
            },

            getPrivateChat: function (ev) {
                if ($(ev.target).closest('.button-wrap').hasClass('non-active'))
                    return;
                let participant_jid = this.participant.get('jid'),
                    participant_in_roster = this.account.contacts.get(participant_jid);
                if (!participant_jid || this.contact.get('incognito_chat')) {
                    let iq = $iq({to: this.contact.domain, type: 'set'})
                        .c('query', {xmlns: `${Strophe.NS.GROUP_CHAT}#create`})
                        .c('peer-to-peer', { jid: this.contact.get('jid'),  id: this.participant.get('id')});
                    this.account.sendIQFast(iq, (iq_response) => {
                        let group_jid = $(iq_response).find('query localpart').text() + '@' + this.contact.domain,
                            contact = this.account.contacts.mergeContact(group_jid);
                        contact.set('group_chat', true);
                        contact.set('subscription_preapproved', true);
                        contact.pres('subscribed');
                        contact.pushInRoster(null, () => {
                            contact.pres('subscribe');
                            contact.getMyInfo();
                            this.close();
                            contact.sendPresent();
                            this.account.chats.openChat(contact);
                            let chat = this.account.chats.getChat(contact);
                            chat.messages.createSystemMessage({
                                from_jid: group_jid,
                                message: xabber.getString("groupchat__private_chat__text_message_init", [this.participant.get('nickname'), this.contact.get('jid')])
                            });
                        });
                    }, (error) => {
                        let $error = $(error),
                            private_chat_jid = $error.find(`x[xmlns="${Strophe.NS.GROUP_CHAT}"] jid`).text();
                        if (private_chat_jid) {
                            let contact = this.account.contacts.mergeContact(private_chat_jid),
                                chat = this.account.chats.getChat(contact);
                            this.close();
                            chat && chat.trigger('open');
                            return;
                        }
                        let err_text = $(error).find('text[lang="en"]').text() || $(error).find('text').first().text() || xabber.getString("groupchat_you_have_no_permissions_to_do_it");
                        this.close();
                        utils.dialogs.error(err_text);
                    });
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
                    if (this.actual_rights && !this.actual_rights.find(right => right.name === right_name))
                        $right_item.addClass('changed');
                    else
                        if ($right_item.hasClass('changed-timer'))
                            $right_item.addClass('changed');
                        else
                            $right_item.removeClass('changed');
                }
                else {
                    if (this.actual_rights && this.actual_rights.find(right => right.name === right_name))
                        $right_item.addClass('changed');
                    else {
                        $right_item.removeClass('changed');
                        if ($right_item.hasClass('changed-timer'))
                            $right_item.find('.timer-item-wrap .property-value').addClass('default-value').text(xabber.getString("dialog_rights__button_set_timer")).attr('data-value', "");
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
                    nickname_value = this.$('.participant-name-input').val(),
                    new_badge = this.$('.participant-badge-input').val(),
                    changed_avatar = this.new_avatar,
                    rights_changed = false,
                    has_changes = false,
                    iq_changes = $iq({from: jid, type: 'set', to: this.contact.get('full_jid') || this.contact.get('jid')})
                        .c('query', {xmlns: Strophe.NS.GROUP_CHAT + "#members"})
                        .c('user', {xmlns: Strophe.NS.GROUP_CHAT, id: member_id});
                this.$('.buttons-wrap .btn-save-user-rights').addClass('non-active');
                changed_avatar && $participant_avatar.find('.preloader-wrap').addClass('visible').find('.preloader-wrapper').addClass('active');
                if (nickname_value != this.participant.get('nickname')) {
                    has_changes = true;
                    iq_changes.c('nickname').t(nickname_value).up();
                }
                if (Array.from(new_badge).length > 32)
                    utils.dialogs.error(xabber.getString("groupchat__set_badge__error_length"));
                else {
                    if (new_badge != this.participant.get('badge')) {
                        has_changes = true;
                        iq_changes.c('badge').t(new_badge).up();
                    }
                }
                this.$('.right-item').each((idx, right_item) => {
                    if ($(right_item).hasClass('changed')) {
                        let $right_item = $(right_item),
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
                });
                if (changed_avatar)
                    this.contact.pubAvatar(changed_avatar, ('#' + member_id), () => {
                        $participant_avatar.find('.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');
                        // this.$(`.participant-details-item[data-id="${member_id}"] .circle-avatar`).setAvatar(changed_avatar.base64, this.member_details_avatar_size);
                        this.$(`.circle-avatar`).setAvatar(changed_avatar.base64, this.member_details_avatar_size);
                        this.close();
                    }, function (error) {
                        $participant_avatar.find('.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');

                        let error_text = $(error).find('text').text() || xabber.getString("groupchat_you_have_no_permissions_to_do_it");
                        !has_changes && utils.dialogs.error(error_text);
                        this.close();
                    });
                if (has_changes)
                    this.account.sendIQFast(iq_changes,
                        () => {
                            this.$('.buttons-wrap button').removeClass('non-active');
                            this.participant.set('nickname', nickname_value);
                            this.close();
                        },
                        (error) => {
                            this.$('.buttons-wrap button').removeClass('non-active');
                            this.close();
                            if ($(error).find('not-allowed').length)
                                utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                        });
                if (rights_changed) {
                    let iq_rights_changes = $iq({from: jid, type: 'set', to: this.contact.get('full_jid') || this.contact.get('jid')})
                        .c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#rights'});
                    iq_rights_changes = this.account.addDataFormToStanza(iq_rights_changes, this.data_form);
                    this.account.sendIQFast(iq_rights_changes, () => {
                            this.close();
                        },
                        (error) => {
                            this.close();
                            if ($(error).find('not-allowed').length)
                                utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                        });
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
                    ready: () => {
                        if (this.participant.get('badge'))
                            this.typeEmoticon(this.participant.get('badge'));
                        else
                            this.$('.badge-text').focus();
                    },
                    complete: () => {
                        this.$el.detach();
                        this.data.set('visible', false);
                    }
                });
                let $insert_emoticon = this.$('.insert-emoticon'),
                    $emoji_panel_wrap = this.$('.emoticons-panel-wrap'),
                    $emoji_panel = this.$('.emoticons-panel'),
                    _timeout;

                for (let emoji_list in Emoji.all) {
                    let $emoji_list_wrap = $(`<div class="emoji-list-wrap"/>`),
                        list_name = emoji_list.replace(/ /g, '_');
                    $(`<div id=${list_name} class="emoji-list-header">${xabber.getString(constants.EMOJI_LIST_NAME(emoji_list))}</div>`).appendTo($emoji_list_wrap);
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
                this.$('.emoji-menu .emoji').click((ev) => {
                    $emoji_panel[0].scrollTop = this.$('.emoji-list-wrap ' + ev.target.attributes.href.value)[0].offsetTop - 4;
                });
                $insert_emoticon.hover((ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    $emoji_panel_wrap.addClass('opened');
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }
                    $emoji_panel.perfectScrollbar('update');
                }, (ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }
                    _timeout = setTimeout(function () {
                        if (!$emoji_panel_wrap.is(':hover')) {
                            $emoji_panel_wrap.removeClass('opened');
                        }
                    }, 800);
                });
                $emoji_panel_wrap.hover(null, (ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }
                    _timeout = setTimeout(function () {
                        $emoji_panel_wrap.removeClass('opened');
                    }, 200);
                });
                $emoji_panel_wrap.mousedown((ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    if (ev.button)
                        return;
                    let $target = $(ev.target).closest('.emoji-wrap').find('.emoji');
                    $target.length && this.typeEmoticon($target.data('emoji'));
                });
            },

            close: function () {
                this.$el.closeModal({ complete: () => {
                        this.$el.detach();
                        this.data.set('visible', false);
                }});
            },

            saveNewBadge: function () {
                let new_badge = this.$('.badge-text').getTextFromRichTextarea();
                if (Array.from(new_badge).length > 32)
                    this.$('.modal-content .error').text(xabber.getString("groupchat__set_badge__error_length"));
                else {
                    if (new_badge != this.participant.get('badge')) {
                        let iq_changes = $iq({from: this.account.get('jid'), type: 'set', to: this.contact.get('full_jid') || this.contact.get('jid')})
                            .c('query', {xmlns: `${Strophe.NS.GROUP_CHAT}#members`})
                            .c('user', {xmlns: Strophe.NS.GROUP_CHAT, id: this.participant.get('id')})
                            .c('badge').t(new_badge);
                        this.account.sendIQFast(iq_changes, () => {
                            this.model.updateBadge(new_badge);
                            this.close();
                        }, () => {
                            this.$('.modal-content .error').text(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
                        })
                    }
                }
            },

            typeEmoticon: function (emoji) {
                let emoji_node = emoji.emojify({tag_name: 'span'}),
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
                this.update(() => {
                    this.$el.openModal({
                        ready: () => {
                            this.$('.select-timer .dropdown-button').dropdown({
                                inDuration: 100,
                                outDuration: 100,
                                constrainWidth: false,
                                hover: false,
                                alignment: 'left'
                            });
                            this.updateScrollBar();
                        },
                        complete: () => {
                            this.$el.detach();
                            this.data.set('visible', false);
                        }
                    });
                });
            },

            close: function () {
                this.$el.closeModal({
                    complete: () => {
                        this.hide.bind(this);
                    }
                });
            },

            update: function (callback) {
                this.$('.btn-default-restrictions-save').addClass('non-active');
                this.default_restrictions = [];
                this.actual_default_restrictions = [];
                this.$('button').blur();
                let iq_get_rights = $iq({from: this.account.get('jid'), type: 'get', to: this.contact.get('full_jid') || this.contact.get('jid')})
                    .c('query', {xmlns: `${Strophe.NS.GROUP_CHAT}#default-rights`});
                this.account.sendFast(iq_get_rights, (iq_all_rights) => {
                    this.showDefaultRestrictions(iq_all_rights);
                    callback && callback();
                }, () => {
                    utils.callback_popup_message(xabber.getString("groupchat_you_have_no_permissions_to_do_it"), 3000);
                });
            },

            updateSaveButton: function () {
                let has_changes = false;
                this.$('.default-restrictions-list-wrap .right-item').each((idx, item) => {
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
                });
                this.$('.btn-default-restrictions-save').switchClass('non-active', !has_changes);
            },

            changeRestriction: function (ev) {
                let $target = $(ev.target);
                if (!$target.prop('checked')) {
                    $target.closest('.right-item').find('.select-timer .property-value').attr('data-value', "").addClass('default-value')
                        .text(xabber.getString("dialog_rights__button_set_timer"));
                }
            },

            keyUpInput: function (ev) {
                if (ev && ev.keyCode === constants.KEY_ENTER)
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
                    $property_value.text(xabber.getString("dialog_rights__button_set_timer"));
                } else if ($property_value.hasClass('default-value'))
                    $property_value.removeClass('default-value');
                if (!$input_item.prop('checked'))
                    $input_item.prop('checked', true);
                this.updateSaveButton();
            },

            showDefaultRestrictions: function (iq_all_rights) {
                let data_form = this.account.parseDataForm($(iq_all_rights).find(`x[xmlns="${Strophe.NS.DATAFORM}"]`));
                data_form && (this.default_restrictions = _.clone(data_form));
                data_form.fields.forEach((field) => {
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
                                .text(field.options.find(x => x.value === attrs.expires).label);
                        }
                    }
                });
            },

            saveChanges: function () {
                if (this.$('.btn-default-restrictions-save').hasClass('non-active'))
                    return;
                this.$('button').blur();
                let iq_change_default_rights = $iq({from: this.account.get('jid'), to: this.contact.get('full_jid') || this.contact.get('jid'), type: 'set'})
                        .c('query', {xmlns: `${Strophe.NS.GROUP_CHAT}#default-rights`}),
                    has_new_default_restrictions = false,
                    data_form = _.clone(this.default_restrictions);
                this.$('.default-restrictions-list-wrap .right-item').each((idx, item) => {
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
                });

                if (has_new_default_restrictions) {
                    this.account.addDataFormToStanza(iq_change_default_rights, data_form);
                    this.account.sendIQFast(iq_change_default_rights, () => {
                        this.close();
                    }, (error) => {
                        let err_text = $(error).find('error text').text() || xabber.getString("groupchat_you_have_no_permissions_to_do_it");
                        utils.dialogs.error(err_text);
                        this.close();
                    });
                }
            },

            changeExpiresTime: function (ev) {
                let expire_time_item = $(ev.target),
                    new_expire_time = expire_time_item.val(),
                    $restriction_item = expire_time_item.prev();
                if (expire_time_item.val() == '0')
                    $restriction_item .find('.restriction-description').text(xabber.getString("groupchat__rights_timer__indefinitely"));
                else
                    $restriction_item .find('.restriction-description').text(xabber.getString("groupchat__rights_timer__text_expire", [Number(new_expire_time)]));
                $restriction_item .find('input').removeClass().addClass(new_expire_time);
                expire_time_item.remove();
            }
        });

        xabber.DefaultRestrictionsRightView = xabber.BasicView.extend({
            className: 'modal dialog-modal edit-default-restrictions',
            template: templates.group_chats.default_restrictions_right,
            events: {
                "click .btn-default-restrictions-save": "saveChanges",
                "click .btn-default-restrictions-cancel": "hideRestrictions",
                "click .btn-back": "hideRestrictions",
                "click .btn-reset": "showRestrictions",
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
                this.model.set('restrictions_hidden', true)
            },

            render: function () {
                this.$el.html(this.template(_.extend({view: this}, constants)));
                this.$('.restrictions-wrap').hideIf(this.model.get('restrictions_hidden'))
            },

            showRestrictions: function (ev) {
                this.model.set('restrictions_hidden', false);
                this.update(() => {
                    this.$('.select-timer .dropdown-button').dropdown({
                        inDuration: 100,
                        outDuration: 100,
                        constrainWidth: false,
                        hover: false,
                        alignment: 'left'
                    });
                    this.$('.restrictions-wrap').hideIf(this.model.get('restrictions_hidden'))
                    this.updateSaveButton()
                });
            },

            hideRestrictions: function (ev) {
                this.parent.hideRestrictions();
            },

            open: function () {
                this.update(() => {
                    this.$el.openModal({
                        ready: () => {
                            this.$('.select-timer .dropdown-button').dropdown({
                                inDuration: 100,
                                outDuration: 100,
                                constrainWidth: false,
                                hover: false,
                                alignment: 'left'
                            });
                            this.updateScrollBar();
                        },
                        complete: () => {
                            this.$el.detach();
                            this.data.set('visible', false);
                        }
                    });
                });
            },

            update: function (callback) {
                this.$('.btn-default-restrictions-save').addClass('fade-out');
                this.default_restrictions = [];
                this.actual_default_restrictions = [];
                this.$('button').blur();
                let iq_get_rights = $iq({from: this.account.get('jid'), type: 'get', to: this.contact.get('full_jid') || this.contact.get('jid')})
                    .c('query', {xmlns: `${Strophe.NS.GROUP_CHAT}#default-rights`});
                this.account.sendFast(iq_get_rights, (iq_all_rights) => {
                    this.showDefaultRestrictions(iq_all_rights);
                    callback && callback();
                }, () => {

                    utils.callback_popup_message(xabber.getString("groupchat_you_have_no_permissions_to_do_it"), 3000);
                });
            },

            updateSaveButton: function () {
                let has_changes = false;
                this.$('.default-restrictions-list-wrap .right-item').each((idx, item) => {
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
                });
                this.$('.btn-default-restrictions-save').switchClass('fade-out', !has_changes);
                if (has_changes) {
                    this.$('.block-name.second-text').html(xabber.getString("edit_vcard"))
                    this.$('.restrictions-header .details-icon').removeClass('mdi-arrow-right').addClass('mdi-close')
                    this.$('.restrictions-header .details-icon').removeClass('btn-back').addClass('btn-reset')
                    this.$('.restrictions-header .block-name:not(.second-text)').addClass('fade-out');
                    this.$('.restrictions-header .block-name.second-text').removeClass('fade-out');
                }
                else{
                    this.$('.restrictions-header .details-icon').addClass('mdi-arrow-right').removeClass('mdi-close')
                    this.$('.restrictions-header .details-icon').addClass('btn-back').removeClass('btn-reset')
                    this.$('.restrictions-header .block-name:not(.second-text)').removeClass('fade-out');
                    this.$('.restrictions-header .block-name.second-text').addClass('fade-out');
                }
            },

            changeRestriction: function (ev) {
                let $target = $(ev.target);
                if (!$target.prop('checked')) {
                    $target.closest('.right-item').find('.select-timer .property-value').attr('data-value', "").addClass('default-value')
                        .text(xabber.getString("dialog_rights__button_set_timer"));
                }
            },

            keyUpInput: function (ev) {
                if (ev && ev.keyCode === constants.KEY_ENTER)
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
                    $property_value.text(xabber.getString("dialog_rights__button_set_timer"));
                } else if ($property_value.hasClass('default-value'))
                    $property_value.removeClass('default-value');
                if (!$input_item.prop('checked'))
                    $input_item.prop('checked', true);
                this.updateSaveButton();
            },

            showDefaultRestrictions: function (iq_all_rights) {
                let data_form = this.account.parseDataForm($(iq_all_rights).find(`x[xmlns="${Strophe.NS.DATAFORM}"]`));
                data_form && (this.default_restrictions = _.clone(data_form));
                data_form.fields.forEach((field) => {
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
                                .text(field.options.find(x => x.value === attrs.expires).label);
                        }
                    }
                });
            },

            saveChanges: function () {
                if (this.$('.btn-default-restrictions-save').hasClass('fade-out'))
                    return;
                this.$('.btn-default-restrictions-save').addClass('fade-out')
                this.$('.edit-save-preloader.preloader-wrap').addClass('visible').find('.preloader-wrapper').addClass('active');
                this.$('button').blur();
                let iq_change_default_rights = $iq({from: this.account.get('jid'), to: this.contact.get('full_jid') || this.contact.get('jid'), type: 'set'})
                        .c('query', {xmlns: `${Strophe.NS.GROUP_CHAT}#default-rights`}),
                    has_new_default_restrictions = false,
                    data_form = _.clone(this.default_restrictions);
                this.$('.default-restrictions-list-wrap .right-item').each((idx, item) => {
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
                });

                if (has_new_default_restrictions) {
                    this.account.addDataFormToStanza(iq_change_default_rights, data_form);
                    this.account.sendIQFast(iq_change_default_rights, () => {
                        this.$('.edit-save-preloader.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');
                        this.hideRestrictions();
                    }, (error) => {

                        let err_text = $(error).find('error text').text() || xabber.getString("groupchat_you_have_no_permissions_to_do_it");
                        utils.dialogs.error(err_text);
                        this.$('.edit-save-preloader.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');
                        this.hideRestrictions();
                    });
                }
            },

            changeExpiresTime: function (ev) {
                let expire_time_item = $(ev.target),
                    new_expire_time = expire_time_item.val(),
                    $restriction_item = expire_time_item.prev();
                if (expire_time_item.val() == '0')
                    $restriction_item .find('.restriction-description').text(xabber.getString("groupchat__rights_timer__indefinitely"));
                else
                    $restriction_item .find('.restriction-description').text(xabber.getString("groupchat__rights_timer__text_expire", [Number(new_expire_time)]));
                $restriction_item .find('input').removeClass().addClass(new_expire_time);
                expire_time_item.remove();
            }
        });

        xabber.Participant = Backbone.Model.extend({
            idAttribute: 'id',

            initialize: function (_attrs, options) {
                let attrs = _.clone(_attrs);
                this.model = options.model;
                this.contact = options.contact ? options.contact : this.model.contact;
                this.account = this.contact.account;
                this.on("change:avatar", this.getBase64Avatar, this);
                this.set(attrs);
                this.getBase64Avatar();
            },

            getBase64Avatar: function () {
                if (!this.get('id'))
                    return;
                if (this.get('avatar')) {
                    let cached_info = this.account.chat_settings.getAvatarInfoById(this.get('id'));
                    if (cached_info) {
                        if (cached_info.avatar_hash == this.get('avatar')) {
                            this.set('b64_avatar', cached_info.avatar_b64);
                            (this.get('jid') === this.account.get('jid')) && this.contact.trigger('update_my_info');
                            return;
                        }
                    }
                    if (this.get('avatar_url')){
                        this.account.chat_settings.updateCachedAvatars(this.get('id'), this.get('avatar'), this.get('avatar_url'));
                        this.set('b64_avatar', this.get('avatar_url'));
                        (this.get('jid') === this.account.get('jid')) && this.contact.trigger('update_my_info');

                    } else {
                        let node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + this.get('id');
                        this.contact.getAvatar(this.get('avatar'), node, (avatar) => {
                            this.account.chat_settings.updateCachedAvatars(this.get('id'), this.get('avatar'), avatar);
                            this.set('b64_avatar', avatar);
                            (this.get('jid') === this.account.get('jid')) && this.contact.trigger('update_my_info');
                        });

                    }
                }
            },

            kick: function (callback, errback) {
                let id = this.get('id'),
                    jid = this.get('jid'),
                    iq = $iq({type: 'set', to: this.contact.get('full_jid') || this.contact.get('jid')})
                        .c('kick', {xmlns: Strophe.NS.GROUP_CHAT});
                if (jid)
                    iq.c('jid').t(jid);
                else
                    iq.c('id').t(id);
                this.account.sendIQFast(iq, () => {
                    callback && callback();
                }, (err) => {
                    errback && errback(err);
                });
            },

            block: function (callback, errback) {
                let id = this.get('id'),
                    iq = $iq({type: 'set', to: this.contact.get('full_jid') || this.contact.get('jid')})
                        .c('block', {xmlns: `${Strophe.NS.GROUP_CHAT}#block`})
                        .c('id').t(id);
                this.account.sendIQFast(iq, () => {
                    callback && callback();
                }, function (err) {
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
                this.contact.on("update_participants", this.updateParticipants, this);
                this.on("change:nickname", this.sort, this);
            },

            updateVersion: function () {
                this.version = this.account.groupchat_settings.getParticipantsListVersion(this.contact.get('jid')) || this.version;
            },

            getCachedParticipants: function () {
                this.account.groupchat_settings.getParticipantsList(this.contact.get('jid')).forEach((participant) => {
                    this.mergeParticipant(participant);
                });
            },

            mergeParticipant: function (attrs) {
                if (typeof attrs !== "object")
                    attrs = {id: attrs};
                let participant = this.get(attrs.id);
                if (participant)
                    participant.set(attrs);
                else {
                    participant = this.create(attrs, {model: this});
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
                $(rights).each((idx, permission) => {
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
                });
                return pretty_rights;
            },

            updateParticipants: function () {
                this.participantsRequest({version: this.version}, () => {
                    this.trigger("participants_updated");
                    chat = this.account.chats.getChat(this.contact);
                    if (chat.item_view) {
                        if (!chat.item_view.content)
                            chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                        chat.item_view.content.updatePinnedMessage()
                    }
                });
            },

            participantsRequest: function (options, callback, errback) {
                options = options || {};
                let participant_id = options.id,
                    version = options.version || 0,
                    iq = $iq({to: this.contact.get('full_jid'), type: 'get'});
                if (participant_id != undefined) {
                    if (options.properties)
                        iq.c('query', {xmlns: `${Strophe.NS.GROUP_CHAT}#members`, id: participant_id});
                    else
                        iq.c('query', {xmlns: `${Strophe.NS.GROUP_CHAT}#rights`}).c('user', {xmlns: Strophe.NS.GROUP_CHAT, id: participant_id});
                }
                else
                    iq.c('query', {xmlns: `${Strophe.NS.GROUP_CHAT}#members`, version: version});
                this.account.sendFast(iq, (response) => {
                    let $response = $(response),
                        version = $response.find('query').attr('version');
                    version && (this.version = Number(version));
                    $response.find(`query user`).each((idx, item) => {
                        let $item = $(item),
                            subscription = $item.find('subscription').text(),
                            id = $item.find('id').text();
                        if (subscription === 'none') {
                            this.get(id) && this.get(id).destroy();
                            this.account.groupchat_settings.removeParticipantFromList(this.get('jid'), id);
                        }
                        else
                            this.createFromStanza($item);
                    });
                    callback && callback(response);
                }, (error) => {
                    errback && errback(error);
                });
            },

            search: function (query) {
                let list = [];
                this.models.forEach((participant) => {
                    let jid = participant.get('jid');
                    if (query) {
                        query = query.toLowerCase();
                        let nickname = participant.get('nickname');
                        if (jid && jid.toLowerCase().indexOf(query) > -1 || nickname && nickname.toLowerCase().indexOf(query) > -1)
                            list.push(participant);
                    } else
                        list.push(participant);
                });
                return list;
            },

            createFromStanza: function ($item) {
                let jid = $item.find('jid').text(),
                    nickname = $item.find('nickname').text(),
                    id = $item.attr('id'),
                    badge = $item.find('badge').text(),
                    present = $item.find('present').text(),
                    photo = $item.find(`metadata[xmlns="${Strophe.NS.PUBSUB_AVATAR_METADATA}"]`).find('info').attr('id'),
                    photo_url = $item.find(`metadata[xmlns="${Strophe.NS.PUBSUB_AVATAR_METADATA}"]`).find('info').attr('url'),
                    role = $item.find('role').text();
                !nickname.trim().length && (nickname = jid || id);

                let attrs = {
                    jid: jid,
                    id: id,
                    avatar: photo,
                    avatar_url: photo_url,
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
                if (participants_list_idx != -1)
                    all_participants_lists.splice(participants_list_idx, 1);
                all_participants_lists.push({jid: jid, participants_list: updated_participants_list, version: participants_list.version});
                this.save('participants_lists', all_participants_lists);
            },

            removeParticipantFromList: function (jid, participant_id) {
                let participants_list = this.getParticipantsList(jid);
                if (participants_list.length) {
                    let participant_idx = participants_list.indexOf(participants_list.find(participant => participant.id === participant_id));
                    if (participant_idx != -1)
                        participants_list.splice(participant_idx, 1);
                    this.setParticipantsList(jid, participants_list);
                }
            },

            resetParticipantsList: function (jid) {
                let all_participants_lists = _.clone(this.get('participants_lists')),
                    participants_list_idx = all_participants_lists.indexOf(all_participants_lists.find(list => list.jid === jid));
                if (participants_list_idx != -1)
                    all_participants_lists.splice(participants_list_idx, 1);
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
                "click .btn-join": "join",
                "click .btn-decline": "reject",
                "click .btn-block": "blockContact"
            },

            _initialize: function (options) {
                this.account = this.model.account;
                this.$('.msg-text').text(options.message && options.message.get('message') ? options.message.get('message') : xabber.getString("groupchat__public_group__text_invitation", [this.account.get('jid')]));
                this.message = options.message;
                this.model.on("change", this.update, this);
            },

            render: function () {
                this.model.set('visible', true);
                this.updateAvatar();
                this.updateName();
            },

            hide: function () {
                this.trigger('before_hide', this);
                this.data.set('visible', false);
                this.model.set('visible', false);
                this.onHide.apply(this, arguments);
            },

            update: function () {
                let changed = this.model.changed;
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
                let image = this.model.cached_image;
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

            blockInvitation: function () {
                if (this.account.connection && this.account.connection.do_synchronization)
                    return;
                let contact_jid = this.model.get('jid'),
                    iq_get_blocking = $iq({type: 'get'}).c('blocklist', {xmlns: Strophe.NS.BLOCKING}),
                    iq_unblocking = $iq({type: 'set'}).c('unblock', {xmlns: Strophe.NS.BLOCKING}),
                    iq_set_blocking = $iq({type: 'set'}).c('block', {xmlns: Strophe.NS.BLOCKING})
                    .c('item', {jid: this.model.get('jid') + '/' + moment.now()});
                this.account.sendIQFast(iq_get_blocking, (iq_blocking_items) => {
                    let items = $(iq_blocking_items).find('item');
                    if (items.length > 0) {
                        items.each(function (idx, item) {
                            let item_jid = $(item).attr('jid');
                            if (item_jid.indexOf(contact_jid) > -1)
                                iq_unblocking.c('item', {jid: item_jid}).up();
                        });
                    }
                    if ($(iq_unblocking.nodeTree).find('item').length)
                        this.account.sendIQFast(iq_unblocking, () => {
                            this.account.sendIQFast(iq_set_blocking);
                        });
                    else
                        this.account.sendIQFast(iq_set_blocking);
                });
            },

            join: function () {
                let contact = this.model;
                contact.set('subscription_preapproved', true);
                contact.acceptRequest();
                contact.pushInRoster(null, () => {
                    contact.askRequest();
                    this.blockInvitation();
                    contact.getMyInfo();
                    contact.sendPresent();
                    this.openChat();
                });
                contact.trigger('remove_invite', contact);
            },

            reject: function () {
                let contact = this.model;
                this.closeChat();
                let iq = $iq({to: contact.get('full_jid') || contact.get('jid'), type: 'set'})
                    .c('decline', {xmlns: `${Strophe.NS.GROUP_CHAT}#invite`});
                this.account.sendFast(iq, () => {}, () => {
                    contact.declineRequest();
                    this.blockInvitation();
                });
            },

            blockContact: function () {
                let contact = this.model;
                utils.dialogs.ask(xabber.getString("contact_block"), xabber.getString("block_contact_confirm", [contact.get('name'), this.account.get('jid')]), null, { ok_button_text: xabber.getString("contact_bar_block")}).done(function (result) {
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

            showInput: function () {
                if (this.$input.prop('disabled'))
                    return;
                this.data.set('input_mode', true);
                this.updateValue();
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

            keyUp: function () {
                let value = this.getValue();
                this.$input.switchClass('changed', this.$input.val() !== value);
                if (!this.$input.val())
                    this.$input.prop('placeholder', this.getDefaultName() || xabber.getString("contact_settings__hint_set_name"));
            }
        });

        xabber.ContactNameRightWidget = xabber.InputWidget.extend({
            field_name: 'contact-name',
            placeholder: "",
            model_field: 'name',
            template: templates.group_chats.group_name_input_widget,

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

            updateValue: function () {
                let value = this.getValue();
                this.$value.text(value);
                if (!this.$input.val()) {
                    this.$input.prop('placeholder', this.getDefaultName() || xabber.getString("contact_settings__hint_set_name"));
                    if (this.model.get('roster_name'))
                        this.$input.val(this.model.get('roster_name'))
                }
                if (!this.model.get('roster_name'))
                    this.$value.addClass('name-is-default');
                else
                    this.$value.removeClass('name-is-default');
            },

            keyUp: function () {
                let value = this.getValue();
                this.$input.switchClass('changed', this.$input.val() !== value);
                if (!this.$input.val())
                    this.$input.prop('placeholder', this.getDefaultName() || xabber.getString("contact_settings__hint_set_name"));
            },
        });

        xabber.GroupNameRightWidget = xabber.InputWidget.extend({
            field_name: 'group-name',
            placeholder: "",
            template: templates.group_chats.group_name_input_widget,

            initialize: function (options) {
                this.parent = options.parent
                this.$el.html(this.template({
                    field_name: this.field_name,
                    field_type: this.field_type,
                    placeholder: this.placeholder
                }));
                this.$value = this.$('.field-text');
                this.$btn = this.$('.btn-rename');
                this.$input = this.$('.field-input');
                let $insert_emoticon = this.$('.insert-emoticon'),
                    $emoji_panel_wrap = this.$('.emoticons-panel-wrap'),
                    $emoji_panel = this.$('.emoticons-panel'),
                    _timeout;

                for (let emoji_list in Emoji.all) {
                    let $emoji_list_wrap = $(`<div class="emoji-list-wrap"/>`),
                        list_name = emoji_list.replace(/ /g, '_');
                    $(`<div id=${list_name} class="emoji-list-header">${xabber.getString(constants.EMOJI_LIST_NAME(emoji_list))}</div>`).appendTo($emoji_list_wrap);
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
                this.$('.emoji-menu .emoji').click((ev) => {
                    $emoji_panel[0].scrollTop = this.$('.emoji-list-wrap ' + ev.target.attributes.href.value)[0].offsetTop - 4;
                });
                $insert_emoticon.hover((ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    $emoji_panel_wrap.addClass('opened');
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }
                    $emoji_panel.perfectScrollbar('update');
                }, (ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }
                    _timeout = setTimeout(function () {
                        if (!$emoji_panel_wrap.is(':hover')) {
                            $emoji_panel_wrap.removeClass('opened');
                        }
                    }, 800);
                });
                $emoji_panel_wrap.hover(null, (ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }
                    _timeout = setTimeout(function () {
                        $emoji_panel_wrap.removeClass('opened');
                    }, 200);
                });
                $emoji_panel_wrap.mousedown((ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    if (ev.button)
                        return;
                    let $target = $(ev.target).closest('.emoji-wrap').find('.emoji');
                    if ($target.length) {
                        this.$input.val(function () {
                            return this.value + $target.data('emoji');
                        });
                        this.$input.scrollLeft(1000)
                        this.changeValue();
                    }
                });
                this.updateValue();
                this.data = new Backbone.Model({input_mode: false});
            },

            changeValue: function () {
                this.setValue(this.$input.val());
            },

            setValue: function (value) {
                if (this.$input.val())
                    this.parent.changeName(value);
                else
                    this.parent.changeName(this.getDefaultName());
                this.updateValue();
            },

            getDefaultName: function () {
                let name = null;
                if (this.model.get('group_chat')) {
                    if (this.model.get('group_info') && this.model.get('group_info').name)
                        name = this.model.get('group_info').name;
                    else
                        name = this.model.get('jid');
                }
                return name;
            },

            updateValue: function (force_reset) {
                let value = this.getValue();
                this.$value.text(value);
                if (!this.$input.val() || force_reset) {
                    this.$input.prop('placeholder', this.getDefaultName() || xabber.getString("contact_settings__hint_set_name"));
                    if (this.model.get('group_info') && this.model.get('group_info').name)
                        this.$input.val(this.model.get('group_info').name)
                    if (force_reset)
                        this.changeValue();
                }
            },

            getValue: function () {
                if (this.model.get('group_info'))
                    return this.model.get('group_info').name;
            },

            keyUp: function () {
                let value = this.getValue();
                this.$input.switchClass('changed', this.$input.val() !== value);
                if (!this.$input.val())
                    this.$input.prop('placeholder', this.getDefaultName() || xabber.getString("contact_settings__hint_set_name"));
                else
                    this.changeValue();

            },
        });

        xabber.ParticipantNameRightWidget = xabber.InputWidget.extend({
            field_name: 'participant-name',
            placeholder: "",
            template: templates.group_chats.group_name_input_widget,

            initialize: function (options) {
                this.parent = options.parent
                this.$el.html(this.template({
                    field_name: this.field_name,
                    field_type: this.field_type,
                    placeholder: this.placeholder
                }));
                this.$value = this.$('.field-text');
                this.$btn = this.$('.btn-rename');
                this.$input = this.$('.field-input');
                let $insert_emoticon = this.$('.insert-emoticon'),
                    $emoji_panel_wrap = this.$('.emoticons-panel-wrap'),
                    $emoji_panel = this.$('.emoticons-panel'),
                    _timeout;

                for (let emoji_list in Emoji.all) {
                    let $emoji_list_wrap = $(`<div class="emoji-list-wrap"/>`),
                        list_name = emoji_list.replace(/ /g, '_');
                    $(`<div id=${list_name} class="emoji-list-header">${xabber.getString(constants.EMOJI_LIST_NAME(emoji_list))}</div>`).appendTo($emoji_list_wrap);
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
                this.$('.emoji-menu .emoji').click((ev) => {
                    $emoji_panel[0].scrollTop = this.$('.emoji-list-wrap ' + ev.target.attributes.href.value)[0].offsetTop - 4;
                });
                $insert_emoticon.hover((ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    $emoji_panel_wrap.addClass('opened');
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }
                    $emoji_panel.perfectScrollbar('update');
                }, (ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }
                    _timeout = setTimeout(function () {
                        if (!$emoji_panel_wrap.is(':hover')) {
                            $emoji_panel_wrap.removeClass('opened');
                        }
                    }, 800);
                });
                $emoji_panel_wrap.hover(null, (ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }
                    _timeout = setTimeout(function () {
                        $emoji_panel_wrap.removeClass('opened');
                    }, 200);
                });
                $emoji_panel_wrap.mousedown((ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    if (ev.button)
                        return;
                    let $target = $(ev.target).closest('.emoji-wrap').find('.emoji');
                    if ($target.length) {
                        this.$input.val(function () {
                            return this.value + $target.data('emoji');
                        });
                        this.$input.scrollLeft(1000)
                        this.changeValue();
                    }
                });
                this.updateValue();
                this.data = new Backbone.Model({input_mode: false});
            },

            changeValue: function () {
                this.setValue(this.$input.val());
            },

            setValue: function (value) {
                this.updateValue();
                if (this.$input.val())
                    this.parent.changeName(value);
                else
                    this.parent.changeName(this.getDefaultName());
            },

            getDefaultName: function () {
                let name = null;
                if (this.model.get('nickname'))
                    name = this.model.get('nickname');
                else
                    name = this.model.get('jid');
                return name;
            },

            updateValue: function (force_reset) {
                let value = this.getValue();
                this.$value.text(value);
                if (!this.$input.val() || force_reset) {
                    this.$input.prop('placeholder', this.getDefaultName() || xabber.getString("contact_settings__hint_set_name"));
                    if (this.model.get('nickname'))
                        this.$input.val(this.model.get('nickname'))
                    if (force_reset)
                        this.changeValue();
                }
                this.$input.switchClass('changed', this.$input.val() !== value);
            },

            getValue: function () {
                if (this.model.get('nickname'))
                    return this.model.get('nickname');
            },

            keyUp: function () {
                let value = this.getValue();
                if (!this.$input.val())
                    this.$input.prop('placeholder', this.getDefaultName() || xabber.getString("contact_settings__hint_set_name"));
                else
                    this.changeValue();

            },
        });

        xabber.ParticipantBadgeRightWidget = xabber.InputWidget.extend({
            field_name: 'participant-badge',
            placeholder: "",
            template: templates.group_chats.group_name_input_widget,

            initialize: function (options) {
                this.parent = options.parent
                this.$el.html(this.template({
                    field_name: this.field_name,
                    field_type: this.field_type,
                    placeholder: this.placeholder
                }));
                this.$value = this.$('.field-text');
                this.$btn = this.$('.btn-rename');
                this.$input = this.$('.field-input');
                let $insert_emoticon = this.$('.insert-emoticon'),
                    $emoji_panel_wrap = this.$('.emoticons-panel-wrap'),
                    $emoji_panel = this.$('.emoticons-panel'),
                    _timeout;

                for (let emoji_list in Emoji.all) {
                    let $emoji_list_wrap = $(`<div class="emoji-list-wrap"/>`),
                        list_name = emoji_list.replace(/ /g, '_');
                    $(`<div id=${list_name} class="emoji-list-header">${xabber.getString(constants.EMOJI_LIST_NAME(emoji_list))}</div>`).appendTo($emoji_list_wrap);
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
                this.$('.emoji-menu .emoji').click((ev) => {
                    $emoji_panel[0].scrollTop = this.$('.emoji-list-wrap ' + ev.target.attributes.href.value)[0].offsetTop - 4;
                });
                $insert_emoticon.hover((ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    $emoji_panel_wrap.addClass('opened');
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }
                    $emoji_panel.perfectScrollbar('update');
                }, (ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }
                    _timeout = setTimeout(function () {
                        if (!$emoji_panel_wrap.is(':hover')) {
                            $emoji_panel_wrap.removeClass('opened');
                        }
                    }, 800);
                });
                $emoji_panel_wrap.hover(null, (ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    if (_timeout) {
                        clearTimeout(_timeout);
                    }
                    _timeout = setTimeout(function () {
                        $emoji_panel_wrap.removeClass('opened');
                    }, 200);
                });
                $emoji_panel_wrap.mousedown((ev) => {
                    if (ev && ev.preventDefault) { ev.preventDefault(); }
                    if (ev.button)
                        return;
                    let $target = $(ev.target).closest('.emoji-wrap').find('.emoji');
                    if ($target.length) {
                        this.$input.val(function () {
                            return this.value + $target.data('emoji');
                        });
                        this.$input.scrollLeft(1000)
                        this.changeValue();
                    }
                });
                this.updateValue(true);
            },

            changeValue: function () {
                this.setValue(this.$input.val());
            },

            setValue: function (value) {
                this.updateValue();
                this.parent.changeBadge(value);
            },

            updateValue: function (force_reset) {
                let value = this.getValue();
                if (!this.$input.val())
                    this.$input.prop('placeholder', xabber.getString("groupchat_member_badge"));
                if (force_reset) {
                    this.$input.val(value);
                    this.changeValue();
                }
                this.$input.switchClass('changed', this.$input.val() !== value);
            },

            getValue: function () {
                let badge = _.escape(this.model.get('badge'));
                return badge;
            },

            keyUp: function () {
                if (!this.$input.val())
                    this.$input.prop('placeholder', xabber.getString("groupchat_member_badge"));
                this.changeValue();
            },
        });

        xabber.GroupDescriptionRightWidget = xabber.InputWidget.extend({
            field_name: 'group-description',
            template: templates.group_chats.description_input_widget,
            placeholder: "",

            initialize: function (options) {
                this.parent = options.parent
                this.$el.html(this.template({
                    field_name: this.field_name,
                    field_type: this.field_type,
                    placeholder: this.placeholder
                }));
                this.$value = this.$('.field-text');
                this.$btn = this.$('.btn-rename');
                this.$input = this.$('.field-input');
                this.updateValue();
                this.data = new Backbone.Model({input_mode: false});
            },

            changeValue: function () {
                this.setValue(this.$input.val());
            },

            setValue: function (value) {
                this.parent.changeDescription(value);
                this.updateValue();
            },

            getDefaultName: function () {
                let name = null;
                if (this.model.get('group_chat')) {
                    if (this.model.get('group_info') && this.model.get('group_info').description)
                        name = this.model.get('group_info').description;
                }
                return name;
            },

            updateValue: function (force_reset) {
                let value = this.getValue();
                if (!this.$input.val() || force_reset) {
                    this.$input.prop('placeholder', xabber.getString("groupchat_example_description"));
                    if (force_reset && this.model.get('group_info'))
                        this.$input.val(this.model.get('group_info').description)
                    if (force_reset)
                        this.changeValue();
                }
            },

            keyDown: function (ev) {
                ev.stopPropagation();
                let value = this.getValue();
                if (ev.keyCode === constants.KEY_ESCAPE && !xabber.body.screen.get('right_contact')) {
                    this.$input.removeClass('changed').val(value);
                    this.data.set('input_mode', false);
                }
            },

            getValue: function () {
                if (this.model.get('group_info'))
                    return this.model.get('group_info').description;
            },

            keyUp: function () {
                let value = this.getValue();
                this.$input.switchClass('changed', this.$input.val() !== value);
                if (!this.$input.val())
                    this.$input.prop('placeholder', xabber.getString("groupchat_example_description"));
                this.changeValue();
            },
        });

        xabber.ContactEditGroupsView = xabber.BasicView.extend({
            template: templates.groups,
            events: {
                'click .group': 'removeGroup',
                'click .existing-group-field label': 'editGroup',
                'change .new-group-name input': 'checkNewGroup',
                'keyup .new-group-name input': 'checkNewGroup',
                'click .new-group-checkbox': 'addNewGroup',
                "keyup #new-group-name": "keyupAddNewGroup",
                "focusin #new-group-name": "focusinAddNewGroup",
                "focusout #new-group-name": "focusoutAddNewGroup",
                "keydown #new-group-name": "keydownAddNewGroup",
            },

            _initialize: function (options) {
                this.account = this.parent.account;
                this.model = this.parent.model;
                this.model.set('groups_hidden', true)
                this.model.on("change:in_roster update_groups", this.onUpdate, this);
            },

            render: function (view, arguments) {
                this.$el.html(this.template());
                if (this.model.get('in_roster')) {
                    let groups = _.clone(this.model.get('groups')),
                        all_groups = _.map(this.account.groups.notSpecial(), function (group) {
                            let name = group.get('name');
                            return {name: name, checked: _.contains(groups, name), id: uuid()};
                        }),
                        all_groups_unchecked = all_groups.filter(function(group) {
                            if (group.checked)
                                return false;
                            return true;
                        }).length;
                    if (all_groups_unchecked)
                        this.$('.groups-wrap').removeClass('empty-groups-wrap')
                    else
                        this.$('.groups-wrap').addClass('empty-groups-wrap')

                    this.$('.checkbox-list').html(templates.groups_checkbox_list({
                        groups: all_groups
                    })).appendTo(this.$('.groups-wrap'));
                    this.ps_container = this.$('.checkbox-list');
                    if (this.ps_container.length) {
                        this.ps_container.perfectScrollbar(
                            _.extend(this.ps_settings || {}, xabber.ps_settings)
                        );
                    }
                    this.scrollToTop();
                    if (groups.length)
                        this.$('.groups').html(templates.groups_list({
                            groups: all_groups
                        })).appendTo(this.$('.groups-wrap-list'));
                    else
                        this.$('.groups').html('<div class="empty-groups">'+ xabber.getString("contact_circles_empty") + '</div>')
                    this.$('.groups').append(templates.groups_new_group());

                }
                this.$el.showIf(this.model.get('in_roster'));
                if (arguments && arguments.on_add)
                    this.$('.groups-wrap').hideIf(false)
                else
                    this.$('.groups-wrap').hideIf(true)
                this.parent.updateScrollBar();
            },

            onUpdate: function (ev) {
                if (this._update_template){
                    this.render(this, {on_add: true});
                    this.$('.new-group-name input').addClass('visible');
                    this.$('.new-group-name input').focus();
                }
                else{
                    this.render();
                    this.$('.new-group-name input').addClass('visible');
                }

            },

            removeGroup: function (ev) {
                let $target = $(ev.target).closest('.group'),
                    group_name = $target.attr('data-groupname'),
                    groups = _.clone(this.model.get('groups')),
                    idx = groups.indexOf(group_name);
                if (idx >= 0) {
                    groups.splice(idx, 1);
                }
                this._update_template = false
                this.model.pushInRoster({groups: groups});
            },

            removeLastGroup: function (ev) {
                let groups = _.clone(this.model.get('groups'));
                if (groups.length) {
                    groups.pop();
                    this._update_template = true
                    this.model.pushInRoster({groups: groups});
                }
            },

            editGroup: function (ev) {
                clearTimeout(this._hide_timeout)
                let $target = $(ev.target),
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
                this._update_template = true
                this.model.pushInRoster({groups: groups});
            },

            checkNewGroup: function (ev) {
                let name = $(ev.target).val(),
                    $checkbox = this.$('.new-group-checkbox');
                $checkbox.showIf(name && !this.account.groups.get(name));
            },

            keyupAddNewGroup: function (ev) {
                let $input = this.$('.new-group-name input'),
                    name = $input.val();
                if (ev.keyCode === constants.KEY_ENTER && name) {
                    this.addNewGroup();
                }
            },

            keydownAddNewGroup: function (ev) {
                let $input = this.$('.new-group-name input'),
                    name = $input.val();
                if (ev.keyCode === constants.KEY_BACKSPACE && !name) {
                    this.removeLastGroup();
                }
            },

            focusinAddNewGroup: function (ev) {
                clearTimeout(this._hide_timeout)
                this.$('.groups-wrap').hideIf(false)
                this.$('.empty-groups').hideIf(true)
            },

            focusoutAddNewGroup: function (ev) {
                this.$('.empty-groups').hideIf(false)
                if (this.$('.new-group-name input').val())
                    this.addNewGroup();
                this._hide_timeout = setTimeout(() => {
                    this.$('.new-group-name input').removeClass('visible');
                    this.$('.groups-wrap').hideIf(true)
                    this.$('.new-group-name input').val('')
                }, 100)
            },

            addNewGroup: function () {
                let $input = this.$('.new-group-name input'),
                    name = $input.val(),
                    groups = _.clone(this.model.get('groups')),
                    idx = groups.indexOf(name);
                if (idx < 0) {
                    groups.push(name);
                }
                this.model.pushInRoster({groups: groups});
            }
        });

        xabber.ContactEditView = xabber.BasicView.extend({
            template: templates.edit_contact,
            events: {
                'click .btn-back': 'hideEdit',
                'click .btn-request': 'requestSubscription',
                'click .btn-allow': 'allowSubscription',
                'click .btn-cancel-request': 'cancelSubscriptionRequest',
                'click .btn-allow-request': 'handleSubscriptionRequest',
                'click .btn-disallow-request': 'cancelSubscriptionIn',
                'click .btn-disallow-preapproved': 'cancelSubscriptionIn',
                'click .btn-cancel-subscription-out': 'cancelSubscriptionOut',
                'click .btn-cancel-subscription-in': 'cancelSubscriptionIn',
            },

            _initialize: function (options) {
                this.account = this.parent.account;
                this.model = this.parent.model;
                this.model.set('edit_hidden', true)
                this.model.on("change:status_updated", this.updateStatuses, this);
                this.model.on("change:subscription", this.updateStatuses, this);
                this.model.on("change:subscription_preapproved", this.updateStatuses, this);
                this.model.on("change:blocked", this.updateStatuses, this);
                this.model.on("change:subscription_request_in", this.updateStatuses, this);
                this.model.on("change:subscription_request_out", this.updateStatuses, this);
            },

            render: function () {
                this.$el.html(this.template(_.extend({view: this}, constants)));
                this.$('.edit-wrap').hideIf(this.model.get('edit_hidden'))
                this.name_field = new xabber.ContactNameRightWidget({
                    el: this.$('.name-wrap')[0],
                    model: this.model
                });
                this.$('.status-out.dropdown-button').dropdown({
                    inDuration: 100,
                    outDuration: 100,
                    hover: false
                });
                this.$('.status-in.dropdown-button').dropdown({
                    inDuration: 100,
                    outDuration: 100,
                    hover: false
                });
                this.updateStatuses();
            },

            showEdit: function () {
                this.model.set('edit_hidden', false);
                this.parent.scrollToTop();
                if (this.parent.ps_container.length) {
                    this.parent.ps_container.perfectScrollbar('destroy')
                }
                this.$('.edit-wrap').hideIf(this.model.get('edit_hidden'))
            },

            updateStatuses: function () {
                let statuses = this.model.getSubscriptionStatuses(),
                    subscription_preapproved = this.model.get('subscription_preapproved');
                if (statuses){
                    this.$('.status-out').addClass(statuses.status_out_class)
                    this.$('.status-out .value').text(statuses.status_out)
                    this.$('.status-out').showIf(statuses.status_out)
                    this.$('.status-in').addClass(statuses.status_in_class)
                    this.$('.status-in  .value').text(statuses.status_in)
                    this.$('.status-in').showIf(statuses.status_in)
                    this.$('.status-description .value').html(statuses.status_description)
                    this.$('.status-description').showIf(statuses.status_description)
                    this.$('.btn-delete').hideIf(!this.model.get('in_roster'));
                    if (statuses.status_out_color === 'request') {
                        this.$('.status-out').addClass('text-color-500').addClass('request').removeClass('subbed')
                        this.$('.status-out').addClass('text-decoration-color-300')
                    }
                    if (statuses.status_in_color === 'request') {
                        this.$('.status-in').addClass('text-color-500').addClass('request').removeClass('subbed')
                        this.$('.status-in').addClass('text-decoration-color-300')
                    }
                    if (statuses.status_out_color === 'subbed') {
                        this.$('.status-out').addClass('text-color-500').addClass('subbed').removeClass('request')
                        this.$('.status-out').addClass('text-decoration-color-300')
                    }
                    if (statuses.status_in_color === 'subbed') {
                        this.$('.status-in').addClass('text-color-500').addClass('subbed').removeClass('request')
                        this.$('.status-in').addClass('text-decoration-color-300')
                    }
                    if (statuses.status_out_color === '') {
                        this.$('.status-out').removeClass('text-color-500').removeClass('request').removeClass('subbed')
                        this.$('.status-out').removeClass('text-decoration-color-300')
                    }
                    if (statuses.status_in_color === '') {
                        this.$('.status-in').removeClass('text-color-500').removeClass('request').removeClass('subbed')
                        this.$('.status-in').removeClass('text-decoration-color-300')
                    }
                    this.$('.btn-request').hideIf(!(statuses.status_out_color === ''))
                    this.$('.btn-allow').hideIf(!(statuses.status_in_color === '' && !subscription_preapproved))
                    this.$('.btn-disallow-preapproved').hideIf(!(statuses.status_in_color === '' && subscription_preapproved))
                    this.$('.btn-cancel-request').hideIf(!(statuses.status_out_color === 'request'))
                    this.$('.btn-allow-request').hideIf(!(statuses.status_in_color === 'request'))
                    this.$('.btn-disallow-request').hideIf(!(statuses.status_in_color === 'request'))
                    this.$('.btn-cancel-subscription-out').hideIf(!(statuses.status_out_color === 'subbed'))
                    this.$('.btn-cancel-subscription-in').hideIf(!(statuses.status_in_color === 'subbed'))
                }
            },

            requestSubscription: function () {
                this.model.askRequest();
            },

            allowSubscription: function () {
                this.model.acceptRequest();
                !this.account.server_features.get(Strophe.NS.SUBSCRIPTION_PREAPPROVAL) && this.set('subscription_preapproved', true)
            },

            cancelSubscriptionRequest: function () {
                this.model.declineSubscription();
            },

            handleSubscriptionRequest: function () {
                this.model.acceptRequest();
            },

            cancelSubscriptionOut: function () {
                this.model.declineSubscription();
            },

            cancelSubscriptionIn: function () {
                this.model.declineSubscribe();
                this.model.set('subscription_request_in', false);
            },

            hideEdit: function (ev) {
                this.model.set('edit_hidden', true);
                if (this.parent.ps_container.length) {
                    this.parent.ps_container.perfectScrollbar(
                        _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                    );
                };
                this.$('.edit-wrap').hideIf(this.model.get('edit_hidden'));
            },
        });

        xabber.GroupEditView = xabber.BasicView.extend({
            template: templates.edit_group,
            events: {
                "click .btn-save": "saveChanges",
                'click .edit-header:not(.property-header) .btn-back': 'hideEdit',
                'click .btn-reset': 'resetPanel',
                'click .btn-edit': 'showDescriptionProperty',
                'click .btn-back-panel': 'hidePanel',
                'click .membership-field .property-radio input': 'changeMembership',
                'click .index-field .property-radio input ': 'changeIndex',
                'click .index-property:not(.property-disabled)': 'showIndexProperty',
                'click .membership-property:not(.property-disabled)': 'showMembershipProperty',
                'click .btn-back.btn-property-back': 'hideProperty',
                "click .list-variant": "showPanel",
                "click .revoke-invitation": "revokeInvitation",
                "click .btn-reset-panel": "deselectParticipants",
                "click .btn-remove-selected": "actionSelectedParticipants",
                "click .participants-edit-wrap .list-item": "selectParticipant",
                "click .unblock-user": "unblockUser",
                "click .set-groupchat-avatar-text": "clickAvatarInput",
                "click .btn-add-block": "blockId",
                "keydown .field-input": "keyDownName",
                "keyup .field-input": "keyUp",
                "focusout .field-input": "changeValue"
            },

            _initialize: function (options) {
                this.account = this.parent.account;
                this.model = this.parent.model;
                this.model.set('edit_hidden', true)
                this.model.on('change:group_info', this.update, this)
            },

            render: function () {
                this.$el.html(this.template(_.extend({view: this}, constants)));
                this.$('.edit-wrap').hideIf(this.model.get('edit_hidden'))
                this.$('.index-property-edit-wrap').hideIf(true)
                this.$('.membership-property-edit-wrap').hideIf(true)
                this.$('.description-edit-wrap').hideIf(true)
                let dropdown_settings = {
                    inDuration: 100,
                    outDuration: 100,
                    constrainWidth: false,
                    hover: false,
                    alignment: 'right'
                };
                this.$('.property-dropdown').dropdown(dropdown_settings);
                // this.name_field = new xabber.ContactNameRightWidget({
                //     el: this.$('.name-wrap')[0],
                //     model: this.model
                // });
                this.group_name_field = new xabber.GroupNameRightWidget({
                    el: this.$('.edit-group-name-wrap')[0],
                    model: this.model,
                    parent: this,
                });
                this.group_description_field = new xabber.GroupDescriptionRightWidget({
                    el: this.$('.edit-group-description-wrap')[0],
                    model: this.model,
                    parent: this,
                });
                this.update();
            },

            update: function () {
                let info = this.model.get('group_info') || {},
                    model, searchable, privacy;
                if (info){
                    if (info.privacy === 'public')
                        privacy = xabber.getString("groupchat_public_group");
                    if (info.privacy === 'incognito')
                        privacy = xabber.getString("groupchat_incognito_group");
                    if (info.searchable === 'none') {
                        searchable = xabber.getString("groupchat_index_type_none");
                        this.$('.property-wrap #none').prop("checked", true);
                    }
                    if (info.searchable === 'local') {
                        searchable = xabber.getString("groupchat_index_type_local");
                        this.$('.property-wrap #local').prop("checked", true);
                    }
                    if (info.searchable === 'global') {
                        searchable = xabber.getString("groupchat_index_type_global");
                        this.$('.property-wrap #global').prop("checked", true);
                    }
                    if (info.model === 'open') {
                        model = xabber.getString("groupchat_membership_type_open");
                        this.$('.property-wrap #open').prop("checked", true);
                    }
                    if (info.model === 'member-only') {
                        model = xabber.getString("groupchat_membership_type_members_only");
                        this.$('.property-wrap #member-only').prop("checked", true);
                    }
                }
                this.$('.main-edit-header .block-name:not(.second-text)').text(privacy);
                this.$('.membership-property span').text(model);
                this.$('.index-property span').text(searchable);
                this.$('.edit-group-name').text(info.name);
                this.$('.edit-group-description').text(info.description);
                this.group_name_field.updateValue(true);
                this.group_description_field.updateValue(true);
                this.$('.btn-save').switchClass('fade-out', true);
                let is_owner = this.model.my_rights && this.model.my_rights.fields.find(permission => permission.var == 'owner' && permission.values);
                if (is_owner){
                    let iq_get_rights = $iq({from: this.account.get('jid'), type: 'get', to: this.model.get('full_jid') || this.model.get('jid')})
                        .c('query', {xmlns: `${Strophe.NS.GROUP_CHAT}#default-rights`});
                    this.account.sendFast(iq_get_rights, (iq_all_rights) => {
                        let data_form = this.account.parseDataForm($(iq_all_rights).find(`x[xmlns="${Strophe.NS.DATAFORM}"]`)),
                            restrictions_count = 0;
                        data_form.fields.forEach((field) => {
                            if (field.type === 'fixed' || field.type === 'hidden')
                                return;
                            let expires = field.values ? field.values[0] : undefined;
                            if (expires) {
                                restrictions_count++;
                            }
                        });
                        this.$('.btn-default-restrictions .edit-button-value').text(restrictions_count);
                    }, () => {
                        utils.callback_popup_message(xabber.getString("groupchat_you_have_no_permissions_to_do_it"), 3000);
                    });
                }
                this.updateAvatar();

            },

            updateAvatar: function () {
                let image = this.model.cached_image;
                this.$('.main-info .circle-avatar').setAvatar(image, this.avatar_size);
            },

            showMembershipProperty: function () {
                this.$('.membership-property-edit-wrap').hideIf(false)
                if (this.ps_container.length) {
                    this.ps_container.perfectScrollbar('destroy')
                }
            },

            showIndexProperty: function () {
                this.$('.index-property-edit-wrap').hideIf(false)
                if (this.ps_container.length) {
                    this.ps_container.perfectScrollbar('destroy')
                }
            },

            showDescriptionProperty: function () {
                this.$('.description-edit-wrap').hideIf(false)
                this.group_description_field.$input.height(this.group_description_field.$input[0].scrollHeight - 8)
                if (this.ps_container.length) {
                    this.ps_container.perfectScrollbar('destroy')
                }
            },

            hideProperty: function () {
                this.$('.index-property-edit-wrap').hideIf(true)
                this.$('.description-edit-wrap').hideIf(true)
                this.$('.membership-property-edit-wrap').hideIf(true)
                if (this.ps_container.length) {
                    this.ps_container.perfectScrollbar(
                        _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                    );
                }
            },

            revokeInvitation: function (ev) {
                let $member_item = $(ev.target).closest('.invitations-user');
                if (this.parent.children && this.parent.children.invitations)
                    this.parent.children.invitations.revokeInvitation(ev)
            },

            showBlockButton: function (ev) {
                this.$('.edit-bottom-block .btn-add-block').hideIf(false);
            },

            showInviteButton: function (ev) {
                this.$('.edit-bottom-block .btn-invite').hideIf(false);
            },

            unblockUser: function (ev) {
                if (this.parent.children && this.parent.children.blocked)
                    this.parent.children.blocked.unblockUser(ev)
            },

            actionSelectedParticipants: function (ev) {
                let selected = this.$('.list-item.selected');
                selected.each((index, item) => {
                    if ($(item).hasClass('invitations-user') && this.parent.children && this.parent.children.invitations)
                        this.parent.children.invitations.revokeInvitationByElement($(item))
                    if ($(item).hasClass('blocked-user') && this.parent.children && this.parent.children.blocked)
                        this.parent.children.blocked.unblockUserByElement($(item))
                    if ($(item).hasClass('blocked-user') || $(item).hasClass('invitations-user'))
                        $(item).removeClass('selected')
                });
                this.updateRemoveParticipantButton();
            },

            blockId: function () {
                if (this.parent.children && this.parent.children.blocked)
                    this.parent.children.blocked.blockId()
            },

            deselectParticipants: function (ev) {
                this.$('.list-item.selected').removeClass('selected')
                this.updateRemoveParticipantButton();
            },

            selectParticipant: function (ev) {
                if ($(ev.target).parent().hasClass('revoke-invitation') || $(ev.target).parent().hasClass('unblock-user') ||
                    $(ev.target).hasClass('revoke-invitation') || $(ev.target).hasClass('unblock-user'))
                    return;
                let $member_item = $(ev.target).closest('.list-item'),
                    is_selected = $member_item.hasClass('selected');
                $member_item.switchClass('selected', !is_selected)
                this.updateRemoveParticipantButton();
            },

            updateRemoveParticipantButton: function () {
                let has_changes = this.$('.list-item.selected').length;
                this.$('.block-name-panel.second-text span').html(has_changes)
                if (has_changes) {
                    this.$('.participants-edit-back').removeClass('mdi-arrow-right').addClass('mdi-close')
                    this.$('.participants-edit-back').removeClass('btn-back-panel').addClass('btn-reset-panel')
                    this.$('.block-name-panel:not(.second-text)').addClass('fade-out');
                    this.$('.edit-bottom-block .btn-invite').addClass('fade-out');
                    this.$('.edit-bottom-block .btn-add-block').addClass('fade-out');
                    this.$('.block-name-panel.second-text').removeClass('fade-out');
                    this.$('.btn-remove-selected').removeClass('fade-out');
                }
                else{
                    this.$('.participants-edit-back').addClass('mdi-arrow-right').removeClass('mdi-close')
                    this.$('.participants-edit-back').addClass('btn-back-panel').removeClass('btn-reset-panel')
                    this.$('.block-name-panel:not(.second-text)').removeClass('fade-out');
                    this.$('.edit-bottom-block .btn-invite').removeClass('fade-out');
                    this.$('.edit-bottom-block .btn-add-block').removeClass('fade-out');
                    this.$('.block-name-panel.second-text').addClass('fade-out');
                    this.$('.btn-remove-selected').addClass('fade-out');
                }
            },

            clickAvatarInput: function (ev) {
                this.$('.circle-avatar input').click();
            },

            hidePanel: function () {
                this.parent.getInvitations((response) => {
                    this.$('.invitations-variant .counted').html($(response).find('query').find('user').length);
                });
                this.model.getBlockedParticipants((response) => {
                    this.$('.blocked-variant .counted').html($(response).find('query').children().length);
                });
                this.$('.btn-back-panel').hideIf(true)
                this.$('.block-name-panel').hideIf(true)
                this.$('.edit-bottom-block .btn-add-block').hideIf(true)
                this.$('.edit-bottom-block .btn-invite').hideIf(true)
                this.$('.btn-remove-selected').hideIf(true)
                this.$('.participants-edit-wrap').hideIf(true)
                // if (this.ps_container.length) {
                //     this.ps_container.perfectScrollbar('destroy')
                // }
                // this.ps_container = this.$('.edit-wrap');
                // if (this.ps_container.length) {
                //     this.ps_container.perfectScrollbar(
                //         _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                //     );
                // }
                // this.hideEdit();
            },

            showPanel: function () {
                this.$('.btn-back-panel').hideIf(false)
                this.$('.block-name-panel').hideIf(false)
                this.$('.btn-remove-selected').hideIf(false)
                this.$('.participants-edit-wrap').hideIf(false)
                this.updateRemoveParticipantButton();
                if (this.ps_container.length) {
                    this.ps_container.perfectScrollbar('destroy')
                }
                this.ps_container = this.$('.participants-edit-wrap');
                if (this.ps_container.length) {
                    this.ps_container.perfectScrollbar(
                        _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                    );
                }
            },

            resetPanel: function () {
                this.updateSaveButton()
                this.showEdit()
            },

            updateSaveButton: function () {
                let has_changes = false;
                this.data_form.fields.forEach((field) => {
                    if (field.type === 'hidden' || field.type === 'fixed')
                        return;
                    let value = field.values ? field.values[0] : null;
                    if ((field.var in this.original_data_form_values) && this.original_data_form_values[field.var] != value) {
                        has_changes = true;
                    }
                });
                this.$('.btn-save').switchClass('fade-out', !has_changes);
                this.$('.btn-qr-code').hideIf(has_changes);
                if (has_changes) {
                    this.$('.block-name.second-text').html(xabber.getString("edit_vcard"))
                    this.$('.edit-header:not(.main-edit-header) .details-icon').removeClass('mdi-arrow-right').addClass('mdi-close')
                    this.$('.edit-header:not(.main-edit-header) .details-icon').removeClass('btn-back').addClass('btn-reset')
                    this.$('.edit-header:not(.main-edit-header) .block-name:not(.second-text)').addClass('fade-out');
                    this.$('.edit-header:not(.main-edit-header) .block-name.second-text').removeClass('fade-out');
                }
                else{
                    this.$('.edit-header:not(.main-edit-header) .details-icon').addClass('mdi-arrow-right').removeClass('mdi-close')
                    this.$('.edit-header:not(.main-edit-header) .details-icon').addClass('btn-back').removeClass('btn-reset')
                    this.$('.edit-header:not(.main-edit-header) .block-name:not(.second-text)').removeClass('fade-out');
                    this.$('.edit-header:not(.main-edit-header) .block-name.second-text').addClass('fade-out');
                }
                let info = this.model.get('group_info') || {};
                if (info){
                    if (info.privacy === 'public')
                        this.$('.main-edit-header .block-name:not(.second-text)').html(xabber.getString("groupchat_public_group"));
                    if (info.privacy === 'incognito')
                        this.$('.main-edit-header .block-name:not(.second-text)').html(xabber.getString("groupchat_incognito_group"));
                }
            },

            changeName: function (value) {
                if (this.data_form && value){
                    let data_form_index = this.data_form.fields.findIndex(x => x.var == 'name')
                    if (!this.original_data_form_values.name)
                        this.original_data_form_values.name = this.data_form.fields[data_form_index].values[0]
                    this.data_form.fields[data_form_index].values = [value]
                    this.updateSaveButton()
                }
            },

            changeDescription: function (value) {
                if (this.data_form){
                    let data_form_index = this.data_form.fields.findIndex(x => x.var == 'description')
                    if (!this.original_data_form_values.description)
                        this.original_data_form_values.description = this.data_form.fields[data_form_index].values[0]
                    this.data_form.fields[data_form_index].values = [value]
                    this.updateSaveButton()
                }
            },

            changeMembership: function (ev) {
                let membership = $(ev.target).attr('id'),
                    membership_text;
                if (this.data_form && membership){
                    let data_form_index = this.data_form.fields.findIndex(x => x.var == 'membership')
                    if (!this.original_data_form_values.membership)
                        this.original_data_form_values.membership = this.data_form.fields[data_form_index].values[0]
                    this.data_form.fields[data_form_index].values = [membership]
                    if (membership === 'open')
                        membership_text = xabber.getString("groupchat_membership_type_open");
                    if (membership === 'member-only')
                        membership_text = xabber.getString("groupchat_membership_type_members_only");
                    this.$('.membership-property span').text(membership_text);
                    this.updateSaveButton()
                }
            },

            changeIndex: function (ev) {
                let index = $(ev.target).attr('id'),
                    index_text;
                if (this.data_form && index){
                    let data_form_index = this.data_form.fields.findIndex(x => x.var == 'index')
                    if (!this.original_data_form_values.index)
                        this.original_data_form_values.index = this.data_form.fields[data_form_index].values[0]
                    this.data_form.fields[data_form_index].values = [index]
                    if (index === 'none')
                        index_text = xabber.getString("groupchat_index_type_none");
                    if (index === 'local')
                        index_text = xabber.getString("groupchat_index_type_local");
                    if (index === 'global')
                        index_text = xabber.getString("groupchat_index_type_global");
                    this.$('.index-property span').text(index_text);
                    this.updateSaveButton()
                }
            },


            saveChanges: function() {
                if (this.$('.btn-save').hasClass('fade-out'))
                    return;
                this.$('.btn-save').addClass('fade-out')
                this.group_name_field.$input.prop('disabled', true);
                this.group_description_field.$input.prop('disabled', true);
                this.$('.edit-save-preloader.preloader-wrap').addClass('visible').find('.preloader-wrapper').addClass('active');
                let iq = $iq({type: 'set', to: this.model.get('full_jid') || this.model.get('jid')})
                        .c('query', {xmlns: Strophe.NS.GROUP_CHAT});
                iq = this.account.addDataFormToStanza(iq, this.data_form);
                this.account.sendIQFast(iq, (result) => {
                    let $result  = $(result),
                        group_info = _.clone(this.model.get('group_info')),
                        attrs = {
                            name: $result.find('field[var="name"] value').text(),
                            searchable: $result.find('field[var="index"]').children('value').text(),
                            model: $result.find('field[var="membership"]').children('value').text(),
                            description: $result.find('field[var="description"] value').text(),
                            status: $result.find('field[var="status"]').children('value').text()
                        };
                    _.extend(group_info, attrs);
                    this.model.set('group_info', group_info);
                    this.group_name_field.$input.prop('disabled', false);
                    this.group_description_field.$input.prop('disabled', false);
                    this.hideProperty()
                    this.$('.edit-save-preloader.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');
                    this.resetPanel()
                }, (error) => {

                    let err_text = $(error).find('error text').text() || xabber.getString("groupchat_you_have_no_permissions_to_do_it");
                    utils.dialogs.error(err_text);
                    this.group_name_field.$input.prop('disabled', false);
                    this.group_description_field.$input.prop('disabled', false);
                    this.hideProperty()
                    this.$('.edit-save-preloader.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');
                });
            },

            showEdit: function (ev) {
                let iq_get_properties = $iq({to: this.model.get('full_jid') || this.model.get('jid'), type: 'get'})
                    .c('query', {xmlns: Strophe.NS.GROUP_CHAT});
                this.parent.$('.group-edit-preloader').html(env.templates.contacts.preloader())
                this.account.sendIQFast(iq_get_properties, (properties) => {
                    this.data_form = this.account.parseDataForm($(properties).find(`x[xmlns="${Strophe.NS.DATAFORM}"]`));
                    this.original_data_form_values = {}
                    this.model.set('edit_hidden', false);
                    this.parent.scrollToTop();
                    if (this.parent.ps_container.length) {
                        this.parent.ps_container.perfectScrollbar('destroy')
                    }
                    this.ps_container = this.$('.edit-wrap');
                    if (this.ps_container.length) {
                        this.ps_container.perfectScrollbar(
                            _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                        );
                    }
                    this.update()
                    this.$('.group-property:not(.privacy-property)').removeClass('disabled')
                    this.group_name_field.$input.hideIf(false)
                    this.group_description_field.$input.hideIf(false)
                    this.group_name_field.$input.prop('disabled', false);
                    this.group_description_field.$input.prop('disabled', false);
                    this.$('.circle-avatar input').prop('disabled', false);
                    this.$('.set-groupchat-avatar-text').hideIf(false);
                    this.$('.group-property').removeClass('property-disabled');
                    this.$('.membership-property .details-icon-right').hideIf(false);
                    this.$('.index-property .details-icon-right').hideIf(false);
                    this.$('.circle-avatar .set-groupchat-avatar').hideIf(false);
                    this.$('.btn-edit').hideIf(false)
                    this.$('.edit-bottom-block').hideIf(false)
                    this.$('.btn-default-restrictions').hideIf(false)
                    this.$('.btn-delete-group').hideIf(false)
                    this.$('.btn-clear-history-chat').hideIf(false)
                    this.$('.btn-back-panel').hideIf(true)
                    this.$('.block-name-panel').hideIf(true)
                    this.$('.edit-bottom-block .btn-add-block').hideIf(true)
                    this.$('.edit-bottom-block .btn-invite').hideIf(true)
                    this.$('.btn-remove-selected').hideIf(true)
                    this.$('.participants-edit-wrap').hideIf(true)
                    this.parent.getInvitations((response) => {
                        this.$('.invitations-variant .counted').html($(response).find('query').find('user').length);
                    });
                    this.model.getBlockedParticipants((response) => {
                        this.$('.blocked-variant .counted').html($(response).find('query').children().length);
                    });
                    this.$('.edit-wrap').hideIf(this.model.get('edit_hidden'))
                    this.parent.$('.group-edit-preloader').html('')
                    this.group_description_field.$input.height(this.group_description_field.$input[0].scrollHeight - 8)
                    this.$('.tabs .indicator').remove();
                }, () => {
                    this.model.set('edit_hidden', false);
                    this.parent.scrollToTop();
                    if (this.parent.ps_container.length) {
                        this.parent.ps_container.perfectScrollbar('destroy')
                    }
                    this.ps_container = this.$('.edit-wrap');
                    if (this.ps_container.length) {
                        this.ps_container.perfectScrollbar(
                            _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                        );
                    }
                    this.update()
                    this.group_name_field.$input.prop('disabled', true);
                    this.group_description_field.$input.prop('disabled', true);
                    if (!this.group_description_field.$input.val())
                        this.group_description_field.$input.hideIf(true)
                    this.$('.circle-avatar input').prop('disabled', true);
                    this.$('.set-groupchat-avatar-text').hideIf(true);
                    this.$('.group-property').addClass('property-disabled');
                    this.$('.membership-property .details-icon-right').hideIf(true);
                    this.$('.index-property .details-icon-right').hideIf(true);
                    this.$('.circle-avatar .set-groupchat-avatar').hideIf(true);
                    this.$('.group-property:not(.privacy-property)').addClass('disabled')
                    this.$('.btn-edit').hideIf(true)
                    this.$('.edit-bottom-block').hideIf(true)
                    this.$('.btn-default-restrictions').hideIf(true)
                    this.$('.btn-delete-group').hideIf(true)
                    this.$('.btn-clear-history-chat').hideIf(true)
                    this.$('.btn-back-panel').hideIf(true)
                    this.$('.block-name-panel').hideIf(true)
                    this.$('.edit-bottom-block .btn-add-block').hideIf(true)
                    this.$('.edit-bottom-block .btn-invite').hideIf(true)
                    this.$('.btn-remove-selected').hideIf(true)
                    this.$('.participants-edit-wrap').hideIf(true)
                    let info = this.model.get('group_info') || {};
                    this.$('.edit-wrap').hideIf(this.model.get('edit_hidden'))
                    this.parent.$('.group-edit-preloader').html('')
                    this.group_description_field.$input.height(this.group_description_field.$input[0].scrollHeight - 8)
                    this.$('.tabs .indicator').remove();
                });
            },

            hideEdit: function (ev) {
                this.model.set('edit_hidden', true);
                if (this.parent.ps_container.length) {
                    this.parent.ps_container.perfectScrollbar(
                        _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                    );
                };
                if (this.ps_container.length) {
                    this.ps_container.perfectScrollbar('destroy')
                }
                this.$('.edit-wrap').hideIf(this.model.get('edit_hidden'));
            },
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
                    let s1 = contact1.get('status'),
                        s2 = contact2.get('status'),
                        sw1 = constants.STATUS_WEIGHTS[s1],
                        sw2 = constants.STATUS_WEIGHTS[s2],
                        sw1_offline = sw1 >= constants.STATUS_WEIGHTS.offline,
                        sw2_offline = sw2 >= constants.STATUS_WEIGHTS.offline;
                    if (sw1_offline ^ sw2_offline) {
                        return sw1_offline ? 1 : -1;
                    }
                }
                let name1, name2;
                name1 = contact1.get('name').toLowerCase();
                name2 = contact2.get('name').toLowerCase();
                return name1 < name2 ? -1 : (name1 > name2 ? 1 : 0);
            },

            onContactChanged: function (contact) {
                let changed = contact.changed;
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
                if (!this._settings)
                    this._settings = this.account.groups_settings.create({name: attrs.name});
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
                let all = this.contacts.length,
                    online = all - this.contacts.where({status: 'offline'}).length;
                this.set('counter', {all: all, online: online});
            },

            renameGroup: function (new_name) {
                let name = this.get('name'),
                    attrs = _.clone(this.settings);
                attrs.name = new_name;
                this._settings.destroy();
                this._settings = this.account.groups_settings.create(attrs);
                this.settings = this._settings.attributes;
                this.set({id: new_name, name: new_name});
                this.trigger('rename', this, name);
                _.each(_.clone(this.contacts.models), function (contact) {
                    let groups = _.clone(contact.get('groups')),
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
                let name = this.get('name');
                this._settings.destroy();
                _.each(_.clone(this.contacts.models), function (contact) {
                    let groups = _.clone(contact.get('groups')),
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
                let changed = xabber._roster_settings.changed;
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
                let expanded = this.data.get('expanded');
                this.$el.switchClass('shrank', !expanded);
                this.$('.arrow').switchClass('mdi-chevron-down', expanded);
                this.$('.arrow').switchClass('mdi-chevron-right', !expanded);
                this.$('.roster-contact').showIf(expanded);
                this.parent.parent.onListChanged();
            },

            updateGroupIcon: function () {
                let mdi_icon, show_offline = this.model.settings.show_offline;
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
                let counter = this.model.get('counter');
                this.$('.participant-counter').text('('+counter.online+'/'+counter.all+')');
            },

            onContactAdded: function (contact) {
                let view = this.addChild(contact.get('jid'), this.item_view, {model: contact});
                this.updateContactItem(contact);
            },

            onContactRemoved: function (contact) {
                this.removeChild(contact.get('jid'));
                this.parent.parent.onListChanged();
            },

            updateContactItem: function (contact) {
                let view = this.child(contact.get('jid'));
                if (!view) return;
                let roster_settings = xabber.settings.roster,
                    group_settings = this.model.settings,
                    is_default_show_offline = group_settings.show_offline === 'default',
                    show_offline = group_settings.show_offline === 'yes' ||
                        (is_default_show_offline && roster_settings.show_offline === 'yes'),
                    is_offline = constants.STATUS_WEIGHTS[contact.get('status')] >= 6;

                view.$el.switchClass('invisible', is_offline && !show_offline).detach();
                let index = this.model.contacts.indexOf(contact);
                if (index === 0) {
                    this.$('.group-head').after(view.$el);
                } else {
                    this.$('.roster-contact').eq(index - 1).after(view.$el);
                }
                view.$el.showIf(this.data.get('expanded'));
                this.parent.parent.onListChanged();
                return view;
            },

            showSettingsIcon: function () {
                this.$('.group-icon').attr('data-mdi', 'settings').removeClass('hidden');
            },

            showGroupSettings: function (ev) {
                ev.stopPropagation();
                this.model.showSettings();
            },

            onChangedOfflineSetting: function () {
                this.updateGroupIcon();
                let roster_settings = xabber.settings.roster,
                    group_settings = this.model.settings,
                    is_default_show_offline = group_settings.show_offline === 'default',
                    show_offline = group_settings.show_offline === 'yes' ||
                        (is_default_show_offline && roster_settings.show_offline === 'yes');
                _.each(this.children, function (view) {
                    let is_offline = constants.STATUS_WEIGHTS[view.model.get('status')] >= 6;
                    view.$el.switchClass('invisible', is_offline && !show_offline);
                });
                this.parent.parent.onListChanged();
            },

            onChangedSortingSetting: function () {
                _.each(this.children, function (view) { view.$el.detach(); });
                this.model.contacts.each((c) => { this.updateContactItem(c); });
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
                let expanded = !this.data.get('expanded');
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
                let name = this.model.get('name');
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
                    return xabber.getString("dialog_add_circle__error__text_input_name");
                }
                if (this.model.collection.get(name)) {
                    return xabber.getString("dialog_add_circle__error__text_wrong_name");
                }
            },

            applySettings: function () {
                let new_name = this.$('.group-name input').val();
                if (new_name !== this.model.get('name')) {
                    let name_error = this.validateName(new_name);
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
                let name = this.model.get('name');
                utils.dialogs.ask(xabber.getString("circle_remove"), xabber.getString("circle_remove_confirm", [name]), null, { ok_button_text: xabber.getString("remove")})
                    .done((result) => {
                        result && this.model.deleteGroup();
                    });
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
                this.on("change:id", this.sort, this);
                this.account.on('render_settings', this.render, this);
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
            },

            render: function () {
                this.on("add", this.onGroupAdded, this);
                this.models.forEach((group) => {
                    group.acc_view = new xabber.AccountGroupView({model: group});
                });
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
                let contact = this.get(attrs.jid);
                if (contact) {
                    if (attrs.avatar) {
                        attrs.image = attrs.avatar;
                        delete attrs.avatar;
                        contact.cached_image = Images.getCachedImage(attrs.image);
                    }
                    contact.set(attrs);
                } else {
                    contact = this.create(attrs, {account: this.account});
                }
                return contact;
            },

            blockContact: function (jid, callback, errback) {
                let iq = $iq({type: 'set'}).c('block', {xmlns: Strophe.NS.BLOCKING})
                    .c('item', {jid: jid});
                this.account.sendIQFast(iq, callback, errback);
            },

            unblockContact: function (jid, callback, errback) {
                let iq = $iq({type: 'set'}).c('unblock', {xmlns: Strophe.NS.BLOCKING})
                    .c('item', {jid: jid});
                this.account.sendIQFast(iq, callback, errback);
            },

            removeAllContacts: function () {
                _.each(_.clone(this.models), function (contact) {
                    contact.destroy();
                });
                this.account.trigger('remove_saved_chat');
            },

            handlePresence: function (presence, jid) {
                let contact = this.mergeContact(jid);
                contact.handlePresence(presence);
            }
        });

        xabber.BlockList = Backbone.Model.extend({
            initialize: function (models, options) {
                this.account = options.account;
                this.list = {};
                this.contacts = this.account.contacts;
                this.contacts.on("add_to_blocklist", this.onContactAdded, this);
                this.contacts.on("remove_from_blocklist", this.onContactRemoved, this);
            },

            length: function () {
                return Object.keys(this.list).length;
            },

            isBlocked: function (jid) {
                return this.list.hasOwnProperty(jid);
            },

            onContactRemoved: function (jid) {
                delete this.list[jid];
            },

            onContactAdded: function (attrs) {
                this.list[attrs.jid] = attrs;
            },

            registerHandler: function () {
                this.account.connection.deleteHandler(this._stanza_handler);
                this._stanza_handler = this.account.connection.addHandler(
                    this.onBlockingIQ.bind(this),
                    Strophe.NS.BLOCKING, 'iq', "set", null, this.account.get('jid')
                );
            },

            getFromServer: function () {
                let iq = $iq({type: 'get'}).c('blocklist', {xmlns: Strophe.NS.BLOCKING});
                this.account.sendIQFast(iq, this.onBlockingIQ.bind(this));
            },

            onBlockingIQ: function (iq) {
                let $elem = $(iq).find(`[xmlns="${Strophe.NS.BLOCKING}"]`),
                    tag = $elem[0].tagName.toLowerCase(),
                    blocked = tag.startsWith('block');
                $elem.find('item').each((idx, item) => {
                    let jid = item.getAttribute('jid'),
                        resource = Strophe.getResourceFromJid(jid),
                        domain = Strophe.getDomainFromJid(jid),
                        attrs = {jid},
                        contact = this.contacts.get(jid);
                    resource && (attrs.resource = true);
                    (domain === jid) && (attrs.domain = true);
                    if (blocked)
                        this.contacts.trigger("add_to_blocklist", attrs);
                    else {
                        this.contacts.trigger("remove_from_blocklist", jid);
                        contact && contact.trigger("remove_from_blocklist", contact);
                    }
                    contact && contact.set('blocked', blocked);
                });
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
                let contains = contact.get('in_roster') || contact.get('known');
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
                if (!contact.get('in_roster'))
                    return;
                let groups = contact.get('groups');
                if (!groups.length) {
                    this.addContactToGroup(contact, constants.GENERAL_GROUP_ID);
                } else {
                    _.each(groups, _.bind(this.addContactToGroup, this, contact));
                }
            },

            onContactChanged: function (contact) {
                let changed = contact.changed,
                    known_changed = _.has(changed, 'known'),
                    in_roster_changed = _.has(changed, 'in_roster'),
                    groups_changed = _.has(changed, 'groups');
                if (in_roster_changed || known_changed || groups_changed) {
                    let groups;
                    if (contact.get('in_roster')) {
                        groups = _.clone(contact.get('groups'));
                        if (!groups.length) {
                            groups.push(constants.GENERAL_GROUP_ID);
                        }
                    } else if (contact.get('known')) {
                        groups = [];
                    }
                    // TODO: optimize
                    let groups_to_remove = this.groups.filter(function (group) {
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
                let group = this.groups.get(name);
                if (group)
                    return group;
                let attrs = {id: name};
                if (name === constants.GENERAL_GROUP_ID) {
                    attrs.name = xabber.settings.roster.general_group_name;
                } else if (name === constants.NON_ROSTER_GROUP_ID) {
                    attrs.name = xabber.settings.roster.non_roster_group_name;
                }
                return this.groups.create(attrs, {account: this.account});
            },

            addContactToGroup: function (contact, name) {
                let group = this.getGroup(name);
                group.contacts.add(contact);
            },

            registerHandler: function () {
                this.account.connection.deleteHandler(this._stanza_handler);
                this._stanza_handler = this.account.connection.addHandler(
                    this.onRosterIQ.bind(this),
                    Strophe.NS.ROSTER, 'iq', "set", null, this.account.get('jid')
                );
            },

            syncFromServer: function (options, synchronization_with_stamp, is_first_sync) {
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
                this.account.sendFast(iq, (response) => {
                    this.onSyncIQ(response, request_attrs.stamp, synchronization_with_stamp, is_first_sync, options.last_version_sync);
                });
            },

            syncCachedConversations: function (conv_list, request_with_stamp, is_first_sync) {
                $(conv_list).each((idx, item) => {
                    this.syncConversation(null, null, item.conversation, is_first_sync);
                });
            },

            syncConversations: function (iq, request_with_stamp, is_first_sync) {
                $(iq).find('conversation').each((idx, item) => {
                    this.syncConversation(iq, request_with_stamp, item, is_first_sync);
                });
            },

            syncConversation: function (iq, request_with_stamp, item, is_first_sync) {
                if (!$(item).length){
                    return;
                }
                if (!iq)
                    item = $($.parseXML(item)).find('conversation')[0];
                let $item = $(item),
                    jid = $item.attr('jid'), saved = false;
                if (jid === this.account.get('jid'))
                    saved = true;
                if ($item.attr('type') === Strophe.NS.SYNCHRONIZATION_OLD_OMEMO)
                    return true;
                let $sync_metadata = $item.children('metadata[node="' + Strophe.NS.SYNCHRONIZATION + '"]'),
                    type = $item.attr('type'),
                    presence = $item.children('presence'),
                    $group_metadata = $item.children('metadata[node="' + Strophe.NS.GROUP_CHAT + '"]'),
                    is_incognito =  type === Strophe.NS.GROUP_CHAT && $group_metadata.children('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"]').children('privacy').text() === 'incognito',
                    is_private = is_incognito && $group_metadata.children('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"]').children('parent').text(),
                    is_group_chat =  type === Strophe.NS.GROUP_CHAT || is_private || is_incognito,
                    encrypted = type === Strophe.NS.SYNCHRONIZATION_OMEMO,
                    contact = !saved && this.contacts.mergeContact({jid: jid, group_chat: is_group_chat, private_chat: is_private, incognito_chat: is_incognito}),
                    chat = saved ? this.account.chats.getSavedChat() : this.account.chats.getChat(contact, encrypted && 'encrypted', true),
                    message = $sync_metadata.children('last-message').children('message'),
                    current_call = $item.children('metadata[node="' + Strophe.NS.JINGLE_MSG + '"]').children('call'),
                    $unread_messages = $sync_metadata.children('unread'),
                    chat_timestamp = Math.trunc(Number($item.attr('stamp'))/1000),
                    last_read_msg = $unread_messages.attr('after'),
                    last_delivered_msg = $sync_metadata.children('delivered').attr('id'),
                    last_displayed_msg = $sync_metadata.children('displayed').attr('id'),
                    unread_msgs_count = Number($unread_messages.attr('count')) || 0,
                    is_invite =  message.find('invite').length,
                    msg_retraction_version = $item.children('metadata[node="' + Strophe.NS.REWRITE + '"]').children('retract').attr('version'),
                    msg, options = {synced_msg: true,};
                (iq && !($item.attr('status') === 'deleted')) && this.account.cached_sync_conversations.putInCachedConversations({
                    account_conversation_type: $(item).attr('jid') +  '/' + $(item).attr('type'),
                    conversation: item.outerHTML,
                });
                if (!chat.item_view.content && (is_invite || encrypted && this.account.omemo)) {
                    chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                }
                if ($item.attr('pinned') || $item.attr('pinned') === '0'){
                    chat.set('pinned', $item.attr('pinned'));
                }
                if (encrypted && this.account.omemo) {
                    chat.set('timestamp', chat_timestamp);
                    chat.set('opened', true);
                    if (iq && $(iq).attr('type') != 'set')
                        chat.item_view.updateEncryptedChat();
                }
                if (!saved) {
                    if ($item.attr('mute') || $item.attr('mute') === '0') {
                        if ($item.attr('mute') < (Date.now() / 1000))
                            chat.set('muted', false);
                        else
                            chat.set('muted', $item.attr('mute'));
                        this.account.chat_settings.updateMutedList(contact.get('jid'), $item.attr('mute'));
                        if (contact.details_view_right)
                            contact.details_view_right.updateNotifications();
                    }
                    else{
                        chat.set('muted', false);
                    }
                }
                if ($item.attr('status') === 'archived')
                    chat.set('archived', true);
                else if ($item.attr('status') === 'active' && !saved)
                    chat.set('archived', false);
                if ($item.attr('status') === 'deleted') {
                    contact && contact.details_view && contact.details_view.isVisible() && xabber.body.setScreen(xabber.body.screen.get('name'), {right: undefined});
                    chat.get('display') && xabber.body.setScreen(xabber.body.screen.get('name'), {right_contact: '', right: undefined});
                    chat.set('opened', false);
                    chat.set('const_unread', 0);
                    this.account.cached_sync_conversations.removeFromCachedConversations($(item).attr('jid') +  '/' + $(item).attr('type'));
                    this.account.chat_settings.updateGroupChatsList(contact.get('jid'), false);
                    xabber.toolbar_view.recountAllMessageCounter();
                    xabber.chats_view.clearSearch();
                    contact && contact.set('sync_deleted', true);
                    if (is_group_chat) {
                        contact && contact.set('in_roster', false);
                        contact && contact.set('known', false);
                        contact && contact.set('removed', true);
                        this.account.cached_roster.removeFromRoster(jid);
                    }
                }
                else
                    contact && contact.set('sync_deleted', false);
                if ($group_metadata.length) {
                    contact.participants && contact.participants.createFromStanza($group_metadata.children(`user[xmlns="${Strophe.NS.GROUP_CHAT}"]`));
                }
                if (current_call.length) {
                    let $jingle_message = current_call.children('message'),
                        full_jid = $jingle_message.attr('from'),
                        session_id = $jingle_message.children('propose').attr('id');
                    chat.initIncomingCall(full_jid, session_id);
                }
                chat.set('last_delivered_id', last_delivered_msg);
                chat.set('last_displayed_id', last_displayed_msg);
                chat.set('last_read_msg', last_read_msg);
                chat.set('sync_type', type);
                if (!message.length) {
                    chat.set('timestamp', chat_timestamp);
                    if (!(Number(last_delivered_msg) || Number(last_displayed_msg) || Number(last_read_msg))
                        && !chat.item_view.content && !chat.get('group_chat')){
                        chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                    }
                    chat.item_view.updateEmptyChat();
                }
                if (is_group_chat) {
                    if (request_with_stamp && !is_first_sync) {
                        if (chat.retraction_version < msg_retraction_version)
                            chat.trigger("get_retractions_list");
                    } else
                        chat.retraction_version = msg_retraction_version;
                }
                if (request_with_stamp && chat.item_view && chat.item_view.content) {
                    chat.trigger('get_missed_history', request_with_stamp/1000);
                }
                unread_msgs_count && (options.is_unread = true);
                options.delay = message.children('time');
                if (encrypted && this.account.omemo)
                    unread_msgs_count && unread_msgs_count--;
                message.length && (msg = this.account.chats.receiveChatMessage(message, options));
                if (!(encrypted && !this.account.omemo)){
                    chat.messages_unread.reset();
                    chat.set('unread', 0);
                    chat.set('const_unread', unread_msgs_count);
                }
                if (msg) {
                    if (!msg.get('is_unread') && $unread_messages.attr('count') > 0 && !msg.isSenderMe() && ($unread_messages.attr('after') < msg.get('stanza_id') || $unread_messages.attr('after') < msg.get('contact_stanza_id')))
                        msg.set('is_unread', true);
                    if(!(is_invite || encrypted && this.account.omemo)) {
                        if (msg.isSenderMe() && msg.get('stanza_id') == last_displayed_msg)
                            msg.set('state', constants.MSG_DISPLAYED);
                        else if (msg.isSenderMe() && msg.get('stanza_id') == last_delivered_msg)
                            msg.set('state', constants.MSG_DELIVERED);
                        this.account.messages.add(msg);
                        if ((chat.last_message && (msg.get('timestamp') > chat.last_message.get('timestamp'))) || !chat.last_message){
                            chat.last_message = msg;
                            chat.item_view.updateLastMessage(msg);
                        }
                    }
                    chat.set('first_archive_id', msg.get('stanza_id'));
                }
                if (presence.length)
                    contact && contact.handlePresence(presence[0]);
                else {
                    contact && contact.set('subscription_request_in', false)
                }
                xabber.toolbar_view.recountAllMessageCounter();
            },

            onSyncIQ: function (iq, request_with_stamp, synchronization_with_stamp, is_first_sync, is_last_sync) {
                let sync_timestamp = Number($(iq).children(`query[xmlns="${Strophe.NS.SYNCHRONIZATION}"]`).attr('stamp')),
                    sync_rsm_after = $(iq).find(`query set[xmlns="${Strophe.NS.RSM}"]`).children('last').text();
                this.account.last_msg_timestamp = Math.round(sync_timestamp/1000);
                let last_chat_msg_id = $(iq).find('set last'),
                    encrypted_retract_version = $(iq).find('query conversation[type="encrypted"]').first().children('metadata[node="' + Strophe.NS.REWRITE + '"]').children('retract').attr('version'),
                    retract_version = $(iq).find('query conversation[type="chat"]').first().children(`metadata[node="${Strophe.NS.REWRITE}"]`).children('retract').attr('version');
                if (!request_with_stamp)
                    last_chat_msg_id.length ? (this.last_chat_msg_id = last_chat_msg_id.text()) : (this.conversations_loaded = true);
                if (!_.isUndefined(encrypted_retract_version) && this.account.omemo && this.account.omemo.getRetractVersion() < encrypted_retract_version)
                    this.account.getAllMessageRetractions(true);
                if (request_with_stamp) {
                    if (this.account.retraction_version < retract_version)
                        this.account.getAllMessageRetractions();
                } else {
                    this.account.retraction_version = retract_version;
                }
                this.account.set('last_sync', sync_timestamp);
                this.account.settings.update_settings({last_sync_timestamp: sync_timestamp});
                let dfd = new $.Deferred();
                dfd.done((is_cached) => {
                    xabber.chats_view.hideChatsFeedback();
                    if (!request_with_stamp)
                        this.account.chats.getSavedChat();
                    if (is_first_sync)
                        this.account.set('first_sync', sync_timestamp);
                    if (!$(iq).find('conversation').length || $(iq).find('conversation').length < constants.SYNCHRONIZATION_RSM_MAX ){
                        if (is_first_sync) {
                            this.getRoster();
                        }
                    }
                    else if ($(iq).find('conversation').length) {
                        if (!synchronization_with_stamp) {
                            this.syncFromServer({max: constants.SYNCHRONIZATION_RSM_MAX, after: sync_rsm_after});
                        }
                        else {
                            this.account.get('last_sync') && this.syncFromServer({stamp: this.account.get('last_sync'), max: constants.SYNCHRONIZATION_RSM_MAX}, true);
                        }
                    }
                });
                if (is_first_sync)
                    this.account.cached_sync_conversations.getAllFromCachedConversations((res) => {
                        let synced_conversations = $(iq).find('conversation').map(function () {
                            return $(this).attr('jid') +  '/' + $(this).attr('type');
                        }).toArray();
                        res = res.filter(item => !synced_conversations.includes(item.account_conversation_type))
                        this.syncCachedConversations(res, request_with_stamp, is_first_sync);
                        this.syncConversations(iq, request_with_stamp, is_first_sync);
                        dfd.resolve(true);
                    });
                else{
                    this.syncConversations(iq, request_with_stamp);
                    dfd.resolve();
                }
            },

            getRoster: function () {
                let request_ver = this.roster_version;
                this.account.cached_roster.getAllFromRoster((roster_items) => {
                    // $(roster_items).each((idx, roster_item) => {
                    //     this.contacts.mergeContact(roster_item);
                    // });
                    if (!roster_items.length && request_ver != 0) {
                        this.roster_version = 0;
                    }
                    this.getFromServer();
                });
            },

            getFromServer: function () {
                let iq = $iq({type: 'get'}).c('query', {xmlns: Strophe.NS.ROSTER, ver: this.roster_version});
                this.account.sendIQFast(iq, (iq) => {
                    this.onRosterIQ(iq);
                    this.account.sendPresence();
                    this.account.get('first_sync') && this.syncFromServer({stamp: this.account.get('first_sync'), max: constants.SYNCHRONIZATION_RSM_MAX, last_version_sync: true}, true);
                    this.account.dfd_presence.resolve();
                });
            },

            onRosterIQ: function (iq) {
                let new_roster_version = $(iq).children('query').attr('ver');
                if (iq.getAttribute('type') === 'set') {
                    this.account.sendIQFast($iq({
                        type: 'result', id: iq.getAttribute('id'),
                        from: this.account.jid
                    }));
                }
                else {
                    new_roster_version && (this.roster_version != new_roster_version) && this.account.cached_roster.clearDataBase();
                    if (iq.getAttribute('type') === 'result') {
                        new_roster_version && (this.roster_version = new_roster_version);
                        this.account.save('roster_version', this.roster_version);
                    }
                }
                $(iq).children('query').find('item').each((idx, item) => {
                    this.onRosterItem(item);
                });
                return true;
            },

            onRosterItem: function (item) {
                let jid = item.getAttribute('jid');
                if (jid === this.account.get('jid'))
                    return;
                let contact = this.contacts.mergeContact(jid),
                    subscription = item.getAttribute("subscription"),
                    subscription_preapproved = item.getAttribute("approved"),
                    ask = item.getAttribute("ask");
                if (contact.get('invitation') && (subscription === 'both' || subscription === 'to')) {
                    contact.set('invitation', false);
                    contact.trigger('remove_invite');
                }
                if (subscription === 'remove') {
                    contact.set({
                        in_roster: false,
                        known: false,
                        name: contact.get('jid'),
                        subscription: undefined,
                        subscription_request_out: false
                    });
                    contact.set('subscription_preapproved', false)
                    this.account.cached_roster.removeFromRoster(jid);
                    return;
                }
                let groups = [];
                $(item).find('group').each(function () {
                    let group = $(this).text();
                    groups.indexOf(group) < 0 && groups.push(group);
                });
                let attrs = {
                    subscription: subscription || 'none',
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
                else
                    attrs.subscription_request_out = false;
                attrs.roster_name && (attrs.name = attrs.roster_name);
                this.account.server_features.get(Strophe.NS.SUBSCRIPTION_PREAPPROVAL) && (attrs.subscription_preapproved = subscription_preapproved ? true : subscription_preapproved);
                contact.set(attrs);
                contact.updateCachedInfo();
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
                let image = this.account.cached_image;
                this.$info.find('.circle-avatar').setAvatar(image, this.avatar_size);
            },

            updateColorScheme: function () {
                this.$el.attr('data-color', this.account.settings.get('color'));
            },

            updateExpanded: function () {
                let expanded = this.data.get('expanded');
                this.$el.switchClass('shrank', !expanded);
                this.parent.updateScrollBar();
            },

            updateGroupPosition: function (view) {
                view.$el.detach();
                let index = this.groups.indexOf(view.model);
                if (index === 0) {
                    this.$info.after(view.$el);
                } else {
                    this.$('.roster-group').eq(index - 1).after(view.$el);
                }
                this.parent.updateScrollBar();
            },

            onGroupAdded: function (group) {
                let view = this.addChild(group.get('id'), this.group_view, {model: group});
                this.updateGroupPosition(view);
            },

            onGroupRenamed: function (group, old_name) {
                let view = this.child(old_name);
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
                if (!xabber.change_status_view)
                    xabber.change_status_view = new xabber.ChangeStatusView();
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

            updateCounter: function () {
                let all = this.roster.length,
                    online = all - this.roster.where({status: 'offline'}).length;
                this.$info.find('.counter').text(online + '/' + all);
            },

            updateGlobalCounter: function () {
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
                let count = 0, hashes = {};
                this.$('.roster-contact').each((idx, item) => {
                    let $item = $(item),
                        jid = $item.data('jid'),
                        contact = this.roster.get(jid);
                    if (!contact) return;
                    if (hashes[contact.hash_id]) {
                        $item.addClass('hidden');
                        return;
                    }
                    hashes[contact.hash_id] = true;
                    let name = contact.get('name').toLowerCase(),
                        hide = name.indexOf(query) < 0 && jid.indexOf(query) < 0;
                    $item.hideIf(hide);
                    hide || count++;
                });
                this.$('.roster-account-info-wrap').showIf(count);
            },

            searchAll: function () {
                this.$el.switchClass('shrank', !this.data.get('expanded'));
                this.$('.roster-account-info-wrap').removeClass('hidden');
                this.$('.group-head').removeClass('hidden');
                this.$('.list-item').removeClass('hidden');
            }
        });

        xabber.BlockListView = xabber.BasicView.extend({
            avatar_size: constants.AVATAR_SIZES.CONTACT_BLOCKED_ITEM,
            events: {
                "click .blocked-item": "onTabClick",
                "click .btn-reset-panel": "deselectParticipants",
                "click .btn-remove-selected": "actionSelectedParticipants",
                "click .blocked-contact input": "selectUnblock",
                "click .btn-unblock-selected": "unblockSelected"
            },

            _initialize: function (options) {
                this.account = options.account;
                for (let jid in this.account.blocklist.list) {
                    this.onContactAdded(this.account.blocklist.list[jid], false);
                };
                this.$('.blocked-item:not(.hidden)').first().click().find('a').addClass('active');
                this.hideTabs();
                this.account.contacts.on("add_to_blocklist", this.onContactAdded, this);
                this.account.contacts.on("remove_from_blocklist", this.onContactRemoved, this);
            },

            render: function (options) {
                this.deselectBlocked();
                this.updateIndicator();
                xabber.once("update_css", this.updateIndicator, this);
            },

            updateIndicator: function () {
                this.$('.tabs .indicator').remove();
                this.$('.tabs').tabs();
                this.$('.indicator').addClass('ground-color-500');
            },

            selectUnblock: function (ev) {
                this.updateUnblockButton();
            },

            deselectBlocked: function (ev) {
                this.$('.blocked-contact input').prop('checked', false)
                this.updateUnblockButton();
            },

            updateUnblockButton: function () {
                let has_changes = this.$('.blocked-contact input:checked').length;
                this.parent.$('.btn-unblock-selected').hideIf(!has_changes)
                this.parent.$('.btn-deselect-blocked').hideIf(!has_changes)
                this.parent.$('.btn-block').hideIf(has_changes)
            },

            unblockSelected: function (ev) {
                let selected = this.$('.blocked-contact input:checked').closest('.blocked-contact');
                selected.each((index, item) => {
                    this.unblockContactByJid($(item).attr('data-jid'))
                });
            },

            unblockContactByJid: function (jid) {
                let contact = this.account.contacts.get(jid);
                if (contact)
                    contact.unblock();
                else {
                    this.account.contacts.unblockContact(jid);
                }
            },

            onTabClick: function (ev) {
                let tab = $(ev.target).closest('.blocked-item'),
                    tab_name = $(ev.target).closest('.blocked-item').attr('data-tab-name');
                this.$('.blocked-item a').removeClass('active');
                tab.find('a').addClass('active');
                this.$('.blocked-items-container').addClass('hidden');
                this.$('.' + tab_name).removeClass('hidden');
                this.$('.blocked-contact input').prop('checked', false)
                this.updateUnblockButton();
            },

            hideTabs: function () {
                this.$('.tabs').hideIf(this.$('.blocked-item:not(.hidden)').length === 1)
            },

            hideEmptyContainers: function () {
                let tabs = this.$('.blocked-list:empty');
                tabs.each((idx, item) => {
                    let tab_name = $(item).closest('.blocked-items-container').addClass('hidden').attr('data-tab-name');
                    this.$('.' + tab_name).addClass('hidden').removeClass('tab');
                });
                if (this.$('.blocked-item.hidden .active').length){
                    this.$('.blocked-item:not(.hidden)').first().click().find('a').addClass('active');

                }
                this.hideTabs();
                this.updateUnblockButton();
                this.updateIndicator();
            },

            onContactAdded: function (attrs) {
                let tmp = templates.contact_blocked_item({jid: attrs.jid});
                if (attrs.resource) {
                    this.$('.invitations-item').removeClass('hidden').addClass('tab');
                    this.$('.blocked-invitations-wrap').find('.blocked-invitations').append(tmp);
                }
                else if (attrs.domain) {
                    this.$('.domains-item').removeClass('hidden').addClass('tab');
                    let $domain_wrap = this.$('.blocked-domains-wrap'),
                        $desc = $domain_wrap.find('.blocked-item-description');
                    $domain_wrap.find('.blocked-domains').append(tmp);
                    $desc.text($desc.text() + ($desc.text() ? ', ' : "") + attrs.jid);
                }
                else {
                    this.$('.contacts-item').removeClass('hidden').addClass('tab');
                    this.$('.blocked-contacts-wrap').find('.blocked-contacts').append(tmp);
                    let $desc = this.$('.blocked-contacts-wrap .blocked-item-description');
                    $desc.text($desc.text() + ($desc.text() ? ', ' : "") + attrs.jid);
                }
                this.$('.placeholder').addClass('hidden');
                this.hideTabs();
                this.updateIndicator();
                if (this.$('.blocked-items-container.hidden').length === 3)
                    this.$('.blocked-list:not(:empty)').closest('.blocked-items-container').removeClass('hidden');
                this.isVisible() && this.parent.updateScrollBar();
            },

            onContactRemoved: function (jid) {
                let $elem = this.$(`.blocked-contact[data-jid="${jid}"]`);
                let blocked_list = $elem.closest('.blocked-list'),
                    reg = new RegExp(('\\,\\s' + jid + '|' + jid + '\\,\\s' + '|' + jid)),
                    blocked_contacts_desc = $elem.closest('.blocked-contacts-wrap').showIf(blocked_list.children().length > 1).find('.blocked-item-description'),
                    blocked_domains_desc = $elem.closest('.blocked-domains-wrap').showIf(blocked_list.children().length > 1).find('.blocked-item-description');
                $elem.closest('.blocked-invitations-wrap').showIf(blocked_list.children().length > 1);
                blocked_contacts_desc.text(blocked_contacts_desc.text().replace(reg, ""));
                blocked_domains_desc.text(blocked_domains_desc.text().replace(reg, ""));
                $elem.detach();
                this.$('.placeholder').hideIf(this.account.blocklist.length());
                this.parent.updateScrollBar();
                this.hideEmptyContainers();
            },
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
                let jid = account.get('jid'),
                    view = this.child(jid);
                if (view) {
                    view.$el.detach();
                } else if (account.isConnected()) {
                    view = this.addChild(jid, this.account_roster_view, {account: account});
                } else {
                    return;
                }
                let index = this.model.connected.indexOf(account);
                if (index === 0) {
                    this.$('.contact-list').prepend(view.$el);
                } else {
                    this.$('.contact-list').children().eq(index - 1).after(view.$el);
                }
                this.updateScrollBar();
            },

            updateRosterViews: function () {
                _.each(this.children, function (view) { view.detach(); });
                this.model.each((account) => {
                    let jid = account.get('jid'), view = this.child(jid);
                    view && this.$('.contact-list').append(view.$el);
                });
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
                "click .collapsed-wrap": "expand",
                "mouseleave .expanded-wrap": "collaps"
            },

            __initialize: function () {
                this.updateCounter();
                this.updateTheme();
                this.updateBlur();
                this.updateTransparency();
                this.model.on("activate deactivate destroy", this.updateCounter, this);
                this.data.on("change", this.updateLayout, this);
                let pinned = this._settings.get('pinned');
                this.data.set({expanded: false, pinned: false});
            },

            updateTheme: function (theme) {
                theme = theme || xabber.settings.side_panel.theme;
                this.$el.attr('data-theme', theme);
                this.updateTransparency();
            },

            updateTransparency: function (transparency) {
                transparency = transparency || xabber.settings.side_panel.transparency;
                if (xabber.settings.side_panel.theme == 'dark')
                    this.$el.css('background-color', `rgba(0, 0, 0, ${1 - transparency/100})`);
                else
                    this.$el.css('background-color', `rgba(255, 255, 255, ${1 - transparency/100})`);
            },

            updateBlur: function (blur) {
                blur = _.isUndefined(blur) ? xabber.settings.side_panel.blur : blur;
                this.$el.switchClass('with-blur', blur);
            },

            expand: function () {
                this.data.set('expanded', true);
            },

            collaps: function () {
                if (!this.data.get('pinned'))
                    this.data.set('expanded', false);
            },

            updateLayout: function () {
                let changed = this.data.changed;
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
                let $item = $(item),
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
                let $selection = this.$('.list-item[data-id="'+id+'"]');
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
                    let contact = this.getContactForItem(selection);
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
                this.$el.appendTo(this.parent.$('.settings-subblock-wrap.contact-list'));
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
                this.$el.append('<div class="group-name one-line"/><span class="group-members-count"/>');
            },

            events: {
                "click": "showGroupSettings"
            },

            _initialize: function (options) {
                this.$('.group-name').text(this.model.get('name'));
                this.$('.group-members-count').text(this.model.get('counter').all);
                let index = this.model.collection.indexOf(this.model),
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
            avatar_size: constants.AVATAR_SIZES.SYNCHRONIZE_ACCOUNT_ITEM,

            events: {
                "click .dropdown-content#select-account-for-add-contact": "selectAccount",
                "click .existing-group-field label": "editGroup",
                "change .new-group-name input": "checkNewGroup",
                "keyup .new-group-name input": "checkNewGroup",
                "keyup .name-field #new_contact_username": "checkJid",
                "focusout .name-field #new_contact_username": "focusoutInputField",
                "focusout .new-group-name #new-group-name": "addNewGroup",
                "click .btn-add": "stepForward",
                "click .btn-cancel": "close"
            },

            _initialize: function () {
                this.group_data = new Backbone.Model;
                this.group_data.on("change", this.updateGroups, this);
            },

            render: function (options) {
                if (!xabber.accounts.connected.length) {
                    utils.dialogs.error(xabber.getString("dialog_add_contact__error__text_no_accounts"));
                    return;
                }
                options || (options = {});
                let accounts = options.account ? [options.account] : xabber.accounts.connected,
                    jid = options.jid || '';
                this.$('input[name="username"]').val(jid).attr('readonly', !!jid)
                    .removeClass('invalid');
                this.$('.single-acc').showIf(accounts.length === 1);
                this.$('.multiple-acc').hideIf(accounts.length === 1);
                this.$('.dropdown-content#select-account-for-add-contact').empty();
                _.each(accounts, (account) => {
                    this.$('.dropdown-content#select-account-for-add-contact').append(
                        this.renderAccountItem(account));
                });
                this.$('.account-dropdown-wrap').hideIf(accounts.length < 2)
                this.bindAccount(accounts[0]);
                this.$('span.errors').text('');
                this.$el.openModal({
                    ready: () => {
                        Materialize.updateTextFields();
                        this.$('.account-dropdown-wrap').dropdown({
                            inDuration: 100,
                            outDuration: 100,
                            constrainWidth: false,
                            hover: false,
                            alignment: 'left'
                        });
                        this.$('input[name="username"]').focus();
                    },
                    complete: this.close.bind(this)
                });
                return this;
            },

            bindAccount: function (account) {
                this.account = account;
                this.$('.account-dropdown-wrap .dropdown-button .account-item-wrap')
                    .replaceWith(this.renderAccountItem(account));
                this.renderGroupsForAccount(account);
            },

            stepForward: function () {
                let jid = this.$('input[name=username]').val().trim();
                this.$el.append($(templates.preloader()))
                this.$('.btn-add').addClass('hidden-disabled')
                this.$('input[name=contact_name]').val('');
                if (this.account.connection && this.account.connection.connected) {
                    this.account.getConnectionForIQ().vcard.get(jid, (vcard) => {
                            let username = vcard.username ? vcard.username : vcard.fullname ? vcard.fullname : ''
                            username && this.$('input[name=contact_name]').val(username);
                            this.$('.preloader-wrapper').remove();
                            this.$('.btn-add').removeClass('hidden-disabled');
                            this.addContact()
                        },
                        (err) => {
                            this.$('.preloader-wrapper').remove();
                            this.$('.btn-add').removeClass('hidden-disabled');
                            this.$('input[name=username]').addClass('invalid')
                                .siblings('.errors').text($(err).find('error text').text());
                        });
                }
            },

            renderAccountItem: function (account) {
                let $item = $(templates.add_contact_account_item({jid: account.get('jid'), name: account.get('name')}));
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
                let selected = this.group_data.get('selected');
                this.$('.groups').html(templates.groups_checkbox_list_contact({
                    groups: _.map(this.group_data.get('groups'), function (name) {
                        return { name: name, id: uuid(), checked: _.contains(selected, name) };
                    })
                }));
            },

            selectAccount: function (ev) {
                let $item = $(ev.target).closest('.account-item-wrap'),
                    account = xabber.accounts.get($item.data('jid'));
                this.bindAccount(account);
            },

            editGroup: function (ev) {
                ev.preventDefault();
                let $target = $(ev.target),
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
                let name = $(ev.target).val(),
                    $checkbox = this.$('.new-group-checkbox #new_group_checkbox');
                $checkbox.prop('disabled', !(name && !_.contains(this.group_data.get('groups'), name)));
                if (ev.keyCode === constants.KEY_ENTER)
                    this.addNewGroup();
            },

            addNewGroup: function (ev) {
                ev && ev.preventDefault();
                if (this.$('.new-group-checkbox #new_group_checkbox').prop('disabled'))
                    return;
                let $input = this.$('.new-group-name input'),
                    name = $input.val(),
                    groups = _.clone(this.group_data.get('groups')),
                    idx = groups.indexOf(name);
                if (idx < 0) {
                    let selected = _.clone(this.group_data.get('selected'));
                    selected.push(name);
                    groups.push(name);
                    this.group_data.set({groups: groups, selected: selected});
                }
            },

            focusoutInputField: function () {
                if (!this.$('input[name=username]').val().trim()) {
                    this.$('input[name=username]').removeClass('invalid');
                    this.$('span.errors').text('').addClass('hidden');
                }
            },

            checkJid: function (ev) {
                let jid = this.$('input[name=username]').val().trim(),
                    error_text,
                    regexp_full_jid = /^(([^<>()[\]\\.,;:\s%@\"]+(\.[^<>()[\]\\.,;:\s%@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([^<>()[\]\\.,;:\s%@\"]+(\.[^<>()[\]\\.,;:\s%@\"]+)*)|(\".+\"))|(([0-9]{1,3}\.){3}[0-9]{1,3})|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
                if (!regexp_full_jid.test(jid) && jid) {
                    error_text = xabber.getString("dialog_add_contact__error__text_invalid_jid");
                }
                if (error_text) {
                    this.$('input[name=username]').addClass('invalid')
                        .siblings('.errors').text(error_text);
                }
                else {
                    this.$('input[name=username]').removeClass('invalid');
                    this.$('span.errors').text('').addClass('hidden');
                    if (ev.keyCode === constants.KEY_ENTER)
                        this.stepForward();
                }
            },

            addContact: function () {
                this.$('span.errors').text('').addClass('hidden');
                let jid = this.$('input[name=username]').removeClass('invalid').val().trim(),
                    name = this.$('input[name=contact_name]').removeClass('invalid').val(),
                    groups = this.group_data.get('selected'),
                    contact, error_text,
                    regexp = /^(([^<>()[\]\\.,;:\s%@\"]+(\.[^<>()[\]\\.,;:\s%@\"]+)*)|(\".+\"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
                if (jid)
                    jid = jid.toLowerCase()
                jid = Strophe.getBareJidFromJid(jid);
                if (!jid) {
                    error_text = xabber.getString("dialog_add_contact__error__text_input_username");
                } else if (jid === this.account.get('jid')) {
                    error_text = xabber.getString("dialog_add_contact__error__text_can_not_add_youself");
                } else if (!regexp.test(jid)) {
                    error_text = xabber.getString("dialog_add_contact__error__text_invalid_jid");
                }
                else {
                    contact = this.account.contacts.mergeContact(jid);
                    if (contact.get('in_roster')) {
                        error_text = xabber.getString("dialog_add_contact__error__text_already_in_roster");
                    }
                }
                if (error_text) {
                    this.$('input[name=username]').addClass('invalid')
                        .siblings('.errors').text(error_text);
                } else {
                    !this.account.server_features.get(Strophe.NS.SUBSCRIPTION_PREAPPROVAL) && contact.set('subscription_preapproved', true);
                    contact.pres('subscribed');
                    contact.pushInRoster({name: name, groups: groups}, () => {
                        contact.pres('subscribe');
                        contact.trigger('presence', contact, 'subscribe_from');
                        contact.trigger("open_chat", contact);
                    }, function () {
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

            defaults: function () {
                let general_group_name = xabber.getString("circles__name_general_circle"),
                    non_roster_group_name = xabber.getString("circles__name_non_roster_circle");
                return {
                    pinned: false,
                    show_offline: 'yes',
                    sorting: 'online-first',
                    general_group_name,
                    non_roster_group_name
                };
            }
        });

        xabber.CachedRoster = Backbone.ModelWithDataBase.extend({
            putInRoster: function (value, callback) {
                this.database.put('roster_items', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            getFromRoster: function (value, callback) {
                this.database.get('roster_items', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            getAllFromRoster: function (callback) {
                this.database.get_all('roster_items', null, function (response_value) {
                    callback && callback(response_value || []);
                });
            },

            removeFromRoster: function (value, callback) {
                this.database.remove('roster_items', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            clearDataBase: function () {
                this.database.clear_database('roster_items');
            }
        });

        xabber.CachedSyncСonversations = Backbone.ModelWithDataBase.extend({
            putInCachedConversations: function (value, callback) {
                this.database.put('conversation_items', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            getFromCachedConversations: function (value, callback) {
                this.database.get('conversation_items', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            getAllFromCachedConversations: function (callback) {
                this.database.get_all('conversation_items', null, function (response_value) {
                    callback && callback(response_value || []);
                });
            },

            removeFromCachedConversations: function (value, callback) {
                this.database.remove('conversation_items', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            clearDataBase: function () {
                this.database.clear_database('conversation_items');
            }
        });

        xabber.CachedServerFeatures = Backbone.ModelWithDataBase.extend({
            putInCachedFeatures: function (value, callback) {
                this.database.put('server_features_items', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            getFromCachedFeatures: function (value, callback) {
                this.database.get('server_features_items', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            getAllFromCachedFeatures: function (callback) {
                this.database.get_all('server_features_items', null, function (response_value) {
                    callback && callback(response_value || []);
                });
            },

            removeFromCachedFeatures: function (value, callback) {
                this.database.remove('server_features_items', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            clearDataBase: function () {
                this.database.clear_database('server_features_items');
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
            this.cached_sync_conversations = new xabber.CachedSyncСonversations(null, {
                name:'cached-conversation-list-' + this.get('jid'),
                objStoreName: 'conversation_items',
                primKey: 'account_conversation_type'
            });
            this.cached_server_features = new xabber.CachedServerFeatures(null, {
                name:'cached-features-list-' + this.get('jid'),
                objStoreName: 'server_features_items',
                primKey: 'var'
            });

            this.groupchat_settings = new xabber.GroupChatSettings({id: 'group-chat-settings'}, {
                account: this,
                storage_name: xabber.getStorageName() + '-group-chat-settings-' + this.get('jid'),
                fetch: 'after'
            });
            this.groups = new xabber.Groups(null, {account: this});
            this.contacts = new xabber.Contacts(null, {account: this});
            this.contacts.addCollection(this.roster = new xabber.Roster(null, {account: this}));
            this.blocklist = new xabber.BlockList(null, {account: this});

            this._added_pres_handlers.push(this.contacts.handlePresence.bind(this.contacts));

            this.on("ready_to_get_roster", function () {
                this.resources.reset();
                this.contacts.each(function (contact) {
                    contact.resources.reset();
                    contact.resetStatus();
                });
                this.cached_roster.getAllFromRoster((roster_items) => {
                    $(roster_items).each((idx, roster_item) => {
                        this.contacts.mergeContact(roster_item);
                    });
                    if (this.connection && this.connection.do_synchronization && xabber.chats_view) {
                        let options = {},
                            last_sync_timestamp = this.settings && this.settings.get('last_sync_timestamp') ? this.settings.get('last_sync_timestamp') : null
                        !this.roster.last_chat_msg_id && (options.max = constants.SYNCHRONIZATION_RSM_MAX);
                        last_sync_timestamp && (options.stamp = last_sync_timestamp);
                        this.roster.syncFromServer(options, Boolean(last_sync_timestamp), true);
                    }
                    else {
                        this.roster.getRoster();
                    }
                    this.blocklist.getFromServer();
                });
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
            this.contacts_view = this.left_panel.addChild('contacts', this.RosterLeftView,
                {model: this.accounts});
            this.roster_view = this.body.addChild('roster', this.RosterRightView,
                {model: this.accounts});
            this.contact_container = this.right_panel.addChild('details', this.Container);
            this.details_container = this.right_contact_panel.addChild('details', this.Container);
            this.contact_placeholder = this.right_contact_panel.addChild('contact_placeholder',
                this.ContactPlaceholderView);
            this.add_contact_view = new this.AddContactView();
            this.on("add_contact", function () {
                this.add_contact_view.show();
            }, this);
        }, xabber);

        return xabber;
    };
});
