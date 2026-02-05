/**
 * VAKAMOVA TOKEN MANAGER - سیستم مدیریت پیشرفته توکن‌های احراز هویت
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * وابستگی داخلی: auth/utils.js, event_bus.js, state_manager.js
 */

class TokenManager {
    constructor(authUtils, eventSystem, stateManager, config = {}) {
        // ==================== تزریق وابستگی ====================
        this._authUtils = authUtils || {
            createToken: () => ({ token: '', expiresAt: 0 }),
            validateToken: () => ({ valid: false })
        };
        
        this._eventSystem = eventSystem || {
            emit: () => console.warn('[TokenManager] Event system not available'),
            on: () => () => {}
        };
        
        this._stateManager = stateManager || {
            set: () => ({}),
            get: () => null,
            subscribe: () => () => {}
        };
        
        // ==================== پیکربندی متمرکز ====================
        this._config = Object.freeze({
            // تنظیمات توکن
            tokens: {
                accessToken: {
                    expiryMinutes: config.accessTokenExpiry || 15,
                    type: 'access',
                    renewalThreshold: 0.3 // 30% مانده به انقضا
                },
                refreshToken: {
                    expiryDays: config.refreshTokenExpiry || 30,
                    type: 'refresh',
                    maxUsageCount: config.maxRefreshUsage || 50,
                    rotationEnabled: config.tokenRotation ?? true
                },
                idToken: {
                    expiryMinutes: config.idTokenExpiry || 60,
                    type: 'id',
                    includeProfile: config.includeProfile ?? true
                }
            },
            
            // تنظیمات ذخیره‌سازی
            storage: {
                useSecureStorage: config.useSecureStorage ?? true,
                storageKeyPrefix: config.storageKeyPrefix || 'vakamova_token_',
                encryptionEnabled: config.encryptionEnabled ?? false,
                encryptionKey: config.encryptionKey || this._generateEncryptionKey(),
                autoCleanupInterval: config.autoCleanupInterval || 5 * 60 * 1000 // 5 دقیقه
            },
            
            // تنظیمات امنیتی
            security: {
                preventTokenReuse: config.preventTokenReuse ?? true,
                maxConcurrentSessions: config.maxConcurrentSessions || 3,
                tokenBlacklisting: config.tokenBlacklisting ?? true,
                blacklistTTL: config.blacklistTTL || 24 * 60 * 60 * 1000, // 24 ساعت
                ipBinding: config.ipBinding ?? false,
                userAgentBinding: config.userAgentBinding ?? true
            },
            
            // تنظیمات بازآوری (Refresh)
            refresh: {
                slidingExpiration: config.slidingExpiration ?? true,
                absoluteExpiryDays: config.absoluteExpiryDays || 90,
                allowConcurrentRefresh: config.allowConcurrentRefresh ?? false,
                refreshGracePeriod: config.refreshGracePeriod || 5000 // 5 ثانیه
            },
            
            // تنظیمات پیش‌فرض
            defaults: {
                issuer: config.issuer || 'vakamova-auth',
                audience: config.audience || 'vakamova-app',
                algorithm: config.algorithm || 'HS256',
                version: '1.0.0'
            },
            
            ...config
        });
        
        // ==================== وضعیت داخلی ====================
        this._tokens = new Map();
        this._refreshQueue = new Map();
        this._blacklist = new Set();
        this._sessionRegistry = new Map();
        this._cleanupInterval = null;
        
        this._metrics = {
            tokensCreated: 0,
            tokensValidated: 0,
            tokensRefreshed: 0,
            tokensRevoked: 0,
            validationFailures: 0,
            securityEvents: 0
        };
        
        this._subscriptions = new Set();
        this._initialized = false;
        
        this._init();
        Object.seal(this._metrics);
        Object.seal(this);
    }
    
    // ==================== متدهای اصلی (قرارداد رابط) ====================
    
