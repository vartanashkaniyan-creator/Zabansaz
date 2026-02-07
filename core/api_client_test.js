/**
 * 🧪 تست API Client
 * تست‌های واحد و یکپارچه‌سازی
 */

import APIClient from './api-client.js';

// Mock fetch global
global.fetch = jest.fn();

// Mock وابستگی‌ها
const mockDependencies = {
    authManager: {
        getToken: jest.fn(() => 'mock_token_123')
    },
    offlineQueue: {
        add: jest.fn(async () => 'queue_001')
    },
    logger: {
        info: jest.fn(),
        debug: jest.fn(),
        warn: jest.fn(),
        error: jest.fn()
    },
    config: {
        baseURL: 'https://api.test.com/v1',
        appVersion: '1.0.0'
    }
};

describe('APIClient', () => {
    let apiClient;
    
    beforeEach(() => {
        jest.clearAllMocks();
        global.fetch.mockClear();
        apiClient = new APIClient(mockDependencies);
    });
    
    test('should initialize correctly', () => {
        expect(apiClient.baseURL).toBe('https://api.test.com/v1');
        expect(apiClient.defaultHeaders['X-App-Version']).toBe('1.0.0');
        expect(mockDependencies.logger.info).toHaveBeenCalled();
    });
    
    test('should set headers correctly', () => {
        const newHeaders = { 'X-Custom-Header': 'value' };
        apiClient.setHeaders(newHeaders);
        
        expect(apiClient.defaultHeaders['X-Custom-Header']).toBe('value');
        expect(apiClient.defaultHeaders['Content-Type']).toBe('application/json');
    });
    
    test('should make GET request successfully', async () => {
        const mockResponse = { data: 'test' };
        global.fetch.mockResolvedValueOnce({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => mockResponse
        });
        
        const result = await apiClient.get('/lessons', { page: 1 });
        
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/lessons?page=1'),
            expect.objectContaining({
                method: 'GET',
                headers: expect.objectContaining({
                    'Authorization': 'Bearer mock_token_123'
                })
            })
        );
        
        expect(result).toEqual(mockResponse);
    });
    
    test('should handle POST request with data', async () => {
        const mockResponse = { id: '123', success: true };
        global.fetch.mockResolvedValueOnce({
            ok: true,
            status: 201,
            headers: { get: () => 'application/json' },
            json: async () => mockResponse
        });
        
        const data = { title: 'New Lesson', content: 'Test content' };
        const result = await apiClient.post('/lessons', data);
        
        expect(global.fetch).toHaveBeenCalledWith(
            expect.stringContaining('/lessons'),
            expect.objectContaining({
                method: 'POST',
                body: JSON.stringify(data)
            })
        );
        
        expect(result).toEqual(mockResponse);
    });
    
    test('should handle offline requests', async () => {
        // شبیه‌سازی حالت آفلاین
        Object.defineProperty(navigator, 'onLine', { value: false, writable: true });
        
        const result = await apiClient.post('/lessons', { title: 'Test' });
        
        expect(result.queued).toBe(true);
        expect(result.queueId).toBe('queue_001');
        expect(mockDependencies.offlineQueue.add).toHaveBeenCalled();
        
        // بازگرداندن حالت آنلاین
        Object.defineProperty(navigator, 'onLine', { value: true, writable: true });
    });
    
    test('should handle token refresh on 401', async () => {
        // Mock token refresher
        const tokenRefresher = jest.fn(async () => {
            mockDependencies.authManager.getToken.mockReturnValue('new_token_456');
        });
        
        apiClient.setTokenRefresher(tokenRefresher);
        
        // اولین پاسخ: 401
        global.fetch
            .mockResolvedValueOnce({
                ok: false,
                status: 401,
                headers: { get: () => 'application/json' }
            })
            // پاسخ بعد از refresh
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: () => 'application/json' },
                json: async () => ({ success: true })
            });
        
        await apiClient.get('/protected');
        
        expect(tokenRefresher).toHaveBeenCalled();
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });
    
    test('should retry on server errors', async () => {
        global.fetch
            .mockResolvedValueOnce({
                ok: false,
                status: 500
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                headers: { get: () => 'application/json' },
                json: async () => ({ success: true })
            });
        
        await apiClient.get('/test');
        
        expect(global.fetch).toHaveBeenCalledTimes(2);
    });
    
    test('should cache GET responses', async () => {
        const mockResponse = { data: 'cached' };
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: () => 'application/json' },
            json: async () => mockResponse
        });
        
        // اولین درخواست
        await apiClient.get('/cache-test');
        expect(global.fetch).toHaveBeenCalledTimes(1);
        
        // درخواست دوم (باید از کش خوانده شود)
        const cachedResult = await apiClient.get('/cache-test');
        expect(global.fetch).toHaveBeenCalledTimes(1); // هنوز ۱
        expect(cachedResult).toEqual(mockResponse);
    });
    
    test('should clear cache correctly', async () => {
        // پر کردن کش
        apiClient.saveToCache('/test', {}, { data: 'test' });
        expect(apiClient.cache.size).toBe(1);
        
        // پاک کردن کش
        apiClient.clearCache('/test');
        expect(apiClient.cache.size).toBe(0);
    });
    
    test('should handle network errors gracefully', async () => {
        global.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
        
        await expect(apiClient.get('/test')).rejects.toMatchObject({
            type: 'NETWORK_ERROR'
        });
    });
    
    test('should create structured API errors', async () => {
        const errorResponse = {
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            details: { field: 'email' }
        };
        
        global.fetch.mockResolvedValue({
            ok: false,
            status: 400,
            headers: { get: () => 'application/json' },
            json: async () => errorResponse
        });
        
        try {
            await apiClient.post('/test', {});
        } catch (error) {
            expect(error.status).toBe(400);
            expect(error.code).toBe('VALIDATION_ERROR');
            expect(error.type).toBe('CLIENT_ERROR');
        }
    });
});

// تست‌های اضافی برای coverage کامل
describe('APIClient Edge Cases', () => {
    let apiClient;
    
    beforeEach(() => {
        apiClient = new APIClient({
            ...mockDependencies,
            config: { baseURL: 'https://api.test.com' }
        });
    });
    
    test('should handle empty response', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            status: 204,
            headers: { get: () => null }
        });
        
        const result = await apiClient.delete('/resource/123');
        expect(result).toBe('');
    });
    
    test('should handle non-JSON response', async () => {
        global.fetch.mockResolvedValue({
            ok: true,
            status: 200,
            headers: { get: () => 'text/plain' },
            text: async () => 'Plain text response'
        });
        
        const result = await apiClient.get('/text-endpoint');
        expect(result).toBe('Plain text response');
    });
    
    test('should handle concurrent token refresh', async () => {
        const tokenRefresher = jest.fn(async () => {
            await new Promise(resolve => setTimeout(resolve, 100));
            mockDependencies.authManager.getToken.mockReturnValue('new_token');
        });
        
        apiClient.setTokenRefresher(tokenRefresher);
        
        // دو درخواست همزمان
        global.fetch
            .mockResolvedValueOnce({ ok: false, status: 401 })
            .mockResolvedValueOnce({ ok: false, status: 401 })
            .mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
        
        const request1 = apiClient.get('/protected/1');
        const request2 = apiClient.get('/protected/2');
        
        await Promise.all([request1, request2]);
        
        // فقط یک بار باید توکن refresh شود
        expect(tokenRefresher).toHaveBeenCalledTimes(1);
    });
});
