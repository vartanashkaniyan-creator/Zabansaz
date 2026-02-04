/**
 * VAKAMOVA APP BOOTSTRAP - هماهنگ‌کننده نهایی برنامه
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * وابستگی: main.js (که خودش core/ و modules/ را بارگذاری می‌کند)
 */

class VakamovaApp {
    constructor(config = {}) {
        // پیکربندی متمرکز از config.js + main.js
        this.config = Object.freeze({
            mountElement: config.mountElement || '#app',
            initialRoute: config.initialRoute || '/home',
            enableOffline: config.enableOffline ?? true,
            enableAutoRestore: config.enableAutoRestore ?? true,
            enableGlobalErrorHandling: config.enableGlobalErrorHandling ?? true,
            ...config
        });
        
        // تزریق وابستگی‌های اصلی (با نام‌های صحیح window)
        this.eventBus = config.eventBus || window.eventBus || window.EventBus;
        this.stateManager = config.stateManager || window.StateManager || window.stateManager;
        this.router = config.router || window.Router || window.router;
        this.context = config.context || window.AppContext || window.appContext;
        
        // مدیریت رویدادها و state
        this.isMounted = false;
        this.appInstance = null;
        this._eventListeners = [];
        this._systemListeners = new Map();
        
        Object.seal(this);
    }
    
    async init() {
        console.log('[VakamovaApp] 🚀 شروع راه‌اندازی...');
        
        try {
            // ۱. بررسی وابستگی‌های حیاتی
            this._validateDependencies();
            
            // ۲. ثبت سرویس برنامه در Context (اگر وجود دارد)
            await this._registerInContext();
            
            // ۳. راه‌اندازی State Manager (اگر نیاز باشد)
            await this._initializeStateManager();
            
            // ۴. اتصال رویدادهای سیستمی
            this._connectSystemEvents();
            
            // ۵. فعال‌سازی خطایابی جهانی
            if (this.config.enableGlobalErrorHandling) {
                this._setupGlobalErrorHandling();
            }
            
            // ۶. انتشار رویداد آماده‌سازی
            this.eventBus.emit('app:init', { 
                timestamp: Date.now(),
                version: '1.0.0',
                config: this.config
            });
            
            console.log('[VakamovaApp] ✅ راه‌اندازی اولیه انجام شد');
            return this;
            
        } catch (error) {
            console.error('[VakamovaApp] ❌ خطا در راه‌اندازی:', error);
            this.eventBus.emit('app:init:error', { error: error.message });
            throw error;
        }
    }
    
    async mount() {
        if (this.isMounted) {
            console.warn('[VakamovaApp] برنامه قبلاً mount شده است');
            return this;
        }
        
        console.log('[VakamovaApp] 📌 در حال mount کردن...');
        
        try {
            // ۱. پیدا کردن المنت مونت
            const mountEl = document.querySelector(this.config.mountElement);
            if (!mountEl) {
                throw new Error(`Element ${this.config.mountElement} not found`);
            }
            
            // ۲. راه‌اندازی Router (اگر نیاز باشد)
            if (this.router && typeof this.router.init === 'function') {
                await this.router.init(mountEl);
            }
            
            // ۳. بازیابی وضعیت برنامه (در صورت فعال بودن)
            if (this.config.enableAutoRestore) {
                await this._restoreAppState();
            }
            
            // ۴. هدایت به مسیر اولیه
            if (this.router && typeof this.router.navigate === 'function') {
                await this.router.navigate(this.config.initialRoute);
            } else {
                // Fallback: نمایش مستقیم صفحه
                this._renderInitialPage(mountEl);
            }
            
            // ۵. ذخیره زمان mount
            this.stateManager?.set('app.mountedAt', Date.now(), {
                source: 'vakamova_app'
            });
            
            this.isMounted = true;
            
            // ۶. انتشار رویداد موفقیت
            this.eventBus.emit('app:mounted', { 
                mountElement: this.config.mountElement,
                initialRoute: this.config.initialRoute,
                timestamp: Date.now()
            });
            
            console.log('[VakamovaApp] 🎉 برنامه با موفقیت mount شد');
            return this;
            
        } catch (error) {
            console.error('[VakamovaApp] ❌ خطا در mount:', error);
            this.eventBus.emit('app:mount:error', { error: error.message });
            throw error;
        }
    }
    
