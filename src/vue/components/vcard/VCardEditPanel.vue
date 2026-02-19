<template>
    <div class="account-vcard-edit-modal-wrap account-vcard-edit-wrap vue-migrated">
        <div class="buttons-wrap">
            <button class="btn-vcard-save btn-flat btn-main text-color-500 ground-color-grey-100 hover-ground-color-grey-300"
                    :class="{ hidden: !showSave }" @click="save">
                {{ saving ? xb.getString("saving") : xb.getString("vcard_edit__button_save") }}
            </button>
        </div>
        <div class="vcard-edit-wrap">
            <div class="input-label">{{ xb.getString("vcard_type_personal") }}</div>
            <div class="info-wrap personal-info-wrap">
                <div class="setting-icon-background">
                    <SvgIcon name="fullname" class="details-icon" />
                </div>
                <div class="input-field first-name">
                    <input class="input-glow account-glow" :id="uid + '-first-name'" :placeholder="xb.getString('vcard_given_name')"
                           type="text" name="first_name" v-model="form.first_name" @input="onInput" @keyup="onKeyUp">
                </div>
                <div class="input-field middle-name">
                    <input class="input-glow account-glow" :id="uid + '-middle-name'" :placeholder="xb.getString('vcard_middle_name')"
                           type="text" name="middle_name" v-model="form.middle_name" @input="onInput" @keyup="onKeyUp">
                </div>
                <div class="input-field last-name">
                    <input class="input-glow account-glow" :id="uid + '-last-name'" :placeholder="xb.getString('vcard_family_name')"
                           type="text" name="last_name" v-model="form.last_name" @input="onInput" @keyup="onKeyUp">
                </div>
                <div class="input-field fullname">
                    <input class="input-glow account-glow" :id="uid + '-fullname'" :placeholder="xb.getString('vcard_full_name')"
                           type="text" name="fullname" v-model="form.fullname" @keyup="onKeyUp">
                </div>
            </div>

            <div class="input-label">{{ xb.getString("vcard_nick_name") }}</div>
            <div class="info-wrap nickname-info-wrap">
                <div class="setting-icon-background">
                    <SvgIcon name="account" class="details-icon" />
                </div>
                <div class="input-field nickname">
                    <input class="input-glow account-glow" :id="uid + '-nickname'" :placeholder="nicknamePlaceholder"
                           type="text" name="nickname" v-model="form.nickname" @keyup="onKeyUp">
                </div>
            </div>

            <div class="input-label">{{ xb.getString("vcard_birth_date") }}</div>
            <div class="info-wrap birthday-info-wrap">
                <div class="setting-icon-background">
                    <SvgIcon name="birthday" class="details-icon" />
                </div>
                <div class="input-field birthday">
                    <input class="input-glow account-glow datepicker" :id="uid + '-birthday'"
                           :placeholder="xb.getString('vcard_birth_date_placeholder')" type="text"
                           ref="birthdayInput" @keyup="onKeyUp">
                </div>
            </div>

            <div class="input-label">{{ xb.getString("vcard_job") }}</div>
            <div class="info-wrap job-info-wrap">
                <div class="setting-icon-background">
                    <SvgIcon name="job" class="details-icon" />
                </div>
                <div class="input-field org-name">
                    <input class="input-glow account-glow" :id="uid + '-org-name'" :placeholder="xb.getString('vcard_organization')"
                           type="text" name="org_name" v-model="form.org_name" @keyup="onKeyUp">
                </div>
                <div class="input-field job-title">
                    <input class="input-glow account-glow" :id="uid + '-job-title'" :placeholder="xb.getString('vcard_title')"
                           type="text" name="job_title" v-model="form.job_title" @keyup="onKeyUp">
                </div>
                <div class="input-field org-unit">
                    <input class="input-glow account-glow" :id="uid + '-org-unit'" :placeholder="xb.getString('vcard_organization_unit')"
                           type="text" name="org_unit" v-model="form.org_unit" @keyup="onKeyUp">
                </div>
                <div class="input-field role">
                    <input class="input-glow account-glow" :id="uid + '-role'" :placeholder="xb.getString('vcard_role')"
                           type="text" name="role" v-model="form.role" @keyup="onKeyUp">
                </div>
            </div>

            <div class="input-label">{{ xb.getString("vcard_url") }}</div>
            <div class="info-wrap site-info-wrap">
                <div class="setting-icon-background">
                    <SvgIcon name="web" class="details-icon" />
                </div>
                <div class="input-field url">
                    <input class="input-glow account-glow" :id="uid + '-url'" :placeholder="xb.getString('vcard_url_placeholder')"
                           type="text" name="url" v-model="form.url" @keyup="onKeyUp">
                </div>
            </div>

            <div class="input-label">{{ xb.getString("vcard_decsription") }}</div>
            <div class="info-wrap description-info-wrap">
                <div class="setting-icon-background">
                    <SvgIcon name="description" class="details-icon" />
                </div>
                <div class="input-field description">
                    <textarea :id="uid + '-description'" :placeholder="xb.getString('vcard_decsription_placeholder')"
                              type="text" cols="30" rows="10" class="text-field textarea-glow input-glow account-glow"
                              name="description" v-model="form.description" @keyup="onKeyUp"></textarea>
                </div>
            </div>

            <div class="input-label">{{ xb.getString("vcard_telephone") }}</div>
            <div class="info-wrap phone-info-wrap">
                <div class="setting-icon-background">
                    <SvgIcon name="call" class="details-icon" />
                </div>
                <div class="input-field phone-work">
                    <input class="input-glow account-glow" :id="uid + '-phone-work'" :placeholder="xb.getString('vcard_type_work')"
                           type="text" name="phone_work" v-model="form.phone_work" @keyup="onKeyUp">
                </div>
                <div class="input-field phone-home">
                    <input class="input-glow account-glow" :id="uid + '-phone-home'" :placeholder="xb.getString('vcard_type_home')"
                           type="text" name="phone_home" v-model="form.phone_home" @keyup="onKeyUp">
                </div>
                <div class="input-field phone-mobile">
                    <input class="input-glow account-glow" :id="uid + '-phone-mobile'" :placeholder="xb.getString('vcard_type_mobile')"
                           type="text" name="phone_mobile" v-model="form.phone_mobile" @keyup="onKeyUp">
                </div>
            </div>

            <div class="input-label">{{ xb.getString("vcard_email") }}</div>
            <div class="info-wrap email-info-wrap">
                <div class="setting-icon-background">
                    <SvgIcon name="email" class="details-icon" />
                </div>
                <div class="input-field email-work">
                    <input class="input-glow account-glow" :id="uid + '-email-work'" :placeholder="xb.getString('vcard_type_work')"
                           type="text" name="email_work" v-model="form.email_work" @keyup="onKeyUp">
                </div>
                <div class="input-field email-home">
                    <input class="input-glow account-glow" :id="uid + '-email-home'" :placeholder="xb.getString('vcard_type_personal')"
                           type="text" name="email_home" v-model="form.email_home" @keyup="onKeyUp">
                </div>
            </div>

            <div class="input-label">{{ xb.getString("vcard_home_address") }}</div>
            <div class="info-wrap address-info-wrap">
                <div class="setting-icon-background">
                    <SvgIcon name="address" class="details-icon" />
                </div>
                <div class="input-wrap address-wrap address-home-wrap">
                    <div class="input-field pobox">
                        <input class="input-glow account-glow" :id="uid + '-po-home-box'" :placeholder="xb.getString('vcard_address_pobox')"
                               type="text" name="po_home_box" v-model="form.addr_home_pobox" @keyup="onKeyUp">
                    </div>
                    <div class="input-field extadd">
                        <input class="input-glow account-glow" :id="uid + '-addr-home-extadd'" :placeholder="xb.getString('vcard_address_extadr')"
                               type="text" name="addr_home_extadd" v-model="form.addr_home_extadd" @keyup="onKeyUp">
                    </div>
                    <div class="input-field street">
                        <input class="input-glow account-glow" :id="uid + '-addr-home-street'" :placeholder="xb.getString('vcard_address_street')"
                               type="text" name="addr_home_street" v-model="form.addr_home_street" @keyup="onKeyUp">
                    </div>
                    <div class="input-field locality">
                        <input class="input-glow account-glow" :id="uid + '-addr-home-locality'" :placeholder="xb.getString('vcard_address_locality')"
                               type="text" name="addr_home_locality" v-model="form.addr_home_locality" @keyup="onKeyUp">
                    </div>
                    <div class="input-field region">
                        <input class="input-glow account-glow" :id="uid + '-addr-home-region'" :placeholder="xb.getString('vcard_address_region')"
                               type="text" name="addr_home_region" v-model="form.addr_home_region" @keyup="onKeyUp">
                    </div>
                    <div class="input-field pcode">
                        <input class="input-glow account-glow" :id="uid + '-addr-home-pcode'" :placeholder="xb.getString('vcard_address_pcode')"
                               type="text" name="addr_home_pcode" v-model="form.addr_home_pcode" @keyup="onKeyUp">
                    </div>
                    <div class="input-field country">
                        <input class="input-glow account-glow" :id="uid + '-addr-home-country'" :placeholder="xb.getString('vcard_address_ctry')"
                               type="text" name="addr_home_country" v-model="form.addr_home_country" @keyup="onKeyUp">
                    </div>
                </div>
            </div>

            <div class="input-label">{{ xb.getString("vcard_work_address") }}</div>
            <div class="info-wrap address-info-wrap">
                <div class="setting-icon-background">
                    <SvgIcon name="address" class="details-icon" />
                </div>
                <div class="input-wrap address-wrap address-work-wrap">
                    <div class="input-field pobox">
                        <input class="input-glow account-glow" :id="uid + '-po-work-box'" :placeholder="xb.getString('vcard_address_pobox')"
                               type="text" name="po_work_box" v-model="form.addr_work_pobox" @keyup="onKeyUp">
                    </div>
                    <div class="input-field extadd">
                        <input class="input-glow account-glow" :id="uid + '-addr-work-extadd'" :placeholder="xb.getString('vcard_address_extadr')"
                               type="text" name="addr_work_extadd" v-model="form.addr_work_extadd" @keyup="onKeyUp">
                    </div>
                    <div class="input-field street">
                        <input class="input-glow account-glow" :id="uid + '-addr-work-street'" :placeholder="xb.getString('vcard_address_street')"
                               type="text" name="addr_work_street" v-model="form.addr_work_street" @keyup="onKeyUp">
                    </div>
                    <div class="input-field locality">
                        <input class="input-glow account-glow" :id="uid + '-addr-work-locality'" :placeholder="xb.getString('vcard_address_locality')"
                               type="text" name="addr_work_locality" v-model="form.addr_work_locality" @keyup="onKeyUp">
                    </div>
                    <div class="input-field region">
                        <input class="input-glow account-glow" :id="uid + '-addr-work-region'" :placeholder="xb.getString('vcard_address_region')"
                               type="text" name="addr_work_region" v-model="form.addr_work_region" @keyup="onKeyUp">
                    </div>
                    <div class="input-field pcode">
                        <input class="input-glow account-glow" :id="uid + '-addr-work-pcode'" :placeholder="xb.getString('vcard_address_pcode')"
                               type="text" name="addr_work_pcode" v-model="form.addr_work_pcode" @keyup="onKeyUp">
                    </div>
                    <div class="input-field country">
                        <input class="input-glow account-glow" :id="uid + '-addr-work-country'" :placeholder="xb.getString('vcard_address_ctry')"
                               type="text" name="addr_work_country" v-model="form.addr_work_country" @keyup="onKeyUp">
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, nextTick } from 'vue';
import { useXabber } from '../../composables/useXabber.js';
import SvgIcon from '../SvgIcon.vue';

