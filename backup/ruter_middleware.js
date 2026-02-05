/**
 * VAKAMOVA ROUTER MIDDLEWARE - سیستم میان‌افزار مسیریابی پیشرفته
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 */

class RouterMiddleware {
    constructor(services = {}) {
        // تزریق وابستگی‌ها
        this.services = {
            eventBus: services.eventBus || window.eventBus,
            stateManager: services.stateManager || window.stateManager,
            authManager: services.authManager || window.authManager,
            config: services.config || { routes: {}, guards: {} }
        };
        
        this._validateDependencies();
        
        // رجیستری میان‌افزارها
        this._middlewares = new Map();
        this._routeGuards = new Map();
        this._activeGuards = new Set();
        
        // پیکربندی پیش‌فرض
        this._config = Object.freeze({
            defaultRedirect: '/',
            unauthorizedRedirect: '/auth',
            maintenanceRedirect: '/maintenance',
            enableLogging: true,
            ...this.services.config.router
        });
        
        // ایونت‌های استاندارد
        this.EVENTS = {
            ROUTE_CHANGE: 'router:route:change',
            GUARD_BLOCK: 'router:guard:block',
            MIDDLEWARE_RUN: 'router:middleware:run',
            REDIRECT: 'router:redirect'
        };
        
        this._init();
    }
    
    // ==================== PUBLIC API ====================
    
    async navigate(to, options = {}) {
        const from = this._getCurrentRoute();
        const context = this._createContext(from, to, options);
        
        // انتشار ایونت تغییر مسیر
        this.services.eventBus.emit(this.EVENTS.ROUTE_CHANGE, {
            from,
            to,
            context,
            timestamp: Date.now()
        });
        
        // اجرای گاردهای مسیر
        const guardResult = await this._runRouteGuards(context);
        if (!guardResult.allowed) {
            return this._handleGuardBlock(guardResult, context);
        }
        
        // اجرای میان‌افزارها
        const middlewareResult = await this._runMiddlewares(context);
        if (!middlewareResult.continue) {
            return this._handleMiddlewareBlock(middlewareResult, context);
        }
        
        // انجام ناوبری نهایی
        return this._commitNavigation(context);
    }
    
    registerMiddleware(name, middleware, priority = 0) {
        if (typeof middleware !== 'function') {
            throw new Error('Middleware must be a function');
        }
        
        this._middlewares.set(name, { middleware, priority });
        this._sortMiddlewares();
        
        this.services.eventBus.emit('router:middleware:registered', { name, priority });
        return () => this.unregisterMiddleware(name);
    }
    
    registerRouteGuard(routePattern, guardConfig) {
        const guard = {
            pattern: this._normalizePattern(routePattern),
            handler: guardConfig.handler,
            fallback: guardConfig.fallback || this._config.unauthorizedRedirect,
            priority: guardConfig.priority || 0,
            metadata: guardConfig.metadata || {}
        };
        
        this._routeGuards.set(routePattern, guard);
        this._activeGuards.add(routePattern);
        
        this.services.eventBus.emit('router:guard:registered', { 
            pattern: routePattern,
            priority: guard.priority 
        });
        
        return () => this.unregisterRouteGuard(routePattern);
    }
    
    async checkPermissions(route, user = null) {
        const userData = user || this.services.stateManager.get('user.current');
        const routeMeta = this._extractRouteMetadata(route);
        
        // چک گاردهای خاص مسیر
        for (const [pattern, guard] of this._routeGuards) {
            if (this._matchRoute(pattern, route)) {
                try {
                    const result = await guard.handler(userData, routeMeta);
                    if (!result.allowed) {
                        return {
                            allowed: false,
                            reason: result.reason || 'guard_blocked',
                            redirect: result.redirect || guard.fallback,
                            guard: pattern
                        };
                    }
                } catch (error) {
                    return {
                        allowed: false,
                        reason: 'guard_error',
                        error: error.message,
                        redirect: this._config.unauthorizedRedirect
                    };
                }
            }
        }
        
        // چک پرمیژن‌های عمومی
        const generalCheck = await this._checkGeneralPermissions(userData, routeMeta);
        if (!generalCheck.allowed) {
            return generalCheck;
        }
        
        return { allowed: true, routeMeta };
    }
    
    // ==================== GUARD HANDLERS ====================
    
