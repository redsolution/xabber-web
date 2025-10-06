import xabber from "xabber-core";

let env = xabber.env,
    constants = env.constants,
    templates = env.templates.accounts,
    utils = env.utils,
    $ = env.$,
    $iq = env.$iq,
    $msg = env.$msg,
    $pres = env.$pres,
    uuid = env.uuid,
    Strophe = env.Strophe,
    _ = env._,
    moment = env.moment,
    Images = utils.images,
    Backbone = env.Backbone,
    pretty_datetime = (timestamp) => { return utils.pretty_datetime(timestamp, (xabber.settings.language === 'ru-RU' || xabber.settings.language === 'default' && xabber.get("default_language") === 'ru-RU') && 'D MMMM YYYY HH:mm:ss')},
    pretty_datetime_date = (timestamp) => { return utils.pretty_datetime(timestamp, 'MMM DD, YYYY')};


xabber.Account = Backbone.Model.extend({
        idAttribute: 'jid',

        defaults: () => {
            return {
                enabled: true,
                auth_type: "password",
                status: "online",
                status_message: "",
                priority: 67,
                auto_login_xa: false,
                account_unique_id: uuid().substring(0, 8),
                groupchat_servers_list: []
            }
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
                ready_to_send: false,
                conn_retries: 0,
                conn_feedback: xabber.getString("connection__error__text_disconnected")
            });
            this.gallery_code_requests = [];
            this.proxy_code_requests = [];
            this.session.on("change:connected", this.onChangedConnected, this);
            this.CONNECTION_URL = _attrs.websocket_connection_url || constants.CONNECTION_URL;
            this.conn_manager = new Strophe.ConnectionManager(this.CONNECTION_URL, {'x-token': true});
            this.connection = this.conn_manager.connection;
            this.get('x_token') && (this.connection.x_token = this.get('x_token'));
            if (this.connection.x_token && this.connection.x_token.counter && !this.get('hotp_counter')) {
                this.save({
                    hotp_counter: this.connection.x_token.counter,
                });
                this.counter_changes_logging.updateCountersList(this);
            }
            this.get('hotp_counter') && (this.connection.counter = this.get('hotp_counter'));
            this.on("destroy", this.onDestroy, this);
            this._added_pres_handlers = [];
            this._pending_stanzas = [];
            this._pending_messages = [];
            this._msg_xep_checkers = [];
            this.dfd_presence = new $.Deferred();
            this.resources = new xabber.AccountResources(null, {account: this});
            this.password_view = new xabber.ChangePasswordView({model: this});
            this.updateColorScheme();
            this.settings.on("change:color", this.updateColorScheme, this);
            _.each(this._init_plugins, (plugin) => {
                plugin.call(this);
            });
            this.connection.xmlInput = function (xml) {
                xabber.info('input main connection');
                xabber.info(xml);
            };
            this.connection.xmlOutput = function (xml) {
                xabber.info('output main connection');
                xabber.info(xml);
                if (this.streamManagement
                    && this.streamManagement._isStreamManagementEnabled){
                    this.streamManagement.xmlOutput(xml);
                }
            };
            this.once("start", this.start, this);
            xabber.on("start_accounts", () => {
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

        isReconnecting: function () {
            return this.session && this.session.get('reconnecting');
        },

        isOnline: function () {
            return this.get('status') !== 'offline';
        },

        testMsgChildForXeps: async function (msg_object) {
            this._msg_xep_checkers.sort((a, b) => {
                return a.order - b.order;
            });

            for (let checker of this._msg_xep_checkers) {
                if (msg_object.ignore || !checker.callback) {
                    return msg_object;
                }
                msg_object = await checker.callback(msg_object);
            }
            return msg_object;
        },

        sendMsg: function (stanza, callback) {
            let res = this.connection.authenticated && !this.connection.disconnecting && this.session.get('connected') && this.session.get('ready_to_send') && this.get('status') !== 'offline';
            if (res || (this.connection && this.connection.streamManagement._isStreamManagementEnabled && this.connection.streamManagement.getResumeToken())) {
                this.connection.send(stanza);
            }
            callback && callback();
            return res;
        },

        sendMsgPending: function (stanza) {
            let res = this.connection.authenticated && !this.connection.disconnecting && this.session.get('connected') && this.get('status') !== 'offline';
            if (res) {
                this.connection.send(stanza);
            }
            return res;
        },

        sendMsgFast: function (stanza, callback) {
            return this.sendMsg(stanza, callback);
        },

        getConnectionForIQ: function () {
            return this.connection;
        },

        sendIQFast: function () {
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
            let dfd = new $.Deferred();

            dfd.done((data, http_avatar) => {
                if (http_avatar) {
                    let avatar_hash = data.hash || image.hash || sha1(image.base64),
                        iq_pub_metadata = $iq({type: 'set'})
                            .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                            .c('publish', {node: Strophe.NS.PUBSUB_AVATAR_METADATA})
                            .c('item', {id: avatar_hash})
                            .c('metadata', {xmlns: Strophe.NS.PUBSUB_AVATAR_METADATA})
                            .c('info', {bytes: data.size, id: avatar_hash, type: data.type, url: data.file});
                    data.thumbnails && data.thumbnails.forEach((thumbnail) => {
                        iq_pub_metadata.c('thumbnail', {
                            xmlns: Strophe.NS.PUBSUB_AVATAR_METADATA_THUMBNAIL,
                            url: thumbnail.url,
                            width: thumbnail.width,
                            height: thumbnail.height,
                        }).up()
                    });
                    this.sendIQFast(iq_pub_metadata, () => {
                            callback && callback(avatar_hash);
                        },
                        function (data_error) {
                            errback && errback(data_error);
                        });
                }
                else {
                    let avatar_hash = image.hash || sha1(image.base64),
                        iq_pub_data = $iq({type: 'set'})
                            .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                            .c('publish', {node: Strophe.NS.PUBSUB_AVATAR_DATA})
                            .c('item', {id: avatar_hash})
                            .c('data', {xmlns: Strophe.NS.PUBSUB_AVATAR_DATA}).t(data),
                        iq_pub_metadata = $iq({type: 'set'})
                            .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                            .c('publish', {node: Strophe.NS.PUBSUB_AVATAR_METADATA})
                            .c('item', {id: avatar_hash})
                            .c('metadata', {xmlns: Strophe.NS.PUBSUB_AVATAR_METADATA})
                            .c('info', {bytes: image.size, id: avatar_hash, type: image.type});
                    this.sendIQFast(iq_pub_data, () => {
                            this.sendIQFast(iq_pub_metadata, () => {
                                    callback && callback(avatar_hash);
                                },
                                function (data_error) {
                                    errback && errback(data_error);
                                });
                        },
                        (data_error) => {
                            errback && errback(data_error);
                        });
                }
            });
            if (image.uploaded){
                dfd.resolve(image, true)
            }
            else if (this.get('gallery_token') && this.get('gallery_url') && !image.generated && !image.uploaded){
                let file = image.name ? image : image.file;
                this.uploadAvatar(file, (res) => {
                    if (res.thumbnails && res.thumbnails.length || res.file){
                        res.type = file.type;
                        dfd.resolve(res, true)
                    } else
                        dfd.resolve(image.base64)
                }, () => {
                    dfd.resolve(image.base64)
                });
            } else
                dfd.resolve(image.base64)
        },

        removeAvatar: function (callback, errback) {
            let iq_pub_metadata = $iq({type: 'set'})
                .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                .c('publish', {node: Strophe.NS.PUBSUB_AVATAR_METADATA})
                .c('item')
                .c('metadata', {xmlns: Strophe.NS.PUBSUB_AVATAR_METADATA});
            this.sendIQFast(iq_pub_metadata, () => {
                    callback && callback();
                },
                function () {
                    errback && errback();
                });
        },

        getAvatar: function (avatar, callback, errback) {
            let iq_request_avatar = $iq({type: 'get', to: this.get('jid')})
                .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                .c('items', {node: Strophe.NS.PUBSUB_AVATAR_DATA})
                .c('item', {id: avatar});
            this.sendIQFast(iq_request_avatar, (iq) => {
                let pubsub_avatar = $(iq).find('data').text();
                if (pubsub_avatar === "")
                    errback && errback(xabber.getString("pubsub__error__text_empty_node"));
                else
                    callback && callback(pubsub_avatar);
            });
        },

        sendIQ: function () {
            let res = (this.connection.authenticated && !this.connection.disconnecting && this.session.get('connected') && this.get('status') !== 'offline');
            if (res || (this.connection && this.connection.streamManagement._isStreamManagementEnabled && this.connection.streamManagement.getResumeToken())) {
                let elem = arguments[0];
                if (typeof(elem.tree) === "function" && elem.tree().getAttribute('type') === 'get') {
                    let lang = xabber.settings.language;
                    (lang === 'default') && (lang = xabber.get('default_language'));
                    elem.tree().setAttribute('xml:lang', lang);
                }
                this.connection.sendIQ.apply(this.connection, arguments);
            } else {
            }
            return res;
        },

        parseDataForm: function ($dataform) {
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
            if (this.connection.authenticated && this.session.get('connected') || (this.connection && this.connection.streamManagement._isStreamManagementEnabled && this.connection.streamManagement.getResumeToken())) {
                this.connection.send(stanza);
            } else {
                this._pending_stanzas.push({stanza: stanza});
            }
            return this.connection.authenticated;
        },

        getOwnNickname: function () {
            let nickname;
            if (this.get('vcard')) {
                if (this.get('vcard').nickname)
                    nickname = this.get('vcard').nickname;
                else if (this.get('vcard').first_name && this.get('vcard').last_name)
                    nickname = this.get('vcard').first_name + ' ' + this.get('vcard').last_name;
                else if (this.get('vcard').fullname)
                    nickname = this.get('vcard').fullname;
                else if (this.get('vcard').first_name || this.get('vcard').last_name)
                    nickname = this.get('vcard').first_name + ' ' + this.get('vcard').last_name;
            }
            if (nickname){
                return nickname;
            } else {
                return this.get('jid');
            }
        },

        retractMessageById: function (stanza_id, to, conversation, type) {
            let iq_retraction = $iq({type: 'set', to: to})
                    .c('retract-message', {
                        id: stanza_id,
                        xmlns: Strophe.NS.REWRITE,
                        conversation: conversation,
                        symmetric: false,
                        type: type,
                        by: this.get('jid')
                    });
                this.sendIQFast(iq_retraction, (success) => {

                }, (error) => {

                });
        },

        createFastConnection: function () {
        },

        connect: function () {
            let jid = this.get('jid'),
                auth_type = this.get('auth_type'),
                password;
            if (xabber.settings.device_metadata === 'contacts'){
                jid += '/' + constants.CLIENT_RESOURCE + '-' + xabber.get('client_id');
            }
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
                if (auth_type === 'x-token' && this.get('x_token') && this.get('x_token').token_uid)
                    this.set('old_device_token', this.get('x_token').token_uid);
                this.password_view.show(attrs);
                return;
            }
            this.session.set({
                connected: false,
                reconnected: false,
                reconnecting: false,
                ready_to_send: false,
                conn_retries: 0,
                conn_feedback: xabber.getString("application_state_connecting"),
                auth_failed: false,
                connection_timeout: undefined,
            });
            this.restoreStatus();
            this.conn_manager.connect(auth_type, jid, password, this.connectionCallback.bind(this));
        },

        reconnect: function (is_fast) {
            console.error(this);
            console.error('reconnect called');
            if (!this.get('enabled')){
                console.error('reconnect called on disabled account');
                this.deactivate();
                return;
            }
            let conn_retries = this.session.get('conn_retries'),
                timeout = conn_retries < 3 ? constants.RECONNECTION_TIMEOUTS[conn_retries] : 20000;
            if (is_fast)
                timeout = 1500;
            this.session.set({
                connected: false,
                reconnected: false,
                ready_to_send: false,
                reconnecting: true,
                conn_retries: ++conn_retries,
                conn_feedback:  xabber.getString("application_state_reconnect_after_some_seconds", [timeout/1000]),
                auth_failed: false
            });
            if (this.get('x_token'))
                this.connection.x_token = this.get('x_token');
            this.connection.account = this;
            setTimeout(() => {
                if (!this.get('enabled')){
                    console.error('reconnect timeout called on disabled account');
                    this.deactivate();
                    return;
                }
                if (this.isConnected())
                    return;
                this.connFeedback(xabber.getString("application_state_connecting"));
                this.restoreStatus();
                this.connection.reset();
                console.error('started reconnecting');
                xabber._settings.get('reconnection_logs') && utils.callback_popup_message('started reconnecting', 3000);
                this.conn_manager.reconnect(this.reconnectionCallback.bind(this));
            }, timeout);
        },

        connectionCallback: function (status, condition, elem) {
            if (this.session.get('reconnecting')) {
                xabber.info('ignore connection callback for status: '+constants.CONN_STATUSES[status]);
                return;
            }
            this.auth_view && this.loginCallback(status, condition);
            this.session.set({conn_status: status, conn_condition: condition});
            if ((status === Strophe.Status.ERROR) && (condition === 'conflict') && !this.session.get('delete')) {
                this.onConnectionConflict();
            } else if ((status === Strophe.Status.ERROR && (condition === 'connection-timeout')) || status === Strophe.Status.CONNFAIL) {
                this.session.set('connection_timeout', true);
            } else if (status === Strophe.Status.ERROR && (condition === 'policy-violation')) {
                this.onAuthFailed(condition);
            } else if (status === Strophe.Status.CONNECTED) {
                this.session.set('on_token_revoked', false);
                if (this._revoke_on_connect){
                    this.session.set({connected: true, reconnected: false});
                    if (this.omemo)
                        this.omemo.destroy();
                    this._revoke_on_connect.resolve();
                    return;
                }
                if (this.connection.x_token) {
                    this.save({
                        auth_type: 'x-token',
                        x_token: this.connection.x_token,
                        hotp_counter: this.connection.counter,
                    });
                    this.counter_changes_logging.updateCountersList(this);
                    this.conn_manager.auth_type = 'x-token';
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
                this.session.set({connected: true, reconnected: false});
            } else if (status === Strophe.Status.AUTHFAIL) {
                if ((this.get('auth_type') === 'x-token' || this.connection.x_token)){
                    if ($(elem).find('account-disabled').length > 0)
                        this.onTokenRevoked();
                    else if (!this.session.get('auth_failed'))
                        this.onAuthFailed();
                }
                else if (!this.session.get('auth_failed'))
                    this.onAuthFailed();
            } else if (status === Strophe.Status.DISCONNECTED) {
                this.connection && clearTimeout(this.connection.openCheckTimeout);
                if (this.session.get('on_token_revoked'))
                    return;
                this.connection.flush();
                if (this._main_interval_worker)
                    this._main_interval_worker.terminate();
                this.session.set({
                    connected: false,
                    ready_to_send: false,
                });
                if (this.session.get('connection_timeout')) {
                    setTimeout(() => {
                        this.reconnect();
                    }, 5000)
                }
            }
        },

        reconnectionCallback: function (status, condition, elem) {
            if (!this.session.get('reconnecting')) {
                xabber.info('ignore reconnection callback for status: '+constants.CONN_STATUSES[status]);
                return;
            }
            this.session.set({conn_status: status, conn_condition: condition});
            if (status === Strophe.Status.CONNECTED) {
                console.log('reconnected main connection');
                xabber._settings.get('reconnection_logs') && utils.callback_popup_message(`reconnected main connection , conn_retries: ${this.session.get('conn_retries')}`, 5000);
                this.session.set('on_token_revoked', false);
                if (this.connection.x_token) {
                    this.save({
                        auth_type: 'x-token',
                        x_token: this.connection.x_token,
                        hotp_counter: this.connection.counter,
                    });
                    this.counter_changes_logging.updateCountersList(this);
                }
                this.createFastConnection();
                this.connection.connect_callback = this.connectionCallback.bind(this);
                this.session.set({
                    connected: true,
                    reconnected: true,
                    reconnecting: false,
                    conn_retries: 0
                });
            } else if (status === Strophe.Status.ERROR && (condition === 'policy-violation')) {
                this.onAuthFailed(condition);
            } else if (status === Strophe.Status.AUTHFAIL) {
                if ((this.get('auth_type') === 'x-token' || this.connection.x_token)) {
                    if ($(elem).find('account-disabled').length > 0)
                        this.onTokenRevoked();
                    else if (!this.session.get('auth_failed'))
                        this.onAuthFailed();
                }
                else if (!this.session.get('auth_failed'))
                    this.onAuthFailed();
            } else if (status === Strophe.Status.DISCONNECTED) {
                this.connection && clearTimeout(this.connection.openCheckTimeout);
                if (this.session.get('on_token_revoked'))
                    return;
                this.connection.flush();
                if (this._main_interval_worker)
                    this._main_interval_worker.terminate();
                if (this.session.get('no_reconnect') && this.session.get('auth_failed'))
                    return;
                let max_retries = xabber.settings.max_connection_retries;
                if (max_retries === -1 || this.session.get('conn_retries') < max_retries) {
                    console.log(`started another reconnecting, conn_retries: ${this.session.get('conn_retries')},status: ${status} ,condition: ${condition} `);
                    xabber._settings.get('reconnection_logs') && utils.callback_popup_message(`started another reconnecting, conn_retries: ${this.session.get('conn_retries')},status: ${status} ,condition: ${condition} `, 3000);
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
                let nickname = this.auth_view.$nickname_input.val();
                this.auth_view.data.set('step',6);
                if(nickname){
                    this.set('registration_nickname', nickname)
                }
            } else if (status === Strophe.Status.CONFLICT) {
                this.auth_view.errorRegistrationFeedback({jid: xabber.getString("label_xmpp_id")});
                this.auth_view.data.set('step', 3);
                this.auth_view.$('.btn-next').prop('disabled', false);
            } else if (status === Strophe.Status.NOTACCEPTABLE) {
                if (error_text)
                    this.auth_view.errorRegistrationFeedback({password: error_text});
                else {
                    condition = condition ? ': ' + condition : '';
                    this.auth_view.errorRegistrationFeedback({password: xabber.getString("xmpp_login__registration_not_filled") + condition});
                }
                this.auth_view.data.set('step', 4);
                this.auth_view.$('.btn-next').prop('disabled', false);
            } else if (status === Strophe.Status.REGIFAIL) {
                if (error_text)
                    this.auth_view.errorRegistrationFeedback({password: error_text});
                else {
                    condition = condition ? ': ' + condition : '';
                    this.auth_view.errorRegistrationFeedback({password: xabber.getString("xmpp_login__registration_failed") + condition});
                }
                this.auth_view.data.set('step', 4);
                this.auth_view.$('.btn-next').prop('disabled', false);
            }
        },

        changePasswordCallback: function (status, condition) {
            if (this.change_password_view){
                if (status === Strophe.Status.REGISTERED) {
                    this.change_password_view.successFeedback();
                } else if (status === Strophe.Status.CONFLICT
                    || status === Strophe.Status.NOTACCEPTABLE
                    || status === Strophe.Status.REGIFAIL) {
                    condition = condition ? ': ' + condition : '';
                    this.change_password_view.errorFeedback({password: xabber.getString("password_changed_fail") + condition});
                } else if (status === Strophe.Status.AUTHFAIL) {
                    this.change_password_view.errorFeedback({old_password: xabber.getString("AUTHENTICATION_FAILED")});
                } else if (status === Strophe.Status.CONNECTED) {
                    this.change_password_connection.register.fields.username = Strophe.getNodeFromJid(this.get('jid'));
                    this.change_password_connection.register.fields.password = this.change_password_view.$password_input.val().trim();
                    this.change_password_connection.register.submit();
                } else if (status === Strophe.Status.DISCONNECTED) {
                    this.change_password_connection && clearTimeout(this.change_password_connection.openCheckTimeout);
                    this.change_password_connection_manager = undefined;
                    this.change_password_connection = undefined;
                }
            }
        },

        unregisterAccountCallback: function (status, condition) {
            if (this.unregister_account_view){
                if (status === Strophe.Status.REGISTERED) {
                    this.unregister_account_view.close();
                    this.trigger('deactivate', this);
                    this.deleteAccount();
                    xabber.settings_modal_view.closeSettings();
                } else if (status === Strophe.Status.CONFLICT
                    || status === Strophe.Status.NOTACCEPTABLE
                    || status === Strophe.Status.REGIFAIL) {
                    condition = condition ? ': ' + condition : '';
                    this.unregister_account_view.errorFeedback({password: xabber.getString("account_unregister_failed") + condition});
                    this.unregister_account_view.data.set('step', 0);
                    this.unregister_account_connection && this.unregister_account_connection.disconnect();
                } else if (status === Strophe.Status.AUTHFAIL) {
                    this.unregister_account_view.errorFeedback({password: xabber.getString("wrong_password")});
                    this.unregister_account_view.data.set('step', 0);
                    this.unregister_account_connection && this.unregister_account_connection.disconnect();
                } else if (status === Strophe.Status.CONNECTED) {
                    this.unregister_account_view.data.set('step', 1);
                } else if (status === Strophe.Status.DISCONNECTED) {
                    this.unregister_account_connection && clearTimeout(this.unregister_account_connection.openCheckTimeout);
                    this.unregister_account_connection_manager = undefined;
                    this.unregister_account_connection = undefined;
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

        onAuthFailed: function (text) {
            console.error(text);
            console.error(this);
            if (!this.auth_view && !text){
                utils.dialogs.error(xabber.getString("connection__error__text_authentication_failed", [this.get('jid')]));
                this.password_view.show();
            } else if (text){
                if (this.auth_view)
                    return;
                this.session.set({
                    connected: false,
                    ready_to_send: false,
                    no_reconnect: true
                });
                utils.dialogs.ask_extended(xabber.getString("error"), xabber.getString("modal_policy_violation_text"),
                    {modal_class: 'modal-policy-violation', no_dialog_options: true, quoted_text: text, cancel_button_main: true},
                    {
                        ok_button_text: xabber.getString("disable_account"),
                        cancel_button_text: xabber.getString("account_settings"),
                        optional_button: 'account-reconnect',
                        optional_button_text: xabber.getString("account_reconnect")
                    }).done((res) => {
                    if (res){
                        if (res === 'account-reconnect')
                            this.reconnect();
                        else {
                            this.save('enabled', false);
                            this.deactivate()
                        }
                    } else {
                        this.showSettingsModal();
                    }
                });
                return;
            }
            this.session.set({
                auth_failed: true,
                connected: false,
                ready_to_send: false,
                no_reconnect: true
            });
            this.get('x_token') && this.save({old_device_token: this.get('x_token').token_uid});
            this.save({auth_type: 'password', password: null, x_token: null});
            this.connection.pass = "";
            this.trigger('deactivate', this);
            this.deactivate();
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

        getAllXTokens: function (callback) {
            let tokens_list = [],
                iq = $iq({
                    type: 'get',
                    to: this.get('jid')
                }).c('query', {xmlns: `${Strophe.NS.AUTH_DEVICES}#items`});
            this.sendIQFast(iq, (tokens) => {
                $(tokens).find('device').each((idx, token) => {
                    let $token = $(token),
                        client = $token.find('client').text(),
                        device = $token.find('info').text(),
                        description = $token.find('public-label').text(),
                        omemo_id = $token.find('omemo-id').text(),
                        token_uid = $token.attr('id'),
                        expire = Number($token.find('expire').text())*1000,
                        last_auth = Number($token.find('last-auth').text())*1000,
                        ip_address = $token.find('ip').text();
                    tokens_list.push({client: client, device: device, description: description, token_uid: token_uid, last_auth: last_auth, expire: expire, ip: ip_address, omemo_id: omemo_id});
                });
                this.x_tokens_list = tokens_list;
                callback && callback();
            });
        },

        onTokenRevoked: function () {
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
            this.deleteAccount()
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
            this.dfd_presence = new $.Deferred();
            this.afterConnected();
            _.each(this._after_connected_plugins, (plugin) => {
                plugin.call(this);
            });
        },

        onReconnected: function () {
            this.connFeedback(xabber.getString("account_state_connected"));
            this.dfd_presence = new $.Deferred();
            this.afterConnected();
            _.each(this._after_reconnected_plugins, (plugin) => {
                plugin.call(this);
            });
        },

        afterConnected: function () {
            this.dfd_presence.done(() => {
                this.sendPendingStanzas();
                this.sendPendingMessages();
                this.session.set({
                    ready_to_send: true
                });

                this._main_interval_worker.postMessage({});
            });
            this.registerPresenceHandler();
            this.enableCarbons();
        },

        getAllMessageRetractions: function (callback) {
            let query_options = {xmlns: Strophe.NS.REWRITE, version: this.retraction_version};
            let retractions_query = $iq({type: 'get'})
                .c('query', query_options);
            this.sendIQ(retractions_query, callback);
        },

        sendPendingStanzas: function () {
        },

        sendPendingMessages: function () {
            console.log('pending messages');
            console.log(this._pending_messages);
            this._pending_messages.sort((a,b) => (a.timestamp > b.timestamp) ? 1 : ((b.timestamp > a.timestamp) ? -1 : 0));
            _.each(this._pending_messages, (item) => {
                console.log(item);
                let msg = this.messages.get(item.unique_id), msg_iq;
                msg && (msg_iq = msg.get('xml'));
                if (msg && msg.collection && msg.collection.chat && msg.collection.chat.get('group_chat'))
                    $(msg_iq).append("<retry to='" + msg.collection.chat.get('jid') + "' xmlns='" + Strophe.NS.DELIVERY + "'/>");
                else
                    $(msg_iq).append("<retry xmlns='" + Strophe.NS.DELIVERY + "'/>");
                msg_iq && this.sendMsgPending(msg_iq);
            });
            this.trigger('send_pending_messages');
        },

        _after_connected_plugins: [],
        _after_reconnected_plugins: [],
        _after_fast_connected_plugins: [],

        onDisconnected: function () {
            this.disconnected_timestamp = this.last_stanza_timestamp;
            if (xabber.current_plyr_player && xabber.current_plyr_player.chat_item
                && xabber.current_plyr_player.chat_item.account
                && xabber.current_plyr_player.chat_item.account.get('jid') === this.get('jid')){
                xabber.stopPlyr();
            }
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
                    if (this.connection && this.connection.streamManagement
                        && this.connection.streamManagement._isStreamManagementEnabled
                        && this.connection.streamManagement.getResumeToken()
                        && this.connection.streamManagement._connectionStatus === Strophe.Status.DISCONNECTED){
                        this.connection.streamManagement.resume(() => {
                            this.reconnect()
                        });
                    } else {
                        this.reconnect();
                    }
                }
            }
        },

        connFeedback: function (message) {
            this.session.set("conn_feedback", message);
        },

        enableCarbons: function () {
            let iq = $iq({type: 'set'}).c('enable', {xmlns: Strophe.NS.CARBONS});
            this.sendIQFast(iq);
        },

        getVCard: function (callback) {
            let jid = this.get('jid'),
                is_callback = _.isFunction(callback);
            if (this.connection && this.connection.connected && !this.session.get('auth_failed')) {
                this.getConnectionForIQ().vcard.get(jid,
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
                try {
                    let decoded_raw = atob(from_avatar),
                        bin = Uint8Array.from(Array.prototype.map.call(decoded_raw,function(x) {
                            return x.charCodeAt(0);
                        }));
                    return sha1(bin);
                } catch (e) {
                    console.error(e);
                    return "";
                }
            }
            else
                return "";
        },

        getMessageByStanzaIdInSavedChat: function (stanza_id, callback) {
            let queryid = uuid(),
                account = this,
                is_fast = account.fast_connection && !account.fast_connection.disconnecting && account.fast_connection.authenticated && account.fast_connection.connected && account.get('status') !== 'offline',
                conn = is_fast ? account.fast_connection : account.connection,
                chat = account.chats.getSavedChat(),
                receiver = chat.get('jid'),
                iq = $iq({type: 'set'})
                    .c('query', {xmlns: Strophe.NS.MAM, queryid: queryid})
                    .c('x', {xmlns: Strophe.NS.DATAFORM, type: 'submit'})
                    .c('field', {'var': 'FORM_TYPE', type: 'hidden'})
                    .c('value').t(Strophe.NS.MAM).up().up()
                    .c('field', {'var': 'ids'})
                    .c('value').t(stanza_id).up().up()
                    .c('field', {'var': 'with'})
                    .c('value').t(chat.get('jid')).up().up();
            if (this.server_features.get(Strophe.NS.ARCHIVE))    {
                iq.c('field', {'var': `conversation-type`});
                let sync_type = chat.get('sync_type') ? chat.get('sync_type') : chat.getConversationType(chat);
                iq.c('value').t(sync_type).up().up();
            }
            let handler = conn.addHandler((message) => {
                let $msg = $(message);
                if ($msg.find('result').attr('queryid') === queryid)
                    callback && callback($msg);
                return true;
            }, Strophe.NS.MAM, null, null, null, null, {query_id: queryid} );
            this.sendIQFast(iq, () => {
                    this.connection.deleteHandler(handler);
                }, () => {
                    this.connection.deleteHandler(handler);
                }
            );
        },

        vcardPhotoUpdated: function (photo) {
            let stanza = $pres().c('x', {xmlns: Strophe.NS.VCARD_UPDATE}).c('photo').t(this.getAvatarHash(photo)).up().up();
            return this.sendPres(stanza);
        },

        sendPresence: function (type, message, to) {
            type = type || this.get('status');
            let status_message = message || this.get('status_message'), stanza = $pres();
            to && stanza.attrs({'to': to});
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
            if (type !== 'offline'){
                stanza.cnode(this.connection.caps.createCapsNode({
                    node: 'https://www.xabber.com/clients/xabber/web'
                }).tree());
            }
            return this.sendPres(stanza);
        },

        showSettings: function (right, block_name) {
            this.showSettingsModal(block_name);
        },

        showSettingsModal: function (block_name) {
            if (xabber.accounts.length === 1){
                xabber.body.setScreen('settings-modal', {account_block_name: block_name});
                xabber.trigger('update_placeholder');
                return;
            }
            let has_modal_settings = !_.isUndefined(this.settings_account_modal);
            if (!has_modal_settings)
                this.settings_account_modal = new xabber.AccountSettingsModalView({model: this});
            this.updateColorScheme();
            xabber.body.setScreen('account_settings_modal', {
                account: this, block_name: block_name
            });
            this.trigger('open_settings');
            if (!has_modal_settings) {
                this.trigger('render_settings');
                this.settings_account_modal.addChild('blocklist', xabber.BlockListView, {
                    account: this,
                    el: this.settings_account_modal.$('.block-list-view-wrap')[0]
                });
            }
            this.settings_account_modal.updateHeight();
        },

        updateColorScheme: function () {
            let color = this.settings.get('color');
            this.settings_account_modal && this.settings_account_modal.$el.attr('data-color', color);
        },

        verifyDevices: function (callback, errback) {
            this.settings_account_modal && console.error(this.settings_account_modal.active_trust_session);
            if (!this.omemo || !this.omemo.get('device_id') || !this.server_features.get(Strophe.NS.XABBER_NOTIFY) || (this.settings_account_modal && this.settings_account_modal.active_trust_session))
                return;

            let msg_id = uuid(),
                sid = uuid(),
                stanza = $msg({
                    to: this.get('jid'),
                    from: this.get('jid'),
                    type: 'chat',
                    id: msg_id
                });
            stanza.c('high-priority', {
                xmlns: Strophe.NS.PRIORITY_MESSAGES,
                seconds: 300,
            }).up();
            stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Math.floor(Date.now() / 1000) }).c('verification-start', {'device-id': this.omemo.get('device_id'), 'ttl': 300}).up().up();
            stanza.c('store', {
                xmlns: 'urn:xmpp:hints'
            }).up();
            this.sendFast(stanza, (re) => {
                console.warn(re);
                let peer = this.omemo.getPeer(this.get('jid'));
                peer.updateDevicesKeys();

                this.omemo.xabber_trust.addVerificationSessionData(sid, {
                    verification_started: true,
                    active_verification_device: {
                        peer_jid: this.get('jid'),
                    },
                    verification_step: '1a',
                    session_check_jid: this.get('jid'),
                    msg_ttl: 300,
                    message_timestamp: Math.floor(Date.now() / 1000),
                });
                utils.callback_popup_message(xabber.getString("trust_verification_started"), 5000);
                callback && callback();
            });
        },

        answerPriorityMessage: function (stanza_id) {
            if (!stanza_id)
                return;
            let iq = $iq({
                type: 'set',
                to: this.get('jid'),
                id: uuid(),
            });
            iq.c('query', {
                xmlns: Strophe.NS.PRIORITY_MESSAGES,
                device: this.get('x_token') && this.get('x_token').token_uid ? this.get('x_token').token_uid : '',
            }).c('stanza-id', {
                    xmlns: 'urn:xmpp:sid:0',
                    id: stanza_id,
                    by: this.get('jid'),
                });

            this.sendIQFast(iq, () => {
            })
        },

        revokeXToken: function (token_uid, callback) {
            let iq = $iq({
                type: 'set',
                to: this.get('jid')
            }).c('revoke', {xmlns:Strophe.NS.AUTH_DEVICES});
            for (let token_num = 0; token_num < token_uid.length; token_num++)
                iq.c('device', {id: token_uid[token_num]}).up();
            let token;
            if (this.omemo && this.omemo.xabber_trust && this.x_tokens_list){
                token = this.x_tokens_list.find(token => token.token_uid === token_uid[0]);
                if (!token.omemo_id)
                    token = null;
            }
            this.sendIQFast(iq, () => {
                callback && callback();
                if (token){
                    if (this.omemo.xabber_trust.isDeviceTrusted(this.get('jid'), token.omemo_id)){
                        let removed_device_ids = [token.omemo_id];
                        this.omemo.xabber_trust.findAndMarkRemovedTrustedDevices(removed_device_ids, null, null, Math.floor(Date.now() / 1000))
                    }
                }
            });
        },

        revokeAllXTokens: function (callback, errback) {
            let iq = $iq({
                type: 'set',
                to: this.get('jid')
            }).c('revoke-all', {xmlns:Strophe.NS.AUTH_DEVICES});
            this.sendIQFast(iq, (success) => {
                    callback && callback(success);
                    if (this.omemo && this.omemo.xabber_trust && this.x_tokens_list) {
                        this.omemo.xabber_trust.findAndMarkAllOwnTrustedDevices(Math.floor(Date.now() / 1000));
                    }
                },
                function (error) {
                    errback && errback(error);
                });
        },

        deleteAccount: function (show_settings, dont_change_screen, already_removed){
            let account_deletion_dfd = new $.Deferred();
            account_deletion_dfd.done(() => {
                this.show_settings_after_delete = show_settings;
                this.dont_change_screen_after_delete = dont_change_screen;
                let screen = xabber.body.screen;
                if (screen.get('account') && screen.get('account') === this && screen.get('name') === 'account_settings_modal')
                    this.show_settings_after_delete = true;
                if (this.get('x_token') && !already_removed)
                    this.revokeXToken([this.get('x_token').token_uid]);
                this.session.set('delete', true);
                this.deactivate();
            });
            if (this.omemo && this.omemo.xabber_trust && this.x_tokens_list && !this.session.get('on_token_revoked') && !already_removed){
                let removed_device_ids = [`${this.omemo.get('device_id')}`];
                this.omemo.xabber_trust.findAndMarkRemovedTrustedDevices(removed_device_ids, null, () => {
                    if (this.omemo)
                        this.omemo.destroy();
                    account_deletion_dfd.resolve()
                }, Math.floor(Date.now() / 1000))
            } else {
                account_deletion_dfd.resolve()
            }
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
            } else {
                if (this.session.get('no_reconnect') && this.session.get('auth_failed'))
                    this.connection.disconnect();
                this.onDisconnected();
            }
        },

        onDestroy: function () {
            if (this.connection && !this.connection.register._registering)
                this.connection.connect_callback = null;
            if (this.omemo){
                this.omemo.destroy();
                this.omemo = undefined;
            }
            if (this.groups_settings){
                this.groups_settings.clearStorage();
            }
            if (this.groupchat_settings){
                this.groupchat_settings.destroy();
                this.groupchat_settings = undefined;
            }
            if (this.chat_settings){
                this.chat_settings.destroy();
                this.chat_settings = undefined;
            }
            if (this.settings)
                this.settings.destroy();
            if (this.isConnected()) {
                this.connection.disconnect();
                if (this.fast_conn_manager) this.fast_connection.disconnect();
            }
            this.cached_sync_conversations && this.cached_sync_conversations.deleteDataBase();
            this.cached_notifications && this.cached_notifications.deleteDataBase();
            this.cached_calls && this.cached_calls.deleteDataBase();
            this.cached_roster && this.cached_roster.deleteDataBase();
            this.cached_server_features && this.cached_server_features.deleteDataBase();
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

        onSetIQResult: function (iq) {
            let to = $(iq).attr('to');
            if (this.connection && this.connection.jid === to && this.connection.authenticated
                && !this.connection.disconnecting && this.session.get('connected') && this.get('status') !== 'offline') {
                this.sendIQ($iq({
                    type: 'result', id: iq.getAttribute('id'),
                }));
            }
        },

        onSyncedIQ: function (iq) {
            this.onSetIQResult(iq);
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
                if (this.get('gallery_auth_request_code') && this.get('gallery_auth_request_code') == $incoming_iq.attr('id')) {
                    this.onAuthCode(request_code)
                } else if (this.get('service_auth_request_code') && this.get('service_auth_request_code') == $incoming_iq.attr('id')) {
                    this.onServiceAuthCode(request_code);
                } else if (this.get('proxy_viewer_auth_request_code') && this.get('proxy_viewer_auth_request_code') == $incoming_iq.attr('id')) {
                    this.onProxyViewerAuthCode(request_code)
                } else {
                    this.gallery_code_requests.push({
                        id: $incoming_iq.attr('id'),
                        code: request_code
                    });
                    this.proxy_code_requests.push({
                        id: $incoming_iq.attr('id'),
                        code: request_code
                    });
                }
            }
            if ($session_availability.length) {
                let session_id = $session_availability.children('session').attr('id'), $session_availability_response;
                if (session_id && xabber.current_voip_call && session_id === xabber.current_voip_call.get('session_id') && !xabber.current_voip_call.get('state')) {
                    $session_availability_response = $iq({to: from_jid, type: 'result', id: $incoming_iq.attr('id')})
                        .c('query', {xmlns: Strophe.NS.JINGLE_MSG})
                        .c('session', {id: session_id});
                    xabber.current_voip_call.updateStatus(xabber.getString("dialog_jingle_message__status_calling"));
                }
                else {
                    $session_availability_response = $iq({to: from_jid, type: 'error', id: $incoming_iq.attr('id')})
                        .c('error', {xmlns: Strophe.NS.JINGLE_MSG});

                }
                this.sendIQFast($session_availability_response);
            }
        },

        testGalleryTokenExpire: function(callback, errback) {
            let currentTime = new Date(),
                tokenExpireTime = new Date(this.get('gallery_token_expires'));
            if (this.get('gallery_auth')){
                this.once('gallery_token_authenticated', callback)
            }
            else if (currentTime < tokenExpireTime){
                callback && callback();
            }
            else if (this.server_features.get('media-gallery')){
                this.initGalleryAuth(this.server_features.get('media-gallery'), errback);
                this.once('gallery_token_authenticated', callback)
            }
            else if (!this.server_features.get('media-gallery')){
                this.set('gallery_url', undefined);
                this.set('gallery_token', undefined);
                this.set('gallery_token_expires', undefined);
                callback && callback();
            }
        },

        testProxyViewerExpire: function(callback, errback) {
            let currentTime = new Date(),
                tokenExpireTime = new Date(this.get('proxy_viewer_token_expires'));
            if (this.get('proxy_viewer_auth')){
                this.once('proxy_viewer_token_authenticated', callback)
            }
            else if (currentTime < tokenExpireTime){
                callback && callback();
            }
            else if (this.get('proxy_viewer_url')){
                this.initProxyViewerAuth(this.server_features.get('proxy-viewer'), errback);
                this.once('proxy_viewer_token_authenticated', callback)
            }
            else if (!this.server_features.get('proxy-viewer')){
            }
        },

        testXabberServiceTokenExpire: function(callback, errback) {
            let currentTime = new Date(),
                tokenExpireTime = new Date(this.get('service_token_expires'));
            if (this.get('service_auth')){
                this.once('service_token_authenticated', callback)
            }
            else if (currentTime < tokenExpireTime){
                callback && callback();
            }
            else if (constants.XABBER_SERVICE_IFRAME_URL){
                this.initServiceAuth(errback);
                this.once('service_token_authenticated', callback)
            }
            else {
                this.set('service_url', undefined);
                this.set('service_token', undefined);
                this.set('service_token_expires', undefined);
                callback && callback();
            }
        },

        testGalleryFileSlot: function(file, callback) {
            if (this.get('gallery_token') && this.get('gallery_url')){
                let reader = new FileReader();
                reader.onloadend = () => {
                    let b64 = reader.result.split('base64,'),
                        binary_file = atob(b64[1]),
                        bytes = new Uint8Array(binary_file.length);
                    for (let i = 0; i < binary_file.length; i++)
                        bytes[i] = binary_file.charCodeAt(i);
                    $.ajax({
                        type: 'GET',
                        headers: {"Authorization": 'Bearer ' + this.get('gallery_token')},
                        url: this.get('gallery_url') + 'v1/files/slot/',
                        dataType: 'json',
                        contentType: "application/json",
                        data: {size: file.size, name: file.name, hash: sha1(bytes)},
                        success: (response) => {
                            console.log(response);
                            callback && callback(response);
                        },
                        error: (response) => {
                            console.log(response);
                            callback && callback(response.responseJSON);
                        }
                    });
                };
                reader.onerror = () => {
                    console.log(reader.error);
                    callback && callback(false)
                };
                reader.readAsDataURL(file);
            }
        },

        initServiceAuth: function(errback) {
            let service_url = constants.XABBER_SERVICE_URL;
            if (service_url && !this.get('service_auth')) {
                this.set('service_token', undefined);
                this.set('service_token_expires', undefined);
                this.set('service_auth', true);
                this.service_iq_answered = false;
                $.ajax({
                    type: 'POST',
                    url: service_url + 'xmpp_auth/code_request/',
                    dataType: 'json',
                    contentType: "application/json",
                    data: JSON.stringify({jid: this.jid, type: "iq"}),
                    success: (response) => {
                        if (response.request_id){
                            this.set('service_auth_request_code', response.request_id);
                            if (this.gallery_code_requests.length){
                                let verifying_code = this.gallery_code_requests.find(verifying_mess => (verifying_mess.id === this.get('service_auth_request_code')));
                                if (verifying_code && verifying_code.code)
                                    this.onServiceAuthCode(verifying_code.code)
                            }
                            setTimeout(() => {
                                if (!this.service_iq_answered){
                                    this.save('service_auth', false);
                                    this.gallery_code_requests = [];
                                    errback && errback();
                                }
                            }, 5000)
                        }
                    },
                    error: (response) => {
                        console.error(response);
                        this.save('service_auth', false);
                        this.gallery_code_requests = [];
                        errback && errback();
                    }
                });
            }
        },

        initGalleryAuth: function(gallery_feature, errback) {
            this.set('gallery_url', gallery_feature.get('from'));
            if (this.get('gallery_url') && !this.get('gallery_auth')) {
                this.set('gallery_token', undefined);
                this.set('gallery_token_expires', undefined);
                this.set('gallery_auth', true);
                this.gallery_iq_answered = false;
                $.ajax({
                    type: 'POST',
                    url: this.get('gallery_url') + 'v1/account/xmpp_code_request/',
                    dataType: 'json',
                    contentType: "application/json",
                    data: JSON.stringify({jid: this.jid, type: "iq"}),
                    success: (response) => {
                        if (response.request_id){
                            this.set('gallery_auth_request_code', response.request_id);
                            this.gallery_auth_errback = errback;
                            if (this.gallery_code_requests.length){
                                let verifying_code = this.gallery_code_requests.find(verifying_mess => (verifying_mess.id === this.get('gallery_auth_request_code')));
                                if (verifying_code && verifying_code.code)
                                    this.onAuthCode(verifying_code.code)
                            }
                            setTimeout(() => {
                                if (!this.gallery_iq_answered)
                                    this.handleCommonGalleryErrors({status: 500}, errback)
                            }, 5000)
                        }
                    },
                    error: (response) => {
                        this.handleCommonGalleryErrors(response, errback);
                        this.set('gallery_auth', false);
                        this.gallery_code_requests = [];
                        console.log(response)
                    }
                });
            }
        },

        initProxyViewerAuth: function(proxy_viewer_feature, errback) {
            proxy_viewer_feature && this.save('proxy_viewer_url', proxy_viewer_feature.get('from'));
            if (this.get('proxy_viewer_url') && !this.get('proxy_viewer_auth')) {
                this.set('proxy_viewer_token', undefined);
                this.set('proxy_viewer_token_expires', undefined);
                this.set('proxy_viewer_auth', true);
                this.proxy_viewer_iq_answered = false;
                $.ajax({
                    type: 'POST',
                    url: this.get('proxy_viewer_url') + 'xmpp_auth/code_request/',
                    dataType: 'json',
                    contentType: "application/json",
                    data: JSON.stringify({jid: this.jid, type: "iq"}),
                    success: (response) => {
                        if (response.request_id){
                            this.set('proxy_viewer_auth_request_code', response.request_id);
                            this.proxy_viewer_auth_errback = errback;
                            if (this.proxy_code_requests.length){
                                let verifying_code = this.proxy_code_requests.find(verifying_mess => (verifying_mess.id === this.get('proxy_viewer_auth_request_code')));
                                if (verifying_code && verifying_code.code)
                                    this.onProxyViewerAuthCode(verifying_code.code)
                            }
                            setTimeout(() => {
                                if (!this.proxy_viewer_iq_answered)
                                    this.handleCommonProxyViewerErrors({status: 500}, errback)
                            }, 5000)
                        }
                    },
                    error: (response) => {
                        this.handleCommonProxyViewerErrors(response, errback);
                        this.set('proxy_viewer_auth', false);
                        this.proxy_code_requests = [];
                        console.log(response)
                    }
                });
            }
        },

        onAuthCode: function (confirm_code) {
            this.gallery_code_requests = [];
            this.set('gallery_auth_request_code', undefined);
            if (confirm_code) {
                this.gallery_iq_answered = true;
                $.ajax({
                    type: 'POST',
                    url: this.get('gallery_url') + 'v1/account/xmpp_auth/',
                    dataType: 'json',
                    contentType: "application/json",
                    data: JSON.stringify({jid: this.id, code: confirm_code}),
                    success: (response) => {
                        if (response.token)
                            this.set('gallery_token', response.token);
                        if (response.expires)
                            this.set('gallery_token_expires', response.expires);
                        this.trigger('gallery_token_authenticated');
                        this.set('gallery_auth', false)
                    },
                    error: (response) => {
                        this.set('gallery_auth', false);
                        this.handleCommonGalleryErrors(response);
                        console.log(response)
                    }
                });
            }
        },

        onProxyViewerAuthCode: function (confirm_code) {
            this.proxy_viewer_code_requests = [];
            this.set('proxy_viewer_auth_request_code', undefined);
            if (confirm_code) {
                this.proxy_viewer_iq_answered = true;
                $.ajax({
                    type: 'POST',
                    url: this.get('proxy_viewer_url') + 'xmpp_auth/confirm/',
                    dataType: 'json',
                    contentType: "application/json",
                    data: JSON.stringify({jid: this.id, code: confirm_code}),
                    success: (response) => {
                        if (response.token)
                            this.set('proxy_viewer_token', response.token);
                        if (response.expires) {
                            let normalizedString = response.expires.replace(/\+00:00Z$/, "Z");
                            this.save('proxy_viewer_token_expires', normalizedString);
                        }
                        this.trigger('proxy_viewer_token_authenticated');
                        this.set('proxy_viewer_auth', false)
                    },
                    error: (response) => {
                        this.set('proxy_viewer_auth', false);
                        this.handleCommonProxyViewerErrors(response);
                        console.log(response)
                    }
                });
            }
        },

        onServiceAuthCode: function (confirm_code) {
            this.gallery_code_requests = [];
            this.set('service_auth_request_code', undefined);
            let service_url = constants.XABBER_SERVICE_URL;
            if (service_url && confirm_code) {
                this.service_iq_answered = true;
                $.ajax({
                    type: 'POST',
                    url: service_url + 'xmpp_auth/confirm/',
                    dataType: 'json',
                    contentType: "application/json",
                    data: JSON.stringify({jid: this.id, code: confirm_code}),
                    success: (response) => {
                        if (response.token)
                            this.set('service_token', response.token);
                        if (response.expires) {
                            let normalizedString = response.expires.replace(/\+00:00Z$/, "Z");
                            this.set('service_token_expires', normalizedString);
                        }
                        this.trigger('service_token_authenticated');
                        this.save('service_auth', false)
                    },
                    error: (response) => {
                        this.save('service_auth', false);
                        console.log(response)
                    }
                });
            }
        },

        handleCommonGalleryErrors: function (response, errback, original_function, args, context) {
            !errback && (errback = this.gallery_auth_errback);
            this.gallery_auth_errback = undefined;
            let err_text;
            response && response.responseJSON && response.responseJSON.error && (err_text = response.responseJSON.error);
            if (response.status === 401){
                if (this.server_features.get('media-gallery')){
                    if (original_function && args && context){
                        this.once('gallery_token_authenticated', () => { setTimeout(()=>{original_function.apply(context, args)},100) });
                    }
                    this.initGalleryAuth(this.server_features.get('media-gallery'), errback);
                } else {
                    this.set('gallery_url', null);
                    this.set('gallery_token', null);
                    errback && errback('No Media Gallery server feature');
                }
            } else if (response.status === 500) {
                this.set('gallery_url', null);
                this.set('gallery_token', null);
                errback && errback(xabber.getString("media_gallery_server_error"));
            } else {
                errback && errback('Media Gallery error - ' + (err_text || response.status));
            }
        },

        handleCommonProxyViewerErrors: function (response, errback, original_function, args, context) {
            !errback && (errback = this.proxy_viewer_auth_errback);
            this.proxy_viewer_auth_errback = undefined;
            let err_text;
            response && response.responseJSON && response.responseJSON.error && (err_text = response.responseJSON.error);
            if (response.status === 401){
                if (this.server_features.get('proxy-viewer')){
                    if (original_function && args && context){
                        this.once('proxy_viewer_token_authenticated', () => { setTimeout(()=>{original_function.apply(context, args)},100) });
                    }
                    this.initProxyViewerAuth(this.server_features.get('proxy-viewer'), errback);
                } else {
                    this.save('proxy_viewer_url', null);
                    this.set('proxy_viewer_token', null);
                    errback && errback('No Proxy Viewer server feature');
                }
            } else if (response.status === 500) {
                this.save('proxy_viewer_url', null);
                this.set('proxy_viewer_token', null);
                errback && errback(xabber.getString("proxy_viewer_server_error"));
            } else {
                errback && errback('Proxy Viewer error - ' + (err_text || response.status));
            }
        },

        getStorageStats: function (params, callback) {
            this.testGalleryTokenExpire(() => {
                params && (params = {});
                if (this.get('gallery_token') && this.get('gallery_url'))
                    $.ajax({
                        type: 'GET',
                        headers: {"Authorization": 'Bearer ' + this.get('gallery_token')},
                        url: this.get('gallery_url') + 'v1/files/stats/',
                        dataType: 'json',
                        contentType: "application/json",
                        data: params,
                        success: (response) => {
                            callback && callback(response)
                        },
                        error: (response) => {
                            this.handleCommonGalleryErrors(response, null, this.getStorageStats, arguments, this);
                            console.log(response)
                        }
                    });
            });
        },

        testFile: function (params, file, callback) {
            this.testGalleryTokenExpire(() => {
                if (this.get('gallery_token') && this.get('gallery_url'))
                    $.ajax({
                        type: 'GET',
                        headers: {"Authorization": 'Bearer ' + this.get('gallery_token')},
                        url: this.get('gallery_url') + 'v1/files/slot/',
                        dataType: 'json',
                        contentType: "application/json",
                        data: params,
                        success: () => {
                            this.uploadFile(file , callback);
                        },
                        error: (response) => {
                            this.handleCommonGalleryErrors(response);
                            console.log(response);
                        }
                    });

            });
        },

        getProxyUrl: function (original_url, callback, errback, is_whole_url) {
            let is_proxy_enabled = this && this.get('proxy_viewer_url') && this.get('proxy_viewer_token');
            if (is_proxy_enabled){
                xabber.cached_proxy_urls.getFromCachedProxyUrls(original_url, (res) => {
                   if (res && !(res.error === 0)){
                       if (res.proxy_url){
                           callback && callback({url: res.proxy_url})
                       } else {
                           console.error(original_url);
                           console.error(res);
                           errback && errback({status: res.error})
                       }
                   } else {
                       let url = is_whole_url ? original_url :`${this.get('proxy_viewer_url')}proxy/geturl/?url=${original_url}`;
                       this.testProxyViewerExpire(() => {
                           $.ajax({
                               type: 'GET',
                               url: url,
                               dataType: 'json',
                               contentType: "application/json",
                               headers: {"Authorization": 'Bearer ' + this.get('proxy_viewer_token')},
                               success: (response) => {
                                   xabber.cached_proxy_urls.putInCachedProxyUrls({
                                       original_url: original_url,
                                       proxy_url: response.url,
                                       error: !response.url,
                                   }, () => {
                                       callback && callback(response)
                                   });
                               },
                               error: (response) => {
                                   console.error(response);
                                   if (response.status === 404)
                                       xabber.cached_proxy_urls.putInCachedProxyUrls({
                                           original_url: original_url,
                                           error: response.status,
                                       }, () => {
                                           errback && errback(response)
                                       });
                               }
                           });
                       }, (err) => {
                           console.error(err);
                           errback && errback(err)
                       })
                   }
                });
            } else {
                console.error('noproxy');
                this.test_images && console.error(this.get('proxy_viewer_url'));
                this.test_images && console.error(this.get('proxy_viewer_token'));
            }
        },

        uploadFile: function (file, callback, errback) {
            this.testGalleryTokenExpire(() => {
                if (this.get('gallery_token') && this.get('gallery_url')) {
                    let formData = new FormData(),
                        metadata = {};
                    file.duration && (metadata.duration = file.duration);
                    formData.append('file', file, file.name);
                    if (file.size)
                        formData.append('size', file.size);
                    if (file.voice){
                        formData.append('media_type', file.type + '+voice');
                        formData.append('context', 'voice');
                        file.peaks && (metadata.meters = file.peaks);
                    }
                    else
                        formData.append('media_type', file.type);
                    formData.append('metadata', JSON.stringify(metadata));
                    $.ajax({
                        type: 'POST',
                        headers: {"Authorization": 'Bearer ' + this.get('gallery_token')},
                        url: this.get('gallery_url') + 'v1/files/upload/',
                        data: formData,
                        contentType: false,
                        processData: false,
                        success: (response) => {
                            console.log(response);
                            callback && callback(response);
                        },
                        error: (response) => {
                            this.handleCommonGalleryErrors(response, null, this.uploadFile, arguments, this);
                            console.log(response);
                            errback && errback(response);
                        }
                    });
                }
            });
        },

        uploadAvatar: function (file, callback, errback) {
            this.testGalleryTokenExpire(() => {
                if (this.get('gallery_token') && this.get('gallery_url')) {
                    if (!file)
                        errback && errback('no file');
                    let formData = new FormData();
                    formData.append('file', file, file.name);
                    formData.append('media_type', file.type);
                    formData.append('context', 'avatar');
                    $.ajax({
                        type: 'POST',
                        headers: {"Authorization": 'Bearer ' + this.get('gallery_token')},
                        url: this.get('gallery_url') + 'v1/files/upload/',
                        data: formData,
                        contentType: false,
                        processData: false,
                        success: (response) => {
                            console.log(response);
                            callback && callback(response)
                        },
                        error: (response) => {
                            this.handleCommonGalleryErrors(response, null, this.uploadAvatar, arguments, this);
                            console.log(response);
                            errback && errback(response)
                        }
                    });
                }
            });
        },

        deleteFile: function (file_id, callback, errback) {
            this.testGalleryTokenExpire(() => {
                if (this.get('gallery_token') && this.get('gallery_url') && file_id){
                    let options = {id: file_id, contexts: ['file', 'voice']};
                    $.ajax({
                        type: 'DELETE',
                        headers: {"Authorization": 'Bearer ' + this.get('gallery_token')},
                        url: this.get('gallery_url') + 'v1/files/',
                        dataType: 'json',
                        contentType: "application/json",
                        data: JSON.stringify(options),
                        success: (response) => {
                            console.log(response);
                            callback && callback(response)
                        },
                        error: (response) => {
                            this.handleCommonGalleryErrors(response, null, this.deleteFile, arguments, this);
                            console.log(response);
                            errback && errback(response)
                        }
                    });
                }
            });
        },

        deleteFileByUrl: function (file_url, callback, errback) {
            this.testGalleryTokenExpire(() => {
                if (this.get('gallery_token') && this.get('gallery_url') && file_url){
                    let options = {file: file_url, contexts: ['file', 'voice']};
                    $.ajax({
                        type: 'DELETE',
                        headers: {"Authorization": 'Bearer ' + this.get('gallery_token')},
                        url: this.get('gallery_url') + 'v1/files/',
                        dataType: 'json',
                        contentType: "application/json",
                        data: JSON.stringify(options),
                        success: (response) => {
                            console.log(response);
                            callback && callback(response)
                        },
                        error: (response) => {
                            this.handleCommonGalleryErrors(response, null, this.deleteFileByUrl, arguments, this);
                            console.log(response);
                            errback && errback(response)
                        }
                    });
                }
            });
        },

        getOpenGraphData: function (url, callback, errback) {
            this.testGalleryTokenExpire(() => {
                if (this.get('gallery_token') && this.get('gallery_url'))
                    $.ajax({
                        type: 'POST',
                        headers: {"Authorization": 'Bearer ' + this.get('gallery_token'), "Content-Type": "application/json"},
                        url: this.get('gallery_url') + 'v1/opengraph/',
                        dataType: 'json',
                        contentType: "application/json",
                        data: JSON.stringify({url: url}),
                        success: (response) => {
                            response.site = $(response.ogp).closest('meta[property="og:site_name"]').attr('content');
                            response.type = $(response.ogp).closest('meta[property="og:type"]').attr('content');
                            response.url = $(response.ogp).closest('meta[property="og:url"]').attr('content');
                            response.description = $(response.ogp).closest('meta[property="og:description"]').attr('content');
                            response.title = $(response.ogp).closest('meta[property="og:title"]').attr('content');
                            response.image = $(response.ogp).closest('meta[property="og:image"]').attr('content');
                            response.image_height = $(response.ogp).closest('meta[property="og:image:height"]').attr('content');
                            response.image_width = $(response.ogp).closest('meta[property="og:image:width"]').attr('content');
                            response.video_url = $(response.ogp).closest('meta[property="og:video:url"]').attr('content');
                            console.log(response);
                            callback && callback(response)
                        },
                        error: (response) => {
                            this.handleCommonGalleryErrors(response, null, this.getOpenGraphData, arguments, this);
                            errback && errback(response);
                            console.log(response)
                        }
                    });
            });
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
            }
            let resource = Strophe.getResourceFromJid(jid),
                priority = Number($presence.find('priority').text()),
                status = $presence.find('show').text() || 'online',
                status_message = $presence.find('status').text();
            _.isNaN(priority) && (priority = 0);
            let $vcard_update = $presence.find(`x[xmlns="${Strophe.NS.VCARD_UPDATE}"]`);
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
                        this.resources.create(attrs);
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

        addFastConnPlugin: function (func, conn, reconn) {
        }
    });

xabber.Accounts = Backbone.CollectionWithStorage.extend({
    model: xabber.Account,
    comparator: function (acc1, acc2) {
        return acc1.settings.get('order') < acc2.settings.get('order') ? -1 : 1;
    },

    _initialize: function () {
        this.settings_list = xabber.account_settings_list;
        this.getEnabledList();
        this.getConnectedList();
        this.on("add", this.onAdd, this);
        this.on("destroy", this.onDestroy, this);
        this.on("change:enabled", this.getEnabledList, this);
        this.on("change:omemo_enabled", this.onOmemoChanged, this);
        this.on("update_order", this.onUpdatedOrder, this);
        this.on("add destroy activate deactivate", this.onListChanged, this);
        this.on("destroy deactivate", this.onAccountDisconnected, this);
        xabber.on("quit", this.onQuit, this);
        xabber.on("quit_accounts", this.onQuitAccounts, this);
        this.settings_list.on("add_settings", this.onSettingsAdded, this);
    },

    onQuit: function () {
        _.each(_.clone(this.models), function (account) {

            if (!account.get('enabled')){
                account._revoke_on_connect = $.Deferred();
                let revoke_timeout = setTimeout(() => {
                    if (account.omemo)
                        account.omemo.destroy();
                    account._revoke_on_connect.resolve();
                }, 5000);
                account._revoke_on_connect.done(() => {
                    clearTimeout(revoke_timeout);
                    account._revoke_on_connect = undefined;
                    account.deleteAccount(true);
                    account.password_view.closeModal();
                    utils.modals.clear_queue();
                });
                account.save('enabled', true);
                account.activate();
            } else {
                account.deleteAccount(true);
                account.password_view.closeModal();
                utils.modals.clear_queue();
            }
        });
        !this.models.length && xabber.body.setScreen('login', {chat_item: null});
    },

    onQuitAccounts: function () {
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
        this.trigger('connected_list_changed');
        this.connected = this.filter(account => account.isConnected());
    },

    onListChanged: function () {
        this.getEnabledList();
        this.getConnectedList();
        this.trigger('list_changed', this);
    },

    onOmemoChanged: function (account) {
        this.trigger('omemo_changed', account);
    },

    onAdd: function (account) {
        if (account.is_invalid)
            account.destroy();
    },

    onDestroy: function (account) {
        if (!account.get('is_new')) {
            let no_accounts = !(this.length);
            if (no_accounts) {
                xabber.body.setScreen('login');
                xabber.clearSettingsStorage();
            } else if (account.show_settings_after_delete) {
                xabber.body.setScreen('settings-modal', {account_block_name: null, block_name: null});
            } else if (account.dont_change_screen_after_delete) {
            } else {
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
    }
});

xabber.AccountToolbarItemView = xabber.BasicView.extend({
    className: 'toolbar-item account-item',
    template: templates.toolbar_item,
    avatar_size: constants.AVATAR_SIZES.TOOLBAR_ACCOUNT_ITEM,

    events: {
        'click .filter-chats': 'filterChats',
        'click .account-item-avatar-wrap': 'showSettings'
    },

    _initialize: function () {
        this.updateConnected();
        this.updateAuthState();
        this.updateStatus();
        this.updateAvatar();
        this.updateColorScheme();
        this.$el.attr('data-jid', this.model.get('jid'));
        this.listenTo(this.model.session, 'change:auth_failed', this.updateAuthState);
        this.listenTo(this.model.session, 'change:connected', this.updateConnected);
        this.listenTo(this.model, 'change:status', this.updateStatus);
        this.listenTo(this.model, 'change:image', this.updateAvatar);
        this.listenTo(this.model, 'change:enabled', this.updateEncryptionWarning);
        this.listenTo(this.model, 'trusting_updated', this.updateEncryptionWarning);
        this.listenTo(this.model.settings, 'change:color', this.updateColorScheme);
        this.listenTo(this.model.resources, 'change', this.updateEncryptionWarning);
        this.listenTo(this.model.resources, 'add', this.updateEncryptionWarning);
        this.listenTo(this.model.resources, 'destroy', this.updateEncryptionWarning);
    },

    updateConnected: function () {
        this.$el.switchClass('disconnected', !this.model.isConnected());
        xabber.updateFaviconConnected();
    },

    updateEncryptionWarning: function () {
        if (this.model.get('status') !== 'online') {
            this.$('.encryption-warning-icon').addClass('hidden');
            this.$('.status').removeClass('hidden');
            return;
        }
        if (!this.model.get('enabled')) {
            this.$('.encryption-warning-icon').addClass('hidden');
            this.$('.status').removeClass('hidden');
            this.omemo_new_device_placeholder && this.omemo_new_device_placeholder.close();
            return;
        }
        if (!this.model || !this.model.omemo){
            this.omemo_new_device_placeholder && this.omemo_new_device_placeholder.close();
            return;
        }
        this.model.omemo.checkOwnFingerprints().then((is_trusted) => {
            if (is_trusted === 'none' || is_trusted === 'error') {
                this.$('.encryption-warning-icon').removeClass('hidden');
                this.$('.status').addClass('hidden');
                if (!this.omemo_new_device_placeholder) {
                    this.omemo_new_device_placeholder = new xabber.OMEMONewDevicePlaceholder({account: this.model});
                }
                this.omemo_new_device_placeholder.showPlaceholder();
            } else {
                this.$('.encryption-warning-icon').addClass('hidden');
                this.$('.status').removeClass('hidden');
                if (!this.omemo_new_device_placeholder) {
                    this.omemo_new_device_placeholder = new xabber.OMEMONewDevicePlaceholder({account: this.model});
                }
                this.omemo_new_device_placeholder.close();
            }
        });
    },

    updateAuthState: function () {
        let auth_failed = this.model.session.get('auth_failed');
        xabber.updateFaviconConnected();
        this.$('.status').hideIf(auth_failed);
        this.$('.auth-failed').showIf(auth_failed);
    },

    updateStatus: function () {
        if (this.model.get('status') !== 'online'){
            this.$('.encryption-warning-icon').addClass('hidden');
            this.$('.status').removeClass('hidden');
        }
        this.$('.status').attr('data-status', this.model.get('status'));
    },

    updateAvatar: function () {
        let image = this.model.cached_image;
        this.$('.circle-avatar').setAvatar(image, this.avatar_size, this.model);
    },

    updateColorScheme: function () {
        this.$el.attr('data-color', this.model.settings.get('color'));
    },

    filterChats: function (ev) {
        ev.stopPropagation();
        let is_single = $(ev.target).closest('.single-item').length;
        if (is_single){
            xabber.body.setScreen('settings-modal', {account_block_name: null, block_name: null});
            xabber.trigger('update_placeholder');
            return;
        }
        xabber.toolbar_view.$('.toolbar-item.account-item').removeClass('active');
        if (xabber.toolbar_view.data.get('account_filtering') !== this.model.get('jid'))
            this.$el.addClass('active');
        xabber.toolbar_view.showChatsByAccount(this.model);
    },

    showSettings: function () {
        xabber.body.setScreen('settings-modal', {account_block_name: null, block_name: null});
        xabber.trigger('update_placeholder');
    },
});

xabber.OMEMONewDevicePlaceholder = xabber.BasicView.extend({
    className: 'omemo-new-device-placeholder desktop-notification-item',

    events: {
        'click .btn-verify-devices': 'verifyDevices',
        'click .btn-manage-devices': 'openDevicesWindow',
        'click .btn-show-code': 'showCode',
        'click .btn-enter-code': 'showCode',
        'click .btn-accept-session': 'acceptRequest',
        'click .btn-decline-session': 'rejectRequest',
    },

    _initialize: function (options) {
        this.account = options.account;
        this.updateColorScheme();
        this.onActiveSessionChange();
        this.$el.html(env.templates.base.omemo_new_device({text: xabber.getString("desktop_notifications__enable_encryption"), jid: this.account.get('jid')}));
        this.listenTo(xabber, 'update_screen', this.onUpdatedScreen);
        this.listenTo(this.account.settings, 'change:color', this.updateColorScheme);
        this.listenTo(this.account, 'active_session_change', this.onActiveSessionChange);
    },

    showPlaceholder: function () {
        this.data.set('shown', true);
        this.onActiveSessionChange();
        xabber.bottom_placeholders_wrap.$el.append(this.$el);
        xabber.main_panel.$el.css('padding-bottom', xabber.bottom_placeholders_wrap.$el.height());
    },

    updateColorScheme: function () {
        let color = this.account.settings.get('color');
        this.$el.attr('data-color', color);
    },

    onUpdatedScreen: function () {
        if (!this.account.omemo) {
            this.close();
            return;
        }
        if (this.data.get('shown')){
            xabber.bottom_placeholders_wrap.$el.append(this.$el);
            xabber.main_panel.$el.css('padding-bottom', xabber.bottom_placeholders_wrap.$el.height());
        }
    },

    verifyDevices: function () {
        this.account.verifyDevices();
    },

    openDevicesWindow: function () {
        this.account.showSettings(null, 'devices');
    },

    onActiveSessionChange: function () {
        if (!this.account.omemo)
            return;

        this.$el.attr('data-sid', '');
        this.$('.btn-verify-devices').removeClass('hidden');
        this.$('.btn-active-session').addClass('hidden');
        this.$('.msg-text-content').text(xabber.getString("omemo_unverified_device_placeholder_text"));
        let active_sessions = this.account.omemo.xabber_trust.get('active_trust_sessions');

        Object.keys(active_sessions).forEach((session_id) => {
            let session = active_sessions[session_id];
            if ((session.active_verification_device && session.active_verification_device.peer_jid === this.account.get('jid')) || session.session_check_jid === this.account.get('jid')){
                this.$('.btn-verify-devices').addClass('hidden');
                this.$el.attr('data-sid', session_id);
                if (session.verification_step === '1a' && !session.verification_accepted_msg_xml) {
                    this.$('.msg-text-content').text(xabber.getString("omemo_unverified_device_placeholder_text__active_session_request_sent"));
                } else if (session.active_verification_code){
                    this.$('.msg-text-content').text(xabber.getString("omemo_unverified_device_placeholder_text__active_session_show_code"));
                    this.$('.btn-show-code').removeClass('hidden');
                } else if(session.verification_step === '1a' && session.verification_accepted_msg_xml) {
                    this.$('.msg-text-content').text(xabber.getString("omemo_unverified_device_placeholder_text__active_session_enter_code"));
                    this.$('.btn-enter-code').removeClass('hidden');
                } else if(session.verification_step === '0b') {
                    this.$('.msg-text-content').text(xabber.getString("omemo_unverified_device_placeholder_text__active_session_incoming_request"));
                    this.$('.btn-accept-session').removeClass('hidden');
                    this.$('.btn-decline-session').removeClass('hidden');
                }
            }
        });
    },

    showCode: function () {
        if (!this.account || !this.account.omemo)
            return;
        if (this.$el.attr('data-sid')){
            if (!$('#modals').find('.code-modal').length){
                let view = new xabber.ActiveSessionModalView();
                view.show({
                    account: this.account,
                    sid: this.$el.attr('data-sid')
                });
            }
        }
    },

    acceptRequest: function () {
        if (!this.account.omemo.xabber_trust)
            return;
        let active_sessions = this.account.omemo.xabber_trust.get('active_trust_sessions'),
            sid = this.$el.attr('data-sid'), session;

        session = active_sessions[sid];
        if (!session)
            return;

        let message = session.incoming_request_data.message,
            message_options = session.incoming_request_data.message_options;
        message_options.automated = false;
        this.account.omemo.xabber_trust.receiveTrustVerificationMessage(message, message_options);
        this.showCode();

    },

    rejectRequest: function () {
        if (!this.account.omemo.xabber_trust)
            return;

        let sid = this.$el.attr('data-sid');

        let msg_id = uuid(),
            to = this.account.get('jid'),
            stanza = $msg({
                type: 'chat',
                to: to,
                id: msg_id,
                from: this.account.get('jid'),
            });
        stanza.c('high-priority', {
            xmlns: Strophe.NS.PRIORITY_MESSAGES,
        }).up();
        stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Math.floor(Date.now() / 1000)});
        stanza.c('verification-rejected', {reason: 'Session cancelled'}).up().up();
        stanza.c('store', {
            xmlns: 'urn:xmpp:hints'
        }).up();

        this.account.sendFast(stanza, () => {
            utils.callback_popup_message(xabber.getString("trust_verification_decrypt_failed"), 5000);
        });
        this.account.omemo.xabber_trust.clearData(sid);

    },

    closeOmemoPlaceholder: function () {
        this.data.set('hidden', true);
        this.close();
    },

    close: function () {
        this.data.set('shown', false);
        xabber.bottom_placeholders_wrap.$(this.$el).remove();
        xabber.main_panel.$el.css('padding-bottom', xabber.bottom_placeholders_wrap.$el.height());
    }
});

xabber.ToolbarAccountsBlockView = xabber.BasicView.extend({
    _initialize: function () {
        this.updateList();
        this.listenTo(this.model, 'add change:enabled', this.updateOneInList);
        this.listenTo(this.model, 'update_order', this.updateList);
        this.listenTo(this.model, 'destroy', this.onAccountRemoved);
    },

    updateList: function () {
        this.$el.find('.single-item').removeClass('single-item');
        _.each(this.children, function (view) { view.detach(); });
        _.each(this.model.enabled, (account) => {
            let jid = account.get('jid'), view = this.child(jid);
            !view && (view = this.addChild(jid, xabber.AccountToolbarItemView, {model: account}));
            this.$el.append(view.$el);
            if (this.model.enabled.length === 1)
                this.$el.find('.toolbar-item.account-item').addClass('single-item');
        });
        this.$el.find('.toolbar-item.settings-modal').switchClass('hidden', this.model.enabled.length !== 0);
        xabber.toolbar_view.$('.toolbar-item:not(.settings-modal):not(.add-something)').switchClass('disabled', this.model.enabled.length === 0);
        this.parent.updateScrollBar();
    },

    updateOneInList: function (account) {
        let jid = account.get('jid');
        xabber.accounts.connected.forEach((acc) => {
            if (acc.server_features.get(Strophe.NS.XABBER_FAVORITES)) {
                let saved_chat = acc.chats.getSavedChat();
                saved_chat.item_view.updateLastMessage();
            }
        });
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
            if (xabber.toolbar_view.$('.toolbar-item.saved-chats.active').length
                && !xabber.chats_view.$('.recent-chats-panel.saved-chats-panel').length
                && this.model.enabled.length === 2){
                xabber.toolbar_view.$('.toolbar-item:not(.account-item):not(.toolbar-logo)').removeClass('active unread')
                    .filter('.all-chats').addClass('active')

            }
        } else {
            account.last_msg_timestamp = 0;
            this.removeChild(jid);
            if (xabber.toolbar_view.$('.toolbar-item.saved-chats.active').length && this.model.enabled.length === 1){
                if (xabber.body.screen.get('previous_screen')){
                    let previous_chat = xabber.body.screen.get('previous_screen');
                    previous_chat.force_open_all_chats = true;
                    xabber.body.screen.set('previous_screen', previous_chat);
                    xabber.chats_view.$('.recent-chats-main-header').text(xabber.getString("toolbar__menu_item__saved_chats"));
                    xabber.chats_view.$('.recent-chats-panel').addClass('not-main-panel');
                    xabber.chats_view.$('.recent-chats-panel').addClass('saved-chats-panel');
                    xabber.chats_view.$('.btn-unread').addClass('hidden2');
                }
            }
            if (xabber.toolbar_view.data.get('account_filtering') === account.get('jid') || !xabber.accounts.enabled.length) {
                xabber.toolbar_view.data.set('account_filtering', null);
                xabber.toolbar_view.$('.toolbar-item.account-item').removeClass('active');
                if (xabber.body.screen.get('previous_screen')){
                    let previous_chat = xabber.body.screen.get('previous_screen');
                    previous_chat.force_open_all_chats = true;
                    xabber.body.screen.set('previous_screen', previous_chat);
                }
                if (xabber.body.screen && (xabber.body.screen.get('name') === 'all-chats')){
                    xabber.toolbar_view.showAllChats(null, true);
                }
            }
        }
        this.$el.find('.single-item').removeClass('single-item');
        if (this.model.enabled.length === 1)
            this.$el.find('.toolbar-item.account-item').addClass('single-item');
        this.$el.find('.toolbar-item.settings-modal').switchClass('hidden', this.model.enabled.length !== 0);
        xabber.toolbar_view.$('.toolbar-item:not(.settings-modal):not(.add-something)').switchClass('disabled', this.model.enabled.length === 0);
        this.parent.updateScrollBar();
    },

    onAccountRemoved: function (account) {
        this.removeChild(account.get('jid'));
        this.parent.updateScrollBar();
        if (this.model.enabled.length === 1)
            this.$el.find('.toolbar-item.account-item').addClass('single-item');
        this.$el.find('.toolbar-item.settings-modal').switchClass('hidden', this.model.enabled.length !== 0);
        xabber.toolbar_view.$('.toolbar-item:not(.settings-modal):not(.add-something)').switchClass('disabled', this.model.enabled.length === 0);
        xabber.accounts.connected.forEach((acc) => {
            if (acc.server_features.get(Strophe.NS.XABBER_FAVORITES)) {
                let saved_chat = acc.chats.getSavedChat();
                saved_chat.item_view.updateLastMessage();
            }
        });
        if (xabber.toolbar_view.$('.toolbar-item.saved-chats.active').length && this.model.enabled.length === 1){
            let previous_chat = xabber.body.screen.get('previous_screen');
            previous_chat.force_open_all_chats = true;
            xabber.body.screen.set('previous_screen', previous_chat);
            xabber.chats_view.$('.recent-chats-main-header').text(xabber.getString("toolbar__menu_item__saved_chats"));
            xabber.chats_view.$('.recent-chats-panel').addClass('not-main-panel');
            xabber.chats_view.$('.recent-chats-panel').addClass('saved-chats-panel');
            xabber.chats_view.$('.btn-unread').addClass('hidden2');
        }
        if (xabber.toolbar_view.data.get('account_filtering') === account.get('jid') || !xabber.accounts.enabled.length) {
            xabber.toolbar_view.data.set('account_filtering', null);
            xabber.toolbar_view.$('.toolbar-item.account-item').removeClass('active');
            if (xabber.body.screen.get('previous_screen')){
                let previous_chat = xabber.body.screen.get('previous_screen');
                previous_chat.force_open_all_chats = true;
                xabber.body.screen.set('previous_screen', previous_chat);
            }
            if (xabber.body.screen && (xabber.body.screen.get('name') === 'all-chats')){
                xabber.toolbar_view.showAllChats(null, true);
            }
        }
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

    _initialize: function () {
        this.update();
        this.listenTo(this.model, 'change', this.update);
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

    _initialize: function () {
        this.update();
        this.listenTo(this.model, 'change', this.update);
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
                callback && callback();
            });
        }
    },
});

