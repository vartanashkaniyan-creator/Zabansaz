const listeners = new Map();
export const eventBus = {
    on: (e, cb) => listeners.set(e, [...(listeners.get(e)||[]), cb]),
    emit: (e, data) => listeners.get(e)?.forEach(cb => cb(data))
};
console.log('EventBus loaded');
