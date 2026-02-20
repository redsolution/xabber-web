<template>
    <div class="modal-header fingerprints-header vue-migrated">
        {{ xb.getString("omemo__dialog_fingerprints__device_verification_label") }}
    </div>
    <div class="fingerprints-content vue-migrated">
        <div class="other-device-content">

        </div>
        <div class="this-device-content">

        </div>
    </div>
    <div class="fingerprints-bottom vue-migrated">
        <div class="fingerprints-help-text">
            {{ xb.getString("omemo__dialog_fingerprints__bottom_help_text") }}
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
