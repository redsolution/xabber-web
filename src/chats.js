define("xabber-chats", function () {
  return function (xabber) {
    var env = xabber.env,
        constants = env.constants,
        templates = env.templates.chats,
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

    xabber.Message = Backbone.Model.extend({
        idAttribute: 'msgid',

        defaults: function () {
            return {
                msgid: uuid(),
                type: 'main',
                state: constants.MSG_PENDING
            };
        },

        initialize: function () {
            var time = this.get('time'), attrs = {};
            if (time) {
                attrs.timestamp = Number(moment(time));
            } else {
                attrs.timestamp = moment.now();
                attrs.time = moment(attrs.timestamp).format();
            }
            this.set(attrs);
        },

        getText: function () {
            var forwarded_message = this.get('forwarded_message');
            if (forwarded_message) {
                return forwarded_message.get('message');
            }
            return this.get('message');
        },

        getState: function () {
            return constants.MSG_STATE[this.get('state')];
        },

        getVerboseState: function () {
            var state = constants.MSG_VERBOSE_STATE[this.get('state')];
            if (!this.collection.account.isOnline()) {
                state = 'Message will be sent when you get online.'
            }
            return state;
        },

        isSenderMe: function () {
            return this.collection.account.get('jid') === this.get('from_jid');
        }
    });

    xabber.Messages = Backbone.Collection.extend({
        model: xabber.Message,
        comparator: 'timestamp',

        initialize: function (models, options) {
            this.account = options.account;
        },

        createFromStanza: function ($message, options) {
            options || (options = {});
            var $delay = options.delay || $message.find('delay'),
                body = $message.children('body').text(),
                markable = $message.find('markable').length > 0,
                msgid = $message.attr('id'),
                from_jid = Strophe.getBareJidFromJid($message.attr('from')),
                message = msgid && this.get(msgid);
            if (message) {
                return message;
            }

            var attrs = {
                xml: $message[0],
                carbon_copied: options.carbon_copied && !options.is_archived,
                markable: markable,
                msgid: msgid,
                is_forwarded: options.is_forwarded,
                forwarded_message: options.forwarded_message || null,
                from_jid: from_jid,
                archive_id: options.archive_id,
                is_archived: options.is_archived
            };

            $delay.length && (attrs.time = $delay.attr('stamp'));
            body && (attrs.message = body);
            attrs.carbon_copied && (attrs.state = constants.MSG_SENT);
            options.is_archived && (attrs.state = constants.MSG_DISPLAYED);

            message = this.create(attrs);
            return message;
        },

        createSystemMessage: function (attrs) {
            return this.create(_.extend({
                type: 'system',
                silent: true,
                state: constants.MSG_DISPLAYED
            }, attrs));
        }
    });

    xabber.Chat = Backbone.Model.extend({
        defaults: {
            opened: true,
            active: false,
            display: false,
            unread: 0,
            timestamp: 0
        },

        initialize: function (attrs, options) {
            this.contact = options.contact;
            this.account = this.contact.account;
            var jid = this.contact.get('jid');
            this.set({
                id: this.contact.hash_id,
                jid: jid
            });
            this.contact.set('muted', _.contains(this.account.chat_settings.get('muted'), jid));
            this.messages = new xabber.Messages(null, {account: this.account});
            this.messages_unread = new xabber.Messages(null, {account: this.account});
            this.item_view = new xabber.ChatItemView({model: this});
            this.contact.on("destroy", this.destroy, this);
        },

        increaseUnread: function () {
            this.set('unread', this.get('unread') + 1);
            xabber.toolbar_view.increaseMessageCounter();
        },

        decreaseUnread: function () {
            var unread = this.get('unread');
            if (unread > 0) {
                this.set('unread', unread - 1);
                xabber.decreaseMessageCounter();
                xabber.toolbar_view.decreaseMessageCounter();
            }
        },

        resetUnread: function () {
            var unread = this.get('unread');
            if (unread > 0) {
                this.set('unread', 0);
                xabber.decreaseMessageCounter(unread);
                xabber.toolbar_view.decreaseMessageCounter(unread);
            }
        },

        receiveMessage: function ($message, options) {
            var carbon_copied = options.carbon_copied;

            // discovering chat marker message
            var $marker = $message.children('[xmlns="'+Strophe.NS.CHAT_MARKERS+'"]');
            if ($marker.length) {
                var marker_tag = $marker[0].tagName.toLowerCase();
                if (marker_tag !== 'markable') {
                    this.receiveMarker($message, marker_tag, carbon_copied);
                    return;
                }
            }

            if (!$message.find('body').length) {
                var view = xabber.chats_view.child(this.contact.hash_id);
                if (view && view.content) {
                    view.content.receiveNoTextMessage($message, carbon_copied);
                }
                return;
            }

            if (!options.is_archived) {
                var $archived = $message.find('archived');
                if ($archived.length) {
                    options.archive_id = $archived.attr('id');
                }
            }

            return this.messages.createFromStanza($message, options);
        },

        receiveMarker: function ($message, tag, carbon_copied) {
            var $displayed = $message.find('displayed'),
                error = $message.attr('type') === 'error';
            if (error || !$displayed.length) {
                return;
            }
            var marked_msgid = $displayed.attr('id'),
                msg = this.account.messages.get(marked_msgid);
            if (!msg) {
                return;
            }
            if (msg.isSenderMe()) {
                msg.set('state', constants.MSG_DISPLAYED);
            } else {
                msg.set('is_unread', false);
            }
        },

        onPresence: function (type) {
            var jid = this.get('jid');
            if (type === 'subscribe_from') {
                this.messages.createSystemMessage({
                    from_jid: this.account.get('jid'),
                    silent: false,
                    message: 'You sent an authorization request.'
                });
            } else if (type === 'subscribe') {
                this.messages.createSystemMessage({
                    from_jid: jid,
                    auth_request: true,
                    silent: false,
                    message: 'User '+jid+' wants to be in your contact list.'
                });
            } else if (type === 'subscribed') {
                this.messages.createSystemMessage({
                    from_jid: jid,
                    message: 'User '+jid+' authorized you.',
                });
            } else if (type === 'unsubscribed') {
                this.messages.createSystemMessage({
                    from_jid: jid,
                    message: 'User '+jid+' cancelled your authorization.'
                });
            }
        },

        showAcceptedRequestMessage: function () {
            this.messages.createSystemMessage({
                from_jid: this.account.get('jid'),
                message: 'Authorization accepted.'
            });
        },

        showDeclinedRequestMessage: function () {
            this.messages.createSystemMessage({
                from_jid: this.account.get('jid'),
                message: 'Authorization rejected.'
            });
        },

        showBlockedRequestMessage: function () {
            this.messages.createSystemMessage({
                from_jid: this.account.get('jid'),
                message: 'You have blocked user '+this.get('jid')
            });
        }
    });

    xabber.ChatItemView = xabber.BasicView.extend({
        className: 'chat-item list-item',
        template: templates.chat_item,
        avatar_size: constants.AVATAR_SIZES.CHAT_ITEM,

        events: {
            'click': 'openByClick'
        },

        _initialize: function () {
            this.account = this.model.account;
            this.contact = this.model.contact;
            this.$el.attr('data-id', this.model.id);
            this.content = new xabber.ChatContentView({chat_item: this});
            this.updateName();
            this.updateStatus();
            this.updateCounter();
            this.updateAvatar();
            this.updateBlockedState();
            this.updateMutedState();
            this.updateColorScheme();
            this.model.on("change:active", this.updateActiveStatus, this);
            this.model.on("change:unread", this.updateCounter, this);
            this.model.on("open", this.open, this);
            this.model.on("remove_opened_chat", this.onClosed, this);
            this.model.messages.on("destroy", this.onMessageRemoved, this);
            this.contact.on("change:name", this.updateName, this);
            this.contact.on("change:status", this.updateStatus, this);
            this.contact.on("change:image", this.updateAvatar, this);
            this.contact.on("change:blocked", this.updateBlockedState, this);
            this.contact.on("change:muted", this.updateMutedState, this);
            this.account.settings.on("change:color", this.updateColorScheme, this);
        },

        updateName: function () {
            this.$('.chat-title').text(this.contact.get('name'));
        },

        updateStatus: function () {
            var status = this.contact.get('status');
            this.$('.status').attr('data-status', status);
        },

        updateActiveStatus: function () {
            this.$el.switchClass('active', this.model.get('active'));
        },

        updateCounter: function () {
            var unread = this.model.get('unread');
            this.$('.msg-counter').showIf(unread).text(unread || '');
        },

        updateAvatar: function () {
            var image = this.contact.cached_image;
            this.$('.circle-avatar').setAvatar(image, this.avatar_size);
        },

        updateBlockedState: function () {
            this.$el.switchClass('blocked', this.contact.get('blocked'));
        },

        updateMutedState: function () {
            this.$('.muted-icon').showIf(this.contact.get('muted'));
            this.updateCSS();
        },

        updateColorScheme: function () {
            var color = this.account.settings.get('color');
            this.$el.attr('data-color', color);
            this.content.$el.attr('data-color', color);
            this.content.head.$el.attr('data-color', color);
            this.content.bottom.$el.attr('data-color', color);
        },

        onMessageRemoved: function (msg) {
            if (this.model.last_message === msg) {
                var last_message;
                for (var idx = this.model.messages.length-1; idx >= 0; idx--) {
                    last_message = this.model.messages.at(idx);
                    if (!last_message.get('silent')) {
                        break;
                    }
                }
                this.model.last_message = last_message;
                this.updateLastMessage();
            }
        },

        updateLastMessage: function (msg) {
            msg || (msg = this.model.last_message);
            if (!msg) {
                return;
            }
            var msg_text = msg.getText(),
                msg_time = moment(msg.get('time')),
                timestamp = msg.get('timestamp'),
                forwarded_message = msg.get('forwarded_message');
            this.model.set({timestamp: timestamp});
            this.$('.last-msg').text(msg_text);
            this.$el.emojify('.last-msg', {emoji_size: 14});
            this.$('.last-msg-date').text(utils.pretty_short_datetime(msg_time));
            this.$('.msg-delivering-state').showIf(msg.isSenderMe())
                .attr('data-state', msg.getState());
            this.updateCSS();
        },

        updateCSS: function () {
            var date_width = this.$('.last-msg-date').width();
            this.$('.chat-title-wrap').css('padding-right', date_width + 5);
            var title_width = this.$('.chat-title-wrap').width();
            this.contact.get('muted') && (title_width -= 24);
            this.$('.chat-title').css('max-width', title_width);
        },

        openByClick: function () {
            this.open();
        },

        open: function (options) {
            options || (options = {});
            xabber.chats_view.openChat(this, options);
        },

        onClosed: function () {
            this.parent.onChatRemoved(this.model, {soft: true});
        }
    });

    xabber.ChatContentView = xabber.BasicView.extend({
        className: 'chat-content-wrap',
        template: templates.chat_content,
        ps_selector: '.chat-content',
        ps_settings: {
            wheelPropagation: true
        },
        avatar_size: constants.AVATAR_SIZES.CHAT_MESSAGE,

        events: {
            'mousedown .chat-message': 'onTouchMessage',
            'mouseup .chat-message': 'onClickMessage'
        },

        _initialize: function (options) {
            this.chat_item = options.chat_item;
            this.account = this.chat_item.account;
            this.model = this.chat_item.model;
            this.contact = this.model.contact;
            this.head = new xabber.ChatHeadView({content: this});
            this.bottom = new xabber.ChatBottomView({content: this});
            this.$history_feedback = this.$('.load-history-feedback');
            this.$el.attr('data-id', this.model.id);
            this._scrolltop = this.getScrollTop();
            var wheel_ev = _.isUndefined(window.onwheel) ? "wheel" : "mousewheel";
            this.$el.on(wheel_ev, this.onMouseWheel.bind(this));
            this.ps_container.on("ps-scroll-up ps-scroll-down", this.onScroll.bind(this));
            this.model.on("change:active", this.onChangedActiveStatus, this);
            this.model.on("load_last_history", this.loadLastHistory, this);
            this.model.messages.on("add", this.onMessage, this);
            this.model.messages.on("change:state", this.onChangedMessageState, this);
            this.model.messages.on("change:is_unread", this.onChangedReadState, this);
            this.contact.on("change:blocked", this.updateBlockedState, this);
            this.contact.on("remove_from_blocklist", this.loadLastHistory, this);
            // TODO: optimize
            this.account.contacts.on("change:name", this.updateName, this);
            this.account.contacts.on("change:image", this.updateAvatar, this);
            this.account.on("change:name", this.updateMyName, this);
            this.account.on("change:status", this.updateMyStatus, this);
            this.account.on("change:image", this.updateMyAvatar, this);
            this.account.dfd_presence.done(function () {
                this.loadPreviousHistory();
            }.bind(this));
            return this;
        },

        render: function () {
            this.scrollToBottom();
        },

        onChangedVisibility: function () {
            if (this.isVisible()) {
                this.model.set({display: true, active: true});
                this.readMessages();
            } else {
                this.model.set({display: false});
            }
        },

        onChangedActiveStatus: function () {
            this.sendChatState(this.model.get('active') ? 'active' : 'inactive');
        },

        updateName: function (contact) {
            var name = contact.get('name'),
                jid = contact.get('jid');
            if (contact === this.contact) {
                this.$('.chat-message.with-author[data-from="'+jid+'"]').each(function () {
                    $(this).find('.chat-msg-author').text(name);
                });
            } else {
                this.$('.fwd-message.with-author[data-from="'+jid+'"]').each(function () {
                    $(this).find('.fwd-msg-author').text(name);
                });
            }
        },

        updateAvatar: function (contact) {
            var image = contact.cached_image,
                jid = contact.get('jid');
            if (contact === this.contact) {
                this.$('.chat-message.with-author[data-from="'+jid+'"]').each(function () {
                    $(this).find('.left-side .circle-avatar').setAvatar(
                            image, this.avatar_size);
                });
            } else {
                this.$('.fwd-message.with-author[data-from="'+jid+'"]').each(function () {
                    $(this).find('.fwd-left-side .circle-avatar').setAvatar(
                            image, this.avatar_size);
                });
            }
        },

        updateMyStatus: function () {
            var text;
            if (!this.account.isOnline()) {
                text = 'You are offline';
            }
            this.bottom.showChatNotification(text || '', true);
        },

        updateMyName: function () {
            var name = this.account.get('name'),
                jid = this.account.get('jid');
            this.$('.chat-message.with-author[data-from="'+jid+'"]').each(function () {
                $(this).find('.chat-msg-author').text(name);
            });
            this.$('.fwd-message.with-author[data-from="'+jid+'"]').each(function () {
                $(this).find('.fwd-msg-author').text(name);
            });
        },

        updateMyAvatar: function () {
            var image = this.account.cached_image,
                jid = this.account.get('jid');
            this.$('.chat-message.with-author[data-from="'+jid+'"]').each(function () {
                $(this).find('.left-side .circle-avatar').setAvatar(
                        image, this.avatar_size);
            });
            this.$('.fwd-message.with-author[data-from="'+jid+'"]').each(function () {
                $(this).find('.fwd-left-side .circle-avatar').setAvatar(
                        image, this.avatar_size);
            });
        },

        updateBlockedState: function () {
            var text;
            if (this.contact.get('blocked')) {
                text = 'You have blocked this contact';
            }
            this.bottom.showChatNotification(text || '');
        },

        readMessages: function (timestamp) {
            _.each(_.clone(this.model.messages_unread.models), function (msg) {
                if (!timestamp || msg.get('timestamp') <= timestamp) {
                    msg.set('is_unread', false);
                }
            }.bind(this));
        },

        onMouseWheel: function (ev) {
            if (ev.originalEvent.deltaY < 0) {
                this.loadPreviousHistory();
            }
        },

        onScroll: function () {
            this._prev_scrolltop = this._scrolltop || 0;
            this._scrolltop = this.getScrollTop();
            if (this._scrolltop < this._prev_scrolltop &&
                    (this._scrolltop < 2000 || this.getPercentScrolled() < 0.3)) {
                this.loadPreviousHistory();
            }
        },

        MAMRequest: function (options, callback, errback) {
            var account = this.account, messages = [], queryid = uuid();
            var iq = $iq({type: 'set'})
                    .c('query', {xmlns: Strophe.NS.MAM, queryid: queryid})
                    .c('x', {xmlns: Strophe.NS.XFORM, type: 'submit'})
                    .c('field', {'var': 'FORM_TYPE', type: 'hidden'})
                    .c('value').t(Strophe.NS.MAM).up().up()
                    .c('field', {'var': 'with'})
                    .c('value').t(this.model.get('jid')).up().up().up()
                    .cnode(new Strophe.RSM(options).toXML());
            var deferred = new $.Deferred();
            account.chats.onStartedMAMRequest(deferred);
            deferred.done(function () {
                var handler = account.connection.addHandler(function (message) {
                    var $msg = $(message);
                    if ($msg.find('result').attr('queryid') === queryid) {
                        messages.push(message);
                    }
                    return true;
                }, Strophe.NS.MAM);
                account.sendIQ(iq,
                    function (res) {
                        account.connection.deleteHandler(handler);
                        account.chats.onCompletedMAMRequest(deferred);
                        var $fin = $(res).find('fin[xmlns="'+Strophe.NS.MAM+'"]');
                        if ($fin.length && $fin.attr('queryid') === queryid) {
                            var rsm = new Strophe.RSM({xml: $fin.find('set')[0]});
                            callback && callback(messages, rsm);
                        }
                    },
                    function (err) {
                        account.connection.deleteHandler(handler);
                        xabber.error("MAM error");
                        xabber.error(err);
                        account.chats.onCompletedMAMRequest(deferred);
                        errback && errback(err);
                    }
                );
            });
        },

        getMessageArchive: function (query, options) {
            if (options.previous_history) {
                if (this._loading_history || this.model.get('history_loaded')) {
                    return;
                }
                this._loading_history = true;
                this.showHistoryFeedback();
            }
            var account = this.model.account;
            this.MAMRequest(query,
                function (messages, rsm) {
                    if (options.previous_history) {
                        this._loading_history = false;
                        this.hideHistoryFeedback();
                        if (messages.length < query.max) {
                            this.model.set('history_loaded', true);
                        }
                    }
                    if (options.previous_history || !this.model.get('first_archive_id')) {
                        rsm.first && this.model.set('first_archive_id', rsm.first);
                    }
                    if (options.last_history || !this.model.get('last_archive_id')) {
                        rsm.last && this.model.set('last_archive_id', rsm.last);
                    }
                    _.each(messages, function (message) {
                        account.chats.receiveChatMessage(message,
                            _.extend({is_archived: true}, options)
                        );
                    });
                }.bind(this),
                function (err) {
                    if (options.previous_history) {
                        this._loading_history = false;
                        this.showHistoryFeedback(true);
                    }
                }.bind(this)
            );
        },

        loadLastHistory: function () {
            if (!xabber.settings.load_history) {
                return;
            }
            var last_archive_id = this.model.get('last_archive_id'),
                query = {};
            if (last_archive_id) {
                query.after = last_archive_id;
            } else {
                query.before = '';
                query.max = xabber.settings.mam_messages_limit;
            }
            this.getMessageArchive(query, {last_history: true});
        },

        loadPreviousHistory: function () {
            if (!xabber.settings.load_history) {
                return;
            }
            this.getMessageArchive({
                max: xabber.settings.mam_messages_limit,
                before: this.model.get('first_archive_id') || ''
            }, {previous_history: true});
        },

        showHistoryFeedback: function (is_error) {
            if (this._load_history_feedback_timeout) {
                clearTimeout(this._load_history_feedback_timeout);
                this._load_history_feedback_timeout = null;
            }
            var text = is_error ? 'Error while loading archived messages' : 'Loading messages...';
            this.$history_feedback.text(text).removeClass('hidden');
            if (is_error) {
                this._load_history_feedback_timeout = setTimeout(
                        this.hideHistoryFeedback.bind(this), 5000);
            }
        },

        hideHistoryFeedback: function () {
            this.$history_feedback.addClass('hidden');
        },

        receiveNoTextMessage: function ($message, carbon_copied) {
            var from_jid = Strophe.getBareJidFromJid($message.attr('from')),
                to_jid = Strophe.getBareJidFromJid($message.attr('to')),
                is_sender = from_jid === this.account.get('jid'),
                $chat_state = $message.find('[xmlns="'+Strophe.NS.CHATSTATES+'"]');
            if ($chat_state.length) {
                if (!is_sender) {
                    this.showChatState($chat_state[0].tagName.toLowerCase());
                }
            }
        },

        showChatState: function (state) {
            clearTimeout(this._chatstate_show_timeout);
            var message, name = this.contact.get('name');
            if (state === 'composing') {
                message = name + ' is typing...';
                this._chatstate_show_timeout = setTimeout(function () {
                    this.showChatState('paused');
                }.bind(this), constants.CHATSTATE_TIMEOUT_PAUSED);
            } else if (state === 'paused') {
                message = name + ' has stopped typing';
                this._chatstate_show_timeout = setTimeout(function () {
                    this.showChatState();
                }.bind(this), constants.CHATSTATE_TIMEOUT_STOPPED);
            } else {
                this.bottom.showChatNotification('');
                this.chat_item.updateLastMessage();
                return;
            }
            this.bottom.showChatNotification(message);
            this.chat_item.$('.last-msg').text(message);
            this.chat_item.$('.last-msg-date').text(utils.pretty_short_datetime());
            this.chat_item.$('.msg-delivering-state').addClass('hidden');
        },

        onMessage: function (message) {
            this.account.messages.add(message);
            this.model.set('opened', true);
            if (!message.get('is_archived') && message.get('archive_id')) {
                this.model.set('last_archive_id', message.get('archive_id'));
            }
            var is_scrolled_to_bottom = this.isScrolledToBottom();
            var $message = this.addMessage(message);
            if (is_scrolled_to_bottom || message.get('submitted_here')) {
                this.scrollToBottom();
            } else {
                this.updateScrollBar();
            }
            if (!(message.get('is_archived') || message.isSenderMe() || message.get('silent'))) {
                message.set('is_unread', !(this.model.get('display') && xabber.get('focused')));
                if (!xabber.get('focused')) {
                    if (this.contact.get('muted')) {
                        message.set('muted', true);
                    } else {
                        this.notifyMessage(message);
                    }
                }
            }
            if (message.isSenderMe()) {
                this.readMessages(message.get('timestamp'));
            }
            if (!message.get('silent')) {
                var last_message = this.model.last_message;
                if (!last_message || message.get('timestamp') > last_message.get('timestamp')) {
                    this.model.last_message = message;
                    this.chat_item.updateLastMessage();
                }
            }
            if (message.get('type') === 'file_upload') {
                this.startUploadFile(message, $message);
            }
        },

        addMessage: function (message) {
            var $message = this.buildMessageHtml(message);
            var index = this.model.messages.indexOf(message);
            if (index === 0) {
                $message.prependTo(this.$('.chat-content'));
            } else {
                $message.insertAfter(this.$('.chat-message').eq(index - 1));
            }
            var $next_message = $message.nextAll('.chat-message').first();
            this.updateMessageInChat($message[0]);
            if ($next_message.length) {
                this.updateMessageInChat($next_message[0]);
            }
            return $message;
        },

        removeMessage: function (item) {
            var message, $message;
            if (item instanceof xabber.Message) {
                message = item;
                $message = this.$('.chat-message[data-msgid="'+item.get('msgid')+'"]');
            } else {
                $message = item;
                if (!$message.length) return;
                message = this.model.messages.get($message.data('msgid'));
            }
            message && message.destroy();
            $message.prev('.chat-day-indicator').remove();
            $message.remove();
            if (!this._clearing_history) {
                this.updateScrollBar();
            }
        },

        clearHistory: function () {
            this._clearing_history = true;
            _.each(_.clone(this.model.messages.models), this.removeMessage.bind(this));
            this._clearing_history = false;
            this.updateScrollBar();
        },

        buildMessageHtml: function (message) {
            var attrs = _.clone(message.attributes),
                is_sender = message.isSenderMe(),
                username = is_sender ? this.account.get('name') : this.contact.get('name');
            _.extend(attrs, {
                username: username,
                state: message.getState(),
                verbose_state: message.getVerboseState(),
                time: moment(attrs.time).format('HH:mm:ss')
            });
            if (attrs.type === 'file_upload') {
                return $(templates.messages.file_upload(attrs));
            }
            if (attrs.type === 'system') {
                var tpl_name = attrs.auth_request ? 'auth_request' : 'system';
                return $(templates.messages[tpl_name](attrs));
            }
            var classes = [
                attrs.forwarded_message && 'forwarding'
            ];
            var $message = $(templates.messages.main(_.extend(attrs, {
                is_sender: is_sender,
                message: _.escape(attrs.message),
                classlist: classes.join(' ')
            })));
            if (attrs.forwarded_message) {
                is_sender = attrs.forwarded_message.isSenderMe();
                attrs = _.clone(attrs.forwarded_message.attributes);
                if (is_sender) {
                    username = this.account.get('name');
                } else {
                    var contact = this.account.contacts.mergeContact(attrs.from_jid);
                    username = contact.get('name');
                }
                var $f_message = $(templates.messages.forwarded(_.extend(attrs, {
                    time: utils.pretty_short_datetime(moment(attrs.time)),
                    username: username,
                    message: _.escape(attrs.message)
                })));
                $message.find('.msg-wrap .chat-msg-content').remove();
                $message.find('.msg-wrap').append($f_message);
            }
            return $message.hyperlinkify({selector: '.chat-text-content'})
                .emojify('.chat-text-content');
        },

        getDateIndicator: function (date) {
            var day_date = moment(date).startOf('day');
            return $('<div class="chat-day-indicator one-line noselect" data-time="'+
                day_date.format('x')+'">'+day_date.format("dddd, MMMM D, YYYY")+'</div>');
        },

        hideMessageAuthor: function ($msg) {
            $msg.removeClass('with-author');
        },

        showMessageAuthor: function ($msg) {
            if ($msg.hasClass('system')) {
                return;
            }
            $msg.addClass('with-author');
            var image, $avatar = $msg.find('.left-side .circle-avatar');
            if ($msg.data('from') === this.account.get('jid')) {
                image = this.account.cached_image;
            } else {
                image = this.contact.cached_image;
            }
            $avatar.setAvatar(image, this.avatar_size);
        },

        hideFwdMessageAuthor: function ($msg) {
            $msg.find('.fwd-message').removeClass('with-author');
        },

        showFwdMessageAuthor: function ($msg) {
            var $fwd_message = $msg.find('.fwd-message');
            if (!$fwd_message.length) {
                return;
            }
            $fwd_message.addClass('with-author');
            var image,
                $avatar = $fwd_message.find('.circle-avatar'),
                from_jid = $fwd_message.data('from'),
                is_sender = (from_jid === this.account.get('jid')),
                contact = this.account.contacts.get(from_jid);
            if (is_sender) {
                image = this.account.cached_image;
            } else if (contact) {
                image = contact.cached_image;
            }
            $avatar.setAvatar(image, this.avatar_size);
            $avatar.removeClass('hidden');
        },

        updateMessageInChat: function (msg_elem) {
            var $msg = $(msg_elem);
            $msg.prev('.chat-day-indicator').remove();
            var $prev_msg = $msg.prevAll('.chat-message').first();
            if (!$prev_msg.length) {
                this.getDateIndicator($msg.data('time')).insertBefore($msg);
                this.showMessageAuthor($msg);
                this.showFwdMessageAuthor($msg);
                return;
            }
            var is_system = $prev_msg.hasClass('system');
                is_same_sender = ($msg.data('from') === $prev_msg.data('from')),
                is_same_date = moment($msg.data('time')).startOf('day')
                        .isSame(moment($prev_msg.data('time')).startOf('day'));
            if (!is_same_date) {
                this.getDateIndicator($msg.data('time')).insertBefore($msg);
                this.showMessageAuthor($msg);
            } else if (is_system || !is_same_sender) {
                this.showMessageAuthor($msg);
            } else {
                this.hideMessageAuthor($msg);
            }
            if ($msg.hasClass('forwarding')) {
                var $fwd_message = $msg.find('.fwd-message');
                var $prev_fwd_message = $prev_msg.find('.fwd-message');
                $msg.switchClass('hide-date', is_same_date && $prev_fwd_message.length);
                $msg.removeClass('hide-time');
                if ($prev_fwd_message.length) {
                    var is_same_fwded_sender = (
                        $fwd_message.data('from') === $prev_fwd_message.data('from'));
                    $msg.switchClass('hide-time', is_same_fwded_sender);
                    if (is_same_sender) {
                        if (is_same_fwded_sender) {
                            this.hideFwdMessageAuthor($msg);
                        } else {
                            this.showFwdMessageAuthor($msg);
                        }
                    } else {
                        this.showFwdMessageAuthor($msg);
                    }
                } else {
                    this.showMessageAuthor($msg);
                    this.showFwdMessageAuthor($msg);
                }
            }
        },

        notifyMessage: function (message) {
            var jid = this.model.get('jid');
            if (xabber.settings.notifications) {
                var notification = xabber.popupNotification({
                    title: this.contact.get('name'),
                    text: (xabber.settings.message_preview ? message.getText() : 'sent you a message'),
                    icon: this.contact.cached_image.url
                });
                notification.onclick = function () {
                    window.focus();
                    this.model.trigger('open');
                }.bind(this);
            }
            if (xabber.settings.sound) {
                var sound;
                if (message.get('auth_request')) {
                    sound = xabber.settings.sound_on_auth_request;
                } else {
                    sound = xabber.settings.sound_on_message;
                }
                xabber.playAudio(sound);
            }
            xabber.increaseMessageCounter();
        },

        sendMessage: function (message) {
            var body = message.get('message'),
                forwarded_message = message.get('forwarded_message');
            var stanza = $msg({
                    from: this.account.jid,
                    to: this.model.get('jid'),
                    type: 'chat',
                    id: message.get('msgid')
                }).c('body').t(body).up()
                    .c('markable').attrs({'xmlns': Strophe.NS.CHAT_MARKERS}).up();
            message.set({xml: stanza.tree()});

            if (forwarded_message) {
                stanza.c('forwarded', {xmlns:'urn:xmpp:forward:0'})
                    .c('delay', {
                        xmlns: 'urn:xmpp:delay',
                        stamp: forwarded_message.get('time')
                    }).up().cnode(forwarded_message.get('xml')).up();
            }
            this.account.sendMsg(stanza, function () {
                message.set('state', constants.MSG_SENT);
            });
        },

        sendMarker: function (message, status) {
            status || (status = 'displayed');
            var stanza = $msg({
                from: this.account.jid,
                to: this.model.get('jid'),
                type: 'chat',
                id: uuid()
            }).c(status).attrs({
                xmlns: Strophe.NS.CHAT_MARKERS,
                id: message.get('msgid')
            }).up();
            this.account.sendMsg(stanza);
        },

        onSubmit: function (text, fwd_messages) {
            // send forwarded messages before
            _.each(fwd_messages, function (msg) {
                if (this.account.forwarded_messages.indexOf(msg) < 0) {
                    msg = this.account.forwarded_messages.create(_.extend({
                        is_forwarded: true,
                        forwarded_message: null
                    }, msg.attributes));
                }
                var message = this.model.messages.create({
                    from_jid: this.account.get('jid'),
                    message: '> ' + msg.get('from_jid') + '\n> ' + msg.get('message'),
                    submitted_here: true,
                    forwarded_message: msg
                });
                this.sendMessage(message);
            }.bind(this));

            if (text) {
                var message = this.model.messages.create({
                    from_jid: this.account.get('jid'),
                    message: text,
                    submitted_here: true,
                    forwarded_message: null
                });
                this.sendMessage(message);
            }
        },

        addFileMessage: function (file) {
            var http_upload_service = this.account.server_features.get(Strophe.NS.HTTP_UPLOAD);
            if (!http_upload_service) {
                return;
            }
            this.model.messages.create({
                from_jid: this.account.get('jid'),
                type: 'file_upload',
                file: file,
                upload_service: http_upload_service.get('from'),
                message: 'Uploading file',
                submitted_here: true
            });
        },

        startUploadFile: function (message, $message) {
            $message.find('.cancel-upload').show();
            $message.find('.repeat-upload').hide();
            $message.find('.status').hide();
            $message.find('.progress').show();
            var file = message.get('file'),
                iq = $iq({type: 'get', to: message.get('upload_service')})
                    .c('request', {xmlns: Strophe.NS.HTTP_UPLOAD})
                    .c('filename').t(file.name).up()
                    .c('size').t(file.size).up()
                    .c('content-type').t(file.type).up(),
                deferred = new $.Deferred(), self = this;
            this.account.sendIQ(iq,
                function (result) {
                    var $slot = $(result).find('slot[xmlns="'+Strophe.NS.HTTP_UPLOAD+'"]');
                    deferred.resolve({
                        get_url: $slot.find('get').text(),
                        put_url: $slot.find('put').text()
                    });
                },
                function (err) {
                    var error_text = $(err).find('error text').text();
                    self.onFileNotUploaded(message, $message, error_text);
                }
            );
            deferred.done(function (data) {
                var xhr = new XMLHttpRequest(),
                    $bar = $message.find('.progress');
                $message.find('.cancel-upload').click(function (ev) {
                    xhr.abort();
                }.bind(this));
                xhr.onabort = function (event) {
                    this.removeMessage($message);
                }.bind(this);
                xhr.upload.onprogress = function (event) {
                    var percentage = event.loaded / event.total;
                    $bar.find('.determinate').attr('style', 'width: '+(100*percentage)+'%');
                    $message.find('.filesize')
                        .text(utils.pretty_size(event.loaded)+' of '+
                              utils.pretty_size(event.total));
                };
                xhr.onload = xhr.onerror = function () {
                    if (this.status === 201 && this.responseURL === data.get_url) {
                        self.onFileUploaded(message, $message, data);
                    } else {
                        self.onFileNotUploaded(message, $message, this.responseText);
                    }
                };
                if ($message.data('cancel')) {
                    xhr.onabort();
                } else {
                    xhr.open("PUT", data.put_url, true);
                    xhr.send(file);
                }
            }.bind(this));
        },

        onFileUploaded: function (message, $message, data) {
            message.set({type: 'main', message: data.get_url});
            $message.removeClass('file-upload noselect');
            $message.find('.chat-msg-content').removeClass('chat-file-content')
                .addClass('chat-text-content').html(data.get_url);
            $message.hyperlinkify({selector: '.chat-text-content'});
            this.sendMessage(message);
        },

        onFileNotUploaded: function (message, $message, error_text) {
            var error_message = error_text ? 'Error: '+error_text : 'File uploading error';
            $message.find('.cancel-upload').hide();
            $message.find('.repeat-upload').show();
            $message.find('.status').text(error_message).show();
            $message.find('.progress').hide();
            $message.find('.repeat-upload').click(function () {
                this.startUploadFile(message, $message);
            }.bind(this));
        },

        sendChatState: function (state) {
            clearTimeout(this._chatstate_send_timeout);
            this.account.sendMsg($msg({'to': this.model.get('jid'), 'type': 'chat'})
                    .c(state, {'xmlns': Strophe.NS.CHATSTATES}));
            if (state === 'composing') {
                this._chatstate_send_timeout = setTimeout(function () {
                    this.sendChatState('paused');
                }.bind(this), constants.CHATSTATE_TIMEOUT_PAUSED);
            }
        },

        onChangedMessageState: function (message) {
            var $message = this.$('.chat-message[data-msgid="'+message.get('msgid')+'"]'),
                $elem = $message.find('.msg-delivering-state');
            $elem.attr({
                'data-state': message.getState(),
                'title': message.getVerboseState()
            });
            if (message === this.model.last_message) {
                this.chat_item.updateLastMessage();
            }
        },

        onChangedReadState: function (message) {
            var is_unread = message.get('is_unread');
            if (is_unread) {
                this.model.messages_unread.add(message);
                this.model.increaseUnread();
            } else {
                this.model.messages_unread.remove(message);
                this.model.decreaseUnread();
                if (message.get('markable')) {
                    this.sendMarker(message, 'displayed');
                }
                if (!message.get('muted')) {
                    xabber.decreaseMessageCounter();
                }
            }
        },

        onTouchMessage: function (ev) {
            if (ev.which === 3) {
                return;
            }
            var $elem = $(ev.target), $msg, msg,
                $fwd_message = $elem.parents('.fwd-message').first(),
                is_forwarded = $fwd_message.length > 0;
            if ($elem.hasClass('chat-message')) {
                $msg = $elem;
            } else {
                $msg = $elem.parents('.chat-message');
            }
            if (window.getSelection() != 0) {
                utils.clearSelection();
                $msg.attr('data-no-select-on-mouseup', '1');
            }
        },

        onClickMessage: function (ev) {
            var $elem = $(ev.target),
                $msg = $elem.closest('.chat-message'), msg,
                $fwd_message = $elem.parents('.fwd-message').first(),
                is_forwarded = $fwd_message.length > 0;
            var no_select_message = $msg.attr('data-no-select-on-mouseup');
            $msg.attr('data-no-select-on-mouseup', '');
            if (window.getSelection() != 0) {
                return;
            }

            if ($elem.hasClass('chat-msg-author') || $elem.hasClass('fwd-msg-author') ||
                        $elem.parent().hasClass('circle-avatar')) {
                var from_jid = is_forwarded ? $fwd_message.data('from') : $msg.data('from');
                if (from_jid === this.account.get('jid')) {
                    this.account.showSettings();
                } else if (from_jid === this.model.get('jid')) {
                    this.contact.showDetails('chats');
                } else {
                    var contact = this.account.contacts.mergeContact(from_jid);
                    contact.showDetails();
                }
                return;
            }
            if ($elem.hasClass('msg-hyperlink')) {
                return;
            }
            if ($elem.hasClass('img-content')) {
                xabber.openWindow($elem.attr('src'));
                return;
            }
            msg = this.model.messages.get($msg.data('msgid'));
            if (!msg) {
                return;
            }
            var type = msg.get('type');
            if (type === 'file_upload') {
                return;
            }

            var processClick = function () {
                if (!no_select_message) {
                    $msg.switchClass('selected', !$msg.hasClass('selected'));
                    this.bottom.manageSelectedMessages();
                }
            }.bind(this);

            if (type === 'system') {
                if (!msg.get('auth_request')) {
                    return;
                }
                if ($elem.hasClass('accept-request')) {
                    this.contact.acceptRequest(function () {
                        this.removeMessage($msg);
                        this.contact.showDetails('chats');
                    }.bind(this));
                } else if ($elem.hasClass('block-request')) {
                    this.contact.blockRequest(function () {
                        this.model.showBlockedRequestMessage();
                    }.bind(this));
                } else if ($elem.hasClass('decline-request')) {
                    this.contact.declineRequest(function () {
                        this.removeMessage($msg);
                        this.model.showDeclinedRequestMessage();
                    }.bind(this));
                }
            } else if (is_forwarded) {
                var fwd_message = this.account.forwarded_messages.get($fwd_message.data('msgid'));
                if (!fwd_message) {
                    return;
                }
                processClick();
            } else {
                processClick();
            }
        }
    });

    xabber.ChatsBase = Backbone.Collection.extend({
        model: xabber.Chat
    });

    xabber.Chats = xabber.ChatsBase.extend({
        initialize: function (models, options) {
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
        }
    });

    xabber.OpenedChats = xabber.ChatsBase.extend({
        comparator: function (item1, item2) {
            var t1 = item1.get('timestamp'),
                t2 = item2.get('timestamp');
            return t1 > t2 ? -1 : (t1 < t2 ? 1 : 0);
        },

        initialize: function (models, options) {
            this.on("change:timestamp", this.sort, this);
        },

        update: function (chat, event) {
            var contains = chat.get('opened');
            if (contains) {
                if (!this.get(chat)) {
                    this.add(chat);
                    chat.trigger("add_opened_chat", chat);
                }
            } else if (this.get(chat)) {
                this.remove(chat);
                chat.trigger("remove_opened_chat", chat);
            }
        }
    });

    xabber.ClosedChats = xabber.ChatsBase.extend({
        update: function (chat, event) {
            var contains = !chat.get('opened');
            if (contains) {
                if (!this.get(chat)) {
                    this.add(chat);
                    chat.trigger("add_closed_chat", chat);
                }
            } else if (this.get(chat)) {
                this.remove(chat);
                chat.trigger("remove_closed_chat", chat);
            }
        }
    });

    xabber.AccountChats = xabber.ChatsBase.extend({
        initialize: function (models, options) {
            this.account = options.account;
            this.mam_requests = 0;
            this.deferred_mam_requests = [];
            this.account.contacts.on("add_to_roster", this.getChat, this);
            this.account.contacts.on("open_chat", this.openChat, this);
            this.account.contacts.on("presence", this.onPresence, this);
        },

        getChat: function (contact) {
            var chat = this.get(contact.hash_id);
            if (!chat) {
                chat = xabber.chats.create(null, {contact: contact});
                this.add(chat);
                contact.set('known', true);
            }
            return chat;
        },

        openChat: function (contact) {
            var chat = this.getChat(contact);
            chat.trigger('open', {clear_search: true});
        },

        registerMessageHandler: function () {
            this.account.connection.deleteHandler(this._msg_handler);
            this._msg_handler = this.account.connection.addHandler(function (message) {
                this.receiveMessage(message);
                return true;
            }.bind(this), null, 'message');
        },

        onStartedMAMRequest: function (deferred) {
            this.deferred_mam_requests.push(deferred);
            this.runMAMRequests();
        },

        onCompletedMAMRequest: function (deferred) {
            this.mam_requests--;
            this.runMAMRequests();
        },

        runMAMRequests: function () {
            while (this.mam_requests < xabber.settings.mam_requests_limit) {
                var deferred = this.deferred_mam_requests.shift();
                if (!deferred) break;
                this.mam_requests++;
                deferred.resolve();
            }
        },

        receiveMessage: function (message) {
            var type = message.getAttribute('type');
            if (type === 'chat') {
                return this.receiveChatMessage(message);
            }
            if (type === 'error') {
                return this.receiveErrorMessage(message);
            }
        },

        receiveChatMessage: function (message, options) {
            options = options || {};
            var $message = $(message),
                $forwarded = $message.find('forwarded'),
                $delay = options.delay,
                to_jid = $message.attr('to'),
                to_bare_jid = Strophe.getBareJidFromJid(to_jid),
                to_resource = Strophe.getResourceFromJid(to_jid),
                from_jid = $message.attr('from');

            if (!from_jid) {
                xabber.warn('Message without "from" attribute');
                xabber.warn(message);
                return;
            }
            var from_bare_jid = Strophe.getBareJidFromJid(from_jid),
                from_resource = Strophe.getResourceFromJid(from_jid),
                is_sender = from_bare_jid === this.account.get('jid');

            if (options.forwarded) {
                return this.account.forwarded_messages.createFromStanza($message, {
                    is_forwarded: true,
                    delay: $delay
                });
            }

            if ($forwarded.length) {
                var $mam = $message.find('result[xmlns="'+Strophe.NS.MAM+'"]');
                if ($mam.length) {
                    $forwarded = $mam.children('forwarded');
                    if ($forwarded.length) {
                        $message = $forwarded.children('message');
                        $delay = $forwarded.children('delay');
                    }
                    return this.receiveChatMessage($message[0], _.extend(options, {
                        is_mam: true,
                        delay: $delay,
                        archive_id: $mam.attr('id')
                    }));
                }
                var $carbons = $message.find('[xmlns="'+Strophe.NS.CARBONS+'"]');
                if ($carbons.length) {
                    if (!is_sender) {
                        return;
                    }
                    $forwarded = $carbons.children('forwarded');
                    if ($forwarded.length) {
                        $message = $forwarded.children('message');
                    }
                    return this.receiveChatMessage($message[0], _.extend(options, {
                        carbon_copied: true
                    }));
                }

                var $forwarded_message = $forwarded.children('message'),
                    $forwarded_delay = $forwarded.children('delay');
                $forwarded.remove();
                var forwarded_message = this.receiveChatMessage($forwarded_message[0], {
                    forwarded: true,
                    delay: $forwarded_delay
                });
                return this.receiveChatMessage($message[0], _.extend({
                    forwarded_message: forwarded_message
                }, options));
            }

            if (!options.is_mam && to_resource && to_resource !== this.account.resource) {
                xabber.warn('Message to another resource');
                xabber.warn(message);
            }

            var contact_jid = is_sender ? to_bare_jid : from_bare_jid;

            if (contact_jid === this.account.get('jid')) {
                xabber.warn('Message from me to me');
                xabber.warn(message);
                return;
            }

            var contact = this.account.contacts.mergeContact(contact_jid),
                chat = this.account.chats.getChat(contact);
            return chat.receiveMessage($message, _.extend(options, {is_sender: is_sender}));
        },

        receiveErrorMessage: function (message) {
            var msgid = message.getAttribute('id');
            if (msgid) {
                var code = $(message).find('error').attr('code');
                var msg = this.account.messages.get(msgid);
                if (msg && code === '406') {
                    msg.set('state', constants.MSG_ERROR);
                }
            }
        },

        onPresence: function (contact, type) {
            var chat = this.getChat(contact);
            chat.onPresence(type);
        }
    });

    xabber.ChatsView = xabber.SearchView.extend({
        className: 'recent-chats-container container',
        ps_selector: '.chat-list-wrap',
        ps_settings: {theme: 'item-list'},
        template: templates.chats_panel,

        _initialize: function () {
            this.active_chat = null;
            this.model.on("add", this.onChatAdded, this);
            this.model.on("destroy", this.onChatRemoved, this);
            this.model.on("change:active", this.onChangedActiveStatus, this);
            this.model.on("change:timestamp", this.updateChatPosition, this);
            xabber.accounts.on("list_changed", this.updateLeftIndicator, this);
        },

        render: function (options) {
            options.right !== 'chat' && this.clearSearch();
        },

        updateLeftIndicator: function (accounts) {
            this.$el.attr('data-indicator', accounts.connected.length > 1);
        },

        onChatAdded: function (chat) {
            this.addChild(chat.id, chat.item_view);
            this.updateChatPosition(chat);
        },

        onChatRemoved: function (chat, options) {
            if (this.active_chat === this.child(chat.id)) {
                this.active_chat = null;
                xabber.body.setScreen(null, {chat_item: null},
                        {silent: !xabber.body.isScreen('chats')});
            }
            this.removeChild(chat.id, options);
            this.updateScrollBar();
        },

        onChangedActiveStatus: function (chat) {
            if (chat.get('active')) {
                var previous_chat = this.active_chat;
                this.active_chat = this.child(chat.id);
                previous_chat && previous_chat.model.set('active', false);
            }
        },

        updateChatPosition: function (item) {
            var view = this.child(item.id);
            if (view && item.get('timestamp')) {
                view.$el.detach();
                var index = this.model.indexOf(item);
                if (index === 0) {
                    this.$('.chat-list').prepend(view.$el);
                } else {
                    this.$('.chat-item').eq(index - 1).after(view.$el);
                }
                this.updateScrollBar();
            }
        },

        search: function (query) {
            var chats = this.model;
            this.$('.chat-item').each(function () {
                var $this = $(this),
                    chat = chats.get($this.data('id'));
                if (!chat) return;
                var jid = chat.get('jid'),
                    name = chat.contact.get('name').toLowerCase();
                $this.hideIf(name.indexOf(query) < 0 && jid.indexOf(query) < 0);
            });
        },

        onEnterPressed: function (selection) {
            var view = this.child(selection.data('id'));
            view && view.open();
        },

        openChat: function (view, options) {
            options.clear_search && this.clearSearch();
            xabber.body.setScreen('chats', {right: 'chat', chat_item: view});
        }
    });

    xabber.ForwardPanelView = xabber.SearchView.extend({
        className: 'modal forward-panel-modal',
        template: templates.forward_panel,

        events: {
            "keyup .search-input": "keyUpOnSearch",
            "focusout .search-input": "clearSearchSelection",
            "click .close-search-icon": "clearSearch",
            'click .chat-item': 'clickOnItem',
            'click .close-button': 'close'
        },

        open: function (messages) {
            this.messages = messages;
            this.$('.chat-list').html(xabber.chats_view.$('.chat-list').html());
            this.$('.chat-item').removeClass('active');
            this.clearSearch();
            this.data.set('visible', true);
            this.$el.openModal({
                ready: function () {
                    this.updateScrollBar();
                    this.$('.search-input').focus();
                }.bind(this),
                complete: function () {
                    this.$el.detach();
                    this.data.set('visible', false);
                }.bind(this)
            });
        },

        close: function () {
            var deferred = new $.Deferred();
            this.$el.closeModal({ complete: function () {
                this.$el.detach();
                this.data.set('visible', false);
                deferred.resolve();
            }.bind(this)});
            return deferred.promise();
        },

        clickOnItem: function (ev) {
            var $target = $(ev.target).closest('.chat-item');
            var chat_item = xabber.chats_view.child($target.data('id'));
            chat_item && this.forwardTo(chat_item);
        },

        search: function () {
            xabber.chats_view.search.apply(this, arguments);
        },

        onEnterPressed: function (selection) {
            var chat_item = xabber.chats_view.child(selection.data('id'));
            chat_item && this.forwardTo(chat_item);
        },

        forwardTo: function (chat_item) {
            chat_item.content.bottom.setForwardedMessages(this.messages);
            this.messages = [];
            this.close().done(function () {
                chat_item.open({clear_search: true});
            });
        }
    });

    xabber.ChatHeadView = xabber.BasicView.extend({
        className: 'chat-head-wrap',
        template: templates.chat_head,
        avatar_size: constants.AVATAR_SIZES.CHAT_HEAD,

        events: {
            "click .contact-name": "showContactDetails",
            "click .circle-avatar": "showContactDetails",
            "click .btn-notifications": "changeNotifications",
            "click .btn-contact-details": "showContactDetails",
            "click .btn-clear-history": "clearHistory",
            "click .btn-block-contact": "blockContact",
            "click .btn-unblock-contact": "unblockContact",
            "click .btn-close-chat": "closeChat"
        },

        _initialize: function (options) {
            this.content = options.content;
            this.contact = this.content.contact;
            this.model = this.content.model;
            this.account = this.model.account;
            this.updateName();
            this.updateStatus();
            this.updateAvatar();
            this.updateMenu();
            this.updateNotifications();
            this.contact.on("change:name", this.updateName, this);
            this.contact.on("change:status_updated", this.updateStatus, this);
            this.contact.on("change:image", this.updateAvatar, this);
            this.contact.on("change:blocked", this.updateMenu, this);
            this.contact.on("change:muted", this.updateNotifications, this);
        },

        render: function (options) {
            this.$('.tooltipped').tooltip('remove');
            this.$('.tooltipped').tooltip({delay: 50});
            this.$('.btn-more').dropdown({
                inDuration: 100,
                outDuration: 100,
                hover: false
            });
            this.$('.chat-head-menu').hide();
            return this;
        },

        updateName: function () {
            this.$('.contact-name').text(this.contact.get('name'));
        },

        updateStatus: function () {
            var status = this.contact.get('status'),
                status_message = this.contact.getStatusMessage();
            this.$('.contact-status').attr('data-status', status);
            this.$('.contact-status-message').text(status_message);
        },

        updateAvatar: function () {
            var image = this.contact.cached_image;
            this.$('.circle-avatar').setAvatar(image, this.avatar_size);
        },

        updateMenu: function () {
            var is_blocked = this.contact.get('blocked');
            this.$('.btn-block-contact').hideIf(is_blocked);
            this.$('.btn-unblock-contact').showIf(is_blocked);
        },

        showContactDetails: function () {
            this.contact.showDetails('chats');
        },

        updateNotifications: function () {
            var muted = this.contact.get('muted');
            this.$('.btn-notifications .muted').showIf(muted);
            this.$('.btn-notifications .no-muted').hideIf(muted);
        },

        changeNotifications: function () {
            var muted = !this.contact.get('muted');
            this.contact.set('muted', muted);
            this.account.chat_settings.updateMutedList(this.contact.get('jid'), muted);
        },

        clearHistory: function () {
            this.content.clearHistory();
            xabber.chats_view.clearSearch();
        },

        blockContact: function () {
            this.contact.block();
            xabber.chats_view.clearSearch();
        },

        unblockContact: function () {
            this.contact.unblock();
            xabber.chats_view.clearSearch();
        },

        closeChat: function () {
            this.model.set('opened', false);
            xabber.chats_view.clearSearch();
        }
    });

    xabber.ChatBottomView = xabber.BasicView.extend({
        className: 'chat-bottom-wrap',
        template: templates.chat_bottom,
        avatar_size: constants.AVATAR_SIZES.CHAT_BOTTOM,

        events: {
            "click .my-avatar": "showAccountSettings",
            "keyup .input-message .rich-textarea": "keyUp",
            "keydown .input-message .rich-textarea": "keyDown",
            "change .attach-file input": "onFileInputChanged",
            "click .close-forward": "unsetForwardedMessages",
            "click .send-message": "submit",
            "click .reply-message": "replyMessage",
            "click .forward-message": "forwardMessages",
            "click .close-message-panel": "resetSelectedMessages"
        },

        _initialize: function (options) {
            this.view = options.content;
            this.model = this.view.model;
            this.contact = this.view.contact;
            this.account = this.view.account;
            this.fwd_messages = [];
            this.$('.account-jid').text(this.account.get('jid'));
            this.updateAvatar();
            this.account.on("change:image", this.updateAvatar, this);
            var $rich_textarea = this.$('.input-message .rich-textarea'),
                rich_textarea = $rich_textarea[0],
                $rich_textarea_wrap = $rich_textarea.parent('.rich-textarea-wrap'),
                $placeholder = $rich_textarea.siblings('.placeholder');
            rich_textarea.onpaste = this.onPaste.bind(this);
            rich_textarea.ondragenter = function (ev) {
                ev.preventDefault();
                $placeholder.text('Drop files here to send');
                $rich_textarea_wrap.addClass('file-drop');
            };
            rich_textarea.ondragover = function (ev) {
                ev.preventDefault();
            };
            rich_textarea.ondragleave = function (ev) {
                ev.preventDefault();
                $placeholder.text('Write a message...');
                $rich_textarea_wrap.removeClass('file-drop');
            };
            rich_textarea.ondrop = function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                $placeholder.text('Write a message...');
                $rich_textarea_wrap.removeClass('file-drop');
                var files = ev.dataTransfer.files || [];
                for (var i = 0; i < files.length; i++) {
                    this.view.addFileMessage(files[i]);
                }
            }.bind(this);
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
            this.renderLastEmoticons();
        },

        render: function (options) {
            var http_upload = this.account.server_features.get(Strophe.NS.HTTP_UPLOAD);
            this.$('.attach-file').showIf(http_upload);
            this.focusOnInput();
            xabber.chat_body.updateHeight();
            return this;
        },

        updateAvatar: function () {
            var image = this.account.cached_image;
            this.$('.circle-avatar').setAvatar(image, this.avatar_size);
        },

        showAccountSettings: function () {
            this.account.showSettings();
        },

        focusOnInput: function () {
            var $rich_textarea = this.$('.input-message .rich-textarea');
            $rich_textarea.placeCaretAtEnd();
            return this;
        },

        keyDown: function (ev) {
            ev.stopPropagation();
            if (ev.keyCode === constants.KEY_ESCAPE ||
                    ev.keyCode === constants.KEY_BACKSPACE ||
                    ev.keyCode === constants.KEY_DELETE) {
                return;
            }
            if (ev.keyCode === constants.KEY_ENTER || ev.keyCode === 10) {
                var send_on_enter = xabber.settings.hotkeys === "enter";
                if (    (send_on_enter && ev.keyCode === constants.KEY_ENTER && !ev.shiftKey) ||
                        (!send_on_enter && ev.ctrlKey)  ) {
                    ev.preventDefault();
                    this.submit();
                    return;
                }
            }
            this.view.sendChatState('composing');
        },

        keyUp: function (ev) {
            var $rich_textarea = $(ev.target);
            if (ev.keyCode === constants.KEY_ESCAPE) {
                // clear input
                ev.preventDefault();
                $rich_textarea.flushRichTextarea();
                this.unsetForwardedMessages();
                this.view.sendChatState('active');
            } else if (ev.keyCode === constants.KEY_BACKSPACE || ev.keyCode === constants.KEY_DELETE) {
                var text = $rich_textarea.getTextFromRichTextarea();
                if (!text) {
                    $rich_textarea.flushRichTextarea();
                    this.view.sendChatState('active');
                }
            }
            $rich_textarea.updateRichTextarea().focus();
            xabber.chat_body.updateHeight();
        },

        onPaste: function (ev) {
            ev.preventDefault();
            var $rich_textarea = $(ev.target),
                clipboard_data = ev.clipboardData;
            if (clipboard_data) {
                var text = _.escape(clipboard_data.getData('text'));
                window.document.execCommand('insertHTML', false, text);
            }
            this.view.sendChatState('composing');
            $rich_textarea.updateRichTextarea().focus();
            xabber.chat_body.updateHeight();
        },

        onFileInputChanged: function (ev) {
            var target = ev.target,
                files = target.files;
            if (files) {
                this.view.addFileMessage(files[0]);
                $(target).val('');
            }
        },

        typeEmoticon: function (emoji) {
            var emoji_node = emoji.emojify({tag_name: 'img'}),
                $rich_textarea = this.$('.input-message .rich-textarea');
            $rich_textarea.focus();
            window.document.execCommand('insertHTML', false, emoji_node);
            this.view.sendChatState('composing');
            $rich_textarea.updateRichTextarea().focus();
            xabber.chat_body.updateHeight();
        },

        renderLastEmoticons: function () {
            var $last_emoticons = this.$('.last-emoticons').empty(),
                emoji_data, emoji;
            for (var idx = 0; idx < 7; idx++) {
                // TODO: identify last emoticons
                emoji = Emoji.getByIndex(idx);
                $('<div class="emoji-wrap"/>').html(
                    emoji.emojify({tag_name: 'div', emoji_size: 20})
                ).appendTo($last_emoticons);
            }
            $last_emoticons.find('.emoji-wrap').mousedown(function (ev) {
                if (ev && ev.preventDefault) { ev.preventDefault(); }
                if (ev.button) {
                    return;
                }
                var $target = $(ev.target).closest('.emoji-wrap').find('.emoji');
                this.typeEmoticon($target.data('emoji'));
            }.bind(this));
        },

        submit: function () {
            var $rich_textarea = this.$('.input-message .rich-textarea'),
                text = $rich_textarea.getTextFromRichTextarea().trim();
            $rich_textarea.flushRichTextarea().focus();
            if (text || this.fwd_messages.length) {
                this.view.onSubmit(text, this.fwd_messages);
            }
            this.unsetForwardedMessages();
            this.view.sendChatState('active');
            xabber.chats_view.clearSearch();
        },

        setForwardedMessages: function (messages) {
            this.fwd_messages = messages || [];
            this.$('.fwd-messages-preview').showIf(messages.length);
            if (messages.length) {
                var msg = messages[0],
                    msg_author, msg_text;
                if (messages.length > 1) {
                    msg_text = messages.length + ' forwarded messages';
                } else {
                    msg_text = msg.get('message').emojify();
                }
                var from_jid = msg.get('from_jid');
                if (msg.isSenderMe()) {
                    msg_author = this.account.get('name');
                } else {
                    msg_author = this.account.contacts.get(from_jid).get('name');
                }
                this.$('.fwd-messages-preview .msg-author').text(msg_author);
                this.$('.fwd-messages-preview .msg-text').html(msg_text);
            }
            xabber.chat_body.updateHeight();
        },

        unsetForwardedMessages: function (ev) {
            ev && ev.preventDefault && ev.preventDefault();
            this.fwd_messages = [];
            this.$('.fwd-messages-preview').addClass('hidden');
            xabber.chat_body.updateHeight();
            this.focusOnInput();
        },

        resetSelectedMessages: function () {
            this.view.$('.chat-message.selected').removeClass('selected');
            this.manageSelectedMessages();
        },

        manageSelectedMessages: function () {
            var $selected_msgs = this.view.$('.chat-message.selected'),
                $input_panel = this.$('.message-input-panel'),
                $message_actions = this.$('.message-actions-panel');
                length = $selected_msgs.length;
            $input_panel.hideIf(length);
            $message_actions.showIf(length);
            if (length) {
                $message_actions.find('.reply-message').showIf(length === 1);
                $message_actions.find('.forward-message .counter').text(length);
            } else {
                this.focusOnInput();
            }
        },

        replyMessage: function (ev) {
            var $msg = this.view.$('.chat-message.selected').first(),
                msg = this.model.messages.get($msg.data('msgid'));
            this.resetSelectedMessages();
            this.setForwardedMessages([msg.get('forwarded_message') || msg]);
        },

        forwardMessages: function (ev) {
            var $msgs = this.view.$('.chat-message.selected'),
                msgs = [];
            $msgs.each(function (idx, item) {
                var msg = this.model.messages.get(item.dataset.msgid);
                msg && msgs.push(msg.get('forwarded_message') || msg);
            }.bind(this));
            this.resetSelectedMessages();
            xabber.forward_panel.open(msgs);
        },

        showChatNotification: function (message, is_colored) {
            this.$('.chat-notification').text(message)
                .switchClass('text-color-300', is_colored);
        }
    });

    xabber.ChatHeadContainer = xabber.Container.extend({
        className: 'chat-head-container panel-head noselect'
    });

    xabber.ChatBodyContainer = xabber.Container.extend({
        className: 'chat-body-container',

        // TODO: refactor CSS and remove this
        updateHeight: function () {
            var bottom_height = xabber.chat_bottom.$el.height();
            if (bottom_height) {
                this.$el.css({bottom: bottom_height});
                this.view && this.view.updateScrollBar();
            }
        }
    });

    xabber.ChatBottomContainer = xabber.Container.extend({
        className: 'chat-bottom-container'
    });

    xabber.ChatPlaceholderView = xabber.BasicView.extend({
        className: 'placeholder-wrap chat-placeholder-wrap noselect',
        template: templates.chat_placeholder
    });

    xabber.GroupChatPlaceholderView = xabber.BasicView.extend({
        className: 'placeholder-wrap group-chat-placeholder-wrap noselect',
        template: templates.group_chat_placeholder
    });

    xabber.ChatSettings = Backbone.ModelWithStorage.extend({
        defaults: {
            muted: []
        },

        updateMutedList: function (jid, muted) {
            var muted_list = _.clone(this.get('muted')),
                index = muted_list.indexOf(jid);
            if (muted && index < 0) {
                muted_list.push(jid);
            }
            if (!muted && index >= 0) {
                muted_list.splice(index, 1);
            }
            this.save('muted', muted_list);
        }
    });


    xabber.Account.addInitPlugin(function () {
        this.chat_settings = new xabber.ChatSettings({id: 'chat-settings'}, {
            account: this,
            storage_name: xabber.getStorageName() + '-chat-settings-' + this.get('jid'),
            fetch: 'after'
        });

        this.messages = new xabber.Messages(null, {account: this});
        this.forwarded_messages = new xabber.Messages(null, {account: this});
        this.chats = new xabber.AccountChats(null, {account: this});
    });

    xabber.Account.addConnPlugin(function () {
        this.chats.registerMessageHandler();
        this.chats.each(function (chat) {
            chat.trigger('load_last_history');
        });
        this.trigger('ready_to_get_roster');
    }, true, true);


    xabber.once("start", function () {
        this.chats = new this.Chats;
        this.chats.addCollection(this.opened_chats = new this.OpenedChats);
        this.chats.addCollection(this.closed_chats = new this.ClosedChats);

        this.chats_view = this.left_panel.addChild('chats',
                this.ChatsView, {model: this.opened_chats});
        this.chat_head = this.right_panel.addChild('chat_head',
                this.ChatHeadContainer);
        this.chat_body = this.right_panel.addChild('chat_body',
                this.ChatBodyContainer);
        this.chat_bottom = this.right_panel.addChild('chat_bottom',
                this.ChatBottomContainer);
        this.chat_placeholder = this.right_panel.addChild('chat_placeholder',
                this.ChatPlaceholderView);
        this.group_chat_placeholder = this.wide_panel.addChild('group_chat_placeholder',
                this.GroupChatPlaceholderView);
        this.forward_panel = new this.ForwardPanelView({model: this.opened_chats});

        this.on("change:focused", function () {
            if (this.get('focused')) {
                var view = this.chats_view.active_chat;
                if (view && view.model.get('display')) {
                    view.content.readMessages();
                    view.content.bottom.focusOnInput();
                }
            }
        }, this);

        this.on("clear_search", function () {
            this.contacts_view.clearSearch();
            this.chats_view.clearSearch();
        }, this);
    }, xabber);

    return xabber;
  };
});
