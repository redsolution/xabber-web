<template>
    <div class="background-overlay" @click="closeSettings"></div>
    <div class="settings-panel vue-migrated" ref="psContainer">
        <div class="settings-transition-wrap">
            <!-- LEFT COLUMN: menu -->
            <div class="left-column main-left-column settings-column noselect" :class="{ hidden: showRight }">
                <svg class="btn-add-account mdi mdi-24px mdi-svg-template" data-svgname="contact-add"
                     :class="{ hidden: isSingleAccount }"
                     @click="showAddAccountView"
                     v-html="svgContent('contact-add')"></svg>

                <div class="single-account-info-wrap account-settings-panel"
                     :class="{ hidden: !isSingleAccount }">
                    <div class="single-account-info" ref="singleAccountInfo" v-once></div>
                </div>

                <div class="accounts-info-wrap" :class="{ hidden: isSingleAccount }" ref="accountsInfoWrap">
                    <SettingsAccountsBlock
                        v-if="accounts"
                        :accounts="accounts"
                        :parentView="backboneView"
                        ref="accountsBlock"
                    />
                </div>

                <div class="settings-tabs-wrap global-settings-tabs">
                    <div class="settings-panel-label">{{ xb.getString("preferences") }}</div>
                    <div class="settings-tab vue-migrated" data-block-name="background" @click="jumpToBlock">
                        <div class="setting-icon-background">
                            <svg class="mdi mdi-24px" v-html="svgContent('palette')"></svg>
                        </div>
                        <div class="settings-block-name one-line">{{ xb.getString("category_interface") }}</div>
                        <div class="settings-block-label one-line">{{ xb.getString("settings__menu_item__background_label") }}</div>
                    </div>
                    <div class="settings-tab vue-migrated" data-block-name="notifications" @click="jumpToBlock">
                        <div class="setting-icon-background">
                            <svg class="mdi mdi-24px" v-html="svgContent('client')"></svg>
                        </div>
                        <div class="settings-block-name one-line">{{ xb.getString("settings__menu_item__notifications") }}</div>
                        <div class="settings-block-label one-line">{{ xb.getString("settings__menu_item__notifications_label") }}</div>
                    </div>
                    <div class="settings-tab vue-migrated" data-block-name="privacy" @click="jumpToBlock">
                        <div class="setting-icon-background">
                            <svg class="mdi mdi-24px" v-html="svgContent('group-private')"></svg>
                        </div>
                        <div class="settings-block-name one-line">{{ xb.getString("settings__menu_item__privacy") }}</div>
                        <div class="settings-block-label one-line">{{ xb.getString("settings__menu_item__privacy_label") }}</div>
                    </div>
                    <div class="settings-tab vue-migrated" data-block-name="interface_language" @click="jumpToBlock">
                        <div class="setting-icon-background">
                            <svg class="mdi mdi-24px" v-html="svgContent('translate')"></svg>
                        </div>
                        <div class="settings-block-name one-line">{{ xb.getString("settings__menu_item__interface_language") }}</div>
                        <div class="settings-block-label one-line">{{ languageLabel }}</div>
                    </div>
                    <div class="settings-tab vue-migrated" data-block-name="debug" @click="jumpToBlock">
                        <div class="setting-icon-background">
                            <svg class="mdi mdi-24px" v-html="svgContent('bug')"></svg>
                        </div>
                        <div class="settings-block-name one-line">{{ xb.getString("settings__menu_item__debug") }}</div>
                        <div class="settings-block-label one-line">{{ xb.getString("settings__menu_item__debug_label") }}</div>
                    </div>
                    <div class="settings-tab vue-migrated" data-block-name="about" @click="jumpToBlock">
                        <div class="setting-icon-background">
                            <svg class="mdi mdi-24px" v-html="svgContent('id')"></svg>
                        </div>
                        <div class="settings-block-name one-line">{{ xb.getString("category_about") }}</div>
                        <div class="settings-block-label one-line">{{ xb.getString("settings__menu_item__about_label") }}</div>
                    </div>
                    <div class="settings-tab settings-deletion-button delete-all-accounts vue-migrated" @click="deleteAllAccounts">
                        <div class="setting-icon-background">
                            <i class="mdi mdi-24px mdi-logout-variant"></i>
                        </div>
                        <div class="settings-block-name">{{ xb.getString("settings__button_quit") }}</div>
                    </div>
                </div>
            </div>

            <!-- RIGHT COLUMN: settings content -->
            <div class="right-column main-right-column settings-column noselect" :class="{ hidden: !showRight }">
                <div class="settings-panel-head" :class="{ 'lined-head': scrolledDown }">
                    <i class="btn-back mdi mdi-24px mdi-arrow-left"
                       :class="{ hidden: showSubBack }"
                       @click="backToMenu"></i>
                    <i class="btn-back-subsettings mdi mdi-24px mdi-arrow-left"
                       :class="{ hidden: !showSubBack }"
                       @click="backToSubMenu"></i>
                    <span class="settings-panel-head-title">{{ currentHeader }}</span>
                    <div class="description" :class="{ hidden: activeBlock !== 'interface_language' }"
                         v-html="descriptionHtml"></div>
                </div>

                <div class="panel-content-wrap">
                    <div class="panel-content">

                        <!-- INTERFACE (sub-menu) -->
                        <div data-header="" class="settings-block-wrap vue-migrated background"
                             :class="{ hidden: activeBlock !== 'background' }">
                            <div class="settings-tabs-wrap global-settings-tabs">
                                <div class="settings-tab vue-migrated" data-block-name="appearance" data-subblock-parent-name="background" @click="jumpToBlock">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-24px" v-html="svgContent('palette')"></svg>
                                    </div>
                                    <div class="settings-block-name one-line">{{ xb.getString("settings__menu_item__appearance") }}</div>
                                    <div class="settings-block-label one-line">{{ xb.getString("settings_account__appearance_label") }}</div>
                                </div>
                                <div class="settings-tab vue-migrated" data-block-name="chats" data-subblock-parent-name="background" @click="jumpToBlock">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-24px" v-html="svgContent('chat')"></svg>
                                    </div>
                                    <div class="settings-block-name one-line">{{ xb.getString("chat_viewer") }}</div>
                                    <div class="settings-block-label one-line">{{ xb.getString("settings_account__chats_label") }}</div>
                                </div>
                                <div class="settings-tab vue-migrated" data-block-name="avatars" data-subblock-parent-name="background" @click="jumpToBlock">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-24px" v-html="svgContent('star-face')"></svg>
                                    </div>
                                    <div class="settings-block-name one-line">{{ xb.getString("avatars") }}</div>
                                    <div class="settings-block-label one-line">{{ avatarShapeLabel }}</div>
                                </div>
                                <div class="settings-tab vue-migrated" data-block-name="emoji_font" data-subblock-parent-name="background"
                                     :class="{ hidden: !hasEmojifonts }"
                                     @click="jumpToBlock">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-24px" v-html="svgContent('heart-circle')"></svg>
                                    </div>
                                    <div class="settings-block-name one-line">{{ xb.getString("settings__menu_item__emoji_font_header") }}</div>
                                    <div class="settings-block-label one-line">{{ emojiFontLabel }}</div>
                                </div>
                            </div>
                        </div>

                        <!-- APPEARANCE -->
                        <div :data-header="xb.getString('settings__menu_item__appearance')" class="settings-block-wrap vue-migrated appearance"
                             :class="{ hidden: activeBlock !== 'appearance' }">
                            <div class="settings-subblock-wrap">
                                <div class="block-subheader">
                                    <span class="block-name">{{ xb.getString("settings__section_appearance__header_main_color") }}</span>
                                </div>
                                <div class="toolbar-main-color-setting-wrap">
                                    <div class="setting toolbar-main-color-setting field-wrap">
                                        <div class="client-main-color-picker">
                                            <div class="colors-line" v-for="(line, idx) in mainColorLines" :key="idx">
                                                <div v-for="color in line" :key="color"
                                                     class="client-main-color-item"
                                                     :class="[`ground-color-${color}-500`, `outline-color-${color}-500`, { 'chosen-client-color': mainColor === color }]"
                                                     :data-value="color"
                                                     @click="chooseMainColor(color)">
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <div class="block-subheader">
                                    <span class="block-name">{{ xb.getString("settings__section_appearance__header_toolbar_icons_color") }}</span>
                                </div>
                                <div class="toolbar-color-setting-wrap">
                                    <div class="setting settings-color-padding toolbar-color-setting field-wrap">
                                        <div class="selected-color-wrap" @click="openColorPicker">
                                            <div class="selected-color-item" :style="{ backgroundColor: selectedColor }"></div>
                                            <div class="selected-color-info">
                                                <div class="selected-color-name">{{ selectedColorName }}</div>
                                                <div class="selected-color-hex">{{ selectedColor }}</div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                <template v-if="fontSizesList && fontSizesList.length">
                                    <div class="block-subheader settings-font-size-hidable">
                                        <span class="block-name">{{ xb.getString("chats_font_size") }}</span>
                                    </div>
                                    <div class="font-size-setting-wrap settings-font-size-hidable">
                                        <div class="setting settings-font-size radio-button field-wrap">
                                            <div class="field radio-field clickable-field">
                                                <form action="#">
                                                    <p v-for="item in fontSizesList" :key="item.type">
                                                        <input class="with-gap" name="font-size" :value="item.type" type="radio"
                                                               :id="uid + '-' + item.type + '-font-size'"
                                                               :checked="fontSize === item.type"
                                                               @change="setFontSize(item.type)" />
                                                        <label :for="uid + '-' + item.type + '-font-size'">{{ xb.getString('chats_font_size_' + item.type) }}</label>
                                                    </p>
                                                </form>
                                            </div>
                                        </div>
                                    </div>
                                </template>
                                <div class="block-subheader">
                                    <span class="block-name">{{ xb.getString("settings__section_appearance__header_background") }}</span>
                                </div>
                                <div class="background-setting-wrap">
                                    <div class="setting background radio-button field-wrap">
                                        <div class="field radio-field clickable-field">
                                            <form action="#">
                                                <p>
                                                    <input class="with-gap" name="background" value="default" type="radio"
                                                           :id="uid + '-default-background'"
                                                           :checked="backgroundType === 'default'"
                                                           @change="setBackground('default')" />
                                                    <label :for="uid + '-default-background'">{{ xb.getString("settings__section_appearance__background__label_default") }}</label>
                                                </p>
                                                <p>
                                                    <input class="with-gap" name="background" value="repeating-pattern" type="radio"
                                                           :id="uid + '-repeating-pattern-background'"
                                                           :checked="backgroundType === 'repeating-pattern'"
                                                           @change="setBackground('repeating-pattern')" />
                                                    <label :for="uid + '-repeating-pattern-background'">{{ xb.getString("settings__section_appearance__background__label_pattern") }}</label>
                                                </p>
                                                <p>
                                                    <input class="with-gap" name="background" value="image" type="radio"
                                                           :id="uid + '-image-background'"
                                                           :checked="backgroundType === 'image'"
                                                           @change="setBackground('image')" />
                                                    <label :for="uid + '-image-background'">{{ xb.getString("settings__section_appearance__background__label_image") }}</label>
                                                </p>
                                            </form>
                                        </div>
                                        <div class="current-background-wrap" :class="{ hidden: !backgroundImage }"
                                             @click="changeBackgroundImage">
                                            <div class="dark-placeholder">{{ xb.getString("settings__section_appearance__background__button_update") }}</div>
                                            <div class="current-background" :style="backgroundImage ? { backgroundImage: 'url(' + backgroundImage + ')' } : {}"></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="block-subheader">
                                    <span class="block-name">{{ xb.getString("settings__section_appearance__header_background_effects") }}</span>
                                </div>
                                <div class="background-setting-wrap">
                                    <div class="blur-setting-wrap">
                                        <div class="setting blur-setting checkbox-setting field-wrap">
                                            <div class="input-field checkbox-field">
                                                <input type="checkbox" class="filled-in" id="blur_switch"
                                                       :checked="blurSwitched"
                                                       @change="switchBlur" />
                                                <label for="blur_switch">{{ xb.getString("settings__section_appearance__background__checkbox_blur") }}</label>
                                            </div>
                                            <form class="range-form" action="#">
                                                <div class="disabled" :class="{ hidden: blurSwitched }"></div>
                                                <p class="range-field range-field-design">
                                                    <input type="range" id="blur" min="0" max="100"
                                                           :value="blurValue"
                                                           @change="changeBlur" />
                                                    <span class="thumb"><span class="value">{{ blurValue }}</span></span>
                                                </p>
                                            </form>
                                        </div>
                                    </div>
                                    <div class="vignetting-setting-wrap">
                                        <div class="setting vignetting-setting checkbox-setting field-wrap">
                                            <div class="input-field checkbox-field">
                                                <input type="checkbox" class="filled-in" id="vignetting_switch"
                                                       :checked="vignettingSwitched"
                                                       @change="switchVignetting" />
                                                <label for="vignetting_switch">{{ xb.getString("settings__section_appearance__background__checkbox_vignette") }}</label>
                                            </div>
                                            <form class="range-form" action="#">
                                                <div class="disabled" :class="{ hidden: vignettingSwitched }"></div>
                                                <p class="range-field range-field-design">
                                                    <input type="range" id="vignetting" min="0" max="200"
                                                           :value="vignettingValue"
                                                           @change="changeVignetting" />
                                                    <span class="thumb"><span class="value">{{ vignettingValue }}</span></span>
                                                </p>
                                            </form>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- CHATS (hotkeys + idling) -->
                        <div :data-header="xb.getString('chat_viewer')" class="settings-block-wrap vue-migrated chats"
                             :class="{ hidden: activeBlock !== 'chats' }">
                            <div class="settings-subblock-wrap">
                                <div class="block-subheader">
                                    <span class="block-name">{{ xb.getString("category_behavior") }}</span>
                                </div>
                                <div class="setting hotkeys radio-button field-wrap">
                                    <div class="field radio-field clickable-field">
                                        <form action="#">
                                            <p>
                                                <input class="with-gap" name="hotkeys" value="enter" type="radio"
                                                       :id="uid + '-enter'"
                                                       :checked="hotkeys === 'enter'"
                                                       @change="setHotkeys('enter')" />
                                                <label :for="uid + '-enter'">{{ xb.getString("settings__section_keyboard__label_send_on_enter") }}</label>
                                            </p>
                                            <p>
                                                <input class="with-gap" name="hotkeys" value="ctrlenter" type="radio"
                                                       :id="uid + '-ctrlenter'"
                                                       :checked="hotkeys === 'ctrlenter'"
                                                       @change="setHotkeys('ctrlenter')" />
                                                <label :for="uid + '-ctrlenter'">{{ xb.getString("settings__section_keyboard__label_send_on_ctrlenter") }}</label>
                                            </p>
                                        </form>
                                    </div>
                                </div>
                                <div class="block-subheader">
                                    <span class="block-name">{{ xb.getString("settings__menu_item__idle_timeout") }}</span>
                                </div>
                                <div class="setting idling checkbox-setting field-wrap">
                                    <div class="input-field checkbox-field">
                                        <input type="checkbox" class="filled-in" id="idling"
                                               :checked="idling"
                                               @change="setIdling" />
                                        <label for="idling">{{ xb.getString("settings__section_notifications__toggle_idling") }}</label>
                                    </div>
                                </div>
                                <div class="setting idling-time field-wrap">
                                    <div class="idling-time-input">
                                        <p class="range-field range-field-design">
                                            <input class="materialize-timer"
                                                   id="idle_timeout"
                                                   :min="constants.IDLING_MINIMAL_TIMEOUT"
                                                   :max="constants.IDLING_MAXIMUM_TIMEOUT"
                                                   :value="idlingTime"
                                                   :disabled="!idling"
                                                   type="range"
                                                   name="idle_timeout"
                                                   @change="setIdlingTimeout" />
                                            <span class="thumb"><span class="value">{{ idlingTime }}s</span></span>
                                        </p>
                                    </div>
                                </div>
                                <div class="setting-clue">{{ xb.getString("settings__menu_item__idle_timeout_clue") }}</div>
                            </div>
                        </div>

                        <!-- AVATARS -->
                        <div :data-header="xb.getString('avatars')" class="settings-block-wrap vue-migrated avatars"
                             :class="{ hidden: activeBlock !== 'avatars' }">
                            <div class="settings-subblock-wrap contact-list">
                                <div class="circle-avatar noselect"></div>
                                <div class="setting avatar-shape radio-button field-wrap">
                                    <div class="field radio-field clickable-field">
                                        <form action="#">
                                            <p v-for="shape in avatarShapes" :key="shape">
                                                <input class="with-gap" name="avatar_shape" :value="shape" type="radio"
                                                       :id="uid + '-' + shape"
                                                       :checked="avatarShape === shape"
                                                       @change="setAvatarShape(shape)" />
                                                <label :for="uid + '-' + shape">{{ xb.getString('settings__section_appearance__avatars_' + shape) }}</label>
                                            </p>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- EMOJI FONT -->
                        <div :data-header="xb.getString('settings__menu_item__emoji_font_header')" class="settings-block-wrap vue-migrated emoji_font"
                             :class="{ hidden: activeBlock !== 'emoji_font' }">
                            <div class="settings-subblock-wrap contact-list">
                                <div class="setting emoji-font radio-button">
                                    <div class="emoji-fonts-list field radio-field clickable-field">
                                        <form action="#">
                                            <div class="emoji-font-field">
                                                <input class="with-gap" name="emoji_font" value="system" type="radio"
                                                       :id="uid + '-emoji-font-system'"
                                                       :checked="emojiFont === 'system'"
                                                       :disabled="emojiFontsDisabled"
                                                       @change="changeEmojiFont('system')" />
                                                <label class="one-line" :for="uid + '-emoji-font-system'">{{ xb.getString("settings__menu_item__emoji_font_system") }}</label>
                                                <div class="emoji-hint">{{ xb.getString("settings__menu_item__emoji_font_system_label") }}</div>
                                            </div>
                                            <div class="emoji-font-field" v-for="item in sortedEmojiFonts" :key="item.value">
                                                <input class="with-gap" name="emoji_font" :value="item.value" type="radio"
                                                       :id="uid + '-emoji-font-' + item.value"
                                                       :checked="emojiFont === item.value"
                                                       :disabled="emojiFontsDisabled"
                                                       @change="changeEmojiFont(item.value)" />
                                                <label class="one-line" :for="uid + '-emoji-font-' + item.value">{{ item.name }}</label>
                                                <div class="emoji-hint" v-if="item.hint">{{ item.hint }}</div>
                                            </div>
                                        </form>
                                    </div>
                                </div>
                            </div>
                            <div class="emoji-font-information-wrap">
                                <div class="emojis-preview no-select" :class="{ hidden: emojiFontLoading }">
                                    <div class="emoji-preview">😀</div><div class="emoji-preview">😁</div>
                                    <div class="emoji-preview">😂</div><div class="emoji-preview">😋</div>
                                    <div class="emoji-preview">😎</div><div class="emoji-preview">😃</div>
                                    <div class="emoji-preview">😄</div>
                                    <div class="emoji-preview">🐱</div><div class="emoji-preview">🐭</div>
                                    <div class="emoji-preview">🐛</div><div class="emoji-preview">🕸</div>
                                    <div class="emoji-preview">🕷</div><div class="emoji-preview">🐢</div>
                                    <div class="emoji-preview">🐑</div>
                                    <div class="emoji-preview">🍏</div><div class="emoji-preview">🍜</div>
                                    <div class="emoji-preview">🍈</div><div class="emoji-preview">🍕</div>
                                    <div class="emoji-preview">🥢</div><div class="emoji-preview">🍰</div>
                                    <div class="emoji-preview">☕️</div>
                                    <div class="emoji-preview">🏋️‍♂️</div><div class="emoji-preview">🏏</div>
                                    <div class="emoji-preview">🏉</div><div class="emoji-preview">🥇</div>
                                    <div class="emoji-preview">🎬</div><div class="emoji-preview">⚽️</div>
                                    <div class="emoji-preview">🎸</div>
                                    <div class="emoji-preview">🚗</div><div class="emoji-preview">🏎</div>
                                    <div class="emoji-preview">🎡</div><div class="emoji-preview">⛴</div>
                                    <div class="emoji-preview">🏛</div><div class="emoji-preview">🏝</div>
                                    <div class="emoji-preview">🗿</div>
                                    <div class="emoji-preview">🖱</div><div class="emoji-preview">📡</div>
                                    <div class="emoji-preview">🎁</div><div class="emoji-preview">📬</div>
                                    <div class="emoji-preview">⏰</div><div class="emoji-preview">📹</div>
                                    <div class="emoji-preview">📱</div>
                                </div>
                                <div class="preloader-wrap" :class="{ hidden: !emojiFontLoading }">
                                    <div class="preloader-wrapper preloader-20px active">
                                        <div class="spinner-layer">
                                            <div class="circle-clipper left"><div class="circle"></div></div>
                                            <div class="gap-patch"><div class="circle"></div></div>
                                            <div class="circle-clipper right"><div class="circle"></div></div>
                                        </div>
                                    </div>
                                </div>
                                <div class="emoji-font-attribution-text" :class="{ hidden: !emojiFontAttribution }" v-html="emojiFontAttribution"></div>
                                <div class="emoji-font-external-url-text" :class="{ hidden: !showEmojiExternalUrl }">{{ xb.getString("settings__menu_item__emoji_font_external_url_text") }}</div>
                                <div class="emoji-font-not-supported-text" :class="[{ hidden: !showEmojiNotSupported, 'also-external': showEmojiExternalUrl && showEmojiNotSupported }]">{{ xb.getString("emoji_font__not_supported_firefox") }}</div>
                                <div class="emoji-font-download-text" :class="{ hidden: !emojiFontLoading }">{{ xb.getString("settings__menu_item__emoji_font_downloading_text") }}</div>
                                <div class="emoji-font-button-background emoji-font-external-url-button"
                                     :class="{ hidden: !showEmojiExternalButton }"
                                     @click="loadExternalEmojiFont">
                                    <svg class="mdi mdi-24px" v-html="svgContent('download')"></svg>
                                </div>
                            </div>
                        </div>

                        <!-- NOTIFICATIONS (sub-menu) -->
                        <div :data-header="xb.getString('settings__menu_item__notifications')" class="settings-block-wrap vue-migrated notifications"
                             :class="{ hidden: activeBlock !== 'notifications' }">
                            <div class="settings-tabs-wrap global-settings-tabs">
                                <div class="settings-tab vue-migrated" data-block-name="web-notifications" data-subblock-parent-name="notifications" @click="jumpToBlock">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-24px" v-html="svgContent('client')"></svg>
                                    </div>
                                    <div class="settings-block-name one-line">{{ xb.getString("settings__section_notifications__web_notifications") }}</div>
                                    <div class="settings-block-label one-line">{{ xb.getString("settings__section_notifications__web_notifications_label") }}</div>
                                    <div class="field notifications-lever clickable-field switch normal">
                                        <label class="field-value" @click.stop="setNotifications">
                                            <input type="checkbox" :checked="notifications">
                                            <span class="lever"></span>
                                        </label>
                                    </div>
                                </div>
                                <div class="settings-tab vue-migrated" data-block-name="chats-notifications" data-subblock-parent-name="notifications" @click="jumpToBlock">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-24px" v-html="svgContent('chat')"></svg>
                                    </div>
                                    <div class="settings-block-name one-line">{{ xb.getString("settings__section_notifications__private_chats") }}</div>
                                    <div class="settings-block-label capitalized one-line">{{ privateSoundLabel }}</div>
                                    <div class="field private-notifications clickable-field switch normal">
                                        <label class="field-value" @click.stop="setPrivateNotifications">
                                            <input type="checkbox" :checked="notificationsPrivate">
                                            <span class="lever"></span>
                                        </label>
                                    </div>
                                </div>
                                <div class="settings-tab settings-tab-big-icon" data-block-name="groupchats-notifications" data-subblock-parent-name="notifications" @click="jumpToBlock">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-32px" v-html="svgContent('group-public')"></svg>
                                    </div>
                                    <div class="settings-block-name one-line">{{ xb.getString("settings__section_notifications__group_chats") }}</div>
                                    <div class="settings-block-label capitalized one-line">{{ groupSoundLabel }}</div>
                                    <div class="field group-notifications clickable-field switch normal">
                                        <label class="field-value" @click.stop="setGroupNotifications">
                                            <input type="checkbox" :checked="notificationsGroup">
                                            <span class="lever"></span>
                                        </label>
                                    </div>
                                </div>
                                <div class="settings-tab vue-migrated" data-block-name="calls-notifications" data-subblock-parent-name="notifications" @click="jumpToBlock">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-24px" v-html="svgContent('call')"></svg>
                                    </div>
                                    <div class="settings-block-name one-line">{{ xb.getString("settings__section_notifications__calls") }}</div>
                                    <div class="settings-block-label capitalized one-line">{{ xb.getString("settings__section_notifications__calls_label") }}</div>
                                    <div class="field jingle-calls clickable-field switch normal">
                                        <label class="field-value" @click.stop="setJingleCalls">
                                            <input type="checkbox" :checked="jingleCalls">
                                            <span class="lever"></span>
                                        </label>
                                    </div>
                                </div>
                                <div class="settings-tab vue-migrated" data-block-name="attention-calls" data-subblock-parent-name="notifications" @click="jumpToBlock">
                                    <div class="setting-icon-background">
                                        <svg class="mdi mdi-24px" v-html="svgContent('alarm-bell')"></svg>
                                    </div>
                                    <div class="settings-block-name one-line">{{ xb.getString("settings__section_notifications__attention_calls") }}</div>
                                    <div class="settings-block-label capitalized one-line">{{ attentionSoundLabel }}</div>
                                    <div class="field call-attention clickable-field switch normal">
                                        <label class="field-value" @click.stop="setCallAttention">
                                            <input type="checkbox" :checked="callAttention">
                                            <span class="lever"></span>
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- WEB NOTIFICATIONS -->
                        <div :data-header="xb.getString('settings__section_notifications__web_notifications')" class="settings-block-wrap vue-migrated web-notifications"
                             :class="{ hidden: activeBlock !== 'web-notifications' }">
                            <div class="settings-subblock-wrap">
                                <div class="setting notifications checkbox-setting field-wrap">
                                    <div class="input-field checkbox-field">
                                        <input type="checkbox" class="filled-in" id="notifications"
                                               :checked="notifications"
                                               @change="setNotifications" />
                                        <label for="notifications">{{ xb.getString("settings__section_notifications__toggle_desktop_notifications") }}</label>
                                    </div>
                                </div>
                                <div class="setting-name volume-setting-name">{{ xb.getString("settings__section_notifications__volume") }}</div>
                                <div class="setting volume-setting">
                                    <form class="range-form" action="#">
                                        <div class="disabled hidden"></div>
                                        <p class="range-field range-field-design">
                                            <input type="range" id="notifications_volume" min="0" max="100"
                                                   :value="notificationsVolume"
                                                   @change="changeNotificationsVolume" />
                                            <span style="display: none" class="thumb"><span class="value"></span></span>
                                        </p>
                                    </form>
                                </div>
                            </div>
                        </div>

                        <!-- PRIVATE CHATS NOTIFICATIONS -->
                        <div :data-header="xb.getString('settings__section_notifications__private_chats')" class="settings-block-wrap vue-migrated chats-notifications"
                             :class="{ hidden: activeBlock !== 'chats-notifications' }">
                            <div class="settings-subblock-wrap">
                                <div class="setting message-preview checkbox-setting private-preview field-wrap">
                                    <div class="input-field notifications-dependant checkbox-field"
                                         :class="{ 'notifications-dependant-two-line': !notifications }">
                                        <input type="checkbox" class="filled-in" id="preview_private"
                                               :checked="messagePreviewPrivate"
                                               :disabled="!(notifications && cachedNotifications && notificationsPrivate)"
                                               @change="setPrivateMessagePreview" />
                                        <label for="preview_private">{{ xb.getString("settings__section_notifications__toggle_message_preview") }}</label>
                                        <div class="desktop-notifications-clue-wrap" :class="{ hidden: notifications }">
                                            {{ xb.getString("settings__section_notifications__desktop_notifications_clue") }}
                                        </div>
                                    </div>
                                </div>
                                <div class="setting-name header-setting">{{ xb.getString("settings__menu_item__sounds") }}</div>
                                <div class="setting sound radio-button field-wrap">
                                    <div class="field radio-field clickable-field notification-field">
                                        <form action="#">
                                            <p>
                                                <input class="with-gap" name="private_sound" value="" type="radio"
                                                       :id="uid + '-private-sound-no'"
                                                       :checked="!privateSound || !soundOnPrivateMessage"
                                                       :disabled="!notificationsPrivate"
                                                       @change="setPrivateSound('')" />
                                                <label :for="uid + '-private-sound-no'">No sound</label>
                                            </p>
                                            <p v-for="item in notificationSounds" :key="'private-' + item.file_name">
                                                <input class="with-gap" name="private_sound" :value="item.file_name" type="radio"
                                                       :id="uid + '-private-sound-' + item.file_name"
                                                       :checked="privateSound && soundOnPrivateMessage === item.file_name"
                                                       :disabled="!notificationsPrivate"
                                                       @change="setPrivateSound(item.file_name)" />
                                                <label :for="uid + '-private-sound-' + item.file_name">{{ item.name }}</label>
                                            </p>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- GROUP CHATS NOTIFICATIONS -->
                        <div :data-header="xb.getString('settings__section_notifications__group_chats')" class="settings-block-wrap vue-migrated groupchats-notifications"
                             :class="{ hidden: activeBlock !== 'groupchats-notifications' }">
                            <div class="settings-subblock-wrap">
                                <div class="setting message-preview checkbox-setting group-preview field-wrap">
                                    <div class="input-field notifications-dependant checkbox-field"
                                         :class="{ 'notifications-dependant-two-line': !notifications }">
                                        <input type="checkbox" class="filled-in" id="preview_group"
                                               :checked="messagePreviewGroup"
                                               :disabled="!(notifications && cachedNotifications && notificationsGroup)"
                                               @change="setGroupMessagePreview" />
                                        <label for="preview_group">{{ xb.getString("settings__section_notifications__toggle_message_preview") }}</label>
                                        <div class="desktop-notifications-clue-wrap" :class="{ hidden: notifications }">
                                            {{ xb.getString("settings__section_notifications__desktop_notifications_clue") }}
                                        </div>
                                    </div>
                                </div>
                                <div class="setting-name header-setting">{{ xb.getString("settings__menu_item__sounds") }}</div>
                                <div class="setting sound radio-button field-wrap">
                                    <div class="field radio-field clickable-field notification-field group-notification-field">
                                        <form action="#">
                                            <p>
                                                <input class="with-gap" name="group_sound" value="" type="radio"
                                                       :id="uid + '-group-sound-no'"
                                                       :checked="!groupSound || !soundOnGroupMessage"
                                                       :disabled="!notificationsGroup"
                                                       @change="setGroupSound('')" />
                                                <label :for="uid + '-group-sound-no'">No sound</label>
                                            </p>
                                            <p v-for="item in notificationSounds" :key="'group-' + item.file_name">
                                                <input class="with-gap" name="group_sound" :value="item.file_name" type="radio"
                                                       :id="uid + '-group-sound-' + item.file_name"
                                                       :checked="groupSound && soundOnGroupMessage === item.file_name"
                                                       :disabled="!notificationsGroup"
                                                       @change="setGroupSound(item.file_name)" />
                                                <label :for="uid + '-group-sound-' + item.file_name">{{ item.name }}</label>
                                            </p>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- CALLS NOTIFICATIONS -->
                        <div :data-header="xb.getString('settings__section_notifications__calls')" class="settings-block-wrap vue-migrated calls-notifications"
                             :class="{ hidden: activeBlock !== 'calls-notifications' }">
                            <div class="settings-subblock-wrap">
                                <div class="setting-name header-setting">{{ xb.getString("settings__section_notifications__ringtone") }}</div>
                                <div class="setting sound radio-button field-wrap">
                                    <div class="field radio-field clickable-field ringtone-field">
                                        <form action="#">
                                            <p v-for="item in ringtoneSounds" :key="'call-' + item.file_name">
                                                <input class="with-gap" name="call_sound" :value="item.file_name" type="radio"
                                                       :id="uid + '-call-sound-' + item.file_name"
                                                       :checked="soundOnCall === item.file_name"
                                                       :disabled="!jingleCalls"
                                                       @change="setCallSound(item.file_name)" />
                                                <label :for="uid + '-call-sound-' + item.file_name">{{ item.name }}</label>
                                            </p>
                                        </form>
                                    </div>
                                </div>
                                <div class="setting-name header-setting">{{ xb.getString("settings__section_notifications__dialtone") }}</div>
                                <div class="setting sound radio-button field-wrap">
                                    <div class="field radio-field clickable-field dialtone-field">
                                        <form action="#">
                                            <p v-for="item in dialtoneSounds" :key="'dialtone-' + item.file_name">
                                                <input class="with-gap" name="dialtone_sound" :value="item.file_name" type="radio"
                                                       :id="uid + '-dialtone-sound-' + item.file_name"
                                                       :checked="soundOnDialtone === item.file_name"
                                                       :disabled="!jingleCalls"
                                                       @change="setDialtoneSound(item.file_name)" />
                                                <label :for="uid + '-dialtone-sound-' + item.file_name">{{ item.name }}</label>
                                            </p>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- ATTENTION CALLS -->
                        <div :data-header="xb.getString('settings__section_notifications__attention_calls')" class="settings-block-wrap vue-migrated attention-calls"
                             :class="{ hidden: activeBlock !== 'attention-calls' }">
                            <div class="settings-subblock-wrap">
                                <div class="setting-name header-setting">{{ xb.getString("settings__section_notifications__ringtone") }}</div>
                                <div class="setting sound radio-button field-wrap">
                                    <div class="field radio-field clickable-field attention-field">
                                        <form action="#">
                                            <p v-for="item in attentionSounds" :key="'attention-' + item.file_name">
                                                <input class="with-gap" name="attention_sound" :value="item.file_name" type="radio"
                                                       :id="uid + '-attention-sound-' + item.file_name"
                                                       :checked="soundOnAttention === item.file_name"
                                                       :disabled="!callAttention"
                                                       @change="setAttentionSound(item.file_name)" />
                                                <label :for="uid + '-attention-sound-' + item.file_name">{{ item.name }}</label>
                                            </p>
                                        </form>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- PRIVACY -->
                        <div :data-header="xb.getString('settings__menu_item__privacy')" class="settings-block-wrap vue-migrated privacy"
                             :class="{ hidden: activeBlock !== 'privacy' }">
                            <div class="block-subheader">
                                <span class="block-name">{{ xb.getString("settings__menu_item__device_metadata_sharing") }}</span>
                            </div>
                            <div class="setting device-metadata radio-button field-wrap">
                                <div class="field radio-field clickable-field">
                                    <form action="#">
                                        <p>
                                            <input class="with-gap" name="device_metadata" value="contacts" type="radio"
                                                   :id="uid + '-contacts'"
                                                   :checked="deviceMetadata === 'contacts'"
                                                   @change="setDeviceMetadata('contacts')" />
                                            <label :for="uid + '-contacts'">{{ xb.getString("settings__section_privacy__contacts_metadata") }}</label>
                                        </p>
                                        <p>
                                            <input class="with-gap" name="device_metadata" value="server" type="radio"
                                                   :id="uid + '-server'"
                                                   :checked="deviceMetadata === 'server'"
                                                   @change="setDeviceMetadata('server')" />
                                            <label :for="uid + '-server'">{{ xb.getString("settings__section_privacy__server_metadata") }}</label>
                                        </p>
                                        <p>
                                            <input class="with-gap" name="device_metadata" value="none" type="radio"
                                                   :id="uid + '-none'"
                                                   :checked="deviceMetadata === 'none'"
                                                   @change="setDeviceMetadata('none')" />
                                            <label :for="uid + '-none'">{{ xb.getString("settings__section_privacy__none_metadata") }}</label>
                                        </p>
                                    </form>
                                </div>
                            </div>
                            <div class="device-metadata-description">{{ deviceMetadataDescription }}</div>
                            <div class="block-subheader">
                                <span class="block-name">{{ xb.getString("settings__menu_item__privacy") }}</span>
                            </div>
                            <div class="setting load-media checkbox-setting field-wrap">
                                <div class="input-field checkbox-field">
                                    <input type="checkbox" class="filled-in" id="load-media"
                                           :checked="loadMedia"
                                           @change="setLoadMedia" />
                                    <label for="load-media">{{ xb.getString("settings__section_privacy__load_media") }}</label>
                                </div>
                            </div>
                            <div class="setting typing-notifications checkbox-setting field-wrap">
                                <div class="input-field checkbox-field">
                                    <input type="checkbox" class="filled-in" id="typing-notifications"
                                           :checked="typingNotifications"
                                           @change="setTypingNotifications" />
                                    <label for="typing-notifications">{{ xb.getString("settings__section_privacy__typing_notifications") }}</label>
                                </div>
                            </div>
                            <div class="setting mapping-service checkbox-setting field-wrap">
                                <div class="input-field checkbox-field">
                                    <input type="checkbox" class="filled-in" id="mapping-service"
                                           :checked="mappingService"
                                           @change="setMappingService" />
                                    <label for="mapping-service">{{ xb.getString("settings__section_privacy__mapping_service") }}</label>
                                </div>
                            </div>
                            <div class="setting desktop-autostart checkbox-setting field-wrap" v-if="constants.DESKTOP_AUTOSTART_OPTION">
                                <div class="input-field checkbox-field">
                                    <input type="checkbox" class="filled-in" id="desktop-autostart"
                                           :checked="desktopAutostart"
                                           @change="setDesktopAutostart" />
                                    <label for="desktop-autostart">{{ xb.getString("settings__autostart") }}</label>
                                </div>
                            </div>
                        </div>

                        <!-- INTERFACE LANGUAGE -->
                        <div :data-header="xb.getString('settings__menu_item__interface_language')" class="settings-block-wrap vue-migrated interface_language"
                             :class="{ hidden: activeBlock !== 'interface_language' }">
                            <div class="setting radio-button interface-language-setting">
                                <div class="languages-list field radio-field clickable-field">
                                    <form action="#">
                                        <div class="language-item" v-for="lang in languagesList" :key="lang.value">
                                            <input class="with-gap" name="language" :value="lang.value" type="radio"
                                                   :id="uid + '-' + lang.value"
                                                   :checked="language === lang.value"
                                                   @change="changeLanguage(lang.value)" />
                                            <label :for="uid + '-' + lang.value">{{ lang.label }}</label>
                                            <div class="translation-progress" v-if="lang.progressText">{{ lang.progressText }}</div>
                                        </div>
                                    </form>
                                </div>
                            </div>
                        </div>

                        <!-- DEBUG -->
                        <div :data-header="xb.getString('settings__menu_item__debug')" class="settings-block-wrap vue-migrated debug"
                             :class="{ hidden: activeBlock !== 'debug' }">
                            <div class="setting reconnection-popup-log checkbox-setting field-wrap">
                                <div class="input-field checkbox-field">
                                    <input type="checkbox" class="filled-in" id="reconnection-popup-log"
                                           :checked="reconnectionLogs"
                                           @change="setReconnectionLogs" />
                                    <label for="reconnection-popup-log">{{ xb.getString("settings__section_debug__reconnect_log") }}</label>
                                </div>
                            </div>
                            <div class="setting debug-mode checkbox-setting field-wrap">
                                <div class="input-field checkbox-field">
                                    <input type="checkbox" class="filled-in" id="debug-mode"
                                           :checked="debugMode"
                                           @change="setDebugMode" />
                                    <label for="debug-mode">{{ xb.getString("settings__section_debug__debug_mode") }}</label>
                                </div>
                            </div>
                        </div>

                        <!-- ABOUT -->
                        <div :data-header="xb.getString('category_about')" class="settings-block-wrap vue-migrated about about-panel"
                             :class="{ hidden: activeBlock !== 'about' }">
                            <div class="settings-block-wrap vue-migrated about selectable-text">
                                <div class="block-content">{{ xb.getString("web_client__screen_about__preamble_1") }}</div>
                                <div class="block-content" v-html="xb.getString('web_client__screen_about__preamble_2', ['<a href=\'' + constants.CLIENT_URL + '\' target=\'_blank\'>' + constants.CLIENT_URL + '</a>'])"></div>
                                <div class="block-header">
                                    <span class="block-name">{{ xb.getString("web_client__screen_about__block_1__header") }}</span>
                                </div>
                                <div class="block-content">{{ xb.getString("web_client__screen_about__block_1__text") }}</div>
                                <div class="block-header">
                                    <span class="block-name">{{ xb.getString("web_client__screen_about__block_2__header") }}</span>
                                </div>
                                <div class="block-content">{{ xb.getString("web_client__screen_about__block_2__text") }}</div>
                                <div class="block-header">
                                    <span class="block-name">{{ xb.getString("web_client__screen_about__block_3__header") }}</span>
                                </div>
                                <div class="block-content" v-html="xb.getString('web_client__screen_about__block_3__text_1', ['<a href=\'' + constants.DEVELOPER_URL + '\' target=\'_blank\'>' + xb.getString('client_developer_company_name') + '</a>'])"></div>
                                <div class="block-content">{{ xb.getString("web_client__screen_about__block_3__text_2") }}</div>
                                <div class="block-content">{{ xb.getString("web_client__screen_about__block_3__text_3") }}</div>
                                <div class="block-content flex-content">
                                    <img class="logo" src="/assets/images/logo-Redsolution@2x.svg"/>
                                    <a href="https://twitter.com/Xabber_XMPP" target="_blank"><div class="btn-social twitter-color">
                                        <i class="mdi mdi-28px mdi-twitter"></i>
                                    </div></a>
                                    <a :href="constants.CLIENT_GITHUB_URL" target="_blank"><img class="btn-social github-logo" src="/assets/images/ic_github.png"/></a>
                                </div>
                                <div class="block-header">
                                    <span class="block-name">{{ xb.getString("web_client__screen_about__block_4__header") }}</span>
                                </div>
                                <div class="block-content">{{ xb.getString("web_client__screen_about__block_4__text_1") }}</div>
                                <div class="block-content" v-html="xb.getString('web_client__screen_about__block_4__text_2', ['<a href=\'' + constants.PROJECT_CROWDIN_URL + '\' target=\'_blank\'>' + xb.getString('web_client__screen_about__block_4__text_2__link__text') + '</a>'])"></div>
                            </div>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, shallowRef, computed, onMounted, onUnmounted, nextTick, inject } from 'vue';
