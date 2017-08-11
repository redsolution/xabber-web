// expands dependencies with internal xabber modules
define([
    "xabber-dependencies",
    "xabber-constants",
    "xabber-templates",
    "xabber-utils",
    "xabber-version"
], function(deps, constants, templates, utils, version) {
    return _.extend({
        constants: constants,
        templates: templates,
        utils: utils,
        uuid: utils.uuid
    }, version, deps);
});
