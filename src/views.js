import xabber from "xabber-core";
import { transliterate as query_transliterate } from 'transliteration';

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
        if (!this.template){
            console.error(this);
            console.log(this.template);
        }
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

    scrollToChildPlus: function ($child, plus_scroll) {
        let scrollTop = _.reduce($child.prevAll(), function (sum, el) {
            return sum + el.offsetHeight + 2;
        }, 0);
        plus_scroll = plus_scroll || 0;

        this.scrollTo(scrollTop + plus_scroll);
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
        return (scrollHeight - (scrollTop + offsetHeight)) < 10;
    },

    destroyView: function() {
        this.data.set('removed', true);
        // COMPLETELY UNBIND THE VIEW
        this.undelegateEvents();
        this.$el.removeData().unbind();
        // Remove view from DOM
        this.remove();
        Backbone.View.prototype.remove.call(this);
    }
});

xabber.NodeView = xabber.BasicView.extend({
    onShow: function (options, tree) {
        if ((xabber.body.data.get('contact_details_view') && (this.vname === 'right_contact'))){
            xabber.body.data.get('contact_details_view').scrollTo(xabber.body.data.get('contact_details_view').data.get('scroll_top'));
            xabber.body.data.set('contact_details_view', null)
            return;
        }
        if (options.close_settings && this.children.main_overlay){
            this.children.main_overlay.hide();
            this.children.main_overlay.$el.detach();
            return;
        }
        if (!(tree && tree.main_overlay)){
            _.each(this.children, function (view) {
                view.hide();
            });
        }
        if (!(tree && tree.main_overlay))
            this.$el.children().detach();
        tree = this.patchTree(tree, options) || tree;
        _.each(this.children, (view, name) => {
            if (tree.main_overlay && (name != 'main_overlay'))
                return;
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
        if (_.isNull(path)){
            this.$el.addClass('hidden');
            return;
        } else {
            this.$el.removeClass('hidden');
        }
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
        if (ev.keyCode === constants.KEY_ESCAPE && !xabber.body.screen.get('right_contact')) {
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
      events: {
          "keydown .search-input": "keyUpOnSearch",
          "focusout .search-input": "clearSearchSelection",
          "click .close-search-icon": "clearSearch",
          "click .list-item": "onClickItem",
          "click .btn-search-messages": "updateSearchWithMessages"
      },

      updateSearchWithMessages: function (ev) {
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
          else if (ev.keyCode === constants.KEY_ENTER){
              this.search_messages = true;
          }
          if (ev.keyCode === constants.KEY_ESCAPE && !xabber.body.screen.get('right_contact')) {
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
          this.$('.messages-list-wrap .messages-list').html(env.templates.contacts.preloader());
          options = options || {};
          !options.max && (options.max = xabber.settings.mam_messages_limit);
          !options.before && (options.before = "");
          xabber.all_searched_messages = new xabber.SearchedMessages();
          let accounts = xabber.accounts.connected;
          accounts.forEach((account) => {
              account.searched_msgs_loaded = false;
              options.account = account;
              this.MAMRequest(query, options, (messages) => {
                  this.$('.messages-list-wrap .messages-list').html('');
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
              iq = $iq({type: 'set'})
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
          account.sendIQFast(iq,
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
        } else if (ev.keyCode === constants.KEY_ESCAPE && !xabber.body.screen.get('right_contact')) {
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
        $(constants.CONTAINER_ELEMENT).append(this.$el);
        this.updateBackground();
        this.updateMainColor();
        this.updateAvatarShape();
        $('#modals').insertAfter(this.$el);
        xabber.on('update_main_color', this.updateMainColor, this);
        xabber.on('update_avatar_shape', this.updateAvatarShape, this);
    },

    addScreen: function (name, attrs) {
        this.screen_map.set(name, attrs);
    },

    updateMainColor: function () {
        this.$el.attr('data-main-color', xabber.settings.main_color);
        this.$el.siblings('#modals').attr('data-main-color', xabber.settings.main_color);
        $(window.document).find('.login-container').attr('data-main-color', xabber.settings.main_color);
    },

    updateAvatarShape: function () {
        let shape = xabber.settings.avatar_shape;
        $(constants.CONTAINER_ELEMENT).switchClass('non-circle-avatars', shape != 'circle');
        $(constants.CONTAINER_ELEMENT).switchClass('octagon-avatars', shape === 'octagon');
        $(constants.CONTAINER_ELEMENT).switchClass('hexagon-avatars', shape === 'hexagon');
        $(constants.CONTAINER_ELEMENT).switchClass('pentagon-avatars', shape === 'pentagon');
        $(constants.CONTAINER_ELEMENT).switchClass('rounded-avatars', shape === 'rounded');
        $(constants.CONTAINER_ELEMENT).switchClass('star-avatars', shape === 'star');
        $(constants.CONTAINER_ELEMENT).switchClass('squircle-avatars', shape === 'squircle');
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
        xabber.error(name);
        options = options || {};
        $(window).unbind("keydown.contact_panel");
        xabber.notifications_placeholder && xabber.main_panel.$el.addClass('notifications-request');
        $(constants.CONTAINER_ELEMENT).switchClass('xabber-login', name === 'login');
        $(constants.CONTAINER_ELEMENT).switchClass('on-xabber-login', name !== 'login');
        let new_attrs = {stamp: _.uniqueId()};
        if (name && !this.isScreen(name)) {
            new_attrs.name = name;
        }
        if (!attrs || !attrs.show_placeholder) {
            new_attrs.show_placeholder = null;
        }
        if ((attrs && attrs.right && attrs.right === 'group_invitation') || options.right_force_close)
            new_attrs.right_contact = null;
        else {
            new_attrs.right_contact = xabber.body.screen.get('right_contact');
        }
        if ((!attrs && xabber.body.screen.get('right'))
            || (attrs && !attrs.right && attrs.right !== null && xabber.body.screen.get('right')))
            new_attrs.right = xabber.body.screen.get('right');
        new_attrs = _.extend(new_attrs, attrs);
        let chat_item_view;
        if (_.isUndefined(new_attrs.chat_item)){
            chat_item_view = this.screen.get('chat_item');
            if (chat_item_view && chat_item_view.content)
                chat_item_view.content._prev_scrolltop = chat_item_view.content.getScrollTop() || chat_item_view.content._scrolltop;
        }
        if (name){
            let tree = this.screen_map.get(name);
            if (tree && tree.main_overlay){
                if (!this.screen.get('previous_screen'))
                    new_attrs.previous_screen = {...this.screen.attributes};
            } else {
                new_attrs.previous_screen = undefined;
            }
        }
        (!attrs || !attrs.notifications) && (new_attrs.notifications = false);
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

    showChatPlaceholder: function () {
        try {
            xabber.right_panel.$el.children().detach();
            xabber.right_panel.$el.append(xabber.chat_placeholder.$el);
        } catch (e) {
            console.log(e)
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
    template: templates.toolbar,

    events: {
        "click .toolbar-logo":             "clickAllChats",
        "click .all-chats":             "showAllChats",
        "click .contacts":              "showContacts",
        "click .archive-chats":         "showArchive",
        "click .saved-chats":           "showSavedChats",
        "click .mentions":              "showNotifications",
        "click .settings":              "showSettings",
        "click .settings-modal":              "showSettingsModal",
        "click .jingle-calls":              "showPlaceholder",
        "click .geolocation-chats":              "showPlaceholder",
        "click .add-variant.contact":   "showAddContactView",
        "click .add-variant.account":   "showAddAccountView",
        "click .add-variant.public-groupchat": "showAddPublicGroupChatView",
        "click .add-variant.incognito-groupchat": "showAddIncognitoGroupChatView",
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
        this.$('.add-variant.account').hideIf(!constants.LOGIN_CUSTOM_DOMAIN && !constants.LOGIN_DOMAINS.length);
    },

    updateColor: function (color) {
    },

    onUpdatedScreen: function (name) {
        if (name === 'account_settings_modal' || name === 'settings-modal'){
            return;
        }
        if ((name === 'all-chats') &&
            (this.$('.toolbar-item:not(.toolbar-logo).all-chats').hasClass('active') ||
                this.$('.toolbar-item:not(.toolbar-logo).chats').hasClass('active')||
                this.$('.toolbar-item:not(.toolbar-logo).saved-chats').hasClass('active')||
                this.$('.toolbar-item:not(.toolbar-logo).archive-chats').hasClass('active'))) {
            return;
        }
        this.$('.toolbar-item:not(.toolbar-logo):not(.account-item)').removeClass('active unread');
        if (name === 'notifications'){
            this.$('.toolbar-item:not(.toolbar-logo).mentions').addClass('active');
            return;
        }
        if (_.contains(['all-chats', 'contacts',
                        'settings', 'settings-modal', 'search', 'jingle-calls', 'geolocation-chats', 'about'], name)) {
            this.$('.toolbar-item:not(.toolbar-logo).'+name).addClass('active');
        }
    },

    clickAllChats: function (ev) {
        this.$('.all-chats').click();
    },

    showAllChats: function (ev, no_unread) {
        let $el;
        if (ev && ev.target)
            $el = $(ev.target).closest('.toolbar-item:not(.toolbar-logo)');
        else
            $el = this.$('.all-chats');
        let is_active = $el.hasClass('active') && !$el.hasClass('unread');
        this.$('.toolbar-item:not(.account-item):not(.toolbar-logo)').removeClass('active unread')
            .filter('.all-chats').addClass('active').switchClass('unread', is_active);
        let options = {}
        no_unread && (options.no_unread = no_unread);
        xabber.body.setScreen('all-chats', options);
        xabber.trigger('show_all_chats', no_unread);
        xabber.trigger('update_placeholder');
    },

    showArchive: function (ev, no_unread) {
        this.$('.toolbar-item:not(.account-item):not(.toolbar-logo)').removeClass('active unread')
            .filter('.archive-chats').addClass('active');
        xabber.body.setScreen('all-chats',);
        xabber.trigger('show_archive_chats', no_unread);
        xabber.trigger('update_placeholder');
    },

    showSavedChats: function (ev, no_unread) {
        if (xabber.accounts.enabled.length === 1){
            if (!xabber.accounts.enabled[0].server_features.get(Strophe.NS.XABBER_FAVORITES)) {
                return;
            }
            let saved_chat = xabber.accounts.enabled[0].chats.getSavedChat();
            saved_chat.item_view && saved_chat.item_view.open({right_contact_save: true, clear_search: false, scroll_to_chat: true});
            this.$('.active').removeClass('active');
            this.$('.saved-chats').addClass('active');
            saved_chat.once("change:active", () => {
                xabber.toolbar_view.$('.toolbar-item:not(.toolbar-logo):not(.account-item)').removeClass('active unread');
                xabber.toolbar_view.$('.toolbar-item:not(.toolbar-logo).'+xabber.body.screen.get('name')).addClass('active');
            });
        } else {
            this.$('.toolbar-item:not(.account-item):not(.toolbar-logo)').removeClass('active unread')
                .filter('.saved-chats').addClass('active');
            xabber.body.setScreen('all-chats',);
            xabber.trigger('show_saved_chats', no_unread);
            xabber.trigger('update_placeholder');
        }
    },

    showNotifications: function (ev, no_unread) {
        try {
            let chat = xabber.chats.filter(item => item.account.server_features.get(Strophe.NS.XABBER_NOTIFY) && item.get('jid') === item.account.server_features.get(Strophe.NS.XABBER_NOTIFY).get('from') && item.get('notifications'));

            if (!xabber.accounts.enabled.length || !xabber.accounts.connected.length || !chat.length)
                return;
            this.$('.toolbar-item:not(.account-item):not(.toolbar-logo)').removeClass('active unread')
                .filter('.mentions').addClass('active')

            xabber.body.setScreen('notifications', {right: 'notifications', notifications: xabber.notifications_view}); //34
            xabber.notifications_view && xabber.notifications_view.onShowNotificationsTab();
        } catch (e) {
            console.error(e);
        }
    },

    showChatsByAccount: function (account) {
        if (this.data.get('account_filtering') === account.get('jid'))
            this.data.set('account_filtering', null);
        else
            this.data.set('account_filtering', account.get('jid'));
        if (this.$('.toolbar-item:not(.toolbar-logo).all-chats').hasClass('active')) {
            this.showAllChats(null, true);
            return;
        }
        if (this.$('.toolbar-item:not(.toolbar-logo).archive-chats').hasClass('active')) {
            this.showArchive(null, true);
            return;
        }
        if (this.$('.toolbar-item:not(.toolbar-logo).saved-chats').hasClass('active')) {
            this.showSavedChats(null, true);
            return;
        }
        if (this.$('.toolbar-item:not(.toolbar-logo).mentions').hasClass('active')) {
            this.showNotifications(null, true);
            return;
        }
        if (this.$('.toolbar-item:not(.toolbar-logo).jingle-calls').hasClass('active') ||
            this.$('.toolbar-item:not(.toolbar-logo).geolocation-chats').hasClass('active')){
            this.showAllChats(null, true);
            return;
        }
    },

    showContacts: function () {
        xabber.body.setScreen('contacts', {right_contact: null});
        xabber.trigger('update_placeholder');
    },

    showMentions: function () {
        xabber.body.setScreen('mentions');
        xabber.trigger('update_placeholder');
    },

    showSettings: function () {
        xabber.body.setScreen('settings-modal', {account_block_name: null});
        xabber.trigger('update_placeholder');
    },

    showSettingsModal: function () {
        xabber.body.setScreen('settings-modal', {account_block_name: null});
        xabber.trigger('update_placeholder');
    },

    showPlaceholder: function (ev) {
        if (xabber.chats_view && xabber.chats_view.active_chat){
            xabber.chats_view.active_chat.model.trigger('hide_chat');
            xabber.chats_view.active_chat = null;
        }
        xabber.body.setScreen('all-chats', {chat_item: null});
        let $el = $(ev.target).closest('.toolbar-item:not(.toolbar-logo)');
        this.$('.toolbar-item:not(.toolbar-logo):not(.account-item)').removeClass('active unread');
        $el.addClass('active');
        xabber.trigger('update_placeholder');
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

    setAllMessageCounter: function () {
        let count_msg = 0, count_all_msg = 0, count_group_msg = 0, mentions = 0;
        xabber.accounts.each((account) => {
            account.chats.each((chat) => {
                if (chat.contact && !chat.isMuted()) {
                    if (chat.get('unread') || chat.get('const_unread')){
                        xabber.error(chat);
                    }
                    if (chat.get('notifications')){
                        mentions += chat.get('unread') + chat.get('const_unread');
                    } else {
                        count_all_msg += chat.get('unread') + chat.get('const_unread');
                        if (chat.contact.get('group_chat'))
                            count_group_msg += chat.get('unread') + chat.get('const_unread');
                        else
                            count_msg += chat.get('unread') + chat.get('const_unread');
                    }
                }
            });
            let incoming_subscriptions = account.contacts.filter(item => (item.get('invitation') && !item.get('removed')) || (item.get('subscription_request_in') && item.get('subscription') != 'both')).length;
            count_all_msg += incoming_subscriptions;
            if (account.omemo && account.omemo.xabber_trust){
                let trust = account.omemo.xabber_trust,
                    active_trust_sessions = trust.get('active_trust_sessions');
                mentions += Object.keys(active_trust_sessions).length;
            }
        });
        return { msgs: count_msg, all_msgs: count_all_msg, group_msgs: count_group_msg, mentions: mentions };
    },

    recountAllMessageCounter: function () {
        let unread_messages = this.setAllMessageCounter();
        this.data.set('all_msg_counter', unread_messages.all_msgs);
        this.data.set('msg_counter', unread_messages.msgs);
        this.data.set('group_msg_counter', unread_messages.group_msgs);
        this.data.set('mentions_counter', unread_messages.mentions);
        xabber.recountAllMessageCounter();
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
        if (c >= 100)
            c = '99+';
        this.$('.mentions-indicator').switchClass('unread', c).text(c);
    },

    onChangedAllMessageCounter: function () {
        let c = this.data.get('all_msg_counter');
        if (c >= 100)
            c = '99+';
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
        this.model.on('change:video_live', this.updateButtons, this);
        this.model.on('change:video_screen', this.updateButtons, this);
        this.model.on('change:video_in', this.updateCollapsedWindow, this);
        this.model.on('change:video', this.updateCollapsedWindow, this);
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
                this.pos1 = 0;
                this.pos2 = 0;
                this.pos3 = 0;
                this.pos4 = 0;
                this.$('.collapsed-movable').mousedown((e) => {
                    e = e || window.event;
                    e.preventDefault();
                    // get the mouse cursor position at startup:
                    this.pos3 = e.clientX;
                    this.pos4 = e.clientY;
                    let didDrag = false;
                    document.onmouseup = (e) => {
                        document.onmouseup = null;
                        document.onmousemove = null;
                        if (!didDrag)
                            this.collapse();
                    };
                    // call a function whenever the cursor moves:
                    document.onmousemove = (e) => {
                        e = e || window.event;
                        e.preventDefault();
                        // calculate the new cursor position:
                        this.pos1 = this.pos3 - e.clientX;
                        this.pos2 = this.pos4 - e.clientY;
                        this.pos3 = e.clientX;
                        this.pos4 = e.clientY;
                        // set the element's new position:
                        this.$el.css('top', (this.$el.offset().top - this.pos2) + "px");
                        this.$el.css('left', (this.$el.offset().left - this.pos1) + "px");
                        this.$el.css('transform', "none");
                        this.$el.css('right', "unset");
                        didDrag = true;
                    };
                });
            },
            complete: () => {
                this.$el.detach();
                this.data.set('visible', false);
            }
        });

    },

    setFullScreen: function () {
        if (document.fullscreenElement) {
            document.exitFullscreen();
        } else if(this.$el.length) {
            this.$el[0].requestFullscreen();
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

    clickOnWindow: function (ev) {
        if ($(ev.target).closest('.collapsed-movable').length)
            return;
        if ($(ev.target).closest('.video-wrap').length && this.$el.hasClass('collapsed') && this.$el.hasClass('collapsed-video'))
            this.collapse();
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
        if (this.$el.hasClass('collapsed')) {
            this.$el.switchClass('collapsed-video', (this.model.get('video') || this.model.get('video_in')));
            this.$el.switchClass('multiple-videos', this.model.get('video') && this.model.get('video_in'));
        }
        else {
            this.$el.css('right', "");
            this.$el.css('left', "");
            this.$el.css('width', "");
            this.$el.css('height', "");
            this.$el.removeClass('collapsed-video');
        }
        this.windowResized();
    },

    updateCollapsedWindow: function () {
        this.updateButtons();
        if (this.$el.hasClass('collapsed')) {
            this.$el.switchClass('collapsed-video', (this.model.get('video') || this.model.get('video_in')));
            this.$el.switchClass('multiple-videos', this.model.get('video') && this.model.get('video_in'));
        }
    },

    toggleMicrophone: function () {
        this.model.set('audio', !this.model.get('audio'));
    },

    onDestroy: function (status) {
        let status_text;
        if (this.model.get('status') == 'device_busy')
            status_text = 'dialog_jingle_message__status_device_busy';
        else if (this.model.get('status') == 'busy')
            status_text = 'dialog_jingle_message__status_busy';
        else if (this.model.get('status') == 'accepted_another_device')
            status_text = 'dialog_jingle_message__status_another_device_accepted';
        else
            status_text = 'dialog_jingle_message__status_disconnected';
        this.updateStatusText(xabber.getString(status_text));
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

xabber.PlyrPlayerPopupView = xabber.BasicView.extend({
    className: 'modal main-modal player-overlay plyr-player-popup-view',
    template: templates.plyr_player_popup,

    events: {
        "click .mdi-close": "closePopup",
        "click .mdi-minimize-float": "floatPopup",
        "click .mdi-minimize-full": "fullPopup",
        "click .mdi-plyr-hide": "hidePopup",
        "click .btn-next-plyr": "nextPlyr",
        "click .btn-previous-plyr": "previousPlyr",
        "click .mdi-open-message": "openMessage",
        "click .mdi-toggle-play": "togglePlay",
        "click .mdi-toggle-mute": "toggleMute",
    },

    _initialize: function (options) {
        this.data.set('visibility_state', 0);
        this.data.on('change:visibility_state', this.onVisibilityChange, this);
        xabber.on('plyr_player_updated', this.updatePlyrControls, this);
    },

    render: function (options) {
        options = options || {};
        this.$el.openModal({
            dismissible: false,
            ready: () => {
                if (!this.player){
                    this.player = new Plyr('.plyr-player-popup', {
                        controls: [
                            'play-large', 'play', 'progress', 'duration', 'mute', 'volume', 'settings', 'download', 'fullscreen',
                        ],
                        youtube: {controls: 0, disablekb: 1, iv_load_policy: 3, modestbranding: 1, rel: 0, showinfo: 0}
                    });
                    this.player.on('play',(event) => {
                        let other_players = xabber.plyr_players.filter(other => other != this.player);
                        other_players.forEach(function(other) {
                            if (other.$audio_elem){
                                if (other.$audio_elem.voice_message)
                                    other.$audio_elem.voice_message.stopTime();
                            }
                        })
                        xabber.trigger('plyr_player_updated');
                    });
                    this.player.on('pause',(event) => {
                        xabber.trigger('plyr_player_updated');
                    });
                    this.player.on('timeupdate',(event) => {
                        xabber.trigger('plyr_player_time_updated');
                    });
                    this.player.on('volumechange',(event) => {
                        xabber.trigger('plyr_player_updated');
                    });
                    this.player.on('statechange',(event) => {
                        if (event.detail.code === 3) {
                            this.$('.plyr-player-popup-draggable').removeClass('hidden');
                            this.$('.plyr-player-popup-draggable').css({
                                width: '',
                                height: '',
                            });
                        }
                        xabber.trigger('plyr_player_updated');
                    });
                }
                this.$el.closest('#modals').siblings('#' + this.$el.data('overlayId')).mousedown(() => {this.minimizePopup()});
                this.showNewVideo(options);
                this.onVisibilityChange();
                this.updatePlyrControls();
                this.pos1 = 0;
                this.pos2 = 0;
                this.pos3 = 0;
                this.pos4 = 0;
                this.$('.plyr-player-min-controls-tab').mousedown((e) => {
                    e = e || window.event;
                    if ($(e.target).closest('.plyr__control--overlaid').length || $(e.target).closest('.plyr__controls').length || $(e.target).closest('.mdi-close').length || $(e.target).closest('.plyr-player-min-controls-buttons').length)
                        return;
                    e.preventDefault();
                    // get the mouse cursor position at startup:
                    this.pos3 = e.clientX;
                    this.pos4 = e.clientY;
                    let didDrag = false;
                    document.onmouseup = (e) => {
                        document.onmouseup = null;
                        document.onmousemove = null;
                        if (!didDrag && !$(e.target).closest('.plyr__control--overlaid').length)
                            this.$('.plyr__video-wrapper').click();
                    };
                    // call a function whenever the cursor moves:
                    document.onmousemove = (e) => {
                        e = e || window.event;
                        didDrag = true;
                        e.preventDefault();
                        if (this.$el.hasClass('player-overlay'))
                            return;
                        // calculate the new cursor position:
                        this.pos1 = this.pos3 - e.clientX;
                        this.pos2 = this.pos4 - e.clientY;
                        this.pos3 = e.clientX;
                        this.pos4 = e.clientY;

                        let xPercent = (((this.$el.offset().left - this.pos1)/window.innerWidth) * 100),
                            yPercent = (((this.$el.offset().top - this.pos2)/window.innerHeight) * 100);


                        // set the element's new position:
                        this.$el.css('left', xPercent + '%');
                        this.$el.css('top', yPercent + '%');
                        this.$el.css('transform', "none");
                        this.$el.css('right', "unset");
                    };
                });
            },
        });

    },

    showNewVideo: function (options) {
        options = options || {};
        let dfd = new $.Deferred();
        dfd.done(() => {
            if (options.player.provider === 'youtube'){
                this.$('.plyr-player-popup-draggable').addClass('hidden');
                this.$('.plyr-player-popup-draggable').css({
                    width: 400,
                    height: 200,
                });
            }
            this.account = options.player.chat_item.account;
            this.updateColorScheme();
            this.player.chat_item = options.player.chat_item;
            this.player.player_item = options.player;
            this.player.message_unique_id = options.player.message_unique_id;
            let video_sources = {
                src: options.player.video_src,
                provider: options.player.provider,
            };
            options.player.type && (video_sources.type = options.player.type);
            this.player.source = {
                type: 'video',
                sources: [
                    video_sources,
                ],
            }
            xabber.current_plyr_player = this.player;
            this.player.once('ready',(event) => {
                let $minimize_element_float = $('<svg class="mdi mdi-24px mdi-plyr-custom-controls mdi-minimize mdi-minimize-float mdi-svg-template" data-svgname="player-float"></svg>')
                $minimize_element_float.append(env.templates.svg['player-float']())
                $minimize_element_float.insertBefore(this.$('.plyr__controls__item[data-plyr="fullscreen"]'));
                let $minimize_element_full = $('<svg class="mdi mdi-24px mdi-plyr-custom-controls mdi-minimize mdi-minimize-full mdi-svg-template" data-svgname="player-full"></svg>')
                $minimize_element_full.append(env.templates.svg['player-full']())
                $minimize_element_full.insertBefore(this.$('.plyr__controls__item[data-plyr="fullscreen"]'));
                let $show_message_element_full = $('<svg class="mdi mdi-24px mdi-plyr-custom-controls mdi-open-message mdi-svg-template" data-svgname="message-bookmark-outline"></svg>')
                $show_message_element_full.append(env.templates.svg['message-bookmark-outline']())
                $show_message_element_full.insertAfter(this.$('.plyr__controls__item[data-plyr="download"]'));
                let $previous_element = $('<div class="btn-previous-plyr"><i class="mdi mdi-skip-previous mdi-24px"></i></div>')
                $previous_element.insertBefore(this.$('.plyr__controls__item[data-plyr="play"]'));
                let $next_element = $('<div class="btn-next-plyr"><i class="mdi mdi-skip-next mdi-24px"></i></div>')
                $next_element.insertAfter(this.$('.plyr__controls__item[data-plyr="play"]'));
                this.player.play();
                xabber.trigger('plyr_player_updated');
            });
        });

        if (options.player && options.player.video_file && options.player.video_file.key) {
            options.player.key = options.player.video_file.key;
            options.player.video_file.type && (options.player.type = options.player.video_file.type);
        }

        if (options.player && options.player.key && options.player.chat_item.model && options.player.video_src && !options.player.video_decrypted){
            options.player.chat_item.model.messages.decryptFile(options.player.video_src, options.player.key).then((result) => {
                options.player.video_src = result;
                options.player.video_decrypted = true;
                dfd.resolve();
            });
        } else
            dfd.resolve();
    },

    closePopup: function () {
        this.$el.closest('#modals').siblings('#' + this.$el.data('overlayId')).detach();
        this.$el.detach();
        xabber.current_plyr_player = null;
        xabber.plyr_player_popup = null;
        xabber.trigger('plyr_player_updated');
    },

    minimizePopup: function () {
        if (xabber.current_plyr_player && xabber.current_plyr_player.$audio_elem)
            return;
        let visibility_state = this.data.get('visibility_state');
        visibility_state = visibility_state + 1;
        (visibility_state > 2) && (visibility_state = 0);
        this.data.set('visibility_state', visibility_state);
    },

    hidePopup: function () {
        if (xabber.current_plyr_player && xabber.current_plyr_player.$audio_elem)
            return;
        this.data.set('visibility_state', 2);
    },

    floatPopup: function () {
        if (xabber.current_plyr_player && xabber.current_plyr_player.$audio_elem)
            return;
        this.data.set('visibility_state', 1);
    },

    fullPopup: function () {
        if (xabber.current_plyr_player && xabber.current_plyr_player.$audio_elem)
            return;
        this.data.set('visibility_state', 0);
    },

    onVisibilityChange: function () {
        let visibility_state = this.data.get('visibility_state'),
            $overlay = this.$el.closest('#modals').siblings('#' + this.$el.data('overlayId'));
        $overlay.switchClass('hidden', visibility_state != 0);
        this.$el.switchClass('player-overlay', visibility_state === 0);
        this.$el.switchClass('hidden', visibility_state === 2);
    },

    nextPlyr: function () {
        let player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player);
        if (player_index === -1 && xabber.current_plyr_player.player_item)
            player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player.player_item);
        if (!xabber.current_plyr_player || !(player_index >= 0 && player_index < xabber.current_plyr_player.chat_item.model.plyr_players.length - 1))
            return;
        if (xabber.current_plyr_player.chat_item.model.plyr_players[player_index + 1].$audio_elem){
            let next_item = xabber.current_plyr_player.chat_item.model.plyr_players[player_index + 1];
            if (!next_item.$audio_elem.voice_message){
                let f_url = $(next_item.$audio_elem).find('.file-link-download').attr('href');
                $(next_item.$audio_elem).find('.mdi-play').removeClass('no-uploaded')
                next_item.$audio_elem.voice_message = xabber.current_plyr_player.chat_item.content.renderVoiceMessage($(next_item.$audio_elem).find('.file-container')[0], f_url, xabber.current_plyr_player.chat_item.model);
            } else {
                next_item.$audio_elem.voice_message.play()
            }
        } else{
            if (!xabber.plyr_player_popup){
                xabber.plyr_player_popup = new xabber.PlyrPlayerPopupView({});
                xabber.plyr_player_popup.show({player: xabber.current_plyr_player.chat_item.model.plyr_players[player_index + 1]});
            } else
                xabber.plyr_player_popup.showNewVideo({player: xabber.current_plyr_player.chat_item.model.plyr_players[player_index + 1]});
        }
    },

    previousPlyr: function () {
        let player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player);
        if (player_index === -1 && xabber.current_plyr_player.player_item)
            player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player.player_item);
        if (!xabber.current_plyr_player || !(player_index <= xabber.current_plyr_player.chat_item.model.plyr_players.length && player_index > 0))
            return;
        if (xabber.current_plyr_player.chat_item.model.plyr_players[player_index - 1].$audio_elem){
            let prev_item = xabber.current_plyr_player.chat_item.model.plyr_players[player_index - 1];
            if (!prev_item.$audio_elem.voice_message){
                let f_url = $(prev_item.$audio_elem).find('.file-link-download').attr('href');
                $(prev_item.$audio_elem).find('.mdi-play').removeClass('no-uploaded')
                prev_item.$audio_elem.voice_message = xabber.current_plyr_player.chat_item.content.renderVoiceMessage($(prev_item.$audio_elem).find('.file-container')[0], f_url, xabber.current_plyr_player.chat_item.model);
            } else {
                prev_item.$audio_elem.voice_message.play()
            }
        } else{
            if (!xabber.plyr_player_popup){
                xabber.plyr_player_popup = new xabber.PlyrPlayerPopupView({});
                xabber.plyr_player_popup.show({player: xabber.current_plyr_player.chat_item.model.plyr_players[player_index - 1]});
            } else
                xabber.plyr_player_popup.showNewVideo({player: xabber.current_plyr_player.chat_item.model.plyr_players[player_index - 1]});
        }
    },

    updatePlyrControls: function () {
        if (xabber.current_plyr_player) {
            let player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player.player_item);
            this.$('.btn-next-plyr').switchClass('disabled', !(player_index >= 0 && player_index < xabber.current_plyr_player.chat_item.model.plyr_players.length - 1));
            this.$('.btn-previous-plyr').switchClass('disabled', !(player_index <= xabber.current_plyr_player.chat_item.model.plyr_players.length && player_index > 0));
            this.$('.mdi-plyr-play').switchClass('hidden', xabber.current_plyr_player.playing);
            this.$('.mdi-plyr-pause').switchClass('hidden', !xabber.current_plyr_player.playing);
            this.$('.mdi-mute-plyr').switchClass('hidden', !xabber.current_plyr_player.muted);
            this.$('.mdi-unmute-plyr').switchClass('hidden', xabber.current_plyr_player.muted);
        }
    },

    openMessage: function () {
        if (!(this.player && this.player.chat_item && this.player.message_unique_id))
            return;
        this.floatPopup();
        let chat = this.player.chat_item.model;
        xabber.chats_view.openChat(chat.item_view, {right_contact_save: true, clear_search: false});
        xabber.body.setScreen(xabber.body.screen.get('name'), {right: 'message_context', model: chat });
        if (xabber.right_contact_panel_saveable && xabber.body.screen.get('right_contact') && xabber.body.screen.get('right') === 'message_context') {
            if (xabber.right_contact_panel_saveable)
                chat.contact.showDetailsRight('all-chats', {right_saved: true});
            else
                chat.contact.showDetailsRight('all-chats', {right_saved: false});
        }
        chat.getMessageContext(this.player.message_unique_id, {message: true});
    },

    togglePlay: function () {
        if (!xabber.current_plyr_player)
            return;
        if (xabber.current_plyr_player.$audio_elem){
            if (!xabber.current_plyr_player.$audio_elem.voice_message){
                let f_url = $(xabber.current_plyr_player.$audio_elem).find('.file-link-download').attr('href');
                $(xabber.current_plyr_player.$audio_elem).find('.mdi-play').removeClass('no-uploaded')
                xabber.current_plyr_player.$audio_elem.voice_message = this.content.renderVoiceMessage($(xabber.current_plyr_player.$audio_elem).find('.file-container')[0], f_url);
            } else {
                xabber.current_plyr_player.$audio_elem.voice_message.playPause()
            }
        } else
            xabber.current_plyr_player.togglePlay();
    },

    toggleMute: function () {
        if (!xabber.current_plyr_player)
            return;
        xabber.current_plyr_player.muted = !xabber.current_plyr_player.muted;
    },

    updateColorScheme: function () {
        this.$el.attr('data-color', this.account.settings.get('color'));
        this.account.settings.once("change:color", this.updateColorScheme, this);
    },
});

xabber.SettingsModalView = xabber.BasicView.extend({
    className: 'settings-panel-wrap',
    template: templates.settings_modal,
    ps_selector: '.settings-panel',

    events: {
        "click .background-overlay": "closeSettings",
        "click .btn-back": "backToMenu",
        "click .btn-back-subsettings": "backToSubMenu",
        "click .settings-tabs-wrap.global-settings-tabs .settings-tab:not(.delete-all-accounts)": "jumpToBlock",
        "click .desktop-notifications-clue-wrap b": "goToWebNotifications",
        "click .btn-add-account": "showAddAccountView",
        "click .setting.idling label": "setIdling",
        "change #idle_timeout": "setIdlingTimeout",
        "click .setting.notifications label": "setNotifications",
        // "click .setting.volume-enable label": "setNotificationsVolumeEnabled",
        "click .private-notifications label": "setPrivateNotifications",
        "click .group-notifications label": "setGroupNotifications",
        "click .notifications-lever label": "setNotifications",
        "click .jingle-calls label": "setJingleCalls",
        "click .setting.message-preview.private-preview label": "setPrivateMessagePreview",
        "click .setting.message-preview.group-preview label": "setGroupMessagePreview",
        "click .call-attention label": "setCallAttention",
        "click .setting.load-media label": "setLoadMedia",
        "click .setting.typing-notifications label": "setTypingNotifications",
        "click .setting.mapping-service label": "setMappingService",
        "click .setting.desktop-autostart label": "setDesktopAutostart",
        "click .setting.reconnection-popup-log label": "setReconnectionLogs",
        "change .sound input[type=radio][name=private_sound]": "setPrivateSound",
        "change .sound input[type=radio][name=group_sound]": "setGroupSound",
        "change .sound input[type=radio][name=call_sound]": "setCallSound",
        "change .sound input[type=radio][name=dialtone_sound]": "setDialtoneSound",
        "change .sound input[type=radio][name=attention_sound]": "setAttentionSound",
        "change .languages-list input[type=radio][name=language]": "changeLanguage",
        "change .emoji-fonts-list input[type=radio][name=emoji_font]": "changeEmojiFont",
        "click .emoji-font-external-url-button": "loadExternalEmojiFont",
        "change #vignetting": "changeVignetting",
        "change #blur": "changeBlur",
        "change #notifications_volume": "changeNotificationsVolume",
        "change #blur_switch": "switchBlur",
        "change #vignetting_switch": "switchVignetting",
        "click .selected-color-wrap": "openColorPicker",
        "click .client-main-color-item": "chooseMainColor",
        "change .background input[type=radio][name=background]": "setBackground",
        "click .current-background-wrap": "changeBackgroundImage",
        "change .hotkeys input[type=radio][name=hotkeys]": "setHotkeys",
        "change .avatar-shape input[type=radio][name=avatar_shape]": "setAvatarShape",
        "change .device-metadata input[type=radio][name=device_metadata]": "setDeviceMetadata",
        "click .settings-tab.delete-all-accounts": "deleteAllAccounts"
    },

    _initialize: function (options) {
        this.$('.xabber-info-wrap .version').text(xabber.get('version_number'));
        xabber.on('update_main_color', this.updateMainColor, this);
        this.model.on('change:language', this.updateLanguage, this);
        this.model.on('change:emoji_font', this.updateEmojiFontLabel, this);
        this.model.on('change:avatar_shape', this.updateAvatarLabel, this);
        this.model.on('change:notifications_private', this.updateSoundsLabel, this);
        this.model.on('change:notifications_group', this.updateSoundsLabel, this);
        this.model.on('change:call_attention', this.updateSoundsLabel, this);
        this.model.on('change:private_sound', this.updateSoundsLabel, this);
        this.model.on('change:group_sound', this.updateSoundsLabel, this);
        this.model.on('change:sound_on_private_message', this.updateSoundsLabel, this);
        this.model.on('change:sound_on_group_message', this.updateSoundsLabel, this);
        this.model.on('change:sound_on_call', this.updateSoundsLabel, this);
        this.model.on('change:sound_on_dialtone', this.updateSoundsLabel, this);
        this.model.on('change:sound_on_attention', this.updateSoundsLabel, this);
        this.ps_container.on("ps-scroll-y", this.onScrollY.bind(this));
        $(document).on("keyup", (ev) => {
            if (ev.keyCode === constants.KEY_ESCAPE && this.data.get('visible')) {
                this.closeSettings();
            }
        });
        xabber.once('accounts_ready',() => {
            xabber.accounts.on("list_changed add change:enabled destroy", this.updateAccounts, this);
        })
    },

    render: function (options) {
        let settings = this.model.attributes,
            lang = settings.language,
            emoji_font = settings.emoji_font;
        this.updateSounds();
        this.updateLanguages();
        this.updateEmojiFonts();
        this.$('.notifications input[type=checkbox]').prop({
            checked: settings.notifications && xabber._cache.get('notifications')
        });
        this.$('.notifications-lever input[type=checkbox]').prop({
            checked: settings.notifications && xabber._cache.get('notifications')
        });
        this.$('.sound input[type=radio][name=group_sound]').prop('disabled', !settings.notifications_group)
        this.$('.private-notifications input[type=checkbox]')
            .prop({checked: settings.notifications_private});
        this.$('.sound input[type=radio][name=private_sound]').prop('disabled', !settings.notifications_private)
        this.$('.sound input[type=radio][name=call_sound]').prop('disabled', !settings.jingle_calls);
        this.$('.sound input[type=radio][name=dialtone_sound]').prop('disabled', !settings.jingle_calls);
        this.$('.group-notifications input[type=checkbox]')
            .prop({checked: settings.notifications_group});
        this.$('.jingle-calls input[type=checkbox]')
            .prop({checked: settings.jingle_calls});
        this.$('.sound input[type=radio][name=group_sound]').prop('disabled', !settings.notifications_group)
        this.$('.sound input[type=radio][name=attention_sound]').prop('disabled', !settings.call_attention)
        this.$('.message-preview.private-preview input[type=checkbox]')
            .prop({checked: settings.message_preview_private}).prop('disabled', !(settings.notifications && xabber._cache.get('notifications') && settings.notifications_private));
        this.$('.message-preview.group-preview input[type=checkbox]')
            .prop({checked: settings.message_preview_group}).prop('disabled', !(settings.notifications && xabber._cache.get('notifications') && settings.notifications_group));
        this.$('.desktop-notifications-clue-wrap').hideIf(settings.notifications);
        this.$('.notifications-dependant').switchClass('notifications-dependant-two-line', !settings.notifications);
        this.$('.call-attention input[type=checkbox]')
            .prop({checked: settings.call_attention});
        this.$('.load-media input[type=checkbox]')
            .prop({checked: settings.load_media});
        this.$('.typing-notifications input[type=checkbox]')
            .prop({checked: settings.typing_notifications});
        this.$('.idling input[type=checkbox]')
            .prop({checked: settings.idling});
        this.$('#idle_timeout')
            .val(settings.idling_time).prop('disabled', !settings.idling);
        // this.$(`#notifications_volume_enable`)
        //     .prop('checked', settings.notifications_volume_enabled);
        this.$('.mapping-service input[type=checkbox]')
            .prop({checked: settings.mapping_service});
        this.$('.reconnection-popup-log input[type=checkbox]')
            .prop({checked: settings.reconnection_logs});
        if (constants.DESKTOP_AUTOSTART_OPTION) {
            this.$('.desktop-autostart input[type=checkbox]')
                .prop({checked: settings.desktop_autostart});
        } else {
            this.$('.desktop-autostart').remove();
        }
        let sound_private_value = settings.private_sound ? settings.sound_on_private_message : '';
        this.$(`.sound input[type=radio][name=private_sound][value="${sound_private_value}"]`)
                .prop('checked', true);
        let sound_group_value = settings.group_sound ? settings.sound_on_group_message : '';
        this.$(`.sound input[type=radio][name=group_sound][value="${sound_group_value}"]`)
                .prop('checked', true);
        this.$(`.sound input[type=radio][name=call_sound][value="${settings.sound_on_call}"]`)
                .prop('checked', true);
        this.$(`.sound input[type=radio][name=dialtone_sound][value="${settings.sound_on_dialtone}"]`)
                .prop('checked', true);
        this.$(`.sound input[type=radio][name=attention_sound][value="${settings.sound_on_attention}"]`)
                .prop('checked', true);
        this.$(`.hotkeys input[type=radio][name=hotkeys][value=${settings.hotkeys}]`)
                .prop('checked', true);
        this.$(`.avatar-shape input[type=radio][name=avatar_shape][value=${settings.avatar_shape}]`)
                .prop('checked', true);
        this.$(`.device-metadata input[type=radio][name=device_metadata][value=${settings.device_metadata}]`)
                .prop('checked', true);
        this.$(`.device-metadata-description`).text(xabber.getString(`settings__section_privacy__${settings.device_metadata}_metadata_description`));
        (lang == xabber.get("default_language")) && (lang = 'default');
        this.$(`.languages-list input[type=radio][name=language][value="${lang}"]`)
            .prop('checked', true);
        this.$(`.emoji-fonts-list input[type=radio][name=emoji_font][value="${emoji_font}"]`)
            .prop('checked', true);
        this.$(`.client-main-color-item`).removeClass('chosen-client-color');
        this.$(`.client-main-color-item[data-value="${settings.main_color}"]`).addClass('chosen-client-color');
        let notifications_volume = !isNaN(settings.notifications_volume) ? settings.notifications_volume * 100 : 100;
        this.$(`#notifications_volume`).val(notifications_volume);
        // this.$('.volume-setting .disabled').switchClass('hidden', settings.notifications_volume_enabled);
        // this.$('#notifications_volume').prop('disabled', !settings.notifications_volume_enabled);
        this.$('.settings-panel-head span').text(this.$('.settings-block-wrap:not(.hidden)').attr('data-header'))
        this.updateAvatarLabel();
        this.updateSoundsLabel();
        this.updateDescription();
        this.updateBackgroundSetting();
        this.updateColor();
        this.updateMainColor();
        this.updateLanguage();
        this.updateEmojiFontLabel();
        this.$('.toolbar-main-color-setting-wrap .dropdown-button').dropdown({
            inDuration: 100,
            outDuration: 100,
            belowOrigin: true,
            hover: false
        });
        this.$('.left-column').removeClass('hidden');
        this.$('.left-column .settings-tabs-wrap.global-settings-tabs').removeClass('hidden');
        this.$('.right-column').addClass('hidden');
        this.$('.btn-back').removeClass('hidden');
        this.$('.btn-back-subsettings').addClass('hidden');
        this.$('.settings-panel-head .description').addClass('hidden');
        this.$('.desktop-notifications-clue-wrap b').addClass('client-text-color-500');
        this.updateAccounts(options);
        this.updateHeight();
        this.updateSliders();
        if (options && options.block_name) {
            let $elem = this.$(`.settings-tab[data-block-name="${options.block_name}"]`);
            if ($elem.length)
                this.jumpToBlock({target: $elem[0]});
        }
        return this;
    },

    updateAccounts: function (options) {
        if (this.settings_single_account_modal){
            this.settings_single_account_modal.removeChild('blocklist');
            this.removeChild('single_account');
            this.settings_single_account_modal.destroyView();
            this.settings_single_account_modal = undefined;
        }
        if (xabber.accounts.length === 1 && xabber.accounts.enabled.length){
            this.$('.accounts-info-wrap').addClass('hidden');
            this.$('.btn-add-account').addClass('hidden');
            this.$('.single-account-info-wrap').removeClass('hidden');
            let first_account = xabber.accounts.models[0];
            this.single_account_has_rendered = false;
            this.settings_single_account_modal = this.addChild('single_account', xabber.AccountSettingsSingleModalView, {
                model: first_account,
                forced_ps_container: this.ps_container,
                single_account_modal: true,
                el: this.$('.single-account-info-wrap .single-account-info')[0]
            });
            if (!this.single_account_has_rendered){
                this.settings_single_account_modal.show(null, options);
            }
            first_account.trigger('render_single_settings', this.settings_single_account_modal);
            this.settings_single_account_modal.addChild('blocklist', xabber.BlockListView, {
                account: first_account,
                el: this.settings_single_account_modal.$('.block-list-view-wrap')[0]
            });
        } else {
            this.$('.btn-add-account').removeClass('hidden');
            this.$('.accounts-info-wrap').removeClass('hidden');
            this.$('.single-account-info-wrap').addClass('hidden');
        }
        this.updateHeight();
    },

    updateMainColor: function () {
        this.$('.toolbar-main-color-setting').attr('data-color', this.model.get('main_color'));
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
        if (blur_switched)
            this.$('#blur')[0].value = appearance.blur;
        this.$('#vignetting_switch')[0].checked = vignetting_switched;
        this.$('.vignetting-setting .disabled').switchClass('hidden', vignetting_switched);
        if (vignetting_switched)
            this.$('#vignetting')[0].value = appearance.vignetting;
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

    jumpToBlock: function (ev) {
        if ($(ev.target).closest('.switch').length)
            return;
        let $tab = $(ev.target).closest('.settings-tab'),
            $elem = this.$('.settings-block-wrap.' + $tab.attr('data-block-name'));
        if ($tab.hasClass('link-button')) {
            $tab.parent().siblings().removeClass('active');
            this.scrollTo(0);
            return;
        }
        this.$('.settings-block-wrap').addClass('hidden');
        this.$('.left-column').addClass('hidden');
        this.$('.right-column').removeClass('hidden');
        $elem.removeClass('hidden');
        this.$('.settings-panel-head span').text($elem.attr('data-header'))
        $tab.addClass('active').siblings().removeClass('active');
        if ($tab.closest('.right-column') && $tab.attr('data-subblock-parent-name')) {
            this.$('.btn-back').addClass('hidden');
            this.$('.btn-back-subsettings').removeClass('hidden');
            this.$('.btn-back-subsettings').attr('data-subblock-parent-name', $tab.attr('data-subblock-parent-name'));
        }
        if ($tab.attr('data-block-name') === 'interface_language')
            this.$('.settings-panel-head .description').removeClass('hidden');
        else
            this.$('.settings-panel-head .description').addClass('hidden');
        this.scrollToTop();
        this.updateHeight();
    },

    updateHeight: function () {
        let height;
        if (!this.$('.left-column.main-left-column').hasClass('hidden'))
            height = this.$('.left-column.main-left-column').height();
        if (!this.$('.right-column.main-right-column').hasClass('hidden'))
            height = this.$('.right-column.main-right-column').height();
        this.ps_container.css('height', height + 'px');
        setTimeout(() => {
            this.updateScrollBar();
        }, 500)
    },

    updateSliders: function () {
        this.$('.range-field.range-field-design').each((idx, item) => {
            let $input = $(item).find('input'),
                range_min = $input.attr('min'),
                range_max = $input.attr('max'),
                range_value = $input.val(),
                left =  ((182 / (range_max - range_min)) * (range_value - range_min)) + 10;
            $(item).find('span.thumb').css('left', left + 'px');
            if ($input.hasClass('materialize-timer'))
                $(item).find('span.value').text(range_value + 's');
            else
                $(item).find('span.value').text(range_value);
        })

    },

    updateSounds: function () {

        this.$('.notification-field').html('<form action="#"></form>');

        sounds.notifications.forEach((item,idx) => {
            if (!item.not_selectable){
                let element = $(templates.setting_radio_input({
                    input_name: 'private_sound',
                    input_id: `${this.cid}-private-sound-${item.file_name}`,
                    label: item.name,
                    value: item.file_name,
                }));
                this.$('.notification-field:not(.group-notification-field)').append(element);
                let group_element = $(templates.setting_radio_input({
                    input_name: 'group_sound',
                    input_id: `${this.cid}-group-sound-${item.file_name}`,
                    label: item.name,
                    value: item.file_name,
                }));
                this.$('.group-notification-field').append(group_element);
            }
        });

        let element_no_sound = $(templates.setting_radio_input({
            input_name: 'private_sound',
            input_id: `${this.cid}-private-sound-no`,
            label: 'No sound',
            value: '',
        }));
        this.$('.notification-field:not(.group-notification-field)').prepend(element_no_sound);

        let group_element_no_sound = $(templates.setting_radio_input({
            input_name: 'group_sound',
            input_id: `${this.cid}-group-sound-no`,
            label: 'No sound',
            value: '',
        }));
        this.$('.group-notification-field').prepend(group_element_no_sound);

        this.$('.dialtone-field').html('<form action="#"></form>');
        sounds.dialtones.forEach((item,idx) => {
            if (!item.not_selectable){
                let element = $(templates.setting_radio_input({
                    input_name: 'dialtone_sound',
                    input_id: `${this.cid}-dialtone-sound-${item.file_name}`,
                    label: item.name,
                    value: item.file_name,
                }));
                this.$('.dialtone-field').append(element);
            }
        });

        this.$('.ringtone-field').html('<form action="#"></form>');
        sounds.ringtones.forEach((item,idx) => {
            if (!item.not_selectable){
                let element = $(templates.setting_radio_input({
                    input_name: 'call_sound',
                    input_id: `${this.cid}-call-sound-${item.file_name}`,
                    label: item.name,
                    value: item.file_name,
                }));
                this.$('.ringtone-field').append(element);
            }
        });

        this.$('.attention-field').html('<form action="#"></form>');
        sounds.attention.forEach((item,idx) => {
            if (!item.not_selectable){
                let element = $(templates.setting_radio_input({
                    input_name: 'attention_sound',
                    input_id: `${this.cid}-attention-sound-${item.file_name}`,
                    label: item.name,
                    value: item.file_name,
                }));
                this.$('.attention-field').append(element);
            }
        });

    },

    updateLanguages: function () {
        this.$('.languages-list').html('<form action="#"></form>');

        let default_element = $(templates.setting_language_radio_input({
            input_name: 'language',
            input_id: `${this.cid}-default`,
            label: xabber.getString("settings__languages_list___item_default", [constants.languages[xabber.get("default_language") || 'en']]),
            value: 'default',
            progress: {},
        }));

        this.$('.languages-list').append(default_element);

        if (!window.navigator.language.includes('en')){
            let second_lang = xabber.get("default_language") === 'en' ? window.navigator.language : 'en',
                second_prog, second_prog_text,
                second_locale = Object.keys(client_translation_progress)
                    .find(key => !second_lang.indexOf(key)) || constants.languages_another_locales[second_lang] && Object.keys(client_translation_progress)
                    .find(key => !constants.languages_another_locales[second_lang].indexOf(key)); // < - check for locales that differ in names

            if (second_locale) {
                second_prog = client_translation_progress[second_locale];
                second_prog_text = (second_prog == 100) ? xabber.getString("settings__section_interface_language__translation_progress_fully")
                    : xabber.getString("settings__section_interface_language__translation_progress", [`${second_prog}%`]);

                let second_element = $(templates.setting_language_radio_input({
                    input_name: 'language',
                    input_id: `${this.cid}-${second_lang}`,
                    label: constants.languages[second_lang],
                    value: second_lang,
                    progress: {
                        text: second_prog_text
                    },
                }));
                this.$('.languages-list').append(second_element);
            }
        }


        for (let lang in constants.languages) {
            if (!lang || lang == xabber.get("default_language") || lang == window.navigator.language)
                continue;

            let locale = Object.keys(client_translation_progress)
                .find(key => !lang.indexOf(key)) || constants.languages_another_locales[lang] && Object.keys(client_translation_progress)
                .find(key => !constants.languages_another_locales[lang].indexOf(key)); // < - check for locales that differ in names

            if (locale) {
                let progress = client_translation_progress[locale],
                    progress_text = (progress == 100) ? xabber.getString("settings__section_interface_language__translation_progress_fully")
                        : xabber.getString("settings__section_interface_language__translation_progress", [`${progress}%`]);

                let element = $(templates.setting_language_radio_input({
                    input_name: 'language',
                    input_id: `${this.cid}-${lang}`,
                    label: constants.languages[lang],
                    value: lang,
                    progress: {
                        text: progress_text
                    },
                }));
                this.$('.languages-list').append(element);
            }
        }
    },

    updateEmojiFonts: function () {
        let emoji_fonts_list = constants.EMOJI_FONTS_LIST;

        if (!Object.keys(emoji_fonts_list).length) {
            this.$('.settings-tab[data-block-name="emoji_font"').addClass('hidden');
            return;
        }
        this.$('.settings-tab[data-block-name="emoji_font"').removeClass('hidden');

        this.$('.emoji-fonts-list').html('<form action="#"></form>');

        let system_element = $(templates.setting_emoji_font_radio_input({
            input_name: 'emoji_font',
            input_id: `${this.cid}-emoji-font-system`,
            label: xabber.getString("settings__menu_item__emoji_font_system"),
            value: 'system',
            hint: null,
        }));

        this.$('.emoji-fonts-list').append(system_element);
        emoji_fonts_list = Object.values(emoji_fonts_list);

        emoji_fonts_list.sort((a, b) => {
            return a.order - b.order;
        })

        emoji_fonts_list.forEach((item) => {
            let item_name = item.name,
                element = $(templates.setting_emoji_font_radio_input({
                    input_name: 'emoji_font',
                    input_id: `${this.cid}-emoji-font-${item.value}`,
                    label: item_name,
                    value: item.value,
                    hint: item.hint,
                }));
            this.$('.emoji-fonts-list').append(element);
        });
    },

    onScrollY: function () {
        if (this.getScrollTop() === 0)
            this.$('.settings-panel-head').removeClass('lined-head')
        else
            this.$('.settings-panel-head').addClass('lined-head')
    },

    closeSettings: function (ev) {
        this.current_sound && this.current_sound.pause();
        if (xabber.body.screen && xabber.body.screen.get('previous_screen')){

            let previous_screen = xabber.body.screen.get('previous_screen');
            if (previous_screen.name === 'notifications' && previous_screen.open_all_chats ){
                xabber.toolbar_view.showAllChats();
            } else {
                previous_screen.close_settings = true;
                xabber.body.setScreen(previous_screen.name, previous_screen);
                xabber.body.screen.attributes.close_settings = undefined;
            }
        } else
            xabber.toolbar_view.showAllChats();
    },

    backToMenu: function (ev) {
        this.current_sound && this.current_sound.pause();
        this.$('.left-column').removeClass('hidden');
        this.$('.right-column').addClass('hidden');
        this.$('.settings-panel-head .description').addClass('hidden');
        this.scrollToTop();
        this.updateHeight();
    },

    backToSubMenu: function (ev) {
        this.current_sound && this.current_sound.pause();
        let $tab = $(ev.target).closest('.btn-back-subsettings'),
            block_name = $tab.attr('data-subblock-parent-name'),
            $elem = this.$('.settings-block-wrap.' + block_name),
            elem_parent = $elem.attr('data-parent-block');
        this.$('.settings-block-wrap').addClass('hidden');
        $elem.removeClass('hidden');
        this.$('.settings-panel-head span.settings-panel-head-title').text($elem.attr('data-header'));
        if (elem_parent) {
            $tab.attr('data-subblock-parent-name', elem_parent)
        } else {
            this.$('.btn-back').removeClass('hidden');
            this.$('.btn-back-subsettings').addClass('hidden');
        }
        this.$('.settings-panel-head .description').addClass('hidden');
        this.scrollToTop();
        this.updateHeight();
    },

    goToWebNotifications: function (ev) {
        this.$('.settings-tab[data-block-name="web-notifications"]').click();
    },

    setIdling: function (ev) {
        let value = !this.model.get('idling');
        this.model.save('idling', value);
        ev.preventDefault();
        $(ev.target).closest('.setting.idling').find('input').prop('checked', value);
        this.$('#idle_timeout').prop('disabled', !value);
    },

    setIdlingTimeout: function (ev) {
        let $target = $(ev.target),
            value = $(ev.target).val();
        value = parseInt(value);
        if (_.isNaN(value)){
            value = constants.IDLING_DEFAULT_TIMEOUT;
        } else if (value < constants.IDLING_MINIMAL_TIMEOUT){
            value = constants.IDLING_MINIMAL_TIMEOUT;
        }
        this.model.save('idling_time', value);
        $target.val(value);
        ev.preventDefault();
    },

    setNotificationsVolumeEnabled: function (ev) {
        ev.preventDefault();
        let value = !this.model.get('notifications_volume_enabled');
        this.model.save('notifications_volume_enabled', value);
        this.$('#notifications_volume_enable').prop('checked', value);
        this.$('.volume-setting .disabled').switchClass('hidden', value);
        this.$('#notifications_volume').prop('disabled', !value);
    },

    setNotifications: function (ev) {
        let value = this.model.get('notifications');
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
                    this.$('.setting.notifications input[type=checkbox]').prop('checked', value);
                    this.$('.notifications-lever input[type=checkbox]').prop('checked', value);
                    this.$('.message-preview.private-preview input[type=checkbox]').prop('disabled', !(this.model.get('notifications') && xabber._cache.get('notifications') && this.model.get('notifications_private')));
                    this.$('.message-preview.group-preview input[type=checkbox]').prop('disabled', !(this.model.get('notifications') && xabber._cache.get('notifications') && this.model.get('notifications_group')));
                    this.$('.desktop-notifications-clue-wrap').hideIf(value);
                    this.$('.notifications-dependant').switchClass('notifications-dependant-two-line', !value);
                });
            } else {
                value = !value;
                this.model.save('notifications', value);
                this.$('.setting.notifications input[type=checkbox]').prop('checked', value);
                this.$('.notifications-lever input[type=checkbox]').prop('checked', value);
                this.$('.message-preview.private-preview input[type=checkbox]').prop('disabled', !(this.model.get('notifications') && xabber._cache.get('notifications') && this.model.get('notifications_private')));
                this.$('.message-preview.group-preview input[type=checkbox]').prop('disabled', !(this.model.get('notifications') && xabber._cache.get('notifications') && this.model.get('notifications_group')));
                this.$('.desktop-notifications-clue-wrap').hideIf(value);
                this.$('.notifications-dependant').switchClass('notifications-dependant-two-line', !value);
            }
        }
    },

    setPrivateNotifications: function (ev) {
        let value = !this.model.get('notifications_private');
        this.model.save('notifications_private', value);
        ev.preventDefault();
        this.$('.sound input[type=radio][name=private_sound]').prop('disabled', !value)
        this.$('.message-preview.private-preview input[type=checkbox]').prop('disabled', !(this.model.get('notifications') && xabber._cache.get('notifications') && this.model.get('notifications_private')));
        $(ev.target).closest('.private-notifications').find('input').prop('checked', value);
    },

    setGroupNotifications: function (ev) {
        let value = !this.model.get('notifications_group');
        this.model.save('notifications_group', value);
        ev.preventDefault();
        this.$('.sound input[type=radio][name=group_sound]').prop('disabled', !value)
        this.$('.message-preview.group-preview input[type=checkbox]').prop('disabled', !(this.model.get('notifications') && xabber._cache.get('notifications') && this.model.get('notifications_group')));
        $(ev.target).closest('.group-notifications').find('input').prop('checked', value);
    },

    setJingleCalls: function (ev) {
        let value = !this.model.get('jingle_calls');
        this.model.save('jingle_calls', value);
        ev.preventDefault();
        this.$('.sound input[type=radio][name=call_sound]').prop('disabled', !value)
        this.$('.sound input[type=radio][name=dialtone_sound]').prop('disabled', !value)
        $(ev.target).closest('.jingle-calls').find('input').prop('checked', value);
    },

    setPrivateMessagePreview: function (ev) {
        let value = !this.model.get('message_preview_private');
        this.model.save('message_preview_private', value);
        ev.preventDefault();
        $(ev.target).closest('.setting.message-preview').find('input').prop('checked', value);
    },

    setGroupMessagePreview: function (ev) {
        let value = !this.model.get('message_preview_group');
        this.model.save('message_preview_group', value);
        ev.preventDefault();
        $(ev.target).closest('.setting.message-preview').find('input').prop('checked', value);
    },

    setCallAttention: function (ev) {
        let value = !this.model.get('call_attention');
        this.model.save('call_attention', value);
        ev.preventDefault();
        $(ev.target).closest('.call-attention').find('input').prop('checked', value);
    },

    setLoadMedia: function (ev) {
        let value = !this.model.get('load_media');
        this.model.save('load_media', value);
        ev.preventDefault();
        $(ev.target).closest('.setting.load-media').find('input').prop('checked', value);
    },

    setTypingNotifications: function (ev) {
        let value = !this.model.get('typing_notifications');
        this.model.save('typing_notifications', value);
        ev.preventDefault();
        $(ev.target).closest('.setting.typing-notifications').find('input').prop('checked', value);
    },

    setMappingService: function (ev) {
        let value = !this.model.get('mapping_service');
        this.model.save('mapping_service', value);
        ev.preventDefault();
        $(ev.target).closest('.setting.mapping-service').find('input').prop('checked', value);
    },

    setDesktopAutostart: function (ev) {
        let value = !this.model.get('desktop_autostart');
        this.model.save('desktop_autostart', value);
        ev.preventDefault();
        $(ev.target).closest('.setting.desktop-autostart').find('input').prop('checked', value);
    },

    setReconnectionLogs: function (ev) {
        let value = !this.model.get('reconnection_logs');
        this.model.save('reconnection_logs', value);
        ev.preventDefault();
        $(ev.target).closest('.setting.reconnection-popup-log').find('input').prop('checked', value);
    },

    setPrivateSound: function (ev) {
        let value = ev.target.value;
        if (value) {
            this.current_sound && this.current_sound.pause();
            this.current_sound = xabber.playAudio(value, false, !this.model.get('notifications_volume_enabled') ? 0 : this.model.get('notifications_volume'));
            this.model.save({private_sound: true, sound_on_private_message: value});
        } else {
            this.model.save('private_sound', false);
        }
    },

    setGroupSound: function (ev) {
        let value = ev.target.value;
        if (value) {
            this.current_sound && this.current_sound.pause();
            this.current_sound = xabber.playAudio(value, false, !this.model.get('notifications_volume_enabled') ? 0 : this.model.get('notifications_volume'));
            this.model.save({group_sound: true, sound_on_group_message: value});
        } else {
            this.model.save('group_sound', false);
        }
    },

    setCallSound: function (ev) {
        let value = ev.target.value;
        this.current_sound && this.current_sound.pause();
        this.current_sound = xabber.playAudio(value, false);
        this.model.save({sound_on_call: value});
    },

    setDialtoneSound: function (ev) {
        let value = ev.target.value;
        this.current_sound && this.current_sound.pause();
        this.current_sound = xabber.playAudio(value, false);
        this.model.save({sound_on_dialtone: value});
    },

    setAttentionSound: function (ev) {
        let value = ev.target.value;
        this.current_sound && this.current_sound.pause();
        this.current_sound = xabber.playAudio(value, false);
        this.model.save({sound_on_attention: value});
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

    chooseMainColor: function (ev) {
        let color = $(ev.target).closest('.client-main-color-item').attr('data-value');
        this.model.save('main_color', color);
        this.$(`.client-main-color-item`).removeClass('chosen-client-color');
        this.$(`.client-main-color-item[data-value="${color}"]`).addClass('chosen-client-color');
        xabber.trigger('update_main_color');
    },

    changeBlur: function () {
        let value = this.$('#blur')[0].value,
            appearance = this.model.get('appearance');
        xabber.body.updateBlur(value);
        this.model.save('appearance', _.extend(appearance, {blur: value}));
    },

    changeNotificationsVolume: function () {
        let volume = this.$('#notifications_volume')[0].value / 100,
            sound = this.$('.sound input[type=radio][name=private_sound]:checked').val() || this.$('.sound input[type=radio][name=group_sound]:checked').val();
        this.model.save('notifications_volume', volume);
        if (sound) {
            this.current_sound && this.current_sound.pause();
            this.current_sound = xabber.playAudio(sound, false, volume);
        }
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
            value = is_switched ? this.$('#vignetting')[0].value : false;
        this.$('.vignetting-setting .disabled').switchClass('hidden', is_switched);
        this.model.save('appearance', _.extend(appearance, {vignetting: value}));
        xabber.body.updateBoxShadow(value);
    },

    switchBlur: function () {
        let is_switched = this.$('#blur_switch:checked').length,
            appearance = this.model.get('appearance'),
            value = is_switched ? this.$('#blur')[0].value : false;
        this.$('.blur-setting .disabled').switchClass('hidden', is_switched);
        this.model.save('appearance', _.extend(appearance, {blur: value}));
        xabber.body.updateBlur(value);
    },

    setHotkeys: function (ev) {
        this.model.save('hotkeys', ev.target.value);
    },

    setAvatarShape: function (ev) {
        this.model.save('avatar_shape', ev.target.value);
        xabber.trigger('update_avatar_shape');
    },


    setDeviceMetadata: function (ev) {
        this.model.save('device_metadata', ev.target.value);
        this.$(`.device-metadata-description`).text(xabber.getString(`settings__section_privacy__${this.model.get('device_metadata')}_metadata_description`));
        this.updateHeight();
    },

    deleteAllAccounts: function (ev) {
        utils.dialogs.ask(xabber.getString("button_quit"), xabber.getString("settings__dialog_quit_client__confirm", [constants.CLIENT_NAME]), null, { ok_button_text: xabber.getString("button_quit")}).done((res) => {
            res && xabber.trigger('quit');
        });
    },

    changeLanguage: function (ev) {
        let value = ev.target.value,
            locale = Object.keys(client_translation_progress).find(key => !value.indexOf(key)) || constants.languages_another_locales[value] && Object.keys(client_translation_progress).find(key => !constants.languages_another_locales[value].indexOf(key)),
            progress = client_translation_progress[locale],
            platform_text;

        (value == 'default') && (progress = 100);

        if (progress == 100 && ((xabber.get("default_language") === 'en' && value === 'default') || value === 'en')) {
            platform_text = xabber.getString("settings__dialog_change_language__confirm");
        } else if (progress == 100) {
            platform_text = xabber.getString("settings__interface_language__change_language_text_full_translation",
                [constants.SHORT_CLIENT_NAME, `<a target="_blank" href='${constants.PROJECT_CROWDIN_URL}'>${xabber.getString("settings__section_interface_language__text_description__text_translations")}</a>`, constants.SHORT_CLIENT_NAME, ])
             + '\n\n' +xabber.getString("settings__dialog_change_language__confirm");
        } else if (progress == 0) {
            platform_text = xabber.getString("settings__interface_language__change_language_text_no_translation",
                [constants.SHORT_CLIENT_NAME, `<a target="_blank" href='${constants.PROJECT_CROWDIN_URL}'>${xabber.getString("settings__section_interface_language__text_description__text_translation")}</a>`]);
        } else {
            platform_text = xabber.getString("settings__interface_language__change_language_text_partial_translation",
                [constants.SHORT_CLIENT_NAME, `<a target="_blank" href='${constants.PROJECT_CROWDIN_URL}'>${xabber.getString("settings__section_interface_language__text_description__text_translation_team")}</a>`, constants.SHORT_CLIENT_NAME])
                + '\n\n' +xabber.getString("settings__dialog_change_language__confirm");
        }
        let modal_classes = ['change-language-modal'], inverted_buttons;
        if (progress == 0){
            modal_classes.push('change-language-modal-no-ok');
        } else if (progress != 0 && progress < 70){
            inverted_buttons = true;
        }
        utils.dialogs.ask(xabber.getString("settings__dialog_change_language__header"),
            platform_text,
            {modal_class: modal_classes, no_dialog_options: true, inverted_buttons: inverted_buttons},
            { ok_button_text: xabber.getString("settings__dialog_change_language__button_change")}).done((result) => {

            if (result) {
                this.model.save('language', value);
                window.location.reload(true);
            } else {
                this.$(`.languages-list input[type=radio][name=language][value="${this.model.get('language')}"]`)
                    .prop('checked', true);
            }
        });
    },

    changeEmojiFont: function (ev) {
        let value = ev.target.value,
            emoji_font = constants.EMOJI_FONTS_LIST[value],
            current_time;


        if (!emoji_font && value !== 'system'){
            $(ev.target).closest('.emoji-font-field').detach();
            utils.dialogs.error(xabber.getString("settings__menu_item__emoji_font_chosen_does_not_exist"));
            this.$(`.emoji-fonts-list input[type=radio][name=emoji_font][value="${this.model.get('emoji_font')}"]`)
                .prop('checked', true);
            return
        }
        this.load_emoji_external_dfd = new $.Deferred();
        this.load_emoji_external_dfd.done(() => {

            this.font_load_dfd = new $.Deferred();
            this.currently_loaded_font_value = value;

            this.font_load_dfd.done((response) => {
                if (this.emoji_load_date !== current_time)
                    return;
                this.$('.emoji_font .preloader-wrap').addClass('hidden');
                this.$('.emoji_font .emoji-font-download-text').addClass('hidden');
                this.$('.emoji_font .emojis-preview').removeClass('hidden');
                this.$('.emoji_font .emoji-font-external-url-text').addClass('hidden');
                this.$('.emoji_font .emoji-font-external-url-button').addClass('hidden');
                this.$(`.emoji-fonts-list input[type=radio][name=emoji_font]`)
                    .prop('disabled', false);

                this.font_load_dfd = null;
                this.currently_loaded_font_value = null;
                if (response && response.error){
                    this.$('.emoji_font .emoji-font-attribution-text').addClass('hidden');
                    this.$(`.emoji-fonts-list input[type=radio][name=emoji_font][value="${this.model.get('emoji_font')}"]`)
                        .prop('checked', true);
                    $(ev.target).prop('disabled', true);
                } else {
                    this.model.save('emoji_font', value);
                }
            });

            this.$('.emoji_font .emoji-font-external-url-text').addClass('hidden');
            this.$('.emoji_font .emoji-font-external-url-button').addClass('hidden');
            this.$('.emoji_font .preloader-wrap').removeClass('hidden');
            this.$('.emoji_font .emoji-font-download-text').removeClass('hidden');
            let emoji_url = value === 'system' ? value : emoji_font.url;
            this.load_emoji_external_dfd = null;
            this.$(`.emoji-fonts-list input[type=radio][name=emoji_font]`)
                .prop('disabled', true);
            this.emoji_load_date = Date.now();
            current_time = this.emoji_load_date;
            this.$('.settings-tab[data-block-name="emoji_font"] .settings-block-label').text(xabber.getString("settings__menu_item__emoji_font_downloading_text"));
            xabber.loadEmojiFont(emoji_url, this.font_load_dfd);
        });

        this.$('.emoji_font .emojis-preview').addClass('hidden');
        this.$('.emoji_font .emoji-font-attribution-text').addClass('hidden');

        if (emoji_font && emoji_font.is_outside_url && value !== 'system'){
            this.$('.emoji_font .emoji-font-external-url-text').removeClass('hidden');
            this.$('.emoji_font .emoji-font-external-url-button').removeClass('hidden');
        } else {
            this.load_emoji_external_dfd.resolve();
        }
    },

    loadExternalEmojiFont: function (ev) {
        this.load_emoji_external_dfd && this.load_emoji_external_dfd.resolve();
    },

    updateEmojiFontLabel: function () {
        if (!constants.EMOJI_FONTS_LIST[this.model.get('emoji_font')] && this.model.get('emoji_font') !== 'system') {
            this.$('.settings-tab[data-block-name="emoji_font"] .settings-block-label').text(xabber.getString("settings__menu_item__emoji_font_chosen_does_not_exist"))
            return;
        }
        let label = this.model.get('emoji_font') === 'system' ? 'system' : constants.EMOJI_FONTS_LIST[this.model.get('emoji_font')].name,
            attribution_text = this.model.get('emoji_font') === 'system' ? '' : constants.EMOJI_FONTS_LIST[this.model.get('emoji_font')].attribution_text;
        if (label === 'system')
            label = xabber.getString("settings__menu_item__emoji_font_system");
        this.$('.settings-tab[data-block-name="emoji_font"] .settings-block-label').text(label);
        this.$('.emoji-font-attribution-text').switchClass('hidden', !attribution_text);
        this.$('.emoji-font-attribution-text').html(attribution_text);
        this.$(`.emoji-fonts-list input[type=radio][name=emoji_font][value="${this.model.get('emoji_font')}"]`)
            .prop('checked', true);
        this.$(`.emoji-fonts-list input[type=radio][name=emoji_font]`)
            .prop('disabled', false);
        this.$('.emoji_font .emoji-font-external-url-text').addClass('hidden');
        this.$('.emoji_font .emoji-font-external-url-button').addClass('hidden');
        this.$('.emoji_font .preloader-wrap').addClass('hidden');
        this.$('.emoji_font .emoji-font-download-text').addClass('hidden');
        this.$('.emoji_font .emojis-preview').removeClass('hidden');
        if (this.font_load_dfd && this.currently_loaded_font_value){
            this.$('.emoji_font .emojis-preview').addClass('hidden');
            this.$('.emoji-font-attribution-text').addClass('hidden');
            this.$('.emoji_font .preloader-wrap').removeClass('hidden');
            this.$('.emoji_font .emoji-font-download-text').removeClass('hidden');
            this.$(`.emoji-fonts-list input[type=radio][name=emoji_font]`)
                .prop('disabled', true);
            this.$(`.emoji-fonts-list input[type=radio][name=emoji_font][value="${this.currently_loaded_font_value}"]`)
                .prop('checked', true);
            this.$('.settings-tab[data-block-name="emoji_font"] .settings-block-label').text(xabber.getString("settings__menu_item__emoji_font_downloading_text"));
        }
    },

    updateLanguage: function () {
        if (this.model.get('language') === 'default'){
            this.$('.settings-tab[data-block-name="interface_language"] .settings-block-label').text(xabber.getString("settings__languages_list___item_default", [constants.languages[xabber.get("default_language") || 'en']]));
        } else {
            this.$('.settings-tab[data-block-name="interface_language"] .settings-block-label').text(constants.languages[this.model.get('language')]);
        }
    },

    showAddAccountView: function () {
        xabber.trigger('add_account', {right: null});
    },

    updateDescription: function () {

        if (!xabber.settings.language)
            return;

        let lang = xabber.settings.language,
            locale = Object.keys(client_translation_progress).find(key => !lang.indexOf(key)) || constants.languages_another_locales[lang] && Object.keys(client_translation_progress).find(key => !constants.languages_another_locales[lang].indexOf(key)),
            progress = client_translation_progress[locale];

        (lang == 'default' || !lang.indexOf('en')) && (progress = 100);

        if (!_.isUndefined(progress)) {
            let progress_text, platform_text;
            if (progress == 100 && ((xabber.get("default_language") === 'en' && lang === 'default') || lang === 'en')) {
                progress_text = xabber.getString("settings__interface_language__text_description_full_translation_english", [constants.SHORT_CLIENT_NAME, `<a target="_blank" class="email-link" href='mailto:${constants.EMAIL_FOR_JOIN_TRANSLATION}'>${constants.EMAIL_FOR_JOIN_TRANSLATION}</a>`, constants.SHORT_CLIENT_NAME]);
            } else if (progress == 100) {
                progress_text = xabber.getString("settings__interface_language__text_description_full_translation", [constants.SHORT_CLIENT_NAME, constants.SHORT_CLIENT_NAME]);
            } else if (progress == 0) {
                progress_text = xabber.getString("settings__section_interface_language__text_description_no_translations", [constants.SHORT_CLIENT_NAME]);
            } else {
                progress_text = xabber.getString("settings__interface_language__text_description_unfull_translation", [constants.SHORT_CLIENT_NAME]);
            }
            platform_text = xabber.getString("settings__interface_language__text_description_platform",
                [constants.SHORT_CLIENT_NAME, `<a target="_blank" href='${constants.PROJECT_CROWDIN_URL}'>${constants.PROJECT_CROWDIN_URL}</a>`]);
            this.$('.description').html(`${progress_text}<br><br>${platform_text}`);
        }
    },

    updateAvatarLabel: function () {
        let shape = this.model.get('avatar_shape'), label_text;
        if (shape === 'circle')
            label_text = xabber.getString("settings__section_appearance__avatars_circle");
        if (shape === 'squircle')
            label_text = xabber.getString("settings__section_appearance__avatars_squircle");
        if (shape === 'octagon')
            label_text = xabber.getString("settings__section_appearance__avatars_octagon");
        if (shape === 'hexagon')
            label_text = xabber.getString("settings__section_appearance__avatars_hexagon");
        if (shape === 'pentagon')
            label_text = xabber.getString("settings__section_appearance__avatars_pentagon");
        if (shape === 'rounded')
            label_text = xabber.getString("settings__section_appearance__avatars_rounded");
        if (shape === 'star')
            label_text = xabber.getString("settings__section_appearance__avatars_star");
        this.$('.settings-tab[data-block-name="avatars"] .settings-block-label').text(label_text);
    },

    updateSoundsLabel: function () {
        let sound_private_value = this.model.get('private_sound') && this.model.get('notifications_private') ? this.model.get('sound_on_private_message') : '',
            sound_group_value = this.model.get('group_sound') && this.model.get('notifications_group') ? this.model.get('sound_on_group_message') : '',
            sound_on_attention = this.model.get('call_attention') ? this.model.get('sound_on_attention') : '',
            sound_private_text, sound_group_text, sound_on_attention_text;


        if (sound_private_value === '')
            sound_private_text = 'No sound';
        else
            sound_private_text = sound_private_value.replace('_', ' ');

        if (sound_group_value === '')
            sound_group_text = 'No sound';
        else
            sound_group_text = sound_group_value.replace('_', ' ');

        if (sound_on_attention === '')
            sound_on_attention_text = 'No sound';
        else
            sound_on_attention_text = sound_on_attention.replace('_', ' ');

        this.$('.settings-tab[data-block-name="chats-notifications"] .settings-block-label').text(sound_private_text);
        this.$('.settings-tab[data-block-name="groupchats-notifications"] .settings-block-label').text(sound_group_text);
        this.$('.settings-tab[data-block-name="attention-calls"] .settings-block-label').text(sound_on_attention_text);
    },
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
                xabber.settings_modal_view.updateColor();
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
        if (this.type == 'repeating-pattern') {
            this.onGetPatternsCallback(env.backgroundPatternsXml)
        } else {
            this.onGetImagesCallback(env.backgroundImagesXml);
        }
        callback && callback();
    },

    onGetPatternsCallback: function (data) {
        if (!(data && data['background-patterns'] && data['background-patterns'].image))
            return;
        let images = [];
        data = data['background-patterns'].image;
        data.forEach((item) => {
            images.push({thumbnail: item});
        });
        this.model.patterns_library = images;
    },

    onGetImagesCallback: function (data) {
        if (!(data && data['background-images'] && data['background-images'].image))
            return;
        let images = [];
        data = data['background-images'].image;
        data.forEach((item) => {
            let thumbnail = item.thumbnail,
                fs_img = item['fullscreen-image'];
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
        if ((this.type == 'repeating-pattern' && !this.model.patterns_library) || (this.type == 'images' && !this.model.img_library))
            return;
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
        xabber.settings_modal_view.updateBackgroundSetting();
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
        let draghandle_elem = ev && ev.target && ev.target.closest ? ev.target.closest('.drag-handle') : $(ev.target).closest('.drag-handle'),
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
            in_duration: 10,
            out_duration: 10,
            opacity: 0.4
        },
        close: {out_duration: 10}
    },

    ps_settings: {
        minScrollbarLength: 40,
        suppressScrollX: true,
        wheelSpeed: 0.5
    },

    startBlinkingFavicon: function (is_disconnected) {
        if (this._blink_interval && is_disconnected === undefined)
            return;
        clearInterval(this._blink_interval);
        this._blink_interval = setInterval(() => {
            let $icon = $("link[rel='shortcut icon']"), url;
            if ($icon.attr('href').indexOf(this.cache.favicon) > -1 || $icon.attr('href').indexOf(constants.FAVICON_DEFAULT) > -1 || $icon.attr('href').indexOf(this.cache.favicon_gray) > -1 || $icon.attr('href').indexOf(constants.FAVICON_DEFAULT_GREY) > -1)
                url = this.cache.favicon_message || constants.FAVICON_MESSAGE;
            else
                url = is_disconnected ? this.cache.favicon_gray || constants.FAVICON_DEFAULT_GREY : this.cache.favicon || constants.FAVICON_DEFAULT;
            $icon.attr('href', url);
        }, 1000);
    },

    stopBlinkingFavicon: function (is_disconnected) {
        if (this._blink_interval || is_disconnected !== undefined) {
            clearInterval(this._blink_interval);
            this._blink_interval = null;
            let url = is_disconnected ? this.cache.favicon_gray || constants.FAVICON_DEFAULT_GREY : this.cache.favicon || constants.FAVICON_DEFAULT;
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

    updateAllMessageCounterOnDisconnect: function (is_disconnected) {
        if (this.get('all_msg_counter')) {
            this.startBlinkingFavicon(is_disconnected);
            window.document.title = xabber.getString("notofications__desktop_notification__text", [this.get('all_msg_counter')]);
        } else {
            this.stopBlinkingFavicon(is_disconnected);
            window.document.title = constants.CLIENT_NAME;
        }
    },

    loadEmojiFont: function (url, dfd) {
        xabber.error('loading Font!');
        if (url && url !== 'system') {
            let FontName = "EmojiFont",
                FontURL = url,
                emoji_font = new FontFace(FontName, `url(${FontURL})`),
                font_loaded;

            let load_check_interval = setInterval(() => {
                console.log('status - ' + emoji_font.status);
                if (emoji_font.status == 'loaded' || emoji_font.status == 'error'){
                    clearInterval(load_check_interval);
                    if (emoji_font.status == 'loaded' && !font_loaded){
                        font_loaded = true;
                        console.log('loaded - interval');
                        document.fonts.add(emoji_font);
                        $(constants.CONTAINER_ELEMENT).addClass('custom-emoji-font');
                        dfd && dfd.resolve({});
                    } else if (emoji_font.status == 'error' && !font_loaded) {
                        font_loaded = true;
                        console.log('error - interval');
                        utils.dialogs.error(xabber.getString("settings__menu_item__emoji_font_error_loading"));
                        $(constants.CONTAINER_ELEMENT).removeClass('custom-emoji-font');
                        dfd && dfd.resolve({error: true});
                    }
                }
            }, 1000);

            emoji_font.load().then(() => {
                console.log('loaded');
                if (font_loaded)
                    return;
                font_loaded = true;
                document.fonts.add(emoji_font);
                $(constants.CONTAINER_ELEMENT).addClass('custom-emoji-font');
                dfd && dfd.resolve({});
            }).catch((error) => {
                console.log('error');
                if (font_loaded)
                    return;
                font_loaded = true;
                utils.dialogs.error(xabber.getString("settings__menu_item__emoji_font_error_loading") + error);
                $(constants.CONTAINER_ELEMENT).removeClass('custom-emoji-font');
                dfd && dfd.resolve({error: true});
            });
        } else if (url === 'system'){
            console.log('system font');
            $(constants.CONTAINER_ELEMENT).removeClass('custom-emoji-font');
            dfd && dfd.resolve({});
        }
    },

    setAllMessageCounter: function () {
        let count_msg = 0;
        xabber.accounts.each((account) => {
            account.chats.each((chat) => {
                if (chat.contact && !chat.isMuted())
                    count_msg += chat.get('unread') + chat.get('const_unread');
            });
            let incoming_subscriptions = account.contacts.filter(item => (item.get('invitation') && !item.get('removed')) || (item.get('subscription_request_in') && item.get('subscription') != 'both')).length;
            count_msg += incoming_subscriptions;
        });
        return count_msg;
    },

    recountAllMessageCounter: function () {
        if (!this.get('focused')) {
            this.set('all_msg_counter', this.setAllMessageCounter());
        }
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

    playAudio: function (name, loop, volume) {
        if (!((volume || volume === 0) && !isNaN(volume)))
            volume = 1;
        loop = loop || false;
        let filename = sounds.all_sounds.find(item => item.file_name === name);
        if (filename) {
            let audio = new window.Audio(filename.audio);
            audio.loop = loop;
            audio.volume = volume;
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
    },


    initIdleJS: function () {
        if (this.idleJs)
            this.idleJs.stop();
        let self = this,
            idling_time = self._settings.get('idling_time') * 1000

        this.idleJs = new idleJs({
            idle: idling_time, // idle time in ms
            events: ['mousemove', 'keydown', 'mousedown', 'touchstart', 'focus', 'blur'], // events that will trigger the idle resetter
            onIdle: () => {
                if (self._settings.get('idling'))
                    self.set('idle', true);
                else
                    self.set('idle', false);
            } , // callback function to be executed after idle time
            onActive:() => {
                self.set('idle', false);
            }  , // callback function to be executed after back form idleness
            keepTracking: true, // set it to false if you want to be notified only on the first idleness change
            startAtIdle: false // set it to true if you want to start in the idle state
        })
        this.idleJs.start();
    },


    autostartHandler: function () {
        if (!constants.DESKTOP_AUTOSTART_OPTION)
            return;
        if (!window.electronAPI || !window.electronAPI.autostartHandler)
            return;
        let desktop_autostart = this._settings.get('desktop_autostart');

        window.electronAPI.autostartHandler(Boolean(desktop_autostart));
    },
});

xabber.once("start", function () {
    this.set('all_msg_counter', 0);
    this.on("change:all_msg_counter", this.onChangedAllMessageCounter, this);
    this.on("change:focused", this.onChangedFocusState, this);
    this._settings.on("change:idling_time", this.initIdleJS, this);
    this._settings.on("change:desktop_autostart", this.autostartHandler, this);
    this.set({
        focused: window.document.hasFocus(),
        width: window.innerWidth,
        height: window.innerHeight
    });
    this.registerDOMEvents();
    this.initIdleJS();
    this.autostartHandler();

    Materialize.modalSettings = this.modal_settings;

    this.drag_manager = new this.DragManager();

    this.body = new this.Body({model: this});

    this.login_page = this.body.addChild('login', this.NodeView, {
        classlist: 'login-page-wrap', el: $(document).find('.login-container')[0]});

    this.toolbar_view = this.body.addChild('toolbar', this.ToolbarView);
    this.settings.appearance.color && this.toolbar_view.updateColor(this.settings.appearance.color);
    xabber.trigger('toolbar_initialized');

    this.blur_overlay = this.body.addChild('blur_overlay', this.NodeView, {
        classlist: 'blur-overlay'});

    this.main_panel = this.body.addChild('main', this.NodeView, {
        classlist: 'main-wrap'});
    this.main_overlay_panel = this.body.addChild('main_overlay', this.NodeView, {
        classlist: 'main-overlay-wrap hidden'});
    this.body.updateBlur(this.settings.appearance.blur);
    this.left_panel = this.main_panel.addChild(
        'left', this.NodeView, {classlist: 'panel-wrap left-panel-wrap'});
    this.right_panel = this.main_panel.addChild(
        'right', this.NodeView, {classlist: 'panel-wrap right-panel-wrap'});
    this.right_contact_panel = this.main_panel.addChild(
        'right_contact', this.NodeView, {classlist: 'panel-wrap right-contact-panel-wrap'});
    this.wide_panel = this.main_panel.addChild(
        'wide', this.NodeView, {classlist: 'panel-wrap wide-panel-wrap'});
    this.placeholders_wrap = this.main_panel.addChild('placeholders', this.NodeView, {classlist: 'wide-placeholders-wrap'});
    this.settings_modal_view = this.main_overlay_panel.addChild(
        'settings_modal', this.SettingsModalView, {model: this._settings});
}, xabber);

export default xabber;
