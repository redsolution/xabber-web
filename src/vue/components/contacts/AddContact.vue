<template>
    <div class="modal-content-wrap vue-migrated">
        <div class="modal-header">
            <span>{{ xb.getString("dialog_add_contact__header") }}</span>
            <div class="account-dropdown-wrap" data-activates="select-account-for-add-contact">
                <div class="dropdown-button">
                    <div class="account-item-wrap">
                        <div class="circle-avatar noselect">
                            <img>
                        </div>
                    </div>
                </div>
                <div id="select-account-for-add-contact" class="unified-dropdown-style unified-twoline-dropdown-style dropdown-content noselect">
                </div>
            </div>
        </div>
        <div class="modal-content">
            <div class="add-contact-jid-step">
                <div class="row name-field">
                    <div class="input-field">
                        <input id="new_contact_username" type="text" :placeholder="xb.getString('dialog_add_contact__label_jid')" name="username">
                        <span class="errors fixed"></span>
                    </div>
                </div>
                <div class="row name-field subcribe-text-row hidden">
                    <div class="input-field">
                        <textarea class="text-field textarea-glow input-glow account-glow" id="subscribe_text" type="text" maxlength="300" cols="10" rows="5" :placeholder="xb.getString('dialog_add_contact__subscribe_text')" name="subscribe_text"></textarea>
                        <span class="errors fixed"></span>
                    </div>
                </div>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn-flat btn-main btn-subscribe-text">{{ xb.getString("dialog_add_contact__button_subscribe_text") }}</button>
            <button class="btn-flat btn-main btn-add">{{ xb.getString("dialog_add_contact__button_add") }}</button>
            <button class="btn-flat btn-main btn-dark btn-cancel">{{ xb.getString("dialog_add_contact__button_cancel") }}</button>
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
