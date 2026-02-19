<template>
    <div class="account-item-wrap" :data-jid="jid">
        <div class="name one-line">{{ jid }}</div>
    </div>
</template>

<script setup>
defineProps({
    jid: { type: String, required: true }
});
</script>