    async unmount() {
        if (!this.isMounted) {
            console.warn('[VakamovaApp] برنامه mount نشده است');
            return;
        }
        
        console.log('[VakamovaApp] 🧹 در حال unmount کردن...');
        
        try {
            // ۱. انتشار رویداد شروع unmount
            this.eventBus.emit('app:unmount:start', { timestamp: Date.now() });
            
            // ۲. پاک‌سازی رویدادها و state
            await this._cleanup();
            
            // ۳. ذخیره وضعیت نهایی
            await this._persistAppState();
            
            // ۴. حذف از context
            if (this.context && this.context.unregister) {
                this.context.unregister('app');
            }
            
            this.isMounted = false;
            
            // ۵. انتشار رویداد تکمیل
            this.eventBus.emit('app:unmounted', { 
                timestamp: Date.now(),
                duration: Date.now() - (this.stateManager?.get('app.mountedAt') || Date.now())
            });
            
            console.log('[VakamovaApp] ✅ برنامه unmount شد');
            
        } catch (error) {
            console.error('[VakamovaApp] ❌ خطا در unmount:', error);
            this.eventBus.emit('app:unmount:error', { error: error.message });
            throw error;
        }
    }
    
    // ==================== روش‌های داخلی ====================
    
    _validateDependencies() {
        const missing = [];
        
        if (!this.eventBus) missing.push('EventBus');
        if (!this.stateManager) missing.push('StateManager');
        if (!this.router) missing.push('Router');
        
        if (missing.length > 0) {
            throw new Error(`پیش‌نیازهای اصلی برنامه بارگذاری نشده‌اند: ${missing.join(', ')}`);
        }
        
        console.log('[VakamovaApp] ✅ همه وابستگی‌ها تأیید شدند');
    }
    
    async _registerInContext() {
        if (this.context && typeof this.context.register === 'function') {
            this.context.register('app', this, { 
                singleton: true,
                type: 'service'
            });
            console.log('[VakamovaApp] ✅ در Context ثبت شد');
        }
    }
    
    async _initializeStateManager() {
        if (this.stateManager && typeof this.stateManager.init === 'function') {
            await this.stateManager.init();
            console.log('[VakamovaApp] ✅ StateManager راه‌اندازی شد');
        }
    }
    
    _connectSystemEvents() {
        console.log('[VakamovaApp] 🔗 در حال اتصال رویدادهای سیستمی...');
        
        // رویدادهای احراز هویت
        this._subscribeToEvent('auth:login', (user) => {
            console.log('[VakamovaApp] 👤 کاربر وارد شد:', user.id);
            this.stateManager.set('user.current', user, { 
                source: 'auth_system',
                priority: 'high'
            });
            
            // به‌روزرسانی آخرین فعالیت
            this.stateManager.set('user.lastActivity', Date.now());
        });
        
        this._subscribeToEvent('auth:logout', () => {
            console.log('[VakamovaApp] 👋 کاربر خارج شد');
            this.stateManager.delete('user.current');
            this.eventBus.emit('app:navigate', { path: '/login' });
        });
        
        // رویدادهای مسیریابی
        this._subscribeToEvent('router:navigate', (route) => {
            // ذخیره آخرین مسیر برای بازگشت
            this.stateManager.set('app.lastRoute', route, {
                source: 'router_system',
                expires: Date.now() + 3600000 // 1 hour
            });
            
            // ثبت در تاریخچه
            const history = this.stateManager.get('app.navigationHistory') || [];
            history.push({ route, timestamp: Date.now() });
            if (history.length > 50) history.shift();
            this.stateManager.set('app.navigationHistory', history);
        });
        
        // رویدادهای خطا
        this._subscribeToEvent('app:error', (errorData) => {
            console.error('[VakamovaApp] 🚨 خطای برنامه:', errorData);
            
            // ذخیره در state برای گزارش‌گیری
            const errors = this.stateManager.get('app.errors') || [];
            errors.push({ ...errorData, timestamp: Date.now() });
            if (errors.length > 100) errors.shift();
            this.stateManager.set('app.errors', errors);
        });
        
        // رویدادهای شبکه
        this._subscribeToEvent('network:online', () => {
            this.stateManager.set('app.networkStatus', 'online');
            console.log('[VakamovaApp] 🌐 اتصال اینترنت برقرار شد');
        });
        
        this._subscribeToEvent('network:offline', () => {
            this.stateManager.set('app.networkStatus', 'offline');
            console.warn('[VakamovaApp] 📴 اتصال اینترنت قطع شد');
        });
        
        console.log('[VakamovaApp] ✅ رویدادهای سیستمی متصل شدند');
    }
    
