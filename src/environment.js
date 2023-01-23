// expands dependencies with internal xabber modules
import deps from "xabber-dependencies";
import constants from "xabber-constants";
import templates from "xabber-templates";
import utils from "xabber-utils";
import client_translation_progress from "xabber-translations-info";
import version from "xabber-version";
import _ from "underscore";

export default _.extend({
    constants: constants,
    templates: templates,
    client_translation_progress: client_translation_progress,
    utils: utils,
    uuid: utils.uuid
}, version, deps);