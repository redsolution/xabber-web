<template>
    <div class="modal-header noselect vue-migrated">
        <div class="panel-header">
            <span class="header">{{ xb.getString("dialog_forward_message__header") }}</span>
        </div>
    </div>
    <div class="modal-content noselect vue-migrated">
        <div class="chats-search-form search-form">
            <i class="search-icon mdi mdi-20px mdi-magnify"></i>
            <input type="text" class="search-input simple-input-field" :placeholder="xb.getString('search')">
            <i class="close-search-icon mdi mdi-16px mdi-close-circle"></i>
        </div>
        <div class="chat-list-wrap">
            <div class="pinned-chat-list forward-chats-list">
            </div>
            <div class="chat-list forward-chats-list">
            </div>
            <div class="contact-list forward-chats-list">
            </div>
        </div>
        <div class="error hidden">{{ xb.getString("placeholder_no_matches") }}</div>
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
