import { shallowRef, triggerRef, onUnmounted } from 'vue';

export function useBackboneCollection(collection) {
    const items = shallowRef([...collection.models]);
    const sync = () => { items.value = [...collection.models]; triggerRef(items); };
    collection.on('add remove reset sort', sync);
    onUnmounted(() => collection.off('add remove reset sort', sync));
    return { items };
}
