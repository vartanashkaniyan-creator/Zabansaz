/**
 * HyperLang - Dependency Injection Container
 * Version: 1.0.0
 * Principle: Dependency Injection
 */

import { CONFIG } from './config.js';

// Service Contract Interface
export const SERVICE_CONTRACT = {
    name: 'string',
    version: 'string',
    dependencies: 'array',
    instance: 'object',
    methods: 'array',
    lifecycle: 'object?'
};

export class ContextProvider {
    constructor(config = {}) {
        this.config = {
            autoInit: config.autoInit ?? true,
            lazyLoad: config.lazyLoad ?? true,
            validateContracts: config.validateContracts ?? true,
            debug: config.debug ?? CONFIG.APP.DEBUG,
            ...config
        };
        
        this.services = new Map();
        this.singletons = new Map();
        this.factories = new Map();
        this.dependencyGraph = new Map();
        this.middlewares = [];
        
        this.context = {
            config: CONFIG,
            env: process.env.NODE_ENV || 'development',
            isBrowser: typeof window !== 'undefined',
            isMobile: /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
                navigator?.userAgent || ''
            )
        };
        
        if (this.config.autoInit) {
            this.registerCoreServices();
        }
    }
    
    // ==================== SERVICE REGISTRATION ====================
    
    register(name, definition) {
        this.validateServiceName(name);
        
        if (this.services.has(name)) {
            throw new Error(`Service "${name}" is already registered`);
        }
        
        const service = {
            ...definition,
            name,
            registeredAt: Date.now(),
            initialized: false,
            instance: null
        };
        
        if (this.config.validateContracts) {
            this.validateServiceContract(service);
        }
        
        this.services.set(name, service);
        
        // Build dependency graph
        this.dependencyGraph.set(name, definition.dependencies || []);
        
        // Initialize immediately if not lazy
        if (!this.config.lazyLoad && definition.factory) {
            this.get(name);
        }
        
        return this;
    }
    
    registerSingleton(name, instance) {
        this.validateServiceName(name);
        
        if (this.singletons.has(name)) {
            throw new Error(`Singleton "${name}" is already registered`);
        }
        
        this.singletons.set(name, {
            instance,
            name,
            registeredAt: Date.now(),
            type: 'singleton'
        });
        
        return this;
    }
    
    registerFactory(name, factoryFn, dependencies = []) {
        this.validateServiceName(name);
        
        if (this.factories.has(name)) {
            throw new Error(`Factory "${name}" is already registered`);
        }
        
        this.factories.set(name, {
            factory: factoryFn,
            dependencies,
            name,
            registeredAt: Date.now(),
            type: 'factory'
        });
        
        return this;
    }
    
    // ==================== SERVICE RESOLUTION ====================
    
    get(name, options = {}) {
        const { forceNew = false, context = {} } = options;
        
        // Check singletons first
        if (!forceNew && this.singletons.has(name)) {
            return this.singletons.get(name).instance;
        }
        
        // Check factories
        if (this.factories.has(name)) {
            return this.resolveFactory(name, context);
        }
        
        // Check regular services
        if (!this.services.has(name)) {
            throw new Error(`Service "${name}" not found`);
        }
        
        const service = this.services.get(name);
        
        // Return cached instance if available and not forced
        if (!forceNew && service.initialized && service.instance) {
            return service.instance;
        }
        
        // Resolve dependencies
        const dependencies = this.resolveDependencies(service.dependencies || [], context);
        
        // Create instance
        let instance;
        if (service.factory) {
            instance = service.factory(...dependencies, this.context);
        } else if (service.class) {
            instance = new service.class(...dependencies);
        } else {
            throw new Error(`Service "${name}" has no factory or class defined`);
        }
        
        // Apply middlewares
        instance = this.applyMiddlewares('afterCreate', name, instance, dependencies);
        
        // Initialize if needed
        if (service.initialize && typeof service.initialize === 'function') {
            const initResult = service.initialize.call(instance, this.context);
            if (initResult && typeof initResult.then === 'function') {
                throw new Error(`Async initialization not supported for service "${name}"`);
            }
        }
        
        // Cache instance
        if (service.lifecycle === 'singleton' || service.lifecycle === undefined) {
            service.instance = instance;
            service.initialized = true;
        }
        
        return instance;
    }
    
    async getAsync(name, options = {}) {
        const service = this.services.get(name);
        if (!service) {
            throw new Error(`Service "${name}" not found`);
        }
        
        const dependencies = await this.resolveDependenciesAsync(service.dependencies || [], options.context || {});
        
        let instance;
        if (service.factory) {
            instance = service.factory(...dependencies, this.context);
        } else if (service.class) {
            instance = new service.class(...dependencies);
        }
        
        // Async initialization
        if (service.initialize && typeof service.initialize === 'function') {
            await service.initialize.call(instance, this.context);
        }
        
        return instance;
    }
    
    // ==================== DEPENDENCY RESOLUTION ====================
    
    resolveDependencies(dependencyNames, context = {}) {
        return dependencyNames.map(dep => {
            if (typeof dep === 'string') {
                return this.get(dep, { context });
            } else if (typeof dep === 'object' && dep.name) {
                return this.get(dep.name, { ...dep.options, context });
            } else {
                throw new Error(`Invalid dependency definition: ${dep}`);
            }
        });
    }
    
    async resolveDependenciesAsync(dependencyNames, context = {}) {
        const promises = dependencyNames.map(async dep => {
            if (typeof dep === 'string') {
                return this.getAsync(dep, { context });
            } else if (typeof dep === 'object' && dep.name) {
                return this.getAsync(dep.name, { ...dep.options, context });
            } else {
                throw new Error(`Invalid dependency definition: ${dep}`);
            }
        });
        
        return Promise.all(promises);
    }
    
    resolveFactory(name, context = {}) {
        const factory = this.factories.get(name);
        const dependencies = this.resolveDependencies(factory.dependencies, context);
        return factory.factory(...dependencies, this.context);
    }
    
    // ==================== CONTAINER MANAGEMENT ====================
    
    has(name) {
        return this.services.has(name) || 
               this.singletons.has(name) || 
               this.factories.has(name);
    }
    
    remove(name) {
        const removed = [];
        
        if (this.services.has(name)) {
            const service = this.services.get(name);
            if (service.cleanup && service.instance) {
                service.cleanup.call(service.instance);
            }
            this.services.delete(name);
            removed.push('service');
        }
        
        if (this.singletons.has(name)) {
            this.singletons.delete(name);
            removed.push('singleton');
        }
        
        if (this.factories.has(name)) {
            this.factories.delete(name);
            removed.push('factory');
        }
        
        this.dependencyGraph.delete(name);
        
        return removed.length > 0;
    }
    
    clear() {
        // Cleanup all services
        for (const service of this.services.values()) {
            if (service.cleanup && service.instance) {
                try {
                    service.cleanup.call(service.instance);
                } catch (error) {
                    console.error(`Cleanup error for service ${service.name}:`, error);
                }
            }
        }
        
        this.services.clear();
        this.singletons.clear();
        this.factories.clear();
        this.dependencyGraph.clear();
        this.middlewares = [];
    }
    
    // ==================== MIDDLEWARE SUPPORT ====================
    
    use(middleware) {
        if (typeof middleware !== 'function') {
            throw new Error('Middleware must be a function');
        }
        
        this.middlewares.push(middleware);
        return () => {
            const index = this.middlewares.indexOf(middleware);
            if (index > -1) this.middlewares.splice(index, 1);
        };
    }
    
    applyMiddlewares(phase, serviceName, instance, dependencies) {
        return this.middlewares.reduce((current, middleware) => {
            try {
                return middleware(phase, {
                    serviceName,
                    instance: current,
                    dependencies,
                    context: this.context
                }) || current;
            } catch (error) {
                console.error(`Middleware error for service ${serviceName}:`, error);
                return current;
            }
        }, instance);
    }
    
    // ==================== VALIDATION ====================
    
    validateServiceName(name) {
        if (typeof name !== 'string' || !name.trim()) {
            throw new Error('Service name must be a non-empty string');
        }
        
        if (!/^[a-z][a-z0-9_.-]*$/i.test(name)) {
            throw new Error('Service name must start with a letter and contain only alphanumeric characters, dots, hyphens, and underscores');
        }
        
        return true;
    }
    
    validateServiceContract(service) {
        const required = ['name'];
        const missing = required.filter(field => !service[field]);
        
        if (missing.length > 0) {
            throw new Error(`Service missing required fields: ${missing.join(', ')}`);
        }
        
        // Must have either factory or class
        if (!service.factory && !service.class) {
            throw new Error(`Service "${service.name}" must have either factory or class`);
        }
        
        // Validate dependencies
        if (service.dependencies && !Array.isArray(service.dependencies)) {
            throw new Error(`Service "${service.name}" dependencies must be an array`);
        }
        
        return true;
    }
    
    validateDependencyGraph() {
        const errors = [];
        const visited = new Set();
        const recursionStack = new Set();
        
        const detectCycle = (serviceName) => {
            if (recursionStack.has(serviceName)) {
                errors.push(`Circular dependency detected involving: ${serviceName}`);
                return true;
            }
            
            if (visited.has(serviceName)) return false;
            
            recursionStack.add(serviceName);
            visited.add(serviceName);
            
            const dependencies = this.dependencyGraph.get(serviceName) || [];
            for (const dep of dependencies) {
                const depName = typeof dep === 'string' ? dep : dep.name;
                if (depName && this.dependencyGraph.has(depName)) {
                    detectCycle(depName);
                }
            }
            
            recursionStack.delete(serviceName);
            return false;
        };
        
        for (const serviceName of this.dependencyGraph.keys()) {
            detectCycle(serviceName);
        }
        
        return {
            valid: errors.length === 0,
            errors,
            timestamp: new Date().toISOString()
        };
    }
    
    // ==================== UTILITY METHODS ====================
    
    getServices() {
        return Array.from(this.services.values()).map(s => ({
            name: s.name,
            type: s.class ? 'class' : 'factory',
            dependencies: s.dependencies || [],
            initialized: s.initialized,
            registeredAt: new Date(s.registeredAt).toISOString()
        }));
    }
    
    getSingletons() {
        return Array.from(this.singletons.values()).map(s => ({
            name: s.name,
            type: s.type,
            registeredAt: new Date(s.registeredAt).toISOString()
        }));
    }
    
    getFactories() {
        return Array.from(this.factories.values()).map(f => ({
            name: f.name,
            type: f.type,
            dependencies: f.dependencies,
            registeredAt: new Date(f.registeredAt).toISOString()
        }));
    }
    
    getDependencyGraph() {
        return Object.fromEntries(this.dependencyGraph);
    }
    
    // ==================== CORE SERVICES REGISTRATION ====================
    
    registerCoreServices() {
        // Register event bus
        this.register('eventBus', {
            factory: () => {
                const { eventBus } = require('./event-bus.js');
                return eventBus;
            },
            dependencies: [],
            lifecycle: 'singleton'
        });
        
        // Register config
        this.registerSingleton('config', CONFIG);
        
        // Register context provider itself (self-reference)
        this.registerSingleton('context', this);
        
        // Register logger
        this.register('logger', {
            factory: (eventBus) => {
                return {
                    log: (...args) => {
                        console.log(...args);
                        eventBus.emit('log:info', { args, timestamp: Date.now() });
                    },
                    error: (...args) => {
                        console.error(...args);
                        eventBus.emit('log:error', { args, timestamp: Date.now() });
                    },
                    warn: (...args) => {
                        console.warn(...args);
                        eventBus.emit('log:warn', { args, timestamp: Date.now() });
                    }
                };
            },
            dependencies: ['eventBus'],
            lifecycle: 'singleton'
        });
    }
    
    // ==================== LIFE CYCLE ====================
    
    async initializeAll() {
        const services = Array.from(this.services.values());
        const results = [];
        
        for (const service of services) {
            if (!service.initialized) {
                try {
                    const instance = this.get(service.name);
                    results.push({
                        service: service.name,
                        success: true,
                        instance
                    });
                } catch (error) {
                    results.push({
                        service: service.name,
                        success: false,
                        error: error.message
                    });
                }
            }
        }
        
        return results;
    }
    
    async cleanupAll() {
        const results = [];
        
        for (const service of this.services.values()) {
            if (service.cleanup && service.instance) {
                try {
                    await service.cleanup.call(service.instance);
                    results.push({
                        service: service.name,
                        success: true
                    });
                } catch (error) {
                    results.push({
                        service: service.name,
                        success: false,
                        error: error.message
                    });
                }
            }
        }
        
        return results;
    }
}

// Singleton instance
export const context = new ContextProvider();

// Export for global use
if (typeof window !== 'undefined') {
    window.diContext = context;
}

export default context;
