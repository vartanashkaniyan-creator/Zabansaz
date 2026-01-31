/**
 * VAKAMOVA SESSION SERVICE - سیستم مدیریت پیشرفته نشست‌های کاربر
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * وابستگی داخلی: token_manager.js, state_manager.js, event_bus.js, auth/utils.js
 */

class SessionService {
    constructor(tokenManager, stateManager, eventSystem, authUtils, config = {}) {
        // ==================== تزریق وابستگی ====================
        this._tokenManager = tokenManager || {
            validateAccessToken: () => ({ valid: false }),
            refreshTokenSet: () => Promise.resolve({ success: false }),
            revokeAllUserTokens: () => Promise.resolve({ success: false })
        };
        
        this._stateManager = stateManager || {
            set: () => ({}),
            get: () => null,
            update: () => ({}),
            subscribe: () => () => {}
        };
        
        this._eventSystem = eventSystem || {
            emit: () => console.warn('[SessionService] Event system not available'),
            on: () => () => {}
        };
        
        this._authUtils = authUtils || {
            validateToken: () => ({ valid: false })
        };
        
        // ==================== پیکربندی متمرکز ====================
        this._config = Object.freeze({
            // تنظیمات نشست
            session: {
                defaultTtl: config.sessionTtl || 30 * 60 * 1000, // 30 دقیقه
                maxTtl: config.maxSessionTtl || 7 * 24 * 60 * 60 * 1000, // 7 روز
                slidingExpiration: config.slidingExpiration ?? true,
                slidingWindow: config.slidingWindow || 5 * 60 * 1000, // 5 دقیقه
                idleTimeout: config.idleTimeout || 15 * 60 * 1000, // 15 دقیقه
                cleanupInterval: config.cleanupInterval || 60 * 1000 // 1 دقیقه
            },
            
            // تنظیمات امنیتی
            security: {
                maxSessionsPerUser: config.maxSessionsPerUser || 5,
                concurrentLogin: config.concurrentLogin ?? true,
                deviceFingerprinting: config.deviceFingerprinting ?? true,
                ipBinding: config.sessionIpBinding ?? false,
                userAgentBinding: config.userAgentBinding ?? true,
                preventSessionFixation: config.preventSessionFixation ?? true,
                sessionRegenerationInterval: config.sessionRegenerationInterval || 15 * 60 * 1000 // 15 دقیقه
            },
            
            // تنظیمات ذخیره‌سازی
            storage: {
                storageKey: config.sessionStorageKey || 'vakamova_sessions',
                encryptionEnabled: config.sessionEncryption ?? true,
                compressionEnabled: config.sessionCompression ?? false,
                localStorageFallback: config.localStorageFallback ?? true,
                syncAcrossTabs: config.syncAcrossTabs ?? true
            },
            
            // تنظیمات بازیابی
            recovery: {
                allowSessionRecovery: config.allowSessionRecovery ?? true,
                recoveryTokenTtl: config.recoveryTokenTtl || 10 * 60 * 1000, // 10 دقیقه
                maxRecoveryAttempts: config.maxRecoveryAttempts || 3,
                recoveryCooldown: config.recoveryCooldown || 30 * 60 * 1000 // 30 دقیقه
            },
            
            // تنظیمات پیشرفته
            advanced: {
                enableSessionMetrics: config.enableSessionMetrics ?? true,
                enableSessionReplay: config.enableSessionReplay ?? false,
                replayBufferSize: config.replayBufferSize || 100,
                enablePredictiveRenewal: config.enablePredictiveRenewal ?? true,
                renewalThreshold: config.renewalThreshold || 0.3 // 30% مانده به انقضا
            },
            
            // تنظیمات پیش‌فرض
            defaults: {
                sessionType: config.defaultSessionType || 'persistent',
                version: '1.0.0',
                environment: config.environment || 'production'
            },
            
            ...config
        });
        
        // ==================== وضعیت داخلی ====================
        this._sessions = new Map();
        this._sessionIndex = new Map(); // userId -> sessionIds[]
        this._recoveryTokens = new Map();
        this._activityMonitors = new Map();
        this._cleanupInterval = null;
        this._renewalPredictor = null;
        
        this._metrics = {
            sessionsCreated: 0,
            sessionsDestroyed: 0,
            sessionsRenewed: 0,
            sessionsRestored: 0,
            sessionValidationFailures: 0,
            concurrentSessionBlocks: 0,
            securityEvents: 0
        };
        
        this._subscriptions = new Set();
        this._initialized = false;
        
        this._init();
        Object.seal(this._metrics);
        Object.seal(this);
    }
    
    // ==================== متدهای اصلی (قرارداد رابط) ====================
    
