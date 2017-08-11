// only external libs and plugins for them
define([
    "backbone",
    "underscore",
    "jquery",
    "moment",
    "strophe",
    "strophe.disco",
    "strophe.ping",
    "strophe.rsm",
    "strophe.caps",
    "backbone.localsync",
    "materialize",
    "perfectScrollbarJQuery"
], function(Backbone, _, $, moment, Strophe) {
    return _.extend({
        $: $,
        _: _,
        moment: moment,
        Strophe: Strophe
    }, Strophe);
});
