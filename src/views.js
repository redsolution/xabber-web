define("xabber-views", function () {
  return function (xabber) {
    var env = xabber.env,
        constants = env.constants,
        templates = env.templates.base,
        utils = env.utils,
        uuid = env.uuid,
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
                options.soft ? view.detach() : (view.trigger("remove") && view.remove());
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
            var scrollHeight = this.ps_container[0].scrollHeight,
                offsetHeight = this.ps_container[0].offsetHeight;
            this.scrollTo(scrollHeight - offsetHeight);
        },

        scrollToChild: function ($child) {
            var scrollTop = _.reduce($child.prevAll(), function (sum, el) {
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
                    if (name !== 'login')
                        this.$el.append(view.$el);
                    this.$el.switchClass('hidden', name === 'login');
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
            var $selection = this.$('.list-item[data-id="'+id+'"]');
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
                var query = this.$('.search-input').val();
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
                  accounts.forEach(function (account) {
                      let first_message = xabber.all_searched_messages.find(message => (message.account.get('jid') === account.get('jid')));
                      if (!first_message || account.searched_msgs_loaded) {
                          // this._loading_messages = false;
                          return;
                      }
                      options.account = account;
                      options.before = first_message.get('archive_id');
                      this.MAMRequest(this.query_text, options, function (messages) {
                          _.each(messages, function (message) {
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
                          }.bind(this));
                          this.$('.messages-list-wrap').switchClass('hidden', !this.$('.messages-list').children().length);
                          this.updateScrollBar();
                          this._loading_messages = false;
                      }.bind(this));
                  }.bind(this));
                  (accounts.filter(account => account.searched_msgs_loaded).length === accounts.length) && (this._messages_loaded = true);
              }
          },

          onScroll: function () {},

          keyUpOnSearchWithQuery: function (ev) {
              ev.stopPropagation();
              this.ids = this.$('.searched-lists-wrap .list-item:not(.hidden)').map(function () {
                  return $(this).data('id');
              }).toArray();
              var $selection = this.getSelectedItemWithQuery();
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
              var $selection = this.$('.searched-lists-wrap .list-item[data-id="'+id+'"]');
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
              query_chats.sort('timestamp').forEach(function (chat) {
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
                              this.updateChatItem(chat_item);
                              chat_item.click(function () {
                                  this.$('.list-item.active').removeClass('active');
                                  xabber.chats_view.openChat(chat.item_view, {screen: xabber.body.screen.get('name')});
                                  chat_item.addClass('active');
                              }.bind(this));
                          }
                      }
                  }
              }.bind(this));
              xabber.accounts.each(function (account) {
                  account.contacts.each(function (contact) {
                      let jid = contact.get('jid').toLowerCase(),
                          name = contact.get('roster_name') || contact.get('name'),
                          chat = account.chats.get(contact.hash_id),
                          chat_id = chat && chat.id;
                      name && (name = name.toLowerCase());
                      if (!chat_id || chat_id && !this.$('.chat-item[data-id="' + chat_id + '"]').length)
                          if (name.indexOf(query) > -1 || jid.indexOf(query) > -1) {
                              let searched_by = name.indexOf(query) > -1 ? 'by-name' : 'by-jid',
                                  item_list = xabber.contacts_view.$('.account-roster-wrap[data-jid="' + account.get('jid') + '"] .list-item[data-jid="' + jid + '"]').first().clone().data('account-jid', account.get('jid'));
                              item_list.attr({'data-color': account.settings.get('color'), 'data-account': account.get('jid')}).addClass(searched_by).prepend($('<div class="account-indicator ground-color-700"/>'));
                              if (searched_by === 'by-name')
                                  this.$('.contacts-list').prepend(item_list);
                              else if (this.$('.contacts-list .by-jid').length)
                                  item_list.insertBefore(this.$('.contacts-list .by-jid').first());
                              else
                                  this.$('.contacts-list').append(item_list);
                              item_list.click(function () {
                                  this.$('.list-item.active').removeClass('active');
                                  let chat = account.chats.getChat(contact);
                                  chat && xabber.chats_view.openChat(chat.item_view, {clear_search: false, screen: xabber.body.screen.get('name')});
                                  item_list.addClass('active');
                              }.bind(this));
                          }
                  }.bind(this));
              }.bind(this));
              this.$('.chats-list-wrap').switchClass('hidden', !this.$('.chats-list').children().length);
              this.$('.contacts-list-wrap').switchClass('hidden', !this.$('.contacts-list').children().length);
              this.$('.messages-list-wrap').addClass('hidden').find('.messages-list').html("");
              if (query.length >= 2) {
                  this.keyup_timeout = setTimeout(function () {
                      this.queryid = uuid();
                      this.searchMessages(query, {query_id: this.queryid});
                  }.bind(this), 1000);
              }
          },

          updateChatItem: function (chat_item) {
              /*var date_width = chat_item.find('.last-msg-date').width();
              chat_item.find('.chat-title-wrap').css('padding-right', date_width + 5);
              var title_width = chat_item.find('.chat-title-wrap').width();
              chat_item.find('.chat-title').css('max-width', title_width);*/
          },

          searchMessages: function (query, options) {
              this._loading_messages = true;
              this._messages_loaded = false;
              options = options || {};
              !options.max && (options.max = xabber.settings.mam_messages_limit);
              !options.before && (options.before = "");
              xabber.all_searched_messages = new xabber.SearchedMessages();
              let accounts = xabber.accounts.connected;
              accounts.forEach(function (account) {
                  account.searched_msgs_loaded = false;
                  options.account = account;
                  this.MAMRequest(query, options, function (messages) {
                      if (!this.query_text)
                          return;
                      _.each(messages, function (message) {
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
                      }.bind(this));
                      this.$('.messages-list-wrap').switchClass('hidden', !this.$('.messages-list').children().length);
                      this.updateScrollBar();
                      this._loading_messages = false;
                  }.bind(this));
              }.bind(this));
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
                  handler = account.connection.addHandler(function (message) {
                      let $msg = $(message);
                      if ($msg.find('result').attr('queryid') === queryid && options.query_id === this.queryid) {
                          messages.push(message);
                      }
                      return true;
                  }.bind(this), env.Strophe.NS.MAM);
              account.sendIQ(iq,
                  function (res) {
                      account.connection.deleteHandler(handler);
                      var $fin = $(res).find('fin[xmlns="'+Strophe.NS.MAM+'"]');
                      if ($fin.length && $fin.attr('queryid') === queryid) {
                          var rsm_complete = ($fin.attr('complete') === 'true') ? true : false;
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
            var input_mode = this.data.get('input_mode');
            this.$value.hideIf(input_mode);
            this.$btn.hideIf(input_mode);
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
            $('#modals').insertAfter(this.$el);
        },

        addScreen: function (name, attrs) {
            this.screen_map.set(name, attrs);
        },

        setScreen: function (name, attrs, options) {
            xabber.notifications_placeholder && xabber.right_panel.$el.addClass('notifications-request');
            $('body').switchClass('xabber-login', name === 'login');
            $('body').switchClass('on-xabber-login', name !== 'login');
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
            this.data.on("change:add_menu_state", this.onChangedAddMenuState, this);
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

        onUpdatedScreen: function (name) {
            xabber.notifications_placeholder && xabber.right_panel.$el.append(xabber.notifications_placeholder.$el);
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
            var count_msg = 0, count_all_msg = 0, count_group_msg = 0, mentions = 0;
            xabber.accounts.each(function(account) {
                account.chats.each(function (chat) {
                    if (chat.contact && !chat.contact.get('muted')) { // if ($chat.contact.get('archived') && $chat.contact.get('muted'))
                        count_all_msg += chat.get('unread') + chat.get('const_unread');
                        if (chat.contact.get('group_chat'))
                            count_group_msg += chat.get('unread') + chat.get('const_unread');
                        else
                            count_msg += chat.get('unread') + chat.get('const_unread');
                    }
                }.bind(this));
                mentions += account.unreaded_mentions.length;
            }.bind(this));
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
            var c = this.data.get('msg_counter');
            this.$('.msg-indicator').switchClass('unread', c).text();
        },

        onChangedGroupMessageCounter: function () {
            var c = this.data.get('group_msg_counter');
            this.$('.group-msg-indicator').switchClass('unread', c).text();
        },

        onChangedMentionsCounter: function () {
            var c = this.data.get('mentions_counter');
            this.$('.mentions-indicator').switchClass('unread', c).text();
        },

        onChangedAllMessageCounter: function () {
            var c = this.data.get('all_msg_counter');
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
                this.updateStatusText('Calling...');
            }
            else {
                this.model.set('status', 'calling');
            }
            this.updateAccountJid();
            this.updateButtons();
            this.$el.openModal({
                dismissible: false,
                ready: function () {
                    this.updateAvatar();
                }.bind(this),
                complete: function () {
                    this.$el.detach();
                    this.data.set('visible', false);
                }.bind(this)
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
                full_screen_el && document.exitFullscreen().then(function () {
                    document.fullscreenElement && this.cancelFullScreen();
                }.bind(this));
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
            this.updateStatusText(this.model.get('status') == 'busy' ? "Line busy" : "Disconnected");
            setTimeout(function () {
                this.close();
                this.$el.detach();
            }.bind(this), 3000);
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
            "mousedown .setting.notifications label": "setNotifications",
            "mousedown .setting.message-preview label": "setMessagePreview",
            "mousedown .setting.call-attention label": "setCallAttention",
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
            this.$('.call-attention input[type=checkbox]')
                .prop({checked: settings.call_attention});
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
            if ($tab.hasClass('link-button')) {
                $tab.parent().siblings().removeClass('active');
                this.scrollTo(0);
                return;
            }
            $tab.addClass('active').siblings().removeClass('active');
            this.scrollToChild($elem);
        },

        setNotifications: function (ev) {
            let value = this.model.get('notifications');
            if (value === null) {
                utils.callback_popup_message("Browser doesn't support notifications", 1500);
            } else
                value = !value;
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

        setCallAttention: function (ev) {
            var value = !this.model.get('call_attention');
            this.model.save('call_attention', value);
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
            utils.dialogs.ask("Quit Xabber Web", "Do you really want to quit Xabber? You will quit from all currently logged in XMPP accounts.", null, { ok_button_text: 'quit'}).done(function (res) {
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
            if (this._blink_interval)
                return;
            this._blink_interval = setInterval(function () {
                var $icon = $("link[rel='shortcut icon']"), url;
                if ($icon.attr('href').indexOf(this.cache.favicon) > -1 || $icon.attr('href').indexOf(constants.FAVICON_DEFAULT) > -1)
                    url = this.cache.favicon_message || constants.FAVICON_MESSAGE;
                else
                    url = this.cache.favicon || constants.FAVICON_DEFAULT;
                $icon.attr('href', url);
            }.bind(this), 1000);
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
                window.document.title = "Messages (" + this.get('all_msg_counter') + ")";
            } else {
                this.stopBlinkingFavicon();
                window.document.title = 'Xabber Web';
            }
        },

        setAllMessageCounter: function () {
            let count_msg = 0;
            xabber.accounts.each(function(account) {
                account.chats.each(function (chat) {
                    if (chat.contact && !chat.contact.get('muted'))
                        count_msg += chat.get('unread') + chat.get('const_unread');
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

        playAudio: function (name, loop) {
            loop = loop || false;
            var filename = constants.SOUNDS[name];
            if (filename) {
                var audio = new window.Audio(filename);
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
            classlist: 'login-page-wrap', el: $(document).find('.login-container')[0]});

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
    }, xabber);

    return xabber;
  };
});
