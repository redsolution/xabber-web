<template>
    <div class="modal-content-wrap vue-migrated">
        <div class="modal-header">
            <span>{{ xb.getString("take_photo") }}</span>
        </div>
        <div class="webcam-profile-image-wrap">
            <div class="camera">
                <video class="webcam-video">Video stream not available.</video>
            </div>
            <canvas id="canvas" style="display: none;">
            </canvas>
            <div class="output hidden">
                <div class="webcam-photo-wrap">
                    <img class="webcam-photo" alt="The screen capture will appear in this box.">
                </div>
                <div class="circle-icon">
                    <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('camera-retake')"></svg>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn-flat btn-main btn-take-photo">{{ xb.getString("capture") }}</button>
            <button class="btn-flat btn-main btn-save hidden">{{ xb.getString("account_webcam_profile_image_btn_save") }}</button>
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
