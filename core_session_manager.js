/**
 * HyperLang - Session Management System
 * Version: 1.0.0
 * Principles: Dependency Injection + Event-Driven + Interface Contract
 */

import { CONFIG } from './config.js';
import { context } from './context-provider.js';
import { eventBus } from './event-bus.js';

// Session Contract Interface
export const SESSION_CONTRACT = {
    id: 'string',
    userId: 'string?',
    createdAt: 'number',
    lastActivity: 'number',
    expiresAt: 'number',
    data: 'object?',
    isValid: 'boolean',
    metadata: 'object?'
};

export class SessionManager {
    constructor(options = {}) {
        // Dependency Injection
        this.config = context.get('config')?.AUTH || CONFIG.AUTH;
        this.logger = context.get('logger');
        this.eventBus = context.get('eventBus') || eventBus;
        
        // Configuration
        this.options = {
            sessionKey: options.sessionKey || this.config.TOKEN_KEY || 'hyperlang_session',
            timeout: options.timeout || this.config.SESSION_TIMEOUT,
            refreshThreshold: options.refreshThreshold || this.config.REFRESH_THRESHOLD,
            autoRefresh: options.autoRefresh ?? true,
            idleCheckInterval: options.idleCheckInterval || 60000, // 1 minute
            maxSessions: options.maxSessions || 5,
            encryptData: options.encryptData ?? true,
            ...options
        };
        
        // Session State
        this.currentSession = null;
        this.sessionHistory = [];
        this.activityTrackers = [];
        this.isMonitoring = false;
        
        // Activity Tracking
        this.lastActivityTime = Date.now();
        this.idleTimer = null;
        
        // Setup
        this.setupActivityTracking();
        this.loadSession();
        this.startMonitoring();
        
        // Register with context
        context.register('sessionManager', {
            factory: () => this,
            dependencies: ['config', 'logger', 'eventBus'],
            lifecycle: 'singleton'
        });
        
        this.logger?.log('SessionManager initialized');
    }
    
    // ==================== CORE SESSION METHODS ====================
    
    createSession(userData = {}, metadata = {}) {
        const sessionId = this.generateSessionId();
        const now = Date.now();
        
        const session = {
            id: sessionId,
            userId: userData.id || null,
            createdAt: now,
            lastActivity: now,
            expiresAt: now + this.options.timeout,
            data: { ...userData },
            metadata: {
                ip: metadata.ip || this.getClientIP(),
                userAgent: navigator?.userAgent || '',
                deviceInfo: this.getDeviceInfo(),
                ...metadata
            },
            isValid: true
        };
        
        // Encrypt sensitive data if enabled
        if (this.options.encryptData) {
            session.data = this.encryptSessionData(session.data);
            session.encrypted = true;
        }
        
        this.currentSession = session;
        
        // Store in history
        this.sessionHistory.unshift({
            ...session,
            storedAt: now
        });
        
        // Keep only max sessions
        if (this.sessionHistory.length > this.options.maxSessions) {
            this.sessionHistory.pop();
        }
        
        // Save to storage
        this.saveSession();
        
        // Emit events
        this.eventBus.emit('session:created', {
            sessionId,
            userId: userData.id,
            timestamp: now
        });
        
        this.logger?.log(`Session created: ${sessionId}`);
        
        return session;
    }
    
    getSession() {
        if (!this.currentSession) {
            return null;
        }
        
        const session = { ...this.currentSession };
        
        // Decrypt data if needed
        if (session.encrypted && this.options.encryptData) {
            session.data = this.decryptSessionData(session.data);
            delete session.encrypted;
        }
        
        // Check validity
        session.isValid = this.validateSession(session);
        
        return session;
    }
    
    updateSession(updates = {}) {
        if (!this.currentSession) {
            throw new Error('No active session to update');
        }
        
        const oldSession = { ...this.currentSession };
        
        // Update session data
        this.currentSession = {
            ...this.currentSession,
            ...updates,
            lastActivity: Date.now(),
            expiresAt: Date.now() + this.options.timeout
        };
        
        // Emit event
        this.eventBus.emit('session:updated', {
            oldSession,
            newSession: this.currentSession,
            timestamp: Date.now()
        });
        
        // Save changes
        this.saveSession();
        
        return this.currentSession;
    }
    
