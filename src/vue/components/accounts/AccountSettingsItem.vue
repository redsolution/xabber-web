<template>
    <div class="xmpp-account draggable droppable"
         :class="{ disabled: !enabled }"
         :data-color="colorScheme"
         ref="rootEl">
        <div class="move-account-to-this droppable" ref="dropTarget"></div>
        <div class="account-info-wrap" :class="{ 'encryption-warning': encryptionWarning }"
             @click="showSettings">
            <i class="drag-item drag-handle mdi mdi-24px mdi-drag-vertical"></i>
            <div class="account-indicator-background-exclude">
                <div class="account-indicator ground-color-700"></div>
                <div class="circle-avatar noselect" ref="avatarEl">
                    <img>
                </div>
            </div>
            <i class="mdi encryption-warning-icon mdi-24px mdi-alert"
               :class="{ hidden: !encryptionWarning }"></i>
            <div class="text-info-wrap">
                <div class="nickname-wrap" :class="{ 'single-row': !hasNickname }">
                    <div class="nickname one-line">{{ displayName }}</div>
                </div>
                <div class="jid-wrap" :class="{ hidden: !hasNickname }">
                    <div class="jid one-line">{{ jid }}</div>
                </div>
            </div>
        </div>
        <div class="field clickable-field enabled-state switch normal">
            <label class="field-value">
                <input type="checkbox" :checked="enabled" @change="setEnabled">
                <span class="lever"></span>
            </label>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue';
import { useXabber } from '../../composables/useXabber.js';

const props = defineProps({
    account: { type: Object, required: true }
});

const xb = useXabber();
const utils = xb.env.utils;
const constants = xb.env.constants;
const $ = xb.env.$;

const rootEl = ref(null);
const avatarEl = ref(null);
const dropTarget = ref(null);

const enabled = ref(props.account.get('enabled'));
const vcard = ref(props.account.get('vcard'));
const image = ref(props.account.cached_image);
const colorScheme = ref(props.account.settings.get('color'));
const encryptionWarning = ref(false);

const jid = computed(() => props.account.get('jid'));

const hasNickname = computed(() => {
    let vc = vcard.value;
    if (!vc) return false;
    return !!(vc.nickname || vc.fullname || vc.first_name || vc.last_name);
});

const displayName = computed(() => {
    let vc = vcard.value;
    if (vc) {
        if (vc.nickname) return vc.nickname;
        if (vc.first_name && vc.last_name) return vc.first_name + ' ' + vc.last_name;
        if (vc.fullname) return vc.fullname;
        if (vc.first_name || vc.last_name) return (vc.first_name || '') + ' ' + (vc.last_name || '');
    }
    return props.account.get('jid');
});

function updateAvatar() {
    image.value = props.account.cached_image;
    nextTick(() => {
        if (avatarEl.value) {
            $(avatarEl.value).setAvatar(image.value, constants.AVATAR_SIZES.SETTINGS_ACCOUNT_ITEM);
        }
    });
}

function updateEnabled() {
    enabled.value = props.account.get('enabled');
}

function updateNickname() {
    vcard.value = props.account.get('vcard');
}

function updateColorScheme() {
    colorScheme.value = props.account.settings.get('color');
}

function updateEncryptionWarning() {
    if (!props.account || !props.account.omemo) return;
    props.account.omemo.checkOwnFingerprints().then((is_trusted) => {
        encryptionWarning.value = (is_trusted === 'none' || is_trusted === 'error');
    });
}

function setEnabled(ev) {
    let val = ev.target.checked;
    props.account.save('enabled', val);
    val ? props.account.activate() : props.account.deactivate();
}

function showSettings(ev) {
    if (ev && $(ev.target).hasClass('drag-handle')) return;
    if (props.account.get('enabled')) {
        props.account.showSettingsModal();
    } else {
        utils.dialogs.ask_extended(
            xb.getString("settings_account__enable_account_label"),
            xb.getString("settings_account__enable_account_text", [props.account.get('jid')]),
            { modal_class: 'modal-offline-account', no_dialog_options: true },
            {
                ok_button_text: xb.getString("button_enable"),
                optional_button: 'delete-account',
                optional_button_text: xb.getString("settings_account__button_quit_account")
            }
        ).done((res) => {
            if (res) {
                if (res === 'delete-account') {
                    props.account._revoke_on_connect = $.Deferred();
                    let revoke_timeout = setTimeout(() => {
                        if (props.account.omemo)
                            props.account.omemo.destroy();
                        props.account._revoke_on_connect.resolve();
                    }, 5000);
                    props.account._revoke_on_connect.done(() => {
                        clearTimeout(revoke_timeout);
                        props.account._revoke_on_connect = undefined;
                        props.account.deleteAccount(null, true);
                    });
                    props.account.save('enabled', true);
                    props.account.activate();
                } else {
                    props.account.save('enabled', true);
                    props.account.activate();
                }
            }
        });
    }
}

function onDragTo(ev, drop_elem) {
    drop_elem && $(drop_elem).trigger('move_xmpp_account', props.account);
}

function onMoveAccount(ev, account) {
    props.account.collection.moveBefore(account, props.account);
}

onMounted(() => {
    updateAvatar();
    updateEncryptionWarning();

    props.account.on('change:enabled', updateEnabled);
    props.account.on('change:vcard', updateNickname);
    props.account.on('change:image', updateAvatar);
    props.account.on('trusting_updated', updateEncryptionWarning);
    props.account.settings.on('change:color', updateColorScheme);
    props.account.resources.on('change add destroy', updateEncryptionWarning);

    // Drag/drop: bind jQuery events on the root element
    $(rootEl.value).on('drag_to', onDragTo);
    $(dropTarget.value).on('move_xmpp_account', onMoveAccount);
});

onUnmounted(() => {
    props.account.off('change:enabled', updateEnabled);
    props.account.off('change:vcard', updateNickname);
    props.account.off('change:image', updateAvatar);
    props.account.off('trusting_updated', updateEncryptionWarning);
    props.account.settings.off('change:color', updateColorScheme);
    props.account.resources.off('change add destroy', updateEncryptionWarning);
});

defineExpose({ updateEnabled });
</script>
