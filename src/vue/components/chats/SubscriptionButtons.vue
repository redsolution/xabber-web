<template>
    <div class="subscription-buttons vue-migrated">
        <div class="subscription-info"></div>
        <div class="button text-color-500 btn-add dotted-underline">{{ xb.getString("contact_add") }}</div>
        <div class="button btn-block dotted-underline">{{ xb.getString("contact_bar_block") }}</div>
        <div class="button text-color-500 btn-allow dropdown-button dotted-underline" :data-activates="uid + '-incoming-subscription-dropdown'">
            {{ xb.getString("subscription_status_in_request_incoming") }}
        </div>
        <div class="button text-color-500 btn-subscribe dotted-underline">{{ xb.getString("chat_subscribe") }}</div>
        <i class="mdi-close btn-decline mdi mdi-24px"></i>
        <div :id="uid + '-incoming-subscription-dropdown'" class="unified-dropdown-style dropdown-content noselect">
            <div class="btn-allow-subscribe-dropdown property-variant">
                {{ xb.getString("chat_allow_and_subscribe") }}
            </div>
            <div class="btn-allow-dropdown property-variant">
                {{ xb.getString("chat_allow") }}
            </div>
            <div class="btn-decline property-variant">
                {{ xb.getString("decline") }}
            </div>
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