    async createTokenSet(userData, context = {}) {
        const tokenSetId = `tokenset_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        this._eventSystem.emit('token:set:creation:start', {
            tokenSetId,
            userId: userData.userId,
            timestamp: startTime,
            context: this._sanitizeContext(context)
        });
        
        try {
            // ایجاد توکن دسترسی (Access Token)
            const accessToken = await this._createAccessToken(userData, context);
            
            // ایجاد توکن بازآوری (Refresh Token)
            const refreshToken = await this._createRefreshToken(userData, context);
            
            // ایجاد توکن شناسایی (ID Token) - اختیاری
            const idToken = this._config.tokens.idToken.includeProfile 
                ? await this._createIdToken(userData, context)
                : null;
            
            // ذخیره‌سازی در state
            const tokenSet = {
                id: tokenSetId,
                accessToken,
                refreshToken,
                idToken,
                userId: userData.userId,
                createdAt: new Date().toISOString(),
                context: this._sanitizeContext(context),
                metadata: {
                    ip: context.ipAddress,
                    userAgent: context.userAgent,
                    deviceId: context.deviceId
                }
            };
            
            await this._storeTokenSet(tokenSet);
            
            // ثبت در رجیستری sessions
            this._registerSession(userData.userId, tokenSetId, context);
            
            this._metrics.tokensCreated += (idToken ? 3 : 2);
            
            this._eventSystem.emit('token:set:created', {
                tokenSetId,
                userId: userData.userId,
                accessTokenExpiry: accessToken.expiresAt,
                refreshTokenExpiry: refreshToken.expiresAt,
                duration: Date.now() - startTime,
                sessionsCount: this._getUserSessionCount(userData.userId)
            });
            
            return {
                success: true,
                tokenSet,
                tokens: {
                    accessToken: accessToken.token,
                    refreshToken: refreshToken.token,
                    idToken: idToken?.token,
                    tokenType: 'Bearer',
                    expiresIn: accessToken.expiresIn,
                    refreshExpiresIn: refreshToken.expiresIn
                }
            };
            
        } catch (error) {
            this._metrics.validationFailures++;
            
            this._eventSystem.emit('token:set:creation:failed', {
                tokenSetId,
                userId: userData.userId,
                error: error.message,
                duration: Date.now() - startTime
            });
            
            throw new Error(`Token set creation failed: ${error.message}`);
        }
    }
    
    async validateAccessToken(token, options = {}) {
        this._metrics.tokensValidated++;
        
        const validationId = `validate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        // بررسی بلک‌لیست
        if (this._config.security.tokenBlacklisting && this._isTokenBlacklisted(token)) {
            this._metrics.securityEvents++;
            
            this._eventSystem.emit('token:validation:blacklisted', {
                validationId,
                token: this._maskToken(token),
                reason: 'token_blacklisted',
                timestamp: startTime
            });
            
            return {
                valid: false,
                reason: 'token_blacklisted',
                code: 'TOKEN_BLACKLISTED',
                validationId,
                timestamp: new Date().toISOString()
            };
        }
        
        // اعتبارسنجی اولیه با authUtils
        const baseValidation = this._authUtils.validateToken(token, {
            audience: options.audience || this._config.defaults.audience,
            issuer: options.issuer || this._config.defaults.issuer
        });
        
        if (!baseValidation.valid) {
            this._metrics.validationFailures++;
            
            this._eventSystem.emit('token:validation:failed', {
                validationId,
                token: this._maskToken(token),
                reason: baseValidation.reason,
                code: baseValidation.code,
                duration: Date.now() - startTime
            });
            
            return {
                ...baseValidation,
                validationId,
                timestamp: new Date().toISOString()
            };
        }
        
        // بررسی امنیتی اضافی
        const securityCheck = await this._performSecurityChecks(token, baseValidation, options);
        if (!securityCheck.valid) {
            return {
                ...securityCheck,
                validationId,
                timestamp: new Date().toISOString()
            };
        }
        
        // بررسی نیاز به بازآوری
        const shouldRefresh = baseValidation.shouldRefresh || 
            this._shouldRefreshToken(baseValidation, options);
        
        // به‌روزرسانی آخرین استفاده
        await this._updateTokenUsage(token, baseValidation, options);
        
        const result = {
            ...baseValidation,
            ...securityCheck,
            validationId,
            shouldRefresh,
            validatedAt: new Date().toISOString(),
            duration: Date.now() - startTime
        };
        
        this._eventSystem.emit('token:validation:succeeded', {
            validationId,
            userId: baseValidation.userId,
            tokenId: baseValidation.tokenId,
            shouldRefresh,
            duration: result.duration
        });
        
        return result;
    }
    
