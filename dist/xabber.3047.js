"use strict";(self.webpackChunkxabber_web=self.webpackChunkxabber_web||[]).push([[3047],{93047:(i,n,a)=>{a.r(n),a.d(n,{default:()=>e});const e='<div class="block-header">\n    <div class="btn-vcard-refresh">\n        <div class="button">\n            <i class="mdi mdi-20px mdi-refresh"></i>\n        </div>\n        <div class="preloader-wrapper preloader-20px active">\n            <div class="spinner-layer">\n                <div class="circle-clipper left">\n                    <div class="circle"></div>\n                </div>\n                <div class="gap-patch">\n                    <div class="circle"></div>\n                </div>\n                <div class="circle-clipper right">\n                    <div class="circle"></div>\n                </div>\n            </div>\n        </div>\n    </div>\n</div>\n<div class="vcard-wrap">\n    <div class="info-wrap jid-info-wrap hidden" title=\'{[print(xabber.getString("group_settings__properties__tooltip_copy_by_click"))]}\'>\n        <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" data-svgname="id-outline"></svg></div>\n        <div class="info-hover">\n            <div class="info jabber-id">\n                <div class="value one-line"></div>\n                <div class="label">{[print(xabber.getString("vcard_jabber_id"))]}</div>\n            </div>\n        </div>\n    </div>\n    <div class="info-wrap nickname-info-wrap hidden" title=\'{[print(xabber.getString("group_settings__properties__tooltip_copy_by_click"))]}\'>\n        <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" data-svgname="account-outline"></svg></div>\n        <div class="info-hover">\n            <div class="info nickname">\n                <div class="value one-line"></div>\n                <div class="label">{[print(xabber.getString("vcard_nick_name"))]}</div>\n            </div>\n        </div>\n    </div>\n    <div class="info-wrap personal-info-wrap hidden" title=\'{[print(xabber.getString("group_settings__properties__tooltip_copy_by_click"))]}\'>\n        <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" data-svgname="fullname-outline"></svg></div>\n        <div class="info-hover">\n            <div class="info first-name">\n                <div class="value one-line"></div>\n                <div class="label">{[print(xabber.getString("vcard_given_name"))]}</div>\n            </div>\n        </div>\n        <div class="info-hover">\n            <div class="info last-name">\n                <div class="value one-line"></div>\n                <div class="label">{[print(xabber.getString("vcard_family_name"))]}</div>\n            </div>\n        </div>\n    </div>\n    <div class="info-wrap birthday-info-wrap hidden" title=\'{[print(xabber.getString("group_settings__properties__tooltip_copy_by_click"))]}\'>\n        <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" data-svgname="birthday-outline"></svg></div>\n        <div class="info-hover">\n            <div class="info birthday">\n                <div class="value one-line"></div>\n                <div class="label">{[print(xabber.getString("vcard_birth_date"))]}</div>\n            </div>\n        </div>\n    </div>\n    <div class="info-wrap site-info-wrap hidden" title=\'{[print(xabber.getString("group_settings__properties__tooltip_copy_by_click"))]}\'>\n        <i class="details-icon mdi mdi-24px mdi-web"></i>\n        <div class="info-hover">\n            <div class="info url">\n                <div class="value one-line"></div>\n                <div class="label">{[print(xabber.getString("vcard_url"))]}</div>\n            </div>\n        </div>\n    </div>\n    <div class="info-wrap more">\n        <div class="show-vcard">\n            {[print(xabber.getString("contact_vcard_more"))]}\n        </div>\n    </div>\n</div>\n<div class="full-vcard-wrap">\n    <div class="full-vcard-content">\n        <div class="vcard-header block-header">\n            <div class="vcard-header-title">\n                <i class="details-icon btn-back mdi mdi-24px mdi-arrow-left"></i>\n                <span class="block-name">{[print(xabber.getString("contact_vcard_header_title"))]}</span>\n            </div>\n            <div class="main-info">\n                <div class="avatar-wrap">\n                    <div class="circle-avatar"/>\n                </div>\n                <div class="text-info">\n                    <div class="name-wrap"></div>\n                </div>\n            </div>\n        </div>\n        <div class="vcard-list">\n            <div class="info-wrap jid-info-wrap hidden" title=\'{[print(xabber.getString("group_settings__properties__tooltip_copy_by_click"))]}\'>\n                <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" data-svgname="id-outline"></svg></div>\n                <div class="info-hover">\n                    <div class="info jabber-id">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_jabber_id"))]}</div>\n                    </div>\n                </div>\n            </div>\n            <div class="info-wrap nickname-info-wrap hidden" title=\'{[print(xabber.getString("group_settings__properties__tooltip_copy_by_click"))]}\'>\n                <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" data-svgname="account-outline"></svg></div>\n                <div class="info-hover">\n                    <div class="info nickname">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_nick_name"))]}</div>\n                    </div>\n                </div>\n            </div>\n            <div class="info-wrap personal-info-wrap hidden" title=\'{[print(xabber.getString("group_settings__properties__tooltip_copy_by_click"))]}\'>\n                <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" data-svgname="fullname-outline"></svg></div>\n                <div class="info-hover">\n                    <div class="info first-name">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_given_name"))]}</div>\n                    </div>\n                </div>\n                <div class="info-hover">\n                    <div class="info middle-name">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_middle_name"))]}</div>\n                    </div>\n                </div>\n                <div class="info-hover">\n                    <div class="info last-name">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_family_name"))]}</div>\n                    </div>\n                </div>\n                <div class="info-hover">\n                    <div class="info fullname">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_full_name"))]}</div>\n                    </div>\n                </div>\n            </div>\n            <div class="info-wrap birthday-info-wrap hidden" title=\'{[print(xabber.getString("group_settings__properties__tooltip_copy_by_click"))]}\'>\n                <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" data-svgname="birthday-outline"></svg></div>\n                <div class="info-hover">\n                    <div class="info birthday">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_birth_date"))]}</div>\n                    </div>\n                </div>\n            </div>\n            <div class="info-wrap job-info-wrap hidden" title=\'{[print(xabber.getString("group_settings__properties__tooltip_copy_by_click"))]}\'>\n                <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" data-svgname="job-outline"></svg></div>\n                <div class="info-hover">\n                    <div class="info org-name">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_organization"))]}</div>\n                    </div>\n                </div>\n                <div class="info-hover">\n                    <div class="info job-title">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_title"))]}</div>\n                    </div>\n                </div>\n                <div class="info-hover">\n                    <div class="info org-unit">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_organization_unit"))]}</div>\n                    </div>\n                </div>\n                <div class="info-hover">\n                    <div class="info role">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_role"))]}</div>\n                    </div>\n                </div>\n            </div>\n            <div class="info-wrap site-info-wrap hidden" title=\'{[print(xabber.getString("group_settings__properties__tooltip_copy_by_click"))]}\'>\n                <i class="details-icon mdi mdi-24px mdi-web"></i>\n                <div class="info-hover">\n                    <div class="info url">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_url"))]}</div>\n                    </div>\n                </div>\n            </div>\n            <div class="info-wrap description-info-wrap hidden" title=\'{[print(xabber.getString("group_settings__properties__tooltip_copy_by_click"))]}\'>\n                <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" data-svgname="description-outline"></svg></div>\n                <div class="info-hover">\n                    <div class="info description">\n                        <div class="value"></div>\n                        <div class="label">{[print(xabber.getString("vcard_decsription"))]}</div>\n                    </div>\n                </div>\n            </div>\n            <div class="info-wrap phone-info-wrap hidden" title=\'{[print(xabber.getString("group_settings__properties__tooltip_copy_by_click"))]}\'>\n                <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" data-svgname="call-outline"></svg></div>\n                <div class="info-hover">\n                    <div class="info phone-work">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_type_work"))]}</div>\n                    </div>\n                </div>\n                <div class="info-hover">\n                    <div class="info phone-home">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_type_home"))]}</div>\n                    </div>\n                </div>\n                <div class="info-hover">\n                    <div class="info phone-mobile">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_type_mobile"))]}</div>\n                    </div>\n                </div>\n                <div class="info-hover">\n                    <div class="info phone-default">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_telephone"))]}</div>\n                    </div>\n                </div>\n            </div>\n            <div class="info-wrap email-info-wrap hidden" title=\'{[print(xabber.getString("group_settings__properties__tooltip_copy_by_click"))]}\'>\n                <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" data-svgname="email-outline"></svg></div>\n                <div class="info-hover">\n                    <div class="info email-work">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_type_work"))]}</div>\n                    </div>\n                </div>\n                <div class="info-hover">\n                    <div class="info email-home">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_type_personal"))]}</div>\n                    </div>\n                </div>\n                <div class="info-hover">\n                    <div class="info email-default">\n                        <div class="value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_email"))]}</div>\n                    </div>\n                </div>\n            </div>\n            <div class="info-wrap address-info-wrap hidden" title=\'{[print(xabber.getString("group_settings__properties__tooltip_copy_by_click"))]}\'>\n                <div class="details-icon-wrap"><svg class="details-icon mdi mdi-24px mdi-svg-template" data-svgname="job-outline"></svg></div>\n                <div class="info-hover">\n                    <div class="info address-home">\n                        <div class="pobox value one-line"></div>\n                        <div class="extadd value one-line"></div>\n                        <div class="street value one-line"></div>\n                        <div class="locality value one-line"></div>\n                        <div class="region value one-line"></div>\n                        <div class="pcode value one-line"></div>\n                        <div class="country value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_type_home"))]}</div>\n                    </div>\n                </div>\n                <div class="info-hover">\n                    <div class="info address-work">\n                        <div class="pobox value one-line"></div>\n                        <div class="extadd value one-line"></div>\n                        <div class="street value one-line"></div>\n                        <div class="locality value one-line"></div>\n                        <div class="region value one-line"></div>\n                        <div class="pcode value one-line"></div>\n                        <div class="country value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_type_work"))]}</div>\n                    </div>\n                </div>\n                <div class="info-hover">\n                    <div class="info address-default">\n                        <div class="extadd value one-line"></div>\n                        <div class="street value one-line"></div>\n                        <div class="locality value one-line"></div>\n                        <div class="region value one-line"></div>\n                        <div class="pcode value one-line"></div>\n                        <div class="country value one-line"></div>\n                        <div class="label">{[print(xabber.getString("vcard_address"))]}</div>\n                    </div>\n                </div>\n            </div>\n            <div class="resources-block-wrap hidden">\n                <div class="resources-wrap">\n                </div>\n            </div>\n        </div>\n    </div>\n</div>'}}]);
//# sourceMappingURL=xabber.3047.js.map