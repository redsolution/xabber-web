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
                let to_jid = $message.attr('to'),
                    to_bare_jid = Strophe.getBareJidFromJid(to_jid),
                    from_jid = $message.attr('from') || msg_object.from_jid;

                if (!from_jid) {
                    from_jid = this.get('jid');
                }
                let from_bare_jid = Strophe.getBareJidFromJid(from_jid),
                    is_sender = from_bare_jid === this.get('jid');

                let contact_jid = is_sender ? to_bare_jid : from_bare_jid;

                if (
                    this.server_features.get(Strophe.NS.XABBER_FAVORITES)
                    && this.server_features.get(Strophe.NS.XABBER_FAVORITES).get('from')
                    && contact_jid === this.server_features.get(Strophe.NS.XABBER_FAVORITES).get('from')
                ) {
                    msg_object.chat = this.chats.getSavedChat();
                    msg_object.saved_chat = true;
                    if (msg_object.carbon_copied && msg_object.carbon_direction === 'sent' || !msg_object.carbon_copied) {
                        let stanza_ids = this.chats.receiveStanzaId($message, {from_bare_jid: from_bare_jid, carbon_copied: msg_object.carbon_copied, replaced: msg_object.replaced});
                        _.extend(msg_object, {
                            is_sender: is_sender,
                            stanza_id: stanza_ids.stanza_id,
                            contact_stanza_id: stanza_ids.contact_stanza_id});
                        return msg_object;
                    }
                }
            }

            return msg_object;
        },

        name: 'xep_favorites',
        order: 230,
        handler_name: 'xep_favorites_checker'
    };
    this._msg_xep_checkers.push(checker_object);

});

export default xabber;