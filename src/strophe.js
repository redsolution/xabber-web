import xabber from "xabber-core";

let env = xabber.env,
    _ = env._,
    uuid = env.uuid,
    $iq = env.$iq,
    utils = env.utils,
    Strophe = env.Strophe,
    constants = env.constants;


Strophe.addConnectionPlugin('register', {
    _connection: null,

    //The plugin must have the init function.
    init: function(conn) {
        this._connection = conn;

        // compute free emun index number
        let i = 0;
        Object.keys(Strophe.Status).forEach(function (key) {
            i = Math.max(i, Strophe.Status[key]);
        });

        /* extend name space
         *  NS.REGISTER - In-Band Registration
         *              from XEP 77.
         */
        Strophe.addNamespace('REGISTER', 'jabber:iq:register');
        Strophe.Status.REGIFAIL        = i + 1;
        Strophe.Status.REGISTER        = i + 2;
        Strophe.Status.REGISTERED      = i + 3;
        Strophe.Status.CONFLICT        = i + 4;
        Strophe.Status.NOTACCEPTABLE   = i + 5;

        if (conn.disco) {
            if(conn.disco.addFeature)
                conn.disco.addFeature(Strophe.NS.REGISTER);
            if(conn.disco.addNode)
                conn.disco.addNode(Strophe.NS.REGISTER, {items:[]});
        }

        // hooking strophe's connection.reset
        let self = this, reset = conn.reset.bind(conn);
        conn.reset = function () {
            reset();
            self.instructions = "";
            self.fields = {};
            self.registered = false;
        };

        // hooking strophe's _connect_cb
        let connect_cb = conn._connect_cb.bind(conn);
        conn._connect_cb = function (req, callback, raw) {
            if (!self._registering) {
                if (self.processed_features) {
                    // exchange Input hooks to not print the stream:features twice
                    let xmlInput = conn.xmlInput;
                    conn.xmlInput = Strophe.Connection.prototype.xmlInput;
                    let rawInput = conn.rawInput;
                    conn.rawInput = Strophe.Connection.prototype.rawInput;
                    connect_cb(req, callback, raw);
                    conn.xmlInput = xmlInput;
                    conn.rawInput = rawInput;
                    delete self.processed_features;
                } else {
                    connect_cb(req, callback, raw);
                }
            } else {
                if(!self._check_user) {
                    // Save this request in case we want to authenticate later
                    self._connect_cb_data = {
                        req: req,
                        raw: raw
                    };
                    if (self._register_cb(req, callback, raw)) {
                        // remember that we already processed stream:features
                        self.processed_features = true;
                        delete self._registering;
                    }
                }
                else {
                    if (self._register_cb_check_user(req, callback, raw)) {
                        // remember that we already processed stream:features
                        self.processed_features = true;
                        delete self._registering;
                    }

                }
            }
        };

        // hooking strophe`s authenticate
        let auth_old = conn.authenticate.bind(conn);
        conn.authenticate = function(matched) {
            if (typeof matched === "undefined") {
                let conn = this._connection;

                if (!this.fields.username || !this.domain || !this.fields.password) {
                    Strophe.info("Register a JID first!");
                    return;
                }

                conn.jid = this.fields.username + "@" + this.domain;
                conn.authzid = Strophe.getBareJidFromJid(conn.jid);
                conn.authcid = Strophe.getNodeFromJid(conn.jid);
                conn.pass = this.fields.password;

                let req = this._connect_cb_data.req;
                let callback = conn.connect_callback;
                let raw = this._connect_cb_data.raw;
                conn._connect_cb(req, callback, raw);
            } else {
                auth_old(matched);
            }
        }.bind(this);

    },

    /** Function: connect
     *  Starts the registration process.
     *
     *  As the registration process proceeds, the user supplied callback will
     *  be triggered multiple times with status updates.  The callback
     *  should take two arguments - the status code and the error condition.
     *
     *  The status code will be one of the values in the Strophe.Status
     *  constants.  The error condition will be one of the conditions
     *  defined in RFC 3920 or the condition 'strophe-parsererror'.
     *
     *  Please see XEP 77 for a more detailed explanation of the optional
     *  parameters below.
     *
     *  Parameters:
     *    (String) domain - The xmpp server's Domain.  This will be the server,
     *      which will be contacted to register a new JID.
     *      The server has to provide and allow In-Band Registration (XEP-0077).
     *    (Function) callback The connect callback function.
     *    (Integer) wait - The optional HTTPBIND wait value.  This is the
     *      time the server will wait before returning an empty result for
     *      a request.  The default setting of 60 seconds is recommended.
     *      Other settings will require tweaks to the Strophe.TIMEOUT value.
     *    (Integer) hold - The optional HTTPBIND hold value.  This is the
     *      number of connections the server will hold at one time.  This
     *      should almost always be set to 1 (the default).
     */
    connect: function(domain, callback, wait, hold, route) {
        let conn = this._connection;
        this.domain = Strophe.getDomainFromJid(domain);
        this.instructions = "";
        this.fields = {};
        this.registered = false;

        this._registering = true;

        conn.connect(this.domain, "", callback, wait, hold, route);
    },


    connect_check_user: function(domain, callback, wait, hold, route) {
        let conn = this._connection;
        this.domain = Strophe.getDomainFromJid(domain);
        this.instructions = "";
        this.fields = {};
        this.registered = false;

        this._registering = true;
        this._check_user = true;

        conn.connect(this.domain, "", callback, wait, hold, route);
    },

    connect_change_password: function(jid, password, callback, wait, hold, route) {
        let conn = this._connection;
        this.domain = Strophe.getDomainFromJid(jid);
        this.instructions = "";
        this.fields = {};
        conn.registerSASLMechanisms([Strophe.SASLAnonymous,
            Strophe.SASLExternal,
            Strophe.SASLPlain,
            Strophe.SASLSHA1]);

        conn.connect(jid, password, callback, wait, hold, route);
    },

    /** PrivateFunction: _register_cb
     *  _Private_ handler for initial registration request.
     *
     *  This handler is used to process the initial registration request
     *  response from the BOSH server. It is used to set up a bosh session
     *  and requesting registration fields from host.
     *
     *  Parameters:
     *    (Strophe.Request) req - The current request.
     */
    _register_cb: function (req, _callback, raw) {
        let conn = this._connection;

        Strophe.info("_register_cb was called");
        conn.connected = true;

        let bodyWrap;
        try {
            bodyWrap = /** @type {Element} */
                '_reqToData' in conn._proto ? conn._proto._reqToData( /** @type {Request} */req) : req;
        } catch (e) {
            console.error(e);
            if (e.name !== Strophe.ErrorCondition.BAD_FORMAT) {
                throw e;
            }
            conn._changeConnectStatus(Strophe.Status.CONNFAIL, Strophe.ErrorCondition.BAD_FORMAT);
            conn._doDisconnect(Strophe.ErrorCondition.BAD_FORMAT);
        }
        if (!bodyWrap) {
            return;
        }

        if (conn.xmlInput !== Strophe.Connection.prototype.xmlInput) {
            if (bodyWrap.nodeName === conn._proto.strip && bodyWrap.childNodes.length) {
                conn.xmlInput(bodyWrap.childNodes[0]);
            } else {
                conn.xmlInput(bodyWrap);
            }
        }
        if (conn.rawInput !== Strophe.Connection.prototype.rawInput) {
            if (raw) {
                conn.rawInput(raw);
            } else {
                conn.rawInput(Strophe.serialize(bodyWrap));
            }
        }

        let conncheck = conn._proto._connect_cb(bodyWrap);
        if (conncheck === Strophe.Status.CONNFAIL) {
            return false;
        }

        // Check for the stream:features tag
        let register = bodyWrap.getElementsByTagName("register");
        let mechanisms = bodyWrap.getElementsByTagName("mechanism");
        if (register.length === 0 && mechanisms.length === 0) {
            conn._proto._no_auth_received(_callback);
            return false;
        }

        if (register.length === 0) {
            conn._changeConnectStatus(Strophe.Status.REGIFAIL, null);
            return true;
        }

        // send a get request for registration, to get all required data fields
        conn._addSysHandler(this._get_register_cb.bind(this),
            null, "iq", null, null);
        conn.send($iq({type: "get", id: uuid(), to: this.domain }).c("query",
            {xmlns: Strophe.NS.REGISTER}).tree());

        return true;
    },
    _register_cb_check_user: function (req, _callback, raw) {
        let conn = this._connection;

        Strophe.info("_register_cb was called");
        conn.connected = true;

        let bodyWrap;
        try {
            bodyWrap = /** @type {Element} */
                '_reqToData' in conn._proto ? conn._proto._reqToData( /** @type {Request} */req) : req;
        } catch (e) {
            console.error(e);
            if (e.name !== Strophe.ErrorCondition.BAD_FORMAT) {
                throw e;
            }
            conn._changeConnectStatus(Strophe.Status.CONNFAIL, Strophe.ErrorCondition.BAD_FORMAT);
            conn._doDisconnect(Strophe.ErrorCondition.BAD_FORMAT);
        }
        if (!bodyWrap) {
            return;
        }

        if (conn.xmlInput !== Strophe.Connection.prototype.xmlInput) {
            if (bodyWrap.nodeName === conn._proto.strip && bodyWrap.childNodes.length) {
                conn.xmlInput(bodyWrap.childNodes[0]);
            } else {
                conn.xmlInput(bodyWrap);
            }
        }
        if (conn.rawInput !== Strophe.Connection.prototype.rawInput) {
            if (raw) {
                conn.rawInput(raw);
            } else {
                conn.rawInput(Strophe.serialize(bodyWrap));
            }
        }

        let conncheck = conn._proto._connect_cb(bodyWrap);
        if (conncheck === Strophe.Status.CONNFAIL) {
            return false;
        }

        // Check for the stream:features tag
        let register = bodyWrap.getElementsByTagName("register");
        let mechanisms = bodyWrap.getElementsByTagName("mechanism");
        if (register.length === 0 && mechanisms.length === 0) {
            conn._proto._no_auth_received(_callback);
            return false;
        }

        if (register.length === 0) {
            conn._changeConnectStatus(Strophe.Status.REGIFAIL, null);
            return true;
        }
        conn._changeConnectStatus(Strophe.Status.REGISTER, null);

        return true;
    },

    /** PrivateFunction: _get_register_cb
     *  _Private_ handler for Registration Fields Request.
     *
     *  Parameters:
     *    (XMLElement) elem - The query stanza.
     *
     *  Returns:
     *    false to remove SHOULD contain the registration information currentlSHOULD contain the registration information currentlSHOULD contain the registration information currentlthe handler.
     */
    _get_register_cb: function (stanza) {
        let i, query, field, conn = this._connection;
        query = stanza.getElementsByTagName("query");

        if (query.length !== 1) {
            conn._changeConnectStatus(Strophe.Status.REGIFAIL, "unknown");
            return false;
        }
        query = query[0];
        // get required fields
        for (i = 0; i < query.childNodes.length; i++) {
            field = query.childNodes[i];
            if (field.tagName.toLowerCase() === 'instructions') {
                // this is a special element
                // it provides info about given data fields in a textual way.
                conn.register.instructions = Strophe.getText(field);
                continue;
            } else if (field.tagName.toLowerCase() === 'x') {
                // ignore x for now
                continue;
            }
            conn.register.fields[field.tagName.toLowerCase()] = Strophe.getText(field);
        }
        conn._changeConnectStatus(Strophe.Status.REGISTER, null);
        return false;
    },

    /** Function: submit
     *  Submits Registration data.
     *
     *  As the registration process proceeds, the user supplied callback will
     *  be triggered with status code Strophe.Status.REGISTER. At this point
     *  the user should fill all required fields in connection.register.fields
     *  and invoke this function to procceed in the registration process.
     */
    submit: function () {
        let lang = xabber.settings.language;
        (lang === 'default') && (lang = xabber.get('default_language'));
        let i, name, query, fields, conn = this._connection;
        query = $iq({type: "set", 'xml:lang': lang, id: uuid()}).c("query", {xmlns:Strophe.NS.REGISTER});

        // set required fields
        fields = Object.keys(this.fields);
        for (i = 0; i < fields.length; i++) {
            name = fields[i];
            query.c(name).t(this.fields[name]).up();
        }

        // providing required information
        conn._addSysHandler(this._submit_cb.bind(this),
            null, "iq", null, null);
        conn.send(query);
    },

    /** PrivateFunction: _submit_cb
     *  _Private_ handler for submitted registration information.
     *
     *  Parameters:
     *    (XMLElement) elem - The query stanza.
     *
     *  Returns:
     *    false to remove the handler.
     */
    _submit_cb: function (stanza) {
        let i, query, field, error = null, conn = this._connection;

        query = stanza.getElementsByTagName("query");
        if (query.length > 0) {
            query = query[0];
            // update fields
            for (i = 0; i < query.childNodes.length; i++) {
                field = query.childNodes[i];
                if (field.tagName.toLowerCase() === 'instructions') {
                    // this is a special element
                    // it provides info about given data fields in a textual way
                    this.instructions = Strophe.getText(field);
                    continue;
                }
                this.fields[field.tagName.toLowerCase()] = Strophe.getText(field);
            }
        }

        if (stanza.getAttribute("type") === "error") {
            error = stanza.getElementsByTagName("error");
            let error_text = stanza.getElementsByTagName("text");
            if (error_text.length > 0)
                error_text = error_text[0].innerHTML;
            if (error.length !== 1) {
                conn._changeConnectStatus(Strophe.Status.REGIFAIL, "unknown");
                return false;
            }

            Strophe.info("Registration failed.");

            // this is either 'conflict' or 'not-acceptable'
            error = error[0].firstChild.tagName.toLowerCase();
            if (error === 'conflict') {
                conn._changeConnectStatus(Strophe.Status.CONFLICT, error, error_text);
            } else if (error === 'not-acceptable') {
                conn._changeConnectStatus(Strophe.Status.NOTACCEPTABLE, error, error_text);
            } else {
                conn._changeConnectStatus(Strophe.Status.REGIFAIL, error, error_text);
            }
        } else {
            Strophe.info("Registration successful.");

            conn._changeConnectStatus(Strophe.Status.REGISTERED, null);
        }

        return false;
    },

    submit_unregister: function () {
        let lang = xabber.settings.language;
        (lang === 'default') && (lang = xabber.get('default_language'));
        let query, conn = this._connection;
        query = $iq({type: "set", 'xml:lang': lang, id: uuid()}).c("query", {xmlns:Strophe.NS.REGISTER}).c('remove');

        conn._addSysHandler(this._submit_unregister_cb.bind(this),
            null, "iq", null, null);
        conn.send(query);
    },

    _submit_unregister_cb: function (stanza) {
        let error = null, conn = this._connection;

        if (stanza.getAttribute("type") === "error") {
            error = stanza.getElementsByTagName("error");
            let error_text = stanza.getElementsByTagName("text");
            if (error_text.length > 0)
                error_text = error_text[0].innerHTML;
            if (error.length !== 1) {
                conn._changeConnectStatus(Strophe.Status.REGIFAIL, "unknown");
                return false;
            }

            Strophe.info("Unregistration failed.");

            // this is either 'conflict' or 'not-acceptable'
            error = error[0].firstChild.tagName.toLowerCase();
            if (error === 'conflict') {
                conn._changeConnectStatus(Strophe.Status.CONFLICT, error, error_text);
            } else if (error === 'not-acceptable') {
                conn._changeConnectStatus(Strophe.Status.NOTACCEPTABLE, error, error_text);
            } else {
                conn._changeConnectStatus(Strophe.Status.REGIFAIL, error, error_text);
            }
        } else {
            Strophe.info("Unregistration successful.");

            conn._changeConnectStatus(Strophe.Status.REGISTERED, null);
        }

        return false;
    }
});


