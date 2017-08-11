(function (root, factory) {
    define("xabber-core", ["xabber-environment"], function (env) {
        return factory(env);
    });
}(this, function (env) {
    var constants = env.constants,
        _ = env._,
        uuid = env.uuid,
        utils = env.utils;

    var Xabber = Backbone.Model.extend({
        defaults: {
            version_number: env.version_number,
            actual_version_number: env.version_number,
            client_id: uuid().substring(0, 18),
            client_name: 'Xabber Web ' + env.version_number
        },

        initialize: function () {
            this.env = env;
            this.fetchURLParams();
            this.cleanUpStorage();
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
            rawFile.open("GET", "src/version.js?"+uuid(), true);
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
                mam_requests_limit: 50,
                mam_messages_limit: 20,
                ping_interval: 180
            }
        }),

        start: function () {
            if (!constants.CONNECTION_URL) {
                alert('Missing connection URL!');
                return;
            }
            this.trigger('start');
        },

        configure: function (config) {
            _.extend(constants, _.pick(config, [
                'CONNECTION_URL',
                'LOG_LEVEL',
                'DEBUG',
                'XABBER_ACCOUNT_URL',
                'API_SERVICE_URL',
                'USE_SOCIAL_AUTH',
                'DEFAULT_LOGIN_SCREEN',
                'STORAGE_NAME_ENDING'
            ]));
            this._settings = new this.Settings({id: 'settings'},
                    {storage_name: this.getStorageName(), fetch: 'before'});
            this.settings = this._settings.attributes;

            if (this.settings.notifications) {
                window.Notification.requestPermission(function (permission) {
                    if (permission.toLowerCase() === "denied") {
                        this._settings.save('notifications', false);
                    }
                }.bind(this));
            }

            var log_level = constants['LOG_LEVEL_'+constants.LOG_LEVEL];
            constants.LOG_LEVEL = log_level || constants.LOG_LEVEL_ERROR;

            if (constants.DEBUG) {
                window.xabber = this;
                _.extend(window, env);
            }
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

        extendWith: function () {
            return _.reduce(arguments, function (instance, module) {
                return module(instance);
            }, this);
        }
    });

    return new Xabber();
}));