    createAuthGuard(options = {}) {
        return async (user, routeMeta) => {
            const isAuthenticated = user && user.id && !user.isGuest;
            
            if (!isAuthenticated && options.requireAuth) {
                return {
                    allowed: false,
                    reason: 'authentication_required',
                    redirect: options.redirectTo || this._config.unauthorizedRedirect
                };
            }
            
            if (isAuthenticated && options.redirectIfAuthenticated) {
                return {
                    allowed: false,
                    reason: 'already_authenticated',
                    redirect: options.redirectTo || this._config.defaultRedirect
                };
            }
            
            // چک رول‌ها
            if (options.requiredRoles && user) {
                const hasRole = options.requiredRoles.some(role => 
                    user.roles && user.roles.includes(role)
                );
                
                if (!hasRole) {
                    return {
                        allowed: false,
                        reason: 'insufficient_permissions',
                        redirect: options.redirectTo || this._config.unauthorizedRedirect
                    };
                }
            }
            
            return { allowed: true };
        };
    }
    
    createMaintenanceGuard(isMaintenance = false) {
        return async (user, routeMeta) => {
            const maintenanceMode = isMaintenance || 
                this.services.stateManager.get('system.maintenance');
            
            if (maintenanceMode && !routeMeta.allowDuringMaintenance) {
                const isAdmin = user && user.roles && user.roles.includes('admin');
                
                if (!isAdmin) {
                    return {
                        allowed: false,
                        reason: 'maintenance_mode',
                        redirect: this._config.maintenanceRedirect
                    };
                }
            }
            
            return { allowed: true };
        };
    }
    
    createRateLimitGuard(limit = 10, windowMs = 60000) {
        const requests = new Map();
        
        return async (user, routeMeta) => {
            const key = user ? `user_${user.id}` : `ip_${routeMeta.ip}`;
            const now = Date.now();
            
            if (!requests.has(key)) {
                requests.set(key, []);
            }
            
            const userRequests = requests.get(key);
            const windowStart = now - windowMs;
            
            // حذف ریکوئست‌های قدیمی
            const validRequests = userRequests.filter(time => time > windowStart);
            requests.set(key, validRequests);
            
            if (validRequests.length >= limit) {
                return {
                    allowed: false,
                    reason: 'rate_limit_exceeded',
                    retryAfter: Math.ceil((validRequests[0] + windowMs - now) / 1000)
                };
            }
            
            validRequests.push(now);
            return { allowed: true };
        };
    }
    
    // ==================== MIDDLEWARE HANDLERS ====================
    
    createLoggingMiddleware() {
        return async (context, next) => {
            const startTime = Date.now();
            
            if (this._config.enableLogging) {
                console.group(`[Router] Navigation: ${context.from} → ${context.to}`);
                console.log('Context:', context);
            }
            
            await next();
            
            const duration = Date.now() - startTime;
            
            if (this._config.enableLogging) {
                console.log(`Duration: ${duration}ms`);
                console.groupEnd();
            }
            
            this.services.eventBus.emit(this.EVENTS.MIDDLEWARE_RUN, {
                middleware: 'logging',
                context,
                duration
            });
        };
    }
    
    createAnalyticsMiddleware() {
        return async (context, next) => {
            await next();
            
            this.services.eventBus.emit('analytics:pageview', {
                path: context.to,
                referrer: context.from,
                timestamp: Date.now(),
                userAgent: navigator.userAgent,
                language: navigator.language
            });
        };
    }
    
    createLoadingMiddleware() {
        return async (context, next) => {
            this.services.stateManager.set('ui.loading', true, {
                namespace: 'router',
                source: 'middleware'
            });
            
            try {
                await next();
            } finally {
                this.services.stateManager.set('ui.loading', false, {
                    namespace: 'router',
                    source: 'middleware'
                });
            }
        };
    }
    
    // ==================== CORE NAVIGATION ====================
    
    async _commitNavigation(context) {
        // آپدیت state با مسیر جدید
        this.services.stateManager.set('router.current', {
            path: context.to,
            params: context.params,
            query: context.query,
            timestamp: Date.now()
        }, {
            namespace: 'system',
            source: 'router'
        });
        
        // تاریخچه
        this._updateHistory(context);
        
        // انتشار ایونت نهایی
        this.services.eventBus.emit('router:navigation:committed', {
            to: context.to,
            context,
            timestamp: Date.now()
        });
        
        return {
            success: true,
            to: context.to,
            context,
            committedAt: Date.now()
        };
    }
    
    // ==================== INTERNAL METHODS ====================
    
    _validateDependencies() {
        const required = ['eventBus', 'stateManager'];
        required.forEach(service => {
            if (!this.services[service]) {
                throw new Error(`Required service "${service}" not provided`);
            }
        });
    }
    
