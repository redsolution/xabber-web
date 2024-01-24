import xabber from "xabber-core";

let env = xabber.env,
    $ = env.$,
    _ = env._,
    moment = env.moment,
    Strophe = env.Strophe,
    $iq = env.$iq;

xabber.ClientFeature = Backbone.Model.extend({
    idAttribute: 'namespace'
});

xabber.FeatureView = xabber.BasicView.extend({
    className: 'client-feature',
    template: function () {
        this.$el.append('<div class="feature-check-icon mdi mdi-24px"/>')
                .append('<div class="feature-name one-line"/>');
        this.$('.feature-check-icon').append(env.templates.svg['check-circle']());
    },

    _initialize: function (options, attrs) {
        this.render();
        this.model.collection.account.settings_account_modal && this.$el.appendTo(this.model.collection.account.settings_account_modal.$('.capabilities'));
        if (options.single_account && options.single_account.$('.capabilities').length){
            this.$el.appendTo(options.single_account.$('.capabilities'));
        }
        this.model.on("change", this.render, this);
        this.model.on("destroy", this.remove, this);
    },

    render: function () {
        let name = this.model.get('verbose_name'),
            supports = this.model.get('supports');
        this.$('.feature-name').text(name);
        this.$('.feature-check-icon').showIf(supports);
    }
});

xabber.ClientFeatures = Backbone.Collection.extend({
    model: xabber.ClientFeature,

    initialize: function (models, options) {
        this.account = options.account;
        this.account.on('render_settings', this.render, this);
        this.account.on('render_single_settings', this.renderSingleAccount, this);
        this.connection = this.account.connection;
        this.connection.disco.addIdentity(
            'client',
            'web',
            constants.CLIENT_NAME,
            'en'
        );
        this.addFeature(Strophe.NS.LAST, 'XEP-0012: Last Activity');
        this.addFeature(Strophe.NS.VCARD, 'XEP-0054: vCard-temp');
        this.addFeature(Strophe.NS.RSM, 'XEP-0059: Result Set Management');
        this.addFeature(Strophe.NS.PUBSUB, 'XEP-0060: Publish-Subscribe');
        this.addFeature(Strophe.NS.REGISTER, 'XEP-0077: In-Band Registration');
        this.connection.disco.addFeature(Strophe.NS.CHATSTATES);
        this.addFeature(Strophe.NS.BLOCKING, 'XEP-0191: Blocking Command');
        this.addFeature(Strophe.NS.PING, 'XEP-0199: XMPP Ping');
        this.connection.disco.addFeature(Strophe.NS.ATTENTION, 'XEP-0244: Attention');
        this.addFeature(Strophe.NS.CARBONS, 'XEP-0280: Message carbons');
        this.addFeature(Strophe.NS.MAM, 'XEP-0313: Message archive management');
        this.connection.disco.addFeature(Strophe.NS.CHAT_MARKERS);
        this.connection.disco.addFeature(Strophe.NS.PUBSUB_AVATAR_METADATA + '+notify');
        this.addFeature(Strophe.NS.HTTP_UPLOAD, 'XEP-0363: HTTP File Upload');
        this.addFeature(Strophe.NS.SYNCHRONIZATION, 'XEP-SYNC: Client Synchronization');
        this.addFeature(Strophe.NS.AUTH_DEVICES, 'XEP-DEVICES: HOTP and Device Management');
        this.addFeature(Strophe.NS.ARCHIVE, 'XEP-ARCHIVED: Archived Chats');
        this.addFeature(Strophe.NS.DELIVERY, 'XEP-DELIVERY: Reliable message delivery');
        this.addFeature(Strophe.NS.GROUP_CHAT, 'XEP-GROUPS: Groups');
        this.addFeature(Strophe.NS.REWRITE, 'XEP-RETRACT: Message Delete and Rewrite');
    },

    addFeature: function (namespace, verbose_name) {
        let feature = this.create({
            namespace: namespace,
            verbose_name: verbose_name
        });
        this.connection.disco.addFeature(namespace);
    },

    render: function () {
        this.models.forEach((feature) => {
            let view = new xabber.FeatureView({model: feature});
        });
    },

    renderSingleAccount: function (single_account) {
        single_account.$('.capabilities').html('');
        this.models.forEach((feature) => {
            let view = new xabber.FeatureView({model: feature, single_account: single_account});
        });
    },
});

