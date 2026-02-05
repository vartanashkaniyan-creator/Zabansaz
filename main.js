/**
 * VAKAMOVA MAIN APPLICATION ENTRY POINT
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * وابستگی داخلی: event_bus.js, context_provider.js, state_manager.js, api_client.js
 */

class VakamovaApp {
    constructor(config = {}) {
        // ==================== پیکربندی متمرکز ====================
        this._config = Object.freeze({
            app: {
                name: 'Vakamova',
                version: '1.0.0',
                environment: config.environment || 'development',
                debug: config.debug || false,
                language: config.language || 'fa',
                direction: config.direction || 'rtl'
            },
            
            services: {
                eventBus: { enabled: true, config: { maxListeners: 100 } },
                context: { enabled: true, autoInitialize: true },
                state: { enabled: true, persistence: true, encryption: false },
                api: { 
                    enabled: true, 
                    baseURL: config.apiURL || 'https://api.vakamova.com',
                    timeout: 30000,
                    retryAttempts: 3 
                },
                auth: { enabled: true, requireAuth: true, tokenRefresh: true },
                router: { enabled: true, historyMode: true, middleware: true },
                database: { enabled: true, version: 4, encryption: false }
            },
            
            modules: {
                lessons: { enabled: true, offlineSupport: true },
                gamification: { enabled: true, pointsSystem: true },
                analytics: { enabled: true, trackEvents: true },
                notifications: { enabled: true, pushEnabled: false }
            },
            
            ui: {
                theme: config.theme || 'dark',
                animations: true,
                rtlSupport: true,
                responsiveBreakpoints: {
                    mobile: 768,
                    tablet: 1024,
                    desktop: 1280
                }
            },
            
            ...config
        });
        
        // ==================== وضعیت برنامه ====================
        this._state = {
            initialized: false,
            started: false,
            services: {},
            modules: {},
            lifecycle: 'created'
        };
        
        // ==================== هسته سیستم ====================
        this._core = {
            eventBus: null,
            context: null,
            stateManager: null,
            apiClient: null
        };
        
        // ==================== سرویس‌های سطح بالاتر ====================
        this._services = {
            auth: null,
            router: null,
            database: null,
            lessonEngine: null,
            analytics: null
        };
        
        // ==================== اتصالات ====================
        this._connections = new Map();
        this._subscriptions = new Set();
        
        // ==================== API عمومی ====================
        this.init = this.init.bind(this);
        this.start = this.start.bind(this);
        this.stop = this.stop.bind(this);
        this.restart = this.restart.bind(this);
        this.getService = this.getService.bind(this);
        this.inject = this.inject.bind(this);
        this.getConfig = this.getConfig.bind(this);
        this.destroy = this.destroy.bind(this);
    }
    
    // ==================== قرارداد رابط اصلی ====================
    
    async init(options = {}) {
        if (this._state.initialized) {
            console.warn('[VakamovaApp] Already initialized');
            return this;
        }
        
        this._state.lifecycle = 'initializing';
        
        try {
            // ۱. انتشار رویداد شروع مقداردهی اولیه
            this._emit('app:initializing', { config: this._config, timestamp: Date.now() });
            
            // ۲. ایجاد هسته سیستم (تزریق وابستگی)
            await this._createCoreServices();
            
            // ۳. ثبت سرویس‌ها در Context Provider
            await this._registerServices();
            
            // ۴. مقداردهی اولیه سرویس‌های سطح بالا
            await this._initializeHighLevelServices();
            
            // ۵. برقراری ارتباط بین سرویس‌ها
            await this._establishConnections();
            
            // ۶. راه‌اندازی اشتراک‌های رویداد
            await this._setupEventSubscriptions();
            
            // ۷. اعتبارسنجی تنظیمات
            await this._validateConfiguration();
            
            this._state.initialized = true;
            this._state.lifecycle = 'initialized';
            
            // انتشار رویداد تکمیل مقداردهی اولیه
            this._emit('app:initialized', { 
                services: Object.keys(this._services),
                modules: Object.keys(this._state.modules),
                timestamp: Date.now() 
            });
            
            console.log(`✅ ${this._config.app.name} v${this._config.app.version} initialized successfully`);
            
        } catch (error) {
            this._state.lifecycle = 'error';
            this._emit('app:init:error', { error: error.message, timestamp: Date.now() });
            throw new Error(`Initialization failed: ${error.message}`);
        }
        
        return this;
    }
    
