
/**
 * HYPERLANG STATE MANAGER - سیستم مدیریت وضعیت پیشرفته
 * اصل: پیکربندی متمرکز، قرارداد رابط، معماری حرفه‌ای
 * وابستگی: event-bus.js (برای تغییرات state)
 */

class HyperStateManager {
    constructor(eventSystem, config = {}) {
        this._eventSystem = eventSystem;
        
        this._state = new Map();
        this._history = [];
        this._transactions = new Map();
        this._subscriptions = new Map();
        this._middlewares = [];
        
        this._config = Object.freeze({
            maxHistory: config.maxHistory || 100,
            enableHistory: config.enableHistory ?? true,
            enableMiddleware: config.enableMiddleware ?? true,
            strictMode: config.strictMode ?? false,
            defaultNamespace: config.defaultNamespace || 'global',
            ...config
        });
        
        this._validators = new Map();
        this._computedStates = new Map();
        this._snapshots = new Map();
        
        Object.seal(this._config);
        
        // Initialize default state
        this._initDefaultState();
    }
    
    // ==================== CORE STATE OPERATIONS ====================
    
    set(path, value, options = {}) {
        const normalizedPath = this._normalizePath(path);
        const namespace = options.namespace || this._config.defaultNamespace;
        const fullPath = `${namespace}.${normalizedPath}`;
        
        // Validation
        if (this._validators.has(fullPath)) {
            const isValid = this._validators.get(fullPath)(value);
            if (!isValid) {
                throw new Error(`Validation failed for path "${fullPath}"`);
            }
        }
        
        // Middleware processing
        if (this._config.enableMiddleware) {
            const middlewareResult = this._runMiddlewares('beforeSet', {
                path: fullPath,
                value,
                oldValue: this.get(path, { namespace })
            });
            
            if (middlewareResult.canceled) {
                return { success: false, reason: 'middleware_blocked' };
            }
            
            value = middlewareResult.value !== undefined ? middlewareResult.value : value;
        }
        
        // Transaction support
        const transactionId = options.transactionId;
        if (transactionId) {
            if (!this._transactions.has(transactionId)) {
                this._transactions.set(transactionId, []);
            }
            this._transactions.get(transactionId).push({
                path: fullPath,
                oldValue: this.get(path, { namespace }),
                newValue: value
            });
        }
        
        // Get old value for history
        const oldValue = this._getStateValue(fullPath);
        
        // Update state
        this._setStateValue(fullPath, value);
        
        // Update computed states
        this._updateComputedStates(fullPath, value);
        
        // Add to history
        if (this._config.enableHistory) {
            this._addToHistory(fullPath, oldValue, value, options);
        }
        
        // Notify subscribers
        this._notifySubscribers(fullPath, value, oldValue);
        
        // Emit event
        this._eventSystem.emit('state:changed', {
            path: fullPath,
            value,
            oldValue,
            namespace,
            source: options.source || 'direct'
        });
        
        return { 
            success: true, 
            path: fullPath, 
            oldValue, 
            newValue: value 
        };
    }
    
    get(path, options = {}) {
        const normalizedPath = this._normalizePath(path);
        const namespace = options.namespace || this._config.defaultNamespace;
        const fullPath = `${namespace}.${normalizedPath}`;
        
        // Check computed state first
        if (this._computedStates.has(fullPath)) {
            return this._computedStates.get(fullPath).value;
        }
        
        return this._getStateValue(fullPath);
    }
    
    update(path, updater, options = {}) {
        const currentValue = this.get(path, options);
        const newValue = typeof updater === 'function' 
            ? updater(currentValue) 
            : { ...currentValue, ...updater };
        
        return this.set(path, newValue, options);
    }
    
    delete(path, options = {}) {
        const normalizedPath = this._normalizePath(path);
        const namespace = options.namespace || this._config.defaultNamespace;
        const fullPath = `${namespace}.${normalizedPath}`;
        
        const oldValue = this._getStateValue(fullPath);
        
        // Remove from state
        this._deleteStateValue(fullPath);
        
        // Remove computed states
        this._computedStates.delete(fullPath);
        
        // Notify subscribers
        this._notifySubscribers(fullPath, undefined, oldValue);
        
        // Emit event
        this._eventSystem.emit('state:deleted', {
            path: fullPath,
            oldValue,
            namespace
        });
        
        return { success: true, path: fullPath, oldValue };
    }
    
    // ==================== ADVANCED FEATURES ====================
    