import { useXabber } from '../../composables/useXabber.js';
import { VIEW_EL_KEY } from '../../mountVue.js';
import SettingsAccountsBlock from '../accounts/SettingsAccountsBlock.vue';

const props = defineProps({
    model: { type: Object, required: true }
});

const xb = useXabber();
const $ = xb.env.$;
const constants = xb.env.constants;
const utils = xb.env.utils;
const sounds = xb.env.sounds;
const _ = xb.env._;
const client_translation_progress = xb.env.client_translation_progress;
const backboneViewEl = inject(VIEW_EL_KEY);

const uid = Math.random().toString(36).substr(2, 9);
const psContainer = ref(null);
const singleAccountInfo = ref(null);
const accountsInfoWrap = ref(null);
const accountsBlock = ref(null);

// Navigation state
const showRight = ref(false);
const activeBlock = ref(null);
const currentHeader = ref(xb.getString("preference_editor"));
const showSubBack = ref(false);
const subBackParent = ref(null);
const scrolledDown = ref(false);

// Current sound being played
let currentSound = null;
let backboneView = null;

// Emoji font loading state
const emojiFontLoading = ref(false);
const emojiFontsDisabled = ref(false);
const showEmojiExternalUrl = ref(false);
const showEmojiNotSupported = ref(false);
const showEmojiExternalButton = ref(false);
let loadEmojiExternalDfd = null;
let fontLoadDfd = null;
let currentlyLoadedFontValue = null;
let emojiLoadDate = null;

