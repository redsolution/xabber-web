// expands dependencies with internal xabber modules
define([
    "xabber-dependencies",
    "xabber-constants",
    "xabber-templates",
    "xabber-utils",
    "xabber-default-lang",
    "xabber-version"
], function(deps, constants, templates, utils, default_translation, version) {
    return _.extend({
        constants: constants,
        templates: templates,
        default_translation: default_translation,
        utils: utils,
        uuid: utils.uuid
    }, version, deps);
});
