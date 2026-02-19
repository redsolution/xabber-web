<template>
    <!-- Multi-account overlay -->
    <div v-if="!singleMode" class="background-overlay" @click="closeSettings"></div>

    <div :class="singleMode ? '' : 'settings-panel'">
        <div :class="singleMode ? '' : 'settings-transition-wrap'">

            <!-- LEFT COLUMN -->
            <div class="left-column settings-column noselect vue-in-progress" ref="leftColumn">
                <div class="settings-account-head">
                    <div class="settings-account-head-background"></div>

                    <!-- Back button (multi) or Add Account (single) -->
                    <i v-if="!singleMode" class="btn-back mdi mdi-24px mdi-arrow-left" @click="showSettings"></i>
                    <svg v-else class="btn-add-account mdi mdi-24px mdi-svg-template"
                         @click="showAddAccount" v-html="svgContent('contact-add')"></svg>

                    <div class="name one-line">{{ accountName }}</div>

                    <!-- Color picker dropdown -->
                    <svg class="btn-color-picker dropdown-button mdi mdi-24px mdi-svg-template"
                         :data-activates="uid + '-color-picker'" v-html="svgContent('palette')"></svg>
                    <ul :id="uid + '-color-picker'"
                        class="dropdown-content color-picker-dropdown unified-dropdown-style noselect">
                        <div v-for="color in colorOptions" :key="color.value"
                             class="property-variant color-picker-button"
                             :data-color-value="color.value"
                             @click="changeColor">
                            <span class="one-line" :class="'text-color-' + color.value + '-700'">{{ color.label }}</span>
                        </div>
                    </ul>

                    <!-- QR code button -->
                    <svg class="btn-qr-code settings-tab mdi mdi-24px mdi-svg-template"
                         data-block-name="qr-code" @click="jumpToBlock"
                         v-html="svgContent('qrcode')"></svg>

                    <!-- Enable toggle -->
                    <div class="field clickable-field enabled-state switch normal">
                        <label class="field-value">
                            <input type="checkbox" :checked="enabled" @change="setEnabled">
                            <span class="lever"></span>
                        </label>
                    </div>
                </div>

                <!-- Main info wrap -->
                <div class="main-info-wrap account-main-info-wrap" ref="mainInfoWrap">
                    <div class="picture-wrap">
                        <div class="avatar-wrap">
                            <div class="circle-avatar dropdown-button"
                                 :data-activates="uid + '-profile-image'" ref="avatarEl">
                                <img/>
                                <input type="file" @change="changeAvatar"/>
                                <ul :id="uid + '-profile-image'"
                                    class="profile-image-dropdown unified-dropdown-style dropdown-content noselect">
                                    <div class="btn-emoji-panel property-variant" @click="openEmojiPanel">
                                        {{ xb.getString("account_emoji_profile_image_button") }}
                                    </div>
                                    <div class="btn-selfie property-variant" @click="openWebcamPanel">
                                        {{ xb.getString("account_webcam_profile_image_button") }}
                                    </div>
                                    <div class="btn-choose-image property-variant" @click="chooseAvatar">
                                        {{ xb.getString("account_profile_image_button") }}
                                    </div>
                                </ul>
                                <svg class="set-groupchat-avatar" viewBox="0 0 24 24">
                                    <path d="M4,4H7L9,2H15L17,4H20A2,2 0 0,1 22,6V18A2,2 0 0,1 20,20H4A2,2 0 0,1 2,18V6A2,2 0 0,1 4,4M12,7A5,5 0 0,0 7,12A5,5 0 0,0 12,17A5,5 0 0,0 17,12A5,5 0 0,0 12,7M12,9A3,3 0 0,1 15,12A3,3 0 0,1 12,15A3,3 0 0,1 9,12A3,3 0 0,1 12,9Z" />
                                </svg>
                            </div>
                        </div>
                    </div>
                    <div class="name one-line">{{ accountName }}</div>
                    <div class="jid one-line" @click="copyJIDToClipboard">{{ accountJid }}</div>
                    <div class="btn-manage-xabber-account settings-tab"
                         data-block-name="xabber-account-frame-tab" @click="jumpToBlock">
                        {{ xb.getString("settings_account__xabber_account_frame") }}
                    </div>
                </div>

                <!-- Settings tabs -->
                <div class="settings-tabs-wrap">
                    <div class="settings-tab vue-in-progress" data-block-name="profile" @click="jumpToBlock">
                        <div class="setting-icon-background">
                            <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('account')"></svg>
                        </div>
                        <div class="settings-block-name one-line">{{ xb.getString("settings_account__section_header_profile") }}</div>
                        <div class="settings-block-label one-line">{{ xb.getString("settings_account__profile_label") }}</div>
                    </div>
                    <div class="settings-tab vue-in-progress" data-block-name="media-gallery" @click="jumpToBlock">
                        <div class="setting-icon-background">
                            <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('cloud')"></svg>
                        </div>
                        <div class="settings-block-name one-line">{{ xb.getString("account_cloud_storage") }}</div>
                        <div class="settings-block-label one-line">{{ xb.getString("placeholder_loading") }}</div>
                    </div>
                    <div class="settings-tab vue-in-progress" data-block-name="encryption" @click="jumpToBlock">
                        <div class="setting-icon-background">
                            <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('key')"></svg>
                        </div>
                        <div class="settings-block-name one-line">{{ xb.getString("settings_account__encryption") }}</div>
                        <div class="settings-block-label hidden label-encryption-enabled one-line">{{ xb.getString("settings_account__encryption_enabled_label") }}</div>
                        <div class="settings-block-label label-encryption-disabled one-line">{{ xb.getString("settings_account__encryption_disabled_label") }}</div>
                    </div>
                    <div class="settings-tab vue-in-progress" data-block-name="trust" @click="jumpToBlock">
                        <div class="setting-icon-background">
                            <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('account-check')"></svg>
                        </div>
                        <div class="settings-block-name one-line">{{ xb.getString("settings_account__trust") }}</div>
                        <div class="settings-block-label one-line">{{ xb.getString("settings_account__settings_account__trust_label") }}</div>
                        <div class="contact-device-encryption hidden">
                            <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('alert')"></svg>
                            <svg class="mdi mdi-24px mdi-svg-template fill-color-red-500 contact-error-icon" v-html="svgContent('alert-circle')"></svg>
                        </div>
                    </div>
                    <!-- Devices tab (single mode only) -->
                    <div v-if="singleMode" class="settings-tab vue-in-progress" data-block-name="devices" @click="jumpToBlock">
                        <div class="setting-icon-background">
                            <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('devices')"></svg>
                        </div>
                        <div class="settings-block-name one-line">{{ xb.getString("settings_account__devices_subheader") }}</div>
                        <div class="settings-block-label one-line">{{ xb.getString("placeholder_loading") }}</div>
                        <div class="device-encryption hidden one-line">
                            <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('alert')"></svg>
                            <svg class="mdi mdi-24px mdi-svg-template error-icon" v-html="svgContent('alert-circle')"></svg>
                        </div>
                    </div>
                </div>

                <!-- Devices section in left column (multi-account only) -->
                <template v-if="!singleMode">
                    <div class="devices-load-wrap">
                        <div class="preloader-wrapper preloader-20px active">
                            <div class="spinner-layer">
                                <div class="circle-clipper left"><div class="circle"></div></div>
                                <div class="gap-patch"><div class="circle"></div></div>
                                <div class="circle-clipper right"><div class="circle"></div></div>
                            </div>
                        </div>
                    </div>
                    <div class="devices-wrap hidden">
                        <div class="tokens-wrap">
                            <div class="settings-panel-label">{{ xb.getString("settings_account__label_this_device") }}</div>
                            <div class="current-token-wrap">
                                <div class="sessions-wrap current-session selectable-text"></div>
                                <div class="btn-revoke-all-tokens settings-button-devices" @click="revokeAllXTokens">
                                    <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('restrictions-outline')"></svg>
                                    <div class="settings-button-devices-label">{{ xb.getString("account_terminate_all_sessions") }}</div>
                                </div>
                            </div>
                            <div class="settings-panel-label active-sessions-label">{{ xb.getString("settings_account__label_active_sessions") }}</div>
                            <div class="device-encryption-warning hidden" data-not-trusted-count="0">
                                <svg class="device-encryption-icon mdi mdi-40px mdi-svg-template error-icon" v-html="svgContent('alert-circle')"></svg>
                                <svg class="device-encryption-icon mdi mdi-40px mdi-svg-template" v-html="svgContent('alert')"></svg>
                                <div class="device-encryption-warning-name one-line">{{ xb.getString("settings_account__encryption_warning_header") }}</div>
                                <div class="device-encryption-warning-label"></div>
                                <div class="btn-verify-devices settings-button-devices btn-flat btn-main-filled" @click="verifyDevices">
                                    {{ xb.getString("account_verify_devices") }}
                                </div>
                            </div>
                            <div class="active-trust-session-wrap"></div>
                            <div class="all-sessions-wrap">
                                <div class="sessions-wrap all-sessions selectable-text"></div>
                            </div>
                            <div class="orphaned-fingerprints hidden">
                                <div class="orphaned-fingerprints-label">{{ xb.getString("omemo__dialog_fingerprints__legacy_encryption_label") }}</div>
                                <div class="orphaned-fingerprints-wrap selectable-text"></div>
                            </div>
                        </div>
                    </div>

                    <!-- Delete account button -->
                    <div class="settings-tabs-wrap">
                        <div class="settings-tab settings-deletion-button delete-account vue-in-progress" @click="deleteAccount">
                            <div class="setting-icon-background">
                                <i class="mdi mdi-24px mdi-logout-variant"></i>
                            </div>
                            <div class="settings-block-name">{{ xb.getString("settings_account__button_quit_account") }}</div>
                        </div>
                    </div>
                </template>
            </div>

            <!-- RIGHT COLUMN -->
            <div class="right-column settings-column noselect hidden vue-in-progress" ref="rightColumn">
                <div class="settings-panel-head">
                    <i class="btn-back-settings mdi mdi-24px mdi-arrow-left" @click="backToMenu"></i>
                    <i class="btn-back-subsettings-account mdi mdi-24px mdi-arrow-left hidden" @click="backToSubMenu"></i>
                    <span class="settings-panel-head-title one-line">{{ xb.getString("account_editor") }}</span>

                    <i class="btn-sorting dropdown-button mdi mdi-24px mdi-sort hidden"
                       :data-activates="uid + '-storage-sorting'"></i>
                    <ul :id="uid + '-storage-sorting'" class="dropdown-content unified-dropdown-style noselect">
                        <div class="property-variant btn-gallery-sorting" data-value="-id" @click="sortFiles">
                            <span class="one-line">{{ xb.getString("account_media_gallery_sorting_new") }}</span>
                        </div>
                        <div class="property-variant btn-gallery-sorting" data-value="-size" @click="sortFiles">
                            <span class="one-line">{{ xb.getString("account_media_gallery_sorting_size") }}</span>
                        </div>
                    </ul>

                    <div class="btn-more media-gallery-button dropdown-button hidden"
                         :data-activates="uid + '-storage-actions'">
                        <i class="mdi mdi-24px mdi-dots-vertical"></i>
                    </div>
                    <ul :id="uid + '-storage-actions'" class="dropdown-content unified-dropdown-style noselect">
                        <div class="property-variant btn-select-files hidden" @click="enableFilesSelect">
                            <span class="one-line">{{ xb.getString("account_select_files") }}</span>
                        </div>
                    </ul>
                </div>

                <div class="panel-content-wrap">
                    <div class="panel-content details-panel">

                        <!-- Devices block (single mode - first in right column) -->
                        <div v-if="singleMode"
                             :data-header="xb.getString('settings_account__devices_subheader')"
                             class="settings-block-wrap devices vue-in-progress">
                            <div class="devices-load-wrap">
                                <div class="preloader-wrapper preloader-20px active">
                                    <div class="spinner-layer">
                                        <div class="circle-clipper left"><div class="circle"></div></div>
                                        <div class="gap-patch"><div class="circle"></div></div>
                                        <div class="circle-clipper right"><div class="circle"></div></div>
                                    </div>
                                </div>
                            </div>
                            <div class="devices-wrap hidden">
                                <div class="tokens-wrap">
                                    <div class="settings-panel-label">{{ xb.getString("settings_account__label_this_device") }}</div>
                                    <div class="current-token-wrap">
                                        <div class="sessions-wrap current-session selectable-text"></div>
                                        <div class="btn-revoke-all-tokens settings-button-devices" @click="revokeAllXTokens">
                                            <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('restrictions-outline')"></svg>
                                            <div class="settings-button-devices-label">{{ xb.getString("account_terminate_all_sessions") }}</div>
                                        </div>
                                    </div>
                                    <div class="settings-panel-label active-sessions-label">{{ xb.getString("settings_account__label_active_sessions") }}</div>
                                    <div class="device-encryption-warning hidden" data-not-trusted-count="0">
                                        <svg class="device-encryption-icon mdi mdi-40px mdi-svg-template error-icon" v-html="svgContent('alert-circle')"></svg>
                                        <svg class="device-encryption-icon mdi mdi-40px mdi-svg-template" v-html="svgContent('alert')"></svg>
                                        <div class="device-encryption-warning-name one-line">{{ xb.getString("settings_account__encryption_warning_header") }}</div>
                                        <div class="device-encryption-warning-label"></div>
                                        <div class="btn-verify-devices settings-button-devices btn-flat btn-main-filled" @click="verifyDevices">
                                            {{ xb.getString("account_verify_devices") }}
                                        </div>
                                    </div>
                                    <div class="active-trust-session-wrap"></div>
                                    <div class="all-sessions-wrap">
                                        <div class="sessions-wrap all-sessions selectable-text"></div>
                                    </div>
                                    <div class="orphaned-fingerprints hidden">
                                        <div class="orphaned-fingerprints-label">{{ xb.getString("omemo__dialog_fingerprints__legacy_encryption_label") }}</div>
                                        <div class="orphaned-fingerprints-wrap selectable-text"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Profile block (sub-tabs menu) -->
                        <div :data-header="xb.getString('settings_account__section_header_profile')"
                             class="settings-block-wrap profile vue-in-progress">
                            <div class="settings-tabs-wrap">
                                <div class="settings-tab settings-non-tab" data-subblock-parent-name="profile"
                                     data-block-name="status" @click="openChangeStatus">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('status')"></svg>
                                    </div>
                                    <div class="settings-block-name one-line">{{ xb.getString("settings_account__status_subheader") }}</div>
                                    <div class="settings-block-label one-line"></div>
                                </div>
                                <div class="settings-tab" data-subblock-parent-name="profile"
                                     data-block-name="vcard-tab" @click="jumpToBlock">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('account')"></svg>
                                    </div>
                                    <div class="settings-block-name one-line">{{ xb.getString("settings_account__edit_profile") }}</div>
                                    <div class="settings-block-label one-line">{{ xb.getString("settings_account__edit_profile_label") }}</div>
                                </div>
                                <div class="settings-tab" data-subblock-parent-name="profile"
                                     data-block-name="password" @click="jumpToBlock">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('key')"></svg>
                                    </div>
                                    <div class="settings-block-name one-line">{{ xb.getString("settings_account__password_subheader") }}</div>
                                    <div class="settings-block-label one-line">{{ xb.getString("settings_account__password_subheader_label") }}</div>
                                </div>
                                <div class="settings-tab" data-subblock-parent-name="profile"
                                     data-block-name="blocklist" @click="jumpToBlock">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('cancel')"></svg>
                                    </div>
                                    <div class="settings-block-name one-line">{{ xb.getString("block_list") }}</div>
                                    <div class="settings-block-label one-line"></div>
                                </div>
                                <div class="settings-tab" data-subblock-parent-name="profile"
                                     data-block-name="circles-groups" @click="jumpToBlock">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('circles-outline')"></svg>
                                    </div>
                                    <div class="settings-block-name one-line">{{ xb.getString("settings_account__section_header_circles") }}</div>
                                    <div class="settings-block-label one-line"></div>
                                </div>
                                <div class="settings-tab" data-subblock-parent-name="profile"
                                     data-block-name="capabitilies" @click="jumpToBlock">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('information')"></svg>
                                    </div>
                                    <div class="settings-block-name one-line">{{ xb.getString("settings_account__capabilities_subheader") }}</div>
                                    <div class="settings-block-label one-line">{{ xb.getString("settings_account__capabilities_subheader_label") }}</div>
                                </div>
                                <div class="settings-tab unregister-account settings-deletion-button settings-non-tab"
                                     data-subblock-parent-name="profile" data-block-name="delete-account"
                                     @click="unregisterAccount">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('trash')"></svg>
                                    </div>
                                    <div class="settings-block-name settings-block-name-single one-line">{{ xb.getString("settings_account__delete_account_subheader") }}</div>
                                </div>
                            </div>
                        </div>

                        <!-- Status block -->
                        <div :data-header="xb.getString('settings_account__status_subheader')"
                             class="settings-block-wrap status vue-in-progress">
                            <div class="settings-subblock-wrap">
                                <div class="status-wrap setting"></div>
                                <div class="status"></div>
                            </div>
                        </div>

                        <!-- VCard block -->
                        <div :data-header="xb.getString('settings_account__edit_profile')"
                             class="settings-block-wrap vcard-tab vue-in-progress">
                            <div class="settings-subblock-wrap">
                                <div class="vcard"></div>
                            </div>
                        </div>

                        <!-- Xabber account frame block -->
                        <div :data-header="xb.getString('settings_account__xabber_account_frame')"
                             class="settings-block-wrap xabber-account-frame-tab vue-in-progress">
                            <div class="settings-subblock-wrap">
                                <div class="xabber-account-frame-wrap"></div>
                            </div>
                        </div>

                        <!-- Blocklist section -->
                        <div class="block-list-view-wrap">
                            <div :data-header="xb.getString('block_list')" data-parent-block="profile"
                                 class="settings-block-wrap blocklist vue-in-progress">
                                <div class="settings-subblock-wrap">
                                    <div class="blocklist-info">
                                        <div class="blocklist-wrap">
                                            <div class="buttons-wrap">
                                                <svg class="mdi mdi-24px mdi-svg-template btn-block"
                                                     @click="openBlockWindow" v-html="svgContent('blocked-add')"></svg>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="settings-tabs-wrap">
                                    <div class="settings-tab" data-subblock-parent-name="blocklist"
                                         data-block-name="blocklist-contacts" @click="jumpToBlock">
                                        <div class="setting-icon-background">
                                            <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('account-cancel')"></svg>
                                        </div>
                                        <div class="settings-block-name one-line">{{ xb.getString("settings_account__blocked_contacts") }}</div>
                                        <div class="settings-block-label one-line"></div>
                                    </div>
                                    <div class="settings-tab" data-subblock-parent-name="blocklist"
                                         data-block-name="blocklist-domains" @click="jumpToBlock">
                                        <div class="setting-icon-background">
                                            <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('web-cancel')"></svg>
                                        </div>
                                        <div class="settings-block-name one-line">{{ xb.getString("settings_account__blocked_domains") }}</div>
                                        <div class="settings-block-label one-line"></div>
                                    </div>
                                    <div class="settings-tab hidden" data-subblock-parent-name="blocklist"
                                         data-block-name="blocklist-invitations" @click="jumpToBlock">
                                        <div class="setting-icon-background">
                                            <svg class="mdi mdi-24px mdi-svg-template" v-html="svgContent('invite')"></svg>
                                        </div>
                                        <div class="settings-block-name one-line">{{ xb.getString("settings_account__blocked_invitations") }}</div>
                                        <div class="settings-block-label one-line"></div>
                                    </div>
                                </div>
                            </div>

                            <!-- Blocked contacts -->
                            <div :data-header="xb.getString('settings_account__blocked_contacts')"
                                 data-block-name="blocklist-contacts"
                                 class="settings-block-wrap blocklist-contacts vue-in-progress">
                                <div class="settings-subblock-wrap">
                                    <div class="blocklist-info">
                                        <div class="blocklist-wrap">
                                            <div class="buttons-wrap">
                                                <svg class="mdi mdi-24px mdi-svg-template btn-block"
                                                     @click="openBlockWindow" v-html="svgContent('blocked-add')"></svg>
                                                <button class="btn-deselect-blocked btn-flat btn-main hidden"
                                                        @click="deselectBlocked">{{ xb.getString("cancel") }}</button>
                                                <button class="btn-unblock-selected btn-flat btn-main text-color-500 hidden"
                                                        @click="unblockSelected">{{ xb.getString("unblock_selected") }}</button>
                                            </div>
                                            <div class="blocked-items">
                                                <div class="blocked-contacts-placeholder placeholder">{{ xb.getString("blocked_contacts_empty") }}</div>
                                                <div class="blocked-items-container blocked-contacts-wrap" data-tab-name="contacts-item">
                                                    <div class="blocked-contacts blocked-list"></div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <!-- Blocked domains -->
                            <div :data-header="xb.getString('settings_account__blocked_domains')"
                                 data-block-name="blocklist-domains"
                                 class="settings-block-wrap blocklist-domains vue-in-progress">
                                <div class="settings-subblock-wrap">
                                    <div class="blocklist-info">
                                        <div class="blocklist-wrap">
                                            <div class="buttons-wrap">
                                                <svg class="mdi mdi-24px mdi-svg-template btn-block"
                                                     @click="openBlockWindow" v-html="svgContent('blocked-add')"></svg>
                                                <button class="btn-deselect-blocked btn-flat btn-main hidden"
                                                        @click="deselectBlocked">{{ xb.getString("cancel") }}</button>
                                                <button class="btn-unblock-selected btn-flat btn-main text-color-500 hidden"
                                                        @click="unblockSelected">{{ xb.getString("unblock_selected") }}</button>
                                            </div>
                                            <div class="blocked-items">
                                                <div class="blocked-domains-placeholder placeholder">{{ xb.getString("blocked_domains_empty") }}</div>
                                            </div>
                                            <div class="blocked-items-container blocked-domains-wrap" data-tab-name="domains-item">
                                                <div class="blocked-domains blocked-list"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Blocked invitations -->
                        <div :data-header="xb.getString('settings_account__blocked_invitations')"
                             data-block-name="blocklist-invitations"
                             class="settings-block-wrap blocklist-invitations vue-in-progress">
                            <div class="settings-subblock-wrap">
                                <div class="blocklist-info">
                                    <div class="blocklist-wrap">
                                        <div class="buttons-wrap">
                                            <svg class="mdi mdi-24px mdi-svg-template btn-block"
                                                 @click="openBlockWindow" v-html="svgContent('blocked-add')"></svg>
                                            <button class="btn-deselect-blocked btn-flat btn-main hidden"
                                                    @click="deselectBlocked">{{ xb.getString("cancel") }}</button>
                                            <button class="btn-unblock-selected btn-flat btn-main text-color-500 hidden"
                                                    @click="unblockSelected">{{ xb.getString("unblock_selected") }}</button>
                                        </div>
                                        <div class="blocked-items">
                                            <div class="blocked-invitations-placeholder placeholder">{{ xb.getString("blocked_invitations_empty") }}</div>
                                            <div class="blocked-items-container blocked-invitations-wrap" data-tab-name="invitations-item">
                                                <div class="blocked-invitations blocked-list"></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Circles/Groups block -->
                        <div :data-header="xb.getString('settings_account__section_header_circles')"
                             class="settings-block-wrap circles-groups vue-in-progress">
                            <div class="settings-subblock-wrap">
                                <div class="groups-info">
                                    <div class="groups-wrap">
                                        <div class="groups"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Capabilities block -->
                        <div :data-header="xb.getString('settings_account__capabilities_subheader')"
                             class="settings-block-wrap capabitilies vue-in-progress">
                            <div class="settings-subblock-wrap">
                                <div class="server-info">
                                    <div class="capabilities-wrap">
                                        <div class="capabilities"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Color scheme block -->
                        <div :data-header="xb.getString('color')"
                             class="settings-block-wrap color-scheme vue-in-progress">
                            <div class="color-scheme-wrap">
                                <div class="account-color">
                                    <div class="field radio-field clickable-field">
                                        <form action="#">
                                            <p v-for="color in colorOptions" :key="'radio-' + color.value">
                                                <input class="with-gap" name="account_color"
                                                       :value="color.value" type="radio"
                                                       :id="uid + '-color-' + color.value" />
                                                <label :class="'text-color-' + color.value + '-700'"
                                                       :for="uid + '-color-' + color.value">{{ color.label }}</label>
                                            </p>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Encryption block -->
                        <div :data-header="xb.getString('settings_account__encryption')"
                             class="settings-block-wrap encryption vue-in-progress">
                            <div class="btn-more device-more-button dropdown-button"
                                 :data-activates="uid + '-device-omemo-actions'">
                                <i class="mdi mdi-24px mdi-dots-vertical"></i>
                            </div>
                            <ul :id="uid + '-device-omemo-actions'" class="dropdown-content unified-dropdown-style noselect">
                                <div class="property-variant btn-purge-keys" @click="purgeKeys">
                                    <span class="one-line">{{ xb.getString("omemo__settings__button_purge_keys") }}</span>
                                </div>
                            </ul>
                            <div class="omemo-settings-wrap">
                                <div class="settings">
                                    <div class="setting-wrap omemo-enable">
                                        <span>{{ xb.getString("omemo__settings__toggle_enable_encryption") }}</span>
                                        <div class="field setting-use-omemo switch normal">
                                            <label class="field-value">
                                                <input type="checkbox" @change="setEnabledOmemo">
                                                <span class="lever"></span>
                                            </label>
                                        </div>
                                    </div>
                                    <div class="setting-wrap send-chat-states">
                                        <span>{{ xb.getString("omemo__settings__toggle_send_typing_notifications") }}</span>
                                        <div class="field setting-send-chat-states switch normal">
                                            <label class="field-value">
                                                <input type="checkbox" @change="setTypingNotification">
                                                <span class="lever"></span>
                                            </label>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Trust block -->
                        <div :data-header="xb.getString('settings_account__trust')"
                             class="settings-block-wrap trust vue-in-progress">
                            <div class="settings-trust-wrap">
                                <div class="settings-trust-items-wrap"></div>
                            </div>
                        </div>

                        <!-- QR Code block -->
                        <div :data-header="xb.getString('dialog_show_qr_code__header')"
                             class="settings-block-wrap qr-code vue-in-progress">
                            <div class="qr-code-content-wrap">
                                <div class="qr-code-content">
                                    <div class="qr-code-canvas"></div>
                                    <div class="qr-code-text">
                                        <div class="qr-code-name"></div>
                                        <div class="qr-code-jid"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- Media gallery block -->
                        <div :data-header="xb.getString('account_cloud_storage')"
                             class="settings-block-wrap media-gallery vue-in-progress">
                        </div>

                        <!-- Device information block -->
                        <div :data-header="xb.getString('settings_account__device_information')"
                             class="settings-block-wrap device-information hidden vue-in-progress">
                            <div class="device-information-trust-text-wrap">
                                <div class="device-information-trust-text"></div>
                            </div>
                            <div class="device-information-refresh-bundle-debug hidden" @click="refreshBundle">
                                refresh bundle
                            </div>
                            <div class="device-information-wrap">
                                <div class="settings-panel-label device-information-security-label">{{ xb.getString("settings_account__device_information_private") }}</div>
                                <div class="device-information-items-wrap device-information-encryption">
                                    <div class="device-information-item device-information-client">
                                        <svg class="mdi device-information-icon mdi-24px mdi-svg-template" v-html="svgContent('id')"></svg>
                                        <div class="device-information-label">{{ xb.getString("device__info__client__label") }}</div>
                                        <div class="device-information-text"></div>
                                    </div>
                                    <div class="device-information-item device-information-ip">
                                        <svg class="mdi device-information-icon mdi-24px mdi-svg-template" v-html="svgContent('index')"></svg>
                                        <div class="device-information-label">{{ xb.getString("device__info__ip__label") }}</div>
                                        <div class="device-information-text"></div>
                                    </div>
                                    <div class="device-information-item device-information-expires">
                                        <svg class="mdi device-information-icon mdi-24px mdi-svg-template" v-html="svgContent('expires')"></svg>
                                        <div class="device-information-label">{{ xb.getString("device__info__expire__label") }}</div>
                                        <div class="device-information-text"></div>
                                    </div>
                                </div>
                                <div class="settings-panel-label">{{ xb.getString("settings_account__device_information") }}</div>
                                <div class="device-information-items-wrap device-information-basic">
                                    <div class="device-information-item device-information-status">
                                        <svg class="mdi device-information-icon mdi-24px mdi-svg-template" v-html="svgContent('status')"></svg>
                                        <div class="device-information-label">{{ xb.getString("device__info__status__label") }}</div>
                                        <div class="device-information-text"></div>
                                    </div>
                                    <div class="device-information-item device-information-last-seen">
                                        <svg class="mdi device-information-icon mdi-24px mdi-svg-template" v-html="svgContent('history')"></svg>
                                        <div class="device-information-label">{{ xb.getString("device__info__status__label_last_seen") }}</div>
                                        <div class="device-information-text"></div>
                                    </div>
                                    <div class="device-information-item device-information-description">
                                        <svg class="mdi device-information-icon mdi-24px mdi-svg-template" v-html="svgContent('devices')"></svg>
                                        <div class="device-information-label">{{ xb.getString("device__info__public_label__label") }}</div>
                                        <div class="device-information-text"></div>
                                    </div>
                                    <div class="device-information-item device-information-device-id">
                                        <svg class="mdi device-information-icon mdi-24px mdi-svg-template" v-html="svgContent('information')"></svg>
                                        <div class="device-information-label">{{ xb.getString("settings_account__device_information_device_id") }}</div>
                                        <div class="device-information-text"></div>
                                    </div>
                                    <div class="device-information-item device-information-fingerprint hidden">
                                        <svg class="mdi device-information-icon mdi-24px mdi-svg-template" v-html="svgContent('lock')"></svg>
                                        <div class="device-information-label">{{ xb.getString("omemo__dialog_fingerprints__fingerprint_label") }}</div>
                                        <div class="device-information-text device-information-fingerprint-text"></div>
                                    </div>
                                </div>
                                <div class="settings-tab device-information-trust settings-deletion-button" @click="openFingerprintDevice">
                                    <div class="setting-icon-background">
                                        <svg class="mdi device-information-icon mdi-24px mdi-svg-template lock-alert" v-html="svgContent('lock-alert')"></svg>
                                        <svg class="mdi device-information-icon mdi-24px mdi-svg-template lock-check" v-html="svgContent('lock-check')"></svg>
                                        <svg class="mdi device-information-icon mdi-24px mdi-svg-template lock-cross" v-html="svgContent('lock-cross')"></svg>
                                        <svg class="mdi device-information-icon mdi-24px mdi-svg-template lock-question" v-html="svgContent('lock-question')"></svg>
                                    </div>
                                    <div class="settings-block-name">{{ xb.getString("settings_account__identity_verification") }}</div>
                                </div>
                                <div class="settings-tab btn-revoke-token settings-deletion-button" @click="revokeXToken">
                                    <div class="setting-icon-background">
                                        <svg class="mdi device-information-icon mdi-24px mdi-svg-template" v-html="svgContent('trash')"></svg>
                                    </div>
                                    <div class="settings-block-name">{{ xb.getString("device__info__terminate_session__button") }}</div>
                                </div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>

        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useXabber } from '../../composables/useXabber.js';

