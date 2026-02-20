<template>
    <div class="text vue-migrated">{{ xb.getString("chat_list__placeholder") }}</div>
    <div class="no-accounts-placeholder hidden vue-migrated">{{ xb.getString("application_state_disabled") }}</div>
    <div class="btn-open-settings no-accounts-placeholder hidden vue-migrated">{{ xb.getString("settings") }}</div>
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
