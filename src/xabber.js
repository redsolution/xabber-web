import xabber from "xabber-core";
import views from "xabber-views";
import api_service from "xabber-api-service";
import strophe from "xabber-strophe";
import vcard from "xabber-vcard";
import accounts from "xabber-accounts";
import discovery from "xabber-discovery";
import contacts from "xabber-contacts";
import chats from "xabber-chats";
import searching from "xabber-searching";
import mentions from "xabber-mentions";
import ui from "xabber-ui";
import omemo from "xabber-omemo";
import trust from "xabber-trust";
import notifications from "xabber-notifications";
import calls from "xabber-calls";

xabber.extendWith(views, api_service, strophe, vcard,
    accounts, discovery, contacts, chats, searching, mentions, ui, omemo, trust, notifications, calls);
global.xabber = xabber;

export default xabber;
