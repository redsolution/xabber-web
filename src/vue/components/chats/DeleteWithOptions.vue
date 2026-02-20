<template>
    <div class="modal-content-wrap vue-migrated">
        <div class="modal-header">
            <span>{{ xb.getString("dialog_delete_messages__header") }}</span>
        </div>
        <div class="modal-content">
            <div class="field checkbox-field">
                <form action="#">
                    <p>
                        <input class="filled-in" name="delete-options" value="spam" type="checkbox" id="delete-options-spam" />
                        <label for="delete-options-spam">{{ xb.getString("delete_with_options__spam_option") }}</label>
                    </p>
                    <p>
                        <input class="filled-in" name="delete-options" value="delete_all" type="checkbox" id="delete-options-delete-all" />
                        <label for="delete-options-delete-all"></label>
                    </p>
                    <p>
                        <input class="filled-in" name="delete-options" value="ban" type="checkbox" id="delete-options-ban" />
                        <label for="delete-options-ban">{{ xb.getString("delete_with_options__ban_option") }}</label>
                    </p>
                </form>
            </div>
            <div class="show-restrict-permissions-btn btn-partially-restrict dotted-underline text-color-500">
                <i class="mdi-restrict-icon mdi mdi-24px mdi-chevron-down"></i><span>{{ xb.getString("delete_with_options__show_restrict_btn") }}</span><i class="mdi-restrict-icon mdi mdi-24px mdi-chevron-down"></i>
            </div>
            <div class="restrict-permissions-modal-wrap">
                <div class="restrict-permissions-modal-header">
                    {{ xb.getString("delete_with_options__permissions_header") }}
                </div>
                <div class="restrict-permissions-modal-content"></div>
                <div class="restrict-permissions-modal-timers-wrap"></div>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn-flat btn-main btn-proceed text-color-500">{{ xb.getString("proceed") }}</button>
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
