/**
 * VAKAMOVA AUTH MIDDLEWARE - سیستم میان‌افزار امنیتی پیشرفته
 * اصول: تزریق وابستگی، قرارداد رابط، رویداد محور، پیکربندی متمرکز
 * وابستگی‌های داخلی: auth_manager.js, permission_checker.js, router.js, event_bus.js
 */

class VakamovaAuthMiddleware {
    constructor(dependencies = {}) {
        // ==================== تزریق وابستگی‌های حیاتی ====================
        this._services = {
            auth: dependencies.authManager || window.authManager,
            permissions: dependencies.permissionChecker || window.permissionChecker,
            router: dependencies.router || window.router,
            events: dependencies.eventBus || window.eventBus
        };
        
        // اعتبارسنجی وابستگی‌های ضروری
        this._validateDependencies();
        
        // ==================== پیکربندی متمرکز ====================
        this._config = Object.freeze({
            // تنظیمات عمومی
            enabled: true,
            mode: 'strict', // strict | permissive | monitor
            autoProtect: true,
            failSilently: false,
            
            // تنظیمات مسیرها
            defaultAccess: 'authenticated', // public | authenticated | guest
            publicRoutes: [
                '/',
                '/login',
                '/register',
                '/forgot-password',
                '/reset-password',
                '/verify-email',
                '/api/public/*'
            ],
            guestRoutes: [
                '/welcome',
                '/pricing',
                '/features',
                '/api/guest/*'
            ],
            adminRoutes: [
                '/admin/*',
                '/dashboard/admin/*',
                '/api/admin/*'
            ],
            
            // تنظیمات بررسی دسترسی
            checkSession: true,
            checkPermissions: true,
            checkRateLimit: true,
            validateTokens: true,
            
            // تنظیمات امنیتی
            csrfProtection: true,
            xssProtection: true,
            corsEnabled: true,
            secureHeaders: true,
            
            // تنظیمات محدودیت نرخ
            rateLimits: {
                auth: { windowMs: 900000, max: 5 }, // 15 دقیقه، 5 درخواست
                api: { windowMs: 60000, max: 100 }, // 1 دقیقه، 100 درخواست
                sensitive: { windowMs: 3600000, max: 10 } // 1 ساعت، 10 درخواست
            },
            
            // تنظیمات session
            sessionValidation: {
                checkInterval: 30000, // 30 ثانیه
                autoRenew: true,
                renewThreshold: 0.2 // 20% مانده به انقضا
            },
            
            // تنظیمات لاگ و مانیتورینگ
            logLevel: 'info', // debug | info | warn | error
            logBlockedRequests: true,
            analyticsEnabled: true,
            
            // تنظیمات fallback
            onAccessDenied: {
                redirect: '/login',
                statusCode: 403,
                message: 'دسترسی غیرمجاز'
            },
            onSessionExpired: {
                redirect: '/login?expired=true',
                clearCookies: true,
                notifyUser: true
            },
            
            // callbackهای سفارشی
            beforeCheck: null,
            afterCheck: null,
            onBlock: null,
            onGrant: null,
            
            ...dependencies.config
        });
        
        // ==================== وضعیت داخلی ====================
        this._state = {
            isActive: false,
            protectedRoutes: new Map(),
            rateLimitStore: new Map(),
            sessionValidators: new Map(),
            middlewareStack: [],
            cache: new Map()
        };
        
        // ==================== سیستم کشینگ ====================
        this._cache = {
            routePermissions: new Map(),
            userAccess: new Map(),
            validationResults: new Map()
        };
        
        // ==================== راه‌اندازی اولیه ====================
        this._initialize();
        this._setupEventListeners();
        this._registerDefaultMiddleware();
        this._buildRoutePatterns();
        
        Object.seal(this._state);
        Object.seal(this);
        
        console.log('[AuthMiddleware] ✅ سیستم میان‌افزار امنیتی راه‌اندازی شد');
    }
    
    // ==================== قرارداد رابط اصلی ====================
    
