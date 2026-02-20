<template>
    <div class="plyr-player-popup-container vue-migrated">
        <div class="plyr-player-popup-draggable">
            <video class="plyr-player-popup"></video>
            <div class="plyr-player-min-controls-tab">
                <div class="plyr-player-min-controls-buttons">
                    <svg class="mdi mdi-24px mdi-plyr-button-minimized mdi-minimize-full mdi-svg-template" v-html="svgContent('player-full')"></svg>
                    <svg class="mdi mdi-24px mdi-plyr-button-minimized mdi-toggle-play mdi-plyr-play mdi-svg-template" v-html="svgContent('play')"></svg>
                    <svg class="mdi mdi-24px mdi-plyr-button-minimized mdi-toggle-play mdi-plyr-pause mdi-svg-template" v-html="svgContent('pause')"></svg>
                    <svg class="mdi mdi-24px mdi-plyr-button-minimized mdi-toggle-mute mdi-mute-plyr mdi-svg-template" v-html="svgContent('volume-off')"></svg>
                    <svg class="mdi mdi-24px mdi-plyr-button-minimized mdi-toggle-mute mdi-unmute-plyr mdi-svg-template" v-html="svgContent('volume-high')"></svg>
                </div>
            </div>
        </div>
    </div>
    <div class="plyr-player-control-tab vue-migrated">
        <i class="mdi mdi-24px mdi-close"></i>
        <svg class="mdi mdi-24px mdi-plyr-toolbar-item mdi-plyr-hide mdi-svg-template" v-html="svgContent('arrow-collapse')"></svg>
    </div>
</template>

<script setup>
import { useXabber } from '../composables/useXabber.js';

const xb = useXabber();

function svgContent(name) {
    let tmpl = xb.env.templates.svg[name];
    return tmpl ? tmpl() : '';
}

let backboneView = null;

function setBackboneView(view) {
    backboneView = view;
}

defineExpose({
    setBackboneView,
    svgContent,
});
</script>