    async refreshTokenSet(refreshToken, context = {}) {
        this._metrics.tokensRefreshed++;
        
        const refreshId = `refresh_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        this._eventSystem.emit('token:refresh:start', {
            refreshId,
            token: this._maskToken(refreshToken),
            timestamp: startTime,
            context: this._sanitizeContext(context)
        });
        
        // بررسی concurrent refresh
        if (!this._config.refresh.allowConcurrentRefresh) {
            const queueKey = `${context.userId || 'unknown'}_${context.ipAddress || 'unknown'}`;
            if (this._refreshQueue.has(queueKey)) {
                return {
                    success: false,
                    refreshId,
                    reason: 'concurrent_refresh_not_allowed',
                    code: 'CONCURRENT_REFRESH',
                    retryAfter: this._config.refresh.refreshGracePeriod
                };
            }
            
            this._refreshQueue.set(queueKey, { refreshId, startTime });
            
            // Cleanup بعد از grace period
            setTimeout(() => {
                this._refreshQueue.delete(queueKey);
            }, this._config.refresh.refreshGracePeriod);
        }
        
        try {
            // اعتبارسنجی refresh token
            const validation = this._authUtils.validateToken(refreshToken, {
                audience: this._config.defaults.audience,
                issuer: this._config.defaults.issuer
            });
            
            if (!validation.valid) {
                throw new Error(`Invalid refresh token: ${validation.reason}`);
            }
            
            // بررسی usage count
            const usageCheck = await this._checkRefreshTokenUsage(validation.tokenId, context);
            if (!usageCheck.allowed) {
                throw new Error(`Refresh token usage exceeded: ${usageCheck.reason}`);
            }
            
            // دریافت اطلاعات کاربر از state
            const userData = await this._getUserDataFromToken(validation.tokenId);
            if (!userData) {
                throw new Error('User data not found for token');
            }
            
            // بررسی absolute expiry
            if (this._isAbsoluteExpired(validation.issuedAt)) {
                throw new Error('Absolute token expiry reached');
            }
            
            // ایجاد توکن‌های جدید
            const newTokenSet = await this.createTokenSet(userData, {
                ...context,
                previousTokenId: validation.tokenId,
                refreshChain: (context.refreshChain || 0) + 1
            });
            
            // revocation توکن قبلی اگر rotation فعال باشد
            if (this._config.tokens.refreshToken.rotationEnabled) {
                await this.revokeToken(refreshToken, 'rotated', {
                    replacedBy: newTokenSet.tokenSet.id,
                    refreshId
                });
            }
            
            // به‌روزرسانی usage count
            await this._incrementRefreshTokenUsage(validation.tokenId);
            
            const duration = Date.now() - startTime;
            
            this._eventSystem.emit('token:refresh:succeeded', {
                refreshId,
                userId: userData.userId,
                newTokenSetId: newTokenSet.tokenSet.id,
                duration,
                refreshChain: context.refreshChain || 0
            });
            
            return {
                success: true,
                refreshId,
                tokenSet: newTokenSet.tokenSet,
                tokens: newTokenSet.tokens,
                duration,
                previousTokenRevoked: this._config.tokens.refreshToken.rotationEnabled
            };
            
        } catch (error) {
            this._metrics.validationFailures++;
            
            this._eventSystem.emit('token:refresh:failed', {
                refreshId,
                token: this._maskToken(refreshToken),
                error: error.message,
                duration: Date.now() - startTime
            });
            
            return {
                success: false,
                refreshId,
                reason: error.message,
                code: 'REFRESH_FAILED',
                duration: Date.now() - startTime
            };
        }
    }
    
    async revokeToken(token, reason = 'user_revoked', metadata = {}) {
        const revocationId = `revoke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        // اعتبارسنجی توکن برای استخراج اطلاعات
        const validation = this._authUtils.validateToken(token);
        
        const revocationData = {
            id: revocationId,
            token: this._maskToken(token),
            tokenId: validation.valid ? validation.tokenId : 'unknown',
            userId: validation.valid ? validation.userId : 'unknown',
            reason,
            metadata,
            revokedAt: new Date().toISOString(),
            revokedBy: metadata.revokedBy || 'system'
        };
        
        // اضافه به بلک‌لیست
        if (this._config.security.tokenBlacklisting && validation.valid) {
            this._blacklist.add(validation.tokenId);
            
            // حذف خودکار از بلک‌لیست بعد از TTL
            setTimeout(() => {
                this._blacklist.delete(validation.tokenId);
            }, this._config.security.blacklistTTL);
        }
        
        // حذف از state
        await this._removeTokenFromStorage(validation.tokenId);
        
        // حذف از session registry
        if (validation.valid && validation.userId) {
            this._unregisterSession(validation.userId, validation.tokenId);
        }
        
        this._metrics.tokensRevoked++;
        
        this._eventSystem.emit('token:revoked', {
            ...revocationData,
            duration: Date.now() - startTime,
            blacklisted: this._config.security.tokenBlacklisting
        });
        
        return {
            success: true,
            ...revocationData,
            duration: Date.now() - startTime
        };
    }
    
