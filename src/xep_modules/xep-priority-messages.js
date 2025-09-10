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


            if ($message.children('sent[xmlns="' + Strophe.NS.CARBONS + '"]').length){
                let $carbon_msg = $message.children('sent[xmlns="' + Strophe.NS.CARBONS + '"]')
                    .children('forwarded').children('message');
                if ($carbon_msg.children(`high-priority[xmlns="${Strophe.NS.PRIORITY_MESSAGES}"]`).length){
                    msg_object.ignore = 'xep_priority';
                    return msg_object;
                }
            }
            if ($message.children(`high-priority[xmlns="${Strophe.NS.PRIORITY_MESSAGES}"]`).length) {
                msg_object.high_priority = true;
            } else if ($message.children(`priority-message[xmlns="${Strophe.NS.PRIORITY_MESSAGES}"]`).length) {
                msg_object.$message = $message.children(`priority-message[xmlns="${Strophe.NS.PRIORITY_MESSAGES}"]`)
                    .children('forwarded').children('message');
                msg_object.high_priority = true;
            }

            return msg_object;
        },

        name: 'xep_priority',
        order: 4,
        handler_name: 'xep_priority_checker'
    };
    this._msg_xep_checkers.push(checker_object);

});

export default xabber;