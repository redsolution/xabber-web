<template>
    <div class="searching-panel">
        <div class="search-wide search-form">
            <div class="account-indicator ground-color-500" :style="{ backgroundColor: accountColor }"></div>
            <i class="search-icon mdi mdi-24px mdi-magnify"></i>
            <input type="text" class="search-input simple-input-field" tabindex="1"
                   :placeholder="xb.getString('searching__placeholder_search_by_domain')"
                   v-model="searchQuery"
                   @keyup="onKeyUp">
            <i class="close-search-icon mdi mdi-16px mdi-close-circle"></i>
        </div>
        <div class="searching-properties-field">
            <div class="dropdown-button" data-visible="false" @click="toggleProperties">
                <i class="mdi mdi-24px arrow" :class="propertiesVisible ? 'mdi-chevron-up' : 'mdi-chevron-down'"></i>
            </div>
        </div>
        <ul id="select-searching-properties" class="selectable-text" v-show="propertiesVisible">
            <div class="account-property">
                <p class="property-name">{{ xb.getString("searching__search_panel__label_account") }}</p>
                <div class="account-field">
                    <div class="multiple-acc" v-if="connectedAccounts.length > 1">
                        <div class="account-dropdown-wrap">
                            <div class="dropdown-button" @click="dropdownOpen = !dropdownOpen">
                                <AccountItem v-if="selectedAccount" :jid="selectedAccount.get('jid')" />
                                <div class="caret">
                                    <i class="mdi mdi-20px mdi-menu-down"></i>
                                </div>
                            </div>
                            <div id="select-account-for-searching" class="dropdown-content"
                                 v-show="dropdownOpen">
                                <AccountItem v-for="acc in connectedAccounts" :key="acc.get('jid')"
                                             :jid="acc.get('jid')"
                                             @click="selectAccount(acc)" />
                            </div>
                        </div>
                    </div>
                    <div class="single-acc" v-else>
                        <div class="dropdown-button">
                            <AccountItem v-if="selectedAccount" :jid="selectedAccount.get('jid')" />
                        </div>
                    </div>
                </div>
            </div>
            <div class="title-property">
                <p class="property-name">{{ xb.getString("searching__search_panel__label_title") }}</p>
                <div class="input-field">
                    <input id="searching_property_title" type="text" name="title">
                </div>
            </div>
            <div class="sorting-property">
                <p class="property-name">{{ xb.getString("searching__search_panel__label_sort_by") }}</p>
                <div class="input-field">
                    <input id="searching_property_sort_by" type="text" name="title">
                </div>
            </div>
            <button class="btn-search btn btn-main-filled ground-color-700"
                    @click="discover">
                {{ xb.getString("search") }}
            </button>
        </ul>
    </div>
    <div class="searching-result-wrap">
        <div class="chats-list-wrap" ref="scrollWrap">
            <div class="result-string">{{ resultString }}</div>
            <div class="preloader-wrapper preloader-17px active" v-show="loading">
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
            <div class="chats-list">
                <GroupchatItem v-for="chat in chatResults" :key="chat.jid"
                              :name="chat.name" :jid="chat.jid" :color="accountColorName"
                              :avatar-img="chat.avatar"
                              @select="getChatProperties" />
            </div>
        </div>
        <div class="searching-more">
            <MoreInfoPanel :chat="selectedChat" :account="selectedAccount"
                           @joined="selectedChat = null" />
        </div>
    </div>
</template>

<script setup>
import { ref, shallowRef, computed, onMounted, nextTick } from 'vue';
import { useXabber } from '../../composables/useXabber.js';
import AccountItem from './AccountItem.vue';
import GroupchatItem from './GroupchatItem.vue';
import MoreInfoPanel from './MoreInfoPanel.vue';

const xb = useXabber();
const env = xb.env;
const $ = env.$;
const $iq = env.$iq;
const Strophe = env.Strophe;
const Images = env.utils.images;

const searchQuery = ref('');
const propertiesVisible = ref(false);
const dropdownOpen = ref(false);
const loading = ref(false);
const resultString = ref('');
const chatResults = shallowRef([]);
const selectedChat = shallowRef(null);
const selectedAccount = shallowRef(null);
const connectedAccounts = shallowRef([]);
const scrollWrap = ref(null);

