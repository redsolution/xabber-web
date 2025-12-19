import xabber from "xabber-core";
import views from "xabber-views";
import api_service from "xabber-api-service";
import strophe from "xabber-strophe";
import vcard from "xabber-vcard";
import accounts from "xabber-accounts";
import discovery from "xabber-discovery";
import contacts from "xabber-contacts";
import chats from "xabber-chats";
import xabber_xep0280 from "xabber-xep0280";
import xabber_xep_rewrite from "xabber-xep-rewrite";
import xabber_xep_delivery from "xabber-xep-delivery";
import xabber_xep_devices from "xabber-xep-devices";
import xabber_xep0060 from "xabber-xep0060";
import xabber_xep0224 from "xabber-xep0224";
import xabber_xep_groups from "xabber-xep-groups";
import xabber_xep_forwards from "xabber-xep-forwards";
import xabber_xep_favorites from "xabber-xep-favorites";
import xabber_xep0466 from "xabber-xep0466";
import xabber_xep0353 from "xabber-xep0353";
import xabber_xep0333 from "xabber-xep0333";
import searching from "xabber-searching";
import ui from "xabber-ui";
import omemo from "xabber-omemo";
import trust from "xabber-trust";
import notifications from "xabber-notifications";
import calls from "xabber-calls";

xabber.extendWith(
    views,
    api_service,
    strophe,
    vcard,
    accounts,
    discovery,
    contacts,
    chats,
    xabber_xep0280,
    xabber_xep_rewrite,
    xabber_xep_delivery,
    xabber_xep_devices,
    xabber_xep0060,
    xabber_xep0224,
    xabber_xep_groups,
    xabber_xep_forwards,
    xabber_xep_favorites,
    xabber_xep0466,
    xabber_xep0353,
    xabber_xep0333,
    searching,
    ui,
    omemo,
    trust,
    notifications,
    calls
);
global.xabber = xabber;

export default xabber;
