<template>
    <div class="vue-migrated">
        <div class="block-header">
            <span class="block-name">{{ headerTitle }}</span>
            <div class="btn-vcard-refresh" @click="refresh">
                <div class="button" v-show="!refreshing">
                    <i class="mdi mdi-20px mdi-refresh"></i>
                </div>
                <div class="preloader-wrapper preloader-20px active" v-show="refreshing">
                    <div class="spinner-layer">
                        <div class="circle-clipper left"><div class="circle"></div></div>
                        <div class="gap-patch"><div class="circle"></div></div>
                        <div class="circle-clipper right"><div class="circle"></div></div>
                    </div>
                </div>
            </div>
        </div>
        <div class="vcard-wrap">
            <div class="info-wrap jid-info-wrap" v-show="vcard.jabber_id" @click="onClickIcon($event)">
                <div class="details-icon-wrap" :title="copyTooltip">
                    <SvgIcon name="xmpp" class="details-icon" />
                </div>
                <div class="info jabber-id" v-show="vcard.jabber_id">
                    <div class="value one-line" v-html="jabberIdHtml"></div>
                    <div class="label">{{ xb.getString("vcard_jabber_id") }}</div>
                </div>
            </div>
            <div class="info-wrap personal-info-wrap" v-show="hasPersonalInfo" @click="onClickIcon($event)">
                <div class="details-icon-wrap" :title="copyTooltip">
                    <SvgIcon name="account-outline" class="details-icon" />
                </div>
                <div class="info first-name" v-show="vcard.first_name">
                    <div class="value one-line">{{ vcard.first_name }}</div>
                    <div class="label">{{ xb.getString("vcard_given_name") }}</div>
                </div>
                <div class="info middle-name" v-show="vcard.middle_name">
                    <div class="value one-line">{{ vcard.middle_name }}</div>
                    <div class="label">{{ xb.getString("vcard_middle_name") }}</div>
                </div>
                <div class="info last-name" v-show="vcard.last_name">
                    <div class="value one-line">{{ vcard.last_name }}</div>
                    <div class="label">{{ xb.getString("vcard_family_name") }}</div>
                </div>
                <div class="info fullname" v-show="vcard.fullname">
                    <div class="value one-line">{{ vcard.fullname }}</div>
                    <div class="label">{{ xb.getString("vcard_full_name") }}</div>
                </div>
            </div>
            <div class="info-wrap nickname-info-wrap" v-show="vcard.nickname" @click="onClickIcon($event)">
                <i class="details-icon mdi mdi-24px mdi-account-box-outline"></i>
                <div class="info nickname" v-show="vcard.nickname">
                    <div class="value one-line">{{ vcard.nickname }}</div>
                    <div class="label">{{ xb.getString("vcard_nick_name") }}</div>
                </div>
            </div>
            <div class="info-wrap birthday-info-wrap" v-show="vcard.birthday" @click="onClickIcon($event)">
                <div class="details-icon-wrap" :title="copyTooltip">
                    <SvgIcon name="birthday-outline" class="details-icon" />
                </div>
                <div class="info birthday" v-show="vcard.birthday">
                    <div class="value one-line">{{ vcard.birthday }}</div>
                    <div class="label">{{ xb.getString("vcard_birth_date") }}</div>
                </div>
            </div>
            <div class="info-wrap job-info-wrap" v-show="hasJobInfo" @click="onClickIcon($event)">
                <div class="details-icon-wrap" :title="copyTooltip">
                    <SvgIcon name="job-outline" class="details-icon" />
                </div>
                <div class="info org-name" v-show="vcard.org && vcard.org.name">
                    <div class="value one-line">{{ vcard.org?.name }}</div>
                    <div class="label">{{ xb.getString("vcard_organization") }}</div>
                </div>
                <div class="info job-title" v-show="vcard.job_title">
                    <div class="value one-line">{{ vcard.job_title }}</div>
                    <div class="label">{{ xb.getString("vcard_title") }}</div>
                </div>
                <div class="info org-unit" v-show="vcard.org && vcard.org.unit">
                    <div class="value one-line">{{ vcard.org?.unit }}</div>
                    <div class="label">{{ xb.getString("vcard_organization_unit") }}</div>
                </div>
                <div class="info role" v-show="vcard.role">
                    <div class="value one-line">{{ vcard.role }}</div>
                    <div class="label">{{ xb.getString("vcard_role") }}</div>
                </div>
            </div>
            <div class="info-wrap site-info-wrap" v-show="vcard.url" @click="onClickIcon($event)">
                <i :title="copyTooltip" class="details-icon mdi mdi-24px mdi-web"></i>
                <div class="info url" v-show="vcard.url">
                    <div class="value one-line" ref="urlValueEl">{{ vcard.url }}</div>
                    <div class="label">{{ xb.getString("vcard_url") }}</div>
                </div>
            </div>
            <div class="info-wrap description-info-wrap" v-show="vcard.description" @click="onClickIcon($event)">
                <i :title="copyTooltip" class="details-icon mdi mdi-24px mdi-file-document-box"></i>
                <div class="info description" v-show="vcard.description">
                    <div class="value">{{ vcard.description }}</div>
                    <div class="label">{{ xb.getString("vcard_decsription") }}</div>
                </div>
            </div>
            <div class="info-wrap phone-info-wrap" v-show="hasPhone" @click="onClickIcon($event)">
                <i :title="copyTooltip" class="details-icon mdi mdi-24px mdi-phone"></i>
                <div class="info phone-work" v-show="vcard.phone?.work">
                    <div class="value one-line">{{ vcard.phone?.work }}</div>
                    <div class="label">{{ xb.getString("vcard_type_work") }}</div>
                </div>
                <div class="info phone-home" v-show="vcard.phone?.home">
                    <div class="value one-line">{{ vcard.phone?.home }}</div>
                    <div class="label">{{ xb.getString("vcard_type_home") }}</div>
                </div>
                <div class="info phone-mobile" v-show="vcard.phone?.mobile">
                    <div class="value one-line">{{ vcard.phone?.mobile }}</div>
                    <div class="label">{{ xb.getString("vcard_type_mobile") }}</div>
                </div>
                <div class="info phone-default" v-show="vcard.phone?.default">
                    <div class="value one-line">{{ vcard.phone?.default }}</div>
                    <div class="label">{{ xb.getString("vcard_telephone") }}</div>
                </div>
            </div>
            <div class="info-wrap email-info-wrap" v-show="hasEmail" @click="onClickIcon($event)">
                <i :title="copyTooltip" class="details-icon mdi mdi-24px mdi-email"></i>
                <div class="info email-work" v-show="vcard.email?.work">
                    <div class="value one-line">{{ vcard.email?.work }}</div>
                    <div class="label">{{ xb.getString("vcard_type_work") }}</div>
                </div>
                <div class="info email-home" v-show="vcard.email?.home">
                    <div class="value one-line">{{ vcard.email?.home }}</div>
                    <div class="label">{{ xb.getString("vcard_type_personal") }}</div>
                </div>
                <div class="info email-default" v-show="vcard.email?.default">
                    <div class="value one-line">{{ vcard.email?.default }}</div>
                    <div class="label">{{ xb.getString("vcard_email") }}</div>
                </div>
            </div>
            <div class="info-wrap address-info-wrap" v-show="hasAddress" @click="onClickIcon($event)">
                <i :title="copyTooltip" class="details-icon mdi mdi-24px mdi-map-marker"></i>
                <template v-for="(addr, type) in vcard.address" :key="type">
                    <div :class="'info address-' + type" v-show="hasAddrFields(addr)">
                        <div class="pobox value one-line" v-show="addr.pobox">{{ addr.pobox }}</div>
                        <div class="extadd value one-line" v-show="addr.extadd">{{ addr.extadd }}</div>
                        <div class="street value one-line" v-show="addr.street">{{ addr.street }}</div>
                        <div class="locality value one-line" v-show="addr.locality">{{ addr.locality }}</div>
                        <div class="region value one-line" v-show="addr.region">{{ addr.region }}</div>
                        <div class="pcode value one-line" v-show="addr.pcode">{{ addr.pcode }}</div>
                        <div class="country value one-line" v-show="addr.country">{{ addr.country }}</div>
                        <div class="label">{{ getAddressLabel(type) }}</div>
                    </div>
                </template>
            </div>
            <button v-if="showEditButton" class="btn-vcard-edit btn-flat btn-main btn-dark ground-color-grey-100 hover-ground-color-grey-300"
                    v-show="isConnected" @click="showEditView">
                {{ xb.getString("edit_vcard") }}
            </button>
        </div>
    </div>
