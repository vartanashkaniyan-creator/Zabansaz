
/**
 * HYPERLANG CONTEXT PROVIDER - سیستم تزریق وابستگی متمرکز
 * اصل: پیکربندی متمرکز، قرارداد رابط
 * وابستگی: event-bus.js (برای تغییرات پیکربندی)
 */

class HyperContext {
    constructor(eventSystem = null) {
        this._services = new Map();
        this._configs = new Map();
        this._dependencies = new Map();
        this._initialized = false;
        
        this._eventSystem = eventSystem || {
            emit: () => {},
            on: () => () => {}
        };
        
        this._validationRules = new Map();
        this._lifecycleHooks = {
            beforeRegister: [],
            afterRegister: [],
            beforeResolve: [],
            afterResolve: []
        };
        
        Object.seal(this);
    }
    
    // ==================== SERVICE REGISTRATION ====================
    
    register(name, provider, options = {}) {
        this._runLifecycle('beforeRegister', { name, provider, options });
        
        this._validateRegistration(name, provider, options);
        
        const serviceMeta = {
            provider,
            type: options.type || this._detectType(provider),
            dependencies: options.dependencies || [],
            singleton: options.singleton ?? true,
            lazy: options.lazy ?? true,
            instance: null,
            initialized: false,
            config: Object.freeze({ ...options.config || {} })
        };
        
        this._services.set(name, serviceMeta);
        
        // Register dependencies
        for (const dep of serviceMeta.dependencies) {
            this._addDependency(dep, name);
        }
        
        this._runLifecycle('afterRegister', { name, meta: serviceMeta });
        
        this._eventSystem.emit('context:service:registered', { 
            name, 
            type: serviceMeta.type 
        });
        
        return this;
    }
    
    registerConfig(name, configData) {
        const normalizedConfig = this._normalizeConfig(configData);
        this._configs.set(name, Object.freeze(normalizedConfig));
        
        this._eventSystem.emit('context:config:updated', { name });
        return this;
    }
    
    // ==================== SERVICE RESOLUTION ====================
    
    resolve(name, options = {}) {
        this._runLifecycle('beforeResolve', { name, options });
        
        if (!this._services.has(name)) {
            throw new Error(`Service "${name}" not registered`);
        }
        
        const meta = this._services.get(name);
        
        // Singleton handling
        if (meta.singleton && meta.instance && meta.initialized) {
            this._runLifecycle('afterResolve', { name, instance: meta.instance });
            return meta.instance;
        }
        
        // Lazy loading
        if (meta.lazy && !meta.initialized) {
            meta.instance = this._instantiateService(meta);
            meta.initialized = true;
        }
        
        const instance = meta.instance || this._instantiateService(meta);
        
        if (meta.singleton) {
            meta.instance = instance;
            meta.initialized = true;
        }
        
        this._runLifecycle('afterResolve', { name, instance });
        
        return instance;
    }
    
    getConfig(name, defaultValue = null) {
        if (this._configs.has(name)) {
            return this._configs.get(name);
        }
        
        // Try to find config by pattern
        const pattern = new RegExp(`^${name}(\\.|\\[|$)`);
        for (const [key, value] of this._configs) {
            if (pattern.test(key)) {
                return value;
            }
        }
        
        return defaultValue;
    }
    
    // ==================== ADVANCED FEATURES ====================
    
    addValidationRule(serviceName, validator) {
        if (!this._validationRules.has(serviceName)) {
            this._validationRules.set(serviceName, []);
        }
        this._validationRules.get(serviceName).push(validator);
        return this;
    }
    
    addLifecycleHook(hookName, callback) {
        if (this._lifecycleHooks[hookName]) {
            this._lifecycleHooks[hookName].push(callback);
        }
        return this;
    }
    
    async initialize() {
        if (this._initialized) return;
        
        // Initialize non-lazy services
        for (const [name, meta] of this._services) {
            if (!meta.lazy && !meta.initialized) {
                await this.resolve(name);
            }
        }
        
        // Check for circular dependencies
        this._detectCircularDependencies();
        
        this._initialized = true;
        this._eventSystem.emit('context:initialized');
        
        return this;
    }
    
