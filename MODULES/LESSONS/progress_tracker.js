/**
 * VAKAMOVA PROGRESS TRACKER - سیستم ردیابی پیشرفت حرفه‌ای
 * اصول: ۱. تزریق وابستگی ۲. قرارداد رابط ۳. رویدادمحور ۴. پیکربندی متمرکز
 */

class ProgressTracker {
    constructor(dependencies = {}, config = {}) {
        // اصل ۱: تزریق وابستگی
        this.deps = {
            eventBus: dependencies.eventBus || window.eventBus,
            stateManager: dependencies.stateManager || window.stateManager,
            database: dependencies.database || window.database,
            apiClient: dependencies.apiClient || window.apiClient,
            utils: dependencies.utils || window.utils,
            analytics: dependencies.analytics || null,
            ...dependencies
        };
        
        // اصل ۴: پیکربندی متمرکز
        this.config = Object.freeze({
            // تنظیمات محاسبات
            calculations: {
                masteryThreshold: config.masteryThreshold || 0.85,
                streakDecayRate: config.streakDecayRate || 0.1,
                weightAccuracy: config.weightAccuracy || 0.4,
                weightConsistency: config.weightConsistency || 0.3,
                weightSpeed: config.weightSpeed || 0.3,
                minDataPoints: config.minDataPoints || 5,
                ...config.calculations
            },
            
            // تنظیمات milestones
            milestones: {
                lessonsCompleted: [5, 10, 25, 50, 100, 250, 500],
                streakDays: [3, 7, 14, 30, 60, 90, 180, 365],
                totalMinutes: [100, 500, 1000, 5000, 10000, 25000, 50000],
                accuracyThresholds: [0.5, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95],
                ...config.milestones
            },
            
            // تنظیمات leveling
            levels: {
                xpPerLevel: config.xpPerLevel || [100, 250, 500, 1000, 2000, 4000, 8000, 15000, 30000, 50000],
                levelNames: config.levelNames || ['مبتدی', 'آموزنده', 'دانشجو', 'متخصص', 'استاد', 'راهنما', 'استاد بزرگ'],
                xpMultipliers: {
                    lesson: 1.0,
                    exercise: 0.5,
                    practice: 0.3,
                    review: 0.7,
                    ...config.xpMultipliers
                },
                ...config.levels
            },
            
            // تنظیمات daily goals
            dailyGoals: {
                defaultMinutes: config.defaultMinutes || 30,
                adaptiveGoal: config.adaptiveGoal ?? true,
                minDailyGoal: config.minDailyGoal || 10,
                maxDailyGoal: config.maxDailyGoal || 120,
                goalAdjustmentRate: config.goalAdjustmentRate || 0.1,
                ...config.dailyGoals
            },
            
            // تنظیمات رویدادها
            events: {
                PROGRESS_UPDATED: 'progress:updated',
                MILESTONE_REACHED: 'milestone:reached',
                STREAK_UPDATED: 'streak:updated',
                LEVEL_UP: 'level:up',
                DAILY_GOAL_COMPLETED: 'daily:goal:completed',
                SYNC_STARTED: 'progress:sync:started',
                SYNC_COMPLETED: 'progress:sync:completed',
                SYNC_FAILED: 'progress:sync:failed',
                ...config.events
            },
            
            // تنظیمات ذخیره‌سازی
            storage: {
                autoSaveInterval: config.autoSaveInterval || 30000,
                maxLocalEntries: config.maxLocalEntries || 1000,
                enableOfflineSync: config.enableOfflineSync ?? true,
                syncBatchSize: config.syncBatchSize || 50,
                ...config.storage
            },
            
            ...config
        });
        
        // حالت داخلی
        this.state = {
            isInitialized: false,
            currentProgress: {
                userId: null,
                overallStats: {},
                languageStats: {},
                dailyStats: {},
                streak: 0,
                level: 1,
                xp: 0,
                nextLevelXp: this.config.levels.xpPerLevel[0] || 100
            },
            pendingUpdates: [],
            lastSyncTime: null,
            syncInProgress: false,
            timers: new Map(),
            eventSubscriptions: new Map()
        };
        
        // کش‌های موقت
        this.cache = {
            progressData: new Map(),
            milestonesCache: new Map(),
            analyticsCache: new Map()
        };
        
        // Bind methods
        this.init = this.init.bind(this);
        this.trackActivity = this.trackActivity.bind(this);
        this.getProgressReport = this.getProgressReport.bind(this);
        this.resetProgress = this.resetProgress.bind(this);
        this.cleanup = this.cleanup.bind(this);
        
        console.log('[ProgressTracker] ✅ Initialized with dependency injection');
    }
    
