
// ==================== CORE_api.js ====================
// Vakamova - Professional API Client System
// اصول رعایت شده: Dependency Injection, Event-Driven, Central Config, Interface Contract

// ==================== API CONTRACT ====================
export const API_CONTRACT = {
    name: 'VakamovaAPIClient',
    version: '1.0.0',
    requiredMethods: ['get', 'post', 'put', 'delete', 'setConfig', 'addInterceptor'],
    events: ['request:start', 'request:success', 'request:error', 'request:retry', 'connection:online', 'connection:offline'],
    configurable: ['baseURL', 'timeout', 'retryAttempts', 'cacheTTL']
};

// ==================== MAIN API CLASS ====================
class VakamovaAPIClient {
    constructor(dependencies = {}) {
        // ========== DEPENDENCY INJECTION ==========
        this.deps = {
            // Core dependencies (injected or created)
            config: dependencies.config || this._createDefaultConfig(),
            eventBus: dependencies.eventBus || this._createEventBus(),
            logger: dependencies.logger || this._createLogger(),
            security: dependencies.security || this._createSecurity(),
            validator: dependencies.validator || this._createValidator(),
            errorHandler: dependencies.errorHandler || this._createErrorHandler(),
            cache: dependencies.cache || this._createCache(),
            
            // Browser APIs (always available)
            fetch: dependencies.fetch || window.fetch.bind(window),
            localStorage: dependencies.localStorage || window.localStorage,
            navigator: dependencies.navigator || window.navigator,
            performance: dependencies.performance || window.performance
        };

        // ========== INITIALIZATION ==========
        this._validateDependencies();
        this._setupConfiguration();
        this._setupInterceptors();
        this._setupNetworkMonitor();
        this._setupRequestQueue();
        
        // Contract compliance
        this._contract = API_CONTRACT;
        
        // Metrics
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            startTime: Date.now()
        };

