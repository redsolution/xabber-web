define("xabber-vcard", function () {
  return function (xabber) {
    var env = xabber.env,
        constants = env.constants,
        templates = env.templates.vcard,
        $ = env.$,
        _ = env._,
        moment = env.moment,
        Strophe = env.Strophe,
        $iq = env.$iq,
        $build = env.$build,
        utils = env.utils;

    var xmlToObject = function ($vcard) {
        var vcard = {
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

        var $org = $vcard.find('ORG');
        if ($org.length) {
            vcard.org.name = $org.find('ORGNAME').text().trim();
            vcard.org.unit = $org.find('ORGUNIT').text().trim();
        }

        var $photo = $vcard.find('PHOTO');
        if ($photo.length) {
            vcard.photo.image = $photo.find('BINVAL').text().trim();
            vcard.photo.type = $photo.find('TYPE').text().trim();
        }

        $vcard.find('TEL').each(function () {
            var $this = $(this);
            var number = $this.find('NUMBER').text().trim();
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
            var $this = $(this);
            var email = $this.find('USERID').text().trim();
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
            var $this = $(this);
            var address = {
                extadd: $this.find('EXTADD').text().trim(),
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

    var objectToXml = function (vcard) {
        var $vcard = $build("vCard", {xmlns: Strophe.NS.VCARD});
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
            address.extadd && $vcard.c("EXTADD").t(address.extadd).up();
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
            var iq = $iq({type: 'get', to: jid}).c('vCard', {xmlns: Strophe.NS.VCARD});
            this._connection.sendIQ(iq, function (res) {
                if (!callback) { return; }
                var vcard = xmlToObject($(res).find('vCard[xmlns='+Strophe.NS.VCARD+']'));
                vcard.jabber_id || (vcard.jabber_id = jid);
                return callback(vcard);
            }, errback);
        },

        set: function(jid, vcard, callback, errback) {
            vcard.jabber_id || (vcard.jabber_id = jid);
            var iq = $iq({type: 'set', to: jid}).cnode(objectToXml(vcard));
            this._connection.sendIQ(iq, callback, errback);
        }
    });

    utils.vcard = {
        getBlank: function (jid) {
            var vcard = xmlToObject($('<div/>'));
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
            this.data.set('refresh', false);
            this.update();
        },

        update: function () {
            var $info, vcard = this.model.get('vcard');

            $info = this.$('.jid-info-wrap');
            $info.find('.jabber-id').showIf(vcard.jabber_id).find('.value').text(vcard.jabber_id);
            $info.showIf(vcard.jabber_id);

            $info = this.$('.personal-info-wrap');
            $info.find('.nickname').showIf(vcard.nickname).find('.value').text(vcard.nickname);
            $info.find('.fullname').showIf(vcard.fullname).find('.value').text(vcard.fullname);
            $info.find('.first-name').showIf(vcard.first_name).find('.value').text(vcard.first_name);
            $info.find('.middle-name').showIf(vcard.middle_name).find('.value').text(vcard.middle_name);
            $info.find('.last-name').showIf(vcard.last_name).find('.value').text(vcard.last_name);
            $info.showIf(vcard.nickname || vcard.fullname || vcard.first_name || vcard.middle_name || vcard.last_name);

            $info = this.$('.birthday-info-wrap');
            $info.find('.birthday').showIf(vcard.birthday).find('.value').text(vcard.birthday);
            $info.showIf(vcard.birthday);

            $info = this.$('.job-info-wrap');
            $info.find('.job-title').showIf(vcard.job_title).find('.value').text(vcard.job_title);
            $info.find('.org-name').showIf(vcard.org.name).find('.value').text(vcard.org.name);
            $info.find('.org-unit').showIf(vcard.org.unit).find('.value').text(vcard.org.unit);
            $info.showIf(vcard.job_title || vcard.org.name || vcard.org.unit);

            $info = this.$('.site-info-wrap');
            $info.find('.url').showIf(vcard.url).find('.value').text(vcard.url).hyperlinkify();
            $info.showIf(vcard.url);

            $info = this.$('.description-info-wrap');
            $info.find('.description').showIf(vcard.description).find('.value').text(vcard.description);
            $info.showIf(vcard.description);

            var $addr_info = this.$('.address-info-wrap'),
                address = _.clone(vcard.address),
                show_addr_block = false;
            $addr_info.find('.info').addClass('hidden');
            _.each(address, function (addr, type) {
                $info = $addr_info.find('.address-'+type);
                $info.find('.extadd').showIf(addr.extadd).text(addr.extadd);
                $info.find('.street').showIf(addr.street).text(addr.street);
                $info.find('.locality').showIf(addr.locality).text(addr.locality);
                $info.find('.region').showIf(addr.region).text(addr.region);
                $info.find('.pcode').showIf(addr.pcode).text(addr.pcode);
                $info.find('.country').showIf(addr.country).text(addr.country);
                var show = (addr.extadd || addr.street || addr.locality ||
                             addr.region || addr.pcode || addr.country);
                show && (show_addr_block = true);
                $info.showIf(show);
            });
            $addr_info.showIf(show_addr_block);

            $info = this.$('.phone-info-wrap');
            var phone = vcard.phone;
            if (phone) {
                $info.find('.phone-work').showIf(phone.work).find('.value').text(phone.work);
                $info.find('.phone-home').showIf(phone.home).find('.value').text(phone.home);
                $info.find('.phone-mobile').showIf(phone.mobile).find('.value').text(phone.mobile);
                $info.find('.phone-default').showIf(phone.default).find('.value').text(phone.default);
            }
            $info.showIf(phone && (phone.work || phone.home || phone.mobile || phone.default));

            $info = this.$('.email-info-wrap');
            var email = vcard.email;
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
            $target_value.each(function (idx, item) {
                let $item = $(item),
                    value_text = $item.text();
                value_text && (copied_text != "") && (copied_text += '\n');
                value_text && (copied_text += value_text);
                copied_text && utils.copyTextToClipboard(copied_text, 'Copied in clipboard', 'ERROR: Not copied in clipboard');
            }.bind(this));
        },

        updateRefreshButton: function () {
            this.$('.btn-vcard-refresh .button').hideIf(this.data.get('refresh'));
            this.$('.btn-vcard-refresh .preloader-wrapper').showIf(this.data.get('refresh'));
        },

        refresh: function () {
            if (!this.data.get('refresh')) {
                this.data.set('refresh', true);
                this.model.getVCard(function () {
                    this.data.set('refresh', false);
                }.bind(this));
            }
        }
    });

    xabber.VCardEditView = xabber.BasicView.extend({
        className: 'account-vcard-edit-wrap',
        template: templates.vcard_edit,
        ps_selector: '.panel-content',
        avatar_size: constants.AVATAR_SIZES.ACCOUNT_VCARD_EDIT,

        events: {
            "change .circle-avatar input": "changeAvatar",
            "click .btn-vcard-save": "save",
            "click .btn-vcard-back": "back"
        },

        _initialize: function () {
            this.$('.datepicker').pickadate({
                selectMonths: true,
                selectYears: 100,
                // min = 100 years ago
                min: new Date(moment.now() - 3153600000000),
                max: new Date(moment.now() - 86400000),
                format: 'dd.mm.yyyy',
                today: '',
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
            this.data.on("change:saving", this.updateSaveButton, this);
        },

        render: function () {
            this.data.set('saving', false);
            this.setData();
            Materialize.updateTextFields();
            this.updateScrollBar();
        },

        setData: function () {
            var vcard = this.model.get('vcard');

            this.$('.nickname input').val(vcard.nickname);
            this.$('.fullname input').val(vcard.fullname);
            this.$('.first-name input').val(vcard.first_name);
            this.$('.last-name input').val(vcard.last_name);
            this.$('.middle-name input').val(vcard.middle_name);

            this.avatar = vcard.photo.image;
            this.$('.circle-avatar').setAvatar(this.model.cached_image, this.avatar_size);

            this.$('.birthday input').val(vcard.birthday);

            this.$('.job-title input').val(vcard.job_title);
            this.$('.org-name input').val(vcard.org.name);
            this.$('.org-unit input').val(vcard.org.unit);

            this.$('.url input').val(vcard.url);

            this.$('.description input').val(vcard.description);

            this.$('.phone-work input').val(vcard.phone.work);
            this.$('.phone-home input').val(vcard.phone.home);
            this.$('.phone-mobile input').val(vcard.phone.mobile);

            this.$('.email-work input').val(vcard.email.work);
            this.$('.email-home input').val(vcard.email.home);

            var addr = vcard.address.work || {},
                $info = this.$('.address-work-wrap');
            $info.find('.extadd input').val(addr.extadd);
            $info.find('.street input').val(addr.street);
            $info.find('.locality input').val(addr.locality);
            $info.find('.region input').val(addr.region);
            $info.find('.pcode input').val(addr.pcode);
            $info.find('.country input').val(addr.country);

            addr = vcard.address.home || {};
            $info = this.$('.address-home-wrap');
            $info.find('.extadd input').val(addr.extadd);
            $info.find('.street input').val(addr.street);
            $info.find('.locality input').val(addr.locality);
            $info.find('.region input').val(addr.region);
            $info.find('.pcode input').val(addr.pcode);
            $info.find('.country input').val(addr.country);
        },

        getData: function () {
            var vcard = utils.vcard.getBlank(this.model.get('jid'));

            vcard.nickname = this.$('.nickname input').val();
            vcard.fullname = this.$('.fullname input').val();
            vcard.first_name = this.$('.first-name input').val();
            vcard.last_name = this.$('.last-name input').val();
            vcard.middle_name = this.$('.middle-name input').val();

            this.avatar && (vcard.photo.image = this.avatar);

            vcard.birthday = this.$('.birthday input').val();

            vcard.job_title = this.$('.job-title input').val();
            vcard.org.name = this.$('.org-name input').val();
            vcard.org.unit = this.$('.org-unit input').val();

            vcard.url = this.$('.url input').val();

            vcard.description = this.$('.description input').val();

            vcard.phone.work = this.$('.phone-work input').val();
            vcard.phone.home = this.$('.phone-home input').val();
            vcard.phone.mobile = this.$('.phone-mobile input').val();

            vcard.email.work = this.$('.email-work input').val();
            vcard.email.home = this.$('.email-home input').val();

            vcard.address.work = {};
            var addr = vcard.address.work,
                $info = this.$('.address-work-wrap');
            addr.extadd = $info.find('.extadd input').val();
            addr.street = $info.find('.street input').val();
            addr.locality = $info.find('.locality input').val();
            addr.region = $info.find('.region input').val();
            addr.pcode = $info.find('.pcode input').val();
            addr.country = $info.find('.country input').val();

            vcard.address.home = {};
            addr = vcard.address.home;
            $info = this.$('.address-home-wrap');
            addr.extadd = $info.find('.extadd input').val();
            addr.street = $info.find('.street input').val();
            addr.locality = $info.find('.locality input').val();
            addr.region = $info.find('.region input').val();
            addr.pcode = $info.find('.pcode input').val();
            addr.country = $info.find('.country input').val();
            return vcard;
        },

        changeAvatar: function (ev) {
            var field = ev.target;
            if (!field.files.length) {
                return;
            }
            var file = field.files[0];
            field.value = '';
            if (file.size > constants.MAX_AVATAR_FILE_SIZE) {
                utils.dialogs.error('File is too large');
                return;
            } else if (!file.type.startsWith('image')) {
                utils.dialogs.error('Wrong image');
                return;
            }
            utils.images.getAvatarFromFile(file).done(function (image) {
                if (image) {
                    this.avatar = image;
                    this.$('.circle-avatar').setAvatar(image, this.avatar_size);
                } else {
                    utils.dialogs.error('Wrong image');
                }
            }.bind(this));
        },

        updateSaveButton: function () {
            this.$('.btn-vcard-save').text(this.data.get('saving') ? 'Saving...' : 'Save');
        },

        save: function () {
            if (this.data.get('saving')) {
                return;
            }
            this.data.set('saving', true);
            this.model.setVCard(this.getData(),
                function () {
                    this.model.getVCard();
                    this.data.set('saving', false);
                }.bind(this),
                function () {
                    utils.dialogs.error('Could not save vCard.');
                    this.data.set('saving', false);
                }
            );
        },

        back: function () {
            this.model.showSettings(null, 'vcard');
        }
    });

    return xabber;
  };
});
