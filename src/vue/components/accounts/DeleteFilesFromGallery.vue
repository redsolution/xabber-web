<template>
    <div class="modal-content-wrap vue-migrated">
        <div class="modal-header">
            <span>{{ xb.getString("media_gallery_delete_files_header") }}</span>
        </div>
        <div class="modal-content">
            <div class="deletion-variants no-select">
                <div class="delete-files-text-info">{{ xb.getString("media_gallery_delete_files_info_text") }}</div>
                <div class="property-variant btn-delete-files-percent" data-value="15">
                    <svg class="percent-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('circle-slice-1')"></svg>
                    <span class="one-line">{{ xb.getString("media_gallery_delete_files_button_15_percent") }}</span>
                </div>
                <div class="property-variant btn-delete-files-percent" data-value="25">
                    <svg class="percent-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('circle-slice-2')"></svg>
                    <span class="one-line">{{ xb.getString("media_gallery_delete_files_button_25_percent") }}</span>
                </div>
                <div class="property-variant btn-delete-files-percent" data-value="50">
                    <svg class="percent-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('circle-slice-4')"></svg>
                    <span class="one-line">{{ xb.getString("media_gallery_delete_files_button_50_percent") }}</span>
                </div>
                <div class="property-variant btn-delete-files-percent" data-value="100">
                    <svg class="percent-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('circle-slice-8')"></svg>
                    <span class="one-line">{{ xb.getString("media_gallery_delete_files_button_100_percent") }}</span>
                </div>
            </div>
            <div class="media-gallery-delete-items-wrap hidden">
                <div class="delete-files-preview-wrap media-gallery-items-wrap">
                    <div class="delete-files-text no-select">{{ xb.getString("media_gallery_delete_files_preview_text") }}</div>
                    <div data-value="avatar" class="setting-name header-setting no-select delete-files-avatars">
                        {{ xb.getString("avatars") }}
                    </div>
                    <div class="gallery-files gallery-preview-image hidden grid delete-files-avatars delete-files-preview-container zoom-gallery">
                    </div>
                    <div data-value="image" class="setting-name header-setting no-select delete-files-images">
                        {{ xb.getString("images") }}
                    </div>
                    <div class="gallery-files gallery-preview-image hidden grid delete-files-images delete-files-preview-container zoom-gallery">
                    </div>
                    <div data-value="video" class="setting-name header-setting no-select delete-files-videos">
                        {{ xb.getString("videos") }}
                    </div>
                    <div class="gallery-files gallery-preview-video hidden grid delete-files-videos delete-files-preview-container zoom-gallery">
                    </div>
                    <div data-value="voice" class="setting-name header-setting no-select delete-files-voices">
                        {{ xb.getString("vcard_type_voice") }}
                    </div>
                    <div class="gallery-files gallery-preview-file hidden voice delete-files-voices delete-files-preview-container zoom-gallery">
                    </div>
                    <div data-value="file" class="setting-name header-setting no-select delete-files-files">
                        {{ xb.getString("files") }}
                    </div>
                    <div class="gallery-files gallery-preview-voice hidden file delete-files-files delete-files-preview-container zoom-gallery">
                    </div>
                </div>
                <div class="no-files hidden">{{ xb.getString("no_files") }}</div>
            </div>
        </div>
        <div class="modal-footer">
            <div class="input-field checkbox-field delete-avatars-checkbox">
                <input type="checkbox" class="filled-in" :id="uid + '-delete_avatars'"/>
                <label :for="uid + '-delete_avatars'">{{ xb.getString("media_gallery_delete_files_confirm_delete_avatars") }}</label>
            </div>
            <button class="btn-confirm btn-flat btn-main">{{ xb.getString("delete") }}</button>
            <button class="btn-flat btn-main btn-dark btn-cancel">{{ xb.getString("cancel") }}</button>
        </div>
    </div>
</template>

<script setup>
import { useXabber } from '../../composables/useXabber.js';

const props = defineProps({
    uid: { type: String, default: '' },
});

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
