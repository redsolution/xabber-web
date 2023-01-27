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

export default {
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
};
