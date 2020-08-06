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

        var getDevicesNode = function (jid, callback, errback) {
            let attrs = {from: this._connection.jid, type: 'get'};
            jid && (attrs.to = jid);
            let iq = $iq(attrs)
                .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                .c('items', {node: Strophe.NS.OMEMO + ":devices"});
            this._connection.sendIQ(iq, callback, function (err) {
                ($(err).find('error').attr('code') == 404 && !jid) && createDeviceNode.call(this, callback);
            }.bind(this));
        };

        var sendOptOut = function (attrs, callback) {
            let msg = $msg({type: 'chat', to: attrs.to})
                .c('content', {xmlns: Strophe.NS.SCE})
                .c('payload')
                .c('opt-out', {xmlns: Strophe.NS.OMEMO})
                .c('reason').t(attrs.reason || 'Bad MAC');
            this._connection.sendMsg(msg, callback);
        };

        var createDeviceNode = function (callback) {
            createNode.call(this, Strophe.NS.OMEMO + ':devices', null, callback);
        };

        var createBundleNode = function (id, callback) {
            createNode.call(this, `${Strophe.NS.OMEMO}:bundles:${id}`, null, callback);
        };

        var createNode = function(node, options, callback) {
            let iq = $iq({from:this._connection.jid, type:'set'})
                .c('pubsub', {xmlns:Strophe.NS.PUBSUB})
                .c('create',{node:node});
            if(options) {
                iq.up().c('configure').form(Strophe.NS.PUBSUB_NODE_CONFIG, options);
            }
            this._connection.sendIQ(iq, callback);
        };

        var publishDevice = function (id, label, callback, errback) {
            !this.devices && (this.devices = []);
            if (id)
                this.devices.push({id, label});
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
            this._connection.sendIQ(stanza, callback, errback);
        };

        var publishBundle = function (attrs, callback, errback) {
            let preKeys = attrs.pks,
                spk = attrs.spk,
                stanza = $iq({from: this._connection.jid, type: 'set'})
                    .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                    .c('publish', {node: `${Strophe.NS.OMEMO}:bundles:${attrs.device_id}`})
                    .c('item')
                    .c('bundle', {xmlns: Strophe.NS.OMEMO})
                    .c('spk', {id: spk.id}).t(spk.key).up()
                    .c('spks').t(attrs.spks).up()
                    .c('ik').t(attrs.ik).up()
                    .c('prekeys');
            for (var i in preKeys) {
                let preKey = preKeys[i];
                stanza.c('pk', {id: preKey.id}).t(preKey.key).up()
            }
            this._connection.sendIQ(stanza, callback, errback);
        };

        var getBundleInfo = function (attrs, callback, errback) {
            let iq = $iq({type: 'get', from: this._connection.jid, to: attrs.jid})
                .c('pubsub', {xmlns: Strophe.NS.PUBSUB});
            if (attrs.id)
                iq.c('items', {node: `${Strophe.NS.OMEMO}:bundles:${attrs.id}`});
            else
                iq.c('items', {node: `${Strophe.NS.OMEMO}:bundles`});
            this._connection.sendIQ(iq, callback, errback);
        };

        return {
            init: init,
            getUserDevices: getUserDevices,
            getDevicesNode: getDevicesNode,
            publishDevice: publishDevice,
            createBundleNode: createBundleNode,
            createDeviceNode: createDeviceNode,
            publishBundle: publishBundle,
            getBundleInfo: getBundleInfo
        };
    })());
}));