// Settings state — synced from Backbone model
const notifications = ref(props.model.get('notifications') && xb._cache.get('notifications'));
const notificationsPrivate = ref(props.model.get('notifications_private'));
const notificationsGroup = ref(props.model.get('notifications_group'));
const jingleCalls = ref(props.model.get('jingle_calls'));
const callAttention = ref(props.model.get('call_attention'));
const messagePreviewPrivate = ref(props.model.get('message_preview_private'));
const messagePreviewGroup = ref(props.model.get('message_preview_group'));
const loadMedia = ref(props.model.get('load_media'));
const typingNotifications = ref(props.model.get('typing_notifications'));
const idling = ref(props.model.get('idling'));
const idlingTime = ref(props.model.get('idling_time'));
const mappingService = ref(props.model.get('mapping_service'));
const desktopAutostart = ref(props.model.get('desktop_autostart'));
const reconnectionLogs = ref(props.model.get('reconnection_logs'));
const debugMode = ref(props.model.get('debug_mode'));
const privateSound = ref(props.model.get('private_sound'));
const groupSound = ref(props.model.get('group_sound'));
const soundOnPrivateMessage = ref(props.model.get('sound_on_private_message'));
const soundOnGroupMessage = ref(props.model.get('sound_on_group_message'));
const soundOnCall = ref(props.model.get('sound_on_call'));
const soundOnDialtone = ref(props.model.get('sound_on_dialtone'));
const soundOnAttention = ref(props.model.get('sound_on_attention'));
const hotkeys = ref(props.model.get('hotkeys'));
const avatarShape = ref(props.model.get('avatar_shape'));
const deviceMetadata = ref(props.model.get('device_metadata'));
const language = ref(props.model.get('language'));
const emojiFont = ref(props.model.get('emoji_font'));
const mainColor = ref(props.model.get('main_color'));
const fontSize = ref(xb.settings.font_size);
const backgroundType = ref(props.model.get('background')?.type || 'default');
const backgroundImage = ref(null);
const cachedNotifications = ref(xb._cache.get('notifications'));
const notificationsVolume = ref(!isNaN(props.model.get('notifications_volume')) ? props.model.get('notifications_volume') * 100 : 100);

