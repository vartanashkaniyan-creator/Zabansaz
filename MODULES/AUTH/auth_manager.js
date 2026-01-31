/**
 * VAKAMOVA AUTH MANAGER - هسته مرکزی سیستم احراز هویت
 * اصول: تزریق وابستگی، قرارداد رابط، رویداد محور، پیکربندی متمرکز
 * وابستگی‌های داخلی: همه فایل‌های ماژول Auth + event_bus.js + state_manager.js
 */

class VakamovaAuthManager {
    constructor(dependencies = {}) {
        // ==================== تزریق وابستگی‌های حیاتی ====================
        this._services = {
            // سرویس‌های هسته
            events: dependencies.eventBus || window.eventBus,
            state: dependencies.stateManager || window.stateManager,
            
            // سرویس‌های ماژول Auth
            token: dependencies.tokenManager || window.tokenManager,
            session: dependencies.sessionService || window.sessionService,
            validator: dependencies.authValidator || window.authValidator,
            permissions: dependencies.permissionChecker || window.permissionChecker,
            analytics: dependencies.authAnalytics || window.authAnalytics,
            utils: dependencies.authUtils || window.authUtils
        };
        
        // اعتبارسنجی کامل وابستگی‌ها
        this._validateDependencies();
        
        // ==================== پیکربندی متمرکز ====================
        this._config = Object.freeze({
            // تنظیمات امنیتی
            passwordMinLength: 8,
            passwordRequireUppercase: true,
            passwordRequireNumbers: true,
            passwordRequireSpecialChars: true,
            maxLoginAttempts: 5,
            lockoutDuration: 900000, // 15 دقیقه
            sessionTimeout: 86400000, // 24 ساعت
            refreshTokenInterval: 3600000, // 1 ساعت
            
            // تنظیمات ثبت‌نام
            requireEmailVerification: true,
            autoLoginAfterRegister: true,
            allowSocialLogin: true,
            
            // تنظیمات توکن
            tokenExpiry: 3600, // 1 ساعت (ثانیه)
            refreshTokenExpiry: 2592000, // 30 روز
            tokenEncryption: true,
            
            // تنظیمات چند عاملی
            twoFactorEnabled: false,
            twoFactorMethods: ['email', 'authenticator'],
            
            // تنظیمات خط‌مشی
            concurrentSessions: 3,
            rememberMeDuration: 2592000000, // 30 روز
            
            // endpointها
            endpoints: {
                login: '/api/auth/login',
                register: '/api/auth/register',
                logout: '/api/auth/logout',
                refresh: '/api/auth/refresh',
                verify: '/api/auth/verify',
                resetPassword: '/api/auth/reset-password',
                changePassword: '/api/auth/change-password'
            },
            
            // callbackهای سفارشی
            onLoginSuccess: null,
            onLoginFailure: null,
            onRegisterSuccess: null,
            onLogout: null,
            onSessionExpired: null,
            
            ...dependencies.config
        });
        
        // ==================== وضعیت داخلی ====================
        this._state = {
            isInitialized: false,
            currentUser: null,
            isAuthenticated: false,
            loginAttempts: new Map(),
            pendingOperations: new Map(),
            refreshTimers: new Map(),
            sessionChecks: new Map()
        };
        
        // ==================== راه‌اندازی اولیه ====================
        this._initialize();
        this._setupEventListeners();
        this._loadPersistedState();
        
        Object.seal(this._state);
        Object.seal(this);
        
        console.log('[AuthManager] ✅ هسته احراز هویت راه‌اندازی شد');
    }
    
    // ==================== قرارداد رابط اصلی ====================
    
