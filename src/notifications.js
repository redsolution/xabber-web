import xabber from "xabber-core";

let env = xabber.env,
    constants = env.constants,
    templates = env.templates.notifications,
    utils = env.utils,
    $ = env.$,
    $iq = env.$iq,
    $msg = env.$msg,
    Strophe = env.Strophe,
    _ = env._,
    moment = env.moment,
    uuid = env.uuid,
    pretty_date = (timestamp) => { return utils.pretty_date(timestamp, (xabber.settings.language == 'ru-RU' || xabber.settings.language == 'default' && xabber.get("default_language") == 'ru-RU') && 'dddd, D MMMM YYYY')},
    pretty_datetime = (timestamp) => { return utils.pretty_datetime(timestamp, (xabber.settings.language == 'ru-RU' || xabber.settings.language == 'default' && xabber.get("default_language") == 'ru-RU') && 'D MMMM YYYY HH:mm:ss')};


xabber.NotificationsBodyContainer = xabber.Container.extend({
    className: 'notifications-body-container',
});

xabber.NotificationsView = xabber.BasicView.extend({
    className: 'notifications-content-wrap',
    template: templates.notifications_view,
    // ps_selector: '.notifications-content',
    avatar_size: constants.AVATAR_SIZES.SYNCHRONIZE_ACCOUNT_ITEM,

    events: {
        "click .notifications-account-filter-content .filter-item-wrap": "selectAccount",
        "click .cancel-session": "cancelTrustSession",
        "click .enter-code": "enterCode",

    },

    _initialize: function () {
        this.notifications_chats = [];
        xabber.accounts.on("list_changed connected_list_changed notification_chat_created account_color_updated add change:enabled destroy", this.updateAccountsFilter, this);
        return this;
    },

    render: function (options) {
        // console.log(options);
        this.updateAccountsFilter();
    },

    onShowNotificationsTab: function () {
        if (!this.account || !this.account.omemo){
            return;
        }
        if (this.current_content){
            this.current_content.onShowNotificationsTab();
        }
    },

    cancelTrustSession: function (ev) {
        if (!this.account || !this.account.omemo)
            return;
        let $item = $(ev.target).closest('.notification-trust-session');
        if ($item.attr('data-sid')){
            this.account.omemo.xabber_trust && this.account.omemo.xabber_trust.cancelSession($item.attr('data-sid'), $item.attr('data-jid'))
        }
    },

    enterCode: function (ev) {
        if (!this.account || !this.account.omemo)
            return;
        let $item = $(ev.target).closest('.notification-trust-session');
        if ($item.attr('data-sid')){
            this.account.omemo.xabber_trust && this.account.omemo.xabber_trust.handleAcceptedMsgBySid($item.attr('data-sid'))
        }
    },

    updateAccountsFilter: function () {
        let accounts = xabber.accounts.enabled;
        // console.log(accounts.length);
        accounts = accounts.filter(item => item.server_features.get(Strophe.NS.XABBER_NOTIFY));
        // console.log(accounts.length);
        this.$('.notifications-account-filter').switchClass('hidden', accounts.length === 1 || !accounts.length);
        if (accounts.length){
            //     jid = options.jid || '';
            // this.$('input[name="username"]').val(jid).attr('readonly', !!jid)
            //     .removeClass('invalid');
            // this.$('.single-acc').showIf(accounts.length === 1);
            // this.$('.multiple-acc').hideIf(accounts.length === 1);
            try{
                this.$('.notifications-account-filter-content').empty();
                _.each(accounts, (account) => {
                    this.$('.notifications-account-filter-content').append(this.renderAccountItem(account));
                });
                this.$('.notifications-account-filter-content .filter-item-wrap').first().addClass('selected-filter');
                this.account = accounts[0];

                // this.$('.account-dropdown-wrap').dropdown({
                //     inDuration: 100,
                //     outDuration: 100,
                //     constrainWidth: false,
                //     hover: false,
                //     alignment: 'left'
                // });
                this.updateCurrentNotifications();
            } catch (e) {
                console.error(e)
            }
        } else {
            // if no accounts
            // console.log(xabber.accounts.enabled.length);
            // console.log(xabber.body.screen.get('name') === 'notifications');
            if (!xabber.accounts.enabled.length){
                if (xabber.body.screen.get('name') === 'notifications'){
                    xabber.toolbar_view.showAllChats(null, true);
                } else if (xabber.body.screen.get('previous_screen') && xabber.body.screen.get('previous_screen').name === 'notifications') {
                    this.$el.detach();
                    xabber.toolbar_view.$('.toolbar-item:not(.account-item):not(.toolbar-logo)').removeClass('active');
                    let previous_chat = xabber.body.screen.get('previous_screen');
                        previous_chat.open_all_chats = true;
                    xabber.body.screen.set('previous_screen', previous_chat);
                }
            }
        }
    },

    renderAccountItem: function (account) {
        let $item = $(templates.account_filter_item({jid: account.get('jid'), color: account.settings.get('color')}));
        return $item;
    },

    selectAccount: function (ev) {

        let $item = $(ev.target).closest('.filter-item-wrap');
        if (!$item.attr('data-jid')) {
            $item.remove();
            return;
        }
        this.$('.notifications-account-filter-content .filter-item-wrap').removeClass('selected-filter');
        $item.addClass('selected-filter');
        // console.log($item);
        // console.log($item.attr('data-jid'));
        this.account = xabber.accounts.connected.filter(item => item.get('jid') === $item.attr('data-jid'));
        if (this.account.length){
            this.account = this.account[0];
            this.updateCurrentNotifications();
        }
    },

    updateCurrentNotifications: function () {
        let content;
        // console.log(this.account);
        // console.log(this.account.get('jid'));
        if (this.account){
            if (!xabber.accounts.enabled.length || !xabber.accounts.connected.length)
                return;
            let chat = this.account.chats.filter(item => item.get('jid') === this.account.server_features.get(Strophe.NS.XABBER_NOTIFY).get('from') && item.get('notifications'));
            if (chat.length){
                chat = chat[0];
            }
            // console.log(chat);
            if (!chat || !chat.item_view){
                console.log('no chat!');
                return;
            }
            // console.log(this.notifications_chats.some(item => item.model.get('jid') === this.account.server_features.get(Strophe.NS.XABBER_NOTIFY).get('from')));
            if (!this.notifications_chats.some(item => item.account.get('jid') === chat.account.get('jid'))){
                content = new xabber.NotificationsChatContentView({chat_item: chat.item_view});
                this.account.notifications_content = content;
                this.notifications_chats.push(content);
                content.data.set('notification_content', true);
                // console.log(content);
            } else {
                content = this.notifications_chats.filter(item => item.account.get('jid') === chat.account.get('jid'));
                if (content.length)
                    content = content[0];
                // console.log(content);
            }
            // console.log(this.notifications_chats);
            //
            // console.log(content);
            if (content){
                // console.log(content.$el);
                // console.log(this);
                // console.log(this.current_content);
                if (this.current_content){
                    if (this.current_content.account.get('jid') === content.account.get('jid')){
                        return;
                    }
                    this.current_content.hide();
                }
                this.$('.notifications-content').html('');
                this.current_content = content;
                this.current_content.show();
            }
        }
    },
});