// Appearance
const appearance = shallowRef(props.model.get('appearance') || {});
const blurSwitched = ref(appearance.value.blur !== false);
const blurValue = ref(blurSwitched.value ? appearance.value.blur : 50);
const vignettingSwitched = ref(appearance.value.vignetting !== false);
const vignettingValue = ref(vignettingSwitched.value ? appearance.value.vignetting : 100);
const selectedColor = ref(appearance.value.color || '#E0E0E0');

// Accounts
const accounts = shallowRef(xb.accounts || null);
const isSingleAccount = ref(false);

// Static data
const mainColorLines = [
    ['red', 'pink', 'purple', 'deep-purple', 'indigo'],
    ['deep-orange', 'orange', 'cyan', 'light-blue', 'blue'],
    ['amber', 'lime', 'teal', 'brown', 'blue-grey'],
    ['light-green', 'green']
];
const avatarShapes = ['circle', 'squircle', 'octagon', 'hexagon', 'pentagon', 'rounded', 'star'];
const fontSizesList = constants.FONT_SIZES_LIST || [];

// Computed
const hasEmojifonts = computed(() => Object.keys(constants.EMOJI_FONTS_LIST || {}).length > 0);

const sortedEmojiFonts = computed(() => {
    let list = Object.values(constants.EMOJI_FONTS_LIST || {});
    list.sort((a, b) => a.order - b.order);
    return list;
});

