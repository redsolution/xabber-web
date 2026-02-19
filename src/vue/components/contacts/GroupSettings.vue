<template>
    <div class="modal-content-wrap settings-panel vue-migrated">
        <div class="modal-header">
            <span>{{ xb.getString("dialog_circle_settings__header") }}</span>
        </div>

        <div class="modal-content">
                <div class="field-wrap group-name">
                    <div class="input-field">
                        <label :for="uid + '-group-name'">{{ xb.getString("circle_name") }}</label>
                        <input :id="uid + '-group-name'" type="text" name="group_name">
                        <span class="errors fixed"></span>
                    </div>
                </div>

                <div class="setting-name">{{ xb.getString("category_offline_contacts") }}</div>
                <div class="setting-wrap">
                    <div class="setting offline radio-button field-wrap">
                        <div class="field radio-field clickable-field">
                            <form action="#">
                                <p>
                                    <input class="with-gap" name="offline" value="yes" type="radio" :id="uid + '-show'" />
                                    <label :for="uid + '-show'">{{ xb.getString("show_offline_always") }}</label>
                                </p>
                                <p>
                                    <input class="with-gap" name="offline" value="no" type="radio" :id="uid + '-hide'" />
                                    <label :for="uid + '-hide'">{{ xb.getString("hide_offline_always") }}</label>
                                </p>
                                <p>
                                    <input class="with-gap" name="offline" value="default" type="radio" :id="uid + '-show-offline-default'" />
                                    <label :for="uid + '-show-offline-default'">{{ xb.getString("dialog_circle_settings__label_common_settings") }}</label>
                                </p>
                            </form>
                        </div>
                    </div>
                </div>
        </div>
        <div class="modal-footer">
            <button class="btn-flat btn-main btn-dark btn-delete left">{{ xb.getString("circle_remove") }}</button>
            <button class="btn-flat btn-main btn-apply">{{ xb.getString("dialog_circle_settings__button_apply") }}</button>
            <button class="btn-flat btn-main btn-dark btn-cancel">{{ xb.getString("cancel") }}</button>
        </div>
    </div>
</template>

<script setup>
import { useXabber } from '../../composables/useXabber.js';

const xb = useXabber();

const props = defineProps({
    uid: {
        type: String,
        required: true,
    },
});

let backboneView = null;

function setBackboneView(view) {
    backboneView = view;
}

defineExpose({
    setBackboneView,
});
</script>
