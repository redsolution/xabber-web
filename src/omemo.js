define("xabber-omemo", function () {
    return function (xabber) {
        var env = xabber.env,
            constants = env.constants,
            utils = env.utils,
            $ = env.$,
            Strophe = env.Strophe,
            _ = env._,
            KeyHelper = libsignal.KeyHelper,
            SignalProtocolAddress = libsignal.SignalProtocolAddress,
            SessionBuilder = libsignal.SessionBuilder,
            SessionCipher = libsignal.SessionCipher,
            FingerprintGenerator = libsignal.FingerprintGenerator;

        xabber.Peer = Backbone.Model.extend({
            initialize: function (attrs, options) {
                this.contact = options.contact;
                this.account = this.contact.account;
                this.devices = [];
                var jid = this.contact.get('jid');
                this.set({
                    id: this.contact.hash_id,
                    jid: jid
                });
            },

            encrypt: function (message) {
                let enc_promises = [];

                this.devices.forEach(function (device) {
                    enc_promises.push(device.encrypt(message));
                }.bind(this));

                return {

                };
            },

            decrypt: function () {

            },

            getDevice: function (id) {
                if (!this.devices[id]) {
                    this.devices[id] = new xabber.Device({jid: this.contact.get('jid'), id: id }, { account: this.account, store: this.store});
                }

                return this.devices[i];
            }
        });

        xabber.Peers = Backbone.Collection.extend({
            model: xabber.Peer,

            initialize: function (models, options) {
                this.collections = [];
                this.on("add", _.bind(this.updateInCollections, this, 'add'));
                this.on("change", _.bind(this.updateInCollections, this, 'change'));
            },

            addCollection: function (collection) {
                this.collections.push(collection);
            },

            updateInCollections: function (event, contact) {
                _.each(this.collections, function (collection) {
                    collection.update(contact, event);
                });
            }
        });

        xabber.Bundle = Backbone.Model.extend({
            initialize: async function (attrs, options) {
                this.preKeys = [];
                this.store = options.store;
                await this.generateIdentity();
                this.generatePreKeys().then((prekeys) => {this.preKeys = prekeys;});
            },

            generateIdentity: function () {
                return Promise.all([
                    KeyHelper.generateIdentityKeyPair(),
                    KeyHelper.generateRegistrationId(),
                ]).then((result) => {
                    this.store.put('identityKey', result[0]);
                    this.store.put('registrationId', result[1]);
                });
            },

            generatePreKeys: async function () {
                let preKeysPromises = [];
                for (let i = 0; i < constants.PREKEYS_COUNT; i++) {
                    preKeysPromises.push(this.generatePreKey(i));
                }

                preKeysPromises.push(this.generateSignedPreKey(1));

                return await Promise.all(preKeysPromises);
            },

            generatePreKey: async function (id) {
                let preKey = await KeyHelper.generatePreKey(id);
                this.store.storePreKey(id, preKey.keyPair);

                return preKey;

            },

            generateSignedPreKey: async function (id) {
                let identity = await this.store.getIdentityKeyPair();
                let signedPreKey = await KeyHelper.generateSignedPreKey(identity, id);

                this.store.storeSignedPreKey(id, signedPreKey.keyPair);

                return signedPreKey;
            }

        });

        xabber.Device = Backbone.Model.extend({
            initialize: function (attrs, options) {
                this.account = options.account;
                this.id = attrs.id;
                this.contact = this.account.contacts.get(attrs.jid);
                this.store = options.store;
                this.preKeys = [];
                this.address = new SignalProtocolAddress(attrs.jid, attrs.id);
                this.session = new SessionBuilder(this.store, this.address);
            },

            getBundle: function (callback) {
                this.account.connection.omemo.getBundleInfo({jid: this.contact.get('jid'), id: this.id}, function (iq) {
                    let $iq = $(iq),
                        $bundle = $iq.find(`item bundle[xmlns="${Strophe.NS.OMEMO}"]`),
                        $spk = $bundle.find('spk'),
                        spk = {id: $spk.attr('id'), key: $spk.text(), signature: $bundle.find('spks').text()},
                        ik =  $bundle.find(`ik`).text();
                    $bundle.find('prekeys pk').each((pk) => {
                        let $pk = $(pk);
                        this.preKeys.push({id: $pk.attr('id'), key: $pk.text()});
                    });
                    let pk = this.getRandomPreKey();
                    callback && callback({pk, spk, ik});
                }.bind(this));
            },

            getRandomPreKey: function () {
                let min = 0,
                    max = this.preKeys.length - 1,
                    i = Math.floor(min + Math.random() * (max + 1 - min));
                return this.preKeys[i];
            },

            decrypt: async function (cipherText, preKey) {
                let sessionCipher = new SessionCipher(this.store, this.address), plainText;

                if (preKey)
                    plainText = await sessionCipher.decryptPreKeyWhisperMessage(cipherText, 'binary');
                else
                    plainText = await sessionCipher.decryptWhisperMessage(cipherText, 'binary');

                return plainText;
            },

            encrypt: async function (plainText) {
                this.getBundle(function ({pk, spk, ik}) {
                    this.session.processPreKey({
                        registrationId: this.id,
                        identityKey: utils.fromBase64toArrayBuffer(ik),
                        signedPreKey: {
                            keyId: spk.id,
                            publicKey: utils.fromBase64toArrayBuffer(spk.key),
                            signature: utils.fromBase64toArrayBuffer(spk.signature)
                        },
                        preKey: pk
                }).then(() => {
                    this.session.encrypt(plainText);
                    });
                }.bind(this));

                /*try {
                    if (!this.store.hasSession(this.address.toString())) {
                        await this.initSession();
                    }

                    let session = this.getSession(),
                        cipherText = await session.encrypt(plainText);

                    return {
                        preKey: cipherText.type === 3,
                        cipherText: cipherText,
                        deviceId: this.address.getDeviceId()
                    }
                } catch (err) {
                    console.log('Error:', err);
                    console.warn('Could not encrypt data for device with id ' + this.address.getDeviceId());

                    return null;
                }*/
            },

            initSession: function (preKeyBundle) {
                let builder = new SessionBuilder(this.store, this.address);
                return builder.processPreKey(preKeyBundle);
            },

            getSession() {
                if (!this.session) {
                    this.session = new SessionCipher(this.store, this.address);
                }
                return this.session;
            }
        });

        xabber.Omemo = Backbone.ModelWithStorage.extend({
            defaults: {
                sessions: [],
                device_id: "",

            },

            _initialize: function (attrs, options) {
                this.on("change:device_id", this.onDeviceIdUpdated, this);
                this.account = options.account;
                this.peers = new xabber.Peers();
                if (!this.get('device_id'))
                    this.set('device_id', this.generateDeviceId());
                this.store = new xabber.SignalProtocolStore();
                this.bundle = new xabber.Bundle(null, {store: this.store});
                this.account.on('device_published', this.publishBundle, this);
            },

            onDeviceIdUpdated: function () {
                this.save('device_id', this.get('device_id'));
            },

            generateDeviceId: function () {
                let min = 1,
                    max = Math.pow(2, 31) - 1,
                    rand = min + Math.random() * (max + 1 - min);
                return Math.floor(rand);
            },

            registerMessageHandler: function () {
                this.account.connection.deleteHandler(this._msg_handler);
                this._msg_handler = this.account.connection.addHandler(function (message) {
                    this.receiveMessage(message);
                    return true;
                }.bind(this), null, 'message');
            },

            encrypt: function (message) {

            },

            receiveMessage: function (message) {
                let $message = $(message);
                if ($message.find(`encrypted[xmlns=${Strophe.NS.OMEMO}]`).length) {

                }
            },

            decrypt: function () {

            },

            toBase64: function (arrayBuffer) {
                return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            },

            createEncryptedStanza: function (msg) {
                let $message = $msg({type: 'chat', to: msg.get('to')})
                    .c('encrypted', {xmlns: Strophe.NS.OMEMO})
                    .c('header', {sid: this.device_id});
                for (let key of msg.get('keys')) {
                    let attrs = {
                        rid: key.deviceId,
                        prekey: undefined
                    };

                    if (key.preKey) {
                        attrs.prekey = true;
                    }

                    $message.c('key', attrs).t(btoa(key.ciphertext.body)).up();
                }
                $message.up().up().c('payload').t(btoa(msg.get('payload')));
            },

            publish: function (spk, ik, pks) {
                if (!this.account.connection)
                    return;
                let conn_omemo = this.account.connection.omemo,
                    prekeys = [];
                pks.forEach(function (pk) {
                    if (!pk.signature)
                        prekeys.push({id: pk.keyId, key: this.toBase64(pk.keyPair.pubKey)});
                }.bind(this));
                conn_omemo.publishBundle({
                    spk: {id: spk.keyId, key: this.toBase64(spk.keyPair.pubKey)},
                    spks: this.toBase64(spk.signature),
                    ik:  this.toBase64(ik),
                    pks: prekeys
                });
            },

            publishBundle: async function () {
               let spk = this.bundle.preKeys.find(pk => pk.signature),
                   ik = await this.store.getIdentityKeyPair(),
                   pks = this.bundle.preKeys;
               this.publish(spk, ik.pubKey, pks);
            }
        });

        xabber.SignalProtocolStore = Backbone.Model.extend({
            initialize: function () {
                this.Direction = {
                    SENDING: 1,
                    RECEIVING: 2
                };
                this.store = {};
            },

            getIdentityKeyPair: function () {
                return Promise.resolve(this.get('identityKey'));
            },

            getLocalRegistrationId: function () {
                return Promise.resolve(this.get('registrationId'));
            },

            put: function (key, value) {
                if (key === undefined || value === undefined || key === null || value === null)
                    throw new Error("Tried to store undefined/null");
                this.store[key] = value;
            },

            get: function (key, defaultValue) {
                if (key === null || key === undefined)
                    throw new Error("Tried to get value for undefined/null key");
                if (key in this.store) {
                    return this.store[key];
                } else {
                    return defaultValue;
                }
            },

            remove: function (key) {
                if (key === null || key === undefined)
                    throw new Error("Tried to remove value for undefined/null key");
                delete this.store[key];
            },

            isTrustedIdentity: function (identifier, identityKey, direction) {
                if (identifier === null || identifier === undefined) {
                    throw new Error("tried to check identity key for undefined/null key");
                }
                if (!(identityKey instanceof ArrayBuffer)) {
                    throw new Error("Expected identityKey to be an ArrayBuffer");
                }
                var trusted = this.get('identityKey' + identifier);
                if (trusted === undefined) {
                    return Promise.resolve(true);
                }
                return Promise.resolve(util.toString(identityKey) === util.toString(trusted));
            },

            loadIdentityKey: function (identifier) {
                if (identifier === null || identifier === undefined)
                    throw new Error("Tried to get identity key for undefined/null key");
                return Promise.resolve(this.get('identityKey' + identifier));
            },

            saveIdentity: function (identifier, identityKey) {
                if (identifier === null || identifier === undefined)
                    throw new Error("Tried to put identity key for undefined/null key");

                var address = new SignalProtocolAddress.fromString(identifier);

                var existing = this.get('identityKey' + address.getName());
                this.put('identityKey' + address.getName(), identityKey);

                if (existing && libsignal.toString(identityKey) !== libsignal.toString(existing)) {
                    return Promise.resolve(true);
                } else {
                    return Promise.resolve(false);
                }

            },

            /* Returns a prekeypair object or undefined */
            loadPreKey: function (keyId) {
                var res = this.get('25519KeypreKey' + keyId);
                if (res !== undefined) {
                    res = {pubKey: res.pubKey, privKey: res.privKey};
                }
                return Promise.resolve(res);
            },

            storePreKey: function (keyId, keyPair) {
                return Promise.resolve(this.put('25519KeypreKey' + keyId, keyPair));
            },

            removePreKey: function (keyId) {
                return Promise.resolve(this.remove('25519KeypreKey' + keyId));
            },

            /* Returns a signed keypair object or undefined */
            loadSignedPreKey: function (keyId) {
                var res = this.get('25519KeysignedKey' + keyId);
                if (res !== undefined) {
                    res = {pubKey: res.pubKey, privKey: res.privKey};
                }
                return Promise.resolve(res);
            },

            storeSignedPreKey: function (keyId, keyPair) {
                return Promise.resolve(this.put('25519KeysignedKey' + keyId, keyPair));
            },

            removeSignedPreKey: function (keyId) {
                return Promise.resolve(this.remove('25519KeysignedKey' + keyId));
            },

            loadSession: function (identifier) {
                return Promise.resolve(this.get('session' + identifier));
            },

            storeSession: function (identifier, record) {
                return Promise.resolve(this.put('session' + identifier, record));
            },

            removeSession: function (identifier) {
                return Promise.resolve(this.remove('session' + identifier));
            },

            removeAllSessions: function (identifier) {
                for (var id in this.store) {
                    if (id.startsWith('session' + identifier)) {
                        delete this.store[id];
                    }
                }
                return Promise.resolve();
            }
        });

        xabber.Account.addConnPlugin(function () {
            this.omemo = new xabber.Omemo({id: 'omemo'}, {
                account: this,
                storage_name: xabber.getStorageName() + '-omemo-settings-' + this.get('jid'),
                fetch: 'before'
            });
            let connection = this.connection;
            connection.omemo.addDevice(this.omemo.get('device_id'), () => this.trigger('device_published'));
        }, true, true);

        return xabber;
    };
});