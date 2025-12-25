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

    var IndexedDB = function (options, callback) {
        this.version = options.version || 1;
        this.name = options.name;
        this.ready = false;
        this.pendingOperations = [];
        this.closed = false;

        var request = indexedDB.open(this.name, this.version);

        request.onupgradeneeded = function(event) {
            let db = event.target.result;
            if (!db.objectStoreNames.contains(options.objStoreName)) {
                db.createObjectStore(options.objStoreName, { keyPath: options.primKey });
            }
        }.bind(this);

        request.onsuccess = function(event) {
            this.db = event.target.result;
            this.ready = true;

            // Выполнить все ожидающие операции
            this._processPendingOperations();

            callback && callback();
            options.model.trigger("database_opened");
        }.bind(this);

        request.onerror = function(e) {
            console.error("IndexedDB open error:", e);
            options.model.trigger("database_open_failed");
        }.bind(this);
    };

    _.extend(IndexedDB.prototype, {
        _processPendingOperations: function() {
            while (this.pendingOperations.length > 0) {
                var operation = this.pendingOperations.shift();
                this[operation.method].apply(this, operation.args);
            }
        },

        _executeOrQueue: function(method, args) {
            if (this.ready && !this.closed) {
                this[method].apply(this, args);
            } else if (!this.closed) {
                // Добавить операцию в очередь
                this.pendingOperations.push({
                    method: method,
                    args: args
                });
            } else {
                // База закрыта, вызвать колбэк с ошибкой
                var callback = args[args.length - 1];
                if (typeof callback === 'function') {
                    callback(null);
                }
            }
        },

        put: function(objStoreName, obj, callback) {
            this._executeOrQueue('_put', arguments);
        },

        _put: function(objStoreName, obj, callback) {
            try {
                let db_writer = this.db.transaction([objStoreName], 'readwrite').objectStore(objStoreName),
                    request = db_writer.put(obj);
                request.onsuccess = function () {
                    callback && callback(true);
                }.bind(this);
                request.onerror = function (e) {
                    console.error("Put error:", e);
                    callback && callback(false);
                }.bind(this);
            } catch (e) {
                console.error(e);
                if (e.name === "NotFoundError"){
                    this.delete_database(objStoreName, () => {
                        window.location.reload(true);
                    })
                } else {
                    window.location.reload(true);
                }
            }
        },

        get_all: function (objStoreName, value, callback) {
            this._executeOrQueue('_get_all', arguments);
        },

        _get_all: function (objStoreName, value, callback) {
            try {
                let db_reader = this.db.transaction([objStoreName], 'readonly').objectStore(objStoreName),
                    request;
                if (_.isNull(value) || _.isUndefined(value))
                    request = db_reader.getAll();
                else
                    request = db_reader.getAll(value);
                request.onsuccess = function(event) {
                    var matching = event.target.result;
                    if (matching !== undefined) {
                        callback && callback(matching);
                    } else {
                        callback && callback(null);
                    }
                }.bind(this);
                request.onerror = function(event) {
                    console.error("Get all error:", event.target.error);
                    callback && callback(null);
                }.bind(this);
            } catch (e) {
                console.error(e);
                if (e.name === "NotFoundError"){
                    this.delete_database(objStoreName, () => {
                        window.location.reload(true);
                    })
                } else {
                    window.location.reload(true);
                }
            }
        },

        get: function (objStoreName, value, callback) {
            this._executeOrQueue('_get', arguments);
        },

        _get: function (objStoreName, value, callback) {
            try {
                let db_reader = this.db.transaction([objStoreName], 'readonly').objectStore(objStoreName),
                    request = db_reader.get(value);
                request.onsuccess = function(event) {
                    var matching = event.target.result;
                    if (matching !== undefined) {
                        callback && callback(matching);
                    } else {
                        callback && callback(null);
                    }
                }.bind(this);
                request.onerror = function(event) {
                    console.error("Get error:", event.target.error);
                    callback && callback(null);
                }.bind(this);
            } catch (e) {
                console.error(e);
                if (e.name === "NotFoundError"){
                    this.delete_database(objStoreName, () => {
                        window.location.reload(true);
                    })
                } else {
                    window.location.reload(true);
                }
            }
        },

        remove: function (objStoreName, value, callback) {
            this._executeOrQueue('_remove', arguments);
        },

        _remove: function (objStoreName, value, callback) {
            try {
                let db_writer = this.db.transaction([objStoreName], 'readwrite').objectStore(objStoreName);
                var request = db_writer.delete(value);
                request.onsuccess = function () {
                    callback && callback(true);
                }.bind(this);
                request.onerror = function (e) {
                    console.error("Remove error:", e);
                    callback && callback(false);
                }.bind(this);
            } catch (e) {
                console.error(e);
                if (e.name === "NotFoundError"){
                    this.delete_database(objStoreName, () => {
                        window.location.reload(true);
                    })
                } else {
                    window.location.reload(true);
                }
            }
        },

        clear_database: function (objStoreName, callback) {
            this._executeOrQueue('_clear_database', arguments);
        },

        _clear_database: function (objStoreName, callback) {
            try {
                let db_writer = this.db.transaction([objStoreName], 'readwrite').objectStore(objStoreName);
                var request = db_writer.clear();
                request.onsuccess = function () {
                    callback && callback(true);
                }.bind(this);
                request.onerror = function (e) {
                    console.error("Clear error:", e);
                    callback && callback(false);
                }.bind(this);
            } catch (e) {
                console.error(e);
                window.location.reload(true);
            }
        },

        delete_database: function (objStoreName, callback) {
            try {
                this.closed = true;
                this.ready = false;
                this.pendingOperations = [];

                if (this.db) {
                    this.db.close();
                }

                let db_deleter = indexedDB.deleteDatabase(this.name);
                db_deleter.onsuccess = function () {
                    callback && callback(true);
                }.bind(this);
                db_deleter.onerror = function (e) {
                    console.error(e);
                    callback && callback(false);
                }.bind(this);
            } catch (e) {
                console.error(e);
                window.location.reload(true);
            }
        },
    });

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

    Backbone.ModelWithDataBase = Backbone.Model.extend({
        initialize: function (attrs, options) {
            options = options || {};
            this.database = new IndexedDB(_.extend(options, {model: this}));
            this._initialize && this._initialize(attrs, options);
            this.on("quit", this.onQuit, this);
        },

        clearDataBase: function (name) {
            this.database.clear_database(name);
        },

        deleteDataBase: function (name) {
            this.database.delete_database(name);
        },

        onQuit: function () {
            this.deleteDataBase();
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
