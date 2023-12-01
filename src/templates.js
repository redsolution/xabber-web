    import _ from "underscore";
    import $ from "jquery";

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
            tpl = require('~/templates/'+path.join('/')+'.json'),
            tpl_name = path.pop(),
            res = templates;
        _.each(path, function (attr) {
            res[attr] || (res[attr] = {});
            res = res[attr];
        });
        res[tpl_name] = tpl;
    };

    let addTemplate = function (name) {
        _addTemplate(name, {is_svg: false});
    };

    let addSvgTemplate = function (name) {
        _addTemplate(name, {is_svg: true});
    };


    addTemplate('base.dialog');
    addTemplate('base.fingerprints');
    addTemplate('base.fingerprints_devices');
    addTemplate('base.fingerprint_item');
    addTemplate('base.fingerprint_devices_item');
    addTemplate('base.jingle_message_calling');
    addTemplate('base.plyr_player_popup');
    addTemplate('base.input_widget');
    addTemplate('base.toolbar');
    addTemplate('base.settings');
    addTemplate('base.settings_modal');
    addTemplate('base.setting_radio_input');
    addTemplate('base.setting_emoji_font_radio_input');
    addTemplate('base.setting_language_radio_input');
    addTemplate('base.about');
    addTemplate('base.omemo_enable');
    addTemplate('base.backgrounds_gallery');
    addTemplate('base.color_picker');
    addTemplate('base.color_scheme');

    addTemplate('accounts.xmpp_login');
    addTemplate('accounts.add_account');
    addTemplate('accounts.unregister_account');
    addTemplate('accounts.change_password');
    addTemplate('accounts.change_account_password');
    addTemplate('accounts.toolbar_item');
    addTemplate('accounts.media_gallery_account_file');
    addTemplate('accounts.media_gallery_account');
    addTemplate('accounts.delete_files_media_gallery');
    addTemplate('accounts.single_account_settings_modal');
    addTemplate('accounts.account_settings_modal');
    addTemplate('accounts.existing_groupchat_item');
    addTemplate('accounts.resource');
    addTemplate('accounts.resource_right');
    addTemplate('accounts.webcam_panel');
    addTemplate('accounts.emoji_panel');
    addTemplate('accounts.emoji_picker');
    addTemplate('accounts.emoji_picker_tabs');
    addTemplate('accounts.global_settings_item_modal');
    addTemplate('accounts.change_status');
    addTemplate('accounts.token_item_modal');
    addTemplate('accounts.current_token_item_modal');
    addTemplate('accounts.audio_file_waveform');
    addTemplate('accounts.avatars_gallery');
    addTemplate('accounts.status_message_input_widget');

    addTemplate('vcard.vcard');
    addTemplate('vcard.vcard_modal');
    addTemplate('vcard.vcard_edit_modal');
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
    addTemplate('chats.chat_content_placeholder');
    addTemplate('chats.chat_content_contact');
    addTemplate('chats.chat_bottom');
    addTemplate('chats.unread_marker');
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
    addSvgTemplate('svg.camera');
    addSvgTemplate('svg.camera-retake');
    addSvgTemplate('svg.membership-outline');
    addSvgTemplate('svg.invite');
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
    addSvgTemplate('svg.status');
    addSvgTemplate('svg.status-outline');
    addSvgTemplate('svg.birthday');
    addSvgTemplate('svg.birthday-outline');
    addSvgTemplate('svg.web');
    addSvgTemplate('svg.xmpp');
    addSvgTemplate('svg.job');
    addSvgTemplate('svg.job-outline');
    addSvgTemplate('svg.address');
    addSvgTemplate('svg.address-outline');
    addSvgTemplate('svg.email');
    addSvgTemplate('svg.email-outline');
    addSvgTemplate('svg.description');
    addSvgTemplate('svg.description-outline');
    addSvgTemplate('svg.contact-add');
    addSvgTemplate('svg.check');
    addSvgTemplate('svg.call-outline');
    addSvgTemplate('svg.call');
    addSvgTemplate('svg.search');
    addSvgTemplate('svg.device-cellphone');
    addSvgTemplate('svg.device-console');
    addSvgTemplate('svg.device-desktop');
    addSvgTemplate('svg.device-tablet');
    addSvgTemplate('svg.device-web');
    addSvgTemplate('svg.devices');
    addSvgTemplate('svg.bell');
    addSvgTemplate('svg.bell-sleep');
    addSvgTemplate('svg.bell-off');
    addSvgTemplate('svg.cancel');
    addSvgTemplate('svg.trash');
    addSvgTemplate('svg.client');
    addSvgTemplate('svg.client-outline');
    addSvgTemplate('svg.database-lock');
    addSvgTemplate('svg.index');
    addSvgTemplate('svg.bug');
    addSvgTemplate('svg.cloud');
    addSvgTemplate('svg.key');
    addSvgTemplate('svg.key-variant');
    addSvgTemplate('svg.account');
    addSvgTemplate('svg.alert-circle');
    addSvgTemplate('svg.security');
    addSvgTemplate('svg.edit');
    addSvgTemplate('svg.edit-outline');
    addSvgTemplate('svg.check-circle');
    addSvgTemplate('svg.blocked-add');
    addSvgTemplate('svg.information-outline');
    addSvgTemplate('svg.information');
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
    addSvgTemplate('svg.account-cancel');
    addSvgTemplate('svg.web-cancel');
    addSvgTemplate('svg.palette');
    addSvgTemplate('svg.chat');
    addSvgTemplate('svg.star-face');
    addSvgTemplate('svg.alarm-bell');
    addSvgTemplate('svg.id');
    addSvgTemplate('svg.expires');
    addSvgTemplate('svg.database');
    addSvgTemplate('svg.download');
    addSvgTemplate('svg.lock');
    addSvgTemplate('svg.lock-open');
    addSvgTemplate('svg.lock-alert');
    addSvgTemplate('svg.lock-check');
    addSvgTemplate('svg.lock-cross');
    addSvgTemplate('svg.lock-question');
    addSvgTemplate('svg.circles');
    addSvgTemplate('svg.circles-outline');
    addSvgTemplate('svg.circle-slice-1');
    addSvgTemplate('svg.circle-slice-2');
    addSvgTemplate('svg.circle-slice-3');
    addSvgTemplate('svg.circle-slice-4');
    addSvgTemplate('svg.circle-slice-5');
    addSvgTemplate('svg.circle-slice-6');
    addSvgTemplate('svg.circle-slice-7');
    addSvgTemplate('svg.circle-slice-8');
    addSvgTemplate('svg.translate');
    addSvgTemplate('svg.trash');
    addSvgTemplate('svg.crosshairs-gps');
    addSvgTemplate('svg.crosshairs-question');
    addSvgTemplate('svg.crosshairs');
    addSvgTemplate('svg.map-marker-outline');
    addSvgTemplate('svg.map-marker');
    addSvgTemplate('svg.minus');

    addJSONTemplate('accounts.emojis');

    export default templates;