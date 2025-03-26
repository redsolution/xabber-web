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

                let $stanza_received = $message.children(`received[xmlns="${Strophe.NS.DELIVERY}"]`),
                    $echo_msg = $message.children(`x[xmlns="${Strophe.NS.DELIVERY}"]`).children('message');

                if ($stanza_received.length) {
                    let stanza_id = $stanza_received.children('stanza-id').attr('id'),
                        origin_msg_id = $stanza_received.children('origin-id').first().attr('id');
                    if (origin_msg_id) {
                        let msg = this.messages.get(origin_msg_id || stanza_id),
                            delivered_time = $stanza_received.children('time').attr('stamp') || moment(stanza_id/1000).format();
                        if (!msg){
                            msg_object.ignore = 'xep-delivery';
                            return msg_object;
                        }
                        let pending_message = this._pending_messages.find(msg => msg.unique_id === (origin_msg_id || stanza_id));
                        if (!pending_message){
                            msg_object.ignore = 'xep-delivery';
                            return msg_object;
                        }
                        let chat = this.chats.get(pending_message.chat_hash_id);
                        if (chat && chat.get('group_chat')){
                            msg_object.ignore = 'xep-delivery';
                            return msg_object;
                        }
                        if (chat && (!chat.messages || !chat.messages.get(pending_message.unique_id))){
                            msg_object.ignore = 'xep-delivery';
                            return msg_object;
                        }
                        if (!msg.get('stanza_id') && msg.get('locations'))
                            msg.set({'stanza_id': stanza_id});
                        let msg_state = chat.get('saved') ? constants.MSG_DISPLAYED : constants.MSG_SENT;
                        msg.set({'state': msg_state, 'time': delivered_time, 'timestamp': Number(moment(delivered_time))}); // delivery receipt, changing on server time
                        chat.setStanzaId(pending_message.unique_id, stanza_id);
                        this._pending_messages.splice(this._pending_messages.indexOf(pending_message), 1);
                    }
                    msg_object.ignore = 'xep-delivery';
                    return msg_object;
                }

                if ($echo_msg.length) {
                    let origin_msg_id = $echo_msg.children('origin-id').first().attr('id'),
                        pending_message = this._pending_messages.find(msg => msg.unique_id === origin_msg_id);
                    if (pending_message) {
                        this._pending_messages.splice(this._pending_messages.indexOf(pending_message), 1);
                    }
                    msg_object.$message = $echo_msg;
                    msg_object.stanza_id = $echo_msg.children('stanza-id').attr('id');
                    msg_object.echo_msg = true;
                    msg_object.type = 'chat';
                    return msg_object;
                }
            }
            return msg_object
        },

        name: 'xep_delivery',
        order: 30,
        handler_name: 'xep_delivery_checker'
    };
    this._msg_xep_checkers.push(checker_object);

});

export default xabber;