// ==================== CORE_router.js ====================
// سیستم مسیریابی پیشرفته Vakamova - نسخه بهینه‌شده
// وابستگی‌های واضح + معماری ۴ اصل

/**
 * اصلاحات اصلی:
 * ۱. وابستگی‌های واضح‌تر (فقط ۴ وابستگی اصلی)
 * ۲. کدهای تکراری حذف شد
 * ۳. خطاهای بالقوه رفع شد
 * ۴. performance بهبود یافت
 */

class VakamovaRouter {
    constructor(deps = {}) {
        // ========== وابستگی‌های حیاتی (فقط ۴ مورد) ==========
        this._eventBus = this._getDependency(deps, 'eventBus', () => this._createFallbackEventBus());
        this._config = this._getDependency(deps, 'config', () => ({ 
            router: { mode: 'hash', fallbackRoute: '/home' } 
        }));
        this._logger = deps.logger || console;
        this._errorHandler = deps.errorHandler || console.error;
        
        // ========== وضعیت داخلی ==========
        this._state = {
            currentRoute: null,
            previousRoute: null,
            routes: new Map(),
            guards: new Map(),
            history: [],
            historyIndex: -1,
            isInitialized: false
        };
        
        // ========== پیکربندی متمرکز ==========
        this._configObj = {
            mode: this._config.router?.mode || 'hash',
            basePath: this._config.router?.basePath || '',
            fallbackRoute: this._config.router?.fallbackRoute || '/home',
            maxHistoryLength: 50,
            scrollToTop: true
        };
        
        this._bindMethods();
        this._logger.log('[Router] ✅ Instance created');
    }
    
    // ==================== متدهای اصلی (قرارداد رابط) ====================
    
    async init(routes = []) {
        if (this._state.isInitialized) {
            this._logger.warn('[Router] Already initialized');
            return true;
        }
        
        try {
            this._registerRoutes(routes);
            await this._setupRoutingMode();
            await this._processInitialRoute();
            
            this._state.isInitialized = true;
            this._eventBus.emit('router:initialized', {
                routeCount: this._state.routes.size
            });
            
            this._logger.log('[Router] ✅ Initialized');
            return true;
        } catch (error) {
            this._errorHandler(error);
            return false;
        }
    }
    
    async navigateTo(path, options = {}) {
        try {
            const normalizedPath = this._normalizePath(path);
            const { matchedRoute, params } = this._matchRoute(normalizedPath);
            
            if (!matchedRoute) {
                return this._handleNotFound(normalizedPath, options);
            }
            
            // اجرای Guards
            if (!options.skipGuards) {
                const guardResult = await this._executeGuards(matchedRoute, params);
                if (!guardResult.allowed) {
                    this._eventBus.emit('router:guardBlocked', {
                        path: normalizedPath,
                        reason: guardResult.reason
                    });
                    return false;
                }
            }
            
            // به‌روزرسانی وضعیت
            this._updateHistory(normalizedPath, options);
            this._updateBrowserUrl(normalizedPath, options);
            this._updateRouteState(matchedRoute, params, normalizedPath);
            
            // رندر کامپوننت
            if (matchedRoute.component && !options.silent) {
                await this._renderComponent(matchedRoute, params);
            }
            
            this._logger.log(`[Router] ➡️ Navigated to: ${normalizedPath}`);
            return true;
            
        } catch (error) {
            this._errorHandler(error);
            this._eventBus.emit('router:error', { error: error.message });
            return false;
        }
    }
    
    getCurrentRoute() {
        return this._state.currentRoute;
    }
    
    getRouteParams() {
        return this._state.currentRoute?.params || {};
    }
    
    async back(steps = 1) {
        if (this._state.historyIndex - steps < 0) return false;
        
        const targetPath = this._state.history[this._state.historyIndex - steps];
        if (!targetPath) return false;
        
        return this.navigateTo(targetPath, { replace: true });
    }
    