    _init() {
        // ثبت میان‌افزارهای پیش‌فرض
        this.registerMiddleware('logging', this.createLoggingMiddleware(), 100);
        this.registerMiddleware('analytics', this.createAnalyticsMiddleware(), 90);
        this.registerMiddleware('loading', this.createLoadingMiddleware(), 80);
        
        // ثبت گاردهای پیش‌فرض
        this.registerRouteGuard('/auth/*', {
            handler: this.createAuthGuard({ 
                redirectIfAuthenticated: true,
                redirectTo: '/'
            }),
            priority: 100
        });
        
        this.registerRouteGuard('/dashboard/*', {
            handler: this.createAuthGuard({ 
                requireAuth: true,
                requiredRoles: ['user', 'admin']
            }),
            priority: 100
        });
        
        this.registerRouteGuard('/admin/*', {
            handler: this.createAuthGuard({ 
                requireAuth: true,
                requiredRoles: ['admin']
            }),
            priority: 100
        });
        
        // گوش دادن به ایونت‌های تغییر مسیر
        this.services.eventBus.on('app:navigate', (data) => {
            this.navigate(data.to, data.options);
        });
        
        // گوش دادن به تغییرات state برای مسیر
        this.services.stateManager.subscribe('router.current', (newRoute) => {
            this.services.eventBus.emit('router:location:changed', newRoute);
        });
    }
    
    async _runRouteGuards(context) {
        const guardResults = [];
        
        // اجرای گاردهای منطبق
        for (const [pattern, guard] of this._routeGuards) {
            if (this._matchRoute(pattern, context.to)) {
                try {
                    const user = this.services.stateManager.get('user.current');
                    const result = await guard.handler(user, context);
                    
                    guardResults.push({
                        guard: pattern,
                        result,
                        context
                    });
                    
                    if (!result.allowed) {
                        return {
                            allowed: false,
                            reason: result.reason,
                            redirect: result.redirect,
                            guard: pattern,
                            results: guardResults
                        };
                    }
                } catch (error) {
                    return {
                        allowed: false,
                        reason: 'guard_execution_error',
                        error: error.message,
                        guard: pattern,
                        results: guardResults
                    };
                }
            }
        }
        
        return {
            allowed: true,
            results: guardResults
        };
    }
    
    async _runMiddlewares(context) {
        const middlewares = Array.from(this._middlewares.values())
            .sort((a, b) => b.priority - a.priority);
        
        let index = 0;
        let shouldContinue = true;
        
        const next = async () => {
            if (index < middlewares.length && shouldContinue) {
                const current = middlewares[index++];
                try {
                    await current.middleware(context, next);
                } catch (error) {
                    shouldContinue = false;
                    throw error;
                }
            }
        };
        
        try {
            await next();
            return { continue: true };
        } catch (error) {
            return {
                continue: false,
                error: error.message,
                failedMiddleware: middlewares[index - 1]
            };
        }
    }
    
    _handleGuardBlock(result, context) {
        this.services.eventBus.emit(this.EVENTS.GUARD_BLOCK, {
            ...result,
            context,
            timestamp: Date.now()
        });
        
        // ریدایرکت اگر مشخص شده
        if (result.redirect) {
            this.services.eventBus.emit(this.EVENTS.REDIRECT, {
                from: context.to,
                to: result.redirect,
                reason: result.reason,
                timestamp: Date.now()
            });
            
            // ریدایرکت خودکار
            setTimeout(() => {
                this.navigate(result.redirect, {
                    replace: true,
                    source: 'guard_block'
                });
            }, 0);
        }
        
        return {
            success: false,
            blocked: true,
            reason: result.reason,
            redirect: result.redirect,
            guard: result.guard
        };
    }
    
    _handleMiddlewareBlock(result, context) {
        this.services.eventBus.emit('router:middleware:blocked', {
            ...result,
            context,
            timestamp: Date.now()
        });
        
        return {
            success: false,
            blocked: true,
            reason: 'middleware_error',
            error: result.error
        };
    }
    
    _getCurrentRoute() {
        const routeState = this.services.stateManager.get('router.current');
        return routeState ? routeState.path : window.location.pathname;
    }
    
    _createContext(from, to, options) {
        // پارس کردن پارامترها
        const params = this._extractParams(to);
        const query = this._parseQueryString(options.query || '');
        
        return {
            from,
            to,
            params,
            query,
            options,
            timestamp: Date.now(),
            user: this.services.stateManager.get('user.current'),
            session: this.services.stateManager.get('session.current'),
            metadata: this._extractRouteMetadata(to)
        };
    }
    
    _extractParams(route) {
        // استخراج پارامترهای داینامیک از مسیر
        const paramRegex = /:([a-zA-Z0-9_]+)/g;
        const params = {};
        let match;
        
        while ((match = paramRegex.exec(route)) !== null) {
            params[match[1]] = null; // مقدار در ران‌تایم پر می‌شود
        }
        
        return params;
    }
    
