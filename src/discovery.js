import xabber from "xabber-core";

let env = xabber.env,
    $ = env.$,
    moment = env.moment,
    Backbone = env.Backbone,
    Strophe = env.Strophe;

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

    _initialize: function (options) {
        this.render();
        this.model.collection.account.settings_account_modal && this.$el.appendTo(this.model.collection.account.settings_account_modal.$('.capabilities'));
        if (options.single_account && options.single_account.$('.capabilities').length){
            this.$el.appendTo(options.single_account.$('.capabilities'));
        }
        this.listenTo(this.model, 'change', this.render);
        this.listenTo(this.model, 'destroy', this.remove);
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
        let client_name = constants.CLIENT_NAME;
        this.connection.disco.addIdentity(
            'client',
            'web',
            client_name,
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
        this.connection.disco.addFeature(Strophe.NS.PUBSUB_TRUST_SHARING_ITEMS + '+notify');
        this.addFeature(Strophe.NS.HTTP_UPLOAD, 'XEP-0363: HTTP File Upload');
        this.addFeature(Strophe.NS.SYNCHRONIZATION, 'XEP-SYNC: Client Synchronization');
        this.addFeature(Strophe.NS.AUTH_DEVICES, 'XEP-DEVICES: HOTP and Device Management');
        this.addFeature(Strophe.NS.ARCHIVE, 'XEP-ARCHIVED: Archived Chats');
        this.addFeature(Strophe.NS.DELIVERY, 'XEP-DELIVERY: Reliable message delivery');
        this.addFeature(Strophe.NS.GROUP_CHAT, 'XEP-GROUPS: Groups');
        this.addFeature(Strophe.NS.REWRITE, 'XEP-RETRACT: Message Delete and Rewrite');
    },

    addFeature: function (namespace, verbose_name) {
        this.create({
            namespace: namespace,
            verbose_name: verbose_name
        });
        this.connection.disco.addFeature(namespace);
    },

    render: function () {
        this.models.forEach((feature) => {
            new xabber.FeatureView({model: feature});
        });
    },

    renderSingleAccount: function (single_account) {
        single_account.$('.capabilities').html('');
        this.models.forEach((feature) => {
            new xabber.FeatureView({model: feature, single_account: single_account});
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
        this._features_handled_counter = 0;
        this.on("add", this.onFeatureAdded, this);
    },

    onHandledFeatures: function () {
        if (this._features_handled_counter === 0){
            this.account.set('features_handled', true);
            if (!this.account.get('roster_ready_called'))
                this.account.trigger('ready_to_get_roster')
        }
    },

    request: function () {
        let dfd = $.Deferred();
        dfd.done((is_changed) => {
            this.account.cached_server_features.getAllFromCachedFeatures((res) => {
                if (res.length === 1 && res[0].var === 'caps_version'){
                    is_changed = true;
                }
                this._features_handled_counter = 0;
                if (res && res.length && !is_changed){
                    res.forEach((item) => {
                        if (item.var && item.var === 'caps_version')
                            return;
                        this.create({
                            'var': item.var,
                            from: item.from
                        });
                    });
                    this.is_cached = true;
                } else {
                    this._features_handled_counter++;
                    this.connection.disco.info(this.account.domain, null, this.onInfo.bind(this), this.onError.bind(this), 3000);
                }
                this._features_handled_counter++;
                this._features_handled_counter++;
                this.connection.disco.info(this.account.get('jid'), null, this.onInfo.bind(this), this.onError.bind(this), 3000);
                this.connection.disco.items(this.account.domain, null, this.onItems.bind(this), this.onError.bind(this), 3000);
            });
        });

        if (this.connection.caps_ver){
            this.account.cached_server_features.getFromCachedFeatures('caps_version', (caps_ver) => {
                if (caps_ver){
                    if (caps_ver.ver === this.connection.caps_ver && caps_ver.timestamp && ((Date.now() / 1000) - caps_ver.timestamp) < 86400){
                        dfd.resolve();
                    } else {
                        this.account.cached_server_features.putInCachedFeatures({
                            var: 'caps_version',
                            ver: this.connection.caps_ver,
                            timestamp: Date.now() / 1000,
                        }, () => {
                            dfd.resolve(true);
                        })
                    }
                } else {
                    this.account.cached_server_features.putInCachedFeatures({
                        var: 'caps_version',
                        ver: this.connection.caps_ver,
                        timestamp: Date.now() / 1000,
                    }, () => {
                        dfd.resolve(true);
                    })
                }
            });
        } else {
            dfd.resolve(true);
        }
    },

    onError: function () {
        this._features_handled_counter--;
        this.onHandledFeatures();
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
            this._features_handled_counter++;
            this.connection.disco.addItem(jid, name, node, () => {});
            this.connection.disco.info(
                jid,
                node,
                this.onInfo.bind(this), this.onError.bind(this), 3000);
        });
        this._features_handled_counter--;
        this.onHandledFeatures();
    },

    onInfo: function (stanza) {
        let $stanza = $(stanza),
            from = $stanza.attr('from'),
            self = this;
        $stanza.find('feature').each(function () {
            let namespace = $(this).attr('var');
            if (namespace === Strophe.NS.XABBER_NOTIFY && from === self.connection.domain)
                return;
            self.create({
                'var': namespace,
                from: from
            });
            if (namespace === Strophe.NS.DISCO_ITEMS && from !== self.connection.domain){
                let node = null;
                $stanza.find('query').attr('node') && (node = $stanza.find('query').attr('node'));

                self._features_handled_counter++;
                self.connection.disco.items(from, node, self.onItems.bind(self), self.onError.bind(self), 3000);
            }
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
                let proxy_viewer_url = $(this).find('field[var="' + Strophe.NS.PROXY_VIEWER + '"] value');
                if (proxy_viewer_url.length && proxy_viewer_url.text()){
                    self.create({
                        'var': 'proxy-viewer',
                        from: proxy_viewer_url.text()
                    });
                }
            }
            if (form_type_val.length && form_type_val.text() === Strophe.NS.CONTACT_ADDRESSES && self.account.domain === from){
                let abuse_info = $(this).find('field[var="abuse-addresses"] value');
                if (abuse_info.length && abuse_info.text()){
                    let abuse_info_text = abuse_info.map(function() {
                        return $(this).text();
                    }).get().join(',');
                    self.create({
                        'var': 'abuse-addresses',
                        from: abuse_info_text
                    });
                }
            }
        });
        if (this.get(Strophe.NS.XABBER_NOTIFY) && this.get(Strophe.NS.XABBER_NOTIFY).get('from')){
            let jid = this.get(Strophe.NS.XABBER_NOTIFY).get('from');
            if (this.account.contacts.get(jid)){
                let chat = this.account.chats.getChat(this.account.contacts.get(jid));
                if (!chat.get('notifications')){
                    this.account.cached_sync_conversations.getFromCachedConversations(`${jid}/${Strophe.NS.XABBER_NOTIFY}` ,(item) => {
                        if (!item)
                            return;
                        this.account.roster.syncCachedConversations(true, [item]);
                    });
                }
            }
        }
        if (this.get(Strophe.NS.XABBER_FAVORITES) && this.get(Strophe.NS.XABBER_FAVORITES).get('from')){
            let jid = this.get(Strophe.NS.XABBER_FAVORITES).get('from');
            if (this.account.contacts.get(jid)){
                let chat = this.account.chats.getChat(this.account.contacts.get(jid));
                if (chat && !chat.get('saved')){
                    chat.destroy();
                    this.account.cached_sync_conversations.getFromCachedConversations(`${jid}/${Strophe.NS.XABBER_FAVORITES}` ,(item) => {
                        if (!item)
                            return;
                        this.account.roster.syncCachedConversations(true, [item]);
                    });
                }
            }
        }
        if (this.account.auth_view && !(constants.TRUSTED_DOMAINS.indexOf(this.account.connection.domain) > -1)){
            this.account.auth_view.first_features_received = true;
            if (this.account.auth_view.stepped_auth_complete)
                this.account.auth_view.successFeedback();
        }
        this._features_handled_counter--;
        this.onHandledFeatures();
    },

    onFeatureAdded: function (feature) {
        let _var = feature.get('var'),
            client_feature = this.account.client_features.get(_var);
        client_feature && client_feature.set('supports', true);
        (_var !== Strophe.NS.SUBSCRIPTION_PREAPPROVAL && _var !== Strophe.NS.SYNCHRONIZATION) && this.account.cached_server_features.putInCachedFeatures({
            var: _var,
            from: feature.get('from'),
        });
        if (_var === 'abuse-addresses'){
            let abuse_used_jid = feature.get('from');
            if (abuse_used_jid.split(',').length > 1){
                _.each(abuse_used_jid.split(','), (item) => {
                    item.includes('xmpp:') && (abuse_used_jid = item);
                });
            }
            abuse_used_jid.includes('xmpp:') && (abuse_used_jid = abuse_used_jid.replace('xmpp:', ''));
            feature.set('abuse_used_jid', abuse_used_jid);
        }
        if (_var === 'media-gallery') {
            this.account.set('gallery_auth', false);
            if (!(this.account.get('gallery_token') && this.account.get('gallery_url')) || (this.account.get('gallery_url') !== feature.get('from')))
                this.account.initGalleryAuth(feature);
        }
        if (_var === 'proxy-viewer') {
            this.account.set('proxy_viewer_auth', false);
            if (!(this.account.get('proxy_viewer_token') && this.account.get('proxy_viewer_url')) || (this.account.get('proxy_viewer_url') !== feature.get('from')))
                this.account.initProxyViewerAuth(feature);
        }
    },
});

