// only external libs and plugins for them
define([
    "backbone",
    "underscore",
    "jquery",
    "moment",
    "wavesurfer",
    "slug",
    "magnific-popup",
    "strophe",
    "strophe.disco",
    "strophe.ping",
    "strophe.rsm",
    "strophe.caps",
    "strophe.pubsub",
    "backbone.localsync",
    "sha1_hasher",
    "materialize",
    "perfectScrollbarJQuery"
], function(Backbone, _, $, moment, WaveSurfer, slug, magnificPopup, Strophe) {
    return _.extend({
        $: $,
        _: _,
        moment: moment,
        WaveSurfer: WaveSurfer,
        slug: slug,
        magnificPopup: magnificPopup,
        Strophe: Strophe
    }, Strophe);
});
