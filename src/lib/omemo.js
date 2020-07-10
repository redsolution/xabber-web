(function (root, factory) {
    define(["strophe","strophe.disco", "strophe.pubsub"], function (Strophe) {
        factory(Strophe.Strophe, Strophe.$build, Strophe.$iq);
    });
}(this, function (Strophe, $build, $iq) {
    Strophe.addConnectionPlugin('omemo', (function() {
        if (typeof(libsignal) === "undefined")
            throw new Error("Signal library required!");
        let conn, init;
        this._connection = null;
        init = function(c) {
            this._connection = c;
            this.devices = [];
            Strophe.addNamespace('OMEMO', "urn:xmpp:omemo:1");
            this._connection.disco.addFeature(Strophe.NS.OMEMO);
            this._connection.disco.addFeature(Strophe.NS.OMEMO + '+notify');
            this._connection.disco.addFeature(Strophe.NS.OMEMO + ':devices+notify');
            this._connection.disco.addFeature(Strophe.NS.OMEMO + ':bundles+notify');
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

        var getDevicesNode = function (jid, callback) {
            let attrs = {from: this._connection.jid, type: 'get'};
            jid && (attrs.to = jid);
            let iq = $iq(attrs)
                .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                .c('items', {node: Strophe.NS.OMEMO + ":devices"});
            this._connection.sendIQ(iq, callback, function (err) {
                ($(err).find('error').attr('code') == 404 && !jid) && createNode(callback);
            }.bind(this));
        };

        var createNode = function (callback) {
            this._connection.pubsub.createNode(Strophe.NS.OMEMO + ':devices', callback);
        };

        var publishDevice = function (id, callback, errback) {
            !this.devices && (this.devices = []);
            this.devices.push({id});
            let stanza = $iq({from: this._connection.jid, type: 'set'})
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
                .c('x', {xmlns: Strophe.NS.DATAFORM, type: 'submit'})
                .c('field', {var: 'FORM_TYPE', type: 'hidden'})
                .c('value').t(Strophe.NS.PUBSUB + '#publish-options').up().up()
                .c('field', {var: 'pubsub#access_model'})
                .c('value').t('open');
            this._connection.sendIQ(stanza, callback, function (err) {
                if ($(err).find('error').attr('code') == 409) {
                    $(stanza.tree()).find('publish-options').remove();
                    this._connection.sendIQ(stanza, callback, errback);
                }
            }.bind(this));
        };

        var publishBundle = function (attrs, callback, errback) {
            let preKeys = attrs.pks,
                spk = attrs.spk,
                stanza = $iq({from: this._connection.jid, type: 'set'})
                .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                .c('publish', {node: `${Strophe.NS.OMEMO}:bundles`})
                .c('item', {id: attrs.device_id})
                .c('bundle', {xmlns: Strophe.NS.OMEMO})
                .c('spk', {id: spk.id}).t(spk.key).up()
                .c('spks').t(attrs.spks).up()
                .c('ik').t(attrs.ik).up()
                .c('prekeys');
            for (var i in preKeys) {
                let preKey = preKeys[i];
                stanza.c('pk', {id: preKey.id}).t(preKey.key).up()
            }
            stanza.up().up().up().up()
                .c('publish-options')
                .c('x', {xmlns: Strophe.NS.DATAFORM, type: 'submit'})
                .c('field', {var: 'FORM_TYPE', type: 'hidden'})
                .c('value').t(Strophe.NS.PUBSUB + '#publish-options').up().up()
                .c('field', {var: 'pubsub#access_model'})
                .c('value').t('open');
            this._connection.sendIQ(stanza, callback, function (err) {
                if ($(err).find('error').attr('code') == 409) {
                    $(stanza.tree()).find('publish-options').remove();
                    this._connection.sendIQ(stanza, callback, errback);
                }
            }.bind(this));
        };

        var getBundleInfo = function (attrs, callback) {
            let iq = $iq({type: 'get', from: this._connection.jid, to: attrs.jid})
                .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                .c('items', {node: `${Strophe.NS.OMEMO}:bundles`, max_items: 1});
            attrs.id && iq.c('item', {id: attrs.id});
            this._connection.sendIQ(iq, callback);
        };

        return {
            init: init,
            getUserDevices: getUserDevices,
            getDevicesNode: getDevicesNode,
            publishDevice: publishDevice,
            publishBundle: publishBundle,
            getBundleInfo: getBundleInfo
        };
    })());
}));