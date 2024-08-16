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
    pretty_date = (timestamp) => {
        let date = new Date(timestamp),
            today = new Date(),
            yesterday = new Date();

        yesterday.setDate(today.getDate() - 1);

        if (date.toDateString() === today.toDateString()) {
            return xabber.getString("today");
        } else if (date.toDateString() === yesterday.toDateString()) {
            return xabber.getString("yesterday");
        } else {
            return utils.pretty_date(timestamp, (xabber.settings.language == 'ru-RU' || xabber.settings.language == 'default' && xabber.get("default_language") == 'ru-RU') && 'dddd, D MMMM YYYY')
        }
    },
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
        "click .notifications-account-filter-content .filter-item-wrap": "selectAccounts",
        "click .notifications-type-filter-content .filter-item-wrap": "filterContent",
        "click .notification-subscriptions-button": "filterContent",

    },

    _initialize: function () {
        xabber.accounts.on("list_changed connected_list_changed notification_chat_created account_color_updated add destroy", this.updateAccountsFilter, this);
        xabber.accounts.on("change:enabled", this.updateAccountsFilter, this);
        xabber.accounts.on("change:connected", this.updateAccountsFilter, this);
        return this;
    },

    render: function (options) {
        // console.log(options);
        this.updateAccountsFilter();
        if (this.current_content){
            let clear;
            if (this.current_content.filter_type !== 'all'){
                this.current_content.filter_type = 'all';
                this.$('.notifications-type-filter-content .filter-item-wrap').removeClass('selected-filter');
                this.$('.notifications-type-filter-content .filter-item-wrap[data-filter="all"]').addClass('selected-filter');
                this.current_content.$el.removeClass('security-content');
                this.current_content.$el.removeClass('subscription-content');
                this.$el.removeClass('subscription-content');
                this.$('.notifications-utility .notifications-header').text(xabber.getString("notifications_window__type_filter_all"));
                clear = true;
            }
            this.current_content.filterByAccounts([], clear);
        }
        this.$('.notifications-utility .notifications-header').text(xabber.getString("notifications_window__type_filter_all"));
    },

    onShowNotificationsTab: function () {
        if (this.current_content){
            this.current_content.onShowNotificationsTab();
        }
    },

    cancelTrustSession: function (ev) {
    },

    enterCode: function (ev) {
    },

    filterContent: function (ev) {
        if (!this.current_content)
            return;
        let $item = $(ev.target).closest('.filter-item-wrap'),
            filter_type = $item.attr('data-filter'),
            clear_account;
        if ($item.hasClass('selected-filter')){
            this.$('.filter-item-wrap').removeClass('selected-filter');
            clear_account = true
        }
        this.$('.notifications-type-filter-content .filter-item-wrap').removeClass('selected-filter');
        this.$('.notifications-type-filter-content .filter-item-wrap[data-filter="all"]').addClass('selected-filter');
        this.$('.notification-subscriptions-button').removeClass('hidden');
        this.$('.notification-subscription-item').slice(2).addClass('hidden');
        this.current_content.$el.removeClass('subscription-content');
        this.$el.removeClass('subscription-content');
        this.current_content.$el.removeClass('security-content');
        this.current_content.$el.removeClass('subscription-content-hidden');
        if (filter_type !== 'all') {
            if (filter_type === 'subscription') {
                this.current_content.$el.addClass('subscription-content');
                this.$el.addClass('subscription-content');
                this.$('.notifications-utility').addClass('subscription-content');
                this.$('.notification-subscription-item').removeClass('hidden');
                this.$('.notification-subscriptions-button').addClass('hidden');
            } else if (filter_type === 'security') {
                this.current_content.$el.addClass('security-content');
                this.current_content.$el.addClass('subscription-content-hidden');
            } else {
                this.current_content.$el.addClass('subscription-content-hidden');
            }
            this.$('.notifications-type-filter-content .filter-item-wrap').removeClass('selected-filter');
            this.$(`.notifications-type-filter-content .filter-item-wrap[data-filter="${filter_type}"]`).addClass('selected-filter');
        }

        if (!clear_account){
            this.$('.notifications-account-filter-content .filter-item-wrap').removeClass('selected-filter');
        }
        this.$('.notifications-utility .notifications-header').text(this.$('.notifications-type-filter-content .filter-item-wrap.selected-filter .name').text());
        this.current_content.filterByProperty(filter_type, clear_account);
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

    selectAccounts: function (ev) {

        let $item = $(ev.target).closest('.filter-item-wrap');
        if (!$item.attr('data-jid')) {
            $item.remove();
            return;
        }
        if(!$item.hasClass('selected-filter')){
            this.$('.notifications-account-filter-content .filter-item-wrap').removeClass('selected-filter');
        }
        $item.switchClass('selected-filter');


        let accounts  = this.$('.notifications-account-filter-content .filter-item-wrap.selected-filter').map(function(){return $(this).attr("data-jid");}).get();
        if (this.current_content){
            this.current_content.filterByAccounts(accounts);
        }
    },

    updateCurrentNotifications: function () {
        let notifications_chats = [];
        if (!this.current_content){
            this.$('.notifications-content').html('');
            this.current_content = new xabber.NotificationsChatContentView();
            this.current_content.show();
        }
        if (this.current_content){
            if (!xabber.accounts.enabled.length || !xabber.accounts.connected.length){
                this.current_content.addChats(notifications_chats); // push list to content
                return;
            }
            let accounts = xabber.accounts.enabled;
            accounts = accounts.filter(item => item.server_features.get(Strophe.NS.XABBER_NOTIFY));
            _.each(accounts, (account) => {
                let chat = account.chats.filter(item => item.get('jid') === account.server_features.get(Strophe.NS.XABBER_NOTIFY).get('from') && item.get('notifications'));
                if (chat.length){
                    chat = chat[0];
                }
                if (!chat || !chat.item_view){
                    console.log('no chat!');
                    return;
                }
                notifications_chats.push(chat);
            });
            this.current_content.addChats(notifications_chats); // push list to content
        }
    },
});