const accountColor = computed(() => {
    if (selectedAccount.value) {
        return selectedAccount.value.settings.get('color') || '#9E9E9E';
    }
    return '#9E9E9E';
});

const accountColorName = computed(() => {
    if (selectedAccount.value) {
        return selectedAccount.value.settings.get('color') || '';
    }
    return '';
});

function toggleProperties() {
    propertiesVisible.value = !propertiesVisible.value;
}

function selectAccount(account) {
    selectedAccount.value = account;
    dropdownOpen.value = false;
}

function onKeyUp(ev) {
    if (ev.keyCode === 13) {
        discover();
    }
}

function discover() {
    let domain = searchQuery.value.trim();
    if (domain) {
        if (propertiesVisible.value) {
            propertiesVisible.value = false;
        }
        selectedChat.value = null;
        resultString.value = '';
        loading.value = true;
        chatResults.value = [];
        searchExistingGroupChats(domain);
    }
}

function searchExistingGroupChats(domain) {
    selectedAccount.value.connection.disco.items(
        domain, null,
        getGroupchatService,
        onDiscoveringError
    );
}

function onDiscoveringError(error) {
    loading.value = false;
    chatResults.value = [];
    resultString.value = xb.getString("discover__no_matches", [$(error).attr('from')]);
}

function getGroupchatService(stanza) {
    $(stanza).find('query item').each((idx, item) => {
        if ($(item).attr('node') === Strophe.NS.GROUP_CHAT) {
            let jid = $(item).attr('jid');
            getGroupchatFeatures(jid);
        }
    });
    loading.value = false;
}

function getGroupchatFeatures(jid) {
    let iq = $iq({ type: 'get', to: jid })
        .c('query', { xmlns: Strophe.NS.DISCO_INFO, node: Strophe.NS.GROUP_CHAT });
    selectedAccount.value.sendIQFast(iq, getServerInfo, onDiscoveringError);
}

function getServerInfo(stanza) {
    $(stanza).find('query identity').each((idx, item) => {
        let $item = $(item);
        if (($item.attr('category') === 'conference') && ($item.attr('type') === 'server')) {
            let jid = $(stanza).attr('from');
            getChatsFromServer(jid);
        }
    });
}

function getChatsFromServer(jid) {
    let iq = $iq({ type: 'get', to: jid })
        .c('query', { xmlns: Strophe.NS.DISCO_ITEMS, node: Strophe.NS.GROUP_CHAT });
    selectedAccount.value.sendIQFast(iq, (stanza) => {
        let results = [];
        $(stanza).find('query item').each((idx, item) => {
            let $item = $(item),
                name = $item.attr('name'),
                chatJid = $item.attr('jid'),
                avatar = Images.getDefaultAvatar(name);
            results.push({ name, jid: chatJid, avatar });
        });
        chatResults.value = results;
        resultString.value = xb.getString("discover__text_discovered_groups",
            [$(stanza).find('query item').length, selectedAccount.value.get('jid')]);
    });
}

function getChatProperties({ name, jid }) {
    let request_iq = $iq({ type: 'get', to: jid })
        .c('query', { xmlns: Strophe.NS.DISCO_INFO });
    selectedAccount.value.sendIQFast(request_iq, (iq_response) => {
        let $iq_response = $(iq_response),
            description = $iq_response.find('field[var="description"] value').text(),
            privacy = $iq_response.find('field[var="anonymous"] value').text(),
            membership = $iq_response.find('field[var="model"] value').text();
        selectedChat.value = { jid, name, privacy, description, membership };
    });
}

function resetState() {
    searchQuery.value = '';
    propertiesVisible.value = false;
    dropdownOpen.value = false;
    loading.value = false;
    resultString.value = '';
    chatResults.value = [];
    selectedChat.value = null;

    connectedAccounts.value = xb.accounts.connected;
    if (connectedAccounts.value.length) {
        selectedAccount.value = connectedAccounts.value[0];
    }
}

function onShow() {
    resetState();
    nextTick(() => {
        if (scrollWrap.value) {
            $(scrollWrap.value).perfectScrollbar(
                Object.assign({ wheelPropagation: true, theme: 'existing-chats-list' }, xb.ps_settings)
            );
        }
    });
}

function onHide() {
    // cleanup if needed
}

defineExpose({ onShow, onHide });
</script>
