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
    ps_selector: '.notifications-content-filters',
    avatar_size: constants.AVATAR_SIZES.SYNCHRONIZE_ACCOUNT_ITEM,

    events: {
        "click .notifications-account-filter-content .filter-item-wrap": "selectAccounts",
        "click .notifications-type-filter-content .filter-item-wrap": "filterContent",
        "click .notification-subscriptions-button": "filterContent",
        "click .btn-read-all": "readAll",

    },

    _initialize: function () {
        xabber.accounts.on("list_changed connected_list_changed notification_chat_created account_color_updated add destroy", this.updateAccountsFilter, this);
        xabber.accounts.on("change:enabled", this.updateAccountsFilter, this);
        xabber.accounts.on("change:connected", this.updateAccountsFilter, this);
        return this;
    },

    render: function (options) {
        // console.log(options);
        this.clearFilter();
        this.updateAccountsFilter();
        this.$('.notifications-utility .notifications-header').text(xabber.getString("notifications_window__type_filter_all"));
        this.showReadAllBtn();
        this.renderCalendar();
        this.updateScrollBar();
    },

    clearFilter: function () {
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
    },

    renderCalendar: function () {
        this.$('.notifications-calendar-activity').html('');

        let currentDate = new Date(),
            lastMonthDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1);

        // Контейнер для календарей
        let $calendarContainer = $('<div class="notifications-calendars-wrap"></div>');

        // Генерация календаря для двух месяцев
        let calendars = [lastMonthDate, currentDate];

        calendars.forEach(date => {
            let $calendar = $('<table class="calendar"></table>'),
                $rows_containter = $('<div class="calendar-rows-wrap"></div>');

            // Заголовок месяца
            let monthName = date.toLocaleString('default', { month: 'long'}),
                $monthHeader = $('<thead><tr><th colspan="7">' + monthName + '</th></tr></thead>');
            $calendar.append($monthHeader);

            // Дни месяца
            let firstDay = (new Date(date.getFullYear(), date.getMonth(), 1).getDay() + 6) % 7,  // Перерасчет с воскресенья на понедельник
                lastDate = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();

            let prevMonthLastDate = new Date(date.getFullYear(), date.getMonth(), 0).getDate(),  // Последний день предыдущего месяца
                nextMonthFirstDate = 1;

            let $currentRow = $('<tr></tr>'),
                dayCounter = 1;

            // Пустые ячейки перед началом месяца с днями предыдущего месяца
            for (let i = 0; i < firstDay; i++) {
                $currentRow.append('<td class="prev-month">' + (prevMonthLastDate - firstDay + i + 1) + '</td>');
            }

            // Дни текущего месяца
            for (let i = firstDay; i < 7; i++) {
                let dayTimestamp = new Date(date.getFullYear(), date.getMonth(), dayCounter).getTime();
                let isFuture = dayTimestamp > currentDate.getTime();
                let futureClass = isFuture ? ' future' : '';
                $currentRow.append('<td><div class="notifications-calendar-day' + futureClass + '" data-timestamp="' + dayTimestamp + '">' + dayCounter++ + '</div></td>');
            }
            $rows_containter.append($currentRow);

            // Следующие недели
            while (dayCounter <= lastDate) {
                $currentRow = $('<tr></tr>');
                for (let i = 0; i < 7; i++) {
                    if (dayCounter <= lastDate) {
                        const dayTimestamp = new Date(date.getFullYear(), date.getMonth(), dayCounter).getTime();
                        let isFuture = dayTimestamp > currentDate.getTime();
                        let futureClass = isFuture ? ' future' : '';
                        $currentRow.append('<td><div class="notifications-calendar-day' + futureClass + '" data-timestamp="' + dayTimestamp + '">' + dayCounter++ + '</div></td>');
                    } else {
                        // Добавление дней следующего месяца
                        $currentRow.append('<td class="next-month">' + nextMonthFirstDate++ + '</td>');
                    }
                }
                $rows_containter.append($currentRow);
            }
            $calendar.append($rows_containter);

            $calendarContainer.append($calendar);
        });

        this.$('.notifications-calendar-activity').append($calendarContainer);
    },


    onShowNotificationsTab: function () {
        if (this.current_content){
            this.current_content.onShowNotificationsTab();
        }
    },

    showReadAllBtn: function () {
        this.$('.btn-read-all').switchClass('hidden', !this.$('.unread-message-background').length);
    },

    readAll: function () {
        if (!this.current_content)
            return;
        _.each(this.$('.unread-message-background'),(item) => {
            this.current_content.onClickNotification({target: item});

        })
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
        if (this.$(`.notification-subscription-item`).length > 2){
            this.$(`.notification-subscription-item`).slice(2).addClass('hidden');
            this.$('.notification-subscriptions-button').removeClass('hidden');
        }
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
        this.updateScrollBar();
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
            this.current_content.addChats(notifications_chats);
            if (this.current_content.isVisible){
                this.current_content.onShowNotificationsTab();
            }
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

    render: function () {
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

    onClickNotification: function (ev) {
        let $elem = $(ev.target).closest('.chat-message');
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
        xabber.notifications_view.showReadAllBtn();
        if (!this.$('.unread-message-background').length){
            chat.set('const_unread', 0);
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

    findCalendarCellByDate: function (timestamp) {
        // Создаем объект даты на основе таймштампа
        let date = new Date(timestamp);

        // Обнуляем время (часы, минуты, секунды, миллисекунды)
        date.setHours(0, 0, 0, 0);

        // Получаем таймштамп без времени
        let dateOnlyTimestamp = date.getTime();

        // Ищем элемент с соответствующим таймштампом
        let $element = xabber.notifications_view.$('.notifications-calendar-day').filter(function() {
            // Обнуляем время в атрибуте data-timestamp ячейки
            let cellTimestamp = parseInt($(this).attr('data-timestamp'), 10),
                cellDate = new Date(cellTimestamp);
            cellDate.setHours(0, 0, 0, 0);

            return cellDate.getTime() === dateOnlyTimestamp;
        });
        return $element;
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
            this.notification_messages.add(messages, {silent: true});
        });
        let remove_list = this.notification_messages.filter(msg => msg.collection && msg.collection.account && !account_jids.includes(msg.collection.account.get('jid'))),
            new_list = this.notification_messages.filter(msg => msg.collection && msg.collection.account && account_jids.includes(msg.collection.account.get('jid')));

        _.each(remove_list, (msg) => {
            this.removeMessageFromDOM(msg);
        });
        remove_list.length && new_list.length && this.notification_messages.reset(new_list);

        this.updateAllIncomingSubscriptions();

        _.each(notifications_chats, (chat) => {
            if (chat.account.settings.get('last_month_notifications_loaded'))
                return;
            if (chat.item_view && !chat.item_view.content)
                chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
            if (!chat.get('last_notifications_month_loaded'))
                chat.set('last_notifications_month_loaded', chat.item_view.content.requestToMonthMissedMessages());

        });
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
        xabber.notifications_view.clearFilter();
        this.onScroll();
        this.renderMessages();
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
            $msg.removeClass('unread-message-background');

            if (message.collection && message.collection.account){
                message.get('xml') && message.collection.account.cached_notifications.putInCachedNotifications({
                    stanza_id: message.get('unique_id'),
                    xml: message.get('xml').outerHTML,
                    is_unread: false,
                },(res) => {

                })
            }
        }
        xabber.notifications_view.showReadAllBtn();
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

    addMessage: function (message) {
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

        let $notification_msg, ignored;

        if (message.get('notification_msg') && message.get('notification_msg_content')){
            $notification_msg = $(message.get('notification_msg_content'));
            if (message.get('notification_trust_msg') || $notification_msg.children(`authenticated-key-exchange[xmlns="${Strophe.NS.XABBER_TRUST}"]`).length) {
                if (!$notification_msg.find('verification-successful').length && !$notification_msg.find('verification-failed').length && !$notification_msg.find('verification-rejected').length){
                    ignored = true;
                }
                if ($notification_msg.find('verification-failed').length || $notification_msg.find('verification-rejected').length){
                    ignored = true;
                }
            }
        }
        if (message.get('notification_msg') && message.get('notification_msg_content')){
            if (message.get('notification_trust_msg') || $notification_msg.children(`authenticated-key-exchange[xmlns="${Strophe.NS.XABBER_TRUST}"]`).length) {
                if (ignored){
                    message.set('is_unread', false);
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
        if ((!message.get('ignored') && !message.get('is_cached') && !(message.get('synced_from_server') || (message.get('is_archived') && !message.get('missed_msg')))) && !message.get('notificications_month_missed_msg')){
            let no_render,
                account_jid = chat.account.get('jid');

            if (this.filtered_accounts.length){
                if (!this.filtered_accounts.includes(account_jid)) {
                    no_render = true;
                }
            }

            if (this.filter_type !== 'all'){
                if (this.filter_type === 'security' && !message.get('security_notification')){
                    no_render = true;
                } else if (this.filter_type === 'information' && !message.get('notification_info')){
                    no_render = true;
                } else if (this.filter_type === 'mentions' && !message.get('notification_mention')){
                    no_render = true;
                }
            }

            if (!no_render){
                this.rendered_messages.push(message);
                this.renderMessage(this.rendered_messages[this.rendered_messages.length - 1], this.rendered_messages);
            }

        }

        xabber.toolbar_view.recountAllMessageCounter();
    },

    renderMessage: function (message, filtered_messages_render) {
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
            index = filtered_messages_render.indexOf(message);
        if (this.$('.chat-content').find(`.chat-message[data-uniqueid="${$message.attr('data-uniqueid')}`).length)
            return;
        if (index === 0) {
            $message.appendTo(this.$('.chat-content'));
        } else if (filtered_messages_render.length && filtered_messages_render[index - 1]) {
            let $prev_message = this.$(`.chat-message[data-uniqueid="${filtered_messages_render[index - 1].get('unique_id')}"]`);
            if (!$prev_message.length) {
                $prev_message = this.renderMessage(filtered_messages_render[index - 1], filtered_messages_render);
            }
            if ($prev_message.prev('.chat-day-indicator').length) {
                $message.insertBefore($prev_message.prev('.chat-day-indicator'));
            } else if ($prev_message.length) {
                $message.insertBefore($prev_message);
            }
        }


        if (message.get('ignored'))
            $message.addClass('hidden');

        let $next_message = $message.nextAll('.chat-message:not(.hidden)').first();
        this.updateMessageInChat($message[0], message);
        this.updateNotificationDate($message[0], message);
        if ($next_message.length) {
            this.updateMessageInChat($next_message[0]);
        }
        chat.item_view.content.initPopup($message);
        xabber.toolbar_view.recountAllMessageCounter();

        xabber.notifications_view.showReadAllBtn();
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
        if (!$msg.hasClass('hidden')) {
            let day_date = moment($msg.data('time')).startOf('day');

            let next_date = $msg.nextAll('.chat-day-indicator').first(),
                prev_date = $msg.prevAll('.chat-day-indicator').first();
            if (next_date.attr('data-time') === day_date.format('x')) {
                next_date.remove();
            }
            if (prev_date.attr('data-time') < day_date.format('x')) {
                prev_date.remove();
                this.getDateIndicator($msg.data('time')).insertBefore($msg);
            } else if (prev_date.attr('data-time') === day_date.format('x')){

            } else{
                this.getDateIndicator($msg.data('time')).insertBefore($msg);
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
            this.load_history_dfd = null;
            this.backToBottom();
            this.$('.notification-subscription-item').removeClass('hidden');
            if (this.filter_type === 'all'){
                this.onShowNotificationsTab();
                if (this.$(`.notification-subscription-item`).length > 2){
                    this.$(`.notification-subscription-item`).slice(2).addClass('hidden');
                    this.$('.notification-subscriptions-button').removeClass('hidden');
                } else {
                    this.$('.notification-subscriptions-button').addClass('hidden');
                }
            } else {
                if (this.filter_type === 'security'){
                    this.filtered_messages = this.notification_messages.filter((msg) => msg.get('security_notification') && !msg.get('ignored'));
                    if (this.filtered_messages.length) {
                        this.rendered_messages = this.filtered_messages.slice(Math.max(this.filtered_messages.length - 20, 0));
                        this.renderMessage(this.rendered_messages[this.rendered_messages.length - 1], this.rendered_messages);
                        this.updateCalendarCellsActivity(this.filtered_messages);
                    }
                } else if (this.filter_type === 'information'){
                    this.filtered_messages = this.notification_messages.filter((msg) => msg.get('notification_info') && !msg.get('ignored'));
                    if (this.filtered_messages.length) {
                        this.rendered_messages = this.filtered_messages.slice(Math.max(this.filtered_messages.length - 20, 0));
                        this.renderMessage(this.rendered_messages[this.rendered_messages.length - 1], this.rendered_messages);
                        this.updateCalendarCellsActivity(this.filtered_messages);
                    }
                } else if (this.filter_type === 'mentions'){
                    this.filtered_messages = this.notification_messages.filter((msg) => msg.get('notification_mention') && !msg.get('ignored'));
                    if (this.filtered_messages.length) {
                        this.rendered_messages = this.filtered_messages.slice(Math.max(this.filtered_messages.length - 20, 0));
                        this.renderMessage(this.rendered_messages[this.rendered_messages.length - 1], this.rendered_messages);
                        this.updateCalendarCellsActivity(this.filtered_messages);
                    }
                }
            }

            this.$('.notification-subscriptions-wrap').switchClass('hidden', this.$('.notification-subscription-item:not(.hidden)').length === 0);
        } else if (this.filtered_accounts.length) {
            this.filtered_messages = this.notification_messages.filter((msg) => msg.collection && msg.collection.account && this.filtered_accounts.includes(msg.collection.account.get('jid')) && !msg.get('ignored'));
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
            this.load_history_dfd = null;
            this.backToBottom();
            if (this.filtered_messages.length) {
                this.rendered_messages = this.filtered_messages.slice(Math.max(this.filtered_messages.length - 20, 0));
                this.renderMessage(this.rendered_messages[this.rendered_messages.length - 1], this.rendered_messages);
                this.updateCalendarCellsActivity(this.filtered_messages);
            }

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

    updateFilteredMessages: function () {
        if (!this.filtered_accounts.length){
            this.filtered_messages = [];
            if (this.filter_type !== 'all') {
                {
                    if (this.filter_type === 'security') {
                        this.filtered_messages = this.notification_messages.filter((msg) => msg.get('security_notification') && !msg.get('ignored'));
                    } else if (this.filter_type === 'information') {
                        this.filtered_messages = this.notification_messages.filter((msg) => msg.get('notification_info') && !msg.get('ignored'));
                    } else if (this.filter_type === 'mentions') {
                        this.filtered_messages = this.notification_messages.filter((msg) => msg.get('notification_mention') && !msg.get('ignored'));
                    }
                }
            }
        } else if (this.filtered_accounts.length) {
            this.filtered_messages = this.notification_messages.filter((msg) => msg.collection && msg.collection.account && this.filtered_accounts.includes(msg.collection.account.get('jid')) && !msg.get('ignored'));
            if (this.filter_type !== 'all'){
                if (this.filter_type === 'security'){
                    this.filtered_messages = this.filtered_messages.filter((msg) => msg.get('security_notification'));
                } else if (this.filter_type === 'information'){
                    this.filtered_messages = this.filtered_messages.filter((msg) => msg.get('notification_info'));
                } else if (this.filter_type === 'mentions'){
                    this.filtered_messages = this.filtered_messages.filter((msg) => msg.get('notification_mention'));
                }
            }
        }
    },

    renderMessages: function () {
        this.$(`.chat-message`).remove();
        this.$('.chat-day-indicator').remove();
        this.load_history_dfd = null;
        this.rendered_messages = this.notification_messages.filter(msg => !msg.get('ignored')).slice(Math.max(this.notification_messages.filter(msg => !msg.get('ignored')).length - 20, 0));
        this.rendered_messages.length && this.renderMessage(this.rendered_messages[this.rendered_messages.length - 1], this.rendered_messages);
        this.updateCalendarCellsActivity(this.notification_messages.filter(msg => !msg.get('ignored')));
    },

    updateCalendarCellsActivity: function (messages) { //34
        if (!messages || !messages.length)
            return;
        messages = messages.filter(item => item.get('timestamp') >= Number(moment(Date.now()).subtract(1, 'months').startOf('month')));
        xabber.notifications_view.$('.notifications-calendar-day').attr('data-activity-value', 0);

        _.each(messages, (msg) => {
            let $cell = this.findCalendarCellByDate(msg.get('timestamp'));
            if ($cell.attr('data-activity-value') && $cell.attr('data-activity-value') > 4)
                return;
            $cell.attr('data-activity-value', $cell.attr('data-activity-value') && Number($cell.attr('data-activity-value')) ? (Number($cell.attr('data-activity-value')) + 1) : 1);
        })
    },

    hideAuthorUsername: function ($msg) {
        $msg.addClass('without-username');
    },

    updateNotificationDate: function (msg_elem, msg) {
        let $msg = $(msg_elem);
        $msg.find('.msg-time').text(utils.pretty_time($msg.data('time')));
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
        let scroll_direction;
        if (this._scrolltop > this._prev_scrolltop) {
            scroll_direction = 'bottom';
        }
        this.handleOnScrollRendering(scroll_direction);
        this._long_reading_timeout = false;
    },

    onMouseWheel: function (ev) {
        this.$('.back-to-bottom').hideIf(this.isScrolledToTop());
    },

    handleOnScrollRendering: function (scroll_direction) {
        if (!scroll_direction || this._scroll_rendering)
            return;
        if (!this.rendered_messages)
            this.rendered_messages = [];
        this._scroll_rendering = true;
        if (scroll_direction === 'bottom'){

            let msg,
                filtered_chats_messages = [];

            _.each(this.notifications_chats, (chat) => {
                chat = chat.chat;
                let chat_filtered_messages = this.rendered_messages.filter(item => item.collection && item.collection.account.get('jid') === chat.account.get('jid'));
                if (!chat_filtered_messages.length)
                    return;
                if (chat_filtered_messages[0].get('unique_id') === chat.messages.filter(item => !item.get('ignored'))[0].get('unique_id') && chat.get('history_loaded'))
                    return;
                if (this.filtered_messages && this.filtered_messages.filter(item => item.collection && item.collection.account.get('jid') === chat.account.get('jid')).length
                    && chat_filtered_messages[0].get('unique_id') === this.filtered_messages.filter(item => item.collection && item.collection.account.get('jid') === chat.account.get('jid'))[0].get('unique_id')
                    && chat.get('history_loaded'))
                    return;
                filtered_chats_messages.push(chat_filtered_messages)
            });

            _.each(filtered_chats_messages, (list) => {
                if (!list.length)
                    return;
                let first_msg = list[0];
                if (!msg || (msg.get('timestamp') < first_msg.get('timestamp'))) {
                    msg = first_msg;
                }
            });
            if (!msg)
                return;

            let $msg = this.$(`.chat-message[data-uniqueid="${msg.get('unique_id')}"]`),
                whole_msgs_list = [],
                force_load;

            if (this.filtered_accounts.length || this.filter_type !== 'all') {
                this.updateFilteredMessages();
                whole_msgs_list = this.filtered_messages;
                if (this._previously_filtered && whole_msgs_list.length === this._previous_msg_count && this.rendered_messages.length === whole_msgs_list.length){
                    force_load = true
                }
                this._previously_filtered = true;
                this._previous_msg_count = whole_msgs_list.length;

            } else {
                whole_msgs_list =  this.notification_messages.filter(item => !item.get('ignored') && item.collection.account.get('jid') === msg.collection.account.get('jid'));
                this._previously_filtered = false;
            }

            if ($msg.length){
                if ($msg.isAlmostScrolledInContainer(this.$('.chat-content'), 1500)) {
                    let index = whole_msgs_list.indexOf(msg),
                        new_rendered_msgs = whole_msgs_list.slice(Math.max(0, index - 5), index);
                    if (new_rendered_msgs.length && !force_load && !this.load_history_dfd){
                        new_rendered_msgs = new_rendered_msgs.filter(item => !this.rendered_messages.some(rendered_msg => rendered_msg.get('unique_id') === item.get('unique_id')));

                        if (new_rendered_msgs.length) {
                            this.rendered_messages = [...new_rendered_msgs, ...this.rendered_messages];
                            this.rendered_messages.sort((a, b) => a.get('timestamp') - b.get('timestamp'));

                            for (let i = new_rendered_msgs.length - 1; i >= 0; i--) {
                                this.renderMessage(new_rendered_msgs[i], this.rendered_messages);
                            }
                        }
                    } else {
                        if (!this.load_history_dfd){
                            this.handleOnScrollLoading(msg);
                        }
                    }

                }
            }

        } else if (scroll_direction === 'top') {
        }
        this._scroll_rendering = false;

    },

    handleOnScrollLoading: function (message) {
        let msg_chat = message.collection.chat;
        let newest_first_msg = msg_chat.messages.models[0];

        if (newest_first_msg) {

            let $msg = this.$(`.chat-message[data-uniqueid="${newest_first_msg.get('unique_id')}"]`);

            if (!$msg.length && !newest_first_msg.get('ignored'))
                return;

            if ($msg.isAlmostScrolledInContainer(this.$('.chat-content'), 2000) || newest_first_msg.get('ignored')) {
                let chat = newest_first_msg.collection.chat;
                if (chat.get('history_loaded')){
                    this.load_history_dfd && (this.load_history_dfd = null);
                } else {
                    if (chat.item_view && !chat.item_view.content)
                        chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                    if (!this.load_history_dfd){
                        this.load_history_dfd = $.Deferred();
                        this.load_history_dfd.done(() => {
                            this.load_history_dfd = null;
                            this.handleOnScrollRendering('bottom');
                        });
                        chat.item_view.content.loadPreviousHistory(null, this.load_history_dfd && this.load_history_dfd);
                    }
                }
            }
        }
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