    _parseQueryString(queryString) {
        const params = {};
        const query = queryString.startsWith('?') ? queryString.slice(1) : queryString;
        
        query.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key) {
                params[decodeURIComponent(key)] = decodeURIComponent(value || '');
            }
        });
        
        return params;
    }
    
    _matchRoute(pattern, route) {
        // تبدیل الگو به regex
        const regexPattern = pattern
            .replace(/\*/g, '.*')
            .replace(/:[a-zA-Z0-9_]+/g, '([^/]+)');
        
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(route);
    }
    
    _normalizePattern(pattern) {
        return pattern.startsWith('/') ? pattern : `/${pattern}`;
    }
    
    _extractRouteMetadata(route) {
        const meta = {
            path: route,
            segments: route.split('/').filter(s => s),
            isProtected: false,
            requiresAuth: false,
            allowedRoles: [],
            allowDuringMaintenance: false
        };
        
        // استخراج metadata از config
        const routeConfig = this._config.routes?.[route];
        if (routeConfig) {
            Object.assign(meta, routeConfig);
        }
        
        return meta;
    }
    
    async _checkGeneralPermissions(user, routeMeta) {
        // چک وضعیت کاربر
        if (!user && routeMeta.requiresAuth) {
            return {
                allowed: false,
                reason: 'authentication_required',
                redirect: this._config.unauthorizedRedirect
            };
        }
        
        // چک رول‌ها
        if (routeMeta.allowedRoles.length > 0 && user) {
            const hasRole = routeMeta.allowedRoles.some(role =>
                user.roles && user.roles.includes(role)
            );
            
            if (!hasRole) {
                return {
                    allowed: false,
                    reason: 'insufficient_roles',
                    redirect: this._config.unauthorizedRedirect
                };
            }
        }
        
        return { allowed: true };
    }
    
    _updateHistory(context) {
        const historyEntry = {
            path: context.to,
            params: context.params,
            query: context.query,
            timestamp: Date.now(),
            context
        };
        
        // آپدیت state تاریخچه
        const currentHistory = this.services.stateManager.get('router.history') || [];
        currentHistory.push(historyEntry);
        
        // محدود کردن اندازه تاریخچه
        if (currentHistory.length > 50) {
            currentHistory.shift();
        }
        
        this.services.stateManager.set('router.history', currentHistory, {
            namespace: 'system',
            source: 'router'
        });
    }
    
    _sortMiddlewares() {
        // middlewareها بر اساس priority مرتب می‌شوند
        const sorted = Array.from(this._middlewares.entries())
            .sort((a, b) => b[1].priority - a[1].priority);
        
        this._middlewares = new Map(sorted);
    }
    
    unregisterMiddleware(name) {
        const existed = this._middlewares.delete(name);
        if (existed) {
            this.services.eventBus.emit('router:middleware:unregistered', { name });
        }
        return existed;
    }
    
    unregisterRouteGuard(pattern) {
        const existed = this._routeGuards.delete(pattern);
        if (existed) {
            this._activeGuards.delete(pattern);
            this.services.eventBus.emit('router:guard:unregistered', { pattern });
        }
        return existed;
    }
    
    // ==================== UTILITY METHODS ====================
    
    getActiveGuards() {
        return Array.from(this._activeGuards);
    }
    
    getRegisteredMiddlewares() {
        return Array.from(this._middlewares.keys());
    }
    
    updateConfig(newConfig) {
        this._config = Object.freeze({
            ...this._config,
            ...newConfig
        });
        
        this.services.eventBus.emit('router:config:updated', {
            config: this._config,
            timestamp: Date.now()
        });
        
        return this._config;
    }
    
    clearHistory() {
        this.services.stateManager.set('router.history', [], {
            namespace: 'system',
            source: 'router'
        });
        
        return true;
    }
    
    destroy() {
        // پاک کردن ایونت‌ها
        this.services.eventBus.off('app:navigate');
        
        // پاک کردن state
        this.services.stateManager.delete('router.current');
        this.services.stateManager.delete('router.history');
        
        // پاک کردن رجیستری‌ها
        this._middlewares.clear();
        this._routeGuards.clear();
        this._activeGuards.clear();
        
        this.services.eventBus.emit('router:destroyed', {
            timestamp: Date.now()
        });
    }
}

// ایجاد Singleton instance
let routerMiddlewareInstance = null;

function createRouterMiddleware(services = {}) {
    if (!routerMiddlewareInstance) {
        routerMiddlewareInstance = new RouterMiddleware(services);
    }
    return routerMiddlewareInstance;
}

