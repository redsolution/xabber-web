"use strict";(self.webpackChunkxabber_web=self.webpackChunkxabber_web||[]).push([[6311],{46311:(t,e,i)=>{i.r(e),i.d(e,{default:()=>a});const a='<div class="chat-message main {{classlist}} file-upload noselect"  {[if (avatar_id) {]} data-avatar="{{avatar_id}}" {[}]} {[if (avatar_url) {]} data-avatar-url="{{avatar_url}}" {[}]} data-time="{{timestamp}}" data-uniqueid="{{unique_id}}" {[if (from_id) {]} data-from-id="{{from_id}}" {[}]} data-from="{{from_jid}}">\n    <div class="left-side noselect">\n        <div class="circle-avatar"></div>\n    </div>\n\n    <div class="msg-wrap">\n        <div class="chat-msg-author-wrap">\n            <div class="chat-msg-author text-color-700 one-line">{{username}}</div>\n            {[if (badge) {]} <div class="chat-msg-author-badge one-line">{{badge}}</div>\n            {[ } if (role && (role.toLowerCase() != \'member\')) {]} <div class="chat-msg-author-role ground-color-700 one-line">{{role}}</div> {[}]}\n        </div>\n        <div class="fwd-msgs-block"></div>\n        <div class="chat-msg-content chat-text-content">{{message}}</div>\n        <div class="chat-msg-link-reference-content"></div>\n        <div class="chat-msg-media-content chat-main-upload-media">\n        </div>\n        <div class="chat-msg-location-content no-title" title="{[print(xabber.getString(\'location_fragment__address_error__title\'))]}"></div>\n    </div>\n\n    <div class="right-side noselect">\n        <div class="msg-time selectable-text" title="{{time}}">{{short_time}}</div>\n        <div class="edited-info one-line hidden"></div>\n        {[ if (is_sender) { ]}\n        <i class="msg-delivering-state mdi mdi-14px" data-state="{{state}}" title="{{verbose_state}}" data-activates="retry-send-msg-{{msgid}}"></i>\n        <div id="retry-send-msg-{{msgid}}" class="dropdown-content retry-send-message noselect">\n            <div class="msg-retry-dropdown-btn active-ground-color-600 repeat-upload">{[print(xabber.getString("resend"))]}</div>\n            <div class="msg-retry-dropdown-btn active-ground-color-600 edit-upload">{[print(xabber.getString("edit"))]}</div>\n            <div class="msg-retry-dropdown-btn active-ground-color-600 btn-delete-message">{[print(xabber.getString("delete"))]}</div>\n        </div>\n        {[ } ]}\n        <div class="msg-copy-link" title=\'{[print(xabber.getString("action_copy_link"))]}\'><i class="mdi mdi-link-variant" data-image="{{is_image}}"></i></div>\n        <div class="msg-copy-location"  title=\'{[print(xabber.getString("action_copy_location"))]}\'><div class="msg-copy-location-content" data-location="false"></div></div>\n    </div>\n</div>'}}]);
//# sourceMappingURL=xabber.6311.js.map