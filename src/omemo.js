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
            idAttribute: 'jid',

            initialize: function (attrs, options) {
                attrs = attrs || {};
                this.account = options.account;
                this.devices = [];
                this.updateDevices(attrs.devices);
                this.own_devices = [];
                this.onOwnDevicesUpdated();
                this.account.on("devices_updated", this.onOwnDevicesUpdated, this);
                this.set({
                    jid: attrs.jid
                });
            },

            updateDevices: function (devices) {
                if (!devices)
                    return;
                devices.forEach(function (device) {
                    this.getDevice(device.id);
                }.bind(this));
            },

            onOwnDevicesUpdated: function () {
                this.updateOwnDevices(this.account.connection.omemo.devices);
            },

            updateOwnDevices: function (devices) {
                if (!devices)
                    return;
                devices.forEach(function (device) {
                    this.getOwnDevice(device.id);
                }.bind(this));
            },

            encrypt: async function (message) {
                let enc_promises = [],
                    aes = await utils.AES.encrypt(message);

                if (!this.devices.length)
                    this.account.connection.omemo.getDevicesNode(this.get('jid'), function (cb) {
                        this.updateDevices(this.account.connection.omemo.getUserDevices($(cb)));
                        for (let device in this.devices) {
                            enc_promises.push(this.devices[device].encrypt(aes.keydata));
                        }
                    }.bind(this));
                else {
                    for (let device in this.devices) {
                        enc_promises.push(this.devices[device].encrypt(aes.keydata));
                    }
                }

                for (let device in this.own_devices) {
                    enc_promises.push(this.own_devices[device].encrypt(aes.keydata));
                }

                let keys = await Promise.all(enc_promises);

                keys = keys.filter(key => key !== null);

                return {
                    keys: keys,
                    iv: aes.iv,
                    payload: aes.payload
                };
            },

            decrypt: async function (deviceId, ciphertext, preKey) {
                let device = this.getDevice(deviceId);

                return device.decrypt(ciphertext, preKey);
            },

            getOwnDevice: function (id) {
                if (!this.own_devices[id]) {
                    this.own_devices[id] = new xabber.Device({jid: this.account.get('jid'), id: id }, { account: this.account, store: this.account.omemo.store});
                }

                return this.own_devices[id];
            },

            getDevice: function (id) {
                if (!this.devices[id]) {
                    this.devices[id] = new xabber.Device({jid: this.get('jid'), id: id }, { account: this.account, store: this.account.omemo.store});
                }

                return this.devices[id];
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
                this.model = options.model;
                this.store = options.store;
                if (this.model.get('identityKey'))
                    this.getIdentity();
                else
                    await this.generateIdentity();
                this.generatePreKeys().then((prekeys) => {this.preKeys = prekeys;});
            },

            generateIdentity: function () {
                return Promise.all([
                    KeyHelper.generateIdentityKeyPair(),
                    KeyHelper.generateRegistrationId(),
                ]).then((result) => {
                    let identityKey = result[0],
                        registrationId = result[1];
                    this.store.put('identityKey', identityKey);
                    this.store.put('registrationId', registrationId);
                    this.cacheIdentity(identityKey, registrationId);
                });
            },

            getIdentity: function () {
                let identityKey = JSON.parse(this.model.get('identityKey')),
                    registrationId = this.model.get('registrationId'),
                    pubKey = utils.fromBase64toArrayBuffer(identityKey.pubKey),
                    privKey = utils.fromBase64toArrayBuffer(identityKey.privKey);
                this.store.put('identityKey', {pubKey: pubKey, privKey: privKey});
                this.store.put('registrationId', registrationId);
            },

            cacheIdentity: function (identityKey, registrationId) {
                let pubKey = utils.ArrayBuffertoBase64(identityKey.pubKey),
                    privKey = utils.ArrayBuffertoBase64(identityKey.privKey);
                this.model.save('identityKey', JSON.stringify({pubKey: pubKey, privKey: privKey}));
                this.model.save('registrationId', registrationId);
            },

            generatePreKeys: async function () {
                let preKeysPromises = [];
                for (let i = 1; i <= constants.PREKEYS_COUNT; i++) {
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
                this.jid = attrs.jid;
                this.store = options.store;
                this.preKeys = [];
                this.address = new SignalProtocolAddress(attrs.jid, attrs.id);
                // this.session = new SessionBuilder(this.store, this.address);
            },

            getBundle: async function () {
                return new Promise((resolve, reject) => {
                    this.account.connection.omemo.getBundleInfo({jid: this.jid}, function (iq) {
                        let $iq = $(iq),
                            $bundle = $iq.find(`item bundle[xmlns="${Strophe.NS.OMEMO}"]`),
                            $spk = $bundle.find('spk'),
                            spk = {id: $spk.attr('id'), key: $spk.text(), signature: $bundle.find('spks').text()},
                            ik =  $bundle.find(`ik`).text();
                        $bundle.find('prekeys pk').each((i, pk) => {
                            let $pk = $(pk);
                            this.preKeys.push({id: $pk.attr('id'), key: $pk.text()});
                        });
                        let pk = this.getRandomPreKey();
                        resolve({pk, spk, ik});
                    }.bind(this));
                });
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
                try {
                    if (!this.store.hasSession(this.address.toString())) {
                        await this.initSession();
                    }

                    let session = this.getSession(),
                        ciphertext = await session.encrypt(plainText);

                    return {
                        preKey: ciphertext.type === 3,
                        ciphertext: ciphertext,
                        deviceId: this.address.getDeviceId()
                    };
                } catch (e) {
                    console.log('Error:', e);
                    console.warn('Could not encrypt data for device with id ' + this.address.getDeviceId());

                    return null;
                }
            },

            initSession: async function () {
                let {pk, spk, ik} = await this.getBundle();
                this.processPreKey({
                    registrationId: Number(this.id),
                    identityKey: utils.fromBase64toArrayBuffer(ik),
                    signedPreKey: {
                        keyId: Number(spk.id),
                        publicKey: utils.fromBase64toArrayBuffer(spk.key),
                        signature: utils.fromBase64toArrayBuffer(spk.signature)
                    },
                    preKey: {
                        keyId: Number(pk.id),
                        publicKey: utils.fromBase64toArrayBuffer(pk.key)
                    }
                });
            },

            processPreKey: function (preKeyBundle) {
                let builder = new SessionBuilder(this.store, this.address);
                // this.store.storeSession(this.address.toString(), builder);
                return builder.processPreKey(preKeyBundle);
            },

            getSession: function () {
                if (!this.session) {
                    this.session = new SessionCipher(this.store, this.address);
                }
                return this.session;
            }
        });

        xabber.Omemo = Backbone.ModelWithStorage.extend({
            defaults: {
                sessions: [],
                device_id: ""
            },

            _initialize: function (attrs, options) {
                this.on("change:device_id", this.onDeviceIdUpdated, this);
                this.account = options.account;
                this.peers = new xabber.Peers();
                if (!this.get('device_id'))
                    this.set('device_id', this.generateDeviceId());
                this.store = new xabber.SignalProtocolStore();
                this.bundle = new xabber.Bundle(null, {store: this.store, model: this});
                this.account.on('device_published', this.publishBundle, this);
                this.registerMessageHandler();
                this.connection = this.account.connection;
                this.addDevice();
            },

            addDevice: function () {
                let device_id = this.get('device_id');
                if (this.connection) {
                    let omemo = this.connection.omemo;
                    if (omemo.devices.length) {
                        if (!omemo.devices.find(d => d.id == device_id)) {
                            omemo.publishDevice(device_id, function () {
                                this.account.trigger('device_published');
                            }.bind(this));
                        }
                        else
                            this.account.trigger('device_published');
                    }
                    else
                        omemo.getDevicesNode(null, function (cb) {
                            omemo.devices = omemo.getUserDevices($(cb));
                            if (!omemo.devices.find(d => d.id == device_id)) {
                                omemo.publishDevice(device_id, function () {
                                    this.account.trigger('device_published');
                                }.bind(this));
                            }
                            else
                                this.account.trigger('device_published');
                        }.bind(this));
                }
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

            encrypt: function (contact, message) {
                let peer = this.getPeer(contact.get('jid')),
                    $msg = $(message.tree()),
                    plaintext = $msg.children('body')[0].outerHTML;

                $msg.children('reference').each(function (i, ref) {
                    plaintext += ref.outerHTML;
                }.bind(this));

                return peer.encrypt(plaintext).then((encryptedMessage) => {

                    let encryptedElement = $build('encrypted', {xmlns: Strophe.NS.OMEMO})
                        .c('header', {
                            sid: this.get('device_id')
                        }),
                        myKeys = $build('keys', {jid: this.account.get('jid')});

                    encryptedElement.c('keys', { jid: contact.get('jid')});

                    for (let key of encryptedMessage.keys) {
                        let attrs = {
                            rid: key.deviceId,
                            kex: undefined
                        };
                        if (key.preKey) {
                            attrs.kex = true;
                        }

                        if (peer.devices[key.deviceId])
                            encryptedElement.c('key', attrs).t(btoa(key.ciphertext.body)).up();
                        else
                            myKeys.c('key', attrs).t(btoa(key.ciphertext.body)).up();
                    }
                    encryptedElement.up().cnode(myKeys.tree());

                    encryptedElement.up().c('iv', utils.ArrayBuffertoBase64(encryptedMessage.iv)).up().up()
                        .c('payload').t(utils.ArrayBuffertoBase64(encryptedMessage.payload));

                    $(message.tree()).find('body').remove();

                    message.cnode(encryptedElement.tree());
                    message.up().c('store', {
                        xmlns: 'urn:xmpp:hints'
                    }).up();

                    return message;
                }).catch((msg) => {

                });
            },

            receiveMessage: function (message) {
                let $message = $(message),
                    node = $message.find('items').attr('node'),
                    from_jid = Strophe.getBareJidFromJid($message.attr('from'));

                if ($message.find('event[xmlns="' + Strophe.NS.PUBSUB + '#event"]').length) {
                    if (node == `${Strophe.NS.OMEMO}:devices`) {
                        let devices = this.account.connection.omemo.getUserDevices($message),
                            contact = this.account.contacts.get(from_jid);
                        if (from_jid === this.account.get('jid')) {
                            this.account.connection.omemo.devices = devices;
                            let device_id = this.account.omemo.get('device_id');
                            if (!this.account.connection.omemo.devices.find(d => d.id == device_id))
                                this.account.connection.omemo.publishDevice(device_id, () => {
                                    this.account.trigger('device_published');
                                });
                            this.account.trigger("devices_updated");
                        }
                        else {
                            this.getPeer(from_jid).updateDevices(devices);
                        }
                        return;
                    }
                    if (node == `${Strophe.NS.OMEMO}:bundles`) {

                    }
                }

                if ($message.find(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`).length) {
                    this.decrypt(message).then((decrypted_msg) => {
                        $message.find(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`).replaceWith(decrypted_msg);
                        this.account.chats.receiveChatMessage($message[0]);
                    });
                }

            },

            parseEncrypted: function ($encrypted) {
                let $payload = $encrypted.children(`payload`),
                    $header = $encrypted.children('header'),
                    iv = utils.fromBase64toArrayBuffer($header.find('iv').text()),
                    payload = utils.fromBase64toArrayBuffer($payload.text()),
                    sid = Number($header.attr('sid'));

                let keys = $header.find(`key`).get().map(function(keyElement) {
                    return {
                        preKey: $(keyElement).attr('kex') === 'true',
                        ciphertext: utils.fromBase64toArrayBuffer($(keyElement).text()),
                        deviceId: parseInt($(keyElement).attr('rid'))
                    };
                });

                return {sid, keys, iv, payload};
            },

            getPeer: function (jid) {
                if (!this.peers.get(jid))
                    this.peers.create({jid}, {account:this.account});
                return this.peers.get(jid);
            },

            decrypt: async function (message) {
                let $message = $(message),
                    from_jid = Strophe.getBareJidFromJid($message.attr('from')),
                    $encrypted = $message.find(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`);

                if ($message.find('[xmlns="'+Strophe.NS.CARBONS+'"]').length || $message.find('result[xmlns="'+Strophe.NS.MAM+'"]').length) {
                    let $m = $message.find('message').first();
                    from_jid = Strophe.getBareJidFromJid($m.attr('from'));
                    if (this.account.get('jid') == from_jid)
                        from_jid = Strophe.getBareJidFromJid($m.attr('to'));

                }

                let encryptedData = this.parseEncrypted($encrypted),
                    deviceId = this.get('device_id'),
                    ownPreKeysArr =  encryptedData.keys.filter(preKey => preKey.deviceId == deviceId),
                    ownPreKey = ownPreKeysArr[0];
                if (!ownPreKey)
                    return;
                let peer = this.getPeer(from_jid),
                    exportedKey = await peer.decrypt(encryptedData.sid, ownPreKey.ciphertext, ownPreKey.preKey),
                    exportedAESKey = exportedKey.slice(0, 16),
                    authenticationTag = exportedKey.slice(16),
                    iv = encryptedData.iv,
                    ciphertextAndAuthenticationTag = utils.AES.arrayBufferConcat(encryptedData.payload, authenticationTag);

                return utils.AES.decrypt(exportedAESKey, iv, ciphertextAndAuthenticationTag);
            },

            toBase64: function (arrayBuffer) {
                return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
            },

            publish: function (spk, ik, pks) {
                if (!this.account.connection)
                    return;
                let conn_omemo = this.account.connection.omemo,
                    prekeys = [];
                pks.forEach(function (pk) {
                    if (!pk.signature)
                        prekeys.push({id: pk.keyId, key: utils.ArrayBuffertoBase64(pk.keyPair.pubKey)});
                }.bind(this));
                conn_omemo.publishBundle({
                    spk: {id: spk.keyId, key: utils.ArrayBuffertoBase64(spk.keyPair.pubKey)},
                    spks: utils.ArrayBuffertoBase64(spk.signature),
                    ik:  utils.ArrayBuffertoBase64(ik),
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

            hasSession: function (identifier) {
                return !!this.get('session' + identifier)
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
        }, true, true);

        return xabber;
    };
});