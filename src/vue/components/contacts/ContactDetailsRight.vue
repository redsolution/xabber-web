<template>
    <div class="panel-background-clickable" @click="closeDetails"></div>
    <div class="panel-content-wrap noselect vue-migrated">
        <div class="header-buttons">
            <div class="btn-escape" :class="{ 'btn-top': scrollState.isTop, 'hidden': scrollState.isHidden }" @click="onEscapeClick">
                <i class="mdi mdi-24px" :class="scrollState.isTop ? 'mdi-arrow-right' : 'mdi-close'"></i>
                <span class="btn-text">{{ xb.getString("button_esc") }}</span>
            </div>
            <span class="block-name" :class="{ 'fade-out': scrollState.titleFaded }">{{ xb.getString("contact_viewer") }}</span>
            <span class="block-name second-text" :class="{ 'fade-out': scrollState.secondTextFaded }">{{ secondText }}</span>
            <div v-if="!encrypted" class="btn-search-messages btn-search" v-show="!scrollState.searchHidden" @click="showSearchMessages">
                <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('search')"></svg>
            </div>
        </div>
        <div class="main-info">
            <div class="avatar-wrap">
                <div class="circle-avatar"></div>
            </div>
            <div class="text-info">
                <div class="name-wrap contact-details-name-wrap one-line" :class="{ 'name-is-custom': nameIsCustom }">{{ contactName }}</div>
            </div>
        </div>
        <div class="buttons-wrap sticky-details-wrap" v-show="!scrollState.buttonsHidden">
            <div class="button-wrap btn-chat-wrap" :class="{ 'non-active': isBlocked }">
                <i class="mdi text-color-500 mdi-24px mdi-message-text btn-chat" @click="openChat"></i>
                <div class="btn-name">{{ encrypted ? xb.getString("omemo__chat_settings__button_open_encrypted_chat") : xb.getString("chat_viewer") }}</div>
            </div>
            <div class="button-wrap btn-voice-call-wrap" :class="{ 'non-active': isBlocked || !audioEnabled }">
                <div class="contact-btn btn-voice-call fill-color-500" @click="voiceCall"><svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('call')"></svg></div>
                <div class="btn-name">{{ xb.getString("contact_bar_call") }}</div>
            </div>
            <div class="button-wrap btn-notifications-wrap" :class="{ 'non-active': isBlocked }">
                <div class="contact-btn btn-notifications fill-color-500 dropdown-button"
                     :class="{ 'muted': isMuted, 'active': isMuted }"
                     :data-activates="uid + '-mute-more'"
                     @click="onNotificationsClick">
                    <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('bell')"></svg>
                    <svg class="mdi mdi-24px mdi-svg-template details-muted-icon" v-html="svgContent('bell-off')"></svg>
                </div>
                <div class="btn-name">{{ xb.getString("settings__menu_item__sounds") }}</div>
            </div>
            <ul :id="uid + '-mute-more'" class="contact-mute-dropdown unified-dropdown-style dropdown-content noselect" v-show="!isBlocked">
                <li v-show="!isMuted" class="unified-dropdown-style-item btn-mute-dropdown" data-mute="minutes15" @click="muteChat">
                    <span class="one-line">{{ xb.getString("mute_15_min") }}</span>
                </li>
                <li v-show="!isMuted" class="unified-dropdown-style-item btn-mute-dropdown" data-mute="hours1" @click="muteChat">
                    <span class="one-line">{{ xb.getString("mute_1_hour") }}</span>
                </li>
                <li v-show="!isMuted" class="unified-dropdown-style-item btn-mute-dropdown" data-mute="hours2" @click="muteChat">
                    <span class="one-line">{{ xb.getString("mute_2_hours") }}</span>
                </li>
                <li v-show="!isMuted" class="unified-dropdown-style-item btn-mute-dropdown" data-mute="day" @click="muteChat">
                    <span class="one-line">{{ xb.getString("mute_1_day") }}</span>
                </li>
                <li v-show="!isMuted" class="unified-dropdown-style-item btn-mute-dropdown" data-mute="forever" @click="muteChat">
                    <span class="one-line">{{ xb.getString("mute_forever") }}</span>
                </li>
            </ul>
            <div class="button-wrap btn-mute-wrap" :class="{ 'non-active': isBlocked }">
                <i class="mdi mdi-24px btn-mute mdi-dots-vertical dropdown-button text-color-500" :data-activates="uid + '-more'"></i>
                <div class="btn-name">{{ xb.getString("chat_more_actions") }}</div>
            </div>
            <ul :id="uid + '-more'" class="unified-dropdown-style dropdown-content noselect">
                <li v-if="!encrypted" class="unified-dropdown-style-item btn-edit" @click="showEdit">
                    <span class="one-line">{{ xb.getString("edit_contact") }}</span>
                </li>
                <li v-if="hasOmemo && !encrypted && !hasEncryptedChat" class="unified-dropdown-style-item btn-start-encryption" @click="startEncryptedChat">
                    <span class="one-line">{{ xb.getString("omemo__chat_settings__button_start_encrypted_chat") }}</span>
                </li>
                <li v-if="hasOmemo && !encrypted && hasEncryptedChat" class="unified-dropdown-style-item btn-open-encrypted-chat" @click="openEncryptedChat">
                    <span class="one-line">{{ xb.getString("omemo__chat_settings__button_open_encrypted_chat") }}</span>
                </li>
                <li v-if="encrypted" class="unified-dropdown-style-item btn-open-regular-chat" @click="openRegularChat">
                    <span class="one-line">{{ xb.getString("omemo__chat_settings__button_open_regular_chat") }}</span>
                </li>
                <li class="unified-dropdown-style-item" :class="isBlocked ? 'btn-unblock' : 'btn-block'" @click="isBlocked ? unblockContact() : blockContact()">
                    <span class="one-line">{{ isBlocked ? xb.getString("contact_bar_unblock") : xb.getString("contact_bar_block") }}</span>
                </li>
            </ul>
        </div>
        <div class="panel-content private-chat">
            <div class="block-wrap vcard"></div>
            <div class="block-wrap groups-block-wrap"></div>
            <div class="block-wrap edit-block-wrap"></div>
            <div class="block-wrap search-messages-block-wrap"></div>
            <div class="block-wrap qr-code-wrap">
                <div class="qr-code-content-wrap hidden">
                    <div class="block-header">
                        <i class="details-icon btn-back-qr mdi mdi-24px mdi-arrow-left" @click="hideQRCode"></i>
                        <span class="block-name">{{ xb.getString("dialog_show_qr_code__header") }}</span>
                    </div>
                    <div class="qr-code-content">
                        <div class="qr-code-canvas"></div>
                        <div class="qr-code-text">
                            <div class="qr-code-name"></div>
                            <div class="qr-code-jid"></div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <ul class="tabs bottom-block-tabs">
            <li data-value="image" class="list-variant tab" @click="changeList"><a class="text-color-700">{{ xb.getString("images") }}</a></li>
            <li data-value="video" class="list-variant tab" @click="changeList"><a class="text-color-700">{{ xb.getString("videos") }}</a></li>
            <li data-value="files" class="list-variant tab" @click="changeList"><a class="text-color-700">{{ xb.getString("files") }}</a></li>
            <li data-value="voice" class="list-variant tab" @click="changeList"><a class="text-color-700">{{ xb.getString("vcard_type_voice") }}</a></li>
        </ul>
        <div class="panel-content private-chat">
            <div class="bottom-block">
                <div class="block-wrap participants-wrap"></div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useXabber } from '../../composables/useXabber.js';

