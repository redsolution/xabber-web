import xabber from "xabber-core";

let env = xabber.env,
    $ = env.$,
    Strophe = env.Strophe;

xabber.Account.addInitPlugin(function () {
    let checker_object = {
        callback : async (msg_object) => {
            return new Promise((resolve) => {
                if (!msg_object.$message)
                    return resolve(msg_object);

                let $message = msg_object.$message;


                if (msg_object.type === 'chat'){

                    let $forwarded = $message.find('forwarded'),
                        $delay = msg_object.delay,
                        from_jid = $message.attr('from') || msg_object.from_jid;

                    let from_bare_jid = Strophe.getBareJidFromJid(from_jid);

                    if (!from_jid) {
                        from_jid = this.get('jid');
                    }

                    if (msg_object.forwarded && (!$forwarded.length || (msg_object.xml))) {

                        msg_object.final_msg = this.forwarded_messages.createFromStanza($message, {
                            is_forwarded: true,
                            forwarded_message: msg_object.forwarded_message || null,
                            delay: $delay,
                            replaced: msg_object.replaced,
                            from_jid: from_jid,
                            xml: msg_object.xml
                        });
                        msg_object.ignore = 'xep-forwards';
                        return resolve(msg_object);
                    }

                    if ($forwarded.length && !msg_object.xml && !msg_object.notification_msg) {
                        let $mam = $message.find(`result[xmlns="${Strophe.NS.MAM}"]`);
                        if ($mam.length) {
                            $forwarded = $mam.children('forwarded');
                            if ($forwarded.length) {
                                $message = $forwarded.children('message');
                                $delay = $forwarded.children('delay');
                            }
                            let stanza_ids = this.chats.receiveStanzaId($message, {from_bare_jid: from_bare_jid});

                            _.extend(msg_object, {
                                $message: $message,
                                is_mam: true,
                                delay: $delay,
                                stanza_id: stanza_ids.stanza_id || $mam.attr('id'),
                                contact_stanza_id: stanza_ids.contact_stanza_id
                            });
                            $forwarded = $message.find('forwarded');
                            if (!$forwarded.length){
                                return resolve(msg_object);
                            }
                        }
                        let forwarded_msgs = [];
                        $forwarded = $message.children(`reference[type="mutable"][xmlns="${Strophe.NS.REFERENCE}"]`).length ?
                            $message.children(`reference[type="mutable"][xmlns="${Strophe.NS.REFERENCE}"]`).children('forwarded[xmlns="' + Strophe.NS.FORWARD + '"]') :
                            $message.children('envelope').children('content').children(`reference[type="mutable"][xmlns="${Strophe.NS.REFERENCE}"]`).children('forwarded[xmlns="' + Strophe.NS.FORWARD + '"]');

                        let dfd = new $.Deferred();
                        dfd.done(() => {
                            _.extend(msg_object, {
                                forwarded_message: forwarded_msgs.length ? forwarded_msgs : null,
                                xml: $message[0]
                            });

                            $forwarded = $message.find('forwarded');
                            if (msg_object.forwarded && (!$forwarded.length || (msg_object.xml))) {
                                msg_object.final_msg = this.forwarded_messages.createFromStanza($message, {
                                    is_forwarded: true,
                                    forwarded_message: msg_object.forwarded_message || null,
                                    delay: $delay,
                                    replaced: msg_object.replaced,
                                    from_jid: from_jid,
                                    xml: msg_object.xml
                                });
                                msg_object.ignore = 'xep-forwards';
                                return resolve(msg_object);
                            }

                            return resolve(msg_object);
                        });
                        let fwd_count = 0;
                        $forwarded.each((idx, forwarded_msg) => {
                            let $forwarded_msg = $(forwarded_msg),
                                $forwarded_message = $forwarded_msg.children('message'),
                                $forwarded_delay = $forwarded_msg.children('delay');
                            this.chats.makeMessageObject($forwarded_message[0], {
                                forwarded: true,
                                pinned_message: msg_object.pinned_message,
                                participant_message: msg_object.participant_message,
                                searched_message: msg_object.searched_message,
                                is_searched: msg_object.is_searched,
                                context_message: msg_object.context_message,
                                from_jid: from_jid,
                                delay: $forwarded_delay
                            }).then((forwarded_message) => {
                                forwarded_msgs.push(forwarded_message);
                                fwd_count++;
                                if (fwd_count === $forwarded.length) {
                                    dfd.resolve();
                                }
                            });
                        });
                        return;
                    }

                }

                return resolve(msg_object);
            });
        },

        name: 'xep_forwards',
        order: 200,
        handler_name: 'xep_forwards_checker'
    };
    this._msg_xep_checkers.push(checker_object);

});

export default xabber;