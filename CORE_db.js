// ==================== CORE_db.js ====================
// سیستم دیتابیس صنعتی با IndexedDB - نسخه 3.0.0
// پشتیبانی از تراکنش‌های پیشرفته، Migration، و رمزنگاری
// تاریخ: ۱۴۰۳/۰۲/۱۵

'use strict';

class HyperDatabase {
    // تنظیمات اصلی دیتابیس
    static CONFIG = {
        NAME: 'HyperLangDB',
        VERSION: 6,
        TIMEOUT: 10000,
        MAX_RETRIES: 3,
        ENCRYPTION_KEY: null // در تولید باید از محیط بگیرد
    };
    
    // طرح (Schema) دیتابیس
    static SCHEMA = {
        STORES: {
            USERS: {
                name: 'users',
                keyPath: 'id',
                indexes: [
                    { name: 'email', keyPath: 'email', unique: true },
                    { name: 'username', keyPath: 'username', unique: false },
                    { name: 'createdAt', keyPath: 'createdAt', unique: false }
                ]
            },
            LESSONS: {
                name: 'lessons',
                keyPath: ['language', 'level', 'id'],
                indexes: [
                    { name: 'language', keyPath: 'language', unique: false },
                    { name: 'level', keyPath: 'level', unique: false },
                    { name: 'category', keyPath: 'category', unique: false },
                    { name: 'difficulty', keyPath: 'difficulty', unique: false },
                    { name: 'lastAccessed', keyPath: 'lastAccessed', unique: false }
                ]
            },
            PROGRESS: {
                name: 'user_progress',
                keyPath: ['userId', 'lessonId', 'exerciseId'],
                indexes: [
                    { name: 'by_user', keyPath: 'userId', unique: false },
                    { name: 'by_lesson', keyPath: 'lessonId', unique: false },
                    { name: 'by_user_lesson', keyPath: ['userId', 'lessonId'], unique: false },
                    { name: 'by_date', keyPath: 'completedAt', unique: false },
                    { name: 'by_score', keyPath: 'score', unique: false }
                ]
            },
            EXERCISES: {
                name: 'exercises',
                keyPath: 'id',
                indexes: [
                    { name: 'lessonId', keyPath: 'lessonId', unique: false },
                    { name: 'type', keyPath: 'type', unique: false },
                    { name: 'difficulty', keyPath: 'difficulty', unique: false }
                ]
            },
            VOCABULARY: {
                name: 'vocabulary',
                keyPath: ['language', 'word'],
                indexes: [
                    { name: 'language', keyPath: 'language', unique: false },
                    { name: 'category', keyPath: 'category', unique: false },
                    { name: 'mastery', keyPath: 'mastery', unique: false },
                    { name: 'lastReviewed', keyPath: 'lastReviewed', unique: false }
                ]
            },
            SETTINGS: {
                name: 'app_settings',
                keyPath: 'key',
                indexes: []
            },
            CACHE: {
                name: 'network_cache',
                keyPath: 'url',
                indexes: [
                    { name: 'expiresAt', keyPath: 'expiresAt', unique: false },
                    { name: 'lastUsed', keyPath: 'lastUsed', unique: false }
                ]
            },
            STATISTICS: {
                name: 'statistics',
                keyPath: ['type', 'date'],
                indexes: [
                    { name: 'by_date', keyPath: 'date', unique: false },
                    { name: 'by_type', keyPath: 'type', unique: false }
                ]
            },
            BACKUP: {
                name: 'backup_logs',
                keyPath: 'timestamp',
                indexes: [
                    { name: 'by_type', keyPath: 'type', unique: false },
                    { name: 'by_status', keyPath: 'status', unique: false }
                ]
            },
            MIGRATIONS: {
                name: 'migrations',
                keyPath: 'version',
                indexes: []
            }
        },
        
        // محدودیت‌های ذخیره‌سازی
        QUOTAS: {
            MAX_LESSON_SIZE: 1024 * 1024, // 1MB
            MAX_CACHE_ITEMS: 1000,
            MAX_CACHE_SIZE: 50 * 1024 * 1024, // 50MB
            AUTO_CLEANUP_THRESHOLD: 0.8 // 80% پر شود
        }
    };
    
    constructor(options = {}) {
        this.config = { ...HyperDatabase.CONFIG, ...options };
        this.db = null;
        this.isInitialized = false;
        this.isOpening = false;
        this.pendingOperations = [];
        this.encryptionEnabled = typeof CryptoJS !== 'undefined';
        this.metrics = {
            reads: 0,
            writes: 0,
            errors: 0,
            startTime: Date.now()
        };
        
        // Event system برای ارتباط با کامپوننت‌های دیگر
        this.events = new EventTarget();
        
        console.log(`[HyperDatabase] نمونه ایجاد شد: ${this.config.NAME} v${this.config.VERSION}`);
    }
    
    // ==================== PUBLIC API ====================
    
