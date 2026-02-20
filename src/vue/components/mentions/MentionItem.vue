<template>
    <div class="group-chat-title-wrap hidden vue-migrated">
        <div class="account-indicator ground-color-700"></div>
        <div class="contact-icon">
        </div>
        <div class="group-chat-name one-line"></div>
    </div>
    <div class="mention-info-wrap vue-migrated">
        <div class="account-indicator ground-color-700"></div>
        <div class="circle-avatar"></div>
        <div class="mention-info">
            <div class="chat-title-wrap">
                <p class="chat-title one-line"></p>
                <p class="last-msg-date"></p>
            </div>
            <p class="last-msg one-line"></p>
            <span class="msg-counter hidden"></span>
        </div>
    </div>
</template>

<script setup>
import { useXabber } from '../../composables/useXabber.js';

const xb = useXabber();

let backboneView = null;

function setBackboneView(view) {
    backboneView = view;
}

defineExpose({
    setBackboneView,
});
</script>
