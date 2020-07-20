define("xabber-chats", function () {
  return function (xabber) {
    var env = xabber.env,
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
        Emoji = utils.emoji;

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
            var time = this.get('time'), attrs = {};
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
            this.on("change:origin_id stanza_id archived_id", this.updateUniqueId, this);
        },

        updateUniqueId: function () {
            this.set('unique_id', this.get('origin_id') || this.get('stanza_id') || this.get('archived_id') || this.get('msgid'));
        },

        getText: function () {
            var forwarded_message = this.get('forwarded_message');
            if (forwarded_message) {
                return forwarded_message.get('message');
            }
            return this.get('message');
        },

        getState: function () {
            return constants.MSG_STATE[this.get('state')];
        },

        getVerboseState: function () {
            var state = constants.MSG_VERBOSE_STATE[this.get('state')];
            if (this.account) {
                if (!this.account.isOnline()) {
                    state = 'Message will be sent when you get online.'
                }
            }
            else
            if (!this.collection.account.isOnline()) {
                state = 'Message will be sent when you get online.'
            }
            return state;
        },

        isSenderMe: function () {
            if (this.account)
                return this.account.get('jid') === this.get('from_jid');
            else if (this.collection.account)
                return this.collection.account.get('jid') === this.get('from_jid');
            else
                false;
        }
    });

    xabber.MessagesBase = Backbone.Collection.extend({
        model: xabber.Message,
    });

      xabber.SearchedMessages = xabber.MessagesBase.extend({
          comparator: 'timestamp',

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
          }
      });

      xabber.Messages = Backbone.Collection.extend({
        model: xabber.Message,
        comparator: 'timestamp',

        initialize: function (models, options) {
            this.account = options.account;
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
                unique_id = origin_id || options.stanza_id || archive_id || msgid,
                message = unique_id && this.get(unique_id),
                $group_info = $message.children('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"]'),
                is_private_invitation,
                group_info_attributes = {};

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
            body && (attrs.message = body);

            let contact = this.account.contacts.mergeContact(Strophe.getBareJidFromJid(from_jid)),
                chat = this.account.chats.getChat(contact);
            contact.set('group_chat', true);
            contact.set('in_roster', false);
            contact.getVCard();
            if ($group_info.length) {
                let name = $group_info.find('name').text(),
                    model = $group_info.find('membership').text(),
                    anonymous = $group_info.find('privacy').text(),
                    searchable = $group_info.find('index').text(),
                    parent_chat = $group_info.find('parent-chat').text(),
                    description = $group_info.find('description').text();
                name && (group_info_attributes.name = name);
                model && (group_info_attributes.model = name);
                anonymous && (group_info_attributes.anonymous = anonymous);
                searchable && (group_info_attributes.searchable = searchable);
                description && (group_info_attributes.description = description);
                parent_chat.length && (is_private_invitation = true);
                is_private_invitation && contact.set('private_chat', true);
                anonymous === 'incognito' && contact.set('incognito_chat', true);
                contact.set('group_info', group_info_attributes);
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
                body = $message.children('body').text(),
                markable = $message.find('markable').length > 0,
                archive_id = $message.children('archived').attr('id'),
                origin_id = $message.children('origin-id').attr('id'),
                msgid = $message.attr('id'),
                unique_id = origin_id || options.stanza_id || archive_id || msgid,
                message = unique_id && this.get(unique_id);

            if (options.replaced) {
                $message = $message.children('replace').children('message');
                body = $message.children('body').text();
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

            if (message && !options.replaced && !options.context_message && !options.searched_message && !options.pinned_message && !options.participant_message && !options.echo_msg && !options.is_searched)
                return message;

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
                    is_archived: options.is_archived
                },
                mentions = [], blockquotes = [], markups = [], mutable_content = [], files = [], images = [];

            options.encrypted && (attrs.encrypted = true);

            $message.children('reference[xmlns="' + Strophe.NS.REFERENCE + '"]').each(function (idx, reference) {
                let $reference = $(reference),
                    type = $reference.attr('type'),
                    begin = parseInt($reference.attr('begin')),
                    end = parseInt($reference.attr('end'));
                if (type === 'decoration') {
                    if ($reference.children('mention[xmlns="'  + Strophe.NS.MARKUP + '"]').length) {
                        let $mention = $reference.children('mention[xmlns="'  + Strophe.NS.MARKUP + '"]'),
                            target = $mention.text(),
                            is_gc = $mention.attr('node') === Strophe.NS.GROUP_CHAT ? true : false;
                        mentions.push({start: begin, end: end, target: target, is_gc: is_gc});
                    } else {
                        let markup = [];
                        $reference.children().each(function (i, child_ref) {
                            if (constants.MARKUP_TAGS.indexOf(child_ref.tagName) > -1 && $(child_ref).attr('xmlns') === Strophe.NS.MARKUP) {
                                if (child_ref.tagName === 'link')
                                    markup.push({type: child_ref.tagName, uri: $(child_ref).text()});
                                else if (child_ref.tagName === 'quote') {
                                    blockquotes.push({start: begin, end: end});
                                } else
                                    markup.push(child_ref.tagName);
                            }
                        }.bind(this));
                        markup.length && markups.push({start: begin, end: end, markup: markup});
                    }
                } else if (type === 'mutable') {
                    let $file_sharing = $reference.find('file-sharing[xmlns="' + Strophe.NS.OTB + '"]').first();
                    if ($reference.children('forwarded').length)
                        mutable_content.push({ start: begin, end: end, type: 'forward'});
                    else if ($file_sharing.length) {
                        let type = $file_sharing.parent('voice-message[xmlns="' + Strophe.NS.VOICE_MESSAGE + '"]').length ? 'voice' : 'file',
                            $file = $file_sharing.children('file'), file_attrs = {}, sources = [];
                        mutable_content.push({ start: begin, end: end, type: type});
                        $file_sharing.children('sources').children('uri').each(function (i, uri) {sources.push($(uri).text());}.bind(this));
                        file_attrs = {
                            name: $file.children('name').text(),
                            hash: $file.children('hash[xmlns="' + Strophe.NS.HASH + '"]').text(),
                            size: $file.children('size').text(),
                            type: $file.children('media-type').text(),
                            duration: $file.children('duration').text(),
                            description: $file.children('desc').text(),
                            height: $file.children('height').text(),
                            width: $file.children('width').text(),
                            voice: type === 'voice',
                            sources: sources
                        };
                        if (this.getFileType($file.children('media-type').text()) === 'image')
                            images.push(file_attrs);
                        else
                            files.push(file_attrs);
                    }
                } else if (type === 'data') {}
            }.bind(this));

            $message.children('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"]').each(function (idx, x_elem) {
                let $reference = $(x_elem).children('reference[type="mutable"][xmlns="' + Strophe.NS.REFERENCE + '"]'),
                    $user = $reference.children('user[xmlns="' + Strophe.NS.GROUP_CHAT + '"]').first();
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
                                avatar: $user.children('metadata[xmlns="' + Strophe.NS.PUBSUB_AVATAR_METADATA + '"]').children('info').attr('id'),
                                badge: $user.children('badge').text()
                            },
                            from_jid: user_jid || user_id,
                            groupchat_jid: Strophe.getBareJidFromJid(options.is_sender ? $message.attr('to') : $message.attr('from'))
                        });
                    }
            }.bind(this));

            blockquotes.length && (attrs.blockquotes = blockquotes);
            mentions.length && (attrs.mentions = mentions);
            markups.length && (attrs.markups = markups);
            images.length && (attrs.images = images);
            files.length && (attrs.files = files);
            mutable_content.length && (attrs.mutable_content = mutable_content);

            options.stanza_id && (attrs.stanza_id = options.stanza_id);
            origin_id && (attrs.origin_id = origin_id);
            archive_id && (attrs.archive_id = archive_id);

            (options.replaced || mentions.length) && (attrs.mentions = mentions);
            (options.replaced || markups.length) && (attrs.markups = markups);

            if ($message.children('x[xmlns="' + Strophe.NS.GROUP_CHAT + '#system-message"]').length) {
                attrs.type = 'system';
                attrs.participants_version = $message.children('x[xmlns="' + Strophe.NS.GROUP_CHAT + '#system-message"]').attr('version');
            }

            if ($message.find('x[xmlns="' + Strophe.NS.DATAFORM + '"]').length &&
                $message.find('x[xmlns="' + Strophe.NS.DATAFORM + '"] field[var="FORM_TYPE"][type="hidden"] value').text() === Strophe.NS.WEBCHAT) {
                let addresses = [];
                $message.children(`addresses[xmlns="${Strophe.NS.ADDRESS}"]`).children('address').each(function (idx, address) {
                    let $address = $(address);
                    addresses.push({type: $address.attr('type'), jid: $address.attr('jid')});
                }.bind(this));
                attrs.data_form = _.extend(this.account.parseDataForm($message.find('x[xmlns="' + Strophe.NS.DATAFORM + '"]')), {addresses: addresses});
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
            if (options.echo_msg) {
                attrs.state = constants.MSG_DELIVERED;
                attrs.timestamp = Number(moment(attrs.time));
                attrs.from_jid = this.account.get('jid');
            }
            (options.context_message || options.participant_message || options.searched_message || options.is_searched) && (attrs.state = constants.MSG_ARCHIVED);

            if (options.pinned_message)
                return this.account.pinned_messages.create(attrs);

            if (options.participant_message)
                return this.account.participant_messages.create(attrs);

            if (options.searched_message)
                return this.account.searched_messages.create(attrs);

            if (options.context_message)
                return this.account.context_messages.create(attrs);

            if (options.echo_msg || options.replaced && message) {
                message.set(attrs);
                if (options.replaced)
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

            message = this.create(attrs);
            return message;
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
              this.audio_notifiation = xabber.playAudio('call', true);
              this.modal_view = new xabber.JingleMessageView({model: this});
              this.conn = new RTCPeerConnection({
                  iceServers: [
                      {
                          urls: "stun:stun.l.google.com:19302"
                      },
                      {
                          urls: 'turn:192.158.29.39:3478?transport=udp',
                          credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
                          username: '28224511:1379330808'
                      }
                  ],
                  sdpSemantics: 'unified-plan'
              });
              this.$remote_video_el = $('<video autoplay class="webrtc-remote-video"/>');
              this.$remote_audio_el = $('<audio autoplay class="webrtc-remote-audio hidden"/>');
              this.$local_video = this.modal_view.$el.find('.webrtc-local-video');
              this.current_timer = 0;
              this.conn.onconnectionstatechange = this.onChangeConnectionState.bind(this);
              this.set(attrs);
              this.get('in') && this.updateStatus('Calling...');
              this.onChangedMediaType();
              this.conn.ontrack = function (ev) {
                  this.remote_stream = ev.streams[0];
                  this.modal_view.$el.find('.webrtc-remote-audio')[0].srcObject = ev.streams[0];
              }.bind(this);
              this._waiting_timeout = setTimeout(function () {
                  (!this.get('state') && this.get('status') === 'calling' && this.get('call_initiator') === this.account.get('jid')) && this.reject();
              }.bind(this), constants.JINGLE_WAITING_TIME * 1000);
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
              this.iq_handler = this.account.connection.addHandler(
                  function (iq) {
                      this.onIQ(iq);
                      return true;
                  }.bind(this), null, 'iq', 'set');

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
              this.call_timer = setInterval(function () {
                  this.updateTimer();
              }.bind(this), 1000);
          },

          onConnected: function () {
              this.get('video_live') && this.onChangedVideoValue();
              xabber.stopAudio(this.audio_notifiation);
              setTimeout(function () {
                  this.set('status', 'connected');
                  this.updateStatus();
                  this.startTimer();
              }.bind(this), 1000);
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
                      this._timeout_failed = setTimeout(function (){
                          if (peer_conn.connectionState === 'failed' || peer_conn.connectionState === 'disconnected') {
                              this.set('status', conn_state);
                              this.reject();
                              this.destroy();
                              this.updateStatus('Network error...');
                              xabber.current_voip_call = null;
                          }
                      }.bind(this), 40000);
                      peer_conn.restartIce();
                  }
                  if (conn_state === 'disconnected') {
                      this.set('status', conn_state);
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
                  this._timeout_failed = setTimeout(function (){
                      if (peer_conn.iceConnectionState === 'failed' || peer_conn.connectionState === 'disconnected') {
                          this.set('status', conn_state);
                          this.reject();
                          this.destroy();
                          this.updateStatus('Network error...');
                          xabber.current_voip_call = null;
                      }
                  }.bind(this), 40000);
                  peer_conn.restartIce();
              }
              if (conn_state === "connected") {
                  !this.conn.connectionState && this.onConnected();
              }
          },

          onChangedMediaType: function () {
              this.$local_video.switchClass('hidden', !this.get('video'));
          },

          onChangedRemoteVideo: function () {
              let incoming_video = this.get('video_in');
              if (incoming_video) {
                  this.$remote_video_el[0].srcObject = this.remote_stream;
                  this.modal_view.$el.find('.webrtc-remote-audio').replaceWith(this.$remote_video_el);
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
              navigator.mediaDevices.getDisplayMedia({video: true}).then(function (media_stream) {
                  this.$local_video[0].srcObject = media_stream;
                  media_stream.getVideoTracks().forEach(function (track) {
                      _.extend(track, {screen: true});
                      this.local_stream.addTrack(track);
                      this.conn.addTrack(track, this.local_stream);
                      this.conn.getSenders().find(sender => !sender.track || sender.track && sender.track.kind === 'video').replaceTrack(track);
                  }.bind(this));
              }.bind(this));
          },

          sendVideoStreamState: function (state) {
              let $iq_video = $iq({from: this.account.get('jid'), to: this.get('contact_full_jid'), type: 'set'})
                  .c('query', {xmlns: Strophe.NS.JINGLE_MSG})
                  .c('video', {state: state, id: this.get('session_id')});
              this.account.sendIQ($iq_video);
          },

          onIQ: function (iq) {
              let $incoming_iq = $(iq),
                  $jingle_initiate = $incoming_iq.find('jingle[action="session-initiate"]'),
                  $jingle_accept = $incoming_iq.find('jingle[action="session-accept"]'),
                  $jingle_info = $incoming_iq.find('jingle[action="session-info"]'),
                  $jingle_video = $incoming_iq.find('query[xmlns="' + Strophe.NS.JINGLE_MSG + '"] video'),
                  from_jid = $incoming_iq.attr('from'),
                  $result_iq = $iq({from: this.account.get('jid'), to: from_jid, type: 'result', id: $incoming_iq.attr('id')});
              if ($jingle_initiate.length) {
                  if ($jingle_initiate.attr('sid') !== this.get('session_id'))
                      return;
                  let offer_sdp = $jingle_initiate.find('description[xmlns="' + Strophe.NS.JINGLE_RTP + '"]').text();
                  offer_sdp && this.conn.setRemoteDescription(new RTCSessionDescription({type: 'offer', sdp: offer_sdp}));
                  this.acceptSession(offer_sdp);
                  this.account.sendIQ($result_iq);
              }
              if ($jingle_accept.length) {
                  if ($jingle_accept.attr('sid') !== this.get('session_id'))
                      return;
                  let answer_sdp = $jingle_accept.find('description[xmlns="' + Strophe.NS.JINGLE_RTP + '"]').text();
                  answer_sdp && this.conn.setRemoteDescription(new RTCSessionDescription({type: 'answer', sdp: answer_sdp}));
                  this.account.sendIQ($result_iq);
              }
              if ($jingle_info.length) {
                  if ($jingle_info.attr('sid') !== this.get('session_id'))
                      return;
                  let candidate = $jingle_info.find('candidate');
                  candidate.length && this.conn.addIceCandidate(new RTCIceCandidate({candidate: candidate.text(), sdpMLineIndex: candidate.attr('sdpMLineIndex'), sdpMid: candidate.attr('sdpMid')}));
                  this.account.sendIQ($result_iq);
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
                  this.account.sendIQ($result_iq);
              }
          },

          startCall: function () {
              this.set('call_initiator', this.account.get('jid'));
              this.createAudioStream();
              this.get('video_live') && this.createVideoStream();
              this.propose();
          },

          createAudioStream: function () {
              navigator.mediaDevices.getUserMedia({audio: true}).then(function (media_stream) {
                  this.local_stream = media_stream;
                  this.$local_video[0].srcObject = media_stream;
                  let video_track = this.initVideoTrack();
                  this.local_stream.addTrack(video_track);
                  this.conn.addTrack(video_track, this.local_stream);
                  media_stream.getAudioTracks().forEach(track => this.conn.addTrack(track, this.local_stream));
              }.bind(this));
          },

          createVideoStream: function () {
              navigator.mediaDevices.getUserMedia({video: true}).then(function (media_stream) {
                  this.$local_video[0].srcObject = media_stream;
                  media_stream.getVideoTracks().forEach(function (track) {
                      this.local_stream.addTrack(track);
                      this.conn.addTrack(track, this.local_stream);
                      this.conn.getSenders().find(sender => !sender.track || sender.track && sender.track.kind === 'video').replaceTrack(track);
                  }.bind(this));
              }.bind(this));
          },

          stopTracks: function () {
              this.local_stream && this.local_stream.getTracks().forEach(function (track) {
                  track.stop();
                  this.local_stream.removeTrack(track);
              }.bind(this));
          },

          propose: function () {
              this.updateStatus('Search...');
              let $propose_msg = $msg({from: this.account.get('jid'), type: 'chat', to: this.contact.get('jid')})
                  .c('propose', {xmlns: Strophe.NS.JINGLE_MSG, id: this.get('session_id')})
                  .c('description', {xmlns: Strophe.NS.JINGLE_RTP, media: 'audio'}).up().up()
                  .c('store', {xmlns: Strophe.NS.HINTS}).up()
                  .c('markable').attrs({'xmlns': Strophe.NS.CHAT_MARKERS}).up()
                  .c('body').t('You have received a voice call. If your are seing this, your client probably does not support this functionality. For more information, see https://xabber.com/voice/').up()
                  .c('origin-id', {id: uuid(), xmlns: 'urn:xmpp:sid:0'});
              this.account.sendMsg($propose_msg);
          },

          accept: function () {
              let $accept_msg = $msg({from: this.account.get('jid'), type: 'chat', to: this.get('contact_full_jid') || this.contact.get('jid')})
                  .c('accept', {xmlns: Strophe.NS.JINGLE_MSG, id: this.get('session_id')}).up()
                  .c('store', {xmlns: Strophe.NS.HINTS}).up()
                  .c('markable').attrs({'xmlns': Strophe.NS.CHAT_MARKERS}).up()
                  .c('origin-id', {id: uuid(), xmlns: 'urn:xmpp:sid:0'});
              this.set('jingle_start', moment.now());
              this.account.sendMsg($accept_msg);
              xabber.stopAudio(this.audio_notifiation);
              this.set('status', 'connecting');
              this.updateStatus('Connecting...');
              this.audio_notifiation = xabber.playAudio('connecting', true);
          },

          reject: function () {
              if (this.get('status') === 'disconnected' || this.get('status') === 'disconnecting')
                  return;
              let $reject_msg = $msg({from: this.account.get('jid'), type: 'chat', to: this.contact.get('jid')})
                  .c('reject', {xmlns: Strophe.NS.JINGLE_MSG, id: this.get('session_id')});
              if (this.get('jingle_start')) {
                  let end = moment.now(),
                      duration = Math.round((end - this.get('jingle_start'))/1000);
                  $reject_msg.c('call', {initiator: this.get('call_initiator'), start: moment(this.get('jingle_start')).format(), end: moment(end).format(), duration: duration}).up();
              }
              $reject_msg.up().c('store', {xmlns: Strophe.NS.HINTS}).up()
                  .c('markable').attrs({'xmlns': Strophe.NS.CHAT_MARKERS}).up()
                  .c('origin-id', {id: uuid(), xmlns: 'urn:xmpp:sid:0'});
              this.account.sendMsg($reject_msg);
              this.createSystemMessage($reject_msg);
              this.set('status', 'disconnected');
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
                      message: ((initiator && initiator === this.account.get('jid')) ? 'Outgoing' : 'Incoming') + ' call (' + utils.pretty_duration(duration) + ')'
                  });
              }
              else {
                  chat.messages.createSystemMessage({
                      from_jid: this.account.get('jid'),
                      session_id: $message.find('reject').attr('id'),
                      message: 'Cancelled call'
                  });
              }
          },

          initVideoTrack: function () {
              let canvas = Object.assign(document.createElement("canvas"), {width: 320, height: 240});
              let ctx = canvas.getContext('2d');
              ctx.fillRect(0, 0, canvas.width, canvas.height);
              let p = ctx.getImageData(0, 0, canvas.width, canvas.height);
              requestAnimationFrame(function draw(){
                  for (var i = 0; i < p.data.length; i++) {
                      p.data[i++] = p.data[i++] = p.data[i++] = 1;
                  }
                  ctx.putImageData(p, 0, 0);
                  requestAnimationFrame(draw);
              });
              return _.extend(canvas.captureStream(60).getTracks()[0], {default: true});
          },

          initSession: function () {
              navigator.mediaDevices.getUserMedia({audio: true}).then(function (media_stream) {
                  this.local_stream = media_stream;
                  this.$local_video[0].srcObject = media_stream;
                  let video_track = this.initVideoTrack();
                  this.local_stream.addTrack(video_track);
                  this.conn.addTrack(video_track, this.local_stream);
                  media_stream.getAudioTracks().forEach(track => this.conn.addTrack(track, this.local_stream));
                  return this.conn.createOffer({offerToReceiveAudio:true, offerToReceiveVideo: true});
              }.bind(this)).then(function(offer) {
                      this.set('session_initiator', this.account.get('jid'));
                      this.conn.setLocalDescription(offer).then(function () {
                          let offer_sdp = offer.sdp,
                              $iq_offer_sdp = $iq({from: this.account.get('jid'), to: this.get('contact_full_jid'), type: 'set'})
                              .c('jingle', {xmlns: Strophe.NS.JINGLE, action: 'session-initiate', initiator: this.account.get('jid'), sid: this.get('session_id')})
                              .c('content', {creator: 'initiator', name: 'voice'})
                              .c('description', {xmlns: Strophe.NS.JINGLE_RTP, media: 'audio'})
                              .c('sdp').t(offer_sdp).up().up()
                              .c('security', {xmlns: Strophe.NS.JINGLE_SECURITY_STUB});
                          this.account.sendIQ($iq_offer_sdp);
                      }.bind(this));
              }.bind(this));
          },

          sendCandidate: function (candidate) {
              let $iq_candidate = $iq({from: this.account.get('jid'), to: this.get('contact_full_jid'), type: 'set'})
                  .c('jingle', {xmlns: Strophe.NS.JINGLE, action: 'session-info', initiator: this.get('session_initiator'), sid: this.get('session_id')})
                  .c('content', {creator: 'initiator', name: 'voice'})
                  .c('description', {xmlns: Strophe.NS.JINGLE_RTP, media: 'audio'}).up()
                  .c('transport', {xmlns: Strophe.NS.JINGLE_TRANSPORTS_ICE})
                  .c('candidate', {sdpMLineIndex: candidate.sdpMLineIndex, sdpMid: candidate.sdpMid }).t(candidate.candidate);
              this.account.sendIQ($iq_candidate);
          },

          acceptSession: async function () {
              this.set('session_initiator', this.contact.get('jid'));
              this.conn.createAnswer().then(function(answer) {
                  this.conn.setLocalDescription(answer).then(function () {
                      let answer_sdp = answer.sdp,
                          $iq_answer_sdp = $iq({from: this.account.get('jid'), to: this.get('contact_full_jid'), type: 'set'})
                              .c('jingle', {xmlns: Strophe.NS.JINGLE, action: 'session-accept', initiator: this.contact.get('jid'), sid: this.get('session_id')})
                              .c('content', {creator: 'initiator', name: 'voice'})
                              .c('description', {xmlns: Strophe.NS.JINGLE_RTP, media: 'audio'})
                              .c('sdp').t(answer_sdp).up().up()
                              .c('security', {xmlns: Strophe.NS.JINGLE_SECURITY_STUB});
                      this.account.sendIQ($iq_answer_sdp);
                  }.bind(this));
              }.bind(this));
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
            this.account = this.contact.account;
            var jid = this.contact.get('jid');
            this.set({
                id: this.contact.hash_id,
                jid: jid
            });
            this.message_retraction_version = 0;
            this.contact.set('muted', _.contains(this.account.chat_settings.get('muted'), jid));
            this.contact.set('archived', _.contains(this.account.chat_settings.get('archived'), jid));
            this.messages = new xabber.Messages(null, {account: this.account});
            this.messages_unread = new xabber.Messages(null, {account: this.account});
            this.item_view = new xabber.ChatItemView({model: this});
            this.contact.on("destroy", this.onContactDestroyed, this);
            this.on("get_retractions_list", this.getAllMessageRetractions, this);
        },

        recountUnread: function () {
            this.set('unread', this.messages_unread.length);
            if (this.contact.get('archived') && this.contact.get('muted')) {
            }
            else {
                xabber.toolbar_view.recountAllMessageCounter();
            }
        },

        onContactDestroyed: function () {
            this.resetUnread();
            this.destroy();
        },

        resetUnread: function () {
            var unread = this.get('unread');
            if (unread > 0) {
                this.set('unread', 0);
                xabber.recountAllMessageCounter(unread);
                xabber.toolbar_view.recountAllMessageCounter(unread);
            }
        },

        searchMessages: function (query, callback) {
            this.contact.messages_view = new xabber.SearchedMessagesView({
                contact: this.contact,
                query_text: query,
                model: this
            });
            this.contact.messages_view.messagesRequest({}, function () {
                xabber.body.setScreen('all-chats', {
                    right: 'searched_messages',
                    contact: this.contact
                });
            }.bind(this));
        },

        sendDataForm: function (message, variable) {
            let data_form = message.get('data_form');
            if (!data_form)
                return;
            let msg = $msg({type: 'chat'});
            data_form.fields.forEach(function (field) {
                if (field.type  === 'boolean') {
                    if (field.var === variable)
                        field.values = [true];
                    else
                        field.values = [false];
                }
            }.bind(this));
            msg = this.account.addDataFormToStanza(msg, data_form);
            data_form.addresses.forEach(function (address) {
                if (address.type === 'replyto') {
                    $(msg.nodeTree).attr('to', address.jid);
                }
                this.account.sendMsg(msg);
            }.bind(this));
        },

        setStanzaId: function (unique_id, stanza_id) {
            let message = this.messages.get(unique_id);
            message.set('stanza_id', stanza_id);
            if (!message.get('origin_id'))
                this.item_view.content.$('.chat-message[data-uniqueid="' + stanza_id + '"]').data('uniqueid', stanza_id)[0].setAttribute('data-uniqueid', stanza_id);
        },

        getCallingAvailability: function (to, session_id, callback) {
            let iq = $iq({from: this.account.get('jid'), to: to, type: 'get'})
                .c('query', {xmlns: Strophe.NS.JINGLE_MSG})
                .c('session', {id: session_id});
            this.account.sendIQ(iq, callback);
        },

        sendReject: function (options) {
            !options && (options = {});
            let msg_to = options.to || this.contact.get('jid'),
                $reject_msg = $msg({
                type: 'chat',
                to: msg_to
            })
                .c('reject', {xmlns: Strophe.NS.JINGLE_MSG, id: options.session_id}).up()
                .c('store', {xmlns: Strophe.NS.HINTS}).up()
                .c('markable').attrs({'xmlns': Strophe.NS.CHAT_MARKERS}).up()
                .c('origin-id', {id: uuid(), xmlns: 'urn:xmpp:sid:0'});
            this.account.sendMsg($reject_msg);
        },

        initIncomingCall: function (full_jid, session_id) {
            if (!xabber.get('audio')) {
                this.messages.createSystemMessage({
                    from_jid: this.account.get('jid'),
                    message: 'Incoming call. You have no required devices to answer'
                });
                return;
            }
            xabber.current_voip_call = new xabber.JingleMessage({contact_full_jid: full_jid, session_id: session_id}, {contact: this.contact});
            xabber.current_voip_call.modal_view.show({status: 'in'});
            xabber.current_voip_call.set('call_initiator', this.contact.get('jid'));
        },

        endCall: function (status) {
            status && xabber.current_voip_call.set('status', status);
            xabber.current_voip_call.destroy();
            xabber.current_voip_call = null;
        },

        getAllMessageRetractions: function () {
            var retractions_query = $iq({from: this.account.connection.jid, type: 'set', to: this.contact.get('jid')})
                .c('activate', { xmlns: Strophe.NS.REWRITE, version: this.message_retraction_version});
            this.account.sendIQ(retractions_query);
        },

        receiveMessage: function ($message, options) {
            var from_bare_jid = Strophe.getBareJidFromJid($message.attr('from')),
                carbon_copied = options.carbon_copied;
            // searching chat marker message
            var $marker = $message.children('[xmlns="'+Strophe.NS.CHAT_MARKERS+'"]'),
                $receipt_request = $message.children('request[xmlns="'+Strophe.NS.RECEIPTS +'"]'),
                $receipt_response = $message.children('received[xmlns="'+Strophe.NS.RECEIPTS +'"]'),
                $jingle_msg_propose = $message.children('propose[xmlns="' + Strophe.NS.JINGLE_MSG + '"]'),
                $jingle_msg_accept = $message.children('accept[xmlns="' + Strophe.NS.JINGLE_MSG + '"]'),
                $jingle_msg_reject = $message.children('reject[xmlns="' + Strophe.NS.JINGLE_MSG + '"]');
            if ($jingle_msg_propose.length) {
                if (carbon_copied && (from_bare_jid == this.account.get('jid'))) {
                    if (xabber.current_voip_call)
                        this.sendReject({to: Strophe.getBareJidFromJid($message.attr('to')), session_id: $jingle_msg_propose.attr('id')});
                    return;
                }
                if (options.is_archived || options.synced_msg)
                    return;
                else {
                    let session_id = $jingle_msg_propose.attr('id'),
                        iq_to = $message.attr('from');
                    this.getCallingAvailability(iq_to, session_id, function () {
                        if (xabber.current_voip_call) {
                            this.sendReject({session_id: session_id});
                            this.messages.createSystemMessage({
                                from_jid: this.account.get('jid'),
                                message: 'Cancelled call'
                            });
                            return;
                        }
                        this.initIncomingCall(iq_to, session_id);
                    }.bind(this));
                }
            }
            if ($jingle_msg_accept.length) {
                if (options.is_archived || options.synced_msg)
                    return;
                if (xabber.current_voip_call && xabber.current_voip_call.get('session_id') === $jingle_msg_accept.attr('id')) {
                    if (carbon_copied)
                        this.endCall();
                    else {
                        !xabber.current_voip_call.get('state') && xabber.current_voip_call.set('state', constants.JINGLE_MSG_ACCEPT);
                        let jingle_start = $jingle_msg_accept.find('time').attr('stamp');
                        jingle_start = jingle_start ? Number(moment(jingle_start)) : moment.now();
                        xabber.current_voip_call.set('jingle_start', jingle_start);
                        !xabber.current_voip_call.get('contact_full_jid') && xabber.current_voip_call.set('contact_full_jid', $message.attr('from'));
                        xabber.stopAudio(xabber.current_voip_call.audio_notifiation);
                        xabber.current_voip_call.set('status', 'connecting');
                        xabber.current_voip_call.updateStatus('Connecting...');
                        xabber.current_voip_call.audio_notifiation = xabber.playAudio('connecting');
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
                    msg_text = ((initiator && initiator === this.account.get('jid')) ? 'Outgoing' : 'Incoming') + ' call (' + utils.pretty_duration(duration) + ')';
                }
                else
                    msg_text = 'Cancelled call';
                message = this.messages.createSystemMessage({
                    from_jid: this.account.get('jid'),
                    time: time,
                    session_id: $jingle_msg_reject.attr('id'),
                    stanza_id: options.stanza_id,
                    message: msg_text
                });
                if (options.is_archived || options.synced_msg)
                    return message;
                if (xabber.current_voip_call && xabber.current_voip_call.get('session_id') === $jingle_msg_reject.attr('id')) {
                    xabber.stopAudio(xabber.current_voip_call.audio_notifiation);
                    let busy_audio = xabber.playAudio('busy');
                    setTimeout(function () {
                        xabber.stopAudio(busy_audio);
                    }.bind(this), 1500);
                    this.endCall('disconnected');
                }
                return message;
            }
            if (!options.is_archived) {
                var $stanza_id, $contact_stanza_id;
                $message.children('stanza-id').each(function (idx, stanza_id) {
                    stanza_id = $(stanza_id);
                    if ($message.children('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"]').length) {
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
                }.bind(this));
                $stanza_id && (options.stanza_id = $stanza_id.attr('id'));
                $contact_stanza_id && (options.contact_stanza_id = $contact_stanza_id.attr('id'));
            }
            if ($marker.length) {
                var marker_tag = $marker[0].tagName.toLowerCase();
                if ((marker_tag === 'markable') && !options.is_mam && !options.is_archived && !carbon_copied && (!options.synced_msg || options.synced_msg && options.is_unread))
                    this.sendMarker($message.attr('id'), 'received', options.stanza_id, options.contact_stanza_id);
                if ((marker_tag !== 'markable') && !carbon_copied) {
                    this.receiveMarker($message, marker_tag, carbon_copied);
                    return;
                }
                if ((marker_tag === 'displayed') && carbon_copied)
                    this.receiveCarbonsMarker($marker);
            }

            if ($receipt_request.length && !options.is_mam && !options.is_archived && !carbon_copied && (!options.synced_msg || options.synced_msg && options.is_unread)) {
                this.sendDeliveryReceipt($message);
            }

            if ($receipt_response.length) {
                this.receiveDeliveryReceipt($message);
            }

            if (!$message.find('body').length || $jingle_msg_propose.length || $jingle_msg_accept.length || $jingle_msg_reject.length) {
                var view = xabber.chats_view.child(this.contact.hash_id);
                if (view && view.content) {
                    view.content.receiveNoTextMessage($message, carbon_copied);
                }
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
                var iq = $iq({type: 'get'}).c('blocklist', {xmlns: Strophe.NS.BLOCKING});
                this.account.sendIQ(iq,
                    function (iq) {
                        var items = $(iq).find('item'),
                            current_timestamp = Number(moment($message.find('delay').attr('stamp') || $message.find('time').attr('stamp') || (options.delay) && Number(moment(options.delay.attr('stamp'))) || moment.now())),
                            last_blocking_timestamp,
                            has_blocking = false;
                        if (items.length > 0) {
                            items.each(function (idx, item) {
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
                            }.bind(this));
                        }
                        if (_.isUndefined(last_blocking_timestamp) || last_blocking_timestamp && last_blocking_timestamp < current_timestamp)
                            return this.messages.createInvitationFromStanza($message, options);
                    }.bind(this),
                    function () {
                        return this.messages.createInvitationFromStanza($message, options);
                    }.bind(this));
            }
            else
                return this.messages.createFromStanza($message, options);
        },

        getMessageContext: function (unique_id, options) {
            options = options || {};
            let messages = options.mention && this.account.messages || options.seached_messages && this.account.searched_messages || options.message && xabber.all_searched_messages || this.account.messages,
                message = messages.get(unique_id);
            if (message) {
                let stanza_id = message.get('stanza_id');
                this.contact.messages_view = new xabber.MessageContextView({
                    contact: this.contact,
                    mention_context: options.mention,
                    model: this,
                    stanza_id_context: stanza_id
                });
                this.account.context_messages.add(message);
                this.contact.messages_view.messagesRequest({after: stanza_id}, function () {
                    if (options.mention)
                        xabber.body.setScreen('mentions', {
                            right: 'message_context',
                            contact: this.contact
                        });
                    else if (options.message)
                        xabber.body.setScreen(xabber.body.screen.get('name'), {
                            right: 'message_context',
                            contact: this.contact
                        });
                    else
                        xabber.body.setScreen('all-chats', {
                        right: 'message_context',
                        contact: this.contact
                    });
                }.bind(this));
            }
        },

        sendDeliveryReceipt: function ($message) {
            var $delivery_msg = $msg({from: this.account.get('jid'),
                to: this.contact.get('jid'),
                type: 'chat',
                id: uuid()})
                .c('received', { xmlns: Strophe.NS.RECEIPTS, id: $message.attr('id')});
            this.account.sendMsg($delivery_msg);
        },

        sendMarker: function (msg_id, status, stanza_id, contact_stanza_id) {
            status || (status = 'displayed');
            let stanza = $msg({
                from: this.account.jid,
                to: this.get('jid'),
                type: 'chat',
                id: uuid()
            }).c(status).attrs({
                xmlns: Strophe.NS.CHAT_MARKERS,
                id: msg_id || stanza_id || contact_stanza_id || ""
            });
            stanza_id && stanza.c('stanza-id', {xmlns: 'urn:xmpp:sid:0', id: stanza_id, by: this.account.get('jid')}).up();
            contact_stanza_id && stanza.c('stanza-id', {xmlns: 'urn:xmpp:sid:0', id: contact_stanza_id, by: this.contact.get('jid')}).up();
            this.account.sendMsg(stanza);
        },

        receiveMarker: function ($message, tag, carbon_copied) {
            var $displayed = $message.find('displayed'),
                $received = $message.find('received'),
                error = $message.attr('type') === 'error';
            if (error || !$displayed.length && !$received.length)
                return;
            var marked_msg_id = $displayed.attr('id') || $received.attr('id'),
                marked_stanza_id = $displayed.find('stanza-id[by="' + this.account.get('jid') + '"]').attr('id') || $received.find('stanza-id[by="' + this.account.get('jid') + '"]').attr('id'),
                msg = this.account.messages.find(m => m.get('stanza_id') === marked_stanza_id || m.get('contact_stanza_id') === marked_stanza_id || m.get('msgid') === marked_msg_id);
            if (!msg)
                return;
            if (msg.isSenderMe()) {
                if ($received.length) {
                    let msg_state = msg.get('state');
                    if (msg_state !== constants.MSG_DISPLAYED) {
                        let delivered_time = $received.children('time').attr('stamp');
                        if (delivered_time) {
                            msg.set('time', utils.pretty_datetime(delivered_time));
                            msg.set('timestamp', Number(delivered_time));
                        }
                    }
                    this.setMessagesDelivered(msg.get('timestamp'));
                }
                else
                    this.setMessagesDisplayed(msg.get('timestamp'));
            } else {
                msg.set('is_unread', false);
            }
        },

        setMessagesDelivered: function (timestamp) {
            !timestamp && (timestamp = moment.now());
            let undelivered_messages = this.messages.filter(message => message.isSenderMe() && (message.get('timestamp') <= timestamp) && (message.get('state') > constants.MSG_PENDING) && (message.get('state') < constants.MSG_DELIVERED));
            undelivered_messages.forEach(message => message.set('state', constants.MSG_DELIVERED));
        },

        setMessagesDisplayed: function (timestamp) {
            !timestamp && (timestamp = moment.now());
            let undelivered_messages = this.messages.filter(message => message.isSenderMe() && (message.get('timestamp') <= timestamp) && (message.get('state') > constants.MSG_PENDING) && (message.get('state') < constants.MSG_DISPLAYED));
            undelivered_messages.forEach(message => message.set('state', constants.MSG_DISPLAYED));
        },

        receiveCarbonsMarker: function ($marker) {
            let stanza_id = $marker.children('stanza-id[by="' + this.account.get('jid') + '"]').attr('id'),
                msg_id = $marker.attr('id'),
                msg = this.messages.find(m => m.get('stanza_id') === stanza_id || m.get('contact_stanza_id') === stanza_id || m.get('msgid') === msg_id), msg_idx;
            msg && (msg_idx = this.messages.indexOf(msg));
            if (msg_idx > -1) {
                this.set('const_unread', 0);
                for (var i = msg_idx; i >= 0; i--) {
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
            var $received = $message.find('received'),
                delivered_origin_id = $received.attr('id'),
                delivered_stanza_id = $received.children('stanza-id[by="' + this.account.get('jid') + '"]').attr('id'),
                msg = this.account.messages.get(delivered_origin_id || delivered_stanza_id);
            if (!msg) {
                return;
            }
            if (msg.isSenderMe()) {
                msg.set('state', constants.MSG_DELIVERED);
            }
        },

        onPresence: function (type) {
            var jid = this.get('jid');
            if (!this.contact.get('group_chat')) {
                if (type === 'subscribe_from') {
                    this.messages.createSystemMessage({
                        from_jid: this.account.get('jid'),
                        message: 'Subscription request sent'
                    });
                } else if (type === 'subscribe') {
                    this.messages.createSystemMessage({
                        from_jid: jid,
                        auth_request: true,
                        message: 'Incoming subscription request'
                    });
                } else if (type === 'subscribed') {
                    this.messages.createSystemMessage({
                        from_jid: jid,
                        message: this.contact.get('name') + ' added to your contacts',
                    });
                }
            }
        },

        onRosterPush: function (type) {
            let jid = this.get('jid');
            if (type === 'remove')
                this.messages.createSystemMessage({
                    from_jid: jid,
                    silent: false,
                    message: 'Contact deleted'
                });

        },

        retractMessages: function (msgs, group_chat, symmetric) {
            let msgs_responses = 0, count = msgs.length, dfd = new $.Deferred();
            dfd.done(function (num) {
                if (num === 0) {
                    utils.dialogs.error("You have no permission to delete messages");
                }
                else if (num !== msgs.length) {
                    utils.dialogs.error("You have no permission to delete some messages");
                }
            }.bind(this));
            $(msgs).each(function (idx, item) {
                let stanza_id = item.get('stanza_id'),
                    contact_stanza_id = item.get('contact_stanza_id');
                if (stanza_id || contact_stanza_id) {
                    let iq_retraction = $iq({type: 'set', from: this.account.get('jid'), to: group_chat ? this.contact.get('jid') : this.account.get('jid')})
                        .c('retract-message', {id: (this.contact.get('group_chat') && contact_stanza_id || stanza_id), xmlns: Strophe.NS.REWRITE, symmetric: symmetric, by: this.account.get('jid')});
                    this.account.sendIQ(iq_retraction, function (success) {
                            this.item_view.content.removeMessage(item);
                            msgs_responses++;
                            (msgs_responses === msgs.length) && dfd.resolve(count);
                        }.bind(this),
                        function (error) {
                            msgs_responses++;
                            if ($(error).find('not-allowed').length)
                                count--;
                            (msgs_responses === msgs.length) && dfd.resolve(count);
                        }.bind(this));
                }
            }.bind(this));
        },

        retractMessagesByUser: function (user_id) {
            var iq_retraction = $iq({type: 'set', to: this.contact.get('jid')})
                .c('retract-user', {id: user_id, xmlns: Strophe.NS.REWRITE, symmetric: true});
            this.account.sendIQ(iq_retraction, function (success) {
                    var user_msgs = this.messages.filter(msg => msg.get('user_info') && (msg.get('user_info').id == user_id));
                    $(user_msgs).each(function (idx, msg) {
                        this.item_view.content.removeMessage(msg);
                    }.bind(this));
                }.bind(this),
                function (error) {
                    if ($(error).find('not-allowed').length)
                        utils.dialogs.error("You have no permission to delete user messages");
                }.bind(this));
        },

        retractAllMessages: function (symmetric, callback, errback) {
            let is_group_chat = this.contact.get('group_chat'),
                iq_retraction = $iq({type: 'set', from: this.account.get('jid'), to: is_group_chat ? this.contact.get('jid') : this.account.get('jid')}),
                retract_attrs = {xmlns: Strophe.NS.REWRITE, symmetric: symmetric};
            !is_group_chat && (retract_attrs.conversation = this.contact.get('jid'));
            iq_retraction.c('retract-all', retract_attrs);
            this.account.sendIQ(iq_retraction, function (iq_response) {
                    var all_messages = this.messages.models;
                    $(all_messages).each(function (idx, msg) {
                        this.item_view.content.removeMessage(msg);
                    }.bind(this));
                    callback && callback();
            }.bind(this),
                function (error) {
                    if ($(error).find('not-allowed').length)
                        utils.dialogs.error("You have no permission to clear message archive");
                    errback && errback();
                }.bind(this));
        },

        showBlockedRequestMessage: function () {
            if (this.messages.length)
                this.messages.createSystemMessage({
                    from_jid: this.account.get('jid'),
                    message: 'Contact blocked',
                    time: this.messages.last().get('time')
                });
        },

        deleteFromSynchronization: function (callback, errback) {
            let iq = $iq({from: this.account.get('jid'), type: 'set', to: this.account.get('jid')})
                .c('delete', {xmlns: Strophe.NS.SYNCHRONIZATION})
                .c('conversation', {jid: this.get('jid')});
            this.account.sendIQ(iq, function (success) {
                callback && callback(success);
            }.bind(this), function (error) {
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
            this.$el.attr('data-id', this.model.id);
            this.content = new xabber.ChatContentView({chat_item: this});
            this.updateName();
            this.updateStatus();
            this.updateCounter();
            this.updateAvatar();
            this.updateMutedState();
            this.updateArchivedState();
            this.updateColorScheme();
            this.updateIcon();
            this.model.on("change:active", this.updateActiveStatus, this);
            this.model.on("change:unread", this.updateCounter, this);
            this.model.on("change:const_unread", this.updateCounter, this);
            this.model.on("open", this.open, this);
            this.model.on("remove_opened_chat", this.onClosed, this);
            this.model.messages.on("destroy", this.onMessageRemoved, this);
            this.contact.on("change:name", this.updateName, this);
            this.contact.on("change:status", this.updateStatus, this);
            this.contact.on("change:private_chat", this.updateIcon, this);
            this.contact.on("change:incognito_chat", this.updateIcon, this);
            this.contact.on("change:image", this.updateAvatar, this);
            this.contact.on("change:blocked", this.onBlocked, this);
            this.contact.on("change:muted", this.updateMutedState, this);
            this.contact.on("change:archived", this.updateArchivedState, this);
            this.contact.on("change:group_chat", this.updateGroupChats, this);
            this.contact.on("change:in_roster", this.updateAcceptedStatus, this);
            this.contact.on("remove_invite", this.removeInvite, this);
            this.account.settings.on("change:color", this.updateColorScheme, this);
        },

        updateName: function () {
            this.$('.chat-title').text(this.contact.get('name'));
        },

        updateStatus: function () {
            var status = this.contact.get('status');
            this.$('.status').attr('data-status', status);
            this.$('.chat-icon').attr('data-status', status);
        },

        updateActiveStatus: function () {
            this.$el.switchClass('active', this.model.get('active'));
        },

        updateAcceptedStatus: function () {
            let in_roster = this.contact.get('in_roster');
            if (in_roster)
                this.model.set('is_accepted', true);
        },

        onBlocked: function () {
            this.updateIcon();
            this.$el.switchClass('blocked', this.contact.get('blocked'));
        },

        updateCounter: function () {
            var unread = this.model.get('unread') + this.model.get('const_unread');
            this.$('.msg-counter').showIf(unread).text(unread || '');
        },

        updateAvatar: function () {
            var image = this.contact.cached_image;
            this.$('.circle-avatar').setAvatar(image, this.avatar_size);
        },

        updateIcon: function () {
            this.$('.chat-icon').addClass('hidden');
            let ic_name = this.contact.getIcon();
            ic_name && this.$('.chat-icon').removeClass('hidden').children('svg').html(env.templates.svg[ic_name]());
        },

        updateMutedState: function () {
            let is_muted = this.contact.get('muted');
            this.$('.msg-counter').switchClass('muted-chat-counter', is_muted);
            this.$('.muted-icon').showIf(is_muted);
        },

        updateArchivedState: function () {
            let archived = this.contact.get('archived');
            if (archived || (!archived && xabber.toolbar_view.$('.active').hasClass('archive-chats')))
                this.$el.detach();
            if ((archived && xabber.toolbar_view.$('.active').hasClass('archive-chats')) || (!archived && !xabber.toolbar_view.$('.active').hasClass('archive-chats')))
                xabber.chats_view.updateChatPosition(this.model);
        },

        updateGroupChats: function () {
            var is_group_chat = this.contact.get('group_chat');
            this.$('.status').hideIf(is_group_chat);
            this.$('.chat-icon').showIf(is_group_chat);
            this.updateIcon();
            if (is_group_chat) {
                this.$el.addClass('group-chat');
                this.$('.chat-title').css('color', '#424242');
                this.model.set('group_chat', true);
            }
        },

        updateColorScheme: function () {
            var color = this.account.settings.get('color');
            this.$el.attr('data-color', color);
            this.content.$el.attr('data-color', color);
            this.content.head.$el.attr('data-color', color);
            this.content.bottom.$el.attr('data-color', color);
        },

        onMessageRemoved: function (msg) {
            if (this.model.last_message === msg) {
                var last_message;
                for (var idx = this.model.messages.length-1; idx >= 0; idx--) {
                    last_message = this.model.messages.at(idx);
                    if (!last_message.get('silent')) {
                        break;
                    }
                }
                this.model.last_message = last_message;
                this.updateLastMessage();
            }
        },

        updateEmptyChat: function () {
            let msg_time = this.model.get('timestamp');
            this.$('.last-msg').html('No messages'.italics());
            this.$('.last-msg-date').text(utils.pretty_short_datetime(msg_time))
                .attr('title', utils.pretty_datetime(msg_time));
        },

        updateLastMessage: function (msg) {
            msg || (msg = this.model.last_message);
            if (!msg) {
                !this.model.messages.length && this.$('.last-msg').html('No messages'.italics());
                return;
            }
            let msg_time = msg.get('time'),
                timestamp = msg.get('timestamp'), msg_from = "",
                forwarded_message = msg.get('forwarded_message'),
                msg_files = msg.get('files') || [], msg_images = msg.get('images')  || [],
                msg_text = forwarded_message ? (msg.get('message') || ((forwarded_message.length > 1) ? (forwarded_message.length + ' forwarded messages') : 'Forwarded message').italics()) : msg.getText(),
                msg_user_info = msg.get('user_info') || msg.isSenderMe() && this.contact.my_info && this.contact.my_info.attributes || {};
            this.model.set({timestamp: timestamp});
            if (this.contact.get('group_chat'))
                msg_from = msg_user_info.nickname || msg_user_info.jid || (msg.isSenderMe() ? this.account.get('name') : msg.get('from_jid')) || "";
            msg_from && (msg_from = $('<span class=text-color-700/>').text(msg_from + ': '));
            if (msg_files.length || msg_images.length) {
                let $colored_span = $('<span class="text-color-500"/>');
                if (msg_files.length && msg_images.length)
                    msg_text = $colored_span.text(msg_files.length + msg_images.length + ' files');
                else {
                    if (msg_files.length > 1)
                        msg_text = $colored_span.text(msg_files.length + ' files');
                    if (msg_files.length == 1)
                        msg_text = $colored_span.text((msg_files[0].is_audio || msg_files[0].voice ? ("Voice message, " + utils.pretty_duration(msg_files[0].duration)) : msg_files[0].name));
                    if (msg_images.length > 1)
                        msg_text = $colored_span.text(msg_images.length + ' images');
                    if (msg_images.length == 1)
                        msg_text = $colored_span.text(msg_images[0].name);
                }
                this.$('.last-msg').html("").append(msg_from).append(msg_text);
            }
            else {
                if (msg.get('type') == 'system') {
                    msg_from = "";
                    msg.get('invite') && (msg_text = 'Invitation to group chat');
                    msg.get('private_invite') && (msg_text = 'Invitation to private chat');
                    if (this.contact.get('group_chat'))
                        msg_text = $('<i/>').text(msg_text);
                    else
                        msg_text = $('<span class=text-color-500/>').text(msg_text);
                    this.$('.last-msg').html(msg_text);
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
                                let fist_msg_user_info = first_forwarded_msg.get('user_info') || {};
                                msg_from = fist_msg_user_info.nickname || fist_msg_user_info.jid || "";
                                msg_text = first_forwarded_msg.get('message');
                                this.$('.last-msg').text(msg_text);
                                msg_from && (msg_from = $('<span class=text-color-700/>').text(msg_from + ': '));
                            }
                            else {
                                msg_text = $('<i/>').text((forwarded_message.length > 1) ? (forwarded_message.length + ' forwarded messages') : 'Forwarded message');
                                this.$('.last-msg').html(msg_text);
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
            this.$el.emojify('.last-msg', {emoji_size: 16}).hyperlinkify({decode_uri: true});
            this.$('.last-msg-date').text(utils.pretty_short_datetime_recent_chat(msg_time))
                .attr('title', utils.pretty_datetime(msg_time));
            this.$('.msg-delivering-state').showIf(msg.get('type') !== 'system' && msg.isSenderMe() && (msg.get('state') !== constants.MSG_ARCHIVED))
                .attr('data-state', msg.getState());
        },

        openByClick: function () {
            this.open();
        },

        open: function (options) {
            options || (options = {clear_search: false});
            xabber.chats_view.openChat(this, options);
        },

        removeInvite: function (options) {
            options || (options = {});
            let msgs = _.clone(this.model.messages.models);
            this.model.set({'last_archive_id': undefined, 'first_archive_id': undefined});
            msgs.forEach(function (item) {
                if (item.get('invite')) {
                    let iq_retraction = $iq({type: 'set', from: this.account.get('jid'), to: this.account.get('jid')})
                        .c('retract-message', {
                            id: this.contact.get('group_chat') && item.get('contact_stanza_id') || item.get('stanza_id'),
                            xmlns: Strophe.NS.REWRITE,
                            symmetric: false,
                            by: this.account.get('jid')
                        });
                    this.account.sendIQ(iq_retraction);
                    item && this.content.removeMessage(item);
                }
            }.bind(this));
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
              this.account = this.contact.account;
              this.chat = this.account.chats.get(this.contact.hash_id);
              let color = this.account.settings.get('color');
              this.$el.attr('data-color', color);
              this.$search_form = this.$('.search-form-header');
              this.loading_history = false;
              this.history_loaded = false;
              this.first_msg_id = 0;
              this.last_msg_id = 0;
              this._scrolltop = this.getScrollTop();
              this.ps_container.on("ps-scroll-up ps-scroll-down", this.onScroll.bind(this));
              this.chat_content = options.chat_content || this.account.chats.get(this.contact.hash_id).item_view.content;
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
                  this.chat.searchMessages(query, function (messages) {
                  }.bind(this));
              }
              if (ev.keyCode === constants.KEY_ESCAPE) {
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

          onScroll: function () {
              this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
              this._prev_scrolltop = this._scrolltop || 0;
              this._scrolltop = this.getScrollTop();
              if (!this.history_loaded && !this.loading_history && (this._scrolltop < this._prev_scrolltop) && (this._scrolltop < 100 || this.getPercentScrolled() < 0.1)) {
                  this.loading_history = true;
                  this.messagesRequest({before: this.first_msg_id}, function () {
                      this.loading_history = false;
                  }.bind(this));
              }
          },

          backToBottom: function () {
              this.scrollToBottom();
              this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
          },

          messagesRequest: function () {},

          emptyChat: function () {
              this.$('.chat-content').html($('<span class="error"/>').text('No messages'));
          },

          openChat: function () {
              this.contact.trigger("open_chat", this.contact);
          },

          addMessageHTML: function ($message, index, last_index) {
              let scrolled_from_top,
                  scrolled_from_bottom = this.getScrollBottom();
              if (index === 0)
                  $message.prependTo(this.$('.chat-content'));
              else
                  $message.insertAfter(this.$('.chat-message').eq(index - 1));
              if (index === last_index)
                  scrolled_from_top = this.getScrollTop();
              let $next_message = $message.nextAll('.chat-message').first();
              this.chat_content.updateMessageInChat($message[0]);
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
              'click .mdi-link-variant': 'onClickLink',
              "keyup .messages-search-form": "keyupSearch"
          },

          __initialize: function (options) {
              options = options || {};
              this.stanza_id = options.stanza_id_context;
              this.mention_context = options.mention_context;
              this.$history_feedback = this.$('.load-history-feedback');
              this.account.context_messages = new xabber.Messages(null, {account: this.account});
              this.account.context_messages.on("change:last_replace_time", this.chat_content.updateMessage, this);
              this.account.context_messages.on("add", this.addMessage, this);
          },

          render: function () {
              this.scrollToTop();
              this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
          },

          onMouseWheel: function (ev) {
              if (!this.loading_history)
                  if (ev.originalEvent.deltaY < 0) {
                      if (!this.first_history_loaded) {
                          this.loading_history = true;
                          this.messagesRequest({before: this.first_msg_id}, function () {
                              this.loading_history = false;
                          }.bind(this));
                      }
                  }
                  else {
                      if (!this.last_history_loaded) {
                          this.loading_history = true;
                          this.messagesRequest({after: this.last_msg_id}, function () {
                              this.loading_history = false;
                          }.bind(this));
                      }
                  }
              this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
          },

          onScroll: function () {
              this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
              this._prev_scrolltop = this._scrolltop || 0;
              this._scrolltop = this.getScrollTop();
              this._scrollbottom = this.getScrollBottom();

              if (!this.loading_history)
                  if (!this.first_history_loaded && (this._scrolltop < this._prev_scrolltop) && (this._scrolltop < 100 || this.getPercentScrolled() < 0.1)) {
                      this.loading_history = true;
                      this.showHistoryFeedback();
                      this.messagesRequest({before: this.first_msg_id}, function () {
                          this.loading_history = false;
                          this.hideHistoryFeedback();
                      }.bind(this));
                  }
                  else {
                      if (!this.last_history_loaded && (this._scrolltop > this._prev_scrolltop) && (this._scrollbottom < 100 || this.getPercentScrolled() > 0.9)) {
                          this.loading_history = true;
                          this.showHistoryFeedback();
                          this.messagesRequest({after: this.last_msg_id}, function () {
                              this.loading_history = false;
                              this.hideHistoryFeedback();
                          }.bind(this));
                      }
                  }
          },

          showHistoryFeedback: function () {
              this.$history_feedback.text('Loading history...').removeClass('hidden');
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
              let handler = this.account.connection.addHandler(function (message) {
                  let $msg = $(message);
                  if ($msg.find('result').attr('queryid') === queryid) {
                      messages.push(message);
                  }
                  return true;
              }.bind(this), Strophe.NS.MAM);
              this.chat_content.MAMRequest(options,
                  function (success, messages, rsm) {
                      this.account.connection.deleteHandler(handler);
                      rsm && (this.first_msg_id = rsm.first) && (this.last_msg_id = rsm.last);
                      if (options.after && (messages.length < options.max))
                          this.last_history_loaded = true;
                      if (options.before && (messages.length < options.max))
                          this.first_history_loaded = true;
                      $(messages).each(function (idx, message) {
                          let $message = $(message);
                          this.account.chats.receiveChatMessage($message, {context_message: true});
                      }.bind(this));
                      callback && callback();
                  }.bind(this),
                  function () {
                      this.account.connection.deleteHandler(handler);
                  }.bind(this)
              );
          },

          addMessage: function (message) {
              if (message.get('auth_request'))
                  return;
              if (this.mention_context && (message.get('stanza_id') === this.stanza_id)) {} else message.set('is_archived', true);
              let $message = this.chat_content.buildMessageHtml(message).addClass('context-message'),
                  index = this.account.context_messages.indexOf(message);
              if (message.get('stanza_id') === this.stanza_id) {
                  $message.addClass('message-from-context');
                  setTimeout(function () {
                      $message.removeClass('message-from-context')
                  }.bind(this), 3000);
              }
              this.addMessageHTML($message, index, this.account.context_messages.findLastIndex());
          }
      });

      xabber.SearchedMessagesView = xabber.MessagesView.extend({
          className: 'chat-content-wrap searched-messages-wrap',

          events: {
              'click .chat-message': 'onClickMessage',
              'click .mdi-link-variant': 'onClickLink',
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
              this.$search_form.slideToggle(10, function () {
                  if (this.$search_form.css('display') !== 'none')
                      this.$search_form.find('input').focus();
                  this.scrollToBottom();
              }.bind(this));
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
              let handler = this.account.connection.addHandler(function (message) {
                  let $msg = $(message);
                  if ($msg.find('result').attr('queryid') === queryid) {
                      messages.push(message);
                  }
                  return true;
              }.bind(this), Strophe.NS.MAM);
              this.chat_content.MAMRequest(options,
                  function (success, messages, rsm) {
                      this.account.connection.deleteHandler(handler);
                      rsm && (this.first_msg_id = rsm.first);
                      if (!messages.length && !this.account.searched_messages.length) {
                          this.emptyChat();
                      }
                      if (messages.length < options.max)
                          this.history_loaded = true;
                      $(messages).each(function (idx, message) {
                          let $message = $(message);
                          this.account.chats.receiveChatMessage($message, {searched_message: true});
                      }.bind(this));
                      callback && callback();
                  }.bind(this),
                  function () {
                      this.account.connection.deleteHandler(handler);
                  }.bind(this)
              );
          },

          addMessage: function (message) {
              if (message.get('auth_request'))
                  return;
              message.set('is_archived', true);
              let $message = this.chat_content.buildMessageHtml(message).addClass('searched-message'),
                  index = this.account.searched_messages.indexOf(message);
              this.addMessageHTML($message, index);
          }
      });

      xabber.ParticipantMessagesView = xabber.MessagesView.extend({
          className: 'chat-content-wrap participant-messages-wrap',

          events: {
              'click .chat-message': 'onClickMessage',
              'click .mdi-link-variant': 'onClickLink',
              'click .btn-cancel-selection' : 'openChat',
              'click .btn-retract-messages' : 'retractMessages',
              "keyup .messages-search-form": "keyupSearch"
          },

          __initialize: function (options) {
              this.participant = options.model;
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
              utils.dialogs.ask("Delete user messages",
                  "Delete all " + ('<span class="' + this.account.settings.get('color') + '-text">' + (this.member_nickname || this.member_jid || this.member_id) + '</span>') + " messages in this group chat?",
                  null, { ok_button_text: 'delete'}).done(function (result) {
                  if (result) {
                      if (this.member_id) {
                          this.chat_content.model.retractMessagesByUser(this.member_id, function () {
                              this.emptyChat();
                          }.bind(this));
                      }
                  }
              }.bind(this));
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
              let handler = this.account.connection.addHandler(function (message) {
                  let $msg = $(message);
                  if ($msg.find('result').attr('queryid') === queryid) {
                      messages.push(message);
                  }
                  return true;
              }.bind(this), Strophe.NS.MAM);
              this.chat_content.MAMRequest(options,
                  function (success, messages, rsm) {
                      this.account.connection.deleteHandler(handler);
                      rsm && (this.first_msg_id = rsm.first);
                      if (!messages.length && !this.account.participant_messages.length) {
                          this.emptyChat();
                      }
                      if (messages.length < options.max)
                          this.history_loaded = true;
                      $(messages).each(function (idx, message) {
                          let $message = $(message);
                          this.account.chats.receiveChatMessage($message, {participant_message: true});
                      }.bind(this));
                      callback && callback();
                  }.bind(this),
                  function () {
                      this.account.connection.deleteHandler(handler);
                  }.bind(this)
              );
          },

          addMessage: function (message) {
              if (message.get('auth_request'))
                  return;
              message.set('is_archived', true);
              let $message = this.chat_content.buildMessageHtml(message).addClass('participant-message'),
                  index = this.account.participant_messages.indexOf(message);
              this.addMessageHTML($message, index);
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
              this.contact.on("change:blocked", this.render, this);
              this.contact.on("change:subscription_request_in", this.render, this);
              this.contact.on("change:subscription_request_out", this.render, this);
          },

          render: function () {
              if (this.contact.get('group_chat'))
                  return;
              let subscription = this.contact.get('subscription'),
                  in_request = this.contact.get('subscription_request_in'),
                  out_request = this.contact.get('subscription_request_out');
              this.$('.button').removeClass('hidden');
              this.$('.subscription-info').text("");
              this.$el.addClass('hidden');
              if (subscription === 'both' || this.contact.get('blocked'))
                  return;
              else if (subscription === 'to' && in_request || (!subscription && in_request && out_request)) {
                  this.$('.subscription-info').text("Contact asks permission to see your presence information");
                  this.$('.button:not(.btn-allow)').addClass('hidden');
              } else if (!out_request && !in_request && (subscription === 'from' || _.isNull(subscription))) {
                  this.$('.subscription-info').text("Subscribe to see contact status information");
                  this.$('.button:not(.btn-subscribe)').addClass('hidden');
              } else if (subscription === undefined || !subscription && in_request) {
                  this.$('.button:not(.btn-add):not(.btn-block)').addClass('hidden');
              } else {
                  return;
              }
              this.$el.removeClass('hidden');
          },

          declineSubscription: function () {
              this.contact.declineSubscribe();
              this.$el.addClass('hidden');
          },

          allowSubscription: function () {
              this.contact.acceptRequest();
              this.$el.addClass('hidden');
          },

          addContact: function () {
              if (this.contact.get('subscription') === undefined)
                  this.contact.pushInRoster(function () {
                      this.sendAndAskSubscription();
                  }.bind(this));
              else
                  this.sendAndAskSubscription();
              this.$el.addClass('hidden');
          },

          sendAndAskSubscription: function () {
              this.contact.acceptRequest();
              this.contact.askRequest();
          },

          blockContact: function () {
              this.contact.blockRequest();
              this.$el.addClass('hidden');
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
            'click .mdi-link-variant' : 'onClickLink',
            'click .pinned-message' : 'showPinnedMessage',
            "keyup .messages-search-form": "keyupSearch",
            "click .btn-cancel-searching": "cancelSearch",
            "click .back-to-bottom": "backToBottom",
            "click .btn-retry-send-message": "retrySendMessage"
        },

        _initialize: function (options) {
            this.chat_item = options.chat_item;
            this.current_day_indicator = null;
            this.prev_audio_message;
            this._pending_avatars = [];
            this.account = this.chat_item.account;
            this.model = this.chat_item.model;
            this.contact = this.model.contact;
            this.head = new xabber.ChatHeadView({content: this});
            this.bottom = new xabber.ChatBottomView({content: this});
            this.subscription_buttons = new xabber.SubscriptionButtonsView({contact: this.contact, el: this.$('.subscription-buttons-wrap')[0]});
            this.$history_feedback = this.$('.load-history-feedback');
            this.$pinned_message = this.$('.pinned-message');
            this.$search_form = this.$('.search-form-header');
            this.$el.attr('data-id', this.model.id);
            this._scrolltop = this.getScrollTop();
            let wheel_ev = this.defineMouseWheelEvent();
            this.$el.on(wheel_ev, this.onMouseWheel.bind(this));
            this.ps_container.on("ps-scroll-up ps-scroll-down", this.onScroll.bind(this));
            this.ps_container.on("ps-scroll-y", this.onScrollY.bind(this));
            this.model.on("change:active", this.onChangedActiveStatus, this);
            this.model.on("load_last_history", this.loadLastHistory, this);
            this.model.on("get_missed_history", this.requestMissedMessages, this);
            this.model.messages.on("add", this.onMessage, this);
            this.model.messages.on("change:state", this.onChangedMessageState, this);
            this.model.messages.on("change:is_unread", this.onChangedReadState, this);
            this.model.messages.on("change:timestamp", this.onChangedMessageTimestamp, this);
            this.model.messages.on("change:last_replace_time", this.updateMessage, this);
            this.contact.on("change:blocked", this.updateBlockedState, this);
            this.contact.on("change:group_chat", this.updateGroupChat, this);
            this.contact.on("remove_from_blocklist", this.loadLastHistory, this);
            this.account.contacts.on("change:name", this.updateName, this);
            this.account.contacts.on("change:image", this.updateAvatar, this);
            this.account.on("change", this.updateMyInfo, this);
            this.account.dfd_presence.done(function () {
                !this.account.connection.do_synchronization && this.loadLastHistory();
            }.bind(this));
            return this;
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

        updateGroupChat: function () {
            this._loading_history = false;
            this.model.set('history_loaded', false);
            // this.loadLastHistory();
        },

        render: function () {
            this.cancelSearch();
            this.scrollToBottom();
            this.onScroll();
            this.updateContactStatus();
            this.updatePinnedMessage();
            this.subscription_buttons.render();
        },

        cancelSearch: function () {
            this.$search_form.hide().find('input').val("");
        },

        updateContactStatus: function () {
            if (this.head.$('.contact-status').attr('data-status') == 'offline' && this.contact.get('last_seen')) {
                var seconds = (moment.now() - this.contact.get('last_seen'))/1000,
                    new_status = utils.pretty_last_seen(seconds);
                this.contact.set({status_message: new_status });
            }
        },

        updatePinnedMessage: function () {
            let $pinned_message = this.contact.get('pinned_message');
            this.contact.renderPinnedMessage($pinned_message, this.$pinned_message);
        },

        onChangedVisibility: function () {
            if (this.isVisible()) {
                this.model.set({display: true, active: true});
                this.readMessages();
            } else {
                this.model.set({display: false});
            }
        },

        onChangedActiveStatus: function () {
            this.sendChatState(this.model.get('active') ? 'active' : 'inactive');
            if (this.contact.get('group_chat')) {
                if (this.model.get('active'))
                    this.contact.sendPresent();
                else
                    this.contact.sendNotPresent();
            }
        },

        updateName: function (contact) {
            var name = contact.get('name'),
                jid = contact.get('jid');
            if (contact === this.contact) {
                this.$('.chat-message.with-author[data-from="'+jid+'"]').each(function () {
                    $(this).find('.chat-msg-author').text(name);
                });
            } else {
                this.$('.fwd-message.with-author[data-from="'+jid+'"]').each(function () {
                    $(this).find('.fwd-msg-author').text(name);
                });
            }
        },

        updateAvatar: function (contact) {
            var image = contact.cached_image,
                jid = contact.get('jid');
            if (contact === this.contact) {
                this.$('.chat-message.with-author[data-from="'+jid+'"]').each(function () {
                    $(this).find('.left-side .circle-avatar').setAvatar(
                            image, this.avatar_size);
                });
            } else {
                this.$('.fwd-message.with-author[data-from="'+jid+'"]').each(function () {
                    $(this).find('.fwd-left-side .circle-avatar').setAvatar(
                            image, this.avatar_size);
                });
            }
        },

        updateMyStatus: function () {
            let text;
            if (!this.account.isOnline()) {
                text = 'You are offline';
            }
            this.bottom.showChatNotification(text || '', true);
        },

        updateMyName: function () {
            var name = this.account.get('name'),
                jid = this.account.get('jid');
            this.$('.chat-message.with-author[data-from="'+jid+'"]').each(function () {
                $(this).find('.chat-msg-author').text(name);
            });
            this.$('.fwd-message.with-author[data-from="'+jid+'"]').each(function () {
                $(this).find('.fwd-msg-author').text(name);
            });
        },

        updateMyAvatar: function () {
            var image = this.account.cached_image,
                jid = this.account.get('jid');
            this.$('.chat-message.with-author[data-from="'+jid+'"]').each(function () {
                $(this).find('.left-side .circle-avatar').setAvatar(
                        image, this.avatar_size);
            });
            this.$('.fwd-message.with-author[data-from="'+jid+'"]').each(function () {
                $(this).find('.fwd-left-side .circle-avatar').setAvatar(
                        image, this.avatar_size);
            });
        },

        updateBlockedState: function () {
            if (this.contact.get('blocked'))
                this.model.showBlockedRequestMessage();
            if (this.isVisible()) {
                xabber.body.setScreen(xabber.body.screen.get('name'), {right: 'chat', chat_item: this.chat_item, blocked: this.contact.get('blocked')});
                this.updateScrollBar();
            }
        },

        readMessages: function (timestamp) {
            var unread_messages = _.clone(this.model.messages_unread.models);
            if (unread_messages.length) {
                let msg = unread_messages[unread_messages.length - 1];
                this.model.sendMarker(msg.get('msgid'), 'displayed', msg.get('stanza_id'), msg.get('contact_stanza_id'));
            }
            this.model.set('const_unread', 0);
            _.each(unread_messages, function (msg) {
                if (!timestamp || msg.get('timestamp') <= timestamp) {
                    msg.set('is_unread', false);
                }
            }.bind(this));
        },

        onMouseWheel: function (ev) {
            if (ev.originalEvent.deltaY < 0) {
                this.loadPreviousHistory();
            }
            this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
        },

        keyupSearch: function (ev) {
            if (ev.keyCode === constants.KEY_ENTER) {
                let query = this.$search_form.find('input').val();
                this.model.searchMessages(query, function (messages) {}.bind(this));
            }
            if (ev.keyCode === constants.KEY_ESCAPE) {
                this.head.renderSearchPanel();
            }
        },

        onScrollY: function () {
            if (this._scrolltop === 0) {
                this.$('.fixed-day-indicator-wrap').css('opacity', 1);
                this.current_day_indicator = utils.pretty_date(parseInt(this.$('.chat-content').children().first().data('time')));
                this.showDayIndicator(this.current_day_indicator);
            }
            this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
        },

        onScroll: function () {
            if (!this.isVisible())
                return;
            this.$('.back-to-bottom').hideIf(this.isScrolledToBottom());
            let $chatday_indicator = this.$('.chat-day-indicator'),
                $messages = this.$('.chat-message'),
                indicator_idx = undefined,
                opacity_value;
            this._prev_scrolltop = this._scrolltop || 0;
            this._scrolltop = this.getScrollTop();
            $chatday_indicator.each(function (idx, indicator) {
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
            }.bind(this));
            if (indicator_idx) {
                this.$('.fixed-day-indicator-wrap').css('opacity', opacity_value);
                this.current_day_indicator = utils.pretty_date(parseInt($($chatday_indicator[indicator_idx]).attr('data-time')));
            }
            else {
                $messages.each(function (idx, msg) {
                    if ((msg.offsetTop + $(msg).height() > this._scrolltop) && (msg.offsetTop < this._scrolltop)) {
                        indicator_idx = idx;
                        opacity_value = 1;
                        return false;
                    }
                }.bind(this));
                if (indicator_idx) {
                    this.$('.fixed-day-indicator-wrap').css('opacity', opacity_value);
                    this.current_day_indicator = utils.pretty_date(parseInt($($messages[indicator_idx]).attr('data-time')));
                }
            }
            if (this.current_day_indicator !== null) {
                this.showDayIndicator(this.current_day_indicator);
            }
            if (this._scrolltop < this._prev_scrolltop &&
                (this._scrolltop < 100 || this.getPercentScrolled() < 0.1)) {
                this.loadPreviousHistory();
            }
        },

        backToBottom: function () {
            this.scrollToBottom();
        },

        MAMRequest: function (options, callback, errback) {
            var account = this.account,
                contact = this.contact,
                messages = [], queryid = uuid(),
                is_groupchat = contact.get('group_chat'), success = true, iq;
            if (is_groupchat)
                iq = $iq({type: 'set', to: contact.get('jid')});
            else
                iq = $iq({type: 'set'});
            iq.c('query', {xmlns: Strophe.NS.MAM, queryid: queryid})
                    .c('x', {xmlns: Strophe.NS.DATAFORM, type: 'submit'})
                    .c('field', {'var': 'FORM_TYPE', type: 'hidden'})
                    .c('value').t(Strophe.NS.MAM).up().up();
            if (!is_groupchat)
                iq.c('field', {'var': 'with'})
                    .c('value').t(this.model.get('jid')).up().up();
            if (options.var)
                options.var.forEach(function (opt_var) {
                    iq.c('field', {'var': opt_var.var})
                        .c('value').t(opt_var.value).up().up();
                }.bind(this));
            iq.up().cnode(new Strophe.RSM(options).toXML());
            var deferred = new $.Deferred();
            account.chats.onStartedMAMRequest(deferred);
            deferred.done(function () {
                var handler = account.connection.addHandler(function (message) {
                    if (is_groupchat == contact.get('group_chat')) {
                        var $msg = $(message);
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
                account.sendIQ(iq,
                    function (res) {
                        account.connection.deleteHandler(handler);
                        account.chats.onCompletedMAMRequest(deferred);
                        var $fin = $(res).find('fin[xmlns="'+Strophe.NS.MAM+'"]');
                        if ($fin.length && $fin.attr('queryid') === queryid) {
                            var rsm = new Strophe.RSM({xml: $fin.find('set')[0]});
                            rsm.complete = ($fin.attr('complete') === 'true') ? true : false;
                            callback && callback(success, messages, rsm);
                        }
                    },
                    function (err) {
                        account.connection.deleteHandler(handler);
                        xabber.error("MAM error");
                        xabber.error(err);
                        account.chats.onCompletedMAMRequest(deferred);
                        errback && errback(err);
                    }
                );
            });
        },

        getMessageArchive: function (query, options) {
            if (options.previous_history) {
                if (this._loading_history || this.model.get('history_loaded')) {
                    return;
                }
                this._loading_history = true;
                clearTimeout(this._load_history_timeout);
                this._load_history_timeout = setTimeout(function () {
                    this._loading_history = false;
                }.bind(this), 60000);
                this.showHistoryFeedback();
            }
            var account = this.model.account, counter = 0;
                this.MAMRequest(query,
                    function (success, messages, rsm) {
                        clearTimeout(this._load_history_timeout);
                        this._loading_history = false;
                        this.hideHistoryFeedback();
                        if (options.missed_history && !rsm.complete && (rsm.count > messages.length))
                            this.getMessageArchive({after: rsm.last}, {missed_history: true});
                        if (this.contact.get('group_chat')) {
                            if (!this.contact.my_info)
                                this.contact.getMyInfo();
                        }
                        else {
                            if (!this.contact.get('last_seen') && !this.contact.get('is_server'))
                                this.contact.getLastSeen();
                        }
                        if ((messages.length < query.max) && success) {
                            this.model.set('history_loaded', true);
                        }
                        if (options.previous_history || !this.model.get('first_archive_id')) {
                            rsm.first && this.model.set('first_archive_id', rsm.first);
                        }
                        if (options.last_history || !this.model.get('last_archive_id')) {
                            rsm.last && this.model.set('last_archive_id', rsm.last);
                        }
                        _.each(messages, function (message) {
                            var loaded_message = account.chats.receiveChatMessage(message,
                                _.extend({is_archived: true}, options)
                            );
                            if (loaded_message) counter++;
                        });
                        if ((counter === 0) && options.last_history && !this.model.get('history_loaded')) {
                            this.getMessageArchive(_.extend(query, {
                                max: xabber.settings.mam_messages_limit,
                                before: this.model.get('first_archive_id') || ''
                            }), {previous_history: true});
                        }
                    }.bind(this),
                    function (err) {
                        if (options.previous_history) {
                            this._loading_history = false;
                            this.showHistoryFeedback(true);
                        }
                    }.bind(this)
                );
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
            var last_archive_id = this.model.get('last_archive_id'),
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
            if (!xabber.settings.load_history) {
                return;
            }
            this.getMessageArchive({
                max: xabber.settings.mam_messages_limit,
                before: this.model.get('first_archive_id') || '' },
                {previous_history: true
                });
        },

        showHistoryFeedback: function (is_error) {
            if (this._load_history_feedback_timeout) {
                clearTimeout(this._load_history_feedback_timeout);
                this._load_history_feedback_timeout = null;
            }
            var text = is_error ? 'Error while loading archived messages' : 'Loading messages...';
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
                var pinned_message = this.contact.get('pinned_message'),
                    msg = this.buildMessageHtml(pinned_message),
                    pinned_msg_modal = new xabber.ExpandedMessagePanel({account: this.account, chat_content: this});
                pinned_msg_modal.$el.attr('data-color', this.account.settings.get('color'));
                this.updateMessageInChat(msg);
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

        unpinMessage: function () {
            var iq = $iq({from: this.account.get('jid'), type: 'set', to: this.contact.get('jid')})
                .c('update', {xmlns: Strophe.NS.GROUP_CHAT})
                .c('pinned-message');
            this.account.sendIQ(iq, function () {}, function (error) {
                if ($(error).find('error not-allowed').length)
                    utils.dialogs.error('You have no permission to pin/unpin message');
            });
        },

        hideHistoryFeedback: function () {
            this.$history_feedback.addClass('hidden');
        },

        receiveNoTextMessage: function ($message, carbon_copied) {
            var from_jid = Strophe.getBareJidFromJid($message.attr('from')),
                to_jid = Strophe.getBareJidFromJid($message.attr('to')),
                is_sender = from_jid === this.account.get('jid'),
                $chat_state = $message.find('[xmlns="'+Strophe.NS.CHATSTATES+'"]');
            if ($chat_state.length) {
                if (!is_sender) {
                    let $subtype = $chat_state.children('subtype');
                    this.showChatState($chat_state[0].tagName.toLowerCase(), $subtype.attr('type'), $subtype.attr('mime-type'));
                }
            }
        },

        showChatState: function (state, type, mime_type) {
            clearTimeout(this._chatstate_show_timeout);
            var message, name = this.contact.get('name');
            if (state === 'composing') {
                if (type) {
                    this._current_composing_msg = {type: type};
                    if (type === 'upload') {
                        let file_type = mime_type ? utils.pretty_file_type_with_article(mime_type) : 'file';
                        mime_type && (this._current_composing_msg.mime_type = mime_type);
                        message = 'sending ' + file_type;
                        this._chatstate_show_timeout = setTimeout(function () {
                            this.showChatState();
                        }.bind(this), constants.CHATSTATE_TIMEOUT_PAUSED_AUDIO);
                    } else {
                        if (type === 'voice')
                            message = 'recording a voice message...';
                        if (type === 'video')
                            message = 'recording a video message...';
                        this._chatstate_show_timeout = setTimeout(function () {
                            this.showChatState('paused', type);
                        }.bind(this), constants.CHATSTATE_TIMEOUT_PAUSED_AUDIO);
                    }
                }
                else {
                    this._current_composing_msg = undefined;
                    message = 'typing...';
                    this._chatstate_show_timeout = setTimeout(function () {
                        this.showChatState();
                    }.bind(this), constants.CHATSTATE_TIMEOUT_PAUSED);
                }
            } else if (state === 'paused') {
                this.showChatState();
            } else {
                this.bottom.showChatNotification('');
                this.chat_item.updateLastMessage();
                return;
            }
            if (message)
                this.bottom.showChatNotification(name + ' is ' + message);
            else
                this.bottom.showChatNotification();
            this.chat_item.$('.last-msg').text(message);
            this.chat_item.$('.last-msg-date').text(utils.pretty_short_datetime())
                .attr('title', utils.pretty_datetime());
            this.chat_item.$('.msg-delivering-state').addClass('hidden');
        },

        updateMentions: function (message) {
            if (message.get('mentions')) {
                message.get('mentions').forEach(function (mention) {
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
                }.bind(this));
            }
        },

        onMessage: function (message) {
            this.updateMentions(message);
            let scrolled_from_bottom = this.getScrollBottom();
            this.account.messages.add(message);
            if (!_.isUndefined(message.get('is_accepted'))) {
                this.model.set('is_accepted', false);
            }
            this.model.set('opened', true);
            if (!message.get('is_archived') && message.get('stanza_id'))
                this.model.set('last_archive_id', message.get('stanza_id'));

            if (message.get('participants_version')) {
                if (this.contact.participants && this.contact.participants.version < message.get('participants_version'))
                    this.contact.trigger('update_participants');
            }

            let is_scrolled_to_bottom = this.isScrolledToBottom(),
                $message = this.addMessage(message);

            if (message.get('type') === 'file_upload') {
                this.startUploadFile(message, $message);
            }

            if (is_scrolled_to_bottom || message.get('submitted_here')) {
                this.scrollToBottom();
            } else {
                this.updateScrollBar();
                this.scrollTo(this.ps_container[0].scrollHeight - this.ps_container[0].offsetHeight - scrolled_from_bottom);
            }

            if (!(message.get('synced_from_server') || message.get('is_archived'))) {
                if (!(message.isSenderMe() || message.get('silent') || ((message.get('type') === 'system') && !message.get('auth_request')))) {
                    message.set('is_unread', !(this.model.get('display') && xabber.get('focused')));
                    if (!message.get('is_unread'))
                        this.model.sendMarker(message.get('msgid'), 'displayed', message.get('stanza_id'), message.get('contact_stanza_id'));
                    if (!xabber.get('focused')) {
                        if (this.contact.get('muted'))
                            message.set('muted', true);
                        else
                            this.notifyMessage(message);
                    }
                    this.model.setMessagesDisplayed(message.get('timestamp'));
                }
                if (this.contact.get('archived'))
                    if (this.contact.get('muted'))
                        message.set('archived', true);
                    else {
                        this.head.archiveChat();
                        this.contact.set('archived', false);
                    }
            }

            if (message.get('attention')) {
                this.attentionMessage(message);
            }

            if (message.isSenderMe()) {
                if (!message.get('is_archived') && !message.get('missed_msg'))
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
            }

            let last_message = this.model.last_message;
            if (!last_message || message.get('timestamp') >= last_message.get('timestamp')) {
                this.model.last_message = message;
                this.chat_item.updateLastMessage();
            }
            if (message.get('mentions')) {
                message.get('mentions').forEach(function (mention) {
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
                            this._pending_my_info.done(function () {
                                (mention_target === this.contact.my_info.get('id')) && this.account.mentions.create(null, {message: message, contact: this.contact});
                                this._pending_my_info = null;
                            }.bind(this));
                        }
                        else {
                            this._pending_my_info = new $.Deferred();
                            this.contact.getMyInfo(function () {
                                (mention_target === this.contact.my_info.get('id')) && this.account.mentions.create(null, {
                                    message: message,
                                    contact: this.contact
                                });
                                this._pending_my_info.resolve();
                            }.bind(this));
                        }
                    }
                    (mention_target === this.account.get('jid') || mention_target === "") && this.account.mentions.create(null, {message: message, contact: this.contact});
                }.bind(this));
            }
        },

        addMessage: function (message) {
            if (message.get('auth_request')) {
                // return;
            }
            var $message = this.buildMessageHtml(message);
            var index = this.model.messages.indexOf(message);
            if (index === 0) {
                $message.prependTo(this.$('.chat-content'));
            } else {
                $message.insertAfter(this.$('.chat-message').eq(index - 1));
            }
            var $next_message = $message.nextAll('.chat-message').first();
            this.updateMessageInChat($message[0]);
            if ($next_message.length) {
                this.updateMessageInChat($next_message[0]);
            }
            this.initPopup($message);
            this.bottom.showChatNotification();
            return $message;
        },

        initPopup: function ($message) {
            var $one_image = $message.find('.uploaded-img'),
                $collage_image = $message.find('.uploaded-img-for-collage');
            if ($one_image.length) {
                $one_image.each(function (idx, item) {
                    this.initMagnificPopup($(item));
                }.bind(this));
            }
            if ($collage_image.length) {
                this.initZoomGallery($message);
            }
        },

        initMagnificPopup: function ($elem) {
            $elem.magnificPopup({
                type: 'image',
                closeOnContentClick: true,
                fixedContentPos: true,
                mainClass: 'mfp-no-margins mfp-with-zoom',
                image: {
                    verticalFit: true
                },
                zoom: {
                    enabled: true,
                    duration: 300
                }
            });
        },

        initZoomGallery: function ($message) {
            var self = this;
            $message.find('.zoom-gallery').magnificPopup({
                delegate: 'img',
                type: 'image',
                closeOnContentClick: false,
                closeBtnInside: false,
                mainClass: 'mfp-with-zoom mfp-img-mobile',
                image: {
                    verticalFit: true,
                    titleSrc: function(item) {
                        return '<a class="image-source-link" href="'+item.el.attr('src')+'" target="_blank">' + self.model.messages.getFilename(item.el.attr('src')) + '</a>';
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
            let $message, images = item.get('images'), emoji = item.get('only_emoji'),
                files =  item.get('files');
            if (item instanceof xabber.Message)
                $message = this.$('.chat-message[data-uniqueid="' + item.get('unique_id') + '"]');
            else
                return;
            $message.children('.msg-wrap').children('.chat-msg-content').html(utils.markupBodyMessage(item).emojify({tag_name: 'div', emoji_size: utils.emoji_size(emoji)}));
            if (images) {
                if (images.length > 1) {
                    let template_for_images = this.createImageGrid(item.attributes);
                    $message.find('.chat-msg-media-content').html(template_for_images);
                }
                if (images.length == 1) {
                    let $img_html = this.createImage(images[0]),
                        img_content = this.createImageContainer(images[0]);
                    $img_html.onload = function () {
                        this.imageOnload($message);
                    }.bind(this);
                    $message.find('.chat-msg-media-content').html($(img_content).html($img_html));
                    this.updateScrollBar();
                }
            }

            if (files) {
                if (files.length > 0) {
                    let is_audio, file_attrs = _.clone(files),
                        template_for_file_content;
                    $(file_attrs).each(function(idx, file) {
                        if (file.type) {
                            if (file.voice)
                                is_audio = true;
                            else
                                is_audio = false;
                        }
                        let mdi_icon_class = utils.file_type_icon(file.type);
                        _.extend(file_attrs[idx], { is_audio: is_audio, duration: utils.pretty_duration(file_attrs[idx].duration), mdi_icon: mdi_icon_class, size: utils.pretty_size(file_attrs[idx].size)});
                        template_for_file_content = is_audio ? $(templates.messages.audio_file(file_attrs[idx])) : $(templates.messages.file(file_attrs[idx]));
                        $message.find('.chat-msg-media-content').append(template_for_file_content);
                    }.bind(this));
                }
            }

            if (item.get('data_form')) {
                let data_form = utils.render_data_form(item.get('data_form'));
                $message.find('.chat-msg-content').append(data_form);
            }
            let short_datetime = utils.pretty_short_datetime(item.get('last_replace_time')),
                datetime = moment(item.get('last_replace_time')).format('D MMMM, YYYY HH:mm:ss'),
                new_title = utils.pretty_datetime(item.get('time')) + ', edited ' + (moment(item.get('timestamp')).startOf('day').isSame(moment(item.get('last_replace_time')).startOf('day')) ? short_datetime : datetime);
            $message.find('.msg-time').prop('title', new_title);
            $message.find('.edited-info').removeClass('hidden').text('edited').prop('title', new_title);
            $message.hyperlinkify({selector: '.chat-text-content'});
        },

        removeMessage: function (item) {
            var message, $message, $message_in_chat;
            if (item instanceof xabber.Message) {
                message = item;
                $message_in_chat = this.$('.chat-message[data-uniqueid="'+item.get('unique_id')+'"]');
                (this.bottom.content_view) && ($message = this.bottom.content_view.$('.chat-message[data-uniqueid="'+item.get('unique_id')+'"]'));
            } else {
                $message = item;
                if (!$message.length) return;
                message = this.model.messages.get($message.data('uniqueid'));
            }
            message && message.destroy();
            this.removeMessageFromDOM($message_in_chat);
            if ($message && ($message !== $message_in_chat))
                this.removeMessageFromDOM($message);
        },

        removeMessageFromDOM: function ($message) {
            if (($message.hasClass('with-author')) && (!$message.next().hasClass('with-author'))) {
                var avatar = $message.find('.circle-avatar')[0];
                $message.next().addClass('with-author');
                $message.next().find('.circle-avatar').replaceWith(avatar);
            }
            $message.prev('.chat-day-indicator').remove();
            $message.remove();
            if (!this._clearing_history) {
                this.updateScrollBar();
            }
        },

        clearHistory: function () {
            let dialog_options = [];
            this._clearing_history = true;
            if (this.account.server_features.get(Strophe.NS.REWRITE)) {
                (!this.contact.get('group_chat') && xabber.servers.get(this.contact.domain).server_features.get(Strophe.NS.REWRITE)) && (dialog_options = [{
                    name: 'symmetric_deletion',
                    checked: false,
                    text: 'Delete for all'
                }]);
                utils.dialogs.ask("Clear message archive", "Are you sure you want to <b>delete all message history</b> for this chat?",
                    dialog_options, {ok_button_text: 'delete'}).done(function (res) {
                    if (!res) {
                        this._clearing_history = false;
                        return;
                    }
                    let symmetric = (this.contact.get('group_chat')) ? true : (res.symmetric_deletion ? true : false);
                    this.model.retractAllMessages(symmetric, function () {
                        this._clearing_history = false;
                        this.chat_item.updateLastMessage();
                        this.updateScrollBar();
                    }.bind(this), function () {
                        this._clearing_history = false;
                    }.bind(this));
                }.bind(this));
            }
            else {
                utils.dialogs.ask("Clear message archive", "Are you sure you want to <b>delete all message history</b> for this chat?" + ("\nWarning! <b>" + this.account.domain + "</b> server does not support message deletion. Only local message history will be deleted.").fontcolor('#E53935'),
                    dialog_options, {ok_button_text: 'delete locally'}).done(function (res) {
                    if (!res) {
                        this._clearing_history = false;
                        return;
                    }
                    let msgs = _.clone(this.model.messages.models);
                    msgs.forEach(function (item) { this.removeMessage(item); }.bind(this));
                }.bind(this));
            }
        },

        renderVoiceMessage: function (element, file_url) {
            let not_expanded_msg = element.innerHTML,
                unique_id = 'waveform' + moment.now(),
                $elem = $(element),
                $msg_element = $elem.closest('.link-file');
            $elem.addClass('voice-message-rendering').html($(templates.messages.audio_file_waveform({waveform_id: unique_id})));
            let aud = this.createAudio(file_url, unique_id);

            aud.on('ready', function () {
                let duration = Math.round(aud.getDuration());
                $elem.find('.voice-msg-total-time').text(utils.pretty_duration(duration));
                aud.play();
            }.bind(this));

            aud.on('error', function () {
                $elem.removeClass('voice-message-rendering');
                element.innerHTML = not_expanded_msg;
                aud.unAll();
                $elem.find('.voice-message-play').get(0).remove();
                utils.callback_popup_message("This type of audio isn't supported in Your browser", 3000);
            }.bind(this));

            aud.on('play', function() {
                $msg_element.addClass('playing');
                let timerId = setInterval(function() {
                    let cur_time = Math.round(aud.getCurrentTime());
                    if (aud.isPlaying())
                        $elem.find('.voice-msg-current-time').text(utils.pretty_duration(cur_time));
                    else
                        clearInterval(timerId);
                }, 100);
            }.bind(this));

            aud.on('finish', function () {
                $msg_element.removeClass('playing');
            });

            aud.on('pause', function () {
                $msg_element.removeClass('playing');
            });

            this.$('.voice-message-volume')[0].onchange = function () {
                aud.setVolume(this.$('.voice-message-volume').val()/100);
            }.bind(this);
            return aud;
        },

        createImageGrid: function (attrs) {
            if (attrs.images.length > 6) {
                var tpl_name = 'template-for-6',
                    hidden_images = attrs.images.length - 5,
                    template_for_images = $(templates.messages[tpl_name](attrs));
                template_for_images.find('.last-image').addClass('hidden-images');
                template_for_images.find('.image-counter').text('+' + hidden_images);
            }
            else {
                var tpl_name = 'template-for-' + attrs.images.length,
                template_for_images = $(templates.messages[tpl_name](attrs));
            }
            return template_for_images;
        },

        buildMessageHtml: function (message) {
            var attrs = _.clone(message.attributes),
                is_sender = (message instanceof xabber.Message) ? message.isSenderMe() : false,
                user_info = attrs.user_info || {},
                username = Strophe.xmlescape(user_info.nickname || ((attrs.from_jid === this.contact.get('jid')) ? this.contact.get('name') : (is_sender ? ((this.contact.my_info) ? this.contact.my_info.get('nickname') : this.account.get('name')) : (this.account.contacts.get(attrs.from_jid) ? this.account.contacts.get(attrs.from_jid).get('name') : attrs.from_jid)))),
                images = attrs.images,
                emoji = message.get('only_emoji'),
                files =  attrs.files,
                is_image = !_.isUndefined(images),
                is_file = files ? true : false,
                is_audio = false,
                template_for_images,
                avatar_id = user_info.avatar,
                role = user_info.role,
                badge = user_info.badge,
                from_id = user_info.id;

            if (is_sender && this.contact.get('group_chat')) {
                if (this.contact.my_info) {
                    role = this.contact.my_info.get('role');
                    badge = this.contact.my_info.get('badge');
                }
            }
            _.extend(attrs, {
                username: username,
                state: (message instanceof xabber.Message) ? message.getState() : 'sent',
                verbose_state: (message instanceof xabber.Message) ? message.getVerboseState() : 'sent',
                time: utils.pretty_datetime(attrs.time),
                short_time: utils.pretty_time(attrs.time),
                avatar_id: avatar_id,
                is_image: is_image,
                is_file: is_file,
                files: files,
                role: utils.pretty_name(role),
                badge: badge,
                from_id: from_id
            });
            if (attrs.type === 'file_upload') {
                return $(templates.messages.file_upload(attrs));
            }

            if (attrs.type === 'system') {
                let tpl_name = attrs.invite ? 'group_request' : 'system';
                return $(templates.messages[tpl_name](attrs));
            }

            if (is_image) {
                if (images.length > 1) {
                    template_for_images = this.createImageGrid(attrs);
                }
            }

            var classes = [
                attrs.forwarded_message && 'forwarding',
                attrs.encrypted && 'encrypted'
            ];

            let markup_body = utils.markupBodyMessage(message);

            var $message = $(templates.messages.main(_.extend(attrs, {
                is_sender: is_sender,
                message: markup_body,
                classlist: classes.join(' ')
            })));

            if (is_image) {
                if (images.length > 1) {
                    $message.find('.chat-msg-media-content').html(template_for_images);
                }
                if (images.length == 1) {
                    let $img_html = this.createImage(images[0]),
                        img_content = this.createImageContainer(images[0]);
                    $img_html.onload = function () {
                        this.imageOnload($message);
                    }.bind(this);
                    $message.find('.chat-msg-media-content').html($(img_content).html($img_html));
                    this.updateScrollBar();
                }
            }

            if (is_file) {
                if (files.length > 0) {
                    let file_attrs = _.clone(files),
                        template_for_file_content;
                    $(file_attrs).each(function(idx, file) {
                        if (file.type) {
                            if (file.voice)
                                is_audio = true;
                            else
                                is_audio = false;
                        }
                        ((file_attrs.length === 1) && is_audio) && (file.name = 'Voice message');
                        let mdi_icon_class = utils.file_type_icon(file.type);
                        _.extend(file_attrs[idx], { is_audio: is_audio, duration: utils.pretty_duration(file_attrs[idx].duration), mdi_icon: mdi_icon_class, size: utils.pretty_size(file_attrs[idx].size) });
                        template_for_file_content = is_audio ? $(templates.messages.audio_file(file_attrs[idx])) : $(templates.messages.file(file_attrs[idx]));
                        $message.find('.chat-msg-media-content').append(template_for_file_content);
                    }.bind(this));
                }
            }

            if (message.get('data_form')) {
                let data_form = utils.render_data_form(message.get('data_form'));
                $message.find('.chat-msg-content').append(data_form);
            }

            if (attrs.forwarded_message) {
                $(attrs.forwarded_message).each(function(idx, fwd_msg) {
                    is_sender = fwd_msg.isSenderMe();
                    attrs = _.clone(fwd_msg.attributes);
                    var is_image_forward = attrs.images && attrs.images.length,
                        images_forward = is_image_forward ? _.clone(attrs.images) : undefined,
                        $img_html_forward,
                        is_forward_file = (attrs.files) ? true : false,
                        is_fwd_voice_message,
                        user_info = attrs.user_info || {},
                        avatar_id = user_info.avatar,
                        role = utils.pretty_name(user_info.role),
                        badge = user_info.badge,
                        from_id = user_info.id,
                        from_jid = attrs.from_jid;
                    if (is_sender) {
                        username = Strophe.xmlescape(user_info.nickname || this.account.get('name'));
                    } else {
                        username = Strophe.xmlescape(user_info.nickname || user_info.id || this.account.contacts.mergeContact({jid: from_jid}).get('name'));
                    }

                    let fwd_markup_body = utils.markupBodyMessage(fwd_msg);

                    var $f_message = $(templates.messages.forwarded(_.extend(attrs, {
                        time: utils.pretty_datetime(attrs.time),
                        short_time: utils.pretty_short_month_date(attrs.time),
                        username: username,
                        avatar_id: avatar_id,
                        message: fwd_markup_body,
                        is_file: is_forward_file,
                        is_audio: is_fwd_voice_message,
                        role: role,
                        badge: badge,
                        from_id: from_id
                    })));

                    if (fwd_msg.get('forwarded_message')) {
                        var fwd_messages_count = fwd_msg.get('forwarded_message').length,
                            fwd_messages_link = fwd_messages_count + ' forwarded message' + ((fwd_messages_count > 1) ? 's' : "");
                        $f_message.children('.msg-wrap').children('.fwd-msgs-block').append($('<a/>', {class: 'collapsed-forwarded-message', 'data-uniqueid': attrs.unique_id}).text(fwd_messages_link));
                    }

                    if (is_image_forward) {
                        if (images_forward.length > 1) {
                            template_for_images = this.createImageGrid(attrs);
                            $f_message.find('.chat-msg-media-content').html(template_for_images);
                        }
                        if (images_forward.length == 1) {
                            $img_html_forward = this.createImage(images_forward[0]);
                            $img_html_forward.onload = function () {
                                this.imageOnload($message);
                            }.bind(this);
                            let img_content_forward = this.createImageContainer(images_forward[0]);
                            $f_message.find('.chat-msg-media-content').html($(img_content_forward).html($img_html_forward));
                        }
                    }

                    if (is_forward_file) {
                        if (attrs.files.length > 0) {
                            var file_attrs = _.clone(attrs.files),
                                template_for_file_content;
                            if (!is_image_forward)
                            $(file_attrs).each(function(idx, file) {
                                if (file.type) {
                                    if (file.voice)
                                        is_audio = true;
                                    else
                                        is_audio = false;
                                }
                                ((file_attrs.length === 1) && is_audio) && (file.name = 'Voice message');
                                let mdi_icon_class = utils.file_type_icon(file.type);
                                _.extend(file_attrs[idx], { is_audio: is_audio, duration: utils.pretty_duration(file_attrs[idx].duration), mdi_icon: mdi_icon_class, size: utils.pretty_size(file_attrs[idx].size)});
                                template_for_file_content = is_audio ? $(templates.messages.audio_file(file_attrs[idx])) : $(templates.messages.file(file_attrs[idx]));
                                $f_message.find('.chat-msg-media-content').append(template_for_file_content);
                            }.bind(this));
                        }
                    }
                    $message.children('.msg-wrap').children('.fwd-msgs-block').append($f_message);
                }.bind(this));
                this.updateScrollBar();
            }
            else
                $message.find('.fwd-msgs-block').remove();

            return $message.hyperlinkify({selector: '.chat-text-content'}).emojify('.chat-text-content', {tag_name: 'div', emoji_size: utils.emoji_size(emoji)}).emojify('.chat-msg-author-badge', {emoji_size: 16});
        },

        getDateIndicator: function (date) {
            var day_date = moment(date).startOf('day');
            return $('<div class="chat-day-indicator one-line noselect" data-time="'+
                day_date.format('x')+'">'+utils.pretty_date(day_date)+'</div>');
        },

        hideMessageAuthor: function ($msg) {
            $msg.removeClass('with-author');
        },

        showMessageAuthor: function ($msg) {
            if ($msg.hasClass('system')) {
                return;
            }
            $msg.addClass('with-author');
            let image, $avatar = $msg.find('.left-side .circle-avatar'),
                from_jid = $msg.data('from');
            if (from_jid === this.account.get('jid')) {
                if (this.contact.get('group_chat')) {
                    if (this.contact.my_info) {
                        image = this.contact.my_info.get('b64_avatar');
                        if (!image)
                            image = Images.getDefaultAvatar(this.contact.my_info.get('nickname'));
                        else
                            image = Images.getCachedImage(image);
                    }
                }
                if (!image)
                    image = this.account.cached_image;
            } else {
                if (this.contact.get('group_chat')) {
                    var author = $msg.find('.msg-wrap .chat-msg-author').text();
                    image = Images.getDefaultAvatar(author);
                }
                else {
                    var author = this.account.contacts.get($msg.data('from')) || $msg.find('.msg-wrap .chat-msg-author').text() || $msg.data('from');
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
                            pending_avatar.dfd.done(function (data_avatar) {
                                $avatar.setAvatar(data_avatar, this.avatar_size);
                                let idx = this._pending_avatars.indexOf(pending_avatar);
                                if (idx > -1)
                                    this._pending_avatars.splice(idx, 1);
                            }.bind(this));
                        } else {
                            var node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + $msg.data('from-id'), dfd = new $.Deferred();
                            this._pending_avatars.push({hash: $msg.data('avatar'), dfd: dfd});
                            this.contact.getAvatar($msg.data('avatar'), node, function (data_avatar) {
                                $avatar.setAvatar(data_avatar, this.avatar_size);
                                this.account.chat_settings.updateCachedAvatars($msg.data('from-id'), $msg.data('avatar'), data_avatar);
                                dfd.resolve(data_avatar);
                            }.bind(this));
                        }
                    }
                }
            }
        },

        hideFwdMessageAuthor: function ($msg) {
            $msg.removeClass('with-author');
        },

        showFwdMessageAuthor: function ($fwd_message) {
            if (!$fwd_message.length) {
                return;
            }
            $fwd_message.addClass('with-author');
            var image,
                $avatar = $fwd_message.find('.circle-avatar'),
                from_jid = $fwd_message.data('from'),
                is_sender = (from_jid === this.account.get('jid')),
                contact = this.account.contacts.get(from_jid) || from_jid;
            if (is_sender) {
                if (this.contact.get('group_chat')) {
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
                image = contact.cached_image || (this.contact.get('group_chat') ? Images.getDefaultAvatar($fwd_message.find('.msg-wrap .fwd-msg-author').text()) : Images.getDefaultAvatar(contact));
            }
            $avatar.setAvatar(image, this.avatar_size);
            $avatar.removeClass('hidden');
            if ($fwd_message.data('avatar')) {
                if ($fwd_message.data('from-id')) {
                    if ((this.account.chat_settings.getHashAvatar($fwd_message.data('from-id')) == $fwd_message.data('avatar')) && (this.account.chat_settings.getB64Avatar($fwd_message.data('from-id')))) {
                        $avatar.setAvatar(this.account.chat_settings.getB64Avatar($fwd_message.data('from-id')), this.avatar_size);
                    }
                    else {
                        var node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + $fwd_message.data('from-id');
                        this.contact.getAvatar($fwd_message.data('avatar'), node, function (data_avatar) {
                            $avatar.setAvatar(data_avatar, this.avatar_size);
                            this.account.chat_settings.updateCachedAvatars($fwd_message.data('from-id'), $fwd_message.data('avatar'), data_avatar);
                        }.bind(this));
                    }
                }
            }
        },

        updateMessageInChat: function (msg_elem) {
            var $msg = $(msg_elem);
            $msg.prev('.chat-day-indicator').remove();
            var $prev_msg = $msg.prevAll('.chat-message').first();
            if (!$prev_msg.length) {
                this.getDateIndicator($msg.data('time')).insertBefore($msg);
                this.showMessageAuthor($msg);
                $msg.find('.fwd-message').each(function (idx, fwd_msg_item) {
                    this.showFwdMessageAuthor($(fwd_msg_item));
                }.bind(this));
                return;
            }
            if ($msg.find('.data-form').length) {
                this.showMessageAuthor($msg);
                return;
            }
            var is_system = $prev_msg.hasClass('system'),
                is_same_sender = ($msg.data('from') === $prev_msg.data('from')),
                is_same_date = moment($msg.data('time')).startOf('day')
                        .isSame(moment($prev_msg.data('time')).startOf('day'));
            if (!is_same_date) {
                this.getDateIndicator($msg.data('time')).insertBefore($msg);
                this.showMessageAuthor($msg);
            } else if (is_system || !is_same_sender) {
                this.showMessageAuthor($msg);
            } else {
                this.hideMessageAuthor($msg);
            }
            if ($msg.hasClass('forwarding')) {
                var $fwd_message = $msg.find('.fwd-message');
                $fwd_message.each(function (idx, fwd_msg_item) {
                    var $fwd_msg_item = $(fwd_msg_item),
                        $prev_fwd_message = (idx > 0) ? $fwd_msg_item.prev() : [];
                    $fwd_msg_item.switchClass('hide-date', is_same_date && $prev_fwd_message.length);
                    $fwd_msg_item.removeClass('hide-time');
                    if ($prev_fwd_message.length) {
                        var is_same_fwded_sender = ($fwd_msg_item.data('from') === $prev_fwd_message.data('from'));
                        if (is_same_fwded_sender) {
                            this.hideFwdMessageAuthor($fwd_msg_item);
                        } else {
                            this.showFwdMessageAuthor($fwd_msg_item);
                        }
                    } else {
                        this.showMessageAuthor($msg);
                        this.showFwdMessageAuthor($fwd_msg_item);
                    }
                }.bind(this));
            }
        },

        notifyMessage: function (message) {
            var jid = this.model.get('jid');
            if (xabber.settings.notifications) {
                var notification = xabber.popupNotification({
                    title: this.contact.get('name'),
                    text: (xabber.settings.message_preview ? message.getText() : 'sent you a message'),
                    icon: this.contact.cached_image.url
                });
                notification.onclick = function () {
                    window.focus();
                    this.model.trigger('open');
                }.bind(this);
            }
            if (xabber.settings.sound) {
                var sound;
                if (message.get('auth_request')) {
                    sound = xabber.settings.sound_on_auth_request;
                } else {
                    sound = xabber.settings.sound_on_message;
                }
                xabber.playAudio(sound);
            }
            xabber.recountAllMessageCounter();
        },

          attentionMessage: function () {
              var notification = xabber.popupNotification({
                  title: this.contact.get('name'),
                  text: 'Attention',
                  icon: this.contact.cached_image.url
              });
              notification.onclick = function () {
                  window.focus();
                  this.model.trigger('open');
              }.bind(this);
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
                stanza = $msg({
                    from: this.account.jid,
                    to: this.model.get('jid'),
                    type: 'chat',
                    id: msg_id
                });

            if (forwarded_message) {
                legacy_body = [];
                $(forwarded_message).each(function (idx, fwd_msg) {
                    let legacy_fwd_msg = Array.from(_.escape(_.unescape(this.bottom.createTextMessage([fwd_msg], ">"))) + ((idx === forwarded_message.length - 1 && !body.length) ? "" : '\n')),
                        idx_begin = legacy_body.length,
                        idx_end = legacy_body.concat(legacy_fwd_msg).length;
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
                        }).up().cnode(fwd_msg.get('xml')).up().up().up();
                    legacy_body = legacy_body.concat(legacy_fwd_msg);
                    mutable_content.push({
                        start: idx_begin,
                        end: idx_end,
                        type: 'forward'
                    });
                }.bind(this));
                body = _.unescape(legacy_body.join("")) + body;
            }

            if (message.get('mentions') && message.get('mentions').length) {
                message.get('mentions').forEach(function (mention) {
                    let mention_attrs = {xmlns: Strophe.NS.MARKUP};
                    mention.is_gc && (mention_attrs.node = Strophe.NS.GROUP_CHAT);
                    stanza.c('reference', {
                        xmlns: Strophe.NS.REFERENCE,
                        begin: mention.start + legacy_body.length,
                        end: mention.end + legacy_body.length,
                        type: 'decoration',
                    })
                        .c('mention', mention_attrs).t(mention.target).up().up();
                }.bind(this));
            }

            if (message.get('markups')) {
                message.get('markups').forEach(function (markup) {
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
                }.bind(this));
            }

            if (message.get('blockquotes')) {
                message.get('blockquotes').forEach(function (blockquote) {
                    stanza.c('reference', {
                        xmlns: Strophe.NS.REFERENCE,
                        begin: blockquote.start + legacy_body.length,
                        end: blockquote.end + legacy_body.length,
                        type: 'decoration'
                    })
                        .c('quote', {xmlns: Strophe.NS.MARKUP}).up().up();
                }.bind(this));
            }

            if (message.get('type') == 'file_upload') {
                body = "";
                let files = message.get('files') || [],
                    images = message.get('images') || [],
                    all_files = files.concat(images);
                all_files.forEach(function (file, idx) {
                    legacy_body = file.sources[0] + ((idx != all_files.length - 1) ? '\n' : "");
                    let start_idx = body.length,
                        end_idx = (body + legacy_body).length;
                    stanza.c('reference', {
                        xmlns: Strophe.NS.REFERENCE,
                        type: 'mutable',
                        begin: start_idx,
                        end: end_idx
                    });
                    file.voice && stanza.c('voice-message', {xmlns: Strophe.NS.VOICE_MESSAGE});
                    stanza.c('file-sharing', {xmlns: Strophe.NS.OTB}).c('file');
                    file.type && stanza.c('media-type').t(file.type).up();
                    file.name && stanza.c('name').t(file.name).up();
                    file.size && stanza.c('size').t(file.size).up();
                    file.height && stanza.c('height').t(file.height).up();
                    file.width && stanza.c('width').t(file.width).up();
                    file.duration && stanza.c('duration').t(file.duration).up();
                    file.description && stanza.c('desc').t(file.description).up();
                    stanza.up().c('sources');
                    file.sources.forEach(function (u) {
                        stanza.c('uri').t(u).up()
                    }.bind(this));
                    stanza.up().up().up();
                    file.voice && stanza.up();
                    body += legacy_body;
                    mutable_content.push({start: start_idx, end: end_idx});
                }.bind(this));
                message.set({type: 'main'});
            }

            mutable_content.length && message.set({mutable_content: mutable_content});

            this.account._pending_messages.push({chat_hash_id: this.contact.hash_id, unique_id: unique_id});

            message.set('original_message', body);
            body && stanza.c('body').t(body).up();
            stanza.c('markable').attrs({'xmlns': Strophe.NS.CHAT_MARKERS}).up()
                .c('origin-id', {id: msg_id, xmlns: 'urn:xmpp:sid:0'}).up();
            if (message.get('state') === constants.MSG_ERROR) {
                stanza.c('retry', {xmlns: Strophe.NS.DELIVERY}).up();
                message.set('state', constants.MSG_PENDING);
            }

            if (message.get('encrypted')) {
                this.account.omemo.encrypt(this.contact, stanza).then((stanza) => {
                    let msg_sending_timestamp = moment.now();
                    this.account.sendMsg(stanza, function () {
                        if (!this.contact.get('group_chat') && !this.account.server_features.get(Strophe.NS.DELIVERY)) {
                            setTimeout(function () {
                                if ((this.account.last_stanza_timestamp > msg_sending_timestamp) && (message.get('state') === constants.MSG_PENDING)) {
                                    message.set('state', constants.MSG_SENT);
                                } else {
                                    this.account.connection.ping.ping(this.account.get('jid'), function () {
                                        (message.get('state') === constants.MSG_PENDING) && message.set('state', constants.MSG_SENT);
                                    }.bind(this));
                                    setTimeout(function () {
                                        if ((this.account.last_stanza_timestamp < msg_sending_timestamp) && (message.get('state') === constants.MSG_PENDING))
                                            message.set('state', constants.MSG_ERROR);
                                    }.bind(this), 5000);
                                }
                            }.bind(this), 1000);
                        }
                        else {
                            let _pending_time = 5, _interval = setInterval(function () {
                                if ((this.account.last_stanza_timestamp < msg_sending_timestamp) && (_pending_time > 60) && (message.get('state') === constants.MSG_PENDING) || (_pending_time > 60)) {
                                    message.set('state', constants.MSG_ERROR);
                                    clearInterval(_interval);
                                }
                                else if (message.get('state') !== constants.MSG_PENDING)
                                    clearInterval(_interval);
                                _pending_time += 10;
                            }.bind(this), 10000);
                        }
                    }.bind(this));
                });
                return;
            } else {

                let msg_sending_timestamp = moment.now();
                this.account.sendMsg(stanza, function () {
                    if (!this.contact.get('group_chat') && !this.account.server_features.get(Strophe.NS.DELIVERY)) {
                        setTimeout(function () {
                            if ((this.account.last_stanza_timestamp > msg_sending_timestamp) && (message.get('state') === constants.MSG_PENDING)) {
                                message.set('state', constants.MSG_SENT);
                            } else {
                                this.account.connection.ping.ping(this.account.get('jid'), function () {
                                    (message.get('state') === constants.MSG_PENDING) && message.set('state', constants.MSG_SENT);
                                }.bind(this));
                                setTimeout(function () {
                                    if ((this.account.last_stanza_timestamp < msg_sending_timestamp) && (message.get('state') === constants.MSG_PENDING))
                                        message.set('state', constants.MSG_ERROR);
                                }.bind(this), 5000);
                            }
                        }.bind(this), 1000);
                    }
                    else {
                        let _pending_time = 5, _interval = setInterval(function () {
                            if ((this.account.last_stanza_timestamp < msg_sending_timestamp) && (_pending_time > 60) && (message.get('state') === constants.MSG_PENDING) || (_pending_time > 60)) {
                                message.set('state', constants.MSG_ERROR);
                                clearInterval(_interval);
                            }
                            else if (message.get('state') !== constants.MSG_PENDING)
                                clearInterval(_interval);
                            _pending_time += 10;
                        }.bind(this), 10000);
                    }
                }.bind(this));
            }
        },

        isImageType: function(type) {
            if (type.indexOf('image') != -1)
                return true;
            else
                return false;
        },

        initJingleMessage: function (media_type) {
            xabber.current_voip_call && xabber.current_voip_call.destroy();
            media_type = media_type || {};
            media_type = media_type.video ? 'video' : 'audio';
            let session_id = uuid();
            xabber.current_voip_call = new xabber.JingleMessage({session_id: session_id, video_live: media_type === 'video'}, {contact: this.contact});
            xabber.current_voip_call.startCall();
            xabber.current_voip_call.modal_view.show({status: constants.JINGLE_MSG_PROPOSE});
        },

        saveForwardedMessage: function (msg) {
            var forwarded_message = null;
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
                encrypted: this.model.get('encrypted'),
                submitted_here: true,
                forwarded_message: null
            };
            if (!fwd_messages.length && text.removeEmoji() === "")
                attrs.only_emoji = Array.from(text).length;
            if (fwd_messages.length) {
                var new_fwd_messages = [];
                _.each(fwd_messages, function (msg) {
                    if (this.account.forwarded_messages.indexOf(msg) < 0) {
                        msg = this.saveForwardedMessage(msg);
                    }
                    new_fwd_messages.push(msg);
                }.bind(this));
                attrs.forwarded_message = new_fwd_messages;
                var message = this.model.messages.create(attrs);
                this.sendMessage(message);
            } else if (text) {
                var message = this.model.messages.create(attrs);
                this.sendMessage(message);
            }
            if ((this.contact.get('archived'))&&(!this.contact.get('muted'))) {
                message.set('muted', false);
                this.head.archiveChat();
                this.contact.set('archived', false);
                xabber.chats_view.updateScreenAllChats();
            }
            if (this.contact.get('group_chat') && xabber.toolbar_view.$('.active').hasClass('chats'))
                if (!this.contact.get('muted') && !this.contact.get('archived'))
                    xabber.chats_view.updateScreenAllChats();
            xabber.chats_view.scrollToTop();
            xabber.chats_view.clearSearch();
        },

        addFileMessage: function (files) {
            let new_files = [], file_counter = 0;
            if (this.contact.messages_view)
                if (this.contact.messages_view.data.get('visible'))
                    this.contact.messages_view.openChat();
            if (files.length > 10) {
                utils.dialogs.error('You can`t upload more than 10 files');
                return;
            }
            var http_upload_service = this.account.server_features.get(Strophe.NS.HTTP_UPLOAD);
            if (!http_upload_service) {
                utils.dialogs.error(this.account.domain + ' server does not seem to support file transfer. This may happen because Xabber didn\'t yet receive server capabilities, or because of some glitch.\n\nRefresh server info in Account settings&nbsp;&rarr;&nbsp;Server info. If that does not help, consider using a server that definitely does support file transfer. One such server is xabber.org');
                return;
            }
            var deferred_all = new $.Deferred();
            deferred_all.done(function (data) {
                this.model.messages.create({
                    from_jid: this.account.get('jid'),
                    type: 'file_upload',
                    files: data,
                    upload_service: http_upload_service.get('from'),
                    message: 'Uploading file',
                    submitted_here: true
                });
            }.bind(this));
            $(files).each(function(idx, file) {
                if (this.isImageType(file.type)) {
                    var reader = new FileReader(), deferred = new $.Deferred();
                    Images.compressImage(file).done(function (image) {
                        reader.readAsDataURL(image);
                        deferred.done(function (data) {
                            if (data) {
                                image.height = data.height;
                                image.width = data.width;
                            }
                            new_files.push(image);
                            file_counter++;
                            if (file_counter === files.length)
                                deferred_all.resolve(new_files);
                        }.bind(this));
                    }.bind(this));
                    reader.onload = function (e) {
                        if (file.type === 'image/svg+xml') {
                            deferred.resolve();
                        } else {
                            var image_prev = new Image();
                            image_prev.onload = function () {
                                var height = this.height,
                                    width = this.width;
                                deferred.resolve({height: height, width: width});
                            };
                            image_prev.src = e.target.result;
                        }
                    };
                }
                else {
                    new_files.push(file);
                    file_counter++;
                    if (file_counter === files.length)
                        deferred_all.resolve(new_files);
                }
            }.bind(this));
        },

        startUploadFile: function (message, $message) {
            $message.emojify('.chat-msg-author-badge', {emoji_size: 16});
            $message.find('.cancel-upload').show();
            $message.find('.repeat-upload').hide();
            $message.find('.status').hide();
            $message.find('.progress').show();
            var files_count = 0;
            $(message.get('files')).each(function(idx, file) {
                var iq = $iq({type: 'get', to: message.get('upload_service')})
                        .c('request', {xmlns: Strophe.NS.HTTP_UPLOAD})
                        .c('filename').t(file.name).up()
                        .c('size').t(file.size).up()
                        .c('content-type').t(file.type).up(),
                    deferred = new $.Deferred(), self = this;
                this.account.sendIQ(iq,
                    function (result) {
                        var $slot = $(result).find('slot[xmlns="' + Strophe.NS.HTTP_UPLOAD + '"]');
                        deferred.resolve({
                            get_url: $slot.find('get').text(),
                            put_url: $slot.find('put').text()
                        });
                    },
                    function (err) {
                        var error_text = $(err).find('error text').text();
                        self.onFileNotUploaded(message, $message, error_text);
                    }
                );
                let msg_sending_timestamp = moment.now(), _pending_time = 10, _interval = setInterval(function() {
                    if ((this.account.last_stanza_timestamp < msg_sending_timestamp) && (_pending_time > 60) && (message.get('state') === constants.MSG_PENDING) || (_pending_time > 60)) {
                        message.set('state', constants.MSG_ERROR);
                        clearInterval(_interval);
                    }
                    else if (message.get('state') !== constants.MSG_PENDING)
                        clearInterval(_interval);
                    _pending_time += 10;
                }.bind(this), 10000);
                deferred.done(function (data) {
                    clearInterval(_interval);
                    var xhr = new XMLHttpRequest(),
                        $bar = $message.find('.progress');
                    $message.find('.cancel-upload').click(function (ev) {
                        xhr.abort();
                    }.bind(this));
                    xhr.onabort = function (event) {
                        this.removeMessage($message);
                    }.bind(this);
                    xhr.upload.onprogress = function (event) {
                        var percentage = event.loaded / event.total;
                        $bar.find('.determinate').attr('style', 'width: ' + (100 * percentage) + '%');
                        $message.find('.filesize')
                            .text(utils.pretty_size(event.loaded) + ' of ' +
                                utils.pretty_size(event.total));
                    };
                    xhr.onload = xhr.onerror = function () {
                        if (this.status === 201) {
                            message.get('files')[idx].url = data.get_url;
                            files_count++;
                            if (files_count == message.get('files').length) {
                                self.onFileUploaded(message, $message);
                            }
                        } else {
                            self.onFileNotUploaded(message, $message, this.responseText);
                        }
                    };
                    if ($message.data('cancel')) {
                        xhr.abort();
                    } else {
                        xhr.open("PUT", data.put_url, true);
                        xhr.send(file);
                    }
                }.bind(this));
            }.bind(this));
        },

        onFileUploaded: function (message, $message) {
            var files = message.get('files'),
                self = this, is_audio = false,
                images = [], files_ = [], body_message = "";
            $(files).each(function(idx, file_) {
                var file_new_format = {
                    name: file_.name,
                    type: file_.type,
                    size: file_.size,
                    sources: [file_.url]
                };
                file_.voice && (file_new_format.voice = true);
                body_message += file_new_format.sources[0] + "\n";
                if (this.isImageType(file_.type)) {
                    _.extend(file_new_format, { width: file_.width, height: file_.height });
                    images.push(file_new_format);
                }
                else {
                    _.extend(file_new_format, { duration: file_.duration});
                    files_.push(file_new_format);
                }
            }.bind(this));
            message.set('message', body_message.trim());
            $message.find('.chat-msg-content').addClass('chat-msg-media-content').html();
            //  loaded and send image
            if (images.length > 0) {
                if (images.length > 1) {
                    if (images.length > 6) {
                        var tpl_name = 'template-for-6',
                            hidden_images = images.length - 5;
                        template_for_images = $(templates.messages[tpl_name]({images}));
                        template_for_images.find('.last-image').addClass('hidden-images');
                        template_for_images.find('.image-counter').text('+' + hidden_images);
                    }
                    else {
                        var tpl_name = 'template-for-' + images.length,
                            template_for_images = $(templates.messages[tpl_name]({images}));
                    }
                    $message.removeClass('file-upload noselect');
                    $message.find('.chat-msg-content').removeClass('chat-file-content').html(template_for_images);
                }
                else {
                    var img = this.createImage(images[0]),
                        img_content = self.createImageContainer(images[0]);
                    img.onload = function () {
                        this.imageOnload($message);
                    }.bind(this);
                    $message.removeClass('file-upload noselect');
                    $message.find('.chat-msg-content').removeClass('chat-file-content').html(img_content);
                    $message.find('.img-content').html(img);
                }
            }
            if (files_.length > 0) {
                $message.removeClass('file-upload noselect');
                $(files_).each(function (idx, item) {
                    if (!idx && !images.length)
                        $message.find('.chat-msg-content').removeClass('chat-file-content').html('');
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
                    ((files_.length === 1) && is_audio) && (file_attrs.name = 'Voice message');
                    _.extend(file_attrs, {size: utils.pretty_size(item.size), is_audio: is_audio, duration: utils.pretty_duration(item.duration), mdi_icon: mdi_icon_class});
                    template_for_file_content = is_audio ? $(templates.messages.audio_file(file_attrs)) : $(templates.messages.file(file_attrs));
                    $message.find('.chat-msg-content').append(template_for_file_content);
                }.bind(this));
            }
            this.initPopup($message);
            message.set('images', images);
            message.set('files', files_);
            this.sendMessage(message);
            this.scrollToBottom();
        },

        createAudio: function(file_url, unique_id) {
            var audio = WaveSurfer.create({
                container: "#" + unique_id,
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
            var imgContent = new Image();
                maxHeight = 400,
                maxWidth = (xabber.main_panel.$el.width() * 0.715 - 176) * 0.7;
            if (image.height)
                imgContent.height = image.height;
            if (image.width)
                imgContent.width = image.width;
            imgContent.src = image.sources[0];
            $(imgContent).addClass('uploaded-img popup-img');
            $(imgContent).attr('data-mfp-src', image.sources[0]);
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

        createImageContainer: function(image) {
            return $('<div class="img-content"/>')[0];
        },

        onFileNotUploaded: function (message, $message, error_text) {
            var error_message = error_text ? 'Error: '+error_text : 'File uploading error';
            message.set('state', constants.MSG_ERROR);
            $message.find('.cancel-upload').hide();
            $message.find('.repeat-upload').show();
            $message.find('.status').text(error_message).show();
            $message.find('.progress').hide();
            $message.find('.repeat-upload').click(function () {
                this.startUploadFile(message, $message);
            }.bind(this));
        },

        sendChatState: function (state, type) {
            clearTimeout(this._chatstate_timeout);
            clearTimeout(this._chatstate_send_timeout);
            this.chat_state = false;
            let stanza = $msg({to: this.model.get('jid'), type: 'chat'}).c(state, {xmlns: Strophe.NS.CHATSTATES});
            type && stanza.c('subtype', {xmlns: Strophe.NS.EXTENDED_CHATSTATES, type: type});
            (state === 'composing') && (this.chat_state = true);
            this.account.sendMsg(stanza);
            if (state === 'composing') {
                this._chatstate_timeout = setTimeout(function () {
                    this.chat_state = false;
                }.bind(this), constants.CHATSTATE_TIMEOUT_PAUSED);
                this._chatstate_send_timeout = setTimeout(function () {
                    !this.chat_state && this.sendChatState('paused');
                }.bind(this), constants.CHATSTATE_TIMEOUT_PAUSED*2);
            }
        },

        onChangedMessageState: function (message) {
            if (message.get('state') === constants.MSG_DISPLAYED && this.model.get('last_displayed_id') < message.get('stanza_id')) {
                this.model.set('last_displayed_id', message.get('stanza_id'));
                this.model.set('last_delivered_id', message.get('stanza_id'));
            } else if (message.get('state') === constants.MSG_DELIVERED && this.model.get('last_delivered_id') < message.get('stanza_id')) {
                this.model.set('last_delivered_id', message.get('stanza_id'));
            }
            var $message = this.$('.chat-message[data-uniqueid="' + message.get('unique_id') + '"]'),
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
            if (message === this.model.last_message) {
                this.chat_item.updateLastMessage();
            }
        },

        onChangedMessageTimestamp: function (message) {
            var $message = this.$('.chat-message[data-uniqueid="' + message.get('unique_id') + '"]'),
                $next_msg = $message.next(),
                $old_prev_msg = $message.prev();
            $message.attr({
                'data-time': message.get('timestamp')
            });
            $message.detach();
            $message.children('.right-side').find('.msg-time').attr({title: utils.pretty_datetime(message.get('time'))}).text(utils.pretty_time(message.get('time')));
            message.get('user_info') && $message.attr('data-from-id', message.get('user_info').id);
            this.model.messages.sort();
            var index = this.model.messages.indexOf(message);
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
                if (message.get('data_form') || message.get('forwarded_message') || !is_same_date || !is_same_sender || $prev_msg.hasClass('system'))
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
            var is_unread = message.get('is_unread');
            if (is_unread) {
                this.model.messages_unread.add(message);
                this.model.recountUnread();
            } else {
                this.model.messages_unread.remove(message);
                this.model.recountUnread();
                if (!message.get('muted')) {
                    xabber.recountAllMessageCounter();
                }
            }
        },

        onTouchMessage: function (ev) {
            if (ev.which === 3) {
                return;
            }
            var $elem = $(ev.target), $msg, msg,
                $fwd_message = $elem.parents('.fwd-message').first(),
                is_forwarded = $fwd_message.length > 0;

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
                images = msg.get('images'),
                fwd_messages = [],
                files_links = '';
            if (msg.get('forwarded_message')) {
                msg.get('forwarded_message').forEach(function (message) {
                    message.get('images') && fwd_messages.push(message.get('images'));
                }.bind(this));
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
            $(fwd_messages).each(function (idx, message) {
                $(message).each(function (i, file) {
                    if (files_links != "")
                        files_links += '\n';
                    files_links += file.sources[0];
                });
            });
            utils.copyTextToClipboard(files_links, 'Link copied to clipboard', 'ERROR: Link not copied to clipboard');
        },

        showParticipantProperties: function (participant_id) {
            let participant = this.contact.participants.get(participant_id);
            if (!participant)
                return;
            (this.contact.my_info && this.contact.my_info.get('id') === participant_id) && (participant_id = '');
            this.contact.participants.participant_properties_panel = new xabber.ParticipantPropertiesView({model: this.contact.details_view.participants});
            this.contact.membersRequest({id: participant_id}, function (response) {
                let data_form = this.account.parseDataForm($(response).find('x[xmlns="' + Strophe.NS.DATAFORM + '"]'));
                this.contact.participants.participant_properties_panel.open(participant, data_form);
            }.bind(this));
        },

        onClickMessage: function (ev) {
            let $elem = $(ev.target);
            if ($elem.hasClass('file-link-download')) {
                ev.preventDefault();
                xabber.openWindow($elem.attr('href'));
            }
            if ($elem.hasClass('msg-delivering-state')) {
                return;
            }
            if (!$elem.hasClass('mdi-link-variant') && !$elem.hasClass('btn-retry-send-message') && !$elem.hasClass('file-link-download') && !$elem.is('canvas') && !$elem.hasClass('voice-message-volume')) {
                var $msg = $elem.closest('.chat-message'), msg,
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
                    this.updateMessageInChat(msg);
                    this.initPopup(msg);
                    expanded_fwd_message.open(msg);
                    return;
                }

                if ($elem.hasClass('chat-msg-author') || $elem.hasClass('fwd-msg-author')) {
                    let from_jid = is_forwarded ? $fwd_message.data('from') : $msg.data('from'),
                        from_id = is_forwarded ? $fwd_message.data('fromId') : $msg.data('fromId');
                    if (this.contact.get('group_chat')) {
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
                        this.contact.showDetails('all-chats');
                    } else {
                        var contact = this.account.contacts.mergeContact(from_jid);
                        contact.showDetails();
                    }
                    return;
                }

                if ($elem.hasClass('circle-avatar')) {
                    let from_jid = is_forwarded ? $fwd_message.data('from') : $msg.data('from');
                    if (this.contact.get('group_chat')) {
                        let member_id = (is_forwarded) ? $fwd_message.attr('data-from-id') : $msg.attr('data-from-id');
                        member_id && this.showParticipantProperties(member_id);
                        return;
                    }
                    else if (from_jid === this.account.get('jid')) {
                        this.account.showSettings();
                    } else if (from_jid === this.model.get('jid')) {
                        this.contact.showDetails('all-chats');
                    } else {
                        let contact = this.account.contacts.mergeContact(from_jid);
                        contact.showDetails();
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
                            this.contact.showDetails('all-chats');
                        } else {
                            let contact = this.account.contacts.mergeContact(member_id);
                            contact.showDetails();
                        }
                    }
                    return;
                }

                if ($elem.hasClass('voice-message-play') || $elem.hasClass('no-uploaded')) {
                    let $audio_elem = $elem.closest('.link-file'),
                        f_url = $audio_elem.find('.file-link-download').attr('href');
                    $audio_elem.find('.mdi-play').removeClass('no-uploaded');
                    $audio_elem[0].voice_message = this.renderVoiceMessage($audio_elem.find('.file-container')[0], f_url);
                    this.prev_audio_message && this.prev_audio_message.voice_message.pause();
                    this.prev_audio_message = $audio_elem[0];
                    return;
                }

                if ($elem.hasClass('mdi-play')) {
                    let $audio_elem = $elem.closest('.link-file');
                    this.prev_audio_message.voice_message.pause();
                    this.prev_audio_message = $audio_elem[0];
                    $audio_elem[0].voice_message.play();
                    return;
                }

                if ($elem.hasClass('mdi-pause')) {
                    this.prev_audio_message.voice_message.pause();
                    return;
                }

                if ($elem.hasClass('msg-hyperlink')) {
                    ev && ev.preventDefault();
                    let link = $elem.attr('href');
                    utils.dialogs.ask("", ("Open this link?\n\n<b class='link'>" + decodeURI(link) + "</b>"), null, {ok_button_text: "open"}).done(function (result) {
                        if (result) {
                            utils.openWindow(link);
                        }
                    });
                    return;
                }

                if ($elem.hasClass('uploaded-img')||$elem.hasClass('img-content')||($elem.hasClass('uploaded-img-for-collage'))) {
                    $elem.hasClass('img-content') && $elem.children('img').click();
                    return;
                }

                if ($elem.hasClass('last-image')) {
                    $elem.find('img')[0].click();
                    return;
                }

                if ($elem.hasClass('image-counter')) {
                    $elem.closest('.last-image').find('img')[0].click();
                    return;
                }

                if ($msg.hasClass('searched-message')) {
                    this.model.getMessageContext($msg.data('uniqueid'), {seached_messages: true});
                    return;
                }

                let processClick = function () {
                    if (!no_select_message) {
                        $msg.switchClass('selected', !$msg.hasClass('selected'));
                        this.bottom.manageSelectedMessages();
                    }
                }.bind(this);

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

                var type = msg.get('type');
                if (type === 'file_upload') {
                    return;
                }

                if (type === 'system') {
                    return;
                } else if (is_forwarded) {
                    var fwd_message = this.account.forwarded_messages.get($fwd_message.data('uniqueid'));
                    if (!fwd_message) {
                        return;
                    }
                    processClick();
                } else {
                    processClick();
                }
            }
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
        }
    });

    xabber.ExpandedMessagePanel = xabber.BasicView.extend({
        className: 'modal expanded-message',
        template: templates.group_chats.pinned_message_panel,
        ps_selector: '.modal-content',
        ps_settings: {theme: 'item-list'},

        events: {
            "click .collapsed-forwarded-message": "expandFwdMessage",
            "click .chat-message": "onClickPinnedMessage"
        },

        _initialize: function (options) {
            this.account = options.account;
            this.chat_content = options.chat_content;
        },

        open: function ($message) {
            this.$el.css('width', $message.find('.chat-text-content').text().length <= 60 ? 540 : xabber.main_panel.$el.width() * 0.715);
            this.$el.openModal({
                ready: function () {
                    this.updateScrollBar();
                    this.$('.modal-content').css('height', this.$el.height() - 12);
                }.bind(this),
                complete: function () {
                    this.$el.detach();
                    this.data.set('visible', false);
                }.bind(this)
            });
            $message.find('.right-side .msg-delivering-state').remove();
            this.$('.modal-content').html($message);
            this.$('.msg-copy-link').remove();
        },

        close: function () {
            this.$el.closeModal({ complete: this.hide.bind(this) });
        },

        onClickPinnedMessage: function (ev) {
            let $elem = $(ev.target);
            if ($elem.hasClass('msg-hyperlink')) {
                ev && ev.preventDefault();
                let link = $elem.attr('href');
                utils.dialogs.ask("", ("Open this link?\n\n<b>" + link + "</b>"), null, {ok_button_text: "open"}).done(function (result) {
                    if (result) {
                        utils.openWindow(link);
                    }
                });
                return;
            }
        },

        expandFwdMessage: function (ev) {
            var $target = $(ev.target),
                unique_id = $target.data('uniqueid'),
                msg = this.chat_content.buildMessageHtml(this.account.forwarded_messages.get(unique_id)),
                expanded_fwd_message = new xabber.ExpandedMessagePanel({account: this.account, chat_content: this.chat_content});
            expanded_fwd_message.$el.attr('data-color', this.account.settings.get('color'));
            this.chat_content.updateMessageInChat(msg);
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
                    let node = super.create(),
                        data = JSON.parse(paramValue),
                        target = data.jid ? ('?jid=' + data.jid) : (data.id ?  ('?id=' + data.id) : "");
                    node.innerHTML = data.nickname;
                    data.is_me && node.classList.add('ground-color-100');
                    node.setAttribute('data-target', target);
                    return node;
                }

                static value(node) {
                    return node.innerHTML;
                }
            }
            Mention.blotName = 'mention';
            Mention.tagName = 'mention';
            Mention.prototype.optimize = function () {};

            class QuillEmoji extends Image {
                static create(value) {
                    if (typeof value == 'string') {
                        var emoji = $(value.emojify({tag_name: 'img'}))[0];
                        emoji.style.display = 'none';
                        emoji.onload = function () {
                            this.style.display = 'unset';
                        };
                        return emoji;
                    } else {
                        return value;
                    }
                }

                static value(domNode) {
                    return domNode;
                }
            }
            QuillEmoji.blotName = 'emoji';
            QuillEmoji.className = 'emoji';
            QuillEmoji.tagName = 'img';
            QuillEmoji.prototype.optimize = function () {};

            Quill.register(QuillEmoji);
            Quill.register(Mention);
        }
    });

    xabber.OpenedChats = xabber.ChatsBase.extend({
        comparator: function (item1, item2) {
            var t1 = item1.get('timestamp'),
                t2 = item2.get('timestamp');
            return t1 > t2 ? -1 : (t1 < t2 ? 1 : 0);
        },

        initialize: function (models, options) {
            this.on("change:timestamp", this.sort, this);
        },

        update: function (chat, event) {
            var contains = chat.get('opened');
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
            var contains = !chat.get('opened');
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
            this.account.contacts.on("add_to_roster", this.getChat, this);
            this.account.contacts.on("open_chat", this.openChat, this);
            this.account.contacts.on("open_mention", this.openMention, this);
            this.account.contacts.on("presence", this.onPresence, this);
            this.account.contacts.on("roster_push", this.onRosterPush, this);
        },

        getChat: function (contact) {
            var chat = this.get(contact.hash_id);
            if (!chat) {
                chat = xabber.chats.create(null, {contact: contact});
                this.add(chat);
                contact.set('known', true);
            }
            return chat;
        },

        openChat: function (contact, options) {
            options = options || {};
            _.isUndefined(options.clear_search) && (options.clear_search = true);
            var chat = this.getChat(contact);
            chat.trigger('open', {clear_search: options.clear_search});
        },

        openMention: function (contact, unique_id) {
            var chat = this.getChat(contact);
            xabber.body.setScreen('mentions', {right: 'mentions', chat_item: chat.item_view});
            unique_id && chat.getMessageContext(unique_id, {mention: true});
        },

        registerMessageHandler: function () {
            this.account.connection.deleteHandler(this._msg_handler);
            this._msg_handler = this.account.connection.addHandler(function (message) {
                this.receiveMessage(message);
                return true;
            }.bind(this), null, 'message');
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
                var deferred = this.deferred_mam_requests.shift();
                if (!deferred) break;
                this.mam_requests++;
                deferred.resolve();
            }
        },

        parsePubSubNode: function (node) {
            if (!node)
                return null;
            var is_member_id = node.indexOf('#');
            if (is_member_id !== -1)
                return node.slice(is_member_id + 1, node.length);
            else
                return null;
        },

        receivePubsubMessage: function ($message) {
            var photo_id =  $message.find('info').attr('id'),
                from_jid = Strophe.getBareJidFromJid($message.attr('from')),
                node = $message.find('items').attr('node');
            if (node.indexOf(Strophe.NS.OMEMO) > -1)
                return;
            if (node.indexOf(Strophe.NS.PUBSUB_AVATAR_METADATA) > -1) {
                let member_id = this.parsePubSubNode(node),
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
                            contact.getAvatar(photo_id, member_node, function (new_avatar) {
                                this.account.chat_settings.updateCachedAvatars(member_id, photo_id, new_avatar);
                                if (contact.my_info) {
                                    if (member_id == contact.my_info.id) {
                                        contact.my_info.set({avatar: photo_id, b64_avatar: new_avatar});
                                        contact.trigger('update_my_info');
                                    }
                                }
                                let participant = contact.participants && contact.participants.get(member_id);
                                if (participant) {
                                    participant.set({avatar: photo_id, b64_avatar: new_avatar});
                                    this.account.groupchat_settings.updateParticipant(contact.get('jid'), participant.attributes);
                                }
                            }.bind(this));
                        }
                    }
                    else if (!this.get('avatar_priority') || this.get('avatar_priority') <= constants.AVATAR_PRIORITIES.PUBSUB_AVATAR) {
                        if (!photo_id) {
                            let image = Images.getDefaultAvatar(contact.get('name'));
                            contact.cached_image = Images.getCachedImage(image);
                            xabber.cached_contacts_info.putContactInfo({
                                jid: contact.get('jid'),
                                hash: "",
                                avatar: image,
                                name: contact.get('name'),
                                avatar_priority: constants.AVATAR_PRIORITIES.PUBSUB_AVATAR
                            });
                            contact.set('avatar_priority', constants.AVATAR_PRIORITIES.PUBSUB_AVATAR);
                            contact.set('photo_hash', null);
                            contact.set('image', image);
                            return;
                        }
                        if ((photo_id !== "") && (contact.get('photo_hash') === photo_id))
                            return;
                        contact.getAvatar(photo_id, Strophe.NS.PUBSUB_AVATAR_DATA, function (data_avatar) {
                            contact.cached_image = Images.getCachedImage(data_avatar);
                            xabber.cached_contacts_info.putContactInfo({
                                jid: contact.get('jid'),
                                hash: photo_id,
                                avatar: data_avatar,
                                name: contact.get('name'),
                                avatar_priority: constants.AVATAR_PRIORITIES.PUBSUB_AVATAR
                            });
                            contact.set('avatar_priority', constants.AVATAR_PRIORITIES.PUBSUB_AVATAR);
                            contact.set('photo_hash', photo_id);
                            contact.set('image', data_avatar);
                        }.bind(this));
                    }
                }
                else if (from_jid === this.account.get('jid')) {
                    if (!photo_id) {
                        let image = Images.getDefaultAvatar(this.account.get('name'));
                        this.account.cached_image = Images.getCachedImage(image);
                        let avatar_attrs = {avatar_priority: constants.AVATAR_PRIORITIES.PUBSUB_AVATAR, image: image};
                        this.account.set(avatar_attrs);
                        this.account.save(avatar_attrs);
                        return;
                    }
                    this.account.getAvatar(photo_id, function (data_avatar) {
                        this.account.cached_image = Images.getCachedImage(data_avatar);
                        let avatar_attrs = {
                            avatar_priority: constants.AVATAR_PRIORITIES.PUBSUB_AVATAR,
                            image: data_avatar
                        };
                        this.account.set(avatar_attrs);
                        this.account.save(avatar_attrs);
                    }.bind(this));
                }
            }
        },

        receiveMessage: function (message) {
            let $message = $(message),
                type = $message.attr('type');
            if (this.account.connection.do_synchronization && Strophe.getBareJidFromJid($(message).attr('from')) !== this.account.get('jid')) {
                let time = $message.children('time').attr('stamp') || $message.children('delay').attr('stamp'),
                    timestamp = Number(moment(time));
                (timestamp > this.account.last_msg_timestamp) && (this.account.last_msg_timestamp = timestamp);
            }
            if (type === 'headline') {
                return this.receiveHeadlineMessage(message);
            }
            if (type === 'chat' || (type === 'normal')) {
                return this.receiveChatMessage(message);
            }
            if (type === 'error') {
                return this.receiveErrorMessage(message);
            }
        },

        receiveHeadlineMessage: function (message) {
            var $message = $(message),
                msg_from = Strophe.getBareJidFromJid($message.attr('from')),
                $stanza_received = $message.find('received[xmlns="' + Strophe.NS.DELIVERY + '"]'),
                $echo_msg = $message.children('x[xmlns="' + Strophe.NS.GROUP_CHAT + '#system-message"][type="echo"]').children('message');
            if ($stanza_received.length) {
                let stanza_id = $stanza_received.children('stanza-id').attr('id'),
                    origin_msg_id = $stanza_received.children('origin-id').first().attr('id');
                if (origin_msg_id) {
                    let msg = this.account.messages.get(origin_msg_id || stanza_id),
                        delivered_time = $stanza_received.children('time').attr('stamp') || moment(stanza_id/1000).format();
                    if (!msg)
                        return;
                    msg.set({'state': constants.MSG_SENT, 'time': delivered_time, 'timestamp': Number(moment(delivered_time))}); // delivery receipt, changing on server time
                    let pending_message = this.account._pending_messages.find(msg => msg.unique_id == (origin_msg_id || stanza_id));
                    if (pending_message) {
                        this.account.chats.get(pending_message.chat_hash_id).setStanzaId(pending_message.unique_id, stanza_id);
                        this.account._pending_messages.splice(this.account._pending_messages.indexOf(pending_message), 1);
                    }
                }
                return;
            }

            if ($echo_msg.length) {
                return this.receiveChatMessage($echo_msg[0], {echo_msg: true, stanza_id: $echo_msg.children('stanza-id').attr('id')});
            }

            let $token_revoke = $message.children('revoke[xmlns="' + Strophe.NS.AUTH_TOKENS + '"]');
            if ($token_revoke.length) {
                $token_revoke.children('token-uid').each(function (idx, token) {
                    let $token = $(token),
                        token_uid = $token.text();
                    if (!token_uid)
                        return;
                    if (this.account.x_tokens_list) {
                        let token = this.account.x_tokens_list.find(token => token.token_uid == token_uid),
                            token_idx = token ? this.account.x_tokens_list.indexOf(token) : -1;
                        (token_idx > -1) && this.account.x_tokens_list.splice(token_idx, 1);
                    }
                }.bind(this));
                this.account.settings_right.updateXTokens();
                return;
            }

            if ($message.find('event[xmlns="' + Strophe.NS.PUBSUB + '#event"]').length) {
                this.receivePubsubMessage($message);
                return;
            }

            let contact = this.account.contacts.get(msg_from), chat;
            contact && (chat = this.account.chats.getChat(contact));

            if ($message.children('attention[xmlns="' + Strophe.NS.ATTENTION + '"]').length && xabber.settings.call_attention) {
                // return this.attention();
                if (!chat)
                    return;
                return chat.messages.createSystemMessage({from_jid: msg_from, message: 'Attention was requested', attention: true});
            }

            if ($message.children('x[xmlns="' + Strophe.NS.GROUP_CHAT + '#system-message"]').length) {
                if (!contact)
                    return;
                let participant_version = $message.children('x[xmlns="' + Strophe.NS.GROUP_CHAT + '#user-updated"]').attr('version');
                if (participant_version && contact.participants && contact.participants.version < participant_version)
                    contact.trigger('update_participants');
            }
            if ($message.find('replace[xmlns="'+ Strophe.NS.REWRITE +'#notify"]').length) {
                !contact && (contact = this.account.contacts.get($message.find('replace').attr('conversation'))) && (chat = this.account.chats.getChat(contact));
                if (!chat)
                    return;
                let stanza_id = $message.find('replace').attr('id'),
                    msg_item = chat.messages.find(msg => msg.get('stanza_id') == stanza_id || msg.get('contact_stanza_id') == stanza_id),
                    active_right_screen = xabber.body.screen.get('right'),
                    participant_messages = active_right_screen === 'participant_messages' && this.account.participant_messages || active_right_screen === 'message_context' && this.account.context_messages || active_right_screen === 'searched_messages' && this.account.searched_messages || [],
                    participant_msg_item = participant_messages.find(msg => msg.get('stanza_id') == stanza_id);
                this.receiveChatMessage($message, {replaced: true});
                if (participant_msg_item) {
                    participant_msg_item.set('last_replace_time', $message.find('replaced').attr('stamp'));
                }
                if (msg_item) {
                    msg_item.set('last_replace_time', $message.find('replaced').attr('stamp'));
                    if (contact.get('pinned_message'))
                        if (contact.get('pinned_message').get('unique_id') === msg_item.get('unique_id')) {
                            contact.get('pinned_message').set('message', new_text);
                            chat.item_view.content.updatePinnedMessage();
                        }
                    chat && chat.item_view.updateLastMessage(chat.last_message);
                }
            }
            if ($message.find('retract-message').length) {
                !contact && (contact = this.account.contacts.get($message.find('retract-message').attr('conversation'))) && (chat = this.account.chats.getChat(contact));
                if (!chat)
                    return;
                let $retracted_msg = $message.find('retract-message'),
                    retracted_msg_id = $retracted_msg.attr('id'),
                    msg_item = chat.messages.find(msg => msg.get('stanza_id') == retracted_msg_id || msg.get('contact_stanza_id') == retracted_msg_id);
                if (msg_item) {
                    msg_item.set('is_unread', false);
                    chat.item_view.content.removeMessage(msg_item);
                    chat.item_view.updateLastMessage(chat.last_message);
                }
                if ($retracted_msg.attr('version') > chat.message_retraction_version)
                    chat.message_retraction_version = $retracted_msg.attr('version');
            }
            if ($message.find('retract-user').length) {
                var $retracted_user_msgs = $message.find('retract-user'),
                    retracted_user_id = $retracted_user_msgs.attr('id'),
                    msg_item = chat.messages.filter(msg => msg.get('user_info') && (msg.get('user_info').id == retracted_user_id));
                if (msg_item)
                    $(msg_item).each(function (idx, item) {
                        item.set('is_unread', false);
                        chat.item_view.content.removeMessage(item);
                    }.bind(this));
                chat.item_view.updateLastMessage(chat.last_message);
            }
            if ($message.find('retract-all').length) {
                !contact && (contact = this.account.contacts.get($message.find('retract-all').attr('conversation'))) && (chat = this.account.chats.getChat(contact));
                if (!chat)
                    return;
                var all_messages = chat.messages.models;
                $(all_messages).each(function (idx, item) {
                    chat.item_view.content.removeMessage(item);
                }.bind(this));
                chat.item_view.updateLastMessage();
            }
            if ($message.find('confirm[xmlns="' + Strophe.NS.HTTP_AUTH + '"]').length) {
                let code =  $message.find('confirm').attr('id');
                if (($message.attr('from') == this.account.xabber_auth.api_jid) && ($message.attr('id') == this.account.xabber_auth.request_id)) {
                    this.account.verifyXabberAccount(code, function (data) {
                        if (this.account.get('auto_login_xa')) {
                            xabber.api_account.save('token', data);
                            xabber.api_account.login_by_token();
                        }
                    }.bind(this));
                }
                else {
                    return this.receiveChatMessage(message);
                }
            }
            return;
        },

        receiveStanzaId: function ($message, options) {
            options.replaced && ($message = $message.children('replace').children('message'));
            let $stanza_id, $contact_stanza_id, attrs = {},
                from_bare_jid = options.from_bare_jid;
                $message.children('stanza-id').each(function (idx, stanza_id) {
                stanza_id = $(stanza_id);
                if ($message.children('x[xmlns="' + Strophe.NS.GROUP_CHAT + '"]').length) {
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
            }.bind(this));
            $stanza_id && (attrs.stanza_id = $stanza_id.attr('id'));
            $contact_stanza_id && (attrs.contact_stanza_id = $contact_stanza_id.attr('id'));
            return attrs;
        },

        receiveChatMessage: function (message, options) {
            options = options || {};
            var $message = $(message),
                $forwarded = $message.find('forwarded'),
                $delay = options.delay,
                to_jid = $message.attr('to'),
                to_bare_jid = Strophe.getBareJidFromJid(to_jid),
                to_resource = to_jid && Strophe.getResourceFromJid(to_jid),
                from_jid = $message.attr('from') || options.from_jid;

            if ($message.find('invite').length) {
                if (options.forwarded)
                    return;
            }

            if (!from_jid) {
                xabber.warn('Message without "from" attribute');
                xabber.warn(message);
                return;
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
                var $mam = $message.find('result[xmlns="'+Strophe.NS.MAM+'"]');
                if ($mam.length) {
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
                let $carbons = $message.find('[xmlns="'+Strophe.NS.CARBONS+'"]');
                if ($carbons.length) {
                    if ($message.find('invite').length) {
                        if ($carbons[0].tagName === 'sent')
                            return;
                    }
                    $forwarded = $carbons.children('forwarded');
                    if ($forwarded.length)
                        $message = $forwarded.children('message');
                    if ($carbons.find('request[xmlns="' + Strophe.NS.DELIVERY + '"][to="' + to_bare_jid + '"]').length)
                        return;
                    return this.receiveChatMessage($message[0], _.extend(options, {
                        carbon_copied: true
                    }));
                }
                let forwarded_msgs = [];
                $forwarded = $message.children('reference[type="mutable"][xmlns="' + Strophe.NS.REFERENCE + '"]').children('forwarded[xmlns="' + Strophe.NS.FORWARD + '"]');

                $forwarded.each(function (idx, forwarded_msg) {
                    var $forwarded_msg = $(forwarded_msg),
                        $forwarded_message = $forwarded_msg.children('message'),
                        $forwarded_delay = $forwarded_msg.children('delay');
                    var forwarded_message = this.receiveChatMessage($forwarded_message[0], {
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
                }.bind(this));
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
                xabber.warn('Message from me to me');
                xabber.warn(message);
                return;
            }

            var contact = this.account.contacts.mergeContact(contact_jid),
                chat = this.account.chats.getChat(contact),
                stanza_ids = this.receiveStanzaId($message, {from_bare_jid: from_bare_jid, carbon_copied: options.carbon_copied, replaced: options.replaced});

            if ($message.find('x[xmlns="' + Strophe.NS.AUTH_TOKENS + '"]').length && !options.is_archived) {
                this.account.getAllXTokens();
                if (!contact.get('in_roster'))
                    contact.pushInRoster();
            }

            return chat.receiveMessage($message, _.extend(options, {is_sender: is_sender, stanza_id: stanza_ids.stanza_id, contact_stanza_id: stanza_ids.contact_stanza_id}));
        },

        receiveErrorMessage: function (message) {
            var msgid = message.getAttribute('id'),
                origin_id = $(message).children('origin-id').attr('id');
            if (msgid) {
                var code = $(message).find('error').attr('code');
                var msg = this.account.messages.get(origin_id || msgid);
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
            var chat = this.getChat(contact);
            chat.onPresence(type);
        },

        onRosterPush: function (contact, type) {
            var chat = this.getChat(contact);
            chat.onRosterPush(type);
        }
    });

    xabber.AddGroupChatView = xabber.SearchView.extend({
        className: 'modal dialog-modal main-modal add-group-chat-modal add-contact-modal',
        template: templates.group_chats.add_group_chat,
        avatar_size: constants.AVATAR_SIZES.ACCOUNT_ITEM,
        ps_selector: '.rich-textarea',
        ps_settings: {theme: 'item-list'},

        events: {
            "click .account-field .dropdown-content": "selectAccount",
            "click .btn-add": "addGroupChat",
            "keyup .input-group-chat-name input": "updateGroupJid",
            "keyup .rich-textarea": "showPlaceholder",
            "keyup .input-group-chat-jid input": "fixJid",
            "click .btn-cancel": "close",
            "click .property-variant": "changePropertyValue"
        },

        render: function (options) {
            if (!xabber.accounts.connected.length) {
                utils.dialogs.error('No connected accounts found.');
                return;
            }
            options || (options = {});
            this.setDefaultSettings();
            var accounts = options.account ? [options.account] : xabber.accounts.connected;
            this.$('.single-acc').showIf(accounts.length === 1);
            this.$('.multiple-acc').hideIf(accounts.length === 1);
            this.$('.account-field .dropdown-content').empty();
            _.each(accounts, function (account) {
                this.$('.account-field .dropdown-content').append(
                        this.renderAccountItem(account));
            }.bind(this));
            this.bindAccount(accounts[0]);
            this.$('.btn-cancel').text(this.is_login ? 'Skip' : 'Cancel');
            this.$el.openModal({
                ready: function () {
                    let dropdown_settings = {
                        inDuration: 100,
                        outDuration: 100,
                        constrainWidth: false,
                        hover: false,
                        alignment: 'left'
                    };
                    Materialize.updateTextFields();
                    this.$('.account-field .dropdown-button').dropdown(dropdown_settings);
                    this.$('.property-field .dropdown-button').dropdown(dropdown_settings);
                    this.$('.property-field .select-xmpp-server .caret').dropdown(dropdown_settings);
                    this.$('.property-field .select-xmpp-server .xmpp-server-item-wrap').dropdown(dropdown_settings);
                }.bind(this),
                complete: this.hide.bind(this)
            });

        },

        setDefaultSettings: function () {
            this.$('input[name=chat_jid]').removeClass('fixed-jid').val("");
            this.$('#new_chat_domain').val("");
            this.$('input[name=chat_name]').val("");
            this.$('.description-field .rich-textarea').text("");
            this.$('.btn-add').addClass('non-active');
            this.showPlaceholder();
            this.$('span.errors').text('').addClass('hidden');
            let $incognito_wrap = this.$('.incognito-dropdown-wrap'),
                default_incognito_value = $incognito_wrap.find('.dropdown-content .default-value');
            $incognito_wrap.find('.incognito-item-wrap .property-value').attr('data-value', default_incognito_value.attr('data-value')).text(default_incognito_value.text());
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
            this.$el.attr('data-color', this.account.settings.get('color'));
            this.$('.account-field .dropdown-button .account-item-wrap')
                    .replaceWith(this.renderAccountItem(account));
            let all_servers = this.account.get('groupchat_servers_list');
            if (all_servers.length)
                this.$('.xmpp-server-dropdown-wrap .field-jid').text(all_servers[0]);
            else
                this.setCustomDomain(this.$('.property-field.xmpp-server-dropdown-wrap .property-value'));
            this.$('.modal-content .jid-field .set-default-domain').remove();
            for (var i = 0; i < all_servers.length; i++) {
                $('<div/>', {class: 'field-jid property-variant set-default-domain'}).text(all_servers[i]).insertBefore(this.$('.modal-content .jid-field .set-custom-domain'));
            }
        },

        renderAccountItem: function (account) {
            let $item = $(templates.add_chat_account_item({jid: account.get('jid')}));
            return $item;
        },

        selectAccount: function (ev) {
            let $item = $(ev.target).closest('.account-item-wrap'),
                account = xabber.accounts.get($item.data('jid'));
            this.bindAccount(account);
        },

        setCustomDomain: function ($property_value) {
            this.$('#new_chat_domain').val("");
            $property_value.text("");
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
            $property_value.attr('data-value', $property_item.attr('data-value'));
        },

        close: function () {
            this.$el.closeModal({ complete: this.hide.bind(this) });
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
            var my_jid = this.account.resources.connection.jid,
                name = this.$('input[name=chat_name]').val(),
                chat_jid = this.$('input[name=chat_jid]').val() ? this.$('input[name=chat_jid]').val() : undefined,
                anonymous = this.$('.incognito-field .property-value').attr('data-value'),
                domain = this.$('#new_chat_domain').val() || this.$('.xmpp-server-dropdown-wrap .property-value').text(),
                searchable = this.$('.global-field .property-value').attr('data-value'),
                description = this.$('.description-field .rich-textarea').text() || "",
                model = this.$('.membership-field .property-value').attr('data-value'),
                iq = $iq({from: my_jid, type: 'set', to: domain}).c('query', {xmlns: Strophe.NS.GROUP_CHAT + '#create'})
                    .c('name').t(name).up()
                    .c('privacy').t(anonymous).up()
                    .c('index').t(searchable).up()
                    .c('description').t(description).up()
                    .c('membership').t(model).up();
                if (chat_jid)
                    iq.c('localpart').t(chat_jid);
            this.account.sendIQ(iq,
                function (iq) {
                    let group_jid = $(iq).find('query localpart').text().trim() + '@' + $(iq).attr('from').trim(),
                        contact = this.account.contacts.mergeContact(group_jid);
                    contact.set('group_chat', true);
                    contact.pres('subscribed');
                    contact.pushInRoster(null, function () {
                        contact.pres('subscribe');
                        contact.getMyInfo();
                        this.close();
                        xabber.chats_view.updateScreenAllChats();
                        contact.sendPresent();
                        contact.trigger("open_chat", contact);
                        let iq_set_blocking = $iq({type: 'set'}).c('block', {xmlns: Strophe.NS.BLOCKING})
                            .c('item', {jid: group_jid + '/' + moment.now()});
                        this.account.sendIQ(iq_set_blocking);
                    }.bind(this));
                }.bind(this),
                function () {
                    this.$('.modal-footer .errors').removeClass('hidden').text('Jid is already in use');
                }.bind(this));
        },

        addGroupChat: function (ev) {
            if ($(ev.target).closest('.button-wrap').hasClass('non-active')) {
                $(ev.target).blur();
                return;
            }
            var xmpp_server = this.$('#new_chat_domain').val() || this.$('.xmpp-server-dropdown-wrap .property-value').text(),
                input_value = this.$('input[name=chat_jid]').val();
            if (this.$('input[name=chat_name]').val() == "")
                this.$('.modal-footer .errors').text('Enter group chat name').removeClass('hidden');
            else {
            if ((input_value == "")||((input_value.search(/[А-яЁё]/) == -1)&&(input_value.search(/\s/) == -1)&&(input_value != ""))) {
            this.$('.modal-footer .errors').text('').addClass('hidden');
            var iq = $iq({type: 'get', to: xmpp_server}).c('query', {xmlns: Strophe.NS.DISCO_INFO}),
                group_chats_support;
            this.account.sendIQ(iq, function (iq) {
                $(iq).children('query').children('feature').each(function(elem, item) {
                    if ($(item).attr('var') == Strophe.NS.GROUP_CHAT)
                        group_chats_support = true;
                }.bind(this));
                if (group_chats_support)
                    this.createGroupChat();
            }.bind(this),
                function () {
                    this.$('.modal-footer .errors').removeClass('hidden').text('Invalid domain');
                }.bind(this));
            }
            else {
                this.$('.modal-footer .errors').removeClass('hidden').text('Invalid jid');
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
            this.model.on("change:unread", this.onChangedReadStatus, this);
            this.model.on("change:const_unread", this.onChangedReadStatus, this);
            this.model.on("change:timestamp", this.updateChatPosition, this);
            xabber.accounts.on("list_changed", this.updateLeftIndicator, this);
            let wheel_ev = this.defineMouseWheelEvent();
            this.$el.on(wheel_ev, this.onMouseWheel.bind(this));
            this.ps_container.on("ps-scroll-y", this.onScrollY.bind(this));
            this.ps_container.on("ps-scroll-down", this.onScroll.bind(this));
            this.$('.read-all-button').click(this.readAllMessages.bind(this));
            xabber.on("update_screen", this.onUpdatedScreen, this);
            xabber.on("update_layout", this.onWindowResized, this);
            this.$('input').on('input', this.updateSearch.bind(this));
        },

        render: function (options) {
            if (options.right === undefined)
                this.active_chat = null;
            this.$('.chat-list-wrap').switchClass('with-padding', xabber.toolbar_view.$('.toolbar-item.unread').length);
            if (options.right !== 'chat' && options.right !== 'contact_details' && options.right !== 'searched_messages' && options.right !== 'message_context' && options.right !== 'participant_messages' || options.clear_search) {
                this.clearSearch();
                if (xabber.toolbar_view.$('.active').hasClass('all-chats')) {
                    this.showAllChats();
                }
            }
        },

        readAllMessages: function () {
            let chats = this.model,
                active_toolbar = xabber.toolbar_view.$('.active');
            if (active_toolbar.hasClass('chats')) {
                let private_chats = chats.filter(chat => !chat.contact.get('group_chat') && chat.get('timestamp') && !chat.contact.get('archived') && (chat.get('unread') || chat.get('const_unread')));
                private_chats.forEach(function (chat) {
                    chat.item_view.content.readMessages();
                }.bind(this));
            }
            if (active_toolbar.hasClass('all-chats')) {
                let all_chats = chats.filter(chat => chat.get('timestamp') && !chat.contact.get('archived') && (chat.get('unread') || chat.get('const_unread')));
                all_chats.forEach(function (chat) {
                    chat.item_view.content.readMessages();
                }.bind(this));
            }
            if (active_toolbar.hasClass('group-chats')) {
                let group_chats = chats.filter(chat => chat.contact.get('group_chat') && chat.get('timestamp') && !chat.contact.get('archived') && (chat.get('unread') || chat.get('const_unread')));
                group_chats.forEach(function (chat) {
                    chat.item_view.content.readMessages();
                }.bind(this));
            }
        },

        onUpdatedScreen: function (name) {
            this.$('.read-all-button').switchClass('hidden', !xabber.toolbar_view.$('.toolbar-item.active.unread').length);
        },

        onWindowResized: function (options) {
            options.size_changed && this.onScroll();
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

        onMouseWheel: function (ev) {
            if (ev.originalEvent.deltaY > 0)
                this.onScroll();
        },

        hideChatsFeedback: function () {
            clearTimeout(this._load_chats_timeout);
            this.$('.load-chats-feedback').addClass('hidden');
            this.updateScrollBar();
            this._load_chats_timeout = null;
        },

        onScroll: function () {
            if (this.getScrollBottom() < 12 && !this._load_chats_timeout) {
                this._load_chats_timeout = setTimeout(function () {
                    this.hideChatsFeedback();
                }.bind(this), 5000);
                let accounts = xabber.accounts.connected.filter(account => !account.roster.conversations_loaded && account.connection && account.connection.do_synchronization);
                if (accounts.length) {
                    this.$('.load-chats-feedback').text('Loading...').removeClass('hidden');
                    this.updateScrollBar();
                }
                accounts.forEach(function (account) {
                        let options = {max: xabber.settings.mam_messages_limit};
                        account.roster.last_chat_msg_id && (options.after = account.roster.last_chat_msg_id);
                        account.roster.syncFromServer(options);
                }.bind(this));
            }
        },

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
                xabber.body.setScreen(null, {chat_item: null},
                        {silent: !xabber.body.isScreen('all-chats')});
            }
            this.removeChild(chat.id, options);
            this.updateScrollBar();
        },

        onChangedActiveStatus: function (chat) {
            if (chat.get('active')) {
                var previous_chat = this.active_chat;
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

        replaceChatItem: function (item, chats) {
            let view = this.child(item.id);
            if (view && item.get('timestamp')) {
                view.$el.detach();
                let index = chats.indexOf(item);
                if (index === 0) {
                    this.$('.chat-list').prepend(view.$el);
                } else {
                    this.$('.chat-item').eq(index - 1).after(view.$el);
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
            active_toolbar.hasClass('group-chats') && view.contact.get('group_chat') && this.replaceChatItem(item, this.model.filter(chat => chat.contact.get('group_chat') && !chat.contact.get('archived')));
            active_toolbar.hasClass('chats') && !view.contact.get('group_chat') && this.replaceChatItem(item, this.model.filter(chat => !chat.contact.get('group_chat') && !chat.contact.get('archived')));
            active_toolbar.hasClass('all-chats') && !view.contact.get('archived') && this.replaceChatItem(item, this.model.filter(chat => !chat.contact.get('archived')));
            active_toolbar.hasClass('archive-chats') && view.contact.get('archived') && this.replaceChatItem(item, this.model.filter(chat => chat.contact.get('archived')));
            active_toolbar.hasClass('account-item') && (view.account.get('jid') === active_toolbar.attr('data-jid')) && this.replaceChatItem(item, this.model.filter(chat => chat.account.get('jid') === (active_toolbar.attr('data-jid')) && !chat.contact.get('archived')));
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
                    view = xabber.accounts.get(selection.data('account')).chats.get(xabber.accounts.get(selection.data('account')).contacts.get(selection.data('jid')).hash_id);
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
            options = options || {};
            this.$('.list-item.active').removeClass('active');
            view.updateActiveStatus();
            let scrolled_top = xabber.chats_view.getScrollTop();
            options.clear_search && this.clearSearch();
            if (!view.contact.get('in_roster') && (view.model.get('is_accepted') == false)) {
                view.model.set('display', true);
                view.model.set('active', true);
                xabber.body.setScreen('all-chats', {right: 'group_invitation', contact: view.contact });
            }
            else {
                if (xabber.toolbar_view.$('.active').hasClass('contacts'))
                    this.updateScreenAllChats();
                if (!view.model.get('history_loaded') && (view.model.messages.length < 20)) {
                    view.content.loadPreviousHistory();
                }
                if (!view.model.get('displayed_sent') && view.model.messages.length) {
                    let last_msg = view.model.messages.models[view.model.messages.length - 1];
                    if (last_msg)
                        if (!last_msg.isSenderMe() && (view.model.get('unread') || view.model.get('const_unread'))) {
                            view.model.sendMarker(last_msg.get('msgid'), 'displayed', last_msg.get('stanza_id'), last_msg.get('contact_stanza_id'));
                            view.model.set('displayed_sent', true);
                        }
                }
                xabber.body.setScreen((options.screen || 'all-chats'), {
                    right: 'chat',
                    clear_search: options.clear_search,
                    chat_item: view,
                    blocked: view.contact.get('blocked')
                });
                if (!view.contact.get('vcard_updated') || (view.contact.get('vcard_updated') && moment(view.contact.get('vcard_updated')).startOf('hour').isSame(moment().startOf('hour')))) {
                    view.contact.getVCard();
                }
            }
            xabber.chats_view.scrollTo(scrolled_top);
        },

        showGroupChats: function () {
            this.$('.chat-item').detach();
            let chats = this.model,
                is_unread = xabber.toolbar_view.$('.active.unread').length,
                group_chats = [];
            if (is_unread)
                group_chats = chats.filter(chat => chat.contact.get('group_chat') && chat.get('timestamp') && !chat.contact.get('archived') && (chat.get('unread') || chat.get('const_unread')));
            if (!group_chats.length) {
                group_chats = chats.filter(chat => chat.contact.get('group_chat') && chat.get('timestamp') && !chat.contact.get('archived'));
                xabber.toolbar_view.$('.toolbar-item.unread').removeClass('unread');
                this.onUpdatedScreen();
            } 
            group_chats.forEach(function (chat) {
                this.$('.chat-list').append(chat.item_view.$el);
            });
        },

        showChats: function () {
            this.$('.chat-item').detach();
            let chats = this.model,
                is_unread = xabber.toolbar_view.$('.active.unread').length,
                private_chats = [];
            if (is_unread)
                private_chats = chats.filter(chat => !chat.contact.get('group_chat') && chat.get('timestamp') && !chat.contact.get('archived') && (chat.get('unread') || chat.get('const_unread')));
            if (!private_chats.length) {
                private_chats = chats.filter(chat => !chat.contact.get('group_chat') && chat.get('timestamp') && !chat.contact.get('archived'));
                xabber.toolbar_view.$('.toolbar-item.unread').removeClass('unread');
                this.onUpdatedScreen();
            }
            private_chats.forEach(function (chat) {
                this.$('.chat-list').append(chat.item_view.$el);
            });
        },

        showChatsByAccount: function (account) {
            xabber.body.setScreen('all-chats');
            this.$('.chat-item').detach();
            let chats = this.model,
                account_chats = chats.filter(chat => (chat.account.get('jid') === account.get('jid')) && chat.get('timestamp') && !chat.contact.get('archived'));
            account_chats.forEach(function (chat) {
                this.$('.chat-list').append(chat.item_view.$el);
            });
        },

        showArchiveChats: function () {
            this.$('.chat-item').detach();
            let chats = this.model,
                archive_chats = chats.filter(chat => chat.contact.get('archived'));
            archive_chats.forEach(function (chat) {
                this.$('.chat-list').append(chat.item_view.$el);
            });
        },

        showAllChats: function () {
            this.$('.chat-item').detach();
            let chats = this.model,
                is_unread = xabber.toolbar_view.$('.active.unread').length,
                all_chats = [];
            if (is_unread)
                all_chats = chats.filter(chat => chat.get('timestamp') && !chat.contact.get('archived') && (chat.get('unread') || chat.get('const_unread')));
            if (!all_chats.length) {
                all_chats = chats.filter(chat => chat.get('timestamp') && !chat.contact.get('archived'));
                xabber.toolbar_view.$('.toolbar-item.unread').removeClass('unread');
                this.onUpdatedScreen();
            }
            all_chats.forEach(function (chat) {
                this.$('.chat-list').append(chat.item_view.$el);
            });
        },

        updateScreenAllChats: function () {
            xabber.toolbar_view.$('.toolbar-item').removeClass('active')
                .filter('.all-chats').addClass('active');
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
              this.account = this.contact.account;
              this.$el.attr('data-id', this.model.id + '-' + this.cid);
              this.$el.attr('data-contact-jid', this.contact.get('jid'));
              this.updateName();
              this.updateLastMessage();
              this.updateAvatar();
              this.updateColorScheme();
              this.updateGroupChats();
              this.updateIcon();
              this.account.settings.on("change:color", this.updateColorScheme, this);
              this.contact.on("change:name", this.updateName, this);
          },

          updateName: function () {
              this.$('.chat-title').text(this.contact.get('name'));
          },

          updateAvatar: function () {
              var image = this.contact.cached_image;
              this.$('.circle-avatar').setAvatar(image, this.avatar_size);
          },

          updateGroupChats: function () {
              var is_group_chat = this.contact.get('group_chat');
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
              ic_name && this.$('.chat-icon').removeClass('hidden').children('svg').html(env.templates.svg[ic_name]());
          },

          updateColorScheme: function () {
              var color = this.account.settings.get('color');
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
                  msg_text = (forwarded_message) ? (msg.get('message') || ((forwarded_message.length > 1) ? (forwarded_message.length + ' forwarded messages') : 'Forwarded message').italics()) : msg.getText(),
                  msg_user_info = msg.get('user_info') || msg.isSenderMe() && this.contact.my_info && this.contact.my_info.attributes || {}, msg_from = "";
              this.model.set({timestamp: timestamp});
              if (this.contact.get('group_chat'))
                  msg_from = msg_user_info.nickname || msg_user_info.jid || (msg.isSenderMe() ? this.account.get('name') : msg.get('from_jid')) || "";
              if (msg_files.length || msg_images.length) {
                  let $colored_span = $('<span class="text-color-500"/>');
                  if (msg_files.length && msg_images.length)
                      msg_text = $colored_span.text(msg_files.length + msg_images.length + ' files');
                  else {
                      if (msg_files.length > 1)
                          msg_text = $colored_span.text(msg_files.length + ' files');
                      if (msg_files.length == 1)
                          msg_text = $colored_span.text((msg_files[0].is_audio || msg_files[0].voice ? ("Voice message, " + utils.pretty_duration(msg_files[0].duration)) : msg_files[0].name));
                      if (msg_images.length > 1)
                          msg_text = $colored_span.text(msg_images.length + ' images');
                      if (msg_images.length == 1)
                          msg_text = $colored_span.text(msg_images[0].name);
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
                  .attr('title', utils.pretty_datetime(msg_time));
              this.$('.msg-delivering-state').showIf(msg.isSenderMe() && (msg.get('state') !== constants.MSG_ARCHIVED))
                  .attr('data-state', msg.getState());
          },

          openByClick: function () {
              let chat = this.account.chats.getChat(this.contact);
              this.$el.closest('.left-panel-list-wrap').find('.list-item').removeClass('active');
              this.$el.addClass('active');
              xabber.body.setScreen(xabber.body.screen.get('name'), {right: 'message_context', chat_item: chat.item_view });
              this.model.get('unique_id') && chat.getMessageContext(this.model.get('unique_id'), {message: true});
          }
      });


      xabber.ForwardPanelView = xabber.SearchView.extend({
        className: 'modal dialog-modal forward-panel-modal',
        template: templates.forward_panel,
        ps_selector: '.chat-list-wrap',
        ps_settings: {theme: 'item-list'},

        open: function (messages, account) {
            this.messages = messages;
            this.account = account;
            this.$('.chat-list-wrap').html("");
            xabber.chats_view.$('.chat-list .chat-item').each(function (idx, item) {
                let chat = this.account.chats.get($(item).data('id'));
                if (chat) {
                    this.$('.chat-list-wrap').append($(item).clone().removeClass('hidden'));
                }
            }.bind(this));
            this.$('.chat-list-wrap').prepend($('<div/>', { class: 'forward-panel-list-title recent-chats-title hidden'}).text('Recent chats'));
            this.$('.chat-list-wrap').append($('<div/>', { class: 'forward-panel-list-title contacts-title hidden'}).text('Contacts'));
            this.$('.chat-item').removeClass('active');
            this.clearSearch();
            this.data.set('visible', true);
            this.$el.openModal({
                ready: function () {
                    this.updateScrollBar();
                    this.$('.search-input').focus();
                }.bind(this),
                complete: function () {
                    this.$el.detach();
                    this.data.set('visible', false);
                }.bind(this)
            });
        },

        close: function () {
            var deferred = new $.Deferred();
            this.$el.closeModal({ complete: function () {
                this.$el.detach();
                this.data.set('visible', false);
                deferred.resolve();
            }.bind(this)});
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
            query && this.account.roster.forEach(function (contact) {
                let jid = contact.get('jid'),
                    chat_id = contact.hash_id,
                    name = contact.get('name').toLowerCase(),
                    is_match = (name.indexOf(query) < 0 && jid.indexOf(query) < 0) ? true : false;
                if (!is_match) {
                    if (!this.$('.chat-list-wrap .chat-item[data-id="' + chat_id + '"]').length) {
                        let contact_list_item = xabber.contacts_view.$('.account-roster-wrap[data-jid="'+this.account.get('jid')+'"] .roster-contact[data-jid="' + jid + '"]').first().clone();
                        contact_list_item.find('.muted-icon').hide();
                        this.$('.chat-list-wrap').append(contact_list_item);
                    }
                    else
                        is_match = true;
                }
                !is_match && (has_matches_contacts = true);
            }.bind(this));
            this.$('.contacts-title').switchClass('hidden', !has_matches_contacts);
            this.$('.chat-item').each(function (idx, item) {
                let chat = this.account.chats.get($(item).data('id'));
                if (!chat) {
                    $(item).addClass('hidden');
                    return;
                }
                jid = chat.get('jid');
                name = chat.contact.get('name').toLowerCase();
                is_match = (name.indexOf(query) < 0 && jid.indexOf(query) < 0) ? true : false;
                $(item).hideIf(is_match);
                !is_match && (has_matches_chats = true);
            }.bind(this));
            this.$('.recent-chats-title').switchClass('hidden', !has_matches_chats);
            this.$('.modal-content .error').showIf(!has_matches_contacts && !has_matches_chats);
            this.scrollToTop();
        },

        onEmptyQuery: function () {
            this.$('.roster-contact.list-item').remove();
            this.$('.contacts-title').addClass('hidden');
            this.$('.recent-chats-title').addClass('hidden');
        },

        onEnterPressed: function (selection) {
            let chat_item;
            if (selection.hasClass('roster-contact'))
                chat_item = xabber.chats_view.child(this.account.contacts.get(selection.data('jid')).hash_id);
            if (selection.hasClass('chat-item'))
                chat_item = xabber.chats_view.child(selection.data('id'));
            chat_item && this.forwardTo(chat_item);
        },

        forwardTo: function (chat_item) {
            chat_item.content.bottom.setForwardedMessages(this.messages);
            this.messages = [];
            this.close().done(function () {
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
            xabber.contacts_view.$('.account-roster-wrap[data-jid="'+this.account.get('jid')+'"] .roster-group').each(function (idx, item) {
                let group_node = $(item).clone();
                $(group_node).find('.list-item').each(function (i, list_item) {
                    let contact_node = this.account.contacts.get($(list_item).attr('data-jid'));
                    if (contact_node.get('group_chat'))
                            list_item.remove();
                }.bind(this));
                if (group_node.children('.list-item').length) {
                    this.$('.contacts-list-wrap').append(group_node);
                    group_node.find('.arrow').click(function (ev) {
                        this.toggleContacts(ev);
                    }.bind(this));
                    group_node.find('.group-head').click(function (ev) {
                        this.selectAllGroup(ev);
                    }.bind(this));
                }
            }.bind(this));
            this.data.set('visible', true);
            this.$el.openModal({
                ready: function () {
                    this.updateScrollBar();
                    this.$('.search-input').focus();
                }.bind(this),
                complete: function () {
                    this.$el.detach();
                    this.data.set('visible', false);
                    this.selected_contacts = [];
                }.bind(this)
            });
        },

        addSelectedUsers: function () {
            if (!this.selected_contacts.length) {
                this.$('.modal-footer button').blur();
                return;
            }
            $(this.selected_contacts).each(function (idx, item) {
                this.sendInvite(item);
            }.bind(this));
            this.close();
        },

        clearPanel: function () {
            this.$('.modal-footer .errors').text('');
            this.$('.counter').text('');
            this.$('.contacts-list-wrap').empty();
            this.clearSearch();
        },

        registerClickEvents: function () {
            this.$('.btn-cancel').click(function () {
                this.close();
            }.bind(this));
            this.$('.btn-add').click(function () {
                this.addSelectedUsers();
            }.bind(this));
        },

        addUser: function (ev) {
            var $target = $(ev.target).closest('.list-item'),
                contact_jid = $target.attr('data-jid');
            $target.toggleClass('click-selected');
            let itemIdx = this.selected_contacts.indexOf(contact_jid);
            if (itemIdx > -1)
                this.selected_contacts.splice(itemIdx, 1);
            else
                this.selected_contacts.push(contact_jid);
            this.updateCounter();
        },

        sendInvite: function (contact_jid) {
            let is_member_only = this.contact.get('group_info').model === 'member-only',
                iq = $iq({from: this.account.get('jid'), type: 'set', to: this.contact.get('jid')})
                .c('invite', {xmlns: Strophe.NS.GROUP_CHAT + '#invite'})
                .c('jid').t(contact_jid).up()
                .c('send').t(is_member_only).up()
                .c('reason').t((this.contact.get('group_info').anonymous === 'incognito') ? ( 'You are invited to incognito group chat. If you join it, you won\'t see real XMPP IDs of other participants') : ('You are invited to group chat. If you accept, ' + contact_jid + ' username shall be visible to group chat participants'));
            this.account.sendIQ(iq,
                function () {
                    !is_member_only && this.sendInviteMessage(contact_jid);
                    this.close();
                }.bind(this),
                function(iq) {
                    this.onInviteError(iq);
                }.bind(this));
        },

        onInviteError: function (iq) {
            var err_text;
            if ($(iq).find('not-allowed').length > 0) {
                err_text = $(iq).find('text').text() || 'You have no permission';
            }
            if ($(iq).find('conflict').length > 0) {
                err_text = $(iq).find('text').text() || $(iq).find('invite').find('jid').text() + ' already invited in group chat';
            }
            this.$('.modal-footer .errors').removeClass('hidden').text(err_text);
        },

        sendInviteMessage: function(jid_to) {
            var body = 'Add '+ this.contact.get('jid') +' to the contacts to join a group chat',
                stanza = $msg({
                    from: this.account.get('jid'),
                    to: jid_to,
                    type: 'chat',
                    id: uuid()
                }).c('invite', {xmlns: Strophe.NS.GROUP_CHAT + '#invite', jid: this.contact.get('jid')})
                    .c('reason').t((this.contact.get('group_info').anonymous === 'incognito') ? ( 'You are invited to incognito group chat. If you join it, you won\'t see real XMPP IDs of other participants') : ('You are invited to group chat. If you accept, ' + jid_to + ' username shall be visible to group chat participants')).up().up()
                    .c('x', {xmlns: Strophe.NS.GROUP_CHAT})
                    .c('privacy').t(this.contact.get('group_info').anonymous).up().up()
                    .c('body').t(body).up();
            this.account.sendMsg(stanza);
        },

        search: function (query) {
            query = query.toLowerCase();
            query && this.$('.list-item').each(function (idx, item) {
                let jid = $(item).attr('data-jid'),
                    name = this.account.contacts.get(jid).get('name').toLowerCase(),
                    hide_clone = (this.$('.list-item[data-jid="' + jid + '"]').length > 1) && (!this.$('.list-item[data-jid="' + jid + '"]').first().is($(item)));
                $(item).hideIf((name.indexOf(query) < 0 && jid.indexOf(query) < 0) || hide_clone);
            }.bind(this));
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
            var is_visible = $(ev.target).hasClass('mdi-chevron-down');
            if (is_visible) {
                var group_roster = $(ev.target).closest('.roster-group');
                group_roster.find('.list-item').each(function (idx, item) {
                    $(item).addClass('hidden');
                }.bind(this));
            }
            else
            {
                var group_roster = $(ev.target).closest('.roster-group');
                group_roster.find('.list-item').each(function (idx, item) {
                    $(item).removeClass('hidden');
                }.bind(this));
            }
            $(ev.target).switchClass('mdi-chevron-right', is_visible);
            $(ev.target).switchClass('mdi-chevron-down', !is_visible);
            this.updateScrollBar();
        },

        selectAllGroup: function (ev) {
            if ($(ev.target).hasClass('arrow'))
                return;
           var group_roster = $(ev.target).closest('.roster-group');
           if (group_roster.hasClass('click-selected')) {
               group_roster.removeClass('click-selected');
               group_roster.find('.list-item').each(function (idx, item) {
                   var contact_jid = $(item).attr('data-jid'),
                       itemIdx = this.selected_contacts.indexOf(contact_jid);
                   if (itemIdx > -1) {
                       this.selected_contacts.splice(itemIdx, 1);
                       $(item).removeClass('click-selected');
                   }
               }.bind(this));
           }
           else
           {
               group_roster.addClass('click-selected');
               group_roster.find('.list-item').each(function (idx, item) {
                   var contact_jid = $(item).attr('data-jid'),
                       itemIdx = this.selected_contacts.indexOf(contact_jid);
                   if (itemIdx > -1)
                       return;
                   else
                       this.selected_contacts.push(contact_jid);
                   $(item).addClass('click-selected');
               }.bind(this));
           }
            this.updateCounter();
        },

        updateCounter: function () {
            var selected_counter = this.$('.list-item.click-selected').length;
            (selected_counter) ? this.$('.counter').removeClass('hidden').text(selected_counter) : this.$('.counter').text('');
        }

    });

    xabber.ChatHeadView = xabber.BasicView.extend({
        className: 'chat-head-wrap',
        template: templates.chat_head,
        avatar_size: constants.AVATAR_SIZES.CHAT_HEAD,

        events: {
            "click .contact-name": "showContactDetails",
            "click .circle-avatar": "showContactDetails",
            "click .btn-notifications": "changeNotifications",
            "click .btn-contact-details": "showContactDetails",
            "click .btn-clear-history": "clearHistory",
            "click .btn-invite-users": "inviteUsers",
            "click .btn-delete-chat": "deleteChat",
            "click .btn-delete-contact": "deleteContact",
            "click .btn-block-contact": "blockContact",
            "click .btn-unblock-contact": "unblockContact",
            "click .btn-export-history": "exportHistory",
            "click .btn-archive-chat": "archiveChat",
            "click .btn-call-attention": "callAttention",
            "click .btn-search-messages": "renderSearchPanel",
            "click .btn-jingle-message": "sendJingleMessage",
            "click .btn-set-status": "setStatus"
        },

        _initialize: function (options) {
            this.content = options.content;
            this.contact = this.content.contact;
            this.model = this.content.model;
            this.account = this.model.account;
            this.updateName();
            this.updateStatus();
            this.updateAvatar();
            this.updateNotifications();
            this.updateArchiveButton();
            this.model.on("close_chat", this.closeChat, this);
            this.contact.on("change", this.onContactChanged, this);
            this.contact.on("archive_chat", this.archiveChat, this);
            this.contact.on("change:name", this.updateName, this);
            this.contact.on("change:status_updated", this.updateStatus, this);
            this.contact.on("change:image", this.updateAvatar, this);
            this.contact.on("change:blocked", this.onChangedBlocked, this);
            this.contact.on("change:muted", this.updateNotifications, this);
            this.contact.on("change:group_chat", this.updateGroupChatHead, this);
            this.contact.on("change:in_roster", this.updateMenu, this);
            xabber.on('change:audio', this.updateGroupChatHead, this);
        },

        render: function (options) {
            this.$('.tooltipped').tooltip('remove');
            this.$('.tooltipped').tooltip({delay: 50});
            this.$('.btn-more').dropdown({
                inDuration: 100,
                outDuration: 100,
                hover: false
            });
            this.$('.chat-head-menu').hide();
            this.updateMenu();
            this.updateStatusMsg();
            this.updateGroupChatHead();
            return this;
        },

        updateName: function () {
            this.$('.contact-name').text(this.contact.get('name'));
        },

        updateStatus: function () {
            var status = this.contact.get('status'),
                status_message = this.contact.getStatusMessage();
            this.$('.contact-status').attr('data-status', status);
            this.$('.chat-icon').attr('data-status', status);
            this.contact.get('blocked') ? this.$('.contact-status-message').text('Contact blocked') : this.$('.contact-status-message').text(status_message);
        },

        updateStatusMsg: function () {
            this.$('.contact-status-message').text(this.contact.getStatusMessage());
        },

        updateAvatar: function () {
            var image = this.contact.cached_image;
            this.$('.circle-avatar').setAvatar(image, this.avatar_size);
        },

        onContactChanged: function () {
            let changed = this.contact.changed;
            if (_.has(changed, 'subscription_request_in') || _.has(changed, 'subscription_request_out') || _.has(changed, 'subscription') || _.has(changed, 'status_message'))
                this.updateStatusMsg();
            if (_.has(changed, 'private_chat') || _.has(changed, 'incognito_chat'))
                this.updateIcon();
        },

        onChangedBlocked: function () {
            this.updateMenu();
            this.updateStatusMsg();
            this.updateIcon();
        },

        updateMenu: function () {
            var is_group_chat = this.contact.get('group_chat');
            this.$('.btn-invite-users').showIf(is_group_chat);
            this.$('.btn-call-attention').hideIf(is_group_chat);
            this.$('.btn-retract-own-messages').showIf(is_group_chat);
            this.$('.btn-block-contact').hideIf(this.contact.get('blocked'));
            this.$('.btn-unblock-contact').showIf(this.contact.get('blocked'));
            this.$('.btn-delete-contact').showIf(this.contact.get('in_roster'));
        },

        renderSearchPanel: function () {
            let visible_view;
            if (this.content.isVisible())
                visible_view = this.content;
            this.contact.messages_view && this.contact.messages_view.isVisible() && (visible_view = this.contact.messages_view);
            visible_view.$search_form.slideToggle(200, function () {
                if (visible_view.$search_form.css('display') !== 'none')
                    visible_view.$search_form.find('input').focus();
            }.bind(this));
        },

        showContactDetails: function () {
            this.contact.showDetails('all-chats');
        },

        updateNotifications: function () {
            var muted = this.contact.get('muted');
            this.$('.btn-notifications .muted-icon').switchClass('mdi-bell', !muted).switchClass('mdi-bell-off', muted);
        },

        changeNotifications: function () {
            var muted = !this.contact.get('muted');
            this.contact.set('muted', muted);
            this.account.chat_settings.updateMutedList(this.contact.get('jid'), muted);
        },

        callAttention: function (ev) {
            let msg = $msg({type: 'headline', to: this.contact.get('jid')})
                .c('attention', {xmlns: Strophe.NS.ATTENTION});
            this.account.sendMsg(msg);
            this.model.messages.createSystemMessage({
                from_jid: this.account.get('jid'),
                message: "Call attention was sent"
            });
        },

        archiveChat: function (ev) {
            if (ev) {
                if (($(ev.target).hasClass('mdi-package-down')) || ($(ev.target).hasClass('mdi-package-up'))) {
                    var archived_chat = this.model.item_view.$el,
                        next_chat_item = archived_chat,
                        next_chat = null,
                        next_contact;
                    while ((next_chat == null) && (next_chat_item.length > 0)) {
                        next_chat_item = next_chat_item.next();
                        if (next_chat_item) {
                            if (!next_chat_item.hasClass('hidden')) {
                                var next_chat_id = next_chat_item.attr('data-id');
                                next_chat = this.account.chats.get(next_chat_id);
                            }
                        }
                    }
                    if (next_chat != null) {
                        next_contact = next_chat.contact;
                        next_contact.trigger("open_chat", next_contact);
                    }
                    else
                        this.getActiveScreen();
                }
            }
            var archived = !this.contact.get('archived'),
                is_archived = archived ? true : false;
            this.contact.set('archived', archived);
            !this.model.messages.length && this.model.item_view.updateLastMessage();
            this.$('.btn-archive-chat .mdi').switchClass('mdi-package-up', is_archived);
            this.$('.btn-archive-chat .mdi').switchClass('mdi-package-down', !is_archived);
            this.account.chat_settings.updateArchiveChatsList(this.contact.get('jid'), archived);
        },

        sendJingleMessage: function () {
            if (xabber.current_voip_call) {
                utils.callback_popup_message('Voice call is already in progress', 1000);
                return;
            }
            this.content.initJingleMessage();
        },

        setStatus: function () {
            let set_status_view = new xabber.SetGroupchatStatusView();
            set_status_view.open(this.contact);
        },

        getActiveScreen: function () {
            var active_screen = xabber.toolbar_view.$('.active');
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

        updateArchiveButton: function () {
            var archived = this.contact.get('archived'),
                is_archived = archived ? true : false;
            this.contact.set('archived', archived);
            this.$('.btn-archive-chat .mdi').switchClass('mdi-package-up', is_archived);
            this.$('.btn-archive-chat .mdi').switchClass('mdi-package-down', !is_archived);
        },

        updateGroupChatHead: function () {
            var is_group_chat = this.contact.get('group_chat');
            this.updateIcon();
            this.$('.btn-jingle-message').showIf(!is_group_chat && xabber.get('audio'));
            this.$('.btn-set-status').showIf(is_group_chat);
            this.$('.contact-status').hideIf(is_group_chat);
        },

        updateIcon: function () {
            this.$('.chat-icon').addClass('hidden');
            let ic_name = this.contact.getIcon();
            ic_name && this.$('.chat-icon').removeClass('hidden').children('svg').html(env.templates.svg[ic_name]());
        },

        inviteUsers: function () {
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

        deleteChat: function () {
            if (this.contact.get('group_chat')) {
                utils.dialogs.ask("Delete chat", "If you delete a group chat, you won't receive messages from it", null, { ok_button_text: 'delete'}).done(function (result) {
                    if (result) {
                        (this.account.connection && this.account.connection.do_synchronization) && this.model.deleteFromSynchronization();
                        this.leaveGroupChat();
                        this.closeChat();
                    }
                }.bind(this));
            }
            else {
                let rewrite_support = this.account.server_features.get(Strophe.NS.REWRITE);
                utils.dialogs.ask("Delete chat", "Are you sure you want to <b>delete all message history</b> for this chat?" +
                (rewrite_support ? "" : ("\nWarning! <b>" + this.account.domain + "</b> server does not support message deletion. Only local message history will be deleted.").fontcolor('#E53935')), null, { ok_button_text: rewrite_support? 'delete' : 'delete locally'}).done(function (result) {
                    if (result) {
                        if (this.account.connection && this.account.connection.do_synchronization) {
                            this.model.deleteFromSynchronization();
                        }
                        if (rewrite_support) {
                            this.model.retractAllMessages(false);
                        }
                        else {
                            let all_messages = this.model.messages.models;
                            $(all_messages).each(function (idx, item) {
                                this.model.item_view.content.removeMessage(item);
                            }.bind(this));
                        }
                        this.closeChat();
                    }
                }.bind(this));
            }
        },

        deleteContact: function () {
            this.contact.details_view.deleteContact();
        },

        blockContact: function () {
            this.contact.details_view.blockContact();
        },

        unblockContact: function () {
            this.contact.details_view.unblockContact();
        },

        exportHistory: function () {
            utils.callback_popup_message('History export is not implemented yet', 2000);
        }
    });

    xabber.ChatBottomView = xabber.BasicView.extend({
        className: 'chat-bottom-wrap',
        template: templates.chat_bottom,
        avatar_size: constants.AVATAR_SIZES.CHAT_BOTTOM,
        mention_avatar_size: constants.AVATAR_SIZES.MENTION_ITEM,

        events: {
            "click": "onClickBottom",
            "click .my-avatar": "showAccountSettings",
            "keyup .input-message .rich-textarea": "keyUp",
            "keydown .input-message .rich-textarea": "keyDown",
            "change .attach-file input": "onFileInputChanged",
            "mouseup .attach-voice-message": "writeVoiceMessage",
            "mouseup .message-input-panel": "stopWritingVoiceMessage",
            "mousedown .attach-voice-message": "writeVoiceMessage",
            "click .close-forward": "unsetForwardedMessages",
            "click .send-message": "submit",
            "click .markup-text": "onShowMarkupPanel",
            "click .set-encryption": "changeEncryption",
            "click .reply-message": "replyMessages",
            "click .forward-message": "forwardMessages",
            "click .pin-message": "pinMessage",
            "click .copy-message": "copyMessages",
            "click .edit-message": "showEditPanel",
            "click .btn-save": "submit",
            "click .delete-message": "deleteMessages",
            "click .close-message-panel": "resetSelectedMessages",
            "click .mention-item": "inputMention",
            "click .format-text": "updateMarkupPanel"
        },

        _initialize: function (options) {
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
                    handler: function(range) {
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
                    }.bind(this)
                },
                arrow_down: {
                    key: constants.KEY_ARROW_DOWN,
                    handler: function(range) {
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
                    }.bind(this)
                },
                arrow_left: {
                    key: constants.KEY_ARROW_LEFT,
                    handler: function(range) {
                        if (this.$('.mentions-list').css('display') !== 'none')
                            return false;
                        else
                            return true;
                    }.bind(this)
                },
                arrow_right: {
                    key: constants.KEY_ARROW_RIGHT,
                    handler: function(range) {
                        if (this.$('.mentions-list').css('display') !== 'none')
                            return false;
                        else
                            return true;
                    }.bind(this)
                }
            };
            this.quill = new Quill(rich_textarea_wrap[0], {
                modules: {
                    keyboard: {
                        bindings: bindings
                    },
                    toolbar: [
                        ['bold', 'italic', 'underline', 'strike', 'blockquote'],
                        ['clean']
                    ]
                },
                formats: ['bold', 'italic', 'underline', 'strike', 'blockquote', 'clean', 'emoji', 'mention'],
                placeholder: 'Write a message...',
                scrollingContainer: '.rich-textarea',
                theme: 'snow'
            });
            this.quill.container.firstChild.classList.add('rich-textarea');
            this.view = options.content;
            this.model = this.view.model;
            this.contact = this.view.contact;
            this.account = this.view.account;
            this.fwd_messages = [];
            this.edit_message = null;
            this.$('.account-jid').text(this.account.get('jid'));
            this.updateAvatar();
            this.quill.on("text-change", this.onChangedText, this);
            this.account.on("change:image", this.updateAvatar, this);
            this.contact.on("change:blocked", this.onBlockedUpdate, this);
            this.contact.on("reply_selected_messages", this.replyMessages, this);
            this.contact.on("forward_selected_messages", this.forwardMessages, this);
            this.contact.on("copy_selected_messages", this.copyMessages, this);
            this.contact.on("delete_selected_messages", this.deleteMessages, this);
            this.contact.on("edit_selected_message", this.showEditPanel, this);
            this.contact.on("pin_selected_message", this.pinMessage, this);
            this.contact.on('update_my_info', this.updateInfoInBottom, this);
            this.contact.on("reset_selected_messages", this.resetSelectedMessages, this);
            this.model.on("change:encrypted", this.onChangeEncrypted, this);
            var $rich_textarea = this.$('.input-message .rich-textarea'),
                rich_textarea = $rich_textarea[0],
                $rich_textarea_wrap = $rich_textarea.parent('.rich-textarea-wrap'),
                $placeholder = $rich_textarea.siblings('.placeholder');
            rich_textarea.onpaste = this.onPaste.bind(this);
            rich_textarea.oncut = this.onCut.bind(this);
            rich_textarea.ondragenter = function (ev) {
                ev.preventDefault();
                $placeholder.text('Drop files here to send');
                $rich_textarea_wrap.addClass('file-drop');
            };
            rich_textarea.ondragover = function (ev) {
                ev.preventDefault();
            };
            rich_textarea.ondragleave = function (ev) {
                if ($(ev.relatedTarget).closest('.rich-textarea').length)
                    return;
                ev.preventDefault();
                $placeholder.text('Write a message...');
                $rich_textarea_wrap.removeClass('file-drop');
            };
            rich_textarea.ondrop = function (ev) {
                ev.preventDefault();
                ev.stopPropagation();
                $placeholder.text('Write a message...');
                $rich_textarea_wrap.removeClass('file-drop');
                var files = ev.dataTransfer.files || [];
                this.view.addFileMessage(files);
            }.bind(this);
            var $insert_emoticon = this.$('.insert-emoticon'),
                $emoji_panel_wrap = this.$('.emoticons-panel-wrap'),
                $emoji_panel = this.$('.emoticons-panel'),
                _timeout;

            let onloaded_sprites = 0,
                i = 0,
                all_sprites = Object.keys(Emoji.all).length;
            for (var emoji_list in Emoji.all) {
                let $emoji_list_wrap = $(`<div class="emoji-list-wrap"/>`),
                    list_name = emoji_list.replace(/ /g, '_');
                $(`<div id=${list_name} class="emoji-list-header">${constants.EMOJI_LIST_NAME(emoji_list)}</div>`).appendTo($emoji_list_wrap);
                _.each(Emoji.all[emoji_list], function (emoji) {
                    $('<div class="emoji-wrap"/>').html(
                        emoji.emojify({emoji_size: 24, sprite: list_name})
                    ).appendTo($emoji_list_wrap);
                });
                $emoji_list_wrap.appendTo($emoji_panel);
                $emoji_panel.siblings('.emoji-menu').append(Emoji.all[emoji_list][0].emojify({href: list_name, title: constants.EMOJI_LIST_NAME(emoji_list), tag_name: 'a', emoji_size: 20}));
                let img = new Image();
                img.onload = function () {
                    onloaded_sprites++;
                    (onloaded_sprites === all_sprites) && $emoji_panel_wrap.find('.uploading-emoticons').detach();
                }.bind(this);
                img.src = './images/emoji/spritesheet' + i++ + '.png';
            }
            var window_onclick = function (ev) {
                if ($(ev.target).closest('.emoticons-panel-wrap').length || $(ev.target).closest('.insert-emoticon').length)
                    return;
                $emoji_panel_wrap.removeClass('opened');
                window.removeEventListener( "click" , window_onclick);
            };
            $emoji_panel.perfectScrollbar(
                    _.extend({theme: 'item-list'}, xabber.ps_settings));
            this.$('.emoji-menu .emoji').click(function (ev) {
                $emoji_panel[0].scrollTop = this.$('.emoji-list-wrap ' + ev.target.attributes.href.value)[0].offsetTop - 4;
            }.bind(this));
            $insert_emoticon.click(function (ev) {
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
            }.bind(this));
            $emoji_panel_wrap.hover(null, function (ev) {
                if (ev && ev.preventDefault) { ev.preventDefault(); }
                if (_timeout) {
                    clearTimeout(_timeout);
                }
                _timeout = setTimeout(function () {
                    $emoji_panel_wrap.removeClass('opened');
                }, 200);
            }.bind(this));
            $emoji_panel_wrap.mousedown(function (ev) {
                if (ev && ev.preventDefault) { ev.preventDefault(); }
                if (_timeout)
                    clearTimeout(_timeout);
                if (ev.button)
                    return;
                var $target = $(ev.target),
                    $target_emoji = $target.closest('.emoji-wrap').find('.emoji');
                if ($target.closest('.emoji-menu').length)
                    return;
                $target_emoji.length && this.typeEmoticon($target_emoji.data('emoji'));
            }.bind(this));
            this.renderLastEmoticons();
        },

        render: function (options) {
            this.$('.message-input-panel').hideIf(options.blocked);
            this.$('.blocked-msg').showIf(options.blocked);
            this.$el.switchClass('chat-bottom-blocked-wrap', options.blocked);
            this.updateAvatar();
            var http_upload = this.account.server_features.get(Strophe.NS.HTTP_UPLOAD);
            this.content_view = (this.view.data.get('visible') ? this.view : this.contact.messages_view) || this.view;
            this.messages_arr = this.content_view.$el.hasClass('participant-messages-wrap') && this.account.participant_messages || this.content_view.$el.hasClass('messages-context-wrap') && this.account.context_messages || this.model.messages;
            this.renderLastEmoticons();
            this.$('.attach-file').showIf(http_upload);
            if (this.contact.get('group_chat')) {
                this.updateInfoInBottom();
            }
            else {
                this.$('.account-nickname').hide();
                this.$('.account-badge').hide();
                this.$('.account-role').hide();
            }
            this.focusOnInput();
            xabber.chat_body.updateHeight();
            this.manageSelectedMessages();
            return this;
        },

        onBlockedUpdate: function () {
            if (!this.isVisible())
                return;
            let is_blocked = this.contact.get('blocked');
            this.$('.message-input-panel').hideIf(is_blocked);
            this.$('.blocked-msg').showIf(is_blocked);
            this.$el.switchClass('chat-bottom-blocked-wrap', is_blocked);
        },

        onClickBottom: function (ev) {
            (this.$el.hasClass('chat-bottom-blocked-wrap') && !$(ev.target).closest('.message-actions-panel').length) && this.contact.showDetails(xabber.body.screen.get('name'));
        },

        updateInfoInBottom: function () {
            if (this.contact.my_info) {
                var nickname = this.contact.my_info.get('nickname'),
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
            if (this.contact.get('group_chat')) {
                if (this.contact.my_info)
                    if (this.contact.my_info.get('b64_avatar'))
                        image = this.contact.my_info.get('b64_avatar');
                !image && (image = Images.getDefaultAvatar(this.contact.my_info && this.contact.my_info.nickname || this.account.get('jid')));
            }
            else
                image = this.account.cached_image;
            this.$('.my-avatar.circle-avatar').setAvatar(image, this.avatar_size);
        },

        focusOnInput: function () {
            this.quill.focus();
            return this;
        },

        keyDown: function (ev) {
            $rich_textarea = this.$('.input-message .rich-textarea');
            if (ev.keyCode === constants.KEY_ESCAPE ||
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
                if (    (send_on_enter && ev.keyCode === constants.KEY_ENTER && !ev.shiftKey) ||
                        (!send_on_enter && ev.ctrlKey)  ) {
                    ev.preventDefault();
                    this.submit();
                    return;
                }
            }
            if ($rich_textarea.getTextFromRichTextarea().trim() && !this.view.chat_state && !this.view.edit_message)
                this.view.sendChatState('composing');
        },

        displayMicrophone: function () {
            this.$('.mdi-send').addClass('hidden');
            this.$('.attach-voice-message').removeClass('hidden');
            this.$('.btn-save').addClass('hidden');
        },

        displaySend: function () {
            this.$('.mdi-send').removeClass('hidden');
            this.$('.attach-voice-message').addClass('hidden');
            this.$('.btn-save').addClass('hidden');
        },

        displaySaveButton: function () {
            this.$('.btn-save').removeClass('hidden');
            this.$('.mdi-send').addClass('hidden');
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

        changeEncryption: function () {
            this.model.set('encrypted', !this.model.get('encrypted'));
        },

        onChangeEncrypted: function () {
            let enc = this.model.get('encrypted');
            this.$('.set-encryption i').switchClass('mdi-lock', enc).switchClass('mdi-lock-open', !enc);
        },
        
        getParticipantsList: function () {
            let list = [];
            this.contact.participants.each(function (participant) {
                list.push(participant.get('nickname') || participant.get('jid') || participant.get('id'));
            }.bind(this));
            return list.join(', ');
        },

        onChangedText: function () {
            let current_height = this.$el.height();
            if (current_height !== this.bottom_height) {
                this.bottom_height = current_height;
                this.view.scrolled_to_bottom = this.view.isScrolledToBottom();
            }
        },

        updateMentionsList: function (mention_text) {
            mention_text = (mention_text || "").toLowerCase();
            this.contact.searchByParticipants(mention_text, function (participants) {
                if (participants.length || 'everyone'.indexOf(mention_text) > -1 || mention_text === "*" || 'all'.indexOf(mention_text) > -1 || 'все'.indexOf(mention_text) > -1) {
                    this.$('.mentions-list').html("").show().perfectScrollbar({theme: 'item-list'});
                    this.$('.mentions-list')[0].scrollTop = 0;
                    participants.forEach(function (participant) {
                        let attrs = _.clone(participant.attributes);
                        attrs.nickname = attrs.nickname ? Strophe.xmlescape(attrs.nickname) : attrs.id;
                        let mention_item = $(templates.group_chats.mention_item(attrs));
                        mention_item.find('.circle-avatar').setAvatar(participant.get('b64_avatar') || utils.images.getDefaultAvatar(participant.get('nickname') || participant.get('jid') || participant.get('id')), this.mention_avatar_size);
                        mention_item.find('.nickname').text().replace(mention_text, mention_text.bold());
                        this.$('.mentions-list').append(mention_item);
                    }.bind(this));
                    let mention_all = $(templates.group_chats.mention_item({jid: "", nickname: "Everyone", id: ""}));
                    mention_all.find('.circle-avatar').setAvatar(this.contact.cached_image, this.mention_avatar_size);
                    mention_all.find('.one-line.jid').text(this.getParticipantsList());
                    this.$('.mentions-list').append(mention_all);
                    this.$('.mentions-list').children('.mention-item').first().addClass('active');
                } else
                    this.$('.mentions-list').html("").hide();
            }.bind(this));
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
            this.quill.deleteText(mention_position, ++mention_text.length);
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
                this.contact.participants.participant_properties_panel = new xabber.ParticipantPropertiesView({model: this.contact.details_view.participants});
                if (this.contact.my_info && this.contact.my_rights) {
                    this.contact.participants.participant_properties_panel.open(this.contact.my_info, this.contact.my_rights);
                } else
                    this.contact.getMyInfo(function () {
                        this.contact.participants.participant_properties_panel.open(this.contact.my_info, this.contact.my_rights);
                    }.bind(this));
            } else {
                this.account.showSettings();
            }
        },

        keyUp: function (ev) {
            let $rich_textarea = $(ev.target).closest('.rich-textarea'),
                text = $rich_textarea.getTextFromRichTextarea().replace(/\n$/, "");
            if (ev.keyCode === constants.KEY_ARROW_UP) {
                if (!text) {
                    let $msg = this.view.$('.chat-message[data-from="' + this.account.get('jid') + '"]').last();
                    (!$msg.length && this.contact.participants) && ($msg = this.view.$('.chat-message[data-from="' + this.contact.participants.find(m => m.get('jid') === this.account.get('jid')).get('id') + '"]').last());
                    let edit_msg = this.messages_arr.get($msg.data('uniqueid'));
                    this.edit_message = edit_msg;
                    this.setEditedMessage(edit_msg);
                }
            }
            if ((!text || text == "\n") && !this.edit_message)
                this.displayMicrophone();
            else
                this.displaySend();
            if (ev.keyCode === constants.KEY_ESCAPE) {
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
                if ((ev.keyCode === constants.KEY_BACKSPACE || ev.keyCode === constants.KEY_DELETE) && !this.edit_message) {
                    if (!text || text == "\n") {
                        if (this.$('.fwd-messages-preview').hasClass('hidden'))
                            this.displayMicrophone();
                        else
                            this.displaySend();
                        $rich_textarea.flushRichTextarea();
                        this.view.sendChatState('active');
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
                if (this.contact.get('group_chat')) {
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
                            if (this.contact.participants.length && this.contact.participants.version > 0) {
                                this.updateMentionsList(mention_text);
                            } else {
                                this.contact.details_view.participants.participantsRequest(function () {
                                    this.updateMentionsList(mention_text);
                                }.bind(this));
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
            ev.preventDefault();
            var $rich_textarea = $(ev.target),
                clipboard_data = ev.clipboardData;
            if (clipboard_data) {
                if (clipboard_data.files.length > 0) {
                    var image_from_clipboard = clipboard_data.files[clipboard_data.files.length - 1],
                        blob_image = window.URL.createObjectURL(new Blob([image_from_clipboard])),
                        options = { blob_image_from_clipboard: blob_image};
                    utils.dialogs.ask("Send Image from Clipboard", "Do you want to send Image from Clipboard?", options, { ok_button_text: 'send'}).done(function (result) {
                        if (result) {
                            image_from_clipboard.name = 'clipboard.png';
                            this.view.addFileMessage([image_from_clipboard]);
                        }
                    }.bind(this));
                }
                else if (clipboard_data.items.length > 0) {
                    var image_from_clipboard = clipboard_data.items[clipboard_data.items.length - 1];
                    if (image_from_clipboard.kind === 'file') {
                        var blob = image_from_clipboard.getAsFile(),
                            reader = new FileReader(), deferred = new $.Deferred();
                        reader.onload = function(event){
                            var options = { blob_image_from_clipboard: event.target.result};
                            utils.dialogs.ask("Send Image from Clipboard", "Do you want to send Image from Clipboard?", options, { ok_button_text: 'send'}).done(function (result) {
                                if (result) {
                                    deferred.resolve();
                                }
                            }.bind(this));
                        };
                        deferred.done(function () {
                            blob.name = 'clipboard.png';
                            this.view.addFileMessage([blob]);
                        }.bind(this));
                        reader.readAsDataURL(blob);
                    }
                    else {
                        let text = _.escape(clipboard_data.getData('text')),
                            arr_text = Array.from(text);
                        arr_text.forEach(function (item, idx) {
                            if (item == '\n')
                                arr_text.splice(idx, 1, '<br>');
                        }.bind(this));
                        text = "<p>" + arr_text.join("").emojify({tag_name: 'span'}) + "</p>";
                        window.document.execCommand('insertHTML', false, text);
                    }
                }
                else {
                    let text = _.escape(clipboard_data.getData('text')),
                        arr_text = Array.from(text);
                    arr_text.forEach(function (item, idx) {
                        if (item == '\n')
                            arr_text.splice(idx, 1, '<br>');
                        if (item == ' ')
                            arr_text.splice(idx, 1, '&nbsp');
                    }.bind(this));
                    text = "<p>" + arr_text.join("").emojify({tag_name: 'span'}) + "</p>";
                    window.document.execCommand('insertHTML', false, text);
                }
            }
            if ($rich_textarea.getTextFromRichTextarea().replace(/\n$/, "") && !this.view.chat_state && !this.view.edit_message)
                this.view.sendChatState('composing');
            this.focusOnInput();
            xabber.chat_body.updateHeight();
        },

        onFileInputChanged: function (ev) {
            var target = ev.target,
                files = [];
            for (var i = 0; i < target.files.length; i++) {
                files.push(target.files[i]);
            }

            if (files) {
                this.view.addFileMessage(files);
                $(target).val('');
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
            var $elem = $(ev.target);
            if ($elem.hasClass('recording'))
                $elem.removeClass('recording');
            else {
                $elem.addClass('recording ground-color-50');
                this.initAudio();
            }
        },

        initAudio: function() {
            navigator.getUserMedia = (navigator.getUserMedia || navigator.mozGetUserMedia || navigator.msGetUserMedia || navigator.webkitGetUserMedia);
            if (navigator.getUserMedia) {
                let constraints = { audio: true },
                    chunks = [],
                    $mic = this.$('.send-area .attach-voice-message'),
                    onSuccess = function(stream) {
                    let mediaRecorder = new MediaRecorder(stream),
                        timer = 1, start_time, end_time,
                        mic_hover = true;
                    mediaRecorder.start();
                    mediaRecorder.onstart = function() {
                        this.view.sendChatState('composing', 'voice');
                        this._chatstate_send_timeout = setInterval(function () {
                            this.view.sendChatState('composing', 'voice');
                        }.bind(this), constants.CHATSTATE_INTERVAL_COMPOSING_AUDIO);
                        start_time = moment.now();
                        let $bottom_panel = this.$('.message-input-panel'),
                            $timer_elem = this.$('.input-voice-message .timer'),
                            $status_msg = this.$('.input-voice-message .voice-msg-status'),
                            $voice_visualizer = this.$('.input-voice-message .voice-visualizer');
                        $timer_elem.text('0:00');
                        $status_msg.css('color', '#9E9E9E').text('Release outside this form to cancel');
                        $bottom_panel.addClass('voice-message-recording');

                        let timerId = setInterval(function() {
                                if ($mic.hasClass('recording') && (timer < constants.VOICE_MSG_TIME)) {
                                    if (timer%1 == 0)
                                        $timer_elem.text(utils.pretty_duration(timer));
                                    timer = (timer*10 + 2)/10;
                                    mic_hover = $bottom_panel.is(":hover");
                                    if (!mic_hover)
                                        $status_msg.css('color', '#D32F2F').text('Release to cancel record');
                                    else
                                        $status_msg.css('color', '#9E9E9E').text('Release outside this form to cancel');
                                }
                                else
                                {
                                    mic_hover = $bottom_panel.is(":hover");
                                    mediaRecorder.stop();
                                    $mic.removeClass('recording ground-color-50');
                                    $bottom_panel.removeClass('voice-message-recording');
                                    clearInterval(timerId);
                                }
                            }.bind(this), 200),
                            flag = false,
                            timerIdDot = setInterval(function() {
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
                    }.bind(this);

                    mediaRecorder.onstop = function(e) {
                        clearInterval(this._chatstate_send_timeout);
                        this.view.sendChatState('paused');
                        end_time = moment.now();
                        if (mic_hover && ((end_time - start_time)/1000 >= 1.5)) {
                            let audio_name = ("voice message " + moment().format('YYYY-MM-DD HH:mm:ss') + '.ogg'), audio_type = 'audio/ogg; codecs=opus',
                                blob = new Blob(chunks, { 'type' : audio_type}),
                                file = new File([blob], audio_name, {
                                    type: audio_type,
                                });
                            file.voice = true;
                            file.duration = Math.round((end_time - start_time)/1000);
                            this.view.addFileMessage([file]);
                        }
                        chunks = [];
                    }.bind(this);

                    mediaRecorder.ondataavailable = function(e) {
                        chunks.push(e.data);
                        stream.getTracks().forEach( track => track.stop() );
                    };
                }.bind(this);

                let onError = function (error) {
                    console.log('The following error occured: ' + error);
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
            !this.view.chat_state && this.view.sendChatState('composing');
            this.quill.insertEmbed(caret_idx, 'emoji', emoji);
            if (this.quill.getFormat(caret_idx, 1).mention) {
                this.quill.formatText(caret_idx, 1, 'mention', false);
            }
            this.quill.setSelection(caret_idx + 1);
            xabber.chat_body.updateHeight();
        },

        renderLastEmoticons: function () {
            var cached_last_emoji = this.account.chat_settings.getLastEmoji(),
                $last_emoticons = this.$('.last-emoticons').empty(), emoji;
            if (cached_last_emoji.length < 7) {
                for (var idx = 0; idx < 7; idx++) {
                    emoji = Emoji.getByIndex(idx);
                    this.account.chat_settings.updateLastEmoji(emoji);
                }
            }
            cached_last_emoji = this.account.chat_settings.getLastEmoji();
            for (var idx = 0; idx < 7; idx++) {
                $('<div class="emoji-wrap"/>').html(
                    cached_last_emoji[idx] && cached_last_emoji[idx].emojify({tag_name: 'div', emoji_size: 20})
                ).appendTo($last_emoticons);
            }
            $last_emoticons.find('.emoji-wrap').mousedown(function (ev) {
                if (ev && ev.preventDefault) { ev.preventDefault(); }
                if (ev.button) {
                    return;
                }
                var $target = $(ev.target).closest('.emoji-wrap').find('.emoji');
                this.typeEmoticon($target.data('emoji'));
            }.bind(this));
        },

        submit: function () {
            var $rich_textarea = this.$('.input-message .rich-textarea'),
                mentions = [],
                markup_references = [],
                blockquotes = [],
                text = $rich_textarea.getTextFromRichTextarea().trim();
            $rich_textarea.find('.emoji').each(function (idx, emoji_item) {
                var emoji = emoji_item.innerText;
                this.account.chat_settings.updateLastEmoji(emoji);
            }.bind(this));
            let content_concat = [];
            this.quill.getContents().forEach(function (content) {
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
                            Array.from(content.insert).forEach(function (ins) {
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

                                markup_references.forEach(function (markup_ref) {
                                    if (markup_ref.start >= quote_start_idx) {
                                        markup_ref.start += constants.QUOTE_MARKER.length;
                                        markup_ref.end += constants.QUOTE_MARKER.length;
                                    }
                                }.bind(this));

                                content_concat = content_concat.concat(Array.from(_.escape(ins)));
                            }.bind(this))
                        }
                    }
                    content_attrs.length && markup_references.push({start: start_idx, end: end_idx, markup: content_attrs});
                }
                if (content.insert && content.insert.emoji) {
                    content_concat = content_concat.concat(Array.from($(content.insert.emoji).data('emoji')));
                }
                else if (content.attributes && content.attributes.blockquote) {}
                else
                    content_concat = content_concat.concat(Array.from(_.escape(content.insert)));
            }.bind(this));
            $rich_textarea.flushRichTextarea();
            this.quill.focus();
            this.displayMicrophone();
            if (this.edit_message) {
                this.editMessage(text, {mentions: mentions, markup_references: markup_references, blockquotes: blockquotes});
                return;
            }
            if (text || this.fwd_messages.length) {
                this.view.onSubmit(text, this.fwd_messages, {mentions: mentions, markup_references: markup_references, blockquotes: blockquotes});
            }
            this.unsetForwardedMessages();
            this.view.sendChatState('active');
            xabber.chats_view.clearSearch();
            if (this.contact.messages_view)
                if (this.contact.messages_view.data.get('visible'))
                    xabber.chats_view.openChat(this.model.item_view, {clear_search: true, screen: xabber.body.screen.get('name')});
                    // this.contact.messages_view.openChat();
        },

        setEditedMessage: function (message) {
            let msg_text = message.get('message') || "";
            this.$('.fwd-messages-preview').showIf(this.edit_message);
            this.$('.fwd-messages-preview .msg-author').text('Edit message');
            this.$('.fwd-messages-preview .msg-text').html(Strophe.xmlescape(msg_text));
            this.$('.fwd-messages-preview').emojify('.msg-text', {emoji_size: 18});
            this.displaySaveButton();
            xabber.chat_body.updateHeight();
            let markup_body = utils.markupBodyMessage(message),
                emoji_node = markup_body.emojify({tag_name: 'div'}),
                arr_text = Array.from(emoji_node);
            arr_text.forEach(function (item, idx) {
                if (item == '\n')
                    arr_text[idx] = '<br>';
            }.bind(this));
            emoji_node = arr_text.join("");
            this.quill.setText("");
            this.quill.pasteHTML(0, emoji_node, 'user');
            this.focusOnInput();
        },

        setForwardedMessages: function (messages) {
            this.fwd_messages = messages || [];
            this.$('.fwd-messages-preview').showIf(messages.length);
            if (messages.length) {
                var msg = messages[0],
                    msg_author, msg_text, image_preview, $img_html_preview;
                if (messages.length > 1) {
                    msg_text = messages.length + ' messages';
                } else {
                    if (msg.get('forwarded_message')) {
                        msg_text = 'Forwarded message';
                    }
                    else {
                        msg_text = (msg.get('message') || msg.get('original_message')).emojify();
                        var fwd_images = msg.get('images'), fwd_files = msg.get('files');
                        if ((fwd_images) && (fwd_files)) {
                            msg_text = msg.get('images').length + msg.get('files').length + ' files';
                        }
                        else {
                            if (fwd_images) {
                                if (fwd_images.length > 1) {
                                    msg_text = fwd_images.length + ' images';
                                }
                                else {
                                    image_preview = _.clone(msg.get('images')[0]);
                                    $img_html_preview = this.createPreviewImage(image_preview);
                                }
                            }
                            if (fwd_files) {
                                if (msg.get('files').length > 1) {
                                    msg_text = msg.get('files').length + ' files';
                                }
                                else {
                                    var filesize = msg.get('files')[0].size;
                                    msg_text = (filesize) ? msg.get('files')[0].name + ",   " + filesize : msg.get('files')[0].name;
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
            var imgContent = new Image();
                imgContent.src = image.sources[0];
            $(imgContent).addClass('fwd-img-preview');
            return imgContent;
        },

        unsetForwardedMessages: function (ev) {
            ev && ev.preventDefault && ev.preventDefault();
            $rich_textarea = this.$('.input-message .rich-textarea');
            this.fwd_messages = [];
            if (this.edit_message) {
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
            var $selected_msgs = this.content_view.$('.chat-message.selected'),
                $input_panel = this.$('.message-input-panel'),
                $message_actions = this.$('.message-actions-panel');
                length = $selected_msgs.length;
            $input_panel.hideIf(this.contact.get('blocked') || length);
            $message_actions.showIf(length);
            this.contact.get('blocked') && this.$('.blocked-msg').hideIf(length);
            if (length) {
                var my_msg = false;
                if (length === 1) {
                    if ($selected_msgs.first().data('from') === this.account.get('jid'))
                        my_msg = true;
                    if (this.contact.my_info)
                        if ($selected_msgs.first().data('from') === this.contact.my_info.get('id'))
                            my_msg = true;
                }
                $message_actions.find('.pin-message-wrap').showIf(this.contact.get('group_chat')).switchClass('non-active', ((length !== 1) && this.contact.get('group_chat')));
                $message_actions.find('.reply-message-wrap').switchClass('non-active', this.contact.get('blocked'));
                $message_actions.find('.edit-message-wrap').switchClass('non-active', !((length === 1) && my_msg) || this.contact.get('blocked'));
                this.view.$('.chat-notification').removeClass('hidden').addClass('msgs-counter').text(length + ' message' + ((length > 1) ? 's selected' : ' selected'));
            } else {
                this.view.$('.chat-notification').addClass('hidden').removeClass('msgs-counter').text("");
                this.focusOnInput();
            }
        },

        pinMessage: function () {
            if (this.$('.pin-message-wrap').hasClass('non-active'))
                return;
            let $msg = this.content_view.$('.chat-message.selected').first(),
                pinned_msg = this.messages_arr.get($msg.data('uniqueid')),
                msg_text = pinned_msg.get('stanza_id');
            this.resetSelectedMessages();
            let iq = $iq({from: this.account.get('jid'), type: 'set', to: this.contact.get('jid')})
                .c('update', {xmlns: Strophe.NS.GROUP_CHAT})
                .c('pinned-message').t(msg_text);
            this.account.sendIQ(iq, function () {},
                function (error) {
                    if ($(error).find('not-allowed').length)
                        utils.dialogs.error('You have no permission to pin/unpin message');
                });
        },

        copyMessages: function () {
            let $msgs = this.content_view.$('.chat-message.selected'),
                msgs = [];
            $msgs.each(function (idx, item) {
                var msg = this.messages_arr.get(item.dataset.uniqueid);
                msg && msgs.push(msg);
            }.bind(this));
            this.resetSelectedMessages();
            this.pushMessagesToClipboard(msgs);
        },

        editMessage: function (text, text_markups) {
            let original_body = Strophe.xmlescape(this.edit_message.get('original_message') || ""),
                forwarded_body = "",
                mutable_refs = this.edit_message.get('mutable_content'),
                groupchat_ref = mutable_refs && mutable_refs.find(item => item.type === 'groupchat'),
                stanza_id = this.edit_message.get('stanza_id'),
                forward_ref = mutable_refs && mutable_refs.filter(item => item.type === 'forward'),
                markups = text_markups.markup_references || [],
                blockquotes = text_markups.blockquotes || [],
                mentions = text_markups.mentions || [],
                iq = $iq({from: this.account.get('jid'), type: 'set', to: this.contact.get('group_chat') ? this.contact.get('jid') : this.account.get('jid')})
                .c('replace', {xmlns: Strophe.NS.REWRITE, id: stanza_id})
                .c('message');
            forward_ref && forward_ref.forEach(function (fwd, idx) {
                let fwd_msg = this.edit_message.get('forwarded_message')[idx],
                    gc_length = groupchat_ref && (groupchat_ref.start + groupchat_ref.end);
                iq.c('reference', {xmlns: Strophe.NS.REFERENCE, begin: (groupchat_ref ? (fwd.start - gc_length) : fwd.start), end: (groupchat_ref ? (fwd.end - gc_length) : fwd.end), type: 'mutable'})
                    .c('forwarded', {xmlns: 'urn:xmpp:forward:0'})
                    .c('delay', {
                        xmlns: 'urn:xmpp:delay',
                        stamp: fwd_msg.get('time')
                    }).up().cnode(fwd_msg.get('xml')).up().up().up();
                forwarded_body += original_body.slice(fwd.start, fwd.end);
            }.bind(this));
            markups.forEach(function (markup) {
                iq.c('reference', {xmlns: Strophe.NS.REFERENCE, begin: markup.start + forwarded_body.length, end: markup.end + forwarded_body.length, type: 'decoration'});
                for (let idx in markup.markup)
                    iq.c(markup.markup[idx], {xmlns: Strophe.NS.MARKUP}).up();
                iq.up();
            }.bind(this));
            blockquotes.forEach(function (blockquote) {
                iq.c('reference', {xmlns: Strophe.NS.REFERENCE, begin: blockquote.start + forwarded_body.length, end: blockquote.end + forwarded_body.length, type: 'decoration'})
                    .c('quote', {xmlns: Strophe.NS.MARKUP}).up().up();
            }.bind(this));
            mentions.forEach(function (mention) {
                let mention_attrs = {xmlns: Strophe.NS.MARKUP};
                mention.is_gc && (mention_attrs = Strophe.NS.GROUP_CHAT);
                iq.c('reference', {xmlns: Strophe.NS.REFERENCE, begin: mention.start + forwarded_body.length, end: mention.end + forwarded_body.length, type: 'decoration'})
                    .c('mention', mention_attrs).t(mention.target).up().up();
            }.bind(this));
            iq.c('body').t(Strophe.xmlunescape(forwarded_body) + text).up();
            this.unsetForwardedMessages();
            this.account.sendIQ(iq);
        },

        showEditPanel: function () {
            if (this.$('.edit-message-wrap').hasClass('non-active'))
                return;
            let $msg = this.content_view.$('.chat-message.selected').first(),
                edit_msg = this.messages_arr.get($msg.data('uniqueid'));
            this.edit_message = edit_msg;
            this.resetSelectedMessages();
            this.setEditedMessage(edit_msg);
        },

        deleteMessages: function () {
            let $msgs = this.content_view.$('.chat-message.selected'),
                msgs = [],
                my_msgs = 0,
                dialog_options = [];
            $msgs.each(function (idx, item) {
                let msg = this.messages_arr.get(item.dataset.uniqueid);
                msg && msgs.push(msg);
                msg.isSenderMe() && my_msgs++;
            }.bind(this));
            if (this.account.server_features.get(Strophe.NS.REWRITE) || this.contact.get('group_chat')) {
                (!this.contact.get('group_chat') && xabber.servers.get(this.contact.domain).server_features.get(Strophe.NS.REWRITE)) && (dialog_options = [{
                    name: 'symmetric_deletion',
                    checked: false,
                    text: 'Delete for all'
                }]);
                utils.dialogs.ask("Delete messages", "Are you sure you want to <b>delete " + msgs.length + " message" + ((msgs.length > 1) ? "s" : "") + "</b>?",
                    dialog_options, {ok_button_text: 'delete'}).done(function (res) {
                    if (!res) {
                        this._clearing_history = false;
                        return;
                    }
                    let symmetric = (this.contact.get('group_chat')) ? true : (res.symmetric_deletion ? true : false);
                    this.resetSelectedMessages();
                    this.model.retractMessages(msgs, this.contact.get('group_chat'), symmetric);
                }.bind(this));
            }
            else {
                utils.dialogs.ask("Delete messages", "Are you sure you want to <b>delete " + msgs.length + " message" + ((msgs.length > 1) ? "s" : "") + "</b>?" + ("\nWarning! <b>" + this.account.domain + "</b> server does not support message deletion. Message" + (msgs.length > 1) ? "s" : "" +" will be deleted only locally.").fontcolor('#E53935'),
                    dialog_options, {ok_button_text: 'delete locally'}).done(function (res) {
                    if (!res) {
                        this._clearing_history = false;
                        return;
                    }
                    msgs.forEach(function (item) { this.view.removeMessage(item); }.bind(this))
                }.bind(this));
            }
        },

        pushMessagesToClipboard: function (messages) {
            let fwd_msg_indicator = "",
                copied_messages = this.createTextMessage(messages, fwd_msg_indicator);
            utils.copyTextToClipboard(_.unescape(copied_messages));
        },

        createTextMessage: function (messages, fwd_msg_indicator) {
            let text_message = "";
            for (var i = 0; i < messages.length; i++) {
                let $msg = messages[i],
                    current_date = moment($msg.get('timestamp')).startOf('day'),
                    prev_date = (i) ? moment(messages[i - 1].get('timestamp')).startOf('day') : moment(0),
                    msg_sender = "";
                    if (prev_date.format('x') != current_date.format('x')) {
                        text_message += (fwd_msg_indicator.length ? fwd_msg_indicator + ' ' : "") + utils.pretty_date(current_date) + '\n';
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
            let $msgs = this.content_view.$('.chat-message.selected'),
                msgs = [];
            $msgs.each(function (idx, item) {
                let msg = this.messages_arr.get(item.dataset.uniqueid);
                msg && msgs.push(msg);
            }.bind(this));
            this.resetSelectedMessages();
            this.setForwardedMessages(msgs);
        },

        forwardMessages: function () {
            let $msgs = this.content_view.$('.chat-message.selected'),
                msgs = [];
            $msgs.each(function (idx, item) {
                let msg = this.messages_arr.get(item.dataset.uniqueid);
                msg && msgs.push(msg);
            }.bind(this));
            this.resetSelectedMessages();
            xabber.forward_panel.open(msgs, this.account);
        },

        showChatNotification: function (message, is_colored) {
            if (!this.view.$('.chat-notification').hasClass('msgs-counter')) {
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
            var bottom_height = xabber.chat_bottom.$el.height();
            if (bottom_height) {
                this.$el.css({bottom: bottom_height});
                if (this.view) {
                    this.view.updateScrollBar();
                    this.view.scrolled_to_bottom && this.view.scrollToBottom();
                }
            }
        }
    });

    xabber.ChatBottomContainer = xabber.Container.extend({
        className: 'chat-bottom-container'
    });

    xabber.ChatPlaceholderView = xabber.BasicView.extend({
        className: 'placeholder-wrap chat-placeholder-wrap noselect',
        template: templates.chat_placeholder
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
            var last_emoji_icons = _.clone(this.get('last_emoji'));
            if (last_emoji_icons.length > 0) {
                var index = last_emoji_icons.indexOf(emoji);
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
            var muted_list = _.clone(this.get('muted')),
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
            var archived_list = _.clone(this.get('archived')),
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
            var group_chat_list = _.clone(this.get('group_chat')),
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
            var avatar_list = _.clone(this.get('cached_avatars')),
                member = avatar_list.indexOf(avatar_list.find(member => member.id === id));
            if (member != -1) {
                avatar_list.splice(member, 1);
            }
            avatar_list.push({id: id, avatar_hash: hash, avatar_b64: avatar});
            this.save('cached_avatars', avatar_list);
        },

        getAvatarInfoById: function (id) {
            var avatar_list = _.clone(this.get('cached_avatars')),
                result = avatar_list.find(member => member.id === id);
            return result;
        },

        getB64Avatar: function (id) {
            var result = this.getAvatarInfoById(id);
            if (result)
                return result.avatar_b64;
            else
                return;
        },

        getHashAvatar: function (id) {
            var result = this.getAvatarInfoById(id);
            if (result)
                return result.avatar_hash;
        }
    });

    xabber.Account.addInitPlugin(function () {
        this.chat_settings = new xabber.ChatSettings({id: 'chat-settings'}, {
            account: this,
            storage_name: xabber.getStorageName() + '-chat-settings-' + this.get('jid'),
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
        this.chats.each(function (chat) {
            if (!this.connection.do_synchronization) {
                if (chat.messages.length)
                    chat.trigger('get_missed_history', timestamp);
                else
                    chat.trigger('load_last_history');
            }
        }.bind(this));
        this.trigger('ready_to_get_roster');

        this.connection.deleteTimedHandler(this._get_msg_handler);
        this._get_msg_handler = this.connection.addTimedHandler(60000, function () {
            if (this.connection && !this.connection.handlers.find(h => !h.ns && h.name === 'message')) {
                let last_msg_timestamp = this.last_msg_timestamp;
                this.chats.registerMessageHandler();
                this.roster && this.roster.syncFromServer({stamp: last_msg_timestamp * 1000});
            }
            return true;
        }.bind(this));
    }, true, true);

    xabber.once("start", function () {

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
        this.chat_bottom = this.right_panel.addChild('chat_bottom',
                this.ChatBottomContainer);
        this.chat_placeholder = this.right_panel.addChild('chat_placeholder',
                this.ChatPlaceholderView);
        this.forward_panel = new this.ForwardPanelView({ model: this.opened_chats });

        this.invite_panel = new this.InvitationPanelView({ model: this.opened_chats });

        this.add_group_chat_view = new this.AddGroupChatView();

        this.on("add_group_chat", function () {
            this.add_group_chat_view.show();
        }, this);

        this.on("change:focused", function () {
            if (this.get('focused')) {
                var view = this.chats_view.active_chat;
                if (view && view.model.get('display')) {
                    view.content.readMessages();
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

        this.on("show_account_chats", function (ev, account) {
            this.chats_view.showChatsByAccount(account);
        }, this);

        this.on("show_archive_chats", function () {
            this.chats_view.showArchiveChats();
        }, this);

        this.on("clear_search", function () {
            this.contacts_view.clearSearch();
            this.chats_view.clearSearch();
        }, this);
    }, xabber);

    return xabber;
  };
});
