<template>
    <div class="search-form-header vue-migrated">
        <div class="messages-search-form search-form">
            <i class="search-icon mdi mdi-20px mdi-magnify"></i>
            <input type="text" class="search-input simple-input-field" tabindex="1" :placeholder="xb.getString('chat__search_messages_panel__placeholder')" autofocus>
        </div>
        <div class="text-color-700 btn-cancel-searching">{{ xb.getString("cancel") }}</div>
    </div>
    <div class="pinned-message vue-migrated"></div>
    <div class="elements-in-top vue-migrated">
        <div class="subscription-buttons-wrap hidden"></div>
        <div class="chat-day-indicator fixed-day-indicator-wrap hidden"><div class="fixed-day-indicator"></div></div>
    </div>
    <div class="load-history-feedback hidden vue-migrated"></div>
    <div class="participant-messages-header hidden vue-migrated">
        <div class="messages-by-header">{{ xb.getString("chat__placeholder_participant_messages__messages_by") }}
            <div class="participant-nickname text-color-700">

            </div>
        </div>
        <div class="text-color-500 btn-retract-messages dotted-underline">{{ xb.getString("chat_settings__button_delete_all") }}</div>
        <i class="mdi-close btn-cancel-selection mdi mdi-24px"></i>
    </div>
    <div class="chat-content vue-migrated">
    </div>
    <div class="chat-notification hidden one-line vue-migrated"></div>
    <div class="chat-incoming-session-notification hidden vue-migrated"></div>
    <i class="mdi mdi-36px back-to-unread hidden mdi-chevron-down vue-migrated"><div class="back-to-unread-counter"></div></i>
    <i class="mdi mdi-36px back-to-mentions hidden mdi-at vue-migrated"><div class="back-to-mentions-counter"></div></i>
    <i class="mdi mdi-36px back-to-bottom mdi-chevron-down vue-migrated"></i>
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
