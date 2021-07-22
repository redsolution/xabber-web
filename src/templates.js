define("xabber-templates", [
    "underscore",
    "jquery",

    "text!templates/base/dialog.html",
    "text!templates/base/fingerprints.html",
    "text!templates/base/fingerprint_item.html",
    "text!templates/base/jingle_message_calling.html",
    "text!templates/base/input_widget.html",
    "text!templates/base/toolbar.html",
    "text!templates/base/settings.html",
    "text!templates/base/about.html",
    "text!templates/base/omemo_enable.html",
    "text!templates/base/backgrounds_gallery.html",
    "text!templates/base/color_picker.html",
    "text!templates/base/color_scheme.html",

    "text!templates/api_service/xabber_login.html",
    "text!templates/api_service/xabber_login_by_email.html",
    "text!templates/api_service/xabber_account.html",
    "text!templates/api_service/linked_email_item.html",
    "text!templates/api_service/add_xabber_account.html",
    "text!templates/api_service/sync_settings.html",
    "text!templates/api_service/sync_settings_account_item.html",

    "text!templates/accounts/xmpp_login.html",
    "text!templates/accounts/add_account.html",
    "text!templates/accounts/change_password.html",
    "text!templates/accounts/toolbar_item.html",
    "text!templates/accounts/settings_left.html",
    "text!templates/accounts/settings_right.html",
    "text!templates/accounts/existing_groupchat_item.html",
    "text!templates/accounts/resource.html",
    "text!templates/accounts/global_settings_item.html",
    "text!templates/accounts/change_status.html",
    "text!templates/accounts/token_item.html",
    "text!templates/accounts/current_token_item.html",

    "text!templates/vcard/vcard.html",
    "text!templates/vcard/vcard_edit.html",

    "text!templates/searching/searching_wide.html",
    "text!templates/searching/searching_account_item.html",
    "text!templates/searching/existing_groupchat_item.html",
    "text!templates/searching/existing_groupchat_details_view.html",

    "text!templates/contacts/roster_right.html",
    "text!templates/contacts/roster_left.html",
    "text!templates/contacts/account_roster_right.html",
    "text!templates/contacts/account_roster_left.html",
    "text!templates/contacts/roster_left.html",
    "text!templates/contacts/group_right.html",
    "text!templates/contacts/group_left.html",
    "text!templates/contacts/add_contact.html",
    "text!templates/contacts/contact_right_item.html",
    "text!templates/contacts/contact_left_item.html",
    "text!templates/contacts/contact_blocked_item.html",
    "text!templates/contacts/contact_details.html",
    "text!templates/contacts/roster_settings.html",
    "text!templates/contacts/group_settings.html",
    "text!templates/contacts/groups_checkbox_list.html",
    "text!templates/contacts/add_contact_account_item.html",
    "text!templates/contacts/contact_placeholder.html",
    "text!templates/contacts/groups.html",
    "text!templates/contacts/preloader.html",
    "text!templates/contacts/group_chats/group_chat_properties.html",
    "text!templates/contacts/group_chats/group_chat_details.html",
    "text!templates/contacts/group_chats/invitation.html",
    "text!templates/contacts/group_chats/group_chat_properties_edit.html",
    "text!templates/contacts/group_chats/default_restrictions.html",
    "text!templates/contacts/group_chats/group_member_item.html",
    "text!templates/contacts/group_chats/invited_member_item.html",
    "text!templates/contacts/group_chats/participant_rights.html",
    "text!templates/contacts/group_chats/restriction_item.html",
    "text!templates/contacts/group_chats/right_expire_variants.html",
    "text!templates/contacts/group_chats/pinned_message.html",
    "text!templates/contacts/group_chats/participant_details_item.html",
    "text!templates/contacts/group_chats/participants.html",
    "text!templates/contacts/group_chats/badge_edit_view.html",
    "text!templates/contacts/group_chats/private_participant_details.html",
    "text!templates/contacts/group_chats/set_status.html",
    "text!templates/contacts/group_chats/status_item.html",
    "text!templates/contacts/group_chats/group_status.html",

    "text!templates/chats/chats_panel.html",
    "text!templates/chats/add_chat_account_item.html",
    "text!templates/chats/chat_item.html",
    "text!templates/chats/chat_head.html",
    "text!templates/chats/saved_chat_head.html",
    "text!templates/chats/chat_content.html",
    "text!templates/chats/chat_bottom.html",
    "text!templates/chats/location_popup.html",
    "text!templates/chats/subscription_buttons.html",
    "text!templates/chats/forward_panel.html",
    "text!templates/chats/chat_placeholder.html",
    "text!templates/chats/message_item.html",
    "text!templates/chats/messages/main.html",
    "text!templates/chats/messages/forwarded.html",
    "text!templates/chats/messages/system.html",
    "text!templates/chats/messages/file_upload.html",
    "text!templates/chats/messages/file.html",
    "text!templates/chats/messages/location.html",
    "text!templates/chats/messages/audio_file.html",
    "text!templates/chats/messages/audio_file_waveform.html",
    "text!templates/chats/messages/auth_request.html",
    "text!templates/chats/messages/group_request.html",
    "text!templates/chats/messages/template-for-2.html",
    "text!templates/chats/messages/template-for-3.html",
    "text!templates/chats/messages/template-for-4.html",
    "text!templates/chats/messages/template-for-5.html",
    "text!templates/chats/messages/template-for-6.html",
    "text!templates/chats/messages/saved_main.html",
    "text!templates/chats/group_chats/pinned_message_panel.html",
    "text!templates/chats/group_chats/add_group_chat.html",
    "text!templates/chats/group_chats/invitation_panel_view.html",
    "text!templates/chats/group_chats/mention_item.html",
    "text!templates/chats/encryption_warning.html",
    "text!templates/chats/content_encryption_warning.html",

    "text!templates/mentions/mentions_panel.html",
    "text!templates/mentions/mentions_placeholder.html",
    "text!templates/mentions/mention_item.html",

    "text!templates/svg/ic-jabber.html",
    "text!templates/svg/xmpp.html",
    "text!templates/svg/ic-at.html",
    "text!templates/svg/ic-searching.html",
    "text!templates/svg/blocked.html",
    "text!templates/svg/bot.html",
    "text!templates/svg/bot-variant.html",
    "text!templates/svg/group-incognito.html",
    "text!templates/svg/group-invite.html",
    "text!templates/svg/group-public.html",
    "text!templates/svg/group-private.html",
    "text!templates/svg/channel.html",
    "text!templates/svg/rss.html",
    "text!templates/svg/rss-variant.html",
    "text!templates/svg/server.html",
    "text!templates/svg/volume-off-variant.html",
    "text!templates/svg/message-group.html",
    "text!templates/svg/xabber-offline.html",
    "text!templates/svg/xabber-online.html",
    "text!templates/svg/saved-messages.html",
    "text!templates/svg/palette.html",
    "text!templates/svg/circles.html",
    "text!templates/svg/translate.html"
], function (_, $) {

    _.templateSettings = {
        evaluate : /\{\[([\s\S]+?)\]\}/g,
        interpolate : /\{\{([\s\S]+?)\}\}/g
    };

    let templates = {};

    let insertSvg = function (html) {
        let $html = $('<div/>').html(html);
        $html.find('.mdi-svg-template').each(function () {
            let $el = $(this),
                svg_name = $el.data('svgname');
            $el.removeClass('mdi-svg-template').addClass('mdi-'+svg_name)
                .attr('data-svgname', null);
            $el.html(templates.svg[svg_name]());
        });
        return $html.html();
    };

    let _addTemplate = function (name, options) {
        options || (options = {});
        let path = name.split('.'),
            tpl = _.template(require('text!templates/'+path.join('/')+'.html')),
            tpl_name = path.pop(),
            res = templates;
        _.each(path, function (attr) {
            res[attr] || (res[attr] = {});
            res = res[attr];
        });
        if (options.is_svg) {
            res[tpl_name] = tpl;
        } else {
            res[tpl_name] = function (data) {
                return insertSvg(tpl(data));
            };
        }
    };

    let addTemplate = function (name) {
        _addTemplate(name, {is_svg: false});
    };

    let addSvgTemplate = function (name) {
        _addTemplate(name, {is_svg: true});
    };


    addTemplate('base.dialog');
    addTemplate('base.fingerprints');
    addTemplate('base.fingerprint_item');
    addTemplate('base.jingle_message_calling');
    addTemplate('base.input_widget');
    addTemplate('base.toolbar');
    addTemplate('base.settings');
    addTemplate('base.about');
    addTemplate('base.omemo_enable');
    addTemplate('base.backgrounds_gallery');
    addTemplate('base.color_picker');
    addTemplate('base.color_scheme');

    addTemplate('api_service.xabber_login');
    addTemplate('api_service.xabber_login_by_email');
    addTemplate('api_service.add_xabber_account');
    addTemplate('api_service.xabber_account');
    addTemplate('api_service.linked_email_item');
    addTemplate('api_service.sync_settings');
    addTemplate('api_service.sync_settings_account_item');

    addTemplate('accounts.xmpp_login');
    addTemplate('accounts.add_account');
    addTemplate('accounts.change_password');
    addTemplate('accounts.toolbar_item');
    addTemplate('accounts.settings_left');
    addTemplate('accounts.settings_right');
    addTemplate('accounts.existing_groupchat_item');
    addTemplate('accounts.resource');
    addTemplate('accounts.global_settings_item');
    addTemplate('accounts.change_status');
    addTemplate('accounts.token_item');
    addTemplate('accounts.current_token_item');

    addTemplate('vcard.vcard');
    addTemplate('vcard.vcard_edit');

    addTemplate('searching.searching_wide');
    addTemplate('searching.searching_account_item');
    addTemplate('searching.existing_groupchat_item');
    addTemplate('searching.existing_groupchat_details_view');

    addTemplate('contacts.roster_right');
    addTemplate('contacts.roster_left');
    addTemplate('contacts.account_roster_right');
    addTemplate('contacts.account_roster_left');
    addTemplate('contacts.group_right');
    addTemplate('contacts.group_left');
    addTemplate('contacts.add_contact');
    addTemplate('contacts.contact_right_item');
    addTemplate('contacts.contact_left_item');
    addTemplate('contacts.contact_blocked_item');
    addTemplate('contacts.contact_details');
    addTemplate('contacts.roster_settings');
    addTemplate('contacts.group_settings');
    addTemplate('contacts.groups_checkbox_list');
    addTemplate('contacts.add_contact_account_item');
    addTemplate('contacts.contact_placeholder');
    addTemplate('contacts.groups');
    addTemplate('contacts.preloader');
    addTemplate('contacts.group_chats.group_chat_properties');
    addTemplate('contacts.group_chats.group_chat_details');
    addTemplate('contacts.group_chats.invitation');
    addTemplate('contacts.group_chats.group_chat_properties_edit');
    addTemplate('contacts.group_chats.default_restrictions');
    addTemplate('contacts.group_chats.group_member_item');
    addTemplate('contacts.group_chats.invited_member_item');
    addTemplate('contacts.group_chats.participant_rights');
    addTemplate('contacts.group_chats.restriction_item');
    addTemplate('contacts.group_chats.right_expire_variants');
    addTemplate('contacts.group_chats.pinned_message');
    addTemplate('contacts.group_chats.participant_details_item');
    addTemplate('contacts.group_chats.participants');
    addTemplate('contacts.group_chats.badge_edit_view');
    addTemplate('contacts.group_chats.private_participant_details');
    addTemplate('contacts.group_chats.set_status');
    addTemplate('contacts.group_chats.status_item');
    addTemplate('contacts.group_chats.group_status');

    addTemplate('chats.chats_panel');
    addTemplate('chats.add_chat_account_item');
    addTemplate('chats.chat_item');
    addTemplate('chats.chat_head');
    addTemplate('chats.saved_chat_head');
    addTemplate('chats.chat_content');
    addTemplate('chats.chat_bottom');
    addTemplate('chats.location_popup');
    addTemplate('chats.subscription_buttons');
    addTemplate('chats.forward_panel');
    addTemplate('chats.chat_placeholder');
    addTemplate('chats.message_item');
    addTemplate('chats.messages.main');
    addTemplate('chats.messages.forwarded');
    addTemplate('chats.messages.system');
    addTemplate('chats.messages.file_upload');
    addTemplate('chats.messages.file');
    addTemplate('chats.messages.location');
    addTemplate('chats.messages.audio_file');
    addTemplate('chats.messages.audio_file_waveform');
    addTemplate('chats.messages.auth_request');
    addTemplate('chats.messages.group_request');
    addTemplate('chats.messages.template-for-2');
    addTemplate('chats.messages.template-for-3');
    addTemplate('chats.messages.template-for-4');
    addTemplate('chats.messages.template-for-5');
    addTemplate('chats.messages.template-for-6');
    addTemplate('chats.messages.saved_main');
    addTemplate('chats.group_chats.pinned_message_panel');
    addTemplate('chats.group_chats.add_group_chat');
    addTemplate('chats.group_chats.invitation_panel_view');
    addTemplate('chats.group_chats.mention_item');
    addTemplate('chats.encryption_warning');
    addTemplate('chats.content_encryption_warning');


    addTemplate('mentions.mentions_panel');
    addTemplate('mentions.mentions_placeholder');
    addTemplate('mentions.mention_item');

    addSvgTemplate('svg.ic-jabber');
    addSvgTemplate('svg.xmpp');
    addSvgTemplate('svg.ic-at');
    addSvgTemplate('svg.ic-searching');
    addSvgTemplate('svg.blocked');
    addSvgTemplate('svg.bot');
    addSvgTemplate('svg.bot-variant');
    addSvgTemplate('svg.group-incognito');
    addSvgTemplate('svg.group-invite');
    addSvgTemplate('svg.group-public');
    addSvgTemplate('svg.group-private');
    addSvgTemplate('svg.channel');
    addSvgTemplate('svg.rss');
    addSvgTemplate('svg.rss-variant');
    addSvgTemplate('svg.server');
    addSvgTemplate('svg.volume-off-variant');
    addSvgTemplate('svg.message-group');
    addSvgTemplate('svg.xabber-offline');
    addSvgTemplate('svg.xabber-online');
    addSvgTemplate('svg.saved-messages');
    addSvgTemplate('svg.palette');
    addSvgTemplate('svg.circles');
    addSvgTemplate('svg.translate');

    return templates;
});