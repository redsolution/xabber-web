import xabber from "xabber-core";

let env = xabber.env,
    constants = env.constants,
    templates = env.templates.api_service,
    utils = env.utils,
    $ = env.$,
    _ = env._;


xabber.AccountSettings = Backbone.Model.extend({
    idAttribute: 'jid',

    defaults: {
        timestamp: 0,
        to_sync: false,
        synced: false,
        deleted: false
    },

    update_timestamp: function () {
        this.save('timestamp', utils.now());
    },

    update_settings: function (settings) {
        this.save(_.extend({timestamp: utils.now()}, settings));
    },

    request_data: function () {
        return {
            jid: this.get('jid'),
            timestamp: this.get('timestamp'),
            settings: _.omit(this.attributes, [
                'jid', 'timestamp', 'order',
                'to_sync', 'synced', 'deleted'
            ])
        };
    }
});

xabber.AccountSettingsList = Backbone.CollectionWithStorage.extend({
    model: xabber.AccountSettings,

    create_from_server: function (settings_item) {
        let settings = this.create(_.extend({
            jid: settings_item.jid,
            timestamp: settings_item.timestamp,
            to_sync: true,
            synced: true
        }, settings_item.settings));
        this.trigger('add_settings', settings);
        return settings;
    }
});

xabber.AccountsOrderTimestamp = Backbone.ModelWithStorage.extend({
    defaults: {
        timestamp: 0
    }
});