    async createSession(userId, userData, context = {}) {
        const sessionId = this._generateSessionId();
        const startTime = Date.now();
        
        this._eventSystem.emit('session:creation:start', {
            sessionId,
            userId,
            timestamp: startTime,
            context: this._sanitizeContext(context)
        });
        
        try {
            // بررسی محدودیت تعداد نشست همزمان
            if (!this._config.security.concurrentLogin) {
                const existingSessions = this._sessionIndex.get(userId) || [];
                if (existingSessions.length > 0) {
                    const terminateResult = await this._handleConcurrentLogin(userId, context);
                    if (!terminateResult.success) {
                        throw new Error(terminateResult.reason || 'Concurrent login not allowed');
                    }
                }
            }
            
            // ایجاد توکن‌های دسترسی
            const tokenSet = await this._tokenManager.createTokenSet(
                { userId, ...userData },
                context
            );
            
            if (!tokenSet.success) {
                throw new Error(`Token creation failed: ${tokenSet.reason}`);
            }
            
            // تولید شناسه دستگاه (Device Fingerprint)
            const deviceFingerprint = this._config.security.deviceFingerprinting
                ? this._generateDeviceFingerprint(context)
                : null;
            
            // ایجاد نشست
            const session = {
                id: sessionId,
                userId,
                tokenSet: tokenSet.tokenSet,
                deviceFingerprint,
                status: 'active',
                type: context.sessionType || this._config.defaults.sessionType,
                createdAt: new Date().toISOString(),
                lastActivity: Date.now(),
                expiresAt: Date.now() + this._config.session.defaultTtl,
                ttl: this._config.session.defaultTtl,
                context: this._sanitizeContext(context),
                metadata: {
                    ip: context.ipAddress,
                    userAgent: context.userAgent,
                    deviceId: context.deviceId,
                    location: context.location,
                    loginMethod: context.loginMethod || 'password'
                },
                flags: {
                    requiresReauthentication: false,
                    suspiciousActivity: false,
                    forceLogout: false
                }
            };
            
            // ذخیره نشست
            await this._storeSession(session);
            
            // اضافه کردن به ایندکس
            this._addToSessionIndex(userId, sessionId);
            
            // راه‌اندازی مانیتور فعالیت
            this._startActivityMonitor(sessionId, userId);
            
            // راه‌اندازی تمدید خودکار
            if (this._config.advanced.enablePredictiveRenewal) {
                this._schedulePredictiveRenewal(sessionId);
            }
            
            this._metrics.sessionsCreated++;
            
            const duration = Date.now() - startTime;
            
            this._eventSystem.emit('session:created', {
                sessionId,
                userId,
                sessionType: session.type,
                expiresAt: session.expiresAt,
                deviceFingerprint: deviceFingerprint ? this._maskFingerprint(deviceFingerprint) : null,
                duration,
                concurrentSessions: this._getUserSessionCount(userId)
            });
            
            return {
                success: true,
                session,
                tokens: tokenSet.tokens,
                sessionInfo: {
                    id: sessionId,
                    expiresAt: session.expiresAt,
                    ttl: session.ttl,
                    maxInactivity: this._config.session.idleTimeout
                }
            };
            
        } catch (error) {
            this._metrics.sessionValidationFailures++;
            
            this._eventSystem.emit('session:creation:failed', {
                sessionId,
                userId,
                error: error.message,
                duration: Date.now() - startTime
            });
            
            return {
                success: false,
                sessionId,
                reason: error.message,
                code: 'SESSION_CREATION_FAILED'
            };
        }
    }
    