    async protect(route, context = {}, options = {}) {
        const requestId = this._generateRequestId();
        const startTime = Date.now();
        
        try {
            // انتشار رویداد شروع بررسی
            this._services.events.emit('middleware:protection:start', {
                requestId,
                route,
                context: this._sanitizeContext(context),
                timestamp: startTime
            });
            
            // اجرای callback قبل از بررسی
            if (typeof this._config.beforeCheck === 'function') {
                const beforeResult = await this._config.beforeCheck(route, context);
                if (beforeResult && beforeResult.block) {
                    return this._handleBlockedAccess({
                        requestId,
                        route,
                        context,
                        reason: 'BEFORE_CHECK_BLOCKED',
                        details: beforeResult,
                        startTime
                    });
                }
            }
            
            // بررسی فعال بودن سیستم
            if (!this._config.enabled) {
                return this._handleGrantedAccess({
                    requestId,
                    route,
                    context,
                    reason: 'MIDDLEWARE_DISABLED',
                    startTime
                });
            }
            
            // بررسی کش
            const cacheKey = this._generateCacheKey(route, context);
            const cachedResult = this._getFromCache(cacheKey);
            
            if (cachedResult !== null) {
                return cachedResult.granted 
                    ? this._handleGrantedAccess({
                        requestId,
                        route,
                        context,
                        reason: 'CACHE_HIT',
                        cached: true,
                        startTime
                    })
                    : this._handleBlockedAccess({
                        requestId,
                        route,
                        context,
                        reason: cachedResult.reason || 'CACHE_HIT_BLOCKED',
                        cached: true,
                        startTime
                    });
            }
            
            // اجرای زنجیره middleware
            const middlewareResult = await this._executeMiddlewareStack(route, context);
            
            if (!middlewareResult.granted) {
                return this._handleBlockedAccess({
                    requestId,
                    route,
                    context,
                    reason: middlewareResult.reason,
                    details: middlewareResult,
                    startTime
                });
            }
            
            // بررسی دسترسی اصلی
            const accessCheck = await this._performAccessCheck(route, context);
            
            if (!accessCheck.granted) {
                return this._handleBlockedAccess({
                    requestId,
                    route,
                    context,
                    reason: accessCheck.reason,
                    details: accessCheck,
                    startTime
                });
            }
            
            // بررسی محدودیت نرخ
            if (this._config.checkRateLimit) {
                const rateLimitCheck = await this._checkRateLimit(route, context);
                if (!rateLimitCheck.allowed) {
                    return this._handleBlockedAccess({
                        requestId,
                        route,
                        context,
                        reason: 'RATE_LIMIT_EXCEEDED',
                        details: rateLimitCheck,
                        startTime
                    });
                }
            }
            
            // ذخیره در کش
            this._addToCache(cacheKey, {
                granted: true,
                timestamp: Date.now(),
                ttl: options.cacheTTL || 30000
            });
            
            // اجرای callback بعد از بررسی
            if (typeof this._config.afterCheck === 'function') {
                await this._config.afterCheck(route, context, true);
            }
            
            // انتشار رویداد دسترسی مجاز
            this._services.events.emit('middleware:access:granted', {
                requestId,
                route,
                context: this._sanitizeContext(context),
                duration: Date.now() - startTime,
                timestamp: Date.now()
            });
            
            // فراخوانی callback
            if (typeof this._config.onGrant === 'function') {
                this._config.onGrant(route, context, requestId);
            }
            
            return {
                granted: true,
                requestId,
                route,
                duration: Date.now() - startTime,
                checks: {
                    middleware: middlewareResult,
                    access: accessCheck,
                    rateLimit: this._config.checkRateLimit
                }
            };
            
        } catch (error) {
            console.error('[AuthMiddleware] خطا در بررسی دسترسی:', error);
            
            // انتشار رویداد خطا
            this._services.events.emit('middleware:protection:error', {
                requestId,
                route,
                error: error.message,
                timestamp: Date.now()
            });
            
            // برخورد بر اساس mode
            switch (this._config.mode) {
                case 'strict':
                    return this._handleBlockedAccess({
                        requestId,
                        route,
                        context,
                        reason: 'SYSTEM_ERROR',
                        error: error.message,
                        startTime
                    });
                    
                case 'permissive':
                    console.warn('[AuthMiddleware] حالت permissive: اجازه دسترسی با وجود خطا');
                    return {
                        granted: true,
                        requestId,
                        route,
                        warning: error.message,
                        mode: 'permissive'
                    };
                    
                case 'monitor':
                    console.warn('[AuthMiddleware] حالت monitor: اجازه دسترسی، ثبت خطا');
                    return {
                        granted: true,
                        requestId,
                        route,
                        monitored: true,
                        error: error.message
                    };
                    
                default:
                    throw error;
            }
        }
    }
    
    async intercept(request, response, next) {
        const { url, method, headers, ip, userAgent } = request;
        const requestId = this._generateRequestId();
        
        const context = {
            requestId,
            url,
            method,
            headers,
            ip,
            userAgent,
            timestamp: Date.now(),
            type: 'http'
        };
        
        try {
            // بررسی مسیر عمومی
            if (this._isPublicRoute(url)) {
                this._services.events.emit('middleware:intercept:public', {
                    requestId,
                    url,
                    method,
                    timestamp: Date.now()
                });
                
                return next();
            }
            
            // استخراج توکن
            const token = this._extractToken(headers);
            if (!token && this._config.defaultAccess === 'authenticated') {
                return this._sendAccessDenied(response, {
                    reason: 'NO_TOKEN',
                    requestId,
                    url
                });
            }
            
            // بررسی توکن
            if (token) {
                const tokenValid = await this._validateToken(token);
                if (!tokenValid.valid) {
                    return this._sendAccessDenied(response, {
                        reason: 'INVALID_TOKEN',
                        details: tokenValid,
                        requestId,
                        url
                    });
                }
                
                // اضافه کردن کاربر به context
                context.user = tokenValid.user;
                context.token = token;
            }
            
            // بررسی دسترسی
            const protectionResult = await this.protect(url, context, {
                requestType: 'http',
                method
            });
            
            if (!protectionResult.granted) {
                return this._sendAccessDenied(response, {
                    reason: protectionResult.reason,
                    details: protectionResult,
                    requestId,
                    url
                });
            }
            
            // اضافه کردن اطلاعات امنیتی به headerها
            if (this._config.secureHeaders) {
                this._addSecurityHeaders(response);
            }
            
            // ثبت لاگ دسترسی موفق
            this._logAccess({
                requestId,
                url,
                method,
                user: context.user,
                granted: true,
                timestamp: Date.now()
            });
            
            // ادامه پردازش
            request.authContext = context;
            return next();
            
        } catch (error) {
            console.error('[AuthMiddleware] خطا در intercept:', error);
            
            // ارسال خطای سرور
            return this._sendError(response, {
                error: error.message,
                requestId,
                url,
                timestamp: Date.now()
            });
        }
    }
    
