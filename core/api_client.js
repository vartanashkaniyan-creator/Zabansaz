/**
 * 🌐 API Client Implementation
 * پیاده‌سازی کلاینت ارتباط با سرور با رعایت اصول SOLID
 */

import APIClientInterface from './api-client-interface.js';

class APIClient extends APIClientInterface {
    /**
     * سازنده با تزریق وابستگی‌ها - رعایت DIP
     * @param {Object} dependencies - وابستگی‌ها
     */
    constructor(dependencies) {
        super();
        
        // وابستگی‌های انتزاعی
        this.authManager = dependencies.authManager;     // مدیر احراز هویت
        this.offlineQueue = dependencies.offlineQueue;   // صف آفلاین
        this.logger = dependencies.logger || console;    // لاگر
        this.config = dependencies.config || {};         // پیکربندی
        
        // تنظیمات پیش‌فرض
        this.baseURL = this.config.baseURL || 'https://api.vakamova.com/v1';
        this.defaultHeaders = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-App-Version': this.config.appVersion || '1.0.0'
        };
        
        // کش درخواست‌ها
        this.cache = new Map();
        this.cacheTTL = 5 * 60 * 1000; // 5 دقیقه
        
        // تنظیمات retry
        this.maxRetries = 3;
        this.retryDelay = 1000;
        
        // مدیریت توکن
        this.tokenRefresher = null;
        this.isRefreshingToken = false;
        this.tokenRefreshQueue = [];
        
