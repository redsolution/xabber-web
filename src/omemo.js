import xabber from "xabber-core";

let env = xabber.env,
    constants = env.constants,
    utils = env.utils,
    $ = env.$,
    templates = env.templates.base,
    Strophe = env.Strophe,
    _ = env._,
    KeyHelper = env.libsignal.KeyHelper,
    SignalProtocolAddress = env.libsignal.SignalProtocolAddress,
    SessionBuilder = env.libsignal.SessionBuilder,
    SessionCipher = env.libsignal.SessionCipher;

xabber.Peer = Backbone.Model.extend({
    idAttribute: 'jid',

    initialize: function (attrs, options) {
        attrs = attrs || {};
        this.account = options.account;
        this.devices = {};
        this.store = this.account.omemo.store;
        this.fingerprints = new xabber.Fingerprints({model: this});
        this.updateDevices(attrs.devices);
        this.set({
            jid: attrs.jid
        });
    },

    updateDevices: function (devices) {
        if (!devices)
            return;
        for (let d in this.devices) {
            if (!devices[d]) {
                this.account.omemo.removeSession('session' + this.devices[d].address.toString());
                delete this.devices[d];
            }
        }
        for (let d in devices) {
            let device = this.getDevice(d),
                label = devices[d].label;
            label && device.set('label', label);
        }
    },

    getDevicesNode: async function () {
        if (!this._pending_devices) {
            this._pending_devices = true;
            this._dfd_devices = new $.Deferred();
            return new Promise((resolve, reject) => {
                this.account.getConnectionForIQ().omemo.getDevicesNode(this.get('jid'), (cb) => {
                    this.updateDevices(this.account.getConnectionForIQ().omemo.parseUserDevices($(cb)));
                    this._pending_devices = false;
                    this._dfd_devices.resolve();
                    resolve();
                }, () => {
                    this._pending_devices = false;
                    this._dfd_devices.resolve();
                    resolve();
                });
            });
        } else {
            return new Promise((resolve, reject) => {
                this._dfd_devices.done(() => {
                    resolve();
                });
            });
        }
    },

    encrypt: async function (message) {
        let enc_promises = [],
            aes = await utils.AES.encrypt(message),
            is_trusted = true;

        if (!_.keys(this.devices).length)
            await this.getDevicesNode();
        for (let device in this.devices) {
            enc_promises.push(this.devices[device].encrypt(aes.keydata));
        }

        for (let device in this.account.omemo.own_devices) {
            enc_promises.push(this.account.omemo.own_devices[device].encrypt(aes.keydata));
        }

        let keys = await Promise.all(enc_promises);

        keys = keys.filter(key => key !== null);

        for (let device_id in this.devices) {
            let device = this.devices[device_id];
            if (device.get('ik') === null)
                continue;
            if (device.get('trusted') === null)
                is_trusted = 'error';
            if (is_trusted && device.get('trusted') === undefined)
                is_trusted = 'none';
        }

        return {
            keys: keys,
            payload: aes.payload,
            is_trusted: is_trusted
        };
    },

    decrypt: async function (deviceId, ciphertext, preKey) {
        let device = this.getDevice(deviceId);

        return device.decrypt(ciphertext, preKey);
    },

    getDevice: function (id) {
        if (!this.devices[id]) {
            this.devices[id] = new xabber.Device({jid: this.get('jid'), id: id }, { account: this.account, store: this.store});
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
        'click .btn-ignore': "ignoreDevice",
        'click .btn-delete': "deleteDevice",
        "click .set-label + div": "editLabel",
        'click .btn-cancel': "close"
    },

    _initialize: function () {
        if (this.model.own_devices) {
            this.account = this.model.account;
            this.omemo = this.model;
            this.jid = this.account.get('jid');
            this.is_own_devices = true;
        } else {
            this.account = this.model.account;
            this.omemo = this.account.omemo;
            this.jid = this.model.get('jid');
        }
    },

    open: function () {
        this.omemo = this.account.omemo;
        let name = "";
        if (this.is_own_devices)
            name = this.account.get('name');
        else {
            let contact = this.account.contacts.get(this.jid);
            name = contact ? contact.get('name') : this.jid;
        }
        this.$('.header').text(xabber.getString('omemo__dialog_fingerprints__header', [name]));
        this.data.set('visible', true);
        this.show();
        this.$('div.fingerprints-content').html(env.templates.contacts.preloader());
        if (this.is_own_devices)
            this.renderOwnDevices();
        else
            this.renderDevices();
    },

    renderDevices: function () {
        this.model.getDevicesNode().then(() => {
            let devices_count = _.keys(this.model.devices).length;
            this.updateFingerprints(this.model.devices);
        });
        this.updateOwnFingerprint();
    },

    renderOwnDevices: function () {
        this.omemo.getMyDevices().then(() => {
            let devices_count = _.keys(this.model.own_devices).length;
            this.updateFingerprints(this.model.own_devices);
            this.updateOwnFingerprint();
        });
    },

    render: function () {
        this.$el.openModal({
            complete: () => {
                this.$el.detach();
                this.data.set('visible', false);
            }
        });
    },

    editLabel: function () {
        this.$('.set-label').removeClass('hidden');
        this.$('.set-label').focus();
        let saveLabel = (ev) => {
            let label = ev.target.value.trim();
            this.saveLabel(label);
        };
        this.$('.set-label')[0].onblur = saveLabel;
        this.$('input.set-label')[0].onkeydown = (ev) => {
            if (ev.keyCode == constants.KEY_ENTER)
                saveLabel(ev);
        };
    },

    saveLabel: function (label) {
        this.$('.set-label').addClass('hidden');
        if (label == this.account.settings.get('device_label_text'))
            return;
        this.account.settings.save('device_label_text', label);
        this.account.getConnectionForIQ().omemo.publishDevice(this.omemo.get('device_id'), label, () => {
            this.updateOwnFingerprint();
        });
    },

    updateFingerprints: async function (devices) {
        let counter = 0,
            devices_count = _.keys(devices).length,
            dfd = new $.Deferred(),
            $container = this.$('div.fingerprints-content');
        dfd.done((f_count) => {
            if (!f_count)
                $container.html($(`<div class="empty-table">${xabber.getString("omemo__dialog_fingerprints__text_no_fingerprints")}</div>`));
            else
                this.$('.dropdown-button').dropdown({
                    inDuration: 100,
                    outDuration: 100,
                    constrainWidth: false,
                    hover: false,
                    container: this.$('.fingerprints-content')[0],
                    alignment: 'left'
                });
            this.jid == this.account.get('jid') && f_count++;
            this.$('.additional-info').text(xabber.getQuantityString("omemo__dialog_fingerprints__text_devices_count", f_count, [this.jid, f_count]));
            $container.find('.preloader-wrapper').detach();
        });
        for (let device_id in devices) {
            if (device_id == this.omemo.get('device_id')) {
                counter++;
                if (devices_count == counter)
                    dfd.resolve($container.find('div.row').length);
                continue;
            }
            let device = devices[device_id];
            if (device.get('ik')) {
                let options = {},
                    f = device.generateFingerprint(),
                    fing = (this.omemo.get('fingerprints')[this.jid] || [])[device_id],
                    is_trusted = fing ? (fing.fingerprint != f ? 'error' : (fing.trusted ? 'trust' : 'ignore')) : 'unknown';
                is_trusted === 'error' && (options.old_fingerprint = fing.fingerprint);
                $container.append(this.addRow(device.id, device.get('label'), is_trusted, f, options));
                counter++;
                if (devices_count == counter)
                    dfd.resolve($container.find('div.row').length);
            }
            else {
                this.account.getConnectionForIQ().omemo.getBundleInfo({jid: device.jid, id: device.id}, async (iq) => {
                    let $iq = $(iq),
                        $bundle = $iq.find(`item[id="${device.id}"] bundle[xmlns="${Strophe.NS.OMEMO}"]`),
                        ik = $bundle.find(`ik`).text();
                    if (ik) {
                        device.set('ik', utils.fromBase64toArrayBuffer(ik));
                        let options = {},
                            f = device.generateFingerprint(),
                            fing = (this.omemo.get('fingerprints')[this.jid] || [])[device.id],
                            is_trusted = fing ? (fing.fingerprint != f ? 'error' : (fing.trusted ? 'trust' : 'ignore')) : 'unknown';
                        is_trusted === 'error' && (options.old_fingerprint = fing.fingerprint);
                        $container.append(this.addRow(device.id, device.get('label'), is_trusted, f, options));
                    }
                    counter++;
                    if (devices_count == counter)
                        dfd.resolve($container.find('div.row').length);
                }, () => {
                    counter++;
                    if (devices_count == counter)
                        dfd.resolve($container.find('div.row').length);
                });
            }
        }
    },

    updateOwnFingerprint: async function () {
        this.$('.this-device-content').html("");
        let omemo = this.account.omemo;
        if (omemo) {
            let device = omemo.own_devices[omemo.get('device_id')];
            if (device) {
                if (device.get('fingerprint')) {
                    this.$('.this-device-content').append(this.addRow(device.id, device.get('label'), null, device.get('fingerprint')));
                } else if (device.get('ik')) {
                    device.set('fingerprint', device.generateFingerprint());
                    this.$('.this-device-content').append(this.addRow(device.id, device.get('label'), null, device.get('fingerprint')));
                } else {
                    device.getBundle().then(({pk, spk, ik}) => {
                        device.set('ik', utils.fromBase64toArrayBuffer(ik));
                        let fingerprint = device.generateFingerprint();
                        if (!device.get('fingerprint') || device.get('fingerprint') !== fingerprint)
                            device.set('fingerprint', fingerprint);
                        this.$('.this-device-content').append(this.addRow(device.id, device.get('label'), null, device.get('fingerprint')));
                    });
                }
            } else {
                omemo.store.getIdentityKeyPair().then((ik) => {
                    let pubKey = ik.pubKey;
                    if (pubKey.byteLength == 33)
                        pubKey = pubKey.slice(1);
                    let fingerprint = Array.from(new Uint8Array(pubKey)).map(b => b.toString(16).padStart(2, "0")).join("");
                    this.$('.this-device-content').append(this.addRow(omemo.get('device_id'), this.account.settings.get('device_label_text'), null, fingerprint));
                });
            }

        }
    },

    close: function () {
        let deferred = new $.Deferred();
        this.$el.closeModal({ complete: () => {
                this.$el.detach();
                this.data.set('visible', false);
                deferred.resolve();
            }});
        return deferred.promise();
    },

    trustDevice: function (ev) {
        let $target = $(ev.target).closest('div.row'),
            fingerprint = $target.find('.fingerprint').text().replace(/ /g, ""),
            is_trusted = $target.children('.buttons[data-trust]').attr('data-trust'),
            device_id = Number($target.find('div.device-id').text());
        $target.children('.buttons[data-trust]').attr('data-trust', 'trust');
        $target.find('.trust-item-wrap').children().attr('data-value', 'trust').text(xabber.getString('omemo__dialog_fingerprints__button_trust'));
        this.omemo.updateFingerprints(this.jid, device_id, fingerprint, true);
        let device = this.is_own_devices ? this.account.omemo.own_devices[device_id] : this.model.devices[device_id];
        if (device && is_trusted != 'trusted') {
            if (is_trusted === 'error')
                $target.find('.old-fingerprint').detach();
            device.set('trusted', true);
            device.is_session_initiated = false;
            device.preKeys = null;
            this.account.trigger('trusting_updated');
        }
    },

    ignoreDevice: function (ev) {
        let $target = $(ev.target).closest('div.row'),
            fingerprint = $target.find('.fingerprint').text().replace(/ /g, ""),
            is_trusted = $target.children('.buttons[data-trust]').attr('data-trust'),
            device_id = Number($target.find('div.device-id').text());
        $target.children('.buttons[data-trust]').attr('data-trust', 'ignore');
        $target.find('.trust-item-wrap').children().attr('data-value', 'ignore').text(xabber.getString('omemo__dialog_fingerprints__button_ignore'));
        this.omemo.updateFingerprints(this.jid, device_id, fingerprint, false);
        let device = this.is_own_devices ? this.account.omemo.own_devices[device_id] : this.model.devices[device_id];
        if (device && is_trusted != 'ignore') {
            if (is_trusted === 'error')
                $target.find('.old-fingerprint').detach();
            device.set('trusted', false);
            device.is_session_initiated = false;
            device.preKeys = null;
            this.account.trigger('trusting_updated');
        }
    },

    addRow: function (id, label, trust, fingerprint, options) {
        options = options || {};
        let delete_button = this.is_own_devices ? true : false,
            edit_setting = id == this.omemo.get('device_id'),
            old_fingerprint = options.old_fingerprint,
            error;
        if (fingerprint.match(/.{1,8}/g))
            fingerprint = fingerprint.match(/.{1,8}/g).join(" ");
        else {
            fingerprint = '';
            error = xabber.getString("omemo__dialog_fingerprints__invalid_fingerprint");
            let device = this.is_own_devices ? this.account.omemo.own_devices[id] : this.model.devices[id];
            if (device && trust != 'ignore') {
                trust = 'ignore';
                this.omemo.updateFingerprints(this.jid, id, fingerprint, false);
                device.set('trusted', false);
                device.is_session_initiated = false;
                device.preKeys = null;
                this.account.trigger('trusting_updated');
            }
        }
        old_fingerprint && (old_fingerprint = old_fingerprint.match(/.{1,8}/g).join(" "));
        let $row = templates.fingerprint_item({id,label,trust,fingerprint, delete_button, edit_setting, old_fingerprint, error});
        return $row;
    },

    deleteDevice: function (ev) {
        let $target = $(ev.target).closest('div.row'),
            device_id = Number($target.find('div.device-id').text());
        utils.dialogs.ask(xabber.getString("omemo__dialog_delete_device__header"), xabber.getString("omemo__dialog_delete_device__text", [device_id]), null, { ok_button_text: xabber.getString("omemo__dialog_delete_device__button_delete")}).done((result) => {
            if (result) {
                $target.detach();
                let f_count = this.$('div.fingerprints-content').find('div.row').length;
                if (!f_count)
                    this.$('div.fingerprints-content').html($(`<div class="empty-table">${xabber.getString("omemo__dialog_fingerprints__text_no_fingerprints")}</div>`));
                this.jid == this.account.get('jid') && f_count++;
                this.$('.additional-info').text(xabber.getQuantityString("omemo__dialog_fingerprints__text_devices_count", f_count, [this.jid, f_count]));
                delete this.model.own_devices[device_id];
                let conn = this.account.getConnectionForIQ();
                if (conn && conn.omemo) {
                    delete conn.omemo.devices[device_id];
                    conn.omemo.publishDevice(null, null, () => {
                        $target.detach();
                    });
                    conn.omemo.removeItemFromNode(`${Strophe.NS.OMEMO}:bundles`, device_id);
                }
            }
        });
    },
});

xabber.FingerprintsOwnDevices = xabber.BasicView.extend({
    className: 'modal main-modal fingerprints-devices-wrap',
    template: templates.fingerprints_devices,

    events: {
        'click .btn-trust': "trustDevice",
        'click .btn-ignore': "ignoreDevice",
        'click .btn-cancel': "close"
    },

    _initialize: function () {
        this.account = this.model.account;
        this.omemo = this.model;
        this.jid = this.account.get('jid');
        this.is_own_devices = true;
    },

    open: function (device_id, is_own) {
        this.omemo = this.account.omemo;
        this.data.set('visible', true);
        this.updateColorScheme();
        this.show();
        this.renderOwnDevices(device_id, is_own);
    },

    updateTrustDevice: function (device_id, $container) {
        this.omemo.getMyDevices().then(() => {
            let device = this.model.own_devices[device_id];
            if (!device)
                return;
            if (device.get('ik')) {
                let f = device.generateFingerprint(),
                    fing = (this.omemo.get('fingerprints')[this.jid] || [])[device_id],
                    is_trusted = fing ? (fing.fingerprint != f ? 'error' : (fing.trusted ? 'trust' : 'ignore')) : 'unknown';
                this.renderTrustOnFingerprint(is_trusted, $container);
            }
            else {
                this.account.getConnectionForIQ().omemo.getBundleInfo({jid: device.jid, id: device.id}, async (iq) => {
                    let $iq = $(iq),
                        $bundle = $iq.find(`item[id="${device.id}"] bundle[xmlns="${Strophe.NS.OMEMO}"]`),
                        ik = $bundle.find(`ik`).text();
                    if (ik) {
                        device.set('ik', utils.fromBase64toArrayBuffer(ik));
                        let f = device.generateFingerprint(),
                            fing = (this.omemo.get('fingerprints')[this.jid] || [])[device.id],
                            is_trusted = fing ? (fing.fingerprint != f ? 'error' : (fing.trusted ? 'trust' : 'ignore')) : 'unknown';
                        this.renderTrustOnFingerprint(is_trusted, $container);
                    }
                }, () => {
                });
            }
        });
    },

    renderTrustOnFingerprint: function (is_trusted, $container) {
        $container.find('.device-encryption').attr('data-trust', is_trusted).addClass('active');
        is_trusted === 'unknown' && $container.find('.device-encryption span').text(xabber.getString("settings_account__unverified_device"));
        is_trusted === 'trust' && $container.find('.device-encryption span').text(xabber.getString("settings_account__trusted_device"));
        $container.find('.device-encryption .mdi-lock').removeClass('hidden');
    },

    renderOwnDevices: function (device_id, is_own) {
        this.omemo.getMyDevices().then(() => {
            this.device_id = device_id;
            this.fingerprint = null;
            if (is_own)
                this.updateOwnFingerprint(device_id);
            else{
                this.updateOwnFingerprint(device_id);
                this.updateFingerprints(device_id);
            }
        });
    },

    render: function () {
        this.$el.openModal({
            complete: () => {
                this.$el.detach();
                this.data.set('visible', false);
            }
        });
    },

    updateFingerprints: async function (device_id) {
        let counter = 0,
            dfd = new $.Deferred(),
            $container = this.$('div.fingerprints-content .other-device-content'),
            device = this.model.own_devices[device_id];
        $container.html('');
        dfd.done((is_error) => {
            console.log(is_error);
            this.$('.dropdown-button').dropdown({
                inDuration: 100,
                outDuration: 100,
                constrainWidth: false,
                hover: false,
                container: this.$('.fingerprints-content .other-device-content')[0],
                alignment: 'left'
            });
        });
        if (device.get('ik')) {
            let options = {},
                f = device.generateFingerprint(),
                fing = (this.omemo.get('fingerprints')[this.jid] || [])[device_id],
                is_trusted = fing ? (fing.fingerprint != f ? 'error' : (fing.trusted ? 'trust' : 'ignore')) : 'unknown';
            is_trusted === 'error' && (options.old_fingerprint = fing.fingerprint);
            this.fingerprint = f;
            $container.append(this.addRow(device.id, device.get('label'), is_trusted, f, options));
            dfd.resolve();
        }
        else {
            this.account.getConnectionForIQ().omemo.getBundleInfo({jid: device.jid, id: device.id}, async (iq) => {
                let $iq = $(iq),
                    $bundle = $iq.find(`item[id="${device.id}"] bundle[xmlns="${Strophe.NS.OMEMO}"]`),
                    ik = $bundle.find(`ik`).text();
                if (ik) {
                    device.set('ik', utils.fromBase64toArrayBuffer(ik));
                    let options = {},
                        f = device.generateFingerprint(),
                        fing = (this.omemo.get('fingerprints')[this.jid] || [])[device.id],
                        is_trusted = fing ? (fing.fingerprint != f ? 'error' : (fing.trusted ? 'trust' : 'ignore')) : 'unknown';
                    is_trusted === 'error' && (options.old_fingerprint = fing.fingerprint);
                    this.fingerprint = f;
                    $container.append(this.addRow(device.id, device.get('label'), is_trusted, f, options));
                }
                dfd.resolve();
            }, () => {
                dfd.resolve(true);
            });
        }
    },

    updateOwnFingerprint: async function () {
        this.$('.this-device-content').html("");
        let omemo = this.account.omemo;
        if (omemo) {
            let device = omemo.own_devices[omemo.get('device_id')];
            if (device) {
                if (device.get('fingerprint')) {
                    this.$('.this-device-content').html(this.addRow(device.id, device.get('label'), null, device.get('fingerprint')));
                } else if (device.get('ik')) {
                    device.set('fingerprint', device.generateFingerprint());
                    this.$('.this-device-content').html(this.addRow(device.id, device.get('label'), null, device.get('fingerprint')));
                } else {
                    device.getBundle().then(({pk, spk, ik}) => {
                        device.set('ik', utils.fromBase64toArrayBuffer(ik));
                        let fingerprint = device.generateFingerprint();
                        if (!device.get('fingerprint') || device.get('fingerprint') !== fingerprint)
                            device.set('fingerprint', fingerprint);
                        this.$('.this-device-content').html(this.addRow(device.id, device.get('label'), null, device.get('fingerprint')));
                    });
                }
            } else {
                omemo.store.getIdentityKeyPair().then((ik) => {
                    let pubKey = ik.pubKey;
                    if (pubKey.byteLength == 33)
                        pubKey = pubKey.slice(1);
                    let fingerprint = Array.from(new Uint8Array(pubKey)).map(b => b.toString(16).padStart(2, "0")).join("");
                    this.$('.this-device-content').html(this.addRow(omemo.get('device_id'), this.account.settings.get('device_label_text'), null, fingerprint));
                });
            }

        }
    },

    close: function () {
        let deferred = new $.Deferred();
        this.$el.closeModal({ complete: () => {
                this.$el.detach();
                this.data.set('visible', false);
                deferred.resolve();
            }});
        return deferred.promise();
    },

    trustDevice: function (ev) {
        let $target = $(ev.target).closest('div.fingerprints-content'),
            is_trusted = $target.children('.buttons[data-trust]').attr('data-trust');
        $target.children('.buttons[data-trust]').attr('data-trust', 'trust');
        this.omemo.updateFingerprints(this.jid, this.device_id, this.fingerprint, true);
        let device = this.account.omemo.own_devices[this.device_id];
        if (device && is_trusted != 'trusted') {
            if (is_trusted === 'error')
                $target.find('.old-fingerprint').detach();
            device.set('trusted', true);
            device.is_session_initiated = false;
            device.preKeys = null;
            this.account.trigger('trusting_updated');
        }
    },

    ignoreDevice: function (ev) {
        let $target = $(ev.target).closest('div.fingerprints-content'),
            is_trusted = $target.children('.buttons[data-trust]').attr('data-trust');
        $target.children('.buttons[data-trust]').attr('data-trust', 'ignore');
        this.omemo.updateFingerprints(this.jid, this.device_id, this.fingerprint, false);
        let device = this.account.omemo.own_devices[this.device_id];
        if (device && is_trusted != 'ignore') {
            if (is_trusted === 'error')
                $target.find('.old-fingerprint').detach();
            device.set('trusted', false);
            device.is_session_initiated = false;
            device.preKeys = null;
            this.account.trigger('trusting_updated');
        }
    },

    addRow: function (id, label, trust, fingerprint, options) {
        options = options || {};
        let edit_setting = id == this.omemo.get('device_id'),
            old_fingerprint = options.old_fingerprint,
            device_icons = [
                'device-cellphone',
                'device-console',
                'device-desktop',
                'device-tablet',
                'device-web',
            ],
            error, svg_icon;
        if (fingerprint.match(/.{1,4}/g))
            fingerprint = fingerprint.match(/.{1,4}/g).join(" ");
        else {
            fingerprint = '';
            error = xabber.getString("omemo__dialog_fingerprints__invalid_fingerprint");
            let device = this.account.omemo.own_devices[id];
            if (device && trust != 'ignore') {
                trust = 'ignore';
                this.omemo.updateFingerprints(this.jid, id, fingerprint, false);
                device.set('trusted', false);
                device.is_session_initiated = false;
                device.preKeys = null;
                this.account.trigger('trusting_updated');
            }
        }
        old_fingerprint && (old_fingerprint = old_fingerprint.match(/.{1,4}/g).join(" "));
        svg_icon = edit_setting ? 'device-web' : device_icons[Math.floor(Math.random()*device_icons.length)]
        let $row = templates.fingerprint_devices_item({id,label,trust, svg_icon, fingerprint, edit_setting, old_fingerprint, error});
        return $row;
    },

    deleteDevice: function (ev) {
        let $target = $(ev.target).closest('div.fingerprints-content');
        utils.dialogs.ask(xabber.getString("omemo__dialog_delete_device__header"), xabber.getString("omemo__dialog_delete_device__text", [this.device_id]), null, { ok_button_text: xabber.getString("omemo__dialog_delete_device__button_delete")}).done((result) => {
            if (result) {
                delete this.model.own_devices[this.device_id];
                let conn = this.account.getConnectionForIQ();
                if (conn && conn.omemo) {
                    delete conn.omemo.devices[this.device_id];
                    conn.omemo.publishDevice(null, null, () => {
                        this.account.trigger('trusting_updated');
                        this.close();
                    });
                    conn.omemo.removeItemFromNode(`${Strophe.NS.OMEMO}:bundles`, this.device_id);
                }
            }
        });
    },


    updateColorScheme: function () {
        this.$el.attr('data-color', this.account.settings.get('color'));
        this.account.settings.once("change:color", this.updateColorScheme, this);
    },
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
           this.model.publishBundle(this.model.get('device_attrs'));
           this.model.set('resend_bundle', false);
           this.model.set('device_attrs', null);
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
            this.model.account.trigger('update_omemo_devices');
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
        let prekeys = this.model.prekeys.getAll();
        if (Object.keys(prekeys).length >= constants.MIN_PREKEYS_COUNT) {
            for (let p in prekeys) {
                let pk = prekeys[p],
                    id = pk.id,
                    prekey = JSON.parse(pk.key),
                    priv_pk = utils.fromBase64toArrayBuffer(prekey.privKey),
                    pub_pk = utils.fromBase64toArrayBuffer(prekey.pubKey),
                    key_pair = {pubKey: pub_pk, privKey: priv_pk};
                this.preKeys.push({keyId: id, keyPair: key_pair});
                this.store.storePreKey(id, key_pair);
            }
            this.getUsedPreKeys();
            let spk = await this.getSignedPreKey();
            this.preKeys.push(spk);
            this.store.storeSignedPreKey(spk.keyId, spk.keyPair);
        }
        else {
            await this.generatePreKeys().then((prekeys) => {
                this.preKeys = prekeys;
                this.getUsedPreKeys();
            });
        }
    },

    getUsedPreKeys: function () {
        let prekeys = this.model.own_used_prekeys.getAll();
        if (Object.keys(prekeys).length) {
            for (let p in prekeys) {
                let pk = prekeys[p],
                    id = pk.id,
                    prekey = JSON.parse(pk.key),
                    privKey = utils.fromBase64toArrayBuffer(prekey.privKey),
                    pubKey = utils.fromBase64toArrayBuffer(prekey.pubKey);
                this.store.storePreKey(id, {pubKey, privKey});
            }
        }
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

xabber.Prekeys = Backbone.Model.extend({
    initialize: function (options) {
        this.name = options.name;
        this.model = options.model;
    },

    get: function (id) {
        let prekeys = _.clone(this.model.get(this.name));
        return prekeys[id];
    },

    put: function (prekey) {
        if (!prekey.id)
            return;
        let prekeys = _.clone(this.model.get(this.name));
        prekeys[prekey.id] = prekey;
        this.model.save(this.name, prekeys);
    },

    getAll: function () {
        let prekeys = _.clone(this.model.get(this.name));
        return prekeys;
    },

    remove: function (id) {
        if (!id)
            return;
        let prekeys = _.clone(this.model.get(this.name));
        delete prekeys[id];
        this.model.save(this.name, prekeys);
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
        let identityKey = this.get('ik');
        if (!identityKey)
            return;
        if (identityKey.byteLength == 33)
            identityKey = identityKey.slice(1);
        return Array.from(new Uint8Array(identityKey)).map(b => b.toString(16).padStart(2, "0")).join("");
    },

    closeSession: function (reason) {
        this.account.getConnectionForIQ().omemo.sendOptOut({
            to: this.jid,
            reason: reason
        }, () => {});
    },

    getBundle: async function () {
        if (!this._pending_bundle) {
            this._pending_bundle = true;
            this._dfd_bundle = new $.Deferred();
            return new Promise((resolve, reject) => {
                this.account.getConnectionForIQ().omemo.getBundleInfo({jid: this.jid, id: this.id}, (iq) => {
                    let $iq = $(iq),
                        $bundle = $iq.find(`item[id="${this.id}"] bundle[xmlns="${Strophe.NS.OMEMO}"]`),
                        $spk = $bundle.find('spk'),
                        spk = {id: $spk.attr('id'), key: $spk.text(), signature: $bundle.find('spks').text()},
                        ik = $bundle.find(`ik`).text();
                    this.preKeys = [];
                    if (!ik)
                        this.set('ik', null);
                    $bundle.find('prekeys pk').each((i, pk) => {
                        let $pk = $(pk);
                        this.preKeys.push({id: $pk.attr('id'), key: $pk.text()});
                    });
                    this._pending_bundle = false;
                    let pk = this.getRandomPreKey();
                    if (!pk) {
                        this._dfd_bundle.reject();
                        reject();
                    }
                    else {
                        this._dfd_bundle.resolve({pk, spk, ik});
                        resolve({pk, spk, ik});
                    }
                }, () => {
                    this.set('ik', null);
                    this.preKeys = [];
                    this._dfd_bundle.reject();
                    this._pending_bundle = false;
                    reject();
                });
            });
        } else {
            return new Promise((resolve, reject) => {
                this._dfd_bundle.done(({pk, spk, ik}) => {
                    resolve({pk, spk, ik});
                });
                this._dfd_bundle.fail(() => {
                    reject();
                });
            });
        }
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

            if (preKey)
                plainText = await sessionCipher.decryptPreKeyWhisperMessage(cipherText, 'binary');
            else {
                if (!this.store.hasSession(this.address.toString())) {
                    let session = this.getCachedSession();
                    if (session)
                        await this.store.storeSession(this.address.toString(), session);
                }
                plainText = await sessionCipher.decryptWhisperMessage(cipherText, 'binary');
            }

            return plainText;
        }
        catch (e) {
            throw e;
        }
    },

    getPreKey: function () {
        let pk = this.account.omemo.used_prekeys.get(String(this.id));
        return pk;
    },

    getCachedSession: function () {
        return this.account.omemo.getSession('session' + this.address.toString());
    },

    encrypt: async function (plainText) {
        try {
            if (this.get('trusted') === false && (this.id != this.account.omemo.get('device_id')))
                return null;
            if (!this.store.hasSession(this.address.toString()) || !this.is_session_initiated) { // this.preKeys ??
                if (this.preKeys && !this.preKeys.length)
                    return null;
                this.is_session_initiated = true;
                let s = await this.initSession();
                if (!s)
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
            cached_pk = this.getPreKey(),
            id = this.id;
        if (cached_pk) {
            if (!spk || spk && JSON.stringify(spk) == JSON.stringify(cached_pk.spk) && JSON.stringify(ik) == JSON.stringify(cached_pk.ik))
                pk = cached_pk.pk;
            else
                this.account.omemo.used_prekeys.put({id, pk, spk, ik});
        }
        else
            this.account.omemo.used_prekeys.put({id, pk, spk, ik});
        this.set({'pk': utils.fromBase64toArrayBuffer(pk.key), 'ik': utils.fromBase64toArrayBuffer(ik)});
        this.fingerprint = this.generateFingerprint();
        let trusted = this.account.omemo.isTrusted(this.jid, id, this.fingerprint);
        this.set('trusted', trusted);
        if ((this.id != this.account.omemo.get('device_id')) && trusted === false)
            return false;
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
        prekeys: {},
        retract_version: 0,
        used_prekeys: {},
        own_used_prekeys: {},
        device_id: ""
    },

    _initialize: function (attrs, options) {
        this.on("change:device_id", this.onDeviceIdUpdated, this);
        this.on("destroy", this.onOmemoDestroyed, this);
        this.own_devices = {};
        this.account = options.account;
        this.peers = new xabber.Peers();
        if (!this.get('device_id'))
            this.set('device_id', this.generateDeviceId());
        this.store = new xabber.SignalProtocolStore();
        this.account.on("devices_updated", this.onOwnDevicesUpdated, this);
        this.store.on('prekey_removed', this.removePreKey, this);
        this.store.on('session_stored', this.cacheSession, this);
    },

    storeSessions: function () {
        let sessions = this.get('sessions');
        for (let session_id in sessions) {
            let session = sessions[session_id];
            session && this.store.put(session_id, session);
        }
    },

    onOmemoDestroyed: function () {
        if (this.own_devices && Object.keys(this.own_devices).length != 0)
            this.deleteOwnDevice();
        this.cached_messages && this.cached_messages.destroy();
        this.account.connection.deleteHandler(this._msg_handler);
    },

    deleteOwnDevice: function () {
        let device_id = this.get('device_id');
        delete this.own_devices[device_id];
        let conn = this.account.getConnectionForIQ();
        if (conn && conn.omemo) {
            delete conn.omemo.devices[device_id];
            conn.omemo.publishDevice(null, null, () => {});
            conn.omemo.removeItemFromNode(`${Strophe.NS.OMEMO}:bundles`, device_id);
        }
    },

    onConnected: function () {
        this.prekeys = new xabber.Prekeys({name: 'prekeys', model: this});
        this.used_prekeys = new xabber.Prekeys({name: 'used_prekeys', model: this});
        this.own_used_prekeys = new xabber.Prekeys({name: 'own_used_prekeys', model: this});
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

    getMyDevices: async function () {
        if (!this._pending_own_devices) {
            this._pending_own_devices = true;
            this._dfd_own_devices = new $.Deferred();
            return new Promise((resolve, reject) => {
                let conn = this.account.getConnectionForIQ();
                if (conn) {
                    if (conn.omemo) {
                        conn.omemo.getDevicesNode(null, (cb) => {
                            conn.omemo.devices = conn.omemo.parseUserDevices($(cb));
                            this._pending_own_devices = false;
                            this._dfd_own_devices.resolve();
                            resolve();
                        }, function () {
                            this._pending_own_devices = false;
                            this._dfd_own_devices.resolve();
                            resolve();
                        });
                    } else
                        this._pending_own_devices = false;
                } else
                    this._pending_own_devices = false;
            });
        } else {
            return new Promise((resolve, reject) => {
                this._dfd_own_devices.done(() => {
                    resolve();
                });
            });
        }
    },

    updateFingerprints: function (contact, device_id, fingerprint, trusted) {
        let fingerprints = _.clone(this.get('fingerprints'));
        if (!fingerprints[contact])
            fingerprints[contact] = {};
        let contact_fingerprints = fingerprints[contact];
        if (_.isArray(contact_fingerprints))
            contact_fingerprints = {};
        contact_fingerprints[device_id] = {fingerprint, trusted};
        fingerprints[contact] = contact_fingerprints;
        this.save('fingerprints', fingerprints);
    },

    isTrusted: function (jid, device_id, fingerprint) {
        let fingerprints = _.clone(this.get('fingerprints'));
        if (!fingerprints[jid])
            return;
        if (!fingerprints[jid][device_id])
            return;
        let fing = fingerprints[jid][device_id];
        if (fing) {
            if (fing.fingerprint == fingerprint) {
                if (fing.trusted === undefined)
                    return;
                else
                    return fing.trusted;
            }
            else
                return null;
        }
    },

    cacheRetractVersion: function (version) {
        console.log('version ' + version)
        this.save('retract_version', version);
    },

    getRetractVersion: function () {
        return this.get('retract_version');
    },

    addDevice: function () {
        let device_id = this.get('device_id');
        if (this.connection) {
            let omemo = this.account.getConnectionForIQ().omemo;
            if (Object.keys(omemo.devices).length) {
                let device = omemo.devices[device_id];
                if (!device) {
                    let label = this.account.settings.get('device_label_text') || `PC, ${utils.getOS()}, ${env.utils.getBrowser()}`;
                    this.publishBundle({device_id: device_id, label: label, omemo: omemo});
                }
                else {
                    this.publishBundle();
                }
            }
            else
                omemo.getDevicesNode(null, (cb) => {
                    this.account.getConnectionForIQ().omemo.devices = omemo.parseUserDevices($(cb));
                    for (let dev_id in this.account.getConnectionForIQ().omemo.devices) {
                        if (!this.own_devices[dev_id])
                            this.own_devices[dev_id] = new xabber.Device({jid: this.account.get('jid'), id: dev_id}, { account: this.account, store: this.store});
                    }
                    let device = omemo.devices[device_id];
                    if (!device) {
                        let label = this.account.settings.get('device_label_text') || `PC, ${utils.getOS()}, ${env.utils.getBrowser()}`;
                        this.publishBundle({device_id: device_id, label: label, omemo: omemo});
                    }
                    else {
                        this.publishBundle();
                    }
                });
        }
    },

    onDeviceIdUpdated: function () {
        this.save('device_id', this.get('device_id'));
    },

    generateDeviceId: function () {
        if (this.account.get('x_token') && this.account.get('x_token').token_uid && this.account.get('x_token').token_uid.length >= 8 && Number(this.account.get('x_token').token_uid.slice(0,8)))
            return Number(this.account.get('x_token').token_uid.slice(0,8));
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
        this._msg_handler = this.account.connection.addHandler((message) => {
            this.receiveMessage(message);
            return true;
        }, null, 'message', null, null, null, {'encrypted': true});
    },

    encrypt: function (contact, message) {
        let peer = this.getPeer(contact.get('jid')),
            $msg = $(message.tree()),
            origin_id = $msg.children('origin-id').attr('id'),
            plaintext = Strophe.serialize($msg.children('envelope')[0]) || "";

        origin_id && this.cached_messages.putMessage(contact, origin_id, plaintext);

        return peer.encrypt(plaintext).then((encryptedMessage) => {

            let encryptedElement = $build('encrypted', {xmlns: Strophe.NS.OMEMO})
                .c('header', {
                    sid: this.get('device_id'),
                    label: this.account.settings.get('device_label_text')
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

            encryptedElement.up().up()
                .c('payload').t(utils.ArrayBuffertoBase64(encryptedMessage.payload));

            $(message.tree()).find('envelope').remove();

            message.cnode(encryptedElement.tree());
            message.up().c('encryption', {
                xmlns: Strophe.NS.EXPLICIT_MESSAGE_ENCRYPTION,
                namespace: Strophe.NS.OMEMO
            });
            message.up().c('store', {
                xmlns: 'urn:xmpp:hints'
            }).up()
                .c('body').t('This message is encrypted using OMEMO end-to-end encryption.').up();

            return {message: message, is_trusted: encryptedMessage.is_trusted};
        }).catch((msg) => {
        });
    },

    hasChanges: function (o1, o2) {
        let obj1 = _.clone(o1), obj2 = _.clone(o2);
        for (let d in obj1) {
            delete obj2[d];
        }
        for (let d in obj2) {
            delete obj1[d];
        }
        return Object.keys(obj1).length || Object.keys(obj2).length;
    },

    receiveHeadlineMessage: function (message) {
        if (!this.account.omemo || (this.account.omemo && this.cid != this.account.omemo.cid))
            return;
        let $message = $(message),
            from_jid = Strophe.getBareJidFromJid($message.attr('from')),
            node = $message.find('items').attr('node');
        if ($message.find('event[xmlns="' + Strophe.NS.PUBSUB + '#event"]').length) {
            if (node == `${Strophe.NS.OMEMO}:devices`) {
                let devices = this.account.getConnectionForIQ().omemo.parseUserDevices($message);
                if (from_jid === this.account.get('jid')) {
                    let has_devices = this.own_devices && Object.keys(this.own_devices).length,
                        has_changes = this.hasChanges(this.own_devices, devices);
                    this.account.getConnectionForIQ().omemo.devices = devices;
                    let device_id = this.get('device_id'),
                        device = this.account.getConnectionForIQ().omemo.devices[device_id];
                    if (has_changes) {
                        this.account.trigger("devices_updated");
                    }
                    if (has_devices && has_changes) {
                        this.account.trigger('trusting_updated');
                    }
                }
                else {
                    let peer = this.getPeer(from_jid),
                        has_devices = peer.devices && Object.keys(peer.devices).length,
                        has_changes = this.hasChanges(peer.devices, devices);
                    peer.updateDevices(devices);
                    if (has_devices && has_changes) {
                        this.account.trigger('trusting_updated');
                    }
                }
                return;
            }
            if (node == `${Strophe.NS.OMEMO}:bundles`) {
                let $item = $message.find('items item').first(),
                    device_id = $item.attr('id'),
                    $bundle = $item.children(`bundle[xmlns="${Strophe.NS.OMEMO}"]`), device;
                if (from_jid === this.account.get('jid')) {
                    let devices = this.account.getConnectionForIQ().omemo.devices
                    if (devices && devices[device_id]) {
                        if (!this.own_devices[device_id])
                            this.own_devices[device_id] = new xabber.Device({jid: this.account.get('jid'), id: device_id}, { account: this.account, store: this.store});
                        device = this.own_devices[device_id];
                    }
                } else {
                    let peer = this.peers.get(from_jid);
                    if (peer) {
                        device = peer.devices[device_id];
                    }
                }
                if (device) {
                    let ik = $bundle.find(`ik`).text(),
                        device_ik = device.get(`ik`), preKeys = [];
                    if (!ik) {
                        device.set('ik', null);
                        return;
                    }
                    $bundle.find('prekeys pk').each((i, pk) => {
                        let $pk = $(pk);
                        preKeys.push({id: $pk.attr('id'), key: $pk.text()});
                    });
                    device.preKeys = preKeys;
                    device.set('ik', utils.fromBase64toArrayBuffer(ik));
                    device.set('fingerprint', device.generateFingerprint());
                    device_ik && (device_ik = utils.ArrayBuffertoBase64(device_ik));
                    if (!_.isUndefined(device_ik) && device_ik != ik)
                        this.account.trigger('trusting_updated');
                }
            }
        }
    },

    receiveChatMessage: function (message, options, deferred) {
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
                jid = (Strophe.getBareJidFromJid($msg.attr('from')) === this.account.get('jid') ? Strophe.getBareJidFromJid($msg.attr('to')) : Strophe.getBareJidFromJid($msg.attr('from'))) || options.from_jid,
                contact = this.account.contacts.get(options.conversation ? options.conversation : jid),
                stanza_id = $msg.children(`stanza-id[by="${this.account.get('jid')}"]`).attr('id'),
                cached_msg = stanza_id && this.cached_messages.getMessage(contact, stanza_id);

            if (Strophe.getBareJidFromJid($msg.attr('from')) != this.account.get('jid') && options.carbon_copied && options.carbon_direction && options.carbon_direction === 'sent')
                return;

            if (cached_msg) {
                if (!options.replaced) {
                    options.encrypted = true;
                    this.getTrusted($message).then((is_trusted) => {
                        options.is_trusted = is_trusted;
                        $message.find('body').remove();
                        $message.find(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`).replaceWith(cached_msg);
                        if (options.gallery && deferred)
                            deferred.resolve($message);
                        this.account.chats.receiveChatMessage($message[0], options);
                    });
                    return;
                }
                else if (options.replaced && $message.find(`encrypted[xmlns="${Strophe.NS.OMEMO}"] header`).attr('sid') == this.get('device_id')) {
                    options.encrypted = true;
                    $message.find('body').remove();
                    $message.find(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`).replaceWith(cached_msg);
                    let chat = this.account.chats.getChat(contact, 'encrypted');
                    chat && chat.messages.createFromStanza($message, options);
                    let msg_item = chat.messages.find(msg => msg.get('stanza_id') == stanza_id || msg.get('contact_stanza_id') == stanza_id);
                    if (msg_item) {
                        msg_item.set('last_replace_time', $message.find('replaced').attr('stamp'));
                        chat && chat.item_view.updateLastMessage(chat.last_message);
                    }
                    return;
                }
            }

            if (options.replaced) {
                this.decrypt(message.children('replace').children('message'), options).then((decrypted_msg) => {
                    if (decrypted_msg) {
                        options.encrypted = true;
                        stanza_id && this.cached_messages.putMessage(contact, stanza_id, decrypted_msg);
                        $message.find('body').remove();
                        $message.find(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`).replaceWith(decrypted_msg);
                        let chat = this.account.chats.getChat(contact, 'encrypted');
                        chat && chat.messages.createFromStanza($message, options);
                        let msg_item = chat.messages.find(msg => msg.get('stanza_id') == stanza_id || msg.get('contact_stanza_id') == stanza_id);
                        if (msg_item) {
                            msg_item.set('last_replace_time', $message.find('replaced').attr('stamp'));
                            chat && chat.item_view.updateLastMessage(chat.last_message);
                        }
                    }
                });
            } else {
                this.getTrusted($message).then((is_trusted) => {
                    options.is_trusted = is_trusted;
                    return this.decrypt(message);
                }).then((decrypted_msg) => {
                    if (decrypted_msg) {
                        options.encrypted = true;
                        stanza_id && this.cached_messages.putMessage(contact, stanza_id, decrypted_msg);
                        $message.find('body').remove();
                    }
                    else {
                        if (decrypted_msg === null) {
                            this.account.chats.getChat(contact, 'encrypted').item_view.updateLastMessage();
                            return;
                        }
                        options.not_encrypted = true;
                        delete options.is_trusted;
                    }
                    $message.find(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`).replaceWith(decrypted_msg);
                    if (options.gallery && decrypted_msg && deferred)
                        deferred.resolve($message);
                    else if (options.gallery && deferred)
                        deferred.reject();
                    this.account.chats.receiveChatMessage($message[0], options);
                }).catch((e) => {
                    if (e.name === 'MessageCounterError')//for capturing double decryption of same message
                        return;
                    if (options.synced_msg && !options.decryption_retry) {
                        this.receiveChatMessage($message[0], _.extend(options, {decryption_retry: true}));
                        return;
                    }
                    options.not_encrypted = true;
                    delete options.is_trusted;
                    $message.find(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`).remove();
                    if (options.gallery && deferred)
                        deferred.reject();
                    this.account.chats.receiveChatMessage($message[0], options);
                });
            }
            if (options.gallery && deferred)
                deferred.reject();
        }
        if (options.gallery && deferred)
            deferred.reject();
    },

    checkOwnFingerprints: async function () {
        return new Promise((resolve, reject) => {
            let is_trusted = true,
                dfd = new $.Deferred(), counter = 0;
            dfd.done((t) => {
                let trust = t === null ? 'error' : (t === undefined ? 'none' : t);
                resolve(trust);
            });
            if (Object.keys(this.own_devices).length) {
                counter = Object.keys(this.own_devices).length;
                for (let device_id in this.own_devices) {
                    let device = this.own_devices[device_id];
                    if (device_id == this.get('device_id')) {
                        counter--;
                        !counter && dfd.resolve(is_trusted);
                        continue;
                    }
                    if (device.get('fingerprint')) {
                        let trusted = this.isTrusted(this.account.get('jid'), device.id, device.get('fingerprint'));
                        if (trusted === undefined && is_trusted !== null)
                            is_trusted = undefined;
                        if (trusted === null)
                            is_trusted = null;
                        counter--;
                        !counter && dfd.resolve(is_trusted);
                    } else if (device.get('ik')) {
                        device.set('fingerprint', device.generateFingerprint());
                        let trusted = this.isTrusted(this.account.get('jid'), device.id, device.get('fingerprint'));
                        if (trusted === undefined && is_trusted !== null)
                            is_trusted = undefined;
                        if (trusted === null)
                            is_trusted = null;
                        counter--;
                        !counter && dfd.resolve(is_trusted);
                    } else {
                        if (device.get('ik') === null) {
                            counter--;
                            !counter && dfd.resolve(is_trusted);
                            continue;
                        }
                        device.getBundle().then(({pk, spk, ik}) => {
                            device.set('ik', utils.fromBase64toArrayBuffer(ik));
                            device.set('fingerprint', device.generateFingerprint());
                            let trusted = this.isTrusted(this.account.get('jid'), device.id, device.get('fingerprint'));
                            if (trusted === undefined && is_trusted !== null)
                                is_trusted = undefined;
                            if (trusted === null)
                                is_trusted = null;
                            counter--;
                            !counter && dfd.resolve(is_trusted);
                        }).catch(() => {
                            counter--;
                            !counter && dfd.resolve(is_trusted);
                        });
                    }
                }
            }
            else {
                this.getMyDevices().then(() => {
                    this.onOwnDevicesUpdated().then(() => {
                        counter = Object.keys(this.own_devices).length;
                        for (let device_id in this.own_devices) {
                            if (device_id == this.get('device_id')) {
                                counter--;
                                !counter && dfd.resolve(is_trusted);
                                continue;
                            }
                            let device = this.own_devices[device_id];
                            if (device.get('fingerprint')) {
                                let trusted = this.isTrusted(this.account.get('jid'), device.id, device.get('fingerprint'));
                                if (trusted === undefined && is_trusted !== null)
                                    is_trusted = undefined;
                                if (trusted === null)
                                    is_trusted = null;
                                counter--;
                                !counter && dfd.resolve(is_trusted);
                            } else {
                                counter--;
                                !counter && dfd.resolve(is_trusted);
                            }
                        }
                    });
                });
            }
        });
    },

    checkContactFingerprints: function (contact) {
        return new Promise((resolve, reject) => {
            let is_trusted = true,
                peer = this.getPeer(contact.get('jid')),
                dfd = new $.Deferred(), counter = 0;
            dfd.done((t) => {
                let trust = t === null ? 'error' : (t === undefined ? 'none' : t);
                contact.trigger('update_trusted', trust);
                resolve(trust);
            });
            if (Object.keys(peer.devices).length) {
                counter = Object.keys(peer.devices).length;
                for (let device_id in peer.devices) {
                    let device = peer.devices[device_id];
                    if (device.get('fingerprint')) {
                        let trusted = this.isTrusted(contact.get('jid'), device.id, device.get('fingerprint'));
                        if (trusted === undefined && is_trusted !== null)
                            is_trusted = undefined;
                        if (trusted === null)
                            is_trusted = null;
                        counter--;
                        !counter && dfd.resolve(is_trusted);
                    } else if (device.get('ik')) {
                        device.set('fingerprint', device.generateFingerprint());
                        let trusted = this.isTrusted(contact.get('jid'), device.id, device.get('fingerprint'));
                        if (trusted === undefined && is_trusted !== null)
                            is_trusted = undefined;
                        if (trusted === null)
                            is_trusted = null;
                        counter--;
                        !counter && dfd.resolve(is_trusted);
                    } else {
                        if (device.get('ik') === null) {
                            counter--;
                            if (!counter) {
                                if (Object.keys(peer.devices).length === 1)
                                    is_trusted = 'nil';
                                dfd.resolve(is_trusted);
                            }
                            continue;
                        }
                        device.getBundle().then(({pk, spk, ik}) => {
                            device.set('ik', utils.fromBase64toArrayBuffer(ik));
                            device.set('fingerprint', device.generateFingerprint());
                            let trusted = this.isTrusted(contact.get('jid'), device.id, device.get('fingerprint'));
                            if (trusted === undefined && is_trusted !== null)
                                is_trusted = undefined;
                            if (trusted === null)
                                is_trusted = null;
                            counter--;
                            !counter && dfd.resolve(is_trusted);
                        }).catch(() => {
                            counter--;
                            if (!counter) {
                                if (Object.keys(peer.devices).length === 1)
                                    is_trusted = 'nil';
                                dfd.resolve(is_trusted);
                            }
                        });
                    }
                }
            } else {
                peer.getDevicesNode().then(() => {
                    counter = Object.keys(peer.devices).length;
                    !counter && dfd.resolve('nil');
                    for (let device_id in peer.devices) {
                        let device = peer.devices[device_id];
                        device.getBundle().then(({pk, spk, ik}) => {
                            device.set('ik', utils.fromBase64toArrayBuffer(ik));
                            device.set('fingerprint', device.generateFingerprint());
                            let trusted = this.isTrusted(contact.get('jid'), device.id, device.get('fingerprint'));
                            if (trusted === undefined && is_trusted !== null)
                                is_trusted = undefined;
                            if (trusted === null) {
                                if (Object.keys(peer.devices).length === 1)
                                    is_trusted = 'nil';
                                else
                                    is_trusted = null;
                            }
                            counter--;
                            !counter && dfd.resolve(is_trusted);
                        }).catch(() => {
                            counter--;
                            if (!counter) {
                                if (Object.keys(peer.devices).length === 1)
                                    is_trusted = 'nil';
                                dfd.resolve(is_trusted);
                            }
                        });
                    }
                });

            }
        });
    },

    getTrusted: async function ($message) {
        let $msg = $message.find(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`).parent(),
            from_jid = Strophe.getBareJidFromJid($msg.attr('from')),
            to_jid = Strophe.getBareJidFromJid($msg.attr('to')),
            contact = this.account.contacts.mergeContact(from_jid === this.account.get('jid') ? to_jid : from_jid);

        let own_trusted = await this.checkOwnFingerprints(),
            contact_trusted = await this.checkContactFingerprints(contact);
        if (own_trusted === 'error' || (own_trusted === 'none' && contact_trusted !== 'error')) {
            return own_trusted;
        } else if (contact_trusted === 'error' || contact_trusted === 'none') {
            return contact_trusted;
        } else {
            let device_id = $message.find('encrypted header').attr('sid'),
                peer = this.getPeer(contact.get('jid')),
                device = peer.devices[device_id];
            if (device) {
                if (device.get('fingerprint')) {
                    let trusted = this.isTrusted(contact.get('jid'), device.id, device.get('fingerprint'));
                    if (trusted === false) {
                        return 'untrusted';
                    }
                }
            }
            return true;
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
            payload = utils.fromBase64toArrayBuffer($payload.text()),
            sid = Number($header.attr('sid'));

        let keys = $header.find(`key`).get().map(function(keyElement) {
            return {
                preKey: $(keyElement).attr('kex') === 'true' || $(keyElement).attr('kex') === '1',
                ciphertext: utils.fromBase64toArrayBuffer($(keyElement).text()),
                deviceId: parseInt($(keyElement).attr('rid'))
            };
        });

        return {sid, keys, payload};
    },

    getPeer: function (jid) {
        if (!this.peers.get(jid))
            this.peers.create({jid}, {account:this.account});
        return this.peers.get(jid);
    },

    decrypt: async function (message, options) {
        let $message = $(message),
            from_jid = Strophe.getBareJidFromJid($message.attr('from')) || options.from_jid,
            $encrypted;

        if ($message.find('result[xmlns="'+Strophe.NS.MAM+'"]').length) {
            let $m = $message.find('message').first();
            from_jid = Strophe.getBareJidFromJid($m.attr('from'));
            $encrypted = $message.children(`result`).children(`forwarded`).children(`message`).children(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`);
        }
        else if ($message.find('[xmlns="'+Strophe.NS.CARBONS+'"]').length){
            $encrypted = $message.children(`[xmlns="${Strophe.NS.CARBONS}"]`).children(`forwarded`).children(`message`).children(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`);
        }
        else
            $encrypted = $message.children(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`);

        let encryptedData = this.parseEncrypted($encrypted),
            deviceId = this.get('device_id'),
            ownPreKeysArr =  encryptedData.keys.filter(preKey => preKey.deviceId == deviceId),
            ownPreKey = ownPreKeysArr[0];
        if (!ownPreKey)
            return null;
        let peer = this.getPeer(from_jid),
            exportedKey;
        try {
            exportedKey = await peer.decrypt(encryptedData.sid, ownPreKey.ciphertext, ownPreKey.preKey);
        }
        catch (e) {
            throw e;
        }
        if (!exportedKey)
            return;
        let exportedMasterKey = exportedKey.slice(0, 32),
            HMACData = exportedKey.slice(32);

        return utils.AES.decrypt(exportedMasterKey, HMACData, encryptedData.payload);
    },

    toBase64: function (arrayBuffer) {
        return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    },

    publish: function (spk, ik, pks, callback) {
        if (!this.account.connection)
            return;
        let conn_omemo = this.account.getConnectionForIQ().omemo,
            prekeys = [];
        pks.forEach((pk) => {
            let id = pk.keyId,
                pubKey = utils.ArrayBuffertoBase64(pk.keyPair.pubKey),
                privKey = utils.ArrayBuffertoBase64(pk.keyPair.privKey),
                key = JSON.stringify({pubKey, privKey});
            if (!pk.signature) {
                prekeys.push({id: id, key: pubKey});
                this.prekeys.put({id, key});
            }
        });
        conn_omemo.configNode(() => {
            conn_omemo.publishBundle({
                spk: {id: spk.keyId, key: utils.ArrayBuffertoBase64(spk.keyPair.pubKey)},
                spks: utils.ArrayBuffertoBase64(spk.signature),
                ik:  utils.ArrayBuffertoBase64(ik),
                pks: prekeys,
                device_id: this.get('device_id')
            }, callback);
        });
    },

    removePreKey: async function (id) {
        if (!this.account)
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
        this.own_used_prekeys.put({id, key});
        this.prekeys.remove(id);
        if (bundle.preKeys.length && bundle.preKeys.length < constants.MIN_PREKEYS_COUNT) {
            let missing_keys = constants.PREKEYS_COUNT - bundle.preKeys.length,
                last_id = _.sortBy(xabber.accounts.connected[0].omemo.bundle.preKeys, 'keyId').last().keyId;
            for (let i = ++last_id; last_id + missing_keys; i++)
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

    removeSession: function (id) {
        let sessions = _.clone(this.get('sessions'));
        _.isArray(sessions) && (sessions = {});
        delete sessions[id];
        this.save('sessions', sessions);
    },

    getSession: function (id) {
        let sessions = _.clone(this.get('sessions'));
        return sessions[id];
    },

    publishBundle: async function (device_attrs) {
        if (!this.bundle)
            return;
        let spk = this.bundle.preKeys.find(pk => pk.signature),
            ik = await this.store.getIdentityKeyPair(),
            pks = this.bundle.preKeys;
        if (!spk || !ik) {
            this.set('resend_bundle', true);
            this.set('device_attrs', device_attrs);
            return;
        }
        let dfd = new $.Deferred();
        dfd.done(() => {
            if (device_attrs){
                device_attrs.omemo.publishDevice(device_attrs.device_id, device_attrs.label);
            }
        });
        this.account.getConnectionForIQ().omemo.getBundleInfo({jid: this.account.get('jid'), id: this.get('device_id')}, (res) => {
            if ($(res).find(`items[node="${Strophe.NS.OMEMO}:bundles"]`).children().length){
                pks.forEach((pk) => {
                    let id = pk.keyId,
                        pubKey = utils.ArrayBuffertoBase64(pk.keyPair.pubKey),
                        privKey = utils.ArrayBuffertoBase64(pk.keyPair.privKey),
                        key = JSON.stringify({pubKey, privKey});
                    if (!pk.signature) {
                        this.prekeys.put({id, key});
                    }
                });
                dfd.resolve();
            } else {
                this.publish(spk, ik.pubKey, pks, () => {
                    dfd.resolve();
                });
            }
        }, (err) => {
            if (($(err).find('error').attr('code') == 404)){
                this.account.getConnectionForIQ().omemo.createBundleNode(() => {
                    this.publish(spk, ik.pubKey, pks, () => {
                        dfd.resolve();
                    });
                });
            }
        });
    },

    onOwnDevicesUpdated: async function () {
        return new Promise((resolve, reject) => {
            let conn = this.account.getConnectionForIQ();
            if (conn && conn.omemo && conn.omemo.devices) {
                for (let d in this.own_devices) {
                    if (!conn.omemo.devices[d]) {
                        this.account.omemo.removeSession('session' + this.own_devices[d].address.toString());
                        delete this.own_devices[d];
                    }
                }
                let counter = Object.keys(conn.omemo.devices).length;
                for (let device_id in conn.omemo.devices) {
                    if (!this.own_devices[device_id])
                        this.own_devices[device_id] = new xabber.Device({
                            jid: this.account.get('jid'),
                            id: device_id
                        }, {account: this.account, store: this.store});
                    let device = this.own_devices[device_id],
                        label = conn.omemo.devices[device_id].label;
                    if (!device.get('ik')) {
                        if (device.get('ik') === null) {
                            counter--;
                            !counter && resolve();
                            continue;
                        }
                        device.getBundle().then(({pk, spk, ik}) => {
                            device.set('ik', utils.fromBase64toArrayBuffer(ik));
                            let fingerprint = device.generateFingerprint();
                            if (!device.get('fingerprint') || device.get('fingerprint') !== fingerprint)
                                device.set('fingerprint', fingerprint);
                            counter--;
                            !counter && resolve();
                        }).catch(() => {
                            counter--;
                            !counter && resolve();
                        });
                    } else if (!device.get('fingerprint')) {
                        device.set('fingerprint', device.generateFingerprint());
                        counter--;
                        !counter && resolve();
                    } else {
                        counter--;
                        !counter && resolve();
                    }
                    label && device.set('label', label);
                }
            }
        });
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
        let trusted = this.get('identityKey' + identifier);
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

        let address = new SignalProtocolAddress.fromString(identifier);

        let existing = this.get('identityKey' + address.getName());
        this.put('identityKey' + address.getName(), identityKey);

        if (existing && libsignal.toString(identityKey) !== libsignal.toString(existing)) {
            return Promise.resolve(true);
        } else {
            return Promise.resolve(false);
        }

    },

    /* Returns a prekeypair object or undefined */
    loadPreKey: function (keyId) {
        let res = this.get('25519KeypreKey' + keyId);
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
        let res = this.get('25519KeysignedKey' + keyId);
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
        for (let id in this.store) {
            if (id.startsWith('session' + identifier)) {
                sessions.push({id: id, session: this.store[id]});
            }
        }
        return Promise.resolve(sessions);
    },

    removeAllSessions: function (identifier) {
        for (let id in this.store) {
            if (id.startsWith('session' + identifier)) {
                delete this.store[id];
            }
        }
        return Promise.resolve();
    }
});

xabber.OMEMOEnablePlaceholder = xabber.BasicView.extend({
    className: 'omemo-enable-placeholder',

    events: {
        'click .btn-enable': 'enableOmemo',
        'click .btn-escape': 'closeOmemoPlaceholder'
    },

    _initialize: function (options) {
        this.account = options.account;
        this.updateColorScheme();
        this.$el.html(templates.omemo_enable({jid: this.account.get('jid')}));
        xabber.placeholders_wrap.$el.append(this.$el);
        xabber.main_panel.$el.css('padding-bottom', xabber.placeholders_wrap.$el.height());
        xabber.on("update_screen", this.onUpdatedScreen, this);
        this.account.session.on("change:connected", this.updateConnected, this);
        this.account.settings.on("change:color", this.updateColorScheme, this);
        this.account.settings.on("change:omemo", this.onOmemoChange, this);
    },

    updateColorScheme: function () {
        let color = this.account.settings.get('color');
        this.$el.attr('data-color', color);
    },

    onUpdatedScreen: function () {
        if (!this.account.omemo_enable_placeholder || this.account.omemo_enable_placeholder.cid !== this.cid)
            return;
        this.$el.detach();
        xabber.placeholders_wrap.$el.append(this.$el);
        xabber.main_panel.$el.css('padding-bottom', xabber.placeholders_wrap.$el.height());
    },

    updateConnected: function () {
        if (!this.account.isConnected())
            this.close();
    },

    enableOmemo: function () {
        this.account.settings.save('omemo', true);
        this.close();
        this.account.omemo = new xabber.Omemo({id: 'omemo'}, {
            account: this.account,
            storage_name: xabber.getStorageName() + '-omemo-settings-' + this.account.get('jid'),
            fetch: 'before'
        });
        setTimeout(() => {
            this.account.omemo.onConnected();
        }, 2000);
    },

    closeOmemoPlaceholder: function () {
        this.account.settings.save('omemo', false);
        this.close();
    },

    onOmemoChange: function () {
        if (this.account.settings.get('omemo'))
            this.close();
    },

    close: function () {
        this.trigger('remove') && this.remove();
        this.account.omemo_enable_placeholder = undefined;
        xabber.main_panel.$el.css('padding-bottom', xabber.placeholders_wrap.$el.height());
    }
});

xabber.Account.addInitPlugin(function () {
    if (!this.settings.get('omemo'))
        return;
    this.omemo = new xabber.Omemo({id: 'omemo'}, {
        account: this,
        storage_name: xabber.getStorageName() + '-omemo-settings-' + this.get('jid'),
        fetch: 'before'
    });
});

xabber.Account.addConnPlugin(function () {
    if (!this.settings.get('omemo'))
        return;
    this.omemo.onConnected();
}, true, true);

export default xabber;
