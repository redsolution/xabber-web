<template>
    <div class="existing-chat-wrap" :data-name="name" :data-jid="jid" @click="$emit('select', { name, jid })">
        <div :class="'account-indicator ground-color-' + color + '-500'"></div>
        <div class="circle-avatar" ref="avatarEl">
            <img>
        </div>
        <div class="existing-chat-item">
            <div class="name one-line">{{ name }}</div>
            <div class="jid one-line">{{ jid }}</div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';

const props = defineProps({
    name: { type: String, required: true },
    jid: { type: String, required: true },
    color: { type: String, default: '' },
    avatarImg: { type: String, default: '' }
});

defineEmits(['select']);

const avatarEl = ref(null);

onMounted(() => {
    if (avatarEl.value && props.avatarImg) {
        $(avatarEl.value).setAvatar(props.avatarImg, 32);
    }
});
</script>
