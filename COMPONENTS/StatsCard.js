/**
 * 📊 StatsCard - کامپوننت نمایش آمار کاربر (Vakamova)
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * وابستگی: فقط به core/event_bus.js و core/state_manager.js
 */

class StatsCard {
    constructor(dependencies = {}) {
        // ==================== تزریق وابستگی ====================
        this.eventBus = dependencies.eventBus || window.eventBus;
        this.stateManager = dependencies.stateManager || window.stateManager;
        this.config = dependencies.config || {};
        
        // اعتبارسنجی وابستگی‌های ضروری
        this._validateDependencies();
        
        // ==================== پیکربندی متمرکز ====================
        this.settings = Object.freeze({
            animationSpeed: this.config.animationSpeed || 300,
            refreshInterval: this.config.refreshInterval || 30000,
            maxHistory: this.config.maxHistory || 7,
            colors: {
                primary: this.config.colors?.primary || '#1a237e',
                secondary: this.config.colors?.secondary || '#311b92',
                success: this.config.colors?.success || '#4caf50',
                warning: this.config.colors?.warning || '#ff9800',
                ...this.config.colors
            },
            metrics: this.config.metrics || ['lessons', 'minutes', 'streak', 'accuracy'],
            ...this.config
        });
        
        // ==================== وضعیت داخلی ====================
        this.element = null;
        this.isMounted = false;
        this.currentStats = null;
        this.historyData = [];
        this.subscriptions = new Map();
        
        // ==================== رویدادهای استاندارد (قرارداد رابط) ====================
        this.EVENTS = {
            STATS_UPDATED: 'stats:card:updated',
            CARD_CLICKED: 'stats:card:clicked',
            METRIC_SELECTED: 'stats:metric:selected',
            ERROR_OCCURRED: 'stats:error:occurred'
        };
        
        // ==================== ثبت در سیستم رویداد ====================
        this._registerEventListeners();
        
        console.log('[StatsCard] ✅ کامپوننت با پیکربندی:', this.settings);
    }
    
    // ==================== قرارداد رابط عمومی ====================
    
    async init(containerSelector = '#stats-container') {
        try {
            if (this.isMounted) {
                console.warn('[StatsCard] قبلاً mount شده است');
                return this;
            }
            
            // یافتن کانتینر
            this.element = this._getContainer(containerSelector);
            if (!this.element) {
                throw new Error(`کانتینر ${containerSelector} یافت نشد`);
            }
            
            // دریافت داده‌های اولیه
            await this._loadInitialData();
            
            // رندر کامپوننت
            this._render();
            
            // راه‌اندازی به‌روزرسانی خودکار
            this._setupAutoRefresh();
            
            this.isMounted = true;
            
            // انتشار رویداد موفقیت‌آمیز
            this.eventBus.emit(this.EVENTS.STATS_UPDATED, {
                type: 'initialized',
                stats: this.currentStats,
                timestamp: new Date().toISOString()
            });
            
            console.log('[StatsCard] 🎯 کامپوننت در container', containerSelector, 'مونت شد');
            return this;
            
        } catch (error) {
            this._handleError(error, 'init');
            throw error;
        }
    }
    
    async updateStats(newStats = null) {
        try {
            const previousStats = this.currentStats;
            
            // دریافت داده‌های جدید اگر ارائه نشده
            if (!newStats) {
                newStats = await this._fetchStats();
            }
            
            // اعتبارسنجی داده‌ها
            this._validateStats(newStats);
            
            // به‌روزرسانی وضعیت
            this.currentStats = newStats;
            this.historyData.push({
                ...newStats,
                timestamp: new Date().toISOString()
            });
            
            // محدود کردن تاریخچه
            if (this.historyData.length > this.settings.maxHistory) {
                this.historyData = this.historyData.slice(-this.settings.maxHistory);
            }
            
            // رندر به‌روزرسانی با انیمیشن
            if (this.isMounted) {
                await this._animateUpdate(previousStats, newStats);
            }
            
            // انتشار رویداد
            this.eventBus.emit(this.EVENTS.STATS_UPDATED, {
                type: 'manual_update',
                previous: previousStats,
                current: newStats,
                timestamp: new Date().toISOString()
            });
            
            return newStats;
            
        } catch (error) {
            this._handleError(error, 'updateStats');
            throw error;
        }
    }
    
