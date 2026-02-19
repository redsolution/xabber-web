import xabber from "xabber-core";
import { createApp } from 'vue';
import { createVueBackboneView, VIEW_EL_KEY } from "./vue/mountVue.js";
import { XABBER_KEY } from "./vue/composables/useXabber.js";
import VCardPanel from "./vue/components/vcard/VCardPanel.vue";
import VCardEditPanel from "./vue/components/vcard/VCardEditPanel.vue";
import VCardRightPanel from "./vue/components/vcard/VCardRightPanel.vue";

let env = xabber.env,
    templates = env.templates.vcard,
    $ = env.$,
    _ = env._,
    moment = env.moment,
    Strophe = env.Strophe,
    $iq = env.$iq,
    $build = env.$build,
    utils = env.utils;

let xmlToObject = function ($vcard) {
    let vcard = {
        nickname: $vcard.find('NICKNAME').text().trim(),
        fullname: $vcard.find('FN').text().trim(),
        first_name: $vcard.find('N GIVEN').text().trim(),
        middle_name: $vcard.find('N MIDDLE').text().trim(),
        last_name: $vcard.find('N FAMILY').text().trim(),
        birthday: $vcard.find('BDAY').text().trim(),
        job_title: $vcard.find('TITLE').text().trim(),
        role: $vcard.find('ROLE').text().trim(),
        url: $vcard.find('URL').text().trim(),
        description: $vcard.find('DESC').text().trim(),
        jabber_id: $vcard.find('JABBERID').text().trim(),
        org: {},
        photo: {},
        phone: {},
        address: {},
        email: {}
    };

    if ($vcard.find('X-PRIVACY').length || $vcard.find('X-MEMBERSHIP').length || $vcard.find('X-INDEX').length) {
        vcard.group_info = {
            jid: vcard.jabber_id,
            description: vcard.description,
            name: vcard.nickname,
            anonymous: $vcard.find('X-PRIVACY').text().trim(),
            searchable: $vcard.find('X-INDEX').text().trim(),
            model: $vcard.find('X-MEMBERSHIP').text().trim(),
            status_msg: $vcard.find('X-STATUS').text().trim(),
            members_num: $vcard.find('X-MEMBERS').text().trim()
        };
    }

    let $org = $vcard.find('ORG');
    if ($org.length) {
        vcard.org.name = $org.find('ORGNAME').text().trim();
        vcard.org.unit = $org.find('ORGUNIT').text().trim();
    }

    let $photo = $vcard.find('PHOTO');
    if ($photo.length) {
        vcard.photo.image = $photo.find('BINVAL').text().trim();
        vcard.photo.type = $photo.find('TYPE').text().trim();
    }

    $vcard.find('TEL').each(function () {
        let $this = $(this),
            number = $this.find('NUMBER').text().trim();
        if (!number) {
            return;
        }
        if ($this.find('WORK').length) {
            vcard.phone.work = number;
        } else if ($this.find('HOME').length) {
            vcard.phone.home = number;
        } else if ($this.find('MOBILE').length) {
            vcard.phone.mobile = number;
        } else {
            vcard.phone.default = number;
        }
    });

    $vcard.find('EMAIL').each(function () {
        let $this = $(this);
        let email = $this.find('USERID').text().trim();
        if (!email) {
            return;
        }
        if ($this.find('WORK').length) {
            vcard.email.work = email;
        } else if ($this.find('HOME').length) {
            vcard.email.home = email;
        } else {
            vcard.email.default = email;
        }
    });

    $vcard.find('ADR').each(function () {
        let $this = $(this);
        let address = {
            pobox: $this.find('POBOX').text().trim(),
            extadd: $this.find('EXTADR').text().trim(),
            street: $this.find('STREET').text().trim(),
            locality: $this.find('LOCALITY').text().trim(),
            region: $this.find('REGION').text().trim(),
            pcode: $this.find('PCODE').text().trim(),
            country: $this.find('CTRY').text().trim()
        };
        if ($this.find('WORK').length) {
            vcard.address.work = address;
        } else if ($this.find('HOME').length) {
            vcard.address.home = address;
        } else {
            vcard.address.default = address;
        }
    });

    return vcard;
};