// Export برای استفاده
export { RouterMiddleware, createRouterMiddleware };/**
 * VAKAMOVA ROUTER MIDDLEWARE - سیستم میان‌افزار مسیریابی پیشرفته
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 */

class RouterMiddleware {
    constructor(services = {}) {
        // تزریق وابستگی‌ها
        this.services = {
            eventBus: services.eventBus || window.eventBus,
            stateManager: services.stateManager || window.stateManager,
            authManager: services.authManager || window.authManager,
            config: services.config || { routes: {}, guards: {} }
        };
        
        this._validateDependencies();
        
        // رجیستری میان‌افزارها
        this._middlewares = new Map();
        this._routeGuards = new Map();
        this._activeGuards = new Set();
        
        // پیکربندی پیش‌فرض
        this._config = Object.freeze({
            defaultRedirect: '/',
            unauthorizedRedirect: '/auth',
            maintenanceRedirect: '/maintenance',
            enableLogging: true,
            ...this.services.config.router
        });
        
        // ایونت‌های استاندارد
        this.EVENTS = {
            ROUTE_CHANGE: 'router:route:change',
            GUARD_BLOCK: 'router:guard:block',
            MIDDLEWARE_RUN: 'router:middleware:run',
            REDIRECT: 'router:redirect'
        };
        
        this._init();
    }
    
    // ==================== PUBLIC API ====================
    
    async navigate(to, options = {}) {
        const from = this._getCurrentRoute();
        const context = this._createContext(from, to, options);
        
        // انتشار ایونت تغییر مسیر
        this.services.eventBus.emit(this.EVENTS.ROUTE_CHANGE, {
            from,
            to,
            context,
            timestamp: Date.now()
        });
        
        // اجرای گاردهای مسیر
        const guardResult = await this._runRouteGuards(context);
        if (!guardResult.allowed) {
            return this._handleGuardBlock(guardResult, context);
        }
        
        // اجرای میان‌افزارها
        const middlewareResult = await this._runMiddlewares(context);
        if (!middlewareResult.continue) {
            return this._handleMiddlewareBlock(middlewareResult, context);
        }
        
        // انجام ناوبری نهایی
        return this._commitNavigation(context);
    }
    
    registerMiddleware(name, middleware, priority = 0) {
        if (typeof middleware !== 'function') {
            throw new Error('Middleware must be a function');
        }
        
        this._middlewares.set(name, { middleware, priority });
        this._sortMiddlewares();
        
        this.services.eventBus.emit('router:middleware:registered', { name, priority });
        return () => this.unregisterMiddleware(name);
    }
    
    registerRouteGuard(routePattern, guardConfig) {
        const guard = {
            pattern: this._normalizePattern(routePattern),
            handler: guardConfig.handler,
            fallback: guardConfig.fallback || this._config.unauthorizedRedirect,
            priority: guardConfig.priority || 0,
            metadata: guardConfig.metadata || {}
        };
        
        this._routeGuards.set(routePattern, guard);
        this._activeGuards.add(routePattern);
        
        this.services.eventBus.emit('router:guard:registered', { 
            pattern: routePattern,
            priority: guard.priority 
        });
        
        return () => this.unregisterRouteGuard(routePattern);
    }
    
    async checkPermissions(route, user = null) {
        const userData = user || this.services.stateManager.get('user.current');
        const routeMeta = this._extractRouteMetadata(route);
        
        // چک گاردهای خاص مسیر
        for (const [pattern, guard] of this._routeGuards) {
            if (this._matchRoute(pattern, route)) {
                try {
                    const result = await guard.handler(userData, routeMeta);
                    if (!result.allowed) {
                        return {
                            allowed: false,
                            reason: result.reason || 'guard_blocked',
                            redirect: result.redirect || guard.fallback,
                            guard: pattern
                        };
                    }
                } catch (error) {
                    return {
                        allowed: false,
                        reason: 'guard_error',
                        error: error.message,
                        redirect: this._config.unauthorizedRedirect
                    };
                }
            }
        }
        
        // چک پرمیژن‌های عمومی
        const generalCheck = await this._checkGeneralPermissions(userData, routeMeta);
        if (!generalCheck.allowed) {
            return generalCheck;
        }
        
        return { allowed: true, routeMeta };
    }
    
    // ==================== GUARD HANDLERS ====================
    
