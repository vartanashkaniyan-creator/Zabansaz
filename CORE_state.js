// ==================== CORE_state.js ====================
// سیستم مدیریت وضعیت صنعتی با Patternهای Observer و Singleton
// نسخه: 2.0.0 | تاریخ: ۱۴۰۳/۰۲/۱۵

'use strict';

class HyperState {
    // الگوی Singleton برای یک Instance واحد در کل برنامه
    static #instance = null;
    
    // Event Types برای سیستم Observer
    static EVENTS = {
        LANGUAGE_CHANGED: 'language_changed',
        LEVEL_CHANGED: 'level_changed',
        LESSON_STARTED: 'lesson_started',
        LESSON_COMPLETED: 'lesson_completed',
        EXERCISE_SUBMITTED: 'exercise_submitted',
        PROGRESS_UPDATED: 'progress_updated',
        USER_AUTH_CHANGED: 'user_auth_changed',
        SYNC_STATUS_CHANGED: 'sync_status_changed',
        THEME_CHANGED: 'theme_changed',
        OFFLINE_STATUS_CHANGED: 'offline_status_changed'
    };
    
    constructor(dbInstance = null) {
        if (HyperState.#instance) {
            return HyperState.#instance;
        }
        
        if (!dbInstance) {
            throw new Error('[HyperState] نمونه دیتابیس الزامی است');
        }
        
        this.db = dbInstance;
        this.listeners = new Map();
        this.cache = new Map();
        this.initialized = false;
        this.migrationVersion = 3;
        
        // State Schema اصلی
        this.state = {
            // کاربر
            user: {
                id: null,
                email: null,
                username: 'کاربر مهمان',
                avatar: null,
                isGuest: true,
                isPremium: false,
                subscriptionEnd: null,
                createdAt: null,
                lastLogin: new Date().toISOString()
            },
            
            // زبان و سطح
            language: {
                current: 'en',
                available: ['en', 'fa'],
                direction: 'ltr',
                lastChanged: null
            },
            
            // پیشرفت آموزشی
            progress: {
                currentLesson: { lang: 'en', level: 'beginner', id: 1 },
                completedLessons: new Set(),
                completedExercises: new Map(),
                scores: new Map(),
                totalStudyTime: 0,
                streakDays: 0,
                lastStudyDate: null,
                accuracyRate: 0
            },
            
            // سیستم
            system: {
                theme: 'dark',
                fontSize: 'medium',
                audioEnabled: true,
                notifications: true,
                autoPlay: false,
                downloadQuality: 'high',
                studyGoal: 30, // دقیقه
                isOnline: true,
                lastSync: null,
                syncPending: false
            },
            
            // کش جلسه
            session: {
                currentPage: '/',
                navigationHistory: [],
                tempData: new Map(),
                unsavedChanges: false,
                sessionStart: new Date().toISOString(),
                actionsLog: []
            },
            
            // آنالیتیکس
            analytics: {
                pageViews: new Map(),
                interactionCount: 0,
                errors: [],
                performanceMetrics: []
            },
            
            // متادیتا
            meta: {
                version: '1.0.0',
                initializedAt: new Date().toISOString(),
                lastModified: new Date().toISOString(),
                migrationVersion: this.migrationVersion
            }
        };
        
        // Private properties
        this._stateProxy = this._createStateProxy();
        this._batchUpdates = [];
        this._isBatching = false;
        
        HyperState.#instance = this;
        console.log('[HyperState] نمونه ایجاد شد');
    }
    
    // ==================== PUBLIC API ====================
    
    async init() {
        if (this.initialized) return this;
        
        try {
            console.log('[HyperState] شروع راه‌اندازی...');
            
            // 1. بارگذاری از دیتابیس
            await this._loadFromDatabase();
            
            // 2. اجرای Migration اگر نیاز باشد
            await this._runMigrations();
            
            // 3. همگام‌سازی اولیه با سرور
            await this._initialSync();
            
            // 4. راه‌اندازی سیستم رویداد
            this._setupEventSystem();
            
            // 5. شروع مانیتورینگ
            this._startMonitoring();
            
            this.initialized = true;
            this._emit(HyperState.EVENTS.SYNC_STATUS_CHANGED, { 
                status: 'ready',
                timestamp: new Date().toISOString()
            });
            
            console.log('[HyperState] راه‌اندازی کامل شد:', this.state.meta);
            return this;
            
        } catch (error) {
            console.error('[HyperState] خطا در راه‌اندازی:', error);
            throw new Error(`State initialization failed: ${error.message}`);
        }
    }
    
