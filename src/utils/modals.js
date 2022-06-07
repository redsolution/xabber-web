define(["xabber-dependencies", "xabber-templates"], function (deps, templates) {
    var _ = deps._,
        $ = deps.$;

    var $modal_container = $('<div>').attr('id', 'modals').appendTo('body');

    var modal_queue = [];
 
    var Modal = function (modal_constructor, options) {
        if (modal_constructor instanceof Function) {
            this.$modal = $(modal_constructor());
        } else {
            this.$modal = $(modal_constructor);
        }
        this.options = options || {};
        this.closed = new $.Deferred();
    };

    let getString = function (id, params) {
        if (deps.xabber_i18next.exists(id)) {
            return deps.xabber_i18next.t(id, { postProcess: 'sprintf', sprintf: params}).replace(/\\'/g, "'").replace(/%+\d+[$]/g, "%").replace(/\\n/g, '&#10;');
        } else if (deps.xabber_i18next.default_lang) {
            return deps.xabber_i18next.default_lang(id, { postProcess: 'sprintf', sprintf: params}).replace(/\\'/g, "'").replace(/%+\d+[$]/g, "%").replace(/\\n/g, '&#10;');
        } else
            return "";
    };
 
    _.extend(Modal.prototype, {
        open: function (options) {
            if (this.options.use_queue) {
                modal_queue.push(this);
                (modal_queue.length === 1) && this.throw();
            } else {
                this.throw();
            }
            setTimeout(() => {
                document.addEventListener("keyup", this.clickHandler.bind(this));
            }, 500);
            return this.closed.promise();
        },

        throw: function () {
            this.$modal.appendTo($modal_container).prop('modal', this);
            var modal_options = _.omit(this.options, ['use_queue']);
            _.extend(modal_options, {
                is_default_complete: true,
                complete_data: null
            });

            if (this.options.use_queue) {
                this.$modal.one('modal_close', function (ev, data) {
                    this.$modal.detach();
                    this.closed.resolve(data.value);
                    modal_queue.shift();
                    modal_queue.length && modal_queue[0].throw();
                }.bind(this));
            }

            this.$modal._openModal(modal_options);
        },

        close: function (options) {
            var modal_options = _.omit(options, ['use_queue', 'is_default_complete', 'complete_data']);
            _.extend(modal_options, {
                complete: function () {
                    if (this.options.use_queue) {
                        var data = _.isUndefined(options.complete_data) ? null : options.complete_data;
                        this.complete(data);
                    }
                    if (options.is_default_complete) {
                        if (typeof(this.options.complete) === "function") {
                            this.options.complete();
                        }
                    } else {
                        if (this.options.use_queue) {
                            this.complete();
                        }
                        if (typeof(options.complete) === "function") {
                            options.complete();
                        }
                    }
                }.bind(this)
            });

            this.$modal.prop('modal', null);
            this.$modal._closeModal(modal_options);
        },

        complete: function (value) {
            document.removeEventListener("keyup", this.clickHandler);
            this.$modal.trigger('modal_close', {value: value});
        },

        clickHandler: function (ev) {
            if (ev.keyCode === 13) {
                this.$modal.find('.modal-footer button.ok-button').click();
                ev.preventDefault();
            }
        }
    });

    $.fn._openModal = $.fn.openModal;

    $.fn.openModal = function (options) {
        var modal = new Modal(this, options);
        return modal.open();
    };

    $.fn._closeModal = $.fn.closeModal;

    $.fn.closeModal = function (options) {
        var modal = this.prop('modal');
        if (modal) {
            modal.close(options);
        } else {
            this._closeModal(options);
        }
    };

    return {
        Modal: Modal,

        clear_queue: function () {
            modal_queue = [];
        },

        dialogs: {
            common: function (header, text, buttons, dialog_options, flag, modal_class) {
                var dialog = new Modal(function () {
                    buttons || (buttons = {});
                    dialog_options || (dialog_options = []);
                    var ok_button = buttons.ok_button,
                        cancel_button = buttons.cancel_button,
                        optional_buttons = (buttons.optional_buttons || []).reverse();
                    ok_button && (ok_button = {text: ok_button.text || getString("ok")});
                    cancel_button && (cancel_button = {text: cancel_button.text || getString("cancel")});
                    return templates.base.dialog({
                        header: header,
                        text: text,
                        ok_button: ok_button,
                        cancel_button: cancel_button,
                        optional_buttons: optional_buttons,
                        dialog_options: dialog_options,
                        flag: flag || "",
                        modal_class: modal_class || ""
                    });
                }, {use_queue: true});

                if (dialog_options.blob_image_from_clipboard) {
                    dialog.$modal.find('.dialog-options-wrap').html('');
                    dialog.$modal.find('.img-from-clipboard')[0].src = dialog_options.blob_image_from_clipboard;
                    dialog.$modal.find('.container-for-img').removeClass('hidden');
                }

                if (dialog_options.canvas) {
                    dialog.$modal.find('.dialog-options-wrap').html('');
                    dialog.$modal.find('.container-for-img').html("").removeClass('hidden')[0].appendChild(dialog_options.canvas);
                    if (dialog_options.bottom_text)
                        $('<div class="dialog-bottom-text"/>').html(dialog_options.bottom_text).appendTo(dialog.$modal.find('.container-for-img'));
                }

                if (dialog_options.escape_button) {
                    dialog.$modal.find('.modal-header').append('<i class="close-modal mdi mdi-close mdi-24px"></i>');
                }

                if (dialog_options.input_placeholder_value || dialog_options.input_value) {
                    dialog.$modal.find('.dialog-options-wrap').html($('<input type="text" placeholder="' + dialog_options.input_placeholder_value + '" id="user_value"/>').val(dialog_options.input_value));
                }

                dialog.$modal.find('.modal-footer button').click(function (ev) {
                    var option = $(ev.target).data('option'),
                        $options = dialog.$modal.find('.dialog-option'),
                        user_value_input = dialog.$modal.find('#user_value');
                    if (option && $options.length) {
                        var result = {};
                        _.each($options, function (item) {
                            var $item = $(item);
                            result[$item.data('name')] = $item.find('input').prop('checked');
                        });
                        dialog.close({complete_data: result});
                    } else {
                        if (user_value_input.length) {
                            if ($(ev.target).hasClass('btn-cancel')) {
                                dialog.close({complete_data: false});
                            } else if ($(ev.target).hasClass('optional-button')) {
                                dialog.close({complete_data: option});
                            }
                            else {
                                var user_value = user_value_input.val();
                                dialog.close({complete_data: user_value});
                            }
                        }
                        else
                            dialog.close({complete_data: option});
                    }
                });

                dialog.$modal.find('.modal-header .close-modal').click(function () {
                        dialog.close({complete_data: false});
                });

                return dialog.open();
            },

            warning: function (text, dialog_options) {
                return this.common(getString("warning"), text, {ok_button: true}, dialog_options);
            },

            error: function (text, dialog_options) {
                return this.common(getString("xabber_account__login__dialog_error__header"), text, {ok_button: true}, dialog_options);
            },

            ask: function (header, text, dialog_options, buttons, flag) {
                var ok_text, cancel_text;
                if (buttons) {
                    ok_text = buttons.ok_button_text;
                    cancel_text = buttons.cancel_button_text;
                }
                return this.common(header, text, {ok_button: {text: ok_text}, cancel_button: {text: cancel_text}}, dialog_options, flag);
            },

            ask_extended: function (header, text, dialog_options, buttons) {
                var ok_text, optional_button;
                if (buttons) {
                    ok_text = buttons.ok_button_text;
                    optional_button = (buttons.optional_button) ? [{value: buttons.optional_button, name: buttons.optional_button_text}] : false;
                }
                return this.common(header, text, {ok_button: {text: ok_text}, cancel_button: true, optional_buttons: optional_button}, dialog_options, 'extended');
            },

            ask_enter_value: function (header, text, dialog_options, buttons) {
                var ok_text, resend_button;
                if (buttons) {
                    ok_text = buttons.ok_button_text;
                    resend_button = (buttons.resend_button_text) ? [{value: buttons.resend_to, name: buttons.resend_button_text}] : false;
                }
                return this.common(header, text, {ok_button: {text: ok_text}, optional_buttons: resend_button, cancel_button: true}, dialog_options);
            },

            notify: function (header, text) {
                return this.common(header, text, {ok_button: true});
            }
        }
    };
});
