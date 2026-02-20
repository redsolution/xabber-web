<template>
    <div class="left-column noselect vue-migrated">
        <div class="main-info-wrap xabber-info-wrap">
            <div class="picture-wrap">
                <img class="logo" :src="clientLogo"/>
            </div>
            <div class="name">{{ clientName }}</div>
            <div class="version"></div>
        </div>
    </div>

    <div class="right-column noselect vue-migrated">
        <div class="settings-panel-head">
            <span>{{ xb.getString("category_about") }}</span>
        </div>

        <div class="panel-content-wrap">
            <div class="panel-content">
                <div class="settings-block-wrap about">
                    <div class="block-content" v-html="xb.getString('web_client__screen_about__preamble_1', [shortClientName, shortClientName])"></div>
                    <div class="block-content" v-html="xb.getString('web_client__screen_about__preamble_2', [`<a href=&quot;${clientUrl}&quot; target=&quot;_blank&quot;>${clientUrl}</a>`])"></div>
                    <div class="block-header">
                        <span class="block-name">{{ xb.getString("web_client__screen_about__block_1__header") }}</span>
                    </div>
                    <div class="block-content">{{ xb.getString("web_client__screen_about__block_1__text") }}</div>

                    <div class="block-header">
                        <span class="block-name">{{ xb.getString("web_client__screen_about__block_2__header") }}</span>
                    </div>
                    <div class="block-content">{{ xb.getString("web_client__screen_about__block_2__text", [shortClientName]) }}</div>

                    <div class="block-header">
                        <span class="block-name">{{ xb.getString("web_client__screen_about__block_3__header") }}</span>
                    </div>
                    <div class="block-content" v-html="xb.getString('web_client__screen_about__block_3__text_1', [fullClientName, `<a href=&quot;${developerUrl}&quot; target=&quot;_blank&quot;>${xb.getString('client_developer_company_name')}</a>`, shortClientName])"></div>
                    <div class="block-content">{{ xb.getString("web_client__screen_about__block_3__text_2", [shortClientName]) }}</div>
                    <div class="block-content">{{ xb.getString("web_client__screen_about__block_3__text_3") }}</div>
                    <div class="block-content flex-content">
                        <img class="logo" :src="'images/redsolution-logo.png'"/>
                        <a href="https://twitter.com/Xabber_XMPP" target="_blank"><div class="btn-social twitter-color">
                            <i class="mdi mdi-28px mdi-twitter"></i>
                        </div></a>
                        <a :href="clientGithubUrl" target="_blank"><img class="btn-social github-logo" :src="'images/ic_github.png'"/></a>
                    </div>

                    <div class="block-header">
                        <span class="block-name">{{ xb.getString("web_client__screen_about__block_4__header") }}</span>
                    </div>
                    <div class="block-content">{{ xb.getString("web_client__screen_about__block_4__text_1", [shortClientName]) }}</div>
                    <div class="block-content" v-html="xb.getString('web_client__screen_about__block_4__text_2', [`<a href=&quot;${projectCrowdinUrl}&quot; target=&quot;_blank&quot;>${xb.getString('web_client__screen_about__block_4__text_2__link__text', [shortClientName])}</a>`])"></div>

                    <div class="block-header">
                        <span class="block-name">{{ xb.getString("web_client__screen_about__block_5__header") }}</span>
                    </div>
                    <div class="block-content" v-html="xb.getString('web_client__screen_about__block_5__text_1', [fullClientName, `<a href=&quot;${clientGithubUrl}&quot; target=&quot;_blank&quot;>${xb.getString('web_client__screen_about__block_5__text_1__link__text')}</a>`])"></div>
                    <div class="block-content">{{ xb.getString("web_client__screen_about__block_5__text_2") }}</div>
                    <div class="block-content" v-html="xb.getString('web_client__screen_about__block_5__text_3', [shortClientName, xb.getString('client_developer_company_name'), `<a href=&quot;${developerUrl}&quot; target=&quot;_blank&quot;>${xb.getString('client_developer_company_full_name')}</a>`])"></div>
                    <div class="block-content" v-html="xb.getString('web_client__screen_about__block_5__text_4', [fullClientName, `<a href=&quot;${clientLicenseGithubUrl}&quot; target=&quot;_blank&quot;>${xb.getString('web_client__screen_about__block_5__text_4__link__text')}</a>`])"></div>
                </div>
            </div>
        </div>
    </div>
</template>

<script setup>
import { useXabber } from '../../composables/useXabber.js';

const xb = useXabber();

const constants = xb.env.constants;
const clientLogo = constants.CLIENT_LOGO;
const clientName = constants.CLIENT_NAME;
const fullClientName = constants.CLIENT_NAME;
const shortClientName = constants.SHORT_CLIENT_NAME;
const clientUrl = constants.CLIENT_URL;
const developerUrl = constants.DEVELOPER_URL;
const clientGithubUrl = constants.CLIENT_GITHUB_URL;
const projectCrowdinUrl = constants.PROJECT_CROWDIN_URL;
const clientLicenseGithubUrl = constants.CLIENT_LICENSE_GITHUB_URL;

let backboneView = null;

function setBackboneView(view) {
    backboneView = view;
}

defineExpose({
    setBackboneView,
});
</script>