let objectToXml = function (vcard) {
    let $vcard = $build("vCard", {xmlns: Strophe.NS.VCARD});
    vcard.nickname && $vcard.c("NICKNAME").t(vcard.nickname).up();
    vcard.fullname && $vcard.c("FN").t(vcard.fullname).up();
    if (vcard.first_name || vcard.last_name || vcard.middle_name) {
        $vcard.c("N");
        vcard.first_name && $vcard.c("GIVEN").t(vcard.first_name).up();
        vcard.last_name && $vcard.c("FAMILY").t(vcard.last_name).up();
        vcard.middle_name && $vcard.c("MIDDLE").t(vcard.middle_name).up();
        $vcard.up();
    }
    vcard.birthday && $vcard.c("BDAY").t(vcard.birthday).up();
    vcard.job_title && $vcard.c("TITLE").t(vcard.job_title).up();
    vcard.role && $vcard.c("ROLE").t(vcard.role).up();
    if (vcard.org.name || vcard.org.unit) {
        $vcard.c("ORG");
        vcard.org.name && $vcard.c("ORGNAME").t(vcard.org.name).up();
        vcard.org.unit && $vcard.c("ORGUNIT").t(vcard.org.unit).up();
        $vcard.up();
    }
    vcard.url && $vcard.c("URL").t(vcard.url).up();
    if (vcard.photo.image) {
        $vcard.c("PHOTO").c("BINVAL").t(vcard.photo.image).up();
        $vcard.c("TYPE").t(vcard.photo.type || 'image/jpeg').up();
        $vcard.up();
    }
    vcard.description && $vcard.c("DESC").t(vcard.description).up();
    vcard.jabber_id && $vcard.c("JABBERID").t(vcard.jabber_id).up();

    _.each(vcard.phone, function (phone, type) {
        $vcard.c("TEL").c("NUMBER").t(phone).up();
        type !== 'default' && $vcard.c(type.toUpperCase()).up();
        $vcard.up();
    });

    _.each(vcard.email, function (email, type) {
        $vcard.c("EMAIL").c("USERID").t(email).up();
        type !== 'default' && $vcard.c(type.toUpperCase()).up();
        $vcard.up();
    });

    _.each(vcard.address, function (address, type) {
        $vcard.c("ADR");
        type !== 'default' && $vcard.c(type.toUpperCase()).up();
        address.pobox && $vcard.c("POBOX").t(address.pobox).up();
        address.extadd && $vcard.c("EXTADR").t(address.extadd).up();
        address.street && $vcard.c("STREET").t(address.street).up();
        address.locality && $vcard.c("LOCALITY").t(address.locality).up();
        address.region && $vcard.c("REGION").t(address.region).up();
        address.pcode && $vcard.c("PCODE").t(address.pcode).up();
        address.country && $vcard.c("CTRY").t(address.country).up();
        $vcard.up();
    });

    return $vcard.tree();
};

Strophe.addConnectionPlugin('vcard', {
    _connection: null,

    init: function(conn) {
        this._connection = conn;
        return Strophe.addNamespace('VCARD', 'vcard-temp');
    },

    get: function(jid, callback, errback, timeout) {
        let iq = $iq({type: 'get', to: jid}).c('vCard', {xmlns: Strophe.NS.VCARD});
        this._connection.sendIQ(iq, function (res) {
            if (!callback) { return; }
            let vcard = xmlToObject($(res).find('vCard[xmlns='+Strophe.NS.VCARD+']'));
            vcard.jabber_id || (vcard.jabber_id = jid);
            return callback(vcard);
        }, errback, timeout);
    },

    set: function(jid, vcard, callback, errback) {
        vcard.jabber_id || (vcard.jabber_id = jid);
        let iq = $iq({type: 'set', to: jid}).cnode(objectToXml(vcard));
        this._connection.sendIQ(iq, callback, errback);
    }
});

utils.vcard = {
    getBlank: function (jid) {
        let vcard = xmlToObject($('<div/>'));
        vcard.jabber_id = jid;
        return vcard;
    }
};

xabber.VCardView = createVueBackboneView(xabber, {
    component: VCardPanel,
    props: function (view) {
        return { model: view.model, showEditButton: false, isGroupChat: !!(view.model.get && view.model.get('group_chat')) };
    },
    extend: {
        onShow: function () {
            this.render.apply(this, arguments);
        },

        render: function () {
            this._vueInstance && this._vueInstance.render();
        },

        refresh: function () {
            this._vueInstance && this._vueInstance.refresh();
        },

        updateScrollBar: function () {
            this.parent && this.parent.updateScrollBar && this.parent.updateScrollBar();
        }
    }
});

xabber.VCardRightView = createVueBackboneView(xabber, {
    component: VCardRightPanel,
    props: function (view) {
        return { model: view.model };
    },
    extend: {
        _vueInit: function () {
            this._vueInstance.setBackboneView(this);
        },

        onShow: function () {
            this.render.apply(this, arguments);
        },

        render: function () {
            this._vueInstance && this._vueInstance.render();
        },

        refresh: function () {
            this._vueInstance && this._vueInstance.refresh();
        },

        showVCard: function () {
            this._vueInstance && this._vueInstance.showVCard();
        },

        hideVCard: function () {
            this._vueInstance && this._vueInstance.hideVCard();
        },

        scrollToTop: function () {
            this._vueInstance && this._vueInstance.scrollToTop();
        },

        onScroll: function () {
            this._vueInstance && this._vueInstance.onScroll();
        }
    }
});

xabber.VCardEditModalView = createVueBackboneView(xabber, {
    component: VCardEditPanel,
    className: 'account-vcard-edit-modal-wrap account-vcard-edit-wrap',
    props: function (view) {
        return { model: view.model };
    },
    extend: {
        ps_selector: '.panel-content',

        onShow: function () {
            this.render.apply(this, arguments);
        },

        render: function (options) {
            if (options && options.$el) {
                options.$el.html('');
                options.$el.append(this.$el);
            }
            this._vueInstance && this._vueInstance.render();
            this.updateScrollBar();
        },

        onHide: function () {
            this.$el.detach();
        },

        close: function () {
            this.$el.closeModal({ complete: this.hide.bind(this) });
        },

        save: function () {
            this._vueInstance && this._vueInstance.save();
        }
    }
});

export default xabber;