    destroySession(reason = 'manual') {
        if (!this.currentSession) return false;
        
        const destroyedSession = { ...this.currentSession };
        
        // Emit event before destruction
        this.eventBus.emit('session:destroying', {
            session: destroyedSession,
            reason,
            timestamp: Date.now()
        });
        
        // Clear current session
        this.currentSession = null;
        
        // Clear storage
        localStorage.removeItem(this.options.sessionKey);
        localStorage.removeItem(`${this.options.sessionKey}_backup`);
        
        // Emit event after destruction
        this.eventBus.emit('session:destroyed', {
            sessionId: destroyedSession.id,
            reason,
            timestamp: Date.now()
        });
        
        this.logger?.log(`Session destroyed: ${destroyedSession.id} (reason: ${reason})`);
        
        return true;
    }
    
    // ==================== VALIDATION AND CHECKS ====================
    
    validateSession(session = this.currentSession) {
        if (!session) return false;
        
        const now = Date.now();
        const checks = [];
        
        // Check expiration
        if (session.expiresAt < now) {
            checks.push({ type: 'expired', valid: false });
        } else {
            checks.push({ type: 'expiration', valid: true });
        }
        
        // Check inactivity timeout
        const idleTime = now - session.lastActivity;
        if (idleTime > this.options.timeout) {
            checks.push({ type: 'inactivity', valid: false, idleTime });
        } else {
            checks.push({ type: 'inactivity', valid: true, idleTime });
        }
        
        // Check session integrity
        if (!session.id || typeof session.id !== 'string') {
            checks.push({ type: 'integrity', valid: false });
        } else {
            checks.push({ type: 'integrity', valid: true });
        }
        
        // Check device consistency (optional)
        if (session.metadata?.deviceInfo) {
            const currentDevice = this.getDeviceInfo();
            const isSameDevice = this.compareDeviceInfo(
                session.metadata.deviceInfo,
                currentDevice
            );
            checks.push({ type: 'device', valid: isSameDevice });
        }
        
        // Determine overall validity
        const isValid = checks.every(check => check.valid !== false);
        
        // Log validation results
        if (!isValid) {
            this.logger?.warn('Session validation failed:', checks);
        }
        
        return isValid;
    }
    
    isSessionValid() {
        if (!this.currentSession) return false;
        
        const isValid = this.validateSession();
        
        // Auto-destroy if invalid
        if (!isValid) {
            this.destroySession('invalid');
        }
        
        return isValid;
    }
    
    // ==================== ACTIVITY TRACKING ====================
    
    updateActivity(source = 'unknown') {
        if (!this.currentSession) return false;
        
        const now = Date.now();
        this.lastActivityTime = now;
        
        // Only update if significant time has passed (to reduce saves)
        const timeSinceLastUpdate = now - this.currentSession.lastActivity;
        if (timeSinceLastUpdate < 10000) return true; // 10 seconds threshold
        
        this.currentSession.lastActivity = now;
        this.currentSession.expiresAt = now + this.options.timeout;
        
        // Emit activity event
        this.eventBus.emit('session:activity', {
            sessionId: this.currentSession.id,
            source,
            timestamp: now,
            idleTime: timeSinceLastUpdate
        });
        
        // Save session (debounced)
        this.debouncedSave();
        
        return true;
    }
    
    getIdleTime() {
        return Date.now() - this.lastActivityTime;
    }
    
    isIdle(idleThreshold = 300000) { // 5 minutes default
        return this.getIdleTime() > idleThreshold;
    }
    
    // ==================== SESSION PERSISTENCE ====================
    
    saveSession() {
        if (!this.currentSession) return false;
        
        try {
            const sessionData = {
                ...this.currentSession,
                _version: '1.0.0',
                _savedAt: Date.now()
            };
            
            // Store in localStorage
            localStorage.setItem(
                this.options.sessionKey,
                JSON.stringify(sessionData)
            );
            
            // Create backup in separate key
            localStorage.setItem(
                `${this.options.sessionKey}_backup`,
                JSON.stringify(sessionData)
            );
            
            return true;
        } catch (error) {
            this.logger?.error('Failed to save session:', error);
            return false;
        }
    }
    
