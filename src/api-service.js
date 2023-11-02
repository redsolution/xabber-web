import xabber from "xabber-core";

let env = xabber.env,
    utils = env.utils;


xabber.AccountSettings = Backbone.Model.extend({
    idAttribute: 'jid',

    defaults: {
        timestamp: 0,
        to_sync: false,
        synced: false,
        deleted: false
    },

    update_timestamp: function () {
        this.save('timestamp', utils.now());
    },

    update_settings: function (settings) {
        this.save(_.extend({timestamp: utils.now()}, settings));
    },

    request_data: function () {
        return {
            jid: this.get('jid'),
            timestamp: this.get('timestamp'),
            settings: _.omit(this.attributes, [
                'jid', 'timestamp', 'order',
                'to_sync', 'synced', 'deleted'
            ])
        };
    }
});

xabber.AccountSettingsList = Backbone.CollectionWithStorage.extend({
    model: xabber.AccountSettings,
});

xabber.AccountsOrderTimestamp = Backbone.ModelWithStorage.extend({
    defaults: {
        timestamp: 0
    }
});

xabber.once("start", function () {
        this.account_settings_list = new this.AccountSettingsList(null, {
            storage_name: this.getStorageName() + '-account-settings'
        });
        this.account_settings_list.fetch();
        this.account_settings_list.order_timestamp = new this.AccountsOrderTimestamp(
            {id: 'accounts-order-timestamp'},
            {storage_name: this.getStorageName(), fetch: 'after'}
        );
}, xabber);

export default xabber;