    subscribe(path, callback, options = {}) {
        const normalizedPath = this._normalizePath(path);
        const namespace = options.namespace || this._config.defaultNamespace;
        const fullPath = `${namespace}.${normalizedPath}`;
        
        const subscriptionId = Symbol(`sub_${Date.now()}`);
        
        if (!this._subscriptions.has(fullPath)) {
            this._subscriptions.set(fullPath, new Map());
        }
        
        this._subscriptions.get(fullPath).set(subscriptionId, {
            callback,
            options: {
                immediate: options.immediate ?? false,
                deep: options.deep ?? false,
                ...options
            }
        });
        
        // Immediate callback if requested
        if (options.immediate) {
            try {
                callback(this.get(path, { namespace }), undefined, fullPath);
            } catch (error) {
                console.error('[StateManager] Immediate subscription error:', error);
            }
        }
        
        return () => {
            const pathSubs = this._subscriptions.get(fullPath);
            if (pathSubs) {
                pathSubs.delete(subscriptionId);
                if (pathSubs.size === 0) {
                    this._subscriptions.delete(fullPath);
                }
            }
        };
    }
    
    computed(path, computer, options = {}) {
        const normalizedPath = this._normalizePath(path);
        const namespace = options.namespace || this._config.defaultNamespace;
        const fullPath = `${namespace}.${normalizedPath}`;
        
        const computedState = {
            computer,
            dependencies: options.dependencies || [],
            value: null,
            cache: options.cache ?? true
        };
        
        // Compute initial value
        computedState.value = this._computeValue(computedState);
        
        this._computedStates.set(fullPath, computedState);
        
        // Subscribe to dependencies
        for (const dep of computedState.dependencies) {
            this.subscribe(dep, () => {
                computedState.value = this._computeValue(computedState);
                this._notifySubscribers(fullPath, computedState.value);
            }, { namespace: options.namespace });
        }
        
        return computedState.value;
    }
    
    transaction(callback) {
        const transactionId = Symbol(`tx_${Date.now()}`);
        this._transactions.set(transactionId, []);
        
        try {
            const result = callback(transactionId);
            this._commitTransaction(transactionId);
            return { success: true, result };
        } catch (error) {
            this._rollbackTransaction(transactionId);
            return { success: false, error };
        }
    }
    
    snapshot(name = `snapshot_${Date.now()}`) {
        const snapshot = {
            timestamp: Date.now(),
            state: this._serializeState(),
            name
        };
        
        this._snapshots.set(name, snapshot);
        
        // Emit event
        this._eventSystem.emit('state:snapshot:created', { name, snapshot });
        
        return name;
    }
    
    restore(snapshotName) {
        if (!this._snapshots.has(snapshotName)) {
            throw new Error(`Snapshot "${snapshotName}" not found`);
        }
        
        const snapshot = this._snapshots.get(snapshotName);
        this._restoreState(snapshot.state);
        
        // Emit event
        this._eventSystem.emit('state:snapshot:restored', { name: snapshotName });
        
        return { success: true, name: snapshotName };
    }
    
    use(middleware) {
        if (typeof middleware !== 'function') {
            throw new TypeError('Middleware must be a function');
        }
        
        this._middlewares.push(middleware);
        return () => {
            this._middlewares = this._middlewares.filter(m => m !== middleware);
        };
    }
    
    addValidator(path, validator) {
        const normalizedPath = this._normalizePath(path);
        const fullPath = `${this._config.defaultNamespace}.${normalizedPath}`;
        
        if (!this._validators.has(fullPath)) {
            this._validators.set(fullPath, []);
        }
        
        this._validators.get(fullPath).push(validator);
        return this;
    }
    
    // ==================== UTILITY METHODS ====================
    
    getAllState(namespace = null) {
        const result = {};
        
        for (const [key, value] of this._state) {
            if (namespace && !key.startsWith(`${namespace}.`)) continue;
            
            const parts = key.split('.');
            let current = result;
            
            for (let i = 0; i < parts.length - 1; i++) {
                if (!current[parts[i]]) {
                    current[parts[i]] = {};
                }
                current = current[parts[i]];
            }
            
            current[parts[parts.length - 1]] = value;
        }
        
        return result;
    }
    
    getHistory(limit = 50) {
        return this._history.slice(-limit);
    }
    
    clearHistory() {
        this._history = [];
        return this;
    }
    
    getSnapshotNames() {
        return Array.from(this._snapshots.keys());
    }
    
    // ==================== PRIVATE METHODS ====================
    
    _initDefaultState() {
        this.set('initialized', false, { 
            namespace: 'system',
            source: 'init' 
        });
        
        this.set('lastUpdated', Date.now(), {
            namespace: 'system',
            source: 'init'
        });
    }
    
    _normalizePath(path) {
        if (Array.isArray(path)) {
            return path.join('.');
        }
        
        if (typeof path !== 'string') {
            throw new TypeError('Path must be string or array');
        }
        
        return path.replace(/\[(\w+)\]/g, '.$1').replace(/^\.+|\.+$/g, '');
    }
    