    createAuthGuard(options = {}) {
        return async (user, routeMeta) => {
            const isAuthenticated = user && user.id && !user.isGuest;
            
            if (!isAuthenticated && options.requireAuth) {
                return {
                    allowed: false,
                    reason: 'authentication_required',
                    redirect: options.redirectTo || this._config.unauthorizedRedirect
                };
            }
            
            if (isAuthenticated && options.redirectIfAuthenticated) {
                return {
                    allowed: false,
                    reason: 'already_authenticated',
                    redirect: options.redirectTo || this._config.defaultRedirect
                };
            }
            
            // چک رول‌ها
            if (options.requiredRoles && user) {
                const hasRole = options.requiredRoles.some(role => 
                    user.roles && user.roles.includes(role)
                );
                
                if (!hasRole) {
                    return {
                        allowed: false,
                        reason: 'insufficient_permissions',
                        redirect: options.redirectTo || this._config.unauthorizedRedirect
                    };
                }
            }
            
            return { allowed: true };
        };
    }
    
    createMaintenanceGuard(isMaintenance = false) {
        return async (user, routeMeta) => {
            const maintenanceMode = isMaintenance || 
                this.services.stateManager.get('system.maintenance');
            
            if (maintenanceMode && !routeMeta.allowDuringMaintenance) {
                const isAdmin = user && user.roles && user.roles.includes('admin');
                
                if (!isAdmin) {
                    return {
                        allowed: false,
                        reason: 'maintenance_mode',
                        redirect: this._config.maintenanceRedirect
                    };
                }
            }
            
            return { allowed: true };
        };
    }
    
    createRateLimitGuard(limit = 10, windowMs = 60000) {
        const requests = new Map();
        
        return async (user, routeMeta) => {
            const key = user ? `user_${user.id}` : `ip_${routeMeta.ip}`;
            const now = Date.now();
            
            if (!requests.has(key)) {
                requests.set(key, []);
            }
            
            const userRequests = requests.get(key);
            const windowStart = now - windowMs;
            
            // حذف ریکوئست‌های قدیمی
            const validRequests = userRequests.filter(time => time > windowStart);
            requests.set(key, validRequests);
            
            if (validRequests.length >= limit) {
                return {
                    allowed: false,
                    reason: 'rate_limit_exceeded',
                    retryAfter: Math.ceil((validRequests[0] + windowMs - now) / 1000)
                };
            }
            
            validRequests.push(now);
            return { allowed: true };
        };
    }
    
    // ==================== MIDDLEWARE HANDLERS ====================
    
    createLoggingMiddleware() {
        return async (context, next) => {
            const startTime = Date.now();
            
            if (this._config.enableLogging) {
                console.group(`[Router] Navigation: ${context.from} → ${context.to}`);
                console.log('Context:', context);
            }
            
            await next();
            
            const duration = Date.now() - startTime;
            
            if (this._config.enableLogging) {
                console.log(`Duration: ${duration}ms`);
                console.groupEnd();
            }
            
            this.services.eventBus.emit(this.EVENTS.MIDDLEWARE_RUN, {
                middleware: 'logging',
                context,
                duration
            });
        };
    }
    
    createAnalyticsMiddleware() {
        return async (context, next) => {
            await next();
            
            this.services.eventBus.emit('analytics:pageview', {
                path: context.to,
                referrer: context.from,
                timestamp: Date.now(),
                userAgent: navigator.userAgent,
                language: navigator.language
            });
        };
    }
    
    createLoadingMiddleware() {
        return async (context, next) => {
            this.services.stateManager.set('ui.loading', true, {
                namespace: 'router',
                source: 'middleware'
            });
            
            try {
                await next();
            } finally {
                this.services.stateManager.set('ui.loading', false, {
                    namespace: 'router',
                    source: 'middleware'
                });
            }
        };
    }
    
    // ==================== CORE NAVIGATION ====================
    
    async _commitNavigation(context) {
        // آپدیت state با مسیر جدید
        this.services.stateManager.set('router.current', {
            path: context.to,
            params: context.params,
            query: context.query,
            timestamp: Date.now()
        }, {
            namespace: 'system',
            source: 'router'
        });
        
        // تاریخچه
        this._updateHistory(context);
        
        // انتشار ایونت نهایی
        this.services.eventBus.emit('router:navigation:committed', {
            to: context.to,
            context,
            timestamp: Date.now()
        });
        
        return {
            success: true,
            to: context.to,
            context,
            committedAt: Date.now()
        };
    }
    
    // ==================== INTERNAL METHODS ====================
    
    _validateDependencies() {
        const required = ['eventBus', 'stateManager'];
        required.forEach(service => {
            if (!this.services[service]) {
                throw new Error(`Required service "${service}" not provided`);
            }
        });
    }
    
