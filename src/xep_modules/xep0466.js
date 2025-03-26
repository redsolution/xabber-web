import xabber from "xabber-core";

let env = xabber.env,
    $ = env.$,
    Strophe = env.Strophe;

xabber.Account.addInitPlugin(function () {
    let checker_object = {
        callback : (msg_object) => {
            if (!msg_object.$message || msg_object.saved_chat)
                return msg_object;

            let $message = msg_object.$message;

            if (msg_object.type === 'chat'){
                let to_jid = $message.attr('to'),
                    to_bare_jid = Strophe.getBareJidFromJid(to_jid),
                    from_jid = $message.attr('from') || msg_object.from_jid;

                if (!from_jid) {
                    from_jid = this.get('jid');
                }
                let from_bare_jid = Strophe.getBareJidFromJid(from_jid),
                    is_sender = from_bare_jid === this.get('jid');

                let contact_jid = is_sender ? to_bare_jid : from_bare_jid;

                let contact = this.contacts.mergeContact(contact_jid),
                    chat = this.chats.getChat(contact, (msg_object.encrypted || msg_object.not_encrypted) && 'encrypted');

                if (chat && chat.get('encrypted') && msg_object.encrypted){
                    if ($message.find('[xmlns="' + Strophe.NS.EPHEMERAL + '"]').length){
                        let ephemeral_timestamp = msg_object.delay && msg_object.delay.attr('stamp') || $message.find('delay').attr('stamp') || $message.find('time').attr('stamp');
                        if (msg_object.synced_msg || msg_object.is_archived){
                            if (!chat.get('ephemeral_timer_timestamp') || chat.get('ephemeral_timer_timestamp') < Date.parse(ephemeral_timestamp)) {
                                chat.set('ephemeral_timer_timestamp', Date.parse(ephemeral_timestamp));
                                chat.set('chat_ephemeral_timer', $message.find('[xmlns="' + Strophe.NS.EPHEMERAL + '"]').attr('timer'));
                            }
                        } else {
                            chat.set('chat_ephemeral_timer', $message.find('[xmlns="' + Strophe.NS.EPHEMERAL + '"]').attr('timer'));
                            chat.set('ephemeral_timer_timestamp', Date.parse(ephemeral_timestamp));
                        }
                    } else {
                        chat.set('chat_ephemeral_timer', null);
                    }
                }
            }

            return msg_object;
        },

        name: 'xep0466',
        order: 240,
        handler_name: 'xep0466_checker'
    };
    this._msg_xep_checkers.push(checker_object);

});

export default xabber;