<template>
    <div class="vue-migrated">
        <div class="block-header">
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
            <!-- Compact view -->
            <div class="info-wrap jid-info-wrap" v-show="vcard.jabber_id" :title="copyTooltip" @click="onClickIcon($event)">
                <div class="details-icon-wrap"><SvgIcon name="id-outline" class="details-icon" /></div>
                <div class="info-hover">
                    <div class="info jabber-id" v-show="vcard.jabber_id">
                        <div class="value one-line" v-html="jabberIdHtml"></div>
                        <div class="label">{{ xb.getString("vcard_jabber_id") }}</div>
                    </div>
                </div>
                <div class="btn-qr-code" title="" @click.stop="showQRCode">
                    <SvgIcon name="qrcode" class="details-icon" />
                </div>
            </div>
            <div class="info-wrap nickname-info-wrap" v-show="vcard.nickname" :title="copyTooltip" @click="onClickIcon($event)">
                <div class="details-icon-wrap"><SvgIcon name="account-outline" class="details-icon" /></div>
                <div class="info-hover">
                    <div class="info nickname" v-show="vcard.nickname">
                        <div class="value one-line">{{ vcard.nickname }}</div>
                        <div class="label">{{ xb.getString("vcard_nick_name") }}</div>
                    </div>
                </div>
            </div>
            <div class="info-wrap personal-info-wrap" v-show="vcard.first_name || vcard.last_name" :title="copyTooltip" @click="onClickIcon($event)">
                <div class="details-icon-wrap"><SvgIcon name="fullname-outline" class="details-icon" /></div>
                <div class="info-hover">
                    <div class="info first-name" v-show="vcard.first_name">
                        <div class="value one-line">{{ vcard.first_name }}</div>
                        <div class="label">{{ xb.getString("vcard_given_name") }}</div>
                    </div>
                </div>
                <div class="info-hover">
                    <div class="info last-name" v-show="vcard.last_name">
                        <div class="value one-line">{{ vcard.last_name }}</div>
                        <div class="label">{{ xb.getString("vcard_family_name") }}</div>
                    </div>
                </div>
            </div>
            <div class="info-wrap birthday-info-wrap" v-show="vcard.birthday" :title="copyTooltip" @click="onClickIcon($event)">
                <div class="details-icon-wrap"><SvgIcon name="birthday-outline" class="details-icon" /></div>
                <div class="info-hover">
                    <div class="info birthday" v-show="vcard.birthday">
                        <div class="value one-line">{{ vcard.birthday }}</div>
                        <div class="label">{{ xb.getString("vcard_birth_date") }}</div>
                    </div>
                </div>
            </div>
            <div class="info-wrap site-info-wrap" v-show="vcard.url" :title="copyTooltip" @click="onClickIcon($event)">
                <i class="details-icon mdi mdi-24px mdi-web"></i>
                <div class="info-hover">
                    <div class="info url" v-show="vcard.url">
                        <div class="value one-line" ref="urlValueEl">{{ vcard.url }}</div>
                        <div class="label">{{ xb.getString("vcard_url") }}</div>
                    </div>
                </div>
            </div>
            <div class="info-wrap more" @click="showVCard">
                <div class="show-vcard">{{ xb.getString("contact_vcard_more") }}</div>
            </div>
        </div>

        <!-- Full vcard view -->
        <div class="full-vcard-wrap vue-in-progress" v-show="!vcardHidden">
            <div class="full-vcard-content" ref="fullVcardContent">
                <div class="vcard-header block-header">
                    <div class="vcard-header-title" ref="vcardHeaderTitle">
                        <i class="details-icon btn-back mdi mdi-24px mdi-arrow-left" @click="hideVCard"></i>
                        <span class="block-name">{{ xb.getString("contact_vcard_header_title") }}</span>
                    </div>
                    <div class="main-info">
                        <div class="avatar-wrap">
                            <div class="circle-avatar" ref="avatarEl"></div>
                        </div>
                        <div class="text-info">
                            <div class="name-wrap" :class="{ 'name-is-custom': nameIsCustom }">{{ contactName }}</div>
                        </div>
                    </div>
                </div>
                <div class="vcard-list">
                    <div class="info-wrap jid-info-wrap" v-show="vcard.jabber_id" :title="copyTooltip" @click="onClickIcon($event)">
                        <div class="details-icon-wrap"><SvgIcon name="id-outline" class="details-icon" /></div>
                        <div class="info-hover">
                            <div class="info jabber-id" v-show="vcard.jabber_id">
                                <div class="value one-line" v-html="jabberIdHtml"></div>
                                <div class="label">{{ xb.getString("vcard_jabber_id") }}</div>
                            </div>
                        </div>
                    </div>
                    <div class="info-wrap nickname-info-wrap" v-show="vcard.nickname" :title="copyTooltip" @click="onClickIcon($event)">
                        <div class="details-icon-wrap"><SvgIcon name="account-outline" class="details-icon" /></div>
                        <div class="info-hover">
                            <div class="info nickname" v-show="vcard.nickname">
                                <div class="value one-line">{{ vcard.nickname }}</div>
                                <div class="label">{{ xb.getString("vcard_nick_name") }}</div>
                            </div>
                        </div>
                    </div>
                    <div class="info-wrap personal-info-wrap" v-show="hasFullPersonalInfo" :title="copyTooltip" @click="onClickIcon($event)">
                        <div class="details-icon-wrap"><SvgIcon name="fullname-outline" class="details-icon" /></div>
                        <div class="info-hover" v-show="vcard.first_name">
                            <div class="info first-name">
                                <div class="value one-line">{{ vcard.first_name }}</div>
                                <div class="label">{{ xb.getString("vcard_given_name") }}</div>
                            </div>
                        </div>
                        <div class="info-hover" v-show="vcard.middle_name">
                            <div class="info middle-name">
                                <div class="value one-line">{{ vcard.middle_name }}</div>
                                <div class="label">{{ xb.getString("vcard_middle_name") }}</div>
                            </div>
                        </div>
                        <div class="info-hover" v-show="vcard.last_name">
                            <div class="info last-name">
                                <div class="value one-line">{{ vcard.last_name }}</div>
                                <div class="label">{{ xb.getString("vcard_family_name") }}</div>
                            </div>
                        </div>
                        <div class="info-hover" v-show="vcard.fullname">
                            <div class="info fullname">
                                <div class="value one-line">{{ vcard.fullname }}</div>
                                <div class="label">{{ xb.getString("vcard_full_name") }}</div>
                            </div>
                        </div>
                    </div>
                    <div class="info-wrap birthday-info-wrap" v-show="vcard.birthday" :title="copyTooltip" @click="onClickIcon($event)">
                        <div class="details-icon-wrap"><SvgIcon name="birthday-outline" class="details-icon" /></div>
                        <div class="info-hover">
                            <div class="info birthday" v-show="vcard.birthday">
                                <div class="value one-line">{{ vcard.birthday }}</div>
                                <div class="label">{{ xb.getString("vcard_birth_date") }}</div>
                            </div>
                        </div>
                    </div>
                    <div class="info-wrap job-info-wrap" v-show="hasJobInfo" :title="copyTooltip" @click="onClickIcon($event)">
                        <div class="details-icon-wrap"><SvgIcon name="job-outline" class="details-icon" /></div>
                        <div class="info-hover" v-show="vcard.org && vcard.org.name">
                            <div class="info org-name">
                                <div class="value one-line">{{ vcard.org?.name }}</div>
                                <div class="label">{{ xb.getString("vcard_organization") }}</div>
                            </div>
                        </div>
                        <div class="info-hover" v-show="vcard.job_title">
                            <div class="info job-title">
                                <div class="value one-line">{{ vcard.job_title }}</div>
                                <div class="label">{{ xb.getString("vcard_title") }}</div>
                            </div>
                        </div>
                        <div class="info-hover" v-show="vcard.org && vcard.org.unit">
                            <div class="info org-unit">
                                <div class="value one-line">{{ vcard.org?.unit }}</div>
                                <div class="label">{{ xb.getString("vcard_organization_unit") }}</div>
                            </div>
                        </div>
                        <div class="info-hover" v-show="vcard.role">
                            <div class="info role">
                                <div class="value one-line">{{ vcard.role }}</div>
                                <div class="label">{{ xb.getString("vcard_role") }}</div>
                            </div>
                        </div>
                    </div>
                    <div class="info-wrap site-info-wrap" v-show="vcard.url" :title="copyTooltip" @click="onClickIcon($event)">
                        <i class="details-icon mdi mdi-24px mdi-web"></i>
                        <div class="info-hover">
                            <div class="info url" v-show="vcard.url">
                                <div class="value one-line" ref="urlValueFullEl">{{ vcard.url }}</div>
                                <div class="label">{{ xb.getString("vcard_url") }}</div>
                            </div>
                        </div>
                    </div>
                    <div class="info-wrap description-info-wrap" v-show="vcard.description" :title="copyTooltip" @click="onClickIcon($event)">
                        <div class="details-icon-wrap"><SvgIcon name="description-outline" class="details-icon" /></div>
                        <div class="info-hover">
                            <div class="info description" v-show="vcard.description">
                                <div class="value">{{ vcard.description }}</div>
                                <div class="label">{{ xb.getString("vcard_decsription") }}</div>
                            </div>
                        </div>
                    </div>
                    <div class="info-wrap phone-info-wrap" v-show="hasPhone" :title="copyTooltip" @click="onClickIcon($event)">
                        <div class="details-icon-wrap"><SvgIcon name="call-outline" class="details-icon" /></div>
                        <div class="info-hover" v-show="vcard.phone?.work">
                            <div class="info phone-work">
                                <div class="value one-line">{{ vcard.phone?.work }}</div>
                                <div class="label">{{ xb.getString("vcard_type_work") }}</div>
                            </div>
                        </div>
                        <div class="info-hover" v-show="vcard.phone?.home">
                            <div class="info phone-home">
                                <div class="value one-line">{{ vcard.phone?.home }}</div>
                                <div class="label">{{ xb.getString("vcard_type_home") }}</div>
                            </div>
                        </div>
                        <div class="info-hover" v-show="vcard.phone?.mobile">
                            <div class="info phone-mobile">
                                <div class="value one-line">{{ vcard.phone?.mobile }}</div>
                                <div class="label">{{ xb.getString("vcard_type_mobile") }}</div>
                            </div>
                        </div>
                        <div class="info-hover" v-show="vcard.phone?.default">
                            <div class="info phone-default">
                                <div class="value one-line">{{ vcard.phone?.default }}</div>
                                <div class="label">{{ xb.getString("vcard_telephone") }}</div>
                            </div>
                        </div>
                    </div>
                    <div class="info-wrap email-info-wrap" v-show="hasEmail" :title="copyTooltip" @click="onClickIcon($event)">
                        <div class="details-icon-wrap"><SvgIcon name="email-outline" class="details-icon" /></div>
                        <div class="info-hover" v-show="vcard.email?.work">
                            <div class="info email-work">
                                <div class="value one-line">{{ vcard.email?.work }}</div>
                                <div class="label">{{ xb.getString("vcard_type_work") }}</div>
                            </div>
                        </div>
                        <div class="info-hover" v-show="vcard.email?.home">
                            <div class="info email-home">
                                <div class="value one-line">{{ vcard.email?.home }}</div>
                                <div class="label">{{ xb.getString("vcard_type_personal") }}</div>
                            </div>
                        </div>
                        <div class="info-hover" v-show="vcard.email?.default">
                            <div class="info email-default">
                                <div class="value one-line">{{ vcard.email?.default }}</div>
                                <div class="label">{{ xb.getString("vcard_email") }}</div>
                            </div>
                        </div>
                    </div>
                    <div class="info-wrap address-info-wrap" v-show="hasAddress" :title="copyTooltip" @click="onClickIcon($event)">
                        <div class="details-icon-wrap"><SvgIcon name="job-outline" class="details-icon" /></div>
                        <template v-for="(addr, type) in vcard.address" :key="type">
                            <div class="info-hover" v-show="hasAddrFields(addr)">
                                <div :class="'info address-' + type">
                                    <div class="pobox value one-line" v-show="addr.pobox">{{ addr.pobox }}</div>
                                    <div class="extadd value one-line" v-show="addr.extadd">{{ addr.extadd }}</div>
                                    <div class="street value one-line" v-show="addr.street">{{ addr.street }}</div>
                                    <div class="locality value one-line" v-show="addr.locality">{{ addr.locality }}</div>
                                    <div class="region value one-line" v-show="addr.region">{{ addr.region }}</div>
                                    <div class="pcode value one-line" v-show="addr.pcode">{{ addr.pcode }}</div>
                                    <div class="country value one-line" v-show="addr.country">{{ addr.country }}</div>
                                    <div class="label">{{ getAddressLabel(type) }}</div>
                                </div>
                            </div>
                        </template>
                    </div>
                    <div class="resources-block-wrap hidden">
                        <div class="resources-wrap"></div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useXabber } from '../../composables/useXabber.js';