    async register(userData, options = {}) {
        const operationId = this._generateOperationId('register');
        
        try {
            // انتشار رویداد شروع ثبت‌نام
            this._services.events.emit('auth:register:start', {
                operationId,
                userData: this._sanitizeUserData(userData),
                timestamp: Date.now()
            });
            
            // اعتبارسنجی داده‌های کاربر
            const validation = await this._validateRegistration(userData);
            if (!validation.valid) {
                throw new Error(validation.errors.join(', '));
            }
            
            // بررسی موجود بودن کاربر
            const exists = await this._checkUserExists(userData.email);
            if (exists) {
                throw new Error('این ایمیل قبلاً ثبت شده است');
            }
            
            // ایجاد حساب کاربری
            const user = await this._createUserAccount(userData);
            
            // تنظیم session اولیه
            await this._initializeUserSession(user);
            
            // ارسال ایمیل تایید (اگر نیاز باشد)
            if (this._config.requireEmailVerification && !options.skipVerification) {
                await this._sendVerificationEmail(user);
            }
            
            // ورود خودکار بعد از ثبت‌نام
            if (this._config.autoLoginAfterRegister && !options.skipAutoLogin) {
                await this.login({
                    email: userData.email,
                    password: userData.password
                }, { ...options, isPostRegister: true });
            }
            
            // تحلیل رویداد
            if (this._services.analytics && this._services.analytics.trackRegistration) {
                await this._services.analytics.trackRegistration({
                    userId: user.id,
                    method: 'email',
                    success: true
                });
            }
            
            // انتشار رویداد موفقیت
            this._services.events.emit('auth:register:success', {
                operationId,
                userId: user.id,
                timestamp: Date.now(),
                autoLoggedIn: this._config.autoLoginAfterRegister
            });
            
            // فراخوانی callback
            if (typeof this._config.onRegisterSuccess === 'function') {
                this._config.onRegisterSuccess(user, operationId);
            }
            
            return {
                success: true,
                user: this._sanitizeUserResponse(user),
                requiresVerification: this._config.requireEmailVerification,
                operationId
            };
            
        } catch (error) {
            console.error('[AuthManager] خطا در ثبت‌نام:', error);
            
            // انتشار رویداد خطا
            this._services.events.emit('auth:register:failed', {
                operationId,
                error: error.message,
                timestamp: Date.now()
            });
            
            // تحلیل رویداد
            if (this._services.analytics) {
                await this._services.analytics.track('registration_failed', {
                    error: error.message,
                    email: userData.email
                });
            }
            
            return {
                success: false,
                error: error.message,
                operationId
            };
        }
    }
    
    async login(credentials, options = {}) {
        const operationId = this._generateOperationId('login');
        const { email, password, rememberMe = false } = credentials;
        
        try {
            // بررسی lockout
            const isLocked = await this._checkLoginLockout(email);
            if (isLocked.locked) {
                throw new Error(`حساب به دلیل تلاش‌های ناموفق قفل شده است. ${isLocked.remainingTime} ثانیه دیگر مجددا تلاش کنید`);
            }
            
            // انتشار رویداد شروع ورود
            this._services.events.emit('auth:login:start', {
                operationId,
                email: this._maskEmail(email),
                timestamp: Date.now(),
                rememberMe
            });
            
            // اعتبارسنجی اولیه
            if (!email || !password) {
                throw new Error('ایمیل و رمز عبور الزامی است');
            }
            
            // احراز هویت کاربر
            const user = await this._authenticateUser(email, password);
            if (!user) {
                await this._recordFailedLogin(email);
                throw new Error('ایمیل یا رمز عبور نادرست است');
            }
            
            // بررسی وضعیت حساب
            const accountStatus = await this._checkAccountStatus(user);
            if (!accountStatus.active) {
                throw new Error(`حساب کاربری ${accountStatus.reason}`);
            }
            
            // بررسی محدودیت session همزمان
            await this._enforceConcurrentSessions(user.id);
            
            // ایجاد توکن‌ها
            const tokens = await this._generateTokens(user, rememberMe);
            
            // ذخیره session
            await this._createSession(user, tokens, {
                rememberMe,
                userAgent: options.userAgent,
                ip: options.ip
            });
            
            // به‌روزرسانی وضعیت سیستم
            await this._updateSystemState(user, tokens);
            
            // تنظیم تایمرهای رفرش
            this._setupTokenRefresh(user.id, tokens.refreshToken);
            
            // تحلیل رویداد موفق
            if (this._services.analytics) {
                await this._services.analytics.trackLogin(true, {
                    userId: user.id,
                    method: 'password',
                    rememberMe,
                    duration: Date.now() - (options.startTime || Date.now())
                });
            }
            
            // انتشار رویداد موفقیت
            this._services.events.emit('auth:login:success', {
                operationId,
                userId: user.id,
                timestamp: Date.now(),
                rememberMe,
                isPostRegister: options.isPostRegister || false
            });
            
            // فراخوانی callback
            if (typeof this._config.onLoginSuccess === 'function') {
                this._config.onLoginSuccess(user, operationId);
            }
            
            // پاکسازی تلاش‌های ناموفق
            this._clearFailedLogins(email);
            
            return {
                success: true,
                user: this._sanitizeUserResponse(user),
                tokens: {
                    accessToken: tokens.accessToken,
                    refreshToken: tokens.refreshToken,
                    expiresIn: this._config.tokenExpiry
                },
                session: {
                    id: await this._services.session.getSessionId(),
                    expiresAt: Date.now() + this._config.sessionTimeout
                },
                operationId
            };
            
        } catch (error) {
            console.error('[AuthManager] خطا در ورود:', error);
            
            // ثبت تلاش ناموفق
            if (email) {
                await this._recordFailedLogin(email);
            }
            
            // تحلیل رویداد ناموفق
            if (this._services.analytics) {
                await this._services.analytics.trackLogin(false, {
                    email: this._maskEmail(email),
                    error: error.message,
                    rememberMe
                });
            }
            
            // انتشار رویداد خطا
            this._services.events.emit('auth:login:failed', {
                operationId,
                email: this._maskEmail(email),
                error: error.message,
                timestamp: Date.now()
            });
            
            // فراخوانی callback
            if (typeof this._config.onLoginFailure === 'function') {
                this._config.onLoginFailure(email, error.message, operationId);
            }
            
            return {
                success: false,
                error: error.message,
                operationId,
                locked: await this._checkLoginLockout(email)
            };
        }
    }
    
