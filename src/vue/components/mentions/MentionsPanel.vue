<template>
    <div class="mentions-panel noselect vue-migrated">
        <div class="chats-search-form search-form panel-head">
            <i class="search-icon mdi mdi-24px mdi-magnify"></i>
            <input type="text" class="search-input simple-input-field" tabindex="1" :placeholder="xb.getString('search')">
            <i class="close-search-icon mdi mdi-16px mdi-close-circle"></i>
        </div>
        <div class="mentions-list-wrap left-panel-list-wrap">
            <div class="mentions-list item-list">
            </div>
            <div class="searched-lists-wrap">
                <div class="chats-list-wrap hidden">
                    <div class="chats-title">{{ xb.getString("search__header_chats") }}</div>
                    <div class="chats-list roster-left-container"></div>
                </div>
                <div class="contacts-list-wrap hidden">
                    <div class="contacts-title">{{ xb.getString("category_title_contacts") }}</div>
                    <div class="contacts-list roster-left-container"></div>
                </div>
                <div class="messages-list-wrap hidden">
                    <div class="messages-title">{{ xb.getString("search__header_messages") }}</div>
                    <div class="messages-list roster-left-container"></div>
                </div>
            </div>
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
