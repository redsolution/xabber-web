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

            let $carbons = $message.find(`[xmlns="${Strophe.NS.CARBONS}"]`);
            if ($carbons.length && ['received', 'sent'].includes($carbons[0].tagName)){
                if ($message.find('invite').length) {
                    if ($carbons[0].tagName === 'sent'){
                        msg_object.ignore = 'xep0280';
                        return msg_object;
                    }
                }
                if (!msg_object.is_sender){
                    msg_object.ignore = 'xep0280';
                    return msg_object;
                }
                let $forwarded = $carbons.children('forwarded');
                if ($forwarded.length) {
                    msg_object.$message = $forwarded.children('message');
                    msg_object.from = Strophe.getBareJidFromJid($message.attr('from'));
                    msg_object.to = Strophe.getBareJidFromJid($message.attr('to'));
                    msg_object.is_sender = msg_object.from === msg_object.account.get('jid');
                }
                if ($carbons.find(`request[xmlns="${Strophe.NS.DELIVERY}"][to="${msg_object.to}"]`).length){
                    msg_object.ignore = 'xep0280';
                    return msg_object;
                }

                msg_object.carbon_copied = true;
                msg_object.carbon_direction = $carbons[0].tagName;
                return msg_object;
            }
            return msg_object;
        },
        name: 'xep0280',
        order: 10,
        handler_name: 'xep0280_checker'
    };
    this._msg_xep_checkers.push(checker_object);

});

export default xabber;