<template>
    <div class="modal-content-wrap vue-migrated">
        <div class="modal-header">
            <span>Two-Factor Authentication</span>
        </div>

        <!-- Status / loading state -->
        <div class="modal-content tfa-status-state" v-if="state === 'loading'">
            <div class="tfa-loading">Checking 2FA status...</div>
        </div>

        <!-- 2FA is disabled, offer to enable -->
        <div class="modal-content tfa-disabled-state" v-if="state === 'disabled'">
            <div class="tfa-info">
                <p>Two-factor authentication adds an extra layer of security to your account.
                   When enabled, you will need to enter a code from your authenticator app
                   each time you log in with a password.</p>
            </div>
        </div>

        <!-- 2FA setup: show secret + QR URI -->
        <div class="modal-content tfa-setup-state" v-if="state === 'setup'">
            <div class="tfa-info">
                <p>Scan this code with your authenticator app (Google Authenticator, Aegis, etc.),
                   or enter the secret key manually:</p>
            </div>
            <div class="tfa-secret-wrap">
                <div class="tfa-secret-label">Secret key:</div>
                <div class="tfa-secret-value">{{ secret }}</div>
            </div>
            <div class="tfa-qr-wrap" v-if="qrDataUrl">
                <img :src="qrDataUrl" class="tfa-qr-image" alt="QR Code">
            </div>
            <div class="tfa-confirm-wrap">
                <div class="block-subheader">
                    <span class="block-name">Enter the 6-digit code from your app to confirm:</span>
                </div>
                <div class="tfa-confirm-field">
                    <input class="input-glow account-glow tfa-confirm-input" placeholder="000000"
                           type="text" name="tfa_confirm_code" maxlength="6"
                           inputmode="numeric" autocomplete="one-time-code">
                    <span class="errors fixed"></span>
                </div>
            </div>
        </div>

        <!-- 2FA is enabled -->
        <div class="modal-content tfa-enabled-state" v-if="state === 'enabled'">
            <div class="tfa-info tfa-enabled-info">
                <svg class="mdi mdi-24px mdi-svg-template tfa-enabled-icon" v-html="svgContent('security')"></svg>
                <span>Two-factor authentication is <strong>enabled</strong> on this account.</span>
            </div>
        </div>

        <!-- Success state after enabling -->
        <div class="modal-content tfa-success-state" v-if="state === 'success'">
            <div class="tfa-info tfa-success-info">
                <p>Two-factor authentication has been successfully enabled.</p>
            </div>
        </div>

        <!-- Error state -->
        <div class="modal-content tfa-error-state" v-if="errorMsg">
            <div class="tfa-error">{{ errorMsg }}</div>
        </div>

        <!-- Footer buttons -->
        <div class="modal-footer">
            <button v-if="state === 'disabled'" class="btn-flat btn-main btn-enable-tfa">Enable 2FA</button>
            <button v-if="state === 'setup'" class="btn-flat btn-main btn-confirm-tfa">Confirm</button>
            <button v-if="state === 'enabled'" class="btn-flat btn-main btn-dark btn-disable-tfa">Disable 2FA</button>
            <button class="btn-flat btn-main btn-dark btn-cancel">{{ state === 'success' ? 'OK' : 'Cancel' }}</button>
        </div>
    </div>
</template>

<script setup>
import { ref } from 'vue';
import { useXabber } from '../../composables/useXabber.js';

const xb = useXabber();

const state = ref('loading');   // loading | disabled | setup | enabled | success
const secret = ref('');
const uri = ref('');
const qrDataUrl = ref('');
const errorMsg = ref('');

function svgContent(name) {
    let tmpl = xb.env.templates.svg[name];
    return tmpl ? tmpl() : '';
}

function setState(s) { state.value = s; }
function setSecret(s) { secret.value = s; }
function setUri(u) { uri.value = u; }
function setQrDataUrl(url) { qrDataUrl.value = url; }
function setError(msg) { errorMsg.value = msg; }
function clearError() { errorMsg.value = ''; }

let backboneView = null;
function setBackboneView(view) { backboneView = view; }

defineExpose({
    setBackboneView,
    setState,
    setSecret,
    setUri,
    setQrDataUrl,
    setError,
    clearError,
    svgContent,
});
</script>
