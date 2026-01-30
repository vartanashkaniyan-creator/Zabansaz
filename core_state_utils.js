export const STATE_UTILS_CONTRACT = {
    name: 'state-utils',
    version: '1.0.0',
    deepMerge: 'function',
    deepClone: 'function',
    diff: 'function',
    validateSchema: 'function'
};

export class StateUtils {
    #eventBus;
    #validator;

    constructor({ eventBus, validator }) {
        this.#eventBus = eventBus;
        this.#validator = validator;
    }

    deepMerge(target, ...sources) {
        const result = this.deepClone(target);
        
        for (const source of sources) {
            for (const [key, value] of Object.entries(source)) {
                if (this.#isObject(value) && this.#isObject(result[key])) {
                    result[key] = this.deepMerge(result[key], value);
                } else if (Array.isArray(value) && Array.isArray(result[key])) {
                    result[key] = [...result[key], ...value];
                } else {
                    result[key] = this.deepClone(value);
                }
            }
        }
        
        this.#eventBus.emit('utils:mergeCompleted');
        return result;
    }

    deepClone(obj) {
        if (obj === null || typeof obj !== 'object') return obj;
        if (obj instanceof Date) return new Date(obj);
        if (obj instanceof Map) return new Map(obj);
        if (obj instanceof Set) return new Set(obj);
        
        const cloned = Array.isArray(obj) ? [] : {};
        for (const key in obj) {
            cloned[key] = this.deepClone(obj[key]);
        }
        return cloned;
    }
}