xabber.NotificationsChatContentView = xabber.ChatContentView.extend({

    onShow: function (attrs) {
        // console.log(attrs);
        xabber.notifications_view.$('.notifications-content').append(this.$el);
        this.onScroll();
        if (!this.$('.chat-content .notification-sessions-wrap').length){
            this.addTrustSessionsContainer()
        }
    },

    isVisible: function () {
        let is_visible = false;
        if (xabber.notifications_view && xabber.notifications_view.current_content && xabber.notifications_view.current_content.account.get('jid') === this.account.get('jid')){
            if (xabber.notifications_body.data.get('visible')){
                is_visible = true;
            }
        }
        return is_visible;
    },

    onHide: function (attrs) {
        // console.log(attrs);
        this.$el.detach();

    },

    updateCounter: function () {
        return;
    },

    onShowNotificationsTab: function () {
        let unread_count_sync = this.model.get('const_unread');
        if (unread_count_sync){
            this.model.set('const_unread', 0);

            if (this.model.get('unread'))
                this.readMessages();
            unread_count_sync--;
            for (let step = 0; step < unread_count_sync; step++) {
                let read_messages = this.$('.chat-message:not(.unread-message-background)');
                if (read_messages.length){
                    read_messages.first().addClass('unread-message-background');
                }
            }

        }
    },

    readVisibleMessages: function (is_context) {
        let self = is_context ? this.model.messages_view : this;
        if (!self.isVisible())
            return;
        if (self.$('.chat-message.unread-message').length && xabber.get('focused') && !xabber.get('idle')){
            let first_visible_unread_msg;
            self.$('.chat-message.unread-message').each((idx, msg) => {
                if ($(msg).isVisibleInContainer(self.$('.chat-content'))) {
                    first_visible_unread_msg = msg;
                    return false;
                }
            });
            if (first_visible_unread_msg){
                this.readMessage(this.model.messages.get($(first_visible_unread_msg).data('uniqueid')), $(first_visible_unread_msg), is_context);
            }
        }
    },

    onChangedReadState: function (message) {
        let is_unread = message.get('is_unread'),
            is_synced = message.get('synced_from_server'),
            is_unread_archived = message.get('is_unread_archived'),
            is_missed_msg = message.get('missed_msg'),
            $msg = this.$(`.chat-message[data-uniqueid="${message.get("unique_id")}"]`);
        if (is_unread) {
            if (!is_unread_archived && !is_synced && !is_missed_msg)
                this.model.messages_unread.add(message);
            if (!message.get('was_readen')){
                $msg.addClass('unread-message');
                $msg.addClass('unread-message-background');
            }
            this.model.recountUnread();
        } else {
            if ((!is_unread_archived && !is_synced && !is_missed_msg) || this.model.messages_unread.indexOf(message) > -1)
                this.model.messages_unread.remove(message);
            message.set('was_readen', true);
            $msg.removeClass('unread-message');
            // setTimeout(() => {
            //     $msg.removeClass('unread-message-background');
            // }, 1000);
            this.model.recountUnread();
            if (!message.get('muted')) {
                xabber.recountAllMessageCounter();
            }
            if (message.get('ephemeral_timer')) {
                message.set('displayed_time', new Date());
                message.collection.checkEphemeralTimers();
            }
        }
    },

    readMessage: function (last_visible_msg, $last_visible_msg, is_context) {
        clearTimeout(this._read_last_message_timeout);
        this._read_last_message_timeout = setTimeout(() => {
            this.model.sendMarker(last_visible_msg.get('msgid'), 'displayed', last_visible_msg.get('stanza_id'), last_visible_msg.get('contact_stanza_id'), last_visible_msg.get('encrypted') && last_visible_msg.get('ephemeral_timer'));
            this.model.set('last_read_msg', last_visible_msg.get('stanza_id'));
            this.model.set('prev_last_read_msg', last_visible_msg.get('stanza_id'));

            if (is_context){
                let unread_context_messages = _.clone(this.account.context_messages.models).filter(item => Boolean(item.get('is_unread')) || Boolean(item.get('is_unread_archived')));
                _.each(unread_context_messages, (msg) => {
                    let msg_item = this.model.messages.find(message => message.get('stanza_id') == msg.get('stanza_id') || message.get('contact_stanza_id') == msg.get('stanza_id'));
                    if (msg_item) {
                        msg.set('is_unread', msg_item.get('is_unread'));
                        msg.set('is_unread_archived', msg_item.get('is_unread_archived'));
                    }
                });
                // setTimeout(() => {
                //     $last_visible_msg.removeClass('unread-message-background');
                // }, 1000);
            }

            xabber.toolbar_view.recountAllMessageCounter();
        }, 1000);

        if (last_visible_msg.get('is_unread_archived') || this.model.last_message && (last_visible_msg.get('unique_id') === this.model.last_message.get('unique_id')) || this.model.get('const_unread')){
            let unread_messages = _.clone(this.model.messages.models).filter(item => Boolean(item.get('is_unread'))),
                read_count = 0;

            _.each(unread_messages, (msg) => {
                if (msg.get('timestamp') <= last_visible_msg.get('timestamp')) {
                    msg.set('is_unread', false);
                    read_count++;
                }
            });
            read_count = this.model.get('const_unread') - read_count;
            (read_count < 0) && (read_count = 0);
            this.model.set('unread', 0);
            this.model.set('const_unread', read_count);
        } else {
            let unread_messages = _.clone(this.model.messages_unread.models);
            _.each(unread_messages, (msg) => {
                if (msg.get('timestamp') <= last_visible_msg.get('timestamp')) {
                    msg.set('is_unread', false);
                }
            });
        }
        xabber.toolbar_view.recountAllMessageCounter();

        // if (!is_context){
        //     setTimeout(() => {
        //         $last_visible_msg.removeClass('unread-message-background');
        //     }, 1000);
        // }
    },

    removeMessage: function (item) {
        let message, $message, $message_in_chat;
        if (item instanceof xabber.Message) {
            message = item;
            $message_in_chat = this.$(`.chat-message[data-uniqueid="${item.get('unique_id')}"]`);
            (this.bottom.content_view) && ($message = this.bottom.content_view.$(`.chat-message[data-uniqueid="${item.get('unique_id')}"]`));
        } else {
            $message = item;
            if (!$message.length) return;
            message = this.model.messages.get($message.data('uniqueid'));
        }
        message && message.destroy();
        if ($message_in_chat) {
            this.removeMessageFromDOM($message_in_chat);
        }
        if ($message && ($message !== $message_in_chat))
            this.removeMessageFromDOM($message);
    },

    addTrustSessionsContainer: function () {
        this.$('.chat-content').prepend($(templates.current_verification_sessions()));
        if (this.account.omemo && this.account.omemo.xabber_trust) {
            this.updateAllTrustSessions();
        }
    },

    updateAllTrustSessions: function () {
        let active_sessions = this.account.omemo.xabber_trust.get('active_trust_sessions');
        this.$(`.notification-trust-session`).remove();

        Object.keys(active_sessions).forEach((session_id) => {
            let session = active_sessions[session_id];

            let state = this.account.omemo.xabber_trust.getVerificationState(session);

            let item = {
                jid: null,
                device_id: null,
                sid: session_id,
                state: state,
                code: session.active_verification_code,
                is_enter_code: null,
            };
            if (session.active_verification_device) {
                item.jid = session.active_verification_device.peer_jid;
                item.device_id = session.active_verification_device.device_id;
            }
            if (session.verification_step === '1a' && session.verification_accepted_msg_xml) {
                item.is_enter_code = true;
            }

            this.$('.notification-sessions-wrap').append($(templates.verification_session(item)));
        });
    },

    updateTrustSession: function (session_id, is_remove) {
        let active_sessions = this.account.omemo.xabber_trust.get('active_trust_sessions');

        let session = active_sessions[session_id];
        this.$(`.notification-trust-session[data-sid="${session_id}"]`).remove();
        if (is_remove){
            return;
        }
        let state = this.account.omemo.xabber_trust.getVerificationState(session);

        let item = {
            jid: null,
            device_id: null,
            sid: session_id,
            state: state,
            code: session.active_verification_code,
            is_enter_code: null,
        };
        if (session.active_verification_device) {
            item.jid = session.active_verification_device.peer_jid;
            item.device_id = session.active_verification_device.device_id;
        }
        if (session.verification_step === '1a' && session.verification_accepted_msg_xml) {
            item.is_enter_code = true;
        }

        this.$('.notification-sessions-wrap').prepend($(templates.verification_session(item)));
    },

    addMessage: function (message) {
        let $message = this.buildMessageHtml(message),
            index = this.model.messages.indexOf(message);
        if (index === 0) {
            // if (this.$('.chat-content .notification-sessions-wrap').length){
            //     $message.insertAfter(this.$('.chat-content .notification-sessions-wrap'));
            // } else {
                $message.appendTo(this.$('.chat-content'));
            // }
        } else if (this.model.messages.models.length && this.model.messages.models[index - 1]) {
            let $prev_message = this.$(`.chat-message[data-uniqueid="${this.model.messages.models[index - 1].get('unique_id')}"]`);
            if (!$prev_message.length) {
                $prev_message = this.addMessage(this.model.messages.models[index - 1]);
            }
            $message.insertBefore($prev_message);
        }
        let $next_message = $message.nextAll('.chat-message').first();
        this.updateMessageInChat($message[0], message);
        this.updateNotificationDate($message[0], message);
        if ($next_message.length) {
            this.updateMessageInChat($next_message[0]);
        }
        this.initPopup($message);
        this.bottom.showChatNotification();
        return $message;
    },

    updateNotificationDate: function (msg_elem, msg) {
        let $msg = $(msg_elem);
        // $msg.find('.msg-time').text(xabber.getString("time_since_with_time", [utils.pretty_time_since($msg.data('time')), utils.pretty_time($msg.data('time'))]));
        $msg.find('.msg-time').text(pretty_datetime($msg.data('time')));
    },

    scrollToUnreadWithButton: function () {
        this.backToBottom();
    },

    scrollToBottom: function (forced) {
        if (!forced){
            this.scrollToTop();
            return;
        }
        let scrollHeight = this.ps_container[0].scrollHeight,
            offsetHeight = this.ps_container[0].offsetHeight;
        this.scrollTo(scrollHeight - offsetHeight);
    },

    backToBottom: function () {
        // this.model.set('last_sync_unread_id', undefined);
        // this.hideMessagesAfterSkipping();
        // this._no_scrolling_event = true;
        // this.removeAllMessagesExceptLast();
        // this.readMessages();
        // this.model.resetUnread();
        // this.model.set('history_loaded', false);
        // this.loadPreviousHistory(true, true);
        // this._long_reading_timeout = false;
        // this._no_scrolling_event = false;
        this.scrollToTop();
    },

    loadPreviousHistory: function (no_before, is_scrollToTop) {
        console.error('load');
        if (this.contact) {
            if (!xabber.settings.load_history || (!this.contact.get('subscription') || this.contact.get('subscription') !== 'both') && this.contact.get('group_chat')) {
                return;
            }
        }
        let before = this.model.get('first_archive_id') || '';
        if (no_before)
            before = '';
        this.getMessageArchive({
                fast: true,
                max: xabber.settings.mam_messages_limit,
                before: before
            },
            {
                previous_history: true,
                is_scrollToTop: is_scrollToTop
            });
    },

    // scrollToUnread: function () { // change it for inverted
    //     let $last_read_msg = this.$(`.chat-message.unread-message:first`);
    //     $last_read_msg.length && (this.scrollTo(this.getScrollTop()
    //         - (this.$el.height() * 0.2) + $last_read_msg.offset().top));
    //     if (this.model.get('last_sync_unread_id')) {
    //         let mam_query = {
    //             fast: true,
    //             max: xabber.settings.mam_messages_limit,
    //             after: this.model.get('last_sync_unread_id'),
    //         };
    //         if (this.model.get('synced_msg')) {
    //             mam_query.var = [
    //                 {var: 'after-id', value: this.model.get('last_sync_unread_id')},
    //                 {var: 'before-id', value: this.model.get('synced_msg').get('stanza_id')},
    //             ];
    //         }
    //         this.getMessageArchive(mam_query, {
    //             unread_history: true,
    //         });
    //     }
    // },

    onScrollY: function () {
        this._prev_scrolltop = this._scrolltop || this._prev_scrolltop || 0;
        this._scrolltop = this.getScrollTop() || this._scrolltop || this._prev_scrolltop || 0;
        this._is_scrolled_bottom = this.isScrolledToBottom();// mb
        if (this._scrolltop === 0 && this.$('.subscription-buttons-wrap').hasClass('hidden')) {
            this.$('.fixed-day-indicator-wrap').css('opacity', 1);
            this.current_day_indicator = pretty_date(parseInt(this.$('.chat-content').children().first().data('time')));
            this.showDayIndicator(this.current_day_indicator);
        }
        this.$('.back-to-bottom').hideIf(this.isScrolledToTop());
    },

    onScroll: function (ev, is_focused) {
        if (this._no_scrolling_event)
            return;
        this.$('.back-to-bottom').hideIf(this.isScrolledToTop());
        // let $chatday_indicator = this.$('.chat-day-indicator'),
        //     $messages = this.$('.chat-message'),
        //     indicator_idx = undefined,
        //     opacity_value;
        // if (this.$('.unread-marker').length) {
        //     let marker = this.$('.unread-marker');
        //     if (marker[0].offsetTop < this._scrolltop)
        //         marker.remove();
        // }
        // $chatday_indicator.each((idx, indicator) => {
        //     if (this.$('.subscription-buttons-wrap').hasClass('hidden')) {
        //         if (this._scrolltop < this._prev_scrolltop) {
        //             if ((indicator.offsetTop <= this._scrolltop) && (indicator.offsetTop >= this._scrolltop - 30)) {
        //                 indicator_idx = idx;
        //                 opacity_value = 0;
        //                 return false;
        //             }
        //             if ((indicator.offsetTop >= this._scrolltop) && (indicator.offsetTop <= this._scrolltop - 30)) {
        //                 indicator_idx = idx && (idx - 1);
        //                 opacity_value = 1;
        //                 return false;
        //             }
        //         }
        //         else {
        //             if ((indicator.offsetTop <= this._scrolltop + 30) && (indicator.offsetTop >= this._scrolltop)) {
        //                 indicator_idx = idx && (idx - 1);
        //                 opacity_value = 0;
        //                 return false;
        //             }
        //             if ((indicator.offsetTop >= this._scrolltop - 30) && (indicator.offsetTop <= this._scrolltop)) {
        //                 indicator_idx = idx;
        //                 opacity_value = 1;
        //                 return false;
        //             }
        //         }
        //     }
        //     else if (!$(indicator).hasClass('fixed-day-indicator-wrap')) {
        //         if (this._scrolltop < this._prev_scrolltop) {
        //             if ((indicator.offsetTop >= this._scrolltop + 30) && (indicator.offsetTop <= this._scrolltop + 62)) {
        //                 indicator_idx = idx;
        //                 opacity_value = 0;
        //                 return false;
        //             }
        //             if ((indicator.offsetTop >= this._scrolltop) && (indicator.offsetTop <= this._scrolltop + 62)) {
        //                 indicator_idx = idx;
        //                 opacity_value = 1;
        //                 return false;
        //             }
        //         }
        //         else {
        //             if ((indicator.offsetTop <= this._scrolltop + 62) && (indicator.offsetTop >= this._scrolltop + 30)) {
        //                 indicator_idx = idx && (idx - 1);
        //                 opacity_value = 0;
        //                 return false;
        //             }
        //             if ((indicator.offsetTop >= this._scrolltop - 62) && (indicator.offsetTop <= this._scrolltop + 30)) {
        //                 indicator_idx = idx;
        //                 opacity_value = 1;
        //                 return false;
        //             }
        //         }
        //     }
        // });
        // if (indicator_idx) {
        //     this.$('.fixed-day-indicator-wrap').css('opacity', opacity_value);
        //     this.current_day_indicator = pretty_date(parseInt($($chatday_indicator[indicator_idx]).attr('data-time')));
        // }
        // else {
        //     $messages.each((idx, msg) => {
        //         if ((msg.offsetTop + $(msg).height() > this._scrolltop) && (msg.offsetTop < this._scrolltop)) {
        //             indicator_idx = idx;
        //             opacity_value = 1;
        //             return false;
        //         }
        //     });
        //     if (indicator_idx) {
        //         this.$('.fixed-day-indicator-wrap').css('opacity', opacity_value);
        //         this.current_day_indicator = pretty_date(parseInt($($messages[indicator_idx]).attr('data-time')));
        //     }
        //     else if (!this.$('.subscription-buttons-wrap').hasClass('hidden') && this._scrolltop == 0){
        //         opacity_value = 0;
        //         this.$('.fixed-day-indicator-wrap').css('opacity', opacity_value);
        //     }
        // }
        // if (this.current_day_indicator !== null) {
        //     this.showDayIndicator(this.current_day_indicator);
        // }
        let scroll_read_timer = this._long_reading_timeout || is_focused ? 100 : 100;
        clearTimeout(this._onscroll_read_messages_timeout);
        this._onscroll_read_messages_timeout = setTimeout(() => {
            this.readVisibleMessages();
        }, scroll_read_timer);
        this._long_reading_timeout = false;
        if (this._scrolltop > this._prev_scrolltop &&
            (this.getPercentScrolled() > 0.8)) {
            this.loadPreviousHistory();
        }
        this.hideMessagesAfterSkipping();
        if (this._scrolltop < this._prev_scrolltop && this.model.get('last_sync_unread_id') && this.getPercentScrolled() < 0.2) {
            let mam_query = {
                fast: true,
                max: xabber.settings.mam_messages_limit,
                after: this.model.get('last_sync_unread_id'),
            };
            if (this.model.get('synced_msg')) {
                mam_query.var = [
                    {var: 'after-id', value: this.model.get('last_sync_unread_id')},
                    {var: 'before-id', value: this.model.get('synced_msg').get('stanza_id')},
                ];
            }
            this.getMessageArchive(mam_query, {
                unread_history: true,
            });
        }
    },

    onMouseWheel: function (ev) {
        if (ev.originalEvent.deltaY > 0)
            this.loadPreviousHistory();
        this.$('.back-to-bottom').hideIf(this.isScrolledToTop());
    },

    onChangedMessageTimestamp: function (message) {
        let $message = this.$(`.chat-message[data-uniqueid="${message.get('unique_id')}"]`),
            $next_msg = $message.next(),
            $old_prev_msg = $message.prev();
        $message.attr({
            'data-time': message.get('timestamp')
        });
        $message.detach();
        $message.children('.right-side').find('.msg-time').attr({title: pretty_datetime(message.get('time'))}).text(utils.pretty_time(message.get('time')));
        message.get('user_info') && $message.attr('data-from-id', message.get('user_info').id);
        this.model.messages.sort();
        let index = this.model.messages.indexOf(message);
        if (index === 0) {
            if ($old_prev_msg.hasClass('chat-day-indicator'))
                $old_prev_msg.after($message);
            else
                $message.prependTo(this.$('.chat-content'));
        } else {
            let $prev_msg = this.$('.chat-message').eq(index - 1),
                is_same_sender = ($message.data('from') === $prev_msg.data('from')),
                is_same_date = moment($message.data('time')).startOf('day')
                    .isSame(moment($prev_msg.data('time')).startOf('day'));
            if (($old_prev_msg.data('from') !== $message.data('from')) && ($next_msg.data('from') === $message.data('from')) && (($next_msg.children('.right-side').find('.msg-delivering-state').attr('data-state') === 'delivered') || ($next_msg.children('.right-side').find('.msg-delivering-state').attr('data-state') === 'displayed')))
                this.showMessageAuthor($next_msg);
            if ($prev_msg.next().hasClass('chat-day-indicator') && (moment($prev_msg.next().data('time')).format('DD.MM.YY') === moment(message.get('timestamp')).format('DD.MM.YY'))) {
                $message.insertAfter($prev_msg.next());
                this.showMessageAuthor($message);
            }
            else
                $message.insertAfter($prev_msg);
            if (message.get('data_form') || message.get('forwarded_message') || !is_same_date || !is_same_sender || $prev_msg.hasClass('system') || $prev_msg.hasClass('saved-main'))
                this.showMessageAuthor($message);
            else
                this.hideMessageAuthor($message);
        }
        let last_message = this.model.last_message;
        if (!last_message || message.get('timestamp') > last_message.get('timestamp')) {
            this.model.last_message = message;
            this.chat_item.updateLastMessage();
        }
    },

});


xabber.once("start", function () {

    !this.notifications_view && (this.notifications_view = new xabber.NotificationsView());

    this.on("change:focused", function () {
        if (this.get('focused')) {
            let view = this.notifications_view.current_content;
            if (view && view.data.get('visible')) {
                view.onScroll(null, true);
            }
        }
    }, this);

    this.notifications_body = this.right_panel.addChild('notifications_body',
            this.NotificationsBodyContainer);

}, xabber);

export default xabber;