    async init() {
        if (this.isInitialized) {
            console.log('[HyperDatabase] قبلاً راه‌اندازی شده');
            return this;
        }
        
        if (this.isOpening) {
            console.log('[HyperDatabase] در حال باز شدن، منتظر بمانید...');
            return new Promise((resolve) => {
                const checkInterval = setInterval(() => {
                    if (this.isInitialized && !this.isOpening) {
                        clearInterval(checkInterval);
                        resolve(this);
                    }
                }, 100);
            });
        }
        
        this.isOpening = true;
        
        try {
            console.log(`[HyperDatabase] شروع راه‌اندازی...`);
            
            // 1. بررسی پشتیبانی مرورگر
            this._checkBrowserSupport();
            
            // 2. باز کردن دیتابیس
            await this._openDatabase();
            
            // 3. اجرای Migrationها
            await this._runMigrations();
            
            // 4. اعتبارسنجی Schema
            await this._validateSchema();
            
            // 5. راه‌اندازی سیستم نگهداری
            this._startMaintenance();
            
            this.isInitialized = true;
            this.isOpening = false;
            
            // اطلاع‌رسانی به سایر کامپوننت‌ها
            this._emitEvent('database:ready', {
                name: this.config.NAME,
                version: this.config.VERSION,
                stores: Object.keys(HyperDatabase.SCHEMA.STORES).length
            });
            
            console.log(`[HyperDatabase] راه‌اندازی کامل شد. Stores: ${Object.keys(HyperDatabase.SCHEMA.STORES).length}`);
            
            // پردازش عملیات‌های معلق
            this._processPendingOperations();
            
            return this;
            
        } catch (error) {
            this.isOpening = false;
            console.error('[HyperDatabase] خطا در راه‌اندازی:', error);
            
            // تلاش برای بازیابی
            await this._attemptRecovery(error);
            
            throw new Error(`Database initialization failed: ${error.message}`);
        }
    }
    
