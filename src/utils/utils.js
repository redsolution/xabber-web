define([
    "xabber-dependencies",
    "xabber-emoji-utils",
    "xabber-image-utils",
    "xabber-modal-utils",
    "xabber-textarea-utils"
], function (deps, emoji, images, modals, textarea) {
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

        pretty_time: function (timestamp) {
            var datetime = timestamp ? moment(timestamp) : moment();
            return datetime.format('HH:mm:ss');
        },

        pretty_date: function (timestamp) {
            var datetime = timestamp ? moment(timestamp) : moment();
            return datetime.format('dddd, MMMM D, YYYY');
        },

        pretty_datetime: function (timestamp) {
            var datetime = timestamp ? moment(timestamp) : moment();
            return datetime.format('MMMM D, YYYY HH:mm:ss');
        },

        pretty_short_datetime: function (timestamp) {
            var datetime = timestamp ? moment(timestamp) : moment(),
                day = moment(datetime).startOf('day'),
                year = moment(datetime).startOf('year');
            if (day.isSame(moment().startOf('day'))) {
                return datetime.format('HH:mm:ss');
            } else if (year.isSame(moment().startOf('year'))) {
                return datetime.format('MMM D');
            } else {
                return datetime.format('DD/MM/gg');
            }
        },

        pretty_short_month_date: function (timestamp) {
            var datetime = timestamp ? moment(timestamp) : moment(),
                day = moment(datetime).startOf('day'),
                year = moment(datetime).startOf('year');
            if (day.isSame(moment().startOf('day'))) {
                return datetime.format('HH:mm:ss');
            } else if (year.isSame(moment().startOf('year'))) {
                return datetime.format('MMM D, YYYY HH:mm:ss');
            } else {
                return datetime.format('DD/MM/gg, HH:mm:ss');
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

        pretty_duration: function (duration) {
            if (_.isUndefined(duration))
                return undefined;
            if (duration < 10)
                return ("0:0" + duration);
            if (duration < 60)
                return ("0:" + duration);
            if (duration > 60)
                return (Math.trunc(duration/60) + ":" + ((duration%60 < 10) ? ("0" + (duration%60)) : duration%60));
        },

        copyTextToClipboard: function(text, callback_msg, errback_msg) {
            if (!window.navigator.clipboard) {
                return;
            }
            window.navigator.clipboard.writeText(text).then(function() {
                if (callback_msg) {
                    let info_msg = callback_msg;
                    this.callback_popup_message(info_msg, 1500);
                }
            }.bind(this), function() {
                if (errback_msg) {
                    let info_msg = errback_msg;
                    this.callback_popup_message(info_msg, 1500);
                }
            }.bind(this));
        },

        callback_popup_message: function (info_msg, time) {
            let $body = $(document.body),
                $popup_msg = $('<div class="callback-popup-message"/>').text(info_msg);
            $body.find('.callback-popup-message').remove();
            $body.append($popup_msg);
            setTimeout( function() {
                $popup_msg.remove();
            }, time);
        },

        openWindow: function (url, errback) {
            let win = window.open(url, '_blank');
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

        isMobile: {
            Android: function () {
                return navigator.userAgent.match(/Android/i);
            },
            BlackBerry: function () {
                return navigator.userAgent.match(/BlackBerry/i);
            },
            iOS: function () {
                return navigator.userAgent.match(/iPhone|iPad|iPod/i);
            },
            Opera: function () {
                return navigator.userAgent.match(/Opera Mini/i);
            },
            Windows: function () {
                return navigator.userAgent.match(/IEMobile/i) || navigator.userAgent.match(/WPDesktop/i);
            },
            any: function () {
                return (this.Android() || this.BlackBerry() || this.iOS() || this.Opera() || this.Windows());
            }
        },

        emoji: emoji,
        images: images,
        modals: modals,
        dialogs: modals.dialogs
    };

    return utils;
});
