(function (root, factory) {
    define(["backbone", "underscore"], function (Backbone, _) {
        return factory(Backbone, _);
    });
}(this, function (Backbone, _) {

    try {
        localStorage.setItem('test', 1);
        localStorage.removeItem('test');
        Backbone.useLocalStorage = true;
    } catch (e) {
        Storage.prototype._getItem = Storage.prototype.getItem;
        Storage.prototype._setItem = Storage.prototype.setItem;
        Storage.prototype._removeItem = Storage.prototype.removeItem;
        Storage.prototype.getItem = function() {};
        Storage.prototype.setItem = function() {};
        Storage.prototype.removeItem = function() {};
        Backbone.useLocalStorage = false;
    }

    var DataStorage = function (name) {
        this.name = name;
        var data = localStorage.getItem(this.name);
        this.records = this.from_string(data, []);
    };

    _.extend(DataStorage.prototype, {
        from_string: function (string, default_value) {
            if (!string) { return default_value; }
            try { return JSON.parse(string); }
            catch (e) { return default_value || {}; }
        },

        to_string: function (obj) {
            try { return JSON.stringify(obj); }
            catch (e) { return ''; }
        },

        save: function() {
            if (this.records.length) {
                localStorage.setItem(this.name, this.to_string(this.records));
            } else {
                localStorage.removeItem(this.name);
            }
        },

        clear: function () {
            _.each(this.records, function (id) {
                localStorage.removeItem(this._itemName(id));
            }.bind(this));
            localStorage.removeItem(this.name);
        },

        create: function (model) {
            localStorage.setItem(this._itemName(model.id), this.to_string(model));
            this.records.push(model.id);
            this.save();
        },

        update: function (model) {
            localStorage.setItem(this._itemName(model.id), this.to_string(model));
            if (!_.contains(this.records, model.id)) {
                this.records.push(model.id);
                this.save();
            }
        },

        find: function (model) {
            var data = localStorage.getItem(this._itemName(model.id));
            return this.from_string(data, {});
        },

        findAll: function () {
            return _.reduce(this.records, function (result, id) {
                var data = localStorage.getItem(this._itemName(id));
                data && result.push(this.from_string(data, {}));
                return result;
            }.bind(this), []);
        },

        destroy: function (model) {
            localStorage.removeItem(this._itemName(model.id));
            var idx = this.records.indexOf(model.id);
            if (idx >= 0) {
                this.records.splice(idx, 1);
                this.save();
            }
        },

        _itemName: function (id) {
            return this.name + "-" + id;
        }
    });

    Backbone.sync = function(method, model, options) {
        var storage = model.storage || (model.collection && model.collection.storage);
        if (!storage) {
            return false;
        }

        var resp;

        switch (method) {
            case "read":
                resp = model.id ? storage.find(model) : storage.findAll(); break;
            case "create":
                resp = storage.create(model); break;
            case "update":
                resp = storage.update(model); break;
            case "delete":
                resp = storage.destroy(model); break;
        }

        if (resp) {
            options.success(resp);
        } else {
            options.error("Record not found");
        }
    };

    Backbone.ModelWithStorage = Backbone.Model.extend({
        initialize: function (attrs, options) {
            this.storage = new DataStorage(options.storage_name);
            options.fetch === 'before' && this.fetch();
            this._initialize && this._initialize(attrs, options);
            options.fetch === 'after' && this.fetch();
        },

        clearStorage: function () {
            this.storage.clear();
        }
    });

    Backbone.CollectionWithStorage = Backbone.Collection.extend({
        initialize: function (models, options) {
            this.storage = new DataStorage(options.storage_name);
            this._initialize && this._initialize(models, options);
        },

        clearStorage: function () {
            this.storage.clear();
        }
    });

}));