    async logout(options = {}) {
        const operationId = this._generateOperationId('logout');
        
        try {
            // دریافت اطلاعات session فعلی
            const sessionInfo = await this._services.session.getSessionInfo();
            const userId = sessionInfo?.userId;
            
            // انتشار رویداد شروع خروج
            this._services.events.emit('auth:logout:start', {
                operationId,
                userId,
                timestamp: Date.now(),
                reason: options.reason || 'user_initiated'
            });
            
            // باطل کردن توکن‌ها
            await this._invalidateTokens(userId);
            
            // پاکسازی session
            await this._services.session.clear();
            
            // پاکسازی تایمرها
            this._clearRefreshTimers(userId);
            
            // به‌روزرسانی وضعیت سیستم
            await this._clearSystemState();
            
            // تحلیل رویداد
            if (this._services.analytics) {
                await this._services.analytics.trackLogout(options.reason || 'user_initiated', {
                    userId,
                    sessionDuration: sessionInfo?.duration || 0
                });
            }
            
            // انتشار رویداد موفقیت
            this._services.events.emit('auth:logout:success', {
                operationId,
                userId,
                timestamp: Date.now()
            });
            
            // فراخوانی callback
            if (typeof this._config.onLogout === 'function') {
                this._config.onLogout(userId, operationId);
            }
            
            return {
                success: true,
                operationId,
                userId
            };
            
        } catch (error) {
            console.error('[AuthManager] خطا در خروج:', error);
            
            // انتشار رویداد خطا
            this._services.events.emit('auth:logout:failed', {
                operationId,
                error: error.message,
                timestamp: Date.now()
            });
            
            return {
                success: false,
                error: error.message,
                operationId
            };
        }
    }
    
    async refreshToken(refreshToken) {
        const operationId = this._generateOperationId('refresh');
        
        try {
            // انتشار رویداد شروع رفرش
            this._services.events.emit('auth:refresh:start', {
                operationId,
                timestamp: Date.now()
            });
            
            // اعتبارسنجی refresh token
            const isValid = await this._services.token.validateRefreshToken(refreshToken);
            if (!isValid) {
                throw new Error('Refresh token نامعتبر است');
            }
            
            // استخراج اطلاعات کاربر
            const payload = await this._services.token.decodeToken(refreshToken);
            if (!payload || !payload.userId) {
                throw new Error('نمی‌توان اطلاعات کاربر را استخراج کرد');
            }
            
            // دریافت اطلاعات کاربر
            const user = await this._getUserById(payload.userId);
            if (!user) {
                throw new Error('کاربر یافت نشد');
            }
            
            // بررسی وضعیت حساب
            const accountStatus = await this._checkAccountStatus(user);
            if (!accountStatus.active) {
                throw new Error(`حساب کاربری ${accountStatus.reason}`);
            }
            
            // ایجاد توکن جدید
            const newTokens = await this._generateTokens(user, payload.rememberMe || false);
            
            // باطل کردن توکن قدیمی
            await this._services.token.blacklistToken(refreshToken, 'refreshed');
            
            // به‌روزرسانی session
            await this._updateSessionTokens(user.id, newTokens);
            
            // انتشار رویداد موفقیت
            this._services.events.emit('auth:refresh:success', {
                operationId,
                userId: user.id,
                timestamp: Date.now()
            });
            
            return {
                success: true,
                tokens: {
                    accessToken: newTokens.accessToken,
                    refreshToken: newTokens.refreshToken,
                    expiresIn: this._config.tokenExpiry
                },
                operationId
            };
            
        } catch (error) {
            console.error('[AuthManager] خطا در رفرش توکن:', error);
            
            // انتشار رویداد خطا
            this._services.events.emit('auth:refresh:failed', {
                operationId,
                error: error.message,
                timestamp: Date.now()
            });
            
            // اگر refresh token نامعتبر بود، logout خودکار
            if (error.message.includes('نامعتبر') || error.message.includes('منقضی')) {
                this._services.events.emit('auth:session:expired', {
                    reason: 'invalid_refresh_token',
                    timestamp: Date.now()
                });
                
                if (typeof this._config.onSessionExpired === 'function') {
                    this._config.onSessionExpired('invalid_refresh_token');
                }
            }
            
            return {
                success: false,
                error: error.message,
                operationId
            };
        }
    }
    
