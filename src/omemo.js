define("xabber-omemo", function () {
    return function (xabber) {
        var env = xabber.env,
            constants = env.constants,
            utils = env.utils,
            $ = env.$,
            templates = env.templates.base,
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
                this.devices = {};
                this.fingerprints = new xabber.Fingerprints({model: this});
                this.updateDevices(attrs.devices);
                this.own_devices = {};
                this.onOwnDevicesUpdated();
                this.account.on("devices_updated", this.onOwnDevicesUpdated, this);
                this.set({
                    jid: attrs.jid
                });
            },

            updateDevices: function (devices) {
                if (!devices)
                    return;
                for (let d in this.devices) {
                    if (!devices[d])
                        delete this.devices[d];
                }
                for (let d in devices) {
                    this.getDevice(d);
                }
            },

            onOwnDevicesUpdated: function () {
                this.updateOwnDevices(this.account.connection.omemo.devices);
            },

            updateOwnDevices: function (devices) {
                if (!devices)
                    return;
                for (let d in this.own_devices) {
                    if (!devices[d])
                        delete this.own_devices[d];
                }
                for (let d in devices) {
                    this.getOwnDevice(d);
                }
            },

            getDevicesNode: async function () {
                return new Promise((resolve, reject) => {
                    this.account.connection.omemo.getDevicesNode(this.get('jid'), function (cb) {
                        this.updateDevices(this.account.connection.omemo.getUserDevices($(cb)));
                        resolve();
                    }.bind(this), function () {
                        resolve();
                    });
                });
            },

            encrypt: async function (message) {
                let enc_promises = [],
                    aes = await utils.AES.encrypt(message);

                if (!_.keys(this.devices).length)
                    await this.getDevicesNode();
                for (let device in this.devices) {
                    enc_promises.push(this.devices[device].encrypt(aes.keydata));
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

        xabber.Fingerprints = xabber.BasicView.extend({
            className: 'modal main-modal fingerprints-wrap',
            template: templates.fingerprints,
            ps_selector: '.fingerprints-content',
            ps_settings: {theme: 'item-list'},

            events: {
                'click .btn-trust': "trustDevice",
                'click tbody tr': "selectItem",
                'click .btn-cancel': "close",
                'click .fingerprints-header>div': "selectTable"
            },

            _initialize: function () {
                this.account = this.model.account;
                this.omemo = this.account.omemo;
                this.jid = this.model.get('jid');
                this.fingerprints = [];
                this.own_fingerprints = [];
            },

            selectTable: function (ev) {
                let $target = $(ev.target);
                if ($target.hasClass('active'))
                    return;
                this.$('.fingerprints-header>div').removeClass('active');
                $target.addClass('active');
                this.$('tbody.contact-fingerprints').showIf($target.hasClass('contact-devices'));
                this.$('tbody.own-fingerprints').showIf($target.hasClass('own-devices'));
            },

            open: function () {
                this.data.set('visible', true);
                this.show();
                this.renderDevices();
            },

            renderOwnFingerprint: async function () {
               /* let pubKey = utils.fromBase64toArrayBuffer(JSON.parse(this.omemo.get('identityKey')).pubKey),
                    device_id = this.omemo.get('device_id'),
                    device = this.model.getDevice(device_id);
                if (!device.get('ik'))
                    device.set('ik', pubKey);
                this.$('.own-fingerprint-wrap .fingerprint').text(await device.generateFingerprint());*/
            },

            renderDevices: function () {
                if (_.keys(this.model.devices).length)
                    this.updateContactFingerprints();
                else
                    this.model.getDevicesNode().then(() => {
                        this.updateContactFingerprints();
                    });
                this.updateOwnFingerprints();
                this.renderOwnFingerprint();
            },

            render: function () {
                this.$el.openModal({
                    complete: function () {
                        this.$el.detach();
                        this.data.set('visible', false);
                    }.bind(this)
                });
            },

            updateFingerprints: async function (devices, $container) {
                let counter = 0,
                    devices_count = _.keys(devices).length,
                    dfd = new $.Deferred();
                dfd.done((f_count) => {if (!f_count) $container.html($('<tr class="empty-table"><td colspan="3">No fingerprints yet</td></tr>'))});
                $container.html("");
                for (var device_id in devices) {
                    let device = devices[device_id];
                    if (device.get('ik')) {
                        let f = await device.generateFingerprint(),
                            is_trusted = (this.omemo.get('fingerprints')[(this.$('.contact-devices.active').length ? this.jid : this.account.get('jid'))] || []).indexOf(f) < 0 ? false : true;
                        $container.append(this.addRow(device.id, is_trusted, f));
                        counter++;
                        if (devices_count == counter)
                            dfd.resolve($container.find('tr').length);
                    }
                    else {
                        this.account.connection.omemo.getBundleInfo({jid: device.jid, id: device.id}, async function (iq) {
                            let $iq = $(iq),
                                $bundle = $iq.find(`item bundle[xmlns="${Strophe.NS.OMEMO}"]`),
                                ik = $bundle.find(`ik`).text();
                            if (ik) {
                                device.set('ik', utils.fromBase64toArrayBuffer(ik));
                                let f = await device.generateFingerprint(),
                                    is_trusted = (this.omemo.get('fingerprints')[(this.$('.contact-devices.active').length ? this.jid : this.account.get('jid'))] || []).indexOf(f) < 0 ? false : true;
                                $container.append(this.addRow(device.id, is_trusted, f));
                            }
                            counter++;
                            if (devices_count == counter)
                                dfd.resolve($container.find('tr').length);
                        }.bind(this), function () {
                            counter++;
                            if (devices_count == counter)
                                dfd.resolve($container.find('tr').length);
                        }.bind(this));
                    }
                }
            },

            updateOwnFingerprints: async function () {
                let own_devices = _.clone(this.model.own_devices);
                delete own_devices[this.omemo.get('device_id')];
                this.updateFingerprints(own_devices, this.$('tbody.own-fingerprints'));

            },

            updateContactFingerprints: async function () {
                this.updateFingerprints(this.model.devices, this.$('tbody.contact-fingerprints'));
            },

            close: function () {
                var deferred = new $.Deferred();
                this.$el.closeModal({ complete: function () {
                        this.$el.detach();
                        this.data.set('visible', false);
                        deferred.resolve();
                    }.bind(this)});
                return deferred.promise();
            },

            selectItem: function (ev) {
                $(ev.target).closest('tr').toggleClass('selected');
            },

            trustDevice: function () {
                utils.dialogs.ask_extended("Trust/revoke fingerprint", "Do you really want to trust the fingerprints", null, { ok_button_text: 'trust', optional_button: 'revoke'}).done(function (result) {
                    if (result) {
                        let trust = (result !== 'revoke');
                        this.$('tr.selected').each(function (i, tr) {
                            let fingerprint = $(tr).children('.fingerprint').text(),
                                is_trusted = $(tr).children('th[data-trust]').data('trust'),
                                device_id = Number($(tr).children('th:not(.fingerprint):not([data-trust])').text());
                            $(tr).children('th[data-trust]').attr('data-trust', trust).text(trust);
                            this.omemo.updateFingerprints((this.$('.contact-devices.active').length ? this.jid : this.account.get('jid')), fingerprint, trust);
                            let device = this.model.getDevice(device_id);
                            if (is_trusted != trust) {
                                device.set('trusted', trust);
                                device.is_session_initiated = false;
                                device.preKeys = null;
                            }
                        }.bind(this));
                    }
                    this.$('tr.selected').removeClass('selected');
                }.bind(this));
            },

            addRow: function (id, trust, fingerprint) {
                let $row = $('<tr/>');
                $row.append($('<th/>').text(id));
                $row.append($(`<th data-trust="${trust}"/>`).text(trust));
                $row.append($('<th class="fingerprint"/>').text(fingerprint));
                return $row;
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
               await this.getPreKeys();
               if (this.model.get('resend_bundle')) {
                   this.model.publishBundle();
                   this.set('resend_bundle', false);
               }
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

            getSignedPreKey: async function () {
                let spk = this.model.get('signedPreKey');
                if (spk) {
                    let pubKey = utils.fromBase64toArrayBuffer(spk.keyPair.pubKey),
                        privKey = utils.fromBase64toArrayBuffer(spk.keyPair.privKey),
                        signature = utils.fromBase64toArrayBuffer(spk.signature),
                        keyPair = {pubKey, privKey},
                        keyId = spk.keyId;
                    return {keyPair, keyId, signature};
                }
                else {
                    return await this.generateSignedPreKey(this.preKeys[0].keyId || 1);
                }
            },

            getPreKeys: async function () {
                this.model.account.ownprekeys.getAll(null, async function (cb) {
                    if (cb && cb.length >= constants.MIN_PREKEYS_COUNT) {
                        cb.forEach(async function (pk) {
                            let id = pk.id,
                                prekey = JSON.parse(pk.key),
                                priv_pk = utils.fromBase64toArrayBuffer(prekey.privKey),
                                pub_pk = utils.fromBase64toArrayBuffer(prekey.pubKey),
                                key_pair = {pubKey: pub_pk, privKey: priv_pk};
                            this.preKeys.push({keyId: id, keyPair: key_pair});
                            this.store.storePreKey(id, key_pair);
                        }.bind(this));
                        this.getUsedPreKeys();
                        let spk = await this.getSignedPreKey();
                        this.preKeys.push(spk);
                        this.store.storeSignedPreKey(spk.keyId, spk.keyPair);
                    }
                    else {
                        this.generatePreKeys().then((prekeys) => {
                            this.preKeys = prekeys;
                            this.getUsedPreKeys();
                        });
                    }
                }.bind(this));
            },

            getUsedPreKeys: function () {
                this.model.account.own_used_prekeys.getAll(null, async function (cb) {
                    if (cb && cb.length) {
                        cb.forEach(async function (pk) {
                            let id = pk.id,
                                prekey = JSON.parse(pk.key),
                                privKey = utils.fromBase64toArrayBuffer(prekey.privKey),
                                pubKey = utils.fromBase64toArrayBuffer(prekey.pubKey);
                            this.store.storePreKey(id, {pubKey, privKey});
                        }.bind(this));
                    }
                }.bind(this));
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
                this.cacheSignedPreKey(signedPreKey);

                return signedPreKey;
            },

            cacheSignedPreKey: function (spk) {
                let pubKey = utils.ArrayBuffertoBase64(spk.keyPair.pubKey),
                    privKey = utils.ArrayBuffertoBase64(spk.keyPair.privKey),
                    signature = utils.ArrayBuffertoBase64(spk.signature),
                    keyPair = {pubKey, privKey},
                    keyId = spk.keyId,
                    converted_spk = {keyPair, keyId, signature};
                this.model.save('signedPreKey', converted_spk);
            }

        });

        xabber.OwnPreKeys = Backbone.ModelWithDataBase.extend({
            defaults: {
                preKeys: []
            },

            putPreKey: function (value, callback) {
                this.database.put('prekeys', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            getPreKey: function (value, callback) {
                this.database.get('prekeys', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            getAll: function (value, callback) {
                !value && (value = null);
                this.database.get_all('prekeys', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            removePreKey: function (value, callback) {
                this.database.remove('prekeys', value, function (response_value) {
                    callback && callback(response_value);
                });
            }
        });

        xabber.OwnUsedPreKeys = Backbone.ModelWithDataBase.extend({
            defaults: {
                preKeys: []
            },

            putPreKey: function (value, callback) {
                this.database.put('prekeys', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            getPreKey: function (value, callback) {
                this.database.get('prekeys', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            getAll: function (value, callback) {
                !value && (value = null);
                this.database.get_all('prekeys', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            removePreKey: function (value, callback) {
                this.database.remove('prekeys', value, function (response_value) {
                    callback && callback(response_value);
                });
            }
        });

        xabber.UsedPreKeys = Backbone.ModelWithDataBase.extend({
            defaults: {
                preKeys: []
            },

            putPreKey: function (value, callback) {
                this.database.put('prekeys', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            getPreKey: function (value, callback) {
                this.database.get('prekeys', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            getAll: function (value, callback) {
                !value && (value = null);
                this.database.get_all('prekeys', value, function (response_value) {
                    callback && callback(response_value);
                });
            },

            removePreKey: function (value, callback) {
                this.database.remove('prekeys', value, function (response_value) {
                    callback && callback(response_value);
                });
            }
        });

        xabber.Device = Backbone.Model.extend({
            initialize: function (attrs, options) {
                this.account = options.account;
                this.id = attrs.id;
                this.jid = attrs.jid;
                this.store = options.store;
                this.preKeys = null;
                this.address = new SignalProtocolAddress(attrs.jid, attrs.id);
            },

            generateFingerprint: function () {
                let generator = new FingerprintGenerator(1024),
                    localPub = utils.fromBase64toArrayBuffer(JSON.parse(this.account.omemo.get('identityKey')).pubKey);
                return generator.createFor(String(this.account.omemo.get('device_id')), localPub, String(this.id), this.get('ik'));
            },

            closeSession: function (reason) {
                this.account.connection.omemo.sendOptOut({
                    to: this.jid,
                    reason: reason
                }, function () {

                }.bind(this));
            },

            getBundle: async function () {
                return new Promise((resolve, reject) => {
                    this.account.connection.omemo.getBundleInfo({jid: this.jid, id: this.id}, function (iq) {
                        let $iq = $(iq),
                            $bundle = $iq.find(`item bundle[xmlns="${Strophe.NS.OMEMO}"]`),
                            $spk = $bundle.find('spk'),
                            spk = {id: $spk.attr('id'), key: $spk.text(), signature: $bundle.find('spks').text()},
                            ik =  $bundle.find(`ik`).text();
                        this.preKeys = [];
                        $bundle.find('prekeys pk').each((i, pk) => {
                            let $pk = $(pk);
                            this.preKeys.push({id: $pk.attr('id'), key: $pk.text()});
                        });
                        let pk = this.getRandomPreKey();
                        if (!pk)
                            reject();
                        else
                            resolve({pk, spk, ik});
                    }.bind(this), function () {
                        this.preKeys = [];
                        reject();
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
                try {
                    let sessionCipher = new SessionCipher(this.store, this.address), plainText;

                    if (!this.store.hasSession(this.address.toString())) {
                        let session = this.getCachedSession();
                        session && await this.store.storeSession(this.address.toString(), session);
                    }

                    if (preKey)
                        plainText = await sessionCipher.decryptPreKeyWhisperMessage(cipherText, 'binary');
                    else {
                        plainText = await sessionCipher.decryptWhisperMessage(cipherText, 'binary');
                    }

                    return plainText;
                }
                catch (e) {
                    return null;
                }
            },

            getPreKey: function () {
                return new Promise((resolve, reject) => {
                    this.account.used_prekeys.getPreKey(String(this.id), function (pk) {
                        resolve(pk);
                    }.bind(this));
                });
            },

            getCachedSession: function () {
                return this.account.omemo.getSession('session' + this.address.toString());
            },

            encrypt: async function (plainText) {
                try {
                    if (this.get('trusted') === false && (this.id != this.account.omemo.get('device_id')))
                        return null;
                    if (!this.store.hasSession(this.address.toString()) || !this.is_session_initiated) { // this.preKeys ??
                        if (!this.preKeys) {
                            this.is_session_initiated = true;
                            let s = await this.initSession();
                            if (!s)
                                return null;
                        }
                        else
                            return null;
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
                let {pk, spk, ik} = await this.getBundle(),
                    cached_pk = await this.getPreKey(),
                    id = this.id;
                if (cached_pk) {
                    if (!spk || spk && JSON.stringify(spk) == JSON.stringify(cached_pk.spk) && JSON.stringify(ik) == JSON.stringify(cached_pk.ik))
                        pk = cached_pk.pk;
                    else
                        this.account.used_prekeys.putPreKey({id, pk, spk, ik});
                }
                else
                    this.account.used_prekeys.putPreKey({id, pk, spk, ik});
                this.set({'pk': utils.fromBase64toArrayBuffer(pk.key), 'ik': utils.fromBase64toArrayBuffer(ik)});
                this.fingerprint = await this.generateFingerprint();
                if ((this.id != this.account.omemo.get('device_id')) && !this.account.omemo.isTrusted(this.jid, this.fingerprint)) {
                    this.set('trusted', false);
                    return false;
                }
                else
                    this.set('trusted', true);
                this.processPreKey({
                    registrationId: Number(id),
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
                return true;
            },

            processPreKey: function (preKeyBundle) {
                this.session = new SessionBuilder(this.store, this.address);
                return this.session.processPreKey(preKeyBundle);
            },

            removeSession: function () {
                this.store.removeSession(this.address.toString());
                this.sessionCipher = null;
            },

            getSession: function () {
                if (!this.sessionCipher) {
                    this.sessionCipher = new SessionCipher(this.store, this.address);
                }
                return this.sessionCipher;
            }
        });

        xabber.Omemo = Backbone.ModelWithStorage.extend({
            defaults: {
                sessions: {},
                fingerprints: {},
                device_id: ""
            },

            _initialize: function (attrs, options) {
                this.on("change:device_id", this.onDeviceIdUpdated, this);
                this.account = options.account;
                this.peers = new xabber.Peers();
                if (!this.get('device_id'))
                    this.set('device_id', this.generateDeviceId());
                this.store = new xabber.SignalProtocolStore();
                this.account.on('device_published', this.publishBundle, this);
                this.store.on('prekey_removed', this.removePreKey, this);
                this.on("quit", this.onQuit, this);
                this.store.on('session_stored', this.cacheSession, this);
            },

            onConnected: function () {
                this.cached_messages = new xabber.DecryptedMessages({id: 'decrypted-messages'}, {
                    account: this.account,
                    storage_name: xabber.getStorageName() + '-decrypted-messages-' + this.account.get('jid'),
                    fetch: 'before'
                });
                this.bundle = new xabber.Bundle(null, {store: this.store, model: this});
                this.connection = this.account.connection;
                this.registerMessageHandler();
                this.addDevice();
            },

            updateFingerprints: function (contact, fingerprint, trust) {
                let fingerprints = _.clone(this.get('fingerprints'));
                if (!fingerprints[contact])
                    fingerprints[contact] = [];
                let contact_fingerprints = fingerprints[contact],
                    idx = contact_fingerprints.indexOf(fingerprint);
                if (trust && idx < 0)
                    contact_fingerprints.push(fingerprint);
                if (!trust && idx >= 0)
                    contact_fingerprints.splice(idx, 1);
                this.save('fingerprints', fingerprints);
            },

            isTrusted: function (jid, fingerprint) {
                let fingerprints = _.clone(this.get('fingerprints'));
                if (!fingerprints[jid])
                    return false;
                else if (fingerprints[jid].indexOf(fingerprint) >= 0)
                    return true;
                else
                    return false;

            },

            onQuit: function () {
                window.indexedDB.databases().then((dbs) => {
                    dbs.forEach(db => { window.indexedDB.deleteDatabase(db.name) })
                });
            },

            addDevice: function () {
                let device_id = this.get('device_id');
                if (this.connection) {
                    let omemo = this.connection.omemo;
                    if (omemo.devices.length) {
                        let device = omemo.devices[device_id];
                        if (!device || device && device.label != this.account.settings.get('device_label_text')) {
                            let label = this.account.settings.get('device_label_text');
                            omemo.publishDevice(device_id, label, function () {
                                this.account.trigger('device_published');
                            }.bind(this));
                        }
                        else
                            this.account.trigger('device_published');
                    }
                    else
                        omemo.getDevicesNode(null, function (cb) {
                            omemo.devices = omemo.getUserDevices($(cb));
                            let device = omemo.devices[device_id];
                            if (!device || device && device.label != this.account.settings.get('device_label_text')) {
                                let label = this.account.settings.get('device_label_text');
                                omemo.publishDevice(device_id, label, function () {
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

            updateMessage: function (attrs, contact) {
                if (!this.cached_messages)
                    return;
                this.cached_messages.updateMessage(attrs, contact);
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
                    origin_id = $msg.children('origin-id').attr('id'),
                    plaintext = $msg.children('body')[0].outerHTML;

                $msg.children('reference').each(function (i, ref) {
                    plaintext += ref.outerHTML;
                }.bind(this));

                this.cached_messages.putMessage(contact, origin_id, plaintext);

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
                    $(message.tree()).children('reference').remove();

                    message.cnode(encryptedElement.tree());
                    message.up().c('store', {
                        xmlns: 'urn:xmpp:hints'
                    }).up()
                        .c('body').t('This message is encrypted using OMEMO end-to-end encryption.').up();

                    return message;
                }).catch((msg) => {

                });
            },

            receiveHeadlineMessage: function (message) {
                var $message = $(message),
                    from_jid = Strophe.getBareJidFromJid($message.attr('from')),
                    node = $message.find('items').attr('node');
                if ($message.find('event[xmlns="' + Strophe.NS.PUBSUB + '#event"]').length) {
                    if (node == `${Strophe.NS.OMEMO}:devices`) {
                        let devices = this.account.connection.omemo.getUserDevices($message);
                        if (from_jid === this.account.get('jid')) {
                            this.account.connection.omemo.devices = devices;
                            let device_id = this.account.omemo.get('device_id'),
                                device = this.account.connection.omemo.devices[device_id];
                            if (!device || device && device.label != this.account.settings.get('device_label_text')) {
                                let label = this.account.settings.get('device_label_text');
                                this.account.connection.omemo.publishDevice(device_id, label, () => {
                                    this.account.trigger('device_published');
                                });
                            }
                            this.account.trigger("devices_updated");
                        }
                        else {
                            this.getPeer(from_jid).updateDevices(devices);
                        }
                        return;
                    }
                    if (node == `${Strophe.NS.OMEMO}:bundles`) {
                        let id = $message.find('item').attr('id');
                        this.getPeer(from_jid).getDevice(id);
                    }
                }
            },

            receiveChatMessage: function (message, options) {
                options = options || {};
                let $message = $(message);
                if ($message.find(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`).length) {
                    if ($message.find('result[xmlns="' + Strophe.NS.MAM + '"]').length)
                        _.extend(options, {
                            is_mam: true,
                            is_archived: true
                        });
                    if ($message.find('[xmlns="' + Strophe.NS.CARBONS + '"]').length)
                        options.carbon_copied = true;

                    let $msg = $message.find(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`).parent(),
                        jid = Strophe.getBareJidFromJid($msg.attr('from')) === this.account.get('jid') ? Strophe.getBareJidFromJid($msg.attr('to')) : Strophe.getBareJidFromJid($msg.attr('from')),
                        contact = this.account.contacts.get(jid),
                        stanza_id = $msg.children(`stanza-id[by="${this.account.get('jid')}"]`).attr('id'),
                        cached_msg = this.cached_messages.getMessage(contact, stanza_id);

                    if (cached_msg) {
                        options.encrypted = true;
                        $message.find('body').remove();
                        $message.find(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`).replaceWith(cached_msg);
                        this.account.chats.receiveChatMessage($message[0], options);
                        return;
                    }

                    this.decrypt(message).then((decrypted_msg) => {
                        if (decrypted_msg) {
                            options.encrypted = true;
                            this.cached_messages.putMessage(contact, stanza_id, decrypted_msg);
                            $message.find('body').remove();
                        }
                        else
                            options.not_encrypted = true;
                        $message.find(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`).replaceWith(decrypted_msg);
                        this.account.chats.receiveChatMessage($message[0], options);
                    });
                }
            },

            receiveMessage: function (message) {
                let $message = $(message),
                    type = $message.attr('type');
                if (type === 'headline') {
                    return this.receiveHeadlineMessage(message);
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
                    $encrypted;

                if ($message.find('result[xmlns="'+Strophe.NS.MAM+'"]').length) {
                    let $m = $message.find('message').first();
                    from_jid = Strophe.getBareJidFromJid($m.attr('from'));
                    $encrypted = $message.children(`result`).children(`forwarded`).children(`message`).children(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`);
                }
                else if ($message.find('[xmlns="'+Strophe.NS.CARBONS+'"]').length)
                    $encrypted = $message.children(`[xmlns="${Strophe.NS.CARBONS}"]`).children(`forwarded`).children(`message`).children(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`);
                else
                    $encrypted = $message.children(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`);

                let encryptedData = this.parseEncrypted($encrypted),
                    deviceId = this.get('device_id'),
                    ownPreKeysArr =  encryptedData.keys.filter(preKey => preKey.deviceId == deviceId),
                    ownPreKey = ownPreKeysArr[0];
                if (!ownPreKey)
                    return;
                let peer = this.getPeer(from_jid),
                    exportedKey = await peer.decrypt(encryptedData.sid, ownPreKey.ciphertext, ownPreKey.preKey);
                if (!exportedKey)
                    return;
                let exportedAESKey = exportedKey.slice(0, 16),
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
                    let id = pk.keyId,
                        pubKey = utils.ArrayBuffertoBase64(pk.keyPair.pubKey),
                        privKey = utils.ArrayBuffertoBase64(pk.keyPair.privKey),
                        key = JSON.stringify({pubKey, privKey});
                    if (!pk.signature)
                        prekeys.push({id: id, key: pubKey});
                    this.account.ownprekeys.putPreKey({id, key})
                }.bind(this));
                conn_omemo.publishBundle({
                    spk: {id: spk.keyId, key: utils.ArrayBuffertoBase64(spk.keyPair.pubKey)},
                    spks: utils.ArrayBuffertoBase64(spk.signature),
                    ik:  utils.ArrayBuffertoBase64(ik),
                    pks: prekeys,
                    device_id: this.get('device_id')
                });
            },

            removePreKey: async function (id) {
                if  (!this.account)
                    return;
                let bundle = this.bundle,
                    removed_pk = this.bundle.preKeys.find(p => p.keyId === id && !p.signature);
                if (!removed_pk)
                    return;
                let pubKey = utils.ArrayBuffertoBase64(removed_pk.keyPair.pubKey),
                    privKey = utils.ArrayBuffertoBase64(removed_pk.keyPair.privKey),
                    key = JSON.stringify({pubKey, privKey}),
                    idx = this.bundle.preKeys.indexOf(removed_pk);
                bundle.preKeys.splice(idx, 1);
                this.account.own_used_prekeys.putPreKey({id, key});
                this.account.ownprekeys.removePreKey(id);
                if (bundle.preKeys.length && bundle.preKeys.length < constants.MIN_PREKEYS_COUNT) {
                    let missing_keys = constants.PREKEYS_COUNT - bundle.preKeys.length,
                        last_id = _.sortBy(xabber.accounts.connected[0].omemo.bundle.preKeys, 'keyId').last().keyId;
                    for (var i = ++last_id; last_id + missing_keys; i++)
                        await this.bundle.generatePreKey(i);
                    this.account.omemo.publishBundle();
                }
                else
                    this.account.omemo.publishBundle();
            },

            cacheSession: function (attrs) {
                let id = attrs.id,
                    session = attrs.rec,
                    sessions = _.clone(this.get('sessions'));
                _.isArray(sessions) && (sessions = {});
                sessions[id] = session;
                this.save('sessions', sessions);
            },

            getSession: function (id) {
                let sessions = _.clone(this.get('sessions'));
                return sessions[id];
            },

            publishBundle: async function () {
                let spk = this.bundle.preKeys.find(pk => pk.signature),
                    ik = await this.store.getIdentityKeyPair(),
                    pks = this.bundle.preKeys;
                if (!spk || !ik) {
                    this.set('resend_bundle', true);
                    return;
                }
                this.account.connection.omemo.getBundleInfo({jid: this.account.get('jid'), id: this.get('device_id')}, function () {
                        this.publish(spk, ik.pubKey, pks);
                    }.bind(this),
                    function (err) {
                        if (($(err).find('error').attr('code') == 404))
                            this.account.connection.omemo.createBundleNode(this.get('device_id'), function () {
                                this.publish(spk, ik.pubKey, pks);
                            }.bind(this));
                    }.bind(this));
            }
        });

        xabber.DecryptedMessages = Backbone.ModelWithStorage.extend({
            defaults: {
                messages: {}
            },

            getMessage: function (contact, stanza_id) {
                let messages = _.clone(this.get('messages')),
                    contact_messages = messages[contact.get('jid')] || {};
                return contact_messages[stanza_id];
            },

            putMessage: function (contact, stanza_id, message) {
                let messages = _.clone(this.get('messages')),
                    contact_messages = messages[contact.get('jid')] || {};
                contact_messages[stanza_id] = message;
                messages[contact.get('jid')] = contact_messages;
                this.save('messages', messages);
            },

            removeMessage: function (attrs, contact) {
                let origin_id = attrs.origin_id;
                let messages = _.clone(this.get('messages')),
                    contact_messages = messages[contact.get('jid')] || {};
                delete contact_messages[origin_id];
                messages[contact.get('jid')] = contact_messages;
                this.save('messages', messages);
            },

            updateMessage: function (attrs, contact) {
                let stanza_id = attrs.stanza_id,
                    origin_id = attrs.origin_id,
                    messages = _.clone(this.get('messages')),
                    contact_messages = messages[contact.get('jid')] || {},
                    message = contact_messages[origin_id];
                if (origin_id)
                    this.removeMessage({origin_id}, contact);
                if (stanza_id)
                    this.putMessage(contact, stanza_id, message);
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
                this.trigger('prekey_removed', keyId);
                // return Promise.resolve(this.remove('25519KeypreKey' + keyId));
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
                this.trigger('session_stored', {id: 'session' + identifier, rec: record});
                return Promise.resolve(this.put('session' + identifier, record));
            },

            removeSession: function (identifier) {
                return Promise.resolve(this.remove('session' + identifier));
            },

            getAllSessions: function (identifier) {
                let sessions = [];
                for (var id in this.store) {
                    if (id.startsWith('session' + identifier)) {
                        sessions.push({id: id, session: this.store[id]});
                    }
                }
                return Promise.resolve(sessions);
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

        xabber.Account.addInitPlugin(function () {
            if (!this.settings.get('omemo'))
                return;
            this.own_used_prekeys = new xabber.OwnUsedPreKeys(null, {
                name: `cached-used-own-prekeys-list-${this.get('jid')}`,
                objStoreName: 'prekeys',
                primKey: 'id'
            });
            this.omemo = new xabber.Omemo({id: 'omemo'}, {
                account: this,
                storage_name: xabber.getStorageName() + '-omemo-settings-' + this.get('jid'),
                fetch: 'before'
            });
        });

        xabber.Account.addConnPlugin(function () {
            if (!this.settings.get('omemo'))
                return;
            this.ownprekeys = new xabber.OwnPreKeys(null, {
                name: `cached-prekeys-list-${this.get('jid')}`,
                objStoreName: 'prekeys',
                primKey: 'id'
            });
            this.used_prekeys = new xabber.OwnUsedPreKeys(null, {
                name: `cached-used-prekeys-list-${this.get('jid')}`,
                objStoreName: 'prekeys',
                primKey: 'id'
            });
            this.omemo.onConnected();
        }, true, true);

        return xabber;
    };
});