let utf16to8 = function (str) {
    let i, c;
    let out = "";
    let len = str.length;
    for (i = 0; i < len; i++) {
        c = str.charCodeAt(i);
        if ((c >= 0x0000) && (c <= 0x007F)) {
            out += str.charAt(i);
        } else if (c > 0x07FF) {
            out += String.fromCharCode(0xE0 | ((c >> 12) & 0x0F));
            out += String.fromCharCode(0x80 | ((c >>  6) & 0x3F));
            out += String.fromCharCode(0x80 | ((c >>  0) & 0x3F));
        } else {
            out += String.fromCharCode(0xC0 | ((c >>  6) & 0x1F));
            out += String.fromCharCode(0x80 | ((c >>  0) & 0x3F));
        }
    }
    return out;
};

function generateChallenge() {
    let array = new Uint8Array(5);
    window.crypto.getRandomValues(array);

    let challenge = '';
    array.forEach(byte => {
        // Преобразуем каждый байт в двухсимвольное шестнадцатеричное значение
        challenge += byte.toString(16).padStart(2, '0').toUpperCase();
    });

    return challenge; // 10-значный Challenge
}

Strophe.SASLHOTP = function() {};
Strophe.SASLHOTP.prototype = new Strophe.SASLMechanism("HOTP", true, 100);

