import xabber from "xabber-core";

let env = xabber.env,
    constants = env.constants,
    templates = env.templates.chats,
    utils = env.utils,
    $ = env.$,
    $iq = env.$iq,
    $msg = env.$msg,
    Strophe = env.Strophe,
    _ = env._,
    moment = env.moment,
    uuid = env.uuid,
    Images = utils.images,
    Emoji = utils.emoji,
    pretty_date = (timestamp) => { return utils.pretty_date(timestamp, (xabber.settings.language == 'ru-RU' || xabber.settings.language == 'default' && xabber.get("default_language") == 'ru-RU') && 'dddd, D MMMM YYYY')},
    pretty_datetime = (timestamp) => { return utils.pretty_datetime(timestamp, (xabber.settings.language == 'ru-RU' || xabber.settings.language == 'default' && xabber.get("default_language") == 'ru-RU') && 'D MMMM YYYY HH:mm:ss')};

xabber.Message = Backbone.Model.extend({
    idAttribute: 'unique_id',

    defaults: function () {
        let msgid = uuid();
        return {
            msgid: msgid,
            unique_id: msgid,
            type: 'main',
            state: constants.MSG_PENDING
        };
    },

    initialize: function () {
        let time = this.get('time'), attrs = {};
        if (time) {
            attrs.timestamp = Number(moment(time));
        } else {
            attrs.timestamp = moment.now();
            attrs.time = moment(attrs.timestamp).format();
        }
        if (!this.get('origin_id'))
            (this.isSenderMe() && !this.get('synced_from_server') && !this.get('carbon_copied') && !this.get('is_archived')) && this.set('origin_id', this.get('msgid'));
        this.updateUniqueId();
        this.set(attrs);
        this.on("change:origin_id change:stanza_id change:archived_id", this.updateUniqueId, this);
    },

    updateUniqueId: function () {
        this.set('unique_id',  this.get('stanza_id') || this.get('archived_id') || this.get('origin_id') || this.get('msgid'));
    },

    destroyOnEcho: function () {
        this.set('state', constants.MSG_DELIVERED);
        if (this.collection && this.collection.chat && this.collection.chat.item_view && this.collection.chat.item_view.content)
            this.collection.chat.item_view.content.removeMessage(this);
        else
            this.destroy();
    },

    getText: function () {
        let forwarded_message = this.get('forwarded_message');
        if (forwarded_message && forwarded_message.length) {
            return forwarded_message[0].get('message');
        }
        return this.get('message');
    },

    getState: function () {
        return constants.MSG_STATE[this.get('state')];
    },

    getVerboseState: function () {
        let state = xabber.getString(constants.MSG_VERBOSE_STATE[this.get('state')]);
        if (this.account) {
            if (!this.account.isOnline())
                state = xabber.getString("account_is_offline");
        }
        else if (!this.collection.account.isOnline())
            state = xabber.getString("account_is_offline");
        return state;
    },

    isSenderMe: function () {
        if (this.account)
            return this.account.get('jid') === this.get('from_jid');
        else if (this.collection && this.collection.account)
            return this.collection.account.get('jid') === this.get('from_jid');
        else
            false;
    },

    handleEphemeralMessage: function () {
        if (this.collection.account.omemo){
            this.collection.account.omemo.cached_messages.putMessage(this.collection.chat.contact, this.get('stanza_id'), {ephemeral_removed: true});
        }
        if (!this.collection.chat.item_view.content)
            this.collection.chat.item_view.content = new xabber.ChatContentView({chat_item: this.collection.chat.item_view});
        this.collection.chat.item_view.content.removeMessage(this);
    },

    checkEphemeralTimer: function () {
        if (this.get('ethemeral_removed') || !this.get('displayed_time'))
            return;

        let date = this.get('displayed_time');

        let msgDate = new Date(date),
            currentDate = new Date(),
            seconds = (currentDate.getTime() - msgDate.getTime()) / 1000;

        let time_difference = this.get('ephemeral_timer') - seconds;
        clearTimeout(this.ephemeral_timeout);
        if (time_difference <= 0){
            this.handleEphemeralMessage();
        } else {
            this.ephemeral_timeout = setTimeout(() => {
                this.handleEphemeralMessage();
            }, (time_difference * 1000))
        }
    },
});

xabber.MessagesBase = Backbone.Collection.extend({
    model: xabber.Message,
});

  xabber.SearchedMessages = xabber.MessagesBase.extend({
      comparator: 'timestamp',

      initialize: function () {
          this.collections = [];
          this.on("add", _.bind(this.updateInCollections, this, 'add'));
          this.on("change", _.bind(this.updateInCollections, this, 'change'));
      },

      addCollection: function (collection) {
          this.collections.push(collection);
      },

      updateInCollections: function (event, contact) {
          _.each(this.collections, function (collection) {
              collection.update(contact, event);
          });
      }
  });

  xabber.Messages = Backbone.Collection.extend({
    model: xabber.Message,
    comparator: 'timestamp',

    initialize: function (models, options) {
        this.chat = options.chat;
        this.account = options.account;
    },

    checkEphemeralTimers: function (models, options) {
        let displayed_time,
            ephemeral_msgs = this.filter(msg => msg.get('ephemeral_timer'));
        ephemeral_msgs.reverse().forEach((msg) => {
            if (msg.get('is_unread') || (msg.isSenderMe() && msg.get('state') === constants.MSG_DELIVERED))
                return;
            if (msg.get('displayed_time') && !msg.get('dynamic_displayed_time'))
                displayed_time = msg.get('displayed_time');
            else if (displayed_time){
                msg.set('dynamic_displayed_time', true)
                msg.set('displayed_time', displayed_time);
            }
            msg.checkEphemeralTimer();
        });
    },

    createInvitationFromStanza: function ($message, options) {
        options = options || {};
        let $invite_item = $message.find('invite'),
            full_jid = $invite_item.attr('jid') || $message.attr('from'),
            $delay = options.delay || $message.children('delay'),
            from_jid = Strophe.getBareJidFromJid(full_jid),
            body = $message.children('body').text(),
            markable = $message.find('markable').length > 0,
            msgid = $message.attr('id'),
            archive_id = $message.children('archived').attr('id'),
            origin_id = $message.children('origin-id').attr('id'),
            unique_id = options.stanza_id || archive_id || origin_id || msgid,
            message = unique_id && this.get(unique_id),
            $group_info = $message.children('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"]'),
            is_private_invitation,
            group_info_attributes = {};


        if (!message && unique_id){
            unique_id = origin_id || options.stanza_id || archive_id || msgid;
            message = this.get(unique_id);
        }

        if (message)
            return message;

        if (!from_jid)
            return;

        let attrs = {
            xml: options.xml || $message[0],
            carbon_copied: options.carbon_copied && !options.is_archived,
            markable: markable,
            msgid: msgid,
            is_forwarded: options.is_forwarded,
            forwarded_message: options.forwarded_message || null,
            from_jid: from_jid,
            origin_id: origin_id,
            stanza_id: options.stanza_id,
            archive_id: archive_id,
            contact_stanza_id: options.contact_stanza_id,
            is_archived: options.is_archived
        };

        $delay.length && (attrs.time = $delay.attr('stamp'));
        options.synced_msg && (attrs.synced_invitation_from_server = true);
        body && (attrs.message = body);

        let contact = this.account.contacts.mergeContact({jid: Strophe.getBareJidFromJid(from_jid), group_chat: true}),
            chat = this.account.chats.getChat(contact);

        !chat.item_view.content && (chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view}));

        contact.set('in_roster', false);
        if ($group_info.length) {
            let name = $group_info.find('name').text(),
                model = $group_info.find('membership').text(),
                privacy = $group_info.find('privacy').text(),
                searchable = $group_info.find('index').text(),
                parent_chat = $group_info.find('parent-chat').text(),
                description = $group_info.find('description').text();
            name && (group_info_attributes.name = name);
            model && (group_info_attributes.model = name);
            privacy && (group_info_attributes.privacy = privacy);
            searchable && (group_info_attributes.searchable = searchable);
            description && (group_info_attributes.description = description);
            parent_chat.length && (is_private_invitation = true);
            is_private_invitation && contact.set('private_chat', true);
            privacy === 'incognito' && contact.set('incognito_chat', true);
            let prev_group_info = contact.get('group_info') || {};
            _.extend(prev_group_info, group_info_attributes);
            contact.set('group_info', prev_group_info);
        }

        let invite_msg = chat.messages.createSystemMessage(_.extend(attrs, {
            from_jid: from_jid,
            auth_request: true,
            invite: true,
            private_invite: is_private_invitation || false,
            is_accepted: false,
            silent: false,
            message: $message.find('reason').text()
        }));
        return invite_msg;
    },

    createFromStanza: function ($message, options) {
        options || (options = {});
        let $delay = options.delay || $message.children('delay'),
            full_jid = $message.attr('from') || options.from_jid,
            from_jid = Strophe.getBareJidFromJid(full_jid),
            body = $message.children('body').length ? $message.children('body').text() : $message.children('envelope').children('content').children('body').text(),
            markable = $message.find('markable').length > 0,
            archive_id = $message.children('archived').attr('id'),
            origin_id = $message.children('origin-id').attr('id'),
            msgid = $message.attr('id'),
            unique_id = options.stanza_id || archive_id || origin_id || msgid,
            message = unique_id && this.get(unique_id);

        if (!message && unique_id){
            unique_id = origin_id || options.stanza_id || archive_id || msgid;
            message = this.get(unique_id);
        }
        if (!message){
            message = this.findWhere({'origin_id': origin_id});
        }
        if (options.replaced) {
            let conversation = $message.children('replace').attr('conversation');
            if ($message.children('replace').children('message').children(`encrypted[xmlns="${Strophe.NS.SYNCHRONIZATION_OLD_OMEMO}"]`).length)
                return;
            if ($message.children('replace').children('message').children(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`).length && this.account.omemo && !options.forwarded) {
                this.account.omemo.receiveChatMessage($message, _.extend(options, {from_jid: conversation, conversation: conversation}));
                return;
            }
            $message = $message.children('replace').children('message');
            body = $message.children('body').length ? $message.children('body').text() : $message.children('envelope').children('content').children('body').text();
            let sid = $message.children('stanza-id').first().attr('id');
            message = this.find(m => m.get('stanza_id') === sid || m.get('contact_stanza_id') === sid);
            if (!message)
                return;
            from_jid = message.get('from_jid');
            msgid = message.get('msgid');
            let xml = message.get('xml');
            xml.innerHTML = $message[0].innerHTML;
            options.xml = xml;
            options.forwarded_message = message.get('forwarded_message');
        }

        if (message && !options.replaced && !options.context_message && !options.is_unread_archived && !options.searched_message && !options.pinned_message && !options.participant_message && !options.echo_msg && !options.is_searched) {
            if ($message.find('[xmlns="' + Strophe.NS.EPHEMERAL + '"]').length && !$message.find('[xmlns="' + Strophe.NS.EPHEMERAL + '"]').closest('system-message').length && options.encrypted){
                message.set('ephemeral_timer', $message.find('[xmlns="' + Strophe.NS.EPHEMERAL + '"]').attr('timer'));
                options.sync_timestamp && message.set('displayed_time', options.sync_timestamp)
                if (this.chat.contact){
                    let cached_msg = this.account.omemo.cached_messages.getMessage(this.chat.contact, $message.find(`stanza-id[by="${this.account.get('jid')}"]`).attr('id'));
                    if (cached_msg && cached_msg.envelope && cached_msg.displayed_time){
                        message.set('displayed_time', cached_msg.displayed_time)
                    }
                }
                message.collection.checkEphemeralTimers();
            }
            return message;
        }

        let attrs = {
                xml: options.xml || $message[0],
                original_message: body,
                carbon_copied: options.carbon_copied && !options.is_archived,
                markable: markable,
                msgid: msgid,
                is_forwarded: options.is_forwarded,
                forwarded_message: options.forwarded_message || null,
                from_jid: from_jid,
                contact_stanza_id: options.contact_stanza_id,
                is_archived: options.is_archived,
                is_unread_archived: options.is_unread_archived,
                is_between_anchors: options.is_between_anchors,
                not_encrypted: options.not_encrypted || null,
                not_verified_device: options.not_verified_device || null,
                not_verified_device_no_device: options.not_verified_device_no_device || null,
                device_id: options.device_id || null,
            },
            mentions = [], blockquotes = [], markups = [], mutable_content = [], files = [], images = [], videos = [], locations = [], link_references = [];

        options.encrypted && _.extend(attrs, {encrypted: true});
        options.hasOwnProperty('is_trusted') && _.extend(attrs, {is_trusted: options.is_trusted});
        let references = $message.children(`reference[xmlns="${Strophe.NS.REFERENCE}"]`).length ?
            $message.children(`reference[xmlns="${Strophe.NS.REFERENCE}"]`) :
            $message.children('envelope').children('content').children(`reference[xmlns="${Strophe.NS.REFERENCE}"]`);

        references.each((idx, reference) => {
            let $reference = $(reference),
                type = $reference.attr('type'),
                begin = parseInt($reference.attr('begin')),
                end = parseInt($reference.attr('end'));
            if (type === 'decoration') {
                if ($reference.children(`mention[xmlns="${Strophe.NS.MARKUP}"]`).length) {
                    let $mention = $reference.children(`mention[xmlns="${Strophe.NS.MARKUP}"]`),
                        target = $mention.text(),
                        is_gc = $mention.attr('node') === Strophe.NS.GROUP_CHAT ? true : false;
                    mentions.push({start: begin, end: end, target: target, is_gc: is_gc});
                } else {
                    let markup = [];
                    $reference.children().each((i, child_ref) => {
                        if (constants.MARKUP_TAGS.indexOf(child_ref.tagName) > -1 && $(child_ref).attr('xmlns') === Strophe.NS.MARKUP) {
                            if (child_ref.tagName === 'link')
                                markup.push({type: child_ref.tagName, uri: $(child_ref).text()});
                            else if (child_ref.tagName === 'quote') {
                                blockquotes.push({start: begin, end: end});
                            } else
                                markup.push(child_ref.tagName);
                        }
                    });
                    markup.length && markups.push({start: begin, end: end, markup: markup});
                }
            } else if (type === 'mutable') {
                let $geolocation = $reference.children(`geoloc[xmlns="${Strophe.NS.GEOLOC}"]`).first(),
                    loc_attrs = {};
                if ($geolocation.children('lat').text() && $geolocation.children('lon').text()){
                    loc_attrs = {
                        lat: $geolocation.children('lat').text(),
                        lon: $geolocation.children('lon').text()
                    }
                    locations.push(loc_attrs);
                    mutable_content.push({ start: begin, end: end, type: 'geolocation'});
                };
                if ($reference.children(`ogp[xmlns="${Strophe.NS.OGP}"]`).length) {
                    let $ogp = $reference.children(`ogp[xmlns="${Strophe.NS.OGP}"]`).first(),
                        link_reference_attrs = {};
                    if ($ogp.length) {
                        link_reference_attrs = {
                            site: $ogp.children('meta[property="og:site_name"]').attr('content'),
                            type: $ogp.children('meta[property="og:type"]').attr('content'),
                            url: $ogp.children('meta[property="og:url"]').attr('content'),
                            description: $ogp.children('meta[property="og:description"]').attr('content'),
                            title: $ogp.children('meta[property="og:title"]').attr('content'),
                            image: $ogp.children('meta[property="og:image"]').attr('content'),
                            image_width: $ogp.children('meta[property="og:image:width"]').attr('content'),
                            image_height: $ogp.children('meta[property="og:image:height"]').attr('content'),
                            video_url: $ogp.children('meta[property="og:video:url"]').attr('content'),
                            original_text: $ogp.attr('url'),
                            start: begin,
                            end: end,
                        }
                        link_references.push(link_reference_attrs);
                        mutable_content.push({start: begin, end: end, type: 'link_reference'});
                    };
                }
                let $file_sharing = $reference.find(`file-sharing[xmlns="${Strophe.NS.FILES}"]`).first();
                if ($reference.children('forwarded').length)
                    mutable_content.push({ start: begin, end: end, type: 'forward'});
                else if ($file_sharing.length) {
                    let type = $file_sharing.parent(`voice-message[xmlns="${Strophe.NS.VOICE_MESSAGE}"]`).length ? 'voice' : 'file',
                        $file = $file_sharing.children('file'), file_attrs = {}, sources = [];
                    mutable_content.push({ start: begin, end: end, type: type});
                    $file_sharing.children('sources').children('uri').each((i, uri) => {sources.push($(uri).text());});
                    file_attrs = {
                        name: $file.children('name').text(),
                        hash: $file.children(`hash[xmlns="${Strophe.NS.HASH}"]`).text(),
                        size: $file.children('size').text(),
                        type: $file.children('media-type').text(),
                        duration: $file.children('duration').text(),
                        description: $file.children('desc').text(),
                        height: $file.children('height').text(),
                        width: $file.children('width').text(),
                        thumbnail: $file.children('thumbnail-uri').text(),
                        id: $file.children('gallery-id').text(),
                        voice: type === 'voice',
                        sources: sources
                    };
                    if (sources[0].indexOf('aescbc') == 0) {
                        let uri = sources[0].replace(/^aescbc/, 'https'),
                            key = utils.fromBase64toArrayBuffer(uri.slice(uri.length - 64));
                        uri = uri.slice(0, uri.length - 64 - 1);
                        _.extend(file_attrs, {sources: [uri], key: key});
                        attrs.has_encrypted_files = true;
                    }
                    if (this.getFileType($file.children('media-type').text()) === 'image')
                        images.push(file_attrs);
                    else if (this.getFileType($file.children('media-type').text()) === 'video')
                        videos.push(file_attrs);
                    else
                        files.push(file_attrs);
                }
            } else if (type === 'data') {}
        });

        $message.children('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"]').each((idx, x_elem) => {
            let $reference = $(x_elem).children(`reference[type="mutable"][xmlns="${Strophe.NS.REFERENCE}"]`),
                $user = $reference.children(`user[xmlns="${Strophe.NS.GROUP_CHAT}"]`).first();
                if ($reference.length) {
                    let begin = parseInt($reference.attr('begin')),
                        end = parseInt($reference.attr('end'));
                    mutable_content.push({start: begin, end: end, type: 'groupchat'});
                    let user_id = $user.attr('id'),
                        user_jid = $user.children('jid').text();
                    _.extend(attrs, {
                        user_info: {
                            id: user_id,
                            jid: user_jid,
                            nickname: $user.children('nickname').text() || user_jid || user_id,
                            role: $user.children('role').text(),
                            avatar: $user.children(`metadata[xmlns="${Strophe.NS.PUBSUB_AVATAR_METADATA}"]`).children('info').attr('id'),
                            avatar_url: $user.children(`metadata[xmlns="${Strophe.NS.PUBSUB_AVATAR_METADATA}"]`).children('info').attr('url'),
                            badge: $user.children('badge').text()
                        },
                        from_jid: user_jid || user_id,
                        groupchat_jid: Strophe.getBareJidFromJid(options.is_sender ? $message.attr('to') : $message.attr('from'))
                    });
                }
        });

        blockquotes.length && (attrs.blockquotes = blockquotes);
        mentions.length && (attrs.mentions = mentions);
        markups.length && (attrs.markups = markups);
        images.length && (attrs.images = images);
        videos.length && (attrs.videos = videos);
        files.length && (attrs.files = files);
        locations.length && (attrs.locations = locations);
        link_references.length && (attrs.link_references = link_references);
        attrs.mutable_content = mutable_content;
        if (!attrs.mutable_content.length)
            attrs.forwarded_message = null;

        options.stanza_id && (attrs.stanza_id = options.stanza_id);
        origin_id && (attrs.origin_id = origin_id);
        archive_id && (attrs.archive_id = archive_id);

        (options.replaced || mentions.length) && (attrs.mentions = mentions);
        (options.replaced || markups.length) && (attrs.markups = markups);
        (options.replaced || files.length) && (attrs.files = files);
        (options.replaced || images.length) && (attrs.images = images);
        (options.replaced || videos.length) && (attrs.videos = videos);
        (options.replaced || link_references.length) && (attrs.link_references = link_references);

        if ($message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}#system-message"]`).length) {
            attrs.type = 'system';
            attrs.participants_version = $message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}#system-message"]`).attr('version');
        }

        if ($message.children(`x[xmlns="${Strophe.NS.DATAFORM}"]`).length &&
            $message.children(`x[xmlns="${Strophe.NS.DATAFORM}"]`).find('field[var="FORM_TYPE"][type="hidden"] value').text() === Strophe.NS.WEBCHAT) {
            let addresses = [];
            $message.children(`addresses[xmlns="${Strophe.NS.ADDRESS}"]`).children('address').each((idx, address) => {
                let $address = $(address);
                addresses.push({type: $address.attr('type'), jid: $address.attr('jid')});
            });
            attrs.data_form = _.extend(this.account.parseDataForm($message.children(`x[xmlns="${Strophe.NS.DATAFORM}"]`)), {addresses: addresses});
        }

        body && (body = utils.slice_pretty_body(body, mutable_content));

        if (!attrs.forwarded_message && body.removeEmoji() === "")
            attrs.only_emoji = Array.from(body).length;

        attrs.message = body;

        options.echo_msg && ($delay = $message.children('time'));
        $delay.length && (attrs.time = $delay.attr('stamp'));
        (attrs.carbon_copied || from_jid == this.account.get('jid') && (options.is_archived || options.synced_msg)) && (attrs.state = constants.MSG_SENT);
        options.synced_msg && (attrs.synced_from_server = true);
        options.missed_history && (attrs.missed_msg = true);
        if (options.is_unread_archived && (attrs.type !== 'system')){
            let last_read_msg = this.find(m => this.chat.get('last_read_msg') && (m.get('stanza_id') === this.chat.get('last_read_msg') || m.get('contact_stanza_id') === this.chat.get('last_read_msg')));
            if (last_read_msg){
                if (Number(moment(attrs.time)) > last_read_msg.get('timestamp'))
                    attrs.is_unread = true
            } else {
                attrs.is_unread = true
            }
        }
        if (options.echo_msg) {
            attrs.state = constants.MSG_DELIVERED;
            attrs.timestamp = Number(moment(attrs.time));
            attrs.from_jid = this.account.get('jid');
        }
        (options.context_message || options.participant_message || options.searched_message || options.is_searched) && (attrs.state = constants.MSG_ARCHIVED);

        if (options.carbon_copied && options.encrypted && this.chat && this.chat.item_view && !this.chat.item_view.content)
            this.chat.item_view.content = new xabber.ChatContentView({chat_item: this.chat.item_view});

        if (options.pinned_message)
            return this.account.pinned_messages.create(attrs);

        if (options.participant_message)
            return this.account.participant_messages.create(attrs);

        if (options.searched_message) {
            options.query && (attrs.query = options.query);
            options.searched_in_contact_messages && (attrs.searched_in_contact_messages = options.searched_in_contact_messages)
            return this.account.searched_messages.create(attrs);
        }

        if (options.context_message)
            return this.account.context_messages.create(attrs);

        if (options.echo_msg && message) {
            message.destroyOnEcho();
        }
        if ((options.replaced || options.encrypted && options.is_unread_archived) && message) {
            message.set(attrs);
            return;
        }

        if (options.is_searched) {
            let msg_contact = Strophe.getBareJidFromJid($message.attr('from'));
            (msg_contact === this.account.get('jid')) && (msg_contact = Strophe.getBareJidFromJid($message.attr('to')));
            message = xabber.all_searched_messages.create(attrs);
            message.contact = this.account.contacts.mergeContact(msg_contact);
            message.account = this.account;
            return message;
        }

        if ($message.find('[xmlns="' + Strophe.NS.EPHEMERAL + '"]').length && !$message.find('[xmlns="' + Strophe.NS.EPHEMERAL + '"]').closest('system-message').length && options.encrypted) {
            attrs.ephemeral_timer = $message.find('[xmlns="' + Strophe.NS.EPHEMERAL + '"]').attr('timer');
            options.sync_timestamp && (attrs.displayed_time = options.sync_timestamp);
            if (this.chat.contact){
                let cached_msg = this.account.omemo.cached_messages.getMessage(this.chat.contact, $message.find(`stanza-id[by="${this.account.get('jid')}"]`).attr('id'));
                if (cached_msg && cached_msg.envelope && cached_msg.displayed_time){
                    attrs.displayed_time = cached_msg.displayed_time;
                }
            }
        }

        message = this.create(attrs);

        (options.encrypted && options.is_unread) && message.set('is_unread', true);

        if ($message.find('[xmlns="' + Strophe.NS.EPHEMERAL + '"]').length && !$message.find('[xmlns="' + Strophe.NS.EPHEMERAL + '"]').closest('system-message').length && options.encrypted){
            message.collection.checkEphemeralTimers();
        }
        return message;
    },

      decryptFile: async function (uri, key) {
          return new Promise((resolve, reject) => {
              fetch(uri).then((r) => {
                  r.blob().then((blob) => {
                      let filereader = new FileReader();
                      filereader.onloadend = () => {
                          let arrayBuffer = filereader.result,
                              exportedMasterKey = key.slice(0, 32),
                              HMACData = key.slice(32);
                          utils.AES.decrypt(exportedMasterKey, HMACData, arrayBuffer).then((enc_file) => {
                              resolve(enc_file);
                          });
                      };
                      filereader.readAsArrayBuffer(blob);
                  });
              }).catch(() => {
                  resolve(null)
              });
          });
      },

    getFilename: function (url_media) {
        let idx = url_media.lastIndexOf("/");
        return url_media.substr(idx + 1, url_media.length - 1);
    },

    getFileType: function(full_type) {
        let end_idx = (full_type.indexOf("/") > -1) ? full_type.indexOf("/") : full_type.length,
            type = full_type.slice(0, end_idx);
        return type;
    },

    createSystemMessage: function (attrs) {
        return this.create(_.extend({
            type: 'system',
            silent: true,
            state: constants.MSG_DISPLAYED
        }, attrs));
    }
});


xabber.EphemeralTimerSelector = xabber.BasicView.extend({
    className: 'modal main-modal change-ephemeral-timer-modal',
    ps_selector: '.modal-content',
    ps_settings: {
        wheelPropagation: true
    },
    template: templates.ephemeral_timer_selector,

    events: {
        "click .btn-set-ephemeral-timer": "changeTimer",
    },

    render: function (options) {
        this.model = options.model;
        this.account = options.account;
        this.updateColorScheme();
        this.updateScrollBar();
        if (this.model.get('chat_ephemeral_timer')){
            this.updateSelectedTimer();
        }
        this.$el.openModal({
            ready: this.onRender.bind(this),
            complete: this.close.bind(this)
        });
    },

    updateColorScheme: function () {
        this.$el.attr('data-color', this.account.settings.get('color'));
    },

    onRender: function (options) {
        if (this.model.get('chat_ephemeral_timer')){
            this.scrollToChildPlus(this.$(`.btn-set-ephemeral-timer.selected`), -45);
        }

    },

    updateSelectedTimer: function () {
        let $el = this.$(`.btn-set-ephemeral-timer[data-value="${this.model.get('chat_ephemeral_timer')}"`);
        this.$(`.btn-set-ephemeral-timer`).removeClass('selected');
        $el.addClass('selected');
    },

    changeTimer: function (ev) {
        let $el = $(ev.target).closest('.btn-set-ephemeral-timer');
        this.$(`.btn-set-ephemeral-timer`).removeClass('selected');
        $el.addClass('selected')
        this.model.set('chat_ephemeral_timer', $el.attr('data-value'));
    },

    onHide: function () {
        this.$el.detach();
    },

    close: function () {
        this.closeModal();
    },

    closeModal: function () {
        this.$el.closeModal({ complete: this.hide.bind(this) });
    }
});

  xabber.JingleMessage = Backbone.Model.extend({
      defaults: {
          duration: 0,
          contact_full_jid: "",
          session_id: 0,
          audio: true,
          volume_on: true,
          video_in: false,
          video_screen: false,
          state: 0
      },

      initialize: function (attrs, options) {
          attrs = attrs || {};
          attrs.video_live = attrs.video_live || false;
          attrs.video = attrs.video_live;
          this.contact = options.contact;
          this.account = this.contact.account;
          this.registerIqHandler();
          this.audio_notifiation = xabber.playAudio(attrs.call_initiator ? xabber.settings.sound_on_call : xabber.settings.sound_on_dialtone, true);
          this.modal_view = new xabber.JingleMessageView({model: this});
          this.conn = new RTCPeerConnection({
              iceServers: [
                  {
                      urls: "stun:stun.l.google.com:19302"
                  },
                  {
                      urls: "stun:stun01.pool-01.xabber.org:3478"
                  },
              ].concat(constants.TURN_SERVERS_LIST),
              sdpSemantics: 'unified-plan'
          });
          this.$remote_video_el = $('<video autoplay class="webrtc-remote-video"/>');
          this.$remote_audio_el = $('<audio autoplay class="webrtc-remote-audio hidden"/>');
          this.$local_video = this.modal_view.$el.find('.webrtc-local-video');
          this.current_timer = 0;
          this.conn.onconnectionstatechange = this.onChangeConnectionState.bind(this);
          this.set(attrs);
          this.get('in') && this.updateStatus(xabber.getString("dialog_jingle_message__status_calling"));
          this.onChangedMediaType();
          this.conn.ontrack = (ev) => {
              this.remote_stream = ev.streams[0];
              this.modal_view.$el.find('.webrtc-remote-audio')[0].srcObject = ev.streams[0];
          };
          this._waiting_timeout = setTimeout(() => {
              (!this.get('state') && this.get('status') === 'calling' && this.get('call_initiator') === this.account.get('jid')) && this.reject();
          }, constants.JINGLE_WAITING_TIME * 1000);
          this.conn.onicecandidate = this.onIceCandidate.bind(this);
          this.conn.oniceconnectionstatechange = this.onChangeIceConnectionState.bind(this);
          this.on('change:audio', this.setEnabledAudioTrack, this);
          this.on('change:video', this.onChangedVideoValue, this);
          this.on('change:video_live', this.setEnabledVideoTrack, this);
          this.on('change:video_screen', this.setEnabledScreenShareVideoTrack, this);
          this.on('change:video_in', this.onChangedRemoteVideo, this);
          this.on('change:volume_on', this.onChangedVolume, this);
          this.on('destroy', this.onDestroy, this);
      },

      registerIqHandler: function () {
          this.account.connection.deleteHandler(this.iq_handler);
          this.iq_handler = this.account.connection.addHandler((iq) => {
                  this.onIQ(iq);
                  return true;
              }, null, 'iq', 'set');

      },

      updateStatus: function (status) {
          this.modal_view.updateStatusText(status);
      },

      updateTimer: function () {
          this.updateStatus(utils.pretty_duration(++this.current_timer));
      },

      startTimer: function () {
          this.updateTimer();
          clearInterval(this.call_timer);
          this.call_timer = setInterval(() => {
              this.updateTimer();
          }, 1000);
      },

      onConnected: function () {
          this.get('video_live') && this.onChangedVideoValue();
          xabber.stopAudio(this.audio_notifiation);
          setTimeout(() => {
              this.set('status', 'connected');
              xabber.trigger('update_jingle_button');
              this.updateStatus();
              this.startTimer();
          }, 1000);
      },

      onChangeConnectionState: function (ev) {
          let peer_conn = ev.target,
              conn_state = peer_conn.connectionState;
          if (conn_state === 'connected') {
              this.onConnected();
          } else {
              this.updateStatus(utils.pretty_name(conn_state) + '...');
              if (conn_state === "failed") {
                  clearTimeout(this._timeout_failed);
                  this._timeout_failed = setTimeout(() => {
                      if (peer_conn.connectionState === 'failed' || peer_conn.connectionState === 'disconnected') {
                          this.set('status', conn_state);
                          xabber.trigger('update_jingle_button');
                          this.reject();
                          this.destroy();
                          this.updateStatus(xabber.getString("dialog_jingle_message__status_network_error"));
                          xabber.current_voip_call = null;
                      }
                  }, 40000);
                  peer_conn.restartIce();
              }
              if (conn_state === 'disconnected') {
                  this.set('status', conn_state);
                  xabber.trigger('update_jingle_button');
                  this.destroy();
                  xabber.current_voip_call = null;
              }
          }
      },

      onIceCandidate: function (ice) {
          if (!ice || !ice.candidate || !ice.candidate.candidate)
              return;
          this.sendCandidate(ice.candidate);
      },

      onChangeIceConnectionState: function (ev) {
          let peer_conn = ev.target,
              conn_state = peer_conn.iceConnectionState;
          if (conn_state === "failed") {
              clearTimeout(this._timeout_failed);
              this._timeout_failed = setTimeout(() => {
                  if (peer_conn.iceConnectionState === 'failed' || peer_conn.connectionState === 'disconnected') {
                      this.set('status', conn_state);
                      xabber.trigger('update_jingle_button');
                      this.reject();
                      this.destroy();
                      this.updateStatus(xabber.getString("dialog_jingle_message__status_network_error"));
                      xabber.current_voip_call = null;
                  }
              }, 40000);
              peer_conn.restartIce();
          }
          if (conn_state === "connected")
              !this.conn.connectionState && this.onConnected();
      },

      onChangedMediaType: function () {
          this.$local_video.switchClass('hidden', !this.get('video'));
      },

      onChangedRemoteVideo: function () {
          let incoming_video = this.get('video_in');
          if (incoming_video) {
              this.$remote_video_el[0].srcObject = this.remote_stream;
              this.modal_view.$el.find('.webrtc-remote-audio').replaceWith(this.$remote_video_el);
              this.modal_view.$el.switchClass('multiple-videos', this.get('video') && this.get('video_in'));
          }
          else {
              this.$remote_audio_el[0].srcObject = this.remote_stream;
              this.modal_view.$el.find('.webrtc-remote-video').replaceWith(this.$remote_audio_el);
          }
          this.modal_view.$el.find('.default-screen').switchClass('hidden', incoming_video);
          this.onChangedVolume();
      },

      onChangedVolume: function () {
          if (this.get('volume_on')) {
              this.modal_view.$el.find('.webrtc-remote-audio')[0] && (this.modal_view.$el.find('.webrtc-remote-audio')[0].muted = false);
              this.modal_view.$el.find('.webrtc-remote-video')[0] && (this.modal_view.$el.find('.webrtc-remote-video')[0].muted = false);
          }
          else {
              this.modal_view.$el.find('.webrtc-remote-audio')[0] && (this.modal_view.$el.find('.webrtc-remote-audio')[0].muted = true);
              this.modal_view.$el.find('.webrtc-remote-video')[0] && (this.modal_view.$el.find('.webrtc-remote-video')[0].muted = true);
          }
      },

      setEnabledAudioTrack: function () {
          this.local_stream.getAudioTracks()[0].enabled = this.get('audio');
      },

      setEnabledVideoTrack: function () {
          let value = this.get('video_live'),
              default_video = this.conn.getSenders().find(sender => sender.track && (sender.track.default || sender.track.screen));
          value && this.set('video_screen', false);
          (default_video && value) && this.createVideoStream();
          (!default_video && this.local_stream) && (this.local_stream.getVideoTracks()[0].enabled = value);
          this.set('video', value || this.get('video_screen'));
      },

      onDestroy: function () {
          clearTimeout(this._waiting_timeout);
          clearInterval(this.call_timer);
          clearTimeout(this._timeout_failed);
          xabber.stopAudio(this.audio_notifiation);
          this.account.connection.deleteHandler(this.iq_handler);
          this.stopTracks();
          this.conn.close();
      },

      setEnabledScreenShareVideoTrack:  function () {
          let value = this.get('video_screen'),
              default_video = this.conn.getSenders().find(sender => sender.track && !sender.track.screen);
          value && this.set('video_live', false);
          (default_video && value) && this.createScreenShareVideoStream();
          (!default_video && this.local_stream) && (this.local_stream.getVideoTracks()[0].enabled = value);
          this.set('video', value || this.get('video_live'));
      },

      onChangedVideoValue: function () {
          let video_state = this.get('video') ? 'enable' : 'disable';
          this.sendVideoStreamState(video_state);
          this.onChangedMediaType();
      },

      createScreenShareVideoStream: function () {
          navigator.mediaDevices.getDisplayMedia({video: true}).then((media_stream) => {
              this.$local_video[0].srcObject = media_stream;
              media_stream.getVideoTracks().forEach((track) => {
                  _.extend(track, {screen: true});
                  this.local_stream.addTrack(track);
                  this.conn.addTrack(track, this.local_stream);
                  this.conn.getSenders().find(sender => !sender.track || sender.track && sender.track.kind === 'video').replaceTrack(track);
              });
          });
      },

      sendVideoStreamState: function (state) {
          let $iq_video = $iq({to: this.get('contact_full_jid'), type: 'set'})
              .c('query', {xmlns: Strophe.NS.JINGLE_MSG})
              .c('video', {state: state, id: this.get('session_id')});
          this.account.sendIQFast($iq_video);
      },

      onIQ: function (iq) {
          let $incoming_iq = $(iq),
              $jingle_initiate = $incoming_iq.find('jingle[action="session-initiate"]'),
              $jingle_accept = $incoming_iq.find('jingle[action="session-accept"]'),
              $jingle_info = $incoming_iq.find('jingle[action="session-info"]'),
              $jingle_video = $incoming_iq.find(`query[xmlns="${Strophe.NS.JINGLE_MSG}"] video`),
              from_jid = $incoming_iq.attr('from'),
              $result_iq = $iq({to: from_jid, type: 'result', id: $incoming_iq.attr('id')});
          if ($jingle_initiate.length) {
              if ($jingle_initiate.attr('sid') !== this.get('session_id'))
                  return;
              let offer_sdp = $jingle_initiate.find(`description[xmlns="${Strophe.NS.JINGLE_RTP}"]`).text();
              offer_sdp && this.conn.setRemoteDescription(new RTCSessionDescription({type: 'offer', sdp: offer_sdp}));
              this.acceptSession(offer_sdp);
              this.account.sendIQFast($result_iq);
          }
          if ($jingle_accept.length) {
              if ($jingle_accept.attr('sid') !== this.get('session_id'))
                  return;
              let answer_sdp = $jingle_accept.find(`description[xmlns="${Strophe.NS.JINGLE_RTP}"]`).text();
              answer_sdp && this.conn.setRemoteDescription(new RTCSessionDescription({type: 'answer', sdp: answer_sdp}));
              this.account.sendIQFast($result_iq);
          }
          if ($jingle_info.length) {
              if ($jingle_info.attr('sid') !== this.get('session_id'))
                  return;
              let candidate = $jingle_info.find('candidate');
              candidate.length && this.conn.addIceCandidate(new RTCIceCandidate({candidate: candidate.text(), sdpMLineIndex: candidate.attr('sdpMLineIndex'), sdpMid: candidate.attr('sdpMid')}));
              this.account.sendIQFast($result_iq);
          }
          if ($jingle_video.length) {
              let session_id = $jingle_video.attr('id');
              if (session_id === this.get('session_id')) {
                  let video_state = $jingle_video.attr('state');
                  if (video_state === 'enable')
                      this.set('video_in', true);
                  if (video_state === 'disable')
                      this.set('video_in', false);
              }
              this.account.sendIQFast($result_iq);
          }
      },

      startCall: function () {
          this.set('call_initiator', this.account.get('jid'));
          this.createAudioStream();
          this.get('video_live') && this.createVideoStream();
          this.propose();
      },

      createAudioStream: function () {
          navigator.mediaDevices.getUserMedia({audio: true}).then((media_stream) => {
              this.local_stream = media_stream;
              this.$local_video[0].srcObject = media_stream;
              let video_track = this.initVideoTrack();
              this.local_stream.addTrack(video_track);
              this.conn.addTrack(video_track, this.local_stream);
              media_stream.getAudioTracks().forEach(track => this.conn.addTrack(track, this.local_stream));
          });
      },

      createVideoStream: function () {
          navigator.mediaDevices.getUserMedia({video: true}).then((media_stream) => {
              this.$local_video[0].srcObject = media_stream;
              media_stream.getVideoTracks().forEach((track) => {
                  this.local_stream.addTrack(track);
                  this.conn.addTrack(track, this.local_stream);
                  this.conn.getSenders().find(sender => !sender.track || sender.track && sender.track.kind === 'video').replaceTrack(track);
              });
          });
      },

      stopTracks: function () {
          this.local_stream && this.local_stream.getTracks().forEach((track) => {
              track.stop();
              this.local_stream.removeTrack(track);
          });
      },

      propose: function () {
          this.updateStatus(xabber.getString("dialog_jingle_message__status_search"));
          let $propose_msg = $msg({type: 'chat', to: this.contact.get('jid')})
              .c('propose', {xmlns: Strophe.NS.JINGLE_MSG, id: this.get('session_id')})
              .c('description', {xmlns: Strophe.NS.JINGLE_RTP, media: 'audio'}).up().up()
              .c('no-store', {xmlns: Strophe.NS.HINTS}).up()
              .c('markable').attrs({'xmlns': Strophe.NS.CHAT_MARKERS}).up()
              .c('body').t(xabber.getString("jingle__text_body_message")).up()
              .c('origin-id', {id: uuid(), xmlns: 'urn:xmpp:sid:0'});
          this.account.sendMsg($propose_msg);
      },

      accept: function () {
          let $accept_msg = $msg({type: 'chat', to: this.get('contact_full_jid') || this.contact.get('jid')})
              .c('accept', {xmlns: Strophe.NS.JINGLE_MSG, id: this.get('session_id')}).up()
              .c('no-store', {xmlns: Strophe.NS.HINTS}).up()
              .c('markable').attrs({'xmlns': Strophe.NS.CHAT_MARKERS}).up()
              .c('origin-id', {id: uuid(), xmlns: 'urn:xmpp:sid:0'});
          this.set('jingle_start', moment.now());
          this.account.sendMsg($accept_msg);
          xabber.stopAudio(this.audio_notifiation);
          this.set('status', 'connecting');
          xabber.trigger('update_jingle_button');
          this.updateStatus(xabber.getString("dialog_jingle_message__status_connecting"));
          this.audio_notifiation = xabber.playAudio(xabber.settings.sound_on_connection, true);
      },

      reject: function (reason) {
          if (this.get('status') === 'disconnected' || this.get('status') === 'disconnecting')
              return;
          let $reject_msg = $msg({type: 'chat', to: this.get('contact_full_jid') || this.contact.get('jid')})
              .c('reject', {xmlns: Strophe.NS.JINGLE_MSG, id: this.get('session_id')});
          if (this.get('jingle_start')) {
              let end = moment.now(),
                  duration = Math.round((end - this.get('jingle_start'))/1000),
                  call_attrs = {initiator: this.get('call_initiator')};
              if (this.call_timer)
                  _.extend(call_attrs, {start: moment(this.get('jingle_start')).format(), end: moment(end).format(), duration: duration});
              reason && (call_attrs.reason = reason);
              $reject_msg.c('call', call_attrs).up();
          }
          $reject_msg.up().c('store', {xmlns: Strophe.NS.HINTS}).up()
              .c('markable').attrs({'xmlns': Strophe.NS.CHAT_MARKERS}).up()
              .c('origin-id', {id: uuid(), xmlns: 'urn:xmpp:sid:0'});
          this.account.sendMsg($reject_msg);
          this.createSystemMessage($reject_msg);
          this.set('status', 'disconnected');
          xabber.trigger('update_jingle_button');
          this.destroy();
          xabber.current_voip_call = null;
      },

      createSystemMessage: function (message) {
          let $message = $(message.nodeTree),
              chat = this.account.chats.getChat(this.contact),
              time = $message.find('call').attr('end');
          if (time) {
              let duration = $message.find('call').attr('duration'),
                  initiator = $message.find('call').attr('initiator');
              chat.messages.createSystemMessage({
                  from_jid: this.account.get('jid'),
                  session_id: $message.find('reject').attr('id'),
                  message: xabber.getString(((initiator && initiator === this.account.get('jid')) ? "jingle__system_message__outgoing_call" : "jingle__system_message__incoming_call"), [utils.pretty_duration(duration)])
              });
          }
          else {
              chat.messages.createSystemMessage({
                  from_jid: this.account.get('jid'),
                  session_id: $message.find('reject').attr('id'),
                  message: xabber.getString("jingle__system_message__cancelled_call")
              });
          }
      },

      initVideoTrack: function () {
          let canvas = Object.assign(document.createElement("canvas"), {width: 320, height: 240});
          let ctx = canvas.getContext('2d');
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          let p = ctx.getImageData(0, 0, canvas.width, canvas.height);
          requestAnimationFrame(function draw(){
              for (let i = 0; i < p.data.length; i++)
                  p.data[i++] = p.data[i++] = p.data[i++] = 1;
              ctx.putImageData(p, 0, 0);
              requestAnimationFrame(draw);
          });
          return _.extend(canvas.captureStream(60).getTracks()[0], {default: true});
      },

      initSession: function () {
          navigator.mediaDevices.getUserMedia({audio: true}).then((media_stream) => {
              this.local_stream = media_stream;
              this.$local_video[0].srcObject = media_stream;
              let video_track = this.initVideoTrack();
              this.local_stream.addTrack(video_track);
              this.conn.addTrack(video_track, this.local_stream);
              media_stream.getAudioTracks().forEach(track => this.conn.addTrack(track, this.local_stream));
              return this.conn.createOffer({offerToReceiveAudio:true, offerToReceiveVideo: true});
          }).then((offer) => {
                  this.set('session_initiator', this.account.get('jid'));
                  this.conn.setLocalDescription(offer).then(() => {
                      let offer_sdp = offer.sdp,
                          $iq_offer_sdp = $iq({to: this.get('contact_full_jid'), type: 'set'})
                          .c('jingle', {xmlns: Strophe.NS.JINGLE, action: 'session-initiate', initiator: this.account.get('jid'), sid: this.get('session_id')})
                          .c('content', {creator: 'initiator', name: 'voice'})
                          .c('description', {xmlns: Strophe.NS.JINGLE_RTP, media: 'audio'})
                          .c('sdp').t(offer_sdp).up().up()
                          .c('security', {xmlns: Strophe.NS.JINGLE_SECURITY_STUB});
                      this.account.sendIQFast($iq_offer_sdp);
                  });
          });
      },

      sendCandidate: function (candidate) {
          let $iq_candidate = $iq({to: this.get('contact_full_jid'), type: 'set'})
              .c('jingle', {xmlns: Strophe.NS.JINGLE, action: 'session-info', initiator: this.get('session_initiator'), sid: this.get('session_id')})
              .c('content', {creator: 'initiator', name: 'voice'})
              .c('description', {xmlns: Strophe.NS.JINGLE_RTP, media: 'audio'}).up()
              .c('transport', {xmlns: Strophe.NS.JINGLE_TRANSPORTS_ICE})
              .c('candidate', {sdpMLineIndex: candidate.sdpMLineIndex, sdpMid: candidate.sdpMid }).t(candidate.candidate);
          this.account.sendIQFast($iq_candidate);
      },

      acceptSession: async function () {
          this.set('session_initiator', this.contact.get('jid'));
          this.conn.createAnswer().then((answer) => {
              this.conn.setLocalDescription(answer).then(() => {
                  let answer_sdp = answer.sdp,
                      $iq_answer_sdp = $iq({to: this.get('contact_full_jid'), type: 'set'})
                          .c('jingle', {xmlns: Strophe.NS.JINGLE, action: 'session-accept', initiator: this.contact.get('jid'), sid: this.get('session_id')})
                          .c('content', {creator: 'initiator', name: 'voice'})
                          .c('description', {xmlns: Strophe.NS.JINGLE_RTP, media: 'audio'})
                          .c('sdp').t(answer_sdp).up().up()
                          .c('security', {xmlns: Strophe.NS.JINGLE_SECURITY_STUB});
                  this.account.sendIQFast($iq_answer_sdp);
              });
          });
      }
  });

  xabber.Chat = Backbone.Model.extend({
    defaults: {
        opened: true,
        active: false,
        display: false,
        displayed_sent: false,
        last_displayed_id: 0,
        last_delivered_id: 0,
        unread: 0,
        timestamp: 0,
        const_unread: 0,
        encrypted: false
    },

    initialize: function (attrs, options) {
        this.contact = options.contact;
        this.sync_created = options.sync_created;
        this.account = this.contact ? this.contact.account : options.account;
        let jid = this.contact ? this.contact.get('jid') : attrs.jid;
        this.set({
            id: attrs && attrs.id || this.contact.hash_id,
            jid: jid
        });
        (attrs && attrs.type === 'encrypted') && this.set('encrypted', true);
        if (attrs && attrs.type === 'saved') {
            this.set('saved', true);
            this.account.on('remove_saved_chat', this.onContactDestroyed, this);
        }
        this.retraction_version = 0;
        if (this.contact) {
            this.set('group_chat', this.contact.get('group_chat'));
            this.contact.on("destroy", this.onContactDestroyed, this);
            this.contact.on("change:group_chat", this.onChangedContact, this);
        } else {
            this.set({'group_chat': false, 'name': attrs.name});
        }
        this.messages = new xabber.Messages(null, {account: this.account, chat: this});
        this.messages_unread = new xabber.Messages(null, {account: this.account});
        this.item_view = new xabber.ChatItemView({model: this});
        this.plyr_players = [];
        this.retracted_msg_id_list = [];
        this.on("get_retractions_list", this.getAllMessageRetractions, this);
        this.on("change:timestamp", this.onChangedTimestamp, this);
        this.on("update_last_read_msg", this.onChangedLastReadMsg, this);
    },

    onChangedTimestamp: function () {
    },

    onChangedLastReadMsg: function (options) {
        if (this.get('prev_last_read_msg') && this.get('last_read_msg') && this.get('prev_last_read_msg') !== this.get('last_read_msg')){
            if (this.item_view && !this.item_view.content){
                this.item_view.content = new xabber.ChatContentView({chat_item: this.item_view});
            }
            this.item_view.content._no_scrolling_event = true;
            let query = {
                fast: true,
                max: xabber.settings.mam_messages_limit,
                is_first: true,
                sync_update: options && options.sync_update ? true : false,
                var: [
                    {var: 'after-id', value: this.get('prev_last_read_msg')},
                    {var: 'before-id', value: this.get('last_read_msg')},
                ]
            };
            this.requestHistoryBetweenAnchors(query);

        }
        this.set('prev_last_read_msg', this.get('last_read_msg'));
    },

    requestHistoryBetweenAnchors: function (query) {
        this.item_view.content.MAMRequest(query, (success, messages, rsm) => {
            if (rsm.complete)
                this.set('last_sync_unread_id', this.get('last_read_msg'));
            if (query.is_first && !query.sync_update) {
                let read_count = Number(rsm.count) + 1;
                read_count = this.get('const_unread') - read_count;
                (read_count < 0) && (read_count = 0);
                this.set('const_unread', read_count);
            }
            if (!rsm.complete && (rsm.count > messages.length)){
                query.after = rsm.last;
                query.is_first = false;
                this.requestHistoryBetweenAnchors(query);
            }
            _.each(messages, (message) => {
                let message_item = this.account.chats.receiveChatMessage(message,
                        {
                            is_archived: true,
                            is_between_anchors: true,
                        }
                    );
                message_item && message_item.set('is_unread', false)
            });
            if (rsm.complete && this.get('last_read_msg')){
                let last_read_msg = this.messages.find(m => this.get('last_read_msg') && (m.get('stanza_id') === this.get('last_read_msg') || m.get('contact_stanza_id') === this.get('last_read_msg'))),
                    deferred = new $.Deferred();
                deferred.done(() => {
                    last_read_msg && last_read_msg.set('is_unread', false);
                    if (this.item_view.content.isVisible()){
                        this.item_view.content._long_reading_timeout = true;
                        this.item_view.content.scrollToUnread();
                    } else {
                        this.set('show_new_unread', true);
                    }
                    this.item_view.content._no_scrolling_event = false;
                });
                if (!last_read_msg){
                    this.contact.getMessageByStanzaId(this.get('last_read_msg'), ($message) => {
                        last_read_msg = this.account.chats.receiveChatMessage($message, {is_archived: true});
                        deferred.resolve()
                    });
                } else {
                    deferred.resolve()
                }
            }
        }, (err) => {
            xabber.error('error');
        });
    },


    isMuted: function () {
          if (this.get('muted') && (this.get('muted') < (Date.now() / 1000)))
              this.set('muted', false)
          return this.get('muted')
    },

      onChangedContact: function () {
          let changed = this.contact.changed;
          if (_.has(changed, 'group_chat'))
              this.set('group_chat', this.contact.get('group_chat'));
          if (_.has(changed, 'blocked'))
              this.set('blocked', this.contact.get('blocked'));
      },

    recountUnread: function () {
        this.set('unread', this.messages_unread.length);
        if (this.contact && this.get('archived') && this.isMuted()) {
        }
        else {
            xabber.toolbar_view.recountAllMessageCounter();
        }
    },

      setEphemeralTimer: function (ev) {
          if (!this.get('encrypted'))
              return;
          this.set('chat_ephemeral_timer', $(ev.target).closest('.btn-set-ephemeral-timer').attr('data-value'))
      },

    onContactDestroyed: function () {
        this.resetUnread();
        this.destroy();
    },

    resetUnread: function () {
        let unread = this.get('unread');
        if (unread > 0) {
            this.messages_unread && this.messages_unread.reset();
            this.set('unread', 0);
            xabber.recountAllMessageCounter(unread);
            xabber.toolbar_view.recountAllMessageCounter(unread);
        }
    },

    searchMessages: function (query, callback) {
        this.messages_view = new xabber.SearchedMessagesView({
            query_text: query,
            model: this
        });
        this.messages_view.messagesRequest({}, () => {
            xabber.body.setScreen('all-chats', {
                right: 'searched_messages',
                model: this
            });
        });
    },

    sendDataForm: function (message, variable) {
        let data_form = message.get('data_form');
        if (!data_form)
            return;
        let msg = $msg({type: 'chat'});
        data_form.fields.forEach((field) => {
            if (field.type  === 'boolean') {
                if (field.var === variable)
                    field.values = [true];
                else
                    field.values = [false];
            }
        });
        msg = this.account.addDataFormToStanza(msg, data_form);
        data_form.addresses.forEach((address) => {
            if (address.type === 'replyto')
                $(msg.nodeTree).attr('to', address.jid);
            this.account.sendMsg(msg);
        });
    },

    setStanzaId: function (unique_id, stanza_id) {
        let message = this.messages.get(unique_id),
            origin_id = message.get('origin_id');
        if (this.item_view && this.item_view.content && stanza_id)
            this.item_view.content.$(`.chat-message[data-uniqueid="${unique_id}"]`).data('uniqueid', stanza_id)[0].setAttribute('data-uniqueid', stanza_id);
        message.set('stanza_id', stanza_id);
        if (this.get('encrypted'))
            this.account.omemo && this.account.omemo.updateMessage({stanza_id, origin_id}, this.contact);
    },

    getCallingAvailability: function (to, session_id, callback) {
        let iq = $iq({to: to, type: 'get'})
            .c('query', {xmlns: Strophe.NS.JINGLE_MSG})
            .c('session', {id: session_id});
        this.account.sendIQFast(iq, callback);
    },

    sendReject: function (options) {
        !options && (options = {});
        let msg_to = options.to || this.contact.get('jid'),
            $reject_msg = $msg({
                type: 'chat',
                to: msg_to
            })
                .c('reject', {xmlns: Strophe.NS.JINGLE_MSG, id: options.session_id})
                .c('call', {reason: options.reason}).up().up()
                .c('store', {xmlns: Strophe.NS.HINTS}).up()
                .c('markable').attrs({'xmlns': Strophe.NS.CHAT_MARKERS}).up()
                .c('origin-id', {id: uuid(), xmlns: 'urn:xmpp:sid:0'});
        this.account.sendMsg($reject_msg);
    },

    initIncomingCall: function (full_jid, session_id) {
        if (!xabber.get('audio') || !xabber.settings.jingle_calls) {
            return;
        }
        xabber.current_voip_call = new xabber.JingleMessage({contact_full_jid: full_jid, session_id: session_id, call_initiator: this.contact.get('jid')}, {contact: this.contact, });
        xabber.current_voip_call.modal_view.show({status: 'in'});
        xabber.trigger('update_jingle_button');
        if (xabber.body.screen.get('name') === 'all-chats' && !xabber.body.screen.get('right') && this.item_view)
            this.item_view.open();
    },

    showEphemeralTimerSelector: function (full_jid, session_id) {
        this.ephemeral_timer_selector = new xabber.EphemeralTimerSelector();
        this.ephemeral_timer_selector.show({model: this, account: this.account});
    },

    endCall: function (status) {
        status && xabber.current_voip_call.set('status', status);
        xabber.trigger('update_jingle_button');
        xabber.current_voip_call.destroy(status);
        xabber.current_voip_call = null;
        xabber.trigger('update_jingle_button');
    },

    getAllMessageRetractions: function () {
        if (!this.contact.get('group_chat'))
            return;
        let retractions_query = $iq({type: 'get', to: this.contact.get('jid')})
            .c('query', {xmlns: Strophe.NS.REWRITE, version: this.retraction_version});
        this.account.sendIQ(retractions_query);
    },

    receiveMessage: function ($message, options) {
        let from_bare_jid = Strophe.getBareJidFromJid($message.attr('from')),
            carbon_copied = options.carbon_copied;
        // searching chat marker message
        let $marker = $message.children(`[xmlns="${Strophe.NS.CHAT_MARKERS}"]`),
            $receipt_request = $message.children(`request[xmlns="${Strophe.NS.RECEIPTS}"]`),
            $receipt_response = $message.children(`received[xmlns="${Strophe.NS.RECEIPTS}"]`),
            $jingle_msg_propose = $message.children(`propose[xmlns="${Strophe.NS.JINGLE_MSG}"]`),
            $jingle_msg_accept = $message.children(`accept[xmlns="${Strophe.NS.JINGLE_MSG}"]`),
            $jingle_msg_reject = $message.children(`reject[xmlns="${Strophe.NS.JINGLE_MSG}"]`);
        if ($jingle_msg_propose.length && !options.searched_message) {
            if (carbon_copied && (from_bare_jid == this.account.get('jid'))) {
                return;
            }
            if (options.synced_msg){
                if (this.get('saved'))
                    return;
                let view = xabber.chats_view.child(this.contact.hash_id);
                $message.find('time').attr('stamp') && this.set('timestamp', $message.find('time').attr('stamp'));
                if (!view.content)
                    view.content = new xabber.ChatContentView({chat_item: view});
                if (view && view.content)
                    view.content.receiveNoTextMessage($message, carbon_copied);
                return;
            }
            if (options.is_archived)
                return;
            else {
                let session_id = $jingle_msg_propose.attr('id'),
                    iq_to = $message.attr('from');
                this.getCallingAvailability(iq_to, session_id, () => {
                    if (xabber.current_voip_call) {
                        let reason = from_bare_jid === Strophe.getBareJidFromJid(xabber.current_voip_call.get('contact_full_jid')) ? 'device_busy' : 'busy';
                        this.sendReject({session_id: session_id, reason: reason});
                        this.messages.createSystemMessage({
                            from_jid: this.account.get('jid'),
                            message: xabber.getString("jingle__system_message__cancelled_call")
                        });
                        return;
                    }
                    this.initIncomingCall(iq_to, session_id);
                });
            }
        }
        if ($jingle_msg_accept.length) {
            if (options.is_archived || options.synced_msg)
                return;
            if (xabber.current_voip_call && xabber.current_voip_call.get('session_id') === $jingle_msg_accept.attr('id')) {
                if (carbon_copied)
                    this.endCall('accepted_another_device');
                else {
                    !xabber.current_voip_call.get('state') && xabber.current_voip_call.set('state', constants.JINGLE_MSG_ACCEPT);
                    xabber.trigger('update_jingle_button');
                    let jingle_start = $jingle_msg_accept.find('time').attr('stamp');
                    jingle_start = jingle_start ? Number(moment(jingle_start)) : moment.now();
                    xabber.current_voip_call.set('jingle_start', jingle_start);
                    !xabber.current_voip_call.get('contact_full_jid') && xabber.current_voip_call.set('contact_full_jid', $message.attr('from'));
                    xabber.stopAudio(xabber.current_voip_call.audio_notifiation);
                    xabber.current_voip_call.set('status', 'connecting');
                    xabber.trigger('update_jingle_button');
                    xabber.current_voip_call.updateStatus(xabber.getString("dialog_jingle_message__status_connecting"));
                    xabber.current_voip_call.audio_notifiation = xabber.playAudio(xabber.settings.sound_on_connection);
                }
            }
        }
        if ($jingle_msg_reject.length) {
            if (this.messages.filter(m => m.get('session_id') === $jingle_msg_reject.attr('id')).length)
                return;
            let time = options.delay && options.delay.attr('stamp') || $message.find('delay').attr('stamp') || $message.find('time').attr('stamp'), message, msg_text = "";
            if ($jingle_msg_reject.children('call').length) {
                let duration = $jingle_msg_reject.children('call').attr('duration'),
                    initiator = $jingle_msg_reject.children('call').attr('initiator');
                if (duration && initiator)
                    msg_text =xabber.getString(((initiator && initiator === this.account.get('jid')) ? "jingle__system_message__outgoing_call" : "jingle__system_message__incoming_call"), [utils.pretty_duration(duration)]);
                else
                    msg_text =  xabber.getString("jingle__system_message__cancelled_call");
            }
            else
                msg_text =  xabber.getString("jingle__system_message__cancelled_call");
            options.is_unread && (options.reject_contact_stanza_id = options.contact_stanza_id);
            message = this.messages.createSystemMessage({
                from_jid: this.account.get('jid'),
                time: time,
                session_id: $jingle_msg_reject.attr('id'),
                stanza_id: options.stanza_id,
                contact_stanza_id: options.reject_contact_stanza_id,
                is_unread: options.is_unread,
                message: msg_text
            });
            if (options.is_archived || options.synced_msg)
                return message;
            if (xabber.current_voip_call && xabber.current_voip_call.get('session_id') === $jingle_msg_reject.attr('id')) {
                xabber.stopAudio(xabber.current_voip_call.audio_notifiation);
                let busy_audio = xabber.playAudio(xabber.settings.sound_on_call_busy);
                setTimeout(() => {
                    xabber.stopAudio(busy_audio);
                }, 1500);
                this.endCall($jingle_msg_reject.children('call').attr('reason') == 'device_busy' ? 'device_busy' : $jingle_msg_reject.children('call').attr('reason') == 'busy' ? 'busy' : 'disconnected');
            }
            return message;
        }
        if (!options.is_archived) {
            let $stanza_id, $contact_stanza_id;
            $message.children('stanza-id').each((idx, stanza_id) => {
                stanza_id = $(stanza_id);
                if ($message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}"]`).length) {
                    if (stanza_id.attr('by') === from_bare_jid) {
                        !$stanza_id && ($stanza_id = stanza_id);
                        $contact_stanza_id = stanza_id;
                    }
                    else
                        $stanza_id = stanza_id;
                }
                else {
                    if (stanza_id.attr('by') === from_bare_jid)
                        $contact_stanza_id = stanza_id;
                    else
                        $stanza_id = stanza_id;
                }
            });
            (!options.stanza_id && $stanza_id) && (options.stanza_id = $stanza_id.attr('id'));
            (!options.contact_stanza_id && $contact_stanza_id) && (options.contact_stanza_id = $contact_stanza_id.attr('id'));
        }
        if ($marker.length) {
            let marker_tag = $marker[0].tagName.toLowerCase();
            if ((marker_tag === 'markable') && !options.is_mam && !options.is_archived && !carbon_copied && (!options.synced_msg || options.synced_msg && options.is_unread)) {
                this.sendMarker($message.attr('id'), 'received', options.stanza_id, options.contact_stanza_id);
                this.get('saved') && this.sendMarker($message.attr('id'), 'displayed', options.stanza_id, options.contact_stanza_id);
            }
            if ((marker_tag !== 'markable') && !carbon_copied) {
                this.receiveMarker($message, marker_tag, carbon_copied);
                return;
            }
            if ((marker_tag === 'displayed') && carbon_copied)
                this.receiveCarbonsMarker($marker);
        }

        if ($receipt_request.length && !options.is_mam && !options.is_archived && !carbon_copied && (!options.synced_msg || options.synced_msg && options.is_unread))
            this.sendDeliveryReceipt($message);

        if ($receipt_response.length)
            this.receiveDeliveryReceipt($message);

        if (!$message.find('body').length || $jingle_msg_propose.length || $jingle_msg_accept.length || $jingle_msg_reject.length) {
            if (this.get('saved'))
                return;
            let view = xabber.chats_view.child(this.contact.hash_id);
            if (!view.content)
                view.content = new xabber.ChatContentView({chat_item: view});
            if (view && view.content)
                view.content.receiveNoTextMessage($message, carbon_copied);
            return;
        }

        if ($message.find('invite').length) {
            if (from_bare_jid === this.account.get('jid'))
                return;
            let group_jid = $message.find('invite').attr('jid') || $message.find('message').attr('from'),
                contact = this.account.contacts.get(group_jid), chat;
            if (contact)
                if (contact.get('subscription') == 'both')
                    return;
            if (this.account.connection && this.account.connection.do_synchronization) {
                if (options.synced_msg || !options.synced_msg && !options.is_archived)
                    return this.messages.createInvitationFromStanza($message, options);
            } else {
                let iq = $iq({type: 'get'}).c('blocklist', {xmlns: Strophe.NS.BLOCKING});
                this.account.sendIQFast(iq, (iq) => {
                        let items = $(iq).find('item'),
                            current_timestamp = Number(moment($message.find('delay').attr('stamp') || $message.find('time').attr('stamp') || (options.delay) && Number(moment(options.delay.attr('stamp'))) || moment.now())),
                            last_blocking_timestamp,
                            has_blocking = false;
                        if (items.length > 0) {
                            items.each((idx, item) => {
                                let $item = $(item),
                                    item_jid = $item.attr('jid'), blocking_timestamp = "";
                                if (item_jid.indexOf(group_jid) > -1) {
                                    has_blocking = true;
                                    blocking_timestamp = item_jid.substr(item_jid.lastIndexOf("/") + 1, item_jid.length - group_jid.length);
                                    if (!blocking_timestamp) {
                                        last_blocking_timestamp = "";
                                        return false;
                                    } else if (!last_blocking_timestamp || last_blocking_timestamp < blocking_timestamp)
                                        last_blocking_timestamp = blocking_timestamp;
                                }
                            });
                        }
                        if (_.isUndefined(last_blocking_timestamp) || last_blocking_timestamp && last_blocking_timestamp < current_timestamp)
                            return this.messages.createInvitationFromStanza($message, options);
                    }, () => {
                        return this.messages.createInvitationFromStanza($message, options);
                    });
            }
        }
        else{
            return this.messages.createFromStanza($message, options);
        }
    },

    getMessageContext: function (unique_id, options) {
        options = options || {};
        let messages = options.mention && this.account.messages || options.searched_messages && !options.encrypted && this.account.searched_messages || options.message && xabber.all_searched_messages || this.account.messages,
            message = messages.get(unique_id),
            dfd = new $.Deferred;

        dfd.done(() => {
            if (message) {
                if (options.searched_messages)
                    message.set('searched_message', false);
                let stanza_id = message.get('stanza_id');
                this.messages_view = new xabber.MessageContextView({
                    contact: this.contact,
                    mention_context: options.mention,
                    model: this,
                    stanza_id_context: stanza_id,
                    encrypted: options.encrypted
                });
                this.account.context_messages.add(message);
                this.messages_view.messagesRequest({after: stanza_id}, () => {
                    let screen = 'all-chats';
                    if (options.mention)
                        screen = 'mentions';
                    else if (options.message)
                        screen = xabber.body.screen.get('name');
                    xabber.body.setScreen(screen, {
                        right: 'message_context',
                        model: this,
                    }, {
                        right_contact_save: true
                    });
                });
            }

        })
        if (!message) {
            message = messages.models.find(item => {
                return item.get('origin_id') === unique_id;
            })
            if (!message) {
                this.contact.getMessageByStanzaId(unique_id, ($message) => {
                    if (options.encrypted && this.account.omemo) {
                        let omemo_dfd = new $.Deferred;
                        omemo_dfd.done(($msg, msg_options) => {
                            msg_options = msg_options || {};
                            msg_options.searched_message = true;
                            message = this.account.chats.receiveChatMessage($msg[0], msg_options);
                            dfd.resolve();
                        }).fail(() => {
                            dfd.resolve();
                        });
                        message = this.account.omemo.receiveChatMessage($message, {
                            searched_message: true,
                            gallery: true,
                        }, omemo_dfd);

                    } else {
                        message = this.account.chats.receiveChatMessage($message, {
                            searched_message: true,
                        });
                        dfd.resolve();
                    }
                }, {encrypted: options.encrypted});

            } else {
                dfd.resolve()
            }
        } else {
            dfd.resolve()
        }
    },

    sendDeliveryReceipt: function ($message) {
        let $delivery_msg = $msg({
            to: this.contact.get('jid'),
            type: 'chat',
            id: uuid()})
            .c('received', { xmlns: Strophe.NS.RECEIPTS, id: $message.attr('id')});
        this.account.sendMsg($delivery_msg);
    },

    sendMarker: function (msg_id, status, stanza_id, contact_stanza_id, is_ephemeral) {
        status || (status = 'displayed');
        let stanza = $msg({
            to: this.get('jid'),
            type: 'chat',
            id: uuid()
        }).c(status).attrs({
            xmlns: Strophe.NS.CHAT_MARKERS,
            id: msg_id || stanza_id || contact_stanza_id || ""
        });
        stanza_id && stanza.c('stanza-id', {xmlns: 'urn:xmpp:sid:0', id: stanza_id, by: this.account.get('jid')}).up();
        (!this.get('saved') && contact_stanza_id) && stanza.c('stanza-id', {xmlns: 'urn:xmpp:sid:0', id: contact_stanza_id, by: this.contact.get('jid')}).up();
        is_ephemeral && stanza.up().c('store', {xmlns: Strophe.NS.HINTS});
        is_ephemeral && stanza.up().c('encryption', {xmlns: Strophe.NS.EXPLICIT_MESSAGE_ENCRYPTION, namespace: Strophe.NS.OMEMO});
        is_ephemeral && stanza.up().c('conversation', {xmlns: Strophe.NS.SYNCHRONIZATION, type: Strophe.NS.OMEMO, jid: this.contact.get('jid')});
        this.account.sendMsg(stanza);
    },

    receiveMarker: function ($message, tag, carbon_copied) {
        let $displayed = $message.find('displayed'),
            $received = $message.find('received'),
            error = $message.attr('type') === 'error';
        if (error || !$displayed.length && !$received.length)
            return;
        let marked_msg_id = $displayed.attr('id') || $received.attr('id'),
            marked_stanza_id = $displayed.find(`stanza-id[by="${this.account.get('jid')}"]`).attr('id') || $received.find(`stanza-id[by="${this.account.get('jid')}"]`).attr('id'),
            msg = this.account.messages.find(m => marked_stanza_id && (m.get('stanza_id') === marked_stanza_id || m.get('contact_stanza_id') === marked_stanza_id) || m.get('msgid') === marked_msg_id);
        if (!msg) {
            let enc_chat =  this.account.chats.get(`${this.id}:encrypted`),
                enc_msg = enc_chat && enc_chat.messages.find(m => marked_stanza_id && (m.get('stanza_id') === marked_stanza_id || m.get('contact_stanza_id') === marked_stanza_id) || m.get('msgid') === marked_msg_id);
            if (!enc_msg && this.account.omemo){
                let cached_msg = this.account.omemo.cached_messages.getMessage(this.contact, marked_stanza_id);
                if (cached_msg && cached_msg.envelope && !cached_msg.displayed_time){
                    cached_msg.displayed_time = $message.find('time').attr('stamp');
                    cached_msg && this.account.omemo.cached_messages.putMessage(this.contact, marked_stanza_id, cached_msg);
                }
            }
            if (enc_msg)
                enc_chat.receiveMarker($message, tag, carbon_copied);
            return;
        }
        if (msg.isSenderMe()) {
            if ($received.length) {
                let msg_state = msg.get('state');
                if (msg_state === constants.MSG_ERROR){
                    msg.set('state', constants.MSG_DELIVERED)
                    return;
                }
                if (msg_state !== constants.MSG_DISPLAYED) {
                    let delivered_time = $received.children('time').attr('stamp');
                    if (delivered_time) {
                        msg.set('time', pretty_datetime(delivered_time));
                        msg.set('timestamp', Number(delivered_time));
                    }
                }
                this.setMessagesDelivered(msg.get('timestamp'));
            } else {
                let msg_state = msg.get('state');
                if (msg_state === constants.MSG_ERROR){
                    msg.set('state', constants.MSG_DISPLAYED)
                    return;
                }
                this.setMessagesDisplayed(msg.get('timestamp'));
            }
        } else {
            msg.set('is_unread', false);
            if ($message.find('time').length && msg.get('ephemeral_timer')) {
                msg.set('displayed_time', $message.find('time').attr('stamp'));
                msg.collection.checkEphemeralTimers();
            }
        }
    },

    setMessagesDelivered: function (timestamp) {
        !timestamp && (timestamp = moment.now());
        let undelivered_messages = this.messages.filter(message => message.isSenderMe() && (message.get('timestamp') <= timestamp) && (message.get('state') > constants.MSG_PENDING) && (message.get('state') < constants.MSG_DELIVERED));
        if (!undelivered_messages.length) {
            let chat =  this.account.chats.get(this.id + ':encrypted');
            chat && (undelivered_messages = chat.messages.filter(message => message.isSenderMe() && (message.get('timestamp') <= timestamp) && (message.get('state') > constants.MSG_PENDING) && (message.get('state') < constants.MSG_DELIVERED)));
        }
        undelivered_messages.forEach(message => message.set('state', constants.MSG_DELIVERED));
    },

    setMessagesDisplayed: function (timestamp) {
        !timestamp && (timestamp = moment.now());
        let undelivered_messages = this.messages.filter(message => message.isSenderMe() && (message.get('timestamp') <= timestamp) && (message.get('state') > constants.MSG_PENDING) && (message.get('state') < constants.MSG_DISPLAYED));
        if (!undelivered_messages.length) {
            let chat =  this.account.chats.get(this.id + ':encrypted');
            chat && (undelivered_messages = chat.messages.filter(message => message.isSenderMe() && (message.get('timestamp') <= timestamp) && (message.get('state') > constants.MSG_PENDING) && (message.get('state') < constants.MSG_DISPLAYED)));
        }
        undelivered_messages.forEach(message => {
            message.set('state', constants.MSG_DISPLAYED);
            if (message.get('ephemeral_timer')){
                message.set('displayed_time', Date.now());
                message.collection.checkEphemeralTimers();
            }
        });
    },

    receiveCarbonsMarker: function ($marker) {
        let stanza_id = $marker.children(`stanza-id[by="${this.account.get('jid')}"]`).attr('id'),
            msg_id = $marker.attr('id'),
            msg = this.messages.find(m => stanza_id && (m.get('stanza_id') === stanza_id || m.get('contact_stanza_id') === stanza_id) || m.get('msgid') === msg_id), msg_idx;
        msg && (msg_idx = this.messages.indexOf(msg));
        if (!msg) {
            let enc_chat =  this.account.chats.get(this.id + ':encrypted'),
                enc_msg = enc_chat && enc_chat.messages.find(m => stanza_id && (m.get('stanza_id') === stanza_id || m.get('contact_stanza_id') === stanza_id) || m.get('msgid') === msg_id);
            if (enc_msg){
                enc_chat.receiveCarbonsMarker($marker);
                return;
            }
        }
        if (this.get('const_unread') && this.get('last_read_msg')){
            let last_read_msg_id = this.get('last_read_msg'),
                last_read_msg = this.messages.find(m => stanza_id && (m.get('stanza_id') === last_read_msg_id || m.get('contact_stanza_id') === last_read_msg_id)),
                deferred = new $.Deferred(),
                second_deferred = new $.Deferred(),
                new_last_read_msg = msg;
            second_deferred.done(() => {
                if (last_read_msg.get('timestamp') < new_last_read_msg.get('timestamp')){
                    this.set('last_read_msg', new_last_read_msg.get('stanza_id'))
                    this.trigger('update_last_read_msg');
                }
            });
            deferred.done(() => {
                if (!new_last_read_msg){
                    this.contact.getMessageByStanzaId(stanza_id, ($message) => {
                        new_last_read_msg = this.account.chats.receiveChatMessage($message, {is_archived: true});
                        second_deferred.resolve()
                    });
                } else {
                    second_deferred.resolve()
                }
            });
            if (!last_read_msg){
                this.contact.getMessageByStanzaId(last_read_msg_id, ($message) => {
                    last_read_msg = this.account.chats.receiveChatMessage($message, {is_archived: true});
                    deferred.resolve()
                });
            } else {
                deferred.resolve()
            }
        }
        if (msg_idx > -1) {
            for (let i = msg_idx; i >= 0; i--) {
                let message = this.messages.models[i];
                message.set('is_unread', false);
            }
        }
        else {
            let unread_msg = this.messages_unread.find(m => m.get('stanza_id') === stanza_id || m.get('contact_stanza_id') === stanza_id || m.get('msgid') === msg_id);
            unread_msg && unread_msg.set('is_unread', false);
        }
    },

    receiveDeliveryReceipt: function ($message) {
        let $received = $message.find('received'),
            delivered_origin_id = $received.attr('id'),
            delivered_stanza_id = $received.children(`stanza-id[by="${this.account.get('jid')}"]`).attr('id'),
            msg = this.account.messages.get(delivered_origin_id || delivered_stanza_id);
        if (!msg)
            return;
        msg.isSenderMe() && msg.set('state', constants.MSG_DELIVERED);
    },

    onPresence: function (type) {
        let jid = this.get('jid');
        if (!this.contact.get('group_chat') && !this.contact.get('in_roster')) {
            if (type === 'subscribe') {
                this.messages.createSystemMessage({
                    from_jid: jid,
                    auth_request: true,
                    message: xabber.getString("action_subscription_received")
                });
            }
        }
    },

    onRosterPush: function (type) {
        let jid = this.get('jid');
        // not used
        if (type === 'remove')
            this.messages.createSystemMessage({
                from_jid: jid,
                silent: false,
                message: xabber.getString("action_contact_deleted")
            });

    },

    retractMessages: function (msgs, group_chat, symmetric) {
        let msgs_responses = 0, count = msgs.length, dfd = new $.Deferred();
        dfd.done((num) => {
            if (num === 0) {
                utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
            }
            else if (num !== msgs.length) {
                utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
            }
        });
        $(msgs).each((idx, item) => {
            let stanza_id = item.get('stanza_id'),
                contact_stanza_id = item.get('contact_stanza_id');
            if (stanza_id || contact_stanza_id) {
                let iq_retraction = $iq({type: 'set', to: group_chat ? (this.contact.get('full_jid') || this.contact.get('jid')) : this.account.get('jid')})
                    .c('retract-message', {
                        id: (this.get('group_chat') && contact_stanza_id || stanza_id),
                        xmlns: Strophe.NS.REWRITE,
                        symmetric: symmetric,
                        type: this.get('sync_type') ? this.get('sync_type') : this.getConversationType(this),
                        by: this.account.get('jid')
                    });
                this.account.sendIQFast(iq_retraction, (success) => {
                        this.item_view.content.removeMessage(item);
                        msgs_responses++;
                        (msgs_responses === msgs.length) && dfd.resolve(count);
                    }, (error) => {
                        msgs_responses++;
                        if ($(error).find('not-allowed').length)
                            count--;
                        (msgs_responses === msgs.length) && dfd.resolve(count);
                    });
            }
        });
    },

    retractMessagesByUser: function (user_id) {
        let iq_retraction = $iq({type: 'set', to: this.contact.get('full_jid') || this.contact.get('jid')})
            .c('retract-user', {
                id: user_id,
                xmlns: Strophe.NS.REWRITE,
                type: this.get('sync_type') ? this.get('sync_type') : this.getConversationType(this),
                symmetric: true
            });
        this.account.sendIQFast(iq_retraction, (success) => {
            let user_msgs = this.messages.filter(msg => msg.get('user_info') && (msg.get('user_info').id == user_id));
            $(user_msgs).each((idx, msg) => {
                this.item_view.content.removeMessage(msg);
            });
        }, (error) => {
            if ($(error).find('not-allowed').length)
                utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
        });
    },

    retractAllMessages: function (symmetric, callback, errback) {
        let is_group_chat = this.get('group_chat'),
            iq_retraction = $iq({type: 'set', to: is_group_chat ? (this.contact.get('full_jid') || this.contact.get('jid')) : this.account.get('jid')}),
            retract_attrs = {
                xmlns: Strophe.NS.REWRITE,
                type: this.get('sync_type') ? this.get('sync_type') : this.getConversationType(this),
                symmetric: symmetric
        };
        retract_attrs.conversation = this.get('jid');
        this.get('encrypted') && (retract_attrs.type = 'encrypted');
        iq_retraction.c('retract-all', retract_attrs);
        this.account.sendIQFast(iq_retraction, (iq_response) => {
            let all_messages = this.messages.models;
            $(all_messages).each((idx, msg) => {
                this.item_view.content.removeMessage(msg);
            });
            callback && callback();
        }, (error) => {
            if ($(error).find('not-allowed').length)
                utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
            errback && errback();
        });
    },

    showBlockedRequestMessage: function () {
        if (this.messages.length)
            this.messages.createSystemMessage({
                from_jid: this.account.get('jid'),
                message: xabber.getString("action_contact_blocked"),
                time: this.messages.last().get('time')
            });
    },

    muteChat: function (muted_seconds) {
        let muted = this.isMuted(),
            is_muted = muted && muted !== '0' ? true : false,
            muted_value = is_muted ? '' : '0';
        if (muted_seconds || muted_seconds === '')
            muted_value = muted_seconds;
        let conversation_options = {
            jid: this.contact.get('jid'),
            mute: muted_value,
            type: this.get('sync_type') ? this.get('sync_type') : this.getConversationType(this)
        },
        iq = $iq({type: 'set', to: this.account.get('jid')})
            .c('query', {xmlns: Strophe.NS.SYNCHRONIZATION})
            .c('conversation', conversation_options);
        this.account.sendIQFast(iq);
    },

    getConversationType: function (chat) {
        if(chat.get('encrypted'))
            return Strophe.NS.SYNCHRONIZATION_OMEMO;
        if(chat.contact.get('group_chat'))
            return Strophe.NS.GROUP_CHAT;
        return Strophe.NS.SYNCHRONIZATION_REGULAR_CHAT
    },

    deleteFromSynchronization: function (callback, errback) {
        let conversation_options = {jid: this.get('jid'), status: 'deleted', type: this.get('sync_type') ? this.get('sync_type') : this.getConversationType(this) };
        this.account.cached_sync_conversations.removeFromCachedConversations(conversation_options.jid +  '/' + conversation_options.type);
        let iq = $iq({type: 'set', to: this.account.get('jid')})
            .c('query', {xmlns: Strophe.NS.SYNCHRONIZATION})
            .c('conversation', conversation_options);
        this.account.sendIQFast(iq, (success) => {
            callback && callback(success);
        }, (error) => {
            errback && errback(error);
        });
    }
});

xabber.ChatItemView = xabber.BasicView.extend({
    className: 'chat-item list-item',
    template: templates.chat_item,
    avatar_size: constants.AVATAR_SIZES.CHAT_ITEM,

    events: {
        'click': 'openByClick'
    },

    _initialize: function () {
        this.account = this.model.account;
        this.contact = this.model.contact;
        this.message_counter = 0;
        this.$el.attr('data-id', this.model.id);
        if (!this.model.sync_created)
            this.content = new xabber.ChatContentView({chat_item: this});
        this.content_placeholder = new xabber.ChatContentPlaceholderView();
        this.updateName();
        this.updateStatus();
        this.updateCounter();
        this.updateAvatar();
        this.updateMutedState();
        this.updatePinned();
        this.updateArchivedState();
        this.updateColorScheme();
        this.updateGroupChats();
        this.updateIcon();
        this.updateEncrypted();
        this.updateChatError();
        this.model.on("change:active", this.updateActiveStatus, this);
        this.model.on("change:unread", this.updateCounter, this);
        this.model.on("change:encrypted", this.updateEncrypted, this);
        this.model.on("change:const_unread", this.updateCounter, this);
        this.model.on("change:pinned", this.updatePinned, this);
        this.model.on("change:archived", this.updateArchivedState, this);
        this.model.on("change:muted", this.updateMutedState, this);
        this.model.on("open", this.open, this);
        this.model.on("remove_opened_chat", this.onClosed, this);
        this.model.messages.on("add", this.updateChatCard, this);
        this.model.messages.on("destroy", this.onMessageRemoved, this);
        this.model.messages.on("change:state", this.onChangedMessageState, this);
        if (this.contact) {
            this.updateIncomingSubscription();
            this.contact.on("change:name", this.updateName, this);
            this.contact.on("change:invitation", this.updateIncomingSubscription, this);
            this.contact.on("change:subscription", this.updateIncomingSubscription, this);
            this.contact.on("change:subscription_request_in", this.updateIncomingSubscription, this);
            this.contact.on("change:subscription_request_out", this.updateIncomingSubscription, this);
            this.contact.on("change:status", this.updateStatus, this);
            this.contact.on("change:private_chat", this.updateIcon, this);
            this.contact.on("change:invitation", this.updateIcon, this);
            this.contact.on("change:incognito_chat", this.updateIcon, this);
            this.contact.on("change:image", this.updateAvatar, this);
            this.contact.on("change:blocked", this.onBlocked, this);
            this.contact.on("change:group_chat", this.updateGroupChats, this);
            this.contact.on("change:in_roster", this.updateAcceptedStatus, this);
            this.contact.on("remove_invite", this.removeInvite, this);
            this.contact.on("update_trusted", this.updateEncryptedColor, this);
        }
        this.$el.switchClass('saved-chat', this.model.get('saved'));
        this.$el.find('.circle-avatar').switchClass('ground-color-700', this.model.get('saved'));
        this.model.get('saved') && this.$el.find('.circle-avatar').html(env.templates.svg['saved-messages']());
        this.account.settings.on("change:color", this.updateColorScheme, this);
    },

    render: function () {
        if (this.model.get('saved') && (this.$('.chat-title').text() !== xabber.getString("saved_messages__header"))) {
            this.$('.chat-title').text(xabber.getString("saved_messages__header"));
        }
    },

    updateChatCard: function (msg) {
        if (this.content){
            return;
        }
        if (this.message_counter == 0 && !(!msg.get('synced_from_server') && msg.get('encrypted') && this.model.get('encrypted'))){
            this.message_counter++;
            return
        }
        this.content = new xabber.ChatContentView({ chat_item: this, new_message: msg });
        this.updateLastMessage(msg);
        return;
    },

    onChangedMessageState: function (message) {
        if (message.get('state') === constants.MSG_DISPLAYED && this.model.get('last_displayed_id') < message.get('stanza_id')) {
            this.model.set('last_displayed_id', message.get('stanza_id'));
            this.model.set('last_delivered_id', message.get('stanza_id'));
        } else if (message.get('state') === constants.MSG_DELIVERED && this.model.get('last_delivered_id') < message.get('stanza_id')) {
            this.model.set('last_delivered_id', message.get('stanza_id'));
        }
        if (this.content) {
            let $message = this.content.$(`.chat-message[data-uniqueid="${message.get('unique_id')}"]`),
                $elem = $message.find('.msg-delivering-state');
            $elem.attr({
                'data-state': message.getState(),
                'title': message.getVerboseState()
            });
            ($elem.attr('data-state') === constants.MSG_STATE[constants.MSG_ERROR]) && $elem.dropdown({
                inDuration: 100,
                outDuration: 100,
                constrainWidth: false,
                hover: false,
                alignment: 'left'
            });
        }
        if (message === this.model.last_message) {
            this.updateLastMessage();
        }
        this.updateChatError();
    },

    updateName: function () {
        if (this.model.get('saved')) {
            this.$('.chat-title').text(xabber.getString("saved_messages__header"));
            return;
        }
        this.$('.chat-title').text(this.contact.get('name'));
    },

    updateStatus: function () {
        if (this.model.get('saved'))
            return;
        let status = this.contact.get('status');
        this.$('.status').attr('data-status', status);
        this.$('.chat-icon').attr('data-status', status);
    },

    updateActiveStatus: function () {
        this.$el.switchClass('active', this.model.get('active'));
        this.updateLastMessage();
    },

    updateAcceptedStatus: function () {
        let in_roster = this.contact.get('in_roster');
        if (in_roster)
            this.model.set('is_accepted', true);
    },

    onBlocked: function () {
        this.updateIcon();
        this.$el.switchClass('blocked', this.model.get('blocked'));
    },

    updateCounter: function () {
        let unread = this.model.get('unread') + this.model.get('const_unread');
        this.$('.msg-counter').showIf(unread).text(unread || '');
        this.updateTextClipping();
    },

    updateIncomingSubscription: function () {
        this.$('.msg-incoming-subscription').showIf(this.contact.get('invitation') || (this.contact.get('subscription_request_in') && this.contact.get('subscription') != 'both'));
        this.updateTextClipping();
    },

    updateChatError: function () {
        let error_msgs = this.model.messages.filter(m => m.get('state') === -1)
        this.$('.msg-chat-error').showIf(error_msgs.length);
        this.updateTextClipping();
    },

    updateTextClipping: function () {
        let indicators_count = this.$('.chat-item-notifications-wrap').children(':not(.hidden)').length;
        this.$('.last-msg').switchClass('triple-indicators', indicators_count === 3)
        this.$('.last-msg').switchClass('quad-indicators', indicators_count === 4)
    },

    updateAvatar: function () {
        if (this.model.get('saved'))
            return;
        let image = this.contact.cached_image;
        this.$('.circle-avatar').setAvatar(image, this.avatar_size);
    },

    updateEncrypted: function () {
        this.$el.switchClass('encrypted', this.model.get('encrypted'));
    },

    updatePinned: function () {
        let is_pinned = this.model.get('pinned');
        this.$('.pinned-icon').showIf(is_pinned && is_pinned !== '0');
        if (is_pinned)
            xabber.chats_view.updateChatPosition(this.model);
    },

    updateEncryptedColor: function (encrypted) {
        this.$el.attr('data-trust', encrypted);
    },

    updateIcon: function () {
        if (!this.contact)
            return;
        this.$('.chat-icon').addClass('hidden');
        let ic_name = this.contact.getIcon();
        ic_name && this.$('.chat-icon').removeClass('hidden group-invite blocked').switchClass(ic_name, (ic_name == 'group-invite' || ic_name == 'server' || ic_name == 'blocked')).html(env.templates.svg[ic_name]());
    },

    updateMutedState: function () {
        if (!this.contact)
            return;
        this.$('.msg-counter').switchClass('muted-chat-counter', this.model.isMuted());
        this.$('.muted-icon').switchClass('mdi-bell-off', (this.model.isMuted() > 4800000000)).switchClass('mdi-bell-sleep', (this.model.isMuted() <= 4800000000));
        this.$('.muted-icon').showIf(this.model.isMuted());
    },

    updateArchivedState: function () {
        if (!this.contact)
            return;
        let archived = this.model.get('archived');
        if (archived || (!archived && xabber.toolbar_view.$('.active').hasClass('archive-chats')))
            this.$el.detach();
        if (archived && xabber.toolbar_view.$('.active').hasClass('archive-chats') || !archived && !xabber.toolbar_view.$('.active').hasClass('archive-chats'))
            xabber.chats_view.updateChatPosition(this.model);
    },

    updateGroupChats: function () {
        if (!this.contact)
            return;
        let is_group_chat = this.contact.get('group_chat');
        this.$('.status').hideIf(is_group_chat);
        this.$('.chat-icon').showIf(is_group_chat);
        this.updateIcon();
        if (is_group_chat) {
            this.$el.addClass('group-chat');
            this.model.set('group_chat', true);
        }
    },

    updateColorScheme: function () {
        let color = this.account.settings.get('color');
        this.$el.attr('data-color', color);
    },

    onMessageRemoved: function (msg) {
        if (this.model.last_message === msg) {
            let last_message;
            for (let idx = this.model.messages.length-1; idx >= 0; idx--) {
                last_message = this.model.messages.at(idx);
                if (!last_message.get('silent'))
                    break;
            }
            this.model.last_message = last_message;
            this.updateLastMessage();
        }
        this.deletePlayersFromMessage(msg);
    },

    deletePlayersFromMessage: function (message) {
        let players = []
        message.get('msg_player_videos') && (players = players.concat(message.get('msg_player_videos')));
        message.get('msg_player_audios') && (players = players.concat(message.get('msg_player_audios')));
        if (players.length){
            if (xabber.current_plyr_player){
                let is_current_player = xabber.current_plyr_player.is_popup ?
                    players.includes(xabber.current_plyr_player.chat_item.model.plyr_players[xabber.current_plyr_player.player_index])
                    : players.includes(xabber.current_plyr_player);

                if (is_current_player){
                    xabber.plyr_players.forEach((item) => {
                        if (item.$audio_elem){
                            if (item.$audio_elem.voice_message)
                                item.$audio_elem.voice_message.stopTime()
                        }
                        else
                            item.stop();
                    })
                    if (xabber.current_plyr_player.is_popup && xabber.plyr_player_popup){
                        xabber.plyr_player_popup.closePopup();
                    } else {
                        xabber.current_plyr_player = null;
                        xabber.trigger('plyr_player_updated');
                    }
                }
            }
            this.model.plyr_players = this.model.plyr_players.filter((obj) => !players.includes(obj));
            xabber.plyr_players = xabber.plyr_players.filter((obj) => !players.includes(obj));
            xabber.trigger('plyr_player_updated');
        }
    },

    updateEmptyChat: function () {
        let msg_time = this.model.get('timestamp'),
            is_empty = Number(this.model.get('last_delivered_id')) || Number(this.model.get('last_displayed_id')) || Number(this.model.get('last_read_msg'));
        this.$('.last-msg').html(xabber.getString(is_empty ? "recent_chat__last_message_retracted" : "no_messages").italics());
        this.$('.last-msg-date').text(utils.pretty_short_datetime_recent_chat(msg_time))
            .attr('title', pretty_datetime(msg_time));
    },

    updateEncryptedChat: function () {
        let msg_time = this.model.get('timestamp');
        this.$('.last-msg').html(xabber.getString("recent_chat__decrypting_messages").italics());
        this.$('.last-msg-date').text(utils.pretty_short_datetime_recent_chat(msg_time))
            .attr('title', pretty_datetime(msg_time));
    },

    updateLastMessage: function (msg) {
        msg || (msg = this.model.last_message);
        if (!this.model.get('active') && this.model.item_view && this.model.item_view.content && this.model.item_view.content.bottom && this.model.item_view.content.bottom.$('.input-message .rich-textarea').getTextFromRichTextarea().trim()){
            let draft_message = this.model.item_view.content.bottom.$('.input-message .rich-textarea').getTextFromRichTextarea();
            this.$('.last-msg').html(draft_message).prepend($(`<span class="text-color-700">${xabber.getString("draft")}: </span>`));
            this.$el.emojify('.last-msg', {emoji_size: 16}).hyperlinkify({decode_uri: true});
            msg && this.model.set({timestamp: msg.get('timestamp')});
            return;
        }
        if (!msg) {
            !this.model.messages.length && this.updateEmptyChat();
            return;
        }
        let msg_time = msg.get('time'),
            timestamp = msg.get('timestamp'), msg_from = "",
            forwarded_message = msg.get('forwarded_message'),
            msg_files = msg.get('files') || [],
            msg_images = msg.get('images') || [],
            msg_locations = msg.get('locations') || [],
            msg_text = forwarded_message ? (msg.get('message') || xabber.getQuantityString("forwarded_messages_count", forwarded_message.length).italics()) : msg.getText(),
            msg_user_info = msg.get('user_info') || msg.isSenderMe() && this.contact && this.contact.my_info && this.contact.my_info.attributes || {};
        msg.get('videos') && msg.get('videos').length && (msg_files = msg_files.concat(msg.get('videos')));
        this.model.set({timestamp: timestamp});
        if (this.model.get('group_chat'))
            msg_from = msg_user_info.nickname || msg_user_info.jid || (msg.isSenderMe() ? this.account.get('name') : msg.get('from_jid')) || "";
        msg_from && (msg_from = $('<span class="text-color-700"/>').text(msg_from + ': '));
        if (msg_files.length || msg_images.length || msg_locations.length) {
            let $colored_span = $('<span class="text-color-500"/>');
            if (msg.get('type') === 'file_upload') {
                msg_images = msg_files.filter(f => f && f.type && utils.isImageType(f.type));
                msg_files = msg_files.filter(f => f && !(f.type && utils.isImageType(f.type)));
            }
            if (msg_files.length && msg_images.length)
                msg_text = $colored_span.text(xabber.getString("recent_chat__last_message__attachments", [msg_files.length + msg_images.length]));
            else {
                if (msg_files.length == 1 && (msg_files[0].is_audio || msg_files[0].voice))
                    msg_text = $colored_span.text(`${xabber.getString("voice_message")}, ` + utils.pretty_duration(msg_files[0].duration));
                else if (msg_files.length > 0) {
                    let total_size = 0;
                    msg_files.forEach((f) => {total_size+=Number(f.size)});
                    msg_text = $colored_span.text(xabber.getQuantityString("recent_chat__last_message__files", msg_files.length) + (total_size > 0 ? `, ${utils.pretty_size(total_size)}` : ""));
                }
                if (msg_images.length > 0) {
                    let total_size = 0;
                    msg_images.forEach((f) => {total_size+=Number(f.size)});
                    msg_text = $colored_span.text(xabber.getQuantityString("recent_chat__last_message__images", msg_images.length) + (total_size > 0 ? `, ${utils.pretty_size(total_size)}` : ""));
                }
                if (msg_locations.length > 0) {
                    msg_text = $colored_span.text(xabber.getQuantityString("recent_chat__last_message__locations", msg_locations.length));
                }
            }
            this.$('.last-msg').html("").append(msg_from).append(msg_text);
        }
        else {
            if (msg.get('type') == 'system') {
                msg_from = "";
                if (msg.get('invite'))
                    msg_text = xabber.getString("groupchat_invitation_to_group_chat", [(this.contact && this.contact.get('incognito_chat')) ? 'incognito' : 'public']);
                msg.get('private_invite') && (msg_text = xabber.getString("recent_chat__last_message__private_invitation"));
                if (this.model.get('group_chat'))
                    msg_text = $('<i/>').text(msg_text);
                else
                    msg_text = $('<span class=text-color-500/>').text(msg_text);
                this.$('.last-msg').html(msg_text);
                if (msg.get('auth_request')){
                    xabber.toolbar_view.recountAllMessageCounter();
                }
            }
            else {
                if (forwarded_message) {
                    if (msg.get('message')) {
                        msg_text = msg.get('message');
                        this.$('.last-msg').text(msg_text);
                    }
                    else {
                        let first_forwarded_msg = forwarded_message[0];
                        if (first_forwarded_msg.get('message')) {
                            let fwd_msg_files = first_forwarded_msg.get('files') || [],
                                fwd_msg_images = first_forwarded_msg.get('images') || [],
                                fwd_msg_locations = first_forwarded_msg.get('locations') || [];
                            first_forwarded_msg.get('videos') && first_forwarded_msg.get('videos').length && (fwd_msg_files = fwd_msg_files.concat(first_forwarded_msg.get('videos')));
                            if (fwd_msg_files.length || fwd_msg_images.length || fwd_msg_locations.length) {
                                let $colored_span = $('<span class="text-color-500"/>');
                                if (msg.get('type') === 'file_upload') {
                                    fwd_msg_images = fwd_msg_files.filter(f => f.type && utils.isImageType(f.type));
                                    fwd_msg_files = fwd_msg_files.filter(f => !(f.type && utils.isImageType(f.type)));
                                }
                                if (fwd_msg_files.length && fwd_msg_images.length)
                                    msg_text = $colored_span.text(xabber.getString("recent_chat__last_message__attachments", [fwd_msg_files.length + fwd_msg_images.length]));
                                else {
                                    if (fwd_msg_files.length == 1 && (fwd_msg_files[0].is_audio || fwd_msg_files[0].voice))
                                        msg_text = $colored_span.text(`${xabber.getString("voice_message")}, ` + utils.pretty_duration(fwd_msg_files[0].duration));
                                    else if (fwd_msg_files.length > 0) {
                                        let total_size = 0;
                                        fwd_msg_files.forEach((f) => {total_size+=Number(f.size)});
                                        msg_text = $colored_span.text(xabber.getQuantityString("recent_chat__last_message__files", fwd_msg_files.length) + (total_size > 0 ? `, ${utils.pretty_size(total_size)}` : ""));
                                    }
                                    if (fwd_msg_images.length > 0) {
                                        let total_size = 0;
                                        fwd_msg_images.forEach((f) => {total_size+=Number(f.size)});
                                        msg_text = $colored_span.text(xabber.getQuantityString("recent_chat__last_message__images", fwd_msg_images.length) + (total_size > 0 ? `, ${utils.pretty_size(total_size)}` : ""));
                                    }
                                    if (fwd_msg_locations.length > 0) {
                                        msg_text = $colored_span.text(xabber.getQuantityString("recent_chat__last_message__locations", fwd_msg_locations.length));
                                    }
                                }
                                if (this.model.get('group_chat')) {
                                    this.$('.last-msg').html("").append(msg_from).append('» ').append(msg_text);
                                } else {
                                    this.$('.last-msg').html("» ").append(msg_text);
                                }
                            } else if (this.model.get('group_chat')) {
                                msg_text = first_forwarded_msg.get('message');
                                msg_text = '» ' + msg_text;
                                this.$('.last-msg').text(msg_text);
                            } else {
                                msg_text = first_forwarded_msg.get('message');
                                this.$('.last-msg').text(msg_text);
                                msg_from = '» ';
                            }
                        }
                        else {
                            if (forwarded_message.length === 1) {
                                let fwd_msg_txt = xabber.getQuantityString("forwarded_messages_count", forwarded_message.length).slice(2)
                                fwd_msg_txt = fwd_msg_txt.charAt(0).toUpperCase() + fwd_msg_txt.slice(1)
                                msg_text = $('<i/>').text(fwd_msg_txt);
                                this.$('.last-msg').html('» ').append(msg_text);
                            }
                            else {
                                msg_text = $('<i/>').text(xabber.getQuantityString("forwarded_messages_count", forwarded_message.length));
                                this.$('.last-msg').html('» ').append(msg_text);
                            }
                        }
                    }
                }
                else {
                    msg_text = msg.getText();
                    this.$('.last-msg').text(msg_text);
                }
            }
            this.$('.last-msg').prepend(msg_from);
        }
        if (msg.get('not_encrypted'))
            this.$('.last-msg').html(this.$('.last-msg').html().italics());
        this.$el.emojify('.last-msg', {emoji_size: 16}).hyperlinkify({decode_uri: true});
        this.$('.last-msg-date').text(utils.pretty_short_datetime_recent_chat(msg_time))
            .attr('title', pretty_datetime(msg_time));
        this.$('.msg-delivering-state').showIf(msg.get('type') !== 'system' && msg.isSenderMe() && (msg.get('state') !== constants.MSG_ARCHIVED))
            .attr('data-state', msg.getState());
    },

    openByClick: function () {
        this.open();
    },

    open: function (options) {
        if (!this.content){
            this.content = new xabber.ChatContentView({chat_item: this});
        }
        options || (options = {right_contact_save: true, clear_search: false});
        xabber.chats_view.openChat(this, options);
        this.content.bottom.click_counter = 0;
        this.content.bottom.setDefaultPlaceholder();
    },

    removeInvite: function (options) {
        if (!this.account.server_features.get(Strophe.NS.REWRITE))
            return;
        options || (options = {});
        let msgs = _.clone(this.model.messages.models);
        this.model.set({'last_archive_id': undefined, 'first_archive_id': undefined});
        msgs.forEach((item) => {
            if (item.get('invite')) {
                let iq_retraction = $iq({type: 'set', to: this.account.get('jid')})
                    .c('retract-message', {
                        id: item.get('stanza_id'),
                        xmlns: Strophe.NS.REWRITE,
                        type: Strophe.NS.SYNCHRONIZATION_REGULAR_CHAT,
                        symmetric: false,
                    });
                this.account.sendIQFast(iq_retraction);
                item && this.content.removeMessage(item);
            }
        });
        this.model.recountUnread();
        delete this.contact.attributes.invitation;
        this.updateIcon();
    },

    onClosed: function () {
        this.parent.onChatRemoved(this.model, {soft: true});
    }
});

  xabber.MessagesView = xabber.BasicView.extend({
      template: templates.chat_content,
      ps_selector: '.chat-content',
      ps_settings: {
          wheelPropagation: true
      },
      avatar_size: constants.AVATAR_SIZES.CHAT_MESSAGE,

      _initialize: function (options) {
          this.model = options.model;
          this.contact = options.contact;
          this.account = this.model.account;
          let color = this.account.settings.get('color');
          this.$el.attr('data-color', color);
          this.$search_form = this.$('.search-form-header');
          this.loading_history = false;
          this.history_loaded = false;
          this.first_msg_id = 0;
          this.last_msg_id = 0;
          this._scrolltop = this.getScrollTop();
          this.ps_container.on("ps-scroll-up ps-scroll-down", this.onScroll.bind(this));
          this.chat_content = options.chat_content || this.model.item_view.content;
          let wheel_ev = this.defineMouseWheelEvent();
          this.$el.on(wheel_ev, this.onMouseWheel.bind(this));
          this.$('.back-to-bottom').click(this.backToBottom.bind(this));
      },

      defineMouseWheelEvent: function () {
          if (!_.isUndefined(window.onwheel)) {
              return "wheel";
          } else if (!_.isUndefined(window.onmousewheel)) {
              return "mousewheel";
          } else {
              return "MozMousePixelScroll";
          }
      },

      keyupSearch: function (ev) {
          if (ev.keyCode === constants.KEY_ENTER) {
              let query = this.$search_form.find('input').val();
              this.model.searchMessages(query, (messages) => {
              });
          }
          if (ev.keyCode === constants.KEY_ESCAPE && !xabber.body.screen.get('right_contact')) {
              this.chat_content.head.renderSearchPanel();
          }
      },

      onMouseWheel: function (ev) {
          this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
      },

      onClickMessage:function (ev) {
          this.chat_content.onClickMessage(ev);
      },

      onClickLink:function (ev) {
          this.chat_content.onClickLink(ev);
      },

      onClickLocationLink:function (ev) {
          this.chat_content.onClickLocationLink(ev);
      },

      onClickLocation:function (ev) {
          this.chat_content.onClickLocation(ev);
      },

      onHoverLocation:function (ev) {
          this.chat_content.onHoverLocation(ev);
      },

      onScroll: function () {
          this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
          this._prev_scrolltop = this._scrolltop || this._prev_scrolltop || 0;
          this._scrolltop = this.getScrollTop() || this._scrolltop || this._prev_scrolltop || 0;
          if (!this.history_loaded && !this.loading_history && (this._scrolltop < this._prev_scrolltop) && (this._scrolltop < 100 || this.getPercentScrolled() < 0.1)) {
              this.loading_history = true;
              this.messagesRequest({before: this.first_msg_id}, () => {
                  this.loading_history = false;
              });
          }
      },

      backToBottom: function () {
          this.openChat();
          this.scrollToBottom();
          this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
      },

      messagesRequest: function () {},

      emptyChat: function () {
          this.$('.chat-content').html($('<span class="error"/>').text(xabber.getString("no_messages")));
      },

      openChat: function () {
          this.model.item_view.open({right_contact_save: true, clear_search: false});
      },

      addMessageHTML: function ($message, msg, index, last_index) {
          let scrolled_from_top,
              scrolled_from_bottom = this.getScrollBottom();
          if (index === 0)
              $message.prependTo(this.$('.chat-content'));
          else
              $message.insertAfter(this.$('.chat-message').eq(index - 1));
          if (index === last_index)
              scrolled_from_top = this.getScrollTop();
          let $next_message = $message.nextAll('.chat-message').first();
          this.chat_content.updateMessageInChat($message[0], msg);
          if ($next_message.length) {
              this.chat_content.updateMessageInChat($next_message[0]);
          }
          this.chat_content.initPopup($message);
          if (scrolled_from_top)
              this.scrollTo(scrolled_from_top);
          else
              this.scrollTo(this.ps_container[0].scrollHeight - this.ps_container[0].offsetHeight - scrolled_from_bottom);
          return $message;
      }

  });

  xabber.MessageContextView = xabber.MessagesView.extend({
      className: 'chat-content-wrap messages-context-wrap',

      events: {
          'click .chat-message': 'onClickMessage',
          'click .chat-msg-location-content': 'onClickLocation',
          'mouseover .chat-msg-location-content.no-title': 'onHoverLocation',
          'click .mdi-link-variant': 'onClickLink',
          'click .msg-copy-location' : 'onClickLocationLink',
          "keyup .messages-search-form": "keyupSearch"
      },

      __initialize: function (options) {
          options = options || {};
          this.stanza_id = options.stanza_id_context;
          this.encrypted = options.encrypted;
          this.mention_context = options.mention_context;
          if (!this.model.item_view.content)
              this.chat_content = new xabber.ChatContentView({chat_item: this.model.item_view});
          this.$history_feedback = this.$('.load-history-feedback');
          this.account.context_messages = new xabber.Messages(null, {account: this.account});
          this.account.context_messages.on("change:last_replace_time", this.chat_content.updateMessage, this);
          this.account.context_messages.on("add", this.addMessage, this);
          this.account.context_messages.on("change:is_unread", this.onChangedReadState, this);
          xabber.on('plyr_player_updated', this.onUpdatePlyr, this);
      },

      render: function () {
          this.scrollToTop();
          this.onUpdatePlyr();
          this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
          this.encrypted && this.$el.attr('data-trust', true)
      },

      onMouseWheel: function (ev) {
          if (!this.loading_history)
              if (ev.originalEvent.deltaY < 0) {
                  if (!this.first_history_loaded) {
                      this.loading_history = true;
                      this.messagesRequest({before: this.first_msg_id}, () => {
                          this.loading_history = false;
                      });
                  }
              }
              else {
                  if (!this.last_history_loaded) {
                      this.loading_history = true;
                      this.messagesRequest({after: this.last_msg_id}, () => {
                          this.loading_history = false;
                      });
                  }
              }
          this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
      },

      onScroll: function () {
          this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
          this._prev_scrolltop = this._scrolltop || this._prev_scrolltop || 0;
          this._scrolltop = this.getScrollTop() || this._scrolltop || this._prev_scrolltop || 0;
          this._scrollbottom = this.getScrollBottom();

          if (!this.loading_history)
              if (!this.first_history_loaded && (this._scrolltop < this._prev_scrolltop) && (this._scrolltop < 100 || this.getPercentScrolled() < 0.1)) {
                  this.loading_history = true;
                  this.showHistoryFeedback();
                  this.messagesRequest({before: this.first_msg_id}, () => {
                      this.loading_history = false;
                      this.hideHistoryFeedback();
                  });
              }
              else {
                  if (!this.last_history_loaded && (this._scrolltop > this._prev_scrolltop) && (this._scrollbottom < 100 || this.getPercentScrolled() > 0.9)) {
                      this.loading_history = true;
                      this.showHistoryFeedback();
                      this.messagesRequest({after: this.last_msg_id}, () => {
                          this.loading_history = false;
                          this.hideHistoryFeedback();
                      });
                  }
              }

          clearTimeout(this._onscroll_read_messages_timeout);
          this._onscroll_read_messages_timeout = setTimeout(() => {
              this.chat_content.readVisibleMessages(true);
          }, 100)
      },

      onChangedReadState: function (message) {
          let is_unread = message.get('is_unread'),
              $msg = this.$(`.chat-message[data-uniqueid="${message.get("unique_id")}"]`);
          if (is_unread) {
              $msg.addClass('unread-message');
              $msg.addClass('unread-message-background');
          } else {
              $msg.removeClass('unread-message');
              setTimeout(() => {
                  $msg.removeClass('unread-message-background');
              }, 1000);
          }
      },

      showHistoryFeedback: function () {
          this.$history_feedback.text(xabber.getString("loading_history")).removeClass('hidden');
      },

      hideHistoryFeedback: function () {
          this.$history_feedback.addClass('hidden');
      },

      messagesRequest: function (query, callback) {
          let messages = [],
              options = query || {},
              queryid = uuid();
          !options.max && (options.max = xabber.settings.mam_messages_limit);
          !options.after && !options.before && (options.before = '');
          let handler = this.account.connection.addHandler((message) => {
              let $msg = $(message);
              if ($msg.find('result').attr('queryid') === queryid)
                  messages.push(message);
              return true;
          }, Strophe.NS.MAM);
          this.chat_content.MAMRequest(options, (success, messages, rsm) => {
                  this.account.connection.deleteHandler(handler);
                  rsm && (this.first_msg_id = rsm.first) && (this.last_msg_id = rsm.last);
                  if (options.after && (messages.length < options.max))
                      this.last_history_loaded = true;
                  if (options.before && (messages.length < options.max))
                      this.first_history_loaded = true;
                  $(messages).each((idx, message) => {
                      let $message = $(message);
                      this.account.chats.receiveChatMessage($message, {context_message: true});
                  });
                  callback && callback();
              }, () => {
                  this.account.connection.deleteHandler(handler);
              }
          );
      },

      addMessage: function (message) {
          if (message.get('auth_request'))
              return;
          if (this.mention_context && (message.get('stanza_id') === this.stanza_id)) {} else message.set('is_archived', true);

          let msg_item = this.model.messages.find(msg => msg.get('stanza_id') == message.get('stanza_id') || msg.get('contact_stanza_id') == message.get('stanza_id'));
          if (msg_item) {
              msg_item.get('is_unread') && message.set('is_unread', msg_item.get('is_unread'));
              msg_item.get('is_unread_archived') && message.set('is_unread_archived', msg_item.get('is_unread_archived'));
          }

          let $message = this.chat_content.buildMessageHtml(message).addClass('context-message'),
              index = this.account.context_messages.indexOf(message);
          if (message.get('stanza_id') === this.stanza_id) {
              $message.addClass('message-from-context');
              setTimeout(() => {
                  $message.removeClass('message-from-context')
              }, 3000);
          }
          this.addMessageHTML($message, message, index, this.account.context_messages.findLastIndex());
      },

      onUpdatePlyr: function (ev) {
          this.$('.plyr-video-container').removeClass('active-plyr-container');
          if (xabber.current_plyr_player && xabber.current_plyr_player.player_item) {
              let $message = this.$(`.chat-message[data-uniqueid="${xabber.current_plyr_player.message_unique_id}"]`);
              if ($message.length) {
                  $message.find(`.plyr-video-container[data-message-id="${xabber.current_plyr_player.player_item.message_id}"]`).addClass('active-plyr-container');
              }
          }
      },
  });

  xabber.SearchedMessagesView = xabber.MessagesView.extend({
      className: 'chat-content-wrap searched-messages-wrap',

      events: {
          'click .chat-message': 'onClickMessage',
          'click .chat-msg-location-content': 'onClickLocation',
          'mouseover .chat-msg-location-content.no-title': 'onHoverLocation',
          'click .mdi-link-variant': 'onClickLink',
          'click .msg-copy-location' : 'onClickLocationLink',
          "click .btn-cancel-searching": "openChat",
          "keyup .messages-search-form": "keyupSearch"
      },

      __initialize: function (options) {
          this.query_text = options.query_text;
          this.account.searched_messages = new xabber.Messages(null, {account: this.account});
          this.account.searched_messages.on("change:last_replace_time", this.chat_content.updateMessage, this);
          this.account.searched_messages.on("add", this.addMessage, this);
          return this;
      },

      render: function () {
          this.$search_form.find('input').val(this.query_text);
          this.$search_form.slideToggle(10, () => {
              if (this.$search_form.css('display') !== 'none')
                  this.$search_form.find('input').focus();
              this.scrollToBottom();
          });
          this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
      },

      messagesRequest: function (query, callback) {
          let messages = [],
              options = query || {},
              queryid = uuid();
          _.extend(options, {
              max: xabber.settings.mam_messages_limit,
              before: query.before || '',
              var: [{var: 'withtext', value: this.query_text}]
          });
          let handler = this.account.connection.addHandler((message) => {
              let $msg = $(message);
              if ($msg.find('result').attr('queryid') === queryid)
                  messages.push(message);
              return true;
          }, Strophe.NS.MAM);
          this.chat_content.MAMRequest(options, (success, messages, rsm) => {
                  this.account.connection.deleteHandler(handler);
                  rsm && (this.first_msg_id = rsm.first);
                  if (!messages.length && !this.account.searched_messages.length) {
                      this.emptyChat();
                  }
                  if (messages.length < options.max)
                      this.history_loaded = true;
                  $(messages).each((idx, message) => {
                      let $message = $(message);
                      this.account.chats.receiveChatMessage($message, {searched_message: true});
                  });
                  callback && callback();
              }, () => {
                  this.account.connection.deleteHandler(handler);
              }
          );
      },

      addMessage: function (message) {
          if (message.get('auth_request'))
              return;
          message.set('is_archived', true);
          let $message = this.chat_content.buildMessageHtml(message).addClass('searched-message'),
              index = this.account.searched_messages.indexOf(message);
          this.addMessageHTML($message, message, index);
      }
  });

  xabber.ContactSearchedMessagesView = xabber.MessagesView.extend({
      template: templates.chat_content_contact,
      ps_settings: {
          wheelPropagation: true
      },
      avatar_size: constants.AVATAR_SIZES.CHAT_MESSAGE,
      className: 'chat-content-wrap searched-messages-wrap',

      events: {
          'click .chat-message': 'onClickMessage',
          'click .chat-msg-location-content': 'onClickLocation',
          'mouseover .chat-msg-location-content.no-title': 'onHoverLocation',
          'click .mdi-link-variant': 'onClickLink',
          'click .msg-copy-location' : 'onClickLocationLink',
          "click .btn-cancel-searching": "openChat",
          "keyup .messages-search-form": "keyupSearch",
          "click .close-search-icon": "clearSearch",
          'click .btn-back': 'hideSearch'
      },

      _initialize: function (options) {
          this.model = options.model;
          this.contact = options.contact;
          this.account = this.model.account;
          this.$search_form = this.$('.search-form-header');
          this.timer = null;
          this.loading_history = false;
          this.history_loaded = false;
          this.first_msg_id = 0;
          this.last_msg_id = 0;
          this.chat_content = options.chat_content || this.model.item_view.content;
          this.parent.model.set('search_hidden', true)
          return this;
      },

      render: function () {
          if (this.account.searched_messages)
              this.searched_messages = this.account.searched_messages
          this.account.searched_messages = new xabber.Messages(null, {account: this.account});
          if (this.searched_messages)
              this.account.searched_messages.add(this.searched_messages.toJSON(), {silent : true});
          this.account.searched_messages.on("add", this.addMessage, this);
          if (this.parent.model.get('saved_search_panel')) {
              this.$el.html(this.parent.model.get('saved_search_panel'));
              this.model.set('saved_search_panel', undefined);
          }
          else {
              this.emptyChat();
              this.$el.html(this.template());
              this.emptyChat();
              if (this.parent.model.get('search_hidden'))
                  this.hideSearch();
          }
          this.ps_container = this.$('.search-messages-content-wrap');
          if (this.ps_container.length) {
              this.ps_container.perfectScrollbar(
                  _.extend(this.ps_settings || {}, xabber.ps_settings)
              );
          }
          this.$search_form = this.$('.search-form-header');
          if (this.parent.model.get('saved_search_panel')) {
              this.$search_form.find('input').focus();
              if (this.parent.model.get('saved_search_panel_scroll'))
                  this.scrollTo(this.parent.model.get('saved_search_panel_scroll'));
          }
      },

      clearSearch: function () {
          this.$search_form.find('input').val('');
          this.emptyChat();
      },


      keyupSearch: function (ev) {
          this.$('.close-search-icon').hideIf(!this.$search_form.find('input').val());
          if (ev.keyCode === constants.KEY_ENTER) {
              this.emptyChat();
              let query = this.$search_form.find('input').val();
              this.$('.preloader-wrap').hideIf(false);
              this.loading_timestamp = Number(moment.now());
              this.messagesRequest(query, this.loading_timestamp, undefined, [], (messages, rsm) => {
              });
          }
      },

      emptyChat: function () {
          if (this.account.searched_messages)
              this.account.searched_messages.reset();
          this.$('.chat-content').html('');
          this.$('.messages-count').hideIf(true);
          this.$('.preloader-wrap').hideIf(true);
          this.$('.search-results').hideIf(true);
          this.$('.close-search-icon').hideIf(true);
      },

      messagesRequest: function (query, timestamp, rsm, loaded_messages, callback) {
          if(!query || this.loading_timestamp != timestamp) {
              this.emptyChat();
              return true;
          }
          let messages = [],
              options = {},
              queryid = uuid();
          _.extend(options, {
              max: xabber.settings.mam_messages_limit,
              var: [{var: 'withtext', value: query}]
          });
          if (rsm && rsm.last)
              _.extend(options, {
                  after: rsm.last,
              });
          let handler = this.account.connection.addHandler((message) => {
              let $msg = $(message);
              if ($msg.find('result').attr('queryid') === queryid)
                  messages.push(message);
              return true;
          }, Strophe.NS.MAM);
          this.chat_content.MAMRequest(options, (success, messages, rsm) => {
                  this.account.connection.deleteHandler(handler);
                  rsm && (this.first_msg_id = rsm.first);
                  if (!messages.length && !this.account.searched_messages.length) {
                      this.emptyChat();
                  }
                  if (messages.length < options.max)
                      this.history_loaded = true;
                  loaded_messages = loaded_messages.concat(messages)
                  if (messages.length == options.max){
                      if (this.parent &&  this.parent.data && !this.parent.data.get('visible') || this.parent.model.get('search_hidden'))
                          return;
                      else
                          this.messagesRequest(query, timestamp, rsm, loaded_messages, (messages, rsm) => {});
                  }
                  else if (loaded_messages.length == rsm.count) {
                      if (rsm.count != 0) {
                          let message_count = rsm.count;
                          this.emptyChat()
                          // list.sort((a, b) => (a.color > b.color) ? 1 : -1)
                          $(loaded_messages).each((idx, message) => {
                              let $message = $(message),
                                  $jingle_msg_propose = $message.find(`propose[xmlns="${Strophe.NS.JINGLE_MSG}"]`);
                              if ($jingle_msg_propose.length)
                                  message_count--;
                              this.account.chats.receiveChatMessage($message, {
                                  searched_message: true,
                                  searched_in_contact_messages: true,
                                  query: query
                              });
                          });
                          this.$('.messages-count').hideIf(!message_count);
                          this.$('.close-search-icon').hideIf(!message_count);
                          this.$('.search-results').hideIf(message_count);
                          this.$('.messages-count').text(xabber.getQuantityString("searched_messages_count", message_count));
                      }
                      else {
                          this.emptyChat();
                          this.$('.close-search-icon').hideIf(false);
                          this.$('.search-results').hideIf(false);
                      }

                  }
                  callback && callback(messages, rsm);
              }, () => {
                  this.account.connection.deleteHandler(handler);
              }
          );
      },

      addMessageHTML: function ($message, msg, index, last_index) {
          $message.prependTo(this.$('.chat-content'));
          if (index === last_index)
              scrolled_from_top = this.getScrollTop();
          let $next_message = $message.nextAll('.chat-message').first();
          // this.chat_content.updateMessageInChat($message[0]);
          // if ($next_message.length) {
          //     this.chat_content.updateMessageInChat($next_message[0]);
          // }
          // this.chat_content.initPopup($message);
          return $message;
      },

      addMessage: function (message) {
          if (!this.parent.model.get('search_hidden')) {
              if (message.get('auth_request') || !message.get('searched_in_contact_messages'))
                  return;
              message.set('is_archived', true);
              message.set('searched_message', true);
              let $message = this.chat_content.buildMessageHtml(message).addClass('searched-message'),
                  index = this.account.searched_messages.indexOf(message);
              this.chat_content.showMessageAuthor($message);
              this.addMessageHTML($message, message, index);
          }
      },

      hideSearch: function (ev) {
          this.parent.model.set('search_hidden', true);
          this.$('.search-input').val('')
          this.emptyChat();
          if (this.parent.ps_container.length) {
              this.parent.ps_container.perfectScrollbar(
                  _.extend(this.parent.ps_settings || {}, xabber.ps_settings)
              );
          }
          this.$('.search-wrap').hideIf(this.parent.model.get('search_hidden'))
      },

      onClickMessage: function (ev) {
          let $elem = $(ev.target),
              $msg = $elem.closest('.chat-message');
          this.parent.model.set('saved_search_panel_scroll', this.ps_container[0].scrollTop);
          this.ps_container.perfectScrollbar('destroy');
          this.parent.model.set('saved_search_panel', this.$el.clone());
          this.model.getMessageContext($msg.data('uniqueid'), {searched_messages: true});
      }
  });

  xabber.ParticipantMessagesView = xabber.MessagesView.extend({
      className: 'chat-content-wrap participant-messages-wrap',

      events: {
          'click .chat-message': 'onClickMessage',
          'click .chat-msg-location-content': 'onClickLocation',
          'mouseover .chat-msg-location-content.no-title': 'onHoverLocation',
          'click .mdi-link-variant': 'onClickLink',
          'click .msg-copy-location' : 'onClickLocationLink',
          'click .btn-cancel-selection' : 'openChat',
          'click .btn-retract-messages' : 'retractMessages',
          "keyup .messages-search-form": "keyupSearch"
      },

      __initialize: function (options) {
          this.participant = options.participant;
          this.member_jid = this.participant.jid;
          this.member_id = this.participant.id;
          this.member_nickname = this.participant.nickname;
          this.account.participant_messages = new xabber.Messages(null, {account: this.account});
          this.account.participant_messages.on("add", this.addMessage, this);
          this.account.participant_messages.on("change:last_replace_time", this.chat_content.updateMessage, this);
          this.ps_container.on("ps-scroll-y", this.onScrollY.bind(this));
          return this;
      },

      render: function () {
          this.$('.chat-content').css('height', 'calc(100% - 32px)');
          this.$('.participant-messages-header .messages-by-header .participant-nickname').text(this.member_nickname);
          this.$('.participant-messages-header').removeClass('hidden');
          this.scrollToBottom();
          this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
      },

      onScrollY: function () {

      },

      retractMessages: function () {
          utils.dialogs.ask(xabber.getString("dialog_delete_user_messages__header"), xabber.getString("dialog_delete_user_messages__confirm", [(this.member_nickname || this.member_jid || this.member_id)]),
              null, { ok_button_text: xabber.getString("delete")}).done((result) => {
              if (result) {
                  if (this.member_id) {
                      this.chat_content.model.retractMessagesByUser(this.member_id, () => {
                          this.emptyChat();
                      });
                  }
              }
          });
      },

      messagesRequest: function (query, callback) {
          let messages = [],
              options = query || {},
              member_id = this.member_id,
              queryid = uuid();
          _.extend(options, {
              max: xabber.settings.mam_messages_limit,
              before: query.before || '',
              var: [{var: 'with', value: member_id}]
          });
          let handler = this.account.connection.addHandler((message) => {
              let $msg = $(message);
              if ($msg.find('result').attr('queryid') === queryid) {
                  messages.push(message);
              }
              return true;
          }, Strophe.NS.MAM);
          this.chat_content.MAMRequest(options,
              (success, messages, rsm) => {
                  this.account.connection.deleteHandler(handler);
                  rsm && (this.first_msg_id = rsm.first);
                  if (!messages.length && !this.account.participant_messages.length) {
                      this.emptyChat();
                  }
                  if (messages.length < options.max)
                      this.history_loaded = true;
                  $(messages).each((idx, message) => {
                      let $message = $(message);
                      this.account.chats.receiveChatMessage($message, {participant_message: true});
                  });
                  callback && callback();
              }, () => {
                  this.account.connection.deleteHandler(handler);
              }
          );
      },

      addMessage: function (message) {
          if (message.get('auth_request'))
              return;
          message.set('is_archived', true);
          let $message = this.chat_content.buildMessageHtml(message).addClass('participant-message'),
              index = this.account.participant_messages.indexOf(message);
          this.addMessageHTML($message, message, index);
      }
  });

  xabber.SubscriptionButtonsView = xabber.BasicView.extend({
      template: templates.subscription_buttons,

      events: {
          "click .btn-decline": "declineSubscription",
          "click .btn-allow": "allowSubscription",
          "click .btn-add": "addContact",
          "click .btn-subscribe": "addContact",
          "click .btn-block": "blockContact"
      },

      _initialize: function (options) {
          this.$el.html(this.template());
          this.contact = options.contact;
          this.contact.on("change:subscription", this.render, this);
          this.contact.on("change:in_roster", this.render, this);
          this.contact.on("change:blocked", this.render, this);
          this.contact.on("change:subscription_request_in", this.render, this);
          this.contact.on("change:subscription_request_out", this.render, this);
      },

      render: function () {
          this.$el.closest('.chat-content-wrap').children('.chat-content').removeClass('with-before');
          if (this.contact.get('group_chat')) {
              this.$el.addClass('hidden');
              return;
          }
          let subscription = this.contact.get('subscription'),
              in_request = this.contact.get('subscription_request_in'),
              in_roster = this.contact.get('in_roster'),
              out_request = this.contact.get('subscription_request_out');
          this.$('.button').removeClass('hidden');
          this.$('.subscription-info').text("");
          this.$el.addClass('hidden');
          if (subscription === 'both' || this.contact.get('blocked'))
              return;
          else if (subscription === 'to' && in_request || (subscription === 'none' && in_request && in_roster)) {
              this.$('.subscription-info').text(xabber.getString("subscription_status_in_request_incoming"));
              this.$('.button:not(.btn-allow)').addClass('hidden');
          } else if (!out_request && !in_roster && !in_request && (subscription === 'from' || subscription === 'none')) {
              this.$('.subscription-info').text(xabber.getString("chat_subscribe_request_outgoing"));
              this.$('.button:not(.btn-subscribe)').addClass('hidden');
          } else if (subscription === undefined || subscription === 'none' && in_request) {
              this.$('.button:not(.btn-add):not(.btn-block)').addClass('hidden');
          } else {
              return;
          }
          this.$el.removeClass('hidden');
          this.$el.closest('.chat-content-wrap').children('.chat-content').addClass('with-before');
      },

      hideElement: function () {
          this.$el.addClass('hidden');
          this.$el.closest('.chat-content-wrap').children('.chat-content').removeClass('with-before');
      },

      declineSubscription: function () {
          this.contact.declineSubscribe();
          this.contact.set('subscription_request_in', false);
          this.hideElement();
      },

      allowSubscription: function () {
          this.contact.acceptRequest();
          this.hideElement();
      },

      addContact: function () {
          if (this.contact.get('subscription') === undefined)
              this.contact.pushInRoster(null, () => {
                  this.sendAndAskSubscription();
              });
          else
              this.sendAndAskSubscription();
          this.hideElement();
      },

      sendAndAskSubscription: function () {
          this.contact.askRequest();
          this.contact.acceptRequest();
      },

      blockContact: function () {
          this.contact.blockRequest();
          this.hideElement();
      }
  });

xabber.ChatContentView = xabber.BasicView.extend({
    className: 'chat-content-wrap',
    template: templates.chat_content,
    ps_selector: '.chat-content',
    ps_settings: {
        wheelPropagation: true
    },
    avatar_size: constants.AVATAR_SIZES.CHAT_MESSAGE,

    events: {
        'mousedown .chat-message': 'onTouchMessage',
        'click .chat-message': 'onClickMessage',
        'click .chat-msg-location-content': 'onClickLocation',
        'mouseover .chat-msg-location-content.no-title': 'onHoverLocation',
        'click .mdi-link-variant' : 'onClickLink',
        'click .msg-copy-location' : 'onClickLocationLink',
        'click .pinned-message' : 'showPinnedMessage',
        "keyup .messages-search-form": "keyupSearch",
        "click .btn-cancel-searching": "cancelSearch",
        "click .back-to-bottom": "backToBottom",
        "click .back-to-unread:not(.back-to-bottom)": "scrollToUnreadWithButton",
        "click .btn-retry-send-message": "retrySendMessage",
        "click .btn-delete-message": "removeFileErrorMessage",
        "click .not-decrypted-tooltip .btn-manage-devices": "openDevicesWindow",
        "click .encryption-warning": "openDevicesWindow"
    },

    _initialize: function (options) {
        this.chat_item = options.chat_item;
        this.current_day_indicator = null;
        this._pending_avatars = [];
        this.account = this.chat_item.account;
        this.model = this.chat_item.model;
        this.contact = this.model.contact;
        this.head = this.model.get('saved') ? new xabber.SavedChatHeadView({content: this}) : new xabber.ChatHeadView({content: this});
        this.bottom = new xabber.ChatBottomView({content: this});
        this.$history_feedback = this.$('.load-history-feedback');
        this.$pinned_message = this.$('.pinned-message');
        this.$search_form = this.$('.search-form-header');
        this.$el.attr('data-id', this.model.id);
        this.updateContentColorScheme();
        if ((this.model.sync_created && this.model.last_message) || options.new_message && !options.new_message.get('synced_from_server') && options.new_message.get('encrypted') && this.model.get('encrypted')){
            this.model.last_message && this.onMessage(this.model.last_message);
            if (options.new_message){
                this.onMessage(options.new_message);
                this.onChangedReadState(options.new_message);
            }
        }
        this._scrolltop = this.getScrollTop();
        this._is_scrolled_bottom = true;
        this._long_reading_timeout = false;
        let wheel_ev = this.defineMouseWheelEvent();
        this.$el.on(wheel_ev, this.onMouseWheel.bind(this));
        this.ps_container.on("ps-scroll-up ps-scroll-down", this.onScroll.bind(this));
        this.ps_container.on("ps-scroll-y", this.onScrollY.bind(this));
        this.model.on("change:active change:idle", this.onChangedActiveStatus, this);
        xabber.on("change:idle change:focused", this.onChangedIdleStatus, this);
        this.model.on("load_last_history", this.loadLastHistory, this);
        this.model.on("get_missed_history", this.requestMissedMessages, this);
        this.model.messages.on("add", this.onMessage, this);
        this.model.messages.on("change:is_unread", this.onChangedReadState, this);
        this.model.messages.on("change:timestamp", this.onChangedMessageTimestamp, this);
        this.model.messages.on("change:trusted", this.onTrustedChanged, this);
        this.model.messages.on("change:last_replace_time", this.updateMessage, this);
        this.model.on("change:unread", this.updateCounter, this);
        this.model.on("change:const_unread", this.updateCounter, this);
        if (this.contact) {
            this.subscription_buttons = new xabber.SubscriptionButtonsView({contact: this.contact, el: this.$('.subscription-buttons-wrap')[0]});
            this.contact.on("change:blocked", this.updateBlockedState, this);
            this.contact.on("change:subscription", this.onSubscriptionChange, this);
            this.contact.on("change:group_chat", this.updateGroupChat, this);
            this.contact.on("remove_from_blocklist", this.loadLastHistory, this);
            this.contact.on("update_trusted", this.updateMsgsMissingDevices, this);
            this.account.contacts.on("change:name", this.updateName, this);
            this.account.contacts.on("change:image", this.updateAvatar, this);
        }
        this.account.on("change", this.updateMyInfo, this);
        this.account.on("device_trusted", this.updateMsgsDeviceTrusting, this);
        this.account.settings.on("change:color", this.updateContentColorScheme, this);
        xabber.on('plyr_player_updated', this.onUpdatePlyr, this);
        this.account.dfd_presence.done(() => {
            !this.account.connection.do_synchronization && this.loadLastHistory();
        });
        return this;
    },

    render: function () {
        this.cancelSearch();
        if (this._prev_scrolltop)
            this.scrollTo(this._prev_scrolltop);
        else
            this.scrollToBottom();
        this.onScroll();
        this.updateCounter();
        this.updateContactStatus();
        this.updateWaveforms();
        this.onUpdatePlyr();
        if (this.contact) {
            this.contact.get('group_chat') && this.updatePinnedMessage();
            this.subscription_buttons.render();
        }
    },

    openDevicesWindow: function () {
        if (!this.account.omemo)
            return;
        let peer = this.account.omemo.getPeer(this.contact.get('jid'));
        peer.fingerprints.open();
    },

    defineMouseWheelEvent: function () {
        if (!_.isUndefined(window.onwheel)) {
            return "wheel";
        } else if (!_.isUndefined(window.onmousewheel)) {
            return "mousewheel";
        } else {
            return "MozMousePixelScroll";
        }
    },

    updateMyInfo: function () {
        let changed = this.account.changed;
        if (_.has(changed, 'name')) this.updateMyName();
        if (_.has(changed, 'status')) this.updateMyStatus();
        if (_.has(changed, 'image')) this.updateMyAvatar();
    },

    updateMsgsDeviceTrusting: function (device_id, jid) {
        if (!this.model.get('encrypted') || !device_id || !this.contact || this.contact.get('jid') !== jid )
            return;
        this.$(`.not-decrypted-icon[data-device-id="${device_id}"]`).each((idx, item) => {
            let $msg = $(item).closest('.chat-message');
            $msg.removeClass('not-verified');
            $msg.addClass('not-verified-previously');
        })
    },

    updateMsgsMissingDevices: function (trust, peer) {
        if (!this.model.get('encrypted') || !peer || !this.contact)
            return;

        this.$(`.chat-message:not(.not-existing-device)`).each((idx, item) => {
            let $item = $(item);
            if ($item.attr('data-device-id') && !peer.devices[$item.attr('data-device-id')] && $item.attr('data-from') != this.account.get('jid')){
                $item.hasClass('not-verified') && $item.addClass('not-verified-previously');
                $item.removeClass('not-verified');
                $item.addClass('not-existing-device');
            }
        })
    },

    updateContentColorScheme: function () {
        let color = this.account.settings.get('color');
        this.$el.attr('data-color', color);
        this.head.$el.attr('data-color', color);
        this.bottom.$el.attr('data-color', color);
    },

    onTrustedChanged: function (message) {
        let trusted = message.get('trusted'),
            $message = this.$('.chat-message[data-uniqueid="' + message.get('unique_id') + '"]');
        (trusted === null) && (trusted = 'none');
        $message.attr('data-trust', trusted);
    },

    updateGroupChat: function () {
        this._loading_history = false;
        this.model.set('history_loaded', false);
    },

    onSubscriptionChange: function () {
        let subscription = this.contact.get('subscription');
        if (subscription === 'both' && this.contact.get('group_chat')){
            this.updateGroupChat();
            this.loadPreviousHistory();
            this.model.get('active') && this.onChangedActiveStatus();
        }
    },

    cancelSearch: function () {
        this.$search_form.hide().find('input').val("");
    },

    updateContactStatus: function () {
        if (this.head.$('.contact-status').attr('data-status') == 'offline' && this.contact.get('last_seen')) {
            let seconds = (moment.now() - this.contact.get('last_seen'))/1000,
                new_status = xabber.pretty_last_seen(seconds);
            this.contact.set({status_message: new_status });
        }
    },

    updateWaveforms: function () {
        this.model.plyr_players.forEach(function(item) {
            if (item.$audio_elem && item.$audio_elem.voice_message && item.$audio_elem.voice_message.backend && item.$audio_elem.voice_message.backend.buffer)
                item.$audio_elem.voice_message.drawBuffer();
        });
    },

    updatePinnedMessage: function () {
        let $pinned_message = this.contact.get('pinned_message');
        this.contact.renderPinnedMessage($pinned_message, this.$pinned_message);
    },

    onChangedVisibility: function () {
        if (this.isVisible()) {
            this.model.set({display: true, active: true});
        } else {
            this.model.set({display: false});
        }
    },

    onChangedIdleStatus: function (ev) {
        if (!this.model.get('active'))
            return;
        this.model.set('idle', xabber.get('idle') || !xabber.get('focused'))
    },

    onChangedActiveStatus: function () {
        let active = this.model.get('active');
        if (this.model.get('active') && this.model.get('idle'))
            active = false;
        this.sendChatState(active ? 'active' : 'inactive');
        if (this.model.get('group_chat') && !this.contact.get('invitation')) {
            if (active){
                this.contact.setActiveStateSendInterval();
            }
            else{
                clearTimeout(this.contact._sending_active_chatstate_timeout);
                clearInterval(this.contact._sending_active_chatstate_interval);
            }
        }
    },

    updateName: function (contact) {
        let name = contact.get('name'),
            jid = contact.get('jid');
        if (contact === this.contact) {
            this.$(`.chat-message.with-author[data-from="${jid}"]`).each(function () {
                $(this).find('.chat-msg-author').text(name);
            });
        } else {
            this.$(`.fwd-message.with-author[data-from="${jid}"]`).each(function () {
                $(this).find('.fwd-msg-author').text(name);
            });
        }
    },

    updateAvatar: function (contact) {
        let image = contact.cached_image,
            jid = contact.get('jid');
        if (contact === this.contact) {
            this.$(`.chat-message.with-author[data-from="${jid}"]`).each(function () {
                $(this).find('.left-side .circle-avatar').setAvatar(
                    image, this.avatar_size);
            });
        } else {
            this.$(`.fwd-message.with-author[data-from="${jid}"]`).each(function () {
                $(this).find('.fwd-left-side .circle-avatar').setAvatar(
                    image, this.avatar_size);
            });
        }
    },

    updateMyStatus: function () {
        let text;
        if (!this.account.isOnline()) {
            text = xabber.getString("connection_status__you_are_offline");
        }
        this.bottom.showChatNotification(text || '', true);
    },

    updateMyName: function () {
        let name = this.account.get('name'),
            jid = this.account.get('jid');
        this.$(`.chat-message.with-author[data-from="${jid}"]`).each(function () {
            $(this).find('.chat-msg-author').text(name);
        });
        this.$(`.fwd-message.with-author[data-from="${jid}"]`).each(function () {
            $(this).find('.fwd-msg-author').text(name);
        });
    },

    updateMyAvatar: function () {
        let image = this.account.cached_image,
            jid = this.account.get('jid');
        this.$(`.chat-message.with-author[data-from="${jid}"]`).each(function () {
            $(this).find('.left-side .circle-avatar').setAvatar(
                image, this.avatar_size);
        });
        this.$(`.fwd-message.with-author[data-from="${jid}"]`).each(function () {
            $(this).find('.fwd-left-side .circle-avatar').setAvatar(
                image, this.avatar_size);
        });
    },

    updateBlockedState: function () {
        if (this.model.get('blocked'))
            this.model.showBlockedRequestMessage();
        if (this.isVisible()) {
            xabber.body.setScreen(xabber.body.screen.get('name'), {right: 'chat', chat_item: this.chat_item, blocked: this.model.get('blocked')});
            this.updateScrollBar();
        }
    },

    readVisibleMessages: function (is_context) {
        let self = is_context ? this.model.messages_view : this;
        if (!self.isVisible())
            return;
        if (self.$('.chat-message.unread-message').length && xabber.get('focused') && !xabber.get('idle')){
            let last_visible_unread_msg;
            self.$('.chat-message.unread-message').each((idx, msg) => {
                if ($(msg).isVisibleInContainer(self.$('.chat-content'))) {
                    last_visible_unread_msg = msg;
                }
            });
            if (last_visible_unread_msg){
                this.readMessage(this.model.messages.get($(last_visible_unread_msg).data('uniqueid')), $(last_visible_unread_msg), is_context);
            }
        }
    },

    hideMessagesAfterSkipping: function () {
        if (this.model.get('last_sync_unread_id') && this.model.get('synced_msg')){
            let synced_message = this.model.get('synced_msg'),
                $synced_message = this.$(`.chat-message[data-uniqueid="${synced_message.get('unique_id')}"]`);
            $synced_message.addClass('after-skip-message');
            $synced_message.prevAll('.chat-message.after-skip-message').removeClass('after-skip-message');
            $synced_message.nextAll('.chat-message:not(.after-skip-message)').addClass('after-skip-message');
        } else {
            this.$('.chat-message.after-skip-message').removeClass('after-skip-message');
        }
    },

    readMessage: function (last_visible_msg, $last_visible_msg, is_context) {
        clearTimeout(this._read_last_message_timeout);
        this._read_last_message_timeout = setTimeout(() => {
            this.model.sendMarker(last_visible_msg.get('msgid'), 'displayed', last_visible_msg.get('stanza_id'), last_visible_msg.get('contact_stanza_id'), last_visible_msg.get('encrypted') && last_visible_msg.get('ephemeral_timer'));
            this.model.set('last_read_msg', last_visible_msg.get('stanza_id'));
            this.model.set('prev_last_read_msg', last_visible_msg.get('stanza_id'));

            if (is_context){
                let unread_context_messages = _.clone(this.account.context_messages.models).filter(item => Boolean(item.get('is_unread')) || Boolean(item.get('is_unread_archived')));
                _.each(unread_context_messages, (msg) => {
                    let msg_item = this.model.messages.find(message => message.get('stanza_id') == msg.get('stanza_id') || message.get('contact_stanza_id') == msg.get('stanza_id'));
                    if (msg_item) {
                        msg.set('is_unread', msg_item.get('is_unread'));
                        msg.set('is_unread_archived', msg_item.get('is_unread_archived'));
                    }
                });
                setTimeout(() => {
                    $last_visible_msg.removeClass('unread-message-background');
                }, 1000);
            }

            xabber.toolbar_view.recountAllMessageCounter();
        }, 1000)

        if (last_visible_msg.get('is_unread_archived') || this.model.last_message && (last_visible_msg.get('unique_id') === this.model.last_message.get('unique_id')) || this.model.get('const_unread')){
            let unread_messages = _.clone(this.model.messages.models).filter(item => Boolean(item.get('is_unread'))),
                read_count = 0;

            _.each(unread_messages, (msg) => {
                if (msg.get('timestamp') <= last_visible_msg.get('timestamp')) {
                    msg.set('is_unread', false);
                    read_count++;
                }
            });
            read_count = this.model.get('const_unread') - read_count;
            (read_count < 0) && (read_count = 0);
            this.model.set('const_unread', read_count);
        } else {
            let unread_messages = _.clone(this.model.messages_unread.models);
            _.each(unread_messages, (msg) => {
                if (msg.get('timestamp') <= last_visible_msg.get('timestamp')) {
                    msg.set('is_unread', false);
                }
            });
        }
        xabber.toolbar_view.recountAllMessageCounter();

        if (!is_context){
            setTimeout(() => {
                $last_visible_msg.removeClass('unread-message-background');
            }, 1000);
        }
    },

    readMessages: function (timestamp) {
        let unread_messages = _.clone(this.model.messages_unread.models);
        if (unread_messages.length) {
            let msg = unread_messages[unread_messages.length - 1];
            this.model.sendMarker(msg.get('msgid'), 'displayed', msg.get('stanza_id'), msg.get('contact_stanza_id'), msg.get('encrypted') && msg.get('ephemeral_timer'));
            this.model.set('last_read_msg', msg.get('stanza_id'));
            this.model.set('prev_last_read_msg', msg.get('stanza_id'));
        }
        this.model.set('const_unread', 0);
        this.model.set('show_new_unread', false);
        _.each(unread_messages, (msg) => {
            if (!timestamp || msg.get('timestamp') <= timestamp) {
                msg.set('is_unread', false);
            }
        });
        if (this.model.last_message && this.model.last_message.get('is_unread') && !unread_messages.length){
            let msg = this.model.last_message;
            this.model.sendMarker(msg.get('msgid'), 'displayed', msg.get('stanza_id'), msg.get('contact_stanza_id'), msg.get('encrypted') && msg.get('ephemeral_timer'));
            msg.set('is_unread', false);
            msg.get('stanza_id') && this.model.set('last_read_msg', msg.get('stanza_id'));
            msg.get('stanza_id') && this.model.set('prev_last_read_msg', msg.get('stanza_id'));
        }
        else if (this.model.last_message && this.model.last_message.get('auth_request') && this.model.messages.length){
            let messages = _.clone(this.model.messages.models),
                msg = messages[messages.length - 2];
            if (msg && msg.get('is_unread')) {
                this.model.sendMarker(msg.get('msgid'), 'displayed', msg.get('stanza_id'), msg.get('contact_stanza_id'), msg.get('encrypted') && msg.get('ephemeral_timer'));
                msg.set('is_unread', false);
                msg.get('stanza_id') && this.model.set('last_read_msg', msg.get('stanza_id'));
                msg.get('stanza_id') && this.model.set('prev_last_read_msg', msg.get('stanza_id'));
            }
        }
        if (!unread_messages.length) {
            let unread_messages = _.clone(this.model.messages.models).filter(item => Boolean(item.get('is_unread')));
            _.each(unread_messages, (msg) => {
                msg.set('is_unread', false);
            });
        }
    },

    showUnreadMarker: function () {
        this.$('.unread-marker').remove();
        if (this.$(`.chat-message.unread-message`).length){
            let text = xabber.getQuantityString("new_chat_messages_no_number", this.model.get('const_unread') + this.model.get('unread')),
                $template = $(templates.unread_marker({text: text}));
            $template.insertBefore(this.$(`.chat-message.unread-message:first`));
        }
    },

    onMouseWheel: function (ev) {
        if (ev.originalEvent.deltaY < 0)
            this.loadPreviousHistory();
        this.$('.back-to-bottom:not(.back-to-unread)').hideIf(this.isScrolledToBottom() || this.$(`.chat-message.unread-message`).length);
        this.$('.back-to-unread').showIf(!this.isScrolledToBottom() && this.$(`.chat-message.unread-message`).length);
        this.$('.back-to-unread').removeClass('back-to-bottom');
    },

    keyupSearch: function (ev) {
        if (ev.keyCode === constants.KEY_ENTER) {
            let query = this.$search_form.find('input').val();
            this.model.searchMessages(query, (messages) => {});
        }
        if (ev.keyCode === constants.KEY_ESCAPE && !xabber.body.screen.get('right_contact')) {
            this.head.renderSearchPanel();
        }
    },

    scrollToUnread: function () {
        let $last_read_msg = this.$(`.chat-message.unread-message:first`);
        $last_read_msg.length && (this.scrollTo(this.getScrollTop()
            - (this.$el.height() * 0.2) + $last_read_msg.offset().top));
        if (this.model.get('last_sync_unread_id')) {
            let mam_query = {
                fast: true,
                max: xabber.settings.mam_messages_limit,
                after: this.model.get('last_sync_unread_id'),
            };
            if (this.model.get('synced_msg')) {
                mam_query.var = [
                    {var: 'after-id', value: this.model.get('last_sync_unread_id')},
                    {var: 'before-id', value: this.model.get('synced_msg').get('stanza_id')},
                ];
            }
            this.getMessageArchive(mam_query, {
                unread_history: true,
            });
        }
    },

    scrollToUnreadWithButton: function () {
        this.scrollToUnread();
        this.$('.back-to-unread').addClass('back-to-bottom');
    },

    updateCounter: function () {
        let unread = this.model.get('unread') + this.model.get('const_unread');
        this.$('.back-to-unread-counter').text(unread || '');
        this.$('.back-to-unread').showIf(!this.isScrolledToBottom() && this.$(`.chat-message.unread-message`).length);
    },

    onScrollY: function () {
        this._prev_scrolltop = this._scrolltop || this._prev_scrolltop || 0;
        this._scrolltop = this.getScrollTop() || this._scrolltop || this._prev_scrolltop || 0;
        this._is_scrolled_bottom = this.isScrolledToBottom();
        if (this._scrolltop === 0 && this.$('.subscription-buttons-wrap').hasClass('hidden')) {
            this.$('.fixed-day-indicator-wrap').css('opacity', 1);
            this.current_day_indicator = pretty_date(parseInt(this.$('.chat-content').children().first().data('time')));
            this.showDayIndicator(this.current_day_indicator);
        }
        this.$('.back-to-bottom:not(.back-to-unread)').hideIf(this.isScrolledToBottom() || this.$(`.chat-message.unread-message`).length);
        this.$('.back-to-unread').showIf(!this.isScrolledToBottom() && this.$(`.chat-message.unread-message`).length);
        this.$('.back-to-unread').removeClass('back-to-bottom');
    },

    onScroll: function (ev, is_focused) {
        if (!this.isVisible() || this._no_scrolling_event)
            return;
        this.$('.back-to-bottom:not(.back-to-unread)').hideIf(this.isScrolledToBottom() || this.$(`.chat-message.unread-message`).length);
        this.$('.back-to-unread').showIf(!this.isScrolledToBottom() && this.$(`.chat-message.unread-message`).length);
        this.$('.back-to-unread').removeClass('back-to-bottom');
        let $chatday_indicator = this.$('.chat-day-indicator'),
            $messages = this.$('.chat-message'),
            indicator_idx = undefined,
            opacity_value;
        if (this.$('.unread-marker').length) {
            let marker = this.$('.unread-marker');
            if (marker[0].offsetTop < this._scrolltop)
                marker.remove();
        }
        $chatday_indicator.each((idx, indicator) => {
            if (this.$('.subscription-buttons-wrap').hasClass('hidden')) {
                if (this._scrolltop < this._prev_scrolltop) {
                    if ((indicator.offsetTop <= this._scrolltop) && (indicator.offsetTop >= this._scrolltop - 30)) {
                        indicator_idx = idx;
                        opacity_value = 0;
                        return false;
                    }
                    if ((indicator.offsetTop >= this._scrolltop) && (indicator.offsetTop <= this._scrolltop - 30)) {
                        indicator_idx = idx && (idx - 1);
                        opacity_value = 1;
                        return false;
                    }
                }
                else {
                    if ((indicator.offsetTop <= this._scrolltop + 30) && (indicator.offsetTop >= this._scrolltop)) {
                        indicator_idx = idx && (idx - 1);
                        opacity_value = 0;
                        return false;
                    }
                    if ((indicator.offsetTop >= this._scrolltop - 30) && (indicator.offsetTop <= this._scrolltop)) {
                        indicator_idx = idx;
                        opacity_value = 1;
                        return false;
                    }
                }
            }
            else if (!$(indicator).hasClass('fixed-day-indicator-wrap')) {
                if (this._scrolltop < this._prev_scrolltop) {
                    if ((indicator.offsetTop >= this._scrolltop + 30) && (indicator.offsetTop <= this._scrolltop + 62)) {
                        indicator_idx = idx;
                        opacity_value = 0;
                        return false;
                    }
                    if ((indicator.offsetTop >= this._scrolltop) && (indicator.offsetTop <= this._scrolltop + 62)) {
                        indicator_idx = idx;
                        opacity_value = 1;
                        return false;
                    }
                }
                else {
                    if ((indicator.offsetTop <= this._scrolltop + 62) && (indicator.offsetTop >= this._scrolltop + 30)) {
                        indicator_idx = idx && (idx - 1);
                        opacity_value = 0;
                        return false;
                    }
                    if ((indicator.offsetTop >= this._scrolltop - 62) && (indicator.offsetTop <= this._scrolltop + 30)) {
                        indicator_idx = idx;
                        opacity_value = 1;
                        return false;
                    }
                }
            }
        });
        if (indicator_idx) {
            this.$('.fixed-day-indicator-wrap').css('opacity', opacity_value);
            this.current_day_indicator = pretty_date(parseInt($($chatday_indicator[indicator_idx]).attr('data-time')));
        }
        else {
            $messages.each((idx, msg) => {
                if ((msg.offsetTop + $(msg).height() > this._scrolltop) && (msg.offsetTop < this._scrolltop)) {
                    indicator_idx = idx;
                    opacity_value = 1;
                    return false;
                }
            });
            if (indicator_idx) {
                this.$('.fixed-day-indicator-wrap').css('opacity', opacity_value);
                this.current_day_indicator = pretty_date(parseInt($($messages[indicator_idx]).attr('data-time')));
            }
            else if (!this.$('.subscription-buttons-wrap').hasClass('hidden') && this._scrolltop == 0){
                opacity_value = 0;
                this.$('.fixed-day-indicator-wrap').css('opacity', opacity_value);
            }
        }
        if (this.current_day_indicator !== null) {
            this.showDayIndicator(this.current_day_indicator);
        }
        let scroll_read_timer = this._long_reading_timeout || is_focused ? 100 : 100;
        clearTimeout(this._onscroll_read_messages_timeout);
        this._onscroll_read_messages_timeout = setTimeout(() => {
            this.readVisibleMessages();
        }, scroll_read_timer)
        this._long_reading_timeout = false;
        if (this._scrolltop < this._prev_scrolltop &&
            (this._scrolltop < 100 || this.getPercentScrolled() < 0.1)) {
            this.loadPreviousHistory();
        }
        this.hideMessagesAfterSkipping();
        if (this._scrolltop > this._prev_scrolltop && this.model.get('last_sync_unread_id') && this.getPercentScrolled() > 0.2) {
            let mam_query = {
                fast: true,
                max: xabber.settings.mam_messages_limit,
                after: this.model.get('last_sync_unread_id'),
            };
            if (this.model.get('synced_msg')) {
                mam_query.var = [
                    {var: 'after-id', value: this.model.get('last_sync_unread_id')},
                    {var: 'before-id', value: this.model.get('synced_msg').get('stanza_id')},
                ];
            }
            this.getMessageArchive(mam_query, {
                unread_history: true,
            });
        }
    },

    backToBottom: function () {
        this.model.set('last_sync_unread_id', undefined);
        this.hideMessagesAfterSkipping();
        this._no_scrolling_event = true;
        this.removeAllMessagesExceptLast();
        this.readMessages();
        this.model.resetUnread();
        this.model.set('history_loaded', false);
        this.loadPreviousHistory();
        this._long_reading_timeout = false;
        this._no_scrolling_event = false;
        this.scrollToBottom();
    },

    MAMRequest: function (options, callback, errback) {
        let account = this.account,
            contact = this.contact,
            is_saved = this.model.get('saved'),
            messages = [], queryid = uuid(),
            is_groupchat = contact && contact.get('group_chat'), success = true, iq, _interval, handler;
        delete options.fast;
        if (is_groupchat)
            iq = $iq({type: 'set', to: contact.get('full_jid') || contact.get('jid')});
        else
            iq = $iq({type: 'set'});
        iq.c('query', {xmlns: Strophe.NS.MAM, queryid: queryid})
            .c('x', {xmlns: Strophe.NS.DATAFORM, type: 'submit'})
            .c('field', {'var': 'FORM_TYPE', type: 'hidden'})
            .c('value').t(Strophe.NS.MAM).up().up();
        if (this.account.server_features.get(Strophe.NS.ARCHIVE)) {
            iq.c('field', {'var': `conversation-type`});
            if (this.model.get('encrypted')){
                iq.c('value').t(Strophe.NS.OMEMO).up().up();
            } else {
                iq.c('value').t(Strophe.NS.XABBER_CHAT).up().up();
            }
        }
        if (!is_groupchat)
            iq.c('field', {'var': 'with'})
                .c('value').t(this.model.get('jid')).up().up();
        if (options.var)
            options.var.forEach((opt_var) => {
                iq.c('field', {'var': opt_var.var})
                    .c('value').t(opt_var.value).up().up();
            });
        iq.up().cnode(new Strophe.RSM(options).toXML());
        let deferred = new $.Deferred();
        account.chats.onStartedMAMRequest(deferred);
        deferred.done(function () {
            let sendMAMRequest = function(func_conn) {
                handler = func_conn.addHandler(function (message) {
                    if ((contact && is_groupchat == contact.get('group_chat')) || is_saved) {
                        let $msg = $(message);
                        if ($msg.find('result').attr('queryid') === queryid) {
                            messages.push(message);
                        }
                    }
                    else {
                        messages = [];
                        success = false;
                    }
                    return true;
                }, Strophe.NS.MAM);
                let _delete_handler_timeout = setTimeout(() => {
                    console.log('handler deleted');
                    func_conn.deleteHandler(handler);
                }, 14000);
                let callb = function (res) {
                        func_conn.deleteHandler(handler);
                        clearTimeout(_delete_handler_timeout);
                        clearInterval(_interval);
                        handler = null;
                        account.chats.onCompletedMAMRequest(deferred);
                        let $fin = $(res).find(`fin[xmlns="${Strophe.NS.MAM}"]`);
                        if ($fin.length && $fin.attr('queryid') === queryid) {
                            let rsm = new Strophe.RSM({xml: $fin.find('set')[0]});
                            rsm.complete = ($fin.attr('complete') === 'true') ? true : false;
                            callback && callback(success, messages, rsm);
                        }
                    },
                    errb = function (err) {
                        func_conn.deleteHandler(handler);
                        clearTimeout(_delete_handler_timeout);
                        clearInterval(_interval);
                        handler = null;
                        xabber.error("MAM error");
                        xabber.error(err);
                        account.chats.onCompletedMAMRequest(deferred);
                        errback && errback(err);
                    };
                console.log('trying to send')
                if (is_fast)
                    account.sendFast(iq, callb, errb);
                else
                    account.sendIQ(iq, callb, errb);

            };
            let is_fast = options.fast && account.fast_connection && !account.fast_connection.disconnecting
                && account.fast_connection.authenticated && account.fast_connection.connected && account.get('status') !== 'offline',
                conn = is_fast ? account.fast_connection : account.connection;

            if (conn.connected){
                sendMAMRequest(conn);
            }
            let send_counter = 0;
            _interval = setInterval(() => {
                is_fast = options.fast && account.fast_connection && !account.fast_connection.disconnecting
                    && account.fast_connection.authenticated && account.fast_connection.connected && account.get('status') !== 'offline';
                conn = is_fast ? account.fast_connection : account.connection;
                conn && console.log(conn.connected);
                if (!conn || send_counter >= 1){
                    clearInterval(_interval);
                    errback && errback('No connection or too many attempts');
                    return;
                }
                if (conn.connected && send_counter < 1){
                    send_counter++;
                    sendMAMRequest(conn);
                }
            }, 15000);
        });
    },

    getMessageArchive: function (query, options) {
        if (options.previous_history || options.unread_history) {
            if (this._loading_history || this.model.get('history_loaded')) {
                return;
            }
            this._loading_history = true;
            clearTimeout(this._load_history_timeout);
            this._load_history_timeout = setTimeout(() => {
                this._loading_history = false;
            }, 60000);
            this.showHistoryFeedback();
        }
        let account = this.model.account, counter = 0;
        this.MAMRequest(query, (success, messages, rsm) => {
            clearTimeout(this._load_history_timeout);
            this._loading_history = false;
            this.hideHistoryFeedback();
            if (options.missed_history && !rsm.complete && (rsm.count > messages.length))
                this.getMessageArchive({after: rsm.last}, {missed_history: true});
            if (options.unread_history){
                if (messages.length)
                    this.model.set('last_sync_unread_id', $(messages[messages.length - 1]).find(`result[xmlns="${Strophe.NS.MAM}"]`).attr('id'));
                else {
                    this.model.set('last_sync_unread_id', undefined);
                    this.hideMessagesAfterSkipping();
                }
            }
            if (options.unread_history_first && messages.length){
                let first_unread_msg_stanza_id = $(messages[0]).find(`result[xmlns="${Strophe.NS.MAM}"]`).attr('id')
                this.model.set('first_unread_msg_stanza_id', first_unread_msg_stanza_id);
                if (messages.length < query.max){
                    this.model.set('last_sync_unread_id', undefined);
                    this.hideMessagesAfterSkipping();
                }
                this.getMessageArchive({
                    fast: true,
                    max: xabber.settings.mam_messages_limit,
                    before : first_unread_msg_stanza_id
                }, {unread_history_before: true});
            }
            if (this.model.get('group_chat')) {
                if (this.contact && !this.contact.my_info)
                    this.contact.getMyInfo();
            }
            else {
                if (this.contact && !this.contact.get('last_seen') && !this.contact.get('server'))
                    this.contact.getLastSeen();
            }
            if (options.previous_history && (messages.length < query.max) && success) {
                this.model.set('history_loaded', true);
            }
            if (options.previous_history || options.unread_history_before || !this.model.get('first_archive_id')) {
                rsm.first && this.model.set('first_archive_id', rsm.first);
            }
            if (options.last_history || !this.model.get('last_archive_id')) {
                rsm.last && this.model.set('last_archive_id', rsm.last);
            }
            _.each(messages, function (message) {
                let loaded_message = account.chats.receiveChatMessage(message,
                    _.extend({
                        is_archived: true,
                        is_unread_archived: options.unread_history ? true : undefined,
                    }, options)
                );
                if (loaded_message) counter++;
            });
            if ((counter === 0) && options.last_history && !this.model.get('history_loaded')) {
                this.getMessageArchive(_.extend(query, {
                    max: xabber.settings.mam_messages_limit,
                    before: this.model.get('first_archive_id') || ''
                }), {previous_history: true});
            }
            if (options.unread_history_before){
                if (this.model.get('encrypted')){
                    //TODO: make async func to start opening chat after all messages been handled in enc chat
                    setTimeout(() => {
                        this.model._wait_load_unread_history.resolve();
                    }, 1000);
                } else
                    this.model._wait_load_unread_history.resolve();
            }
        }, (err) => {
            if (options.previous_history) {
                this._loading_history = false;
                this.showHistoryFeedback(true);
            }
            if (options.unread_history_before || options.unread_history_first){
                this.model._wait_load_unread_history.resolve();
            }
        });
    },

    requestMissedMessages: function (timestamp) {
        if (!timestamp)
            return;
        let query = {};
        query.var = [{var: 'start', value: moment(timestamp).format()}];
        this.getMessageArchive(query, {missed_history: true});
    },

    loadLastHistory: function () {
        if (!xabber.settings.load_history) {
            return;
        }
        let last_archive_id = this.model.get('last_archive_id'),
            query = {};
        if (last_archive_id) {
            query.after = last_archive_id;
        } else {
            query.before = '';
            query.max = xabber.settings.mam_messages_limit_start;
        }
        this.getMessageArchive(query, {last_history: true});
    },

    loadPreviousHistory: function () {
        if (this.contact) {
            if (!xabber.settings.load_history || (!this.contact.get('subscription') || this.contact.get('subscription') !== 'both') && this.contact.get('group_chat')) {
                return;
            }
        }
        this.getMessageArchive({
                fast: true,
                max: xabber.settings.mam_messages_limit,
                before: this.model.get('first_archive_id') || '' },
            {previous_history: true
            });
    },

    loadUnreadHistory: function () {
        if (this.contact) {
            if (!xabber.settings.load_history || (!this.contact.get('subscription') || this.contact.get('subscription') !== 'both') && this.contact.get('group_chat')) {
                return;
            }
        }
        this.model.set('loading_unread_history', true)
        this.getMessageArchive({
            fast: true,
            max: xabber.settings.mam_messages_limit,
            after: this.model.get('last_read_msg'),
        }, {
            unread_history_first: true,
            unread_history: true,
        });
    },

    showHistoryFeedback: function (is_error) {
        if (this._load_history_feedback_timeout) {
            clearTimeout(this._load_history_feedback_timeout);
            this._load_history_feedback_timeout = null;
        }
        let text = xabber.getString(is_error ? "loading_archived_messages_error" : "loading_history");
        this.$history_feedback.text(text).removeClass('hidden');
        if (is_error) {
            this._load_history_feedback_timeout = setTimeout(
                this.hideHistoryFeedback.bind(this), 5000);
        }
    },

    showDayIndicator: function (text) {
        this.$('.fixed-day-indicator').text(text);
        this.$('.fixed-day-indicator-wrap').removeClass('hidden');
    },

    showPinnedMessage: function (ev) {
        if ($(ev.target).hasClass('close'))
            this.unpinMessage();
        else {
            let pinned_message = this.contact.get('pinned_message'),
                participant_info = {};
            pinned_message.get('user_info') && this.contact.participants && (participant_info = this.contact.participants.get(pinned_message.get('user_info').id));
            participant_info && participant_info.attributes && pinned_message.set('user_info', participant_info.attributes);

            let msg = this.buildMessageHtml(pinned_message),
                pinned_msg_modal = new xabber.ExpandedMessagePanel({account: this.account, chat_content: this, message: pinned_message, pinned: true});
            pinned_msg_modal.$el.attr('data-color', this.account.settings.get('color'));
            this.updateMessageInChat(msg, pinned_message);
            this.initPopup(msg);
            pinned_msg_modal.open(msg);
        }
    },

    imageOnload: function ($message) {
        let $image_container = $message.find('.img-content'),
            $copy_link_icon = $message.find('.mdi-link-variant');
        $image_container.css('background-image', 'none');
        $copy_link_icon.attr({
            'data-image': 'true'
        });
    },

    videoOnload: function ($message, message) {
        let $copy_link_icon = $message.find('.mdi-link-variant');
        $copy_link_icon.attr({
            'data-image': 'true'
        });
        this.initPlyrEmbedPlayer($message, message);
    },

    OGPLinkOnload: function ($message, message) {
        let $copy_link_icon = $message.find('.mdi-link-variant');
        $copy_link_icon.attr({
            'data-image': 'true'
        });
    },

    locationOnload: function ($message) {
        let $copy_location_div = $message.find('.msg-copy-location-content');
        $copy_location_div.html(env.templates.svg['map-marker-outline']());
        $copy_location_div.attr({
            'data-location': 'true'
        });
    },

    unpinMessage: function () {
        let iq = $iq({type: 'set', to: this.contact.get('full_jid') || this.contact.get('jid')})
            .c('update', {xmlns: Strophe.NS.GROUP_CHAT})
            .c('pinned-message');
        this.account.sendIQFast(iq, () => {}, (error) => {
            if ($(error).find('error not-allowed').length)
                utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
        });
    },

    loadLocationInChat: function ($message, attrs) {
        import('ol-local').then(ol => {
            ol = ol.default ? ol.default : ol;
            let $map_element = $message.find(`#${attrs.id}`);
            if (!$map_element.length)
                return;
            let map = new ol.Map({
                target: $map_element[0],
                view: new ol.View
                ({	zoom: 15,
                    center: ol.proj.transform([attrs.lon, attrs.lat], 'EPSG:4326', 'EPSG:3857')
                }),
                interactions: ol.interaction_defaults({
                    altShiftDragRotate:false,
                    doubleClickZoom:false,
                    keyboard:false,
                    mouseWheelZoom:false,
                    shiftDragZoom:false,
                    dragPan:false,
                    pinchRotate:false,
                    pinchZoom:false
                }),
                layers: [ new ol.layer.Tile({ source: new ol.source.OSM() }) ],
            });

            map.once('rendercomplete', function(event) {
                let mapCanvas = document.createElement('canvas');
                let size = map.getSize();
                mapCanvas.width = size[0];
                mapCanvas.height = size[1];
                let mapContext = mapCanvas.getContext('2d');
                Array.prototype.forEach.call(
                    document.querySelectorAll(`#${attrs.id} .ol-layer canvas`),
                    function (canvas) {
                        if (canvas.width > 0) {
                            let opacity = canvas.parentNode.style.opacity;
                            mapContext.globalAlpha = opacity === '' ? 1 : Number(opacity);
                            let transform = canvas.style.transform;
                            // Get the transform parameters from the style's transform matrix
                            let matrix = transform
                                .match(/^matrix\(([^\(]*)\)$/)[1]
                                .split(',')
                                .map(Number);
                            // Apply the transform to the export map context
                            CanvasRenderingContext2D.prototype.setTransform.apply(
                                mapContext,
                                matrix
                            );
                            let path = new Path2D('M 18 17.25 C 15.9289 17.25 14.25 15.5711 14.25 13.5 C 14.25 12.5054 14.6451 11.5516 15.3483 10.8483 C 16.0516 10.1451 17.0054 9.75 18 9.75 C 20.0711 9.75 21.75 11.4289 21.75 13.5 C 21.75 14.4946 21.3549 15.4484 20.6517 16.1517 C 19.9484 16.8549 18.9946 17.25 18 17.25 M 18 3 C 12.201 3 7.5 7.701 7.5 13.5 C 7.5 21.375 18 33 18 33 C 18 33 28.5 21.375 28.5 13.5 C 28.5 7.701 23.799 3 18 3 Z');
                            mapContext.fillStyle = getComputedStyle(document.querySelector(`#${attrs.id}`)).color;
                            mapContext.drawImage(canvas, 0, 0);
                            mapContext.translate(157, 117);

                            mapContext.fill(path);
                        }
                    }
                );
                if (navigator.msSaveBlob) {
                    // link download attribute does not work on MS browsers
                    navigator.msSaveBlob(mapCanvas.msToBlob(), 'map.png');
                } else {
                    let img = document.getElementById(`img_${attrs.id}`),
                        dataURL = mapCanvas.toDataURL('image/png');
                    map.setTarget(null)
                    map = null;
                    img.src= dataURL
                }
            });
        });
    },

    hideHistoryFeedback: function () {
        this.$history_feedback.addClass('hidden');
    },

    receiveNoTextMessage: function ($message, carbon_copied) {
        let from_jid = Strophe.getBareJidFromJid($message.attr('from')),
            to_jid = Strophe.getBareJidFromJid($message.attr('to')),
            is_sender = from_jid === this.account.get('jid'),
            $chat_state = $message.find(`[xmlns="${Strophe.NS.CHATSTATES}"]`);
        if ($chat_state.length) {
            if (!is_sender) {
                let $subtype = $chat_state.children('subtype');
                if ($subtype.attr('type') == 'encrypted') {
                    let view = xabber.chats_view.child(`${this.contact.hash_id}:encrypted`);
                    if (view && view.content)
                        view.content.showChatState($chat_state[0].tagName.toLowerCase());
                } else
                    this.showChatState($chat_state[0].tagName.toLowerCase(), $subtype.attr('type'), $subtype.attr('mime-type'));
            }
        }
    },

    showChatState: function (state, type, mime_type) {
        clearTimeout(this._chatstate_show_timeout);
        let message, name = this.contact.get('name');
        if (state === 'composing') {
            if (type) {
                this._current_composing_msg = {type: type};
                if (type === 'upload') {
                    let file_type = mime_type ? utils.pretty_file_type_with_article(mime_type) : null;
                    mime_type && (this._current_composing_msg.mime_type = mime_type);
                    message = file_type ? xabber.getString("chat_state_composing_upload_filetype", [file_type]) : xabber.getString("chat_state_composing_upload");
                    this._chatstate_show_timeout = setTimeout(() => {
                        this.showChatState();
                    }, constants.CHATSTATE_TIMEOUT_PAUSED_AUDIO);
                } else {
                    if (type === 'voice')
                        message = xabber.getString("chat_state_composing_voice");
                    if (type === 'video')
                        message = xabber.getString("chat_state_composing_video");
                    this._chatstate_show_timeout = setTimeout(() => {
                        this.showChatState('paused', type);
                    }, constants.CHATSTATE_TIMEOUT_PAUSED_AUDIO);
                }
            }
            else {
                this._current_composing_msg = undefined;
                message = xabber.getString("chat_state_composing");
                this._chatstate_show_timeout = setTimeout(() => {
                    this.showChatState();
                }, constants.CHATSTATE_TIMEOUT_PAUSED);
            }
        } else if (state === 'paused') {
            this.showChatState();
            return;
        } else {
            this.bottom.showChatNotification('');
            this.chat_item.updateLastMessage();
            return;
        }
        if (message)
            this.bottom.showChatNotification(`${this.contact.get('name')} ${message}`);
        else
            this.bottom.showChatNotification();
        this.chat_item.$('.last-msg').text(message);
        this.chat_item.$('.last-msg-date').text(utils.pretty_short_datetime())
            .attr('title', pretty_datetime());
        this.chat_item.$('.msg-delivering-state').addClass('hidden');
    },

    updateMentions: function (message) {
        if (message.get('mentions')) {
            message.get('mentions').forEach((mention) => {
                let mention_target = mention.target || "";
                if (this.contact.get('group_chat') || message.get('groupchat_jid')) {
                    let id = mention_target.match(/\?id=\w*/),
                        jid = mention_target.match(/\?jid=.*/);
                    if (id && this.contact.my_info) {
                        mention_target = id[0].slice(4);
                        (mention_target === this.contact.my_info.get('id')) && (mention.me = true);
                    }
                    else if (jid) {
                        mention_target = jid[0].slice(5);
                        (mention_target === this.account.get('jid')) && (mention.me = true);
                    }
                }
                else {
                    mention_target = mention_target.slice(5);
                    if (mention_target === this.account.get('jid'))
                        mention.me = true;
                }
            });
        }
    },

    onMessage: function (message) {
        this.updateMentions(message);
        this.account.messages.add(message);
        let is_scrolled_to_bottom = this.isScrolledToBottom(),
            scrolled_from_bottom = this.getScrollBottom();
        if (!_.isUndefined(message.get('is_accepted'))) {
            this.model.set('is_accepted', false);
        }
        this.model.set('opened', true);
        if (!message.get('is_archived') && !message.get('is_unread_archived') && message.get('stanza_id'))
            this.model.set('last_archive_id', message.get('stanza_id'));

        if (message.get('participants_version')) {
            if (this.contact.participants && this.contact.participants.version < message.get('participants_version'))
                this.contact.trigger('update_participants');
        }

        let $message = this.addMessage(message);

        if (message.get('type') === 'file_upload') {
            if (this.account.get('gallery_token') && this.account.get('gallery_url'))
                this.startGalleryUploadFile(message, $message);
            else
                this.startUploadFile(message, $message);
        }

        if (!(message.get('synced_from_server') || (message.get('is_archived') && !message.get('missed_msg')))) {
            if (message.get('missed_msg')){
                if (this.model.get('last_read_msg')){
                    let last_read_msg = this.model.messages.find(m => this.model.get('last_read_msg') && (m.get('stanza_id') === this.model.get('last_read_msg') || m.get('contact_stanza_id') === this.model.get('last_read_msg'))),
                        deferred = new $.Deferred();
                    deferred.done(() => {
                        if (last_read_msg && message.get('timestamp') > last_read_msg.get('timestamp')){
                            message.set('is_unread', true);
                            if (!xabber.get('focused')) {
                                if (this.model.get('saved') || this.model.isMuted())
                                    message.set('muted', true);
                            }
                            this.model.setMessagesDisplayed(message.get('timestamp'));
                        }
                    });
                    if (!last_read_msg){
                        this.contact.getMessageByStanzaId(this.model.get('last_read_msg'), ($message) => {
                            last_read_msg = this.account.chats.receiveChatMessage($message, {is_archived: true});
                            deferred.resolve();
                        });
                    } else {
                        deferred.resolve();
                    }
                }
            } else {
                if (!(message.isSenderMe() || message.get('silent') || ((message.get('type') === 'system') && !message.get('auth_request')))) {
                    message.set('is_unread', true);
                    if (message.get('is_unread') && xabber.get('focused') && !xabber.get('idle') && this.isVisible()){
                        this.readVisibleMessages();
                    }
                    if (!xabber.get('focused')) {
                        if (this.model.get('saved') || this.model.isMuted())
                            message.set('muted', true);
                        else if (!message.get('synced_invitation_from_server'))
                            this.notifyMessage(message);
                    }
                    this.model.setMessagesDisplayed(message.get('timestamp'));
                }
            }
            if (this.contact && this.model.get('archived')){
                if (this.model.isMuted())
                    message.set('archived', true);
                else {
                    this.head.archiveChat();
                    this.model.set('archived', false);
                }
            }
            if (this.model.get('saved')) {
                message.set('muted', true);
                message.set('state', constants.MSG_DISPLAYED);
            }
        }

        if (this.isVisible() && (!message.get('is_unread') || is_scrolled_to_bottom) && !message.get('is_between_anchors')) {
            let is_scrolling_needed;
            if (is_scrolled_to_bottom){
                if (this.$(`.chat-message.unread-message`).length){
                    if (this.$(`.chat-message.unread-message`)[0].offsetTop > (this._scrolltop + 140)) {
                        is_scrolling_needed = true;
                    }
                } else
                    is_scrolling_needed = true;
            }
            if ((is_scrolled_to_bottom && is_scrolling_needed) || message.get('submitted_here')) {
                this.scrollToBottom();
            } else if (!is_scrolled_to_bottom) {
                this.updateScrollBar();
                this.scrollTo(this.ps_container[0].scrollHeight - this.ps_container[0].offsetHeight - scrolled_from_bottom);
            }
        }

        if (message.get('synced_from_server') && message.get('is_unread')) {
            this.onChangedReadState(message);
        }
        if (message.get('attention')) {
            this.attentionMessage(message);
        }

        if (message.isSenderMe()) {
            if (!message.get('is_archived') && !message.get('missed_msg') && message.get('type') != 'system')
                this.readMessages(message.get('timestamp'));
            if (this.model.get('last_displayed_id') >= message.get('stanza_id') && message.get('stanza_id') !== message.get('origin_id'))
                message.set('state', constants.MSG_DISPLAYED);
            else if (message.get('stanza_id') !== message.get('origin_id') && (this.model.get('last_delivered_id') >= message.get('stanza_id') || message.get('is_archived')))
                message.set('state', constants.MSG_DELIVERED);
        }

        if (message.get('private_invite') || message.get('invite')) {
            if (!(this.contact.invitation && this.contact.invitation.message.get('timestamp') > message.get('timestamp')))
                this.contact.invitation = new xabber.GroupchatInvitationView({model: this.contact, message: message});
            this.model.contact.set('invitation', true);
            this.model.get('active') && this.model.contact.trigger('open_chat', this.model.contact);
            message.set('is_unread', false);
        }

        let last_message = this.model.last_message;
        if (!last_message || message.get('timestamp') >= last_message.get('timestamp')) {
            this.model.last_message = message;
            this.chat_item.updateLastMessage();
        }
        if (message.get('mentions')) {
            message.get('mentions').forEach((mention) => {
                let mention_target = mention.target || "",
                    id = mention_target.match(/\?id=\w*/),
                    jid = mention_target.match(/\?jid=.*/);
                if (id)
                    mention_target = id[0].slice(4);
                else if (jid)
                    mention_target = jid[0].slice(5);
                else
                    mention_target = "";
                if (this.contact.my_info)
                    (mention_target === this.contact.my_info.get('id')) && this.account.mentions.create(null, {message: message, contact: this.contact});
                else if (this.contact.get('group_chat')) {
                    if (this._pending_my_info) {
                        this._pending_my_info.done(() => {
                            (mention_target === this.contact.my_info.get('id')) && this.account.mentions.create(null, {message: message, contact: this.contact});
                            this._pending_my_info = null;
                        });
                    }
                    else {
                        this._pending_my_info = new $.Deferred();
                        this.contact.getMyInfo(() => {
                            (mention_target === this.contact.my_info.get('id')) && this.account.mentions.create(null, {
                                message: message,
                                contact: this.contact
                            });
                            this._pending_my_info.resolve();
                        });
                    }
                }
                (mention_target === this.account.get('jid') || mention_target === "") && this.account.mentions.create(null, {message: message, contact: this.contact});
            });
        }

        if (this.model.messages_view && xabber.body.screen.get('right') === 'message_context' && this.model.messages_view.last_history_loaded)
            this.account.context_messages.add(message);

    },


    decryptImages: function (message, force) {
        let scrolled_from_bottom = this.getScrollBottom();
        if (this.model.get('encrypted') || message.get('encrypted') || force) {
            let images = message.get('images') || [];
            if (images.length) {
                images.forEach((img) => {
                    let source = img.sources[0];
                    if (!img.key)
                        return;
                    this.model.messages.decryptFile(source, img.key).then((result) => {
                        if (result === null)
                            return;
                        let $msg = [];
                        if (this.model.messages_view && xabber.body.screen.get('right') === 'message_context')
                            $msg = this.model.messages_view.$(`.chat-message[data-uniqueid="${message.get('unique_id')}"] img[src="${source}"]`);
                        else
                            $msg = this.$(`.chat-message[data-uniqueid="${message.get('unique_id')}"] img[src="${source}"]`);
                        if ($msg.length) {
                            $msg[0].src = result;
                            $msg[0].onload = () => {
                                if (!scrolled_from_bottom)
                                    this.scrollToBottom();
                                else
                                    this.scrollTo(this.ps_container[0].scrollHeight - scrolled_from_bottom);
                            };
                            $msg.attr('data-mfp-src', result);
                        }
                    });
                });
            }
            let fwd_msgs = message.get('forwarded_message') || [];
            fwd_msgs.forEach((fwd_msg) => {
                let fwd_images = fwd_msg.get('images') || [];
                fwd_images.forEach((img) => {
                    let source = img.sources[0];
                    if (!img.key)
                        return;
                    this.model.messages.decryptFile(source, img.key).then((result) => {
                        if (result === null)
                            return;
                        let $msg = this.$(`.chat-message[data-uniqueid="${message.get('unique_id')}"] .fwd-message[data-uniqueid="${fwd_msg.get('unique_id')}"] img[src="${source}"]`);
                        if ($msg.length) {
                            $msg[0].src = result;
                            $msg[0].onload = () => {
                                if (!scrolled_from_bottom)
                                    this.scrollToBottom();
                                else
                                    this.scrollTo(this.ps_container[0].scrollHeight - scrolled_from_bottom);
                            };
                            $msg.attr('data-mfp-src', result);
                        }
                    });
                });
            });
        }
    },

    addMessage: function (message) {
        let $message = this.buildMessageHtml(message),
            index = this.model.messages.indexOf(message);
        if (index === 0) {
            $message.prependTo(this.$('.chat-content'));
        } else if (this.model.messages.models.length && this.model.messages.models[index - 1]) {
            let $prev_message = this.$(`.chat-message[data-uniqueid="${this.model.messages.models[index - 1].get('unique_id')}"]`);
            if (!$prev_message.length) {
                $prev_message = this.addMessage(this.model.messages.models[index - 1]);
            }
            $message.insertAfter($prev_message);
        }
        let $next_message = $message.nextAll('.chat-message').first();
        this.updateMessageInChat($message[0], message);
        if ($next_message.length) {
            this.updateMessageInChat($next_message[0]);
        }
        this.initPopup($message);
        this.bottom.showChatNotification();
        return $message;
    },

    initPopup: function ($message) {
        let $one_image = $message.find('.uploaded-img'),
            $collage_image = $message.find('.uploaded-img-for-collage');
        if ($one_image.length) {
            $one_image.each((idx, item) => {
                this.initMagnificPopup($(item));
            });
        }
        if ($collage_image.length) {
            this.initZoomGallery($message);
        }
    },

    getImagesInformation: function (msg) {
        let images = msg.get('images'),
            servers = [];
        if (!images)
            return;
        images.forEach((img) => {
            let server = new URL(img.sources[0]).hostname;
            img.pretty_size = utils.pretty_size(img.size)
            servers.push(server);
        });
        servers = [...new Set(servers)]

        return {images, servers};
    },

    initMagnificPopup: function ($elem) {
        let self = this;
        $elem.length && $elem.magnificPopup({
            type: 'image',
            closeOnContentClick: true,
            fixedContentPos: true,
            mainClass: 'mfp-no-margins mfp-with-zoom',
            image: {
                verticalFit: true,
                titleSrc: function(item) {
                    return '<a class="image-source-link" href="'+item.el.attr('src')+'" target="_blank">' + self.model.messages.getFilename(item.el.attr('src')) + '</a>' + ' ' + item.el.attr('title');
                }
            },
            zoom: {
                enabled: true,
                duration: 300
            }
        });
    },

    initZoomGallery: function ($message) {
        let self = this;
        $message.find('.zoom-gallery').length && $message.find('.zoom-gallery').magnificPopup({
            delegate: 'img',
            type: 'image',
            closeOnContentClick: false,
            closeBtnInside: false,
            mainClass: 'mfp-with-zoom mfp-img-mobile',
            image: {
                verticalFit: true,
                titleSrc: function(item) {
                    return '<a class="image-source-link" href="'+item.el.attr('src')+'" target="_blank">' + self.model.messages.getFilename(item.el.attr('src')) + '</a>' + ' ' + item.el.attr('title');
                }
            },
            gallery: {
                enabled: true
            },
            zoom: {
                enabled: true,
                duration: 300,
                opener: function(element) {
                    return element;
                }
            }
        });
    },

    updateMessage: function (item) {
        let $message, images = item.get('images'), emoji = item.get('only_emoji'), $new_message,
            files =  item.get('files');
        if (item instanceof xabber.Message) {
            this.updateMentions(item);
            $new_message = this.buildMessageHtml(item);
            $message = this.$(`.chat-message[data-uniqueid="${item.get('unique_id')}"]`);
        }
        else
            return;
        $message.replaceWith($new_message)
        $message = this.$(`.chat-message[data-uniqueid="${item.get('unique_id')}"]`);
        this.updateMessageInChat($message[0], item);
        this.initPopup($message);
        this.bottom.showChatNotification();

        if (item.get('data_form')) {
            let data_form = utils.render_data_form(item.get('data_form'));
            $message.find('.chat-msg-content').append(data_form);
        }
        let short_datetime = utils.pretty_short_datetime(item.get('last_replace_time')),
            datetime = moment(item.get('last_replace_time')).format('D MMMM, YYYY HH:mm:ss'),
            new_title = `${pretty_datetime(item.get('time'))} ${xabber.getString("edited", [moment(item.get('timestamp')).startOf('day').isSame(moment(item.get('last_replace_time')).startOf('day')) ? short_datetime : datetime])}`;
        $message.find('.msg-time').prop('title', new_title);
        $message.find('.edited-info').removeClass('hidden').text(xabber.getString("chat_screen__message__label_edited")).prop('title', new_title);
    },

    removeAllMessagesExceptLast: function () {
        let messages_to_save = [];
        if (!this.model.messages)
            return;
        this.model.messages.forEach((message, idx) => {
            if (idx === (this.model.messages.length - 1)){
                messages_to_save.push(message);
                this.model.set('first_archive_id', message.get('stanza_id'));
                this.$(`.chat-message[data-uniqueid="${message.get('unique_id')}"]`).removeClass('unread-message');
                this.$(`.chat-message[data-uniqueid="${message.get('unique_id')}"]`).removeClass('unread-message-background');
                return;
            }
            let $message, $message_in_chat;
            $message_in_chat = this.$(`.chat-message[data-uniqueid="${message.get('unique_id')}"]`);
            (this.bottom.content_view) && ($message = this.bottom.content_view.$(`.chat-message[data-uniqueid="${message.get('unique_id')}"]`));
            $message.prev('.chat-day-indicator').remove();
            $message.remove();
        });
        this.model.messages.reset(messages_to_save);
        this.updateScrollBar();
    },

    removeMessage: function (item) {
        let message, $message, $message_in_chat;
        if (item instanceof xabber.Message) {
            message = item;
            $message_in_chat = this.$(`.chat-message[data-uniqueid="${item.get('unique_id')}"]`);
            (this.bottom.content_view) && ($message = this.bottom.content_view.$(`.chat-message[data-uniqueid="${item.get('unique_id')}"]`));
        } else {
            $message = item;
            if (!$message.length) return;
            message = this.model.messages.get($message.data('uniqueid'));
        }
        message && message.destroy();
        if ($message_in_chat) {
            this.removeMessageFromDOM($message_in_chat);
        }
        if ($message && ($message !== $message_in_chat))
            this.removeMessageFromDOM($message);
    },

    removeMessageFromDOM: function ($message) {
        if (($message.hasClass('with-author')) && (!$message.next().hasClass('with-author'))) {
            let avatar = $message.find('.circle-avatar')[0];
            $message.next().addClass('with-author');
            $message.next().find('.circle-avatar').replaceWith(avatar);
        }
        $message.prev('.chat-day-indicator').remove();
        $message.remove();
        this.bottom.manageSelectedMessages();
        if (!this._clearing_history) {
            this.updateScrollBar();
        }
    },

    clearHistory: function () {
        let dialog_options = [],
            dialog_message = this.contact.get('group_chat') ? xabber.getString("clear_group_chat_history_dialog_message") : xabber.getString("clear_chat_history_dialog_message"),
            is_group_chat = this.contact.get('group_chat') ? true : false;
        this._clearing_history = true;
        if (this.account.server_features.get(Strophe.NS.REWRITE)) {
            utils.dialogs.ask(xabber.getString("clear_history"), dialog_message,
                dialog_options, {ok_button_text: xabber.getString("clear_chat_history_dialog_button")}).done((res) => {
                if (!res) {
                    this._clearing_history = false;
                    return;
                }
                this.model.retractAllMessages(is_group_chat, () => {
                    this._clearing_history = false;
                    this.chat_item.updateLastMessage();
                    this.updateScrollBar();
                }, () => {
                    this._clearing_history = false;
                });
            });
        }
        else {
            utils.dialogs.ask(xabber.getString("clear_history"), `${dialog_message}\n${xabber.getString("dialog_clear_chat_history__warning_deletion_not_supported", [this.account.domain]).fontcolor('#E53935')})`,
                dialog_options, {ok_button_text: xabber.getString("clear_chat_history_dialog_button")}).done((res) => {
                if (!res) {
                    this._clearing_history = false;
                    return;
                }
                let msgs = _.clone(this.model.messages.models);
                msgs.forEach((item) => { this.removeMessage(item); });
            });
        }
    },

    renderVoiceMessage: function (element, file_url, chat) {
        let not_expanded_msg = element.innerHTML,
            unique_id = 'waveform' + moment.now(),
            $elem = $(element),
            $msg_element = $elem.closest('.link-file');
        chat = chat || this.model;
        $elem.addClass('voice-message-rendering').html($(templates.messages.audio_file_waveform({waveform_id: unique_id})));
        let aud = this.createAudio(file_url, $elem.find('#' + unique_id));

        let hideShowCursor = () => {
            let current_time = aud.getCurrentTime(),
                duration = aud.getDuration();
            if (current_time === 0 || current_time === duration)
                $msg_element.addClass('wave-cursor-hidden');
            else
                $msg_element.removeClass('wave-cursor-hidden');
        };

        aud.on('ready', () => {
            let duration = Math.round(aud.getDuration());
            hideShowCursor();
            $elem.find('.voice-msg-total-time').text(utils.pretty_duration(duration));
        });

        aud.on('error', () => {
            $elem.removeClass('voice-message-rendering');
            element.innerHTML = not_expanded_msg;
            aud.unAll();
            $elem.find('.voice-message-play').get(0).remove();
            utils.callback_popup_message(xabber.getString("jingle__error__audio_not_supported"), 3000);
        });

        aud.on('play', () => {
            $msg_element.addClass('playing');
            $msg_element.removeClass('wave-cursor-hidden');
            let is_popup;
            xabber.current_plyr_player && (is_popup = xabber.current_plyr_player.is_popup);
            xabber.current_plyr_player = chat.plyr_players.find(item => item.$audio_elem === $msg_element[0]);
            xabber.current_plyr_player && (xabber.current_plyr_player.chat_item = chat.item_view);
            xabber.current_plyr_player && (xabber.current_plyr_player.is_popup = is_popup);
            let other_players = xabber.plyr_players.filter(other => other != xabber.current_plyr_player);
            other_players.forEach(function(other) {
                if (other.$audio_elem){
                    if (other.$audio_elem.voice_message)
                        other.$audio_elem.voice_message.stopTime();
                }
            });
            (xabber.plyr_player_popup && xabber.plyr_player_popup.player) && xabber.plyr_player_popup.player.stop();
            (!xabber.current_plyr_player && xabber.plyr_player_popup) && xabber.plyr_player_popup.closePopup();
            let timerId = setInterval(function() {
                let cur_time = Math.round(aud.getCurrentTime());
                if (aud.isPlaying())
                    $elem.find('.voice-msg-current-time').text(utils.pretty_duration(cur_time));
                else
                    clearInterval(timerId);
            }, 100);
            xabber.trigger('plyr_player_updated');
        });

        aud.on('finish', () => {
            hideShowCursor();
            $msg_element.removeClass('playing');
        });

        aud.on('pause', () => {
            $msg_element.removeClass('playing');
            hideShowCursor();
            xabber.trigger('plyr_player_updated');
        });

        aud.on('seek', () => {
            hideShowCursor();
        });

        aud.stopTime = () => {
            aud.stop()
            $elem.find('.voice-msg-current-time').text(utils.pretty_duration(0));
        };

        $elem.find('.voice-message-volume')[0].onchange = () => {
            aud.setVolume($elem.find('.voice-message-volume').val()/100);
        };
        return aud;
    },

    createImageGrid: function (attrs) {
        let template_for_images;
        if (attrs.images.length > 6) {
            let tpl_name = 'template-for-6',
                hidden_images = attrs.images.length - 5;
            !xabber.settings.load_media && (tpl_name = 'hidden-template-for-6')
            template_for_images = $(templates.messages[tpl_name](attrs));
            template_for_images.find('.last-image').addClass('hidden-images');
            template_for_images.find('.image-counter').text('+' + hidden_images);
        }
        else {
            let tpl_name = 'template-for-' + attrs.images.length;
            !xabber.settings.load_media && (tpl_name = 'hidden-template-for-' + attrs.images.length)
            template_for_images = $(templates.messages[tpl_name](attrs));
        }
        if (!xabber.settings.load_media) {
            template_for_images.find('img').removeClass('uploaded-img-for-collage popup-img').addClass('unloaded-img')
        }
        return template_for_images;
    },

    buildMessageHtml: function (message) {
        let attrs = _.clone(message.attributes),
            is_sender = (message instanceof xabber.Message) ? message.isSenderMe() : false,
            user_info = attrs.user_info || {}, username,
            images = attrs.images,
            videos = attrs.videos,
            emoji = message.get('only_emoji'),
            files =  attrs.files,
            locations =  attrs.locations,
            link_references =  attrs.link_references,
            is_video = Boolean(videos && videos.length),
            is_image = Boolean(images && images.length),
            is_location = locations ? true : false,
            is_file = files ? true : false,
            is_audio = false,
            template_for_images,
            avatar_id = user_info.avatar,
            avatar_url = user_info.avatar_url,
            role = user_info.role,
            badge = user_info.badge,
            from_id = user_info.id,
            has_encrypted_files = attrs.has_encrypted_files,
            audio_player_list = [];

        username = user_info.nickname || this.model.get('saved') && this.account.get('name') || (attrs.from_jid === this.contact.get('jid') && this.contact.get('name'));
        if (!username) {
            if (is_sender) {
                if (this.model.get("group_chat")) {
                    if (this.contact.my_info)
                        username = this.contact.my_info.get('nickname');
                    else if (this.contact)
                        this.contact.getMyInfo(() => {
                            username = this.contact.my_info.get('nickname');
                            if ($message) {
                                $message.children(".msg-wrap").find(".chat-msg-author-wrap .chat-msg-author").text(Strophe.xmlescape(username));
                            }
                        });
                    else
                        username = this.account.get('name');
                } else
                    username = this.account.get('name');
            } else {
                username = this.account.contacts.get(attrs.from_jid) ? this.account.contacts.get(attrs.from_jid).get('name') : attrs.from_jid;
            }
        }
        username = Strophe.xmlescape(username || "");

        if (is_sender && this.model.get('group_chat')) {
            if (this.contact.my_info) {
                role = this.contact.my_info.get('role');
                badge = this.contact.my_info.get('badge');
            }
        }
        _.extend(attrs, {
            username: username,
            state: (message instanceof xabber.Message) ? message.getState() : 'sent',
            verbose_state: (message instanceof xabber.Message) ? message.getVerboseState() : 'sent',
            time: pretty_datetime(attrs.time),
            short_time: utils.pretty_time(attrs.time),
            avatar_id: avatar_id,
            avatar_url: avatar_url,
            is_image: is_image,
            is_video: is_video,
            is_file: is_file,
            is_location: is_location,
            files: files,
            locations: locations,
            link_references: link_references,
            role: utils.pretty_name(role),
            badge: badge,
            from_id: from_id
        });
        attrs.encrypted = attrs.encrypted || this.model.get('encrypted');
        attrs.ephemeral_timer = attrs.ephemeral_timer || this.model.get('ephemeral_timer');
        attrs.not_encrypted = attrs.not_encrypted || null;
        attrs.not_verified_device = attrs.not_verified_device || null;
        attrs.not_verified_device_no_device = attrs.not_verified_device_no_device || null;
        attrs.device_id = attrs.device_id || null;

        if (attrs.type === 'system') {
            let tpl_name = attrs.invite ? 'group_request' : 'system';
            return $(templates.messages[tpl_name](attrs));
        }

        if (is_image) {
            if (images.length > 1) {
                template_for_images = this.createImageGrid(attrs);
            }
        }

        let classes = [
            attrs.is_unread && 'unread-message',
            attrs.is_unread && 'unread-message-background',
            attrs.not_encrypted && 'not-decrypted',
            attrs.not_verified_device && !attrs.not_verified_device_no_device && 'not-verified',
            attrs.not_verified_device_no_device && 'not-existing-device',
            attrs.forwarded_message && 'forwarding',
            (attrs.encrypted || this.model.get('encrypted')) ? 'encrypted' : ""
        ];

        let markup_body = utils.markupBodyMessage(message), $message;
        if (attrs.searched_message){
            let myRegexp = new RegExp('(.{0,12})(' + attrs.query + ')(.{0,12})','gmius'),
                matching_markup = myRegexp.exec(markup_body);
            if (matching_markup) {
                if (matching_markup[1].length == 12)
                    matching_markup[1] = '...' + matching_markup[1].substring(1);
                if (matching_markup[3].length == 12)
                    matching_markup[3] = matching_markup[3].substring(0, matching_markup[3].length - 1) + '...';
                markup_body = matching_markup[1] + '<span class="mention ground-color-100">' + matching_markup[2] + '</span>' + matching_markup[3];
                markup_body = markup_body.replace(/\n/g, " ");;
            }
        }

        if (this.model.get('saved') && !markup_body.length && attrs.forwarded_message && attrs.forwarded_message.length == 1) {
            $message = $(templates.messages.saved_main(_.extend(attrs, {
                classlist: classes.join(' ')
            })));
        } else if (attrs.searched_message)
            $message = $(templates.messages.searched(_.extend(attrs, {
                is_sender: is_sender,
                message: markup_body,
                msg_time: utils.pretty_short_datetime_recent_chat(attrs.time),
                classlist: classes.join(' ')
            })));
        else if (attrs.type === 'file_upload')
            $message = $(templates.messages.file_upload(_.extend(attrs, {
                is_sender: is_sender,
                message: markup_body,
                ephemeral_timer_text: utils.pretty_duration_ephemeral_timer(attrs.ephemeral_timer),
                classlist: classes.join(' ')
            })));
        else
            $message = $(templates.messages.main(_.extend(attrs, {
                is_sender: is_sender,
                message: markup_body,
                ephemeral_timer_text: utils.pretty_duration_ephemeral_timer(attrs.ephemeral_timer),
                classlist: classes.join(' ')
            })));

        if (attrs.hasOwnProperty('encrypted')){
            if (attrs.hasOwnProperty('submitted_here')){
                $message.attr('data-trust', true);
                if (attrs.hasOwnProperty('is_contact_trusted')){
                    $message.attr('data-trust', attrs.is_contact_trusted);
                }
            } else if (attrs.hasOwnProperty('is_trusted')){
                $message.attr('data-trust', attrs.is_trusted);
            } else {
                $message.attr('data-trust', this.$el.attr('data-trust'));
            }
        }

        if (is_image) {
            if (images.length > 1) {
                $message.find('.chat-msg-media-content').html(template_for_images);
                !xabber.settings.load_media && $message.find('.img-content-template').first().append($('<div class="img-privacy-warning"/>').text(xabber.getString("load_image_privacy_warning")))
            }
            if (images.length == 1) {
                let $img_html = this.createImage(images[0]),
                    img_content = this.createImageContainer(images[0]);
                $img_html.onload = () => {
                    this.imageOnload($message);
                };
                $message.find('.chat-msg-media-content').html($(img_content).html($img_html));
                !xabber.settings.load_media && $message.find('.img-content').append($('<div class="img-privacy-warning"/>').text(xabber.getString("load_image_privacy_warning")))
                this.updateScrollBar();
            }
        }
        if (is_video) {
            let video_content = this.createVideoContainer();
            $message.find('.chat-msg-media-content').append(video_content);
            videos.forEach((video, idx) => {
                let video_el = this.createVideo(video, idx);
                $message.find('.video-content').append(video_el);
            });
            this.videoOnload($message, message);
            $message.removeClass('file-upload noselect');
        }

        if (is_file && attrs.type !== 'file_upload') {
            if (files.length > 0) {
                let file_attrs = _.clone(files),
                    template_for_file_content;
                $(file_attrs).each((idx, file) => {
                    let copied_attrs = _.clone(file_attrs[idx]);
                    if (file.type) {
                        if (file.voice)
                            is_audio = true;
                        else
                            is_audio = false;
                    }
                    ((file_attrs.length === 1) && is_audio) && (file.name = xabber.getString("voice_message"));
                    let mdi_icon_class = utils.file_type_icon(file.type);
                    _.extend(copied_attrs, { is_audio: is_audio, duration: utils.pretty_duration(copied_attrs.duration), mdi_icon: mdi_icon_class, size: utils.pretty_size(copied_attrs.size) });
                    template_for_file_content = is_audio ? $(templates.messages.audio_file(copied_attrs)) : $(templates.messages.file(copied_attrs));
                    $message.find('.chat-msg-media-content').append(template_for_file_content);
                    if (is_audio && $message.find('.link-file').length) {
                        let audio_player = {$audio_elem : $message.find('.link-file')[0]};
                        audio_player.msg_time = $message.attr('data-time');
                        audio_player.author = username;
                        audio_player.message_unique_id = $message.attr('data-uniqueid');
                        if (attrs.from_jid === this.account.get('jid')) {
                            if (this.model.get('group_chat')) {
                                if (this.contact.my_info) {
                                    audio_player.contact_avatar = this.contact.my_info.get('b64_avatar');
                                    if (!audio_player.contact_avatar) {
                                        if (this.account.cached_image)
                                            audio_player.contact_avatar = this.account.cached_image;
                                        !audio_player.contact_avatar && (audio_player.contact_avatar = Images.getDefaultAvatar(this.contact.my_info.get('nickname')));
                                    } else
                                        audio_player.contact_avatar = Images.getCachedImage(audio_player.contact_avatar);
                                }
                            }
                            if (!audio_player.contact_avatar)
                                audio_player.contact_avatar = this.account.cached_image;
                        } else {
                            if (this.model.get('group_chat')) {
                                let author = $message.find('.msg-wrap .chat-msg-author').text();
                                audio_player.contact_avatar = Images.getDefaultAvatar(author);
                            }
                            else {
                                let author = this.account.contacts.get($message.data('from')) || $message.find('.msg-wrap .chat-msg-author').text() || $message.data('from');
                                audio_player.contact_avatar = author.cached_image || Images.getDefaultAvatar(author);
                            }
                        }
                        if (!this.model.plyr_players.filter(obj => { return (obj.message_unique_id === audio_player.message_unique_id)}).length) {
                            this.model.plyr_players = this.model.plyr_players.concat([audio_player]).sort((a, b) => a.msg_time - b.msg_time);
                            xabber.plyr_players = xabber.plyr_players.concat([audio_player]);
                            audio_player_list = audio_player_list.concat([audio_player]);
                        } else {
                            audio_player_list = message.get('msg_player_audios');
                        }

                        let f_url = $message.find('.link-file').find('.file-link-download').attr('href');
                        $message.find('.link-file').find('.mdi-play').removeClass('no-uploaded');
                        audio_player.$audio_elem.voice_message = this.renderVoiceMessage($message.find('.link-file').find('.file-container')[0], f_url);

                        xabber.trigger('plyr_player_updated');
                    }
                });
            }
        }

        if (is_file && attrs.type === 'file_upload') {
            let images = [];
            $(files).each((idx, file_) => {
                file_.upload_id = idx;
                if (utils.isImageType(file_.type)) {
                    file_.sources = [file_.key ? file_.image_prev.src : window.URL.createObjectURL(new Blob([file_])),];
                    images.push(file_);
                }
            });
            if (images.length > 0) {
                if (images.length > 1) {
                    let template_for_images;
                    if (images.length > 6) {
                        let tpl_name = 'template-for-6',
                            hidden_images = images.length - 5;
                        template_for_images = $(templates.messages[tpl_name]({images}));
                        template_for_images.find('.last-image').addClass('hidden-images');
                        template_for_images.find('.image-counter').text('+' + hidden_images);
                    }
                    else {
                        let tpl_name = 'template-for-' + images.length;
                        template_for_images = $(templates.messages[tpl_name]({images}));
                    }
                    template_for_images.addClass('unuploaded-images');
                    $(templates.messages.loading_circle()).insertAfter(template_for_images.find('img'));
                    $message.find('.chat-msg-media-content.chat-main-upload-media').prepend(template_for_images);
                } else {
                    let $img_html = this.createImage(images[0]),
                        img_content = this.createImageContainer(images[0]),
                        maxHeight = 400,
                        maxWidth = (xabber.main_panel.$el.width() * 0.715 - 176) * 0.7,
                        imgHeight = images[0].height,
                        imgWidth = images[0].width;
                    maxWidth = maxWidth > 400 ? 400 : maxWidth;
                    if (imgHeight && imgWidth) {
                        if (imgWidth > maxWidth) {
                            imgHeight = imgHeight * (maxWidth/imgWidth);
                            imgWidth = maxWidth;
                        }
                        if (imgHeight > maxHeight) {
                            imgWidth = imgWidth * (maxHeight/imgHeight);
                            imgHeight = maxHeight;
                        }
                    }
                    imgWidth = imgWidth ? imgWidth : 200;
                    imgHeight = imgHeight ? imgHeight : 200;
                    $(img_content).addClass('unuploaded-images');
                    $(img_content).attr('data-upload-file-id', images[0].upload_id);
                    $(img_content).css({
                        width: imgWidth,
                        height: imgHeight,
                        'max-height': maxHeight,
                        'max-width': maxWidth,
                    });
                    $(img_content).html($img_html)
                    $(img_content).append(templates.messages.loading_circle());
                    $message.find('.chat-msg-media-content.chat-main-upload-media').prepend(img_content);
                }
            }
            if (files.length > 0) {
                $(files).each((idx, item) => {
                    if (images.includes(item))
                        return;
                    let file_attrs = {
                            name: item.name,
                            type: item.type,
                            upload_id: item.upload_id,
                        },
                        template_for_file_content;
                    _.extend(file_attrs, {size: utils.pretty_size(item.size)});
                    template_for_file_content = $(templates.messages.file_loading(file_attrs));
                    template_for_file_content.find('.file-loading-container').html(templates.messages.loading_circle());
                    $message.find('.chat-msg-media-content.chat-main-upload-media').append(template_for_file_content);
                });
            }
        }
        if (is_location) {
            if (locations.length > 0) {
                let location_attrs = _.clone(locations),
                    template_for_location_content;
                $(location_attrs).each((idx, location) => {
                    let copied_attrs = _.clone(location_attrs[idx]);
                    _.extend(copied_attrs, { id: '_' + Math.random().toString(36).substr(2, 9)});
                    if (xabber.settings.mapping_service){
                        template_for_location_content = $(templates.messages.location(copied_attrs));
                        $message.find('.chat-msg-location-content').attr('lon', copied_attrs.lon);
                        $message.find('.chat-msg-location-content').attr('lat', copied_attrs.lat);
                        $message.find('.chat-msg-location-content').append(template_for_location_content);
                        this.loadLocationInChat($message, copied_attrs);
                        this.locationOnload($message);
                    } else {
                        $message.find('.chat-msg-content').append('<a class="location-link" href="geo:' + copied_attrs.lat + ',' + copied_attrs.lon + '">' + xabber.getString("recent_chat__last_message__locations_plural_0") + '</a>');
                    }
                });
            }
        }

        if (link_references && link_references.length > 0) {
            let link_references_attrs = _.clone(link_references),
                template_for_link_reference_content,
                youtube_url_regexp = new RegExp('^((?:https?:)?\\/\\/)?((?:www|m)\\.)?((?:youtube(-nocookie)?\\.com|youtu.be))(\\/(?:[\\w\\-]+\\?v=|embed\\/|v\\/)?)([\\w\\-]+)(\\S+)?$', 'i'),
                vimeo_url_regexp = /(?:www\.|player\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|)(\d+)(?:[a-zA-Z0-9_\-]+)?/i;
            $(link_references_attrs).each((idx, link) => {
                let copied_attrs = _.clone(link_references_attrs[idx]);
                copied_attrs.domain = copied_attrs.url ? utils.getDomainFromUrl(copied_attrs.url) : copied_attrs.site_name;
                if (copied_attrs.original_text && !/^https?:\/\//i.test(copied_attrs.original_text))
                    copied_attrs.original_text = 'http://' + copied_attrs.original_text;
                if (link_references_attrs[idx].type && link_references_attrs[idx].type.includes('video') && link_references_attrs[idx].video_url && (youtube_url_regexp.test(link_references_attrs[idx].video_url) || vimeo_url_regexp.test(link_references_attrs[idx].video_url))){
                    copied_attrs.video_url = link_references_attrs[idx].video_url.replace("autoplay=1&", "");
                    copied_attrs.is_video = true;
                    youtube_url_regexp.test(link_references_attrs[idx].video_url) && (copied_attrs.provider = 'youtube');
                    vimeo_url_regexp.test(link_references_attrs[idx].video_url) && (copied_attrs.provider = 'vimeo');
                } else
                    copied_attrs.is_video = false;
                template_for_link_reference_content = $(templates.messages.link_reference_chat(copied_attrs));
                $message.find('.chat-msg-link-reference-content').append(template_for_link_reference_content);
            });
            this.OGPLinkOnload($message, message);
        }

        if (message.get('data_form')) {
            let data_form = utils.render_data_form(message.get('data_form'));
            $message.find('.chat-msg-content').append(data_form);
        }

        if (attrs.forwarded_message && !attrs.searched_message) {
            $(attrs.forwarded_message).each((idx, fwd_msg) => {
                is_sender = fwd_msg.isSenderMe();
                attrs = _.clone(fwd_msg.attributes);
                let is_image_forward = Boolean(attrs.images && attrs.images.length),
                    images_forward = is_image_forward ? _.clone(attrs.images) : undefined,
                    $img_html_forward,
                    is_forward_video = Boolean(attrs.videos && attrs.videos.length),
                    is_forward_file = Boolean(attrs.files && attrs.files.length),
                    is_forward_location = Boolean(attrs.locations && attrs.locations.length),
                    is_fwd_voice_message,
                    user_info = attrs.user_info || {},
                    avatar_id = user_info.avatar,
                    avatar_url = user_info.avatar_url,
                    role = utils.pretty_name(user_info.role),
                    badge = user_info.badge,
                    from_id = user_info.id,
                    from_jid = attrs.from_jid;
                !has_encrypted_files && (has_encrypted_files = attrs.has_encrypted_files);
                if (is_sender) {
                    username = Strophe.xmlescape(user_info.nickname || this.account.get('name'));
                } else {
                    username = Strophe.xmlescape(user_info.nickname || user_info.id || this.account.contacts.mergeContact({jid: from_jid}).get('name'));
                }

                let fwd_markup_body = utils.markupBodyMessage(fwd_msg);

                let $f_message = $(templates.messages.forwarded(_.extend(attrs, {
                    time: pretty_datetime(attrs.time),
                    short_time: utils.pretty_short_month_date(attrs.time),
                    username: username,
                    avatar_id: avatar_id,
                    avatar_url: avatar_url,
                    message: fwd_markup_body,
                    is_file: is_forward_file,
                    is_location: is_forward_location,
                    is_audio: is_fwd_voice_message,
                    role: role,
                    badge: badge,
                    from_id: from_id
                })));

                if (this.model.get('saved') && $message.hasClass('saved-main')) {
                    $f_message.append($message.children('.right-side').clone());
                }

                if (fwd_msg.get('forwarded_message')) {
                    let fwd_messages_count = fwd_msg.get('forwarded_message').length,
                        fwd_messages_link = xabber.getQuantityString("forwarded_messages_count", fwd_messages_count);
                    $f_message.children('.msg-wrap').children('.fwd-msgs-block').append($('<a/>', {class: 'collapsed-forwarded-message', 'data-uniqueid': attrs.unique_id}).text(fwd_messages_link));
                }

                if (is_image_forward) {
                    if (images_forward.length > 1) {
                        template_for_images = this.createImageGrid(attrs);
                        $f_message.find('.chat-msg-media-content').html(template_for_images);
                        !xabber.settings.load_media && $f_message.find('.img-content-template').first().append($('<div class="img-privacy-warning"/>').text(xabber.getString("load_image_privacy_warning")))
                    }
                    if (images_forward.length == 1) {
                        $img_html_forward = this.createImage(images_forward[0]);
                        $img_html_forward.onload = () => {
                            this.imageOnload($message);
                        };
                        let img_content_forward = this.createImageContainer(images_forward[0]);
                        $f_message.find('.chat-msg-media-content').html($(img_content_forward).html($img_html_forward));
                        !xabber.settings.load_media && $f_message.find('.img-content').append($('<div class="img-privacy-warning"/>').text(xabber.getString("load_image_privacy_warning")))
                    }
                }
                if (is_forward_video) {
                    let video_content = this.createVideoContainer();
                    $f_message.find('.chat-msg-media-content').append(video_content);
                    attrs.videos.forEach((video, idx) => {
                        let video_el = this.createVideo(video, idx);
                        $f_message.find('.video-content').append(video_el);
                    });
                    this.videoOnload($message, message);
                    $f_message.removeClass('file-upload noselect');
                }

                if (is_forward_file) {
                    if (attrs.files.length > 0) {
                        let file_attrs = _.clone(attrs.files),
                            template_for_file_content;
                        $(file_attrs).each((idx, file) => {
                            let copied_attrs = _.clone(file_attrs[idx]);
                            if (file.type) {
                                if (file.voice)
                                    is_audio = true;
                                else
                                    is_audio = false;
                            }
                            ((file_attrs.length === 1) && is_audio) && (file.name = xabber.getString("voice_message"));
                            let mdi_icon_class = utils.file_type_icon(file.type);
                            _.extend(copied_attrs, { is_audio: is_audio, duration: utils.pretty_duration(copied_attrs.duration), mdi_icon: mdi_icon_class, size: utils.pretty_size(copied_attrs.size)});
                            template_for_file_content = is_audio ? $(templates.messages.audio_file(copied_attrs)) : $(templates.messages.file(copied_attrs));
                            $f_message.find('.chat-msg-media-content').append(template_for_file_content);
                            if (is_audio && $f_message.find('.link-file').length) {
                                let audio_player = {$audio_elem : $f_message.find('.link-file')[0]};
                                audio_player.msg_time = $message.attr('data-time');
                                audio_player.author = username;
                                audio_player.message_unique_id = $message.attr('data-uniqueid') + '-' + $f_message.attr('data-uniqueid');
                                if (is_sender) {
                                    if (this.model.get('group_chat')) {
                                        if (this.contact.my_info) {
                                            audio_player.contact_avatar = this.contact.my_info.get('b64_avatar');
                                            if (!audio_player.contact_avatar)
                                                audio_player.contact_avatar = this.account.cached_image || Images.getDefaultAvatar(this.contact.my_info.get('nickname'));
                                            else
                                                audio_player.contact_avatar = Images.getCachedImage(audio_player.contact_avatar);
                                        }
                                    }
                                    if (!audio_player.contact_avatar)
                                        audio_player.contact_avatar = this.account.cached_image;
                                } else if (this.account.contacts.mergeContact({jid: from_jid})) {
                                    let contact = this.account.contacts.mergeContact({jid: from_jid})
                                    audio_player.contact_avatar = contact.cached_image || (this.model.get('group_chat') ? Images.getDefaultAvatar($f_message.find('.msg-wrap .fwd-msg-author').text()) : Images.getDefaultAvatar(contact));
                                }
                                if (!this.model.plyr_players.filter(obj => { return (obj.message_unique_id === audio_player.message_unique_id)}).length) {
                                    this.model.plyr_players = this.model.plyr_players.concat([audio_player]).sort((a, b) => a.msg_time - b.msg_time);
                                    xabber.plyr_players = xabber.plyr_players.concat([audio_player]);
                                    audio_player_list = audio_player_list.concat([audio_player]);
                                } else {
                                    audio_player_list = message.get('msg_player_audios');
                                }
                                let f_url = $f_message.find('.link-file').find('.file-link-download').attr('href');
                                $f_message.find('.link-file').find('.mdi-play').removeClass('no-uploaded');
                                audio_player.$audio_elem.voice_message = this.renderVoiceMessage($f_message.find('.link-file').find('.file-container')[0], f_url);
                                xabber.trigger('plyr_player_updated');
                            }
                        });
                    }
                }
                if (is_forward_location) {
                    if (attrs.locations.length > 0) {
                        let location_attrs = _.clone(attrs.locations),
                            template_for_location_content;
                        $(location_attrs).each((idx, location) => {
                            let copied_attrs = _.clone(location_attrs[idx]);
                            _.extend(copied_attrs, { id: '_fwd' + Math.random().toString(36).substr(2, 9) });
                            if (xabber.settings.mapping_service){
                                template_for_location_content = $(templates.messages.location(copied_attrs));
                                $f_message.find('.chat-msg-location-content').attr('lon', copied_attrs.lon);
                                $f_message.find('.chat-msg-location-content').attr('lat', copied_attrs.lat);
                                $f_message.find('.chat-msg-location-content').append(template_for_location_content);
                                this.loadLocationInChat($message, copied_attrs);
                            } else {
                                $f_message.find('.chat-msg-content').append('<a class="location-link" href="geo:' + copied_attrs.lat + ',' + copied_attrs.lon + '">' + xabber.getString("recent_chat__last_message__locations_plural_0") + '</a>');
                            }
                        });
                    }
                }
                if (attrs.link_references && attrs.link_references.length > 0) {
                    let link_references_attrs = _.clone(attrs.link_references),
                        template_for_link_reference_content,
                        youtube_url_regexp = new RegExp('^((?:https?:)?\\/\\/)?((?:www|m)\\.)?((?:youtube(-nocookie)?\\.com|youtu.be))(\\/(?:[\\w\\-]+\\?v=|embed\\/|v\\/)?)([\\w\\-]+)(\\S+)?$', 'i'),
                        vimeo_url_regexp = /(?:www\.|player\.)?vimeo.com\/(?:channels\/(?:\w+\/)?|groups\/(?:[^\/]*)\/videos\/|album\/(?:\d+)\/video\/|video\/|)(\d+)(?:[a-zA-Z0-9_\-]+)?/i;
                    $(link_references_attrs).each((idx, link) => {
                        let copied_attrs = _.clone(link_references_attrs[idx]);
                        copied_attrs.domain = copied_attrs.url ? utils.getDomainFromUrl(copied_attrs.url) : copied_attrs.site_name;
                        if (copied_attrs.original_text && !/^https?:\/\//i.test(copied_attrs.original_text))
                            copied_attrs.original_text = 'http://' + copied_attrs.original_text;
                        if (link_references_attrs[idx].type && link_references_attrs[idx].type.includes('video') && link_references_attrs[idx].video_url && (youtube_url_regexp.test(link_references_attrs[idx].video_url) || vimeo_url_regexp.test(link_references_attrs[idx].video_url))){
                            copied_attrs.video_url = link_references_attrs[idx].video_url.replace("autoplay=1&", "");
                            copied_attrs.is_video = true;
                            youtube_url_regexp.test(link_references_attrs[idx].video_url) && (copied_attrs.provider = 'youtube');
                            vimeo_url_regexp.test(link_references_attrs[idx].video_url) && (copied_attrs.provider = 'vimeo');
                        } else
                            copied_attrs.is_video = false;
                        template_for_link_reference_content = $(templates.messages.link_reference_chat(copied_attrs));
                        $f_message.find('.chat-msg-link-reference-content').append(template_for_link_reference_content);
                    });
                    this.OGPLinkOnload($message, message);
                }
                if (fwd_msg.get('data_form')) {
                    let data_form = utils.render_data_form(fwd_msg.get('data_form'));
                    $f_message.find('.chat-msg-content').append(data_form);
                }
                $message.children('.msg-wrap').length ? $message.children('.msg-wrap').children('.fwd-msgs-block').append($f_message) : $message.children('.fwd-msgs-block').append($f_message);
            });
            this.updateScrollBar();
            if (this.model.get('saved') && $message.hasClass('saved-main')) {
                $message.children('.right-side').remove();
            }
        }
        else
            $message.find('.fwd-msgs-block').remove();

        if (attrs.encrypted || this.model.get('encrypted') || has_encrypted_files) {
            this.decryptImages(message, has_encrypted_files);
        }

        if (attrs.searched_message) {
            let msg_text = '';
            msg_text = (attrs.forwarded_message) ? (xabber.getQuantityString("forwarded_messages_count", attrs.forwarded_message.length)) : '';
            if (is_file && is_image && files.length && images.length)
                msg_text = xabber.getString("recent_chat__last_message__attachments", [files.length + images.length]);
            else {
                if (is_file && files.length == 1 && (files[0].is_audio || files[0].voice))
                    msg_text = `${xabber.getString("voice_message")}, ` + utils.pretty_duration(files[0].duration);
                else if (is_file && files.length > 0) {
                    let total_size = 0;
                    files.forEach((f) => {
                        total_size += Number(f.size)
                    });
                    msg_text = xabber.getQuantityString("recent_chat__last_message__files", files.length) + (total_size > 0 ? `, ${utils.pretty_size(total_size)}` : "");
                }
                if (is_image && images.length > 0) {
                    let total_size = 0;
                    images.forEach((f) => {
                        total_size += Number(f.size)
                    });
                    msg_text = xabber.getQuantityString("recent_chat__last_message__images", images.length) + (total_size > 0 ? `, ${utils.pretty_size(total_size)}` : "");
                }
                if (is_location && locations.length > 0) {
                    msg_text = xabber.getQuantityString("recent_chat__last_message__locations", locations.length);
                }
            }
            if (msg_text)
                $message.find('.chat-msg-content').text(msg_text)
        }
        message.set('msg_player_audios', audio_player_list);
        $message = $message.hyperlinkify({selector: '.chat-text-content', embed_video: true}).emojify('.chat-text-content', {tag_name: 'div', emoji_size: utils.emoji_size(emoji)}).emojify('.chat-msg-author-badge', {emoji_size: 16});
        message.set('msg_el', $message);
        return $message;
    },

    getDateIndicator: function (date) {
        let day_date = moment(date).startOf('day');
        return $('<div class="chat-day-indicator one-line noselect"' + (this.model.get('encrypted') ? (' data-trust="' + (this.bottom.$el.attr('data-trust') || this.bottom.$el.attr('data-contact-trust')) + '"') : "") + ' data-time="'+
            day_date.format('x')+'">'+pretty_date(day_date)+'</div>');
    },

    initPlyrEmbedPlayer: function ($msg, msg) {
        let message = this.model.messages.get($msg.data('uniqueid')) || msg,
            msg_players = [],
            msg_videos = message && message.get('videos') && message.get('videos').length ? message.get('videos') : null;
        $msg.find('.plyr-video-container:not(.no-load)').each((idx, item) => {
            if ($(item).hasClass('no-load'))
                return;
            let existing_player = this.model.plyr_players.filter(obj => { return (obj.message_id === idx && obj.message_unique_id === $msg.attr('data-uniqueid'))}),
                player;
            if (existing_player.length){
                player = existing_player[0]
                msg_players = msg_players.concat([player]);
            } else {
                player = {video_src: $(item).attr('data-src')}
                player.provider = $(item).attr('data-provider');
                player.video_id = $(item).attr('data-msg-video-id');
                player.msg_time = $msg.attr('data-time');
                player.chat_item = this.model.item_view;
                player.message_id = idx;
                player.message_unique_id = $msg.attr('data-uniqueid');
                if (msg_videos && msg_videos.length && player.video_id >= 0) {
                    let video_file = msg_videos[player.video_id];
                    video_file && (player.video_file = video_file);
                }
                this.model.plyr_players = this.model.plyr_players.concat([player]).sort((a, b) => a.msg_time - b.msg_time);
                xabber.plyr_players = xabber.plyr_players.concat([player]);
                msg_players = msg_players.concat([player]);
            }
            $(item).attr('data-message-id', player.message_id);
            $(item).addClass('no-load');
            if (xabber.current_plyr_player && xabber.current_plyr_player.player_item)
                if (xabber.current_plyr_player.player_item.message_id === player.message_id && xabber.current_plyr_player.player_item.message_unique_id === player.message_unique_id)
                    $(item).addClass('active-plyr-container');
        });
        msg_players.length && message && message.set('msg_player_videos', msg_players);
        xabber.trigger('plyr_player_updated');
    },

    hideMessageAuthor: function ($msg) {
        $msg.removeClass('with-author');
    },

    showMessageAuthor: function ($msg) {
        if ($msg.hasClass('system'))
            return;
        $msg.addClass('with-author');
        let image, $avatar = $msg.find('.left-side .circle-avatar'),
            from_jid = $msg.data('from');
        if (from_jid === this.account.get('jid')) {
            if (this.model.get('group_chat')) {
                if (this.contact.my_info) {
                    image = this.contact.my_info.get('b64_avatar');
                    if (!image) {
                        if (this.account.cached_image)
                            image = this.account.cached_image;
                        !image && (image = Images.getDefaultAvatar(this.contact.my_info.get('nickname')));
                    } else
                        image = Images.getCachedImage(image);
                }
            }
            if (!image)
                image = this.account.cached_image;
        } else {
            if (this.model.get('group_chat')) {
                let author = $msg.find('.msg-wrap .chat-msg-author').text();
                image = Images.getDefaultAvatar(author);
            }
            else {
                let author = this.account.contacts.get($msg.data('from')) || $msg.find('.msg-wrap .chat-msg-author').text() || $msg.data('from');
                image = author.cached_image || Images.getDefaultAvatar(author);
            }
        }
        $avatar.setAvatar(image, this.avatar_size);
        if ($msg.data('avatar')) {
            if ($msg.data('from-id')) {
                if (this.account.chat_settings.getHashAvatar($msg.data('from-id')) == $msg.data('avatar') && (this.account.chat_settings.getB64Avatar($msg.data('from-id')))) {
                    $avatar.setAvatar(this.account.chat_settings.getB64Avatar($msg.data('from-id')), this.avatar_size);
                }
                else {
                    let pending_avatar = this._pending_avatars.find(a => a.hash == $msg.data('avatar'));
                    if (pending_avatar) {
                        pending_avatar.dfd.done((data_avatar) => {
                            $avatar.setAvatar(data_avatar, this.avatar_size);
                            let idx = this._pending_avatars.indexOf(pending_avatar);
                            if (idx > -1)
                                this._pending_avatars.splice(idx, 1);
                        });
                    } else {
                        if($msg.data('avatar-url')){
                            $avatar.setAvatar($msg.data('avatar-url'), this.avatar_size);
                            this.account.chat_settings.updateCachedAvatars($msg.data('from-id'), $msg.data('avatar'), $msg.data('avatar-url'));
                        }
                        else
                        {
                            let node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + $msg.data('from-id'), dfd = new $.Deferred();
                            this._pending_avatars.push({hash: $msg.data('avatar'), dfd: dfd});
                            this.contact.getAvatar($msg.data('avatar'), node, (data_avatar) => {
                                $avatar.setAvatar(data_avatar, this.avatar_size);
                                this.account.chat_settings.updateCachedAvatars($msg.data('from-id'), $msg.data('avatar'), data_avatar);
                                dfd.resolve(data_avatar);
                            });

                        }
                    }
                }
            }
        }
    },

    hideFwdMessageAuthor: function ($msg) {
        $msg.removeClass('with-author');
    },

    showFwdMessageAuthor: function ($fwd_message) {
        if (!$fwd_message.length)
            return;
        $fwd_message.addClass('with-author');
        let image,
            $avatar = $fwd_message.find('.circle-avatar'),
            from_jid = $fwd_message.data('from'),
            is_sender = (from_jid === this.account.get('jid')),
            contact = this.account.contacts.get(from_jid) || from_jid;
        if (is_sender) {
            if (this.model.get('group_chat')) {
                if (this.contact.my_info) {
                    image = this.contact.my_info.get('b64_avatar');
                    if (!image)
                        image = this.account.cached_image || Images.getDefaultAvatar(this.contact.my_info.get('nickname'));
                    else
                        image = Images.getCachedImage(image);
                }
            }
            if (!image)
                image = this.account.cached_image;
        } else if (contact) {
            image = contact.cached_image || (this.model.get('group_chat') ? Images.getDefaultAvatar($fwd_message.find('.msg-wrap .fwd-msg-author').text()) : Images.getDefaultAvatar(contact));
        }
        $avatar.setAvatar(image, this.avatar_size);
        $avatar.removeClass('hidden');
        if ($fwd_message.data('avatar')) {
            if ($fwd_message.data('from-id')) {
                if ((this.account.chat_settings.getHashAvatar($fwd_message.data('from-id')) == $fwd_message.data('avatar')) && (this.account.chat_settings.getB64Avatar($fwd_message.data('from-id')))) {
                    $avatar.setAvatar(this.account.chat_settings.getB64Avatar($fwd_message.data('from-id')), this.avatar_size);
                }
                else {
                    if($fwd_message.data('avatar-url')){
                        $avatar.setAvatar($fwd_message.data('avatar-url'), this.avatar_size);
                        this.account.chat_settings.updateCachedAvatars($fwd_message.data('from-id'), $fwd_message.data('avatar'), $fwd_message.data('avatar-url'));
                    }
                    else {
                        let node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + $fwd_message.data('from-id');
                        this.contact && this.contact.getAvatar($fwd_message.data('avatar'), node, (data_avatar) => {
                            $avatar.setAvatar(data_avatar, this.avatar_size);
                            this.account.chat_settings.updateCachedAvatars($fwd_message.data('from-id'), $fwd_message.data('avatar'), data_avatar);
                        });
                    }
                }
            }
        }
    },

    updateMessageInChat: function (msg_elem, msg) {
        let $msg = $(msg_elem);
        $msg.prev('.chat-day-indicator').remove();
        if ($msg.find('.plyr-video-container').length) {
            this.initPlyrEmbedPlayer($msg, msg);
        }
        ($msg.find('.not-decrypted-icon').length) && $msg.find('.not-decrypted-icon').dropdown({
            inDuration: 100,
            outDuration: 100,
            constrainWidth: false,
            hover: false,
            alignment: 'right'
        });
        let $prev_msg = $msg.prevAll('.chat-message').first();
        if (!$prev_msg.length) {
            this.getDateIndicator($msg.data('time')).insertBefore($msg);
            this.showMessageAuthor($msg);
            $msg.find('.fwd-message').each((idx, fwd_msg_item) => {
                this.showFwdMessageAuthor($(fwd_msg_item));
            });
            return;
        }
        if ($msg.find('.data-form').length) {
            this.showMessageAuthor($msg);
            return;
        }
        let is_system = $prev_msg.hasClass('system'),
            is_same_sender = ($msg.data('from') === $prev_msg.data('from')),
            is_same_date = moment($msg.data('time')).startOf('day')
                .isSame(moment($prev_msg.data('time')).startOf('day'));
        if (!is_same_date) {
            this.getDateIndicator($msg.data('time')).insertBefore($msg);
            this.showMessageAuthor($msg);
        } else if (is_system || !is_same_sender || $prev_msg.hasClass('saved-main')) {
            this.showMessageAuthor($msg);
        } else {
            this.hideMessageAuthor($msg);
        }
        if ($msg.hasClass('forwarding')) {
            let $fwd_message = $msg.find('.fwd-message');
            $fwd_message.each((idx, fwd_msg_item) => {
                let $fwd_msg_item = $(fwd_msg_item),
                    $prev_fwd_message = (idx > 0) ? $fwd_msg_item.prev() : [];
                $fwd_msg_item.switchClass('hide-date', is_same_date && $prev_fwd_message.length);
                $fwd_msg_item.removeClass('hide-time');
                if ($prev_fwd_message.length) {
                    let is_same_fwded_sender = ($fwd_msg_item.data('from') === $prev_fwd_message.data('from'));
                    if (is_same_fwded_sender) {
                        this.hideFwdMessageAuthor($fwd_msg_item);
                    } else {
                        this.showFwdMessageAuthor($fwd_msg_item);
                    }
                } else {
                    this.showMessageAuthor($msg);
                    this.showFwdMessageAuthor($fwd_msg_item);
                }
            });
        }
    },

    notifyMessage: function (message) {
        if (xabber.settings.notifications && ((xabber.settings.notifications_private && !this.model.get('group_chat')) || (xabber.settings.notifications_group && this.model.get('group_chat')))) {
            let notification_text;
            if ((this.model.get('group_chat') && xabber.settings.message_preview_group) || (!this.model.get('group_chat') && xabber.settings.message_preview_private))
                notification_text = message.getText();
            else
                notification_text = xabber.getString("notification__text_sent_a_message");
            let notification = xabber.popupNotification({
                title: this.contact.get('name'),
                text: notification_text,
                icon: this.contact.cached_image.url
            });
            notification.onclick = () => {
                window.focus();
                this.model.trigger('open');
            };
        }
        if (xabber.settings.group_sound && xabber.settings.notifications_group && this.model.get('group_chat')) {
            let sound;
            if (message.get('auth_request')) {
                sound = xabber.settings.sound_on_auth_request;
            } else {
                sound = xabber.settings.sound_on_group_message;
            }
            xabber.playAudio(sound, false, !xabber.settings.notifications_volume_enabled ? 0 : xabber.settings.notifications_volume);
        }
        else if (xabber.settings.private_sound && xabber.settings.notifications_private && !this.model.get('group_chat')) {
            let sound;
            if (message.get('auth_request')) {
                sound = xabber.settings.sound_on_auth_request;
            } else {
                sound = xabber.settings.sound_on_private_message;
            }
            xabber.playAudio(sound, false, !xabber.settings.notifications_volume_enabled ? 0 : xabber.settings.notifications_volume);
        }
        xabber.recountAllMessageCounter();
    },

    attentionMessage: function () {
        let notification = xabber.popupNotification({
            title: this.contact.get('name'),
            text: xabber.getString("chats_attention"),
            icon: this.contact.cached_image.url
        });
        notification.onclick = () => {
            window.focus();
            this.model.trigger('open');
        };
        let sound = xabber.settings.sound_on_attention;
        xabber.playAudio(sound);
    },

    sendMessage: function (message) {
        let body = message.get('message'),
            legacy_body = '',
            mutable_content = [],
            forwarded_message = message.get('forwarded_message'),
            unique_id = message.get('unique_id'),
            msg_id = message.get('msgid'),
            link_references = message.get('link_references'),
            stanza = $msg({
                to: this.model.get('jid'),
                type: 'chat',
                id: msg_id
            });

        if (forwarded_message) {
            legacy_body = [];
            $(forwarded_message).each((idx, fwd_msg) => {
                let legacy_fwd_msg = Array.from(_.escape(_.unescape(this.bottom.createTextMessage([fwd_msg], ">"))) + ((idx === forwarded_message.length - 1 && !body.length) ? "" : '\n')),
                    idx_begin = legacy_body.length,
                    fwd = $(fwd_msg.get('xml')).clone(),
                    idx_end = legacy_body.concat(legacy_fwd_msg).length;
                if (!fwd.attr('from'))
                    fwd.attr('from', this.account.get('jid'));
                stanza.c('reference', {
                    xmlns: Strophe.NS.REFERENCE,
                    type: 'mutable',
                    begin: idx_begin,
                    end: idx_end
                })
                    .c('forwarded', {xmlns: 'urn:xmpp:forward:0'})
                    .c('delay', {
                        xmlns: 'urn:xmpp:delay',
                        stamp: fwd_msg.get('time')
                    }).up().cnode(fwd[0]).up().up().up();
                legacy_body = legacy_body.concat(legacy_fwd_msg);
                mutable_content.push({
                    start: idx_begin,
                    end: idx_end,
                    type: 'forward'
                });
            });
            body = _.unescape(legacy_body.join("")) + body;
        }

        if (message.get('mentions') && message.get('mentions').length) {
            message.get('mentions').forEach((mention) => {
                let mention_attrs = {xmlns: Strophe.NS.MARKUP};
                mention.is_gc && (mention_attrs.node = Strophe.NS.GROUP_CHAT);
                stanza.c('reference', {
                    xmlns: Strophe.NS.REFERENCE,
                    begin: mention.start + legacy_body.length,
                    end: mention.end + legacy_body.length,
                    type: 'decoration',
                })
                    .c('mention', mention_attrs).t(mention.target).up().up();
            });
        }

        if (message.get('markups')) {
            message.get('markups').forEach((markup) => {
                stanza.c('reference', {
                    xmlns: Strophe.NS.REFERENCE,
                    begin: markup.start + legacy_body.length,
                    end: markup.end + legacy_body.length,
                    type: 'decoration'
                });
                for (let idx in markup.markup) {
                    stanza.c(markup.markup[idx], {xmlns: Strophe.NS.MARKUP}).up();
                }
                stanza.up();
            });
        }

        if (message.get('blockquotes')) {
            message.get('blockquotes').forEach((blockquote) => {
                stanza.c('reference', {
                    xmlns: Strophe.NS.REFERENCE,
                    begin: blockquote.start + legacy_body.length,
                    end: blockquote.end + legacy_body.length,
                    type: 'decoration'
                })
                    .c('quote', {xmlns: Strophe.NS.MARKUP}).up().up();
            });
        }

        if (message.get('type') == 'file_upload') {
            let files = message.get('files') || [],
                images = message.get('images') || [],
                videos = message.get('videos') || [],
                all_files = files.concat(images);
            all_files = all_files.concat(videos)
            all_files.forEach((file, idx) => {
                (idx === 0) && (body += '\n');
                legacy_body = file.sources[0] + ((idx != all_files.length - 1) ? '\n' : "");
                let start_idx = Array.from(_.escape(body)).length,
                    end_idx = start_idx + legacy_body.length;
                stanza.c('reference', {
                    xmlns: Strophe.NS.REFERENCE,
                    type: 'mutable',
                    begin: start_idx,
                    end: end_idx
                });
                file.voice && stanza.c('voice-message', {xmlns: Strophe.NS.VOICE_MESSAGE});
                stanza.c('file-sharing', {xmlns: Strophe.NS.FILES}).c('file');
                file.type && stanza.c('media-type').t(file.type).up();
                file['id'] && stanza.c('gallery-id').t(file['id']).up();
                file.thumbnail && stanza.c('thumbnail-uri').t(file.thumbnail).up();
                file.created && stanza.c('created').t(file.created).up();
                file.name && stanza.c('name').t(file.name).up();
                file.size && stanza.c('size').t(file.size).up();
                file.height && stanza.c('height').t(file.height).up();
                file.width && stanza.c('width').t(file.width).up();
                file.duration && stanza.c('duration').t(file.duration).up();
                file.description && stanza.c('desc').t(file.description).up();
                stanza.up().c('sources');
                file.sources.forEach((u) => {
                    if (file.key)
                        u = u.replace(/^(https|http)/, 'aescbc') + '#' + utils.ArrayBuffertoBase64(file.key);
                    stanza.c('uri').t(u).up();
                });
                stanza.up().up().up();
                file.voice && stanza.up();
                body += legacy_body;
                mutable_content.push({start: start_idx, end: end_idx});
            });
            message.set({type: 'main'});
        }

        if (link_references && link_references.length) {
            link_references.forEach((link_reference, idx) => {
                if (link_reference.start === -1) {
                    link_reference.start = Array.from(_.escape(body)).length;
                    body = body + '\n' + link_reference.original_text;
                    link_reference.end = link_reference.start + link_reference.original_text.length + 1;
                }
                stanza.c('reference', {
                    xmlns: Strophe.NS.REFERENCE,
                    begin: link_reference.start,
                    end: link_reference.end,
                    type: 'mutable',
                }).c('ogp', { xmlns: Strophe.NS.OGP, url: link_reference.original_text });
                link_reference.site && stanza.c('meta', { property: 'og:site_name', content: link_reference.site}).up();
                link_reference.type && stanza.c('meta', { property: 'og:type', content: link_reference.type}).up();
                link_reference.title && stanza.c('meta', { property: 'og:title', content: link_reference.title}).up();
                link_reference.url && stanza.c('meta', { property: 'og:url', content: link_reference.url}).up();
                link_reference.description && stanza.c('meta', { property: 'og:description', content: link_reference.description}).up();
                link_reference.image && stanza.c('meta', { property: 'og:image', content: link_reference.image}).up();
                link_reference.image_width && stanza.c('meta', { property: 'og:image:width', content: link_reference.image_width}).up();
                link_reference.image_height && stanza.c('meta', { property: 'og:image:height', content: link_reference.image_height}).up();
                link_reference.video_url && stanza.c('meta', { property: 'og:video:url', content: link_reference.video_url}).up();
                stanza.up().up();
                mutable_content.push({start: link_reference.start, end: link_reference.end});
            });
        }

        mutable_content.length && message.set({mutable_content: mutable_content});

        this.account._pending_messages.push({chat_hash_id: this.model.id, unique_id: unique_id, timestamp: moment.now()});

        message.set('original_message', body);
        body && stanza.c('body').t(body).up();
        stanza.c('markable').attrs({'xmlns': Strophe.NS.CHAT_MARKERS}).up()
            .c('origin-id', {id: msg_id, xmlns: 'urn:xmpp:sid:0'}).up();
        message.set({xml: $(stanza.tree()).clone()[0]});
        if (message.get('state') === constants.MSG_ERROR) {
            stanza.c('retry', {xmlns: Strophe.NS.DELIVERY}).up();
            message.set('state', constants.MSG_PENDING);
        }
        if (stanza.toString().length >= constants.STANZA_MAX_SIZE) {
            utils.dialogs.error(xabber.getString("message__error_big_stanza"));
            this.removeMessage(message);
            return;
        }
        if (message.get('encrypted') && this.account.omemo) {
            this.model.get('chat_ephemeral_timer') && stanza.c('ephemeral', {xmlns: Strophe.NS.EPHEMERAL, timer: this.model.get('chat_ephemeral_timer')}).up();
            stanza.c('envelope', {xmlns: Strophe.NS.SCE}).c('content')
            if ($(stanza.tree()).children('body').length) {
                stanza.cnode($(stanza.tree()).children('body')[0]).attrs({'xmlns': Strophe.NS.CLIENT}).up()
                $(stanza.tree()).children('body').detach()
            }
            if ($(stanza.tree()).children('reference').length) {
                $(stanza.tree()).children('reference').each((idx, reference) => {
                    stanza.cnode($(stanza.tree()).children('reference')[idx]).up()
                });
                $(stanza.tree()).children('reference').detach()
            }
            stanza.up().c('rpad').t('0'.repeat(200).slice(1, Math.floor((Math.random() * 198) + 1))).up()
            stanza.c('from', {jid: this.account.get('jid')}).up().up()
            this.account.omemo.encrypt(this.contact, stanza).then((msg) => {
                if (msg) {
                    stanza = msg.message;
                    message.set('trusted', msg.is_trusted);
                    message.set({xml: $(stanza.tree()).clone()[0]});
                }
                let msg_sending_timestamp = moment.now();
                this.account.sendFast(stanza, this.msgCallback.bind(this, msg_sending_timestamp, message));
            });
            return;
        } else {
            let msg_sending_timestamp = moment.now();
            this.account.sendFast(stanza, this.msgCallback.bind(this, msg_sending_timestamp, message));
        }
    },

    msgCallback: function (msg_sending_timestamp, message) {
        this.bottom.click_counter = 0;
        this.bottom.setDefaultPlaceholder();
        if (!this.model.get('group_chat') && !this.account.server_features.get(Strophe.NS.DELIVERY)) {
            setTimeout(() => {
                if ((this.account.last_stanza_timestamp > msg_sending_timestamp) && (message.get('state') === constants.MSG_PENDING)) {
                    message.set('state', constants.MSG_SENT);
                } else {
                    this.account.connection.ping.ping(this.account.get('jid'), () => {
                        (message.get('state') === constants.MSG_PENDING) && message.set('state', constants.MSG_SENT);
                    });
                    setTimeout(() => {
                        if ((this.account.last_stanza_timestamp < msg_sending_timestamp) && (message.get('state') === constants.MSG_PENDING))
                            message.set('state', constants.MSG_ERROR);
                    }, 5000);
                }
            }, 1000);
        }
        else {
            let _pending_time = 5, was_reconnecting;
            if (!(this.account.connection.authenticated && !this.account.connection.disconnecting && this.account.session.get('connected') && this.account.session.get('ready_to_send') && this.account.get('status') !== 'offline'))
                was_reconnecting = true;
            if (this.account.session.get('reconnecting'))
                was_reconnecting = true;
            this.account.session.once('change:reconnecting', () => {
                console.log('change reconnecting');
                console.log(this.account.session.get('reconnecting'));
                was_reconnecting = true;
            })
            let _interval = setInterval(() => {
                console.log(was_reconnecting);
                if (was_reconnecting)
                    clearInterval(_interval);
                if (_pending_time >= 8 && message.get('state') === constants.MSG_PENDING && !was_reconnecting){
                    console.log('ping on message pending');
                    this.account.connection.ping.ping(this.account.get('jid'), () => {},  () => {
                        let downtime = (moment.now() - this.account.last_stanza_timestamp) / 1000;
                        if (downtime >= 2){
                            console.log('message initiated reconnection');
                            console.log(message);
                            this.account.connection.disconnect();
                        } else {
                            console.log('ping was sent and got no result after 2 seconds, but didnt reconnect because last stanza time was: ' + downtime + ' sec')
                        }
                    }, 2000);
                }
                if (((this.account.last_stanza_timestamp < msg_sending_timestamp) && (_pending_time > 40) && (message.get('state') === constants.MSG_PENDING) || (_pending_time > 40)) && !was_reconnecting) {
                    message.set('state', constants.MSG_ERROR);
                    clearInterval(_interval);
                }
                else if (message.get('state') !== constants.MSG_PENDING)
                    clearInterval(_interval);
                _pending_time += 3;
            }, 3000);
        }
    },

    initJingleMessage: function (media_type) {
        xabber.current_voip_call && xabber.current_voip_call.destroy();
        media_type = media_type || {};
        media_type = media_type.video ? 'video' : 'audio';
        let session_id = uuid();
        xabber.current_voip_call = new xabber.JingleMessage({session_id: session_id, video_live: media_type === 'video'}, {contact: this.contact});
        xabber.current_voip_call.startCall();
        xabber.current_voip_call.modal_view.show({status: constants.JINGLE_MSG_PROPOSE});
        xabber.trigger('update_jingle_button');
    },

    saveForwardedMessage: function (msg) {
        let forwarded_message = null;
        if ($(msg).get('forwarded_message')) {
            forwarded_message = $(msg).get('forwarded_message');
            if (this.account.forwarded_messages.indexOf(forwarded_message) < 0) {
                forwarded_message = this.saveForwardedMessage(forwarded_message);
            }
        }
        msg = this.account.forwarded_messages.create(_.extend({
            is_forwarded: true,
            forwarded_message: forwarded_message
        }, msg.attributes));
        return msg;
    },

    onSubmit: function (text, fwd_messages, options) {
        // send forwarded messages before
        options = options || {};
        let attrs = {
            from_jid: this.account.get('jid'),
            message: text,
            mentions: options.mentions,
            blockquotes: options.blockquotes,
            markups: options.markup_references,
            files: options.attached_files,
            link_references: options.link_references,
            encrypted: this.model.get('encrypted'),
            ephemeral_timer: this.model.get('encrypted') && this.model.get('chat_ephemeral_timer'),
            submitted_here: true,
            forwarded_message: null
        }, _dfd_info = new $.Deferred();
        _dfd_info.done(() => {
            if (!fwd_messages.length && !(attrs.files && attrs.files.length) && !(attrs.link_references && attrs.link_references.length) && text.removeEmoji() === "")
                attrs.only_emoji = Array.from(text).length;
            if (fwd_messages.length) {
                let new_fwd_messages = [];
                _.each(fwd_messages, (msg) => {
                    if (this.account.forwarded_messages.indexOf(msg) < 0) {
                        msg = this.saveForwardedMessage(msg);
                    }
                    new_fwd_messages.push(msg);
                });
                attrs.forwarded_message = new_fwd_messages;
                if (attrs.files && attrs.files.length) {
                    attrs.type = 'file_upload';
                    this.account.server_features.get(Strophe.NS.HTTP_UPLOAD) && (attrs.upload_service = this.account.server_features.get(Strophe.NS.HTTP_UPLOAD).get('from'));
                    this.model.messages.create(attrs);
                } else {
                    let message = this.model.messages.create(attrs);
                    this.sendMessage(message);
                }
            } else if (attrs.files && attrs.files.length) {
                attrs.type = 'file_upload';
                this.account.server_features.get(Strophe.NS.HTTP_UPLOAD) && (attrs.upload_service = this.account.server_features.get(Strophe.NS.HTTP_UPLOAD).get('from'));
                this.model.messages.create(attrs);
            } else if (text || (attrs.link_references && attrs.link_references.length)) {
                let message = this.model.messages.create(attrs);
                this.sendMessage(message);
            }
            if (this.contact && this.model.get('archived') && !this.model.isMuted()) {
                message.set('muted', false);
                this.head.archiveChat();
                this.model.set('archived', false);
                xabber.chats_view.updateScreenAllChats();
            }
            if (this.model.get('group_chat') && xabber.toolbar_view.$('.active').hasClass('chats'))
                if (this.contact && !this.model.isMuted() && !this.model.get('archived'))
                    xabber.chats_view.updateScreenAllChats();
            xabber.chats_view.scrollToTop();
            xabber.chats_view.clearSearch();
        });

        if (this.contact && this.contact.get("group_chat") && !this.contact.my_info)
            this.contact.getMyInfo(() => {
                _dfd_info.resolve();
            });
        else if (this.model.get('encrypted')){
            this.account.omemo.checkContactFingerprints(this.contact).then((obj) => {
                attrs.is_contact_trusted = obj.trust;
                _dfd_info.resolve();
            });
        } else
            _dfd_info.resolve();
    },

    addFileMessage: function (files, is_voice) {
        let new_files = [], file_counter = 0;
        if (this.model.messages_view)
            if (this.model.messages_view.data.get('visible'))
                this.model.messages_view.openChat();
        if (files.length > 10 && !(this.account.get('gallery_token') && this.account.get('gallery_url'))) {
            utils.dialogs.error(xabber.getString("too_many_files_at_once"));
            return;
        }
        let http_upload_service = this.account.server_features.get(Strophe.NS.HTTP_UPLOAD);
        if (!http_upload_service && !(this.account.get('gallery_token') && this.account.get('gallery_url'))) {
            utils.dialogs.error(xabber.getString("error_file_upload_not_support", [this.account.domain]));
            return;
        }
        let deferred_all = new $.Deferred();
        deferred_all.done((data) => {
            if (is_voice) {
                this.model.messages.create({
                    from_jid: this.account.get('jid'),
                    type: 'file_upload',
                    files: data,
                    encrypted: this.model.get('encrypted'),
                    upload_service: http_upload_service.get('from'),
                    message: '',
                    submitted_here: true
                });
            } else
                this.bottom.addFileSnippets(data);
        });
        $(files).each((idx, file) => {
            if (utils.isImageType(file.type)) {
                let reader = new FileReader(), deferred = new $.Deferred();
                Images.compressImage(file).done((image) => {
                    reader.readAsDataURL(image);
                    deferred.done((data) => {
                        if (data) {
                            image.height = data.height;
                            image.width = data.width;
                        }
                        if (data.encrypted_file)
                            new_files.push(data.encrypted_file);
                        else
                            new_files.push(image);
                        file_counter++;
                        if (file_counter === files.length)
                            deferred_all.resolve(new_files);
                    });
                });
                reader.onload = (e) => {
                    if (this.model.get('encrypted')) {
                        this.encryptFile(e.target.result).then((encrypted) => {
                            let key = encrypted.keydata,
                                new_file = new File([encrypted.payload], uuid().replace(/-/g, ""), {type: file.type});
                            new_file.key = key;
                            if (new_file.type === 'image/svg+xml') {
                                deferred.resolve({encrypted_file: new_file,key: key});
                            } else {
                                let image_prev = new Image();
                                image_prev.onload = function () {
                                    let height = this.height,
                                        width = this.width;
                                    new_file.image_prev = image_prev;
                                    deferred.resolve({height: height, width: width, encrypted_file: new_file, key: key});
                                };
                                image_prev.src = e.target.result;
                            }
                        });
                    } else {
                        if (file.type === 'image/svg+xml') {
                            deferred.resolve({});
                        } else {
                            let image_prev = new Image();
                            image_prev.onload = function () {
                                let height = this.height,
                                    width = this.width;
                                deferred.resolve({height: height, width: width});
                            };
                            image_prev.src = e.target.result;
                        }
                    }
                };
            }
            else {
                if (this.model.get('encrypted')) {
                    let reader = new FileReader();
                    reader.onload = (e) => {
                        this.encryptFile(e.target.result).then((encrypted) => {
                            let key = encrypted.keydata,
                                encrypted_file = new File([encrypted.payload], uuid().replace(/-/g, ""), {type: file.type});
                            file.voice && (encrypted_file.voice = true);
                            file.duration && (encrypted_file.duration = file.duration);
                            encrypted_file.key = key;
                            new_files.push(encrypted_file);
                            file_counter++;
                            if (file_counter === files.length)
                                deferred_all.resolve(new_files);
                        });
                    };
                    reader.readAsDataURL(file);
                } else {
                    new_files.push(file);
                    file_counter++;
                    if (file_counter === files.length)
                        deferred_all.resolve(new_files);
                }
            }
        });
    },

    startUploadFile: function (message, $message) {
        $message.emojify('.chat-msg-author-badge', {emoji_size: 16});
        $message.find('.repeat-upload').hide();
        $message.find('.status').hide();
        $message.find('.progress').show();
        $message.find('.mdi-center-loading-indicator').removeClass('mdi-check').addClass('mdi-close');
        $message.find('.mdi-center-loading-indicator').removeClass('hidden');
        $message.find('.dropdown-content.retry-send-message').addClass('hidden');
        $message.find('.msg-delivering-state').addClass('no-click');
        let files_count = 0;
        $(message.get('files')).each((idx, file) => {
            let enc_file = new File([file], file.name);
            enc_file.key && (delete enc_file.key);
            let iq = $iq({type: 'get', to: message.get('upload_service')})
                    .c('request', {xmlns: Strophe.NS.HTTP_UPLOAD})
                    .c('filename').t(enc_file.name).up()
                    .c('size').t(enc_file.size).up()
                    .c('content-type').t(enc_file.type).up(),
                deferred = new $.Deferred(), self = this;
            this.account.sendIQFast(iq,
                function (result) {
                    let $slot = $(result).find(`slot[xmlns="${Strophe.NS.HTTP_UPLOAD}"]`);
                    deferred.resolve({
                        get_url: $slot.find('get').text(),
                        put_url: $slot.find('put').text()
                    });
                },
                function (err) {
                    let error_text = $(err).find(`error text[xml\\:lang="${xabber._settings.get('language')}"]`).text(),
                        error_type = $(err).find('error').attr('type');
                    !error_text && (error_text = $(err).find(`error text`).text());
                    self.onFileNotUploaded(message, $message, error_text, 'xmpp');
                }
            );
            let msg_sending_timestamp = moment.now(), _pending_time = 10, _interval = setInterval(() => {
                if ((this.account.last_stanza_timestamp < msg_sending_timestamp) && (_pending_time > 20) && (message.get('state') === constants.MSG_PENDING) || (_pending_time > 20)) {
                    message.set('state', constants.MSG_ERROR);
                    clearInterval(_interval);
                }
                else if (message.get('state') !== constants.MSG_PENDING)
                    clearInterval(_interval);
                _pending_time += 10;
            }, 10000);
            deferred.done((data) => {
                clearInterval(_interval);
                let xhr = new XMLHttpRequest(),
                    $bar = $message.find('.progress');
                $message.find('div[data-upload-file-id="' + file.upload_id + '"] .circle-wrap .mdi-close').click(() => {
                    xhr.abort();
                });
                xhr.onabort = () => {
                    this.removeMessage($message);
                };
                xhr.upload.onprogress = (event) => {
                    let percentage = event.loaded / event.total;
                    $message.find('div[data-upload-file-id="' + file.upload_id + '"] .circle-percent-text').text(parseInt((100 * percentage)) + '%');
                    $message.find('div[data-upload-file-id="' + file.upload_id + '"] .preloader-path-new').css({ 'stroke-dasharray': '' + (150 * percentage) + ', 149.825'});
                };
                xhr.onload = xhr.onerror = function () {
                    if (this.status === 201) {
                        message.get('files')[idx].url = data.get_url;
                        files_count++;
                        if (files_count == message.get('files').length) {
                            self.onFileUploaded(message, $message);
                        }
                    } else {
                        self.onFileNotUploaded(message, $message, this.responseText, 'http');
                    }
                };
                if ($message.data('cancel')) {
                    xhr.abort();
                } else {
                    xhr.open("PUT", data.put_url, true);
                    xhr.send(enc_file);
                }
            });
        });
    },

    startGalleryUploadFile: function (message, $message) {
        $message.emojify('.chat-msg-author-badge', {emoji_size: 16});
        message.set('files', message.get('files').filter((element) => { return element != null}) );
        let files_count = 0,
            cancelled_files_count = 0,
            self = this,
            is_error = false,
            xhr_requests = [],
            msg_files_count = message.get('files').length;
        $message.find('.mdi-center-loading-indicator').removeClass('mdi-check').addClass('mdi-close');
        $message.find('.uploaded-file').removeClass('uploaded-file');
        $message.find('.mdi-center-loading-indicator').removeClass('hidden');
        $message.find('.dropdown-content.retry-send-message').addClass('hidden');
        $message.find('.msg-delivering-state').addClass('no-click');
        $(message.get('files')).each((idx, file) => {
            if (is_error)
                return;
            if (file.key) {
                file = new File([file], file.name);
                delete file.key
            }
            let msg_sending_timestamp = moment.now(), _pending_time = 10, _interval = setInterval(() => {
                if ((this.account.last_stanza_timestamp < msg_sending_timestamp) && (_pending_time > 20) && (message.get('state') === constants.MSG_PENDING) || (_pending_time > 20)) {
                    message.set('state', constants.MSG_ERROR);
                    clearInterval(_interval);
                }
                else if (message.get('state') !== constants.MSG_PENDING)
                    clearInterval(_interval);
                _pending_time += 10;
            }, 10000);

            let formData = new FormData(),
                metadata = {};
            file.duration && (metadata.duration = file.duration);
            file.width && (metadata.width = file.width);
            file.height && (metadata.height = file.height);
            formData.append('file', file, file.name);
            formData.append('metadata', JSON.stringify(metadata));
            if (file.size)
                formData.append('size', file.size);
            if (file.voice)
                formData.append('media_type', file.type + '+voice');
            else
                formData.append('media_type', file.type);
            clearInterval(_interval);
            message.get('files')[idx].is_errored = false;
            let xhr = new XMLHttpRequest(),
                $bar = $message.find('.progress');
            xhr.formData = formData;
            xhr_requests = xhr_requests.concat([xhr]);
            xhr.arrayIndex = xhr_requests.indexOf(xhr);
            $message.find('div[data-upload-file-id="' + file.upload_id + '"] .circle-wrap .mdi-close').one("click",() => {
                cancelled_files_count++;
                if (xhr.is_uploading)
                    xhr.abort();
                else {
                    if ((msg_files_count - cancelled_files_count) == 0) {
                        message.set('files', []);
                        if (self.model.get('encrypted')){
                            self.bottom.setEditedMessageAttachments(message, true);
                            self.bottom.setRedactedUploadMessage(message);
                        }
                        self.removeMessage($message);
                    } else {
                        xhr.is_cancelled = true;
                        $message.find('.unuploaded-file[data-upload-file-id="' + file.upload_id + '"]').remove();
                        $message.find('div[data-upload-file-id="' + file.upload_id + '"] .circle-wrap').remove();
                        message.get('files')[idx] = null;
                    }
                }
            });
            xhr.upload.onprogress = (event) => {
                let percentage = event.loaded / event.total;
                $message.find('div[data-upload-file-id="' + file.upload_id + '"] .circle-percent-text').text(parseInt((100 * percentage)) + '%');
                $message.find('div[data-upload-file-id="' + file.upload_id + '"] .preloader-path-new').css({ 'stroke-dasharray': '' + (150 * percentage) + ', 149.825'});
            };
            xhr.oncancel = xhr.onload = xhr.onerror = xhr.onabort = function () {
                let xhr_status = this.fakeStatus || this.status;
                if (xhr_status >= 200 && xhr_status < 300) {
                    $message.find('div[data-upload-file-id="' + file.upload_id + '"] .mdi-center-loading-indicator').addClass('mdi-check').removeClass('mdi-close');
                    let response = this.response ? JSON.parse(this.response) : this.fakeResponse;
                    message.get('files')[idx].id = response.id;
                    message.get('files')[idx].created_at = response.created_at;
                    (response.thumbnail && response.thumbnail.url) && (message.get('files')[idx].thumbnail = response.thumbnail.url);
                    message.get('files')[idx].url = response.file;
                    files_count++;
                    $message.find('div[data-upload-file-id="' + file.upload_id + '"]').addClass('uploaded-file');
                    while (xhr_requests[files_count] && xhr_requests[files_count].is_cancelled){
                        files_count++;
                    }
                    if (files_count == message.get('files').length) {
                        self.onFileUploaded(message, $message);
                    } else if (xhr_requests[files_count]){
                        self.account.testGalleryTokenExpire(() => {
                            self.account.testGalleryFileSlot(xhr_requests[files_count].formData.get('file'), (slot_response) => {
                                if (!is_error) {
                                    if (slot_response && slot_response.quota){
                                        if (slot_response.file && slot_response.hash){
                                            xhr_requests[files_count].fakeStatus = 200;
                                            xhr_requests[files_count].fakeResponse = {
                                                file: slot_response.file,
                                                id: slot_response.id,
                                                name: slot_response.name,
                                                thumbnail: slot_response.thumbnail,
                                                created_at: slot_response.created_at,
                                            };
                                            xhr_requests[files_count].oncancel();
                                        } else {
                                            xhr_requests[files_count].open("POST", self.account.get('gallery_url') + 'v1/files/upload/', true);
                                            xhr_requests[files_count].setRequestHeader("Authorization", 'Bearer ' + self.account.get('gallery_token'));
                                            xhr_requests[files_count].is_uploading = true;
                                            xhr_requests[files_count].send(xhr_requests[files_count].formData);
                                        }
                                    } else {
                                        xhr_requests[files_count].fakeStatus = slot_response && slot_response.status ? slot_response.status : 400;
                                        xhr_requests[files_count].fakeResponse = slot_response && slot_response.error ? slot_response.error : 'Unknown error';
                                        xhr_requests[files_count].oncancel();
                                    }
                                }
                            });
                        });
                    }
                } else {
                    if (xhr_status === 0 && is_error)
                        return;
                    if ((msg_files_count - cancelled_files_count) == 0 && xhr_status === 0){
                        message.set('files', []);
                        if (self.model.get('encrypted')){
                            self.bottom.setEditedMessageAttachments(message, true);
                            self.bottom.setRedactedUploadMessage(message);
                        }
                        self.removeMessage($message);
                    } else {
                        let response_text, error_status;
                        self.account.handleCommonGalleryErrors(this.response)
                        if (xhr_status === 500)
                            response_text = this.fakeResponse || this.statusText;
                        else if (xhr_status === 400 || this.fakeStatus){
                            response_text = this.fakeResponse || JSON.parse(this.response).error;
                            error_status = this.fakeStatus || JSON.parse(this.response).status;
                            if (error_status && error_status == 429){
                                setTimeout(() => {
                                    self.account.testGalleryTokenExpire(() => {
                                        self.account.testGalleryFileSlot(xhr_requests[files_count].formData.get('file'), (slot_response) => {
                                            if (!is_error) {
                                                if (slot_response && slot_response.quota){
                                                    if (slot_response.file && slot_response.hash){
                                                        xhr_requests[files_count].fakeStatus = 200;
                                                        xhr_requests[files_count].fakeResponse = {
                                                            file: slot_response.file,
                                                            id: slot_response.id,
                                                            name: slot_response.name,
                                                            thumbnail: slot_response.thumbnail,
                                                            created_at: slot_response.created_at,
                                                        };
                                                        xhr_requests[files_count].oncancel();
                                                    } else {
                                                        xhr_requests[files_count].open("POST", self.account.get('gallery_url') + 'v1/files/upload/', true);
                                                        xhr_requests[files_count].setRequestHeader("Authorization", 'Bearer ' + self.account.get('gallery_token'));
                                                        xhr_requests[files_count].is_uploading = true;
                                                        xhr_requests[files_count].send(xhr_requests[files_count].formData);
                                                    }
                                                } else {
                                                    xhr_requests[files_count].fakeStatus = slot_response && slot_response.status ? slot_response.status : 400;
                                                    xhr_requests[files_count].fakeResponse = slot_response && slot_response.error ? slot_response.error : 'Unknown error';
                                                    xhr_requests[files_count].oncancel();
                                                }
                                            }
                                        });
                                    });
                                }, 1000);
                                return;
                            }
                        }
                        else if (xhr_status === 0) {
                            $message.find('.unuploaded-file[data-upload-file-id="' + file.upload_id + '"]').remove();
                            $message.find('div[data-upload-file-id="' + file.upload_id + '"] .circle-wrap').remove();
                        };
                        (xhr_status === 0) && (message.get('files')[idx] = null);
                        if (!message.get('files').filter((element) => { return element != null}).length && !message.get('message')){
                            if (self.model.get('encrypted')){
                                self.bottom.setEditedMessageAttachments(message, true);
                                self.bottom.setRedactedUploadMessage(message);
                            }
                            self.removeMessage($message);
                            return;
                        }
                        files_count++;
                        if (xhr_status != 0) {
                            if (!$message.find('div[data-upload-file-id="' + file.upload_id + '"]').closest('.img-content-template.hidden').length){
                                $message.find('div[data-upload-file-id="' + file.upload_id + '"] .circle-percent-text').text(response_text);
                                $message.find('div[data-upload-file-id="' + file.upload_id + '"] .mdi-alert-circle').removeClass('hidden');
                                $message.find('div[data-upload-file-id="' + file.upload_id + '"] .mdi-alert-circle').prop('title', response_text);
                                $message.find('div[data-upload-file-id="' + file.upload_id + '"] .mdi-center-loading-indicator').addClass('hidden');
                                $message.find('div[data-upload-file-id="' + file.upload_id + '"]').addClass('upload-error');
                                $message.find('div[data-upload-file-id="' + file.upload_id + '"]').css({ 'border-color': '#EF9A9A'});
                            } else {
                                $message.find('.hidden-images .circle-percent-text').text(response_text);
                                $message.find('.hidden-images .mdi-alert-circle').removeClass('hidden');
                                $message.find('.hidden-images .mdi-alert-circle').prop('title', response_text);
                                $message.find('.hidden-images .mdi-center-loading-indicator').addClass('hidden');
                                $message.find('.hidden-images').addClass('upload-error');
                                $message.find('.hidden-images').css({ 'border-color': '#EF9A9A'});
                            }
                            message.get('files')[idx].is_errored = true;
                            is_error = true;
                            $(xhr_requests).each((idx, request) => {
                                request.abort();
                            })
                            self.onFileNotUploaded(message, $message, response_text);
                        }
                        else if (files_count == msg_files_count) {
                            self.onFileUploaded(message, $message);
                        } else {
                            while (xhr_requests[files_count] && xhr_requests[files_count].is_cancelled){
                                files_count++;
                            }
                            if (files_count == msg_files_count) {
                                self.onFileUploaded(message, $message);
                            } else {
                                self.account.testGalleryTokenExpire(() => {
                                    self.account.testGalleryFileSlot(xhr_requests[files_count].formData.get('file'), (slot_response) => {
                                        if (!is_error) {
                                            if (slot_response && slot_response.quota){
                                                if (slot_response.file && slot_response.hash){
                                                    xhr_requests[files_count].fakeStatus = 200;
                                                    xhr_requests[files_count].fakeResponse = {
                                                        file: slot_response.file,
                                                        id: slot_response.id,
                                                        name: slot_response.name,
                                                        thumbnail: slot_response.thumbnail,
                                                        created_at: slot_response.created_at,
                                                    };
                                                    xhr_requests[files_count].oncancel();
                                                } else {
                                                    xhr_requests[files_count].open("POST", self.account.get('gallery_url') + 'v1/files/upload/', true);
                                                    xhr_requests[files_count].setRequestHeader("Authorization", 'Bearer ' + self.account.get('gallery_token'));
                                                    xhr_requests[files_count].is_uploading = true;
                                                    xhr_requests[files_count].send(xhr_requests[files_count].formData);
                                                }
                                            } else {
                                                xhr_requests[files_count].fakeStatus = slot_response && slot_response.status ? slot_response.status : 400;
                                                xhr_requests[files_count].fakeResponse = slot_response && slot_response.error ? slot_response.error : 'Unknown error';
                                                xhr_requests[files_count].oncancel();
                                            }
                                        }
                                    });
                                });
                            }
                        }
                    }
                }
            };
        });
        if (xhr_requests.length){
            if ($message.data('cancel')) {
                xhr_requests[0].abort();
            } else {
                this.account.testGalleryTokenExpire(() => {
                    this.account.testGalleryFileSlot(xhr_requests[0].formData.get('file'), (slot_response) => {
                        if (!is_error) {
                            if (slot_response && slot_response.quota){
                                if (slot_response.file && slot_response.hash){
                                    xhr_requests[0].fakeStatus = 200;
                                    xhr_requests[0].fakeResponse = {
                                        file: slot_response.file,
                                        id: slot_response.id,
                                        name: slot_response.name,
                                        thumbnail: slot_response.thumbnail,
                                        created_at: slot_response.created_at,
                                    };
                                    xhr_requests[0].oncancel();
                                } else {
                                    xhr_requests[0].open("POST", this.account.get('gallery_url') + 'v1/files/upload/', true);
                                    xhr_requests[0].setRequestHeader("Authorization", 'Bearer ' + this.account.get('gallery_token'));
                                    xhr_requests[0].is_uploading = true;
                                    xhr_requests[0].send(xhr_requests[0].formData);
                                }
                            } else {
                                xhr_requests[files_count].fakeStatus = slot_response && slot_response.status ? slot_response.status : 400;
                                xhr_requests[files_count].fakeResponse = slot_response && slot_response.error ? slot_response.error : 'Unknown error';
                                xhr_requests[0].oncancel();
                            }
                        }
                    });
                }, (err_status) => {
                    let response_text = err_status,
                        file;
                    message.get('files').length && (file = message.get('files')[0])
                    if (file && !_.isUndefined(file.upload_id)){
                        $message.find('div[data-upload-file-id="' + file.upload_id + '"] .circle-percent-text').text(response_text);
                        $message.find('div[data-upload-file-id="' + file.upload_id + '"] .mdi-alert-circle').removeClass('hidden');
                        $message.find('div[data-upload-file-id="' + file.upload_id + '"] .mdi-alert-circle').prop('title', response_text);
                        $message.find('div[data-upload-file-id="' + file.upload_id + '"] .mdi-center-loading-indicator').addClass('hidden');
                        $message.find('div[data-upload-file-id="' + file.upload_id + '"]').addClass('upload-error');
                        $message.find('div[data-upload-file-id="' + file.upload_id + '"]').css({ 'border-color': '#EF9A9A'});
                    }
                    message.get('files').length && (message.get('files')[0].is_errored = true);
                    is_error = true;
                    $(xhr_requests).each((idx, request) => {
                        request.abort();
                    })
                    self.onFileNotUploaded(message, $message, response_text);
                });
            }
        }

    },

    encryptFile: async function (file) {
        return await utils.AES.encrypt(file);
    },

    onFileUploaded: function (message, $message) {
        $message.find('.dropdown-content.retry-send-message').removeClass('hidden');
        $message.find('.msg-delivering-state').removeClass('no-click');
        message.set('files', message.get('files').filter((element) => { return element != null}) );
        let files = message.get('files'),
            self = this, is_audio = false,
            images = [], files_ = [], videos = [];
        if (!files.length)
            this.onFileNotUploaded(message, $message)
        $(files).each((idx, file_) => {
            let file_new_format = {
                name: file_.name,
                type: file_.type,
                size: file_.size,
                description: file_.description || '',
                sources: [file_.url]
            };
            file_.key && (file_new_format.key = file_.key);
            file_.voice && (file_new_format.voice = true);
            if (this.account.get('gallery_token') && this.account.get('gallery_url')){
                _.extend(file_new_format, { id: file_.id, created: file_.created_at, thumbnail: file_.thumbnail });
            }
            if (utils.isImageType(file_.type)) {
                _.extend(file_new_format, { width: file_.width, height: file_.height });
                images.push(file_new_format);
            }
            else if (utils.isVideoType(file_.type)) {
                _.extend(file_new_format, { duration: file_.duration});
                videos.push(file_new_format);
            }
            else {
                _.extend(file_new_format, { duration: file_.duration});
                files_.push(file_new_format);
            }
        });
        $message.find('.unuploaded-images').remove();
        $message.find('.unuploaded-file').remove();
        //  loaded and send image
        if (images.length > 0) {
            if (images.length > 1) {
                let template_for_images;
                if (images.length > 6) {
                    let tpl_name = 'template-for-6',
                        hidden_images = images.length - 5;
                    !xabber.settings.load_media && (tpl_name = 'hidden-template-for-6')
                    template_for_images = $(templates.messages[tpl_name]({images}));
                    template_for_images.find('.last-image').addClass('hidden-images');
                    template_for_images.find('.image-counter').text('+' + hidden_images);
                }
                else {
                    let tpl_name = 'template-for-' + images.length;
                    !xabber.settings.load_media && (tpl_name = 'hidden-template-for-' + images.length)
                    template_for_images = $(templates.messages[tpl_name]({images}));
                }
                if (!xabber.settings.load_media) {
                    template_for_images.find('img').removeClass('uploaded-img-for-collage popup-img').addClass('unloaded-img')
                }
                $message.removeClass('file-upload noselect');
                $message.find('.chat-msg-media-content .chat-file-info').remove();
                $message.find('.chat-msg-media-content.chat-main-upload-media').append(template_for_images);
                !xabber.settings.load_media && $message.find('.chat-msg-media-content.chat-main-upload-media .img-content-template').first().append($('<div class="img-privacy-warning"/>').text(xabber.getString("load_image_privacy_warning")))
            }
            else {
                let img = this.createImage(images[0]),
                    img_content = self.createImageContainer(images[0]);
                img.onload = () => {
                    this.imageOnload($message);
                };
                $message.removeClass('file-upload noselect');
                $message.find('.chat-msg-media-content .chat-file-info').remove();
                $message.find('.chat-msg-media-content.chat-main-upload-media').append(img_content);
                $message.find('.chat-msg-media-content.chat-main-upload-media .img-content').html(img);
                !xabber.settings.load_media && $message.find('.chat-msg-media-content.chat-main-upload-media .img-content').append($('<div class="img-privacy-warning"/>').text(xabber.getString("load_image_privacy_warning")))
            }
        }
        message.set('videos', videos);
        if (videos.length > 0) {
            let video_content = this.createVideoContainer();
            $message.find('.chat-msg-media-content.chat-main-upload-media').find('.chat-file-info').remove();
            $message.find('.chat-msg-media-content.chat-main-upload-media').append(video_content);
            videos.forEach((video, idx) => {
                let video_el = this.createVideo(video, idx);
                $message.find('.video-content').append(video_el);
            });
            this.videoOnload($message, message);
            $message.removeClass('file-upload noselect');
        }
        if (files_.length > 0) {
            $message.removeClass('file-upload noselect');
            $(files_).each((idx, item) => {
                if (!idx && !images.length){
                    $message.find('.chat-msg-media-content.chat-main-upload-media').find('.chat-file-info').remove();
                    $message.find('.chat-msg-media-content.chat-main-upload-media').removeClass('chat-file-content');
                }
                if (item.type) {
                    if (item.voice)
                        is_audio = true;
                    else
                        is_audio = false;
                }
                let file_attrs = {
                        name: item.name,
                        type: item.type,
                        sources: item.sources
                    },
                    template_for_file_content,
                    mdi_icon_class = utils.file_type_icon(item.type);
                ((files_.length === 1) && is_audio) && (file_attrs.name = xabber.getString("voice_message"));
                _.extend(file_attrs, {size: utils.pretty_size(item.size), is_audio: is_audio, duration: utils.pretty_duration(item.duration), mdi_icon: mdi_icon_class});
                template_for_file_content = is_audio ? $(templates.messages.audio_file(file_attrs)) : $(templates.messages.file(file_attrs));
                $message.find('.chat-msg-media-content.chat-main-upload-media').append(template_for_file_content);
                if (is_audio && $message.find('.link-file').length) {
                    let audio_player = {$audio_elem : $message.find('.link-file')[0]};
                    audio_player.msg_time = $message.attr('data-time');
                    audio_player.author = $message.find('.chat-msg-author').text();
                    audio_player.message_unique_id = $message.attr('data-uniqueid');
                    if (this.model.get('group_chat')) {
                        if (this.contact.my_info) {
                            audio_player.contact_avatar = this.contact.my_info.get('b64_avatar');
                            if (!audio_player.contact_avatar) {
                                if (this.account.cached_image)
                                    audio_player.contact_avatar = this.account.cached_image;
                                !audio_player.contact_avatar && (audio_player.contact_avatar = Images.getDefaultAvatar(this.contact.my_info.get('nickname')));
                            } else
                                audio_player.contact_avatar = Images.getCachedImage(audio_player.contact_avatar);
                        }
                    }
                    if (!audio_player.contact_avatar)
                        audio_player.contact_avatar = this.account.cached_image;
                    if (!this.model.plyr_players.filter(obj => { return (obj.message_unique_id === audio_player.message_unique_id)}).length) {
                        this.model.plyr_players = this.model.plyr_players.concat([audio_player]).sort((a, b) => a.msg_time - b.msg_time);
                        xabber.plyr_players = xabber.plyr_players.concat([audio_player]);
                    }

                    let f_url = $message.find('.link-file').find('.file-link-download').attr('href');
                    $message.find('.link-file').find('.mdi-play').removeClass('no-uploaded');
                    audio_player.$audio_elem.voice_message = this.renderVoiceMessage($message.find('.link-file').find('.file-container')[0], f_url);

                    message.set('msg_player_audios', [audio_player])
                    xabber.trigger('plyr_player_updated');
                }
            });
        }
        this.initPopup($message);
        message.set('images', images);
        message.set('files', files_);
        if ((message.get('encrypted') || this.model.get('encrypted')) && message.get('images').length) {
            this.decryptImages(message);
        }
        this.sendMessage(message);
        this.scrollToBottom();
    },

    createAudio: function(file_url, $elem) {
        let audio = WaveSurfer.create({
            container: $elem[0],
            scrollParent: false,
            barWidth: 3,
            height: 48,
            barHeight: 48,
            cursorColor: 'rgba(211,47,47,0.8)',
            autoCenter: false,
            normalize: true,
            hideScrollBar: true,
            progressColor: '#757575'
        });
        audio.load(file_url);
        audio.setVolume(0.5);
        return audio;
    },

    createImage: function(image) {
        let imgContent = new Image(),
            maxHeight = 400,
            maxWidth = (xabber.main_panel.$el.width() * 0.715 - 176) * 0.7;
        if (image.height)
            imgContent.height = image.height;
        if (image.width)
            imgContent.width = image.width;
        maxWidth = maxWidth > 400 ? 400 : maxWidth;
        if (xabber.settings.load_media) {
            imgContent.src = image.sources[0];
            $(imgContent).addClass('uploaded-img popup-img');
        } else {
            $(imgContent).addClass('unloaded-img');
        }
        $(imgContent).attr({'data-mfp-src': image.sources[0], title: (image.description || '')});
        if (imgContent.height && imgContent.width) {
            if (imgContent.width > maxWidth) {
                imgContent.height = imgContent.height * (maxWidth/imgContent.width);
                imgContent.width = maxWidth;
            }
            if (imgContent.height > maxHeight) {
                imgContent.width = imgContent.width * (maxHeight/imgContent.height);
                imgContent.height = maxHeight;
            }
        }
        return imgContent;
    },

    createVideo: function(video, idx) {
        video.pretty_size = utils.pretty_size(video.size)
        let video_attrs = {video_src: video.sources[0], thumbnail: video.thumbnail, video_id: idx},
            $video_wrap_template = $(templates.messages.video(video_attrs));
        if (video.thumbnail){
            setTimeout(() => {
                $video_wrap_template.append($(`<img class="plyr-video-poster" src="${video.thumbnail}" onerror="this.style.display='none'">`))
            }, 1000);
        }
        return $video_wrap_template;
    },

    createImageContainer: function() {
        return $('<div class="img-content"/>')[0];
    },

    createVideoContainer: function() {
        return $('<div class="video-content"/>')[0];
    },

    onFileNotUploaded: function (message, $message, error_text, type, error_type) {
        let error_message = error_text ? xabber.getString("file_upload__error", [error_text]) : xabber.getString("file_upload__error_default");
        $message.find('.dropdown-content.retry-send-message').removeClass('hidden');
        $message.find('.msg-delivering-state').removeClass('no-click');
        $message.find('.circle-wrap .mdi-close').unbind( "click" );
        message.set('state', constants.MSG_ERROR);
        if (type == 'http' || error_type == 'wait'){
            $message.find('.repeat-upload').one("click",() => {
                this.startUploadFile(message, $message);
            });
        }
        else {
            if (this.account.get('gallery_token') && this.account.get('gallery_url'))
                this.bottom.deleteFilesFromMessages([message]);
            $message.find('.edit-upload').one("click",() => {
                if (this.model.get('encrypted')){
                    this.bottom.setEditedMessageAttachments(message, true);
                    this.bottom.setRedactedUploadMessage(message);
                }
                this.removeMessage($message);
            });
            $message.find('.repeat-upload').one("click",() => {
                message.set('state', constants.MSG_PENDING);
                $message.find('.upload-error .circle-percent-text').text('0%');
                $message.find('.mdi-alert-circle').addClass('hidden');
                $message.find('.mdi-close').removeClass('hidden');
                $message.find('.upload-error').css({ 'border-color': ''});
                $message.find('.upload-error').removeClass('upload-error');
                $message.find('.preloader-path-new').css({ 'stroke-dasharray': '0, 149.825'});
                if (this.account.get('gallery_token') && this.account.get('gallery_url'))
                    this.startGalleryUploadFile(message, $message);
                else
                    this.startUploadFile(message, $message);
            });
        }
    },

    sendChatState: function (state, type) {
        if (this.model.get('saved') || this.contact && this.contact.get('status') === 'offline')
            return;
        clearTimeout(this._chatstate_timeout);
        clearTimeout(this._chatstate_send_timeout);
        this.chat_state = false;
        let stanza = $msg({to: this.model.get('jid'), type: 'chat'}).c(state, {xmlns: Strophe.NS.CHATSTATES});
        if (this.model.get('encrypted')) {
            if (this.account.settings.get('encrypted_chatstates'))
                type = 'encrypted';
            else
                return;
        }
        type && stanza.c('subtype', {xmlns: Strophe.NS.EXTENDED_CHATSTATES, type: type});
        (state === 'composing') && (this.chat_state = true);
        this.account.sendMsg(stanza);
        if (state === 'composing') {
            this._chatstate_timeout = setTimeout(() => {
                this.chat_state = false;
            }, constants.CHATSTATE_TIMEOUT_PAUSED);
            this._chatstate_send_timeout = setTimeout(() => {
                (!this.chat_state && xabber.settings.typing_notifications) && this.sendChatState('paused');
            }, constants.CHATSTATE_TIMEOUT_PAUSED*2);
        }
    },

    onChangedMessageTimestamp: function (message) {
        let $message = this.$(`.chat-message[data-uniqueid="${message.get('unique_id')}"]`),
            $next_msg = $message.next(),
            $old_prev_msg = $message.prev();
        $message.attr({
            'data-time': message.get('timestamp')
        });
        $message.detach();
        $message.children('.right-side').find('.msg-time').attr({title: pretty_datetime(message.get('time'))}).text(utils.pretty_time(message.get('time')));
        message.get('user_info') && $message.attr('data-from-id', message.get('user_info').id);
        this.model.messages.sort();
        let index = this.model.messages.indexOf(message);
        if (index === 0) {
            if ($old_prev_msg.hasClass('chat-day-indicator'))
                $old_prev_msg.after($message);
            else
                $message.prependTo(this.$('.chat-content'));
        } else {
            let $prev_msg = this.$('.chat-message').eq(index - 1),
                is_same_sender = ($message.data('from') === $prev_msg.data('from')),
                is_same_date = moment($message.data('time')).startOf('day')
                    .isSame(moment($prev_msg.data('time')).startOf('day'));
            if (($old_prev_msg.data('from') !== $message.data('from')) && ($next_msg.data('from') === $message.data('from')) && (($next_msg.children('.right-side').find('.msg-delivering-state').attr('data-state') === 'delivered') || ($next_msg.children('.right-side').find('.msg-delivering-state').attr('data-state') === 'displayed')))
                this.showMessageAuthor($next_msg);
            if ($prev_msg.next().hasClass('chat-day-indicator') && (moment($prev_msg.next().data('time')).format('DD.MM.YY') === moment(message.get('timestamp')).format('DD.MM.YY'))) {
                $message.insertAfter($prev_msg.next());
                this.showMessageAuthor($message);
            }
            else
                $message.insertAfter($prev_msg);
            if (message.get('data_form') || message.get('forwarded_message') || !is_same_date || !is_same_sender || $prev_msg.hasClass('system') || $prev_msg.hasClass('saved-main'))
                this.showMessageAuthor($message);
            else
                this.hideMessageAuthor($message);
        }
        let last_message = this.model.last_message;
        if (!last_message || message.get('timestamp') > last_message.get('timestamp')) {
            this.model.last_message = message;
            this.chat_item.updateLastMessage();
        }
    },

    onChangedReadState: function (message) {
        let is_unread = message.get('is_unread'),
            is_synced = message.get('synced_from_server'),
            is_unread_archived = message.get('is_unread_archived'),
            is_missed_msg = message.get('missed_msg'),
            $msg = this.$(`.chat-message[data-uniqueid="${message.get("unique_id")}"]`);
        if (is_unread) {
            if (!is_unread_archived && !is_synced && !is_missed_msg)
                this.model.messages_unread.add(message);
            $msg.addClass('unread-message');
            $msg.addClass('unread-message-background');
            this.model.recountUnread();
        } else {
            if ((!is_unread_archived && !is_synced && !is_missed_msg) || this.model.messages_unread.indexOf(message) > -1)
                this.model.messages_unread.remove(message);
            $msg.removeClass('unread-message');
            setTimeout(() => {
                $msg.removeClass('unread-message-background');
            }, 1000);
            this.model.recountUnread();
            if (!message.get('muted')) {
                xabber.recountAllMessageCounter();
            }
            if (message.get('ephemeral_timer')) {
                message.set('displayed_time', new Date());
                message.collection.checkEphemeralTimers();
            }
        }
    },

    onTouchMessage: function (ev) {
        if (ev.which === 3)
            return;
        let $elem = $(ev.target), $msg;

        if ($elem.hasClass('chat-message')) {
            $msg = $elem;
        } else {
            $msg = $elem.parents('.chat-message');
        }
        if (window.getSelection() != 0) {
            utils.clearSelection();
            $msg.attr('data-no-select-on-mouseup', '1');
        }
    },

    onClickLink: function (ev) {
        let $elem = $(ev.target),
            $message = $elem.closest('.chat-message'),
            msg = this.model.messages.get($message.data('uniqueid'));
        if (!msg) {
            msg = this.account.participant_messages.get($message.data('uniqueid'));
        }
        let files = msg.get('files'),
            videos = msg.get('videos'),
            images = msg.get('images'),
            link_references = msg.get('link_references'),
            fwd_messages = [],
            fwd_link_references = [],
            files_links = '';
        if (msg.get('forwarded_message')) {
            msg.get('forwarded_message').forEach((message) => {
                message.get('images') && fwd_messages.push(message.get('images'));
                message.get('videos') && fwd_messages.push(message.get('videos'));
                message.get('link_references') && fwd_link_references.push(message.get('link_references'));
            });
        }
        $(files).each(function(idx, file) {
            if (idx > 0)
                files_links += '\n';
            files_links += file.sources[0];
        });
        $(images).each(function(idx, image) {
            if (idx > 0)
                files_links += '\n';
            files_links += image.sources[0];
        });
        $(videos).each(function(idx, image) {
            if (idx > 0)
                files_links += '\n';
            files_links += image.sources[0];
        });
        $(link_references).each(function(idx, link_reference) {
            if (files_links != "")
                files_links += '\n';
            files_links += link_reference.url;
        });
        $(fwd_messages).each(function (idx, message) {
            $(message).each(function (i, file) {
                if (files_links != "")
                    files_links += '\n';
                files_links += file.sources[0];
            });
        });
        $(fwd_link_references).each(function (idx, message) {
            $(message).each(function (i, link_reference) {
                if (files_links != "")
                    files_links += '\n';
                files_links += link_reference.url;
            });
        });
        utils.copyTextToClipboard(files_links, xabber.getString("toast_link_copied"), xabber.getString("toast__not_copied_in_clipboard"));
    },


    onClickLocationLink: function (ev) {
        ev.preventDefault()
        let $elem = $(ev.target),
            $message = $elem.closest('.chat-message'),
            msg = this.model.messages.get($message.data('uniqueid'));
        if (!msg) {
            msg = this.account.participant_messages.get($message.data('uniqueid'));
        }
        let locations = msg.get('locations'),
            fwd_messages = [],
            location_links = '';
        if (msg.get('forwarded_message')) {
            msg.get('forwarded_message').forEach((message) => {
                message.get('locations') && fwd_messages.push(message.get('locations'));
            });
        }
        $(locations).each(function(idx, location) {
            location_links += 'geo:' + location.lat + ',' + location.lon;
        });
        $(fwd_messages).each(function (idx, message) {
            $(message).each(function (i, object) {
                if (location_links != "")
                    location_links += '\n';
                location_links += 'geo:' + object.lat + ',' + object.lon;
            });
        });

        utils.copyTextToClipboard(location_links, xabber.getString("toast_location_copied"), xabber.getString("toast__not_copied_in_clipboard"));
    },

    showParticipantProperties: function (participant_id, options) {
        options = options || {};
        let participant = this.contact.participants.get(participant_id);
        if (!participant) {
            this.contact.getBlockedParticipants((response) => {
                _.extend(options, {present: null, subscription: null});
                if ($(response).find(`query user:contains(${participant_id})`).length)
                    options.blocked = true;
                else
                    options.blocked = false;
                participant = new xabber.Participant(options, {contact: this.contact});
                this.contact.showDetailsRight('all-chats', {type: 'participant'});
                this.contact.details_view_right.participants.participant_properties_panel.open(participant, {});
            }, (err) => {
                _.extend(options, {present: null, subscription: null});
                participant = new xabber.Participant(options, {contact: this.contact});
                this.contact.showDetailsRight('all-chats', {type: 'participant'});
                this.contact.details_view_right.participants.participant_properties_panel.open(participant, {});
            });
            return;
        }
        (this.contact.my_info && this.contact.my_info.get('id') === participant_id) && (participant_id = '');
        this.contact.participants.participantsRequest({id: participant_id}, (response) => {
            let data_form = this.account.parseDataForm($(response).find(`x[xmlns="${Strophe.NS.DATAFORM}"]`));
            this.contact.showDetailsRight('all-chats', {type: 'participant'});
            this.contact.details_view_right.participants.participant_properties_panel.open(participant, data_form);
        });
    },

    onClickMessage: function (ev) {
        let $elem = $(ev.target);
        if ($elem.hasClass('not-decrypted-icon') || $elem.closest('.dropdown-content').length || $elem.closest('.not-decrypted-icon').length)
            return;
        if ($elem.hasClass('file-link-download')) {
            ev.preventDefault();
            let msg = this.model.messages.get($elem.closest('.chat-message').data('uniqueid')) || this.account.context_messages.get($elem.closest('.chat-message').data('uniqueid')),
                uri = $elem.attr('href'),
                file = (msg.get('files') || []).find(f => f.sources[0] == uri);
            if (file && file.key) {
                this.model.messages.decryptFile(uri,file.key).then((result) => {
                    if (result === null)
                        return;
                    let download = document.createElement("a");
                    download.href = result;
                    download.download = file.name;
                    download.click();
                });
                return;
            } else
                xabber.openWindow($elem.attr('href'));
        }
        if ($elem.hasClass('msg-delivering-state') ||  $elem.hasClass('not-decrypted-tooltip') || $elem.hasClass('audio-control-panel') || $elem.hasClass('voice-msg-current-time') || $elem.hasClass('voice-msg-total-time')) {
            return;
        }
        if ($elem.closest(".plyr-video-container").length > 0) {
            let msg = this.model.messages.get($elem.closest('.chat-message').data('uniqueid')),
                $plyr = $elem.closest(".plyr-video-container");
            !msg && (msg = this.account.context_messages.get($elem.closest('.chat-message').data('uniqueid')));
            if (msg && msg.get('msg_player_videos')){
                if (!xabber.plyr_player_popup){
                    xabber.plyr_player_popup = new xabber.PlyrPlayerPopupView({});
                    xabber.plyr_player_popup.show({player: msg.get('msg_player_videos')[$plyr.attr('data-message-id')]});
                } else
                    xabber.plyr_player_popup.showNewVideo({player: msg.get('msg_player_videos')[$plyr.attr('data-message-id')]});
            }
            return;
        }
        if (!$elem.hasClass('mdi-link-variant') && !$elem.hasClass('msg-copy-location-content') && !$elem.hasClass('btn-retry-send-message') && !$elem.hasClass('btn-delete-message') && !$elem.hasClass('file-link-download') && !$elem.is('canvas') && !$elem.hasClass('voice-message-volume')) {
            let $msg = $elem.closest('.chat-message'), msg,
                $fwd_message = $elem.parents('.fwd-message').first(),
                is_forwarded = $fwd_message.length > 0,
                no_select_message = $msg.attr('data-no-select-on-mouseup');
            $msg.attr('data-no-select-on-mouseup', '');

            if ($elem.hasClass('data-form-field')) {
                msg = this.model.messages.get($msg.data('uniqueid'));
                if (msg)
                    this.model.sendDataForm(msg, $elem.attr('id'));
                return;
            }

            if (window.getSelection() != 0) {
                return;
            }

            if ($elem.hasClass('collapsed-forwarded-message')) {
                let msg = this.buildMessageHtml(this.account.forwarded_messages.get($elem.data('uniqueid'))),
                    expanded_fwd_message = new xabber.ExpandedMessagePanel({account: this.account, chat_content: this});
                expanded_fwd_message.$el.attr('data-color', this.account.settings.get('color'));
                this.updateMessageInChat(msg, this.account.forwarded_messages.get($elem.data('uniqueid')));
                this.initPopup(msg);
                expanded_fwd_message.open(msg);
                return;
            }

            if ($elem.hasClass('chat-msg-author') || $elem.hasClass('fwd-msg-author')) {
                let from_jid = is_forwarded ? $fwd_message.data('from') : $msg.data('from'),
                    from_id = is_forwarded ? $fwd_message.data('fromId') : $msg.data('fromId');
                if (this.contact && this.contact.get('group_chat')) {
                    this.bottom.quill.focus();
                    let caret_position = this.bottom.quill.getSelection(),
                        participant_attrs = {jid: from_jid, id: from_id, nickname: $elem.text()};
                    caret_position && (caret_position = caret_position.index);
                    participant_attrs.position = caret_position || 0;
                    this.bottom.insertMention(participant_attrs);
                }
                else if (from_jid === this.account.get('jid')) {
                    this.account.showSettings();
                } else if (from_jid === this.model.get('jid')) {
                    this.contact && this.contact.showDetailsRight('all-chats', {encrypted: this.model.get('encrypted')});
                } else {
                    if (from_jid == from_id)
                        return;
                    let contact = this.account.contacts.mergeContact(from_jid);
                    contact && contact.showDetailsRight('all-chats', {encrypted: this.model.get('encrypted')});
                }
                return;
            }

            if ($elem.hasClass('circle-avatar')) {
                let from_jid = is_forwarded ? $fwd_message.data('from') : $msg.data('from');
                if (this.model.get('group_chat')) {
                    let member_id = (is_forwarded) ? $fwd_message.attr('data-from-id') : $msg.attr('data-from-id'),
                        unique_id = (is_forwarded) ? $fwd_message.attr('data-uniqueid') : $msg.attr('data-uniqueid'),
                        msg = this.model.messages.get(unique_id) || this.account.context_messages.get(unique_id) || this.account.searched_messages.get(unique_id),
                        user_info = msg && msg.get('user_info');
                    member_id && this.showParticipantProperties(member_id, user_info);
                    return;
                }
                else if (from_jid === this.account.get('jid')) {
                    this.account.showSettings();
                } else if (from_jid === this.model.get('jid')) {
                    this.contact && this.contact.showDetailsRight('all-chats', {encrypted: this.model.get('encrypted')});
                } else {
                    let contact = this.account.contacts.mergeContact(from_jid);
                    contact && contact.showDetailsRight('all-chats', {encrypted: this.model.get('encrypted')});
                }
                return;
            }

            if ($elem.hasClass('mention')) {
                let member_id = $elem.data('target');
                if (this.contact.get('group_chat')) {
                    if (member_id && !this.contact.participants.get(member_id)) {
                        let participant = this.contact.participants.find(p => p.get('jid') === member_id);
                        participant && (member_id = participant.get('id'));
                    }
                    member_id && this.showParticipantProperties(member_id);
                }
                else {
                    if (member_id === this.account.get('jid'))
                        this.account.showSettings();
                    else if (member_id === this.model.get('jid')) {
                        this.contact && this.contact.showDetailsRight('all-chats', {encrypted: this.model.get('encrypted')});
                    } else {
                        let contact = this.account.contacts.mergeContact(member_id);
                        contact && contact.showDetailsRight('all-chats', {encrypted: this.model.get('encrypted')});
                    }
                }
                return;
            }

            if ($elem.hasClass('voice-message-play') || $elem.hasClass('no-uploaded')) {
                let $audio_elem = $elem.closest('.link-file'),
                    f_url = $audio_elem.find('.file-link-download').attr('href');
                $audio_elem.find('.mdi-play').removeClass('no-uploaded');
                if ($elem.closest('.chat-message').hasClass('encrypted')) {
                    let msg = this.model.messages.get($elem.closest('.chat-message').data('uniqueid')),
                        uri = $elem.closest('.link-file').find('.file-link-download').attr('href'),
                        file = (msg.get('files') || []).find(f => f.sources[0] == uri);
                    if (file && file.key) {
                        this.model.messages.decryptFile(f_url, file.key).then((result) => {
                            if (result === null)
                                return;
                            $audio_elem[0].voice_message = this.renderVoiceMessage($audio_elem.find('.file-container')[0], result);
                        });
                    }
                } else {
                    $audio_elem[0].voice_message = this.renderVoiceMessage($audio_elem.find('.file-container')[0], f_url);
                }
                return;
            }

            if ($elem.hasClass('mdi-play') && !($elem.closest(".video-file-wrap").length > 0)) {
                let $audio_elem = $elem.closest('.link-file');
                $audio_elem[0].voice_message.play();
                return;
            }

            if ($elem.hasClass('mdi-pause') && !($elem.closest(".video-file-wrap").length > 0)) {
                let $audio_elem = $elem.closest('.link-file');
                $audio_elem[0].voice_message.pause();
                return;
            }

            if ($elem.hasClass('msg-hyperlink')) {
                ev && ev.preventDefault();
                $elem.blur();
                let link = $elem.attr('href');
                utils.dialogs.ask(xabber.getString("open_this_link"), decodeURI(link), null, {ok_button_text: xabber.getString("open")}).done((result) => {
                    if (result)
                        utils.openWindow(link);
                });
                return;
            }

            if ($elem.closest(".msg-hyperlink").length > 0) {
                ev && ev.preventDefault();
                $elem.blur();
                let link = $elem.closest(".msg-hyperlink").attr('href');
                utils.dialogs.ask(xabber.getString("open_this_link"), decodeURI(link), null, {ok_button_text: xabber.getString("open")}).done((result) => {
                    if (result)
                        utils.openWindow(link);
                });
                return;
            }

            if ($elem.hasClass('uploaded-img')||$elem.hasClass('img-content')||($elem.hasClass('uploaded-img-for-collage'))) {
                $elem.hasClass('img-content') && $elem.children('img').click();
                return;
            }

            if ($elem.hasClass('unloaded-img')) {
                let img_information = this.getImagesInformation(this.model.messages.get($elem.closest('.chat-message').data('uniqueid')));
                utils.dialogs.ask(xabber.getString("privacy_risk"), xabber.getString("privacy_risk_text"), {inverted_buttons: true, img_details: $(templates.messages.images_details({img_information: img_information}))}, { ok_button_text: xabber.getString("privacy_risk_btn_ok")}).done((result) => {
                    if (result) {
                        $elem.attr('src',$elem.attr('data-mfp-src'));
                        $elem.removeClass('unloaded-img');
                        $elem.addClass('uploaded-img');
                        this.initPopup($elem.closest('.chat-message'));
                        $elem.closest('.chat-message').find('.img-privacy-warning').remove()
                    }
                });
                return;
            }

            if ($elem.hasClass('img-content-template') && $elem.find('img').hasClass('unloaded-img')) {
                let img_information = this.getImagesInformation(this.model.messages.get($elem.closest('.chat-message').data('uniqueid')));
                utils.dialogs.ask(xabber.getString("privacy_risk"), xabber.getString("privacy_risk_text"), {inverted_buttons: true, img_details: $(templates.messages.images_details({img_information: img_information}))}, { ok_button_text: xabber.getString("privacy_risk_btn_ok")}).done((result) => {
                    if (result) {
                        let $msg = $elem.closest('.chat-message'),
                            $imgs = $msg.find('.img-content-template img');
                        $imgs.each((idx, img) => {
                            $(img).attr('src',$(img).attr('data-mfp-src'));
                        });
                        $imgs.removeClass('unloaded-img');
                        $imgs.addClass('uploaded-img-for-collage');
                        this.initPopup($msg);
                        $elem.closest('.chat-message').find('.img-privacy-warning').remove()
                    }
                });
                return;
            }

            if ($elem.hasClass('chat-msg-location-content') || $elem.hasClass('location-link') || $elem.closest(".video-file-wrap").length > 0 || $elem.closest(".embed-video").length > 0) {
                return;
            }

            if ($elem.hasClass('last-image')) {
                $elem.find('img').length && $elem.find('img')[0].click();
                return;
            }

            if ($elem.hasClass('image-counter')) {
                $elem.closest('.last-image').find('img')[0].click();
                return;
            }

            if ($msg.hasClass('searched-message')) {
                this.model.getMessageContext($msg.data('uniqueid'), {searched_messages: true});
                return;
            }

            let processClick = () => {
                let $prev_selected = $msg.hasClass('selected') ? $msg.prevAll('.chat-message.selected').last() : $msg.prevAll('.chat-message.selected').first();
                !$prev_selected.length && ($prev_selected = $msg.hasClass('selected') ? $msg.nextAll('.chat-message.selected').last() : $msg.nextAll('.chat-message.selected').first());
                !$prev_selected.length && ($prev_selected = $msg.hasClass('selected') ? $msg.prevAll('.chat-message.selected').first() : $msg.prevAll('.chat-message.selected').last());
                if ((xabber.shiftctrl_pressed || xabber.shift_pressed) && $prev_selected.length) {
                    let $all_msgs = [], is_selected = $msg.hasClass('selected');
                    if ($prev_selected.attr('data-time') < $msg.attr('data-time'))
                        $all_msgs = $prev_selected.nextUntil($msg, '.chat-message:not(.system)');
                    else
                        $all_msgs = $msg.nextUntil($prev_selected, '.chat-message:not(.system)');
                    xabber.shift_pressed && this.$('.chat-message').removeClass('selected');
                    $prev_selected.switchClass('selected', !is_selected);
                    $all_msgs.switchClass('selected', !is_selected);
                    $msg.switchClass('selected', !is_selected);
                    ev.preventDefault();
                    this.bottom.manageSelectedMessages();
                    return false;
                }
                if (!no_select_message) {
                    $msg.switchClass('selected', !$msg.hasClass('selected'));
                    ev.preventDefault();
                    this.bottom.manageSelectedMessages();
                    return false;
                }
            };

            if ($msg.hasClass('participant-message') || $msg.hasClass('context-message')) {
                if ($msg.hasClass('system'))
                    return;
                processClick();
                return;
            }

            msg = this.model.messages.get($msg.data('uniqueid'));
            if (!msg) {
                return;
            }

            let type = msg.get('type');
            if (type === 'file_upload') {
                return;
            }

            if (type === 'system') {
                return;
            } else if (is_forwarded) {
                let fwd_message = this.account.forwarded_messages.get($fwd_message.data('uniqueid'));
                if (!fwd_message) {
                    return;
                }
                processClick();
            } else {
                processClick();
            }
        }
    },

    onClickLocation: function (ev) {
        ev.preventDefault();
        let lon = $(ev.target).attr('lon'),
            lat = $(ev.target).attr('lat'),
            location_name = $(ev.target).attr('title');
        if (lon && lat){
            xabber.popup_coordinates = [lon, lat];
            xabber.location_name = location_name;
            new xabber.ChatLocationView({content: this}).show(ev);
        }
    },

    onHoverLocation: function (ev) {
        let lon = $(ev.target).attr('lon'),
            lat = $(ev.target).attr('lat');

        fetch('https://nominatim.openstreetmap.org/reverse?format=json&lon=' + lon + '&lat=' + lat).then(function(response) {
            return response.json();
        }).then(function(json) {
            if (!json.error) {
                $(ev.target).attr('title', json.display_name);
            }
            else {
                $(ev.target).attr('title', xabber.getString("location_fragment__address_error__title"));
            }
            $(ev.target).removeClass('no-title')
        })
    },

    retrySendMessage: function (ev) {
        let $msg = $(ev.target).closest('.chat-message'),
            msg = this.model.messages.get($msg.data('uniqueid'));
        if (msg.get('type') === 'file_upload') {
            msg.set('state', constants.MSG_PENDING);
            this.startUploadFile(msg, $msg);
        }
        else
            this.sendMessage(msg);
        ev.preventDefault();
    },

    removeFileErrorMessage: function (ev) {
        let $msg = $(ev.target).closest('.chat-message');
        this.removeMessage($msg);
        ev.preventDefault();
        this.chat_item.updateChatError();
    },

    onUpdatePlyr: function (ev) {
        this.$('.plyr-video-container').removeClass('active-plyr-container');
        if (xabber.current_plyr_player && xabber.current_plyr_player.player_item) {
            let $message = this.$(`.chat-message[data-uniqueid="${xabber.current_plyr_player.message_unique_id}"]`);
            if ($message.length) {
                $message.find(`.plyr-video-container[data-message-id="${xabber.current_plyr_player.player_item.message_id}"]`).addClass('active-plyr-container');
            }
        }
    },
});


xabber.ChatContentPlaceholderView = xabber.BasicView.extend({
    className: 'chat-body-content-placeholder-wrap',
    template: templates.chat_content_placeholder,

    events: {

    },

    _initialize: function (options) {
        return this;
    },

    render: function () {
    },
});

xabber.ExpandedMessagePanel = xabber.BasicView.extend({
    className: 'modal expanded-message',
    template: templates.group_chats.pinned_message_panel,
    ps_selector: '.modal-content',
    ps_settings: {theme: 'item-list'},

    events: {
        "click .collapsed-forwarded-message": "expandFwdMessage",
        "click .chat-message": "onClickPinnedMessage",
        'click .chat-msg-location-content': 'onClickExpandedMessageLocation',
        'click .mdi-link-variant' : 'onClickLink',
    },

    _initialize: function (options) {
        this.account = options.account;
        this.chat_content = options.chat_content;
        this.message = options.message;
    },

    open: function ($message) {
        this.$el.css('width', $message.find('.chat-text-content').text().length <= 60 ? 540 : xabber.main_panel.$el.width() * 0.715);
        this.$el.openModal({
            ready: () => {
                this.updateScrollBar();
                this.$('.modal-content').css('height', this.$el.height() - 12);
                if ($message.find('.plyr-video-container').length) {
                    this.chat_content.initPlyrEmbedPlayer($message, this.message);
                }
            },
            complete: () => {
                this.$el.detach();
                this.data.set('visible', false);
            }
        });
        $message.find('.right-side .msg-delivering-state').remove();
        this.$('.modal-content').html($message);
    },

    close: function () {
        this.$el.closeModal({ complete: this.hide.bind(this) });
    },

    onClickLink:function (ev) {
        this.chat_content.onClickLink(ev);
    },

    onClickPinnedMessage: function (ev) {
        let $elem = $(ev.target);
        if ($elem.hasClass('msg-hyperlink')) {
            ev && ev.preventDefault();
            let link = $elem.attr('href');
            utils.dialogs.ask(xabber.getString("open_this_link"), decodeURI(link), null, {ok_button_text: xabber.getString("open")}).done((result) => {
                if (result)
                    utils.openWindow(link);
            });
            return;
        }
        if ($elem.closest(".plyr-video-container").length > 0) {
            let msg = this.chat_content.model.messages.get($elem.closest('.chat-message').data('uniqueid')),
                $plyr = $elem.closest(".plyr-video-container");
            !msg && (msg = this.account.forwarded_messages.get($elem.closest('.chat-message').data('uniqueid')));
            if (msg && msg.get('msg_player_videos')){
                if (!xabber.plyr_player_popup){
                    xabber.plyr_player_popup = new xabber.PlyrPlayerPopupView({});
                    xabber.plyr_player_popup.show({player: msg.get('msg_player_videos')[$plyr.attr('data-message-id')]});
                } else
                    xabber.plyr_player_popup.showNewVideo({player: msg.get('msg_player_videos')[$plyr.attr('data-message-id')]});
            }
            return;
        }
        if ($elem.hasClass('voice-message-play') || $elem.hasClass('no-uploaded')) {
            let $audio_elem = $elem.closest('.link-file'),
                f_url = $audio_elem.find('.file-link-download').attr('href');
            $audio_elem.find('.mdi-play').removeClass('no-uploaded');
            if ($elem.closest('.chat-message').hasClass('encrypted')) {
                let msg = this.chat_content.model.messages.get($elem.closest('.chat-message').data('uniqueid')),
                    uri = $elem.closest('.link-file').find('.file-link-download').attr('href'),
                    file = (msg.get('files') || []).find(f => f.sources[0] == uri);
                if (file && file.key) {
                    this.chat_content.model.messages.decryptFile(f_url, file.key).then((result) => {
                        if (result === null)
                            return;
                        $audio_elem[0].voice_message = this.chat_content.renderVoiceMessage($audio_elem.find('.file-container')[0], result);
                    });
                }
            } else {
                $audio_elem[0].voice_message = this.chat_content.renderVoiceMessage($audio_elem.find('.file-container')[0], f_url);
            }
            return;
        }
        if ($elem.hasClass('mdi-play') && !($elem.closest(".video-file-wrap").length > 0)) {
            let $audio_elem = $elem.closest('.link-file');
            $audio_elem[0].voice_message.play();
            return;
        }
    },
    onClickExpandedMessageLocation: function (ev) {
        ev.preventDefault();
        let lon = $(ev.target).attr('lon'),
            lat = $(ev.target).attr('lat'),
            location_name = $(ev.target).attr('title');
        if (lon && lat){
            xabber.popup_coordinates = [lon, lat];
            xabber.location_name = location_name;
            new xabber.ChatLocationView({content: this}).show(ev);
        }
    },

    expandFwdMessage: function (ev) {
        let $target = $(ev.target),
            unique_id = $target.data('uniqueid'),
            msg = this.chat_content.buildMessageHtml(this.account.forwarded_messages.get(unique_id)),
            expanded_fwd_message = new xabber.ExpandedMessagePanel({account: this.account, chat_content: this.chat_content});
        expanded_fwd_message.$el.attr('data-color', this.account.settings.get('color'));
        this.chat_content.updateMessageInChat(msg, this.account.forwarded_messages.get(unique_id));
        this.chat_content.initPopup(msg);
        expanded_fwd_message.open(msg);
    }
});

xabber.ChatsBase = Backbone.Collection.extend({
    model: xabber.Chat
});

xabber.Chats = xabber.ChatsBase.extend({
    initialize: function (models, options) {
        this.collections = [];
        this.on("add", _.bind(this.updateInCollections, this, 'add'));
        this.on("change", _.bind(this.updateInCollections, this, 'change'));
    },

    addCollection: function (collection) {
        this.collections.push(collection);
    },

    updateInCollections: function (event, contact) {
        _.each(this.collections, function (collection) {
            collection.update(contact, event);
        });
    },

    registerQuillEmbeddedsTags: function () {
        let Inline = Quill.import('blots/inline'),
            Image = Quill.import('formats/image');

        class Mention extends Inline {
            static create(paramValue) {
                let node = super.create(), data, target;
                if (paramValue.on_format){
                    data = paramValue.data;
                    target = paramValue.target;
                } else {
                    data = JSON.parse(paramValue);
                    target = data.jid ? ('?jid=' + data.jid) : (data.id ?  ('?id=' + data.id) : "");
                    node.innerHTML = data.nickname;
                }
                data.is_me && node.classList.add('ground-color-100');
                node.setAttribute('data-target', target);
                return node;
            }

            static value(node) {
                return node.innerHTML;
            }

            static formats(node) {
                return {
                    on_format: true,
                    data: {
                        nickname: node.innerHTML,
                        is_me: node.classList.contains("ground-color-100")
                    },
                    target: node.getAttribute('data-target')
                };
            }
        }
        Mention.blotName = 'mention';
        Mention.tagName = 'mention';
        Mention.prototype.optimize = function () {};

        Quill.register(Mention);
    }
});

xabber.OpenedChats = xabber.ChatsBase.extend({
    comparator: function (item1, item2) {
        let t1 = item1.get('timestamp'),
            t2 = item2.get('timestamp');
        return t1 > t2 ? -1 : (t1 < t2 ? 1 : 0);
    },

    initialize: function (models, options) {
        this.on("change:timestamp", this.sort, this);
    },

    update: function (chat, event) {
        let contains = chat.get('opened');
        if (contains) {
            if (!this.get(chat)) {
                this.add(chat);
                chat.trigger("add_opened_chat", chat);
            }
        } else if (this.get(chat)) {
            this.remove(chat);
            chat.trigger("remove_opened_chat", chat);
        }
    }
});

xabber.ClosedChats = xabber.ChatsBase.extend({
    update: function (chat, event) {
        let contains = !chat.get('opened');
        if (contains) {
            if (!this.get(chat)) {
                this.add(chat);
                chat.trigger("add_closed_chat", chat);
            }
        } else if (this.get(chat)) {
            this.remove(chat);
            chat.trigger("remove_closed_chat", chat);
        }
    }
});

xabber.AccountChats = xabber.ChatsBase.extend({
    initialize: function (models, options) {
        this.account = options.account;
        this.mam_requests = 0;
        this.deferred_mam_requests = [];
        this.account.contacts.on("open_chat", this.openChat, this);
        this.account.contacts.on("open_mention", this.openMention, this);
        this.account.contacts.on("presence", this.onPresence, this);
        this.account.contacts.on("roster_push", this.onRosterPush, this);
    },

    getSavedChat: function () {
      let jid = this.account.get('jid'),
          attrs = {jid: jid, type: 'saved', name: xabber.getString("saved_messages__header"), id: `${jid}:saved`},
          chat = this.get(attrs.id);
        if (!chat) {
            chat = xabber.chats.create(attrs, {account: this.account});
            this.add(chat);
            chat.trigger("load_last_history");
        }
        return chat;
    },

    getChat: function (contact, identifier, sync_created) {
        let attrs = null,
            id = identifier && `${contact.hash_id}:${identifier}`,
            chat = id ? this.get(id) : this.get(contact.hash_id);
        if (id)
            attrs = {id};
        if (identifier === 'encrypted')
            attrs.type = identifier;
        if (!chat) {
            chat = xabber.chats.create(attrs, {contact: contact, sync_created: sync_created});
            this.add(chat);
            contact.set('known', true);
        }
        return chat;
    },

    openChat: function (contact, options) {
        options = options || {};
        _.isUndefined(options.clear_search) && (options.clear_search = true);
        let chat = this.getChat(contact, options.encrypted && 'encrypted');
        if (options && options.force_opened_state){
            chat.set('opened', true);
            chat.set('timestamp', Date.now());
        }
        chat.trigger('open', {clear_search: options.clear_search, right_force_close: options.right_force_close});
    },

    openMention: function (contact, unique_id) {
        let chat = this.getChat(contact);
        xabber.body.setScreen('mentions', {right: 'mentions', chat_item: chat.item_view});
        unique_id && chat.getMessageContext(unique_id, {mention: true});
    },

    registerMessageHandler: function () {
        this.account.connection.deleteHandler(this._msg_handler);
        this._msg_handler = this.account.connection.addHandler((message) => {
            this.receiveMessage(message);
            return true;
        }, null, 'message');
    },

    onStartedMAMRequest : function (deferred) {
        this.deferred_mam_requests.push(deferred);
        this.runMAMRequests();
    },

    onCompletedMAMRequest: function (deferred) {
        this.mam_requests--;
        this.runMAMRequests();
    },

    runMAMRequests: function () {
        while (this.mam_requests < xabber.settings.mam_requests_limit) {
            let deferred = this.deferred_mam_requests.shift();
            if (!deferred) break;
            this.mam_requests++;
            deferred.resolve();
        }
    },

    parsePubSubNode: function (node) {
        if (!node)
            return null;
        let is_member_id = node.indexOf('#');
        if (is_member_id !== -1)
            return node.slice(is_member_id + 1, node.length);
        else
            return null;
    },

    receivePubsubMessage: function ($message) {
        let photo_id =  $message.find('info').attr('id'),
            from_jid = Strophe.getBareJidFromJid($message.attr('from')),
            node = $message.find('items').attr('node');
        if (node.indexOf(Strophe.NS.OMEMO) > -1)
            return;
        if (node.indexOf(Strophe.NS.PUBSUB_AVATAR_METADATA) > -1) {
            let member_id = this.parsePubSubNode(node),
                photo_url =  $message.find('info').attr('url'),
                contact = this.account.contacts.get(from_jid);
            if (contact) {
                if (member_id) {
                    if (contact.my_info) {
                        if ((member_id == contact.my_info.get('id')) && (photo_id == contact.my_info.get('avatar'))) {
                            contact.trigger('update_my_info');
                            return;
                        }
                    }
                    if (photo_id && (this.account.chat_settings.getHashAvatar(member_id) != photo_id)) {
                        let member_node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + member_id;
                        contact.getAvatar(photo_id, member_node, (new_avatar) => {
                                this.account.chat_settings.updateCachedAvatars(member_id, photo_id, new_avatar);
                                if (contact.my_info) {
                                    if (member_id == contact.my_info.id) {
                                        contact.my_info.set({avatar: photo_id, b64_avatar: new_avatar});
                                        contact.trigger('update_my_info');
                                    }
                                }
                                let participant = contact.participants && contact.participants.get(member_id);
                                if (participant) {
                                    let avatar_url = $message.find('info').attr('url');
                                    participant.set({avatar: photo_id, b64_avatar: new_avatar});
                                    avatar_url && participant.set('avatar_url', avatar_url);
                                    this.account.groupchat_settings.updateParticipant(contact.get('jid'), participant.attributes);
                                }
                            }, () => {
                                if (photo_url) {
                                    this.account.chat_settings.updateCachedAvatars(member_id, photo_id, photo_url);
                                    if (contact.my_info) {
                                        if (member_id == contact.my_info.id) {
                                            contact.my_info.set({avatar: photo_id, b64_avatar: photo_url});
                                            contact.trigger('update_my_info');
                                        }
                                    }
                                    let participant = contact.participants && contact.participants.get(member_id);
                                    if (participant) {
                                        participant.set({avatar: photo_id, b64_avatar: photo_url});
                                        this.account.groupchat_settings.updateParticipant(contact.get('jid'), participant.attributes);
                                    }
                                    return;
                                }
                            });
                    }
                }
                else if (!this.get('avatar_priority') || this.get('avatar_priority') <= constants.AVATAR_PRIORITIES.PUBSUB_AVATAR) {
                    if (!photo_id) {
                        let image = Images.getDefaultAvatar(contact.get('name'));
                        contact.cached_image = Images.getCachedImage(image);
                        contact.set('avatar_priority', constants.AVATAR_PRIORITIES.PUBSUB_AVATAR);
                        contact.set('photo_hash', null);
                        contact.set('image', image);
                        contact.updateCachedInfo();
                        return;
                    }
                    if ((photo_id !== "") && (contact.get('photo_hash') === photo_id)) {
                        return;
                    } else if (photo_url) {
                        contact.cached_image = photo_url;
                        contact.set({photo_hash: photo_id, image: photo_url, avatar_priority: constants.AVATAR_PRIORITIES.PUBSUB_AVATAR});
                    }
                    contact.getAvatar(photo_id, Strophe.NS.PUBSUB_AVATAR_DATA, (data_avatar) => {
                        contact.cached_image = Images.getCachedImage(data_avatar);
                        contact.set('avatar_priority', constants.AVATAR_PRIORITIES.PUBSUB_AVATAR);
                        contact.set('photo_hash', photo_id);
                        contact.set('image', data_avatar);
                        contact.updateCachedInfo();
                    });
                }
            }
            else if (from_jid === this.account.get('jid')) {
                if (photo_url) {
                    let avatar_attrs = {photo_hash: photo_id, image: photo_url, avatar_priority: constants.AVATAR_PRIORITIES.PUBSUB_AVATAR};
                    this.account.cached_image = photo_url;
                    this.account.save(avatar_attrs);
                    return;
                }
                if (!photo_id) {
                    let image = Images.getDefaultAvatar(this.account.get('name'));
                    this.account.cached_image = Images.getCachedImage(image);
                    let avatar_attrs = {avatar_priority: constants.AVATAR_PRIORITIES.PUBSUB_AVATAR, image: image};
                    this.account.save(avatar_attrs);
                    return;
                }
                this.account.getAvatar(photo_id, (data_avatar) => {
                    this.account.cached_image = Images.getCachedImage(data_avatar);
                    let avatar_attrs = {avatar_priority: constants.AVATAR_PRIORITIES.PUBSUB_AVATAR, image: data_avatar};
                    this.account.save(avatar_attrs);
                });
            }
        }
    },

    receiveMessage: function (message) {
        let $message = $(message),
            type = $message.attr('type'),
            $mam = $message.find(`result[xmlns="${Strophe.NS.MAM}"]`);
        if (this.account.connection.do_synchronization && Strophe.getBareJidFromJid($(message).attr('from')) !== this.account.get('jid')) {
            let time = $message.children('time').attr('stamp') || $message.children('delay').attr('stamp'),
                timestamp = Number(moment(time));
            (timestamp > this.account.last_msg_timestamp) && (this.account.last_msg_timestamp = timestamp);
        }
        if (type === 'headline') {
            return this.receiveHeadlineMessage(message);
        }
        if (type === 'chat' || (type === 'normal') || (!type && !$mam.length)) {
            return this.receiveChatMessage(message);
        }
        if (type === 'error') {
            return this.receiveErrorMessage(message);
        }
    },

    receiveHeadlineMessage: function (message) {
        let $message = $(message),
            msg_from = Strophe.getBareJidFromJid($message.attr('from')),
            $stanza_received = $message.find(`received[xmlns="${Strophe.NS.DELIVERY}"]`),
            $echo_msg = $message.children(`x[xmlns="${Strophe.NS.DELIVERY}"]`).children('message');
        if ($stanza_received.length) {
            let stanza_id = $stanza_received.children('stanza-id').attr('id'),
                origin_msg_id = $stanza_received.children('origin-id').first().attr('id');
            if (origin_msg_id) {
                let msg = this.account.messages.get(origin_msg_id || stanza_id),
                    delivered_time = $stanza_received.children('time').attr('stamp') || moment(stanza_id/1000).format();
                if (!msg)
                    return;
                let pending_message = this.account._pending_messages.find(msg => msg.unique_id == (origin_msg_id || stanza_id));
                if (!pending_message)
                    return;
                let chat = this.account.chats.get(pending_message.chat_hash_id);
                if (chat && chat.get('group_chat'))
                    return;
                if (!msg.get('stanza_id') && msg.get('locations'))
                    msg.set({'stanza_id': stanza_id})
                msg.set({'state': constants.MSG_SENT, 'time': delivered_time, 'timestamp': Number(moment(delivered_time))}); // delivery receipt, changing on server time
                chat.setStanzaId(pending_message.unique_id, stanza_id);
                this.account._pending_messages.splice(this.account._pending_messages.indexOf(pending_message), 1);
            }
            return;
        }

        if ($echo_msg.length) {
            console.log(this.account._pending_messages);
            console.log(this.account._pending_messages.length);
            let origin_msg_id = $echo_msg.children('origin-id').first().attr('id'),
                pending_message = this.account._pending_messages.find(msg => msg.unique_id == origin_msg_id);
            if (pending_message) {
                this.account._pending_messages.splice(this.account._pending_messages.indexOf(pending_message), 1);
            }
            console.log(this.account._pending_messages.length);
            return this.receiveChatMessage($echo_msg[0], {echo_msg: true, stanza_id: $echo_msg.children('stanza-id').attr('id')});
        }

        let $token_revoke = $message.children(`revoke[xmlns="${Strophe.NS.AUTH_DEVICES}"]`);
        if ($token_revoke.length) {
            $token_revoke.children('device').each((idx, token) => {
                let $token = $(token),
                    token_uid = $token.attr('id');
                if (!token_uid)
                    return;
                if (this.account.get('x_token') && this.account.get('x_token').token_uid === token_uid) {
                    this.account.deleteAccount();
                    return;
                }
                if (this.account.x_tokens_list) {
                    let token = this.account.x_tokens_list.find(token => token.token_uid == token_uid),
                        token_idx = token ? this.account.x_tokens_list.indexOf(token) : -1;
                    (token_idx > -1) && this.account.x_tokens_list.splice(token_idx, 1);
                }
            });
            this.account.settings_right && this.account.settings_right.updateXTokens();
            return;
        }

        if ($message.find(`event[xmlns="${Strophe.NS.PUBSUB}#event"]`).length) {
            this.receivePubsubMessage($message);
            return;
        }

        let contact = this.account.contacts.get(msg_from), chat;
        if (contact) {
            contact && (chat = this.account.chats.getChat(contact));
            if (!chat.item_view.content)
                chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
        }

        if ($message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}#system-message"]`).length) {
            if (!contact)
                return;
            let participant_version = $message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}#system-message"]`).attr('version');
            if (participant_version && contact.participants && contact.participants.version < participant_version)
                contact.trigger('update_participants');
        }

        if ($message.children(`attention[xmlns="${Strophe.NS.ATTENTION}"]`).length && xabber.settings.call_attention) {
            if (!chat)
                return;
            return chat.messages.createSystemMessage({from_jid: msg_from, message: xabber.getString("action_attention_requested"), attention: true});
        }

        if ($message.find(`replace[xmlns="${Strophe.NS.REWRITE}#notify"]`).length) {
            !contact && (contact = this.account.contacts.get($message.find('replace').attr('conversation'))) && (chat = this.account.chats.getChat(contact));
            if ($message.find('replace').attr('conversation') === this.account.get('jid'))
                chat = this.getSavedChat();
            if (!chat)
                return;
            let stanza_id = $message.find('replace').attr('id'),
                msg_item = chat.messages.find(msg => msg.get('stanza_id') == stanza_id || msg.get('contact_stanza_id') == stanza_id),
                active_right_screen = xabber.body.screen.get('right'),
                participant_messages = active_right_screen === 'participant_messages' && this.account.participant_messages || active_right_screen === 'message_context' && this.account.context_messages || active_right_screen === 'searched_messages' && this.account.searched_messages || [],
                participant_msg_item = participant_messages.find(msg => msg.get('stanza_id') == stanza_id);
            this.receiveChatMessage($message, {replaced: true});
            if (participant_msg_item) {
                participant_msg_item.set('last_replace_time', $message.find('replaced').last().attr('stamp'));
            }
            if (msg_item) {
                msg_item.set('last_replace_time', $message.find('replaced').last().attr('stamp'));
                if (contact && contact.get('pinned_message'))
                    if (contact.get('pinned_message').get('unique_id') === msg_item.get('unique_id')) {
                        contact.get('pinned_message').set('message', msg_item.get('message'));
                        if (!chat.item_view.content)
                            chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                        chat.item_view.content.updatePinnedMessage();
                    }
                chat && chat.item_view.updateLastMessage(chat.last_message);
            }
        }
        if ($message.find('retract-message').length) {
            let is_encrypted = $message.find('retract-message').attr('type') == Strophe.NS.OMEMO;
            !contact && (contact = this.account.contacts.get($message.find('retract-message').attr('conversation'))) && (chat = this.account.chats.getChat(contact,  is_encrypted && 'encrypted'));
            if ($message.find('retract-message').attr('conversation') === this.account.get('jid'))
                chat = this.getSavedChat();
            if (!chat)
                return;
            let $retracted_msg = $message.find('retract-message'),
                retracted_msg_id = $retracted_msg.attr('id'),
                retract_version = $retracted_msg.attr('version'),
                msg_item = chat.messages.find(msg => msg.get('stanza_id') == retracted_msg_id || msg.get('contact_stanza_id') == retracted_msg_id);
            chat.retracted_msg_id_list.push(retracted_msg_id);
            if (msg_item) {
                msg_item.set('is_unread', false);
                if (!chat.item_view.content)
                    chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                chat.item_view.content.removeMessage(msg_item);
                chat.item_view.updateLastMessage(chat.last_message);
            }
            if (!chat.get('group_chat') && retract_version > this.account.retraction_version) {
                this.account.retraction_version = retract_version;
            }
        }
        if ($message.find('retract-user').length) {
            let $retracted_user_msgs = $message.find('retract-user'),
                retracted_user_id = $retracted_user_msgs.attr('id'),
                msg_item = chat.messages.filter(msg => msg.get('user_info') && (msg.get('user_info').id == retracted_user_id));
            if (msg_item)
                $(msg_item).each((idx, item) => {
                    item.set('is_unread', false);
                    if (!chat.item_view.content)
                        chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                    chat.item_view.content.removeMessage(item);
                });
            chat.item_view.updateLastMessage(chat.last_message);
        }
        if ($message.find('retract-all').length) {
            !contact && (contact = this.account.contacts.get($message.find('retract-all').attr('conversation'))) && (chat = this.getChat(contact, $message.find('retract-all').attr('type') == 'encrypted' && 'encrypted'));
            if (!chat)
                return;
            let all_messages = chat.messages.models;
            $(all_messages).each((idx, item) => {
                if (!chat.item_view.content)
                    chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                chat.item_view.content.removeMessage(item);
            });
            chat.item_view.updateLastMessage();
        }
        return;
    },

    receiveStanzaId: function ($message, options) {
        options.replaced && ($message = $message.children('replace').children('message'));
        let $stanza_id, $contact_stanza_id, attrs = {},
            from_bare_jid = options.from_bare_jid;
            $message.children('stanza-id').each((idx, stanza_id) => {
            stanza_id = $(stanza_id);
            if ($message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}"]`).length && !($message.find(`invite[xmlns="${Strophe.NS.GROUP_CHAT_INVITE_HTTP}"]`).length || $message.find(`invite[xmlns="${Strophe.NS.GROUP_CHAT_INVITE}"]`).length)) {
                if (stanza_id.attr('by') === from_bare_jid) {
                    $stanza_id = stanza_id;
                    $contact_stanza_id = stanza_id;
                }
                else
                    $stanza_id = stanza_id;
            }
            else {
                if (stanza_id.attr('by') === this.account.get('jid'))
                    $stanza_id = stanza_id;
                else
                    $contact_stanza_id = stanza_id;
            }
        });
        $stanza_id && (attrs.stanza_id = $stanza_id.attr('id'));
        $contact_stanza_id && (attrs.contact_stanza_id = $contact_stanza_id.attr('id'));
        return attrs;
    },

    receiveChatMessage: function (message, options) {
        options = options || {};
        let $message = $(message),
            $forwarded = $message.find('forwarded'),
            $delay = options.delay,
            to_jid = $message.attr('to'),
            to_bare_jid = Strophe.getBareJidFromJid(to_jid),
            to_resource = to_jid && Strophe.getResourceFromJid(to_jid),
            from_jid = $message.attr('from') || options.from_jid;

        if ($message.children(`encrypted[xmlns="${Strophe.NS.OMEMO}"]`).length && !options.forwarded) {
            if (this.account.omemo)
                this.account.omemo.receiveChatMessage(message, options);
            return;
        }

        if ($message.find('invite').length) {
            if (options.forwarded)
                return;
        }

        if (!from_jid) {
            from_jid = this.account.get('jid');
        }
        let from_bare_jid = Strophe.getBareJidFromJid(from_jid),
            is_sender = from_bare_jid === this.account.get('jid');

        if (options.forwarded && (!$forwarded.length || (options.xml))) {
            return this.account.forwarded_messages.createFromStanza($message, {
                is_forwarded: true,
                forwarded_message: options.forwarded_message || null,
                delay: $delay,
                replaced: options.replaced,
                from_jid: from_jid,
                xml: options.xml
            });
        }

        if ($forwarded.length && !options.xml) {
            let $mam = $message.find(`result[xmlns="${Strophe.NS.MAM}"]`);
            if ($mam.length) {
                if (!Object.keys(options).length)
                    return;
                $forwarded = $mam.children('forwarded');
                if ($forwarded.length) {
                    $message = $forwarded.children('message');
                    $delay = $forwarded.children('delay');
                }
                let stanza_ids = this.receiveStanzaId($message, {from_bare_jid: from_bare_jid});
                return this.receiveChatMessage($message[0], _.extend(options, {
                    is_mam: true,
                    delay: $delay,
                    stanza_id: stanza_ids.stanza_id || $mam.attr('id'),
                    contact_stanza_id: stanza_ids.contact_stanza_id
                }));
            }
            let $carbons = $message.find(`[xmlns="${Strophe.NS.CARBONS}"]`);
            if (!options.carbon_copied && $carbons.length && ['received', 'sent'].includes($carbons[0].tagName)) {
                if ($message.find('invite').length) {
                    if ($carbons[0].tagName === 'sent')
                        return;
                }
                if (!is_sender)
                    return;
                $forwarded = $carbons.children('forwarded');
                if ($forwarded.length)
                    $message = $forwarded.children('message');
                if ($carbons.find(`request[xmlns="${Strophe.NS.DELIVERY}"][to="${to_bare_jid}"]`).length)
                    return;
                if (this.account.fast_connection && ($message.attr('from') === this.account.fast_connection.jid))
                    return;
                return this.receiveChatMessage($message[0], _.extend(options, {
                    carbon_copied: true, carbon_direction: $carbons[0].tagName
                }));
            }
            let forwarded_msgs = [];
            $forwarded = $message.children(`reference[type="mutable"][xmlns="${Strophe.NS.REFERENCE}"]`).length ?
                $message.children(`reference[type="mutable"][xmlns="${Strophe.NS.REFERENCE}"]`).children('forwarded[xmlns="' + Strophe.NS.FORWARD + '"]') :
                $message.children('envelope').children('content').children(`reference[type="mutable"][xmlns="${Strophe.NS.REFERENCE}"]`).children('forwarded[xmlns="' + Strophe.NS.FORWARD + '"]');
            $forwarded.each((idx, forwarded_msg) => {
                let $forwarded_msg = $(forwarded_msg),
                    $forwarded_message = $forwarded_msg.children('message'),
                    $forwarded_delay = $forwarded_msg.children('delay');
                let forwarded_message = this.receiveChatMessage($forwarded_message[0], {
                    forwarded: true,
                    pinned_message: options.pinned_message,
                    participant_message: options.participant_message,
                    searched_message: options.searched_message,
                    is_searched: options.is_searched,
                    context_message: options.context_message,
                    from_jid: from_jid,
                    delay: $forwarded_delay
                });
                forwarded_msgs.push(forwarded_message);
            });
            if (!Object.keys(options).length && !forwarded_msgs.length)
                return;
            return this.receiveChatMessage($message[0], _.extend({
                forwarded_message: forwarded_msgs.length ? forwarded_msgs : null,
                xml: $message[0]
            }, options));
        }

        if (!options.is_mam && to_resource && to_resource !== this.account.resource) {
            xabber.warn('Message to another resource');
            xabber.warn(message);
        }

        let contact_jid = is_sender ? to_bare_jid : from_bare_jid;
        options.replaced && (contact_jid = $message.children('replace').attr('conversation'));

        if (contact_jid === this.account.get('jid')) {
            if (options.carbon_copied && options.carbon_direction === 'sent' || !options.carbon_copied) {
                let chat = this.getSavedChat(),
                    stanza_ids = this.receiveStanzaId($message, {from_bare_jid: from_bare_jid, carbon_copied: options.carbon_copied, replaced: options.replaced});
                return chat.receiveMessage($message, _.extend(options, {is_sender: is_sender, stanza_id: stanza_ids.stanza_id, contact_stanza_id: stanza_ids.contact_stanza_id}));
            } else {
                xabber.warn('Message from me to me');
                xabber.warn(message);
                return;
            }
        }

        let contact = this.account.contacts.mergeContact(contact_jid),
            chat = this.account.chats.getChat(contact, (options.encrypted || options.not_encrypted) && 'encrypted'),
            stanza_ids = this.receiveStanzaId($message, {from_bare_jid: from_bare_jid, carbon_copied: options.carbon_copied, replaced: options.replaced});

        if ($message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}#system-message"]`).length) {
            if (!contact)
                return;
            let participant_version = $message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}#system-message"]`).attr('version');
            if (participant_version && contact.participants && contact.participants.version < participant_version){
                if ($message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}#system-message"]`).children(`user[xmlns="${Strophe.NS.GROUP_CHAT}"]`).length && chat.contact.get('pinned_message')){
                    $message.children('x[xmlns="' + Strophe.NS.GROUP_CHAT + '#system-message"]').each((idx, x_elem) => {
                        let $user = $(x_elem).children(`user[xmlns="${Strophe.NS.GROUP_CHAT}"]`).first();
                        if ($user.length) {
                            let user_id = $user.attr('id'),
                                user_jid = $user.children('jid').text();
                            if (chat.contact.get('pinned_message').get('from_jid') === user_jid) {
                                let pinned_message = chat.contact.get('pinned_message'),
                                    user_info = {
                                        id: user_id,
                                        jid: user_jid,
                                        nickname: $user.children('nickname').text() || user_jid || user_id,
                                        role: $user.children('role').text(),
                                        avatar: $user.children(`metadata[xmlns="${Strophe.NS.PUBSUB_AVATAR_METADATA}"]`).children('info').attr('id'),
                                        avatar_url: $user.children(`metadata[xmlns="${Strophe.NS.PUBSUB_AVATAR_METADATA}"]`).children('info').attr('url'),
                                        badge: $user.children('badge').text()
                                    };
                                pinned_message.set('user_info', user_info);
                                chat.contact.set('pinned_message', pinned_message);
                            }
                        }
                    });
                }
            }
        }
        if (chat.contact.get('group_chat') && options.carbon_direction === 'sent' && !$message.children(`[xmlns="${Strophe.NS.CHAT_MARKERS}"]`).length)
            return;


        if (chat && chat.get('encrypted') && options.encrypted && !options.synced_msg && !options.is_archived){
            if ($message.find('[xmlns="' + Strophe.NS.EPHEMERAL + '"]').length){
                chat.set('chat_ephemeral_timer', $message.find('[xmlns="' + Strophe.NS.EPHEMERAL + '"]').attr('timer'));
            } else {
                chat.set('chat_ephemeral_timer', null);
            }
        }

        return chat.receiveMessage($message, _.extend(options, {is_sender: is_sender, stanza_id: stanza_ids.stanza_id, contact_stanza_id: stanza_ids.contact_stanza_id}));
    },

    receiveErrorMessage: function (message) {
        let msgid = message.getAttribute('id'),
            origin_id = $(message).children('origin-id').attr('id');
        if (msgid) {
            let code = $(message).find('error').attr('code'),
                msg = this.account.messages.get(origin_id || msgid);
            if (msg) {
                if (code === '405') {
                    msg.set('state', constants.MSG_BLOCKED);
                }
                if (code === '406') {
                    msg.set('state', constants.MSG_ERROR);
                }
            }
        }
    },

    onPresence: function (contact, type) {
        let chat = this.getChat(contact);
        chat.onPresence(type);
    },

    onRosterPush: function (contact, type) {
        let chat = this.getChat(contact);
        chat.onRosterPush(type);
    }
});

xabber.AddGroupChatView = xabber.SearchView.extend({
    className: 'modal main-modal add-group-chat-modal add-contact-modal',
    template: templates.group_chats.add_group_chat,
    avatar_size: constants.AVATAR_SIZES.ACCOUNT_ITEM,
    ps_selector: '.rich-textarea',
    ps_settings: {theme: 'item-list'},

    events: {
        "click .dropdown-content#select-account-for-creating-groupchat": "selectAccount",
        "click .btn-add": "addGroupChat",
        "keyup .input-group-chat-name input": "updateGroupJid",
        "keyup .rich-textarea": "showPlaceholder",
        "keyup .input-group-chat-jid input": "fixJid",
        "click .btn-cancel": "close",
        "click .property-variant": "changePropertyValue"
    },

    render: function (options) {
        if (!xabber.accounts.connected.length) {
            utils.dialogs.error(xabber.getString("dialog_add_contact__error__text_no_accounts"));
            return;
        }
        options || (options = {});
        this.setDefaultSettings(options);
        let accounts = options.account ? [options.account] : xabber.accounts.connected;
        this.$('.single-acc').showIf(accounts.length === 1);
        this.$('.multiple-acc').hideIf(accounts.length === 1);
        this.$('.dropdown-content#select-account-for-creating-groupchat').empty();
        _.each(accounts, (account) => {
            this.$('.dropdown-content#select-account-for-creating-groupchat').append(
                    this.renderAccountItem(account));
        });
        this.$('.account-dropdown-wrap').hideIf(accounts.length < 2)
        this.bindAccount(accounts[0]);
        this.$('.btn-cancel').text(this.is_login ? xabber.getString("skip") : xabber.getString("cancel"));
        this.$el.openModal({
            ready: () => {
                let dropdown_settings = {
                    inDuration: 100,
                    outDuration: 100,
                    constrainWidth: false,
                    hover: false,
                    alignment: 'left'
                };
                Materialize.updateTextFields();
                this.$('.account-dropdown-wrap').dropdown(dropdown_settings);
                this.$('.property-field .dropdown-button').dropdown(dropdown_settings);
                this.$('.property-field .select-xmpp-server .caret').dropdown(dropdown_settings);
                this.$('.property-field .select-xmpp-server .xmpp-server-item-wrap').dropdown(dropdown_settings);
                this.$('input[name="chat_name"]').focus();
            },
            complete: this.close.bind(this)
        });

    },

    setDefaultSettings: function (options) {
        this.$('.incognito-field .public-item-wrap').showIf(options.public);
        this.$('.incognito-field .incognito-item-wrap').showIf(options.incognito);
        if (options.public)
            this.$('.modal-header span').text(xabber.getString("create_group"));
        if (options.incognito)
            this.$('.modal-header span').text(xabber.getString("create_incognito_group"));
        this.$('input[name=chat_jid]').removeClass('fixed-jid').val("");
        this.$('#new_chat_domain').val("");
        this.$('input[name=chat_name]').val("");
        this.$('.description-field .rich-textarea').text("");
        this.$('.btn-add').addClass('non-active');
        this.showPlaceholder();
        this.$('span.errors').text('').addClass('hidden');
        this.$('input').removeClass('invalid');
        let $global_wrap = this.$('.global-dropdown-wrap'),
            default_global_value = $global_wrap.find('.dropdown-content .default-value');
        $global_wrap.find('.global-item-wrap .property-value').attr('data-value', default_global_value.attr('data-value')).text(default_global_value.text());
        let $membership_wrap = this.$('.membership-dropdown-wrap'),
            default_membership_value = $membership_wrap.find('.dropdown-content .default-value');
        $membership_wrap.find('.membership-item-wrap .property-value').attr('data-value', default_membership_value.attr('data-value')).text(default_membership_value.text());
    },

    bindAccount: function (account) {
        this.account = account;
        this.$('.input-group-chat-domain').addClass('hidden');
        this.$('.account-dropdown-wrap .dropdown-button .account-item-wrap')
                .replaceWith(this.renderAccountItem(account));
        let all_servers = this.account.get('groupchat_servers_list');
        all_servers = all_servers.sort((x,y) => { return x == this.account.domain ? -1 : y == this.account.domain ? 1 : 0; })
        if (all_servers.length){
            this.$('.xmpp-server-dropdown-wrap .field-jid').text(all_servers[0]);
            this.$('.select-xmpp-server .caret').removeClass('hidden')
            this.$('.xmpp-server-item-wrap .property-value').removeClass('hidden')
        }
        else
            this.setCustomDomain(this.$('.property-field.xmpp-server-dropdown-wrap .property-value'));
        this.$('.modal-content .jid-field .set-default-domain').remove();
        for (let i = 0; i < all_servers.length; i++) {
            $('<div/>', {class: 'field-jid property-variant set-default-domain'}).text(all_servers[i]).insertBefore(this.$('.modal-content .jid-field .set-custom-domain'));
        }
    },

    renderAccountItem: function (account) {
        let $item = $(templates.add_chat_account_item({jid: account.get('jid'), name: account.get('name')}));
        $item.find('.circle-avatar').setAvatar(account.cached_image, this.avatar_size);
        return $item;
    },

    selectAccount: function (ev) {
        let $item = $(ev.target).closest('.account-item-wrap'),
            account = xabber.accounts.get($item.data('jid'));
        this.bindAccount(account);
    },

    setCustomDomain: function ($property_value) {
        this.$('#new_chat_domain').val("");
        this.$('.select-xmpp-server .caret').addClass('hidden');
        $property_value.addClass('hidden').text("");
        this.$('.input-group-chat-domain').removeClass('hidden');
    },

    changePropertyValue: function (ev) {
        let $property_item = $(ev.target),
            $property_value = $property_item.closest('.property-field').find('.property-value');
        if ($property_item.hasClass('set-custom-domain')) {
            this.setCustomDomain($property_value);
            return;
        }
        else if ($property_item.hasClass('set-default-domain')) {
            this.$('.input-group-chat-domain').addClass('hidden');
            this.$('#new_chat_domain').val("");
        }
        $property_value.text($property_item.text());
        $property_value.removeClass('hidden').attr('data-value', $property_item.attr('data-value'));
        this.$('.select-xmpp-server .caret').removeClass('hidden')
    },

    close: function () {
        this.$el.closeModal({ complete: () => {
                this.$el.detach();
                this.data.set('visible', false);
            }
        });
    },

    updateGroupJid: function () {
        let elem = this.$('input[name=chat_jid]');
        if (!elem.hasClass('fixed-jid')) {
            let text = slug(this.$('.input-group-chat-name input').get(0).value, {lower: true});
            this.$("label[for=new_chat_jid]").addClass('active');
            this.$('.input-field #new_chat_jid').get(0).value = text;
        }
        this.$('.btn-add').switchClass('non-active', !this.$('.input-group-chat-name input').get(0).value);
    },

    showPlaceholder: function () {
        let textarea_is_empty = (this.$('.rich-textarea ').text() !== "") ? false : true;
        this.$('.rich-textarea-wrap .placeholder').hideIf(!textarea_is_empty);
    },

    fixJid: function () {
        let elem = this.$('input[name=chat_jid]');
        !elem.hasClass('fixed-jid') && elem.addClass('fixed-jid');
        (elem.get(0).value == "") && elem.removeClass('fixed-jid');
    },

    createGroupChat: function () {
        let name = this.$('input[name=chat_name]').val(),
            chat_jid = this.$('input[name=chat_jid]').val() ? this.$('input[name=chat_jid]').val() : undefined,
            privacy = this.$('.incognito-field .property-wrap:not(.hidden) .property-value').attr('data-value'),
            domain = this.$('#new_chat_domain').val() || this.$('.xmpp-server-dropdown-wrap .property-value').text(),
            searchable = this.$('input[name="group_index"]:checked').attr('data-value'),
            description = this.$('.description-field .rich-textarea').text() || "",
            model = this.$('input[name="group_membership"]:checked').attr('data-value'),
            iq = $iq({type: 'set', to: domain}).c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#create'})
                .c('name').t(name).up()
                .c('privacy').t(privacy).up()
                .c('index').t(searchable).up()
                .c('description').t(description).up()
                .c('membership').t(model).up();
            if (chat_jid)
                iq.c('localpart').t(chat_jid);
        this.account.sendIQFast(iq, (iq) => {
            let group_jid = $(iq).find('query localpart').text().trim() + '@' + $(iq).attr('from').trim(),
                contact = this.account.contacts.mergeContact(group_jid);
            contact.set('group_chat', true);
            contact.set('subscription_preapproved', true);
            contact.pres('subscribed');
            contact.set('known', true);
            contact.set('removed', false);
            setTimeout(() => {
                contact.pres('subscribe');
            }, 500);
            this.close();
            xabber.chats_view.updateScreenAllChats();
            contact.trigger("open_chat", contact);
            if (!(this.account.connection && this.account.connection.do_synchronization)) {
                let iq_set_blocking = $iq({type: 'set'}).c('block', {xmlns: Strophe.NS.BLOCKING})
                    .c('item', {jid: group_jid + '/' + moment.now()});
                this.account.sendIQFast(iq_set_blocking);
            }

        }, () => {
            this.$('span.errors').removeClass('hidden').text(xabber.getString("groupchat_jid_already_exists"));
            this.$('input[name="chat_jid"]').addClass('invalid');
        });
    },

    addGroupChat: function (ev) {
        if ($(ev.target).closest('.button-wrap').hasClass('non-active')) {
            $(ev.target).blur();
            return;
        }
        let xmpp_server = this.$('#new_chat_domain').val() || this.$('.xmpp-server-dropdown-wrap .property-value').text(),
            input_value = this.$('input[name=chat_jid]').val();
        if (this.$('input[name=chat_name]').val() == "") {
            this.$('span.errors').text(xabber.getString("group_is_empty")).removeClass('hidden');
            this.$('input[name="chat_name"]').addClass('invalid');
        } else {
            if ((input_value == "")||((input_value.search(/[А-яЁё]/) == -1)&&(input_value.search(/\s/) == -1)&&(input_value != ""))) {
                this.$('span.errors').text('').addClass('hidden');
                this.$('input').removeClass('invalid');
                let iq = $iq({type: 'get', to: xmpp_server}).c('query', {xmlns: Strophe.NS.DISCO_INFO}),
                    group_chats_support;
                this.account.sendIQFast(iq, (iq) => {
                    $(iq).children('query').children('feature').each((elem, item) => {
                        if ($(item).attr('var') == Strophe.NS.GROUP_CHAT)
                            group_chats_support = true;
                    });
                    if (group_chats_support)
                        this.createGroupChat();
                    else {
                        this.$('span.errors').removeClass('hidden').text(`${xabber.getString("groupchat_add__alert_server_does_not_support")}`);
                        this.$('input[name="chat_domain"]').addClass('invalid');
                    }
                }, (response) => {
                    this.$('span.errors').removeClass('hidden').text(`${xabber.getString("groupchat_add__alert_invalid_domain")}`); // !!!!!!!!!!!!!!!!!! :::::
                    this.$('input[name="chat_domain"]').addClass('invalid');
                });
            }
            else {
                this.$('span.errors').removeClass('hidden').text(`${xabber.getString("groupchat_add__alert_localpart_invalid")}`);
                this.$('input[name="chat_jid"]').addClass('invalid');
            }
        }
    }
});

xabber.ChatsView = xabber.SearchPanelView.extend({
    className: 'recent-chats-container container',
    ps_selector: '.chat-list-wrap',
    ps_settings: {theme: 'item-list'},
    main_container: '.chat-list',
    template: templates.chats_panel,

    _initialize: function () {
        this.active_chat = null;
        this.model.on("add", this.onChatAdded, this);
        this.model.on("destroy", this.onChatRemoved, this);
        this.model.on("change:active", this.onChangedActiveStatus, this);
        this.model.on("add_opened_chat", this.onChangedActiveStatus, this);
        this.model.on("change:unread", this.onChangedReadStatus, this);
        this.model.on("change:const_unread", this.onChangedReadStatus, this);
        this.model.on("change:timestamp", this.updateChatPosition, this);
        xabber.accounts.on("list_changed", this.updateLeftIndicator, this);
        let wheel_ev = this.defineMouseWheelEvent();
        this.$el.on(wheel_ev, this.onMouseWheel.bind(this));
        this.ps_container.on("ps-scroll-y", this.onScrollY.bind(this));
        this.$('.read-all-button').click(this.readAllMessages.bind(this));
        xabber.on("update_screen", this.onUpdatedScreen, this);
        xabber.on("update_layout", this.onWindowResized, this);
        this.$('input').on('input', this.updateSearch.bind(this));
    },

    render: function (options) {
        if (options.right === undefined)
            this.active_chat = null;
        this.$('.chat-list-wrap').switchClass('with-padding', xabber.toolbar_view.$('.toolbar-item:not(.toolbar-logo).unread').length);
        if (options.right !== 'chat' && !options.no_unread && options.right !== 'searched_messages' && options.right !== 'message_context' && options.right !== 'participant_messages' || options.clear_search) {
            this.clearSearch();
            if (xabber.toolbar_view.$('.active').hasClass('all-chats') && !xabber.toolbar_view.data.get('account_filtering')) {
                this.showAllChats();
            }
        }
    },

    readAllMessages: function () {
        let chats = this.model,
            active_toolbar = xabber.toolbar_view.$('.active');
        if (active_toolbar.hasClass('chats')) {
            let private_chats = chats.filter(chat => chat.get('saved') || !chat.contact.get('group_chat') && chat.get('timestamp') && !chat.get('archived') && chat.last_message && !chat.last_message.get('invite') && (chat.get('unread') || chat.get('const_unread')));
            private_chats.forEach((chat) => {
                if (!chat.item_view.content)
                    chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                chat.item_view.content.readMessages();
            });
        }
        if (active_toolbar.hasClass('all-chats')) {
            let all_chats = chats.filter(chat => chat.get('saved') || chat.get('timestamp') && !chat.get('archived') && chat.last_message && !chat.last_message.get('invite') && (chat.get('unread') || chat.get('const_unread')));
            all_chats.forEach((chat) => {
                if (!chat.item_view.content)
                    chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                chat.item_view.content.readMessages();
            });
        }
        if (active_toolbar.hasClass('group-chats')) {
            let group_chats = chats.filter(chat => chat.get('saved') || chat.contact.get('group_chat') && chat.get('timestamp') && !chat.get('archived') && chat.last_message && !chat.last_message.get('invite') && (chat.get('unread') || chat.get('const_unread')));
            group_chats.forEach((chat) => {
                if (!chat.item_view.content)
                    chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                chat.item_view.content.readMessages();
            });
        }
        xabber.toolbar_view.recountAllMessageCounter();
    },

    onUpdatedScreen: function (name) {
        this.$('.read-all-button').switchClass('hidden', !xabber.toolbar_view.$('.toolbar-item:not(.account-item):not(.toolbar-logo).active.unread').length);
    },

    // onWindowResized: function (options) {
    //     options.size_changed && this.onScroll();
    // },

    defineMouseWheelEvent: function () {
        if (!_.isUndefined(window.onwheel)) {
            return "wheel";
        } else if (!_.isUndefined(window.onmousewheel)) {
            return "mousewheel";
        } else {
            return "MozMousePixelScroll";
        }
    },

    onMouseWheel: function (ev) {
        // if (ev.originalEvent.deltaY > 0)
        //     this.onScroll();
    },

    hideChatsFeedback: function () {
        clearTimeout(this._load_chats_timeout);
        this.$('.load-chats-feedback').addClass('hidden');
        this.updateScrollBar();
        this._load_chats_timeout = null;
    },

    // onScroll: function () {
    //     if (this.getScrollBottom() < 12 && !this._load_chats_timeout && this.isVisible()) {
    //         this._load_chats_timeout = setTimeout(() => {
    //             this.hideChatsFeedback();
    //         }, 5000);
    //         let accounts = xabber.accounts.connected.filter(account => !account.roster.conversations_loaded && account.connection && account.connection.do_synchronization);
    //         if (accounts.length) {
    //             this.$('.load-chats-feedback').text(xabber.getString("placeholder_loading")).removeClass('hidden');
    //             this.updateScrollBar();
    //         }
    //         accounts.forEach((account) => {
    //             let options = {max: xabber.settings.mam_messages_limit};
    //             account.roster.last_chat_msg_id && (options.after = account.roster.last_chat_msg_id);
    //             account.roster.syncFromServer(options);
    //         });
    //     }
    // },

    updateLeftIndicator: function (accounts) {
        this.$el.attr('data-indicator', accounts.connected.length > 1);
    },

    onChatAdded: function (chat) {
        this.addChild(chat.id, chat.item_view);
        this.updateChatPosition(chat);
    },

    onChatRemoved: function (chat, options) {
        if (this.active_chat === this.child(chat.id)) {
            this.active_chat = null;
            xabber.body.showChatPlaceholder();
        }
        this.removeChild(chat.id, options);
        this.updateScrollBar();
    },

    onChangedActiveStatus: function (chat) {
        if (chat.get('active')) {
            let previous_chat = this.active_chat;
            this.active_chat = this.child(chat.id);
            previous_chat && previous_chat.model.set('active', false);
        }
    },

    onChangedReadStatus: function (item) {
        let view = this.child(item.id),
            active_toolbar = xabber.toolbar_view.$('.active');
        if (!view)
            return;
        if (!active_toolbar.hasClass('unread') || (active_toolbar.hasClass('unread') && (item.get('unread') || item.get('const_unread'))))
            return;
        view.detach();
        if (!this.$('.chat-item').length && active_toolbar.hasClass('unread')) {
            active_toolbar.click();
        }
    },

    replaceChatItem: function (item, chats, pinned_chats) {
        let view = this.child(item.id);
        if (view && item.get('pinned') && item.get('pinned') !== '0' && pinned_chats ){
            pinned_chats = pinned_chats.sort((a, b) => (a.get('pinned') > b.get('pinned')) ? 1 : -1)
            let index = pinned_chats.indexOf(item);
            if (index === 0) {
                this.$('.pinned-chat-list').prepend(view.$el);
            } else {
                let $chat_item = this.$('.pinned-chat-list .chat-item').eq(index - 1);
                while (!$chat_item.length && index > 0) {
                    index--;
                    $chat_item = this.$('.pinned-chat-list .chat-item').eq(index - 1);
                }
                $chat_item.after(view.$el);
            }
        }
        else if (view && (item.get('timestamp') || item.get('saved'))) {
            view.$el.detach();
            let index = chats.indexOf(item);
            if (index === 0) {
                this.$('.chat-list').prepend(view.$el);
            } else {
                this.$('.chat-list .chat-item').eq(index - 1).after(view.$el);
            }
        }
    },

    updateChatPosition: function (item) {
        let view = this.child(item.id),
            active_toolbar = xabber.toolbar_view.$('.active');
        if (!view)
            return;
        if (active_toolbar.hasClass('unread') && !(item.get('unread') || item.get('const_unread')))
            return;
        if (active_toolbar.hasClass('account-item') && view.account.get('jid') !== active_toolbar.attr('data-jid')){
            return;
        }
        active_toolbar.hasClass('group-chats') && (view.model.get('saved') || view.contact.get('group_chat')) && this.replaceChatItem(item, this.model.filter(chat => (chat.get('saved') || chat.contact.get('group_chat') && !chat.get('archived')) && (chat.get('pinned') === '0' || !chat.get('pinned'))), this.model.filter(chat => (chat.get('saved') || chat.contact.get('group_chat') && !chat.get('archived')) && chat.get('pinned') !== '0' && chat.get('pinned')));
        active_toolbar.hasClass('chats') && (view.model.get('saved') || !view.contact.get('group_chat')) && this.replaceChatItem(item, this.model.filter(chat => (chat.get('saved') || !chat.contact.get('group_chat') && !chat.get('archived')) && (chat.get('pinned') === '0' || !chat.get('pinned'))), this.model.filter(chat => (chat.get('saved') || !chat.contact.get('group_chat') && !chat.get('archived')) && chat.get('pinned') !== '0' && chat.get('pinned')));
        (active_toolbar.hasClass('all-chats') || active_toolbar.hasClass('settings-modal') || (xabber.accounts.enabled.length === 1 && active_toolbar.hasClass('saved-chats'))) && (view.model.get('saved') || !view.model.get('archived')) && this.replaceChatItem(item, this.model.filter(chat => (chat.get('saved') || !chat.get('archived')) && (chat.get('pinned') === '0' || !chat.get('pinned'))), this.model.filter(chat => (chat.get('saved') || !chat.get('archived')) && chat.get('pinned') !== '0' && chat.get('pinned')));
        active_toolbar.hasClass('archive-chats') && (view.model.get('saved') || view.model.get('archived')) && this.replaceChatItem(item, this.model.filter(chat => chat.get('saved') || chat.get('archived')));
        active_toolbar.hasClass('saved-chats') && (xabber.accounts.enabled.length !== 1) && (view.model.get('saved') && this.replaceChatItem(item, this.model.filter(chat => chat.get('saved'))));
        active_toolbar.hasClass('mentions') && (view.model.get('saved') && this.replaceChatItem(item, this.model.filter(chat => (chat.get('jid') === chat.account.domain))));
    },

    onEnterPressed: function (selection) {
        let view;
        if (selection.closest('.searched-lists-wrap').length) {
            this.clearSearch();
            this.$('.list-item.active').removeClass('active');
            if (selection.hasClass('chat-item')) {
                view = this.child(selection.data('id'));
                view && view.open();
                selection.addClass('active');
            }
            if (selection.hasClass('roster-contact')) {
                view = xabber.accounts.get(selection.data('account')).chats.getChat(xabber.accounts.get(selection.data('account')).contacts.get(selection.data('jid')));
                view && (view = view.item_view);
                view && xabber.chats_view.openChat(view, {clear_search: false, screen: xabber.body.screen.get('name')});
                selection.addClass('active');
            }
            if (selection.hasClass('message-item')) {
                selection.click();
            }
        }
        else {
            view = this.child(selection.data('id'));
            view && view.open();
        }
    },

    openChat: function (view, options) {
        if (!view.content)
            view.content = new xabber.ChatContentView({chat_item: view});
        options = options || {};
        this.$('.list-item.active').removeClass('active');
        view.updateActiveStatus();
        let scrolled_top = xabber.chats_view.getScrollTop();
        options.clear_search && this.clearSearch();
        if (view.contact && !view.contact.get('in_roster') && (view.model.get('is_accepted') == false || (view.model.get('is_accepted') == true && view.contact.invitation))) {
            if (view.model.get('is_accepted') == false){
                view.model.set('display', true);
                view.model.set('active', true);
                xabber.body.setScreen('all-chats', {right: 'group_invitation', contact: view.contact });
            } else if (view.model.get('is_accepted') == true && view.contact.invitation){
                view.contact.invitation.join();
            }
        }
        else {
            if (xabber.toolbar_view.$('.active').hasClass('contacts'))
                this.updateScreenAllChats();
            if (!view.model.get('history_loaded')) {
                if (
                    (view.model.get('const_unread') || view.model.get('unread'))
                    && view.model.get('last_read_msg') &&
                    (!view.content._prev_scrolltop || (view.content._prev_scrolltop && view.content._is_scrolled_bottom) || (view.model.get('show_new_unread') === true))
                    && !view.model.get('loading_unread_history') && !options.force_bottom && xabber.body.screen.get('chat_item') !== view
                ){
                    view.model.set('show_new_unread', false);
                    view.model._wait_load_unread_history = new $.Deferred();
                    setTimeout(() => {
                        view.model._wait_load_unread_history.resolve();
                    }, 10000)
                    view.content._no_scrolling_event = true;
                    view.content.loadUnreadHistory();
                } else if (view.model.messages.length < 20)
                    view.content.loadPreviousHistory();
            }
            if (!options.right_force_close && (
                xabber.body.screen.get('right_contact') && (xabber.body.screen.get('right') === 'chat' || xabber.body.screen.get('right') === 'message_context' )
            )) {
                if (view.model.get('saved'))
                    xabber.body.setScreen((options.screen || 'all-chats'), {right_contact: ''});
                else if(xabber.right_contact_panel_saveable)
                    view.contact.showDetailsRight('all-chats', {right_saved: true, encrypted: view.model.get('encrypted')});
                else
                    view.contact.showDetailsRight('all-chats', {right_saved: false});
            }
            if (!view.model.get('loading_unread_history')){
                let current_scrolling = view.content.getScrollTop() || view.content._scrolltop,
                    scrolled_to_bottom = view.content.isScrolledToBottom();
                xabber.body.setScreen((options.screen || 'all-chats'), {
                    right: 'chat',
                    clear_search: options.clear_search,
                    chat_item: view,
                    blocked: view.model.get('blocked')
                },{right_contact_save: options.right_contact_save, right_force_close: options.right_force_close} );
                !scrolled_to_bottom && view.content.scrollTo(current_scrolling);
            } else {
                xabber.body.setScreen((options.screen || 'all-chats'), {
                    right: 'chat',
                    clear_search: options.clear_search,
                    chat_item: view,
                    show_placeholder: true,
                    blocked: view.model.get('blocked')
                },{right_contact_save: options.right_contact_save, right_force_close: options.right_force_close} );
                view.model.set('active', true);
                view.model._wait_load_unread_history.done(() => {
                    if (xabber.body.screen.get('chat_item') === view) {
                        view.model.set('loading_unread_history', false)
                        xabber.body.setScreen((options.screen || 'all-chats'), {
                            right: 'chat',
                            clear_search: options.clear_search,
                            chat_item: view,
                            blocked: view.model.get('blocked')
                        },{right_contact_save: options.right_contact_save, right_force_close: options.right_force_close} );
                        view.content.scrollToUnread();
                        view.content._long_reading_timeout = true;
                        view.content._no_scrolling_event = false;
                        view.content.onScroll();
                        if (options.scroll_to_chat) {
                            xabber.chats_view.scrollToChild(view.$el);
                        } else {
                            xabber.chats_view.scrollTo(scrolled_top);
                        }
                    }
                });
            }
            if (view.contact && (!view.contact.get('vcard_updated') || (view.contact.get('group_chat') && !view.contact.get('group_info')) || (view.contact.get('vcard_updated') && !moment(view.contact.get('vcard_updated')).startOf('hour').isSame(moment().startOf('hour'))))) {
                view.contact.getVCard();
            }
        }
        if (options.scroll_to_chat) {
            xabber.chats_view.scrollToChild(view.$el);
        } else {
            xabber.chats_view.scrollTo(scrolled_top);
        }
    },

    showGroupChats: function () {
        this.$('.chat-item').detach();
        let chats = this.model,
            is_unread = xabber.toolbar_view.$('.active.unread').length,
            group_chats = [],
            group_chats_pinned = [];
        if (is_unread) {
            group_chats = chats.filter(chat => chat.contact && chat.contact.get('group_chat') && chat.get('timestamp') && !chat.get('archived') && chat.last_message && !chat.last_message.get('invite') && (chat.get('unread') || chat.get('const_unread')) && (chat.get('pinned') === '0' || !chat.get('pinned')));
            group_chats_pinned = chats.filter(chat => chat.contact && chat.contact.get('group_chat') && chat.get('timestamp') && !chat.get('archived') && chat.last_message && !chat.last_message.get('invite') && (chat.get('unread') || chat.get('const_unread')) && chat.get('pinned') !== '0' && chat.get('pinned'));
        }
        if (!group_chats.length && !group_chats_pinned.length) {
            group_chats = chats.filter(chat => !chat.get('saved') && chat.contact.get('group_chat') && chat.get('timestamp') && !chat.get('archived') && (chat.get('pinned') === '0' || !chat.get('pinned')));
            group_chats_pinned = chats.filter(chat => !chat.get('saved') && chat.contact.get('group_chat') && chat.get('timestamp') && !chat.get('archived') && chat.get('pinned') !== '0' && chat.get('pinned'));
            xabber.toolbar_view.$('.toolbar-item:not(.toolbar-logo).unread').removeClass('unread');
            this.onUpdatedScreen();
        }
        group_chats.forEach((chat) => {
            this.$('.chat-list').append(chat.item_view.$el);
        });
        if (group_chats_pinned) {
            group_chats_pinned = group_chats_pinned.sort((a, b) => (a.get('pinned') > b.get('pinned')) ? 1 : -1)
            group_chats_pinned.forEach((chat) => {
                let index = group_chats_pinned.indexOf(chat);
                if (index === 0) {
                    this.$('.pinned-chat-list').prepend(chat.item_view.$el);
                } else {
                    this.$('.pinned-chat-list .chat-item').eq(index - 1).after(chat.item_view.$el);
                }
            });
        }
    },

    showChats: function () {
        this.$('.chat-item').detach();
        let chats = this.model,
            is_unread = xabber.toolbar_view.$('.active.unread').length,
            private_chats = [],
            private_chats_pinned = [];
        if (is_unread) {
            private_chats = chats.filter(chat => chat.contact && !chat.contact.get('group_chat') && chat.get('timestamp') && !chat.get('archived') && chat.last_message && !chat.last_message.get('invite') && (chat.get('unread') || chat.get('const_unread')) && (chat.get('pinned') === '0' || !chat.get('pinned')));
            private_chats_pinned = chats.filter(chat => chat.contact && !chat.contact.get('group_chat') && chat.get('timestamp') && !chat.get('archived') && chat.last_message && !chat.last_message.get('invite') && (chat.get('unread') || chat.get('const_unread')) && chat.get('pinned') !== '0' && chat.get('pinned'));
        }
        if (!private_chats.length && !private_chats_pinned.length) {
            private_chats = chats.filter(chat => !chat.get('saved') && !chat.contact.get('group_chat') && chat.get('timestamp') && !chat.get('archived') && (chat.get('pinned') === '0' || !chat.get('pinned')));
            private_chats_pinned = chats.filter(chat => !chat.get('saved') && !chat.contact.get('group_chat') && chat.get('timestamp') && !chat.get('archived') && chat.get('pinned') !== '0' && chat.get('pinned'));
            xabber.toolbar_view.$('.toolbar-item:not(.toolbar-logo).unread').removeClass('unread');
            this.onUpdatedScreen();
        }
        private_chats.forEach((chat) => {
            this.$('.chat-list').append(chat.item_view.$el);
        });
        if (private_chats_pinned) {
            private_chats_pinned = private_chats_pinned.sort((a, b) => (a.get('pinned') > b.get('pinned')) ? 1 : -1)
            private_chats_pinned.forEach((chat) => {
                let index = private_chats_pinned.indexOf(chat);
                if (index === 0) {
                    this.$('.pinned-chat-list').prepend(chat.item_view.$el);
                } else {
                    this.$('.pinned-chat-list .chat-item').eq(index - 1).after(chat.item_view.$el);
                }
            });
        }
    },

    showChatsByAccount: function (account) {
        xabber.body.setScreen('all-chats');
        this.$('.chat-item').detach();
        let chats = this.model,
            account_chats = chats.filter(chat => ((chat.account.get('jid') === account.get('jid')) && (chat.get('saved') || chat.get('timestamp') && !chat.get('archived'))) && (chat.get('pinned') === '0' || !chat.get('pinned'))),
            account_chats_pinned = chats.filter(chat => ((chat.account.get('jid') === account.get('jid')) && (chat.get('saved') || chat.get('timestamp') && !chat.get('archived'))) && chat.get('pinned') !== '0' && chat.get('pinned'));
        this.$(`.omemo-item:not([data-id="${account.get('jid')}"])`).addClass('hidden');
        account_chats.forEach((chat) => {
            this.$('.chat-list').append(chat.item_view.$el);
        });
        if (account_chats_pinned) {
            account_chats_pinned = account_chats_pinned.sort((a, b) => (a.get('pinned') > b.get('pinned')) ? 1 : -1)
            account_chats_pinned.forEach((chat) => {
                let index = account_chats_pinned.indexOf(chat);
                if (index === 0) {
                    this.$('.pinned-chat-list').prepend(chat.item_view.$el);
                } else {
                    this.$('.pinned-chat-list .chat-item').eq(index - 1).after(chat.item_view.$el);
                }
            });
        }
    },

    showArchiveChats: function (no_unread) {
        this.$('.chat-item').detach();
        let chats = this.model,
            archive_chats = chats.filter(chat => !chat.get('saved') && chat.get('archived'));
        if (xabber.toolbar_view.data.get('account_filtering') && !no_unread){
            xabber.toolbar_view.data.set('account_filtering', null);
            xabber.toolbar_view.$('.toolbar-item.account-item').removeClass('active');
        }
        if (xabber.toolbar_view.data.get('account_filtering'))
            archive_chats = archive_chats.filter(chat => (chat.account.get('jid') === xabber.toolbar_view.data.get('account_filtering')));
        archive_chats.forEach((chat) => {
            this.$('.chat-list').append(chat.item_view.$el);
        });
    },

    showSavedChats: function (no_unread) {
        this.$('.chat-item').detach();
        let chats = this.model,
            saved_chats = chats.filter(chat => chat.get('saved'));
        if (xabber.toolbar_view.data.get('account_filtering') && !no_unread){
            xabber.toolbar_view.data.set('account_filtering', null);
            xabber.toolbar_view.$('.toolbar-item.account-item').removeClass('active');
        }
        if (xabber.toolbar_view.data.get('account_filtering'))
            saved_chats = saved_chats.filter(chat => (chat.account.get('jid') === xabber.toolbar_view.data.get('account_filtering')));
        saved_chats.forEach((chat) => {
            this.$('.chat-list').append(chat.item_view.$el);
            this.$(`.chat-list .chat-item[data-id="${chat.id}"] .chat-title`).text(chat.get('jid'));
        });
    },

    showNotifications: function (no_unread) {
        this.$('.chat-item').detach();
        let chats = this.model,
            notificatons_chats = chats.filter(chat => (chat.get('jid') === chat.account.domain || chat.contact && chat.contact.get('subscription_request_in') && chat.contact.get('subscription') != 'both' ));
        if (xabber.toolbar_view.data.get('account_filtering') && !no_unread){
            xabber.toolbar_view.data.set('account_filtering', null);
            xabber.toolbar_view.$('.toolbar-item.account-item').removeClass('active');
        }
        if (xabber.toolbar_view.data.get('account_filtering'))
            notificatons_chats = notificatons_chats.filter(chat => (chat.account.get('jid') === xabber.toolbar_view.data.get('account_filtering')));
        notificatons_chats.forEach((chat) => {
            this.$('.chat-list').append(chat.item_view.$el);
        });
    },

    showAllChats: function (no_unread) {
        this.$('.chat-item').detach();
        let chats = this.model,
            is_unread = no_unread || xabber.toolbar_view.data.get('account_filtering') ? false : xabber.toolbar_view.$('.active.unread').length,
            all_chats = [],
            all_chats_pinned = [];
        if (xabber.toolbar_view.data.get('account_filtering') && !no_unread){
            xabber.toolbar_view.data.set('account_filtering', null);
            xabber.toolbar_view.$('.toolbar-item.account-item').removeClass('active');
        }
        if (is_unread) {
            all_chats = chats.filter(chat => chat.contact && chat.get('timestamp') && !chat.get('archived') && chat.last_message && ((chat.get('unread') || chat.get('const_unread')) || (chat.contact.get('invitation') || (chat.contact.get('subscription_request_in') && chat.contact.get('subscription') != 'both'))) && (chat.get('pinned') === '0' || !chat.get('pinned')) );
            all_chats_pinned = chats.filter(chat => chat.contact && chat.get('timestamp') && !chat.get('archived') && chat.last_message && ((chat.get('unread') || chat.get('const_unread')) || (chat.contact.get('invitation') || (chat.contact.get('subscription_request_in') && chat.contact.get('subscription') != 'both'))) && chat.get('pinned') !== '0' && chat.get('pinned'));
        }
        if (!all_chats.length && !all_chats_pinned.length) {
            all_chats = chats.filter(chat => (chat.get('saved') || chat.get('timestamp') && !chat.get('archived')) && (chat.get('pinned') === '0' || !chat.get('pinned')));
            all_chats_pinned = chats.filter(chat => (chat.get('saved') || chat.get('timestamp') && !chat.get('archived')) && chat.get('pinned') !== '0' && chat.get('pinned'));
            xabber.toolbar_view.$('.toolbar-item:not(.toolbar-logo).unread').removeClass('unread');
            this.onUpdatedScreen();
        }
        if (xabber.toolbar_view.data.get('account_filtering')){
            all_chats = all_chats.filter(chat => (chat.account.get('jid') === xabber.toolbar_view.data.get('account_filtering')))
            all_chats_pinned = all_chats_pinned.filter(chat => (chat.account.get('jid') === xabber.toolbar_view.data.get('account_filtering')))
        }
        all_chats.forEach((chat) => {
            this.$('.chat-list').append(chat.item_view.$el);
        });
        if (all_chats_pinned) {
            all_chats_pinned = all_chats_pinned.sort((a, b) => (a.get('pinned') > b.get('pinned')) ? 1 : -1)
            all_chats_pinned.forEach((chat) => {
                let index = all_chats_pinned.indexOf(chat);
                if (index === 0) {
                    this.$('.pinned-chat-list').prepend(chat.item_view.$el);
                } else {
                    this.$('.pinned-chat-list .chat-item').eq(index - 1).after(chat.item_view.$el);
                }
            });
        }
    },

    updateScreenAllChats: function () {
        xabber.toolbar_view.$('.toolbar-item:not(.account-item):not(.toolbar-logo)').removeClass('active')
            .filter('.all-chats:not(.toolbar-logo)').addClass('active');
        this.showAllChats();
    }
});

  xabber.MessageItemView = xabber.BasicView.extend({
      className: 'message-item list-item',
      template: templates.message_item,
      avatar_size: constants.AVATAR_SIZES.CHAT_ITEM,

      events: {
          'click': 'openByClick'
      },

      _initialize: function () {
          this.contact = this.model.contact;
          this.account = this.contact ? this.contact.account : this.model.account;
          this.$el.attr('data-id', this.model.id + '-' + this.cid);
          this.$el.attr('data-contact-jid', this.contact.get('jid'));
          this.updateName();
          this.updateLastMessage();
          this.updateAvatar();
          this.updateColorScheme();
          this.updateGroupChats();
          this.updateIcon();
          this.updateStatus();
          this.account.settings.on("change:color", this.updateColorScheme, this);
          this.contact.on("change:status", this.updateStatus, this);
          this.contact.on("change:name", this.updateName, this);
      },

      updateName: function () {
          this.$('.chat-title').text(this.contact.get('name'));
      },

      updateAvatar: function () {
          let image = this.contact.cached_image;
          this.$('.circle-avatar').setAvatar(image, this.avatar_size);
      },

      updateStatus: function () {
          let status = this.contact.get('status'),
              status_message = this.contact.getStatusMessage();
          this.$('.contact-status').attr('data-status', status);
          this.$('.chat-icon').attr('data-status', status);
          this.model.get('blocked') ? this.$('.contact-status-message').text(xabber.getString("action_contact_blocked")) : this.$('.contact-status-message').text(status_message);
      },

      updateGroupChats: function () {
          let is_group_chat = this.contact.get('group_chat');
          this.$('.status').hideIf(is_group_chat);
          this.updateIcon();
          if (is_group_chat) {
              this.$el.addClass('group-chat');
              this.$('.chat-title').css('color', '#424242');
              this.model.set('group_chat', true);
          }
      },

      updateIcon: function () {
          this.$('.chat-icon').addClass('hidden');
          let ic_name = this.contact.getIcon();
          ic_name && this.$('.chat-icon').removeClass('hidden').switchClass(ic_name, (ic_name == 'group-invite' || ic_name == 'server' || ic_name == 'blocked')).html(env.templates.svg[ic_name]());
      },

      updateColorScheme: function () {
          let color = this.account.settings.get('color');
          this.$el.attr('data-color', color);
      },

      updateLastMessage: function (msg) {
          msg || (msg = this.model);
          if (!msg)
              return;
          let msg_time = msg.get('time'),
              timestamp = msg.get('timestamp'),
              forwarded_message = msg.get('forwarded_message'),
              msg_files = msg.get('files') || [],
              msg_images = msg.get('images') || [],
              msg_locations = msg.get('locations') || [],
              msg_text = (forwarded_message) ? (msg.get('message') || xabber.getQuantityString("forwarded_messages_count", forwarded_message.length).italics()) : msg.getText(),
              msg_user_info = msg.get('user_info') || msg.isSenderMe() && this.contact.my_info && this.contact.my_info.attributes || {}, msg_from = "";
          msg.get('videos') && msg.get('videos').length && (msg_files = msg_files.concat(msg.get('videos')));
          this.model.set({timestamp: timestamp});
          if (this.model.get('group_chat'))
              msg_from = msg_user_info.nickname || msg_user_info.jid || (msg.isSenderMe() ? this.account.get('name') : msg.get('from_jid')) || "";
          if (msg_files.length || msg_images.length || msg_locations.length) {
              let $colored_span = $('<span class="text-color-500"/>');
              if (msg_files.length && msg_images.length)
                  msg_text = $colored_span.text(xabber.getString("recent_chat__last_message__attachments", [msg_files.length + msg_images.length]));
              else {
                  if (msg_files.length == 1 && (msg_files[0].is_audio || msg_files[0].voice))
                      msg_text = $colored_span.text(`${xabber.getString("voice_message")}, ` + utils.pretty_duration(msg_files[0].duration));
                  else if (msg_files.length > 0) {
                      let total_size = 0;
                      msg_files.forEach((f) => {total_size+=Number(f.size)});
                      msg_text = $colored_span.text(xabber.getQuantityString("recent_chat__last_message__files", msg_files.length) + (total_size > 0 ? `, ${utils.pretty_size(total_size)}` : ""));
                  }
                  if (msg_images.length > 0) {
                      let total_size = 0;
                      msg_images.forEach((f) => {total_size+=Number(f.size)});
                      msg_text = $colored_span.text(xabber.getQuantityString("recent_chat__last_message__images", msg_images.length) + (total_size > 0 ? `, ${utils.pretty_size(total_size)}` : ""));
                  }
                  if (msg_locations.length > 0) {
                      msg_text = $colored_span.text(xabber.getQuantityString("recent_chat__last_message__locations", msg_locations.length));
                  }
              }
              this.$('.last-msg').html("").append(msg_from).append(msg_text);
          }
          else {
              this.$('.last-msg').text("").append(msg_text);
              if (msg_from)
                  this.$('.last-msg').prepend($('<span class=text-color-700>' + msg_from + ': ' + '</span>'));
          }
          this.$el.emojify('.last-msg', {emoji_size: 16}).hyperlinkify({decode_uri: true});
          this.$('.last-msg-date').text(utils.pretty_short_datetime_recent_chat(msg_time))
              .attr('title', pretty_datetime(msg_time));
          this.$('.msg-delivering-state').showIf(msg.isSenderMe() && (msg.get('state') !== constants.MSG_ARCHIVED))
              .attr('data-state', msg.getState());
      },

      openByClick: function () {
          let chat = this.account.chats.getChat(this.contact);
          this.$el.closest('.left-panel-list-wrap').find('.list-item').removeClass('active');
          this.$el.addClass('active');
          xabber.chats_view.openChat(chat.item_view, {right_contact_save: true, clear_search: false});
          xabber.body.setScreen(xabber.body.screen.get('name'), {right: 'message_context', model: chat });
          if (xabber.right_contact_panel_saveable && xabber.body.screen.get('right_contact') && xabber.body.screen.get('right') === 'message_context') {
              if (xabber.right_contact_panel_saveable)
                  chat.contact.showDetailsRight('all-chats', {right_saved: true});
              else
                  chat.contact.showDetailsRight('all-chats', {right_saved: false});
          }
          this.model.get('unique_id') && chat.getMessageContext(this.model.get('unique_id'), {message: true});
      }
  });


  xabber.ForwardPanelView = xabber.SearchView.extend({
    className: 'modal dialog-modal forward-panel-modal',
    template: templates.forward_panel,
    ps_selector: '.chat-list-wrap',
    ps_settings: {theme: 'item-list'},
      events: {
          "keyup .search-input": "keyUpOnSearch",
          "focusout .search-input": "clearSearchSelection",
          "click .close-search-icon": "clearSearch",
          "click .list-item": "onClickItem"
      },

    open: function (messages, account) {
        this.messages = messages;
        this.account = account;
        this.$('.chat-list-wrap .pinned-chat-list').html("");
        this.$('.chat-list-wrap .chat-list').html("");
        this.$('.chat-list-wrap .contact-list').html("");
        this.saved_chat = false;
        let chats = xabber.chats_view.model,
            all_chats = [],
            all_chats_pinned = [];
        if (!all_chats.length && !all_chats_pinned.length) {
            all_chats = chats.filter(chat => (chat.get('saved') || chat.get('timestamp') && !chat.get('archived')) && (chat.get('pinned') === '0' || !chat.get('pinned')));
            all_chats_pinned = chats.filter(chat => (chat.get('saved') || chat.get('timestamp') && !chat.get('archived')) && chat.get('pinned') !== '0' && chat.get('pinned'));
        }
        if (all_chats_pinned) {
            all_chats_pinned = all_chats_pinned.sort((a, b) => (a.get('pinned') > b.get('pinned')) ? 1 : -1)
            all_chats_pinned.forEach((chat) => {
                if (chat.account.get('jid') === this.account.get('jid')) {
                    if (chat.id == `${this.account.get('jid')}:saved`) {
                        let $cloned_item = chat.item_view.$el.clone().removeClass('hidden');
                        $cloned_item.find('.last-msg').text(xabber.getString("saved_messages__hint_forward_here"));
                        this.saved_chat = true;
                        this.$('.chat-list-wrap .pinned-chat-list').prepend($cloned_item);
                    } else
                        this.$('.chat-list-wrap .pinned-chat-list').append(chat.item_view.$el.clone().removeClass('hidden'));
                }
            });
        }
        all_chats.forEach((chat) => {
            if (chat.account.get('jid') === this.account.get('jid')) {
                if (chat.id == `${this.account.get('jid')}:saved`) {
                    let $cloned_item = chat.item_view.$el.clone().removeClass('hidden');
                    $cloned_item.find('.last-msg').text(xabber.getString("saved_messages__hint_forward_here"));
                    this.saved_chat = true;
                    this.$('.chat-list-wrap .pinned-chat-list').prepend($cloned_item);
                } else
                    this.$('.chat-list-wrap .chat-list').append(chat.item_view.$el.clone().removeClass('hidden'));
            }
        });
        if (!this.saved_chat) {
            let saved_chat = this.account.chats.getSavedChat(),
                $cloned_item = saved_chat.item_view.$el.clone();
            $cloned_item.find('.last-msg').text(xabber.getString("saved_messages__hint_forward_here"));
            this.$('.chat-list-wrap .pinned-chat-list').prepend($cloned_item);
        }
        this.$('.chat-list-wrap .pinned-chat-list').prepend($('<div/>', { class: 'forward-panel-list-title recent-chats-title hidden'}).text(xabber.getString("category_recent_chats")));
        this.$('.chat-list-wrap .chat-list').append($('<div/>', { class: 'forward-panel-list-title contacts-title hidden'}).text(xabber.getString("category_title_contacts")));
        this.$('.chat-item').removeClass('active');
        this.clearSearch();
        this.data.set('visible', true);
        this.$el.openModal({
            ready: () => {
                this.updateScrollBar();
                this.$('.search-input').focus();
            },
            complete: () => {
                this.$el.detach();
                this.data.set('visible', false);
            }
        });
    },

    close: function () {
        let deferred = new $.Deferred();
        this.$el.closeModal({ complete: () => {
            this.$el.detach();
            this.data.set('visible', false);
            deferred.resolve();
        }});
        return deferred.promise();
    },

    onClickItem: function (ev) {
        let $target = $(ev.target).closest('.list-item');
        this.onEnterPressed($target);
    },

    search: function (query) {
        let jid, name, is_match = false, has_matches_chats = false, has_matches_contacts = false;
        query = query.toLowerCase();
        this.$('.roster-contact.list-item').remove();
        query && this.account.roster.forEach((contact) => {
            let jid = contact.get('jid'),
                chat_id = contact.hash_id,
                name = contact.get('name').toLowerCase(),
                is_match = (name.indexOf(query) < 0 && jid.indexOf(query) < 0) ? true : false;
            if (!is_match) {
                if (!this.$('.chat-list-wrap .chat-item[data-id="' + chat_id + '"]').length) {
                    let contact_list_item = xabber.contacts_view.$(`.account-roster-wrap[data-jid="${this.account.get('jid')}"] .roster-contact[data-jid="${jid}"]`).first().clone();
                    contact_list_item.find('.muted-icon').hide();
                    this.$('.chat-list-wrap .contact-list').append(contact_list_item);
                }
                else
                    is_match = true;
            }
            !is_match && (has_matches_contacts = true);
        });
        this.$('.contacts-title').switchClass('hidden', !has_matches_contacts);
        this.$('.chat-item').each((idx, item) => {
            let chat = this.account.chats.get($(item).data('id'));
            if (!chat) {
                $(item).addClass('hidden');
                return;
            }
            jid = chat.get('jid');
            name = (chat.contact ? chat.contact.get('name') : chat.get('name'));
            if (name)
                name = name.toLowerCase();
            is_match = (!name || name && (name.indexOf(query) < 0 && jid.indexOf(query) < 0)) ? false : true;
            $(item).hideIf(!is_match);
            is_match && (has_matches_chats = true);
        });
        this.$('.recent-chats-title').switchClass('hidden', !has_matches_chats);
        this.$('.modal-content .error').showIf(!has_matches_contacts && !has_matches_chats);
        this.scrollToTop();
    },

    onEmptyQuery: function () {
        this.$('.roster-contact.list-item').remove();
        this.$('.contacts-title').addClass('hidden');
        this.$('.modal-content .error').addClass('hidden');
        this.$('.recent-chats-title').addClass('hidden');
    },

    onEnterPressed: function (selection) {
        let chat_item;
        if (selection.hasClass('roster-contact'))
            chat_item = this.account.chats.getChat(this.account.contacts.get(selection.data('jid'))).item_view;
        if (selection.hasClass('chat-item'))
            chat_item = xabber.chats_view.child(selection.data('id'));
        chat_item && this.forwardTo(chat_item);
    },

    forwardTo: function (chat_item) {
        if (chat_item.model.get('saved')) {
            this.messages.forEach((message) => {
                chat_item.content.onSubmit("", [message]);
            });
        }
        else {
            if (!chat_item.content)
                chat_item.content = new xabber.ChatContentView({chat_item: chat_item});
            chat_item.content.bottom.setForwardedMessages(this.messages);
        }
        this.messages = [];
        this.close().done(() => {
            chat_item.open({clear_search: true});
        });
    }
});

xabber.InvitationPanelView = xabber.SearchView.extend({
    className: 'modal dialog-modal add-user-group-chat',
    template: templates.group_chats.invitation_panel_view,
    ps_selector: '.contacts-list-wrap',
    ps_settings: {theme: 'item-list'},

    _initialize: function () {
        this.registerClickEvents();
    },

    open: function (account, contact) {
        this.selected_contacts = [];
        this.account = account;
        this.contact = contact;
        this.clearPanel();
        this.$(`textarea[name="invitation_text"]`).val('');
        this.$('.invitation-reason-wrap').addClass('hidden');
        xabber.contacts_view.$(`.account-roster-wrap[data-jid="${this.account.get('jid')}"] .roster-group`).each((idx, item) => {
            let group_node = $(item).clone();
            $(group_node).find('.list-item').each((i, list_item) => {
                let contact_node = this.account.contacts.get($(list_item).attr('data-jid'));
                if (contact_node.get('group_chat'))
                        list_item.remove();
            });
            if (group_node.children('.list-item').length) {
                this.$('.contacts-list-wrap').append(group_node);
                group_node.find('.arrow').click((ev) => {
                    this.toggleContacts(ev);
                });
                group_node.find('.group-head').click((ev) => {
                    this.selectAllGroup(ev);
                });
            }
        });
        this.data.set('visible', true);
        this.$el.openModal({
            ready: () => {
                this.updateScrollBar();
                this.$('.search-input').focus();
            },
            complete: () => {
                this.$el.detach();
                this.data.set('visible', false);
                this.selected_contacts = [];
            }
        });
    },

    addSelectedUsers: function () {
        if (!this.selected_contacts.length) {
            this.$('.modal-footer button').blur();
            return;
        }
        let selected_users_count = this.selected_contacts.length,
            _dfd_invitations = new $.Deferred(), invitations_count = 0;
        _dfd_invitations.done((count) => {
            let toast_text;
            if (count == selected_users_count)
                toast_text = xabber.getQuantityString("groupchat__toast__invitations_sent", selected_users_count);
            else
                toast_text = xabber.getQuantityString("groupchat__toast_failed_to_sent_invitations", selected_users_count);
            utils.callback_popup_message(toast_text, 2000);
            this.contact.trigger('invitations_send')
        });
        $(this.selected_contacts).each((idx, item) => {
            this.sendInvite(item, () => {
                invitations_count++;
                if (idx == selected_users_count - 1)
                    _dfd_invitations.resolve(invitations_count);
            }, () => {
                if (idx == selected_users_count - 1)
                    _dfd_invitations.resolve(invitations_count);
            });
        });
        this.close();
    },

    clearPanel: function () {
        this.$('.modal-footer .errors').text('');
        this.$('.counter').text('');
        this.$('.contacts-list-wrap').empty();
        this.clearSearch();
    },

    showReasonWrap: function () {
        this.$('.invitation-reason-wrap').switchClass('hidden');
        if (this.$('.invitation-reason-wrap').hasClass('hidden'))
            this.$(`textarea[name="invitation_text"]`).val('');
    },

    registerClickEvents: function () {
        this.$('.btn-cancel').click(() => {
            this.close();
        });
        this.$('.btn-add').click(() => {
            this.addSelectedUsers();
        });
        this.$('.btn-invitation-reason').click(() => {
            this.showReasonWrap();
        });
    },

    addUser: function (ev) {
        let $target = $(ev.target).closest('.list-item'),
            contact_jid = $target.attr('data-jid');
        let itemIdx = this.selected_contacts.indexOf(contact_jid);
        if (!$target.hasClass('click-selected') && itemIdx > -1){
            this.$(`.list-item[data-jid="${contact_jid}"]`).removeClass('click-selected');
            this.selected_contacts.splice(itemIdx, 1);
            this.updateCounter();
            return;
        }
        $target.toggleClass('click-selected');
        if (itemIdx > -1)
            this.selected_contacts.splice(itemIdx, 1);
        else
            this.selected_contacts.push(contact_jid);
        this.updateCounter();
    },

    sendInvite: function (contact_jid, callback, errback) {
        let reason_text = (this.contact.get('group_info').privacy === 'incognito') ? xabber.getString("groupchat__incognito_group__text_invitation") : xabber.getString("groupchat__public_group__text_invitation", [contact_jid]);
        if (this.$(`textarea[name="invitation_text"]`).val()){
            reason_text = reason_text + '\n\n' + this.$(`textarea[name="invitation_text"]`).val();
        }
        let iq = $iq({type: 'set', to: (this.contact.get('full_jid') || this.contact.get('jid'))})
                .c('invite', {xmlns: `${Strophe.NS.GROUP_CHAT}#invite`})
                .c('jid').t(contact_jid).up()
                .c('send').t('false').up()
                .c('reason').t(reason_text);
        this.account.sendIQFast(iq, () => {
            this.sendInviteMessage(contact_jid);
            this.close();
            callback && callback();
        }, (iq) => {
            this.onInviteError(iq);
            errback && errback();
        });
    },

    onInviteError: function (iq) {
        let err_text;
        if ($(iq).find('not-allowed').length > 0) {
            err_text = $(iq).find('text').text() || xabber.getString("groupchat_you_have_no_permissions_to_do_it");
        }
        if ($(iq).find('conflict').length > 0) {
            err_text = $(iq).find('text').text() || xabber.getString("groupchat__invitation__error_already_invited", [$(iq).find('invite').find('jid').text()]);
        }
        this.$('.modal-footer .errors').removeClass('hidden').text(err_text);
    },

    sendInviteMessage: function(jid_to) {
        let reason_text = (this.contact.get('group_info').privacy === 'incognito') ? xabber.getString("groupchat__incognito_group__text_invitation") : xabber.getString("groupchat__public_group__text_invitation", [jid_to]);
        if (this.$(`textarea[name="invitation_text"]`).val()){
            reason_text = reason_text + '\n\n' + this.$(`textarea[name="invitation_text"]`).val();
        }
        let body = xabber.getString("groupchat_legacy_invitation_body", [this.contact.get('jid')]),
            stanza = $msg({
                to: jid_to,
                type: 'chat',
                id: uuid()
            }).c('invite', {xmlns: `${Strophe.NS.GROUP_CHAT}#invite`, jid: this.contact.get('jid')})
                .c('reason').t(reason_text).up().up()
                .c('x', {xmlns: Strophe.NS.GROUP_CHAT})
                .c('privacy').t(this.contact.get('group_info').privacy).up().up()
                .c('body').t(body).up();
        this.account.sendMsg(stanza);
    },

    search: function (query) {
        query = query.toLowerCase();
        query && this.$('.list-item').each((idx, item) => {
            let jid = $(item).attr('data-jid'),
                name = this.account.contacts.get(jid).get('name').toLowerCase(),
                hide_clone = (this.$(`.list-item[data-jid="${jid}"]`).length > 1) && (!this.$(`.list-item[data-jid="${jid}"]`).first().is($(item)));
            $(item).hideIf((name.indexOf(query) < 0 && jid.indexOf(query) < 0) || hide_clone);
        });
        this.$('.group-head').addClass('hidden');
        this.$('.modal-content .error').switchClass('hidden', !(this.$('.list-item').length === this.$('.list-item.hidden').length));
        this.scrollToTop();
    },

    onEmptyQuery: function () {
        this.$('.list-item').removeClass('hidden');
        this.$('.group-head').removeClass('hidden');
    },

    onClickItem: function (ev) {
        this.addUser(ev);
    },

    onEnterPressed: function (selection) {
        let contact_jid = selection.attr('data-jid'),
            itemIdx = this.selected_contacts.indexOf(contact_jid);
        if (itemIdx > -1)
            this.selected_contacts.splice(itemIdx, 1);
        this.selected_contacts.push(contact_jid);
        this.updateCounter();
        this.addSelectedUsers();
    },

    close: function () {
        this.$el.closeModal({ complete: this.hide.bind(this) });
    },

    toggleContacts: function (ev) {
        let is_visible = $(ev.target).hasClass('mdi-chevron-down');
        if (is_visible) {
            let group_roster = $(ev.target).closest('.roster-group');
            group_roster.find('.list-item').each((idx, item) => {
                $(item).addClass('hidden');
            });
        }
        else
        {
            let group_roster = $(ev.target).closest('.roster-group');
            group_roster.find('.list-item').each((idx, item) => {
                $(item).removeClass('hidden');
            });
        }
        $(ev.target).switchClass('mdi-chevron-right', is_visible);
        $(ev.target).switchClass('mdi-chevron-down', !is_visible);
        this.updateScrollBar();
    },

    selectAllGroup: function (ev) {
        if ($(ev.target).hasClass('arrow'))
            return;
       let group_roster = $(ev.target).closest('.roster-group');
       if (group_roster.hasClass('click-selected')) {
           group_roster.removeClass('click-selected');
           group_roster.find('.list-item').each((idx, item) => {
               let contact_jid = $(item).attr('data-jid'),
                   itemIdx = this.selected_contacts.indexOf(contact_jid);
               if (itemIdx > -1) {
                   this.selected_contacts.splice(itemIdx, 1);
                   $(item).removeClass('click-selected');
               }
           });
       }
       else
       {
           group_roster.addClass('click-selected');
           group_roster.find('.list-item').each((idx, item) => {
               let contact_jid = $(item).attr('data-jid'),
                   itemIdx = this.selected_contacts.indexOf(contact_jid);
               if (itemIdx > -1)
                   return;
               else
                   this.selected_contacts.push(contact_jid);
               $(item).addClass('click-selected');
           });
       }
        this.updateCounter();
    },

    updateCounter: function () {
        let selected_counter = this.$('.list-item.click-selected').length;
        (selected_counter) ? this.$('.counter').removeClass('hidden').text(selected_counter) : this.$('.counter').text('');
    }

});

  xabber.SavedChatHeadView = xabber.BasicView.extend({
      className: 'chat-head-wrap saved-chat',
      template: templates.saved_chat_head,
      events: {
          "click .contact-name": "showSettings",
          "click .circle-avatar": "showSettings",
          "click .btn-chat-pin": "pinSavedChat",
          "click .btn-delete-chat": "deleteChat",
          "click .btn-set-status": "setStatus",
          "click .btn-play-pause-plyr": "playPausePlyr",
          "click .btn-next-plyr": "nextPlyr",
          "click .btn-previous-plyr": "previousPlyr",
          "click .btn-stop-plyr": "stopPlyr",
          "click .btn-popup-plyr": "popupPlyr",
          "click .btn-jingle-message": "openJingleMessage",
          "click .btn-search-messages": "renderSearchPanel"
      },

      _initialize: function (options) {
          this.content = options.content;
          this.contact = this.content.contact;
          this.model = this.content.model;
          clearInterval(this._update_oneliner_interval);
          this.updateOneLiner();
          this._update_oneliner_interval = setInterval(() => {
              this.updateOneLiner();
          }, 1000*60*2);
          this.account = this.model.account;
          this.$el.find('.circle-avatar:not(.voice-message-player-avatar)').html(env.templates.svg['saved-messages']());
          this.model.on("close_chat", this.closeChat, this);
          this.model.on("hide_chat", this.hideChat, this);
          xabber.on('plyr_player_updated', this.updatePlyrControls, this);
          xabber.on('update_layout', this.updatePlyrTitle, this);
          xabber.on('plyr_player_time_updated', this.updatePlyrTime, this);
          xabber.on("update_jingle_button", this.updateJingleButton, this);
      },

      render: function () {
          this.$('.tooltipped').tooltip({delay: 50});
          this.$('.btn-more').dropdown({
              inDuration: 100,
              outDuration: 100,
              hover: false
          });
          this.$('.chat-head-menu').hide();
          this.updatePlyrControls();
          this.updatePlyrTime();
          this.updateJingleButton();
          return this;
      },

      updateOneLiner: function () {
          let rand_idx = _.random(0, xabber.getOneLiners().length - 1),
              one_liner = xabber.getOneLiners()[rand_idx].replace(/\\n/, "");
          if (!one_liner) {
              this.updateOneLiner();
              return;
          }
          this.$('.one-liner').text(one_liner);
      },

      closeChat: function () {
          this.model.set({'opened': false, 'display': false, 'active': false});
          xabber.chats_view.clearSearch();
      },

      hideChat: function () {
          this.model.set({'active': false});
          xabber.chats_view.clearSearch();
      },

      showSettings: function () {
          this.account.showSettingsModal();
      },

      deleteChat: function () {
          let rewrite_support = this.account.server_features.get(Strophe.NS.REWRITE);
          utils.dialogs.ask(xabber.getString("dialog_delete_saved_messages__header"), xabber.getString("dialog_delete_saved_messages__confirm") +
              (rewrite_support ? "" : ("\n" + xabber.getString("dialog_delete_saved_messages__confirm", [this.account.domain]).fontcolor('#E53935'))), null, { ok_button_text: rewrite_support? xabber.getString("delete") : xabber.getString("dialog_clear_chat_history__button_delete_locally")}).done((result) => {
              if (result) {
                  if (this.account.connection && this.account.connection.do_synchronization) {
                      this.model.deleteFromSynchronization();
                  }
                  if (rewrite_support) {
                      this.model.retractAllMessages(false);
                  }
                  else {
                      let all_messages = this.model.messages.models;
                      $(all_messages).each((idx, item) => {
                          this.content.removeMessage(item);
                      });
                  }
                  this.closeChat();
                  this.model.set('timestamp', 0);
              }
          });
      },

      pinSavedChat: function () {
          let pinned = this.model.get('pinned'),
              is_pinned = pinned && pinned !== '0' ? true : false,
              pinned_value = is_pinned ? '0' : + new Date(),
              conversation_options = {
                  jid: this.account.get('jid'),
                  pinned: pinned_value,
                  type: this.model.get('sync_type') ? this.model.get('sync_type') : this.model.getConversationType(this.model)
              },
              iq = $iq({type: 'set', to: this.account.get('jid')})
                  .c('query', {xmlns: Strophe.NS.SYNCHRONIZATION})
                  .c('conversation', conversation_options);
          this.account.sendIQFast(iq);
          this.model.set('pinned', pinned_value);
      },

      renderSearchPanel: function () {
          let visible_view;
          if (this.content.isVisible())
              visible_view = this.content;
          this.model.messages_view && this.model.messages_view.isVisible() && (visible_view = this.model.messages_view);
          visible_view && visible_view.$search_form.slideToggle(200, () => {
              if (visible_view.$search_form.css('display') !== 'none')
                  visible_view.$search_form.find('input').focus();
          });
      },

      playPausePlyr: function () {
          if (!xabber.current_plyr_player)
              return;
          if (xabber.current_plyr_player.$audio_elem){
              if (!xabber.current_plyr_player.$audio_elem.voice_message){
                  let f_url = $(xabber.current_plyr_player.$audio_elem).find('.file-link-download').attr('href');
                  $(xabber.current_plyr_player.$audio_elem).find('.mdi-play').removeClass('no-uploaded')
                  xabber.current_plyr_player.$audio_elem.voice_message = this.content.renderVoiceMessage($(xabber.current_plyr_player.$audio_elem).find('.file-container')[0], f_url);
              } else {
                  xabber.current_plyr_player.$audio_elem.voice_message.playPause()
              }
          } else
              xabber.current_plyr_player.togglePlay();
          xabber.trigger('plyr_player_updated');
      },

      stopPlyr: function () {
          if (!xabber.current_plyr_player && xabber.plyr_player_popup)
              return;
          xabber.plyr_players.forEach((item) => {
              if (item.$audio_elem){
                  if (item.$audio_elem.voice_message)
                      item.$audio_elem.voice_message.stopTime();
              }
          });
          if (xabber.plyr_player_popup)
              xabber.plyr_player_popup.closePopup();
          else {
              xabber.current_plyr_player = null;
              xabber.trigger('plyr_player_updated');
          }
      },

      popupPlyr: function () {
          if (xabber.plyr_player_popup)
              xabber.plyr_player_popup.minimizePopup();
      },

      nextPlyr: function () {
          let player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player);
          if (player_index === -1 && xabber.current_plyr_player.player_item)
              player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player.player_item);
          if (!xabber.current_plyr_player || !(player_index >= 0 && player_index < xabber.current_plyr_player.chat_item.model.plyr_players.length - 1))
              return;
          if (xabber.current_plyr_player.chat_item.model.plyr_players[player_index + 1].$audio_elem){
              let next_item = xabber.current_plyr_player.chat_item.model.plyr_players[player_index + 1];
              if (!next_item.$audio_elem.voice_message){
                  let f_url = $(next_item.$audio_elem).find('.file-link-download').attr('href');
                  $(next_item.$audio_elem).find('.mdi-play').removeClass('no-uploaded');
                  next_item.$audio_elem.voice_message = xabber.current_plyr_player.chat_item.content.renderVoiceMessage($(next_item.$audio_elem).find('.file-container')[0], f_url, xabber.current_plyr_player.chat_item.model);
              } else {
                  next_item.$audio_elem.voice_message.play()
              }
          } else{
              if (!xabber.plyr_player_popup){
                  xabber.plyr_player_popup = new xabber.PlyrPlayerPopupView({});
                  xabber.plyr_player_popup.show({player: xabber.current_plyr_player.chat_item.model.plyr_players[player_index + 1]});
              } else
                  xabber.plyr_player_popup.showNewVideo({player: xabber.current_plyr_player.chat_item.model.plyr_players[player_index + 1]});
          }
      },

      previousPlyr: function () {
          let player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player);
          if (player_index === -1 && xabber.current_plyr_player.player_item)
              player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player.player_item);
          if (!xabber.current_plyr_player || !(player_index <= xabber.current_plyr_player.chat_item.model.plyr_players.length && player_index > 0))
              return;
          if (xabber.current_plyr_player.chat_item.model.plyr_players[player_index - 1].$audio_elem){
              let prev_item = xabber.current_plyr_player.chat_item.model.plyr_players[player_index - 1];
              if (!prev_item.$audio_elem.voice_message){
                  let f_url = $(prev_item.$audio_elem).find('.file-link-download').attr('href');
                  $(prev_item.$audio_elem).find('.mdi-play').removeClass('no-uploaded');
                  prev_item.$audio_elem.voice_message = xabber.current_plyr_player.chat_item.content.renderVoiceMessage($(prev_item.$audio_elem).find('.file-container')[0], f_url, xabber.current_plyr_player.chat_item.model);
              } else {
                  prev_item.$audio_elem.voice_message.play()
              }
          } else{
              if (!xabber.plyr_player_popup){
                  xabber.plyr_player_popup = new xabber.PlyrPlayerPopupView({});
                  xabber.plyr_player_popup.show({player: xabber.current_plyr_player.chat_item.model.plyr_players[player_index - 1]});
              } else
                  xabber.plyr_player_popup.showNewVideo({player: xabber.current_plyr_player.chat_item.model.plyr_players[player_index - 1]});
          }
      },

      updatePlyrControls: function () {
          this.$('.chat-tool-player').showIf(xabber.current_plyr_player);
          this.$el.switchClass('chat-head-player-enabled', xabber.current_plyr_player);
          if (xabber.current_plyr_player && xabber.current_plyr_player.$audio_elem) {
              if (xabber.current_plyr_player.$audio_elem.voice_message){
                  let voice_message = xabber.current_plyr_player.$audio_elem.voice_message;
                  this.$('.chat-head-player-type').text(xabber.getString("chat_message_voice"))
                  this.$('.btn-play-pause-plyr .mdi-play').hideIf(voice_message.isPlaying());
                  this.$('.btn-play-pause-plyr .mdi-pause').hideIf(!voice_message.isPlaying());
                  this.$('.btn-play-pause-plyr').switchClass('active-plyr', voice_message.isPlaying());
                  // this.$('.btn-play-pause-plyr').switchClass('ground-color-500', voice_message.isPlaying());
                  this.$('.btn-previous-plyr').switchClass('before-active-plyr', voice_message.isPlaying());
                  let player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player);
                  this.$('.btn-next-plyr').switchClass('disabled', !(player_index >= 0 && player_index < xabber.current_plyr_player.chat_item.model.plyr_players.length - 1));
                  this.$('.btn-previous-plyr').switchClass('disabled', !(player_index <= xabber.current_plyr_player.chat_item.model.plyr_players.length && player_index > 0));
                  this.$('.mdi-player-type-icon').addClass('hidden');
                  this.$('.player-poster').addClass('hidden');
                  this.$('.voice-message-player-avatar').removeClass('hidden');
                  this.$('.voice-message-player-avatar').setAvatar(xabber.current_plyr_player.contact_avatar, 32);
                  this.updatePlyrTitle();
                  let duration = Math.round(voice_message.getDuration());
                  this.$('.chat-head-player-total-time').text(utils.pretty_duration(duration));
                  let timerId = setInterval(function() {
                      let cur_time = Math.round(voice_message.getCurrentTime());
                      if (voice_message.isPlaying())
                          this.$('.chat-head-player-current-time').text(utils.pretty_duration(cur_time));
                      else
                          clearInterval(timerId);
                  }, 100);
                  (xabber.plyr_player_popup) && xabber.plyr_player_popup.$el.addClass('hidden2');
                  (xabber.plyr_player_popup) && xabber.plyr_player_popup.$el.closest('#modals').siblings('#' + xabber.plyr_player_popup.$el.data('overlayId')).addClass('hidden2');
              }
          }
          else if (xabber.current_plyr_player) {
              this.$('.chat-head-player-current-time').text(utils.pretty_duration(isNaN(xabber.current_plyr_player.currentTime) ? 0 : parseInt(xabber.current_plyr_player.currentTime)));
              this.$('.chat-head-player-total-time').text(utils.pretty_duration(parseInt(xabber.current_plyr_player.duration)));
              this.updatePlyrTitle();
              let poster = xabber.current_plyr_player.poster;
              if (poster){
                  this.$('.mdi-player-type-icon').addClass('hidden');
                  this.$('.player-poster').removeClass('hidden');
                  this.$('.player-poster').attr("src", poster);
              } else {
                  this.$('.mdi-player-type-icon').removeClass('hidden');
                  this.$('.player-poster').addClass('hidden');
              }
              this.$('.voice-message-player-avatar').addClass('hidden');
              if (xabber.current_plyr_player.provider != 'html5')
                  this.$('.chat-head-player-type').text(xabber.current_plyr_player.provider)
              else
                  this.$('.chat-head-player-type').text(xabber.getString("chat_message_video"))
              this.$('.btn-play-pause-plyr .mdi-play').hideIf(xabber.current_plyr_player.playing);
              this.$('.btn-play-pause-plyr .mdi-pause').hideIf(!xabber.current_plyr_player.playing);
              this.$('.btn-play-pause-plyr').switchClass('active-plyr', xabber.current_plyr_player.playing);
              // this.$('.btn-play-pause-plyr').switchClass('ground-color-500', xabber.current_plyr_player.playing);
              this.$('.btn-previous-plyr').switchClass('before-active-plyr', xabber.current_plyr_player.playing);
              let player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player.player_item);
              this.$('.btn-next-plyr').switchClass('disabled', !(player_index >= 0 && player_index < xabber.current_plyr_player.chat_item.model.plyr_players.length - 1));
              this.$('.btn-previous-plyr').switchClass('disabled', !(player_index <= xabber.current_plyr_player.chat_item.model.plyr_players.length && player_index > 0));
              (xabber.plyr_player_popup) && xabber.plyr_player_popup.$el.removeClass('hidden2');
              (xabber.plyr_player_popup) && xabber.plyr_player_popup.$el.closest('#modals').siblings('#' + xabber.plyr_player_popup.$el.data('overlayId')).removeClass('hidden2');
          }
      },

      updatePlyrTime: function () {
          if (xabber.current_plyr_player){
              if (xabber.current_plyr_player && xabber.current_plyr_player.$audio_elem) {
              }
              else if (!isNaN(xabber.current_plyr_player.currentTime))
                  this.$('.chat-head-player-current-time').text(utils.pretty_duration(isNaN(xabber.current_plyr_player.currentTime) ? 0 : parseInt(xabber.current_plyr_player.currentTime)));
          }
      },

      updatePlyrTitle: function () {
          if (!xabber.current_plyr_player)
              return
          let $title_elem = this.$('.chat-head-player-title .chat-head-player-title-text'),
              title;
          if (xabber.current_plyr_player && xabber.current_plyr_player.$audio_elem)
              title = xabber.current_plyr_player.author;
          else if (xabber.current_plyr_player)
              title = xabber.current_plyr_player.config.title ?
                  xabber.current_plyr_player.config.title :
                  xabber.current_plyr_player.provider === 'html5' ?
                      xabber.current_plyr_player.source.substring(xabber.current_plyr_player.source.lastIndexOf('/')+1)
                      : xabber.getString("chat_message_video");
          $title_elem.text(title);
          if (this.$('.chat-head-player-title')[0] && utils.isOverflownWidth(this.$('.chat-head-player-title')[0])){
              $title_elem.addClass('active-animation-player-title');
              $title_elem.text(title + ' ⚫︎︎ ⚫︎︎ ⚫︎︎ ' + title);
          } else
              $title_elem.removeClass('active-animation-player-title');

      },

      updateJingleButton: function () {
          this.$('.btn-jingle-message').switchClass('active-call', xabber.current_voip_call);
          if (xabber.current_voip_call){
              this.$('.btn-jingle-message').removeClass('hidden');
              let voip_status = xabber.current_voip_call.get('status');
              if (voip_status)
                  this.$('.btn-jingle-message').attr('data-state', voip_status);
              else
                  this.$('.btn-jingle-message').attr('data-state', '');
              if (voip_status === 'disconnected')
                  this.$('.btn-jingle-message').removeClass('active-call');
          } else
              this.$('.btn-jingle-message').addClass('hidden');
      },

      openJingleMessage: function () {
          if (xabber.current_voip_call) {
              xabber.current_voip_call.modal_view.collapse();
              return;
          }
      },
  });

  xabber.ChatHeadView = xabber.BasicView.extend({
    className: 'chat-head-wrap',
    template: templates.chat_head,
    avatar_size: constants.AVATAR_SIZES.CHAT_HEAD,

    events: {
        "click .chat-head-wrap": "showContactDetailsRight",
        "click .chat-head-details": "showContactDetailsRight",
        "click .contact-name": "showContactDetailsRight",
        "click .circle-avatar": "showContactDetailsRight",
        "click .contact-status-message.resource-hover": "showContactResources",
        "click .contact-status-message.members-hover": "showMembersDetails",
        "click .btn-clear-history": "clearHistory",
        "click .btn-invite-users": "inviteUsers",
        "click .btn-delete-chat": "deleteChat",
        "click .btn-delete-contact": "deleteContact",
        "click .btn-block-contact": "blockContact",
        "click .btn-unblock-contact": "unblockContact",
        "click .btn-export-history": "exportHistory",
        "click .btn-show-fingerprints": "showFingerprints",
        "click .btn-start-encryption": "startEncryptedChat",
        "click .btn-open-encrypted-chat": "openEncryptedChat",
        "click .btn-open-regular-chat": "openRegularChat",
        "click .btn-chat-pin": "pinChat",
        "click .btn-archive-chat": "archiveChat",
        "click .btn-call-attention": "callAttention",
        "click .btn-search-messages": "renderSearchPanel",
        "click .btn-jingle-message": "sendJingleMessage",
        "click .btn-mute-dropdown": "muteChat",
        "click .btn-notifications.muted": "unmuteChat",
        "click .btn-set-status": "setStatus",
        "click .btn-play-pause-plyr": "playPausePlyr",
        "click .btn-next-plyr": "nextPlyr",
        "click .btn-previous-plyr": "previousPlyr",
        "click .btn-stop-plyr": "stopPlyr",
        "click .btn-popup-plyr": "popupPlyr",
        "click .btn-set-ephemeral-timer": "setEphemeralTimer",
    },

    _initialize: function (options) {
        this.content = options.content;
        this.contact = this.content.contact;
        this.model = this.content.model;
        this.account = this.model.account;
        this.resources_view = new xabber.ContactResourcesRightView({model: this.contact.resources});
        this.updateName();
        this.updateStatus();
        this.updateEncrypted();
        this.updateAvatar();
        this.updateNotifications();
        this.updateArchived();
        this.updatePinned();
        this.model.on("change:encrypted", this.updateEncrypted, this);
        this.model.on("close_chat", this.closeChat, this);
        this.model.on("hide_chat", this.hideChat, this);
        this.model.on("pinned", this.pinChat, this);
        this.model.on("change:muted", this.updateNotifications, this);
        this.model.on("change:archived", this.updateArchived, this);
        this.model.on("change:pinned", this.updatePinned, this);
        this.contact.on("change", this.onContactChanged, this);
        this.contact.on("archive_chat", this.archiveChat, this);
        this.contact.on("change:name", this.updateName, this);
        this.contact.on("change:status", this.updateStatus, this);
        this.contact.on("change:status_updated", this.updateStatus, this);
        this.contact.on("change:image", this.updateAvatar, this);
        this.contact.on("change:blocked", this.onChangedBlocked, this);
        this.contact.on("change:group_chat", this.updateGroupChatHead, this);
        this.contact.on("change:subscription", this.updateMenu, this);
        this.contact.on("change:in_roster", this.updateMenu, this);
        this.contact.on("update_trusted", this.updateEncryptedColor, this);
        xabber._settings.on("change:jingle_calls", this.updateGroupChatHead, this);
        xabber.on('change:audio', this.updateGroupChatHead, this);
        xabber.on('plyr_player_updated', this.updatePlyrControls, this);
        xabber.on('update_layout', this.updatePlyrTitle, this);
        xabber.on('plyr_player_time_updated', this.updatePlyrTime, this);
        xabber.on("update_jingle_button", this.updateJingleButton, this);
    },

    render: function (options) {
        this.$('.tooltipped').tooltip('remove');
        this.$('.tooltipped').tooltip({delay: 50});
        this.$('.btn-more').dropdown({
            inDuration: 100,
            outDuration: 100,
            hover: false
        });
        this.$('.btn-notifications').dropdown({
            inDuration: 100,
            outDuration: 100,
            hover: true, // Activate on hover
            belowOrigin: true, // Displays dropdown below the button
        });
        this.$('.ephemeral-timer-dropdown').switchClass('hidden', !this.model.get('encrypted'));
        this.$('.ephemeral-timer-dropdown').dropdown({
            inDuration: 100,
            outDuration: 100,
            hover: true, // Activate on hover
            belowOrigin: true, // Displays dropdown below the button
        });
        this.$('.chat-head-menu').hide();
        this.updateStatusMsg();
        this.updateGroupChatHead();
        if (this.contact.get('group_chat'))
            this.$('.contact-status-message').addClass('members-hover')
        else
            this.$('.contact-status-message').addClass('resource-hover')
        this.updatePlyrControls();
        this.updatePlyrTime();
        this.updateJingleButton();
        return this;
    },

    updateEncrypted: function () {
        this.$el.switchClass('encrypted', this.model.get('encrypted'));
    },

    updateEncryptedColor: function (encrypted) {
        this.$el.attr('data-trust', encrypted);
    },

    updateName: function () {
        this.$('.contact-name').text(this.contact.get('name'));
    },

    updateStatus: function () {
        let status = this.contact.get('status'),
            status_message = this.contact.getStatusMessage();
        this.$('.contact-status').attr('data-status', status);
        this.$('.chat-icon').attr('data-status', status);
        this.model.get('blocked') ? this.$('.contact-status-message').text('Contact blocked') : this.$('.contact-status-message').text(status_message);
    },

    updateStatusMsg: function () {
        this.$('.contact-status-message').text(this.contact.getStatusMessage());
    },

    updateAvatar: function () {
        let image = this.contact.cached_image;
        this.$('.circle-avatar').setAvatar(image, this.avatar_size);
    },

    onContactChanged: function () {
        let changed = this.contact.changed;
        if (_.has(changed, 'subscription_request_in') || _.has(changed, 'subscription_request_out') || _.has(changed, 'subscription') || _.has(changed, 'status_message'))
            this.updateStatusMsg();
        if (_.has(changed, 'private_chat') || _.has(changed, 'incognito_chat') || _.has(changed, 'invitation'))
            this.updateIcon();
    },

    onChangedBlocked: function () {
        this.updateMenu();
        this.updateStatusMsg();
        this.updateIcon();
    },

    updateMenu: function () {
        let is_group_chat = this.contact.get('group_chat');
        this.$('.btn-invite-users').showIf(is_group_chat && !this.contact.get('private_chat') && this.contact.get('subscription') == 'both');
        this.$('.btn-call-attention').hideIf(is_group_chat || this.model.get('encrypted'));
        this.$('.btn-clear-history').hideIf(is_group_chat);
        this.$('.btn-start-encryption').showIf(!is_group_chat && this.account.omemo && !this.model.get('encrypted') && !this.account.chats.get(`${this.contact.hash_id}:encrypted`));
        this.$('.btn-open-encrypted-chat').showIf(!is_group_chat && this.account.omemo && !this.model.get('encrypted') && this.account.chats.get(`${this.contact.hash_id}:encrypted`));
        this.$('.btn-open-regular-chat').showIf(this.model.get('encrypted'));
        this.$('.btn-show-fingerprints').showIf(!is_group_chat && this.account.omemo && this.model.get('encrypted'));
        this.$('.btn-retract-own-messages').showIf(is_group_chat);
        this.$('.btn-block-contact').hideIf(this.contact.get('blocked'));
        this.$('.btn-unblock-contact').showIf(this.contact.get('blocked'));
        this.$('.btn-delete-contact').showIf(this.contact.get('in_roster') && !is_group_chat);
        this.$('.btn-notifications').hideIf(this.contact.get('blocked'));
        this.$('.btn-jingle-message').hideIf((this.contact.get('blocked') || is_group_chat) && xabber.current_voip_call);
        this.$('.btn-jingle-message').hideIf(!xabber.settings.jingle_calls);
    },

    renderSearchPanel: function () {
        this.contact.showDetailsRight('all-chats', {type: 'search'});
    },

    showContactDetailsRight: function () {
        this.contact.showDetailsRight('all-chats', {encrypted: this.model.get('encrypted')});
    },

    showContactResources: function () {
        this.resources_view.open();
    },

    showMembersDetails: function () {
        this.contact.showDetailsRight('all-chats', {type: 'members'});
    },

    updatePinned: function () {
        let pinned = this.model.get('pinned'),
            is_pinned = pinned && pinned !== '0' ? true : false;
        if (is_pinned)
            this.$('.btn-chat-pin .one-line').text(xabber.getString("chat_action_unpin"))
        else
            this.$('.btn-chat-pin .one-line').text(xabber.getString("chat_action_pin"))
    },

    updateNotifications: function () {
        if (this.model.isMuted()) {
            this.$('.btn-notifications .one-line').text(xabber.getString("chat_action_unmute"));
            this.$('.btn-notifications').addClass('muted');
        }
        else {
            this.$('.btn-notifications .one-line').text(xabber.getString("chat_action_mute"));
            this.$('.btn-notifications').removeClass('muted');
        }
        this.$('.btn-mute-dropdown').hideIf(this.model.isMuted());
        this.$('.btn-unmute-dropdown').hideIf(!this.model.isMuted());
    },

      muteChat: function (ev) {
          if (this.contact.get('blocked'))
              return;
          let mute_type = $(ev.target).closest('.btn-mute-dropdown').data('mute'),
              muted_seconds;
          if (mute_type === 'minutes15')
              muted_seconds = 900
          if (mute_type === 'hours1')
              muted_seconds = 3600
          if (mute_type === 'hours2')
              muted_seconds = 7200
          if (mute_type === 'day')
              muted_seconds = 86400
          if (mute_type === 'forever')
              muted_seconds = 0
          this.model.muteChat(muted_seconds);
      },

      unmuteChat: function (ev) {
          if (this.contact.get('blocked'))
              return;
          this.model.muteChat('');
      },

    callAttention: function (ev) {
        let msg = $msg({type: 'headline', to: this.contact.get('jid')})
            .c('attention', {xmlns: Strophe.NS.ATTENTION});
        this.account.sendMsg(msg);
        this.model.messages.createSystemMessage({
            from_jid: this.account.get('jid'),
            message: xabber.getString("action_attention_called")
        });
    },


    updateArchived: function () {
        let archived = !this.model.get('archived'),
            is_archived = archived ? true : false;
        if (!is_archived)
            this.$('.btn-archive-chat .one-line').text(xabber.getString("chat_action_unarchive"))
        else
            this.$('.btn-archive-chat .one-line').text(xabber.getString("chat_action_archive"))
        this.$('.btn-archive-chat .mdi').switchClass('mdi-package-up', !is_archived);
        this.$('.btn-archive-chat .mdi').switchClass('mdi-package-down', is_archived);
        if (this.model.item_view && archived){
            !this.model.messages.length && this.model.item_view.updateLastMessage();
            this.account.chat_settings.updateArchiveChatsList(this.contact.get('jid'), archived);
            if (this.model.get('active')) {
                xabber.chats_view.updateScreenAllChats();
            }
        }
    },

    archiveChat: function (ev, no_iq) {
        let archived = !this.model.get('archived'),
            is_archived = archived ? true : false;
        if (!no_iq) {
            let is_archived_status = is_archived ? 'archived' : 'active',
                conversation_options = {
                    jid: this.contact.get('jid'),
                    status: is_archived_status,
                    type: this.model.get('sync_type') ? this.model.get('sync_type') : this.model.getConversationType(this.model)
                },
                iq = $iq({type: 'set', to: this.account.get('jid')})
                    .c('query', {xmlns: Strophe.NS.SYNCHRONIZATION})
                    .c('conversation', conversation_options);
            this.account.sendIQFast(iq);
            this.model.set('archived', archived);
        }
    },

    pinChat: function () {
        let pinned = this.model.get('pinned'),
            is_pinned = pinned && pinned !== '0' ? true : false,
            pinned_value = is_pinned ? '0' : + new Date(),
            conversation_options = {
                jid: this.contact.get('jid'),
                pinned: pinned_value,
                type: this.model.get('sync_type') ? this.model.get('sync_type') : this.model.getConversationType(this.model)
            },
            iq = $iq({type: 'set', to: this.account.get('jid')})
                .c('query', {xmlns: Strophe.NS.SYNCHRONIZATION})
                .c('conversation', conversation_options);
            this.account.sendIQFast(iq);
            this.model.set('pinned', pinned_value);
    },

    sendJingleMessage: function () {
        if (!xabber.settings.jingle_calls){
            return;
        }
        if (xabber.current_voip_call) {
            xabber.current_voip_call.modal_view.collapse();
            return;
        }
        xabber.chats_view.scrollToTop();
        xabber.chats_view.clearSearch();
        !this.contact.get('group_chat') && this.content.initJingleMessage();
    },

    setStatus: function () {
        let set_status_view = new xabber.SetGroupchatStatusView();
        set_status_view.open(this.contact);
    },

    playPausePlyr: function () {
        if (!xabber.current_plyr_player)
            return;
        if (xabber.current_plyr_player.$audio_elem){
            if (!xabber.current_plyr_player.$audio_elem.voice_message){
                let f_url = $(xabber.current_plyr_player.$audio_elem).find('.file-link-download').attr('href');
                $(xabber.current_plyr_player.$audio_elem).find('.mdi-play').removeClass('no-uploaded')
                xabber.current_plyr_player.$audio_elem.voice_message = this.content.renderVoiceMessage($(xabber.current_plyr_player.$audio_elem).find('.file-container')[0], f_url);
            } else {
                xabber.current_plyr_player.$audio_elem.voice_message.playPause()
            }
        } else
            xabber.current_plyr_player.togglePlay();
        xabber.trigger('plyr_player_updated');
    },

    stopPlyr: function () {
        if (!xabber.current_plyr_player && xabber.plyr_player_popup)
            return;
        xabber.plyr_players.forEach((item) => {
            if (item.$audio_elem){
                if (item.$audio_elem.voice_message)
                    item.$audio_elem.voice_message.stopTime();
            }
        });
        if (xabber.plyr_player_popup)
            xabber.plyr_player_popup.closePopup();
        else {
            xabber.current_plyr_player = null;
            xabber.trigger('plyr_player_updated');
        }
    },

    popupPlyr: function () {
        if (xabber.plyr_player_popup)
            xabber.plyr_player_popup.minimizePopup();
    },

    nextPlyr: function () {
        let player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player);
        if (player_index === -1 && xabber.current_plyr_player.player_item)
            player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player.player_item);
        if (!xabber.current_plyr_player || !(player_index >= 0 && player_index < xabber.current_plyr_player.chat_item.model.plyr_players.length - 1))
            return;
        if (xabber.current_plyr_player.chat_item.model.plyr_players[player_index + 1].$audio_elem){
            let next_item = xabber.current_plyr_player.chat_item.model.plyr_players[player_index + 1];
            if (!next_item.$audio_elem.voice_message){
                let f_url = $(next_item.$audio_elem).find('.file-link-download').attr('href');
                $(next_item.$audio_elem).find('.mdi-play').removeClass('no-uploaded');
                next_item.$audio_elem.voice_message = xabber.current_plyr_player.chat_item.content.renderVoiceMessage($(next_item.$audio_elem).find('.file-container')[0], f_url, xabber.current_plyr_player.chat_item.model);
            } else {
                next_item.$audio_elem.voice_message.play()
            }
        } else{
            if (!xabber.plyr_player_popup){
                xabber.plyr_player_popup = new xabber.PlyrPlayerPopupView({});
                xabber.plyr_player_popup.show({player: xabber.current_plyr_player.chat_item.model.plyr_players[player_index + 1]});
            } else
                xabber.plyr_player_popup.showNewVideo({player: xabber.current_plyr_player.chat_item.model.plyr_players[player_index + 1]});
        }
    },

    previousPlyr: function () {
        let player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player);
        if (player_index === -1 && xabber.current_plyr_player.player_item)
            player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player.player_item);
        if (!xabber.current_plyr_player || !(player_index <= xabber.current_plyr_player.chat_item.model.plyr_players.length && player_index > 0))
            return;
        if (xabber.current_plyr_player.chat_item.model.plyr_players[player_index - 1].$audio_elem){
            let prev_item = xabber.current_plyr_player.chat_item.model.plyr_players[player_index - 1];
            if (!prev_item.$audio_elem.voice_message){
                let f_url = $(prev_item.$audio_elem).find('.file-link-download').attr('href');
                $(prev_item.$audio_elem).find('.mdi-play').removeClass('no-uploaded');
                prev_item.$audio_elem.voice_message = xabber.current_plyr_player.chat_item.content.renderVoiceMessage($(prev_item.$audio_elem).find('.file-container')[0], f_url, xabber.current_plyr_player.chat_item.model);
            } else {
                prev_item.$audio_elem.voice_message.play()
            }
        } else{
            if (!xabber.plyr_player_popup){
                xabber.plyr_player_popup = new xabber.PlyrPlayerPopupView({});
                xabber.plyr_player_popup.show({player: xabber.current_plyr_player.chat_item.model.plyr_players[player_index - 1]});
            } else
                xabber.plyr_player_popup.showNewVideo({player: xabber.current_plyr_player.chat_item.model.plyr_players[player_index - 1]});
        }
    },

    updatePlyrControls: function () {
        this.$('.chat-tool-player').showIf(xabber.current_plyr_player);
        this.$el.switchClass('chat-head-player-enabled', xabber.current_plyr_player);
        if (xabber.current_plyr_player && xabber.current_plyr_player.$audio_elem) {
            if (xabber.current_plyr_player.$audio_elem.voice_message){
                let voice_message = xabber.current_plyr_player.$audio_elem.voice_message;
                this.$('.chat-head-player-type').text(xabber.getString("chat_message_voice"))
                this.$('.btn-play-pause-plyr .mdi-play').hideIf(voice_message.isPlaying());
                this.$('.btn-play-pause-plyr .mdi-pause').hideIf(!voice_message.isPlaying());
                this.$('.btn-play-pause-plyr').switchClass('active-plyr', voice_message.isPlaying());
                // this.$('.btn-play-pause-plyr').switchClass('ground-color-500', voice_message.isPlaying());
                this.$('.btn-previous-plyr').switchClass('before-active-plyr', voice_message.isPlaying());
                let player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player);
                this.$('.btn-next-plyr').switchClass('disabled', !(player_index >= 0 && player_index < xabber.current_plyr_player.chat_item.model.plyr_players.length - 1));
                this.$('.btn-previous-plyr').switchClass('disabled', !(player_index <= xabber.current_plyr_player.chat_item.model.plyr_players.length && player_index > 0));
                this.$('.mdi-player-type-icon').addClass('hidden');
                this.$('.player-poster').addClass('hidden');
                this.$('.voice-message-player-avatar').removeClass('hidden');
                this.$('.voice-message-player-avatar').setAvatar(xabber.current_plyr_player.contact_avatar, 32);
                this.updatePlyrTitle();
                let duration = Math.round(voice_message.getDuration());
                this.$('.chat-head-player-total-time').text(utils.pretty_duration(duration));
                let timerId = setInterval(function() {
                    let cur_time = Math.round(voice_message.getCurrentTime());
                    if (voice_message.isPlaying())
                        this.$('.chat-head-player-current-time').text(utils.pretty_duration(cur_time));
                    else
                        clearInterval(timerId);
                }, 100);
                (xabber.plyr_player_popup) && xabber.plyr_player_popup.$el.addClass('hidden2');
                (xabber.plyr_player_popup) && xabber.plyr_player_popup.$el.closest('#modals').siblings('#' + xabber.plyr_player_popup.$el.data('overlayId')).addClass('hidden2');
            }
        }
        else if (xabber.current_plyr_player) {
            this.$('.chat-head-player-current-time').text(utils.pretty_duration(isNaN(xabber.current_plyr_player.currentTime) ? 0 : parseInt(xabber.current_plyr_player.currentTime)));
            this.$('.chat-head-player-total-time').text(utils.pretty_duration(parseInt(xabber.current_plyr_player.duration)));
            this.updatePlyrTitle();
            let poster = xabber.current_plyr_player.poster;
            if (poster){
                this.$('.mdi-player-type-icon').addClass('hidden');
                this.$('.player-poster').removeClass('hidden');
                this.$('.player-poster').attr("src", poster);
            } else {
                this.$('.mdi-player-type-icon').removeClass('hidden');
                this.$('.player-poster').addClass('hidden');
            }
            this.$('.voice-message-player-avatar').addClass('hidden');
            if (xabber.current_plyr_player.provider != 'html5')
                this.$('.chat-head-player-type').text(xabber.current_plyr_player.provider)
            else
                this.$('.chat-head-player-type').text(xabber.getString("chat_message_video"))
            this.$('.btn-play-pause-plyr .mdi-play').hideIf(xabber.current_plyr_player.playing);
            this.$('.btn-play-pause-plyr .mdi-pause').hideIf(!xabber.current_plyr_player.playing);
            this.$('.btn-play-pause-plyr').switchClass('active-plyr', xabber.current_plyr_player.playing);
            // this.$('.btn-play-pause-plyr').switchClass('ground-color-500', xabber.current_plyr_player.playing);
            this.$('.btn-previous-plyr').switchClass('before-active-plyr', xabber.current_plyr_player.playing);
            let player_index = xabber.current_plyr_player.chat_item.model.plyr_players.indexOf(xabber.current_plyr_player.player_item);
            this.$('.btn-next-plyr').switchClass('disabled', !(player_index >= 0 && player_index < xabber.current_plyr_player.chat_item.model.plyr_players.length - 1));
            this.$('.btn-previous-plyr').switchClass('disabled', !(player_index <= xabber.current_plyr_player.chat_item.model.plyr_players.length && player_index > 0));
            (xabber.plyr_player_popup) && xabber.plyr_player_popup.$el.removeClass('hidden2');
            (xabber.plyr_player_popup) && xabber.plyr_player_popup.$el.closest('#modals').siblings('#' + xabber.plyr_player_popup.$el.data('overlayId')).removeClass('hidden2');
        }
    },

    updatePlyrTime: function () {
        if (xabber.current_plyr_player){
            if (xabber.current_plyr_player && xabber.current_plyr_player.$audio_elem) {
            }
            else if (!isNaN(xabber.current_plyr_player.currentTime))
                this.$('.chat-head-player-current-time').text(utils.pretty_duration(isNaN(xabber.current_plyr_player.currentTime) ? 0 : parseInt(xabber.current_plyr_player.currentTime)));
        }
    },

    updatePlyrTitle: function () {
        if (!xabber.current_plyr_player)
            return
        let $title_elem = this.$('.chat-head-player-title .chat-head-player-title-text'),
            title;
        if (xabber.current_plyr_player && xabber.current_plyr_player.$audio_elem)
            title = xabber.current_plyr_player.author;
        else if (xabber.current_plyr_player)
            title = xabber.current_plyr_player.config.title ?
                xabber.current_plyr_player.config.title :
                xabber.current_plyr_player.provider === 'html5' ?
                    xabber.current_plyr_player.source.substring(xabber.current_plyr_player.source.lastIndexOf('/')+1)
                    : xabber.getString("chat_message_video");
        $title_elem.text(title);
        if (this.$('.chat-head-player-title')[0] && utils.isOverflownWidth(this.$('.chat-head-player-title')[0])){
            $title_elem.addClass('active-animation-player-title');
            $title_elem.text(title + ' ⚫︎︎ ⚫︎︎ ⚫︎︎ ' + title);
        } else
            $title_elem.removeClass('active-animation-player-title');

    },

    setEphemeralTimer: function (ev) {
        this.model.setEphemeralTimer(ev);
    },


    updateJingleButton: function () {
        this.$('.btn-jingle-message').switchClass('active-call', xabber.current_voip_call);
        if (xabber.current_voip_call){
            this.contact.get('group_chat') && this.$('.btn-jingle-message').removeClass('hidden');
            let voip_status = xabber.current_voip_call.get('status');
            if (voip_status)
                this.$('.btn-jingle-message').attr('data-state', voip_status);
            else
                this.$('.btn-jingle-message').attr('data-state', '');
            if (voip_status === 'disconnected')
                this.$('.btn-jingle-message').removeClass('active-call');
        } else if (this.contact.get('group_chat'))
            this.$('.btn-jingle-message').addClass('hidden');
    },

    getActiveScreen: function () {
        let active_screen = xabber.toolbar_view.$('.active');
        this.$('.omemo-item').removeClass('hidden');
        if (active_screen.hasClass('archive-chats')) {
            xabber.toolbar_view.showArchive();
            return;
        }
        if (active_screen.hasClass('all-chats')) {
            xabber.toolbar_view.showAllChats();
            return;
        }
        if (active_screen.hasClass('chats')) {
            xabber.toolbar_view.showChats();
            return;
        }
        if (active_screen.hasClass('group-chats')) {
            xabber.toolbar_view.showGroupChats();
            return;
        }
        if (active_screen.hasClass('account-item')) {
            xabber.toolbar_view.showChatsByAccount();
            return;
        }
    },

    updateGroupChatHead: function () {
        let is_group_chat = this.contact.get('group_chat');
        this.updateIcon();
        this.$('.btn-jingle-message').showIf(!is_group_chat && xabber.get('audio') || xabber.current_voip_call);
        this.$('.btn-jingle-message').hideIf(!xabber.settings.jingle_calls);
        this.$('.contact-status').hideIf(is_group_chat);
        this.updateMenu();
    },

    updateIcon: function () {
        this.$('.chat-icon').addClass('hidden');
        let ic_name = this.contact.getIcon();
        ic_name && this.$('.chat-icon').removeClass('hidden group-invite blocked').switchClass(ic_name, (ic_name == 'group-invite' || ic_name == 'server' || ic_name == 'blocked')).html(env.templates.svg[ic_name]());
    },

    inviteUsers: function () {
        if (!xabber.invite_panel)
            xabber.invite_panel = new xabber.InvitationPanelView({ model: xabber.opened_chats });
        xabber.invite_panel.open(this.account, this.contact);
    },

    clearHistory: function () {
        this.content.clearHistory();
        xabber.chats_view.clearSearch();
    },

    leaveGroupChat: function () {
        this.contact.declineSubscription();
        this.contact.removeFromRoster();
        this.contact.set('in_roster', false);
    },

    closeChat: function () {
        this.model.set({'opened': false, 'display': false, 'active': false});
        xabber.chats_view.clearSearch();
    },

    hideChat: function () {
        this.model.set({'active': false});
        xabber.chats_view.clearSearch();
    },

    deleteChat: function () {
        if (this.contact.get('group_chat')) {
            utils.dialogs.ask(xabber.getString("delete_chat"), xabber.getString("dialog_group_remove__confirm"), null, { ok_button_text: xabber.getString("delete")}).done((result) => {
                if (result) {
                    let scrolled_top = xabber.chats_view.getScrollTop() || 0;
                    (this.account.connection && this.account.connection.do_synchronization) && this.model.deleteFromSynchronization();
                    this.leaveGroupChat();
                    this.closeChat();
                    xabber.body.setScreen('all-chats', {right: undefined, right_contact: null});
                    xabber.chats_view.scrollTo(scrolled_top);
                }
            });
        }
        else {
            let rewrite_support = this.account.server_features.get(Strophe.NS.REWRITE);
            utils.dialogs.ask(xabber.getString("delete_chat"), xabber.getString("delete_chat_dialog_message") +
            (rewrite_support ? "" : `\n${xabber.getString("dialog_clear_chat_history__warning_deletion_not_supported", [this.account.domain]).fontcolor('#E53935')}`), null, { ok_button_text: rewrite_support? xabber.getString("delete") : xabber.getString("dialog_clear_chat_history__button_delete_locally")}).done((result) => {
                if (result) {
                    let scrolled_top = xabber.chats_view.getScrollTop() || 0;
                    if (rewrite_support) {
                        this.model.retractAllMessages(false);
                    }
                    if (this.account.connection && this.account.connection.do_synchronization) {
                        this.model.deleteFromSynchronization();
                    }
                    else {
                        let all_messages = this.model.messages.models;
                        $(all_messages).each((idx, item) => {
                            this.content.removeMessage(item);
                        });
                    }
                    this.closeChat();
                    xabber.body.setScreen('all-chats', {right: undefined, right_contact: null});
                    xabber.chats_view.scrollTo(scrolled_top);
                }
            });
        }
    },

    deleteContact: function () {
        this.contact.deleteWithDialog();
    },

    blockContact: function () {
        this.contact.blockWithDialog();
    },

    unblockContact: function () {
        this.contact.unblockWithDialog();
    },

    exportHistory: function () {

    },

    showFingerprints: function () {
        if (!this.account.omemo)
            return;
        let peer = this.account.omemo.getPeer(this.contact.get('jid'));
        peer.fingerprints.open();
    },

    startEncryptedChat: function () {
        this.account.chats.openChat(this.contact, {encrypted: true});
        let chat = this.account.chats.get(this.contact.hash_id + ':encrypted');
        chat.set('timestamp', moment.now());
        chat.item_view.updateLastMessage();
    },

    openEncryptedChat: function () {
        this.model.set('opened', true);
        this.account.chats.openChat(this.contact, {encrypted: true});
    },

    openRegularChat: function () {
        this.model.set('opened', true);
        this.account.chats.openChat(this.contact);
    }
});


  xabber.SendMediaView = xabber.BasicView.extend({
      className: 'modal main-modal avatar-picker background-panel',
      template: templates.send_media,
      ps_selector: '.modal-content',
      ps_settings: {theme: 'item-list'},

      events: {
          "click .menu-btn": "updateActiveMenu",
          "click .library-wrap .image-item": "setActiveImage",
          'change input[type="file"]': "onFileInputChanged",
          'keyup input.url': "onInputChanged",
          "click .btn-add": "addMedia",
          "click .btn-cancel": "close"
      },

      _initialize: function () {
          this.$('input.url')[0].onpaste = this.onPaste.bind(this);
      },

      render: function (options) {
          this.model = options.model;
          this.parent = options.parent;
          this.createLibrary();
          this.$('.menu-btn').removeClass('active');
          this.$('.menu-btn[data-screen-name="upload"]').addClass('active');
          this.$('.modal-header span').text(xabber.getString("chat_bottom__tooltip_add_media"));
          this.$el.openModal({
              ready: () => {
                  this.$('.modal-content').perfectScrollbar({theme: 'item-list'});
              },
              complete: this.close.bind(this)
          });
          let draggable = this.$('.upload-wrap');
          draggable[0].ondragenter = function (ev) {
              ev.preventDefault();
              draggable.addClass('file-drop');
          };
          draggable[0].ondragover = function (ev) {
              ev.preventDefault();
          };
          draggable[0].ondragleave = function (ev) {
              if ($(ev.relatedTarget).closest('.upload-wrap').length)
                  return;
              ev.preventDefault();
              draggable.removeClass('file-drop');
          };
          draggable[0].ondrop = (ev) => {
              ev.preventDefault();
              ev.stopPropagation();
              draggable.removeClass('file-drop');
              let files = ev.dataTransfer.files || [];
              this.parent.view.addFileMessage(files);
              this.close();
          };
      },

      onPaste: function (ev) {
          let url = ev.clipboardData.getData('text').trim();
          this.$('.image-preview img')[0].onload = () => {
              this.$('.image-preview img').removeClass('hidden');
              this.updateActiveButton();
          };
          this.$('.image-preview img').addClass('hidden')[0].src = url;
          this.updateActiveButton();
      },

      updateActiveMenu: function (ev) {
          let screen_name = ev.target.getAttribute('data-screen-name');
          this.$('.menu-btn').removeClass('active');
          this.$(`.menu-btn[data-screen-name="${screen_name}"]`).addClass('active');
          this.updateScreen(screen_name);
      },

      updateScreen: function (name) {
          this.$('.screen-wrap').addClass('hidden');
          this.$(`.screen-wrap[data-screen="${name}"]`).removeClass('hidden');
          this.scrollToTop();
          this.updateActiveButton();
      },

      updateActiveButton: function () {
          let $active_screen = this.$('.screen-wrap:not(.hidden)'),
              non_active = true;
          if ($active_screen.attr('data-screen') == 'image' || $active_screen.attr('data-screen') == 'video') {
              $active_screen.find('div.active').length && (non_active = false);
          } else {
              $active_screen.find('img:not(.hidden)').length && (non_active = false);
          }
          this.$('.modal-footer .btn-add').switchClass('non-active', non_active);
      },

      renderFiles: function (response) {
          this.$(`.library-wrap[data-screen="${response.type}"] .preloader-wrapper`).remove()
          if (response.items.length){
              response.items.forEach((item) => {
                  let img = $(`<div class="image-item"/>`);
                  img.css('background-image', `url("${item.thumbnail.url}")`);
                  img.attr('data-src', item.file);
                  img.attr('data-name', item.name);
                  this.$(`.library-wrap[data-screen="${response.type}"]`).append(img);
              });
          }
      },

      createLibrary: function () {
          this.model.testGalleryTokenExpire(() => {
              if (this.model.get('gallery_token') && this.model.get('gallery_url')) {
                  this.$('.library-wrap').html(env.templates.contacts.preloader())
                  $.ajax({
                      type: 'GET',
                      headers: {"Authorization": 'Bearer ' + this.model.get('gallery_token')},
                      url: this.model.get('gallery_url') + 'v1/files/',
                      dataType: 'json',
                      contentType: "application/json",
                      data: {obj_per_page: 50, order_by: '-id', type: 'image'},
                      success: (response) => {
                          console.log(response)
                          response.type = 'image'
                          this.renderFiles(response)
                      },
                      error: (response) => {
                          this.model.handleCommonGalleryErrors(response)
                          console.log(response)
                          this.$('.library-wrap[data-screen="image"] .preloader-wrapper').remove()
                      }
                  });
                  $.ajax({
                      type: 'GET',
                      headers: {"Authorization": 'Bearer ' + this.model.get('gallery_token')},
                      url: this.model.get('gallery_url') + 'v1/files/',
                      dataType: 'json',
                      contentType: "application/json",
                      data: {obj_per_page: 50, order_by: '-id', type: 'video'},
                      success: (response) => {
                          console.log(response)
                          response.type = 'video'
                          this.renderFiles(response)
                      },
                      error: (response) => {
                          this.model.handleCommonGalleryErrors(response)
                          console.log(response)
                          this.$('.library-wrap[data-screen="video"] .preloader-wrapper').remove()
                      }
                  });
              }
          });
      },

      setActiveImage: function (ev) {
          let $target = $(ev.target),
              $active_screen = this.$('.screen-wrap:not(.hidden)');
          if ($target.hasClass('active'))
              $target.removeClass('active');
          else {
              this.$('.library-wrap>div').removeClass('active');
              $target.addClass('active');
          }
          this.updateActiveButton();
      },

      onFileInputChanged: function (ev) {
          let target = ev.target,
              files = [];
          for (let i = 0; i < target.files.length; i++) {
              files.push(target.files[i]);
          }

          if (files && files.length) {
              this.parent.view.addFileMessage(files);
              $(target).val('');
              this.close();
          }
      },

      onInputChanged: function (ev) {
          if (ev.target.value.trim() == this.$('.image-preview img')[0].src)
              return;
          if (ev.target.value.trim() && ev.keyCode !== constants.KEY_CTRL && ev.keyCode !== constants.KEY_SHIFT && ev.keyCode !== constants.KEY_ARROW_UP && ev.keyCode !== constants.KEY_ARROW_DOWN && ev.keyCode !== constants.KEY_ARROW_RIGHT && ev.keyCode !== constants.KEY_ARROW_LEFT) {
              let url = ev.target.value.trim();
              this.$('.image-preview img')[0].onload = () => {
                  this.$('.image-preview img').removeClass('hidden');
                  this.updateActiveButton();
              };
              this.$('.image-preview img').addClass('hidden')[0].src = url;
              this.updateActiveButton();
          } else {
              this.$('.image-preview img').addClass('hidden')[0].src = "";
              this.updateActiveButton();
          }
      },

      addMedia: function () {
          if (this.$('.btn-add').hasClass('non-active'))
              return;
          let file, filename, dfd = new $.Deferred(), $active_screen = this.$('.screen-wrap:not(.hidden)');
          dfd.done((resolved_file) => {
              this.parent.view.addFileMessage([resolved_file])
              this.close();
          });
          this.$('.modal-preloader-wrap').html(env.templates.contacts.preloader());
          this.$('.btn-add').addClass('hidden-disabled');
          if ($active_screen.attr('data-screen') == 'image' || $active_screen.attr('data-screen') == 'video' || $active_screen.attr('data-screen') == 'web-address') {
              file = $active_screen.attr('data-screen') == 'image' || $active_screen.attr('data-screen') == 'video' ?
                  $active_screen.find('div.active').attr('data-src') :
                  $active_screen.find('img:not(.hidden)')[0].src;
              filename = $active_screen.attr('data-screen') == 'image' || $active_screen.attr('data-screen') == 'video' ?
                  $active_screen.find('div.active').attr('data-name') : '';

              this.createFileFromURL(file, filename).then((file) => {
                  dfd.resolve(file);
              })
          } else
              dfd.resolve(this.current_file);
      },

      createFileFromURL: async function (url, filename) {
          let response = await fetch(url);
          let data = await response.blob();
          let metadata = {
              type: data.type
          };
          let file = new File([data], filename || url.split('#').shift().split('?').shift().split('/').pop() || 'file', metadata);
          return file
      },

      close: function () {
          this.$el.closeModal({ complete: () => {
                  this.$el.detach();
                  this.data.set('visible', false);
              }
          });
      }
  });

xabber.ChatLocationView = xabber.BasicView.extend({
    className: 'modal main-modal chat-location ',
    template: templates.location_popup,

    events: {
        "click .btn-cancel": "close",
        "click .btn-apply": "sendLocation",
        "click #map canvas": "closeLocationName",
        "click .nominatim.ol-search input": "initializeScrollbar",
        "focusout .nominatim.ol-search input": "destroyScrollbar",
    },

    _initialize: function (options) {
        this.view = options.content;
        this.model = this.view.model;
        this.account = this.view.account;

    },

    render: function () {
        this.$el.openModal({
            ready: () => {
                this.initMap();
                Materialize.updateTextFields();
            },
            complete: this.hide.bind(this)
        });
    },

    initMap: function () {
        import('ol-local').then(ol => {
            ol = ol.default ? ol.default : ol;
            this.$el.find('.modal-content').switchClass('popup', xabber.popup_coordinates);

            let layers = [ new ol.layer.Tile({ source: new ol.source.OSM() }) ],
                coordinates = xabber.popup_coordinates ? ol.proj.transform(xabber.popup_coordinates, 'EPSG:4326', 'EPSG:3857') : [-9639318.435625363, 1667475.03690917],
                zoom = xabber.popup_coordinates ? 15 : 0,
                placemark = new ol.Overlay.Placemark ({
                    // backgroundColor : 'yellow',
                    contentColor: '#000',
                    autoPan: true,
                    html: '<?xml version="1.0" encoding="UTF-8"?><svg width="48px" height="48px" viewBox="0 0 24 30" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><g id="icon/material/map-marker" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd"><rect id="ViewBox" fill-rule="nonzero" x="0" y="0" width="36" height="36"></rect><path d="M12,11.5 C10.6192881,11.5 9.5,10.3807119 9.5,9 C9.5,8.33695878 9.7633921,7.70107399 10.232233,7.23223305 C10.701074,6.7633921 11.3369588,6.5 12,6.5 C13.3807119,6.5 14.5,7.61928813 14.5,9 C14.5,9.66304122 14.2366079,10.298926 13.767767,10.767767 C13.298926,11.2366079 12.6630412,11.5 12,11.5 M12,2 C8.13400675,2 5,5.13400675 5,9 C5,14.25 12,22 12,22 C12,22 19,14.25 19,9 C19,5.13400675 15.8659932,2 12,2 Z" id="mdi:map-marker" fill="#000000" fill-rule="nonzero"></path></g></svg>',
                    anchor: false,
                    autoPanAnimation: { duration: 250 }
                }),
                placemark_my_location = new ol.Overlay.Placemark ({
                    // backgroundColor : 'yellow',
                    contentColor: '#000',
                    autoPan: true,
                    html: '<svg xmlns="http://www.w3.org/2000/svg" version="1.1" width="36px" height="36px"><circle class="outer" cx="20" cy="20" r="16" stroke="none" stroke-width="1.5" fill="none" style="opacity: 0.6;"></circle><circle class="inner" cx="20" cy="20" r="8" stroke="white" stroke-width="1.5" fill="none"></circle></svg>',
                    anchor: false,
                    autoPanAnimation: { duration: 250 }
                });

            let map = new ol.Map
            ({	target: 'map',
                view: new ol.View
                ({	zoom: zoom,
                    center: coordinates
                }),
                interactions: ol.interaction_defaults({ altShiftDragRotate:false, pinchRotate:false }),
                layers: layers,
                overlays: [placemark, placemark_my_location]
            });

            let getCurrentPositionControl = function (e) {
                navigator.geolocation.getCurrentPosition(success, error, options);
            };

            let options = {
                enableHighAccuracy: true,
                timeout: 5000,
                maximumAge: 0
            };

            function success(pos) {
                let crd = pos.coords;
                map.getView().setCenter(ol.proj.transform([crd.longitude, crd.latitude], 'EPSG:4326', 'EPSG:3857'));
                placemark_my_location.show(ol.proj.transform([crd.longitude, crd.latitude], 'EPSG:4326', 'EPSG:3857'));
                map.getView().setZoom(17);
                button_geoposition.innerHTML = '<?xml version="1.0" encoding="UTF-8"?><svg width="22px" height="22px" viewBox="0 0 24 24" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><g id="icon/material/crosshairs-gps" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd"><rect id="ViewBox" fill-rule="nonzero" x="0" y="0" width="22" height="22"></rect><path d="M12,8 C14.209139,8 16,9.790861 16,12 C16,14.209139 14.209139,16 12,16 C9.790861,16 8,14.209139 8,12 C8,9.790861 9.790861,8 12,8 M3.05,13 L1,13 L1,11 L3.05,11 C3.5,6.83 6.83,3.5 11,3.05 L11,1 L13,1 L13,3.05 C17.17,3.5 20.5,6.83 20.95,11 L23,11 L23,13 L20.95,13 C20.5,17.17 17.17,20.5 13,20.95 L13,23 L11,23 L11,20.95 C6.83,20.5 3.5,17.17 3.05,13 M12,5 C8.13400675,5 5,8.13400675 5,12 C5,15.8659932 8.13400675,19 12,19 C15.8659932,19 19,15.8659932 19,12 C19,8.13400675 15.8659932,5 12,5 L12,5 Z" id="mdi:crosshairs-gps" fill="#9E9E9E" fill-rule="nonzero"></path></g></svg>';
            };

            function error(err) {
                console.warn(`ERROR(${err.code}): ${err.message}`);
            };

            let button_geoposition = document.createElement('button');
            button_geoposition.innerHTML = '<?xml version="1.0" encoding="UTF-8"?><svg width="22px" height="22px" viewBox="0 0 24 24" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><g id="icon/material/crosshairs-question" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd"><rect id="ViewBox" fill-rule="nonzero" x="0" y="0" width="22" height="22"></rect><path d="M3.05,13 L1,13 L1,11 L3.05,11 C3.5,6.83 6.83,3.5 11,3.05 L11,1 L13,1 L13,3.05 C17.17,3.5 20.5,6.83 20.95,11 L23,11 L23,13 L20.95,13 C20.5,17.17 17.17,20.5 13,20.95 L13,23 L11,23 L11,20.95 C6.83,20.5 3.5,17.17 3.05,13 M12,5 C8.13,5 5,8.13 5,12 C5,15.87 8.13,19 12,19 C15.87,19 19,15.87 19,12 C19,8.13 15.87,5 12,5 M11.13,17.25 L12.88,17.25 L12.88,15.5 L11.13,15.5 L11.13,17.25 M12,6.75 C10.07,6.75 8.5,8.32 8.5,10.25 L10.25,10.25 C10.25,9.28 11.03,8.5 12,8.5 C12.97,8.5 13.75,9.28 13.75,10.25 C13.75,12 11.13,11.78 11.13,14.63 L12.88,14.63 C12.88,12.66 15.5,12.44 15.5,10.25 C15.5,8.32 13.93,6.75 12,6.75 Z" id="mdi:crosshairs-question" fill="#9E9E9E" fill-rule="nonzero"></path></g></svg>';


            button_geoposition.addEventListener('click', getCurrentPositionControl, false);

            let custom_element_position = document.createElement('div');

            if (xabber.popup_coordinates) {
                custom_element_position.className = 'geoposition placemark-exist ol-control ol-unselectable';
            }
            else {
                custom_element_position.className = 'geoposition ol-control ol-unselectable';
            }
            custom_element_position.appendChild(button_geoposition);

            let geoposition = new ol.control.Control({
                className: 'myControl',
                element: custom_element_position,
                target: document.getElementById("myCustomControl")
            });

            map.addControl(geoposition);

            if (xabber.popup_coordinates) {
                placemark.show(ol.proj.transform(xabber.popup_coordinates, 'EPSG:4326', 'EPSG:3857'));
                $('.ol-zoom.ol-unselectable.ol-control').addClass('placemark-exist');
                let getPlacemarkPositionControl = function (e) {
                    map.getView().setCenter(ol.proj.transform(xabber.popup_coordinates, 'EPSG:4326', 'EPSG:3857'));
                    map.getView().setZoom(15);
                    $('.ol-location').show()

                };

                let button_placemark_position = document.createElement('button');
                button_placemark_position.innerHTML = '<?xml version="1.0" encoding="UTF-8"?><svg width="22px" height="22px" viewBox="0 0 24 24" version="1.1" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><g id="icon/material/map-marker" stroke="none" stroke-width="1" fill="none" fill-rule="evenodd"><rect id="ViewBox" fill-rule="nonzero" x="0" y="0" width="36" height="36"></rect><path d="M12,11.5 C10.6192881,11.5 9.5,10.3807119 9.5,9 C9.5,8.33695878 9.7633921,7.70107399 10.232233,7.23223305 C10.701074,6.7633921 11.3369588,6.5 12,6.5 C13.3807119,6.5 14.5,7.61928813 14.5,9 C14.5,9.66304122 14.2366079,10.298926 13.767767,10.767767 C13.298926,11.2366079 12.6630412,11.5 12,11.5 M12,2 C8.13400675,2 5,5.13400675 5,9 C5,14.25 12,22 12,22 C12,22 19,14.25 19,9 C19,5.13400675 15.8659932,2 12,2 Z" id="mdi:map-marker" fill="#9E9E9E" fill-rule="nonzero"></path></g></svg>';


                button_placemark_position.addEventListener('click', getPlacemarkPositionControl, false);

                let custom_element_placemark_position = document.createElement('div');
                custom_element_placemark_position.className = 'placemark-position ol-control ol-unselectable';
                custom_element_placemark_position.appendChild(button_placemark_position);

                let placemark_position = new ol.control.Control({
                    className: 'myControl',
                    element: custom_element_placemark_position,
                    target: document.getElementById("myCustomControl")
                });

                map.addControl(placemark_position);

                let custom_element_show_location_name = document.createElement('div');
                custom_element_show_location_name.innerHTML = xabber.location_name || '';


                custom_element_show_location_name.className = 'ol-location ol-control ol-unselectable';

                let show_location_name = new ol.control.Control({
                    className: 'myControl',
                    element: custom_element_show_location_name,
                    target: document.getElementById("myCustomControl")
                });

                map.addControl(show_location_name);

            }

            if (!xabber.popup_coordinates) {

                let send_buttom = document.createElement('button');
                send_buttom.className = 'btn-apply mdi mdi-28px mdi-send';

                let send_address_div = document.createElement('div');
                send_address_div.setAttribute("id", "send_address");
                send_address_div.className = 'ol-send-address';

                let send_div = document.createElement('div');
                send_div.setAttribute("id", "send_text");
                send_div.className = 'ol-send-text';

                let custom_element_send = document.createElement('div');
                custom_element_send.className = 'ol-send ol-control ol-unselectable';
                custom_element_send.appendChild(send_address_div);
                custom_element_send.appendChild(send_div);
                custom_element_send.appendChild(send_buttom);

                let send = new ol.control.Control({
                    className: 'myControl',
                    element: custom_element_send,
                    target: document.getElementById("myCustomControl")
                });

                map.addControl(send);

                let sLayer = new ol.layer.Vector({
                    source: new ol.source.Vector(),
                    style: new ol.style.Style({
                        image: new ol.style.Circle({
                            radius: 5,
                            stroke: new ol.style.Stroke ({
                                color: 'rgb(255,165,0)',
                                width: 3
                            }),
                            fill: new ol.style.Fill({
                                color: 'rgba(255,165,0,.3)'
                            })
                        }),
                        stroke: new ol.style.Stroke ({
                            color: 'rgb(255,165,0)',
                            width: 3
                        }),
                        fill: new ol.style.Fill({
                            color: 'rgba(255,165,0,.3)'
                        })
                    })
                });

                map.addLayer(sLayer);

                let search = new ol.control.SearchNominatim (
                    {	//target: $(".options").get(0),
                        polygon: $("#polygon").prop("checked"),
                        reverse: true,
                        position: true	// Search, with priority to geo position
                    });

                map.addControl (search);

                search.on('select', function(e){
                    sLayer.getSource().clear();
                    // Check if we get a geojson to describe the search
                    if (e.search.geojson) {
                        let format = new ol.format.GeoJSON();
                        let f = format.readFeature(e.search.geojson, { dataProjection: "EPSG:4326", featureProjection: map.getView().getProjection() });
                        sLayer.getSource().addFeature(f);
                        let view = map.getView();
                        let resolution = view.getResolutionForExtent(f.getGeometry().getExtent(), map.getSize());
                        let zoom = view.getZoomForResolution(resolution);
                        let center = ol.extent.getCenter(f.getGeometry().getExtent());
                        // redraw before zoom
                        setTimeout(function(){
                            view.animate({
                                center: center,
                                zoom: Math.min (zoom, 16)
                            });
                        }, 100);
                    }
                    else {
                        map.getView().animate({
                            center:e.coordinate,
                            zoom: Math.max (map.getView().getZoom(),16)
                        });
                    }
                });

                function reverseGeocode(json) {
                    if (!json[0].error) {
                        let house_number = json[0].address.house_number ? ' ' + json[0].address.house_number : '',
                            road = json[0].address.road ? json[0].address.road + house_number + ', ' : '',
                            state = json[0].address.state ? json[0].address.state + ', ' : '',
                            neighbourhood = json[0].address.neighbourhood ? json[0].address.neighbourhood + ', ' : '',
                            allotments = json[0].address.allotments ? json[0].address.allotments + ', ' : '',
                            village = json[0].address.village ? json[0].address.village + ', ' : '',
                            city = json[0].address.city ? json[0].address.city + ', ' : '',
                            country = json[0].address.country ? state + json[0].address.country : '',
                            final_text = ''
                        if ( !road ){
                            final_text = neighbourhood + allotments + village + city + country
                        }
                        else {
                            final_text = road + neighbourhood + allotments + village + city + state.replace(', ','')
                        }
                        $('#send_address').text(final_text);
                    }
                    else {
                        $('#send_address').text(xabber.getString("location_fragment__address_error__title"));
                    }
                }

                map.on('click', function(e) {
                    placemark.show(e.coordinate);
                    search.reverseGeocode(e.coordinate, reverseGeocode);
                    let coordinates = ol.proj.transform(e.coordinate, map.getView().getProjection(), 'EPSG:4326');
                    $('.ol-control.ol-send').show();
                    $('#send_text').text(coordinates[1].toFixed(6) + ':' + coordinates[0].toFixed(6));
                    $('#output').text('geo:' + coordinates[1] + ',' + coordinates[0]);
                    $('#lat').text(coordinates[1]);
                    $('#lon').text(coordinates[0]);
                });
            }
            window.setTimeout(function () { map.updateSize(); }, 200)
        });
    },

    sendLocation: function (e) {
        if (this.$('#output').val()) {
            let body = this.$('#output').val(),
                legacy_body = '',
                start_idx = legacy_body.length,
                end_idx = (body + legacy_body).length,
                lat = this.$('#lat').val(),
                lon = this.$('#lon').val(),
                locations = [{
                        lat: lat,
                        lon: lon
                    }],
                mutable_content = [{
                    start: start_idx,
                    end: end_idx,
                    type: 'geolocation'
                    }],
                attrs = {
                    from_jid: this.account.get('jid'),
                    locations: locations,
                    mutable_content: mutable_content,
                    message: this.$('#output').val(),
                    begin: start_idx,
                    end: end_idx
                },
                message = this.model.messages.create(attrs),
                msg_id = message.get('msgid'),
                stanza = $msg({
                    to: this.model.get('jid'),
                    type: 'chat',
                    id: msg_id
                });
            stanza.c('markable').attrs({'xmlns': Strophe.NS.CHAT_MARKERS}).up();
            stanza.c('origin-id', {id: msg_id, xmlns: 'urn:xmpp:sid:0'}).up();
            stanza.c('reference', {
                xmlns: Strophe.NS.REFERENCE,
                type: 'mutable',
                begin: start_idx,
                end: end_idx
            }).c('geoloc', {
                xmlns: Strophe.NS.GEOLOC,
            }).c('lat').t(lat).up().c('lon').t(lon).up().up().up();
            stanza.c('body').t(body).up();
            if (this.model.get('encrypted') && this.account.omemo) {
                stanza.c('envelope', {xmlns: Strophe.NS.SCE}).c('content')
                if ($(stanza.tree()).children('body').length) {
                    stanza.cnode($(stanza.tree()).children('body')[0]).attrs({'xmlns': Strophe.NS.CLIENT}).up()
                    $(stanza.tree()).children('body').detach()
                }
                if ($(stanza.tree()).children('reference').length) {
                    $(stanza.tree()).children('reference').each((idx, reference) => {
                        stanza.cnode($(stanza.tree()).children('reference')[idx]).up()
                    });
                    $(stanza.tree()).children('reference').detach()
                }
                stanza.up().c('rpad').t('0'.repeat(200).slice(1, Math.floor((Math.random() * 198) + 1))).up()
                stanza.c('from', {jid: this.account.get('jid')}).up().up()
                message.set({xml: $(stanza.tree()).clone()[0]});
                this.account.omemo.encrypt(this.model.contact, stanza).then((msg) => {
                    if (msg) {
                        stanza = msg.message;
                        message.set('trusted', msg.is_trusted);
                    }
                    this.account.sendMsg(stanza);
                });
            } else {
                message.set({xml: $(stanza.tree()).clone()[0]});
                this.account.sendMsg(stanza);
            }
        }
        this.close();
    },

    closeLocationName: function (e) {
        this.$el.find('.ol-location').hide()
    },

    onHide: function () {
        this.$el.detach();
    },

    close: function () {
        this.$el.closeModal({ complete: this.hide.bind(this) });
    },

    initializeScrollbar: function () {
        this.ps_container = this.$('.nominatim.ol-search');
        this.ps_container.perfectScrollbar(
            _.extend(this.ps_settings || {}, xabber.ps_settings)
        );
    },

    destroyScrollbar: function () {
        this.ps_container = this.$('.nominatim.ol-search');
        this.ps_container.perfectScrollbar('destroy');
    },
});

xabber.ChatBottomView = xabber.BasicView.extend({
    className: 'chat-bottom-wrap',
    ps_selector: '.message-reference-preview-container',
    template: templates.chat_bottom,
    avatar_size: constants.AVATAR_SIZES.CHAT_BOTTOM,
    mention_avatar_size: constants.AVATAR_SIZES.MENTION_ITEM,

    events: {
        "click": "onClickBottom",
        "click .ql-editor": "focusOnInput",
        "click .my-avatar": "showAccountSettings",
        "keyup .input-message .rich-textarea": "keyUp",
        "keydown .input-message .rich-textarea": "keyDown",
        "change .attach-file input": "onFileInputChanged",
        "click .attach-location": "showLocationPopup",
        "click .attach-media": "showMediaPopup",
        "mouseup .message-input-panel": "stopWritingVoiceMessage",
        "mousedown .attach-voice-message": "writeVoiceMessage",
        "click .chat-mention": "onMentionButtonClick",
        "click .close-forward": "unsetForwardedMessages",
        "click .close-attachments": "removeAttachments",
        "click .send-message": "submit",
        "click .markup-text": "onShowMarkupPanel",
        "click .reply-message": "replyMessages",
        "click .forward-message": "forwardMessages",
        "click .pin-message": "pinMessage",
        "click .copy-message": "copyMessages",
        "click .edit-message": "showEditPanel",
        "click .delete-message": "deleteMessages",
        "click .close-message-panel": "resetSelectedMessages",
        "click .mention-item": "inputMention",
        "click .format-text": "updateMarkupPanel",
        "click .link-message-reference .mdi-close": "removeLinkReference",
        "click .preview-preloader-container .preview-cancel-preloader": "stopLoadingLinkReference",
        "click .message-reference-preview-item-file .mdi-close": "removeFileSnippet",
        "click .btn-manage-devices": "openDevicesWindow",
        "click .ephemeral-timer-time": "showEphemeralTimerSelector",
    },

    _initialize: function (options) {
        this.view = options.content;
        this.model = this.view.model;
        this.click_counter = 0;
        let rich_textarea_wrap = this.$('.rich-textarea-wrap');
        let bindings = {
            enter: {
                key: 13,
                handler: function(range) {
                    if (xabber.settings.hotkeys !== "enter")
                        this.quill.insertText(range.index, "\n");
                }
            },
            arrow_up: {
                key: constants.KEY_ARROW_UP,
                handler: (range) => {
                    if (this.$('.mentions-list').css('display') !== 'none') {
                        let active_item = this.$('.mentions-list').children('.active.mention-item');
                        if (active_item.length)  {
                            let $prev_elem = active_item.prev('.mention-item');
                            active_item.removeClass('active');
                            if (!$prev_elem.length) {
                                $prev_elem = this.$('.mentions-list').children('.mention-item').last().addClass('active');
                                this.$('.mentions-list')[0].scrollTop = this.$('.mentions-list')[0].scrollHeight;
                            }
                            $prev_elem.addClass('active');
                            if ($prev_elem.length && ($prev_elem[0].offsetTop <= this.$('.mentions-list')[0].scrollTop))
                                this.$('.mentions-list')[0].scrollTop = $prev_elem[0].offsetTop;
                        }
                        else {
                            this.$('.mentions-list')[0].scrollTop = this.$('.mentions-list')[0].scrollHeight;
                            this.$('.mentions-list').children('.mention-item').last().addClass('active');
                        }
                        return false;
                    }
                    else
                        return true;
                }
            },
            arrow_down: {
                key: constants.KEY_ARROW_DOWN,
                handler: (range) => {
                    if (this.$('.mentions-list').css('display') !== 'none') {
                        let active_item = this.$('.mentions-list').children('.active.mention-item');
                        if (active_item.length) {
                            let $next_elem = active_item.next('.mention-item');
                            active_item.removeClass('active');
                            if (!$next_elem.length) {
                                $next_elem = this.$('.mentions-list').children('.mention-item').first();
                                this.$('.mentions-list')[0].scrollTop = 0;
                            }
                            $next_elem.addClass('active');
                            if ($next_elem.length && ($next_elem[0].offsetTop + $next_elem[0].clientHeight >= this.$('.mentions-list')[0].scrollTop + this.$('.mentions-list')[0].clientHeight))
                                this.$('.mentions-list')[0].scrollTop = $next_elem[0].offsetTop - this.$('.mentions-list')[0].clientHeight + $next_elem[0].clientHeight;
                        }
                        else {
                            this.$('.mentions-list')[0].scrollTop = 0;
                            this.$('.mentions-list').children('.mention-item').first().addClass('active');
                        }
                        return false;
                    }
                    else
                        return true;
                }
            },
            arrow_left: {
                key: constants.KEY_ARROW_LEFT,
                handler: (range) => {
                    if (this.$('.mentions-list').css('display') !== 'none')
                        return false;
                    else
                        return true;
                }
            },
            arrow_right: {
                key: constants.KEY_ARROW_RIGHT,
                handler: (range) => {
                    if (this.$('.mentions-list').css('display') !== 'none')
                        return false;
                    else
                        return true;
                }
            }
        };
        this.quill = new Quill(rich_textarea_wrap[0], {
            modules: {
                keyboard: {
                    bindings: bindings
                },
                toolbar: [
                    ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                    this.model.get('group_chat') ? ['mention'] : [],
                    ['clean']
                ]
            },
            formats: ['bold', 'italic', 'underline', 'strike', 'blockquote', 'clean', 'emoji', 'mention'],
            placeholder: xabber.getString(this.model.get('encrypted') ? "chat_bottom__hint_default_encrypted" : "chat_bottom__hint_default"),
            scrollingContainer: '.rich-textarea',
            theme: 'snow'
        });
        this.quill.container.firstChild.classList.add('rich-textarea');
        this.$('.ql-mention').prop('disabled', true);
        this.$('.ql-mention').append('<div class="chat-mention" ="">@</div>');
        this.contact = this.view.contact;
        this.account = this.view.account;
        this.fwd_messages = [];
        this.edit_message = null;
        this.stopped_loading_link_reference = false;
        this.link_references = [];
        this.link_reference_exempted = [];
        this.currently_loaded_link_references = [];
        this.attached_files = [];
        this.loading_link_reference = false;
        this.$('.account-jid').text(this.account.get('jid'));
        this.updateAvatar();
        this.quill.on("text-change", this.onChangedText, this);
        this.account.on("change:image", this.updateAvatar, this);
        this.account.on('trusting_updated', this.updateEncrypted, this);
        if (this.contact) {
            this.contact.on("change:blocked", this.onBlockedUpdate, this);
            this.contact.on('update_my_info', this.updateInfoInBottom, this);
        }
        this.model.on("change:chat_ephemeral_timer", this.updateEphemeralTimer, this);
        this.model.on("reply_selected_messages", this.replyMessages, this);
        this.model.on("forward_selected_messages", this.forwardMessages, this);
        this.model.on("copy_selected_messages", this.copyMessages, this);
        this.model.on("delete_selected_messages", this.deleteMessages, this);
        this.model.on("edit_selected_message", this.showEditPanel, this);
        this.model.on("pin_selected_message", this.pinMessage, this);
        this.model.on("reset_selected_messages", this.resetSelectedMessages, this);
        this.content_view = (this.view.data.get('visible') ? this.view : this.model.messages_view) || this.view;
        let $rich_textarea = this.$('.input-message .rich-textarea'),
            rich_textarea = $rich_textarea[0],
            $rich_textarea_wrap = $rich_textarea.parent('.rich-textarea-wrap'),
            $placeholder = $rich_textarea.siblings('.placeholder');
        rich_textarea.onpaste = this.onPaste.bind(this);
        rich_textarea.oncut = this.onCut.bind(this);
        rich_textarea.ondragenter = (ev) => {
            ev.preventDefault();
            $placeholder.text(xabber.getString("chat_bottom__drag_and_drop__text_drop_files_here"));
            $rich_textarea_wrap.addClass('file-drop');
        };
        rich_textarea.ondragover = (ev) => {
            ev.preventDefault();
        };
        rich_textarea.ondragleave = (ev) => {
            if ($(ev.relatedTarget).closest('.rich-textarea').length)
                return;
            ev.preventDefault();
            $placeholder.text(xabber.getString("chat_bottom__hint_default"));
            $rich_textarea_wrap.removeClass('file-drop');
        };
        rich_textarea.ondrop = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            $placeholder.text(xabber.getString("chat_bottom__hint_default"));
            $rich_textarea_wrap.removeClass('file-drop');
            let files = ev.dataTransfer.files || [];
            this.view.addFileMessage(files);
        };
        let $insert_emoticon = this.$('.insert-emoticon'),
            $emoji_panel_wrap = this.$('.emoticons-panel-wrap'),
            $emoji_panel = this.$('.emoticons-panel'),
            _timeout;

        let onloaded_sprites = 0,
            i = 0,
            all_sprites = Object.keys(Emoji.all).length;
        for (let emoji_list in Emoji.all) {
            let $emoji_list_wrap = $(`<div class="emoji-list-wrap"/>`);
            $(`<div id=${emoji_list} class="emoji-list-header">${xabber.getString(constants.EMOJI_LIST_NAME(emoji_list))}</div>`).appendTo($emoji_list_wrap);
            _.each(Emoji.all[emoji_list], function (emoji) {
                $('<div class="emoji-wrap"/>').html(
                    emoji.emojify({emoji_size: 24, sprite: emoji_list})
                ).appendTo($emoji_list_wrap);
            });
            $emoji_list_wrap.appendTo($emoji_panel);
            $emoji_panel.siblings('.emoji-menu').append(Emoji.all[emoji_list][0].emojify({href: emoji_list, title: xabber.getString(constants.EMOJI_LIST_NAME(emoji_list)), tag_name: 'a', emoji_size: 20}));
        }
        let window_onclick = function (ev) {
            if ($(ev.target).closest('.emoticons-panel-wrap').length || $(ev.target).closest('.insert-emoticon').length)
                return;
            $emoji_panel_wrap.removeClass('opened');
            window.removeEventListener("click" , window_onclick);
        };
        $emoji_panel.perfectScrollbar(
                _.extend({theme: 'item-list'}, xabber.ps_settings));
        this.$('.emoji-menu .emoji').click((ev) => {
            $emoji_panel[0].scrollTop = this.$('.emoji-list-wrap ' + ev.target.attributes.href.value)[0].offsetTop - 4;
        });
        $insert_emoticon.click((ev) => {
            if (_timeout)
                clearTimeout(_timeout);
            if (ev && ev.preventDefault) { ev.preventDefault(); }
            if ($emoji_panel_wrap.hasClass('opened')) {
                $emoji_panel_wrap.removeClass('opened');
                window.removeEventListener( "click" , window_onclick);
            }
            else {
                $emoji_panel_wrap.addClass('opened');
                window.addEventListener( "click" , window_onclick);
            }
            $emoji_panel.perfectScrollbar('update');
        });
        $emoji_panel_wrap.hover(null, (ev) => {
            if (ev && ev.preventDefault) { ev.preventDefault(); }
            if (_timeout) {
                clearTimeout(_timeout);
            }
            _timeout = setTimeout(() => {
                $emoji_panel_wrap.removeClass('opened');
            }, 200);
        });
        $emoji_panel_wrap.mousedown((ev) => {
            if (ev && ev.preventDefault) { ev.preventDefault(); }
            if (_timeout)
                clearTimeout(_timeout);
            if (ev.button)
                return;
            let $target = $(ev.target),
                $target_emoji = $target.closest('.emoji-wrap').find('.emoji');
            if ($target.closest('.emoji-menu').length)
                return;
            $target_emoji.length && this.typeEmoticon($target_emoji.data('emoji'));
        });
        this.renderLastEmoticons();
    },

    render: function (options) {
        this.$('.message-input-panel').hideIf(options.blocked);
        this.$('.blocked-msg').showIf(options.blocked);
        this.$el.switchClass('chat-bottom-blocked-wrap', options.blocked);
        this.updateAvatar();
        this.updateEncrypted();
        this.updateEphemeralTimer();
        this.$('.ephemeral-timer-time').dropdown({
            inDuration: 100,
            outDuration: 100,
            hover: false
        });
        let http_upload = this.account.server_features.get(Strophe.NS.HTTP_UPLOAD);
        this.content_view = (this.view.data.get('visible') ? this.view : this.model.messages_view) || this.view;
        this.messages_arr = this.content_view.$el.hasClass('participant-messages-wrap') && this.account.participant_messages || this.content_view.$el.hasClass('messages-context-wrap') && this.account.context_messages || this.model.messages;
        this.renderLastEmoticons();
        this.$('.edit-message-wrap').hideIf(this.model.get('encrypted'));
        this.$('.attach-file').showIf(http_upload);
        this.$('.attach-location').showIf(xabber.settings.mapping_service);
        this.$('.attach-media').showIf(this.account.get('gallery_token') && this.account.get('gallery_url'));
        this.$('.ql-toolbar.ql-snow').switchClass('ql-moved-left', !xabber.settings.mapping_service || !(this.account.get('gallery_token') && this.account.get('gallery_url')));
        this.$('.ql-toolbar.ql-snow').switchClass('ql-moved-left-extra', !xabber.settings.mapping_service && !(this.account.get('gallery_token') && this.account.get('gallery_url')));
        if (this.model.get('group_chat')) {
            this.updateInfoInBottom();
        }
        else {
            this.$('.account-nickname').hide();
            this.$('.account-badge').hide();
            this.$('.account-role').hide();
        }
        this.focusOnInput();
        this.manageSelectedMessages();
        xabber.chat_body.updateHeight();
        return this;
    },

    setButtonsWidth: function () {
        let widths = [];
        this.$('.message-actions-panel .button-wrap').each((i, button) => {widths.push(button.clientWidth)});
        (Math.max.apply(null, widths) !== 0) && this.$('.message-actions-panel .button-wrap').css('width', `${Math.max.apply(null, widths)}px`);
    },

    showEphemeralTimerSelector: function () {
        this.model.showEphemeralTimerSelector();
    },

    updateEncrypted: function () {
        this.$el.children('.preloader-wrapper').detach();
        this.$el.children('.omemo-disabled').detach();
        this.view.$el.removeClass('encrypted');
        this.view.$('.chat-notification').hasClass('encryption-warning') && this.view.$('.chat-notification').addClass('hidden').removeClass('encryption-warning').html("");
        this.$el.attr('data-trust', null);
        this.$el.attr('data-contact-trust', null);
        this.$el.find('.warning-wrap').detach();
        if (!this.model.get('encrypted'))
            return;
        if (this.account.omemo) {
            this.$el.addClass('loading');
            this.$el.prepend(env.templates.contacts.preloader());
            this.account.omemo.checkOwnFingerprints().then((is_trusted) => {
                if (is_trusted == 'none' || is_trusted == 'error') {
                    let is_scrolled_bottom = this.view.isScrolledToBottom();
                    this.$el.attr('data-trust', is_trusted);
                    this.view.$('.chat-message:not([data-trust=untrusted])').attr('data-trust', is_trusted);
                    this.view.$('.chat-day-indicator:not(.fixed-day-indicator-wrap)').attr('data-trust', is_trusted);
                    this.view.$el.attr('data-trust', is_trusted);
                    this.$el.removeClass('loading');
                    this.$el.children('.preloader-wrapper').detach();
                    if (is_trusted == 'none')
                        this.$el.prepend(templates.encryption_warning({color: 'amber', message: xabber.getString("omemo__alert_new_device_yours__text_new_device")}));
                    else
                        this.$el.prepend(templates.encryption_warning({color: 'red', message: xabber.getString("omemo__alert_keys_changed_yours__text_keys_changed")}));
                    xabber.chat_body.updateHeight();
                    is_scrolled_bottom && this.view.scrollToBottom();
                    this.account.omemo.checkContactFingerprints(this.contact);
                    (this.model.get('active') && this.model.get('display')) && this.focusOnInput();
                } else {
                    this.account.omemo.checkContactFingerprints(this.contact).then((obj) => {
                        let is_contact_trusted = obj.trust,
                            unverified_counter = obj.unverified_counter;
                        let is_scrolled_bottom = this.view.isScrolledToBottom();
                        this.$el.removeClass('loading');
                        this.$el.children('.preloader-wrapper').detach();
                        if (is_contact_trusted === 'nil') {
                            this.$el.prepend($(`<div class="warning-wrap no-fingerprints">${xabber.getString("omemo__dialog_fingerprints__text_no_fingerprints")}</div>`));
                            this.$el.attr('data-contact-trust', is_contact_trusted);
                            return;
                        }
                        if (is_contact_trusted === 'error') {
                            this.$el.attr('data-contact-trust', is_contact_trusted);
                            this.$el.prepend(templates.encryption_warning({color: 'red', message: xabber.getString("omemo__alert_keys_changed_partner__text_keys_changed")}));
                        } else {
                            if (is_contact_trusted === 'none') {
                                this.view.$el.addClass('encrypted');
                                this.view.$('.chat-notification').removeClass('hidden').addClass('encryption-warning').attr('data-unverified-device-count', unverified_counter).html(templates.content_encryption_warning({message: xabber.getString("omemo__alert_new_device_partner__text_new_device")}));
                            }
                            this.$el.attr('data-contact-trust', is_contact_trusted);
                        }
                        this.view.$el.attr('data-trust', is_contact_trusted);
                        this.view.$('.chat-message:not([data-trust=untrusted])').attr('data-trust', is_contact_trusted);
                        this.view.$('.chat-day-indicator:not(.fixed-day-indicator-wrap)').attr('data-trust', is_contact_trusted);
                        xabber.chat_body.updateHeight();
                        is_scrolled_bottom && this.view.scrollToBottom();
                        (this.model.get('active') && this.model.get('display')) && this.focusOnInput();
                    });
                }
            });
        } else {
            this.$el.addClass('loading');
            this.$el.prepend($('<div class="omemo-disabled warning-wrap"/>').text(xabber.getString("omemo__chat__placeholder_encryption_disabled")));
        }
    },

    openDevicesWindow: function () {
        if (this.account.omemo) {
            if (this.$el.attr('data-trust') !== undefined) {
                this.account.showSettings(null, 'devices');
            } else if (this.$el.attr('data-contact-trust') !== undefined) {
                let peer = this.account.omemo.getPeer(this.contact.get('jid'));
                peer.fingerprints.open();
            }
        } else
            utils.dialogs.error(xabber.getString("omemo__chat__placeholder_encryption_disabled"));
    },

    updateEphemeralTimer: function () {
        this.$('.ephemeral-timer-time').addClass('hidden');
        if (!this.model.get('encrypted'))
            return;
        this.$('.ephemeral-timer-time').text(utils.pretty_duration_ephemeral_timer(this.model.get('chat_ephemeral_timer')));
        utils.pretty_duration_ephemeral_timer(this.model.get('chat_ephemeral_timer')) && this.$('.ephemeral-timer-time').removeClass('hidden');
    },

    onBlockedUpdate: function () {
        if (!this.isVisible())
            return;
        let is_blocked = this.model.get('blocked');
        this.$('.message-input-panel').hideIf(is_blocked);
        this.$('.blocked-msg').showIf(is_blocked);
        this.$el.switchClass('chat-bottom-blocked-wrap', is_blocked);
    },

    onClickBottom: function (ev) {
        if ($(ev.target).closest('.ql-editor.rich-textarea').length) {
            if (!this.quill.getText().trim().length) {
                if (++this.click_counter === 3) {
                    this.click_counter = 0;
                    this.setOneLiner();
                }
            }
        }
    },

    updateInfoInBottom: function () {
        if (this.contact && this.contact.my_info) {
            let nickname = this.contact.my_info.get('nickname'),
                badge = this.contact.my_info.get('badge'),
                avatar = this.contact.my_info.get('b64_avatar'),
                role = this.contact.my_info.get('role');
            if (nickname) {
                this.$('.account-jid').hide();
                this.$('.account-nickname').show().text(nickname);
            }
            else
                this.$('.account-nickname').hide();
            if (badge)
                this.$('.account-badge').show().text(badge);
            else
                this.$('.account-badge').hide();
            if (role && role != 'member')
                this.$('.account-role').show().text(utils.pretty_name(role));
            else
                this.$('.account-role').hide();
            this.$('.input-toolbar').emojify('.account-badge', {emoji_size: 16});
            if (!avatar && this.contact.my_info.get('avatar_url'))
                avatar = this.contact.my_info.get('avatar_url');
            if (!avatar && this.account.cached_image)
                avatar = this.account.cached_image;
            !avatar && (avatar = Images.getDefaultAvatar(nickname));
            this.$('.my-avatar.circle-avatar').setAvatar(avatar, this.avatar_size);
        }
        else {
            this.$('.account-jid').show();
            this.$('.account-nickname').hide();
            this.$('.account-badge').hide();
            this.$('.account-role').hide();
        }
    },

    updateAvatar: function () {
        let image;
        if (this.contact && this.contact.get('group_chat')) {
            if (this.contact.my_info){
                if (this.contact.my_info.get('b64_avatar'))
                    image = this.contact.my_info.get('b64_avatar');
                if (!image && this.contact.my_info.get('avatar_url'))
                    image = this.contact.my_info.get('avatar_url');
                if (!image && this.account.cached_image)
                    image = this.account.cached_image;
            }
            !image && (image = Images.getDefaultAvatar(this.contact.my_info && this.contact.my_info.nickname || this.account.get('jid')));
        }
        else
            image = this.account.cached_image;
        this.$('.my-avatar.circle-avatar').setAvatar(image, this.avatar_size);
    },

    focusOnInput: function () {
        if (!xabber.body.$el.siblings('#modals').children('.open:not(.collapsed):not(.plyr-player-popup-view)').length){
            this.quill.enable();
            this.quill.focus();
        } else {
            this.quill.blur();
            this.quill.disable();
        }
        return this;
    },

    moveCursorToEnd: function () {
        this.quill.root.focus();
        let range = document.createRange(),
            sel = window.getSelection(),
            target = this.quill.root.lastElementChild
            && this.quill.root.lastElementChild.lastChild ? this.quill.root.lastElementChild.lastChild : this.quill.root.lastElementChild;
        range.selectNodeContents(target);
        range.collapse(false);
        sel.removeAllRanges();
        sel.addRange(range);
        range.detach(); // optimization
        this.quill.root.scrollTop = this.quill.root.scrollHeight;
    },

    keyDown: function (ev) {
        let $rich_textarea = this.$('.input-message .rich-textarea');
        if (ev.keyCode === constants.KEY_ESCAPE && !xabber.body.screen.get('right_contact') ||
                ev.keyCode === constants.KEY_BACKSPACE ||
                ev.keyCode === constants.KEY_DELETE) {
            return;
        }
        if (ev.keyCode === constants.KEY_ENTER || ev.keyCode === 10) {
            if (this.$('.mentions-list').css('display') !== 'none') {
                let active_item = this.$('.mentions-list').children('.active.mention-item');
                active_item.length && active_item.click();
                ev.preventDefault();
                return;
            }
            let send_on_enter = xabber.settings.hotkeys === "enter";
            if ((send_on_enter && ev.keyCode === constants.KEY_ENTER && !ev.shiftKey) ||
                    (!send_on_enter && ev.ctrlKey)) {
                ev.preventDefault();
                this.submit();
                return;
            }
        }
        if ($rich_textarea.getTextFromRichTextarea().trim() && !this.view.chat_state && !this.view.edit_message && xabber.settings.typing_notifications)
            this.view.sendChatState('composing');
    },

    displayMicrophone: function () {
        this.$('.mdi-send').addClass('hidden');
        this.$('.attach-voice-message').removeClass('hidden');
    },

    displaySend: function () {
        this.$('.mdi-send').removeClass('hidden');
        this.$('.attach-voice-message').addClass('hidden');
    },

    updateMarkupPanel: function (ev) {
        let $ic_markup = $(ev.target).closest('.format-text');
        $ic_markup.toggleClass('active');
        if ($ic_markup.hasClass('active')) {
            this.$('.ql-toolbar.ql-snow').show();
            this.$('.last-emoticons').hide();
        }
        else {
            this.$('.ql-toolbar.ql-snow').hide();
            this.$('.last-emoticons').show();
        }
    },

    setOneLiner: function () {
        let rand_idx = _.random(0, xabber.getOneLiners().length - 1),
            placeholder = xabber.getOneLiners()[rand_idx].replace(/\\n/, "");
        if (!placeholder) {
            this.setOneLiner();
            return;
        }
        this.updatePlaceholder(placeholder);
    },

    setDefaultPlaceholder: function () {
        let placeholder = this.model.get('encrypted') ? xabber.getString("chat_bottom__hint_default_encrypted") : xabber.getString("chat_bottom__hint_default");
        this.updatePlaceholder(placeholder);
    },

    updatePlaceholder: function (placeholder) {
        this.quill.root.setAttribute('data-placeholder', placeholder);
    },

    changeEncryption: function () {
        this.model.set('encrypted', !this.model.get('encrypted'));
    },

    getParticipantsList: function () {
        let list = [];
        this.contact.participants.each((participant) => {
            list.push(participant.get('nickname') || participant.get('jid') || participant.get('id'));
        });
        return list.join(', ');
    },

    onChangedText: function () {
        let current_height = this.$el.height(),
            quill_textarea = $(this.quill.container).find('.rich-textarea'),
            quill_current_height = quill_textarea.prop('scrollHeight');
        if (quill_current_height !== this.text_input_height) {
            if (this.text_input_height < quill_current_height){
                quill_textarea.scrollTop(quill_current_height);
            }
            this.text_input_height = quill_current_height;
        }
        let quill_content = this.quill.getContents()
        if (quill_content && quill_content.ops && quill_content.ops.length){
            let text = quill_content.ops[0].insert;
            if (text && text.trimStart) {
                let trimmed_text = text.trimStart();
                if (text.length != trimmed_text.length){
                    quill_content.ops[0].insert = trimmed_text;
                    this.quill.setContents(quill_content, 'user');
                    this.quill.disable();
                    setTimeout(() => {
                        this.focusOnInput();
                        this.quill.root.focus();
                    },1)
                }
            }
        }

        if (current_height !== this.bottom_height) {
            this.bottom_height = current_height;
            this.view.scrolled_to_bottom = this.view.isScrolledToBottom();
        }
        clearTimeout(this._timeout_textchange);
        this._timeout_textchange = setTimeout(() => {
            this.updateOpenGraphReference(this.quill.getText())
        }, 500);
    },

    updateMentionsList: function (mention_text) {
        mention_text = (mention_text || "").toLowerCase();
        this.contact.searchByParticipants(mention_text, (participants) => {
            if (participants.length || xabber.getString("chat_bottom__mentions_list__item_everyone").toLowerCase().indexOf(mention_text) > -1 || mention_text === "*" || 'all'.indexOf(mention_text) > -1 || 'все'.indexOf(mention_text) > -1) {
                this.$('.mentions-list').html("").show().perfectScrollbar({theme: 'item-list'});
                this.$('.mentions-list')[0].scrollTop = 0;
                participants.forEach((participant) => {
                    let attrs = _.clone(participant.attributes);
                    if (!attrs.id)
                        return;
                    attrs.nickname = attrs.nickname ? Strophe.xmlescape(attrs.nickname) : attrs.id;
                    let mention_item = $(templates.group_chats.mention_item(attrs));
                    mention_item.find('.circle-avatar').setAvatar(participant.get('b64_avatar') || utils.images.getDefaultAvatar(participant.get('nickname') || participant.get('jid') || participant.get('id')), this.mention_avatar_size);
                    mention_item.find('.nickname').text().replace(mention_text, mention_text.bold());
                    this.$('.mentions-list').append(mention_item);
                });
                let mention_all = $(templates.group_chats.mention_item({jid: "", nickname: xabber.getString("chat_bottom__mentions_list__item_everyone"), id: ""}));
                mention_all.find('.circle-avatar').setAvatar(this.contact.cached_image, this.mention_avatar_size);
                mention_all.find('.one-line.jid').text(this.getParticipantsList());
                this.$('.mentions-list').append(mention_all);
                this.$('.mentions-list').children('.mention-item').first().addClass('active');
            } else
                this.$('.mentions-list').html("").hide();
        });
    },

    onMentionButtonClick: function () {
        if (this.$('.ql-mention').hasClass('ql-active')){
            this.$('.ql-mention').prop('disabled', false);
            this.$('.ql-mention').click();
            this.$('.ql-mention').prop('disabled', true);

            return;
        }
        let selection = this.quill.getSelection() ? this.quill.getSelection().index : (this.quill.getLength() - 1);
        this.quill.insertText(selection, ' @ ', 'user')
        this.quill.setSelection(selection + 2, 0)
        let mention_text = "";
        if (this.contact.participants.length && this.contact.participants.version > 0 && (this.contact.get('group_info') && this.contact.participants && this.contact.get('group_info').members_num == this.contact.participants.length)) {
            this.updateMentionsList(mention_text);
        } else {
            this.contact.participants.participantsRequest({version: 0}, () => {
                this.updateMentionsList(mention_text);
            });
        }

    },

    inputMention: function (ev) {
        ev && ev.preventDefault();
        let $rich_textarea = this.$('.rich-textarea'),
            $participant_item = $(ev.target).closest('.mention-item'),
            nickname = $participant_item.data('nickname'),
            id = $participant_item.data('id') || "",
            jid = !this.contact.get('incognito_chat') && $participant_item.data('jid') || "",
            text = $rich_textarea.getTextFromRichTextarea().replace(/\n$/, ""),
            caret_position = this.quill.selection.lastRange && this.quill.selection.lastRange.index,
            mention_at_regexp = /(^|\s)@(\w+)?/g,
            mention_plus_regexp = /(^|\s)[+](\w+)?/g,
            to_caret_text = Array.from(text).slice(0, caret_position).join("").replaceEmoji(),
            mentions_at = to_caret_text && Array.from(to_caret_text.matchAll(mention_at_regexp)) || [],
            mentions_plus = to_caret_text && Array.from(to_caret_text.matchAll(mention_plus_regexp)) || [],
            at_position = mentions_at.length ? mentions_at.slice(-1)[0].index : -1,
            plus_position = mentions_plus.length ? mentions_plus.slice(-1)[0].index : -1,
            mention_position = Math.max(at_position, plus_position),
            mention_text = Array.from(to_caret_text).slice(mention_position, caret_position).join("");
        (mention_text.length && mention_text[0].match(/\s/)) && mention_position++;
        mention_text = mention_text.replace(/\s?(@|[+])/, "");
        this.$('.mentions-list').hide();
        this.quill.deleteText(mention_position, (mention_text.length + 1));
        if (!nickname.length) {
            if (id.length)
                nickname = id;
            else
                return;
        }
        this.insertMention({jid: jid, id: id, nickname: nickname, position: mention_position});
        this.focusOnInput();
    },

    insertMention: function (options) {
        if (!options)
            return;
        let id = options.id, jid = options.jid, nickname = options.nickname,
            is_me = !id && !jid || this.account.get('jid') === jid || this.contact.my_info && this.contact.my_info.get('id') === id,
            attrs = {jid: jid, id: id, nickname: Strophe.xmlescape(nickname), is_me: is_me},
            position = options.position;
        this.quill.insertEmbed(position, 'mention', JSON.stringify(attrs));
        this.quill.pasteHTML(position + nickname.length, '<text> </text>');
        this.quill.setSelection(position + nickname.length + 1, 0);
    },

    showAccountSettings: function () {
        if (this.contact.get('group_chat')) {
            if (this.contact.my_info && this.contact.my_rights) {
                this.contact.showDetailsRight('all-chats', {type: 'participant'});
                this.contact.details_view_right.participants.participant_properties_panel.open(this.contact.my_info, this.contact.my_rights);
            } else
                this.contact.getMyInfo(() => {
                    this.contact.showDetailsRight('all-chats', {type: 'participant'});
                    this.contact.details_view_right.participants.participant_properties_panel.open(this.contact.my_info, this.contact.my_rights);
                });
        } else {
            this.account.showSettings();
        }
    },

    keyUp: function (ev) {
        let $rich_textarea = $(ev.target).closest('.rich-textarea'),
            text = $rich_textarea.getTextFromRichTextarea().replace(/\n$/, "");
        if (text) {
            this.click_counter = 0;
            this.setDefaultPlaceholder();
        }
        if (ev.keyCode === constants.KEY_ARROW_UP) {
            if (!text && !this.model.get('encrypted')) {
                let $msg = this.view.$(`.chat-message[data-from="${this.account.get('jid')}"]`).last();
                (!$msg.length && this.contact.participants) && ($msg = this.view.$(`.chat-message[data-from="${this.contact.participants.find(m => m.get('jid') === this.account.get('jid')).get('id')}"]`).last());
                let edit_msg = this.messages_arr.get($msg.data('uniqueid'));
                if (!edit_msg)
                    return;
                this.edit_message = edit_msg;
                this.setEditedMessageAttachments(edit_msg);
                this.setEditedMessage(edit_msg);
            }
        }
        if ((!text || text == "\n") && !this.edit_message && !(this.attached_files && this.attached_files.length) && !(this.link_references && this.link_references.length))
            this.displayMicrophone();
        else
            this.displaySend();
        if (ev.keyCode === constants.KEY_ESCAPE && !xabber.body.screen.get('right_contact') && !this.edit_message) {
            ev.preventDefault();
            if (this.$('.message-reference-preview-container').children('div.message-reference-preview-attached').length > 0) {
                let $elem = this.$('.message-reference-preview-container').children('div.message-reference-preview-attached').last();
                if ($elem.hasClass('link-message-reference')){
                    let url = $elem.attr('data-original-url');
                    if (url) {
                        $elem.remove();
                        this.removeLinkReferenceByUrl(url);
                    }
                } else {
                    let id = $elem.attr('data-id');
                    if (id) {
                        $elem.remove();
                        this.removeFileSnippetById(id);
                    }
                }
            } else {
                this.unsetForwardedMessages();
            }
        } else if (ev.keyCode === constants.KEY_ESCAPE && !xabber.body.screen.get('right_contact')) {
            ev.preventDefault();
            this.unsetForwardedMessages();
        } else {
            if (ev.keyCode === constants.KEY_ARROW_UP || ev.keyCode === constants.KEY_ARROW_DOWN) {
                return;
            }
            if ((ev.keyCode === constants.KEY_ARROW_LEFT || ev.keyCode === constants.KEY_ARROW_RIGHT) && this.$('.mentions-list').css('display') !== 'none') {
                this.$('.mentions-list').hide();
                return;
            }
            if ((ev.keyCode === constants.KEY_BACKSPACE || ev.keyCode === constants.KEY_DELETE) && !this.edit_message && !(this.attached_files && this.attached_files.length) && !(this.link_references && this.link_references.length)) {
                if (!text || text == "\n") {
                    if (this.$('.fwd-messages-preview').hasClass('hidden'))
                        this.displayMicrophone();
                    else
                        this.displaySend();
                    $rich_textarea.flushRichTextarea();
                }
            }
            if (ev.keyCode === constants.KEY_SPACE) {
                let caret_position = this.quill.selection.lastRange && this.quill.selection.lastRange.index,
                    to_caret_text = Array.from(text).slice(0, caret_position).join("").replaceEmoji();
                if (to_caret_text[caret_position - 2] && to_caret_text[caret_position - 2].match(/@|[+]/)) {
                    this.$('.mentions-list').hide();
                    return;
                }
            }
            if (this.model.get('group_chat')) {
                let caret_position = this.quill.selection.lastRange && this.quill.selection.lastRange.index,
                    mention_at_regexp = /(^|\s)@(\w+)?/g,
                    mention_plus_regexp = /(^|\s)[+](\w+)?/g,
                    to_caret_text = Array.from(text).slice(0, caret_position).join("").replace(/\n$/, "").replaceEmoji(),
                    mentions_at = Array.from(to_caret_text.matchAll(mention_at_regexp)),
                    mentions_plus = Array.from(to_caret_text.matchAll(mention_plus_regexp)),
                    at_position = mentions_at.length ? mentions_at.slice(-1)[0].index : -1,
                    plus_position = mentions_plus.length ? mentions_plus.slice(-1)[0].index : -1,
                    mention_position = Math.max(at_position, plus_position);
                if (this.quill.selection.lastRange && this.quill.getLeaf(this.quill.selection.lastRange.index)[0].parent.domNode.tagName.toLowerCase() === 'mention') {
                    this.$('.mentions-list').hide();
                    return;
                }
                if (!(caret_position > -1) || mention_position === -1) {
                    this.$('.mentions-list').hide();
                }
                if (mention_position > -1) {
                    let mention_text = Array.from(to_caret_text).slice(mention_position, caret_position).join("").replace(/\s?(@|[+])/, "");
                        if (this.contact.participants.length && this.contact.participants.version > 0 && (this.contact.get('group_info') && this.contact.participants && this.contact.get('group_info').members_num == this.contact.participants.length)) {
                            this.updateMentionsList(mention_text);
                        } else {
                            this.contact.participants.participantsRequest({version: 0}, () => {
                                this.updateMentionsList(mention_text);
                            });
                        }
                }
                else
                    this.$('.mentions-list').hide();
            }
        }
        $rich_textarea.updateRichTextarea();
        this.focusOnInput();
        xabber.chat_body.updateHeight();
    },

    onCut: function () {
        if (this.$('.fwd-messages-preview').hasClass('hidden'))
            this.displayMicrophone();
        else {
            this.displaySend();
        }
    },

    onPaste: function (ev) {
        let $rich_textarea = $(ev.target),
            clipboard_data = ev.clipboardData;
        // if (clipboard_data) {
            if (clipboard_data && clipboard_data.files.length > 0) {
                console.log('true');
                ev.preventDefault();
                let image_from_clipboard = clipboard_data.files[clipboard_data.files.length - 1],
                    blob_image = window.URL.createObjectURL(new Blob([image_from_clipboard])),
                    options = { blob_image_from_clipboard: blob_image};
                this.view.addFileMessage([image_from_clipboard]);
                this.focusOnInput();
            }
            else if (clipboard_data && clipboard_data.items.length > 0) {
                let image_from_clipboard = clipboard_data.items[clipboard_data.items.length - 1];
                if (image_from_clipboard.kind === 'file') {
                    console.log('true');
                    ev.preventDefault();
                    let blob = image_from_clipboard.getAsFile(),
                        reader = new FileReader(), deferred = new $.Deferred();
                    reader.onload = function(event){
                        let options = { blob_image_from_clipboard: event.target.result};
                        deferred.resolve();
                        this.focusOnInput();
                    };
                    deferred.done(() => {
                        blob.name = 'clipboard.png';
                        this.view.addFileMessage([blob]);
                    });
                    reader.readAsDataURL(blob);
                }
                // else {
                //     let text = _.escape(clipboard_data.getData('text')),
                //         arr_text = Array.from(text);
                //     arr_text.forEach((item, idx) => {
                //         if (item == '\n')
                //             arr_text.splice(idx, 1, '</p><p>');
                //         if (item == ' ')
                //             arr_text.splice(idx, 1, '&nbsp');
                //     });
                //     text = "<p>" + arr_text.join("") + "</p>";
                //     let range = window.getSelection().getRangeAt(0);
                //     range.insertNode($('<div>' + text + '</div>')[0]);
                // }
            }
            // else {
            //     let text = _.escape(clipboard_data.getData('text')),
            //         arr_text = Array.from(text);
            //     arr_text.forEach((item, idx) => {
            //         if (item == '\n')
            //             arr_text.splice(idx, 1, '</p><p>');
            //         if (item == ' ')
            //             arr_text.splice(idx, 1, '&nbsp');
            //     });
            //     text = "<p>" + arr_text.join("") + "</p>";
            //     let range = window.getSelection().getRangeAt(0);
            //     range.insertNode($('<div>' + text + '</div>')[0]);
            // }
        // }
        // if ($rich_textarea.getTextFromRichTextarea().replace(/\n$/, "") && !this.view.chat_state && !this.view.edit_message && xabber.settings.typing_notifications)
        //     this.view.sendChatState('composing');
        // this.focusOnInput();
        // this.displaySend();
        // xabber.chat_body.updateHeight();
    },

    onFileInputChanged: function (ev) {
        let target = ev.target,
            files = [];
        for (let i = 0; i < target.files.length; i++) {
            files.push(target.files[i]);
        }

        if (files && files.length) {
            this.view.addFileMessage(files);
            $(target).val('');
        }
    },

    updateOpenGraphReference: function (text) {
        if (!(this.account.get('gallery_token') && this.account.get('gallery_url')))
            return;
        let url_regexp = /(((ftp|http|https):\/\/)|(www\.))(\w+:{0,1}\w*@)?(\S+)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?/g,
            list = text && text.match(url_regexp);
        list = _.difference(list, this.link_reference_exempted);
        list = _.difference(list, this.currently_loaded_link_references);
        if (list && list.length){
            this.stopped_loading_link_reference = false;
            this.$('.preview-preloader-container').removeClass('hidden');
            let request_count = 0;
            this.link_reference_request_timestamp = Date.now();
            let request_timestamp = this.link_reference_request_timestamp;
            list.forEach((item, idx) => {
                this.account.getOpenGraphData(item, (res) => {
                    if (this.stopped_loading_link_reference || !(request_timestamp === this.link_reference_request_timestamp))
                        return;
                    if (this.currently_loaded_link_references.includes(item)){
                        request_count++;
                        if (request_count === list.length)
                            this.$('.preview-preloader-container').addClass('hidden');
                        return;
                    } else {
                        this.currently_loaded_link_references = this.currently_loaded_link_references.concat([item]);
                    }
                    let dfd = new $.Deferred();
                    dfd.done(() => {
                        request_count++;
                        this.displaySend();
                        this.$('.message-reference-preview').removeClass('hidden');
                        if (request_count === list.length)
                            this.$('.preview-preloader-container').addClass('hidden');
                        res.original_text = item
                        this.$('.message-reference-preview-container').append($(templates.messages.link_reference({
                            item: res,
                            domain: res.url ? utils.getDomainFromUrl(res.url) : res.site_name,
                            url: null
                        })));
                        this.$('.attached-image').length && this.$('.attached-image').magnificPopup({
                            type: 'image',
                            closeOnContentClick: true,
                            fixedContentPos: true,
                            mainClass: 'mfp-no-margins mfp-with-zoom',
                            image: {
                                verticalFit: true,
                                titleSrc: function(item) {
                                    return '<a class="image-source-link" href="'+item.el.attr('src')+'" target="_blank">' + item.name + '</a>';
                                }
                            },
                            zoom: {
                                enabled: true,
                                duration: 300
                            }
                        });
                        this.link_references = this.link_references.concat(res);
                        xabber.chat_body.updateHeight();
                        this.scrollToBottom();
                    });
                    if ((res.image_height && res.image_width) || !res.image){
                        dfd.resolve()
                    } else {
                        let img = new Image();
                        img.onload = (image) => {
                            res.image_height = img.height;
                            res.image_width = img.width;
                            dfd.resolve()
                        };
                        img.onerror = img.onabort = (image) => {
                            res.image = undefined;
                            dfd.resolve()
                        };
                        img.src = res.image;
                    }
                }, (err) => {
                    this.link_reference_exempted = this.link_reference_exempted.concat([item]);
                    request_count++;
                    if (request_count === list.length)
                        this.$('.preview-preloader-container').addClass('hidden');
                })

            });
        }
    },

    removeAttachments: function () {
        this.removeAllFileSnippets();
        this.removeAllLinkReferences();
    },

    stopLoadingLinkReference: function () {
        this.$('.preview-preloader-container').addClass('hidden');
        this.stopped_loading_link_reference = true;
    },

    removeLinkReference: function (ev) {
        let $elem = $(ev.target).closest('.link-message-reference'),
            url = $elem.attr('data-original-url');
        $elem.remove();
        this.removeLinkReferenceByUrl(url);
    },

    removeLinkReferenceByUrl: function (url) {
        if (!(this.$('.message-reference-preview-container').children('div.message-reference-preview-attached').length > 0))
            this.$('.message-reference-preview').addClass('hidden');
        this.link_references = this.link_references.filter(item => item.original_text != url);
        this.currently_loaded_link_references = this.currently_loaded_link_references.filter(item => item != url);
        this.link_reference_exempted = this.link_reference_exempted.concat([url]);
        xabber.chat_body.updateHeight();
        this.scrollToBottom();
    },

    removeAllLinkReferences: function () {
        this.stopLoadingLinkReference();
        this.$('.message-reference-preview-container .link-message-reference').remove();
        if (!(this.$('.message-reference-preview-container').children('div.message-reference-preview-attached').length > 0))
            this.$('.message-reference-preview').addClass('hidden');
        this.link_references = [];//
        this.currently_loaded_link_references = [];//
        xabber.chat_body.updateHeight();
        this.scrollToBottom();
    },

    addFileSnippets: function (files) {
        if (files && (this.attached_files.length + files.length) > 10){
            utils.dialogs.error(xabber.getString("too_many_files_at_once"));
            return;
        }
        if (this.edit_message)
            return;
        files && files.length && this.$('.message-reference-preview').removeClass('hidden');
        files && files.length && this.displaySend();
        files.forEach((file) => {
            let id = uuid();
            file.uid = id;
            this.$('.message-reference-preview-container').append($(templates.messages.attached_file({
                file: file,
                uid: id,
                blob: utils.isImageType(file.type) ? file.key ? file.image_prev.src : window.URL.createObjectURL(new Blob([file])) : null,
                filesize: utils.pretty_size(file.size),
                typeicon: utils.file_type_icon(file.type),
                filetype: utils.pretty_file_type(file.type),
            })));
            this.attached_files = this.attached_files.concat([file]);
            xabber.chat_body.updateHeight();
            this.scrollToBottom();
        });
        files && files.length && this.$('.attached-image').length && this.$('.attached-image').magnificPopup({
            type: 'image',
            closeOnContentClick: true,
            fixedContentPos: true,
            mainClass: 'mfp-no-margins mfp-with-zoom',
            image: {
                verticalFit: true,
                titleSrc: function(item) {
                    return '<a class="image-source-link" href="'+item.el.attr('src')+'" target="_blank">' + item.name + '</a>';
                }
            },
            zoom: {
                enabled: true,
                duration: 300
            }
        });
    },

    removeFileSnippet: function (ev) {
        let $elem = $(ev.target).closest('.message-reference-preview-item-file'),
            id = $elem.attr('data-id');
        $elem.remove();
        this.removeFileSnippetById(id);
    },

    removeFileSnippetById: function (id) {
        if (!(this.$('.message-reference-preview-container').children('div.message-reference-preview-attached').length > 0))
            this.$('.message-reference-preview').addClass('hidden');
        this.attached_files = this.attached_files.filter(item => item.uid != id);
        xabber.chat_body.updateHeight();
        this.scrollToBottom();
    },

    removeAllFileSnippets: function (ev) {
        this.$('.message-reference-preview .message-reference-preview-item-file').remove();
        if (!(this.$('.message-reference-preview-container').children('div.message-reference-preview-attached').length > 0))
            this.$('.message-reference-preview').addClass('hidden');
        this.attached_files = [];
        xabber.chat_body.updateHeight();
        this.scrollToBottom();
    },

    setEditedMessageAttachments: function (edit_msg, is_upload) {
        !is_upload && this.$('.attach-file input').attr('disabled', true);
        this.removeAllFileSnippets();
        this.removeAllLinkReferences();
        let files = edit_msg.get('files') || [],
            images = edit_msg.get('images') || [],
            videos = edit_msg.get('videos') || [],
            link_references = edit_msg.get('link_references') || [];
        files = files.concat(images).concat(videos);
        if ((link_references && link_references.length) || (files && files.length)) {
            this.$('.message-reference-preview').removeClass('hidden');
            this.displaySend();
        }
        link_references.forEach((item) => {
            this.link_references = this.link_references.concat([item]);
            this.currently_loaded_link_references = this.currently_loaded_link_references.concat(item.original_text);
            this.$('.message-reference-preview-container').prepend($(templates.messages.link_reference({
                item: item,
                domain: item.url ? utils.getDomainFromUrl(item.url) : item.site_name,
                url: null
            })));
            xabber.chat_body.updateHeight();
        });
        files.forEach((file) => {
            if (!file)
                return;
            let id = uuid();
            file.uid = id;
            this.attached_files = this.attached_files.concat([file]);
            if (is_upload){
                this.$('.message-reference-preview-container').append($(templates.messages.attached_file({
                    file: file,
                    uid: id,
                    blob: utils.isImageType(file.type) ? file.key ? file.image_prev.src : window.URL.createObjectURL(new Blob([file])) : null,
                    filesize: utils.pretty_size(file.size),
                    typeicon: utils.file_type_icon(file.type),
                    filetype: utils.pretty_file_type(file.type),
                })));
            } else{
                this.$('.message-reference-preview-container').append($(templates.messages.attached_file({
                    file: file,
                    uid: id,
                    blob: file.sources.length && file.sources[0] && utils.isImageType(file.type) ? file.sources[0] : null,
                    filesize: utils.pretty_size(file.size),
                    typeicon: utils.file_type_icon(file.type),
                    filetype: utils.pretty_file_type(file.type),
                })));
            }
            xabber.chat_body.updateHeight();
        });
        ((link_references && link_references.length) || (files && files.length)) && this.$('.attached-image').length && this.$('.attached-image').magnificPopup({
            type: 'image',
            closeOnContentClick: true,
            fixedContentPos: true,
            mainClass: 'mfp-no-margins mfp-with-zoom',
            image: {
                verticalFit: true,
                titleSrc: function(item) {
                    return '<a class="image-source-link" href="'+item.el.attr('src')+'" target="_blank">' + item.name + '</a>';
                }
            },
            zoom: {
                enabled: true,
                duration: 300
            }
        });
    },

    showLocationPopup: function (ev) {
        if (!xabber.settings.mapping_service)
            return;xabber
        xabber.popup_coordinates = undefined;
        xabber.location_name = undefined;
        new xabber.ChatLocationView({content: this}).show(ev);
    },

    showMediaPopup: function (ev) {
        if (this.edit_message)
            return;
        if (this.account.get('gallery_token') && this.account.get('gallery_url')) {
            let media_view = new xabber.SendMediaView();
            media_view.render({parent: this, model: this.account});
        }
    },

    stopWritingVoiceMessage: function (ev) {
        let $bottom_panel = this.$('.message-input-panel');
        if ($bottom_panel.find('.recording').length > 0) {
            $bottom_panel.find('.recording').removeClass('recording');
            return;
        }
    },

    writeVoiceMessage: function (ev) {
        let $elem = $(ev.target);
        if ($elem.hasClass('recording'))
            $elem.removeClass('recording');
        else {
            $elem.addClass('recording ground-color-50');
            if (!this.model.get('recording_voice_message'))
                this.initAudio();
        }
    },

    initAudio: function() {
        navigator.getUserMedia = (navigator.mozGetUserMedia || navigator.msGetUserMedia || navigator.webkitGetUserMedia || navigator.getUserMedia);
        if (navigator.getUserMedia) {
            this.model.set('recording_voice_message', true)
            let constraints = { audio: true, channelCount: 1 },
                chunks = [],
                $mic = this.$('.send-area .attach-voice-message'),
                onSuccess = (stream) => {
                if (!$mic.is(":hover")) {
                    $mic.removeClass('recording ground-color-50');
                    this.model.set('recording_voice_message', false)
                    return;
                }
                let mediaRecorder = new opusRecorder({
                        encoderPath: opusRecorderEncoderPath,
                        encoderSampleRate: 16000,
                        numberOfChannels: 1
                }),
                    timer = 1, start_time, end_time,
                    mic_hover = true;
                    mediaRecorder.onstart = () => {
                        if (xabber.settings.typing_notifications) {
                            this.view.sendChatState('composing', 'voice');
                            this._chatstate_send_timeout = setInterval(() => {
                                this.view.sendChatState('composing', 'voice');
                            }, constants.CHATSTATE_INTERVAL_COMPOSING_AUDIO);
                        }
                        start_time = moment.now();
                        let $bottom_panel = this.$('.message-input-panel'),
                            $timer_elem = this.$('.input-voice-message .timer'),
                            $status_msg = this.$('.input-voice-message .voice-msg-status'),
                            $voice_visualizer = this.$('.input-voice-message .voice-visualizer');
                        $timer_elem.text('0:00');
                        $status_msg.css('color', '#9E9E9E').text(xabber.getString("chat_bottom__placeholder__cancel_write_voice"));
                        $bottom_panel.addClass('voice-message-recording');

                        let timerId = setInterval(() => {
                                if ($mic.hasClass('recording') && (timer < constants.VOICE_MSG_TIME)) {
                                    if (timer%1 == 0)
                                        $timer_elem.text(utils.pretty_duration(timer));
                                    timer = (timer*10 + 2)/10;
                                    mic_hover = $bottom_panel.is(":hover");
                                    if (!mic_hover)
                                        $status_msg.css('color', '#D32F2F').text(xabber.getString("chat_bottom__placeholder__cancel_write_voice_short"));
                                    else
                                        $status_msg.css('color', '#9E9E9E').text(xabber.getString("chat_bottom__placeholder__cancel_write_voice"));
                                }
                                else
                                {
                                    mic_hover = $bottom_panel.is(":hover");
                                    mediaRecorder.stop();
                                    $mic.removeClass('recording ground-color-50');
                                    $bottom_panel.removeClass('voice-message-recording');
                                    this.model.set('recording_voice_message', false)
                                    clearInterval(timerId);
                                }
                            }, 200),
                            flag = false,
                            timerIdDot = setInterval(() => {
                                if ($mic.hasClass('recording')) {
                                    if (flag)
                                        $voice_visualizer.css('background-color', '#FFF');
                                    else
                                        $voice_visualizer.css('background-color', '#D32F2F');
                                    flag = !flag;
                                }
                                else
                                    clearInterval(timerIdDot);
                            }, 500);
                    };

                    mediaRecorder.start();

                mediaRecorder.onstop = () => {
                    clearInterval(this._chatstate_send_timeout);
                    (xabber.settings.typing_notifications) && this.view.sendChatState('paused');
                    end_time = moment.now();
                    if (mic_hover && ((end_time - start_time)/1000 >= 1.5)) {
                        let audio_name = ("voice message " + moment().format('YYYY-MM-DD HH:mm:ss') + '.ogg'), audio_type = 'audio/ogg; codecs=opus',
                            blob = new Blob([chunks], { 'type' : audio_type}),
                            file = new File([blob], audio_name, {
                                type: audio_type,
                            });
                        file.voice = true;
                        file.duration = Math.round((end_time - start_time)/1000);
                        this.view.addFileMessage([file], true);
                    }
                    chunks = [];
                };

                mediaRecorder.ondataavailable = (e) => {
                    chunks = e;
                };
            };

            let onError = (error) => {
                console.log(xabber.getString("file_upload__error", [error]));
                $mic.removeClass('recording ground-color-50');
            };

            window.navigator.getUserMedia(constraints, onSuccess, onError);
        }
    },

    typeEmoticon: function (emoji) {
        if (typeof emoji == 'number')
            emoji = Number(emoji).toString();
        let caret_idx = -1;
        if (this.quill.selection.lastRange)
            caret_idx = this.quill.selection.lastRange.index;
        else if (this.quill.selection.savedRange)
            caret_idx = this.quill.selection.savedRange.index;
        this.quill.focus();
        if (!this.edit_message)
            this.displaySend();
        (!this.view.chat_state && xabber.settings.typing_notifications) && this.view.sendChatState('composing');
        this.quill.insertText(caret_idx++, emoji);
        if (this.quill.getFormat(caret_idx, 1).mention) {
            this.quill.formatText(caret_idx, 1, 'mention', false);
        }
        this.quill.setSelection(caret_idx + 1);
        xabber.chat_body.updateHeight();
    },

    renderLastEmoticons: function () {
        if (!this.account.chat_settings)
            return;
        let cached_last_emoji = this.account.chat_settings.getLastEmoji(),
            $last_emoticons = this.$('.last-emoticons').empty(), emoji;
        if (cached_last_emoji.length < 7) {
            for (let idx = 0; idx < 7; idx++) {
                emoji = Emoji.getByIndex(idx);
                this.account.chat_settings.updateLastEmoji(emoji);
            }
        }
        cached_last_emoji = this.account.chat_settings.getLastEmoji();
        for (let idx = 0; idx < 7; idx++) {
            $('<div class="emoji-wrap"/>').html(
                cached_last_emoji[idx] && cached_last_emoji[idx].emojify({tag_name: 'div', emoji_size: 20})
            ).appendTo($last_emoticons);
        }
        $last_emoticons.find('.emoji-wrap').mousedown((ev) => {
            if (ev && ev.preventDefault) { ev.preventDefault(); }
            if (ev.button) {
                return;
            }
            let $target_text = $(ev.target).closest('.emoji-wrap').text();
            this.typeEmoticon($target_text);
        });
    },

    submit: function (ev, forced) {
        let $rich_textarea = this.$('.input-message .rich-textarea'),
            mentions = [],
            markup_references = [],
            blockquotes = [],
            link_references = this.link_references,
            attached_files = this.attached_files,
            text = $rich_textarea.getTextFromRichTextarea(),
            dfd = new $.Deferred();


        if (this.model.get('encrypted') && this.view.$('.chat-notification').hasClass('encryption-warning') && !forced){
            let unverified_counter = this.view.$('.encryption-warning').attr('data-unverified-device-count');
            utils.dialogs.ask_extended(xabber.getQuantityString("dialog_unverified_devices__header", unverified_counter || 1), xabber.getQuantityString("dialog_unverified_devices__text", unverified_counter || 1),
                {modal_class: 'modal-unverified-devices', no_dialog_options: true},
                { ok_button_text: xabber.getString("omemo__alert_new_device__button_manage_devices"), optional_button: 'send-anyway', optional_button_text: xabber.getString("dialog_unverified_devices__send")})
                .done((result) => {
                if (result) {
                    if (result === 'send-anyway'){
                        this.submit(ev, true);
                    }
                    else{
                        this.openDevicesWindow();
                    }
                }
            });
            return;
        }

        dfd.done(() => {
            this.$('.mentions-list').html("").hide();
            $rich_textarea.find('.emoji').each((idx, emoji_item) => {
                let emoji = emoji_item.innerText;
                this.account.chat_settings.updateLastEmoji(emoji);
            });
            let content_concat = [];
            if (text.length >= constants.STANZA_MAX_SIZE) {
                utils.dialogs.error(xabber.getString("message__error_big_stanza"));
                $rich_textarea.flushRichTextarea();
                return;
            }
            if (text.length) {
                this.quill.getContents().forEach((content) => {
                    if (content.attributes) {
                        let content_attrs = [],
                            start_idx = content_concat.length,
                            end_idx = start_idx + ((content.insert && content.insert.emoji) ? 1 : _.escape(content.insert).length);
                        for (let attr in content.attributes)
                            (attr !== 'alt' && attr !== 'blockquote') && content_attrs.push(attr);
                        if (content_attrs.indexOf('mention') > -1) {
                            let mention_idx = content_attrs.indexOf('mention'),
                                is_gc = this.contact.get('group_chat'),
                                target = $($rich_textarea.find('mention')[mentions.length]).attr('data-target');
                            content_attrs.splice(mention_idx, mention_idx + 1);
                            target = is_gc ? ('xmpp:' + this.contact.get('jid') + target) : ('xmpp:' + target);
                            mentions.push({
                                start: start_idx,
                                end: end_idx,
                                target: target,
                                is_gc: is_gc
                            });
                        }
                        if (content.attributes.blockquote) {
                            if (content_concat.length) {
                                Array.from(content.insert).forEach((ins) => {
                                    let quote_start_idx = (content_concat.lastIndexOf('\n') < 0) ? 0 : (content_concat.lastIndexOf('\n') + 1),
                                        quote_end_idx = content_concat.length;
                                    blockquotes.push({
                                        marker: constants.QUOTE_MARKER,
                                        start: quote_start_idx,
                                        end: quote_end_idx + constants.QUOTE_MARKER.length
                                    });
                                    text = Array.from(_.escape(text));

                                    if (quote_start_idx === quote_end_idx) {
                                        text[quote_start_idx - 1] += constants.QUOTE_MARKER;
                                        content_concat[quote_start_idx] = constants.QUOTE_MARKER;
                                    }
                                    else {
                                        text[quote_start_idx] = constants.QUOTE_MARKER + text[quote_start_idx];
                                        content_concat[quote_start_idx] = constants.QUOTE_MARKER + content_concat[quote_start_idx];
                                    }
                                    (quote_end_idx > text.length) && (quote_end_idx = text.length);
                                    text[quote_end_idx - 1] += '\n';

                                    text = _.unescape(text.join(""));
                                    content_concat = Array.from(content_concat.join(""));

                                    markup_references.forEach((markup_ref) => {
                                        if (markup_ref.start >= quote_start_idx) {
                                            markup_ref.start += constants.QUOTE_MARKER.length;
                                            markup_ref.end += constants.QUOTE_MARKER.length;
                                        }
                                    });

                                    content_concat = content_concat.concat(Array.from(_.escape(ins)));
                                })
                            }
                        }
                        content_attrs.length && markup_references.push({
                            start: start_idx,
                            end: end_idx,
                            markup: content_attrs
                        });
                    }
                    if (content.insert && content.insert.emoji) {
                        content_concat = content_concat.concat(Array.from($(content.insert.emoji).data('emoji')));
                    }
                    else if (content.attributes && content.attributes.blockquote) {
                    }
                    else
                        content_concat = content_concat.concat(Array.from(_.escape(content.insert)));
                });
            }
            let start_length = text.length;
            text = text.trimStart();
            if (start_length > text.length) {
                let delta = start_length - text.length;
                mentions.forEach((mention) => {
                    mention.start -= delta;
                    mention.end -= delta;
                });
                markup_references.forEach((markup_reference) => {
                    markup_reference.start -= delta;
                    markup_reference.end -= delta;
                });
                blockquotes.forEach((blockquote) => {
                    blockquote.start -= delta;
                    blockquote.end -= delta;
                });
            }
            if (link_references && link_references.length) {
                link_references = link_references.filter(item => item.original_text);
                link_references.forEach((link_reference) => {
                    if (link_reference && link_reference.original_text) {
                        link_reference.start = text.indexOf(link_reference.original_text);
                        if (link_reference.start != -1) {
                            link_reference.start = 0;
                            link_reference.end = 0;
                        }
                    }
                });
            }
            this.removeAllLinkReferences();
            this.link_reference_exempted = [];
            this.removeAllFileSnippets();
            text = text.trimEnd();
            $rich_textarea.flushRichTextarea();
            this.quill.focus();
            this.displayMicrophone();
            if (this.edit_message) {
                this.editMessage(text, {mentions: mentions, markup_references: markup_references, link_references: link_references, attached_files: attached_files, blockquotes: blockquotes});
                $rich_textarea.placeCaretAtEnd();
                return;
            }
            if (text || this.fwd_messages.length || (attached_files && attached_files.length) || (link_references && link_references.length)) {
                if (this.model.get('saved') && this.fwd_messages.length && !text)
                    this.fwd_messages.forEach((message) => {
                        this.view.onSubmit("", [message]);
                    });
                else
                    this.view.onSubmit(text, this.fwd_messages, {mentions: mentions, markup_references: markup_references, link_references: link_references, attached_files: attached_files, blockquotes: blockquotes});
            }
            this.unsetForwardedMessages();
            xabber.chats_view.clearSearch();
            if (this.model.messages_view)
                if (this.model.messages_view.data.get('visible'))
                    xabber.chats_view.openChat(this.model.item_view, {right_contact_save: true, clear_search: true, screen: xabber.body.screen.get('name')});
            $rich_textarea.placeCaretAtEnd();
        });
        if (attached_files && attached_files.length) {
            let failed_files = [],
                files_count = 0,
                file_check_dfd = new $.Deferred();
            file_check_dfd.done(() => {
                if (failed_files.length){
                    failed_files.forEach((file) => {
                        this.$(`.message-reference-preview-item-file[data-id="${file.uid}"]`).remove();
                        this.removeFileSnippetById(file.uid);
                    });
                    utils.dialogs.error(
                        '' + _.pluck(failed_files, 'name').join(` — ${xabber.getString("message__file_was_deleted__file_label")}. \n`) + ` — ${xabber.getString("message__file_was_deleted__file_label")}.`,
                        {},
                        xabber.getQuantityString("message__file_was_deleted", failed_files.length)
                    );
                    dfd.reject();
                } else {
                    dfd.resolve();
                }
            });
            if (!this.edit_message) {
                attached_files.forEach((file) => {
                    utils.tryReadingFile(file).then(()=> {
                        files_count++;
                        if (attached_files.length === files_count) {
                            file_check_dfd.resolve();
                        }
                    }, ()=> {
                        failed_files = failed_files.concat([file]);
                        files_count++;
                        if (attached_files.length === files_count) {
                            file_check_dfd.resolve();
                        }
                    });
                });
            } else {
                file_check_dfd.resolve();
            }
        } else {
            dfd.resolve();
        }
    },

    setEditedMessage: function (message) {
        this.click_counter = 0;
        this.setDefaultPlaceholder();
        let msg_text = message.get('message') || "";
        this.$('.fwd-messages-preview').showIf(this.edit_message);
        this.$('.fwd-messages-preview .msg-author').text(xabber.getString("edit_message__header"));
        this.$('.fwd-messages-preview .msg-text').html(Strophe.xmlescape(msg_text));
        this.$('.fwd-messages-preview').emojify('.msg-text', {emoji_size: 18});
        this.displaySend();
        xabber.chat_body.updateHeight();
        let markup_body = utils.markupBodyMessage(message, 'mention'),
            emoji_node = markup_body.emojify({tag_name: 'div'}),
            arr_text = emoji_node.split('\n');
        arr_text.forEach((item, idx) => {
            if (!item.includes('</blockquote>'))
                arr_text[idx] = '<p>' + arr_text[idx] + '</p>';
        });
        emoji_node = arr_text.join("");
        this.quill.setText("");
        this.quill.root.innerHTML = emoji_node;
        this.moveCursorToEnd();
        this.focusOnInput();
    },

    setRedactedUploadMessage: function (message) {
        this.click_counter = 0;
        this.setDefaultPlaceholder();
        let msg_text = message.get('message') || "";
        this.displaySend();
        xabber.chat_body.updateHeight();
        let markup_body = utils.markupBodyMessage(message, 'mention'),
            emoji_node = markup_body.emojify({tag_name: 'div'}),
            arr_text = emoji_node.split('\n');
        arr_text.forEach((item, idx) => {
            if (!item.includes('</blockquote>'))
                arr_text[idx] = '<p>' + arr_text[idx] + '</p>';
        });
        emoji_node = arr_text.join("");
        this.quill.setText("");
        this.quill.root.innerHTML = emoji_node;
        this.moveCursorToEnd();
        this.focusOnInput();
    },

    setForwardedMessages: function (messages) {
        this.fwd_messages = messages || [];
        this.$('.fwd-messages-preview').showIf(messages.length);
        if (messages.length) {
            let msg = messages[0],
                msg_author, msg_text, image_preview, $img_html_preview;
            if (messages.length > 1) {
                msg_text = xabber.getQuantityString("forwarded_messages_count", messages.length);
            } else {
                if (msg.get('forwarded_message')) {
                    msg_text = xabber.getQuantityString("forwarded_messages_count", messages.length);
                }
                else {
                    msg_text = (msg.get('message') || msg.get('original_message')).emojify();
                    let fwd_images = msg.get('images') || [],
                        fwd_files = msg.get('files') || [],
                        fwd_locations = msg.get('locations');
                    msg.get('videos') && msg.get('videos').length && (fwd_files = fwd_files.concat(msg.get('videos')));
                    if ((fwd_images && fwd_images.length) && (fwd_files && fwd_files.length)) {
                        msg_text = fwd_images.length + fwd_files.length + ' attachments';
                    }
                    else {
                        if (fwd_images && fwd_images.length) {
                            if (fwd_images.length > 1) {
                                msg_text =xabber.getQuantityString("recent_chat__last_message__images", fwd_images.length);
                            }
                            else {
                                image_preview = _.clone(msg.get('images')[0]);
                                $img_html_preview = this.createPreviewImage(image_preview);
                            }
                        }
                        if (fwd_files && fwd_files.length) {
                            if (fwd_files.length > 1) {
                                msg_text = xabber.getQuantityString("recent_chat__last_message__files", fwd_files.length);
                            }
                            else {
                                let filesize = fwd_files[0].size;
                                msg_text = filesize ? fwd_files[0].name + ",   " + filesize : fwd_files[0].name;
                            }
                        }
                        if (fwd_locations && fwd_locations.length) {
                            if (fwd_locations.length > 1) {
                                msg_text = xabber.getQuantityString("recent_chat__last_message__locations", fwd_locations.length);
                            }
                            else {
                                msg_text = xabber.getString("recent_chat__last_message__locations_plural_0");
                            }
                        }
                    }
                }
            }
            let from_jid = msg.get('from_jid');
            if (msg.isSenderMe()) {
                msg_author = this.account.get('name');
            } else {
                msg_author = (msg.get('user_info') && msg.get('user_info').nickname) || (this.account.contacts.get(from_jid) ? this.account.contacts.get(from_jid).get('name') : from_jid);
            }
            this.$('.fwd-messages-preview .msg-author').text(msg_author);
            if (_.isUndefined(image_preview)) {
                this.$('.fwd-messages-preview .msg-text').html(msg_text);
            }
            else {
                this.$('.fwd-messages-preview .msg-text').html($img_html_preview);
            }
        }
        xabber.chat_body.updateHeight();
        this.displaySend();
    },

    onShowMarkupPanel: function (ev) {
        let $clicked_icon = $(ev.target),
            is_panel_opened = $clicked_icon.hasClass('opened');
        this.$('.last-emoticons').showIf(is_panel_opened);
        this.$('.markup-panel').showIf(!is_panel_opened);
        $clicked_icon.switchClass('opened', !is_panel_opened);
    },

    createPreviewImage: function(image) {
        let imgContent = new Image();
            imgContent.src = image.sources[0];
        $(imgContent).addClass('fwd-img-preview');
        return imgContent;
    },

    unsetForwardedMessages: function (ev) {
        ev && ev.preventDefault && ev.preventDefault();
        let $rich_textarea = this.$('.input-message .rich-textarea');
        this.fwd_messages = [];
        if (this.edit_message) {
            this.removeAllFileSnippets();
            this.removeAllLinkReferences();
            this.$('.attach-file input').attr('disabled', false);
            $rich_textarea.flushRichTextarea();
        }
        this.edit_message = null;
        this.$('.fwd-messages-preview').addClass('hidden');
        let text = $rich_textarea.getTextFromRichTextarea();
        if (!text || text == "\n")
            this.displayMicrophone();
        else
            this.displaySend();
        xabber.chat_body.updateHeight();
        this.focusOnInput();
    },

    resetSelectedMessages: function () {
        this.content_view.$('.chat-message.selected').removeClass('selected');
        this.manageSelectedMessages();
    },

    manageSelectedMessages: function () {
        let $selected_msgs = this.content_view.$('.chat-message.selected'),
            $input_panel = this.$('.message-input-panel'),
            $message_actions = this.$('.message-actions-panel');
            length = $selected_msgs.length;
        $input_panel.hideIf(this.model.get('blocked') || length);
        $message_actions.showIf(length);
        this.model.get('blocked') && this.$('.blocked-msg').hideIf(length);
        if (length) {
            this.setButtonsWidth();
            let my_msg = false;
            if (length === 1) {
                if ($selected_msgs.first().data('from') === this.account.get('jid'))
                    my_msg = true;
                if (this.contact && this.contact.my_info)
                    if ($selected_msgs.first().data('from') === this.contact.my_info.get('id'))
                        my_msg = true;
                if ($selected_msgs.first().find('.mdi-play').length)
                    my_msg = false;
            }
            $message_actions.find('.pin-message-wrap').showIf(this.model.get('group_chat')).switchClass('non-active', ((length !== 1) && this.model.get('group_chat')));
            $message_actions.find('.reply-message-wrap').switchClass('non-active', this.model.get('blocked'));
            $message_actions.find('.forward-message-wrap').switchClass('non-active', this.model.get('encrypted'));
            $message_actions.find('.edit-message-wrap').switchClass('non-active', !((length === 1) && my_msg) || this.content_view.$('.chat-message.saved-main.selected').length || this.model.get('blocked'));
            !this.view.$('.chat-notification').hasClass('encryption-warning') && this.view.$('.chat-notification').removeClass('hidden').addClass('msgs-counter').text(xabber.getQuantityString("chat_screen__bottom_panel__selected_messages__text", length));
        } else {
            !this.view.$('.chat-notification').hasClass('encryption-warning') && this.view.$('.chat-notification').addClass('hidden').removeClass('msgs-counter').text("");
            this.focusOnInput();
        }
    },

    pinMessage: function () {
        if (!this.model.get('active'))
            return;
        if (this.$('.pin-message-wrap').hasClass('non-active'))
            return;
        let $msg = this.content_view.$('.chat-message.selected').first(),
            pinned_msg = this.messages_arr.get($msg.data('uniqueid')),
            msg_id = pinned_msg.get('stanza_id');
        this.resetSelectedMessages();
        let iq = $iq({type: 'set', to: this.contact.get('full_jid') || this.contact.get('jid')})
            .c('update', {xmlns: Strophe.NS.GROUP_CHAT})
            .c('pinned-message').t(msg_id);
        this.account.sendIQFast(iq, () => {},
            (error) => {
                if ($(error).find('not-allowed').length)
                    utils.dialogs.error(xabber.getString("groupchat_you_have_no_permissions_to_do_it"));
            });
    },

    copyMessages: function () {
        if (!this.model.get('active'))
            return;
        let $msgs = this.content_view.$('.chat-message.selected'),
            msgs = [];
        $msgs.each((idx, item) => {
            let msg = this.messages_arr.get(item.dataset.uniqueid);
            msg && msgs.push(msg);
        });
        this.resetSelectedMessages();
        this.pushMessagesToClipboard(msgs);
    },

    editMessage: function (text, text_markups) {
        let original_body = Array.from(Strophe.xmlescape(this.edit_message.get('original_message') || "")),
            forwarded_body = "",
            mutable_refs = this.edit_message.get('mutable_content') || [],
            groupchat_ref = mutable_refs && mutable_refs.find(item => item.type === 'groupchat'),
            stanza_id = this.edit_message.get('stanza_id'),
            forward_ref = mutable_refs && mutable_refs.filter(item => item.type === 'forward'),
            markups = text_markups.markup_references || [],
            files = text_markups.attached_files || [],
            link_references = text_markups.link_references || [],
            blockquotes = text_markups.blockquotes || [],
            mentions = text_markups.mentions || [],
            iq = $iq({type: 'set', to: (this.contact && this.contact.get('group_chat')) ? this.contact.get('jid') : this.account.get('jid')}).c('replace', {
                xmlns: Strophe.NS.REWRITE,
                type: this.model.get('sync_type') ? this.model.get('sync_type') : this.model.getConversationType(this.model),
                id: stanza_id
            }),
            $message = $build('message').attrs({xmlns: undefined});
        forward_ref && forward_ref.forEach((fwd, idx) => {
            let fwd_msg = this.edit_message.get('forwarded_message')[idx],
                gc_length = groupchat_ref && (groupchat_ref.start + groupchat_ref.end);
            $message.c('reference', {xmlns: Strophe.NS.REFERENCE, begin: (groupchat_ref ? (fwd.start - gc_length) : fwd.start), end: (groupchat_ref ? (fwd.end - gc_length) : fwd.end), type: 'mutable'})
                .c('forwarded', {xmlns: Strophe.NS.FORWARD})
                .c('delay', {
                    xmlns: 'urn:xmpp:delay',
                    stamp: fwd_msg.get('time')
                }).up().cnode(fwd_msg.get('xml')).up().up().up();
            forwarded_body += original_body.slice(fwd.start, fwd.end).join('');
        });
        markups.forEach((markup) => {
            $message.c('reference', {xmlns: Strophe.NS.REFERENCE, begin: markup.start + Array.from(forwarded_body).length, end: markup.end + Array.from(forwarded_body).length, type: 'decoration'});
            for (let idx in markup.markup)
                $message.c(markup.markup[idx], {xmlns: Strophe.NS.MARKUP}).up();
            $message.up();
        });
        blockquotes.forEach((blockquote) => {
            $message.c('reference', {xmlns: Strophe.NS.REFERENCE, begin: blockquote.start + Array.from(forwarded_body).length, end: blockquote.end + Array.from(forwarded_body).length, type: 'decoration'})
                .c('quote', {xmlns: Strophe.NS.MARKUP}).up().up();
        });
        mentions.forEach((mention) => {
            let mention_attrs = {xmlns: Strophe.NS.MARKUP};
            mention.is_gc && (mention_attrs.node = Strophe.NS.GROUP_CHAT);
            $message.c('reference', {xmlns: Strophe.NS.REFERENCE, begin: mention.start + Array.from(forwarded_body).length, end: mention.end + Array.from(forwarded_body).length, type: 'decoration'})
                .c('mention', mention_attrs).t(mention.target).up().up();
        });

        if (files && files.length) {
            mutable_refs = mutable_refs.filter(item => item.type !== 'file')
            files.forEach((file, idx) => {
                (idx === 0) && (text += '\n');
                let legacy_body = file.sources[0] + ((idx != files.length - 1) ? '\n' : ""),
                    start_idx = Array.from(_.escape(text)).length + Array.from(forwarded_body).length,
                    end_idx = start_idx + legacy_body.length;
                $message.c('reference', {
                    xmlns: Strophe.NS.REFERENCE,
                    type: 'mutable',
                    begin: start_idx,
                    end: end_idx
                });
                file.voice && $message.c('voice-message', {xmlns: Strophe.NS.VOICE_MESSAGE});
                $message.c('file-sharing', {xmlns: Strophe.NS.FILES}).c('file');
                file.type && $message.c('media-type').t(file.type).up();
                file['id'] && $message.c('gallery-id').t(file['id']).up();
                file.thumbnail && $message.c('thumbnail-uri').t(file.thumbnail).up();
                file.created && $message.c('created').t(file.created).up();
                file.name && $message.c('name').t(file.name).up();
                file.size && $message.c('size').t(file.size).up();
                file.height && $message.c('height').t(file.height).up();
                file.width && $message.c('width').t(file.width).up();
                file.duration && $message.c('duration').t(file.duration).up();
                file.description && $message.c('desc').t(file.description).up();
                $message.up().c('sources');
                file.sources.forEach((u) => {
                    if (file.key)
                        u = u.replace(/^(https|http)/, 'aescbc') + '#' + utils.ArrayBuffertoBase64(file.key);
                    $message.c('uri').t(u).up();
                });
                $message.up().up().up();
                file.voice && $message.up();
                text += legacy_body;
                mutable_refs.push({start: start_idx, end: end_idx});
            });
        }

        if (link_references && link_references.length) {
            mutable_refs = mutable_refs.filter(item => item.type !== 'link_reference')
            link_references.forEach((link_reference, idx) => {
                if (link_reference.start === -1) {
                    link_reference.start = Array.from(_.escape(text)).length + Array.from(forwarded_body).length;
                    text = text + '\n' + link_reference.original_text;
                    link_reference.end = link_reference.start + link_reference.original_text.length + 1;
                }
                $message.c('reference', {
                    xmlns: Strophe.NS.REFERENCE,
                    begin: link_reference.start,
                    end: link_reference.end,
                    type: 'mutable',
                }).c('ogp', { xmlns: Strophe.NS.OGP, url: link_reference.original_text });
                link_reference.site && $message.c('meta', { property: 'og:site_name', content: link_reference.site}).up();
                link_reference.type && $message.c('meta', { property: 'og:type', content: link_reference.type}).up();
                link_reference.title && $message.c('meta', { property: 'og:title', content: link_reference.title}).up();
                link_reference.url && $message.c('meta', { property: 'og:url', content: link_reference.url}).up();
                link_reference.description && $message.c('meta', { property: 'og:description', content: link_reference.description}).up();
                link_reference.image && $message.c('meta', { property: 'og:image', content: link_reference.image}).up();
                link_reference.image_width && $message.c('meta', { property: 'og:image:width', content: link_reference.image_width}).up();
                link_reference.image_height && $message.c('meta', { property: 'og:image:height', content: link_reference.image_height}).up();
                link_reference.video_url && $message.c('meta', { property: 'og:video:url', content: link_reference.video_url}).up();
                $message.up().up();
                mutable_refs.push({start: link_reference.start, end: link_reference.end});
            });
        }
        mutable_refs && mutable_refs.length && this.edit_message.set({mutable_content: mutable_refs});
        if (!(Strophe.xmlunescape(forwarded_body) + text)){
            this.deleteMessages(null, [this.edit_message]);
            return;
        }
        $message.c('body').t(Strophe.xmlunescape(forwarded_body) + text).up();
        this.unsetForwardedMessages();
        if (this.model.get('encrypted')) {
            let decrypted_msg = $message.tree().innerHTML;
            $message.c('envelope', {xmlns: Strophe.NS.SCE}).c('content')
            if ($($message.tree()).children('body').length) {
                $message.cnode($($message.tree()).children('body')[0]).attrs({'xmlns': Strophe.NS.CLIENT}).up()
                $($message.tree()).children('body').detach()
            }
            if ($($message.tree()).children('reference').length) {
                $($message.tree()).children('reference').each((idx, reference) => {
                    $message.cnode($($message.tree()).children('reference')[idx]).up()
                });
                $($message.tree()).children('reference').detach()
            }
            $message.up().c('rpad').t('0'.repeat(200).slice(1, Math.floor((Math.random() * 198) + 1))).up()
            $message.c('from', {jid: this.account.get('jid')}).up().up()
            this.account.omemo.encrypt(this.contact, $message).then((msg) => {
                iq.cnode(msg.message.tree());
                this.account.omemo.cached_messages.putMessage(this.contact, stanza_id, {envelope: decrypted_msg});
                this.account.sendIQFast(iq);
            });
        } else {
            iq.cnode($message.tree());
            this.account.sendIQFast(iq);
        }
    },

    showEditPanel: function () {
        if (!this.model.get('active') || this.model.get('encrypted'))
            return;
        if (this.$('.edit-message-wrap').hasClass('non-active'))
            return;
        let $msg = this.content_view.$('.chat-message.selected').first(),
            edit_msg = this.messages_arr.get($msg.data('uniqueid'));
        this.edit_message = edit_msg;
        this.resetSelectedMessages();
        this.setEditedMessageAttachments(edit_msg);
        this.setEditedMessage(edit_msg);
    },

    deleteMessages: function (ev, messages) {
        if (!this.model.get('active'))
            return;
        let $msgs = this.content_view.$('.chat-message.selected'),
            msgs = [],
            my_msgs = 0,
            dialog_options = [];
        $msgs.each((idx, item) => {
            let msg = this.messages_arr.get(item.dataset.uniqueid);
            msg && msgs.push(msg);
            msg.isSenderMe() && my_msgs++;
        });
        messages && messages.forEach((item, idx) => {
            msgs.push(item);
            item.isSenderMe() && my_msgs++;
        });
        if (this.account.server_features.get(Strophe.NS.REWRITE) || this.model.get('group_chat')) {
            let dfd = new $.Deferred();
            dfd.done(() => {
                utils.dialogs.ask(xabber.getString("dialog_delete_messages__header"), xabber.getQuantityString("delete_message_question", msgs.length),
                    dialog_options, {ok_button_text: xabber.getString("delete")}).done((res) => {
                    if (!res) {
                        this._clearing_history = false;
                        messages && messages.length && this.focusOnInput();
                        return;
                    }
                    let symmetric = (this.model.get('group_chat')) ? true : (res.symmetric_deletion ? true : false);
                    this.resetSelectedMessages();
                    if (this.account.get('gallery_token') && this.account.get('gallery_url'))
                        this.deleteFilesFromMessages(msgs);
                    this.model.retractMessages(msgs, this.model.get('group_chat'), symmetric);
                    messages && messages.length && this.unsetForwardedMessages();
                });
            });
            if (!this.model.get('group_chat') && !this.model.get('saved') && my_msgs == $msgs.length && this.contact && this.contact.domain){
                if (this.contact.get('server_has_rewrite')){
                    dialog_options = [{
                        name: 'symmetric_deletion',
                        checked: false,
                        text: xabber.getString("dialog_clear_chat_history__option_delete_for_all")
                    }];
                    dfd.resolve();
                } else {
                    this.account.connection.disco.info(this.contact.domain, null, (iq) => {
                        let $rewrite = $(iq).find('feature[var="' + Strophe.NS.REWRITE + '"]');
                        if ($rewrite.length) {
                            dialog_options = [{
                                name: 'symmetric_deletion',
                                checked: false,
                                text: xabber.getString("dialog_clear_chat_history__option_delete_for_all")
                            }];
                            this.contact.set('server_has_rewrite', true);
                            dfd.resolve();
                        } else {
                            dfd.resolve();
                        }
                    });
                }
            } else
                dfd.resolve();
        }
        else {
            utils.dialogs.ask(xabber.getString("dialog_delete_messages__header"), `${xabber.getQuantityString("delete_message_question", msgs.length)}\n${xabber.getString("dialog_clear_chat_history__warning_deletion_not_supported", [this.account.domain]).fontcolor('#E53935')}`,
                dialog_options, {ok_button_text: xabber.getString("dialog_clear_chat_history__button_delete_locally")}).done((res) => {
                if (!res) {
                    this._clearing_history = false;
                    messages && messages.length && this.focusOnInput();
                    return;
                }
                this.resetSelectedMessages();
                if (this.account.get('gallery_token') && this.account.get('gallery_url'))
                    this.deleteFilesFromMessages(msgs);
                msgs.forEach((item) => { this.view.removeMessage(item); })
                messages && messages.length && this.unsetForwardedMessages();
            });
        }
    },

    deleteFilesFromMessages: function (messages) {
        messages.forEach((item) => {
            if (!item.isSenderMe())
                return;
            item.get('files') && _.isArray(item.get('files')) && item.get('files').forEach((item) => {
                item && item.id && this.account.deleteFile(item.id,(response) => {
                    item.id = null;
                }, (err) => {
                    item.id = null;
                });
            });
            item.get('images') && _.isArray(item.get('images')) && item.get('images').forEach((item) => {
                item && item.id && this.account.deleteFile(item.id,(response) => {
                    item.id = null;
                }, (err) => {
                    item.id = null;
                });
            });
            item.get('videos') && _.isArray(item.get('videos')) && item.get('videos').forEach((item) => {
                item && item.id && this.account.deleteFile(item.id,(response) => {
                    item.id = null;
                }, (err) => {
                    item.id = null;
                });
            });
        });
    },

    pushMessagesToClipboard: function (messages) {
        let fwd_msg_indicator = "",
            copied_messages = this.createTextMessage(messages, fwd_msg_indicator);
        utils.copyTextToClipboard(_.unescape(copied_messages));
    },

    createTextMessage: function (messages, fwd_msg_indicator) {
        let text_message = "";
        for (let i = 0; i < messages.length; i++) {
            let $msg = messages[i];
            if (this.model.get('saved') && $msg.get('forwarded_message') && $msg.get('forwarded_message').length === 1 && !$msg.get('message'))
                $msg = $msg.get('forwarded_message')[0];
            let current_date = moment($msg.get('timestamp')).startOf('day'),
                prev_date = (i) ? moment(messages[i - 1].get('timestamp')).startOf('day') : moment(0),
                msg_sender = "";
                if (prev_date.format('x') != current_date.format('x')) {
                    text_message += (fwd_msg_indicator.length ? fwd_msg_indicator + ' ' : "") + pretty_date(current_date) + '\n';
                }
                msg_sender = $msg.isSenderMe() ? this.account.get('name') : ($msg.get('user_info') && $msg.get('user_info').nickname || (this.account.contacts.get($msg.get('from_jid')) ? this.account.contacts.get($msg.get('from_jid')).get('name') : $msg.get('from_jid')));
                text_message += (fwd_msg_indicator.length ? fwd_msg_indicator + ' ' : "") + "[" + utils.pretty_time($msg.get('timestamp')) + "] " + msg_sender + ":\n";
                fwd_msg_indicator.length && (text_message += fwd_msg_indicator);
                let original_message = _.unescape(($msg.get('mutable_content') && $msg.get('mutable_content').find(ref => ref.type === 'groupchat')) ? $msg.get('original_message').slice($msg.get('mutable_content').find(ref => ref.type === 'groupchat').end) : $msg.get('original_message'));
                fwd_msg_indicator.length && (original_message = original_message.replace(/\n/g, '\n&gt; '));
                (fwd_msg_indicator.length && original_message.indexOf('&gt;') !== 0) && (text_message += ' ');
                (original_message = _.unescape(original_message.replace(/\n&gt; &gt;/g, '\n&gt;&gt;')));
                text_message += _.escape(original_message) + '\n';
        }
        return text_message.trim();
    },

    replyMessages: function () {
        if (!this.model.get('active'))
            return;
        let $msgs = this.content_view.$('.chat-message.selected'),
            msgs = [];
        $msgs.each((idx, item) => {
            let msg = this.messages_arr.get(item.dataset.uniqueid);
            if (msg) {
                if (this.model.get('saved') && msg.get('forwarded_message') && msg.get('forwarded_message').length && !msg.get('message')) {
                    msgs = msgs.concat(msg.get('forwarded_message'));
                } else
                    msgs.push(msg);
            }
        });
        this.resetSelectedMessages();
        this.setForwardedMessages(msgs);
    },

    forwardMessages: function () {
        if (!this.model.get('active') || this.model.get('encrypted'))
            return;
        if (this.$('.forward-message-wrap').hasClass('non-active'))
            return;
        let $msgs = this.content_view.$('.chat-message.selected'),
            msgs = [];
        $msgs.each((idx, item) => {
            let msg = this.messages_arr.get(item.dataset.uniqueid);
            if (msg) {
                if (this.model.get('saved') && msg.get('forwarded_message') && msg.get('forwarded_message').length && !msg.get('message')) {
                    msgs = msgs.concat(msg.get('forwarded_message'));
                } else
                    msgs.push(msg);
            }
        });
        this.resetSelectedMessages();
        if (!xabber.forward_panel)
            xabber.forward_panel = new xabber.ForwardPanelView({ model: xabber.opened_chats });
        xabber.forward_panel.open(msgs, this.account);
    },

    showChatNotification: function (message, is_colored) {
        if (!this.view.$('.chat-notification').hasClass('msgs-counter') && !this.view.$('.chat-notification').hasClass('encryption-warning')) {
            this.view.$('.chat-notification').switchClass('hidden', !message).text(message)
                .switchClass('text-color-300', is_colored);
        }
    }
});

xabber.ChatHeadContainer = xabber.Container.extend({
    className: 'chat-head-container panel-head noselect'
});

xabber.ChatBodyContainer = xabber.Container.extend({
    className: 'chat-body-container',

    // TODO: refactor CSS and remove this
    updateHeight: function () {
        let bottom_height = xabber.chat_bottom.$el.height() + parseInt(xabber.chat_bottom.$el.css('bottom'));
        if (bottom_height) {
            let current_bottom = parseInt(this.$el.css('bottom'));
            this.$el.css({bottom: bottom_height});
            if (this.view) {
                this.view.updateScrollBar();
                (bottom_height != current_bottom) && !this.view.isScrolledToBottom() && this.view.scrollTo(this.view.ps_container[0].scrollTop + (bottom_height - current_bottom));
            }
        }
    }
});

xabber.ChatBodyPlaceholderContainer = xabber.Container.extend({
    className: 'chat-body-placeholder-container',
});

xabber.NotificationsPlaceholder = xabber.BasicView.extend({
    className: 'notifications-placeholder',
    events: {
        "click .btn-request-notifications": "requestNotifications",
        "click .mdi-close": "close"
    },

    _initialize: function (options) {
        this.$el.html(`${xabber.getString("desktop_notifications__alert_enable__text", [constants.CLIENT_NAME])} <span class="btn-request-notifications">${xabber.getString("desktop_notifications__alert_enable__link_text")}</span><button class="btn-request-notifications btn-flat btn-dark btn-main">${xabber.getString("chat_allow")}</button>`);
        this.$el.append($('<i/>').addClass('mdi mdi-22px mdi-close'));
        xabber.on("update_screen", this.onUpdatedScreen, this);
    },

    requestNotifications: function () {
        window.Notification.requestPermission((permission) => {
            xabber._cache.save({'notifications': (permission === 'granted'), 'ignore_notifications_warning': true});
            this.close();
        });
    },

    onUpdatedScreen: function () {
        if (!xabber.notifications_placeholder)
            return;
        this.$el.detach();
        xabber.placeholders_wrap.$el.append(this.$el);
        xabber.main_panel.$el.css('padding-bottom', xabber.placeholders_wrap.$el.height());
    },

    close: function () {
        xabber._cache.save('ignore_notifications_warning', true);
        this.remove();
        xabber.notifications_placeholder = undefined;
        xabber.main_panel.$el.css('padding-bottom', xabber.placeholders_wrap.$el.height());
    }
});

xabber.ChatBottomContainer = xabber.Container.extend({
    className: 'chat-bottom-container'
});

xabber.ChatPlaceholderView = xabber.BasicView.extend({
    className: 'placeholder-wrap chat-placeholder-wrap noselect',
    template: templates.chat_placeholder,

    _initialize: function (options) {
        xabber.on('update_placeholder',this.onPlaceholderUpdate, this);
    },

    onPlaceholderUpdate: function () {
        if (xabber.toolbar_view.$('.toolbar-item.jingle-calls.active').length || xabber.toolbar_view.$('.toolbar-item.geolocation-chats.active').length){
            this.$('.text').text(xabber.getString("message_manager_error_not_implemented"));
        } else {
            this.$('.text').text(xabber.getString("chat_list__placeholder"));
        }
    },
});

xabber.ChatSettings = Backbone.ModelWithStorage.extend({
    defaults: {
        last_emoji: [],
        muted: [],
        archived: [],
        group_chat: [],
        cached_avatars: [],
        group_chat_members_lists: []
    },

    getLastEmoji: function () {
        return _.clone(this.get('last_emoji'));
    },

    updateLastEmoji: function (emoji) {
        let last_emoji_icons = _.clone(this.get('last_emoji'));
        if (last_emoji_icons.length > 0) {
            let index = last_emoji_icons.indexOf(emoji);
            if (index != -1)
                last_emoji_icons.splice(index, 1);
            last_emoji_icons.push(emoji);
            while (last_emoji_icons.length > 7)
                last_emoji_icons.shift();
        }
        else
            last_emoji_icons.push(emoji);
        this.save('last_emoji', last_emoji_icons);
    },

    updateMutedList: function (jid, muted) {
        let muted_list = _.clone(this.get('muted')),
            index = muted_list.indexOf(jid);
        if (muted && index < 0) {
            muted_list.push(jid);
        }
        if (!muted && index >= 0) {
            muted_list.splice(index, 1);
        }
        this.save('muted', muted_list);
    },

    updateArchiveChatsList: function (jid, archived) {
        let archived_list = _.clone(this.get('archived')),
            index = archived_list.indexOf(jid);
        if (archived && index < 0) {
            archived_list.push(jid);
        }
        if (!archived && index >= 0) {
            archived_list.splice(index, 1);
        }
        this.save('archived', archived_list);
    },

    updateGroupChatsList: function (jid, group_chat) {
        let group_chat_list = _.clone(this.get('group_chat')),
            index = group_chat_list.indexOf(jid);
        if (group_chat && index < 0) {
            group_chat_list.push(jid);
        }
        if (!group_chat && index >= 0) {
            group_chat_list.splice(index, 1);
        }
        this.save('group_chat', group_chat_list);
    },

    updateCachedAvatars: function (id, hash, avatar) {
        let avatar_list = _.clone(this.get('cached_avatars')),
            member = avatar_list.indexOf(avatar_list.find(member => member.id === id));
        if (member != -1) {
            avatar_list.splice(member, 1);
        }
        avatar_list.push({id: id, avatar_hash: hash, avatar_b64: avatar});
        this.save('cached_avatars', avatar_list);
    },

    getAvatarInfoById: function (id) {
        let avatar_list = _.clone(this.get('cached_avatars')),
            result = avatar_list.find(member => member.id === id);
        return result;
    },

    getB64Avatar: function (id) {
        let result = this.getAvatarInfoById(id);
        if (result)
            return result.avatar_b64;
        else
            return;
    },

    getHashAvatar: function (id) {
        let result = this.getAvatarInfoById(id);
        if (result)
            return result.avatar_hash;
    }
});

xabber.Account.addInitPlugin(function () {
    this.chat_settings = new xabber.ChatSettings({id: 'chat-settings'}, {
        account: this,
        storage_name: xabber.getStorageName() + this.get('jid'),
        fetch: 'after'
    });
    this.messages = new xabber.Messages(null, {account: this});
    this.forwarded_messages = new xabber.Messages(null, {account: this});
    this.pinned_messages = new xabber.Messages(null, {account: this});

    this.chats = new xabber.AccountChats(null, {account: this});
});

xabber.Account.addConnPlugin(function () {
    let timestamp = this.last_msg_timestamp || this.disconnected_timestamp;
    this.chats.registerMessageHandler();
    this.chats.each((chat) => {
        if (!this.connection.do_synchronization) {
            if (chat.messages.length)
                chat.trigger('get_missed_history', timestamp);
            else
                chat.trigger('load_last_history');
        }
    });

    this.connection.deleteTimedHandler(this._get_msg_handler);
    this._get_msg_handler = this.connection.addTimedHandler(60000, () => {
        //readds msg handler if it somehow dissapears
        if (this.connection && !this.connection.handlers.find(h => !h.ns && !h.options.encrypted && h.name === 'message')) {
            let last_msg_timestamp = this.last_msg_timestamp;
            this.chats.registerMessageHandler();
            let options = {};
            this.cached_sync_conversations.getFromCachedConversations('last_sync_timestamp', (res) => {
                let last_sync_timestamp = res && res.timestamp ? res.timestamp : null;
                !this.roster.last_chat_msg_id && (options.max = constants.SYNCHRONIZATION_RSM_MAX);
                last_sync_timestamp && (options.stamp = last_sync_timestamp);
                this.roster && this.roster.syncFromServer(options, Boolean(last_sync_timestamp), true);
                this.roster && this.roster.getRoster();
            });
        }
        return true;
    });
    if (_.isUndefined(this.settings.get('omemo')) && !this.omemo_enable_placeholder) {
        this.omemo_enable_placeholder = new xabber.OMEMOEnablePlaceholder({account: this});
    }
}, true, true);

xabber.Account.addFastConnPlugin(function () {
    this.getVCard();
    if (!(this.auth_view && this.auth_view.data.get('authentication')))
        this.trigger('ready_to_get_roster');
}, true, true);

xabber.once("start", function () {
    ["keydown"].forEach((event) => {
        window.addEventListener(event, (e) => {
            document.onselectstart = function() {
                return !((e.ctrlKey || e.metaKey) && e.keyCode == constants.KEY_SHIFT || e.shiftKey && e.keyCode == constants.KEY_CTRL || e.keyCode == constants.KEY_SHIFT);
            }
        });
    });
    ["keyup"].forEach((event) => {
        window.addEventListener(event, (e) => {
            document.onselectstart = function() {
                return true;
            }
        });
    });
    this.chats = new this.Chats;
    this.chats.addCollection(this.opened_chats = new this.OpenedChats);
    this.chats.addCollection(this.closed_chats = new this.ClosedChats);
    this.chats.registerQuillEmbeddedsTags();

    this.chats_view = this.left_panel.addChild('chats',
            this.ChatsView, {model: this.opened_chats});
    this.chat_head = this.right_panel.addChild('chat_head',
            this.ChatHeadContainer);
    this.chat_body = this.right_panel.addChild('chat_body',
            this.ChatBodyContainer);
    this.chat_body_placeholder = this.right_panel.addChild('chat_body_placeholder',
            this.ChatBodyPlaceholderContainer);
    this.chat_bottom = this.right_panel.addChild('chat_bottom',
            this.ChatBottomContainer);
    this.chat_placeholder = this.right_panel.addChild('chat_placeholder',
            this.ChatPlaceholderView);

    this.on("add_group_chat", function (attrs) {
        if (!this.add_group_chat_view)
            this.add_group_chat_view = new this.AddGroupChatView();
        this.add_group_chat_view.show(attrs);
    }, this);

    this.on("change:focused", function () {
        if (this.get('focused')) {
            let view = this.chats_view.active_chat;
            if (view && view.model.get('display')) {
                view.content.onScroll(null, true);
                if (view.model.get('is_accepted') !== false)
                    view.content.bottom.focusOnInput();
            }
        }
    }, this);

    this.on("change:idle", function () {
        if (!this.get('idle')) {
            let view = this.chats_view.active_chat;
            if (view && view.model.get('display')) {
                view.content.onScroll(null, true);
                if (view.model.get('is_accepted') !== false)
                    view.content.bottom.focusOnInput();
            }
        }
    }, this);

    this.on("show_group_chats", function () {
        this.chats_view.showGroupChats();
    }, this);

    this.on("show_chats", function () {
        this.chats_view.showChats();
    }, this);

    this.on("show_all_chats", function (no_unread) {
        this.chats_view.showAllChats(no_unread);
    }, this);

    this.on("show_archive_chats", function (no_unread) {
        this.chats_view.showArchiveChats(no_unread);
    }, this);

    this.on("show_saved_chats", function (no_unread) {
        this.chats_view.showSavedChats(no_unread);
    }, this);

    this.on("show_notification_chats", function (no_unread) {
        this.chats_view.showNotifications(no_unread);
    }, this);

    this.on("clear_search", function () {
        this.contacts_view.clearSearch();
        this.chats_view.clearSearch();
    }, this);
}, xabber);

export default xabber;
