/**
 * VAKAMOVA CONFIGURATION CORE - سیستم پیکربندی متمرکز پیشرفته
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * وابستگی: event_bus.js (برای انتشار رویدادهای تغییرات)
 */

class VakamovaConfig {
    constructor(eventSystem = null) {
        // ==================== DEPENDENCY INJECTION ====================
        this._eventSystem = eventSystem || {
            emit: () => console.warn('[Config] EventBus not injected'),
            on: () => () => {}
        };
        
        // ==================== CENTRALIZED CONFIG STORES ====================
        this._configStores = new Map();
        this._schemas = new Map();
        this._validators = new Map();
        this._changeHistory = [];
        this._subscriptions = new Map();
        
        // ==================== INTERFACE CONTRACT ====================
        this.INTERFACE = Object.freeze({
            GET: 'get',
            SET: 'set',
            MERGE: 'merge',
            DELETE: 'delete',
            RESET: 'reset',
            VALIDATE: 'validate',
            SUBSCRIBE: 'subscribe',
            EXPORT: 'export',
            IMPORT: 'import'
        });
        
        // ==================== INITIALIZE STORES ====================
        this._initStores();
        this._initEventListeners();
        
        Object.seal(this);
    }
    
    // ==================== INITIALIZATION ====================
    _initStores() {
        // Store 1: App Configuration
        this._configStores.set('app', new Map([
            ['name', 'Vakamova'],
            ['version', '1.0.0'],
            ['environment', 'development'],
            ['debug', true],
            ['logLevel', 'info'],
            ['supportedLanguages', ['en', 'fa', 'ar', 'tr', 'de', 'es', 'fr', 'ru', 'zh', 'ja', 'ko', 'it']],
            ['defaultLanguage', 'fa'],
            ['rtlLanguages', ['fa', 'ar']]
        ]));
        
        // Store 2: User Preferences
        this._configStores.set('user', new Map([
            ['theme', 'dark'],
            ['notifications', true],
            ['soundEnabled', true],
            ['autoSave', true],
            ['dailyGoal', 30],
            ['difficulty', 'medium']
        ]));
        
        // Store 3: API Configuration
        this._configStores.set('api', new Map([
            ['baseURL', 'https://api.vakamova.com/v1'],
            ['timeout', 30000],
            ['retryAttempts', 3],
            ['cacheTTL', 60000],
            ['offlineMode', true]
        ]));
        
        // Store 4: UI Configuration
        this._configStores.set('ui', new Map([
            ['animationsEnabled', true],
            ['reducedMotion', false],
            ['fontSize', 'medium'],
            ['highContrast', false],
            ['touchOptimized', false]
        ]));
        
        // Store 5: Feature Flags
        this._configStores.set('features', new Map([
            ['socialLogin', true],
            ['offlineMode', true],
            ['gamification', true],
            ['voiceRecognition', false],
            ['aiTutor', false],
            ['progressAnalytics', true]
        ]));
        
        // Store 6: Cache Configuration
        this._configStores.set('cache', new Map([
            ['lessonCacheSize', 100],
            ['vocabularyCacheSize', 500],
            ['imageCacheSize', 50],
            ['cleanupInterval', 3600000]
        ]));
    }
    
    _initEventListeners() {
        // Listen for external config change requests
        this._eventSystem.on('config:request:update', (data) => {
            if (data?.path && data.value !== undefined) {
                this.set(data.path, data.value, { source: 'event' });
            }
        });
        
        // Listen for bulk imports
        this._eventSystem.on('config:request:import', (data) => {
            if (data?.config) {
                this.import(data.config, { source: 'event' });
            }
        });
    }
    
    // ==================== INTERFACE CONTRACT METHODS ====================
    
    get(path, defaultValue = null) {
        const { store, key } = this._parsePath(path);
        
        if (!this._configStores.has(store)) {
            return defaultValue;
        }
        
        const value = this._configStores.get(store).get(key);
        return value !== undefined ? value : defaultValue;
    }
    
