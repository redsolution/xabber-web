import xabber from "xabber-core";

let env = xabber.env,
    constants = env.constants,
    utils = env.utils,
    $ = env.$,
    templates = env.templates.base,
    Strophe = env.Strophe,
    _ = env._;



xabber.IncomingTrustSessionView = xabber.BasicView.extend({
    className: 'modal main-modal incoming-trust-session-modal',
    template: templates.incoming_trust_session,
    events: {
        "click .btn-change": "submit",
        "click .btn-cancel": "cancel",
    },

    render: function (options) {
        this.account = options.account;
        this.trust = options.trust;
        this.message = options.message;
        this.contact = options.contact;
        this.message_options = options.message_options;
        this.sid = options.sid;
        this.$el.openModal({
            ready: this.onRender.bind(this),
            complete: this.close.bind(this)
        });
        xabber.on('verification_session_cancelled', this.onSessionCancel, this);
    },

    onRender: function (options) {
        this.message_options && this.message_options.msg_item && this.trust.removeAfterHandle(this.message_options.msg_item);
    },

    onSessionCancel: function (options) {
        if (options && options.sid === this.sid){
            this.closeModal();
        }
    },

    cancel: function () {
        this.close();
    },

    submit: function () {
        // handle code if accept
        this.message_options.automated = false;
        this.trust.receiveTrustVerificationMessage(this.message, this.message_options);
        this.close(true);
    },

    onHide: function () {
        this.$el.detach();
    },

    close: function (is_accepted) {
        if (!is_accepted){

            let msg_id = uuid(),
                to = this.contact ? this.contact.get('jid') : this.account.get('jid'),
                stanza = $iq({
                    type: 'set',
                    to: to,
                    id: msg_id
                });
            stanza.c('notify', {xmlns: Strophe.NS.XABBER_NOTIFY});
            stanza.c('notification', {xmlns: Strophe.NS.XABBER_NOTIFY});
            stanza.c('forwarded', {xmlns: Strophe.NS.FORWARD});
            stanza.c('message', {
                to: to,
                from: this.account.get('jid'),
                type: 'chat',
                id: uuid()
            });
            stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: this.sid, timestamp: Date.now()});
            stanza.c('verification-failed', {reason: 'Session cancelled'}).up().up();

            stanza.c('body').t(`Device Verification Session cancelled from ${this.account.jid}`).up();
            stanza.up().up().up();
            stanza.c('fallback',{xmlns: Strophe.NS.XABBER_NOTIFY}).t(`device verification Session cancelled fallback text`).up();
            stanza.c('no-store', {xmlns: Strophe.NS.HINTS}).up();
            stanza.c('no-copy', {xmlns: Strophe.NS.HINTS}).up();
            stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

            this.account.sendFast(stanza, () => {
                // console.log(stanza);
                // console.log(stanza.tree());
                utils.callback_popup_message(xabber.getString("trust_verification_decrypt_failed"), 5000);
            });
            this.trust.clearData(this.sid);
        }
        this.closeModal();
    },

    closeModal: function () {
        this.$el.closeModal({ complete: this.hide.bind(this) });
    }
});

