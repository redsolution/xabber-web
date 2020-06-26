(function (root, factory) {
    define(["strophe","strophe.disco", "strophe.pubsub"], function (Strophe) {
        factory(Strophe.Strophe, Strophe.$build, Strophe.$iq);
    });
}(this, function (Strophe, $build, $iq) {
    Strophe.addConnectionPlugin('omemo', (function() {
        if (typeof(libsignal) === "undefined")
            throw new Error("Signal library required!");
        let conn, init;
        conn = null;
        init = function(c) {
            conn = c;
            Strophe.addNamespace('OMEMO', "urn:xmpp:omemo:1");
            conn.disco.addFeature(Strophe.NS.OMEMO);
            conn.disco.addFeature(Strophe.NS.OMEMO + '+notify');
            conn.disco.addFeature(Strophe.NS.OMEMO + ':devices+notify');
        };

        var getUserDevices = function ($stanza) {
            let devices = [];
            $stanza.find(`devices[xmlns="${Strophe.NS.OMEMO}"] device`).each(function(idx, device) {
                let $device = $(device),
                    id = $device.attr('id'),
                    label = $device.attr(('label'));
                id && devices.push({id, label});
            }.bind(this));
            return devices;
        };

        var getDevicesNode = function (callback) {
            if (!conn)
                return;
            if (this.devices) {
                callback && callback();
                return;
            }
            let iq = $iq({type: 'get', to: `pubsub.${conn.domain}`})
                .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                .c('items', {node: Strophe.NS.OMEMO + ":devices"});
            conn.sendIQ(iq, callback, function (err) {
                ($(err).find('error').attr('code') == 404) && createNode(callback);
            }.bind(this));
        };

        var addDevice = function (device_id) {
            getDevicesNode(function (cb) {
                if (!cb)
                    return;
                let $cb = $(cb);
                this.devices = getUserDevices($cb);
                if (!this.devices.find(d => d.id == device_id))
                    publishDevice(device_id);
            }.bind(this));
        };

        var createNode = function (callback) {
            conn.pubsub.createNode(Strophe.NS.OMEMO + ':devices', callback);
        };

        var publishDevice = function (id) {
            !this.devices && (this.devices = []);
            this.devices.push({id});
            let stanza = $iq({type: 'set'})
                .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                .c('publish', {node: Strophe.NS.OMEMO + ':devices'})
                .c('item', {id: 'current'})
                .c('devices', {xmlns: Strophe.NS.OMEMO});
            this.devices.forEach(function (device) {
                if (!device.id)
                    return;
                let attrs = {id: device.id};
                device.label && (attrs.label = device.label);
                stanza.c('device', attrs).up();
            }.bind(this));
            stanza.up().up().up()
                .c('publish-options')
                .c('x', {xmlns: Strophe.NS.DATA_FORM, type: 'submit'})
                .c('field', {var: 'FORM_TYPE', type: 'hidden'})
                .c('value').t(Strophe.NS.PUBSUB + '#publish-options').up().up()
                .c('field', {var: 'pubsub#access_model'})
                .c('value').t('open');
            conn.sendIQ(stanza);
        };

        var publishBundle = function (attrs, callback) {
            let preKeys = attrs.preKeys,
                spk = attrs.spk,
                iq = $iq({type: 'set'})
                .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                .c('publish', {node: `${Strophe.NS.OMEMO}:bundles`})
                .c('item')
                .c('bundle', {xmlns: Strophe.NS.OMEMO})
                .c('spk', {id: spk.id}).t(spk.key).up()
                .c('spks').t().up()
                .c('ik').t().up()
                .c('prekeys');
            for (var preKey in preKeys) {
                iq.c('pk', {id: preKey.id}).t(preKey.key).up()
            }
            iq.up().up().up().up().up()
                .c('publish-options')
                .c('x', {xmlns: Strophe.NS.DATAFORM, type: 'submit'})
                .c('field', {type: 'FORM_TYPE', type: 'hidden'})
                .c('value').t(Strophe.NS.PUBSUB + '#publish-options').up().up()
                .c('field', {var: 'pubsub#max_items'})
                .c('value').t('max');
            conn.sendIQ(iq, callback);
        };

        return {
            init: init,
            getUserDevices: getUserDevices,
            publishDevice: publishDevice,
            addDevice: addDevice
        };
    })());
}));