Strophe.SASLHOTP.prototype.test = function () {
    return true;
};

Strophe.SASLHOTP.prototype.onChallenge = function (connection) {
    let auth_str = String.fromCharCode(0) + connection.authcid +
        String.fromCharCode(0) + connection.hotp_pass;
    return utf16to8(auth_str);
};

Strophe.SASLOCRA = function() {};
Strophe.SASLOCRA.prototype = new Strophe.SASLMechanism("DEVICES-OCRA", true, 150);

Strophe.SASLOCRA.prototype.test = function () {
    return true;
};

Strophe.SASLOCRA.prototype.onChallenge = function (connection, server_challenge) {

    if (server_challenge){
        return new Promise((resolve, reject) => {
            server_challenge = server_challenge.split(String.fromCharCode(0));
            let sv_response = server_challenge[0],
                suite = server_challenge[1],
                sv_challenge = server_challenge[2];
            utils.OCRA.generateOCRAasync(
                constants.OCRA_SUITE,
                connection.x_token.token,
                0,
                connection.cl_challenge
            ).then((cl_OCRA) => {
                connection.cl_OCRA = btoa(cl_OCRA);
                if (sv_response === connection.cl_OCRA){
                    utils.OCRA.generateOCRAasync(
                        suite,
                        connection.x_token.token,
                        connection.counter,
                        sv_challenge
                    ).then((sv_OCRA) => {
                        connection.sv_OCRA = btoa(sv_OCRA);
                        resolve(utf16to8(connection.sv_OCRA)); // сделать ocra из своего челленджа и проверять респонс сервера
                    });
                } else {
                    reject('Challenge does not match');
                }
            });
        })
    } else {
        let auth_str = 'n,,' +
            String.fromCharCode(0) + connection.authcid +
            String.fromCharCode(0) + connection.x_token.token_uid +
            String.fromCharCode(0) + constants.OCRA_SUITE +
            String.fromCharCode(0) + connection.cl_challenge +
            String.fromCharCode(0) + connection.x_token.validation_key;
        return utf16to8(auth_str);
    }
};