    set(path, value, options = {}) {
        const { store, key } = this._parsePath(path);
        const oldValue = this.get(path);
        
        // Validation
        if (!this._validate(store, key, value)) {
            throw new Error(`Config validation failed for ${path}`);
        }
        
        // Ensure store exists
        if (!this._configStores.has(store)) {
            this._configStores.set(store, new Map());
        }
        
        // Set value
        this._configStores.get(store).set(key, value);
        
        // Record change
        this._recordChange({
            path,
            oldValue,
            newValue: value,
            timestamp: Date.now(),
            source: options.source || 'direct'
        });
        
        // Notify subscribers
        this._notifySubscribers(path, value, oldValue);
        
        // Emit event
        this._eventSystem.emit('config:changed', {
            path,
            value,
            oldValue,
            store,
            key
        });
        
        return { success: true, path, oldValue, newValue: value };
    }
    
    merge(storeName, updates, options = {}) {
        if (!this._configStores.has(storeName)) {
            throw new Error(`Config store "${storeName}" not found`);
        }
        
        const store = this._configStores.get(storeName);
        const changes = [];
        
        for (const [key, value] of Object.entries(updates)) {
            const oldValue = store.get(key);
            
            if (this._validate(storeName, key, value)) {
                store.set(key, value);
                
                changes.push({
                    path: `${storeName}.${key}`,
                    oldValue,
                    newValue: value
                });
                
                this._notifySubscribers(`${storeName}.${key}`, value, oldValue);
            }
        }
        
        if (changes.length > 0) {
            this._eventSystem.emit('config:merged', {
                store: storeName,
                changes,
                source: options.source || 'direct'
            });
        }
        
        return { success: true, changes };
    }
    
    delete(path) {
        const { store, key } = this._parsePath(path);
        
        if (!this._configStores.has(store)) {
            return { success: false, error: 'Store not found' };
        }
        
        const oldValue = this._configStores.get(store).get(key);
        const deleted = this._configStores.get(store).delete(key);
        
        if (deleted) {
            this._recordChange({
                path,
                oldValue,
                newValue: undefined,
                timestamp: Date.now(),
                source: 'delete',
                type: 'DELETE'
            });
            
            this._notifySubscribers(path, undefined, oldValue);
            this._eventSystem.emit('config:deleted', { path, oldValue, store, key });
        }
        
        return { success: deleted, path, oldValue };
    }
    
    reset(storeName = null, options = {}) {
        if (storeName) {
            if (!this._configStores.has(storeName)) {
                throw new Error(`Config store "${storeName}" not found`);
            }
            
            // Reset single store to defaults
            this._initStore(storeName);
        } else {
            // Reset all stores
            this._configStores.clear();
            this._initStores();
        }
        
        this._eventSystem.emit('config:reset', { 
            store: storeName || 'all',
            source: options.source || 'direct' 
        });
        
        return { success: true };
    }
    
    validate(path, value = null) {
        const { store, key } = this._parsePath(path);
        const valueToValidate = value !== null ? value : this.get(path);
        
        return this._validate(store, key, valueToValidate);
    }
    
    subscribe(path, callback, options = {}) {
        const subscriptionId = Symbol(`config_sub_${Date.now()}`);
        
        if (!this._subscriptions.has(path)) {
            this._subscriptions.set(path, new Map());
        }
        
        this._subscriptions.get(path).set(subscriptionId, {
            callback,
            options: {
                immediate: options.immediate || false,
                deep: options.deep || false
            }
        });
        
        // Immediate callback if requested
        if (options.immediate) {
            try {
                callback(this.get(path), undefined, path);
            } catch (error) {
                console.error('[Config] Immediate subscription error:', error);
            }
        }
        
        // Return unsubscribe function
        return () => {
            const pathSubs = this._subscriptions.get(path);
            if (pathSubs) {
                pathSubs.delete(subscriptionId);
                if (pathSubs.size === 0) {
                    this._subscriptions.delete(path);
                }
            }
        };
    }
    