xabber.ResourcesView = xabber.BasicView.extend({
    _initialize: function () {
        this.renderByInit();
        this.listenTo(this.model, 'add', this.onResourceAdded);
        this.listenTo(this.model, 'remove', this.onResourceRemoved);
        this.listenTo(this.model, 'reset', this.onReset);
        this.listenTo(this.model, 'change:priority', this.onPriorityChanged);
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

xabber.AccountVCardModalView = xabber.VCardView.extend({
    template: env.templates.vcard.vcard_modal,
    events: {
        "click .btn-vcard-refresh": "refresh",
        "click .btn-vcard-edit": "showEditView",
        "click .details-icon": "onClickIcon"
    },

    __initialize: function () {
        this.updateButtons();
        this.listenTo(this.model, 'activate deactivate', this.updateButtons);
    },

    updateButtons: function () {
        let connected = this.model.isConnected();
        this.$('.btn-vcard-edit').showIf(connected);
        this.$('.btn-vcard-refresh').showIf(connected);
    },

    showEditView: function ($el) {
        this.vcard_edit_modal = new xabber.VCardEditModalView({model: this.model});
        this.vcard_edit_modal.show({$el: $el});
    }
});

xabber.AccountMediaGalleryView = xabber.BasicView.extend({
    template: templates.media_gallery_account,
    events: {
        "click .gallery-file:not(.gallery-avatar) .btn-delete": "deleteFile",
        "click .gallery-file.gallery-avatar .btn-delete": "deleteAvatar",
        "click .gallery-file .checkbox-field": "selectFile",
        "click .btn-delete-selection": "deleteSelectedFiles",
        "click .settings-tab:not(.settings-deletion-button)": "onTabClick",
        "click .show-deletion": "showDeleteFilesView",
        "click .btn-back-gallery": "backToMain",
        "click .gallery-file": "onClickFile",
        "click .btn-close-selection": "disableFilesSelect",
    },

    _initialize: function () {
        this.account = this.model;
        this.$el.html(this.template());
        this.parent.ps_container.on("ps-scroll-y", this.onScroll.bind(this));
        this.listenTo(this.account, 'update_avatar_list', this.onUpdateAvatars);
    },

    render: function () {
        this.updateStorage();
        let dropdown_settings = {
            inDuration: 100,
            outDuration: 100,
            constrainWidth: false,
            hover: false,
            alignment: 'right'
        };
        this.$('.dropdown-button').dropdown(dropdown_settings);
    },

    onScroll: function () {
        if (this.$el.hasClass('hidden'))
            return;
        let scrollTop = this.parent.ps_container[0].scrollTop,
            scrollHeight = this.parent.ps_container[0].scrollHeight,
            offsetHeight = this.parent.ps_container[0].offsetHeight,
            persentScrolled = scrollTop / (scrollHeight - offsetHeight);
        if (persentScrolled > 0.8 && !this.loading_files && (this.current_page < this.total_pages)){
            this.current_page++;
            this.current_options.page = this.current_page;
            if (this.current_options.type === 'avatars'){
                this.getAvatars(this.current_options)
            } else {
                this.getFiles(this.current_options)
            }
        }
    },

    updateStorage: function () {
        this.account.getStorageStats(null,(response) => {
            let used_storage = utils.pretty_size(response.total.used) || '0';
            this.$('.btn-delete-files-dropdown').hideIf(!(response.total && response.total.used));
            this.$('.gallery-manage-storage').hideIf(!(response.total && response.total.used));
            this.$('.storage-usage').html(used_storage + xabber.getString("of") + utils.pretty_size(response.quota));
            this.$('.storage-usage-images').hideIf(!(response.images && response.images.used));
            this.$('.storage-label-images').hideIf(!(response.images && response.images.used));
            response.images && !_.isUndefined(response.images.used) && this.$('.storage-usage-images .storage-usage-amount').html(utils.pretty_size(response.images.used));
            this.$('.storage-label-videos').hideIf(!(response.videos && response.videos.used));
            this.$('.storage-usage-videos').hideIf(!(response.videos && response.videos.used));
            response.videos && !_.isUndefined(response.videos.used) && this.$('.storage-usage-videos .storage-usage-amount').html(utils.pretty_size(response.videos.used));
            this.$('.storage-label-voices').hideIf(!(response.voices && response.voices.used));
            this.$('.storage-usage-voices').hideIf(!(response.voices && response.voices.used));
            response.voices && !_.isUndefined(response.voices.used) && this.$('.storage-usage-voices .storage-usage-amount').html(utils.pretty_size(response.voices.used));
            this.$('.storage-label-files').hideIf(!(response.files && response.files.used));
            this.$('.storage-usage-files').hideIf(!(response.files && response.files.used));
            response.files && !_.isUndefined(response.files.used) && this.$('.storage-usage-files .storage-usage-amount').html(utils.pretty_size(response.files.used));
            this.$('.storage-label-avatars').hideIf(!(response.avatars && response.avatars.used));
            response.avatars && !_.isUndefined(response.avatars.used) && this.$('.storage-usage-avatars .storage-usage-amount').html(utils.pretty_size(response.avatars.used));

            if (response.images){
                this.$('.storage-progress-images').css('width', ((response.images.used/response.quota) * 100).toFixed(2) + '%');
            }
            if (response.videos){
                this.$('.storage-progress-videos').css('width', ((response.videos.used/response.quota) * 100).toFixed(2) + '%');
            }
            if (response.voices){
                this.$('.storage-progress-voices').css('width', ((response.voices.used/response.quota) * 100).toFixed(2) + '%');
            }
            if (response.files){
                this.$('.storage-progress-files').css('width', ((response.files.used/response.quota) * 100).toFixed(2) + '%');
            }
            if (response.avatars){
                this.$('.storage-progress-avatars').css('width', ((response.avatars.used/response.quota) * 100).toFixed(2) + '%');
            }
            if (this.parent){
                this.parent.$('.settings-tab[data-block-name="media-gallery"] .settings-block-label')
                    .text(xabber.getString("settings_account__storage_label", [utils.pretty_size(response.total.used), utils.pretty_size(response.quota)]));
                this.parent.updateHeight();
            }
            if (xabber.settings_modal_view.$('.settings-tab[data-block-name="media-gallery"] .settings-block-label').length){
                xabber.settings_modal_view.$('.settings-tab[data-block-name="media-gallery"] .settings-block-label')
                    .text(xabber.getString("settings_account__storage_label", [utils.pretty_size(response.total.used), utils.pretty_size(response.quota)]));
                xabber.settings_modal_view.updateHeight();
            }
        });
    },

    filterType: function (file_type, sorting) {
        this.$('.gallery-files').html('');
        if (file_type === 'image' || file_type === 'video' || file_type === 'avatars') {
            this.$('.gallery-files').removeClass('voice');
            this.$('.gallery-files').removeClass('file');
            this.$('.gallery-files').addClass('grid');
        } else if (file_type === 'voice') {
            this.$('.gallery-files').addClass('voice');
            this.$('.gallery-files').removeClass('file');
            this.$('.gallery-files').removeClass('grid');
        } else {
            this.$('.gallery-files').removeClass('voice');
            this.$('.gallery-files').addClass('file');
            this.$('.gallery-files').removeClass('grid');
        }
        let options = {type: file_type};
        sorting && (options.order_by = sorting);
        this.current_options = options;
        if (file_type === 'avatars')
            this.getAvatars(options);
        else
            this.getFiles(options)
    },

    onTabClick: function (ev) {
        let $target = $(ev.target).closest('.settings-tab'),
            file_type = $target.attr('data-media-type'),
            tab_header = $target.attr('data-header-text');
        this.current_page = 1;
        this.total_pages = 0;
        this.parent.$('.btn-back-settings').addClass('hidden');
        this.parent.$('.settings-panel-head-title').text(tab_header);
        this.parent.$('.btn-select-files').removeClass('hidden');
        this.parent.$('.btn-sorting').removeClass('hidden');
        this.parent.$('.btn-more.media-gallery-button').removeClass('hidden');
        this.$('.gallery-wrap').addClass('hidden');
        this.$('.media-gallery-items-wrap').removeClass('hidden');
        this.$('.media-gallery-items-wrap').attr('data-value', file_type);
        this.$('.gallery-files').html('');
        this.filterType(file_type);
        if (this.parent){
            this.parent.updateHeight();
        }
        if (xabber.settings_modal_view){
            xabber.settings_modal_view.updateHeight();
        }
    },

    backToMain: function () {
        this.parent.$('.btn-back-settings').removeClass('hidden');
        this.parent.$('.btn-select-files').addClass('hidden');
        this.parent.$('.btn-sorting').addClass('hidden');
        this.parent.$('.settings-panel-head-title').text(xabber.getString("account_cloud_storage"));
        this.parent.$('.btn-more.media-gallery-button').addClass('hidden');
        this.$('.gallery-wrap').removeClass('hidden');
        this.$('.media-gallery-items-wrap').addClass('hidden');
        this.updateStorage();
        if (this.parent){
            this.parent.updateHeight();
        }
        if (xabber.settings_modal_view){
            xabber.settings_modal_view.updateHeight();
        }
    },

    onUpdateAvatars: function () {
        this.updateStorage(false, true);
        if (this.$('.media-gallery-items-wrap').attr('data-value') === 'avatars'){
            this.current_page = 1;
            this.total_pages = 0;
            this.$('.gallery-files').html('');
            this.filterType('avatars');
        }
    },

    showDeleteFilesView: function () {
        xabber.trigger('show_delete_files', {model: this.account, gallery_view: this});
    },

    sortFiles: function (ev) {
        let $target = $(ev.target).closest('.btn-gallery-sorting'),
            file_type = this.$('.media-gallery-items-wrap').attr('data-value'),
            sort_type = $target.attr('data-value');
        this.current_page = 1;
        this.total_pages = 0;
        this.$('.gallery-files').html('');
        this.filterType(file_type, sort_type);
    },

    onClickFile: function (ev) {
        let $elem = $(ev.target);
        if ($elem.hasClass('uploaded-video')) {
            let $file = $elem.closest('.gallery-file'),
                f_url = $file.attr('data-file');

            utils.dialogs.common('', '<video class="gallery-video-frame" controls autoplay=1 width="420" height="315" src="' + f_url +'"></video>', null, null, null, 'gallery-video-modal');
            return;
        }
        if ($elem.hasClass('no-uploaded') || $elem.hasClass('gallery-audio-file-not-uploaded')) {
            let $audio_elem = $elem.closest('.gallery-file'),
                f_url = $audio_elem.attr('data-file'),
                peaks = $audio_elem.attr('data-peaks');
            $audio_elem.find('.mdi-play').removeClass('audio-file-play');
            $audio_elem[0].voice_message = this.renderVoiceMessage($audio_elem.find('.gallery-file-audio-container')[0], f_url, peaks);
            this.prev_audio_message && this.prev_audio_message.voice_message.pause();
            this.prev_audio_message = $audio_elem[0];
            return;
        }

        if ($elem.hasClass('mdi-play')) {
            let $audio_elem = $elem.closest('.gallery-file');
            this.prev_audio_message.voice_message.pause();
            this.prev_audio_message = $audio_elem[0];
            $audio_elem[0].voice_message.play();
            return;
        }

        if ($elem.hasClass('mdi-pause')) {
            this.prev_audio_message.voice_message.pause();
        }
    },

    renderVoiceMessage: function (element, file_url, peaks) {
        let not_expanded_msg = element.innerHTML,
            unique_id = 'waveform' + moment.now(),
            $elem = $(element),
            $msg_element = $elem.closest('.gallery-file');
        $elem.addClass('voice-message-rendering').html($(templates.audio_file_waveform({waveform_id: unique_id})));
        let aud = this.createAudio(file_url, unique_id);

        aud.on('ready', () => {
            $msg_element.find('.gallery-file-placeholder-background .mdi').removeClass('no-uploaded');
            $msg_element.find('.gallery-file-placeholder-background').removeClass('gallery-audio-file-not-uploaded');
            let duration = Math.round(aud.getDuration());
            $elem.find('.voice-msg-total-time').text(utils.pretty_duration(duration));
            aud.play();
        });

        aud.on('waveform-ready', () => {
            $msg_element.find('.gallery-file-placeholder-background .mdi').removeClass('no-uploaded');
            $msg_element.find('.gallery-file-placeholder-background').removeClass('gallery-audio-file-not-uploaded');
            let duration = Math.round(aud.getDuration());
            $elem.find('.voice-msg-total-time').text(utils.pretty_duration(duration));
            setTimeout(() => {
                aud.play();
            }, 50);
        });

        aud.on('error', () => {
            $elem.removeClass('voice-message-rendering');
            element.innerHTML = not_expanded_msg;
            aud.unAll();
            $elem.find('.voice-message-play').get(0).remove();
            utils.callback_popup_message(xabber.getString("jingle__error__audio_not_supported"), 3000);
        });

        aud.on('play', () => {
            $msg_element.find('.gallery-file-placeholder-background .mdi').addClass('mdi-pause').removeClass('mdi-play');
            $msg_element.addClass('playing');
            let timerId = setInterval(function() {
                let cur_time = Math.round(aud.getCurrentTime());
                if (aud.isPlaying())
                    $elem.find('.voice-msg-current-time').text(utils.pretty_duration(cur_time));
                else
                    clearInterval(timerId);
            }, 100);
        });

        aud.on('finish', () => {
            $msg_element.find('.gallery-file-placeholder-background .mdi').removeClass('mdi-pause').addClass('mdi-play');
            $msg_element.removeClass('playing');
        });

        aud.on('pause', () => {
            $msg_element.find('.gallery-file-placeholder-background .mdi').removeClass('mdi-pause').addClass('mdi-play');
            $msg_element.removeClass('playing');
        });

        $elem.find('.voice-message-volume')[0].onchange = () => {
            aud.setVolume($elem.find('.voice-message-volume').val()/100);
        };
        try{
            if (peaks){
                let x = aud.load(file_url, peaks.split(' '));
            } else {
                aud.load(file_url);
            }
        } catch (e) {
            console.error(e);
        }

        return aud;
    },

    createAudio: function(file_url, unique_id) {
        let audio = WaveSurfer.create({
            container: "#" + unique_id,
            scrollParent: false,
            barWidth: 3,
            height: 48,
            barHeight: 48,
            cursorColor: 'rgba(211,47,47,0.8)',
            autoCenter: false,
            normalize: true,
            hideScrollBar: true,
            progressColor: '#757575'
        });
        audio.setVolume(0.5);
        return audio;
    },

    getFiles: function (options) {
        this.account.testGalleryTokenExpire(() => {
            options && options.file && (options = {});
            options = Object.assign({obj_per_page: 50, order_by: '-id'}, options);
            if (this.account.get('gallery_token') && this.account.get('gallery_url')) {
                if (this.loading_files && this.current_rendered_type === options.type && !options.page)
                    return;
                this.current_rendered_type = options.type;
                if (options.type === 'voice'){
                    options.contexts = 'voice';
                    delete options.type;
                }
                this.loading_files = true;
                $(env.templates.contacts.preloader()).appendTo(this.$('.gallery-files'));
                $.ajax({
                    type: 'GET',
                    headers: {"Authorization": 'Bearer ' + this.account.get('gallery_token')},
                    url: this.account.get('gallery_url') + 'v1/files/',
                    dataType: 'json',
                    contentType: "application/json",
                    data: options,
                    success: (response) => {
                        if (options.type)
                            response.type = options.type;
                        else if (options.contexts)
                            response.type = options.contexts;
                        this.renderFiles(response);
                        this.loading_files = false
                    },
                    error: (response) => {
                        this.account.handleCommonGalleryErrors(response, null, this.getFiles, arguments, this);
                        this.current_rendered_type = undefined;
                        console.log(response);
                        this.loading_files = false;
                        this.$('.gallery-files .preloader-wrapper').remove()
                    }
                });
            }
        });
    },

    getAvatars: function (options) {
        this.account.testGalleryTokenExpire(() => {
            options && options.file && (options = {});
            options = Object.assign({obj_per_page: 50, order_by: '-id', type: "avatars", contexts: "avatar"}, options);
            if (this.account.get('gallery_token') && this.account.get('gallery_url')) {
                if (this.loading_files && this.current_rendered_type === options.type && !options.page)
                    return;
                this.current_rendered_type = options.type;
                this.loading_files = true;
                delete options.type;
                $(env.templates.contacts.preloader()).appendTo(this.$('.gallery-files'));
                $.ajax({
                    type: 'GET',
                    headers: {"Authorization": 'Bearer ' + this.account.get('gallery_token')},
                    url: this.account.get('gallery_url') + 'v1/files/',
                    dataType: 'json',
                    contentType: "application/json",
                    data: options,
                    success: (response) => {
                        response.type = 'avatars';
                        this.renderFiles(response);
                        this.loading_files = false
                    },
                    error: (response) => {
                        this.account.handleCommonGalleryErrors(response, null, this.getAvatars, arguments, this);
                        this.current_rendered_type = undefined;
                        console.log(response);
                        this.loading_files = false;
                        this.$('.gallery-files .preloader-wrapper').remove()
                    }
                });
            }
        });
    },

    renderFiles: function (response) {
        if (response.type !== this.$('.media-gallery-items-wrap').attr('data-value'))
            return;
        this.total_pages = response.total_pages;
        this.$('.gallery-files .preloader-wrapper').remove();
        if (response.items && response.items.length){
            response.items.forEach((item) => {
                item.thumbnail && item.thumbnail.url && (item.thumbnail = item.thumbnail.url);
                let duration, peaks = '';
                item.metadata && item.metadata.duration && (duration = utils.pretty_duration(item.metadata.duration));
                item.metadata && item.metadata.meters && (peaks = item.metadata.meters);
                let $gallery_file = $(templates.media_gallery_account_file({
                    file: item,
                    svg_icon: utils.file_type_icon_svg(item.media_type),
                    filesize: utils.pretty_size(item.size),
                    created_at: utils.pretty_date(item.created_at),
                    duration: duration,
                    peaks: peaks,
                    download_only: false,
                }));
                (response.type === 'avatars') && $gallery_file.addClass('gallery-avatar');
                $gallery_file.appendTo(this.$('.gallery-files'));
                $gallery_file.find('.uploaded-img').length && $gallery_file.find('.uploaded-img').magnificPopup({
                    type: 'image',
                    closeOnContentClick: true,
                    fixedContentPos: true,
                    mainClass: 'mfp-no-margins mfp-with-zoom',
                    image: {
                        verticalFit: true,
                        titleSrc: function(item) {
                            return '<a class="image-source-link" href="'+item.el.attr('src')+'" target="_blank">' + item.name + '</a>';
                        }
                    },
                    zoom: {
                        enabled: true,
                        duration: 300
                    }
                });
            });
        }
        else {
            this.$('.gallery-files').html(`<div class="no-files">${xabber.getString("no_files")}</div>`)
        }
        let dropdown_settings = {
            inDuration: 100,
            outDuration: 100,
            constrainWidth: false,
            hover: false,
            alignment: 'right'
        };
        this.$('.dropdown-button').dropdown(dropdown_settings);
        if (this.parent && this.parent.updateHeight)
            this.parent.updateHeight();
    },

    deleteFile: function (ev) {
        let $target = $(ev.target).closest('.gallery-file'),
            file_id = $target.attr('data-id');
        this.account.deleteFile(file_id,() => {
            $target.detach();
        }, (err) => {
        })
    },

    deleteAvatar: function (ev) {
        this.account.testGalleryTokenExpire(() => {
            let $target = $(ev.target).closest('.gallery-file'),
                file_id = $target.attr('data-id');
            if (this.account.get('gallery_token') && this.account.get('gallery_url') && file_id)
                $.ajax({
                    type: 'DELETE',
                    headers: {"Authorization": 'Bearer ' + this.account.get('gallery_token')},
                    url: this.account.get('gallery_url') + 'v1/files/',
                    dataType: 'json',
                    contentType: "application/json",
                    data: JSON.stringify({id: file_id, contexts: ['avatar']}),
                    success: () => {
                        $target.detach();
                    },
                    error: (response) => {
                        this.account.handleCommonGalleryErrors(response, null, this.deleteAvatar, arguments, this);
                        console.log(response);
                    }
                });
        });
    },

    enableFilesSelect: function () {
        this.$('.media-gallery-items-wrap').addClass('select-items-state');
        this.parent.$('.settings-panel-head-title').addClass('hidden');
        this.parent.$('.btn-more.media-gallery-button').addClass('hidden');
        this.parent.$('.btn-back-settings').addClass('hidden');
        this.onSelectFile();
    },

    disableFilesSelect: function () {
        this.$('.media-gallery-items-wrap').removeClass('select-items-state');
        this.parent.$('.settings-panel-head-title').removeClass('hidden');
        this.parent.$('.btn-more.media-gallery-button').removeClass('hidden');
        this.parent.$('.btn-back-settings').removeClass('hidden');
        this.$('.gallery-file .checkbox-field input:checked').prop('checked', false);
    },

    selectFile: function (ev) {
        let $target_input = $(ev.target).closest('.checkbox-field').find('input');
        $target_input.prop('checked', !$target_input.prop('checked'));
        this.onSelectFile();
    },

    onSelectFile: function () {
        if (!this.$('.media-gallery-items-wrap').attr('data-value'))
            return;
        let selected_count = this.$('.gallery-file .checkbox-field input:checked').length,
            selected_header;
        selected_header = xabber.getQuantityString(`media_gallery_selected_${this.$('.media-gallery-items-wrap').attr('data-value')}_header`, selected_count);
        this.$('.gallery-selection-head').text(selected_header);

        this.$('.gallery-file .checkbox-field input:checked').closest('.gallery-file').addClass('selected-gallery-file');
        this.$('.gallery-file .checkbox-field input:not(:checked)').closest('.gallery-file').removeClass('selected-gallery-file');
    },

    deleteSelectedFiles: function () {
        this.$('.gallery-file .checkbox-field input:checked').each((idx, item) => {
            let file_id = $(item).closest('.gallery-file').attr('data-id');
            if (file_id){
                if (this.$('.media-gallery-items-wrap').attr('data-value') === 'avatars'){
                    this.deleteAvatar({target: item});
                } else {
                    this.deleteFile({target: item});
                }
            }
        });
        this.disableFilesSelect();
    },
});

xabber.DeleteFilesFromGalleryView = xabber.BasicView.extend({
    className: 'modal main-modal delete-files-modal',
    ps_selector: '.modal-content',
    ps_settings: {
        wheelPropagation: true
    },
    template: templates.delete_files_media_gallery,
    events: {
        "click .btn-confirm": "deleteFilesFiltered",
        "click .btn-delete-files-percent": "deletePercent",
        "click .btn-cancel": "close",
        "click .gallery-file": "onClickFile",
        "change #delete_avatars": "onChangeCheckbox",
    },

    render: function (options) {
        this.account = options.model;
        this.gallery_view = options.gallery_view;
        this.delete_percent = null;
        this.$el.openModal({
            ready: this.onRender.bind(this),
            complete: this.close.bind(this)
        });
    },

    onRender: function () {
        this.$el.removeClass('wide-deletion');
        this.$('.media-gallery-delete-items-wrap').addClass('hidden');
        this.$('.deletion-variants').removeClass('hidden');
        this.$('.modal-footer').addClass('hidden');
        this.$('.gallery-files').addClass('hidden');
        this.$('.list-variant.tab').addClass('hidden');
        this.$('.delete-files-preview-container').addClass('hidden');
        this.$('.setting-name').addClass('hidden');
        this.$('.delete-files-preview-wrap .gallery-files').html('');
        this.$('.media-gallery-delete-items-wrap .no-files').addClass('hidden');
        this.$('.modal-header').text(xabber.getString("media_gallery_delete_files"));
        this.$('.delete-avatars-checkbox input').prop('checked', false);
        this.$('.btn-confirm').prop('disabled', false);
        this.$('.delete-avatars-checkbox').addClass('hidden');
        this.$('.delete-avatars-checkbox').addClass('hidden2');
        this.updateScrollBar();
    },

    onClickFile: function (ev) {
        let $elem = $(ev.target);

        if ($elem.hasClass('uploaded-video')) {
            let $file = $elem.closest('.gallery-file'),
                f_url = $file.attr('data-file');

            utils.dialogs.common('', '<video class="gallery-video-frame" controls autoplay=1 width="420" height="315" src="' + f_url +'"></video>', null, null, null, 'gallery-video-modal');
            return;
        }
        if ($elem.hasClass('no-uploaded') || $elem.hasClass('gallery-audio-file-not-uploaded')) {
            let $audio_elem = $elem.closest('.gallery-file'),
                f_url = $audio_elem.attr('data-file'),
                peaks = $audio_elem.attr('data-peaks');
            $audio_elem.find('.mdi-play').removeClass('audio-file-play');
            $audio_elem[0].voice_message = this.gallery_view.renderVoiceMessage($audio_elem.find('.gallery-file-audio-container')[0], f_url, peaks);
            this.prev_audio_message && this.prev_audio_message.voice_message.pause();
            this.prev_audio_message = $audio_elem[0];
            return;
        }

        if ($elem.hasClass('mdi-play')) {
            let $audio_elem = $elem.closest('.gallery-file');
            this.prev_audio_message.voice_message.pause();
            this.prev_audio_message = $audio_elem[0];
            $audio_elem[0].voice_message.play();
            return;
        }

        if ($elem.hasClass('mdi-pause')) {
            this.prev_audio_message.voice_message.pause();
        }
    },

    onChangeCheckbox: function (ev) {
        let $elem = $(ev.target);
        this.delete_avatars = $elem.prop('checked');
        this.$('.delete-files-avatars').switchClass('hidden', !$elem.prop('checked'));
        if (!this.has_files) {
            this.$('.media-gallery-delete-items-wrap .no-files').switchClass('hidden', $elem.prop('checked'));
            this.$('.delete-files-text').switchClass('hidden', !$elem.prop('checked'));
            this.$('.btn-confirm').prop('disabled', !$elem.prop('checked'));
        }
    },

    deletePercent: function (ev) {
        let $target = $(ev.target).closest('.btn-delete-files-percent'),
            percent = $target.attr('data-value');
        this.$el.addClass('wide-deletion');
        this.$('.deletion-variants').addClass('hidden');
        this.$('.modal-header').text(xabber.getString("media_gallery_delete_files_header"));
        this.updateScrollBar();
        this.delete_avatars = false;
        this.delete_percent = percent;
        this.has_files = false;
        this.current_page_preview = 1;
        $(env.templates.contacts.preloader()).appendTo(this.$('.modal-content'));
        this.getFilesForDeletion();
    },

    getFilesForDeletion: function (options) {
        this.account.testGalleryTokenExpire(() => {
            options && options.file && (options = {});
            !options && (options = {});
            options = Object.assign({obj_per_page: 50}, options);
            if (this.account.get('gallery_token') && this.account.get('gallery_url')) {
                let url;
                if (this.delete_percent === '100'){
                    url = this.account.get('gallery_url') + 'v1/files/';
                    options.contexts = ['file', 'avatar', 'voice'];
                } else {
                    url = this.account.get('gallery_url') + 'v1/files/percent/' + this.delete_percent + '/';
                }
                $.ajax({
                    type: 'GET',
                    headers: {"Authorization": 'Bearer ' + this.account.get('gallery_token')},
                    url: url,
                    dataType: 'json',
                    contentType: "application/json",
                    data: options,
                    traditional: true,
                    success: (response) => {
                        console.log(response);
                        let current_page = this.current_page_preview;
                        if (current_page < response.total_pages){
                            this.current_page_preview++;
                            options.page = this.current_page_preview;
                            this.getFilesForDeletion(options)
                        } else {
                            this.$('.preloader-wrapper').remove();
                            this.$('.modal-footer').removeClass('hidden');
                            this.$('.media-gallery-delete-items-wrap').removeClass('hidden');
                            if (this.delete_percent === '100'){
                                this.$('.delete-avatars-checkbox').removeClass('hidden');
                            }
                            this.updateScrollBar();
                        }
                        this.renderForDeletion(response);
                        if (current_page === 1 && response.items && response.items.length){
                            if (!this.has_files) {
                                this.$('.media-gallery-delete-items-wrap .no-files').removeClass('hidden');
                                this.$('.delete-files-text').addClass('hidden');
                                this.$('.btn-confirm').prop('disabled', true);
                            }
                        } else if (current_page === 1 && response.items) {
                            this.$('.media-gallery-delete-items-wrap .no-files').removeClass('hidden');
                            this.$('.delete-files-text').addClass('hidden');
                            this.$('.btn-confirm').prop('disabled', true);
                        }
                    },
                    error: (response) => {
                        console.log(response);
                        this.$('.preloader-wrapper').remove();
                        this.$('.media-gallery-delete-items-wrap .no-files').removeClass('hidden');
                        this.$('.delete-files-text').addClass('hidden');
                        this.$('.btn-confirm').prop('disabled', true);
                        this.updateScrollBar();
                    }
                });
            }
        });
    },

    renderForDeletion: function (response) {
        if (response.items && response.items.length){
            response.items.forEach((item) => {
                item.thumbnail && item.thumbnail.url && (item.thumbnail = item.thumbnail.url);
                item.is_avatar = Boolean(item.context === 'avatar');
                let duration;
                item.metadata && item.metadata.duration && (duration = utils.pretty_duration(item.metadata.duration));
                let $gallery_file = $(templates.media_gallery_account_file({
                    file: item,
                    svg_icon: utils.file_type_icon_svg(item.media_type),
                    filesize: utils.pretty_size(item.size),
                    created_at: utils.pretty_date(item.created_at),
                    duration: duration,
                    download_only: true,
                }));
                if (!item.is_avatar){
                    this.has_files = true;
                }
                if (item.is_avatar) {
                    $gallery_file.appendTo(this.$('.gallery-files.delete-files-avatars'));
                    if (this.delete_percent !== '100')
                        this.$('.delete-files-avatars').removeClass('hidden');
                    else {
                        this.$('.delete-avatars-checkbox').removeClass('hidden2');

                    }
                } else if (item.media_type && item.media_type.includes('image')){
                    $gallery_file.appendTo(this.$('.gallery-files.delete-files-images'));
                    this.$('.delete-files-images').removeClass('hidden');
                } else if (item.media_type && item.media_type.includes('video')){
                    $gallery_file.appendTo(this.$('.gallery-files.delete-files-videos'));
                    this.$('.delete-files-videos').removeClass('hidden');
                } else if (item.media_type && item.context === 'voice'){
                    $gallery_file.appendTo(this.$('.gallery-files.delete-files-voices'));
                    this.$('.delete-files-voices').removeClass('hidden');
                } else {
                    $gallery_file.appendTo(this.$('.gallery-files.delete-files-files'));
                    this.$('.delete-files-files').removeClass('hidden');
                }
                $gallery_file.find('.uploaded-img').length && $gallery_file.find('.uploaded-img').magnificPopup({
                    type: 'image',
                    closeOnContentClick: true,
                    fixedContentPos: true,
                    mainClass: 'mfp-no-margins mfp-with-zoom',
                    image: {
                        verticalFit: true,
                        titleSrc: function(item) {
                            return '<a class="image-source-link" href="'+item.el.attr('src')+'" target="_blank">' + item.name + '</a>';
                        }
                    },
                    zoom: {
                        enabled: true,
                        duration: 300
                    }
                });
            });
            let dropdown_settings = {
                inDuration: 100,
                outDuration: 100,
                constrainWidth: false,
                hover: false,
                alignment: 'right'
            };
            this.$('.dropdown-button').dropdown(dropdown_settings);
            this.$('.list-variant.tab:not(.hidden)').length && this.$('.list-variant.tab:not(.hidden)').first().click();
            this.updateScrollBar();
        }
    },

    deleteFilesFiltered: function () {
        if (!this.delete_percent)
            return;

        utils.dialogs.ask(xabber.getString("media_gallery_delete_files_confirm_delete_header"), xabber.getString("media_gallery_delete_files_confirm_delete_text"),
            null, { ok_button_text: xabber.getString("delete")}).done((res) => {
            if (!res)
                return;
            $(env.templates.contacts.preloader()).appendTo(this.$('.modal-footer'));
            this.account.testGalleryTokenExpire(() => {
                if (this.account.get('gallery_token') && this.account.get('gallery_url')){
                    let options = {}, url;
                    if (this.delete_percent === '100'){
                        url = this.account.get('gallery_url') + 'v1/files/';
                        if (this.delete_avatars)
                            options.contexts = ['file', 'avatar', 'voice'];
                        else
                            options.contexts = ['file', 'voice'];
                    } else {
                        url = this.account.get('gallery_url') + 'v1/files/percent/' + this.delete_percent + '/';
                    }
                    $.ajax({
                        type: 'DELETE',
                        headers: {"Authorization": 'Bearer ' + this.account.get('gallery_token')},
                        url: url ,
                        dataType: 'json',
                        contentType: "application/json",
                        data: JSON.stringify(options),
                        success: (response) => {
                            console.log(response);
                            this.close();
                        },
                        error: (response) => {
                            this.account.handleCommonGalleryErrors(response, null, this.deleteFilesFiltered, arguments, this);
                            this.close();
                            console.log(response)
                        }
                    });
                }
            });
        });
    },

    onHide: function () {
        this.$el.detach();
        this.gallery_view.updateStorage();
    },

    close: function () {
        this.closeModal();
    },

    closeModal: function () {
        this.$el.closeModal({ complete: this.hide.bind(this) });
    }
});

xabber.AccountSettingsModalView = xabber.BasicView.extend({
    className: 'settings-panel-wrap',
    template: templates.account_settings_modal,
    ps_selector: '.settings-panel',
    ps_settings: {
        wheelPropagation: true
    },
    avatar_size: constants.AVATAR_SIZES.ACCOUNT_SETTINGS_LEFT,

    events: {
        "click .background-overlay": "closeSettings",
        "change .main-info-wrap .circle-avatar input": "changeAvatar",
        "click .btn-choose-image": "chooseAvatar",
        "click .btn-back": "showSettings",
        "click .btn-back-settings": "backToMenu",
        "click .btn-back-subsettings-account": "backToSubMenu",
        "click .btn-emoji-panel": "openEmojiPanel",
        "click .btn-selfie": "openWebcamPanel",
        "click .settings-tab[data-block-name='status']": "openChangeStatus",
        "click .settings-tabs-wrap .settings-tab:not(.delete-account):not(.settings-non-tab)": "jumpToBlock",
        "click .tokens-wrap .settings-tab.token-wrap": "jumpToBlock",
        "click .btn-manage-xabber-account.settings-tab": "jumpToBlock",
        "click .settings-tab.delete-account": "deleteAccount",
        "click .settings-tab.unregister-account": "unregisterAccount",

        "change .enabled-state input": "setEnabled",
        "change .setting-send-chat-states input": "setTypingNotification",
        "change .setting-use-omemo input": "setEnabledOmemo",
        "click .btn-change-password": "showPasswordView",
        "click .btn-reconnect": "reconnect",
        "click": "hideResources",
        "change .sync-account": "changeSyncSetting",
        "click .btn-delete-settings": "deleteSettings",
        "click .color-picker-button": "changeColor",
        "click .btn-qr-code": "jumpToBlock",
        "click .trust-item-peer": "openFingerprints",
        // "click .trust-item-device": "jumpToBlock",
        "click .btn-open": "openChat",
        "click .btn-open-encrypted": "openEncryptedChat",
        "click .btn-revoke-trust": "revokeTrust",
        "click .btn-revoke-token": "revokeXToken",
        "click .devices-wrap .btn-revoke-all-tokens": "revokeAllXTokens",
        "click .devices-wrap .btn-verify-devices": "verifyDevices",
        "click .btn-manage-devices": "openDevicesWindow",
        "click .btn-block": "openBlockWindow",
        "click .blocked-contact input": "selectUnblock",
        "click .btn-unblock-selected": "unblockSelected",
        "click .btn-deselect-blocked": "deselectBlocked",
        "click .btn-gallery-sorting": "sortFiles",
        "click .btn-select-files": "enableFilesSelect",
        "click .all-sessions .device-encryption.active": "openFingerprint",
        "click .device-information-trust": "openFingerprintDevice",
        "click .device-information-refresh-bundle-debug": "refreshBundle",
        "click .btn-purge-keys": "purgeKeys",
        "click .cancel-session": "cancelTrustSession",
        "click .enter-code": "showCode",
        "click .show-code": "showCode",
        'click .accept-request': "acceptRequest",
        'click .decline-request': "rejectRequest",
    },

    _initialize: function (options) {
        if (options.forced_ps_container){
            this.ps_container = options.forced_ps_container;
        }
        this.status_field = new xabber.StatusMessageModalWidget({
            el: this.$('.status-wrap')[0],
            model: this.model
        });
        this.updateName();
        this.updateAvatar();
        this.updateBlocks();
        this.listenTo(this.model, 'change:name', this.updateName);
        this.listenTo(this.model, 'change:image', this.updateAvatar);
        this.listenTo(this.model, 'change:gallery_token', this.updateGallery);
        this.listenTo(this.model, 'activate deactivate', this.updateBlocks);
        this.listenTo(this.model, 'destroy', this.remove);

        this.ps_container.on("ps-scroll-y", this.onScrollY.bind(this));

        this.vcard_view = this.addChild('vcard', xabber.AccountVCardModalView,
            {model: this.model,});
        this.gallery_view = this.addChild('media-gallery', xabber.AccountMediaGalleryView,
            {model: this.model, el: this.$('.media-gallery')[0]});
        this.$('.account-name .value').text(this.model.get('jid'));
        this.updateStatus();
        this.updateView();
        this.showConnectionStatus();
        this.updateSynchronizationBlock();

        this.listenTo(this.model.resources, 'change', this.updateXTokens);
        this.listenTo(this.model.resources, 'add', this.updateXTokens);
        this.listenTo(this.model.resources, 'destroy', this.updateXTokens);
        this.listenTo(this.model.groups, 'change', this.updateGroupsLabel);
        this.listenTo(this.model.groups, 'add', this.updateGroupsLabel);
        this.listenTo(this.model.groups, 'destroy', this.updateGroupsLabel);
        this.listenTo(this.model.session, 'change:reconnecting', this.updateReconnectButton);
        this.listenTo(this.model.session, 'change:conn_feedback', this.showConnectionStatus);
        this.listenTo(this.model.settings, 'change:to_sync', this.updateSyncOption);
        this.listenTo(this.model.settings, 'change:deleted', this.updateDelSettingsButton);
        this.listenTo(this.model.settings, 'change:to_sync change:synced', this.updateSyncState);
        this.listenTo(this.model.settings, 'change:omemo', this.updateEnabledOmemo);
        this.listenTo(this.model.settings, 'change:encrypted_chatstates', this.updateEncryptedChatstates);
        this.listenTo(this.model, 'change:enabled', this.updateEnabled);
        this.listenTo(this.model, 'update_omemo_devices', this.updateOmemoDevices);
        this.listenTo(this.model, 'trusting_updated', this.updateOmemoDevices);
        this.listenTo(this.model, 'trusting_updated', this.updateXTokens);
        this.listenTo(this.model, 'new_device_notification', this.updateXTokens);
        this.listenTo(this.model, 'xabber_trust_items_updated', this.updateTrustItems);
        this.listenTo(this.model, 'change:status_updated', this.updateStatus);
        this.listenTo(this.model, 'activate deactivate', this.updateView);
        this.listenTo(this.model, 'change:auth_type', this.updateView);
        this.listenTo(this.model, 'destroy', this.remove);
        this.listenTo(this.model, 'active_session_change', this.renderActiveTrustSession);
        this.listenTo(xabber, 'update_layout', this.updateFrameHeight);
        if (options && !options.single_account_modal) {
            $(document).on("keyup.account_settings_modal", (ev) => {
                if (ev.keyCode === constants.KEY_ESCAPE && this.data.get('visible') && !options.single_account_modal) {
                    this.closeSettings();
                }
            });
        }
    },

    render: function (options) {
        this.clearFrameInfo();
        this.$('.circle-avatar.dropdown-button').dropdown({
            inDuration: 100,
            outDuration: 100,
            constrainWidth: false,
            hover: false,
            alignment: 'left'
        });
        this.updateCSS();

        this.updateEnabledOmemo();
        this.updateEncryptedChatstates();
        this.updateEnabled();
        this.updateGroupsLabel();
        this.updateTrustItems();
        this.updateView();
        this.showQRCode();
        this.$('.xabber-account-frame-wrap').html('');
        this.$('.main-resource .client').text(constants.CLIENT_NAME);
        this.$('.main-resource .resource').text(this.model.resource);
        this.$('.main-resource .priority').text(this.model.get('priority'));
        this.$(`.color-scheme input[type=radio][name=account_color][value="${this.model.settings.get('color')}"]`)
            .prop('checked', true);
        let dropdown_settings = {
            inDuration: 100,
            outDuration: 100,
            constrainWidth: false,
            hover: false,
            alignment: 'right'
        };
        this.$('.dropdown-button').dropdown(dropdown_settings);
        this.$('.panel-content-wrap').removeClass('hidden');
        if (this.ps_container.length) {
            this.ps_container.perfectScrollbar(
                _.extend(this.ps_settings || {}, xabber.ps_settings)
            );
        }
        this.updateOmemoDevices();
        this.$('.left-column').removeClass('hidden');
        this.$('.right-column').addClass('hidden');
        this.$('.btn-back-settings').removeClass('hidden');
        this.$('.btn-back-subsettings-account').addClass('hidden');
        this.$('.btn-sorting').addClass('hidden');
        this.$('.settings-panel-head-title').removeClass('hidden');
        this.$('.media-gallery-button.btn-more').addClass('hidden');
        this.$('.main-info-wrap').switchClass('xabber-account-button-visible', constants.XABBER_SERVICE_IFRAME_URL && constants.XABBER_SERVICE_URL);
        this.updateHeight();
        this.updateBlockedLabel();
        if (options && options.block_name) {
            let $elem = this.$(`.settings-tab[data-block-name="${options.block_name}"]`);
            if ($elem.length)
                this.jumpToBlock({target: $elem[0]});
            if (options.block_name === 'devices') {
                setTimeout(() => {
                    this.scrollToChild(this.$('.devices-wrap'));
                }, 100);
            }
        }
        if (this.model.omemo)
            this.renderActiveTrustSession();
        this.data.set('visible', true);
        this.updateXTokens();
        return this;
    },

    updateHeight: function (is_frame_enabled) {
        let height;
        if (!this.$('.left-column').hasClass('hidden'))
            height = this.$('.left-column').height();
        if (!this.$('.right-column').hasClass('hidden'))
            height = this.$('.right-column').height();
        if (is_frame_enabled)
            height = height + 8;
        this.ps_container.css('height', height + 'px');
        setTimeout(() => {
            this.updateScrollBar();
        }, 500)
    },

    updateFrameHeight: function () {
        let $iframe = this.$('.xabber-account-manage-frame');
        if ($iframe.length){
            $iframe.css('height', `${($(window).height() * 0.8) - 74}px`);
            this.updateHeight(true);
        }
        let $iframe_wrap = this.$('.xabber-account-frame-wrap');
        if ($iframe_wrap.length){
            $iframe_wrap.css('height', `${($(window).height() * 0.8) - 74}px`);
            this.updateHeight(true);
        }
    },

    handleServiceMessage: function (event) {
        if (!this.iframe_window) {
            this.clearFrameInfo();
            return;
        }
        if (event.origin !== constants.XABBER_SERVICE_IFRAME_URL)
            return;
        if (event.data && event.data.type && event.data.type === 'REQUEST_TOKEN') {
            this.iframe_window_origin = event.origin;
            this.iframe_window.postMessage(
                {
                    type: 'TOKEN_RESPONSE',
                    token: this.model.get('service_token'),
                },
                event.origin
            );
        }
        if (event.data && event.data.type && (event.data.type === 'ACCOUNT_DELETED' || event.data.type === 'ACCOUNT_UNAUTHORIZED')) {
            this.backToMenu();
            this.model.set('service_token', null);
            this.model.set('service_token_expires', null);
            if (event.data.type === 'ACCOUNT_UNAUTHORIZED'){
                this.$('.btn-manage-xabber-account.settings-tab').click();
            }
        }
        if (event.data && event.data.type && event.data.type === 'BREADCRUMBS' && event.data.breadcrumbs) {
            let breadcrumbs = event.data.breadcrumbs;
            if (breadcrumbs.length > 1 && breadcrumbs[breadcrumbs.length - 1].name){
                let title = breadcrumbs[breadcrumbs.length - 1].name;
                this.$('.settings-panel-head-title').text(title);
                this.$('.btn-back-settings').addClass('btn-back-frame');

            } else {
                this.$('.settings-panel-head-title').text(xabber.getString("settings_account__xabber_account_frame"));
                this.$('.btn-back-settings').removeClass('btn-back-frame');
            }
        }

    },

    frameBackToMenu: function () {
        if (this.iframe_window && this.iframe_window_origin){
            this.iframe_window.postMessage(
                {
                    type: 'BREADCRUMBS_BACK',
                },
                this.iframe_window_origin
            );
        }
    },

    clearFrameInfo: function () {
        this.$('.btn-back-settings').removeClass('btn-back-frame');
        this.iframe_window = null;
        this.iframe_window_origin = null;
    },

    openXabberAccountSettings: function () {
        if (!(constants.XABBER_SERVICE_IFRAME_URL && constants.XABBER_SERVICE_URL))
            return;
        this.updateFrameHeight();
        this.$('.xabber-account-frame-wrap').html(`<div class="preloader-wrapper-frame-wrap">${env.templates.contacts.preloader()}</div>`);

        this.updateHeight();

        this.model.testXabberServiceTokenExpire(() => {
            if (!this.model.get('service_token'))
                return;
            try {
                fetch(constants.XABBER_SERVICE_IFRAME_URL)
                    .then(response => {
                        if (response.ok) {
                            let iframe = document.createElement('iframe');

                            iframe.classList.add("xabber-account-manage-frame");
                            iframe.src = constants.XABBER_SERVICE_IFRAME_URL;
                            this.$('.xabber-account-frame-wrap').html(iframe);
                            this.updateFrameHeight();
                            this.iframe_window = iframe.contentWindow || iframe;
                            if (!this._iframe_msg_handler_created){
                                this._iframe_msg_handler_created = true;
                                window.addEventListener("message", this.handleServiceMessage.bind(this));
                            }

                        } else {
                            console.error('Loading error:', response.status);
                        }
                    })
                    .catch(error => console.error('Error:', error));
            } catch (e) {
                console.error('Error:', e)
            }

        });
    },

    verifyDevices: function () {
        this.model.verifyDevices();
    },

    renderActiveTrustSession: function () {
        this.$('.btn-verify-devices').removeClass('disabled');
        if (!this.model.omemo)
            return;
        this.active_trust_session = false;

        let active_sessions = this.model.omemo.xabber_trust.get('active_trust_sessions');
        this.$(`.notification-trust-session`).remove();
        this.$('.device-encryption-warning').removeClass('hidden2');

        Object.keys(active_sessions).forEach((session_id) => {
            let session = active_sessions[session_id];
            if ((session.active_verification_device && session.active_verification_device.peer_jid === this.model.get('jid')) || session.session_check_jid === this.model.get('jid')){
                let state = this.model.omemo.xabber_trust.getVerificationStateOwn(session),
                    state_label = this.model.omemo.xabber_trust.getVerificationStateLabel(session);

                let item = {
                    jid: null,
                    device_id: null,
                    chat_bottom: null,
                    is_active_request: null,
                    sid: session_id,
                    state: state,
                    state_label: state_label,
                    code: session.active_verification_code,
                    is_enter_code: null,
                };
                if (session.active_verification_device) {
                    item.jid = session.active_verification_device.peer_jid;
                    item.device_id = session.active_verification_device.device_id;
                } else if (session.session_check_jid){
                    item.jid = session.session_check_jid;
                    item.device_id = session.session_check_device_id;
                }
                if (session.verification_step === '1a' && session.verification_accepted_msg_xml) {
                    item.is_enter_code = true;
                }
                if (session.verification_step === '0b') {
                    item.is_active_request = true;
                }

                this.$('.active-trust-session-wrap').append($(templates.own_device_verification_session(item)));
                this.$('.btn-verify-devices').addClass('disabled');
                this.$('.device-encryption-warning').addClass('hidden2');
                this.active_trust_session = true;
            }
        });
        this.$('.btn-verify').switchClass('hidden', this.$('.active-trust-session-wrap').children().length);
        this.updateHeight();
    },

    cancelTrustSession: function (ev) {
        if (!this.model || !this.model.omemo)
            return;
        let $item = $(ev.target).closest('.notification-trust-session');
        if ($item.attr('data-sid')){
            this.model.omemo.xabber_trust && this.model.omemo.xabber_trust.cancelSession($item.attr('data-sid'), $item.attr('data-jid'))
        }
    },

    showCode: function (ev) {
        if (!this.model || !this.model.omemo)
            return;
        let $item = $(ev.target).closest('.notification-trust-session');
        if ($item.attr('data-sid')){
            if (!$('#modals').find('.code-modal').length){
                let view = new xabber.ActiveSessionModalView();
                view.show({
                    account: this.model,
                    sid: $item.attr('data-sid')
                });
            }
        }
    },

    acceptRequest: function (ev) {
        if (!this.model.omemo.xabber_trust)
            return;
        let $item = $(ev.target).closest('.notification-trust-session'),
            active_sessions = this.model.omemo.xabber_trust.get('active_trust_sessions'),
            sid = $item.attr('data-sid'), session;

        session = active_sessions[sid];
        if (!session)
            return;

        let message = session.incoming_request_data.message,
            message_options = session.incoming_request_data.message_options;
        message_options.automated = false;
        this.model.omemo.xabber_trust.receiveTrustVerificationMessage(message, message_options);
        this.showCode(ev);

    },

    rejectRequest: function (ev) {
        if (!this.model.omemo.xabber_trust)
            return;

        let $item = $(ev.target).closest('.notification-trust-session'),
            sid = $item.attr('data-sid');

        let msg_id = uuid(),
            to = this.model.get('jid'),
            stanza = $msg({
                type: 'chat',
                to: to,
                id: msg_id,
                from: this.model.get('jid'),
            });
        stanza.c('high-priority', {
            xmlns: Strophe.NS.PRIORITY_MESSAGES,
        }).up();
        stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Math.floor(Date.now() / 1000)});
        stanza.c('verification-rejected', {reason: 'Session cancelled'}).up().up();
        stanza.c('store', {
            xmlns: 'urn:xmpp:hints'
        }).up();

        this.model.sendFast(stanza, () => {
            utils.callback_popup_message(xabber.getString("trust_verification_decrypt_failed"), 5000);
        });
        this.model.omemo.xabber_trust.clearData(sid);

    },

    updateBlockedLabel: function () {
        if (!(this.model.blocklist && this.model.blocklist.list))
            return;

        let blocked_count = Object.keys(this.model.blocklist.list).length,
            label_text = blocked_count === 0 ? xabber.getString("no_entries") : xabber.getQuantityString("entry_count", blocked_count);
        this.$('.settings-tab[data-block-name="blocklist"] .settings-block-label').text(label_text);
    },

    onScrollY: function () {
        if (this.getScrollTop() === 0)
            this.$('.settings-panel-head').removeClass('lined-head');
        else
            this.$('.settings-panel-head').addClass('lined-head');
        if (this.getScrollTop() >= 180)
            this.$('.settings-account-head').addClass('head-scrolled');
        else
            this.$('.settings-account-head').removeClass('head-scrolled');
    },

    jumpToBlock: function (ev) {
        this.jumpToBlockHandler(ev);
    },

    jumpToBlockHandler: function (ev) {
        if ($(ev.target).closest('.device-encryption').length
            || $(ev.target).closest('.btn-revoke-token').length
            || $(ev.target).closest('.trusted-peer-dropdown-content').length
            || $(ev.target).closest('.trusted-peer-dropdown-button').length)
            return;

        this.$('.xabber-account-frame-wrap').html('');

        let $tab = $(ev.target).closest('.settings-tab'),
            $elem = this.$('.settings-block-wrap.' + $tab.attr('data-block-name')),
            block_name = $tab.attr('data-block-name');
        if (block_name){
            this.$('.device-more-button.btn-more').hideIf(block_name !== 'encryption');
            if (block_name !== 'media-gallery'){
                this.$('.media-gallery-button.btn-more').addClass('hidden');
            }
        }
        if (block_name === 'password'){
            xabber.trigger('change_account_password', this.model);
            return;
        }
        this.$('.settings-block-wrap').addClass('hidden');
        this.$('.left-column').addClass('hidden');
        this.$('.right-column').removeClass('hidden');
        $elem.removeClass('hidden');
        this.$('.settings-panel-head span.settings-panel-head-title').text($elem.attr('data-header'));
        if (block_name === 'media-gallery'){
            this.gallery_view.$('.media-gallery-items-wrap:not(.delete-files-preview-wrap)').removeClass('select-items-state');
            this.gallery_view.disableFilesSelect();
            this.gallery_view.backToMain();
        }
        if (block_name === 'blocklist'){
            this.$('.blocklist-tabs-wrap .tabs .indicator').remove();
            this.$('.blocklist-tabs-wrap .tabs').tabs();
            this.$('.blocklist-tabs-wrap .indicator').addClass('ground-color-500');
        }
        if (block_name === 'vcard-tab'){
            this.vcard_view.showEditView(this.$('.vcard'));
        }
        if (block_name === 'device-information'){
            $elem.attr('data-token-uid', $tab.attr('data-token-uid'));
            this.updateDeviceInformation($tab.attr('data-token-uid'));
        }
        if (block_name === 'xabber-account-frame-tab'){
            this.openXabberAccountSettings();
        }
        this.$('.btn-back-subsettings-account').attr('data-subblock-parent-name', '');
        if ($tab.closest('.right-column').length && $tab.attr('data-subblock-parent-name')) {
            this.$('.btn-back-settings').addClass('hidden');
            this.$('.btn-back-subsettings-account').removeClass('hidden');
            this.$('.btn-back-subsettings-account').attr('data-subblock-parent-name', $tab.attr('data-subblock-parent-name'));
        }
        this.scrollToTop();
        this.updateHeight();
    },

    backToMenu: function (ev) {
        this.backToMenuHandler(ev);
    },

    backToMenuHandler: function (ev) {
        if (ev && $(ev.target).closest('.btn-back-settings').hasClass('btn-back-frame')){
            this.frameBackToMenu();
            return;
        }
        this.clearFrameInfo();
        this.$('.xabber-account-frame-wrap').html('');
        this.$('.left-column').removeClass('hidden');
        this.$('.right-column').addClass('hidden');
        this.scrollToTop();
        this.updateHeight();
    },

    backToSubMenu: function (ev) {
        this.backToSubMenuHandler(ev);
    },

    backToSubMenuHandler: function (ev) {
        let $tab = $(ev.target).closest('.btn-back-subsettings-account'),
            block_name = $tab.attr('data-subblock-parent-name');
        if (block_name  === "trust-item"){
            let $trust_item_tab = this.$(`.trust-item-peer[data-jid="${$tab.attr('data-jid')}"`);
            $trust_item_tab.length && $trust_item_tab.click();
            return;
        }
        this.$('.xabber-account-frame-wrap').html('');

        if (!block_name){
            this.backToMenu(ev);
            return;
        }
        let $elem = this.$('.settings-block-wrap.' + block_name),
            elem_parent = $elem.attr('data-parent-block');
        if (block_name){
            this.$('.device-more-button.btn-more').hideIf(block_name !== 'encryption');
        }
        this.$('.settings-block-wrap').addClass('hidden');
        $elem.removeClass('hidden');
        this.$('.settings-panel-head span.settings-panel-head-title').text($elem.attr('data-header'));
        if (elem_parent) {
            $tab.attr('data-subblock-parent-name', elem_parent);
            this.deselectBlocked();
        } else {
            this.$('.btn-back-settings').removeClass('hidden');
            this.$('.btn-back-subsettings-account').addClass('hidden');
        }
        this.scrollToTop();
        this.updateHeight();
    },

    updateName: function () {
        this.$('.name').text(this.model.get('name'));
        this.$('.jid').text(this.model.get('jid'));
        this.updateNameCSS();
    },

    updateAvatar: function () {
        let image = this.model.cached_image;
        this.$('.circle-avatar').setAvatar(image, this.avatar_size, this.model);
    },

    updateBlocks: function () {
        let connected = this.model.isConnected();
        this.$('.main-info-wrap').switchClass('disconnected', !connected);
        this.$('.settings-tab[data-block-name="profile"]').showIf(connected);
        this.$('.settings-tab[data-block-name="encryption"]').showIf(connected);
        this.$('.profile-image-dropdown').showIf(connected);
        this.$('.set-groupchat-avatar').showIf(connected);
        this.updateGallery();
        this.updateScrollBar();
    },

    updateGallery: function () {
        let connected = this.model.isConnected();
        this.$('.settings-tab[data-block-name="media-gallery"]').showIf(connected && this.model.get('gallery_token'));
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
        if (this.model.get('gallery_token') && this.model.get('gallery_url')) {
            let avatar_view = new xabber.SetAvatarView();
            avatar_view.render({model: this.model});
        } else
            this.$('.main-info-wrap .circle-avatar input').click();
    },

    showSettings: function () {
        xabber.body.setScreen('settings-modal', {account_block_name: null, block_name: null});
        xabber.trigger('update_placeholder');
    },

    closeSettings: function () {
        this.clearFrameInfo();
        xabber.settings_modal_view.closeSettings();
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
        if (file.size > constants.MAX_AVATAR_FILE_SIZE && !(this.model.get('gallery_token') && this.model.get('gallery_url'))) {
            utils.dialogs.error(xabber.getString("group_settings__error__avatar_too_large"));
            return;
        } else if (!file.type.startsWith('image')) {
            utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
            return;
        }
        this.$('.circle-avatar').find('.preloader-wrap').addClass('visible').find('.preloader-wrapper').addClass('active');
        utils.images.getAvatarFromFile(file).done((image, hash, size) => {
            if (image) {
                this.model.pubAvatar({base64: image, hash: hash, size: size, type: file.type, file: file}, () => {
                    this.$('.circle-avatar').setAvatar(image, this.avatar_size, this.model);
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

    deleteAccount: function () {
        utils.dialogs.ask(xabber.getString("settings_account__button_quit_account"), xabber.getString("dialog_quit_account__confirm"),
            [], { ok_button_text: xabber.getString("button_quit")}).done((res) => {
            if (!res)
                return;
            this.model.deleteAccount(true);
        });
    },

    unregisterAccount: function () {
        xabber.trigger('unregister_account', this.model);
    },

    updateStatus: function () {
        let account = this.model,
            status = account.get('status');
        this.$('.settings-block-wrap.status .settings-subblock-wrap .status').attr('data-status', status);

        this.$('.settings-tab[data-block-name="status"] .settings-block-label').text(this.model.getStatusMessage());
    },

    updateOmemoDevices: function () {
        if (this.model.omemo && this.model.omemo.store){
            let identity_key = this.model.omemo.store.get('identityKey');
            if (identity_key){
                this.$('.btn-manage-devices').removeClass('hidden2');
            } else {
                this.model.omemo.store.once('change:identityKey', () => {
                    this.$('.btn-manage-devices').removeClass('hidden2');
                }, this);
            }
        }
        else
            this.$('.btn-manage-devices').addClass('hidden2');
    },

    updateView: function () {
        this.$('.connection-wrap .buttons-wrap .btn-change-password').hideIf(this.model.get('auth_type') === 'x-token');
        this.$('.connection-wrap .buttons-wrap .btn-reconnect').hideIf(this.model.get('auth_type') === 'x-token');
        this.updateScrollBar();
    },

    updateSynchronizationBlock: function () {
        this.updateSyncState();
        this.updateSyncOption();
        this.updateDelSettingsButton();
    },

    hideResources: function (ev) {
        if (!($(ev.target).hasClass('last-auth') && $(ev.target).hasClass('resource') || $(ev.target).closest(".token-resource-wrap").length > 0))
            this.$(`.token-resource-wrap`).hideIf(true)
    },

    refreshBundle: function () {
        if (!this.model.omemo || !xabber._settings.get('debug_mode'))
            return;
        this.model.omemo.bundle.generateIdentity().then(()=>{
            this.model.omemo.publishBundle();
            this.$('.btn-back-subsettings-account').length && this.backToSubMenu({target: this.$('.btn-back-subsettings-account')[0]});
            this.renderAllXTokens();
        });

    },

    renderAllXTokens: function () {
        let was_hidden = this.$('.device-encryption-warning').hasClass('hidden');
        this.$('.sessions-wrap').html("");
        this.$('.orphaned-fingerprints-wrap').html("");
        this.$('.device-encryption-warning').attr('data-not-trusted-count', 0);
        this.$('.device-encryption-warning').removeClass('warning-error');
        this.$('.btn-verify-devices').addClass('hidden');
        this.$('.settings-tabs-wrap .settings-tab .device-encryption').removeClass('warning-error');
        this.$('.settings-tab[data-block-name="devices"] .settings-block-label').text(xabber.getQuantityString("settings_account__devices_subheader_label", this.model.x_tokens_list.length));
        let devices_count = this.model.x_tokens_list.length, handled_devices = 0;
        $(_.sortBy(this.model.x_tokens_list, '-last_auth')).each((idx, token) => {
            let pretty_token = {
                resource_obj: undefined,
                client: token.client,
                device: token.device || xabber.getString('unknown'),
                token_uid: token.token_uid,
                ip: token.ip,
                last_auth: pretty_datetime_date(token.last_auth),
                expire: pretty_datetime(token.expire)
            };
            let resource_obj = this.model.resources.findWhere({ token_uid: token.token_uid });
            if (resource_obj)
                pretty_token.resource_obj = resource_obj.toJSON();
            if (this.model.get('x_token')) {
                if (this.model.get('x_token').token_uid === token.token_uid) {
                    pretty_token.is_omemo = !!this.model.omemo;
                    let $cur_token_html = $(templates.current_token_item_modal(pretty_token));
                    this.$('.current-session').append($cur_token_html);
                    handled_devices++;
                    if (handled_devices === devices_count){
                        if (!_.isUndefined(this.$('.device-encryption-warning').attr('data-not-trusted-count'))){
                            this.$('.device-encryption-warning').switchClass('hidden', this.$('.device-encryption-warning').attr('data-not-trusted-count') === '0');
                            if (this.$('.device-encryption-warning').attr('data-not-trusted-count') !== '0' && was_hidden && !this.isScrolledToTop()) {
                                this.scrollTo(this.getScrollTop() + 116)
                            }
                            this.$('.settings-tabs-wrap .settings-tab .device-encryption').switchClass('hidden', this.$('.device-encryption-warning').attr('data-not-trusted-count') === '0');
                            this.$('.btn-verify-devices').switchClass('hidden', this.$('.device-encryption-warning').attr('data-not-trusted-count') === '0');
                        }
                    }
                    return;
                }
            }
            let $token_html = $(templates.token_item_modal(pretty_token));
            this.$('.all-sessions').append($token_html);
            if (this.model.omemo) {
                !this.omemo_own_devices && (this.omemo_own_devices = new xabber.FingerprintsOwnDevices({model: this.model.omemo}));
                let omemo_device_id = token.omemo_id ? token.omemo_id : Number(pretty_token.token_uid.slice(0,8));
                this.omemo_own_devices.updateTrustDevice(Number(omemo_device_id), $token_html, this, () => {
                    if (this.$(`.settings-block-wrap.device-information[data-token-uid="${pretty_token.token_uid}"]`).length
                        && !this.$(`.settings-block-wrap.device-information[data-token-uid="${pretty_token.token_uid}"]`).hasClass('hidden')){
                        this.updateDeviceInformation(pretty_token.token_uid);
                    }
                    handled_devices++;
                    if (handled_devices === devices_count){
                        if (!_.isUndefined(this.$('.device-encryption-warning').attr('data-not-trusted-count'))){
                            this.$('.device-encryption-warning').switchClass('hidden', this.$('.device-encryption-warning').attr('data-not-trusted-count') === '0');
                            if (this.$('.device-encryption-warning').attr('data-not-trusted-count') !== '0' && was_hidden && !this.isScrolledToTop()) {
                                this.scrollTo(this.getScrollTop() + 116)
                            }
                            this.$('.settings-tabs-wrap .settings-tab .device-encryption').switchClass('hidden', this.$('.device-encryption-warning').attr('data-not-trusted-count') === '0');
                            this.$('.btn-verify-devices').switchClass('hidden', this.$('.device-encryption-warning').attr('data-not-trusted-count') === '0');
                        }
                    }
                }, () => {
                    handled_devices++;
                    if (handled_devices === devices_count){
                        if (!_.isUndefined(this.$('.device-encryption-warning').attr('data-not-trusted-count'))){
                            this.$('.device-encryption-warning').switchClass('hidden', this.$('.device-encryption-warning').attr('data-not-trusted-count') === '0');
                            if (this.$('.device-encryption-warning').attr('data-not-trusted-count') !== '0' && was_hidden && !this.isScrolledToTop()) {
                                this.scrollTo(this.getScrollTop() + 116)
                            }
                            this.$('.settings-tabs-wrap .settings-tab .device-encryption').switchClass('hidden', this.$('.device-encryption-warning').attr('data-not-trusted-count') === '0');
                            this.$('.btn-verify-devices').switchClass('hidden', this.$('.device-encryption-warning').attr('data-not-trusted-count') === '0');
                        }
                    }
                });
            } else {
                if (token.omemo_id){
                    $token_html.find('.device-encryption span').text(xabber.getString("settings_account__unverified_device"));
                    $token_html.find('.device-encryption .mdi-lock').removeClass('hidden');
                }
                handled_devices++;
                if (handled_devices === devices_count){
                    if (!_.isUndefined(this.$('.device-encryption-warning').attr('data-not-trusted-count'))){
                        this.$('.device-encryption-warning').switchClass('hidden', this.$('.device-encryption-warning').attr('data-not-trusted-count') === '0');
                        if (this.$('.device-encryption-warning').attr('data-not-trusted-count') !== '0' && was_hidden && !this.isScrolledToTop()) {
                            this.scrollTo(this.getScrollTop() + 116)
                        }
                        this.$('.settings-tabs-wrap .settings-tab .device-encryption').switchClass('hidden', this.$('.device-encryption-warning').attr('data-not-trusted-count') === '0');
                        this.$('.btn-verify-devices').switchClass('hidden', this.$('.device-encryption-warning').attr('data-not-trusted-count') === '0');
                    }
                }
            }
        });
        if (this.$('.all-sessions').children().length){
            this.$('.all-sessions-wrap').removeClass('hidden');
            this.$('.active-sessions-label').removeClass('hidden');
            this.$('.btn-revoke-all-tokens').removeClass('hidden');
            this.$('.btn-verify-devices').switchClass('hidden', !this.model.omemo || this.$('.device-encryption-warning').attr('data-not-trusted-count') === '0');
        }
        else {
            this.$('.all-sessions-wrap').addClass('hidden');
            this.$('.active-sessions-label').addClass('hidden');
            this.$('.btn-revoke-all-tokens').addClass('hidden');
        }
        this.$('.devices-wrap').removeClass('hidden');
        this.$('.devices-load-wrap').addClass('hidden');
        !this._single_account  && this.$('.token-wrap').attr('data-subblock-parent-name', '');
        this.updateHeight();
    },

    updateDeviceInformation: function (token_uid) {
        let token = this.model.x_tokens_list.find(item => (item.token_uid === token_uid));
        this.$('.device-information-last-seen').showIf(pretty_datetime(token.last_auth)).find('.device-information-text').text(pretty_datetime(token.last_auth));
        this.$('.device-information-device').showIf(token.device).find('.device-information-text').text(token.device);
        this.$('.device-information-client').showIf(token.client).find('.device-information-text').text(token.client);
        this.$('.device-information-ip').showIf(token.ip).find('.device-information-text').text(token.ip);
        this.$('.device-information-description').showIf(token.description).find('.device-information-text').text(token.description);
        this.$('.device-information-expires').showIf(pretty_datetime(token.expire)).find('.device-information-text').text(pretty_datetime(token.expire));
        this.$('.device-information-device-id').showIf(token.omemo_id).find('.device-information-text').text(token.omemo_id);
        let resource_obj = this.model.resources.findWhere({ token_uid: token_uid }),
            status_text;
        if (resource_obj){
            status_text = resource_obj.get('status_message') || resource_obj.get('status') && xabber.getString(resource_obj.get('status')) || xabber.getString("account_state_connected");
        } else if (this.model.get('x_token').token_uid === token.token_uid){
            status_text = this.model.get('status_message') || this.model.get('status') && xabber.getString(this.model.get('status')) || xabber.getString("account_state_connected")
        } else
            status_text = xabber.getString("offline");

        this.$('.device-information-status .device-information-text').text(status_text);

        if (this.model.get('x_token')) {
            this.$('.btn-revoke-token').hideIf(this.model.get('x_token').token_uid === token.token_uid);
            this.$('.device-information-trust')
                .switchClass('hidden', this.model.get('x_token').token_uid === token.token_uid)
        }
        if (token.omemo_id && this.model.omemo){
            let dfd = new $.Deferred(),
                device = this.model.omemo.own_devices[token.omemo_id];
            dfd.done((fing) => {
                if (fing.match(/.{1,8}/g))
                    fing = fing.match(/.{1,8}/g).join(" ");
                this.$('.device-information-fingerprint').showIf(fing).find('.device-information-text').text(fing);

                let $this_device = this.$(`.token-wrap[data-token-uid="${token_uid}"]`);

                this.$('.device-information-trust').removeClass('hidden');
                this.$('.device-information-trust-text').text($this_device.attr('data-trust-text'));
                this.$('.device-information-trust').attr('data-trust', $this_device.attr('data-trust'));
                this.$('.device-information-trust-text').attr('data-trust', $this_device.attr('data-trust'));
                if (this.model.get('x_token') && this.model.get('x_token').token_uid === token.token_uid){
                    this.$('.device-information-trust-text').text(xabber.getString("settings_account__omemo_enabled"));
                    this.$('.device-information-refresh-bundle-debug').switchClass('hidden', !xabber._settings.get('debug_mode'));
                    this.$('.device-information-trust').addClass('hidden');
                    this.$('.device-information-trust').attr('data-trust', 'trust');
                    this.$('.device-information-trust-text').attr('data-trust', 'trust');
                }
            });
            if (device.get('fingerprint')) {
                dfd.resolve(device.get('fingerprint'));
            } else if (device.get('ik')) {
                device.set('fingerprint', device.generateFingerprint());
                dfd.resolve(device.get('fingerprint'));
            } else {
                device.getBundle().then(({pk, spk, ik}) => {
                    device.set('ik', utils.fromBase64toArrayBuffer(ik));
                    let fingerprint = device.generateFingerprint();
                    if (!device.get('fingerprint') || device.get('fingerprint') !== fingerprint)
                        device.set('fingerprint', fingerprint);
                    dfd.resolve(device.get('fingerprint'));
                });
            }
        } else {
            this.$('.device-information-fingerprint').addClass('hidden');
            this.$('.device-information-trust').addClass('hidden');
            this.$('.device-information-trust-text').text('');
            this.$('.device-information-trust').attr('data-trust', '');
            this.$('.device-information-trust-text').attr('data-trust', '');
        }
        this.$('.settings-panel-head span.settings-panel-head-title').text(token.device);
    },

    openFingerprint: function (ev) {
        if (this.model.omemo){
            let $target = $(ev.target).closest('.device-encryption'),
                is_own = $target.hasClass('is-own');
            !this.omemo_own_devices && (this.omemo_own_devices = new xabber.FingerprintsOwnDevices({model: this.model.omemo}));
            let token = this.model.x_tokens_list.find(item => (item.token_uid === $target.closest('.token-wrap').attr('data-token-uid'))),
                omemo_device_id = token && token.omemo_id ? token.omemo_id : Number($target.closest('.token-wrap').attr('data-token-uid').slice(0,8));
            this.omemo_own_devices.open(Number(omemo_device_id), is_own);
        }
    },

    openFingerprintDevice: function (ev) {
        if (this.model.omemo){
            if ($(ev.target).closest('.device-information-trust.device-information-trust-own').length)
                return;
            let $target = $(ev.target).closest('.device-information');
            !this.omemo_own_devices && (this.omemo_own_devices = new xabber.FingerprintsOwnDevices({model: this.model.omemo}));
            let token = this.model.x_tokens_list.find(item => (item.token_uid === $target.attr('data-token-uid'))),
                omemo_device_id = token && token.omemo_id ? token.omemo_id : Number($target.attr('data-token-uid').slice(0,8));
            this.omemo_own_devices.open(Number(omemo_device_id), false);
        }
    },

    updateXTokens: function () {
        if (this.data.get('removed') || !this.isVisible())
            return;
        if (this.model.get('auth_type') !== 'x-token') {
            this.$('.tokens').addClass('hidden');
            this.$('.sessions-wrap').children().html("");
            return;
        }
        this.model.getAllXTokens(() => {
            this.$('.sessions-wrap').html("");
            if (this.model.x_tokens_list && this.model.x_tokens_list.length) {
                this.renderAllXTokens();
            }
        });
    },

    updateGroupsLabel: function () {
        let groups_count = this.model.groups.length,
            label_text = groups_count === 0 ? xabber.getString("contact_circles_empty") : xabber.getQuantityString("settings_account__section_header_circles", groups_count);

        this.$('.settings-tab[data-block-name="circles-groups"] .settings-block-label').text(label_text);
    },

    updateTrustItems: function () {
        this.$('.settings-trust-items-wrap').html('');
        this.$('.contact-device-encryption').addClass('hidden');
        this.$('.contact-device-encryption').removeClass('hidden');
        if (this.model.omemo && this.model.omemo.xabber_trust){

            let trusted_devices = this.model.omemo.xabber_trust.get('trusted_devices'),
                count = 0;


            Object.keys(trusted_devices).forEach((item) => {
                if (this.model.get('jid') === item)
                    return;
                let id = uuid();
                let $trust_peer = $(templates.trust_item_peer({jid: item, uuid: id}));
                this.$('.settings-trust-items-wrap').append($trust_peer);
                let peers_trusted_devices = trusted_devices[item],
                    contact = this.model.contacts.mergeContact(item);
                peers_trusted_devices = peers_trusted_devices.filter(item => !item.untrusted && !item.is_revoked);

                let image = contact.cached_image;
                $trust_peer.find('.circle-avatar').setAvatar(image, 40, this.model);
                $trust_peer.find('.trust-item-peer-name').text(contact.get('name'));

                $trust_peer.find('.trust-item-peer-devices-count').text(xabber.getQuantityString("settings_account__trust__peer_trusted_devices", peers_trusted_devices.length));
                $trust_peer.find('.dropdown-content').dropdown({
                    inDuration: 100,
                    outDuration: 100,
                    constrainWidth: false,
                    hover: false,
                    alignment: 'right'
                });
                !peers_trusted_devices.length && $trust_peer.addClass('hidden');
                if (peers_trusted_devices){
                    this.model.omemo.checkContactFingerprints(contact).then((obj) => {
                        let is_contact_trusted = obj.trust;
                        if (is_contact_trusted === 'error') {
                            $trust_peer.find('.trust-item-peer-encryption-status').removeClass('hidden');
                            $trust_peer.find('.trust-item-peer-encryption-status').addClass('contact-error-icon-visible');
                            this.$('.contact-device-encryption').removeClass('hidden');
                            this.$('.contact-device-encryption').addClass('contact-error-icon-visible');
                        } else if (is_contact_trusted === 'none') {
                            $trust_peer.find('.trust-item-peer-encryption-status').removeClass('hidden');
                            this.$('.contact-device-encryption').removeClass('hidden');

                        }
                    });
                }

                count = count + peers_trusted_devices.length;
            });
            if (count)
                this.$('.settings-tab[data-block-name="trust"]').removeClass('hidden');
            else
                this.$('.settings-tab[data-block-name="trust"]').addClass('hidden');
        } else {
            this.$('.settings-tab[data-block-name="trust"]').addClass('hidden');
        }
    },

    openFingerprints: function (ev) {
        let $item = $(ev.target).closest('.trust-item-peer'),
            jid = $item.attr('data-jid');
        if (jid){
            let peer = this.model.omemo.getPeer(jid);
            peer.fingerprints.open({is_settings: this});
        }
    },

    openChat: function (ev) {
        let $item = $(ev.target).closest('.trust-item-peer');
        if (!$item.length)
            return;
        let jid = $item.attr('data-jid');
        if (!jid)
            return;
        let contact = this.model.contacts.mergeContact(jid);
        this.model.chats.openChat(contact);
    },

    openEncryptedChat: function (ev) {
        let $item = $(ev.target).closest('.trust-item-peer');
        if (!$item.length)
            return;
        let jid = $item.attr('data-jid');
        if (!jid)
            return;
        let contact = this.model.contacts.mergeContact(jid);
        this.model.chats.openChat(contact, {encrypted: true});
    },

    revokeTrust: function (ev) {
        let $item = $(ev.target).closest('.trust-item-peer');
        if (!$item.length)
            return;
        let jid = $item.attr('data-jid');
        if (!jid)
            return;
        let peer = this.model.omemo.getPeer(jid);
        if (peer){
            peer.fingerprints.revokeAllTrust();
        }
    },

    revokeXToken: function (ev) {
        utils.dialogs.ask(xabber.getString("terminate_session_title"), xabber.getString("terminate_session_text"),
            {}, { ok_button_text: xabber.getString("button_terminate")}).done((res) => {
            if (!res)
                return;
            let $target = $(ev.target).closest('.settings-block-wrap.device-information'),
                token_uid = $target.attr('data-token-uid');
            this.model.revokeXToken([token_uid], () => {
                if (this.model.get('x_token')){
                    if (this.model.get('x_token').token_uid === token_uid) {
                        this.model.deleteAccount(true);
                        return;
                    }
                    this.model.getAllXTokens(() => {
                        this.$('.sessions-wrap').html("");
                        this.$('.btn-back-subsettings-account').length && this.backToSubMenu({target: this.$('.btn-back-subsettings-account')[0]});
                        if (this.model.x_tokens_list && this.model.x_tokens_list.length) {
                            this.renderAllXTokens();
                        }
                    });
                }
            });
        });
    },

    revokeAllXTokens: function () {
        utils.dialogs.ask(xabber.getString("settings_account__dialog_terminate_sessions__header"), xabber.getString("terminate_all_sessions_title"), null, { ok_button_text: xabber.getString("button_terminate")}).done((result) => {
            if (result && this.model.x_tokens_list)
                this.model.revokeAllXTokens(() => {
                    this.model.getAllXTokens(() => {
                        this.$('.sessions-wrap').html("");
                        if (this.model.x_tokens_list && this.model.x_tokens_list.length) {
                            this.renderAllXTokens();
                        }
                    });
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
        let enabled = this.model.settings.get('omemo');
        if (_.isUndefined(enabled))
            enabled = false;
        if (enabled && this.model.omemo_enable_view)
            this.model.omemo_enable_view.close();
        this.$('.setting-use-omemo input[type=checkbox]').prop('checked', enabled);
        this.$('.omemo-settings-wrap .setting-wrap:not(.omemo-enable)').switchClass('hidden', !enabled);
        this.$('.device-more-button').switchClass('hidden', !enabled);
        this.$('.label-encryption-enabled').switchClass('hidden', !enabled);
        this.$('.label-encryption-disabled').switchClass('hidden', enabled);
        if (!this.model.omemo){
            this.$('.btn-manage-devices').addClass('hidden2');
        }
        this.updateHeight();
    },

    updateEncryptedChatstates: function () {
        let enabled = this.model.settings.get('encrypted_chatstates');
        this.$('.setting-send-chat-states input[type=checkbox]').prop('checked', enabled);
    },

    updateReconnectButton: function () {
        this.$('.btn-reconnect').switchClass('disabled', this.model.session.get('reconnecting'));
    },

    setEnabled: function () {
        let enabled = this.$('.enabled-state input').prop('checked');
        this.model.save('enabled', enabled);
        enabled ? this.model.activate() : this.model.deactivate();
        if (xabber.accounts.length !== 1){
            this.showSettings();
        }
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
            this.updateXTokens();
        }, 1000);
    },

    destroyOmemo: function () {
        this.model.omemo.destroy();
        this.model.omemo = undefined;
        this.updateXTokens();
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
                    this.model.getConnectionForIQ().omemo.removeItemFromNode(`${Strophe.NS.OMEMO}:bundles`, device_id);
                } else {
                    let omemo = new xabber.Omemo({id: 'omemo'}, {
                        account: this.model,
                        storage_name: xabber.getStorageName() + '-omemo-settings-' + this.model.get('jid'),
                        fetch: 'before'
                    });
                    omemo.save('prekeys', {});
                    this.model.getConnectionForIQ().omemo.removeItemFromNode(`${Strophe.NS.OMEMO}:bundles`, omemo.get('device_id'));
                    omemo.destroy();
                }
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
            }
        });
    },

    changeColor: function (ev) {
        let value = $(ev.target).closest('.color-picker-button').attr('data-color-value');
        this.model.settings.update_settings({color: value});
        this.$el.attr('data-color', this.model.settings.get('color'));
        xabber.accounts.trigger('account_color_updated');
    },

    showQRCode: function () {
        if (!this.$('.qr-code-canvas').length)
            return;
        let qrcode = new VanillaQR({
            url: 'xmpp:' + this.model.get('jid'),
            noBorder: true
        });
        this.$('.qr-code-canvas').html("")[0].appendChild(qrcode.domElement);
        this.$('.qr-code-name').text(this.model.get('jid'));
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

    selectUnblock: function () {
        if (this.children && this.children.blocklist){
            this.children.blocklist.selectUnblock();
        }
    },

    unblockSelected: function () {
        if (this.children && this.children.blocklist){
            this.children.blocklist.unblockSelected();
        }
    },

    deselectBlocked: function () {
        if (this.children && this.children.blocklist)
            this.children.blocklist.deselectBlocked();
    },

    sortFiles: function (ev) {
        if (this.gallery_view)
            this.gallery_view.sortFiles(ev);
    },

    enableFilesSelect: function () {
        if (this.gallery_view)
            this.gallery_view.enableFilesSelect();
    },
});

xabber.AccountSettingsSingleModalView = xabber.AccountSettingsModalView.extend({
    className: 'single-account-settings-panel-wrap',
    template: templates.single_account_settings_modal,

    render: function (view, options) {
        if (!_.isNull(view))
            return;
        this.$el.detach();
        this.parent.$('.single-account-info-wrap').append(this.$el);
        this.ps_container = this.parent.ps_container;
        this.gallery_view.render();
        this._single_account = true;

        this.$el.attr('data-color', this.model.settings.get('color'));
        this.$('.circle-avatar.dropdown-button').dropdown({
            inDuration: 100,
            outDuration: 100,
            constrainWidth: false,
            hover: false,
            alignment: 'left'
        });
        this.updateCSS();

        this.updateEnabledOmemo();
        this.updateEncryptedChatstates();
        this.updateEnabled();
        this.updateGroupsLabel();
        this.updateView();
        this.showQRCode();
        this.$('.xabber-account-frame-wrap').html('');
        this.$('.main-resource .client').text(constants.CLIENT_NAME);
        this.$('.main-resource .resource').text(this.model.resource);
        this.$('.main-resource .priority').text(this.model.get('priority'));
        this.$(`.color-scheme input[type=radio][name=account_color][value="${this.model.settings.get('color')}"]`)
            .prop('checked', true);
        let dropdown_settings = {
            inDuration: 100,
            outDuration: 100,
            constrainWidth: false,
            hover: false,
            alignment: 'right'
        };
        this.$('.dropdown-button').dropdown(dropdown_settings);
        this.$('.panel-content-wrap').removeClass('hidden');
        if (this.ps_container.length) {
            this.ps_container.perfectScrollbar(
                _.extend(this.ps_settings || {}, xabber.ps_settings)
            );
        }
        this.updateOmemoDevices();
        this.$('.left-column').removeClass('hidden');
        this.$('.right-column').addClass('hidden');
        this.$('.btn-back-settings').removeClass('hidden');
        this.$('.btn-back-subsettings-account').addClass('hidden');
        this.$('.main-info-wrap').switchClass('xabber-account-button-visible', constants.XABBER_SERVICE_IFRAME_URL && constants.XABBER_SERVICE_URL);
        this.updateHeight();
        this.updateBlockedLabel();
        if (options && options.account_block_name) {
            let $elem = this.$(`.settings-tab[data-block-name="${options.account_block_name}"]`);
            if ($elem.length)
                this.jumpToBlock({target: $elem[0]});
        }

        if (this.model.omemo)
            this.renderActiveTrustSession();
        this.parent.single_account_has_rendered = true;
        this.data.set('visible', true);
        this.updateXTokens();
        return this;
    },

    jumpToBlock: function (ev) {
        this.parent.$('.left-column .settings-tabs-wrap.global-settings-tabs').addClass('hidden');
        this.jumpToBlockHandler(ev);
    },

    backToMenu: function (ev) {
        if (ev && !$(ev.target).closest('.btn-back-settings').hasClass('btn-back-frame')){
            this.parent.$('.left-column .settings-tabs-wrap.global-settings-tabs').removeClass('hidden');
        }
        this.backToMenuHandler(ev);
    },

    backToSubMenu: function (ev) {
        this.parent.$('.left-column .settings-tabs-wrap.global-settings-tabs').addClass('hidden');
        this.backToSubMenuHandler(ev);
    },

    updateHeight: function (is_frame_enabled) {
        this.parent.updateHeight(is_frame_enabled);
    },
});

xabber.StatusMessageWidget = xabber.InputWidget.extend({
    field_name: 'status-message',
    placeholder: 'Set custom status',

    bindModelEvents: function () {
        this.listenTo(this.model, 'change:status_updated', this.updateValue);
    },

    getValue: function () {
        return this.model.getStatusMessage();
    },

    setValue: function (value) {
        this.model.setStatus(null, value);
    }
});

xabber.StatusMessageModalWidget = xabber.InputWidget.extend({
    field_name: 'status-message',
    placeholder: 'Set custom status',
    template: templates.status_message_input_widget,

    showInput: function () {
        if (this.$input.prop('disabled'))
            return;
        this.data.set('input_mode', true);
        this.updateValue();
    },

    keyUp: function () {
        let value = this.getValue();
        this.$input.switchClass('changed', this.$input.val() !== value);
    },

    bindModelEvents: function () {
        this.listenTo(this.model, 'change:status_updated', this.updateValue);
    },

    getValue: function () {
        return this.model.getStatusMessage();
    },

    setValue: function (value) {
        this.model.setStatus(null, value);
    }
});

xabber.AccountSettingsItemModalView = xabber.BasicView.extend({
    className: 'xmpp-account draggable droppable',
    template: templates.global_settings_item_modal,
    avatar_size: constants.AVATAR_SIZES.SETTINGS_ACCOUNT_ITEM,

    events: {
        "click .account-info-wrap": "showSettings",
        "change .enabled-state input": "setEnabled",
    },

    _initialize: function () {
        this.updateEnabled();
        this.updateNickname();
        this.updateAvatar();
        this.updateColorScheme();
        this.updateSyncState();
        this.showConnectionStatus();
        this.listenTo(this.model, 'change:enabled', this.updateEnabled);
        this.listenTo(this.model, 'change:vcard', this.updateNickname);
        this.listenTo(this.model, 'change:image', this.updateAvatar);
        this.listenTo(this.model, 'trusting_updated', this.updateEncryptionWarning);
        this.listenTo(this.model.settings, 'change:omemo', this.updateEnabledOmemo);
        this.listenTo(this.model.settings, 'change:color', this.updateColorScheme);
        this.listenTo(this.model.settings, 'change:to_sync', this.updateSyncState);
        this.listenTo(this.model.session, 'change:conn_feedback', this.showConnectionStatus);
        this.$el.on('drag_to', this.onDragTo.bind(this));
        this.$('.move-account-to-this')
            .on('move_xmpp_account', this.onMoveAccount.bind(this));
        this.listenTo(this.model.resources, 'change', this.updateEncryptionWarning);
        this.listenTo(this.model.resources, 'add', this.updateEncryptionWarning);
        this.listenTo(this.model.resources, 'destroy', this.updateEncryptionWarning);
    },

    updateNickname: function () {
        let nickname;
        if (this.model.get('vcard')) {
            if (this.model.get('vcard').nickname)
                nickname = this.model.get('vcard').nickname;
            else if (this.model.get('vcard').first_name && this.model.get('vcard').last_name)
                nickname = this.model.get('vcard').first_name + ' ' + this.model.get('vcard').last_name;
            else if (this.model.get('vcard').fullname)
                nickname = this.model.get('vcard').fullname;
            else if (this.model.get('vcard').first_name || this.model.get('vcard').last_name)
                nickname = this.model.get('vcard').first_name + ' ' + this.model.get('vcard').last_name;
        }
        if (nickname){
            this.$('.nickname').text(nickname);
            this.$('.jid').text(this.model.get('jid'));
            this.$('.nickname-wrap').removeClass('single-row');
            this.$('.jid-wrap').removeClass('hidden');
        } else {
            this.$('.nickname').text(this.model.get('jid'));
            this.$('.nickname-wrap').addClass('single-row');
            this.$('.jid-wrap').addClass('hidden');
        }
    },

    updateEncryptionWarning: function () {
        if (!this.model || !this.model.omemo)
            return;
        this.model.omemo.checkOwnFingerprints().then((is_trusted) => {
            if (is_trusted === 'none' || is_trusted === 'error') {
                this.$('.encryption-warning-icon').removeClass('hidden');
                this.$('.account-info-wrap').addClass('encryption-warning');
            } else {
                this.$('.encryption-warning-icon').addClass('hidden');
                this.$('.account-info-wrap').removeClass('encryption-warning');
            }
        });
    },

    updateAvatar: function () {
        let image = this.model.cached_image;
        this.$('.circle-avatar').setAvatar(image, this.avatar_size);
    },

    updateColorScheme: function () {
        this.$el.attr('data-color', this.model.settings.get('color'));
    },

    showConnectionStatus: function () {
    },

    updateEnabled: function () {
        let enabled = this.model.get('enabled');
        this.$el.switchClass('disabled', !enabled);
        this.$('.enabled-state input[type=checkbox]').prop('checked', enabled);
    },

    setEnabled: function () {
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
    },

    showSettings: function (ev) {
        if (ev && $(ev.target).hasClass('drag-handle'))
            return;
        if (this.model.get('enabled'))
            this.model.showSettingsModal();
        else {
            utils.dialogs.ask_extended(xabber.getString("settings_account__enable_account_label"), xabber.getString("settings_account__enable_account_text", [this.model.get('jid')]),
                {modal_class: 'modal-offline-account', no_dialog_options: true},
                {
                    ok_button_text: xabber.getString("button_enable"),
                    optional_button: 'delete-account',
                    optional_button_text: xabber.getString("settings_account__button_quit_account")
                }).done((res) => {
                    if (res){
                        if (res === 'delete-account'){
                            this.model._revoke_on_connect = $.Deferred();
                            let revoke_timeout = setTimeout(() => {
                                if (this.model.omemo)
                                    this.model.omemo.destroy();
                                this.model._revoke_on_connect.resolve();
                            }, 5000);
                            this.model._revoke_on_connect.done(() => {
                                clearTimeout(revoke_timeout);
                                this.model._revoke_on_connect = undefined;
                                this.model.deleteAccount(null, true);
                            });
                            this.model.save('enabled', true);
                            this.model.activate();
                        }
                        else {
                            this.model.save('enabled', true);
                            this.model.activate();
                        }
                    }
            });
        }
    }
});

xabber.SettingsAccountsModalBlockView = xabber.BasicView.extend({
    _initialize: function () {
        this.updateList();
        this.updateSyncState();
        this.listenTo(this.model, 'add', this.updateOneInList);
        this.listenTo(this.model, 'update_order', this.updateList);
        this.listenTo(this.model, 'destroy', this.onAccountRemoved);
        this.model.on("add", this.parent.updateAccounts, this.parent);
        this.model.on("update_order", this.parent.updateAccounts, this.parent);
        this.model.on("destroy", this.parent.updateAccounts, this.parent);
        this.$('.move-account-to-bottom')
            .on('move_xmpp_account', this.onMoveAccountToBottom.bind(this));
    },

    updateList: function () {
        _.each(this.children, function (view) { view.detach(); });
        this.model.each((account) => {
            let jid = account.get('jid'), view = this.child(jid);
            if (!view) {
                view = this.addChild(jid, xabber.AccountSettingsItemModalView, {model: account});
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
            view = this.addChild(jid, xabber.AccountSettingsItemModalView, {model: account});
        let index = this.model.indexOf(account);
        if (index === 0)
            this.$('.no-accounts-tip').after(view.$el);
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
    },

    updateSyncState: function () {
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
        Materialize && Materialize.updateTextFields && Materialize.updateTextFields();
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

xabber.SetAvatarView = xabber.BasicView.extend({
    className: 'modal main-modal avatar-picker background-panel',
    template: templates.avatars_gallery,
    ps_selector: '.modal-content',
    ps_settings: {theme: 'item-list'},

    events: {
        "click .menu-btn": "updateActiveMenu",
        "click .library-wrap .image-item": "setActiveImage",
        'change input[type="file"]': "onFileInputChanged",
        'keyup input.url': "onInputChanged",
        "click .btn-add": "addAvatarSelecter",
        "click .btn-cancel": "close"
    },

    _initialize: function () {
        this.$('input.url')[0].onpaste = this.onPaste.bind(this);
    },

    render: function (options) {
        this.model = options.model;
        this.contact = options.contact;
        this.participant = options.participant;
        this.parent = options.parent;
        this.createLibrary();
        this.$('.menu-btn').removeClass('active');
        this.$('.menu-btn[data-screen-name="library"]').addClass('active');
        this.$('.modal-header span').text(xabber.getString("account_set_avatar_header"));
        this.$el.openModal({
            ready: () => {
                this.$('.modal-content').perfectScrollbar({theme: 'item-list'});
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
        if ($active_screen.attr('data-screen') === 'library') {
            $active_screen.find('div.active').length && (non_active = false);
        } else {
            $active_screen.find('img:not(.hidden)').length && (non_active = false);
        }
        this.$('.modal-footer .btn-add').switchClass('non-active', non_active);
    },

    renderFiles: function (response) {
        this.$('.library-wrap .preloader-wrapper').remove();
        if (response.items.length){
            this.current_items = response.items;
            response.items.forEach((item, idx) => {
                let img = $(`<div class="image-item"/>`);
                img.css('background-image', `url("${item.thumbnail.url}")`);
                img.attr('data-src', item.file);
                img.attr('data-id', idx);
                this.$('.library-wrap').append(img);
            });
        }
    },

    createLibrary: function () {
        this.model.testGalleryTokenExpire(() => {
            let options = {order_by: '-id', contexts: 'avatar'};
            if (this.model.get('gallery_token') && this.model.get('gallery_url')) {
                this.$('.library-wrap').html(env.templates.contacts.preloader());
                $.ajax({
                    type: 'GET',
                    headers: {"Authorization": 'Bearer ' + this.model.get('gallery_token')},
                    url: this.model.get('gallery_url') + 'v1/files/',
                    dataType: 'json',
                    contentType: "application/json",
                    data: options,
                    success: (response) => {
                        console.log(response);
                        this.renderFiles(response)
                    },
                    error: (response) => {
                        this.model.handleCommonGalleryErrors(response, null, this.createLibrary, arguments, this);
                        console.log(response);
                        this.$('.library-wrap .preloader-wrapper').remove()
                    }
                });
            }
        });
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
            let image_prev = new Image();
            image_prev.src = e.target.result;
            this.$('.screen-wrap[data-screen="upload"] img').detach();
            this.$('.screen-wrap[data-screen="upload"]').prepend(image_prev);
            this.current_file = file;
            this.updateActiveButton();
        };
        reader.readAsDataURL(file);
    },

    onInputChanged: function (ev) {
        if (ev.target.value.trim() === this.$('.image-preview img')[0].src)
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

    addAvatarSelecter: function () {
        if (this.contact){
            this.addNotOwnAvatar();
        } else {
            this.addAvatar();
        }
    },

    addAvatar: function () {
        if (this.$('.btn-add').hasClass('non-active'))
            return;
        let image, dfd = new $.Deferred(), $active_screen = this.$('.screen-wrap:not(.hidden)');
        dfd.done((img, img_from_gallery) => {
            if (img_from_gallery){
                image.type = image.media_type;
                this.model.pubAvatar(image, () => {
                    this.current_items = [];
                    this.close();
                    this.model.trigger('update_avatar_list');
                }, () => {
                    utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                });
            } else {
                utils.images.getAvatarFromFile(img).done((image, hash, size) => {
                    if (image) {
                        this.model.pubAvatar({base64: image, hash: hash, size: size, type: img.type, file: img}, () => {
                            this.close();
                            this.model.trigger('update_avatar_list');
                        }, () => {
                            utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                        });
                    } else
                        utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                });
            }
        });
        this.$('.modal-preloader-wrap').html(env.templates.contacts.preloader());
        this.$('.btn-add').addClass('hidden-disabled');

        if ($active_screen.attr('data-screen') === 'library') {
            image = this.current_items[$active_screen.find('div.active').attr('data-id')];
            image.uploaded = true;
            dfd.resolve(image, true);
        }
        else if ($active_screen.attr('data-screen') === 'web-address') {
            image = $active_screen.find('img:not(.hidden)')[0].src;
            this.createFileFromURL(image).then((file) => {
                dfd.resolve(file);
            }, () => {
                this.$('.preloader-wrapper').remove();
                this.$('.btn-add').removeClass('hidden-disabled');
                utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
            })
        } else
            dfd.resolve(this.current_file);
    },

    addNotOwnAvatar: function () {
        if (this.$('.btn-add').hasClass('non-active'))
            return;
        let image, dfd = new $.Deferred(), $active_screen = this.$('.screen-wrap:not(.hidden)'),
            participant_node = '';
        if (this.participant && this.participant.get('id')){
            participant_node = '#' + this.participant.get('id');
        }
        dfd.done((img, img_from_gallery) => {
            if (img_from_gallery){
                image.type = image.media_type;
                this.contact.pubAvatar(image, participant_node, () => {
                    this.current_items = [];
                    this.close();
                    if (this.parent && this.participant) {
                        this.parent.updateMemberAvatar(this.participant, true);
                    }
                }, () => {
                    utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                });
            } else {
                utils.images.getAvatarFromFile(img).done((image, hash, size) => {
                    if (image) {
                        this.contact.pubAvatar({base64: image, hash: hash, size: size, type: img.type, file: img}, participant_node, () => {
                            this.close();
                            if (this.parent && this.participant) {
                                this.parent.updateMemberAvatar(this.participant, true);
                            }
                        }, () => {
                            utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                        });
                    } else
                        utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
                });
            }
        });
        this.$('.modal-preloader-wrap').html(env.templates.contacts.preloader());
        this.$('.btn-add').addClass('hidden-disabled');

        if ($active_screen.attr('data-screen') === 'library') {
            image = this.current_items[$active_screen.find('div.active').attr('data-id')];
            image.uploaded = true;
            dfd.resolve(image, true);
        }
        else if ($active_screen.attr('data-screen') === 'web-address') {
            image = $active_screen.find('img:not(.hidden)')[0].src;
            this.createFileFromURL(image).then((file) => {
                dfd.resolve(file);
            }, () => {
                this.$('.preloader-wrapper').remove();
                this.$('.btn-add').removeClass('hidden-disabled');
                utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
            })
        } else
            dfd.resolve(this.current_file);
    },

    createFileFromURL: async function (url) {
        let response = await fetch(url);
        let data = await response.blob();
        let metadata = {
            type: 'image/png'
        };
        return new File([data], "avatar.png", metadata)
    },

    close: function () {
        this.$el.closeModal({ complete: () => {
                this.$el.detach();
                this.data.set('visible', false);
            }
        });
    }
});

xabber.WebcamProfileImageView = xabber.BasicView.extend({
    className: 'modal main-modal webcam-panel',
    template: templates.webcam_panel,

    events: {
        "click .btn-save": "addAvatarSelecter",
        "click .btn-cancel": "close",
    },

    open: function (options) {
        this.account = options.model;
        this.contact = options.contact;
        this.participant = options.participant;
        this.parent = options.parent;
        this.registration = options.registration;
        this.registration_view = options.registration_view;

        this.width = 342;
        this.height = 256;
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
            let tracks = this.video.srcObject.getTracks();
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

    startupStream: function () {
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

        this.video.addEventListener('canplay', () => {
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


    clearPhoto: function () {
        let context = this.canvas.getContext('2d');
        context.fillStyle = "#AAA";
        context.fillRect(0, 0, this.canvas.width, this.canvas.height);

        let data = this.canvas.toDataURL('image/png');
        this.photo.setAttribute('src', data);
        this.$('.btn-take-photo').hideIf(false);
        this.$('.btn-save').hideIf(true);
        this.$('.output').hideIf(true)
    },


    takePicture: function () {
        let context = this.canvas.getContext('2d');
        this.$('.btn-take-photo').hideIf(true);
        this.$('.btn-save').hideIf(false);
        this.$('.output').hideIf(false);
        if (this.width && this.height) {
            this.canvas.width = this.width;
            this.canvas.height = this.height;
            context.drawImage(this.video, 0, 0, this.width, this.height);
            context.globalCompositeOperation='destination-in';
            context.beginPath();
            context.closePath();
            context.fill();

            let data = this.canvas.toDataURL('image/png');
            this.photo.setAttribute('src', data);
        } else {
            this.clearPhoto();
        }
    },

    addAvatarSelecter: function () {
        if (this.contact){
            this.saveNotOwnAvatar();
        } else {
            this.saveAvatar();
        }
    },


    saveAvatar: function () {
        let blob = Images.getBlobImage(this.canvas.toDataURL('image/png').replace(/^data:image\/(png|gif|jpg|webp|jpeg);base64,/, '')),
            file = new File([blob], "avatar.png", {
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

    saveNotOwnAvatar: function () {
        let blob = Images.getBlobImage(this.canvas.toDataURL('image/png').replace(/^data:image\/(png|gif|jpg|webp|jpeg);base64,/, '')),
            file = new File([blob], "avatar.png", {
                type: "image/png",
            }),
            participant_node = '';
        if (this.participant && this.participant.get('id')){
            participant_node = '#' + this.participant.get('id');
        }
        file.base64 = this.canvas.toDataURL('image/png').replace(/^data:image\/(png|gif|jpg|webp|jpeg);base64,/, '');
        if (file && file.base64) {
            this.$('.modal-preloader-wrap').html(env.templates.contacts.preloader());
            this.$('.btn-save').addClass('hidden-disabled');
            this.$('.circle-icon').addClass('disabled');
            this.contact.pubAvatar(file, participant_node, () => {
                this.close();
                if (this.parent && this.participant) {
                    this.parent.updateMemberAvatar(this.participant, true);
                }
            }, () => {
                utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
            });
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
        "click .btn-save": "addAvatarSelecter",
        "click .btn-cancel": "close",
    },

    open: function (options) {
        this.account = options.model;
        this.contact = options.contact;
        this.participant = options.participant;
        this.parent = options.parent;
        this.registration = options.registration;
        this.registration_view = options.registration_view;
        this.emoji_panel_view = this.addChild('emoji_picker_panel', xabber.EmojiPickerView,{});
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

    addAvatarSelecter: function () {
        if (this.contact){
            this.saveNotOwnAvatar();
        } else {
            this.saveAvatar();
        }
    },

    saveAvatar: function () {
        let b64Image = Images.getDefaultAvatar(this.$('.chosen-emoji').data('value') ,this.$('.circle-avatar').css( "background-color" ), "96px EmojiFont", 176, 176),
            blob = Images.getBlobImage(b64Image),
            file = new File([blob], "avatar.png", {
                type: "image/png",
            });
        file.base64 = blob;
        if (this.registration && this.registration_view){
            if (file && file.base64) {
                this.registration_view.avatar = file;
                this.registration_view.$('.btn-next').prop('disabled', false);
                this.registration_view.$('.circle-avatar').addClass('changed');
                this.registration_view.$('.circle-avatar').setAvatar(b64Image, this.member_details_avatar_size);
                xabber._settings.save('main_color', this.$('.circle-avatar').attr('data-value'));
                xabber.trigger('update_main_color');
                this.close();
            }
        } else {
            if (file && file.base64) {
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

    saveNotOwnAvatar: function () {
        let blob = Images.getBlobImage(Images.getDefaultAvatar(this.$('.chosen-emoji').data('value') ,this.$('.circle-avatar').css( "background-color" ), "96px EmojiFont", 176, 176)),
            file = new File([blob], "avatar.png", {
                type: "image/png",
            }),
            participant_node = '';
        if (this.participant && this.participant.get('id')){
            participant_node = '#' + this.participant.get('id');
        }
        file.base64 = blob;
        if (file && file.base64) {
            this.$('.modal-preloader-wrap').html(env.templates.contacts.preloader());
            this.$('.btn-save').addClass('hidden-disabled');
            this.contact.pubAvatar(file, participant_node, () => {
                this.close();
                if (this.parent && this.participant) {
                    if (this.participant.get('jid') === this.account.get('jid'))
                        this.parent.updateMemberAvatar(this.participant, true);
                }
            }, () => {
                utils.dialogs.error(xabber.getString("group_settings__error__wrong_image"));
            });
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
        this.readEmojisJSON();
        this.show();
    },

    readEmojisJSON: function () {
        this.emojis = templates.emojis;

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
        this.listenTo(this.model, 'change:authentication', this.updateButtons);
        this.listenTo(xabber, 'quit', this.onQuit);
        return this;
    },

    render: function (options) {
        options || (options = {});
        this.is_login = options.login;
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
        Materialize && Materialize.updateTextFields && Materialize.updateTextFields();
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
        let password = this.$password_input.val();
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

    endAuth: function () {
        this.model.save('is_new', undefined);
        this.successFeedback(this.model);
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
        this.cancel();
        this.closeModal();
    },

    closeModal: function () {
        this.model.auth_view = null;
        this.$el.closeModal({ complete: this.hide.bind(this) });
    }
});

xabber.ChangeAccountPasswordView = xabber.BasicView.extend({
    className: 'modal main-modal change-account-password-modal',
    template: templates.change_account_password,
    events: {
        "click .btn-change": "submit",
        "click .btn-cancel": "close",
        "keyup input": "keyUp",
    },

    render: function (options) {
        this.account = options.model;
        this.$el.openModal({
            ready: this.onRender.bind(this),
            complete: this.close.bind(this)
        });
    },

    onRender: function () {
        this.$('.original-state').removeClass('hidden');
        this.$('.success-state').addClass('hidden');
        this.$old_password_input = this.$('input[name=old_password]');
        this.$password_input = this.$('input[name=password]');
        this.$password_confirm_input = this.$('input[name=password_confirm]');
        this.authFeedback({});
        this.$password_input.val('');
        this.$password_confirm_input.val('');
        this.$old_password_input.val('').focus();
        this.keyUp();
    },

    keyUp: function (ev) {
        ev && ev.keyCode === constants.KEY_ENTER && this.submit();
        if (this.$old_password_input.val() && this.$password_input.val() && this.$password_confirm_input.val()){
            this.$('.btn-change').prop('disabled', false);
        } else {
            this.$('.btn-change').prop('disabled', true);
        }
        this.authFeedback({});
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
        if (password !== password_confirm)
            return this.errorFeedback({password_confirm: xabber.getString("settings_account__alert_passwords_do_not_match")});
        old_password = old_password.trim();
        this.authFeedback({password_confirm: xabber.getString("dialog_change_password__feedback__text_auth_with_pass"), password_not_error: true});
        if (!this.account.change_password_connection_manager) {
            this.account.change_password_view = this;
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
        this.$password_confirm_input.switchClass('invalid', options.password_confirm && !options.password_not_error)
            .siblings('span.errors').switchClass('non-error', options.password_not_error).text(options.password_confirm || '');
        this.parent && this.parent.updateHeight();
    },

    errorFeedback: function (options) {
        if (this.account.change_password_connection)
            this.account.change_password_connection.disconnect();
        this.authFeedback(options);
    },

    successFeedback: function () {
        if (this.account.change_password_connection)
            this.account.change_password_connection.disconnect();
        this.$('.original-state').addClass('hidden');
        this.$('.success-state').removeClass('hidden');
    },

    onHide: function () {
        this.$el.detach();
        if (this.account && this.account.unregister_account_connection_manager && this.account.unregister_account_connection) {
            this.account.unregister_account_connection.disconnect();
        }
    },

    close: function () {
        this.closeModal();
    },

    closeModal: function () {
        this.$el.closeModal({ complete: this.hide.bind(this) });
    }
});

xabber.AuthView = xabber.BasicView.extend({
    _initialize: function () {
        this.$jid_input = this.$('input[name=jid]');
        this.$password_input = this.$('input[name=password]');
        this.listenTo(this.data, 'change:authentication', this.updateButtons);
        return this;
    },

    render: function () {
        this.onRender();
    },

    onRender: function () {
        this.account = null;
        this.authFeedback({});
        Materialize && Materialize.updateTextFields && Materialize.updateTextFields();
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
            jid = jid + '@' + domain;
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
                else {
                    this.account.trigger('start');
                }
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

    endAuth: function () {
        this.account.save('is_new', undefined);
        this.successFeedback(this.account);
        this.account.auth_view = null;
    },
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
        "change .device-metadata input[type=radio][name=device_metadata]": "setDeviceMetadata",
        "click .auth-settings": "openLoginSettings",
        "click .btn-choose-image": "chooseAvatar",
        "click .btn-emoji-panel": "openEmojiPanel",
        "click .btn-selfie": "openWebcamPanel",
        "click #select-xmpp-server .property-variant": "changePropertyValueRegistration",
        "click #select-auth-xmpp-server .property-variant": "changePropertyValueAuth",
    },

    __initialize: function () {
        this.$nickname_input = this.$('input[name=register_nickname]');
        this.$domain_input = this.$('input[name=register_domain]');
        this.listenTo(this.data, 'change:step', this.handleRegistrationStep);
        return this;
    },

    onRender: function () {
        this.data.set('step', 1);
        this.account = null;
        this.stepped_auth = true;
        this.stepped_auth_complete = false;
        this.authFeedback({});
        this.registerFeedback({});
        this.$('.btn-go-back').hideIf(false);
        this.$('.btn-skip').hideIf(true);
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
        this.$('#select-xmpp-server').hideIf(xabber.url_params.rkey);
        this.$('.select-xmpp-server .caret').hideIf(xabber.url_params.rkey);
        this.$(`.device-metadata input[type=radio][name=device_metadata][value=${xabber.settings.device_metadata}]`)
            .prop('checked', true);
        this.$(`.device-metadata-description`).text(xabber.getString(`settings__section_privacy__${xabber.settings.device_metadata}_metadata_description`));
        if (xabber.url_params.anchor === 'signup' || xabber.url_params.rkey)
            this.data.set('step', 2);
        else if (xabber.url_params.anchor === 'signin')
            this.data.set('step', 0);
        Materialize && Materialize.updateTextFields && Materialize.updateTextFields();
    },

    openButtonsMenu: function () {
        this.data.set('step', 1);
        this.$('.settings-block-wrap.privacy').addClass('hidden');
    },

    register: function () {
        if (this.data.get('registration')) {
            this.cancel();
            return;
        }
        this.$('.btn-next').prop('disabled', true);
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
            this.setCustomDomainRegistration(this.$('.register-form-jid .property-field.xmpp-server-dropdown-wrap .property-value'));
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
                this._registration_username = this.$jid_input.val();
                if (domain) {
                    if (this.auth_connection && this.auth_connection.domain !== domain)
                        this.auth_connection.disconnect();
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
        this.$('.input-field-jid .xmpp-server-dropdown-wrap').hideIf(this.$jid_input.val() && this.$jid_input.val().includes('@') && constants.LOGIN_CUSTOM_DOMAIN);
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
                    this._supports_check_user = true;
                continue;
            } else if (field.tagName.toLowerCase() === 'registered') {
                username_taken = true;
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
                $('<div/>', {class: 'property-variant set-default-domain available-domain'})
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
                        this.auth_connection._no_response = true;
                        this.auth_connection.disconnect()
                    }
                }, 10000);
        } else if (status === Strophe.Status.DISCONNECTED) {
            this.auth_connection && clearTimeout(this.auth_connection.openCheckTimeout);
            if (this.auth_connection && this.auth_connection._no_response) {
                this.registerFeedback({jid: xabber.getString("account_add__alert_invalid_domain")});
                this.$('.btn-next').prop('disabled', true);
            }
            this.auth_conn_manager = undefined;
            this.auth_connection = undefined;
        }
    },

    openPreviousStep: function () {
        let step = this.data.get('step');
        if(typeof step === 'number') {
            step--;
            this.data.set('step', step)
        }
    },

    openNextStep: function () {
        let step = this.data.get('step');
        if(typeof step === 'number') {
            step++;
            if (step === 6)
                return;
            this.data.set('step', step)
        }
    },

    handleRegistrationStep: function () {
        let step = this.data.get('step');
        if (step === -1){
            this.$(`.server-feature .preloader-wrapper`).addClass('active').addClass('visible');
            this.$(`.server-feature .mdi`).hideIf(true);
            this.$(`.server-feature`).removeClass('active-feature');
            this.$(`.server-feature .mdi`).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
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
            this.$domain_input.val('');
            this.$jid_input.val('');
            this.$password_input.val('');
            this.keyUpLogin();
            this.$('.login-step-wrap').hideIf(true);
            this.authFeedback({});
            this.resetAuthStepper();
            this.$('.login-panel-form.xmpp-login-form .buttons-wrap').removeClass('server-features-additional-button');
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
            this.$('.btn-skip').hideIf(false);
            this.$('.register-form-nickname').hideIf(true);
            this.$('.register-form-jid').hideIf(true);
            this.$('.register-form-password').hideIf(true);
            this.$('.register-form-picture').hideIf(false);
            this.$('.btn-next').prop('disabled', true);
            if (this.auth_connection)
                this.auth_connection.disconnect();
            if (this.account.connection && this.account.connection.register && this.account.connection.register._connection)
                this.account.connection.register._connection.disconnect();
            this.account.set('deferred_auth', true);
            setTimeout(() => {
                this.account.trigger('start');
            }, 1000)
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
        this.$('.register-form-jid .available-domain.property-variant').remove();
        if (all_servers.length)
            this.$('.register-form-jid .xmpp-server-dropdown-wrap .field-jid').text(all_servers[0]);
        else
            this.setCustomDomainRegistration(this.$('.register-form-jid .property-field.xmpp-server-dropdown-wrap .property-value'));
        this.$('.register-form-jid .modal-content .jid-field .set-default-domain').remove();

        for (let i = 0; i < all_servers.length; i++) {
            $('<div/>', {class: 'property-variant set-default-domain available-domain'})
                .text(all_servers[i])
                .attr('data-value', all_servers[i])
                .insertBefore(this.$('.register-form-jid .dropdown-content .set-custom-domain'));
        }
    },

    updateAuthDomains: function () {
        let all_servers = constants.LOGIN_DOMAINS;

        this.$('.login-form-jid .available-domain.property-variant').remove();
        if (all_servers.length)
            this.$('.login-form-jid .xmpp-server-dropdown-wrap .field-jid').text(all_servers[0]);
        else
            this.setCustomDomainAuth(this.$('.login-form-jid .property-field.xmpp-server-dropdown-wrap .property-value'));
        this.$('.login-form-jid .modal-content .jid-field .set-default-domain').remove();

        for (let i = 0; i < all_servers.length; i++) {
            $('<div/>', {class: 'property-variant set-default-domain available-domain'})
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

    openLoginSettings: function () {
        this.$('.settings-block-wrap.privacy').removeClass('hidden');
    },

    setDeviceMetadata: function (ev) {
        xabber._settings.save('device_metadata', ev.target.value);
        this.$(`.device-metadata-description`).text(xabber.getString(`settings__section_privacy__${xabber._settings.get('device_metadata')}_metadata_description`));
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
                                this.$(`.server-feature[data-xmlns="${Strophe.NS.AUTH_DEVICES}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                        this.$(`.server-feature[data-xmlns="${Strophe.NS.AUTH_DEVICES}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
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
                                    if (constants.RECOMMENDED_DOMAIN && (this.$('.server-feature.active-feature').length !== 6)){
                                        this.$('.server-features-error').text(xabber.getString('signin_not_all_features', [constants.RECOMMENDED_DOMAIN]));
                                        this.$('.login-panel-form.xmpp-login-form .buttons-wrap').addClass('server-features-additional-button');
                                        this.$('.btn-sign-up-instead').hideIf(false);
                                    }
                                    if (this.$('.server-feature.active-feature').length !== 6) {
                                        this.$('.btn-finish-log-in').text(xabber.getString('signin_proceed_anyway'));
                                        this.$('.btn-finish-log-in').addClass('btn-main').removeClass('btn-main-filled')
                                    }
                                    else {
                                        this.$('.btn-finish-log-in').text(xabber.getString('xaccount_next'));
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

    endAuth: function () {
        this.account.save('is_new', undefined);
        this.data.set('registration', false);
        this.data.set('authentication', false);
        !this.account.get('deferred_auth') && xabber.body.setScreen('all-chats', {right: null});
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
        this.$(`.login-step`).removeClass('active-feature');
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
                    if (this.account && this.account.connection){
                        if (constants.TRUSTED_DOMAINS.indexOf(this.account.connection.domain) > -1){
                            this.endAuth();
                        } else {
                            this.stepped_auth_complete = true;
                            if (this.first_features_received)
                                this.successFeedback();
                        }
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
        this.$('.btn-next').prop('disabled', false);
        if(this.account)
            this.account.destroy();
    },

    successRegistrationFeedback: function () {
        this.$jid_input.prop('disabled', false);
        this.$password_input.prop('disabled', false);
        this.$('.btn-next').prop('disabled', false);
        this.account.set('deferred_auth', false);
        xabber.toolbar_view.showAllChats()
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

    render: function () {
        this.$el.openModal({
            ready: this.onRender.bind(this),
            complete: this.close.bind(this)
        });
    },

    onRender: function () {
        this.data.set('step', 0);
        this.account = null;
        this.stepped_auth = true;
        this.stepped_auth_complete = false;
        this.authFeedback({});
        this.$jid_input = this.$('input[name=jid]');
        this.$password_input = this.$('input[name=password]');
        this.$domain_input = this.$('input[name=sign_in_domain]');
        this.$jid_input.val('');
        this.$password_input.val('');
        this.keyUpLogin();
        this.updateAuthDomains();
        this.$('.login-step-wrap').hideIf(true);
        this.resetAuthStepper();
        this.$('.login-panel-form.xmpp-login-form .buttons-wrap').removeClass('server-features-additional-button');
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
        Materialize && Materialize.updateTextFields && Materialize.updateTextFields();
        this.updateButtons();
        this.updateOptions && this.updateOptions();
    },

    handleRegistrationStep: function () {
        let step = this.data.get('step');
        if (step === -1){
            this.$(`.server-feature .preloader-wrapper`).addClass('active').addClass('visible');
            this.$(`.server-feature .mdi`).hideIf(true);
            this.$(`.server-feature`).removeClass('active-feature');
            this.$(`.server-feature .mdi`).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
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
        this.account.trigger('ready_to_get_roster');
        this.account.auth_view = null;
        this.closeModal();
    },

    checkFeaturesStepper: function () {
        this.$('.server-features-error').text('');
        let timeout_timer = 1000;
        setTimeout(() => {
            if (this.account && this.account.server_features.get(Strophe.NS.MAM)){
                this.$(`.server-feature[data-xmlns="${Strophe.NS.MAM}"]`).addClass('active-feature');
                this.$(`.server-feature[data-xmlns="${Strophe.NS.MAM}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
            }
            else
                this.$(`.server-feature[data-xmlns="${Strophe.NS.MAM}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
            this.$(`.server-feature[data-xmlns="${Strophe.NS.MAM}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
            setTimeout(() => {
                if (this.account && this.account.server_features.get(Strophe.NS.SYNCHRONIZATION)){
                    this.$(`.server-feature[data-xmlns="${Strophe.NS.SYNCHRONIZATION}"]`).addClass('active-feature');
                    this.$(`.server-feature[data-xmlns="${Strophe.NS.SYNCHRONIZATION}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                }
                else
                    this.$(`.server-feature[data-xmlns="${Strophe.NS.SYNCHRONIZATION}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                this.$(`.server-feature[data-xmlns="${Strophe.NS.SYNCHRONIZATION}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
                setTimeout(() => {
                    if (this.account && this.account.server_features.get(Strophe.NS.REWRITE)){
                        this.$(`.server-feature[data-xmlns="${Strophe.NS.REWRITE}"]`).addClass('active-feature');
                        this.$(`.server-feature[data-xmlns="${Strophe.NS.REWRITE}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                    }
                    else
                        this.$(`.server-feature[data-xmlns="${Strophe.NS.REWRITE}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                    this.$(`.server-feature[data-xmlns="${Strophe.NS.REWRITE}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
                    setTimeout(() => {
                        if (this.account && this.account.server_features.get(Strophe.NS.AUTH_DEVICES)) {
                            this.$(`.server-feature[data-xmlns="${Strophe.NS.AUTH_DEVICES}"]`).addClass('active-feature');
                            this.$(`.server-feature[data-xmlns="${Strophe.NS.AUTH_DEVICES}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                        }
                        else
                            this.$(`.server-feature[data-xmlns="${Strophe.NS.AUTH_DEVICES}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                        this.$(`.server-feature[data-xmlns="${Strophe.NS.AUTH_DEVICES}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
                        setTimeout(() => {
                            if (this.account && this.account.server_features.get(Strophe.NS.PUBSUB)){
                                this.$(`.server-feature[data-xmlns="${Strophe.NS.PUBSUB}"]`).addClass('active-feature');
                                this.$(`.server-feature[data-xmlns="${Strophe.NS.PUBSUB}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                            }
                            else
                                this.$(`.server-feature[data-xmlns="${Strophe.NS.PUBSUB}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                            this.$(`.server-feature[data-xmlns="${Strophe.NS.PUBSUB}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
                            setTimeout(() => {
                                if (this.account && this.account.server_features.get(Strophe.NS.HTTP_UPLOAD)){
                                    this.$(`.server-feature[data-xmlns="${Strophe.NS.HTTP_UPLOAD}"]`).addClass('active-feature');
                                    this.$(`.server-feature[data-xmlns="${Strophe.NS.HTTP_UPLOAD}"] .mdi`).hideIf(false).removeClass('.mdi-alert').addClass('mdi-checkbox-marked-circle');
                                }
                                else
                                    this.$(`.server-feature[data-xmlns="${Strophe.NS.HTTP_UPLOAD}"] .mdi`).hideIf(false).addClass('.mdi-alert').removeClass('mdi-checkbox-marked-circle');
                                this.$(`.server-feature[data-xmlns="${Strophe.NS.HTTP_UPLOAD}"] .preloader-wrapper`).removeClass('active').removeClass('visible');
                                setTimeout(() => {
                                    if (constants.RECOMMENDED_DOMAIN && (this.$('.server-feature.active-feature').length !== 6)){
                                        this.$('.server-features-error').text(xabber.getString('signin_not_all_features', [constants.RECOMMENDED_DOMAIN]));
                                    }
                                    if (this.$('.server-feature.active-feature').length !== 6)
                                        this.$('.btn-finish-log-in').text(xabber.getString('signin_proceed_anyway'));
                                    else
                                        this.$('.btn-finish-log-in').text(xabber.getString('xaccount_next'));
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


xabber.UnregisterAccountView = xabber.XmppLoginPanel.extend({
    className: 'modal main-modal unregister-account-modal',
    template: templates.unregister_account,

    events: {
        "click .login-type": "changeLoginType",
        "click .btn-log-in": "login",
        "click .btn-submit-unregister": "submitUnregister",
        "click .btn-cancel": "close",
        "keyup input[name=jid]": "keyUpLogin",
        "keyup input[name=password]": "keyUpLogin",
        "keyup input[name=sign_in_domain]": "keyUpLogin",
        "change input[type=checkbox]": "keyUpLogin",
        "click .property-variant": "changePropertyValueAuth"
    },

    render: function (options) {
        this.account = options.model;
        this.$el.openModal({
            ready: this.onRender.bind(this),
            complete: this.close.bind(this)
        });
    },

    onRender: function () {
        this.authFeedback({});
        this.data.set('step', 0);
        this.$jid_input = this.$('input[name=jid]');
        this.$password_input = this.$('input[name=password]');
        this.$('input[type=checkbox]').prop('checked', false);
        this.$jid_input.val('');
        this.$password_input.val('');
        this.keyUpLogin();
        Materialize && Materialize.updateTextFields && Materialize.updateTextFields();
    },

    keyUpLogin: function () {
        let checked_count = this.$('input[type=checkbox]:checked').length;
        if(this.$password_input.val() && checked_count === 2){
            this.$('.btn-log-in').prop('disabled', false);
        } else {
            this.$('.btn-log-in').prop('disabled', true);
        }
        if(this.$jid_input.val() && this.$jid_input.val() === `delete ${this.account.get('jid')} account`){
            this.$('.btn-submit-unregister').prop('disabled', false);
        } else {
            this.$('.btn-submit-unregister').prop('disabled', true);
        }
        this.authFeedback({});
    },

    authFeedback: function (options) {
        this.$jid_input.switchClass('invalid', options.jid);
        this.$('.login-form-jid .login-jid-error').text(options.jid || '').showIf(options.jid);
        this.$password_input.switchClass('invalid', options.password && !options.password_not_error);
        this.$('.login-form-jid .login-password-error').switchClass('non-error', options.password_not_error).text(options.password || '');
    },

    unregisterAccount: function (callback, errback) {
        let iq = $iq({
            type: 'set',
            to: this.connection.domain,
            from: this.get('jid')
        }).c('query', {xmlns:Strophe.NS.REGISTER}).c('remove');
        this.sendIQFast(iq, (success) => {
                callback && callback(success);
            },
            function (error) {
                errback && errback(error);
            });
    },

    login: function () {
        this.submit()
    },

    submit: function () {
        this.authFeedback({});
        let password = this.$password_input.val();
        if (!password)
            return this.errorFeedback({password: xabber.getString("dialog_change_password__error__text_input_pass")});
        this.authFeedback({password: xabber.getString("dialog_change_password__feedback__text_auth_with_pass"), password_not_error: true});
        if (!this.account.unregister_account_connection_manager) {
            this.account.unregister_account_view = this;
            this.account.unregister_account_connection_manager = new Strophe.ConnectionManager(this.account.CONNECTION_URL);
            this.account.unregister_account_connection = this.account.unregister_account_connection_manager.connection;
            this.account.unregister_account_connection.account = this.account;
            this.account.unregister_account_connection.register.connect_change_password(this.account.get('jid'), password, this.account.unregisterAccountCallback.bind(this.account))
        }
    },

    submitUnregister: function () {
        this.authFeedback({});
        if (this.$jid_input.val() !== `delete ${this.account.get('jid')} account`)
            return this.errorFeedback({jid: xabber.getString("settings_account__unregister_jid_mismatch")});
        if (this.account && this.account.unregister_account_connection_manager && this.account.unregister_account_connection) {
            this.account.unregister_account_connection.register.submit_unregister();
        } else {
            this.data.set('step', 0);
            return this.errorFeedback({password: xabber.getString("settings_account__connection_broken")});
        }
    },

    handleRegistrationStep: function () {
        let step = this.data.get('step');
        if (step === 0){
            this.$('.login-form-step-wrap').removeClass('hidden');
            this.$('.btn-log-in').removeClass('hidden');
            this.$('.btn-submit-unregister').addClass('hidden');
            this.$('.login-confirm-form-step-wrap').addClass('hidden');
            this.$('.modal-header span').text(xabber.getString('settings_account__delete_account_modal_title'));
            this.$('.modal-description-text').text(xabber.getString('settings_account__delete_account_modal_text'));
        } else if (step === 1) {
            this.$('.login-form-step-wrap').addClass('hidden');
            this.$('.btn-log-in').addClass('hidden');
            this.$('.btn-submit-unregister').removeClass('hidden');
            this.$('.login-confirm-form-step-wrap').removeClass('hidden');
            this.$('.modal-header span').text(xabber.getString('settings_account__confirm_delete_account_modal_title'));
            this.$('.modal-description-text').html(xabber.getString('settings_account__confirm_delete_account_modal_text', [`<nobr>delete ${this.account.get('jid')} account</nobr>`]));
        }
    },

    endAuth: function () {
    },

    checkFeaturesStepper: function () {
    },

    onHide: function () {
        this.$el.detach();
        if (this.account && this.account.unregister_account_connection_manager && this.account.unregister_account_connection) {
            this.account.unregister_account_connection.disconnect();
        }
    },

    close: function () {
        this.closeModal();
    },

    closeModal: function () {
        this.$el.closeModal({ complete: this.hide.bind(this) });
    }
});


xabber.CachedProxyUrls = Backbone.ModelWithDataBase.extend({

    putInCachedProxyUrls: function (value, callback) {
        this.database.put('cached_proxy_urls_items', value, function (response_value) {
            callback && callback(response_value);
        });
    },

    getFromCachedProxyUrls: function (value, callback) {
        this.database.get('cached_proxy_urls_items', value, function (response_value) {
            callback && callback(response_value);
        });
    },

    getAllFromCachedProxyUrls: function (callback) {
        this.database.get_all('cached_proxy_urls_items', null, function (response_value) {
            callback && callback(response_value || []);
        });
    },

    removeFromCachedProxyUrls: function (value, callback) {
        this.database.remove('cached_proxy_urls_items', value, function (response_value) {
            callback && callback(response_value);
        });
    },

    clearDataBase: function () {
        this.database.clear_database('cached_proxy_urls_items');
    },

    deleteDataBase: function () {
        this.database.delete_database('cached_proxy_urls_items');
    }
});

xabber.once("start", function () {
    this.xmpp_login_panel = xabber.login_page.addChild('xmpp_login', this.XmppLoginPanel);
    this.account_settings_modal = xabber.main_overlay_panel.addChild('account_settings_modal',
        this.Container, {classlist: 'account-settings-panel'});

    this.accounts = new this.Accounts(null, {
        storage_name: this.getStorageName() + '-accounts'
    });
    this.accounts.fetch();

    this.cached_proxy_urls = new xabber.CachedProxyUrls(null, {
        name:'cached-proxy-urls',
        objStoreName: 'cached_proxy_urls_items',
        primKey: 'original_url'
    });

    this.trigger('accounts_ready');

    this.toolbar_view.addChild('accounts', this.ToolbarAccountsBlockView,
        {model: this.accounts, el: this.toolbar_view.$('.accounts')[0]});
    this.settings_modal_view.addChild('accounts_modal', this.SettingsAccountsModalBlockView,
        {model: this.accounts, el: this.settings_modal_view.$('.accounts-info-wrap')[0]});


    this.on("add_account", function () {
        if (!this.add_account_view)
            this.add_account_view = new this.AddAccountView();
        this.add_account_view.show();
    }, this);

    this.on("unregister_account", function (account) {
        if (!this.unregister_account_view)
            this.unregister_account_view = new this.UnregisterAccountView();
        this.unregister_account_view.show({model: account});
    }, this);

    this.on("change_account_password", function (account) {
        if (!this.change_account_password_view)
            this.change_account_password_view = new this.ChangeAccountPasswordView();
        this.change_account_password_view.show({model: account});
    }, this);

    this.on("show_delete_files", function (options) {
        if (!this.delete_files_view)
            this.delete_files_view = new this.DeleteFilesFromGalleryView();
        this.delete_files_view.show(options);
    }, this);

    this.on("show_export_messages", function (options) {
        if (!this.export_history_view)
            this.export_history_view = new this.ExportChatHistoryView();
        this.export_history_view.show(options);
    }, this);

    $(window).bind('beforeunload',function(){
        xabber.current_voip_call && xabber.current_voip_call.reject();
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
}, xabber);

export default xabber;
