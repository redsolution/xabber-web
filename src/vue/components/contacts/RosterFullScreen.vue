<template>
    <div class="contacts-panel-wrap vue-migrated">
        <div class="contacts-panel-left-side no-select">
            <i class="btn-back-to-chats mdi mdi-24px mdi-arrow-left"></i>
            <div class="contacts-filter-main-header">{{ xb.getString("contacts") }}</div>
            <div class="left-column-filters-container">
                <div class="client-notifications-wrap">
                </div>
                <div class="contacts-type-filter">
                    <div class="contacts-type-filter-content">
                        <div class="filter-item-wrap" data-filter="contacts">
                            <i class="filter-icon mdi mdi-24px mdi mdi-contacts"></i>
                            <div class="name one-line">{{ xb.getString("contacts") }}<span></span></div>
                        </div>
                        <div class="filter-item-wrap" data-filter="contacts-online">
                            <svg class="filter-icon mdi fill-color-grey-500 mdi-svg-template" v-html="svgContent('account-outline')"></svg>
                            <div class="name one-line">{{ xb.getString("online") }}<span></span></div>
                        </div>
                        <div class="filter-item-wrap outgoing-subscription-item-wrap" data-filter="outgoing-subscription">
                            <i class="filter-icon mdi mdi-24px mdi mdi-account-plus"></i>
                            <div class="name one-line">{{ xb.getString("notifications_window__outgoing_subscriptions_header") }}<span></span></div>
                        </div>
                        <div class="filter-item-wrap subscription-item-wrap" data-filter="subscription">
                            <svg class="filter-icon mdi fill-color-grey-500 mdi mdi-svg-template" v-html="svgContent('vcard-outline')"></svg>
                            <div class="name one-line">{{ xb.getString("notifications_window__subscriptions_header") }}<span></span></div>
                        </div>
                        <div class="filter-item-wrap groupchats-filter-item" data-filter="groupchats-public">
                            <svg class="filter-icon mdi fill-color-grey-500 mdi-svg-template" v-html="svgContent('group-public-outline')"></svg>
                            <div class="name one-line">{{ xb.getString("groupchat_privacy_type_public") }}<span></span></div>
                        </div>
                        <div class="filter-item-wrap groupchats-filter-item" data-filter="groupchats-incognito">
                            <svg class="filter-icon mdi fill-color-grey-500 mdi-svg-template badge-icon" v-html="svgContent('group-private')"></svg>
                            <div class="name one-line">{{ xb.getString("groupchat_privacy_type_incognito") }}<span></span></div>
                        </div>
                        <div class="filter-item-wrap groupchats-filter-item" data-filter="groupchats-private">
                            <svg class="filter-icon mdi fill-color-grey-500 mdi-svg-template" v-html="svgContent('chat-outline')"></svg>
                            <div class="name one-line">{{ xb.getString("settings__section_notifications__private_chats") }}<span></span></div>
                        </div>
                        <div class="filter-item-wrap groupchats-filter-item invitation-filter-item-wrap" data-filter="invitations">
                            <svg class="filter-icon mdi fill-color-grey-500 mdi mdi-svg-template" v-html="svgContent('invite-outline')"></svg>
                            <div class="name one-line">{{ xb.getString("blocked_tabs_name__invitations") }}<span></span></div>
                        </div>
                    </div>
                </div>
                <div class="contacts-type-filter contacts-group-filter">
                    <div class="contacts-filter-header">{{ xb.getString("contact_circle") }}</div>
                    <div class="contacts-group-filter-content">
                    </div>
                </div>
            </div>
        </div>
        <div class="contacts-panel-right-side">
            <div class="contacts-panel">
                <div class="panel-head">
                    <svg class="btn-show-search mdi mdi-24px mdi-svg-template" v-html="svgContent('search')"></svg>
                    <i class="btn-dropdown-groups mdi mdi-24px mdi-dots-vertical" :data-activates="uid + '-more'"></i>
                    <ul :id="uid + '-more'" class="unified-dropdown-style dropdown-content noselect">
                        <div class="btn-add-contact property-variant">
                            {{ xb.getString("add_contact") }}
                        </div>
                        <div class="btn-create-group property-variant">
                            {{ xb.getString("create_group") }}
                        </div>
                        <div class="btn-create-incognito property-variant">
                            {{ xb.getString("create_incognito_group") }}
                        </div>
                    </ul>
                </div>
                <div class="tab-active-filters-wrap">
                    <div class="chat-tools-wrap">
                        <div class="chat-tool chat-tool-player">
                            <div class="chat-tool-player-containter">
                                <div class="chat-tool chat-tool-plyr-controls btn-previous-plyr">
                                    <i class="mdi mdi-skip-previous mdi-24px"></i>
                                </div>
                                <div class="chat-tool chat-tool-plyr-controls btn-play-pause-plyr">
                                    <i class="mdi mdi-play mdi-24px"></i>
                                    <i class="mdi mdi-pause mdi-24px"></i>
                                </div>
                                <div class="chat-tool chat-tool-plyr-controls btn-next-plyr">
                                    <i class="mdi mdi-skip-next mdi-24px"></i>
                                </div>
                                <div class="chat-tool chat-tool-plyr-controls btn-popup-plyr">
                                    <img class="player-poster hidden">
                                    <svg class="mdi mdi-32px mdi-player-type-icon mdi-svg-template" v-html="svgContent('video')"></svg>
                                    <div class="voice-message-player-avatar circle-avatar hidden"></div>
                                </div>
                                <div class="chat-tool chat-player-duration chat-tool-plyr-controls">
                                    <div class="chat-head-player-title one-line"><div class="chat-head-player-title-text">{{ xb.getString("chat_message_video") }}</div></div>
                                    <div class="chat-head-player-title-bottom-container">
                                        <span class="chat-head-player-type one-line">{{ xb.getString("chat_message_video") }}</span><span class="chat-head-player-type-dot"> &#x2022;</span>
                                        <span class="chat-head-player-current-time">0:00</span> /
                                        <span class="chat-head-player-total-time">0:00</span>
                                    </div>
                                </div>
                                <div class="chat-tool chat-tool-plyr-controls btn-stop-plyr">
                                    <i class="mdi mdi-close mdi-16px"></i>
                                </div>
                            </div>
                        </div>
                    </div>
                    <div class="tab-additional-filter-item tab-account-filter-item dropdown-button ground-main-color-50 hidden" data-type="accounts" data-value="all" :data-activates="uid + '-accounts-filters'">
                        <div class="tab-filter-item-text one-line"></div>
                        <i class="mdi mdi-8px mdi-triangle"></i>
                    </div>
                    <ul :id="uid + '-accounts-filters'" class="dropdown-content accounts-dropdown unified-dropdown-style noselect">
                        <div class="property-variant btn-accounts-filter" data-jid="all">
                            <span class="one-line">{{ xb.getString("notifications_window__type_filter_all_accounts") }}</span>
                        </div>
                    </ul>
                    <div class="tab-additional-filter-item dropdown-button ground-main-color-50" data-type="contacts" :data-activates="uid + '-contacts-filters'">
                        <div class="tab-filter-item-text one-line">{{ xb.getString("contacts") }}</div>
                        <i class="mdi mdi-8px mdi-triangle"></i>
                    </div>
                    <ul :id="uid + '-contacts-filters'" class="dropdown-content unified-dropdown-style noselect">
                        <div class="property-variant btn-subfilter" data-subfilter="contacts" data-parent-type="contacts">
                            <span class="one-line">{{ xb.getString("contacts") }}</span>
                        </div>
                        <div class="property-variant btn-subfilter" data-subfilter="online" data-parent-type="contacts">
                            <span class="one-line">{{ xb.getString("online") }}</span>
                        </div>
                    </ul>
                    <div class="tab-additional-filter-item dropdown-button ground-main-color-50 hidden" data-type="groups" :data-activates="uid + '-groups-filters'">
                        <div class="tab-filter-item-text one-line">{{ xb.getString("contacts_window__type_filter_groupchat") }}</div>
                        <i class="mdi mdi-8px mdi-triangle"></i>
                    </div>
                    <ul :id="uid + '-groups-filters'" class="dropdown-content unified-dropdown-style noselect">
                        <div class="property-variant btn-subfilter" data-subfilter="groups" data-parent-type="groups">
                            <span class="one-line">{{ xb.getString("contacts_window__type_filter_groupchat") }}</span>
                        </div>
                        <div class="property-variant btn-subfilter" data-subfilter="public" data-parent-type="groups">
                            <span class="one-line">{{ xb.getString("groupchat_privacy_type_public") }}</span>
                        </div>
                        <div class="property-variant btn-subfilter" data-subfilter="incognito" data-parent-type="groups">
                            <span class="one-line">{{ xb.getString("groupchat_privacy_type_incognito") }}</span>
                        </div>
                    </ul>
                    <div class="contacts-search-form search-form">
                        <div type="text" class="search-input simple-input-field" role="textbox" contenteditable :data-placeholder="xb.getString('search')"></div>
                        <i class="close-search-icon mdi mdi-16px mdi-close-circle"></i>
                    </div>
                </div>
                <div class="contacts-content-wrap">
                    <div class="notification-subscriptions-wrap notifications-subscriptions">
                        <div class="notification-subscriptions-header">
                            {{ xb.getString("notifications_window__subscriptions_header") }}
                        </div>
                        <div class="notification-subscriptions-content-wrap">
                        </div>
                        <div class="notification-subscriptions-button-wrap">
                            <div class="notification-subscriptions-button filter-item-wrap" data-filter="subscription">
                                {{ xb.getString("view_all") }}
                            </div>
                        </div>
                    </div>
                    <div class="notification-outgoing-subscriptions-wrap notifications-outgoing-subscription">
                        <div class="notification-outgoing-subscriptions-content-wrap">
                        </div>
                    </div>
                    <div class="contacts-invitations-wrap">
                        <div class="contacts-invitations-header">
                            {{ xb.getString("blocked_tabs_name__invitations") }}
                        </div>
                        <div class="contacts-invitations-content-wrap">
                        </div>
                        <div class="contacts-invitations-button-wrap">
                            <div class="contacts-invitations-button filter-item-wrap" data-filter="invitations">
                                {{ xb.getString("view_all") }}
                            </div>
                        </div>
                    </div>
                    <div class="roster-sorting-wrap no-select">
                        <div class="roster-sorting-item sort-name" data-sort="name">
                            <div class="roster-sorting-value">{{ xb.getString("sorting_name__name") }}</div>
                            <i class="mdi mdi-24px mdi-arrow-down-slim"></i>
                        </div>
                        <div class="roster-sorting-item sort-jid" data-sort="jid">
                            <div class="roster-sorting-value">{{ xb.getString("sorting_name__jid") }}</div>
                            <i class="mdi mdi-24px mdi-arrow-down-slim"></i>
                        </div>
                    </div>
                    <div class="contact-list-wrap hidden left-panel-list-wrap">
                        <div class="contact-list item-list">
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { useXabber } from '../../composables/useXabber.js';

const xb = useXabber();

const uid = 'rfs-' + Math.random().toString(36).substr(2, 9);

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
    uid,
});
</script>
