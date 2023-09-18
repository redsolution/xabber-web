import xabber from "xabber-core";

let env = xabber.env,
    constants = env.constants,
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

    get: function(jid, callback, errback) {
        let iq = $iq({type: 'get', to: jid}).c('vCard', {xmlns: Strophe.NS.VCARD});
        this._connection.sendIQ(iq, function (res) {
            if (!callback) { return; }
            let vcard = xmlToObject($(res).find('vCard[xmlns='+Strophe.NS.VCARD+']'));
            vcard.jabber_id || (vcard.jabber_id = jid);
            return callback(vcard);
        }, errback);
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

xabber.VCardView = xabber.BasicView.extend({
    template: templates.vcard,

    _initialize: function () {
        this.$el.html(this.template());
        this.model.on("change:vcard_updated", this.update, this);
        this.data.on("change:refresh", this.updateRefreshButton, this);
    },

    render: function () {
        this.$('.block-header .block-name').text(this.model.get('group_chat') ? 'Group chat details' : xabber.getString("vcard_screen__header"));
        this.data.set('refresh', false);
        this.model.getVCard(() => {
            this.update();
        });
    },

    update: function () {
        let $info, vcard = this.model.get('vcard');

        $info = this.$('.jid-info-wrap');
        $info.find('.jabber-id').showIf(vcard.jabber_id).find('.value').text(vcard.jabber_id);
        $info.showIf(vcard.jabber_id);

        $info = this.$('.personal-info-wrap');
        $info.find('.fullname').showIf(vcard.fullname).find('.value').text(vcard.fullname);
        $info.find('.first-name').showIf(vcard.first_name).find('.value').text(vcard.first_name);
        $info.find('.middle-name').showIf(vcard.middle_name).find('.value').text(vcard.middle_name);
        $info.find('.last-name').showIf(vcard.last_name).find('.value').text(vcard.last_name);
        $info.showIf(vcard.fullname || vcard.first_name || vcard.middle_name || vcard.last_name);

        $info = this.$('.nickname-info-wrap');
        $info.find('.nickname').showIf(vcard.nickname).find('.value').text(vcard.nickname);
        $info.showIf(vcard.nickname);

        $info = this.$('.birthday-info-wrap');
        $info.find('.birthday').showIf(vcard.birthday).find('.value').text(vcard.birthday);
        $info.showIf(vcard.birthday);

        $info = this.$('.job-info-wrap');
        $info.find('.role').showIf(vcard.role).find('.value').text(vcard.role);
        $info.find('.job-title').showIf(vcard.job_title).find('.value').text(vcard.job_title);
        $info.find('.org-name').showIf(vcard.org.name).find('.value').text(vcard.org.name);
        $info.find('.org-unit').showIf(vcard.org.unit).find('.value').text(vcard.org.unit);
        $info.showIf(vcard.role || vcard.job_title || vcard.org.name || vcard.org.unit);

        $info = this.$('.site-info-wrap');
        $info.find('.url').showIf(vcard.url).find('.value').text(vcard.url).hyperlinkify();
        $info.showIf(vcard.url);

        $info = this.$('.description-info-wrap');
        $info.find('.description').showIf(vcard.description).find('.value').text(vcard.description);
        $info.showIf(vcard.description);

        let $addr_info = this.$('.address-info-wrap'),
            address = _.clone(vcard.address),
            show_addr_block = false;
        $addr_info.find('.info').addClass('hidden');
        _.each(address, function (addr, type) {
            $info = $addr_info.find('.address-'+type);
            $info.find('.pobox').showIf(addr.pobox).text(addr.pobox);
            $info.find('.extadd').showIf(addr.extadd).text(addr.extadd);
            $info.find('.street').showIf(addr.street).text(addr.street);
            $info.find('.locality').showIf(addr.locality).text(addr.locality);
            $info.find('.region').showIf(addr.region).text(addr.region);
            $info.find('.pcode').showIf(addr.pcode).text(addr.pcode);
            $info.find('.country').showIf(addr.country).text(addr.country);
            let show = (addr.pobox || addr.extadd || addr.street || addr.locality ||
                         addr.region || addr.pcode || addr.country);
            show && (show_addr_block = true);
            $info.showIf(show);
        });
        $addr_info.showIf(show_addr_block);

        $info = this.$('.phone-info-wrap');
        let phone = vcard.phone;
        if (phone) {
            $info.find('.phone-work').showIf(phone.work).find('.value').text(phone.work);
            $info.find('.phone-home').showIf(phone.home).find('.value').text(phone.home);
            $info.find('.phone-mobile').showIf(phone.mobile).find('.value').text(phone.mobile);
            $info.find('.phone-default').showIf(phone.default).find('.value').text(phone.default);
        }
        $info.showIf(phone && (phone.work || phone.home || phone.mobile || phone.default));

        $info = this.$('.email-info-wrap');
        let email = vcard.email;
        if (email) {
            $info.find('.email-work').showIf(email.work).find('.value').text(email.work);
            $info.find('.email-home').showIf(email.home).find('.value').text(email.home);
            $info.find('.email-default').showIf(email.default).find('.value').text(email.default);
        }
        $info.showIf(email && (email.work || email.home || email.default));

        this.parent.updateScrollBar();
    },

    onClickIcon: function (ev) {
        let $target_info = $(ev.target).closest('.info-wrap'),
            $target_value = $target_info.find('.value'), copied_text = "";
        $target_value.each((idx, item) => {
            let $item = $(item),
                value_text = $item.text();
            value_text && (copied_text != "") && (copied_text += '\n');
            value_text && (copied_text += value_text);
            copied_text && utils.copyTextToClipboard(copied_text, xabber.getString("toast__copied_in_clipboard"), xabber.getString("toast__not_copied_in_clipboard"));
        });
    },

    updateRefreshButton: function () {
        this.$('.btn-vcard-refresh .button').hideIf(this.data.get('refresh'));
        this.$('.btn-vcard-refresh .preloader-wrapper').showIf(this.data.get('refresh'));
    },

    refresh: function () {
        if (!this.data.get('refresh')) {
            this.data.set('refresh', true);
            this.model.getVCard(() => {
                this.data.set('refresh', false);
            });
        }
    }
});

xabber.VCardRightView = xabber.VCardView.extend({
    template: templates.vcard_right,

    __initialize: function (ev) {
        this.ps_container = this.$('.full-vcard-content');
        if (this.ps_container.length) {
            this.ps_container.perfectScrollbar(
                _.extend(this.ps_settings || {}, xabber.ps_settings)
            );
        }
        this.ps_container.on("ps-scroll-up ps-scroll-down", this.onScroll.bind(this));
        this.model.set('vcard_hidden', true)
    },

    render: function () {
        this.data.set('refresh', false);
        this.update();
        this.$('.full-vcard-wrap').hideIf(this.model.get('vcard_hidden'))
        if (this.parent.ps_container.length) {
            if(!this.model.get('vcard_hidden'))
                this.parent.ps_container.perfectScrollbar('destroy')
            else
                this.parent.ps_container.perfectScrollbar(
                    _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
                );
        }
        this.model.updateName();
        this.model.updateAvatar();
        this.model.getVCard(() => {
            this.update();
        });
    },

    update: function () {
        let $info, vcard = this.model.get('vcard');

        $info = this.$('.jid-info-wrap');
        $info.find('.jabber-id').showIf(vcard.jabber_id).find('.value').text(vcard.jabber_id);
        $info.showIf(vcard.jabber_id);

        $info = this.$('.vcard-wrap .personal-info-wrap');
        $info.find('.first-name').showIf(vcard.first_name).find('.value').text(vcard.first_name);
        $info.find('.last-name').showIf(vcard.last_name).find('.value').text(vcard.last_name);
        $info.showIf(vcard.first_name || vcard.last_name);

        $info = this.$('.full-vcard-wrap .personal-info-wrap');
        $info.find('.fullname').showIf(vcard.fullname).find('.value').text(vcard.fullname);
        $info.find('.first-name').showIf(vcard.first_name).find('.value').text(vcard.first_name);
        $info.find('.middle-name').showIf(vcard.middle_name).find('.value').text(vcard.middle_name);
        $info.find('.last-name').showIf(vcard.last_name).find('.value').text(vcard.last_name);
        $info.showIf(vcard.fullname || vcard.first_name || vcard.middle_name || vcard.last_name);

        $info = this.$('.nickname-info-wrap');
        $info.find('.nickname').showIf(vcard.nickname).find('.value').text(vcard.nickname);
        $info.showIf(vcard.nickname);

        $info = this.$('.birthday-info-wrap');
        $info.find('.birthday').showIf(vcard.birthday).find('.value').text(vcard.birthday);
        $info.showIf(vcard.birthday);

        $info = this.$('.job-info-wrap');
        $info.find('.role').showIf(vcard.role).find('.value').text(vcard.role);
        $info.find('.job-title').showIf(vcard.job_title).find('.value').text(vcard.job_title);
        $info.find('.org-name').showIf(vcard.org.name).find('.value').text(vcard.org.name);
        $info.find('.org-unit').showIf(vcard.org.unit).find('.value').text(vcard.org.unit);
        $info.showIf(vcard.role || vcard.job_title || vcard.org.name || vcard.org.unit);

        $info = this.$('.site-info-wrap');
        $info.find('.url').showIf(vcard.url).find('.value').text(vcard.url).hyperlinkify();
        $info.showIf(vcard.url);

        $info = this.$('.description-info-wrap');
        $info.find('.description').showIf(vcard.description).find('.value').text(vcard.description);
        $info.showIf(vcard.description);

        let $addr_info = this.$('.address-info-wrap'),
            address = _.clone(vcard.address),
            show_addr_block = false;
        $addr_info.find('.info').addClass('hidden');
        _.each(address, function (addr, type) {
            $info = $addr_info.find('.address-'+type);
            $info.find('.pobox').showIf(addr.pobox).text(addr.pobox);
            $info.find('.extadd').showIf(addr.extadd).text(addr.extadd);
            $info.find('.street').showIf(addr.street).text(addr.street);
            $info.find('.locality').showIf(addr.locality).text(addr.locality);
            $info.find('.region').showIf(addr.region).text(addr.region);
            $info.find('.pcode').showIf(addr.pcode).text(addr.pcode);
            $info.find('.country').showIf(addr.country).text(addr.country);
            let show = (addr.pobox || addr.extadd || addr.street || addr.locality ||
                addr.region || addr.pcode || addr.country);
            show && (show_addr_block = true);
            $info.showIf(show);
        });
        $addr_info.showIf(show_addr_block);

        $info = this.$('.phone-info-wrap');
        let phone = vcard.phone;
        if (phone) {
            $info.find('.phone-work').showIf(phone.work).find('.value').text(phone.work);
            $info.find('.phone-home').showIf(phone.home).find('.value').text(phone.home);
            $info.find('.phone-mobile').showIf(phone.mobile).find('.value').text(phone.mobile);
            $info.find('.phone-default').showIf(phone.default).find('.value').text(phone.default);
        }
        $info.showIf(phone && (phone.work || phone.home || phone.mobile || phone.default));

        $info = this.$('.email-info-wrap');
        let email = vcard.email;
        if (email) {
            $info.find('.email-work').showIf(email.work).find('.value').text(email.work);
            $info.find('.email-home').showIf(email.home).find('.value').text(email.home);
            $info.find('.email-default').showIf(email.default).find('.value').text(email.default);
        }
        $info.showIf(email && (email.work || email.home || email.default));

        this.parent.updateScrollBar();
    },

    onScroll: function () {
        if(this.ps_container[0].scrollTop >= 170) {
            this.$('.vcard-header-title').addClass('fixed-scroll');
            this.$('.vcard-header-title').attr('style', 'background-color: rgba(255,255,255,1) !important; -webkit-transition: none; -ms-transition: none;transition: none;');
        }
        else if(this.ps_container[0].scrollTop >= 40) {
            this.$('.vcard-header-title').removeClass('fixed-scroll');
            this.$('.vcard-header-title').attr('style', 'background-color: rgba(255,255,255,0.5) !important;');
        }
        else {
            this.$('.vcard-header-title').removeClass('fixed-scroll');
            this.$('.vcard-header-title').attr('style', 'background-color: rgba(255,255,255,0) !important;');
        }

    },

    onClickIcon: function (ev) {
        let $target_info = $(ev.target),
            $target_value = $target_info.find('.value'), copied_text = "";
        $target_value.each((idx, item) => {
            let $item = $(item),
                value_text = $item.text();
            value_text && (copied_text != "") && (copied_text += '\n');
            value_text && (copied_text += value_text);
            copied_text && utils.copyTextToClipboard(copied_text, xabber.getString("toast__copied_in_clipboard"), xabber.getString("toast__not_copied_in_clipboard"));
        });
    },

});

xabber.VCardEditView = xabber.BasicView.extend({
    className: 'account-vcard-edit-wrap',
    template: templates.vcard_edit,
    ps_selector: '.panel-content',

    events: {
        "keyup input": "keyUp",
        "keyup textarea": "keyUp",
        "input .first-name input": "changePlaceholder",
        "input .middle-name input": "changePlaceholder",
        "input .last-name input": "changePlaceholder",
        "click .btn-vcard-save": "save",
        "click .btn-vcard-back": "render",
    },

    _initialize: function () {
        let self = this,
            $input = this.$('.datepicker').pickadate({
            selectMonths: true,
            selectYears: 100,
            autoOk: false,
            // min = 100 years ago
            min: new Date(moment.now() - 3153600000000),
            max: new Date(moment.now() - 86400000),
            format: 'dd.mm.yyyy',
            allowKeyboardControl: false,
            today: '',
            onClose: function(){
                $(document.activeElement).blur();
                self.$('.btn-vcard-back').removeClass('hidden');
                self.$('.btn-vcard-save').removeClass('hidden');
            },
            klass: {
                weekday_display: 'picker__weekday-display ground-color-700',
                date_display: 'picker__date-display ground-color-500',
                navPrev: 'picker__nav--prev hover-ground-color-100',
                navNext: 'picker__nav--next hover-ground-color-100',
                selected: 'picker__day--selected ground-color-500',
                now: 'picker__day--today text-color-700',
                buttonClear: 'btn-flat btn-main btn-dark',
                buttonClose: 'btn-flat btn-main text-color-700'
            }
        });
        $input.on('mousedown', function cancelEvent(evt) {
            evt.preventDefault();
        });
        this.data.on("change:saving", this.updateSaveButton, this);
    },

    render: function () {
        this.data.set('saving', false);
        this.setData();
        Materialize.updateTextFields();
        this.changePlaceholder();
        this.updateScrollBar();
        this.$('.btn-vcard-back').addClass('hidden');
        this.$('.btn-vcard-save').addClass('hidden');
    },

    changePlaceholder: function () {
        let nickname_placeholder = ((this.$('.first-name input').val() + " " + this.$('.middle-name input').val()).trim() + " " + this.$('.last-name input').val()).trim() || this.model.get('jid');
        this.$('.nickname input').attr('placeholder', nickname_placeholder);
    },

    setData: function () {
        let vcard = this.model.get('vcard');

        this.$('.nickname input').val(vcard.nickname);
        this.$('.fullname input').val(vcard.fullname);
        this.$('.first-name input').val(vcard.first_name);
        this.$('.last-name input').val(vcard.last_name);
        this.$('.middle-name input').val(vcard.middle_name);

        this.$('.birthday input').val(vcard.birthday);

        this.$('.role input').val(vcard.role);
        this.$('.job-title input').val(vcard.job_title);
        this.$('.org-name input').val(vcard.org.name);
        this.$('.org-unit input').val(vcard.org.unit);

        this.$('.url input').val(vcard.url);

        this.$('.description textarea').val(vcard.description);

        this.$('.phone-work input').val(vcard.phone.work);
        this.$('.phone-home input').val(vcard.phone.home);
        this.$('.phone-mobile input').val(vcard.phone.mobile);

        this.$('.email-work input').val(vcard.email.work);
        this.$('.email-home input').val(vcard.email.home);

        let addr = vcard.address.work || {},
            $info = this.$('.address-work-wrap');
        $info.find('.pobox input').val(addr.pobox);
        $info.find('.extadd input').val(addr.extadd);
        $info.find('.street input').val(addr.street);
        $info.find('.locality input').val(addr.locality);
        $info.find('.region input').val(addr.region);
        $info.find('.pcode input').val(addr.pcode);
        $info.find('.country input').val(addr.country);

        addr = vcard.address.home || {};
        $info = this.$('.address-home-wrap');
        $info.find('.pobox input').val(addr.pobox);
        $info.find('.extadd input').val(addr.extadd);
        $info.find('.street input').val(addr.street);
        $info.find('.locality input').val(addr.locality);
        $info.find('.region input').val(addr.region);
        $info.find('.pcode input').val(addr.pcode);
        $info.find('.country input').val(addr.country);
    },

    getData: function () {
        let vcard = utils.vcard.getBlank(this.model.get('jid'));

        vcard.nickname = this.$('.nickname input').val();
        vcard.fullname = this.$('.fullname input').val();
        vcard.first_name = this.$('.first-name input').val();
        vcard.last_name = this.$('.last-name input').val();
        vcard.middle_name = this.$('.middle-name input').val();

        vcard.birthday = this.$('.birthday input').val();

        vcard.role = this.$('.role input').val();
        vcard.job_title = this.$('.job-title input').val();
        vcard.org.name = this.$('.org-name input').val();
        vcard.org.unit = this.$('.org-unit input').val();

        vcard.url = this.$('.url input').val();

        vcard.description = this.$('.description textarea').val();

        vcard.phone.work = this.$('.phone-work input').val();
        vcard.phone.home = this.$('.phone-home input').val();
        vcard.phone.mobile = this.$('.phone-mobile input').val();

        vcard.email.work = this.$('.email-work input').val();
        vcard.email.home = this.$('.email-home input').val();

        vcard.address.work = {};
        let addr = vcard.address.work,
            $info = this.$('.address-work-wrap');
        addr.pobox = $info.find('.pobox input').val();
        addr.extadd = $info.find('.extadd input').val();
        addr.street = $info.find('.street input').val();
        addr.locality = $info.find('.locality input').val();
        addr.region = $info.find('.region input').val();
        addr.pcode = $info.find('.pcode input').val();
        addr.country = $info.find('.country input').val();

        vcard.address.home = {};
        addr = vcard.address.home;
        $info = this.$('.address-home-wrap');
        addr.pobox = $info.find('.pobox input').val();
        addr.extadd = $info.find('.extadd input').val();
        addr.street = $info.find('.street input').val();
        addr.locality = $info.find('.locality input').val();
        addr.region = $info.find('.region input').val();
        addr.pcode = $info.find('.pcode input').val();
        addr.country = $info.find('.country input').val();
        return vcard;
    },

    updateSaveButton: function () {
        this.$('.btn-vcard-save').text(this.data.get('saving') ? xabber.getString("saving") : xabber.getString("vcard_edit__button_save"));
    },

    save: function () {
        if (this.data.get('saving')) {
            return;
        }
        this.data.set('saving', true);
        this.model.setVCard(this.getData(),
            () => {
                this.model.getVCard();
                this.data.set('saving', false);
                this.$('.btn-vcard-back').addClass('hidden');
                this.$('.btn-vcard-save').addClass('hidden');
            },
            function () {
                utils.dialogs.error(xabber.getString("account_user_info_save_fail"));
                this.data.set('saving', false);
            }
        );
    },

    keyUp: function () {
        this.$('.btn-vcard-back').removeClass('hidden');
        this.$('.btn-vcard-save').removeClass('hidden');
    },
});

xabber.VCardEditModalView = xabber.BasicView.extend({
    className: 'account-vcard-edit-modal-wrap account-vcard-edit-wrap',
    template: templates.vcard_edit_modal,
    ps_selector: '.panel-content',

    events: {
        "keyup input": "keyUp",
        "keyup textarea": "keyUp",
        "input .first-name input": "changePlaceholder",
        "input .middle-name input": "changePlaceholder",
        "input .last-name input": "changePlaceholder",
        "click .btn-vcard-save": "save",
        // "click .btn-vcard-back": "render",
        // "click .btn-cancel": "close",
    },

    _initialize: function () {
        let self = this,
            $input = this.$('.datepicker').pickadate({
            selectMonths: true,
            selectYears: 100,
            autoOk: false,
            // min = 100 years ago
            min: new Date(moment.now() - 3153600000000),
            max: new Date(moment.now() - 86400000),
            format: 'dd.mm.yyyy',
            allowKeyboardControl: false,
            today: '',
            onClose: function(){
                $(document.activeElement).blur();
                self.$('.btn-vcard-back').removeClass('hidden');
                self.$('.btn-vcard-save').removeClass('hidden');
            },
            klass: {
                weekday_display: 'picker__weekday-display ground-color-700',
                date_display: 'picker__date-display ground-color-500',
                navPrev: 'picker__nav--prev hover-ground-color-100',
                navNext: 'picker__nav--next hover-ground-color-100',
                selected: 'picker__day--selected ground-color-500',
                now: 'picker__day--today text-color-700',
                buttonClear: 'btn-flat btn-main btn-dark',
                buttonClose: 'btn-flat btn-main text-color-700'
            }
        });
        $input.on('mousedown', function cancelEvent(evt) {
            evt.preventDefault();
        });
        this.data.on("change:saving", this.updateSaveButton, this);
    },

    render: function (options) {
        this.$el.detach();
        options.$el && options.$el.append(this.$el);
        if (options.$el && !this.is_rendered){
            this.is_rendered = true;
            this.data.set('saving', false);
            this.setData();
            Materialize.updateTextFields();
            this.changePlaceholder();
            this.updateScrollBar();
            this.$('.btn-vcard-save').addClass('hidden');
        }
    },

    onHide: function () {
        this.$el.detach();
    },

    close: function () {
        this.$el.closeModal({ complete: this.hide.bind(this) });
    },

    changePlaceholder: function () {
        let nickname_placeholder = ((this.$('.first-name input').val() + " " + this.$('.middle-name input').val()).trim() + " " + this.$('.last-name input').val()).trim() || this.model.get('jid');
        this.$('.nickname input').attr('placeholder', nickname_placeholder);
    },

    setData: function () {
        let vcard = this.model.get('vcard');

        this.$('.nickname input').val(vcard.nickname);
        this.$('.fullname input').val(vcard.fullname);
        this.$('.first-name input').val(vcard.first_name);
        this.$('.last-name input').val(vcard.last_name);
        this.$('.middle-name input').val(vcard.middle_name);

        this.$('.birthday input').val(vcard.birthday);

        this.$('.role input').val(vcard.role);
        this.$('.job-title input').val(vcard.job_title);
        this.$('.org-name input').val(vcard.org.name);
        this.$('.org-unit input').val(vcard.org.unit);

        this.$('.url input').val(vcard.url);

        this.$('.description textarea').val(vcard.description);

        this.$('.phone-work input').val(vcard.phone.work);
        this.$('.phone-home input').val(vcard.phone.home);
        this.$('.phone-mobile input').val(vcard.phone.mobile);

        this.$('.email-work input').val(vcard.email.work);
        this.$('.email-home input').val(vcard.email.home);

        let addr = vcard.address.work || {},
            $info = this.$('.address-work-wrap');
        $info.find('.pobox input').val(addr.pobox);
        $info.find('.extadd input').val(addr.extadd);
        $info.find('.street input').val(addr.street);
        $info.find('.locality input').val(addr.locality);
        $info.find('.region input').val(addr.region);
        $info.find('.pcode input').val(addr.pcode);
        $info.find('.country input').val(addr.country);

        addr = vcard.address.home || {};
        $info = this.$('.address-home-wrap');
        $info.find('.pobox input').val(addr.pobox);
        $info.find('.extadd input').val(addr.extadd);
        $info.find('.street input').val(addr.street);
        $info.find('.locality input').val(addr.locality);
        $info.find('.region input').val(addr.region);
        $info.find('.pcode input').val(addr.pcode);
        $info.find('.country input').val(addr.country);
    },

    getData: function () {
        let vcard = utils.vcard.getBlank(this.model.get('jid'));

        vcard.nickname = this.$('.nickname input').val();
        vcard.fullname = this.$('.fullname input').val();
        vcard.first_name = this.$('.first-name input').val();
        vcard.last_name = this.$('.last-name input').val();
        vcard.middle_name = this.$('.middle-name input').val();

        vcard.birthday = this.$('.birthday input').val();

        vcard.role = this.$('.role input').val();
        vcard.job_title = this.$('.job-title input').val();
        vcard.org.name = this.$('.org-name input').val();
        vcard.org.unit = this.$('.org-unit input').val();

        vcard.url = this.$('.url input').val();

        vcard.description = this.$('.description textarea').val();

        vcard.phone.work = this.$('.phone-work input').val();
        vcard.phone.home = this.$('.phone-home input').val();
        vcard.phone.mobile = this.$('.phone-mobile input').val();

        vcard.email.work = this.$('.email-work input').val();
        vcard.email.home = this.$('.email-home input').val();

        vcard.address.work = {};
        let addr = vcard.address.work,
            $info = this.$('.address-work-wrap');
        addr.pobox = $info.find('.pobox input').val();
        addr.extadd = $info.find('.extadd input').val();
        addr.street = $info.find('.street input').val();
        addr.locality = $info.find('.locality input').val();
        addr.region = $info.find('.region input').val();
        addr.pcode = $info.find('.pcode input').val();
        addr.country = $info.find('.country input').val();

        vcard.address.home = {};
        addr = vcard.address.home;
        $info = this.$('.address-home-wrap');
        addr.pobox = $info.find('.pobox input').val();
        addr.extadd = $info.find('.extadd input').val();
        addr.street = $info.find('.street input').val();
        addr.locality = $info.find('.locality input').val();
        addr.region = $info.find('.region input').val();
        addr.pcode = $info.find('.pcode input').val();
        addr.country = $info.find('.country input').val();
        return vcard;
    },

    updateSaveButton: function () {
        this.$('.btn-vcard-save').text(this.data.get('saving') ? xabber.getString("saving") : xabber.getString("vcard_edit__button_save"));
    },

    save: function () {
        if (this.data.get('saving')) {
            return;
        }
        this.data.set('saving', true);
        this.model.setVCard(this.getData(),
            () => {
                this.model.getVCard();
                this.data.set('saving', false);
                this.$('.btn-vcard-back').addClass('hidden');
                this.$('.btn-vcard-save').addClass('hidden');
            },
            function () {
                utils.dialogs.error(xabber.getString("account_user_info_save_fail"));
                this.data.set('saving', false);
            }
        );
    },

    keyUp: function () {
        console.log(this);
        console.log(this.$('.btn-vcard-save'));
        this.$('.btn-vcard-back').removeClass('hidden');
        this.$('.btn-vcard-save').removeClass('hidden');
    },
});

export default xabber;
