<template>
    <div class="calls-content-filters no-select vue-migrated">
        <i class="btn-back-to-chats mdi mdi-24px mdi-arrow-left"></i>
        <div class="calls-filter-main-header">{{ xb.getString("calls_window__header") }}</div>
        <div class="left-column-filters-container">
            <div class="client-notifications-wrap">

            </div>
            <div class="calls-type-filter">
                <!--<div class="calls-filter-header"></div>-->
                <div class="calls-type-filter-content">
                    <!--<div class="filter-item-wrap selected-filter" data-filter="all">-->
                        <!--<svg class="filter-icon mdi fill-color-grey-500 mdi-svg-template" v-html="svgContent('call')"></svg>-->
                        <!--<div class="name one-line">{{ xb.getString("calls_window__type_filter_all") }}</div>-->
                    <!--</div>-->
                    <div class="filter-item-wrap" data-filter="missed">
                        <svg class="filter-icon mdi fill-color-red-500 mdi-svg-template" v-html="svgContent('call-received')"></svg>
                        <div class="name one-line">{{ xb.getString("calls_window__type_filter_missed") }}</div>
                    </div>
                    <div class="filter-item-wrap" data-filter="incoming">
                        <svg class="filter-icon mdi fill-color-green-500 mdi-svg-template" v-html="svgContent('call-received')"></svg>
                        <div class="name one-line">{{ xb.getString("calls_window__type_filter_incoming") }}</div>
                    </div>
                    <div class="filter-item-wrap" data-filter="outgoing">
                        <svg class="filter-icon mdi fill-color-green-500 mdi-svg-template" v-html="svgContent('call-made')"></svg>
                        <div class="name one-line">{{ xb.getString("calls_window__type_filter_outgoing") }}</div>
                    </div>
                    <div class="filter-item-wrap" data-filter="declined">
                        <svg class="filter-icon mdi fill-color-red-500 mdi-svg-template" v-html="svgContent('call-made')"></svg>
                        <div class="name one-line">{{ xb.getString("calls_window__type_filter_declined") }}</div>
                    </div>
                </div>
            </div>
            <div class="calls-contacts-wrap">
                <div class="calls-filter-header">{{ xb.getString("calls_window__calls_contacts") }}</div>
                <div class="calls-contacts-container">
                </div>
            </div>
        </div>
    </div>
    <div class="calls-right-wrap">
        <div class="calls-header-container">
            <svg class="btn-show-search mdi mdi-24px mdi-svg-template" v-html="svgContent('search')"></svg>
            <div class="btn-check-all">
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
            <div class="tab-additional-filter-item tab-account-filter-item dropdown-button ground-main-color-50 hidden" data-type="accounts" data-value="all" :data-activates="uid + '-accounts-filters'">
                <div class="tab-filter-item-text one-line"></div>
                <i class="mdi mdi-8px mdi-triangle"></i>
            </div>
            <ul :id="uid + '-accounts-filters'" class="dropdown-content unified-dropdown-style accounts-dropdown noselect">
            </ul>
            <div class="contacts-search-form search-form">
                <div type="text" class="search-input simple-input-field" role="textbox" contenteditable :data-placeholder="xb.getString('search')"></div>
                <i class="close-search-icon mdi mdi-16px mdi-close-circle"></i>
            </div>
        </div>
        <div class="calls-right-container">
            <div class="active-call-container">
                <div class="active-call-item no-select">
                    <div class="circle-avatar"></div>
                    <div class="call-contact-name text-color-500 one-line"></div>
                    <div class="call-duration text-color-500"></div>
                    <svg class="active-call-icon outgoing-icon mdi fill-color-blue-700 mdi-svg-template" v-html="svgContent('call-made')"></svg>
                    <svg class="active-call-icon incoming-icon fill-color-green-700 mdi-svg-template" v-html="svgContent('call-received')"></svg>
                    <div class="btn-end-call">
                        <svg class="mdi fill-color-red-500 mdi-svg-template" v-html="svgContent('call-hangup')"></svg>
                    </div>
                </div>
            </div>
            <div class="calls-content">
                <div class="chat-content-wrap">
                    <div class="chat-content">
                    </div>
                    <!--<i class="mdi mdi-36px back-to-bottom mdi-chevron-down"></i>-->
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { useXabber } from '../../composables/useXabber.js';

const xb = useXabber();

const uid = 'cp-' + Math.random().toString(36).substr(2, 9);

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