    async validateSession(sessionId, options = {}) {
        const validationId = `session_validate_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        this._eventSystem.emit('session:validation:start', {
            validationId,
            sessionId,
            timestamp: startTime,
            options
        });
        
        try {
            // بازیابی نشست
            const session = await this._getSession(sessionId);
            if (!session) {
                return this._sessionValidationResult(validationId, false, {
                    reason: 'session_not_found',
                    code: 'SESSION_NOT_FOUND',
                    duration: Date.now() - startTime
                });
            }
            
            // بررسی وضعیت نشست
            if (session.status !== 'active') {
                return this._sessionValidationResult(validationId, false, {
                    reason: `session_${session.status}`,
                    code: `SESSION_${session.status.toUpperCase()}`,
                    sessionStatus: session.status,
                    duration: Date.now() - startTime
                });
            }
            
            // بررسی انقضا
            if (Date.now() > session.expiresAt) {
                await this.destroySession(sessionId, 'expired');
                return this._sessionValidationResult(validationId, false, {
                    reason: 'session_expired',
                    code: 'SESSION_EXPIRED',
                    expiredAt: session.expiresAt,
                    duration: Date.now() - startTime
                });
            }
            
            // بررسی زمان بیکاری
            if (this._config.session.idleTimeout > 0) {
                const idleTime = Date.now() - session.lastActivity;
                if (idleTime > this._config.session.idleTimeout) {
                    await this.destroySession(sessionId, 'idle_timeout');
                    return this._sessionValidationResult(validationId, false, {
                        reason: 'session_idle_timeout',
                        code: 'SESSION_IDLE_TIMEOUT',
                        idleTime,
                        maxIdleTime: this._config.session.idleTimeout,
                        duration: Date.now() - startTime
                    });
                }
            }
            
            // اعتبارسنجی توکن دسترسی
            const tokenValidation = await this._tokenManager.validateAccessToken(
                session.tokenSet.accessToken.token,
                {
                    ipAddress: options.ipAddress,
                    userAgent: options.userAgent,
                    ...options.tokenOptions
                }
            );
            
            if (!tokenValidation.valid) {
                // اگر توکن منقضی شده ولی قابلیت بازآوری دارد
                if (tokenValidation.reason === 'token_expired' && 
                    this._config.session.slidingExpiration) {
                    
                    const renewed = await this._attemptSlidingRenewal(sessionId, options);
                    if (!renewed.success) {
                        await this.destroySession(sessionId, 'token_expired_no_renewal');
                        return this._sessionValidationResult(validationId, false, {
                            reason: 'token_expired_no_renewal',
                            code: 'TOKEN_EXPIRED_NO_RENEWAL',
                            tokenValidation,
                            duration: Date.now() - startTime
                        });
                    }
                    
                    // نشست تمدید شد، ادامه دهید
                } else {
                    await this.destroySession(sessionId, 'invalid_token');
                    return this._sessionValidationResult(validationId, false, {
                        reason: 'invalid_token',
                        code: 'INVALID_TOKEN',
                        tokenValidation,
                        duration: Date.now() - startTime
                    });
                }
            }
            
            // بررسی امنیتی اضافی
            const securityCheck = this._performSessionSecurityChecks(session, options);
            if (!securityCheck.valid) {
                if (securityCheck.severity === 'critical') {
                    await this.destroySession(sessionId, 'security_violation', {
                        violation: securityCheck.violation
                    });
                }
                
                return this._sessionValidationResult(validationId, false, {
                    reason: 'security_violation',
                    code: 'SECURITY_VIOLATION',
                    securityCheck,
                    duration: Date.now() - startTime
                });
            }
            
            // به‌روزرسانی آخرین فعالیت
            if (this._config.session.slidingExpiration) {
                await this._updateSessionActivity(sessionId);
            }
            
            // بررسی پرچم‌های امنیتی
            if (session.flags.requiresReauthentication) {
                return this._sessionValidationResult(validationId, true, {
                    requiresReauthentication: true,
                    reason: session.flags.requiresReauthenticationReason || 'suspicious_activity',
                    session,
                    securityCheck,
                    duration: Date.now() - startTime
                });
            }
            
            const duration = Date.now() - startTime;
            
            this._eventSystem.emit('session:validated', {
                validationId,
                sessionId,
                userId: session.userId,
                valid: true,
                requiresReauthentication: session.flags.requiresReauthentication,
                duration,
                tokenShouldRefresh: tokenValidation.shouldRefresh
            });
            
            return {
                success: true,
                valid: true,
                sessionId,
                validationId,
                session: {
                    id: session.id,
                    userId: session.userId,
                    status: session.status,
                    createdAt: session.createdAt,
                    lastActivity: session.lastActivity,
                    expiresAt: session.expiresAt,
                    metadata: session.metadata
                },
                user: {
                    id: session.userId,
                    ...session.tokenSet.context
                },
                tokens: {
                    accessToken: session.tokenSet.accessToken.token,
                    refreshToken: session.tokenSet.refreshToken.token,
                    expiresAt: session.tokenSet.accessToken.expiresAt
                },
                requiresReauthentication: session.flags.requiresReauthentication,
                securityWarnings: securityCheck.warnings,
                duration
            };
            
        } catch (error) {
            this._metrics.sessionValidationFailures++;
            
            this._eventSystem.emit('session:validation:error', {
                validationId,
                sessionId,
                error: error.message,
                duration: Date.now() - startTime
            });
            
            return {
                success: false,
                valid: false,
                sessionId,
                validationId,
                reason: 'validation_error',
                error: error.message,
                code: 'VALIDATION_ERROR',
                duration: Date.now() - startTime
            };
        }
    }
    
    async renewSession(sessionId, options = {}) {
        const renewalId = `session_renew_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        this._eventSystem.emit('session:renewal:start', {
            renewalId,
            sessionId,
            timestamp: startTime,
            options
        });
        
        try {
            const session = await this._getSession(sessionId);
            if (!session) {
                throw new Error('Session not found');
            }
            
            // بازآوری توکن‌ها
            const refreshResult = await this._tokenManager.refreshTokenSet(
                session.tokenSet.refreshToken.token,
                {
                    userId: session.userId,
                    ipAddress: options.ipAddress,
                    userAgent: options.userAgent,
                    deviceId: session.metadata.deviceId
                }
            );
            
            if (!refreshResult.success) {
                throw new Error(`Token refresh failed: ${refreshResult.reason}`);
            }
            
            // به‌روزرسانی نشست با توکن‌های جدید
            session.tokenSet = refreshResult.tokenSet;
            session.lastActivity = Date.now();
            
            if (this._config.session.slidingExpiration) {
                session.expiresAt = Date.now() + session.ttl;
            }
            
            // تمدید مانیتور فعالیت
            this._restartActivityMonitor(sessionId);
            
            // تمدید زمان‌بندی تمدید پیش‌بینانه
            if (this._config.advanced.enablePredictiveRenewal) {
                this._reschedulePredictiveRenewal(sessionId);
            }
            
            await this._storeSession(session);
            
            this._metrics.sessionsRenewed++;
            
            const duration = Date.now() - startTime;
            
            this._eventSystem.emit('session:renewed', {
                renewalId,
                sessionId,
                userId: session.userId,
                oldExpiry: session.expiresAt - session.ttl,
                newExpiry: session.expiresAt,
                duration,
                refreshChain: refreshResult.refreshChain || 0
            });
            
            return {
                success: true,
                renewalId,
                sessionId,
                userId: session.userId,
                tokens: refreshResult.tokens,
                newExpiresAt: session.expiresAt,
                duration
            };
            
        } catch (error) {
            this._eventSystem.emit('session:renewal:failed', {
                renewalId,
                sessionId,
                error: error.message,
                duration: Date.now() - startTime
            });
            
            return {
                success: false,
                renewalId,
                sessionId,
                reason: error.message,
                code: 'SESSION_RENEWAL_FAILED',
                duration: Date.now() - startTime
            };
        }
    }
    
