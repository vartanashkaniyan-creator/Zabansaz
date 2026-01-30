export const STATE_DEBUG_CONTRACT = {
    name: 'state-debug',
    version: '1.0.0',
    enable: 'function',
    disable: 'function',
    logState: 'function',
    trackMutation: 'function'
};

export class StateDebug {
    #eventBus;
    #logger;
    #isEnabled = false;
    #mutationLog = [];
    #performanceMetrics = new Map();

    constructor({ eventBus, logger, config }) {
        this.#eventBus = eventBus;
        this.#logger = logger;
        this.#config = config;
        this.#setupDebugHooks();
    }

    enable() {
        this.#isEnabled = true;
        this.#eventBus.emit('debug:enabled');
        this.#logger.info('State debugging enabled');
    }

    logState(state, label = 'State') {
        if (!this.#isEnabled) return;
        
        const snapshot = {
            timestamp: Date.now(),
            label,
            state: this.#safeClone(state),
            memoryUsage: performance.memory?.usedJSHeapSize,
            stackTrace: new Error().stack
        };
        
        this.#mutationLog.push(snapshot);
        this.#eventBus.emit('debug:stateLogged', snapshot);
    }

    trackMutation(previous, current, mutation) {
        if (!this.#isEnabled) return;
        
        const diff = this.#calculateDiff(previous, current);
        this.#performanceMetrics.set(Date.now(), {
            duration: performance.now(),
            mutationType: mutation.type,
            diffSize: JSON.stringify(diff).length
        });
    }

    #setupDebugHooks() {
        this.#eventBus.on('state:mutated', (data) => {
            this.trackMutation(data.previous, data.current, data.mutation);
        });
    }
}
