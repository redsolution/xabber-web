define(["jquery", "underscore"], function ($, _) {

    var raw_data = [
        {code: 0x1f604, x: 0, y: 0},
        {code: 0x1f603, x: 1, y: 0},
        {code: 0x1f600, x: 2, y: 0},
        {code: 0x1f60a, x: 3, y: 0},
        {code: 0x263a, x: 4, y: 0},
        {code: 0x1f609, x: 5, y: 0},
        {code: 0x1f60d, x: 6, y: 0},
        {code: 0x1f618, x: 7, y: 0},
        {code: 0x1f61a, x: 8, y: 0},
        {code: 0x1f617, x: 9, y: 0},
        {code: 0x1f619, x: 10, y: 0},
        {code: 0x1f61c, x: 11, y: 0},
        {code: 0x1f61d, x: 12, y: 0},
        {code: 0x1f61b, x: 13, y: 0},
        {code: 0x1f633, x: 14, y: 0},
        {code: 0x1f601, x: 15, y: 0},
        {code: 0x1f614, x: 16, y: 0},
        {code: 0x1f60c, x: 17, y: 0},
        {code: 0x1f612, x: 18, y: 0},
        {code: 0x1f61e, x: 19, y: 0},
        {code: 0x1f623, x: 20, y: 0},
        {code: 0x1f622, x: 21, y: 0},
        {code: 0x1f602, x: 22, y: 0},
        {code: 0x1f62d, x: 23, y: 0},
        {code: 0x1f62a, x: 24, y: 0},
        {code: 0x1f625, x: 25, y: 0},
        {code: 0x1f630, x: 26, y: 0},
        {code: 0x1f605, x: 0, y: 1},
        {code: 0x1f613, x: 1, y: 1},
        {code: 0x1f629, x: 2, y: 1},
        {code: 0x1f62b, x: 3, y: 1},
        {code: 0x1f628, x: 4, y: 1},
        {code: 0x1f631, x: 5, y: 1},
        {code: 0x1f620, x: 6, y: 1},
        {code: 0x1f621, x: 7, y: 1},
        {code: 0x1f624, x: 8, y: 1},
        {code: 0x1f616, x: 9, y: 1},
        {code: 0x1f606, x: 10, y: 1},
        {code: 0x1f60b, x: 11, y: 1},
        {code: 0x1f637, x: 12, y: 1},
        {code: 0x1f60e, x: 13, y: 1},
        {code: 0x1f634, x: 14, y: 1},
        {code: 0x1f635, x: 15, y: 1},
        {code: 0x1f632, x: 16, y: 1},
        {code: 0x1f61f, x: 17, y: 1},
        {code: 0x1f626, x: 18, y: 1},
        {code: 0x1f627, x: 19, y: 1},
        {code: 0x1f608, x: 20, y: 1},
        {code: 0x1f47f, x: 21, y: 1},
        {code: 0x1f62e, x: 22, y: 1},
        {code: 0x1f62c, x: 23, y: 1},
        {code: 0x1f610, x: 24, y: 1},
        {code: 0x1f615, x: 25, y: 1},
        {code: 0x1f62f, x: 26, y: 1},
        {code: 0x1f636, x: 0, y: 2},
        {code: 0x1f607, x: 1, y: 2},
        {code: 0x1f60f, x: 2, y: 2},
        {code: 0x1f611, x: 3, y: 2},
        {code: 0x1f472, x: 4, y: 2},
        {code: 0x1f473, x: 5, y: 2},
        {code: 0x1f46e, x: 6, y: 2},
        {code: 0x1f477, x: 7, y: 2},
        {code: 0x1f482, x: 8, y: 2},
        {code: 0x1f476, x: 9, y: 2},
        {code: 0x1f466, x: 10, y: 2},
        {code: 0x1f467, x: 11, y: 2},
        {code: 0x1f468, x: 12, y: 2},
        {code: 0x1f469, x: 13, y: 2},
        {code: 0x1f474, x: 14, y: 2},
        {code: 0x1f475, x: 15, y: 2},
        {code: 0x1f471, x: 16, y: 2},
        {code: 0x1f47c, x: 17, y: 2},
        {code: 0x1f478, x: 18, y: 2},
        {code: 0x1f63a, x: 19, y: 2},
        {code: 0x1f638, x: 20, y: 2},
        {code: 0x1f63b, x: 21, y: 2},
        {code: 0x1f63d, x: 22, y: 2},
        {code: 0x1f63c, x: 23, y: 2},
        {code: 0x1f640, x: 24, y: 2},
        {code: 0x1f63f, x: 25, y: 2},
        {code: 0x1f639, x: 26, y: 2},
        {code: 0x1f63e, x: 0, y: 3},
        {code: 0x1f479, x: 1, y: 3},
        {code: 0x1f47a, x: 2, y: 3},
        {code: 0x1f648, x: 3, y: 3},
        {code: 0x1f649, x: 4, y: 3},
        {code: 0x1f64a, x: 5, y: 3},
        {code: 0x1f480, x: 6, y: 3},
        {code: 0x1f47d, x: 7, y: 3},
        {code: 0x1f4a9, x: 8, y: 3},
        {code: 0x1f525, x: 9, y: 3},
        {code: 0x2728, x: 10, y: 3},
        {code: 0x1f31f, x: 11, y: 3},
        {code: 0x1f4ab, x: 12, y: 3},
        {code: 0x1f4a5, x: 13, y: 3},
        {code: 0x1f4a2, x: 14, y: 3},
        {code: 0x1f4a6, x: 15, y: 3},
        {code: 0x1f4a7, x: 16, y: 3},
        {code: 0x1f4a4, x: 17, y: 3},
        {code: 0x1f4a8, x: 18, y: 3},
        {code: 0x1f442, x: 19, y: 3},
        {code: 0x1f440, x: 20, y: 3},
        {code: 0x1f443, x: 21, y: 3},
        {code: 0x1f445, x: 22, y: 3},
        {code: 0x1f444, x: 23, y: 3},
        {code: 0x1f44d, x: 24, y: 3},
        {code: 0x1f44e, x: 25, y: 3},
        {code: 0x1f44c, x: 26, y: 3},
        {code: 0x1f44a, x: 0, y: 4},
        {code: 0x270a, x: 1, y: 4},
        {code: 0x270c, x: 2, y: 4},
        {code: 0x1f44b, x: 3, y: 4},
        {code: 0x270b, x: 4, y: 4},
        {code: 0x1f450, x: 5, y: 4},
        {code: 0x1f446, x: 6, y: 4},
        {code: 0x1f447, x: 7, y: 4},
        {code: 0x1f449, x: 8, y: 4},
        {code: 0x1f448, x: 9, y: 4},
        {code: 0x1f64c, x: 10, y: 4},
        {code: 0x1f64f, x: 11, y: 4},
        {code: 0x261d, x: 12, y: 4},
        {code: 0x1f44f, x: 13, y: 4},
        {code: 0x1f4aa, x: 14, y: 4},
        {code: 0x1f6b6, x: 15, y: 4},
        {code: 0x1f3c3, x: 16, y: 4},
        {code: 0x1f483, x: 17, y: 4},
        {code: 0x1f46b, x: 18, y: 4},
        {code: 0x1f46a, x: 19, y: 4},
        {code: 0x1f46c, x: 20, y: 4},
        {code: 0x1f46d, x: 21, y: 4},
        {code: 0x1f48f, x: 22, y: 4},
        {code: 0x1f491, x: 23, y: 4},
        {code: 0x1f46f, x: 24, y: 4},
        {code: 0x1f646, x: 25, y: 4},
        {code: 0x1f645, x: 26, y: 4},
        {code: 0x1f481, x: 0, y: 5},
        {code: 0x1f64b, x: 1, y: 5},
        {code: 0x1f486, x: 2, y: 5},
        {code: 0x1f487, x: 3, y: 5},
        {code: 0x1f485, x: 4, y: 5},
        {code: 0x1f470, x: 5, y: 5},
        {code: 0x1f64e, x: 6, y: 5},
        {code: 0x1f64d, x: 7, y: 5},
        {code: 0x1f647, x: 8, y: 5},
        {code: 0x1f3a9, x: 9, y: 5},
        {code: 0x1f451, x: 10, y: 5},
        {code: 0x1f452, x: 11, y: 5},
        {code: 0x1f45f, x: 12, y: 5},
        {code: 0x1f45e, x: 13, y: 5},
        {code: 0x1f461, x: 14, y: 5},
        {code: 0x1f460, x: 15, y: 5},
        {code: 0x1f462, x: 16, y: 5},
        {code: 0x1f455, x: 17, y: 5},
        {code: 0x1f454, x: 18, y: 5},
        {code: 0x1f45a, x: 19, y: 5},
        {code: 0x1f457, x: 20, y: 5},
        {code: 0x1f3bd, x: 21, y: 5},
        {code: 0x1f456, x: 22, y: 5},
        {code: 0x1f458, x: 23, y: 5},
        {code: 0x1f459, x: 24, y: 5},
        {code: 0x1f4bc, x: 25, y: 5},
        {code: 0x1f45c, x: 26, y: 5},
        {code: 0x1f45d, x: 0, y: 6},
        {code: 0x1f45b, x: 1, y: 6},
        {code: 0x1f453, x: 2, y: 6},
        {code: 0x1f380, x: 3, y: 6},
        {code: 0x1f302, x: 4, y: 6},
        {code: 0x1f484, x: 5, y: 6},
        {code: 0x1f49b, x: 6, y: 6},
        {code: 0x1f499, x: 7, y: 6},
        {code: 0x1f49c, x: 8, y: 6},
        {code: 0x1f49a, x: 9, y: 6},
        {code: 0x2764, x: 10, y: 6},
        {code: 0x1f494, x: 11, y: 6},
        {code: 0x1f497, x: 12, y: 6},
        {code: 0x1f493, x: 13, y: 6},
        {code: 0x1f495, x: 14, y: 6},
        {code: 0x1f496, x: 15, y: 6},
        {code: 0x1f49e, x: 16, y: 6},
        {code: 0x1f498, x: 17, y: 6},
        {code: 0x1f48c, x: 18, y: 6},
        {code: 0x1f48b, x: 19, y: 6},
        {code: 0x1f48d, x: 20, y: 6},
        {code: 0x1f48e, x: 21, y: 6},
        {code: 0x1f464, x: 22, y: 6},
        {code: 0x1f465, x: 23, y: 6},
        {code: 0x1f4ac, x: 24, y: 6},
        {code: 0x1f463, x: 25, y: 6},
        {code: 0x1f4ad, x: 26, y: 6},
    ];

    var getEmoji = function (code) {
        if (code < 0x10000) {
            return String.fromCharCode(code);
        }
        var offset = code - 0x10000,
            lead = 0xd800 + (offset >> 10),
            trail = 0xdc00 + (offset & 0x3ff);
        return String.fromCharCode(lead)+String.fromCharCode(trail);
    };

    var getEmojiByIndex = function (idx) {
        return getEmoji(raw_data[idx].code);
    };

    var emoji_data = {}, all = [];

    _.each(raw_data, function (item) {
        var emoji = getEmoji(item.code);
        emoji_data[emoji] = item;
        all.push(emoji);
    });

    var _char = function (code) {
        return String.fromCharCode(code);
    };

    var ranges = [
        '['+_char(0x2600)+'-'+_char(0x27ff)+']',
        _char(0xd83c)+'['+_char(0xdf00)+'-'+_char(0xdfff)+']',
        _char(0xd83d)+'['+_char(0xdc00)+'-'+_char(0xde4f)+']',
        _char(0xd83d)+'['+_char(0xde80)+'-'+_char(0xdeff)+']'
    ];
    var emoji_regexp = new RegExp(ranges.join('|'), 'g');

    String.prototype.emojify = function (options) {
        options || (options = {});
        var tag_name = options.tag_name || 'span',
            img_src = tag_name === 'img' ? ' src="images/emoji/blank.gif"' : '',
            emoji_size = options.emoji_size || 18;
        return this.replace(emoji_regexp, function (emoji) {
            var data = emoji_data[emoji];
            if (data) {
                return '<'+tag_name+img_src+' class="emoji emoji-w'+emoji_size+' emoji-spritesheet-0" '+
                'style="background-position: '+'-'+(emoji_size*data.x)+'px '+'-'+(emoji_size*data.y)+'px;" '+
                'data-emoji="'+emoji+'"/>';
            } else {
                return emoji;
            }
        });
    };

    String.prototype.removeEmoji = function () {
        return this.replace(emoji_regexp, function (emoji) {
            var data = emoji_data[emoji];
            if (data) {
                return "";
            } else {
                return emoji;
            }
        });
    };

    $.fn.emojify = function (selector, options) {
        this.find(selector).each(function () {
            var text = $(this).html();
            $(this).html(text.emojify(options));
        });
        return this;
    };

    return {
        all: all,
        get: getEmoji,
        getByIndex: getEmojiByIndex
    };
});