    async start(options = {}) {
        if (!this._state.initialized) {
            throw new Error('App not initialized. Call init() first.');
        }
        
        if (this._state.started) {
            console.warn('[VakamovaApp] Already started');
            return this;
        }
        
        this._state.lifecycle = 'starting';
        
        try {
            // ۱. انتشار رویداد شروع برنامه
            this._emit('app:starting', { timestamp: Date.now() });
            
            // ۲. راه‌اندازی Auth System (اگر فعال باشد)
            if (this._config.services.auth.enabled && this._services.auth) {
                await this._services.auth.initialize();
                this._emit('app:auth:initialized');
            }
            
            // ۳. راه‌اندازی Router (اگر فعال باشد)
            if (this._config.services.router.enabled && this._services.router) {
                await this._services.router.initialize();
                this._emit('app:router:initialized');
            }
            
            // ۴. راه‌اندازی پایگاه داده
            if (this._config.services.database.enabled && this._services.database) {
                await this._services.database.init();
                this._emit('app:database:initialized');
            }
            
            // ۵. راه‌اندازی موتور درس‌ها
            if (this._config.modules.lessons.enabled && this._services.lessonEngine) {
                await this._services.lessonEngine.initialize();
                this._emit('app:lessons:initialized');
            }
            
            // ۶. بارگذاری وضعیت کاربر (اگر وجود دارد)
            await this._loadUserState();
            
            // ۷. اتصال به سرویس‌های خارجی
            await this._connectExternalServices();
            
            // ۸. شروع تحلیل‌گرایانه
            if (this._config.modules.analytics.enabled && this._services.analytics) {
                await this._services.analytics.start();
            }
            
            this._state.started = true;
            this._state.lifecycle = 'running';
            
            // انتشار رویداد شروع موفق
            this._emit('app:started', { 
                timestamp: Date.now(),
                servicesRunning: Object.keys(this._services).filter(key => this._services[key])
            });
            
            console.log(`🚀 ${this._config.app.name} started successfully`);
            
        } catch (error) {
            this._state.lifecycle = 'error';
            this._emit('app:start:error', { error: error.message });
            throw new Error(`Start failed: ${error.message}`);
        }
        
        return this;
    }
    
    async stop() {
        if (!this._state.started) return this;
        
        this._state.lifecycle = 'stopping';
        this._emit('app:stopping');
        
        try {
            // توقف به ترتیب معکوس
            if (this._services.analytics) {
                await this._services.analytics.stop();
            }
            
            if (this._services.lessonEngine) {
                await this._services.lessonEngine.cleanup();
            }
            
            if (this._services.database) {
                await this._services.database.close();
            }
            
            if (this._services.auth) {
                await this._services.auth.cleanup();
            }
            
            // پاک‌سازی اشتراک‌های رویداد
            this._cleanupSubscriptions();
            
            this._state.started = false;
            this._state.lifecycle = 'stopped';
            
            this._emit('app:stopped');
            console.log('🛑 Vakamova stopped');
            
        } catch (error) {
            this._emit('app:stop:error', { error: error.message });
            console.error('Error stopping app:', error);
        }
        
        return this;
    }
    
    async restart() {
        await this.stop();
        await this.start();
        return this;
    }
    
    // ==================== تزریق وابستگی ====================
    
    inject(serviceName, instance) {
        if (!serviceName || typeof serviceName !== 'string') {
            throw new Error('Service name must be a string');
        }
        
        // تزریق به هسته
        if (serviceName in this._core) {
            this._core[serviceName] = instance;
            this._emit('app:core:injected', { service: serviceName, instance });
            return this;
        }
        
        // تزریق به سرویس‌ها
        if (serviceName in this._services) {
            this._services[serviceName] = instance;
            this._emit('app:service:injected', { service: serviceName, instance });
            return this;
        }
        
        // تزریق به ماژول‌ها
        if (!this._state.modules[serviceName]) {
            this._state.modules[serviceName] = instance;
            this._emit('app:module:injected', { module: serviceName, instance });
        }
        
        return this;
    }
    
    getService(serviceName) {
        // جستجو در هسته
        if (this._core[serviceName]) {
            return this._core[serviceName];
        }
        
        // جستجو در سرویس‌ها
        if (this._services[serviceName]) {
            return this._services[serviceName];
        }
        
        // جستجو در ماژول‌ها
        if (this._state.modules[serviceName]) {
            return this._state.modules[serviceName];
        }
        
        // جستجو در Context Provider
        if (this._core.context && this._core.context.hasService(serviceName)) {
            return this._core.context.resolve(serviceName);
        }
        
        throw new Error(`Service "${serviceName}" not found`);
    }
    
