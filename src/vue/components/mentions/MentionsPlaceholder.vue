<template>
    <div class="text vue-migrated">{{ xb.getString("mentions_list__placeholder") }}</div>
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
