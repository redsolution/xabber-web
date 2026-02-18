// only external libs and plugins for them
// import Backbone from "backbone";
import * as Backbone from "backbone";
import _ from "underscore";
import $ from "jquery";
import moment from "moment";
import WaveSurfer from "wavesurfer";
import slug from "slug";
import sha256 from "sha256";
import magnificPopup from "magnific-popup";
import i18next from "i18next";
import i18next_sprintf from "i18next-post";
import { $build, $iq, $msg, $pres, Builder, Request, Stanza, Strophe, stx, toStanza } from "strophe";
import plyr from "Plyr";
import Quill from "Quill";
import libsignal from "libsignal-protocol";
import * as sha1Module from "sha1_hasher";
var sha1 = sha1Module.default || sha1Module;
import stropheSHA1 from "strophe.sha1";
import * as RecorderModule from 'opus-recorder';
var Recorder = RecorderModule.default || RecorderModule;
import encoderPath from 'opus-recorder/dist/encoderWorker.min.js?url';
import VanillaQR from "VanillaQR";
import idleJs from "idle-js";
import bgImagesXmlRaw from "~/xmls/background-images.xml?raw";
import bgPatternsXmlRaw from "~/xmls/background-patterns.xml?raw";
import { sharedKey, sign, verify } from 'curve25519-js';
import "~/css/color-scheme.css";
import "~/css/materialdesignicons.css";
import "~/css/materialize.css";
import "~/css/plyr.css";
import "~/css/quill.snow.css";
import "~/css/xabber.css";
import "~/node_modules/magnific-popup/dist/magnific-popup.css";
import "~/node_modules/perfect-scrollbar/dist/css/perfect-scrollbar.css";
import "strophe.stream-management";
import "strophe.disco";
import "strophe.ping";
import "strophe.rsm";
import "strophe.caps";
import "strophe.pubsub";
import "omemo";
import "backbone.localsync";
import "materialize";
import "perfectScrollbarJQuery";

// Parse XML strings at runtime (replaces webpack xml-loader which returns JS objects)
function parseXmlToObj(xmlStr) {
    var doc = new DOMParser().parseFromString(xmlStr, "text/xml");
    function nodeToObj(node) {
        var obj = {};
        for (var i = 0; i < node.childNodes.length; i++) {
            var child = node.childNodes[i];
            if (child.nodeType !== 1) continue;
            var val = child.children.length > 0 ? nodeToObj(child) : child.textContent;
            if (obj[child.tagName]) {
                if (!Array.isArray(obj[child.tagName])) obj[child.tagName] = [obj[child.tagName]];
                obj[child.tagName].push(val);
            } else {
                obj[child.tagName] = val;
            }
        }
        return obj;
    }
    var root = doc.documentElement;
    var result = {};
    result[root.tagName] = nodeToObj(root);
    return result;
}
var backgroundImagesXml = parseXmlToObj(bgImagesXmlRaw);
var backgroundPatternsXml = parseXmlToObj(bgPatternsXmlRaw);

export default _.extend({
    $: $,
    _: _,
    moment: moment,
    Backbone: Backbone,
    WaveSurfer: WaveSurfer,
    Plyr: plyr,
    Quill: Quill,
    libsignal: libsignal,
    slug: slug,
    sha1: sha1,
    stropheSHA1: stropheSHA1,
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
    Strophe: _.extend(Strophe, {
        $build, $iq, $msg, $pres, Builder, Request, Stanza, stx, toStanza
    }),
}, Strophe, stropheSHA1);