const props = defineProps({
    model: { type: Object, default: null },
    saved: { type: Boolean, default: false },
    encrypted: { type: Boolean, default: false }
});

const xb = useXabber();
const $ = xb.env.$;
const _ = xb.env._;

let backboneView = null;
const uid = 'cd-' + Math.random().toString(36).substr(2, 9);

// Reactive state
const contactName = ref('');
const nameIsCustom = ref(false);
const isMuted = ref(false);
const isBlocked = ref(false);
const inRoster = ref(false);
const audioEnabled = ref(false);
const hasOmemo = ref(false);
const hasEncryptedChat = ref(false);
const secondText = ref('');

const scrollState = ref({
    isTop: false,
    isHidden: true,
    titleFaded: true,
    secondTextFaded: true,
    buttonsHidden: false,
    searchHidden: false,
});

// SVG helper
function svgContent(name) {
    let tmpl = xb.env.templates.svg[name];
    return tmpl ? tmpl() : '';
}

// Event delegates to Backbone view
function openChat() { backboneView?.openChat(); }
function closeDetails() { backboneView?.closeDetails(); }
function showEdit() { backboneView?.showEdit(); }
function voiceCall(ev) { backboneView?.voiceCall(ev); }
function showSearchMessages(ev) { backboneView?.showSearchMessages(ev); }
function addContact() { backboneView?.addContact(); }
function deleteContact() { backboneView?.deleteContact(); }
function blockContact() { backboneView?.blockContact(); }
function unblockContact() { backboneView?.unblockContact(); }
function muteChat(ev) { backboneView?.muteChat(ev); }
function startEncryptedChat(ev) { backboneView?.startEncryptedChat(ev); }
function openEncryptedChat(ev) { backboneView?.openEncryptedChat(ev); }
function openRegularChat(ev) { backboneView?.openRegularChat(ev); }
function requestAuthorization() { backboneView?.requestAuthorization(); }
function changeList(ev) { backboneView?.changeList(ev); }
function showQRCode() { backboneView?.showQRCode(); }
function hideQRCode() { backboneView?.hideQRCode(); }

function onEscapeClick() {
    if (scrollState.value.isTop) {
        backboneView?.scrollToTopSmooth();
    } else {
        openChat();
    }
}

function onNotificationsClick() {
    if (isMuted.value) {
        backboneView?.unmuteChat();
    }
}

// Methods called from Backbone view
function updateName() {
    if (!props.model) return;
    contactName.value = props.model.get('name') || '';
    nameIsCustom.value = !!(props.model.get('roster_name') && props.model.get('name') !== props.model.get('roster_name'));
}

function updateNotifications() {
    if (!backboneView?.chat) return;
    isMuted.value = backboneView.chat.isMuted();
}

function updateButtons() {
    if (!props.model) return;
    inRoster.value = !!props.model.get('in_roster');
    isBlocked.value = !!props.model.get('blocked');
    audioEnabled.value = !!xb.get('audio');
    if (backboneView?.account) {
        hasOmemo.value = !!backboneView.account.omemo;
        hasEncryptedChat.value = !!backboneView.account.chats.get(`${props.model.hash_id}:encrypted`);
    }
}

function updateScrollState(state) {
    scrollState.value = { ...scrollState.value, ...state };
}

function updateSecondText(text) {
    secondText.value = text;
}

function setBackboneView(view) {
    backboneView = view;
}

defineExpose({
    setBackboneView,
    updateName,
    updateNotifications,
    updateButtons,
    updateScrollState,
    updateSecondText,
    uid,
});
</script>
