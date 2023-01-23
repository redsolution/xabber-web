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
import Map from 'ol/Map';
import View from 'ol/View';
import TileLayer from 'ol/layer/Tile';
import {defaults} from 'ol/interaction/defaults';
import OSM from 'ol/source/OSM';
import * as olProj from 'ol/proj';
import Placemark from 'ol-ext/overlay/Placemark';
import Control from 'ol/control/Control';
import VectorLayer from 'ol/layer/Vector';
import VectorSource from 'ol/source/Vector';
import CircleStyle from 'ol/style/Circle';
import Style from 'ol/style/Style';
import Stroke from 'ol/style/Stroke';
import Fill from 'ol/style/Fill';
import SearchNominatim from 'ol-ext/control/SearchNominatim';
import GeoJSON from 'ol/format/GeoJSON';
import * as olExtent from 'ol/extent';
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
import "qrcode";
import "perfectScrollbarJQuery";

export default _.extend({
    $: $,
    _: _,
    ol: {
        Map: Map,
        View: View,
        TileLayer: TileLayer,
        extent: olExtent,
        control: {
            Control: Control,
            SearchNominatim: SearchNominatim,
        },
        interaction_defaults: defaults,
        proj: olProj,
        layer: {
            Tile: TileLayer,
            Vector: VectorLayer,
        },
        Overlay: {
            Placemark: Placemark,
        },
        source: {
            OSM: OSM,
            Vector: VectorSource,
        },
        style: {
            Circle: CircleStyle,
            Style: Style,
            Stroke: Stroke,
            Fill: Fill,
        },
        format: {
            GeoJSON: GeoJSON,
        },
    },
    moment: moment,
    WaveSurfer: WaveSurfer,
    Plyr: plyr,
    Quill: Quill,
    libsignal: libsignal,
    slug: slug,
    sha1: sha1,
    xabber_i18next: i18next,
    xabber_i18next_sprintf: i18next_sprintf,
    sha256: sha256,
    magnificPopup: magnificPopup,
    Strophe: Strophe
}, Strophe);
