define("xabber-discovery", function () {
  return function (xabber) {
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
            this.$el.append('<div class="feature-name one-line"/>')
                    .append('<div class="supports"/>');
        },

        _initialize: function () {
            this.render();
            this.$el.appendTo(this.model.collection.account.settings_right.$('.capabilities'));
            this.model.on("change", this.render, this);
            this.model.on("destroy", this.remove, this);
        },

        render: function () {
            let name = this.model.get('verbose_name'),
                supports = this.model.get('supports');
            this.$('.feature-name').text(name);
            this.$('.supports').text(supports ? xabber.getString("account_settings__server_info__status_available") : xabber.getString("account_settings__server_info__status_unavailable"))
        }
    });

    xabber.ClientFeatures = Backbone.Collection.extend({
        model: xabber.ClientFeature,

        initialize: function (models, options) {
            this.account = options.account;
            this.account.on('render_settings', this.render, this);
            this.connection = this.account.connection;
            this.connection.disco.addIdentity(
                'client',
                'web',
                xabber.get('client_name'),
                'en'
            );
            this.addFeature(Strophe.NS.LAST, 'XEP-0012: Last Activity');
            this.addFeature(Strophe.NS.VCARD, 'XEP-0054: vCard-temp');
            this.addFeature(Strophe.NS.RSM, 'XEP-0059: Result Set Management');
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
            this.addFeature(Strophe.NS.GEOLOC, 'XEP-0080: User Location');
            this.addFeature(Strophe.NS.PUBSUB, 'XEP-0060: Publish-Subscribe');
            this.addFeature(Strophe.NS.ARCHIVE, 'XEP-ARCHIVED: Archived Chats');
            this.addFeature(Strophe.NS.DELIVERY, 'XEP-DELIVERY: Reliable message delivery');
            this.addFeature(Strophe.NS.GROUP_CHAT, 'XEP-GROUPS: Groups');
            this.addFeature(Strophe.NS.REWRITE, 'XEP-RETRACT: Message Delete and Rewrite');
            this.addFeature(Strophe.NS.REGISTER, 'XEP-0077: In-Band Registration');
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
        }
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
            this.connection.disco.info(this.account.domain, null, this.onInfo.bind(this));
            this.connection.disco.items(this.account.domain, null, this.onItems.bind(this));
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
                if (jid.includes('mediagallery')){
                    this.create({
                        'var': 'media-gallery',
                        jid: jid,
                        from: node
                    })
                }
                this.connection.disco.info(
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
                if (namespace === Strophe.NS.AUTH_DEVICES)
                    self.account.getAllXTokens();
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

            let prefs = feature.get('preferences') || {};
            if (_var === Strophe.NS.MAM && prefs.default !== 'always') {
                this.account.sendIQ(
                    $iq({type: 'get'}).c('prefs', {xmlns: Strophe.NS.MAM}),
                    _.bind(this.receiveMAMPreferences, this, feature)
                );
            }
            if (_var === 'media-gallery') {
                if (!(this.account.get('gallery_token') && this.account.get('gallery_url')) || (this.account.get('gallery_url') != feature.get('from')))
                    this.account.initGalleryAuth(feature);
            }
        },

        receiveMAMPreferences: function (feature, iq) {
            let $prefs = $(iq).find('prefs[xmlns="'+Strophe.NS.MAM+'"]');
            let default_pref = $prefs.attr('default');
            if (default_pref !== 'always') {
                let stanza = $iq({'type': 'set'})
                    .c('prefs', {xmlns: Strophe.NS.MAM, 'default': 'always'});
                $prefs.children().each(function (idx, child) {
                    stanza.cnode(child).up();
                });
                this.account.sendIQ(stanza, function (iq) {
                    feature.set('preferences', {'default': 'always'});
                });
            } else {
                feature.set('preferences', {'default': 'always'});
            }
        }
    });

    xabber.ServerInfo = Backbone.Collection.extend({
        model: xabber.ServerFeature,

        initialize: function (options) {
            this.domain = options.domain;
            this.account = options.account;
            this.connection = this.account.connection;
        },

        request: function () {
            this.connection.disco.info(this.domain, null, this.onInfo.bind(this));
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
        }
    });

      xabber.Server = Backbone.Model.extend({
          idAttribute: 'domain',
          initialize: function (models) {
              this.account = models.account;
              this.set('domain', models.domain || this.account.domain);
              this.server_features = new xabber.ServerInfo({account: this.account, domain: this.get('domain')});
              this.getServerInfo();
          },

          getServerInfo: function () {
              this.server_features.request();
          }
      });

      xabber.Servers = Backbone.Collection.extend({
          model: xabber.Server
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

        this.connection.deleteTimedHandler(this._ping_handler);
        this._ping_handler = this.connection.addTimedHandler(30000, () => {
            let downtime = moment.now() - this.last_stanza_timestamp;
            if (downtime / 1000 > (xabber.settings.reconnect_interval || 120)) {
                if (this.connection.connected)
                    this.connection.disconnect();
                else
                    this.connect();
                return false;
            }
            if (downtime / 1000 > (xabber.settings.ping_interval || 60)) {
                this.connection.ping.ping(this.get('jid'));
            }
            return true;
        });

        this.server_features.request();
    }, true, true);

    xabber.Account.addBackgroundConnPlugin(function () {
        this.last_background_stanza_timestamp = moment.now();

        this.background_connection.deleteHandler(this._last_background_stanza_handler);
        this._last_background_stanza_handler = this.background_connection.addHandler(() => {
            this.last_background_stanza_timestamp = moment.now();
            return true;
        });

        this.background_connection.deleteHandler(this._background_pong_handler);
        this._background_pong_handler = this.background_connection.ping.addPingHandler((ping) => {
            this.last_background_stanza_timestamp = moment.now();
            this.background_connection.ping.pong(ping);
            return true;
        });

        this.background_connection.deleteTimedHandler(this._background_ping_handler);
        this._background_ping_handler = this.background_connection.addTimedHandler(30000, () => {
            let downtime = moment.now() - this.last_background_stanza_timestamp;
            if (downtime / 1000 > (xabber.settings.reconnect_interval || 120)) {
                if (this.background_connection.connected)
                    this.background_connection.disconnect();
                else
                    this.background_connection.connect('password', this.background_connection.jid, this.background_connection.pass);
                return false;
            }
            if (downtime / 1000 > (xabber.settings.ping_interval || 60)) {
                this.background_connection.ping.ping(this.background_connection.jid);
            }
            return true;
        });
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

        this.fast_connection.deleteTimedHandler(this._fast_ping_handler);
        this._fast_ping_handler = this.fast_connection.addTimedHandler(30000, () => {
            let downtime = moment.now() - this.last_fast_stanza_timestamp;
            if (downtime / 1000 > (xabber.settings.reconnect_interval || 120)) {
                if (this.fast_connection.connected)
                    this.fast_connection.disconnect();
                else
                    this.fast_connection.connect('password', this.fast_connection.jid, this.fast_connection.pass);
                return false;
            }
            if (downtime / 1000 > (xabber.settings.ping_interval || 60)) {
                this.fast_connection.ping.ping(this.fast_connection.jid);
            }
            return true;
        });
    }, true, true);

    xabber.Account.addConnPlugin(function () {
        let disco = this.connection.disco;
        this.connection.addHandler(disco._onDiscoInfo.bind(disco),
                Strophe.NS.DISCO_INFO, 'iq', 'get', null, null);
        this.connection.addHandler(disco._onDiscoItems.bind(disco),
                Strophe.NS.DISCO_ITEMS, 'iq', 'get', null, null);
    }, false, true);

    return xabber;
  };
});
