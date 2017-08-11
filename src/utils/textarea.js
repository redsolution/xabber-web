define(["xabber-dependencies"], function (deps) {
    var _ = deps._,
        $ = deps.$;

    $.fn.placeCaretAtEnd = function () {
        if (!this.length) {
            return this;
        }
        var el = this[0];
        el.focus();
        if (!_.isUndefined(window.getSelection) && !_.isUndefined(document.createRange)) {
            var range = document.createRange();
            range.selectNodeContents(el);
            range.collapse(false);
            var sel = window.getSelection();
            sel.removeAllRanges();
            sel.addRange(range);
        } else if (!_.isUndefined(document.body.createTextRange)) {
            var textRange = document.body.createTextRange();
            textRange.moveToElementText(el);
            textRange.collapse(false);
            textRange.select();
        }
        return this;
    };

    $.fn.updateRichTextarea = function () {
        var $placeholder = this.siblings('.placeholder'),
            text = this.getTextFromRichTextarea();
        if (!text) {
            this.html('');
        }
        $placeholder.hideIf(text);
        return this;
    };

    $.fn.flushRichTextarea = function () {
        this.html('').siblings('.placeholder').removeClass('hidden');
        return this;
    };

    $.fn.getTextFromRichTextarea = function () {
        var $div = $('<div>').html(this.html());
        $div.find('.emoji').each(function () {
            $(this).replaceWith($(this).data('emoji'));
        });
        $div.find('span').each(function () {
            $(this).replaceWith($(this).html());
        });
        $div.find('div').each(function () {
            var $this = $(this);
            $this.find('br').remove();
            var html = $this.html();
            $this.replaceWith('\n'+html);
        });
        $div.find('br').each(function () {
            $(this).replaceWith('\n');
        });
        return $div.text();
    };

    return null;
});
