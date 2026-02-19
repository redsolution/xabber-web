import { ref, onUnmounted } from 'vue';

export function useBackboneModel(model, attrs) {
    const state = ref({ ...model.attributes });
    const onModelChange = () => { state.value = { ...model.attributes }; };

    if (attrs && attrs.length) {
        attrs.forEach(attr => model.on(`change:${attr}`, onModelChange));
    } else {
        model.on('change', onModelChange);
    }

    const set = (key, value) => model.set(key, value);

    onUnmounted(() => {
        if (attrs && attrs.length) {
            attrs.forEach(attr => model.off(`change:${attr}`, onModelChange));
        } else {
            model.off('change', onModelChange);
        }
    });

    return { state, set };
}