Strophe.ConnectionManager = function (CONNECTION_URL, options) {
    options = options || {};
    this.connection = new Strophe.Connection(CONNECTION_URL, options);
};

Strophe.ConnectionManager.prototype = {
    connect: function (auth_type, jid, password, callback) {
        this.connection.mechanisms = {};
        this.auth_type = auth_type || 'password';
        if (this.auth_type === 'password') {
            this.connection.registerSASLMechanisms([Strophe.SASLAnonymous,
                Strophe.SASLExternal,
                Strophe.SASLPlain,
                Strophe.SASLSHA1]);
        } else if (this.auth_type === 'x-token') {
            this.connection.registerSASLMechanisms([Strophe.SASLHOTP, Strophe.SASLOCRA]);
            delete this.connection._sasl_data["server-signature"];
            this.connection.cl_challenge = generateChallenge();
            utils.generateHOTP(utils.fromBase64toArrayBuffer(password), this.connection.counter).then((pass) => {
                if (pass)
                    this.connection.hotp_pass = pass;
            }).then(() => {
                this.connection.connect(jid, password, callback)
            });
            return;
        } else {
            this.connection.registerSASLMechanisms([Strophe.SASLXOAuth2]);
            delete this.connection._sasl_data["server-signature"];
        }
        this.connection.connect(jid, password, callback);
    },

    reconnect: function (callback) {
        if (this.auth_type === 'x-token') {
            if (!this.connection.mechanisms["OCRA"]) {
                this.connection.registerSASLMechanism(Strophe.SASLOCRA);
                delete this.connection._sasl_data["server-signature"];
            }
            if (!this.connection.mechanisms["HOTP"]) {
                this.connection.registerSASLMechanism(Strophe.SASLHOTP);
                delete this.connection._sasl_data["server-signature"];
            }
            if (this.connection.account && this.connection.account.get('hotp_counter'))
                this.connection.counter = this.connection.account.get('hotp_counter');
            this.connection.cl_challenge = generateChallenge();
            utils.generateHOTP(utils.fromBase64toArrayBuffer(this.connection.pass), this.connection.counter).then((pass) => {
                if (pass)
                    this.connection.hotp_pass = pass;
            }).then(() => {
                this.connection.connect(this.connection.jid, this.connection.pass, callback)
            });
            return;
        }
        this.connection.connect(this.connection.jid, this.connection.pass, callback);
    }
};

