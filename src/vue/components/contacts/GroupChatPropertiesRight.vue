<template>
    <div class="vue-migrated">
        <div class="block-header">
            <span class="block-name">{{ headerTitle }}</span>
            <span class="btn-edit-settings">{{ xb.getString("group_settings__properties__button_edit") }}</span>
        </div>
        <div class="group-chat-properties vcard-wrap" :title="copyTooltip">
            <div class="info-wrap jid-info-wrap">
                <div class="details-icon-wrap">
                    <SvgIcon name="id-outline" class="details-icon" />
                </div>
                <div class="info-hover">
                    <div class="info jabber-id">
                        <div class="value one-line" v-html="jidHtml"></div>
                        <div class="label">{{ xb.getString("group_settings__properties__label_jid") }}</div>
                    </div>
                </div>
                <div class="btn-qr-code" title="">
                    <SvgIcon name="qrcode" />
                </div>
            </div>
            <div class="info-wrap description-info-wrap" :title="copyTooltip" v-show="info.description">
                <div class="details-icon-wrap">
                    <SvgIcon name="description-outline" class="details-icon" />
                </div>
                <div class="info-hover">
                    <div class="info description short">
                        <div class="value">{{ info.description }}</div>
                    </div>
                </div>
            </div>
        </div>
        <div class="full-vcard-wrap" v-show="!vcardHidden">
            <div class="full-vcard-content" ref="fullVcardContent">
                <div class="vcard-header block-header">
                    <div class="vcard-header-title" ref="vcardHeaderTitle">
                        <i class="details-icon btn-back mdi mdi-24px mdi-arrow-left" @click="hideVCard"></i>
                        <span class="block-name">{{ xb.getString("contact_vcard_header_title") }}</span>
                    </div>
                    <div class="main-info">
                        <div class="avatar-wrap">
                            <div class="circle-avatar"></div>
                        </div>
                        <div class="text-info">
                            <div class="name-wrap" :class="{ 'name-is-custom': nameIsCustom }">{{ contactName }}</div>
                        </div>
                    </div>
                </div>
                <div class="vcard-list">
                    <div class="info-wrap jid-info-wrap" @click="onClickIcon($event)">
                        <div class="details-icon-wrap">
                            <SvgIcon name="id-outline" class="details-icon" />
                        </div>
                        <div class="info-hover">
                            <div class="info jabber-id">
                                <div class="value one-line" v-html="jidHtml"></div>
                                <div class="label">{{ xb.getString("group_settings__properties__label_jid") }}</div>
                            </div>
                        </div>
                    </div>
                    <div class="info-wrap name-info-wrap" v-show="info.name" @click="onClickIcon($event)">
                        <i :title="copyTooltip" class="details-icon mdi mdi-24px mdi-account-box-outline"></i>
                        <div class="info-hover">
                            <div class="info name">
                                <div class="value one-line">{{ info.name }}</div>
                                <div class="label">{{ xb.getString("groupchat_name") }}</div>
                            </div>
                        </div>
                    </div>
                    <div class="info-wrap description-info-wrap" v-show="info.description" @click="onClickIcon($event)">
                        <div class="details-icon-wrap">
                            <SvgIcon name="description-outline" class="details-icon" />
                        </div>
                        <div class="info-hover">
                            <div class="info description">
                                <div class="value">{{ info.description }}</div>
                                <div class="label">{{ xb.getString("groupchat_description") }}</div>
                            </div>
                        </div>
                    </div>
                    <div class="info-wrap searchable-info-wrap" v-show="info.searchable" @click="onClickIcon($event)">
                        <svg class="details-icon toolbar-icon mdi mdi-24px" viewBox="0 0 24 24">
                            <path :title="copyTooltip" d="M15.5,12C18,12 20,14 20,16.5C20,17.38 19.75,18.21 19.31,18.9L22.39,22L21,23.39L17.88,20.32C17.19,20.75 16.37,21 15.5,21C13,21 11,19 11,16.5C11,14 13,12 15.5,12M15.5,14A2.5,2.5 0 0,0 13,16.5A2.5,2.5 0 0,0 15.5,19A2.5,2.5 0 0,0 18,16.5A2.5,2.5 0 0,0 15.5,14M19.35,8.03C21.95,8.22 24,10.36 24,13C24,14.64 23.21,16.1 22,17V16.5A6.5,6.5 0 0,0 15.5,10A6.5,6.5 0 0,0 9,16.5C9,17 9.06,17.5 9.17,18H6A6,6 0 0,1 0,12C0,8.9 2.34,6.36 5.35,6.03C6.6,3.64 9.11,2 12,2C15.64,2 18.67,4.59 19.35,8.03Z"></path>
                        </svg>
                        <div class="info-hover">
                            <div class="info searchable">
                                <div class="value one-line">{{ searchableText }}</div>
                                <div class="label">{{ xb.getString("group_settings__properties__label_indexed") }}</div>
                            </div>
                        </div>
                    </div>
                    <div class="info-wrap model-info-wrap" v-show="info.model" @click="onClickIcon($event)">
                        <i :title="copyTooltip" class="details-icon mdi mdi-24px mdi-lock"></i>
                        <div class="info-hover">
                            <div class="info model">
                                <div class="value one-line">{{ prettyModel }}</div>
                                <div class="label">{{ xb.getString("groupchat_membership") }}</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, shallowRef, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useXabber } from '../../composables/useXabber.js';
