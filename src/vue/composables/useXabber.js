import { inject } from 'vue';

export const XABBER_KEY = Symbol('xabber');

export function useXabber() {
    return inject(XABBER_KEY);
}
