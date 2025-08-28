import xabber from "xabber-core";

let env = xabber.env,
    constants = env.constants,
    templates = env.templates.notifications,
    utils = env.utils,
    $ = env.$,
    Strophe = env.Strophe,
    _ = env._,
    moment = env.moment,
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
            return utils.pretty_date(timestamp, (xabber.settings.language === 'ru-RU' || xabber.settings.language === 'default' && xabber.get("default_language") === 'ru-RU') && 'dddd, D MMMM YYYY')
        }
    },
    pretty_datetime = (timestamp) => { return utils.pretty_datetime(timestamp, (xabber.settings.language === 'ru-RU' || xabber.settings.language === 'default' && xabber.get("default_language") === 'ru-RU') && 'D MMMM YYYY HH:mm:ss')};


xabber.ClientNotificationsContainer = xabber.BasicView.extend({
    className: 'client-notifications-container',
    events: {
    },
});

xabber.NotificationsBodyContainer = xabber.Container.extend({
    className: 'notifications-body-container',
});

xabber.NotificationsView = xabber.BasicView.extend({
    className: 'notifications-content-wrap',
    template: templates.notifications_view,
    ps_selector: '.left-column-filters-container',
    avatar_size: constants.AVATAR_SIZES.SYNCHRONIZE_ACCOUNT_ITEM,

    events: {
        "click .btn-accounts-filter": "selectAccounts",
        "click .tab-filter-item": "removeFilter",
        "click .notifications-filter-main-header": "clickClearFilter",
        "click .notifications-type-filter-content .filter-item-wrap": "filterContent",
        "click .notification-subscriptions-button": "filterContent",
        "click .notifications-calendar-day": "showDay",
        "click .btn-read-all": "readAll",
        "click .btn-play-pause-plyr": "playPausePlyr",
        "click .btn-next-plyr": "nextPlyr",
        "click .btn-previous-plyr": "previousPlyr",
        "click .btn-stop-plyr": "stopPlyr",
        "click .chat-tool-player-containter": "popupPlyr",
        "click .btn-back-to-chats": "clickBackToChats",
        "keyup .search-input": "keyUpSearch",
        "click .search-form": "focusSearch",
        "click .btn-show-search": "focusSearch",
        "click .close-search-icon": "clearSearch",

    },

    _initialize: function () {
        this.listenTo(xabber.accounts, 'list_changed connected_list_changed notification_chat_created account_color_updated add destroy', this.updateAccountsFilter);
        this.listenTo(xabber.accounts, 'change:enabled', this.updateAccountsFilter);
        this.listenTo(xabber.accounts, 'change:connected', this.updateAccountsFilter);
        this.listenTo(xabber, 'plyr_player_updated', this.updatePlyrControls);
        this.listenTo(xabber, 'plyr_player_time_updated', this.updatePlyrTime);
        this.listenTo(xabber, 'update_layout', this.updatePlyrTitle);
        this.listenTo(xabber, 'update_client_notifications', this.updateClientNotifications);
        return this;
    },

    render: function () {
        if (this.current_content && !(_.isUndefined(this.current_content.saved_scroll) || _.isNull(this.current_content.saved_scroll))){
            this.current_content.scrollTo(this.current_content.saved_scroll);
            this.current_content.saved_scroll = null;
            return;
        }
        this.clearFilter();
        this.clearSearch();
        this.updateAccountsFilter();
        this.$('.notifications-utility .notifications-header').text(xabber.getString("notifications_window__type_filter_all"));
        this.showReadAllBtn();
        this.renderCalendar();
        this.updateScrollBar();
        this.updatePlyrControls();
        this.updatePlyrTime();
        this.updateClientNotifications();
        this.$('.dropdown-button').dropdown({
            inDuration: 100,
            outDuration: 100,
            hover: false,
            belowOrigin: true,
        });
        this.updateFilterItems();
    },

    focusSearch: function () {
        this.$('.search-input').focus();
    },

    keyUpSearch: function (ev) {
        let $item = $(ev.target).closest('.search-input'),
            value = $item.text();
        $item.closest('.search-form').switchClass('active', value);
        if (!value)
            $item.empty();
    },

    clearSearch: function () {
        this.$('.search-input').empty();
        this.$('.search-form').removeClass('active');
    },

    clickBackToChats: function () {
        xabber.toolbar_view.showAllChats(null, null, true);
    },

    clickClearFilter: function () {
        if (this.current_content && this.current_content.notifications_chats && this.current_content.notifications_chats.length){
            if (this.current_content.filter_type === 'all' && this.current_content.notifications_chats.length === 1)
                this.current_content.scrollToTop();
            else {
                this.clearFilter();
                this.updateAccountsFilter();
                this.updateFilterItems();
            }
        }
    },

    updateClientNotifications: function () {
        this.$('.client-notifications-wrap').find('.client-notifications-container').detach();

        if (xabber.placeholders_wrap && this.isVisible()){
            this.$('.client-notifications-wrap').append(xabber.placeholders_wrap.$el);
        }
        this.$('.client-notifications-wrap').switchClass('hidden', !xabber.placeholders_wrap.$el.children().length)
    },

    removeFilter: function (ev) {
        let $item = $(ev.target).closest('.tab-filter-item'),
            filter_type = $item.attr('data-type');
        if (!this.current_content){
            this.$('.tab-filter-item').remove();
            return;
        }

        if (filter_type === 'filter_type'){
            this.current_content.filter_type = 'all';
            this.$('.notifications-type-filter-content .filter-item-wrap').removeClass('selected-filter');
            this.$('.notifications-type-filter-content .filter-item-wrap[data-filter="all"]').addClass('selected-filter');
            this.current_content.updateAllIncomingSubscriptions();
            this.current_content.$el.removeClass('subscription-content');
            this.$('.notifications-utility').removeClass('subscription-content');
            this.$el.removeClass('subscription-content');
            this.current_content.$el.removeClass('invitation-content');
            this.$('.notifications-utility').removeClass('invitation-content');
            this.$el.removeClass('invitation-content');
            this.current_content.$el.removeClass('security-content');
            this.current_content.$el.removeClass('subscription-content-hidden');
        }
        $item.remove();
        this.current_content.FilterMessagesInChat(true);

    },

    updateFilterItems: function () {
        this.$('.tab-filter-item').remove();
        if (this.current_content){
            if (this.current_content.filter_type !== 'all'){
                $(env.templates.contacts.tab_filter_item_main_color({
                    value: this.current_content.filter_type,
                    type: 'filter_type',
                    text: xabber.getString(`notifications_window__type_filter_${this.current_content.filter_type}`)
                })).insertBefore(this.$('.search-form'));
            }
            if (this.current_content.filtered_accounts.length){
                let account = xabber.accounts.find(item => item.get('jid') === this.current_content.filtered_accounts[0]);
                this.$('.tab-active-filters-wrap').attr('data-color', account.settings.get('color'));
                this.$('.notifications-calendars-wrap').attr('data-color', account.settings.get('color'));
                this.$('.tab-additional-filter-item .tab-filter-item-text').text(this.current_content.filtered_accounts[0]);
            } else if (xabber.accounts.enabled.length === 1) {
                let account = xabber.accounts.enabled[0];
                this.current_content.filtered_accounts = [account.get('jid')];
                this.$('.tab-active-filters-wrap').attr('data-color', account.settings.get('color'));
                this.$('.notifications-calendars-wrap').attr('data-color', account.settings.get('color'));
                this.$('.tab-additional-filter-item .tab-filter-item-text').text(this.current_content.filtered_accounts[0]);
            } else {
                this.$('.tab-active-filters-wrap').attr('data-color', '');
                this.$('.notifications-calendars-wrap').attr('data-color', '');
                this.$('.tab-additional-filter-item .tab-filter-item-text').text(xabber.getString("notifications_window__type_filter_all_accounts"));
            }
        }
    },

    playPausePlyr: function () {
        xabber.playPausePlyr();
    },

    stopPlyr: function () {
        xabber.stopPlyr();
    },

    popupPlyr: function (ev) {
        xabber.popupPlyr(ev);
    },

    nextPlyr: function () {
        xabber.nextPlyr();
    },

    previousPlyr: function () {
        xabber.previousPlyr();
    },

    updatePlyrControls: function () {
        xabber.updatePlyrControls(this);
    },

    updatePlyrTitle: function () {
        xabber.updatePlyrTitle(this);
    },

    updatePlyrTime: function () {
        xabber.updatePlyrTime(this);
    },

    clearFilter: function () {
        if (this.current_content){
            let clear;
            if (this.current_content.filter_type !== 'all'){
                this.current_content.filter_type = 'all';
                this.$('.notifications-type-filter-content .filter-item-wrap').removeClass('selected-filter');
                this.$('.notifications-type-filter-content .filter-item-wrap[data-filter="all"]').addClass('selected-filter');
                this.current_content.updateAllIncomingSubscriptions();
                this.current_content.$el.removeClass('security-content');
                this.current_content.$el.removeClass('subscription-content');
                this.$('.notifications-utility').removeClass('subscription-content');
                this.$el.removeClass('subscription-content');
                this.current_content.$el.removeClass('invitation-content');
                this.$('.notifications-utility').removeClass('invitation-content');
                this.$el.removeClass('invitation-content');
                this.current_content.$el.removeClass('subscription-content-hidden');
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

        if (this.current_content){
            if (this.current_content.filtered_messages && this.current_content.filtered_messages.length) {
                this.current_content.updateCalendarCellsActivity(this.current_content.filtered_messages);
            } else {
                this.current_content.updateCalendarCellsActivity(this.current_content.notification_messages.filter(msg => !msg.get('ignored')));
            }
        }
    },


    onShowNotificationsTab: function () {
        if (this.current_content){
            this.current_content.onShowNotificationsTab();
        }
    },

    showReadAllBtn: function () {
        if (this.current_content && this.current_content.notification_messages.filter(msg => msg.get('is_unread') && !msg.get('ignored')).length){
            this.$('.btn-read-all').removeClass('btn-disabled');
        } else {
            this.$('.btn-read-all').addClass('btn-disabled');
        }
    },

    readAll: function (ev) {
        if ($(ev.target).closest('.btn-disabled').length)
            return;
        if (!this.current_content)
            return;
        this.current_content.readNotifications();
        this.current_content.readAllNotifications();
    },

    cancelTrustSession: function (ev) {
    },

    enterCode: function (ev) {
    },

    filterContent: function (ev) {
        if (!this.current_content)
            return;
        let $item = $(ev.target).closest('.filter-item-wrap');
        if (!$item.length){
            $item = $(ev.target).closest('.notification-subscriptions-button')
        }
        let filter_type = $item.attr('data-filter');
        if ($item.hasClass('selected-filter')){
            filter_type = 'all';
        }
        this.$('.notifications-type-filter-content .filter-item-wrap').removeClass('selected-filter');
        this.$('.notifications-type-filter-content .filter-item-wrap[data-filter="all"]').addClass('selected-filter');
        this.current_content.$el.removeClass('subscription-content');
        this.$('.notifications-utility').removeClass('subscription-content');
        this.$el.removeClass('subscription-content');
        this.current_content.$el.removeClass('invitation-content');
        this.$('.notifications-utility').removeClass('invitation-content');
        this.$el.removeClass('invitation-content');
        this.current_content.$el.removeClass('security-content');
        this.current_content.$el.removeClass('subscription-content-hidden');
        if (filter_type !== 'all') {
            if (filter_type === 'invitations') {
                this.current_content.$el.addClass('invitation-content');
                this.$el.addClass('invitation-content');
                this.$('.notifications-utility').addClass('invitation-content');
                this.$('.notification-subscription-item').removeClass('hidden');
                this.current_content.updateCalendarCellsActivity([]);
            } else if (filter_type === 'subscription') {
                this.current_content.$el.addClass('subscription-content');
                this.$el.addClass('subscription-content');
                this.$('.notifications-utility').addClass('subscription-content');
                this.$('.notification-subscription-item').removeClass('hidden');
                this.current_content.updateCalendarCellsActivity([]);
            } else if (filter_type === 'security') {
                this.current_content.$el.addClass('security-content');
                this.current_content.$el.addClass('subscription-content-hidden');
            } else {
                this.current_content.$el.addClass('subscription-content-hidden');
            }
            this.$('.notifications-type-filter-content .filter-item-wrap').removeClass('selected-filter');
            this.$(`.notifications-type-filter-content .filter-item-wrap[data-filter="${filter_type}"]`).addClass('selected-filter');
        }
        this.current_content.filterByProperty(filter_type);
        this.updateFilterItems();
    },

    showDay: function (ev) {
        this.current_content && this.current_content.showDay(ev);
    },

    updateAccountsFilter: function () {
        let accounts = xabber.accounts.enabled;
        accounts = accounts.filter(item => item.server_features.get(Strophe.NS.XABBER_NOTIFY));
        this.$('.tab-additional-filter-item').switchClass('hidden', accounts.length === 1 || !accounts.length);
        if (accounts.length){
            try{
                this.$('.additional-filter-variant').remove();
                _.each(accounts, (account) => {
                    this.$('.accounts-dropdown').append($(`<div class="property-variant btn-accounts-filter additional-filter-variant" data-jid="${account.get('jid')}"><span class="one-line">${account.get('jid')}</span></div>`));
                });
                this.updateCurrentNotifications();
            } catch (e) {
                console.error(e)
            }
        } else {
            // if no accounts
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
                this.updateCurrentNotifications();
            }
        }
        this.updateScrollBar();
    },

    renderAccountItem: function (account) {
        return $(templates.account_filter_item({jid: account.get('jid'), color: account.settings.get('color')}));
    },

    selectAccounts: function (ev) {

        let $item = $(ev.target).closest('.btn-accounts-filter');
        if (!$item.attr('data-jid')) {
            $item.remove();
            return;
        }

        if (this.current_content) {
            if ($item.attr('data-jid') === 'all'){
                this.current_content.filterByAccounts([]);
            } else {
                this.current_content.filterByAccounts([$item.attr('data-jid')]);
            }
            this.updateFilterItems();
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
        "click .btn-join-group": "joinGroup",
        "click .btn-block": "blockContact",
        "click .subscription-switch-item": "switchSubscription",
        "click .subscription-show-text-btn": "showText",
        "click .subscription-item-jid": "openSubscriptionChat",
        "click .invitation-notifications-item-member-name": "onClickName",
        "click .circle-avatar.member-avatar": "onClickName",
        "click .inviter-name": "onClickName",
    },

    _initialize: function () {

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

        this.listenTo(this.notification_messages, 'change:last_replace_time', this.updateMessage);
        this.listenTo(this.notification_messages, 'add', this.addMessage);
        this.listenTo(this.notification_messages, 'change:is_unread', this.onChangedReadState);
        this.listenTo(this.notification_messages, 'change:timestamp', this.onChangedMessageTimestamp);
        this.listenTo(xabber.accounts, 'account_color_updated', this.updateColorScheme);
        this.listenTo(xabber, 'invitations_updated', this.updateAllIncomingSubscriptions);

        return this;
    },

    render: function () {
        if (this._prev_scrolltop)
            this.scrollTo(this._prev_scrolltop);
        else
            this.scrollToBottom();
        this.onScroll();
        this.updateAllIncomingSubscriptions();

        this.$el.addClass('chat-body-container-notifications');
    },

    updateColorScheme: function () {
        _.each(xabber.accounts.models, (account) => {
            this.$(`div[data-account-jid="${account.get('jid')}"`).attr('data-color', account.settings.get('color'));
        });
    },

    readAllNotifications: function () {
        let unread_notifications = this.notification_messages.filter(msg => msg.get('is_unread') && !msg.get('ignored'));

        if (this.filtered_accounts && this.filtered_accounts.length){
            unread_notifications = unread_notifications.filter((msg) => msg.collection && msg.collection.account && this.filtered_accounts.includes(msg.collection.account.get('jid')));
        }
        if (this.filter_type !== 'all'){
            if (this.filter_type === 'security'){
                unread_notifications = unread_notifications.filter((msg) => msg.get('security_notification') && !msg.get('notification_info') && !msg.get('notification_mention'));
            } else if (this.filter_type === 'information'){
                unread_notifications = unread_notifications.filter((msg) => msg.get('notification_info'));
            } else if (this.filter_type === 'mentions'){
                unread_notifications = unread_notifications.filter((msg) => msg.get('notification_mention'));
            }
        }

        _.each(unread_notifications, (msg) => {
            let chat;
            if (msg.collection && msg.collection.chat) {
                chat = msg.collection.chat;
            }
            if (chat && chat.item_view && !chat.item_view.content)
                chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});

            if (!chat || !chat.item_view || !chat.item_view.content)
                return;

            msg.set('is_unread', false);

            if (chat.get('const_unread') !== 0 && !isNaN(Number(chat.get('const_unread')))) {
                let const_unread = chat.get('const_unread');
                const_unread = --const_unread;
                chat.set('const_unread', const_unread);
            }
        });

        xabber.notifications_view.showReadAllBtn();
        _.each(this.notifications_chats, (item) => {
            if (item && item.chat)
                item.chat.set('const_unread', 0);
        });
        xabber.toolbar_view.recountAllMessageCounter();
        this.recountFilteredCount();
    },

    onClickNotification: function (ev) {
        let $elem = $(ev.target).closest('.chat-message'),
            $clicked_elem = $(ev.target);
        let unique_id = $elem.attr('data-uniqueid'),
            msg = this.notification_messages.get(unique_id);

        let chat;
        if (msg && msg.collection && msg.collection.chat) {
            chat = msg.collection.chat;
        }
        if (chat && chat.item_view && !chat.item_view.content)
            chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});

        if (!chat || !chat.item_view|| !chat.item_view.content) {
            return;
        }


        if ($clicked_elem.closest(".msg-hyperlink").length > 0) {
            ev && ev.preventDefault();
            $clicked_elem.blur();
            let link = $clicked_elem.closest(".msg-hyperlink").attr('href');
            utils.dialogs.ask(xabber.getString("open_this_link"), decodeURI(link), null, {ok_button_text: xabber.getString("open")}).done((result) => {
                if (result)
                    utils.openWindow(link);
            });
            return;
        }
        if ($elem.hasClass('unread-message-background')){
            let is_in_unread = chat.messages_unread.get(msg);
            if (msg.get('is_unread')){}
            msg.set('is_unread', false);
            if (!is_in_unread && chat.get('const_unread') !== 0 && !isNaN(Number(chat.get('const_unread')))) {
                let const_unread = chat.get('const_unread');
                const_unread = --const_unread;
                chat.set('const_unread', const_unread);
            }
            xabber.notifications_view.showReadAllBtn();
            if (!this.$('.unread-message-background').length){
                chat.set('const_unread', 0);
            }
            xabber.toolbar_view.recountAllMessageCounter();
            this.recountFilteredCount();
        }
        if (msg.get('notification_mention') && msg.get('groupchat_jid') && msg.get('mention_msg_uniqueid')){
            let groupchat_contact = msg.collection.account.contacts.get(msg.get('groupchat_jid')),
                groupchat = msg.collection.account.chats.getChat(groupchat_contact),
                account  = msg.collection.account;

            groupchat.getMessageContext(msg.get('mention_msg_uniqueid'), {open_mention_notification: true }, () => {

                let remove_list = this.notification_messages.filter(item => item.get('unique_id') === msg.get('unique_id')),
                    new_list = this.notification_messages.filter(item => item.get('unique_id') !== msg.get('unique_id'));

                _.each(remove_list, (item) => {
                    this.removeMessageFromDOM(item);
                });
                remove_list.length && this.notification_messages.reset(new_list);

                account.cached_notifications.removeFromCachedNotifications(msg.get('stanza_id'));
                account.retractMessageById(msg.get('stanza_id'), account.get('jid'), chat.get('jid'), chat.get('sync_type'));

            });

        }
    },

    recountFilteredCount: function () {

        let accounts = xabber.accounts.enabled,
            subscription_counter = 0,
            invitations_counter = 0,
            security_counter, information_counter, mention_counter,
            unread_msgs = this.notification_messages.filter(msg => msg.get('is_unread') && !msg.get('ignored'));

        if (this.filtered_accounts.length){
            accounts = accounts.filter(item => this.filtered_accounts.includes(item.get('jid')));
            unread_msgs = unread_msgs.filter((msg) => msg.collection && msg.collection.account && this.filtered_accounts.includes(msg.collection.account.get('jid')))
        }

        _.each(accounts, (account) => {
            let subs_contacts = account.contacts.filter(item => item.get('subscription_request_in'));
            subscription_counter = subscription_counter + subs_contacts.length;
            let inv_contacts = account.contacts.filter(item => item.get('invitation'));
            invitations_counter = invitations_counter + inv_contacts.length;
        });

        security_counter = unread_msgs.filter(msg => msg.get('security_notification') && !msg.get('notification_info') && !msg.get('notification_mention')).length;
        information_counter = unread_msgs.filter(msg => msg.get('notification_info')).length;
        mention_counter = unread_msgs.filter(msg => msg.get('notification_mention')).length;

        xabber.notifications_view.$('.filter-item-wrap[data-filter="security"] span').text(security_counter || '');
        xabber.notifications_view.$('.filter-item-wrap[data-filter="information"] span').text(information_counter || '');
        xabber.notifications_view.$('.filter-item-wrap[data-filter="mentions"] span').text(mention_counter || '');
        xabber.notifications_view.$('.filter-item-wrap[data-filter="subscription"] span').text(subscription_counter || '');
        xabber.notifications_view.$('.filter-item-wrap[data-filter="invitations"] span').text(invitations_counter || '');
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
        return xabber.notifications_view.$('.notifications-calendar-day').filter(function() {
            // Обнуляем время в атрибуте data-timestamp ячейки
            let cellTimestamp = parseInt($(this).attr('data-timestamp'), 10),
                cellDate = new Date(cellTimestamp);
            cellDate.setHours(0, 0, 0, 0);

            return cellDate.getTime() === dateOnlyTimestamp;
        });
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
                xabber.trigger('new_incoming_subscription');
            });
        else {
            this.sendAndAskSubscription(contact);
            xabber.trigger('new_incoming_subscription');
        }
    },

    joinGroup: function (ev) {
        let $item = $(ev.target).closest('.notification-subscription-item');
        if (!$item.attr('data-jid') || !$item.attr('data-account-jid'))
            return;
        let account = xabber.accounts.enabled.find(acc => acc.get('jid') === $item.attr('data-account-jid'));
        if (!account)
            return;
        let contact = account.contacts.get($item.attr('data-jid'));
        if (!contact)
            return;

        if (contact.invitation){
            xabber.toolbar_view.showAllChats();
            contact.invitation.join();
        }
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


        if (contact.invitation){
            contact.invitation.reject(true);
        } else {
            contact.declineSubscribe();
            contact.set('subscription_request_in', false);
            xabber.trigger('new_incoming_subscription');
        }
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

        if (contact.invitation){
            contact.invitation.blockContact(true);
        } else {
            contact.declineSubscribe();
            contact.set('subscription_request_in', false);
            setTimeout(()=> {
                contact.blockRequest();
            }, 1000);
            xabber.trigger('new_incoming_subscription');
        }
    },

    onShow: function () {
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
        remove_list.length && this.notification_messages.reset(new_list);

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
    },

    onShowNotificationsTab: function () {
        xabber.notifications_view.clearFilter();
        if (!this.$el.children('.preloader-wrapper').length)
            this.$el.append($(env.templates.contacts.preloader()));
        this.$el.children('.preloader-wrapper').addClass('hidden');
        this.$el.children('.preloader-wrapper').removeClass('visible');
        this.onScroll();
        this.renderMessages();
        setTimeout(() => {
            this.onScroll();
        }, 1500);
    },

    readNotifications: function () { //34
        if (!this.isVisible() || !xabber.get('focused'))
            return;
        _.each(this.notifications_chats, (chat_item) => {
            if (!chat_item.chat)
                return;
            if (chat_item.chat.item_view && !chat_item.chat.item_view.content)
                chat_item.chat.item_view.content = new xabber.ChatContentView({chat_item: chat_item.chat.item_view});
            if ((chat_item.chat.get('unread') || chat_item.chat.get('const_unread')) && chat_item.chat.last_message){
                chat_item.chat.item_view.content.readMessages(null, true);
                chat_item.chat.account.cached_notifications.getAllFromCachedNotifications((res) => {
                    if (res.length){
                        res = res.filter(item => item.is_unread);
                        _.each(res, (msg_item) => {
                            if (msg_item.is_unread){
                                chat_item.chat.account.cached_notifications.putInCachedNotifications({
                                    stanza_id: msg_item.stanza_id,
                                    xml: msg_item.xml,
                                    is_unread: false,
                                    is_click_readen: true,
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
                    is_click_readen: true,
                },(res) => {

                })
            }
        }
        this.updateUnreadMentions(message, is_unread);

        xabber.notifications_view.showReadAllBtn();
        this.recountFilteredCount();
    },

    updateUnreadMentions: function (message, is_unread) {
        if (message.get('notification_mention') && message.get('groupchat_jid') && message.get('mention_msg_uniqueid')){
            let groupchat_contact = message.collection.account.contacts.get(message.get('groupchat_jid')),
                groupchat = message.collection.account.chats.getChat(groupchat_contact);

            let mention_messages = message.collection.filter(item => item.get('notification_mention')
                && item.get('groupchat_jid')
                && item.get('mention_msg_uniqueid')
                && item.get('is_unread')
            ), list_of_mention_ids;
            if (mention_messages.length){
                list_of_mention_ids = mention_messages.map(item => {
                return {
                    msg_id: item.get('mention_msg_uniqueid'),
                    notification_id: item.get('unique_id')
                }});
            }
            if (groupchat.get('mentions_value')){
                let mentions_value = groupchat.get('mentions_value');
                if (is_unread)
                    mentions_value.unread_mentions = mentions_value.unread_mentions + 1;
                else
                    mentions_value.unread_mentions = mentions_value.unread_mentions - 1;
                if (mentions_value.unread_mentions < 1)
                    mentions_value = null;
                else if (is_unread) {
                    if (mentions_value.first_mention_timestamp > message.get('timestamp')) {
                        mentions_value.first_mention_id = message.get('mention_msg_uniqueid');
                        mentions_value.first_mention_timestamp = message.get('timestamp');
                        mentions_value.notification_unique_id = message.get('unique_id');
                    }
                } else {
                    let mention_messages = this.notification_messages.filter(item =>
                        item.get('notification_mention')
                        && item.get('groupchat_jid') && groupchat.get('jid') === item.get('groupchat_jid')
                        && item.get('mention_msg_uniqueid')
                        && item.get('is_unread')
                    );
                    if (mention_messages.length){
                        message = mention_messages[0];
                        mentions_value.first_mention_id = message.get('mention_msg_uniqueid');
                        mentions_value.first_mention_timestamp = message.get('timestamp');
                        mentions_value.notification_unique_id = message.get('unique_id');
                    } else {
                        mentions_value = null;
                    }
                }
                mentions_value && (mentions_value.mention_ids_list = []);
                list_of_mention_ids && mentions_value && (mentions_value.mention_ids_list = list_of_mention_ids);
                groupchat.set('mentions_value', mentions_value);
                groupchat.trigger('update_unread_mentions');
            } else if (is_unread) {
                groupchat.set('mentions_value', {
                    unread_mentions: 1,
                    first_mention_id: message.get('mention_msg_uniqueid'),
                    first_mention_timestamp: message.get('timestamp'),
                    notification_unique_id: message.get('unique_id'),
                    mention_ids_list: list_of_mention_ids || [],
                });
                groupchat.trigger('update_unread_mentions');
            }
        }
    },

    readMessage: function (msg_id) { //34
        let message = this.notification_messages.find(item => item.get('unique_id') === msg_id);
        if (message && message.collection.chat){
            let chat = message.collection.chat;

            let is_in_unread = chat.messages_unread.get(message);
            if (message.get('is_unread'))
                message.set('is_unread', false);
            if (!is_in_unread && chat.get('const_unread') !== 0 && !isNaN(Number(chat.get('const_unread')))) {
                let const_unread = chat.get('const_unread');
                const_unread = --const_unread;
                chat.set('const_unread', const_unread);
            }
            xabber.notifications_view.showReadAllBtn();
            if (!this.$('.unread-message-background').length){
                chat.set('const_unread', 0);
            }
            xabber.toolbar_view.recountAllMessageCounter();
            this.recountFilteredCount();

        }
    },

    filterByAccounts: function (accounts, cleared) {
        this.filtered_accounts.length && !accounts.length && (cleared = true);
        if ((!accounts || !accounts.length) && xabber.accounts.enabled.length === 1) {
            accounts = [xabber.accounts.enabled[0].get('jid')];
        }
        this.filtered_accounts = accounts;
        this.FilterMessagesInChat(cleared);
    },

    filterByProperty: function (filter_type) {
        if (this.filter_type === filter_type)
            return;
        this.filter_type = filter_type;
        this.FilterMessagesInChat(true);
    },

    showDay: function (ev, exclude_jids) {
        exclude_jids = exclude_jids || [];
        let $item = $(ev.target).closest('.notifications-calendar-day');

        if (_.isNaN(Number($item.attr('data-activity-value'))) || !Number($item.attr('data-activity-value')))
            return;

        let startOfDayTimestamp = parseInt($item.attr('data-timestamp'), 10),
            endOfDayTimestamp = startOfDayTimestamp + 86400000;

        let firstElementInDay = this.$('.chat-message[data-time]').filter(function() {
            let elementTime = parseInt($(this).attr("data-time"), 10);
            return elementTime >= startOfDayTimestamp && elementTime < endOfDayTimestamp;
        }).first();

        this.$('.chat-content').addClass('hidden');
        this.$el.children('.preloader-wrapper').removeClass('hidden');

        setTimeout(() => {
            if (firstElementInDay.length) {
                this.$('.chat-content').removeClass('hidden');
                this.$el.children('.preloader-wrapper').addClass('hidden');
                this.handleOnScrollRendering('bottom', true);

                let $prevDateElement = firstElementInDay.prev('.chat-day-indicator');
                if ($prevDateElement.length){

                    $prevDateElement.addClass('date-from-context');
                    setTimeout(() => {
                        $prevDateElement.removeClass('date-from-context')
                    }, 1000);
                }
                this.scrollTo(firstElementInDay.position().top + this.getScrollTop() - 40);
                this.handleOnScrollRendering('bottom');
            } else {
                let fully_rendered = this.handleOnScrollRendering('bottom', true, 200, exclude_jids);
                if (fully_rendered && fully_rendered.exclude_jid){
                    exclude_jids.push(fully_rendered.exclude_jid);
                    this.showDay(ev, exclude_jids);
                    return
                }
                if (!fully_rendered){
                    this.showDay(ev, exclude_jids);
                }
            }
        }, 10);
    },

    removeMessage: function (item) {
    },

    addTrustSessionsContainer: function () {
    },

    onClickName: function (ev) {
        let $item;
        if ($(ev.target).closest('.invitation-notifications-item-member-name').length){
            $item = $(ev.target).closest('.invitation-notifications-item-member-name');
        } else if ($(ev.target).closest('.circle-avatar.member-avatar').length) {
            $item = $(ev.target).closest('.circle-avatar.member-avatar');
        } else if ($(ev.target).closest('.inviter-name:not(.private-chat-inviter)').length) {
            $item = $(ev.target).closest('.inviter-name:not(.private-chat-inviter)');
        }
        if (!$item || !$item.length)
            return;
        let $invite_item = $item.closest('.notification-subscription-item'),
            account_jid = $invite_item.attr('data-account-jid'),
            contact_jid = $item.attr('data-jid'),
            update_avatar;


        let account = xabber.accounts.find(item => item.get('jid') === account_jid);
        if (!account)
            return;

        let contact = account.contacts.get(contact_jid);
        if (!contact)
            contact = account.contacts.mergeContact(contact_jid);

        let dfd = new $.Deferred();

        dfd.done(() => {
            let scrolled_top = this.getScrollTop();
            this.saved_scroll = scrolled_top;
            contact.showDetailsRight('notifications');
            if (update_avatar && contact.details_view_right){
                contact.details_view_right.updateAvatar();
            }
            this.saved_scroll = scrolled_top;
            if (xabber.chats_view.active_chat && xabber.chats_view.active_chat.model) {
                xabber.chats_view.active_chat.model.set('active', false);
            }
        });

        if (!contact.get('avatar_priority')) {
            let photo_url = $invite_item.find(`.circle-avatar.member-avatar[data-jid="${contact_jid}"]`).attr('data-avatar-url');
            if (photo_url) {
                contact.set({
                    image: photo_url,
                    forced_group_avatar: true,
                });
                contact.cached_image = photo_url;
                update_avatar = true;
            }
        }
        dfd.resolve();
    },

    addIncomingSubscriptionContainer: function () {
        this.$('.chat-content').prepend($(templates.incoming_invitations_container()));
        this.updateAllIncomingSubscriptions();
    },

    updateAllIncomingSubscriptions: function () {
        this.$('.notification-subscriptions-wrap.notifications-invitations').addClass('hidden');
        return;

        this.$('.notification-subscriptions-content-wrap').html('');
        this.$('.notification-invitations-content-wrap').html('');
        let accounts = xabber.accounts.enabled;
        let subs_counter = 0,
            inv_counter = 0,
            inv_color_set = false;
        if (this.filtered_accounts.length){
            accounts = accounts.filter(item => this.filtered_accounts.includes(item.get('jid')));
        }
        this.$('.subscription-switch-container').remove();
        _.each(accounts, (account) => {
            let contacts = account.contacts.filter(item => item.get('invitation'));
            _.each(contacts, (contact) => {
                let $template = $(templates.incoming_subscriptions_item({
                    name: contact.get('name'),
                    jid: contact.get('jid'),
                    account: account.get('jid'),
                    text: contact.get('subscription_request_in_text'),
                    counter: contact.get('invitation') ? inv_counter : subs_counter,
                    group_chat: contact.get('group_chat'),
                }));
                this.$('.notification-invitations-content-wrap').append($template);
                if (contact.invitation){
                    contact.invitation.message && $template.find('.subscription-invitation-item-user-text').text(contact.invitation.message.get('message'));
                    if (contact.invitation.members_count) {
                        $template.find('.subscription-item-members-text').html(`<span class="invitation-notifications-item-members-count">${xabber.getString("groupchats_some_members", [Number(contact.invitation.members_count)])}</span>`);
                        let names_count = 0,
                            avatars_count = 0;

                        if (contact.invitation.participants.length){
                            $template.find('.subscription-item-members-text').append(`<span>, ${xabber.getString("including")}</span>`);
                            _.each(contact.invitation.participants, (member) => {
                                if (names_count < 5){
                                    $template.find('.subscription-item-members-text')
                                        .append(` <span class="invitation-notifications-item-member-name${!member.in_roster ? ' not-contact-member' : ''}" data-jid="${member.jid}" data-avatar-url="${member.avatar_url}">${member.name}</span>${(names_count === 4 || (names_count + 1) === contact.invitation.participants.length) ? '.' : ',' }`);
                                    names_count++;
                                }
                                if (avatars_count < 11 && member.avatar_url){
                                    let $avatar = $(`<div class="circle-avatar member-avatar${!member.in_roster ? ' not-contact-member' : ''}" data-jid="${member.jid}" data-avatar-url="${member.avatar_url}"></div>`);
                                    $avatar.setAvatar(member.avatar_url, 64, account);
                                    $template.find('.subscription-item-members-avatars').append($avatar);
                                    avatars_count++;
                                }
                            });
                        }
                    }

                }
                if (contact.get('group_chat')){
                    if (contact.invitation && contact.invitation.message && contact.invitation.message.get('inviter_jid')){
                        let inviter_contact = account.contacts.get(contact.invitation.message.get('inviter_jid'));
                        if (!inviter_contact){
                            inviter_contact = account.contacts.mergeContact({jid: contact.invitation.message.get('inviter_jid')})
                        }
                        let inviter_image = inviter_contact.cached_image;
                        $template.find('.circle-avatar.subscribe-avatar').setAvatar(inviter_image, 64, account);

                        let group_image = contact.cached_image;
                        $template.find('.circle-avatar.group-avatar').setAvatar(group_image, 64, account);

                        $template.find('.subscription-invitation-item-group-wrap').removeClass('hidden');
                        let group_name = xabber.getString("groupchat_public_group");
                        if (contact.get('incognito_chat'))
                            group_name = xabber.getString("groupchat_incognito_group");
                        if (contact.get('private_chat'))
                            group_name = xabber.getString("groupchat_private_chat");

                        if (inviter_contact.get('name') === inviter_contact.get('jid')){
                            $template.find('.subscription-invitation-item-main-text')
                                .html(`<span class="inviter-name${contact.get('private_chat') ? ' private-chat-inviter' : ''}" data-jid="${inviter_contact.get('jid')}">${inviter_contact.get('name')}</span> ${xabber.getString("notifications_window__subscriptions_group_chat_invitation_main_text")} <span class="invitation-link text-color-700">${group_name}</span>:`)
                        } else {
                            $template.find('.subscription-invitation-item-main-text')
                                .html(`<span class="inviter-name${contact.get('private_chat') ? ' private-chat-inviter' : ''}" data-jid="${inviter_contact.get('jid')}">${inviter_contact.get('name')}</span> (<span class="inviter-jid">${inviter_contact.get('jid')}</span>) ${xabber.getString("notifications_window__subscriptions_group_chat_invitation_main_text")} <span class="invitation-link text-color-700">${group_name}</span>:`)
                        }
                        let icon_name = 'group-public';
                        if (contact.get('incognito_chat'))
                            icon_name = 'group-incognito';
                        if (contact.get('private_chat'))
                            icon_name = 'group-private';
                        $template.find('.notification-icon.group-invite-icon').html(env.templates.svg[icon_name]());
                    }
                }
                $template.attr('data-color', contact.account.settings.get('color'));
                $template.attr('data-counter', inv_counter);
                inv_counter++;
                $template.find('.notification-icon.subscribe-icon').html(env.templates.svg['group-invite']());
                this.$('.notification-subscriptions-wrap.notifications-invitations').prop('class', 'notification-subscriptions-wrap notifications-invitations');
                this.$('.notification-subscriptions-wrap.notifications-invitations').addClass(`outline-color-${contact.account.settings.get('color')}-300`);
                inv_color_set = true;
                this.prepareShowMoreText($template);
            });
        });
        if (inv_counter > 0) {
            this.$('.notifications-invitations .notification-subscriptions-button-wrap').removeClass('hidden');
        } else {
            this.$('.notifications-invitations .notification-subscriptions-button-wrap').addClass('hidden');
        }
        xabber.notifications_view.$('.invitation-item-wrap').switchClass('hidden', inv_counter === 0);
        this.$('.notification-subscriptions-wrap.notifications-invitations').switchClass('hidden', inv_counter === 0);
        this.filter_type !== 'invitations' && this.$('.notifications-invitations .notification-subscription-item').slice(2).addClass('hidden');
        xabber.toolbar_view.recountAllMessageCounter();
        this.recountFilteredCount();
    },

    switchSubscription: function (ev) {
    },

    prepareShowMoreText: function ($item) {
        let text = $item.find('.subscription-item-text-backup').text(),
            showChar = 100;

        if (text.length > showChar){

            let c = text.substr(0, showChar);
            let h = text.substr(showChar, text.length - showChar);

            let html = c + '<span class="moreellipses">... </span><span><span class="subscription-more-text hidden">' + h + '</span>  <span class="subscription-show-text-btn">' + xabber.getString("more") + '</span></span>';

            $item.find('.subscription-item-text').html(`${html}`);

        } else {
            $item.find('.subscription-item-text').html(`${text}`);
        }
    },

    showText: function (ev) {
        let $item = $(ev.target).closest('.notification-subscription-item');
        $item.find('.subscription-show-text-btn').detach();
        $item.find('.moreellipses').detach();
        $item.find('.subscription-more-text').removeClass('hidden');
    },

    openSubscriptionChat: function (ev) {
        if ($(ev.target).closest('.subscription-invitation-item-group-wrap').length)
            return;
        let $item = $(ev.target).closest('.notification-subscription-item'),
            account_jid = $item.attr('data-account-jid'),
            jid = $item.attr('data-jid');

        let account = xabber.accounts.find(item => item.get('jid') === account_jid);
        if (!account)
            return;

        let contact = account.contacts.get(jid);
        if (!contact)
            return;

        xabber.toolbar_view.showAllChats();
        account.chats.openChat(contact);
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

        let $notification_msg;

        if (message.get('ignored'))
            message.set('is_unread', false);

        if (message.get('notification_msg') && message.get('notification_msg_content')){
            $notification_msg = $(message.get('notification_msg_content'));
            if (message.get('notification_trust_msg') || $notification_msg.children(`authenticated-key-exchange[xmlns="${Strophe.NS.XABBER_TRUST}"]`).length) {
                if ($notification_msg.find('verification-successful').length){
                    message.set('message', xabber.getString("notifications_successful_verification_msg"));
                }
            }
        }
        if (message.get('notification_msg') && message.get('notification_msg_content')){
            if (message.get('notification_trust_msg') || $notification_msg.children(`authenticated-key-exchange[xmlns="${Strophe.NS.XABBER_TRUST}"]`).length) {
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
                if (this.filter_type === 'security' && !message.get('security_notification') && !message.get('notification_info') && !message.get('notification_mention')){
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

        this.recountFilteredCount();
        this.updateUnreadMentions(message, message.get('is_unread'));
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


        if (message.get('ignored')) {
            $message.addClass('hidden');
        }

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
        if (msg && (msg.get('ntf_new_device_msg') || msg.get('notification_mention'))){
            this.hideAuthorUsername($msg);
        }
        if (!$msg.find('.left-side .notification-icon').length){

            let $icon = $(templates.notification_icon_container());
            if (msg){
                if (msg.get('security_notification') && !msg.get('notification_info') && !msg.get('notification_mention')) {
                    $icon.append(env.templates.svg['security']())
                } else if (msg.get('notification_info')){
                    $icon.append(env.templates.svg['info']());
                } else if (msg.get('notification_mention')){
                    $icon.append(env.templates.svg['mention']())
                // } else if (msg.get('ntf_new_device_msg')){
                //     $icon.append(env.templates.svg['lock']())
                }
            }
            $msg.find('.left-side').append($icon);
        }
        $msg.attr('data-account-jid',chat.account.get('jid'));
        $msg.attr('data-color', chat.account.settings.get('color'));
        chat.item_view.content.showMessageAuthor($msg);
    },

    FilterMessagesInChat: function (is_cleared) {
        this.updateAllIncomingSubscriptions();
        this.recountFilteredCount();
        if (!this.filtered_accounts.length && is_cleared){
            this.filtered_messages = [];
            this.$(`.chat-message`).remove();
            this.$('.chat-day-indicator').remove();
            this.load_history_dfd = null;
            this.backToBottom();
            this.$('.notification-subscription-item').removeClass('hidden');
            if (this.filter_type === 'all'){
                this.onShowNotificationsTab();
            } else {
                let is_filtered;
                if (this.filter_type === 'security'){
                    this.filtered_messages = this.notification_messages.filter((msg) => msg.get('security_notification') && !msg.get('ignored') && !msg.get('notification_info') && !msg.get('notification_mention'));
                    is_filtered = true;
                } else if (this.filter_type === 'information'){
                    this.filtered_messages = this.notification_messages.filter((msg) => msg.get('notification_info') && !msg.get('ignored'));
                    is_filtered = true;
                } else if (this.filter_type === 'mentions'){
                    this.filtered_messages = this.notification_messages.filter((msg) => msg.get('notification_mention') && !msg.get('ignored'));
                    is_filtered = true;
                }
                this.updateCalendarCellsActivity(this.filtered_messages);
                if (this.filtered_messages.length && is_filtered) {
                    this.rendered_messages = this.filtered_messages.slice(Math.max(this.filtered_messages.length - 20, 0));
                    this.renderMessage(this.rendered_messages[this.rendered_messages.length - 1], this.rendered_messages);
                } else if (!this.filtered_messages.length) {
                    this.rendered_messages = [];
                }
                this.handleOnScrollRendering('bottom');
            }
        } else if (this.filtered_accounts.length) {
            this.filtered_messages = this.notification_messages.filter((msg) => msg.collection && msg.collection.account && this.filtered_accounts.includes(msg.collection.account.get('jid')) && !msg.get('ignored'));
            if (this.filter_type !== 'all'){
                if (this.filter_type === 'security'){
                    this.filtered_messages = this.filtered_messages.filter((msg) => msg.get('security_notification') && !msg.get('notification_info') && !msg.get('notification_mention'));
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
            this.updateCalendarCellsActivity(this.filtered_messages);
            if (this.filtered_messages.length) {
                this.rendered_messages = this.filtered_messages.slice(Math.max(this.filtered_messages.length - 20, 0));
                this.renderMessage(this.rendered_messages[this.rendered_messages.length - 1], this.rendered_messages);
            } else if (!this.filtered_messages.length) {
                this.rendered_messages = []
            }
            this.handleOnScrollRendering('bottom');

        }
    },

    updateFilteredMessages: function () {
        if (!this.filtered_accounts.length){
            this.filtered_messages = [];
            if (this.filter_type !== 'all') {
                {
                    if (this.filter_type === 'security') {
                        this.filtered_messages = this.notification_messages.filter((msg) => msg.get('security_notification') && !msg.get('ignored') && !msg.get('notification_info') && !msg.get('notification_mention'));
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
                    this.filtered_messages = this.filtered_messages.filter((msg) => msg.get('security_notification') && !msg.get('notification_info') && !msg.get('notification_mention'));
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
        this.checkRenderedMessages();
        this.rendered_messages.length && this.renderMessage(this.rendered_messages[this.rendered_messages.length - 1], this.rendered_messages);
        this.updateCalendarCellsActivity(this.notification_messages.filter(msg => !msg.get('ignored')));
    },

    checkRenderedMessages: function () {
        _.each(this.notifications_chats, (chat) => {
            chat = chat.chat;
            let messages = chat.messages.filter((msg) => !msg.get('ignored'));

            if (!messages.length)
                return;
            let chat_last_message = messages[messages.length - 1];
            if (this.rendered_messages.indexOf(chat_last_message) === -1){
                this.rendered_messages.push(chat_last_message);
            }
        });

        this.rendered_messages.sort((a, b) => a.get('timestamp') - b.get('timestamp'));
    },

    updateCalendarCellsActivity: function (messages) {
        xabber.notifications_view.$('.notifications-calendar-day').attr('data-activity-value', 0);
        if (!messages || !messages.length)
            return;
        messages = messages.filter(item => item.get('timestamp') >= Number(moment(Date.now()).subtract(1, 'months').startOf('month')));

        _.each(messages, (msg) => {
            let $cell = this.findCalendarCellByDate(msg.get('timestamp'));
            if ($cell.attr('data-activity-value') && $cell.attr('data-activity-value') > 2)
                return;
            $cell.attr('data-activity-value', $cell.attr('data-activity-value') && Number($cell.attr('data-activity-value')) ? (Number($cell.attr('data-activity-value')) + 1) : 1);
        })
    },

    hideAuthorUsername: function ($msg) {
        $msg.addClass('without-username');
    },

    updateNotificationDate: function (msg_elem) {
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
        this._is_scrolled_bottom = this.isScrolledToBottom();
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
        this.handleOnScrollRendering('bottom');
        this._long_reading_timeout = false;
    },

    onMouseWheel: function () {
        this.$('.back-to-bottom').hideIf(this.isScrolledToTop());
    },

    handleOnScrollRendering: function (scroll_direction, force_render, msg_amount, exclude_jids) { //34
        msg_amount = msg_amount || 5;
        if (!scroll_direction || this._scroll_rendering || !this.isVisible()) {
            return true;
        }
        if (!this.rendered_messages)
            this.rendered_messages = [];
        this._scroll_rendering = true;
        if (scroll_direction === 'bottom'){
            if (this.filtered_messages.length && !this.rendered_messages.length) {
                this.rendered_messages = this.filtered_messages.slice(Math.max(this.filtered_messages.length - 20, 0));
                this.renderMessage(this.rendered_messages[this.rendered_messages.length - 1], this.rendered_messages);
            }

            let msg,
                filtered_chats_messages = [], no_filtered_messages;

            _.each(this.notifications_chats, (chat) => {
                chat = chat.chat;
                if (this.filtered_messages && !this.filtered_messages.length && this.filter_type !== 'all' && this.notification_messages.length){
                    no_filtered_messages = true;
                }
                let chat_filtered_messages = this.rendered_messages.filter(item =>
                    item.collection
                    && item.collection.account.get('jid') === chat.account.get('jid')
                    && (!exclude_jids || (exclude_jids && (!exclude_jids.length || !exclude_jids.includes(item.collection.account.get('jid')))))
                );
                if (!chat_filtered_messages.length){
                    return;
                }
                if (chat_filtered_messages[0].get('unique_id') === chat.messages.filter(item => !item.get('ignored'))[0].get('unique_id') && chat.get('history_loaded')){
                    return;
                }
                if (this.filtered_messages && this.filtered_messages.filter(item => item.collection && item.collection.account.get('jid') === chat.account.get('jid')).length
                    && chat_filtered_messages[0].get('unique_id') === this.filtered_messages.filter(item => item.collection && item.collection.account.get('jid') === chat.account.get('jid'))[0].get('unique_id')
                    && chat.get('history_loaded')){
                    return;
                }
                filtered_chats_messages.push(chat_filtered_messages)
            });


            if ((this.filtered_accounts.length || this.filter_type !== 'all') && this.rendered_messages.length) {
                msg = this.rendered_messages[0];

            } else if (filtered_chats_messages.length) {
                _.each(filtered_chats_messages, (list) => {
                    if (!list.length){
                        return;
                    }
                    let first_msg = list[0];
                    if (!msg || (msg.get('timestamp') < first_msg.get('timestamp'))) {
                        msg = first_msg;
                    }
                });
            } else if (no_filtered_messages) {
                _.each(this.notifications_chats, (list) => {
                    let chat = list.chat;
                    let first_msg = chat.messages.models[0];
                    if (!msg || (msg.get('timestamp') < first_msg.get('timestamp'))) {
                        msg = first_msg;
                    }
                });
            }
            if (!msg) {
                this._scroll_rendering = false;
                return true;
            }

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
            if ($msg.length || no_filtered_messages || !this.rendered_messages.length){
                if ($msg.isAlmostScrolledInContainer(this.$('.chat-content'), 1500) || force_render || no_filtered_messages || !this.rendered_messages.length) {
                    let index = whole_msgs_list.indexOf(msg),
                        new_rendered_msgs = whole_msgs_list.slice(Math.max(0, index - msg_amount), index);
                    if (new_rendered_msgs.length && !force_load && !this.load_history_dfd){
                        new_rendered_msgs = new_rendered_msgs.filter(item => !this.rendered_messages.some(rendered_msg => rendered_msg.get('unique_id') === item.get('unique_id')));

                        if (new_rendered_msgs.length) {
                            this.rendered_messages = [...new_rendered_msgs, ...this.rendered_messages];
                            this.rendered_messages.sort((a, b) => a.get('timestamp') - b.get('timestamp'));

                            for (let i = new_rendered_msgs.length - 1; i >= 0; i--) {
                                this.renderMessage(new_rendered_msgs[i], this.rendered_messages);
                            }
                        }
                    } else if (force_render) {
                        this._scroll_rendering = false;
                        if (msg && msg.collection && msg.collection.account){
                            return {exclude_jid: msg.collection.account.get('jid')};
                        } else
                            return true;
                    } else if (!force_render) {
                        if (!this.load_history_dfd){
                            this.handleOnScrollLoading(msg);
                        }
                    }

                }
            } else if (force_render) {
                this._scroll_rendering = false;
                return true;
            }

        } else if (scroll_direction === 'top') {
            return true;
        }
        this._scroll_rendering = false;

    },

    handleOnScrollLoading: function (message) {
        let msg_chat = message.collection.chat;
        let newest_first_msg = msg_chat.messages.models[0];

        if (newest_first_msg) {
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
        let $message,
            $new_message;
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

xabber.Account.addInitPlugin(function () {

    let checker_object = {
        callback : async (msg_object) => {
            return new Promise((resolve) => {
                if (!msg_object.$message)
                    return resolve(msg_object);

                if (!this.server_features.get(Strophe.NS.XABBER_NOTIFY))
                    return resolve(msg_object);

                let $message = msg_object.$message;

                if (msg_object.type === 'chat') {
                    let $notify = $message.children(`notification[xmlns="${Strophe.NS.XABBER_NOTIFY}"]`);
                    if (!$notify.length){
                        let $forwarded = $message.find('forwarded'),
                            $delay = msg_object.delay,
                            from_jid = $message.attr('from') || msg_object.from_jid;

                        let from_bare_jid = Strophe.getBareJidFromJid(from_jid);

                        if ($forwarded.length && !msg_object.xml) {
                            let $mam = $message.find(`result[xmlns="${Strophe.NS.MAM}"]`);
                            if ($mam.length) {
                                $forwarded = $mam.children('forwarded');
                                if ($forwarded.length) {
                                    $message = $forwarded.children('message');
                                    $delay = $forwarded.children('delay');
                                }
                                let stanza_ids = this.chats.receiveStanzaId($message, {from_bare_jid: from_bare_jid});

                                _.extend(msg_object, {
                                    $message: $message,
                                    is_mam: true,
                                    delay: $delay,
                                    stanza_id: stanza_ids.stanza_id || $mam.attr('id'),
                                    contact_stanza_id: stanza_ids.contact_stanza_id
                                });
                                $notify = $message.children(`notification[xmlns="${Strophe.NS.XABBER_NOTIFY}"]`);
                            }
                        }
                    }

                    if ($notify.length){
                        if ($message.find(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`).length && !msg_object.forwarded) {
                            if (this.omemo){
                                _.extend(msg_object, {
                                    notification_msg: true,
                                    conversation: this.server_features.get(Strophe.NS.XABBER_NOTIFY).get('from')
                                });
                                return resolve(msg_object);
                            }
                            msg_object.ignore = 'notifications';
                            return resolve(msg_object);
                        } else {
                            msg_object.encrypted = false;
                            let from_bare_jid = Strophe.getBareJidFromJid($message.attr('from')),
                                contact = this.contacts.mergeContact($message.attr('from')),
                                stanza_ids = this.chats.receiveStanzaId($message, {from_bare_jid: from_bare_jid});

                            msg_object.chat = this.chats.getChat(contact);

                            _.extend(msg_object, {
                                notification_msg: true,
                                encrypted: false,
                                stanza_id: stanza_ids.stanza_id,
                                contact_stanza_id: stanza_ids.contact_stanza_id
                            });
                            return resolve(msg_object);
                        }
                    }
                }
                return resolve(msg_object);
            });
        },

        name: 'xep_notification',
        order: 4,
        handler_name: 'xep_notification_checker',
    };
    this._msg_xep_checkers.push(checker_object);
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
