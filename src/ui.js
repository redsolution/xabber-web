define("xabber-ui", function () {
  return function (xabber) {
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
                if (attrs.name === 'all-chats' && attrs.right === 'contact_details')
                    attrs.contact.trigger('open_chat', attrs.contact);
            }
            if (attrs.chat_item && (attrs.name === 'mentions' || attrs.name === 'contacts' || attrs.name === 'all-chats') && (attrs.right === 'chat' || attrs.right === 'participant_messages' || attrs.right === 'message_context' || attrs.right === 'searched_messages')) {
                if (!window.$('.message-actions-panel').hasClass('hidden')) {
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
            if (this.roster_view.isVisible()) {
                this.updateRosterLayout(options);
            }
            xabber.trigger('update_css', options);
            this.body.$('.ps-container').perfectScrollbar('update');
        };

        this.updateRosterLayout = function (options) {
            let width = this.body.$el.width(),
                is_wide = width >= constants.WIDTH_MEDIUM,
                is_narrow = width < constants.WIDTH_MEDIUM,
                is_tiny = width < constants.WIDTH_TINY,
                expanded = this.roster_view.data.get('expanded'),
                pinned = this.roster_view.data.get('pinned');
            this.roster_view.$('.collapsed-wrap').hideIf(expanded);
            this.roster_view.$('.expanded-wrap').showIf(expanded);
            this.roster_view.$('.btn-pin').hide();
            if (is_narrow && pinned) {
                this.roster_view.data.set({expanded: false, pinned: false});
                return;
            }
            let roster_width,
                panel_width,
                left_panel_width,
                right_panel_width,
                right_contact_panel_width,
                chat_bottom_panel_width,
                panel_margin = '',
                toolbar_width = 50,
                right_contact_panel_styles = {};
            if (is_wide || !(is_narrow || pinned)) {
                panel_width = 1536;
                roster_width = 300;
            } else if (is_narrow) {
                panel_width = width - toolbar_width - 20 - 44;
                roster_width = 250;
            } else {
                panel_width = (width - toolbar_width - 20) * 7 / 9;
                roster_width = (width - toolbar_width - 20) * 2 / 9;
                panel_margin = toolbar_width + 10;
            }
            if (!expanded) {
                roster_width = is_wide ? 48 : 44;
            }
            left_panel_width = right_contact_panel_width = 384;
            right_panel_width = panel_width - (left_panel_width + right_contact_panel_width);
            chat_bottom_panel_width = '100%';
            if (is_narrow){
                right_contact_panel_width = left_panel_width = (panel_width * 0.264) < 288 ? 288 : panel_width * 0.264;

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
                    right_contact_panel_width = 384
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
            if (right_panel_width < 768) {
                chat_bottom_panel_width = right_panel_width;
            }

            let panel_gap = (width - panel_width) / 2,
                left_gap = panel_gap - toolbar_width,
                right_gap = panel_gap - roster_width;
            this.roster_view.$('.expanded-wrap').switchClass('solid',
                    (!pinned && (!is_wide || right_gap < 0)));
            if (pinned && !panel_margin && (3 * right_gap < left_gap)) {
                panel_margin = toolbar_width + 0.75 * (left_gap + right_gap);
            }
            right_contact_panel_styles.width = right_contact_panel_width;
            this.main_panel.setCustomCss({
                width: panel_width,
                'margin-left': panel_margin
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
            this.roster_view.setCustomCss({width: roster_width});
        };

        this.on("update_layout", this.updateLayout, this);

        this.body.addScreen('blank', {});

        this.body.addScreen('login', {
            login: { xmpp_login: null }
        });

        this.body.addScreen('settings', {
            blur_overlay: null,
            toolbar: null,
            main: {
                wide: { settings: null },
                placeholders: null
            },
            roster: null
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

        let path_acc_settings_left = new this.ViewPath('account.settings_left'),
            path_acc_settings_right = new this.ViewPath('account.settings_right'),
            path_acc_vcard_edit = new this.ViewPath('account.vcard_edit');

        this.body.addScreen('account_settings', {
            blur_overlay: null,
            toolbar: null,
            main: {
                wide: {
                    account_settings: {
                        left: path_acc_settings_left,
                        right: path_acc_settings_right
                    }
                },
                placeholders: null
            },
            roster: null
        });

        this.account_settings.patchTree = function (tree, options) {
            if (options.right === 'vcard_edit') {
                return {
                    left: path_acc_settings_left,
                    right: path_acc_vcard_edit
                };
            }
        };


        let path_chat_head = new this.ViewPath('chat_item.content.head'),
            path_chat_body = new this.ViewPath('chat_item.content'),
            path_chat_bottom = new this.ViewPath('chat_item.content.bottom'),
            path_group_invitation = new this.ViewPath('contact.invitation'),
            path_enable_view = new this.ViewPath('omemo_item.account.omemo_enable_view'),
            path_contact_details = new this.ViewPath('contact.details_view'),
            path_contact_details_right = new this.ViewPath('contact.details_view_right'),
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


        this.right_panel.patchTree = function (tree, options) {
            if (options.right === undefined)
                return;
            if ((options.right === 'message_context') || (options.right === 'participant_messages') || (options.right === 'searched_messages')) {
                return {
                    chat_head: path_chat_head,
                    chat_body: path_participant_messages,
                    chat_bottom: path_chat_bottom
                };
            }
            if (options.right === 'group_invitation') {
                return { details: path_group_invitation };
            }
            if (options.right === 'contact_details') {
                return { details: path_contact_details };
            }
            if (options.details_content === 'participants')
                return { details_content: path_details_participants };
            if (options.chat_item) {
                return {
                    chat_head: path_chat_head,
                    chat_body: path_chat_body,
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
            if (options.details_content === 'participants')
                return { details_content: path_details_participants };
        };

        this.body.setScreen('blank');

        // initial synchronization
        if (this.api_account) {
            this.api_account.once("settings_result", function (result) {
                if (result === null && !this.accounts.length) {
                    this.body.setScreen('login');
                } else if (this.body.isScreen('blank')) {
                    this.body.setScreen('all-chats');
                }
            }, this);

            this.api_account.ready.then(this.api_account.start.bind(this.api_account));
        } else {
            if (!this.accounts.length)
                this.body.setScreen('login');
            else if (this.body.isScreen('blank'))
                this.body.setScreen('all-chats');
            xabber.trigger("bind_xmpp_accounts");
        }

    }, xabber);

    return xabber;
  };
});
