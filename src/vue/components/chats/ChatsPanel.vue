<template>
    <div class="recent-chats-panel noselect vue-migrated">
        <i class="btn-back-to-chats mdi mdi-24px mdi-arrow-left"></i>
        <div class="recent-chats-main-header">{{ xb.getString("toolbar__menu_item__chats") }}</div>
        <svg class="btn-unread mdi mdi-24px mdi-svg-template" v-html="svgContent('unread-outline')"></svg>
        <svg class="btn-unread unread-active-btn mdi mdi-24px mdi-svg-template fill-main-color-500" v-html="svgContent('unread')"></svg>
        <div class="chat-list-wrap left-panel-list-wrap">
            <div class="chats-search-form search-form panel-head">
                <i class="search-icon mdi mdi-24px mdi-magnify"></i>
                <input type="text" class="search-input simple-input-field" tabindex="1" :placeholder="xb.getString('search')">
                <i class="close-search-icon mdi mdi-16px mdi-close-circle"></i>
            </div>
            <div class="client-notifications-wrap">
            </div>
            <div class="pinned-chat-list item-list">
            </div>
            <div class="chat-list item-list">
            </div>
            <div class="searched-lists-wrap">
                <div class="chats-list-wrap hidden">
                    <div class="chats-title">{{ xb.getString("search__header_chats") }}</div>
                    <div class="chats-list roster-left-container"></div>
                    <div class="chats-show-more hidden"></div>
                </div>
                <div class="contacts-list-wrap hidden">
                    <div class="contacts-title">{{ xb.getString("category_title_contacts") }}</div>
                    <div class="contacts-list roster-left-container"></div>
                    <div class="contacts-show-more hidden"></div>
                </div>
                <div class="messages-list-wrap hidden">
                    <div class="messages-title">
                        {{ xb.getString("search__header_messages") }}
                        <div class="messages-preloader-wrap hidden">
                            <div class="preloader-wrapper preloader-17px active visible">
                                <div class="spinner-layer">
                                    <div class="circle-clipper left">
                                        <div class="circle"></div>
                                    </div>
                                    <div class="gap-patch">
                                        <div class="circle"></div>
                                    </div>
                                    <div class="circle-clipper right">
                                        <div class="circle"></div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="messages-list roster-left-container"></div>
                </div>
            </div>
            <div class="load-chats-feedback hidden">{{ xb.getString("placeholder_loading") }}</div>
        </div>
        <div class="read-all-button hidden">{{ xb.getString("mark_all_as_read_button") }}</div>
    </div>
</template>

<script setup>
import { useXabber } from '../../composables/useXabber.js';

const xb = useXabber();

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
    svgContent
});
</script>
