// expands dependencies with internal xabber modules
define([
    "xabber-dependencies",
    "xabber-constants",
    "xabber-templates",
    "xabber-utils",
    "xabber-translations",
    "xabber-version"
], function(deps, constants, templates, utils, translations, version) {
    return _.extend({
        constants: constants,
        templates: templates,
        translations: translations,
        utils: utils,
        uuid: utils.uuid
    }, version, deps);
});
