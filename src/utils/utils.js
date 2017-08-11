define([
    "xabber-dependencies",
    "xabber-emoji-utils",
    "xabber-image-utils",
    "xabber-dialog-utils",
    "xabber-textarea-utils"
], function (deps, emoji, images, dialogs, textarea) {
    var $ = deps.$,
        _ = deps._,
        moment = deps.moment;

    // jQuery extensions
    $.fn.switchClass = function (klass, condition) {
        if (arguments.length === 1) {
            condition = !this.hasClass(klass);
        }
        if (condition) {
            this.addClass(klass);
        } else {
            this.removeClass(klass);
        }
        return this;
    };

    $.fn.showIf = function (condition) {
        return this.switchClass('hidden', !condition);
    };

    $.fn.hideIf = function (condition) {
        return this.switchClass('hidden', condition);
    };

    var getHyperLink = function (url) {
        var prot = (url.indexOf('http://') === 0 ||  url.indexOf('https://') === 0) ? '' : 'http://',
            escaped_url = encodeURI(decodeURI(url)).replace(/[!'()]/g, escape).replace(/\*/g, "%2A");
        return "<a target='_blank' class='msg-hyperlink' href='"+prot+escaped_url + "'>"+url+"</a>";
    };

    $.fn.hyperlinkify = function (options) {
        options || (options = {});
        var $query = options.selector ? this.find(options.selector) : this;
        $query.each(function (i, obj) {
            var $obj = $(obj),
                x = $obj.html(),
                url_regexp = /(((ftp|http|https):\/\/)|(www\.))(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/g,
                list = x.match(url_regexp);
            if (!list) {
                return;
            }
            if (list.length === 1 && list[0] === x) {
                // TODO: parse media link
                $obj.html(getHyperLink(x));
            } else {
                for (i = 0; i < list.length; i++) {
                    x = x.replace(list[i], getHyperLink(list[i]));
                }
                $obj.html(x);
            }
        });
        return this;
    };

    var utils = {
        uuid: function () {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
                var r = Math.random() * 16 | 0,
                    v = c == 'x' ? r : r & 0x3 | 0x8;
                return v.toString(16);
            });
        },

        utoa: function (str) {
            return window.btoa(unescape(encodeURIComponent(str)));
        },

        atou: function (str) {
            return decodeURIComponent(escape(window.atob(str)));
        },

        now: function () {
            return Math.floor(moment.now() / 1000);
        },

        pretty_datetime: function (timestamp) {
            var datetime = moment(timestamp), day = moment(datetime).startOf('day');
            if (day.isSame(moment().startOf('day'))) {
                return datetime.format("HH:mm");
            }
            return datetime.format("Do MMM YYYY HH:mm");
        },

        pretty_short_datetime: function (timestamp) {
            var datetime = timestamp ? moment(timestamp) : moment(),
                day = moment(datetime).startOf('day'),
                week = moment(datetime).startOf('week');
            if (day.isSame(moment().startOf('day'))) {
                return datetime.format('HH:mm');
            } else if (week.isSame(moment().startOf('week'))) {
                return datetime.format('ddd');
            } else {
                return datetime.format('M/D/gg');
            }
        },

        pretty_timedelta: function (seconds) {
            if (seconds < 60) {
                return 'just now';
            }
            if (seconds < 3600) {
                return Math.floor(seconds / 60) + ' minutes ago';
            }
            if (seconds < 86400) {
                return Math.floor(seconds / 3600) + ' hours ago';
            }
            return Math.floor(seconds / 86400) + ' days ago';
        },

        pretty_size: function (size) {
            if (size < 1024) {
                return size+' B';
            } else if (size < 1048576) {
                return (size/1024).toFixed(2)+' KB';
            } else if (size < 1073741824) {
                return (size/1048576).toFixed(2)+' MB';
            } else {
                return (size/1073741824).toFixed(2)+' GB';
            }
        },

        openWindow: function (url, errback) {
            var win = window.open(url, '_blank');
            if (win) {
                win.focus();
            } else {
                errback && errback();
            }
        },

        clearSelection: function () {
            var selection = window.getSelection();
            if (selection.empty) {
                selection.empty();
            } else if (selection.removeAllRanges) {
                selection.removeAllRanges();
            }
        },

        emoji: emoji,
        images: images,
        dialogs: dialogs
    };

    return utils;
});