    getConfig(path = null) {
        if (!path) {
            return { ...this._config };
        }
        
        const parts = path.split('.');
        let value = this._config;
        
        for (const part of parts) {
            if (value && typeof value === 'object' && part in value) {
                value = value[part];
            } else {
                return undefined;
            }
        }
        
        return value;
    }
    
    // ==================== وضعیت و اطلاعات ====================
    
    getState() {
        return {
            ...this._state,
            config: { ...this._config.app },
            services: Object.keys(this._services).filter(key => this._services[key]),
            modules: Object.keys(this._state.modules)
        };
    }
    
    getMetrics() {
        return {
            uptime: this._state.started ? Date.now() - this._state.startTime : 0,
            services: {
                total: Object.keys(this._services).length,
                running: Object.keys(this._services).filter(key => this._services[key]).length
            },
            connections: this._connections.size,
            subscriptions: this._subscriptions.size,
            lifecycle: this._state.lifecycle
        };
    }
    
    isInitialized() {
        return this._state.initialized;
    }
    
    isStarted() {
        return this._state.started;
    }
    
    // ==================== متدهای داخلی ====================
    
    async _createCoreServices() {
        // ۱. Event Bus (پایه ارتباط رویدادمحور)
        if (this._config.services.eventBus.enabled) {
            if (typeof eventBus !== 'undefined') {
                this._core.eventBus = eventBus;
            } else if (typeof HyperEventBus !== 'undefined') {
                this._core.eventBus = new HyperEventBus(this._config.services.eventBus.config);
            } else {
                throw new Error('Event Bus not available. Make sure event_bus.js is loaded.');
            }
            
            this._emit('app:core:created', { service: 'eventBus', instance: this._core.eventBus });
        }
        
        // ۲. Context Provider (پایه تزریق وابستگی)
        if (this._config.services.context.enabled) {
            if (typeof createContext !== 'undefined') {
                this._core.context = createContext(this._core.eventBus);
            } else if (typeof HyperContext !== 'undefined') {
                this._core.context = new HyperContext(this._core.eventBus);
            } else {
                throw new Error('Context Provider not available.');
            }
            
            this._emit('app:core:created', { service: 'context', instance: this._core.context });
        }
        
        // ۳. State Manager (پایه مدیریت وضعیت)
        if (this._config.services.state.enabled) {
            if (typeof HyperStateManager !== 'undefined') {
                this._core.stateManager = new HyperStateManager(
                    this._core.eventBus, 
                    this._config.services.state
                );
            } else {
                throw new Error('State Manager not available.');
            }
            
            this._emit('app:core:created', { service: 'stateManager', instance: this._core.stateManager });
        }
        
        // ۴. API Client (پایه ارتباط خارجی)
        if (this._config.services.api.enabled) {
            if (typeof HyperApiClient !== 'undefined') {
                this._core.apiClient = new HyperApiClient(
                    this._core.eventBus,
                    this._config.services.api
                );
            } else {
                throw new Error('API Client not available.');
            }
            
            this._emit('app:core:created', { service: 'apiClient', instance: this._core.apiClient });
        }
    }
    
    async _registerServices() {
        if (!this._core.context) return;
        
        // ثبت هسته سیستم
        if (this._core.eventBus) {
            this._core.context.register('eventBus', () => this._core.eventBus, {
                type: 'value',
                singleton: true
            });
        }
        
        if (this._core.stateManager) {
            this._core.context.register('stateManager', () => this._core.stateManager, {
                type: 'value',
                singleton: true
            });
        }
        
        if (this._core.apiClient) {
            this._core.context.register('apiClient', () => this._core.apiClient, {
                type: 'value',
                singleton: true
            });
        }
        
        if (this._core.context) {
            this._core.context.register('context', () => this._core.context, {
                type: 'value',
                singleton: true
            });
        }
        
        // ثبت سرویس برنامه
        this._core.context.register('app', () => this, {
            type: 'value',
            singleton: true
        });
        
        // اعتبارسنجی Context
        if (this._config.services.context.autoInitialize) {
            await this._core.context.initialize();
        }
        
        this._emit('app:services:registered');
    }
    