    // ==================== CORE API ====================
    
    async init(userId, options = {}) {
        if (this.state.isInitialized) {
            console.warn('[ProgressTracker] Already initialized');
            return { success: true, initialized: true };
        }
        
        try {
            this.state.currentProgress.userId = userId;
            
            // بارگذاری داده‌های موجود
            await this._loadExistingProgress(userId, options);
            
            // راه‌اندازی listeners
            this._setupEventListeners();
            
            // راه‌اندازی تایمرهای دوره‌ای
            this._setupPeriodicTimers();
            
            // همگام‌سازی اولیه
            if (this.config.storage.enableOfflineSync) {
                await this._syncWithServer();
            }
            
            this.state.isInitialized = true;
            
            this.deps.utils?.log('[ProgressTracker] Initialized for user:', userId);
            
            return {
                success: true,
                userId,
                initialStats: this.state.currentProgress.overallStats
            };
            
        } catch (error) {
            console.error('[ProgressTracker] Init failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    async trackActivity(activityData) {
        if (!this.state.isInitialized) {
            return { success: false, error: 'Not initialized' };
        }
        
        try {
            // اعتبارسنجی
            const validation = this._validateActivityData(activityData);
            if (!validation.valid) {
                throw new Error(`Invalid data: ${validation.errors.join(', ')}`);
            }
            
            const activity = validation.data;
            const timestamp = Date.now();
            
            // پردازش
            const processed = await this._processActivity(activity, timestamp);
            
            // به‌روزرسانی آمار
            const statsUpdate = await this._updateStats(processed);
            
            // بررسی milestones
            const milestones = await this._checkMilestones();
            
            // به‌روزرسانی level و XP
            const levelUpdate = await this._updateLevelAndXP(processed);
            
            // به‌روزرسانی streak
            const streakUpdate = await this._updateStreak(timestamp);
            
            // ذخیره موقت
            this.state.pendingUpdates.push({
                activity: processed,
                timestamp,
                statsSnapshot: { ...this.state.currentProgress.overallStats }
            });
            
            // انتشار رویداد
            this._emitEvent(this.config.events.PROGRESS_UPDATED, {
                userId: this.state.currentProgress.userId,
                activity: processed,
                updatedStats: this.state.currentProgress.overallStats,
                timestamp,
                milestones: milestones.reached,
                levelUpdate,
                streakUpdate
            });
            
            // گزارش milestones
            if (milestones.reached.length > 0) {
                milestones.reached.forEach(milestone => {
                    this._emitEvent(this.config.events.MILESTONE_REACHED, milestone);
                });
            }
            
            // گزارش level up
            if (levelUpdate.leveledUp) {
                this._emitEvent(this.config.events.LEVEL_UP, levelUpdate);
            }
            
            // گزارش streak
            if (streakUpdate.updated) {
                this._emitEvent(this.config.events.STREAK_UPDATED, streakUpdate);
            }
            
            // بررسی daily goal
            const dailyGoal = await this._checkDailyGoal(timestamp);
            if (dailyGoal.completed) {
                this._emitEvent(this.config.events.DAILY_GOAL_COMPLETED, dailyGoal);
            }
            
            return {
                success: true,
                activity: processed,
                stats: this.state.currentProgress.overallStats,
                milestones: milestones.reached,
                levelUpdate,
                streakUpdate,
                dailyGoal
            };
            
        } catch (error) {
            console.error('[ProgressTracker] Track activity failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    async getProgressReport(options = {}) {
        if (!this.state.isInitialized) {
            return { success: false, error: 'Not initialized' };
        }
        
        try {
            const { language = 'all', timeframe = 'all', detailed = false } = options;
            
            // بررسی کش
            const cacheKey = `${this.state.currentProgress.userId}_${language}_${timeframe}`;
            const cached = this.cache.progressData.get(cacheKey);
            
            if (cached && (Date.now() - cached.timestamp < 60000)) {
                return {
                    success: true,
                    report: cached.report,
                    fromCache: true
                };
            }
            
            // محاسبه
            const report = await this._generateProgressReport(language, timeframe, detailed);
            
            // ذخیره در کش
            this.cache.progressData.set(cacheKey, {
                report,
                timestamp: Date.now()
            });
            
            return { success: true, report };
            
        } catch (error) {
            console.error('[ProgressTracker] Get report failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    async resetProgress(options = {}) {
        try {
            const { preserveData = false, backupBeforeReset = true } = options;
            const userId = this.state.currentProgress.userId;
            
            // Backup
            if (backupBeforeReset) {
                await this._createBackup();
            }
            
            // Reset state
            this.state.currentProgress = {
                userId,
                overallStats: this._initializeStats(),
                languageStats: {},
                dailyStats: {},
                streak: 0,
                level: 1,
                xp: 0,
                nextLevelXp: this.config.levels.xpPerLevel[0] || 100
            };
            
            // پاک‌سازی
            this.state.pendingUpdates = [];
            this.cache.progressData.clear();
            this.cache.milestonesCache.clear();
            this.cache.analyticsCache.clear();
            
            // پاک‌سازی storage
            if (!preserveData) {
                await this._clearStorage();
            }
            
            console.log('[ProgressTracker] Progress reset for user:', userId);
            
            return { success: true, userId };
            
        } catch (error) {
            console.error('[ProgressTracker] Reset failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ==================== PRIVATE METHODS ====================
    
    async _loadExistingProgress(userId, options) {
        try {
            // از State Manager
            const stateData = this.deps.stateManager?.get(`progress.${userId}`);
            if (stateData) {
                this.state.currentProgress = this._mergeProgress(stateData);
                return;
            }
            
            // از Database
            if (this.deps.database) {
                const dbData = await this.deps.database.getUserProgress(userId);
                if (dbData) {
                    this.state.currentProgress = this._mergeProgress(dbData);
                    return;
                }
            }
            
            // مقداردهی اولیه
            this.state.currentProgress.overallStats = this._initializeStats();
            
        } catch (error) {
            console.warn('[ProgressTracker] Load progress failed:', error);
            this.state.currentProgress.overallStats = this._initializeStats();
        }
    }
    
    _setupEventListeners() {
        if (!this.deps.eventBus) return;
        
        const events = ['lesson:completed', 'exercise:completed', 'lesson:started'];
        
        events.forEach(eventName => {
            const unsubscribe = this.deps.eventBus.on(eventName, (data) => {
                this._handleLearningEvent(eventName, data);
            });
            
            this.state.eventSubscriptions.set(eventName, unsubscribe);
        });
    }
    
    _setupPeriodicTimers() {
        // Auto-save
        const autoSaveTimer = setInterval(() => {
            this._autoSaveProgress();
        }, this.config.storage.autoSaveInterval);
        
        // Auto-sync
        const syncTimer = setInterval(() => {
            if (this.config.storage.enableOfflineSync && !this.state.syncInProgress) {
                this._syncWithServer();
            }
        }, 60000); // هر دقیقه
        
        this.state.timers.set('autoSave', autoSaveTimer);
        this.state.timers.set('sync', syncTimer);
    }
    
    _validateActivityData(data) {
        const errors = [];
        const required = ['type', 'language', 'duration'];
        
        // بررسی فیلدهای ضروری
        required.forEach(field => {
            if (!data[field]) errors.push(`Missing ${field}`);
        });
        
        // بررسی type
        const validTypes = ['lesson', 'exercise', 'practice', 'review', 'assessment'];
        if (!validTypes.includes(data.type)) {
            errors.push(`Invalid type: ${data.type}`);
        }
        
        // بررسی duration
        if (typeof data.duration !== 'number' || data.duration <= 0) {
            errors.push(`Invalid duration: ${data.duration}`);
        }
        
        // بررسی score
        if (data.score !== undefined) {
            if (typeof data.score !== 'number' || data.score < 0 || data.score > 100) {
                errors.push(`Invalid score: ${data.score}`);
            }
        }
        
        return {
            valid: errors.length === 0,
            data: errors.length === 0 ? data : null,
            errors
        };
    }
    
    async _processActivity(activity, timestamp) {
        const processed = {
            ...activity,
            id: `activity_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
            timestamp,
            date: new Date(timestamp).toISOString().split('T')[0],
            device: this._getDeviceInfo(),
            online: navigator.onLine
        };
        
        // محاسبه performance
        if (activity.score !== undefined) {
            processed.performance = this._calculatePerformance(activity.score, activity.difficulty);
        }
        
        // محاسبه accuracy
        if (activity.itemsCount) {
            processed.accuracy = activity.correctCount / activity.itemsCount;
        }
        
        return processed;
    }
    
    async _updateStats(activity) {
        const stats = this.state.currentProgress.overallStats;
        const lang = activity.language;
        
        // Initialize language stats if needed
        if (!this.state.currentProgress.languageStats[lang]) {
            this.state.currentProgress.languageStats[lang] = this._initializeLanguageStats(lang);
        }
        
        const langStats = this.state.currentProgress.languageStats[lang];
        
        // Update overall stats
        stats.totalActivities = (stats.totalActivities || 0) + 1;
        stats.totalTime = (stats.totalTime || 0) + activity.duration;
        stats.lastActivity = activity.timestamp;
        
        // Type-specific updates
        switch (activity.type) {
            case 'lesson':
                stats.lessonsCompleted = (stats.lessonsCompleted || 0) + 1;
                break;
            case 'exercise':
                stats.exercisesCompleted = (stats.exercisesCompleted || 0) + 1;
                break;
            case 'practice':
                stats.practiceSessions = (stats.practiceSessions || 0) + 1;
                break;
        }
        
        // Update language stats
        langStats.totalTime = (langStats.totalTime || 0) + activity.duration;
        langStats.activityCount = (langStats.activityCount || 0) + 1;
        
        if (activity.score !== undefined) {
            langStats.totalScore = (langStats.totalScore || 0) + activity.score;
            langStats.averageScore = langStats.totalScore / langStats.activityCount;
        }
        
        // Update daily stats
        const today = activity.date;
        if (!this.state.currentProgress.dailyStats[today]) {
            this.state.currentProgress.dailyStats[today] = this._initializeDailyStats();
        }
        
        const daily = this.state.currentProgress.dailyStats[today];
        daily.totalTime += activity.duration;
        daily.activityCount += 1;
        
        // Save to state manager
        if (this.deps.stateManager) {
            this.deps.stateManager.set(`progress.${this.state.currentProgress.userId}`, 
                this.state.currentProgress);
        }
        
        return { stats, langStats, daily };
    }
    
    async _checkMilestones() {
        const reached = [];
        const stats = this.state.currentProgress.overallStats;
        
        // Lessons completed milestones
        const lessonMilestone = this.config.milestones.lessonsCompleted.find(m => 
            (stats.lessonsCompleted || 0) >= m && 
            !this.cache.milestonesCache.has(`lessons_${m}`)
        );
        
        if (lessonMilestone) {
            reached.push({
                type: 'lessons_completed',
                value: lessonMilestone,
                current: stats.lessonsCompleted || 0,
                timestamp: Date.now()
            });
            this.cache.milestonesCache.set(`lessons_${lessonMilestone}`, true);
        }
        
        // Streak milestones
        const streakMilestone = this.config.milestones.streakDays.find(m => 
            this.state.currentProgress.streak >= m && 
            !this.cache.milestonesCache.has(`streak_${m}`)
        );
        
        if (streakMilestone) {
            reached.push({
                type: 'streak_days',
                value: streakMilestone,
                current: this.state.currentProgress.streak,
                timestamp: Date.now()
            });
            this.cache.milestonesCache.set(`streak_${streakMilestone}`, true);
        }
        
        // Total minutes milestones
        const minutesMilestone = this.config.milestones.totalMinutes.find(m => 
            (stats.totalTime || 0) >= m * 60000 && 
            !this.cache.milestonesCache.has(`minutes_${m}`)
        );
        
        if (minutesMilestone) {
            reached.push({
                type: 'total_minutes',
                value: minutesMilestone,
                current: Math.floor((stats.totalTime || 0) / 60000),
                timestamp: Date.now()
            });
            this.cache.milestonesCache.set(`minutes_${minutesMilestone}`, true);
        }
        
        return {
            reached,
            next: this._getNextMilestones()
        };
    }
    
    async _updateLevelAndXP(activity) {
        const oldLevel = this.state.currentProgress.level;
        const oldXP = this.state.currentProgress.xp;
        
        // Calculate XP
        const xpEarned = this._calculateXPEarned(activity);
        const newXP = oldXP + xpEarned;
        
        // Check level up
        let newLevel = oldLevel;
        let leveledUp = false;
        
        const xpRequirements = this.config.levels.xpPerLevel;
        while (newLevel <= xpRequirements.length && newXP >= xpRequirements[newLevel - 1]) {
            newLevel++;
            leveledUp = true;
        }
        
        // Update state
        this.state.currentProgress.xp = newXP;
        this.state.currentProgress.level = newLevel;
        this.state.currentProgress.nextLevelXp = 
            xpRequirements[newLevel - 1] || xpRequirements[xpRequirements.length - 1];
        
        return {
            oldLevel,
            newLevel,
            oldXP,
            newXP,
            xpEarned,
            leveledUp,
            nextLevelXp: this.state.currentProgress.nextLevelXp
        };
    }
    
    async _updateStreak(timestamp) {
        const lastDate = this.state.currentProgress.lastActivityDate;
        const currentDate = new Date(timestamp).toDateString();
        
        let newStreak = this.state.currentProgress.streak;
        let updated = false;
        
        if (!lastDate) {
            newStreak = 1;
            updated = true;
        } else {
            const lastDateStr = new Date(lastDate).toDateString();
            const yesterday = new Date(timestamp - 86400000).toDateString();
            
            if (currentDate === lastDateStr) {
                // Same day
                newStreak = this.state.currentProgress.streak;
            } else if (currentDate === yesterday) {
                // Next day
                newStreak = this.state.currentProgress.streak + 1;
                updated = true;
            } else {
                // Streak broken
                newStreak = 1;
                updated = true;
            }
        }
        
        const previousStreak = this.state.currentProgress.streak;
        this.state.currentProgress.streak = newStreak;
        this.state.currentProgress.lastActivityDate = currentDate;
        
        return {
            updated,
            previousStreak,
            newStreak,
            lostStreak: updated && newStreak === 1 && previousStreak > 0
        };
    }
    
    async _checkDailyGoal(timestamp) {
        const today = new Date(timestamp).toISOString().split('T')[0];
        const dailyStats = this.state.currentProgress.dailyStats[today] || 
                          this._initializeDailyStats();
        
        const goal = this._getDailyGoal();
        const goalMinutes = goal.targetMinutes;
        
        const completed = dailyStats.totalTime >= goalMinutes * 60000;
        
        if (completed && !dailyStats.goalCompleted) {
            dailyStats.goalCompleted = true;
            dailyStats.goalCompletedAt = timestamp;
            this.state.currentProgress.dailyStats[today] = dailyStats;
            
            // Adjust goal if adaptive
            if (this.config.dailyGoals.adaptiveGoal) {
                await this._adjustDailyGoal(dailyStats.totalTime / 60000);
            }
            
            return {
                completed: true,
                goal: goalMinutes,
                actual: Math.floor(dailyStats.totalTime / 60000)
            };
        }
        
        return {
            completed: false,
            goal: goalMinutes,
            actual: Math.floor(dailyStats.totalTime / 60000),
            remaining: Math.max(0, goalMinutes - Math.floor(dailyStats.totalTime / 60000))
        };
    }
    
    async _generateProgressReport(language, timeframe, detailed) {
        const userId = this.state.currentProgress.userId;
        
        // Calculate overall progress
        const overall = this._calculateOverallProgress();
        
        // Calculate language-specific progress
        const languages = language === 'all' 
            ? this._aggregateLanguageProgress()
            : this._calculateLanguageProgress(language);
        
        // Calculate trends
        const trends = await this._calculateTrends(timeframe);
        
        const report = {
            userId,
            generatedAt: new Date().toISOString(),
            timeframe,
            overall,
            languages,
            trends,
            recommendations: detailed ? this._generateRecommendations() : undefined,
            nextMilestones: this._getNextMilestones()
        };
        
        return report;
    }
    
    // ==================== SYNC AND STORAGE ====================
    
    async _syncWithServer() {
        if (this.state.syncInProgress || !this.config.storage.enableOfflineSync) {
            return;
        }
        
        this.state.syncInProgress = true;
        this._emitEvent(this.config.events.SYNC_STARTED, {
            pendingUpdates: this.state.pendingUpdates.length
        });
        
        try {
            const updatesToSync = [...this.state.pendingUpdates];
            
            if (updatesToSync.length > 0 && this.deps.apiClient) {
                await this.deps.apiClient.post('/progress/sync', {
                    userId: this.state.currentProgress.userId,
                    updates: updatesToSync,
                    device: this._getDeviceInfo()
                });
                
                // Remove synced updates
                this.state.pendingUpdates = this.state.pendingUpdates.filter(
                    update => !updatesToSync.includes(update)
                );
                
                this.state.lastSyncTime = Date.now();
            }
            
            this._emitEvent(this.config.events.SYNC_COMPLETED, {
                syncedUpdates: updatesToSync.length,
                remainingUpdates: this.state.pendingUpdates.length
            });
            
        } catch (error) {
            console.error('[ProgressTracker] Sync failed:', error);
            
            this._emitEvent(this.config.events.SYNC_FAILED, {
                error: error.message
            });
            
            // Keep updates for retry
            this.state.pendingUpdates = [
                ...this.state.pendingUpdates,
                ...updatesToSync
            ].slice(0, this.config.storage.maxLocalEntries);
            
        } finally {
            this.state.syncInProgress = false;
        }
    }
    
    async _autoSaveProgress() {
        try {
            if (this.deps.database && this.state.currentProgress.userId) {
                await this.deps.database.saveUserProgress(
                    this.state.currentProgress.userId,
                    this.state.currentProgress
                );
                
                console.log('[ProgressTracker] Auto-save completed');
            }
        } catch (error) {
            console.error('[ProgressTracker] Auto-save failed:', error);
        }
    }
    
    async _createBackup() {
        const backup = {
            timestamp: Date.now(),
            userId: this.state.currentProgress.userId,
            progress: { ...this.state.currentProgress },
            pendingUpdates: [...this.state.pendingUpdates]
        };
        
        // Save to localStorage
        try {
            localStorage.setItem(
                `vakamova_progress_backup_${this.state.currentProgress.userId}`,
                JSON.stringify(backup)
            );
        } catch (error) {
            console.warn('[ProgressTracker] Local backup failed:', error);
        }
        
        // Save to database
        if (this.deps.database) {
            try {
                await this.deps.database.saveBackup(backup);
            } catch (error) {
                console.warn('[ProgressTracker] Database backup failed:', error);
            }
        }
        
        return backup;
    }
    
    async _clearStorage() {
        // Clear localStorage
        try {
            localStorage.removeItem(`vakamova_progress_${this.state.currentProgress.userId}`);
        } catch (error) {
            // Ignore
        }
        
        // Clear database
        if (this.deps.database) {
            try {
                await this.deps.database.clearUserProgress(this.state.currentProgress.userId);
            } catch (error) {
                console.warn('[ProgressTracker] Clear database failed:', error);
            }
        }
    }
    
    // ==================== EVENT HANDLERS ====================
    
    _handleLearningEvent(eventName, data) {
        const activityMap = {
            'lesson:completed': {
                type: 'lesson',
                language: data.language,
                duration: data.duration,
                score: data.score,
                lessonId: data.lessonId
            },
            'exercise:completed': {
                type: 'exercise',
                language: data.language,
                duration: data.duration,
                score: data.score,
                exerciseId: data.exerciseId
            }
        };
        
        const template = activityMap[eventName];
        if (template) {
            this.trackActivity({ ...template, ...data });
        }
    }
    
    _emitEvent(eventName, data) {
        if (this.deps.eventBus) {
            this.deps.eventBus.emit(eventName, data);
        }
    }
    
    // ==================== UTILITY METHODS ====================
    
    _initializeStats() {
        return {
            totalActivities: 0,
            totalTime: 0,
            lessonsCompleted: 0,
            exercisesCompleted: 0,
            practiceSessions: 0,
            lastActivity: null
        };
    }
    
    _initializeLanguageStats(language) {
        return {
            language,
            totalTime: 0,
            activityCount: 0,
            totalScore: 0,
            averageScore: 0,
            lastActivity: null
        };
    }
    
    _initializeDailyStats() {
        return {
            totalTime: 0,
            activityCount: 0,
            goalCompleted: false,
            goalCompletedAt: null
        };
    }
    
    _mergeProgress(source) {
        return {
            ...this.state.currentProgress,
            ...source,
            overallStats: {
                ...this.state.currentProgress.overallStats,
                ...source.overallStats
            },
            languageStats: {
                ...this.state.currentProgress.languageStats,
                ...source.languageStats
            },
            dailyStats: {
                ...this.state.currentProgress.dailyStats,
                ...source.dailyStats
            }
        };
    }
    
    _calculateXPEarned(activity) {
        let baseXP = 10;
        
        // Time bonus
        baseXP += Math.floor(activity.duration / 60000) * 0.5;
        
        // Score bonus
        if (activity.score !== undefined) {
            baseXP += activity.score * 0.5;
        }
        
        // Performance bonus
        if (activity.performance === 'excellent') {
            baseXP *= 1.5;
        }
        
        // Streak bonus
        baseXP *= (1 + (this.state.currentProgress.streak * 0.01));
        
        return Math.round(baseXP);
    }
    
    _calculateOverallProgress() {
        const stats = this.state.currentProgress.overallStats;
        const langStats = this.state.currentProgress.languageStats;
        
        const progress = {
            completion: this._calculateCompletionRate(stats),
            accuracy: this._calculateOverallAccuracy(stats, langStats),
            consistency: this._calculateConsistency(),
            engagement: this._calculateEngagementScore(stats)
        };
        
        // Weighted overall score
        const weights = this.config.calculations;
        progress.overallScore = 
            (progress.completion * weights.weightCompletion) +
            (progress.accuracy * weights.weightAccuracy) +
            (progress.consistency * weights.weightConsistency);
        
        // Add details
        progress.details = {
            totalTime: stats.totalTime,
            totalActivities: stats.totalActivities,
            lessonsCompleted: stats.lessonsCompleted || 0,
            exercisesCompleted: stats.exercisesCompleted || 0,
            streak: this.state.currentProgress.streak,
            level: this.state.currentProgress.level,
            xp: this.state.currentProgress.xp,
            nextLevelXp: this.state.currentProgress.nextLevelXp
        };
        
        return progress;
    }
    
    _calculateLanguageProgress(language) {
        const langStats = this.state.currentProgress.languageStats[language];
        if (!langStats) return this._initializeLanguageStats(language);
        
        return {
            timeSpent: langStats.totalTime,
            activityCount: langStats.activityCount,
            averageScore: langStats.averageScore || 0,
            mastery: this._calculateLanguageMastery(langStats),
            lastActivity: langStats.lastActivity
        };
    }
    
    _aggregateLanguageProgress() {
        const result = {};
        
        Object.entries(this.state.currentProgress.languageStats).forEach(([lang, stats]) => {
            result[lang] = this._calculateLanguageProgress(lang);
        });
        
        return result;
    }
    
    async _calculateTrends(timeframe) {
        const trends = { daily: [], weekly: [], monthly: [] };
        
        // Calculate last 7 days
        for (let i = 6; i >= 0; i--) {
            const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
            const daily = this.state.currentProgress.dailyStats[date] || this._initializeDailyStats();
            trends.daily.push({
                date,
                time: daily.totalTime,
                activities: daily.activityCount
            });
        }
        
        return trends;
    }
    
    _getDailyGoal() {
        const goal = this.deps.stateManager?.get(`user.dailyGoal`) || 
                    this.config.dailyGoals.defaultMinutes;
        
        return {
            targetMinutes: goal,
            adaptive: this.config.dailyGoals.adaptiveGoal
        };
    }
    
    async _adjustDailyGoal(actualMinutes) {
        if (!this.config.dailyGoals.adaptiveGoal) return;
        
        const currentGoal = this._getDailyGoal().targetMinutes;
        const adjustment = this.config.dailyGoals.goalAdjustmentRate;
        
        let newGoal = currentGoal;
        
        if (actualMinutes >= currentGoal * 1.2) {
            newGoal = Math.min(
                currentGoal * (1 + adjustment),
                this.config.dailyGoals.maxDailyGoal
            );
        } else if (actualMinutes < currentGoal * 0.8) {
            newGoal = Math.max(
                currentGoal * (1 - adjustment),
                this.config.dailyGoals.minDailyGoal
            );
        }
        
        if (this.deps.stateManager) {
            this.deps.stateManager.set(`user.dailyGoal`, newGoal);
        }
    }
    
    _getNextMilestones() {
        const stats = this.state.currentProgress.overallStats;
        const streak = this.state.currentProgress.streak;
        
        return {
            lessons: this.config.milestones.lessonsCompleted.find(m => m > (stats.lessonsCompleted || 0)),
            streak: this.config.milestones.streakDays.find(m => m > streak),
            minutes: this.config.milestones.totalMinutes.find(m => m > Math.floor(stats.totalTime / 60000)),
            accuracy: this.config.milestones.accuracyThresholds.find(t => t > (stats.averageAccuracy || 0))
        };
    }
    
    _generateRecommendations() {
        const recommendations = [];
        const consistency = this._calculateConsistency();
        
        if (consistency < 0.5) {
            recommendations.push({
                type: 'consistency',
                message: 'سعی کنید هر روز مطالعه کنید',
                priority: 'high'
            });
        }
        
        const dailyGoal = this._checkDailyGoal(Date.now());
        if (!dailyGoal.completed && dailyGoal.remaining > 0) {
            recommendations.push({
                type: 'daily_goal',
                message: `${dailyGoal.remaining} دقیقه تا هدف امروز`,
                priority: 'high'
            });
        }
        
        return recommendations;
    }
    
    _calculatePerformance(score, difficulty = 'medium') {
        const multipliers = { easy: 0.8, medium: 1.0, hard: 1.2 };
        const multiplier = multipliers[difficulty] || 1.0;
        const adjusted = score * multiplier;
        
        if (adjusted >= 90) return 'excellent';
        if (adjusted >= 75) return 'good';
        if (adjusted >= 60) return 'fair';
        return 'needs_improvement';
    }
    
    _calculateCompletionRate(stats) {
        const totalPossible = 100;
        const completed = stats.lessonsCompleted || 0;
        return Math.min(completed / totalPossible, 1);
    }
    
    _calculateOverallAccuracy(stats, languageStats) {
        let totalScore = 0;
        let totalWeight = 0;
        
        Object.values(languageStats).forEach(lang => {
            if (lang.averageScore > 0) {
                totalScore += lang.averageScore * lang.activityCount;
                totalWeight += lang.activityCount;
            }
        });
        
        return totalWeight > 0 ? totalScore / totalWeight : 0;
    }
    
    _calculateConsistency() {
        const dailyStats = this.state.currentProgress.dailyStats;
        const days = Object.keys(dailyStats).length;
        
        if (days < 2) return 0;
        
        let activeDays = 0;
        Object.values(dailyStats).forEach(day => {
            if (day.totalTime > 0) activeDays++;
        });
        
        return activeDays / days;
    }
    
    _calculateEngagementScore(stats) {
        const baseScore = Math.min(stats.totalActivities / 100, 1) * 0.4;
        const consistencyScore = this._calculateConsistency() * 0.3;
        const streakScore = Math.min(this.state.currentProgress.streak / 30, 1) * 0.3;
        
        return baseScore + consistencyScore + streakScore;
    }
    
    _calculateLanguageMastery(langStats) {
        if (!langStats.averageScore || langStats.activityCount < this.config.calculations.minDataPoints) {
            return 0;
        }
        
        const timeFactor = Math.min(langStats.totalTime / 3600000, 100) / 100;
        const scoreFactor = langStats.averageScore / 100;
        const activityFactor = Math.min(langStats.activityCount / 50, 1);
        
        return (timeFactor * 0.4) + (scoreFactor * 0.4) + (activityFactor * 0.2);
    }
    
    _getDeviceInfo() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            online: navigator.onLine
        };
    }
    
    // ==================== CLEANUP ====================
    
    cleanup() {
        // Clear timers
        this.state.timers.forEach(timer => clearInterval(timer));
        this.state.timers.clear();
        
        // Unsubscribe events
        this.state.eventSubscriptions.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') unsubscribe();
        });
        this.state.eventSubscriptions.clear();
        
        // Final save
        this._autoSaveProgress();
        
        // Clear cache
        this.cache.progressData.clear();
        this.cache.milestonesCache.clear();
        this.cache.analyticsCache.clear();
        
        this.state.isInitialized = false;
        
        console.log('[ProgressTracker] 🧹 Cleaned up');
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ProgressTracker = ProgressTracker;
}

export { ProgressTracker };