    async getState() {
        return this.withRetry(async () => {
            const transaction = this.db.transaction(
                [HyperDatabase.SCHEMA.STORES.SETTINGS.name],
                'readonly'
            );
            
            const store = transaction.objectStore(
                HyperDatabase.SCHEMA.STORES.SETTINGS.name
            );
            
            const request = store.get('app_state');
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    this.metrics.reads++;
                    resolve(request.result ? request.result.value : null);
                };
                
                request.onerror = () => {
                    this.metrics.errors++;
                    reject(new Error('Failed to get state'));
                };
            });
        });
    }
    
    async saveState(state) {
        return this.withRetry(async () => {
            const transaction = this.db.transaction(
                [HyperDatabase.SCHEMA.STORES.SETTINGS.name],
                'readwrite'
            );
            
            const store = transaction.objectStore(
                HyperDatabase.SCHEMA.STORES.SETTINGS.name
            );
            
            const stateData = {
                key: 'app_state',
                value: state,
                updatedAt: new Date().toISOString(),
                version: '1.0'
            };
            
            // رمزنگاری اگر فعال باشد
            if (this.encryptionEnabled && this.config.ENCRYPTION_KEY) {
                stateData.value = this._encryptData(state);
                stateData.encrypted = true;
            }
            
            const request = store.put(stateData);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    this.metrics.writes++;
                    
                    // ذخیره در Backup
                    this._logBackup('state_save', 'success', {
                        size: JSON.stringify(state).length,
                        timestamp: new Date().toISOString()
                    });
                    
                    resolve(request.result);
                };
                
                request.onerror = () => {
                    this.metrics.errors++;
                    this._logBackup('state_save', 'failed', {
                        error: request.error?.message
                    });
                    reject(new Error('Failed to save state'));
                };
            });
        });
    }
    
    async saveUserProgress(userId, lessonId, data) {
        return this.withRetry(async () => {
            const transaction = this.db.transaction(
                [HyperDatabase.SCHEMA.STORES.PROGRESS.name],
                'readwrite'
            );
            
            const store = transaction.objectStore(
                HyperDatabase.SCHEMA.STORES.PROGRESS.name
            );
            
            const progressData = {
                userId,
                lessonId,
                exerciseId: data.exerciseId || 'main',
                score: data.score || 0,
                timeSpent: data.timeSpent || 0,
                answers: data.answers || [],
                metadata: JSON.stringify(data.metadata || {}),
                completedAt: new Date().toISOString(),
                synced: false // برای همگام‌سازی با سرور
            };
            
            const request = store.put(progressData);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    this.metrics.writes++;
                    
                    // به‌روزرسانی آمار
                    this._updateStatistics('progress_saved', {
                        userId,
                        lessonId,
                        score: progressData.score
                    });
                    
                    resolve(request.result);
                };
                
                request.onerror = () => reject(request.error);
            });
        });
    }
    
    async getLesson(language, level, lessonId) {
        return this.withRetry(async () => {
            const transaction = this.db.transaction(
                [HyperDatabase.SCHEMA.STORES.LESSONS.name],
                'readonly'
            );
            
            const store = transaction.objectStore(
                HyperDatabase.SCHEMA.STORES.LESSONS.name
            );
            
            // استفاده از کلید مرکب
            const key = IDBKeyRange.only([language, level, lessonId]);
            const request = store.get(key);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = async () => {
                    this.metrics.reads++;
                    
                    if (request.result) {
                        // به‌روزرسانی زمان دسترسی
                        await this._updateLastAccessed(
                            HyperDatabase.SCHEMA.STORES.LESSONS.name,
                            [language, level, lessonId]
                        );
                        
                        resolve(request.result);
                    } else {
                        // کش شبکه را بررسی کن
                        const cached = await this._getFromNetworkCache(
                            `lesson_${language}_${level}_${lessonId}`
                        );
                        
                        if (cached) {
                            resolve(cached);
                        } else {
                            resolve(null);
                        }
                    }
                };
                
                request.onerror = () => reject(request.error);
            });
        });
    }
    
    async saveLesson(lessonData) {
        return this.withRetry(async () => {
            // اعتبارسنجی اندازه
            const lessonSize = JSON.stringify(lessonData).length;
            if (lessonSize > HyperDatabase.SCHEMA.QUOTAS.MAX_LESSON_SIZE) {
                throw new Error(`Lesson size too large: ${lessonSize} bytes`);
            }
            
            const transaction = this.db.transaction(
                [HyperDatabase.SCHEMA.STORES.LESSONS.name],
                'readwrite'
            );
            
            const store = transaction.objectStore(
                HyperDatabase.SCHEMA.STORES.LESSONS.name
            );
            
            const lessonWithMeta = {
                ...lessonData,
                lastAccessed: new Date().toISOString(),
                accessCount: (lessonData.accessCount || 0) + 1,
                cachedAt: new Date().toISOString(),
                size: lessonSize
            };
            
            const request = store.put(lessonWithMeta);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    this.metrics.writes++;
                    
                    // ذخیره در کش شبکه
                    this._saveToNetworkCache(
                        `lesson_${lessonData.language}_${lessonData.level}_${lessonData.id}`,
                        lessonData,
                        { ttl: 24 * 60 * 60 * 1000 } // 24 ساعت
                    );
                    
                    resolve(request.result);
                };
                
                request.onerror = () => reject(request.error);
            });
        });
    }
    
    async bulkInsert(storeName, items) {
        return this.withRetry(async () => {
            if (!Array.isArray(items)) {
                throw new Error('Items must be an array');
            }
            
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            const promises = items.map(item => {
                return new Promise((resolve, reject) => {
                    const request = store.put(item);
                    request.onsuccess = () => resolve(request.result);
                    request.onerror = () => reject(request.error);
                });
            });
            
            try {
                const results = await Promise.all(promises);
                this.metrics.writes += items.length;
                
                this._emitEvent('bulk:inserted', {
                    store: storeName,
                    count: items.length,
                    timestamp: new Date().toISOString()
                });
                
                return results;
            } catch (error) {
                throw new Error(`Bulk insert failed: ${error.message}`);
            }
        });
    }
    
    async query(storeName, options = {}) {
        return this.withRetry(async () => {
            const {
                index,
                range,
                direction = 'next',
                limit,
                filter
            } = options;
            
            const transaction = this.db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            
            let source = store;
            if (index) {
                source = store.index(index);
            }
            
            let cursorRequest;
            if (range) {
                cursorRequest = source.openCursor(range, direction);
            } else {
                cursorRequest = source.openCursor(null, direction);
            }
            
            const results = [];
            
            return new Promise((resolve, reject) => {
                cursorRequest.onsuccess = (event) => {
                    const cursor = event.target.result;
                    
                    if (cursor) {
                        // اعمال فیلتر دلخواه
                        if (!filter || filter(cursor.value)) {
                            results.push(cursor.value);
                        }
                        
                        // بررسی محدودیت
                        if (limit && results.length >= limit) {
                            resolve(results);
                            return;
                        }
                        
                        cursor.continue();
                    } else {
                        this.metrics.reads += results.length;
                        resolve(results);
                    }
                };
                
                cursorRequest.onerror = () => {
                    this.metrics.errors++;
                    reject(new Error('Query failed'));
                };
            });
        });
    }
    
    async clearStore(storeName) {
        return this.withRetry(async () => {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            const request = store.clear();
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    console.log(`[HyperDatabase] Store ${storeName} cleared`);
                    resolve();
                };
                
                request.onerror = () => reject(request.error);
            });
        });
    }
    
    async getMetrics() {
        const uptime = Date.now() - this.metrics.startTime;
        
        return {
            ...this.metrics,
            uptime: this._formatDuration(uptime),
            readRate: (this.metrics.reads / (uptime / 1000)).toFixed(2),
            writeRate: (this.metrics.writes / (uptime / 1000)).toFixed(2),
            errorRate: (this.metrics.errors / (this.metrics.reads + this.metrics.writes) * 100).toFixed(2) + '%',
            isInitialized: this.isInitialized,
            dbSize: await this._estimateSize(),
            stores: Object.keys(HyperDatabase.SCHEMA.STORES)
        };
    }
    
    async exportData(format = 'json') {
        const exportData = {
            meta: {
                exportedAt: new Date().toISOString(),
                database: this.config.NAME,
                version: this.config.VERSION,
                stores: []
            },
            data: {}
        };
        
        // صادر کردن هر Store
        for (const [storeKey, storeConfig] of Object.entries(HyperDatabase.SCHEMA.STORES)) {
            try {
                const data = await this.query(storeConfig.name);
                exportData.data[storeKey] = data;
                exportData.meta.stores.push({
                    name: storeConfig.name,
                    count: data.length
                });
            } catch (error) {
                console.warn(`Failed to export ${storeKey}:`, error);
                exportData.data[storeKey] = { error: error.message };
            }
        }
        
        switch (format) {
            case 'json':
                return JSON.stringify(exportData, null, 2);
                
            case 'blob':
                return new Blob(
                    [JSON.stringify(exportData, null, 2)],
                    { type: 'application/json' }
                );
                
            case 'csv':
                return this._convertToCSV(exportData);
                
            default:
                return exportData;
        }
    }
    
    async importData(data) {
        if (typeof data === 'string') {
            data = JSON.parse(data);
        }
        
        if (!data.meta || !data.data) {
            throw new Error('Invalid import format');
        }
        
        // بررسی سازگاری نسخه
        if (data.meta.version > this.config.VERSION) {
            console.warn(`Importing from newer version: ${data.meta.version}`);
        }
        
        const results = {};
        
        // وارد کردن هر Store
        for (const [storeKey, storeData] of Object.entries(data.data)) {
            if (Array.isArray(storeData)) {
                try {
                    const storeConfig = Object.values(HyperDatabase.SCHEMA.STORES)
                        .find(s => s.name.toLowerCase().includes(storeKey.toLowerCase()));
                    
                    if (storeConfig) {
                        await this.bulkInsert(storeConfig.name, storeData);
                        results[storeKey] = { 
                            success: true, 
                            count: storeData.length 
                        };
                    }
                } catch (error) {
                    results[storeKey] = { 
                        success: false, 
                        error: error.message 
                    };
                }
            }
        }
        
        this._logBackup('data_import', 'completed', {
            importedStores: Object.keys(results).length,
            timestamp: new Date().toISOString()
        });
        
        return results;
    }
    
    async backup() {
        const backupId = `backup_${Date.now()}`;
        
        try {
            console.log(`[HyperDatabase] شروع Backup: ${backupId}`);
            
            // 1. صادر کردن داده‌ها
            const data = await this.exportData('blob');
            
            // 2. ذخیره در localStorage به عنوان پشتیبان اضطراری
            if (typeof localStorage !== 'undefined') {
                const backupKey = `hyperdb_backup_${backupId}`;
                const reader = new FileReader();
                
                reader.onload = () => {
                    try {
                        localStorage.setItem(backupKey, reader.result);
                        console.log(`[HyperDatabase] Backup saved to localStorage: ${backupKey}`);
                    } catch (e) {
                        console.warn('Could not save to localStorage:', e);
                    }
                };
                
                reader.readAsDataURL(data);
            }
            
            // 3. لاگ Backup
            await this._logBackup('manual', 'success', {
                id: backupId,
                size: data.size,
                timestamp: new Date().toISOString()
            });
            
            // 4. رویداد برای دانلود
            this._emitEvent('backup:created', {
                id: backupId,
                blob: data,
                timestamp: new Date().toISOString()
            });
            
            return { id: backupId, blob: data };
            
        } catch (error) {
            await this._logBackup('manual', 'failed', {
                id: backupId,
                error: error.message
            });
            
            throw error;
        }
    }
    
    async compact() {
        console.log('[HyperDatabase] شروع فشرده‌سازی...');
        
        try {
            // 1. حذف کش منقضی شده
            await this._cleanupExpiredCache();
            
            // 2. حذف رکوردهای قدیمی
            await this._cleanupOldRecords();
            
            // 3. بهینه‌سازی Indexها
            await this._optimizeIndexes();
            
            console.log('[HyperDatabase] فشرده‌سازی کامل شد');
            
            return {
                success: true,
                timestamp: new Date().toISOString(),
                estimatedSavings: await this._estimateSavings()
            };
            
        } catch (error) {
            console.error('[HyperDatabase] خطا در فشرده‌سازی:', error);
            throw error;
        }
    }
    
    async close() {
        if (this.db) {
            this.db.close();
            this.db = null;
            this.isInitialized = false;
            
            console.log('[HyperDatabase] بسته شد');
            this._emitEvent('database:closed');
        }
    }
    
    async destroy() {
        await this.close();
        
        return new Promise((resolve, reject) => {
            const request = indexedDB.deleteDatabase(this.config.NAME);
            
            request.onsuccess = () => {
                console.log('[HyperDatabase] حذف شد');
                this._emitEvent('database:destroyed');
                resolve();
            };
            
            request.onerror = () => {
                console.error('[HyperDatabase] خطا در حذف:', request.error);
                reject(request.error);
            };
            
            request.onblocked = () => {
                console.warn('[HyperDatabase] حذف مسدود است. همه اتصالات را ببندید.');
                reject(new Error('Database deletion blocked'));
            };
        });
    }
    
    // ==================== UTILITY METHODS ====================
    
    async withRetry(operation, maxRetries = this.config.MAX_RETRIES) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                if (!this.isInitialized && !this.isOpening) {
                    await this.init();
                }
                
                return await operation();
                
            } catch (error) {
                lastError = error;
                
                console.warn(`[HyperDatabase] Attempt ${attempt} failed:`, error.message);
                
                if (attempt === maxRetries) {
                    break;
                }
                
                // انتظار تصاعدی قبل از تلاش مجدد
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
                await new Promise(resolve => setTimeout(resolve, delay));
                
                // تلاش برای بازیابی
                if (error.name === 'NotFoundError' || error.name === 'VersionError') {
                    try {
                        await this._attemptRecovery(error);
                    } catch (recoveryError) {
                        console.error('[HyperDatabase] Recovery failed:', recoveryError);
                    }
                }
            }
        }
        
        this.metrics.errors++;
        this._logBackup('operation_failed', 'critical', {
            error: lastError.message,
            operation: operation.name || 'unknown',
            retries: maxRetries
        });
        
        throw new Error(`Operation failed after ${maxRetries} attempts: ${lastError.message}`);
    }
    
    on(event, handler) {
        this.events.addEventListener(event, handler);
        return () => this.events.removeEventListener(event, handler);
    }
    
    // ==================== PRIVATE METHODS ====================
    
    async _openDatabase() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(
                this.config.NAME,
                this.config.VERSION
            );
            
            request.onerror = () => {
                console.error('[HyperDatabase] خطا در باز کردن:', request.error);
                reject(request.error);
            };
            
            request.onupgradeneeded = (event) => {
                console.log(`[HyperDatabase] Upgrade needed: ${event.oldVersion} -> ${event.newVersion}`);
                this.db = event.target.result;
                this._createStores(event);
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                
                // تنظیم timeout برای تراکنش‌ها
                this.db.onerror = (error) => {
                    console.error('[HyperDatabase] Database error:', error.target.error);
                    this.metrics.errors++;
                };
                
                // مدیریت بسته شدن غیرمنتظره
                this.db.onclose = () => {
                    console.warn('[HyperDatabase] اتصال بسته شد');
                    this.isInitialized = false;
                    this._emitEvent('database:connection_lost');
                };
                
                console.log('[HyperDatabase] باز شد');
                resolve();
            };
            
            request.onblocked = () => {
                console.warn('[HyperDatabase] باز کردن مسدود است. همه اتصالات را ببندید.');
                reject(new Error('Database opening blocked'));
            };
            
            // Timeout
            setTimeout(() => {
                if (!this.db) {
                    request.onerror = null;
                    reject(new Error('Database opening timeout'));
                }
            }, this.config.TIMEOUT);
        });
    }
    
    _createStores(event) {
        const db = event.target.result;
        const transaction = event.target.transaction;
        
        console.log('[HyperDatabase] ایجاد/به‌روزرسانی Stores...');
        
        // حذف Stores قدیمی (در صورت نیاز)
        this._cleanupOldStores(db, event.oldVersion);
        
        // ایجاد Stores جدید
        for (const storeConfig of Object.values(HyperDatabase.SCHEMA.STORES)) {
            if (!db.objectStoreNames.contains(storeConfig.name)) {
                console.log(`  ایجاد Store: ${storeConfig.name}`);
                
                const store = db.createObjectStore(
                    storeConfig.name,
                    { keyPath: storeConfig.keyPath }
                );
                
                // ایجاد Indexها
                storeConfig.indexes.forEach(index => {
                    store.createIndex(
                        index.name,
                        index.keyPath,
                        { unique: index.unique || false }
                    );
                });
            } else {
                // به‌روزرسانی Store موجود
                this._upgradeStore(transaction, storeConfig);
            }
        }
    }
    
    _upgradeStore(transaction, storeConfig) {
        const store = transaction.objectStore(storeConfig.name);
        const existingIndexes = new Set(store.indexNames);
        
        // اضافه کردن Indexهای جدید
        storeConfig.indexes.forEach(index => {
            if (!existingIndexes.has(index.name)) {
                console.log(`  اضافه کردن Index: ${index.name} به ${storeConfig.name}`);
                store.createIndex(
                    index.name,
                    index.keyPath,
                    { unique: index.unique || false }
                );
            }
        });
        
        // حذف Indexهای قدیمی
        existingIndexes.forEach(indexName => {
            const stillExists = storeConfig.indexes.some(i => i.name === indexName);
            if (!stillExists) {
                console.log(`  حذف Index قدیمی: ${indexName} از ${storeConfig.name}`);
                store.deleteIndex(indexName);
            }
        });
    }
    
    _cleanupOldStores(db, oldVersion) {
        // حذف Stores قدیمی که در Schema جدید وجود ندارند
        const currentStoreNames = Object.values(HyperDatabase.SCHEMA.STORES)
            .map(s => s.name);
        
        for (const storeName of Array.from(db.objectStoreNames)) {
            if (!currentStoreNames.includes(storeName)) {
                console.log(`  حذف Store قدیمی: ${storeName}`);
                db.deleteObjectStore(storeName);
            }
        }
    }
    
    async _runMigrations() {
        const migrationStore = HyperDatabase.SCHEMA.STORES.MIGRATIONS.name;
        
        try {
            // دریافت نسخه‌های Migration اجرا شده
            const completedMigrations = await this.query(migrationStore);
            const completedVersions = new Set(completedMigrations.map(m => m.version));
            
            // اجرای Migrationهای لازم
            const migrations = this._getMigrations();
            
            for (const migration of migrations) {
                if (!completedVersions.has(migration.version)) {
                    console.log(`[HyperDatabase] اجرای Migration v${migration.version}...`);
                    
                    try {
                        await migration.execute(this);
                        
                        // ثبت Migration اجرا شده
                        await this._recordMigration(migration.version, 'success');
                        
                        console.log(`[HyperDatabase] Migration v${migration.version} موفق`);
                        
                    } catch (error) {
                        await this._recordMigration(migration.version, 'failed', error.message);
                        throw error;
                    }
                }
            }
            
        } catch (error) {
            console.error('[HyperDatabase] خطا در اجرای Migrations:', error);
            throw error;
        }
    }
    
    _getMigrations() {
        return [
            {
                version: 1,
                execute: async (db) => {
                    // Migration اولیه - ایجاد ساختار پایه
                    console.log('Running migration v1');
                }
            },
            {
                version: 2,
                execute: async (db) => {
                    // اضافه کردن فیلدهای جدید
                    console.log('Running migration v2');
                }
            },
            {
                version: 3,
                execute: async (db) => {
                    // بهینه‌سازی Indexها
                    console.log('Running migration v3');
                }
            }
        ];
    }
    
    async _recordMigration(version, status, error = null) {
        const migrationData = {
            version,
            status,
            executedAt: new Date().toISOString(),
            error
        };
        
        const transaction = this.db.transaction(
            [HyperDatabase.SCHEMA.STORES.MIGRATIONS.name],
            'readwrite'
        );
        
        const store = transaction.objectStore(
            HyperDatabase.SCHEMA.STORES.MIGRATIONS.name
        );
        
        store.put(migrationData);
    }
    
    async _validateSchema() {
        console.log('[HyperDatabase] اعتبارسنجی Schema...');
        
        const transaction = this.db.transaction(
            Object.values(HyperDatabase.SCHEMA.STORES).map(s => s.name),
            'readonly'
        );
        
        // بررسی وجود همه Stores
        for (const storeConfig of Object.values(HyperDatabase.SCHEMA.STORES)) {
            if (!transaction.objectStoreNames.contains(storeConfig.name)) {
                throw new Error(`Store ${storeConfig.name} not found`);
            }
        }
        
        console.log('[HyperDatabase] Schema معتبر است');
    }
    
    _checkBrowserSupport() {
        if (!window.indexedDB) {
            throw new Error('مرورگر از IndexedDB پشتیبانی نمی‌کند');
        }
        
        if (!window.Promise) {
            throw new Error('مرورگر از Promise پشتیبانی نمی‌کند');
        }
        
        console.log('[HyperDatabase] مرورگر پشتیبانی می‌شود');
    }
    
    async _attemptRecovery(error) {
        console.warn('[HyperDatabase] تلاش برای بازیابی...');
        
        try {
            // 1. بستن اتصال فعلی
            await this.close();
            
            // 2. حذف و ایجاد مجدد در صورت خطای Version
            if (error.name === 'VersionError' || error.name === 'NotFoundError') {
                console.log('[HyperDatabase] حذف و ایجاد مجدد دیتابیس...');
                await this.destroy();
            }
            
            // 3. راه‌اندازی مجدد
            await this.init();
            
            console.log('[HyperDatabase] بازیابی موفق');
            
        } catch (recoveryError) {
            console.error('[HyperDatabase] بازیابی ناموفق:', recoveryError);
            throw recoveryError;
        }
    }
    
    _startMaintenance() {
        // اجرای نگهداری منظم
        setInterval(async () => {
            try {
                if (this.isInitialized) {
                    await this._performMaintenance();
                }
            } catch (error) {
                console.warn('[HyperDatabase] خطا در نگهداری:', error);
            }
        }, 30 * 60 * 1000); // هر ۳۰ دقیقه
        
        console.log('[HyperDatabase] سیستم نگهداری راه‌اندازی شد');
    }
    
    async _performMaintenance() {
        const tasks = [
            this._cleanupExpiredCache(),
            this._updateStatistics('maintenance_run', {}),
            this._checkStorageQuota()
        ];
        
        await Promise.allSettled(tasks);
        
        this._emitEvent('maintenance:completed', {
            timestamp: new Date().toISOString()
        });
    }
    
    async _cleanupExpiredCache() {
        const now = Date.now();
        const cacheStore = HyperDatabase.SCHEMA.STORES.CACHE.name;
        
        const expiredItems = await this.query(cacheStore, {
            index: 'expiresAt',
            range: IDBKeyRange.upperBound(now),
            limit: 100
        });
        
        if (expiredItems.length > 0) {
            console.log(`[HyperDatabase] حذف ${expiredItems.length} آیتم کش منقضی شده`);
            
            const transaction = this.db.transaction([cacheStore], 'readwrite');
            const store = transaction.objectStore(cacheStore);
            
            expiredItems.forEach(item => {
                store.delete(item.url);
            });
        }
    }
    
    async _updateLastAccessed(storeName, key) {
        try {
            const transaction = this.db.transaction([storeName], 'readwrite');
            const store = transaction.objectStore(storeName);
            
            const item = await new Promise((resolve, reject) => {
                const request = store.get(key);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
            });
            
            if (item) {
                item.lastAccessed = new Date().toISOString();
                item.accessCount = (item.accessCount || 0) + 1;
                
                store.put(item);
            }
        } catch (error) {
            // خطا در به‌روزرسانی آخرین دسترسی بحرانی نیست
            console.debug('Failed to update lastAccessed:', error);
        }
    }
    
    async _getFromNetworkCache(key) {
        const cacheStore = HyperDatabase.SCHEMA.STORES.CACHE.name;
        
        try {
            const transaction = this.db.transaction([cacheStore], 'readonly');
            const store = transaction.objectStore(cacheStore);
            
            const request = store.get(key);
            
            return new Promise((resolve, reject) => {
                request.onsuccess = () => {
                    const item = request.result;
                    
                    if (item && item.expiresAt > Date.now()) {
                        // به‌روزرسانی زمان آخرین استفاده
                        this._updateLastAccessed(cacheStore, key);
                        resolve(item.data);
                    } else if (item) {
                        // حذف آیتم منقضی شده
                        store.delete(key);
                        resolve(null);
                    } else {
                        resolve(null);
                    }
                };
                
                request.onerror = () => resolve(null);
            });
        } catch (error) {
            console.debug('Cache read failed:', error);
            return null;
        }
    }
    
    async _saveToNetworkCache(key, data, options = {}) {
        const cacheStore = HyperDatabase.SCHEMA.STORES.CACHE.name;
        const ttl = options.ttl || 60 * 60 * 1000; // پیش‌فرض ۱ ساعت
        
        try {
            const transaction = this.db.transaction([cacheStore], 'readwrite');
            const store = transaction.objectStore(cacheStore);
            
            const cacheItem = {
                url: key,
                data: data,
                expiresAt: Date.now() + ttl,
                lastUsed: new Date().toISOString(),
                size: JSON.stringify(data).length,
                metadata: options.metadata || {}
            };
            
            store.put(cacheItem);
            
        } catch (error) {
            console.debug('Cache write failed:', error);
        }
    }
    
    async _cleanupOldRecords() {
        // حذف رکوردهای قدیمی Progress (بیش از ۱ سال)
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
        
        const oldProgress = await this.query(
            HyperDatabase.SCHEMA.STORES.PROGRESS.name,
            {
                index: 'by_date',
                range: IDBKeyRange.upperBound(oneYearAgo.toISOString()),
                limit: 500
            }
        );
        
        if (oldProgress.length > 0) {
            console.log(`[HyperDatabase] حذف ${oldProgress.length} رکورد Progress قدیمی`);
            
            const transaction = this.db.transaction(
                [HyperDatabase.SCHEMA.STORES.PROGRESS.name],
                'readwrite'
            );
            
            const store = transaction.objectStore(
                HyperDatabase.SCHEMA.STORES.PROGRESS.name
            );
            
            oldProgress.forEach(record => {
                store.delete([record.userId, record.lessonId, record.exerciseId]);
            });
        }
    }
    
    async _optimizeIndexes() {
        // Index بهینه‌سازی با ایجاد مجدد آنها
        console.log('[HyperDatabase] بهینه‌سازی Indexها...');
        
        // این یک عملیات سنگین است و فقط گاهی باید اجرا شود
        this._emitEvent('maintenance:index_optimization_start');
        
        // TODO: پیاده‌سازی بهینه‌سازی Index
        
        this._emitEvent('maintenance:index_optimization_end');
    }
    
    async _checkStorageQuota() {
        if (navigator.storage && navigator.storage.estimate) {
            try {
                const estimate = await navigator.storage.estimate();
                
                if (estimate.quota && estimate.usage) {
                    const usagePercent = (estimate.usage / estimate.quota) * 100;
                    
                    if (usagePercent > HyperDatabase.SCHEMA.QUOTAS.AUTO_CLEANUP_THRESHOLD * 100) {
                        console.warn(`[HyperDatabase] فضای ذخیره‌سازی ${usagePercent.toFixed(1)}% پر است`);
                        await this.compact();
                    }
                }
            } catch (error) {
                console.debug('Storage estimate failed:', error);
            }
        }
    }
    
    async _estimateSize() {
        let totalSize = 0;
        
        for (const storeConfig of Object.values(HyperDatabase.SCHEMA.STORES)) {
            try {
                const items = await this.query(storeConfig.name, { limit: 1000 });
                
                items.forEach(item => {
                    totalSize += JSON.stringify(item).length;
                });
            } catch (error) {
                console.debug(`Size estimation failed for ${storeConfig.name}:`, error);
            }
        }
        
        return {
            bytes: totalSize,
            readable: this._formatBytes(totalSize),
            stores: Object.keys(HyperDatabase.SCHEMA.STORES).length
        };
    }
    
    async _estimateSavings() {
        // تخمین فضای آزاد شده پس از فشرده‌سازی
        const beforeSize = await this._estimateSize();
        await this.compact();
        const afterSize = await this._estimateSize();
        
        const savings = beforeSize.bytes - afterSize.bytes;
        
        return {
            bytes: savings,
            readable: this._formatBytes(savings),
            percent: beforeSize.bytes > 0 
                ? ((savings / beforeSize.bytes) * 100).toFixed(1) + '%'
                : '0%'
        };
    }
    
    async _updateStatistics(type, data) {
        const today = new Date().toISOString().split('T')[0];
        const statsStore = HyperDatabase.SCHEMA.STORES.STATISTICS.name;
        const key = [type, today];
        
        try {
            const transaction = this.db.transaction([statsStore], 'readwrite');
            const store = transaction.objectStore(statsStore);
            
            // دریافت آمار امروز
            const request = store.get(key);
            
            request.onsuccess = () => {
                const existing = request.result || {
                    type,
                    date: today,
                    count: 0,
                    data: {},
                    updatedAt: new Date().toISOString()
                };
                
                // به‌روزرسانی
                existing.count++;
                existing.data = { ...existing.data, ...data };
                existing.updatedAt = new Date().toISOString();
                
                store.put(existing);
            };
        } catch (error) {
            console.debug('Statistics update failed:', error);
        }
    }
    
    async _logBackup(type, status, metadata = {}) {
        const backupStore = HyperDatabase.SCHEMA.STORES.BACKUP.name;
        const timestamp = new Date().toISOString();
        
        try {
            const transaction = this.db.transaction([backupStore], 'readwrite');
            const store = transaction.objectStore(backupStore);
            
            const logEntry = {
                type,
                status,
                timestamp,
                metadata: {
                    ...metadata,
                    dbVersion: this.config.VERSION,
                    userAgent: navigator.userAgent
                }
            };
            
            store.put(logEntry);
        } catch (error) {
            console.error('Backup log failed:', error);
        }
    }
    
    _emitEvent(eventName, detail = {}) {
        const event = new CustomEvent(eventName, { detail });
        this.events.dispatchEvent(event);
    }
    
    _processPendingOperations() {
        if (this.pendingOperations.length > 0) {
            console.log(`[HyperDatabase] پردازش ${this.pendingOperations.length} عملیات معلق`);
            
            this.pendingOperations.forEach(operation => {
                try {
                    operation();
                } catch (error) {
                    console.warn('Pending operation failed:', error);
                }
            });
            
            this.pendingOperations = [];
        }
    }
    
    _encryptData(data) {
        if (!this.encryptionEnabled || !this.config.ENCRYPTION_KEY) {
            return data;
        }
        
        try {
            return CryptoJS.AES.encrypt(
                JSON.stringify(data),
                this.config.ENCRYPTION_KEY
            ).toString();
        } catch (error) {
            console.error('Encryption failed:', error);
            return data;
        }
    }
    
    _decryptData(encryptedData) {
        if (!this.encryptionEnabled || !this.config.ENCRYPTION_KEY) {
            return encryptedData;
        }
        
        try {
            const bytes = CryptoJS.AES.decrypt(
                encryptedData,
                this.config.ENCRYPTION_KEY
            );
            
            return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
        } catch (error) {
            console.error('Decryption failed:', error);
            return encryptedData;
        }
    }
    
    _formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);
        
        if (days > 0) return `${days} روز`;
        if (hours > 0) return `${hours} ساعت`;
        if (minutes > 0) return `${minutes} دقیقه`;
        return `${seconds} ثانیه`;
    }
    
    _formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    _convertToCSV(data) {
        const rows = [];
        
        const flatten = (obj, prefix = '') => {
            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    flatten(value, `${prefix}${key}.`);
                } else {
                    rows.push(`"${prefix}${key}","${value}"`);
                }
            }
        };
        
        rows.push('"Path","Value"');
        flatten(data);
        
        return rows.join('\n');
    }
}

// Export برای استفاده جهانی
if (typeof window !== 'undefined') {
    window.HyperDatabase = HyperDatabase;
}

// Hook برای خطاهای IndexedDB
if (typeof window !== 'undefined') {
    window.addEventListener('error', (event) => {
        if (event.error && event.error.name === 'NotFoundError') {
            console.error('IndexedDB error caught:', event.error);
        }
    });
}

console.log('[HyperDatabase] ماژول دیتابیس بارگذاری شد');
