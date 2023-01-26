"use strict";(self.webpackChunkxabber_web=self.webpackChunkxabber_web||[]).push([[1803],{11803:(i,e,n)=>{n.r(e),n.d(e,{default:()=>d});const d='    <div class="right-column noselect">\n        <div class="settings-panel-head">\n            <span>{[print(xabber.getString("vcard_edit__header"))]}</span>\n            <div class="buttons-wrap">\n                <button class="btn-vcard-back btn-flat btn-main btn-dark ground-color-grey-100 hover-ground-color-grey-300">{[print(xabber.getString("vcard_edit__button_cancel"))]}</button>\n                <button class="btn-vcard-save btn-flat btn-main text-color-500 ground-color-grey-100 hover-ground-color-grey-300">{[print(xabber.getString("vcard_edit__button_save"))]}</button>\n            </div>\n        </div>\n\n        <div class="panel-content-wrap">\n            <div class="panel-content details-panel">\n\n                <div class="settings-block-wrap vcard">\n                    <div class="vcard-edit-wrap">\n                        <div class="info-wrap personal-info-wrap">\n                            <i class="details-icon mdi mdi-24px mdi-account-card-details"></i>\n                            <div class="input-field first-name">\n                                <input id="{{view.cid}}-first-name" placeholder="{[print(xabber.getString(\'vcard_given_name\'))]}" type="text" name="first_name">\n                            </div>\n                            <div class="input-field middle-name">\n                                <input id="{{view.cid}}-middle-name" placeholder="{[print(xabber.getString(\'vcard_middle_name\'))]}" type="text" name="middle_name">\n                            </div>\n                            <div class="input-field last-name">\n                                <input id="{{view.cid}}-last-name" placeholder="{[print(xabber.getString(\'vcard_family_name\'))]}" type="text" name="last_name">\n                            </div>\n                            <div class="input-field fullname">\n                                <input id="{{view.cid}}-fullname" placeholder="{[print(xabber.getString(\'vcard_full_name\'))]}" type="text" name="fullname">\n                            </div>\n                        </div>\n\n                        <div class="info-wrap nickname-info-wrap">\n                            <div class="input-label">{[print(xabber.getString("vcard_nick_name"))]}</div>\n                            <i class="details-icon mdi mdi-24px mdi-account-box-outline"></i>\n                            <div class="input-field nickname">\n                                <input id="{{view.cid}}-nickname" placeholder="{[print(xabber.getString(\'vcard_nick_name\'))]}" type="text" name="nickname">\n                            </div>\n                        </div>\n\n                        <div class="info-wrap birthday-info-wrap">\n                            <div class="input-label">{[print(xabber.getString("vcard_birth_date"))]}</div>\n                            <i class="details-icon mdi mdi-24px mdi-cake-variant"></i>\n                            <div class="input-field birthday">\n                                <input id="{{view.cid}}-birthday" placeholder="{[print(xabber.getString(\'vcard_birth_date_placeholder\'))]}" type="text" class="datepicker">\n                            </div>\n                        </div>\n\n                        <div class="info-wrap job-info-wrap">\n                            <div class="input-label">{[print(xabber.getString("vcard_job"))]}</div>\n                            <i class="details-icon mdi mdi-24px mdi-briefcase"></i>\n                            <div class="input-field org-name">\n                                <input id="{{view.cid}}-org-name" placeholder="{[print(xabber.getString(\'vcard_organization\'))]}" type="text" name="org_name">\n                            </div>\n                            <div class="input-field job-title">\n                                <input id="{{view.cid}}-job-title" placeholder="{[print(xabber.getString(\'vcard_title\'))]}" type="text" name="job_title">\n                            </div>\n                            <div class="input-field org-unit">\n                                <input id="{{view.cid}}-org-unit" placeholder="{[print(xabber.getString(\'vcard_organization_unit\'))]}" type="text" name="org_unit">\n                            </div>\n                            <div class="input-field role">\n                                <input id="{{view.cid}}-role" placeholder="{[print(xabber.getString(\'vcard_role\'))]}" type="text" name="role">\n                            </div>\n                        </div>\n                        <div class="info-wrap site-info-wrap">\n                            <div class="input-label">{[print(xabber.getString("vcard_url"))]}</div>\n                            <i class="details-icon mdi mdi-24px mdi-web"></i>\n                            <div class="input-field url">\n                                <input id="{{view.cid}}-url" placeholder="{[print(xabber.getString(\'vcard_url_placeholder\'))]}" type="text" name="url">\n                            </div>\n                        </div>\n                        <div class="info-wrap description-info-wrap">\n                            <div class="input-label">{[print(xabber.getString("vcard_decsription"))]}</div>\n                            <i class="details-icon mdi mdi-24px mdi-file-document-box"></i>\n                            <div class="input-field description">\n                                <textarea id="{{view.cid}}-description" placeholder="{[print(xabber.getString(\'vcard_decsription_placeholder\'))]}" type="text" cols="30" rows="10" class="text-field materialize-textarea" name="description"></textarea>\n                            </div>\n                        </div>\n\n                        <div class="info-wrap phone-info-wrap">\n                            <div class="input-label">{[print(xabber.getString("vcard_telephone"))]}</div>\n                            <i class="details-icon mdi mdi-24px mdi-phone"></i>\n                            <div class="input-field phone-work">\n                                <input id="{{view.cid}}-phone-work" placeholder="{[print(xabber.getString(\'vcard_type_work\'))]}" type="text" name="phone_work">\n                            </div>\n                            <div class="input-field phone-home">\n                                <input id="{{view.cid}}-phone-home" placeholder="{[print(xabber.getString(\'vcard_type_home\'))]}" type="text" name="phone_home">\n                            </div>\n                            <div class="input-field phone-mobile">\n                                <input id="{{view.cid}}-phone-mobile" placeholder="{[print(xabber.getString(\'vcard_type_mobile\'))]}" type="text" name="phone_mobile">\n                            </div>\n                        </div>\n                        <div class="info-wrap email-info-wrap">\n                            <div class="input-label">{[print(xabber.getString("vcard_email"))]}</div>\n                            <i class="details-icon mdi mdi-24px mdi-email"></i>\n                            <div class="input-field email-work">\n                                <input id="{{view.cid}}-email-work" placeholder="{[print(xabber.getString(\'vcard_type_work\'))]}" type="text" name="email_work">\n                            </div>\n                            <div class="input-field email-home">\n                                <input id="{{view.cid}}-email-home" placeholder="{[print(xabber.getString(\'vcard_type_personal\'))]}" type="text" name="email_home">\n                            </div>\n                        </div>\n\n                        <div class="info-wrap address-info-wrap">\n                            <i class="details-icon mdi mdi-24px mdi-map-marker"></i>\n                            <div class="input-wrap address-wrap address-home-wrap">\n                                <div class="input-label">{[print(xabber.getString("vcard_home_address"))]}</div>\n                                <div class="input-field pobox">\n                                    <input id="{{view.cid}}-po-home-box" placeholder="{[print(xabber.getString(\'vcard_address_pobox\'))]}" type="text" name="po_home_box">\n                                </div>\n                                <div class="input-field extadd">\n                                    <input id="{{view.cid}}-addr-home-extadd" placeholder="{[print(xabber.getString(\'vcard_address_extadr\'))]}" type="text" name="addr_home_extadd">\n                                </div>\n                                <div class="input-field street">\n                                    <input id="{{view.cid}}-addr-home-street" placeholder="{[print(xabber.getString(\'vcard_address_street\'))]}" type="text" name="addr_home_street">\n                                </div>\n                                <div class="input-field locality">\n                                    <input id="{{view.cid}}-addr-home-locality" placeholder="{[print(xabber.getString(\'vcard_address_locality\'))]}" type="text" name="addr_home_locality">\n                                </div>\n                                <div class="input-field region">\n                                    <input id="{{view.cid}}-addr-home-region" placeholder="{[print(xabber.getString(\'vcard_address_region\'))]}" type="text" name="addr_home_region">\n                                </div>\n                                <div class="input-field pcode">\n                                    <input id="{{view.cid}}-addr-home-pcode" placeholder="{[print(xabber.getString(\'vcard_address_pcode\'))]}" type="text" name="addr_home_pcode">\n                                </div>\n                                <div class="input-field country">\n                                    <input id="{{view.cid}}-addr-home-country" placeholder="{[print(xabber.getString(\'vcard_address_ctry\'))]}" type="text" name="addr_home_country">\n                                </div>\n                            </div>\n                            <div class="input-wrap address-wrap address-work-wrap">\n                                <div class="input-label">{[print(xabber.getString("vcard_work_address"))]}</div>\n                                <div class="input-field pobox">\n                                    <input id="{{view.cid}}-po-work-box" placeholder="{[print(xabber.getString(\'vcard_address_pobox\'))]}" type="text" name="po_work_box">\n                                </div>\n                                <div class="input-field extadd">\n                                    <input id="{{view.cid}}-addr-work-extadd" placeholder="{[print(xabber.getString(\'vcard_address_extadr\'))]}" type="text" name="addr_work_extadd">\n                                </div>\n                                <div class="input-field street">\n                                    <input id="{{view.cid}}-addr-work-street" placeholder="{[print(xabber.getString(\'vcard_address_street\'))]}" type="text" name="addr_work_street">\n                                </div>\n                                <div class="input-field locality">\n                                    <input id="{{view.cid}}-addr-work-locality" placeholder="{[print(xabber.getString(\'vcard_address_locality\'))]}" type="text" name="addr_work_locality">\n                                </div>\n                                <div class="input-field region">\n                                    <input id="{{view.cid}}-addr-work-region" placeholder="{[print(xabber.getString(\'vcard_address_region\'))]}" type="text" name="addr_work_region">\n                                </div>\n                                <div class="input-field pcode">\n                                    <input id="{{view.cid}}-addr-work-pcode" placeholder="{[print(xabber.getString(\'vcard_address_pcode\'))]}" type="text" name="addr_work_pcode">\n                                </div>\n                                <div class="input-field country">\n                                    <input id="{{view.cid}}-addr-work-country" placeholder="{[print(xabber.getString(\'vcard_address_ctry\'))]}" type="text" name="addr_work_country">\n                                </div>\n                            </div>\n                        </div>\n                    </div>\n                </div>\n\n            </div>\n        </div>\n    </div>\n'}}]);
//# sourceMappingURL=xabber.1803.js.map