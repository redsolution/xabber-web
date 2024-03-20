// only external libs and plugins for them
// import Backbone from "backbone";
import "backbone";
import _ from "underscore";
import $ from "jquery";
import moment from "moment";
import WaveSurfer from "wavesurfer";
import slug from "slug";
import sha256 from "sha256";
import magnificPopup from "magnific-popup";
import i18next from "i18next";
import i18next_sprintf from "i18next-post";
import Strophe from "strophe";
import plyr from "Plyr";
import Quill from "Quill";
import libsignal from "libsignal-protocol";
import sha1 from "sha1_hasher";
import Recorder from 'opus-recorder';
import encoderPath from 'opus-recorder/dist/encoderWorker.min.js';
import VanillaQR from "VanillaQR";
import idleJs from "idle-js";
import backgroundImagesXml from "xml-loader!~/xmls/background-images.xml";
import backgroundPatternsXml from "xml-loader!~/xmls/background-patterns.xml";
import { sharedKey, sign, verify } from 'curve25519-js';
import "~/css/color-scheme.css";
import "~/css/materialdesignicons.css";
import "~/css/materialize.css";
import "~/css/plyr.css";
import "~/css/quill.snow.css";
import "~/css/xabber.css";
import "~/node_modules/magnific-popup/dist/magnific-popup.css";
import "~/node_modules/perfect-scrollbar/dist/css/perfect-scrollbar.css";
import "strophe.disco";
import "strophe.ping";
import "strophe.rsm";
import "strophe.caps";
import "strophe.pubsub";
import "omemo";
import "backbone.localsync";
import "materialize";
import "perfectScrollbarJQuery";

export default _.extend({
    $: $,
    _: _,
    moment: moment,
    WaveSurfer: WaveSurfer,
    Plyr: plyr,
    Quill: Quill,
    libsignal: libsignal,
    slug: slug,
    sha1: sha1,
    idleJs: idleJs,
    opusRecorder: Recorder,
    opusRecorderEncoderPath: encoderPath,
    xabber_i18next: i18next,
    xabber_i18next_sprintf: i18next_sprintf,
    sha256: sha256,
    curve25519js: {
        sharedKeyCurve: sharedKey,
        signCurve: sign,
        verifyCurve: verify,
    },
    VanillaQR: VanillaQR,
    magnificPopup: magnificPopup,
    backgroundImagesXml: backgroundImagesXml,
    backgroundPatternsXml: backgroundPatternsXml,
    Strophe: Strophe
}, Strophe);
