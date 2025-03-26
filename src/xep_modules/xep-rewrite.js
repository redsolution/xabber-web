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


                if ($message.find(`replace[xmlns="${Strophe.NS.REWRITE}#notify"]`).length) {
                    let contact = this.contacts.get($message.find('replace').attr('conversation')),
                        chat = this.chats.getChat(contact);
                    if (this.server_features.get(Strophe.NS.XABBER_FAVORITES) && $message.find('replace').attr('conversation') === this.server_features.get(Strophe.NS.XABBER_FAVORITES).get('from'))
                        chat = this.chats.getSavedChat();
                    if (!chat)
                        return;

                    let stanza_id = $message.find('replace').attr('id'),
                        msg_item = chat.messages.find(msg => msg.get('stanza_id') === stanza_id || msg.get('contact_stanza_id') === stanza_id),
                        active_right_screen = xabber.body.screen.get('right'),
                        participant_messages = active_right_screen === 'participant_messages' && this.participant_messages || active_right_screen === 'message_context' && this.context_messages || active_right_screen === 'searched_messages' && this.searched_messages || [],
                        participant_msg_item = participant_messages.find(msg => msg.get('stanza_id') === stanza_id);

                    msg_object.replaced = true;
                    msg_object.chat = chat;


                    msg_object.update_replaced = () => {
                        if (participant_msg_item) {
                            participant_msg_item.set('last_replace_time', $message.find('replaced').last().attr('stamp'));
                        }
                        if (msg_item) {
                            msg_item.set('last_replace_time', $message.find('replaced').last().attr('stamp'));
                            if (contact && contact.get('pinned_message'))
                                if (contact.get('pinned_message').get('unique_id') === msg_item.get('unique_id')) {
                                    contact.get('pinned_message').set('message', msg_item.get('message'));
                                    if (!chat.item_view.content)
                                        chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                                    chat.item_view.content.updatePinnedMessage();
                                }
                            chat && chat.item_view.updateLastMessage(chat.last_message);
                        }
                    };
                    return msg_object;
                }


                if ($message.find(`invalidate[xmlns="${Strophe.NS.REWRITE}#notify"]`).length) {
                    let contact = this.contacts.get($message.find('invalidate').attr('conversation')),
                        chat = this.chats.getChat(contact);

                    if (this.server_features.get(Strophe.NS.XABBER_FAVORITES) && $message.find('invalidate').attr('conversation') === this.server_features.get(Strophe.NS.XABBER_FAVORITES).get('from'))
                        chat = this.chats.getSavedChat();
                    if (!chat)
                        return;
                    chat.retraction_version = $message.find('invalidate').attr('version');
                    if (chat.item_view && !chat.item_view.content)
                        chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                    let all_messages = chat.messages.models;
                    $(all_messages).each((idx, msg) => {
                        chat.item_view.content.removeMessage(msg);
                    });
                    chat.set('first_archive_id', undefined);
                    chat.set('history_loaded', false);
                    chat.item_view.updateEmptyChat();
                    let timeout = 0;
                    let loadPreviousAfterInvalidate = setInterval(() => {
                        timeout++;
                        if (!chat.item_view.content._loading_history){
                            clearInterval(loadPreviousAfterInvalidate);
                            chat.item_view.content.loadPreviousHistory(true);
                        } else if (timeout > 30) {
                            clearInterval(loadPreviousAfterInvalidate);
                        }
                    }, 1000);
                    if (!chat.item_view.content._loading_history){
                        clearInterval(loadPreviousAfterInvalidate);
                        chat.item_view.content.loadPreviousHistory(true);
                    }
                    msg_object.ignore = 'xep-rewrite';
                    return msg_object;
                }


                if ($message.find('retract-message').length) {
                    let is_encrypted = $message.find('retract-message').attr('type') === Strophe.NS.OMEMO;

                    let contact = this.contacts.get($message.find('retract-message').attr('conversation')),
                        chat = this.chats.getChat(contact,  is_encrypted && 'encrypted');

                    if (this.server_features.get(Strophe.NS.XABBER_FAVORITES) && $message.find('retract-message').attr('conversation') === this.server_features.get(Strophe.NS.XABBER_FAVORITES).get('from'))
                        chat = this.chats.getSavedChat();
                    if (!chat)
                        return;
                    let $retracted_msg = $message.find('retract-message'),
                        retracted_msg_id = $retracted_msg.attr('id'),
                        retract_version = $retracted_msg.attr('version'),
                        msg_item = chat.messages.find(msg => msg.get('stanza_id') === retracted_msg_id || msg.get('contact_stanza_id') === retracted_msg_id);
                    chat.retracted_msg_id_list.push(retracted_msg_id);
                    if (msg_item) {
                        msg_item.set('is_unread', false);
                        if (!chat.item_view.content)
                            chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                        chat.item_view.content.removeMessage(msg_item);
                        chat.item_view.updateLastMessage(chat.last_message);
                    }
                    if (!chat.get('group_chat') && retract_version > this.retraction_version) {
                        this.retraction_version = retract_version;
                    }
                    msg_object.ignore = 'xep-rewrite';
                    return msg_object;
                }


                if ($message.find('retract-user').length) {

                    let contact, chat,
                        msg_from = Strophe.getBareJidFromJid($message.attr('from'));
                    if (msg_from !== this.get('jid'))
                        contact = this.contacts.get(msg_from);
                    if (contact) {
                        contact && (chat = this.chats.getChat(contact));
                        if (!chat.item_view.content)
                            chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                    }

                    let $retracted_user_msgs = $message.find('retract-user'),
                        retracted_user_id = $retracted_user_msgs.attr('id'),
                        msg_item = chat.messages.filter(msg => msg.get('user_info') && (msg.get('user_info').id === retracted_user_id));
                    if (msg_item)
                        $(msg_item).each((idx, item) => {
                            item.set('is_unread', false);
                            if (!chat.item_view.content)
                                chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                            chat.item_view.content.removeMessage(item);
                        });
                    chat.item_view.updateLastMessage(chat.last_message);
                }


                if ($message.find('retract-all').length) {
                    let contact = this.contacts.get($message.find('retract-all').attr('conversation')),
                        chat = this.chats.getChat(contact,  $message.find('retract-all').attr('type') === Strophe.NS.OMEMO && 'encrypted');

                    if (!chat){
                        msg_object.ignore = 'xep-rewrite';
                        return msg_object;
                    }
                    let all_messages = chat.messages.models;
                    let call_messages;

                    if (xabber.calls_view){
                        call_messages = xabber.calls_view.calls_messages;
                        let remove_call_messages = call_messages.filter(item => item.get('call_contact') && item.get('call_contact').get('jid') === contact.get('jid')),
                            new_list = call_messages.filter(item => (item.get('call_contact') && item.get('call_contact').get('jid') !== contact.get('jid')) || !item.get('call_contact'));
                        _.each(remove_call_messages, (msg) => {
                            this.cached_calls.removeFromCachedCalls(msg.get('unique_id'), () => {
                            });
                            xabber.calls_view.removeMessageFromDOM(msg);
                        });
                        remove_call_messages.length && new_list.length && xabber.calls_view.calls_messages.reset(new_list);
                        if (!xabber.calls_view.calls_messages.filter(msg => msg.get('call_chat').account.get('jid') === this.get('jid')).length){
                            xabber.calls_view.loadPreviousHistory(this);
                        }
                    }
                    $(all_messages).each((idx, item) => {
                        if (!chat.item_view.content)
                            chat.item_view.content = new xabber.ChatContentView({chat_item: chat.item_view});
                        chat.item_view.content.removeMessage(item);
                    });
                    chat.item_view.updateLastMessage();
                    msg_object.ignore = 'xep-rewrite';
                    return msg_object;
                }
            }

            return msg_object;
        },

        name: 'xep_rewrite',
        order: 20,
        handler_name: 'xep_rewrite_checker'
    };
    this._msg_xep_checkers.push(checker_object);

});

export default xabber;