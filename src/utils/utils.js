define([
    "xabber-dependencies",
    "xabber-emoji-utils",
    "xabber-image-utils",
    "xabber-modal-utils",
    "xabber-constants",
    "xabber-textarea-utils"
], function (deps, emoji, images, modals, constants, textarea) {
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
                html_concat = "",
                url_regexp = /(((ftp|http|https):\/\/)|(www\.))(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/g;
            $obj[0].childNodes.forEach(function (node) {
                let $node = $(node),
                    x = node.outerHTML;
                if (node.tagName === 'A') {
                    html_concat += x;
                    return;
                }
                else {
                    if (node.nodeName === '#text')
                        x = _.escape($node.text());
                    let list = x && x.match(url_regexp);
                    if (!list) {
                        html_concat += x;
                        return;
                    }
                    if (list.length === 1 && list[0] === x) {
                        html_concat += getHyperLink(x);
                    } else {
                        for (i = 0; i < list.length; i++) {
                            x = x.replace(list[i], getHyperLink(list[i]));
                        }
                        html_concat += x;
                    }
                }
            }.bind(this));
            $obj.html(html_concat);
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

        pretty_short_datetime_recent_chat: function (timestamp) {
            timestamp = Number(timestamp ? moment(timestamp) : moment());
            if (moment(timestamp).startOf('day').isSame(moment().startOf('day')) || Number(moment().subtract(12, 'hours') < timestamp)) {
                return moment(timestamp).format("HH:mm:ss");
            }
            if (Number(moment().subtract(12, 'hours')) > timestamp && Number(moment().subtract(7, 'days')) <= timestamp) {
                return moment(timestamp).format("ddd");
            }
            if (Number(moment().subtract(7, 'days')) > timestamp && Number(moment().subtract(1, 'year')) <= timestamp) {
                return moment(timestamp).format("MMM D");
            }
            if (timestamp && Number(moment().subtract(1, 'year')) > timestamp) {
                return moment(timestamp).format("D MMM YYYY");
            }
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

        file_type_icon: function (mime_type) {
            let filetype = utils.pretty_file_type(mime_type);
            if (filetype === 'image')
                return 'mdi-image';
            if (filetype === 'audio')
                return 'mdi-music-note';
            if (filetype === 'video')
                return 'mdi-filmstrip';
            if (filetype === 'document')
                return 'mdi-file-document-box';
            if (filetype === 'presentation')
                return 'mdi-presentation';
            if (filetype === 'archive')
                return 'mdi-zip-box';
            if (filetype === 'file')
                return 'mdi-file';
            if (filetype === 'pdf')
                return 'mdi-file-pdf';
            return 'mdi-file'
        },

        pretty_file_type: function (mime_type) {
            if (constants.MIME_TYPES.image.includes(mime_type))
                return 'image';
            if (constants.MIME_TYPES.audio.includes(mime_type))
                return 'audio';
            if (constants.MIME_TYPES.video.includes(mime_type))
                return 'video';
            if (constants.MIME_TYPES.document.includes(mime_type))
                return 'document';
            if (constants.MIME_TYPES.pdf.includes(mime_type))
                return 'pdf';
            if (constants.MIME_TYPES.presentation.includes(mime_type))
                return 'presentation';
            if (constants.MIME_TYPES.archive.includes(mime_type))
                return 'archive';
            if (constants.MIME_TYPES.table.includes(mime_type))
                return 'electronic table';
            return 'file';
        },

        pretty_file_type_with_article: function (mime_type) {
            let type = utils.pretty_file_type(mime_type),
                vowels = ["a", "e", "i", "o", "u"];
            (type === 'pdf') && (type = 'document');
            if (vowels.includes(type[0]))
                return 'an ' + type;
            else
                return 'a ' + type;
        },

        pretty_size: function (size) {
            if (!size)
                return "";
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

        pretty_last_seen: function (seconds) {
            if ((seconds >= 0)&&(seconds < 60))
                return 'last seen just now';
            if ((seconds > 60)&&(seconds < 3600))
                return ('last seen ' + Math.trunc(seconds/60) + ((seconds < 120) ? ' minute ago' : ' minutes ago'));
            if ((seconds >= 3600)&&(seconds < 7200))
                return ('last seen hour ago');
            if ((seconds >= 3600*48*2))
                return ('last seen '+ moment().subtract(seconds, 'seconds').format('LL'));
            else
                return ('last seen '+ (moment().subtract(seconds, 'seconds').calendar()).toLowerCase());
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

        pretty_name: function (name) {
            return name ? (name[0].toUpperCase() + name.replace(/-/,' ').substr(1).toLowerCase()) : "";
        },

        slice_string: function (str, from, to) {
            to = _.isNumber(to) ? to : [...str].length;
            if (str.length === [...str].length)
                return str.slice(from, to);
            else
                return Array.from(str).slice(from, to).join("");
        },

        slice_pretty_body: function (body, legacy_refs) {
            body = body || "";
            let pretty_body = Array.from(deps.Strophe.xmlescape(body));
            legacy_refs && legacy_refs.forEach(function (legacy_ref) {
                for (let idx = legacy_ref.start; idx <= legacy_ref.end; idx++)
                    pretty_body[idx] = "";
            }.bind(this));
            return deps.Strophe.xmlunescape(pretty_body.join("").trim());
        },

        markupBodyMessage: function (message, mention_elem) {
            let attrs = _.clone(message.attributes),
                mentions = attrs.mentions || [],
                markups = attrs.markups || [],
                legacy_refs = attrs.legacy_content || [],
                blockquotes = attrs.blockquotes || [],
                body = legacy_refs.length ? attrs.original_message : attrs.message,
                markup_body = Array.from(deps.Strophe.xmlescape(body));
            !mention_elem && (mention_elem = 'span');

            mentions.concat(markups).forEach(function (markup) {
                let start_idx = markup.start,
                    end_idx = markup.end > (markup_body.length - 1) ? (markup_body.length - 1) : markup.end,
                    mark_up = markup.markups || [],
                    mention = (markup.type !== 'uri') && markup.uri || "";
                if (start_idx > markup_body.length - 1)
                    return;
                if (mark_up.length) {
                    let start_tags = "",
                        end_tags = "";
                    mark_up.forEach(function (mark_up_style) {
                        start_tags = '<' + mark_up_style[0].toLowerCase() + '>' + start_tags;
                        end_tags += '</' + mark_up_style[0].toLowerCase() + '>';
                    }.bind(this));
                    markup_body[start_idx] = start_tags + markup_body[start_idx];
                    markup_body[end_idx] += end_tags;
                }
                else {
                    if (mention) {
                        markup_body[start_idx] = '<' + mention_elem + ' data-id="' + (mention.lastIndexOf('?id=') > -1 ? mention.slice(mention.lastIndexOf('?id=') + 4) : mention) + '" class="mention ground-color-100">' + markup_body[start_idx];
                        markup_body[end_idx] += '</' + mention_elem + '>';
                    }
                    else if (markup.type === 'uri') {
                        markup_body[start_idx] = '<a target="_blank" class="msg-hyperlink" href="' + markup.uri + '">' + markup_body[start_idx];
                        markup_body[end_idx] += '</a>';
                    }
                }
            }.bind(this));

            legacy_refs.forEach(function (legacy) {
                for (let idx = legacy.start; idx <= legacy.end; idx++)
                    markup_body[idx] = "";
            }.bind(this));

            blockquotes.forEach(function (quote) {
                for (let idx = quote.start; idx < (quote.start + quote.marker.length); idx++)
                    markup_body[idx] = "";
                for (let idx = quote.start; idx < quote.end; idx++) {
                    if (markup_body[idx] === '\n') {
                        for (let child_idx = idx + 1; child_idx <= (idx + quote.marker.length); child_idx++)
                            markup_body[child_idx] = "";
                        idx+= quote.marker.length - 1;
                    }
                }
                markup_body[quote.start] = '<div class="quote">';
                markup_body[quote.end] += '</div>';
            }.bind(this));

            return markup_body.join("").trim();
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