const props = defineProps({
    model: { type: Object, required: true }
});

const xb = useXabber();
const utils = xb.env.utils;
const $ = xb.env.$;
const moment = xb.env.moment;

const uid = 'vcard-edit-' + Math.random().toString(36).substr(2, 9);
const birthdayInput = ref(null);
const saving = ref(false);
const showSave = ref(false);

const form = ref({
    nickname: '', fullname: '', first_name: '', middle_name: '', last_name: '',
    birthday: '',
    role: '', job_title: '', org_name: '', org_unit: '',
    url: '', description: '',
    phone_work: '', phone_home: '', phone_mobile: '',
    email_work: '', email_home: '',
    addr_home_pobox: '', addr_home_extadd: '', addr_home_street: '',
    addr_home_locality: '', addr_home_region: '', addr_home_pcode: '', addr_home_country: '',
    addr_work_pobox: '', addr_work_extadd: '', addr_work_street: '',
    addr_work_locality: '', addr_work_region: '', addr_work_pcode: '', addr_work_country: '',
});

const nicknamePlaceholder = computed(() => {
    let parts = ((form.value.first_name + " " + form.value.middle_name).trim() + " " + form.value.last_name).trim();
    return parts || props.model.get('jid');
});

function setData() {
    let vcard = props.model.get('vcard') || {};
    form.value.nickname = vcard.nickname || '';
    form.value.fullname = vcard.fullname || '';
    form.value.first_name = vcard.first_name || '';
    form.value.middle_name = vcard.middle_name || '';
    form.value.last_name = vcard.last_name || '';
    form.value.birthday = vcard.birthday || '';
    form.value.role = vcard.role || '';
    form.value.job_title = vcard.job_title || '';
    form.value.org_name = vcard.org ? (vcard.org.name || '') : '';
    form.value.org_unit = vcard.org ? (vcard.org.unit || '') : '';
    form.value.url = vcard.url || '';
    form.value.description = vcard.description || '';
    form.value.phone_work = vcard.phone ? (vcard.phone.work || '') : '';
    form.value.phone_home = vcard.phone ? (vcard.phone.home || '') : '';
    form.value.phone_mobile = vcard.phone ? (vcard.phone.mobile || '') : '';
    form.value.email_work = vcard.email ? (vcard.email.work || '') : '';
    form.value.email_home = vcard.email ? (vcard.email.home || '') : '';

    let addrHome = (vcard.address && vcard.address.home) || {};
    form.value.addr_home_pobox = addrHome.pobox || '';
    form.value.addr_home_extadd = addrHome.extadd || '';
    form.value.addr_home_street = addrHome.street || '';
    form.value.addr_home_locality = addrHome.locality || '';
    form.value.addr_home_region = addrHome.region || '';
    form.value.addr_home_pcode = addrHome.pcode || '';
    form.value.addr_home_country = addrHome.country || '';

    let addrWork = (vcard.address && vcard.address.work) || {};
    form.value.addr_work_pobox = addrWork.pobox || '';
    form.value.addr_work_extadd = addrWork.extadd || '';
    form.value.addr_work_street = addrWork.street || '';
    form.value.addr_work_locality = addrWork.locality || '';
    form.value.addr_work_region = addrWork.region || '';
    form.value.addr_work_pcode = addrWork.pcode || '';
    form.value.addr_work_country = addrWork.country || '';

    // Set birthday via DOM since datepicker manages its own state
    nextTick(() => {
        if (birthdayInput.value) {
            birthdayInput.value.value = vcard.birthday || '';
        }
    });
}