_.extend(Strophe.Connection.prototype, {

    addHandler: function(handler, ns, name, type, id, from, options) {
        const hand = new Strophe.Handler(handler, ns, name, type, id, from, options);
        this.addHandlers.push(hand);

        let res = (this.authenticated && !this.disconnecting && this.account && this.account.session.get('connected') && this.account.get('status') !== 'offline');

        if (!res) {
            if (this.streamManagement && this.streamManagement._isStreamManagementEnabled && this.streamManagement.getResumeToken()) {
                if (this.streamManagement._resumeState){
                    let index = this.streamManagement._resumeState.addHandlersAfterDisconnect.indexOf(hand);
                    if (index === -1) {
                        this.streamManagement._resumeState.addHandlersAfterDisconnect.push(hand);
                    }
                }
            }
        }
        return hand;
    },

    _addSysHandler: function(handler, ns, name, type, id, from, options ) {
        const hand = new Strophe.Handler(handler, ns, name, type, id, from, options);
        hand.user = false;

        this.addHandlers.push(hand);

        let res = (this.authenticated && !this.disconnecting && this.account && this.account.session.get('connected') && this.account.get('status') !== 'offline');

        if (!res) {
            if (this.streamManagement && this.streamManagement._isStreamManagementEnabled && this.streamManagement.getResumeToken()) {
                if (this.streamManagement._resumeState){
                    let index = this.streamManagement._resumeState.addHandlersAfterDisconnect.indexOf(hand);
                    if (index === -1) {
                        this.streamManagement._resumeState.addHandlersAfterDisconnect.push(hand);
                    }
                }
            }
        }
        return hand;
    },

    deleteHandler: function(handRef) {
        // this must be done in the Idle loop so that we don't change
        // the handlers during iteration
        let handler_index = this.handlers.indexOf(handRef);
        if (handler_index === -1){
            let query_msg_handler = this.handlers.find(item => (item && item.options && handRef && handRef.options)
                && (item.options.query_id && handRef.options.query_id && item.options.query_id === handRef.options.query_id));
            query_msg_handler && (handRef = query_msg_handler);
        }

        this.removeHandlers.push(handRef);

        // If a handler is being deleted while it is being added,
        // prevent it from getting added

        let add_index = this.addHandlers.indexOf(handRef);
        if (add_index >= 0) {
            this.addHandlers.splice(add_index, 1);
        }
        // remove temp handlers that otherwise are reinstatted after resume
        if (this.streamManagement && this.streamManagement._resumeState && this.streamManagement._resumeState.addHandlersAfterDisconnect){
            let after_disconnect_index = this.streamManagement._resumeState.addHandlersAfterDisconnect.indexOf(handRef);
            if (after_disconnect_index >= 0) {
                this.streamManagement._resumeState.addHandlersAfterDisconnect.splice(after_disconnect_index, 1);
            }
        }
    },

    _attemptSASLAuth: function (mechanisms) {
        mechanisms = this.sortMechanismsByPriority(mechanisms || []);
        let mechanism_found = false;
        for (let i = 0; i < mechanisms.length; ++i) {
            if (!mechanisms[i].test(this)) {
                continue;
            }
            this._sasl_success_handler = this._addSysHandler(this._sasl_success_cb.bind(this), null, 'success', null, null);
            this._sasl_failure_handler = this._addSysHandler(this._sasl_failure_cb.bind(this), null, 'failure', null, null);
            this._sasl_challenge_handler = this._addSysHandler(this._sasl_challenge_cb.bind(this), null, 'challenge', null, null);
            this._sasl_mechanism = mechanisms[i];
            this._sasl_mechanism.onStart(this);
            const request_auth_exchange = $build('auth', {
                'xmlns': Strophe.NS.SASL,
                'mechanism': this._sasl_mechanism.mechname
            });
            if (this._sasl_mechanism.isClientFirst) {
                const response = this._sasl_mechanism.clientChallenge(this);
                request_auth_exchange.t(btoa(response));
            }
            this.send(request_auth_exchange.tree());
            mechanism_found = true;
            if (this.account && this.counter && this.account.get('x_token') && this._sasl_mechanism.mechname === "HOTP") {
                this.counter++;
                this.account.save({
                    hotp_counter: this.counter,
                });
                this.account.counter_changes_logging.updateCountersList(this.account);
            }
            if (this.account && this.counter && this.account.get('x_token') && this._sasl_mechanism.mechname === "DEVICES-OCRA") {
                this.account.save({
                    auth_stanza: request_auth_exchange.tree(),
                    auth_stanza_time: new Date(),
                });
                this.account.counter_changes_logging.updateCountersList(this.account);
            }
            break;
        }
        return mechanism_found;
    },

    _sasl_success_cb: function(elem) {
        if (this._sasl_data['server-signature']) {
            let serverSignature;
            const success = atob(Strophe.getText(elem));
            const attribMatch = /([a-z]+)=([^,]+)(,|$)/;
            const matches = success.match(attribMatch);
            if (matches[1] === 'v') {
                serverSignature = matches[2];
            }
            if (serverSignature !== this._sasl_data['server-signature']) {
                // remove old handlers
                this.deleteHandler(this._sasl_failure_handler);
                this._sasl_failure_handler = null;
                if (this._sasl_challenge_handler) {
                    this.deleteHandler(this._sasl_challenge_handler);
                    this._sasl_challenge_handler = null;
                }
                this._sasl_data = {};
                return this._sasl_failure_cb(null);
            }
        }
        Strophe.info('SASL authentication succeeded.');
        if (this._sasl_data.keys) {
            this.scram_keys = this._sasl_data.keys;
        }
        if (this._sasl_mechanism) {
            this._sasl_mechanism.onSuccess();
        }
        // remove old handlers
        this.deleteHandler(this._sasl_failure_handler);
        this._sasl_failure_handler = null;
        this.deleteHandler(this._sasl_success_handler);
        this._sasl_success_handler = null;
        if (this._sasl_challenge_handler) {
            this.deleteHandler(this._sasl_challenge_handler);
            this._sasl_challenge_handler = null;
        }
        /** @type {Handler[]} */
        const streamfeature_handlers = [];

        /**
         * @param {Handler[]} handlers
         * @param {Element} elem
         */
        const wrapper = (handlers, elem) => {
            while (handlers.length) {
                this.deleteHandler(handlers.pop());
            }
            this._onStreamFeaturesAfterSASL(elem);
            return false;
        };
        streamfeature_handlers.push(this._addSysHandler( /** @param {Element} elem */
        elem => wrapper(streamfeature_handlers, elem), null, 'stream:features', null, null));
        streamfeature_handlers.push(this._addSysHandler( /** @param {Element} elem */
        elem => wrapper(streamfeature_handlers, elem), NS.STREAM, 'features', null, null));

        // we must send an xmpp:restart now
        this._sendRestart();
        return false;
    },

    _sasl_challenge_cb: async function(elem) {
        let challenge = atob(Strophe.getText(elem));
        if (this._sasl_mechanism.mechname === 'DEVICES-OCRA'){
            this._sasl_mechanism.onChallenge(this, challenge).then((response)=> {
                let stanza = $build('response', {
                    'xmlns': Strophe.NS.SASL
                });
                if (response) stanza.t(btoa(response));
                this.send(stanza.tree());
                if (this.account && this.counter && this.account.get('x_token')) {
                    this.counter++;
                    this.account.save({
                        hotp_counter: this.counter,
                        challenge_stanza: elem,
                        challenge_response_stanza_time: new Date(),
                        response_stanza: stanza.tree(),
                    });
                    this.account.counter_changes_logging.updateCountersList(this.account);
                }
                return true;
            }, (err)=> {
                throw new Error(err);
            });

        } else {
            let response = await this._sasl_mechanism.onChallenge(this, challenge);
            let stanza = $build('response', {
                'xmlns': Strophe.NS.SASL
            });
            if (response) stanza.t(btoa(response));
            this.send(stanza.tree());
            return true;
        }
    },

    _onStreamFeaturesAfterSASL: function (elem) {
        this.features = elem;
        let i, child;
        for (i = 0; i < elem.childNodes.length; i++) {
            child = elem.childNodes[i];
            if (child.nodeName === 'bind') {
                this.do_bind = true;
            }

            if (child.nodeName === 'session') {
                this.do_session = true;
            }

            if (child.nodeName === 'c' && child.namespaceURI === Strophe.NS.CAPS) {
                this.caps_ver = child.getAttribute('ver');
            }

            if ((child.nodeName === 'devices') && child.namespaceURI === Strophe.NS.AUTH_DEVICES && this.options['x-token']) {
                this.x_token_auth = true;
            }

            if ((child.nodeName === 'synchronization') && (child.namespaceURI === Strophe.NS.SYNCHRONIZATION)) {
                this.account.server_features.create({
                    'var': child.namespaceURI,
                    from: this.domain
                });
                this.do_synchronization = true;
            }

            if ((child.nodeName === 'sub') && (child.namespaceURI === Strophe.NS.SUBSCRIPTION_PREAPPROVAL)) {
                this.account.server_features.create({
                    'var': child.namespaceURI,
                    from: this.domain
                });
            }
        }

        if (!this.do_bind) {
            this._changeConnectStatus(Strophe.Status.AUTHFAIL, null);
            return false;
        } else if (!this.options.explicitResourceBinding) {
            if (this.x_token_auth &&
                (!this.x_token || (this.x_token && this.x_token.expire && (parseInt(this.x_token.expire)*1000 < env.moment.now())))
            ) {
                this.getXToken((success) => {
                    let token = $(success).find('secret').text(),
                        expires_at = $(success).find('expire').text(),
                        validation_key = $(success).find('validation-key').text(),
                        token_uid = $(success).find('device').attr('id');
                    this.x_token = {token: token, expire: expires_at, validation_key: validation_key, token_uid: token_uid,};
                    this.counter = 1;
                    this.pass = token;
                    this._send_auth_bind();
                    if (this.account) {
                        this.account.save({
                            hotp_counter: this.counter,
                            password: null,
                        });
                        this.account.counter_changes_logging.updateCountersList(this.account);
                    }
                }, () => {
                    this._send_auth_bind();
                });
            }
            else {
                this._send_auth_bind();
            }
        } else {
            this._changeConnectStatus(Strophe.Status.BINDREQUIRED, null);
        }
        return false;
    },

    _send_auth_bind() {

        if (!this.do_bind) {
            Strophe.info(`Connection.prototype.bind called but "do_bind" is false`);
            return;
        }

        this._addSysHandler(this._onResourceBindResultIQ.bind(this), null, null,
            null, "_bind_auth_2");

        let resource = Strophe.getResourceFromJid(this.jid);
        if (resource) {
            this.send($iq({type: "set", id: "_bind_auth_2"})
                .c('bind', {xmlns: Strophe.NS.BIND})
                .c('resource', {}).t(resource).tree());
        } else {
            this.send($iq({type: "set", id: "_bind_auth_2"})
                .c('bind', {xmlns: Strophe.NS.BIND})
                .tree());
        }
    },

    getXToken: function (callback, errback) {
        let uniq_id = uuid(), old_token,
            iq = $iq({
            type: 'set',
            to: this.account.get('jid'),
            id: uniq_id
        }).c('register', { xmlns: Strophe.NS.AUTH_DEVICES});
        this.account && (old_token = this.account.get('old_device_token'));
        let client_name = constants.CLIENT_NAME,
            public_label = client_name;
        if (xabber.settings.device_metadata === 'contacts'){
            public_label = client_name + `, PC, ${utils.getOS()}, ${env.utils.getBrowser()}`;
        } else {
            public_label = utils.generateDeviceName();
        }
        if (old_token){
            iq.c('device', { xmlns: Strophe.NS.AUTH_DEVICES, id: old_token})
                .c('client').t(client_name).up()
                .c('public-label').t(public_label).up();
            if (this.server_mechanisms.includes('DEVICES-OCRA')){
                iq.c('type').t('xabber-web').up()
            }
            if (xabber.settings.device_metadata === 'contacts' || xabber.settings.device_metadata === 'server'){
                iq.c('info').t(`PC, ${utils.getOS()}, ${env.utils.getBrowser()}`);
            } else {
                iq.c('info').t(public_label);
            }
            this.account.save('old_device_token', null);
        } else {
            iq.c('device', { xmlns: Strophe.NS.AUTH_DEVICES})
                .c('client').t(client_name).up()
                .c('public-label').t(public_label).up();
            if (this.server_mechanisms.includes('DEVICES-OCRA')){
                iq.c('type').t('xabber-web').up()
            }
            if (xabber.settings.device_metadata === 'contacts' || xabber.settings.device_metadata === 'server'){
                iq.c('info').t(`PC, ${utils.getOS()}, ${env.utils.getBrowser()}`);
            } else {
                iq.c('info').t(public_label);
            }
        }
        let handler = function (stanza) {
            let iqtype = stanza.getAttribute('type');
            if (iqtype === 'result') {
                if (callback) {
                    callback(stanza);
                }
            } else if (iqtype === 'error') {
                if (errback) {
                    errback(stanza);
                }
            } else {
                throw {
                    name: "StropheError",
                    message: "Got bad IQ type of " + iqtype
                };
            }
        };

        this._addSysHandler(handler.bind(this), Strophe.NS.AUTH_DEVICES, 'iq', 'result' , uniq_id);

        this.send(iq.tree());
    },

    _connect_cb: function (req, _callback, raw) {
        Strophe.info("_connect_cb was called");
        this.connected = true;
        let bodyWrap;
        try {
            bodyWrap = /** @type {Element} */
                '_reqToData' in this._proto ? this._proto._reqToData( /** @type {Request} */req) : req;
        } catch (e) {
            if (e.name !== Strophe.ErrorCondition.BAD_FORMAT) {
                throw e;
            }
            this._changeConnectStatus(Strophe.Status.CONNFAIL, Strophe.ErrorCondition.BAD_FORMAT);
            this._doDisconnect(Strophe.ErrorCondition.BAD_FORMAT);
        }
        if (!bodyWrap) {
            return;
        }
        if (this.xmlInput !== Connection.prototype.xmlInput) {
            if (bodyWrap.nodeName === this._proto.strip && bodyWrap.childNodes.length) {
                this.xmlInput(bodyWrap.childNodes[0]);
            } else {
                this.xmlInput(bodyWrap);
            }
        }
        if (this.rawInput !== Connection.prototype.rawInput) {
            if (raw) {
                this.rawInput(raw);
            } else {
                this.rawInput(Builder.serialize(bodyWrap));
            }
        }
        const conncheck = this._proto._connect_cb(bodyWrap);
        if (conncheck === Status.CONNFAIL) {
            return;
        }

        // Check for the stream:features tag
        let hasFeatures;
        if (bodyWrap.getElementsByTagNameNS) {
            hasFeatures = bodyWrap.getElementsByTagNameNS(NS.STREAM, 'features').length > 0;
        } else {
            hasFeatures = bodyWrap.getElementsByTagName('stream:features').length > 0 || bodyWrap.getElementsByTagName('features').length > 0;
        }
        if (!hasFeatures) {
            this._proto._no_auth_received(_callback);
            return;
        }
        let server_mechanisms = [],
            mechanisms = bodyWrap.getElementsByTagName("mechanism");
        if (mechanisms.length > 0) {
            for (let i = 0; i < mechanisms.length; i++) {
                let mech = Strophe.getText(mechanisms[i]);
                server_mechanisms.push(mech);
            }
        }

        this.server_mechanisms = server_mechanisms; // to check if server supports OCRA

        const matched = Array.from(bodyWrap.getElementsByTagName('mechanism')).map(m => this.mechanisms[m.textContent]).filter(m => m);
        if (matched.length === 0) {
            if (bodyWrap.getElementsByTagName('auth').length === 0) {
                // There are no matching SASL mechanisms and also no legacy
                // auth available.
                this._proto._no_auth_received(_callback);
                return;
            }
        }
        if (this.do_authentication !== false) {
            this.resume();
            this.authenticate(matched);
        }
    },
});

