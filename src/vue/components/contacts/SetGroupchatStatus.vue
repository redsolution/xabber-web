<template>
    <div class="modal-content-wrap vue-migrated">
        <div class="modal-header">
            <span>{{ xb.getString("dialog_set_status__header") }}</span>
        </div>
        <input class="group-status-input input-glow rich-textarea field-input" type="text">
        <div class="modal-footer">
            <button class="btn-flat btn-main btn-set">{{ xb.getString("set") }}</button>
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