import SvgIcon from '../SvgIcon.vue';

const props = defineProps({
    model: { type: Object, required: true }
});

const xb = useXabber();
const utils = xb.env.utils;
const Strophe = xb.env.Strophe;
const $ = xb.env.$;

const vcard = ref(props.model.get('vcard') || {});
const refreshing = ref(false);
const vcardHidden = ref(true);
const urlValueEl = ref(null);
const urlValueFullEl = ref(null);
const fullVcardContent = ref(null);
const vcardHeaderTitle = ref(null);
const avatarEl = ref(null);

const copyTooltip = computed(() => xb.getString("group_settings__properties__tooltip_copy_by_click"));

const contactName = computed(() => props.model.get('name') || '');
const nameIsCustom = computed(() => props.model.get('name') !== props.model.get('roster_name'));

const jabberIdHtml = computed(() => {
    if (!vcard.value.jabber_id) return '';
    let node = Strophe.getNodeFromJid(vcard.value.jabber_id);
    let domain = Strophe.getDomainFromJid(vcard.value.jabber_id);
    return `${node}@<span class="jid-domain-part" title="${xb.getString("click_to_filter_contacts_by_domain")}">${domain}</span>`;
});

const hasFullPersonalInfo = computed(() => {
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
            $(urlValueEl.value).hyperlinkify();
        }
        if (urlValueFullEl.value && vcard.value.url) {
            $(urlValueFullEl.value).hyperlinkify();
        }
    });
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
    if ($(ev.target).closest('.jid-domain-part').length) {
        let domain = $(ev.target).closest('.jid-domain-part').text();
        xb.toolbar_view.showContacts();
        xb.contacts_view.filterByDomain(null, domain);
        return;
    }
    let $target_info = $(ev.target),
        $target_value = $target_info.find('.value'), copied_text = "";
    $target_value.each((idx, item) => {
        let value_text = $(item).text();
        if (value_text && copied_text !== "") copied_text += '\n';
        if (value_text) copied_text += value_text;
        if (copied_text) utils.copyTextToClipboard(copied_text, xb.getString("toast__copied_in_clipboard"), xb.getString("toast__not_copied_in_clipboard"));
    });
}