xabber.APIAccount = Backbone.ModelWithStorage.extend({
    defaults: {
        token: null,
        sync_all: true
    },

    _initialize: function (_attrs, options) {
        this.list = options.settings_list;
        this.save({connected: false, sync_request: 'silent'});
        this.on("change:connected", function () {
            if (this.get('connected')) {
                this.fcm_subscribe();
            } else {
                this.fcm_unsubscribe();
            }
        }, this);
        this.on("change:token", function () {
            if (this.get('token') !== null) {
                this.save({sync_all: true,
                           sync_request: this.list.length ? 'window' : 'silent'});
            }
        }, this);
        this.list.on("change:to_sync", function (item) {
            if (this.get('sync_all') && !item.get('to_sync')) {
                this.save('sync_all', false);
            }
        }, this);
        xabber.on("push_message", function (message) {
            if (this.get('connected') &&
                    message.username === this.get('username') &&
                    message.from_token !== this.get('token') &&
                    message.action === 'settings_updated') {
                this.synchronize_main_settings();
                this.synchronize_order_settings();
            }
            if (this.get('connected') &&
                message.username === this.get('username') &&
                message.from_token !== this.get('token') &&
                message.action === 'account_updated') {
                this.get_settings();
            }
        }, this);

        this.ready = new $.Deferred();
        if (xabber.url_params.social_auth) {
            let social_auth = xabber.url_params.social_auth;
            delete xabber.url_params.social_auth;
            try {
                let data = JSON.parse(atob(social_auth));
                this.save('token', null);
                this.social_login(data);
                return;
            } catch (e) {}
        }
        if (xabber.url_params.token) {
            this.save('token', xabber.url_params.token);
            delete xabber.url_params.token;
        }
        if (this.get('token')) {
            this.login_by_token();
        } else {
            this.ready.resolve();
        }
    },

    _call_method: function (method, url, data, callback, errback) {
        let request = {
            type: method,
            url: constants.API_SERVICE_URL + url,
            headers: {"Authorization": "Token " + this.get('token')},
            context: this,
            contentType: "application/json",
            dataType: 'json',
            success: (data, textStatus, jqXHR) => {
                callback && callback(data);
            },
            error: (jqXHR, textStatus, errorThrown) => {
                this.onAPIError(jqXHR, errback);
            }
        };
        if (data) {
            request.data = JSON.stringify(data);
        }
        $.ajax(request);
    },

    add_source: function (data) {
        return _.extend({
            source: `${constants.CLIENT_NAME} ${xabber.get('version_number')}`
        }, data);
    },

    get_settings: function () {
        if (this.get('token') !== null) {
            this._call_method('GET', '/accounts/current/', null,
                (data) => {
                    if (data.account_status === 'registered') {
                        this.onUserData(data);
                        this._call_method('GET', '/accounts/current/client-settings/', null,
                            this.onSettings.bind(this),
                            this.onSettingsFailed.bind(this)
                        );
                    } else {
                        utils.dialogs.error(xabber.getString("xabber_account__sync__error_no_permission_to_sync"));
                        this.save({token: null, connected: false});
                        this.trigger('settings_result', null);
                    }
                },
                this.onSettingsFailed.bind(this)
            );
        } else {
            this.trigger('settings_result', null);
        }
    },

    delete_settings: function (jid) {
        if (this.get('connected')) {
            this._call_method('DELETE', '/accounts/current/client-settings/', {jid: jid},
                this.onSettings.bind(this),
                this.onSettingsFailed.bind(this)
            );
        } else {
            this.trigger('settings_result', null);
        }
    },

    synchronize_main_settings: function () {
        if (this.get('connected')) {
            let data = _.map(this.list.where({to_sync: true}), function (settings) {
                return settings.request_data();
            });
            if (data.length) {
                this._call_method('PATCH', '/accounts/current/client-settings/',
                    {settings_data: data},
                    this.onSettings.bind(this),
                    this.onSettingsFailed.bind(this)
                );
            } else {
                this.get_settings();
            }
        } else {
            this.trigger('settings_result', null);
        }
    },

    synchronize_order_settings: function () {
        if (this.get('connected') && this.get('sync_all')) {
            let timestamp = this.list.order_timestamp.get('timestamp');
            let data = this.list.map(function (settings) {
                return {jid: settings.get('jid'), order: settings.get('order')};
            });
            this._call_method('PATCH', '/accounts/current/client-settings/',
                {order_data: {settings: data, timestamp: timestamp}},
                this.onSettings.bind(this),
                this.onSettingsFailed.bind(this)
            );
        } else {
            this.trigger('settings_result', null);
        }
    },

    fetch_from_server: function (data) {
        let deleted_list = data.deleted,
            settings_list = data.settings_data,
            order_timestamp = data.order_data.timestamp,
            order_list = data.order_data.settings,
            list = this.list,
            sync_all = this.get('sync_all');
        _.each(deleted_list, (item) => {
            let settings = list.get(item.jid);
            if (settings && settings.get('to_sync') &&
                    settings.get('timestamp') <= item.timestamp) {
                settings.trigger('delete_account', true);
            }
        });
        _.each(settings_list, function (settings_item) {
            let settings = list.get(settings_item.jid);
            if (settings) {
                if (settings.get('to_sync')) {
                    settings.save(_.extend({
                        timestamp: settings_item.timestamp,
                        deleted: false,
                        synced: true
                    }, settings_item.settings));
                } else {
                    settings.save('synced', settings_item.timestamp >= settings.get('timestamp'));
                }
            }
            if (!settings && sync_all) {
                settings = list.create_from_server(settings_item);
            }
        });
        if (sync_all) {
            let order_map = {}, max_order = 1;
            _.each(order_list, function (order_item) {
                order_map[order_item.jid] = order_item.order;
                if (order_item.order > max_order) {
                    max_order = order_item.order;
                }
            });
            list.order_timestamp.save('timestamp', order_timestamp);
            list.each((settings) => {
                let jid = settings.get('jid'),
                    order = order_map[jid];
                if (!order) {
                    max_order += 1;
                    order = max_order;
                }
                settings.save('order', order);
            });
        }
        this.trigger('settings_result', data);
        this.save('last_sync', utils.now());
    },

    onAPIError: function (jqXHR, errback) {
        let status = jqXHR.status,
            response = jqXHR.responseJSON;
        if (status === 403) {
            this.save({connected: false, token: null});
            if (response.detail === 'Invalid token') {
                if (response.reason === 'not_found') {
                    // TODO remove only Xabber-related XMPP accounts
                } else if (response.reason === 'revoked') {
                    _.each(this.list.where({to_sync: true}), function (settings) {
                        settings.trigger('delete_account', true);
                    });
                } else if (response.reason === 'expired'){
                    utils.dialogs.common(xabber.getString("xabber_account__login__dialog_error__header"), xabber.getString("xabber_account__login__dialog_error__text"),
                        {ok_button: {text: xabber.getString("yes")}, cancel_button: {text: xabber.getString("dialog_version_update__option_not_now")}}
                    ).done((result) => {
                        result && this.trigger('relogin');
                    });
                }
            }
        }
        errback && errback(response, status);
    },

    _login: function (credentials, callback, errback) {
        let request = {
            type: 'POST',
            url: constants.API_SERVICE_URL + '/accounts/login/',
            contentType: "application/json",
            dataType: 'json',
            data: JSON.stringify(this.add_source()),
            success: callback,
            error: (jqXHR, textStatus, errorThrown) => {
                this.onAPIError(jqXHR, errback);
            }
        };
        if (credentials.token) {
            request.headers = {"Authorization": "Token " + credentials.token};
        } else {
            let username = credentials.username,
                password = credentials.password;
            request.headers = {"Authorization": "Basic " + utils.utoa(username+':'+password)};
        }
        $.ajax(request);
    },

    login: function (username, password) {
        this._login({username: username, password: password}, this.onLogin.bind(this),
                this.onLoginFailed.bind(this));
    },

    login_by_token: function () {
        this._login({token: this.get('token')}, this.onLoginByToken.bind(this),
                this.onLoginByTokenFailed.bind(this));
    },

    social_login: function (credentials) {
        $.ajax({
            type: 'POST',
            url: constants.API_SERVICE_URL + '/accounts/social_auth/',
            contentType: "application/json",
            dataType: 'json',
            data: JSON.stringify(this.add_source(credentials)),
            success: this.onSocialLogin.bind(this),
            error: (jqXHR, textStatus, errorThrown) => {
                this.onAPIError(jqXHR, this.onSocialLoginFailed.bind(this));
            }
        });
    },

    revoke_token: function () {
        let token = this.get('token');
        if (token !== null) {
            this._call_method('delete', '/accounts/current/tokens/', {token: token});
        }
        this.save({connected: false, token: null});
        this.storage.clear();
    },

    onLoginByToken: function (data, textStatus, request) {
        this.save({token: data.token, connected: true, sync_request: 'silent'});
        this.get_settings();
        this.ready.resolve();
    },

    onLoginByTokenFailed: function (response, status) {
        this.save('connected', false);
        this.ready.resolve();
    },

    onLogin: function (data, textStatus, request) {
        this.save({token: data.token, connected: true});
        this.get_settings();
    },

    onLoginFailed: function (response, status) {
        this.save('connected', false);
        this.trigger('login_failed', response);
    },

    onSocialLogin: function (data, textStatus, request) {
        this.save({token: data.token, connected: true});
        xabber.body.setScreen('settings-modal', {account_block_name: null});
        this.ready.resolve();
    },

    onSocialLoginFailed: function (response, status) {
        this.save('connected', false);
        xabber.body.setScreen('settings-modal', {account_block_name: null});
        utils.dialogs.error(xabber.getString("xabber_account__login__error_auth_failed"));
        this.ready.resolve();
    },

    onUserData: function (data) {
        let name, xmpp_binding_jid;
        if (data.first_name && data.last_name) {
            name = data.first_name + ' ' + data.last_name;
        } else {
            name = data.username;
        }
        if (data.xmpp_binding) {
            xmpp_binding_jid = data.xmpp_binding.jid;
        }
        this.save({username: data.full_id, name: name, linked_email_list: data.email_list, linked_social: data.social_bindings, xmpp_binding: xmpp_binding_jid });
    },

    onSettings: function (data) {
        let sync_request = this.get('sync_request');
        this.save('sync_request', undefined);
        if (sync_request === 'window') {
            if (!xabber.sync_settings_view)
                xabber.sync_settings_view = new xabber.SyncSettingsView({model: this});
            this.trigger('open_sync_window', data);
        } else {
            this.fetch_from_server(data);
        }
    },

    onSettingsFailed: function (response, status) {
        this.trigger('settings_result', null);
    },

    logout: function () {
        utils.dialogs.ask(xabber.getString("button_quit"), xabber.getString("logout_summary"),
                          [{name: 'delete_accounts', checked: true,
                            text: xabber.getString("xabber_account__dialog_logout__option_delete_accounts")}], { ok_button_text: xabber.getString("button_quit")}).done((res) => {
            if (res) {
                if (xabber.accounts.connected.length > 0)
                    _.each(xabber.accounts.connected, (account) => {
                        account.set('auto_login_xa', false);
                        account.save('auto_login_xa', false);
                    });
                this.revoke_token();
                if (res.delete_accounts) {
                    _.each(this.list.where({to_sync: true}), (settings) => {
                        settings.trigger('delete_account', true);
                    });
                }
            }
        });
    },

    start: function () {
        if (!this.get('connected')) {
            this.fcm_unsubscribe();
        }
        this.get_settings();
    },

    fcm_subscribe: function () {
        this._call_method('post', '/fcm/subscription/', {endpoint_key: xabber.cache.endpoint_key});
    },

    fcm_unsubscribe: function () {
        $.ajax({
            type: 'DELETE',
            url: constants.API_SERVICE_URL + '/fcm/subscription/',
            contentType: "application/json",
            dataType: 'json',
            data: JSON.stringify({endpoint_key: xabber.cache.endpoint_key})
        });
    }
});