    destroy() {
        // توقف intervalها
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
        }
        
        // لغو اشتراک رویدادها
        this._unsubscribeAll();
        
        // پاک‌سازی DOM
        if (this.element && this.isMounted) {
            this.element.innerHTML = '';
            this.element = null;
        }
        
        this.isMounted = false;
        console.log('[StatsCard] 🧹 کامپوننت destroy شد');
    }
    
    getCurrentStats() {
        return { ...this.currentStats };
    }
    
    getHistory() {
        return [...this.historyData];
    }
    
    // ==================== متدهای کمکی داخلی ====================
    
    _validateDependencies() {
        const required = [
            { name: 'eventBus', obj: this.eventBus, methods: ['on', 'emit'] },
            { name: 'stateManager', obj: this.stateManager, methods: ['get', 'subscribe'] }
        ];
        
        required.forEach(dep => {
            if (!dep.obj) {
                throw new Error(`وابستگی ${dep.name} ارائه نشده است`);
            }
            
            dep.methods.forEach(method => {
                if (typeof dep.obj[method] !== 'function') {
                    throw new Error(`${dep.name} باید متد ${method} را داشته باشد`);
                }
            });
        });
    }
    
    _getContainer(selector) {
        if (typeof selector === 'string') {
            return document.querySelector(selector);
        } else if (selector instanceof HTMLElement) {
            return selector;
        }
        return null;
    }
    
    async _loadInitialData() {
        // تلاش برای دریافت از state manager اول
        const cachedStats = this.stateManager.get('user.stats');
        
        if (cachedStats) {
            this.currentStats = cachedStats;
            this.historyData = this.stateManager.get('user.statsHistory') || [];
            console.log('[StatsCard] داده‌ها از State Manager بازیابی شد');
            return;
        }
        
        // در غیر این صورت fetch جدید
        this.currentStats = await this._fetchStats();
    }
    
    async _fetchStats() {
        // شبیه‌سازی دریافت آمار کاربر
        // در پیاده‌سازی واقعی، اینجا API call انجام می‌شود
        return new Promise(resolve => {
            setTimeout(() => {
                resolve({
                    lessons: {
                        total: Math.floor(Math.random() * 50) + 10,
                        completed: Math.floor(Math.random() * 30) + 5,
                        today: Math.floor(Math.random() * 5)
                    },
                    minutes: {
                        total: Math.floor(Math.random() * 1000) + 200,
                        today: Math.floor(Math.random() * 120) + 10,
                        average: Math.floor(Math.random() * 30) + 15
                    },
                    streak: {
                        current: Math.floor(Math.random() * 30) + 1,
                        longest: Math.floor(Math.random() * 60) + 30,
                        isActive: true
                    },
                    accuracy: {
                        overall: Math.floor(Math.random() * 30) + 70,
                        lastWeek: Math.floor(Math.random() * 30) + 65,
                        trend: Math.random() > 0.5 ? 'up' : 'down'
                    },
                    level: {
                        current: 'intermediate',
                        progress: Math.floor(Math.random() * 100),
                        nextLevel: 'advanced'
                    },
                    lastUpdated: new Date().toISOString()
                });
            }, 300);
        });
    }
    
    _validateStats(stats) {
        const requiredMetrics = ['lessons', 'minutes', 'streak', 'accuracy'];
        const missing = requiredMetrics.filter(metric => !stats[metric]);
        
        if (missing.length > 0) {
            throw new Error(`آمار ضروری وجود ندارد: ${missing.join(', ')}`);
        }
        
        return true;
    }
    
    _registerEventListeners() {
        // گوش دادن به رویدادهای state manager
        const stateUnsubscribe = this.stateManager.subscribe(
            'user.stats',
            (newStats) => {
                if (newStats && this.isMounted) {
                    this.updateStats(newStats).catch(console.error);
                }
            }
        );
        
        this.subscriptions.set('state', stateUnsubscribe);
        
        // گوش دادن به رویدادهای عمومی
        const eventUnsubscribe = this.eventBus.on('user:stats:updated', (data) => {
            if (data?.stats) {
                this.updateStats(data.stats).catch(console.error);
            }
        });
        
        this.subscriptions.set('event', eventUnsubscribe);
    }
    
    _unsubscribeAll() {
        this.subscriptions.forEach(unsubscribe => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        this.subscriptions.clear();
    }
    
    _setupAutoRefresh() {
        if (this.settings.refreshInterval > 0) {
            this.refreshInterval = setInterval(() => {
                if (document.visibilityState === 'visible') {
                    this.updateStats().catch(console.error);
                }
            }, this.settings.refreshInterval);
            
            console.log(`[StatsCard] به‌روزرسانی خودکار هر ${this.settings.refreshInterval/1000} ثانیه`);
        }
    }
    
    // ==================== رندرینگ ====================
    
    _render() {
        if (!this.element || !this.currentStats) return;
        
        const stats = this.currentStats;
        
        this.element.innerHTML = `
            <div class="stats-card" style="${this._getCardStyles()}">
                <div class="stats-header">
                    <h3 class="stats-title">📊 پیشرفت شما</h3>
                    <div class="stats-timestamp">
                        ${new Date(stats.lastUpdated).toLocaleTimeString('fa-IR')}
                    </div>
                </div>
                
                <div class="stats-grid">
                    ${this._renderMetric('درس‌ها', stats.lessons.completed, stats.lessons.total, '📚', this.settings.colors.primary)}
                    ${this._renderMetric('دقیقه', stats.minutes.today, stats.minutes.average * 7, '⏱️', this.settings.colors.secondary)}
                    ${this._renderMetric('روز متوالی', stats.streak.current, stats.streak.longest, '🔥', this.settings.colors.success)}
                    ${this._renderMetric('دقت', stats.accuracy.overall, 100, '🎯', this.settings.colors.warning)}
                </div>
                
                <div class="stats-level">
                    <div class="level-label">سطح ${stats.level.current}</div>
                    <div class="level-progress">
                        <div class="progress-bar" style="${this._getProgressBarStyles(stats.level.progress)}">
                            <div class="progress-fill" style="width: ${stats.level.progress}%"></div>
                        </div>
                        <div class="level-percent">${stats.level.progress}%</div>
                    </div>
                    <div class="level-next">هدف بعدی: ${stats.level.nextLevel}</div>
                </div>
                
                <div class="stats-actions">
                    <button class="stats-btn refresh-btn" data-action="refresh">
                        🔄 به‌روزرسانی
                    </button>
                    <button class="stats-btn details-btn" data-action="details">
                        📈 جزئیات بیشتر
                    </button>
                </div>
            </div>
        `;
        
        // اضافه کردن event listeners به دکمه‌ها
        this._attachEventListeners();
    }
    
    _renderMetric(label, value, max, icon, color) {
        const percentage = max > 0 ? Math.round((value / max) * 100) : 0;
        
        return `
            <div class="stats-metric" data-metric="${label}">
                <div class="metric-header">
                    <span class="metric-icon">${icon}</span>
                    <span class="metric-label">${label}</span>
                </div>
                <div class="metric-value">${value}</div>
                <div class="metric-max">/${max}</div>
                <div class="metric-progress">
                    <div class="progress-bar" style="background: rgba(${this._hexToRgb(color)}, 0.2)">
                        <div class="progress-fill" 
                             style="width: ${percentage}%; background: ${color}"></div>
                    </div>
                </div>
                <div class="metric-percent">${percentage}%</div>
            </div>
        `;
    }
    
    async _animateUpdate(oldStats, newStats) {
        if (!oldStats || !this.element) return;
        
        // انیمیشن fade out/in
        this.element.style.opacity = '0.5';
        this.element.style.transition = `opacity ${this.settings.animationSpeed}ms`;
        
        await new Promise(resolve => 
            setTimeout(resolve, this.settings.animationSpeed / 2)
        );
        
        this._render();
        
        this.element.style.opacity = '1';
        
        await new Promise(resolve => 
            setTimeout(resolve, this.settings.animationSpeed / 2)
        );
        
        this.element.style.transition = '';
    }
    
    _attachEventListeners() {
        // دکمه به‌روزرسانی
        const refreshBtn = this.element.querySelector('.refresh-btn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.updateStats().catch(console.error);
                this.eventBus.emit(this.EVENTS.CARD_CLICKED, { action: 'refresh' });
            });
        }
        
        // دکمه جزئیات
        const detailsBtn = this.element.querySelector('.details-btn');
        if (detailsBtn) {
            detailsBtn.addEventListener('click', () => {
                this.eventBus.emit(this.EVENTS.CARD_CLICKED, { action: 'details' });
                this.eventBus.emit(this.EVENTS.METRIC_SELECTED, { 
                    stats: this.currentStats,
                    history: this.historyData 
                });
            });
        }
        
        // کلیک روی هر متریک
        const metrics = this.element.querySelectorAll('.stats-metric');
        metrics.forEach(metric => {
            metric.addEventListener('click', () => {
                const metricName = metric.dataset.metric;
                this.eventBus.emit(this.EVENTS.METRIC_SELECTED, {
                    metric: metricName,
                    value: this.currentStats[metricName.toLowerCase()],
                    timestamp: new Date().toISOString()
                });
            });
        });
    }
    
    // ==================== ابزارهای استایل ====================
    
    _getCardStyles() {
        return `
            background: linear-gradient(135deg, 
                rgba(255, 255, 255, 0.95) 0%, 
                rgba(255, 255, 255, 0.98) 100%);
            border-radius: 20px;
            padding: 25px;
            box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(0, 0, 0, 0.08);
            font-family: 'Vazirmatn', sans-serif;
            color: #333;
            transition: all 0.3s ease;
        `;
    }
    
    _getProgressBarStyles(percentage) {
        return `
            width: 100%;
            height: 10px;
            background: rgba(0, 0, 0, 0.1);
            border-radius: 5px;
            overflow: hidden;
            margin: 10px 0;
        `;
    }
    
    _hexToRgb(hex) {
        const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
        return result ? 
            `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` 
            : '0, 0, 0';
    }
    
    // ==================== مدیریت خطا ====================
    
    _handleError(error, context) {
        const errorEvent = {
            type: 'stats_card_error',
            context,
            message: error.message,
            timestamp: new Date().toISOString(),
            stack: error.stack
        };
        
        console.error(`[StatsCard] خطا در ${context}:`, error);
        
        // انتشار رویداد خطا
        this.eventBus.emit(this.EVENTS.ERROR_OCCURRED, errorEvent);
        
        // نمایش خطا در UI اگر mount شده
        if (this.isMounted && this.element) {
            this.element.innerHTML = `
                <div class="stats-error" style="
                    padding: 20px;
                    text-align: center;
                    color: #f44336;
                    background: rgba(244, 67, 54, 0.1);
                    border-radius: 10px;
                    border: 1px solid #f44336;
                ">
                    <div style="font-size: 1.5rem; margin-bottom: 10px;">⚠️</div>
                    <div style="font-weight: bold; margin-bottom: 5px;">خطا در دریافت آمار</div>
                    <div style="font-size: 0.9rem; opacity: 0.8;">${error.message}</div>
                    <button onclick="location.reload()" style="
                        margin-top: 15px;
                        padding: 8px 20px;
                        background: #f44336;
                        color: white;
                        border: none;
                        border-radius: 5px;
                        cursor: pointer;
                    ">
                        تلاش مجدد
                    </button>
                </div>
            `;
        }
    }
}

// ==================== Factory Function ====================
function createStatsCard(config = {}) {
    return new StatsCard(config);
}

// ==================== Export استاندارد ====================
export { StatsCard, createStatsCard };

// ==================== Global Registration ====================
if (typeof window !== 'undefined') {
    window.StatsCard = StatsCard;
    window.createStatsCard = createStatsCard;
}

console.log('[StatsCard] ✅ ماژول بارگذاری شد - آماده استفاده');