    async destroySession(sessionId, reason = 'user_logout', metadata = {}) {
        const destructionId = `session_destroy_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        this._eventSystem.emit('session:destruction:start', {
            destructionId,
            sessionId,
            reason,
            timestamp: startTime,
            metadata
        });
        
        try {
            const session = await this._getSession(sessionId);
            if (!session) {
                return {
                    success: false,
                    destructionId,
                    reason: 'session_not_found',
                    code: 'SESSION_NOT_FOUND',
                    duration: Date.now() - startTime
                };
            }
            
            // لغو توکن‌ها
            await this._tokenManager.revokeToken(
                session.tokenSet.accessToken.token,
                `session_${reason}`,
                {
                    sessionId,
                    userId: session.userId,
                    ...metadata
                }
            );
            
            // توقف مانیتورها
            this._stopActivityMonitor(sessionId);
            this._cancelPredictiveRenewal(sessionId);
            
            // حذف از ذخیره‌سازی
            await this._removeSession(sessionId);
            
            // حذف از ایندکس
            this._removeFromSessionIndex(session.userId, sessionId);
            
            this._metrics.sessionsDestroyed++;
            
            const duration = Date.now() - startTime;
            
            this._eventSystem.emit('session:destroyed', {
                destructionId,
                sessionId,
                userId: session.userId,
                reason,
                duration,
                sessionLifetime: Date.now() - new Date(session.createdAt).getTime()
            });
            
            return {
                success: true,
                destructionId,
                sessionId,
                userId: session.userId,
                reason,
                destroyedAt: new Date().toISOString(),
                sessionLifetime: Date.now() - new Date(session.createdAt).getTime(),
                duration
            };
            
        } catch (error) {
            this._eventSystem.emit('session:destruction:error', {
                destructionId,
                sessionId,
                error: error.message,
                duration: Date.now() - startTime
            });
            
            return {
                success: false,
                destructionId,
                sessionId,
                reason: 'destruction_error',
                error: error.message,
                code: 'DESTRUCTION_ERROR',
                duration: Date.now() - startTime
            };
        }
    }
    
    async destroyAllUserSessions(userId, reason = 'user_request', metadata = {}) {
        const destructionId = `session_destroy_all_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        this._eventSystem.emit('session:destruction_all:start', {
            destructionId,
            userId,
            reason,
            timestamp: startTime,
            metadata
        });
        
        try {
            const sessionIds = this._sessionIndex.get(userId) || [];
            const results = [];
            
            for (const sessionId of sessionIds) {
                try {
                    const result = await this.destroySession(sessionId, reason, {
                        ...metadata,
                        batchDestructionId: destructionId
                    });
                    results.push(result);
                } catch (error) {
                    results.push({
                        sessionId,
                        success: false,
                        error: error.message
                    });
                }
            }
            
            const duration = Date.now() - startTime;
            
            this._eventSystem.emit('session:destruction_all:completed', {
                destructionId,
                userId,
                reason,
                destroyedCount: results.filter(r => r.success).length,
                failedCount: results.filter(r => !r.success).length,
                duration
            });
            
            return {
                success: true,
                destructionId,
                userId,
                reason,
                results,
                destroyedCount: results.filter(r => r.success).length,
                failedCount: results.filter(r => !r.success).length,
                duration
            };
            
        } catch (error) {
            this._eventSystem.emit('session:destruction_all:error', {
                destructionId,
                userId,
                error: error.message,
                duration: Date.now() - startTime
            });
            
            return {
                success: false,
                destructionId,
                userId,
                reason: 'batch_destruction_error',
                error: error.message,
                code: 'BATCH_DESTRUCTION_ERROR',
                duration: Date.now() - startTime
            };
        }
    }
    
    // ==================== متدهای مدیریتی ====================
    
    async getSessionInfo(sessionId) {
        const session = await this._getSession(sessionId);
        if (!session) {
            return null;
        }
        
        return {
            id: session.id,
            userId: session.userId,
            status: session.status,
            type: session.type,
            createdAt: session.createdAt,
            lastActivity: session.lastActivity,
            expiresAt: session.expiresAt,
            ttl: session.ttl,
            idleTimeout: this._config.session.idleTimeout,
            metadata: {
                ip: session.metadata.ip,
                userAgent: session.metadata.userAgent,
                deviceId: session.metadata.deviceId,
                loginMethod: session.metadata.loginMethod,
                location: session.metadata.location
            },
            flags: session.flags,
            deviceFingerprint: session.deviceFingerprint 
                ? this._maskFingerprint(session.deviceFingerprint) 
                : null,
            tokenInfo: {
                accessTokenExpiresAt: session.tokenSet.accessToken.expiresAt,
                refreshTokenExpiresAt: session.tokenSet.refreshToken.expiresAt,
                tokenType: session.tokenSet.accessToken.tokenType
            }
        };
    }
    
    getUserSessions(userId) {
        const sessionIds = this._sessionIndex.get(userId) || [];
        const sessions = [];
        
        for (const sessionId of sessionIds) {
            const session = this._sessions.get(sessionId);
            if (session) {
                sessions.push({
                    id: session.id,
                    status: session.status,
                    createdAt: session.createdAt,
                    lastActivity: session.lastActivity,
                    expiresAt: session.expiresAt,
                    metadata: {
                        ip: session.metadata.ip,
                        userAgent: session.metadata.userAgent,
                        deviceId: session.metadata.deviceId
                    }
                });
            }
        }
        
        return {
            userId,
            activeSessions: sessions.filter(s => s.status === 'active').length,
            totalSessions: sessions.length,
            sessions,
            timestamp: new Date().toISOString()
        };
    }
    
    async markSessionForReauthentication(sessionId, reason = 'suspicious_activity', metadata = {}) {
        const session = await this._getSession(sessionId);
        if (!session) {
            return { success: false, reason: 'session_not_found' };
        }
        
        session.flags.requiresReauthentication = true;
        session.flags.requiresReauthenticationReason = reason;
        session.flags.suspiciousActivity = true;
        
        await this._storeSession(session);
        
        this._metrics.securityEvents++;
        
        this._eventSystem.emit('session:reauthentication_required', {
            sessionId,
            userId: session.userId,
            reason,
            metadata,
            timestamp: new Date().toISOString()
        });
        
        return {
            success: true,
            sessionId,
            userId: session.userId,
            reason,
            markedAt: new Date().toISOString()
        };
    }
    
