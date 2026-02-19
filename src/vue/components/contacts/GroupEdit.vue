<template>
    <div class="edit-wrap vue-migrated">
        <div class="edit-save-preloader preloader-wrap">
            <div class="preloader-wrapper preloader-17px visible">
                <div class="spinner-layer">
                    <div class="circle-clipper left">
                        <div class="circle"></div>
                    </div>
                    <div class="gap-patch">
                        <div class="circle"></div>
                    </div>
                    <div class="circle-clipper right">
                        <div class="circle"></div>
                    </div>
                </div>
            </div>
        </div>
        <div class="edit-header main-edit-header block-header">
            <i class="details-icon btn-back mdi mdi-24px mdi-arrow-right"></i>
            <span class="block-name"></span>
            <button class="btn-save btn-flat text-color-500 btn-main fade-out">{{ xb.getString("save") }}</button>
        </div>
        <div class="edit-group-wrap">
            <div class="description-edit-wrap">
                <div class="main-info">
                    <div class="avatar-wrap">
                        <div class="circle-avatar dropdown-button" :data-activates="uid + '-group-image'">
                            <input class="hidden" :title="xb.getString('groupchat_member_edit_change_avatar')" type="file"/>
                            <svg class="set-groupchat-avatar" viewBox="0 0 24 24">
                                <path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z" />
                            </svg>
                        </div>
                        <div :id="uid + '-group-image'" class="profile-image-dropdown unified-dropdown-style dropdown-content noselect">
                            <div class="btn-emoji-panel property-variant">
                                {{ xb.getString("account_emoji_profile_image_button") }}
                            </div>
                            <div class="btn-selfie property-variant">
                                {{ xb.getString("account_webcam_profile_image_button") }}
                            </div>
                            <div class="btn-choose-image property-variant">
                                {{ xb.getString("account_profile_image_button") }}
                            </div>
                        </div>
                    </div>
                </div>
                <div class="edit-group">
                    <div class="edit-group-name-wrap"></div>
                    <div class="edit-group-description-wrap"></div>
                </div>
            </div>
            <div class="edit-properties">
                <div class="group-property membership-property">
                    <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('membership-outline')"></svg></div>
                    <div class="group-property-text">
                        {{ xb.getString("groupchat_membership") }}
                        <span></span>
                    </div>
                </div>
                <div class="group-property index-property hidden2">
                    <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('index')"></svg></div>
                    <div class="group-property-text">
                        {{ xb.getString("groupchat_index") }}
                        <span></span>
                    </div>
                </div>
                <div class="edit-button btn-default-restrictions">
                    <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('restrictions-outline')"></svg></div>
                    <div class="edit-button-text">
                        <span class="one-line">{{ xb.getString("groupchat_member_permissions") }}</span>
                        <span class="edit-button-value"></span>
                    </div>
                </div>
            </div>
            <div class="membership-property-edit-wrap hidden">
                <div class="edit-header property-header block-header">
                    <i class="details-icon btn-property-back btn-back mdi mdi-24px mdi-arrow-right"></i>
                    <span class="block-name">{{ xb.getString("groupchat_membership") }}</span>
                    <span class="block-name second-text fade-out"></span>
                    <button class="btn-save btn-flat text-color-500 btn-main fade-out">{{ xb.getString("save") }}</button>
                </div>
                <div class="property-wrap membership-field">
                    <div class="property-radio">
                        <input id="open" name="membership-property-input" type="radio" class="with-gap" required="">
                        <label class="property-label" for="open">{{ xb.getString("groupchat_membership_type_open") }}</label>
                    </div>
                    <div class="property-radio">
                        <input id="private_membership" name="membership-property-input" type="radio" class="with-gap" required="">
                        <label class="property-label" for="private_membership">{{ xb.getString("groupchat_membership_type_members_only") }}</label>
                    </div>
                </div>
                <div class="property-description">{{ xb.getString("groupchat_membership_description") }}</div>
            </div>
            <div class="index-property-edit-wrap hidden">
                <div class="edit-header property-header block-header">
                    <i class="details-icon btn-property-back btn-back mdi mdi-24px mdi-arrow-right"></i>
                    <span class="block-name">{{ xb.getString("groupchat_index") }}</span>
                    <span class="block-name second-text fade-out"></span>
                    <button class="btn-save btn-flat text-color-500 btn-main fade-out">{{ xb.getString("save") }}</button>
                </div>
                <div class="property-wrap index-field">
                    <div class="property-radio">
                        <input id="none" name="index-property-input" type="radio" class="with-gap" required="">
                        <label class="property-label" for="none">{{ xb.getString("groupchat_index_type_none") }}</label>
                    </div>
                    <div class="property-radio">
                        <input id="local" name="index-property-input" type="radio" class="with-gap" required="">
                        <label class="property-label" for="local">{{ xb.getString("groupchat_index_type_local") }}</label>
                    </div>
                    <div class="property-radio">
                        <input id="global" name="index-property-input" type="radio" class="with-gap" required="">
                        <label class="property-label" for="global">{{ xb.getString("groupchat_index_type_global") }}</label>
                    </div>
                </div>
                <div class="property-description">{{ xb.getString("groupchat_index_description") }}</div>
            </div>
            <div class="bottom-block edit-bottom-block">
                <div class="edit-pictured-buttons">
                    <div data-value="invitations" class="list-variant invitations-variant">
                        <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('invite-outline')"></svg></div>
                        <div class="variant-text">{{ xb.getString("groupchat_invitations") }}<span class="counted"></span></div>
                    </div>
                    <div data-value="blocked" class="list-variant blocked-variant">
                        <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('cancel')"></svg></div>
                        <div class="variant-text">{{ xb.getString("group_settings__block_list__header") }}<span class="counted"></span></div>
                    </div>
                </div>
                <i class="details-icon participants-edit-back btn-back-panel mdi mdi-24px mdi-arrow-right"></i>
                <span class="block-name-panel"></span>
                <span class="block-name-panel second-text fade-out">{{ xb.getString("groupchat_selected") }} <span></span></span>
                <div class="btn-add-block">
                    <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('blocked-add')"></svg>
                </div>
                <i class="mdi mdi-24px mdi-account-multiple-plus btn-invite"></i>
                <button class="btn-remove-selected btn-flat btn-main fade-out">{{ xb.getString("groupchat_revoke") }}</button>
                <div class="block-wrap participants-edit-wrap"></div>
            </div>
            <div class="edit-buttons">
                <div class="edit-button btn-clear-history-chat">
                    <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('history')"></svg></div>
                    <div class="edit-button-text">
                        <span class="one-line">{{ xb.getString("clear_history") }}</span>
                    </div>
                </div>
                <div class="edit-button btn-delete-group">
                    <div class="details-icon-wrap"><i class="details-icon mdi mdi-24px mdi-delete text-color-500"></i></div>
                    <div class="edit-button-text">
                        <span class="text-color-500 one-line text-decoration-color-300">{{ xb.getString("group_settings__button_delete_group") }}</span>
                    </div>
                </div>
            </div>
        </div>
        <div class="subscription-statuses subscription-statuses-group">
            <div class="status-out subscription-status-wrap dropdown-button" :data-activates="uid + '-status-out'">
                <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" v-html="svgContent('subscription-to')"></svg></div>
                <div class="info">
                    <div class="value one-line"></div>
                </div>
            </div>
            <div :id="uid + '-status-out'" class="unified-dropdown-style status-out-dropdown dropdown-content noselect">
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
                    <div class="value one-line"></div>
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
