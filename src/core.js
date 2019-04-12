(function (root, factory) {
    define("xabber-core", ["xabber-environment"], function (env) {
        return factory(env);
    });
}(this, function (env) {
    var constants = env.constants,
        _ = env._,
        $ = env.$,
        uuid = env.uuid,
        utils = env.utils;

    var Xabber = Backbone.Model.extend({
        defaults: {
            version_number: env.version_number,
            actual_version_number: env.version_number,
            client_id: uuid().substring(0, 8),
            client_name: 'Xabber Web ' + env.version_number
        },

        initialize: function () {
            this.env = env;
            this.fetchURLParams();
            this.cleanUpStorage();
            this._settings = new this.Settings({id: 'settings'},
                    {storage_name: this.getStorageName(), fetch: 'before'});
            this.settings = this._settings.attributes;
            this._cache = new Backbone.ModelWithStorage({id: 'cache'},
                    {storage_name: this.getStorageName(), fetch: 'before'});
            this.cache = this._cache.attributes;
            this.check_config = new $.Deferred();
            this.on("change:actual_version_number", this.throwNewVersion, this);
            this._version_interval = setInterval(this.readActualVersion.bind(this), 600000);
        },

        error: function (msg) {
            if (constants.LOG_LEVEL >= constants.LOG_LEVEL_ERROR) {
                console.error(msg);
            }
        },

        warn: function (msg) {
            if (constants.LOG_LEVEL >= constants.LOG_LEVEL_WARN) {
                console.warn(msg);
            }
        },

        info: function (msg) {
            if (constants.LOG_LEVEL >= constants.LOG_LEVEL_INFO) {
                console.log(msg);
            }
        },

        debug: function (msg) {
            if (constants.LOG_LEVEL >= constants.LOG_LEVEL_DEBUG) {
                console.log(msg);
            }
        },

        readActualVersion: function () {
            // get version.js file from server and parse it
            var rawFile = new XMLHttpRequest();
            rawFile.open("GET", "version.js?"+uuid(), true);
            rawFile.onreadystatechange = function () {
                if (rawFile.readyState === 4 && rawFile.status === 200) {
                    rawFile.onreadystatechange = null;
                    try {
                        var text = rawFile.responseText,
                            json = JSON.parse(text.split('\n')[1].slice(1, -1));
                    } catch (e) {
                        return;
                    }
                    this.set({
                        actual_version_number: json.version_number,
                        version_description: json.version_description
                    });
                }
            }.bind(this);
            rawFile.send();
        },

        throwNewVersion: function () {
            var version_number = this.get('actual_version_number'),
                version_description = this.get('version_description');
            utils.dialogs.common(
                'Update Xabber Web',
                'New version '+version_number+' is available. '
                +'<div class="new-version-description">'+version_description+'</div>'
                +' Reload page to fetch this changes?',
                {ok_button: {text: 'yes'}, cancel_button: {text: 'not now'}}
            ).done(function (result) {
                if (result) {
                    // window.localStorage.clear();
                    window.location.reload(true);
                }
            });
        },

        Settings: Backbone.ModelWithStorage.extend({
            defaults: {
                max_connection_retries: -1,
                notifications: true,
                message_preview: false,
                sound: true,
                sound_on_message: 'beep_up',
                sound_on_auth_request: 'beep_a',
                hotkeys: 'enter',
                load_history: true,
                mam_requests_limit: 200,
                mam_messages_limit_start: 1,
                mam_messages_limit: 20,
                ping_interval: 60,
                reconnect_interval: 120
            }
        }),

        start: function () {
            this.check_config.done(function (result) {
                this.check_config = undefined;
                result && this.trigger('start');
            }.bind(this));
        },

        configure: function (config) {
            _.extend(constants, _.pick(config, [
                'CONNECTION_URL',
                'XMPP_SERVER_GROUPCHATS',
                'LOG_LEVEL',
                'DEBUG',
                'XABBER_ACCOUNT_URL',
                'API_SERVICE_URL',
                'USE_SOCIAL_AUTH',
                'DEFAULT_LOGIN_SCREEN',
                'STORAGE_NAME_ENDING',
                'DISABLE_LOOKUP_WS'
            ]));

            var log_level = constants['LOG_LEVEL_'+constants.LOG_LEVEL];
            constants.LOG_LEVEL = log_level || constants.LOG_LEVEL_ERROR;

            if (constants.DEBUG) {
                window.xabber = this;
                _.extend(window, env);
            }

            if (utils.isMobile.any()) {
                var ios_msg = 'Sorry, but Xabber for Web does not support iOS browsers. ',
                    android_msg = 'You should use Xabber for Android client.',
                    any_mobile_msg = 'Sorry, but Xabber for Web may not work correctly on your device. ',
                    goto_site_msg = 'Go to <a href="www.xabber.com">Xabber site</a> for more details.',
                    msg;
                if (utils.isMobile.iOS()) {
                    msg = ios_msg + goto_site_msg;
                } else if (utils.isMobile.Android()) {
                    msg = any_mobile_msg + android_msg;
                } else {
                    msg = any_mobile_msg + goto_site_msg;
                }
                utils.dialogs.error(msg);
                this.check_config.resolve(false);
                return;
            }
            if (!constants.CONNECTION_URL) {
                utils.dialogs.error('Missing connection URL!');
                this.check_config.resolve(false);
                return;
            }

            var self = this;
            if (!Backbone.useLocalStorage && !this.cache.ignore_localstorage_warning) {
                utils.dialogs.warning(
                    'Your web browser does not support storing data locally. '+
                    'In Safari, the most common cause of this is using "Private Browsing Mode". '+
                    'So, you will need log in after page refresh again.',
                    [{name: 'ignore', text: 'Don\'t show this message again'}]
                ).done(function (res) {
                    res && res.ignore && self._cache.save('ignore_localstorage_warning', true);
                });
            }

            this.requestNotifications().done(function (granted) {
                self._cache.save('notifications', granted);
                if (granted && 'serviceWorker' in navigator && 'PushManager' in window) {
                    self.setUpPushNotifications().done(function (res) {
                        if (res !== true) {
                            utils.dialogs.error('Could not enable push notifications! '+res);
                        }
                        self.check_config.resolve(true);
                    });
                } else {
                    if (granted && !self.cache.ignore_push_warning) {
                        utils.dialogs.warning('Push notifications are not supported',
                            [{name: 'ignore', text: 'Don\'t show this message again'}]
                        ).done(function (res) {
                            res && res.ignore && self._cache.save('ignore_push_warning', true);
                        });
                    }
                    self._cache.save('endpoint_key', undefined);
                    self.check_config.resolve(true);
                }
            });
        },

        fetchURLParams: function () {
            var splitted_url = window.location.href.split(/[?#]/);
            this.url_params = {};
            if (splitted_url.length > 1) {
                var idx, param, params = splitted_url[1].split('&');
                for (idx = 0; idx < params.length; idx++) {
                    param = params[idx].split('=');
                    if (param.length === 1) {
                        this.url_params[param[0]] = null;
                    } else {
                        this.url_params[param[0]] = param[1];
                    }
                }
            }
            window.history.pushState(null, null, window.location.pathname);
        },

        getStorageName: function () {
            var name = constants.STORAGE_NAME + '-' + constants.STORAGE_VERSION;
            if (constants.STORAGE_NAME_ENDING) {
                name = name + '-' + constants.STORAGE_NAME_ENDING;
            }
            return name;
        },

        cleanUpStorage: function () {
            var full_storage_name = constants.STORAGE_NAME + '-' + constants.STORAGE_VERSION;
            for (var key in window.localStorage) {
                if (key.startsWith('xabber') &&
                        !key.startsWith(full_storage_name)) {
                    window.localStorage.removeItem(key);
                }
            }
        },

        requestNotifications: function () {
            var result = new $.Deferred(),
                self = this;
            if (!window.Notification) {
                if (!self.cache.ignore_notifications_warning) {
                    utils.dialogs.warning(
                        'Notifications are not supported.',
                        [{name: 'ignore', text: 'Don\'t show this message again'}]
                    ).done(function (res) {
                        res && res.ignore && self._cache.save('ignore_notifications_warning', true);
                    });
                }
                result.resolve(false);
            } else if (window.Notification.permission === 'granted') {
                result.resolve(true);
            } else {
                window.Notification.requestPermission(function (permission) {
                    if (permission !== 'granted' && !self.cache.ignore_push_warning) {
                        utils.dialogs.warning(
                            'You should allow popup notifications for this site if you want '+
                            'to receive popups on new messages and some important push notifications.',
                            [{name: 'ignore', text: 'Don\'t show this message again'}]
                        ).done(function (res) {
                            res && res.ignore && self._cache.save('ignore_push_warning', true);
                        });
                    }
                    result.resolve(permission === 'granted');
                });
            }
            return result.promise();
        },

        setUpPushNotifications: function () {
            var result = new $.Deferred(),
                self = this;

            firebase.initializeApp({
                apiKey: constants.GCM_API_KEY,
                messagingSenderId: constants.GCM_SENDER_ID
            });

            navigator.serviceWorker.register('./firebase-messaging-sw.js').then((registration) => {
                firebase.messaging().useServiceWorker(registration);

                self.messaging = firebase.messaging();
                self.messaging.requestPermission().then(function () {
                    self.messaging.getToken().then(function (currentToken) {
                        self._cache.save('endpoint_key', currentToken || undefined);
                        result.resolve(currentToken ? true : 'No Instance ID token available.');
                    }).catch(function (err) {
                        result.resolve(err);
                    });

                    self.messaging.onTokenRefresh(function () {
                        self.messaging.getToken().then(function (refreshedToken) {
                            self._cache.save('endpoint_key', refreshedToken);
                        }).catch(function (err) {
                            // TODO
                        });
                    });

                    navigator.serviceWorker.addEventListener('message', function (event) {
                        var data = event.data;
                        if (data['firebase-messaging-msg-type'] === 'push-msg-received') {
                            var message = data['firebase-messaging-msg-data'];
                            if (message && message.data && message.from === constants.GCM_SENDER_ID) {
                                var payload;
                                try {
                                    payload = JSON.parse(atob(message.data.body));
                                } catch (e) {
                                    payload = message.data;
                                }
                                self.trigger('push_message', payload);
                            }
                        }
                    });
                }).catch(function (err) {
                    result.resolve({'error': err});
                });
            });
            return result.promise();
        },

        extendWith: function () {
            return _.reduce(arguments, function (instance, module) {
                return module(instance);
            }, this);
        }
    });

    return new Xabber();
}));