    async updateSessionMetadata(sessionId, updates) {
        const session = await this._getSession(sessionId);
        if (!session) {
            return { success: false, reason: 'session_not_found' };
        }
        
        // به‌روزرسانی metadata
        session.metadata = {
            ...session.metadata,
            ...updates
        };
        
        session.lastActivity = Date.now();
        
        await this._storeSession(session);
        
        this._eventSystem.emit('session:metadata_updated', {
            sessionId,
            userId: session.userId,
            updates,
            timestamp: new Date().toISOString()
        });
        
        return {
            success: true,
            sessionId,
            userId: session.userId,
            updatedAt: new Date().toISOString()
        };
    }
    
    // ==================== متدهای بازیابی ====================
    
    async createRecoveryToken(sessionId, options = {}) {
        const recoveryId = `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        if (!this._config.recovery.allowSessionRecovery) {
            return {
                success: false,
                reason: 'session_recovery_disabled',
                code: 'RECOVERY_DISABLED'
            };
        }
        
        const session = await this._getSession(sessionId);
        if (!session) {
            return {
                success: false,
                reason: 'session_not_found',
                code: 'SESSION_NOT_FOUND'
            };
        }
        
        // بررسی تعداد تلاش‌های بازیابی
        const recoveryAttempts = this._getRecoveryAttempts(session.userId);
        if (recoveryAttempts >= this._config.recovery.maxRecoveryAttempts) {
            return {
                success: false,
                reason: 'max_recovery_attempts_exceeded',
                code: 'MAX_RECOVERY_ATTEMPTS',
                attempts: recoveryAttempts,
                maxAttempts: this._config.recovery.maxRecoveryAttempts,
                cooldownUntil: Date.now() + this._config.recovery.recoveryCooldown
            };
        }
        
        // ایجاد توکن بازیابی
        const recoveryToken = this._generateRecoveryToken();
        const expiresAt = Date.now() + this._config.recovery.recoveryTokenTtl;
        
        this._recoveryTokens.set(recoveryToken, {
            sessionId,
            userId: session.userId,
            recoveryId,
            expiresAt,
            createdAt: Date.now(),
            used: false,
            metadata: options
        });
        
        // ثبت تلاش بازیابی
        this._incrementRecoveryAttempts(session.userId);
        
        const duration = Date.now() - startTime;
        
        this._eventSystem.emit('session:recovery_token_created', {
            recoveryId,
            sessionId,
            userId: session.userId,
            expiresAt,
            duration
        });
        
        return {
            success: true,
            recoveryId,
            sessionId,
            userId: session.userId,
            recoveryToken,
            expiresAt,
            ttl: this._config.recovery.recoveryTokenTtl,
            duration
        };
    }
    
    async recoverSession(recoveryToken, context = {}) {
        const recoveryId = `recover_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const startTime = Date.now();
        
        this._eventSystem.emit('session:recovery:start', {
            recoveryId,
            token: this._maskToken(recoveryToken),
            timestamp: startTime,
            context
        });
        
        try {
            // بازیابی اطلاعات توکن
            const recoveryData = this._recoveryTokens.get(recoveryToken);
            if (!recoveryData) {
                throw new Error('Invalid recovery token');
            }
            
            if (recoveryData.used) {
                throw new Error('Recovery token already used');
            }
            
            if (Date.now() > recoveryData.expiresAt) {
                this._recoveryTokens.delete(recoveryToken);
                throw new Error('Recovery token expired');
            }
            
            // بازیابی نشست
            const session = await this._getSession(recoveryData.sessionId);
            if (!session) {
                throw new Error('Session not found');
            }
            
            // بررسی تطابق کاربر
            if (context.userId && context.userId !== recoveryData.userId) {
                throw new Error('User mismatch');
            }
            
            // علامت‌گذاری توکن به عنوان استفاده شده
            recoveryData.used = true;
            recoveryData.usedAt = Date.now();
            recoveryData.usedContext = context;
            this._recoveryTokens.set(recoveryToken, recoveryData);
            
            // تمدید نشست
            const renewResult = await this.renewSession(recoveryData.sessionId, context);
            
            if (!renewResult.success) {
                throw new Error(`Session renewal failed: ${renewResult.reason}`);
            }
            
            // ریست شمارنده تلاش‌های بازیابی
            this._resetRecoveryAttempts(recoveryData.userId);
            
            // حذف توکن بازیابی استفاده شده
            setTimeout(() => {
                this._recoveryTokens.delete(recoveryToken);
            }, 60000); // حذف بعد از 1 دقیقه
            
            const duration = Date.now() - startTime;
            
            this._eventSystem.emit('session:recovered', {
                recoveryId,
                sessionId: recoveryData.sessionId,
                userId: recoveryData.userId,
                duration,
                recoveryToken: this._maskToken(recoveryToken)
            });
            
            return {
                success: true,
                recoveryId,
                sessionId: recoveryData.sessionId,
                userId: recoveryData.userId,
                renewed: true,
                tokens: renewResult.tokens,
                duration
            };
            
        } catch (error) {
            this._eventSystem.emit('session:recovery:failed', {
                recoveryId,
                token: this._maskToken(recoveryToken),
                error: error.message,
                duration: Date.now() - startTime
            });
            
            return {
                success: false,
                recoveryId,
                reason: error.message,
                code: 'RECOVERY_FAILED',
                duration: Date.now() - startTime
            };
        }
    }
    