    async verifySession(sessionId = null) {
        const operationId = this._generateOperationId('verify');
        
        try {
            // دریافت session ID
            const currentSessionId = sessionId || await this._services.session.getSessionId();
            if (!currentSessionId) {
                return {
                    valid: false,
                    reason: 'NO_SESSION',
                    operationId
                };
            }
            
            // بررسی وجود session
            const sessionExists = await this._services.session.exists(currentSessionId);
            if (!sessionExists) {
                return {
                    valid: false,
                    reason: 'SESSION_NOT_FOUND',
                    operationId
                };
            }
            
            // بررسی انقضای session
            const isExpired = await this._services.session.isExpired(currentSessionId);
            if (isExpired) {
                return {
                    valid: false,
                    reason: 'SESSION_EXPIRED',
                    operationId
                };
            }
            
            // بررسی اعتبار توکن
            const tokenValid = await this._verifyCurrentToken();
            if (!tokenValid.valid) {
                return {
                    valid: false,
                    reason: tokenValid.reason || 'INVALID_TOKEN',
                    operationId
                };
            }
            
            // دریافت اطلاعات کاربر
            const user = await this._getCurrentUser();
            if (!user) {
                return {
                    valid: false,
                    reason: 'USER_NOT_FOUND',
                    operationId
                };
            }
            
            return {
                valid: true,
                user: this._sanitizeUserResponse(user),
                sessionId: currentSessionId,
                operationId
            };
            
        } catch (error) {
            console.error('[AuthManager] خطا در بررسی session:', error);
            
            return {
                valid: false,
                reason: 'VERIFICATION_ERROR',
                error: error.message,
                operationId
            };
        }
    }
    
    async changePassword(currentPassword, newPassword, confirmPassword) {
        const operationId = this._generateOperationId('change_password');
        
        try {
            // اعتبارسنجی اولیه
            if (newPassword !== confirmPassword) {
                throw new Error('رمز عبور جدید و تأیید آن مطابقت ندارند');
            }
            
            // دریافت کاربر فعلی
            const currentUser = await this._getCurrentUser();
            if (!currentUser) {
                throw new Error('کاربر یافت نشد');
            }
            
            // تأیید رمز عبور فعلی
            const passwordValid = await this._verifyPassword(currentUser.email, currentPassword);
            if (!passwordValid) {
                throw new Error('رمز عبور فعلی نادرست است');
            }
            
            // اعتبارسنجی رمز عبور جدید
            const validation = await this._validatePassword(newPassword);
            if (!validation.valid) {
                throw new Error(validation.errors.join(', '));
            }
            
            // به‌روزرسانی رمز عبور
            await this._updateUserPassword(currentUser.id, newPassword);
            
            // باطل کردن تمام session‌های دیگر
            await this._invalidateOtherSessions(currentUser.id);
            
            // انتشار رویداد
            this._services.events.emit('auth:password:changed', {
                operationId,
                userId: currentUser.id,
                timestamp: Date.now()
            });
            
            return {
                success: true,
                operationId,
                message: 'رمز عبور با موفقیت تغییر یافت'
            };
            
        } catch (error) {
            console.error('[AuthManager] خطا در تغییر رمز عبور:', error);
            
            return {
                success: false,
                error: error.message,
                operationId
            };
        }
    }
    
    async resetPassword(email, options = {}) {
        const operationId = this._generateOperationId('reset_password');
        
        try {
            // بررسی وجود کاربر
            const user = await this._getUserByEmail(email);
            if (!user) {
                // برای امنیت، حتی اگر کاربر وجود نداشته باشد موفق گزارش شود
                return {
                    success: true,
                    operationId,
                    message: 'اگر این ایمیل در سیستم وجود داشته باشد، دستورالعمل بازیابی ارسال خواهد شد'
                };
            }
            
            // ایجاد توکن بازیابی
            const resetToken = await this._services.utils.generateResetToken(user.id);
            
            // ذخیره توکن
            await this._storeResetToken(user.id, resetToken);
            
            // ارسال ایمیل (در حالت واقعی)
            if (!options.skipEmail) {
                await this._sendPasswordResetEmail(user.email, resetToken);
            }
            
            // انتشار رویداد
            this._services.events.emit('auth:password:reset_requested', {
                operationId,
                userId: user.id,
                timestamp: Date.now()
            });
            
            return {
                success: true,
                operationId,
                resetToken: options.skipEmail ? resetToken : undefined,
                message: 'دستورالعمل بازیابی رمز عبور ارسال شد'
            };
            
        } catch (error) {
            console.error('[AuthManager] خطا در درخواست بازیابی رمز عبور:', error);
            
            return {
                success: false,
                error: error.message,
                operationId
            };
        }
    }
    
