<template>
    <div class="panel-content-wrap noselect vue-migrated">
        <div class="main-info">
            <div class="circle-avatar"></div>
            <div class="text-info">
                <div class="name-wrap one-line"></div>
                <div class="jid one-line"></div>
            </div>
        </div>

        <div class="panel-content">
            <div class="msg-wrap"><p class="msg-text"></p></div>
            <div class="panel-footer noselect">
                <div class="buttons-wrap">
                    <button class="btn-join btn-flat btn-main">{{ xb.getString("groupchat_join") }}</button>
                    <button class="btn-decline btn-flat btn-main">{{ xb.getString("groupchat_decline") }}</button>
                    <button class="btn-block btn-flat btn-main">{{ xb.getString("groupchat_block") }}</button>
                </div>
            </div>
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
