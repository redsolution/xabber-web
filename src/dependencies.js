// only external libs and plugins for them
define([
    "backbone",
    "underscore",
    "jquery",
    "moment",
    "wavesurfer",
    "slug",
    "sha256",
    "magnific-popup",
    "i18next",
    "i18next-post",
    "strophe",
    "Plyr",
    "Quill",
    "strophe.disco",
    "strophe.ping",
    "strophe.rsm",
    "strophe.caps",
    "strophe.pubsub",
    "omemo",
    "backbone.localsync",
    "sha1_hasher",
    "materialize",
    "qrcode",
    "perfectScrollbarJQuery"
], function(Backbone, _, $, moment, WaveSurfer, slug, sha256, magnificPopup, i18next, i18next_sprintf, Strophe, plyr, Quill) {
    return _.extend({
        $: $,
        _: _,
        ol: ol,
        moment: moment,
        WaveSurfer: WaveSurfer,
        Plyr: plyr,
        Quill: Quill,
        slug: slug,
        xabber_i18next: i18next,
        xabber_i18next_sprintf: i18next_sprintf,
        sha256: sha256,
        magnificPopup: magnificPopup,
        Strophe: Strophe
    }, Strophe);
});