    async verifyEmail(token) {
        const operationId = this._generateOperationId('verify_email');
        
        try {
            // اعتبارسنجی توکن
            const userId = await this._validateVerificationToken(token);
            if (!userId) {
                throw new Error('توکن تایید نامعتبر است');
            }
            
            // دریافت کاربر
            const user = await this._getUserById(userId);
            if (!user) {
                throw new Error('کاربر یافت نشد');
            }
            
            // تایید ایمیل
            await this._markEmailAsVerified(userId);
            
            // انتشار رویداد
            this._services.events.emit('auth:email:verified', {
                operationId,
                userId,
                timestamp: Date.now()
            });
            
            return {
                success: true,
                operationId,
                message: 'ایمیل با موفقیت تایید شد'
            };
            
        } catch (error) {
            console.error('[AuthManager] خطا در تایید ایمیل:', error);
            
            return {
                success: false,
                error: error.message,
                operationId
            };
        }
    }
    
    // ==================== مدیریت حساب کاربری ====================
    
    async updateProfile(userId, updates) {
        const operationId = this._generateOperationId('update_profile');
        
        try {
            // اعتبارسنجی داده‌ها
            const validation = await this._validateProfileUpdates(updates);
            if (!validation.valid) {
                throw new Error(validation.errors.join(', '));
            }
            
            // به‌روزرسانی پروفایل
            const updatedUser = await this._updateUserProfile(userId, updates);
            
            // انتشار رویداد
            this._services.events.emit('auth:profile:updated', {
                operationId,
                userId,
                updates: Object.keys(updates),
                timestamp: Date.now()
            });
            
            return {
                success: true,
                user: this._sanitizeUserResponse(updatedUser),
                operationId
            };
            
        } catch (error) {
            console.error('[AuthManager] خطا در به‌روزرسانی پروفایل:', error);
            
            return {
                success: false,
                error: error.message,
                operationId
            };
        }
    }
    
    async deactivateAccount(userId, reason = 'user_requested') {
        const operationId = this._generateOperationId('deactivate_account');
        
        try {
            // غیرفعال کردن حساب
            await this._deactivateUserAccount(userId, reason);
            
            // logout کاربر
            await this.logout({ reason: 'account_deactivated' });
            
            // انتشار رویداد
            this._services.events.emit('auth:account:deactivated', {
                operationId,
                userId,
                reason,
                timestamp: Date.now()
            });
            
            return {
                success: true,
                operationId,
                message: 'حساب کاربری با موفقیت غیرفعال شد'
            };
            
        } catch (error) {
            console.error('[AuthManager] خطا در غیرفعال کردن حساب:', error);
            
            return {
                success: false,
                error: error.message,
                operationId
            };
        }
    }
    
    // ==================== ابزارهای کمکی ====================
    
    getCurrentUser() {
        return this._state.currentUser 
            ? this._sanitizeUserResponse(this._state.currentUser)
            : null;
    }
    
    isAuthenticated() {
        return this._state.isAuthenticated;
    }
    
    hasPermission(permission, context = {}) {
        if (!this._state.currentUser || !this._services.permissions) {
            return false;
        }
        
        return this._services.permissions.can(permission, {
            ...context,
            user: this._state.currentUser
        });
    }
    
    getSessionInfo() {
        return this._services.session.getSessionInfo 
            ? this._services.session.getSessionInfo()
            : null;
    }
    
    getConfig() {
        return { ...this._config };
    }
    
    updateConfig(newConfig) {
        Object.keys(newConfig).forEach(key => {
            if (this._config.hasOwnProperty(key)) {
                this._config[key] = newConfig[key];
            }
        });
        
        this._services.events.emit('auth:config:updated', {
            config: this._config,
            timestamp: Date.now()
        });
        
        return { success: true, updated: Object.keys(newConfig) };
    }
    
    // ==================== Private Methods ====================
    
    _validateDependencies() {
        const required = ['events', 'state', 'token', 'session', 'validator', 'permissions', 'analytics', 'utils'];
        
        required.forEach(service => {
            if (!this._services[service]) {
                throw new Error(`سرویس ${service} برای AuthManager ضروری است`);
            }
        });
    }
    