    loadSession() {
        try {
            // Try primary storage first
            let sessionData = localStorage.getItem(this.options.sessionKey);
            
            // Fallback to backup if primary is corrupted
            if (!sessionData) {
                sessionData = localStorage.getItem(`${this.options.sessionKey}_backup`);
                if (sessionData) {
                    this.logger?.warn('Loaded session from backup');
                }
            }
            
            if (!sessionData) return false;
            
            const parsed = JSON.parse(sessionData);
            
            // Validate stored session
            if (!parsed.id || parsed._version !== '1.0.0') {
                throw new Error('Invalid session data');
            }
            
            // Check if session is still valid
            const now = Date.now();
            if (parsed.expiresAt < now) {
                this.logger?.warn('Loaded session expired');
                return false;
            }
            
            this.currentSession = parsed;
            
            // Update last activity to now
            this.currentSession.lastActivity = now;
            this.currentSession.expiresAt = now + this.options.timeout;
            
            this.logger?.log(`Session loaded: ${parsed.id}`);
            
            return true;
        } catch (error) {
            this.logger?.error('Failed to load session:', error);
            this.clearCorruptedSession();
            return false;
        }
    }
    
    clearCorruptedSession() {
        localStorage.removeItem(this.options.sessionKey);
        localStorage.removeItem(`${this.options.sessionKey}_backup`);
        this.currentSession = null;
    }
    
    // ==================== SESSION REFRESH ====================
    
    refreshSession() {
        if (!this.currentSession) return false;
        
        const now = Date.now();
        const timeUntilExpiry = this.currentSession.expiresAt - now;
        
        // Only refresh if close to expiry
        if (timeUntilExpiry > this.options.refreshThreshold) {
            return false;
        }
        
        const oldExpiry = this.currentSession.expiresAt;
        this.currentSession.expiresAt = now + this.options.timeout;
        
        this.eventBus.emit('session:refreshed', {
            sessionId: this.currentSession.id,
            oldExpiry,
            newExpiry: this.currentSession.expiresAt,
            timestamp: now
        });
        
        this.saveSession();
        
        return true;
    }
    
    // ==================== MULTIPLE SESSIONS MANAGEMENT ====================
    
    switchSession(sessionId) {
        const targetSession = this.sessionHistory.find(s => s.id === sessionId);
        if (!targetSession) return false;
        
        const oldSession = this.currentSession;
        
        // Update current session
        this.currentSession = {
            ...targetSession,
            lastActivity: Date.now(),
            expiresAt: Date.now() + this.options.timeout
        };
        
        // Save to storage
        this.saveSession();
        
        this.eventBus.emit('session:switched', {
            fromSession: oldSession?.id,
            toSession: sessionId,
            timestamp: Date.now()
        });
        
        return true;
    }
    
    getSessionHistory(limit = 10) {
        return this.sessionHistory
            .slice(0, limit)
            .map(session => ({
                id: session.id,
                userId: session.userId,
                createdAt: session.createdAt,
                lastActivity: session.lastActivity,
                expiresAt: session.expiresAt,
                device: session.metadata?.deviceInfo
            }));
    }
    
    // ==================== SECURITY METHODS ====================
    
    encryptSessionData(data) {
        // Simple encryption for sensitive data
        // In production, use proper encryption like AES
        try {
            return btoa(unescape(encodeURIComponent(JSON.stringify(data))));
        } catch (error) {
            this.logger?.error('Encryption failed:', error);
            return data;
        }
    }
    
    decryptSessionData(encryptedData) {
        try {
            if (typeof encryptedData === 'string') {
                return JSON.parse(decodeURIComponent(escape(atob(encryptedData))));
            }
            return encryptedData;
        } catch (error) {
            this.logger?.error('Decryption failed:', error);
            return encryptedData;
        }
    }
    
    // ==================== DEVICE AND CLIENT INFO ====================
    
    getDeviceInfo() {
        const ua = navigator?.userAgent || '';
        
        return {
            platform: navigator?.platform || 'unknown',
            userAgent: ua,
            language: navigator?.language || 'en',
            screen: {
                width: screen?.width || 0,
                height: screen?.height || 0
            },
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            fingerprints: this.generateFingerprints()
        };
    }
    
    compareDeviceInfo(device1, device2) {
        // Simple comparison - can be enhanced
        return (
            device1.platform === device2.platform &&
            device1.language === device2.language &&
            device1.timezone === device2.timezone
        );
    }
    
    generateFingerprints() {
        // Generate simple fingerprints for device identification
        // Note: This is a simplified version
        const fingerprints = {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            language: navigator.language,
            platform: navigator.platform,
            cores: navigator.hardwareConcurrency || 'unknown',
            memory: navigator.deviceMemory || 'unknown'
        };
        
        return Object.values(fingerprints).join('|');
    }
    
