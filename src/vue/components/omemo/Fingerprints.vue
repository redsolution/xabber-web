<template>
    <div class="fingerprints-list-wrap vue-migrated">
        <div class="modal-header fingerprints-header">
            <i class="btn-back-settings mdi mdi-24px mdi-arrow-left"></i>
            <div class="header"></div>
            <div class="buttons-wrap">
                <button class="btn-revoke-trust btn-flat btn-main text-color-500 hover-ground-color-grey-300 hidden">{{ xb.getString("trust_session__revoke_all") }}</button>
            </div>
        </div>
        <div class="fingerprints-content-wrap">
            <div class="fingerprints-unverified-warning hidden">
                <svg class="device-encryption-icon mdi mdi-40px" v-html="svgContent('alert')"></svg>
                <div class="device-encryption-warning-name one-line">{{ xb.getString("fingerprints__encryption_warning_header") }}</div>
                <div class="device-encryption-warning-label">
                    {{ xb.getString("fingerprints__encryption_warning_text") }}
                </div>
                <div class="btn-verify btn-flat btn-main-filled">
                    {{ xb.getString("trust_session__start_verification") }}
                </div>
            </div>
            <div class="fingerprints-active-trust-session">
            </div>
            <div class="fingerprints-list-content">
            </div>
            <div class="fingerprints-tips-wrap">
                <div class="fingerprints-tip">{{ xb.getString("settings_account__trust_tip_verified") }}</div>
                <div class="fingerprints-tip">{{ xb.getString("settings_account__trust_tip_fingerprint") }}</div>
                <div class="fingerprints-tip">{{ xb.getString("settings_account__trust_tip_linked") }}</div>
                <div class="fingerprints-tip">{{ xb.getString("settings_account__trust_tip_untrusted") }}</div>
            </div>
        </div>
    </div>
    <div class="fingerprint-details-wrap fingerprints-devices-wrap hidden vue-migrated">
        <div class="modal-header fingerprints-header">
            <i class="btn-back-to-details mdi mdi-24px mdi-arrow-left"></i>
        </div>
        <div class="fingerprints-content">
            <div class="contact-device-content">

            </div>
            <div class="contact-own-device-content">

            </div>
        </div>
        <div class="fingerprints-bottom">
            <div class="fingerprints-help-text">
                {{ xb.getString("omemo__dialog_fingerprints__bottom_help_text") }}
            </div>
        </div>
    </div>
    <div class="fingerprint-details-whole-wrap hidden vue-migrated">
        <div class="modal-header fingerprints-header">
            <i class="btn-back mdi mdi-24px mdi-arrow-left"></i>
            <div class="fingerprint-details-whole-header one-line"></div>
        </div>
        <div class="fingerprint-details-items-wrap fingerprint-details-encryption">
            <div class="fingerprint-details-item fingerprint-details-client">
                <svg class="mdi fingerprint-details-icon mdi-24px" v-html="svgContent('id')"></svg>
                <div class="fingerprint-details-label">{{ xb.getString("device__info__client__label") }}</div>
                <div class="fingerprint-details-text"></div>
            </div>
            <div class="fingerprint-details-item fingerprint-details-device-id">
                <svg class="mdi fingerprint-details-icon mdi-24px" v-html="svgContent('information')"></svg>
                <div class="fingerprint-details-label">{{ xb.getString("settings_account__device_information_device_id") }}</div>
                <div class="fingerprint-details-text"></div>
            </div>
            <div class="fingerprint-details-item fingerprint-details-fingerprint">
                <svg class="mdi fingerprint-details-icon mdi-24px" v-html="svgContent('lock')"></svg>
                <div class="fingerprint-details-label">{{ xb.getString("omemo__dialog_fingerprints__fingerprint_label") }}</div>
                <div class="fingerprint-details-text fingerprint-details-fingerprint-text"></div>
            </div>
            <div class="fingerprint-details-item fingerprint-details-trust-reason">
                <svg class="mdi fingerprint-details-icon mdi-24px" v-html="svgContent('lock')"></svg>
                <div class="fingerprint-details-label">{{ xb.getString("settings_account__trust__trust_reason_label") }}</div>
                <div class="fingerprint-details-text fingerprint-details-fingerprint-text"></div>
            </div>
        </div>
        <div class="btn-fingerprint-details-identify fingerprint-details-btn">
            <div class="setting-icon-background">
                <svg class="mdi fingerprint-details-icon mdi-24px lock-alert" v-html="svgContent('lock-alert')"></svg>
                <svg class="mdi fingerprint-details-icon mdi-24px lock-check" v-html="svgContent('lock-check')"></svg>
                <svg class="mdi fingerprint-details-icon mdi-24px lock-cross" v-html="svgContent('lock-cross')"></svg>
                <svg class="mdi fingerprint-details-icon mdi-24px lock-question" v-html="svgContent('lock-question')"></svg>
            </div>
            <div class="fingerprint-details-btn-name">{{ xb.getString("settings_account__identity_verification") }}</div>
        </div>
    </div>
</template>

<script setup>
import { useXabber } from '../../composables/useXabber.js';

const xb = useXabber();

function svgContent(name) {
    const svgTemplates = xb.env.templates.svg;
    if (svgTemplates && svgTemplates[name]) {
        return svgTemplates[name]();
    }
    return '';
}

let backboneView = null;

function setBackboneView(view) {
    backboneView = view;
}

defineExpose({
    setBackboneView,
});
</script>
