import xabber from "xabber-core";

let env = xabber.env,
    constants = env.constants,
    templates = env.templates.calls,
    utils = env.utils,
    $ = env.$,
    $iq = env.$iq,
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


xabber.CallsBodyContainer = xabber.Container.extend({
    className: 'calls-body-container',
});

xabber.CallsView = xabber.BasicView.extend({
    className: 'calls-content-wrap',
    template: templates.calls_view,
    ps_selector: '.calls-right-container',
    avatar_size: constants.AVATAR_SIZES.CHAT_ITEM,

    events: {
        "click .btn-accounts-filter": "filterAccount",
        "click .calls-type-filter-content .filter-item-wrap": "filterType",
        "click .chat-message": "openChat",
        "click .call-contact-item": "openChatContact",
        "click .chat-message .btn-send-jingle": "sendJingleMessage",
        "click .call-contact-item .btn-send-jingle": "sendJingleMessageContact",
        "click .btn-end-call": "endCall",
        "click .btn-show-search": "showSearch",
        "click .close-search-icon": "hideSearch",
        "click .btn-back-to-chats": "clickBackToChats",
        "click .calls-filter-main-header": "updateAccountsFilter",
        "click .btn-play-pause-plyr": "playPausePlyr",
        "click .btn-next-plyr": "nextPlyr",
        "click .btn-previous-plyr": "previousPlyr",
        "click .btn-stop-plyr": "stopPlyr",
        "click .chat-tool-player-containter": "popupPlyr",
        "click .tab-filter-item": "removeFilter",
        "keyup .search-input": "keyUpSearch",
        "click .search-form": "focusSearch",
        "click .btn-show-search": "focusSearch",
        "click .close-search-icon": "clearSearch",

    },

    _initialize: function () {
        this.listenTo(xabber.accounts, 'list_changed connected_list_changed notification_chat_created account_color_updated add destroy', this.updateAccountsFilter);
        this.listenTo(xabber.accounts, 'change:enabled', this.updateAccountsFilter);
        this.listenTo(xabber.accounts, 'change:connected', this.updateAccountsFilter);
        this.listenTo(xabber, 'update_jingle_button', this.updateActiveCall);
        this.listenTo(xabber, 'plyr_player_updated', this.updatePlyrControls);
        this.listenTo(xabber, 'plyr_player_time_updated', this.updatePlyrTime);
        this.listenTo(xabber, 'update_layout', this.updatePlyrTitle);
        this.listenTo(xabber, 'update_client_notifications', this.updateClientNotifications);

        this.rendered_messages = [];
        this.calls_accounts = [];

        this.calls_messages = new xabber.Messages(null, {});
        this.listenTo(this.calls_messages, 'add', this.addMessage);

        this.ps_container2 = this.$('.left-column-filters-container');
        if (this.ps_container2.length) {
            this.ps_container2.perfectScrollbar(
                _.extend(this.ps_settings || {}, xabber.ps_settings)
            );
        }
        this.ps_container.on("ps-scroll-up ps-scroll-down", this.onScroll.bind(this));
        this.ps_container.on("ps-scroll-y", this.onScrollY.bind(this));
        return this;
    },

    render: function (options) {
        this.clearFilter();
        this.data.set('visible', true);
        this.updateAccountsFilter();
        this.onScroll();
        this.updateActiveCall();
        this.updateCallContacts();
        this.updateScrollBar2();
        this.updatePlyrControls();
        this.updatePlyrTime();
        this.updateClientNotifications();
        this.hideSearch();
        this.$('.dropdown-button').dropdown({
            inDuration: 100,
            outDuration: 100,
            hover: false,
            belowOrigin: true,
        });
    },

    showSearch: function (ev) {
    },

    hideSearch: function (ev) {
    },

    focusSearch: function (ev) {
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

    clickBackToChats: function (ev) {
        xabber.toolbar_view.showAllChats(null, null, true);
    },

    updateClientNotifications: function () {
        this.$('.client-notifications-wrap').find('.client-notifications-container').detach();

        if (xabber.placeholders_wrap && this.isVisible()){
            this.$('.client-notifications-wrap').append(xabber.placeholders_wrap.$el);
        }
        this.$('.client-notifications-wrap').switchClass('hidden', !xabber.placeholders_wrap.$el.children().length)
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

    updateActiveCall: function () {
        this.$('.calls-right-wrap').switchClass('active-call', xabber.current_voip_call);
        this.$('.active-call-container .call-duration').text('');
        clearInterval(this._duration_Interval);
        if (xabber.current_voip_call){
            let contact = xabber.current_voip_call.contact;

            if (!contact){
                this.$('.calls-right-wrap').removeClass('active-call');
                return;
            }

            let author = contact || $msg.find('.msg-wrap .chat-msg-author').text() || $msg.data('from'),
                image = author && author.cached_image || utils.images.getDefaultAvatar(author);
            this.$('.active-call-container .circle-avatar').setAvatar(image, this.avatar_size);
            this.$('.active-call-container .call-contact-name').text(contact.get('name'));
            xabber.current_voip_call.current_timer && this.$('.active-call-container .call-duration').text(utils.pretty_duration(xabber.current_voip_call.current_timer));
            this._duration_Interval = setInterval(() => {
                if (!xabber.current_voip_call || !xabber.current_voip_call.current_timer){
                    clearInterval(this._duration_Interval);
                    return;
                }
                this.$('.active-call-container .call-duration').text(utils.pretty_duration(xabber.current_voip_call.current_timer));
            }, 1000);

            let voip_status = xabber.current_voip_call.get('status');

            if (voip_status === 'disconnected' || voip_status === 'calling' || voip_status === 'connecting' || !voip_status){
                this.$('.calls-right-wrap').removeClass('active-call');
                clearInterval(this._duration_Interval);
            }
            this.$('.active-call-container').attr('data-color', contact.account.settings.get('color'))
            if (xabber.current_voip_call.get('call_initiator') === contact.account.get('jid')){
                this.$('.outgoing-icon').removeClass('hidden');
                this.$('.incoming-icon').addClass('hidden');
            } else {
                this.$('.outgoing-icon').addClass('hidden');
                this.$('.incoming-icon').removeClass('hidden');

            }
        }
    },

    endCall: function () {
        if (xabber.current_voip_call && xabber.current_voip_call.modal_view){
            xabber.current_voip_call.modal_view.cancel();
            this.$('.calls-right-wrap').removeClass('active-call');
        }
    },

    updateCallContacts: function () {
        this.$('.calls-contacts-container').html('');
        this.$('.calls-contacts-wrap').addClass('hidden');
        let calls_messages =  this.calls_messages.filter(msg => msg.get('call_chat').account.get('jid') === this.current_account.get('jid'));
        if (!calls_messages.length)
            return;
        let contacts_list = [];
        _.each(calls_messages, (msg) => {
            if (msg.get('call_contact')) {
                let count = 1,
                    contact = msg.get('call_contact');

                if (!contacts_list.length || !contacts_list.some(item => item.contact.get('jid') === contact.get('jid'))) {
                    contacts_list.push({contact: contact, count: count});
                } else if (contacts_list.some(item => item.contact.get('jid') === contact.get('jid'))) {
                    let list_item = contacts_list.find(item => item.contact.get('jid') === contact.get('jid'));
                    list_item.count = list_item.count + 1;
                }
            }
        });
        if (contacts_list.length){
            contacts_list.sort((x,y) => y.count - x.count);
            contacts_list = contacts_list.slice(0,5);
            _.each(contacts_list, (item) => {
                let $template = $(templates.call_contact_item({jid: item.contact.get('jid'), name: item.contact.get('name'), count: item.count}));
                $template.find('.circle-avatar').setAvatar(item.contact.cached_image || utils.images.getDefaultAvatar(item.contact), 32);
                this.$('.calls-contacts-container').append($template);
                this.$('.calls-contacts-wrap').removeClass('hidden');
            });
        }
    },

    updateFilterItems: function () {
        this.$('.tab-filter-item').remove();
        if (this.filter_type){
            $(env.templates.contacts.tab_filter_item_main_color({
                value: this.filter_type,
                type: 'filter_type',
                text: xabber.getString(`calls_window__type_filter_${this.filter_type}`)
            })).insertBefore(this.$('.search-form'));
        }
        if (this.current_account){
            this.$('.tab-active-filters-wrap').attr('data-color', this.current_account.settings.get('color'));
            this.$('.tab-account-filter-item .tab-filter-item-text').text(this.current_account.get('jid'));
        } else {
            this.$('.tab-active-filters-wrap').attr('data-color', '');
        }
    },

    removeFilter: function (ev) {
        let $item = $(ev.target).closest('.tab-filter-item'),
            filter_type = $item.attr('data-type');

        if (filter_type === 'filter_type'){
            this.filter_type = null;
            this.$('.calls-type-filter-content .filter-item-wrap').removeClass('selected-filter');
        }
        $item.remove();

        this.renderCalls();
        this.updateFilterItems()

    },

    openChatContact: function (ev) {
        if ($(ev.target).closest('.btn-send-jingle').length)
            return;

        let $item = $(ev.target).closest('.call-contact-item'),
            jid = $item.attr('data-jid');
        if (!this.current_account)
            return;
        let contact = this.current_account.contacts.get(jid);
        if (!contact)
            return;

        this.current_account.chats.openChat(contact);
    },

    sendJingleMessageContact: function (ev) {
        if (!xabber.settings.jingle_calls){
            return;
        }
        if (xabber.current_voip_call) {
            xabber.current_voip_call.modal_view.collapse();
            return;
        }
        let $item = $(ev.target).closest('.call-contact-item'),
            jid = $item.attr('data-jid');
        if (!this.current_account)
            return;
        let contact = this.current_account.contacts.get(jid);
        if (!contact)
            return;


        let session_id = uuid();

        xabber.current_voip_call = new xabber.JingleMessage({session_id: session_id, video_live: false}, {contact: contact});
        xabber.current_voip_call.startCall();
        xabber.current_voip_call.modal_view.show({status: constants.JINGLE_MSG_PROPOSE});
        xabber.trigger('update_jingle_button');
    },

    updateScrollBar2: function () {
        if (this.ps_container2 && this.isVisible()) {
            this.ps_container2.perfectScrollbar('update');
        }
        return this;
    },

    clearFilter: function () {
    },

    updateCurrentCalls: function () {
        if (this.calls_accounts.length){
            if (!this.current_account || (this.current_account && !this.current_account.get('enabled'))) {
                this.current_account = this.calls_accounts[0];
            }
            this.filter_type = null;
            this.$('.tab-filter-item').remove();
            this.clearSearch();
            this.$('.calls-type-filter-content .filter-item-wrap').removeClass('selected-filter');
            this.$(`.calls-type-filter-content .filter-item-wrap[data-filter="all"]`).addClass('selected-filter');

            let dfd = new $.Deferred();
            dfd.done(() => {
                // remove куртилку

                this.renderCalls();
                this.updateFilterItems()
            });

            // добавить крутилку
            let count = 0,
                length = this.calls_accounts.length;
            _.each(this.calls_accounts, (account) => {
                if (account.settings.get('calls_first_history_loaded')){
                    account.cached_calls.getAllFromCachedCalls((res) => {
                        if (res.length){
                            let parser = new DOMParser();
                            _.each(res, (msg_item) => {
                                let xml = parser.parseFromString(msg_item.xml, "text/xml");
                                this.receiveChatMessage(account, xml.firstChild,
                                    _.extend({
                                        is_archived: true,
                                        is_cached: true,
                                    }, {})
                                )
                            });
                            let load_dfd = new $.Deferred();
                            load_dfd.done(() => {
                                count++;
                                if (count === length){
                                    dfd.resolve();
                                }
                            });
                            this.loadMissedHistory(account, load_dfd);
                        } else {
                            count++;
                            if (count === length){
                                dfd.resolve();
                            }
                        }
                    });
                } else {
                    let load_dfd = new $.Deferred();
                    load_dfd.done(() => {
                        count++;
                        if (count === length){
                            dfd.resolve();
                        }
                    });
                    this.loadPreviousHistory(account, load_dfd)
                }
            });
        } else {

        }
    },

    filterAccount: function (ev) {
        let $item = $(ev.target).closest('.btn-accounts-filter'),
            filter_type = $item.attr('data-jid');

        this.current_account = this.calls_accounts.find(item => item.get('jid') === filter_type);

        if (!this.current_account || (this.current_account && !this.current_account.get('enabled')))
            this.current_account = this.calls_accounts[0];


        this.renderCalls();
        this.updateCallContacts();
        this.updateFilterItems()
    },

    filterType: function (ev) {
        let $item = $(ev.target).closest('.filter-item-wrap'),
            filter_type = $item.attr('data-filter');

        if ($item.hasClass('selected-filter')){
            filter_type = 'all';
        }

        if (filter_type === 'all'){
            this.filter_type = null
        } else if (filter_type) {
            this.filter_type = filter_type;
        }

        this.$('.calls-type-filter-content .filter-item-wrap').removeClass('selected-filter');
        this.$(`.calls-type-filter-content .filter-item-wrap[data-filter="${filter_type}"]`).addClass('selected-filter');

        this.renderCalls();
        this.updateFilterItems()
    },

    renderCalls: function () {
        this.$(`.chat-message`).remove();
        this.$('.chat-day-indicator').remove();
        this.scrollToTop();
        this.updateFilteredMessages();

        this.rendered_messages = this.filtered_messages.slice(Math.max(this.filtered_messages.length - 20, 0));
        this.rendered_messages.length && this.renderMessage(this.rendered_messages[this.rendered_messages.length - 1], this.rendered_messages);
    },


    updateFilteredMessages: function () {

        this.filtered_messages = this.calls_messages.filter(msg => msg.get('call_chat').account.get('jid') === this.current_account.get('jid'));

        if (this.filter_type){
            if (this.filter_type === 'outgoing') {
                this.filtered_messages = this.filtered_messages.filter(msg => msg.get('jingle_call_status') && msg.get('jingle_call_status') === 'outgoing')
            } else if (this.filter_type === 'missed') {
                this.filtered_messages = this.filtered_messages.filter(msg => msg.get('jingle_call_status') && msg.get('jingle_call_status') === 'missed')
            } else if (this.filter_type === 'incoming') {
                this.filtered_messages = this.filtered_messages.filter(msg => msg.get('jingle_call_status') && msg.get('jingle_call_status') === 'incoming')
            } else if (this.filter_type === 'declined') {
                this.filtered_messages = this.filtered_messages.filter(msg => msg.get('jingle_call_status') && msg.get('jingle_call_status') === 'declined')
            }
        }
    },


    onScrollY: function () {
        this._prev_scrolltop = this._scrolltop || this._prev_scrolltop || 0;
        this._scrolltop = this.getScrollTop() || this._scrolltop || this._prev_scrolltop || 0;
        this.$('.back-to-bottom').hideIf(this.isScrolledToTop());
    },

    onScroll: function (ev, is_focused) {
        if (!this.isVisible())
            return;
        this.$('.back-to-bottom').hideIf(this.isScrolledToTop());
        this.handleOnScrollRendering();
    },

    handleOnScrollRendering: function () {
        if (this._scroll_rendering)
            return;
        if (!this.rendered_messages)
            this.rendered_messages = [];
        this._scroll_rendering = true;

        let msg = this.rendered_messages[0];

        if (!msg)
            return;

        let $msg = this.$(`.chat-message[data-uniqueid="${msg.get('unique_id')}"]`),
            whole_msgs_list = [];

        whole_msgs_list = this.filtered_messages;

        if ($msg.length){
            if ($msg.isAlmostScrolledInContainer(this.$('.chat-content'), 1500)) {
                let index = whole_msgs_list.indexOf(msg),
                    new_rendered_msgs = whole_msgs_list.slice(Math.max(0, index - 5), index);
                if (new_rendered_msgs.length && !this.load_history_dfd){
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
        this._scroll_rendering = false;

    },

    handleOnScrollLoading: function (message) {

        if (message) {
            let account = message.get('call_chat').account;
            if (account.settings.get('calls_full_history_loaded')){
                this.load_history_dfd && (this.load_history_dfd = null);
            } else {
                if (!this.load_history_dfd){
                    this.load_history_dfd = $.Deferred();
                    this.load_history_dfd.done(() => {
                        this.load_history_dfd = null;
                        this.handleOnScrollRendering('bottom');
                    });
                    this.loadPreviousHistory(account, null, this.calls_messages.filter(msg => msg.get('call_chat').account.get('jid') === this.current_account.get('jid'))[0].get('stanza_id'));
                }
            }
        }
    },

    sendJingleMessage: function (ev) {
        if (!xabber.settings.jingle_calls){
            return;
        }
        if (xabber.current_voip_call) {
            xabber.current_voip_call.modal_view.collapse();
            return;
        }
        let $item = $(ev.target).closest('.chat-message'),
            msg_id = $item.attr('data-uniqueid');
        let message = this.calls_messages.find(item => item.get('unique_id') === msg_id);
        if (!message || !message.get('call_contact'))
            return;


        let session_id = uuid();

        xabber.current_voip_call = new xabber.JingleMessage({session_id: session_id, video_live: false}, {contact: message.get('call_contact')});
        xabber.current_voip_call.startCall();
        xabber.current_voip_call.modal_view.show({status: constants.JINGLE_MSG_PROPOSE});
        xabber.trigger('update_jingle_button');
    },

    openChat: function (ev) {
        if ($(ev.target).closest('.btn-send-jingle').length)
            return;

        let $item = $(ev.target).closest('.chat-message'),
            msg_id = $item.attr('data-uniqueid');
        let message = this.calls_messages.find(item => item.get('unique_id') === msg_id);
        if (!message || !message.get('call_contact') || !this.current_account)
            return;

        this.current_account.chats.openChat(message.get('call_contact'));
    },

    addMessage: function (message) {
        let msg_account = message.get('call_chat').account;
        message.get('xml') && !message.get('is_cached') && msg_account.cached_calls.putInCachedCalls({
            stanza_id: message.get('unique_id'),
            xml: message.get('xml').outerHTML,
        });

        if (!message.get('ignored') && !message.get('is_cached') && !(message.get('synced_from_server') || (message.get('is_archived') && !message.get('missed_msg'))) && message.get('call_chat')){
            let no_render,
                account_jid = message.get('call_chat').account.get('jid');

            if (this.current_account.get('jid') !== account_jid){
                no_render = true;
            }
            if (this.filter_type !== 'all'){
                if (this.filter_type === 'outgoing' && msg.get('jingle_call_status') !== 'outgoing') {
                    no_render = true;
                } else if (this.filter_type === 'missed' && msg.get('jingle_call_status') !== 'missed') {
                    no_render = true;
                } else if (this.filter_type === 'incoming' && msg.get('jingle_call_status') !== 'incoming') {
                    no_render = true;
                } else if (this.filter_type === 'declined' && msg.get('jingle_call_status') !== 'declined') {
                    no_render = true;
                }
            }

            if (!no_render){
                this.rendered_messages.push(message);
                this.renderMessage(this.rendered_messages[this.rendered_messages.length - 1], this.rendered_messages);
            }

        }

        this.updateFilteredMessages();
    },


    renderMessage: function (message, filtered_messages_render) {

        let $message = this.buildMessageHtml(message),
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
            if ($prev_message.length) {
                $message.insertBefore($prev_message);
            }
        }
        this.showMessageAuthor($message, message);

        let $next_message = $message.nextAll('.chat-message:not(.hidden)').first();
        this.updateMessageInChat($message[0], message);
        if ($next_message.length) {
            this.updateMessageInChat($next_message[0]);
        }
        return $message;
    },

    updateMessageInChat: function (msg_elem, msg) {
        let $msg = $(msg_elem);
        !msg && (msg = this.calls_messages.get($msg.data('uniqueid')));

        let chat = msg.get('call_chat');

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
        $msg.attr('data-account-jid',chat.account.get('jid'));
        $msg.attr('data-color', chat.account.settings.get('color'));
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

    showMessageAuthor: function ($msg, msg) {
        let contact = msg.get('call_contact');
        if ($msg.hasClass('system'))
            return;
        $msg.addClass('with-author');
        let image, $avatar = $msg.find('.left-side .circle-avatar');

        let author = contact || $msg.find('.msg-wrap .chat-msg-author').text() || $msg.data('from');
        image = author && author.cached_image || utils.images.getDefaultAvatar(author);
        $avatar.setAvatar(image, this.avatar_size);
    },

    updateAccountsFilter: function (item, collection, options, force_render) {
        let accounts = xabber.accounts.enabled;
        this.$('.tab-account-filter-item').switchClass('hidden', accounts.length === 1 || !accounts.length);
        if (accounts.length){
            try{
                this.$('.additional-filter-variant').remove();
                _.each(accounts, (account) => {
                    this.$('.accounts-dropdown').append($(`<div class="property-variant btn-accounts-filter additional-filter-variant" data-jid="${account.get('jid')}"><span class="one-line">${account.get('jid')}</span></div>`));
                });
                this.calls_accounts = accounts;
                if (!this.current_account || (this.current_account && !this.current_account.get('enabled'))) {
                    this.current_account = this.calls_accounts[0];
                    this.$('.tab-account-filter-item .tab-filter-item-text').text(this.current_account.get('jid'));
                }
                (this.isVisible() || force_render) && this.updateCurrentCalls();
                (this.isVisible() || force_render) && this.updateCallContacts();
            } catch (e) {
                console.error(e)
            }
        } else {
            if (!xabber.accounts.enabled.length){
                if (xabber.body.screen.get('name') === 'calls'){
                    xabber.toolbar_view.showAllChats(null, true);
                } else if (xabber.body.screen.get('previous_screen') && xabber.body.screen.get('previous_screen').name === 'calls') {
                    this.$el.detach();
                    xabber.toolbar_view.$('.toolbar-item:not(.account-item):not(.toolbar-logo)').removeClass('active');
                    let previous_chat = xabber.body.screen.get('previous_screen');
                    previous_chat.open_all_chats = true;
                    xabber.body.screen.set('previous_screen', previous_chat);
                }
            }
            this.calls_accounts = accounts;
        }
        this.updateScrollBar2();
    },

    renderAccountItem: function (account) {
        let $item = $(env.templates.notifications.account_filter_item({jid: account.get('jid'), color: account.settings.get('color')}));
        return $item;
    },

    loadPreviousHistory: function (account, calls_load_dfd, before) {
        before = before || '';
        this.getMessageArchive(account, {
                fast: true,
                max: xabber.settings.mam_messages_limit,
                before: before
            },
            {
                previous_history: true,
                calls_load_dfd: calls_load_dfd,
            });
    },

    loadMissedHistory: function (account, calls_missed_load_dfd) {
        let query = {
            fast: true,
        };
        query.var = [{var: 'start', value: account.settings.get('calls_first_history_loaded')}];
        this.getMessageArchive(account, query, {
            missed_history: true,
            calls_missed_load_dfd: calls_missed_load_dfd,
        });
    },



    getMessageArchive: function (account, query, options) {
        if (options.previous_history || options.unread_history) {
            if (this._loading_history || account.get('calls_history_loaded')) {
                return;
            }
            this._loading_history = true;
            clearTimeout(this._load_history_timeout);
            this._load_history_timeout = setTimeout(() => {
                this._loading_history = false;
            }, 60000);
        }
        let counter = 0;
        this.MAMRequest(account, query, (success, messages, rsm) => {
            clearTimeout(this._load_history_timeout);
            this._loading_history = false;

            if (options.missed_history && !rsm.complete) {
                this.getMessageArchive({after: rsm.last}, {missed_history: true});
            }
            if (options.previous_history && (messages.length < query.max) && success) {
                account.settings.update_settings({calls_full_history_loaded: true});
            }

            _.each(messages, (message) => {
                let loaded_message = this.receiveChatMessage(account, message,
                    _.extend({
                        is_archived: true,
                        is_calls_archived: true,
                    }, options)
                );
                if (loaded_message) {
                    counter++;
                }
            });

            if (options.previous_history && options.calls_load_dfd && success) {
                account.settings.update_settings({calls_first_history_loaded: moment().format()});
                options.calls_load_dfd.resolve();
            }
            if (options.missed_history && options.calls_missed_load_dfd && rsm.complete) {
                account.settings.update_settings({calls_first_history_loaded: moment().format()});
                options.calls_missed_load_dfd.resolve();
            }
            if (options.previous_history && this.load_history_dfd) {
                this.load_history_dfd.resolve();
            }
        }, (err) => {
            if (options.previous_history) {
                this._loading_history = false;
            }
        });
    },

    buildMessageHtml: function (message) {
        let attrs = _.clone(message.attributes),
            is_sender = (message instanceof xabber.Message) ? message.isSenderMe() : false,
            username = attrs.call_contact ? attrs.call_contact.get('name') : attrs.from_jid;

        _.extend(attrs, {
            username: username,
            time: utils.pretty_datetime(attrs.time, 'MMMM D, YYYY, HH:mm:ss'),
            short_time: utils.pretty_time(attrs.time),
        });

        let classes = [
            attrs.is_unread && 'unread-message',
            attrs.is_unread && 'unread-message-background',
            'with-author'
        ];

        let $message = $(templates.call_item(_.extend(attrs, {
            from_jid: attrs.call_contact.get('jid'),
            is_sender: is_sender,
            jingle_duration: attrs.jingle_duration || '',
            jingle_call_status: attrs.jingle_call_status || '',
            message: attrs.jingle_call_status_text,
            call_type: attrs.jingle_call_type || '',
            time: attrs.time || '',
            classlist: classes.join(' ')
        })));

        message.set('msg_el', $message);
        return $message;
    },


    MAMRequest: function (account, options, callback, errback) {
        let messages = [], queryid = uuid(),
            success = true, iq, _interval, handler;
        delete options.fast;
        iq = $iq({type: 'set'});
        iq.c('query', {xmlns: Strophe.NS.MAM, queryid: queryid})
            .c('x', {xmlns: Strophe.NS.DATAFORM, type: 'submit'})
            .c('field', {'var': 'FORM_TYPE', type: 'hidden'})
            .c('value').t(Strophe.NS.MAM).up().up();
        if (options.var)
            options.var.forEach((opt_var) => {
                iq.c('field', {'var': opt_var.var})
                    .c('value').t(opt_var.value).up().up();
            });
        iq.c('field', {'var': 'with-tags'})
            .c('value').t('voip').up().up();
        iq.up().cnode(new Strophe.RSM(options).toXML());
        let deferred = new $.Deferred();
        account.chats.onStartedMAMRequest(deferred);

        deferred.done(() => {
            let sendMAMRequest = (func_conn) => {
                handler = account.connection._addSysHandler((message) => {
                    let $msg = $(message);
                    if ($msg.find('result').attr('queryid') === queryid) {
                        messages.push(message);
                    }
                    return true;
                }, Strophe.NS.MAM, null, null, null, null, {query_id: queryid} );
                // let _delete_handler_timeout = setTimeout(() => {
                //     console.log('handler deleted');
                //     func_conn.deleteHandler(handler);
                // }, 19000);
                let callb = (res) => {
                        account.connection.deleteHandler(handler);
                        // clearTimeout(_delete_handler_timeout);
                        // clearInterval(_interval);
                        handler = null;
                        account.chats.onCompletedMAMRequest(deferred);
                        let $fin = $(res).find(`fin[xmlns="${Strophe.NS.MAM}"]`);
                        if ($fin.length && $fin.attr('queryid') === queryid) {
                            let rsm = new Strophe.RSM({xml: $fin.find('set')[0]});
                            rsm.complete = ($fin.attr('complete') === 'true') ? true : false;
                            callback && callback(success, messages, rsm);
                        }
                    },
                    errb = (err) => {
                        account.connection.deleteHandler(handler);
                        // clearTimeout(_delete_handler_timeout);
                        // clearInterval(_interval);
                        handler = null;
                        xabber.error("MAM error");
                        xabber.error(err);
                        account.chats.onCompletedMAMRequest(deferred);
                        errback && errback(err);
                    };
                console.error('trying to send for calls');
                // if (is_fast)
                //     account.sendFast(iq, callb, errb);
                // else
                    account.sendIQ(iq, callb, errb);

            };
            // let is_fast = options.fast && account.fast_connection && !account.fast_connection.disconnecting
            //     && account.fast_connection.authenticated && account.fast_connection.connected && account.get('status') !== 'offline',
            //     conn = is_fast ? account.fast_connection : account.connection;
            //
            // if (conn.connected){
            //     sendMAMRequest(conn);
                sendMAMRequest(account.connection);
            // }
            // let send_counter = 0;
            // _interval = setInterval(() => {
            //     is_fast = options.fast && account.fast_connection && !account.fast_connection.disconnecting
            //         && account.fast_connection.authenticated && account.fast_connection.connected && account.get('status') !== 'offline';
            //     conn = is_fast ? account.fast_connection : account.connection;
            //     conn && console.log(conn.connected);
            //     if (!conn || send_counter >= 1){
            //         clearInterval(_interval);
            //         errback && errback('No connection or too many attempts');
            //         return;
            //     }
            //     if (conn.connected && send_counter < 1){
            //         send_counter++;
            //         sendMAMRequest(conn);
            //     }
            // }, 20000);
        });
    },


    receiveChatMessage: function (account, message, options) {
        options = options || {};
        let $message = $(message),
            to_jid = $message.attr('to'),
            to_bare_jid = Strophe.getBareJidFromJid(to_jid),
            $delay = options.delay,
            $forwarded = $message.find('forwarded'),
            from_jid = $message.attr('from') || options.from_jid;

        let from_bare_jid = Strophe.getBareJidFromJid(from_jid),
            is_sender = from_bare_jid === account.get('jid');

        if ($forwarded.length && !options.xml) {
            let $mam = $message.find(`result[xmlns="${Strophe.NS.MAM}"]`);
            if ($mam.length) {
                if (!Object.keys(options).length)
                    return;
                $forwarded = $mam.children('forwarded');
                if ($forwarded.length) {
                    $message = $forwarded.children('message');
                    $delay = $forwarded.children('delay');
                }
                let stanza_ids = this.receiveStanzaId(account, $message, {from_bare_jid: from_bare_jid});
                return this.receiveChatMessage(account, $message[0], _.extend(options, {
                    is_mam: true,
                    delay: $delay,
                    stanza_id: stanza_ids.stanza_id || $mam.attr('id'),
                    contact_stanza_id: stanza_ids.contact_stanza_id
                }));
            }
        }

        let contact_jid = is_sender ? to_bare_jid : from_bare_jid;


        let contact = account.contacts.mergeContact(contact_jid),
            stanza_ids = this.receiveStanzaId(account, $message, {from_bare_jid: from_bare_jid, carbon_copied: options.carbon_copied, replaced: options.replaced}),
            chat = account.chats.getChat(contact);

        options.call_contact = contact;
        options.call_chat = chat;

        return this.receiveMessage($message, _.extend(options, {is_sender: is_sender, stanza_id: stanza_ids.stanza_id, contact_stanza_id: stanza_ids.contact_stanza_id}), account);
    },


    receiveStanzaId: function (account, $message, options) {
        options.replaced && ($message = $message.children('replace').children('message'));
        let $stanza_id, $contact_stanza_id, attrs = {},
            from_bare_jid = options.from_bare_jid;
        $message.children('stanza-id').each((idx, stanza_id) => {
            stanza_id = $(stanza_id);
            if ($message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}"]`).length && !($message.find(`invite[xmlns="${Strophe.NS.GROUP_CHAT_INVITE_HTTP}"]`).length || $message.find(`invite[xmlns="${Strophe.NS.GROUP_CHAT_INVITE}"]`).length)) {
                if (stanza_id.attr('by') === from_bare_jid) {
                    $stanza_id = stanza_id;
                    $contact_stanza_id = stanza_id;
                }
                else
                    $stanza_id = stanza_id;
            }
            else {
                if (stanza_id.attr('by') === account.get('jid'))
                    $stanza_id = stanza_id;
                else
                    $contact_stanza_id = stanza_id;
            }
        });
        $stanza_id && (attrs.stanza_id = $stanza_id.attr('id'));
        $contact_stanza_id && (attrs.contact_stanza_id = $contact_stanza_id.attr('id'));
        return attrs;
    },

    receiveMessage: function ($message, options, account) {
        let $jingle_msg_reject = $message.find(`reject[xmlns="${Strophe.NS.JINGLE_MSG}"]`);

        if ($jingle_msg_reject.length) {
            let from_jid = $message.attr('from') || options.from_jid;
            if ($jingle_msg_reject.children('call').length) {
                let duration = $jingle_msg_reject.children('call').attr('duration'),
                    initiator = $jingle_msg_reject.children('call').attr('initiator');
                if (duration && initiator){
                    if (initiator === account.get('jid')){
                        options.jingle_call_status = 'outgoing';
                        options.jingle_iniator = initiator;
                        options.jingle_duration = utils.pretty_duration(duration);
                    } else {
                        options.jingle_call_status = 'incoming';
                        options.jingle_iniator = initiator;
                        options.jingle_duration = utils.pretty_duration(duration);
                    }
                } else {
                    if (initiator === account.get('jid') || Strophe.getBareJidFromJid(from_jid) === account.get('jid')){
                        options.jingle_call_status = 'declined';
                        options.jingle_iniator = initiator;
                    } else {
                        options.jingle_call_status = 'missed';
                        options.jingle_iniator = initiator;
                    }
                }
            } else {
                options.jingle_call_status = 'declined';
            }

            if ($message.children('tags').length){
                let $tags = $message.children('tags');
                if ($tags.children('tag[name="video_call"]').length){
                    options.jingle_call_type = 'video';
                }
            }
        }

        return this.calls_messages.createFromStanza($message, options, account);
    },
});


xabber.once("start", function () {

    !this.calls_view && (this.calls_view = new xabber.CallsView());

    this.calls_body = this.right_panel.addChild('calls_body',
        this.CallsBodyContainer);
}, xabber);

export default xabber;
