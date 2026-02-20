<template>
    <div class="border ground-color-500 vue-migrated"></div>
    <div class="account-item-avatar-wrap vue-migrated">
        <div class="account-indicator-background-exclude">
            <div class="account-indicator ground-color-700"></div>
            <div class="circle-avatar-wrap">
                <div class="dropdown-button circle-avatar border-color noselect"></div>
            </div>
        </div>
    </div>
    <div class="status vue-migrated"></div>
    <i class="mdi encryption-warning-icon hidden mdi-24px mdi-alert vue-migrated"></i>
    <i class="auth-failed mdi mdi-16px mdi-close vue-migrated"></i>
    <div class="account-actions-panel vue-migrated">
        <div class="filter-chats">
            <i class="mdi mdi-filter mdi-20px"></i>
            <div class="text">{{ xb.getString("account__toolbar_item__button_filter_chats") }}</div>
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
