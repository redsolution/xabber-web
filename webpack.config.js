var webpack = require('webpack');
const TerserPlugin = require("terser-webpack-plugin");
const path = require('path');
module.exports = {
    entry: './src/xabber.js',
    output: {
        filename: 'xabber.bundle.js',
    },
    resolve: {
        alias: {
            '~': path.resolve(__dirname),
            // external libs
            "backbone": "~/node_modules/backbone/backbone",
            "underscore": "~/node_modules/underscore/underscore",
            "jquery": "~/node_modules/jquery/dist/jquery",
            "moment": "~/node_modules/moment/min/moment-with-locales.min",
            "moment-locales": "~/node_modules/moment/min/locales.min",
            "perfectScrollbarJQuery": "~/node_modules/perfect-scrollbar/dist/js/perfect-scrollbar.jquery",
            "strophe": "~/node_modules/strophe.js/strophe",
            "strophe.disco": "~/node_modules/strophejs-plugins/disco/strophe.disco",
            "strophe.ping": "~/node_modules/strophejs-plugins/ping/strophe.ping",
            "strophe.rsm": "~/node_modules/strophejs-plugins/rsm/strophe.rsm",
            "Quill": "~/node_modules/quill/quill",
            "wavesurfer": "~/node_modules/wavesurfer/dist/wavesurfer",
            "slug": "~/node_modules/slug/slug",
            "sha256": "~/node_modules/js-sha256/src/sha256",
            "magnific-popup": "~/node_modules/magnific-popup/dist/jquery.magnific-popup",
            "i18next": "~/node_modules/i18next/i18next.min",

            // modified libs and plugins
            "Plyr": "./lib/plyr",
            "backbone.localsync": "./lib/backbone.localsync",
            "hammerjs": "~/src/lib/hammer.min",
            "materialize": "./lib/materialize",
            "strophe.caps": "./lib/strophe.caps",
            "strophe.pubsub": "~/src/lib/strophe.pubsub",
            "sha1_hasher": "./lib/sha1.min",
            "omemo": "./lib/omemo",
            "qrcode": "./lib/VanillaQR.min",
            "i18next-post": "./lib/i18nextSprintfPostProcessor.min",

            // Xabber sources
            "xabber-version": "~/version",
            "xabber-dependencies": "~/src/dependencies",
            "xabber-templates": "~/src/templates",
            "xabber-constants": "~/src/constants",
            "xabber-utils": "~/src/utils/utils",
            "xabber-textarea-utils": "~/src/utils/textarea",
            "xabber-emoji-utils": "~/src/utils/emoji",
            "xabber-image-utils": "~/src/utils/images",
            "xabber-modal-utils": "~/src/utils/modals",
            "xabber-environment": "./environment",

            "xabber-core": "./core",
            "xabber-views": "./views",
            "xabber-api-service": "./api-service",
            "xabber-strophe": "./strophe",
            "xabber-accounts": "./accounts",
            "xabber-discovery": "./discovery",
            "xabber-vcard": "./vcard",
            "xabber-contacts": "./contacts",
            "xabber-chats": "./chats",
            "xabber-searching": "./searching",
            "xabber-mentions": "./mentions",
            "xabber-ui": "./ui",
            "xabber-omemo": "./omemo",

            "xabber-translations-info": "~/translations/translation_progress",

            // main file
            "xabber": "~/src/xabber",
        }
    },
    module: {
        rules: [
            {
                test: /\.txt|\.svg$/i,
                exclude: /\.json$/,
                use: [
                    {
                        loader: 'raw-loader',
                        options: {
                            esModule: false,
                        },
                    },
                ],
            },
        ],
    },
    plugins: [
        new webpack.ProvidePlugin({
            constants: 'xabber-constants',
            templates: 'xabber-templates',
            client_translation_progress: 'xabber-translations-info',
            utils: 'xabber-utils',
            $: 'jquery',
            _: 'underscore',
            moment: 'moment',
            WaveSurfer: 'wavesurfer',
            Plyr: 'Plyr',
            slug: 'slug',
            xabber_i18next: 'i18next',
            xabber_i18next_sprintf: 'i18next-post',
            sha256: 'sha256',
            magnificPopup: 'magnific-popup',
            Strophe: 'strophe',
            Quill: [ 'Quill', 'default'],
            xabber: 'xabber'
        })
    ],
    optimization: {
        minimize: true,
        minimizer: [new TerserPlugin()],
    },
};
