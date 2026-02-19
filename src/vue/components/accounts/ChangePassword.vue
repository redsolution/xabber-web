<template>
    <div class="modal-content-wrap vue-migrated">
        <div class="modal-header">
            <span>{{ xb.getString("settings_account__dialog_change_password__header") }}</span>
        </div>
        <div class="modal-content">
            <div class="row login-form-field">
                <div class="input-field">
                    <input id="jid" type="text" class="input-glow" name="jid" disabled readonly>
                    <span class="errors fixed"></span>
                </div>
                <div class="input-field">
                    <input id="password" type="password" class="input-glow" :placeholder="xb.getString('account_password')" name="password" autocomplete="off">
                    <span class="errors fixed"></span>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn-flat btn-main btn-change">{{ xb.getString("set") }}</button>
            <button class="btn-flat btn-main btn-dark btn-cancel">{{ xb.getString("cancel") }}</button>
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