        this.deps.logger.log('[API] ✅ Initialized', 'info');
    }

    // ==================== CONFIGURATION ====================
    _setupConfiguration() {
        this.config = {
            // Base configuration
            baseURL: this.deps.config?.api?.baseURL || '',
            timeout: this.deps.config?.api?.timeout || 30000,
            retryAttempts: this.deps.config?.api?.retryAttempts || 3,
            retryDelay: this.deps.config?.api?.retryDelay || 1000,
            cacheTTL: this.deps.config?.api?.cacheTTL || 60000,
            
            // Headers
            defaultHeaders: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-Application': 'Vakamova',
                'X-Version': this.deps.config?.app?.version || '1.0.0'
            },
            
            // Features
            enableCache: this.deps.config?.features?.cache !== false,
            enableRetry: this.deps.config?.features?.retry !== false,
            enableOfflineQueue: this.deps.config?.features?.offlineQueue !== false,
            enableAnalytics: this.deps.config?.features?.analytics !== false
        };

        // Authentication token
        this._authToken = null;
    }

    // ==================== PUBLIC API METHODS ====================
    async get(endpoint, options = {}) {
        return this._request('GET', endpoint, null, options);
    }

    async post(endpoint, data, options = {}) {
        return this._request('POST', endpoint, data, options);
    }

    async put(endpoint, data, options = {}) {
        return this._request('PUT', endpoint, data, options);
    }

    async delete(endpoint, options = {}) {
        return this._request('DELETE', endpoint, null, options);
    }

    async upload(endpoint, file, options = {}) {
        const formData = new FormData();
        formData.append('file', file);
        
        return this._request('POST', endpoint, formData, {
            ...options,
            headers: { ...options.headers, 'Content-Type': 'multipart/form-data' }
        });
    }

    // ==================== AUTH MANAGEMENT ====================
    setAuthToken(token) {
        this._authToken = token;
        this.deps.logger.log('[API] Auth token set', 'info');
        this.deps.eventBus.emit('auth:tokenUpdated', { hasToken: !!token });
    }

    clearAuth() {
        this._authToken = null;
        this.deps.logger.log('[API] Auth cleared', 'info');
    }

    // ==================== CONFIGURATION MANAGEMENT ====================
    setConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        this.deps.logger.log('[API] Configuration updated', 'info');
        return this.config;
    }

    getConfig() {
        return { ...this.config };
    }

    // ==================== INTERCEPTORS ====================
    addInterceptor(type, interceptor) {
        if (!['request', 'response', 'error'].includes(type)) {
            throw new Error('Interceptor type must be: request, response, or error');
        }

        const id = Date.now() + Math.random().toString(36).substr(2, 9);
        this._interceptors[type].push({ id, fn: interceptor });
        
        this.deps.logger.log(`[API] ${type} interceptor added`, 'info');
        return () => this._removeInterceptor(type, id);
    }

    _removeInterceptor(type, id) {
        this._interceptors[type] = this._interceptors[type].filter(i => i.id !== id);
    }

    _setupInterceptors() {
        this._interceptors = {
            request: [],
            response: [],
            error: []
        };

        // Default request interceptor: Add auth token
        this.addInterceptor('request', (config) => {
            if (this._authToken) {
                config.headers = {
                    ...config.headers,
                    'Authorization': `Bearer ${this._authToken}`
                };
            }
            return config;
        });

        // Default response interceptor: Parse JSON
        this.addInterceptor('response', async (response) => {
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                return { ...response, data };
            }
            
            return response;
        });

        // Default error interceptor: Handle common errors
        this.addInterceptor('error', (error) => {
            if (error.name === 'TypeError' && error.message.includes('fetch')) {
                return {
                    ...error,
                    type: 'NETWORK_ERROR',
                    message: 'Network connection failed',
                    retryable: true
                };
            }
            return error;
        });
    }

    // ==================== CORE REQUEST ENGINE ====================
    async _request(method, endpoint, data, options = {}) {
        const requestId = this._generateRequestId();
        const startTime = this.deps.performance.now();
        
        // Build request configuration
        const config = {
            method,
            url: this._buildURL(endpoint),
            headers: { ...this.config.defaultHeaders, ...options.headers },
            data,
            timeout: options.timeout || this.config.timeout,
            retryAttempts: options.retryAttempts || this.config.retryAttempts,
            enableCache: options.enableCache !== false && this.config.enableCache,
            cacheKey: options.cacheKey || `${method}:${endpoint}`,
            requestId,
            metadata: options.metadata || {}
        };

        // Emit request start event
        this.deps.eventBus.emit('request:start', { 
            requestId, 
            method, 
            endpoint,
            timestamp: new Date().toISOString() 
        });

        // Check cache first
        if (config.enableCache && method === 'GET') {
            const cached = await this._getFromCache(config.cacheKey);
            if (cached) {
                this.metrics.cacheHits++;
                this.deps.logger.log(`[API] Cache hit: ${config.cacheKey}`, 'info');
                
                this.deps.eventBus.emit('request:success', {
                    requestId,
                    method,
                    endpoint,
                    response: cached,
                    cached: true,
                    duration: 0
                });
                
                return cached;
            }
            this.metrics.cacheMisses++;
        }

        try {
            // Apply request interceptors
            const processedConfig = await this._applyInterceptors('request', config);
            
            // Execute request with retry logic
            const response = await this._executeWithRetry(processedConfig);
            
            // Apply response interceptors
            const processedResponse = await this._applyInterceptors('response', response);
            
            // Cache response if needed
            if (config.enableCache && method === 'GET' && processedResponse.ok) {
                await this._saveToCache(config.cacheKey, processedResponse);
            }
            
            // Calculate duration
            const duration = this.deps.performance.now() - startTime;
            
            // Update metrics
            this.metrics.totalRequests++;
            this.metrics.successfulRequests++;
            
            // Emit success event
            this.deps.eventBus.emit('request:success', {
                requestId,
                method,
                endpoint,
                response: processedResponse,
                duration,
                cached: false
            });
            
            this.deps.logger.log(`[API] ${method} ${endpoint} - ${duration.toFixed(0)}ms`, 'success');
            
            return processedResponse;
            
        } catch (error) {
            // Apply error interceptors
            const processedError = await this._applyInterceptors('error', error);
            
            // Update metrics
            this.metrics.totalRequests++;
            this.metrics.failedRequests++;
            
            // Calculate duration
            const duration = this.deps.performance.now() - startTime;
            
            // Emit error event
            this.deps.eventBus.emit('request:error', {
                requestId,
                method,
                endpoint,
                error: processedError,
                duration
            });
            
            this.deps.logger.log(`[API] ${method} ${endpoint} - Error: ${processedError.message}`, 'error');
            
            // Use error handler if available
            if (this.deps.errorHandler) {
                return this.deps.errorHandler.handle(processedError, {
                    requestId,
                    config,
                    duration
                });
            }
            
            throw processedError;
        }
    }

    // ==================== RETRY LOGIC ====================
    async _executeWithRetry(config, attempt = 1) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), config.timeout);
        
        try {
            const fetchOptions = {
                method: config.method,
                headers: config.headers,
                signal: controller.signal,
                ...(config.data && { body: this._prepareBody(config.data, config.headers) })
            };
            
            const response = await this.deps.fetch(config.url, fetchOptions);
            clearTimeout(timeoutId);
            
            if (!response.ok && this._isRetryable(response.status) && attempt < config.retryAttempts) {
                throw new Error(`HTTP ${response.status} - Retryable`);
            }
            
            return response;
            
        } catch (error) {
            clearTimeout(timeoutId);
            
            if (this._shouldRetry(error) && attempt < config.retryAttempts) {
                const delay = config.retryDelay * Math.pow(2, attempt - 1);
                
                this.deps.eventBus.emit('request:retry', {
                    requestId: config.requestId,
                    attempt,
                    totalAttempts: config.retryAttempts,
                    delay,
                    error: error.message
                });
                
                this.deps.logger.log(`[API] Retry ${attempt}/${config.retryAttempts} after ${delay}ms`, 'warn');
                
                await this._delay(delay);
                return this._executeWithRetry(config, attempt + 1);
            }
            
            throw error;
        }
    }

    // ==================== CACHE MANAGEMENT ====================
    async _getFromCache(key) {
        if (!this.config.enableCache) return null;
        
        try {
            const cached = this.deps.localStorage.getItem(`api_cache_${key}`);
            if (!cached) return null;
            
            const { data, timestamp, ttl } = JSON.parse(cached);
            
            // Check if cache is expired
            if (Date.now() - timestamp > (ttl || this.config.cacheTTL)) {
                this.deps.localStorage.removeItem(`api_cache_${key}`);
                return null;
            }
            
            return data;
        } catch (error) {
            this.deps.logger.log(`[API] Cache read error: ${error.message}`, 'warn');
            return null;
        }
    }

    async _saveToCache(key, data) {
        if (!this.config.enableCache) return;
        
        try {
            const cacheItem = {
                data,
                timestamp: Date.now(),
                ttl: this.config.cacheTTL
            };
            
            this.deps.localStorage.setItem(`api_cache_${key}`, JSON.stringify(cacheItem));
        } catch (error) {
            this.deps.logger.log(`[API] Cache write error: ${error.message}`, 'warn');
        }
    }

    clearCache(pattern = null) {
        if (pattern) {
            // Clear specific pattern
            Object.keys(this.deps.localStorage)
                .filter(key => key.startsWith('api_cache_') && key.includes(pattern))
                .forEach(key => this.deps.localStorage.removeItem(key));
        } else {
            // Clear all API cache
            Object.keys(this.deps.localStorage)
                .filter(key => key.startsWith('api_cache_'))
                .forEach(key => this.deps.localStorage.removeItem(key));
        }
        
        this.deps.logger.log('[API] Cache cleared', 'info');
    }

    // ==================== NETWORK MONITORING ====================
    _setupNetworkMonitor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('online', () => {
                this.deps.eventBus.emit('connection:online');
                this.deps.logger.log('[API] Network connection restored', 'success');
                this._processOfflineQueue();
            });
            
            window.addEventListener('offline', () => {
                this.deps.eventBus.emit('connection:offline');
                this.deps.logger.log('[API] Network connection lost', 'warn');
            });
            
            // Initial check
            this._isOnline = this.deps.navigator.onLine;
        }
    }

    // ==================== OFFLINE QUEUE ====================
    _setupRequestQueue() {
        this._offlineQueue = [];
        
        // Load existing queue from localStorage
        try {
            const saved = this.deps.localStorage.getItem('api_offline_queue');
            if (saved) {
                this._offlineQueue = JSON.parse(saved);
            }
        } catch (error) {
            this.deps.logger.log('[API] Failed to load offline queue', 'warn');
        }
    }

    async _processOfflineQueue() {
        if (this._offlineQueue.length === 0) return;
        
        this.deps.logger.log(`[API] Processing ${this._offlineQueue.length} queued requests`, 'info');
        
        const queue = [...this._offlineQueue];
        this._offlineQueue = [];
        
        for (const item of queue) {
            try {
                await this._request(item.method, item.endpoint, item.data, item.options);
                this.deps.logger.log(`[API] Queued request completed: ${item.method} ${item.endpoint}`, 'success');
            } catch (error) {
                this.deps.logger.log(`[API] Queued request failed: ${error.message}`, 'error');
                // Re-add to queue if still retryable
                if (item.attempts < 3) {
                    this._offlineQueue.push({ ...item, attempts: item.attempts + 1 });
                }
            }
        }
        
        this._saveQueue();
    }

    _saveQueue() {
        try {
            this.deps.localStorage.setItem('api_offline_queue', JSON.stringify(this._offlineQueue));
        } catch (error) {
            // Ignore storage errors
        }
    }

    // ==================== UTILITY METHODS ====================
    _buildURL(endpoint) {
        if (endpoint.startsWith('http')) return endpoint;
        return `${this.config.baseURL}${endpoint}`;
    }

    _prepareBody(data, headers) {
        const contentType = headers['Content-Type'] || headers['content-type'];
        
        if (data instanceof FormData) {
            return data;
        }
        
        if (contentType === 'application/json') {
            return JSON.stringify(data);
        }
        
        return data;
    }

    async _applyInterceptors(type, value) {
        let result = value;
        
        for (const interceptor of this._interceptors[type]) {
            try {
                result = await interceptor.fn(result);
            } catch (error) {
                this.deps.logger.log(`[API] Interceptor error (${type}): ${error.message}`, 'error');
            }
        }
        
        return result;
    }

    _generateRequestId() {
        return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    _shouldRetry(error) {
        // Network errors or 5xx server errors
        return error.name === 'AbortError' || 
               error.message.includes('Network') ||
               (error.message.includes('HTTP 5')) ||
               error.type === 'NETWORK_ERROR';
    }

    _isRetryable(status) {
        return [408, 429, 500, 502, 503, 504].includes(status);
    }

    // ==================== FALLBACK CREATORS ====================
    _createDefaultConfig() {
        return {
            app: { name: 'Vakamova', version: '1.0.0' },
            api: {
                baseURL: '',
                timeout: 30000,
                retryAttempts: 3
            },
            features: {
                cache: true,
                retry: true,
                offlineQueue: true,
                analytics: true
            }
        };
    }

    _createEventBus() {
        const events = new Map();
        
        return {
            emit(event, data) {
                const handlers = events.get(event) || [];
                handlers.forEach(handler => {
                    try {
                        handler(data);
                    } catch (error) {
                        console.error(`Event handler error for ${event}:`, error);
                    }
                });
            },
            on(event, handler) {
                if (!events.has(event)) events.set(event, []);
                events.get(event).push(handler);
                return () => this.off(event, handler);
            },
            off(event, handler) {
                const handlers = events.get(event);
                if (handlers) {
                    const index = handlers.indexOf(handler);
                    if (index > -1) handlers.splice(index, 1);
                }
            }
        };
    }

    _createLogger() {
        const levels = {
            error: 'color: red',
            warn: 'color: orange',
            info: 'color: blue',
            success: 'color: green'
        };
        
        return {
            log(message, level = 'info') {
                const style = levels[level] || levels.info;
                console.log(`%c[Vakamova] ${message}`, style);
            }
        };
    }

    _createSecurity() {
        return {
            sanitize(input) {
                if (typeof input !== 'string') return input;
                return input.replace(/[<>]/g, '');
            },
            validateToken(token) {
                return typeof token === 'string' && token.length > 10;
            }
        };
    }

    _createValidator() {
        return {
            validate(data, schema) {
                // Simple validation - can be extended
                return { valid: true, errors: [] };
            }
        };
    }

    _createErrorHandler() {
        return {
            handle(error, context) {
                console.error('API Error:', error, context);
                return { error, handled: true };
            }
        };
    }

    _createCache() {
        return {
            get: (key) => this._getFromCache(key),
            set: (key, value) => this._saveToCache(key, value)
        };
    }

    _validateDependencies() {
        const required = ['fetch', 'localStorage', 'navigator'];
        required.forEach(dep => {
            if (!this.deps[dep]) {
                throw new Error(`Required dependency missing: ${dep}`);
            }
        });
    }

    // ==================== METRICS & ANALYTICS ====================
    getMetrics() {
        const uptime = Date.now() - this.metrics.startTime;
        
        return {
            ...this.metrics,
            uptime,
            successRate: this.metrics.totalRequests > 0 
                ? (this.metrics.successfulRequests / this.metrics.totalRequests) * 100 
                : 0,
            cacheHitRate: (this.metrics.cacheHits + this.metrics.cacheMisses) > 0
                ? (this.metrics.cacheHits / (this.metrics.cacheHits + this.metrics.cacheMisses)) * 100
                : 0
        };
    }

    resetMetrics() {
        this.metrics = {
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            cacheHits: 0,
            cacheMisses: 0,
            startTime: Date.now()
        };
    }

    // ==================== CLEANUP ====================
    cleanup() {
        // Clear intervals, timeouts, etc.
        this._offlineQueue = [];
        this._interceptors = { request: [], response: [], error: [] };
        
        this.deps.logger.log('[API] Cleaned up', 'info');
    }
}

// ==================== EXPORT & INITIALIZATION ====================
export default VakamovaAPIClient;

// Auto-initialize for global use (non-module environments)
if (typeof window !== 'undefined' && !window.VakamovaAPI) {
    window.VakamovaAPI = new VakamovaAPIClient();
    console.log('[API] Auto-initialized global instance');
}

console.log('[API] CORE_api.js loaded successfully');