_.extend(Strophe.Websocket.prototype, {

    _onIdle: function () {
        const data = this._conn._data;
        if (data.length > 0 && !this._conn.paused) {
            for (let i = 0; i < data.length; i++) {
                if (data[i] !== null) {
                    const stanza = data[i] === 'restart' ? this._buildStream().tree() : data[i];
                    if (stanza === 'restart') throw new Error('Wrong type for stanza'); // Shut up tsc
                    const rawStanza = Builder.serialize(stanza);
                    this._conn.xmlOutput(stanza);
                    this._conn.rawOutput(rawStanza);
                    if (this.socket && this.socket.readyState === 1){
                        this.socket.send(rawStanza);
                    } else {
                        console.error('data went to pending');
                        console.log(this._conn._data.slice(i));
                        this._conn.account._pending_stanzas.push(this._conn._data.slice(i));
                        this._conn._data = [];
                        return;
                    }
                }
            }
            this._conn._data = [];
        }
    },

    _onOpen: function() {
        Strophe.debug('Websocket open');
        const start = this._buildStream();
        this._conn.xmlOutput(start.tree());
        const startString = Builder.serialize(start);
        this._conn.rawOutput(startString);
        this.socket.send(startString);

        this._conn.openCheckTimeout = setTimeout(() => { // check of that open was sent but was not received from server
            if (this._conn.open_received) {

            } else {
                this._conn.disconnect('disconnected on open not being received');

            }
        }, 5000)
    },

    _handleStreamStart: function(message) {
        let error = null;

        // Check for errors in the <open /> tag
        const ns = message.getAttribute('xmlns');
        if (typeof ns !== 'string') {
            error = 'Missing xmlns in <open />';
        } else if (ns !== NS.FRAMING) {
            error = 'Wrong xmlns in <open />: ' + ns;
        }
        const ver = message.getAttribute('version');
        if (typeof ver !== 'string') {
            error = 'Missing version in <open />';
        } else if (ver !== '1.0') {
            error = 'Wrong version in <open />: ' + ver;
        }
        if (error) {
            this._conn._changeConnectStatus(Strophe.Status.CONNFAIL, error);
            this._conn._doDisconnect();
            return false;
        }
        clearTimeout(this._conn.openCheckTimeout);
        return true;
    },
});

