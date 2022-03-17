define("xabber-strophe", function () {
    return function (xabber) {
        let env = xabber.env,
            uuid = env.uuid,
            $iq = env.$iq,
            utils = env.utils,
            Strophe = env.Strophe,
            constants = env.constants;

        Strophe.log = function (log_level, msg) {
            let do_log = (constants.LOG_LEVEL === constants.LOG_LEVEL_DEBUG) ||
                (constants.LOG_LEVEL >= constants.LOG_LEVEL_WARN &&
                    log_level >= Strophe.LogLevel.WARN) ||
                (constants.LOG_LEVEL >= constants.LOG_LEVEL_ERROR &&
                    log_level >= Strophe.LogLevel.ERROR);
            if (do_log) {
                console.info('Strophe log: ');
                console.info(msg);
            }
        };

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
                var self = this, reset = conn.reset.bind(conn);
                conn.reset = function () {
                    reset();
                    self.instructions = "";
                    self.fields = {};
                    self.registered = false;
                };

                // hooking strophe's _connect_cb
                var connect_cb = conn._connect_cb.bind(conn);
                conn._connect_cb = function (req, callback, raw) {
                    if (!self._registering) {
                        if (self.processed_features) {
                            // exchange Input hooks to not print the stream:features twice
                            var xmlInput = conn.xmlInput;
                            conn.xmlInput = Strophe.Connection.prototype.xmlInput;
                            var rawInput = conn.rawInput;
                            conn.rawInput = Strophe.Connection.prototype.rawInput;
                            connect_cb(req, callback, raw);
                            conn.xmlInput = xmlInput;
                            conn.rawInput = rawInput;
                            delete self.processed_features;
                        } else {
                            connect_cb(req, callback, raw);
                        }
                    } else {
                        // Save this request in case we want to authenticate later
                        self._connect_cb_data = {req: req,
                            raw: raw};
                        if(self._register_cb(req, callback, raw)) {
                            // remember that we already processed stream:features
                            self.processed_features = true;
                            delete self._registering;
                        }
                    }
                };

                // hooking strophe`s authenticate
                var auth_old = conn.authenticate.bind(conn);
                conn.authenticate = function(matched) {
                    if (typeof matched === "undefined") {
                        var conn = this._connection;

                        if (!this.fields.username || !this.domain || !this.fields.password) {
                            Strophe.info("Register a JID first!");
                            return;
                        }

                        var jid = this.fields.username + "@" + this.domain;

                        conn.jid = jid;
                        conn.authzid = Strophe.getBareJidFromJid(conn.jid);
                        conn.authcid = Strophe.getNodeFromJid(conn.jid);
                        conn.pass = this.fields.password;

                        var req = this._connect_cb_data.req;
                        var callback = conn.connect_callback;
                        var raw = this._connect_cb_data.raw;
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
                var conn = this._connection;
                this.domain = Strophe.getDomainFromJid(domain);
                this.instructions = "";
                this.fields = {};
                this.registered = false;

                this._registering = true;

                conn.connect(this.domain, "", callback, wait, hold, route);
            },

            connect_change_password: function(jid, password, callback, wait, hold, route) {
                var conn = this._connection;
                this.domain = Strophe.getDomainFromJid(jid);
                this.instructions = "";
                this.fields = {};
                conn.registerSASLMechanisms([Strophe.SASLAnonymous,
                    Strophe.SASLExternal,
                    Strophe.SASLMD5,
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
                var conn = this._connection;

                Strophe.info("_register_cb was called");
                conn.connected = true;

                var bodyWrap = conn._proto._reqToData(req);
                if (!bodyWrap) { return; }

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

                var conncheck = conn._proto._connect_cb(bodyWrap);
                if (conncheck === Strophe.Status.CONNFAIL) {
                    return false;
                }

                // Check for the stream:features tag
                var register = bodyWrap.getElementsByTagName("register");
                var mechanisms = bodyWrap.getElementsByTagName("mechanism");
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
                var i, query, field, conn = this._connection;
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
                var i, name, query, fields, conn = this._connection;
                query = $iq({type: "set", id: uuid()}).c("query", {xmlns:Strophe.NS.REGISTER});

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
                var i, query, field, error = null, conn = this._connection;

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
                    if (error.length !== 1) {
                        conn._changeConnectStatus(Strophe.Status.REGIFAIL, "unknown");
                        return false;
                    }

                    Strophe.info("Registration failed.");

                    // this is either 'conflict' or 'not-acceptable'
                    error = error[0].firstChild.tagName.toLowerCase();
                    if (error === 'conflict') {
                        conn._changeConnectStatus(Strophe.Status.CONFLICT, error);
                    } else if (error === 'not-acceptable') {
                        conn._changeConnectStatus(Strophe.Status.NOTACCEPTABLE, error);
                    } else {
                        conn._changeConnectStatus(Strophe.Status.REGIFAIL, error);
                    }
                } else {
                    Strophe.info("Registration successful.");

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

        Strophe.SASLHOTP = function() {};
        Strophe.SASLHOTP.prototype = new Strophe.SASLMechanism("HOTP", true, 100);

        Strophe.SASLHOTP.prototype.test = function (connection) {
            return true;
        };

        Strophe.SASLHOTP.prototype.onChallenge = function (connection) {
            let auth_str = String.fromCharCode(0) + connection.authcid +
                String.fromCharCode(0) + connection.hotp_pass;
            return utf16to8(auth_str);
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
                        Strophe.SASLMD5,
                        Strophe.SASLPlain,
                        Strophe.SASLSHA1]);
                } else if (this.auth_type === 'x-token') {
                    this.connection.registerSASLMechanism(Strophe.SASLHOTP);
                    delete this.connection._sasl_data["server-signature"];
                    utils.generateHOTP(utils.fromBase64toArrayBuffer(password), this.connection.counter).then((pass) => {
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
                    if (!this.connection.mechanisms["HOTP"]) {
                        this.connection.registerSASLMechanism(Strophe.SASLHOTP);
                        delete this.connection._sasl_data["server-signature"];
                    }
                    if (this.connection.account && this.connection.account.get('hotp_counter'))
                        this.connection.counter = this.connection.account.get('hotp_counter');
                    utils.generateHOTP(utils.fromBase64toArrayBuffer(this.connection.pass), this.connection.counter).then((pass) => {
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

            _attemptSASLAuth: function (mechanisms) {
                mechanisms = this.sortMechanismsByPriority(mechanisms || []);
                let i = 0, mechanism_found = false;
                for (i = 0; i < mechanisms.length; ++i) {
                    if (!mechanisms[i].prototype.test(this)) {
                        continue;
                    }
                    this._sasl_success_handler = this._addSysHandler(
                        this._sasl_success_cb.bind(this), null,
                        "success", null, null);
                    this._sasl_failure_handler = this._addSysHandler(
                        this._sasl_failure_cb.bind(this), null,
                        "failure", null, null);
                    this._sasl_challenge_handler = this._addSysHandler(
                        this._sasl_challenge_cb.bind(this), null,
                        "challenge", null, null);

                    this._sasl_mechanism = new mechanisms[i]();
                    this._sasl_mechanism.onStart(this);

                    let request_auth_exchange = $build("auth", {
                        xmlns: Strophe.NS.SASL,
                        mechanism: this._sasl_mechanism.name
                    });
                    if (this._sasl_mechanism.isClientFirst) {
                        let response = this._sasl_mechanism.onChallenge(this, null);
                        request_auth_exchange.t(btoa(response));
                    }
                    this.send(request_auth_exchange.tree());
                    mechanism_found = true;
                    if (this.account && this.counter && this.account.get('x_token') && this._sasl_mechanism.name === "HOTP") {
                        this.counter++
                        this.account.save({
                            hotp_counter: this.counter,
                        });
                    }
                    break;
                }
                return mechanism_found;
            },

            _sasl_auth1_cb: function (elem) {
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

                    if ((child.nodeName === 'devices') && child.namespaceURI === Strophe.NS.AUTH_DEVICES && this.options['x-token']) {
                        this.x_token_auth = true;
                    }

                    if ((child.nodeName === 'synchronization') && (child.namespaceURI === Strophe.NS.SYNCHRONIZATION)) {
                        this.do_synchronization = true;
                    }
                }

                if (!this.do_bind) {
                    this._changeConnectStatus(Strophe.Status.AUTHFAIL, null);
                    return false;
                } else {
                    if (this.x_token_auth && (!this.x_token || (parseInt(this.x_token.expire)*1000 < env.moment.now()))) {
                        this.getXToken((success) => {
                            let token = $(success).find('secret').text(),
                                expires_at = $(success).find('expire').text(),
                                token_uid = $(success).find('device').attr('id');
                            this.x_token = {token: token, expire: expires_at, token_uid: token_uid,};
                            this.counter = 1;
                            this.pass = token;
                            this._send_auth_bind();
                            if (this.account) {
                                this.account.save({
                                    hotp_counter: this.counter,
                                });
                            }
                        }, () => {
                            this._send_auth_bind();
                        });
                    }
                    else {
                        this._send_auth_bind();
                    }
                }
                return false;
            },

            _send_auth_bind() {
                this._addSysHandler(this._sasl_bind_cb.bind(this), null, null,
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
                let uniq_id = uuid(),
                    iq = $iq({
                    type: 'set',
                    to: this.domain,
                    id: uniq_id
                }).c('register', { xmlns: Strophe.NS.AUTH_DEVICES}).c('device', { xmlns: Strophe.NS.AUTH_DEVICES})
                    .c('client').t(xabber.get('client_name')).up()
                    .c('info').t(`PC, ${utils.getOS()}, ${env.utils.getBrowser()}`);

                handler = function (stanza) {
                    let iqtype = stanza.getAttribute('type');
                    if (iqtype == 'result') {
                        if (callback) {
                            callback(stanza);
                        }
                    } else if (iqtype == 'error') {
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
            }
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
        Strophe.addNamespace('SCE', 'urn:xmpp:sce:0');
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
        Strophe.addNamespace('SYNCHRONIZATION_REGULAR_CHAT', 'https://xabber.com/protocol/synchronization#chat');
        Strophe.addNamespace('SYNCHRONIZATION_CHANNEL', 'https://xabber.com/protocol/channels');
        Strophe.addNamespace('SYNCHRONIZATION_OMEMO', 'urn:xmpp:omemo:1');
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
        Strophe.addNamespace('WEBCHAT', 'https://xabber.com/protocol/webchat');
        Strophe.addNamespace('INDEX', 'https://xabber.com/protocol/index');
        Strophe.addNamespace('PUBSUB', 'http://jabber.org/protocol/pubsub');
        Strophe.addNamespace('PUBSUB_AVATAR_DATA', 'urn:xmpp:avatar:data');
        Strophe.addNamespace('PUBSUB_AVATAR_METADATA', 'urn:xmpp:avatar:metadata');
        Strophe.addNamespace('REWRITE', 'https://xabber.com/protocol/rewrite');
        Strophe.addNamespace('REFERENCE', 'https://xabber.com/protocol/references');
        Strophe.addNamespace('GEOLOC', 'http://jabber.org/protocol/geoloc');
        Strophe.addNamespace('MARKUP', 'https://xabber.com/protocol/markup');
        Strophe.addNamespace('VOICE_MESSAGE', 'https://xabber.com/protocol/voice-messages');
        Strophe.addNamespace('FILES', 'https://xabber.com/protocol/files');
        return xabber;
    };
});
