define("xabber-ui", function () {
  return function (xabber) {
    var env = xabber.env,
        constants = env.constants,
        templates = env.templates,
        utils = env.utils,
        $ = env.$,
        _ = env._;

    xabber.once("start", function () {
        $(window).on("keydown", function (ev) {
            if (ev.keyCode === constants.KEY_ESCAPE) {
                var attrs = xabber.body.screen.attributes;
                if (attrs.name === 'all-chats' && attrs.right === 'contact_details') {
                    attrs.contact.trigger('open_chat', attrs.contact);
                }
            }
        }.bind(this));

        this.updateLayout = function (options) {
            options || (options = {});
            if (this.roster_view.isVisible()) {
                this.updateRosterLayout(options);
            }
            xabber.trigger('update_css', options);
            this.body.$('.ps-container').perfectScrollbar('update');
        };

        this.updateRosterLayout = function (options) {
            var width = this.body.$el.width(),
                is_wide = width >= constants.WIDTH_MEDIUM,
                is_narrow = width < constants.WIDTH_NARROW,
                is_tiny = width < constants.WIDTH_TINY,
                expanded = this.roster_view.data.get('expanded'),
                pinned = this.roster_view.data.get('pinned');
            this.roster_view.$('.collapsed-wrap').hideIf(expanded);
            this.roster_view.$('.expanded-wrap').showIf(expanded);
            this.roster_view.$('.btn-pin').hideIf(is_narrow).text(pinned ? 'unpin' : 'pin');

            if (is_narrow && pinned) {
                this.roster_view.data.set({expanded: false, pinned: false});
                return;
            }
            if (!is_narrow && !pinned && this.settings.roster.pinned) {
                this.roster_view.data.set({expanded: true, pinned: true});
                return;
            }
            var roster_width, panel_width, panel_margin = '', toolbar_width = 50;

            if (is_wide || !(is_narrow || pinned)) {
                panel_width = 1050;
                roster_width = 300;
            } else if (is_narrow) {
                panel_width = width - toolbar_width - 20 - 44;
                if (panel_width > 1038) {
                    panel_width = 1038;
                    roster_width = 288;
                } else {
                    roster_width = 250;
                    panel_margin = toolbar_width + 10;
                }
            } else {
                panel_width = (width - toolbar_width - 20) * 7 / 9;
                roster_width = (width - toolbar_width - 20) * 2 / 9;
                panel_margin = toolbar_width + 10;
            }
            if (!expanded) {
                roster_width = is_wide ? 48 : 44;
            }

            var panel_gap = (width - panel_width) / 2,
                left_gap = panel_gap - toolbar_width,
                right_gap = panel_gap - roster_width;
            this.roster_view.$('.expanded-wrap').switchClass('solid',
                    (!pinned && (!is_wide || right_gap < 0)));
            if (pinned && !panel_margin && (3 * right_gap < left_gap)) {
                panel_margin = toolbar_width + 0.75 * (left_gap + right_gap);
            }
            this.main_panel.setCustomCss({
                width: panel_width,
                'margin-left': panel_margin
            });
            this.roster_view.setCustomCss({width: roster_width});
        }

        this.on("update_layout", this.updateLayout, this);


        this.body.addScreen('blank', {});

        this.body.addScreen('login', {
            login: { xmpp_login: null }
        });

        this.body.addScreen('settings', {
            toolbar: null,
            main: {
                wide: { settings: null }
            },
            roster: null
        });

        this.body.addScreen('add_account', {
            toolbar: null,
            login: null
        });

        this.body.addScreen('about', {
            toolbar: null,
            main: {
                wide: { about: null }
            },
            roster: null
        });

        var path_acc_settings_left = new this.ViewPath('account.settings_left'),
            path_acc_settings_right = new this.ViewPath('account.settings_right'),
            path_acc_vcard_edit = new this.ViewPath('account.vcard_edit');

        this.body.addScreen('account_settings', {
            toolbar: null,
            main: {
                wide: {
                    account_settings: {
                        left: path_acc_settings_left,
                        right: path_acc_settings_right
                    }
                }
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


        var path_chat_head = new this.ViewPath('chat_item.content.head'),
            path_chat_body = new this.ViewPath('chat_item.content'),
            path_chat_bottom = new this.ViewPath('chat_item.content.bottom'),
            path_contact_details = new this.ViewPath('contact.details_view'),
            path_group_invitation = new this.ViewPath('contact.invitation'),
            path_participant_messages = new this.ViewPath('contact.messages_view'),
            path_details_participants = new this.ViewPath('contact.details_view.participants');

        this.body.addScreen('contacts', {
            toolbar: null,
            main: {
                left: { contacts: null },
                right: { contact_placeholder: null }
            },
            roster: null
        });

        this.body.addScreen('search', {
            toolbar: null,
            main: {
                wide: { discovering_main: null}
            },
            roster: null
        });

        this.body.addScreen('all-chats', {
            toolbar: null,
            main: {
                left: { chats: null },
                right: { chat_placeholder: null }
            },
            roster: null
        });


        this.right_panel.patchTree = function (tree, options) {
            if (options.right === 'group_invitation') {
                return { details: path_group_invitation };
            }
            if (options.right === 'contact_details') {
                return { details: path_contact_details };
            }
            if (options.right === 'participant_messages') {
                return {
                    chat_head: path_chat_head,
                    chat_body: path_participant_messages,
                    chat_bottom: path_chat_bottom
                };
            }
            if (options.details_content === 'participants')
                return { details_content: path_details_participants };
            if ((options.name === 'all-chats') && options.chat_item) {
                return {
                    chat_head: path_chat_head,
                    chat_body: path_chat_body,
                    chat_bottom: path_chat_bottom
                };
            }
        };

        this.body.setScreen('blank');

        // initial synchronization
        this.api_account.once("settings_result", function (result) {
            if (result === null && !this.accounts.length) {
                this.body.setScreen('login');
            } else if (this.body.isScreen('blank')) {
                this.body.setScreen('all-chats');
            }
        }, this);

        this.api_account.ready.then(this.api_account.start.bind(this.api_account));
    }, xabber);

    return xabber;
  };
});