    _init() {
        // ثبت میان‌افزارهای پیش‌فرض
        this.registerMiddleware('logging', this.createLoggingMiddleware(), 100);
        this.registerMiddleware('analytics', this.createAnalyticsMiddleware(), 90);
        this.registerMiddleware('loading', this.createLoadingMiddleware(), 80);
        
        // ثبت گاردهای پیش‌فرض
        this.registerRouteGuard('/auth/*', {
            handler: this.createAuthGuard({ 
                redirectIfAuthenticated: true,
                redirectTo: '/'
            }),
            priority: 100
        });
        
        this.registerRouteGuard('/dashboard/*', {
            handler: this.createAuthGuard({ 
                requireAuth: true,
                requiredRoles: ['user', 'admin']
            }),
            priority: 100
        });
        
        this.registerRouteGuard('/admin/*', {
            handler: this.createAuthGuard({ 
                requireAuth: true,
                requiredRoles: ['admin']
            }),
            priority: 100
        });
        
        // گوش دادن به ایونت‌های تغییر مسیر
        this.services.eventBus.on('app:navigate', (data) => {
            this.navigate(data.to, data.options);
        });
        
        // گوش دادن به تغییرات state برای مسیر
        this.services.stateManager.subscribe('router.current', (newRoute) => {
            this.services.eventBus.emit('router:location:changed', newRoute);
        });
    }
    
    async _runRouteGuards(context) {
        const guardResults = [];
        
        // اجرای گاردهای منطبق
        for (const [pattern, guard] of this._routeGuards) {
            if (this._matchRoute(pattern, context.to)) {
                try {
                    const user = this.services.stateManager.get('user.current');
                    const result = await guard.handler(user, context);
                    
                    guardResults.push({
                        guard: pattern,
                        result,
                        context
                    });
                    
                    if (!result.allowed) {
                        return {
                            allowed: false,
                            reason: result.reason,
                            redirect: result.redirect,
                            guard: pattern,
                            results: guardResults
                        };
                    }
                } catch (error) {
                    return {
                        allowed: false,
                        reason: 'guard_execution_error',
                        error: error.message,
                        guard: pattern,
                        results: guardResults
                    };
                }
            }
        }
        
        return {
            allowed: true,
            results: guardResults
        };
    }
    
    async _runMiddlewares(context) {
        const middlewares = Array.from(this._middlewares.values())
            .sort((a, b) => b.priority - a.priority);
        
        let index = 0;
        let shouldContinue = true;
        
        const next = async () => {
            if (index < middlewares.length && shouldContinue) {
                const current = middlewares[index++];
                try {
                    await current.middleware(context, next);
                } catch (error) {
                    shouldContinue = false;
                    throw error;
                }
            }
        };
        
        try {
            await next();
            return { continue: true };
        } catch (error) {
            return {
                continue: false,
                error: error.message,
                failedMiddleware: middlewares[index - 1]
            };
        }
    }
    
    _handleGuardBlock(result, context) {
        this.services.eventBus.emit(this.EVENTS.GUARD_BLOCK, {
            ...result,
            context,
            timestamp: Date.now()
        });
        
        // ریدایرکت اگر مشخص شده
        if (result.redirect) {
            this.services.eventBus.emit(this.EVENTS.REDIRECT, {
                from: context.to,
                to: result.redirect,
                reason: result.reason,
                timestamp: Date.now()
            });
            
            // ریدایرکت خودکار
            setTimeout(() => {
                this.navigate(result.redirect, {
                    replace: true,
                    source: 'guard_block'
                });
            }, 0);
        }
        
        return {
            success: false,
            blocked: true,
            reason: result.reason,
            redirect: result.redirect,
            guard: result.guard
        };
    }
    
    _handleMiddlewareBlock(result, context) {
        this.services.eventBus.emit('router:middleware:blocked', {
            ...result,
            context,
            timestamp: Date.now()
        });
        
        return {
            success: false,
            blocked: true,
            reason: 'middleware_error',
            error: result.error
        };
    }
    
    _getCurrentRoute() {
        const routeState = this.services.stateManager.get('router.current');
        return routeState ? routeState.path : window.location.pathname;
    }
    
    _createContext(from, to, options) {
        // پارس کردن پارامترها
        const params = this._extractParams(to);
        const query = this._parseQueryString(options.query || '');
        
        return {
            from,
            to,
            params,
            query,
            options,
            timestamp: Date.now(),
            user: this.services.stateManager.get('user.current'),
            session: this.services.stateManager.get('session.current'),
            metadata: this._extractRouteMetadata(to)
        };
    }
    
    _extractParams(route) {
        // استخراج پارامترهای داینامیک از مسیر
        const paramRegex = /:([a-zA-Z0-9_]+)/g;
        const params = {};
        let match;
        
        while ((match = paramRegex.exec(route)) !== null) {
            params[match[1]] = null; // مقدار در ران‌تایم پر می‌شود
        }
        
        return params;
    }
    