    _setupGlobalErrorHandling() {
        // خطایابی سینک
        window.addEventListener('error', (event) => {
            this.eventBus.emit('app:error', { 
                type: 'global_error',
                message: event.message,
                filename: event.filename,
                lineno: event.lineno,
                colno: event.colno,
                error: event.error?.stack || event.error
            });
        });
        
        // خطایابی async
        window.addEventListener('unhandledrejection', (event) => {
            this.eventBus.emit('app:error', {
                type: 'unhandled_rejection',
                reason: event.reason?.message || event.reason,
                promise: event.promise
            });
        });
        
        console.log('[VakamovaApp] ✅ خطایابی جهانی فعال شد');
    }
    
    async _restoreAppState() {
        console.log('[VakamovaApp] 🔄 در حال بازیابی وضعیت برنامه...');
        
        try {
            // بازیابی از StateManager
            const savedState = this.stateManager.get('app.persistedState');
            
            if (savedState) {
                // بازیابی تنظیمات کاربر
                if (savedState.userSettings) {
                    this.stateManager.set('user.settings', savedState.userSettings, {
                        source: 'persisted_restore'
                    });
                }
                
                // بازیابی آخرین مسیر (در صورت وجود)
                if (savedState.lastRoute && savedState.lastRoute !== this.config.initialRoute) {
                    this.eventBus.emit('app:navigate', { path: savedState.lastRoute });
                }
                
                this.eventBus.emit('app:state:restored', {
                    state: savedState,
                    restoredAt: Date.now()
                });
                
                console.log('[VakamovaApp] ✅ وضعیت برنامه بازیابی شد');
            } else {
                console.log('[VakamovaApp] 📝 وضعیت ذخیره‌شده‌ای یافت نشد');
            }
            
        } catch (error) {
            console.warn('[VakamovaApp] ⚠️ خطا در بازیابی وضعیت:', error);
            this.eventBus.emit('app:state:restore:error', { error: error.message });
        }
    }
    
    async _persistAppState() {
        console.log('[VakamovaApp] 💾 در حال ذخیره وضعیت برنامه...');
        
        try {
            // جمع‌آوری داده‌های مهم برای ذخیره
            const stateToPersist = {
                lastRoute: this.stateManager.get('app.lastRoute'),
                userSettings: this.stateManager.get('user.settings'),
                theme: this.stateManager.get('ui.theme'),
                language: this.stateManager.get('ui.language'),
                persistedAt: Date.now()
            };
            
            // ذخیره در StateManager
            this.stateManager.set('app.persistedState', stateToPersist, {
                source: 'app_unmount',
                priority: 'high'
            });
            
            console.log('[VakamovaApp] ✅ وضعیت برنامه ذخیره شد');
            
        } catch (error) {
            console.warn('[VakamovaApp] ⚠️ خطا در ذخیره وضعیت:', error);
        }
    }
    
