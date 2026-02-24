<template>
    <div class="modal-content-wrap vue-migrated">
        <div class="modal-header">
            <span></span>
        </div>
        <div class="modal-content">
        </div>
        <div class="modal-footer">
            <button class="btn-flat btn-main btn-dark btn-cancel">{{ xb.getString("btn_done") }}</button>
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
