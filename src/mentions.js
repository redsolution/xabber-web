import xabber from "xabber-core";
let env = xabber.env,
    constants = env.constants,
    templates = env.templates.mentions,
    utils = env.utils,
    $ = env.$,
    Strophe = env.Strophe,
    _ = env._,
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
                    id = mention_target.match(/\?id=\w*/),
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

xabber.MentionsView = xabber.SearchPanelView.extend({
    className: 'mentions-container container',
    ps_selector: '.mentions-list-wrap',
    main_container: '.mentions-list',
    ps_settings: {theme: 'item-list'},
    template: templates.mentions_panel,

    _initialize: function () {
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
        (options.right !== 'chat' && options.right !== 'contact_details' && options.right !== 'message_context' && options.right !== 'participant_messages' || options.clear_search && options.right === 'chat') && this.clearSearch();
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
                chat.sendMarker(msgid, 'displayed', archive_id, contact_archive_id);
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
    }
});

xabber.MentionItemView = xabber.BasicView.extend({
    className: 'mention-item list-item',
    template: templates.mention_item,
    avatar_size: constants.AVATAR_SIZES.CHAT_ITEM,

    events: {
        'click .mention-info-wrap': 'openByClick'
    },

    _initialize: function () {
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
                this.$('.circle-avatar').setAvatar(default_avatar, this.avatar_size);
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
                    this.$('.circle-avatar').setAvatar(image, this.avatar_size);
                }
                else {
                    let node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + user_info.id;
                    this.contact.getAvatar(user_info.avatar, node, (data_avatar) => {
                        image = data_avatar;
                        this.account.chat_settings.updateCachedAvatars(user_info.id, user_info.avatar, data_avatar);
                        this.$('.circle-avatar').setAvatar(image, this.avatar_size);
                    }, () => {
                        let default_avatar = Images.getDefaultAvatar(user_info.nickname || user_info.jid || user_info.id);
                        this.$('.circle-avatar').setAvatar(default_avatar, this.avatar_size);
                    });
                }
            }
            else {
                let default_avatar = Images.getDefaultAvatar(user_info.nickname || user_info.jid || user_info.id);
                this.$('.circle-avatar').setAvatar(default_avatar, this.avatar_size);
            }
        }
        else {
            image = this.contact.cached_image;
            this.$('.circle-avatar').setAvatar(image, this.avatar_size);
        }
    },

    openByClick: function () {
        let message = this.model.message,
            chat = this.account.chats.getChat(this.contact);
        this.model.message.set('is_unread', false);
        chat.sendMarker(message.get('origin_id'), 'displayed', message.get('stanza_id'), message.get('contact_stanza_id'));
        this.model.set('active', true);
        this.contact.trigger("open_mention", this.contact, message.get('unique_id'));
    },

    updateColorScheme: function () {
        let color = this.account.settings.get('color');
        this.$el.attr('data-color', color);
    }

});

xabber.MentionsPlaceholderView = xabber.BasicView.extend({
    className: 'placeholder-wrap mentions-placeholder-wrap noselect',
    template: templates.mentions_placeholder,

    _initialize: function (options) {
        xabber.on('update_placeholder',this.onPlaceholderUpdate, this);
    },

    onPlaceholderUpdate: function () {
        if (xabber.toolbar_view.$('.toolbar-item.jingle-calls.active').length || xabber.toolbar_view.$('.toolbar-item.geolocation-chats.active').length){
            this.$('.text').text(xabber.getString("message_manager_error_not_implemented"));
        } else {
            this.$('.text').text(xabber.getString("mentions_list__placeholder"));
        }
    },
});

xabber.Account.addInitPlugin(function () {
   this.mentions = new xabber.AccountMentions(null, {account: this});
   this.unread_mentions = new xabber.Mentions(null, {account: this});
});

xabber.once("start", function () {
    this.mentions = new this.Mentions;
    this.mentions_view = this.left_panel.addChild('mentions',
        this.MentionsView, {model: this.mentions});
    this.mentions_placeholder = this.right_panel.addChild('mentions_placeholder',
        this.MentionsPlaceholderView);
}, xabber);

export default xabber;
