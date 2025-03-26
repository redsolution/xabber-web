import xabber from "xabber-core";

let env = xabber.env,
    $ = env.$,
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

                if ($message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}#system-message"]`).length) {
                    if (!contact){
                        msg_object.ignore = 'xep-groups';
                        return msg_object;
                    }
                    let participant_version = $message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}#system-message"]`).attr('version');
                    if (participant_version && contact.participants && contact.participants.version < participant_version)
                        contact.trigger('update_participants');
                    msg_object.ignore = 'xep-groups';
                    return msg_object;
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

                if ($message.children(`x[xmlns="${Strophe.NS.GROUP_CHAT}#system-message"]`).length) {

                    let contact = this.contacts.mergeContact(contact_jid);

                    if (!contact){
                        msg_object.ignore = 'xep-groups';
                        return msg_object;
                    }

                    let chat = this.chats.getChat(contact);

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