function showQRCode() {
    // Delegate to backbone view if available
    if (backboneView) {
        backboneView.showQRCode && backboneView.showQRCode();
    }
}

function onScroll() {
    if (!fullVcardContent.value || !vcardHeaderTitle.value) return;
    let scrollTop = fullVcardContent.value.scrollTop;
    if (scrollTop >= 170) {
        vcardHeaderTitle.value.classList.add('fixed-scroll');
        vcardHeaderTitle.value.style.cssText = 'background-color: rgba(255,255,255,1) !important; -webkit-transition: none; -ms-transition: none; transition: none;';
    } else if (scrollTop >= 40) {
        vcardHeaderTitle.value.classList.remove('fixed-scroll');
        vcardHeaderTitle.value.style.cssText = 'background-color: rgba(255,255,255,0.5) !important;';
    } else {
        vcardHeaderTitle.value.classList.remove('fixed-scroll');
        vcardHeaderTitle.value.style.cssText = 'background-color: rgba(255,255,255,0) !important;';
    }
}

let backboneView = null;

function setBackboneView(view) {
    backboneView = view;
}

function showVCard() {
    vcardHidden.value = false;
    props.model.set('vcard_hidden', false);
    props.model.getVCard(() => {
        updateVCard();
    });
    if (backboneView && backboneView.parent) {
        backboneView.parent.$('.buttons-wrap.fixed-scroll').addClass('hidden2');
        backboneView.parent.scrollToTop();
        if (backboneView.parent.ps_container && backboneView.parent.ps_container.length) {
            backboneView.parent.ps_container.perfectScrollbar('destroy');
        }
    }
    nextTick(() => {
        if (fullVcardContent.value) {
            $(fullVcardContent.value).perfectScrollbar(xb.ps_settings || {});
            $(fullVcardContent.value).on("ps-scroll-up ps-scroll-down", onScroll);
        }
        if (xb.right_contact_panel) {
            let width = xb.right_contact_panel.$el.find('.panel-content-wrap').width();
            if (vcardHeaderTitle.value) {
                $(vcardHeaderTitle.value).closest('.vcard-header').css({ width: width });
            }
        }
    });
}