import SvgIcon from '../SvgIcon.vue';

const props = defineProps({
    model: { type: Object, required: true }
});

const xb = useXabber();
const utils = xb.env.utils;
const Strophe = xb.env.Strophe;
const $ = xb.env.$;
const _ = xb.env._;

let backboneView = null;

const vcardHidden = ref(true);
const info = shallowRef(props.model.get('group_info') || {});
const contactName = ref(props.model.get('name') || '');
const rosterName = ref(props.model.get('roster_name') || '');

const fullVcardContent = ref(null);
const vcardHeaderTitle = ref(null);

const copyTooltip = computed(() => xb.getString("group_settings__properties__tooltip_copy_by_click"));

const headerTitle = computed(() => {
    return props.model.get('incognito_group')
        ? xb.getString("incognito_group_settings__header")
        : xb.getString("public_group_settings__header");
});

const nameIsCustom = computed(() => contactName.value !== rosterName.value);

const jidDomainTitle = computed(() => {
    if (props.model.get('private_chat')) {
        return xb.getString("click_to_filter_private_chats_by_domain");
    } else if (props.model.get('incognito_chat')) {
        return xb.getString("click_to_filter_incognito_groupchats_by_domain");
    }
    return xb.getString("click_to_filter_public_groupchats_by_domain");
});

const jidHtml = computed(() => {
    let jid = (info.value && info.value.jid) || props.model.get('jid');
    if (!jid) return '';
    let node = Strophe.getNodeFromJid(jid) || Strophe.getNodeFromJid(props.model.get('jid'));
    let domain = Strophe.getDomainFromJid(jid) || Strophe.getDomainFromJid(props.model.get('jid'));
    return `${node}@<span class="jid-domain-part" title="${jidDomainTitle.value}">${domain}</span>`;
});

const searchableText = computed(() => {
    if (!info.value.searchable) return '';
    return info.value.searchable === 'none'
        ? xb.getString("groupchat_index_type_none")
        : utils.pretty_name(info.value.searchable);
});

const prettyModel = computed(() => {
    return info.value.model ? utils.pretty_name(info.value.model) : '';
});

function setBackboneView(view) {
    backboneView = view;
}

function update() {
    info.value = props.model.get('group_info') || {};
    contactName.value = props.model.get('name') || '';
    rosterName.value = props.model.get('roster_name') || '';
}

function render() {
    if (!props.model.get('vcard_updated')) {
        props.model.vcard && props.model.vcard.refresh();
    }
    props.model.updateName();
    props.model.updateAvatar();
    props.model.getVCard(() => {
        update();
        if (backboneView && backboneView.parent && backboneView.parent.contact_edit_view) {
            backboneView.parent.contact_edit_view.update();
        }
    });
}

