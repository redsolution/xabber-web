define("xabber-views", function () {
  return function (xabber) {
    var env = xabber.env,
        constants = env.constants,
        templates = env.templates.base,
        utils = env.utils,
        $ = env.$,
        _ = env._;

    xabber.ViewPath = function (str) {
        this.path = str.split('.');
        this.applyTo = function (obj) {
            var result = obj;
            for (var idx = 0; idx < this.path.length; idx++) {
                if (!(result = _.result(result, this.path[idx]))) {
                    return null;
                }
            }
            return result;
        };
    };

    xabber.BasicView = Backbone.View.extend({
        template: function () {
            return '';
        },

        initialize: function (options) {
            options || (options = {});
            this.parent = options.parent;
            this.vname = options.vname;
            this.children = {};
            this.$el.addClass(options.classlist);
            if (!options.el) {
                this.$el.html(this.template(_.extend({view: this}, constants)));
            }
            if (!_.isUndefined(this.ps_selector)) {
                this.ps_container = this.$(this.ps_selector);
                if (this.ps_container.length) {
                    this.ps_container.perfectScrollbar(
                        _.extend(this.ps_settings || {}, xabber.ps_settings)
                    );
                }
            }
            this.data = new Backbone.Model({visible: false});
            this.data.on("change:visible", this.onChangedVisibility, this);
            xabber.on("update_css", function (options) {
                this.updateCSS && this.updateCSS();
            }, this);
            this._initialize && this._initialize(options);
            this.__initialize && this.__initialize(options);
        },

        isVisible: function () {
            return this.data.get('visible');
        },

        onChangedVisibility: function () {},

        show: function () {
            this.onShow.apply(this, arguments);
            this.data.set('visible', true);
            this.trigger('after_show', this);
            this.updateScrollBar();
        },

        hide: function () {
            this.trigger('before_hide', this);
            this.data.set('visible', false);
            this.onHide.apply(this, arguments);
        },

        onShow: function () {
            this.render.apply(this, arguments);
            _.each(this.children, function (view) {
                view.render.apply(view, arguments);
            });
        },

        onHide: function () {
            _.each(this.children, function (view) {
                view.onHide.apply(view, arguments);
            });
        },

        detach: function () {
            this.$el.detach();
        },

        child: function (name) {
            return this.children[name];
        },

        addChild: function (name, constructor, options) {
            var view;
            if (constructor instanceof Backbone.View) {
                view = constructor;
                view.parent = this;
            } else {
                view = new constructor(_.extend({
                    parent: this,
                    vname: name
                }, options));
            }
            this.children[name] = view;
            return view;
        },

        removeChild: function (name, options) {
            options || (options = {});
            var view = this.children[name];
            if (view) {
                delete this.children[name];
                options.soft ? view.detach() : view.remove();
            }
        },

        removeChildren: function () {
            _.each(_.keys(this.children), function (view_id) {
                this.removeChild(view_id);
            }.bind(this));
        },

        setCustomCss: function (styles) {
            this.$el.css(styles);
        },

        removeCustomCss: function () {
            this.$el.removeAttr('style');
        },

        saveScrollBarOffset: function () {
            if (this.ps_container && this.isVisible()) {
                var scroll_top = this.data.get('scroll_top');
                if (typeof scroll_top === "undefined") {
                    this.data.set('scroll_top', this.getScrollTop());
                }
            }
        },

        updateScrollBar: function () {
            if (this.ps_container && this.isVisible()) {
                var scroll_top = this.data.get('scroll_top');
                if (typeof scroll_top === "undefined") {
                    this.ps_container.perfectScrollbar('update');
                } else {
                    this.data.set('scroll_top', undefined);
                    this.scrollTo(scroll_top);
                }
            }
            return this;
        },

        scrollTo: function (offset) {
            this.ps_container[0].scrollTop = offset;
            this.ps_container.perfectScrollbar('update');
        },

        scrollToTop: function () {
            this.scrollTo(0);
        },

        scrollToBottom: function () {
            var scrollHeight = this.ps_container[0].scrollHeight,
                offsetHeight = this.ps_container[0].offsetHeight;
            this.scrollTo(scrollHeight - offsetHeight);
        },

        scrollToChild: function ($child) {
            var scrollTop = _.reduce($child.prevAll(), function (sum, el) {
                return sum + el.offsetHeight;
            }, 0);
            this.scrollTo(scrollTop);
        },

        getScrollTop: function () {
            return this.ps_container[0].scrollTop;
        },

        getPercentScrolled: function () {
            if (this.isScrolledToTop()) {
                return 0;
            }
            var scrollTop = this.ps_container[0].scrollTop,
                scrollHeight = this.ps_container[0].scrollHeight,
                offsetHeight = this.ps_container[0].offsetHeight;
            return scrollTop / (scrollHeight - offsetHeight);
        },

        isScrolledToTop: function () {
            return this.getScrollTop() === 0;
        },

        isScrolledToBottom: function () {
            var scrollTop = this.ps_container[0].scrollTop,
                scrollHeight = this.ps_container[0].scrollHeight,
                offsetHeight = this.ps_container[0].offsetHeight;
            return scrollHeight === scrollTop + offsetHeight;
        }
    });

    xabber.NodeView = xabber.BasicView.extend({
        onShow: function (options, tree) {
            _.each(this.children, function (view) {
                view.hide();
            });
            this.$el.children().detach();
            tree = this.patchTree(tree, options) || tree;
            _.each(this.children, function (view, name) {
                if (_.has(tree, name)) {
                    this.$el.append(view.$el);
                    view.show(options, tree[name]);
                }
            }.bind(this));
            return this.render(options);
        },

        onHide: function (options) {
            _.each(this.children, function (view) {
                view.hide(options);
            });
        },

        patchTree: function () {}
    });

    xabber.Container = xabber.BasicView.extend({
        className: 'container',

        render: function (options, path) {
            var new_view = path.applyTo(options);
            this.$el.children().detach();
            if (this.view !== new_view) {
                this.onHide(options);
            }
            this.view = new_view;
            if (this.view) {
                this.$el.append(this.view.$el);
                this.view.show(options);
            }
            return this;
        },

        onHide: function (options) {
            if (this.view) {
                this.view.hide(options);
            }
            this.view = null;
        }
    });

    xabber.SearchView = xabber.BasicView.extend({

        events: {
            "keyup .search-input": "keyUpOnSearch",
            "focusout .search-input": "clearSearchSelection",
            "click .close-search-icon": "clearSearch"
        },

        keyUpOnSearch: function (ev) {
            ev.stopPropagation();
            this.ids = this.$('.list-item:not(.hidden)').map(function () {
                return $(this).data('id');
            }).toArray();
            var $selection = this.getSelectedItem();
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
            if (ev.keyCode === constants.KEY_ESCAPE) {
                ev.preventDefault();
                return this.clearSearch();
            }
            this.updateSearch();
        },

        getSelectedItem: function () {
            return this.$('.list-item[data-id="'+this.selection_id+'"]');
        },

        selectItem: function (id) {
            this.clearSearchSelection();
            var $selection = this.$('.list-item[data-id="'+id+'"]');
            if ($selection.length) {
                this.selection_id = id;
            } else {
                $selection = this.$('.list-item:visible').first();
                this.selection_id = $selection.data('id');
            }
            $selection.addClass('selected');
        },

        selectNextItem: function () {
            this.selectItem(this.ids[this.ids.indexOf(this.selection_id)+1]);
        },

        selectPreviousItem: function () {
            this.selectItem(this.ids[this.ids.indexOf(this.selection_id)-1]);
        },

        updateSearch: function () {
            if (!this._update_search_timeout) {
                var query = this.$('.search-input').val();
                this.$('.search-form').switchClass('active', query);
                this.clearSearchSelection();
                if (query) {
                   this.search(query.toLowerCase());
                } else {
                    if (xabber.toolbar_view.$('.active').hasClass('archive-chats')) {
                        this.showArchiveChats();
                    }
                    if (xabber.toolbar_view.$('.active').hasClass('all-chats')) {
                        this.showAllChats();
                    }
                    if (xabber.toolbar_view.$('.active').hasClass('group-chats')) {
                        this.showGroupChats();
                    }
                    if (xabber.toolbar_view.$('.active').hasClass('chats')) {
                        this.showChats();
                    }
                   //this.searchAll();
                }
                this.updateScrollBar();
                this.query = false;
                this._update_search_timeout = setTimeout(function () {
                    this._update_search_timeout = null;
                    this.query && this.updateSearch();
                }.bind(this), 150);
            } else {
                this.query = true;
            }
        },

        clearSearch: function (ev) {
            ev && ev.preventDefault();
            this.$('.search-input').val('');
            this.updateSearch();
        },

        clearSearchSelection: function (ev) {
            this.selection_id = null;
            this.$('.item-list .selected').removeClass('selected');
        },

        searchAll: function () {
            this.$('.list-item').removeClass('hidden');
        },

        search: function () {},

        onEnterPressed: function () {},

        showGroupChats: function () {},

        showChats: function () {},

        showArchiveChats: function () {},

        showAllChats: function () {}
    });

    xabber.InputWidget = Backbone.View.extend({
        field_type: 'text',
        template: templates.input_widget,

        events: {
            "click .field-text": "showInput",
            "keydown .field-input": "keyDown",
            "keyup .field-input": "keyUp",
            "focusout .field-input": "changeValue"
        },

        initialize: function () {
            this.$el.html(this.template({
                field_name: this.field_name,
                field_type: this.field_type,
                placeholder: this.placeholder
            }));
            this.$value = this.$('.field-text');
            this.$input = this.$('.field-input');
            this.updateValue();
            this.data = new Backbone.Model({input_mode: false});
            this.data.on("change:input_mode", this.onChangedInputMode, this);
            this.bindModelEvents();
        },

        bindModelEvents: function () {
            this.model.on("change:"+this.model_field, this.updateValue, this);
        },

        showInput: function () {
            this.data.set('input_mode', true);
        },

        onChangedInputMode: function () {
            var input_mode = this.data.get('input_mode');
            this.$value.hideIf(input_mode);
            this.$input.showIf(input_mode).focus();
        },

        keyDown: function (ev) {
            ev.stopPropagation();
            var value = this.getValue();
            if (ev.keyCode === constants.KEY_ENTER) {
                this.changeValue();
            } else if (ev.keyCode === constants.KEY_ESCAPE) {
                this.$input.removeClass('changed').val(value);
                this.data.set('input_mode', false);
            }
        },

        keyUp: function (ev) {
            var value = this.getValue();
            this.$input.switchClass('changed', this.$input.val() !== value);
        },

        getValue: function () {
            return this.model.get(this.model_field);
        },

        setValue: function (value) {
            this.model.save(this.model_field, value);
        },

        changeValue: function () {
            var value = this.getValue(),
                new_value = this.$input.removeClass('changed').val();
            new_value !== value && this.setValue(new_value);
            if ((new_value == "")&&(this.$el.hasClass('name-wrap')))
                this.setValue(this.model.attributes.vcard.nickname);
            this.data.set('input_mode', false);
        },

        updateValue: function () {
            var value = this.getValue();
            this.$value.text(value);
            this.$input.val(value);
        }
    });

    xabber.Body = xabber.NodeView.extend({
        className: 'client-body-wrap',

        _initialize: function () {
            this.vname = 'body';
            this.data.set('visible', true);
            this.screen = new Backbone.Model();
            this.screen_map = new Backbone.Model();
            this.screen.on("change", this.update, this);
            this.screen_map.on("change", this.onScreenMapChanged, this);
            $('body').append(this.$el);
        },

        addScreen: function (name, attrs) {
            this.screen_map.set(name, attrs);
        },

        setScreen: function (name, attrs, options) {
            var new_attrs = {stamp: _.uniqueId()};
            if (name && !this.isScreen(name)) {
                new_attrs.name = name;
            }
            this.screen.set(_.extend(new_attrs, attrs), options);
        },

        isScreen: function (name) {
            return this.screen.get('name') === name;
        },

        onScreenMapChanged: function () {
            var name = this.screen.get('name');
            if (_.has(this.screen_map.changed, name)) {
                this.update();
            }
        },

        update: function () {
            var options = this.screen.attributes,
                tree = this.screen_map.get(options.name);
            if (typeof tree !== "undefined") {
                this.onShow(options, tree);
                this.model.trigger('update_screen', this.screen.get('name'));
                this.model.trigger('update_layout', {screen_changed: options.name});
            }
        }
    });

    xabber.ToolbarView = xabber.BasicView.extend({
        className: "toolbar noselect",
        ps_selector: '.accounts',
        ps_settings: {theme: 'item-list'},
        template: templates.toolbar,

        events: {
            "click .all-chats":             "showAllChats",
            "click .chats":                 "showChats",
            "click .group-chats":           "showGroupChats",
            "click .contacts":              "showContacts",
            "click .archive-chats":         "showArchive",
            "click .settings":              "showSettings",
            "click .add-variant.contact":   "showAddContactView",
            "click .add-variant.account":   "showAddAccountView",
            "click .add-variant.groupchat": "showAddGroupChatView",
            "click .about":                 "showAbout"
        },

        _initialize: function () {
            var $menu_overlay = $('<div class="lean-overlay toolbar-menu"></div>');

            this.$('.add-something').on("change_state", function (ev, state) {
                $(this).switchClass('active', state).find('.mdi')
                        .switchClass('mdi-close', state)
                        .switchClass('mdi-plus', !state);
                if (state) {
                    $menu_overlay.appendTo('body');
                } else {
                    $menu_overlay.detach();
                }
            });

            xabber.on("update_screen", this.onUpdatedScreen, this);
            this.data.on("change:add_menu_state", this.onChangedAddMenuState, this);
            this.data.on("change:all_msg_counter", this.onChangedAllMessageCounter, this);
            this.data.on("change:group_msg_counter", this.onChangedGroupMessageCounter, this);
            this.data.on("change:msg_counter", this.onChangedMessageCounter, this);
            this.data.set({msg_counter: 0});
            this.data.set({group_msg_counter: 0});
            this.data.set({all_msg_counter: 0});
        },

        render: function () {
            this.$('.add-something').dropdown({
                inDuration: 50,
                outDuration: 50,
                constrainWidth: false,
                hover: false,
                alignment: 'left'
            });
        },

        onUpdatedScreen: function (name) {
            if ((name === 'all-chats') &&
                    (this.$('.toolbar-item.all-chats').hasClass('active') ||
                    this.$('.toolbar-item.group-chats').hasClass('active') ||
                    this.$('.toolbar-item.chats').hasClass('active')||
                    this.$('.toolbar-item.archive-chats').hasClass('active'))) {
                return;
            }
            this.$('.toolbar-item').removeClass('active');
            if (_.contains(['all-chats', 'contacts',
                            'settings', 'about'], name)) {
                this.$('.toolbar-item.'+name).addClass('active');
            }
        },

        showAllChats: function (ev) {
            this.$('.toolbar-item').removeClass('active')
                .filter('.all-chats').addClass('active');
            xabber.body.setScreen('all-chats', {right: null});
        },

        showChats: function (ev) {
            this.$('.toolbar-item').removeClass('active')
                .filter('.chats').addClass('active');
            xabber.body.setScreen('all-chats', {right: null});
            xabber.trigger('show_chats');
        },

        showGroupChats: function (ev) {
            this.$('.toolbar-item').removeClass('active')
                .filter('.group-chats').addClass('active');
            xabber.body.setScreen('all-chats', {right: null});
            xabber.trigger('show_group_chats');
        },

        showArchive: function (ev) {
            this.$('.toolbar-item').removeClass('active')
                .filter('.archive-chats').addClass('active');
            xabber.body.setScreen('all-chats', {right: null});
            xabber.trigger('show_archive_chats');
        },

        showContacts: function (ev) {
            xabber.body.setScreen('contacts', {right: null});
        },

        showSettings: function (ev) {
            xabber.body.setScreen('settings');
        },

        showAddContactView: function () {
            xabber.trigger('add_contact');
        },

        showAddAccountView: function () {
            xabber.trigger('add_account');
        },

        showAddGroupChatView: function () {
            xabber.trigger('add_group_chat');
        },

        showAbout: function () {
            xabber.body.setScreen('about');
        },

        setAllMessageCounter: function () {
            var count_msg = 0, count_all_msg = 0, count_group_msg = 0;
            xabber.accounts.each(function(idx) {
                xabber.accounts.get(idx).chats.each(function (idx1) {
                    var $chat = xabber.accounts.get(idx).chats.get(idx1);
                    if (($chat.contact.get('archived'))&&($chat.contact.get('muted'))) {
                    }
                    else {
                        count_all_msg += $chat.get('unread');
                        if ($chat.contact.get('group_chat'))
                            count_group_msg += $chat.get('unread');
                        else
                            count_msg += $chat.get('unread');
                    }
                }.bind(this));
            }.bind(this));
            return { msgs: count_msg, all_msgs: count_all_msg, group_msgs: count_group_msg };
        },

        recountAllMessageCounter: function () {
            var unread_messages = this.setAllMessageCounter();
            this.data.set('all_msg_counter', unread_messages.all_msgs);
            this.data.set('msg_counter', unread_messages.msgs);
            this.data.set('group_msg_counter', unread_messages.group_msgs);
        },

        onChangedMessageCounter: function () {
            var c = this.data.get('msg_counter');
            this.$('.msg-indicator').switchClass('unread', c).text();
        },

        onChangedGroupMessageCounter: function () {
            var c = this.data.get('group_msg_counter');
            this.$('.group-msg-indicator').switchClass('unread', c).text();
        },

        onChangedAllMessageCounter: function () {
            var c = this.data.get('all_msg_counter');
            this.$('.all-msg-indicator').switchClass('unread', c).text(c);
        },
    });

    xabber.SettingsView = xabber.BasicView.extend({
        className: 'settings-panel',
        template: templates.settings,
        ps_selector: '.panel-content',

        events: {
            "click .settings-tabs-wrap .settings-tab": "jumpToBlock",
            "mousedown .setting.notifications label": "setNotifications",
            "mousedown .setting.message-preview label": "setMessagePreview",
            "change .sound input[type=radio][name=sound]": "setSound",
            "change .hotkeys input[type=radio][name=hotkeys]": "setHotkeys",
            "click .settings-tab.delete-all-accounts": "deleteAllAccounts"
        },

        _initialize: function () {
            this.$('.xabber-info-wrap .version').text(xabber.get('version_number'));
        },

        render: function () {
            var settings = this.model.attributes;
            this.$('.notifications input[type=checkbox]').prop({
                checked: settings.notifications
            });
            this.$('.message-preview input[type=checkbox]')
                .prop({checked: settings.message_preview});
            var sound_value = settings.sound ? settings.sound_on_message : '';
            this.$('.sound input[type=radio][name=sound][value="'+sound_value+'"]')
                    .prop('checked', true);
            this.$('.hotkeys input[type=radio][name=hotkeys][value='+settings.hotkeys+']')
                    .prop('checked', true);
            return this;
        },

        jumpToBlock: function (ev) {
            var $tab = $(ev.target).closest('.settings-tab'),
                $elem = this.$('.settings-block-wrap.' + $tab.data('block-name'));
            $tab.addClass('active').siblings().removeClass('active');
            this.scrollToChild($elem);
        },

        setNotifications: function (ev) {
            var value = !this.model.get('notifications');
            this.model.save('notifications', value);
            ev.preventDefault();
            $(ev.target).closest('input').prop('checked', value);
        },

        setMessagePreview: function (ev) {
            var value = !this.model.get('message_preview');
            this.model.save('message_preview', value);
            ev.preventDefault();
            $(ev.target).closest('input').prop('checked', value);
        },

        setSound: function (ev) {
            var value = ev.target.value;
            if (value) {
                xabber.playAudio(value);
                this.model.save({sound: true, sound_on_message: value});
            } else {
                this.model.save('sound', false);
            }
        },

        setHotkeys: function (ev) {
            this.model.save('hotkeys', ev.target.value);
        },

        deleteAllAccounts: function (ev) {
            utils.dialogs.ask("Quit Xabber Web", "Do you want to delete all accounts from Xabber Web? "+
                    "Accounts will not be deleted from the server.").done(function (res) {
                res && xabber.trigger('quit');
            });
        }
    });

    xabber.AboutView = xabber.BasicView.extend({
        className: 'settings-panel about-panel',
        template: templates.about,
        ps_selector: '.panel-content',

        _initialize: function () {
            this.$('.xabber-info-wrap .version').text(this.model.get('version_number'));
        },

        render: function () {
        }
    });

    xabber.DragManager = Backbone.Model.extend({
        initialize: function () {
            window.document.onmousedown = this.onMouseDown.bind(this);
            window.document.onmousemove = this.onMouseMove.bind(this);
            window.document.onmouseup = this.onMouseUp.bind(this);
        },

        onMouseDown: function (ev) {
            if (ev.which != 1) {
                return;
            }
            var draghandle_elem = ev.target.closest('.drag-handle'),
                elem = draghandle_elem && draghandle_elem.closest('.draggable');
            if (!elem) {
                return this.resetElem();
            }
            this.set({
                elem: elem,
                draghandle_elem: draghandle_elem,
                downX: ev.pageX,
                downY: ev.pageY
            });
        },

        onMouseMove: function (ev) {
            if (!this.get('elem')) {
                return;
            }
            var avatar = this.get('avatar');
            if (!avatar) {
                if (    Math.abs(ev.pageX - this.get('downX')) < 3 &&
                        Math.abs(ev.pageY - this.get('downY')) < 3) {
                    return;
                }
                avatar = this.createAvatar(ev);
                if (!avatar) {
                    return this.resetElem();
                }
                this.set('avatar', avatar);
                var coords = this.getCoords(avatar);
                this.set({
                    shiftX: this.get('downX') - coords.left,
                    shiftY: this.get('downY') - coords.top
                });
                this.startDrag(ev);
            }
            avatar.style.left = ev.pageX - this.get('shiftX') + 'px';
            avatar.style.top = ev.pageY - this.get('shiftY') + 'px';
            var drop_elem = this.findDropElem(ev);
            this.updateDropElem(drop_elem);
            return;
        },

        onMouseUp: function (ev) {
            var selector = document.querySelector('.recording');
            if (selector) {
                $(selector).removeClass('recording');
                return;
            }
            this.get('avatar') && this.finishDrag(ev);
            this.resetElem();
        },

        resetElem: function () {
            this.set({elem: null, draghandle_elem: null, avatar: null});
        },

        getCoords: function (elem) {
            var box = elem.getBoundingClientRect();
            return {
                top: box.top + window.pageYOffset,
                left: box.left + window.pageXOffset
            };
        },

        createAvatar: function () {
            var avatar = this.get('elem'),
                $avatar = $(avatar),
                draghandle_elem = this.get('draghandle_elem');
            var old = {
                parent: avatar.parentNode,
                nextSibling: avatar.nextSibling,
                position: avatar.position || '',
                left: avatar.left || '',
                top: avatar.top || '',
                zIndex: avatar.zIndex || '',
                avatar_cursor: avatar.style.cursor || '',
                draghandle_elem_cursor: draghandle_elem.style.cursor || ''
            };

            $avatar.addClass('dragging');
            avatar.style.cursor = '-webkit-grabbing';
            draghandle_elem.style.cursor = '-webkit-grabbing';

            avatar.rollback = function () {
                old.parent.insertBefore(avatar, old.nextSibling);
                $avatar.removeClass('dragging');
                avatar.style.position = old.position;
                avatar.style.left = old.left;
                avatar.style.top = old.top;
                avatar.style.zIndex = old.zIndex;
                avatar.style.cursor = old.avatar_cursor;
                draghandle_elem.style.cursor = old.draghandle_elem_cursor;
            };

            return avatar;
        },

        startDrag: function (ev) {
            var avatar = this.get('avatar');
            window.document.body.appendChild(avatar);
            avatar.style.zIndex = 9999;
            avatar.style.position = 'absolute';
        },

        finishDrag: function (ev) {
            var elem = this.get('elem'),
                avatar = this.get('avatar'),
                drop_elem = this.findDropElem(ev);
            avatar.rollback();
            this.updateDropElem(null);
            if (elem && drop_elem) {
                $(elem).trigger('drag_to', drop_elem);
                $(drop_elem).trigger('drag_from', elem);
            }
        },

        findDropElem: function (ev) {
            var avatar = this.get('avatar');
            avatar.hidden = true;
            var elem = window.document.elementFromPoint(ev.clientX, ev.clientY);
            avatar.hidden = false;
            if (!elem) {
                return null;
            }
            return elem.closest('.droppable');
        },

        updateDropElem: function (drop_elem) {
            var old_drop_elem = this.get('drop_elem');
            this.set('drop_elem', drop_elem);
            old_drop_elem && $(old_drop_elem).removeClass('drag-on');
            drop_elem && $(drop_elem).addClass('drag-on');
        }
    });

    _.extend(xabber, {
        modal_settings: {
            open: {
                in_duration: 50,
                out_duration: 100,
                opacity: 0.4
            },
            close: {out_duration: 100}
        },

        ps_settings: {
            minScrollbarLength: 40,
            suppressScrollX: true,
            wheelSpeed: 0.5
        },

        startBlinkingFavicon: function () {
            if (this._blink_interval) {
                return;
            }
            this._blink_interval = setInterval(function () {
                var $icon = $("link[rel='shortcut icon']");
                if ($icon.attr('href') === constants.FAVICON_DEFAULT) {
                    $icon.attr('href', constants.FAVICON_MESSAGE);
                } else {
                    $icon.attr('href', constants.FAVICON_DEFAULT);
                }
            }, 500);
        },

        stopBlinkingFavicon: function () {
            if (this._blink_interval) {
                clearInterval(this._blink_interval);
                this._blink_interval = null;
                $("link[rel='shortcut icon']").attr("href", constants.FAVICON_DEFAULT);
            }
        },

        onChangedAllMessageCounter: function () {
            if (this.get('all_msg_counter')) {
                this.startBlinkingFavicon();
                window.document.title = "Messages (" + this.get('all_msg_counter') + ")";
            } else {
                this.stopBlinkingFavicon();
                window.document.title = 'Xabber Web';
            }
        },

        setAllMessageCounter: function () {
            var count_msg = 0;
            xabber.accounts.each(function(idx) {
                xabber.accounts.get(idx).chats.each(function (idx1) {
                    var $chat = xabber.accounts.get(idx).chats.get(idx1);
                    if (!$chat.contact.get('archived'))
                        count_msg += $chat.get('unread');
                }.bind(this));
            }.bind(this));
            return count_msg;
        },

        recountAllMessageCounter: function () {
            this.set('all_msg_counter', this.setAllMessageCounter());
        },

        resetMessageCounter: function () {
            this.set('all_msg_counter', 0);
        },

        onChangedFocusState: function () {
            if (this.get('focused')) {
                this.resetMessageCounter();
            }
        },

        openWindow: function (url) {
            utils.openWindow(url, function () {
                utils.dialogs.error('Could not open new tab. Please allow popups');
            }.bind(this));
        },

        popupNotification: function (params) {
            var notification = new window.Notification(params.title, {
                body: params.text,
                icon: params.icon
            });
            setTimeout(notification.close.bind(notification), 5000);
            return notification;
        },

        playAudio: function (name) {
            var filename = constants.SOUNDS[name];
            if (filename) {
                var audio = new window.Audio(filename);
                audio.play();
            }
        },

        registerDOMEvents: function () {
            var self = this;

            $(window).on("blur focus", function (ev) {
                self.set('focused', ev.type === 'focus');
            });

            $(window).on("resize", function (ev) {
                self.set({
                    width: window.innerWidth,
                    height: window.innerHeight
                });
                self.trigger('update_layout', {size_changed: true});
            });

            window.document.body.ondragover = function (ev) {
                ev.preventDefault();
            };

            window.document.body.ondrop = function (ev) {
                ev.preventDefault();
            };
        }
    });

    xabber.once("start", function () {
        this.set('all_msg_counter', 0);
        this.on("change:all_msg_counter", this.onChangedAllMessageCounter, this);
        this.on("change:focused", this.onChangedFocusState, this);
        this.set({
            focused: window.document.hasFocus(),
            width: window.innerWidth,
            height: window.innerHeight
        });
        this.registerDOMEvents();
        Materialize.modalSettings = this.modal_settings;

        this.drag_manager = new this.DragManager();

        this.body = new this.Body({model: this});

        this.login_page = this.body.addChild('login', this.NodeView, {
            classlist: 'login-page-wrap'});

        this.toolbar_view = this.body.addChild('toolbar', this.ToolbarView);

        this.main_panel = this.body.addChild('main', this.NodeView, {
            classlist: 'main-wrap'});
        this.left_panel = this.main_panel.addChild(
            'left', this.NodeView, {classlist: 'panel-wrap left-panel-wrap'});
        this.right_panel = this.main_panel.addChild(
            'right', this.NodeView, {classlist: 'panel-wrap right-panel-wrap'});
        this.wide_panel = this.main_panel.addChild(
            'wide', this.NodeView, {classlist: 'panel-wrap wide-panel-wrap'});

        this.settings_view = this.wide_panel.addChild(
            'settings', this.SettingsView, {model: this._settings});
        this.about_view = this.wide_panel.addChild(
            'about', this.AboutView, {model: this});
    }, xabber);

    return xabber;
  };
});
