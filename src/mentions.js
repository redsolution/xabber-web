import xabber from "xabber-core";
import { createVueBackboneView } from "./vue/mountVue.js";
import { transliterate as query_transliterate } from 'transliteration';
import MentionsPanelComponent from './vue/components/mentions/MentionsPanel.vue';
import MentionItemComponent from './vue/components/mentions/MentionItem.vue';
import MentionsPlaceholderComponent from './vue/components/mentions/MentionsPlaceholder.vue';

let env = xabber.env,
    constants = env.constants,
    templates = env.templates.mentions,
    utils = env.utils,
    $ = env.$,
    $iq = env.$iq,
    Strophe = env.Strophe,
    Backbone = env.Backbone,
    _ = env._,
    uuid = env.uuid,
    Images = utils.images,
    pretty_datetime = (timestamp) => { return utils.pretty_datetime(timestamp, (xabber.settings.language == 'ru-RU' || xabber.settings.language == 'default' && xabber.get("default_language") == 'ru-RU') && 'D MMMM YYYY HH:mm:ss')};


xabber.Mention = Backbone.Model.extend({
    defaults: {
        active: false,
        display: false,
        timestamp: 0
    },

    initialize: function (attrs, options) {
        this.contact = options.contact;
        this.message = options.message;
        this.id = this.message.get('unique_id');
        this.set('timestamp', this.message.get('timestamp'));
        this.account = this.contact.account;
        this.item_view = new xabber.MentionItemView({model: this});
        this.contact.on("destroy", this.destroy, this);
        this.message.on("change:last_replace_time", this.onMessageUpdated, this);
    },

    onMessageUpdated: function () {
        if (this.message.get('mentions') && this.message.get('mentions').length) {
            this.message.get('mentions').forEach((mention) => {
                let mention_target = mention.target || "",
                    id = mention_target.match(/\;id=\w*/),
                    jid = mention_target.match(/\?jid=.*/);
                if (id)
                    mention_target = id[0].slice(4);
                else if (jid)
                    mention_target = jid[0].slice(5);
                else
                    mention_target = "";
                if (id) {
                    if (this.contact.my_info) {
                        if (mention_target === this.contact.my_info.get('id'))
                            this.item_view.updateLastMessage();
                        else
                            this.destroy();
                    }
                    else if (this.contact.get('group_chat')) {
                        if (this._pending_my_info) {
                            this._pending_my_info.done(() => {
                                if (mention_target === this.contact.my_info.get('id'))
                                    this.item_view.updateLastMessage();
                                else
                                    this.destroy();
                                this._pending_my_info = null;
                            });
                        }
                        else {
                            this._pending_my_info = new $.Deferred();
                            this.contact.getMyInfo(() => {
                                if (mention_target === this.contact.my_info.get('id'))
                                    this.item_view.updateLastMessage();
                                else
                                    this.destroy();
                                this._pending_my_info.resolve();
                            });
                        }
                    }
                } else if (jid && mention_target === this.account.get('jid')) {
                    this.item_view.updateLastMessage();
                }
                else
                    this.destroy();
            });
        } else
            this.destroy();
    }
});

xabber.MentionsBase = Backbone.Collection.extend({
    model: xabber.Mention
});

xabber.AccountMentions = xabber.MentionsBase.extend({
    initialize: function (models, options) {
        this.account = options.account;
        this.on("add", this.onMentionAdded, this)
    },

    onMentionAdded: function (mention) {
        xabber.mentions.add(mention);
    }
});