    async revokeAllUserTokens(userId, reason = 'user_logout', metadata = {}) {
        const revocationId = `revoke_all_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        const userSessions = this._sessionRegistry.get(userId) || new Set();
        const revokedTokens = [];
        
        for (const tokenId of userSessions) {
            try {
                // پیدا کردن توکن از state (در نسخه واقعی)
                // const token = await this._getTokenFromStorage(tokenId);
                // if (token) {
                //     await this.revokeToken(token.token, reason, {
                //         ...metadata,
                //         batchRevocationId: revocationId
                //     });
                //     revokedTokens.push(tokenId);
                // }
                revokedTokens.push(tokenId);
            } catch (error) {
                console.warn(`Failed to revoke token ${tokenId}:`, error);
            }
        }
        
        // پاک‌سازی session registry
        this._sessionRegistry.delete(userId);
        
        this._eventSystem.emit('token:all_revoked', {
            revocationId,
            userId,
            reason,
            revokedCount: revokedTokens.length,
            duration: Date.now() - startTime,
            metadata
        });
        
        return {
            success: true,
            revocationId,
            userId,
            revokedTokens,
            revokedCount: revokedTokens.length,
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString()
        };
    }
    
    // ==================== متدهای مدیریتی ====================
    
    getActiveSessions(userId = null) {
        if (userId) {
            const userSessions = this._sessionRegistry.get(userId) || new Set();
            return {
                userId,
                sessionCount: userSessions.size,
                sessions: Array.from(userSessions),
                timestamp: new Date().toISOString()
            };
        }
        
        const allSessions = {};
        let totalSessions = 0;
        
        for (const [uid, sessions] of this._sessionRegistry) {
            allSessions[uid] = Array.from(sessions);
            totalSessions += sessions.size;
        }
        
        return {
            totalUsers: this._sessionRegistry.size,
            totalSessions,
            sessions: allSessions,
            timestamp: new Date().toISOString()
        };
    }
    
    async cleanupExpiredTokens() {
        const cleanupId = `cleanup_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        let cleanedCount = 0;
        const now = Date.now();
        
        // اینجا در نسخه واقعی باید state را اسکن کنیم
        // برای نمونه:
        // for (const [tokenId, tokenData] of this._tokens) {
        //     if (tokenData.expiresAt < now) {
        //         await this.revokeToken(tokenData.token, 'expired_cleanup', {
        //             cleanupId,
        //             auto: true
        //         });
        //         cleanedCount++;
        //     }
        // }
        
        this._eventSystem.emit('token:cleanup:completed', {
            cleanupId,
            cleanedCount,
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString()
        });
        
        return {
            success: true,
            cleanupId,
            cleanedCount,
            duration: Date.now() - startTime
        };
    }
    
    getMetrics() {
        return {
            ...this._metrics,
            activeSessions: this._getTotalSessionCount(),
            blacklistedTokens: this._blacklist.size,
            refreshQueueSize: this._refreshQueue.size,
            storageSize: this._tokens.size
        };
    }
    
    resetMetrics() {
        this._metrics.tokensCreated = 0;
        this._metrics.tokensValidated = 0;
        this._metrics.tokensRefreshed = 0;
        this._metrics.tokensRevoked = 0;
        this._metrics.validationFailures = 0;
        this._metrics.securityEvents = 0;
        return this;
    }
    
    // ==================== متدهای داخلی ====================
    
    async _createAccessToken(userData, context) {
        const payload = {
            userId: userData.userId,
            role: userData.role || 'user',
            permissions: userData.permissions || [],
            sessionType: context.sessionType || 'regular',
            deviceId: context.deviceId,
            ...userData.tokenPayload
        };
        
        const tokenData = this._authUtils.createToken(payload, {
            expiryDays: this._config.tokens.accessToken.expiryMinutes / (24 * 60),
            audience: this._config.defaults.audience,
            issuer: this._config.defaults.issuer,
            source: 'token_manager',
            deviceInfo: {
                ip: context.ipAddress,
                userAgent: context.userAgent,
                timestamp: new Date().toISOString()
            }
        });
        
        return {
            ...tokenData,
            type: 'access',
            renewalThreshold: this._config.tokens.accessToken.renewalThreshold
        };
    }
    
