import xabber from "xabber-core";

let env = xabber.env,
    $ = env.$,
    utils = env.utils,
    Images = utils.images,
    Strophe = env.Strophe;

xabber.Account.addInitPlugin(function () {
    let checker_object = {
        callback : (msg_object) => {
            if (!msg_object.$message)
                return msg_object;

            let $message = msg_object.$message;


            if ($message.find(`event[xmlns="${Strophe.NS.PUBSUB}#event"]`).length) {

                let photo_id =  $message.find('info').attr('id'),
                    from_jid = Strophe.getBareJidFromJid($message.attr('from')),
                    node = $message.find('items').attr('node');

                if (node.indexOf(Strophe.NS.OMEMO) > -1){
                    console.log(msg_object);
                    msg_object.ignore = 'xep0060';
                    return msg_object;
                }
                if (node.indexOf(Strophe.NS.PUBSUB_TRUST_SHARING_ITEMS) > -1){
                    if (this.omemo && this.omemo.xabber_trust)
                        this.omemo.xabber_trust.receivePubSubMessage($message);

                }
                if (node.indexOf(Strophe.NS.PUBSUB_AVATAR_METADATA) > -1) {
                    let member_id;

                    if (!node)
                        member_id = null;
                    let is_member_id = node.indexOf('#');
                    if (is_member_id !== -1)
                        member_id = node.slice(is_member_id + 1, node.length);
                    else
                        member_id = null;

                    let photo_url =  $message.find('info').attr('url'),
                        contact = this.contacts.get(from_jid);

                    if (contact && from_jid !== this.get('jid')) {
                        if (member_id) {
                            if (contact.my_info) {
                                if ((member_id === contact.my_info.get('id')) && (photo_id === contact.my_info.get('avatar'))) {
                                    contact.trigger('update_my_info');
                                    msg_object.ignore = 'xep0060';
                                    return msg_object;
                                }
                            }
                            if (photo_id && (this.chat_settings.getHashAvatar(member_id) !== photo_id)) {
                                let member_node = Strophe.NS.PUBSUB_AVATAR_DATA + '#' + member_id;
                                contact.getAvatar(photo_id, member_node, (new_avatar) => {
                                    this.chat_settings.updateCachedAvatars(member_id, photo_id, new_avatar);
                                    if (contact.my_info) {
                                        if (member_id === contact.my_info.id) {
                                            contact.my_info.set({avatar: photo_id, b64_avatar: new_avatar});
                                            contact.trigger('update_my_info');
                                        }
                                    }
                                    let participant = contact.participants && contact.participants.get(member_id);
                                    if (participant) {
                                        let avatar_url = $message.find('info').attr('url');
                                        participant.set({avatar: photo_id, b64_avatar: new_avatar});
                                        avatar_url && participant.set('avatar_url', avatar_url);
                                        this.groupchat_settings.updateParticipant(contact.get('jid'), participant.attributes);
                                    }
                                }, () => {
                                    if (photo_url) {
                                        this.chat_settings.updateCachedAvatars(member_id, photo_id, photo_url);
                                        if (contact.my_info) {
                                            if (member_id === contact.my_info.id) {
                                                contact.my_info.set({avatar: photo_id, b64_avatar: photo_url});
                                                contact.trigger('update_my_info');
                                            }
                                        }
                                        let participant = contact.participants && contact.participants.get(member_id);
                                        if (participant) {
                                            participant.set({avatar: photo_id, b64_avatar: photo_url});
                                            this.groupchat_settings.updateParticipant(contact.get('jid'), participant.attributes);
                                        }
                                    }
                                });
                            }
                        }
                        else if (!contact.get('avatar_priority') || contact.get('avatar_priority') <= constants.AVATAR_PRIORITIES.PUBSUB_AVATAR) {
                            if (!photo_id) {
                                let image = Images.getDefaultAvatar(contact.get('name'));
                                contact.cached_image = Images.getCachedImage(image);
                                contact.set('avatar_priority', constants.AVATAR_PRIORITIES.PUBSUB_AVATAR);
                                contact.set('photo_hash', null);
                                contact.set('image', image);
                                contact.updateCachedInfo();
                                msg_object.ignore = 'xep0060';
                                return msg_object;
                            }
                            if ((photo_id !== "") && (contact.get('photo_hash') === photo_id)) {
                                msg_object.ignore = 'xep0060';
                                return msg_object;
                            } else if (photo_url) {
                                contact.cached_image = photo_url;
                                contact.set({photo_hash: photo_id, image: photo_url, avatar_priority: constants.AVATAR_PRIORITIES.PUBSUB_AVATAR});
                                contact.updateCachedInfo();
                                msg_object.ignore = 'xep0060';
                                return msg_object;
                            }
                            contact.getAvatar(photo_id, Strophe.NS.PUBSUB_AVATAR_DATA, (data_avatar) => {
                                try {
                                    contact.cached_image = Images.getCachedImage(data_avatar);
                                    contact.set('avatar_priority', constants.AVATAR_PRIORITIES.PUBSUB_AVATAR);
                                    contact.set('photo_hash', photo_id);
                                    contact.set('image', data_avatar);
                                    contact.updateCachedInfo();
                                } catch (e) {
                                    console.error(e);
                                }
                            });
                        }
                    }
                    else if (from_jid === this.get('jid')) {
                        if (photo_url) {
                            let avatar_attrs = {photo_hash: photo_id, image: photo_url, avatar_priority: constants.AVATAR_PRIORITIES.PUBSUB_AVATAR};
                            this.cached_image = photo_url;
                            this.save(avatar_attrs);
                            msg_object.ignore = 'xep0060';
                            return msg_object;
                        }
                        if (!photo_id) {
                            let image = Images.getDefaultAvatar(this.get('name'));
                            this.cached_image = Images.getCachedImage(image);
                            let avatar_attrs = {avatar_priority: constants.AVATAR_PRIORITIES.PUBSUB_AVATAR, image: image};
                            this.save(avatar_attrs);
                            msg_object.ignore = 'xep0060';
                            return msg_object;
                        }
                        this.getAvatar(photo_id, (data_avatar) => {
                            try {
                                this.cached_image = Images.getCachedImage(data_avatar);
                                let avatar_attrs = {avatar_priority: constants.AVATAR_PRIORITIES.PUBSUB_AVATAR, image: data_avatar};
                                this.save(avatar_attrs);
                            } catch (e) {

                            }
                        });
                    }
                }
                msg_object.ignore = 'xep0060';
                return msg_object;
            }

            return msg_object;
        },

        name: 'xep0060',
        order: 50,
        handler_name: 'xep0060_checker'
    };
    this._msg_xep_checkers.push(checker_object);

});

export default xabber;