</template>

<script setup>
import { ref, shallowRef, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useXabber } from '../../composables/useXabber.js';
import SvgIcon from '../SvgIcon.vue';

const props = defineProps({
    model: { type: Object, required: true },
    showEditButton: { type: Boolean, default: false },
    isGroupChat: { type: Boolean, default: false }
});

let backboneView = null;

const xb = useXabber();
const utils = xb.env.utils;
const Strophe = xb.env.Strophe;

const vcard = shallowRef(props.model.get('vcard') || {});
const refreshing = ref(false);
const isConnected = ref(props.model.isConnected ? props.model.isConnected() : true);
const urlValueEl = ref(null);

const copyTooltip = computed(() => xb.getString("group_settings__properties__tooltip_copy_by_click"));

const headerTitle = computed(() => {
    return props.isGroupChat ? 'Group chat details' : xb.getString("vcard_screen__header");
});

const jabberIdHtml = computed(() => {
    if (!vcard.value.jabber_id) return '';
    let node = Strophe.getNodeFromJid(vcard.value.jabber_id);
    let domain = Strophe.getDomainFromJid(vcard.value.jabber_id);
    return `${node}@<span class="jid-domain-part" title="${xb.getString("click_to_filter_contacts_by_domain")}">${domain}</span>`;
});

