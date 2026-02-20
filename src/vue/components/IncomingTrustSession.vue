<template>
    <div class="modal-header vue-migrated">
        {{ xb.getString("incoming_trust_session__modal_header") }}
    </div>
    <div class="modal-content vue-migrated">
        {{ xb.getString("incoming_trust_session__modal_text") }}
    </div>
    <div class="modal-footer vue-migrated">
        <button class="btn-flat btn-main btn-change">{{ xb.getString("accept") }}</button>
        <button class="btn-flat btn-main btn-dark btn-cancel">{{ xb.getString("cancel") }}</button>
    </div>
</template>

<script setup>
import { useXabber } from '../composables/useXabber.js';

const xb = useXabber();

let backboneView = null;

function setBackboneView(view) {
    backboneView = view;
}

defineExpose({
    setBackboneView,
});
</script>
