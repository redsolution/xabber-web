import xabber from "xabber-core";

let env = xabber.env,
    constants = env.constants,
    utils = env.utils,
    $ = env.$,
    moment = env.moment,
    templates = env.templates.base,
    Strophe = env.Strophe,
    pretty_datetime = (timestamp) => { return utils.pretty_datetime(timestamp, (xabber.settings.language == 'ru-RU' || xabber.settings.language == 'default' && xabber.get("default_language") == 'ru-RU') && 'D MMMM YYYY HH:mm:ss')},
    pretty_datetime_date = (timestamp) => { return utils.pretty_datetime(timestamp, 'MMM DD, YYYY')},
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
            complete: this.close.bind(this),
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
            stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: this.sid, timestamp: Math.floor(Date.now() / 1000)});
            stanza.c('verification-rejected', {reason: 'Session cancelled'}).up().up();

            stanza.up().up().up();
            stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

            this.account.sendFast(stanza, () => {
                if (this.contact){
                    let $stanza = $(stanza.tree());
                    $stanza.attr('to',this.account.get('jid'));
                    $stanza.find('notification forwarded message').attr('to',this.account.get('jid'));
                    $stanza.find(`addresses[xmlns="${Strophe.NS.ADDRESS}"] address[type="to"]`).attr('jid',this.account.get('jid'));
                    this.contact && this.trust.createFailedSessionMsg(this.contact.get('jid'), 'Session cancelled');
                    this.account.sendFast(stanza, () => {
                    });
                }
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

xabber.ActiveSessionModalView = xabber.BasicView.extend({
    className: 'modal main-modal code-modal',
    template: templates.active_session_modal,
    ps_selector: '.new-trusted-devices-list',
    events: {
        "click .btn-cancel": "cancel",
        "click .btn-cancel-session": "cancelSession",
        "click .btn-accept-session": "acceptRequest",
        "click .btn-reject-session": "rejectRequest",
        "click .btn-enter-code": "enterCode",
        "click .btn-manage-devices": "openDevices",
        "click .btn-close": "cancel",
        "keyup .code-enter": "keyDownCode",
        "keydown .code-enter": "keyDownCode",
    },

    render: function (options) {
        this.account = options.account;
        this.contact = options.contact;
        this.code = options.code;
        this.sid = options.sid;
        this.device_id = options.device_id;
        this.trust = this.account.omemo.xabber_trust;
        if (!this.trust || !this.trust.get('active_trust_sessions')[this.sid])
            return;
        this.account.on('active_session_change', this.onRender, this);
        this.$el.openModal({
            ready: this.onRender.bind(this),
            complete: this.close.bind(this),
        });
        $(document).on(`keyup.session_keyup_close_${this.cid}`, (ev) => {
            if (ev && ev.keyCode === constants.KEY_ENTER && this.session_ending){
                this.cancel();
            }
        });
    },

    onRender: function () {
        this.updateColorScheme();
        let session = this.trust.get('active_trust_sessions')[this.sid];
        if (!session) {
            !this.session_ending && this.close();
            return;
        }
        let step = session.verification_step;
        this.$('.session-step').addClass('hidden');
        this.$('.main-process-wrap').removeClass('hidden');
        this.$('.session-trusted-devices-wrap').addClass('hidden');
        if (step === '1a' && session.active_verification_device && session.active_verification_device.device_id){
            // state = xabber.getString("verification_session_state__request_code_needed");
            this.$('.1a-step').removeClass('hidden');
        } else if (step === '1a'){
            this.$('.0a-step').removeClass('hidden');
        } else if (step === '1b'){
            this.$('.1b-step').removeClass('hidden');
            let code = session.active_verification_code;
            this.$('.code-text').text(code);
        } else if (step === '2a' || step === '2b'){
            this.$('.proceeding-step').removeClass('hidden');
        } else if (step === 'final'){
            this.session_ending = true;
            this.device_id = session.active_verification_device.device_id;
            this.device_jid = this.contact ? this.contact.get('jid') : this.account.get('jid');
            let random_applause = [
                "Awesome",
                "Groovy",
                "Yay",
                "Cool",
                "Fantastic",
                "Bingo",
                "Hooray",
                "Voilà",
                "Cheers",
                "Rock on",
                "Sweet",
                "Right on",
                "Super",
                "Bravo",
                "Got it",
                "Woohoo",
                "Yes",
                "Done",
                "Great",
                "Smashing",
            ];
            this.$('.random-applause').text(random_applause[Math.floor(Math.random()*random_applause.length)]);
            this.$('.main-process-wrap').addClass('hidden');
            this.$('.session-trusted-devices-wrap').removeClass('hidden');
            this.$('.new-trusted-devices-list').html(env.templates.contacts.preloader());
            this.updateDevicesItems();
            this.startUpdatingDevices();
        } else if (step === '0b'){
            this.$('.0b-step').removeClass('hidden');
        }
        if (this.contact){
            let image = this.contact.cached_image;
            this.$('.circle-avatar').setAvatar(image, 64);
            this.$('.code-device-name').text(this.contact.get('name'));
            this.$('.code-device-jid').switchClass('hidden', !this.contact.get('name'));
            this.$('.code-device-jid').text(this.contact.get('jid'));

        } else {
            let token;
            this.account.x_tokens_list && (token = this.account.x_tokens_list.find(item => ((session.active_verification_device && item.omemo_id === session.active_verification_device.device_id) || item.omemo_id == this.device_id)));
            if (token && this.account.x_tokens_list) {
                this.$('.code-device-name').text(token.device || xabber.getString('unknown'));
                this.$('.code-device-jid').html(`${token.ip} • ${pretty_datetime_date(token.last_auth)}`);
                this.$('.phone-icon').switchClass('hidden', !(token.device && (token.device.indexOf('Android') > -1 || token.device.indexOf('iOS') > -1)));
                this.$('.web-icon').switchClass('hidden', (token.device && (token.device.indexOf('Android') > -1 || token.device.indexOf('iOS') > -1)));
            } else if (!this.requested_tokens) {
                this.requested_tokens = true;
                this.account.getAllXTokens(() => {
                    this.onRender();
                });
                return;
            }
        }
        this.$('.part-one b').addClass('text-color-500');
        this.$('.btn-enter-code').prop('disabled', !this.$('input[name="code_enter"]').val());
        this.$el.switchClass('own-device-session-modal', !this.contact);
        this.ps_container.perfectScrollbar('update');

    },

    updateColorScheme: function () {
        this.$el.attr('data-color', this.account.settings.get('color'));
        this.account.settings.once("change:color", this.updateColorScheme, this);
    },

    startUpdatingDevices: function () {
        this.trust.on('trust_updated', () => {
            this.updateDevicesItems()
        });
        setTimeout(() => {
            this.$('.new-trusted-devices-list .preloader-wrapper').remove();
        }, 3000)
    },

    updateDevicesItems: function () {
        let trusted_devices = this.trust.get('trusted_devices');

        this.$('.trust-item-device').remove();
        Object.keys(trusted_devices).forEach((item) => {
            trusted_devices[item].forEach((device_item) => {
                if ((device_item.trust_reason_jid && (device_item.trust_reason_jid === this.device_jid)
                    && device_item.from_device_id && (device_item.from_device_id == this.device_id))
                    || item === this.device_jid && device_item.device_id == this.device_id && device_item.after_trust){
                    let trust_type = device_item.after_trust ? 'direct' : 'indirect',
                        trust_attrs = {
                            device: device_item,
                            trust_type: xabber.getString(`settings_account__trust__trust_type_${trust_type}`),
                        };
                    let peer = this.account.omemo.getPeer(item);
                    if (!peer)
                        return;
                    let device = peer.devices[device_item.device_id];
                    if (!device)
                        return;
                    trust_attrs.label = device.get('label');
                    // trust_attrs.jid = item;
                    if (item === this.account.get('jid')){
                        let token = this.account.x_tokens_list.find(item => (item.omemo_id == device_item.device_id));
                        trust_attrs.ip = '';
                        trust_attrs.last_auth = '';
                        trust_attrs.icon = 'contact';
                        if (token){
                            token.device && (trust_attrs.label = token.device);
                            if (token.device && (token.device.indexOf('Android') > -1 || token.device.indexOf('iOS') > -1)){
                                trust_attrs.icon = 'cellphone';
                            } else {
                                trust_attrs.icon = 'web';
                            }
                            trust_attrs.ip = token.ip;
                            trust_attrs.last_auth = pretty_datetime_date(token.last_auth);
                        }
                        let $trust_device = $(templates.trust_item_device_session(trust_attrs));
                        this.$('.new-trusted-devices-list').append($trust_device);
                        this.$('.new-trusted-devices-list .preloader-wrapper').remove();
                    } else {
                        trust_attrs.ip = device_item.device_id;
                        trust_attrs.last_auth = '';
                        trust_attrs.icon = 'contact';
                        let $trust_device = $(templates.trust_item_device_session(trust_attrs));
                        this.$('.new-trusted-devices-list').append($trust_device);
                        this.$('.new-trusted-devices-list .preloader-wrapper').remove();
                    }
                    // if (!this.contact){
                    // }
                }
            });
        });
    },

    acceptRequest: function () {
        let active_sessions = this.trust.get('active_trust_sessions'),
            session;

        session = active_sessions[this.sid];
        if (!session)
            return;

        let message = session.incoming_request_data.message,
            message_options = session.incoming_request_data.message_options;
        message_options.automated = false;
        this.trust.receiveTrustVerificationMessage(message, message_options);

    },

    rejectRequest: function () {

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
        stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: this.sid, timestamp: Math.floor(Date.now() / 1000)});
        stanza.c('verification-rejected', {reason: 'Session cancelled'}).up().up();

        stanza.up().up().up();
        stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

        this.account.sendFast(stanza, () => {
            if (this.contact){
                let $stanza = $(stanza.tree());
                $stanza.attr('to',this.account.get('jid'));
                $stanza.find('notification forwarded message').attr('to',this.account.get('jid'));
                $stanza.find(`addresses[xmlns="${Strophe.NS.ADDRESS}"] address[type="to"]`).attr('jid',this.account.get('jid'));
                this.trust.createFailedSessionMsg(this.contact.get('jid'), 'Session cancelled');
                this.account.sendFast(stanza, () => {
                });
            }
            utils.callback_popup_message(xabber.getString("trust_verification_rejected"), 5000);
        });
        this.account.omemo.xabber_trust.clearData(this.sid);

    },

    enterCode: function () {
        let code = this.$('input[name="code_enter"]').val();
        if (!code){
            this.$('input[name="code_enter"]').addClass('invalid');
        } else {
            this.account.omemo.xabber_trust.handleAcceptedMsgBySid(this.sid, code);
        }
    },

    keyDownCode: function (ev) {
        let code = this.$('input[name="code_enter"]').val();
        if (ev && ev.keyCode === constants.KEY_ENTER && code)
            this.enterCode();
        this.$('.btn-enter-code').prop('disabled', !code)
    },

    cancel: function () {
        this.close();
    },

    openDevices: function () {
        if (this.contact) {
            this.close();
            let peer = this.account.omemo.getPeer(this.contact.get('jid'));
            peer.fingerprints.open();
        } else {
            this.close();
            if (xabber.accounts.length === 1 && xabber.body.screen.get('name') === 'settings-modal' && xabber.settings_modal_view.settings_single_account_modal) {
                let $elem = xabber.settings_modal_view.settings_single_account_modal.$(`.settings-tab[data-block-name="devices"]`);
                if ($elem.length)
                    xabber.settings_modal_view.settings_single_account_modal.jumpToBlock({target: $elem[0]});
            } else {
                this.account.showSettings(null, 'devices');
            }
        }
    },

    cancelSession: function () {
        this.close();
        if (!this.account.omemo || !this.account.omemo.xabber_trust)
            return;
        this.account.omemo.xabber_trust.cancelSession(this.sid, this.contact ? this.contact.get('jid') : this.account.get('jid'))
    },

    submit: function () {
        this.close();
    },

    onHide: function () {
        this.$el.detach();
    },

    close: function () {
        $(document).off(`keyup.session_keyup_close_${this.cid}`);
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
        this.account.trigger('xabber_trust_items_updated');
        if (!this.omemo)
            return;
        let trusted_devices = this.get('trusted_devices');

        Object.keys(trusted_devices).forEach((item) => {
            trusted_devices[item].forEach((device_item) => {
                if (device_item.untrusted){
                    this.omemo.deleteFingerprintTrust(item, device_item.device_id);
                } else{
                    this.omemo.updateFingerprints(item, device_item.device_id, device_item.fingerprint, true);
                }
            });
        });
        this.account.trigger('trusting_updated');
    },

    createFailedSessionMsg: function (jid, msg_text) {
        let contact = this.account.contacts.get(jid);

        let chat = this.account.chats.getChat(contact, 'encrypted');

        chat.messages.createSystemMessage({
            from_jid: jid,
            message: msg_text
        });
    },

    cancelSession: function (sid, to) {
        console.error('herrrreeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee');
        console.error(sid);
        console.error(to);

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
            stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Math.floor(Date.now() / 1000)});
            stanza.c('verification-failed', {reason: 'Session cancelled'}).up().up();

            stanza.up().up().up();
            stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

            this.account.sendFast(stanza, () => {
                if (to !== this.account.get('jid')){
                    let $stanza = $(stanza.tree());
                    $stanza.attr('to',this.account.get('jid'));
                    $stanza.find('notification forwarded message').attr('to',this.account.get('jid'));
                    $stanza.find(`addresses[xmlns="${Strophe.NS.ADDRESS}"] address[type="to"]`).attr('jid',this.account.get('jid'));
                    this.createFailedSessionMsg(to, 'Session cancelled');
                    this.account.sendFast(stanza, () => {
                    });
                }
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
            current_timestamp = Math.floor(Date.now() / 1000);
        if (!my_trusted_devices)
            return;

        my_saved_trusted_device = my_trusted_devices.filter(item => item.is_me || item.device_id == this.omemo.get('device_id'));

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
            .c('identity', {id: my_saved_trusted_device.device_id}).t(my_saved_trusted_device.fingerprint).up()
            .c('trusted-items', {timestamp: current_timestamp});

        my_trusted_devices.forEach((trusted_device) => {
            iq.c('trust', {timestamp: trusted_device.timestamp, xmlns: Strophe.NS.PUBSUB_TRUST_SHARING}).t(trusted_device.trusted_key).up();
        });

        let $trusted_items = $(iq.tree()).find('trusted-items');

        // console.log($trusted_items[0]);


        $trusted_items.find('trust').sort(function(a, b) {
            return +b.getAttribute('timestamp') - +a.getAttribute('timestamp');
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

            // console.error(trusted_string);

            let encoder = new TextEncoder(),
                trusted_string_text_buffer = encoder.encode(trusted_string);

            let signature = utils.curveSign(own_privkey, trusted_string_text_buffer);

            iq.up().c('signature').t(utils.ArrayBuffertoBase64(signature.buffer));

            // console.log(utils.ArrayBuffertoBase64(signature.buffer));

            // let own_pubkey = own_ik.pubKey;
            // if (own_pubkey.byteLength == 33)
            //     own_pubkey = own_pubkey.slice(1);
            // console.log(utils.ArrayBuffertoBase64(own_pubkey));
            // console.log(utils.ArrayBuffertoBase64(signature));

            // console.log(utils.curveVerify(own_pubkey, trusted_string_text_buffer, signature));
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
        stanza.c('share', {xmlns: Strophe.NS.PUBSUB_TRUST_SHARING, usage: Strophe.NS.OMEMO});

        // console.log(trusted_devices);
        let counter = 0;

        Object.keys(trusted_devices).forEach((item) => {
            if (item === this.account.get('jid'))
                return;
            stanza.c('trusted-items', {owner: item, timestamp: Math.floor(Date.now() / 1000)});
            trusted_devices[item].forEach((device_item) => {
                stanza.c('trust', {timestamp: Math.floor(Date.now() / 1000)}).t(device_item.trusted_key).up();
                counter++;
            });
            stanza.up();
        });
        if (counter === 0)
            return;

        let $share = $(stanza.tree()).find('share'),
            trusted_string = '';

        $share.children('trusted-items').sort(function(a, b) {
            return +b.getAttribute('timestamp') - +a.getAttribute('timestamp');
        }).appendTo($share);

        $share.children('trusted-items').each((idx, trusted_items) => {
            let $item = $(trusted_items);
            trusted_string = trusted_string + `${$item.attr('timestamp')}`;

            $item.find('trust').sort(function(a, b) {
                return +b.getAttribute('timestamp') - +a.getAttribute('timestamp');
            }).appendTo($item);
            $item.find('trust').each((idx, trust_item) => {
                let $trust = $(trust_item);
                trusted_string = trusted_string + `<${$trust.attr('timestamp')}/${$trust.text()}`;
            });

        });

        this.omemo.store.getIdentityKeyPair().then((own_ik) => {
            let own_privkey = own_ik.privKey;
            if (own_privkey.byteLength === 33)
                own_privkey = own_privkey.slice(1);

            // console.log(trusted_string);
            let encoder = new TextEncoder(),
                trusted_string_text_buffer = encoder.encode(trusted_string);

            let signature = utils.curveSign(own_privkey, trusted_string_text_buffer);

            stanza.c('signature').t(utils.ArrayBuffertoBase64(signature.buffer)).up();

            let my_trusted_devices = this.get('trusted_devices')[this.account.get('jid')],
                my_saved_trusted_device = my_trusted_devices.filter(item => item.is_me || item.device_id == this.omemo.get('device_id'));
            if (!my_saved_trusted_device.length)
                return;
            my_saved_trusted_device = my_saved_trusted_device[0];

            stanza.c('identity', {id: my_saved_trusted_device.device_id}).t(my_saved_trusted_device.fingerprint).up();

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
                final_stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                this.account.sendFast(final_stanza, () => {

                });
            })
        });


    },

    getTrustedDevices: function (to, device_id, callback) {
        let iq = $iq({type: 'get', to: to})
            .c('pubsub', {xmlns: Strophe.NS.PUBSUB})
            .c('items', {node: Strophe.NS.PUBSUB_TRUST_SHARING_ITEMS});
        device_id && iq.c('item', {id: device_id});

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
        let trusted_devices = this.get('trusted_devices');
        if (!Object.keys(trusted_devices).length) {
            let peer = this.omemo.getPeer(this.account.get('jid')),
                own_device = peer.devices[this.omemo.get('device_id')];
                if (!own_device){
                    this.account.once('devices_updated', () => {
                        this.populateOwnTrustedDevices()
                    });
                    peer && peer.updateDevicesKeys();
                    return;
                }

                this.getTrustedKey(own_device).then((trustedKeyBuffer) => {
                    // console.log(utils.ArrayBuffertoBase64(trustedKeyBuffer));
                    trusted_devices[this.account.get('jid')] = [
                        {
                            trusted_key: utils.ArrayBuffertoBase64(trustedKeyBuffer),
                            fingerprint: own_device.get('fingerprint'),
                            timestamp: Math.floor(Date.now() / 1000),
                            device_id: own_device.get('id'),
                            is_me: true,
                            public_key: utils.ArrayBuffertoBase64(own_device.get('ik'))
                        }];
                    this.save('trusted_devices', trusted_devices);
                    this.trigger('trust_updated');
                    this.publishOwnTrustedDevices();
                }).catch((err) => {
                    console.error(err);
                });
        } else {
            this.publishOwnTrustedDevices();
        }
    },

    fixMyTrustedDeviceAndPublish: function (callback) { //34
        let trusted_devices = this.get('trusted_devices'),
            own_trusted_devices =  trusted_devices[this.account.get('jid')];

        if (!own_trusted_devices){
            trusted_devices[this.account.get('jid')] = [];
            this.set('trusted_devices', trusted_devices);
        }

        let own_trusted_device = own_trusted_devices.find(item => item.device_id == this.omemo.get('device_id') && !item.is_me);

        console.error('fixMyTrustedDeviceAndPublish');
        console.error(own_trusted_device);

        if (own_trusted_device){

            let peer = this.omemo.getPeer(this.account.get('jid')),
                own_device = peer.devices[this.omemo.get('device_id')];
            if (!own_device){
                console.error('STILL NO DEVICE????');
                return;
            }

            this.getTrustedKey(own_device).then((trustedKeyBuffer) => {
                own_trusted_device = this.get('trusted_devices')[this.account.get('jid')].find(item => item.device_id == this.omemo.get('device_id') && !item.is_me);

                if (!own_trusted_device){
                    console.error('FIXED ALREADY AND PUBLISHED');
                    this.publishOwnTrustedDevices(callback);
                    return;
                }

                let updated_trusted_devices = this.get('trusted_devices'),
                    index = updated_trusted_devices[this.account.get('jid')].indexOf(own_trusted_device);

                own_trusted_device = {
                    trusted_key: utils.ArrayBuffertoBase64(trustedKeyBuffer),
                    fingerprint: own_device.get('fingerprint'),
                    timestamp: Math.floor(Date.now() / 1000),
                    device_id: own_device.get('id'),
                    is_me: true,
                    public_key: utils.ArrayBuffertoBase64(own_device.get('ik'))
                };
                updated_trusted_devices[this.account.get('jid')][index] = own_trusted_device;
                this.save('trusted_devices', updated_trusted_devices);
                this.trigger('trust_updated');
                console.error('FIXED AND PUBLISHED');
                this.publishOwnTrustedDevices(callback);
            }).catch((err) => {
                console.error(err);
            });
        } else {
            console.error('NO FIX NEEDED');
            this.publishOwnTrustedDevices(callback);
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
                device.fillDeviceIK();
            } else {
                dfd.resolve()
            }

        });
    },

    getVerificationState: function (session, chat_content) {
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
        // } else if (step === '0b' && chat_content){
        //     state = xabber.getString("chat_content__incoming_session_text");
        } else if (step === '0b'){
            state = xabber.getString("verification_session_state__request_answer_needed");
        }

        return state;
    },

    getVerificationStateOwn: function (session) {
        let state,
            step = session.verification_step;
        if (step === '1a' && session.active_verification_device && session.active_verification_device.device_id){
            state = xabber.getString("verification_session_state__own_request_code_needed");
        } else if (step === '1a'){
            state = xabber.getString("verification_session_state__own_request_send");
        } else if (step === '1b'){
            state = xabber.getString("verification_session_state__own_request_answered");
        } else if (step === '2a' || step === '2b'){
            state = xabber.getString("verification_session_state__request_proceeding");
        } else if (step === '0b'){
            state = xabber.getString("verification_session_state__own_request_answer_needed");
        }

        return state;
    },

    getVerificationStateLabel: function (session) {
        let state,
            step = session.verification_step;
        if (step === '1a' && session.active_verification_device && session.active_verification_device.device_id){
            state = xabber.getString("verification_session_state__outgoing_label");
        } else if (step === '1a'){
            state = xabber.getString("verification_session_state__outgoing_label");
        } else if (step === '1b'){
            state = xabber.getString("verification_session_state__incoming_label");
        } else if (step === '2a'){
            state = xabber.getString("verification_session_state__outgoing_label");
        } else if (step === '2b' || step === '0b'){
            state = xabber.getString("verification_session_state__incoming_label");
        }

        return state;
    },

    getVerificationStateContactLabel: function (session) {
        let state,
            step = session.verification_step;
        if (step === '1a' && session.active_verification_device && session.active_verification_device.device_id){
            state = xabber.getString("verification_session_state__verification_in_progress_label");
        } else if (step === '1a'){
            state = xabber.getString("verification_session_state__verification_in_progress_label");
        } else if (step === '1b'){
            state = xabber.getString("verification_session_state__verification_in_progress_label");
        } else if (step === '2a'){
            state = xabber.getString("verification_session_state__verification_in_progress_label");
        } else if (step === '2b'){
            state = xabber.getString("verification_session_state__verification_in_progress_label");
        } else if (step === '0b'){
            state = xabber.getString("verification_session_state__contact_request_answer_needed_label");
        }

        return state;
    },

    clearData: function (sid) {
        // console.error('here')
        let active_sessions = this.get('active_trust_sessions');
        if (this.account.notifications_content){
            this.account.notifications_content.updateTrustSession(sid, true);
        }

        delete(active_sessions[sid]);

        this.save('active_trust_sessions', active_sessions);
        this.updateVerificationData();
        this.addEndedSessionsData(sid);
        this.account.trigger('active_session_change');
        xabber.toolbar_view.recountAllMessageCounter();
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
        this.account.trigger('active_session_change');
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

        this.account.trigger('verification_session_data_update');


        Object.keys(active_sessions).forEach((session_id) => {
            let session = active_sessions[session_id],
                session_data = {};

            if (session.msg_ttl && Number(session.msg_ttl) && session.message_timestamp && Number(session.message_timestamp)){
                let current_timestamp = Math.floor(Date.now()/1000),
                    time_diff = current_timestamp - session.message_timestamp;
                // console.error(active_sessions);
                // console.error(this.get('active_trust_sessions'));
                // console.error(time_diff);

                if (time_diff >= session.msg_ttl){
                    this.cancelSession(session_id, session.session_check_jid);
                    return;
                } else {
                    let remaining_time = (session.msg_ttl - time_diff) * 1000;
                    // console.error(remaining_time);
                    let deletion_timeout = setTimeout(() => {
                        // console.error('deleted by timeout: ' + session_id);
                        this.cancelSession(session_id, session.session_check_jid);
                    }, remaining_time);
                    this.account.once('verification_session_data_update', () => {
                        clearTimeout(deletion_timeout);
                    });
                }
            }

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

            session_data.session_check_jid = session.session_check_jid;

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
            total_count = $message.find('share trusted-items trust').length,
            device_fingerprint = $message.find('share identity').text();

        let my_trusted_devices = this.get('trusted_devices')[this.account.get('jid')];

        // console.log(received_device_id);
        // console.log(device_fingerprint);
        // console.log(my_trusted_devices.some(e => e.device_id == received_device_id && e.fingerprint == device_fingerprint));
        // console.error(message);

        if (my_trusted_devices.some(e => e.device_id == received_device_id && e.fingerprint == device_fingerprint)){

            let this_trusted_device = my_trusted_devices.find(e => e.device_id == received_device_id && e.fingerprint == device_fingerprint),
                $whole_notification_msg = $message.parent().closest('message');

            if (!$whole_notification_msg.length)
                return;
            let msg_timestamp = $whole_notification_msg.children('time').attr('stamp');
            if (!msg_timestamp)
                return;
            msg_timestamp = Date.parse(msg_timestamp);
            if (!msg_timestamp)
                return;

            if (this_trusted_device.last_parsed_contacts_devices_timestamp && msg_timestamp <= this_trusted_device.last_parsed_contacts_devices_timestamp)
                return;

            let $share = $message.find('share'),
                trusted_item_signature = $share.find('signature').text(),
                trusted_string = '',
                is_signature_verified,
                identity_device_id;

            if (!$share.find('identity').length)
                return;


            identity_device_id = $share.find('identity').attr('id');

            // console.log(identity_device_id);
            // console.log(options.device_id);

            if (options.device_id != identity_device_id)
                return;


            $share.children('trusted-items').sort(function(a, b) {
                return +b.getAttribute('timestamp') - +a.getAttribute('timestamp');
            }).appendTo($share);

            $share.children('trusted-items').each((idx, trusted_items) => {
                let $item = $(trusted_items);
                trusted_string = trusted_string + `${$item.attr('timestamp')}`;

                $item.find('trust').sort(function(a, b) {
                    return +b.getAttribute('timestamp') - +a.getAttribute('timestamp');
                }).appendTo($item);
                $item.find('trust').each((idx, trust_item) => {
                    let $trust = $(trust_item);
                    trusted_string = trusted_string + `<${$trust.attr('timestamp')}/${$trust.text()}`;
                });

            });

            let encoder = new TextEncoder(),
                trusted_string_text_buffer = encoder.encode(trusted_string);

            let item_device = this.omemo.own_devices[identity_device_id];
            // console.log(trusted_string);
            // console.log(item_device);
            if (!item_device)
                return;

            let item_public_key = item_device.get('ik');

            // console.log(item_public_key);

            if (!item_public_key){
                return;
            }

            if (item_public_key.byteLength === 33)
                item_public_key = item_public_key.slice(1);
            // console.log(identity_device_id);
            // console.log(trusted_string);
            // console.log(utils.ArrayBuffertoBase64(item_public_key));
            // console.log(trusted_item_signature);

            is_signature_verified = utils.curveVerify(item_public_key, trusted_string_text_buffer, new Uint8Array(utils.fromBase64toArrayBuffer(trusted_item_signature)));

            // console.log(is_signature_verified);

            if (!is_signature_verified)
                return;

            $share.children('trusted-items').each((idx, key_owner) => {
                // console.log(key_owner);
                let $key_owner = $(key_owner),
                    jid = $key_owner.attr('owner');
                // console.log(key_owner);
                $key_owner.children('trust').each((idx, trust_item) => {
                    // console.log(trust_item);
                    let $trust_item = $(trust_item),
                        trusted_key = $trust_item.text();

                    let trustedKeyString = atob(trusted_key);

                    let device_id = trustedKeyString.split('::')[0];

                    // console.log(trusted_key);
                    // console.log(jid);
                    // console.log(jid);
                    // console.log(identity_device_id);
                    let dfd = new $.Deferred();

                    dfd.done((is_new) => {
                        // console.log(is_new);
                        counter++;
                        if (is_new)
                            is_new_devices = true;

                        if (counter === total_count){

                            let updated_trusted_devices = this.get('trusted_devices'),
                                index = updated_trusted_devices[this.account.get('jid')].indexOf(this_trusted_device);
                            this_trusted_device.last_parsed_contacts_devices_timestamp = msg_timestamp;
                            updated_trusted_devices[this.account.get('jid')][index] = this_trusted_device;
                            this.save('trusted_devices', updated_trusted_devices);
                            if (is_new_devices){
                                this.publishContactsTrustedDevices();
                            }
                            else {
                                // console.log('no new devices')
                            }
                        }
                    });

                    this.addNewContactsDevice(trusted_key, jid, device_id, identity_device_id, dfd);
                });

            });
        }

    },

    addNewContactsDevice: function (trusted_key, jid, device_id, from_device_id, counter_dfd) {
        let peer = this.omemo.getPeer(jid);
        // console.log(peer);
        if (!peer)
            counter_dfd.resolve();
        let device = peer.devices[device_id],
            trusted_devices = this.get('trusted_devices'),
            dfd = new $.Deferred();

        dfd.done(() => {
            device = peer.devices[device_id];
            if (!device){
                counter_dfd.resolve();
            }
            if (trusted_devices[jid] && _.isArray(trusted_devices[jid])){
                if (!trusted_devices[jid].some(e => e.trusted_key === trusted_key)){
                    trusted_devices[jid].push({
                        trusted_key: trusted_key,
                        from_device_id: from_device_id,
                        trust_reason_jid: this.account.get('jid'),
                        fingerprint: device.get('fingerprint'),
                        device_id: device.get('id'),
                        timestamp: Math.floor(Date.now() / 1000),
                        public_key: utils.ArrayBuffertoBase64(device.get('ik'))
                    });
                } else {
                    counter_dfd.resolve();
                }
            } else {
                trusted_devices[jid] = [{
                    trusted_key: trusted_key,
                    from_device_id: from_device_id,
                    trust_reason_jid: this.account.get('jid'),
                    fingerprint: device.get('fingerprint'),
                    device_id: device.get('id'),
                    timestamp: Math.floor(Date.now() / 1000),
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

            counter_dfd.resolve(true);

        });
        // console.log(device);
        if (!device){
            if (!Object.keys(peer.devices).length){
                peer.getDevicesNode(dfd);
            }
        } else {
            dfd.resolve()
        }


    },

    getNewTrustedDevices: function (trusted_devices, $message, final_trusted_devices, is_first, peer) {
        // console.error('here');
        // console.error(this.omemo.own_devices.length);
        // peer && console.error(peer);
        // peer && console.error(peer.devices);
        let new_trusted_devices = [],
            counter = 0,
            was_removed;
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


                // console.log(item_fingerprint);
                // console.log(item_device_id);
                // console.log(item_device);
                // console.log(this.omemo.own_devices);
                if (item_device){
                    trusted_devices[idx] = {
                        trusted_key: item.trusted_key,
                        from_device_id: item.from_device_id,
                        trust_reason_jid: item.trust_reason_jid,
                        timestamp: Math.floor(Date.now() / 1000),
                        fingerprint: item_fingerprint,
                        device_id: item_device_id,
                        public_key: utils.ArrayBuffertoBase64(item_device.get('ik'))
                    };
                } else {
                    trusted_devices[idx] = null;
                    was_removed = true;
                }
                // console.log(idx);
                // console.log(trusted_devices[idx]);

            });
        }
        trusted_devices = trusted_devices.filter(Boolean);
        final_trusted_devices = final_trusted_devices.concat(trusted_devices);
        // console.log(trusted_devices);
        // console.log(final_trusted_devices);

        if (!trusted_devices.length && !is_first && final_trusted_devices.length && was_removed){
            let saved_trusted_devices = this.get('trusted_devices');
            if (peer) {
                if (final_trusted_devices.length === saved_trusted_devices[peer.get('jid')].length)
                    return;
                saved_trusted_devices[peer.get('jid')] = final_trusted_devices;
            } else {
                if (final_trusted_devices.length === saved_trusted_devices[this.account.get('jid')].length)
                    return;
                saved_trusted_devices[this.account.get('jid')] = final_trusted_devices;//
            }
            // console.error(saved_trusted_devices[this.account.get('jid')]);
            // console.error(saved_trusted_devices);
            this.save('trusted_devices', saved_trusted_devices);
            this.trigger('trust_updated');
            if (peer){
                this.publishContactsTrustedDevices();
            } else {
                this.fixMyTrustedDeviceAndPublish();
            }
        }

        trusted_devices.forEach((item) => {
            let dfd = $.Deferred();

            dfd.done(() => {
                counter++;
                // console.log(counter);
                // console.log(trusted_devices.length);
                // console.log(counter === trusted_devices.length);

                if (counter === trusted_devices.length) {
                    // console.error(trusted_devices);
                    // console.log(final_trusted_devices);
                    // console.log(new_trusted_devices);
                    // console.log(new_trusted_devices.length);

                    // new_trusted_devices.forEach((test_item) => {
                    //     console.log(test_item);
                    // });

                    new_trusted_devices = new_trusted_devices.filter(Boolean);
                    // console.log(new_trusted_devices);
                    // console.log(new_trusted_devices.length);

                    if (new_trusted_devices.length){
                        this.getNewTrustedDevices(new_trusted_devices, $message, final_trusted_devices, null, peer)
                    } else {
                        // console.log(final_trusted_devices);
                        // console.log(!is_first);
                        if (!is_first){
                            let saved_trusted_devices = this.get('trusted_devices');
                            if (peer) {
                                saved_trusted_devices[peer.get('jid')] = final_trusted_devices;
                            } else {
                                saved_trusted_devices[this.account.get('jid')] = final_trusted_devices;//
                            }
                            // console.error(saved_trusted_devices[this.account.get('jid')]);
                            // console.error(saved_trusted_devices);
                            this.save('trusted_devices', saved_trusted_devices);
                            this.trigger('trust_updated');
                            if (peer){
                                this.publishContactsTrustedDevices();
                            } else {
                                this.fixMyTrustedDeviceAndPublish();
                            }
                        }
                    }
                }
            });

            if (item.is_me || item.device_id == this.omemo.get('device_id')){
                // console.error('herer');
                dfd.resolve();
                return;
            }
            let trustedKeyString = atob(item.trusted_key);

            if (trustedKeyString.split('::').length !== 2){
                // console.error('herer');
                dfd.resolve();
                return;
            }

            let item_device_id = trustedKeyString.split('::')[0],
                item_device_fingerprint = trustedKeyString.split('::')[1],
                item_device = peer ? peer.devices[item_device_id] : this.omemo.own_devices[item_device_id];

            // console.log(item_device_fingerprint);
            // console.log(item_device_id);
            // console.log(item_device);

            if (!item_device){
                // console.error('herer');
                dfd.resolve();
                return;
            }

            let item_public_key = item_device.get('ik');

            // console.log(item_public_key);
            if (!item_public_key){
                // console.error('herer');
                dfd.resolve();
                return;
            }

            if (item_public_key.byteLength === 33)
                item_public_key = item_public_key.slice(1);

            let $item = $message.find(`item[id="${item_device_id}"]`);
            // console.log($item);
            // console.log($item[0]);
            // console.log($item.find('identity').length);
            // console.log(item_device_fingerprint);
            // console.log($item.find('identity').text());
            // console.log($item.find('identity').text() != item_device_fingerprint);

            if (!$item.length || !$item.find('identity').length || $item.find('identity').text() != item_device_fingerprint){
                // console.error('herer');
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
                return +b.getAttribute('timestamp') - +a.getAttribute('timestamp');
            }).appendTo($trusted_items);

            let trusted_string = `${$trusted_items.attr('timestamp')}`;

            // console.log($trusted_items.find('trust'));
            $trusted_items.find('trust').each((idx, trust_item) => {
                let $item = $(trust_item);
                trusted_string = trusted_string + `<${$item.attr('timestamp')}/${$item.text()}`;
            });

            let encoder = new TextEncoder(),
                trusted_string_text_buffer = encoder.encode(trusted_string);
            // console.log(trusted_string);
            //
            // console.log(item_device);
            // console.log(utils.ArrayBuffertoBase64(item_public_key));
            // console.log(trusted_item_signature);

            let is_signature_verified = utils.curveVerify(item_public_key, trusted_string_text_buffer, new Uint8Array(utils.fromBase64toArrayBuffer(trusted_item_signature)));

            // console.log(is_signature_verified);
            if (is_signature_verified){

                $trusted_items.find('trust').each((idx, trust_item) => {

                    let $trust_item = $(trust_item);

                    // console.log($trust_item.text());
                    // console.log(final_trusted_devices);
                    // console.log(final_trusted_devices.filter(e => e.trusted_key === $trust_item.text()));
                    // console.log(final_trusted_devices.filter(e => e.trusted_key === $trust_item.text()).length);
                    // console.log(!(final_trusted_devices.filter(e => e.trusted_key === $trust_item.text()).length > 0));
                    // console.log(!devices_to_remove.includes($trust_item.text()));
                    // console.log(Boolean(!(final_trusted_devices.filter(e => e.trusted_key === $trust_item.text()).length > 0) && !devices_to_remove.includes($trust_item.text())));

                    if (!(final_trusted_devices.filter(e => e.trusted_key === $trust_item.text()).length > 0) && !devices_to_remove.includes($trust_item.text())){
                        let trusted_new_saved_device = {
                            trusted_key: $trust_item.text(),
                            from_device_id: item_device_id,
                            trust_reason_jid: peer ? peer.get('jid') : this.account.get('jid'),
                        };
                        new_trusted_devices.push(trusted_new_saved_device);
                        // console.log(new_trusted_devices);
                        // console.log(new_trusted_devices.length);
                    }
                });
                // console.log(new_trusted_devices);
                // console.log(new_trusted_devices.length);

                // console.error('herer');
                dfd.resolve();
            } else {
                // подпись неверна
                // console.error(final_trusted_devices.length);
                // final_trusted_devices.filter(i => i.trusted_key !== item.trusted_key).length && console.error(final_trusted_devices.filter(i => i.trusted_key !== item.trusted_key));
                // final_trusted_devices.filter(i => i.trusted_key !== item.trusted_key).length && console.error(final_trusted_devices.filter(i => i.trusted_key !== item.trusted_key)[0]);
                final_trusted_devices = final_trusted_devices.filter(i => i.trusted_key !== item.trusted_key);

                // console.error(final_trusted_devices.length);

                devices_to_remove.push(item.trusted_key);
                // console.error('herer');
                dfd.resolve();
            }
        });
    },

    receivePubSubMessage: function ($message) {
        // console.error($message);
        // console.error($message[0]);
        if (Strophe.getBareJidFromJid($message.attr('from')) === this.account.get('jid')){
            // this.getTrustedDevices(this.account.get('jid'), null, (res) => {

                let my_trusted_devices = this.get('trusted_devices')[this.account.get('jid')];

                // console.log(my_trusted_devices);
                // console.log(res);
                my_trusted_devices && my_trusted_devices.length && this.getNewTrustedDevices(my_trusted_devices, $message, null, true);
            // });
        } else {
            let from = Strophe.getBareJidFromJid($message.attr('from')),
                device_id;
            if (this.get('trusted_devices')[from] && this.get('trusted_devices')[from].length){
                // this.getTrustedDevices(from, device_id, (res) => {

                    let contact_trusted_devices = this.get('trusted_devices')[from],
                        // $all_items_msg = $(res),
                        peer = this.omemo.getPeer(from);
                    this.getNewTrustedDevices(contact_trusted_devices, $message, null, true, peer);
                // });

            }
        }
    },

    getContactsTrustedDevices: function (to, device_id) {
        // console.error(to);
        // console.error(device_id);
        this.getTrustedDevices(to, device_id, (res) => {
            // console.log(res);

            let contact_trusted_devices = this.get('trusted_devices')[to],
                $all_items_msg = $(res),
                peer = this.omemo.getPeer(to);
            // console.log(peer);
            // console.log(res);
            // console.log(contact_trusted_devices);
            this.getNewTrustedDevices(contact_trusted_devices, $all_items_msg, null, true, peer);
        });
    },

    removeAfterHandle: function (message) {
        // console.log(message);
        if (!message.collection || !message.collection.chat)
            return;
        let chat = message.collection.chat;
        chat.retractMessages([message], false, true);

    },

    handleAcceptedMsgBySid: function (sid, code) {
        let active_sessions = this.get('active_trust_sessions');

        if (active_sessions[sid]){
            let session = active_sessions[sid];
            if (session.verification_accepted_msg_xml){
                this.account.omemo.xabber_trust.receiveTrustVerificationMessage(session.verification_accepted_msg_xml, {
                    forced_code: code,
                });
            }
        }

    },

    isDeviceTrusted: function (jid, device_id) {
        let trusted_devices = this.get('trusted_devices');
        if (!trusted_devices[jid])
            return false;
        if (trusted_devices[jid].some(e => e.device_id === device_id))
            return true;

        return false;
    },

    receiveTrustVerificationHeadline: function (message) {
        let $message = $(message),
            sid = $message.find('authenticated-key-exchange').attr('sid');
        if (this.active_sessions_data[sid]){
            if (!this.active_sessions_data[sid].verification_step){
                this.clearData(sid);
            } else if ($message.find(`verification-accepted`).length && $message.find(`verification-accepted`).attr('device-id') != this.omemo.get('device_id')) {
                this.clearData(sid);
            }
        }
    },

    isActiveSessionWithJid: function (jid, original_sid) {
        if (!jid)
            return false;
        if (this.get('active_trust_sessions')[original_sid])
            return false;
        let active_sessions = this.get('active_trust_sessions'),
            sessions_with_jid = Object.values(active_sessions).filter(item => item.session_check_jid && item.session_check_jid === jid);

        if (sessions_with_jid.length){
            sessions_with_jid.forEach((session) => {
                let sid = Object.keys(active_sessions).find(key => active_sessions[key] === session);
                if (sid){
                    // console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                    // console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
                    // console.error(original_sid);
                    // console.error(sid);
                    // console.error(jid);
                    this.cancelSession(sid, jid);
                }
            });
        }
    },

    receiveTrustVerificationMessage: function (message, options) {
        if (!this.account.server_features.get(Strophe.NS.XABBER_NOTIFY))
            return;
        let $message = $(message),
            sid = $message.find('authenticated-key-exchange').attr('sid'),
            type = $message.attr('type');
        if (type === 'headline')
            return this.receiveTrustVerificationHeadline(message);
        // console.error(message);
        let contact = this.account.contacts.get(Strophe.getBareJidFromJid($message.attr('from')));

        if (Strophe.getBareJidFromJid($message.attr('from')) === this.account.get('jid'))
            contact = undefined;

        console.log(sid);
        // console.log(contact);
        // console.log(options);
        console.log(message);
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
            if ($message.find('verification-failed').length || $message.find('verification-rejected').length){
                // console.log($message.find('verification-failed').attr('reason'));
                this.clearData(sid);
                contact && this.createFailedSessionMsg(contact.get('jid'), $message.find('verification-failed').attr('reason') || $message.find('verification-rejected').attr('reason'));
                return;
            }
        } else {
            if ($message.find('verification-failed').length || $message.find('verification-rejected').length || $message.find('verification-successful').length){
                this.clearData(sid);
                return;
            }
        }

        this.active_sessions_data[sid] && console.log(this.active_sessions_data[sid].session_check_jid);
        if (this.active_sessions_data[sid]
            && (this.active_sessions_data[sid].session_check_jid === Strophe.getBareJidFromJid($message.attr('to'))) && !this.active_sessions_data[sid].verification_started){
            if ($message.find(`verification-accepted`).length && $('#modals').find('.modal.modal-verification-start').length){
                let $verifcationStartModal = $('#modals').find('.modal.modal-verification-start');  // change to close opened request view
                $verifcationStartModal.find('.btn-cancel').click();
                return;
            } else if ($message.find(`verification-accepted`).length && $message.find(`verification-accepted`).attr('device-id') != this.omemo.get('device_id')) {
                this.clearData(sid);
            }
        }

        if (contact){
            if ($message.find('verification-start').length && $message.find('verification-start').attr('device-id') && this.omemo.get('device_id') && options.automated){
                if (this.isDeviceTrusted(contact.get('jid'), $message.find('verification-start').attr('device-id')))
                    return;

                let msg_timestamp = $message.find('authenticated-key-exchange').attr('timestamp'),
                    ttl;
                if (msg_timestamp)
                    ttl = $message.find('verification-start').attr('ttl');

                let ended_sessions = this.get('ended_sessions');
                if (ended_sessions.includes(sid)){
                    options.msg_item && this.removeAfterHandle(options.msg_item);
                    return;
                }
                let is_active_session_jid = this.isActiveSessionWithJid(contact.get('jid'), sid);
                if (is_active_session_jid)
                    return;
                let peer = this.omemo.getPeer(contact.get('jid')),
                    device = peer.devices[$message.find('verification-start').attr('device-id')];
                if (!device){
                    peer.updateDevicesKeys();
                }
                let chat = this.account.chats.get(contact.hash_id + ':encrypted');
                if (!chat){
                    chat = this.account.chats.getChat(contact, 'encrypted');
                    chat.set('timestamp', moment.now());
                    chat.item_view.updateLastMessage();
                    if (!chat.item_view.content){
                        chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                    }
                    chat.item_view.content.bottom.updateEncrypted();
                }
                // console.log({message});
                this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                    session_check_jid: contact.get('jid'),
                    session_check_device_id: $message.find('verification-start').attr('device-id'),
                    incoming_request_data: {
                        message: message.outerHTML,
                        message_options: options,
                    },
                    verification_step: '0b',
                    msg_ttl: ttl,
                    message_timestamp: msg_timestamp,
                });
            }
            if ($message.find('verification-start').length && $message.find('verification-start').attr('device-id') && this.omemo.get('device_id') && !options.automated){
                this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                    current_a_jid: contact.get('jid'),
                    active_verification_device: {
                        peer_jid: contact.get('jid'),
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
                    options.msg_item && this.removeAfterHandle(options.msg_item);
                }
                if (this.active_sessions_data[sid].verification_step === '1a' && !options.automated)
                    this.handleTrustVerificationSigned($message, contact, null, null, options.forced_code);
                return;
            }
            if (this.active_sessions_data[sid] && this.active_sessions_data[sid].active_verification_code){
                let dfd = new $.Deferred();
                dfd.done(() => {
                    if ($message.find('hash').length && $message.find('salt').length && this.active_sessions_data[sid].verification_step === '1b'){
                        this.handleTrustVerificationCodeHash($message, contact, options.msg_item);
                        return;
                    }
                    if ($message.find('hash').length && !$message.find('salt').length && this.active_sessions_data[sid].verification_step === '2a'){
                        this.handleTrustVerificationFinalHash($message, contact, options.msg_item);
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
            if ($message.find('verification-start').length && $message.find('verification-start').attr('device-id') && this.omemo.get('device_id') && options.automated){
                if (this.isDeviceTrusted(this.account.get('jid'), $message.find('verification-start').attr('device-id')) && !$message.find('verification-start').attr('to-device-id'))
                    return;

                let msg_timestamp = $message.find('authenticated-key-exchange').attr('timestamp'),
                    ttl;
                if (msg_timestamp)
                    ttl = $message.find('verification-start').attr('ttl');
                let ended_sessions = this.get('ended_sessions');

                if (ended_sessions.includes(sid)){
                    options.msg_item && this.removeAfterHandle(options.msg_item);
                    return;
                }

                if ($message.find('verification-start').attr('to-device-id') && $message.find('verification-start').attr('to-device-id') != this.omemo.get('device_id'))
                    return;

                if ($message.find('verification-start').attr('device-id') == this.omemo.get('device_id'))
                    return;

                let is_active_session_jid = this.isActiveSessionWithJid(this.account.get('jid'), sid);
                if (is_active_session_jid)
                    return;

                let peer = this.omemo.getPeer(this.account.get('jid')),
                    device = peer.devices[$message.find('verification-start').attr('device-id')];
                if (!device){
                    peer.updateDevicesKeys();
                }
                this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                    session_check_jid: this.account.get('jid'),
                    session_check_device_id: $message.find('verification-start').attr('device-id'),
                    incoming_request_data: {
                        message: message.outerHTML,
                        message_options: options,
                    },
                    verification_step: '0b',
                    msg_ttl: ttl,
                    message_timestamp: msg_timestamp,
                });
                if (!$('#modals').find('.code-modal').length){
                    let view = new xabber.ActiveSessionModalView();
                    view.show({
                        account: this.account,
                        sid: sid,
                        device_id: $message.find('verification-start').attr('device-id')
                    });
                }
                // let view = new xabber.IncomingTrustSessionView();
                // view.show({
                //     account: this.account,
                //     trust: this,
                //     message: message,
                //     message_options: options,
                //     contact: null,
                //     sid: sid
                // });
            }
            if ($message.find('verification-start').length && $message.find('verification-start').attr('device-id') && this.omemo.get('device_id') && !options.automated){
                // console.log(this.omemo.get('device_id'));
                // console.log($message.find('verification-start').attr('to-device-id'));
                if ($message.find('verification-start').attr('to-device-id') && $message.find('verification-start').attr('to-device-id') != this.omemo.get('device_id'))
                    return;
                let device = this.omemo.own_devices[$message.find('verification-start').attr('device-id')];
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
                    options.msg_item && this.removeAfterHandle(options.msg_item);
                }
                if (this.active_sessions_data[sid].verification_step === '1a' && !options.automated)
                    this.handleTrustVerificationSigned($message, null, true, null, options.forced_code);

                if (options.automated && !$('#modals').find('.code-modal').length){
                    let view = new xabber.ActiveSessionModalView();
                    view.show({
                        account: this.account,
                        sid: sid,
                        device_id: $message.find(`verification-accepted`).attr('device-id')
                    });
                }
                return;
            }
            if (this.active_sessions_data[sid] && this.active_sessions_data[sid].active_verification_code){
                let dfd = new $.Deferred();
                dfd.done(() => {
                    if ($message.find('hash').length && $message.find('salt').length && this.active_sessions_data[sid].verification_step === '1b'){
                        this.handleTrustVerificationCodeHash($message, null, options.msg_item);
                        return;
                    }
                    if ($message.find('hash').length && !$message.find('salt').length && this.active_sessions_data[sid].verification_step === '2a'){
                        this.handleTrustVerificationFinalHash($message, null, options.msg_item);
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
                        let timeout;
                        device.on('change:ik', () => {
                            clearTimeout(timeout);
                            dfd.resolve();
                        });
                        timeout = setTimeout(() => {
                            device.getBundle().then(({pk, spk, ik}) => {
                                device.set('ik', utils.fromBase64toArrayBuffer(ik));
                                device.set('fingerprint', device.generateFingerprint());
                            });
                        }, 1000);
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
            code = utils.randomNumberCode(6),
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
                        stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Math.floor(Date.now() / 1000)});
                        stanza.c('verification-accepted', {'device-id': this.account.omemo.get('device_id')}).up();
                        stanza.c('salt').c('ciphertext').t(response.data).up().c('iv').t(response.iv).up().up().up();
                        stanza.up().up().up();
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
                            if (contact){
                                let $stanza = $(stanza.tree());
                                $stanza.attr('to',this.account.get('jid'));
                                let $msg = $stanza.find('notification forwarded message');
                                $msg.attr('to',this.account.get('jid'));
                                $msg.attr('type', 'headline');
                                $msg.children('body').remove();
                                $msg.find('verification-accepted').attr('device-id', this.account.omemo.get('device_id'));
                                $msg.find('salt').remove();
                                $stanza.find(`addresses[xmlns="${Strophe.NS.ADDRESS}"] address[type="to"]`).attr('jid',this.account.get('jid'));
                                this.account.sendFast(stanza, () => {
                                });
                            }
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

    handleTrustVerificationSigned: function ($message, contact, is_own, msg_item, forced_code) {
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
                if (forced_code){
                    // console.error(forced_code);
                    let code = forced_code;

                    this.decryptTrustBuffer(iv, data, curve, code).then((decrypted_response) => {
                        this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                            b_payload: utils.ArrayBuffertoBase64(decrypted_response.decryptedBuffer),
                        });

                        this.generateVerificationArrayBuffer(devices_IK.device_pubkey, devices_IK.own_privkey, code).then((response) => {

                            this.getTrustedKey(this.omemo.own_devices[this.omemo.get('device_id')]).then((trustedKeyBuffer) => {
                                console.log('trustedKeyBuffer');
                                console.log(trustedKeyBuffer);
                                console.log('code');
                                console.log(code);
                                console.log('decrypted_response.decryptedBuffer');
                                console.log(decrypted_response.decryptedBuffer);
                                console.log('decrypted_response.encryptionKeyHash');
                                console.log(decrypted_response.encryptionKeyHash);
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
                                    stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Math.floor(Date.now() / 1000)});

                                    stanza.c('salt').c('ciphertext').t(response.data).up().c('iv').t(response.iv).up().up();
                                    stanza.c('hash', {xmlns: Strophe.NS.HASH, algo: 'sha-256'});
                                    stanza.c('ciphertext').t(hash_response.data).up().c('iv').t(hash_response.iv).up().up().up();
                                    stanza.up().up().up();
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

                                    msg_item && this.removeAfterHandle(msg_item);
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
                        stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Math.floor(Date.now() / 1000)});
                        stanza.c('verification-failed', {reason: 'Data decryption failed'}).up().up();

                        stanza.up().up().up();
                        stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                        msg_item && this.removeAfterHandle(msg_item);
                        this.account.sendFast(stanza, () => {
                            if (contact){
                                let $stanza = $(stanza.tree());
                                $stanza.attr('to',this.account.get('jid'));
                                $stanza.find('notification forwarded message').attr('to',this.account.get('jid'));
                                $stanza.find(`addresses[xmlns="${Strophe.NS.ADDRESS}"] address[type="to"]`).attr('jid',this.account.get('jid'));
                                contact && this.createFailedSessionMsg(contact.get('jid'), 'Data decryption failed');
                                this.account.sendFast(stanza, () => {
                                });
                            }
                            // console.log(stanza);
                            // console.log(stanza.tree());
                            utils.callback_popup_message(xabber.getString("trust_verification_decrypt_failed"), 5000);
                        });
                        this.clearData(sid);
                    });

                } else {
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
                                            stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Math.floor(Date.now() / 1000)});

                                            stanza.c('salt').c('ciphertext').t(response.data).up().c('iv').t(response.iv).up().up();
                                            stanza.c('hash', {xmlns: Strophe.NS.HASH, algo: 'sha-256'});
                                            stanza.c('ciphertext').t(hash_response.data).up().c('iv').t(hash_response.iv).up().up().up();
                                            stanza.up().up().up();
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

                                            msg_item && this.removeAfterHandle(msg_item);
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
                                stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Math.floor(Date.now() / 1000)});
                                stanza.c('verification-failed', {reason: 'Data decryption failed'}).up().up();

                                stanza.up().up().up();
                                stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                                msg_item && this.removeAfterHandle(msg_item);
                                this.account.sendFast(stanza, () => {
                                    if (contact){
                                        let $stanza = $(stanza.tree());
                                        $stanza.attr('to',this.account.get('jid'));
                                        $stanza.find('notification forwarded message').attr('to',this.account.get('jid'));
                                        $stanza.find(`addresses[xmlns="${Strophe.NS.ADDRESS}"] address[type="to"]`).attr('jid',this.account.get('jid'));
                                        contact && this.createFailedSessionMsg(contact.get('jid'), 'Data decryption failed');
                                        this.account.sendFast(stanza, () => {
                                        });
                                    }
                                    // console.log(stanza);
                                    // console.log(stanza.tree());
                                    utils.callback_popup_message(xabber.getString("trust_verification_decrypt_failed"), 5000);
                                });
                                this.clearData(sid);
                            });
                        }
                    });

                }

            }
        });
    },

    handleTrustVerificationCodeHash: function ($message, contact, msg_item) {
        let sid = $message.find('authenticated-key-exchange').attr('sid');
        if (!this.active_sessions_data[sid]) {
            return;
        }
        let device = this.active_sessions_data[sid].active_verification_device,
            code = this.active_sessions_data[sid].active_verification_code;
        // console.log(device);

        this.getDevicesIKsForTrustVerification(device).then((devices_IK) => {
            console.log(devices_IK);

            let curve = utils.doCurve(devices_IK.own_privkey, devices_IK.device_pubkey),
                $salt = $message.find('salt'),
                $hash = $message.find('hash');

            if ($salt.length && $hash.length){
                let data = utils.fromBase64toArrayBuffer($message.find('salt ciphertext').text()),
                    hash = utils.fromBase64toArrayBuffer($message.find('hash ciphertext').text()),
                    a_iv = utils.fromBase64toArrayBuffer($message.find('salt iv').text()),
                    hash_iv = utils.fromBase64toArrayBuffer($message.find('hash iv').text());

                console.log(curve);
                console.log(utils.ArrayBuffertoBase64(curve));
                console.log($message.find('salt iv').text());
                console.log(this.active_sessions_data[sid].active_verification_code);
                console.log(utils.ArrayBuffertoBase64(curve));

                this.decryptTrustBuffer(a_iv, data, curve, code).then((decrypted_a) => {
                    console.log('utils.ArrayBuffertoBase64(decrypted_a.decryptedBuffer)  !!!!!!!!!!!!!!!!!!!!!!!!!1');
                    console.log(utils.ArrayBuffertoBase64(decrypted_a.decryptedBuffer));
                    this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                        a_payload: utils.ArrayBuffertoBase64(decrypted_a.decryptedBuffer),
                    });


                    this.decryptTrustBuffer(hash_iv, hash, curve, code).then((decrypted_hash) => {

                        let b_payload = this.active_sessions_data[sid].b_payload,
                            code_buffer = new TextEncoder().encode(code);
                        // console.log('B_device_id_buffer  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                        // console.log(utils.ArrayBuffertoBase64(B_device_id_buffer));
                        console.log('devices_IK.own_pubkey  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                        console.log(utils.ArrayBuffertoBase64(devices_IK.own_pubkey));

                        this.getTrustedKey(device).then((A_trustedKeyBuffer) => {

                            let concatinated = new Uint8Array([...new Uint8Array(A_trustedKeyBuffer), ...new Uint8Array(code_buffer), ...new Uint8Array(b_payload) ]);

                            console.log('A_trustedKeyBuffer  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                            console.log(utils.ArrayBuffertoBase64(A_trustedKeyBuffer));
                            console.log('code_buffer  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                            console.log(utils.ArrayBuffertoBase64(code_buffer));
                            console.log('b_payload  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                            console.log(utils.ArrayBuffertoBase64(b_payload));
                            console.log('concatinated  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                            console.log(utils.ArrayBuffertoBase64(concatinated));

                            utils.createSha256(concatinated).then((concatinated_hash) => {
                                let generated_hash_b64 = utils.ArrayBuffertoBase64(concatinated_hash),
                                    decrypted_hash_b64 = utils.ArrayBuffertoBase64(decrypted_hash.decryptedBuffer);

                                console.log('generated_hash_b64  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                                console.log(generated_hash_b64);
                                console.log('decrypted_hash_b64  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                                console.log(decrypted_hash_b64);

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

                                            console.log('B_trustedKeyBuffer  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                                            console.log(utils.ArrayBuffertoBase64(B_trustedKeyBuffer));
                                            console.log(B_trustedKeyBuffer);
                                            console.log('code  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                                            console.log(code);
                                            console.log('this.b_payload  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                                            console.log(utils.ArrayBuffertoBase64(this.b_payload));
                                            console.log(this.b_payload);
                                            console.log('this.a_payload  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                                            console.log(utils.ArrayBuffertoBase64(this.a_payload));
                                            console.log(this.a_payload);
                                            console.log('decrypted_a.encryptionKeyHash  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                                            console.log(utils.ArrayBuffertoBase64(decrypted_a.encryptionKeyHash));
                                            console.log(decrypted_a.encryptionKeyHash);
                                            stanza.c('notify', {xmlns: Strophe.NS.XABBER_NOTIFY});
                                            stanza.c('notification', {xmlns: Strophe.NS.XABBER_NOTIFY});
                                            stanza.c('forwarded', {xmlns: Strophe.NS.FORWARD});
                                            stanza.c('message', {
                                                to: to,
                                                from: this.account.get('jid'),
                                                type: 'chat',
                                                id: uuid()
                                            });
                                            stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Math.floor(Date.now() / 1000)});

                                            stanza.c('hash', {xmlns: Strophe.NS.HASH, algo: 'sha-256'});
                                            stanza.c('ciphertext').t(hash_response.data).up().c('iv').t(hash_response.iv).up().up().up();

                                            stanza.up().up().up();
                                            stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                                            this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                                                can_handle_trust: true,
                                                last_sent_message_id: msg_id,
                                                verification_step: '2b',
                                            });

                                            msg_item && this.removeAfterHandle(msg_item);
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
                                    stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Math.floor(Date.now() / 1000)});
                                    stanza.c('verification-failed', {reason: 'Hashes didn\'t match'}).up().up();

                                    stanza.up().up().up();
                                    stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                                    msg_item && this.removeAfterHandle(msg_item);
                                    this.account.sendFast(stanza, () => {
                                        if (contact){
                                            let $stanza = $(stanza.tree());
                                            $stanza.attr('to',this.account.get('jid'));
                                            $stanza.find('notification forwarded message').attr('to',this.account.get('jid'));
                                            $stanza.find(`addresses[xmlns="${Strophe.NS.ADDRESS}"] address[type="to"]`).attr('jid',this.account.get('jid'));
                                            contact && this.createFailedSessionMsg(contact.get('jid'), 'Hashes didn\'t match');
                                            this.account.sendFast(stanza, () => {
                                            });
                                        }
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
                        stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Math.floor(Date.now() / 1000)});
                        stanza.c('verification-failed', {reason: 'Data decryption failed'}).up().up();

                        stanza.up().up().up();
                        stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                        msg_item && this.removeAfterHandle(msg_item);
                        this.account.sendFast(stanza, () => {
                            if (contact){
                                let $stanza = $(stanza.tree());
                                $stanza.attr('to',this.account.get('jid'));
                                $stanza.find('notification forwarded message').attr('to',this.account.get('jid'));
                                $stanza.find(`addresses[xmlns="${Strophe.NS.ADDRESS}"] address[type="to"]`).attr('jid',this.account.get('jid'));
                                contact && this.createFailedSessionMsg(contact.get('jid'), 'Data decryption failed');
                                this.account.sendFast(stanza, () => {
                                });
                            }
                            // console.log(stanza);
                            // console.log(stanza.tree());
                            utils.callback_popup_message(xabber.getString("trust_verification_decrypt_failed"), 5000);
                        });
                        this.clearData(sid);
                    });
                }).catch(e => {
                    // console.error(e);

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
                    stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Math.floor(Date.now() / 1000)});
                    stanza.c('verification-failed', {reason: 'Data decryption failed with error'}).up().up();

                    stanza.up().up().up();
                    stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                    msg_item && this.removeAfterHandle(msg_item);
                    this.account.sendFast(stanza, () => {
                        if (contact){
                            let $stanza = $(stanza.tree());
                            $stanza.attr('to',this.account.get('jid'));
                            $stanza.find('notification forwarded message').attr('to',this.account.get('jid'));
                            $stanza.find(`addresses[xmlns="${Strophe.NS.ADDRESS}"] address[type="to"]`).attr('jid',this.account.get('jid'));
                            contact && this.createFailedSessionMsg(contact.get('jid'), 'Data decryption failed with error');
                            this.account.sendFast(stanza, () => {
                            });
                        }
                        // console.log(stanza);
                        // console.log(stanza.tree());
                        utils.callback_popup_message(xabber.getString("trust_verification_decrypt_failed"), 5000);
                    });
                    this.clearData(sid);
                });
            }
        });

    },

    handleTrustVerificationFinalHash: function ($message, contact, msg_item) {
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

                            console.log('generated_hash_b64  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                            console.log(generated_hash_b64);
                            console.log('decrypted_hash_b64  !!!!!!!!!!!!!!!!!!!!!!!!!2');
                            console.log(decrypted_hash_b64);

                            if (generated_hash_b64 === decrypted_hash_b64){
                                msg_item && this.removeAfterHandle(msg_item);
                                //start devices exchange

                                this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
                                    verification_step: 'final',
                                });
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
                                stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Math.floor(Date.now() / 1000)});
                                stanza.c('verification-failed', {reason: 'Hashes didn\'t match in final stanza'}).up().up();

                                stanza.up().up().up();
                                stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

                                msg_item && this.removeAfterHandle(msg_item);
                                this.account.sendFast(stanza, () => {
                                    if (contact){
                                        let $stanza = $(stanza.tree());
                                        $stanza.attr('to',this.account.get('jid'));
                                        $stanza.find('notification forwarded message').attr('to',this.account.get('jid'));
                                        $stanza.find(`addresses[xmlns="${Strophe.NS.ADDRESS}"] address[type="to"]`).attr('jid',this.account.get('jid'));
                                        contact && this.createFailedSessionMsg(contact.get('jid'), 'Hashes didn\'t match in final stanza');
                                        this.account.sendFast(stanza, () => {
                                        });
                                    }
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
        console.log('code');
        console.log(code);
        console.log('hash');
        console.log(hash);
        console.log(utils.ArrayBuffertoBase64(hash));
        console.log('concatinated');
        console.log(concatinated);
        console.log(utils.ArrayBuffertoBase64(concatinated));
        console.log('encryptionKeyHash');
        console.log(encryptionKeyHash);
        console.log(utils.ArrayBuffertoBase64(encryptionKeyHash));

        console.log('utils.ArrayBuffertoBase64(hash)');
        console.log(utils.ArrayBuffertoBase64(hash));

        let encryptionKey = await window.crypto.subtle.importKey('raw', encryptionKeyHash, { "name": 'AES-CBC' }, true, ['decrypt']);

        console.log('utils.ArrayBuffertoBase64(encryptionKey)');
        console.log(utils.ArrayBuffertoBase64(encryptionKey));

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

        console.log(curve);
        console.log('utils.ArrayBuffertoBase64(buffer)');
        console.log(utils.ArrayBuffertoBase64(buffer));
        console.log('utils.ArrayBuffertoBase64(hash)');
        console.log(utils.ArrayBuffertoBase64(hash));

        let concatinated = new Uint8Array([...new Uint8Array(curve), ...new Uint8Array(hash)]),
            aes_key = await utils.createSha256(concatinated);

        console.log('utils.ArrayBuffertoBase64(aes_key) !!!!!!!!!!!!!!!!!!!!!!!!!1');
        console.log(utils.ArrayBuffertoBase64(aes_key));
        console.log('utils.ArrayBuffertoBase64(buffer) !!!!!!!!!!!!!!!!!!!!!!!!!1');
        console.log(utils.ArrayBuffertoBase64(buffer));

        let encryptionKey = await window.crypto.subtle.importKey('raw', aes_key, { "name": 'AES-CBC' }, true, ['encrypt']);

        cypher = await window.crypto.subtle.encrypt({ name: 'AES-CBC', iv }, encryptionKey, buffer);

        // console.log(utils.ArrayBuffertoBase64(cypher));

        return {data: utils.ArrayBuffertoBase64(cypher), iv: utils.ArrayBuffertoBase64(iv), not_encrypted_payload: buffer};

    },

    generateVerificationEncryptedHash: async function (trustedKeyBuffer, code, b_payload, sharedKey) {
        let iv = window.crypto.getRandomValues(new Uint8Array(16)),
            code_buffer = new TextEncoder().encode(code);

        console.log('utils.ArrayBuffertoBase64(trustedKeyBuffer)');
        console.log(utils.ArrayBuffertoBase64(trustedKeyBuffer));
        console.log('utils.ArrayBuffertoBase64(code_buffer)');
        console.log(utils.ArrayBuffertoBase64(code_buffer));
        console.log('utils.ArrayBuffertoBase64(b_payload)');
        console.log(utils.ArrayBuffertoBase64(b_payload));

        let concatinated = new Uint8Array([...new Uint8Array(trustedKeyBuffer), ...new Uint8Array(code_buffer), ...new Uint8Array(b_payload) ]),
            concatinated_hash = await utils.createSha256(concatinated);

        console.log('utils.ArrayBuffertoBase64(concatinated_hash)  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        console.log(utils.ArrayBuffertoBase64(concatinated_hash));
        console.log('utils.ArrayBuffertoBase64(concatinated)  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        console.log(utils.ArrayBuffertoBase64(concatinated));
        console.log('utils.ArrayBuffertoBase64(sharedKey)  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        console.log(utils.ArrayBuffertoBase64(sharedKey));

        let encryptionKey = await window.crypto.subtle.importKey('raw', sharedKey, { "name": 'AES-CBC' }, true, ['encrypt']);

        let cypher = await window.crypto.subtle.encrypt({ name: 'AES-CBC', iv }, encryptionKey, concatinated_hash);

        // console.log(utils.ArrayBuffertoBase64(cypher));

        return {data: utils.ArrayBuffertoBase64(cypher), iv: utils.ArrayBuffertoBase64(iv)};

    },

    generateVerificationEncryptedFinalHash: async function (trustedKeyBuffer, code, b_payload, a_payload, sharedKey) {
        let iv = window.crypto.getRandomValues(new Uint8Array(16)),
            code_buffer = new TextEncoder().encode(code);

        // console.log(curve);
        console.log('trustedKeyBuffer  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        console.log(utils.ArrayBuffertoBase64(trustedKeyBuffer));
        console.log('code_buffer  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        console.log(utils.ArrayBuffertoBase64(code_buffer));
        console.log('b_payload  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        console.log(utils.ArrayBuffertoBase64(b_payload));
        console.log('a_payload  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        console.log(utils.ArrayBuffertoBase64(a_payload));

        let concatinated = new Uint8Array([...new Uint8Array(trustedKeyBuffer), ...new Uint8Array(code_buffer), ...new Uint8Array(b_payload), ...new Uint8Array(a_payload) ]),
            concatinated_hash = await utils.createSha256(concatinated);

        console.log('utils.ArrayBuffertoBase64(concatinated_hash)  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        console.log(utils.ArrayBuffertoBase64(concatinated_hash));
        console.log('utils.ArrayBuffertoBase64(sharedKey)  !!!!!!!!!!!!!!!!!!!!!!!!!2');
        console.log(utils.ArrayBuffertoBase64(sharedKey));

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
        stanza.c('authenticated-key-exchange', {xmlns: Strophe.NS.XABBER_TRUST, sid: sid, timestamp: Math.floor(Date.now() / 1000)});
        stanza.c('verification-successful').up().up();

        stanza.up().up().up();
        stanza.c('addresses', {xmlns: Strophe.NS.ADDRESS}).c('address',{type: 'to', jid: to}).up().up();

        this.account.sendFast(stanza, () => {
            console.error(to);
            if (to !== this.account.get('jid')){
                let $stanza = $(stanza.tree());
                $stanza.attr('to',this.account.get('jid'));
                $stanza.find('notification forwarded message').attr('to',this.account.get('jid'));
                $stanza.find(`addresses[xmlns="${Strophe.NS.ADDRESS}"] address[type="to"]`).attr('jid',this.account.get('jid'));
                this.account.sendFast(stanza, () => {
                });
            }
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
                        timestamp: Math.floor(Date.now() / 1000),
                        after_trust: true,
                        public_key: utils.ArrayBuffertoBase64(device.get('ik'))
                    });
                }
            } else {
                trusted_devices[to] = [{
                    trusted_key: trustedKeyBase64,
                    fingerprint: device.get('fingerprint'),
                    device_id: device.get('id'),
                    timestamp: Math.floor(Date.now() / 1000),
                    after_trust: true,
                    public_key: utils.ArrayBuffertoBase64(device.get('ik'))
                }];
            }
            this.save('trusted_devices', trusted_devices);
            this.trigger('trust_updated');
            // console.log(this.get('trusted_devices'));

            this.sendVerificationSuccess(to, sid);
            if (contact){
                this.getContactsTrustedDevices(to, device.get('id'));
                this.publishContactsTrustedDevices(() => {
                });
            } else {
                this.fixMyTrustedDeviceAndPublish(() => {
                    this.publishContactsTrustedDevices(() => {
                    });
                });
            }
        });
    },

    handleVerificationSuccess: function ($message, contact, sid) {
        // console.log(this.active_sessions_data[sid]);
        if (!this.active_sessions_data[sid]) {
            return;
        }
        let device = this.active_sessions_data[sid].active_verification_device,
            code = this.active_sessions_data[sid].active_verification_code;
        this.account.omemo.xabber_trust.addVerificationSessionData(sid, {
            verification_step: 'final',
        });
        // console.log(device);
        this.getTrustedKey(device).then((trustedKeyBuffer) => {
            // console.log(trustedKeyBuffer);
            let trustedKeyBase64 = utils.ArrayBuffertoBase64(trustedKeyBuffer);
            let trusted_devices = this.get('trusted_devices'),
                to = contact ? contact.get('jid') : this.account.get('jid');
            if (trusted_devices[to] && _.isArray(trusted_devices[to])){
                if (!trusted_devices[to].some(e => e.trusted_key === trustedKeyBase64)){
                    trusted_devices[to].push({
                        trusted_key: trustedKeyBase64,
                        fingerprint: device.get('fingerprint'),
                        device_id: device.get('id'),
                        timestamp: Math.floor(Date.now() / 1000),
                        after_trust: true,
                        public_key: utils.ArrayBuffertoBase64(device.get('ik'))
                    });
                }
            } else {
                trusted_devices[to] = [{
                    trusted_key: trustedKeyBase64,
                    fingerprint: device.get('fingerprint'),
                    device_id: device.get('id'),
                    timestamp: Math.floor(Date.now() / 1000),
                    after_trust: true,
                    public_key: utils.ArrayBuffertoBase64(device.get('ik'))
                }];
            }
            this.save('trusted_devices', trusted_devices);
            this.trigger('trust_updated');
            // console.log(this.get('trusted_devices'));


            if (contact){
                this.getContactsTrustedDevices(to, device.get('id'));
                this.publishContactsTrustedDevices(() => {
                });
                this.clearData(sid);
            } else {
                this.fixMyTrustedDeviceAndPublish(() => {
                    this.publishContactsTrustedDevices(() => {
                    });
                    this.clearData(sid);
                });
            }
        });
    },
});


export default xabber;
