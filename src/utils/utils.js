import deps from "xabber-dependencies";
import emoji from "xabber-emoji-utils";
import images from "xabber-image-utils";
import modals from "xabber-modal-utils";
import constants from "xabber-constants";
import textarea from "xabber-textarea-utils";

var $ = deps.$,
    _ = deps._,
    moment = deps.moment,
    curve25519js = deps.curve25519js;

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

$.fn.isVisibleInViewport = function() {
    let elementTop = $(this).offset().top,
        elementBottom = elementTop + $(this).outerHeight();

    let viewportTop = $(window).scrollTop(),
        viewportBottom = viewportTop + $(window).height();

    return elementBottom > viewportTop && elementTop < viewportBottom;
};

$.fn.isVisibleInContainer = function(container) {
    if (!this.length || !container.length)
        return;
    container = container[0];
    let eleTop = this[0].offsetTop,
        eleBottom = eleTop + this[0].clientHeight;

    let containerTop = container.scrollTop,
        containerBottom = containerTop + container.clientHeight;

    return (
        (eleTop >= containerTop && eleBottom <= containerBottom) ||
        // Some part of the element is visible in the container
        (eleTop < containerTop && containerTop < eleBottom) ||
        (eleTop < containerBottom && containerBottom < eleBottom)
    );
};

$.fn.isFullyVisibleInContainer = function(container) {
    if (!this.length || !container.length)
        return;
    container = container[0];
    let eleTop = this[0].offsetTop,
        eleBottom = eleTop + this[0].clientHeight;

    let containerTop = container.scrollTop,
        containerBottom = containerTop + container.clientHeight;

    return (
        eleTop >= containerTop && eleBottom <= containerBottom
    );
};

$.fn.isBottomVisibleInContainer = function(container) {
    if (!this.length || !container.length)
        return;
    container = container[0];
    let eleTop = this[0].offsetTop,
        eleBottom = eleTop + this[0].clientHeight;

    let containerTop = container.scrollTop,
        containerBottom = containerTop + container.clientHeight;

    return (
        eleBottom <= containerBottom
    );
};

