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
        var text = this.getTextFromRichTextarea();
        if (!text) {
            this.html('');
        }
        return this;
    };

    $.fn.flushRichTextarea = function () {
        this.html('');
        return this;
    };

    $.fn.pasteHtmlAtCaret = function (html) {
        var sel, range;
        this[0].focus();
        if (window.getSelection) {
            // IE9 and non-IE
            sel = window.getSelection();
            if (sel.getRangeAt && sel.rangeCount) {
                range = sel.getRangeAt(0);
                range.deleteContents();

                // Range.createContextualFragment() would be useful here but is
                // non-standard and not supported in all browsers (IE9, for one)
                var el = document.createElement("div");
                el.innerHTML = html;
                var frag = document.createDocumentFragment(), node, lastNode;
                while ( (node = el.firstChild) ) {
                    lastNode = frag.appendChild(node);
                }
                range.insertNode(frag);

                // Preserve the selection
                if (lastNode) {
                    range = range.cloneRange();
                    range.setStartAfter(lastNode);
                    range.collapse(true);
                    sel.removeAllRanges();
                    sel.addRange(range);
                }
            }
        } else if (document.selection && document.selection.type != "Control") {
            // IE < 9
            document.selection.createRange().pasteHTML(html);
        }
        return this;
    };

    $.fn.getTextFromRichTextarea = function () {
        var $div = $('<div>').html(this.html());
        $div.find('.emoji').each(function () {
            $(this).replaceWith($(this).find('span').text());
        });
        $div.find('p').each(function () {
            $(this).replaceWith($(this).html() + '\n');
        });
        $div.find('span').each(function () {
            $(this).replaceWith($(this).html());
        });
        $div.find('div').each(function () {
            var $this = $(this);
            $this.find('br').remove();
            var html = $this.html();
            if ($this.hasClass('emoji'))
                $this.replaceWith(html);
            else
                $this.replaceWith('\n'+html);
        });
        /*$div.find('br').each(function () {
            $(this).replaceWith('\n');
        });*/
        return $div.text();
    };

    return null;
});