    _initialize() {
        this._state.isInitialized = true;
        
        // ثبت global reference برای دیباگ
        if (typeof window !== 'undefined') {
            window.__vakamovaAuthManager = this;
        }
    }
    
    _setupEventListeners() {
        // گوش دادن به رویدادهای session
        this._services.events.on('session:expired', () => {
            this._handleSessionExpiration();
        });
        
        this._services.events.on('session:invalidated', (data) => {
            this._handleSessionInvalidation(data);
        });
        
        // گوش دادن به رویدادهای شبکه
        window.addEventListener('online', () => {
            this._services.events.emit('auth:network:restored');
        });
        
        window.addEventListener('offline', () => {
            this._services.events.emit('auth:network:lost');
        });
        
        // تایمر بررسی session
        setInterval(() => {
            this._checkAllSessions();
        }, 60000); // هر دقیقه
    }
    
    _loadPersistedState() {
        // در اینجا می‌توانید state ذخیره شده را از localStorage بارگذاری کنید
        try {
            const savedState = localStorage.getItem('vakamova_auth_state');
            if (savedState) {
                const parsed = JSON.parse(savedState);
                if (parsed.currentUser) {
                    this._state.currentUser = parsed.currentUser;
                    this._state.isAuthenticated = true;
                }
            }
        } catch (error) {
            console.warn('[AuthManager] خطا در بارگذاری state ذخیره شده:', error);
        }
    }
    
    _savePersistedState() {
        try {
            const stateToSave = {
                currentUser: this._state.currentUser,
                isAuthenticated: this._state.isAuthenticated,
                timestamp: Date.now()
            };
            
            localStorage.setItem('vakamova_auth_state', JSON.stringify(stateToSave));
        } catch (error) {
            console.warn('[AuthManager] خطا در ذخیره state:', error);
        }
    }
    
    _generateOperationId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    _sanitizeUserData(userData) {
        const sanitized = { ...userData };
        
        // حذف فیلدهای حساس برای لاگ
        delete sanitized.password;
        delete sanitized.confirmPassword;
        delete sanitized.creditCard;
        delete sanitized.ssn;
        
        return sanitized;
    }
    
    _sanitizeUserResponse(user) {
        if (!user) return null;
        
        const sanitized = { ...user };
        
        // حذف فیلدهای حساس
        delete sanitized.passwordHash;
        delete sanitized.salt;
        delete sanitized.resetToken;
        delete sanitized.verificationToken;
        delete sanitized.creditCardInfo;
        
        return sanitized;
    }
    
    _maskEmail(email) {
        if (!email || !email.includes('@')) return email;
        
        const [local, domain] = email.split('@');
        const maskedLocal = local.length > 2 
            ? `${local.charAt(0)}***${local.charAt(local.length - 1)}`
            : '***';
        
        return `${maskedLocal}@${domain}`;
    }
    
    async _validateRegistration(userData) {
        return this._services.validator.validateRegistration 
            ? await this._services.validator.validateRegistration(userData)
            : { valid: true, errors: [] };
    }
    
    async _validatePassword(password) {
        return this._services.validator.validatePassword 
            ? await this._services.validator.validatePassword(password, this._config)
            : { valid: true, errors: [] };
    }
    
    async _checkUserExists(email) {
        // در اینجا باید با پایگاه داده چک شود
        // فعلاً false برمی‌گرداند
        return false;
    }
    
