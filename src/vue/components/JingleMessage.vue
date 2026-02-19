<template>
    <div class="collapsed-movable vue-migrated"></div>
    <div class="call-header vue-migrated">
        {{ xb.getString("dialog_jingle_message__header", [constants.SHORT_CLIENT_NAME]) }}
        <div class="calling-status"></div>
    </div>
    <div class="blur-background vue-migrated"></div>
    <div class="contact-info vue-migrated">
        <div class="name one-line"></div>
        <div class="calling-status"></div>
    </div>
    <div class="video-wrap vue-migrated">
        <video autoplay loop class="blank-video hidden">
            <source :src="constants.BLANK_VIDEO.MP4">
            <source :src="constants.BLANK_VIDEO.OGG" type="video/ogg">
            <source :src="constants.BLANK_VIDEO.WEBM" type="video/webm">
        </video>
        <audio autoplay class="webrtc-remote-audio hidden"></audio>
        <video autoplay muted class="webrtc-local-video collapsed hidden"></video>
        <div class="default-screen">
            <div class="circle-avatar"></div>
            <div class="name one-line"></div>
        </div>
    </div>
    <div class="buttons-panel vue-migrated">
        <div class="buttons-wrap">
            <div class="btn-wrap" title="Collapse window"><svg class="btn-collapse mdi-24px" viewBox="0 0 24 24">
                <path d="M19.5,3.09L15,7.59V4H13V11H20V9H16.41L20.91,4.5L19.5,3.09M4,13V15H7.59L3.09,19.5L4.5,20.91L9,16.41V20H11V13H4Z"></path>
            </svg></div>
            <div class="btn-wrap" title="Fullscreen mode"><svg class="btn-full-screen mdi-24px" viewBox="0 0 24 24">
                <path d="M11,21H3V13H5V17.59L17.59,5H13V3H21V11H19V6.41L6.41,19H11V21Z" />
            </svg></div>
            <i :title="xb.getString('dialog_jingle_message__button_mute_microphone__tooltip')" class="btn-microphone mdi mdi-24px mdi-microphone"></i>
            <i :title="xb.getString('dialog_jingle_message__button_switch_video__tooltip')" class="btn-video mdi mdi-24px mdi-video"></i>
            <i :title="xb.getString('dialog_jingle_message__button_mute__tooltip')" class="btn-volume mdi mdi-24px mdi-volume-high"></i>
            <i :title="xb.getString('dialog_jingle_message__button_share_screen__tooltip')" class="btn-share-screen mdi mdi-24px mdi-monitor"></i>
            <i :title="xb.getString('dialog_jingle_message__button_accept_call__tooltip')" class="btn-accept mdi mdi-24px mdi-phone"></i>
            <i :title="xb.getString('dialog_jingle_message__button_decline_call__tooltip')" class="btn-cancel mdi mdi-24px mdi-phone-hangup"></i>
        </div>
    </div>
</template>

<script setup>
import { useXabber } from '../composables/useXabber.js';

const xb = useXabber();
const constants = xb.env.constants;

let backboneView = null;

function setBackboneView(view) {
    backboneView = view;
}

defineExpose({
    setBackboneView,
});
</script>