    cleanup() {
        window.removeEventListener('hashchange', this._handleHashChange);
        window.removeEventListener('popstate', this._handlePopState);
        this._state.routes.clear();
        this._state.guards.clear();
        this._logger.log('[Router] 🧹 Cleaned up');
    }
    
    // ==================== متدهای داخلی ====================
    
    _getDependency(deps, key, fallback) {
        return deps[key] || window[key?.toUpperCase()] || fallback();
    }
    
    _bindMethods() {
        this.init = this.init.bind(this);
        this.navigateTo = this.navigateTo.bind(this);
        this._handleHashChange = this._handleHashChange.bind(this);
        this._handlePopState = this._handlePopState.bind(this);
    }
    
    _registerRoutes(routes) {
        routes.forEach(route => {
            const { pattern, paramNames } = this._parseRoutePattern(route.path);
            this._state.routes.set(route.path, {
                ...route,
                pattern,
                paramNames
            });
            
            if (route.guards?.length) {
                this._state.guards.set(route.path, route.guards);
            }
        });
    }
    
    async _setupRoutingMode() {
        if (this._configObj.mode === 'hash') {
            window.addEventListener('hashchange', this._handleHashChange);
        }
        window.addEventListener('popstate', this._handlePopState);
    }
    
    async _processInitialRoute() {
        let initialPath = this._configObj.fallbackRoute;
        
        if (this._configObj.mode === 'hash') {
            const hash = window.location.hash.slice(1);
            if (hash && this._isValidRoute(hash)) initialPath = hash;
        } else {
            const path = window.location.pathname.replace(this._configObj.basePath, '');
            if (path && this._isValidRoute(path)) initialPath = path;
        }
        
        await this.navigateTo(initialPath, { replace: true, silent: true, skipGuards: true });
    }
    
