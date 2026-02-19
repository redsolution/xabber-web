<template>
    <div class="notifications-content-filters no-select vue-migrated">
        <i class="btn-back-to-chats mdi mdi-24px mdi-arrow-left"></i>
        <div class="notifications-filter-main-header">{{ xb.getString("notifications_window__header") }}</div>
        <div class="left-column-filters-container">
            <div class="client-notifications-wrap">

            </div>
            <div class="notifications-type-filter">
                <!--<div class="notifications-filter-header"></div>-->
                <div class="notifications-type-filter-content">
                    <div class="filter-item-wrap" data-filter="security">
                        <svg class="filter-icon mdi fill-color-grey-500 mdi-svg-template" v-html="svgContent('security-outline')"></svg>
                        <div class="name one-line">{{ xb.getString("notifications_window__type_filter_security") }}<span></span></div>
                    </div>
                    <div class="filter-item-wrap" data-filter="information">
                        <svg class="filter-icon mdi fill-color-grey-500 mdi-svg-template" v-html="svgContent('information-outline')"></svg>
                        <div class="name one-line">{{ xb.getString("notifications_window__type_filter_information") }}<span></span></div>
                    </div>
                    <div class="filter-item-wrap" data-filter="mentions">
                        <svg class="filter-icon mdi fill-color-grey-500 mdi-svg-template" v-html="svgContent('mention')"></svg>
                        <div class="name one-line">{{ xb.getString("notifications_window__type_filter_mentions") }}<span></span></div>
                    </div>
                    <!--<div class="filter-item-wrap subscription-item-wrap" data-filter="subscription">-->
                        <!--<svg class="filter-icon mdi fill-color-grey-500 mdi mdi-svg-template" v-html="svgContent('vcard-outline')"></svg>-->
                        <!--<div class="name one-line">{{ xb.getString("notifications_window__subscriptions_header") }}<span></span></div>-->
                    <!--</div>-->
                    <!--<div class="filter-item-wrap invitation-item-wrap" data-filter="invitations">-->
                        <!--<svg class="filter-icon mdi fill-color-grey-500 mdi mdi-svg-template" v-html="svgContent('invite-outline')"></svg>-->
                        <!--<div class="name one-line">{{ xb.getString("notifications_window__type_filter_invitations") }}<span></span></div>-->
                    <!--</div>-->
                </div>
            </div>
            <div class="notifications-filter-header">{{ xb.getString("notifications_window__calendar_header") }}</div>
            <div class="notifications-calendar-activity">

            </div>
        </div>
    </div>
    <div class="notifications-right-wrap">
        <div class="notifications-utility">
            <svg class="btn-show-search mdi mdi-24px mdi-svg-template" v-html="svgContent('search')"></svg>
            <div class="btn-read-all">
                <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('check-all')"></svg>
            </div>
        </div>
        <div class="tab-active-filters-wrap">
            <div class="chat-tools-wrap">
                <div class="chat-tool chat-tool-player">
                    <div class="chat-tool-player-containter">
                        <div class="chat-tool chat-tool-plyr-controls btn-previous-plyr">
                            <i class="mdi mdi-skip-previous mdi-24px"></i>
                        </div>
                        <div class="chat-tool chat-tool-plyr-controls btn-play-pause-plyr">
                            <i class="mdi mdi-play mdi-24px"></i>
                            <i class="mdi mdi-pause mdi-24px"></i>
                        </div>
                        <div class="chat-tool chat-tool-plyr-controls btn-next-plyr">
                            <i class="mdi mdi-skip-next mdi-24px"></i>
                        </div>
                        <div class="chat-tool chat-tool-plyr-controls btn-popup-plyr">
                            <img class="player-poster hidden">
                            <svg class="mdi mdi-32px mdi-player-type-icon mdi-svg-template" v-html="svgContent('video')"></svg>
                            <div class="voice-message-player-avatar circle-avatar hidden"></div>
                        </div>
                        <div class="chat-tool chat-player-duration chat-tool-plyr-controls">
                            <div class="chat-head-player-title one-line"><div class="chat-head-player-title-text">{{ xb.getString("chat_message_video") }}</div></div>
                            <div class="chat-head-player-title-bottom-container">
                                <span class="chat-head-player-type one-line">{{ xb.getString("chat_message_video") }}</span><span class="chat-head-player-type-dot"> &#x2022;</span>
                                <span class="chat-head-player-current-time">0:00</span> /
                                <span class="chat-head-player-total-time">0:00</span>
                            </div>
                        </div>
                        <div class="chat-tool chat-tool-plyr-controls btn-stop-plyr">
                            <i class="mdi mdi-close mdi-16px"></i>
                        </div>
                    </div>
                </div>
            </div>
            <div class="tab-additional-filter-item dropdown-button ground-main-color-50" data-type="accounts" data-value="all" :data-activates="uid + '-accounts-filters'">
                <div class="tab-filter-item-text one-line">{{ xb.getString("notifications_window__type_filter_all_accounts") }}</div>
                <i class="mdi mdi-8px mdi-triangle"></i>
            </div>
            <ul :id="uid + '-accounts-filters'" class="dropdown-content accounts-dropdown unified-dropdown-style noselect">
                <div class="property-variant btn-accounts-filter" data-jid="all">
                    <span class="one-line">{{ xb.getString("notifications_window__type_filter_all_accounts") }}</span>
                </div>
            </ul>
            <div class="contacts-search-form search-form">
                <div type="text" class="search-input simple-input-field" role="textbox" contenteditable :data-placeholder="xb.getString('search')"></div>
                <i class="close-search-icon mdi mdi-16px mdi-close-circle"></i>
            </div>
        </div>
        <div class="notifications-content">

        </div>
        <div class="selected-messages-controls-container">
            <div class="btn-unselect-all" :title="xb.getString('cancel')">
                <svg class="mdi mdi-32px mdi-svg-template" v-html="svgContent('close')"></svg>
            </div>
            <div class="notifications-select-count"></div>
            <i class="btn-copy mdi mdi-24px mdi-content-copy" :title="xb.getString('message_copy')"></i>
            <div class="btn-delete-selected" :title="xb.getString('delete')">
                <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('trash')"></svg>
            </div>
        </div>
    </div>
</template>

<script setup>
import { useXabber } from '../../composables/useXabber.js';

const xb = useXabber();

const uid = 'np-' + Math.random().toString(36).substr(2, 9);

function svgContent(name) {
    let tmpl = xb.env.templates.svg[name];
    return tmpl ? tmpl() : '';
}

let backboneView = null;

function setBackboneView(view) {
    backboneView = view;
}

defineExpose({
    setBackboneView,
    svgContent,
    uid,
});
</script>
