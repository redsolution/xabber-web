define("xabber", [
    "xabber-core",
    "xabber-views",
    "xabber-api-service",
    "xabber-strophe",
    "xabber-vcard",
    "xabber-accounts",
    "xabber-discovery",
    "xabber-contacts",
    "xabber-chats",
    "xabber-searching",
    "xabber-mentions",
    "xabber-ui",
    "xabber-omemo"
], function (xabber, views, api_service, strophe, vcard,
             accounts, discovery, contacts, chats, searching, mentions, ui, omemo) {
    xabber.extendWith(views, api_service, strophe, vcard,
        accounts, discovery, contacts, chats, searching, mentions, ui, omemo)
    global.xabber = xabber;
    return xabber;
});