    export(options = {}) {
        const exportData = {};
        
        for (const [storeName, store] of this._configStores) {
            if (options.stores && !options.stores.includes(storeName)) {
                continue;
            }
            
            exportData[storeName] = Object.fromEntries(store);
        }
        
        const result = {
            version: '1.0',
            timestamp: Date.now(),
            app: this.get('app.name'),
            appVersion: this.get('app.version'),
            data: exportData
        };
        
        if (options.includeHistory) {
            result.history = this._changeHistory.slice(-100);
        }
        
        this._eventSystem.emit('config:exported', { 
            size: JSON.stringify(result).length,
            stores: Object.keys(exportData) 
        });
        
        return result;
    }
    
    import(configData, options = {}) {
        // Validate import structure
        if (!configData || !configData.data || typeof configData.data !== 'object') {
            throw new Error('Invalid config data format');
        }
        
        const importedStores = [];
        
        for (const [storeName, storeData] of Object.entries(configData.data)) {
            if (typeof storeData !== 'object') continue;
            
            importedStores.push(storeName);
            
            // Clear existing store or create new
            if (!this._configStores.has(storeName)) {
                this._configStores.set(storeName, new Map());
            }
            
            // Import key-value pairs
            for (const [key, value] of Object.entries(storeData)) {
                if (this._validate(storeName, key, value)) {
                    this._configStores.get(storeName).set(key, value);
                }
            }
        }
        
        this._eventSystem.emit('config:imported', {
            stores: importedStores,
            source: options.source || 'manual',
            timestamp: Date.now()
        });
        
        return { success: true, importedStores };
    }
    
    // ==================== ADVANCED FEATURES ====================
    
    addSchema(storeName, schema) {
        if (!this._schemas.has(storeName)) {
            this._schemas.set(storeName, {});
        }
        
        const storeSchema = this._schemas.get(storeName);
        Object.assign(storeSchema, schema);
        
        // Create validators from schema
        for (const [key, rule] of Object.entries(schema)) {
            this.addValidator(`${storeName}.${key}`, rule);
        }
        
        return this;
    }
    
    addValidator(path, validator) {
        if (!this._validators.has(path)) {
            this._validators.set(path, []);
        }
        
        this._validators.get(path).push(
            typeof validator === 'function' 
                ? validator 
                : this._createValidatorFromRule(validator)
        );
        
        return this;
    }
    
    getStores() {
        return Array.from(this._configStores.keys());
    }
    
    getStoreContents(storeName) {
        if (!this._configStores.has(storeName)) {
            return null;
        }
        
        return Object.fromEntries(this._configStores.get(storeName));
    }
    
    getHistory(limit = 50) {
        return this._changeHistory.slice(-limit);
    }
    
    clearHistory() {
        const count = this._changeHistory.length;
        this._changeHistory = [];
        return { success: true, cleared: count };
    }
    
    // ==================== PRIVATE METHODS ====================
    
    _parsePath(path) {
        if (typeof path !== 'string') {
            throw new Error('Config path must be a string');
        }
        
        const parts = path.split('.');
        if (parts.length < 2) {
            throw new Error(`Invalid config path format: ${path}`);
        }
        
        return {
            store: parts[0],
            key: parts.slice(1).join('.')
        };
    }
    
    _validate(store, key, value) {
        const fullPath = `${store}.${key}`;
        
        // Check if there are validators for this path
        if (!this._validators.has(fullPath)) {
            return true; // No validation rules, accept all
        }
        
        const validators = this._validators.get(fullPath);
        
        for (const validator of validators) {
            if (!validator(value)) {
                console.warn(`[Config] Validation failed for ${fullPath}:`, value);
                return false;
            }
        }
        
        return true;
    }
    
    _createValidatorFromRule(rule) {
        if (rule.type === 'string') {
            return (value) => typeof value === 'string';
        } else if (rule.type === 'number') {
            return (value) => typeof value === 'number' && !isNaN(value);
        } else if (rule.type === 'boolean') {
            return (value) => typeof value === 'boolean';
        } else if (rule.type === 'array') {
            return (value) => Array.isArray(value);
        } else if (rule.type === 'enum') {
            return (value) => rule.values.includes(value);
        } else if (rule.type === 'range') {
            return (value) => 
                typeof value === 'number' && 
                value >= rule.min && 
                value <= rule.max;
        } else if (rule.type === 'regex') {
            const regex = new RegExp(rule.pattern);
            return (value) => regex.test(value);
        }
        
        // Default: accept any value
        return () => true;
    }
    