        this.initialize();
    }
    
    /**
     * مقداردهی اولیه - رعایت SRP
     */
    initialize() {
        // تنظیم interceptor برای اضافه کردن توکن
        this.requestInterceptor = this.requestInterceptor.bind(this);
        this.responseInterceptor = this.responseInterceptor.bind(this);
        
        this.logger.info('API Client initialized', { baseURL: this.baseURL });
    }
    
    /**
     * تنظیم هدرهای پیش‌فرض - رعایت SRP
     * @param {Object} headers - هدرهای جدید
     */
    setHeaders(headers) {
        this.defaultHeaders = { ...this.defaultHeaders, ...headers };
        this.logger.debug('Headers updated', this.defaultHeaders);
    }
    
    /**
     * درخواست GET - رعایت SRP
     * @param {string} endpoint - آدرس endpoint
     * @param {Object} params - پارامترهای query
     * @param {Object} options - تنظیمات اضافی
     * @returns {Promise<any>}
     */
    async get(endpoint, params = {}, options = {}) {
        return this.request('GET', endpoint, null, params, options);
    }
    
    /**
     * درخواست POST - رعایت SRP
     * @param {string} endpoint - آدرس endpoint
     * @param {Object} data - داده‌های body
     * @param {Object} options - تنظیمات اضافی
     * @returns {Promise<any>}
     */
    async post(endpoint, data = {}, options = {}) {
        return this.request('POST', endpoint, data, {}, options);
    }
    
    /**
     * درخواست PUT - رعایت SRP
     * @param {string} endpoint - آدرس endpoint
     * @param {Object} data - داده‌های body
     * @param {Object} options - تنظیمات اضافی
     * @returns {Promise<any>}
     */
    async put(endpoint, data = {}, options = {}) {
        return this.request('PUT', endpoint, data, {}, options);
    }
    
    /**
     * درخواست DELETE - رعایت SRP
     * @param {string} endpoint - آدرس endpoint
     * @param {Object} options - تنظیمات اضافی
     * @returns {Promise<any>}
     */
    async delete(endpoint, options = {}) {
        return this.request('DELETE', endpoint, null, {}, options);
    }
    
    /**
     * تنظیم تابع بازآوری توکن - رعایت SRP
     * @param {Function} tokenRefresher - تابع بازآوری توکن
     */
    setTokenRefresher(tokenRefresher) {
        this.tokenRefresher = tokenRefresher;
    }
    
    /**
     * پاک کردن کش - رعایت SRP
     * @param {string} endpoint - آدرس endpoint (اختیاری)
     */
    clearCache(endpoint = null) {
        if (endpoint) {
            this.cache.delete(endpoint);
            this.logger.debug(`Cache cleared for endpoint: ${endpoint}`);
        } else {
            this.cache.clear();
            this.logger.debug('All cache cleared');
        }
    }
    
    /**
     * متد اصلی درخواست - رعایت DRY
     * @param {string} method - متد HTTP
     * @param {string} endpoint - آدرس endpoint
     * @param {Object} data - داده‌های body
     * @param {Object} params - پارامترهای query
     * @param {Object} options - تنظیمات اضافی
     * @returns {Promise<any>}
     */
    async request(method, endpoint, data = null, params = {}, options = {}) {
        // بررسی حالت آفلاین
        if (!navigator.onLine && !options.ignoreOffline) {
            return this.handleOfflineRequest(method, endpoint, data, params, options);
        }
        
        // بررسی کش برای GET requests
        if (method === 'GET' && options.cache !== false) {
            const cachedResponse = this.getFromCache(endpoint, params);
            if (cachedResponse) {
                this.logger.debug('Returning cached response', { endpoint });
                return cachedResponse;
            }
        }
        
        // ساخت URL
        const url = this.buildURL(endpoint, params);
        
        // تنظیمات درخواست
        const requestOptions = {
            method,
            headers: { ...this.defaultHeaders, ...options.headers },
            ...options
        };
        
        // اضافه کردن داده‌های body
        if (data && (method === 'POST' || method === 'PUT')) {
            requestOptions.body = JSON.stringify(data);
        }
        
        try {
            // اجرای interceptor قبل از ارسال
            const interceptedRequest = await this.requestInterceptor({
                url,
                ...requestOptions
            });
            
            // ارسال درخواست با retry
            const response = await this.fetchWithRetry(
                interceptedRequest.url,
                interceptedRequest,
                options
            );
            
            // پردازش پاسخ
            const result = await this.responseInterceptor(response);
            
            // ذخیره در کش برای GET requests
            if (method === 'GET' && options.cache !== false && response.ok) {
                this.saveToCache(endpoint, params, result, options.cacheTTL);
            }
            
            return result;
            
        } catch (error) {
            this.logger.error('API request failed', {
                endpoint,
                method,
                error: error.message
            });
            
            // پرتاب خطای ساختاریافته
            throw this.normalizeError(error, {
                endpoint,
                method,
                data
            });
        }
    }
    
    /**
     * مدیریت درخواست آفلاین - رعایت SRP
     */
    async handleOfflineRequest(method, endpoint, data, params, options) {
        this.logger.warn('Device is offline, queuing request', { endpoint, method });
        
        if (!this.offlineQueue) {
            throw new Error('Offline queue not available');
        }
        
        // ذخیره در صف آفلاین
        const queueId = await this.offlineQueue.add({
            method,
            endpoint,
            data,
            params,
            options,
            timestamp: Date.now()
        });
        
        // بازگشت پاسخ موقت
        return {
            success: false,
            queued: true,
            queueId,
            message: 'Request queued for offline processing',
            timestamp: new Date().toISOString()
        };
    }
    
    /**
     * ساخت URL کامل - رعایت SRP
     */
    buildURL(endpoint, params) {
        let url = `${this.baseURL}${endpoint}`;
        
        if (Object.keys(params).length > 0) {
            const queryString = new URLSearchParams(params).toString();
            url += `?${queryString}`;
        }
        
        return url;
    }
    
    /**
     * ارسال درخواست با قابلیت retry - رعایت SRP
     */
    async fetchWithRetry(url, options, requestOptions, retryCount = 0) {
        try {
            const response = await fetch(url, options);
            
            // اگر خطای 401 بود و توکن قابل بازآوری است
            if (response.status === 401 && this.tokenRefresher && !options._retryingToken) {
                return this.handleTokenRefresh(url, options, requestOptions, retryCount);
            }
            
            // اگر خطای سرور بود و امکان retry وجود دارد
            if (response.status >= 500 && retryCount < this.maxRetries) {
                await this.delay(this.retryDelay * Math.pow(2, retryCount));
                return this.fetchWithRetry(url, options, requestOptions, retryCount + 1);
            }
            
            return response;
            
        } catch (error) {
            // اگر خطای شبکه بود و امکان retry وجود دارد
            if (retryCount < this.maxRetries) {
                await this.delay(this.retryDelay * Math.pow(2, retryCount));
                return this.fetchWithRetry(url, options, requestOptions, retryCount + 1);
            }
            throw error;
        }
    }
    
    /**
     * مدیریت بازآوری توکن - رعایت SRP
     */
    async handleTokenRefresh(url, options, requestOptions, retryCount) {
        if (this.isRefreshingToken) {
            // اگر در حال بازآوری توکن هستیم، درخواست را در صف قرار می‌دهیم
            return new Promise((resolve, reject) => {
                this.tokenRefreshQueue.push({ resolve, reject, url, options });
            });
        }
        
        this.isRefreshingToken = true;
        
        try {
            // بازآوری توکن
            await this.tokenRefresher();
            
            // اضافه کردن توکن جدید به هدرها
            const token = this.authManager?.getToken();
            if (token) {
                options.headers.Authorization = `Bearer ${token}`;
            }
            
            // علامت‌گذاری برای جلوگیری از حلقه بی‌نهایت
            options._retryingToken = true;
            
            // اجرای مجدد درخواست
            const response = await this.fetchWithRetry(url, options, requestOptions, retryCount);
            
            // آزاد کردن صف
            this.processTokenRefreshQueue();
            
            return response;
            
        } catch (error) {
            // شکست در بازآوری توکن
            this.processTokenRefreshQueueWithError(error);
            throw error;
        } finally {
            this.isRefreshingToken = false;
        }
    }
    
    /**
     * پردازش صف انتظار برای بازآوری توکن - رعایت SRP
     */
    processTokenRefreshQueue() {
        while (this.tokenRefreshQueue.length > 0) {
            const { resolve, url, options } = this.tokenRefreshQueue.shift();
            
            // اضافه کردن توکن جدید
            const token = this.authManager?.getToken();
            if (token) {
                options.headers.Authorization = `Bearer ${token}`;
            }
            
            // اجرای مجدد درخواست
            resolve(this.fetchWithRetry(url, options, {}, 0));
        }
    }
    
    /**
     * پردازش صف با خطا - رعایت SRP
     */
    processTokenRefreshQueueWithError(error) {
        while (this.tokenRefreshQueue.length > 0) {
            const { reject } = this.tokenRefreshQueue.shift();
            reject(error);
        }
    }
    
    /**
     * اینترسپتور درخواست - رعایت SRP
     */
    async requestInterceptor(request) {
        // اضافه کردن توکن اگر موجود است
        if (this.authManager) {
            const token = this.authManager.getToken();
            if (token) {
                request.headers.Authorization = `Bearer ${token}`;
            }
        }
        
        // اضافه کردن شناسه دستگاه
        const deviceId = this.getDeviceId();
        if (deviceId) {
            request.headers['X-Device-ID'] = deviceId;
        }
        
        // لاگ درخواست
        this.logger.debug('API Request', {
            url: request.url,
            method: request.method,
            headers: request.headers
        });
        
        return request;
    }
    
    /**
     * اینترسپتور پاسخ - رعایت SRP
     */
    async responseInterceptor(response) {
        // لاگ پاسخ
        this.logger.debug('API Response', {
            status: response.status,
            statusText: response.statusText,
            url: response.url
        });
        
        // بررسی وضعیت پاسخ
        if (!response.ok) {
            const errorData = await this.parseErrorResponse(response);
            throw this.createAPIError(response.status, errorData);
        }
        
        // پردازش پاسخ موفق
        const contentType = response.headers.get('content-type');
        
        if (contentType && contentType.includes('application/json')) {
            return response.json();
        }
        
        return response.text();
    }
    
    /**
     * مدیریت کش - رعایت SRP
     */
    getFromCache(endpoint, params) {
        const cacheKey = this.getCacheKey(endpoint, params);
        const cached = this.cache.get(cacheKey);
        
        if (!cached) return null;
        
        // بررسی انقضا
        if (Date.now() > cached.expiry) {
            this.cache.delete(cacheKey);
            return null;
        }
        
        return cached.data;
    }
    
    /**
     * ذخیره در کش - رعایت SRP
     */
    saveToCache(endpoint, params, data, ttl = null) {
        const cacheKey = this.getCacheKey(endpoint, params);
        const expiry = Date.now() + (ttl || this.cacheTTL);
        
        this.cache.set(cacheKey, { data, expiry });
        this.logger.debug('Response cached', { endpoint, cacheKey });
    }
    
    /**
     * تولید کلید کش - رعایت SRP
     */
    getCacheKey(endpoint, params) {
        const paramsString = JSON.stringify(params);
        return `${endpoint}:${paramsString}`;
    }
    
    /**
     * ایجاد خطای ساختاریافته - رعایت SRP
     */
    createAPIError(status, errorData) {
        const error = new Error(errorData.message || `API Error: ${status}`);
        error.status = status;
        error.code = errorData.code;
        error.details = errorData.details;
        error.timestamp = new Date().toISOString();
        
        // دسته‌بندی خطاها
        if (status >= 400 && status < 500) {
            error.type = 'CLIENT_ERROR';
        } else if (status >= 500) {
            error.type = 'SERVER_ERROR';
        }
        
        return error;
    }
    
    /**
     * تجزیه خطای پاسخ - رعایت SRP
     */
    async parseErrorResponse(response) {
        try {
            const contentType = response.headers.get('content-type');
            
            if (contentType && contentType.includes('application/json')) {
                return await response.json();
            }
            
            return {
                message: await response.text() || response.statusText,
                status: response.status
            };
        } catch {
            return {
                message: response.statusText,
                status: response.status
            };
        }
    }
    
    /**
     * نرمالایز کردن خطا - رعایت SRP
     */
    normalizeError(error, context) {
        if (error instanceof TypeError && error.message === 'Failed to fetch') {
            return {
                type: 'NETWORK_ERROR',
                message: 'Network connection failed',
                originalError: error,
                context,
                timestamp: new Date().toISOString()
            };
        }
        
        return error;
    }
    
    /**
     * دریافت شناسه دستگاه - رعایت SRP
     */
    getDeviceId() {
        // استفاده از localStorage برای ذخیره شناسه دستگاه
        let deviceId = localStorage.getItem('vakamova_device_id');
        
        if (!deviceId) {
            deviceId = `device_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            localStorage.setItem('vakamova_device_id', deviceId);
        }
        
        return deviceId;
    }
    
    /**
     * تابع تاخیر - رعایت SRP
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

export default APIClient;