    // ==================== STATE GETTERS ====================
    
    get currentUser() {
        return { ...this.state.user };
    }
    
    get currentLanguage() {
        return this.state.language.current;
    }
    
    get currentProgress() {
        return { 
            ...this.state.progress,
            completedLessons: Array.from(this.state.progress.completedLessons),
            completedExercises: Object.fromEntries(this.state.progress.completedExercises),
            scores: Object.fromEntries(this.state.progress.scores)
        };
    }
    
    get systemSettings() {
        return { ...this.state.system };
    }
    
    get isOnline() {
        return this.state.system.isOnline;
    }
    
    get needsSync() {
        return this.state.system.syncPending;
    }
    
    // ==================== STATE MUTATORS ====================
    
    async setLanguage(langCode) {
        if (!this.state.language.available.includes(langCode)) {
            throw new Error(`زبان ${langCode} پشتیبانی نمی‌شود`);
        }
        
        const oldLang = this.state.language.current;
        
        await this._batchUpdate('language', {
            current: langCode,
            direction: langCode === 'fa' || langCode === 'ar' ? 'rtl' : 'ltr',
            lastChanged: new Date().toISOString()
        });
        
        this._emit(HyperState.EVENTS.LANGUAGE_CHANGED, {
            from: oldLang,
            to: langCode,
            direction: this.state.language.direction
        });
        
        return true;
    }
    
    async startLesson(lessonData) {
        const { lang, level, id } = lessonData;
        const lessonKey = `${lang}_${level}_${id}`;
        
        await this._batchUpdate('progress', {
            currentLesson: { lang, level, id }
        });
        
        this.state.session.actionsLog.push({
            type: 'lesson_start',
            lessonKey,
            timestamp: new Date().toISOString()
        });
        
        this._emit(HyperState.EVENTS.LESSON_STARTED, {
            lesson: lessonData,
            user: this.state.user.id,
            timestamp: new Date().toISOString()
        });
        
        return lessonKey;
    }
    
    async completeLesson(lessonKey, score = 100, timeSpent = 0) {
        if (!lessonKey) return false;
        
        // اضافه کردن به دروس تکمیل‌شده
        this.state.progress.completedLessons.add(lessonKey);
        
        // به‌روزرسانی امتیاز
        this.state.progress.scores.set(lessonKey, score);
        
        // محاسبه زمان مطالعه
        this.state.progress.totalStudyTime += timeSpent;
        
        // به‌روزرسانی تاریخ آخرین مطالعه
        this.state.progress.lastStudyDate = new Date().toISOString();
        
        // محاسبه استریک
        this._updateStreak();
        
        // محاسبه نرخ دقت
        this._calculateAccuracyRate();
        
        await this._batchUpdate('progress', this.state.progress);
        
        this._emit(HyperState.EVENTS.LESSON_COMPLETED, {
            lessonKey,
            score,
            timeSpent,
            totalCompleted: this.state.progress.completedLessons.size,
            totalStudyTime: this.state.progress.totalStudyTime
        });
        
        // علامت‌گذاری برای همگام‌سازی
        this.state.system.syncPending = true;
        
        return true;
    }
    
    async submitExercise(lessonKey, exerciseId, userAnswer, isCorrect, points) {
        const exerciseKey = `${lessonKey}_ex_${exerciseId}`;
        
        // ذخیره پاسخ
        this.state.progress.completedExercises.set(exerciseKey, {
            userAnswer,
            isCorrect,
            points: isCorrect ? points : 0,
            submittedAt: new Date().toISOString(),
            attempts: 1
        });
        
        // لاگ اکشن
        this.state.session.actionsLog.push({
            type: 'exercise_submit',
            exerciseKey,
            isCorrect,
            points,
            timestamp: new Date().toISOString()
        });
        
        await this._batchUpdate('progress', this.state.progress);
        
        this._emit(HyperState.EVENTS.EXERCISE_SUBMITTED, {
            exerciseKey,
            isCorrect,
            points: isCorrect ? points : 0,
            totalExercises: this.state.progress.completedExercises.size
        });
        
        return isCorrect;
    }
    