const props = defineProps({
    model: { type: Object, required: true },
    singleMode: { type: Boolean, default: false }
});

const xb = useXabber();
const utils = xb.env.utils;

let backboneView = null;
const uid = 'acc-' + Math.random().toString(36).substr(2, 9);

// Reactive display state
const accountName = ref(props.model.get('name') || props.model.get('jid'));
const accountJid = ref(props.model.get('jid'));
const enabled = ref(props.model.get('enabled'));

// Color options
const colorOptions = [
    { value: 'red', key: 'account_color_name_red' },
    { value: 'pink', key: 'account_color_name_pink' },
    { value: 'purple', key: 'account_color_name_purple' },
    { value: 'deep-purple', key: 'account_color_name_deep_purple' },
    { value: 'indigo', key: 'account_color_name_indigo' },
    { value: 'blue', key: 'account_color_name_blue' },
    { value: 'light-blue', key: 'account_color_name_light_blue' },
    { value: 'cyan', key: 'account_color_name_cyan' },
    { value: 'teal', key: 'account_color_name_teal' },
    { value: 'green', key: 'account_color_name_green' },
    { value: 'light-green', key: 'account_color_name_light_green' },
    { value: 'lime', key: 'account_color_name_lime' },
    { value: 'amber', key: 'account_color_name_amber' },
    { value: 'orange', key: 'account_color_name_orange' },
    { value: 'deep-orange', key: 'account_color_name_deep_orange' },
    { value: 'brown', key: 'account_color_name_brown' },
    { value: 'blue-grey', key: 'account_color_name_blue_grey' },
].map(c => ({
    value: c.value,
    label: xb.getString(c.key).replace(/-/g, ' ')
}));