Strophe.xmlunescape = function (text) {
    let reg_exp = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&apos;': "'"
    };
    let escaper = function(match) {
        return reg_exp[match];
    };
    // Regexes for identifying a key that needs to be escaped
    let source = '(?:' + _.keys(reg_exp).join('|') + ')',
        testRegexp = RegExp(source),
        replaceRegexp = RegExp(source, 'g');
    text = text == null ? '' : '' + text;
    return testRegexp.test(text) ? text.replace(replaceRegexp, escaper) : text;
};

Strophe.addNamespace('ATTENTION', 'urn:xmpp:attention:0');
Strophe.addNamespace('CARBONS', 'urn:xmpp:carbons:2');
Strophe.addNamespace('FORWARD', 'urn:xmpp:forward:0');
Strophe.addNamespace('HASH', 'urn:xmpp:hashes:2');
Strophe.addNamespace('HINTS', 'urn:xmpp:hints');
Strophe.addNamespace('SCE', 'urn:xmpp:sce:1');
Strophe.addNamespace('RECEIPTS', 'urn:xmpp:receipts');
Strophe.addNamespace('JINGLE', 'urn:xmpp:jingle:1');
Strophe.addNamespace('JINGLE_SECURITY_STUB', 'urn:xmpp:jingle:security:stub:0');
Strophe.addNamespace('JINGLE_MSG', 'urn:xmpp:jingle-message:0');
Strophe.addNamespace('JINGLE_RTP', 'urn:xmpp:jingle:apps:rtp:1');
Strophe.addNamespace('JINGLE_TRANSPORTS_ICE', 'urn:xmpp:jingle:transports:ice-udp:1');
Strophe.addNamespace('ADDRESS', 'http://jabber.org/protocol/address');
Strophe.addNamespace('CHATSTATES', 'http://jabber.org/protocol/chatstates');
Strophe.addNamespace('EXTENDED_CHATSTATES', 'https://xabber.com/protocol/extended-chatstates');
Strophe.addNamespace('HTTP_AUTH', 'http://jabber.org/protocol/http-auth');
Strophe.addNamespace('AUTH_TOKENS', 'https://xabber.com/protocol/auth-tokens');
Strophe.addNamespace('AUTH_DEVICES', 'https://xabber.com/protocol/devices');
Strophe.addNamespace('SYNCHRONIZATION', 'https://xabber.com/protocol/synchronization');
Strophe.addNamespace('SYNCHRONIZATION_REGULAR_CHAT', 'urn:xabber:chat');
Strophe.addNamespace('SYNCHRONIZATION_CHANNEL', 'https://xabber.com/protocol/channels');
Strophe.addNamespace('SYNCHRONIZATION_OLD_OMEMO', 'urn:xmpp:omemo:1');
Strophe.addNamespace('SYNCHRONIZATION_OMEMO', 'urn:xmpp:omemo:2');
Strophe.addNamespace('XABBER_CHAT', 'urn:xabber:chat');
Strophe.addNamespace('EXPLICIT_MESSAGE_ENCRYPTION', 'urn:xmpp:eme:0');
Strophe.addNamespace('DELIVERY', 'https://xabber.com/protocol/delivery');
Strophe.addNamespace('ARCHIVE', 'https://xabber.com/protocol/archive');
Strophe.addNamespace('MAM', 'urn:xmpp:mam:2');
Strophe.addNamespace('RSM', 'http://jabber.org/protocol/rsm');
Strophe.addNamespace('DATAFORM', 'jabber:x:data');
Strophe.addNamespace('CHAT_MARKERS', 'urn:xmpp:chat-markers:0');
Strophe.addNamespace('VCARD_UPDATE', 'vcard-temp:x:update');
Strophe.addNamespace('HTTP_UPLOAD', 'urn:xmpp:http:upload');
Strophe.addNamespace('BLOCKING', 'urn:xmpp:blocking');
Strophe.addNamespace('SEARCH', 'jabber:iq:search');
Strophe.addNamespace('PRIVATE_STORAGE', 'jabber:iq:private');
Strophe.addNamespace('MEDIA', 'urn:xmpp:media-element');
Strophe.addNamespace('LAST', 'jabber:iq:last');
Strophe.addNamespace('GROUP_CHAT', 'https://xabber.com/protocol/groups');
Strophe.addNamespace('GROUP_CHAT_INVITE', 'https://xabber.com/protocol/groups#invite');
Strophe.addNamespace('GROUP_CHAT_INVITE_HTTP', 'http://xabber.com/protocol/groups#invite');
Strophe.addNamespace('GROUP_CHAT_PERMISSIONS', 'https://xabber.com/protocol/permissions');
Strophe.addNamespace('WEBCHAT', 'https://xabber.com/protocol/webchat');
Strophe.addNamespace('INDEX', 'https://xabber.com/protocol/index');
Strophe.addNamespace('PUBSUB', 'http://jabber.org/protocol/pubsub');
Strophe.addNamespace('PUBSUB_AVATAR_DATA', 'urn:xmpp:avatar:data');
Strophe.addNamespace('PUBSUB_AVATAR_METADATA', 'urn:xmpp:avatar:metadata');
Strophe.addNamespace('PUBSUB_AVATAR_METADATA_THUMBNAIL', 'urn:xmpp:thumbs:1');
Strophe.addNamespace('REWRITE', 'https://xabber.com/protocol/rewrite');
Strophe.addNamespace('REFERENCE', 'https://xabber.com/protocol/references');
Strophe.addNamespace('GEOLOC', 'http://jabber.org/protocol/geoloc');
Strophe.addNamespace('MARKUP', 'https://xabber.com/protocol/markup');
Strophe.addNamespace('VOICE_MESSAGE', 'https://xabber.com/protocol/voice-messages');
Strophe.addNamespace('FILES', 'https://xabber.com/protocol/files');
Strophe.addNamespace('SUBSCRIPTION_PREAPPROVAL', 'urn:xmpp:features:pre-approval');
Strophe.addNamespace('OGP', 'https://xabber.com/protocol/ogp');
Strophe.addNamespace('URLDISCO', 'urn:xabber:http:url');
Strophe.addNamespace('MEDIAGALLERY', 'urn:xabber:http:url:mediagallery');
Strophe.addNamespace('PROXY_VIEWER', 'urn:xabber:http:url:privacyproxy');
Strophe.addNamespace('EPHEMERAL', 'urn:xmpp:ephemeral:0');
Strophe.addNamespace('XABBER_FAVORITES', 'urn:xabber:favorites:0');
Strophe.addNamespace('XABBER_NOTIFY', 'urn:xabber:xen:0');
Strophe.addNamespace('XABBER_TRUST', 'urn:xabber:trust');
Strophe.addNamespace('XABBER_INFO', 'https://xabber.com/protocol/info');
Strophe.addNamespace('DIGITAL_SIGNATURES', 'urn:xmpp:signed:0');
Strophe.addNamespace('TRUSTED_MESSAGES', 'urn:xmpp:tm:1');
Strophe.addNamespace('DIGITAL_SIGNATURES_ATM', 'urn:xmpp:atm:1');
Strophe.addNamespace('PUBSUB_TRUST_SHARING', 'urn:xmpp:trustsharing:0');
Strophe.addNamespace('PUBSUB_TRUST_SHARING_ITEMS', 'urn:xmpp:trustsharing:0:items');
Strophe.addNamespace('NICK', 'http://jabber.org/protocol/nick');
Strophe.addNamespace('SYSTEM_MESSAGE', 'https://xabber.com/protocol/system-message');

export default xabber;