    // ==================== متدهای داخلی ====================
    
    async _handleConcurrentLogin(userId, context) {
        const userSessions = this._sessionIndex.get(userId) || [];
        
        if (userSessions.length === 0) {
            return { success: true };
        }
        
        if (this._config.security.maxSessionsPerUser > 0 &&
            userSessions.length >= this._config.security.maxSessionsPerUser) {
            
            // حذف قدیمی‌ترین نشست
            const oldestSessionId = userSessions[0];
            const destroyResult = await this.destroySession(oldestSessionId, 'concurrent_limit', {
                newLoginContext: context
            });
            
            if (!destroyResult.success) {
                return {
                    success: false,
                    reason: 'cannot_terminate_old_session',
                    details: destroyResult
                };
            }
            
            this._metrics.concurrentSessionBlocks++;
            
            return {
                success: true,
                terminatedSession: oldestSessionId,
                reason: 'oldest_session_terminated'
            };
        }
        
        return { success: true };
    }
    
    _generateSessionId() {
        const timestamp = Date.now().toString(36);
        const random = Math.random().toString(36).substr(2, 12);
        return `sess_${timestamp}_${random}`;
    }
    
    _generateDeviceFingerprint(context) {
        const components = [
            context.userAgent || 'unknown',
            context.screenResolution || 'unknown',
            context.timezone || 'unknown',
            context.language || 'unknown',
            context.platform || 'unknown'
        ];
        
        const fingerprintString = components.join('|');
        return this._hashString(fingerprintString);
    }
    
    async _storeSession(session) {
        // ذخیره در state manager
        await this._stateManager.set(`sessions.${session.id}`, session, {
            namespace: 'auth',
            source: 'session_service'
        });
        
        // ذخیره در حافظه داخلی
        this._sessions.set(session.id, {
            data: session,
            storedAt: Date.now(),
            version: this._config.defaults.version
        });
        
        return true;
    }
    
    async _getSession(sessionId) {
        // اول از حافظه داخلی بررسی کن
        if (this._sessions.has(sessionId)) {
            return this._sessions.get(sessionId).data;
        }
        
        // سپس از state manager
        const session = await this._stateManager.get(`sessions.${sessionId}`, {
            namespace: 'auth'
        });
        
        if (session) {
            // ذخیره در حافظه داخلی برای دسترسی سریع‌تر
            this._sessions.set(sessionId, {
                data: session,
                storedAt: Date.now(),
                version: this._config.defaults.version
            });
        }
        
        return session;
    }
    
    async _removeSession(sessionId) {
        // حذف از state manager
        await this._stateManager.delete(`sessions.${sessionId}`, {
            namespace: 'auth',
            source: 'session_service'
        });
        
        // حذف از حافظه داخلی
        this._sessions.delete(sessionId);
        
        return true;
    }
    
    _addToSessionIndex(userId, sessionId) {
        if (!this._sessionIndex.has(userId)) {
            this._sessionIndex.set(userId, []);
        }
        
        const sessions = this._sessionIndex.get(userId);
        sessions.push(sessionId);
        
        // محدودیت تعداد نشست‌ها
        if (this._config.security.maxSessionsPerUser > 0 &&
            sessions.length > this._config.security.maxSessionsPerUser) {
            
            const removed = sessions.shift(); // حذف قدیمی‌ترین
            this._eventSystem.emit('session:auto_evicted', {
                userId,
                evictedSession: removed,
                reason: 'max_sessions_limit',
                currentCount: sessions.length
            });
        }
    }
    
    _removeFromSessionIndex(userId, sessionId) {
        const sessions = this._sessionIndex.get(userId);
        if (sessions) {
            const index = sessions.indexOf(sessionId);
            if (index > -1) {
                sessions.splice(index, 1);
            }
            
            if (sessions.length === 0) {
                this._sessionIndex.delete(userId);
            }
        }
    }
    
    _getUserSessionCount(userId) {
        const sessions = this._sessionIndex.get(userId);
        return sessions ? sessions.length : 0;
    }
    
    _startActivityMonitor(sessionId, userId) {
        if (this._config.session.idleTimeout <= 0) return;
        
        const monitorId = setInterval(() => {
            this._checkSessionActivity(sessionId, userId);
        }, this._config.session.cleanupInterval);
        
        this._activityMonitors.set(sessionId, monitorId);
    }
    
    _restartActivityMonitor(sessionId) {
        this._stopActivityMonitor(sessionId);
        
        const session = this._sessions.get(sessionId)?.data;
        if (session) {
            this._startActivityMonitor(sessionId, session.userId);
        }
    }
    
    _stopActivityMonitor(sessionId) {
        const monitorId = this._activityMonitors.get(sessionId);
        if (monitorId) {
            clearInterval(monitorId);
            this._activityMonitors.delete(sessionId);
        }
    }
    
    async _checkSessionActivity(sessionId, userId) {
        const session = await this._getSession(sessionId);
        if (!session) return;
        
        const idleTime = Date.now() - session.lastActivity;
        
        if (idleTime > this._config.session.idleTimeout) {
            await this.destroySession(sessionId, 'idle_timeout', {
                idleTime,
                maxIdleTime: this._config.session.idleTimeout
            });
        } else if (idleTime > this._config.session.idleTimeout * 0.8) {
            // هشدار قبل از timeout
            this._eventSystem.emit('session:idle_warning', {
                sessionId,
                userId,
                idleTime,
                remainingTime: this._config.session.idleTimeout - idleTime
            });
        }
    }
    
