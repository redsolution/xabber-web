define("xabber-accounts", function () {
    return function (xabber) {
        let env = xabber.env,
            constants = env.constants,
            templates = env.templates.accounts,
            utils = env.utils,
            $ = env.$,
            $iq = env.$iq,
            $pres = env.$pres,
            Strophe = env.Strophe,
            _ = env._,
            moment = env.moment,
            Images = utils.images,
            pretty_datetime = (timestamp) => { return utils.pretty_datetime(timestamp, (xabber.settings.language == 'ru-RU' || xabber.settings.language == 'default' && xabber.get("default_language") == 'ru-RU') && 'D MMMM YYYY HH:mm:ss')};


        xabber.Account = Backbone.Model.extend({
                idAttribute: 'jid',

                defaults: {
                    enabled: true,
                    auth_type: "password",
                    status: "online",
                    status_message: "",
                    priority: 67,
                    auto_login_xa: true,
                    groupchat_servers_list: []
                },

                initialize: function (_attrs, options) {
                    this.retraction_version = null;
                    options || (options = {});
                    if (_attrs.is_new && !options.auth_view) {
                        this.is_invalid = true;
                        this.on("destroy", this.onDestroy, this);
                        return;
                    }
                    this.last_msg_timestamp = 0;
                    this.settings = xabber.account_settings_list.get(_attrs.jid);
                    if (!this.settings) {
                        this.settings = xabber.account_settings_list.create({
                            jid: _attrs.jid,
                            timestamp: utils.now(),
                            auto_login_xa: this.get('auto_login_xa'),
                            to_sync: xabber.api_account && xabber.api_account.get('sync_all')
                        });
                    }
                    let settings = _.clone(this.settings.attributes);
                    settings.color || (settings.color = this.collection.getDefaultColor());
                    settings.order || (settings.order = this.collection.getLastOrder() + 1);
                    this.settings.save(settings);
                    this.settings.on("delete_account", this.deleteAccount, this);
                    let attrs = _.clone(_attrs);
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
                        conn_feedback: xabber.getString("connection__error__text_disconnected")
                    });
                    this._waiting_code = false;
                    this.code_requests = [];
                    this.xabber_auth = {};
                    this.session.on("change:connected", this.onChangedConnected, this);
                    this.CONNECTION_URL = _attrs.websocket_connection_url || constants.CONNECTION_URL;
                    this.conn_manager = new Strophe.ConnectionManager(this.CONNECTION_URL, {'x-token': true});
                    this.connection = this.conn_manager.connection;
                    this.get('x_token') && (this.connection.x_token = this.get('x_token'));
                    if (this.connection.x_token && this.connection.x_token.counter && !this.get('hotp_counter'))
                        this.save({
                            hotp_counter: this.connection.x_token.counter,
                        });
                    this.get('hotp_counter') && (this.connection.counter = this.get('hotp_counter'));
                    this.on("destroy", this.onDestroy, this);
                    this._added_pres_handlers = [];
                    this._pending_stanzas = [];
                    this._pending_messages = [];
                    this.dfd_presence = new $.Deferred();
                    this.resources = new xabber.AccountResources(null, {account: this});
                    this.password_view = new xabber.ChangePasswordView({model: this});
                    this.vcard_edit = new xabber.VCardEditView({model: this});
                    this.updateColorScheme();
                    this.settings.on("change:color", this.updateColorScheme, this);
                    this.on("change:photo_hash", this.getVCard, this);
                    _.each(this._init_plugins, (plugin) => {
                        plugin.call(this);
                    });
                    this.connection.xmlInput = function (xml) {
                        xabber.info('input');
                        xabber.info(xml);
                    };
                    this.connection.xmlOutput = function (xml) {
                        xabber.info('output');
                        xabber.info(xml);
                    };
                    this.once("start", this.start, this);
                    if (xabber.api_account)
                        xabber.api_account.on("settings_result", function (result) {
                            if (result && this.settings.get('token')) {
                                this.save({auth_type: 'token'});
                            }
                            this.trigger('start');
                        }, this);
                    else
                        xabber.on("bind_xmpp_accounts", () => {
                            if (this.settings.get('token'))
                                this.save({auth_type: 'token'});
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
                    let res = this.connection.authenticated && this.get('status') !== 'offline';
                    if (res) {
                        this.connection.send(stanza);
                        callback && callback();
                    } else {
                        this._pending_stanzas.push({stanza: stanza, callback: callback});
                    }
                    return res;
                },

                sendMsgFast: function (stanza, callback) {
                    let res = this.fast_connection && this.fast_connection.authenticated && this.fast_connection.connected && this.get('status') !== 'offline';
                    if (res) {
                        this.fast_connection.send(stanza);
                        callback && callback();
                        return res;
                    } else {
                        return this.sendMsg(stanza, callback);
                    }
                },

                sendIQFast: function () {
                    let res = this.fast_connection && this.fast_connection.authenticated && this.fast_connection.connected && this.get('status') !== 'offline';
                    if (res) {
                        this.fast_connection.sendIQ.apply(this.fast_connection, arguments);
                        return res;
                    } else
                        return this.sendIQ.apply(this, arguments);
                },

                sendFast: function (stanza, callback, errback) {
                    if ($(stanza.nodeTree).first().is('message')) {
                        this.sendMsgFast(stanza, callback);
                    } else {
                        this.sendIQFast(stanza, callback, errback);
                    }
                },

                pubAvatar: function (image, callback, errback) {
                    if (!image) {
                        this.removeAvatar(callback, errback);
                        return;
                    }
                    let avatar_hash = image.hash || sha1(image.base64),
                        iq_pub_data = $iq({from: this.get('jid'), type: 'set'})
                            .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                            .c('publish', {node: Strophe.NS.PUBSUB_AVATAR_DATA})
                            .c('item', {id: avatar_hash})
                            .c('data', {xmlns: Strophe.NS.PUBSUB_AVATAR_DATA}).t(image.base64),
                        iq_pub_metadata = $iq({from: this.get('jid'), type: 'set'})
                            .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                            .c('publish', {node: Strophe.NS.PUBSUB_AVATAR_METADATA})
                            .c('item', {id: avatar_hash})
                            .c('metadata', {xmlns: Strophe.NS.PUBSUB_AVATAR_METADATA})
                            .c('info', {bytes: image.size, id: avatar_hash, type: image.type});
                    this.sendIQinBackground(iq_pub_data, () => {
                            this.sendIQinBackground(iq_pub_metadata, () => {
                                    callback && callback(avatar_hash);
                                },
                                function (data_error) {
                                    errback && errback(data_error);
                                });
                        },
                        (data_error) => {
                            errback && errback(data_error);
                        });
                },

                removeAvatar: function (callback, errback) {
                    let iq_pub_metadata = $iq({from: this.get('jid'), type: 'set'})
                        .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                        .c('publish', {node: Strophe.NS.PUBSUB_AVATAR_METADATA})
                        .c('item')
                        .c('metadata', {xmlns: Strophe.NS.PUBSUB_AVATAR_METADATA});
                    this.sendIQinBackground(iq_pub_metadata, () => {
                            callback && callback();
                        },
                        function () {
                            errback && errback();
                        });
                },

                getAvatar: function (avatar, callback, errback) {
                    let iq_request_avatar = $iq({from: this.get('jid'), type: 'get', to: this.get('jid')})
                        .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                        .c('items', {node: Strophe.NS.PUBSUB_AVATAR_DATA})
                        .c('item', {id: avatar});
                    this.sendIQinBackground(iq_request_avatar, (iq) => {
                        let pubsub_avatar = $(iq).find('data').text();
                        if (pubsub_avatar == "")
                            errback && errback(xabber.getString("pubsub__error__text_empty_node"));
                        else
                            callback && callback(pubsub_avatar);
                    });
                },

                sendIQ: function () {
                    let res = this.connection.authenticated && this.get('status') !== 'offline';
                    if (res) {
                        let elem = arguments[0];
                        if (typeof(elem.tree) === "function" && elem.tree().getAttribute('type') == 'get') {
                            let lang = xabber.settings.language;
                            (lang == 'default') && (lang = xabber.get('default_language'));
                            elem.tree().setAttribute('xml:lang', lang);
                        }
                        this.connection.sendIQ.apply(this.connection, arguments);
                    } else {
                        this._pending_stanzas.push({stanza: arguments});
                    }
                    return res;
                },

                sendIQinBackground: function () {
                    let res = this.background_connection && this.background_connection.authenticated && this.background_connection.connected && this.get('status') !== 'offline';
                    if (res) {
                        this.background_connection.sendIQ.apply(this.background_connection, arguments);
                        return res;
                    } else
                        return this.sendIQ.apply(this, arguments);
                },

                parseDataForm: function ($dataform, options) {
                    options = options || {};
                    let type = $dataform.attr('type'),
                        title = $dataform.children('title').text(),
                        instructions = $dataform.children('instructions').text(),
                        fields = [],
                        data_form = {};
                    $dataform.children('field').each((idx, field) => {
                        let $field = $(field),
                            attrs = {},
                            field_var = $field.attr('var'),
                            field_type = $field.attr('type'),
                            field_label = $field.attr('label'),
                            field_value = [], field_options = [];
                        $field.children('value').each((i, value) => {
                            field_value.push($(value).text());
                        });
                        $field.children('option').each((i, option) => {
                            let $option = $(option),
                                val = $option.children('value').text(),
                                lbl = $option.attr('label');
                            field_options.push({value: val, label: lbl});
                        });
                        field_var && (attrs.var = field_var);
                        field_type && (attrs.type = field_type);
                        field_label && (attrs.label = field_label);
                        field_value.length && (attrs.values = field_value);
                        field_options.length && (attrs.options = field_options);
                        fields.push(attrs);
                    });
                    type && (data_form.type = type);
                    title && (data_form.title = title);
                    instructions && (data_form.instructions = instructions);
                    fields.length && (data_form.fields = fields);
                    return data_form;
                },

                addDataFormToStanza: function ($stanza, data_form) {
                    $stanza.c('x', {xmlns: Strophe.NS.DATAFORM, type: 'submit'});
                    data_form.title && $stanza.c('title').t(data_form.title).up();
                    data_form.instructions && $stanza.c('instructions').t(data_form.instructions).up();
                    data_form.fields.forEach((field) => {
                        let field_attrs = _.clone(field);
                        delete field_attrs.values;
                        delete field_attrs.options;
                        $stanza.c('field', field_attrs);
                        field.values && field.values.forEach((value) => {
                            $stanza.c('value').t(value).up();
                        });
                        $stanza.up();
                    });
                    return $stanza;
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
                    let request = {
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

                createBackgroundConnection: function () {
                    let jid = this.get('jid'),
                        auth_type = this.fast_conn_manager.auth_type,
                        password;
                    if (auth_type === 'token') {
                        password = this.settings.get('token');
                    } else if (auth_type === 'x-token') {
                        if (this.get('x_token') && (Number(this.get('x_token').expire)*1000 > moment.now() || !this.get('x_token').expire))
                            password = this.get('x_token').token;
                        else
                            password = undefined;
                    } else {
                        password = this.getPassword();
                    }
                    if (!password) {
                        let attrs = {login: true};
                        options.token_invalidated && (attrs.token_invalidated = true);
                        this.password_view.show(attrs);
                        return;
                    }
                    if (!this.background_conn_manager) {
                        this.background_conn_manager = new Strophe.ConnectionManager(this.CONNECTION_URL);
                        this.background_connection = this.background_conn_manager.connection;
                        this.background_connection.account = this;
                    } else{
                        this.background_connection.disconnect();
                        return this.createBackgroundConnection();
                    }
                    if (auth_type === 'x-token' && this.background_connection) {
                        this.background_connection.x_token = this.get('x_token');
                        this.background_connection.counter = this.get('hotp_counter');
                        this.background_connection.x_token_auth = true;
                    }
                    this.background_conn_manager.connect(auth_type, jid, password, this.onBackgroundConnected.bind(this));
                },

                createFastConnection: function () {
                    let jid = this.get('jid'),
                        auth_type = this.conn_manager.auth_type,
                        password;
                    if (auth_type === 'token') {
                        password = this.settings.get('token');
                    } else if (auth_type === 'x-token') {
                        if (this.get('x_token') && (Number(this.get('x_token').expire)*1000 > moment.now() || !this.get('x_token').expire))
                            password = this.get('x_token').token;
                        else
                            password = undefined;
                    } else {
                        password = this.getPassword();
                    }
                    if (!password) {
                        let attrs = {login: true};
                        options.token_invalidated && (attrs.token_invalidated = true);
                        this.password_view.show(attrs);
                        return;
                    }
                    if (!this.fast_conn_manager) {
                        this.fast_conn_manager = new Strophe.ConnectionManager(this.CONNECTION_URL);
                        this.fast_connection = this.fast_conn_manager.connection;
                        this.fast_connection.account = this;
                    } else{
                        this.fast_connection.disconnect();
                        return this.createFastConnection();
                    }
                    if (auth_type === 'x-token' && this.fast_connection) {
                        this.fast_connection.x_token = this.get('x_token');
                        this.fast_connection.counter = this.get('hotp_counter');
                        this.fast_connection.x_token_auth = true;
                    }
                    this.fast_conn_manager.connect(auth_type, jid, password, this.onFastConnected.bind(this));
                },

                connect: function (options) {
                    options = options || {};
                    let jid = this.get('jid'),
                        auth_type = this.get('auth_type'),
                        password;
                    jid += '/xabber-web-' + xabber.get('client_id');
                    this.connection.x_token = this.get('x_token');
                    this.connection.counter = this.get('hotp_counter');
                    this.connection.account = this;
                    if (this.connection.x_token && !this.connection.counter)
                        this.connection.counter = 0;
                    if (auth_type === 'token') {
                        password = this.settings.get('token');
                    } else if (auth_type === 'x-token') {
                        if (this.get('x_token') && (Number(this.get('x_token').expire)*1000 > moment.now() || !this.get('x_token').expire))
                            password = this.get('x_token').token;
                        else
                            password = undefined;
                    } else {
                        password = this.getPassword();
                    }
                    if (!password) {
                        let attrs = {login: true};
                        options.token_invalidated && (attrs.token_invalidated = true);
                        this.password_view.show(attrs);
                        return;
                    }
                    this.session.set({
                        connected: false,
                        reconnected: false,
                        reconnecting: false,
                        conn_retries: 0,
                        conn_feedback: xabber.getString("application_state_connecting"),
                        auth_failed: false
                    });
                    this.restoreStatus();
                    this.conn_manager.connect(auth_type, jid, password, this.connectionCallback.bind(this));
                },

                reconnect: function () {
                    let conn_retries = this.session.get('conn_retries'),
                        timeout = conn_retries < 3 ? constants.RECONNECTION_TIMEOUTS[conn_retries] : 20000;
                    this.connection.reset();
                    this.session.set({
                        connected: false,
                        reconnected: false,
                        reconnecting: true,
                        conn_retries: ++conn_retries,
                        conn_feedback:  xabber.getString("application_state_reconnect_after_some_seconds", [timeout/1000]),
                        auth_failed: false
                    });
                    if (this.get('x_token'))
                        this.connection.x_token = this.get('x_token');
                    this.connection.account = this;
                    setTimeout(() => {
                        this.connFeedback(xabber.getString("application_state_connecting"));
                        this.restoreStatus();
                        this.conn_manager.reconnect(this.reconnectionCallback.bind(this));
                    }, timeout);
                },

                connectionCallback: function (status, condition) {
                    if (this.session.get('reconnecting')) {
                        xabber.info('ignore connection callback for status: '+constants.CONN_STATUSES[status]);
                        return;
                    }
                    this.auth_view && this.loginCallback(status, condition);
                    this.session.set({conn_status: status, conn_condition: condition});
                    if ((status === Strophe.Status.ERROR) && (condition === 'conflict') && !this.session.get('delete')) {
                        this.onConnectionConflict();
                    }
                    if (status === Strophe.Status.CONNECTED) {
                        this.session.set('on_token_revoked', false);
                        if (this.connection.x_token) {
                            this.save({
                                auth_type: 'x-token',
                                x_token: this.connection.x_token,
                                hotp_counter: this.connection.counter,
                            });
                        }

                        if (this.get('registration_nickname')){
                            let vcard = utils.vcard.getBlank(this.get('jid'));
                            vcard.nickname = this.get('registration_nickname');
                            this.setVCard(vcard,
                                () => {
                                    this.getVCard();
                                    this.set('registration_nickname', null)
                                },
                                function () {
                                    utils.dialogs.error(xabber.getString("account_user_info_save_fail"));
                                    this.set('registration_nickname', null)
                                }
                            );
                        }
                        this.createFastConnection();
                        if (this.connection.x_token) {
                            this.conn_manager.auth_type = 'x-token';
                        }
                        this.session.set({connected: true, reconnected: false});
                        if (xabber.api_account && !xabber.api_account.get('connected') && this.get('auto_login_xa') && !xabber.api_account.get('token') && constants.ENABLE_XABBER_ACCOUNT)
                            this.connectXabberAccount();
                    } else if (status === Strophe.Status.AUTHFAIL) {
                        if ((this.get('auth_type') === 'x-token' || this.connection.x_token))
                            if (this.session.get('conn_retries') <= 3)
                                this.reconnect();
                            else
                                this.onTokenRevoked();
                        else
                            this.onAuthFailed();
                    } else if (status === Strophe.Status.DISCONNECTED) {
                        if (this.session.get('on_token_revoked'))
                            return;
                        this.connection.flush();
                        this.session.set({connected: false});
                    }
                },

                connectXabberAccount: function () {
                    let iq_private_storage = $iq({type: 'get'}).c('query', {xmlns: Strophe.NS.PRIVATE_STORAGE}).c('storage', {xmlns:'xabber:options'});
                    this.sendIQ(iq_private_storage, (iq) => {
                        if (($(iq).find('option').attr('type') == 'bind') && ($(iq).find('option').text() == 1)) {
                            this.authXabberAccount();
                        }
                    });
                },

                authXabberAccount: function (callback) {
                    this.requestPassword((data) => {
                        this.xabber_auth = { api_jid: data.api_jid, request_id: data.request_id };
                        if (this.code_requests.length > 0) {
                            let verifying_code = this.code_requests.find(verifying_mess => (verifying_mess.jid === this.xabber_auth.api_jid && verifying_mess.id === this.xabber_auth.request_id));
                            if (verifying_code) {
                                let idx_verifying_code = this.code_requests.indexOf(verifying_code);
                                (idx_verifying_code > -1) && this.code_requests.splice(idx_verifying_code, 1);
                                this.verifyXabberAccount(verifying_code.code, (data) => {
                                    this._waiting_code = false;
                                    let iq_send_auth_mark = $iq({type: 'set'})
                                        .c('query', {xmlns: Strophe.NS.PRIVATE_STORAGE})
                                        .c('storage', {xmlns:'xabber:options'})
                                        .c('option', {type: 'bind'}).t(1);
                                    if (xabber.api_account) {
                                        xabber.api_account.save('token', data);
                                        xabber.api_account.login_by_token();
                                    }
                                    this.sendIQ(iq_send_auth_mark);
                                    callback && callback();
                                });
                            }
                            if (this.code_requests.length) {
                                let msg_attrs = {
                                    from_jid: this.code_requests[0].jid,
                                    message: xabber.getString("xmpp_confirm__text_message__verification_code_is", [Number(this.code_requests[0].code)]),
                                    is_archived: false
                                };
                                this.createMessageFromIQ(msg_attr);
                            }
                        }
                    });
                },

                requestPassword: function(callback) {
                    let request = {
                        type: 'POST',
                        url: constants.API_SERVICE_URL + '/accounts/xmpp_code_request/',
                        contentType: "application/json",
                        dataType: 'json',
                        data: JSON.stringify({ jid: this.connection.jid, type: 'iq'}),
                        success: function (data, textStatus, jqXHR) {
                            callback && callback(data);
                        }
                    };
                    this._waiting_code = true;
                    $.ajax(request);
                },

                reconnectionCallback: function (status, condition) {
                    if (!this.session.get('reconnecting')) {
                        xabber.info('ignore reconnection callback for status: '+constants.CONN_STATUSES[status]);
                        return;
                    }
                    this.session.set({conn_status: status, conn_condition: condition});
                    if (status === Strophe.Status.CONNECTED) {
                        this.session.set('on_token_revoked', false);
                        if (this.connection.x_token) {
                            this.save({
                                auth_type: 'x-token',
                                x_token: this.connection.x_token,
                                hotp_counter: this.connection.counter,
                            });
                        }
                        this.createFastConnection();
                        this.connection.connect_callback = this.connectionCallback.bind(this);
                        this.session.set({connected: true, reconnected: true,
                            reconnecting: false, conn_retries: 0});
                    } else if (status === Strophe.Status.AUTHFAIL) {
                        if ((this.get('auth_type') === 'x-token' || this.connection.x_token))
                            if (this.session.get('conn_retries') > 3)
                                this.onTokenRevoked();
                        else
                            this.onAuthFailed();
                    } else if (status === Strophe.Status.DISCONNECTED) {
                        if (this.session.get('on_token_revoked'))
                            return;
                        this.connection.flush();
                        let max_retries = xabber.settings.max_connection_retries;
                        if (max_retries === -1 || this.session.get('conn_retries') < max_retries) {
                            this.reconnect();
                        } else {
                            this.connFeedback(xabber.getString("connection__error__connection_lost"));
                        }
                    }
                },

                registerCallback: function (status, condition, error_text) {
                    if (status === Strophe.Status.REGISTER) {
                        this.connection.register.fields.username = Strophe.getNodeFromJid(this.get('jid'));
                        this.connection.register.fields.password = this.getPassword();
                        if (xabber.url_params && xabber.url_params.rkey) {
                            this.connection.register.fields.key = xabber.url_params.rkey;
                        }
                        this.connection.register.submit();
                    } else if (status === Strophe.Status.REGISTERED) {
                        let nickname = this.auth_view.$nickname_input.val()
                        this.auth_view.data.set('step',6);
                        if(nickname){
                            this.set('registration_nickname', nickname)
                        }
                    } else if (status === Strophe.Status.CONFLICT) {
                        this.auth_view.errorRegistrationFeedback({jid: xabber.getString("label_xmpp_id")});
                        this.auth_view.data.set('step', 3)
                    } else if (status === Strophe.Status.NOTACCEPTABLE) {
                        if (error_text)
                            this.auth_view.errorRegistrationFeedback({password: error_text});
                        else {
                            condition = condition ? ': ' + condition : '';
                            this.auth_view.errorRegistrationFeedback({password: xabber.getString("xmpp_login__registration_not_filled") + condition});
                        }
                        this.auth_view.data.set('step', 4)
                    } else if (status === Strophe.Status.REGIFAIL) {
                        if (error_text)
                            this.auth_view.errorRegistrationFeedback({password: error_text});
                        else {
                            condition = condition ? ': ' + condition : '';
                            this.auth_view.errorRegistrationFeedback({password: xabber.getString("xmpp_login__registration_failed") + condition});
                        }
                        this.auth_view.data.set('step', 4)
                    }
                },

                changePasswordCallback: function (status, condition) {
                    if (this.settings_right && this.settings_right.children && this.settings_right.children.account_password_view){
                        if (status === Strophe.Status.REGISTERED) {
                            this.settings_right.children.account_password_view.successFeedback();
                        } else if (status === Strophe.Status.CONFLICT
                            || status === Strophe.Status.NOTACCEPTABLE
                            || status === Strophe.Status.REGIFAIL) {
                            condition = condition ? ': ' + condition : '';
                            this.settings_right.children.account_password_view.errorFeedback({password: xabber.getString("password_changed_fail") + condition});
                        } else if (status === Strophe.Status.AUTHFAIL) {
                            this.settings_right.children.account_password_view.errorFeedback({old_password: xabber.getString("AUTHENTICATION_FAILED")});
                        } else if (status === Strophe.Status.CONNECTED) {
                            this.change_password_connection.register.fields.username = Strophe.getNodeFromJid(this.get('jid'));
                            this.change_password_connection.register.fields.password = this.settings_right.children.account_password_view.$password_input.val().trim();
                            this.change_password_connection.register.submit();
                        } else if (status === Strophe.Status.DISCONNECTED) {
                            this.change_password_connection_manager = undefined;
                            this.change_password_connection = undefined;
                        }
                    }
                },

                loginCallback: function (status, condition) {
                    if (status === Strophe.Status.CONNECTING) {
                        if (this.auth_view.stepped_auth){
                            this.auth_view.resetAuthStepper()
                        }
                    } else if (status === Strophe.Status.CONNECTED) {
                        this.save('is_new', undefined);
                        if (this.auth_view.stepped_auth && !this.auth_view.data.get('registration'))
                            this.auth_view.authStepperStart();
                        else{
                            this.auth_view.endAuth();
                        }

                    } else if (_.contains(constants.BAD_CONN_STATUSES, status)) {
                        let stepper_auth_error = false;
                        if (status === Strophe.Status.ERROR) {
                            status = xabber.getString("CONNECTION_FAILED");
                        } else if (status === Strophe.Status.CONNFAIL) {
                            status = xabber.getString("CONNECTION_FAILED");
                        } else if (status === Strophe.Status.AUTHFAIL) {
                            status = xabber.getString("AUTHENTICATION_FAILED");
                            stepper_auth_error = true;
                        } else if (status === Strophe.Status.DISCONNECTED) {
                            status = xabber.getString("connection__error__text_disconnected");
                        } else if (status === Strophe.Status.CONNTIMEOUT) {
                            status = xabber.getString("connection__error__text_timeout_expired");
                        }
                        condition = condition ? ': ' + condition : '';
                        if (this.auth_view.stepped_auth)
                            this.auth_view.authStepperError(stepper_auth_error, {password: status + condition});
                        else
                            this.auth_view.errorFeedback({password: status + condition});
                        this.get('is_new') && this.destroy();
                    }
                },

                onAuthFailed: function () {
                    if (!this.auth_view)
                        utils.dialogs.error(xabber.getString("connection__error__text_authentication_failed", [this.get('jid')]));
                    this.session.set({
                        auth_failed: true,
                        no_reconnect: true
                    });
                    this.trigger('deactivate', this);
                    this.connFeedback(xabber.getString("connection__error__text_authentication_failed_short"));
                },

                onConnectionConflict: function () {
                    utils.dialogs.error(xabber.getString("connection__error__text_connection_conflict", [this.get('jid')]));
                    this.session.set({
                        auth_failed: true,
                        no_reconnect: true
                    });
                    this.trigger('deactivate', this);
                    this.connFeedback(xabber.getString("connection__error__text_connection_conflict_short"));
                },

                getAllXTokens: function () {
                    let tokens_list = [],
                        iq = $iq({
                            from: this.get('jid'),
                            type: 'get',
                            to: this.connection.domain
                        }).c('query', {xmlns: `${Strophe.NS.AUTH_DEVICES}#items`});
                    this.sendIQ(iq, (tokens) => {
                        $(tokens).find('device').each((idx, token) => {
                            let $token = $(token),
                                client = $token.find('client').text(),
                                device = $token.find('info').text(),
                                description = $token.find('description').text(),
                                token_uid = $token.attr('id'),
                                expire = Number($token.find('expire').text())*1000,
                                last_auth = Number($token.find('last-auth').text())*1000,
                                ip_address = $token.find('ip').text();
                            tokens_list.push({client: client, device: device, description: description, token_uid: token_uid, last_auth: last_auth, expire: expire, ip: ip_address});
                        });
                        this.x_tokens_list = tokens_list;
                        this.settings_right && this.settings_right.updateXTokens();
                    });
                },

                onTokenRevoked: function () {
                    if (xabber.api_account && xabber.api_account.get('xmpp_binding') === this.get('jid')) {
                        xabber.trigger('quit_accounts');
                        return;
                    }
                    if (!this.auth_view) {
                        utils.dialogs.error(xabber.getString("connection__error__text_token_invalidated", [this.get('jid')]));
                    }
                    this.session.set({
                        on_token_revoked: true,
                        auth_failed: true,
                        connected: false,
                        no_reconnect: true
                    });
                    this.save({auth_type: 'password', password: null, x_token: null});
                    this.connection.pass = "";
                    this.trigger('deactivate', this);
                    this.connFeedback(xabber.getString("connection__error__text_token_invalidated_short"));
                    // this.connect({token_invalidated: true});
                },

                onChangedConnected: function () {
                    if (this.isConnected()) {
                        this.session.get('reconnected') ? this.onReconnected() : this.onConnected();
                    } else {
                        this.onDisconnected();
                    }
                },

                onConnected: function () {
                    this.connFeedback(xabber.getString("account_state_connected"));
                    this.jid = this.connection.jid;
                    this.resource = Strophe.getResourceFromJid(this.jid);
                    this.domain = Strophe.getDomainFromJid(this.jid);
                    this.trigger('activate', this);
                    this.session.get('no_reconnect') && this.session.set('no_reconnect', false);
                    this.afterConnected();
                    _.each(this._after_connected_plugins, (plugin) => {
                        plugin.call(this);
                    });
                },

                onBackgroundConnected: function (status) {
                    if (status === Strophe.Status.CONNECTED) {
                        if (this.background_connection.x_token) {
                            this.save({
                                x_token: this.background_connection.x_token,
                                hotp_counter: this.background_connection.counter,
                            });
                            this.background_conn_manager.auth_type = 'x-token';
                            this.background_connection.x_token_auth = true;
                            if (this.fast_connection && this.fast_connection.pass)
                                this.background_connection.pass = this.fast_connection.pass;
                            else if (this.connection && this.connection.pass)
                                this.background_connection.pass = this.connection.pass;
                        }
                        _.each(this._after_background_connected_plugins, (plugin) => {
                            plugin.call(this);
                        });
                    } else if (status === Strophe.Status.AUTHFAIL || status === Strophe.Status.DISCONNECTED) {
                        this.background_conn_manager = undefined;
                        this.background_connection = undefined;
                    }
                },

                onFastConnected: function (status) {
                    if (status === Strophe.Status.CONNECTED) {
                        if (this.fast_connection.x_token) {
                            this.save({
                                x_token: this.fast_connection.x_token,
                                hotp_counter: this.fast_connection.counter,
                            });
                            this.fast_conn_manager.auth_type = 'x-token';
                            this.fast_connection.x_token_auth = true;
                            if (this.connection && this.connection.pass)
                                this.fast_connection.pass = this.connection.pass;
                        }
                        this.createBackgroundConnection();
                        _.each(this._after_fast_connected_plugins, (plugin) => {
                            plugin.call(this);
                        });
                    } else if (status === Strophe.Status.AUTHFAIL || status === Strophe.Status.DISCONNECTED) {
                        this.fast_conn_manager = undefined;
                        this.fast_connection = undefined;
                    }
                },

                onReconnected: function () {
                    this.connFeedback(xabber.getString("account_state_connected"));
                    this.afterConnected();
                    _.each(this._after_reconnected_plugins, (plugin) => {
                        plugin.call(this);
                    });
                },

                afterConnected: function () {
                    this.registerPresenceHandler();
                    this.enableCarbons();
                    this.getVCard();
                    this.sendPendingStanzas();
                    /*setTimeout(() => {
                        this.sendPendingMessages();
                    }, 5000);*/
                },

                getAllMessageRetractions: function (encrypted, callback) {
                    let query_options = {xmlns: Strophe.NS.REWRITE, version: (encrypted && this.omemo) ? this.omemo.getRetractVersion() : this.retraction_version};
                    encrypted && (query_options.type = 'encrypted');
                    let retractions_query = $iq({type: 'get'})
                        .c('query', query_options);
                    this.sendIQ(retractions_query, callback);
                },

                sendPendingStanzas: function () {
                    _.each(this._pending_stanzas, (item) => {
                        if (item.stanza instanceof Strophe.Builder) {
                            this.connection.send(item.stanza);
                            item.callback && item.callback();
                        } else {
                            this.connection.sendIQ.apply(this.connection, item.stanza);
                        }
                    });
                    this._pending_stanzas = [];
                },

                sendPendingMessages: function () {
                    _.each(this._pending_messages, (item) => {
                        let msg = this.messages.get(item.msg_id), $msg_iq;
                        msg && ($msg_iq = msg.get('xml')) && msg.set('state', constants.MSG_PENDING);
                        $msg_iq && this.sendMsg($msg_iq);
                    });
                },

                _after_connected_plugins: [],
                _after_reconnected_plugins: [],
                _after_background_connected_plugins: [],
                _after_fast_connected_plugins: [],

                onDisconnected: function () {
                    this.disconnected_timestamp = this.last_stanza_timestamp;
                    if (this.session.get('delete')) {
                        this.destroy();
                        return;
                    }
                    let deactivate = this.session.get('deactivate');
                    if (deactivate) {
                        this.connFeedback(xabber.getString("settings_account__label_state_disconnected"));
                        this.session.set('deactivate', null);
                        if (deactivate === 'set_off') {
                            this.trigger('deactivate', this);
                        }
                    } else {
                        if (this.session.get('no_reconnect')) {
                            this.session.set('no_reconnect', false);
                        } else {
                            this.fast_connection && this.fast_connection.connected && this.fast_connection.disconnect();
                            this.background_connection && this.background_connection.connected && this.background_connection.disconnect();
                            this.reconnect();
                        }
                    }
                },

                connFeedback: function (message) {
                    this.session.set("conn_feedback", message);
                },

                enableCarbons: function () {
                    let iq = $iq({type: 'set'}).c('enable', {xmlns: Strophe.NS.CARBONS});
                    this.sendIQ(iq);
                },

                getVCard: function (callback) {
                    let jid = this.get('jid'),
                        is_callback = _.isFunction(callback);
                    if (this.connection && this.connection.connected) {
                        ((this.background_connection && this.background_connection.connected) ? this.background_connection : this.connection).vcard.get(jid,
                            (vcard) => {
                                let attrs = {
                                    vcard: vcard,
                                    vcard_updated: moment.now()
                                };
                                attrs.name = vcard.nickname || (vcard.first_name + ' ' + vcard.last_name).trim() || vcard.fullname || jid;
                                if (!this.get('avatar_priority') || this.get('avatar_priority') <= constants.AVATAR_PRIORITIES.VCARD_AVATAR) {
                                    if (vcard.photo.image) {
                                        attrs.avatar_priority = constants.AVATAR_PRIORITIES.VCARD_AVATAR;
                                        attrs.image = vcard.photo.image;
                                    }
                                    else
                                        attrs.image = Images.getDefaultAvatar(attrs.name);
                                    this.cached_image = Images.getCachedImage(attrs.image);
                                }
                                this.save(attrs);
                                is_callback && callback(vcard);
                            },
                            function () {
                                is_callback && callback(null);
                            }
                        );
                    }
                },

                setVCard: function (data, callback, errback) {
                    let vcard = _.extend(_.clone(this.get('vcard')), data);
                    this.connection.vcard.set(this.get('jid'), vcard, () => {
                        this.vcardPhotoUpdated(vcard.photo.image);
                        callback && callback();
                    }, errback);
                },

                getStatusMessage: function () {
                    return this.get('status_message') || xabber.getString([this.get('status')]);
                },

                setStatus: function (status, message) {
                    let attrs = { status_updated: moment.now() };
                    status !== null && (attrs.status = status);
                    message !== null && (attrs.status_message = message || '');
                    if (status === 'offline' && this.get('status') !== 'offline')
                        attrs.status_prev = this.get('status');
                    this.save(attrs);
                    if (!this.get('enabled'))
                        return;
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

                getAvatarHash: function (avatar) {
                    let from_avatar = avatar || this.get('vcard').photo.image;
                    if (from_avatar) {
                        let decoded_raw = atob(from_avatar),
                            bin = Uint8Array.from(Array.prototype.map.call(decoded_raw,function(x) {
                                return x.charCodeAt(0);
                            }));
                        return sha1(bin);
                    }
                    else
                        return "";
                },

                vcardPhotoUpdated: function (photo) {
                    let stanza = $pres().c('x', {xmlns: Strophe.NS.VCARD_UPDATE}).c('photo').t(this.getAvatarHash(photo)).up().up();
                    return this.sendPres(stanza);
                },

                sendPresence: function (type, message) {
                    type = type || this.get('status');
                    let status_message = message || this.get('status_message'), stanza = $pres();
                    if (type === 'offline') {
                        stanza.attrs({'type': 'unavailable'});
                    } else {
                        if (type !== 'online') {
                            stanza.c('show').t(type).up();
                        }
                        stanza.c('status').t(status_message).up();
                        stanza.c('priority').t(this.get('priority')).up();
                        if(this.get('x_token'))
                            stanza.c('device', {xmlns: Strophe.NS.AUTH_DEVICES, id: this.get('x_token').token_uid}).up();
                    }
                    stanza.cnode(this.connection.caps.createCapsNode({
                        node: 'https://www.xabber.com/clients/xabber/web'
                    }).tree());
                    return this.sendPres(stanza);
                },

                showSettings: function (right, block_name) {
                    let has_settings_right = !_.isUndefined(this.settings_right);
                    if (!this.settings_left)
                        this.settings_left = new xabber.AccountSettingsLeftView({model: this});
                    if (!has_settings_right)
                        this.settings_right = new xabber.AccountSettingsRightView({model: this});
                    this.updateColorScheme();
                    xabber.body.setScreen('account_settings', {
                        account: this, right: right, block_name: block_name
                    });
                    this.trigger('open_settings');
                    if (!has_settings_right) {
                        this.trigger('render_settings');
                        this.settings_right.addChild('blocklist', xabber.BlockListView, {
                            account: this,
                            el: this.settings_right.$('.blocklist-info')[0]
                        });
                        this.settings_right.addChild('account_password_view', xabber.ChangeAccountPasswordView, {
                            model: this,
                            el: this.settings_right.$('.change-password-container')[0]
                        });
                    }
                },

                updateColorScheme: function () {
                    let color = this.settings.get('color');
                    this.settings_left && this.settings_left.$el.attr('data-color', color);
                    if (this.settings_right) {
                        this.settings_right.$el.attr('data-color', color);
                    }
                    this.vcard_edit.$el.attr('data-color', color);
                },

                revokeXToken: function (token_uid, callback) {
                    let iq = $iq({
                        from: this.get('jid'),
                        type: 'set',
                        to: this.connection.domain
                    }).c('revoke', {xmlns:Strophe.NS.AUTH_DEVICES});
                    for (let token_num = 0; token_num < token_uid.length; token_num++)
                        iq.c('device', {id: token_uid[token_num]}).up();
                    this.sendIQ(iq, () => {
                        callback && callback();
                    });
                },

                revokeAllXTokens: function (callback, errback) {
                    let iq = $iq({
                        from: this.get('jid'),
                        type: 'set',
                        to: this.connection.domain
                    }).c('revoke-all', {xmlns:Strophe.NS.AUTH_DEVICES});
                    this.sendIQ(iq, (success) => {
                            callback & callback(success);
                        },
                        function (error) {
                            errback && errback(error);
                        });
                },

                deleteAccount: function (show_settings) {
                    this.show_settings_after_delete = show_settings;
                    xabber.body.setScreen('all_chats', {right_contact: ''});
                    if (this.get('x_token'))
                        this.revokeXToken([this.get('x_token').token_uid]);
                    this.session.set('delete', true);
                    this.deactivate();
                    if (xabber.api_account && xabber.api_account.get('xmpp_binding') === this.get('jid'))
                        xabber.trigger('quit_accounts');
                },

                activate: function () {
                    if (!this.isConnected())
                        this.connect();
                },

                deactivate: function (type) {
                    type || (type = 'set_off');
                    this.session.set('deactivate', type);
                    if (this.isConnected()) {
                        this.connFeedback(xabber.getString("settings_account__label_state_disconnecting"));
                        this.sendPresence('offline');
                        this.connection.disconnect();
                        if (this.fast_conn_manager) this.fast_connection.disconnect();
                        if (this.background_conn_manager) this.background_connection.disconnect();
                    } else {
                        this.onDisconnected();
                    }
                },

                onDestroy: function () {
                    if (this.connection && !this.connection.register._registering)
                        this.connection.connect_callback = null;
                    if (this.settings)
                        this.settings.destroy();
                    if (this.isConnected()) {
                        this.connection.disconnect();
                        if (this.fast_conn_manager) this.fast_connection.disconnect();
                        if (this.background_conn_manager) this.background_connection.disconnect();
                    }
                    this.trigger('remove_saved_chat');
                },

                registerIQHandler: function () {
                    this.connection.deleteHandler(this._stanza_handler);
                    this._stanza_handler = this.connection.addHandler((iq) => {
                            this.onGetIQ(iq);
                            return true;
                        }, null, 'iq', "get");
                },


                registerSyncedIQHandler: function () {
                    this.connection.deleteHandler(this._synced_stanza_handler);
                    this._synced_stanza_handler = this.connection.addHandler(
                        this.onSyncedIQ.bind(this),
                        Strophe.NS.SYNCHRONIZATION, 'iq', "set");
                },

                registerPresenceHandler: function () {
                    this.connection.deleteHandler(this._pres_handler);
                    this._pres_handler = this.connection.addHandler(
                        (presence) => {
                            this.onPresence(presence);
                            return true;
                        }, null, 'presence', null);
                },

                onSyncedIQ: function (iq) {
                    this.roster.syncConversations(iq);
                    return true;
                },

                onGetIQ: function (iq) {
                    let $incoming_iq = $(iq),
                        $confirm = $incoming_iq.find(`confirm[xmlns="${Strophe.NS.HTTP_AUTH}"]`),
                        $session_availability = $incoming_iq.find(`query[xmlns="${Strophe.NS.JINGLE_MSG}"]`),
                        request_code,
                        from_jid = $incoming_iq.attr('from');
                    if ($confirm.length) {
                        request_code = $confirm.attr('id');
                        if (this._waiting_code && ($confirm.attr('url') === constants.XABBER_ACCOUNT_URL + '/auth/login/')) {
                            if (this.xabber_auth.api_jid && this.xabber_auth.request_id) {
                                if (($incoming_iq.attr('id') === this.xabber_auth.request_id) && (from_jid === this.xabber_auth.api_jid))
                                    this.verifyXabberAccount(request_code, (data) => {
                                        this._waiting_code = false;
                                        if (this.get('auto_login_xa')) {
                                            xabber.api_account.save('token', data);
                                            xabber.api_account.login_by_token();
                                        }
                                    });
                            }
                            else {
                                this.code_requests.push({
                                    jid: from_jid,
                                    id: $incoming_iq.attr('id'),
                                    code: request_code
                                });
                            }
                        }
                        else {
                            let msg_attrs = {
                                    from_jid: from_jid,
                                    message: xabber.getString("xmpp_confirm__text_message__verification_code_is", [request_code]),
                                    is_archived: false
                                };
                            this.createMessageFromIQ(msg_attr);
                        }
                    }
                    if ($session_availability.length) {
                        let session_id = $session_availability.children('session').attr('id'), $session_availability_response;
                        if (session_id && xabber.current_voip_call && session_id === xabber.current_voip_call.get('session_id') && !xabber.current_voip_call.get('state')) {
                            $session_availability_response = $iq({from: this.get('jid'), to: from_jid, type: 'result', id: $incoming_iq.attr('id')})
                                .c('query', {xmlns: Strophe.NS.JINGLE_MSG})
                                .c('session', {id: session_id});
                            xabber.current_voip_call.updateStatus(xabber.getString("dialog_jingle_message__status_calling"));
                        }
                        else {
                            $session_availability_response = $iq({from: this.get('jid'), to: from_jid, type: 'error', id: $incoming_iq.attr('id')})
                                .c('error', {xmlns: Strophe.NS.JINGLE_MSG});

                        }
                        this.sendIQ($session_availability_response);
                    }
                },

                createMessageFromIQ: function (attrs) {
                    let contact = this.contacts.mergeContact(attrs.from_jid),
                        chat = this.chats.getChat(contact);
                    chat.messages.create(attrs);
                },

                onPresence: function (presence) {
                    let $presence = $(presence),
                        type = presence.getAttribute('type');
                    if (type === 'error') { return; }
                    let jid = presence.getAttribute('from'),
                        bare_jid = Strophe.getBareJidFromJid(jid);
                    if (bare_jid !== this.get('jid')) {
                        _.each(this._added_pres_handlers, function (handler) {
                            handler(presence, bare_jid);
                        });
                        return;
                    };
                    let resource = Strophe.getResourceFromJid(jid),
                        priority = Number($presence.find('priority').text()),
                        status = $presence.find('show').text() || 'online',
                        status_message = $presence.find('status').text();
                    _.isNaN(priority) && (priority = 0);
                    let $vcard_update = $presence.find(`x[xmlns="${Strophe.NS.VCAD_UPDATE}"]`);
                    if ($vcard_update.length && this.get('avatar_priority') && this.get('avatar_priority') <= constants.AVATAR_PRIORITIES.VCARD_AVATAR)
                        this.save('photo_hash', $vcard_update.find('photo').text());
                    if (resource) {
                        let resource_obj = this.resources.get(resource);
                        if (type === 'unavailable') {
                            if (resource_obj) { resource_obj.destroy(); }
                        } else {
                            let attrs = {
                                resource: resource,
                                priority: priority,
                                status: status,
                                status_message: status_message
                            };
                            let $device = $presence.find(`device[xmlns="${Strophe.NS.AUTH_DEVICES}"]`);
                            if ($device && this.x_tokens_list && $device.attr('id')) {
                                attrs.token_uid = $device.attr('id')
                            }
                            if (!resource_obj)
                                resource_obj = this.resources.create(attrs);
                            else
                                resource_obj.set(attrs);
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
                },

                addBackgroundConnPlugin: function (func, conn, reconn) {
                    conn && this.prototype._after_background_connected_plugins.push(func);
                },

                addFastConnPlugin: function (func, conn, reconn) {
                    conn && this.prototype._after_fast_connected_plugins.push(func);
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
                this.on("destroy deactivate", this.onAccountDisconnected, this);
                xabber.on("quit", this.onQuit, this);
                xabber.on("quit_accounts", this.onQuitAccounts, this);
                this.settings_list.on("add_settings", this.onSettingsAdded, this);
                xabber.api_account && xabber.api_account.on("settings_result", function (result) {
                    result && this.trigger('update_order');
                }, this);
            },

            onQuit: function () {
                xabber.api_account && xabber.api_account.revoke_token();
                _.each(_.clone(this.models), function (account) {
                    account.deleteAccount();
                    account.password_view.closeModal();
                    utils.modals.clear_queue();
                });
                !this.models.length && xabber.body.setScreen('login');
            },

            onQuitAccounts: function () {
                xabber.api_account && xabber.api_account.revoke_token();
                _.each(_.clone(this.models), function (account) {
                    if (account.settings.get('to_sync')) {
                        account.deleteAccount();
                        account.password_view.closeModal();
                        utils.modals.clear_queue();
                    }
                });
                !this.models.length && xabber.body.setScreen('login');
            },

            getEnabledList: function () {
                this.enabled = this.filter(account => account.get('enabled'));
            },

            getConnectedList: function () {
                this.connected = this.filter(account => account.isConnected());
            },

            onListChanged: function () {
                this.getEnabledList();
                this.getConnectedList();
                this.trigger('list_changed', this);
            },

            onAdd: function (account) {
                if (account.is_invalid)
                    account.destroy();
            },

            onDestroy: function (account) {
                if (!account.get('is_new')) {
                    let no_accounts = !(this.length || xabber.api_account && xabber.api_account.get('connected'));
                    if (no_accounts) {
                        xabber.body.setScreen('login');
                    } else if (account.show_settings_after_delete) {
                        xabber.body.setScreen('settings');
                    } else {
                        xabber.body.setScreen('all-chats');
                        xabber.chats_view.showAllChats();
                    }
                }
            },

            onAccountDisconnected: function () {
                xabber.toolbar_view.recountAllMessageCounter();
                xabber.recountAllMessageCounter();
            },

            onSettingsAdded: function (settings) {
                let jid = settings.get('jid');
                if (!this.get(jid))
                    this.create({jid: jid});
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
                let used_colors = {}, colors = constants.MATERIAL_COLORS;
                this.each(function (account) {
                    used_colors[account.settings.get('color')] = true;
                });
                for (let idx = 0; idx < colors.length; idx++) {
                    if (!used_colors[colors[idx]])
                        return colors[idx];
                }
                return 'red';
            },

            moveBefore: function (acc1, acc2) {
                let index2 = this.indexOf(acc2),
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
                if (xabber.api_account && xabber.api_account.get('connected')) {
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
                'click .filter-chats': 'filterChats',
                'click .circle-avatar': 'showSettings'
            },

            _initialize: function () {
                this.updateConnected();
                this.updateAuthState();
                this.updateStatus();
                this.updateAvatar();
                this.updateColorScheme();
                this.$el.attr('data-jid', this.model.get('jid'));
                this.model.session.on("change:auth_failed", this.updateAuthState, this);
                this.model.session.on("change:connected", this.updateConnected, this);
                this.model.on("change:status", this.updateStatus, this);
                this.model.on("change:image", this.updateAvatar, this);
                this.model.settings.on("change:color", this.updateColorScheme, this);
                this.model.on("filter_chats", this.setActive, this);
                this.model.on("open_settings", this.setActive, this);
            },

            updateConnected: function () {
                this.$el.switchClass('disconnected', !this.model.isConnected());
            },

            updateAuthState: function () {
                let auth_failed = this.model.session.get('auth_failed');
                this.$('.status').hideIf(auth_failed);
                this.$('.auth-failed').showIf(auth_failed);
            },

            updateStatus: function () {
                this.$('.status').attr('data-status', this.model.get('status'));
            },

            updateAvatar: function () {
                let image = this.model.cached_image;
                this.$('.circle-avatar').setAvatar(image, this.avatar_size);
            },

            updateColorScheme: function () {
                this.$el.attr('data-color', this.model.settings.get('color'));
            },

            showSettings: function () {
                let scroll_top = xabber.toolbar_view.getScrollTop();
                this.model.showSettings();
                xabber.toolbar_view.scrollTo(scroll_top);
            },

            filterChats: function (ev) {
                let scroll_top = xabber.toolbar_view.getScrollTop();
                ev.stopPropagation();
                xabber.chats_view.showChatsByAccount(this.model);
                this.model.trigger('filter_chats');
                xabber.toolbar_view.scrollTo(scroll_top);
            },

            setActive: function () {
                xabber.toolbar_view.$('.toolbar-item').removeClass('active');
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
                _.each(this.model.enabled, (account) => {
                    let jid = account.get('jid'), view = this.child(jid);
                    !view && (view = this.addChild(jid, xabber.AccountToolbarItemView, {model: account}));
                    this.$el.append(view.$el);
                });
                this.parent.updateScrollBar();
            },

            updateOneInList: function (account) {
                let jid = account.get('jid');
                if (account.get('enabled')) {
                    let view = this.child(jid);
                    if (view) {
                        view.$el.detach();
                    } else {
                        view = this.addChild(jid, xabber.AccountToolbarItemView,
                            {model: account});
                    }
                    let index = this.model.enabled.indexOf(account);
                    if (index === 0) {
                        this.$el.prepend(view.$el);
                    } else {
                        this.$('.account-item').eq(index - 1).after(view.$el);
                    }
                } else {
                    account.last_msg_timestamp = 0;
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
                let attrs = this.model.attributes;
                this.$('.status').attr('data-status', attrs.status);
                this.$('.status-message').text(attrs.status_message || xabber.getString(attrs.status));
                this.$('.client').text(attrs.client || xabber.getString("please_wait"));
                this.$('.resource').text(attrs.resource);
                this.$('.priority').text(attrs.priority);
                return this;
            }
        });

        xabber.ResourceRightView = xabber.BasicView.extend({
            className: 'resource-wrap',
            template: templates.resource_right,

            _initialize: function (options) {
                this.update();
                this.model.on("change", this.update, this);
            },

            update: function () {
                let attrs = this.model.attributes;
                this.$('.status').attr('data-status', attrs.status);
                this.$('.status-message').text(attrs.status_message || xabber.getString(attrs.status));
                this.$('.client').text(attrs.client || xabber.getString("please_wait"));
                this.$('.resource').text(attrs.resource);
                this.$('.priority').text(attrs.priority);
                return this;
            }
        });

        xabber.Resources = Backbone.Collection.extend({
            model: xabber.Resource,
            comparator: function (r1, r2) {
                let p1 = r1.get('priority'), p2 = r2.get('priority');
                return p1 > p2 ? -1 : (p1 < p2 ? 1 : 0);
            },

            requestInfo: function (resource, callback) {
                let jid = this.jid + '/' + resource.get('resource');
                if (this.connection && this.connection.connected) {
                    this.connection.disco.info(jid, null, (iq) => {
                        let $identity = $(iq).find('identity[category=client]');
                        if ($identity.length)
                            resource.set('client', $identity.attr('name'));
                        this.attention_supported = this.isFeatureSupported(iq, Strophe.NS.ATTENTION);
                        callback && callback();
                    });
                }
            },

            isFeatureSupported: function (stanza, ns) {
                let $stanza = $(stanza), is_supported = false;
                $stanza.find('feature').each(function () {
                    let namespace = $(this).attr('var');
                    if (namespace === ns)
                        is_supported = true;
                });
                return is_supported;
            },
        });

        xabber.ResourcesView = xabber.BasicView.extend({
            _initialize: function () {
                this.renderByInit();
                this.model.on("add", this.onResourceAdded, this);
                this.model.on("remove", this.onResourceRemoved, this);
                this.model.on("reset", this.onReset, this);
                this.model.on("change:priority", this.onPriorityChanged, this);
            },

            renderByInit: function () {
                this.model.each((resource) => {
                    this.onResourceAdded(resource);
                });
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
                let view = this.child(resource.get('resource'));
                if (!view) return;
                view.$el.detach();
                let index = this.model.indexOf(resource);
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
                "click .btn-vcard-edit": "showEditView",
                "click .details-icon": "onClickIcon"
            },

            __initialize: function () {
                this.updateButtons();
                this.model.on("activate deactivate", this.updateButtons, this);
            },

            updateButtons: function () {
                let connected = this.model.isConnected();
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
                "change .main-info-wrap .circle-avatar input": "changeAvatar",
                "click .btn-choose-image": "chooseAvatar",
                "click .btn-emoji-panel": "openEmojiPanel",
                "click .btn-selfie": "openWebcamPanel",
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
                !options.block_name && (options.block_name = 'connection')
                this.$el.switchClass('vcard-edit', options.right == 'vcard_edit');
                this.$('.settings-tab[data-block-name="tokens"]').hideIf(this.model.get('auth_type') !== 'x-token');
                this.$('.settings-tab').removeClass('active');
                this.$(`.settings-tab[data-block-name="${options.block_name}"]`).addClass('active');
                this.$('.circle-avatar.dropdown-button').dropdown({
                    inDuration: 100,
                    outDuration: 100,
                    constrainWidth: false,
                    hover: false,
                    alignment: 'left'
                });

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
                let image = this.model.cached_image;
                this.$('.circle-avatar').setAvatar(image, this.avatar_size);
            },

            updateBlocks: function () {
                let connected = this.model.isConnected();
                this.$('.main-info-wrap').switchClass('disconnected', !connected);
                // this.$('.settings-tab[data-block-name="xmpp-resources"]').showIf(connected);
                this.$('.settings-tab[data-block-name="server-info"]').showIf(connected);
                this.$('.settings-tab[data-block-name="blocklist"]').showIf(connected);
                this.$('.settings-tab[data-block-name="groups-info"]').showIf(connected);
                this.updateScrollBar();
            },

            updateNameCSS: function () {
                if (!this.isVisible())
                    return;
                let $name = this.$('.name');
                $name.removeAttr('style');
                let wrap_width = this.$('.name-wrap').width(),
                    width = $name.width(),
                    font_size = 22;
                while (width > wrap_width && font_size > 12) {
                    $name.css({'font-size': font_size});
                    width = $name.width();
                    font_size -= 2;
                }
                $name.css({'margin-left': (wrap_width - width) / 2});
            },

            chooseAvatar: function () {
                this.$('.main-info-wrap .circle-avatar input').click();
            },

            openEmojiPanel: function () {
                let emoji_panel_view = new xabber.EmojiProfileImageView();
                emoji_panel_view.open({model: this.model});
            },

            openWebcamPanel: function () {
                let webcam_panel_view = new xabber.WebcamProfileImageView();
                webcam_panel_view.open({model: this.model});
            },

            changeAvatar: function (ev) {
                let field = ev.target;
                if (!field.files.length)
                    return;
                let file = field.files[0];
                field.value = '';
                if (file.size > constants.MAX_AVATAR_FILE_SIZE) {
                    utils.dialogs.error(xabber.getString("group_settings__error__avatar_too_large"));
                    return;
                } else if (!file.type.startsWith('image')) {
                    utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                    return;
                }
                this.$('.circle-avatar').find('.preloader-wrap').addClass('visible').find('.preloader-wrapper').addClass('active');
                utils.images.getAvatarFromFile(file).done((image, hash, size) => {
                    if (image) {
                        this.model.pubAvatar({base64: image, hash: hash, size: size, type: file.type}, () => {
                                this.$('.circle-avatar').setAvatar(image, this.avatar_size);
                                this.$('.circle-avatar').find('.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');
                            }, () => {
                                this.$('.circle-avatar').find('.preloader-wrap').removeClass('visible').find('.preloader-wrapper').removeClass('active');
                                utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                            });
                    } else
                        utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                });
            },

            updateCSS: function () {
                this.updateNameCSS();
            },

            openChangeStatus: function () {
                !xabber.change_status_view && (xabber.change_status_view = new xabber.ChangeStatusView());
                xabber.change_status_view.open(this.model);
            },

            jumpToBlock: function (ev) {
                let $tab = $(ev.target).closest('.settings-tab'),
                    block_name = $tab.data('block-name');
                if (block_name === 'vcard_edit'){
                    this.model.showSettings(block_name, 'vcard');
                    this.$('.settings-tab').removeClass('active');
                    $tab.addClass('active');
                }
                else
                    this.model.showSettings(null, block_name);
            },

            deleteAccount: function () {
                let dialog_options = [];
                if (xabber.api_account && xabber.api_account.get('connected')) {
                    dialog_options = [{name: 'delete_settings',
                        checked: this.model.settings.get('to_sync'),
                        text: xabber.getString("dialog_delete_account__label_delete_synced_settings")}];
                }
                utils.dialogs.ask(xabber.getString("settings_account__button_quit_account"), xabber.getString("dialog_quit_account__confirm"),
                    dialog_options, { ok_button_text: xabber.getString("button_quit")}).done((res) => {
                    if (!res)
                        return;
                    if (res.delete_settings && xabber.api_account) {
                        if (xabber.api_account.get('xmpp_binding') === this.model.get('jid'))
                            xabber.api_account._call_method('DELETE', '/accounts/current/client-settings/', {jid: this.model.get('jid')});
                        else
                            xabber.api_account.delete_settings(this.model.get('jid'));
                    }
                    this.model.deleteAccount();
                });
            }
        });

        xabber.AccountSettingsRightView = xabber.BasicView.extend({
            className: 'account-settings-right-wrap',
            template: templates.settings_right,
            ps_selector: '.panel-content',

            events: {
                "change .enabled-state input": "setEnabled",
                "change .setting-send-chat-states input": "setTypingNotification",
                "change .setting-use-omemo input": "setEnabledOmemo",
                "click .btn-change-password": "showPasswordView",
                "click .btn-reconnect": "reconnect",
                "click": "hideResources",
                "click .last-auth.resource": "showResources",
                "change .sync-account": "changeSyncSetting",
                "click .btn-delete-settings": "deleteSettings",
                "change .color-scheme input[type=radio][name=account_color]": "changeColor",
                "click .token-wrap .btn-revoke-token": "revokeXToken",
                "click .tokens .btn-revoke-all-tokens": "revokeAllXTokens",
                "click .omemo-info .btn-manage-devices": "openDevicesWindow",
                "click .btn-block": "openBlockWindow",
                "click .btn-unblock-selected": "unblockSelected",
                "click .btn-deselect-blocked": "deselectBlocked",
                "click .omemo-info .btn-purge-keys": "purgeKeys"
            },

            _initialize: function () {
                // this.resources_view = this.addChild('resources', xabber.AccountResourcesView,
                //     {model: this.model.resources, el: this.$('.xmpp-resources')[0]});
                this.vcard_view = this.addChild('vcard', xabber.AccountVCardView,
                    {model: this.model, el: this.$('.vcard')[0]});
                this.$('.account-name .value').text(this.model.get('jid'));
                this.updateStatus();
                this.updateView();
                this.showConnectionStatus();
                this.updateSynchronizationBlock();

                this.model.resources.on("change", this.updateXTokens, this);
                this.model.resources.on("add", this.updateXTokens, this);
                this.model.resources.on("destroy", this.updateXTokens, this);
                this.model.session.on("change:reconnecting", this.updateReconnectButton, this);
                this.model.session.on("change:conn_feedback", this.showConnectionStatus, this);
                this.model.settings.on("change:to_sync", this.updateSyncOption, this);
                this.model.settings.on("change:deleted", this.updateDelSettingsButton, this);
                this.model.settings.on("change:to_sync change:synced", this.updateSyncState, this);
                xabber.api_account && xabber.api_account.on("change:connected", this.updateSynchronizationBlock, this);
                this.model.on("change:enabled", this.updateEnabled, this);
                this.model.settings.on("change:omemo", this.updateEnabledOmemo, this);
                this.model.settings.on("change:encrypted_chatstates", this.updateEncryptedChatstates, this);
                this.model.on("change:status_updated", this.updateStatus, this);
                this.model.on("activate deactivate", this.updateView, this);
                this.model.on("destroy", this.remove, this);
            },

            render: function (options) {
                !options.block_name && (options.block_name = 'connection')
                this.updateEnabledOmemo();
                this.updateEncryptedChatstates();
                this.updateEnabled();
                this.updateXTokens();
                this.$('.connection-wrap .buttons-wrap .btn-change-password').hideIf(this.model.get('auth_type') === 'x-token');
                this.$('.connection-wrap .buttons-wrap .btn-reconnect').hideIf(this.model.get('auth_type') === 'x-token');
                this.$('.main-resource .client').text(xabber.get('client_name'));
                this.$('.main-resource .resource').text(this.model.resource);
                this.$('.main-resource .priority').text(this.model.get('priority'));
                this.$(`.color-scheme input[type=radio][name=account_color][value="${this.model.settings.get('color')}"]`)
                    .prop('checked', true);
                if (options.block_name){
                    this.$('.settings-block-wrap').addClass('hidden');
                    this.$('.settings-block-wrap.'+options.block_name).removeClass('hidden');
                    this.$('.settings-panel-head span.settings-panel-head-title').text(this.$('.settings-block-wrap.'+options.block_name).attr('data-header'));
                    this.$('.btn-block').switchClass('hidden2', options.block_name != 'blocklist-info');
                }
                this.scrollToChild(this.$('.settings-block-wrap.'+options.block_name));
                this.$('.panel-content-wrap').removeClass('hidden');
                return this;
            },

            updateStatus: function () {
                let account = this.model,
                    status = account.get('status'),
                    status_message = account.getStatusMessage();
                this.$('.main-resource .status').attr('data-status', status);
                this.$('.main-resource .status-message').text(status_message);
            },

            updateView: function () {
                let connected = this.model.isConnected();
                // this.$('.xmpp-resources').showIf(connected);
                this.$('.server-info').showIf(connected);
                this.$('.blocklist').showIf(connected);
                this.$('.groups-info').showIf(connected);
                this.updateScrollBar();
            },

            updateSynchronizationBlock: function () {
                this.$('.xabber-account-features-wrap').showIf(xabber.api_account && xabber.api_account.get('connected'));
                this.updateSyncState();
                this.updateSyncOption();
                this.updateDelSettingsButton();
            },

            showResources: function (ev) {
                this.$(`.token-resource-wrap`).hideIf(true)
                let resource_id = $(ev.target).attr('data-resource-id');
                this.$(`.token-resource-wrap[data-resource-id="${resource_id}"]`).hideIf(false)
            },

            hideResources: function (ev) {
                if (!($(ev.target).hasClass('last-auth') && $(ev.target).hasClass('resource') || $(ev.target).closest(".token-resource-wrap").length > 0))
                    this.$(`.token-resource-wrap`).hideIf(true)
            },

            renderAllXTokens: function () {
                this.$('.panel-content-wrap .tokens .sessions-wrap').html("");
                $(_.sortBy(this.model.x_tokens_list), 'last_auth').each((idx, token) => {
                    let pretty_token = {
                        resource_obj: undefined,
                        client: token.client,
                        device: token.device,
                        token_uid: token.token_uid,
                        ip: token.ip,
                        last_auth: pretty_datetime(token.last_auth),
                        expire: pretty_datetime(token.expire)
                    };
                    let resource_obj = this.model.resources.findWhere({ token_uid: token.token_uid });
                    if (resource_obj)
                        pretty_token.resource_obj = resource_obj.toJSON();
                    if (this.model.get('x_token')) {
                        if (this.model.get('x_token').token_uid == token.token_uid) {
                            let $cur_token_html = $(templates.current_token_item(pretty_token));
                            this.$('.panel-content-wrap .tokens .current-session').append($cur_token_html);
                            return;
                        }
                    }
                    let $token_html = $(templates.token_item(pretty_token));
                    this.$('.panel-content-wrap .tokens .all-sessions').append($token_html);
                });
                if (this.$('.panel-content-wrap .tokens .all-sessions').children().length)
                    this.$('.panel-content-wrap .tokens .all-sessions-wrap').removeClass('hidden');
                else
                    this.$('.panel-content-wrap .tokens .all-sessions-wrap').addClass('hidden');
            },

            updateXTokens: function () {
                if (this.model.get('auth_type') !== 'x-token') {
                    this.$('.panel-content-wrap .tokens').addClass('hidden');
                    this.$('.panel-content-wrap .tokens .sessions-wrap').children().html("");
                    return;
                }
                this.$('.panel-content-wrap .tokens .sessions-wrap').html("");
                if (this.model.x_tokens_list && this.model.x_tokens_list.length) {
                    this.renderAllXTokens();
                }
            },

            revokeXToken: function (ev) {
                let $target = $(ev.target).closest('.token-wrap'),
                    token_uid = $target.data('token-uid');
                this.model.revokeXToken([token_uid], () => {
                    if (this.model.get('x_token'))
                        if (this.model.get('x_token').token_uid === token_uid) {
                            this.model.deleteAccount();
                            return;
                        }
                    this.model.getAllXTokens();
                });
            },

            revokeAllXTokens: function () {
                utils.dialogs.ask(xabber.getString("settings_account__dialog_terminate_sessions__header"), xabber.getString("terminate_all_sessions_title"), null, { ok_button_text: xabber.getString("button_terminate")}).done((result) => {
                    if (result && this.model.x_tokens_list)
                        this.model.revokeAllXTokens(() => {
                            this.model.getAllXTokens();
                        });
                });
            },

            updateSyncState: function () {
                let state;
                if (!this.model.settings.get('to_sync'))
                    state = 'off';
                else
                    state = this.model.settings.get('synced') ? 'yes' : 'no';
                this.$('.sync-status').text(xabber.getString(constants.SYNCED_STATUS_DATA[state].tip));
                let mdiclass = constants.SYNCED_STATUS_DATA[state].icon,
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
                let enabled = this.model.get('enabled');
                this.$('.enabled-state input[type=checkbox]').prop('checked', enabled);
            },

            updateEnabledOmemo: function () {
                let enabled = this.model.settings.get('omemo'), has_keys = false;
                if (this.model.omemo) {
                    has_keys = Object.keys(this.model.omemo.get('prekeys')).length;
                } else {
                    let omemo = new xabber.Omemo({id: 'omemo'}, {
                        account: this.model,
                        storage_name: xabber.getStorageName() + '-omemo-settings-' + this.model.get('jid'),
                        fetch: 'before'
                    });
                    has_keys = Object.keys(omemo.get('prekeys')).length;
                    omemo.destroy();
                }
                if (_.isUndefined(enabled))
                    enabled = false;
                if (enabled && this.model.omemo_enable_view)
                    this.model.omemo_enable_view.close();
                this.$('.setting-use-omemo input[type=checkbox]').prop('checked', enabled);
                this.$('.omemo-settings-wrap .setting-wrap:not(.omemo-enable)').switchClass('hidden', !enabled);
                this.$('.omemo-settings-wrap .setting-wrap.purge-keys').switchClass('hidden', !has_keys);
            },

            updateEncryptedChatstates: function () {
                let enabled = this.model.settings.get('encrypted_chatstates');
                this.$('.setting-send-chat-states input[type=checkbox]').prop('checked', enabled);
            },

            updateReconnectButton: function () {
                this.$('.btn-reconnect').switchClass('disabled', this.model.session.get('reconnecting'));
            },

            setEnabled: function (ev) {
                let enabled = this.$('.enabled-state input').prop('checked');
                this.model.save('enabled', enabled);
                enabled ? this.model.activate() : this.model.deactivate();
            },

            setEnabledOmemo: function () {
                let enabled = this.$('.setting-use-omemo input').prop('checked');
                this.model.settings.save('omemo', enabled);
                this.$('.omemo-settings-wrap .setting-wrap:not(.omemo-enable)').switchClass('hidden', !enabled);
                if (enabled)
                    this.initOmemo();
                else
                    this.destroyOmemo();
            },

            setTypingNotification: function () {
                let enabled = this.$('.setting-send-chat-states input').prop('checked');
                this.model.settings.save('encrypted_chatstates', enabled);
            },

            initOmemo: function () {
                this.model.omemo = new xabber.Omemo({id: 'omemo'}, {
                    account: this.model,
                    storage_name: xabber.getStorageName() + '-omemo-settings-' + this.model.get('jid'),
                    fetch: 'before'
                });
                setTimeout(() => {
                    this.model.omemo.onConnected();
                }, 1000);
            },

            destroyOmemo: function () {
                this.model.omemo.destroy();
                this.model.omemo = undefined;
            },

            openDevicesWindow: function () {
                if (this.model.omemo) {
                    !this.omemo_devices && (this.omemo_devices = new xabber.Fingerprints({model: this.model.omemo}));
                    this.omemo_devices.open();
                }
                else
                    utils.dialogs.error(xabber.getString("omemo__chat__placeholder_encryption_disabled"));
            },

            purgeKeys: function () {
                utils.dialogs.ask(xabber.getString('omemo__dialog_purge_keys__header'), xabber.getString('omemo__dialog_purge_keys__text'),
                    null, { ok_button_text: xabber.getString('omemo__dialog_purge_keys__button_purge_keys')}).done((result) => {
                    if (result) {
                        if (this.model.omemo) {
                            let device_id = this.model.omemo.get('device_id');
                            this.model.omemo.save('prekeys', {});
                            this.model.omemo.bundle && (this.model.omemo.bundle.preKeys = []);
                            if (this.model.omemo.own_devices[device_id]) {
                                this.model.omemo.own_devices[device_id].preKeys = [];
                                this.model.omemo.own_devices[device_id].set({ik: null, fingerprint: null});
                            }
                            this.model.connection.omemo && this.model.connection.omemo.removeItemFromNode(`${Strophe.NS.OMEMO}:bundles`, device_id);
                        } else {
                            let omemo = new xabber.Omemo({id: 'omemo'}, {
                                account: this.model,
                                storage_name: xabber.getStorageName() + '-omemo-settings-' + this.model.get('jid'),
                                fetch: 'before'
                            });
                            omemo.save('prekeys', {});
                            this.model.connection.omemo && this.model.connection.omemo.removeItemFromNode(`${Strophe.NS.OMEMO}:bundles`, omemo.get('device_id'));
                            omemo.destroy();
                        }
                        this.$('.omemo-settings-wrap .setting-wrap.purge-keys').switchClass('hidden', true);
                    }
                });
            },

            showConnectionStatus: function () {
                this.$('.conn-status').text(this.model.session.get('conn_feedback'));
            },

            showPasswordView: function () {
                this.model.password_view.show();
            },

            reconnect: function () {
                if (this.model.session.get('reconnecting'))
                    return;
                this.model.save('enabled', true);
                if (this.model.connection.connected)
                    this.model.connection.disconnect();
                else
                    this.model.connect();
            },

            changeSyncSetting: function (ev) {
                let to_sync = $(ev.target).prop('checked'),
                    settings = this.model.settings;
                settings.save('to_sync', to_sync);
                if (to_sync) {
                    settings.update_timestamp();
                    xabber.api_account && xabber.api_account.synchronize_main_settings();
                }
            },

            deleteSettings: function () {
                utils.dialogs.ask(xabber.getString("progress_title_delete_settings"), xabber.getString("delete_settings_summary"),
                    [{name: 'delete_account', checked: this.model.settings.get('to_sync'),
                        text: xabber.getString("delete_settings__optional_button__delete_synced_account")}],{ ok_button_text: xabber.getString("delete")}).done((res) => {
                    if (res) {
                        if (!res.delete_account) {
                            this.model.settings.save('to_sync', false);
                        } else if (!this.model.settings.get('to_sync')) {
                            this.model.deleteAccount(true);
                        }
                        xabber.api_account && xabber.api_account.delete_settings(this.model.get('jid'));
                    }
                });
            },

            changeColor: function (ev) {
                let value = ev.target.value;
                this.model.settings.update_settings({color: value});
            },

            openBlockWindow: function () {
                utils.dialogs.ask_enter_value(xabber.getString("dialog_block_xmpp_address__text"), null, {modal_class: 'account-add-blocked', input_placeholder_value: xabber.getString("dialog_block_xmpp_address__hint_address")}, { ok_button_text: xabber.getString("contact_bar_block")}).done((result) => {
                    if (result) {
                        let contact = this.model.contacts.get(result);
                        if (contact)
                            contact.block();
                        else {
                            this.model.contacts.blockContact(result);
                        }
                    }
                });
            },

            unblockSelected: function () {
                if (this.children && this.children.blocklist)
                    this.children.blocklist.unblockSelected();
            },

            deselectBlocked: function () {
                if (this.children && this.children.blocklist)
                    this.children.blocklist.deselectBlocked();
            },
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
                this.model.settings.on("change:omemo", this.updateEnabledOmemo, this);
                this.model.on("change:image", this.updateAvatar, this);
                this.model.settings.on("change:color", this.updateColorScheme, this);
                this.model.session.on("change:conn_feedback", this.showConnectionStatus, this);
                this.$el.on('drag_to', this.onDragTo.bind(this));
                this.$('.move-account-to-this')
                    .on('move_xmpp_account', this.onMoveAccount.bind(this));
                this.model.settings.on("change:to_sync", this.updateSyncState, this);
            },

            updateAvatar: function () {
                let image = this.model.cached_image;
                this.$('.circle-avatar').setAvatar(image, this.avatar_size);
            },

            updateColorScheme: function () {
                this.$el.attr('data-color', this.model.settings.get('color'));
            },

            showConnectionStatus: function () {
                this.$('.conn-status').text(this.model.session.get('conn_feedback'));
            },

            updateEnabled: function () {
                let enabled = this.model.get('enabled');
                this.$el.switchClass('disabled', !enabled);
                this.$('.enabled-state input[type=checkbox]').prop('checked', enabled);
            },

            setEnabled: function (ev) {
                let enabled = this.$('.enabled-state input').prop('checked');
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
                let connected = xabber.api_account && xabber.api_account.get('connected');
                this.$('.sync-marker-wrap').showIf(connected);
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
                xabber.api_account && xabber.api_account.on("change:connected", this.updateSyncState, this);
                this.$('.move-account-to-bottom')
                    .on('move_xmpp_account', this.onMoveAccountToBottom.bind(this));
            },

            updateList: function () {
                _.each(this.children, function (view) { view.detach(); });
                this.model.each((account) => {
                    let jid = account.get('jid'), view = this.child(jid);
                    if (!view) {
                        view = this.addChild(jid, xabber.AccountSettingsItemView, {model: account});
                    }
                    this.$('.no-accounts-tip').before(view.$el);
                });
                this.updateHtml();
                this.parent.updateScrollBar();
            },

            updateOneInList: function (account) {
                let jid = account.get('jid'),
                    view = this.child(jid);
                if (view)
                    view.$el.detach();
                else
                    view = this.addChild(jid, xabber.AccountSettingsItemView, {model: account});
                let index = this.model.indexOf(account);
                if (index === 0)
                    this.$('.accounts-head-wrap').after(view.$el);
                else
                    this.$('.xmpp-account').eq(index - 1).after(view.$el);
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
                this.parent.$('.settings-tab[data-block-name="xmpp-accounts"] .settings-block-name')
                    .text(this.model.length === 1 ? xabber.getString("account") : xabber.getString("settings__menu_item__xmpp_account") );
            },

            updateSyncState: function () {
                let connected = xabber.api_account && xabber.api_account.get('connected');
                this.$('.sync-head').showIf(connected);
                this.$('.sync-marker-wrap').showIf(connected);
                this.$('.sync-head').hideIf(!connected);
                this.$('.sync-marker-wrap').hideIf(!connected);
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
                let status = $(ev.target).closest('li').data('value');
                this.highlightStatus(status);
                this.do_change();
                this.closeModal();
            },

            restoreStatusMessageInput: function () {
                let status_message = this.account.get('status_message');
                this.$('.status-message').val(status_message)
                    .switchClass('filled', status_message);
                if (!status_message) {
                    this.$('.status-message').attr('placeholder', this.account.getStatusMessage());
                }
            },

            clearStatusMessageInput: function () {
                let verbose_status = xabber.getString(this.account.get('status'));
                this.$('.status-message').val('').attr('placeholder', verbose_status)
                    .removeClass('filled');
            },

            keyUp: function (ev) {
                if (ev.keyCode === constants.KEY_ENTER) {
                    this.do_change();
                    this.closeModal();
                } else {
                    let value = this.$('.status-message').val();
                    this.$('.status-message').switchClass('filled', value);
                }
            },

            do_change: function () {
                let status = this.$('.status-values li.active').data('value'),
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

            render: function () {
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
                let value = this.$('.status-message').val();
                if (!value)
                    this.do_change();
                this.closeModal();
            },

            closeModal: function () {
                this.$el.closeModal({ complete: this.hide.bind(this) });
            }
        });

        xabber.WebcamProfileImageView = xabber.BasicView.extend({
            className: 'modal main-modal webcam-panel',
            template: templates.webcam_panel,

            events: {
                "click .btn-save": "saveAvatar",
                "click .btn-cancel": "close",
            },

            open: function (options) {
                this.account = options.model;
                this.registration = options.registration;
                this.registration_view = options.registration_view;

                this.width = 171;
                this.height = 128;
                this.streaming = false;
                this.video = null;
                this.canvas = null;
                this.photo = null;
                this.startbutton = null;

                this.show();
                this.startupStream();
            },

            render: function () {
                this.$el.openModal({
                    complete: this.close.bind(this)
                });
            },

            onHide: function () {
                if (this.video && this.video.srcObject && this.video.srcObject.getTracks()){
                    let tracks = this.video.srcObject.getTracks()
                    tracks.forEach(function(track) {
                        track.stop();
                    });
                    this.video.srcObject = null
                }
                this.$el.detach();

            },

            close: function () {
                this.closeModal();
            },

            closeModal: function () {
                this.$el.closeModal({ complete: this.hide.bind(this) });
            },

            startupStream: function (ev) {
                this.video = this.$('.webcam-video')[0];
                this.canvas = this.$('#canvas')[0];
                this.photo = this.$('.webcam-photo')[0];
                this.startbutton = this.$('.btn-take-photo')[0];
                navigator.mediaDevices.getUserMedia({video: true, audio: false})
                    .then((stream) => {
                        this.video.srcObject = stream;
                        this.video.play();
                    })
                    .catch((err) => {
                        console.log("An error occurred: " + err);
                    });

                this.video.addEventListener('canplay', (ev) => {
                    if (!this.streaming) {
                        if (isNaN(this.height)) {
                            this.height = this.width / (4/3);
                        }
                        this.video.setAttribute('width', this.width);
                        this.video.setAttribute('height', this.height);
                        this.canvas.setAttribute('width', this.width);
                        this.canvas.setAttribute('height', this.height);
                        this.streaming = true;
                    }
                }, false);

                this.startbutton.addEventListener('click', (ev) =>{
                    this.takePicture();
                    ev.preventDefault();
                }, false);

                this.$('.circle-icon')[0].addEventListener('click', (ev) =>{
                    if ($(ev.target).closest('.circle-icon').hasClass('disabled'))
                        return;
                    this.clearPhoto();
                    ev.preventDefault();
                }, false);

                this.clearPhoto();

            },


            clearPhoto: function (ev) {
                let context = this.canvas.getContext('2d');
                context.fillStyle = "#AAA";
                context.fillRect(0, 0, this.canvas.width, this.canvas.height);

                let data = this.canvas.toDataURL('image/png');
                this.photo.setAttribute('src', data);
                this.$('.btn-take-photo').hideIf(false)
                this.$('.btn-save').hideIf(true)
                this.$('.output').hideIf(true)
            },


            takePicture: function (ev) {
                let context = this.canvas.getContext('2d');
                this.$('.btn-take-photo').hideIf(true)
                this.$('.btn-save').hideIf(false)
                this.$('.output').hideIf(false)
                if (this.width && this.height) {
                    this.canvas.width = this.width;
                    this.canvas.height = this.height;
                    context.drawImage(this.video, 0, 0, this.width, this.height);
                    context.globalCompositeOperation='destination-in';
                    context.beginPath();
                    context.arc(this.width/2,this.height/2,this.height/2,0,Math.PI*2);
                    context.closePath();
                    context.fill();

                    let data = this.canvas.toDataURL('image/png');
                    this.photo.setAttribute('src', data);
                } else {
                    this.clearPhoto();
                }
            },


            saveAvatar: function () {
                let blob = Images.getBlobImage(this.canvas.toDataURL('image/png').replace(/^data:image\/(png|gif|jpg|webp|jpeg);base64,/, '')),
                    file = new File([blob], "avatar", {
                        type: "image/png",
                    });
                file.base64 = this.canvas.toDataURL('image/png').replace(/^data:image\/(png|gif|jpg|webp|jpeg);base64,/, '');
                if (file && file.base64) {
                    if (this.registration && this.registration_view){
                        this.registration_view.avatar = file;
                        this.registration_view.$('.btn-next').prop('disabled', false);
                        this.registration_view.$('.circle-avatar').addClass('changed');
                        this.registration_view.$('.circle-avatar').setAvatar(this.canvas.toDataURL('image/png').replace(/^data:image\/(png|gif|jpg|webp|jpeg);base64,/, ''), this.member_details_avatar_size);
                        this.close();
                    } else {
                        this.$('.modal-preloader-wrap').html(env.templates.contacts.preloader());
                        this.$('.btn-save').addClass('hidden-disabled');
                        this.$('.circle-icon').addClass('disabled');
                        this.account.pubAvatar(file, () => {
                            this.close();
                        }, () => {
                            utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                        });
                    }
                }
            },
        });

        xabber.EmojiProfileImageView = xabber.BasicView.extend({
            className: 'modal main-modal emoji-panel',
            template: templates.emoji_panel,

            events: {
                "click .profile-image-background-color": "changeColor",
                "click .avatar-wrap": "openEmojiPicker",
                "click .close-modal": "close",
                "click .btn-save": "saveAvatar",
                "click .btn-cancel": "close",
            },

            open: function (options) {
                this.account = options.model;
                this.registration = options.registration;
                this.registration_view = options.registration_view;
                this.emoji_panel_view = this.addChild('emoji_picker_panel', xabber.EmojiPickerView,{})
                this.show();
            },

            render: function () {
                this.$el.openModal({
                    complete: this.close.bind(this)
                });
            },

            onHide: function () {
                this.$el.detach();
            },

            close: function () {
                this.closeModal();
            },

            closeModal: function () {
                this.$el.closeModal({ complete: this.hide.bind(this) });
            },

            openEmojiPicker: function () {
                this.emoji_panel_view.open(this);
            },

            changeColor: function (ev) {
                let color = $(ev.target).data('value');
                this.$('.profile-image-background-color').removeClass('chosen-background-color');
                $(ev.target).addClass('chosen-background-color');
                this.$('.circle-avatar').attr('class', 'circle-avatar');
                this.$('.circle-avatar').attr('data-value', color);
                this.$('.circle-avatar').addClass('ground-color-' + color + '-100');
            },

            saveAvatar: function (ev) {
                let blob = Images.getDefaultAvatar(this.$('.chosen-emoji').data('value') ,this.$('.circle-avatar').css( "background-color" ), "bold 96px sans-serif", 176, 176),
                    file = new File([blob], "avatar", {
                        type: "image/png",
                    });
                file.base64 = blob;
                if (file && file.base64) {
                    if (this.registration && this.registration_view){
                        this.registration_view.avatar = file;
                        this.registration_view.$('.btn-next').prop('disabled', false);
                        this.registration_view.$('.circle-avatar').addClass('changed');
                        this.registration_view.$('.circle-avatar').setAvatar(blob, this.member_details_avatar_size);
                        xabber._settings.save('main_color', this.$('.circle-avatar').attr('data-value'));
                        xabber.trigger('update_main_color');
                        this.close();
                    } else {
                        this.$('.modal-preloader-wrap').html(env.templates.contacts.preloader());
                        this.$('.btn-save').addClass('hidden-disabled');
                        this.account.pubAvatar(file, () => {
                            this.close();
                        }, () => {
                            utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                        });
                    }
                }
            },
        });

        xabber.EmojiPickerView = xabber.BasicView.extend({
            className: 'modal main-modal emoji-panel emoji-picker',
            template: templates.emoji_picker,

            events: {
                "click .emojis-bottom-tab-selector": "pickEmojiTab",
                "click .emoji-picker-emoji": "pickEmoji",
                "click .close-modal": "close",
            },

            open: function () {
                this.$el.openModal({
                    complete: this.close.bind(this)
                });
                this.readEmojisJSON()
                this.show();
            },

            readEmojisJSON: function () {
                this.emojis = JSON.parse(templates.emojis())

                if (this.emojis.length) {
                    this.$('.emoji-picker-wrap').html(templates.emoji_picker_tabs({
                        emojis: this.emojis
                    }));
                    this.ps_container = this.$('.emojis-tab');
                    if (this.ps_container.length) {
                        this.ps_container.perfectScrollbar(
                            _.extend(this.ps_settings || {}, xabber.ps_settings)
                        );
                    }
                }
            },

            render: function () {
            },

            onHide: function () {
                this.$el.detach();
            },

            close: function () {
                this.closeModal();
            },

            closeModal: function () {
                this.$el.closeModal({ complete: this.hide.bind(this) });
            },

            scrollTo: function (offset) {
                this.ps_container.each((index) => {
                    this.ps_container[index].scrollTop = offset;
                });
                this.ps_container.perfectScrollbar('update');
            },

            scrollToTop: function () {
                this.scrollTo(0);
            },

            pickEmojiTab: function (ev) {
                let tab = $(ev.target).data('value');
                this.$('.emojis-bottom-tab-selector').removeClass('chosen-emoji-selector');
                $(ev.target).addClass('chosen-emoji-selector');
                this.$('.emojis-tab').removeClass('chosen-emoji-tab').addClass('hidden');
                this.$(`.emojis-tab[data-value="${tab}"]`).removeClass('hidden').addClass('chosen-emoji-tab');
                this.scrollToTop();
            },

            pickEmoji: function (ev) {
                let emoji = $(ev.target).closest('.emoji-picker-emoji').data('value');
                this.parent.$('.chosen-emoji').attr('data-value', emoji).text(emoji);
                this.close();
            },
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
                xabber.on("quit", this.onQuit, this);
                return this;
            },

            render: function (options) {
                options || (options = {});
                this.is_login = options.login;
                this.token_invalidated = options.token_invalidated;
                this.$('.modal-header span').text(this.is_login ? xabber.getString("xabber_account__social_links__button_log_in") : xabber.getString("button_set_pass"));
                this.$('.btn-cancel').text(this.is_login ? xabber.getString("skip") : xabber.getString("cancel"));
                this.$('.btn-change').text(this.is_login ? xabber.getString("xabber_account__social_links__button_log_in") : xabber.getString("set"));
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
                return this.is_login ? xabber.getString("login") : xabber.getString("set")
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
                let jid = this.model.get('jid'),
                    password = this.$password_input.val();
                if (!password)
                    return this.errorFeedback({password: xabber.getString("dialog_change_password__error__text_input_pass")});
                password = password.trim();
                this.authFeedback({password: xabber.getString("dialog_change_password__feedback__text_auth_with_pass")});
                if (this.model.connection.connected) {
                    this.model.once('deactivate', () => {
                        this.setPassword(password);
                    });
                    this.model.deactivate();
                } else {
                    this.setPassword(password);
                }
            },

            setPassword: function (password) {
                this.model.last_msg_timestamp = 0;
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
                let authentication = this.data.get('authentication');
                this.$('.btn-change').text(authentication ? xabber.getString("stop") : this.getActionName());
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

            endAuth: function (account) {
                this.model.save('is_new', undefined);
                this.successFeedback(this.model)
                this.model.auth_view = null;
            },

            onHide: function () {
                this.$el.detach();
            },

            onQuit: function () {
                this.closeModal();
            },

            close: function () {
                if (this.is_login)
                    this.model.save('enabled', false);
                if (this.token_invalidated)
                    this.model.deleteAccount();
                this.cancel();
                this.closeModal();
            },

            closeModal: function () {
                this.model.auth_view = null;
                this.$el.closeModal({ complete: this.hide.bind(this) });
            }
        });

        xabber.ChangeAccountPasswordView = xabber.BasicView.extend({
            events: {
                "click .btn-change": "submit",
                "click .btn-cancel": "render",
                "keyup input": "keyUp",
            },

            _initialize: function () {
                this.account = this.model
                this.$old_password_input = this.$('input[name=old_password]');
                this.$password_input = this.$('input[name=password]');
                this.$password_confirm_input = this.$('input[name=password_confirm]');
                return this;
            },

            render: function (options) {
                this.authFeedback({});
                this.$password_input.val('');
                this.$password_confirm_input.val('');
                this.$old_password_input.val('').focus();
            },

            keyUp: function (ev) {
                ev.keyCode === constants.KEY_ENTER && this.submit();
            },

            submit: function () {
                this.authFeedback({});
                let jid = this.account.get('jid'),
                    old_password = this.$old_password_input.val(),
                    password = this.$password_input.val(),
                    password_confirm = this.$password_confirm_input.val();
                if (!old_password)
                    return this.errorFeedback({old_password: xabber.getString("dialog_change_password__error__text_input_pass")});
                if (!password)
                    return this.errorFeedback({password: xabber.getString("dialog_change_password__error__text_input_pass")});
                if (password != password_confirm)
                    return this.errorFeedback({password_confirm: xabber.getString("settings_account__alert_passwords_do_not_match")});
                old_password = old_password.trim();
                this.authFeedback({password_confirm: xabber.getString("dialog_change_password__feedback__text_auth_with_pass")});
                if (!this.account.change_password_connection_manager) {
                    this.account.change_password_connection_manager = new Strophe.ConnectionManager(this.account.CONNECTION_URL);
                    this.account.change_password_connection = this.account.change_password_connection_manager.connection;
                    this.account.change_password_connection.account = this.account;
                    this.account.change_password_connection.register.connect_change_password(jid, old_password, this.account.changePasswordCallback.bind(this.account))
                }
            },

            authFeedback: function (options) {
                this.$password_input.switchClass('invalid', options.password)
                    .siblings('span.errors').text(options.password || '');
                this.$old_password_input.switchClass('invalid', options.old_password)
                    .siblings('span.errors').text(options.old_password || '');
                this.$password_confirm_input.switchClass('invalid', options.password_confirm)
                    .siblings('span.errors').text(options.password_confirm || '');
            },

            errorFeedback: function (options) {
                if (this.account.change_password_connection)
                    this.account.change_password_connection.disconnect()
                this.authFeedback(options);
            },

            successFeedback: function () {
                if (this.account.change_password_connection)
                    this.account.change_password_connection.disconnect()
                this.render();
            },
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
                let jid = this.$jid_input.val(),
                    password = this.$password_input.val();
                if (this.data.get('registration')){
                    let domain = this.$('#new_account_domain').val() || this.$('.xmpp-server-dropdown-wrap .select-xmpp-server .property-value').text();
                    if (!constants.REGISTRATION_CUSTOM_DOMAIN && !(constants.REGISTRATION_DOMAINS.indexOf(domain) > -1))
                        return this.errorRegistrationFeedback({domain: xabber.getString("account_auth__error__registration_custom_domain")});
                    jid = jid + '@' + domain
                }
                else if(
                    (this.$('.input-field-jid .xmpp-server-dropdown-wrap').length && !this.$('.input-field-jid .xmpp-server-dropdown-wrap').hasClass('hidden')) &&
                    (this.$('#sign_in_domain') && this.$('#sign_in_domain').val() || this.$('.xmpp-server-dropdown-wrap .select-auth-xmpp-server .property-value').text())
                ){
                    let domain = this.$('#sign_in_domain').val() || this.$('.xmpp-server-dropdown-wrap .select-auth-xmpp-server .property-value').text();
                    jid = jid + '@' + domain
                }
                if (!jid) {
                    if (this.data.get('registration')) {
                        return this.errorRegistrationFeedback({jid: xabber.getString("account_auth__error__text_input_username")});
                    }
                    return this.errorFeedback({jid: xabber.getString("account_auth__error__text_input_username")});
                }
                jid = jid.trim();
                if (!password)  {
                    if (this.data.get('registration')) {
                        return this.errorRegistrationFeedback({password: xabber.getString("dialog_change_password__error__text_input_pass")});
                    }
                    return this.errorFeedback({password: xabber.getString("dialog_change_password__error__text_input_pass")});
                }
                if (!this.data.get('registration') && !constants.LOGIN_CUSTOM_DOMAIN && !(constants.LOGIN_DOMAINS.indexOf(Strophe.getDomainFromJid(jid)) > -1))
                    return this.errorFeedback({jid: xabber.getString("account_auth__error__login_custom_domain")});
                password = password.trim();
                let at_idx = jid.indexOf('@');
                if (at_idx <= 0 || at_idx === jid.length - 1) {
                    if (this.data.get('registration')) {
                        return this.errorRegistrationFeedback({jid: xabber.getString("account_auth__error__text_wrong_username")});
                    }
                    return this.errorFeedback({jid: xabber.getString("account_auth__error__text_wrong_username")});
                }
                jid = Strophe.getBareJidFromJid(jid).toLowerCase();
                let account = xabber.accounts.get(jid);
                if (account) {
                    if (this.data.get('registration')) {
                        return this.errorRegistrationFeedback({jid: xabber.getString("settings_account__alert_account_exists")});
                    }
                    this.errorFeedback({jid: xabber.getString("settings_account__alert_account_exists")});
                } else {
                    if (this.data.get('registration'))
                        this.registerFeedback({registration_success: true, password: xabber.getString("account_registration__feedback__text_registration")});
                    else
                        this.authStepperShow();
                    this.getWebsocketURL(jid, (response) => {
                        this.account = xabber.accounts.create({
                            jid: jid,
                            websocket_connection_url: response || constants.CONNECTION_URL,
                            password: utils.utoa(password),
                            is_new: true
                        }, {auth_view: this});

                        if (this.data.get('registration')) {
                            this.account.connection.register.connect(jid, this.account.registerCallback.bind(this.account))
                        }
                        else
                            this.account.trigger('start');
                    });
                }
            },

            getWebsocketURL: function (jid, callback) {
                if (!constants.DISABLE_LOOKUP_WS) {
                    let domain = Strophe.getDomainFromJid(jid),
                        request = {
                            type: 'GET',
                            url: window.location.protocol + '//' + domain + '/.well-known/host-meta',
                            dataType: 'xml',
                            success: (success) => {
                                let socket_url = $(success).find('Link').attr('href');
                                if (socket_url)
                                    callback && callback(socket_url);
                                else
                                    callback && callback(null);
                            },
                            error: () => {
                                callback && callback(null);
                            },
                            timeout: 5000
                        };
                    $.ajax(request);
                }
                else
                    callback && callback(null);
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

            authStepperShow: function (){
                this.authFeedback({password: xabber.getString("account_auth__feedback__text_authentication")});
            },

            endAuth: function (account) {
                this.account.save('is_new', undefined);
                this.successFeedback(this.account)
                this.account.auth_view = null;
            },

            socialAuth: function (ev) {
                let origin = window.location.href,
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
                "click .btn-log-in": "login",
                "click .btn-sign-up-instead": "logoutAndRegister",
                "click .btn-register-form": "openRegisterForm",
                "click .btn-login-form": "openLoginForm",
                "click .btn-register": "register",
                "click .btn-cancel": "cancel",
                "click .btn-go-back-menu": "openButtonsMenu",
                "click .btn-go-back": "openPreviousStep",
                "click .btn-next": "openNextStep",
                "click .btn-skip": "registerWithoutAvatar",
                "click .btn-finish-log-in": "endAuth",
                "keyup input[name=register_nickname]": "keyUpNickname",
                "keyup input[name=register_jid]": "keyUpJid",
                "keyup input[name=jid]": "keyUpLogin",
                "keyup input[name=password]": "keyUpLogin",
                "keyup input[name=sign_in_domain]": "keyUpLogin",
                "keyup input[name=register_domain]": "keyUpDomain",
                "focusout input[name=register_domain]": "focusoutDomain",
                "keyup input[name=register_password]": "keyUpPassword",
                "change .circle-avatar input": "changeAvatar",
                "click .btn-choose-image": "chooseAvatar",
                "click .btn-emoji-panel": "openEmojiPanel",
                "click .btn-selfie": "openWebcamPanel",
                "click #select-xmpp-server .property-variant": "changePropertyValueRegistration",
                "click #select-auth-xmpp-server .property-variant": "changePropertyValueAuth",
            },

            __initialize: function () {
                this.$nickname_input = this.$('input[name=register_nickname]');
                this.$domain_input = this.$('input[name=register_domain]');
                this.data.on("change:step", this.handleRegistrationStep, this);
                return this;
            },

            onRender: function () {
                this.data.set('step', 1)
                this.account = null;
                this.stepped_auth = true;
                this.stepped_auth_complete = false;
                this.authFeedback({});
                this.registerFeedback({});
                Materialize.updateTextFields();
                this.$('.btn-go-back').hideIf(false);
                this.$('.btn-skip').hideIf(true)
                this.$nickname_input.val('');
                this.$jid_input.val('');
                this.$password_input.val('');
                this.$('.circle-avatar').css({'background-image': ''});
                this.$('.circle-avatar').css({'background-color': ''});
                this.updateButtons();
                this.updateDomains();
                this.updateAuthDomains();
                let dropdown_settings = {
                    inDuration: 100,
                    outDuration: 100,
                    constrainWidth: false,
                    hover: false,
                    alignment: 'left'
                };
                this.$('.property-field .select-xmpp-server .caret').dropdown(dropdown_settings);
                this.$('.property-field .select-xmpp-server .xmpp-server-item-wrap').dropdown(dropdown_settings);
                this.$('.property-field .select-auth-xmpp-server .caret').dropdown(dropdown_settings);
                this.$('.property-field .select-auth-xmpp-server .xmpp-server-item-wrap').dropdown(dropdown_settings);
                this.$('.avatar-wrap.dropdown-button').dropdown(dropdown_settings);
                this.$('.btn-register-form').hideIf(!constants.REGISTRATION_BUTTON);
                this.$('.btn-login-form').hideIf(!constants.LOGIN_CUSTOM_DOMAIN && !constants.LOGIN_DOMAINS.length);
                this.$('.register-form-jid .dropdown-content .set-custom-domain').hideIf(!constants.REGISTRATION_CUSTOM_DOMAIN);
                this.$('.login-form-jid .dropdown-content .set-custom-domain').hideIf(!constants.LOGIN_CUSTOM_DOMAIN);
                this.updateOptions && this.updateOptions();
                this.$('#select-xmpp-server').hideIf(xabber.url_params.rkey)
                this.$('.select-xmpp-server .caret').hideIf(xabber.url_params.rkey)
                if (xabber.url_params.anchor == 'signup' || xabber.url_params.rkey)
                    this.data.set('step', 2)
                else if (xabber.url_params.anchor == 'signin')
                    this.data.set('step', 0)
            },

            openButtonsMenu: function () {
                this.data.set('step', 1)
            },

            register: function () {
                if (this.data.get('registration')) {
                    this.cancel();
                    return;
                }
                this.data.set('registration', true);
                this.$jid_input.prop('disabled', true);
                this.$password_input.prop('disabled', true);
                this.submit();
            },

            login: function () {
                this.submit();
            },

            keyUpNickname: function (ev) {
                if(this.$nickname_input.val()){
                    this.$('.btn-next').prop('disabled', false);
                }
                else {
                    this.$('.btn-next').prop('disabled', true);
                }
                if (this.$nickname_input.val() && ev)
                    ev.keyCode === constants.KEY_ENTER && this.openNextStep();
            },

            keyUpJid: function (ev) {
                clearTimeout(this._check_user_timeout);
                if (!this.$('.btn-next').prop('disabled') && ev && ev.keyCode === constants.KEY_ENTER) {
                    this.openNextStep();
                    return;
                }
                if (this.$jid_input.val() && this.$jid_input.val().includes('@') && constants.REGISTRATION_CUSTOM_DOMAIN){
                    this.setCustomDomainRegistration(this.$('.register-form-jid .property-field.xmpp-server-dropdown-wrap .property-value'))
                    this.$domain_input.val(this.$jid_input.val().split('@')[1]);
                    this.$jid_input.val(this.$jid_input.val().split('@')[0]);
                    this.$domain_input.focus();
                    return;
                }
                this.$('.btn-next').prop('disabled', true);
                if(this.$jid_input.val()){
                    let regexp_local_part = /^(([^<>()[\]\\.,;:\s%@\"]+(\.[^<>()[\]\\.,;:\s%@\"]+)*)|(\".+\"))$/,
                        regexp_domain = /^((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
                        domain = this.$domain_input.val() || this.$('.register-form-jid .xmpp-server-dropdown-wrap .property-value').text();
                    if (!regexp_local_part.test(this.$jid_input.val()))
                        return this.registerFeedback({jid: xabber.getString("account_add__alert_localpart_invalid")});
                    else if (!(regexp_domain.test(domain)))
                        return this.registerFeedback({domain: xabber.getString("account_add__alert_invalid_domain")});
                    else
                        this.registerFeedback({});
                    if (!constants.REGISTRATION_CUSTOM_DOMAIN && !(constants.REGISTRATION_DOMAINS.indexOf(domain) > -1))
                        return this.registerFeedback({domain: xabber.getString("account_auth__error__registration_custom_domain")});
                    this._check_user_timeout = setTimeout(() => {
                        domain = this.$domain_input.val() || this.$('.register-form-jid .xmpp-server-dropdown-wrap .property-value').text();
                        this.$('.btn-next').prop('disabled', true);
                        this._registration_username = this.$jid_input.val()
                        this._registration_domain = domain
                        if (domain) {
                            if (this.auth_connection && this.auth_connection.domain != domain)
                                this.auth_connection.disconnect()
                            if (!this.auth_connection) {
                                this.getWebsocketURL(domain, (response) => {
                                    this.CONNECTION_URL = response || constants.CONNECTION_URL;
                                    this.auth_conn_manager = new Strophe.ConnectionManager(this.CONNECTION_URL);
                                    this.auth_connection = this.auth_conn_manager.connection;
                                    this.auth_connection.register.connect_check_user(domain, this.checkUserCallback.bind(this))
                                });
                            }
                            else if(this.auth_connection && this.auth_connection.connected) {
                                this.auth_connection.register._connection._addSysHandler(this.handleRegisterStanza.bind(this.auth_connection.register),
                                    null, "iq", null, null);
                                this.auth_connection.register._connection.send($iq({type: "get", id: uuid(), to: this.auth_connection.register.domain }).c("query",
                                    {xmlns: Strophe.NS.REGISTER}).c("username").t(this._registration_username.trim()).tree());
                            }
                        }
                        else {
                            this.registerFeedback({jid: xabber.getString("account_add__alert_invalid_domain")});
                        }
                    }, 1000);
                }
                else
                    this.registerFeedback({});
            },

            keyUpPassword: function (ev) {
                if(this.$password_input.val()){
                    this.$('.btn-next').prop('disabled', false);
                }
                else {
                    this.$('.btn-next').prop('disabled', true);
                }
                if (this.$password_input.val() && ev)
                    ev.keyCode === constants.KEY_ENTER && this.openNextStep();
            },

            keyUpDomain: function () {
            },

            keyUpLogin: function (ev) {
                if(this.$jid_input.val() && this.$password_input.val()){
                    this.$('.btn-log-in').prop('disabled', false);
                }
                else {
                    this.$('.btn-log-in').prop('disabled', true);
                }
                this.$('.login-step-wrap').hideIf(true);
                this.authFeedback({});
                this.$('.input-field-jid .xmpp-server-dropdown-wrap').hideIf(this.$jid_input.val() && this.$jid_input.val().includes('@') && constants.LOGIN_CUSTOM_DOMAIN)
                if (this.$jid_input.val() && this.$jid_input.val().includes('@') && constants.LOGIN_CUSTOM_DOMAIN){
                    this.$('.input-field-jid').addClass('input-field-jid-borders')
                }else {
                    this.$('.input-field-jid').removeClass('input-field-jid-borders')
                }
                if (ev && this.$jid_input.val() && this.$password_input.val())
                    ev.keyCode === constants.KEY_ENTER && this.login();
            },

            focusoutDomain: function () {
                if(this.$jid_input.val() && (this.$domain_input.val() || this.$('.register-form-jid .xmpp-server-dropdown-wrap .property-value').text()))
                    this.keyUpJid();
            },

            handleRegisterStanza: function (stanza) {
                let i, query, field, username_taken, conn = this._connection;
                query = stanza.getElementsByTagName("query");
                if (query.length !== 1) {
                    conn._changeConnectStatus(Strophe.Status.REGIFAIL, "unknown");
                    return false;
                }
                query = query[0];
                for (i = 0; i < query.childNodes.length; i++) {
                    field = query.childNodes[i];
                    if (field.tagName.toLowerCase() === 'instructions') {
                        conn.register.instructions = Strophe.getText(field);
                        continue;
                    } else if (field.tagName.toLowerCase() === 'username') {
                        if (Strophe.getText(field))
                            this._supports_check_user = true
                        continue;
                    } else if (field.tagName.toLowerCase() === 'registered') {
                        username_taken = true
                        continue;
                    } else if (field.tagName.toLowerCase() === 'x') {
                        continue;
                    }
                    conn.register.fields[field.tagName.toLowerCase()] = Strophe.getText(field);
                }
                if (this._supports_check_user){
                    if (username_taken)
                        conn._changeConnectStatus(Strophe.Status.CONFLICT, null);
                    else
                        conn._changeConnectStatus(Strophe.Status.REGISTERED, null);
                }
                else
                    conn._changeConnectStatus(Strophe.Status.REGIFAIL, "not-supported");

                return false;
            },

            checkUserCallback: function (status, condition) {
                if (status === Strophe.Status.REGISTER || status === Strophe.Status.REGIFAIL) {
                    if (!this.$('.select-xmpp-server .property-variant[data-value="' + this.auth_connection.register.domain + '"]').length && constants.REGISTRATION_CUSTOM_DOMAIN) {
                        $('<div/>', {class: 'field-jid property-variant set-default-domain'})
                            .text(this.auth_connection.register.domain)
                            .attr('data-value', this.auth_connection.register.domain)
                            .insertBefore(this.$('.register-form-jid .dropdown-content .set-custom-domain'));
                    }
                    this.$('.select-xmpp-server .input-group-chat-domain').addClass('hidden');
                    this.$('#new_account_domain').val("");
                    this.$('.select-xmpp-server .xmpp-server-item-wrap .property-value').text(this.auth_connection.register.domain)
                        .removeClass('hidden').attr('data-value', this.auth_connection.register.domain);
                }
                if (status === Strophe.Status.REGISTER) {
                    if (this.auth_connection && this.auth_connection.connected) {
                        this.auth_connection.register._connection._addSysHandler(this.handleRegisterStanza.bind(this.auth_connection.register),
                            null, "iq", null, null);
                        this.auth_connection.register._connection.send($iq({type: "get", id: uuid(), to: this.auth_connection.register.domain }).c("query",
                            {xmlns: Strophe.NS.REGISTER}).c("username").t(this._registration_username.trim()).tree());
                    }
                } else if (status === Strophe.Status.REGISTERED) {
                    this.registerFeedback({user_success: true, jid: xabber.getString("xmpp_login__registration_jid_available")});
                    this.$('.btn-next').prop('disabled', false);
                } else if (status === Strophe.Status.CONFLICT) {
                    this.registerFeedback({jid: xabber.getString("xmpp_login__registration_jid_occupied")});
                    this.$('.btn-next').prop('disabled', true);
                } else if (status === Strophe.Status.CONNFAIL) {
                    this.registerFeedback({jid: xabber.getString("CONNECTION_FAILED") + ': ' + condition});
                    this.$('.btn-next').prop('disabled', true);
                } else if (status === Strophe.Status.REGIFAIL) {
                    if (condition === 'not-supported'){
                        this.registerFeedback({});
                        this.$('.btn-next').prop('disabled', false);
                    }
                    else {
                        this.registerFeedback({jid: xabber.getString("xmpp_login__registration_jid_not_supported")});
                        this.$('.btn-next').prop('disabled', true);
                    }
                    this.auth_connection.disconnect()
                } else if (status === Strophe.Status.CONNECTING) {
                    clearTimeout(this._check_user_connection_timeout);
                        this._check_user_connection_timeout = setTimeout(() => {
                            if(this.auth_connection && !this.auth_connection.connected){
                                this.auth_connection._no_response = true
                                this.auth_connection.disconnect()
                            }
                        }, 10000);
                } else if (status === Strophe.Status.DISCONNECTED) {
                    if (this.auth_connection && this.auth_connection._no_response) {
                        this.registerFeedback({jid: xabber.getString("account_add__alert_invalid_domain")});
                        this.$('.btn-next').prop('disabled', true);
                    }
                    this.auth_conn_manager = undefined;
                    this.auth_connection = undefined;
                }
            },

            openPreviousStep: function () {
                let step = this.data.get('step')
                if(typeof step === 'number') {
                    step--;
                    this.data.set('step', step)
                }
            },

            openNextStep: function () {
                let step = this.data.get('step')
                if(typeof step === 'number') {
                    step++;
                    this.data.set('step', step)
                }
            },

            handleRegistrationStep: function () {
                let step = this.data.get('step')
                if (step === -1){
                    this.$(`.server-feature .preloader-wrapper`).addClass('active').addClass('visible');
                    this.$(`.server-feature .mdi`).hideIf(true);
                    this.$(`.server-feature`).removeClass('active-feature')
                    this.$(`.server-feature .mdi`).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle')
                    this.$('.login-form-header').text(xabber.getString("signin_server_features"));
                    this.$('.login-form-server-features .register-form-step-header').text(xabber.getString("signin_checking_features_message", [this.account.domain]));
                    this.$('.btn-go-back-menu').hideIf(true);
                    this.$('.login-form-jid').hideIf(true);
                    this.$('.login-form-server-features').hideIf(false);
                    this.$('.btn-log-in').hideIf(true);
                    this.checkFeaturesStepper();
                }
                if (step === 0){
                    this.$jid_input = this.$('input[name=jid]');
                    this.$password_input = this.$('input[name=password]');
                    this.$domain_input = this.$('input[name=sign_in_domain]');
                    this.$domain_input.val('')
                    this.$jid_input.val('')
                    this.$password_input.val('')
                    this.keyUpLogin();
                    this.$('.login-step-wrap').hideIf(true);
                    this.authFeedback({});
                    this.resetAuthStepper();
                    this.$('.login-panel-form.xmpp-login-form .buttons-wrap').removeClass('server-features-additional-button')
                    this.$('.login-form-header').text(xabber.getString("title_login_xabber_account"));
                    this.$('.btn-go-back-menu').hideIf(false);
                    this.$('.login-panel-intro').hideIf(true);
                    this.$('.register-form').hideIf(true);
                    this.$('.xmpp-login-form').hideIf(false);
                    this.$('.login-form-jid').hideIf(false);
                    this.$('.login-form-server-features').hideIf(true);
                    this.$('.btn-log-in').hideIf(false);
                    this.$('.btn-finish-log-in').hideIf(true);
                    this.$('.btn-sign-up-instead').hideIf(true);
                    this.$jid_input.focus();
                }
                else if (step === 1){
                    this.$('.login-panel-intro').hideIf(false);
                    this.$('.register-form').hideIf(true);
                    this.$('.xmpp-login-form').hideIf(true);
                }
                else if (step === 2){
                    this.$jid_input = this.$('input[name=register_jid]');
                    this.$password_input = this.$('input[name=register_password]');
                    this.$domain_input = this.$('input[name=register_domain]');
                    this.keyUpNickname();
                    this.$('.login-form-header').text(xabber.getString("title_register_xabber_account"));
                    this.$('.login-form-url').hideIf(false);
                    this.$('.login-panel-intro').hideIf(true);
                    this.$('.register-form').hideIf(false);
                    this.$('.xmpp-login-form').hideIf(true);
                    this.$('.register-form-nickname').hideIf(false);
                    this.$('.register-form-jid').hideIf(true);
                    this.$('.register-form-password').hideIf(true);
                    this.$('.register-form-picture').hideIf(true);
                    this.$nickname_input.focus();
                }
                else if (step === 3){
                    if (this.$nickname_input.val()) {
                        this.$('.login-form-header').text(xabber.getString("hint_username"));
                        this.$('.register-form-nickname').hideIf(true);
                        this.$('.register-form-jid').hideIf(false);
                        this.$('.register-form-password').hideIf(true);
                        this.$('.register-form-picture').hideIf(true);
                        this.keyUpJid();
                        this.$jid_input.focus();
                        this.$password_input.val('');
                    }
                    else {
                        this.registerFeedback({nickname: xabber.getString("dialog_add_circle__error__text_input_name")});
                        return this.data.set('step', 2);
                    }

                }
                else if (step === 4){
                    if (this.$jid_input.val()) {
                        this.$('.login-form-header').text(xabber.getString("hint_pass"));
                        this.$('.register-form-nickname').hideIf(true);
                        this.$('.register-form-jid').hideIf(true);
                        this.$('.register-form-password').hideIf(false);
                        this.$('.register-form-picture').hideIf(true);
                        this.keyUpPassword();
                        this.$password_input.focus();
                    }
                    else {
                        this.registerFeedback({jid: xabber.getString("account_auth__error__text_input_username")});
                        return this.data.set('step', 3);
                    }

                }
                else if (step === 5){
                    if (this.$password_input.val()) {
                        this.register();
                    }
                    else {
                        this.registerFeedback({password: xabber.getString("dialog_change_password__error__text_input_pass")});
                        return this.data.set('step', 4);
                    }
                }
                else if (step === 6){
                    this.$('.login-form-header').text(xabber.getString("xmpp_login__registration_header_avatar"));
                    this.$('.login-form-url').hideIf(true);
                    this.$('.btn-go-back').hideIf(true);
                    this.$('.btn-skip').hideIf(false)
                    this.$('.register-form-nickname').hideIf(true);
                    this.$('.register-form-jid').hideIf(true);
                    this.$('.register-form-password').hideIf(true);
                    this.$('.register-form-picture').hideIf(false);
                    this.$('.btn-next').prop('disabled', true);
                }
                else if (step >= 7){
                    if(this.avatar)
                        this.account.pubAvatar(this.avatar, () => {
                        }, () => {
                            utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                        });
                    this.successRegistrationFeedback();
                }
            },

            registerWithoutAvatar: function () {
                this.successRegistrationFeedback();
            },

            logoutAndRegister: function () {
                this.account.session.set('delete', true);
                this.account.deactivate();
                this.openRegisterForm()
            },

            openRegisterForm: function () {
                this.data.set('step', 2)
            },

            openLoginForm: function () {
                this.data.set('step', 0)
            },

            updateButtons: function () {
                let authentication = this.data.get('authentication');
                this.$('.btn-log-in').prop('disabled', authentication);
            },

            updateDomains: function () {
                let all_servers = constants.REGISTRATION_DOMAINS;
                if (xabber.url_params.rkey && all_servers.length){
                    for (let i = all_servers.length - 1; i >= 0; i--) {
                        if (!sha1(all_servers[i]).substr(0, 10).includes(xabber.url_params.rkey.substr(0, 10))){
                            all_servers.splice(i, 1)
                        }
                    }
                }
                this.$('.register-form-jid .field-jid.property-variant').remove()
                if (all_servers.length)
                    this.$('.register-form-jid .xmpp-server-dropdown-wrap .field-jid').text(all_servers[0]);
                else
                    this.setCustomDomainRegistration(this.$('.register-form-jid .property-field.xmpp-server-dropdown-wrap .property-value'));
                this.$('.register-form-jid .modal-content .jid-field .set-default-domain').remove();

                for (let i = 0; i < all_servers.length; i++) {
                    $('<div/>', {class: 'field-jid property-variant set-default-domain'})
                        .text(all_servers[i])
                        .attr('data-value', all_servers[i])
                        .insertBefore(this.$('.register-form-jid .dropdown-content .set-custom-domain'));
                }
            },

            updateAuthDomains: function () {
                let all_servers = constants.LOGIN_DOMAINS;

                this.$('.login-form-jid .field-jid.property-variant').remove()
                if (all_servers.length)
                    this.$('.login-form-jid .xmpp-server-dropdown-wrap .field-jid').text(all_servers[0]);
                else
                    this.setCustomDomainAuth(this.$('.login-form-jid .property-field.xmpp-server-dropdown-wrap .property-value'));
                this.$('.login-form-jid .modal-content .jid-field .set-default-domain').remove();

                for (let i = 0; i < all_servers.length; i++) {
                    $('<div/>', {class: 'field-jid property-variant set-default-domain'})
                        .text(all_servers[i])
                        .attr('data-value', all_servers[i])
                        .insertBefore(this.$('.login-form-jid .dropdown-content .set-custom-domain'));
                }
            },

            setCustomDomainRegistration: function ($property_value) {
                this.$('#new_account_domain').val("");
                $property_value.addClass('hidden').text("");
                this.$('.select-xmpp-server .caret').addClass('hidden');
                this.$('.select-xmpp-server .input-group-chat-domain').removeClass('hidden');
            },

            setCustomDomainAuth: function ($property_value) {
                this.$('#sign_in_domain').val("");
                $property_value.addClass('hidden').text("");
                this.$('.select-auth-xmpp-server .caret').addClass('hidden');
                this.$('.select-auth-xmpp-server .input-group-chat-domain').removeClass('hidden');
            },

            changePropertyValueRegistration: function (ev) {
                let $property_item = $(ev.target),
                    $property_value = $property_item.closest('.property-field').find('.property-value');
                if ($property_item.hasClass('set-custom-domain')) {
                    this.setCustomDomainRegistration($property_value);
                    return;
                }
                else if ($property_item.hasClass('set-default-domain')) {
                    this.$('.select-xmpp-server .input-group-chat-domain').addClass('hidden');
                    this.$('#new_account_domain').val("");
                }
                $property_value.text($property_item.text());
                $property_value.removeClass('hidden').attr('data-value', $property_item.attr('data-value'));
                this.$('.select-xmpp-server .caret').removeClass('hidden');
                if(this.$jid_input.val() && (this.$domain_input.val() || this.$('.register-form-jid .xmpp-server-dropdown-wrap .property-value').text()))
                    this.keyUpJid();
            },

            changePropertyValueAuth: function (ev) {
                let $property_item = $(ev.target),
                    $property_value = $property_item.closest('.property-field').find('.property-value');
                if ($property_item.hasClass('set-custom-domain')) {
                    this.setCustomDomainAuth($property_value);
                    return;
                }
                else if ($property_item.hasClass('set-default-domain')) {
                    this.$('.select-auth-xmpp-server .input-group-chat-domain').addClass('hidden');
                    this.$('#sign_in_domain').val("");
                }
                $property_value.text($property_item.text());
                $property_value.removeClass('hidden').attr('data-value', $property_item.attr('data-value'));
                this.$('.select-auth-xmpp-server .caret').removeClass('hidden');
            },

            chooseAvatar: function () {
                this.$('.circle-avatar input').click();
            },

            openEmojiPanel: function () {
                let emoji_panel_view = new xabber.EmojiProfileImageView();
                emoji_panel_view.open({model: this.account, registration: true, registration_view: this});
            },

            openWebcamPanel: function () {
                let webcam_panel_view = new xabber.WebcamProfileImageView();
                webcam_panel_view.open({model: this.account, registration: true, registration_view: this});
            },

            changeAvatar: function (ev) {
                let field = ev.target;
                if (!field.files.length)
                    return;
                let file = field.files[0];
                field.value = '';
                if (file.size > constants.MAX_AVATAR_FILE_SIZE) {
                    utils.dialogs.error(xabber.getString("group_settings__error__avatar_too_large"));
                    return;
                } else if (!file.type.startsWith('image')) {
                    utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                    return;
                }

                utils.images.getAvatarFromFile(file).done((image) => {
                    if (image) {
                        file.base64 = image;
                        this.avatar = file;
                        this.$('.btn-next').prop('disabled', false);
                        this.$('.circle-avatar').addClass('changed');
                        this.$('.circle-avatar').setAvatar(image, this.member_details_avatar_size);
                    }
                });
            },

            successFeedback: function () {
                this.data.set('step', -1)
            },

            checkFeaturesStepper: function () {
                this.$('.server-features-error').text('');
                let timeout_timer = 1000;
                setTimeout(() => {
                    if (this.account.server_features.get(Strophe.NS.MAM)){
                        this.$(`.server-feature[data-xmlns="${Strophe.NS.MAM}"]`).addClass('active-feature');
                        this.$(`.server-feature[data-xmlns="${Strophe.NS.MAM}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                    }
                    else
                        this.$(`.server-feature[data-xmlns="${Strophe.NS.MAM}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                    this.$(`.server-feature[data-xmlns="${Strophe.NS.MAM}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
                    setTimeout(() => {
                        if (this.account.server_features.get(Strophe.NS.SYNCHRONIZATION)){
                            this.$(`.server-feature[data-xmlns="${Strophe.NS.SYNCHRONIZATION}"]`).addClass('active-feature');
                            this.$(`.server-feature[data-xmlns="${Strophe.NS.SYNCHRONIZATION}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                        }
                        else
                            this.$(`.server-feature[data-xmlns="${Strophe.NS.SYNCHRONIZATION}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                        this.$(`.server-feature[data-xmlns="${Strophe.NS.SYNCHRONIZATION}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
                        setTimeout(() => {
                            if (this.account.server_features.get(Strophe.NS.REWRITE)){
                                this.$(`.server-feature[data-xmlns="${Strophe.NS.REWRITE}"]`).addClass('active-feature');
                                this.$(`.server-feature[data-xmlns="${Strophe.NS.REWRITE}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                            }
                            else
                                this.$(`.server-feature[data-xmlns="${Strophe.NS.REWRITE}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                            this.$(`.server-feature[data-xmlns="${Strophe.NS.REWRITE}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
                            setTimeout(() => {
                                if (this.account.server_features.get(Strophe.NS.AUTH_DEVICES)) {
                                    this.$(`.server-feature[data-xmlns="${Strophe.NS.AUTH_DEVICES}"]`).addClass('active-feature');
                                    this.$(`.server-feature[data-xmlns="${Strophe.NS.AUTH_DEVICES}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                                }
                                else
                                        this.$(`.server-feature[data-xmlns="${Strophe.NS.AUTH_DEVICES}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle')
                                this.$(`.server-feature[data-xmlns="${Strophe.NS.AUTH_DEVICES}"] .preloader-wrapper`).removeClass('active').removeClass('visible');;
                                setTimeout(() => {
                                    if (this.account.server_features.get(Strophe.NS.PUBSUB)){
                                        this.$(`.server-feature[data-xmlns="${Strophe.NS.PUBSUB}"]`).addClass('active-feature');
                                        this.$(`.server-feature[data-xmlns="${Strophe.NS.PUBSUB}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                                    }
                                    else
                                        this.$(`.server-feature[data-xmlns="${Strophe.NS.PUBSUB}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                                    this.$(`.server-feature[data-xmlns="${Strophe.NS.PUBSUB}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
                                    setTimeout(() => {
                                        if (this.account.server_features.get(Strophe.NS.HTTP_UPLOAD)){
                                            this.$(`.server-feature[data-xmlns="${Strophe.NS.HTTP_UPLOAD}"]`).addClass('active-feature');
                                            this.$(`.server-feature[data-xmlns="${Strophe.NS.HTTP_UPLOAD}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                                        }
                                        else
                                            this.$(`.server-feature[data-xmlns="${Strophe.NS.HTTP_UPLOAD}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                                        this.$(`.server-feature[data-xmlns="${Strophe.NS.HTTP_UPLOAD}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
                                        setTimeout(() => {
                                            if (constants.RECOMMENDED_DOMAIN && (this.$('.server-feature.active-feature').length != 6)){
                                                this.$('.server-features-error').text(xabber.getString('signin_not_all_features', [constants.RECOMMENDED_DOMAIN]));
                                                this.$('.login-panel-form.xmpp-login-form .buttons-wrap').addClass('server-features-additional-button');
                                                this.$('.btn-sign-up-instead').hideIf(false);
                                            }
                                            if (this.$('.server-feature.active-feature').length != 6) {
                                                this.$('.btn-finish-log-in').text(xabber.getString('signin_proceed_anyway'))
                                                this.$('.btn-finish-log-in').addClass('btn-main').removeClass('btn-main-filled')
                                            }
                                            else {
                                                this.$('.btn-finish-log-in').text(xabber.getString('xaccount_next'))
                                                this.$('.btn-finish-log-in').removeClass('btn-main').addClass('btn-main-filled')
                                            }
                                            this.$('.btn-finish-log-in').hideIf(false);
                                        }, timeout_timer);
                                    }, timeout_timer);
                                }, timeout_timer);
                            }, timeout_timer);
                        }, timeout_timer);
                    }, timeout_timer);
                }, timeout_timer);
            },

            endAuth: function (account) {
                this.account.save('is_new', undefined);
                this.data.set('registration', false);
                this.data.set('authentication', false);
                xabber.body.setScreen('all-chats', {right: null});
                this.account.trigger('ready_to_get_roster');
                this.account.auth_view = null;
            },

            authFeedback: function (options) {
                this.$jid_input.switchClass('invalid', options.jid);
                this.$('.login-form-jid .login-jid-error').text(options.jid || '').showIf(options.jid);
                this.$password_input.switchClass('invalid', options.password);
                this.$('.login-form-jid .login-password-error').text(options.password || '').showIf(options.password);
                this.$('.login-form-jid .register-form-step-description').hideIf(options.password || options.jid);
            },

            resetAuthStepper: function (){
                this.$(`.login-step .preloader-wrapper`).addClass('active').addClass('visible');
                this.$(`.login-step .mdi`).hideIf(true);
                this.$(`.login-step`).removeClass('active-feature')
                this.$(`.login-step .mdi`).addClass('mdi-alert-circle').removeClass('mdi-checkbox-marked-circle')
            },

            authStepperShow: function (){
                this.$('.login-step-wrap').hideIf(false);
                this.$(`.login-step`).hideIf(true);
            },

            authStepperStart: function (){
                this.$(`.login-step.connecting-step`).hideIf(false);
                let timeout_timer = 1000;
                setTimeout(() => {
                    this.$(`.login-step.connecting-step`).addClass('active-feature');
                    this.$(`.login-step.connecting-step .preloader-wrapper`).removeClass('active').removeClass('visible');
                    this.$(`.login-step.connecting-step .mdi`).hideIf(false).removeClass('mdi-alert-circle').addClass('mdi-checkbox-marked-circle');
                    this.$(`.login-step.credentials-step`).hideIf(false);
                    setTimeout(() => {
                        this.$(`.login-step.credentials-step`).addClass('active-feature');
                        this.$(`.login-step.credentials-step .preloader-wrapper`).removeClass('active').removeClass('visible');
                        this.$(`.login-step.credentials-step .mdi`).hideIf(false).removeClass('mdi-alert-circle').addClass('mdi-checkbox-marked-circle');
                        setTimeout(() => {
                            if (constants.TRUSTED_DOMAINS.indexOf(this.account.connection.domain) > -1){
                                this.endAuth();
                            } else {
                                this.stepped_auth_complete = true
                                if (this.first_features_received)
                                    this.successFeedback();
                            }
                        },timeout_timer)
                    },timeout_timer)
                },timeout_timer)
            },

            authStepperError: function (auth_error, options){
                let timeout_timer = 1000;
                this.$('.login-step-wrap').hideIf(false);
                this.$(`.login-step.connecting-step`).hideIf(false);
                setTimeout(() => {
                    if (auth_error){
                        this.$(`.login-step.connecting-step`).addClass('active-feature');
                        this.$(`.login-step.connecting-step .preloader-wrapper`).removeClass('active').removeClass('visible');
                        this.$(`.login-step.connecting-step .mdi`).hideIf(false).removeClass('mdi-alert-circle').addClass('mdi-checkbox-marked-circle');
                        this.$(`.login-step.credentials-step`).hideIf(false);
                    }
                    else {
                        this.$(`.login-step.connecting-step .preloader-wrapper`).removeClass('active').removeClass('visible');
                        this.$(`.login-step.connecting-step .mdi`).hideIf(false);
                        this.errorFeedback(options);
                        return;
                    }
                    setTimeout(() => {
                        this.$(`.login-step.credentials-step .preloader-wrapper`).removeClass('active').removeClass('visible');
                        this.$(`.login-step.credentials-step .mdi`).hideIf(false);
                        this.errorFeedback(options);
                    },timeout_timer)
                },timeout_timer)
            },

            registerFeedback: function (options) {
                if(options.user_success) {
                    this.$('.register-form-jid .register-form-step-error').addClass('available').text(options.jid || '').showIf(options.jid);
                    this.$jid_input.removeClass('invalid');
                    this.$('.register-form-jid .register-form-step-description').hideIf(options.jid);
                }
                else if(options.registration_success) {
                    this.$('.register-form-password .register-form-step-error').addClass('available').text(options.password || '').showIf(options.password);
                    this.$password_input.removeClass('invalid');
                    this.$('.register-form-password .register-form-step-description').hideIf(options.password);
                }
                else {
                    this.$nickname_input.switchClass('invalid', options.nickname);
                    this.$('.register-form-nickname.register-form-step-error').text(options.nickname || '').showIf(options.nickname);
                    this.$('.register-form-nickname .register-form-step-description').hideIf(options.nickname);
                    this.$jid_input.switchClass('invalid', options.jid);
                    this.$domain_input.switchClass('invalid', options.domain);
                    this.$('.register-form-jid .register-form-step-error').removeClass('available').text(options.jid || options.domain || '').showIf(options.jid || options.domain);
                    this.$('.register-form-jid .register-form-step-description').hideIf(options.jid || options.domain);
                    this.$password_input.switchClass('invalid', options.password);
                    this.$('.register-form-password .register-form-step-error').removeClass('available').text(options.password || '').showIf(options.password);
                    this.$('.register-form-password .register-form-step-description').hideIf(options.password);
                }
            },

            errorRegistrationFeedback: function (options) {
                this.registerFeedback(options);
                this.data.set('registration', false);
                this.data.set('authentication', false);
                this.$jid_input.prop('disabled', false);
                this.$password_input.prop('disabled', false);
                if(this.account)
                    this.account.destroy();
            },

            successRegistrationFeedback: function () {
                this.$jid_input.prop('disabled', false);
                this.$password_input.prop('disabled', false)
                this.account.trigger('start');
            },
        });


        xabber.AddAccountView = xabber.XmppLoginPanel.extend({
            className: 'modal main-modal add-account-modal',
            template: templates.add_account,

            events: {
                "click .login-type": "changeLoginType",
                "click .btn-log-in": "login",
                "click .btn-cancel": "logout",
                "click .btn-go-back-menu": "close",
                "click .btn-finish-log-in": "endAuth",
                "keyup input[name=jid]": "keyUpLogin",
                "keyup input[name=password]": "keyUpLogin",
                "keyup input[name=sign_in_domain]": "keyUpLogin",
                "click .property-variant": "changePropertyValueAuth"
            },

            render: function (options) {
                this.$el.openModal({
                    ready: this.onRender.bind(this),
                    complete: this.close.bind(this)
                });
            },

            onRender: function () {
                this.data.set('step', 0)
                this.account = null;
                this.stepped_auth = true;
                this.stepped_auth_complete = false;
                this.authFeedback({});
                this.$jid_input = this.$('input[name=jid]');
                this.$password_input = this.$('input[name=password]');
                this.$domain_input = this.$('input[name=sign_in_domain]');
                this.$jid_input.val('')
                this.$password_input.val('')
                this.keyUpLogin();
                this.updateAuthDomains();
                this.$('.login-step-wrap').hideIf(true);
                this.resetAuthStepper();
                this.$('.login-panel-form.xmpp-login-form .buttons-wrap').removeClass('server-features-additional-button')
                this.$('.modal-header').text(xabber.getString("account_add"));
                this.$('.login-form-jid').hideIf(false);
                this.$('.login-form-server-features').hideIf(true);
                this.$('.btn-log-in').hideIf(false);
                this.$('.btn-cancel').hideIf(true);
                this.$('.btn-finish-log-in').hideIf(true);
                let dropdown_settings = {
                    inDuration: 100,
                    outDuration: 100,
                    constrainWidth: false,
                    hover: false,
                    alignment: 'left'
                };
                this.$('.property-field .select-auth-xmpp-server .caret').dropdown(dropdown_settings);
                this.$('.property-field .select-auth-xmpp-server .xmpp-server-item-wrap').dropdown(dropdown_settings);
                this.$('.login-form-jid .dropdown-content .set-custom-domain').hideIf(!constants.LOGIN_CUSTOM_DOMAIN);
                Materialize.updateTextFields();
                this.updateButtons();
                this.updateOptions && this.updateOptions();
            },

            handleRegistrationStep: function () {
                let step = this.data.get('step')
                if (step === -1){
                    this.$(`.server-feature .preloader-wrapper`).addClass('active').addClass('visible');
                    this.$(`.server-feature .mdi`).hideIf(true);
                    this.$(`.server-feature`).removeClass('active-feature')
                    this.$(`.server-feature .mdi`).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle')
                    this.$('.modal-header').text(xabber.getString("signin_server_features"));
                    this.$('.login-form-jid').hideIf(true);
                    this.$('.login-form-server-features').hideIf(false);
                    this.$('.btn-log-in').hideIf(true);
                    this.checkFeaturesStepper();
                }
            },

            logout: function () {
                this.account.session.set('delete', true);
                this.account.deactivate();
                this.closeModal();
            },

            endAuth: function () {
                this.account.save('is_new', undefined);
                this.data.set('authentication', false);
                xabber.body.setScreen('all-chats', {right: null});
                this.account.trigger('ready_to_get_roster');
                this.account.auth_view = null;
                this.closeModal();
            },

            checkFeaturesStepper: function () {
                this.$('.server-features-error').text('');
                let timeout_timer = 1000;
                setTimeout(() => {
                    if (this.account.server_features.get(Strophe.NS.MAM)){
                        this.$(`.server-feature[data-xmlns="${Strophe.NS.MAM}"]`).addClass('active-feature');
                        this.$(`.server-feature[data-xmlns="${Strophe.NS.MAM}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                    }
                    else
                        this.$(`.server-feature[data-xmlns="${Strophe.NS.MAM}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                    this.$(`.server-feature[data-xmlns="${Strophe.NS.MAM}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
                    setTimeout(() => {
                        if (this.account.server_features.get(Strophe.NS.SYNCHRONIZATION)){
                            this.$(`.server-feature[data-xmlns="${Strophe.NS.SYNCHRONIZATION}"]`).addClass('active-feature');
                            this.$(`.server-feature[data-xmlns="${Strophe.NS.SYNCHRONIZATION}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                        }
                        else
                            this.$(`.server-feature[data-xmlns="${Strophe.NS.SYNCHRONIZATION}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                        this.$(`.server-feature[data-xmlns="${Strophe.NS.SYNCHRONIZATION}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
                        setTimeout(() => {
                            if (this.account.server_features.get(Strophe.NS.REWRITE)){
                                this.$(`.server-feature[data-xmlns="${Strophe.NS.REWRITE}"]`).addClass('active-feature');
                                this.$(`.server-feature[data-xmlns="${Strophe.NS.REWRITE}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                            }
                            else
                                this.$(`.server-feature[data-xmlns="${Strophe.NS.REWRITE}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                            this.$(`.server-feature[data-xmlns="${Strophe.NS.REWRITE}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
                            setTimeout(() => {
                                if (this.account.server_features.get(Strophe.NS.AUTH_DEVICES)) {
                                    this.$(`.server-feature[data-xmlns="${Strophe.NS.AUTH_DEVICES}"]`).addClass('active-feature');
                                    this.$(`.server-feature[data-xmlns="${Strophe.NS.AUTH_DEVICES}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                                }
                                else
                                    this.$(`.server-feature[data-xmlns="${Strophe.NS.AUTH_DEVICES}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle')
                                this.$(`.server-feature[data-xmlns="${Strophe.NS.AUTH_DEVICES}"] .preloader-wrapper`).removeClass('active').removeClass('visible');;
                                setTimeout(() => {
                                    if (this.account.server_features.get(Strophe.NS.PUBSUB)){
                                        this.$(`.server-feature[data-xmlns="${Strophe.NS.PUBSUB}"]`).addClass('active-feature');
                                        this.$(`.server-feature[data-xmlns="${Strophe.NS.PUBSUB}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                                    }
                                    else
                                        this.$(`.server-feature[data-xmlns="${Strophe.NS.PUBSUB}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                                    this.$(`.server-feature[data-xmlns="${Strophe.NS.PUBSUB}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
                                    setTimeout(() => {
                                        if (this.account.server_features.get(Strophe.NS.HTTP_UPLOAD)){
                                            this.$(`.server-feature[data-xmlns="${Strophe.NS.HTTP_UPLOAD}"]`).addClass('active-feature');
                                            this.$(`.server-feature[data-xmlns="${Strophe.NS.HTTP_UPLOAD}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                                        }
                                        else
                                            this.$(`.server-feature[data-xmlns="${Strophe.NS.HTTP_UPLOAD}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                                        this.$(`.server-feature[data-xmlns="${Strophe.NS.HTTP_UPLOAD}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
                                        setTimeout(() => {
                                            if (constants.RECOMMENDED_DOMAIN && (this.$('.server-feature.active-feature').length != 6)){
                                                this.$('.server-features-error').text(xabber.getString('signin_not_all_features', [constants.RECOMMENDED_DOMAIN]));
                                            }
                                            if (this.$('.server-feature.active-feature').length != 6)
                                                this.$('.btn-finish-log-in').text(xabber.getString('signin_proceed_anyway'))
                                            else
                                                this.$('.btn-finish-log-in').text(xabber.getString('xaccount_next'))
                                            this.$('.btn-finish-log-in').hideIf(false);
                                            this.$('.btn-cancel').hideIf(false);
                                        }, timeout_timer);
                                    }, timeout_timer);
                                }, timeout_timer);
                            }, timeout_timer);
                        }, timeout_timer);
                    }, timeout_timer);
                }, timeout_timer);
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


            this.on("add_account", function () {
                if (!this.add_account_view)
                    this.add_account_view = new this.AddAccountView();
                this.add_account_view.show();
            }, this);

            $(window).bind('beforeunload',function(){
                xabber.current_voip_call && xabber.current_voip_call.reject();
                return;
            });

            window.onbeforeunload = () => {
                _.each(this.accounts.connected, function (account) {
                    account.sendPresence('offline');
                });
            };

            this.login_page.patchTree = function (tree, options) {
                let login_screen = options.login_screen || constants.DEFAULT_LOGIN_SCREEN;
                return login_screen === 'xmpp' ? { xmpp_login: null } : { xabber_login: null };
            };

            this.servers = new xabber.Servers();
        }, xabber);

        return xabber;
    };
});
