import xabber from "xabber-core";

let env = xabber.env,
    constants = env.constants,
    $ = env.$;

xabber.once("start", function () {
    $(window).on("keydown", (ev) => {
        if ((ev.ctrlKey || ev.metaKey) && ev.keyCode == constants.KEY_SHIFT || ev.shiftKey && ev.keyCode == constants.KEY_CTRL) {
            this.shift_pressed = null;
            this.shiftctrl_pressed = true;
            ev.preventDefault();
        } else if (ev.keyCode == constants.KEY_SHIFT) {
            this.shift_pressed = true;
            ev.preventDefault();
        }
        let attrs = xabber.body.screen.attributes;
        if (ev.keyCode === constants.KEY_ESCAPE && !xabber.body.screen.get('right_contact')) {
            if (xabber.body.$el.siblings('#modals').children('.open').length)
                return;
        }
        if (attrs.chat_item && (attrs.name === 'mentions' || attrs.name === 'contacts' || attrs.name === 'all-chats') && (attrs.right === 'chat' || attrs.right === 'participant_messages' || attrs.right === 'message_context' || attrs.right === 'searched_messages')) {
            if (window.$('.message-actions-panel').length && !window.$('.message-actions-panel').hasClass('hidden')) {
                if (!ev.ctrlKey && !ev.metaKey) {
                    switch (ev.keyCode) {
                        case 67:
                            attrs.chat_item.model.trigger('copy_selected_messages');
                            break;
                        case 68:
                            attrs.chat_item.model.trigger('delete_selected_messages');
                            break;
                        case 69:
                            attrs.chat_item.model.trigger('edit_selected_message');
                            break;
                        case 70:
                            attrs.chat_item.model.trigger('forward_selected_messages');
                            break;
                        case 80:
                            attrs.chat_item.model.trigger('pin_selected_message');
                            break;
                        case 82:
                            attrs.chat_item.model.trigger('reply_selected_messages');
                            break;
                        case constants.KEY_ESCAPE:
                            if (!xabber.body.screen.get('right_contact'))
                                attrs.chat_item.model.trigger('reset_selected_messages');
                            break;
                    }
                    ev.preventDefault();
                }
            }
        }
        });
    $(window).on("keyup", (ev) => {
        if (!(ev.shiftKey && ev.ctrlKey))
            this.shiftctrl_pressed = null;
        if (ev.shiftKey && !ev.ctrlKey)
            this.shift_pressed = true;
        if (!ev.shiftKey)
            this.shift_pressed = null;
    });

    this.updateLayout = function (options) {
        options || (options = {});
        this.updateContainersLayout();
        xabber.trigger('update_css', options);
        this.body.$('.ps-container').perfectScrollbar('update');
    };

    this.updateContainersLayout = function () {
        let width = this.body.$el.width(),
            height = this.body.$el.height(),
            is_wide = width >= constants.WIDTH_MEDIUM,
            is_narrow = width < constants.WIDTH_MEDIUM;
        let panel_width,
            left_panel_width,
            right_panel_width,
            right_contact_panel_width,
            chat_bottom_panel_width,
            toolbar_width = 64,
            toolbar_main_wrap_heigth = $(window).height() - 56,
            right_contact_panel_styles = {};
        if (is_wide || !(is_narrow)) {
            panel_width = 1536;
        } else if (is_narrow) {
            panel_width = width - toolbar_width - 20 - 44;
        } else {
            panel_width = (width - toolbar_width - 20) * 7 / 9;
        }
        left_panel_width = right_contact_panel_width = 384;
        right_panel_width = panel_width - (left_panel_width + right_contact_panel_width);
        chat_bottom_panel_width = '100%';
        if (is_narrow){
            right_contact_panel_width = left_panel_width = (panel_width * 0.264) < 288 ? 288 : panel_width * 0.264;
            right_panel_width = panel_width - (left_panel_width + right_contact_panel_width);

        }
        if (right_panel_width < 512 ){
            right_panel_width = panel_width - left_panel_width;
            this.right_contact_panel_saveable = false;
            right_contact_panel_styles = {
                position : 'absolute',
                right : 0,
                'z-index' : 499,
            };
            if ((right_panel_width - 384) < 128) {
                right_contact_panel_width = right_panel_width;
                this.right_contact_panel.$el.removeClass('background-click')
            }
            else {
                right_contact_panel_width = 384;
                this.right_contact_panel.$el.addClass('background-click')
            }
        }
        else {
            this.right_contact_panel_saveable = true;
            right_contact_panel_styles = {
                position : 'static',
                'z-index' : 0,
            };
            this.right_contact_panel.$el.removeClass('background-click')

        }
        this.right_contact_panel_width = right_contact_panel_width;

        if (!this.body.screen.get('right_contact')) {
            right_contact_panel_width = 0;
            right_panel_width = panel_width - left_panel_width;
        }

        if (this.body.screen.get('notifications') || (this.body.screen.get('previous_screen') && this.body.screen.get('previous_screen').notifications) ) {
            left_panel_width = 0;
            right_panel_width = panel_width;
        }
        if (right_panel_width < 768) {
            chat_bottom_panel_width = right_panel_width;
        }

        right_contact_panel_styles.width = right_contact_panel_width;
        this.left_panel.$el.switchClass('hidden', this.body.screen.get('notifications')  || (this.body.screen.get('previous_screen') && this.body.screen.get('previous_screen').notifications));
        this.chat_head.$el.switchClass('chat-head-ultra-narrow', right_panel_width <= 650);
        this.chat_head.$el.switchClass('chat-head-narrow', right_panel_width < 750);
        this.chat_head.$el.switchClass('chat-head-normal', (right_panel_width < 850 && right_panel_width >= 750));
        this.chat_head.$el.switchClass('chat-head-normal-wide', (right_panel_width < 1000 && right_panel_width >= 850));
        this.chat_head.$el.switchClass('chat-head-wide', right_panel_width > 1000);
        this.main_panel.setCustomCss({
            width: panel_width,
        });
        this.left_panel.setCustomCss({
            width: left_panel_width,
        });
        this.right_panel.setCustomCss({
            width: right_panel_width,
        });
        this.right_contact_panel.setCustomCss(right_contact_panel_styles);
        this.chat_bottom.setCustomCss({
            width: chat_bottom_panel_width,
        });
        this.toolbar_view.$el.find('.toolbar-main-wrap').css({
            'max-height': toolbar_main_wrap_heigth,
        });
    };

    this.on("update_layout", this.updateLayout, this);

    this.body.addScreen('blank', {});

    this.body.addScreen('login', {
        login: { xmpp_login: null }
    });

    this.body.addScreen('settings-modal', {
        main_overlay: {
            settings_modal: null,
        },
    });

    this.body.addScreen('add_account', {
        blur_overlay: null,
        toolbar: null,
        login: null
    });

    this.body.addScreen('about', {
        blur_overlay: null,
        toolbar: null,
        main: {
            wide: { about: null },
            placeholders: null
        },
        roster: null
    });

    let path_acc_settings_modal = new this.ViewPath('account.settings_account_modal');

    this.body.addScreen('account_settings_modal', {
        main_overlay: {
            account_settings_modal: path_acc_settings_modal
        },
    });


    let path_chat_head = new this.ViewPath('chat_item.content.head'),
        path_chat_body = new this.ViewPath('chat_item.content'),
        path_notifications_body = new this.ViewPath('notifications'),
        path_chat_body_placeholder = new this.ViewPath('chat_item.content_placeholder'),
        path_chat_bottom = new this.ViewPath('chat_item.content.bottom'),
        path_group_invitation = new this.ViewPath('contact.invitation'),
        path_enable_view = new this.ViewPath('omemo_item.account.omemo_enable_view'),
        path_contact_details_right = new this.ViewPath('contact.details_view_right'),
        path_contact_details_right_encrypted = new this.ViewPath('contact.details_view_right_encrypted'),
        path_participant_messages = new this.ViewPath('model.messages_view'),
        path_details_participants = new this.ViewPath('contact.details_view.participants');

    this.body.addScreen('contacts', {
        blur_overlay: null,
        toolbar: null,
        main: {
            left: { contacts: null },
            right: { contact_placeholder: null },
            right_contact: {},
            placeholders: null
        },
        roster: null
    });

    this.body.addScreen('search', {
        blur_overlay: null,
        toolbar: null,
        main: {
            wide: { discovering_main: null},
            placeholders: null
        },
        roster: null
    });

    this.body.addScreen('mentions', {
        blur_overlay: null,
        toolbar: null,
        main: {
            left: { mentions: null },
            right: { mentions_placeholder: null },
            right_contact: {},
            placeholders: null
        },
        roster: null
    });

    this.body.addScreen('all-chats', {
        blur_overlay: null,
        toolbar: null,
        main: {
            left: { chats: null },
            right: { chat_placeholder: null },
            right_contact: {},
            placeholders: null
        },
        roster: null
    });

    this.body.addScreen('notifications', {
        blur_overlay: null,
        toolbar: null,
        main: {
            // left: { chats: null },
            right: { notifications_body: null  },
            // right_contact: {},
            // placeholders: null
        },
        // roster: null
    });


    this.right_panel.patchTree = function (tree, options) {
        console.log(options);
        if (options.right === undefined)
            return;
        if (options.show_placeholder) {
            return {
                chat_head: path_chat_head,
                chat_body: null,
                chat_body_placeholder: path_chat_body_placeholder,
                chat_bottom: null
            };
        }
        if (options.notifications && options.right === 'notifications') {
            return {
                notifications_body: path_notifications_body,
            };
        }
        if ((options.right === 'message_context') || (options.right === 'participant_messages') || (options.right === 'searched_messages')) {
            return {
                chat_head: path_chat_head,
                chat_body: path_participant_messages,
                chat_body_placeholder: null,
                chat_bottom: path_chat_bottom
            };
        }
        if (options.right === 'group_invitation') {
            return { details: path_group_invitation };
        }
        if (options.details_content === 'participants')
            return { details_content: path_details_participants };
        if (options.chat_item) {
            return {
                chat_head: path_chat_head,
                chat_body: path_chat_body,
                chat_body_placeholder: null,
                chat_bottom: path_chat_bottom
            };
        }
        if (options.right === 'enable_encryption' || options.omemo_item) {
            return { details: path_enable_view };
        }
    };


    this.right_contact_panel.patchTree = function (tree, options) {
        if (options.right_contact === undefined)
            return;
        if (options.right_contact === 'contact_details') {
            return { details: path_contact_details_right };
        }
        if (options.right_contact === 'contact_details_encrypted') {
            return { details: path_contact_details_right_encrypted };
        }
        if (options.details_content === 'participants')
            return { details_content: path_details_participants };
    };

    this.body.setScreen('blank');

    // initial synchronization
    if (!this.accounts.length)
        this.body.setScreen('login');
    else if (this.body.isScreen('blank'))
        this.body.setScreen('all-chats');
    xabber.trigger("start_accounts");

}, xabber);

export default xabber;