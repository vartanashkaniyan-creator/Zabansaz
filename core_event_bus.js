/**
 * HyperLang - Event-Driven Communication System
 * Version: 1.0.0
 * Principle: Event-Driven Communication
 */

import { CONFIG } from './config.js';

// Event Contract/Interface
export const EVENT_CONTRACT = {
    name: 'string',
    version: 'string',
    data: 'object?',
    timestamp: 'number',
    source: 'string?',
    metadata: 'object?'
};

export class EventBus {
    constructor(config = {}) {
        this.config = {
            maxListeners: config.maxListeners || CONFIG.EVENTS.MAX_LISTENERS,
            logEvents: config.logEvents || CONFIG.EVENTS.LOG_EVENTS,
            persistEvents: config.persistEvents || CONFIG.EVENTS.PERSIST_EVENTS,
            ...config
        };
        
        this.listeners = new Map();
        this.onceListeners = new Map();
        this.eventHistory = [];
        this.middlewares = [];
        
        if (this.config.persistEvents) {
            this.setupPersistence();
        }
    }
    
    // ==================== CORE METHODS ====================
    
    on(eventName, callback, options = {}) {
        this.validateEventName(eventName);
        this.validateCallback(callback);
        
        if (!this.listeners.has(eventName)) {
            this.listeners.set(eventName, []);
        }
        
        const listeners = this.listeners.get(eventName);
        if (listeners.length >= this.config.maxListeners) {
            throw new Error(`Maximum listeners (${this.config.maxListeners}) exceeded for event: ${eventName}`);
        }
        
        const listener = {
            id: this.generateId(),
            callback,
            priority: options.priority || 0,
            context: options.context || null,
            once: false
        };
        
        listeners.push(listener);
        listeners.sort((a, b) => b.priority - a.priority);
        
        return () => this.off(eventName, listener.id);
    }
    
    once(eventName, callback, options = {}) {
        const unsubscribe = this.on(eventName, (...args) => {
            unsubscribe();
            return callback(...args);
        }, options);
        
        return unsubscribe;
    }
    
    emit(eventName, data = {}, metadata = {}) {
        this.validateEventName(eventName);
        
        // Run middlewares before emission
        const processed = this.runMiddlewares('before', {
            eventName,
            data,
            metadata,
            timestamp: Date.now()
        });
        
        const event = {
            name: processed.eventName,
            version: '1.0.0',
            data: processed.data,
            timestamp: processed.timestamp,
            source: metadata.source || 'system',
            metadata: {
                ...metadata,
                processedAt: Date.now(),
                emitterId: this.getId()
            }
        };
        
        // Validate event against contract
        this.validateEvent(event);
        
        // Log event if enabled
        if (this.config.logEvents) {
            this.logEvent(event);
        }
        
        // Execute listeners
        const results = this.executeListeners(event);
        
        // Run middlewares after emission
        this.runMiddlewares('after', { event, results });
        
        // Store in history
        this.storeInHistory(event);
        
        return {
            event,
            results,
            listenerCount: this.getListenerCount(eventName)
        };
    }
    
    off(eventName, listenerId) {
        if (!this.listeners.has(eventName)) return false;
        
        const listeners = this.listeners.get(eventName);
        const initialLength = listeners.length;
        
        this.listeners.set(
            eventName,
            listeners.filter(listener => listener.id !== listenerId)
        );
        
        return listeners.length !== initialLength;
    }
    
    removeAllListeners(eventName = null) {
        if (eventName) {
            this.listeners.delete(eventName);
        } else {
            this.listeners.clear();
        }
    }
    
    // ==================== ADVANCED FEATURES ====================
    
    async emitAsync(eventName, data = {}, metadata = {}) {
        const event = {
            name: eventName,
            version: '1.0.0',
            data,
            timestamp: Date.now(),
            source: metadata.source || 'system',
            metadata
        };
        
        const listeners = this.listeners.get(eventName) || [];
        const promises = listeners.map(async listener => {
            try {
                return await listener.callback.call(listener.context, event);
            } catch (error) {
                console.error(`Listener error for event ${eventName}:`, error);
                return { error: error.message };
            }
        });
        
        const results = await Promise.allSettled(promises);
        
        return {
            event,
            results: results.map((result, index) => ({
                listenerId: listeners[index]?.id,
                status: result.status,
                value: result.value,
                reason: result.reason
            }))
        };
    }
    
    pipe(fromEvent, toEvent, transformer = data => data) {
        return this.on(fromEvent, (event) => {
            this.emit(toEvent, transformer(event.data), {
                ...event.metadata,
                pipedFrom: fromEvent,
                originalEvent: event
            });
        });
    }
    