const notificationSounds = computed(() => sounds.notifications.filter(s => !s.not_selectable));
const ringtoneSounds = computed(() => sounds.ringtones.filter(s => !s.not_selectable));
const dialtoneSounds = computed(() => sounds.dialtones.filter(s => !s.not_selectable));
const attentionSounds = computed(() => sounds.attention.filter(s => !s.not_selectable));

const emojiFontAttribution = computed(() => {
    if (emojiFont.value === 'system') return '';
    let font = constants.EMOJI_FONTS_LIST[emojiFont.value];
    return font ? (font.attribution_text || '') : '';
});

const selectedColorName = computed(() => {
    let color = selectedColor.value;
    let materialColors = xb.ColorPicker?.prototype?.materialColors;
    if (!materialColors) return '';
    let mc = materialColors.find(c => c.variations.find(v => v.hex.toLowerCase() === color.toLowerCase()));
    if (mc) {
        let tone = mc.variations.find(v => v.hex.toLowerCase() === color.toLowerCase());
        return xb.getString(`account_color_name_${mc.color.replace(/-/g, "_")}`).replace(/-/g, " ") + ` ${tone.weight}`;
    }
    return xb.getString("settings__section_appearance__hint_custom_color");
});

const avatarShapeLabel = computed(() => {
    return xb.getString('settings__section_appearance__avatars_' + avatarShape.value);
});

