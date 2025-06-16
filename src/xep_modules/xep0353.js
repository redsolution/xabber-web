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

            if (msg_object.type === 'chat'){
                let $jingle_msg_propose = $message.children(`propose[xmlns="${Strophe.NS.JINGLE_MSG}"]`),
                    $jingle_msg_accept = $message.children(`accept[xmlns="${Strophe.NS.JINGLE_MSG}"]`),
                    $jingle_msg_reject = $message.children(`reject[xmlns="${Strophe.NS.JINGLE_MSG}"]`);

                let to_jid = $message.attr('to'),
                    to_bare_jid = Strophe.getBareJidFromJid(to_jid),
                    from_jid = $message.attr('from') || msg_object.from_jid;

                if (!from_jid) {
                    from_jid = this.get('jid');
                }
                let from_bare_jid = Strophe.getBareJidFromJid(from_jid),
                    is_sender = from_bare_jid === this.get('jid'),
                    carbon_copied = msg_object.carbon_copied;

                let contact_jid = is_sender ? to_bare_jid : from_bare_jid;
                let chat;
                if (msg_object.saved_chat){
                    chat = msg_object.chat;
                }

                let contact = this.contacts.mergeContact(contact_jid);

                !chat && (chat = this.chats.getChat(contact, (msg_object.encrypted || msg_object.not_encrypted) && 'encrypted') || msg_object.chat);

                if ($jingle_msg_propose.length && !msg_object.searched_message) {
                    if (carbon_copied && (from_bare_jid === chat.account.get('jid'))) {
                        msg_object.ignore = 'xep0353';
                        return msg_object;
                    }
                    if (msg_object.synced_msg){
                        if (chat.get('saved')){
                            msg_object.ignore = 'xep0353';
                            return msg_object;
                        }
                        let view = xabber.chats_view.child(chat.contact.hash_id);
                        $message.find('time').attr('stamp') && chat.set('timestamp', $message.find('time').attr('stamp'));
                        if (!view.content)
                            view.content = new xabber.ChatContentView({chat_item: view});
                        if (view && view.content)
                            view.content.receiveNoTextMessage($message, carbon_copied);
                        msg_object.ignore = 'xep0353';
                        return msg_object;
                    }
                    if (msg_object.is_archived){
                        msg_object.ignore = 'xep0353';
                        return msg_object;
                    } else {
                        let session_id = $jingle_msg_propose.attr('id'),
                            iq_to = $message.attr('from');
                        chat.getCallingAvailability(iq_to, session_id, () => {
                            if (xabber.current_voip_call) {
                                let reason = from_bare_jid === Strophe.getBareJidFromJid(xabber.current_voip_call.get('contact_full_jid')) ? 'device_busy' : 'busy';
                                chat.sendReject({session_id: session_id, reason: reason, iniator: xabber.current_voip_call.call_initiator});
                                chat.messages.createSystemMessage({
                                    from_jid: chat.account.get('jid'),
                                    message: xabber.getString("jingle__system_message__cancelled_call")
                                });
                                return;
                            }
                            chat.initIncomingCall(iq_to, session_id);
                        });
                        msg_object.ignore = 'xep0353';
                        return msg_object;
                    }
                }
                if ($jingle_msg_accept.length) {
                    if (msg_object.is_archived || msg_object.synced_msg){
                        msg_object.ignore = 'xep0353';
                        return msg_object;
                    }
                    if (xabber.current_voip_call && xabber.current_voip_call.get('session_id') === $jingle_msg_accept.attr('id')) {
                        if (carbon_copied) {
                            chat.endCall('accepted_another_device');
                            chat.messages.createSystemMessage({
                                from_jid: chat.account.get('jid'),
                                message: xabber.getString('dialog_jingle_message__status_another_device_accepted')
                            });
                        } else {
                            !xabber.current_voip_call.get('state') && xabber.current_voip_call.set('state', constants.JINGLE_MSG_ACCEPT);
                            xabber.trigger('update_jingle_button');
                            let jingle_start = $jingle_msg_accept.find('time').attr('stamp');
                            jingle_start = jingle_start ? Number(moment(jingle_start)) : moment.now();
                            xabber.current_voip_call.set('jingle_start', jingle_start);
                            !xabber.current_voip_call.get('contact_full_jid') && xabber.current_voip_call.set('contact_full_jid', $message.attr('from'));
                            xabber.stopAudio(xabber.current_voip_call.audio_notifiation);
                            xabber.current_voip_call.set('status', 'connecting');
                            xabber.trigger('update_jingle_button');
                            xabber.current_voip_call.updateStatus(xabber.getString("dialog_jingle_message__status_connecting"));
                            xabber.current_voip_call.audio_notifiation = xabber.playAudio(xabber.settings.sound_on_connection);
                        }
                    }
                    msg_object.ignore = 'xep0353';
                    return msg_object;
                }
                if ($jingle_msg_reject.length) {
                    if (xabber.calls_view && !msg_object.context_message) {
                        xabber.calls_view.receiveChatMessage(chat.account, $message[0], msg_object);
                    }
                    if (chat.messages.filter(m => m.get('session_id') === $jingle_msg_reject.attr('id')).length){
                        msg_object.ignore = 'xep0353';
                        return msg_object;
                    }
                    let time = msg_object.delay && msg_object.delay.attr('stamp') || $message.find('delay').attr('stamp') || $message.find('time').attr('stamp'), message, msg_text = "";
                    if ($jingle_msg_reject.children('call').length) {
                        let duration = $jingle_msg_reject.children('call').attr('duration'),
                            initiator = $jingle_msg_reject.children('call').attr('initiator');
                        if (duration && initiator)
                            msg_text =xabber.getString(((initiator && initiator === chat.account.get('jid')) ? "jingle__system_message__outgoing_call" : "jingle__system_message__incoming_call"), [utils.pretty_duration(duration)]);
                        else
                            msg_text =  xabber.getString("jingle__system_message__cancelled_call");
                    }
                    else
                        msg_text =  xabber.getString("jingle__system_message__cancelled_call");
                    msg_object.is_unread && (msg_object.reject_contact_stanza_id = msg_object.contact_stanza_id);
                    let actual_messages_context = msg_object.context_message ? this.context_messages : chat.messages;

                    let system_message = actual_messages_context.createSystemMessage({
                        from_jid: chat.account.get('jid'),
                        time: time,
                        session_id: $jingle_msg_reject.attr('id'),
                        stanza_id: msg_object.stanza_id,
                        contact_stanza_id: msg_object.reject_contact_stanza_id,
                        is_unread: msg_object.is_unread,
                        message: msg_text
                    });
                    if (msg_object.is_archived || msg_object.synced_msg){
                        msg_object.ignore = 'xep0353';
                        msg_object.final_msg = system_message;
                        return msg_object;
                    }
                    if (xabber.current_voip_call && xabber.current_voip_call.get('session_id') === $jingle_msg_reject.attr('id')) {
                        xabber.stopAudio(xabber.current_voip_call.audio_notifiation);
                        let busy_audio = xabber.playAudio(xabber.settings.sound_on_call_busy);
                        setTimeout(() => {
                            xabber.stopAudio(busy_audio);
                        }, 1500);
                        chat.endCall($jingle_msg_reject.children('call').attr('reason') === 'device_busy' ? 'device_busy' : $jingle_msg_reject.children('call').attr('reason') === 'busy' ? 'busy' : 'disconnected');
                    }
                    msg_object.ignore = 'xep0353';
                    msg_object.final_msg = system_message;
                    return msg_object;
                }
            }

            return msg_object;
        },

        name: 'xep0353',
        order: 250,
        handler_name: 'xep0353_checker'
    };
    this._msg_xep_checkers.push(checker_object);

});

export default xabber;