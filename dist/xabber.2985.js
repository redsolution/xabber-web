"use strict";(self.webpackChunkxabber_web=self.webpackChunkxabber_web||[]).push([[2985],{62985:(n,t,o)=>{o.r(t),o.d(t,{default:()=>a});const a='<div class="modal dialog-modal {{modal_class}}">\n    <div class="modal-header">\n        <div class="panel-header black-text">{{header}}</div>\n    </div>\n    <div class="modal-content">\n        <div class="dialog-text">{{text}}</div>\n        <div class="dialog-options-wrap">\n        {[ for (var idx in dialog_options) { var option = dialog_options[idx]; ]}\n            <div class="dialog-option" data-name="{{option.name}}">\n                <input type="checkbox" class="filled-in" id="dialog_option_{{option.name}}" {[ if (option.checked) { ]}checked="checked"{[ } ]}/>\n                <label for="dialog_option_{{option.name}}">{{option.text}}</label>\n            </div>\n        {[ } ]}\n        </div>\n        <div class="container-for-img hidden"><img class="img-from-clipboard"></div>\n    </div>\n    <div class="modal-footer {{flag}}">\n        {[ for (var idx in optional_buttons) { var button = optional_buttons[idx]; ]}\n        <button class="optional-button btn-flat btn-main" data-option="{{button.value}}">{{button.name}}</button>\n        {[ } ]}\n        {[ if (ok_button) { ]}\n        <button class="ok-button btn-flat btn-main" data-option=true>{{ok_button.text}}</button>\n        {[ } ]}\n        {[ if (cancel_button) { ]}\n        <button class="cancel-button btn-flat btn-main btn-dark btn-cancel" data-option=false>{{cancel_button.text}}</button>\n        {[ } ]}\n    </div>\n</div>\n'}}]);
//# sourceMappingURL=xabber.2985.js.map