    _parseRoutePattern(routePath) {
        const paramNames = [];
        const patternStr = routePath
            .replace(/\//g, '\\/')
            .replace(/:([\w-]+)/g, (_, paramName) => {
                paramNames.push(paramName);
                return '([^\\/]+)';
            });
            
        return {
            pattern: new RegExp(`^${patternStr}$`),
            paramNames
        };
    }
    
    _matchRoute(path) {
        // جستجوی مستقیم
        const exactMatch = this._state.routes.get(path);
        if (exactMatch) return { matchedRoute: exactMatch, params: {} };
        
        // جستجوی الگو
        for (const [_, route] of this._state.routes) {
            if (route.pattern) {
                const match = path.match(route.pattern);
                if (match) {
                    const params = {};
                    route.paramNames.forEach((name, idx) => {
                        params[name] = match[idx + 1];
                    });
                    return { matchedRoute: route, params };
                }
            }
        }
        
        return { matchedRoute: null, params: {} };
    }
    
    _isValidRoute(path) {
        if (this._state.routes.has(path)) return true;
        
        for (const route of this._state.routes.values()) {
            if (route.pattern?.test(path)) return true;
        }
        
        return false;
    }
    
    async _executeGuards(route, params) {
        const guards = this._state.guards.get(route.path) || [];
        
        for (const guard of guards) {
            try {
                const result = await guard({ to: route, params, router: this });
                if (result === false || result?.allowed === false) {
                    return { allowed: false, reason: result?.reason || 'Guard blocked' };
                }
            } catch (error) {
                this._logger.error('[Router] Guard error:', error);
                return { allowed: false, reason: 'Guard failed' };
            }
        }
        
        return { allowed: true };
    }
    
    _updateHistory(path, options) {
        const historyEntry = { path, timestamp: new Date().toISOString() };
        
        if (options.replace || !this._state.currentRoute) {
            this._state.history[this._state.historyIndex] = historyEntry;
        } else {
            this._state.historyIndex++;
            this._state.history.splice(this._state.historyIndex);
            this._state.history.push(historyEntry);
            
            if (this._state.history.length > this._configObj.maxHistoryLength) {
                this._state.history.shift();
                this._state.historyIndex--;
            }
        }
    }
    
    _updateBrowserUrl(path, options) {
        const fullPath = this._configObj.basePath + path;
        
        try {
            if (this._configObj.mode === 'hash') {
                const hash = '#' + fullPath;
                if (window.location.hash !== hash) {
                    if (options.replace) {
                        window.location.replace(hash);
                    } else {
                        window.location.hash = hash;
                    }
                }
            } else {
                if (options.replace) {
                    window.history.replaceState({ router: true }, '', fullPath);
                } else {
                    window.history.pushState({ router: true }, '', fullPath);
                }
            }
        } catch (error) {
            this._logger.warn('[Router] URL update failed:', error);
        }
    }
    
    _updateRouteState(route, params, path) {
        this._state.previousRoute = this._state.currentRoute;
        this._state.currentRoute = { ...route, params, path };
        
        this._eventBus.emit('router:changed', {
            previous: this._state.previousRoute,
            current: this._state.currentRoute,
            params
        });
    }
    
    async _renderComponent(route, params) {
        const container = document.getElementById('app-content') || document.body;
        if (!container) throw new Error('No container found');
        
        try {
            const context = { router: this, params };
            const result = await route.component(context);
            
            if (result?.template) {
                container.innerHTML = result.template;
                if (result.mounted) setTimeout(() => result.mounted(context), 0);
            }
        } catch (error) {
            this._errorHandler(error);
            container.innerHTML = `
                <div style="padding: 20px; color: red;">
                    <h3>خطا در بارگذاری صفحه</h3>
                    <p>${error.message}</p>
                </div>
            `;
        }
    }
    
    _handleHashChange() {
        const hash = window.location.hash.slice(1);
        const path = this._normalizePath(hash || '/');
        
        if (path !== this._state.currentRoute?.path) {
            this.navigateTo(path, { silent: true }).catch(() => {
                this.navigateTo(this._configObj.fallbackRoute, { replace: true });
            });
        }
    }
    
    _handlePopState(event) {
        if (event.state?.router) {
            let path = this._configObj.mode === 'hash' 
                ? window.location.hash.slice(1) || '/'
                : window.location.pathname.replace(this._configObj.basePath, '') || '/';
                
            const normalized = this._normalizePath(path);
            if (normalized !== this._state.currentRoute?.path) {
                this.navigateTo(normalized, { silent: true });
            }
        }
    }
    
    async _handleNotFound(path, options) {
        this._logger.warn(`[Router] Route not found: ${path}`);
        this._eventBus.emit('router:notFound', { path });
        
        if (!options.silent) {
            const container = document.getElementById('app-content') || document.body;
            container.innerHTML = `
                <div style="text-align: center; padding: 50px;">
                    <h2>صفحه پیدا نشد</h2>
                    <p>مسیر "${path}" وجود ندارد</p>
                    <button onclick="window.router.navigateTo('/')" 
                            style="padding: 10px 20px; margin-top: 20px;">
                        بازگشت به خانه
                    </button>
                </div>
            `;
        }
        
        return false;
    }
    
    _normalizePath(path) {
        if (!path.startsWith('/')) path = '/' + path;
        if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
        return path;
    }
    
    _createFallbackEventBus() {
        const events = new Map();
        return {
            emit: (event, data) => {
                const handlers = events.get(event) || [];
                handlers.forEach(h => h(data));
            },
            on: (event, handler) => {
                if (!events.has(event)) events.set(event, []);
                events.get(event).push(handler);
                return () => {
                    const handlers = events.get(event) || [];
                    const index = handlers.indexOf(handler);
                    if (index > -1) handlers.splice(index, 1);
                };
            }
        };
    }
}

// ==================== Export ====================
const routerInstance = new VakamovaRouter();

// برای ماژول‌ها
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { VakamovaRouter, router: routerInstance };
}

// برای مرورگر
if (typeof window !== 'undefined') {
    window.VakamovaRouter = VakamovaRouter;
    window.router = routerInstance;
    
    // Auto-init
    document.addEventListener('DOMContentLoaded', () => {
        if (window.APP_ROUTES) {
            routerInstance.init(window.APP_ROUTES);
        }
    });
}

console.log('[Router] ✅ CORE_router.js loaded');