xabber.Account.addInitPlugin(function () {
    this.set('features_handled', false);
    this.client_features = new xabber.ClientFeatures(null, {account: this});
    this.server_features = new xabber.ServerFeatures(null, {account: this});
});

xabber.Account.addConnPlugin(function () {
    this.last_stanza_timestamp = moment.now();

    this.connection.deleteHandler(this._last_stanza_handler);
    this._last_stanza_handler = this.connection.addHandler(() => {
        if (!this.get('enabled')){
            console.error('received stanza on disabled account');
            this.deactivate();
            return;
        }
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
        let downtime = (moment.now() - this.last_stanza_timestamp) / 1000,
            downtime_ping;
        if (this.last_ping_timestamp){
            downtime_ping = (moment.now() - this.last_ping_timestamp) / 1000;
        }
        if (!navigator.onLine || downtime > (constants.DOWNTIME_RECONNECTION_TIMEOUT || 15) && downtime_ping && downtime_ping <= (constants.DOWNTIME_RECONNECTION_TIMEOUT || 15) && downtime_ping > 5) {
            if (!navigator.onLine){
                console.log('navigator: ' + navigator.onLine);
                console.log('this.connection.connected: ' + this.connection.connected);
                xabber._settings.get('reconnection_logs') && utils.callback_popup_message('this.connection.connected: ' + this.connection.connected, 2000);
            }
            console.log('downtime main to disconnect: ' + downtime);
            downtime_ping && console.log('downtime main from last ping to disconnect: ' + downtime_ping);
            xabber._settings.get('reconnection_logs') && utils.callback_popup_message('downtime main to disconnect: ' + downtime, 2000);
            console.log(this.connection.connected);
            this.connection._doDisconnect();
            this._main_interval_worker.terminate();
        }
        if (downtime > (constants.PING_SENDING_INTERVAL || 10)) {
            console.log('downtime main to ping: ' + downtime);
            downtime_ping && console.log('downtime main from last ping: ' + downtime_ping);
            this.connection && this.connection.ping.ping(this.get('domain'));
            if (!this.last_ping_timestamp || downtime_ping >= 10){
                this.last_ping_timestamp = moment.now();
            }
        }
    };

    this.server_features.request();
}, true, true);

xabber.Account.addConnPlugin(function () {
    let disco = this.connection.disco;
    this.connection.addHandler(disco._onDiscoInfo.bind(disco),
            Strophe.NS.DISCO_INFO, 'iq', 'get', null, null);
    this.connection.addHandler(disco._onDiscoItems.bind(disco),
            Strophe.NS.DISCO_ITEMS, 'iq', 'get', null, null);
}, false, true);

export default xabber;
