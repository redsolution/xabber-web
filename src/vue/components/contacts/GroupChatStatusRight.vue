<template>
    <div class="vue-migrated">
        <div class="group-chat-status-wrap" :title="xb.getString('group_settings__properties__tooltip_click_to_set_status')" @click="setStatus">
            <div class="details-icon-wrap">
                <SvgIcon name="status-outline" class="details-icon" />
            </div>
            <div class="group-chat-status-border">
                <div class="group-chat-status">
                    <div class="status-wrap">
                        <div class="status-message dotted-underline">{{ statusMsg }}</div>
                        <div class="status status-bulb" :data-status="statusValue"
                             :class="[iconName && !isInvitation ? '' : 'hidden', iconClass]"
                             v-html="iconHtml"></div>
                    </div>
                    <div class="label">{{ xb.getString("groupchat_status") }}</div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useXabber } from '../../composables/useXabber.js';
import SvgIcon from '../SvgIcon.vue';

const props = defineProps({
    model: { type: Object, required: true }
});

const xb = useXabber();
const env = xb.env;

const groupInfo = ref(props.model.get('group_info') || {});
const status = ref(props.model.get('status') || '');
const isInvitation = ref(!!props.model.get('invitation'));

const statusMsg = computed(() => groupInfo.value.status_msg || '');
const statusValue = computed(() => groupInfo.value.status || status.value);

const iconName = computed(() => props.model.getIcon());
const iconClass = computed(() => {
    let name = iconName.value;
    if (!name) return '';
    return (name === 'server' || name === 'blocked') ? name : name;
});
const iconHtml = computed(() => {
    let name = iconName.value;
    if (!name || isInvitation.value) return '';
    return env.templates.svg[name] ? env.templates.svg[name]() : '';
});

function render() {
    groupInfo.value = props.model.get('group_info') || {};
    status.value = props.model.get('status') || '';
    isInvitation.value = !!props.model.get('invitation');
}

function setStatus() {
    let set_status_view = new xb.SetGroupchatStatusView();
    set_status_view.open(props.model);
}

onMounted(() => {
    render();
    props.model.on('change:status', render);
    props.model.on('group_info_updated', render);
});

onUnmounted(() => {
    props.model.off('change:status', render);
    props.model.off('group_info_updated', render);
});

defineExpose({ render });
</script>