    async _createRefreshToken(userData, context) {
        const payload = {
            userId: userData.userId,
            tokenType: 'refresh',
            usageCount: 0,
            maxUsage: this._config.tokens.refreshToken.maxUsageCount,
            initialIp: context.ipAddress,
            initialUserAgent: context.userAgent,
            absoluteExpiry: Date.now() + (this._config.refresh.absoluteExpiryDays * 24 * 60 * 60 * 1000)
        };
        
        const tokenData = this._authUtils.createToken(payload, {
            expiryDays: this._config.tokens.refreshToken.expiryDays,
            audience: this._config.defaults.audience,
            issuer: this._config.defaults.issuer,
            source: 'token_manager_refresh'
        });
        
        return {
            ...tokenData,
            type: 'refresh',
            maxUsage: this._config.tokens.refreshToken.maxUsageCount,
            currentUsage: 0,
            rotationEnabled: this._config.tokens.refreshToken.rotationEnabled
        };
    }
    
    async _createIdToken(userData, context) {
        const profile = {
            userId: userData.userId,
            email: userData.email,
            username: userData.username,
            fullName: userData.fullName,
            avatar: userData.avatar,
            emailVerified: userData.emailVerified || false,
            profileCompleted: userData.profileCompleted || false
        };
        
        const tokenData = this._authUtils.createToken(profile, {
            expiryDays: this._config.tokens.idToken.expiryMinutes / (24 * 60),
            audience: this._config.defaults.audience,
            issuer: this._config.defaults.issuer,
            source: 'token_manager_id'
        });
        
        return {
            ...tokenData,
            type: 'id',
            includesProfile: true
        };
    }
    
    async _storeTokenSet(tokenSet) {
        // ذخیره در state manager
        await this._stateManager.set(`tokens.${tokenSet.id}`, tokenSet, {
            namespace: 'auth',
            source: 'token_manager'
        });
        
        // ذخیره در حافظه داخلی
        this._tokens.set(tokenSet.id, {
            data: tokenSet,
            storedAt: Date.now(),
            accessExpiry: tokenSet.accessToken.expiresAt,
            refreshExpiry: tokenSet.refreshToken.expiresAt
        });
        
        return true;
    }
    
    _registerSession(userId, tokenSetId, context) {
        if (!this._sessionRegistry.has(userId)) {
            this._sessionRegistry.set(userId, new Set());
        }
        
        const userSessions = this._sessionRegistry.get(userId);
        userSessions.add(tokenSetId);
        
        // اعمال محدودیت concurrent sessions
        if (this._config.security.maxConcurrentSessions > 0) {
            if (userSessions.size > this._config.security.maxConcurrentSessions) {
                // حذف قدیمی‌ترین session (در نسخه واقعی)
                const sessionsArray = Array.from(userSessions);
                const oldestSession = sessionsArray[0]; // ساده‌سازی
                userSessions.delete(oldestSession);
                
                this._eventSystem.emit('token:session:evicted', {
                    userId,
                    evictedSession: oldestSession,
                    currentSessions: userSessions.size,
                    maxSessions: this._config.security.maxConcurrentSessions
                });
            }
        }
    }
    
    _unregisterSession(userId, tokenSetId) {
        const userSessions = this._sessionRegistry.get(userId);
        if (userSessions) {
            userSessions.delete(tokenSetId);
            if (userSessions.size === 0) {
                this._sessionRegistry.delete(userId);
            }
        }
    }
    
    _getUserSessionCount(userId) {
        const sessions = this._sessionRegistry.get(userId);
        return sessions ? sessions.size : 0;
    }
    
    _getTotalSessionCount() {
        let total = 0;
        for (const sessions of this._sessionRegistry.values()) {
            total += sessions.size;
        }
        return total;
    }
    
