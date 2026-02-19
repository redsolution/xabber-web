<template>
    <div class="vue-migrated">
        <div class="setting-name">{{ xb.getString("settings__section_contact_list__header_offline_contacts") }}</div>
        <div class="setting offline-contacts radio-button field-wrap">
            <div class="field radio-field clickable-field">
                <form action="#">
                    <p>
                        <input class="with-gap" name="offline-contacts" value="yes" type="radio" :id="uid + '-show'" />
                        <label :for="uid + '-show'">{{ xb.getString("settings__section_contact_list__offline_contacts__label_show") }}</label>
                    </p>
                    <p>
                        <input class="with-gap" name="offline-contacts" value="no" type="radio" :id="uid + '-hide'" />
                        <label :for="uid + '-hide'">{{ xb.getString("settings__section_contact_list__offline_contacts__label_hide") }}</label>
                    </p>
                </form>
            </div>
        </div>
        <div class="setting-name">{{ xb.getString("settings__section_contact_list__header_sorting") }}</div>
        <div class="setting sorting-contacts radio-button field-wrap">
            <div class="field radio-field clickable-field">
                <form action="#">
                    <p>
                        <input class="with-gap" name="sorting-contacts" value="online-first" type="radio" :id="uid + '-online-first'" />
                        <label :for="uid + '-online-first'">{{ xb.getString("settings__section_contact_list__sorting__label_online_first") }}</label>
                    </p>
                    <p>
                        <input class="with-gap" name="sorting-contacts" value="by-alphabet" type="radio" :id="uid + '-by-alphabet'" />
                        <label :for="uid + '-by-alphabet'">{{ xb.getString("settings__section_contact_list__sorting__label_alphabet") }}</label>
                    </p>
                </form>
            </div>
        </div>
    </div>
</template>

<script setup>
import { useXabber } from '../../composables/useXabber.js';

const xb = useXabber();

const props = defineProps({
    uid: {
        type: String,
        required: true,
    },
});

let backboneView = null;

function setBackboneView(view) {
    backboneView = view;
}

defineExpose({
    setBackboneView,
});
</script>
