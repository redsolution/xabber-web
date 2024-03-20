require.config({
    baseUrl: ".",

    include: "xabber",

    out: "dist/xabber.js",

    paths: {
        // external libs
        "backbone":                 "node_modules/backbone/backbone",
        "underscore":               "node_modules/underscore/underscore",
        "jquery":                   "node_modules/jquery/dist/jquery",
        "moment":                   "node_modules/moment/min/moment-with-locales.min",
        "moment-locales":           "node_modules/moment/min/locales.min",
        "perfectScrollbarJQuery":   "node_modules/perfect-scrollbar/dist/js/perfect-scrollbar.jquery",
        "strophe":                  "node_modules/strophe.js/strophe",
        "strophe.disco":            "node_modules/strophejs-plugins/disco/strophe.disco",
        "strophe.ping":             "node_modules/strophejs-plugins/ping/strophe.ping",
        "strophe.rsm":              "node_modules/strophejs-plugins/rsm/strophe.rsm",
        "text":                     "node_modules/requirejs-text/text",
        "wavesurfer":               "node_modules/wavesurfer/dist/wavesurfer",
        "slug":                     "node_modules/slug/slug",
        "sha256":                   "node_modules/js-sha256/src/sha256",
        "magnific-popup":           "node_modules/magnific-popup/dist/jquery.magnific-popup",
        "i18next":                  "node_modules/i18next/i18next.min",

        // modified libs and plugins
        "Plyr":                     "src/lib/plyr",
        "backbone.localsync":       "src/lib/backbone.localsync",
        "hammerjs":                 "src/lib/hammer.min",
        "materialize":              "src/lib/materialize",
        "strophe.caps":             "src/lib/strophe.caps",
        "strophe.pubsub":           "src/lib/strophe.pubsub",
        "sha1_hasher":              "src/lib/sha1.min",
        "omemo":                    "src/lib/omemo",
        "qrcode":                   "src/lib/VanillaQR.min",
        "i18next-post":             "src/lib/i18nextSprintfPostProcessor.min",

        // Xabber sources
        "xabber-version":           "version",
        "xabber-dependencies":      "src/dependencies",
        "xabber-templates":         "src/templates",
        "xabber-constants":         "src/constants",
        "xabber-utils":             "src/utils/utils",
        "xabber-textarea-utils":    "src/utils/textarea",
        "xabber-emoji-utils":       "src/utils/emoji",
        "xabber-image-utils":       "src/utils/images",
        "xabber-modal-utils":       "src/utils/modals",
        "xabber-environment":       "src/environment",

        "xabber-core":              "src/core",
        "xabber-views":             "src/views",
        "xabber-api-service":       "src/api-service",
        "xabber-strophe":           "src/strophe",
        "xabber-accounts":          "src/accounts",
        "xabber-discovery":         "src/discovery",
        "xabber-vcard":             "src/vcard",
        "xabber-contacts":          "src/contacts",
        "xabber-chats":             "src/chats",
        "xabber-searching":         "src/searching",
        "xabber-mentions":          "src/mentions",
        "xabber-ui":                "src/ui",
        "xabber-omemo":             "src/omemo",
        "xabber-trust":             "src/trust",

        "xabber-translations-info": "translations/translation_progress",

        // main file
        "xabber":                   "src/xabber"
    }
});