function getData() {
    let vcard = utils.vcard.getBlank(props.model.get('jid'));
    vcard.nickname = form.value.nickname;
    vcard.fullname = form.value.fullname;
    vcard.first_name = form.value.first_name;
    vcard.last_name = form.value.last_name;
    vcard.middle_name = form.value.middle_name;
    vcard.birthday = birthdayInput.value ? birthdayInput.value.value : form.value.birthday;
    vcard.role = form.value.role;
    vcard.job_title = form.value.job_title;
    vcard.org.name = form.value.org_name;
    vcard.org.unit = form.value.org_unit;
    vcard.url = form.value.url;
    vcard.description = form.value.description;
    vcard.phone.work = form.value.phone_work;
    vcard.phone.home = form.value.phone_home;
    vcard.phone.mobile = form.value.phone_mobile;
    vcard.email.work = form.value.email_work;
    vcard.email.home = form.value.email_home;

    vcard.address.home = {
        pobox: form.value.addr_home_pobox, extadd: form.value.addr_home_extadd,
        street: form.value.addr_home_street, locality: form.value.addr_home_locality,
        region: form.value.addr_home_region, pcode: form.value.addr_home_pcode,
        country: form.value.addr_home_country
    };
    vcard.address.work = {
        pobox: form.value.addr_work_pobox, extadd: form.value.addr_work_extadd,
        street: form.value.addr_work_street, locality: form.value.addr_work_locality,
        region: form.value.addr_work_region, pcode: form.value.addr_work_pcode,
        country: form.value.addr_work_country
    };
    return vcard;
}