    async _initializeHighLevelServices() {
        // Auth Manager
        if (this._config.services.auth.enabled && typeof auth_manager !== 'undefined') {
            this._services.auth = auth_manager;
            this._core.context?.register('authManager', () => auth_manager, { singleton: true });
            this._emit('app:service:initialized', { service: 'auth' });
        }
        
        // Router
        if (this._config.services.router.enabled && typeof router !== 'undefined') {
            this._services.router = router;
            this._core.context?.register('router', () => router, { singleton: true });
            this._emit('app:service:initialized', { service: 'router' });
        }
        
        // Database
        if (this._config.services.database.enabled && typeof database !== 'undefined') {
            this._services.database = database;
            this._core.context?.register('database', () => database, { singleton: true });
            this._emit('app:service:initialized', { service: 'database' });
        }
        
        // Lesson Engine
        if (this._config.modules.lessons.enabled && typeof lesson_engine !== 'undefined') {
            this._services.lessonEngine = lesson_engine;
            this._core.context?.register('lessonEngine', () => lesson_engine, { singleton: true });
            this._emit('app:service:initialized', { service: 'lessonEngine' });
        }
        
        // Analytics
        if (this._config.modules.analytics.enabled && typeof analytics !== 'undefined') {
            this._services.analytics = analytics;
            this._core.context?.register('analytics', () => analytics, { singleton: true });
            this._emit('app:service:initialized', { service: 'analytics' });
        }
    }
    
    async _establishConnections() {
        // اتصال State Manager به Event Bus
        if (this._core.eventBus && this._core.stateManager) {
            const connectionId = this._createConnection('eventBus', 'stateManager', 'state:sync');
            this._connections.set(connectionId, { from: 'eventBus', to: 'stateManager', type: 'state:sync' });
        }
        
        // اتصال Auth به Event Bus
        if (this._core.eventBus && this._services.auth) {
            const connectionId = this._createConnection('eventBus', 'auth', 'auth:events');
            this._connections.set(connectionId, { from: 'eventBus', to: 'auth', type: 'auth:events' });
        }
        
        // اتصال API Client به State Manager
        if (this._core.apiClient && this._core.stateManager) {
            const connectionId = this._createConnection('apiClient', 'stateManager', 'api:sync');
            this._connections.set(connectionId, { from: 'apiClient', to: 'stateManager', type: 'api:sync' });
        }
        
        this._emit('app:connections:established', { count: this._connections.size });
    }
    
    async _setupEventSubscriptions() {
        if (!this._core.eventBus) return;
        
        // گوش دادن به خطاهای سطح برنامه
        const errorHandler = this._core.eventBus.on('error', (error, context) => {
            console.error(`[Vakamova Error] ${context}:`, error);
            this._emit('app:error', { error, context, timestamp: Date.now() });
        });
        this._subscriptions.add(errorHandler);
        
        // گوش دادن به تغییرات وضعیت
        if (this._core.stateManager) {
            const stateChangeHandler = this._core.stateManager.subscribe('app', (newState, oldState) => {
                this._emit('app:state:changed', { newState, oldState });
            });
            this._subscriptions.add(() => stateChangeHandler());
        }
        
        // گوش دادن به رویدادهای Auth
        if (this._services.auth) {
            const authHandler = this._core.eventBus.on('auth:*', (event, data) => {
                this._handleAuthEvent(event, data);
            });
            this._subscriptions.add(authHandler);
        }
        
        this._emit('app:subscriptions:setup', { count: this._subscriptions.size });
    }
    
    async _validateConfiguration() {
        const errors = [];
        
        // اعتبارسنجی تنظیمات هسته
        if (this._config.services.eventBus.enabled && !this._core.eventBus) {
            errors.push('Event Bus enabled but not available');
        }
        
        if (this._config.services.state.enabled && !this._core.stateManager) {
            errors.push('State Manager enabled but not available');
        }
        
        if (this._config.services.api.enabled && !this._core.apiClient) {
            errors.push('API Client enabled but not available');
        }
        
        // اعتبارسنجی وابستگی‌ها
        if (this._config.services.auth.requireAuth && !this._services.auth) {
            errors.push('Auth required but Auth Manager not available');
        }
        
        if (errors.length > 0) {
            throw new Error(`Configuration validation failed: ${errors.join(', ')}`);
        }
        
        this._emit('app:config:validated');
    }
    