var getHyperLink = function (url) {
    var prot = (url.indexOf('http://') === 0 ||  url.indexOf('https://') === 0) ? '' : 'http://',
        escaped_url = "";
    try {
        escaped_url = url.replace(/[!'()]/g, escape).replace(/\*/g, "%2A");
    }
    catch (e) {
        escaped_url = url;
    }
    try {
        url = decodeURI(url);
    }
    catch (e) {
        return url;
    }
    return "<a target='_blank' class='msg-hyperlink' href='"+prot+escaped_url + "'>"+url+"</a>";
};

$.fn.hyperlinkify = function (options) {
    options || (options = {});
    var $query = options.selector ? this.find(options.selector) : this;
    $query.each(function (i, obj) {
        var $obj = $(obj),
            html_concat = "",
            url_regexp = /((((ftp|http|https):\/\/)|(www\.))(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?)|((\b)(([\w#:.@\-]+))?(\.net|\.edu|\.cloud|\.top|\.vip|\.cash|\.im|\.online|\.chat|\.com|\.org|\.ru|\.travel|\.info|\.tv|\.biz|\.mobi|\.tel|\.ar|\.al|\.asia|\.np|\.ng|\.io|\.bb|\.br|\.ca|\.tr|\.co|\.ec|\.fr|\.ht|\.in|\.eg|\.ie|\.et|\.jo|\.mr|\.id|\.iq|\.nl|\.ps|\.ph|\.sl|\.si|\.se|\.af|\.ag|\.be|\.bd|\.bg|\.cl|\.cd|\.my|\.mz|\.mx|\.cz|\.eu|\.dz|\.de|\.hk|\.it|\.la|\.no|\.pl|\.ro|\.sg|\.ke|\.kr|\.ch|\.ug|\.us|\.ve|\.vn|\.at|\.bo|\.cm|\.cn|\.cg|\.dk|\.fi|\.gr|\.gh|\.is|\.ir|\.jp|\.lv|\.ma|\.me|\.pk|\.pe|\.pt|\.sa|\.sk|\.es|\.tz|\.tw|\.ua|\.uz|\.ye)((\/[\w#!:;.?+=&%@!\-\/]+)|(\b)|\/))/gim;
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
                list = Array.from(new Set(list));
                if (!list || list.length === 0) {
                    html_concat += x;
                    return;
                }
                if (list.length === 1 && list[0] === x) {
                    html_concat += options.decode_uri ? decodeURI(x) : getHyperLink(x);
                } else {
                    for (i = 0; i < list.length; i++) {
                            if (options.decode_uri) {
                                try {
                                    x = x.replace(list[i], decodeURI(list[i]));
                                } catch (e) {
                                    console.log(list[i])
                                    console.error(e)
                                }
                            }
                            else
                                x = x.replaceAll(new RegExp(`(\\s|^)(${list[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`,"g"), '$1' + getHyperLink(list[i]));
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
        return window.btoa(_.unescape(encodeURIComponent(str)));
    },

    atou: function (str) {
        return decodeURIComponent(_.escape(window.atob(str)));
    },

    now: function () {
        return Math.floor(moment.now() / 1000);
    },

    randomCode: function (length) {
        let result = '',
            characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
            charactersLength = characters.length,
            counter = 0;
        while (counter < length) {
            result += characters.charAt(Math.floor(Math.random() * charactersLength));
            counter += 1;
        }
        return result;
    },

    doCurve: function (priv_key, pub_key) {
        if (!priv_key || !pub_key)
            return;
        // console.log(priv_key);
        // console.log(pub_key);

        // a_key = new Uint8Array(a_key);
        // b_key = new Uint8Array(b_key);

        let secret = curve25519js.sharedKeyCurve(new Uint8Array(priv_key), new Uint8Array(pub_key));

        // console.log('Secret secret:')
        // console.log(secret)
        // console.log('Secret:', Buffer.from(secret).toString('hex'))
        // console.log('Secret 2:')
        // console.log(Buffer.from(secret))
        return Buffer.from(secret);
    },

    curveSign: function (priv_key, msg) {
        if (!priv_key || !msg)
            return;

        let is_verified = curve25519js.signCurve(new Uint8Array(priv_key), msg);

        return is_verified;
    },

    curveVerify: function (pubkey, msg, signature) {
        if (!pubkey || !msg)
            return;
        // console.log(pubkey);
        // console.log(msg);

        let is_verified = curve25519js.verifyCurve(new Uint8Array(pubkey), msg, signature);

        return is_verified;
    },

    stringToArrayBuffer32: function (str) {
        // Ensure the string is not longer than 32 bytes when encoded
        const encoder = new TextEncoder(); // UTF-8 by default
        let encoded = encoder.encode(str); // Convert the string to Uint8Array

        // Create an ArrayBuffer of 32 bytes length
        let buffer = new ArrayBuffer(32);

        // Create a view to manipulate the buffer
        let view = new Uint8Array(buffer);

        // Copy the encoded string bytes to the ArrayBuffer
        // Note: This will truncate if encoded string is longer than 32 bytes
        view.set(encoded.slice(0, Math.min(encoded.length, 32)));

        return buffer;
    },

    createSha256: async function (input) {
        if (typeof input === 'string' || input instanceof String)
            input = new TextEncoder().encode(input);

        let hashBuffer = await crypto.subtle.digest('SHA-256', input);

        return hashBuffer;
    },

    getDateFormat: function (date_format) {
        let final_format;
        if (date_format === 'iso'){
            final_format = 'YYYY-MM-DD';
        } else if (date_format === 'eur') {
            final_format = 'DD.MM.YYYY';
        } else if (date_format === 'usa') {
            final_format = 'MM/DD/YYYY';
        }
        return final_format;
    },

    pretty_time: function (timestamp) {
        var datetime = timestamp ? moment(timestamp) : moment();
        return datetime.format('HH:mm:ss');
    },

    pretty_time_since: function (timestamp) {
        let date = new Date(timestamp);

        var seconds = Math.floor((new Date() - date) / 1000);

        var interval = seconds / 31536000;

        if (interval > 1) {
            return Math.floor(interval) + " years";
        }
        interval = seconds / 2592000;
        if (interval > 1) {
            return Math.floor(interval) + " months";
        }
        interval = seconds / 86400;
        if (interval > 1) {
            return Math.floor(interval) + " days";
        }
        interval = seconds / 3600;
        if (interval > 1) {
            return Math.floor(interval) + " hours";
        }
        interval = seconds / 60;
        if (interval > 1) {
            return Math.floor(interval) + " minutes";
        }
        return Math.floor(seconds) + " seconds";
    },

    pretty_date: function (timestamp, format) {
        var datetime = timestamp ? moment(timestamp) : moment();
        return datetime.format(format || 'dddd, MMMM D, YYYY');
    },

    pretty_datetime: function (timestamp, format) {
        var datetime = timestamp ? moment(timestamp) : moment();
        return datetime.format(format || 'MMMM D, YYYY HH:mm:ss');
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
            day = moment(datetime).startOf('day');
        if (day.isSame(moment().startOf('day'))) {
            return datetime.format('HH:mm:ss');
        } else {
            return datetime.format('MMM D, YYYY HH:mm:ss');
        }
    },

    isImageType: function(type) {
        if (type.indexOf('image') > -1 && !(type.indexOf('application') > -1))
            return true;
        else
            return false;
    },

    tryReadingFile: function(file) {
        return new Promise((resolve, reject) => {
            let r = new FileReader();
            r.onload = (e) => {
                resolve();
            };
            r.onerror = (e) => {
                console.log(r.error);
                reject(r.error);
            };
            r.readAsDataURL(file)
        });
    },

    getDomainFromUrl: function(url) {
        let a = document.createElement('a');
        if (url && !/^https?:\/\//i.test(url))
            url = 'http://' + url;
        a.href = url;
        return a.hostname;
    },

    isVideoType: function(type) {
        if (type.indexOf('video') > -1)
            return true;
        else
            return false;
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

    file_type_icon_svg: function (mime_type) {
        let filetype = utils.pretty_file_type(mime_type);
        if (filetype === 'image')
            return 'image';
        if (filetype === 'audio')
            return 'file-audio';
        if (filetype === 'video')
            return 'file-video';
        if (filetype === 'document')
            return 'file-document';
        if (filetype === 'presentation')
            return 'file-presentation';
        if (filetype === 'archive')
            return 'file-zip';
        if (filetype === 'file')
            return 'file';
        if (filetype === 'pdf')
            return 'file-pdf';
        return 'file'
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
        if (!size && size != 0)
            return "";
        if (_.isNaN(Number(size)))
            return size;
        if (size < 1024) {
            return size+' B';
        } else if (size < 1048576) {
            return (size/1024).toFixed(2)+' KiB';
        } else if (size < 1073741824) {
            return (size/1048576).toFixed(2)+' MiB';
        } else {
            return (size/1073741824).toFixed(2)+' GiB';
        }
    },

    pretty_duration: function (duration) {
        if (_.isNaN(Number(duration)))
            return duration;
        if (_.isUndefined(duration) || duration === "")
            return "";
        if (duration < 10)
            return ("0:0" + duration);
        if (duration < 60)
            return ("0:" + duration);
        if (duration >= 60)
            return (Math.trunc(duration/60) + ":" + ((duration%60 < 10) ? ("0" + (duration%60)) : duration%60));
    },

    pretty_duration_ephemeral_timer: function (timer) {
        let text = '';
        switch (timer) {
            case '5':
                text = '5s';
                break;
            case '10':
                text = '10s';
                break;
            case '15':
                text = '15s';
                break;
            case '30':
                text = '30s';
                break;
            case '60':
                text = '1m';
                break;
            case '300':
                text = '5m';
                break;
            case '600':
                text = '10m';
                break;
            case '900':
                text = '15m';
                break;
            default:
                text = '';
                break;
        }
        return text;
    },

    pretty_name: function (name) {
        return name ? (name[0].toUpperCase() + name.replace(/-/,' ').substr(1).toLowerCase()) : "";
    },

    getKeyByValue: function (object, value) {
        return Object.keys(object).find(key => object[key] === value);
    },

    slice_string: function (str, from, to) {
        to = _.isNumber(to) ? to : [...str].length;
        if (str.length === [...str].length)
            return str.slice(from, to);
        else
            return Array.from(str).slice(from, to).join("");
    },

    slice_pretty_body: function (body, mutable_refs) {
        if (!mutable_refs || !mutable_refs.length)
            return body;
        body = body || "";
        mutable_refs = mutable_refs.filter(m => m.type === 'groupchat' || m.type === 'forward');
        let pretty_body = Array.from(deps.Strophe.xmlescape(body));
        mutable_refs && mutable_refs.forEach(function (ref) {
            for (let idx = ref.start; idx < ref.end; idx++)
                pretty_body[idx] = "";
        }.bind(this));
        return deps.Strophe.xmlunescape(pretty_body.join("").trim());
    },

    markupBodyMessage: function (message, mention_tag) {
        let attrs = _.clone(message.attributes),
            mentions = attrs.mentions || [],
            markups = attrs.markups || [],
            mutable_refs = attrs.mutable_content || [],
            blockquotes = attrs.blockquotes || [],
            markup_body = Array.from(deps.Strophe.xmlescape(attrs.original_message || attrs.message || ""));
        !mention_tag && (mention_tag = 'span');

        mutable_refs.forEach(function (muted) {
            for (let idx = muted.start; idx < muted.end; idx++)
                markup_body[idx] = "";
        }.bind(this));

        mentions.forEach(function (mention) {
            let start_idx = mention.start,
                end_idx = mention.end > (markup_body.length - 1) ? (markup_body.length - 1) : (mention.end - 1), target = mention.target;
            if (start_idx > markup_body.length - 1)
                return;
            if (mention.is_gc) {
                let id = target.match(/\?id=\w*/),
                    jid = target.match(/\?jid=.*/);
                if (id)
                    target = id[0].slice(4);
                else if (jid)
                    target = jid[0].slice(5);
                else {
                    target = "";
                    mention.me = true;
                }
            }
            else
                target = target.slice(5);
            if (mention_tag === 'mention'){
                markup_body[start_idx] = '<' + mention_tag + ' data-target="?jid=' + target + '">' + markup_body[start_idx];
                markup_body[end_idx] += '</' + mention_tag + '>';
                return;
            }
            markup_body[start_idx] = '<' + mention_tag + ' data-target="' + target + '" class="mention' + (mention.me ? ' ground-color-100' : '') + '">' + markup_body[start_idx];
            markup_body[end_idx] += '</' + mention_tag + '>';
        }.bind(this));

        markups.forEach(function (markup) {
            let start_idx = markup.start,
                end_idx = markup.end > (markup_body.length - 1) ? (markup_body.length - 1) : (markup.end - 1);
            if (start_idx > markup_body.length - 1)
                return;
            if (markup.markup.length) {
                let start_tags = "",
                    end_tags = "";
                markup.markup.forEach(function (mark_up_style) {
                    if (typeof(mark_up_style) === 'object') {
                        start_tags = '<a target="_blank" class="msg-hyperlink" href="' + mark_up_style.uri + '">' + start_tags;
                        end_tags += '</a>';
                    } else {
                        start_tags = '<' + mark_up_style[0].toLowerCase() + '>' + start_tags;
                        end_tags += '</' + mark_up_style[0].toLowerCase() + '>';
                    }
                }.bind(this));
                markup_body[start_idx] = start_tags + markup_body[start_idx];
                markup_body[end_idx] += end_tags;
            }
        }.bind(this));

        blockquotes.forEach(function (quote) {
            let end_idx = quote.end > (markup_body.length - 1) ? (markup_body.length - 1) : (quote.end - 1);
            for (let idx = quote.start; idx < (quote.start + constants.QUOTE_MARKER.length); idx++) {
                if (idx === end_idx)
                    markup_body[idx] = '<br>';
                else
                    markup_body[idx] = "";

            }
            for (let idx = quote.start; idx < end_idx; idx++) {
                if (markup_body[idx] === '\n') {
                    for (let child_idx = idx + 1; child_idx <= (idx + constants.QUOTE_MARKER.length); child_idx++)
                        markup_body[child_idx] = "";
                    idx+= constants.QUOTE_MARKER.length - 1;
                }
            }
            if (mention_tag === 'mention'){
                markup_body[quote.start] = '<blockquote>';
                markup_body[end_idx] += '</blockquote>';
                return;
            }
            markup_body[quote.start] = '<div class="quote">';
            markup_body[end_idx] += '</div>';
        }.bind(this));

        return markup_body.join("").trim();
    },

    getOS: function() {
        let platform = window.navigator.platform,
            macosPlatforms = ['Macintosh', 'MacIntel', 'MacPPC', 'Mac68K'],
            windowsPlatforms = ['Win32', 'Win64', 'Windows', 'WinCE'],
            os = null;

        if (macosPlatforms.indexOf(platform) !== -1) {
            os = 'mac OS';
        } else if (windowsPlatforms.indexOf(platform) !== -1) {
            os = 'Windows';
        } else if (!os && /Linux/.test(platform)) {
            os = 'Linux';
        }

        return os;
    },

    isOverflownWidth: function(element) {
        return element.scrollWidth > element.clientWidth;
    },

    isOverflownHeight: function(element) {
        return element.scrollHeight > element.clientHeight;
    },

    render_data_form: function (data_form) {
        let $data_form = $('<div class="data-form"/>');
        data_form.fields.forEach(function (field) {
            if (field.type === 'hidden')
                return;
            if (field.type === 'fixed') {
                let $fixed_field = $('<div class="data-form-field fixed-field"/>');
                field.label && $fixed_field.append($('<div class="label"/>').text(field.label));
                field.values.forEach(function (value) {
                    let $input = $('<div class="value"/>').text(value);
                    $fixed_field.append($input);
                }.bind(this));
                $data_form.append($fixed_field);
            }
            if (field.type === 'boolean') {
                let $input = $(`<button id=${field.var} class="data-form-field ground-color-100 btn-dark btn-flat btn-main boolean-field"/>`).text(field.label);
                $data_form.append($input);
            }
        }.bind(this));
        return $data_form;
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
        time = time || 3000;
        $body.find('.callback-popup-message').remove();
        $body.append($popup_msg);
        setTimeout( function() {
            $popup_msg.remove();
        }, time);
    },

    emoji_size: function (count) {
        let size;
        switch (count) {
            case 1:
                size = 56;
                break;
            case 2:
                size = 44;
                break;
            case 3:
                size = 32;
                break;
            case 4:
                size = 24;
                break;
            case 5:
                size = 22;
                break;
            default:
                size = 20;
                break;
        }
        return size;
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

    getCookie: function (name) {
        let matches = window.document.cookie.match(new RegExp(
            "(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, '\\$1') + "=([^;]*)"
        ));
        return matches ? decodeURIComponent(matches[1]) : undefined;
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

    fromBase64toArrayBuffer: function (b64_string) {
        return Uint8Array.from(atob(b64_string), c => c.charCodeAt(0)).buffer;
    },

    ArrayBuffertoBase64: function (arrayBuffer) {
        return btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
    },

    fromBase64toUint8Array: function (b64_string) {
        return Uint8Array.from(atob(b64_string), c => c.charCodeAt(0));
    },

    Uint8ArraytoBase64: function (uint8Array) {
        return btoa(String.fromCharCode(...uint8Array));
    },

    generateHOTPKey: async function(secret, counter) {
        let Crypto = window.crypto.subtle;
        let counterArray = this.padCounter(counter);

        let key = await Crypto.importKey(
            'raw',
            secret,
            { name: 'HMAC', hash: { name: 'SHA-1' } },
            false,
            ['sign']
        );

        let HS = await Crypto.sign('HMAC', key, counterArray);

        return HS;
    },

    padCounter: function(counter) {
        let buffer = new ArrayBuffer(8);
        let bView = new DataView(buffer);

        let byteString = '0'.repeat(64); // 8 bytes
        let bCounter = (byteString + counter.toString(2)).slice(-64);

        for (let byte = 0; byte < 64; byte += 8) {
            let byteValue = parseInt(bCounter.slice(byte, byte + 8), 2);
            bView.setUint8(byte / 8, byteValue);
        }

        return buffer;
    },

    DT: function(HS) {
        let offset = HS[19] & 0b1111;
        let P = ((HS[offset] & 0x7f) << 24) | (HS[offset + 1] << 16) | (HS[offset + 2] << 8) | HS[offset + 3]
        let pString = P.toString(2);

        return pString;
    },

    truncate: function(uKey) {
        let Sbits = this.DT(uKey);
        let Snum = parseInt(Sbits, 2);

        return Snum;
    },

    generateHOTP: async function(secret, counter) {
        let key = await this.generateHOTPKey(secret, counter);
        let uKey = new Uint8Array(key);

        let Snum = this.truncate(uKey);
        let padded = ('000000' + (Snum % (10 ** 8))).slice(-8);

        return padded;
    },

    hmacSha256: async function(key, message) {

        let algorithm = { name: "HMAC", hash: "SHA-256" };

        let hashBuffer = await crypto.subtle.sign(
            algorithm.name,
            key,
            message
        );

        return hashBuffer;
    },

    stringToArrayBuffer: function (string) {
        let { length } = string;
        let buffer = new Uint8Array(length);

        for (let i = 0; i < length; i++) {
            buffer[i] = string.charCodeAt(i);
        }

        return buffer;
    },

    AES: {
        ALGO_NAME: 'AES-GCM',

        decoder: new window.TextDecoder('utf-8'),
        encoder: new window.TextEncoder('utf-8'),

        decrypt: async function (masterKey, HMACData, payload) {
            let masterObj = await window.crypto.subtle.importKey('raw', masterKey, {name: 'HKDF'}, false, ['deriveKey', 'deriveBits']),
                hkdfCtrParams = { name: 'HKDF', salt: new Uint8Array(32), info: utils.stringToArrayBuffer('OMEMO Payload'), hash: 'SHA-256'};

            let key = await window.crypto.subtle.deriveBits(hkdfCtrParams, masterObj, 640);

            key = new Uint8Array(key);

            let encryptionKey = key.slice(0,32),
                authenticationKey = key.slice(32,64),
                iv = key.slice(64);

            let algorithm = { name: "HMAC", hash: "SHA-256" };

            authenticationKey = await crypto.subtle.importKey(
                "raw",
                authenticationKey,
                algorithm,
                false, ["sign", "verify"]
            );

            let generatedHMAC = await utils.hmacSha256(authenticationKey, payload);

            generatedHMAC = generatedHMAC.slice(0, generatedHMAC.byteLength - 16);

            if (!(utils.ArrayBuffertoBase64(HMACData) === utils.ArrayBuffertoBase64(generatedHMAC)))
                return;

            encryptionKey = await window.crypto.subtle.importKey('raw', encryptionKey, { "name": 'AES-CBC' }, true, ['decrypt'])


            let decryptedBuffer = await window.crypto.subtle.decrypt({
                name: 'AES-CBC',
                iv,
            }, encryptionKey, payload);

            return utils.AES.decoder.decode(decryptedBuffer);
        },

        encrypt: async function (plaintext) {
            let masterKey = window.crypto.getRandomValues(new Uint8Array(32)),
                masterObj = await window.crypto.subtle.importKey('raw', masterKey, {name: 'HKDF'}, false, ['deriveKey', 'deriveBits']),
                hkdfCtrParams = { name: 'HKDF', salt: new Uint8Array(32), info: utils.stringToArrayBuffer('OMEMO Payload'), hash: 'SHA-256'};

            let key = await window.crypto.subtle.deriveBits(hkdfCtrParams, masterObj, 640);

            key = new Uint8Array(key);

            let encryptionKey = key.slice(0,32),
                authenticationKey = key.slice(32,64),
                iv = key.slice(64);

            encryptionKey = await window.crypto.subtle.importKey('raw', encryptionKey, { "name": 'AES-CBC' }, true, ['encrypt']);

            let encrypted = await utils.AES.generateAESencryptedMessage(iv, encryptionKey, plaintext);

            let algorithm = { name: "HMAC", hash: "SHA-256" };
            authenticationKey = await crypto.subtle.importKey(
                "raw",
                authenticationKey,
                algorithm,
                false, ["sign", "verify"]
            );

            let payload = await utils.hmacSha256(authenticationKey, encrypted);

            payload = payload.slice(0, payload.byteLength - 16);

            let keydata = new Uint8Array([...masterKey, ...new Uint8Array(payload)]);

            return {
                keydata: keydata.buffer,
                payload: encrypted,
            }
        },

        generateAESencryptedMessage: async function (iv, key, plaintext) {
            let encryptOptions = {
                name: 'AES-CBC',
                iv,
            };
            let encodedPlaintext = utils.AES.encoder.encode(plaintext),
                encrypted = await window.crypto.subtle.encrypt(encryptOptions, key, encodedPlaintext);

            return encrypted;
        },

        arrayBufferConcat: function () {
            let length = 0,
                buffer = null;

            for (let i in arguments) {
                buffer = arguments[i];
                length += buffer.byteLength;
            }

            let joined = new Uint8Array(length),
                offset = 0;

            for (let i in arguments) {
                buffer = arguments[i];
                joined.set(new Uint8Array(buffer), offset);
                offset += buffer.byteLength;
            }

            return joined.buffer
        },

        generateAESKey: async function () {
            let algo = {
                name: utils.AES.ALGO_NAME,
                length: constants.AES_KEY_LENGTH,
            };
            let keyUsage = ['encrypt', 'decrypt'],
                key = await window.crypto.subtle.generateKey(algo, constants.AES_EXTRACTABLE, keyUsage);

            return key;
        }
    },

    getBrowser: function () {
        // Get the user-agent string
        let userAgentString =
            navigator.userAgent;

        // Detect Chrome
        let chromeAgent =
            userAgentString.indexOf("Chrome") > -1;

        // Detect Internet Explorer
        let IExplorerAgent =
            userAgentString.indexOf("MSIE") > -1 ||
            userAgentString.indexOf("Windows NT:") > -1;

        // Detect Firefox
        let firefoxAgent =
            userAgentString.indexOf("Firefox") > -1;

        // Detect Safari
        let safariAgent =
            userAgentString.indexOf("Safari") > -1;

        // Discard Safari since it also matches Chrome
        if ((chromeAgent) && (safariAgent))
            safariAgent = false;

        // Detect Opera
        let operaAgent =
            userAgentString.indexOf("OP") > -1;

        // Discard Chrome since it also matches Opera
        if ((chromeAgent) && (operaAgent))
            chromeAgent = false;

        if (safariAgent)
            return 'Safari';
        if (chromeAgent)
            return 'Chrome';
        if (IExplorerAgent)
            return 'IE';
        if (operaAgent)
            return 'Opera';
        if (firefoxAgent)
            return 'Firefox';
        return 'Unknown browser';
    },

    emoji: emoji,
    images: images,
    modals: modals,
    dialogs: modals.dialogs
};

    export default utils;
