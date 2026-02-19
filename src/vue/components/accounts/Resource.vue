<template>
    <div class="vue-migrated">
        <svg class="details-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('ic-jabber')"></svg>
        <table>
            <tbody>
            <tr class="info status-info">
                <td class="label">{{ xb.getString("settings_account__label_status") }}:</td>
                <td>
                    <div class="value status-message"></div>
                    <div class="status"></div>
                </td>
            </tr>
            <tr class="info client-info">
                <td class="label">{{ xb.getString("settings_account__label_client") }}:</td>
                <td class="value client"></td>
            </tr>
            <tr class="info resource-info">
                <td class="label">{{ xb.getString("account_resource") }}:</td>
                <td class="value resource"></td>
            </tr>
            <tr class="info priority-info">
                <td class="label">{{ xb.getString("account_priority") }}:</td>
                <td class="value priority"></td>
            </tr>
            </tbody>
        </table>
    </div>
</template>

<script setup>
import { useXabber } from '../../composables/useXabber.js';

const xb = useXabber();

function svgContent(name) {
    let tmpl = xb.env.templates.svg[name];
    return tmpl ? tmpl() : '';
}

let backboneView = null;

function setBackboneView(view) {
    backboneView = view;
}

defineExpose({
    setBackboneView,
    svgContent,
});
</script>