xabber.Trust = Backbone.ModelWithStorage.extend({
    defaults: {
        trusted_devices: {},
        active_trust_sessions: {},
        ended_sessions: [],
    },

    _initialize: function (attrs, options) {
        this.account = options.account;
        this.omemo = options.omemo;
        this.account.omemo = this.omemo;
        this.account.on('peer_devices_updated', () => {
            this.updateVerificationData();
        });
        this.on('trust_updated change:trusted_devices', this.updateOmemoTrusts, this);
        this.updateVerificationData();
    },

    onConnected: function () {
        this.populateOwnTrustedDevices();
    },

    updateOmemoTrusts: function () {
        console.log(this.omemo);
        if (!this.omemo)
            return;
        let trusted_devices = this.get('trusted_devices');

        Object.keys(trusted_devices).forEach((item) => {
            trusted_devices[item].forEach((device_item) => {
                this.omemo.updateFingerprints(item, device_item.device_id, device_item.fingerprint, true);
            });
        });
    },

    cancelSession: function (sid, to) {

        if (to){
            let msg_id = uuid(),
                stanza = $iq({
                    type: 'set',
                    to: to,
                    id: msg_id
                });
            stanza.c('notify', {xmlns: Strophe.NS.XABBER_NOTIFY});
            stanza.c('notification', {xmlns: Strophe.NS.XABBER_NOTIFY});
            stanza.c('forwarded', {xmlns: Strophe.NS.FORWARD});
            stanza.c('message', {
                to: to,
                from: this.account.get('jid'),
                type: 'chat',
                id: uuid()
            });
            stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Date.now()});
            stanza.c('verification-failed', {reason: 'Session cancelled'}).up().up();

            stanza.c('body').t(`Device Verification Session cancelled from ${this.account.jid}`).up();
            stanza.up().up().up();
            stanza.c('fallback',{xmlns: Strophe.NS.XABBER_NOTIFY}).t(`device verification Data decryption failed fallback text`).up();
            stanza.c('no-store', {xmlns: Strophe.NS.HINTS}).up();
            stanza.c('no-copy', {xmlns: Strophe.NS.HINTS}).up();
            stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

            this.account.sendFast(stanza, () => {
                // console.log(stanza);
                // console.log(stanza.tree());
                utils.callback_popup_message(xabber.getString("trust_verification_decrypt_failed"), 5000);
            });
        }
        this.clearData(sid);
    },

    configNode: function (callback, errback) {
        let iq = $iq({type: 'set'})
            .c('pubsub', {xmlns: Strophe.NS.PUBSUB + '#owner'})
            .c('configure', {node: Strophe.NS.PUBSUB_TRUST_SHARING_ITEMS})
            .form(Strophe.NS.PUBSUB_NODE_CONFIG, {
                'pubsub#max_items': 32
            });
        this.account.sendIQFast(iq,
            (res) => {
                // console.log(res)
                callback && callback(res);
            },
            (data_error) => {
                errback && errback(data_error);
            });
    },

    createNode: function (callback, errback) {
        let iq = $iq({type:'set'})
            .c('pubsub', {xmlns:Strophe.NS.PUBSUB})
            .c('create',{node: Strophe.NS.PUBSUB_TRUST_SHARING_ITEMS});
            iq.up().c('configure').form(Strophe.NS.PUBSUB_NODE_CONFIG, {
                'pubsub#max_items': 32
            });
        this.account.sendIQFast(iq,
            (res) => {
                callback && callback(res);
            },
            (data_error) => {
                errback && errback(data_error);
            });
    },

    publishOwnTrustedDevices: function (callback) {
        let my_trusted_devices = this.get('trusted_devices')[this.account.get('jid')],
            my_saved_trusted_device,
            current_timestamp = Date.now();
        if (!my_trusted_devices)
            return;

        my_saved_trusted_device = my_trusted_devices.filter(item => item.is_me);

        if (!my_saved_trusted_device.length){
            console.error('no own device');
            return;
        } else {
            my_saved_trusted_device = my_saved_trusted_device[0];
        }
        // console.log(my_saved_trusted_device);

        let iq = $iq({type: 'set'})
            .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
            .c('publish', {node: Strophe.NS.PUBSUB_TRUST_SHARING_ITEMS})
            .c('item', {id: this.omemo.get('device_id')})
            .c('share', {xmlns: Strophe.NS.PUBSUB_TRUST_SHARING, usage: Strophe.NS.OMEMO})
            .c('identity').t(my_saved_trusted_device.fingerprint).up()
            .c('trusted-items', {timestamp: current_timestamp});

        my_trusted_devices.forEach((trusted_device) => {
            iq.c('trust', {timestamp: trusted_device.timestamp}).t(trusted_device.trusted_key).up();
        });

        let $trusted_items = $(iq.tree()).find('trusted-items');

        // console.log($trusted_items[0]);


        $trusted_items.find('trust').sort(function(a, b) {
            return +a.getAttribute('timestamp') - +b.getAttribute('timestamp');
        }).appendTo($trusted_items);

        let trusted_string = `${$trusted_items.attr('timestamp')}`;

        $trusted_items.find('trust').each((idx, item) => {
            let $item = $(item);
            trusted_string = trusted_string + `<${$item.attr('timestamp')}/${$item.text()}`;
        });

        this.omemo.store.getIdentityKeyPair().then((own_ik) => {
            let own_privkey = own_ik.privKey;
            if (own_privkey.byteLength === 33)
                own_privkey = own_privkey.slice(1);

            // let own_pubkey = own_ik.pubKey;
            // if (own_pubkey.byteLength == 33)
            //     own_pubkey = own_pubkey.slice(1);

            utils.createSha256(trusted_string).then((sha256_trust_message) => {
                // console.log(trusted_string);
                // console.log(sha256_trust_message);

                let signature = utils.curveSign(own_privkey, new Uint8Array(sha256_trust_message));

                iq.up().c('signature').t(utils.ArrayBuffertoBase64(signature.buffer));

                // console.log(utils.ArrayBuffertoBase64(sha256_trust_message));
                // console.log(utils.ArrayBuffertoBase64(signature.buffer));
                // console.log(utils.ArrayBuffertoBase64(own_pubkey));
                //
                // console.log(utils.curveVerify(own_pubkey, new Uint8Array(sha256_trust_message), signature));
                //
                // console.log(iq.tree());
                this.configNode(() => {
                    this.account.sendIQFast(iq,
                        (res) => {
                            // console.log(res);
                            callback && callback(res);
                        },
                        (data_error) => {
                            // errback && errback(data_error);
                        });
                }, (err) => {
                    let err_code = $(err).find('error').attr('code');
                    // console.log(err_code);
                    if (err_code == 404){
                        this.createNode(() => {
                            this.account.sendIQFast(iq,
                                (res) => {
                                    // console.log(res);
                                    callback && callback(res);
                                },
                                (data_error) => {
                                    // errback && errback(data_error);
                                });
                        });
                    }
                })
            });
        });



    },

    publishContactsTrustedDevices: function () {
        let trusted_devices = this.get('trusted_devices');

        let msg_id = uuid(),
            to = this.account.get('jid'),
            stanza = $msg({
                to: to,
                from: this.account.get('jid'),
                type: 'chat',
                id: msg_id
            });

        stanza.c('origin-id', {id: uuid(), xmlns: 'urn:xmpp:sid:0'}).up();
        stanza.c('envelope', {xmlns: Strophe.NS.SCE}).c('content');

        stanza.c('body').t(`${this.account.jid} shared his trusted devices`).up();
        stanza.c('trust-message', {xmlns: Strophe.NS.TRUSTED_MESSAGES, usage: Strophe.NS.OMEMO});

        // console.log(trusted_devices);

        Object.keys(trusted_devices).forEach((item) => {
            if (item === this.account.get('jid'))
                return;
            stanza.c('key-owner', {jid: item});
            trusted_devices[item].forEach((device_item) => {
                stanza.c('trust', {'device-id': device_item.device_id}).t(device_item.trusted_key).up();
            });
            stanza.up();
        });
        stanza.up().up().c('rpad').t('0'.repeat(200).slice(1, Math.floor((Math.random() * 198) + 1))).up();
        stanza.c('from', {jid: this.account.get('jid')}).up().up();

        // console.log(stanza);
        // console.log(stanza.tree());
        // console.log(stanza.tree().outerHTML);

        this.omemo.encrypt(null, stanza ,true).then((msg) => {
            if (msg) {
                stanza = msg.message;
            }

            let final_stanza = $iq({
                    type: 'set',
                    to: to,
                    id: msg_id
                });
            final_stanza.c('notify', {xmlns: Strophe.NS.XABBER_NOTIFY});
            final_stanza.c('notification', {xmlns: Strophe.NS.XABBER_NOTIFY});
            final_stanza.c('forwarded', {xmlns: Strophe.NS.FORWARD});

            final_stanza.cnode(stanza.tree()).up();


            final_stanza.up().up();
            final_stanza.c('fallback',{xmlns: Strophe.NS.XABBER_NOTIFY}).t(`Encrypted notification`).up();
            final_stanza.c('no-store', {xmlns: Strophe.NS.HINTS}).up();
            final_stanza.c('no-copy', {xmlns: Strophe.NS.HINTS}).up();
            final_stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

            this.account.sendFast(final_stanza, () => {

            });
        })


    },

    getTrustedDevices: function (to, callback) {
        let iq = $iq({type: 'get', to: to})
            .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
            .c('items', {node: Strophe.NS.PUBSUB_TRUST_SHARING_ITEMS});

        this.account.sendIQFast(iq,
            (res) => {
                // console.log(res);
                callback && callback(res);
            },
            (data_error) => {
                // errback && errback(data_error);
            });
    },

    populateOwnTrustedDevices: function () {
        // console.log(this.get('trusted_devices'));
        let trusted_devices = this.get('trusted_devices');
        // console.log(Object.keys(trusted_devices).length);
        if (!Object.keys(trusted_devices).length) {
            let own_device = this.omemo.own_devices[this.omemo.get('device_id')];
            // console.log(own_device);
                if (!own_device){
                    this.account.once('devices_updated', () => {
                        // console.log('devices_updated');
                        this.populateOwnTrustedDevices()
                    });
                    return;
                }

                this.getTrustedKey(own_device).then((trustedKeyBuffer) => {
                    // console.log(utils.ArrayBuffertoBase64(trustedKeyBuffer));
                    trusted_devices[this.account.get('jid')] = [
                        {
                            trusted_key: utils.ArrayBuffertoBase64(trustedKeyBuffer),
                            fingerprint: own_device.get('fingerprint'),
                            timestamp: Date.now(),
                            device_id: own_device.get('id'),
                            is_me: true,
                            public_key: utils.ArrayBuffertoBase64(own_device.get('ik'))
                        }];
                    this.save('trusted_devices', trusted_devices);
                    this.trigger('trust_updated');
                    this.publishOwnTrustedDevices();
                }).catch((err) => {
                    // console.error(err);
                });
        } else {
            this.publishOwnTrustedDevices();
        }
    },

    getTrustedKey: function (device) {
        return new Promise((resolve, reject) => {
            if (!device.get('fingerprint'))
                device.set('fingerprint', device.generateFingerprint());

            let dfd = $.Deferred();

            dfd.done(() => {
                let trustedKey = device.get('id') + '::' + device.get('fingerprint');
                // console.log(trustedKey);

                let trustedKeyBytes = new TextEncoder().encode(trustedKey);

                resolve(trustedKeyBytes);
            }).fail(() => {
                reject('no IK and Fingerprints for this device')
            });

            if (!device.get('fingerprint')){
                device.once('change:fingerprint', () => {
                    dfd.resolve()
                });
                setTimeout(() => {
                    dfd.reject();
                }, 5000);
            } else {
                dfd.resolve()
            }

        });
    },

    getVerificationState: function (session) {
        let state,
            step = session.verification_step;
        if (step === '1a' && session.active_verification_device && session.active_verification_device.device_id){
            state = xabber.getString("verification_session_state__request_code_needed");
        } else if (step === '1a'){
            state = xabber.getString("verification_session_state__request_send");
        } else if (step === '1b'){
            state = xabber.getString("verification_session_state__request_answered");
        } else if (step === '2a' || step === '2b'){
            state = xabber.getString("verification_session_state__request_proceeding");
        }

        return state;
    },

    clearData: function (sid) {
        let active_sessions = this.get('active_trust_sessions');
        if (this.account.notifications_content){
            this.account.notifications_content.updateTrustSession(sid, true);
        }

        delete(active_sessions[sid]);

        this.save('active_trust_sessions', active_sessions);
        this.updateVerificationData();
        this.addEndedSessionsData(sid);
    },

    addVerificationSessionData: function (sid, new_data) {
        let active_sessions = this.get('active_trust_sessions');

        if (!active_sessions[sid])
            active_sessions[sid] = {};

        active_sessions[sid] = _.extend(active_sessions[sid], new_data);

        this.save('active_trust_sessions', active_sessions);
        this.updateVerificationData();
        if (this.account.notifications_content){
            this.account.notifications_content.updateTrustSession(sid);
        }
    },

    addEndedSessionsData: function (sid) {
        let ended_sessions = this.get('ended_sessions');

        if (!ended_sessions.includes(sid)){
            ended_sessions.push(sid);
            xabber.trigger('verification_session_cancelled',{sid: sid});

            this.save('ended_sessions', ended_sessions);
        }
    },

    updateVerificationData: function () {
        // console.error('updateverdat');
        let active_sessions = this.get('active_trust_sessions'),
            active_sessions_data = {},
            device_exists_jid_list = [];


        Object.keys(active_sessions).forEach((session_id) => {
            let session = active_sessions[session_id],
                session_data = {};

            let active_verification_device = session.active_verification_device,
                peer,device;
            if (active_verification_device && active_verification_device.device_id){
                if (active_verification_device.is_own_device) {
                    device = this.omemo.own_devices[active_verification_device.device_id];
                    if (this.active_sessions_data && this.active_sessions_data[session_id] && device && !this.active_sessions_data[session_id].active_verification_device){
                        device_exists_jid_list.push({
                            sid: session_id,
                            jid: this.account.get('jid')
                        })
                    }
                } else {
                    peer = this.omemo.getPeer(active_verification_device.peer_jid);
                    device = peer.devices[active_verification_device.device_id];
                    if (this.active_sessions_data && this.active_sessions_data[session_id] && device && !this.active_sessions_data[session_id].active_verification_device){
                        device_exists_jid_list.push({
                            sid: session_id,
                            jid: active_verification_device.peer_jid
                        })
                    }
                }
                session_data.active_verification_device = device;
            } else {
                session_data.active_verification_device = '';
            }

            session_data.active_verification_code = session.active_verification_code;

            session_data.verification_step = session.verification_step;

            session_data.current_a_jid = session.current_a_jid;

            session_data.a_payload = session.a_payload && typeof(session.a_payload) === 'string' ? utils.fromBase64toArrayBuffer(session.a_payload) : '';

            session_data.b_payload = session.b_payload && typeof(session.b_payload) === 'string' ? utils.fromBase64toArrayBuffer(session.b_payload) : '';

            session_data.verification_started = session.verification_started;

            session_data.last_sent_message_id = session.last_sent_message_id;

            session_data.can_handle_trust = session.can_handle_trust;



            active_sessions_data[session_id] = session_data;

        });

        this.active_sessions_data = active_sessions_data;

        device_exists_jid_list.forEach((item) => {
            let event_name = `trust_omemo_device_appeared-${item.sid}`;
            this.account.trigger(event_name, item.jid)
        });

    },

    parseContactsTrustedDevices: function (message, options) {
        let $message = $(message),
            received_device_id = options.device_id,
            is_new_devices = false,
            counter = 0,
            total_count = $message.find('trust-message key-owner trust').length;

        let my_trusted_devices = this.get('trusted_devices')[this.account.get('jid')];

        // console.log(my_trusted_devices.filter(e => e.device_id == received_device_id));
        // console.log(my_trusted_devices.some(e => e.device_id == received_device_id));

        if (my_trusted_devices.some(e => e.device_id == received_device_id)){// сделать обработку трастов
            let $trust_message = $message.find('trust-message');
            $trust_message.children('key-owner').each((idx, key_owner) => {
                // console.log(key_owner);
                let $key_owner = $(key_owner),
                    jid = $key_owner.attr('jid');
                $key_owner.children('trust').each((idx, trust_item) => {
                    // console.log(trust_item);
                    let $trust_item = $(trust_item),
                        device_id = $trust_item.attr('device-id'),
                        trusted_key = $trust_item.text();

                    let is_new = this.addNewContactsDevice(trusted_key, jid, device_id);
                    // console.log(is_new);
                    // console.log(device_id);

                    counter++;
                    if (is_new)
                       is_new_devices = true;
                    if (counter === total_count){
                       if (is_new_devices)
                           this.publishContactsTrustedDevices();
                       else {
                           // console.log('no new devices')
                       }
                    }
                });

            });
        }

    },

    addNewContactsDevice: function (trusted_key, jid, device_id) {
        let peer = this.omemo.getPeer(jid);
        // console.log(peer);
        if (!peer)
            return;
        let device = peer.devices[device_id],
            trusted_devices = this.get('trusted_devices');
        // console.log(device);
        if (!device)
            return;
        if (trusted_devices[jid] && _.isArray(trusted_devices[jid])){
            if (!trusted_devices[jid].some(e => e.trusted_key === trusted_key)){
                trusted_devices[jid].push({
                    trusted_key: trusted_key,
                    fingerprint: device.get('fingerprint'),
                    device_id: device.get('id'),
                    timestamp: Date.now(),
                    public_key: utils.ArrayBuffertoBase64(device.get('ik'))
                });
            } else {
                return;
            }
        } else {
            trusted_devices[jid] = [{
                trusted_key: trusted_key,
                fingerprint: device.get('fingerprint'),
                device_id: device.get('id'),
                timestamp: Date.now(),
                public_key: utils.ArrayBuffertoBase64(device.get('ik'))
            }];
        }
        // console.log('new item');
        // console.log({
        //     trusted_key: trusted_key,
        //     fingerprint: device.get('fingerprint'),
        //     device_id: device.get('id'),
        //     timestamp: Date.now(),
        //     public_key: utils.ArrayBuffertoBase64(device.get('ik'))
        // });
        this.save('trusted_devices', trusted_devices);
        this.trigger('trust_updated');

        return true;


    },

    getNewTrustedDevices: function (trusted_devices, $message, final_trusted_devices, is_first, peer) {
        // console.error('here');
        // console.error(this.omemo.own_devices.length);
        // peer && console.error(peer);
        // peer && console.error(peer.devices);
        let new_trusted_devices = [],
            counter = 0;
        final_trusted_devices = final_trusted_devices || [];
        let devices_to_remove = [];
        if (!is_first){
            trusted_devices.forEach((item,idx) => {
                // console.log(item);
                // console.log(idx);
                let trustedKeyString = atob(item.trusted_key);

                let item_fingerprint = trustedKeyString.split('::')[1],
                    item_device_id = trustedKeyString.split('::')[0],
                    item_device = peer ? peer.devices[item_device_id] : this.omemo.own_devices[item_device_id];
                if (item_device){
                    trusted_devices[idx] = {
                        trusted_key: item.trusted_key,
                        timestamp: Date.now(),
                        fingerprint: item_fingerprint,
                        device_id: item_device_id,
                        public_key: utils.ArrayBuffertoBase64(item_device.get('ik'))
                    };
                } else {
                    trusted_devices[idx] = null
                }
                // console.log(idx);
                // console.log(trusted_devices[idx]);

            });
        }
        trusted_devices = trusted_devices.filter(Boolean);
        final_trusted_devices = final_trusted_devices.concat(trusted_devices);
        trusted_devices.forEach((item) => {
            let dfd = $.Deferred();

            dfd.done(() => {
                counter++;
                // console.log(counter);
                // console.log(trusted_devices.length);
                // console.log(counter === trusted_devices.length);

                if (counter === trusted_devices.length) {
                    // console.log(trusted_devices);
                    // console.log(final_trusted_devices);
                    if (new_trusted_devices.length){
                        this.getNewTrustedDevices(new_trusted_devices, $message, final_trusted_devices, null, peer)
                    } else {
                        if (!is_first){
                            let saved_trusted_devices = this.get('trusted_devices');
                            if (peer) {
                                saved_trusted_devices[peer.get('jid')] = final_trusted_devices;
                            } else {
                                saved_trusted_devices[this.account.get('jid')] = final_trusted_devices;//
                            }
                            console.log(saved_trusted_devices);
                            this.save('trusted_devices', saved_trusted_devices);
                            this.trigger('trust_updated');
                            if (peer){
                                this.publishContactsTrustedDevices();
                            } else {
                                this.publishOwnTrustedDevices();
                            }
                        }
                        // console.log(final_trusted_devices);
                    }
                }
            });

            if (item.is_me){
                dfd.resolve();
                return;
            }
            let trustedKeyString = atob(item.trusted_key);

            if (trustedKeyString.split('::').length !== 2){
                dfd.resolve();
                return;
            }

            let item_device_id = trustedKeyString.split('::')[0],
                item_device = peer ? peer.devices[item_device_id] : this.omemo.own_devices[item_device_id];

            // console.log(item_fingerprint);
            // console.log(item_device_id);
            // console.log(item_device);

            if (!item_device){
                dfd.resolve();
                return;
            }

            let item_public_key = item_device.get('ik');

            // console.log(item_public_key);
            if (!item_public_key){
                dfd.resolve();
                return;
            }

            if (item_public_key.byteLength === 33)
                item_public_key = item_public_key.slice(1);

            let $item = $message.find(`item[id="${item_device_id}"]`);

            if (!$item.length){
                dfd.resolve();
                return;
            }

            let trusted_item_signature = $item.find('signature').text(),
                $trusted_items = $item.find('trusted-items');
            // console.log($item[0].outerHTML);
            // console.log($item.find('share')[0].outerHTML);
            // console.log($item.find('trusted-items')[0].outerHTML);
            // console.log($item.find('trusted-items')[0].outerHTML);
            // console.log($trusted_items[0].outerHTML);

            $trusted_items.find('trust').sort(function(a, b) {
                return +a.getAttribute('timestamp') - +b.getAttribute('timestamp');
            }).appendTo($trusted_items);

            let trusted_string = `${$trusted_items.attr('timestamp')}`;

            // console.log($trusted_items.find('trust'));
            $trusted_items.find('trust').each((idx, trust_item) => {
                let $item = $(trust_item);
                trusted_string = trusted_string + `<${$item.attr('timestamp')}/${$item.text()}`;
            });

            utils.createSha256(trusted_string).then((sha256_trust_message) => {
                // console.log(trusted_string);
                // console.log(sha256_trust_message);
                //
                // console.log(utils.ArrayBuffertoBase64(sha256_trust_message));
                // console.log(trusted_item_signature);
                // console.log(utils.ArrayBuffertoBase64(item_public_key));

                let is_signature_verified = utils.curveVerify(item_public_key, new Uint8Array(sha256_trust_message), new Uint8Array(utils.fromBase64toArrayBuffer(trusted_item_signature)));

                // console.log(is_signature_verified);
                if (is_signature_verified){

                    $trusted_items.find('trust').each((idx, trust_item) => {

                        let $item = $(trust_item);

                        // console.log(final_trusted_devices);
                        // console.log(final_trusted_devices.filter(e => e.trusted_key === $item.text()));
                        // console.log(!devices_to_remove.includes($item.text()));

                        if (!(final_trusted_devices.filter(e => e.trusted_key === $item.text()).length > 0) && !devices_to_remove.includes($item.text())){
                            let trusted_new_saved_device = {
                                trusted_key: $item.text(),
                            };
                            new_trusted_devices.push(trusted_new_saved_device);
                        }
                    });

                    dfd.resolve();
                } else {
                    // подпись неверна
                    // console.log(final_trusted_devices.length);
                    final_trusted_devices = final_trusted_devices.filter(i => i.trusted_key !== item.trusted_key);

                    // console.log(final_trusted_devices.length);

                    devices_to_remove.push(item.trusted_key);
                    dfd.resolve();
                }
            });
        });
    },

    receivePubSubMessage: function ($message) {
        if (Strophe.getBareJidFromJid($message.attr('from')) === this.account.get('jid')){
            this.getTrustedDevices(this.account.get('jid'), (res) => {

                let my_trusted_devices = this.get('trusted_devices')[this.account.get('jid')],
                    $all_items_msg = $(res);

                // console.log(my_trusted_devices);
                // console.log(res);
                this.getNewTrustedDevices(my_trusted_devices, $all_items_msg, null, true);
            });
        } else {
            let from = Strophe.getBareJidFromJid($message.attr('from'));
            if (this.get('trusted_devices')[from] && this.get('trusted_devices')[from].length){
                this.getTrustedDevices(from, (res) => {

                    let contact_trusted_devices = this.get('trusted_devices')[from],
                        $all_items_msg = $(res),
                        peer = this.omemo.getPeer(from);
                    this.getNewTrustedDevices(contact_trusted_devices, $all_items_msg, null, true, peer);
                });

            }
        }
    },

    removeAfterHandle: function (message) {
        // console.log(message);
        if (!message.collection || !message.collection.chat)
            return;
        let chat = message.collection.chat;
        chat.retractMessages([message], false, true);

    },

    handleAcceptedMsgBySid: function (sid) {
        let active_sessions = this.get('active_trust_sessions');

        if (active_sessions[sid]){
            let session = active_sessions[sid];
            if (session.verification_accepted_msg_xml){
                this.account.omemo.xabber_trust.receiveTrustVerificationMessage(session.verification_accepted_msg_xml, {

                });
            }
        }

    },

    receiveTrustVerificationMessage: function (message, options) {
        if (!this.account.server_features.get(Strophe.NS.XABBER_NOTIFY))
            return;
        let $message = $(message),
            sid = $message.find('authenticated-key-exchange').attr('sid');
        // console.error(message);
        let contact = this.account.contacts.get(Strophe.getBareJidFromJid($message.attr('from')));

        if (Strophe.getBareJidFromJid($message.attr('from')) === this.account.get('jid'))
            contact = undefined;

        console.log(sid);
        console.log(contact);
        console.log(options);
        if (options.notification_trust_msg && options.device_id){
            // console.log(options.device_id);
            // console.log(this.omemo.get('device_id'));
            // console.log(options.device_id == this.omemo.get('device_id'));
            if (options.device_id == this.omemo.get('device_id'))
                return;
            this.parseContactsTrustedDevices(message, options);
            return;
        }

        if (this.active_sessions_data[sid]){
            if ($message.find('verification-successful').length){
                // console.log($message.find('verification-successful').attr('reason'));
                if (this.active_sessions_data[sid].can_handle_trust){
                    this.handleVerificationSuccess($message, contact, sid);
                } else {
                    // console.log('cannot trust yet');
                    this.clearData(sid);
                }
                return;
            }
            if ($message.find('verification-failed').length){
                // console.log($message.find('verification-failed').attr('reason'));
                this.clearData(sid);
                return;
            }
        } else {
            if ($message.find('verification-failed').length){
                this.clearData(sid);
                return;
            }
        }

        if (this.active_sessions_data[sid]
            && this.active_sessions_data[sid].current_a_jid === Strophe.getBareJidFromJid($message.attr('to'))){
            if ($message.find(`verification-accepted`).length && $('#modals').find('.modal.modal-verification-start').length){
                let $verifcationStartModal = $('#modals').find('.modal.modal-verification-start');  // change to close opened request view
                $verifcationStartModal.find('.btn-cancel').click();
                return;
            }
        }

        if (contact){
            if ($message.find('verification-start').length && $message.find('verification-start').attr('device-id') && this.omemo.get('device_id') && options.automated){
                let ended_sessions = this.get('ended_sessions');

                if (ended_sessions.includes(sid)){
                    options.msg_item && this.removeAfterHandle(options.msg_item);
                    return;
                }
                this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                });
                let view = new xabber.IncomingTrustSessionView();
                view.show({
                    account: this.account,
                    trust: this,
                    message: message,
                    message_options: options,
                    contact: contact,
                    sid: sid
                });
            }
            if ($message.find('verification-start').length && $message.find('verification-start').attr('device-id') && this.omemo.get('device_id') && !options.automated){
                this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                    current_a_jid: contact.get('jid'),
                    active_verification_device: {
                        peer_jid: this.account.get('jid'),
                    },
                });
                this.handleTrustVerificationStart($message, contact, null, options.msg_item);
                return;
            }
            if ($message.find(`verification-accepted`).length && $message.find(`verification-accepted`).attr('device-id')
                && $message.find(`salt`).length && this.active_sessions_data[sid] && this.active_sessions_data[sid].verification_started){

                this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                    active_verification_device: {
                        device_id: $message.find('verification-accepted').attr('device-id'),
                        is_own_device: false,
                        peer_jid: contact.get('jid'),
                    },
                });
                if (options.automated){
                    this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                        verification_accepted_msg_xml: message.outerHTML,
                    });
                }
                if (this.active_sessions_data[sid].verification_step === '1a' && !options.automated)
                    this.handleTrustVerificationSigned($message, contact);
                return;
            }
            if (this.active_sessions_data[sid] && this.active_sessions_data[sid].active_verification_code){
                let dfd = new $.Deferred();
                dfd.done(() => {
                    if ($message.find('hash').length && $message.find('salt').length && this.active_sessions_data[sid].verification_step === '1b'){
                        this.handleTrustVerificationCodeHash($message, contact);
                        return;
                    }
                    if ($message.find('hash').length && !$message.find('salt').length && this.active_sessions_data[sid].verification_step === '2a'){
                        this.handleTrustVerificationFinalHash($message, contact);
                        return;
                    }
                });
                if (this.active_sessions_data[sid].active_verification_device){
                    dfd.resolve();
                } else {
                    let event_name = `trust_omemo_device_appeared-${sid}`;

                    this.account.on(event_name, (jid) => {
                        if (jid === contact.get('jid')){
                            this.account.off(event_name);
                            dfd.resolve();
                        }
                    });
                }
            }
        } else if (Strophe.getBareJidFromJid($message.attr('from')) === this.account.get('jid') && Strophe.getBareJidFromJid($message.attr('to')) === this.account.get('jid')) {
            if (this.active_sessions_data[sid] && this.active_sessions_data[sid].last_sent_message_id == $message.attr('id'))
                return;
            if ($message.find('verification-start').length && $message.find('verification-start').attr('device-id') && $message.find('verification-start').attr('to-device-id') && this.omemo.get('device_id') && options.automated){

                if ($message.find('verification-start').attr('to-device-id') != this.omemo.get('device_id'))
                    return;
                let ended_sessions = this.get('ended_sessions');

                if (ended_sessions.includes(sid)){
                    options.msg_item && this.removeAfterHandle(options.msg_item);
                    return;
                }

                this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                });
                let view = new xabber.IncomingTrustSessionView();
                view.show({
                    account: this.account,
                    trust: this,
                    message: message,
                    message_options: options,
                    contact: null,
                    sid: sid
                });
            }
            if ($message.find('verification-start').length && $message.find('verification-start').attr('device-id') && $message.find('verification-start').attr('to-device-id') && this.omemo.get('device_id') && !options.automated){
                // console.log(this.omemo.get('device_id'));
                // console.log($message.find('verification-start').attr('to-device-id'));
                if ($message.find('verification-start').attr('to-device-id') != this.omemo.get('device_id'))
                    return;
                let device = this.omemo.own_devices[$message.find('verification-start').attr('to-device-id')];
                this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                    current_a_jid: this.account.get('jid'),
                    active_verification_device: {
                        device_id: device.id,
                        is_own_device: true,
                        peer_jid: device.jid,
                    },
                });
                if ($message.find('verification-start').attr('device-id') == this.omemo.get('device_id'))
                    return;
                this.handleTrustVerificationStart($message, null, true, options.msg_item);
                return;
            }
            if ($message.find(`verification-accepted`).length && $message.find(`verification-accepted`).attr('device-id')
                && $message.find(`salt`).length && this.active_sessions_data[sid] && this.active_sessions_data[sid].verification_started){
                if ($message.find('verification-accepted').attr('device-id') == this.omemo.get('device_id'))
                    return;

                let device = this.omemo.own_devices[$message.find('verification-accepted').attr('device-id')];

                this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                    active_verification_device: {
                        device_id: device.id,
                        is_own_device: true,
                        peer_jid: device.jid,
                    },
                });
                if (options.automated){
                    this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                        verification_accepted_msg_xml: message.outerHTML,
                    });
                }
                if (this.active_sessions_data[sid].verification_step === '1a' && !options.automated)
                    this.handleTrustVerificationSigned($message, null, true);
                return;
            }
            if (this.active_sessions_data[sid] && this.active_sessions_data[sid].active_verification_code){
                let dfd = new $.Deferred();
                dfd.done(() => {
                    if ($message.find('hash').length && $message.find('salt').length && this.active_sessions_data[sid].verification_step === '1b'){
                        this.handleTrustVerificationCodeHash($message, null);
                        return;
                    }
                    if ($message.find('hash').length && !$message.find('salt').length && this.active_sessions_data[sid].verification_step === '2a'){
                        this.handleTrustVerificationFinalHash($message, null);
                        return;
                    }
                });
                if (this.active_sessions_data[sid].active_verification_device){
                    dfd.resolve();
                } else {
                    let event_name = `trust_omemo_device_appeared-${sid}`;

                    this.account.on(event_name, (jid) => {
                        if (jid === this.account.get('jid')){
                            this.account.off(event_name);
                            dfd.resolve();
                        }
                    });
                }
            }
        }

    },

    getDevicesIKsForTrustVerification: function (device) {
        return new Promise((resolve, reject) => {
            if (device){
                this.omemo.store.getIdentityKeyPair().then((own_ik) => {
                    let dfd = new $.Deferred();
                    dfd.done(() => {
                        let own_pubkey = own_ik.pubKey,
                            own_privkey = own_ik.privKey;
                        if (own_pubkey.byteLength == 33)
                            own_pubkey = own_pubkey.slice(1);
                        if (own_privkey.byteLength == 33)
                            own_privkey = own_privkey.slice(1);
                        let device_pubkey = device.get('ik');
                        if (device_pubkey.byteLength == 33) // иногда после запуска пустой
                            device_pubkey = device_pubkey.slice(1);

                        resolve({
                            own_pubkey,
                            own_privkey,
                            device_pubkey,
                        });
                    });
                    if (device.get('ik') && device.get('ik').byteLength){
                        dfd.resolve();
                    } else {
                        device.on('change:ik', () => {
                            dfd.resolve();
                        })
                    }
                });
            } else {
                console.log('no device');
            }
        });


    },

    handleTrustVerificationStart: function ($message, contact, is_own, msg_item) {
        let device_id = $message.find('verification-start').attr('device-id'),
            sid = $message.find('authenticated-key-exchange').attr('sid'),
            code = utils.randomCode(6),
            peer,device;
        if (contact) {
            peer = this.omemo.getPeer(contact.get('jid'));
            device = peer.devices[device_id];
        } else if (is_own){
            device = this.omemo.own_devices[device_id];
        }
        if (!device)
            return;

        this.account.omemo.xabber_trust.addVerificationSessionData(sid, {

        });
        // make here next handler

        // utils.dialogs.ask(
        //     xabber.getString("xabber_trust__start_verification_label"),
        //     xabber.getString("xabber_trust__start_verification_text") + ' ' + code,
        //     {modal_class: 'modal-verification-start'},
        //     null
        // ).done((result) => {
        //     if (result) {
        //         console.log(device);
                this.getDevicesIKsForTrustVerification(device).then((devices_IK) => {
                    // console.log(devices_IK);
                    // console.log(code);
                    this.generateVerificationArrayBuffer(devices_IK.device_pubkey, devices_IK.own_privkey, code).then((response) => {
                        // console.log(response);
                        let msg_id = uuid(),
                            to = contact ? contact.get('jid') : this.account.get('jid'),
                            stanza = $iq({
                                type: 'set',
                                to: to,
                                id: msg_id
                            });
                        stanza.c('notify', {xmlns: Strophe.NS.XABBER_NOTIFY});
                        stanza.c('notification', {xmlns: Strophe.NS.XABBER_NOTIFY});
                        stanza.c('forwarded', {xmlns: Strophe.NS.FORWARD});
                        stanza.c('message', {
                            to: to,
                            from: this.account.get('jid'),
                            type: 'chat',
                            id: uuid()
                        });
                        stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Date.now()});
                        stanza.c('verification-accepted', {'device-id': this.account.omemo.get('device_id')}).up();
                        stanza.c('salt').c('ciphertext').t(response.data).up().c('iv').t(response.iv).up().up().up();
                        stanza.c('body').t(`Device Verification answered from ${this.account.jid} B1`).up();
                        stanza.up().up().up();
                        stanza.c('fallback',{xmlns: Strophe.NS.XABBER_NOTIFY}).t(`device verification answer fallback text`).up();
                        stanza.c('no-store', {xmlns: Strophe.NS.HINTS}).up();
                        stanza.c('no-copy', {xmlns: Strophe.NS.HINTS}).up();
                        stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();
                        this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                            active_verification_device: {
                                device_id: device.id,
                                is_own_device: is_own,
                                peer_jid: device.jid,
                            },
                            active_verification_code: code,
                            b_payload: utils.ArrayBuffertoBase64(response.not_encrypted_payload),
                            verification_step: '1b',
                            last_sent_message_id: msg_id
                        });
                        msg_item && this.removeAfterHandle(msg_item);
                        this.account.sendFast(stanza, () => {
                            // console.log(stanza);
                            // console.log(stanza.tree());
                            utils.callback_popup_message(xabber.getString("trust_verification_traded"), 5000);
                        });
                    });
                });
            // } else {
            //     this.clearData(sid);
            // }
        // });
    },

    handleTrustVerificationSigned: function ($message, contact, is_own) {
        let device_id = $message.find('verification-accepted').attr('device-id'),
            sid = $message.find('authenticated-key-exchange').attr('sid'),
            peer, device;
        if (!this.active_sessions_data[sid]) {
            return;
        }
        if (contact) {
            peer = this.omemo.getPeer(contact.get('jid'));
            // console.log(peer);
            device = peer.devices[device_id];
        } else if (is_own){
            device = this.omemo.own_devices[device_id];
        }
        if (!device)
            return;

        this.getDevicesIKsForTrustVerification(device).then((devices_IK) => {
            // console.log(devices_IK);

            let curve = utils.doCurve(devices_IK.own_privkey, devices_IK.device_pubkey),
                $salt = $message.find('salt');

            if ($salt.length){
                let data = utils.fromBase64toArrayBuffer($message.find('ciphertext').text()),
                    iv = utils.fromBase64toArrayBuffer($message.find('iv').text());

                utils.dialogs.ask_enter_value(
                    xabber.getString("xabber_trust__verification_code_label"),
                    xabber.getString("xabber_trust__verification_code_text"),
                    { modal_class: 'modal-verification-code', input_placeholder_value: ''},
                    {}
                ).done((result) => {
                    // console.log(result)
                    if (result) {
                        let code = result;

                        this.decryptTrustBuffer(iv, data, curve, code).then((decrypted_response) => {
                            this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                                b_payload: utils.ArrayBuffertoBase64(decrypted_response.decryptedBuffer),
                            });

                            this.generateVerificationArrayBuffer(devices_IK.device_pubkey, devices_IK.own_privkey, code).then((response) => {

                                this.getTrustedKey(this.omemo.own_devices[this.omemo.get('device_id')]).then((trustedKeyBuffer) => {
                                    this.generateVerificationEncryptedHash(trustedKeyBuffer, code, decrypted_response.decryptedBuffer, decrypted_response.encryptionKeyHash).then((hash_response) => {
                                        let msg_id = uuid(),
                                            to = contact ? contact.get('jid') : this.account.get('jid'),
                                            stanza = $iq({
                                                type: 'set',
                                                to: to,
                                                id: msg_id
                                            });
                                        stanza.c('notify', {xmlns: Strophe.NS.XABBER_NOTIFY});
                                        stanza.c('notification', {xmlns: Strophe.NS.XABBER_NOTIFY});
                                        stanza.c('forwarded', {xmlns: Strophe.NS.FORWARD});
                                        stanza.c('message', {
                                            to: to,
                                            from: this.account.get('jid'),
                                            type: 'chat',
                                            id: uuid()
                                        });
                                        stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Date.now()});

                                        stanza.c('salt').c('ciphertext').t(response.data).up().c('iv').t(response.iv).up().up();
                                        stanza.c('hash', {xmlns: Strophe.NS.HASH, algo: 'sha-256'});
                                        stanza.c('ciphertext').t(hash_response.data).up().c('iv').t(hash_response.iv).up().up().up();
                                        stanza.c('body').t(`Device Verification Обмен данными from ${this.account.jid} A1`).up();
                                        stanza.up().up().up();
                                        stanza.c('fallback',{xmlns: Strophe.NS.XABBER_NOTIFY}).t(`device verification Обмен данными fallback text`).up();
                                        stanza.c('no-store', {xmlns: Strophe.NS.HINTS}).up();
                                        stanza.c('no-copy', {xmlns: Strophe.NS.HINTS}).up();
                                        stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                                        this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                                            active_verification_device: {
                                                device_id: device.id,
                                                is_own_device: is_own,
                                                peer_jid: device.jid,
                                            },
                                            active_verification_code: code,
                                            a_payload: utils.ArrayBuffertoBase64(response.not_encrypted_payload),
                                            verification_step: '2a',
                                            last_sent_message_id: msg_id
                                        });

                                        this.account.sendFast(stanza, () => {
                                            // console.log(stanza);
                                            // console.log(stanza.tree());
                                            utils.callback_popup_message(xabber.getString("trust_verification_answered"), 5000);
                                        });

                                    });
                                });
                            });
                        }).catch(e => {
                            console.error(e);

                            let msg_id = uuid(),
                                to = contact ? contact.get('jid') : this.account.get('jid'),
                                stanza = $iq({
                                    type: 'set',
                                    to: to,
                                    id: msg_id
                                });
                            stanza.c('notify', {xmlns: Strophe.NS.XABBER_NOTIFY});
                            stanza.c('notification', {xmlns: Strophe.NS.XABBER_NOTIFY});
                            stanza.c('forwarded', {xmlns: Strophe.NS.FORWARD});
                            stanza.c('message', {
                                to: to,
                                from: this.account.get('jid'),
                                type: 'chat',
                                id: uuid()
                            });
                            stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Date.now()});
                            stanza.c('verification-failed', {reason: 'Data decryption failed'}).up().up();

                            stanza.c('body').t(`Device Verification Data decryption failed from ${this.account.jid} A1`).up();
                            stanza.up().up().up();
                            stanza.c('fallback',{xmlns: Strophe.NS.XABBER_NOTIFY}).t(`device verification Data decryption failed fallback text`).up();
                            stanza.c('no-store', {xmlns: Strophe.NS.HINTS}).up();
                            stanza.c('no-copy', {xmlns: Strophe.NS.HINTS}).up();
                            stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                            this.account.sendFast(stanza, () => {
                                // console.log(stanza);
                                // console.log(stanza.tree());
                                utils.callback_popup_message(xabber.getString("trust_verification_decrypt_failed"), 5000);
                            });
                            this.clearData(sid);
                        });
                    } else {
                        //handle if cancelled

                        let msg_id = uuid(),
                            to = contact ? contact.get('jid') : this.account.get('jid'),
                            stanza = $iq({
                                type: 'set',
                                to: to,
                                id: msg_id
                            });
                        stanza.c('notify', {xmlns: Strophe.NS.XABBER_NOTIFY});
                        stanza.c('notification', {xmlns: Strophe.NS.XABBER_NOTIFY});
                        stanza.c('forwarded', {xmlns: Strophe.NS.FORWARD});
                        stanza.c('message', {
                            to: to,
                            from: this.account.get('jid'),
                            type: 'chat',
                            id: uuid()
                        });
                        stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Date.now()});
                        stanza.c('verification-failed', {reason: 'Signature verification cancelled'}).up().up();

                        stanza.c('body').t(`Device Verification Signature verification cancelled from ${this.account.jid} A1`).up();
                        stanza.up().up().up();
                        stanza.c('fallback',{xmlns: Strophe.NS.XABBER_NOTIFY}).t(`device verification Signature verification cancelled fallback text`).up();
                        stanza.c('no-store', {xmlns: Strophe.NS.HINTS}).up();
                        stanza.c('no-copy', {xmlns: Strophe.NS.HINTS}).up();
                        stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                        this.account.sendFast(stanza, () => {
                            // console.log(stanza);
                            // console.log(stanza.tree());
                            utils.callback_popup_message(xabber.getString("trust_verification_decrypt_failed"), 5000);
                        });
                        this.clearData(sid);
                    }
                });
            }
        });
    },

    handleTrustVerificationCodeHash: function ($message, contact) {
        let sid = $message.find('authenticated-key-exchange').attr('sid');
        if (!this.active_sessions_data[sid]) {
            return;
        }
        let device = this.active_sessions_data[sid].active_verification_device,
            code = this.active_sessions_data[sid].active_verification_code;
        // console.log(device);

        this.getDevicesIKsForTrustVerification(device).then((devices_IK) => {
            // console.log(devices_IK);

            let curve = utils.doCurve(devices_IK.own_privkey, devices_IK.device_pubkey),
                $salt = $message.find('salt'),
                $hash = $message.find('hash');

            if ($salt.length && $hash.length){
                let data = utils.fromBase64toArrayBuffer($message.find('salt ciphertext').text()),
                    hash = utils.fromBase64toArrayBuffer($message.find('hash ciphertext').text()),
                    a_iv = utils.fromBase64toArrayBuffer($message.find('salt iv').text()),
                    hash_iv = utils.fromBase64toArrayBuffer($message.find('hash iv').text());

                // console.log(curve);
                // console.log(utils.ArrayBuffertoBase64(curve));
                // console.log($message.find('salt iv').text());
                // console.log(this.active_sessions_data[sid].active_verification_code);
                // console.log(utils.ArrayBuffertoBase64(curve));

                this.decryptTrustBuffer(a_iv, data, curve, code).then((decrypted_a) => {
                    // console.log('utils.ArrayBuffertoBase64(decrypted_a.decryptedBuffer)  !!!!!!!!!!!!!!!!!!!!!!!!!1');
                    // console.log(utils.ArrayBuffertoBase64(decrypted_a.decryptedBuffer));
                    this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                        a_payload: utils.ArrayBuffertoBase64(decrypted_a.decryptedBuffer),
                    });


                    this.decryptTrustBuffer(hash_iv, hash, curve, code).then((decrypted_hash) => {

                        let b_payload = this.active_sessions_data[sid].b_payload,
                            code_buffer = new TextEncoder().encode(code);
                        // console.log('B_device_id_buffer  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                        // console.log(utils.ArrayBuffertoBase64(B_device_id_buffer));
                        // console.log('devices_IK.own_pubkey  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                        // console.log(utils.ArrayBuffertoBase64(devices_IK.own_pubkey));

                        this.getTrustedKey(device).then((A_trustedKeyBuffer) => {

                            let concatinated = new Uint8Array([...new Uint8Array(A_trustedKeyBuffer), ...new Uint8Array(code_buffer), ...new Uint8Array(b_payload) ]);

                            // console.log('A_trustedKeyBuffer  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                            // console.log(A_trustedKeyBuffer);
                            // console.log(utils.ArrayBuffertoBase64(A_trustedKeyBuffer));
                            // console.log('code_buffer  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                            // console.log(code_buffer);
                            // console.log(utils.ArrayBuffertoBase64(code_buffer));
                            // console.log('b_payload  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                            // console.log(b_payload);
                            // console.log(utils.ArrayBuffertoBase64(b_payload));
                            // console.log('concatinated  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                            // console.log(concatinated);
                            // console.log(utils.ArrayBuffertoBase64(concatinated));

                            utils.createSha256(concatinated).then((concatinated_hash) => {
                                let generated_hash_b64 = utils.ArrayBuffertoBase64(concatinated_hash),
                                    decrypted_hash_b64 = utils.ArrayBuffertoBase64(decrypted_hash.decryptedBuffer);

                                // console.log('generated_hash_b64  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                                // console.log(generated_hash_b64);
                                // console.log('decrypted_hash_b64  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                                // console.log(decrypted_hash_b64);

                                if (generated_hash_b64 === decrypted_hash_b64){
                                    this.getTrustedKey(this.omemo.own_devices[this.omemo.get('device_id')]).then((B_trustedKeyBuffer) => {
                                        this.generateVerificationEncryptedFinalHash(B_trustedKeyBuffer, code, this.active_sessions_data[sid].b_payload, this.active_sessions_data[sid].a_payload, decrypted_a.encryptionKeyHash).then((hash_response) => {

                                            let msg_id = uuid(),
                                                to = contact ? contact.get('jid') : this.account.get('jid'),
                                                stanza = $iq({
                                                    type: 'set',
                                                    to: to,
                                                    id: msg_id
                                                });

                                            // console.log('B_trustedKeyBuffer  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                                            // console.log(utils.ArrayBuffertoBase64(B_trustedKeyBuffer));
                                            // console.log(B_trustedKeyBuffer);
                                            // console.log('code  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                                            // console.log(code);
                                            // console.log('this.b_payload  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                                            // console.log(utils.ArrayBuffertoBase64(this.b_payload));
                                            // console.log(this.b_payload);
                                            // console.log('this.a_payload  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                                            // console.log(utils.ArrayBuffertoBase64(this.a_payload));
                                            // console.log(this.a_payload);
                                            // console.log('decrypted_a.encryptionKeyHash  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                                            // console.log(utils.ArrayBuffertoBase64(decrypted_a.encryptionKeyHash));
                                            // console.log(decrypted_a.encryptionKeyHash);
                                            stanza.c('notify', {xmlns: Strophe.NS.XABBER_NOTIFY});
                                            stanza.c('notification', {xmlns: Strophe.NS.XABBER_NOTIFY});
                                            stanza.c('forwarded', {xmlns: Strophe.NS.FORWARD});
                                            stanza.c('message', {
                                                to: to,
                                                from: this.account.get('jid'),
                                                type: 'chat',
                                                id: uuid()
                                            });
                                            stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Date.now()});

                                            stanza.c('hash', {xmlns: Strophe.NS.HASH, algo: 'sha-256'});
                                            stanza.c('ciphertext').t(hash_response.data).up().c('iv').t(hash_response.iv).up().up().up();

                                            stanza.c('body').t(`Device Verification Окончание верификации from ${this.account.jid} B1`).up();
                                            stanza.up().up().up();
                                            stanza.c('fallback',{xmlns: Strophe.NS.XABBER_NOTIFY}).t(`device verification Окончание верификации fallback text`).up();
                                            stanza.c('no-store', {xmlns: Strophe.NS.HINTS}).up();
                                            stanza.c('no-copy', {xmlns: Strophe.NS.HINTS}).up();
                                            stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                                            this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                                                can_handle_trust: true,
                                                last_sent_message_id: msg_id,
                                                verification_step: '2b',
                                            });

                                            this.account.sendFast(stanza, () => {
                                                // console.log(stanza);
                                                // console.log(stanza.tree());
                                                utils.callback_popup_message(xabber.getString("trust_verification_answered"), 5000);
                                            });

                                        });
                                    });
                                } else {

                                    let msg_id = uuid(),
                                        to = contact ? contact.get('jid') : this.account.get('jid'),
                                        stanza = $iq({
                                            type: 'set',
                                            to: to,
                                            id: msg_id
                                        });
                                    stanza.c('notify', {xmlns: Strophe.NS.XABBER_NOTIFY});
                                    stanza.c('notification', {xmlns: Strophe.NS.XABBER_NOTIFY});
                                    stanza.c('forwarded', {xmlns: Strophe.NS.FORWARD});
                                    stanza.c('message', {
                                        to: to,
                                        from: this.account.get('jid'),
                                        type: 'chat',
                                        id: uuid()
                                    });
                                    stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Date.now()});
                                    stanza.c('verification-failed', {reason: 'Hashes didn\'t match'}).up().up();

                                    stanza.c('body').t(`Device Verification Hashes didn't match from ${this.account.jid} B1`).up();
                                    stanza.up().up().up();
                                    stanza.c('fallback',{xmlns: Strophe.NS.XABBER_NOTIFY}).t(`device verification Hashes didn't match fallback text`).up();
                                    stanza.c('no-store', {xmlns: Strophe.NS.HINTS}).up();
                                    stanza.c('no-copy', {xmlns: Strophe.NS.HINTS}).up();
                                    stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                                    this.account.sendFast(stanza, () => {
                                        // console.log(stanza);
                                        // console.log(stanza.tree());
                                        utils.callback_popup_message(xabber.getString("trust_verification_decrypt_failed"), 5000);
                                    });
                                    this.clearData(sid);
                                }
                            })
                        });
                    }).catch(e => {
                        // console.log(e);

                        let msg_id = uuid(),
                            to = contact ? contact.get('jid') : this.account.get('jid'),
                            stanza = $iq({
                                type: 'set',
                                to: to,
                                id: msg_id
                            });
                        stanza.c('notify', {xmlns: Strophe.NS.XABBER_NOTIFY});
                        stanza.c('notification', {xmlns: Strophe.NS.XABBER_NOTIFY});
                        stanza.c('forwarded', {xmlns: Strophe.NS.FORWARD});
                        stanza.c('message', {
                            to: to,
                            from: this.account.get('jid'),
                            type: 'chat',
                            id: uuid()
                        });
                        stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Date.now()});
                        stanza.c('verification-failed', {reason: 'Data decryption failed'}).up().up();

                        stanza.c('body').t(`Device Verification Data decryption failed from ${this.account.jid} B1`).up();
                        stanza.up().up().up();
                        stanza.c('fallback',{xmlns: Strophe.NS.XABBER_NOTIFY}).t(`device verification Data decryption failed fallback text`).up();
                        stanza.c('no-store', {xmlns: Strophe.NS.HINTS}).up();
                        stanza.c('no-copy', {xmlns: Strophe.NS.HINTS}).up();
                        stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                        this.account.sendFast(stanza, () => {
                            // console.log(stanza);
                            // console.log(stanza.tree());
                            utils.callback_popup_message(xabber.getString("trust_verification_decrypt_failed"), 5000);
                        });
                        this.clearData(sid);
                    });
                }).catch(e => {
                    // console.log(e);

                    let msg_id = uuid(),
                        to = contact ? contact.get('jid') : this.account.get('jid'),
                        stanza = $iq({
                            type: 'set',
                            to: to,
                            id: msg_id
                        });
                    stanza.c('notify', {xmlns: Strophe.NS.XABBER_NOTIFY});
                    stanza.c('notification', {xmlns: Strophe.NS.XABBER_NOTIFY});
                    stanza.c('forwarded', {xmlns: Strophe.NS.FORWARD});
                    stanza.c('message', {
                        to: to,
                        from: this.account.get('jid'),
                        type: 'chat',
                        id: uuid()
                    });
                    stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Date.now()});
                    stanza.c('verification-failed', {reason: 'Data decryption failed with error'}).up().up();

                    stanza.c('body').t(`Device Verification Data decryption failed with error from ${this.account.jid} B1`).up();
                    stanza.up().up().up();
                    stanza.c('fallback',{xmlns: Strophe.NS.XABBER_NOTIFY}).t(`device verification Data decryption failed with error fallback text`).up();
                    stanza.c('no-store', {xmlns: Strophe.NS.HINTS}).up();
                    stanza.c('no-copy', {xmlns: Strophe.NS.HINTS}).up();
                    stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                    this.account.sendFast(stanza, () => {
                        // console.log(stanza);
                        // console.log(stanza.tree());
                        utils.callback_popup_message(xabber.getString("trust_verification_decrypt_failed"), 5000);
                    });
                    this.clearData(sid);
                });
            }
        });

    },

    handleTrustVerificationFinalHash: function ($message, contact) {
        let sid = $message.find('authenticated-key-exchange').attr('sid');
        if (!this.active_sessions_data[sid]) {
            return;
        }
        let device = this.active_sessions_data[sid].active_verification_device,
            code = this.active_sessions_data[sid].active_verification_code;
        // console.log('device');
        // console.log(device);

        this.getDevicesIKsForTrustVerification(device).then((devices_IK) => {

            console.log(devices_IK);
            let curve = utils.doCurve(devices_IK.own_privkey, devices_IK.device_pubkey),
                $hash = $message.find('hash');

            if ($hash.length){

                let hash = utils.fromBase64toArrayBuffer($message.find('hash ciphertext').text()),
                    hash_iv = utils.fromBase64toArrayBuffer($message.find('hash iv').text());

                this.decryptTrustBuffer(hash_iv, hash, curve, code).then((decrypted_hash) => {

                    let code_buffer = new TextEncoder().encode(code);

                    this.getTrustedKey(device).then((trustedKeyBuffer) => {

                        let concatinated = new Uint8Array([...new Uint8Array(trustedKeyBuffer), ...new Uint8Array(code_buffer), ...new Uint8Array(this.active_sessions_data[sid].b_payload), ...new Uint8Array(this.active_sessions_data[sid].a_payload) ]);

                        utils.createSha256(concatinated).then((concatinated_hash) => {

                            let generated_hash_b64 = utils.ArrayBuffertoBase64(concatinated_hash),
                                decrypted_hash_b64 = utils.ArrayBuffertoBase64(decrypted_hash.decryptedBuffer);

                            // console.log('generated_hash_b64  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                            // console.log(generated_hash_b64);
                            // console.log('decrypted_hash_b64  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                            // console.log(decrypted_hash_b64);

                            if (generated_hash_b64 === decrypted_hash_b64){
                                //start devices exchange
                                this.sendTrustedDevices(contact, device, sid);

                            } else {
                                // if hashes dont match
                                let msg_id = uuid(),
                                    to = contact ? contact.get('jid') : this.account.get('jid'),
                                    stanza = $iq({
                                        type: 'set',
                                        to: to,
                                        id: msg_id
                                    });
                                stanza.c('notify', {xmlns: Strophe.NS.XABBER_NOTIFY});
                                stanza.c('notification', {xmlns: Strophe.NS.XABBER_NOTIFY});
                                stanza.c('forwarded', {xmlns: Strophe.NS.FORWARD});
                                stanza.c('message', {
                                    to: to,
                                    from: this.account.get('jid'),
                                    type: 'chat',
                                    id: uuid()
                                });
                                stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Date.now()});
                                stanza.c('verification-failed', {reason: 'Hashes didn\'t match in final stanza'}).up().up();

                                stanza.c('body').t(`Device Verification Hashes didn't match in final stanza from ${this.account.jid} A1`).up();
                                stanza.up().up().up();
                                stanza.c('fallback',{xmlns: Strophe.NS.XABBER_NOTIFY}).t(`device verification Hashes didn't match in final stanza fallback text`).up();
                                stanza.c('no-store', {xmlns: Strophe.NS.HINTS}).up();
                                stanza.c('no-copy', {xmlns: Strophe.NS.HINTS}).up();
                                stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                                this.account.sendFast(stanza, () => {
                                    // console.log(stanza);
                                    // console.log(stanza.tree());
                                    utils.callback_popup_message(xabber.getString("trust_verification_decrypt_failed"), 5000);
                                });
                                this.clearData(sid);
                            }

                        });
                    });
                });
            }
        });

    },

    decryptTrustBuffer: async function (iv, data, curve, code) {
        let hash = await utils.createSha256(code),
            concatinated = new Uint8Array([...new Uint8Array(curve), ...new Uint8Array(hash)]),
            encryptionKeyHash = await utils.createSha256(concatinated);
        // console.log('code');
        // console.log(code);
        // console.log('hash');
        // console.log(hash);
        // console.log(utils.ArrayBuffertoBase64(hash));
        // console.log('concatinated');
        // console.log(concatinated);
        // console.log(utils.ArrayBuffertoBase64(concatinated));
        // console.log('encryptionKeyHash');
        // console.log(encryptionKeyHash);
        // console.log(utils.ArrayBuffertoBase64(encryptionKeyHash));

        // console.log('utils.ArrayBuffertoBase64(hash)');
        // console.log(utils.ArrayBuffertoBase64(hash));
        // console.log('utils.ArrayBuffertoBase64(encryptionKey)');
        // console.log(utils.ArrayBuffertoBase64(encryptionKey));

        let encryptionKey = await window.crypto.subtle.importKey('raw', encryptionKeyHash, { "name": 'AES-CBC' }, true, ['decrypt']);

        let decryptedBuffer = await window.crypto.subtle.decrypt({
            name: 'AES-CBC',
            iv,
        }, encryptionKey, data);

        return {decryptedBuffer, encryptionKeyHash};
    },

    generateVerificationArrayBuffer: async function (device_pubkey, own_privkey, code) {
        let buffer = window.crypto.getRandomValues(new Uint8Array(32)).buffer,
            iv = window.crypto.getRandomValues(new Uint8Array(16)),
            cypher,
            curve = utils.doCurve(own_privkey, device_pubkey),
            hash = await utils.createSha256(code);

        // console.log(curve);
        // console.log('utils.ArrayBuffertoBase64(buffer)');
        // console.log(utils.ArrayBuffertoBase64(buffer));
        // console.log('utils.ArrayBuffertoBase64(hash)');
        // console.log(utils.ArrayBuffertoBase64(hash));

        let concatinated = new Uint8Array([...new Uint8Array(curve), ...new Uint8Array(hash)]),
            aes_key = await utils.createSha256(concatinated);

        // console.log('utils.ArrayBuffertoBase64(aes_key) !!!!!!!!!!!!!!!!!!!!!!!!!1');
        // console.log(utils.ArrayBuffertoBase64(aes_key));
        // console.log('utils.ArrayBuffertoBase64(buffer) !!!!!!!!!!!!!!!!!!!!!!!!!1');
        // console.log(utils.ArrayBuffertoBase64(buffer));

        let encryptionKey = await window.crypto.subtle.importKey('raw', aes_key, { "name": 'AES-CBC' }, true, ['encrypt']);

        cypher = await window.crypto.subtle.encrypt({ name: 'AES-CBC', iv }, encryptionKey, buffer);

        // console.log(utils.ArrayBuffertoBase64(cypher));

        return {data: utils.ArrayBuffertoBase64(cypher), iv: utils.ArrayBuffertoBase64(iv), not_encrypted_payload: buffer};

    },

    generateVerificationEncryptedHash: async function (trustedKeyBuffer, code, b_payload, sharedKey) {
        let iv = window.crypto.getRandomValues(new Uint8Array(16)),
            code_buffer = new TextEncoder().encode(code);

        // console.log(curve);
        // console.log('utils.ArrayBuffertoBase64(buffer)');
        // console.log(utils.ArrayBuffertoBase64(buffer));
        // console.log('utils.ArrayBuffertoBase64(hash)');
        // console.log(utils.ArrayBuffertoBase64(hash));

        let concatinated = new Uint8Array([...new Uint8Array(trustedKeyBuffer), ...new Uint8Array(code_buffer), ...new Uint8Array(b_payload) ]),
            concatinated_hash = await utils.createSha256(concatinated);

        // console.log('utils.ArrayBuffertoBase64(aes_key)');
        // console.log(utils.ArrayBuffertoBase64(aes_key));
        // console.log('utils.ArrayBuffertoBase64(concatinated_hash)  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        // console.log(utils.ArrayBuffertoBase64(concatinated_hash));
        // console.log('utils.ArrayBuffertoBase64(sharedKey)  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        // console.log(utils.ArrayBuffertoBase64(sharedKey));

        let encryptionKey = await window.crypto.subtle.importKey('raw', sharedKey, { "name": 'AES-CBC' }, true, ['encrypt']);

        let cypher = await window.crypto.subtle.encrypt({ name: 'AES-CBC', iv }, encryptionKey, concatinated_hash);

        // console.log(utils.ArrayBuffertoBase64(cypher));

        return {data: utils.ArrayBuffertoBase64(cypher), iv: utils.ArrayBuffertoBase64(iv)};

    },

    generateVerificationEncryptedFinalHash: async function (trustedKeyBuffer, code, b_payload, a_payload, sharedKey) {
        let iv = window.crypto.getRandomValues(new Uint8Array(16)),
            code_buffer = new TextEncoder().encode(code);

        // console.log(curve);
        // console.log('utils.ArrayBuffertoBase64(buffer)');
        // console.log(utils.ArrayBuffertoBase64(buffer));
        // console.log('utils.ArrayBuffertoBase64(hash)');
        // console.log(utils.ArrayBuffertoBase64(hash));
        // console.log('trustedKeyBuffer  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        // console.log(utils.ArrayBuffertoBase64(trustedKeyBuffer));
        // console.log('code_buffer  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        // console.log(utils.ArrayBuffertoBase64(code_buffer));
        // console.log('b_payload  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        // console.log(utils.ArrayBuffertoBase64(b_payload));
        // console.log('a_payload  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        // console.log(utils.ArrayBuffertoBase64(a_payload));

        let concatinated = new Uint8Array([...new Uint8Array(trustedKeyBuffer), ...new Uint8Array(code_buffer), ...new Uint8Array(b_payload), ...new Uint8Array(a_payload) ]),
            concatinated_hash = await utils.createSha256(concatinated);

        // console.log('utils.ArrayBuffertoBase64(aes_key)');
        // console.log(utils.ArrayBuffertoBase64(aes_key));
        // console.log('utils.ArrayBuffertoBase64(concatinated_hash)  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        // console.log(utils.ArrayBuffertoBase64(concatinated_hash));
        // console.log('utils.ArrayBuffertoBase64(sharedKey)  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        // console.log(utils.ArrayBuffertoBase64(sharedKey));

        let encryptionKey = await window.crypto.subtle.importKey('raw', sharedKey, { "name": 'AES-CBC' }, true, ['encrypt']);

        let cypher = await window.crypto.subtle.encrypt({ name: 'AES-CBC', iv }, encryptionKey, concatinated_hash);

        // console.log(utils.ArrayBuffertoBase64(cypher));

        return {data: utils.ArrayBuffertoBase64(cypher), iv: utils.ArrayBuffertoBase64(iv), not_encrypted_hash_buffer: concatinated_hash};

    },

    sendVerificationSuccess: async function (to, sid) {

        let msg_id = uuid(),
            stanza = $iq({
                type: 'set',
                to: to,
                id: msg_id
            });
        stanza.c('notify', {xmlns: Strophe.NS.XABBER_NOTIFY});
        stanza.c('notification', {xmlns: Strophe.NS.XABBER_NOTIFY});
        stanza.c('forwarded', {xmlns: Strophe.NS.FORWARD});
        stanza.c('message', {
            to: to,
            from: this.account.get('jid'),
            type: 'chat',
            id: uuid()
        });
        stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Date.now()});
        stanza.c('verification-successful').up().up();

        stanza.c('body').t(`Device Verification was successful from ${this.account.jid} A1`).up();
        stanza.up().up().up();
        stanza.c('fallback',{xmlns: Strophe.NS.XABBER_NOTIFY}).t(`device verification Verification was successful fallback text`).up();
        stanza.c('no-store', {xmlns: Strophe.NS.HINTS}).up();
        stanza.c('no-copy', {xmlns: Strophe.NS.HINTS}).up();
        stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

        this.account.sendFast(stanza, () => {
            // console.log(stanza);
            console.log(stanza.tree());
            this.clearData(sid);
            utils.callback_popup_message(xabber.getString("trust_verification_verification_succeded"), 5000);
        });
    },

    sendTrustedDevices: function (contact, device, sid) {
        this.getTrustedKey(device).then((trustedKeyBuffer) => {
            let trustedKeyBase64 = utils.ArrayBuffertoBase64(trustedKeyBuffer),
                trusted_devices = this.get('trusted_devices'),
                to = contact ? contact.get('jid') : this.account.get('jid');
            if (trusted_devices[to] && _.isArray(trusted_devices[to])){
                if (!trusted_devices[to].some(e => e.trusted_key === trustedKeyBase64)){
                    trusted_devices[to].push({
                        trusted_key: trustedKeyBase64,
                        fingerprint: device.get('fingerprint'),
                        device_id: device.get('id'),
                        timestamp: Date.now(),
                        public_key: utils.ArrayBuffertoBase64(device.get('ik'))
                    });
                }
            } else {
                trusted_devices[to] = [{
                    trusted_key: trustedKeyBase64,
                    fingerprint: device.get('fingerprint'),
                    device_id: device.get('id'),
                    timestamp: Date.now(),
                    public_key: utils.ArrayBuffertoBase64(device.get('ik'))
                }];
            }
            this.save('trusted_devices', trusted_devices);
            this.trigger('trust_updated');
            // console.log(this.get('trusted_devices'));

            this.sendVerificationSuccess(to, sid);
            this.publishOwnTrustedDevices(() => {
                this.publishContactsTrustedDevices(() => {
                });
            });
        });
    },

    handleVerificationSuccess: function ($message, contact, sid) {
        if (!this.active_sessions_data[sid]) {
            return;
        }
        let device = this.active_sessions_data[sid].active_verification_device,
            code = this.active_sessions_data[sid].active_verification_code;
        this.getTrustedKey(device).then((trustedKeyBuffer) => {
            let trustedKeyBase64 = utils.ArrayBuffertoBase64(trustedKeyBuffer);
            let trusted_devices = this.get('trusted_devices'),
                to = contact ? contact.get('jid') : this.account.get('jid');
            if (trusted_devices[to] && _.isArray(trusted_devices[to])){
                if (!trusted_devices[to].some(e => e.trusted_key === trustedKeyBase64)){
                    trusted_devices[to].push({
                        trusted_key: trustedKeyBase64,
                        fingerprint: device.get('fingerprint'),
                        device_id: device.get('id'),
                        timestamp: Date.now(),
                        public_key: utils.ArrayBuffertoBase64(device.get('ik'))
                    });
                }
            } else {
                trusted_devices[to] = [{
                    trusted_key: trustedKeyBase64,
                    fingerprint: device.get('fingerprint'),
                    device_id: device.get('id'),
                    timestamp: Date.now(),
                    public_key: utils.ArrayBuffertoBase64(device.get('ik'))
                }];
            }
            this.save('trusted_devices', trusted_devices);
            this.trigger('trust_updated');
            // console.log(this.get('trusted_devices'));


            this.publishOwnTrustedDevices(() => {
                this.publishContactsTrustedDevices(() => {
                });
                this.clearData(sid);
            });
        });
    },
});


export default xabber;
