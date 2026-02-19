<template>
    <svg class="mdi mdi-24px" :class="'mdi-' + name" v-html="svgContent"></svg>
</template>

<script setup>
import { computed } from 'vue';
import { useXabber } from '../composables/useXabber.js';

const props = defineProps({
    name: { type: String, required: true }
});

const xb = useXabber();

const svgContent = computed(() => {
    const svgTemplate = xb.env.templates.svg[props.name];
    if (svgTemplate) {
        return svgTemplate();
    }
    return '';
});
</script>