xabber.Mentions = xabber.MentionsBase.extend({
    comparator: 'timestamp',
    initialize: function () {
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

xabber.MentionsView = createVueBackboneView(xabber, {
    component: MentionsPanelComponent,
    className: 'mentions-container container',
    props: function (view) {
        return {};
    },
    extend: {
    ps_selector: '.mentions-list-wrap',
    main_container: '.mentions-list',
    ps_settings: {theme: 'item-list'},

    events: {
        "keydown .search-input": "keyUpOnSearch",
        "focusout .search-input": "clearSearchSelection",
        "click .close-search-icon": "clearSearch",
        "click .list-item": "onClickItem",
        "click .btn-search-messages": "updateSearchWithMessages",
    },

    onShow: function () {
        this.render.apply(this, arguments);
    },

    _vueInit: function () {
        if (this.ps_selector) {
            this.ps_container = this.$(this.ps_selector);
            if (this.ps_container.length) {
                this.ps_container.perfectScrollbar(
                    _.extend(this.ps_settings || {}, xabber.ps_settings)
                );
            }
        }

        this.active_mention = null;
        this.keyup_timeout = null;
        this.model.on("add", this.onMentionAdded, this);
        this.model.on("change:active", this.onChangedActiveStatus, this);
        this.model.on("destroy", this.onMentionRemoved, this);
        xabber.accounts.on("list_changed", this.updateLeftIndicator, this);
        this.ps_container.on("ps-scroll-y", this.onScrollY.bind(this));
        this.$('input').on('input', this.updateSearch.bind(this));
    },

    render: function (options) {
        if (!options.right && this.active_mention) {
            this.active_mention.model.set('active', false);
            this.active_mention = null;
        }
        (options.right !== 'chat' && options.right !== 'message_context' && options.right !== 'participant_messages' || options.clear_search && options.right === 'chat') && this.clearSearch();
    },

    onMentionAdded: function (mention) {
        this.addChild(mention.id, mention.item_view);
        this.updateMentionPosition(mention);
    },

    onMentionRemoved: function (mention, options) {
        options = options || {};
        if (this.active_mention === this.child(mention.id)) {
            this.active_mention = null;
        }
        this.removeChild(mention.id, options);
        this.updateScrollBar();
    },

    selectItem: function (id) {
        this.clearSearchSelection();
        let $selection = this.$('.list-item[data-id="'+id+'"]');
        if ($selection.length) {
            this.selection_id = id;
        } else {
            $selection = this.$('.list-item:visible').first();
            this.selection_id = $selection.data('id');
        }
        $selection.find('.mention-info-wrap').addClass('selected');
    },

    clearSearchSelection: function (ev) {
        this.selection_id = null;
        this.$('.list-item.selected').removeClass('selected');
        this.$('.list-item .selected').removeClass('selected');
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
            selection.find('.mention-info-wrap').click();
        }
    },

    replaceMentionItem: function (item, mentions) {
        let view = this.child(item.id);
        if (view && item.get('timestamp')) {
            view.$el.detach();
            let index = mentions.indexOf(item);
            if (index === 0) {
                this.$('.mentions-list').append(view.$el);
            } else {
                this.$('.mention-item').eq(-index).before(view.$el);
            }
            let $prev_el = view.$el.prev('.mention-item'),
                $next_el = view.$el.next('.mention-item'),
                contact_jid = view.$el.data('contact-jid');
                if ($prev_el.length) {
                    let prev_contact_jid = $prev_el.data('contact-jid');
                    if (prev_contact_jid !== contact_jid)
                        view.$el.find('.group-chat-title-wrap').removeClass('hidden');
                }
                else
                    view.$el.find('.group-chat-title-wrap').removeClass('hidden');
                if ($next_el.length) {
                    let next_contact_jid = $next_el.data('contact-jid');
                    if (next_contact_jid === contact_jid) {
                        $next_el.find('.group-chat-title-wrap').addClass('hidden');
                    }
                    else
                        $next_el.find('.group-chat-title-wrap').removeClass('hidden');
                }
                else
                    view.$el.find('.group-chat-title-wrap').removeClass('hidden');
        }
    },

    readAllMentions: function () {
        xabber.accounts.connected.forEach((account) => {
            let mentions = _.clone(account.unread_mentions.models);
            _.each(mentions, ((mention) => {
                let msgid = mention.message.get('msgid'),
                    archive_id = mention.message.get('archive_id'),
                    contact_archive_id = mention.message.get('contact_archive_id'),
                    chat = account.chats.getChat(mention.contact);
                mention.message.set('is_unread', false);
                !chat.get('notifications') && chat.sendMarker(msgid, 'displayed', archive_id, contact_archive_id);
            }));
        });
    },

    updateLeftIndicator: function (accounts) {
        this.$el.attr('data-indicator', accounts.connected.length > 1);
    },

    updateMentionPosition: function (item) {
        let view = this.child(item.id);
        if (!view)
            return;
        this.replaceMentionItem(item, this.model);
    },

    onChangedActiveStatus: function (mention) {
        if (mention.get('active')) {
            let previous_mention = this.active_mention;
            this.active_mention = this.child(mention.id);
            previous_mention && previous_mention.model.set('active', false);
        }
    },

    // --- Inherited from SearchView ---

    getSelectedItem: function () {
        return this.$('.list-item[data-id="'+this.selection_id+'"]');
    },

    selectNextItem: function () {
        this.selectItem(this.ids[this.ids.indexOf(this.selection_id)+1], 'down');
    },

    selectPreviousItem: function () {
        this.selectItem(this.ids[this.ids.indexOf(this.selection_id)-1], 'up');
    },

    updateSearch: function () {
        !this.update_search_debounce && (this.update_search_debounce = _.debounce(() => {
            if (!this._update_search_timeout) {
                let query = this.$('.search-input').val();
                this.$('.search-form').switchClass('active', query);
                this.clearSearchSelection();
                if (query)
                    this.search(query.toLowerCase());
                else {
                    this.$('.list-item').removeClass('hidden');
                    this.onEmptyQuery();
                }
                this.updateScrollBar();
                this.query = false;
                this._update_search_timeout = setTimeout(() => {
                    this._update_search_timeout = null;
                    this.query && this.updateSearch();
                }, 150);
            } else {
                this.query = true;
            }
        }, 350, false));
        this.update_search_debounce();
    },

    clearSearch: function (ev) {
        ev && ev.preventDefault();
        this.$('.search-input').val('');
        this.$('.search-input').focusout();
        this.updateSearch();
        this.onEmptyQuery();
    },

    searchAll: function () {
        this.$('.list-item').removeClass('hidden');
    },

    close: function () {},

    onClickItem: function () {},

    // --- Inherited from SearchPanelView ---

    updateSearchWithMessages: function () {
        this.search_messages = true;
        this.updateSearch();
    },

    keyUpOnSearch: function (ev) {
        ev.stopPropagation();
        if ($(ev.target).val()) {
            this.keyUpOnSearchWithQuery(ev);
            return;
        }
        this.ids = this.$('.list-item:not(.hidden)').map(function () {
            return $(this).data('id');
        }).toArray();
        let $selection = this.getSelectedItem();
        if (ev.keyCode === constants.KEY_ARROW_DOWN) {
            return this.selectNextItem();
        }
        if (ev.keyCode === constants.KEY_ARROW_UP) {
            return this.selectPreviousItem();
        }
        if (ev.keyCode === constants.KEY_ENTER && $selection.length) {
            ev.preventDefault();
            return this.onEnterPressed($selection);
        }
        if (ev.keyCode === constants.KEY_ESCAPE && !xabber.body.screen.get('right_contact')) {
            ev.preventDefault();
            if ($(ev.target).val())
                return this.clearSearch();
            else {
                $(ev.target).focusout();
                this.close();
            }
        }
        this.updateSearch();
    },

    onScrollY: function () {
        if (xabber.all_searched_messages && xabber.all_searched_messages.length && this.queryid && !this._loading_messages && !this._messages_loaded && this.isScrolledToBottom()) {
            this._loading_messages = true;
            let options = {};
            this.queryid = uuid();
            options.query_id = this.queryid;
            this.$('.messages-preloader-wrap').removeClass('hidden');
            let accounts = xabber.accounts.connected;
            accounts.forEach((account) => {
                let first_message = xabber.all_searched_messages.find(message => (message.account.get('jid') === account.get('jid')));
                if (!first_message || account.searched_msgs_loaded) {
                    this.$('.messages-preloader-wrap').addClass('hidden');
                    return;
                }
                options.account = account;
                options.before = first_message.get('archive_id');
                this.MAMRequest(this.query_text, options, (messages) => {
                    let dfd = new $.Deferred();
                    if (!messages.length)
                        this.$('.messages-preloader-wrap').addClass('hidden');
                    dfd.done(() => {
                        this.$('.messages-preloader-wrap').addClass('hidden');
                        this.$('.messages-list-wrap').switchClass('hidden', !this.$('.messages-list').children().length);
                        this.updateScrollBar();
                        this._loading_messages = false;
                    });
                    let count = 0;
                    _.each(messages, (message) => {
                        account.chats.makeMessageObject(message,
                            _.extend({is_searched: true}, options)
                        ).then((message_from_stanza) => {

                            let msg_idx = xabber.all_searched_messages.indexOf(message_from_stanza),
                                $message_item_view;
                            if (!message_from_stanza
                                || (
                                    message_from_stanza.get('from_jid') === message_from_stanza.get('to_jid')
                                    && message_from_stanza.get('to_jid') === account.get('jid')
                                )
                            ) {
                                count++;
                                if (count === messages.length) {
                                    dfd.resolve();
                                }
                                return;
                            } else
                                $message_item_view = new xabber.MessageItemView({model: message_from_stanza});
                            if (msg_idx === 0) {
                                $message_item_view.$el.appendTo(this.$('.messages-list-wrap .messages-list'));
                            } else {
                                $message_item_view.$el.insertBefore(this.$('.messages-list-wrap .message-item').eq(-msg_idx));
                            }
                            count++;
                            if (count === messages.length) {
                                dfd.resolve();
                            }
                        });
                    });
                }, (err) => {
                    this.$('.messages-preloader-wrap').addClass('hidden');

                });
            });
            (accounts.filter(account => account.searched_msgs_loaded).length === accounts.length) && (this._messages_loaded = true);
        }
    },

    onScroll: function () {},

    keyUpOnSearchWithQuery: function (ev) {
        ev.stopPropagation();
        this.ids = this.$('.searched-lists-wrap .list-item:not(.hidden)').map(function () {
            return $(this).data('id');
        }).toArray();
        let $selection = this.getSelectedItemWithQuery();
        if (ev.keyCode === constants.KEY_ARROW_DOWN) {
            return this.selectNextItemWithQuery();
        }
        if (ev.keyCode === constants.KEY_ARROW_UP) {
            return this.selectPreviousItemWithQuery();
        }
        if (ev.keyCode === constants.KEY_ENTER && $selection.length) {
            ev.preventDefault();
            return this.onEnterPressed($selection);
        }
        else if (ev.keyCode === constants.KEY_ENTER){
            this.search_messages = true;
        }
        if (ev.keyCode === constants.KEY_ESCAPE && !xabber.body.screen.get('right_contact')) {
            ev.preventDefault();
            if ($(ev.target).val())
                return this.clearSearch();
            else {
                $(ev.target).focusout();
                this.close();
            }
        }
        this.updateSearch();
    },

    getSelectedItemWithQuery: function () {
        return this.$('.searched-lists-wrap .list-item[data-id="'+this.selection_id+'"]');
    },

    selectItemWithQuery: function (id, arrow) {
        if (!id) {
            if (this.isScrolledToBottom())
                this.onScrollY();
            return;
        }
        this.clearSearchSelection();
        let $selection = this.$('.searched-lists-wrap .list-item[data-id="'+id+'"]');
        if ($selection.length) {
            this.selection_id = id;
        } else {
            this.ps_container[0].scrollTop = 0;
            $selection = this.$('.searched-lists-wrap .list-item:visible').first();
            this.selection_id = $selection.data('id');
        }
        if (arrow === 'down' && ($selection[0].clientHeight + $selection[0].offsetTop + $selection.parent().parent()[0].offsetTop >= this.ps_container[0].clientHeight + this.ps_container[0].scrollTop
        || $selection[0].clientHeight + $selection[0].offsetTop + $selection.parent().parent()[0].offsetTop < this.ps_container[0].scrollTop))
            this.ps_container[0].scrollTop = $selection[0].offsetTop + $selection.parent().parent()[0].offsetTop;
        if (arrow === 'up' && ($selection[0].offsetTop + $selection.parent().parent()[0].offsetTop <= this.ps_container[0].scrollTop
        || $selection[0].offsetTop + $selection.parent().parent()[0].offsetTop > this.ps_container[0].scrollTop + this.ps_container[0].clientHeight))
            this.ps_container[0].scrollTop = $selection[0].offsetTop + $selection.parent().parent()[0].offsetTop;
        $selection.addClass('selected');
    },

    selectNextItemWithQuery: function () {
        this.selectItemWithQuery(this.ids[this.ids.indexOf(this.selection_id)+1], 'down');
    },

    selectPreviousItemWithQuery: function () {
        this.selectItemWithQuery(this.ids[this.ids.indexOf(this.selection_id)-1], 'up');
    },

    search: function (query) {
        this.$(this.main_container).addClass('hidden');
        clearTimeout(this.keyup_timeout);
        this.keyup_timeout = null;
        this.query_text = query;
        let query_transliterated = query_transliterate(query);
        this.$('.contacts-list').html("");
        this.$('.chats-list').html("");
        xabber.accounts.connected.forEach((acc) => {
            if (acc.server_features.get(Strophe.NS.XABBER_FAVORITES)) {
                let saved_chat = acc.chats.getSavedChat();
                saved_chat.set('opened', true);
                saved_chat.item_view.updateLastMessage();
            }
        });
        let query_chats = _.clone(xabber.chats);
        query_chats.comparator = 'timestamp';
        query_chats.sort('timestamp').forEach((chat) => {
            let jid = chat.get('jid').toLowerCase(),
                name = chat.contact ? (chat.contact.get('roster_name') || chat.contact.get('name')) : chat.get('name');
            name && (name = name.toLowerCase());
            if (chat.get('timestamp') || chat.get('saved')) {
                if (name.indexOf(query) > -1 || jid.indexOf(query) > -1
                    || name.indexOf(query_transliterated) > -1 || jid.indexOf(query_transliterated) > -1
                    || (chat.get('saved') && query.includes('saved'))) {
                    let searched_by = name.indexOf(query) > -1 || name.indexOf(query_transliterated) > -1 ? 'by-name' : 'by-jid',
                        chat_item = xabber.chats_view.child(chat.get('id'));
                    chat_item && (chat_item = chat_item.$el.clone().addClass(searched_by));
                    if (chat_item) {
                        this.$('.chats-list-wrap').removeClass('hidden');
                        if (searched_by === 'by-name')
                            this.$('.chats-list').prepend(chat_item);
                        else if (this.$('.chats-list .by-jid').length)
                            chat_item.insertBefore(this.$('.chats-list .by-jid').first());
                        else
                            this.$('.chats-list').append(chat_item);
                        chat_item.click(() => {
                            this.$('.list-item.active').removeClass('active');
                            xabber.chats_view.openChat(chat.item_view, {screen: xabber.body.screen.get('name')});
                            chat_item.addClass('active');
                        });
                    }
                }
            }
        });
        xabber.accounts.each((account) => {
            account.contacts.each((contact) => {
                let jid = contact.get('jid').toLowerCase(),
                    name = contact.get('roster_name') || contact.get('name'),
                    chat = account.chats.get(contact.hash_id),
                    chat_id = chat && chat.id;
                name && (name = name.toLowerCase());
                if (!chat_id || chat_id && !this.$('.chat-item[data-id="' + chat_id + '"]').length)
                    if (name.indexOf(query) > -1 || jid.indexOf(query) > -1
                        || name.indexOf(query_transliterated) > -1 || jid.indexOf(query_transliterated) > -1) {
                        let searched_by = name.indexOf(query) > -1 || name.indexOf(query_transliterated) > -1 ? 'by-name' : 'by-jid',
                            item_list = xabber.contacts_left_view.$(`.account-roster-wrap[data-jid="${account.get('jid')}"] .list-item[data-jid="${jid}"]`).first().clone().data('account-jid', account.get('jid'));
                        item_list.attr({'data-color': account.settings.get('color'), 'data-account': account.get('jid')}).addClass(searched_by);
                        if (searched_by === 'by-name')
                            this.$('.contacts-list').prepend(item_list);
                        else if (this.$('.contacts-list .by-jid').length)
                            item_list.insertBefore(this.$('.contacts-list .by-jid').first());
                        else
                            this.$('.contacts-list').append(item_list);
                        item_list.click(() => {
                            this.$('.list-item.active').removeClass('active');
                            let chat = account.chats.getChat(contact);
                            chat && xabber.chats_view.openChat(chat.item_view, {clear_search: false, screen: xabber.body.screen.get('name')});
                            item_list.addClass('active');
                        });
                    }
            });
        });
        this.$('.chats-list-wrap').switchClass('hidden', !this.$('.chats-list').children('.list-item:not(.hidden2):not(.hidden3)').length);
        this.$('.contacts-list-wrap').switchClass('hidden', !this.$('.contacts-list').children().length);
        this.$('.messages-list-wrap').addClass('hidden').find('.messages-list').html("");
        if (query.length >= 2 && this.search_messages) {
            this.search_messages = false;
            this.queryid = uuid();
            this.searchMessages(query, {query_id: this.queryid});
        }
        else if (query.length >= 2 && !this.search_messages){
            this.$('.btn-search-messages').showIf(query);
        }
    },

    searchMessages: function (query, options) {
        this._loading_messages = true;
        this._messages_loaded = false;
        this.$('.messages-list-wrap').showIf(query);
        this.$('.btn-search-messages').hideIf(query);
        this.scrollToBottom();
        this.$('.messages-preloader-wrap').removeClass('hidden');
        options = options || {};
        !options.max && (options.max = xabber.settings.mam_messages_limit);
        !options.before && (options.before = "");
        xabber.all_searched_messages = new xabber.SearchedMessages();
        let accounts = xabber.accounts.connected,
            accounts_length = accounts.length,
            accounts_count = 0;
        accounts.forEach((account) => {
            account.searched_msgs_loaded = false;
            options.account = account;
            this.MAMRequest(query, options, (messages) => {
                if (!this.query_text) {
                    this.$('.messages-preloader-wrap').addClass('hidden');
                    return;
                }

                let dfd = new $.Deferred();
                dfd.done(() => {
                    accounts_count++;
                    if (!this.query_text) {
                        this.$('.messages-preloader-wrap').addClass('hidden');
                        return;
                    }
                    if (accounts_length === accounts_count){
                        this.$('.messages-preloader-wrap').addClass('hidden');
                        this.$('.messages-list-wrap').switchClass('hidden', !this.$('.messages-list').children().length);
                        this.updateScrollBar();
                        this._loading_messages = false;
                    }
                });
                let count = 0;
                _.each(messages, (message) => {
                    account.chats.makeMessageObject(message,
                        _.extend({is_searched: true}, options)
                    ).then((message_from_stanza) => {

                        let msg_idx = xabber.all_searched_messages.indexOf(message_from_stanza),
                            $message_item_view;
                        if (!message_from_stanza
                            || (
                                message_from_stanza.get('from_jid') === message_from_stanza.get('to_jid')
                                && message_from_stanza.get('to_jid') === account.get('jid')
                            )
                        ) {
                            count++;
                            if (count === messages.length) {
                                dfd.resolve();
                            }
                            return;
                        } else {
                            $message_item_view = new xabber.MessageItemView({model: message_from_stanza});
                        }
                        if (msg_idx === 0) {
                            $message_item_view.$el.appendTo(this.$('.messages-list-wrap .messages-list'));
                        } else {
                            $message_item_view.$el.insertBefore(this.$('.messages-list-wrap .message-item').eq(-msg_idx));
                        }
                        count++;
                        if (count === messages.length) {
                            dfd.resolve();
                        }
                    });
                });
                if (!messages.length && count === messages.length){
                    dfd.resolve();
                }
            }, (err) => {
                this.$('.messages-preloader-wrap').addClass('hidden');

            });
        });
        (accounts.filter(account => account.searched_msgs_loaded).length === accounts.length) && (this._messages_loaded = true);
    },

    MAMRequest: function (query, options, callback, errback) {
        let messages = [],
            account = options.account,
            queryid = uuid(),
            iq = $iq({type: 'set'})
                .c('query', {xmlns: Strophe.NS.MAM, queryid: queryid})
                .c('x', {xmlns: Strophe.NS.DATAFORM, type: 'submit'})
                .c('field', {'var': 'FORM_TYPE', type: 'hidden'})
                .c('value').t(Strophe.NS.MAM).up().up()
                .c('field', {'var': 'withtext'})
                .c('value').t(query).up().up().up().cnode(new Strophe.RSM(options).toXML()),
            handler;

        let sendMAMRequest = () => {
            handler = account.connection._addSysHandler((message) => {
                let $msg = $(message);
                if ($msg.find('result').attr('queryid') === queryid) {
                    messages.push(message);
                }
                return true;
            }, Strophe.NS.MAM, null, null, null, null, {query_id: queryid} );
            let callb = (res) => {
                    account.connection.deleteHandler(handler);
                    handler = null;
                    let $fin = $(res).find(`fin[xmlns="${Strophe.NS.MAM}"]`);
                    if ($fin.length && $fin.attr('queryid') === queryid) {
                        let rsm_complete = ($fin.attr('complete') === 'true');
                        rsm_complete && (account.searched_msgs_loaded = true);
                    }
                    callback && callback(messages);
                },
                errb = (err) => {
                    account.connection.deleteHandler(handler);
                    handler = null;
                    xabber.error("MAM search error");
                    xabber.error(err);
                    errback && errback(err);
                };
            console.error('trying to send for search');
            account.sendIQ(iq, callb, errb);

        };
        sendMAMRequest();
    },

    onEmptyQuery: function () {
        xabber.accounts.forEach(function (account) {
            account.searched_msgs_loaded = false;
        });
        this.query_text = null;
        this.queryid = null;
        this._messages_loaded = false;
    }
}
});

xabber.MentionItemView = createVueBackboneView(xabber, {
    component: MentionItemComponent,
    className: 'mention-item list-item',
    extend: {
    avatar_size: constants.AVATAR_SIZES.CHAT_ITEM,

    events: {
        'click .mention-info-wrap': 'openByClick'
    },

    _vueInit: function () {
        this.account = this.model.account;
        this.contact = this.model.contact;
        this.$el.attr('data-id', this.model.id);
        this.$el.attr('data-contact-jid', this.contact.get('jid'));
        this.updateContactName();
        this.updateGroupChat();
        this.updateName();
        this.updateLastMessage();
        this.updateAvatar();
        this.updateColorScheme();
        this.updateCounter();
        this.updateIcon();
        this.model.on("change:active", this.updateActiveStatus, this);
        this.account.settings.on("change:color", this.updateColorScheme, this);
        this.contact.on("change:name", this.updateContactName, this);
        this.contact.on("change:group_chat", this.updateGroupChat, this);
        this.model.message.on("change:is_unread", this.updateCounter, this);
    },

    updateName: function () {
        let message = this.model.message,
            user_info = message.get('user_info') || message.isSenderMe() && this.contact.my_info && this.contact.my_info.attributes,
            contact_name = this.contact.get('name');
        if (user_info)
            contact_name = user_info.nickname || user_info.jid || user_info.id || this.model.message.get('from_jid');
        this.$('.chat-title').text(contact_name);
    },

    updateIcon: function () {
        this.$('.contact-icon .group-chat-icon').hideIf(!this.contact.get('group_chat') && this.contact.get('jid') === this.account.domain);
        this.$('.contact-icon .server-icon').hideIf(this.contact.get('jid') !== this.account.domain);
    },

    updateContactName: function () {
        let contact_name = this.contact.get('name');
        this.$('.group-chat-name').text(contact_name);
        if (!this.contact.get('group_chat')) {
            this.updateName();
            if (!this.contact.get('photo_hash')) {
                let default_avatar = Images.getDefaultAvatar(contact_name);
                this.$('.circle-avatar').setAvatar(default_avatar, this.avatar_size, this.account);
            }
        }
    },

    updateGroupChat: function () {
        this.updateIcon();
    },

    updateCounter:function () {
        let unread = this.model.message.get('is_unread');
        this.$('.msg-counter').switchClass('hidden', !unread);
        if (unread)
            this.account.unread_mentions.add(this.model);
        else
            this.account.unread_mentions.remove(this.model);
        xabber.toolbar_view.recountAllMessageCounter();
    },

    updateLastMessage: function () {
        let msg = this.model.message;
        if (!msg)
            return;
        let msg_time = msg.get('time'),
            timestamp = msg.get('timestamp'),
            forwarded_message = msg.get('forwarded_message'),
            msg_files = msg.get('files') || [],
            msg_images = msg.get('images') || [],
            msg_locations = msg.get('locations') || [],
            msg_text = (forwarded_message) ? (msg.get('message') || xabber.getString("forwarded_messages_count", forwarded_message.length).italics()) : msg.getText();
        msg.get('videos') && msg.get('videos').length && (msg_files = msg_files.concat(msg.get('videos')));
        this.model.set({timestamp: timestamp});
        if (msg_files.length || msg_images.length || msg_locations.length) {
            let $colored_span = $('<span class="text-color-500"/>');
            if (msg_files.length && msg_images.length)
                msg_text = $colored_span.text(xabber.getString("recent_chat__last_message__attachments", [msg_files.length + msg_images.length]));
            else {
                if (msg_files.length > 0) {
                    let total_size = 0;
                    msg_files.forEach((f) => {total_size+=Number(f.size)});
                    msg_text = $colored_span.text(xabber.getQuantityString("recent_chat__last_message__files", msg_files.length) + (total_size > 0 ? `, ${utils.pretty_size(total_size)}` : ""));
                }
                if (msg_images.length > 0) {
                    let total_size = 0;
                    msg_images.forEach((f) => {total_size+=Number(f.size)});
                    msg_text = $colored_span.text(xabber.getQuantityString("recent_chat__last_message__images", msg_images.length) + (total_size > 0 ? `, ${utils.pretty_size(total_size)}` : ""));
                }
                if (msg_locations.length > 0) {
                    msg_text = $colored_span.text(xabber.getQuantityString("recent_chat__last_message__locations", msg_locations.length));
                }
            }
            this.$('.last-msg').text("").append(msg_text);
        }
        else {
            this.$('.last-msg').text(msg_text);
        }
        this.$el.emojify('.last-msg', {emoji_size: 16});
        this.$('.last-msg-date').text(utils.pretty_short_datetime(msg_time))
            .attr('title', pretty_datetime(msg_time));
    },

    updateActiveStatus: function () {
        this.$el.find('.mention-info-wrap').switchClass('active', this.model.get('active'));
    },

    updateAvatar: function () {
        let message = this.model.message,
            user_info = message.get('user_info') || message.isSenderMe() && this.contact.my_info && this.contact.my_info.attributes,
            image;
        if (user_info) {
            if (user_info.avatar) {
                image = user_info.b64_avatar || this.account.chat_settings.getB64Avatar(user_info.id);
                if (image) {
                    this.$('.circle-avatar').setAvatar(image, this.avatar_size, this.account);
                }
                else {
                    let node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + user_info.id;
                    this.contact.getAvatar(user_info.avatar, node, (data_avatar) => {
                        image = data_avatar;
                        this.account.chat_settings.updateCachedAvatars(user_info.id, user_info.avatar, data_avatar);
                        this.$('.circle-avatar').setAvatar(image, this.avatar_size, this.account);
                    }, () => {
                        let default_avatar = Images.getDefaultAvatar(user_info.nickname || user_info.jid || user_info.id);
                        this.$('.circle-avatar').setAvatar(default_avatar, this.avatar_size, this.account);
                    });
                }
            }
            else {
                let default_avatar = Images.getDefaultAvatar(user_info.nickname || user_info.jid || user_info.id);
                this.$('.circle-avatar').setAvatar(default_avatar, this.avatar_size, this.account);
            }
        }
        else {
            image = this.contact.cached_image;
            this.$('.circle-avatar').setAvatar(image, this.avatar_size, this.account);
        }
    },

    openByClick: function () {
        let message = this.model.message,
            chat = this.account.chats.getChat(this.contact);
        this.model.message.set('is_unread', false);
        !chat.get('notifications') && chat.sendMarker(message.get('origin_id'), 'displayed', message.get('stanza_id'), message.get('contact_stanza_id'));
        this.model.set('active', true);
        this.contact.trigger("open_mention", this.contact, message.get('unique_id'));
    },

    updateColorScheme: function () {
        let color = this.account.settings.get('color');
        this.$el.attr('data-color', color);
    }

}});

xabber.MentionsPlaceholderView = createVueBackboneView(xabber, {
    component: MentionsPlaceholderComponent,
    className: 'placeholder-wrap mentions-placeholder-wrap noselect',
    extend: {

    _vueInit: function (options) {
        xabber.on('update_placeholder',this.onPlaceholderUpdate, this);
    },

    onPlaceholderUpdate: function () {
        if (xabber.toolbar_view.$('.toolbar-item.jingle-calls.active').length || xabber.toolbar_view.$('.toolbar-item.geolocation-chats.active').length){
            this.$('.text').text(xabber.getString("message_manager_error_not_implemented"));
        } else {
            this.$('.text').text(xabber.getString("mentions_list__placeholder"));
        }
    },
}});

xabber.Account.addInitPlugin(function () {
   this.mentions = new xabber.AccountMentions(null, {account: this});
   this.unread_mentions = new xabber.Mentions(null, {account: this});
});

// xabber.once("start", function () {
//     this.mentions = new this.Mentions;
//     this.mentions_view = this.left_panel.addChild('mentions',
//         this.MentionsView, {model: this.mentions});
//     this.mentions_placeholder = this.right_panel.addChild('mentions_placeholder',
//         this.MentionsPlaceholderView);
// }, xabber);

export default xabber;