function hideVCard() {
    vcardHidden.value = true;
    props.model.set('vcard_hidden', true);
    if (backboneView && backboneView.parent) {
        if (backboneView.parent.ps_container && backboneView.parent.ps_container.length) {
            backboneView.parent.ps_container.perfectScrollbar(
                Object.assign(backboneView.parent.ps_settings || {}, xb.ps_settings)
            );
        }
    }
    scrollToTop();
    onScroll();
    if (backboneView && backboneView.parent) {
        backboneView.parent.onScroll && backboneView.parent.onScroll();
    }
}

function scrollToTop() {
    if (fullVcardContent.value) {
        fullVcardContent.value.scrollTop = 0;
    }
}

function render() {
    refreshing.value = false;
    vcardHidden.value = true;
    props.model.set('vcard_hidden', true);
    updateVCard();
    props.model.updateName && props.model.updateName();
    props.model.getVCard(() => {
        updateVCard();
    });
}

onMounted(() => {
    updateVCard();
    props.model.on('change:vcard_updated', updateVCard);
    props.model.on('change:vcard', updateVCard);

    nextTick(() => {
        if (fullVcardContent.value) {
            $(fullVcardContent.value).perfectScrollbar(xb.ps_settings || {});
            $(fullVcardContent.value).on("ps-scroll-up ps-scroll-down", onScroll);
        }
    });
});

onUnmounted(() => {
    props.model.off('change:vcard_updated', updateVCard);
    props.model.off('change:vcard', updateVCard);
});

defineExpose({ render, refresh, showVCard, hideVCard, setBackboneView, scrollToTop, onScroll });
</script>
