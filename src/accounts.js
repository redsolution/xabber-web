define("xabber-accounts", function () {
    return function (xabber) {
        var env = xabber.env,
            constants = env.constants,
            templates = env.templates.accounts,
            utils = env.utils,
            $ = env.$,
            $iq = env.$iq,
            $msg = env.$msg,
            $pres = env.$pres,
            Strophe = env.Strophe,
            _ = env._,
            moment = env.moment,
            Images = utils.images;


        xabber.Account = Backbone.Model.extend({
                idAttribute: 'jid',

                defaults: {
                    enabled: true,
                    auth_type: "password",
                    status: "online",
                    status_message: "",
                    priority: 0,
                    auto_login_xa: true
                },

                initialize: function (_attrs, options) {
                    options || (options = {});
                    if (_attrs.is_new && !options.auth_view) {
                        this.is_invalid = true;
                        this.on("destroy", this.onDestroy, this);
                        return;
                    }
                    this.settings = xabber.account_settings_list.get(_attrs.jid);
                    if (!this.settings) {
                        this.settings = xabber.account_settings_list.create({
                            jid: _attrs.jid,
                            timestamp: 0,
                            auto_login_xa: this.get('auto_login_xa'),
                            to_sync: xabber.api_account.get('sync_all')
                        });
                    }
                    var settings = _.clone(this.settings.attributes);
                    settings.color || (settings.color = this.collection.getDefaultColor());
                    settings.order || (settings.order = this.collection.getLastOrder() + 1);
                    this.settings.save(settings);
                    this.settings.on("delete_account", this.deleteAccount, this);
                    var attrs = _.clone(_attrs);
                    attrs.name || (attrs.name = attrs.jid);
                    attrs.image || (attrs.image = Images.getDefaultAvatar(attrs.name));
                    this.cached_image = Images.getCachedImage(attrs.image);
                    attrs.vcard = utils.vcard.getBlank(attrs.jid);
                    attrs.photo_hash = '';
                    this.save(attrs);
                    this.auth_view = options.auth_view || null;
                    this.session = new Backbone.Model({
                        connected: false,
                        reconnected: false,
                        conn_retries: 0,
                        conn_feedback: 'Disconnected'
                    });
                    this.session.on("change:connected", this.onChangedConnected, this);
                    this.conn_manager = new Strophe.ConnectionManager();
                    this.connection = this.conn_manager.connection;
                    this.on("destroy", this.onDestroy, this);
                    this._added_pres_handlers = [];
                    this._pending_stanzas = [];
                    this._pending_messages = [];
                    this.xabber_auth = {};
                    this.dfd_presence = new $.Deferred();
                    this.resources = new xabber.AccountResources(null, {account: this});
                    this.password_view = new xabber.ChangePasswordView({model: this});
                    this.settings_left = new xabber.AccountSettingsLeftView({model: this});
                    this.settings_right = new xabber.AccountSettingsRightView({model: this});
                    this.vcard_edit = new xabber.VCardEditView({model: this});
                    this.updateColorScheme();
                    this.settings.on("change:color", this.updateColorScheme, this);
                    this.on("change:photo_hash", this.getVCard, this);
                    _.each(this._init_plugins, function (plugin) {
                        plugin.call(this);
                    }.bind(this));
                    this.connection.xmlInput = function (xml) {
                        xabber.info('input');
                        xabber.info(xml);
                    };
                    this.connection.xmlOutput = function (xml) {
                        xabber.info('output');
                        xabber.info(xml);
                    };
                    this.once("start", this.start, this);
                    xabber.api_account.on("settings_result", function (result) {
                        if (result && this.settings.get('token')) {
                            this.save({auth_type: 'token', password: ''});
                        }
                        this.trigger('start');
                    }, this);
                },

                start: function () {
                    this.get('enabled') && this.isOnline() && this.connect();
                },

                _init_plugins: [],

                getPassword: function () {
                    try {
                        return utils.atou(this.get('password'));
                    } catch (e) {
                        return '';
                    }
                },

                isConnected: function () {
                    return this.session && this.session.get('connected');
                },

                isOnline: function () {
                    return this.get('status') !== 'offline';
                },

                sendMsg: function (stanza, callback) {
                    var res = this.connection.authenticated && this.get('status') !== 'offline';
                    if (res) {
                        this.connection.send(stanza);
                        callback && callback();
                    } else {
                        this._pending_stanzas.push({stanza: stanza, callback: callback});
                    }
                    return res;
                },

                sendIQ: function () {
                    var res = this.connection.authenticated && this.get('status') !== 'offline';
                    if (res) {
                        this.connection.sendIQ.apply(this.connection, arguments);
                    } else {
                        this._pending_stanzas.push({stanza: arguments});
                    }
                    return res;
                },

                sendPres: function (stanza) {
                    if (this.connection.authenticated) {
                        this.connection.send(stanza);
                    } else {
                        this._pending_stanzas.push({stanza: stanza});
                    }
                    return this.connection.authenticated;
                },

                verifyXabberAccount: function (code, callback) {
                    var request = {
                        type: 'POST',
                        url: constants.API_SERVICE_URL + '/accounts/xmpp_auth/',
                        contentType: "application/json",
                        dataType: 'json',
                        data: JSON.stringify({ code: code, jid: this.connection.jid}),
                        success: function (data, textStatus, jqXHR) {
                            callback && callback(data.token);
                        }
                    };
                    $.ajax(request);
                },

                connect: function () {
                    var jid = this.get('jid'),
                        auth_type = this.get('auth_type'),
                        password;
                    jid += '/xabber-web-' + xabber.get('client_id');
                    if (auth_type === 'token') {
                        password = this.settings.get('token');
                    } else if (auth_type === 'x-token') {
                        if (this.get('x_token'))
                            password = this.get('x_token').token;
                        else
                            password = undefined;
                    } else {
                        password = this.getPassword();
                    }
                    if (!password) {
                        this.password_view.show({login: true});
                        return;
                    }
                    this.session.set({
                        connected: false,
                        reconnected: false,
                        reconnecting: false,
                        conn_retries: 0,
                        conn_feedback: 'Connecting...',
                        auth_failed: false
                    });
                    this.restoreStatus();
                    this.conn_manager.connect(auth_type, jid, password, this.connectionCallback.bind(this));
                },

                reconnect: function () {
                    var conn_retries = this.session.get('conn_retries'),
                        timeout = conn_retries < 3 ? constants.RECONNECTION_TIMEOUTS[conn_retries] : 20000;
                    this.connection.reset();
                    this.session.set({
                        connected: false,
                        reconnected: false,
                        reconnecting: true,
                        conn_retries: ++conn_retries,
                        conn_feedback: 'Reconnect after '+timeout/1000+' seconds...',
                        auth_failed: false
                    });
                    setTimeout(function () {
                        this.connFeedback('Connecting...');
                        this.restoreStatus();
                        this.conn_manager.reconnect(this.reconnectionCallback.bind(this));
                    }.bind(this), timeout);
                },

                connectionCallback: function (status, condition) {
                    if (this.session.get('reconnecting')) {
                        xabber.info('ignore connection callback for status: '+constants.CONN_STATUSES[status]);
                        return;
                    }
                    this.auth_view && this.loginCallback(status, condition);
                    this.session.set({conn_status: status, conn_condition: condition});
                    if ((status === Strophe.Status.ERROR) && (condition === 'conflict') && (!this.session.get('delete'))) {
                        this.onTokenRevoked();
                        this.deleteAccount();
                    }
                    if (status === Strophe.Status.CONNECTED) {
                        this.session.set({connected: true, reconnected: false});
                        if ((!xabber.api_account.get('connected'))&&(this.get('auto_login_xa'))&&(!xabber.api_account.get('token')))
                            this.connectXabberAccount();
                    } else if (status === Strophe.Status.AUTHFAIL) {
                        this.onAuthFailed();
                    } else if (status === Strophe.Status.DISCONNECTED) {
                        this.connection.flush();
                        this.session.set({connected: false});
                    }
                },

                connectXabberAccount: function () {
                    var iq_private_storage = $iq({type: 'get'}).c('query', {xmlns: Strophe.NS.PRIVATE_STORAGE}).c('storage', {xmlns:'xabber:options'});
                    this.sendIQ(iq_private_storage, function (iq) {
                        if (($(iq).find('option').attr('type') == 'bind') && ($(iq).find('option').text() == 1)) {
                            this.authXabberAccount();
                        }
                    }.bind(this));
                },
                authXabberAccount: function (callback) {
                    this.requestPassword(function(data) {
                        this.xabber_auth = { api_jid: data.api_jid, request_id: data.request_id };
                        if (this.chats.code_requests.length > 0) {
                            var verifying_code = this.chats.code_requests.find(verifying_mess => (verifying_mess.jid === this.xabber_auth.api_jid && verifying_mess.id === this.xabber_auth.request_id));
                            if (verifying_code) {
                                this.verifyXabberAccount(verifying_code.code, function (data) {
                                    xabber.api_account.save('token', data);
                                    xabber.api_account.login_by_token();
                                    callback && callback();
                                }.bind(this));
                            }
                        }
                        var iq_send_auth_mark = $iq({type: 'set'})
                            .c('query', {xmlns: Strophe.NS.PRIVATE_STORAGE})
                            .c('storage', {xmlns:'xabber:options'})
                            .c('option', {type: 'bind'}).t(1);
                        this.sendIQ(iq_send_auth_mark);
                    }.bind(this));
                },

                requestPassword: function(callback) {
                    var request = {
                        type: 'POST',
                        url: constants.API_SERVICE_URL + '/accounts/xmpp_code_request/',
                        contentType: "application/json",
                        dataType: 'json',
                        data: JSON.stringify({ jid: this.connection.jid }),
                        success: function (data, textStatus, jqXHR) {
                            callback && callback(data);
                        }
                    };
                    $.ajax(request);
                },

                reconnectionCallback: function (status, condition) {
                    if (!this.session.get('reconnecting')) {
                        xabber.info('ignore reconnection callback for status: '+constants.CONN_STATUSES[status]);
                        return;
                    }
                    this.session.set({conn_status: status, conn_condition: condition});
                    if (status === Strophe.Status.CONNECTED) {
                        this.connection.connect_callback = this.connectionCallback.bind(this);
                        this.session.set({connected: true, reconnected: true,
                            reconnecting: false, conn_retries: 0});
                    } else if (status === Strophe.Status.AUTHFAIL) {
                        this.onAuthFailed();
                    } else if (status === Strophe.Status.DISCONNECTED) {
                        this.connection.flush();
                        var max_retries = xabber.settings.max_connection_retries;
                        if (max_retries === -1 || this.session.get('conn_retries') < max_retries) {
                            this.reconnect();
                        } else {
                            this.connFeedback('Connection lost!');
                        }
                    }
                },

                loginCallback: function (status, condition) {
                    if (status === Strophe.Status.CONNECTED) {
                        this.save('is_new', undefined);
                        this.auth_view.successFeedback(this);
                    } else if (_.contains(constants.BAD_CONN_STATUSES, status)) {
                        if (status === Strophe.Status.ERROR) {
                            status = 'Connection error';
                        } else if (status === Strophe.Status.CONNFAIL) {
                            status = 'Connection failed';
                        } else if (status === Strophe.Status.AUTHFAIL) {
                            status = 'Authentication failed';
                        } else if (status === Strophe.Status.DISCONNECTED) {
                            status = 'Disconnected';
                        } else if (status === Strophe.Status.CONNTIMEOUT) {
                            status = 'Connection timeout expired';
                        }
                        condition = condition ? ': ' + condition : '';
                        this.auth_view.errorFeedback({password: status + condition});
                        this.get('is_new') && this.destroy();
                    }
                },

                onAuthFailed: function () {
                    if (!this.auth_view) {
                        utils.dialogs.error('Authentication failed for account ' +
                            this.get('jid'));
                    }
                    this.session.set({
                        auth_failed: true,
                        no_reconnect: true
                    });
                    this.trigger('deactivate', this);
                    this.connFeedback('Authentication failed');
                },

                onTokenRevoked: function () {
                    if (!this.auth_view) {
                        utils.dialogs.error('Token was revoked for account ' +
                            this.get('jid'));
                    }
                    this.session.set({
                        auth_failed: true,
                        no_reconnect: true
                    });
                    this.trigger('deactivate', this);
                    this.connFeedback('Authentication failed');
                },

                onChangedConnected: function () {
                    if (this.isConnected()) {
                        this.session.get('reconnected') ? this.onReconnected() : this.onConnected();
                    } else {
                        this.onDisconnected();
                    }
                },

                onConnected: function () {
                    this.connFeedback('Connected');
                    this.jid = this.connection.jid;
                    this.resource = Strophe.getResourceFromJid(this.jid);
                    this.domain = Strophe.getDomainFromJid(this.jid);
                    this.trigger('activate', this);
                    this.afterConnected();
                    _.each(this._after_connected_plugins, function (plugin) {
                        plugin.call(this);
                    }.bind(this));
                },

                onReconnected: function () {
                    this.connFeedback('Connected');
                    this.afterConnected();
                    _.each(this._after_reconnected_plugins, function (plugin) {
                        plugin.call(this);
                    }.bind(this));
                },

                afterConnected: function () {
                    this.registerPresenceHandler();
                    this.enableCarbons();
                    this.getVCard();
                    this.sendPendingStanzas();
                },

                sendPendingStanzas: function () {
                    _.each(this._pending_stanzas, function (item) {
                        if (item.stanza instanceof Strophe.Builder) {
                            this.connection.send(item.stanza);
                            item.callback && item.callback();
                        } else {
                            this.connection.sendIQ.apply(this.connection, item.stanza);
                        }
                    }.bind(this));
                    this._pending_stanzas = [];
                },

                _after_connected_plugins: [],
                _after_reconnected_plugins: [],

                onDisconnected: function () {
                    if (this.session.get('delete')) {
                        this.destroy();
                        return;
                    }
                    var deactivate = this.session.get('deactivate');
                    if (deactivate) {
                        this.connFeedback('Disconnected');
                        this.session.set('deactivate', null);
                        if (deactivate === 'set_off') {
                            this.trigger('deactivate', this);
                        }
                    } else {
                        if (this.session.get('no_reconnect')) {
                            this.session.set('no_reconnect', false);
                        } else {
                            this.reconnect();
                        }
                    }
                },

                connFeedback: function (message) {
                    this.session.set("conn_feedback", message);
                },

                enableCarbons: function () {
                    var iq = $iq({type: 'set'}).c('enable', {xmlns: Strophe.NS.CARBONS});
                    this.sendIQ(iq);
                },

                getVCard: function (callback) {
                    var jid = this.get('jid'),
                        is_callback = _.isFunction(callback);
                    this.connection.vcard.get(jid,
                        function (vcard) {
                            var attrs = {
                                vcard: vcard,
                                vcard_updated: moment.now()
                            };
                            attrs.name = vcard.nickname || vcard.fullname || (vcard.first_name + ' ' + vcard.last_name).trim() || jid;
                            attrs.image = vcard.photo.image || Images.getDefaultAvatar(attrs.name);
                            this.cached_image = Images.getCachedImage(attrs.image);
                            this.save(attrs);
                            is_callback && callback(vcard);
                        }.bind(this),
                        function () {
                            is_callback && callback(null);
                        }
                    );
                },

                setVCard: function (data, callback, errback) {
                    var vcard = _.extend(_.clone(this.get('vcard')), data);
                    this.connection.vcard.set(this.get('jid'), vcard, callback, errback);
                },

                getStatusMessage: function () {
                    return this.get('status_message') || constants.STATUSES[this.get('status')];
                },

                setStatus: function (status, message) {
                    var attrs = { status_updated: moment.now() };
                    status !== null && (attrs.status = status);
                    message !== null && (attrs.status_message = message || '');
                    if (status === 'offline' && this.get('status') !== 'offline') {
                        attrs.status_prev = this.get('status');
                    }
                    this.save(attrs);
                    if (!this.get('enabled')) {
                        return;
                    }
                    if (status === 'offline') {
                        this.deactivate('set_offline');
                    } else if (!this.isConnected()) {
                        this.activate();
                    } else {
                        this.sendPresence();
                    }
                },

                restoreStatus: function () {
                    if (this.get('status') === 'offline') {
                        this.save({
                            status_updated: moment.now(),
                            status: this.get('status_prev') || 'online',
                            status_prev: undefined
                        });
                    }
                },

                sendPresence: function (type, message) {
                    var type = type || this.get('status'),
                        status_message = message || this.get('status_message');
                    var stanza = $pres();
                    if (type === 'offline') {
                        stanza.attrs({'type': 'unavailable'});
                    } else {
                        if (type !== 'online') {
                            stanza.c('show').t(type).up();
                        }
                        stanza.c('status').t(status_message).up();
                        stanza.c('priority').t(this.get('priority')).up();
                    }
                    stanza.cnode(this.connection.caps.createCapsNode({
                        node: 'https://www.xabber.com/'
                    }).tree());
                    return this.sendPres(stanza);
                },

                showSettings: function (right, block_name) {
                    xabber.body.setScreen('account_settings', {
                        account: this, right: right, block_name: block_name
                    });
                    this.trigger('open_settings');
                },

                updateColorScheme: function () {
                    var color = this.settings.get('color');
                    this.settings_left.$el.attr('data-color', color);
                    this.settings_right.$el.attr('data-color', color);
                    this.settings_right.$('.account-color .current-color-name').text(color);
                    this.vcard_edit.$el.attr('data-color', color);
                },

                revokeXToken: function (token_uid, callback) {
                    var iq = $iq({
                        from: this.get('jid'),
                        type: 'set',
                        to: Strophe.getDomainFromJid(this.get('jid'))
                    }).c('revoke', {xmlns:Strophe.NS.AUTH_TOKENS});
                    for (var token_num = 0; token_num < token_uid.length; token_num++) {
                        iq.c('token-uid').t(token_uid[token_num]).up();
                    }
                    this.sendIQ(iq, function () {
                        callback && callback();
                    }.bind(this));
                },

                deleteAccount: function (show_settings) {
                    this.show_settings_after_delete = show_settings;
                    if (this.get('x_token'))
                        this.revokeXToken([this.get('x_token').token_uid]);
                    this.session.set('delete', true);
                    this.deactivate();
                },

                activate: function () {
                    if (!this.isConnected()) {
                        this.connect();
                    }
                },

                deactivate: function (type) {
                    type || (type = 'set_off');
                    this.session.set('deactivate', type);
                    if (this.isConnected()) {
                        this.connFeedback('Disconnecting...');
                        this.sendPresence('offline');
                        this.connection.disconnect();
                    } else {
                        this.onDisconnected();
                    }
                },

                onDestroy: function () {
                    this.connection.connect_callback = null;
                    this.settings.destroy();
                },

                registerPresenceHandler: function () {
                    this.connection.deleteHandler(this._pres_handler);
                    this._pres_handler = this.connection.addHandler(
                        function (presence) {
                            this.onPresence(presence);
                            return true;
                        }.bind(this), null, 'presence', null);
                },

                onPresence: function (presence) {
                    var $presence = $(presence),
                        type = presence.getAttribute('type');
                    if (type === 'error') { return; }
                    if (($presence.find('x').attr('xmlns') || '').indexOf(Strophe.NS.GROUP_CHAT) === 0) {
                        chat_type = 'group_chat';
                    }
                    var jid = presence.getAttribute('from'),
                        bare_jid = Strophe.getBareJidFromJid(jid);
                    if (bare_jid !== this.get('jid')) {
                        _.each(this._added_pres_handlers, function (handler) {
                            handler(presence, bare_jid);
                        });
                        return;
                    };
                    var resource = Strophe.getResourceFromJid(jid),
                        priority = Number($presence.find('priority').text()),
                        status = $presence.find('show').text() || 'online',
                        status_message = $presence.find('status').text();
                    _.isNaN(priority) && (priority = 0);
                    var $vcard_update = $presence.find('x[xmlns="'+Strophe.NS.VCARD_UPDATE+'"]');
                    if ($vcard_update.length) {
                        this.save('photo_hash', $vcard_update.find('photo').text());
                    }
                    if (resource && resource !== this.resource) {
                        var resource_obj = this.resources.get(resource);
                        if (type === 'unavailable') {
                            if (resource_obj) { resource_obj.destroy(); }
                        } else {
                            var attrs = {
                                resource: resource,
                                priority: priority,
                                status: status,
                                status_message: status_message
                            };
                            if (!resource_obj) {
                                resource_obj = this.resources.create(attrs);
                            } else {
                                resource_obj.set(attrs);
                            }
                        }
                    }
                }
            },
            {
                addInitPlugin: function (func) {
                    this.prototype._init_plugins.push(func);
                },

                addConnPlugin: function (func, conn, reconn) {
                    conn && this.prototype._after_connected_plugins.push(func);
                    reconn && this.prototype._after_reconnected_plugins.push(func);
                }
            });

        xabber.Accounts = Backbone.CollectionWithStorage.extend({
            model: xabber.Account,
            comparator: function (acc1, acc2) {
                return acc1.settings.get('order') < acc2.settings.get('order') ? -1 : 1;
            },

            _initialize: function (models, options) {
                this.settings_list = xabber.account_settings_list;
                this.getEnabledList();
                this.getConnectedList();
                this.on("add", this.onAdd, this);
                this.on("destroy", this.onDestroy, this);
                this.on("change:enabled", this.getEnabledList, this);
                this.on("update_order", this.onUpdatedOrder, this);
                this.on("add destroy activate deactivate", this.onListChanged, this);
                xabber.on("quit", this.onQuit, this);
                this.settings_list.on("add_settings", this.onSettingsAdded, this);
                xabber.api_account.on("settings_result", function (result) {
                    result && this.trigger('update_order');
                }, this);
            },

            onQuit: function () {
                xabber.api_account.revoke_token();
                _.each(_.clone(this.models), function (account) {
                    account.deleteAccount();
                });
            },

            getEnabledList: function () {
                this.enabled = this.filter(function (account) {
                    return account.get('enabled');
                });
            },

            getConnectedList: function () {
                this.connected = this.filter(function (account) {
                    return account.isConnected();
                });
            },

            onListChanged: function (account) {
                this.getEnabledList();
                this.getConnectedList();
                this.trigger('list_changed', this);
            },

            onAdd: function (account) {
                if (account.is_invalid) {
                    account.destroy();
                }
            },

            onDestroy: function (account) {
                if (!account.get('is_new')) {
                    var no_accounts = !(this.length || xabber.api_account.get('connected'));
                    if (no_accounts) {
                        xabber.body.setScreen('login');
                    } else if (account.show_settings_after_delete) {
                        xabber.body.setScreen('settings');
                    } else {
                        xabber.body.setScreen('all-chats');
                    }
                }
            },

            onSettingsAdded: function (settings) {
                var jid = settings.get('jid');
                if (!this.get(jid)) {
                    this.create({jid: jid});
                }
            },

            onUpdatedOrder: function () {
                this.sort();
                this.getEnabledList();
                this.getConnectedList();
            },

            getLastOrder: function () {
                return this.length ? this.last().settings.get('order') : 0;
            },

            getDefaultColor: function () {
                var used_colors = {}, colors = constants.ACCOUNT_COLORS;
                this.each(function (account) {
                    used_colors[account.settings.get('color')] = true;
                });
                for (var idx = 0; idx < colors.length; idx++) {
                    if (!used_colors[colors[idx]]) {
                        return colors[idx];
                    }
                }
                return 'red';
            },

            moveBefore: function (acc1, acc2) {
                var index2 = this.indexOf(acc2),
                    prev_order = index2 > 0 ? this.at(index2-1).settings.get('order') : 0;
                acc1.settings.save('order', (acc2.settings.get('order') + prev_order)/2);
                this._updateOrder();
            },

            moveToBottom: function (acc) {
                acc.settings.save('order', this.getLastOrder() + 1);
                this._updateOrder();
            },

            _updateOrder: function () {
                this.sort();
                this.each(function (acc, index) {
                    acc.settings.save({order: index + 1});
                });
                this.trigger('update_order');
                if (xabber.api_account.get('connected')) {
                    this.settings_list.order_timestamp.save('timestamp', utils.now());
                    xabber.api_account.synchronize_order_settings();
                }
            }
        });

        xabber.AccountToolbarItemView = xabber.BasicView.extend({
            className: 'toolbar-item account-item',
            template: templates.toolbar_item,
            avatar_size: constants.AVATAR_SIZES.TOOLBAR_ACCOUNT_ITEM,

            events: {
                'click': 'showSettings'
            },

            _initialize: function () {
                this.updateConnected();
                this.updateAuthState();
                this.updateStatus();
                this.updateAvatar();
                this.updateColorScheme();
                this.model.session.on("change:auth_failed", this.updateAuthState, this);
                this.model.session.on("change:connected", this.updateConnected, this);
                this.model.on("change:status", this.updateStatus, this);
                this.model.on("change:image", this.updateAvatar, this);
                this.model.settings.on("change:color", this.updateColorScheme, this);
                this.model.on("open_settings", this.setActive, this);
            },

            updateConnected: function () {
                this.$el.switchClass('disconnected', !this.model.isConnected());
            },

            updateAuthState: function () {
                var auth_failed = this.model.session.get('auth_failed');
                this.$('.status').hideIf(auth_failed);
                this.$('.auth-failed').showIf(auth_failed);
            },

            updateStatus: function () {
                this.$('.status').attr('data-status', this.model.get('status'));
            },

            updateAvatar: function () {
                var image = this.model.cached_image;
                this.$('.circle-avatar').setAvatar(image, this.avatar_size);
            },

            updateColorScheme: function () {
                this.$el.attr('data-color', this.model.settings.get('color'));
            },

            showSettings: function () {
                this.model.showSettings();
            },

            setActive: function () {
                this.$el.addClass('active');
            }
        });

        xabber.ToolbarAccountsBlockView = xabber.BasicView.extend({
            _initialize: function () {
                this.updateList();
                this.model.on("add change:enabled", this.updateOneInList, this);
                this.model.on("update_order", this.updateList, this);
                this.model.on("destroy", this.onAccountRemoved, this);
            },

            updateList: function (account) {
                _.each(this.children, function (view) { view.detach(); });
                _.each(this.model.enabled, function (account) {
                    var jid = account.get('jid'), view = this.child(jid);
                    if (!view) {
                        view = this.addChild(jid, xabber.AccountToolbarItemView, {model: account});
                    }
                    this.$el.append(view.$el);
                }.bind(this));
                this.parent.updateScrollBar();
            },

            updateOneInList: function (account) {
                var jid = account.get('jid');
                if (account.get('enabled')) {
                    var view = this.child(jid);
                    if (view) {
                        view.$el.detach();
                    } else {
                        view = this.addChild(jid, xabber.AccountToolbarItemView,
                            {model: account});
                    }
                    var index = this.model.enabled.indexOf(account);
                    if (index === 0) {
                        this.$el.prepend(view.$el);
                    } else {
                        this.$('.account-item').eq(index - 1).after(view.$el);
                    }
                } else {
                    this.removeChild(jid);
                }
                this.parent.updateScrollBar();
            },

            onAccountRemoved: function (account) {
                this.removeChild(account.get('jid'));
                this.parent.updateScrollBar();
            }
        });

        xabber.Resource = Backbone.Model.extend({
            idAttribute: 'resource',
            defaults: {
                priority: 0
            }
        });

        xabber.ResourceView = xabber.BasicView.extend({
            className: 'resource-wrap',
            template: templates.resource,

            _initialize: function (options) {
                this.update();
                this.model.on("change", this.update, this);
            },

            update: function () {
                var attrs = this.model.attributes;
                this.$('.status').attr('data-status', attrs.status);
                this.$('.status-message').text(attrs.status_message || constants.STATUSES[attrs.status]);
                this.$('.client').text(attrs.client || 'Wait please...');
                this.$('.resource').text(attrs.resource);
                this.$('.priority').text(attrs.priority);
                return this;
            }
        });

        xabber.Resources = Backbone.Collection.extend({
            model: xabber.Resource,
            comparator: function (r1, r2) {
                var p1 = r1.get('priority'), p2 = r2.get('priority');
                return p1 > p2 ? -1 : (p1 < p2 ? 1 : 0);
            },

            requestInfo: function (resource) {
                var jid = this.jid + '/' + resource.get('resource');
                this.connection.disco.info(jid, null, function (iq) {
                    var $identity = $(iq).find('identity[category=client]');
                    if ($identity.length) {
                        resource.set('client', $identity.attr('name'));
                    }
                });
            }
        });

        xabber.ResourcesView = xabber.BasicView.extend({
            _initialize: function () {
                this.model.on("add", this.onResourceAdded, this);
                this.model.on("remove", this.onResourceRemoved, this);
                this.model.on("reset", this.onReset, this);
                this.model.on("change:priority", this.onPriorityChanged, this);
            },

            onResourceAdded: function (resource) {
                this.model.requestInfo(resource);
                this.addChild(resource.get('resource'),
                    xabber.ResourceView, {model: resource});
                this.updatePosition(resource);
                this.$el.removeClass('hidden');
                this.parent.updateScrollBar();
            },

            onPriorityChanged: function (resource) {
                this.model.sort();
                this.updatePosition(resource);
            }
        });

        xabber.AccountResources = xabber.Resources.extend({
            initialize: function (models, options) {
                this.jid = options.account.get('jid');
                this.connection = options.account.connection;
            }
        });

        xabber.AccountResourcesView = xabber.ResourcesView.extend({
            onResourceRemoved: function (resource) {
                this.removeChild(resource.get('resource'));
                this.parent.updateScrollBar();
            },

            onReset: function () {
                this.removeChildren();
                this.parent.updateScrollBar();
            },

            updatePosition: function (resource) {
                var view = this.child(resource.get('resource'));
                if (!view) return;
                view.$el.detach();
                var index = this.model.indexOf(resource);
                if (index === 0) {
                    this.$('.main-resource').after(view.$el);
                } else {
                    this.$('.resource-wrap').eq(index).after(view.$el);
                }
                this.updateScrollBar();
            }
        });

        xabber.AccountVCardView = xabber.VCardView.extend({
            events: {
                "click .btn-vcard-refresh": "refresh",
                "click .btn-vcard-edit": "showEditView"
            },

            __initialize: function () {
                this.updateButtons();
                this.model.on("activate deactivate", this.updateButtons, this);
            },

            updateButtons: function () {
                var connected = this.model.isConnected();
                this.$('.btn-vcard-edit').showIf(connected);
                this.$('.btn-vcard-refresh').showIf(connected);
            },

            showEditView: function () {
                this.model.showSettings('vcard_edit');
            }
        });

        xabber.AccountSettingsLeftView = xabber.BasicView.extend({
            className: 'account-settings-left-wrap',
            template: templates.settings_left,
            avatar_size: constants.AVATAR_SIZES.ACCOUNT_SETTINGS_LEFT,

            events: {
                "click .main-info-wrap .status": "openChangeStatus",
                "click .settings-tabs-wrap .settings-tab": "jumpToBlock",
                "click .settings-tab.delete-account": "deleteAccount"
            },

            _initialize: function () {
                this.status_field = new xabber.StatusMessageWidget({
                    el: this.$('.status-wrap')[0],
                    model: this.model
                });
                this.updateName();
                this.updateStatus();
                this.updateAvatar();
                this.updateBlocks();
                this.model.on("change:name", this.updateName, this);
                this.model.on("change:status_updated", this.updateStatus, this);
                this.model.on("change:image", this.updateAvatar, this);
                this.model.on("activate deactivate", this.updateBlocks, this);
                this.model.on("destroy", this.remove, this);
            },

            render: function (options) {
                this.$('.settings-tab').removeClass('active');
                this.$('.settings-tab[data-block-name="'+options.block_name+'"]').addClass('active');
                this.updateCSS();
                return this;
            },

            updateName: function () {
                this.$('.name').text(this.model.get('name'));
                this.updateNameCSS();
            },

            updateStatus: function () {
                this.$('.main-info-wrap .status').attr('data-status', this.model.get('status'));
            },

            updateAvatar: function () {
                var image = this.model.cached_image;
                this.$('.circle-avatar').setAvatar(image, this.avatar_size);
            },

            updateBlocks: function () {
                var connected = this.model.isConnected();
                this.$('.main-info-wrap').switchClass('disconnected', !connected);
                this.$('.settings-tab[data-block-name="xmpp-resources"]').showIf(connected);
                this.$('.settings-tab[data-block-name="server-info"]').showIf(connected);
                this.$('.settings-tab[data-block-name="blocklist"]').showIf(connected);
                this.$('.settings-tab[data-block-name="groups-info"]').showIf(connected);
                this.updateScrollBar();
            },

            updateNameCSS: function () {
                if (!this.isVisible()) {
                    return;
                }
                var $name = this.$('.name');
                $name.removeAttr('style');
                var wrap_width = this.$('.name-wrap').width(),
                    width = $name.width(),
                    font_size = 22;
                while (width > wrap_width && font_size > 12) {
                    $name.css({'font-size': font_size});
                    width = $name.width();
                    font_size -= 2;
                }
                $name.css({'margin-left': (wrap_width - width) / 2});
            },

            updateCSS: function () {
                this.updateNameCSS();
            },

            openChangeStatus: function (ev) {
                xabber.change_status_view.open(this.model);
            },

            jumpToBlock: function (ev) {
                var $tab = $(ev.target).closest('.settings-tab'),
                    block_name = $tab.data('block-name');
                if (block_name == 'existing-group-chats-info') {
                    this.model.showSettings(null, block_name);
                    this.model.settings_right.$('.panel-content-wrap').addClass('hidden');
                    this.model.settings_right.$('.existing-group-chats-info').removeClass('hidden').perfectScrollbar({theme: 'item-list'});

                    // this.getExistingGroupchats();
                }
                else {
                    this.model.settings_right.$('.panel-content-wrap').removeClass('hidden');
                    this.model.settings_right.$('.existing-group-chats-info').addClass('hidden');
                    this.model.showSettings(null, block_name);
                }
            },

            deleteAccount: function (ev) {
                var dialog_options = [];
                if (xabber.api_account.get('connected')) {
                    dialog_options = [{name: 'delete_settings',
                        checked: this.model.settings.get('to_sync'),
                        text: 'Delete synced settings'}];
                }
                utils.dialogs.ask("Delete account", "Do you want to delete this account from Xabber Web? "+
                    "Account will not be deleted from the server.",
                    dialog_options, { ok_button_text: 'delete'}).done(function (res) {
                    if (!res) {
                        return;
                    }
                    if (res.delete_settings) {
                        xabber.api_account.delete_settings(this.model.get('jid'));
                    }
                    this.model.deleteAccount();
                }.bind(this));
            }
        });

        xabber.AccountSettingsRightView = xabber.BasicView.extend({
            className: 'account-settings-right-wrap',
            template: templates.settings_right,
            ps_selector: '.panel-content',

            events: {
                "change .enabled-state input": "setEnabled",
                "click .btn-change-password": "showPasswordView",
                "click .btn-reconnect": "reconnect",
                "change .sync-account": "changeSyncSetting",
                "click .btn-delete-settings": "deleteSettings",
                "click .color-values .color-value": "changeColor",
                "click .token-wrap .btn-revoke-token": "revokeXToken",
                "click .tokens .btn-revoke-all-tokens": "revokeAllXTokens",
                "click .btn-join-existing-chat": "joinExistingChat",
                "click .existing-chat-wrap": "getMoreInfo",
                "keyup .find-existing-chats-by-domain input": "keyUpFind",
                "click .find-existing-chats-by-domain .search-icon": "clickFind"

            },

            _initialize: function () {
                this.resources_view = this.addChild('resources', xabber.AccountResourcesView,
                    {model: this.model.resources, el: this.$('.xmpp-resources')[0]});
                this.vcard_view = this.addChild('vcard', xabber.AccountVCardView,
                    {model: this.model, el: this.$('.vcard')[0]});
                this.$('.account-name .value').text(this.model.get('jid'));
                this.updateStatus();
                this.updateView();
                this.showConnectionStatus();
                this.updateSynchronizationBlock();
                this.getAllXTokens();
                this.model.session.on("change:reconnecting", this.updateReconnectButton, this);
                this.model.session.on("change:conn_feedback", this.showConnectionStatus, this);
                this.model.settings.on("change:to_sync", this.updateSyncOption, this);
                this.model.settings.on("change:deleted", this.updateDelSettingsButton, this);
                this.model.settings.on("change:to_sync change:synced", this.updateSyncState, this);
                xabber.api_account.on("change:connected", this.updateSynchronizationBlock, this);
                this.model.on("change:enabled", this.updateEnabled, this);
                this.model.on("change:status_updated", this.updateStatus, this);
                this.model.on("activate deactivate", this.updateView, this);
                this.model.on("destroy", this.remove, this);
            },

            render: function (options) {
                this.updateEnabled();
                this.updateXTokens();
                this.$('.main-resource .client').text(xabber.get('client_name'));
                this.$('.main-resource .resource').text(this.model.resource);
                this.$('.main-resource .priority').text(this.model.get('priority'));
                this.$('.account-color .dropdown-button').dropdown({
                    inDuration: 100,
                    outDuration: 100,
                    belowOrigin: true,
                    hover: false
                });
                this.$('.account-color .dropdown-content').hide();
                this.scrollToChild(this.$('.settings-block-wrap.'+options.block_name));
                return this;
            },

            updateStatus: function () {
                var account = this.model,
                    status = account.get('status'),
                    status_message = account.getStatusMessage();
                this.$('.main-resource .status').attr('data-status', status);
                this.$('.main-resource .status-message').text(status_message);
            },

            updateView: function () {
                var connected = this.model.isConnected();
                this.$('.xmpp-resources').showIf(connected);
                this.$('.server-info').showIf(connected);
                this.$('.blocklist').showIf(connected);
                this.$('.groups-info').showIf(connected);
                this.updateScrollBar();
            },

            updateSynchronizationBlock: function () {
                this.$('.xabber-account-features-wrap').showIf(xabber.api_account.get('connected'));
                this.updateSyncState();
                this.updateSyncOption();
                this.updateDelSettingsButton();
            },

            keyUpFind: function (ev) {
                this.$('.search-icon').hasClass('active') && (ev.keyCode === constants.KEY_ENTER) && this.getExistingGroupchats(this.$('.search-input.simple-input-field').val());
            },

            clickFind: function () {
                this.getExistingGroupchats(this.$('.search-input.simple-input-field').val());
            },

            getExistingGroupchats: function (domain) {
                this.model.connection.disco.items((domain || constants.XMPP_SERVER_GROUPCHATS), null, this.getGroupchatService.bind(this));
            },

            getGroupchatService: function (stanza) {
                $(stanza).find('query item').each(function (idx, item) {
                    if ($(item).attr('node') === Strophe.NS.GROUP_CHAT) {
                        var jid = $(item).attr('jid');
                        this.getGroupchatFeature(jid);
                    }
                }.bind(this));
            },

            getGroupchatFeature: function (jid) {
                var iq = $iq({type: 'get', to: jid})
                    .c('query', {xmlns: Strophe.NS.DISCO_INFO, node: Strophe.NS.GROUP_CHAT});
                this.model.sendIQ(iq, this.getServerInfo.bind(this));
            },

            getServerInfo: function (stanza) {
                $(stanza).find('query identity').each(function (idx, item) {
                    var $item = $(item);
                    if (($item.attr('category') === 'conference') && ($item.attr('type') === 'server')) {
                        var jid = $(stanza).attr('from');
                        this.getChatsFromSever(jid);
                    }
                }.bind(this));
            },

            getChatsFromSever: function (jid) {
                this.model.settings_right.$('.existing-group-chats-info .groupchats').html("");
                var iq = $iq({type: 'get', to: jid}).c('query', {xmlns: Strophe.NS.DISCO_ITEMS, node: Strophe.NS.GROUP_CHAT});
                this.model.sendIQ(iq, function (stanza) {
                    $(stanza).find('query item').each(function (idx, item) {
                        var $item = $(item),
                            name = $item.attr('name'),
                            jid = $item.attr('jid'),
                            $chat_item_html = $(templates.existing_groupchat_item({name: name, jid: jid})),
                            avatar = Images.getDefaultAvatar(name);
                        $chat_item_html.find('.circle-avatar').setAvatar(avatar, 32);
                        $chat_item_html.appendTo(this.model.settings_right.$('.existing-group-chats-info .groupchats'));
                    }.bind(this));
                }.bind(this));
            },

            joinExistingChat: function (ev) {
                var $target = $(ev.target).closest('.existing-chat-wrap'),
                    group_jid = $target.data('jid'),
                    contact = this.model.contacts.mergeContact(group_jid);
                contact.set('group_chat', true);
                contact.pres('subscribed');
                contact.pres('subscribe');
                contact.pushInRoster({name: group_jid}, function () {
                    contact.showDetails();
                }.bind(this));
            },

            getMoreInfo: function (ev) {
                var $target = $(ev.target);
                if (!$target.hasClass('btn-join-existing-chat')) {
                    $target = $target.closest('.existing-chat-wrap');
                    var group_jid = $target.data('jid'),
                        iq = $iq({type: 'get', to: group_jid}).c('query', {xmlns: Strophe.NS.DISCO_INFO});
                    this.model.sendIQ(iq, function (stanza) {

                    }.bind(this));
                }
            },

            getAllXTokens: function () {
                var tokens_list = [],
                    iq = $iq({
                        from: this.model.get('jid'),
                        type: 'get',
                        to: Strophe.getDomainFromJid(this.model.get('jid'))
                    }).c('query', {xmlns:Strophe.NS.AUTH_TOKENS + '#items'});
                this.model.sendIQ(iq, function (tokens) {
                    $(tokens).find('field').each(function (idx, token) {
                        var $token = $(token),
                            description = $token.find('description').text(),
                            token_uid = $token.find('token-uid').text(),
                            expire = parseInt($token.find('expire').text())*1000,
                            last_auth = parseInt($token.find('last-auth').text())*1000,
                            ip_address = $token.find('ip').text();
                        tokens_list.push({description: description, token_uid: token_uid, last_auth: last_auth, expire: expire, ip: ip_address});
                    }.bind(this));
                    this.model.x_tokens_list = tokens_list;
                    this.updateXTokens();
                }.bind(this));
            },

            updateXTokens: function () {
                this.$('.panel-content-wrap .tokens .tokens-wrap').html("");
                if (this.model.x_tokens_list) {
                    this.$('.tokens .buttons-wrap').removeClass('hidden');
                    $(this.model.x_tokens_list).each(function (idx, token) {
                        var pretty_token = {
                                description: token.description,
                                token_uid: token.token_uid,
                                ip: token.ip,
                                last_auth: utils.pretty_datetime(token.last_auth),
                                expire: utils.pretty_datetime(token.expire)
                            },
                            $token_html = $(templates.token_item(pretty_token));
                        if (this.model.get('x_token')) {
                            if (this.model.get('x_token').token_uid == token.token_uid)
                                $('<div class="token-indicator text-color-700">(this device)</div>').insertAfter($token_html.find('.description'));
                        }
                        this.$('.panel-content-wrap .tokens .tokens-wrap').prepend($token_html);
                    }.bind(this));
                }
                else {
                    this.$('.tokens .buttons-wrap').addClass('hidden');
                    this.$('.panel-content-wrap .tokens .tokens-wrap').html($('<p class="tokens-error">No tokens yet</p>'));
                }
            },

            revokeXToken: function (ev) {
                var $target = $(ev.target).closest('.token-wrap'),
                    token_uid = $target.data('token-uid');
                this.model.revokeXToken([token_uid], function () {
                    $target.remove();
                    if (this.model.x_tokens_list)
                        this.model.x_tokens_list.splice(this.model.x_tokens_list.indexOf(this.model.x_tokens_list.find(token => token.token_uid == token_uid)), 1);
                    if (this.model.get('x_token'))
                        if (this.model.get('x_token').token_uid === token_uid)
                            this.model.deleteAccount();
                }.bind(this));
            },

            revokeAllXTokens: function () {
                if (this.model.x_tokens_list) {
                    var all_tokens_uid = [];
                    for (var i = 0; i < this.model.x_tokens_list.length; i++) {
                        all_tokens_uid[i] = this.model.x_tokens_list[i].token_uid;
                    }
                    this.model.revokeXToken(all_tokens_uid, function () {
                        for (var z = 0; z < all_tokens_uid.length; z++) {
                            this.model.x_tokens_list.splice(this.model.x_tokens_list.indexOf(this.model.x_tokens_list.find(token => token.token_uid == all_tokens_uid[z])), 1);
                        }
                        if (all_tokens_uid.indexOf(this.model.get('x_token').token_uid) !== -1)
                            this.model.deleteAccount();
                    }.bind(this));
                }
            },

            updateSyncState: function () {
                var state;
                if (!this.model.settings.get('to_sync')) {
                    state = 'off';
                } else {
                    state = this.model.settings.get('synced') ? 'yes' : 'no';
                }
                this.$('.sync-status').text(constants.SYNCED_STATUS_DATA[state].tip);
                var mdiclass = constants.SYNCED_STATUS_DATA[state].icon,
                    $sync_icon = this.$('.sync-status-icon');
                $sync_icon.removeClass($sync_icon.attr('data-mdiclass'))
                    .attr('data-mdiclass', mdiclass).addClass(mdiclass);
            },

            updateSyncOption: function () {
                this.$('.sync-account').prop('checked', this.model.settings.get('to_sync'));
            },

            updateDelSettingsButton: function () {
                this.$('.btn-delete-settings').hideIf(this.model.settings.get('deleted'));
            },

            updateEnabled: function () {
                var enabled = this.model.get('enabled');
                this.$('.enabled-state input[type=checkbox]').prop('checked', enabled);
            },

            updateReconnectButton: function () {
                this.$('.btn-reconnect').switchClass('disabled', this.model.session.get('reconnecting'));
            },

            setEnabled: function (ev) {
                var enabled = this.$('.enabled-state input').prop('checked');
                this.model.save('enabled', enabled);
                enabled ? this.model.activate() : this.model.deactivate();
            },

            showConnectionStatus: function () {
                this.$('.conn-status').text(this.model.session.get('conn_feedback'));
            },

            showPasswordView: function () {
                this.model.password_view.show();
            },

            reconnect: function () {
                if (this.model.session.get('reconnecting')) {
                    return;
                }
                this.model.save('enabled', true);
                if (this.model.connection.connected) {
                    this.model.connection.disconnect();
                } else {
                    this.model.connect();
                }
            },

            changeSyncSetting: function (ev) {
                var to_sync = $(ev.target).prop('checked'),
                    settings = this.model.settings;
                settings.save('to_sync', to_sync);
                if (to_sync) {
                    settings.update_timestamp();
                    xabber.api_account.synchronize_main_settings();
                }
            },

            deleteSettings: function () {
                utils.dialogs.ask("Delete settings", "Settings for this XMPP account "+
                    "will be deleted from Xabber account",
                    [{name: 'delete_account', checked: this.model.settings.get('to_sync'),
                        text: 'Delete synced XMPP account'}],{ ok_button_text: 'delete'}).done(function (res) {
                    if (res) {
                        if (!res.delete_account) {
                            this.model.settings.save('to_sync', false);
                        } else if (!this.model.settings.get('to_sync')) {
                            this.model.deleteAccount(true);
                        }
                        xabber.api_account.delete_settings(this.model.get('jid'));
                    }
                }.bind(this));
            },

            changeColor: function (ev) {
                var $elem = $(ev.target).closest('.color-value');
                this.model.settings.update_settings({color: $elem.data('value')});
                xabber.api_account.synchronize_main_settings();
            }
        });

        xabber.StatusMessageWidget = xabber.InputWidget.extend({
            field_name: 'status-message',
            placeholder: 'Set custom status',

            bindModelEvents: function () {
                this.model.on("change:status_updated", this.updateValue, this);
            },

            getValue: function () {
                return this.model.getStatusMessage();
            },

            setValue: function (value) {
                this.model.setStatus(null, value);
            }
        });

        xabber.AccountSettingsItemView = xabber.BasicView.extend({
            className: 'xmpp-account draggable droppable',
            template: templates.global_settings_item,
            avatar_size: constants.AVATAR_SIZES.SETTINGS_ACCOUNT_ITEM,

            events: {
                "click .account-info-wrap": "showSettings",
                "change .enabled-state input": "setEnabled",
            },

            _initialize: function () {
                this.$('.jid').text(this.model.get('jid'));
                this.updateEnabled();
                this.updateAvatar();
                this.updateColorScheme();
                this.updateSyncState();
                this.showConnectionStatus();
                this.model.on("change:enabled", this.updateEnabled, this);
                this.model.on("change:image", this.updateAvatar, this);
                this.model.settings.on("change:color", this.updateColorScheme, this);
                this.model.session.on("change:conn_feedback", this.showConnectionStatus, this);
                this.$el.on('drag_to', this.onDragTo.bind(this));
                this.$('.move-account-to-this')
                    .on('move_xmpp_account', this.onMoveAccount.bind(this));
                this.model.settings.on("change:to_sync", this.updateSyncState, this);
            },

            updateAvatar: function () {
                var image = this.model.cached_image;
                this.$('.circle-avatar').setAvatar(image, this.avatar_size);
            },

            updateColorScheme: function () {
                this.$el.attr('data-color', this.model.settings.get('color'));
            },

            showConnectionStatus: function () {
                this.$('.conn-status').text(this.model.session.get('conn_feedback'));
            },

            updateEnabled: function () {
                var enabled = this.model.get('enabled');
                this.$el.switchClass('disabled', !enabled);
                this.$('.enabled-state input[type=checkbox]').prop('checked', enabled);
            },

            setEnabled: function (ev) {
                var enabled = this.$('.enabled-state input').prop('checked');
                this.model.save('enabled', enabled);
                enabled ? this.model.activate() : this.model.deactivate();
            },

            onDragTo: function (ev, drop_elem) {
                drop_elem && $(drop_elem).trigger('move_xmpp_account', this.model);
            },

            onMoveAccount: function (ev, account) {
                this.model.collection.moveBefore(account, this.model);
            },

            updateSyncState: function () {
                this.$el.find('.sync-marker').showIf(this.model.settings.get('to_sync'));
            },

            showSettings: function () {
                this.model.showSettings();
            }
        });

        xabber.SettingsAccountsBlockView = xabber.BasicView.extend({
            _initialize: function () {
                this.updateList();
                this.updateSyncState();
                this.model.on("add", this.updateOneInList, this);
                this.model.on("update_order", this.updateList, this);
                this.model.on("destroy", this.onAccountRemoved, this);
                xabber.api_account.on("change:connected", this.updateSyncState, this);
                this.$('.move-account-to-bottom')
                    .on('move_xmpp_account', this.onMoveAccountToBottom.bind(this));
            },

            updateList: function () {
                _.each(this.children, function (view) { view.detach(); });
                this.model.each(function (account) {
                    var jid = account.get('jid'), view = this.child(jid);
                    if (!view) {
                        view = this.addChild(jid, xabber.AccountSettingsItemView, {model: account});
                    }
                    this.$('.no-accounts-tip').before(view.$el);
                }.bind(this));
                this.updateHtml();
                this.parent.updateScrollBar();
            },

            updateOneInList: function (account) {
                var jid = account.get('jid'),
                    view = this.child(jid);
                if (view) {
                    view.$el.detach();
                } else {
                    view = this.addChild(jid, xabber.AccountSettingsItemView,
                        {model: account});
                }
                var index = this.model.indexOf(account);
                if (index === 0) {
                    this.$('.accounts-head-wrap').after(view.$el);
                } else {
                    this.$('.xmpp-account').eq(index - 1).after(view.$el);
                }
                this.updateHtml();
                this.parent.updateScrollBar();
            },

            onAccountRemoved: function (account) {
                this.removeChild(account.get('jid'));
                this.updateHtml();
                this.parent.updateScrollBar();
            },

            render: function () {
                this.updateHtml();
                _.each(this.children, function (view) {
                    view.updateEnabled();
                });
            },

            updateHtml: function () {
                this.$('.no-accounts-tip').hideIf(this.model.length);
                this.$('.accounts-head-wrap').showIf(this.model.length);
                this.updateCSS();
            },

            // TODO: refactor CSS and remove this
            updateCSS: function () {
                var max_width = 0;
                this.$('.jid').addClass('inline').each(function () {
                    this.offsetWidth > max_width && (max_width = this.offsetWidth);
                }).removeClass('inline');
                max_width += 150;
                if (xabber.api_account.get('connected')) {
                    max_width += 45;
                }
                this.$('.xmpp-account-list').css('width', max_width + 48);
                _.each(this.children, function (view) {
                    view.$el.css('width', max_width);
                });
            },

            updateSyncState: function () {
                var connected = xabber.api_account.get('connected');
                this.$('.sync-head').showIf(connected);
                this.$('.sync-marker-wrap').showIf(connected);
                this.$('.sync-head').hideIf(!connected);
                this.$('.sync-marker-wrap').hideIf(!connected);
                this.updateCSS();
            },

            onMoveAccountToBottom: function (ev, account) {
                this.model.moveToBottom(account);
            }
        });

        xabber.ChangeStatusView = xabber.BasicView.extend({
            className: 'modal main-modal change-status-modal',
            template: templates.change_status,

            events: {
                "click .status-values li": "changeStatus",
                "click .status-message-wrap .clear-input": "clearStatusMessageInput",
                "keyup .status-message": "keyUp",
                "change .apply-to-all": "changeApplyToAll"
            },

            open: function (account) {
                this.account = account;
                this.highlightStatus(account.get('status'));
                this.restoreStatusMessageInput();
                this.show();
            },

            highlightStatus: function (status) {
                this.$('.status-values li[data-value="'+status+'"]').addClass('active')
                    .siblings().removeClass('active');
            },

            changeStatus: function (ev) {
                var status = $(ev.target).closest('li').data('value');
                this.highlightStatus(status);
                this.do_change();
                this.closeModal();
            },

            restoreStatusMessageInput: function (ev) {
                var status_message = this.account.get('status_message');
                this.$('.status-message').val(status_message)
                    .switchClass('filled', status_message);
                if (!status_message) {
                    this.$('.status-message')
                        .attr('placeholder', this.account.getStatusMessage());
                }
            },

            clearStatusMessageInput: function (ev) {
                var verbose_status = constants.STATUSES[this.account.get('status')];
                this.$('.status-message').val('').attr('placeholder', verbose_status)
                    .removeClass('filled');
            },

            keyUp: function (ev) {
                if (ev.keyCode === constants.KEY_ENTER) {
                    this.do_change();
                    this.closeModal();
                } else {
                    var value = this.$('.status-message').val();
                    this.$('.status-message').switchClass('filled', value);
                }
            },

            do_change: function () {
                var status = this.$('.status-values li.active').data('value'),
                    status_message = this.$('.status-message').val();
                if (this.apply_to_all) {
                    xabber.accounts.each(function (account) {
                        account.setStatus(status, status_message);
                    });
                } else {
                    this.account.setStatus(status, status_message);
                }
            },

            changeApplyToAll: function (ev) {
                this.apply_to_all = $(ev.target).prop('checked');
            },

            render: function (options) {
                this.$el.openModal({
                    ready: this.onRender.bind(this),
                    complete: this.close.bind(this)
                });
            },

            onRender: function () {
                Materialize.updateTextFields();
            },

            onHide: function () {
                this.$el.detach();
            },

            close: function () {
                var value = this.$('.status-message').val();
                if (!value) {
                    this.do_change();
                }
                this.closeModal();
            },

            closeModal: function () {
                this.$el.closeModal({ complete: this.hide.bind(this) });
            }
        });

        xabber.ChangePasswordView = xabber.BasicView.extend({
            className: 'modal main-modal change-password-modal',
            template: templates.change_password,

            events: {
                "click .btn-change": "submit",
                "click .btn-cancel": "close",
                "keyup input[name=password]": "keyUp"
            },

            _initialize: function () {
                this.$('input[name=jid]').val(this.model.get('jid'));
                this.$password_input = this.$('input[name=password]');
                this.data.on("change:authentication", this.updateButtons, this);
                return this;
            },

            render: function (options) {
                options || (options = {});
                this.is_login = options.login;
                this.$('.modal-header span').text(this.is_login ? 'Log In' : 'Set password');
                this.$('.btn-cancel').text(this.is_login ? 'Skip' : 'Cancel');
                this.$('.btn-change').text(this.is_login ? 'Log In': 'Set');
                this.$el.openModal({
                    use_queue: true,
                    ready: this.onRender.bind(this),
                    complete: this.close.bind(this)
                });
            },

            onRender: function () {
                Materialize.updateTextFields();
                this.authFeedback({});
                this.$password_input.val('').focus();
            },

            getActionName: function () {
                return this.is_login ? 'Login' : 'Set'
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
                var jid = this.model.get('jid'),
                    password = this.$password_input.val();
                if (!password)  {
                    return this.errorFeedback({password: 'Please input password!'});
                }
                this.authFeedback({password: 'Authentication with new password...'});
                if (this.model.connection.connected) {
                    this.model.once('deactivate', function () {
                        this.setPassword(password);
                    }.bind(this));
                    this.model.deactivate();
                } else {
                    this.setPassword(password);
                }
            },

            setPassword: function (password) {
                this.model.save({
                    auth_type: 'password',
                    password: utils.utoa(password),
                    enabled: true
                });
                this.model.auth_view = this;
                this.model.connect();
            },

            cancel: function () {
                this.data.set('authentication', false);
            },

            updateButtons: function () {
                var authentication = this.data.get('authentication');
                this.$('.btn-change').text(authentication ? 'Stop' : this.getActionName());
            },

            authFeedback: function (options) {
                this.$password_input.switchClass('invalid', options.password)
                    .siblings('span.errors').text(options.password || '');
            },

            errorFeedback: function (options) {
                this.authFeedback(options);
                this.data.set('authentication', false);
            },

            successFeedback: function () {
                this.data.set('authentication', false);
                this.closeModal();
            },

            onHide: function () {
                this.$el.detach();
            },

            close: function () {
                if (this.is_login) {
                    this.model.save('enabled', false);
                }
                this.cancel();
                this.closeModal();
            },

            closeModal: function () {
                this.model.auth_view = null;
                this.$el.closeModal({ complete: this.hide.bind(this) });
            }
        });

        xabber.AuthView = xabber.BasicView.extend({
            _initialize: function () {
                this.$jid_input = this.$('input[name=jid]');
                this.$password_input = this.$('input[name=password]');
                this.data.on("change:authentication", this.updateButtons, this);
                return this;
            },

            render: function () {
                this.onRender();
            },

            onRender: function () {
                this.account = null;
                this.authFeedback({});
                Materialize.updateTextFields();
                this.$jid_input.val('').focus();
                this.$password_input.val('');
                this.updateButtons();
                this.updateOptions && this.updateOptions();
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
                var jid = this.$jid_input.val(),
                    password = this.$password_input.val();
                if (!jid) {
                    return this.errorFeedback({jid: 'Please input username!'});
                }
                if (!password)  {
                    return this.errorFeedback({password: 'Please input password!'});
                }
                var at_idx = jid.indexOf('@');
                if (at_idx <= 0 || at_idx === jid.length - 1) {
                    return this.errorFeedback({jid: 'Wrong username format!'});
                }
                jid = Strophe.getBareJidFromJid(jid).toLowerCase();
                var account = xabber.accounts.get(jid);
                if (account) {
                    this.errorFeedback({jid: 'This account already added to Xabber web'});
                } else {
                    this.authFeedback({password: 'Authentication...'});
                    this.account = xabber.accounts.create({
                        jid: jid,
                        password: utils.utoa(password),
                        is_new: true
                    }, {auth_view: this});
                    this.account.trigger('start');
                }
            },

            cancel: function () {
                this.data.set('authentication', false);
                this.onRender();
                if (this.account) {
                    this.account.destroy();
                    this.account = null;
                }
            },

            authFeedback: function (options) {
                this.$jid_input.switchClass('invalid', options.jid)
                    .siblings('span.errors').text(options.jid || '');
                this.$password_input.switchClass('invalid', options.password)
                    .siblings('span.errors').text(options.password || '');
            },

            errorFeedback: function (options) {
                this.authFeedback(options);
                this.data.set('authentication', false);
            },

            socialAuth: function (ev) {
                var origin = window.location.href,
                    provider = $(ev.target).closest('.btn-social').data('provider');
                if (provider == 'email')
                    xabber.body.setScreen('login', {'login_screen': 'xabber'});
                else
                    window.location.href = constants.XABBER_ACCOUNT_URL + '/social/login/' + provider + '/?origin=' + origin + '&source=Xabber Web';
            }
        });

        xabber.XmppLoginPanel = xabber.AuthView.extend({
            className: 'login-panel',
            template: templates.xmpp_login,

            events: {
                "click .login-type": "changeLoginType",
                "click .btn-log-in": "submit",
                "click .btn-social": "socialAuth",
                "click .btn-cancel": "cancel",
                "keyup input[name=password]": "keyUp"
            },

            changeLoginType: function () {
                xabber.body.setScreen('login', {'login_screen': 'xabber'});
            },

            updateButtons: function () {
                var authentication = this.data.get('authentication');
                this.$('.btn-log-in').switchClass('disabled', authentication);
                this.$('.btn-cancel').showIf(authentication);
            },

            successFeedback: function (account) {
                account.auth_view = null;
                this.data.set('authentication', false);
                xabber.body.setScreen('all-chats');
            }
        });


        xabber.AddAccountView = xabber.AuthView.extend({
            className: 'modal main-modal add-account-modal',
            template: templates.add_account,

            events: {
                "click .btn-add": "submit",
                "click .btn-cancel": "close",
                "keyup input[name=password]": "keyUp"
            },

            render: function (options) {
                this.$el.openModal({
                    ready: this.onRender.bind(this),
                    complete: this.close.bind(this)
                });
            },

            updateOptions: function () {
                this.$('.sync-option').showIf(xabber.api_account.get('connected'))
                    .find('input').prop('checked', xabber.api_account.get('sync_all'));
            },

            updateButtons: function () {
                var authentication = this.data.get('authentication');
                this.$('.btn-add').text(authentication ? 'Stop' : 'Add');
            },

            successFeedback: function (account) {
                this.data.set('authentication', false);
                if (this.$('.sync-option input').prop('checked')) {
                    account.settings.update_timestamp();
                    xabber.api_account.synchronize_main_settings();
                } else {
                    account.settings.save('to_sync', false);
                }
                xabber.body.setScreen('all-chats');
                this.closeModal();
            },

            onHide: function () {
                this.$el.detach();
            },

            close: function () {
                this.cancel();
                this.closeModal();
            },

            closeModal: function () {
                this.$el.closeModal({ complete: this.hide.bind(this) });
            }
        });

        xabber.once("start", function () {
            this.xmpp_login_panel = xabber.login_page.addChild('xmpp_login', this.XmppLoginPanel);
            this.account_settings = xabber.wide_panel.addChild('account_settings',
                this.NodeView, {classlist: 'settings-panel account-settings-panel'});
            this.acc_settings_left = xabber.account_settings.addChild('left',
                this.Container, {classlist: 'account-settings-left-container'});
            this.acc_settings_right = xabber.account_settings.addChild('right',
                this.Container, {classlist: 'account-settings-right-container'});

            this.accounts = new this.Accounts(null, {
                storage_name: this.getStorageName() + '-accounts'
            });
            this.accounts.fetch();

            this.toolbar_view.addChild('accounts', this.ToolbarAccountsBlockView,
                {model: this.accounts, el: this.toolbar_view.$('.accounts')[0]});
            this.settings_view.addChild('accounts', this.SettingsAccountsBlockView,
                {model: this.accounts, el: this.settings_view.$('.xmpp-accounts')[0]});


            this.add_account_view = new this.AddAccountView();
            this.change_status_view = new this.ChangeStatusView();
            this.on("add_account", function () {
                this.add_account_view.show();
            }, this);

            window.onbeforeunload = function () {
                _.each(this.accounts.connected, function (account) {
                    account.sendPresence('offline');
                });
            }.bind(this);

            this.login_page.patchTree = function (tree, options) {
                var login_screen = options.login_screen || constants.DEFAULT_LOGIN_SCREEN;
                return login_screen === 'xmpp' ? { xmpp_login: null } : { xabber_login: null };
            };
        }, xabber);

        return xabber;
    };
});