xabber.ServerFeature = Backbone.Model.extend({
    idAttribute: 'var'
});

xabber.ServerFeatures = Backbone.Collection.extend({
    model: xabber.ServerFeature,

    initialize: function (models, options) {
        this.account = options.account;
        this.connection = this.account.connection;
        this.on("add", this.onFeatureAdded, this);
    },

    request: function () {
        this.account.cached_server_features.getAllFromCachedFeatures((res) => {
            if (res && res.length){
                res.forEach((item) => {
                    this.create({
                        'var': item.var,
                        from: item.from
                    });
                });
                this.is_cached = true;
            } else {
                this.connection.disco.info(this.account.domain, null, this.onInfo.bind(this));
            }
            this.connection.disco.items(this.account.domain, null, this.onItems.bind(this));
        });
    },

    onItems: function (stanza) {
        let groupchat_servers_list = [];
        $(stanza).find('query item').each((idx, item) => {
            let jid = $(item).attr('jid'),
                name = $(item).attr('name'),
                node = $(item).attr('node');
            if (node === Strophe.NS.GROUP_CHAT) {
                groupchat_servers_list.push(jid);
                this.account.set('groupchat_servers_list', groupchat_servers_list);
            }
            this.connection.disco.addItem(jid, name, node, () => {});
            (!this.is_cached) && this.connection.disco.info(
                jid,
                null,
                this.onInfo.bind(this));
        });
    },

    onInfo: function (stanza) {
        let $stanza = $(stanza),
            from = $stanza.attr('from'),
            self = this;
        $stanza.find('feature').each(function () {
            let namespace = $(this).attr('var');
            self.create({
                'var': namespace,
                from: from
            });
        });
        $stanza.find('x').each(function () {
            let form_type_val = $(this).find('field[var="FORM_TYPE"] value');
            if (form_type_val.length && form_type_val.text() === Strophe.NS.URLDISCO && self.account.domain === from){
                let media_gallery_url = $(this).find('field[var="' + Strophe.NS.MEDIAGALLERY + '"] value');
                if (media_gallery_url.length && media_gallery_url.text()){
                    self.create({
                        'var': 'media-gallery',
                        from: media_gallery_url.text()
                    });
                }
            }
        });
        if (this.account.auth_view && !(constants.TRUSTED_DOMAINS.indexOf(this.account.connection.domain) > -1)){
            this.account.auth_view.first_features_received = true
            if (this.account.auth_view.stepped_auth_complete)
                this.account.auth_view.successFeedback();
        }
    },

    onFeatureAdded: function (feature) {
        let _var = feature.get('var'),
            client_feature = this.account.client_features.get(_var);
        client_feature && client_feature.set('supports', true);
        (_var != Strophe.NS.SUBSCRIPTION_PREAPPROVAL && _var != Strophe.NS.SYNCHRONIZATION) && this.account.cached_server_features.putInCachedFeatures({
            var: _var,
            from: feature.get('from'),
        });
        if (_var === 'media-gallery') {
            this.account.set('gallery_auth', false)
            if (!(this.account.get('gallery_token') && this.account.get('gallery_url')) || (this.account.get('gallery_url') != feature.get('from')))
                this.account.initGalleryAuth(feature);
        }
    },
});

xabber.Account.addInitPlugin(function () {
    this.client_features = new xabber.ClientFeatures(null, {account: this});
    this.server_features = new xabber.ServerFeatures(null, {account: this});
});

