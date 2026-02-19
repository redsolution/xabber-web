<template>
    <div class="panel-background-clickable" @click="closeDetails"></div>
    <div class="panel-content-wrap noselect vue-migrated">
        <div class="header-buttons">
            <div class="btn-escape" :class="{ 'btn-top': scrollState.isTop, 'hidden': scrollState.isHidden }" @click="onEscapeClick">
                <i class="mdi mdi-24px" :class="scrollState.isTop ? 'mdi-arrow-right' : 'mdi-close'"></i>
                <span class="btn-text">{{ xb.getString("button_esc") }}</span>
            </div>
            <span class="block-name" :class="{ 'fade-out': scrollState.titleFaded }">{{ xb.getString("groupchat_group") }}</span>
            <span class="block-name second-text" :class="{ 'fade-out': scrollState.secondTextFaded }">{{ secondText }}</span>
            <div class="btn-search-messages btn-search" :class="{ 'moved-btn-search': !canEditProperties }" v-show="!scrollState.searchHidden" @click="showSearchMessages">
                <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('search')"></svg>
            </div>
            <div class="btn-edit-group-properties" :class="{ 'hidden2': !canEditProperties }" v-show="!scrollState.editPropertiesHidden" @click="showEdit">
                <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('tune')"></svg>
            </div>
            <div class="group-edit-preloader"></div>
        </div>
        <div class="main-info">
            <div class="avatar-wrap">
                <div class="circle-avatar">
                    <div class="preloader-wrap">
                        <div class="preloader-wrapper preloader-32px visible">
                            <div class="spinner-layer">
                                <div class="circle-clipper left"><div class="circle"></div></div>
                                <div class="gap-patch"><div class="circle"></div></div>
                                <div class="circle-clipper right"><div class="circle"></div></div>
                            </div>
                        </div>
                    </div>
                    <input type="file" @change="changeAvatar" />
                </div>
            </div>
            <div class="text-info">
                <div class="name-wrap"></div>
            </div>
        </div>
        <div class="buttons-wrap sticky-details-wrap" v-show="!scrollState.buttonsHidden">
            <div class="button-wrap btn-chat-wrap" @click="openChat">
                <i class="mdi text-color-500 mdi-24px mdi-message-text btn-chat"></i>
                <div class="btn-name">{{ xb.getString("chat_viewer") }}</div>
            </div>
            <div class="button-wrap btn-invite-wrap" :class="{ 'non-active': !canInvite }" @click="inviteUser">
                <i class="mdi mdi-24px mdi-account-multiple-plus btn-invite text-color-500"></i>
                <div class="btn-name">{{ xb.getString("groupchat_bar_invite") }}</div>
            </div>
            <div class="button-wrap btn-notifications-wrap">
                <div class="contact-btn btn-notifications fill-color-500 dropdown-button"
                     :class="{ 'muted': isMuted, 'active': isMuted }"
                     :data-activates="uid + '-mute-more'"
                     @click="onNotificationsClick">
                    <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('bell')"></svg>
                    <svg class="mdi mdi-24px mdi-svg-template details-muted-icon" v-html="svgContent('bell-off')"></svg>
                </div>
                <div class="btn-name">{{ xb.getString("settings__menu_item__sounds") }}</div>
            </div>
            <ul :id="uid + '-mute-more'" class="contact-mute-dropdown unified-dropdown-style dropdown-content noselect">
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
            <div class="button-wrap btn-mute-wrap btn-leave" @click="leaveGroupChat">
                <div class="contact-btn fill-color-red-500">
                    <svg class="mdi mdi-24px">
                        <svg viewBox="0 0 24 24">
                            <path d="M13.34,8.17C12.41,8.17 11.65,7.4 11.65,6.47A1.69,1.69 0 0,1 13.34,4.78C14.28,4.78 15.04,5.54 15.04,6.47C15.04,7.4 14.28,8.17 13.34,8.17M10.3,19.93L4.37,18.75L4.71,17.05L8.86,17.9L10.21,11.04L8.69,11.64V14.5H7V10.54L11.4,8.67L12.07,8.59C12.67,8.59 13.17,8.93 13.5,9.44L14.36,10.79C15.04,12 16.39,12.82 18,12.82V14.5C16.14,14.5 14.44,13.67 13.34,12.4L12.84,14.94L14.61,16.63V23H12.92V17.9L11.14,16.21L10.3,19.93M21,23H19V3H6V16.11L4,15.69V1H21V23M6,23H4V19.78L6,20.2V23Z" />
                        </svg>
                    </svg>
                </div>
                <div class="btn-name text-color-red-700">{{ xb.getString("groupchat_bar_leave") }}</div>
            </div>
        </div>
        <div class="panel-content">
            <div class="block-wrap group-chat-properties-wrap vcard"></div>
            <div class="block-wrap status-block-wrap"></div>
            <div class="block-wrap edit-block-wrap"></div>
            <div class="block-wrap restrictions-block-wrap"></div>
            <div class="block-wrap newbie-permissions-block-wrap"></div>
            <div class="block-wrap groups-block-wrap"></div>
            <div class="block-wrap search-messages-block-wrap"></div>
            <div class="block-wrap participant-view-wrap"></div>
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
        <ul class="tabs not-edit bottom-block-tabs">
            <li data-value="participants" class="list-variant tab" @click="changeList"><a class="text-color-700">{{ xb.getString("group_settings__members_list__header") }}</a></li>
            <li data-value="image" class="list-variant tab" @click="changeList"><a class="text-color-700">{{ xb.getString("images") }}</a></li>
            <li data-value="video" class="list-variant tab" @click="changeList"><a class="text-color-700">{{ xb.getString("videos") }}</a></li>
            <li data-value="files" class="list-variant tab" @click="changeList"><a class="text-color-700">{{ xb.getString("files") }}</a></li>
            <li data-value="voice" class="list-variant tab" @click="changeList"><a class="text-color-700">{{ xb.getString("vcard_type_voice") }}</a></li>
        </ul>
        <div class="panel-content">
            <div class="bottom-block">
                <div class="block-wrap participants-wrap"></div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import { useXabber } from '../../composables/useXabber.js';

