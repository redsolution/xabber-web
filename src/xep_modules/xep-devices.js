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
                let msg_from = Strophe.getBareJidFromJid($message.attr('from')),
                    $token_revoke = $message.children(`revoke[xmlns="${Strophe.NS.AUTH_DEVICES}"]`);

                if ($token_revoke.length && msg_from === this.domain) {
                    $token_revoke.children('device').each((idx, token) => {
                        let $token = $(token),
                            token_uid = $token.attr('id');
                        if (!token_uid){
                            msg_object.ignore = 'xep-devices';
                            return msg_object
                        }
                        if (this.get('x_token') && this.get('x_token').token_uid === token_uid) {
                            if (this.omemo)
                                this.omemo.destroy();
                            this.deleteAccount(null, null, true);
                            msg_object.ignore = 'xep-devices';
                            return msg_object
                        }
                        if (this.x_tokens_list) {
                            let token = this.x_tokens_list.find(token => token.token_uid === token_uid),
                                token_idx = token ? this.x_tokens_list.indexOf(token) : -1;
                            (token_idx > -1) && this.x_tokens_list.splice(token_idx, 1);
                        }
                    });
                    xabber.settings_modal_view && xabber.settings_modal_view.settings_single_account_modal && xabber.settings_modal_view.settings_single_account_modal.updateXTokens && xabber.settings_modal_view.settings_single_account_modal.updateXTokens();
                    xabber.settings_modal_view && xabber.settings_modal_view.settings_account_modal && xabber.settings_modal_view.settings_account_modal.updateXTokens && xabber.settings_modal_view.settings_account_modal.updateXTokens();
                    msg_object.ignore = 'xep-devices';
                    return msg_object
                }
            }
            return msg_object
        },

        name: 'xep_devices',
        order: 40,
        handler_name: 'xep_devices_checker'
    };
    this._msg_xep_checkers.push(checker_object);

});

export default xabber;