xabber.Account.addConnPlugin(function () {
    this.last_stanza_timestamp = moment.now();

    this.connection.deleteHandler(this._last_stanza_handler);
    this._last_stanza_handler = this.connection.addHandler(() => {
        this.last_stanza_timestamp = moment.now();
        return true;
    });

    this.connection.deleteHandler(this._pong_handler);
    this._pong_handler = this.connection.ping.addPingHandler((ping) => {
        this.last_stanza_timestamp = moment.now();
        this.connection.ping.pong(ping);
        return true;
    });

    if (this._main_interval_worker)
        this._main_interval_worker.terminate();

    this._main_interval_worker = new Worker(new URL('./worker.js', import.meta.url));

    this._main_interval_worker.onmessage = () => {
        let downtime = (moment.now() - this.last_stanza_timestamp) / 1000;
        if (!navigator.onLine || downtime > (constants.DOWNTIME_RECONNECTION_TIMEOUT || 15)) {
            if (!navigator.onLine){
                console.log('navigator: ' + navigator.onLine)
                console.log('this.connection.connected: ' + this.connection.connected)
                xabber._settings.get('reconnection_logs') && utils.callback_popup_message('this.connection.connected: ' + this.connection.connected, 2000);
            }
            console.log('downtime main to disconnect: ' + downtime);
            xabber._settings.get('reconnection_logs') && utils.callback_popup_message('downtime main to disconnect: ' + downtime, 2000);
            console.log(this.connection.connected);
            if (this.connection.connected)
                this.connection.disconnect();
            else
                this.connect();
            this._main_interval_worker.terminate();
        }
        if (downtime > (constants.PING_SENDING_INTERVAL || 10)) {
            console.log('downtime main to ping: ' + downtime);
            this.connection && this.connection.ping.ping(this.get('domain'));
        }
    };

    this._main_interval_worker.postMessage({});

    this.server_features.request();
}, true, true);

xabber.Account.addFastConnPlugin(function () {
    this.last_fast_stanza_timestamp = moment.now();

    this.fast_connection.deleteHandler(this._last_fast_stanza_handler);
    this._last_fast_stanza_handler = this.fast_connection.addHandler(() => {
        this.last_fast_stanza_timestamp = moment.now();
        return true;
    });

    this.fast_connection.deleteHandler(this._fast_pong_handler);
    this._fast_pong_handler = this.fast_connection.ping.addPingHandler((ping) => {
        this.last_fast_stanza_timestamp = moment.now();
        this.fast_connection.ping.pong(ping);
        return true;
    });

    if (this._fast_interval_worker)
        this._fast_interval_worker.terminate();

    this._fast_interval_worker = new Worker(new URL('./worker.js', import.meta.url));

    this._fast_interval_worker.onmessage = () => {
        let downtime = (moment.now() - this.last_fast_stanza_timestamp) / 1000;
        if (!navigator.onLine || downtime > (constants.DOWNTIME_RECONNECTION_TIMEOUT || 15)) {
            if (!navigator.onLine){
                console.log('navigator: ' + navigator.onLine)
                console.log('this.connection.connected: ' + this.fast_connection.connected)
                xabber._settings.get('reconnection_logs') && utils.callback_popup_message('this.connection.connected: ' + this.fast_connection.connected, 2000);
            }
            console.log('downtime fast to disconnect: ' + downtime);
            xabber._settings.get('reconnection_logs') && utils.callback_popup_message('downtime fast to disconnect: ' + downtime, 2000);
            console.log(this.fast_connection.connected);
            if (this.fast_connection.connected)
                this.fast_connection.disconnect();
            else
                this.fast_connection.connect('password', this.fast_connection.jid, this.fast_connection.pass);
            this._fast_interval_worker.terminate();
        }
        if (downtime > (constants.PING_SENDING_INTERVAL || 10)) {
            console.log('downtime fast to ping: ' + downtime);
            this.fast_connection && this.fast_connection.ping.ping(this.get('domain'));
        }
    };
    this._fast_interval_worker.postMessage({});
}, true, true);

xabber.Account.addConnPlugin(function () {
    let disco = this.connection.disco;
    this.connection.addHandler(disco._onDiscoInfo.bind(disco),
            Strophe.NS.DISCO_INFO, 'iq', 'get', null, null);
    this.connection.addHandler(disco._onDiscoItems.bind(disco),
            Strophe.NS.DISCO_ITEMS, 'iq', 'get', null, null);
}, false, true);

export default xabber;