    async _createUserAccount(userData) {
        // در اینجا باید کاربر در پایگاه داده ایجاد شود
        // فعلاً یک کاربر نمونه برمی‌گرداند
        return {
            id: `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            email: userData.email,
            name: userData.name || userData.email.split('@')[0],
            role: 'student',
            isVerified: !this._config.requireEmailVerification,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
    }
    
    async _initializeUserSession(user) {
        // در اینجا session اولیه ایجاد می‌شود
        // فعلاً کاری انجام نمی‌دهیم
        return true;
    }
    
    async _sendVerificationEmail(user) {
        // در اینجا ایمیل تایید ارسال می‌شود
        console.log(`ایمیل تایید به ${user.email} ارسال شد`);
        return true;
    }
    
    async _checkLoginLockout(email) {
        if (!this._state.loginAttempts.has(email)) {
            return { locked: false };
        }
        
        const attempts = this._state.loginAttempts.get(email);
        const now = Date.now();
        const recentAttempts = attempts.filter(time => now - time < this._config.lockoutDuration);
        
        if (recentAttempts.length >= this._config.maxLoginAttempts) {
            const oldestAttempt = Math.min(...recentAttempts);
            const unlockTime = oldestAttempt + this._config.lockoutDuration;
            const remainingTime = Math.ceil((unlockTime - now) / 1000);
            
            return {
                locked: true,
                remainingTime,
                unlockTime: new Date(unlockTime).toISOString()
            };
        }
        
        return { locked: false };
    }
    
    async _recordFailedLogin(email) {
        if (!this._state.loginAttempts.has(email)) {
            this._state.loginAttempts.set(email, []);
        }
        
        const attempts = this._state.loginAttempts.get(email);
        attempts.push(Date.now());
        
        // فقط آخرین ۱۰ تلاش را نگه دار
        if (attempts.length > 10) {
            attempts.splice(0, attempts.length - 10);
        }
    }
    
    _clearFailedLogins(email) {
        this._state.loginAttempts.delete(email);
    }
    
    async _authenticateUser(email, password) {
        // در اینجا احراز هویت واقعی انجام می‌شود
        // فعلاً یک کاربر نمونه برمی‌گرداند
        return {
            id: `user_${email.hashCode()}`,
            email,
            name: email.split('@')[0],
            role: 'student',
            isVerified: true,
            createdAt: new Date().toISOString()
        };
    }
    
    async _checkAccountStatus(user) {
        // بررسی وضعیت حساب کاربری
        if (!user.isActive) {
            return { active: false, reason: 'غیرفعال است' };
        }
        
        if (!user.isVerified && this._config.requireEmailVerification) {
            return { active: false, reason: 'تایید نشده است' };
        }
        
        return { active: true };
    }
    
    async _enforceConcurrentSessions(userId) {
        // بررسی و محدودیت session همزمان
        // فعلاً کاری انجام نمی‌دهیم
        return true;
    }
    
    async _generateTokens(user, rememberMe) {
        const accessToken = await this._services.token.generateAccessToken({
            userId: user.id,
            email: user.email,
            role: user.role
        }, this._config.tokenExpiry);
        
        const refreshToken = await this._services.token.generateRefreshToken({
            userId: user.id,
            rememberMe
        }, this._config.refreshTokenExpiry);
        
        return { accessToken, refreshToken };
    }
    
    async _createSession(user, tokens, metadata) {
        await this._services.session.create({
            userId: user.id,
            accessToken: tokens.accessToken,
            refreshToken: tokens.refreshToken,
            ...metadata
        });
    }
    
    async _updateSystemState(user, tokens) {
        this._state.currentUser = user;
        this._state.isAuthenticated = true;
        
        // ذخیره در state manager
        await this._services.state.set('auth.user', user);
        await this._services.state.set('auth.tokens', {
            accessToken: tokens.accessToken,
            expiresAt: Date.now() + (this._config.tokenExpiry * 1000)
        });
        
        // ذخیره state
        this._savePersistedState();
    }
    
    _setupTokenRefresh(userId, refreshToken) {
        // پاکسازی تایمر قبلی
        this._clearRefreshTimers(userId);
        
        // تنظیم تایمر جدید
        const refreshTime = Date.now() + (this._config.refreshTokenInterval * 0.8); // 80% زمان انقضا
        
        const timerId = setTimeout(async () => {
            try {
                await this.refreshToken(refreshToken);
            } catch (error) {
                console.error('[AuthManager] خطا در رفرش خودکار توکن:', error);
            }
        }, this._config.refreshTokenInterval);
        
        this._state.refreshTimers.set(userId, timerId);
    }
    
    _clearRefreshTimers(userId) {
        if (this._state.refreshTimers.has(userId)) {
            clearTimeout(this._state.refreshTimers.get(userId));
            this._state.refreshTimers.delete(userId);
        }
    }
    
    async _invalidateTokens(userId) {
        if (this._services.token.invalidateUserTokens) {
            await this._services.token.invalidateUserTokens(userId);
        }
    }
    
    async _clearSystemState() {
        this._state.currentUser = null;
        this._state.isAuthenticated = false;
        
        // پاکسازی state manager
        await this._services.state.set('auth.user', null);
        await this._services.state.set('auth.tokens', null);
        
        // پاکسازی localStorage
        localStorage.removeItem('vakamova_auth_state');
    }
    
    async _getUserById(userId) {
        // دریافت کاربر از پایگاه داده
        // فعلاً null برمی‌گرداند
        return null;
    }
    
    async _getCurrentUser() {
        if (this._state.currentUser) {
            return this._state.currentUser;
        }
        
        // تلاش برای دریافت از session
        if (this._services.session.getCurrentUser) {
            return await this._services.session.getCurrentUser();
        }
        
        return null;
    }
    
    async _verifyCurrentToken() {
        if (!this._services.token.verifyToken) {
            return { valid: true };
        }
        
        const token = await this._services.session.getAccessToken();
        if (!token) {
            return { valid: false, reason: 'NO_TOKEN' };
        }
        
        return await this._services.token.verifyToken(token);
    }
    
    async _verifyPassword(email, password) {
        // در اینجا رمز عبور واقعی تأیید می‌شود
        // فعلاً true برمی‌گرداند
        return true;
    }
    
    async _updateUserPassword(userId, newPassword) {
        // در اینجا رمز عبور در پایگاه داده به‌روز می‌شود
        return true;
    }
    
    async _invalidateOtherSessions(userId) {
        // باطل کردن سایر session‌های کاربر
        if (this._services.session.invalidateOtherSessions) {
            await this._services.session.invalidateOtherSessions(userId);
        }
    }
    
    async _getUserByEmail(email) {
        // دریافت کاربر از پایگاه داده
        // فعلاً null برمی‌گرداند
        return null;
    }
    
    async _storeResetToken(userId, token) {
        // ذخیره توکن بازیابی در پایگاه داده
        return true;
    }
    
    async _sendPasswordResetEmail(email, token) {
        // ارسال ایمیل بازیابی
        console.log(`ایمیل بازیابی رمز عبور به ${email} ارسال شد`);
        return true;
    }
    
    async _validateVerificationToken(token) {
        // اعتبارسنجی توکن تایید
        // فعلاً یک ID نمونه برمی‌گرداند
        return `user_${token.hashCode()}`;
    }
    
    async _markEmailAsVerified(userId) {
        // علامت‌گذاری ایمیل به عنوان تایید شده
        return true;
    }
    
    async _validateProfileUpdates(updates) {
        // اعتبارسنجی به‌روزرسانی‌های پروفایل
        return { valid: true, errors: [] };
    }
    
    async _updateUserProfile(userId, updates) {
        // به‌روزرسانی پروفایل کاربر
        // فعلاً کاربر فعلی را برمی‌گرداند
        return this._state.currentUser;
    }
    
    async _deactivateUserAccount(userId, reason) {
        // غیرفعال کردن حساب کاربری
        return true;
    }
    
    async _updateSessionTokens(userId, tokens) {
        // به‌روزرسانی توکن‌های session
        if (this._services.session.updateTokens) {
            await this._services.session.updateTokens(userId, tokens);
        }
    }
    
    _handleSessionExpiration() {
        this._services.events.emit('auth:session:expired', {
            timestamp: Date.now(),
            reason: 'timeout'
        });
        
        if (typeof this._config.onSessionExpired === 'function') {
            this._config.onSessionExpired('timeout');
        }
    }
    
    _handleSessionInvalidation(data) {
        this._services.events.emit('auth:session:invalidated', {
            ...data,
            timestamp: Date.now()
        });
    }
    
    async _checkAllSessions() {
        // بررسی session‌های فعال
        if (this._services.session.checkAllSessions) {
            await this._services.session.checkAllSessions();
        }
    }
}

// افزودن تابع hashCode به String
if (!String.prototype.hashCode) {
    String.prototype.hashCode = function() {
        let hash = 0;
        for (let i = 0; i < this.length; i++) {
            const char = this.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    };
}

// ==================== Export Pattern ====================

let authManagerInstance = null;

function createAuthManager(dependencies = {}) {
    if (!authManagerInstance) {
        authManagerInstance = new VakamovaAuthManager(dependencies);
    }
    return authManagerInstance;
}

function getAuthManager() {
    if (!authManagerInstance) {
        throw new Error('AuthManager هنوز راه‌اندازی نشده است');
    }
    return authManagerInstance;
}

// قرارداد رابط استاندارد
const AuthManagerInterface = {
    create: createAuthManager,
    get: getAuthManager,
    reset: () => { authManagerInstance = null; },
    
    // متدهای utility سریع
    quickLogin: (credentials) => {
        const instance = getAuthManager();
        return instance.login(credentials);
    },
    
    quickLogout: () => {
        const instance = getAuthManager();
        return instance.logout();
    },
    
    checkAuth: () => {
        const instance = getAuthManager();
        return instance.verifySession();
    }
};

// Export برای محیط‌های مختلف
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        VakamovaAuthManager,
        AuthManagerInterface
    };
}

if (typeof window !== 'undefined') {
    window.VakamovaAuthManager = VakamovaAuthManager;
    window.AuthManager = AuthManagerInterface;
}

console.log('[AuthManager] ✅ هسته اصلی احراز هویت بارگذاری شد');
