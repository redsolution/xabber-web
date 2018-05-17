// only external libs and plugins for them
define([
    "backbone",
    "underscore",
    "jquery",
    "moment",
    "wavesurfer",
    "strophe",
    "strophe.disco",
    "strophe.ping",
    "strophe.rsm",
    "strophe.caps",
    "backbone.localsync",
    "materialize",
    "perfectScrollbarJQuery"
], function(Backbone, _, $, moment, WaveSurfer, Strophe) {
    return _.extend({
        $: $,
        _: _,
        moment: moment,
        WaveSurfer: WaveSurfer,
        Strophe: Strophe
    }, Strophe);
});
