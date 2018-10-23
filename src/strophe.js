define("xabber-strophe", function () {
    return function (xabber) {
        var env = xabber.env,
            Strophe = env.Strophe,
            constants = env.constants;

        Strophe.log = function (log_level, msg) {
            var do_log = (constants.LOG_LEVEL === constants.LOG_LEVEL_DEBUG) ||
                (constants.LOG_LEVEL >= constants.LOG_LEVEL_WARN &&
                    log_level >= Strophe.LogLevel.WARN) ||
                (constants.LOG_LEVEL >= constants.LOG_LEVEL_ERROR &&
                    log_level >= Strophe.LogLevel.ERROR);
            if (do_log) {
                console.info('Strophe log: ');
                console.info(msg);
            }
        };

        var utf16to8 = function (str) {
            var i, c;
            var out = "";
            var len = str.length;
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

        Strophe.SASLXTOKEN = function() {};
        Strophe.SASLXTOKEN.prototype = new Strophe.SASLMechanism("X-TOKEN", true, 80);

        Strophe.SASLXTOKEN.prototype.test = function (connection) {
            return true;
        };

        Strophe.SASLXTOKEN.prototype.onChallenge = function (connection) {
            var auth_str = String.fromCharCode(0) + connection.authcid +
                String.fromCharCode(0) + connection.pass;
            return utf16to8(auth_str);
        };


        Strophe.SASLXOAuth2 = function() {};
        Strophe.SASLXOAuth2.prototype = new Strophe.SASLMechanism("X-OAUTH2", true, 70);

        Strophe.SASLXOAuth2.prototype.test = function (connection) {
            return true;
        };

        Strophe.SASLXOAuth2.prototype.onChallenge = function (connection) {
            var auth_str = String.fromCharCode(0) + connection.authcid +
                String.fromCharCode(0) + connection.pass;

            return utf16to8(auth_str);
        };

        Strophe.ConnectionManager = function () {
            this.connection = new Strophe.Connection(constants.CONNECTION_URL);
        };

        Strophe.ConnectionManager.prototype = {
            connect: function (auth_type, jid, password, callback) {
                this.connection.mechanisms = {};
                this.auth_type = auth_type || 'password';
                if (this.auth_type === 'password') {
                    this.connection.registerSASLMechanisms();
                } else if (this.auth_type === 'x-token') {
                    this.connection.registerSASLMechanism(Strophe.SASLXTOKEN);
                } else {
                    this.connection.registerSASLMechanism(Strophe.SASLXOAuth2);
                    delete this.connection._sasl_data.server_signature;
                }
                this.connection.connect(jid, password, callback);
            },

            reconnect: function (callback) {
                this.connection.connect(this.connection.jid, this.connection.pass, callback);

            }
        };

        Strophe.addNamespace('CARBONS', 'urn:xmpp:carbons:2');
        Strophe.addNamespace('FORWARD', 'urn:xmpp:forward:0');
        Strophe.addNamespace('CHATSTATES', 'http://jabber.org/protocol/chatstates');
        Strophe.addNamespace('HTTP_AUTH', 'http://jabber.org/protocol/http-auth');
        Strophe.addNamespace('AUTH_TOKENS', 'http://xabber.com/protocol/auth-tokens');
        Strophe.addNamespace('MAM', 'urn:xmpp:mam:1');
        Strophe.addNamespace('RSM', 'http://jabber.org/protocol/rsm');
        Strophe.addNamespace('UNIQUE', 'http://xabber.com/protocol/unique');
        Strophe.addNamespace('XFORM', 'jabber:x:data');
        Strophe.addNamespace('CHAT_MARKERS', 'urn:xmpp:chat-markers:0');
        Strophe.addNamespace('VCARD_UPDATE', 'vcard-temp:x:update');
        Strophe.addNamespace('HTTP_UPLOAD', 'urn:xmpp:http:upload');
        Strophe.addNamespace('BLOCKING', 'urn:xmpp:blocking');
        Strophe.addNamespace('SEARCH', 'jabber:iq:search');
        Strophe.addNamespace('PRIVATE_STORAGE', 'jabber:iq:private');
        Strophe.addNamespace('OOB', 'jabber:x:oob');
        Strophe.addNamespace('MEDIA', 'urn:xmpp:media-element');
        Strophe.addNamespace('LAST', 'jabber:iq:last');
        Strophe.addNamespace('GROUP_CHAT', 'http://xabber.com/protocol/groupchat');
        Strophe.addNamespace('PUBSUB', 'http://jabber.org/protocol/pubsub');
        Strophe.addNamespace('PUBSUB_AVATAR_DATA', 'urn:xmpp:avatar:data');
        Strophe.addNamespace('PUBSUB_AVATAR_METADATA', 'urn:xmpp:avatar:metadata');

        return xabber;
    };
});
