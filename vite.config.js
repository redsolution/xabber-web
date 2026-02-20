import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import path from 'path';

export default defineConfig({
    plugins: [vue()],
    resolve: {
        alias: {
            '~': path.resolve(__dirname),

            // external libs
            "backbone": path.resolve(__dirname, "node_modules/backbone/backbone.js"),
            "underscore": path.resolve(__dirname, "node_modules/underscore/underscore.js"),
            "jquery": path.resolve(__dirname, "node_modules/jquery/dist/jquery.js"),
            "moment": path.resolve(__dirname, "node_modules/moment/min/moment-with-locales.js"),
            "moment-locales": path.resolve(__dirname, "node_modules/moment/min/locales.min.js"),
            "perfectScrollbarJQuery": path.resolve(__dirname, "node_modules/perfect-scrollbar/dist/js/perfect-scrollbar.jquery.js"),
            "strophe": path.resolve(__dirname, "node_modules/strophe.js/dist/strophe.esm.js"),
            "strophe.disco": path.resolve(__dirname, "src/lib/strophe.disco.js"),
            "strophe.ping": path.resolve(__dirname, "src/lib/strophe.ping.js"),
            "strophe.rsm": path.resolve(__dirname, "src/lib/strophe.rsm.js"),
            "Quill": path.resolve(__dirname, "node_modules/quill/quill.js"),
            "wavesurfer": path.resolve(__dirname, "node_modules/wavesurfer.js/dist/wavesurfer.js"),
            "slug": path.resolve(__dirname, "node_modules/slug/slug.js"),
            "sha256": path.resolve(__dirname, "node_modules/js-sha256/src/sha256.js"),
            "magnific-popup": path.resolve(__dirname, "node_modules/magnific-popup/dist/jquery.magnific-popup.js"),
            "i18next": path.resolve(__dirname, "node_modules/i18next/i18next.min.js"),
            "VanillaQR": path.resolve(__dirname, "node_modules/vanillaqr/VanillaQR.module.js"),

            // modified libs and plugins
            "Plyr": path.resolve(__dirname, "src/lib/plyr.js"),
            "libsignal-protocol": path.resolve(__dirname, "src/lib/libsignal-protocol.js"),
            "backbone.localsync": path.resolve(__dirname, "src/lib/backbone.localsync.js"),
            "hammerjs": path.resolve(__dirname, "src/lib/hammer.min.js"),
            "materialize": path.resolve(__dirname, "src/lib/materialize.js"),
            "strophe.caps": path.resolve(__dirname, "src/lib/strophe.caps.js"),
            "strophe.pubsub": path.resolve(__dirname, "src/lib/strophe.pubsub.js"),
            "sha1_hasher": path.resolve(__dirname, "src/lib/sha1.min.js"),
            "omemo": path.resolve(__dirname, "src/lib/omemo.js"),
            "strophe.sha1": path.resolve(__dirname, "src/lib/strophe-sha1.js"),
            "strophe.stream-management": path.resolve(__dirname, "src/lib/strophe.stream-management.js"),
            "qrcode": path.resolve(__dirname, "src/lib/VanillaQR.min.js"),
            "i18next-post": path.resolve(__dirname, "src/lib/i18nextSprintfPostProcessor.min.js"),
            "ol-local": path.resolve(__dirname, "src/utils/ol-local.js"),

            // Xabber sources
            "xabber-version": path.resolve(__dirname, "version.js"),
            "xabber-dependencies": path.resolve(__dirname, "src/dependencies.js"),
            "xabber-templates": path.resolve(__dirname, "src/templates.js"),
            "xabber-sounds": path.resolve(__dirname, "src/sounds.js"),
            "xabber-constants": path.resolve(__dirname, "src/constants.js"),
            "xabber-utils": path.resolve(__dirname, "src/utils/utils.js"),
            "xabber-textarea-utils": path.resolve(__dirname, "src/utils/textarea.js"),
            "xabber-emoji-utils": path.resolve(__dirname, "src/utils/emoji.js"),
            "xabber-image-utils": path.resolve(__dirname, "src/utils/images.js"),
            "xabber-modal-utils": path.resolve(__dirname, "src/utils/modals.js"),
            "xabber-environment": path.resolve(__dirname, "src/environment.js"),

            "xabber-core": path.resolve(__dirname, "src/core.js"),
            "xabber-views": path.resolve(__dirname, "src/views.js"),
            "xabber-api-service": path.resolve(__dirname, "src/api-service.js"),
            "xabber-strophe": path.resolve(__dirname, "src/strophe.js"),
            "xabber-accounts": path.resolve(__dirname, "src/accounts.js"),
            "xabber-discovery": path.resolve(__dirname, "src/discovery.js"),
            "xabber-vcard": path.resolve(__dirname, "src/vcard.js"),
            "xabber-contacts": path.resolve(__dirname, "src/contacts.js"),
            "xabber-chats": path.resolve(__dirname, "src/chats.js"),
            "xabber-searching": path.resolve(__dirname, "src/searching.js"),
            "xabber-mentions": path.resolve(__dirname, "src/mentions.js"),
            "xabber-ui": path.resolve(__dirname, "src/ui.js"),
            "xabber-omemo": path.resolve(__dirname, "src/omemo.js"),
            "xabber-trust": path.resolve(__dirname, "src/trust.js"),
            "xabber-notifications": path.resolve(__dirname, "src/notifications.js"),
            "xabber-calls": path.resolve(__dirname, "src/calls.js"),

            "xabber-translations-info": path.resolve(__dirname, "translations/translation_progress.js"),

            // xep modules
            "xabber-xep0280": path.resolve(__dirname, "src/xep_modules/xep0280.js"),
            "xabber-xep-rewrite": path.resolve(__dirname, "src/xep_modules/xep-rewrite.js"),
            "xabber-xep-delivery": path.resolve(__dirname, "src/xep_modules/xep-delivery.js"),
            "xabber-xep-devices": path.resolve(__dirname, "src/xep_modules/xep-devices.js"),
            "xabber-xep0060": path.resolve(__dirname, "src/xep_modules/xep0060.js"),
            "xabber-xep0224": path.resolve(__dirname, "src/xep_modules/xep0224.js"),
            "xabber-xep-groups": path.resolve(__dirname, "src/xep_modules/xep-groups.js"),
            "xabber-xep-forwards": path.resolve(__dirname, "src/xep_modules/xep-forwards.js"),
            "xabber-xep-favorites": path.resolve(__dirname, "src/xep_modules/xep-favorites.js"),
            "xabber-xep0466": path.resolve(__dirname, "src/xep_modules/xep0466.js"),
            "xabber-xep0353": path.resolve(__dirname, "src/xep_modules/xep0353.js"),
            "xabber-xep0333": path.resolve(__dirname, "src/xep_modules/xep0333.js"),

            // main file
            "xabber": path.resolve(__dirname, "src/xabber.js"),
        },
    },
    define: {
        global: 'globalThis',
    },
    server: {
        hmr: {
            overlay: false,
        },
    },
    css: {
        devSourcemap: false,
    },
    build: {
        outDir: 'dist',
        sourcemap: true,
        rollupOptions: {
            input: 'index.html',
        },
    },
    optimizeDeps: {
        // opus-recorder is CJS/UMD, let Vite pre-bundle it
    },
});
