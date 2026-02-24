<template>
    <div class="modal-content-wrap vue-migrated">
        <div class="modal-header">
            <span>{{ xb.getString("account_emoji_profile_image_header") }}</span>
        </div>
        <div class="modal-content">
            <div class="dialog-text">{{ xb.getString("account_emoji_profile_image_description") }}</div>
        </div>
        <div class="emoji-profile-image">
            <div class="avatar-wrap">
                <div class="circle-avatar ground-color-green-100" data-value="green">
                    <div class="chosen-emoji" data-value="🐈">🐈</div>
                </div>
                <div class="circle-icon">
                    <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('edit-outline')"></svg>
                </div>
            </div>

        </div>
        <div class="emoji-profile-colors">
            <div class="colors-line">
                <div class="profile-image-background-color ground-color-green-500 outline-color-green-500 chosen-background-color" data-value="green">
                </div>
                <div class="profile-image-background-color ground-color-deep-orange-500 outline-color-deep-orange-500" data-value="deep-orange">
                </div>
                <div class="profile-image-background-color ground-color-red-500 outline-color-red-500" data-value="red">
                </div>
            </div>
            <div class="colors-line">
                <div class="profile-image-background-color ground-color-light-blue-500 outline-color-light-blue-500" data-value="light-blue">
                </div>
                <div class="profile-image-background-color ground-color-blue-500 outline-color-blue-500" data-value="blue">
                </div>
                <div class="profile-image-background-color ground-color-purple-500 outline-color-purple-500" data-value="purple">
                </div>
            </div>
            <div class="colors-line">
                <div class="profile-image-background-color ground-color-lime-500 outline-color-lime-500" data-value="lime">
                </div>
                <div class="profile-image-background-color ground-color-pink-500 outline-color-pink-500" data-value="pink">
                </div>
                <div class="profile-image-background-color ground-color-orange-500 outline-color-orange-500" data-value="orange">
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn-flat btn-main btn-save">{{ xb.getString("save") }}</button>
            <button class="btn-flat btn-main btn-dark btn-cancel">{{ xb.getString("cancel") }}</button>
            <div class="modal-preloader-wrap"></div>
        </div>
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
    svgContent,
});
</script>