    _parseQueryString(queryString) {
        const params = {};
        const query = queryString.startsWith('?') ? queryString.slice(1) : queryString;
        
        query.split('&').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key) {
                params[decodeURIComponent(key)] = decodeURIComponent(value || '');
            }
        });
        
        return params;
    }
    
    _matchRoute(pattern, route) {
        // تبدیل الگو به regex
        const regexPattern = pattern
            .replace(/\*/g, '.*')
            .replace(/:[a-zA-Z0-9_]+/g, '([^/]+)');
        
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(route);
    }
    
    _normalizePattern(pattern) {
        return pattern.startsWith('/') ? pattern : `/${pattern}`;
    }
    
    _extractRouteMetadata(route) {
        const meta = {
            path: route,
            segments: route.split('/').filter(s => s),
            isProtected: false,
            requiresAuth: false,
            allowedRoles: [],
            allowDuringMaintenance: false
        };
        
        // استخراج metadata از config
        const routeConfig = this._config.routes?.[route];
        if (routeConfig) {
            Object.assign(meta, routeConfig);
        }
        
        return meta;
    }
    
    async _checkGeneralPermissions(user, routeMeta) {
        // چک وضعیت کاربر
        if (!user && routeMeta.requiresAuth) {
            return {
                allowed: false,
                reason: 'authentication_required',
                redirect: this._config.unauthorizedRedirect
            };
        }
        
        // چک رول‌ها
        if (routeMeta.allowedRoles.length > 0 && user) {
            const hasRole = routeMeta.allowedRoles.some(role =>
                user.roles && user.roles.includes(role)
            );
            
            if (!hasRole) {
                return {
                    allowed: false,
                    reason: 'insufficient_roles',
                    redirect: this._config.unauthorizedRedirect
                };
            }
        }
        
        return { allowed: true };
    }
    
    _updateHistory(context) {
        const historyEntry = {
            path: context.to,
            params: context.params,
            query: context.query,
            timestamp: Date.now(),
            context
        };
        
        // آپدیت state تاریخچه
        const currentHistory = this.services.stateManager.get('router.history') || [];
        currentHistory.push(historyEntry);
        
        // محدود کردن اندازه تاریخچه
        if (currentHistory.length > 50) {
            currentHistory.shift();
        }
        
        this.services.stateManager.set('router.history', currentHistory, {
            namespace: 'system',
            source: 'router'
        });
    }
    
    _sortMiddlewares() {
        // middlewareها بر اساس priority مرتب می‌شوند
        const sorted = Array.from(this._middlewares.entries())
            .sort((a, b) => b[1].priority - a[1].priority);
        
        this._middlewares = new Map(sorted);
    }
    
    unregisterMiddleware(name) {
        const existed = this._middlewares.delete(name);
        if (existed) {
            this.services.eventBus.emit('router:middleware:unregistered', { name });
        }
        return existed;
    }
    
    unregisterRouteGuard(pattern) {
        const existed = this._routeGuards.delete(pattern);
        if (existed) {
            this._activeGuards.delete(pattern);
            this.services.eventBus.emit('router:guard:unregistered', { pattern });
        }
        return existed;
    }
    
    // ==================== UTILITY METHODS ====================
    
    getActiveGuards() {
        return Array.from(this._activeGuards);
    }
    
    getRegisteredMiddlewares() {
        return Array.from(this._middlewares.keys());
    }
    
    updateConfig(newConfig) {
        this._config = Object.freeze({
            ...this._config,
            ...newConfig
        });
        
        this.services.eventBus.emit('router:config:updated', {
            config: this._config,
            timestamp: Date.now()
        });
        
        return this._config;
    }
    
    clearHistory() {
        this.services.stateManager.set('router.history', [], {
            namespace: 'system',
            source: 'router'
        });
        
        return true;
    }
    
    destroy() {
        // پاک کردن ایونت‌ها
        this.services.eventBus.off('app:navigate');
        
        // پاک کردن state
        this.services.stateManager.delete('router.current');
        this.services.stateManager.delete('router.history');
        
        // پاک کردن رجیستری‌ها
        this._middlewares.clear();
        this._routeGuards.clear();
        this._activeGuards.clear();
        
        this.services.eventBus.emit('router:destroyed', {
            timestamp: Date.now()
        });
    }
}

// ایجاد Singleton instance
let routerMiddlewareInstance = null;

function createRouterMiddleware(services = {}) {
    if (!routerMiddlewareInstance) {
        routerMiddlewareInstance = new RouterMiddleware(services);
    }
    return routerMiddlewareInstance;
}

// Export برای استفاده
export { RouterMiddleware, createRouterMiddleware };
