define(["xabber-dependencies", "xabber-templates"], function (deps, templates) {
    var _ = deps._,
        $ = deps.$;

    var dialogs_queue = [];

    var Dialog = function (header, text, buttons) {
        this.header = header;
        this.text = text;
        this.buttons = buttons || {};
        this.action = new $.Deferred();
    };

    var throwNewDialog = function (dialog) {
        dialogs_queue.push(dialog);
        (dialogs_queue.length === 1) && throwDialog(dialog);
        return dialog.action.promise();
    };

    var throwDialog = function (dialog) {
        var ok_button = dialog.buttons.ok_button,
            cancel_button = dialog.buttons.cancel_button,
            optional_buttons = (dialog.buttons.optional_buttons || []).reverse();
        ok_button && (ok_button = {text: ok_button.text || 'Ok'});
        cancel_button && (cancel_button = {text: cancel_button.text || 'Cancel'});
        var $modal = $(templates.base.dialog({
            header: dialog.header,
            text: dialog.text,
            ok_button: ok_button,
            cancel_button: cancel_button,
            optional_buttons: optional_buttons
        })).appendTo('#modals');
        $modal.on('cleanup', function (ev, data) {
            $modal.remove();
            dialog.action.resolve(data.action);
            dialogs_queue.shift();
            dialogs_queue.length && throwDialog(dialogs_queue[0]);
        });
        $modal.find('.modal-footer button').click(function (ev) {
            $modal.closeModal({complete: function () {
                $modal.trigger('cleanup', {action: $(ev.target).data('option')});
            }});
        });
        $modal.openModal({
            complete: function () {
                $modal.trigger('cleanup', {action: null});
            }
        });
    };

    return {
        common: function (header, text, buttons) {
            var dialog = new Dialog(header, text, buttons);
            return throwNewDialog(dialog);
        },

        error: function (text) {
            return this.common('Error', text, {ok_button: true});
        },

        ask: function (header, text) {
            return this.common(header, text, {ok_button: true, cancel_button: true});
        }
    };
});
