define("xabber-templates", [
    "underscore",
    "jquery",

    "raw-loader!~/templates/base/dialog.html",
    "raw-loader!~/templates/base/fingerprints.html",
    "raw-loader!~/templates/base/fingerprint_item.html",
    "raw-loader!~/templates/base/jingle_message_calling.html",
    "raw-loader!~/templates/base/plyr_player_popup.html",
    "raw-loader!~/templates/base/input_widget.html",
    "raw-loader!~/templates/base/toolbar.html",
    "raw-loader!~/templates/base/settings.html",
    "raw-loader!~/templates/base/about.html",
    "raw-loader!~/templates/base/omemo_enable.html",
    "raw-loader!~/templates/base/backgrounds_gallery.html",
    "raw-loader!~/templates/base/color_picker.html",
    "raw-loader!~/templates/base/color_scheme.html",

    "raw-loader!~/templates/api_service/xabber_login.html",
    "raw-loader!~/templates/api_service/xabber_login_by_email.html",
    "raw-loader!~/templates/api_service/xabber_account.html",
    "raw-loader!~/templates/api_service/linked_email_item.html",
    "raw-loader!~/templates/api_service/add_xabber_account.html",
    "raw-loader!~/templates/api_service/sync_settings.html",
    "raw-loader!~/templates/api_service/sync_settings_account_item.html",

    "raw-loader!~/templates/accounts/xmpp_login.html",
    "raw-loader!~/templates/accounts/add_account.html",
    "raw-loader!~/templates/accounts/change_password.html",
    "raw-loader!~/templates/accounts/toolbar_item.html",
    "raw-loader!~/templates/accounts/media_gallery_account_file.html",
    "raw-loader!~/templates/accounts/media_gallery_account.html",
    "raw-loader!~/templates/accounts/settings_left.html",
    "raw-loader!~/templates/accounts/settings_right.html",
    "raw-loader!~/templates/accounts/existing_groupchat_item.html",
    "raw-loader!~/templates/accounts/resource.html",
    "raw-loader!~/templates/accounts/resource_right.html",
    "raw-loader!~/templates/accounts/webcam_panel.html",
    "raw-loader!~/templates/accounts/emoji_panel.html",
    "raw-loader!~/templates/accounts/emoji_picker.html",
    "raw-loader!~/templates/accounts/emoji_picker_tabs.html",
    "raw-loader!~/templates/accounts/global_settings_item.html",
    "raw-loader!~/templates/accounts/change_status.html",
    "raw-loader!~/templates/accounts/token_item.html",
    "raw-loader!~/templates/accounts/current_token_item.html",
    "raw-loader!~/templates/accounts/audio_file_waveform.html",
    "raw-loader!~/templates/accounts/avatars_gallery.html",

    "raw-loader!~/templates/vcard/vcard.html",
    "raw-loader!~/templates/vcard/vcard_edit.html",
    "raw-loader!~/templates/vcard/vcard_right.html",

    "raw-loader!~/templates/searching/searching_wide.html",
    "raw-loader!~/templates/searching/searching_account_item.html",
    "raw-loader!~/templates/searching/existing_groupchat_item.html",
    "raw-loader!~/templates/searching/existing_groupchat_details_view.html",

    "raw-loader!~/templates/contacts/roster_right.html",
    "raw-loader!~/templates/contacts/roster_left.html",
    "raw-loader!~/templates/contacts/account_roster_right.html",
    "raw-loader!~/templates/contacts/account_roster_left.html",
    "raw-loader!~/templates/contacts/roster_left.html",
    "raw-loader!~/templates/contacts/group_right.html",
    "raw-loader!~/templates/contacts/group_left.html",
    "raw-loader!~/templates/contacts/add_contact.html",
    "raw-loader!~/templates/contacts/contact_right_item.html",
    "raw-loader!~/templates/contacts/contact_left_item.html",
    "raw-loader!~/templates/contacts/contact_blocked_item.html",
    "raw-loader!~/templates/contacts/contact_details.html",
    "raw-loader!~/templates/contacts/contact_details_right.html",
    "raw-loader!~/templates/contacts/roster_settings.html",
    "raw-loader!~/templates/contacts/group_settings.html",
    "raw-loader!~/templates/contacts/groups_checkbox_list.html",
    "raw-loader!~/templates/contacts/groups_checkbox_list_contact.html",
    "raw-loader!~/templates/contacts/groups_new_group.html",
    "raw-loader!~/templates/contacts/groups_list.html",
    "raw-loader!~/templates/contacts/add_contact_account_item.html",
    "raw-loader!~/templates/contacts/contact_placeholder.html",
    "raw-loader!~/templates/contacts/groups.html",
    "raw-loader!~/templates/contacts/edit_contact.html",
    "raw-loader!~/templates/contacts/edit_group.html",
    "raw-loader!~/templates/contacts/preloader.html",
    "raw-loader!~/templates/contacts/media_item.html",
    "raw-loader!~/templates/contacts/media_items_empty.html",
    "raw-loader!~/templates/contacts/audio_file_waveform.html",
    "raw-loader!~/templates/contacts/group_chats/group_chat_properties.html",
    "raw-loader!~/templates/contacts/group_chats/group_chat_properties_right.html",
    "raw-loader!~/templates/contacts/group_chats/group_chat_details.html",
    "raw-loader!~/templates/contacts/group_chats/group_chat_details_right.html",
    "raw-loader!~/templates/contacts/group_chats/invitation.html",
    "raw-loader!~/templates/contacts/group_chats/group_chat_properties_edit.html",
    "raw-loader!~/templates/contacts/group_chats/default_restrictions.html",
    "raw-loader!~/templates/contacts/group_chats/default_restrictions_right.html",
    "raw-loader!~/templates/contacts/group_chats/group_member_item.html",
    "raw-loader!~/templates/contacts/group_chats/group_member_item_right.html",
    "raw-loader!~/templates/contacts/group_chats/description_input_widget.html",
    "raw-loader!~/templates/contacts/group_chats/group_name_input_widget.html",
    "raw-loader!~/templates/contacts/group_chats/participant_badge_input_widget.html",
    "raw-loader!~/templates/contacts/group_chats/invited_member_item.html",
    "raw-loader!~/templates/contacts/group_chats/add_blocked_participant_form.html",
    "raw-loader!~/templates/contacts/group_chats/participant_details_right.html",
    "raw-loader!~/templates/contacts/group_chats/participant_rights.html",
    "raw-loader!~/templates/contacts/group_chats/restriction_item.html",
    "raw-loader!~/templates/contacts/group_chats/right_expire_variants.html",
    "raw-loader!~/templates/contacts/group_chats/pinned_message.html",
    "raw-loader!~/templates/contacts/group_chats/participant_details_item.html",
    "raw-loader!~/templates/contacts/group_chats/participant_details_item_right.html",
    "raw-loader!~/templates/contacts/group_chats/participants.html",
    "raw-loader!~/templates/contacts/group_chats/participants_right_panel.html",
    "raw-loader!~/templates/contacts/group_chats/badge_edit_view.html",
    "raw-loader!~/templates/contacts/group_chats/private_participant_details.html",
    "raw-loader!~/templates/contacts/group_chats/private_participant_details_item_right.html",
    "raw-loader!~/templates/contacts/group_chats/set_status.html",
    "raw-loader!~/templates/contacts/group_chats/status_item.html",
    "raw-loader!~/templates/contacts/group_chats/group_status.html",
    "raw-loader!~/templates/contacts/group_chats/group_status_right.html",
    "raw-loader!~/templates/contacts/group_chats/file_item.html",

    "raw-loader!~/templates/chats/chats_panel.html",
    "raw-loader!~/templates/chats/add_chat_account_item.html",
    "raw-loader!~/templates/chats/chat_item.html",
    "raw-loader!~/templates/chats/chat_head.html",
    "raw-loader!~/templates/chats/send_media.html",
    "raw-loader!~/templates/chats/saved_chat_head.html",
    "raw-loader!~/templates/chats/chat_content.html",
    "raw-loader!~/templates/chats/chat_content_contact.html",
    "raw-loader!~/templates/chats/chat_bottom.html",
    "raw-loader!~/templates/chats/location_popup.html",
    "raw-loader!~/templates/chats/subscription_buttons.html",
    "raw-loader!~/templates/chats/forward_panel.html",
    "raw-loader!~/templates/chats/chat_placeholder.html",
    "raw-loader!~/templates/chats/message_item.html",
    "raw-loader!~/templates/chats/messages/main.html",
    "raw-loader!~/templates/chats/messages/searched.html",
    "raw-loader!~/templates/chats/messages/forwarded.html",
    "raw-loader!~/templates/chats/messages/system.html",
    "raw-loader!~/templates/chats/messages/file_upload.html",
    "raw-loader!~/templates/chats/messages/loading_circle.html",
    "raw-loader!~/templates/chats/messages/file.html",
    "raw-loader!~/templates/chats/messages/file_loading.html",
    "raw-loader!~/templates/chats/messages/link_reference.html",
    "raw-loader!~/templates/chats/messages/link_reference_chat.html",
    "raw-loader!~/templates/chats/messages/attached_file.html",
    "raw-loader!~/templates/chats/messages/video.html",
    "raw-loader!~/templates/chats/messages/location.html",
    "raw-loader!~/templates/chats/messages/audio_file.html",
    "raw-loader!~/templates/chats/messages/audio_file_waveform.html",
    "raw-loader!~/templates/chats/messages/auth_request.html",
    "raw-loader!~/templates/chats/messages/group_request.html",
    "raw-loader!~/templates/chats/messages/template-for-2.html",
    "raw-loader!~/templates/chats/messages/template-for-3.html",
    "raw-loader!~/templates/chats/messages/template-for-4.html",
    "raw-loader!~/templates/chats/messages/template-for-5.html",
    "raw-loader!~/templates/chats/messages/template-for-6.html",
    "raw-loader!~/templates/chats/messages/hidden-template-for-2.html",
    "raw-loader!~/templates/chats/messages/hidden-template-for-3.html",
    "raw-loader!~/templates/chats/messages/hidden-template-for-4.html",
    "raw-loader!~/templates/chats/messages/hidden-template-for-5.html",
    "raw-loader!~/templates/chats/messages/hidden-template-for-6.html",
    "raw-loader!~/templates/chats/messages/images_details.html",
    "raw-loader!~/templates/chats/messages/saved_main.html",
    "raw-loader!~/templates/chats/group_chats/pinned_message_panel.html",
    "raw-loader!~/templates/chats/group_chats/add_group_chat.html",
    "raw-loader!~/templates/chats/group_chats/invitation_panel_view.html",
    "raw-loader!~/templates/chats/group_chats/mention_item.html",
    "raw-loader!~/templates/chats/encryption_warning.html",
    "raw-loader!~/templates/chats/content_encryption_warning.html",

    "raw-loader!~/templates/mentions/mentions_panel.html",
    "raw-loader!~/templates/mentions/mentions_placeholder.html",
    "raw-loader!~/templates/mentions/mention_item.html",

    "raw-loader!~/templates/svg/ic-jabber.html",
    "raw-loader!~/templates/svg/xmpp.html",
    "raw-loader!~/templates/svg/account-outline.html",
    "raw-loader!~/templates/svg/qrcode.html",
    "raw-loader!~/templates/svg/id-outline.html",
    "raw-loader!~/templates/svg/clock-outline.html",
    "raw-loader!~/templates/svg/index.html",
    "raw-loader!~/templates/svg/restrictions-outline.html",
    "raw-loader!~/templates/svg/history.html",
    "raw-loader!~/templates/svg/chevron-down.html",
    "raw-loader!~/templates/svg/camera-retake.html",
    "raw-loader!~/templates/svg/membership-outline.html",
    "raw-loader!~/templates/svg/invite-outline.html",
    "raw-loader!~/templates/svg/chevron-right-variant.html",
    "raw-loader!~/templates/svg/chevron-left-variant.html",
    "raw-loader!~/templates/svg/subscription-to.html",
    "raw-loader!~/templates/svg/subscription-from.html",
    "raw-loader!~/templates/svg/image.html",
    "raw-loader!~/templates/svg/file-audio.html",
    "raw-loader!~/templates/svg/file-video.html",
    "raw-loader!~/templates/svg/file-document.html",
    "raw-loader!~/templates/svg/file-presentation.html",
    "raw-loader!~/templates/svg/file-zip.html",
    "raw-loader!~/templates/svg/file.html",
    "raw-loader!~/templates/svg/file-pdf.html",
    "raw-loader!~/templates/svg/close.html",
    "raw-loader!~/templates/svg/link.html",
    "raw-loader!~/templates/svg/picture-in-picture-minimize.html",
    "raw-loader!~/templates/svg/picture-in-picture-bottom-right.html",
    "raw-loader!~/templates/svg/picture-in-picture-top-right.html",
    "raw-loader!~/templates/svg/pause.html",
    "raw-loader!~/templates/svg/volume-off.html",
    "raw-loader!~/templates/svg/volume-high.html",
    "raw-loader!~/templates/svg/plyr.html",
    "raw-loader!~/templates/svg/plus.html",
    "raw-loader!~/templates/svg/player-float.html",
    "raw-loader!~/templates/svg/player-full.html",
    "raw-loader!~/templates/svg/player-mini-variant.html",
    "raw-loader!~/templates/svg/player-mini.html",
    "raw-loader!~/templates/svg/message-bookmark-outline.html",
    "raw-loader!~/templates/svg/play.html",
    "raw-loader!~/templates/svg/video.html",
    "raw-loader!~/templates/svg/status-outline.html",
    "raw-loader!~/templates/svg/birthday-outline.html",
    "raw-loader!~/templates/svg/job-outline.html",
    "raw-loader!~/templates/svg/address-outline.html",
    "raw-loader!~/templates/svg/email-outline.html",
    "raw-loader!~/templates/svg/description-outline.html",
    "raw-loader!~/templates/svg/call-outline.html",
    "raw-loader!~/templates/svg/call.html",
    "raw-loader!~/templates/svg/search.html",
    "raw-loader!~/templates/svg/devices.html",
    "raw-loader!~/templates/svg/bell.html",
    "raw-loader!~/templates/svg/bell-sleep.html",
    "raw-loader!~/templates/svg/bell-off.html",
    "raw-loader!~/templates/svg/cancel.html",
    "raw-loader!~/templates/svg/edit.html",
    "raw-loader!~/templates/svg/edit-outline.html",
    "raw-loader!~/templates/svg/blocked-add.html",
    "raw-loader!~/templates/svg/information-outline.html",
    "raw-loader!~/templates/svg/fullname.html",
    "raw-loader!~/templates/svg/fullname-outline.html",
    "raw-loader!~/templates/svg/ic-at.html",
    "raw-loader!~/templates/svg/ic-searching.html",
    "raw-loader!~/templates/svg/blocked.html",
    "raw-loader!~/templates/svg/bot.html",
    "raw-loader!~/templates/svg/bot-variant.html",
    "raw-loader!~/templates/svg/group-incognito.html",
    "raw-loader!~/templates/svg/group-invite.html",
    "raw-loader!~/templates/svg/group-public.html",
    "raw-loader!~/templates/svg/task.html",
    "raw-loader!~/templates/svg/group-private.html",
    "raw-loader!~/templates/svg/channel.html",
    "raw-loader!~/templates/svg/rss.html",
    "raw-loader!~/templates/svg/rss-variant.html",
    "raw-loader!~/templates/svg/server.html",
    "raw-loader!~/templates/svg/volume-off-variant.html",
    "raw-loader!~/templates/svg/message-group.html",
    "raw-loader!~/templates/svg/xabber-offline.html",
    "raw-loader!~/templates/svg/xabber-online.html",
    "raw-loader!~/templates/svg/saved-messages.html",
    "raw-loader!~/templates/svg/palette.html",
    "raw-loader!~/templates/svg/circles.html",
    "raw-loader!~/templates/svg/translate.html",
    "raw-loader!~/templates/svg/crosshairs-gps.html",
    "raw-loader!~/templates/svg/crosshairs-question.html",
    "raw-loader!~/templates/svg/crosshairs.html",
    "raw-loader!~/templates/svg/map-marker-outline.html",
    "raw-loader!~/templates/svg/map-marker.html",
    "raw-loader!~/templates/svg/minus.html",

    "raw-loader!~/templates/accounts/emojis.txt",

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
            tpl = _.template(require('raw-loader!~/templates/'+path.join('/')+'.html').default),
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

    let addJSONTemplate = function (name, ) {
        let path = name.split('.'),
            tpl = _.template(require('raw-loader!~/templates/'+path.join('/')+'.txt').default),//todo fix json import
            tpl_name = path.pop(),
            res = templates;
        _.each(path, function (attr) {
            res[attr] || (res[attr] = {});
            res = res[attr];
        });
        res[tpl_name] = function (data) {
            return insertSvg(tpl(data));
        };
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
    addTemplate('base.plyr_player_popup');
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
    addTemplate('accounts.media_gallery_account_file');
    addTemplate('accounts.media_gallery_account');
    addTemplate('accounts.settings_left');
    addTemplate('accounts.settings_right');
    addTemplate('accounts.existing_groupchat_item');
    addTemplate('accounts.resource');
    addTemplate('accounts.resource_right');
    addTemplate('accounts.webcam_panel');
    addTemplate('accounts.emoji_panel');
    addTemplate('accounts.emoji_picker');
    addTemplate('accounts.emoji_picker_tabs');
    addTemplate('accounts.global_settings_item');
    addTemplate('accounts.change_status');
    addTemplate('accounts.token_item');
    addTemplate('accounts.current_token_item');
    addTemplate('accounts.audio_file_waveform');
    addTemplate('accounts.avatars_gallery');

    addTemplate('vcard.vcard');
    addTemplate('vcard.vcard_edit');
    addTemplate('vcard.vcard_right');

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
    addTemplate('contacts.contact_details_right');
    addTemplate('contacts.roster_settings');
    addTemplate('contacts.group_settings');
    addTemplate('contacts.groups_checkbox_list');
    addTemplate('contacts.groups_checkbox_list_contact');
    addTemplate('contacts.groups_new_group');
    addTemplate('contacts.groups_list');
    addTemplate('contacts.add_contact_account_item');
    addTemplate('contacts.contact_placeholder');
    addTemplate('contacts.groups');
    addTemplate('contacts.edit_contact');
    addTemplate('contacts.edit_group');
    addTemplate('contacts.preloader');
    addTemplate('contacts.media_item');
    addTemplate('contacts.media_items_empty');
    addTemplate('contacts.audio_file_waveform');
    addTemplate('contacts.group_chats.group_chat_properties');
    addTemplate('contacts.group_chats.group_chat_properties_right');
    addTemplate('contacts.group_chats.group_chat_details');
    addTemplate('contacts.group_chats.group_chat_details_right');
    addTemplate('contacts.group_chats.invitation');
    addTemplate('contacts.group_chats.group_chat_properties_edit');
    addTemplate('contacts.group_chats.default_restrictions');
    addTemplate('contacts.group_chats.default_restrictions_right');
    addTemplate('contacts.group_chats.group_member_item');
    addTemplate('contacts.group_chats.group_member_item_right');
    addTemplate('contacts.group_chats.description_input_widget');
    addTemplate('contacts.group_chats.group_name_input_widget');
    addTemplate('contacts.group_chats.participant_badge_input_widget');
    addTemplate('contacts.group_chats.invited_member_item');
    addTemplate('contacts.group_chats.add_blocked_participant_form');
    addTemplate('contacts.group_chats.participant_details_right');
    addTemplate('contacts.group_chats.participant_rights');
    addTemplate('contacts.group_chats.restriction_item');
    addTemplate('contacts.group_chats.right_expire_variants');
    addTemplate('contacts.group_chats.pinned_message');
    addTemplate('contacts.group_chats.participant_details_item_right');
    addTemplate('contacts.group_chats.participant_details_item');
    addTemplate('contacts.group_chats.participants');
    addTemplate('contacts.group_chats.participants_right_panel');
    addTemplate('contacts.group_chats.badge_edit_view');
    addTemplate('contacts.group_chats.private_participant_details');
    addTemplate('contacts.group_chats.private_participant_details_item_right');
    addTemplate('contacts.group_chats.set_status');
    addTemplate('contacts.group_chats.status_item');
    addTemplate('contacts.group_chats.group_status');
    addTemplate('contacts.group_chats.group_status_right');
    addTemplate('contacts.group_chats.file_item');

    addTemplate('chats.chats_panel');
    addTemplate('chats.add_chat_account_item');
    addTemplate('chats.chat_item');
    addTemplate('chats.chat_head');
    addTemplate('chats.send_media');
    addTemplate('chats.saved_chat_head');
    addTemplate('chats.chat_content');
    addTemplate('chats.chat_content_contact');
    addTemplate('chats.chat_bottom');
    addTemplate('chats.location_popup');
    addTemplate('chats.subscription_buttons');
    addTemplate('chats.forward_panel');
    addTemplate('chats.chat_placeholder');
    addTemplate('chats.message_item');
    addTemplate('chats.messages.main');
    addTemplate('chats.messages.searched');
    addTemplate('chats.messages.forwarded');
    addTemplate('chats.messages.system');
    addTemplate('chats.messages.file_upload');
    addTemplate('chats.messages.loading_circle');
    addTemplate('chats.messages.file');
    addTemplate('chats.messages.file_loading');
    addTemplate('chats.messages.link_reference');
    addTemplate('chats.messages.link_reference_chat');
    addTemplate('chats.messages.attached_file');
    addTemplate('chats.messages.video');
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
    addTemplate('chats.messages.hidden-template-for-2');
    addTemplate('chats.messages.hidden-template-for-3');
    addTemplate('chats.messages.hidden-template-for-4');
    addTemplate('chats.messages.hidden-template-for-5');
    addTemplate('chats.messages.hidden-template-for-6');
    addTemplate('chats.messages.images_details');
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
    addSvgTemplate('svg.account-outline');
    addSvgTemplate('svg.qrcode');
    addSvgTemplate('svg.id-outline');
    addSvgTemplate('svg.clock-outline');
    addSvgTemplate('svg.index');
    addSvgTemplate('svg.restrictions-outline');
    addSvgTemplate('svg.history');
    addSvgTemplate('svg.chevron-down');
    addSvgTemplate('svg.camera-retake');
    addSvgTemplate('svg.membership-outline');
    addSvgTemplate('svg.invite-outline');
    addSvgTemplate('svg.chevron-right-variant');
    addSvgTemplate('svg.chevron-left-variant');
    addSvgTemplate('svg.subscription-to');
    addSvgTemplate('svg.subscription-from');
    addSvgTemplate('svg.image');
    addSvgTemplate('svg.file-audio');
    addSvgTemplate('svg.file-video');
    addSvgTemplate('svg.file-document');
    addSvgTemplate('svg.file-presentation');
    addSvgTemplate('svg.file-zip');
    addSvgTemplate('svg.file');
    addSvgTemplate('svg.file-pdf');
    addSvgTemplate('svg.close');
    addSvgTemplate('svg.link');
    addSvgTemplate('svg.picture-in-picture-minimize');
    addSvgTemplate('svg.picture-in-picture-bottom-right');
    addSvgTemplate('svg.picture-in-picture-top-right');
    addSvgTemplate('svg.pause');
    addSvgTemplate('svg.volume-off');
    addSvgTemplate('svg.volume-high');
    addSvgTemplate('svg.plyr');
    addSvgTemplate('svg.plus');
    addSvgTemplate('svg.player-float');
    addSvgTemplate('svg.player-full');
    addSvgTemplate('svg.player-mini-variant');
    addSvgTemplate('svg.player-mini');
    addSvgTemplate('svg.message-bookmark-outline');
    addSvgTemplate('svg.play');
    addSvgTemplate('svg.video');
    addSvgTemplate('svg.cancel');
    addSvgTemplate('svg.status-outline');
    addSvgTemplate('svg.birthday-outline');
    addSvgTemplate('svg.job-outline');
    addSvgTemplate('svg.address-outline');
    addSvgTemplate('svg.email-outline');
    addSvgTemplate('svg.description-outline');
    addSvgTemplate('svg.call-outline');
    addSvgTemplate('svg.call');
    addSvgTemplate('svg.search');
    addSvgTemplate('svg.devices');
    addSvgTemplate('svg.bell');
    addSvgTemplate('svg.bell-sleep');
    addSvgTemplate('svg.bell-off');
    addSvgTemplate('svg.cancel');
    addSvgTemplate('svg.edit');
    addSvgTemplate('svg.edit-outline');
    addSvgTemplate('svg.blocked-add');
    addSvgTemplate('svg.information-outline');
    addSvgTemplate('svg.fullname');
    addSvgTemplate('svg.fullname-outline');
    addSvgTemplate('svg.ic-at');
    addSvgTemplate('svg.ic-searching');
    addSvgTemplate('svg.blocked');
    addSvgTemplate('svg.bot');
    addSvgTemplate('svg.bot-variant');
    addSvgTemplate('svg.group-incognito');
    addSvgTemplate('svg.group-invite');
    addSvgTemplate('svg.group-public');
    addSvgTemplate('svg.task');
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
    addSvgTemplate('svg.crosshairs-gps');
    addSvgTemplate('svg.crosshairs-question');
    addSvgTemplate('svg.crosshairs');
    addSvgTemplate('svg.map-marker-outline');
    addSvgTemplate('svg.map-marker');
    addSvgTemplate('svg.minus');

    addJSONTemplate('accounts.emojis');

    return templates;
});