    _schedulePredictiveRenewal(sessionId) {
        if (!this._config.advanced.enablePredictiveRenewal) return;
        
        const session = this._sessions.get(sessionId)?.data;
        if (!session) return;
        
        const renewalTime = session.expiresAt - 
            (session.ttl * this._config.advanced.renewalThreshold);
        
        const timeUntilRenewal = renewalTime - Date.now();
        
        if (timeUntilRenewal > 0) {
            this._renewalPredictor = setTimeout(async () => {
                await this._attemptPredictiveRenewal(sessionId);
            }, timeUntilRenewal);
        }
    }
    
    _reschedulePredictiveRenewal(sessionId) {
        this._cancelPredictiveRenewal(sessionId);
        this._schedulePredictiveRenewal(sessionId);
    }
    
    _cancelPredictiveRenewal(sessionId) {
        if (this._renewalPredictor) {
            clearTimeout(this._renewalPredictor);
            this._renewalPredictor = null;
        }
    }
    
    async _attemptPredictiveRenewal(sessionId) {
        try {
            await this.renewSession(sessionId, {
                predictive: true,
                timestamp: Date.now()
            });
        } catch (error) {
            console.warn(`Predictive renewal failed for session ${sessionId}:`, error);
        }
    }
    
    async _attemptSlidingRenewal(sessionId, options) {
        const session = await this._getSession(sessionId);
        if (!session) {
            return { success: false, reason: 'session_not_found' };
        }
        
        // بررسی اینکه آیا sliding expiration فعال است
        if (!this._config.session.slidingExpiration) {
            return { success: false, reason: 'sliding_expiration_disabled' };
        }
        
        // بررسی window sliding
        const timeSinceLastActivity = Date.now() - session.lastActivity;
        if (timeSinceLastActivity > this._config.session.slidingWindow) {
            return { success: false, reason: 'outside_sliding_window' };
        }
        
        // تلاش برای تمدید
        return await this.renewSession(sessionId, options);
    }
    
    async _updateSessionActivity(sessionId) {
        const session = await this._getSession(sessionId);
        if (!session) return;
        
        session.lastActivity = Date.now();
        
        // اگر sliding expiration فعال است، expiry را تمدید کن
        if (this._config.session.slidingExpiration) {
            session.expiresAt = Date.now() + session.ttl;
        }
        
        await this._storeSession(session);
    }
    
    _performSessionSecurityChecks(session, options) {
        const checks = {
            valid: true,
            warnings: [],
            violations: []
        };
        
        // بررسی IP binding
        if (this._config.security.ipBinding && options.ipAddress) {
            if (session.metadata.ip && session.metadata.ip !== options.ipAddress) {
                checks.violations.push({
                    type: 'ip_mismatch',
                    severity: 'high',
                    expected: session.metadata.ip,
                    actual: options.ipAddress
                });
                
                if (this._config.security.ipBinding === 'strict') {
                    checks.valid = false;
                }
            }
        }
        
        // بررسی User-Agent binding
        if (this._config.security.userAgentBinding && options.userAgent) {
            if (session.metadata.userAgent && 
                session.metadata.userAgent !== options.userAgent) {
                
                checks.warnings.push({
                    type: 'user_agent_mismatch',
                    severity: 'medium',
                    expected: session.metadata.userAgent,
                    actual: options.userAgent
                });
            }
        }
        
        // بررسی Device Fingerprinting
        if (this._config.security.deviceFingerprinting && session.deviceFingerprint) {
            const currentFingerprint = this._generateDeviceFingerprint(options);
            if (currentFingerprint !== session.deviceFingerprint) {
                checks.violations.push({
                    type: 'device_fingerprint_mismatch',
                    severity: 'high',
                    sessionFingerprint: this._maskFingerprint(session.deviceFingerprint),
                    currentFingerprint: this._maskFingerprint(currentFingerprint)
                });
                
                checks.valid = false;
            }
        }
        
        // بررسی Session Fixation
        if (this._config.security.preventSessionFixation) {
            const sessionAge = Date.now() - new Date(session.createdAt).getTime();
            if (sessionAge > this._config.security.sessionRegenerationInterval) {
                checks.warnings.push({
                    type: 'session_regeneration_recommended',
                    severity: 'low',
                    sessionAge,
                    regenerationInterval: this._config.security.sessionRegenerationInterval
                });
            }
        }
        
        return checks;
    }
    
    _sessionValidationResult(validationId, valid, data) {
        const result = {
            success: !valid ? false : true,
            valid,
            validationId,
            ...data,
            timestamp: new Date().toISOString()
        };
        
        this._eventSystem.emit(`session:validation:${valid ? 'passed' : 'failed'}`, result);
        
        if (!valid) {
            this._metrics.sessionValidationFailures++;
        }
        
        return result;
    }
    
    _generateRecoveryToken() {
        const random = new Uint8Array(32);
        crypto.getRandomValues(random);
        return Array.from(random, byte => byte.toString(16).padStart(2, '0')).join('');
    }
    
    _getRecoveryAttempts(userId) {
        const key = `recovery_attempts_${userId}`;
        const attempts = this._stateManager.get(key, { namespace: 'session_service' }) || 0;
        return attempts;
    }
    
    _incrementRecoveryAttempts(userId) {
        const key = `recovery_attempts_${userId}`;
        const current = this._getRecoveryAttempts(userId);
        this._stateManager.set(key, current + 1, {
            namespace: 'session_service',
            ttl: this._config.recovery.recoveryCooldown
        });
    }
    