xabber.NotificationsChatContentView = xabber.BasicView.extend({
    className: 'chat-content-wrap',
    template: env.templates.chats.chat_content,
    ps_selector: '.chat-content',
    ps_settings: {
        wheelPropagation: true
    },
    avatar_size: constants.AVATAR_SIZES.CHAT_MESSAGE,

    events: {
        'click .chat-message': 'onClickNotification',
        "click .back-to-bottom": "backToBottom",
        "click .back-to-unread:not(.back-to-bottom)": "scrollToUnreadWithButton",
        "click .btn-decline": "declineSubscription",
        "click .btn-add": "addContact",
        "click .btn-block": "blockContact"
    },

    _initialize: function (options) {

        this.current_day_indicator = null;
        this.$history_feedback = this.$('.load-history-feedback');

        this._scrolltop = this.getScrollTop();
        this._is_scrolled_bottom = true;
        this._long_reading_timeout = false;
        let wheel_ev = this.defineMouseWheelEvent();
        this.$el.on(wheel_ev, this.onMouseWheel.bind(this));
        this.ps_container.on("ps-scroll-up ps-scroll-down", this.onScroll.bind(this));
        this.ps_container.on("ps-scroll-y", this.onScrollY.bind(this));
        this.filtered_accounts = [];
        this.filtered_messages = [];
        this.filter_type = 'all';
        this.notifications_chats = [];
        this.notification_messages = new xabber.Messages(null, {});
        this.notification_messages.on("change:last_replace_time", this.updateMessage, this);
        this.notification_messages.on("add", this.addMessage, this);
        this.notification_messages.on("change:is_unread", this.onChangedReadState, this);
        this.notification_messages.on("change:timestamp", this.onChangedMessageTimestamp, this);
        xabber.accounts.on('account_color_updated', this.updateColorScheme, this);
        xabber.on('new_incoming_subscription', this.updateAllIncomingSubscriptions, this);

        return this;
    },

    render: function () { //34
        if (this._prev_scrolltop)
            this.scrollTo(this._prev_scrolltop);
        else
            this.scrollToBottom();
        this.onScroll();

        this.$el.addClass('chat-body-container-notifications');
    },

    updateColorScheme: function () {
        _.each(xabber.accounts.models, (account) => {
            this.$(`div[data-account-jid="${account.get('jid')}"`).attr('data-color', account.settings.get('color'));
        });
    },

    onClickNotification: function (ev) { //34
        let $elem = $(ev.target).closest('.chat-message');

        $elem.removeClass('unread-message-background');
        let unique_id = $elem.attr('data-uniqueid'),
            msg = this.notification_messages.get(unique_id);

        let chat;
        if (msg.collection && msg.collection.chat) {
            chat = msg.collection.chat;
        }
        if (chat && chat.item_view && !chat.item_view.content)
            chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});

        if (!chat || !chat.item_view|| !chat.item_view.content) {
            return;
        }
        let is_in_unread = chat.messages_unread.get(msg);
        if (msg.get('is_unread'))
            msg.set('is_unread', false);
        if (!is_in_unread && chat.get('const_unread') !== 0 && Number(chat.get('const_unread')) !== NaN) {
            let const_unread = chat.get('const_unread');
            const_unread = --const_unread;
            chat.set('const_unread', const_unread);
        }
        xabber.toolbar_view.recountAllMessageCounter();
    },

    defineMouseWheelEvent: function () {
        if (!_.isUndefined(window.onwheel)) {
            return "wheel";
        } else if (!_.isUndefined(window.onmousewheel)) {
            return "mousewheel";
        } else {
            return "MozMousePixelScroll";
        }
    },

    addContact: function (ev) {
        let $item = $(ev.target).closest('.notification-subscription-item');
        if (!$item.attr('data-jid') || !$item.attr('data-account-jid'))
            return;
        let account = xabber.accounts.enabled.find(acc => acc.get('jid') === $item.attr('data-account-jid'));
        if (!account)
            return;
        let contact = account.contacts.get($item.attr('data-jid'));
        if (!contact)
            return;

        if (contact.get('subscription') === undefined)
            contact.pushInRoster(null, () => {
                this.sendAndAskSubscription(contact);
            });
        else
            this.sendAndAskSubscription(contact);
    },

    sendAndAskSubscription: function (contact) {
        contact.askRequest();
        contact.acceptRequest();
    },

    declineSubscription: function (ev) {
        let $item = $(ev.target).closest('.notification-subscription-item');
        if (!$item.attr('data-jid') || !$item.attr('data-account-jid'))
            return;
        let account = xabber.accounts.enabled.find(acc => acc.get('jid') === $item.attr('data-account-jid'));
        if (!account)
            return;
        let contact = account.contacts.get($item.attr('data-jid'));
        if (!contact)
            return;

        contact.declineSubscribe();
        contact.set('subscription_request_in', false);
    },

    blockContact: function (ev) {
        let $item = $(ev.target).closest('.notification-subscription-item');
        if (!$item.attr('data-jid') || !$item.attr('data-account-jid'))
            return;
        let account = xabber.accounts.enabled.find(acc => acc.get('jid') === $item.attr('data-account-jid'));
        if (!account)
            return;
        let contact = account.contacts.get($item.attr('data-jid'));
        if (!contact)
            return;

        contact.declineSubscribe();
        contact.set('subscription_request_in', false);
        setTimeout(()=> {
            contact.blockRequest();
        }, 1000);
    },

    onShow: function (attrs) {
        xabber.notifications_view.$('.notifications-content').append(this.$el);
        this.onScroll();
        setTimeout(() => {
            this.onScroll();
        }, 1500);
        if (!this.$('.chat-content .notification-sessions-wrap').length){
            this.addTrustSessionsContainer()
        }
        if (!this.$('.chat-content .notification-subscriptions-wrap').length){
            this.addIncomingSubscriptionContainer()
        }
    },

    addChats: function (notifications_chats) {
        let account_jids = [];
        this.notifications_chats = [];
        _.each(notifications_chats, (chat) => {
            account_jids.push(chat.account.get('jid'));
            let messages = chat.messages.models;
            _.each(messages, (msg) => {
                msg.collection = chat.messages;
            });
            this.notifications_chats.push({jid: chat.account.get('jid'), chat:chat});
            this.notification_messages.add(messages);
        });
        let remove_list = this.notification_messages.filter(msg => msg.collection && msg.collection.account && !account_jids.includes(msg.collection.account.get('jid'))),
            new_list = this.notification_messages.filter(msg => msg.collection && msg.collection.account && account_jids.includes(msg.collection.account.get('jid')));

        _.each(remove_list, (msg) => {
            this.removeMessageFromDOM(msg);
        });
        remove_list.length && new_list.length && this.notification_messages.reset(new_list);

        this.updateAllIncomingSubscriptions();
    },

    isVisible: function () {
        let is_visible = false;
        if (xabber.notifications_view && xabber.notifications_view.current_content){
            if (xabber.notifications_body.data.get('visible')){
                is_visible = true;
            }
        }
        return is_visible;
    },

    onHide: function () {
        this.$el.detach();

    },

    updateCounter: function () {
        return;
    },

    onShowNotificationsTab: function () {
        this.onScroll();
        setTimeout(() => {
            this.onScroll();
        }, 1500);
    },

    readNotifications: function () {
        if (!this.isVisible() || !xabber.get('focused'))
            return;
        _.each(this.notifications_chats, (chat_item) => {
            if (!chat_item.chat)
                return;
            if (chat_item.chat.item_view && !chat_item.chat.item_view.content)
                chat_item.chat.item_view.content = new xabber.ChatContentView({chat_item: chat_item.chat.item_view});
            if ((chat_item.chat.get('unread') || chat_item.chat.get('const_unread')) && chat_item.chat.last_message){
                chat_item.chat.item_view.content.readMessages();
                chat_item.chat.account.cached_notifications.getAllFromCachedNotifications((res) => {
                    if (res.length){
                        res = res.filter(item => item.is_unread);
                        _.each(res, (msg_item) => {
                            if (msg_item.is_unread){
                                chat_item.chat.account.cached_notifications.putInCachedNotifications({
                                    stanza_id: msg_item.stanza_id,
                                    xml: msg_item.xml,
                                    is_unread: false,
                                });
                            }
                        })
                    }
                });
            }
        })
    },
    onChangedReadState: function (message) {
        let is_unread = message.get('is_unread'),
            $msg = this.$(`.chat-message[data-uniqueid="${message.get("unique_id")}"]`);
        if (is_unread) {
            if (!message.get('was_readen')){
                $msg.addClass('unread-message');
                $msg.addClass('unread-message-background');
            }
        } else {
            $msg.removeClass('unread-message');
            if (message.collection && message.collection.account){
                message.get('xml') && message.collection.account.cached_notifications.putInCachedNotifications({
                    stanza_id: message.get('unique_id'),
                    xml: message.get('xml').outerHTML,
                    is_unread: false,
                },(res) => {

                })
            }
        }
    },

    filterByAccounts: function (accounts, cleared) {
        this.filtered_accounts.length && !accounts.length && (cleared = true);
        this.filtered_accounts = accounts;
        this.FilterMessagesInChat(cleared);
    },

    filterByProperty: function (filter_type, clear_account) {
        if (clear_account)
            this.filterByAccounts([]);
        if (this.filter_type === filter_type)
            return;
        this.filtered_accounts = [];
        this.filter_type = filter_type;
        this.FilterMessagesInChat(true);
    },

    readMessage: function (last_visible_msg, $last_visible_msg, is_context) {
    },

    removeMessage: function (item) {
    },

    addTrustSessionsContainer: function () {
    },

    addIncomingSubscriptionContainer: function () {
        this.$('.chat-content').prepend($(templates.incoming_subscriptions_container()));
        this.updateAllIncomingSubscriptions();
    },

    updateAllIncomingSubscriptions: function () {
        this.$('.notification-subscriptions-content-wrap').html('');
        let accounts = xabber.accounts.enabled;
        let counter = 0;
        _.each(accounts, (account) => {
            let contacts = account.contacts.filter(item => item.get('subscription_request_in'));
                _.each(contacts, (contact) => {
                    let $template = $(templates.incoming_subscriptions_item({
                        name: contact.get('name'),
                        jid: contact.get('jid'),
                        account: account.get('jid'),
                    }));
                    this.$('.notification-subscriptions-content-wrap').append($template);
                    let image = contact.cached_image;
                    $template.find('.circle-avatar').setAvatar(image, 64);
                    $template.attr('data-color', contact.account.settings.get('color'));
                    counter++;
                });
        });
        if (counter > 2 && this.filter_type !== 'subscription'){
            this.$('.notification-subscriptions-button').removeClass('hidden');
            this.$('.notification-subscription-item').slice(2).addClass('hidden');
        } else {
            this.$('.notification-subscriptions-button').addClass('hidden');
            this.$('.notification-subscription-item').removeClass('hidden');
        }
        this.$('.notification-subscriptions-wrap').switchClass('hidden', this.$('.notification-subscription-item:not(.hidden)').length === 0);
        xabber.toolbar_view.recountAllMessageCounter()
    },

    updateAllTrustSessions: function () {
    },

    updateTrustSession: function (session_id, is_remove) {
    },

    addMessage: function (message, collection, event, is_filtered) {
        let chat;
        if (message.collection && message.collection.chat) {
            chat = message.collection.chat;
        }
        if (chat && chat.item_view && !chat.item_view.content)
            chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});

        if (!chat || !chat.item_view|| !chat.item_view.content) {
            console.error(message);
            return;
        }
        let $message = chat.item_view.content.buildMessageHtml(message),
            index = this.filtered_messages.length && is_filtered ? this.filtered_messages.indexOf(message)  : this.notification_messages.indexOf(message);
        if (index === 0) {
            // if (this.$('.chat-content .notification-sessions-wrap').length){
            //     $message.insertAfter(this.$('.chat-content .notification-sessions-wrap'));
            // } else {
                $message.appendTo(this.$('.chat-content'));
            // }
        } else if (is_filtered && this.filtered_messages.length && this.filtered_messages[index - 1]) {
            let $prev_message = this.$(`.chat-message[data-uniqueid="${this.filtered_messages[index - 1].get('unique_id')}"]`);
            if (!$prev_message.length) {
                $prev_message = this.addMessage(this.filtered_messages[index - 1], null, null, true);
            }
            $message.insertBefore($prev_message);

        } else if (!is_filtered && !this.filtered_messages.length && this.notification_messages.models.length && this.notification_messages.models[index - 1]) {
            let $prev_message = this.$(`.chat-message[data-uniqueid="${this.notification_messages.models[index - 1].get('unique_id')}"]`);
            if (!$prev_message.length) {
                $prev_message = this.addMessage(this.notification_messages.models[index - 1]);
            }
            $message.insertBefore($prev_message);
        }
        let $next_message = $message.nextAll('.chat-message').first();
        this.updateMessageInChat($message[0], message);
        this.updateNotificationDate($message[0], message);
        if ($next_message.length) {
            this.updateMessageInChat($next_message[0]);
        }
        chat.item_view.content.initPopup($message);
        xabber.toolbar_view.recountAllMessageCounter();

        let $notification_msg, ignored, verification_failed;

        if (message.get('notification_msg') && message.get('notification_msg_content')){
            $notification_msg = $(message.get('notification_msg_content'));
            if (message.get('notification_trust_msg') || $notification_msg.children(`authenticated-key-exchange[xmlns="${Strophe.NS.XABBER_TRUST}"]`).length) {
                if (!$notification_msg.find('verification-successful').length && !$notification_msg.find('verification-failed').length && !$notification_msg.find('verification-rejected').length){
                    ignored = true;
                }
                if ($notification_msg.find('verification-failed').length || $notification_msg.find('verification-rejected').length){
                    ignored = true;
                    verification_failed = true;
                }
            }
        }

        if (message.get('notification_msg') && message.get('notification_msg_content')){
            if (message.get('notification_trust_msg') || $notification_msg.children(`authenticated-key-exchange[xmlns="${Strophe.NS.XABBER_TRUST}"]`).length) {
                if (ignored){
                    message.set('ignored', true);
                    message.set('is_unread', false);
                    $message.addClass('hidden');
                    if (verification_failed){
                        message.set('security_notification', true);
                        $message.removeClass('hidden');
                        $message.addClass('security-content-msg');
                    }
                }
                if (chat.account.omemo && chat.account.omemo.xabber_trust){
                    if (message.get('device_id')){
                        chat.account.omemo.xabber_trust.addToSequentialProcessingList($notification_msg[0], {
                            automated: true,
                            notification_trust_msg: message.get('notification_trust_msg'),
                            device_id: message.get('device_id'),
                            msg_item: message
                        });
                    } else {
                        chat.account.omemo.xabber_trust.receiveTrustVerificationMessage($notification_msg[0], {
                            automated: true,
                            notification_trust_msg: message.get('notification_trust_msg'),
                            device_id: message.get('device_id'),
                            msg_item: message
                        });
                    }
                }
            }
        }
        return $message;
    },

    removeMessageFromDOM: function (message) {
        let $message = this.$(`.chat-message[data-uniqueid="${message.get('unique_id')}"]`);
        if (!$message.length)
            return;
        $message.prev('.chat-day-indicator').remove();
        let $next_msg = $message.next('.chat-message');
        $message.remove();
        $next_msg.length && this.updateMessageInChat($next_msg[0]);
        this.updateScrollBar();
    },

    getDateIndicator: function (date) {
        let day_date = moment(date).startOf('day');
        return $('<div class="chat-day-indicator one-line noselect" data-time="'+
            day_date.format('x')+'">'+pretty_date(day_date)+'</div>');
    },

    updateMessageInChat: function (msg_elem, msg) {
        let chat,
            $msg = $(msg_elem);
        !msg && (msg = this.notification_messages.get($msg.data('uniqueid')));
        if (msg && msg.collection && msg.collection.chat) {
            chat = msg.collection.chat;
        }
        if (chat && chat.item_view && !chat.item_view.content)
            chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});

        if (!chat || !chat.item_view|| !chat.item_view.content) {
            console.error(msg);
            return;
        }
        if (!$msg.hasClass('hidden')){
            $msg.prev('.chat-day-indicator').remove();
            let $prev_msg = $msg.prevAll('.chat-message:not(.hidden)').first();
            if (!$prev_msg.length) {
                this.getDateIndicator($msg.data('time')).insertBefore($msg);
            } else {
                let is_same_date = moment($msg.data('time')).startOf('day')
                    .isSame(moment($prev_msg.data('time')).startOf('day'));
                if (!is_same_date) {
                    this.getDateIndicator($msg.data('time')).insertBefore($msg);
                }
            }
        }
        if ($msg.find('.plyr-video-container').length) {
            chat.item_view.content.initPlyrEmbedPlayer($msg, msg);
        }
        if ($msg.hasClass('forwarding')) {
            let $fwd_message = $msg.find('.fwd-message');
            $fwd_message.each((idx, fwd_msg_item) => {
                let $fwd_msg_item = $(fwd_msg_item),
                    $prev_fwd_message = (idx > 0) ? $fwd_msg_item.prev() : [];
                $fwd_msg_item.switchClass('hide-date', is_same_date && $prev_fwd_message.length);
                $fwd_msg_item.removeClass('hide-time');
                if ($prev_fwd_message.length) {
                    let is_same_fwded_sender = ($fwd_msg_item.data('from') === $prev_fwd_message.data('from'));
                    if (is_same_fwded_sender) {
                        chat.item_view.content.hideFwdMessageAuthor($fwd_msg_item);
                    } else {
                        chat.item_view.content.showFwdMessageAuthor($fwd_msg_item);
                    }
                } else {
                    chat.item_view.content.showMessageAuthor($msg);
                    chat.item_view.content.showFwdMessageAuthor($fwd_msg_item);
                }
            });
        }
        if (msg && msg.get('ntf_new_device_msg')){
            this.hideAuthorUsername($msg);
        }
        if (!$msg.find('.left-side .notification-icon').length){

            let $icon = $(templates.notification_icon_container());
            if (msg){
                if (msg.get('security_notification')) {
                    $icon.append(env.templates.svg['security']())
                } else if (msg.get('notification_info')){
                    $icon.text('!');
                    // $icon.append(env.templates.svg['alert-circle']())
                } else if (msg.get('notification_mention')){
                    $icon.append(env.templates.svg['bell-mention']())
                } else if (msg.get('ntf_new_device_msg')){
                    $icon.append(env.templates.svg['lock']())
                }
            }
            $msg.find('.left-side').append($icon);
        }
        $msg.attr('data-account-jid',chat.account.get('jid'));
        $msg.attr('data-color', chat.account.settings.get('color'));
        chat.item_view.content.showMessageAuthor($msg);
    },

    FilterMessagesInChat: function (is_cleared) {
        if (!this.filtered_accounts.length && is_cleared){
            this.filtered_messages = [];
            this.$(`.chat-message`).remove();
            this.$('.chat-day-indicator').remove();
            this.backToBottom();
            this.$('.notification-subscription-item').removeClass('hidden');
            if (this.filter_type === 'all'){
                _.each(this.notification_messages.models, (msg) => {
                    this.addMessage(msg);
                });
                if (this.$(`.notification-subscription-item`).length > 2){
                    this.$(`.notification-subscription-item`).slice(2).addClass('hidden');
                    this.$('.notification-subscriptions-button').removeClass('hidden');
                } else {
                    this.$('.notification-subscriptions-button').addClass('hidden');
                }
            } else {
                if (this.filter_type === 'security'){
                    this.filtered_messages = this.notification_messages.filter((msg) => msg.get('security_notification'));
                    this.filtered_messages.length && this.addMessage(this.filtered_messages[this.filtered_messages.length - 1], null, null, true);
                } else if (this.filter_type === 'information'){
                    this.filtered_messages = this.notification_messages.filter((msg) => msg.get('notification_info'));
                    this.filtered_messages.length && this.addMessage(this.filtered_messages[this.filtered_messages.length - 1], null, null, true);
                } else if (this.filter_type === 'mentions'){
                    this.filtered_messages = this.notification_messages.filter((msg) => msg.get('notification_mention'));
                    this.filtered_messages.length && this.addMessage(this.filtered_messages[this.filtered_messages.length - 1], null, null, true);
                }
            }

            this.$('.notification-subscriptions-wrap').switchClass('hidden', this.$('.notification-subscription-item:not(.hidden)').length === 0);
        } else if (this.filtered_accounts.length) {
            this.filtered_messages = this.notification_messages.filter((msg) => msg.collection && msg.collection.account && this.filtered_accounts.includes(msg.collection.account.get('jid')));
            if (this.filter_type !== 'all'){
                if (this.filter_type === 'security'){
                    this.filtered_messages = this.filtered_messages.filter((msg) => msg.get('security_notification'));
                } else if (this.filter_type === 'information'){
                    this.filtered_messages = this.filtered_messages.filter((msg) => msg.get('notification_info'));
                } else if (this.filter_type === 'mentions'){
                    this.filtered_messages = this.filtered_messages.filter((msg) => msg.get('notification_mention'));
                }
            }
            this.$(`.chat-message`).remove();
            this.$('.chat-day-indicator').remove();
            this.backToBottom();
            this.filtered_messages.length && this.addMessage(this.filtered_messages[this.filtered_messages.length - 1], null, null, true);

            this.$('.notification-subscription-item').addClass('hidden');
            _.each(this.filtered_accounts, (jid) => {
                this.$(`.notification-subscription-item[data-account-jid="${jid}"]`).removeClass('hidden');
                if (this.filter_type !== 'subscription'){
                    if (this.$(`.notification-subscription-item[data-account-jid="${jid}"]:not(.hidden)`).length > 2){
                        this.$(`.notification-subscription-item[data-account-jid="${jid}"]:not(.hidden)`).slice(2).addClass('hidden');
                        this.$('.notification-subscriptions-button').removeClass('hidden');
                    } else {
                        this.$('.notification-subscriptions-button').addClass('hidden');
                    }
                }
            });

            this.$('.notification-subscriptions-wrap').switchClass('hidden', this.$('.notification-subscription-item:not(.hidden)').length === 0);

        }
    },

    reRenderMessages: function () {
        this.$(`.chat-message`).remove();
        this.$('.chat-day-indicator').remove();
        _.each(this.notification_messages.models, (msg) => {
            this.addMessage(msg);
        });
    },

    hideAuthorUsername: function ($msg) {
        $msg.addClass('without-username');
    },

    updateNotificationDate: function (msg_elem, msg) {
        let $msg = $(msg_elem);
        // $msg.find('.msg-time').text(xabber.getString("time_since_with_time", [utils.pretty_time_since($msg.data('time')), utils.pretty_time($msg.data('time'))]));
        $msg.find('.msg-time').text(pretty_datetime($msg.data('time')));
        $msg.find('.msg-time').append(`<div>${msg.collection.chat.account.get('jid')}</div>`);
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
        this.scrollToTop();
    },

    loadPreviousHistory: function (no_before, is_scrollToTop) {
    },

    onScrollY: function () {
        this._prev_scrolltop = this._scrolltop || this._prev_scrolltop || 0;
        this._scrolltop = this.getScrollTop() || this._scrolltop || this._prev_scrolltop || 0;
        this._is_scrolled_bottom = this.isScrolledToBottom();// mb
        this.$('.back-to-bottom').hideIf(this.isScrolledToTop());
    },

    onScroll: function (ev, is_focused) {
        if (this._no_scrolling_event)
            return;
        this.$('.back-to-bottom').hideIf(this.isScrolledToTop());

        let scroll_read_timer = this._long_reading_timeout || is_focused ? 100 : 100;
        clearTimeout(this._onscroll_read_messages_timeout);
        this._onscroll_read_messages_timeout = setTimeout(() => {
            this.readNotifications();
        }, scroll_read_timer);
        this._long_reading_timeout = false;
    },

    onMouseWheel: function (ev) {
        this.$('.back-to-bottom').hideIf(this.isScrolledToTop());
    },

    onChangedMessageTimestamp: function (message) {
        let chat;
        if (message.collection && message.collection.chat) {
            chat = message.collection.chat;
        }
        if (chat && chat.item_view && !chat.item_view.content)
            chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});

        if (!chat || !chat.item_view|| !chat.item_view.content) {
            console.log(message);
            return;
        }

        let $message = this.$(`.chat-message[data-uniqueid="${message.get('unique_id')}"]`),
            $next_msg = $message.next(),
            $old_prev_msg = $message.prev();
        $message.attr({
            'data-time': message.get('timestamp')
        });
        $message.detach();
        $message.children('.right-side').find('.msg-time').attr({title: pretty_datetime(message.get('time'))}).text(utils.pretty_time(message.get('time')));
        message.get('user_info') && $message.attr('data-from-id', message.get('user_info').id);
        this.notification_messages.sort();
        let index = this.notification_messages.indexOf(message);
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
                chat.item_view.content.showMessageAuthor($next_msg);
            if ($prev_msg.next().hasClass('chat-day-indicator') && (moment($prev_msg.next().data('time')).format('DD.MM.YY') === moment(message.get('timestamp')).format('DD.MM.YY'))) {
                $message.insertAfter($prev_msg.next());
                chat.item_view.content.showMessageAuthor($message);
            }
            else
                $message.insertAfter($prev_msg);
            if (message.get('data_form') || message.get('forwarded_message') || !is_same_date || !is_same_sender || $prev_msg.hasClass('system') || $prev_msg.hasClass('saved-main'))
                chat.item_view.content.showMessageAuthor($message);
            else
                chat.item_view.content.hideMessageAuthor($message);
        }
    },

    updateMessage: function (item) {
        let $message, images = item.get('images'), emoji = item.get('only_emoji'), $new_message,
            files =  item.get('files');
        if (item instanceof xabber.Message) {
            this.updateMentions(item);
            $new_message = this.buildMessageHtml(item);
            $message = this.$(`.chat-message[data-uniqueid="${item.get('unique_id')}"]`);
        }
        else
            return;
        $message.replaceWith($new_message);
        $message = this.$(`.chat-message[data-uniqueid="${item.get('unique_id')}"]`);
        this.updateMessageInChat($message[0], item);
        this.initPopup($message);
        this.bottom.showChatNotification();

        if (item.get('data_form')) {
            let data_form = utils.render_data_form(item.get('data_form'));
            $message.find('.chat-msg-content').append(data_form);
        }
        let short_datetime = utils.pretty_short_datetime(item.get('last_replace_time')),
            datetime = moment(item.get('last_replace_time')).format('D MMMM, YYYY HH:mm:ss'),
            new_title = `${pretty_datetime(item.get('time'))} ${xabber.getString("edited", [moment(item.get('timestamp')).startOf('day').isSame(moment(item.get('last_replace_time')).startOf('day')) ? short_datetime : datetime])}`;
        $message.find('.msg-time').prop('title', new_title);
        $message.find('.edited-info').removeClass('hidden').text(xabber.getString("chat_screen__message__label_edited")).prop('title', new_title);
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