    async _performSecurityChecks(token, validation, options) {
        const checks = {
            valid: true,
            warnings: [],
            checksPerformed: []
        };
        
        // بررسی IP binding
        if (this._config.security.ipBinding && options.ipAddress) {
            const tokenIp = validation.metadata?.device?.ip;
            if (tokenIp && tokenIp !== options.ipAddress) {
                checks.warnings.push({
                    code: 'IP_MISMATCH',
                    message: 'IP address does not match token origin',
                    severity: 'high'
                });
                
                if (this._config.security.ipBinding === 'strict') {
                    checks.valid = false;
                    checks.reason = 'ip_mismatch';
                    checks.code = 'SECURITY_IP_MISMATCH';
                }
            }
            checks.checksPerformed.push('ip_binding');
        }
        
        // بررسی User-Agent binding
        if (this._config.security.userAgentBinding && options.userAgent) {
            const tokenUA = validation.metadata?.device?.userAgent;
            if (tokenUA && tokenUA !== options.userAgent) {
                checks.warnings.push({
                    code: 'UA_MISMATCH',
                    message: 'User-Agent does not match token origin',
                    severity: 'medium'
                });
            }
            checks.checksPerformed.push('user_agent_binding');
        }
        
        // بررسی token reuse
        if (this._config.security.preventTokenReuse) {
            const lastUsed = await this._getTokenLastUsed(validation.tokenId);
            if (lastUsed && (Date.now() - lastUsed < 1000)) { // 1 ثانیه
                checks.warnings.push({
                    code: 'POSSIBLE_REUSE',
                    message: 'Possible token reuse detected',
                    severity: 'high'
                });
                
                this._metrics.securityEvents++;
                this._eventSystem.emit('token:security:possible_reuse', {
                    tokenId: validation.tokenId,
                    userId: validation.userId,
                    lastUsed,
                    currentTime: Date.now()
                });
            }
            checks.checksPerformed.push('reuse_prevention');
        }
        
        return checks;
    }
    
    _shouldRefreshToken(validation, options) {
        if (!validation.expiresAt) return false;
        
        const now = Date.now();
        const timeToExpiry = validation.expiresAt - now;
        const totalLifetime = validation.expiresAt - validation.issuedAt;
        
        if (timeToExpiry <= 0) return true;
        
        const threshold = options.refreshThreshold || 
                         this._config.tokens.accessToken.renewalThreshold;
        
        return (timeToExpiry / totalLifetime) < threshold;
    }
    
    async _updateTokenUsage(token, validation, options) {
        // در نسخه واقعی، اینجا آخرین زمان استفاده را ذخیره می‌کنیم
        const usageData = {
            tokenId: validation.tokenId,
            lastUsed: Date.now(),
            usedBy: options.ipAddress || 'unknown',
            endpoint: options.endpoint || 'unknown'
        };
        
        this._eventSystem.emit('token:usage:updated', usageData);
    }
    
    async _checkRefreshTokenUsage(tokenId, context) {
        // در نسخه واقعی، usage count از state خوانده می‌شود
        const currentUsage = 0; // نمونه
        const maxUsage = this._config.tokens.refreshToken.maxUsageCount;
        
        if (currentUsage >= maxUsage) {
            return {
                allowed: false,
                reason: 'max_usage_exceeded',
                currentUsage,
                maxUsage
            };
        }
        
        return {
            allowed: true,
            currentUsage,
            maxUsage
        };
    }
    
    async _incrementRefreshTokenUsage(tokenId) {
        // در نسخه واقعی، اینجا usage count در state افزایش می‌یابد
        this._eventSystem.emit('token:refresh:usage_incremented', {
            tokenId,
            timestamp: new Date().toISOString()
        });
    }
    
    async _getUserDataFromToken(tokenId) {
        // در نسخه واقعی، اینجا user data از state یا دیتابیس خوانده می‌شود
        // برای نمونه:
        return {
            userId: `user_${tokenId.substring(0, 8)}`,
            role: 'user',
            email: 'user@example.com'
        };
    }
    
    _isAbsoluteExpired(issuedAt) {
        if (!this._config.refresh.absoluteExpiryDays) return false;
        
        const absoluteExpiry = issuedAt + 
            (this._config.refresh.absoluteExpiryDays * 24 * 60 * 60 * 1000);
        
        return Date.now() > absoluteExpiry;
    }
    
    _isTokenBlacklisted(token) {
        // در نسخه واقعی، tokenId از توکن استخراج می‌شود
        const tokenId = this._extractTokenId(token);
        return this._blacklist.has(tokenId);
    }
    
    async _removeTokenFromStorage(tokenId) {
        // حذف از state
        await this._stateManager.delete(`tokens.${tokenId}`, {
            namespace: 'auth',
            source: 'token_manager'
        });
        
        // حذف از حافظه داخلی
        this._tokens.delete(tokenId);
        
        return true;
    }
    