    async updateUserProfile(userData) {
        const oldUser = { ...this.state.user };
        
        await this._batchUpdate('user', {
            ...oldUser,
            ...userData,
            lastLogin: new Date().toISOString()
        });
        
        this._emit(HyperState.EVENTS.USER_AUTH_CHANGED, {
            oldUser,
            newUser: this.state.user,
            isProfileUpdate: true
        });
        
        return this.state.user;
    }
    
    async setSystemSetting(key, value) {
        if (!(key in this.state.system)) {
            throw new Error(`تنظیم ${key} وجود ندارد`);
        }
        
        const oldValue = this.state.system[key];
        
        await this._batchUpdate('system', {
            [key]: value
        });
        
        // ارسال رویداد خاص برای تغییرات مهم
        if (key === 'theme') {
            this._emit(HyperState.EVENTS.THEME_CHANGED, {
                from: oldValue,
                to: value
            });
        } else if (key === 'isOnline') {
            this._emit(HyperState.EVENTS.OFFLINE_STATUS_CHANGED, {
                isOnline: value,
                timestamp: new Date().toISOString()
            });
        }
        
        return true;
    }
    
    // ==================== EVENT SYSTEM ====================
    
    on(eventType, callback, options = {}) {
        if (!Object.values(HyperState.EVENTS).includes(eventType)) {
            throw new Error(`رویداد ${eventType} معتبر نیست`);
        }
        
        if (!this.listeners.has(eventType)) {
            this.listeners.set(eventType, new Set());
        }
        
        const listenerId = Symbol('listener');
        this.listeners.get(eventType).add({
            id: listenerId,
            callback,
            once: options.once || false,
            priority: options.priority || 0
        });
        
        return () => this.off(eventType, listenerId);
    }
    
    off(eventType, listenerId) {
        if (!this.listeners.has(eventType)) return false;
        
        const listeners = this.listeners.get(eventType);
        for (const listener of listeners) {
            if (listener.id === listenerId) {
                listeners.delete(listener);
                return true;
            }
        }
        
        return false;
    }
    
    // ==================== PERSISTENCE ====================
    
    async save() {
        try {
            if (!this.initialized) return false;
            
            // تبدیل Set و Map به Array و Object برای ذخیره‌سازی
            const stateToSave = {
                ...this.state,
                progress: {
                    ...this.state.progress,
                    completedLessons: Array.from(this.state.progress.completedLessons),
                    completedExercises: Object.fromEntries(this.state.progress.completedExercises),
                    scores: Object.fromEntries(this.state.progress.scores)
                },
                analytics: {
                    ...this.state.analytics,
                    pageViews: Object.fromEntries(this.state.analytics.pageViews),
                    errors: [...this.state.analytics.errors],
                    performanceMetrics: [...this.state.analytics.performanceMetrics]
                },
                session: {
                    ...this.state.session,
                    tempData: Object.fromEntries(this.state.session.tempData),
                    actionsLog: [...this.state.session.actionsLog]
                },
                meta: {
                    ...this.state.meta,
                    lastModified: new Date().toISOString()
                }
            };
            
            // ذخیره در دیتابیس
            await this.db.saveState(stateToSave);
            
            // پاک کردن فلگ sync اگر آفلاین نیستیم
            if (this.state.system.isOnline) {
                this.state.system.syncPending = false;
                this.state.system.lastSync = new Date().toISOString();
            }
            
            console.log('[HyperState] وضعیت ذخیره شد');
            return true;
            
        } catch (error) {
            console.error('[HyperState] خطا در ذخیره وضعیت:', error);
            this.state.analytics.errors.push({
                type: 'save_error',
                message: error.message,
                timestamp: new Date().toISOString()
            });
            return false;
        }
    }
    
