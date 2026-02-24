<template>
    <div class="modal-header vue-migrated">
        <span></span>
        <div class="menu-wrap">
            <div data-screen-name="image" class="menu-btn btn-library">{{ xb.getString("images") }}</div>
            <div data-screen-name="video" class="menu-btn btn-library">{{ xb.getString("videos") }}</div>
            <div data-screen-name="upload" class="menu-btn btn-upload">{{ xb.getString("settings__dialog_background__menu_item_upload") }}</div>
            <div data-screen-name="web-address" class="menu-btn btn-web-address">{{ xb.getString("settings__dialog_background__menu_item_url") }}</div>
        </div>
    </div>
    <div class="modal-content vue-migrated">
        <div data-screen="image" class="screen-wrap hidden library-wrap"></div>
        <div data-screen="video" class="screen-wrap hidden library-wrap"></div>
        <div data-screen="upload" class="screen-wrap">
            <div class="upload-wrap">
                <div class="upload-text">{{ xb.getString("chat_bottom__drag_and_drop__text_drop_files_here") }}</div>
                <div class="upload-button">
                    <button type="file">{{ xb.getString("send_media__btn_upload") }}</button>
                    <input type="file" multiple>
                </div></div>
        </div>
        <div data-screen="web-address" class="hidden screen-wrap web-address-wrap">
            <div class="web-address">
                <div class="label">{{ xb.getString("settings__dialog_background__section_url__label") }}</div>
                <input class="url"/>
            </div>
            <div class="image-preview">
                <img class="hidden">
                <p>{{ xb.getString("settings__dialog_background__section_url__placeholder_preview") }}</p>
            </div>
        </div>
    </div>
    <div class="modal-footer vue-migrated">
        <button class="btn-flat btn-main text-color-700 non-active btn-add">{{ xb.getString("add") }}</button>
        <button class="btn-flat btn-main btn-dark btn-cancel">{{ xb.getString("cancel") }}</button>
        <div class="modal-preloader-wrap"></div>
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
