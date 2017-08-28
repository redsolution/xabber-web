define("xabber-contacts", function () {
  return function (xabber) {
    var env = xabber.env,
        constants = env.constants,
        templates = env.templates.contacts,
        utils = env.utils,
        $ = env.$,
        $iq = env.$iq,
        $msg = env.$msg,
        $pres = env.$pres,
        Strophe = env.Strophe,
        _ = env._,
        moment = env.moment,
        uuid = env.uuid,
        Images = utils.images;

    xabber.Contact = Backbone.Model.extend({
        idAttribute: 'jid',
        defaults: {
            status: "offline",
            status_message: "",
            subscription: null,
            groups: []
        },

        initialize: function (_attrs, options) {
            this.account = options.account;
            var attrs = _.clone(_attrs);
            attrs.name = attrs.roster_name || attrs.jid;
            if (!attrs.image) {
                attrs.image = Images.getDefaultAvatar(attrs.jid, attrs.name);
            }
            this.cached_image = Images.getCachedImage(attrs.image);
            attrs.vcard = utils.vcard.getBlank(attrs.jid);
            this.set(attrs);
            this.hash_id = env.b64_sha1(this.account.get('jid') + '-' + attrs.jid);
            this.resources = new xabber.ContactResources(null, {contact: this});
            this.details_view = new xabber.ContactDetailsView({model: this});
            this.on("change:photo_hash", this.getVCard, this);
            this.account.dfd_presence.done(function () {
                this.getVCard();
            }.bind(this));
        },

        getStatusMessage: function () {
            return this.get('status_message') || constants.STATUSES[this.get('status')];
        },

        getVCard: function (callback) {
            var jid = this.get('jid'),
                is_callback = _.isFunction(callback);
            this.account.connection.vcard.get(jid,
                function (vcard) {
                    var attrs = {
                        vcard: vcard,
                        vcard_updated: moment.now(),
                        name: this.get('roster_name')
                    };
                    if (!attrs.name) {
                        attrs.name = vcard.fullname || (vcard.first_name + ' ' + vcard.last_name).trim() || jid;
                    }
                    attrs.image = vcard.photo.image || Images.getDefaultAvatar(jid, attrs.name);
                    this.cached_image = Images.getCachedImage(attrs.image);
                    this.set(attrs);
                    is_callback && callback(vcard);
                }.bind(this),
                function () {
                    is_callback && callback(null);
                }
            );
        },

        pres: function (type) {
            var pres = $pres({to: this.get('jid'), type: type});
            this.account.sendPres(pres);
            this.trigger('presence', this, type + '_from');
            return this;
        },

        pushInRoster: function (attrs, callback, errback) {
            attrs || (attrs = {});
            var name = attrs.name || this.get('name'),
                groups = attrs.groups || this.get('groups');
            var iq = $iq({type: 'set'})
                    .c('query', {xmlns: Strophe.NS.ROSTER})
                    .c('item', {jid: this.get('jid'), name: name});
            _.each(groups, function (group) {
                iq.c('group').t(group).up();
            });
            this.account.sendIQ(iq, callback, errback);
            this.set('known', true);
            return this;
        },

        removeFromRoster: function (callback, errback) {
            var iq = $iq({type: 'set'})
                .c('query', {xmlns: Strophe.NS.ROSTER})
                .c('item', {jid: this.get('jid'), subscription: "remove"});
            this.account.sendIQ(iq, callback, errback);
            this.set('known', false);
            return this;
        },

        acceptRequest: function (callback) {
            this.pres('subscribed');
            callback && callback();
        },

        blockRequest: function (callback) {
            this.pres('unsubscribed');
            this.removeFromRoster().block(callback);
        },

        declineRequest: function (callback) {
            this.pres('unsubscribed');
            this.removeFromRoster(callback);
        },

        block: function (callback, errback) {
            var iq = $iq({type: 'set'}).c('block', {xmlns: Strophe.NS.BLOCKING})
                    .c('item', {jid: this.get('jid')});
            this.account.sendIQ(iq, callback, errback);
            this.set('known', false);
        },

        unblock: function (callback, errback) {
            var iq = $iq({type: 'set'}).c('unblock', {xmlns: Strophe.NS.BLOCKING})
                    .c('item', {jid: this.get('jid')});
            this.account.sendIQ(iq, callback, errback);
        },

        handlePresence: function (presence) {
            var $presence = $(presence),
                type = presence.getAttribute('type'),
                $vcard_update = $presence.find('x[xmlns="'+Strophe.NS.VCARD_UPDATE+'"]');
            if ($vcard_update.length) {
                this.set('photo_hash', $vcard_update.find('photo').text());
            }
            if (type === 'subscribe') {
                if (this.get('in_roster')) {
                    this.pres('subscribed');
                } else {
                    this.trigger('presence', this, 'subscribe');
                }
            } else if (type === 'subscribed') {
                if (this.get('subscription') === 'to') {
                    this.pres('subscribed');
                }
                this.trigger('presence', this, 'subscribed');
            } else if (type === 'unsubscribe') {

            } else if (type === 'unsubscribed') {
                this.trigger('presence', this, 'unsubscribed');
            } else {
                var jid = presence.getAttribute('from'),
                    resource = Strophe.getResourceFromJid(jid),
                    priority = Number($presence.find('priority').text()),
                    status = $presence.find('show').text() || 'online',
                    $status_message = $presence.find('status'),
                    status_message = $status_message.text();
                _.isNaN(priority) && (priority = 0);
                clearTimeout(this._reset_status_timeout);
                var resource_obj = this.resources.get(resource);
                if (type === 'unavailable') {
                    resource_obj && resource_obj.destroy();
                } else {
                    var attrs = {
                        resource: resource,
                        priority: priority,
                        status: status
                    };
                    $status_message.length && (attrs.status_message = status_message);
                    if (!resource_obj) {
                        resource_obj = this.resources.create(attrs);
                    } else {
                        resource_obj.set(attrs);
                    }
                }
            }
        },

        resetStatus: function (timeout) {
            clearTimeout(this._reset_status_timeout);
            this._reset_status_timeout = setTimeout(function () {
                this.set({
                    status_updated: moment.now(),
                    status: 'offline',
                    status_message: ''
                });
            }.bind(this), timeout || 5000);
        },

        showDetails: function (screen) {
            screen || (screen = 'contacts');
            xabber.body.setScreen(screen, {right: 'contact_details', contact: this});
        }
    });

    xabber.ContactItemView = xabber.BasicView.extend({
        className: 'roster-contact list-item',

        _initialize: function (options) {
            this.account = this.model.account;
            this.$el.attr({'data-id': uuid(), 'data-jid': this.model.get('jid')});
            this.$('.jid').text(this.model.get('jid'));
            this.updateName();
            this.updateStatus();
            this.updateAvatar();
            this.model.on("change:name", this.updateName, this);
            this.model.on("change:image", this.updateAvatar, this);
            this.model.on("change:status_updated", this.updateStatus, this);
        },

        updateName: function () {
            this.$('.name').text(this.model.get('name'));
        },

        updateAvatar: function () {
            this.$('.circle-avatar').setAvatar(this.model.cached_image, this.avatar_size);
        },

        updateStatus: function () {
            this.$('.status').attr('data-status', this.model.get('status'));
            this.$('.status-message').text(this.model.getStatusMessage());
        }
    });

    xabber.ContactItemRightView = xabber.ContactItemView.extend({
        template: templates.contact_right_item,
        avatar_size: constants.AVATAR_SIZES.CONTACT_RIGHT_ITEM,

        events: {
            "click": "clickOnItem",
            "mouseover": "showJid",
            "mouseleave": "hideJid",
        },

        showJid: function () {
            if (this.$('.name').text() !== this.model.get('jid')) {
                this.$('.status-message').addClass('hidden');
                this.$('.jid').removeClass('hidden');
            }
        },

        hideJid: function () {
            this.$('.jid').addClass('hidden');
            this.$('.status-message').removeClass('hidden');
        },

        clickOnItem: function () {
            this.model.trigger("open_chat", this.model);
        }
    });

    xabber.ContactItemLeftView = xabber.ContactItemView.extend({
        template: templates.contact_left_item,
        avatar_size: constants.AVATAR_SIZES.CONTACT_LEFT_ITEM,

        events: {
            "click": "clickOnItem"
        },

        __initialize: function () {
            this.updateDisplayStatus();
            this.updateBlockedState();
            this.updateMutedState();
            this.model.on("change:display", this.updateDisplayStatus, this);
            this.model.on("change:blocked", this.updateBlockedState, this);
            this.model.on("change:muted", this.updateMutedState, this);
        },

        updateDisplayStatus: function () {
            this.$el.switchClass('active', this.model.get('display'));
        },

        updateBlockedState: function () {
            this.$el.switchClass('blocked', this.model.get('blocked'));
        },

        updateMutedState: function () {
            this.$('.muted-icon').showIf(this.model.get('muted'));
            this.updateCSS();
        },

        updateCSS: function () {
            if (this.$el.is(':visible')) {
                var name_width = this.$('.name-wrap').width();
                this.model.get('muted') && (name_width -= 24);
                this.$('.name').css('max-width', name_width);
            }
        },

        clickOnItem: function () {
            this.model.showDetails();
        }
    });

    xabber.ContactResources = xabber.Resources.extend({
        initialize: function (models, options) {
            this.contact = options.contact;
            this.jid = options.contact.get('jid');
            this.connection = options.contact.account.connection;
            this.on("add change", this.onResourceUpdated, this);
            this.on("remove", this.onResourceRemoved, this);
        },

        onResourceUpdated: function (resource) {
            if (resource === this.first()) {
                this.contact.set({
                    status_updated: moment.now(),
                    status: resource.get('status'),
                    status_message: resource.get('status_message')
                });
            }
        },

        onResourceRemoved: function (resource) {
            var attrs = {status_updated: moment.now()};
            if (this.length) {
                attrs.status = this.first().get('status');
                attrs.status_message = this.first().get('status_message');
            } else {
                attrs.status = 'offline';
                attrs.status_message = '';
            }
            this.contact.set(attrs);
        }
    });

    xabber.ContactResourcesView = xabber.ResourcesView.extend({
        onResourceRemoved: function (resource) {
            this.removeChild(resource.get('resource'));
            this.$el.showIf(this.model.length);
            this.parent.updateScrollBar();
        },

        onReset: function () {
            this.removeChildren();
            this.$el.addClass('hidden');
            this.parent.updateScrollBar();
        },

        updatePosition: function (resource) {
            var view = this.child(resource.get('resource'));
            if (!view) return;
            view.$el.detach();
            var index = this.model.indexOf(resource);
            if (index === 0) {
                this.$('.resources-wrap').prepend(view.$el);
            } else {
                this.$('.resource-wrap').eq(index - 1).after(view.$el);
            }
            this.updateScrollBar();
        }
    });

    xabber.ContactVCardView = xabber.VCardView.extend({
        events: {
            "click .btn-vcard-refresh": "refresh"
        }
    });

    xabber.ContactDetailsView = xabber.BasicView.extend({
        className: 'details-panel contact-details-panel',
        template: templates.contact_details,
        ps_selector: '.panel-content',
        avatar_size: constants.AVATAR_SIZES.CONTACT_DETAILS,

        events: {
            "click .btn-escape": "openChat",
            "click .btn-chat": "openChat",
            "click .btn-add": "addContact",
            "click .btn-delete": "deleteContact",
            "click .btn-block": "blockContact",
            "click .btn-unblock": "unblockContact",
            "click .btn-auth-request": "requestAuthorization"
        },

        _initialize: function () {
            this.account = this.model.account;
            this.name_field = new xabber.ContactNameWidget({
                el: this.$('.name-wrap')[0],
                model: this.model
            });
            this.resources_view = this.addChild('resources',
                    xabber.ContactResourcesView, {model: this.model.resources,
                                                   el: this.$('.resources-block-wrap')[0]});
            this.vcard_view = this.addChild('vcard', xabber.ContactVCardView,
                    {model: this.model, el: this.$('.vcard')[0]});
            this.edit_groups_view = this.addChild('groups',
                    xabber.ContactEditGroupsView, {el: this.$('.groups-block-wrap')[0]});
            this.updateName();
            this.updateStatus();
            this.updateAvatar();
            this.updateButtons();
            this.model.on("change", this.update, this);
        },

        render: function (options) {
            this.$('.btn-escape').showIf(options.name === 'chats');
        },

        onChangedVisibility: function () {
            this.model.set('display', this.isVisible());
        },

        update: function () {
            var changed = this.model.changed;
            if (_.has(changed, 'name')) this.updateName();
            if (_.has(changed, 'image')) this.updateAvatar();
            if (_.has(changed, 'status_updated')) this.updateStatus();
            if (_.has(changed, 'in_roster') || _.has(changed, 'blocked') ||
                    _.has(changed, 'subscription')) {
                this.updateButtons();
            }
        },

        updateName: function () {
            this.$('.main-info .name').text(this.model.get('name'));
        },

        updateStatus: function () {
            var status = this.model.get('status'),
                status_message = this.model.getStatusMessage();
            this.$('.main-info .status').attr('data-status', status);
            this.$('.main-info .status-message').text(status_message);
        },

        updateAvatar: function () {
            var image = this.model.cached_image;
            this.$('.circle-avatar').setAvatar(image, this.avatar_size);
        },

        updateButtons: function () {
            var in_roster = this.model.get('in_roster'),
                is_blocked = this.model.get('blocked'),
                subscription = this.model.get('subscription');
            this.$('.btn-add').hideIf(in_roster);
            this.$('.btn-delete').showIf(in_roster);
            this.$('.btn-block').hideIf(is_blocked);
            this.$('.btn-unblock').showIf(is_blocked);
            this.$('.btn-auth-request').showIf(in_roster && !is_blocked &&
                    subscription !== 'both' && subscription !== 'to');
            this.$('.buttons-wrap button').addClass('btn-dark')
                .filter(':not(.hidden)').first().removeClass('btn-dark');
        },

        openChat: function () {
            this.model.trigger("open_chat", this.model);
        },

        addContact: function () {
            xabber.add_contact_view.show({account: this.account, jid: this.model.get('jid')});
        },

        deleteContact: function (ev) {
            var contact = this.model;
            utils.dialogs.ask("Remove contact", "Do you want to remove "+
                    contact.get('name')+" from contacts?").done(function (result) {
                if (result) {
                    contact.removeFromRoster();
                    xabber.trigger("clear_search");
                }
            });
        },

        blockContact: function (ev) {
            var contact = this.model;
            utils.dialogs.ask("Block contact", "Do you want to block "+
                    contact.get('name')+"?").done(function (result) {
                if (result) {
                    contact.block();
                    xabber.trigger("clear_search");
                }
            });
        },

        unblockContact: function (ev) {
            var contact = this.model;
            utils.dialogs.ask("Unblock contact", "Do you want to unblock "+
                    contact.get('name')+"?").done(function (result) {
                if (result) {
                    contact.unblock();
                    xabber.trigger("clear_search");
                }
            });
        },

        requestAuthorization: function () {
            this.model.pres('subscribe');
            this.openChat();
        }
    });

    xabber.ContactNameWidget = xabber.InputWidget.extend({
        field_name: 'contact-name',
        placeholder: 'Set contact name',
        model_field: 'name',

        setValue: function (value) {
            this.model.pushInRoster({name: value});
        }
    });

    xabber.ContactEditGroupsView = xabber.BasicView.extend({

        events: {
            'click .existing-group-field label': 'editGroup',
            'change .new-group-name input': 'checkNewGroup',
            'keyup .new-group-name input': 'checkNewGroup',
            'click .new-group-checkbox': 'addNewGroup'
        },

        _initialize: function (options) {
            this.account = this.parent.account;
            this.model = this.parent.model;
            this.model.on("change:in_roster update_groups", this.render, this);
        },

        render: function () {
            if (this.model.get('in_roster')) {
                var groups = _.clone(this.model.get('groups')),
                    all_groups = _.map(this.account.groups.notSpecial(), function (group) {
                        var name = group.get('name');
                        return {name: name, checked: _.contains(groups, name), id: uuid()};
                    });
                this.$('.groups').html(templates.groups_checkbox_list({
                    groups: all_groups
                })).appendTo(this.$('.groups-wrap'));
            }
            this.$el.showIf(this.model.get('in_roster'));
            this.parent.updateScrollBar();
        },

        editGroup: function (ev) {
            var $target = $(ev.target),
                $input = $target.siblings('input'),
                checked = !$input.prop('checked'),
                group_name = $input.attr('data-groupname');
                groups = _.clone(this.model.get('groups')),
                idx = groups.indexOf(group_name);
            $input.prop('checked', checked);
            if (checked) {
                groups.push(group_name);
            } else if (idx >= 0) {
                groups.splice(idx, 1);
            }
            this.model.pushInRoster({groups: groups});
        },

        checkNewGroup: function (ev) {
            var name = $(ev.target).val(),
                $checkbox = this.$('.new-group-checkbox');
            $checkbox.showIf(name && !this.account.groups.get(name));
        },

        addNewGroup: function (ev) {
            var $input = this.$('.new-group-name input'),
                name = $input.val(),
                groups = _.clone(this.model.get('groups')),
                idx = groups.indexOf(name);
            if (idx < 0) {
                groups.push(name);
            }
            this.model.pushInRoster({groups: groups});
        }
    });

    xabber.ContactsBase = Backbone.Collection.extend({
        model: xabber.Contact
    });

    xabber.GroupContacts = xabber.ContactsBase.extend({
        initialize: function (models, options) {
            this.group = options.group;
            this.on("change", this.onContactChanged, this);
        },

        comparator: function (contact1, contact2) {
            if (xabber.settings.roster.sorting === 'online-first') {
                var s1 = contact1.get('status'),
                    s2 = contact2.get('status'),
                    sw1 = constants.STATUS_WEIGHTS[s1],
                    sw2 = constants.STATUS_WEIGHTS[s2],
                    sw1_offline = sw1 >= constants.STATUS_WEIGHTS.offline,
                    sw2_offline = sw2 >= constants.STATUS_WEIGHTS.offline;
                if (sw1_offline ^ sw2_offline) {
                    return sw1_offline ? 1 : -1;
                }
            }
            var name1, name2;
            name1 = contact1.get('name').toLowerCase();
            name2 = contact2.get('name').toLowerCase();
            return name1 < name2 ? -1 : (name1 > name2 ? 1 : 0);
        },

        onContactChanged: function (contact) {
            var changed = contact.changed
            if (_.has(changed, 'name') || _.has(changed, 'status_updated')) {
                this.sort();
                this.trigger('update_contact_item', contact);
            }
        }
    });

    xabber.Group = Backbone.Model.extend({
        defaults: {
            counter: {all: 0, online: 0}
        },

        initialize: function (attrs, options) {
            this.account = options.account;
            attrs.name || (attrs.name = attrs.id);
            this.set(attrs);
            this._settings = this.account.groups_settings.get(attrs.name);
            if (!this._settings) {
                this._settings = this.account.groups_settings.create({name: attrs.name});
            }
            this.settings = this._settings.attributes;
            this.contacts = new xabber.GroupContacts(null, {group: this});
            this.settings_view = new xabber.GroupSettingsView({model: this});
            this.contacts.on("add update_contact_item", this.updateCounter, this);
            this.contacts.on("destroy", this.onContactRemoved, this);
            xabber._roster_settings.on("change", this.onChangedRosterSettings, this);
        },

        isSpecial: function () {
            return _.isNumber(this.get('id'));
        },

        updateCounter: function () {
            var all = this.contacts.length,
                online = all - this.contacts.where({status: 'offline'}).length;
            this.set('counter', {all: all, online: online});
        },

        renameGroup: function (new_name) {
            var name = this.get('name'),
                attrs = _.clone(this.settings);
            attrs.name = new_name;
            this._settings.destroy();
            this._settings = this.account.groups_settings.create(attrs);
            this.settings = this._settings.attributes;
            this.set({id: new_name, name: new_name});
            this.trigger('rename', this, name);
            _.each(_.clone(this.contacts.models), function (contact) {
                var groups = _.clone(contact.get('groups')),
                    index = groups.indexOf(name);
                if (index >= 0) {
                    groups.splice(index, 1);
                }
                index = groups.indexOf(new_name);
                if (index < 0) {
                    groups.push(new_name);
                }
                contact.pushInRoster({groups: groups});
            });
        },

        deleteGroup: function () {
            var name = this.get('name');
            this._settings.destroy();
            _.each(_.clone(this.contacts.models), function (contact) {
                var groups = _.clone(contact.get('groups')),
                    index = groups.indexOf(name);
                if (index >= 0) {
                    groups.splice(index, 1);
                }
                contact.pushInRoster({groups: groups});
            });
        },

        removeContact: function (contact) {
            if (this.contacts.get(contact)) {
                this.contacts.remove(contact);
                this.onContactRemoved(contact);
            }
        },

        onContactRemoved: function (contact) {
            this.updateCounter();
            this.trigger('remove_contact', contact);
            this.contacts.length || this.destroy();
        },

        onChangedRosterSettings: function () {
            var changed = xabber._roster_settings.changed;
            if (_.has(changed, 'show_offline')) {
                this._settings.trigger('change:show_offline');
            }
            if (_.has(changed, 'sorting')) {
                this.contacts.sort();
                this._settings.trigger('change:sorting');
            }
        },

        showSettings: function () {
            this.settings_view.show();
        }
    });

    xabber.GroupView = xabber.BasicView.extend({
        className: 'roster-group',
        events: {
            "click .group-head": "toggle",
            "click .group-head .group-icon": "showGroupSettings",
            "mouseover .group-head": "showSettingsIcon",
            "mouseleave .group-head": "updateGroupIcon"
        },

        _initialize: function () {
            this.account = this.model.account;
            this.updateName();
            this.updateGroupIcon();
            this.updateMembersCounter();
            this.model.contacts.on("add", this.onContactAdded, this);
            this.model.on("remove_contact", this.onContactRemoved, this);
            this.model.contacts.on("update_contact_item", this.updateContactItem, this);
            this.model.on("change:name", this.updateName, this);
            this.model.on("change:counter", this.updateMembersCounter, this);
            this.model._settings.on("change:show_offline", this.onChangedOfflineSetting, this);
            this.model._settings.on("change:sorting", this.onChangedSortingSetting, this);
            this.data.on("change:expanded", this.updateExpanded, this);
        },

        updateExpanded: function () {
            var expanded = this.data.get('expanded');
            this.$el.switchClass('shrank', !expanded);
            this.$('.arrow').switchClass('mdi-chevron-down', expanded);
            this.$('.arrow').switchClass('mdi-chevron-right', !expanded);
            this.$('.roster-contact').showIf(expanded);
            this.parent.parent.onListChanged();
        },

        updateGroupIcon: function () {
            var mdi_icon, show_offline = this.model.settings.show_offline;
            if (show_offline === 'default') {
                mdi_icon = 'settings';
            } else if (show_offline === 'yes') {
                mdi_icon = 'group-filled';
            } else if (show_offline === 'no') {
                mdi_icon = 'group-outline';
            }
            this.$('.group-icon').attr('data-mdi', mdi_icon).hideIf(mdi_icon === 'settings');
        },

        updateName: function () {
            this.$('.group-name').text(this.model.get('name'));
        },

        updateMembersCounter: function () {
            var counter = this.model.get('counter');
            this.$('.member-counter').text('('+counter.online+'/'+counter.all+')');
        },

        onContactAdded: function (contact) {
            var view = this.addChild(contact.get('jid'), this.item_view, {model: contact});
            this.updateContactItem(contact);
        },

        onContactRemoved: function (contact) {
            this.removeChild(contact.get('jid'));
            this.parent.parent.onListChanged();
        },

        updateContactItem: function (contact) {
            var view = this.child(contact.get('jid'));
            if (!view) return;
            var roster_settings = xabber.settings.roster,
                group_settings = this.model.settings,
                is_default_show_offline = group_settings.show_offline === 'default',
                show_offline = group_settings.show_offline === 'yes' ||
                        (is_default_show_offline && roster_settings.show_offline === 'yes'),
                is_offline = constants.STATUS_WEIGHTS[contact.get('status')] >= 6;

            view.$el.switchClass('invisible', is_offline && !show_offline).detach();
            var index = this.model.contacts.indexOf(contact);
            if (index === 0) {
                this.$('.group-head').after(view.$el);
            } else {
                this.$('.roster-contact').eq(index - 1).after(view.$el);
            }
            view.$el.showIf(this.data.get('expanded'));
            this.parent.parent.onListChanged();
            return view;
        },

        showSettingsIcon: function (ev) {
            this.$('.group-icon').attr('data-mdi', 'settings').removeClass('hidden');
        },

        showGroupSettings: function (ev) {
            ev.stopPropagation();
            this.model.showSettings();
        },

        onChangedOfflineSetting: function () {
            this.updateGroupIcon();
            var roster_settings = xabber.settings.roster,
                group_settings = this.model.settings,
                is_default_show_offline = group_settings.show_offline === 'default',
                show_offline = group_settings.show_offline === 'yes' ||
                        (is_default_show_offline && roster_settings.show_offline === 'yes');
            _.each(this.children, function (view) {
                var is_offline = constants.STATUS_WEIGHTS[view.model.get('status')] >= 6;
                view.$el.switchClass('invisible', is_offline && !show_offline);
            });
            this.parent.parent.onListChanged();
        },

        onChangedSortingSetting: function () {
            _.each(this.children, function (view) { view.$el.detach(); });
            this.model.contacts.each(function (c) { this.updateContactItem(c); }.bind(this));
            this.parent.parent.onListChanged();
        }
    });

    xabber.GroupRightView = xabber.GroupView.extend({
        template: templates.group_right,
        item_view: xabber.ContactItemRightView,

        __initialize: function () {
            this.data.set('expanded', this.model.settings.expanded);
        },

        toggle: function () {
            var expanded = !this.data.get('expanded');
            this.data.set('expanded', expanded);
            this.model._settings.save('expanded', expanded);
        }
    });

    xabber.GroupLeftView = xabber.GroupView.extend({
        template: templates.group_left,
        item_view: xabber.ContactItemLeftView,

        __initialize: function () {
            this.data.set('expanded', true);
        },

        toggle: function (ev) {
            ev.stopPropagation();
            this.data.set('expanded', !this.data.get('expanded'));
        }
    });

    xabber.GroupSettingsView = xabber.BasicView.extend({
        className: 'modal main-modal group-settings',
        template: templates.group_settings,
        ps_selector: '.modal-content',
        avatar_size: constants.AVATAR_SIZES.GROUP_SETTINGS,

        events: {
            "change .offline input[type=radio][name=offline]": "setOffline",
            "click .btn-apply": "applySettings",
            "click .btn-delete": "deleteGroup",
            "click .btn-cancel": "close"
        },

        _initialize: function () {
            this._settings = this.model._settings;
            var name = this.model.get('name');
            if (this.model.isSpecial()) {
                this.$('.group-name input').attr('readonly', true);
                this.$('.btn-delete').addClass('hidden');
            }
            this.model.on("destroy", this.onDestroy, this);
        },

        render: function () {
            this.$('.group-name input').val(this.model.get('name'));
            this.$('.group-name .errors').addClass('hidden');
            this.$('.offline input[type=radio][name=offline][value='+
                    (this.model.settings.show_offline)+']').prop('checked', true);
            this.$el.appendTo('#modals').openModal({
                ready: function () {
                    Materialize.updateTextFields();
                },
                complete: this.hide.bind(this)
            });
        },

        setOffline: function (ev) {
            this.model._settings.save('show_offline', ev.target.value);
        },

        validateName: function (name) {
            if (!name) {
                return 'Please input name!';
            }
            if (this.model.collection.get(name)) {
                return 'Wrong name';
            }
        },

        applySettings: function () {
            var new_name = this.$('.group-name input').val();
            if (new_name !== this.model.get('name')) {
                var name_error = this.validateName(new_name);
                if (name_error) {
                    this.$('.group-name .errors').text(name_error).removeClass('hidden');
                    return;
                } else {
                    this.model.renameGroup(new_name);
                }
            }
            this.close();
        },

        deleteGroup: function () {
            var name = this.model.get('name');
            utils.dialogs.ask('Remove group', "Do you want to remove group "+name+"?")
                    .done(function (result) {
                result && this.model.deleteGroup();
            }.bind(this));
        },

        onHide: function () {
            this.$el.detach();
        },

        close: function () {
            this.$el.closeModal({ complete: this.hide.bind(this) });
        },

        onDestroy: function () {
            this.$el.closeModal({ complete: this.remove.bind(this) });
        }
    });

    xabber.Groups = Backbone.Collection.extend({
        model: xabber.Group,

        initialize: function (models, options) {
            this.account = options.account;
            this.on("add", this.onGroupAdded, this);
            this.on("change:id", this.sort, this);
        },

        comparator: function (a, b) {
            if (a.isSpecial() === b.isSpecial()) {
                return a.get('id') < b.get('id') ? -1 : 1;
            }
            return a.isSpecial() ? 1 : -1;
        },

        notSpecial: function () {
            return this.filter(function (group) { return !group.isSpecial(); });
        },

        onGroupAdded: function (group) {
            group.acc_view = new xabber.AccountGroupView({model: group});
        }
    });

    xabber.Contacts = xabber.ContactsBase.extend({
        initialize: function (models, options) {
            this.account = options.account;
            this.account.on("deactivate destroy", this.removeAllContacts, this);
            this.collections = [];
            this.on("add", _.bind(this.updateInCollections, this, 'add'));
            this.on("change", _.bind(this.updateInCollections, this, 'change'));
        },

        addCollection: function (collection) {
            this.collections.push(collection);
        },

        updateInCollections: function (event, contact) {
            _.each(this.collections, function (collection) {
                collection.update(contact, event);
            });
        },

        mergeContact: function (attrs) {
            if (typeof attrs !== "object") {
                attrs = {jid: attrs};
            }
            var contact = this.get(attrs.jid);
            if (contact) {
                contact.set(attrs);
            } else {
                contact = this.create(attrs, {account: this.account});
            }
            return contact;
        },

        removeAllContacts: function () {
            _.each(_.clone(this.models), function (contact) {
                contact.destroy();
            });
        },

        handlePresence: function (presence, jid) {
            var contact = this.mergeContact(jid);
            contact.handlePresence(presence);
        }
    });

    xabber.BlockList = xabber.ContactsBase.extend({
        initialize: function (models, options) {
            this.account = options.account;
            this.contacts = this.account.contacts;
            this.contacts.on("remove_from_blocklist", this.onContactRemoved, this);
        },

        update: function (contact, event) {
            var contains = contact.get('blocked');
            if (contains) {
                if (!this.get(contact)) {
                    this.add(contact);
                    contact.trigger("add_to_blocklist", contact);
                }
            } else if (this.get(contact)) {
                this.remove(contact);
                contact.trigger("remove_from_blocklist", contact);
            }
        },

        onContactRemoved: function (contact) {
            contact.getVCard();
        },

        registerHandler: function () {
            this.account.connection.deleteHandler(this._stanza_handler);
            this._stanza_handler = this.account.connection.addHandler(
                this.onBlockingIQ.bind(this),
                Strophe.NS.BLOCKING, 'iq', "set", null, this.account.get('jid')
            );
        },

        getFromServer: function () {
            var iq = $iq({type: 'get'}).c('blocklist', {xmlns: Strophe.NS.BLOCKING});
            this.account.sendIQ(iq, this.onBlockingIQ.bind(this));
        },

        onBlockingIQ: function (iq) {
            var $elem = $(iq).find('[xmlns="' + Strophe.NS.BLOCKING + '"]'),
                tag = $elem[0].tagName.toLowerCase(),
                blocked = tag.startsWith('block');
            $elem.find('item').each(function (idx, item) {
                var jid = item.getAttribute('jid');
                this.account.contacts.mergeContact({jid: jid, blocked: blocked});
            }.bind(this));
            return true;
        }
    });

    xabber.Roster = xabber.ContactsBase.extend({
        initialize: function (models, options) {
            this.account = options.account;
            this.groups = this.account.groups;
            this.contacts = this.account.contacts;
            this.contacts.on("add_to_roster", this.onContactAdded, this);
            this.contacts.on("change_in_roster", this.onContactChanged, this);
            this.contacts.on("remove_from_roster", this.onContactRemoved, this);
        },

        update: function (contact, event) {
            var contains = contact.get('in_roster') || contact.get('known');
            if (contains) {
                if (!this.get(contact)) {
                    this.add(contact);
                    contact.trigger("add_to_roster", contact);
                } else if (event === 'change') {
                    contact.trigger("change_in_roster", contact);
                }
            } else if (this.get(contact)) {
                this.remove(contact);
                contact.trigger("remove_from_roster", contact);
            }
        },

        onContactAdded: function (contact) {
            if (!contact.get('in_roster')) {
                this.addContactToGroup(contact, constants.NON_ROSTER_GROUP_ID);
                return;
            }
            var groups = contact.get('groups');
            if (!groups.length) {
                this.addContactToGroup(contact, constants.GENERAL_GROUP_ID);
            } else {
                _.each(groups, _.bind(this.addContactToGroup, this, contact));
            }
        },

        onContactChanged: function (contact) {
            var changed = contact.changed,
                known_changed = _.has(changed, 'known'),
                in_roster_changed = _.has(changed, 'in_roster'),
                groups_changed = _.has(changed, 'groups');
            if (in_roster_changed || known_changed || groups_changed) {
                var groups;
                if (contact.get('in_roster')) {
                    groups = _.clone(contact.get('groups'));
                    if (!groups.length) {
                        groups.push(constants.GENERAL_GROUP_ID);
                    }
                } else if (contact.get('known')) {
                    groups = [constants.NON_ROSTER_GROUP_ID];
                } else {
                    groups = [];
                }
                // TODO: optimize
                var groups_to_remove = this.groups.filter(function (group) {
                    return !_.contains(groups, group.get('id'));
                });
                _.each(groups_to_remove, function (group) {
                    group.removeContact(contact);
                });
                _.each(groups, _.bind(this.addContactToGroup, this, contact));
                contact.trigger('update_groups');
            }
        },

        onContactRemoved: function (contact) {
            _.each(this.groups.filter(), function (group) {
                group.removeContact(contact);
            });
        },

        getGroup: function (name) {
            var group = this.groups.get(name);
            if (group) {
                return group;
            }
            var attrs = {id: name};
            if (name === constants.GENERAL_GROUP_ID) {
                attrs.name = xabber.settings.roster.general_group_name;
            } else if (name === constants.NON_ROSTER_GROUP_ID) {
                attrs.name = xabber.settings.roster.non_roster_group_name;
            }
            return this.groups.create(attrs, {account: this.account});
        },

        addContactToGroup: function (contact, name) {
            var group = this.getGroup(name);
            group.contacts.add(contact);
        },

        registerHandler: function () {
            this.account.connection.deleteHandler(this._stanza_handler);
            this._stanza_handler = this.account.connection.addHandler(
                this.onRosterIQ.bind(this),
                Strophe.NS.ROSTER, 'iq', "set", null, this.account.get('jid')
            );
        },

        getFromServer: function () {
            var iq = $iq({type: 'get'}).c('query', {xmlns: Strophe.NS.ROSTER});
            this.account.sendIQ(iq, function (iq) {
                this.onRosterIQ(iq);
                this.account.sendPresence();
                this.account.dfd_presence.resolve();
            }.bind(this));
        },

        onRosterIQ: function (iq) {
            if (iq.getAttribute('type') === 'set') {
                this.account.sendIQ($iq({
                    type: 'result', id: iq.getAttribute('id'),
                    from: this.account.jid
                }));
            }
            $(iq).children('query').find('item').each(function (idx, item) {
                this.onRosterItem(item);
            }.bind(this));
            return true;
        },

        onRosterItem: function (item) {
            var jid = item.getAttribute('jid');
            if (jid === this.account.get('jid')) {
                return;
            }
            var contact = this.contacts.mergeContact(jid);
            var subscription = item.getAttribute("subscription");
            if (subscription === 'remove') {
                contact.set({
                    in_roster: false,
                    known: false,
                    subscription: null
                });
                return;
            }
            var groups = [];
            $(item).find('group').each(function () {
                var group = $(this).text();
                groups.indexOf(group) < 0 && groups.push(group);
            });
            var attrs = {
                subscription: subscription,
                in_roster: true,
                roster_name: item.getAttribute("name"),
                groups: groups
            };
            attrs.roster_name && (attrs.name = attrs.roster_name);
            contact.set(attrs);
        }
    });

    xabber.AccountRosterView = xabber.BasicView.extend({
        className: 'account-roster-wrap',

        events: {
            "click .roster-account-info-wrap .status-button": "openChangeStatus",
            "click .roster-account-info": "toggle"
        },

        _initialize: function (options) {
            this.account = options.account;
            this.groups = this.account.groups;
            this.roster = this.account.roster;
            this.contacts = this.account.contacts;
            this.$el.attr('data-jid', this.account.get('jid'));
            this.$el.appendTo(this.parent.$('.contact-list'));
            this.$info = this.$('.roster-account-info-wrap');
            this.updateName();
            this.updateStatus();
            this.updateAvatar();
            this.updateColorScheme();
            this.account.on("change:name", this.updateName, this);
            this.account.on("change:image", this.updateAvatar, this);
            this.account.on("change:status_updated", this.updateStatus, this);
            this.account.settings.on("change:color", this.updateColorScheme, this);
            this.groups.on("add", this.onGroupAdded, this);
            this.groups.on("rename", this.onGroupRenamed, this);
            this.groups.on("destroy", this.onGroupRemoved, this);
            this.data.on("change:expanded", this.updateExpanded, this);
            this.data.set('expanded', true);
        },

        updateName: function () {
            this.$info.find('.name').text(this.account.get('name'));
        },

        updateStatus: function () {
            this.$info.find('.status').attr('data-status', this.account.get('status'));
            this.$info.find('.status-message').text(this.account.getStatusMessage());
        },

        updateAvatar: function () {
            var image = this.account.cached_image;
            this.$info.find('.circle-avatar').setAvatar(image, this.avatar_size);
        },

        updateColorScheme: function () {
            this.$el.attr('data-color', this.account.settings.get('color'));
        },

        updateExpanded: function () {
            var expanded = this.data.get('expanded');
            this.$el.switchClass('shrank', !expanded);
            this.parent.updateScrollBar();
        },

        updateGroupPosition: function (view) {
            view.$el.detach();
            var index = this.groups.indexOf(view.model);
            if (index === 0) {
                this.$info.after(view.$el);
            } else {
                this.$('.roster-group').eq(index - 1).after(view.$el);
            }
            this.parent.updateScrollBar();
        },

        onGroupAdded: function (group) {
            var view = this.addChild(group.get('id'), this.group_view, {model: group});
            this.updateGroupPosition(view);
        },

        onGroupRenamed: function (group, old_name) {
            var view = this.child(old_name);
            delete this.children[old_name];
            this.children[group.get('name')] = view;
            view && this.updateGroupPosition(view);
        },

        onGroupRemoved: function (group) {
            this.removeChild(group.get('id'));
        },

        toggle: function (ev) {
            this.data.set('expanded', !this.data.get('expanded'));
        },

        openChangeStatus: function (ev) {
            xabber.change_status_view.open(this.account);
        }
    });

    xabber.AccountRosterRightView = xabber.AccountRosterView.extend({
        template: templates.account_roster_right,
        group_view: xabber.GroupRightView,
        avatar_size: constants.AVATAR_SIZES.ROSTER_RIGHT_ACCOUNT_ITEM,

        __initialize: function () {
            this.contacts.on("add_to_roster change_in_roster remove_from_roster",
                    this.updateCounter, this);
            this.contacts.on("add_to_roster remove_from_roster",
                    this.updateGlobalCounter, this);
        },

        updateCounter: function (contact) {
            var all = this.roster.length,
                online = all - this.roster.where({status: 'offline'}).length;
            this.$info.find('.counter').text(online + '/' + all);
        },

        updateGlobalCounter: function (contact) {
            this.parent.updateCounter();
        }
    });

    xabber.AccountRosterLeftView = xabber.AccountRosterView.extend({
        template: templates.account_roster_left,
        group_view: xabber.GroupLeftView,
        avatar_size: constants.AVATAR_SIZES.ROSTER_LEFT_ACCOUNT_ITEM,

        __initialize: function () {
            this.$info.find('.jid').text(this.account.get('jid'));
        },

        search: function (query) {
            this.$el.removeClass('shrank');
            this.$('.group-head').addClass('hidden');
            var count = 0, hashes = {};
            this.$('.roster-contact').each(function (idx, item) {
                var $item = $(item),
                    jid = $item.data('jid'),
                    contact = this.roster.get(jid);
                if (!contact) return;
                if (hashes[contact.hash_id]) {
                    $item.addClass('hidden');
                    return;
                }
                hashes[contact.hash_id] = true;
                var name = contact.get('name').toLowerCase(),
                    hide = name.indexOf(query) < 0 && jid.indexOf(query) < 0;
                $item.hideIf(hide);
                hide || count++;
            }.bind(this));
            this.$('.roster-account-info-wrap').showIf(count);
        },

        searchAll: function () {
            this.$el.switchClass('shrank', !this.data.get('expanded'));
            this.$('.roster-account-info-wrap').removeClass('hidden');
            this.$('.group-head').removeClass('hidden');
            this.$('.list-item').removeClass('hidden');
        }
    });

    xabber.BlockedItemView = xabber.BasicView.extend({
        className: 'blocked-contact',
        template: templates.contact_blocked_item,
        avatar_size: constants.AVATAR_SIZES.CONTACT_BLOCKED_ITEM,

        events: {
            "click .btn-unblock": "unblockContact",
            "click": "showDetails"
        },

        _initialize: function (options) {
            this.$el.appendTo(this.parent.$('.blocked-contacts'));
            this.$el.attr({'data-jid': this.model.get('jid')});
            this.$('.jid').text(this.model.get('jid'));
            this.$('.circle-avatar').setAvatar(this.model.cached_image, this.avatar_size);
        },

        unblockContact: function (ev) {
            ev.stopPropagation();
            this.model.unblock();
        },

        showDetails: function (ev) {
            this.model.showDetails();
        }
    });

    xabber.BlockListView = xabber.BasicView.extend({
        _initialize: function (options) {
            this.account = options.account;
            this.account.contacts.on("add_to_blocklist", this.onContactAdded, this);
            this.account.contacts.on("remove_from_blocklist", this.onContactRemoved, this);
        },

        onContactAdded: function (contact) {
            this.addChild(contact.get('jid'), xabber.BlockedItemView, {model: contact});
            this.$('.placeholder').addClass('hidden');
            this.parent.updateScrollBar();
        },

        onContactRemoved: function (contact) {
            this.removeChild(contact.get('jid'));
            this.$('.placeholder').hideIf(this.account.blocklist.length);
            this.parent.updateScrollBar();
        }
    });

    xabber.RosterView = xabber.SearchView.extend({
        ps_selector: '.contact-list-wrap',

        _initialize: function () {
            this._settings = xabber._roster_settings;
            this.model.on("activate", this.updateOneRosterView, this);
            this.model.on("update_order", this.updateRosterViews, this);
            this.model.on("deactivate destroy", this.removeRosterView, this);
            this.on("before_hide", this.saveScrollBarOffset, this);
        },

        updateOneRosterView: function (account) {
            var jid = account.get('jid'),
                view = this.child(jid);
            if (view) {
                view.$el.detach();
            } else if (account.isConnected()) {
                view = this.addChild(jid, this.account_roster_view, {account: account});
            } else {
                return;
            }
            var index = this.model.connected.indexOf(account);
            if (index === 0) {
                this.$('.contact-list').prepend(view.$el);
            } else {
                this.$('.contact-list').children().eq(index - 1).after(view.$el);
            }
            this.updateScrollBar();
        },

        updateRosterViews: function () {
            _.each(this.children, function (view) { view.detach(); });
            this.model.each(function (account) {
                var jid = account.get('jid'), view = this.child(jid);
                view && this.$('.contact-list').append(view.$el);
            }.bind(this));
            this.updateScrollBar();
        },

        removeRosterView: function (account) {
            this.removeChild(account.get('jid'));
            this.updateScrollBar();
        }
    });

    xabber.RosterRightView = xabber.RosterView.extend({
        className: 'roster-right-container container',
        template: templates.roster_right,
        ps_settings: {theme: 'roster-right'},
        account_roster_view: xabber.AccountRosterRightView,

        events: {
            "mouseover .collapsed-wrap": "expand",
            "mouseleave .expanded-wrap": "collaps",
            "click .btn-pin": "pinUnpin"
        },

        __initialize: function () {
            this.updateCounter();
            this.model.on("activate deactivate destroy", this.updateCounter, this);
            this.data.on("change", this.updateLayout, this);
            var pinned = this._settings.get('pinned');
            this.data.set({expanded: pinned, pinned: pinned});
        },

        expand: function () {
            this.data.set('expanded', true);
        },

        collaps: function () {
            if (!this.data.get('pinned')) {
                this.data.set('expanded', false);
            }
        },

        pinUnpin: function () {
            var pinned = !this.data.get('pinned');
            this._settings.save('pinned', pinned);
            this.data.set('pinned', pinned);
        },

        updateLayout: function () {
            var changed = this.data.changed;
            if (_.has(changed, 'expanded') || _.has(changed, 'pinned')) {
                xabber.trigger('update_layout', {roster_state_changed: true});
            }
        },

        updateCounter: function () {
            this.$('.all-contacts-counter').text(
                _.reduce(this.children, function (counter, view) {
                    return counter + view.roster.length;
                }, 0)
            );
        },

        onListChanged: function () {
            this.updateScrollBar();
        }
    });

    xabber.RosterLeftView = xabber.RosterView.extend({
        className: 'roster-left-container container',
        template: templates.roster_left,
        ps_settings: {theme: 'item-list'},
        account_roster_view: xabber.AccountRosterLeftView,

        __initialize: function () {
            this.model.on("list_changed", this.updateLeftIndicator, this);
        },

        updateLeftIndicator: function () {
            this.$el.attr('data-indicator', this.model.connected.length > 1);
        },

        getContactForItem: function (item) {
            var $item = $(item),
                account_jid = $item.parent().parent().data('jid'),
                jid = $item.data('jid'),
                roster_view = this.child(account_jid);
            return roster_view && roster_view.roster.get(jid);
        },

        render: function (options) {
            options.right !== 'contact_details' && this.clearSearch();
        },

        search: function (query) {
            _.each(this.children, function (view) {
                view.search(query);
            });
        },

        searchAll: function () {
            _.each(this.children, function (view) {
                view.searchAll();
            });
        },

        onEnterPressed: function (selection) {
            var contact = this.getContactForItem(selection);
            contact && contact.showDetails();
        },

        onListChanged: function () {
            this.updateSearch();
        }
    });

    xabber.RosterSettingsView = xabber.BasicView.extend({
        className: 'roster-settings-wrap',
        template: templates.roster_settings,

        events: {
            "change .offline-contacts input": "setOfflineSetting",
            "change .sorting-contacts input": "setSortingSetting"
        },

        _initialize: function () {
            this.$el.appendTo(this.parent.$('.settings-block-wrap.contact-list'));
        },

        render: function () {
            this.$('.offline-contacts input[type=radio][name=offline-contacts][value='+
                    (this.model.get('show_offline'))+']').prop('checked', true);
            this.$('.sorting-contacts input[type=radio][name=sorting-contacts][value='+
                    (this.model.get('sorting'))+']').prop('checked', true);
        },

        setOfflineSetting: function () {
            this.model.save('show_offline',
                    this.$('.offline-contacts input[type=radio][name=offline-contacts]:checked').val());
        },

        setSortingSetting: function () {
            this.model.save('sorting',
                    this.$('.sorting-contacts input[type=radio][name=sorting-contacts]:checked').val());
        }
    });

    xabber.AccountGroupView = xabber.BasicView.extend({
        className: 'group',
        template: function () {
            this.$el.append('<span class="group-name"/>');
        },

        events: {
            "click .group-name": "showGroupSettings"
        },

        _initialize: function (options) {
            this.$('.group-name').text(this.model.get('name'));
            var index = this.model.collection.indexOf(this.model),
                $parent_el = this.model.account.settings_right.$('.groups');
            if (index === 0) {
                $parent_el.prepend(this.$el);
            } else {
                $parent_el.children().eq(index - 1).after(this.$el);
            }
            this.model.on("destroy", this.remove, this);
        },

        showGroupSettings: function () {
            this.model.showSettings();
        }
    });

    xabber.ContactPlaceholderView = xabber.BasicView.extend({
        className: 'placeholder-wrap contact-placeholder-wrap noselect',
        template: templates.contact_placeholder
    });

    xabber.AddContactView = xabber.BasicView.extend({
        className: 'modal main-modal add-contact-modal',
        template: templates.add_contact,
        ps_selector: '.modal-content',
        avatar_size: constants.AVATAR_SIZES.ACCOUNT_ITEM,

        events: {
            "click .account-field .dropdown-content": "selectAccount",
            "click .existing-group-field label": "editGroup",
            "change .new-group-name input": "checkNewGroup",
            "keyup .new-group-name input": "checkNewGroup",
            "click .new-group-checkbox": "addNewGroup",
            "click .btn-add": "addContact",
            "click .btn-cancel": "close"
        },

        _initialize: function () {
            this.group_data = new Backbone.Model;
            this.group_data.on("change", this.updateGroups, this);
        },

        render: function (options) {
            if (!xabber.accounts.connected.length) {
                utils.dialogs.error('No connected accounts found.');
                return;
            }
            options || (options = {});
            var accounts = options.account ? [options.account] : xabber.accounts.connected,
                jid = options.jid || '';
            this.$('input[name="username"]').val(jid).attr('readonly', !!jid)
                .removeClass('invalid');
            this.$('.single-acc').showIf(accounts.length === 1);
            this.$('.multiple-acc').hideIf(accounts.length === 1);
            this.$('.account-field .dropdown-content').empty();
            _.each(accounts, function (account) {
                this.$('.account-field .dropdown-content').append(
                        this.renderAccountItem(account));
            }.bind(this));
            this.bindAccount(accounts[0]);
            this.$('span.errors').text('');
            this.$el.appendTo('#modals').openModal({
                ready: function () {
                    Materialize.updateTextFields();
                    this.$('.account-field .dropdown-button').dropdown({
                        inDuration: 100,
                        outDuration: 100,
                        constrainWidth: false,
                        hover: false,
                        alignment: 'left'
                    });
                }.bind(this),
                complete: this.hide.bind(this)
            });
            return this;
        },

        bindAccount: function (account) {
            this.account = account;
            this.$('.account-field .dropdown-button .account-item-wrap')
                    .replaceWith(this.renderAccountItem(account));
            this.renderGroupsForAccount(account);
        },

        renderAccountItem: function (account) {
            var $item = $(templates.add_contact_account_item({jid: account.get('jid')}));
            $item.find('.circle-avatar').setAvatar(account.cached_image, this.avatar_size);
            return $item;
        },

        renderGroupsForAccount: function (account) {
            this.group_data.set({
                selected: [],
                groups: _.map(account.groups.notSpecial(), function (group) {
                    return group.get('name');
                })
            }, {silent: true});
            this.updateGroups();
        },

        updateGroups: function () {
            var selected = this.group_data.get('selected');
            this.$('.groups').html(templates.groups_checkbox_list({
                groups: _.map(this.group_data.get('groups'), function (name) {
                    return { name: name, id: uuid(), checked: _.contains(selected, name) };
                })
            }));
            this.updateScrollBar();
        },

        selectAccount: function (ev) {
            var $item = $(ev.target).closest('.account-item-wrap'),
                account = xabber.accounts.get($item.data('jid'));
            this.bindAccount(account);
        },

        editGroup: function (ev) {
            ev.preventDefault();
            var $target = $(ev.target),
                $input = $target.siblings('input'),
                checked = !$input.prop('checked'),
                group_name = $input.attr('data-groupname'),
                selected = _.clone(this.group_data.get('selected')),
                idx = selected.indexOf(group_name);
            $input.prop('checked', checked);
            if (checked) {
                idx < 0 && selected.push(group_name);
            } else if (idx >= 0) {
                selected.splice(idx, 1);
            }
            this.group_data.set('selected', selected);
        },

        checkNewGroup: function (ev) {
            var name = $(ev.target).val(),
                $checkbox = this.$('.new-group-checkbox');
            $checkbox.showIf(name && !_.contains(this.group_data.get('groups'), name));
        },

        addNewGroup: function (ev) {
            ev.preventDefault();
            var $input = this.$('.new-group-name input'),
                name = $input.val(),
                groups = _.clone(this.group_data.get('groups')),
                idx = groups.indexOf(name);
            if (idx < 0) {
                var selected = _.clone(this.group_data.get('selected'));
                selected.push(name);
                groups.push(name);
                this.group_data.set({groups: groups, selected: selected});
            }
            this.scrollToBottom();
        },

        addContact: function (ev) {
            this.$('span.errors').text('').addClass('hidden');
            var jid = this.$('input[name=username]').removeClass('invalid').val(),
                name = this.$('input[name=contact_name]').removeClass('invalid').val(),
                groups = this.group_data.get('selected'),
                contact, error_text;
            jid = Strophe.getBareJidFromJid(jid);
            if (!jid) {
                error_text = 'Input username!';
            } else if (jid === this.account.get('jid')) {
                error_text = 'Can not add yourself to contacts!';
            } else {
                contact = this.account.contacts.mergeContact(jid);
                if (contact.get('in_roster')) {
                    error_text = 'Contact is already in your roster!';
                }
            }
            if (error_text) {
                this.$('input[name=username]').addClass('invalid')
                    .siblings('.errors').text(error_text);
            } else {
                contact.pres('subscribed');
                contact.pushInRoster({name: name, groups: groups}, function () {
                    contact.pres('subscribe');
                    contact.trigger("open_chat", contact);
                }.bind(this));
                this.close();
            }
        },

        onHide: function () {
            this.$el.detach();
        },

        close: function () {
            this.$el.closeModal({ complete: this.hide.bind(this) });
        }
    });

    xabber.GroupSettings = Backbone.Model.extend({
        idAttribute: 'name',
        defaults: {
            expanded: true,
            show_offline: 'default',
            sorting: 'default',
            custom_notifications: false,
            notifications: false,
            message_preview: false
        }
    });

    xabber.GroupsSettings = Backbone.CollectionWithStorage.extend({
        model: xabber.GroupSettings,

        _initialize: function (models, options) {
            this.account = options.account;
            this.account.on("destroy", this.clearStorage, this);
            this.fetch();
        }
    });

    xabber.RosterSettings = Backbone.ModelWithStorage.extend({
        defaults: {
            pinned: true,
            show_offline: 'yes',
            sorting: 'online-first',
            general_group_name: 'General',
            non_roster_group_name: 'Not in roster'
        }
    });

    xabber.Account.addInitPlugin(function () {
        this.groups_settings = new xabber.GroupsSettings(null, {
            account: this,
            storage_name: xabber.getStorageName() + '-groups-settings-' + this.get('jid')
        });

        this.groups = new xabber.Groups(null, {account: this});
        this.contacts = new xabber.Contacts(null, {account: this});
        this.contacts.addCollection(this.roster = new xabber.Roster(null, {account: this}));
        this.contacts.addCollection(this.blocklist = new xabber.BlockList(null, {account: this}));

        this.settings_right.addChild('blocklist', xabber.BlockListView,
                {account: this, el: this.settings_right.$('.blocklist-info')[0]});

        this._added_pres_handlers.push(this.contacts.handlePresence.bind(this.contacts));

        this.on("ready_to_get_roster", function () {
            this.resources.reset();
            this.contacts.each(function (contact) {
                contact.resources.reset();
                contact.resetStatus();
            });
            this.blocklist.getFromServer();
            this.roster.getFromServer();
        }, this);
    });

    xabber.Account.addConnPlugin(function () {
        this.roster.registerHandler();
        this.blocklist.registerHandler();
    }, true, true);

    xabber.once("start", function () {
        this._roster_settings = new this.RosterSettings({id: 'roster-settings'},
                {storage_name: this.getStorageName(), fetch: 'after'});
        this.settings.roster = this._roster_settings.attributes;
        this.roster_settings_view = xabber.settings_view.addChild(
            'roster_settings', this.RosterSettingsView, {model: this._roster_settings});

        this.contacts_view = this.left_panel.addChild('contacts', this.RosterLeftView,
                {model: this.accounts});
        this.roster_view = this.body.addChild('roster', this.RosterRightView,
                {model: this.accounts});
        this.details_container = this.right_panel.addChild('details', this.Container);
        this.contact_placeholder = this.right_panel.addChild('contact_placeholder',
                this.ContactPlaceholderView);

        this.add_contact_view = new this.AddContactView();
        this.on("add_contact", function () {
            this.add_contact_view.show();
        }, this);
    }, xabber);

    return xabber;
  };
});
