"use strict";(self.webpackChunkxabber_web=self.webpackChunkxabber_web||[]).push([[4335],{74335:(i,e,s)=>{s.r(e),s.d(e,{default:()=>n});const n='    <div class="message-input-panel noselect">\n        <div class="my-avatar circle-avatar circle-image-fix"></div>\n        <div class="message-form">\n            <div class="fwd-messages-preview noselect hidden">\n                <div class="msg-border ground-color-700">\n                </div>\n                <div class="msg-content">\n                    <p class="msg-author text-color-700 one-line"></p>\n                    <p class="msg-text one-line"></p>\n                </div>\n                <div class="close-forward">\n                    <i class="mdi mdi-20px mdi-close hover-text-color-500"></i>\n                </div>\n            </div>\n            <div class="message-reference-preview hidden">\n                <div class="message-reference-preview-container">\n                </div>\n                <div class="close-attachments">\n                    <i class="mdi mdi-20px mdi-close hover-text-color-500"></i>\n                </div>\n            </div>\n            <div class="input-field input-message">\n                <div class="mentions-list"></div>\n                <div class="rich-textarea-wrap notranslate">\n                </div>\n                <div class="scrollbar-cover"></div>\n                <div class="insert-emoticon">\n                    <i class="mdi mdi-24px mdi-emoticon hover-text-color-500"></i>\n                </div>\n                <div class="preview-preloader-container hidden" title=\'{[print(xabber.getString("chat_bottom__preview_preloader_cancel"))]}\'>\n                    <svg class="preview-cancel-preloader mdi mdi-24px mdi-svg-template" data-svgname="link"></svg>\n                </div>\n                <div class="emoticons-panel-wrap">\n                    <div class="emoticons-panel"></div>\n                    <div class="emoji-menu"></div>\n                    <div class="uploading-emoticons">\n                    <div class="preloader-wrapper preloader-20px active visible">\n                        <div class="spinner-layer">\n                            <div class="circle-clipper left">\n                                <div class="circle"></div>\n                            </div>\n                            <div class="gap-patch">\n                                <div class="circle"></div>\n                            </div>\n                            <div class="circle-clipper right">\n                                <div class="circle"></div>\n                            </div>\n                        </div>\n                    </div>\n                    </div>\n                </div>\n            </div>\n            <div class="input-voice-message">\n                <div class="voice-visualizer"></div>\n                <div class="timer">0:00</div>\n                <div class="voice-msg-status">{[print(xabber.getString("chat_bottom__placeholder__cancel_write_voice"))]}</div>\n            </div>\n            <div class="input-toolbar">\n                <div class="attach attach-file">\n                    <input type="file" title=\'{[print(xabber.getString("chat_bottom__tooltip_send_file"))]}\' multiple>\n                    <i class="mdi mdi-24px mdi-paperclip"></i>\n                </div>\n                <div class="attach attach-media" title=\'{[print(xabber.getString("chat_bottom__tooltip_send_media"))]}\'>\n                    <i class="mdi mdi-24px mdi-file-image"></i>\n                </div>\n                <div class="attach attach-location" title=\'{[print(xabber.getString("chat_bottom__tooltip_send_location"))]}\'>\n                    <input type="text" hidden title=\'{[print(xabber.getString("chat_bottom__tooltip_send_location"))]}\'>\n                    <i class="mdi mdi-24px mdi-map-marker"></i>\n                </div>\n                <div title="Format text" class="format-text">\n                    <i class="mdi mdi-24px mdi-format-text"></i>\n                </div>\n                <div class="last-emoticons">\n                </div>\n                <div class="account-info-wrap">\n                    <div class="account-jid text-color-700"></div>\n                    <div class="account-nickname text-color-700"></div>\n                    <div class="account-badge"></div>\n                    <div class="account-role ground-color-700"></div>\n                </div>\n            </div>\n        </div>\n        <div class="send-area">\n            <i class="send-message mdi mdi-32px mdi-send text-color-700 hover-text-color-500 hidden"></i>\n            <i class="mdi mdi-32px mdi-microphone attach-voice-message text-color-700 hover-text-color-500"></i>\n        </div>\n    </div>\n    <div class="blocked-msg hidden">{[print(xabber.getString("chat_bottom__placeholder__blocked"))]}</div>\n    <div class="message-actions-panel noselect hidden">\n        <div class="button-wrap reply-message-wrap">\n            <i class="action-button reply-message mdi ground-color-700 mdi-reply mdi-24px"></i>\n            <div class="button-name"><span class="text-color-500">{[print(xabber.getString("chat_reply").slice(0,1))]}</span>{[print(xabber.getString("chat_reply").slice(1))]}</div>\n        </div>\n        <div class="button-wrap forward-message-wrap">\n            <i class="action-button forward-message mdi ground-color-700 mdi-forward mdi-24px"></i>\n            <div class="button-name"><span class="text-color-500">{[print(xabber.getString("chat_froward").slice(0,1))]}</span>{[print(xabber.getString("chat_froward").slice(1))]}</div>\n        </div>\n        <div class="button-wrap copy-message-wrap">\n            <i class="action-button copy-message mdi ground-color-700 mdi-content-copy mdi-24px"></i>\n            <div class="button-name"><span class="text-color-500">{[print(xabber.getString("message_copy").slice(0,1))]}</span>{[print(xabber.getString("message_copy").slice(1))]}</div>\n        </div>\n        <div class="button-wrap delete-message-wrap">\n            <i class="action-button delete-message mdi ground-color-700 mdi-delete mdi-24px"></i>\n            <div class="button-name"><span class="text-color-500">{[print(xabber.getString("delete").slice(0,1))]}</span>{[print(xabber.getString("delete").slice(1))]}</div>\n        </div>\n        <div class="button-wrap edit-message-wrap">\n            <i class="action-button edit-message mdi ground-color-700 mdi-pencil mdi-24px"></i>\n            <div class="button-name"><span class="text-color-500">{[print(xabber.getString("message_edit").slice(0,1))]}</span>{[print(xabber.getString("message_edit").slice(1))]}</div>\n        </div>\n        <div class="button-wrap pin-message-wrap">\n            <svg class="action-button pin-message ground-color-700" viewBox="0 0 24 24">\n                <path fill="#FFF" d="M16,12V4H17V2H7V4H8V12L6,14V16H11.2V22H12.8V16H18V14L16,12Z"/>\n            </svg>\n            <div class="button-name"><span class="text-color-500">{[print(xabber.getString("message_pin").slice(0,1))]}</span>{[print(xabber.getString("message_pin").slice(1))]}</div>\n        </div>\n        <div class="button-wrap cancel-message-wrap">\n            <i class="action-button close-message-panel mdi mdi-close mdi-24px"></i>\n            <div class="button-name">{[print(xabber.getString("cancel"))]}</div>\n        </div>\n    </div>\n'}}]);
//# sourceMappingURL=xabber.4335.js.map