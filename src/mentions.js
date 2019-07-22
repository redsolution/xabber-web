define("xabber-mentions", function () {
    return function (xabber) {
        var env = xabber.env,
            constants = env.constants,
            templates = env.templates.mentions,
            utils = env.utils,
            $ = env.$,
            $iq = env.$iq,
            $msg = env.$msg,
            $pres = env.$pres,
            Strophe = env.Strophe,
            _ = env._,
            moment = env.moment,
            uuid = env.uuid,
            Images = utils.images;


        xabber.Mention = Backbone.Model.extend({
            defaults: {
                active: false,
                display: false,
                timestamp: 0
            },

            initialize: function (attrs, options) {
                this.contact = options.contact;
                this.message = options.message;
                this.id = this.message.get('msgid');
                this.set('timestamp', this.message.get('timestamp'));
                this.account = this.contact.account;
                this.item_view = new xabber.MentionItemView({model: this});
                this.contact.on("destroy", this.destroy, this);
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

        xabber.MentionsView = xabber.SearchView.extend({
            className: 'mentions-container container',
            ps_selector: '.mentions-list-wrap',
            ps_settings: {theme: 'item-list'},
            template: templates.mentions_panel,

            events: {
                'click .btn-read-all': 'readAllMentions'
            },

            _initialize: function () {
                this.active_mention = null;
                this.model.on("add", this.onMentionAdded, this);
                this.model.on("change:active", this.onChangedActiveStatus, this);
                this.model.on("destroy", this.onMentionRemoved, this);
                xabber.accounts.on("list_changed", this.updateLeftIndicator, this);
            },

            render: function (options) {
                if (!options.right && this.active_mention) {
                    this.active_mention.model.set('active', false);
                    this.active_mention = null;
                }
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
                xabber.accounts.connected.forEach(function (account) {
                    let mentions = _.clone(account.unreaded_mentions.models);
                    _.each(mentions, (function (mention) {
                        let msgid = mention.message.get('msgid'),
                            archive_id = mention.message.get('archive_id'),
                            contact_archive_id = mention.message.get('contact_archive_id'),
                            chat = account.chats.getChat(mention.contact);
                        mention.message.set('is_unread', false);
                        chat.sendMarker(msgid, 'displayed', archive_id, contact_archive_id);
                    }.bind(this)));
                }.bind(this));
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
                    var previous_mention = this.active_mention;
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
                'click': 'openByClick'
            },

            _initialize: function () {
                this.account = this.model.account;
                this.contact = this.model.contact;
                this.$el.attr('data-id', this.model.id);
                this.$el.attr('data-contact-jid', this.contact.get('jid'));
                this.updateGroupChatName();
                this.updateName();
                this.updateLastMessage();
                this.updateAvatar();
                this.updateColorScheme();
                this.updateCounter();
                this.model.on("change:active", this.updateActiveStatus, this);
                this.account.settings.on("change:color", this.updateColorScheme, this);
                this.contact.on("change:name", this.updateGroupChatName, this);
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

            updateGroupChatName: function () {
                this.$('.group-chat-name').text(this.contact.get('name'));
            },

            updateCounter:function () {
                let unreaded = this.model.message.get('is_unread');
                this.$('.msg-counter').switchClass('hidden', !unreaded);
                if (unreaded)
                    this.account.unreaded_mentions.add(this.model);
                else
                    this.account.unreaded_mentions.remove(this.model);
                xabber.toolbar_view.recountAllMessageCounter();
            },

            updateLastMessage: function () {
                let msg = this.model.message;
                if (!msg)
                    return;
                let msg_time = msg.get('time'),
                    timestamp = msg.get('timestamp'),
                    forwarded_message = msg.get('forwarded_message'),
                    msg_files = msg.get('files'),
                    msg_images = msg.get('images'),
                    msg_text = (forwarded_message) ? (msg.get('message') || ((forwarded_message.length > 1) ? (forwarded_message.length + ' forwarded messages') : 'Forwarded message').italics()) : msg.getText();
                this.model.set({timestamp: timestamp});
                if (msg_files || msg_images) {
                    let $colored_span = $('<span class="text-color-500"/>');
                    if (msg_files && msg_images) {
                        msg_files = (msg_files.length > 0) ? msg_files : undefined;
                        msg_images = (msg_images.length > 0) ? msg_images : undefined;
                    }
                    if (msg_files && msg_images)
                        msg_text = $colored_span.text(msg_files.length + msg_images.length + ' files');
                    else {
                        if (msg_files) {
                            if (msg_files.length > 1)
                                msg_text = $colored_span.text(msg_files.length + ' files');
                            if (msg_files.length == 1)
                                msg_text = $colored_span.text(msg_files[0].name);
                        }
                        if (msg_images) {
                            if (msg_images.length > 1)
                                msg_text = $colored_span.text(msg_images.length + ' images');
                            if (msg_images.length == 1)
                                msg_text = $colored_span.text(msg_images[0].name);
                        }
                    }
                    this.$('.last-msg').text("").append(msg_text);
                }
                else {
                    this.$('.last-msg').text("").append(msg_text);
                }
                this.$el.emojify('.last-msg', {emoji_size: 14});
                this.$('.last-msg-date').text(utils.pretty_short_datetime(msg_time))
                    .attr('title', utils.pretty_datetime(msg_time));
                this.updateCSS();
            },

            updateCSS: function () {
                var date_width = this.$('.last-msg-date').width();
                this.$('.chat-title-wrap').css('padding-right', date_width + 5);
                var title_width = this.$('.chat-title-wrap').width();
                this.$('.chat-title').css('max-width', title_width);
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
                        image = user_info.b64_avatar || this.account.chat_settings.getB64Avatar(user_info.avatar);
                        if (image) {
                            this.$('.circle-avatar').setAvatar(image, this.avatar_size);
                        }
                        else {
                            var node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + user_info.id;
                            this.contact.getAvatar(user_info.avatar, node, function (data_avatar) {
                                image = data_avatar;
                                this.account.chat_settings.updateCachedAvatars(user_info.id, user_info.avatar, data_avatar);
                                this.$('.circle-avatar').setAvatar(image, this.avatar_size);
                            }.bind(this), function () {
                                let default_avatar = Images.getDefaultAvatar(user_info.nickname || user_info.jid || user_info.id);
                                this.$('.circle-avatar').setAvatar(default_avatar, this.avatar_size);
                            }.bind(this));
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
                let msgid = this.model.message.get('msgid'),
                    archive_id = this.model.message.get('archive_id'),
                    contact_archive_id = this.model.message.get('contact_archive_id'),
                    chat = this.account.chats.getChat(this.contact);
                this.model.message.set('is_unread', false);
                chat.sendMarker(msgid, 'displayed', archive_id, contact_archive_id);
                this.model.set('active', true);
                this.contact.trigger("open_mention", this.contact, msgid);
            },

            updateColorScheme: function () {
                var color = this.account.settings.get('color');
                this.$el.attr('data-color', color);
            }

        });

        xabber.MentionsPlaceholderView = xabber.BasicView.extend({
            className: 'placeholder-wrap mentions-placeholder-wrap noselect',
            template: templates.mentions_placeholder
        });

        xabber.Account.addInitPlugin(function () {
           this.mentions = new xabber.AccountMentions(null, {account: this});
           this.unreaded_mentions = new xabber.Mentions(null, {account: this});
        });

        xabber.once("start", function () {
            this.mentions = new this.Mentions;
            this.mentions_view = this.left_panel.addChild('mentions',
                this.MentionsView, {model: this.mentions});
            this.mentions_placeholder = this.right_panel.addChild('mentions_placeholder',
                this.MentionsPlaceholderView);
        }, xabber);

        return xabber;
    };
});