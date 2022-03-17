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