const emojiFontLabel = computed(() => {
    if (emojiFontLoading.value) return xb.getString("settings__menu_item__emoji_font_downloading_text");
    if (!constants.EMOJI_FONTS_LIST[emojiFont.value] && emojiFont.value !== 'system')
        return xb.getString("settings__menu_item__emoji_font_chosen_does_not_exist");
    if (emojiFont.value === 'system') return xb.getString("settings__menu_item__emoji_font_system");
    return constants.EMOJI_FONTS_LIST[emojiFont.value]?.name || '';
});

const languageLabel = computed(() => {
    if (language.value === 'default')
        return xb.getString("settings__languages_list___item_default", [constants.languages[xb.get("default_language") || 'en']]);
    return constants.languages[language.value] || '';
});

function getSoundLabel(soundVal, soundEnabled) {
    if (!soundVal || !soundEnabled) return 'No sound';
    return soundVal.replace('_', ' ');
}

const privateSoundLabel = computed(() => getSoundLabel(
    privateSound.value && notificationsPrivate.value ? soundOnPrivateMessage.value : '', true
));
const groupSoundLabel = computed(() => getSoundLabel(
    groupSound.value && notificationsGroup.value ? soundOnGroupMessage.value : '', true
));
const attentionSoundLabel = computed(() => getSoundLabel(
    callAttention.value ? soundOnAttention.value : '', true
));

const deviceMetadataDescription = computed(() => {
    return xb.getString(`settings__section_privacy__${deviceMetadata.value}_metadata_description`);
});

const descriptionHtml = computed(() => {
    let lang = language.value;
    if (!lang) return '';
    let locale = Object.keys(client_translation_progress).find(key => !lang.indexOf(key))
        || (constants.languages_another_locales[lang] && Object.keys(client_translation_progress).find(key => !constants.languages_another_locales[lang].indexOf(key)));
    let progress = client_translation_progress[locale];
    (lang === 'default' || !lang.indexOf('en')) && (progress = 100);
    if (_.isUndefined(progress)) return '';
    let progress_text, platform_text;
    if (progress === 100 && ((xb.get("default_language") === 'en' && lang === 'default') || lang === 'en')) {
        progress_text = xb.getString("settings__interface_language__text_description_full_translation_english", [constants.SHORT_CLIENT_NAME, `<a target="_blank" class="email-link" href='mailto:${constants.EMAIL_FOR_JOIN_TRANSLATION}'>${constants.EMAIL_FOR_JOIN_TRANSLATION}</a>`, constants.SHORT_CLIENT_NAME]);
    } else if (progress === 100) {
        progress_text = xb.getString("settings__interface_language__text_description_full_translation", [constants.SHORT_CLIENT_NAME, constants.SHORT_CLIENT_NAME]);
    } else if (progress === 0) {
        progress_text = xb.getString("settings__section_interface_language__text_description_no_translations", [constants.SHORT_CLIENT_NAME]);
    } else {
        progress_text = xb.getString("settings__interface_language__text_description_unfull_translation", [constants.SHORT_CLIENT_NAME]);
    }
    platform_text = xb.getString("settings__interface_language__text_description_platform",
        [constants.SHORT_CLIENT_NAME, `<a target="_blank" href='${constants.PROJECT_CROWDIN_URL}'>${constants.PROJECT_CROWDIN_URL}</a>`]);
    return `${progress_text}<br><br>${platform_text}`;
});

const languagesList = computed(() => {
    let list = [];
    let defaultLang = xb.get("default_language") || 'en';
    list.push({
        value: 'default',
        label: xb.getString("settings__languages_list___item_default", [constants.languages[defaultLang]]),
        progressText: null
    });
    if (!window.navigator.language.includes('en')) {
        let secondLang = defaultLang === 'en' ? window.navigator.language : 'en';
        let secondLocale = Object.keys(client_translation_progress).find(key => !secondLang.indexOf(key))
            || (constants.languages_another_locales[secondLang] && Object.keys(client_translation_progress).find(key => !constants.languages_another_locales[secondLang].indexOf(key)));
        if (secondLocale) {
            let prog = client_translation_progress[secondLocale];
            list.push({
                value: secondLang,
                label: constants.languages[secondLang],
                progressText: prog === 100
                    ? xb.getString("settings__section_interface_language__translation_progress_fully")
                    : xb.getString("settings__section_interface_language__translation_progress", [`${prog}%`])
            });
        }
    }
    for (let lang in constants.languages) {
        if (!constants.languages.hasOwnProperty(lang)) continue;
        if (!lang || lang === defaultLang || lang === window.navigator.language) continue;
        let locale = Object.keys(client_translation_progress).find(key => !lang.indexOf(key))
            || (constants.languages_another_locales[lang] && Object.keys(client_translation_progress).find(key => !constants.languages_another_locales[lang].indexOf(key)));
        if (locale) {
            let progress = client_translation_progress[locale];
            list.push({
                value: lang,
                label: constants.languages[lang],
                progressText: progress === 100
                    ? xb.getString("settings__section_interface_language__translation_progress_fully")
                    : xb.getString("settings__section_interface_language__translation_progress", [`${progress}%`])
            });
        }
    }
    return list;
});

// SVG helper
function svgContent(name) {
    let tmpl = xb.env.templates.svg[name];
    return tmpl ? tmpl() : '';
}

// Navigation
function jumpToBlock(ev) {
    if ($(ev.target).closest('.switch').length) return;
    let tab = $(ev.target).closest('.settings-tab');
    let blockName = tab.attr('data-block-name');
    let subParent = tab.attr('data-subblock-parent-name');
    if (tab.hasClass('link-button')) {
        activeBlock.value = null;
        scrollTo(0);
        return;
    }
    showRight.value = true;
    activeBlock.value = blockName;
    // Find the header from the block
    let blockEl = $(backboneViewEl[0]).find('.settings-block-wrap.' + blockName);
    currentHeader.value = blockEl.attr('data-header') || xb.getString("preference_editor");
    if (subParent) {
        showSubBack.value = true;
        subBackParent.value = subParent;
    } else {
        showSubBack.value = false;
        subBackParent.value = null;
    }
    scrollToTop();
    updateHeight();
}

function backToMenu() {
    currentSound && currentSound.pause();
    showRight.value = false;
    activeBlock.value = null;
    showSubBack.value = false;
    subBackParent.value = null;
    scrollToTop();
    updateHeight();
}

function backToSubMenu() {
    currentSound && currentSound.pause();
    let parentBlock = subBackParent.value;
    activeBlock.value = parentBlock;
    let blockEl = $(backboneViewEl[0]).find('.settings-block-wrap.' + parentBlock);
    currentHeader.value = blockEl.attr('data-header') || xb.getString("preference_editor");
    let parentParent = blockEl.attr('data-parent-block');
    if (parentParent) {
        subBackParent.value = parentParent;
    } else {
        showSubBack.value = false;
        subBackParent.value = null;
    }
    scrollToTop();
    updateHeight();
}