    async syncWithServer() {
        if (!this.state.system.isOnline) {
            console.warn('[HyperState] دستگاه آفلاین است - همگام‌سازی انجام نشد');
            return false;
        }
        
        try {
            this._emit(HyperState.EVENTS.SYNC_STATUS_CHANGED, {
                status: 'syncing',
                timestamp: new Date().toISOString()
            });
            
            // اینجا منطق همگام‌سازی با سرور قرار می‌گیرد
            // برای مثال:
            // const response = await fetch('/api/sync', {
            //     method: 'POST',
            //     body: JSON.stringify(this.state)
            // });
            
            // شبیه‌سازی تاخیر شبکه
            await new Promise(resolve => setTimeout(resolve, 500));
            
            this.state.system.syncPending = false;
            this.state.system.lastSync = new Date().toISOString();
            
            await this.save();
            
            this._emit(HyperState.EVENTS.SYNC_STATUS_CHANGED, {
                status: 'synced',
                timestamp: new Date().toISOString()
            });
            
            console.log('[HyperState] همگام‌سازی با سرور انجام شد');
            return true;
            
        } catch (error) {
            console.error('[HyperState] خطا در همگام‌سازی:', error);
            
            this._emit(HyperState.EVENTS.SYNC_STATUS_CHANGED, {
                status: 'error',
                error: error.message,
                timestamp: new Date().toISOString()
            });
            
            return false;
        }
    }
    
    // ==================== UTILITIES ====================
    
    getStats() {
        return {
            user: {
                isGuest: this.state.user.isGuest,
                isPremium: this.state.user.isPremium,
                studyDays: this._calculateStudyDays()
            },
            progress: {
                totalLessons: this.state.progress.completedLessons.size,
                totalExercises: this.state.progress.completedExercises.size,
                totalStudyTime: this._formatTime(this.state.progress.totalStudyTime),
                averageScore: this._calculateAverageScore(),
                streakDays: this.state.progress.streakDays,
                accuracyRate: `${this.state.progress.accuracyRate}%`
            },
            system: {
                currentLanguage: this.state.language.current,
                theme: this.state.system.theme,
                isOnline: this.state.system.isOnline,
                lastSync: this.state.system.lastSync,
                syncPending: this.state.system.syncPending
            },
            meta: {
                version: this.state.meta.version,
                initializedAt: this.state.meta.initializedAt,
                lastModified: this.state.meta.lastModified
            }
        };
    }
    
    resetProgress() {
        return this._confirmAndReset();
    }
    
    exportData(format = 'json') {
        const data = this.getStats();
        
        switch(format) {
            case 'json':
                return JSON.stringify(data, null, 2);
            case 'csv':
                return this._convertToCSV(data);
            case 'html':
                return this._convertToHTML(data);
            default:
                return JSON.stringify(data);
        }
    }
    
    // ==================== PRIVATE METHODS ====================
    
    _createStateProxy() {
        const self = this;
        
        return new Proxy(this.state, {
            set(target, property, value) {
                const oldValue = target[property];
                target[property] = value;
                
                // به‌روزرسانی تاریخ تغییر
                target.meta.lastModified = new Date().toISOString();
                
                // علامت‌گذاری برای ذخیره‌سازی خودکار
                if (!self._isBatching) {
                    setTimeout(() => self.save(), 1000);
                }
                
                // ثبت در لاگ تغییرات
                self.state.session.actionsLog.push({
                    type: 'state_change',
                    property,
                    oldValue,
                    newValue: value,
                    timestamp: new Date().toISOString()
                });
                
                return true;
            },
            
            get(target, property) {
                // ثبت آنالیتیکس برای دسترسی‌ها
                if (property !== 'meta' && property !== 'analytics') {
                    self.state.analytics.interactionCount++;
                }
                
                return target[property];
            }
        });
    }
    
    async _loadFromDatabase() {
        try {
            const savedState = await this.db.getState();
            
            if (savedState) {
                // بازیابی Set و Map از داده‌های ذخیره‌شده
                savedState.progress.completedLessons = new Set(savedState.progress.completedLessons || []);
                savedState.progress.completedExercises = new Map(
                    Object.entries(savedState.progress.completedExercises || {})
                );
                savedState.progress.scores = new Map(
                    Object.entries(savedState.progress.scores || {})
                );
                
                savedState.analytics.pageViews = new Map(
                    Object.entries(savedState.analytics.pageViews || {})
                );
                
                savedState.session.tempData = new Map(
                    Object.entries(savedState.session.tempData || {})
                );
                
                this.state = { ...this.state, ...savedState };
                console.log('[HyperState] وضعیت از دیتابیس بارگذاری شد');
            }
            
        } catch (error) {
            console.warn('[HyperState] خطا در بارگذاری از دیتابیس:', error);
            // استفاده از حالت پیش‌فرض
        }
    }
    
