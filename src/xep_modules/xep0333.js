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
            if (msg_object.type === 'chat'){

                let $marker = $message.children(`[xmlns="${Strophe.NS.CHAT_MARKERS}"]`);

                let chat = msg_object.chat;

                if (!chat){

                    let to_jid = $message.attr('to'),
                        to_bare_jid = Strophe.getBareJidFromJid(to_jid),
                        from_jid = $message.attr('from') || msg_object.from_jid;

                    if (!from_jid) {
                        from_jid = this.get('jid');
                    }
                    let from_bare_jid = Strophe.getBareJidFromJid(from_jid),
                        is_sender = from_bare_jid === this.get('jid');

                    let contact_jid = is_sender ? to_bare_jid : from_bare_jid;

                    let contact = this.contacts.mergeContact(contact_jid);

                    chat = this.chats.getChat(contact, (msg_object.encrypted || msg_object.not_encrypted) && 'encrypted');

                }

                if (!msg_object.saved_chat && chat.contact.get('group_chat') && msg_object.carbon_direction === 'sent' && !$message.children(`[xmlns="${Strophe.NS.CHAT_MARKERS}"]`).length){
                    msg_object.ignore = 'xep0333';
                    return msg_object;
                }

                if ($marker.length) {
                    let marker_tag = $marker[0].tagName.toLowerCase();
                    if ((marker_tag === 'markable') && !msg_object.is_mam && !msg_object.is_archived && !msg_object.carbon_copied && (!msg_object.synced_msg || msg_object.synced_msg && msg_object.is_unread)) {
                        chat.sendMarker($message.attr('id'), 'received', msg_object.stanza_id, msg_object.contact_stanza_id);
                        chat.get('saved') && chat.sendMarker($message.attr('id'), 'displayed', msg_object.stanza_id, msg_object.contact_stanza_id);
                    }
                    if ((marker_tag !== 'markable') && !msg_object.carbon_copied) {
                        chat.receiveMarker($message, marker_tag, msg_object.carbon_copied);
                        msg_object.ignore = 'xep0333';
                        return msg_object;
                    }
                    if ((marker_tag === 'displayed') && msg_object.carbon_copied)
                        chat.receiveCarbonsMarker($marker);
                }
                let $jingle_msg_propose = $message.children(`propose[xmlns="${Strophe.NS.JINGLE_MSG}"]`),
                    $jingle_msg_accept = $message.children(`accept[xmlns="${Strophe.NS.JINGLE_MSG}"]`),
                    $jingle_msg_reject = $message.children(`reject[xmlns="${Strophe.NS.JINGLE_MSG}"]`);

                if (!$message.find('body').length || $jingle_msg_propose.length || $jingle_msg_accept.length || $jingle_msg_reject.length) {
                    if (chat.get('saved')){
                        msg_object.ignore = 'xep0333';
                        return msg_object;
                    }
                    let view = xabber.chats_view.child(chat.contact.hash_id);
                    if (!view.content)
                        view.content = new xabber.ChatContentView({chat_item: view});
                    if (view && view.content)
                        view.content.receiveNoTextMessage($message, msg_object.carbon_copied);
                    msg_object.ignore = 'xep0333';
                    return msg_object;
                }
            }

            return msg_object;
        },

        name: 'xep0333',
        order: 260,
        handler_name: 'xep0333_checker'
    };
    this._msg_xep_checkers.push(checker_object);

});

export default xabber;