    _getStateValue(fullPath) {
        const parts = fullPath.split('.');
        let current = this._state;
        
        for (const part of parts) {
            if (!current.has(part)) {
                return undefined;
            }
            current = current.get(part);
        }
        
        return current;
    }
    
    _setStateValue(fullPath, value) {
        const parts = fullPath.split('.');
        let current = this._state;
        
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!current.has(part)) {
                current.set(part, new Map());
            }
            current = current.get(part);
        }
        
        const lastPart = parts[parts.length - 1];
        current.set(lastPart, value);
    }
    
    _deleteStateValue(fullPath) {
        const parts = fullPath.split('.');
        let current = this._state;
        
        for (let i = 0; i < parts.length - 1; i++) {
            const part = parts[i];
            if (!current.has(part)) return false;
            current = current.get(part);
        }
        
        const lastPart = parts[parts.length - 1];
        return current.delete(lastPart);
    }
    
    _addToHistory(path, oldValue, newValue, options) {
        const historyEntry = {
            timestamp: Date.now(),
            path,
            oldValue,
            newValue,
            source: options.source || 'direct',
            namespace: options.namespace
        };
        
        this._history.push(historyEntry);
        
        // Trim history if too long
        if (this._history.length > this._config.maxHistory) {
            this._history.shift();
        }
        
        // Update lastUpdated
        this.update('lastUpdated', Date.now(), { 
            namespace: 'system',
            source: 'history' 
        });
    }
    
    _notifySubscribers(path, newValue, oldValue) {
        if (!this._subscriptions.has(path)) return;
        
        const subscribers = this._subscriptions.get(path);
        
        for (const [id, config] of subscribers) {
            try {
                config.callback(newValue, oldValue, path);
            } catch (error) {
                console.error('[StateManager] Subscriber error:', error);
            }
        }
    }
    
    _runMiddlewares(phase, data) {
        let result = { canceled: false, value: data.value };
        
        for (const middleware of this._middlewares) {
            try {
                const middlewareResult = middleware(phase, data, result);
                if (middlewareResult === false) {
                    return { canceled: true, reason: 'middleware_blocked' };
                }
                if (middlewareResult && middlewareResult.value !== undefined) {
                    result.value = middlewareResult.value;
                }
            } catch (error) {
                console.error('[StateManager] Middleware error:', error);
                if (this._config.strictMode) throw error;
            }
        }
        
        return result;
    }
    
    _updateComputedStates(changedPath, newValue) {
        for (const [path, computed] of this._computedStates) {
            if (computed.dependencies.includes(changedPath)) {
                computed.value = this._computeValue(computed);
                this._notifySubscribers(path, computed.value);
            }
        }
    }
    
    _computeValue(computedState) {
        try {
            const depsValues = computedState.dependencies.map(dep => 
                this.get(dep.replace(/^[^.]+\./, ''), { 
                    namespace: dep.split('.')[0] 
                })
            );
            
            return computedState.computer(...depsValues);
        } catch (error) {
            console.error('[StateManager] Computed state error:', error);
            return null;
        }
    }
    
    _commitTransaction(transactionId) {
        const changes = this._transactions.get(transactionId) || [];
        
        for (const change of changes) {
            this._eventSystem.emit('state:transaction:committed', change);
        }
        
        this._transactions.delete(transactionId);
    }
    
    _rollbackTransaction(transactionId) {
        const changes = this._transactions.get(transactionId) || [];
        
        // Rollback in reverse order
        for (let i = changes.length - 1; i >= 0; i--) {
            const change = changes[i];
            this.set(change.path, change.oldValue, { 
                source: 'rollback',
                silent: true 
            });
            
            this._eventSystem.emit('state:transaction:rolledback', change);
        }
        
        this._transactions.delete(transactionId);
    }
    
    _serializeState() {
        const serializeMap = (map) => {
            const obj = {};
            for (const [key, value] of map) {
                obj[key] = value instanceof Map ? serializeMap(value) : value;
            }
            return obj;
        };
        
        return serializeMap(this._state);
    }
    
    _restoreState(serializedState) {
        const restoreMap = (obj) => {
            const map = new Map();
            for (const [key, value] of Object.entries(obj)) {
                map.set(key, 
                    value && typeof value === 'object' && !Array.isArray(value) 
                        ? restoreMap(value) 
                        : value
                );
            }
            return map;
        };
        
        this._state = restoreMap(serializedState);
        
        // Notify all subscribers
        for (const [path] of this._subscriptions) {
            this._notifySubscribers(path, this.get(path));
        }
    }
}

export { HyperStateManager };