    async _loadUserState() {
        if (!this._core.stateManager) return;
        
        try {
            // بارگذاری وضعیت کاربر از LocalStorage (اگر وجود دارد)
            const savedState = localStorage.getItem('vakamova_user_state');
            if (savedState) {
                const state = JSON.parse(savedState);
                this._core.stateManager.set('user', state, { source: 'persisted' });
                this._emit('app:state:loaded', { from: 'localStorage' });
            }
        } catch (error) {
            console.warn('Failed to load user state:', error);
        }
    }
    
    async _connectExternalServices() {
        // در اینجا می‌توانید اتصال به سرویس‌های خارجی را اضافه کنید
        // مانند: پوش نوتیفیکیشن، آنالیتیکس شخص ثالث، سرویس‌های پرداخت
        this._emit('app:external:connecting');
    }
    
    _cleanupSubscriptions() {
        for (const unsubscribe of this._subscriptions) {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        }
        this._subscriptions.clear();
    }
    
    _createConnection(from, to, type) {
        const id = `conn_${from}_${to}_${Date.now()}`;
        this._emit('app:connection:created', { id, from, to, type });
        return id;
    }
    
    _handleAuthEvent(event, data) {
        switch (event) {
            case 'auth:login:success':
                this._core.stateManager?.set('user.authenticated', true, { source: 'auth' });
                this._emit('app:user:loggedIn', { user: data.user });
                break;
                
            case 'auth:logout':
                this._core.stateManager?.set('user.authenticated', false, { source: 'auth' });
                this._emit('app:user:loggedOut');
                break;
                
            case 'auth:token:expired':
                this._emit('app:auth:tokenExpired');
                break;
        }
    }
    
    _emit(event, data = {}) {
        // انتشار از طریق Event Bus
        if (this._core.eventBus) {
            this._core.eventBus.emit(event, {
                ...data,
                app: this._config.app.name,
                version: this._config.app.version,
                timestamp: Date.now()
            });
        }
        
        // لاگ در حالت debug
        if (this._config.app.debug) {
            console.log(`[Vakamova Event] ${event}`, data);
        }
    }
    
    // ==================== تخریب ====================
    
    async destroy() {
        if (this._state.started) {
            await this.stop();
        }
        
        this._state.lifecycle = 'destroying';
        this._emit('app:destroying');
        
        // پاک‌سازی کامل
        this._cleanupSubscriptions();
        this._connections.clear();
        
        // پاک‌سازی هسته
        this._core.eventBus = null;
        this._core.context = null;
        this._core.stateManager = null;
        this._core.apiClient = null;
        
        // پاک‌سازی سرویس‌ها
        for (const key in this._services) {
            this._services[key] = null;
        }
        
        this._state.modules = {};
        this._state.initialized = false;
        this._state.lifecycle = 'destroyed';
        
        this._emit('app:destroyed');
        console.log('🧹 Vakamova destroyed');
        
        return null;
    }
}

// ==================== Singleton Instance ====================
let vakamovaInstance = null;

function createVakamovaApp(config = {}) {
    if (!vakamovaInstance) {
        vakamovaInstance = new VakamovaApp(config);
        
        // اکسپورت جهانی برای دسترسی آسان
        if (typeof window !== 'undefined') {
            window.Vakamova = vakamovaInstance;
        }
    }
    
    return vakamovaInstance;
}

function getVakamovaApp() {
    if (!vakamovaInstance) {
        throw new Error('Vakamova app not created. Call createVakamovaApp() first.');
    }
    return vakamovaInstance;
}

// ==================== Bootstrap Function ====================
async function bootstrapVakamova(config = {}) {
    try {
        console.log('🚀 Bootstrapping Vakamova Application...');
        
        const app = createVakamovaApp(config);
        await app.init();
        await app.start();
        
        console.log('🎉 Vakamova Application successfully bootstrapped');
        return app;
        
    } catch (error) {
        console.error('❌ Bootstrap failed:', error);
        throw error;
    }
}

// ==================== Auto-Start در صورت لود مستقیم ====================
if (typeof window !== 'undefined' && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // شروع خودکار در حالت development
        if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
            setTimeout(() => {
                bootstrapVakamova({ environment: 'development', debug: true })
                    .catch(console.error);
            }, 100);
        }
    });
}

// ==================== اکسپورت ====================
export { 
    VakamovaApp, 
    createVakamovaApp, 
    getVakamovaApp, 
    bootstrapVakamova 
};

// اکسپورت پیش‌فرض
export default VakamovaApp;