xabber.APIAccountAuthView = xabber.BasicView.extend({
    _initialize: function () {
        this.$username_input = this.$('input[name=username]');
        this.$password_input = this.$('input[name=password]');
        this.data.on("change:authentication", this.onChangeAuthenticationState, this);
        return this;
    },

    onRender: function () {
        this.authFeedback({});
        Materialize.updateTextFields();
        this.$username_input.val('').focus();
        this.$password_input.val('');
        this.updateButtons();
    },

    keyUp: function (ev) {
        ev.keyCode === constants.KEY_ENTER && this.submit();
    },

    submit: function () {
        if (this.data.get('authentication')) {
            this.cancel();
            return;
        }
        this.data.set('authentication', true);
        this.authFeedback({});
        let username = this.$username_input.val(),
            password = this.$password_input.val();
        if (!username) {
            return this.errorFeedback({username: xabber.getString("account_auth__error__text_input_username")});
        }
        username = username.trim();
        if (!password)  {
            return this.errorFeedback({password: xabber.getString("dialog_change_password__error__text_input_pass")});
        }
        password = password.trim();
        this.authFeedback({password: xabber.getString("account_auth__feedback__text_authentication")});
        this.model.login(username, password);
    },

    cancel: function () {
        this.data.set('authentication', false);
        this.onRender();
    },

    authFeedback: function (options) {
        this.$username_input.switchClass('invalid', options.username)
            .siblings('span.errors').text(options.username || '');
        this.$password_input.switchClass('invalid', options.password)
            .siblings('span.errors').text(options.password || '');
    },

    errorFeedback: function (options) {
        this.authFeedback(options);
        this.data.set('authentication', false);
    },

    updateButtons: function () {
        let authentication = this.data.get('authentication');
        this.$('.btn-log-in').switchClass('disabled', authentication);
    },

    onChangeAuthenticationState: function () {
        this.updateButtons();
        if (this.data.get('authentication')) {
            this.model.on("change:connected", this.onChangeConnected, this);
            this.model.on("login_failed", this.onLoginFailed, this);
        } else {
            this.model.off("change:connected", this.onChangeConnected, this);
            this.model.off("login_failed", this.onLoginFailed, this);
        }
    },

    onChangeConnected: function () {
        if (this.model.get('connected')) {
            this.successFeedback();
        }
    },

    onLoginFailed: function (response) {
        this.errorFeedback({password: (response && response.detail) || xabber.getString("connection__error__text_authentication_failed_short")});
    },

    socialAuth: function (ev) {
        let origin = window.location.href,
            provider = $(ev.target).closest('.btn-social').data('provider');
        if (provider == 'email') {
            this.closeModal();
            xabber.email_auth_view.show();
            // return;
        }
        else
            window.location.href = constants.XABBER_ACCOUNT_URL + '/social/login/' + provider + '/?origin=' + origin + '&source=Xabber Web';
    }
});

  xabber.XabberLoginByEmailPanel = xabber.APIAccountAuthView.extend({
      className: 'login-panel add-xabber-account-panel',
      template: templates.xabber_login_by_email,

      events: {
          "click .btn-cancel": "close",
          "click .btn-log-in": "submit",
          "keyup input[name=password]": "keyUp"
      },

      render: function () {
          this.$el.openModal({
              opacity: 0.9,
              ready: this.onRender.bind(this),
              complete: this.close.bind(this)
          });
      },

      successFeedback: function () {
          this.authFeedback({});
          this.data.set('authentication', false);
          this.close();
      },

      onRender: function () {
          Materialize.updateTextFields();
          this.$username_input.val('').focus();
          this.$password_input.val('');
      },

      close: function (auth) {
          this.$el.closeModal({ complete: this.hide.bind(this) });
      }
  });