    waitFor(eventName, timeout = 30000) {
        return new Promise((resolve, reject) => {
            const timer = timeout > 0 ? setTimeout(() => {
                unsubscribe();
                reject(new Error(`Timeout waiting for event: ${eventName}`));
            }, timeout) : null;
            
            const unsubscribe = this.once(eventName, (event) => {
                if (timer) clearTimeout(timer);
                resolve(event);
            });
        });
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
    
    runMiddlewares(phase, context) {
        return this.middlewares.reduce((ctx, middleware) => {
            try {
                return middleware(phase, ctx) || ctx;
            } catch (error) {
                console.error('Middleware error:', error);
                return ctx;
            }
        }, context);
    }
    
    // ==================== VALIDATION ====================
    
    validateEventName(eventName) {
        if (typeof eventName !== 'string' || !eventName.trim()) {
            throw new Error('Event name must be a non-empty string');
        }
        
        if (!/^[a-z0-9_:.-]+$/i.test(eventName)) {
            throw new Error('Event name can only contain letters, numbers, underscores, dots, and hyphens');
        }
        
        return true;
    }
    
    validateCallback(callback) {
        if (typeof callback !== 'function') {
            throw new Error('Callback must be a function');
        }
        return true;
    }
    
    validateEvent(event) {
        const required = ['name', 'version', 'timestamp'];
        const missing = required.filter(field => !event[field]);
        
        if (missing.length > 0) {
            throw new Error(`Event missing required fields: ${missing.join(', ')}`);
        }
        
        // Check against contract
        for (const [field, type] of Object.entries(EVENT_CONTRACT)) {
            if (type.endsWith('?') && event[field] === undefined) continue;
            
            const cleanType = type.replace('?', '');
            const value = event[field];
            
            if (value === undefined) {
                throw new Error(`Event missing required field: ${field}`);
            }
            
            if (cleanType === 'string' && typeof value !== 'string') {
                throw new Error(`Event field ${field} must be a string`);
            }
            
            if (cleanType === 'number' && typeof value !== 'number') {
                throw new Error(`Event field ${field} must be a number`);
            }
            
            if (cleanType === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
                throw new Error(`Event field ${field} must be an object`);
            }
        }
        
        return true;
    }
    
    // ==================== UTILITY METHODS ====================
    
    getListenerCount(eventName = null) {
        if (eventName) {
            return (this.listeners.get(eventName) || []).length;
        }
        
        let total = 0;
        for (const listeners of this.listeners.values()) {
            total += listeners.length;
        }
        return total;
    }
    
    getEventNames() {
        return Array.from(this.listeners.keys());
    }
    
    getHistory(limit = 50) {
        return this.eventHistory.slice(-limit);
    }
    
    clearHistory() {
        this.eventHistory = [];
    }
    
    // ==================== PRIVATE METHODS ====================
    
    generateId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    getId() {
        return 'event_bus_' + this.config.instanceId || 'default';
    }
    
    logEvent(event) {
        const logEntry = {
            timestamp: new Date().toISOString(),
            event: event.name,
            data: this.config.logEvents === 'full' ? event.data : '[REDACTED]',
            source: event.source,
            listenerCount: this.getListenerCount(event.name)
        };
        
        console.groupCollapsed(`📡 Event: ${event.name}`);
        console.log('Details:', logEntry);
        console.groupEnd();
    }
    
    storeInHistory(event) {
        this.eventHistory.push({
            ...event,
            storedAt: Date.now(),
            listenerCount: this.getListenerCount(event.name)
        });
        
        // Keep history size manageable
        if (this.eventHistory.length > 1000) {
            this.eventHistory = this.eventHistory.slice(-500);
        }
    }
    
    executeListeners(event) {
        const listeners = this.listeners.get(event.name) || [];
        const results = [];
        
        for (const listener of listeners) {
            try {
                const result = listener.callback.call(listener.context, event);
                results.push({
                    listenerId: listener.id,
                    success: true,
                    result,
                    timestamp: Date.now()
                });
            } catch (error) {
                results.push({
                    listenerId: listener.id,
                    success: false,
                    error: error.message,
                    timestamp: Date.now()
                });
                
                // Emit error event for global error handling
                this.emit('event:error', {
                    eventName: event.name,
                    listenerId: listener.id,
                    error: error.message,
                    stack: error.stack
                }, { source: 'event-bus' });
            }
        }
        
        return results;
    }
    
    setupPersistence() {
        // Load persisted events
        try {
            const stored = localStorage.getItem('hyperlang_events');
            if (stored) {
                this.eventHistory = JSON.parse(stored);
            }
        } catch (error) {
            console.warn('Failed to load persisted events:', error);
        }
        
        // Auto-save events
        setInterval(() => {
            try {
                localStorage.setItem('hyperlang_events', 
                    JSON.stringify(this.eventHistory.slice(-100)));
            } catch (error) {
                console.warn('Failed to persist events:', error);
            }
        }, 30000);
    }
}

// Singleton instance with default configuration
export const eventBus = new EventBus();

// Export for global use
if (typeof window !== 'undefined') {
    window.eventBus = eventBus;
}

export default eventBus;