    async checkPermission(permission, context = {}) {
        const checkId = this._generateCheckId();
        
        try {
            // بررسی session اگر نیاز باشد
            if (this._config.checkSession && !context.skipSessionCheck) {
                const sessionValid = await this._checkSession(context);
                if (!sessionValid.valid) {
                    return {
                        granted: false,
                        checkId,
                        reason: 'INVALID_SESSION',
                        details: sessionValid
                    };
                }
            }
            
            // بررسی permission
            if (this._config.checkPermissions && this._services.permissions) {
                const canAccess = await this._services.permissions.can(
                    permission, 
                    context
                );
                
                if (!canAccess) {
                    return {
                        granted: false,
                        checkId,
                        reason: 'PERMISSION_DENIED',
                        permission
                    };
                }
            }
            
            return {
                granted: true,
                checkId,
                permission,
                timestamp: Date.now()
            };
            
        } catch (error) {
            console.error('[AuthMiddleware] خطا در بررسی مجوز:', error);
            
            return {
                granted: this._config.failSilently,
                checkId,
                error: error.message,
                permission
            };
        }
    }
    
    // ==================== مدیریت مسیرها ====================
    
    addPublicRoute(route) {
        this._config.publicRoutes.push(route);
        this._buildRoutePatterns();
        
        this._services.events.emit('middleware:route:public:added', {
            route,
            timestamp: Date.now()
        });
        
        return this;
    }
    
    addProtectedRoute(route, requirements = {}) {
        this._state.protectedRoutes.set(route, {
            ...requirements,
            addedAt: Date.now(),
            pattern: this._routeToPattern(route)
        });
        
        this._services.events.emit('middleware:route:protected:added', {
            route,
            requirements,
            timestamp: Date.now()
        });
        
        return this;
    }
    
    removeRoute(route) {
        // حذف از مسیرهای عمومی
        const publicIndex = this._config.publicRoutes.indexOf(route);
        if (publicIndex > -1) {
            this._config.publicRoutes.splice(publicIndex, 1);
        }
        
        // حذف از مسیرهای مهمان
        const guestIndex = this._config.guestRoutes.indexOf(route);
        if (guestIndex > -1) {
            this._config.guestRoutes.splice(guestIndex, 1);
        }
        
        // حذف از مسیرهای ادمین
        const adminIndex = this._config.adminRoutes.indexOf(route);
        if (adminIndex > -1) {
            this._config.adminRoutes.splice(adminIndex, 1);
        }
        
        // حذف از مسیرهای حفاظت شده
        this._state.protectedRoutes.delete(route);
        
        // پاکسازی کش
        this._clearRouteCache(route);
        
        this._services.events.emit('middleware:route:removed', {
            route,
            timestamp: Date.now()
        });
        
        return this;
    }
    
    getRouteInfo(route) {
        const info = {
            route,
            isPublic: this._isPublicRoute(route),
            isGuest: this._isGuestRoute(route),
            isAdmin: this._isAdminRoute(route),
            isProtected: this._state.protectedRoutes.has(route),
            requirements: this._state.protectedRoutes.get(route) || {},
            cacheKey: this._generateCacheKey(route, {}),
            patterns: this._routeToPattern(route)
        };
        
        return info;
    }
    
    // ==================== مدیریت Middleware ====================
    
    use(middleware, options = {}) {
        const middlewareId = Symbol(`mw_${Date.now()}`);
        
        const wrappedMiddleware = {
            id: middlewareId,
            handler: middleware,
            priority: options.priority || 0,
            name: options.name || 'anonymous',
            enabled: options.enabled !== false
        };
        
        this._state.middlewareStack.push(wrappedMiddleware);
        
        // مرتب‌سازی بر اساس اولویت
        this._state.middlewareStack.sort((a, b) => b.priority - a.priority);
        
        this._services.events.emit('middleware:added', {
            name: wrappedMiddleware.name,
            priority: wrappedMiddleware.priority,
            timestamp: Date.now()
        });
        
        return () => {
            this._state.middlewareStack = this._state.middlewareStack.filter(
                mw => mw.id !== middlewareId
            );
        };
    }
    
    enableMiddleware(name) {
        this._state.middlewareStack.forEach(mw => {
            if (mw.name === name) {
                mw.enabled = true;
            }
        });
        
        return this;
    }
    
    disableMiddleware(name) {
        this._state.middlewareStack.forEach(mw => {
            if (mw.name === name) {
                mw.enabled = false;
            }
        });
        
        return this;
    }
    
    getMiddlewareStack() {
        return this._state.middlewareStack.map(mw => ({
            name: mw.name,
            priority: mw.priority,
            enabled: mw.enabled
        }));
    }
    
    // ==================== مدیریت کش ====================
    
    clearCache(pattern = null) {
        if (!pattern) {
            this._cache.routePermissions.clear();
            this._cache.userAccess.clear();
            this._cache.validationResults.clear();
        } else {
            const regex = new RegExp(pattern);
            
            // پاکسازی routePermissions
            for (const [key] of this._cache.routePermissions) {
                if (regex.test(key)) {
                    this._cache.routePermissions.delete(key);
                }
            }
            
            // پاکسازی userAccess
            for (const [key] of this._cache.userAccess) {
                if (regex.test(key)) {
                    this._cache.userAccess.delete(key);
                }
            }
            
            // پاکسازی validationResults
            for (const [key] of this._cache.validationResults) {
                if (regex.test(key)) {
                    this._cache.validationResults.delete(key);
                }
            }
        }
        
        this._services.events.emit('middleware:cache:cleared', {
            pattern,
            timestamp: Date.now()
        });
        
        return this;
    }
    
    getCacheStats() {
        return {
            routePermissions: this._cache.routePermissions.size,
            userAccess: this._cache.userAccess.size,
            validationResults: this._cache.validationResults.size,
            total: this._cache.routePermissions.size + 
                   this._cache.userAccess.size + 
                   this._cache.validationResults.size
        };
    }
    
    // ==================== ابزارهای مانیتورینگ ====================
    
