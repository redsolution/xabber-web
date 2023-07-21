import env from "xabber-environment";

let constants = env.constants,
    _ = env._,
    $ = env.$,
    moment = env.moment,
    client_translation_progress = env.client_translation_progress,
    xabber_i18next = env.xabber_i18next,
    xabber_i18next_sprintf = env.xabber_i18next_sprintf,
    uuid = env.uuid,
    utils = env.utils,
    bc = new BroadcastChannel("xabber-web");

bc.onmessage = (event) => {
    if (event.data === `1` && !bc.disabled_client) {
        bc.postMessage(`2`);
    }
    if (event.data === `2`) {
        bc.disabled_client = true
    }
};

bc.postMessage(`1`);

let Xabber = Backbone.Model.extend({
    defaults: {
        version_number: env.version_number,
        actual_version_number: env.version_number,
        audio: false,
        video: false,
        client_id: uuid().substring(0, 8),
        client_name: 'Xabber for Web'
    },

    initialize: function () {
        this.env = env;
        this.fetchURLParams();
        this.cleanUpStorage();
        this.initDefaultLanguage();
        this.detectMediaDevices();
        window.navigator.mediaDevices && (window.navigator.mediaDevices.ondevicechange = this.detectMediaDevices.bind(this));
        this._settings = new this.Settings({id: 'settings'},
                {storage_name: this.getStorageName(), fetch: 'before'});
        this.settings = this._settings.attributes;
        let url = window.location.host + window.location.pathname.replace(/\//g, "-");
        if (url[url.length - 1] == "-")
            url.slice(0, url.length - 1);
        this._cache = new Backbone.ModelWithStorage({id: `cache-${url}`},
                {storage_name: this.getStorageName(), fetch: 'before'});
        this.cache = this._cache.attributes;
        this.cache.client_id && (this.set('client_id', this.cache.client_id));
        this._cache.save('client_id', this.get('client_id'));
        this.cacheFavicons();
        this.extendFunction();
        this.check_config = new $.Deferred();
        this.plyr_players = [];
        this.current_plyr_player = null;
        this.on("change:actual_version_number", this.throwNewVersion, this);
        this.on("quit", this.onQuit, this);
        this._version_interval = setInterval(this.readActualVersion.bind(this), 600000);

        window.ononline = () => {
            this.disconnectWhenConnecting();
        };
        // setInterval(function() {
        //     console.log(new Date());
        // }, 5000)
    },

    initDefaultLanguage: function () {
        let lang = window.navigator.language,
            progress = Object.keys(client_translation_progress).find(key => !lang.indexOf(key)) || constants.languages_another_locales[lang] && Object.keys(client_translation_progress).find(key => !constants.languages_another_locales[lang].indexOf(key));
        if (progress != 100)
            lang = 'en';
        this.set("default_language", lang);
    },

    loadTranslations: async function (lang) {
        return new Promise((resolve, reject) => {
            let language = {};
            language.lang = lang;
            !language.lang && (language.lang = this.settings.language);
            if (language.lang == 'default' && this.default_translation) {
                language.lang = this.get("default_language");
                language.translation  = this.default_translation;
                resolve(language);
                return;
            }
            import(`~/translations/${language.lang.replace(/-/g, "-r")}.js`).then(translation => {
                language.translation  = translation;
                resolve(language)
            });
        });
    },

    setLocale: function (lang, translations) {
        let default_lang = this.get("default_language"),
            _translations = {
                [default_lang]: {
                    translation: this.default_translation
                }
            };
        lang && (_translations[lang] = {translation: translations});
        xabber_i18next.use(xabber_i18next_sprintf);
        xabber_i18next.init({
            lng: default_lang,
            debug: false,
            pluralSeparator: '-',
            resources: _translations
        });
        if (lang) {
            xabber_i18next.changeLanguage(lang);
            moment.locale(lang);
        }
        xabber_i18next.default_lang = xabber_i18next.getFixedT(default_lang);
    },
    getOneLiners: function () {
        if (xabber_i18next.exists("motivating_oneliner")) {
            return xabber_i18next.t("motivating_oneliner").replace(/\\'/g, "'").split('\n');
        } else if (xabber_i18next.default_lang) {
            return xabber_i18next.default_lang("motivating_oneliner").replace(/\\'/g, "'").split('\n');
        } else
            return [];
    },
    getString: function (id, params) {
        if (xabber_i18next.exists(id)) {
            return xabber_i18next.t(id, { postProcess: 'sprintf', sprintf: params}).replace(/\\'/g, "'").replace(/%+\d+[$]/g, "%").replace(/\\n/g, '&#10;');
        } else if (xabber_i18next.default_lang) {
            return xabber_i18next.default_lang(id, { postProcess: 'sprintf', sprintf: params}).replace(/\\'/g, "'").replace(/%+\d+[$]/g, "%").replace(/\\n/g, '&#10;');
        } else
            return "";
    },

    getQuantityString: function (id, count, params) {
        let lang = xabber_i18next.language,
            plurals = xabber_i18next.services.pluralResolver.getRule(lang);
        if (!plurals)
            return this.getString(`${id}_plural_0`, (params || [count]));
        let _count = parseInt(count, 10);
        xabber_i18next.services.pluralResolver.options.compatibilityJSON = 'v0';
        let suffix = xabber_i18next.services.pluralResolver.getSuffix(lang, _count);
        suffix = suffix.replace(/-/g, "_");
        if (xabber_i18next.language == 'en' || !xabber_i18next.exists(`${id}_plural${suffix}`)) {
            suffix = xabber_i18next.services.pluralResolver.getSuffix("en", _count);
            if (!suffix || suffix && !suffix.length)
                suffix = '_0';
            else
                suffix = '_1';
        }
        return this.getString(`${id}_plural${suffix}`, (params || [count]));
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

    pretty_last_seen: function (seconds) {
        if (seconds >= 0 && seconds <= 120)
            return this.getString("last_seen_now");
        if (seconds > 120 && seconds < 3600)
            return this.getString("last_seen_minutes", [Math.trunc(seconds/60)]);
        if (seconds >= 3600 && seconds < 7200)
            return this.getString("last_seen_hours");
        if (seconds >= 3600*48*2)
            return this.getString("last_seen_date", [env.moment().subtract(seconds, 'seconds').format('LL')]);
        else
            return this.getString("last_seen_date", [env.moment().subtract(seconds, 'seconds').calendar().toLowerCase()]);
    },

    readActualVersion: function () {
        if (!constants.CHECK_VERSION)
            return;
        // get version.js file from server and parse it
        let rawFile = new XMLHttpRequest();
        rawFile.open("GET", "version.js?"+uuid(), true);
        rawFile.onreadystatechange = () => {
            if (rawFile.readyState === 4 && rawFile.status === 200) {
                let text, json;
                rawFile.onreadystatechange = null;
                try {
                    text = rawFile.responseText;
                    json = JSON.parse(text.split('\n')[1].slice(1, -1));
                } catch (e) {
                    return;
                }
                this.set({
                    actual_version_number: json.version_number,
                    version_description: json.version_description
                });
            }
        };
        rawFile.send();
    },

    extendFunction: function () {
        if (!String.prototype.trimStart) {
            String.prototype.trimStart = function () {
                return this.replace(/^\s+/, '');
            }
        }
        if (!String.prototype.trimEnd) {
            String.prototype.trimEnd = function () {
                return Array.from(Array.from(this).reverse().join("").trimStart(/\s$/, '')).reverse().join("");
            }
        }
    },

    onQuit: function () {
        if (window.indexedDB.databases) {
            window.indexedDB.databases().then((a) => {
                a.forEach((db) => {
                    window.indexedDB.deleteDatabase(db.name)
                });
            });
        } else {
            this.accounts.forEach((acc) => {
                indexedDB.deleteDatabase(acc.cached_roster.database.name);
                indexedDB.deleteDatabase(acc.cached_sync_conversations.database.name);
                indexedDB.deleteDatabase(acc.cached_server_features.database.name);
            });
        }
        let full_storage_name = this.getStorageName();
        for (let key in window.localStorage) {
            if (key.startsWith(full_storage_name) || key.startsWith(constants.STORAGE_NAME + '-' + constants.STORAGE_VERSION + '-' + this.cache.id)) {
                window.localStorage.removeItem(key);
            }
        }
    },

    cacheFavicons: async function () {
        this._cache.save('favicon', URL.createObjectURL(await fetch(constants.FAVICON_DEFAULT).then(r => r.blob())));
        this._cache.save('favicon_gray', URL.createObjectURL(await fetch(constants.FAVICON_DEFAULT_GREY).then(r => r.blob())));
        this._cache.save('favicon_message', URL.createObjectURL(await fetch(constants.FAVICON_MESSAGE).then(r => r.blob())));
    },

    detectMediaDevices: function () {
        this.getMediaDevices((media_devices) => {
            this.set(media_devices);
        });
    },

    getMediaDevices: function (callback, errback) {
        if (window.navigator && window.navigator.mediaDevices) {
            window.navigator.mediaDevices.enumerateDevices()
                .then((devices) => {
                    let media_devices = {audio: false, video: false};
                    (devices.find(device => device.kind === 'audioinput')) && (media_devices.audio = true);
                    (devices.find(device => device.kind === 'videoinput')) && (media_devices.video = true);
                    callback && callback(media_devices);
                })
                .catch((err) => {
                    errback && errback(err);
                });
        }
    },

    throwNewVersion: function () {
        if (!constants.CHECK_VERSION)
            return;
        let version_number = this.get('actual_version_number'),
            version_description = this.get('version_description');
        utils.dialogs.common(this.getString("dialog_version_update__header", [constants.CLIENT_NAME]), `${this.getString("dialog_version_update__confirm_text__new_version", [version_number])}<div class="new-version-description">${version_description}</div>${this.getString("dialog_version_update__confirm_text__question_reload_page")}`,
            {ok_button: {text: this.getString("dialog_version_update__button_reload")}, cancel_button: {text: this.getString("dialog_version_update__option_not_now")}}
        ).done((result) => {
            if (result) {
                window.location.reload(true);
            }
        });
    },

    Settings: Backbone.ModelWithStorage.extend({
        defaults: {
            max_connection_retries: -1,
            idling: true,
            notifications: true,
            notifications_private: true,
            notifications_group: true,
            notifications_volume: 0.50,
            message_preview_private: false,
            message_preview_group: false,
            private_sound: true,
            group_sound: true,
            background: {type: 'default'},
            side_panel: {theme: 'dark', blur: false, transparency: 50},
            appearance: {blur: 0, vignetting: 0, color: '#E0E0E0'},
            main_color: 'default',
            sound_on_private_message: 'beep_up',
            sound_on_group_message: 'beep_up',
            call_attention: true,
            load_media: 'default',
            typing_notifications: 'default',
            mapping_service: 'default',
            sound_on_call: 'call',
            sound_on_dialtone: 'call',
            sound_on_connection: 'connecting',
            sound_on_attention: 'attention',
            sound_on_auth_request: 'beep_a',
            hotkeys: 'enter',
            avatar_shape: 'circle',
            language: 'default',
            load_history: true,
            mam_requests_limit: 200,
            mam_messages_limit_start: 1,
            mam_messages_limit: 20,
        }
    }),

    start: function () {
        this.check_config.done((result) => {
            this.check_config = undefined;
            result && this.trigger('start');
        });
    },

    configure: function (config) {
        this.loadTranslations(this.get('default_language')).then((language) => {
            this.default_translation = language.translation ;
            return this.loadTranslations();}).then((language) => {
                this.setLocale(language.lang, language.translation);
            _.extend(constants, _.pick(config, [
                'CONNECTION_URL',
                'PERSONAL_AREA_URL',
                'LOG_LEVEL',
                'SYNCHRONIZATION_RSM_MAX',
                'CONTAINER_ELEMENT',
                'XABBER_ACCOUNT_URL',
                'REGISTER_XMPP_ACCOUNT',
                'REGISTER_XMPP_ACCOUNT_URL',
                'REGISTER_XMPP_ACCOUNT_TEXT',
                'API_SERVICE_URL',
                'USE_SOCIAL_AUTH',
                'CONTAINER',
                'CHECK_VERSION',
                'DEFAULT_LOGIN_SCREEN',
                'STORAGE_NAME_ENDING',
                'CLIENT_NAME',
                'SHORT_CLIENT_NAME',
                'CLIENT_LOGO',
                'TOOLBAR_LOGO',
                'ENABLE_XABBER_ACCOUNT',
                'SCREEN_ABOUT',
                'DISABLE_LOOKUP_WS',
                'PRIVACY_LOAD_MEDIA',
                'PRIVACY_TYPING_NOTIFICATIONS',
                'PRIVACY_MAPPING_SERVICE',
            ]));

            let log_level = constants['LOG_LEVEL_'+constants.LOG_LEVEL];
            constants.LOG_LEVEL = log_level || constants.LOG_LEVEL_ERROR;
            constants.MATERIAL_COLORS.includes(config.MAIN_COLOR) && (constants.MAIN_COLOR = config.MAIN_COLOR);
            (this._settings.get("main_color") == 'default') && this._settings.set("main_color", constants.MAIN_COLOR);
            this.trigger("update_main_color");
            if (this._settings.get("load_media") === 'default' && config.PRIVACY_LOAD_MEDIA != null)
                this._settings.set("load_media", config.PRIVACY_LOAD_MEDIA);
            else if (this._settings.get("load_media") === 'default')
                this._settings.set("load_media", true);
            if (this._settings.get("typing_notifications") === 'default' && config.PRIVACY_TYPING_NOTIFICATIONS != null)
                this._settings.set("typing_notifications", config.PRIVACY_TYPING_NOTIFICATIONS);
            else if (this._settings.get("typing_notifications") === 'default')
                this._settings.set("typing_notifications", true);
            if (this._settings.get("mapping_service") === 'default' && config.PRIVACY_MAPPING_SERVICE != null)
                this._settings.set("mapping_service", config.PRIVACY_MAPPING_SERVICE);
            else if (this._settings.get("mapping_service") === 'default')
                this._settings.set("mapping_service", true);

            window.xabber = this;
            _.extend(window, env);
            if (config.SYNCHRONIZATION_RSM_MAX)
                constants.SYNCHRONIZATION_RSM_MAX = config.SYNCHRONIZATION_RSM_MAX;
            if (config.CONTAINER_ELEMENT)
                constants.CONTAINER_ELEMENT = config.CONTAINER_ELEMENT;
            if (config.REGISTRATION_DOMAINS)
                constants.REGISTRATION_DOMAINS = config.REGISTRATION_DOMAINS;
            if (config.LOGIN_DOMAINS)
                constants.LOGIN_DOMAINS = config.LOGIN_DOMAINS;
            if (config.TRUSTED_DOMAINS)
                constants.TRUSTED_DOMAINS = config.TRUSTED_DOMAINS;
            if (config.RECOMMENDED_DOMAIN)
                constants.RECOMMENDED_DOMAIN = config.RECOMMENDED_DOMAIN;
            if (config.DOWNTIME_RECONNECTION_TIMEOUT)
                constants.DOWNTIME_RECONNECTION_TIMEOUT = config.DOWNTIME_RECONNECTION_TIMEOUT;
            if (config.PING_SENDING_INTERVAL)
                constants.PING_SENDING_INTERVAL = config.PING_SENDING_INTERVAL;
            if (config.REGISTRATION_BUTTON != null)
                constants.REGISTRATION_BUTTON = config.REGISTRATION_BUTTON;
            if (config.REGISTRATION_CUSTOM_DOMAIN != null)
                constants.REGISTRATION_CUSTOM_DOMAIN = config.REGISTRATION_CUSTOM_DOMAIN;
            if (config.LOGIN_CUSTOM_DOMAIN != null)
                constants.LOGIN_CUSTOM_DOMAIN = config.LOGIN_CUSTOM_DOMAIN;
            if (config.SHORT_CLIENT_DESCRIPTION)
                constants.SHORT_CLIENT_DESCRIPTION = config.SHORT_CLIENT_DESCRIPTION;

            if (config.CLIENT_NAME && !config.SHORT_CLIENT_NAME)
                constants.SHORT_CLIENT_NAME = config.CLIENT_NAME;
            else if (!config.CLIENT_NAME && config.SHORT_CLIENT_NAME)
                constants.CLIENT_NAME = config.SHORT_CLIENT_NAME;

            if (config.TURN_SERVERS_LIST) {
                if (_.isArray(config.TURN_SERVERS_LIST))
                    _.extend(constants, {TURN_SERVERS_LIST: config.TURN_SERVERS_LIST});
                else if (_.isObject(config.TURN_SERVERS_LIST) && Object.keys(config.TURN_SERVERS_LIST).length)
                    _.extend(constants, {TURN_SERVERS_LIST: [config.TURN_SERVERS_LIST]});
            }

            if (utils.isMobile.any()) {
                let ios_msg = this.getString("warning__client_not_support_ios_browser", [constants.CLIENT_NAME]),
                    android_msg = this.getString("warning__client_not_support_android_browser"),
                    any_mobile_msg = this.getString("warning__client_not_support_mobile", [constants.CLIENT_NAME]),
                    msg;
                if (utils.isMobile.iOS()) {
                    msg = ios_msg;
                } else if (utils.isMobile.Android()) {
                    msg = any_mobile_msg + android_msg;
                } else {
                    msg = any_mobile_msg;
                }
                utils.dialogs.error(msg);
                this.check_config.resolve(false);
                return;
            }
            if (!constants.CONNECTION_URL) {
                utils.dialogs.error(this.getString("client_error__missing_connection_url"));
                this.check_config.resolve(false);
                return;
            }
            if (bc.disabled_client){
                utils.dialogs.error(this.getString("client_error__another_tab_active"));
                this.check_config.resolve(false);
                return;
            }

            let self = this;
            if (!Backbone.useLocalStorage && !this.cache.ignore_localstorage_warning) {
                utils.dialogs.warning(this.getString("client_warning__no_local_storage"),
                    [{name: this.getString("ignore"), text: this.getString("client_error__option_show_msg_again")}]
                ).done(function (res) {
                    res && res.ignore && self._cache.save('ignore_localstorage_warning', true);
                });
            }

            this.requestNotifications().done(function (granted) {
                self._cache.save('notifications', granted);
                self._cache.save('endpoint_key', undefined);
                self.check_config.resolve(true);
            });
        });
    },

    fetchURLParams: function () {
        let splitted_url = window.location.href.split(/[?#]/),
            splitted_url_anchor = window.location.href.split('#');
        this.url_params = {};
        if (splitted_url.length > 1) {
            let idx, param, params = splitted_url[1].split('&');
            for (idx = 0; idx < params.length; idx++) {
                param = params[idx].split('=');
                if (param.length === 1) {
                    this.url_params[param[0]] = null;
                } else {
                    this.url_params[param[0]] = param[1];
                }
            }
        }
        if (splitted_url_anchor.length > 1) {
            this.url_params['anchor'] = splitted_url[1];
        }
        window.history.pushState(null, null, window.location.pathname);
    },

    getStorageName: function () {
        let name = constants.STORAGE_NAME + '-' + constants.STORAGE_VERSION;
        if (constants.STORAGE_NAME_ENDING) {
            name = name + '-' + constants.STORAGE_NAME_ENDING;
        }
        return name;
    },

    cleanUpStorage: function () {
        let full_storage_name = constants.STORAGE_NAME + '-' + constants.STORAGE_VERSION;
        for (let key in window.localStorage) {
            if (key.startsWith('xabber') &&
                    !key.startsWith(full_storage_name)) {
                window.localStorage.removeItem(key);
            }
        }
    },

    requestNotifications: function () {
        let result = new $.Deferred(),
            self = this;
        if (!window.Notification) {
            result.resolve(null);
        } else if (window.Notification.permission === 'granted') {
            result.resolve(true);
        } else {
            if (!self.cache.ignore_notifications_warning)
                self.notifications_placeholder = new self.NotificationsPlaceholder();
            result.resolve(false);
        }
        return result.promise();
    },

    updateFaviconConnected: function () {
        let is_disconnected = false;
        this.accounts.each((account) => {
            if (account.get('enabled') && (!account.isConnected() || (account.session && account.session.get('auth_failed')))){
                is_disconnected = true;
                return;
            }
        });
        this.updateAllMessageCounterOnDisconnect(is_disconnected);
    },

    disconnectWhenConnecting: function (is_fast) {
        this.accounts.each((account) => {
            if (account.session && account.connection && account.get('enabled') && !account.session.get('reconnecting') && !account.session.get('connected')){
                account.activate();
            }
        });
    },

    extendWith: function () {
        return _.reduce(arguments, function (instance, module) {
            return instance;
        }, this);
    }
});

export default new Xabber();
