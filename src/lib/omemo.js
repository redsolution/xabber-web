(function (root, factory) {
    define(["strophe","strophe.disco"], function (Strophe) {
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
            if (typeof(sha256) === "undefined") {
                throw new Error("SHA-256 library required!");
            }
            conn.disco.addFeature(Strophe.NS.OMEMO);
            conn.disco.addFeature(Strophe.NS.OMEMO + '+notify');
            this.device_id = generateDeviceId();
        };

        var generateDeviceId = function () {
            let min = 1,
                max = Math.pow(2, 31) - 1,
                rand = min + Math.random() * (max + 1 - min);
            return Math.floor(rand);
        };

        var getUserDevices = function ($message) {
            let id = $message.find('items item').attr('id'),
                devices = [];
            $message.find(`devices[xmlns="${Strophe.NS.OMEMO}"] device`).each(function(device) {
                let $device = $(device),
                    id = $device.attr('id'),
                    label = $device.attr(('label'));
                devices.push({id: id, label: label});
            }.bind(this));
            return devices;
        };

        var publishDevice = function () {
            !this.devices && (this.devices = []);
            this.devices.push({id: this.device_id});
            let stanza = $iq({type: 'set'})
                .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                .c('publish', {node: Strophe.NS.OMEMO + ':devices'})
                .c('item', {id: this.node_id})
                .c('devices', {xmlns: Strophe.NS.OMEMO});
            this.devices.forEach(function (device) {
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

        return {
            init: init
        };
    })());
}));