function save() {
    if (saving.value) return;
    saving.value = true;
    props.model.setVCard(getData(),
        () => {
            props.model.getVCard();
            saving.value = false;
            showSave.value = false;
        },
        () => {
            utils.dialogs.error(xb.getString("account_user_info_save_fail"));
            saving.value = false;
        }
    );
}

function onKeyUp() {
    showSave.value = true;
}

function onInput() {
    // Nickname placeholder updates reactively via computed
}

function render() {
    saving.value = false;
    showSave.value = false;
    setData();
    nextTick(() => {
        if (typeof Materialize !== 'undefined' && Materialize.updateTextFields) {
            Materialize.updateTextFields();
        }
    });
}

onMounted(() => {
    // Initialize datepicker on the birthday input
    nextTick(() => {
        if (birthdayInput.value) {
            let $input = $(birthdayInput.value).pickadate({
                selectMonths: true,
                selectYears: 100,
                autoOk: false,
                min: new Date(moment.now() - 3153600000000),
                max: new Date(moment.now() - 86400000),
                format: 'dd.mm.yyyy',
                allowKeyboardControl: false,
                today: '',
                onClose: function() {
                    $(document.activeElement).blur();
                    showSave.value = true;
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
            $input.on('mousedown', function(evt) {
                evt.preventDefault();
            });
        }
    });
});

defineExpose({ render, save });
</script>