    _recordChange(change) {
        this._changeHistory.push(change);
        
        // Keep history size manageable
        if (this._changeHistory.length > 1000) {
            this._changeHistory = this._changeHistory.slice(-500);
        }
    }
    
    _notifySubscribers(path, newValue, oldValue) {
        if (!this._subscriptions.has(path)) return;
        
        const subscribers = this._subscriptions.get(path);
        
        for (const [id, config] of subscribers) {
            try {
                config.callback(newValue, oldValue, path);
            } catch (error) {
                console.error('[Config] Subscriber error:', error);
                // Remove faulty subscriber
                subscribers.delete(id);
            }
        }
    }
    
    _initStore(storeName) {
        // Reinitialize specific store to defaults
        this._configStores.delete(storeName);
        
        if (storeName === 'app') {
            this._configStores.set('app', new Map([
                ['name', 'Vakamova'],
                ['version', '1.0.0'],
                ['environment', 'development'],
                ['debug', true],
                ['logLevel', 'info']
            ]));
        } else if (storeName === 'user') {
            this._configStores.set('user', new Map([
                ['theme', 'dark'],
                ['notifications', true],
                ['soundEnabled', true],
                ['autoSave', true],
                ['dailyGoal', 30]
            ]));
        }
        // ... initialize other stores similarly
    }
    
    // ==================== UTILITY METHODS ====================
    
    isRTL(language = null) {
        const lang = language || this.get('app.defaultLanguage');
        const rtlLangs = this.get('app.rtlLanguages', []);
        return rtlLangs.includes(lang);
    }
    
    getLanguageConfig(language) {
        const supported = this.get('app.supportedLanguages', []);
        
        if (!supported.includes(language)) {
            language = this.get('app.defaultLanguage');
        }
        
        return {
            language,
            isRTL: this.isRTL(language),
            enabled: true
        };
    }
    
    getFeatureStatus(featureName) {
        return this.get(`features.${featureName}`, false);
    }
    
    enableFeature(featureName) {
        return this.set(`features.${featureName}`, true);
    }
    
    disableFeature(featureName) {
        return this.set(`features.${featureName}`, false);
    }
    
    // ==================== STATIC METHODS ====================
    
    static createEnvironmentConfig(env) {
        const configs = {
            development: {
                app: { debug: true, logLevel: 'debug' },
                api: { baseURL: 'http://localhost:3000/api' }
            },
            staging: {
                app: { debug: true, logLevel: 'warn' },
                api: { baseURL: 'https://staging.api.vakamova.com/v1' }
            },
            production: {
                app: { debug: false, logLevel: 'error' },
                api: { baseURL: 'https://api.vakamova.com/v1' }
            }
        };
        
        return configs[env] || configs.development;
    }
}

// ==================== SINGLETON PATTERN WITH OPTIONAL EVENT SYSTEM ====================

let globalConfigInstance = null;

function createConfig(eventSystem = null) {
    if (!globalConfigInstance) {
        globalConfigInstance = new VakamovaConfig(eventSystem);
        
        // Add default schemas
        globalConfigInstance.addSchema('user', {
            theme: { type: 'enum', values: ['dark', 'light', 'auto'] },
            dailyGoal: { type: 'range', min: 5, max: 120 },
            difficulty: { type: 'enum', values: ['easy', 'medium', 'hard'] }
        });
        
        globalConfigInstance.addSchema('app', {
            logLevel: { type: 'enum', values: ['debug', 'info', 'warn', 'error'] },
            defaultLanguage: { type: 'enum', values: ['en', 'fa', 'ar'] }
        });
        
        console.log('[Config] ✅ Vakamova Configuration System initialized');
    }
    
    return globalConfigInstance;
}

// Export both class and singleton factory
export { VakamovaConfig, createConfig };