xabber.XabberLoginPanel = xabber.APIAccountAuthView.extend({
    className: 'login-panel',
    template: templates.xabber_login,

    events: {
        "click .login-type": "changeLoginType",
        "click .btn-log-in": "submit",
        "click .btn-social": "socialAuth",
        "click .btn-escape": "openXmppLoginPanel",
        "keyup input[name=password]": "keyUp"
    },

    render: function () {
        this.onRender();
    },

    successFeedback: function () {
        this.authFeedback({});
        this.data.set('authentication', false);
        xabber.body.setScreen('all-chats');
    },

    changeLoginType: function () {
        xabber.body.setScreen('login', {'login_screen': 'xmpp'});
    },

    openXmppLoginPanel: function () {
        xabber.body.setScreen('login', {'login_screen': 'xmpp'});
    }
});

xabber.AddAPIAccountView = xabber.APIAccountAuthView.extend({
    className: 'login-panel add-xabber-account-panel',
    template: templates.add_xabber_account,

    events: {
        "click .account-field .dropdown-content": "selectAccount",
        "click .btn-add": "loginXabberAccount",
        "keyup input[name=password]": "keyUp",
        "click .btn-social": "socialAuth",
        "click .btn-cancel": "closeModal"
    },

    render: function (options) {
        if (!xabber.accounts.connected.length) {
            utils.dialogs.error(xabber.getString("dialog_add_contact__error__text_no_accounts"));
            return;
        }
        options || (options = {});
        let accounts = xabber.accounts.connected,
            jid = options.jid || '';
        this.$('input[name="username"]').val(jid).attr('readonly', !!jid)
            .removeClass('invalid');
        this.$('.single-acc').showIf(accounts.length === 1);
        this.$('.multiple-acc').hideIf(accounts.length === 1);
        this.$('.account-field .dropdown-content').empty();
        _.each(accounts, (account) => {
            this.$('.account-field .dropdown-content').append(
                this.renderAccountItem(account));
        });
        this.bindAccount(accounts[0]);
        this.$('span.errors').text('');
        this.$el.openModal({
            opacity: 0.9,
            ready: () => {
                this.onRender.bind(this);
                this.$('.account-field .dropdown-button').dropdown({
                    inDuration: 100,
                    outDuration: 100,
                    constrainWidth: false,
                    hover: false,
                    alignment: 'left',
                });
            },
            complete: this.closeModal.bind(this)
        });
        return this;
    },

    bindAccount: function (account) {
        this.$('.account-field .dropdown-button .account-item-wrap')
            .replaceWith(this.renderAccountItem(account));
    },

    renderAccountItem: function (account) {
        let $item = $(env.templates.contacts.add_contact_account_item({jid: account.get('jid')}));
        $item.find('.circle-avatar').setAvatar(account.cached_image, this.avatar_size);
        return $item;
    },

    selectAccount: function (ev) {
        let $item = $(ev.target).closest('.account-item-wrap'),
            account = xabber.accounts.get($item.data('jid'));
        this.bindAccount(account);
        this.loginXabberAccount(account);
    },

    loginXabberAccount: function (account) {
        account.set('auto_login_xa', true);
        account.authXabberAccount();
        this.closeModal();
    },

    successFeedback: function () {
        this.authFeedback({});
        this.data.set('authentication', false);
        this.closeModal();
    },

    onHide: function () {
        this.$el.detach();
    },

    closeModal: function () {
        this.$el.closeModal({ complete: this.hide.bind(this) });
    }
});