// SVG helper
function svgContent(name) {
    let tmpl = xb.env.templates.svg[name];
    return tmpl ? tmpl() : '';
}

// Event delegates - forward to Backbone view methods
function closeSettings() { backboneView?.closeSettings(); }
function showSettings() { backboneView?.showSettings(); }
function jumpToBlock(ev) { backboneView?.jumpToBlock(ev); }
function backToMenu(ev) { backboneView?.backToMenu(ev); }
function backToSubMenu(ev) { backboneView?.backToSubMenu(ev); }
function openChangeStatus() { backboneView?.openChangeStatus(); }
function deleteAccount() { backboneView?.deleteAccount(); }
function unregisterAccount() { backboneView?.unregisterAccount(); }
function setEnabled(ev) { backboneView?.setEnabled(ev); }
function changeAvatar(ev) { backboneView?.changeAvatar(ev); }
function chooseAvatar() { backboneView?.chooseAvatar(); }
function openEmojiPanel() { backboneView?.openEmojiPanel(); }
function openWebcamPanel() { backboneView?.openWebcamPanel(); }
function changeColor(ev) { backboneView?.changeColor(ev); }
function setEnabledOmemo(ev) { backboneView?.setEnabledOmemo(ev); }
function setTypingNotification(ev) { backboneView?.setTypingNotification(ev); }
function revokeAllXTokens() { backboneView?.revokeAllXTokens(); }
function verifyDevices() { backboneView?.verifyDevices(); }
function openBlockWindow() { backboneView?.openBlockWindow(); }
function deselectBlocked() { backboneView?.deselectBlocked(); }
function unblockSelected() { backboneView?.unblockSelected(); }
function sortFiles(ev) { backboneView?.sortFiles(ev); }
function enableFilesSelect() { backboneView?.enableFilesSelect(); }
function revokeXToken(ev) { backboneView?.revokeXToken(ev); }
function openFingerprintDevice(ev) { backboneView?.openFingerprintDevice(ev); }
function refreshBundle() { backboneView?.refreshBundle(); }
function purgeKeys() { backboneView?.purgeKeys(); }

function showAddAccount() {
    xb.trigger('add_account');
}

function copyJIDToClipboard() {
    utils.copyTextToClipboard(
        accountJid.value,
        xb.getString("toast__copied_in_clipboard"),
        xb.getString("toast__not_copied_in_clipboard")
    );
}

// Model change listeners
function updateName() {
    accountName.value = props.model.get('name') || props.model.get('jid');
    accountJid.value = props.model.get('jid');
}

function updateEnabled() {
    enabled.value = props.model.get('enabled');
}

function setBackboneView(view) {
    backboneView = view;
}

onMounted(() => {
    props.model.on('change:name', updateName);
    props.model.on('change:enabled', updateEnabled);
});

onUnmounted(() => {
    props.model.off('change:name', updateName);
    props.model.off('change:enabled', updateEnabled);
});

defineExpose({ setBackboneView, updateName, updateEnabled });
</script>