    async _cleanup() {
        console.log('[VakamovaApp] 🧹 در حال پاک‌سازی منابع...');
        
        // ۱. پاک‌سازی event listeners
        if (this._eventListeners.length > 0) {
            this._eventListeners.forEach(unsubscribe => {
                if (typeof unsubscribe === 'function') {
                    unsubscribe();
                }
            });
            this._eventListeners = [];
        }
        
        // ۲. پاک‌سازی system listeners
        this._systemListeners.forEach((unsubscribe, eventName) => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
                console.log(`[VakamovaApp] 🔊 اشتراک ${eventName} لغو شد`);
            }
        });
        this._systemListeners.clear();
        
        // ۳. پاک‌سازی global listeners
        window.onerror = null;
        window.onunhandledrejection = null;
        
        // ۴. ذخیره state نهایی
        await this._persistAppState();
        
        console.log('[VakamovaApp] ✅ پاک‌سازی کامل انجام شد');
    }
    
    _renderInitialPage(container) {
        // Fallback UI در صورت عدم وجود router
        container.innerHTML = `
            <div style="padding: 40px; text-align: center; font-family: Tahoma;">
                <h1 style="color: #0d7377;">🚀 Vakamova</h1>
                <p>برنامه در حال راه‌اندازی...</p>
                <p>اگر این صفحه را می‌بینید، لطفاً مرورگر را رفرش کنید.</p>
                <button onclick="location.reload()" style="
                    background: #0d7377;
                    color: white;
                    border: none;
                    padding: 10px 20px;
                    border-radius: 5px;
                    margin-top: 20px;
                    cursor: pointer;
                ">
                    رفرش صفحه
                </button>
            </div>
        `;
    }
    
    _subscribeToEvent(eventName, handler) {
        if (!this.eventBus || !this.eventBus.on) return null;
        
        const unsubscribe = this.eventBus.on(eventName, handler);
        
        if (typeof unsubscribe === 'function') {
            this._systemListeners.set(eventName, unsubscribe);
        } else if (unsubscribe && typeof unsubscribe === 'object' && unsubscribe.unsubscribe) {
            this._systemListeners.set(eventName, unsubscribe.unsubscribe);
        }
        
        return unsubscribe;
    }
    
    // ==================== API عمومی ====================
    
    getService(serviceName) {
        if (this.context && typeof this.context.resolve === 'function') {
            return this.context.resolve(serviceName);
        }
        return null;
    }
    
    getCurrentRoute() {
        return this.stateManager?.get('app.lastRoute') || this.config.initialRoute;
    }
    
    getAppInfo() {
        return {
            version: '1.0.0',
            mounted: this.isMounted,
            mountElement: this.config.mountElement,
            initialRoute: this.config.initialRoute,
            dependencies: {
                hasEventBus: !!this.eventBus,
                hasStateManager: !!this.stateManager,
                hasRouter: !!this.router,
                hasContext: !!this.context
            }
        };
    }
}

// ==================== Factory Functions ====================

export function createApp(config = {}) {
    return new VakamovaApp(config);
}

export async function bootstrapApp(config = {}) {
    console.log('[VakamovaBootstrap] 🚀 شروع راه‌اندازی برنامه...');
    
    try {
        // بارگذاری main.js اگر وجود دارد (اختیاری)
        let mainConfig = {};
        try {
            const mainModule = await import('./main.js');
            mainConfig = mainModule.config || {};
            console.log('[VakamovaBootstrap] ✅ main.js بارگذاری شد');
        } catch {
            console.log('[VakamovaBootstrap] 📝 main.js یافت نشد، از config پیش‌فرض استفاده می‌شود');
        }
        
        // ایجاد برنامه با ترکیب configها
        const appConfig = { ...mainConfig, ...config };
        const app = createApp(appConfig);
        
        // راه‌اندازی و mount
        await app.init();
        await app.mount();
        
        console.log('[VakamovaBootstrap] 🎉 برنامه با موفقیت راه‌اندازی شد');
        return app;
        
    } catch (error) {
        console.error('[VakamovaBootstrap] ❌ خطا در راه‌اندازی:', error);
        throw error;
    }
}

// ==================== راه‌اندازی خودکار ====================

// Global helper برای دسترسی آسان
if (typeof window !== 'undefined') {
    window.Vakamova = {
        createApp,
        bootstrapApp,
        version: '1.0.0'
    };
    
    console.log('[Vakamova] 🌍 API جهانی بارگذاری شد');
}

// راه‌اندازی خودکار اگر مستقیماً لود شود
if (import.meta.url === document.currentScript?.src) {
    document.addEventListener('DOMContentLoaded', () => {
        console.log('[Vakamova] 🔄 راه‌اندازی خودکار آغاز شد');
        
        // کمی تأخیر برای اطمینان از بارگذاری سایر ماژول‌ها
        setTimeout(() => {
            bootstrapApp().catch(error => {
                console.error('[Vakamova] ❌ راه‌اندازی خودکار ناموفق:', error);
                
                // نمایش خطا به کاربر
                const appContainer = document.querySelector('#app') || document.body;
                appContainer.innerHTML = `
                    <div style="padding: 40px; text-align: center; color: #dc2626;">
                        <h2>❌ خطا در راه‌اندازی برنامه</h2>
                        <p>${error.message}</p>
                        <button onclick="location.reload()" style="
                            background: #dc2626;
                            color: white;
                            border: none;
                            padding: 10px 20px;
                            border-radius: 5px;
                            margin-top: 20px;
                            cursor: pointer;
                        ">
                            تلاش مجدد
                        </button>
                    </div>
                `;
            });
        }, 100);
    });
                               }