    getMetrics() {
        const now = Date.now();
        const oneHourAgo = now - 3600000;
        const oneDayAgo = now - 86400000;
        
        // جمع‌آوری داده‌های rate limiting
        let rateLimitBlocks = 0;
        let recentRateLimitBlocks = 0;
        
        for (const [key, data] of this._state.rateLimitStore) {
            if (data.blockedAt) {
                rateLimitBlocks++;
                if (data.blockedAt > oneHourAgo) {
                    recentRateLimitBlocks++;
                }
            }
        }
        
        return {
            general: {
                enabled: this._config.enabled,
                mode: this._config.mode,
                protectedRoutes: this._state.protectedRoutes.size,
                middlewareCount: this._state.middlewareStack.length,
                activeSessionValidators: this._state.sessionValidators.size
            },
            cache: this.getCacheStats(),
            rateLimiting: {
                totalBlocks: rateLimitBlocks,
                recentBlocks: recentRateLimitBlocks,
                storeSize: this._state.rateLimitStore.size
            },
            timestamp: now
        };
    }
    
    generateReport(options = {}) {
        const {
            includeRoutes = true,
            includeMiddleware = true,
            includeCache = true,
            timeRange = 'day' // hour | day | week | month
        } = options;
        
        const report = {
            timestamp: new Date().toISOString(),
            timeRange,
            config: {
                mode: this._config.mode,
                defaultAccess: this._config.defaultAccess,
                checkSession: this._config.checkSession,
                checkPermissions: this._config.checkPermissions,
                checkRateLimit: this._config.checkRateLimit
            }
        };
        
        if (includeRoutes) {
            report.routes = {
                public: this._config.publicRoutes.length,
                guest: this._config.guestRoutes.length,
                admin: this._config.adminRoutes.length,
                protected: this._state.protectedRoutes.size,
                totalUnique: this._getTotalUniqueRoutes()
            };
        }
        
        if (includeMiddleware) {
            report.middleware = this.getMiddlewareStack();
        }
        
        if (includeCache) {
            report.cache = this.getCacheStats();
        }
        
        report.metrics = this.getMetrics();
        
        return report;
    }
    
    // ==================== Private Methods ====================
    
    _validateDependencies() {
        const required = ['auth', 'permissions', 'events'];
        
        required.forEach(service => {
            if (!this._services[service]) {
                throw new Error(`سرویس ${service} برای AuthMiddleware ضروری است`);
            }
        });
        
        if (!this._services.router) {
            console.warn('[AuthMiddleware] Router موجود نیست، برخی قابلیت‌ها محدود خواهند شد');
        }
    }
    
    _initialize() {
        this._state.isActive = true;
        
        // ثبت global reference برای دیباگ
        if (typeof window !== 'undefined') {
            window.__vakamovaAuthMiddleware = this;
        }
    }
    
    _setupEventListeners() {
        // گوش دادن به رویدادهای auth
        this._services.events.on('auth:login:success', () => {
            this.clearCache('user:*');
        });
        
        this._services.events.on('auth:logout:success', () => {
            this.clearCache();
        });
        
        this._services.events.on('auth:session:expired', () => {
            this._handleSessionExpired();
        });
        
        // گوش دادن به تغییرات router
        if (this._services.router && this._services.router.on) {
            this._services.router.on('route:change', (route) => {
                this._handleRouteChange(route);
            });
        }
        
        // تایمر پاکسازی کش
        setInterval(() => {
            this._cleanupExpiredCache();
        }, 300000); // هر 5 دقیقه
        
        // تایمر پاکسازی rate limit store
        setInterval(() => {
            this._cleanupRateLimitStore();
        }, 600000); // هر 10 دقیقه
    }
    
    _registerDefaultMiddleware() {
        // Middleware بررسی session
        this.use(async (route, context) => {
            if (!this._config.checkSession) {
                return { granted: true, middleware: 'session_check_skipped' };
            }
            
            try {
                const sessionValid = await this._checkSession(context);
                if (!sessionValid.valid) {
                    return { 
                        granted: false, 
                        reason: 'INVALID_SESSION',
                        details: sessionValid,
                        middleware: 'session_check'
                    };
                }
                
                return { granted: true, middleware: 'session_check' };
            } catch (error) {
                console.error('[AuthMiddleware] خطا در session middleware:', error);
                return { 
                    granted: this._config.failSilently,
                    reason: 'SESSION_CHECK_ERROR',
                    error: error.message,
                    middleware: 'session_check'
                };
            }
        }, { name: 'session_check', priority: 100 });
        
        // Middleware بررسی CSRF
        this.use(async (route, context) => {
            if (!this._config.csrfProtection || this._isPublicRoute(route)) {
                return { granted: true, middleware: 'csrf_check_skipped' };
            }
            
            try {
                const csrfValid = await this._checkCSRF(context);
                if (!csrfValid.valid) {
                    return { 
                        granted: false, 
                        reason: 'CSRF_CHECK_FAILED',
                        details: csrfValid,
                        middleware: 'csrf_check'
                    };
                }
                
                return { granted: true, middleware: 'csrf_check' };
            } catch (error) {
                console.error('[AuthMiddleware] خطا در CSRF middleware:', error);
                return { 
                    granted: this._config.failSilently,
                    reason: 'CSRF_CHECK_ERROR',
                    error: error.message,
                    middleware: 'csrf_check'
                };
            }
        }, { name: 'csrf_check', priority: 90 });
        
        // Middleware بررسی XSS
        this.use(async (route, context) => {
            if (!this._config.xssProtection) {
                return { granted: true, middleware: 'xss_check_skipped' };
            }
            
            try {
                const xssSafe = await this._checkXSS(context);
                if (!xssSafe.safe) {
                    return { 
                        granted: false, 
                        reason: 'XSS_CHECK_FAILED',
                        details: xssSafe,
                        middleware: 'xss_check'
                    };
                }
                
                return { granted: true, middleware: 'xss_check' };
            } catch (error) {
                console.error('[AuthMiddleware] خطا در XSS middleware:', error);
                return { 
                    granted: this._config.failSilently,
                    reason: 'XSS_CHECK_ERROR',
                    error: error.message,
                    middleware: 'xss_check'
                };
            }
        }, { name: 'xss_check', priority: 80 });
    }
    
