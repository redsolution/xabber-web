import xabber from "xabber-core";

let env = xabber.env,
    $ = env.$,
    moment = env.moment,
    Strophe = env.Strophe;

xabber.Account.addInitPlugin(function () {
    let checker_object = {
        callback : (msg_object) => {
            if (!msg_object.$message)
                return msg_object;

            let $message = msg_object.$message;


            if (msg_object.type === 'headline'){
                let contact, chat,
                    msg_from = Strophe.getBareJidFromJid($message.attr('from'));
                if (msg_from !== this.get('jid'))
                    contact = this.contacts.get(msg_from);
                if (contact) {
                    contact && (chat = this.chats.getChat(contact));
                    if (!chat.item_view.content)
                        chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                }

                if ($message.children(`group`).length) {
                    if (!contact){
                        msg_object.ignore = 'xep-groups';
                        return msg_object;
                    }

                    let group_chat_info = contact.parseGroupInfo($message),
                        prev_group_info = contact.get('group_info') || {};
                    _.extend(prev_group_info, group_chat_info);
                    contact.set('group_info', prev_group_info);
                    contact.set('name', prev_group_info.name);
                    contact.set({status: prev_group_info.status, status_updated: moment.now(), status_message: (prev_group_info.members_num + ' members' + xabber.getString("contact_groupchat_status_online", [prev_group_info.online_members_num || 0]))});
                    contact.trigger('group_info_updated');
                    msg_object.ignore = 'xep-groups';
                    return msg_object;
                }

                if ($message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}"]`).children('system-message[type="update"]').length) {
                    let $sys_msg = $message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}"]`).children('system-message[type="update"]');
                    if ($sys_msg.children('user')){
                        _.each($sys_msg.children('user'),(user) => {
                            let $user = $(user),
                                member_id = $user.attr('id'),
                                photo_id = $user.find('avatar info').attr('id'),
                                photo_url = $user.find('avatar info').attr('url');

                            if (member_id && photo_url) {
                                this.chat_settings.updateCachedAvatars(member_id, photo_id, photo_url);
                                if (contact.my_info) {
                                    if (member_id === contact.my_info.id) {
                                        contact.my_info.set({avatar: photo_id, avatar_url: photo_url});
                                        contact.trigger('update_my_info');
                                    }
                                }
                                let participant = contact.participants && contact.participants.get(member_id);
                                if (participant) {
                                    participant.set({avatar: photo_id, avatar_url: photo_url});
                                    this.groupchat_settings.updateParticipant(contact.get('jid'), participant.attributes);
                                }
                            }
                        });
                        msg_object.ignore = 'xep-groups';
                        return msg_object;
                    }
                }
            }

            if (msg_object.type === 'chat'){

                let to_jid = $message.attr('to'),
                    to_bare_jid = Strophe.getBareJidFromJid(to_jid),
                    from_jid = $message.attr('from'),
                    from_bare_jid = Strophe.getBareJidFromJid(from_jid),
                    is_sender = from_bare_jid === this.get('jid'),
                    contact_jid = is_sender ? to_bare_jid : from_bare_jid;


                if ($message.find('invite').length) {
                    if (msg_object.forwarded){
                        msg_object.ignore = 'xep-groups';
                        return msg_object;
                    }
                }

                if ($message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}"]`).children('system-message').length) {
                    msg_object.groupchat_system_msg = true;
                    msg_object.groupchat_system_msg_type = $message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}"]`).children('system-message').attr('type');
                    msg_object.groupchat_system_msg_nickname = $message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}"]`).children('system-message').children('user').children('nickname').text() || $message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}"]`).children('system-message').children('user').children('jid').text();

                    if ([`join`, `left`, `update`].includes(msg_object.groupchat_system_msg_type)){
                        let contact = this.contacts.mergeContact(contact_jid);

                        if (!contact){
                            msg_object.ignore = 'xep-groups';
                            return msg_object;
                        }

                        contact.trigger('update_participants');
                    }
                }
            }

            return msg_object;
        },

        name: 'xep_groups',
        order: 100,
        handler_name: 'xep_groups_checker'
    };
    this._msg_xep_checkers.push(checker_object);

});

export default xabber;