const hasPersonalInfo = computed(() => {
    let v = vcard.value;
    return !!(v.fullname || v.first_name || v.middle_name || v.last_name);
});

const hasJobInfo = computed(() => {
    let v = vcard.value;
    return !!(v.role || v.job_title || (v.org && v.org.name) || (v.org && v.org.unit));
});

const hasPhone = computed(() => {
    let p = vcard.value.phone;
    return p && !!(p.work || p.home || p.mobile || p.default);
});

const hasEmail = computed(() => {
    let e = vcard.value.email;
    return e && !!(e.work || e.home || e.default);
});

const hasAddress = computed(() => {
    let addr = vcard.value.address;
    if (!addr) return false;
    for (let type in addr) {
        if (hasAddrFields(addr[type])) return true;
    }
    return false;
});

function hasAddrFields(addr) {
    if (!addr) return false;
    return !!(addr.pobox || addr.extadd || addr.street || addr.locality ||
              addr.region || addr.pcode || addr.country);
}

function getAddressLabel(type) {
    if (type === 'home') return xb.getString("vcard_type_home");
    if (type === 'work') return xb.getString("vcard_type_work");
    return xb.getString("vcard_address");
}

function updateVCard() {
    vcard.value = props.model.get('vcard') || {};
    nextTick(() => {
        if (urlValueEl.value && vcard.value.url) {
            xb.env.$(urlValueEl.value).hyperlinkify();
        }
    });
}

function updateConnected() {
    isConnected.value = props.model.isConnected ? props.model.isConnected() : true;
}

function refresh() {
    if (!refreshing.value) {
        refreshing.value = true;
        props.model.getVCard(() => {
            refreshing.value = false;
        });
    }
}

function onClickIcon(ev) {
    let $target_info = xb.env.$(ev.target).closest('.info-wrap'),
        $target_value = $target_info.find('.value'), copied_text = "";
    $target_value.each((idx, item) => {
        let value_text = xb.env.$(item).text();
        if (value_text && copied_text !== "") copied_text += '\n';
        if (value_text) copied_text += value_text;
        if (copied_text) utils.copyTextToClipboard(copied_text, xb.getString("toast__copied_in_clipboard"), xb.getString("toast__not_copied_in_clipboard"));
    });
}

function setBackboneView(view) {
    backboneView = view;
}

function showEditView() {
    if (backboneView && backboneView.showEditView) {
        // Pass the .vcard container from the parent backbone view
        let $vcard = backboneView.parent && backboneView.parent.$('.vcard');
        backboneView.showEditView($vcard || backboneView.$el);
    }
}

function render() {
    refreshing.value = false;
    props.model.getVCard(() => {
        updateVCard();
    });
}

function updateScrollBar() {
    // Called by parent after vcard update - noop in Vue, parent handles scroll
}

onMounted(() => {
    updateVCard();
    props.model.on('change:vcard_updated', updateVCard);
    props.model.on('change:vcard', updateVCard);
    props.model.on('activate deactivate', updateConnected);
});

onUnmounted(() => {
    props.model.off('change:vcard_updated', updateVCard);
    props.model.off('change:vcard', updateVCard);
    props.model.off('activate deactivate', updateConnected);
});

defineExpose({ render, refresh, updateScrollBar, showEditView, setBackboneView });
</script>