    _buildRoutePatterns() {
        // تبدیل مسیرها به الگوهای regex
        this._routePatterns = {
            public: this._config.publicRoutes.map(route => this._routeToPattern(route)),
            guest: this._config.guestRoutes.map(route => this._routeToPattern(route)),
            admin: this._config.adminRoutes.map(route => this._routeToPattern(route)),
            protected: Array.from(this._state.protectedRoutes.values()).map(r => r.pattern)
        };
    }
    
    _routeToPattern(route) {
        // تبدیل مسیر به الگوی regex
        let pattern = route
            .replace(/\//g, '\\/')
            .replace(/\*/g, '.*')
            .replace(/\?/g, '.')
            .replace(/\./g, '\\.');
        
        return new RegExp(`^${pattern}$`);
    }
    
    _isPublicRoute(route) {
        return this._routePatterns.public.some(pattern => pattern.test(route));
    }
    
    _isGuestRoute(route) {
        return this._routePatterns.guest.some(pattern => pattern.test(route));
    }
    
    _isAdminRoute(route) {
        return this._routePatterns.admin.some(pattern => pattern.test(route));
    }
    
    _isProtectedRoute(route) {
        return this._routePatterns.protected.some(pattern => pattern.test(route));
    }
    
    _generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    _generateCheckId() {
        return `chk_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    }
    
    _sanitizeContext(context) {
        const sanitized = { ...context };
        
        // حذف فیلدهای حساس
        delete sanitized.password;
        delete sanitized.token;
        delete sanitized.authorization;
        delete sanitized.cookie;
        
        // ماسک کردن IP
        if (sanitized.ip) {
            sanitized.ip = this._maskIP(sanitized.ip);
        }
        
        // ماسک کردن ایمیل
        if (sanitized.email) {
            sanitized.email = this._maskEmail(sanitized.email);
        }
        
        return sanitized;
    }
    
    _maskIP(ip) {
        if (!ip) return 'unknown';
        
        const parts = ip.split('.');
        if (parts.length === 4) {
            return `${parts[0]}.${parts[1]}.xxx.xxx`;
        }
        
        return ip;
    }
    
    _maskEmail(email) {
        if (!email || !email.includes('@')) return email;
        
        const [local, domain] = email.split('@');
        const maskedLocal = local.length > 2 
            ? `${local.charAt(0)}***${local.charAt(local.length - 1)}`
            : '***';
        
        return `${maskedLocal}@${domain}`;
    }
    
    _generateCacheKey(route, context) {
        const user = context.user || 'guest';
        const userId = user.id || user;
        const method = context.method || 'GET';
        
        return `${route}:${method}:${userId}`;
    }
    
    _getFromCache(key) {
        const cached = this._cache.userAccess.get(key);
        if (!cached) return null;
        
        // بررسی انقضا
        if (Date.now() - cached.timestamp > cached.ttl) {
            this._cache.userAccess.delete(key);
            return null;
        }
        
        return cached;
    }
    
    _addToCache(key, value) {
        this._cache.userAccess.set(key, {
            ...value,
            cachedAt: Date.now()
        });
    }
    
    _clearRouteCache(route) {
        const pattern = new RegExp(`^${route}:`);
        
        for (const [key] of this._cache.userAccess) {
            if (pattern.test(key)) {
                this._cache.userAccess.delete(key);
            }
        }
    }
    
    _cleanupExpiredCache() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, value] of this._cache.userAccess) {
            if (now - value.timestamp > value.ttl) {
                this._cache.userAccess.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0 && this._config.logLevel === 'debug') {
            console.log(`[AuthMiddleware] ${cleaned} کش منقضی پاکسازی شد`);
        }
    }
    
    async _executeMiddlewareStack(route, context) {
        const results = [];
        
        for (const middleware of this._state.middlewareStack) {
            if (!middleware.enabled) continue;
            
            try {
                const result = await middleware.handler(route, context);
                results.push({
                    name: middleware.name,
                    ...result
                });
                
                if (!result.granted) {
                    return {
                        granted: false,
                        reason: result.reason || 'MIDDLEWARE_BLOCKED',
                        middleware: middleware.name,
                        allResults: results
                    };
                }
                
            } catch (error) {
                console.error(`[AuthMiddleware] خطا در middleware ${middleware.name}:`, error);
                
                results.push({
                    name: middleware.name,
                    granted: this._config.failSilently,
                    error: error.message
                });
                
                if (!this._config.failSilently) {
                    return {
                        granted: false,
                        reason: 'MIDDLEWARE_ERROR',
                        middleware: middleware.name,
                        error: error.message,
                        allResults: results
                    };
                }
            }
        }
        
        return {
            granted: true,
            allResults: results
        };
    }
    
    async _performAccessCheck(route, context) {
        // بررسی نوع مسیر
        if (this._isPublicRoute(route)) {
            return { granted: true, reason: 'PUBLIC_ROUTE' };
        }
        
        // بررسی مسیر مهمان
        if (this._isGuestRoute(route)) {
            const hasUser = context.user || await this._getCurrentUser();
            if (hasUser) {
                return { granted: false, reason: 'GUESTS_ONLY' };
            }
            return { granted: true, reason: 'GUEST_ROUTE' };
        }
        
        // بررسی مسیر ادمین
        if (this._isAdminRoute(route)) {
            const user = context.user || await this._getCurrentUser();
            if (!user) {
                return { granted: false, reason: 'AUTHENTICATION_REQUIRED' };
            }
            
            if (user.role !== 'admin') {
                return { granted: false, reason: 'ADMIN_ONLY' };
            }
            
            return { granted: true, reason: 'ADMIN_ACCESS' };
        }
        
        // بررسی مسیرهای حفاظت شده سفارشی
        if (this._isProtectedRoute(route)) {
            const routeRequirements = this._state.protectedRoutes.get(route);
            if (!routeRequirements) {
                return { granted: true, reason: 'PROTECTED_ROUTE_NO_REQUIREMENTS' };
            }
            
            return await this._checkRouteRequirements(routeRequirements, context);
        }
        
        // پیش‌فرض: بررسی احراز هویت
        const isAuthenticated = await this._isUserAuthenticated(context);
        if (!isAuthenticated && this._config.defaultAccess === 'authenticated') {
            return { granted: false, reason: 'AUTHENTICATION_REQUIRED' };
        }
        
        return { granted: true, reason: 'DEFAULT_ACCESS' };
    }
    
    async _checkRouteRequirements(requirements, context) {
        const checks = [];
        
        // بررسی احراز هویت
        if (requirements.authenticated !== false) {
            const authCheck = await this._isUserAuthenticated(context);
            checks.push({ name: 'authentication', passed: authCheck });
            
            if (!authCheck) {
                return { 
                    granted: false, 
                    reason: 'AUTHENTICATION_REQUIRED',
                    failedChecks: ['authentication']
                };
            }
        }
        
        // بررسی نقش
        if (requirements.roles && requirements.roles.length > 0) {
            const user = context.user || await this._getCurrentUser();
            const hasRole = requirements.roles.includes(user?.role);
            checks.push({ name: 'role', passed: hasRole, required: requirements.roles, actual: user?.role });
            
            if (!hasRole) {
                return { 
                    granted: false, 
                    reason: 'ROLE_REQUIREMENT',
                    requiredRoles: requirements.roles,
                    userRole: user?.role,
                    failedChecks: ['role']
                };
            }
        }
        
        // بررسی مجوزها
        if (requirements.permissions && requirements.permissions.length > 0) {
            for (const permission of requirements.permissions) {
                const hasPermission = await this.checkPermission(permission, context);
                checks.push({ 
                    name: 'permission', 
                    permission, 
                    passed: hasPermission.granted 
                });
                
                if (!hasPermission.granted) {
                    return { 
                        granted: false, 
                        reason: 'PERMISSION_REQUIREMENT',
                        requiredPermission: permission,
                        failedChecks: ['permission']
                    };
                }
            }
        }
        
        // بررسی زمان
        if (requirements.timeRestrictions) {
            const timeCheck = this._checkTimeRestrictions(requirements.timeRestrictions);
            checks.push({ name: 'time', passed: timeCheck.allowed });
            
            if (!timeCheck.allowed) {
                return { 
                    granted: false, 
                    reason: 'TIME_RESTRICTION',
                    details: timeCheck,
                    failedChecks: ['time']
                };
            }
        }
        
        return {
            granted: true,
            reason: 'ALL_REQUIREMENTS_MET',
            checks
        };
    }
    
    async _checkRateLimit(route, context) {
        const key = `rate:${context.ip || 'unknown'}:${route}`;
        const now = Date.now();
        
        if (!this._state.rateLimitStore.has(key)) {
            this._state.rateLimitStore.set(key, {
                requests: [],
                blockedAt: null,
                blockCount: 0
            });
        }
        
        const data = this._state.rateLimitStore.get(key);
        
        // بررسی اگر بلاک شده
        if (data.blockedAt) {
            const blockDuration = this._getRateLimitWindow('auth');
            if (now - data.blockedAt < blockDuration) {
                return {
                    allowed: false,
                    reason: 'BLOCKED',
                    remainingTime: blockDuration - (now - data.blockedAt),
                    blockCount: data.blockCount
                };
            } else {
                // بلاک منقضی شده
                data.blockedAt = null;
            }
        }
        
        // حذف درخواست‌های قدیمی
        const windowMs = this._getRateLimitWindow('auth');
        data.requests = data.requests.filter(time => now - time < windowMs);
        
        // بررسی تعداد درخواست‌ها
        const maxRequests = this._getRateLimitMax('auth');
        if (data.requests.length >= maxRequests) {
            data.blockedAt = now;
            data.blockCount++;
            
            this._services.events.emit('middleware:rate:limited', {
                key,
                route,
                ip: context.ip,
                count: data.requests.length,
                max: maxRequests,
                timestamp: now
            });
            
            return {
                allowed: false,
                reason: 'RATE_LIMIT_EXCEEDED',
                count: data.requests.length,
                max: maxRequests,
                window: windowMs
            };
        }
        
        // اضافه کردن درخواست جدید
        data.requests.push(now);
        
        return {
            allowed: true,
            count: data.requests.length,
            max: maxRequests,
            remaining: maxRequests - data.requests.length
        };
    }
    
    _getRateLimitWindow(type) {
        return this._config.rateLimits[type]?.windowMs || 60000;
    }
    
    _getRateLimitMax(type) {
        return this._config.rateLimits[type]?.max || 100;
    }
    
    _cleanupRateLimitStore() {
        const now = Date.now();
        let cleaned = 0;
        
        for (const [key, data] of this._state.rateLimitStore) {
            // حذف اگر بلاک قدیمی باشد
            if (data.blockedAt && now - data.blockedAt > 86400000) { // 24 ساعت
                this._state.rateLimitStore.delete(key);
                cleaned++;
                continue;
            }
            
            // حذف درخواست‌های قدیمی
            const windowMs = this._getRateLimitWindow('auth');
            data.requests = data.requests.filter(time => now - time < windowMs * 2); // دو برابر window
            
            // حذف اگر خالی باشد
            if (data.requests.length === 0 && !data.blockedAt) {
                this._state.rateLimitStore.delete(key);
                cleaned++;
            }
        }
        
        if (cleaned > 0 && this._config.logLevel === 'debug') {
            console.log(`[AuthMiddleware] ${cleaned} rate limit entry پاکسازی شد`);
        }
    }
    
    async _checkSession(context) {
        if (!this._services.auth || !this._services.auth.verifySession) {
            return { valid: true, reason: 'NO_AUTH_SERVICE' };
        }
        
        try {
            const sessionValid = await this._services.auth.verifySession();
            return sessionValid;
        } catch (error) {
            return { valid: false, reason: 'SESSION_CHECK_ERROR', error: error.message };
        }
    }
    
    async _checkCSRF(context) {
        // در اینجا منطق بررسی CSRF پیاده‌سازی می‌شود
        // فعلاً true برمی‌گرداند
        return { valid: true, checked: false };
    }
    
    async _checkXSS(context) {
        // در اینجا منطق بررسی XSS پیاده‌سازی می‌شود
        // فعلاً true برمی‌گرداند
        return { safe: true, checked: false };
    }
    
    async _isUserAuthenticated(context) {
        if (context.user) return true;
        
        if (this._services.auth) {
            return this._services.auth.isAuthenticated();
        }
        
        return false;
    }
    
    async _getCurrentUser() {
        if (this._services.auth) {
            return this._services.auth.getCurrentUser();
        }
        
        return null;
    }
    
    _checkTimeRestrictions(restrictions) {
        const now = new Date();
        const currentHour = now.getHours();
        const currentDay = now.getDay(); // 0: Sunday, 6: Saturday
        
        // بررسی محدودیت ساعت
        if (restrictions.hours) {
            const { start, end } = restrictions.hours;
            if (currentHour < start || currentHour >= end) {
                return {
                    allowed: false,
                    reason: 'OUTSIDE_ALLOWED_HOURS',
                    currentHour,
                    allowedHours: { start, end }
                };
            }
        }
        
        // بررسی محدودیت روز
        if (restrictions.days && restrictions.days.length > 0) {
            if (!restrictions.days.includes(currentDay)) {
                return {
                    allowed: false,
                    reason: 'DAY_NOT_ALLOWED',
                    currentDay,
                    allowedDays: restrictions.days
                };
            }
        }
        
        return { allowed: true };
    }
    
    _extractToken(headers) {
        if (!headers) return null;
        
        // بررسی header Authorization
        if (headers.authorization) {
            const parts = headers.authorization.split(' ');
            if (parts.length === 2 && parts[0] === 'Bearer') {
                return parts[1];
            }
        }
        
        // بررسی cookie
        if (headers.cookie) {
            const cookies = headers.cookie.split(';');
            for (const cookie of cookies) {
                const [name, value] = cookie.trim().split('=');
                if (name === 'access_token' || name === 'token') {
                    return value;
                }
            }
        }
        
        return null;
    }
    
    async _validateToken(token) {
        if (!this._services.auth || !this._config.validateTokens) {
            return { valid: true, reason: 'NO_VALIDATION' };
        }
        
        try {
            // در اینجا توکن اعتبارسنجی می‌شود
            // فعلاً true برمی‌گرداند
            return { 
                valid: true, 
                user: { id: 'sample_user', role: 'user' },
                expiresAt: Date.now() + 3600000
            };
        } catch (error) {
            return { valid: false, reason: 'VALIDATION_ERROR', error: error.message };
        }
    }
    
    _addSecurityHeaders(response) {
        if (!response || !response.setHeader) return;
        
        const headers = {
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY',
            'X-XSS-Protection': '1; mode=block',
            'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
            'Content-Security-Policy': "default-src 'self'"
        };
        
        Object.entries(headers).forEach(([key, value]) => {
            response.setHeader(key, value);
        });
    }
    
    _sendAccessDenied(response, details) {
        if (!response) return;
        
        const { statusCode = 403, message = 'دسترسی غیرمجاز' } = this._config.onAccessDenied;
        
        // انتشار رویداد
        this._services.events.emit('middleware:access:denied', {
            ...details,
            timestamp: Date.now()
        });
        
        // فراخوانی callback
        if (typeof this._config.onBlock === 'function') {
            this._config.onBlock(details);
        }
        
        // ثبت لاگ
        this._logAccess({
            requestId: details.requestId,
            url: details.url,
            granted: false,
            reason: details.reason,
            timestamp: Date.now()
        });
        
        // ارسال پاسخ
        if (response.status) {
            response.status(statusCode);
        }
        
        if (response.json) {
            return response.json({
                success: false,
                error: message,
                code: details.reason,
                requestId: details.requestId,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    _sendError(response, details) {
        if (!response) return;
        
        // انتشار رویداد
        this._services.events.emit('middleware:error', {
            ...details,
            timestamp: Date.now()
        });
        
        // ارسال پاسخ خطا
        if (response.status) {
            response.status(500);
        }
        
        if (response.json) {
            return response.json({
                success: false,
                error: 'خطای سرور',
                requestId: details.requestId,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    _logAccess(entry) {
        if (!this._config.logBlockedRequests && !entry.granted) {
            return;
        }
        
        const logEntry = {
            ...entry,
            level: entry.granted ? 'info' : 'warn',
            middleware: 'auth_middleware'
        };
        
        console[logEntry.level](`[AuthMiddleware] دسترسی ${entry.granted ? 'مجاز' : 'غیرمجاز'}:`, {
            requestId: entry.requestId,
            url: entry.url,
            reason: entry.reason,
            timestamp: new Date(entry.timestamp).toLocaleString('fa-IR')
        });
        
        // ارسال به analytics اگر فعال باشد
        if (this._config.analyticsEnabled && this._services.events) {
            this._services.events.emit('analytics:access', logEntry);
        }
    }
    
    _handleBlockedAccess(params) {
        const { requestId, route, context, reason, details, startTime, cached = false } = params;
        const duration = Date.now() - startTime;
        
        // انتشار رویداد
        this._services.events.emit('middleware:access:blocked', {
            requestId,
            route,
            reason,
            duration,
            cached,
            timestamp: Date.now()
        });
        
        // فراخوانی callback
        if (typeof this._config.onBlock === 'function') {
            this._config.onBlock({
                requestId,
                route,
                context: this._sanitizeContext(context),
                reason,
                details,
                duration
            });
        }
        
        // ثبت لاگ
        if (this._config.logBlockedRequests) {
            this._logAccess({
                requestId,
                url: route,
                granted: false,
                reason,
                duration,
                timestamp: Date.now()
            });
        }
        
        // ارسال redirect اگر تنظیم شده باشد
        if (this._config.onAccessDenied.redirect && this._services.router) {
            setTimeout(() => {
                this._services.router.navigateTo(this._config.onAccessDenied.redirect);
            }, 100);
        }
        
        return {
            granted: false,
            requestId,
            route,
            reason,
            duration,
            details,
            cached
        };
    }
    
    _handleGrantedAccess(params) {
        const { requestId, route, context, reason, startTime, cached = false } = params;
        const duration = Date.now() - startTime;
        
        // انتشار رویداد
        this._services.events.emit('middleware:access:granted', {
            requestId,
            route,
            reason,
            duration,
            cached,
            timestamp: Date.now()
        });
        
        // فراخوانی callback
        if (typeof this._config.onGrant === 'function') {
            this._config.onGrant(route, context, requestId);
        }
        
        return {
            granted: true,
            requestId,
            route,
            reason,
            duration,
            cached
        };
    }
    
    _handleSessionExpired() {
        if (this._config.onSessionExpired.redirect && this._services.router) {
            this._services.router.navigateTo(this._config.onSessionExpired.redirect);
        }
        
        if (this._config.onSessionExpired.clearCookies) {
            document.cookie.split(';').forEach(cookie => {
                document.cookie = cookie
                    .replace(/^ +/, '')
                    .replace(/=.*/, `=;expires=${new Date(0).toUTCString()};path=/`);
            });
        }
        
        if (this._config.onSessionExpired.notifyUser) {
            console.warn('[AuthMiddleware] نشست شما منقضی شده است. لطفاً مجدد وارد شوید.');
        }
    }
    
    _handleRouteChange(route) {
        if (this._config.autoProtect) {
            this.protect(route, { type: 'route_change' }).then(result => {
                if (!result.granted) {
                    console.warn(`[AuthMiddleware] دسترسی به مسیر ${route} مجاز نیست`);
                    
                    if (this._services.router && this._config.onAccessDenied.redirect) {
                        this._services.router.navigateTo(this._config.onAccessDenied.redirect);
                    }
                }
            });
        }
    }
    
    _getTotalUniqueRoutes() {
        const allRoutes = [
            ...this._config.publicRoutes,
            ...this._config.guestRoutes,
            ...this._config.adminRoutes,
            ...Array.from(this._state.protectedRoutes.keys())
        ];
        
        const uniqueRoutes = new Set(allRoutes);
        return uniqueRoutes.size;
    }
}

// ==================== Export Pattern ====================

let authMiddlewareInstance = null;

function createAuthMiddleware(dependencies = {}) {
    if (!authMiddlewareInstance) {
        authMiddlewareInstance = new VakamovaAuthMiddleware(dependencies);
    }
    return authMiddlewareInstance;
}

function getAuthMiddleware() {
    if (!authMiddlewareInstance) {
        throw new Error('AuthMiddleware هنوز راه‌اندازی نشده است');
    }
    return authMiddlewareInstance;
}

// قرارداد رابط استاندارد
const AuthMiddlewareInterface = {
    create: createAuthMiddleware,
    get: getAuthMiddleware,
    reset: () => { authMiddlewareInstance = null; },
    
    // متدهای utility سریع
    protectRoute: (route, context) => {
        const instance = getAuthMiddleware();
        return instance.protect(route, context);
    },
    
    checkPermission: (permission, context) => {
        const instance = getAuthMiddleware();
        return instance.checkPermission(permission, context);
    },
    
    // helper برای Express/Connect middleware
    expressMiddleware: () => {
        const instance = getAuthMiddleware();
        return (req, res, next) => {
            instance.intercept(req, res, next);
        };
    }
};

// Export برای محیط‌های مختلف
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        VakamovaAuthMiddleware,
        AuthMiddlewareInterface
    };
}

if (typeof window !== 'undefined') {
    window.VakamovaAuthMiddleware = VakamovaAuthMiddleware;
    window.AuthMiddleware = AuthMiddlewareInterface;
}

console.log('[AuthMiddleware] ✅ سیستم میان‌افزار امنیتی بارگذاری شد');