    async _runMigrations() {
        const currentVersion = this.state.meta.migrationVersion || 0;
        
        if (currentVersion >= this.migrationVersion) {
            return;
        }
        
        console.log(`[HyperState] اجرای Migration از نسخه ${currentVersion} به ${this.migrationVersion}`);
        
        // Migration 1 to 2
        if (currentVersion < 2) {
            this.state.progress.streakDays = this._calculateInitialStreak();
            this.state.progress.accuracyRate = this._calculateInitialAccuracy();
        }
        
        // Migration 2 to 3
        if (currentVersion < 3) {
            this.state.system.studyGoal = 30;
            this.state.system.downloadQuality = 'high';
        }
        
        this.state.meta.migrationVersion = this.migrationVersion;
        await this.save();
        
        console.log('[HyperState] Migration اجرا شد');
    }
    
    async _initialSync() {
        // شبیه‌سازی همگام‌سازی اولیه
        this.state.system.lastSync = new Date().toISOString();
        this.state.system.syncPending = false;
    }
    
    _setupEventSystem() {
        // تنظیم شنونده‌های داخلی
        this.on(HyperState.EVENTS.LESSON_COMPLETED, async (data) => {
            this.state.analytics.pageViews.set(
                `lesson_complete_${data.lessonKey}`,
                (this.state.analytics.pageViews.get(`lesson_complete_${data.lessonKey}`) || 0) + 1
            );
            
            // ذخیره‌سازی خودکار پس از اتمام درس
            setTimeout(() => this.save(), 2000);
        }, { priority: 1 });
        
        // مانیتورینگ وضعیت آنلاین
        window.addEventListener('online', () => {
            this.setSystemSetting('isOnline', true);
        });
        
        window.addEventListener('offline', () => {
            this.setSystemSetting('isOnline', false);
        });
    }
    
    _startMonitoring() {
        // مانیتورینگ عملکرد
        const monitorInterval = setInterval(() => {
            if (!this.initialized) {
                clearInterval(monitorInterval);
                return;
            }
            
            const memory = performance.memory;
            this.state.analytics.performanceMetrics.push({
                timestamp: new Date().toISOString(),
                memory: memory ? {
                    usedJSHeapSize: memory.usedJSHeapSize,
                    totalJSHeapSize: memory.totalJSHeapSize
                } : null,
                interactionCount: this.state.analytics.interactionCount
            });
            
            // حفظ اندازه لاگ‌ها
            if (this.state.analytics.performanceMetrics.length > 100) {
                this.state.analytics.performanceMetrics.shift();
            }
            
            if (this.state.session.actionsLog.length > 200) {
                this.state.session.actionsLog = this.state.session.actionsLog.slice(-200);
            }
            
        }, 30000); // هر ۳۰ ثانیه
    }
    
    async _batchUpdate(section, updates) {
        if (!this._isBatching) {
            this._isBatching = true;
            this._batchUpdates = [];
        }
        
        this._batchUpdates.push({ section, updates });
        
        // اعمال به‌روزرسانی‌ها
        if (section in this.state) {
            Object.assign(this.state[section], updates);
        }
        
        // ذخیره‌سازی با تاخیر
        clearTimeout(this._batchTimeout);
        this._batchTimeout = setTimeout(async () => {
            await this.save();
            this._isBatching = false;
            this._batchUpdates = [];
        }, 500);
    }
    
    _emit(eventType, data) {
        if (!this.listeners.has(eventType)) return;
        
        const listeners = Array.from(this.listeners.get(eventType))
            .sort((a, b) => b.priority - a.priority);
        
        for (const listener of listeners) {
            try {
                listener.callback(data);
                
                if (listener.once) {
                    this.off(eventType, listener.id);
                }
            } catch (error) {
                console.error(`[HyperState] خطا در اجرای شنونده ${eventType}:`, error);
            }
        }
    }
    
