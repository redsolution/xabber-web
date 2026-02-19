<template>
    <div class="settings-panel-label vue-migrated">{{ xb.getString("settings__menu_item__xmpp_account") }}</div>
    <div class="settings-divider"></div>
    <AccountSettingsItem
        v-for="account in sortedAccounts"
        :key="account.get('jid')"
        :account="account"
        ref="itemRefs"
    />
    <span class="no-accounts-tip" v-show="sortedAccounts.length === 0">
        {{ xb.getString("settings__section_xmpp_accounts__text_no_accounts") }}
    </span>
    <div class="move-account-to-bottom droppable" ref="moveToBottom"></div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useXabber } from '../../composables/useXabber.js';
import AccountSettingsItem from './AccountSettingsItem.vue';

const props = defineProps({
    accounts: { type: Object, required: true },
    parentView: { type: Object, default: null }
});

const xb = useXabber();
const $ = xb.env.$;

const sortedAccounts = ref([...props.accounts.models]);
const moveToBottom = ref(null);
const itemRefs = ref([]);

function syncList() {
    sortedAccounts.value = [...props.accounts.models];
    notifyParent();
}

function notifyParent() {
    if (props.parentView) {
        props.parentView.updateAccounts && props.parentView.updateAccounts();
        props.parentView.updateScrollBar && props.parentView.updateScrollBar();
    }
}

function onMoveAccountToBottom(ev, account) {
    props.accounts.moveToBottom(account);
}

function onShow() {
    syncList();
}

onMounted(() => {
    props.accounts.on('add remove reset sort update_order destroy', syncList);

    if (moveToBottom.value) {
        $(moveToBottom.value).on('move_xmpp_account', onMoveAccountToBottom);
    }
});

onUnmounted(() => {
    props.accounts.off('add remove reset sort update_order destroy', syncList);
});

defineExpose({ onShow });
</script>
