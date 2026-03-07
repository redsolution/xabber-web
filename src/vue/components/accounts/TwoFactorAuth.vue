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

        <!-- 2FA setup: show QR + secret + confirm -->
        <div class="modal-content tfa-setup-state" v-if="state === 'setup'">
            <div class="tfa-info">
                <p>Scan the QR code with your authenticator app (Google Authenticator, Aegis, etc.):</p>
            </div>
            <div class="tfa-qr-wrap" ref="qrContainer"></div>
            <div class="tfa-secret-wrap">
                <div class="tfa-secret-label">Or enter this key manually:</div>
                <div class="tfa-secret-value" @click="copySecret" :title="copied ? 'Copied!' : 'Click to copy'">
                    <span class="tfa-secret-text">{{ formattedSecret }}</span>
                    <svg class="tfa-copy-icon mdi mdi-18px mdi-svg-template" v-html="svgContent('copy')"></svg>
                </div>
                <div class="tfa-copied-msg" v-if="copied">Copied to clipboard!</div>
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
import { ref, computed, nextTick } from 'vue';
import { useXabber } from '../../composables/useXabber.js';
import VanillaQR from 'VanillaQR';

const xb = useXabber();

const state = ref('loading');   // loading | disabled | setup | enabled | success
const secret = ref('');
const uri = ref('');
const errorMsg = ref('');
const copied = ref(false);
const qrContainer = ref(null);

const formattedSecret = computed(() => {
    // Format in groups of 4 for readability: JBSW Y3DP EHPK 3PXP
    return secret.value.replace(/(.{4})/g, '$1 ').trim();
});

function svgContent(name) {
    let tmpl = xb.env.templates.svg[name];
    return tmpl ? tmpl() : '';
}

function setState(s) { state.value = s; }
function setSecret(s) { secret.value = s; }
function setUri(u) {
    uri.value = u;
    nextTick(() => generateQR(u));
}
function setError(msg) { errorMsg.value = msg; }
function clearError() { errorMsg.value = ''; }

function generateQR(otpauthUri) {
    if (!qrContainer.value || !otpauthUri) return;
    qrContainer.value.innerHTML = '';
    try {
        let qr = new VanillaQR({
            url: otpauthUri,
            noBorder: true,
            colorDark: '#333333',
            colorLight: '#ffffff',
            size: 200,
        });
        qrContainer.value.appendChild(qr.domElement);
    } catch (e) {
        console.error('[2FA] QR generation failed:', e);
    }
}

function copySecret() {
    if (!secret.value) return;
    navigator.clipboard.writeText(secret.value).then(() => {
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 2000);
    }).catch(() => {
        // Fallback for older browsers
        let ta = document.createElement('textarea');
        ta.value = secret.value;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        copied.value = true;
        setTimeout(() => { copied.value = false; }, 2000);
    });
}

let backboneView = null;
function setBackboneView(view) { backboneView = view; }

defineExpose({
    setBackboneView,
    setState,
    setSecret,
    setUri,
    setError,
    clearError,
    svgContent,
});
</script>