    _updateStreak() {
        const today = new Date().toISOString().split('T')[0];
        const lastStudy = this.state.progress.lastStudyDate?.split('T')[0];
        
        if (lastStudy === today) {
            // امروز قبلاً مطالعه شده
            return;
        }
        
        const yesterday = new Date();
        yesterday.setDate(yesterday.getDate() - 1);
        const yesterdayStr = yesterday.toISOString().split('T')[0];
        
        if (lastStudy === yesterdayStr) {
            // مطالعه دیروز → افزایش استریک
            this.state.progress.streakDays++;
        } else if (lastStudy && lastStudy < yesterdayStr) {
            // وقفه در مطالعه → بازنشانی استریک
            this.state.progress.streakDays = 1;
        } else {
            // اولین مطالعه
            this.state.progress.streakDays = 1;
        }
    }
    
    _calculateAccuracyRate() {
        const exercises = Array.from(this.state.progress.completedExercises.values());
        if (exercises.length === 0) return 0;
        
        const correct = exercises.filter(ex => ex.isCorrect).length;
        this.state.progress.accuracyRate = Math.round((correct / exercises.length) * 100);
    }
    
    _calculateAverageScore() {
        const scores = Array.from(this.state.progress.scores.values());
        if (scores.length === 0) return 0;
        
        return Math.round(
            scores.reduce((sum, score) => sum + score, 0) / scores.length
        );
    }
    
    _calculateStudyDays() {
        const dates = new Set();
        
        // از لاگ‌های درس‌های تکمیل‌شده
        for (const lessonKey of this.state.progress.completedLessons) {
            // استخراج تاریخ از lessonKey یا استفاده از timestamp
            dates.add(new Date().toISOString().split('T')[0]);
        }
        
        return dates.size;
    }
    
    _formatTime(minutes) {
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        
        if (hours > 0) {
            return `${hours} ساعت و ${mins} دقیقه`;
        }
        return `${mins} دقیقه`;
    }
    
    _calculateInitialStreak() {
        // منطق اولیه برای محاسبه استریک از تاریخچه
        return 1;
    }
    
    _calculateInitialAccuracy() {
        const exercises = Array.from(this.state.progress.completedExercises.values());
        if (exercises.length === 0) return 0;
        
        const correct = exercises.filter(ex => ex.isCorrect).length;
        return Math.round((correct / exercises.length) * 100);
    }
    
    async _confirmAndReset() {
        // برای محیط تولید، باید تایید کاربر گرفته شود
        if (typeof window !== 'undefined' && window.confirm) {
            const confirmed = confirm('آیا مطمئن هستید؟ تمام پیشرفت شما پاک خواهد شد.');
            if (!confirmed) return false;
        }
        
        // بازنشانی به حالت اولیه
        this.state.progress = {
            currentLesson: { lang: 'en', level: 'beginner', id: 1 },
            completedLessons: new Set(),
            completedExercises: new Map(),
            scores: new Map(),
            totalStudyTime: 0,
            streakDays: 0,
            lastStudyDate: null,
            accuracyRate: 0
        };
        
        await this.save();
        console.log('[HyperState] پیشرفت بازنشانی شد');
        
        return true;
    }
    
    _convertToCSV(data) {
        const lines = [];
        
        // هدر
        lines.push('Category,Key,Value');
        
        // داده‌های تودرتو
        const flatten = (obj, prefix = '') => {
            for (const [key, value] of Object.entries(obj)) {
                if (typeof value === 'object' && value !== null) {
                    flatten(value, `${prefix}${key}.`);
                } else {
                    lines.push(`${prefix.slice(0, -1)},${key},"${value}"`);
                }
            }
        };
        
        flatten(data);
        return lines.join('\n');
    }
    
    _convertToHTML(data) {
        return `
            <!DOCTYPE html>
            <html>
            <head>
                <title>HyperLang Export</title>
                <style>
                    body { font-family: Arial, sans-serif; margin: 20px; }
                    table { border-collapse: collapse; width: 100%; }
                    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
                    th { background-color: #f2f2f2; }
                </style>
            </head>
            <body>
                <h1>HyperLang Progress Report</h1>
                <p>Generated: ${new Date().toISOString()}</p>
                <pre>${JSON.stringify(data, null, 2)}</pre>
            </body>
            </html>
        `;
    }
}

// Export برای استفاده در ماژول‌های دیگر
if (typeof window !== 'undefined') {
    window.HyperState = HyperState;
}

// برای محیط‌های ماژولار
if (typeof module !== 'undefined' && module.exports) {
    module.exports = HyperState;
}

console.log('[HyperState] ماژول حالت بارگذاری شد');t
