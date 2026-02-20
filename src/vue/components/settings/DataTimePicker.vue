<template>
    <div class="datepicker-container vue-migrated">
        <div class="date-picker-header-wrap no-select">
            <div class="date-picker-header">{{ xb.getString("datepicker_modal__header_text") }}</div>
            <div class="date-picker-final-date"></div>
        </div>
        <div class="date-picker-wrap no-select">
            <div class="datepicker-header">
                <button class="btn-flat btn-main btn-dark btn-prev-month" data-action="prev">
                    <i class="mdi mdi-24px mdi-chevron-left"></i>
                </button>
                <h3></h3>
                <button class="btn-flat btn-main btn-dark btn-next-month" data-action="next">
                    <i class="mdi mdi-24px mdi-chevron-right"></i>
                </button>
            </div>
            <div class="dates-container"></div>
        </div>
        <div class="time-picker-wrap no-select">
            <div class="timepicker-section">
                <div class="timepicker-header">
                    <h4>{{ xb.getString("datepicker_modal__choose_time") }}</h4>
                </div>
                <div class="time-input-section">
                    <div class="time-input-controls">
                        <i class="btn-add-hour mdi mdi-24px mdi-chevron-up btn-main"></i>
                        <i class="btn-add-minute mdi mdi-24px mdi-chevron-up btn-main"></i>
                        <i class="btn-minus-hour mdi mdi-24px mdi-chevron-down btn-main"></i>
                        <i class="btn-minus-minute mdi mdi-24px mdi-chevron-down btn-main"></i>
                    </div>
                    <div class="time-input-wrapper">
                        <input type="text"
                               class="time-input"
                               value="12:00"
                               readonly>
                    </div>
                </div>
                <div class="timeline-container">
                    <div class="timeline">
                    </div>
                    <div class="current-time ground-color-500 hidden"></div>
                </div>
            </div>
        </div>
        <div class="picker-actions">
            <button class="btn-flat btn-main btn-dark btn-cancel">{{ xb.getString("cancel") }}</button>
            <button class="btn-flat btn-main btn-dark btn-today">{{ xb.getString("today") }}</button>
            <button class="btn-flat btn-main btn-apply text-color-500">{{ xb.getString("dialog_circle_settings__button_apply") }}</button>
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
