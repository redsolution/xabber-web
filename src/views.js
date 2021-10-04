define("xabber-views", function () {
  return function (xabber) {
    let env = xabber.env,
        constants = env.constants,
        templates = env.templates.base,
        utils = env.utils,
        uuid = env.uuid,
        $ = env.$,
        _ = env._;

    xabber.ViewPath = function (str) {
        this.path = str.split('.');
        this.applyTo = function (obj) {
            let result = obj;
            for (let idx = 0; idx < this.path.length; idx++) {
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
                (options && options.size_changed && this.windowResized) && this.windowResized();
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
            let view;
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
            let view = this.children[name];
            if (view) {
                delete this.children[name];
                options.soft ? view.detach() : (view.trigger("remove") && view.remove());
            }
        },

        removeChildren: function () {
            _.each(_.keys(this.children), (view_id) => {
                this.removeChild(view_id);
            });
        },

        setCustomCss: function (styles) {
            this.$el.css(styles);
        },

        removeCustomCss: function () {
            this.$el.removeAttr('style');
        },

        saveScrollBarOffset: function () {
            if (this.ps_container && this.isVisible()) {
                let scroll_top = this.data.get('scroll_top');
                if (typeof scroll_top === "undefined") {
                    this.data.set('scroll_top', this.getScrollTop());
                }
            }
        },

        updateScrollBar: function () {
            // let start_scrolled_bottom = this.getScrollBottom();
            if (this.ps_container && this.isVisible()) {
                let scroll_top = this.data.get('scroll_top');
                if (typeof scroll_top === "undefined") {
                    this.ps_container.perfectScrollbar('update');
                } else {
                    this.data.set('scroll_top', undefined);
                    this.scrollTo(scroll_top);
                }
            }
            // this.scrollTo(this.ps_container[0].scrollHeight - this.ps_container[0].offsetHeight - start_scrolled_bottom);
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
            let scrollHeight = this.ps_container[0].scrollHeight,
                offsetHeight = this.ps_container[0].offsetHeight;
            this.scrollTo(scrollHeight - offsetHeight);
        },

        scrollToChild: function ($child) {
            let scrollTop = _.reduce($child.prevAll(), function (sum, el) {
                return sum + el.offsetHeight + 2;
            }, 0);
            this.scrollTo(scrollTop);
        },

        getScrollTop: function () {
            return this.ps_container[0].scrollTop;
        },

        getScrollBottom: function () {
            let scrollTop = this.ps_container[0].scrollTop,
                scrollHeight = this.ps_container[0].scrollHeight,
                offsetHeight = this.ps_container[0].offsetHeight;
            return scrollHeight - (scrollTop + offsetHeight);
        },

        getPercentScrolled: function () {
            if (this.isScrolledToTop()) {
                return 0;
            }
            let scrollTop = this.ps_container[0].scrollTop,
                scrollHeight = this.ps_container[0].scrollHeight,
                offsetHeight = this.ps_container[0].offsetHeight;
            return scrollTop / (scrollHeight - offsetHeight);
        },

        isScrolledToTop: function () {
            return this.getScrollTop() === 0;
        },

        isScrolledToBottom: function () {
            let scrollTop = this.ps_container[0].scrollTop,
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
            _.each(this.children, (view, name) => {
                if (_.has(tree, name)) {
                    if (name !== 'login')
                        this.$el.append(view.$el);
                    this.$el.switchClass('hidden', name === 'login');
                    view.show(options, tree[name]);
                }
            });
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
            let new_view = path.applyTo(options);
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
            "keydown .search-input": "keyUpOnSearch",
            "focusout .search-input": "clearSearchSelection",
            "click .close-search-icon": "clearSearch",
            "click .list-item": "onClickItem"
        },

        keyUpOnSearch: function (ev) {
            ev.stopPropagation();
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
            if (ev.keyCode === constants.KEY_ESCAPE) {
                ev.preventDefault();
                if ($(ev.target).val())
                    return this.clearSearch();
                else
                    this.close();
            }
            this.updateSearch();
        },

        getSelectedItem: function () {
            return this.$('.list-item[data-id="'+this.selection_id+'"]');
        },

        selectItem: function (id, arrow) {
            if (!id)
                return;
            this.clearSearchSelection();
            let $selection = this.$('.list-item[data-id="'+id+'"]');
            if ($selection.length) {
                this.selection_id = id;
            } else {
                this.ps_container[0].scrollTop = 0;
                $selection = this.$('.list-item:visible').first();
                this.selection_id = $selection.data('id');
            }
            if (arrow === 'down' && ($selection[0].clientHeight + $selection[0].offsetTop >= this.ps_container[0].clientHeight + this.ps_container[0].scrollTop || $selection[0].clientHeight + $selection[0].offsetTop < this.ps_container[0].scrollTop))
                this.ps_container[0].scrollTop = $selection[0].offsetTop;
            if (arrow === 'up' && ($selection[0].offsetTop <= this.ps_container[0].scrollTop || $selection[0].offsetTop > this.ps_container[0].scrollTop + this.ps_container[0].clientHeight))
                this.ps_container[0].scrollTop = $selection[0].offsetTop;
            $selection.addClass('selected');
        },

        selectNextItem: function () {
            this.selectItem(this.ids[this.ids.indexOf(this.selection_id)+1], 'down');
        },

        selectPreviousItem: function () {
            this.selectItem(this.ids[this.ids.indexOf(this.selection_id)-1], 'up');
        },

        updateSearch: function () {
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
        },

        clearSearch: function (ev) {
            ev && ev.preventDefault();
            this.$('.search-input').val('');
            this.updateSearch();
        },

        clearSearchSelection: function (ev) {
            this.selection_id = null;
            this.$('.list-item.selected').removeClass('selected');
        },

        searchAll: function () {
            this.$('.list-item').removeClass('hidden');
        },

        keyUpOnSearchWithQuery: function () {},

        close: function () {},

        search: function () {},

        onEnterPressed: function () {},

        onEmptyQuery: function () {},

        onClickItem: function () {}
    });

      xabber.SearchPanelView = xabber.SearchView.extend({
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
              if (ev.keyCode === constants.KEY_ESCAPE) {
                  ev.preventDefault();
                  if ($(ev.target).val())
                      return this.clearSearch();
                  else
                      this.close();
              }
              this.updateSearch();
          },

          onScrollY: function (options) {
              if (xabber.all_searched_messages && xabber.all_searched_messages.length && this.queryid && !this._loading_messages && !this._messages_loaded && this.isScrolledToBottom()) {
                  this._loading_messages = true;
                  options = options || {};
                  this.queryid = uuid();
                  options.query_id = this.queryid;
                  let accounts = xabber.accounts.connected;
                  accounts.forEach((account) => {
                      let first_message = xabber.all_searched_messages.find(message => (message.account.get('jid') === account.get('jid')));
                      if (!first_message || account.searched_msgs_loaded) {
                          // this._loading_messages = false;
                          return;
                      }
                      options.account = account;
                      options.before = first_message.get('archive_id');
                      this.MAMRequest(this.query_text, options, (messages) => {
                          _.each(messages, (message) => {
                              let message_from_stanza = account.chats.receiveChatMessage(message,
                                  _.extend({is_searched: true}, options)
                                  ),
                                  msg_idx = xabber.all_searched_messages.indexOf(message_from_stanza),
                                  $message_item_view;
                              if (!message_from_stanza)
                                  return;
                              else
                                  $message_item_view = new xabber.MessageItemView({model: message_from_stanza});
                              if (msg_idx === 0) {
                                  $message_item_view.$el.appendTo(this.$('.messages-list-wrap .messages-list'));
                              } else {
                                  $message_item_view.$el.insertBefore(this.$('.messages-list-wrap .message-item').eq(-msg_idx));
                              }
                          });
                          this.$('.messages-list-wrap').switchClass('hidden', !this.$('.messages-list').children().length);
                          this.updateScrollBar();
                          this._loading_messages = false;
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
              if (ev.keyCode === constants.KEY_ESCAPE) {
                  ev.preventDefault();
                  if ($(ev.target).val())
                      return this.clearSearch();
                  else
                      this.close();
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
              this.$('.contacts-list').html("");
              this.$('.chats-list').html("");
              xabber.accounts.connected.forEach((acc) => {
                  let saved_chat = acc.chats.getSavedChat();
                  saved_chat.set('opened', true);
                  saved_chat.item_view.updateLastMessage();
              });
              let query_chats = _.clone(xabber.chats);
              query_chats.comparator = 'timestamp';
              query_chats.sort('timestamp').forEach((chat) => {
                  let jid = chat.get('jid').toLowerCase(),
                      name = chat.contact ? (chat.contact.get('roster_name') || chat.contact.get('name')) : chat.get('name');
                  name && (name = name.toLowerCase());
                  if (chat.get('timestamp') || chat.get('saved')) {
                      if (name.indexOf(query) > -1 || jid.indexOf(query) > -1) {
                          let searched_by = name.indexOf(query) > -1 ? 'by-name' : 'by-jid',
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
                          if (name.indexOf(query) > -1 || jid.indexOf(query) > -1) {
                              let searched_by = name.indexOf(query) > -1 ? 'by-name' : 'by-jid',
                                  item_list = xabber.contacts_view.$(`.account-roster-wrap[data-jid="${account.get('jid')}"] .list-item[data-jid="${jid}"]`).first().clone().data('account-jid', account.get('jid'));
                              item_list.attr({'data-color': account.settings.get('color'), 'data-account': account.get('jid')}).addClass(searched_by).prepend($('<div class="account-indicator ground-color-700"/>'));
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
              this.$('.chats-list-wrap').switchClass('hidden', !this.$('.chats-list').children().length);
              this.$('.pinned-chat-list').switchClass('hidden', query);
              this.$('.contacts-list-wrap').switchClass('hidden', !this.$('.contacts-list').children().length);
              this.$('.messages-list-wrap').addClass('hidden').find('.messages-list').html("");
              if (query.length >= 2) {
                  this.keyup_timeout = setTimeout(() => {
                      this.queryid = uuid();
                      this.searchMessages(query, {query_id: this.queryid});
                  }, 1000);
              }
          },

          searchMessages: function (query, options) {
              this._loading_messages = true;
              this._messages_loaded = false;
              options = options || {};
              !options.max && (options.max = xabber.settings.mam_messages_limit);
              !options.before && (options.before = "");
              xabber.all_searched_messages = new xabber.SearchedMessages();
              let accounts = xabber.accounts.connected;
              accounts.forEach((account) => {
                  account.searched_msgs_loaded = false;
                  options.account = account;
                  this.MAMRequest(query, options, (messages) => {
                      if (!this.query_text)
                          return;
                      _.each(messages, (message) => {
                          if (!this.query_text)
                              return;
                          let message_from_stanza = account.chats.receiveChatMessage(message,
                              _.extend({is_searched: true}, options)
                              ),
                              msg_idx = xabber.all_searched_messages.indexOf(message_from_stanza), $message_item_view;
                              if (!message_from_stanza)
                                  return;
                              else
                                  $message_item_view = new xabber.MessageItemView({model: message_from_stanza});
                          if (msg_idx === 0) {
                              $message_item_view.$el.appendTo(this.$('.messages-list-wrap .messages-list'));
                          } else {
                              $message_item_view.$el.insertBefore(this.$('.messages-list-wrap .message-item').eq(-msg_idx));
                          }
                      });
                      this.$('.messages-list-wrap').switchClass('hidden', !this.$('.messages-list').children().length);
                      this.updateScrollBar();
                      this._loading_messages = false;
                  });
              });
              (accounts.filter(account => account.searched_msgs_loaded).length === accounts.length) && (this._messages_loaded = true);
          },

          MAMRequest: function (query, options, callback, errback) {
              let messages = [],
                  account = options.account,
                  queryid = uuid(),
                  iq = $iq({from: account.get('jid'), type: 'set'})
                      .c('query', {xmlns: Strophe.NS.MAM, queryid: queryid})
                      .c('x', {xmlns: Strophe.NS.DATAFORM, type: 'submit'})
                      .c('field', {'var': 'FORM_TYPE', type: 'hidden'})
                      .c('value').t(Strophe.NS.MAM).up().up()
                      .c('field', {'var': 'withtext'})
                      .c('value').t(query).up().up().up().cnode(new Strophe.RSM(options).toXML()),
                  handler = account.connection.addHandler((message) => {
                      let $msg = $(message);
                      if ($msg.find('result').attr('queryid') === queryid && options.query_id === this.queryid) {
                          messages.push(message);
                      }
                      return true;
                  }, env.Strophe.NS.MAM);
              account.sendIQ(iq,
                  function (res) {
                      account.connection.deleteHandler(handler);
                      let $fin = $(res).find(`fin[xmlns="${Strophe.NS.MAM}"]`);
                      if ($fin.length && $fin.attr('queryid') === queryid) {
                          let rsm_complete = ($fin.attr('complete') === 'true') ? true : false;
                          rsm_complete && (account.searched_msgs_loaded = true);
                      }
                      callback && callback(messages);
                  },
                  function () {
                      account.connection.deleteHandler(handler);
                      errback && errback();
                  }
              );
          },

          clearSearch: function (ev) {
              ev && ev.preventDefault();
              this.$('.search-input').val('');
              this.updateSearch();
              this.onEmptyQuery();
          },

          onEmptyQuery: function () {
              xabber.accounts.forEach(function (account) {
                  account.searched_msgs_loaded = false;
              });
              this.query_text = null;
              this.queryid = null;
              this._messages_loaded = false;
              this._loading_messages = false;
              this.$(this.main_container).removeClass('hidden');
              this.$('.chats-list-wrap').addClass('hidden');
              this.$('.pinned-chat-list').removeClass('hidden');
              this.$('.contacts-list-wrap').addClass('hidden');
              this.$('.messages-list-wrap').addClass('hidden');
          }
      });

      xabber.InputWidget = Backbone.View.extend({
        field_type: 'text',
        template: templates.input_widget,

        events: {
            "click .field-text": "showInput",
            "click .btn-rename": "showInput",
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
            this.$btn = this.$('.btn-rename');
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
            this.updateValue();
        },

        onChangedInputMode: function () {
            let input_mode = this.data.get('input_mode');
            this.$value.hideIf(input_mode);
            this.$btn.hideIf(input_mode);
            this.$input.showIf(input_mode).focus();
        },

        keyDown: function (ev) {
            ev.stopPropagation();
            let value = this.getValue();
            if (ev.keyCode === constants.KEY_ENTER) {
                this.changeValue();
            } else if (ev.keyCode === constants.KEY_ESCAPE) {
                this.$input.removeClass('changed').val(value);
                this.data.set('input_mode', false);
            }
        },

        keyUp: function (ev) {
            let value = this.getValue();
            this.$input.switchClass('changed', this.$input.val() !== value);
        },

        getValue: function () {
            return this.model.get(this.model_field);
        },

        setValue: function (value) {
            this.model.save(this.model_field, value);
        },

        changeValue: function () {
            let value = this.getValue(),
                new_value = this.$input.removeClass('changed').val();
            new_value !== value && this.setValue(new_value);
            this.data.set('input_mode', false);
        },

        updateValue: function () {
            let value = this.getValue();
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
            this.updateBackground();
            this.updateMainColor();
            $('#modals').insertAfter(this.$el);
            xabber.on('update_main_color', this.updateMainColor, this);
        },

        addScreen: function (name, attrs) {
            this.screen_map.set(name, attrs);
        },

        updateMainColor: function () {
            this.$el.attr('data-main-color', xabber.settings.main_color);
            this.$el.siblings('#modals').attr('data-main-color', xabber.settings.main_color);
            $(window.document).find('.login-container').attr('data-main-color', xabber.settings.main_color);
        },

        updateBackground: function () {
            let background_settings = xabber.settings.background || {};
            if (background_settings.image) {
                if (background_settings.type === 'repeating-pattern') {
                    this.$el.css({
                        'background-repeat': 'repeat',
                        'background-size': 'unset',
                        'background-image': `url("${utils.images.getCachedBackground(background_settings.image)}")`
                    });
                } else if (background_settings.type === 'image') {
                    this.$el.css({
                        'background-repeat': 'no-repeat',
                        'background-size': 'cover',
                        'background-image': `url("${utils.images.getCachedBackground(background_settings.image)}")`
                    });
                }
            } else {
                this.$el.css({
                    'background-repeat': 'repeat',
                    'background-size': 'unset',
                    'background-image': `url("${constants.BACKGROUND_IMAGE}")`,
                    'box-shadow': 'none'
                });
            }
            this.updateBoxShadow(xabber.settings.appearance.vignetting);
        },

        updateBoxShadow: function (value) {
            value = Number(value);
            if (!value)
                this.$el.css({
                    'box-shadow': `unset`
                });
            else
                this.$el.css({
                'box-shadow': `${value}px 0 100px 1px rgba(0, 0, 0, 0.7) inset, -${value}px 0 100px -1px rgba(0, 0, 0, 0.7) inset`
            });
        },

        updateBlur: function (value) {
            value = Number(value);
            xabber.blur_overlay.$el.css({
                "backdrop-filter": `blur(${value}px)`,
                "-webkit-backdrop-filter": `blur(${value}px)`
            });
        },

        setScreen: function (name, attrs, options) {
            xabber.notifications_placeholder && xabber.main_panel.$el.addClass('notifications-request');
            $('body').switchClass('xabber-login', name === 'login');
            $('body').switchClass('on-xabber-login', name !== 'login');
            let new_attrs = {stamp: _.uniqueId()};
            if (name && !this.isScreen(name)) {
                new_attrs.name = name;
            }
            this.screen.set(_.extend(new_attrs, attrs), options);
        },

        isScreen: function (name) {
            return this.screen.get('name') === name;
        },

        onScreenMapChanged: function () {
            let name = this.screen.get('name');
            if (_.has(this.screen_map.changed, name)) {
                this.update();
            }
        },

        update: function () {
            let options = this.screen.attributes,
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
            "click .search":                "showSearch",
            "click .archive-chats":         "showArchive",
            "click .mentions":              "showMentions",
            "click .settings":              "showSettings",
            "click .add-variant.contact":   "showAddContactView",
            "click .add-variant.account":   "showAddAccountView",
            "click .add-variant.public-groupchat": "showAddPublicGroupChatView",
            "click .add-variant.incognito-groupchat": "showAddIncognitoGroupChatView",
            "click .about":                 "showAbout"
        },

        _initialize: function () {
            this.$('.add-something').on("change_state", function (ev, state) {
                $(this).switchClass('active', state).find('.mdi')
                        .switchClass('mdi-close', state)
                        .switchClass('mdi-plus', !state);
                if (state) {
                    this.setAttribute('data-title',  this.getAttribute('title'));
                    this.setAttribute('title', "");
                } else {
                    this.setAttribute('title', this.getAttribute('data-title'));
                    this.removeAttribute('data-title');
                }
            });

            xabber.on("update_screen", this.onUpdatedScreen, this);
            this.data.on("change:all_msg_counter", this.onChangedAllMessageCounter, this);
            this.data.on("change:group_msg_counter", this.onChangedGroupMessageCounter, this);
            this.data.on("change:mentions_counter", this.onChangedMentionsCounter, this);
            this.data.on("change:msg_counter", this.onChangedMessageCounter, this);
            this.data.set({msg_counter: 0});
            this.data.set({group_msg_counter: 0});
            this.data.set({all_msg_counter: 0});
            this.data.set({mentions_counter: 0});
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

        updateColor: function (color) {
            this.$('.toolbar-icon').css('color', color);
            this.$('.toolbar-icon path').css('fill', color);
        },

        onUpdatedScreen: function (name) {
            if ((name === 'account_settings') || ((name === 'all-chats') &&
                (this.$('.toolbar-item.all-chats').hasClass('active') ||
                    this.$('.toolbar-item.group-chats').hasClass('active') ||
                    this.$('.toolbar-item.chats').hasClass('active')||
                    this.$('.toolbar-item.account-item').hasClass('active')||
                    this.$('.toolbar-item.archive-chats').hasClass('active')))) {
                return;
            }
            this.$('.toolbar-item').removeClass('active unread');
            if (_.contains(['all-chats', 'contacts', 'mentions',
                            'settings', 'search', 'about'], name)) {
                this.$('.toolbar-item.'+name).addClass('active');
            }
        },

        showAllChats: function (ev) {
            let $el = $(ev.target).closest('.toolbar-item'), is_active = $el.hasClass('active') && !$el.hasClass('unread');
            this.$('.toolbar-item').removeClass('active unread')
                .filter('.all-chats').addClass('active').switchClass('unread', is_active);
            xabber.body.setScreen('all-chats', {right: null});
        },

        showChats: function (ev) {
            let $el = $(ev.target).closest('.toolbar-item'), is_active = $el.hasClass('active') && !$el.hasClass('unread');
            this.$('.toolbar-item').removeClass('active unread')
                .filter('.chats').addClass('active').switchClass('unread', is_active);
            xabber.body.setScreen('all-chats', {right: null});
            xabber.trigger('show_chats');
        },

        showGroupChats: function (ev) {
            let $el = $(ev.target).closest('.toolbar-item'), is_active = $el.hasClass('active') && !$el.hasClass('unread');
            this.$('.toolbar-item').removeClass('active unread')
                .filter('.group-chats').addClass('active').switchClass('unread', is_active);
            xabber.body.setScreen('all-chats', {right: null});
            xabber.trigger('show_group_chats');
        },

        showArchive: function () {
            this.$('.toolbar-item').removeClass('active unread')
                .filter('.archive-chats').addClass('active');
            xabber.body.setScreen('all-chats', {right: null});
            xabber.trigger('show_archive_chats');
        },

        showChatsByAccount: function (account) {
            this.$('.toolbar-item').removeClass('active unread')
                .filter('.account-item[data-jid="' + account.get('jid') + '"]').addClass('active');
            xabber.body.setScreen('all-chats', {right: null});
            xabber.trigger('show_account_chats', [account]);
        },

        showSearch: function () {
            xabber.body.setScreen('search');
        },

        showContacts: function () {
            xabber.body.setScreen('contacts');
        },

        showMentions: function () {
            xabber.body.setScreen('mentions');
        },

        showSettings: function () {
            xabber.body.setScreen('settings');
        },

        showAddContactView: function () {
            xabber.trigger('add_contact', {right: null});
        },

        showAddAccountView: function () {
            xabber.trigger('add_account', {right: null});
        },

        showAddIncognitoGroupChatView: function () {
            xabber.trigger('add_group_chat', {incognito: true, right: null});
        },

        showAddPublicGroupChatView: function () {
            xabber.trigger('add_group_chat', {public: true, right: null});
        },

        showAbout: function () {
            if (!xabber.about_view)
                xabber.about_view = xabber.wide_panel.addChild('about', xabber.AboutView, {model: xabber});
            xabber.body.setScreen('about');
        },

        setAllMessageCounter: function () {
            let count_msg = 0, count_all_msg = 0, count_group_msg = 0, mentions = 0;
            xabber.accounts.each((account) => {
                account.chats.each((chat) => {
                    if (chat.contact && !chat.get('muted')) {
                        count_all_msg += chat.get('unread') + chat.get('const_unread');
                        if (chat.contact.get('group_chat'))
                            count_group_msg += chat.get('unread') + chat.get('const_unread');
                        else
                            count_msg += chat.get('unread') + chat.get('const_unread');
                    }
                });
                mentions += account.unread_mentions.length;
            });
            return { msgs: count_msg, all_msgs: count_all_msg, group_msgs: count_group_msg, mentions: mentions };
        },

        recountAllMessageCounter: function () {
            let unread_messages = this.setAllMessageCounter();
            this.data.set('all_msg_counter', unread_messages.all_msgs);
            this.data.set('msg_counter', unread_messages.msgs);
            this.data.set('group_msg_counter', unread_messages.group_msgs);
            this.data.set('mentions_counter', unread_messages.mentions);
        },

        onChangedMessageCounter: function () {
            let c = this.data.get('msg_counter');
            this.$('.msg-indicator').switchClass('unread', c).text();
        },

        onChangedGroupMessageCounter: function () {
            let c = this.data.get('group_msg_counter');
            this.$('.group-msg-indicator').switchClass('unread', c).text();
        },

        onChangedMentionsCounter: function () {
            let c = this.data.get('mentions_counter');
            this.$('.mentions-indicator').switchClass('unread', c).text();
        },

        onChangedAllMessageCounter: function () {
            let c = this.data.get('all_msg_counter');
            this.$('.all-msg-indicator').switchClass('unread', c).text(c);
        },
    });

    xabber.JingleMessageView = xabber.BasicView.extend({
        className: 'modal main-modal jingle-message-view',
        template: templates.jingle_message_calling,
        avatar_size: constants.AVATAR_SIZES.XABBER_VOICE_CALL_VIEW,

        events: {
            "click": "clickOnWindow",
            "click .btn-accept": "accept",
            "click .btn-share-screen": "shareScreen",
            "click .btn-microphone": "toggleMicrophone",
            "click .btn-video": "videoCall",
            "click .btn-volume": "toggleVolume",
            "click .btn-collapse": "collapse",
            "click .btn-cancel": "cancel",
            "click .btn-full-screen": "setFullScreen"
        },

        _initialize: function (options) {
            this.model = options.model;
            this.model.on('destroy', this.onDestroy, this);
            this.contact = this.model.contact;
            this.account = this.contact.account;
            this.model.on('change:state', this.updateCallingStatus, this);
            this.model.on('change:status', this.updateBackground, this);
            this.model.on('change:volume_on', this.updateButtons, this);
            this.model.on('change:video', this.updateButtons, this);
            this.model.on('change:video_live', this.updateButtons, this);
            this.model.on('change:video_screen', this.updateButtons, this);
            this.model.on('change:video_in', this.updateCollapsedWindow, this);
            this.model.on('change:audio', this.updateButtons, this);
        },

        render: function (options) {
            options = options || {};
            this.updateName();
            this.updateCallingStatus(options.status);
            if (options.status === 'in') {
                this.updateStatusText(xabber.getString("dialog_jingle_message__status_calling"));
            }
            else {
                this.model.set('status', 'calling');
            }
            this.updateAccountJid();
            this.updateButtons();
            this.$el.openModal({
                dismissible: false,
                ready: () => {
                    this.updateAvatar();
                },
                complete: () => {
                    this.$el.detach();
                    this.data.set('visible', false);
                }
            });

        },

        setFullScreen: function () {
            let video = this.$el.find('.webrtc-remote-video')[0],
                local_video = this.$el.find('.webrtc-local-video')[0],
                buttons = this.$el.find('.buttons-panel')[0];
            if (!video)
                return;
            if (video.requestFullScreen) {
                video.requestFullScreen();
                local_video.requestFullScreen();
                buttons.requestFullScreen();
            }
            else if (video.webkitRequestFullScreen) {
                video.webkitRequestFullScreen();
                local_video.webkitRequestFullScreen();
                buttons.webkitRequestFullScreen();
            }
            else if (video.mozRequestFullScreen) {
                video.mozRequestFullScreen();
                local_video.mozRequestFullScreen();
                buttons.mozRequestFullScreen();
            }
            else if (video.msRequestFullScreen) {
                video.msRequestFullScreen();
                local_video.msRequestFullScreen();
                buttons.msRequestFullScreen();
            }
        },

        cancelFullScreen: function () {
            if (document.exitFullscreen) {
                let full_screen_el = document.fullscreenElement;
                full_screen_el && document.exitFullscreen().then(() => {
                    document.fullscreenElement && this.cancelFullScreen();
                });
            } else if (document.mozCancelFullScreen) { /* Firefox */
                let full_screen_el = document.mozFullScreenElement;
                full_screen_el && document.mozCancelFullScreen();
                document.mozFullScreenElement && this.cancelFullScreen();
            } else if (document.webkitExitFullscreen) { /* Chrome, Safari and Opera */
                let full_screen_el = document.webkitCurrentFullScreenElement;
                full_screen_el && document.webkitExitFullscreen();
                document.webkitCurrentFullScreenElement && this.cancelFullScreen();
            } else if (document.msExitFullscreen) { /* IE/Edge */
                let full_screen_el = document.msFullscreenElement;
                full_screen_el && document.msExitFullscreen();
                document.msFullscreenElement && this.cancelFullScreen();
            }
        },

        windowResized: function () {
            this.$el.hasClass('collapsed') && this.$el.css('right', parseInt(xabber.main_panel.$el.css('margin-right')) + 8 + 'px');
        },

        updateButtons: function () {
            this.$('.btn-video .video').switchClass('hidden', !this.model.get('video'));
            this.$('.btn-share-screen').switchClass('active', this.model.get('video_screen'));
            this.$('.btn-full-screen').switchClass('hidden', !this.model.get('video_in'));
            this.$('.btn-video').switchClass('mdi-video active', this.model.get('video_live'))
                .switchClass('mdi-video-off', !this.model.get('video_live'));
            this.$('.btn-volume').switchClass('mdi-volume-high active', this.model.get('volume_on'))
                .switchClass('mdi-volume-off', !this.model.get('volume_on'));
            this.$('.btn-microphone').switchClass('active mdi-microphone', this.model.get('audio'))
                .switchClass('mdi-microphone-off', !this.model.get('audio'));
        },

        updateAvatar: function () {
            let image = this.contact.cached_image;
            this.$('.circle-avatar').setAvatar(image, this.avatar_size);
        },

        updateBackground: function () {
            let status = this.model.get('status');
            this.$el.attr('data-state', status);
        },

        updateCallingStatus: function (status) {
            this.$('.buttons-wrap').switchClass('incoming', (status === 'in'));
        },

        updateStatusText: function (status) {
            this.$('.calling-status').text(status || "");
        },

        updateName: function () {
            this.$('.name').text(this.contact.get('name'));
        },

        updateAccountJid: function () {
            this.$('.modal-footer .contact-info .jid').text(this.contact.get('jid'));
        },

        close: function () {
            this.$el.closeModal({ complete: this.hide.bind(this) });
        },

        shareScreen: function () {
            this.model.set('video_screen', !this.model.get('video_screen'));
        },

        isFullScreen: function () {
            if (document.fullscreenElement)
                return true;
            else if (document.webkitFullscreenElement)
                return true;
            else if (document.mozFullScreenElement)
                return true;
            else return false;
        },

        accept: function () {
            this.model.accept();
            this.updateCallingStatus(constants.JINGLE_MSG_ACCEPT);
            this.model.initSession();
        },

        clickOnWindow: function () {
            (this.$el.hasClass('collapsed') && this.$el.hasClass('collapsed-video')) && this.collapse();
        },

        collapse: function (ev) {
            ev && ev.stopPropagation();
            if (this.isFullScreen()) {
                this.cancelFullScreen();
                return;
            }
            let $overlay = this.$el.closest('#modals').siblings('#' + this.$el.data('overlayId'));
            $overlay.toggle();
            this.$el.toggleClass('collapsed');
            if (this.$el.hasClass('collapsed'))
                this.$el.switchClass('collapsed-video', (this.model.get('video') || this.model.get('video_in')));
            else
                this.$el.css('right', "");
            this.windowResized();
        },

        updateCollapsedWindow: function () {
            this.updateButtons();
            if (this.$el.hasClass('collapsed')) {
                this.$el.switchClass('collapsed-video', (this.model.get('video') || this.model.get('video_in')));
            }
        },

        toggleMicrophone: function () {
            this.model.set('audio', !this.model.get('audio'));
        },

        onDestroy: function () {
            this.updateStatusText(xabber.getString(this.model.get('status') == 'busy' ? "dialog_jingle_message__status_busy" : "dialog_jingle_message__status_disconnected"));
            setTimeout(() => {
                this.close();
                this.$el.detach();
            }, 3000);
        },

        videoCall: function () {
            this.model.set('video_live', !this.model.get('video_live'));
        },

        toggleVolume: function (ev) {
            let $target = $(ev.target);
            $target.switchClass(this.model.set('volume_on', !this.model.get('volume_on')));
        },

        cancel: function () {
            this.model.reject();
            this.close();
        }
    });

    xabber.SettingsView = xabber.BasicView.extend({
        className: 'settings-panel',
        template: templates.settings,
        ps_selector: '.panel-content',

        events: {
            "click .settings-tabs-wrap .settings-tab": "jumpToBlock",
            "click .setting.notifications label": "setNotifications",
            "click .setting.message-preview label": "setMessagePreview",
            "click .setting.call-attention label": "setCallAttention",
            "change .sound input[type=radio][name=sound]": "setSound",
            "change .languages-list input[type=radio][name=language]": "changeLanguage",
            "change #vignetting": "changeVignetting",
            "change #blur": "changeBlur",
            "change #transparency": "changeTransparency",
            "change #blur_switch": "switchBlur",
            "change #vignetting_switch": "switchVignetting",
            "click .selected-color-wrap": "openColorPicker",
            "click .current-main-color-wrap": "openMainColorPicker",
            "change .background input[type=radio][name=background]": "setBackground",
            "change .background input[type=radio][name=side-panel]": "setSidePanelTheme",
            "change #side_panel_blur_switch": "setSidePanelBlur",
            "change #transparency_switch": "switchTransparency",
            "click .current-background-wrap": "changeBackgroundImage",
            "change .hotkeys input[type=radio][name=hotkeys]": "setHotkeys",
            "click .settings-tab.delete-all-accounts": "deleteAllAccounts"
        },

        _initialize: function () {
            this.$('.xabber-info-wrap .version').text(xabber.get('version_number'));
            xabber.on('update_main_color', this.updateMainColor, this);
        },

        render: function () {
            let settings = this.model.attributes,
                lang = settings.language;
            this.$('.notifications input[type=checkbox]').prop({
                checked: settings.notifications && xabber._cache.get('notifications')
            });
            this.$('.message-preview input[type=checkbox]')
                .prop({checked: settings.message_preview});
            this.$('.call-attention input[type=checkbox]')
                .prop({checked: settings.call_attention});
            let sound_value = settings.sound ? settings.sound_on_message : '';
            this.$(`.sound input[type=radio][name=sound][value="${sound_value}"]`)
                    .prop('checked', true);
            this.$(`.hotkeys input[type=radio][name=hotkeys][value=${settings.hotkeys}]`)
                    .prop('checked', true);
            (lang == xabber.get("default_language")) && (lang = 'default');
            this.$(`.languages-list input[type=radio][name=language][value="${lang}"]`)
                .prop('checked', true);
            this.updateDescription();
            this.updateBackgroundSetting();
            this.updateColor();
            this.updateMainColor();
            this.updateSidePanelSetting();
            this.$('.toolbar-main-color-setting-wrap .dropdown-button').dropdown({
                inDuration: 100,
                outDuration: 100,
                belowOrigin: true,
                hover: false
            });
            return this;
        },

        updateMainColor: function () {
            this.$('.toolbar-main-color-setting').attr('data-color', this.model.get('main_color'));
            this.$('.toolbar-main-color-setting .color-name').text(xabber.getString(`account_color_name_${this.model.get('main_color').replace(/-/g, "_")}`).replace(/-/g, " "));
        },

        updateBackgroundSetting: function () {
            this.$(`.background input[type=radio][name=background][value=${this.model.get('background').type}]`)
                .prop('checked', true);
            if (this.model.get('background').image) {
                this.$('.current-background').css('background-image', `url(${utils.images.getCachedBackground(this.model.get('background').image)})`);
            }
            this.$('.current-background-wrap').switchClass('hidden', !this.model.get('background').image);
            let appearance = this.model.get('appearance'),
                blur_switched = appearance.blur !== false,
                vignetting_switched = appearance.vignetting !== false;
            this.$('#blur_switch')[0].checked = blur_switched;
            this.$('.blur-setting .disabled').switchClass('hidden', blur_switched);
            this.$('#blur')[0].value = blur_switched ? appearance.blur : constants.BLUR_VALUE;

            this.$('#vignetting_switch')[0].checked = vignetting_switched;
            this.$('.vignetting-setting .disabled').switchClass('hidden', vignetting_switched);
            this.$('#vignetting')[0].value = vignetting_switched ? appearance.vignetting : constants.VIGNETTING_VALUE;
            this.updateScrollBar();
        },

        updateColor: function () {
            let color = this.model.get('appearance').color || '#E0E0E0';
            this.$('.selected-color-item').css('background-color', color);
            this.$('.selected-color-hex').text(color);
            let material_color = xabber.ColorPicker.prototype.materialColors.find(c => c.variations.find(v => v.hex.toLowerCase() == color.toLowerCase()));
            if (material_color) {
                let tone = material_color.variations.find(v => v.hex.toLowerCase() == color.toLowerCase());
                this.$('.selected-color-name').text(xabber.getString(`account_color_name_${material_color.color.replace(/-/g, "_")}`).replace(/-/g, " ") + ` ${tone.weight}`);
            } else {
                this.$('.selected-color-name').text(xabber.getString("settings__section_appearance__hint_custom_color"));
            }
            xabber.toolbar_view.updateColor(color);
        },

        updateSidePanelSetting: function () {
            let side_panel_settings = this.model.get('side_panel'),
                transparency_switched = side_panel_settings.transparency !== false;
            this.$('#side_panel_blur_switch')[0].checked = side_panel_settings.blur;
            this.$('#transparency_switch')[0].checked = transparency_switched;
            this.$('.transparency-setting .disabled').switchClass('hidden', transparency_switched);
            this.$('#transparency')[0].value = transparency_switched ? side_panel_settings.transparency : constants.TRANSPARENCY_VALUE;
            this.$(`#${this.cid}-${side_panel_settings.theme}-side-panel`)[0].checked = true;
        },

        jumpToBlock: function (ev) {
            let $tab = $(ev.target).closest('.settings-tab'),
                $elem = this.$('.settings-block-wrap.' + $tab.data('block-name'));
            if ($tab.hasClass('link-button')) {
                $tab.parent().siblings().removeClass('active');
                this.scrollTo(0);
                return;
            }
            $tab.addClass('active').siblings().removeClass('active');
            this.scrollToChild($elem);
        },

        setNotifications: function (ev) {
            let value = this.model.get('notifications'),
                $target = $(ev.target);
            ev.preventDefault();
            if (value === null) {
                utils.callback_popup_message(xabber.getString("notifications__toast_notifications_not_supported"), 1500);
            } else {
                value = value && xabber._cache.get('notifications');
                if (!xabber._cache.get('notifications')) {
                    window.Notification.requestPermission((permission) => {
                        xabber._cache.save({'notifications': (permission === 'granted'), 'ignore_notifications_warning': true});
                        xabber.notifications_placeholder && xabber.notifications_placeholder.close();
                        value = (permission === 'granted');
                        this.model.save('notifications', value ? value : this.model.get('notifications'));
                        $target.closest('.setting.notifications').find('input').prop('checked', value);
                    });
                } else {
                    value = !value;
                    this.model.save('notifications', value);
                    $target.closest('.setting.notifications').find('input').prop('checked', value);
                }
            }
        },

        setMessagePreview: function (ev) {
            let value = !this.model.get('message_preview');
            this.model.save('message_preview', value);
            ev.preventDefault();
            $(ev.target).closest('input').prop('checked', value);
        },

        setCallAttention: function (ev) {
            let value = !this.model.get('call_attention');
            this.model.save('call_attention', value);
            ev.preventDefault();
            $(ev.target).closest('input').prop('checked', value);
        },

        setSound: function (ev) {
            let value = ev.target.value;
            if (value) {
                xabber.playAudio(value);
                this.model.save({sound: true, sound_on_message: value});
            } else {
                this.model.save('sound', false);
            }
        },

        setBackground: function (ev) {
            let value = ev.target.value;
            if (value == 'default') {
                this.model.save('background', {type: 'default'});
                xabber.body.updateBackground();
                this.updateBackgroundSetting();
            } else if (value == 'repeating-pattern' || value == 'image') {
                let background_view = new xabber.SetBackgroundView();
                background_view.render({type: value, model: this.model});
            }
        },

        setSidePanelTheme: function (ev) {
            let value = ev.target.value,
                side_panel_settings = this.model.get('side_panel');
            this.model.save('side_panel', _.extend(side_panel_settings, {theme: value}));
            xabber.roster_view.updateTheme(value);
        },

        setSidePanelBlur: function () {
            let value = this.$('#side_panel_blur_switch')[0].checked,
                side_panel_settings = this.model.get('side_panel');
            this.model.save('side_panel', _.extend(side_panel_settings, {blur: value}));
            xabber.roster_view.updateBlur(value);
        },

        changeBackgroundImage: function () {
            let type = this.model.get('background').type;
            if (type == 'repeating-pattern' || type == 'image') {
                let background_view = new xabber.SetBackgroundView();
                background_view.render({type: type, model: this.model});
            }
        },

        openColorPicker: function () {
            if (!this.colorPicker)
                this.colorPicker = new xabber.ColorPicker({model: this.model});
            this.colorPicker.render();
        },

        openMainColorPicker: function () {
            if (!this.mainColorPicker)
                this.mainColorPicker = new xabber.mainColorPicker({model: this.model});
            this.mainColorPicker.render();
        },

        changeBlur: function () {
            let value = this.$('#blur')[0].value,
                appearance = this.model.get('appearance');
            xabber.body.updateBlur(value);
            this.model.save('appearance', _.extend(appearance, {blur: value}));
        },

        switchTransparency: function () {
            let is_switched = this.$('#transparency_switch')[0].checked,
                side_panel_settings = this.model.get('side_panel'),
                value = is_switched ? constants.TRANSPARENCY_VALUE : false;
            this.$('.transparency-setting .disabled').switchClass('hidden', is_switched);
            this.$('#transparency')[0].value = constants.TRANSPARENCY_VALUE;
            this.model.save('side_panel', _.extend(side_panel_settings, {transparency: value}));
            xabber.roster_view.updateTransparency(value);
        },

        changeTransparency: function () {
            let value = this.$('#transparency')[0].value,
                side_panel_settings = this.model.get('side_panel');
            this.model.save('side_panel', _.extend(side_panel_settings, {transparency: value}));
            xabber.roster_view.updateTransparency(value);
        },

        changeVignetting: function () {
            let value = this.$('#vignetting')[0].value,
                appearance = this.model.get('appearance');
            xabber.body.updateBoxShadow(value);
            this.model.save('appearance', _.extend(appearance, {vignetting: value}));
        },

        switchVignetting: function () {
            let is_switched = this.$('#vignetting_switch:checked').length,
                appearance = this.model.get('appearance'),
                value = is_switched ? constants.VIGNETTING_VALUE : false;
            this.$('.vignetting-setting .disabled').switchClass('hidden', is_switched);
            this.$('#vignetting')[0].value = constants.VIGNETTING_VALUE;
            this.model.save('appearance', _.extend(appearance, {vignetting: value}));
            xabber.body.updateBoxShadow(value);
        },

        switchBlur: function () {
            let is_switched = this.$('#blur_switch:checked').length,
                appearance = this.model.get('appearance'),
                value = is_switched ? constants.BLUR_VALUE : false;
            this.$('.blur-setting .disabled').switchClass('hidden', is_switched);
            this.$('#blur')[0].value = constants.BLUR_VALUE;
            this.model.save('appearance', _.extend(appearance, {blur: value}));
            xabber.body.updateBlur(value);
        },

        setHotkeys: function (ev) {
            this.model.save('hotkeys', ev.target.value);
        },

        deleteAllAccounts: function (ev) {
            utils.dialogs.ask(xabber.getString("button_quit"), xabber.getString("settings__dialog_quit_client__confirm", [constants.CLIENT_NAME]), null, { ok_button_text: xabber.getString("button_quit")}).done((res) => {
                res && xabber.trigger('quit');
            });
        },

        changeLanguage: function (ev) {
            let value = ev.target.value;
            utils.dialogs.ask(xabber.getString("settings__dialog_change_language__header"), xabber.getString("settings__dialog_change_language__confirm"), null, { ok_button_text: xabber.getString("settings__dialog_change_language__button_change")}).done((result) => {
                if (result) {
                    this.model.save('language', value);
                    window.location.reload(true);
                } else {
                    this.$(`.languages-list input[type=radio][name=language][value="${this.model.get('language')}"]`)
                        .prop('checked', true);
                }
            });
        },

        updateDescription: function () {
            let lang = window.navigator.language,
                progress = Object.keys(client_translation_progress).find(key => !lang.indexOf(key)) || constants.languages_another_locales[lang] && Object.keys(client_translation_progress).find(key => !constants.languages_another_locales[lang].indexOf(key));
            (lang == 'default' || !lang.indexOf('en')) && (progress = 100);
            if (!_.isUndefined(progress)) {
                let progress_text, platform_text;
                if (progress == 100) {
                    progress_text = xabber.getString("settings__interface_language__text_description_full_translation", [constants.SHORT_CLIENT_NAME, constants.SHORT_CLIENT_NAME]);
                    platform_text = xabber.getString("settings__interface_language__text_description_full_translation_platform",
                        [`<a target="_blank" href='${xabber.getString("settings__section_interface_language__text_description___link")}'>${xabber.getString("settings__section_interface_language__text_description__text_link")}</a>`]);
                } else if (progress == 0) {
                    progress_text = xabber.getString("settings__section_interface_language__text_description_no_translations", [constants.SHORT_CLIENT_NAME, constants.SHORT_CLIENT_NAME]);
                    platform_text = xabber.getString("settings__interface_language__text_description_no_translation_platform",
                            [`<a target="_blank" href='${xabber.getString("settings__section_interface_language__text_description___link")}'>${xabber.getString("settings__section_interface_language__text_description__text_link")}</a>`]);
                } else {
                    progress_text = xabber.getString("settings__interface_language__text_description_unfull_translation", [constants.SHORT_CLIENT_NAME, constants.SHORT_CLIENT_NAME]);
                    platform_text = xabber.getString("settings__section_interface_language__text_description_translation_platform",
                        [`<a target="_blank" href='${xabber.getString("settings__section_interface_language__text_description___link")}'>${xabber.getString("settings__section_interface_language__text_description__text_link")}</a>`, constants.EMAIL_FOR_JOIN_TRANSLATION]);
                }
                this.$('.description').html(`${progress_text}<br><br>${platform_text}`);
            }
        }
    });

    xabber.mainColorPicker = xabber.BasicView.extend({
        className: 'modal main-modal main-color-picker',
        template: templates.color_scheme,
        ps_selector: '.modal-content',
        ps_settings: {theme: 'item-list'},

        events: {
            "click .color-value": "setColor"
        },

        _initialize: function (options) {
            this.model = options.model;
        },

        render: function () {
            this.$el.openModal({
                ready: () => {
                    this.$('.modal-content').css('max-height', Math.min(($(window).height() - 341), 456)).perfectScrollbar({theme: 'item-list'});
                },
                complete: this.close.bind(this)
            });
        },

        setColor: function (ev) {
            let color = $(ev.target).closest('.color-value').attr('data-value');
            this.model.save('main_color', color);
            xabber.trigger('update_main_color');
            this.close();
        },

        close: function () {
            this.$el.closeModal({ complete: () => {
                    this.$el.detach();
                    this.data.set('visible', false);
                }
            });
        }

    });

    xabber.ColorPicker = xabber.BasicView.extend({
        className: 'modal main-modal color-picker',
        materialColors: [
            {
                color: "red",
                variations: [
                    {
                        weight: 50,
                        hex: "#FFEBEE"
                    },
                    {
                        weight: 100,
                        hex: "#FFCDD2"
                    },
                    {
                        weight: 200,
                        hex: "#EF9A9A"
                    },
                    {
                        weight: 300,
                        hex: "#E57373"
                    },
                    {
                        weight: 400,
                        hex: "#EF5350"
                    },
                    {
                        weight: 500,
                        hex: "#F44336"
                    },
                    {
                        weight: 600,
                        hex: "#E53935"
                    },
                    {
                        weight: 700,
                        hex: "#D32F2F"
                    },
                    {
                        weight: 800,
                        hex: "#C62828"
                    },
                    {
                        weight: 900,
                        hex: "#B71C1C"
                    }
                ]
            },
            {
                color: "pink",
                variations: [
                    {
                        weight: 50,
                        hex: "#FCE4EC"
                    },
                    {
                        weight: 100,
                        hex: "#F8BBD0"
                    },
                    {
                        weight: 200,
                        hex: "#F48FB1"
                    },
                    {
                        weight: 300,
                        hex: "#F06292"
                    },
                    {
                        weight: 400,
                        hex: "#EC407A"
                    },
                    {
                        weight: 500,
                        hex: "#E91E63"
                    },
                    {
                        weight: 600,
                        hex: "#D81B60"
                    },
                    {
                        weight: 700,
                        hex: "#C2185B"
                    },
                    {
                        weight: 800,
                        hex: "#AD1457"
                    },
                    {
                        weight: 900,
                        hex: "#880E4F"
                    }
                ]
            },
            {
                color: "purple",
                variations: [
                    {
                        weight: 50,
                        hex: "#F3E5F5"
                    },
                    {
                        weight: 100,
                        hex: "#E1BEE7"
                    },
                    {
                        weight: 200,
                        hex: "#CE93D8"
                    },
                    {
                        weight: 300,
                        hex: "#BA68C8"
                    },
                    {
                        weight: 400,
                        hex: "#AB47BC"
                    },
                    {
                        weight: 500,
                        hex: "#9C27B0"
                    },
                    {
                        weight: 600,
                        hex: "#8E24AA"
                    },
                    {
                        weight: 700,
                        hex: "#7B1FA2"
                    },
                    {
                        weight: 800,
                        hex: "#6A1B9A"
                    },
                    {
                        weight: 900,
                        hex: "#4A148C"
                    }
                ]
            },
            {
                color: "deep-purple",
                variations: [
                    {
                        weight: 50,
                        hex: "#EDE7F6"
                    },
                    {
                        weight: 100,
                        hex: "#D1C4E9"
                    },
                    {
                        weight: 200,
                        hex: "#B39DDB"
                    },
                    {
                        weight: 300,
                        hex: "#9575CD"
                    },
                    {
                        weight: 400,
                        hex: "#7E57C2"
                    },
                    {
                        weight: 500,
                        hex: "#673AB7"
                    },
                    {
                        weight: 600,
                        hex: "#5E35B1"
                    },
                    {
                        weight: 700,
                        hex: "#512DA8"
                    },
                    {
                        weight: 800,
                        hex: "#4527A0"
                    },
                    {
                        weight: 900,
                        hex: "#311B92"
                    }
                ]
            },
            {
                color: "indigo",
                variations: [
                    {
                        weight: 50,
                        hex: "#E8EAF6"
                    },
                    {
                        weight: 100,
                        hex: "#C5CAE9"
                    },
                    {
                        weight: 200,
                        hex: "#9FA8DA"
                    },
                    {
                        weight: 300,
                        hex: "#7986CB"
                    },
                    {
                        weight: 400,
                        hex: "#5C6BC0"
                    },
                    {
                        weight: 500,
                        hex: "#3F51B5"
                    },
                    {
                        weight: 600,
                        hex: "#3949AB"
                    },
                    {
                        weight: 700,
                        hex: "#303F9F"
                    },
                    {
                        weight: 800,
                        hex: "#283593"
                    },
                    {
                        weight: 900,
                        hex: "#1A237E"
                    }
                ]
            },
            {
                color: "blue",
                variations: [
                    {
                        weight: 50,
                        hex: "#E3F2FD"
                    },
                    {
                        weight: 100,
                        hex: "#BBDEFB"
                    },
                    {
                        weight: 200,
                        hex: "#90CAF9"
                    },
                    {
                        weight: 300,
                        hex: "#64B5F6"
                    },
                    {
                        weight: 400,
                        hex: "#42A5F5"
                    },
                    {
                        weight: 500,
                        hex: "#2196F3"
                    },
                    {
                        weight: 600,
                        hex: "#1E88E5"
                    },
                    {
                        weight: 700,
                        hex: "#1976D2"
                    },
                    {
                        weight: 800,
                        hex: "#1565C0"
                    },
                    {
                        weight: 900,
                        hex: "#0D47A1"
                    }
                ]
            },
            {
                color: "light-blue",
                variations: [
                    {
                        weight: 50,
                        hex: "#E1F5FE"
                    },
                    {
                        weight: 100,
                        hex: "#B3E5FC"
                    },
                    {
                        weight: 200,
                        hex: "#81D4FA"
                    },
                    {
                        weight: 300,
                        hex: "#4FC3F7"
                    },
                    {
                        weight: 400,
                        hex: "#29B6F6"
                    },
                    {
                        weight: 500,
                        hex: "#03A9F4"
                    },
                    {
                        weight: 600,
                        hex: "#039BE5"
                    },
                    {
                        weight: 700,
                        hex: "#0288D1"
                    },
                    {
                        weight: 800,
                        hex: "#0277BD"
                    },
                    {
                        weight: 900,
                        hex: "#01579B"
                    }
                ]
            },
            {
                color: "cyan",
                variations: [
                    {
                        weight: 50,
                        hex: "#E0F7FA"
                    },
                    {
                        weight: 100,
                        hex: "#B2EBF2"
                    },
                    {
                        weight: 200,
                        hex: "#80DEEA"
                    },
                    {
                        weight: 300,
                        hex: "#4DD0E1"
                    },
                    {
                        weight: 400,
                        hex: "#26C6DA"
                    },
                    {
                        weight: 500,
                        hex: "#00BCD4"
                    },
                    {
                        weight: 600,
                        hex: "#00ACC1"
                    },
                    {
                        weight: 700,
                        hex: "#0097A7"
                    },
                    {
                        weight: 800,
                        hex: "#00838F"
                    },
                    {
                        weight: 900,
                        hex: "#006064"
                    }
                ]
            },
            {
                color: "teal",
                variations: [
                    {
                        weight: 50,
                        hex: "#E0F2F1"
                    },
                    {
                        weight: 100,
                        hex: "#B2DFDB"
                    },
                    {
                        weight: 200,
                        hex: "#80CBC4"
                    },
                    {
                        weight: 300,
                        hex: "#4DB6AC"
                    },
                    {
                        weight: 400,
                        hex: "#26A69A"
                    },
                    {
                        weight: 500,
                        hex: "#009688"
                    },
                    {
                        weight: 600,
                        hex: "#00897B"
                    },
                    {
                        weight: 700,
                        hex: "#00796B"
                    },
                    {
                        weight: 800,
                        hex: "#00695C"
                    },
                    {
                        weight: 900,
                        hex: "#004D40"
                    }
                ]
            },
            {
                color: "green",
                variations: [
                    {
                        weight: 50,
                        hex: "#E8F5E9"
                    },
                    {
                        weight: 100,
                        hex: "#C8E6C9"
                    },
                    {
                        weight: 200,
                        hex: "#A5D6A7"
                    },
                    {
                        weight: 300,
                        hex: "#81C784"
                    },
                    {
                        weight: 400,
                        hex: "#66BB6A"
                    },
                    {
                        weight: 500,
                        hex: "#4CAF50"
                    },
                    {
                        weight: 600,
                        hex: "#43A047"
                    },
                    {
                        weight: 700,
                        hex: "#388E3C"
                    },
                    {
                        weight: 800,
                        hex: "#2E7D32"
                    },
                    {
                        weight: 900,
                        hex: "#1B5E20"
                    }
                ]
            },
            {
                color: "light-green",
                variations: [
                    {
                        weight: 50,
                        hex: "#F1F8E9"
                    },
                    {
                        weight: 100,
                        hex: "#DCEDC8"
                    },
                    {
                        weight: 200,
                        hex: "#C5E1A5"
                    },
                    {
                        weight: 300,
                        hex: "#AED581"
                    },
                    {
                        weight: 400,
                        hex: "#9CCC65"
                    },
                    {
                        weight: 500,
                        hex: "#8BC34A"
                    },
                    {
                        weight: 600,
                        hex: "#7CB342"
                    },
                    {
                        weight: 700,
                        hex: "#689F38"
                    },
                    {
                        weight: 800,
                        hex: "#558B2F"
                    },
                    {
                        weight: 900,
                        hex: "#33691E"
                    }
                ]
            },
            {
                color: "lime",
                variations: [
                    {
                        weight: 50,
                        hex: "#F9FBE7"
                    },
                    {
                        weight: 100,
                        hex: "#F0F4C3"
                    },
                    {
                        weight: 200,
                        hex: "#E6EE9C"
                    },
                    {
                        weight: 300,
                        hex: "#DCE775"
                    },
                    {
                        weight: 400,
                        hex: "#D4E157"
                    },
                    {
                        weight: 500,
                        hex: "#CDDC39"
                    },
                    {
                        weight: 600,
                        hex: "#C0CA33"
                    },
                    {
                        weight: 700,
                        hex: "#AFB42B"
                    },
                    {
                        weight: 800,
                        hex: "#9E9D24"
                    },
                    {
                        weight: 900,
                        hex: "#827717"
                    }
                ]
            },
            {
                color: "yellow",
                variations: [
                    {
                        weight: 50,
                        hex: "#FFFDE7"
                    },
                    {
                        weight: 100,
                        hex: "#FFF9C4"
                    },
                    {
                        weight: 200,
                        hex: "#FFF59D"
                    },
                    {
                        weight: 300,
                        hex: "#FFF176"
                    },
                    {
                        weight: 400,
                        hex: "#FFEE58"
                    },
                    {
                        weight: 500,
                        hex: "#FFEB3B"
                    },
                    {
                        weight: 600,
                        hex: "#FDD835"
                    },
                    {
                        weight: 700,
                        hex: "#FBC02D"
                    },
                    {
                        weight: 800,
                        hex: "#F9A825"
                    },
                    {
                        weight: 900,
                        hex: "#F57F17"
                    }
                ]
            },
            {
                color: "amber",
                variations: [
                    {
                        weight: 50,
                        hex: "#FFF8E1"
                    },
                    {
                        weight: 100,
                        hex: "#FFECB3"
                    },
                    {
                        weight: 200,
                        hex: "#FFE082"
                    },
                    {
                        weight: 300,
                        hex: "#FFD54F"
                    },
                    {
                        weight: 400,
                        hex: "#FFCA28"
                    },
                    {
                        weight: 500,
                        hex: "#FFC107"
                    },
                    {
                        weight: 600,
                        hex: "#FFB300"
                    },
                    {
                        weight: 700,
                        hex: "#FFA000"
                    },
                    {
                        weight: 800,
                        hex: "#FF8F00"
                    },
                    {
                        weight: 900,
                        hex: "#FF6F00"
                    }
                ]
            },
            {
                color: "orange",
                variations: [
                    {
                        weight: 50,
                        hex: "#FFF3E0"
                    },
                    {
                        weight: 100,
                        hex: "#FFE0B2"
                    },
                    {
                        weight: 200,
                        hex: "#FFCC80"
                    },
                    {
                        weight: 300,
                        hex: "#FFB74D"
                    },
                    {
                        weight: 400,
                        hex: "#FFA726"
                    },
                    {
                        weight: 500,
                        hex: "#FF9800"
                    },
                    {
                        weight: 600,
                        hex: "#FB8C00"
                    },
                    {
                        weight: 700,
                        hex: "#F57C00"
                    },
                    {
                        weight: 800,
                        hex: "#EF6C00"
                    },
                    {
                        weight: 900,
                        hex: "#E65100"
                    }
                ]
            },
            {
                color: "deep-orange",
                variations: [
                    {
                        weight: 50,
                        hex: "#FBE9E7"
                    },
                    {
                        weight: 100,
                        hex: "#FFCCBC"
                    },
                    {
                        weight: 200,
                        hex: "#FFAB91"
                    },
                    {
                        weight: 300,
                        hex: "#FF8A65"
                    },
                    {
                        weight: 400,
                        hex: "#FF7043"
                    },
                    {
                        weight: 500,
                        hex: "#FF5722"
                    },
                    {
                        weight: 600,
                        hex: "#F4511E"
                    },
                    {
                        weight: 700,
                        hex: "#E64A19"
                    },
                    {
                        weight: 800,
                        hex: "#D84315"
                    },
                    {
                        weight: 900,
                        hex: "#BF360C"
                    }
                ]
            },
            {
                color: "brown",
                variations: [
                    {
                        weight: 50,
                        hex: "#EFEBE9"
                    },
                    {
                        weight: 100,
                        hex: "#D7CCC8"
                    },
                    {
                        weight: 200,
                        hex: "#BCAAA4"
                    },
                    {
                        weight: 300,
                        hex: "#A1887F"
                    },
                    {
                        weight: 400,
                        hex: "#8D6E63"
                    },
                    {
                        weight: 500,
                        hex: "#795548"
                    },
                    {
                        weight: 600,
                        hex: "#6D4C41"
                    },
                    {
                        weight: 700,
                        hex: "#5D4037"
                    },
                    {
                        weight: 800,
                        hex: "#4E342E"
                    },
                    {
                        weight: 900,
                        hex: "#3E2723"
                    }
                ]
            },
            {
                color: "grey",
                variations: [
                    {
                        weight: 50,
                        hex: "#FAFAFA"
                    },
                    {
                        weight: 100,
                        hex: "#F5F5F5"
                    },
                    {
                        weight: 200,
                        hex: "#EEEEEE"
                    },
                    {
                        weight: 300,
                        hex: "#E0E0E0"
                    },
                    {
                        weight: 400,
                        hex: "#BDBDBD"
                    },
                    {
                        weight: 500,
                        hex: "#9E9E9E"
                    },
                    {
                        weight: 600,
                        hex: "#757575"
                    },
                    {
                        weight: 700,
                        hex: "#616161"
                    },
                    {
                        weight: 800,
                        hex: "#424242"
                    },
                    {
                        weight: 900,
                        hex: "#212121"
                    }
                ]
            },
            {
                color: "blue-grey",
                variations: [
                    {
                        weight: 50,
                        hex: "#ECEFF1"
                    },
                    {
                        weight: 100,
                        hex: "#CFD8DC"
                    },
                    {
                        weight: 200,
                        hex: "#B0BEC5"
                    },
                    {
                        weight: 300,
                        hex: "#90A4AE"
                    },
                    {
                        weight: 400,
                        hex: "#78909C"
                    },
                    {
                        weight: 500,
                        hex: "#607D8B"
                    },
                    {
                        weight: 600,
                        hex: "#546E7A"
                    },
                    {
                        weight: 700,
                        hex: "#455A64"
                    },
                    {
                        weight: 800,
                        hex: "#37474F"
                    },
                    {
                        weight: 900,
                        hex: "#263238"
                    }
                ]
            }
        ],

        ps_selector: '.material-color-picker-wrap',
        events: {
            "click .color-palette-item": "selectColor",
            "click .selected-color-hex": "updateInputField",
            "focusout .selected-color-hex-input": "focusoutInputField",
            "keyup .selected-color-hex-input": "keyUpInput",
            "click .btn-set": "setColor"
        },

        _initialize(options) {
            this.model = options.model;
            this.$el.html(templates.color_picker({materialColors: this.materialColors}));
        },

        render: function () {
            this.$el.openModal({
                ready: () => {
                    let $input = this.$('.selected-color-hex-input'),
                        $color_hex = this.$('.selected-color-hex'),
                        value = this.model.get('appearance').color || '#E0E0E0';
                    let material_color = this.materialColors.find(c => c.variations.find(v => v.hex.toLowerCase() == value.toLowerCase()));
                    if (material_color) {
                        let tone = material_color.variations.find(v => v.hex.toLowerCase() == value.toLowerCase());
                        this.$('.selected-color-name').text(xabber.getString(`account_color_name_${material_color.color.replace(/-/g, "_")}`).replace(/-/g, " ") + ` ${tone.weight}`);
                    } else {
                        this.$('.selected-color-name').text(xabber.getString("settings__section_appearance__hint_custom_color"));
                    }
                    if (value) {
                        this.$('.selected-color-wrap').removeClass('hidden');
                        $input.addClass('hidden');
                        $color_hex.removeClass('hidden').text(value);
                        value && this.$('.selected-color-item').css('background-color', value);
                    }
                },
                complete: this.close.bind(this)
            });

        },

        updateInputField: function () {
            let $input = this.$('.selected-color-hex-input'),
                $color_hex = this.$('.selected-color-hex');
            $input.removeClass('hidden');
            $input[0].value = $color_hex.text();
            $color_hex.addClass('hidden');
        },

        keyUpInput: function (ev) {
            if (ev.keyCode == constants.KEY_ENTER) {
                ev.preventDefault();
                this.focusoutInputField();
            }
            let $input = this.$('.selected-color-hex-input'),
                value = $input[0].value.trim();
            this.$('.selected-color-item').css('background-color', value);
            let material_color = this.materialColors.find(c => c.variations.find(v => v.hex.toLowerCase() == value.toLowerCase()));
            if (material_color) {
                let tone = material_color.variations.find(v => v.hex.toLowerCase() == value.toLowerCase());
                this.$('.selected-color-name').text(xabber.getString(`account_color_name_${material_color.color.replace(/-/g, "_")}`).replace(/-/g, " ") + ` ${tone.weight}`);
            } else {
                this.$('.selected-color-name').text(xabber.getString("settings__section_appearance__hint_custom_color"));
            }
        },

        focusoutInputField: function () {
            let $input = this.$('.selected-color-hex-input'),
                $color_hex = this.$('.selected-color-hex'),
                value = $input[0].value.trim();
            let material_color = this.materialColors.find(c => c.variations.find(v => v.hex.toLowerCase() == value.toLowerCase()));
            if (material_color) {
                let tone = material_color.variations.find(v => v.hex.toLowerCase() == value.toLowerCase());
                this.$('.selected-color-name').text(xabber.getString(`account_color_name_${material_color.color.replace(/-/g, "_")}`).replace(/-/g, " ") + ` ${tone.weight}`);
            } else {
                this.$('.selected-color-name').text(xabber.getString("settings__section_appearance__hint_custom_color"));
            }
            $input.addClass('hidden');
            $color_hex.removeClass('hidden').text(value);
            this.$('.selected-color-item').css('background-color', value);
        },

        selectColor: function (ev) {
            let $target = $(ev.target),
                hex = $target.attr('data-hex'),
                color_name = $target.closest('.color-palette-wrapper').attr('data-color-name').replace(/-/g, "_"),
                weight = $target.attr('data-weight');
            this.$('.selected-color-wrap').removeClass('hidden');
            this.$('.selected-color-item').css('background-color', hex);
            this.$('.selected-color-name').text(xabber.getString(`account_color_name_${color_name}`).replace(/-/g, " ").replace(/-/g, " ") + ` ${weight}`);
            this.$('.selected-color-hex').text(hex);
            let $input = this.$('.selected-color-hex-input'),
                $color_hex = this.$('.selected-color-hex');
            $input.addClass('hidden');
            $color_hex.removeClass('hidden');
        },

        setColor: function () {
            this.close();
            let appearance = this.model.get('appearance');
            this.model.save('appearance', _.extend(appearance, {color: this.$('.selected-color-hex').text()}));

        },

        close: function () {
            this.$el.closeModal({ complete: () => {
                    this.$el.detach();
                    this.data.set('visible', false);
                    xabber.settings_view.updateColor();
                }
            });
        }

    });

    xabber.SetBackgroundView = xabber.BasicView.extend({
        className: 'modal main-modal settings-background background-panel',
        template: templates.backgrounds_gallery,
        ps_selector: '.modal-content',
        ps_settings: {theme: 'item-list'},

        events: {
            "click .menu-btn": "updateActiveMenu",
            "click .library-wrap .image-item": "setActiveImage",
            'change input[type="file"]': "onFileInputChanged",
            'keyup input.url': "onInputChanged",
            "click .btn-add": "addBackground",
            "click .btn-cancel": "close"
        },

        _initialize: function () {
            this.$('input.url')[0].onpaste = this.onPaste.bind(this);
            this.ps_container.on("ps-scroll-y", this.onScrollY.bind(this));
        },

        render: function (options) {
            this.model = options.model;
            this.type = options.type;
            this.createLibrary();
            this.$('.menu-btn').removeClass('active');
            this.$('.menu-btn[data-screen-name="library"]').addClass('active');
            if (this.type == 'repeating-pattern')
                this.$('.modal-header span').text(xabber.getString("settings__dialog_background__header_pattern"));
            else
                this.$('.modal-header span').text(xabber.getString("settings__dialog_background__header_image"));
            this.$el.openModal({
                ready: () => {
                    this.$('.modal-content').css('max-height', Math.min(($(window).height() - 341), 456)).perfectScrollbar({theme: 'item-list'});
                },
                complete: this.close.bind(this)
            });
            let draggable = this.$('.upload-wrap');
            draggable[0].ondragenter = function (ev) {
                ev.preventDefault();
                draggable.addClass('file-drop');
            };
            draggable[0].ondragover = function (ev) {
                ev.preventDefault();
            };
            draggable[0].ondragleave = function (ev) {
                if ($(ev.relatedTarget).closest('.upload-wrap').length)
                    return;
                ev.preventDefault();
                draggable.removeClass('file-drop');
            };
            draggable[0].ondrop = (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                draggable.removeClass('file-drop');
                let files = ev.dataTransfer.files || [], file;
                for (let i = 0; i < files.length; i++) {
                    if (utils.isImageType(files[i].type)) {
                        file = files[i];
                        break;
                    }
                }
                file && this.addFile(file);
            };
        },

        onScrollY: function () {
            if (this.$('.screen-wrap:not(.hidden)').attr('data-screen') === 'library' && this.getScrollBottom() < 5) {
                this.loadMoreImages();
            }
        },

        getImagesFromXML: function (callback) {
            if (this.type == 'repeating-pattern' && this.model.patterns_library || this.type == 'images' && this.model.img_library) {
                callback && callback();
                return;
            }
            let request = {
                type: "GET",
                contentType: "application/xml",
                dataType: 'xml',
                success: (data) => {
                    if (this.type == 'repeating-pattern') {
                        this.onGetPatternsCallback(data);
                    } else {
                        this.onGetImagesCallback(data);
                    }
                    callback && callback();
                }
            };
            if (this.type == 'repeating-pattern') {
                request.url = './background-patterns.xml';
            } else {
                request.url = './background-images.xml';
            }
            $.ajax(request);
        },

        onGetPatternsCallback: function (data) {
            let images = [];
            $(data).find('image').each((idx, img) => {
                images.push({thumbnail: $(img).text()});
            });
            this.model.patterns_library = images;
        },

        onGetImagesCallback: function (data) {
            let images = [];
            $(data).find('image').each((idx, img) => {
                let $img = $(img),
                    thumbnail = $img.children('thumbnail').text(),
                    fs_img = $img.children('fullscreen-image').text();
                images.push({thumbnail, fs_img});
            });
            this.model.img_library = images;
        },

        onPaste: function (ev) {
            let url = ev.clipboardData.getData('text').trim();
            this.$('.image-preview img')[0].onload = () => {
                this.$('.image-preview img').removeClass('hidden');
                this.updateActiveButton();
            };
            this.$('.image-preview img').addClass('hidden')[0].src = url;
            this.updateActiveButton();
        },

        updateActiveMenu: function (ev) {
            let screen_name = ev.target.getAttribute('data-screen-name');
            this.$('.menu-btn').removeClass('active');
            this.$(`.menu-btn[data-screen-name="${screen_name}"]`).addClass('active');
            this.updateScreen(screen_name);
        },

        updateScreen: function (name) {
            this.$('.screen-wrap').addClass('hidden');
            this.$(`.screen-wrap[data-screen="${name}"]`).removeClass('hidden');
            this.scrollToTop();
            this.updateActiveButton();
        },

        updateActiveButton: function () {
            let $active_screen = this.$('.screen-wrap:not(.hidden)'),
                non_active = true;
            if ($active_screen.attr('data-screen') == 'library') {
                $active_screen.find('div.active').length && (non_active = false);
            } else {
                $active_screen.find('img:not(.hidden)').length && (non_active = false);
            }
            this.$('.modal-footer .btn-add').switchClass('non-active', non_active);
        },

        createLibrary: function () {
            this.getImagesFromXML(() => {
                this.loadMoreImages(40);
            });
        },

        loadMoreImages: function (count) {
            !count && (count = 20);
            let current_count = this.$(`.image-item`).length;
            if (this.type == 'repeating-pattern' && current_count >= this.model.patterns_library.length || this.type == 'images' && current_count >= this.model.img_library.length)
                return;
            for (let i = current_count; i < (current_count + count); i++) {
                let img = $(`<div class="image-item"/>`),
                    img_sources = this.type == 'repeating-pattern' ? this.model.patterns_library[i] : this.model.img_library[i];
                if (!img_sources)
                    break;
                img.css('background-image', `url("${img_sources.thumbnail}")`);
                img.attr('data-src', this.type == 'repeating-pattern' ? img_sources.thumbnail : img_sources.fs_img);
                this.$('.library-wrap').append(img);
            }
        },

        setActiveImage: function (ev) {
            let $target = $(ev.target);
            if ($target.hasClass('active'))
                $target.removeClass('active');
            else {
                this.$('.library-wrap>div').removeClass('active');
                $target.addClass('active');
            }
            this.updateActiveButton();
        },

        onFileInputChanged: function (ev) {
            let target = ev.target, file;
            for (let i = 0; i < target.files.length; i++) {
                if (utils.isImageType(target.files[i].type)) {
                    file = target.files[i];
                    break;
                }
            }
            file && this.addFile(file);
            $(target).val('');
        },

        addFile: function (file) {
            let reader = new FileReader();
            reader.onload = (e) => {
                let image_prev = new Image(),
                    src = e.target.result;
                image_prev.src = src;
                this.$('.screen-wrap[data-screen="upload"] img').detach();
                this.$('.screen-wrap[data-screen="upload"]').prepend(image_prev);
                this.updateActiveButton();
            };
            reader.readAsDataURL(file);
        },

        onInputChanged: function (ev) {
            if (ev.target.value.trim() == this.$('.image-preview img')[0].src)
                return;
            if (ev.target.value.trim() && ev.keyCode !== constants.KEY_CTRL && ev.keyCode !== constants.KEY_SHIFT && ev.keyCode !== constants.KEY_ARROW_UP && ev.keyCode !== constants.KEY_ARROW_DOWN && ev.keyCode !== constants.KEY_ARROW_RIGHT && ev.keyCode !== constants.KEY_ARROW_LEFT) {
                let url = ev.target.value.trim();
                this.$('.image-preview img')[0].onload = () => {
                    this.$('.image-preview img').removeClass('hidden');
                    this.updateActiveButton();
                };
                this.$('.image-preview img').addClass('hidden')[0].src = url;
                this.updateActiveButton();
            } else {
                this.$('.image-preview img').addClass('hidden')[0].src = "";
                this.updateActiveButton();
            }
        },

        addBackground: function () {
            if (this.$('.btn-add').hasClass('non-active'))
                return;
            let image, dfd = new $.Deferred(), $active_screen = this.$('.screen-wrap:not(.hidden)');
            dfd.done((img) => {
                if (img) {
                    this.model.save('background', {type: this.type, image: img});
                }
                else {
                    this.model.save('background', {type: 'default'});
                }
                xabber.body.updateBackground();
                this.close();
            });
            if ($active_screen.attr('data-screen') == 'library') {
                image = $active_screen.find('div.active').attr('data-src');
                dfd.resolve(image);
            } else {
                image = $active_screen.find('img:not(.hidden)')[0].src;
                if ($active_screen.attr('data-screen') == 'web-address') {
                    let request = {
                        type: "GET",
                        url: image,
                        headers: {"Access-Control-Allow-Origin": "*"},
                        dataType: 'blob',
                        success: function (data) {
                            image = data;
                            dfd.resolve(image);
                        },
                        error: () => {
                            dfd.resolve(image);
                        }
                    };
                    $.ajax(request);
                } else
                    dfd.resolve(image);
            }
        },

        close: function () {
            xabber.settings_view.updateBackgroundSetting();
            this.$el.closeModal({ complete: () => {
                    this.$el.detach();
                    this.data.set('visible', false);
                }
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
            let draghandle_elem = ev.target.closest('.drag-handle'),
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
            let avatar = this.get('avatar');
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
                let coords = this.getCoords(avatar);
                this.set({
                    shiftX: this.get('downX') - coords.left,
                    shiftY: this.get('downY') - coords.top
                });
                this.startDrag(ev);
            }
            avatar.style.left = ev.pageX - this.get('shiftX') + 'px';
            avatar.style.top = ev.pageY - this.get('shiftY') + 'px';
            let drop_elem = this.findDropElem(ev);
            this.updateDropElem(drop_elem);
            return;
        },

        onMouseUp: function (ev) {
            let selector = document.querySelector('.recording');
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
            let box = elem.getBoundingClientRect();
            return {
                top: box.top + window.pageYOffset,
                left: box.left + window.pageXOffset
            };
        },

        createAvatar: function () {
            let avatar = this.get('elem'),
                $avatar = $(avatar),
                draghandle_elem = this.get('draghandle_elem');
            let old = {
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
            let avatar = this.get('avatar');
            window.document.body.appendChild(avatar);
            avatar.style.zIndex = 9999;
            avatar.style.position = 'absolute';
        },

        finishDrag: function (ev) {
            let elem = this.get('elem'),
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
            let avatar = this.get('avatar');
            avatar.hidden = true;
            let elem = window.document.elementFromPoint(ev.clientX, ev.clientY);
            avatar.hidden = false;
            if (!elem) {
                return null;
            }
            return elem.closest('.droppable');
        },

        updateDropElem: function (drop_elem) {
            let old_drop_elem = this.get('drop_elem');
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
            if (this._blink_interval)
                return;
            this._blink_interval = setInterval(() => {
                let $icon = $("link[rel='shortcut icon']"), url;
                if ($icon.attr('href').indexOf(this.cache.favicon) > -1 || $icon.attr('href').indexOf(constants.FAVICON_DEFAULT) > -1)
                    url = this.cache.favicon_message || constants.FAVICON_MESSAGE;
                else
                    url = this.cache.favicon || constants.FAVICON_DEFAULT;
                $icon.attr('href', url);
            }, 1000);
        },

        stopBlinkingFavicon: function () {
            if (this._blink_interval) {
                clearInterval(this._blink_interval);
                this._blink_interval = null;
                let url = this.cache.favicon || constants.FAVICON_DEFAULT;
                $("link[rel='shortcut icon']").attr("href", url);
            }
        },

        onChangedAllMessageCounter: function () {
            if (this.get('all_msg_counter')) {
                this.startBlinkingFavicon();
                window.document.title = xabber.getString("notofications__desktop_notification__text", [this.get('all_msg_counter')]);
            } else {
                this.stopBlinkingFavicon();
                window.document.title = constants.CLIENT_NAME;
            }
        },

        setAllMessageCounter: function () {
            let count_msg = 0;
            xabber.accounts.each((account) => {
                account.chats.each((chat) => {
                    if (chat.contact && !chat.get('muted'))
                        count_msg += chat.get('unread') + chat.get('const_unread');
                });
            });
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
            utils.openWindow(url, () => {
                utils.dialogs.error(xabber.getString("notifications__error__text_could_not_open_new_tab"));
            });
        },

        popupNotification: function (params) {
            let notification = new window.Notification(params.title, {
                body: params.text,
                icon: params.icon
            });
            setTimeout(notification.close.bind(notification), 5000);
            return notification;
        },

        playAudio: function (name, loop) {
            loop = loop || false;
            let filename = constants.SOUNDS[name];
            if (filename) {
                let audio = new window.Audio(filename);
                audio.loop = loop;
                audio.play();
                return audio;
            }
            return;
        },

        stopAudio: function (audio) {
            if (audio) {
                audio.pause();
                audio.remove();
            }
        },

        registerDOMEvents: function () {
            let self = this;

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

            window.document.body.ondragover = (ev) => {
                ev.preventDefault();
            };

            window.document.body.ondrop = (ev) => {
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
            classlist: 'login-page-wrap', el: $(document).find('.login-container')[0]});

        this.toolbar_view = this.body.addChild('toolbar', this.ToolbarView);
        this.settings.appearance.color && this.toolbar_view.updateColor(this.settings.appearance.color);

        this.blur_overlay = this.body.addChild('blur_overlay', this.NodeView, {
            classlist: 'blur-overlay'});

        this.main_panel = this.body.addChild('main', this.NodeView, {
            classlist: 'main-wrap'});
        this.body.updateBlur(this.settings.appearance.blur);
        this.left_panel = this.main_panel.addChild(
            'left', this.NodeView, {classlist: 'panel-wrap left-panel-wrap'});
        this.right_panel = this.main_panel.addChild(
            'right', this.NodeView, {classlist: 'panel-wrap right-panel-wrap'});
        this.wide_panel = this.main_panel.addChild(
            'wide', this.NodeView, {classlist: 'panel-wrap wide-panel-wrap'});
        this.placeholders_wrap = this.main_panel.addChild('placeholders', this.NodeView, {classlist: 'wide-placeholders-wrap'});
        this.settings_view = this.wide_panel.addChild(
            'settings', this.SettingsView, {model: this._settings});
    }, xabber);

    return xabber;
  };
});