    _resetRecoveryAttempts(userId) {
        const key = `recovery_attempts_${userId}`;
        this._stateManager.delete(key, { namespace: 'session_service' });
    }
    
    _hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash.toString(36);
    }
    
    _maskFingerprint(fingerprint) {
        if (!fingerprint || fingerprint.length < 10) return '[INVALID]';
        return `${fingerprint.substring(0, 6)}...${fingerprint.substring(fingerprint.length - 4)}`;
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
        
        delete sanitized.password;
        delete sanitized.creditCard;
        delete sanitized.secretKey;
        
        return sanitized;
    }
    
    _init() {
        // راه‌اندازی event listeners
        const logoutListener = this._eventSystem.on('auth:logout', (data) => {
            if (data.userId && data.sessionId) {
                this.destroySession(data.sessionId, 'user_logout', data);
            } else if (data.userId) {
                this.destroyAllUserSessions(data.userId, 'user_logout', data);
            }
        });
        
        const cleanupListener = this._eventSystem.on('session:cleanup', () => {
            this._cleanupExpiredSessions();
        });
        
        this._subscriptions.add(logoutListener);
        this._subscriptions.add(cleanupListener);
        
        // راه‌اندازی auto cleanup
        if (this._config.session.cleanupInterval > 0) {
            this._cleanupInterval = setInterval(() => {
                this._cleanupExpiredSessions();
            }, this._config.session.cleanupInterval);
        }
        
        this._initialized = true;
        
        this._eventSystem.emit('session:service:initialized', {
            version: this._config.defaults.version,
            timestamp: new Date().toISOString(),
            features: {
                slidingExpiration: this._config.session.slidingExpiration,
                idleTimeout: this._config.session.idleTimeout,
                maxSessionsPerUser: this._config.security.maxSessionsPerUser,
                deviceFingerprinting: this._config.security.deviceFingerprinting,
                sessionRecovery: this._config.recovery.allowSessionRecovery
            }
        });
    }
    
    async _cleanupExpiredSessions() {
        const now = Date.now();
        let cleanedCount = 0;
        
        for (const [sessionId, sessionData] of this._sessions) {
            const session = sessionData.data;
            
            if (session.expiresAt < now) {
                try {
                    await this.destroySession(sessionId, 'expired_cleanup', {
                        auto: true,
                        cleanupTimestamp: now
                    });
                    cleanedCount++;
                } catch (error) {
                    console.warn(`Failed to cleanup session ${sessionId}:`, error);
                }
            }
        }
        
        if (cleanedCount > 0) {
            this._eventSystem.emit('session:cleanup:completed', {
                cleanedCount,
                timestamp: new Date().toISOString()
            });
        }
    }
    
    // ==================== متدهای عمومی ====================
    
    getMetrics() {
        return {
            ...this._metrics,
            activeSessions: this._sessions.size,
            uniqueUsers: this._sessionIndex.size,
            recoveryTokens: this._recoveryTokens.size,
            activityMonitors: this._activityMonitors.size
        };
    }
    
    resetMetrics() {
        this._metrics.sessionsCreated = 0;
        this._metrics.sessionsDestroyed = 0;
        this._metrics.sessionsRenewed = 0;
        this._metrics.sessionsRestored = 0;
        this._metrics.sessionValidationFailures = 0;
        this._metrics.concurrentSessionBlocks = 0;
        this._metrics.securityEvents = 0;
        return this;
    }
    
    destroy() {
        // توقف intervalها
        if (this._cleanupInterval) {
            clearInterval(this._cleanupInterval);
            this._cleanupInterval = null;
        }
        
        // توقف همه activity monitors
        for (const monitorId of this._activityMonitors.values()) {
            clearInterval(monitorId);
        }
        this._activityMonitors.clear();
        
        // لغو همه renewal predictors
        if (this._renewalPredictor) {
            clearTimeout(this._renewalPredictor);
            this._renewalPredictor = null;
        }
        
        // لغو subscriptionها
        for (const unsubscribe of this._subscriptions) {
            unsubscribe();
        }
        this._subscriptions.clear();
        
        // پاک‌سازی حافظه
        this._sessions.clear();
        this._sessionIndex.clear();
        this._recoveryTokens.clear();
        
        this._initialized = false;
        
        this._eventSystem.emit('session:service:destroyed', {
            timestamp: new Date().toISOString()
        });
    }
}

// ==================== Singleton Export ====================

let sessionServiceInstance = null;

function createSessionService(tokenManager, stateManager, eventSystem, authUtils, config) {
    if (!sessionServiceInstance) {
        sessionServiceInstance = new SessionService(
            tokenManager, 
            stateManager, 
            eventSystem, 
            authUtils, 
            config
        );
        Object.freeze(sessionServiceInstance);
    }
    return sessionServiceInstance;
}

function getSessionService() {
    if (!sessionServiceInstance) {
        console.warn('[SessionService] Instance not initialized. Call createSessionService() first.');
    }
    return sessionServiceInstance;
}

// ==================== Export ====================

export { SessionService, createSessionService, getSessionService };

// ==================== Auto-init در صورت وجود پیش‌نیازها ====================
if (typeof window !== 'undefined') {
    setTimeout(() => {
        if (window.getTokenManager && window.stateManager && window.eventBus && window.getAuthUtils) {
            const tokenManager = window.getTokenManager();
            const authUtils = window.getAuthUtils();
            
            if (tokenManager && authUtils) {
                createSessionService(
                    tokenManager,
                    window.stateManager,
                    window.eventBus,
                    authUtils
                );
                console.log('[SessionService] Auto-initialized with global instances');
            }
        }
    }, 1500);
    }