    getDependencyGraph() {
        const graph = {};
        for (const [service, deps] of this._dependencies) {
            graph[service] = Array.from(deps);
        }
        return graph;
    }
    
    hasService(name) {
        return this._services.has(name);
    }
    
    hasConfig(name) {
        return this._configs.has(name);
    }
    
    listServices() {
        return Array.from(this._services.keys());
    }
    
    listConfigs() {
        return Array.from(this._configs.keys());
    }
    
    // ==================== PRIVATE METHODS ====================
    
    _validateRegistration(name, provider, options) {
        if (this._services.has(name)) {
            throw new Error(`Service "${name}" already registered`);
        }
        
        if (typeof provider !== 'function' && typeof provider !== 'object') {
            throw new TypeError('Provider must be a function or object');
        }
        
        // Validate dependencies exist
        const deps = options.dependencies || [];
        for (const dep of deps) {
            if (!this._services.has(dep) && dep !== 'eventSystem' && dep !== 'context') {
                console.warn(`[Context] Dependency "${dep}" for service "${name}" not yet registered`);
            }
        }
    }
    
    _detectType(provider) {
        if (typeof provider === 'function') {
            if (provider.prototype && provider.prototype.constructor) {
                return 'class';
            }
            return 'factory';
        }
        return 'value';
    }
    
    _instantiateService(meta) {
        const deps = meta.dependencies.map(dep => {
            if (dep === 'eventSystem') return this._eventSystem;
            if (dep === 'context') return this;
            return this.resolve(dep);
        });
        
        let instance;
        
        switch (meta.type) {
            case 'class':
                instance = new meta.provider(...deps);
                break;
                
            case 'factory':
                instance = meta.provider(...deps);
                break;
                
            case 'value':
                instance = meta.provider;
                break;
                
            default:
                throw new Error(`Unknown service type: ${meta.type}`);
        }
        
        // Run validators
        if (this._validationRules.has(meta.name)) {
            const validators = this._validationRules.get(meta.name);
            for (const validator of validators) {
                if (!validator(instance)) {
                    throw new Error(`Service "${meta.name}" failed validation`);
                }
            }
        }
        
        return instance;
    }
    
    _addDependency(dependent, dependency) {
        if (!this._dependencies.has(dependency)) {
            this._dependencies.set(dependency, new Set());
        }
        this._dependencies.get(dependency).add(dependent);
    }
    
    _detectCircularDependencies() {
        const visited = new Set();
        const stack = new Set();
        
        const dfs = (service) => {
            if (stack.has(service)) {
                throw new Error(`Circular dependency detected: ${Array.from(stack).join(' -> ')} -> ${service}`);
            }
            
            if (visited.has(service)) return;
            
            visited.add(service);
            stack.add(service);
            
            const meta = this._services.get(service);
            if (meta) {
                for (const dep of meta.dependencies) {
                    if (dep !== 'eventSystem' && dep !== 'context') {
                        dfs(dep);
                    }
                }
            }
            
            stack.delete(service);
        };
        
        for (const service of this._services.keys()) {
            dfs(service);
        }
    }
    
    _normalizeConfig(configData) {
        if (typeof configData === 'function') {
            return configData(this);
        }
        return configData;
    }
    
    _runLifecycle(hookName, data) {
        if (!this._lifecycleHooks[hookName]) return;
        
        for (const hook of this._lifecycleHooks[hookName]) {
            try {
                hook(data);
            } catch (error) {
                console.error(`[Context] Lifecycle hook "${hookName}" error:`, error);
            }
        }
    }
}

// Singleton with optional event system injection
let globalContext = null;

function createContext(eventSystem = null) {
    if (!globalContext) {
        globalContext = new HyperContext(eventSystem);
    }
    return globalContext;
}

export { HyperContext, createContext };
