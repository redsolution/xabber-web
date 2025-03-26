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

            if (msg_object.type === 'headline' && $message.children(`attention[xmlns="${Strophe.NS.ATTENTION}"]`).length && xabber.settings.call_attention){
                let contact, chat,
                    msg_from = Strophe.getBareJidFromJid($message.attr('from'));

                if (msg_from !== this.get('jid'))
                    contact = this.contacts.get(msg_from);
                if (contact) {
                    contact && (chat = this.chats.getChat(contact));
                    if (!chat.item_view.content)
                        chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                }

                if (chat){
                    chat.messages.createSystemMessage({from_jid: msg_from, message: xabber.getString("action_attention_requested"), attention: true});
                }
                msg_object.ignore = 'xep0224';
                return msg_object;
            }
            return msg_object;
        },
        name: 'xep0224',
        order: 60,
        handler_name: 'xep0224_checker'
    };
    this._msg_xep_checkers.push(checker_object);

});

export default xabber;