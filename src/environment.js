// expands dependencies with internal xabber modules
define([
    "xabber-dependencies",
    "xabber-constants",
    "xabber-templates",
    "xabber-utils",
    "xabber-default-lang",
    "xabber-translations-info",
    "xabber-version"
], function(deps, constants, templates, utils, default_translation, client_translation_progress, version) {
    return _.extend({
        constants: constants,
        templates: templates,
        default_translation: default_translation,
        client_translation_progress: client_translation_progress,
        utils: utils,
        uuid: utils.uuid
    }, version, deps);
});
