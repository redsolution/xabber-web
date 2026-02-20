<template>
    <div class="modal-content-wrap vue-migrated">
        <div class="modal-header">
            <span>{{ xb.getString("account_emoji_profile_image_header") }}</span>
            <i class="close-modal mdi mdi-close mdi-24px"></i>
        </div>
        <div class="emoji-picker-wrap no-select">

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
