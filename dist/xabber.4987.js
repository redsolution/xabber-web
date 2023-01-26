"use strict";(self.webpackChunkxabber_web=self.webpackChunkxabber_web||[]).push([[4987],{34987:(n,e,t)=>{t.r(e),t.d(e,{default:()=>a});const a='<div class="right-column noselect">\n    <div class="settings-panel-head">\n        <span class="settings-panel-head-title">{[print(xabber.getString("account_editor"))]}</span>\n        <div class="buttons-wrap">\n            <button class="btn-block btn-flat btn-main text-color-500 ground-color-grey-100 hover-ground-color-grey-300 hidden">{[print(xabber.getString("settings_account__blocklist__button_block"))]}</button>\n            <button class="btn-deselect-blocked btn-flat btn-main btn-dark ground-color-grey-100 hover-ground-color-grey-300 hidden">{[print(xabber.getString("cancel"))]}</button>\n            <button class="btn-unblock-selected btn-flat btn-main text-color-500 ground-color-grey-100 hover-ground-color-grey-300 hidden">{[print(xabber.getString("unblock_selected"))]}</button>\n        </div>\n        <div class="btn-more media-gallery-button dropdown-button" data-activates="storage-actions">\n            <i class="mdi mdi-24px mdi-dots-vertical"></i>\n        </div>\n        <ul id="storage-actions" class="dropdown-content noselect">\n            <div class="property-variant btn-delete-files-variants" data-activates="storage-delete-files">\n                <span class="one-line">{[print(xabber.getString("account_delete_files"))]}</span>\n            </div>\n        </ul>\n        <ul id="storage-delete-files" class="dropdown-content bootstrap-dropdown noselect">\n            <div class="property-variant btn-delete-files" data-date="15">\n                <span class="one-line">{[print(xabber.getString("delete_files_older_than_15_days"))]}</span>\n            </div>\n            <div class="property-variant btn-delete-files" data-date="30">\n                <span class="one-line">{[print(xabber.getString("delete_files_older_than_30_days"))]}</span>\n            </div>\n            <div class="property-variant btn-delete-files" data-date="60">\n                <span class="one-line">{[print(xabber.getString("delete_files_older_than_60_days"))]}</span>\n            </div>\n        </ul>\n    </div>\n\n    <div class="panel-content-wrap">\n        <div class="panel-content details-panel">\n\n            <div data-header=\'{[print(xabber.getString("account_connection_settings"))]}\' class="settings-block-wrap connection">\n                <div class="connection-wrap">\n                    <div class="readonly-setting">\n                        <i class="details-icon mdi mdi-24px mdi-account"></i>\n                        <div class="setting-wrap account-name">\n                            <div class="value one-line"></div>\n                            <div class="label conn-status"></div>\n                        </div>\n                    </div>\n                    <div class="change-password-container">\n                        <div class="change-password-fields">\n                            <div class="input-field">\n                                <input class="input-glow" placeholder=\'{[print(xabber.getString("hint_old_pass"))]}\' id="old_password" type="password" name="old_password">\n                                <span class="errors fixed"></span>\n                            </div>\n                            <div class="input-field">\n                                <input class="input-glow" placeholder=\'{[print(xabber.getString("hint_new_pass"))]}\' id="password" type="password" name="password">\n                                <span class="errors fixed"></span>\n                            </div>\n                            <div class="input-field">\n                                <input class="input-glow" placeholder=\'{[print(xabber.getString("hint_confirm_pass"))]}\' id="password_confirm" type="password" name="password_confirm">\n                                <span class="errors fixed"></span>\n                            </div>\n                        </div>\n                        <div class="buttons-wrap">\n                            <button class="btn-change btn-flat btn-main btn-dark ground-color-100 hover-ground-color-300">{[print(xabber.getString("button_change_pass"))]}</button>\n                            <button class="btn-change-password btn-flat btn-main btn-dark ground-color-100 hover-ground-color-300">{[print(xabber.getString("button_set_pass"))]}</button>\n                            <button class="btn-reconnect btn-flat btn-main btn-dark ground-color-100 hover-ground-color-300">{[print(xabber.getString("settings_account__button_reconnect"))]}</button>\n                        </div>\n                    </div>\n                </div>\n            </div>\n\n            <div data-header=\'{[print(xabber.getString("color"))]}\' class="settings-block-wrap color-scheme">\n                <div class="color-scheme-wrap">\n                    <div class="account-color">\n                        <div class="field radio-field clickable-field">\n                            <form action="#">\n                                <p>\n                                    <input class="with-gap" name="account_color" value="red" type="radio" id="color-red" />\n                                    <label class="text-color-red-700" for="color-red">{[print(xabber.getString("account_color_name_red"))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="pink" type="radio" id="color-pink" />\n                                    <label class="text-color-pink-700" for="color-pink">{[print(xabber.getString("account_color_name_pink"))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="purple" type="radio" id="color-purple" />\n                                    <label class="text-color-purple-700" for="color-purple">{[print(xabber.getString("account_color_name_purple"))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="deep-purple" type="radio" id="color-deep-purple" />\n                                    <label class="text-color-deep-purple-700" for="color-deep-purple">{[print(xabber.getString("account_color_name_deep_purple").replace(/-/g, " "))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="indigo" type="radio" id="color-indigo" />\n                                    <label class="text-color-indigo-700" for="color-indigo">{[print(xabber.getString("account_color_name_indigo"))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="blue" type="radio" id="color-blue" />\n                                    <label class="text-color-blue-700" for="color-blue">{[print(xabber.getString("account_color_name_blue"))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="light-blue" type="radio" id="color-light-blue" />\n                                    <label class="text-color-light-blue-700" for="color-light-blue">{[print(xabber.getString("account_color_name_light_blue").replace(/-/g, " "))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="cyan" type="radio" id="color-cyan" />\n                                    <label class="text-color-cyan-700" for="color-cyan">{[print(xabber.getString("account_color_name_cyan"))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="teal" type="radio" id="color-teal" />\n                                    <label class="text-color-teal-700" for="color-teal">{[print(xabber.getString("account_color_name_teal"))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="green" type="radio" id="color-green" />\n                                    <label class="text-color-green-700" for="color-green">{[print(xabber.getString("account_color_name_green"))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="light-green" type="radio" id="color-light-green" />\n                                    <label class="text-color-light-green-700" for="color-light-green">{[print(xabber.getString("account_color_name_light_green").replace(/-/g, " "))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="lime" type="radio" id="color-lime" />\n                                    <label class="text-color-lime-700" for="color-lime">{[print(xabber.getString("account_color_name_lime"))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="amber" type="radio" id="color-amber" />\n                                    <label class="text-color-amber-700" for="color-amber">{[print(xabber.getString("account_color_name_amber"))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="orange" type="radio" id="color-orange" />\n                                    <label class="text-color-orange-700" for="color-orange">{[print(xabber.getString("account_color_name_orange"))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="deep-orange" type="radio" id="color-deep-orange" />\n                                    <label class="text-color-deep-orange-700" for="color-deep-orange">{[print(xabber.getString("account_color_name_deep_orange").replace(/-/g, " "))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="brown" type="radio" id="color-brown" />\n                                    <label class="text-color-brown-700" for="color-brown">{[print(xabber.getString("account_color_name_brown"))]}</label>\n                                </p>\n                                <p>\n                                    <input class="with-gap" name="account_color" value="blue-grey" type="radio" id="color-blue-grey" />\n                                    <label class="text-color-blue-grey-700" for="color-blue-grey">{[print(xabber.getString("account_color_name_blue_grey").replace(/-/g, " "))]}</label>\n                                </p>\n                            </form>\n                        </div>\n                    </div>\n                </div>\n            </div>\n\n            <div data-header=\'{[print(xabber.getString("settings_account__section_header_profile"))]}\' class="settings-block-wrap vcard">\n            </div>\n\n            <div data-header=\'{[print(xabber.getString("account_server_info_description"))]}\' class="settings-block-wrap server-info">\n                <div class="capabilities-wrap">\n                    <div class="capabilities">\n                    </div>\n                </div>\n            </div>\n\n            <div data-header=\'{[print(xabber.getString("blocked_contacts"))]}\' class="settings-block-wrap blocklist-info">\n                <div class="blocklist-wrap">\n                    <div class="blocked-items">\n                        <div class="placeholder">{[print(xabber.getString("blocked_contacts_empty"))]}</div>\n                        <div class="blocklist-tabs-wrap">\n                            <ul class="tabs">\n                                <li class="blocked-item contacts-item hidden" data-tab-name="blocked-contacts-wrap">\n                                    <a class="text-color-700">{[print(xabber.getString("blocked_tabs_name__contacts"))]}</a>\n                                </li>\n                                <li class="blocked-item domains-item hidden" data-tab-name="blocked-domains-wrap">\n                                    <a class="text-color-700">{[print(xabber.getString("blocked_tabs_name__domains"))]}</a>\n                                </li>\n                                <li class="blocked-item invitations-item hidden" data-tab-name="blocked-invitations-wrap">\n                                    <a class="text-color-700">{[print(xabber.getString("blocked_tabs_name__invitations"))]}</a>\n                                </li>\n                            </ul>\n                        </div>\n                        <div class="blocked-items-container blocked-contacts-wrap hidden" data-tab-name="contacts-item">\n                            <div class="blocked-contacts blocked-list"/>\n                        </div>\n                        <div class="blocked-items-container blocked-domains-wrap hidden" data-tab-name="domains-item">\n                            <div class="blocked-domains blocked-list"/>\n                        </div>\n                        <div class="blocked-items-container blocked-invitations-wrap hidden" data-tab-name="invitations-item">\n                            <div class="blocked-invitations blocked-list"/>\n                        </div>\n                    </div>\n                </div>\n            </div>\n\n            <div data-header=\'{[print(xabber.getString("account_cloud_storage"))]}\' class="settings-block-wrap media-gallery">\n            </div>\n\n            <div data-header=\'{[print(xabber.getString("settings_account__section_header_circles"))]}\' class="settings-block-wrap groups-info">\n                <div class="groups-wrap">\n                    <div class="groups">\n                    </div>\n                </div>\n            </div>\n\n            <div data-header=\'{[print(xabber.getString("account_settings_devices"))]}\' class="settings-block-wrap tokens">\n                <div class="tokens-wrap">\n                    <div class="current-token-wrap">\n                        <div class="sessions-wrap current-session selectable-text"></div>\n                        <div class="buttons-wrap">\n                            <p class="btn-revoke-all-tokens hover-text-color-500 text-color-700">{[print(xabber.getString("account_terminate_all_sessions"))]}</p>\n                        </div>\n                    </div>\n                    <div class="all-sessions-wrap">\n                        <div class="sessions-wrap all-sessions selectable-text"></div>\n                    </div>\n                </div>\n            </div>\n\n\n            <div data-header=\'{[print(xabber.getString("account_settings_encryption"))]}\' class="settings-block-wrap omemo-info">\n                <div class="omemo-settings-wrap">\n                    <div class="settings">\n                        <div class="setting-wrap omemo-enable">\n                            <span>{[print(xabber.getString("omemo__settings__toggle_enable_encryption"))]}</span>\n                            <div class="field setting-use-omemo switch normal">\n                                <label class="field-value">\n                                    <input type="checkbox">\n                                    <span class="lever"></span>\n                                </label>\n                            </div>\n                        </div>\n                        <div class="setting-wrap send-chat-states">\n                            <span>{[print(xabber.getString("omemo__settings__toggle_send_typing_notifications"))]}</span>\n                            <div class="field setting-send-chat-states switch normal">\n                                <label class="field-value">\n                                    <input type="checkbox">\n                                    <span class="lever"></span>\n                                </label>\n                            </div>\n                        </div>\n                        <div class="setting-wrap manage-devices">\n                            <button class="btn-manage-devices btn-flat btn-main btn-dark ground-color-grey-100 hover-ground-color-grey-300">{[print(xabber.getString("omemo__settings__button_manage_devices"))]}</button>\n                        </div>\n                        <div class="setting-wrap purge-keys">\n                            <button class="btn-purge-keys btn-flat btn-main btn-dark ground-color-grey-100 hover-ground-color-grey-300">{[print(xabber.getString("omemo__settings__button_purge_keys"))]}</button>\n                        </div>\n                    </div>\n                </div>\n            </div>\n        </div>\n    </div>\n</div>\n'}}]);
//# sourceMappingURL=xabber.4987.js.map