function showVCard() {
    vcardHidden.value = false;
    props.model.set('vcard_hidden', false);
    props.model.getVCard(() => {
        update();
    });
    if (backboneView && backboneView.parent) {
        backboneView.parent.$('.buttons-wrap.fixed-scroll:not(.participant-item-buttons-wrap)').addClass('hidden2');
        backboneView.parent.scrollToTop();
        if (backboneView.parent.ps_container && backboneView.parent.ps_container.length) {
            backboneView.parent.ps_container.perfectScrollbar('destroy');
        }
    }
    nextTick(() => {
        if (fullVcardContent.value) {
            let $container = $(fullVcardContent.value);
            $container.perfectScrollbar(_.extend({}, xb.ps_settings));
            $container.on("ps-scroll-up ps-scroll-down", onScroll);
        }
        if (backboneView) {
            $(backboneView.$el).find('.vcard-header').css({
                width: xb.right_contact_panel.$el.find('.panel-content-wrap').width()
            });
        }
    });
}

function hideVCard() {
    vcardHidden.value = true;
    props.model.set('vcard_hidden', true);
    if (backboneView && backboneView.parent) {
        if (backboneView.parent.ps_container && backboneView.parent.ps_container.length) {
            backboneView.parent.ps_container.perfectScrollbar(
                _.extend(backboneView.parent.ps_settings || {}, xb.ps_settings)
            );
        }
        backboneView.parent.onScroll();
    }
    scrollToTop();
    onScroll();
}

function scrollToTop() {
    if (fullVcardContent.value) {
        fullVcardContent.value.scrollTop = 0;
    }
}

function onScroll() {
    if (!fullVcardContent.value || !vcardHeaderTitle.value) return;
    let scrollTop = fullVcardContent.value.scrollTop;
    if (scrollTop >= 170) {
        vcardHeaderTitle.value.classList.add('fixed-scroll');
        vcardHeaderTitle.value.setAttribute('style', 'background-color: rgba(255,255,255,1) !important; -webkit-transition: none; -ms-transition: none;transition: none;');
    } else if (scrollTop >= 40) {
        vcardHeaderTitle.value.classList.remove('fixed-scroll');
        vcardHeaderTitle.value.setAttribute('style', 'background-color: rgba(255,255,255,0.5) !important;');
    } else {
        vcardHeaderTitle.value.classList.remove('fixed-scroll');
        vcardHeaderTitle.value.setAttribute('style', 'background-color: rgba(255,255,255,0) !important;');
    }
}

function onClickIcon(ev) {
    if ($(ev.target).closest('.jid-domain-part').length) {
        let domain = $(ev.target).closest('.jid-domain-part').text();
        xb.toolbar_view.showGroupchats();
        if (props.model.get('private_chat')) {
            xb.groupchats_view.$('.groupchats-filter-item[data-filter="groupchats-private"]').click();
        } else if (props.model.get('incognito_chat')) {
            xb.groupchats_view.$('.groupchats-filter-item[data-filter="groupchats-incognito"]').click();
        } else {
            xb.groupchats_view.$('.groupchats-filter-item[data-filter="groupchats-public"]').click();
        }
        xb.groupchats_view.filterByDomain(null, domain);
        return;
    }
    let $target_info = $(ev.target).closest('.info-hover'),
        $target_value = $target_info.find('.value'), copied_text = "";
    $target_value.each((idx, item) => {
        let value_text = $(item).text();
        if (value_text && copied_text !== "") copied_text += '\n';
        if (value_text) copied_text += value_text;
        if (copied_text) utils.copyTextToClipboard(copied_text, xb.getString("toast__copied_in_clipboard"), xb.getString("toast__not_copied_in_clipboard"));
    });
}

onMounted(() => {
    props.model.set('vcard_hidden', true);
    props.model.on('group_info_updated', update);
    props.model.on('change:vcard_updated', update);
});

onUnmounted(() => {
    props.model.off('group_info_updated', update);
    props.model.off('change:vcard_updated', update);
});

defineExpose({ render, showVCard, hideVCard, scrollToTop, onScroll, setBackboneView, update });
</script>