xabber.SyncSettingsView = xabber.BasicView.extend({
    className: 'modal main-modal sync-settings-modal noselect',
    template: templates.sync_settings,
    ps_selector: '.modal-content',
    avatar_size: constants.AVATAR_SIZES.SYNCHRONIZE_ACCOUNT_ITEM,

    events: {
        "click .btn-sync": "syncSettings",
        "click .btn-cancel": "close",
        "change .sync-all": "changeSyncAll",
        "change .sync-one": "changeSyncOne",
        "click .sync-icon": "changeSyncWay"
    },

    _initialize: function () {
        this.settings = null;
        this.to_sync_map = null;
        this.model.on("open_sync_window", this.render, this);
    },

    render: function (data, options) {
        this.settings = data;
        this.sync_all = this.model.get('sync_all');
        this.accounts = [];
        this.$el.openModal({
            ready: this.onRender.bind(this),
            complete: this.close.bind(this)
        });
    },

    onRender: function () {
        this.$('.accounts-wrap').empty();
        let list = this.model.list,
            accounts_map = {},
            deleted_map = {},
            settings_map = {},
            order_map = {};
        _.each(this.settings.settings_data, function (settings_item) {
            settings_map[settings_item.jid] = settings_item;
        });
        this.settings_map = settings_map;
        _.each(this.settings.order_data.settings, function (order_item) {
            order_map[order_item.jid] = order_item.order;
        });
        _.each(this.settings.deleted, function (deleted_item) {
            deleted_map[deleted_item.jid] = deleted_item.timestamp;
        });

        // Make synchronization list
        _.each(settings_map, (obj, jid) => {
            // pick accounts that are present on server only
            if (!list.get(jid)) {
                accounts_map[jid] = _.extend({
                    jid: jid,
                    to_sync: this.sync_all,
                    sync_way: 'from_server'
                }, obj);
            }
        });
        list.each((settings) => {
            let jid = settings.get('jid'),
                obj = settings_map[jid],
                sync_way;
            if (_.has(deleted_map, jid)) {
                // pick local but deleted from server accounts
                sync_way = deleted_map[jid] >= settings.get('timestamp') ? 'delete' : 'to_server';
                accounts_map[jid] = _.extend({
                    sync_way: sync_way,
                    sync_choose: ['delete', 'to_server']
                }, _.omit(settings.attributes, ['order']));
                settings.save('synced', false);
            } else if (obj) {
                // pick accounts that are present on both server and client
                if (obj.timestamp > settings.get('timestamp')) {
                    sync_way = 'from_server';
                } else if (obj.timestamp < settings.get('timestamp')) {
                    sync_way = 'to_server';
                } else {
                    sync_way = 'no';
                }
                accounts_map[jid] = _.extend({
                    jid: jid,
                    to_sync: settings.get('to_sync'),
                    sync_way: sync_way,
                    sync_choose: sync_way !== 'no' ? ['from_server', 'to_server'] : false
                }, obj.settings);
                settings.save('synced', sync_way === 'no');
            } else {
                // pick local accounts
                accounts_map[jid] = _.extend({
                    sync_way: 'to_server'
                }, _.omit(settings.attributes, ['order']));
                settings.save('synced', false);
            }
        });

        // fetch server order of accounts and merge it with local order
        let max_order = _.max(order_map) || 0;
        _.each(order_map, (order, jid) => {
            accounts_map[jid].order = order;
        });
        list.each((settings) => {
            let jid = settings.get('jid');
            if (!accounts_map[jid].order) {
                accounts_map[jid].order = (++max_order);
            }
        });

        this.accounts_map = accounts_map;
        this.accounts = _.map(accounts_map, function (value, key) { return value; });
        // sort merged list by new order value
        this.accounts.sort(function (acc1, acc2) {
            return acc1.order - acc2.order;
        });
        _.each(this.accounts, this.addAccountHtml.bind(this));
        this.updateSyncOptions();
    },

    addAccountHtml: function (settings) {
        let jid = settings.jid;
        let $account_el = $(templates.sync_settings_account_item({
            jid: jid,
            view: this
        }));
        this.$('.accounts-wrap').append($account_el);
    },

    updateAccountHtml: function (account_wrap) {
        let $account_wrap = $(account_wrap),
            jid = $account_wrap.data('jid'),
            account_item = this.accounts_map[jid];
        this.sync_all && (account_item.to_sync = true);
        $account_wrap.switchClass('sync', account_item.to_sync);
        $account_wrap.find('.sync-one').prop('checked', account_item.to_sync);
        let sync_way;
        if (account_item.to_sync) {
            sync_way = account_item.sync_way;
        } else if (this.model.list.get(jid)) {
            sync_way = 'off_local';
        } else {
            sync_way = 'off_remote';
        }
        let mdiclass = constants.SYNC_WAY_DATA[sync_way].icon,
            $sync_icon = $account_wrap.find('.sync-icon');
        $sync_icon.removeClass($sync_icon.attr('data-mdiclass'))
            .attr('data-mdiclass', mdiclass).addClass(mdiclass);
        $account_wrap.find('.sync-tip').text(xabber.getString(constants.SYNC_WAY_DATA[sync_way].tip));
    },

    updateSyncOptions: function () {
        let list = this.model.list,
            sync_all = this.sync_all,
            accounts_map = this.accounts_map;
        this.$('.sync-all').prop('checked', sync_all ? 'checked' : '');
        this.$('.sync-one').prop('disabled', sync_all ? 'disabled' : '');
        this.$('.account-wrap').each((idx, el) => {
            this.updateAccountHtml(el);
        });
    },

    changeSyncAll: function (ev) {
        let $target = $(ev.target),
            sync_all = $target.prop('checked');
        this.sync_all = sync_all;
        this.$('.sync-one').prop('disabled', sync_all ? 'disabled' : '');
        if (sync_all) {
            _.each(this.accounts, (account_item) => {
                account_item.to_sync = true;
            });
            this.$('.account-wrap').each((idx, el) => {
                this.updateAccountHtml(el);
            });
        }
    },

    changeSyncOne: function (ev) {
        let $target = $(ev.target),
            value = $target.prop('checked'),
            $account_wrap = $target.closest('.account-wrap'),
            jid = $account_wrap.data('jid');
        this.accounts_map[jid].to_sync = value;
        this.updateAccountHtml($account_wrap);
    },

    changeSyncWay: function (ev) {
        let $account_wrap = $(ev.target).closest('.account-wrap'),
            jid = $account_wrap.data('jid'),
            account_item = this.accounts_map[jid];
        if (!account_item.to_sync || !account_item.sync_choose) {
            return;
        }
        let sync_choose = account_item.sync_choose,
            idx = sync_choose.indexOf(account_item.sync_way) + 1;
        if (idx === sync_choose.length) {
            idx = 0;
        }
        account_item.sync_way = sync_choose[idx];
        this.updateAccountHtml($account_wrap);
    },

    syncSettings: function () {
        let list = this.model.list,
            sync_all = this.sync_all;
        this.model.save('sync_all', this.sync_all);
        _.each(this.accounts, function (account_item) {
            let jid = account_item.jid,
                settings = list.get(jid);
            if (settings) {
                settings.save('to_sync', account_item.to_sync);
                if (sync_all) {
                    settings.save('order', account_item.order);
                }
                let sync_way = account_item.sync_way;
                if (sync_way === 'to_server') {
                    settings.update_timestamp();
                } else if (sync_way === 'from_server' || sync_way === 'delete') {
                    settings.save('timestamp', 0);
                }
            }
            if (!settings && account_item.to_sync) {
                settings = list.create_from_server(
                    _.omit(account_item, ['sync_way', 'sync_choose']));
            }
        });
        this.model.synchronize_main_settings();
        this.do_sync = true;
        this.close();
    },

    onHide: function () {
        this.$el.detach();
        if (xabber.body.isScreen('blank')) {
            xabber.body.setScreen('all-chats');
        }
    },

    close: function () {
        if (!this.do_sync) {
            this.model.trigger('settings_result', null);
        }
        this.do_sync = null;
        this.settings = null;
        this.settings_map = null;
        this.closeModal();
    },

    closeModal: function () {
        this.$el.closeModal({ complete: this.hide.bind(this) });
    }
});

