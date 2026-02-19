<template>
    <div class="edit-wrap vue-migrated">
        <div class="edit-header block-header">
            <i class="details-icon btn-back mdi mdi-24px mdi-arrow-left"></i>
            <span class="block-name">{{ xb.getString("edit_vcard") }}</span>
        </div>
        <div class="edit-contact">
            <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('account-outline')"></svg></div>
            <div class="name-wrap"></div>
        </div>
        <div class="subscription-statuses">
            <div class="status-out subscription-status-wrap dropdown-button" :data-activates="uid + '-status-out'">
                <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('subscription-to')"></svg></div>
                <div class="info">
                    <div class="value dotted-underline one-line"></div>
                </div>
            </div>
            <div :id="uid + '-status-out'" class="status-out-dropdown unified-dropdown-style dropdown-content noselect">
                <div class="btn-request property-variant hidden">
                    <div class="one-line">{{ xb.getString("contact_subscription_request_subscription") }}</div>
                </div>
                <div class="btn-cancel-request property-variant hidden">
                    <div class="one-line">{{ xb.getString("contact_subscription_cancel_request_subscription") }}</div>
                </div>
                <div class="btn-cancel-subscription-out property-variant hidden">
                    <div class="one-line">{{ xb.getString("contact_subscription_cancel_subscribe") }}</div>
                </div>
            </div>
            <div class="status-in subscription-status-wrap dropdown-button" :data-activates="uid + '-status-in'">
                <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('subscription-from')"></svg></div>
                <div class="info">
                    <div class="value dotted-underline one-line"></div>
                </div>
            </div>
            <div :id="uid + '-status-in'" class="unified-dropdown-style status-in-dropdown dropdown-content noselect">
                <div class="btn-allow property-variant hidden">
                    <div class="one-line">{{ xb.getString("contact_subscription_allow_subscription") }}</div>
                </div>
                <div class="btn-allow-request property-variant hidden">
                    <div class="one-line">{{ xb.getString("contact_subscription_allow_subscription") }}</div>
                </div>
                <div class="btn-disallow-request property-variant hidden">
                    <div class="one-line">{{ xb.getString("decline") }}</div>
                </div>
                <div class="btn-disallow-preapproved property-variant hidden">
                    <div class="one-line">{{ xb.getString("contact_subscription_disallow_subscription") }}</div>
                </div>
                <div class="btn-cancel-subscription-in property-variant hidden">
                    <div class="one-line">{{ xb.getString("contact_subscription_cancel_subscription") }}</div>
                </div>
            </div>
            <div class="status-description subscription-status-wrap">
                <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('information-outline')"></svg></div>
                <div class="info">
                    <div class="value"></div>
                </div>
            </div>
        </div>
        <div class="edit-buttons">
            <div class="edit-button btn-delete">
                <div class="details-icon-wrap"><i class="details-icon mdi mdi-24px mdi-delete text-color-500"></i></div>
                <div class="edit-button-text ">
                    <span class="text-color-500 dotted-underline text-decoration-color-300 one-line">{{ xb.getString("contact_delete_full") }}</span>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { useXabber } from '../../composables/useXabber.js';

const xb = useXabber();

const uid = 'ce-' + Math.random().toString(36).substr(2, 9);

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
    uid,
});
</script>
