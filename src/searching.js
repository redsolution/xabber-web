import xabber from "xabber-core";
import { createVueBackboneView } from "./vue/mountVue.js";
import DiscoveringPanel from "./vue/components/searching/DiscoveringPanel.vue";

let env = xabber.env,
    $ = env.$,
    $iq = env.$iq,
    Strophe = env.Strophe,
    Backbone = env.Backbone,
    _ = env._;

// Vue-backed view — plugs into Backbone's parent/child/screen system
xabber.DiscoveringView = createVueBackboneView(xabber, {
    component: DiscoveringPanel,
    className: 'searching-main noselect',
});

// Backbone model stays (handles XMPP protocol)
xabber.Searching = Backbone.Model.extend({

    initialize: function (options) {
        this.account = options.account;
    },

    parseSearchingFields: function (iq_result) {
        let $result = $(iq_result),
            $fields = $result.find(`x[xmlns = "${Strophe.NS.XDATA}"] field`),
            supported_fields = [];
        $fields.each((idx, field) => {
            let $field = $(field);
            if ($field.attr('type') !== 'hidden')
                supported_fields.push({var: $field.attr('var'), label: $field.attr('label')});
        });
    },
});

// Stubs unchanged
xabber.LocalSearchingView = xabber.BasicView.extend({
    className: '',

    events: {

    },

    _initialize: function (options) {
        this.account = options.account;
    },

    render: function () {

    },

    search: function (query) {
    }
});

xabber.GlobalSearchingView = xabber.BasicView.extend({
    className: '',

    events: {

    },

    _initialize: function (options) {
        this.account = options.account;
        this.indexed_chats = [];
    },

    render: function () {

    },

    search: function (query) {
        this.indexed_chats = [];
        let iq_search = $iq({to:'index.xabber.com', type: 'set'})
            .c('query', {xmlns: Strophe.NS.INDEX + '#groupchat'})
            .c('x', {xmlns: Strophe.NS.XDATA, type: 'form'})
            .c('field', {var: 'FORM_TYPE', type:'hidden'})
            .c('value').t(Strophe.NS.INDEX + '#groupchat').up().up();
        if (query.description)
            iq_search.c('field', {var: 'description'})
                .c('value').t(query.description).up().up();
        if (query.name)
            iq_search.c('field', {var: 'name'})
                .c('value').t(query.name).up().up();
        if (query.model)
            iq_search.c('field', {var: 'model'})
                .c('value').t(query.model).up().up();
        if (query.anywhere)
            iq_search.c('field', {var: 'anywhere'})
                .c('value').t(query.anywhere).up().up();
        this.account.sendIQFast(iq_search, this.onSearched.bind(this));
    },

    onSearched: function (result) {
        let $result = $(result),
            $chats = $($result.find('query item groupchat'));
        $chats.each((idx, chat) => {
            let $chat = $(chat),
                chat_jid = $chat.attr('jid'),
                attrs = {jid: chat_jid},
                $properties = $chat.children();
            $properties.each((idx, property) => {
                let $property = $(property),
                    property_name = $property[0].tagName.replace(/-/g, '_'),
                    property_value = $property.text();
                _.extend(attrs, {[property_name]: property_value});
            });
            this.indexed_chats.push(attrs);
        });
    }
});

xabber.once("start", function () {
    this.discovering = this.wide_panel.addChild('discovering_main',
        this.DiscoveringView);
    /*this.local_searching = new xabber.LocalSearching;
    this.global_searching = new xabber.GlobalSearching;*/
}, xabber);

export default xabber;
