<template>
    <div class="circle-avatar ground-color-700 vue-migrated"></div>
    <div class="chat-head-info-buttons-container vue-migrated">
        <div class="contact-info">
            <p class="contact-name one-line">{{ xb.getString("saved_messages__header") }}</p>
            <p class="one-liner"></p>
        </div>
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
            <div class="chat-tool btn-jingle-message">
                <i class="mdi mdi-phone mdi-24px"></i>
            </div>
            <div class="chat-tool btn-chat-pin">
                <svg class="mdi mdi-24px" viewBox="0 0 24 24">
                    <svg class="mdi mdi-24px" viewBox="0 0 24 24">
                        <path id="tooltip-variant" fill="#9E9E9E" fill-rule="nonzero" d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z"></path>
                    </svg>
                </svg>
            </div>
            <div class="chat-tool btn-search-messages">
                <i class="search-icon mdi mdi-24px mdi-magnify"></i>
            </div>
            <div class="chat-tool btn-more dropdown-button" :data-activates="uid + '-more'">
                <i class="mdi mdi-24px mdi-dots-vertical"></i>
            </div>
            <ul :id="uid + '-more'" class="chat-head-menu unified-dropdown-style dropdown-content noselect">
                <li class="unified-dropdown-style-item btn-delete-chat">
                    <span class="one-line">{{ xb.getString("chat_settings__button_delete_all") }}</span>
                </li>
            </ul>
        </div>
    </div>
</template>

<script setup>
import { useXabber } from '../../composables/useXabber.js';

const xb = useXabber();

const uid = 'sch-' + Math.random().toString(36).substr(2, 9);

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