function closeSettings() {
    currentSound && currentSound.pause();
    if (xb.body.screen && xb.body.screen.get('previous_screen')) {
        let previous_screen = xb.body.screen.get('previous_screen');
        if (previous_screen.right === null) xb.body.screen.set('right', null);
        if (previous_screen.model === null) xb.body.screen.set('model', null);
        if ((previous_screen.name === 'notifications' || previous_screen.name === 'calls' || previous_screen.name === 'contacts' || previous_screen.name === 'groupchats')
            && previous_screen.open_all_chats) {
            xb.toolbar_view.showAllChats();
        } else if (previous_screen.force_open_all_chats) {
            xb.toolbar_view.showAllChats(null, true);
        } else {
            previous_screen.close_settings = true;
            xb.body.setScreen(previous_screen.name, previous_screen);
            xb.body.screen.attributes.close_settings = undefined;
        }
    } else {
        xb.toolbar_view.showAllChats();
    }
}

// Scrolling
function scrollToTop() {
    if (psContainer.value) psContainer.value.scrollTop = 0;
}

function scrollTo(offset) {
    if (psContainer.value) psContainer.value.scrollTop = offset;
}

function updateHeight() {
    nextTick(() => {
        if (backboneView) {
            backboneView.updateScrollBar && backboneView.updateScrollBar();
        }
    });
}

function onScrollY() {
    if (!psContainer.value) return;
    scrolledDown.value = psContainer.value.scrollTop > 0;
}

function updateBackgroundImage() {
    let bg = props.model.get('background');
    backgroundType.value = bg?.type || 'default';
    if (bg?.image) {
        backgroundImage.value = utils.images.getCachedBackground(bg.image);
    } else {
        backgroundImage.value = null;
    }
}

// Settings handlers
function setNotifications(ev) {
    if (ev) ev.preventDefault();
    let value = props.model.get('notifications');
    if (value === null) {
        utils.callback_popup_message(xb.getString("notifications__toast_notifications_not_supported"), 1500);
        return;
    }
    value = value && xb._cache.get('notifications');
    if (!xb._cache.get('notifications')) {
        window.Notification.requestPermission().then((permission) => {
            xb._cache.save({ notifications: (permission === 'granted'), ignore_notifications_warning: true });
            xb.notifications_placeholder && xb.notifications_placeholder.close();
            let granted = (permission === 'granted');
            props.model.save('notifications', granted ? granted : props.model.get('notifications'));
            notifications.value = granted;
            cachedNotifications.value = granted;
        });
    } else {
        value = !value;
        props.model.save('notifications', value);
        notifications.value = value;
    }
}

function setPrivateNotifications(ev) {
    if (ev) ev.preventDefault();
    let value = !props.model.get('notifications_private');
    props.model.save('notifications_private', value);
    notificationsPrivate.value = value;
}

function setGroupNotifications(ev) {
    if (ev) ev.preventDefault();
    let value = !props.model.get('notifications_group');
    props.model.save('notifications_group', value);
    notificationsGroup.value = value;
}

function setJingleCalls(ev) {
    if (ev) ev.preventDefault();
    let value = !props.model.get('jingle_calls');
    props.model.save('jingle_calls', value);
    jingleCalls.value = value;
}

function setCallAttention(ev) {
    if (ev) ev.preventDefault();
    let value = !props.model.get('call_attention');
    props.model.save('call_attention', value);
    callAttention.value = value;
}

function setPrivateMessagePreview() {
    let value = !props.model.get('message_preview_private');
    props.model.save('message_preview_private', value);
    messagePreviewPrivate.value = value;
}

function setGroupMessagePreview() {
    let value = !props.model.get('message_preview_group');
    props.model.save('message_preview_group', value);
    messagePreviewGroup.value = value;
}

function setLoadMedia() {
    let value = !props.model.get('load_media');
    props.model.save('load_media', value);
    loadMedia.value = value;
}

function setTypingNotifications() {
    let value = !props.model.get('typing_notifications');
    props.model.save('typing_notifications', value);
    typingNotifications.value = value;
}

function setMappingService() {
    let value = !props.model.get('mapping_service');
    props.model.save('mapping_service', value);
    mappingService.value = value;
}

function setDesktopAutostart() {
    let value = !props.model.get('desktop_autostart');
    props.model.save('desktop_autostart', value);
    desktopAutostart.value = value;
}

function setReconnectionLogs() {
    let value = !props.model.get('reconnection_logs');
    props.model.save('reconnection_logs', value);
    reconnectionLogs.value = value;
}

function setDebugMode() {
    let value = !props.model.get('debug_mode');
    props.model.save('debug_mode', value);
    debugMode.value = value;
}

function setIdling() {
    let value = !props.model.get('idling');
    props.model.save('idling', value);
    idling.value = value;
}

function setIdlingTimeout(ev) {
    let value = parseInt(ev.target.value);
    if (isNaN(value)) value = constants.IDLING_DEFAULT_TIMEOUT;
    else if (value < constants.IDLING_MINIMAL_TIMEOUT) value = constants.IDLING_MINIMAL_TIMEOUT;
    props.model.save('idling_time', value);
    idlingTime.value = value;
}

function setPrivateSound(value) {
    if (value) {
        currentSound && currentSound.pause();
        currentSound = xb.playAudio(value, false, !props.model.get('notifications_volume_enabled') ? 0 : props.model.get('notifications_volume'));
        props.model.save({ private_sound: true, sound_on_private_message: value });
        privateSound.value = true;
        soundOnPrivateMessage.value = value;
    } else {
        props.model.save('private_sound', false);
        privateSound.value = false;
    }
}

function setGroupSound(value) {
    if (value) {
        currentSound && currentSound.pause();
        currentSound = xb.playAudio(value, false, !props.model.get('notifications_volume_enabled') ? 0 : props.model.get('notifications_volume'));
        props.model.save({ group_sound: true, sound_on_group_message: value });
        groupSound.value = true;
        soundOnGroupMessage.value = value;
    } else {
        props.model.save('group_sound', false);
        groupSound.value = false;
    }
}

function setCallSound(value) {
    currentSound && currentSound.pause();
    currentSound = xb.playAudio(value, false);
    props.model.save({ sound_on_call: value });
    soundOnCall.value = value;
}

function setDialtoneSound(value) {
    currentSound && currentSound.pause();
    currentSound = xb.playAudio(value, false);
    props.model.save({ sound_on_dialtone: value });
    soundOnDialtone.value = value;
}

function setAttentionSound(value) {
    currentSound && currentSound.pause();
    currentSound = xb.playAudio(value, false);
    props.model.save({ sound_on_attention: value });
    soundOnAttention.value = value;
}

function setHotkeys(value) {
    props.model.save('hotkeys', value);
    hotkeys.value = value;
}

function setAvatarShape(value) {
    props.model.save('avatar_shape', value);
    avatarShape.value = value;
    xb.trigger('update_avatar_shape');
}

function setDeviceMetadata(value) {
    props.model.save('device_metadata', value);
    deviceMetadata.value = value;
    updateHeight();
}

function setBackground(value) {
    if (value === 'default') {
        props.model.save('background', { type: 'default' });
        xb.body.updateBackground();
        updateBackgroundImage();
    } else if (value === 'repeating-pattern' || value === 'image') {
        let background_view = new xb.SetBackgroundView();
        background_view.render({ type: value, model: props.model });
    }
}

function setFontSize(value) {
    props.model.save('font_size', value);
    fontSize.value = value;
    xb.trigger('update_font_size');
}

function changeBackgroundImage() {
    let type = props.model.get('background')?.type;
    if (type === 'repeating-pattern' || type === 'image') {
        let background_view = new xb.SetBackgroundView();
        background_view.render({ type: type, model: props.model });
    }
}

function chooseMainColor(color) {
    props.model.save('main_color', color);
    mainColor.value = color;
    xb.trigger('update_main_color');
}

function openColorPicker() {
    if (!backboneView._colorPicker) {
        backboneView._colorPicker = new xb.ColorPicker({ model: props.model });
    }
    backboneView._colorPicker.render();
}

function changeBlur(ev) {
    let value = ev.target.value;
    blurValue.value = value;
    xb.body.updateBlur(value);
    let app = props.model.get('appearance');
    props.model.save('appearance', _.extend(app, { blur: value }));
}

function changeVignetting(ev) {
    let value = ev.target.value;
    vignettingValue.value = value;
    xb.body.updateBoxShadow(value);
    let app = props.model.get('appearance');
    props.model.save('appearance', _.extend(app, { vignetting: value }));
}

function switchBlur(ev) {
    let checked = ev.target.checked;
    blurSwitched.value = checked;
    let app = props.model.get('appearance');
    let value = checked ? blurValue.value : false;
    props.model.save('appearance', _.extend(app, { blur: value }));
    xb.body.updateBlur(value);
}

function switchVignetting(ev) {
    let checked = ev.target.checked;
    vignettingSwitched.value = checked;
    let app = props.model.get('appearance');
    let value = checked ? vignettingValue.value : false;
    props.model.save('appearance', _.extend(app, { vignetting: value }));
    xb.body.updateBoxShadow(value);
}

function changeNotificationsVolume(ev) {
    let vol = ev.target.value;
    notificationsVolume.value = vol;
    let volume = vol / 100;
    props.model.save('notifications_volume', volume);
    let sound = soundOnPrivateMessage.value || soundOnGroupMessage.value;
    if (sound) {
        currentSound && currentSound.pause();
        currentSound = xb.playAudio(sound, false, volume);
    }
}