const props = defineProps({
    model: { type: Object, required: true }
});

const xb = useXabber();

let backboneView = null;
const uid = 'gcd-' + Math.random().toString(36).substr(2, 9);

// Reactive state
const isMuted = ref(false);
const canInvite = ref(false);
const canEditProperties = ref(false);
const secondText = ref('');

const scrollState = ref({
    isTop: false,
    isHidden: true,
    titleFaded: true,
    secondTextFaded: true,
    buttonsHidden: false,
    searchHidden: false,
    editPropertiesHidden: false,
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
function showSearchMessages(ev) { backboneView?.showSearchMessages(ev); }
function inviteUser(ev) { backboneView?.inviteUser(ev); }
function leaveGroupChat(ev) { backboneView?.leaveGroupChat(ev); }
function muteChat(ev) { backboneView?.muteChat(ev); }
function changeList(ev) { backboneView?.changeList(ev); }
function showQRCode(ev, options) { backboneView?.showQRCode(ev, options); }
function hideQRCode() { backboneView?.hideQRCode(); }
function changeAvatar(ev) { backboneView?.changeAvatar(ev); }

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
function updateNotifications() {
    if (!backboneView?.chat) return;
    isMuted.value = backboneView.chat.isMuted();
}

function updateButtons() {
    if (!props.model) return;
    let my_rights = props.model.my_rights;
    let change_group_info = my_rights && my_rights['change-group-info'] && my_rights['change-group-info'].status === 'true';
    let change_group = my_rights && my_rights['change-group-settings'] && my_rights['change-group-settings'].status === 'true';
    let change_group_permissions = my_rights && my_rights['change-default-permissions'] && my_rights['change-default-permissions'].status === 'true';

    canEditProperties.value = !!(change_group_info || change_group || change_group_permissions);
    canInvite.value = !(
        props.model.get('private_chat')
        || props.model.get('subscription') !== 'both'
        || (my_rights && my_rights['add-members'] && my_rights['add-members'].status === 'false')
    );
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
    updateNotifications,
    updateButtons,
    updateScrollState,
    updateSecondText,
    uid,
});
</script>
