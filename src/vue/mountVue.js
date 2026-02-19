import { createApp } from 'vue';
import { XABBER_KEY } from './composables/useXabber.js';

export const VIEW_EL_KEY = Symbol('viewEl');

export function createVueBackboneView(xabber, options) {
    const { component, className, props, setup, extend } = options;
    return xabber.BasicView.extend(Object.assign({
        className: className || '',
        template: function () { return ''; },
        _initialize: function (viewOptions) {
            this._vueApp = createApp(component, props ? props(this, viewOptions) : {});
            this._vueApp.provide(XABBER_KEY, xabber);
            this._vueApp.provide(VIEW_EL_KEY, this.$el);
            setup && setup(this._vueApp, this);
            this._vueInstance = this._vueApp.mount(this.$el[0]);
            this._vueInit && this._vueInit(viewOptions);
        },
        render: function () { return this; },
        onShow: function () { this._vueInstance?.onShow?.(...arguments); },
        onHide: function () { this._vueInstance?.onHide?.(...arguments); },
        remove: function () {
            this._vueApp && this._vueApp.unmount();
            return xabber.BasicView.prototype.remove.call(this);
        }
    }, extend || {}));
}