    getClientIP() {
        // Note: This requires a backend service to get real IP
        // This is just a placeholder
        return 'local';
    }
    
    // ==================== MONITORING AND AUTOMATION ====================
    
    startMonitoring() {
        if (this.isMonitoring) return;
        
        this.isMonitoring = true;
        
        // Check session validity periodically
        this.monitorInterval = setInterval(() => {
            this.checkSessionState();
        }, this.options.idleCheckInterval);
        
        // Auto-refresh session if enabled
        if (this.options.autoRefresh) {
            this.refreshInterval = setInterval(() => {
                this.refreshSession();
            }, 30000); // Every 30 seconds
        }
        
        this.logger?.log('Session monitoring started');
    }
    
    stopMonitoring() {
        this.isMonitoring = false;
        
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
        }
        
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        
        this.logger?.log('Session monitoring stopped');
    }
    
    checkSessionState() {
        if (!this.currentSession) return;
        
        const now = Date.now();
        const isValid = this.validateSession();
        
        if (!isValid) {
            this.destroySession('auto_timeout');
            return;
        }
        
        // Check idle state
        if (this.isIdle()) {
            this.eventBus.emit('session:idle', {
                sessionId: this.currentSession.id,
                idleTime: this.getIdleTime(),
                timestamp: now
            });
        }
        
        // Check if refresh needed
        const timeUntilExpiry = this.currentSession.expiresAt - now;
        if (timeUntilExpiry < 60000) { // 1 minute warning
            this.eventBus.emit('session:expiring_soon', {
                sessionId: this.currentSession.id,
                expiresIn: timeUntilExpiry,
                timestamp: now
            });
        }
    }
    
    // ==================== ACTIVITY TRACKING SETUP ====================
    
    setupActivityTracking() {
        const activityEvents = [
            'mousedown', 'mousemove', 'keydown', 'scroll',
            'touchstart', 'touchmove', 'click', 'focus'
        ];
        
        activityEvents.forEach(event => {
            document.addEventListener(event, () => {
                this.updateActivity(event);
            }, { passive: true });
        });
        
        // Also track visibility changes
        document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
                this.updateActivity('visibility_change');
            }
        });
    }
    
    // ==================== UTILITY METHODS ====================
    
    generateSessionId() {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substr(2, 9);
        const fingerprint = this.generateFingerprints().substr(0, 4);
        
        return `${timestamp}_${random}_${fingerprint}`;
    }
    
    debouncedSave() {
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        this.saveTimeout = setTimeout(() => {
            this.saveSession();
        }, 2000); // 2 second debounce
    }
    
    // ==================== CONTRACT VALIDATION ====================
    
    validateContract() {
        const errors = [];
        
        // Check if session methods exist
        const requiredMethods = [
            'createSession', 'getSession', 'updateSession',
            'destroySession', 'isSessionValid'
        ];
        
        requiredMethods.forEach(method => {
            if (typeof this[method] !== 'function') {
                errors.push(`Missing required method: ${method}`);
            }
        });
        
        // Validate current session against contract
        if (this.currentSession) {
            const session = this.getSession();
            for (const [key, type] of Object.entries(SESSION_CONTRACT)) {
                if (!key.endsWith('?') && session[key] === undefined) {
                    errors.push(`Session missing required field: ${key}`);
                }
            }
        }
        
        return {
            valid: errors.length === 0,
            errors,
            contract: SESSION_CONTRACT,
            timestamp: new Date().toISOString()
        };
    }
    
    // ==================== LIFECYCLE ====================
    
    destroy() {
        this.stopMonitoring();
        
        if (this.saveTimeout) {
            clearTimeout(this.saveTimeout);
        }
        
        if (this.idleTimer) {
            clearTimeout(this.idleTimer);
        }
        
        // Clean up event listeners
        const activityEvents = [
            'mousedown', 'mousemove', 'keydown', 'scroll',
            'touchstart', 'touchmove', 'click', 'focus'
        ];
        
        activityEvents.forEach(event => {
            document.removeEventListener(event, () => {
                this.updateActivity(event);
            });
        });
        
        this.logger?.log('SessionManager destroyed');
    }
}

// Singleton instance
export const sessionManager = new SessionManager();

// Register with context
context.registerSingleton('sessionManager', sessionManager);

// Export for global use
if (typeof window !== 'undefined') {
    window.sessionManager = sessionManager;
}

export default sessionManager;
