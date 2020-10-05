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
            this.devices = {};
            Strophe.addNamespace('OMEMO', "urn:xmpp:omemo:1");
            Strophe.addNamespace('PUBSUB_NODE_CONFIG', "http://jabber.org/protocol/pubsub#node_config");
            this._connection.disco.addFeature(Strophe.NS.OMEMO);
            this._connection.disco.addFeature(Strophe.NS.OMEMO + '+notify');
            this._connection.disco.addFeature(Strophe.NS.OMEMO + ':devices+notify');
            this._connection.disco.addFeature(Strophe.NS.OMEMO + ':bundles+notify');
        };

        var parseUserDevices = function ($stanza) {
            let devices = {};
            $stanza.find(`devices[xmlns="${Strophe.NS.OMEMO}"] device`).each(function(idx, device) {
                let $device = $(device),
                    id = $device.attr('id'),
                    label = $device.attr(('label'));
                id && (devices[id] = {id, label});
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
            createNode.call(this, Strophe.NS.OMEMO + ':devices', {'pubsub#access_model': 'open'}, callback);
        };

        var removeNode = function (node, callback) {
            let iq = $iq({from:this._connection.jid, type:'set'})
                .c('pubsub', {xmlns:Strophe.NS.PUBSUB + '#owner'})
                .c('delete',{node:node});
            this._connection.sendIQ(iq, callback);
        };

        var createBundleNode = function (callback) {
            createNode.call(this, `${Strophe.NS.OMEMO}:bundles`, {'pubsub#access_model': 'open', 'pubsub#max_items': 10}, callback);
        };

        var createNode = function(node, options, callback) {
            let iq = $iq({from:this._connection.jid, type:'set'})
                .c('pubsub', {xmlns:Strophe.NS.PUBSUB})
                .c('create',{node:node});
            if (options) {
                iq.up().c('configure').form(Strophe.NS.PUBSUB_NODE_CONFIG, options);
            }
            this._connection.sendIQ(iq, callback);
        };

        var publishDevice = function (id, label, callback, errback) {
            !this.devices && (this.devices = {});
            if (id)
                this.devices[id] = {id, label};
            let stanza = $iq({from: this._connection.jid, type: 'set'})
                .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                .c('publish', {node: Strophe.NS.OMEMO + ':devices'})
                .c('item', {id: 'current'})
                .c('devices', {xmlns: Strophe.NS.OMEMO});
            for (var i in this.devices) {
                let device = this.devices[i];
                if (!device.id)
                    continue;
                let attrs = {id: device.id};
                device.label && (attrs.label = device.label);
                stanza.c('device', attrs).up();
            }
            stanza.up().up().up()
                .c('publish-options')
                .c('x', {xmlns: Strophe.NS.DATAFORM, type: 'submit'})
                .c('field', {var: 'FORM_TYPE', type: 'hidden'})
                .c('value').t(Strophe.NS.PUBSUB + '#publish-options').up().up()
                .c('field', {var: 'pubsub#access_model'})
                .c('value').t('open');
            this._connection.sendIQ(stanza, callback, errback);
        };

        var configNode = function (callback) {
            let iq = $iq({from: this._connection.jid, type: 'set'})
                .c('pubsub', {xmlns: Strophe.NS.PUBSUB + '#owner'})
                .c('configure', {node: `${Strophe.NS.OMEMO}:bundles`})
                .form(Strophe.NS.PUBSUB_NODE_CONFIG, {
                    'pubsub#max_items': 10
                });
            this._connection.sendIQ(iq, callback, callback);
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
            this._connection.sendIQ(stanza, callback, errback);
        };

        var getBundleInfo = function (attrs, callback, errback) {
            let iq = $iq({type: 'get', from: this._connection.jid, to: attrs.jid})
                .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
                .c('items', {node: `${Strophe.NS.OMEMO}:bundles`});
            if (attrs.id)
                iq.c('item', {id: attrs.id});
            this._connection.sendIQ(iq, callback, errback);
        };

        return {
            init: init,
            parseUserDevices: parseUserDevices,
            getDevicesNode: getDevicesNode,
            configNode: configNode,
            publishDevice: publishDevice,
            createBundleNode: createBundleNode,
            createDeviceNode: createDeviceNode,
            publishBundle: publishBundle,
            removeNode: removeNode,
            getBundleInfo: getBundleInfo
        };
    })());
}));