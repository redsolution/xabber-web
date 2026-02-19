<template>
    <div v-if="chat">
        <div class="block-header">
            <span class="block-name">{{ xb.getString("searching__chat_properties__header") }}</span>
        </div>
        <div class="chat-properties-wrap selectable-text">
            <div class="info-wrap jid-info-wrap">
                <SvgIcon name="xmpp" class="details-icon mdi-24px" />
                <div class="info jabber-id">
                    <div class="value one-line">{{ chat.jid }}</div>
                    <div class="label">{{ xb.getString("group_settings__properties__label_jid") }}</div>
                </div>
            </div>
            <div class="info-wrap name-info-wrap">
                <i class="details-icon mdi mdi-24px mdi-account-box-outline"></i>
                <div class="info name">
                    <div class="value one-line">{{ chat.name }}</div>
                    <div class="label">{{ xb.getString("groupchat_name") }}</div>
                </div>
            </div>
            <div class="info-wrap description-info-wrap">
                <i class="details-icon mdi mdi-24px mdi-file-document-box"></i>
                <div class="info description">
                    <div class="value one-line">{{ chat.description }}</div>
                    <div class="label">{{ xb.getString("groupchat_description") }}</div>
                </div>
            </div>
            <div class="info-wrap anonymous-info-wrap">
                <i class="details-icon mdi mdi-24px mdi-comment-question-outline"></i>
                <div class="info anonymous">
                    <div class="value one-line">{{ chat.privacy }}</div>
                    <div class="label">{{ xb.getString("groupchat_privacy_type_incognito") }}</div>
                </div>
            </div>
            <div class="info-wrap model-info-wrap">
                <i class="details-icon mdi mdi-24px mdi-lock-open-outline"></i>
                <div class="info model">
                    <div class="value one-line">{{ chat.membership }}</div>
                    <div class="label">{{ xb.getString("groupchat_membership") }}</div>
                </div>
            </div>
        </div>
        <button class="btn-join-chat btn-flat btn-main btn-dark ground-color-100 hover-ground-color-300"
                @click="joinChat">
            {{ xb.getString("groupchat_join") }}
        </button>
    </div>
</template>

<script setup>
import { useXabber } from '../../composables/useXabber.js';
import SvgIcon from '../SvgIcon.vue';

const props = defineProps({
    chat: { type: Object, default: null },
    account: { type: Object, default: null }
});

const emit = defineEmits(['joined']);

const xb = useXabber();

function joinChat() {
    if (!props.account || !props.chat) return;
    let contact = props.account.contacts.mergeContact(props.chat.jid);
    contact.set('group_chat', true);
    contact.acceptRequest();
    contact.pushInRoster(null, () => {
        contact.askRequest();
        contact.getMyInfo();
    });
    contact.trigger("open_chat", contact);
    emit('joined');
}
</script>
