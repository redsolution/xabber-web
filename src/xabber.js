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
    "xabber-ui"
], function (xabber, views, api_service, strophe, vcard,
             accounts, discovery, contacts, chats, ui) {
    return xabber.extendWith(views, api_service, strophe, vcard,
                             accounts, discovery, contacts, chats, ui);
});
