<template>
    <div class="modal-content-wrap vue-migrated">
        <div class="modal-header">
            <span class="original-state">{{ xb.getString("button_change_pass") }}</span>
            <span class="success-state hidden">{{ xb.getString("password_changed_success") }}</span>
        </div>
        <div class="modal-content original-state">
            <div class="change-password-fields">
                <div class="block-subheader">
                    <span class="block-name">{{ xb.getString("hint_old_pass") }}</span>
                </div>
                <div class="change-password-field">
                    <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('key')"></svg>
                    <input class="input-glow account-glow" :placeholder="xb.getString('hint_old_pass')" id="old_password" type="password" name="old_password" autocomplete="off">
                    <span class="errors fixed"></span>
                </div>
                <div class="block-subheader">
                    <span class="block-name">{{ xb.getString("hint_new_pass") }}</span>
                </div>
                <div class="change-password-field">
                    <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('key-variant')"></svg>
                    <input class="input-glow account-glow" :placeholder="xb.getString('hint_new_pass')" id="password" type="password" name="password" autocomplete="off">
                    <span class="errors fixed"></span>
                </div>
                <div class="change-password-field">
                    <input class="input-glow account-glow" :placeholder="xb.getString('hint_confirm_pass')" id="password_confirm" type="password" name="password_confirm" autocomplete="off">
                    <span class="errors fixed"></span>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn-change btn-flat btn-main original-state" disabled>{{ xb.getString("button_change_pass") }}</button>
            <button class="btn-flat btn-main btn-dark btn-cancel btn-finish-change success-state hidden">{{ xb.getString("ok") }}</button>
            <button class="btn-flat btn-main btn-dark btn-cancel original-state">{{ xb.getString("cancel") }}</button>
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
