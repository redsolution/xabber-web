import { createApp, markRaw } from 'vue';
import { XABBER_KEY } from './composables/useXabber.js';

export const VIEW_EL_KEY = Symbol('viewEl');

export function createVueBackboneView(xabber, options) {
    const { component, className, props, setup, extend } = options;
    return xabber.BasicView.extend(Object.assign({
        className: className || '',
        template: function () { return ''; },
        _initialize: function (viewOptions) {
            // Mark the Backbone view as non-reactive so Vue never deep-proxies it.
            // This prevents infinite recursion when backboneView is stored in
            // setup state (via setBackboneView) and has _vueInstance back-reference.
            markRaw(this);
            const rawProps = props ? props(this, viewOptions) : {};
            // Mark complex prop values (Backbone models, etc.) as non-reactive
            for (const key in rawProps) {
                if (rawProps[key] && typeof rawProps[key] === 'object') {
                    markRaw(rawProps[key]);
                }
            }
            this._vueApp = createApp(component, rawProps);
            this._vueApp.provide(XABBER_KEY, markRaw(xabber));
            this._vueApp.provide(VIEW_EL_KEY, markRaw(this.$el));
            // Prevent Vue DEV mode from rethrowing DOM errors during
            // mixed Backbone/Vue lifecycle (e.g. unmount of detached nodes)
            this._vueApp.config.errorHandler = function () {};
            setup && setup(this._vueApp, this);
            this._vueInstance = this._vueApp.mount(this.$el[0]);
            this._vueInit && this._vueInit(viewOptions);
        },
        render: function () { return this; },
        onShow: function () { this._vueInstance?.onShow?.(...arguments); },
        onHide: function () { this._vueInstance?.onHide?.(...arguments); },
        remove: function () {
            // Skip Vue unmount — Backbone's remove() already destroys the
            // DOM element. Calling unmount() on a container whose nodes have
            // been manipulated by Backbone/jQuery causes "nextSibling null"
            // crashes in Vue's fragment walker. Nulling refs is enough for GC.
            this._vueApp = null;
            this._vueInstance = null;
            return xabber.BasicView.prototype.remove.call(this);
        }
    }, extend || {}));
}