xabber.APIAccountView = xabber.BasicView.extend({
    className: 'setting xabber-account',
    template: templates.xabber_account,
    avatar_size: constants.AVATAR_SIZES.XABBER_ACCOUNT,

    events: {
        "click .account-info-wrap": "openAccount",
        "click .btn-login": "login",
        "click .btn-logout": "logout",
        "click .btn-set-password": "setPassword",
        "click .btn-sync-settings": "synchronize",
        "click .social-linked-header": "changeExpanded",
        "click .btn-unlink": "unlinkSocial",
        "click .btn-link": "linkSocial",
        "click .btn-verify-email": "verifyEmail"
    },

    _initialize: function () {
        this.$el.appendTo(this.parent.$('.settings-block-wrap.xabber-account'));
        this.$tab = this.parent.$('.xabber-account-tab');
        this.updateForConnectedStatus();
        this.default_color = utils.images.getDefaultColor(this.model.get('username'));
        this.model.on("change:username", this.updateName, this);
        this.model.on("change:name", this.updateAvatar, this);
        this.model.on("change:connected", this.updateForConnectedStatus, this);
        this.model.on("change:last_sync", this.updateLastSyncInfo, this);
        this.model.on("change:linked_email_list", this.updateSocialBindings, this);
        this.model.on("change:linked_social", this.updateSocialBindings, this);
        this.model.on("relogin", this.login, this);
        this.data.on("change:sync", this.updateSyncButton, this);
        this.data.on("change:expanded", this.updateExpanded, this);
        this.data.set('expanded', false);
    },

    render: function () {
        this.data.set('sync', false);
        this.$('span.errors ').html("");
        this.updateLastSyncInfo();
        this.updateSocialBindings();
        this.$('.btn-more').dropdown({
            inDuration: 100,
            outDuration: 100,
            hover: false
        });
    },

    changeExpanded: function () {
        this.data.set('expanded', (this.data.get('expanded')) ? false : true);
    },

    updateExpanded: function () {
        let expanded = this.data.get('expanded');
        this.$('.arrow').switchClass('mdi-chevron-down', expanded);
        this.$('.arrow').switchClass('mdi-chevron-right', !expanded);
        this.$('.social-linked-wrap').showIf(expanded);
    },

    updateSocialBindings: function () {
        let linked_emails = this.model.get('linked_email_list'),
            linked_social = this.model.get('linked_social');
        this.$('.email-linked').remove();
        this.$('.social-account').each(function (idx, item) {
            let $social_item = $(item);
            $social_item.addClass('not-linked');
            $social_item.find('.synced-info').text(xabber.getString("title_not_linked_account"));
            $social_item.find('.btn-link').text(xabber.getString("action_connect")).removeClass('btn-unlink');
        });
        _.each(linked_emails, (email) => {
            let email_id = email.id,
                email_address = email.email,
                is_verified = email.verified,
                email_item_html = $(templates.linked_email_item({email_id: email_id, email: email_address, verified: is_verified, color: this.default_color}));
            email_item_html.insertBefore(this.$('#email.not-linked'));
        });
        _.each(linked_social, (social) => {
            let social_provider = social.provider,
                social_name = social.first_name + " " + social.last_name;
            this.$('.'+ social_provider + '-linked').removeClass('not-linked');
            this.$('.' + social_provider + '-linked .btn-link').text(xabber.getString("action_disconnect")).addClass('btn-unlink');
            this.$('.'+ social_provider + '-linked .synced-info').html($(`<div class="name one-line">${social_name}</div><div class="verified-status one-line">${xabber.getString("title_linked_account", [social_provider])}</div>`));
        });
    },

    linkSocial: function (ev) {
        if ((this.model.get('token'))&&(!$(ev.target).hasClass('btn-unlink'))) {
            let social_elem = $(ev.target).closest('.social-linked-item-wrap'),
                provider = social_elem.attr('id');
            if (provider === 'email') {
                utils.dialogs.ask_enter_value(xabber.getString("xabber_account__dialog_add_email__header"), null, {input_placeholder_value: xabber.getString("xabber_account__dialog_add_email__hint_enter_email")}, { ok_button_text: xabber.getString("action_connect")}).done((mail) => {
                    if (mail) {
                        this.model._call_method('POST', '/accounts/current/email_list/', {email: mail},
                            (mail_data) => {
                                let email_list = this.model.get('linked_email_list');
                                email_list.push(mail_data);
                                this.model.set('linked_email_list', email_list);
                                this.updateSocialBindings();
                            },
                            (jqXHR, textStatus, errorThrown) => {
                                this.$('span.errors ').text(jqXHR.email[0]);
                            });
                    }
                });
            }
            else {
                this.openAccount();
            }
        }
    },

    verifyEmail: function (ev) {
        let $target = $(ev.target),
            $email_html = $target.closest('.social-linked-item-wrap'),
            email_address = $email_html.data('email');
        utils.dialogs.ask_enter_value(xabber.getString("title_email_confirm"), null, {input_placeholder_value: xabber.getString("xabber_account__dialog_confirm_email__hint_enter_code")}, { ok_button_text: xabber.getString("button_confirm"), resend_button_text: xabber.getString("button_resend_link"), resend_to: email_address}).done((code) => {
            if (code) {
                if (code === email_address) {
                    this.model._call_method('POST', '/accounts/current/email_list/', {email: code});
                }
                else {
                    this.model._call_method('POST', '/accounts/email_confirmation/', {code: code},
                        (mail_data) => {
                            let email_list = mail_data.email_list;
                            this.model.set('linked_email_list', email_list);
                            this.updateSocialBindings();
                        }, (jqXHR, textStatus, errorThrown) => {
                            this.$('span.errors').text(jqXHR.code[0]);
                        });
                }
            }
        });
    },

    unlinkSocial: function (ev) {
        let $target = $(ev.target);
        if (!$target.hasClass('btn-verify-email')) {
            let $social_html = $target.closest('.social-linked-item-wrap');
            let provider = $social_html.attr('id'),
                is_email = $social_html.data('email');
            if (is_email) {
                let email_address = $social_html.data('email');
                utils.dialogs.ask(xabber.getString("xabber_account__dialog_unlink_email__header"), xabber.getString("title_delete_email"), null, {ok_button_text: xabber.getString("action_disconnect")}).done((result) => {
                    if (result) {
                        this.model._call_method('DELETE', '/accounts/current/email_list/' + $social_html.data('id') + '/', null,
                            (mail_data) => {
                                let email_list = this.model.get('linked_email_list'),
                                    deleted_mail_index = email_list.indexOf(email_list.find(email => email.id === $social_html.data('id')));
                                email_list.splice(deleted_mail_index, 1);
                                this.model.set('linked_email_list', email_list);
                                this.updateSocialBindings();
                            }, (jqXHR, textStatus, errorThrown) => {
                                this.model.get_settings();
                            });
                    }
                });
            }
            else if (provider !== 'email') {
                utils.dialogs.ask(xabber.getString("xabber_account__dialog_unlink_social__header"), xabber.getString("title_delete_social", [provider]), null, {ok_button_text: xabber.getString("action_disconnect")}).done((result) => {
                    if (result) {
                        this.model._call_method('POST', '/accounts/current/social_unbind/', {provider: provider},
                            () => {
                                let social_list = this.model.get('linked_social'),
                                    deleted_social_index = social_list.indexOf(social_list.find(social => social.provider === provider));
                                social_list.splice(deleted_social_index, 1);
                                this.model.set('linked_social', social_list);
                                this.updateSocialBindings();
                            }, (jqXHR, textStatus, errorThrown) => {
                                this.model.get_settings();
                            });
                    }
                });
            }
        }
    },

    updateName: function () {
        this.$('.account-info-wrap .name').text(this.model.get('username'));
        this.default_color = utils.images.getDefaultColor(this.model.get('username'));
    },

    updateAvatar: function () {
        let name = this.model.get('name'),
            image = this.model.get('image') || utils.images.getDefaultAvatar(name);
        this.$('.circle-avatar').setAvatar(utils.images.getCachedImage(image), this.avatar_size);
    },

    updateForConnectedStatus: function () {
        let connected = this.model.get('connected');
        this.$tab.switchClass('online', connected)
                 .switchClass('offline', !connected);
        this.$('.linked-social-accounts-and-emails').showIf(connected);
        this.$('.account-info-wrap').showIf(connected);
        this.$('.sync-wrap').showIf(connected);
        if (connected) {
            this.updateName();
            this.updateAvatar();
            this.updateSyncButton();
            this.updateLastSyncInfo();
        }
        this.$('.btn-login').hideIf(connected);
        this.$('.btn-more').showIf(connected);
    },

    updateSyncButton: function () {
        let sync = this.data.get('sync');
        this.$('.btn-sync .button').hideIf(sync);
        this.$('.btn-sync .preloader-wrapper').showIf(sync);
    },

    updateLastSyncInfo: function () {
        let last_sync = this.model.get('last_sync');
        if (last_sync) {
            let time_delta = utils.now() - last_sync;
            this.$('.last-sync-info').text(xabber.getString("xabber_account__last_sync__text", [env.moment(env.moment.now() - 1000*time_delta).fromNow()]));
        } else {
            this.$('.last-sync-info').text(xabber.getString("xabber_account__last_sync__not_synced"));
        }
    },

    synchronize: function () {
        if (!this.data.get('sync')) {
            this.data.set('sync', true);
            this.model.once("settings_result", function () {
                this.data.set('sync', false);
            }, this);
            this.model.save('sync_request', 'window');
            this.model.get_settings();
        }
    },

    login: function () {
        if (xabber.add_api_account_view && xabber.accounts.connected.length > 1)
            xabber.add_api_account_view.show();
        else {
            let account = xabber.accounts.connected[0];
            if (account) {
                account.set('auto_login_xa', true);
                account.authXabberAccount();
            }
        }
    },

    logout: function () {
        this.model.logout();
    },

    onPasswordResetFailed: function () {
        utils.dialogs.error(xabber.getString("password_reset_need_email"));
    },

    setPassword: function () {
        let email_list = this.model.get('linked_email_list');
        if (email_list) {
            let verified_email = email_list.find(mail => mail.verified === true);
            if (email_list.indexOf(verified_email) != -1) {
                $.ajax({
                    type: 'POST',
                    url: constants.API_SERVICE_URL + '/accounts/password_reset_request/',
                    contentType: "application/json",
                    dataType: 'json',
                    data: JSON.stringify({email: verified_email.email}),
                    success: () => {
                        utils.dialogs.notify(xabber.getString("button_reset_pass"), xabber.getString("password_reset_success", [verified_email.email]));
                    },
                    error: this.onPasswordResetFailed.bind(this)
                });
            }
            else
                this.onPasswordResetFailed();
        }
        else
            this.onPasswordResetFailed();
    },

    openAccount: function () {
        utils.openWindow(constants.XABBER_ACCOUNT_URL + '/?token=' + this.model.get('token'));
    }
});


xabber.once("start", function () {
        this.account_settings_list = new this.AccountSettingsList(null, {
            storage_name: this.getStorageName() + '-account-settings'
        });
        this.account_settings_list.fetch();
        this.account_settings_list.order_timestamp = new this.AccountsOrderTimestamp(
            {id: 'accounts-order-timestamp'},
            {storage_name: this.getStorageName(), fetch: 'after'}
        );
    if (constants.ENABLE_XABBER_ACCOUNT) {
        this.api_account = new this.APIAccount({id: 'api-account'},
            {
                storage_name: this.getStorageName(), fetch: 'before',
                settings_list: this.account_settings_list
            });
    }

        this.xabber_login_panel = xabber.login_page.addChild(
            'xabber_login', this.XabberLoginPanel, {model: this.api_account});

    if (constants.ENABLE_XABBER_ACCOUNT) {
        this.settings_view.addChild('api-account', this.APIAccountView,
            {model: this.api_account});

        this.add_api_account_view = new this.AddAPIAccountView({model: this.api_account});
        this.email_auth_view = new xabber.XabberLoginByEmailPanel({
            parent: this.add_api_account_view,
            model: this.api_account
        });
    }
}, xabber);

export default xabber;