function changeLanguage(value) {
    let locale = Object.keys(client_translation_progress).find(key => !value.indexOf(key))
        || (constants.languages_another_locales[value] && Object.keys(client_translation_progress).find(key => !constants.languages_another_locales[value].indexOf(key)));
    let progress = client_translation_progress[locale];
    (value === 'default') && (progress = 100);
    let platform_text;
    if (progress === 100 && ((xb.get("default_language") === 'en' && value === 'default') || value === 'en')) {
        platform_text = xb.getString("settings__dialog_change_language__confirm");
    } else if (progress === 100) {
        platform_text = xb.getString("settings__interface_language__change_language_text_full_translation",
            [constants.SHORT_CLIENT_NAME, `<a target="_blank" href='${constants.PROJECT_CROWDIN_URL}'>${xb.getString("settings__section_interface_language__text_description__text_translations")}</a>`, constants.SHORT_CLIENT_NAME])
            + '\n\n' + xb.getString("settings__dialog_change_language__confirm");
    } else if (progress === 0) {
        platform_text = xb.getString("settings__interface_language__change_language_text_no_translation",
            [constants.SHORT_CLIENT_NAME, `<a target="_blank" href='${constants.PROJECT_CROWDIN_URL}'>${xb.getString("settings__section_interface_language__text_description__text_translation")}</a>`]);
    } else {
        platform_text = xb.getString("settings__interface_language__change_language_text_partial_translation",
            [constants.SHORT_CLIENT_NAME, `<a target="_blank" href='${constants.PROJECT_CROWDIN_URL}'>${xb.getString("settings__section_interface_language__text_description__text_translation_team")}</a>`, constants.SHORT_CLIENT_NAME])
            + '\n\n' + xb.getString("settings__dialog_change_language__confirm");
    }
    let modal_classes = ['change-language-modal'], inverted_buttons;
    if (progress === 0) modal_classes.push('change-language-modal-no-ok');
    else if (progress !== 0 && progress < 70) inverted_buttons = true;
    utils.dialogs.ask(xb.getString("settings__dialog_change_language__header"),
        platform_text,
        { modal_class: modal_classes, no_dialog_options: true, inverted_buttons: inverted_buttons },
        { ok_button_text: xb.getString("settings__dialog_change_language__button_change") }).done((result) => {
        if (result) {
            props.model.save('language', value);
            window.location.reload(true);
        } else {
            language.value = props.model.get('language');
        }
    });
}

function changeEmojiFont(value) {
    let emoji_font = constants.EMOJI_FONTS_LIST[value];
    let current_time;
    if (!emoji_font && value !== 'system') {
        utils.dialogs.error(xb.getString("settings__menu_item__emoji_font_chosen_does_not_exist"));
        emojiFont.value = props.model.get('emoji_font');
        return;
    }
    loadEmojiExternalDfd = new $.Deferred();
    loadEmojiExternalDfd.done(() => {
        fontLoadDfd = new $.Deferred();
        currentlyLoadedFontValue = value;
        fontLoadDfd.done((response) => {
            if (emojiLoadDate !== current_time) return;
            emojiFontLoading.value = false;
            showEmojiExternalUrl.value = false;
            showEmojiNotSupported.value = false;
            showEmojiExternalButton.value = false;
            emojiFontsDisabled.value = false;
            fontLoadDfd = null;
            currentlyLoadedFontValue = null;
            if (response && response.error) {
                emojiFont.value = props.model.get('emoji_font');
                if (props.model.get('emoji_font') !== 'system' && constants.EMOJI_FONTS_LIST[props.model.get('emoji_font')]?.url) {
                    xb.loadEmojiFont(constants.EMOJI_FONTS_LIST[props.model.get('emoji_font')].url);
                }
            } else {
                props.model.save('emoji_font', value);
                emojiFont.value = value;
            }
        });
        showEmojiExternalUrl.value = false;
        showEmojiNotSupported.value = false;
        showEmojiExternalButton.value = false;
        emojiFontLoading.value = true;
        emojiFontsDisabled.value = true;
        let emoji_url = value === 'system' ? value : emoji_font.url;
        loadEmojiExternalDfd = null;
        emojiLoadDate = Date.now();
        current_time = emojiLoadDate;
        xb.loadEmojiFont(emoji_url, fontLoadDfd);
    });

    if (value !== 'system') {
        showEmojiExternalUrl.value = !!emoji_font.is_outside_url;
        showEmojiNotSupported.value = !!(emoji_font.no_glyph && utils.getBrowser() === "Firefox");
        showEmojiExternalButton.value = true;
    } else {
        loadEmojiExternalDfd.resolve();
    }
}

function loadExternalEmojiFont() {
    loadEmojiExternalDfd && loadEmojiExternalDfd.resolve();
}

function showAddAccountView() {
    xb.trigger('add_account', { right: null });
}

function deleteAllAccounts() {
    utils.dialogs.ask(xb.getString("button_quit"),
        xb.getString("settings__dialog_quit_client__confirm", [constants.CLIENT_NAME]),
        null,
        { ok_button_text: xb.getString("button_quit") }).done((res) => {
        res && xb.trigger('quit');
    });
}

function updateAccounts() {
    if (!xb.accounts) return;
    let singleEnabled = xb.accounts.length === 1 && xb.accounts.enabled.length;
    isSingleAccount.value = singleEnabled;
    updateHeight();
}

function syncSettingsFromModel() {
    notifications.value = props.model.get('notifications') && xb._cache.get('notifications');
    notificationsPrivate.value = props.model.get('notifications_private');
    notificationsGroup.value = props.model.get('notifications_group');
    jingleCalls.value = props.model.get('jingle_calls');
    callAttention.value = props.model.get('call_attention');
    privateSound.value = props.model.get('private_sound');
    groupSound.value = props.model.get('group_sound');
    soundOnPrivateMessage.value = props.model.get('sound_on_private_message');
    soundOnGroupMessage.value = props.model.get('sound_on_group_message');
    soundOnCall.value = props.model.get('sound_on_call');
    soundOnDialtone.value = props.model.get('sound_on_dialtone');
    soundOnAttention.value = props.model.get('sound_on_attention');
    language.value = props.model.get('language');
    emojiFont.value = props.model.get('emoji_font');
    avatarShape.value = props.model.get('avatar_shape');
    mainColor.value = props.model.get('main_color');
    let app = props.model.get('appearance') || {};
    selectedColor.value = app.color || '#E0E0E0';
}

function onUpdateMainColor() {
    let mc = props.model.get('main_color');
    mainColor.value = mc;
}

function onEscKey(ev) {
    if (ev.keyCode === constants.KEY_ESCAPE && backboneView && backboneView.data.get('visible')) {
        closeSettings();
    }
}

// onShow/onHide lifecycle — called by the Backbone bridge
function onShow(options) {
    // Reset to menu state
    showRight.value = false;
    activeBlock.value = null;
    showSubBack.value = false;
    subBackParent.value = null;
    syncSettingsFromModel();
    updateBackgroundImage();
    updateAccounts();
    scrollToTop();
    nextTick(() => {
        if (psContainer.value) {
            // Reset jQuery-added hidden class on global-settings-tabs
            // (AccountSettingsSingleModalView.jumpToBlock adds it, but backToMenu
            // is never called when the panel is closed and reopened)
            $(psContainer.value).find('.left-column > .settings-tabs-wrap.global-settings-tabs').removeClass('hidden');
            $(psContainer.value).perfectScrollbar(xb.ps_settings || {});
        }
        updateHeight();
        // Jump to specific block if requested
        if (options && options.block_name && !options.account_block_name) {
            let tab = $(backboneViewEl[0]).find(`.settings-tab[data-block-name="${options.block_name}"]`);
            if (tab.length) {
                jumpToBlock({ target: tab[0] });
            }
        }
    });
}

function onHide() {
    currentSound && currentSound.pause();
}

onMounted(() => {
    // Listen for Backbone model changes
    xb.on('update_main_color', onUpdateMainColor);
    props.model.on('change:language', () => { language.value = props.model.get('language'); });
    props.model.on('change:emoji_font', () => { emojiFont.value = props.model.get('emoji_font'); });
    props.model.on('change:avatar_shape', () => { avatarShape.value = props.model.get('avatar_shape'); });
    props.model.on('change:background', updateBackgroundImage);
    props.model.on('change:appearance', () => {
        let app = props.model.get('appearance') || {};
        selectedColor.value = app.color || '#E0E0E0';
        xb.toolbar_view && xb.toolbar_view.updateColor(selectedColor.value);
    });

    document.addEventListener('keyup', onEscKey);

    if (xb.accounts) {
        accounts.value = xb.accounts;
        xb.accounts.on("list_changed add change:enabled destroy", updateAccounts);
    } else {
        xb.once('accounts_ready', () => {
            accounts.value = xb.accounts;
            xb.accounts.on("list_changed add change:enabled destroy", updateAccounts);
        });
    }

    if (psContainer.value) {
        psContainer.value.addEventListener('scroll', onScrollY);
    }
});

onUnmounted(() => {
    xb.off('update_main_color', onUpdateMainColor);
    props.model.off('change:language');
    props.model.off('change:emoji_font');
    props.model.off('change:avatar_shape');
    props.model.off('change:background', updateBackgroundImage);
    props.model.off('change:appearance');
    document.removeEventListener('keyup', onEscKey);
    if (psContainer.value) {
        psContainer.value.removeEventListener('scroll', onScrollY);
    }
});

function setBackboneView(view) {
    backboneView = view;
}

defineExpose({ onShow, onHide, setBackboneView, updateAccounts });
</script>