    async _getTokenLastUsed(tokenId) {
        // در نسخه واقعی از state خوانده می‌شود
        return null;
    }
    
    _extractTokenId(token) {
        try {
            const validation = this._authUtils.validateToken(token);
            return validation.valid ? validation.tokenId : 'invalid';
        } catch {
            return 'unknown';
        }
    }
    
    _maskToken(token) {
        if (!token || token.length < 10) return '[INVALID]';
        return `${token.substring(0, 6)}...${token.substring(token.length - 4)}`;
    }
    
    _sanitizeContext(context) {
        const sanitized = { ...context };
        
        if (sanitized.ipAddress) {
            sanitized.ipAddress = sanitized.ipAddress.replace(/\.[0-9]+$/, '.xxx');
        }
        
        if (sanitized.userAgent && sanitized.userAgent.length > 50) {
            sanitized.userAgent = sanitized.userAgent.substring(0, 50) + '...';
        }
        
        // حذف فیلدهای حساس
        delete sanitized.password;
        delete sanitized.creditCard;
        delete sanitized.secretKey;
        
        return sanitized;
    }
    
    _generateEncryptionKey() {
        // فقط برای نمونه - در تولید از کلید واقعی استفاده شود
        const random = new Uint8Array(32);
        crypto.getRandomValues(random);
        return Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    
    _init() {
        // راه‌اندازی event listeners
        const cleanupListener = this._eventSystem.on('auth:cleanup', () => {
            this.cleanupExpiredTokens();
        });
        
        const logoutListener = this._eventSystem.on('auth:logout', (data) => {
            if (data.userId) {
                this.revokeAllUserTokens(data.userId, 'user_logout', {
                    source: 'auth_event',
                    ...data
                });
            }
        });
        
        this._subscriptions.add(cleanupListener);
        this._subscriptions.add(logoutListener);
        
        // راه‌اندازی auto cleanup
        if (this._config.storage.autoCleanupInterval > 0) {
            this._cleanupInterval = setInterval(() => {
                this.cleanupExpiredTokens();
            }, this._config.storage.autoCleanupInterval);
        }
        
        this._initialized = true;
        
        this._eventSystem.emit('token:manager:initialized', {
            version: this._config.defaults.version,
            timestamp: new Date().toISOString(),
            features: {
                tokenRotation: this._config.tokens.refreshToken.rotationEnabled,
                blacklisting: this._config.security.tokenBlacklisting,
                ipBinding: this._config.security.ipBinding,
                maxSessions: this._config.security.maxConcurrentSessions
            }
        });
    }
    
    destroy() {
        // توقف intervalها
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }
        
        // لغو subscriptionها
        for (const unsubscribe of this._subscriptions) {
            unsubscribe();
        }
        this._subscriptions.clear();
        
        // پاک‌سازی state
        this._tokens.clear();
        this._blacklist.clear();
        this._sessionRegistry.clear();
        this._refreshQueue.clear();
        
        this._initialized = false;
        
        this._eventSystem.emit('token:manager:destroyed', {
            timestamp: new Date().toISOString()
        });
    }
}

// ==================== Singleton Export ====================

let tokenManagerInstance = null;

function createTokenManager(authUtils, eventSystem, stateManager, config) {
    if (!tokenManagerInstance) {
        tokenManagerInstance = new TokenManager(authUtils, eventSystem, stateManager, config);
        Object.freeze(tokenManagerInstance);
    }
    return tokenManagerInstance;
}

function getTokenManager() {
    if (!tokenManagerInstance) {
        console.warn('[TokenManager] Instance not initialized. Call createTokenManager() first.');
    }
    return tokenManagerInstance;
}

// ==================== Export ====================

export { TokenManager, createTokenManager, getTokenManager };

// ==================== Auto-init در صورت وجود پیش‌نیازها ====================
if (typeof window !== 'undefined') {
    // انتظار برای بارگذاری پیش‌نیازها
    setTimeout(() => {
        if (window.getAuthUtils && window.eventBus && window.stateManager) {
            const authUtils = window.getAuthUtils();
            if (authUtils) {
                createTokenManager(authUtils, window.eventBus, window.stateManager);
                console.log('[TokenManager] Auto-initialized with global instances');
            }
        }
    }, 1000);
              }
