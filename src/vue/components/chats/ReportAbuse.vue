<template>
    <div class="modal-content-wrap vue-migrated">
        <div class="modal-header">
            <span></span>
        </div>
        <div class="modal-content">
            <div class="report-introductory-text">
            </div>
            <div class="field checkbox-field">
                <form action="#">
                    <p>
                        <input class="filled-in" name="report-options" value="Spam or unsolicited advertising" type="checkbox" id="report-spam" />
                        <label for="report-spam">{{ xb.getString("report_abuse__spam_option") }}</label>
                    </p>
                    <p>
                        <input class="filled-in" name="report-options" value="Harassment or bullying" type="checkbox" id="report-harassment" />
                        <label for="report-harassment">{{ xb.getString("report_abuse__harassment_option") }}</label>
                    </p>
                    <p>
                        <input class="filled-in" name="report-options" value="Hate speech or discrimination" type="checkbox" id="report-hate" />
                        <label for="report-hate">{{ xb.getString("report_abuse__hate_option") }}</label>
                    </p>
                    <p>
                        <input class="filled-in" name="report-options" value="Threats or violence" type="checkbox" id="report-threats" />
                        <label for="report-threats">{{ xb.getString("report_abuse__threats_option") }}</label>
                    </p>
                    <p>
                        <input class="filled-in" name="report-options" value="Illegal content (e.g., drugs, weapons)" type="checkbox" id="report-illegal" />
                        <label for="report-illegal">{{ xb.getString("report_abuse__illegal_option") }}</label>
                    </p>
                    <p>
                        <input class="filled-in" name="report-options" value="Misinformation or scams" type="checkbox" id="report-scam" />
                        <label for="report-scam">{{ xb.getString("report_abuse__scam_option") }}</label>
                    </p>
                    <p>
                        <input class="filled-in" name="report-options" value="Inappropriate or explicit material" type="checkbox" id="report-inappropriate" />
                        <label for="report-inappropriate">{{ xb.getString("report_abuse__inappropriate_option") }}</label>
                    </p>
                    <p>
                        <input class="filled-in" name="report-options" value="Other - " type="checkbox" id="report-other" />
                        <label for="report-other">{{ xb.getString("report_abuse__other_option") }}</label>
                    </p>
                </form>
                <textarea
                        class="text-field textarea-glow input-glow account-glow"
                        type="text" cols="5" rows="3"
                        id="report-other-text"
                        name="report-other-text"
                ></textarea>
            </div>
        </div>
        <div class="modal-footer">
            <button class="btn-flat btn-main btn-proceed text-color-500">{{ xb.getString("report_abuse__submit") }}</button>
            <button class="btn-flat btn-main btn-dark btn-cancel">{{ xb.getString("cancel") }}</button>
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
