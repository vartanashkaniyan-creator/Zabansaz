// ==================== core/font_manager.js ====================
/**
 * VAKAMOVA FONT MANAGER - سیستم مدیریت فونت پیشرفته
 * اصول: ۱. تزریق وابستگی ۲. قرارداد رابط ۳. رویدادمحور ۴. پیکربندی متمرکز
 */

class VakamovaFontManager {
    constructor(eventSystem, config = {}) {
        // اصل ۱: تزریق وابستگی
        this._eventSystem = eventSystem || { emit: () => {}, on: () => () => {} };
        
        // اصل ۴: پیکربندی متمرکز
        this._config = Object.freeze({
            fontBasePath: config.fontBasePath || 'assets/fonts/',
            defaultFonts: config.defaultFonts || this._getDefaultFonts(),
            fontDisplay: config.fontDisplay || 'swap',
            timeout: config.timeout || 10000,
            enableCache: config.enableCache ?? true,
            enablePreload: config.enablePreload ?? true,
            enablePerformanceMetrics: config.enablePerformanceMetrics ?? true,
            ...config
        });
        
        // سیستم داخلی
        this._fonts = new Map();
        this._loadedFonts = new Set();
        this._fontObservers = new Map();
        this._performanceMetrics = {
            loadAttempts: 0,
            loadSuccess: 0,
            loadFailures: 0,
            cacheHits: 0,
            totalLoadTime: 0
        };
        
        // رویدادهای استاندارد (اصل ۲: قرارداد رابط)
        this.EVENTS = {
            FONT_LOADING: 'font:loading',
            FONT_LOADED: 'font:loaded',
            FONT_ERROR: 'font:error',
            FONT_CACHE_HIT: 'font:cache:hit',
            FONT_ALL_LOADED: 'font:all:loaded',
            FONT_PERFORMANCE_UPDATE: 'font:performance:update'
        };
        
        // ثبت فونت‌های پیش‌فرض
        this._registerDefaultFonts();
        
        // شروع پیش‌بارگذاری اگر فعال باشد
        if (this._config.enablePreload) {
            requestIdleCallback(() => this._preloadCriticalFonts());
        }
        
        Object.seal(this);
    }
    
    // ==================== PUBLIC API (قرارداد رابط) ====================
    
    async loadFont(fontName, options = {}) {
        const fontId = this._normalizeFontId(fontName);
        const startTime = performance.now();
        
        // بررسی کش
        if (this._config.enableCache && this._loadedFonts.has(fontId)) {
            this._performanceMetrics.cacheHits++;
            this._eventSystem.emit(this.EVENTS.FONT_CACHE_HIT, { fontId });
            return { success: true, fromCache: true, fontId };
        }
        
        // دریافت تنظیمات فونت
        const fontConfig = this._fonts.has(fontId) 
            ? this._fonts.get(fontId)
            : this._createFontConfig(fontName, options);
        
        this._performanceMetrics.loadAttempts++;
        
        // اعلام شروع بارگذاری (اصل ۳: رویدادمحور)
        this._eventSystem.emit(this.EVENTS.FONT_LOADING, {
            fontId,
            config: fontConfig,
            timestamp: Date.now()
        });
        
        try {
            // بارگذاری فونت
            const fontFace = await this._loadFontFace(fontConfig);
            
            // اعمال به DOM
            document.fonts.add(fontFace);
            await fontFace.load();
            
            const loadTime = performance.now() - startTime;
            this._performanceMetrics.loadSuccess++;
            this._performanceMetrics.totalLoadTime += loadTime;
            this._loadedFonts.add(fontId);
            
            // اعلام موفقیت
            this._eventSystem.emit(this.EVENTS.FONT_LOADED, {
                fontId,
                fontFace,
                loadTime,
                config: fontConfig,
                timestamp: Date.now()
            });
            
            // به‌روزرسانی متریک‌ها
            if (this._config.enablePerformanceMetrics) {
                this._eventSystem.emit(this.EVENTS.FONT_PERFORMANCE_UPDATE, {
                    ...this._performanceMetrics,
                    averageLoadTime: this._performanceMetrics.loadSuccess > 0 
                        ? this._performanceMetrics.totalLoadTime / this._performanceMetrics.loadSuccess 
                        : 0
                });
            }
            
            // فعال کردن ناظران
            this._notifyObservers(fontId, fontFace);
            
            return {
                success: true,
                fontId,
                fontFace,
                loadTime,
                fromCache: false
            };
            
        } catch (error) {
            this._performanceMetrics.loadFailures++;
            const loadTime = performance.now() - startTime;
            
            this._eventSystem.emit(this.EVENTS.FONT_ERROR, {
                fontId,
                error: error.message,
                config: fontConfig,
                loadTime,
                timestamp: Date.now()
            });
            
            return {
                success: false,
                fontId,
                error: error.message,
                loadTime
            };
        }
    }
    
    async loadFonts(fontList, options = {}) {
        const results = [];
        
        for (const font of fontList) {
            const result = await this.loadFont(
                typeof font === 'string' ? font : font.name,
                typeof font === 'string' ? options : { ...options, ...font }
            );
            results.push(result);
            
            // توقف در صورت خطا و fallback فعال باشد
            if (!result.success && options.abortOnError) {
                break;
            }
        }
        
        this._eventSystem.emit(this.EVENTS.FONT_ALL_LOADED, {
            results,
            total: results.length,
            successful: results.filter(r => r.success).length,
            failed: results.filter(r => !r.success).length
        });
        
        return results;
    }
    
    getFontStatus(fontName) {
        const fontId = this._normalizeFontId(fontName);
        
        if (!this._fonts.has(fontId)) {
            return { status: 'not_registered', fontId };
        }
        
        if (this._loadedFonts.has(fontId)) {
            return { status: 'loaded', fontId };
        }
        
        const fontConfig = this._fonts.get(fontId);
        return { status: 'registered', fontId, config: fontConfig };
    }
    
    observeFont(fontName, callback) {
        const fontId = this._normalizeFontId(fontName);
        
        if (!this._fontObservers.has(fontId)) {
            this._fontObservers.set(fontId, new Set());
        }
        
        this._fontObservers.get(fontId).add(callback);
        
        // اگر فونت از قبل لود شده، فوراً اطلاع بده
        if (this._loadedFonts.has(fontId)) {
            queueMicrotask(() => callback({
                fontId,
                status: 'loaded',
                timestamp: Date.now()
            }));
        }
        
        return () => {
            const observers = this._fontObservers.get(fontId);
            if (observers) {
                observers.delete(callback);
                if (observers.size === 0) {
                    this._fontObservers.delete(fontId);
                }
            }
        };
    }
    
    registerFont(fontName, config) {
        const fontId = this._normalizeFontId(fontName);
        
        if (this._fonts.has(fontId)) {
            console.warn(`[FontManager] Font "${fontId}" already registered, updating config`);
        }
        
        const fullConfig = {
            ...this._createFontConfig(fontName, config),
            ...config,
            id: fontId,
            registeredAt: Date.now()
        };
        
        this._fonts.set(fontId, Object.freeze(fullConfig));
        
        return fontId;
    }
    
    unloadFont(fontName) {
        const fontId = this._normalizeFontId(fontName);
        
        // حذف از document.fonts
        const fontFace = Array.from(document.fonts.values())
            .find(ff => ff.family === fontId);
        
        if (fontFace) {
            document.fonts.delete(fontFace);
        }
        
        // حذف از حافظه داخلی
        this._loadedFonts.delete(fontId);
        this._fonts.delete(fontId);
        
        // حذف ناظران
        this._fontObservers.delete(fontId);
        
        return { success: true, fontId };
    }
    
    getPerformanceMetrics() {
        return {
            ...this._performanceMetrics,
            averageLoadTime: this._performanceMetrics.loadSuccess > 0 
                ? this._performanceMetrics.totalLoadTime / this._performanceMetrics.loadSuccess 
                : 0,
            loadSuccessRate: this._performanceMetrics.loadAttempts > 0 
                ? (this._performanceMetrics.loadSuccess / this._performanceMetrics.loadAttempts) * 100 
                : 0,
            cacheEfficiency: this._performanceMetrics.loadAttempts > 0 
                ? (this._performanceMetrics.cacheHits / this._performanceMetrics.loadAttempts) * 100 
                : 0
        };
    }
    
    clearCache() {
        const previousSize = this._loadedFonts.size;
        this._loadedFonts.clear();
        
        return { 
            success: true, 
            cleared: previousSize,
            remaining: this._fonts.size 
        };
    }
    
    getRegisteredFonts() {
        return Array.from(this._fonts.keys());
    }
    
    getLoadedFonts() {
        return Array.from(this._loadedFonts);
    }
    
    // ==================== ADVANCED FEATURES ====================
    
    async loadFontWithFallback(fontName, fallbackFonts = [], options = {}) {
        const primaryResult = await this.loadFont(fontName, options);
        
        if (primaryResult.success) {
            return { ...primaryResult, usedFallback: false };
        }
        
        // استفاده از فونت‌های جایگزین
        for (const fallbackFont of fallbackFonts) {
            const fallbackResult = await this.loadFont(fallbackFont, options);
            if (fallbackResult.success) {
                return { 
                    ...fallbackResult, 
                    usedFallback: true,
                    originalFont: fontName,
                    fallbackChain: fallbackFonts 
                };
            }
        }
        
        return { 
            success: false, 
            fontName,
            fallbackFonts,
            error: 'All fonts failed to load',
            errors: [primaryResult.error, ...fallbackFonts.map(() => 'Failed')]
        };
    }
    
    setFontDisplay(fontName, displayValue) {
        const fontId = this._normalizeFontId(fontName);
        
        if (!this._fonts.has(fontId)) {
            throw new Error(`Font "${fontId}" not registered`);
        }
        
        const config = this._fonts.get(fontId);
        const updatedConfig = { ...config, fontDisplay: displayValue };
        this._fonts.set(fontId, Object.freeze(updatedConfig));
        
        // اگر فونت لود شده، مجدداً اعمال کن
        if (this._loadedFonts.has(fontId)) {
            this.unloadFont(fontId);
            this.loadFont(fontId, updatedConfig);
        }
        
        return { success: true, fontId, display: displayValue };
    }
    
    createFontStack(fontNames, options = {}) {
        const stackId = `stack_${fontNames.join('_')}_${Date.now()}`;
        const stackConfig = {
            id: stackId,
            fonts: fontNames,
            defaultFont: fontNames[0],
            ...options
        };
        
        this._fonts.set(stackId, Object.freeze(stackConfig));
        
        // لود اولین فونت به عنوان پیش‌فرض
        if (options.autoLoadFirst) {
            this.loadFont(fontNames[0], options);
        }
        
        return stackId;
    }
    
    getFontCSS(fontName, options = {}) {
        const fontId = this._normalizeFontId(fontName);
        
        if (!this._fonts.has(fontId)) {
            throw new Error(`Font "${fontId}" not registered`);
        }
        
        const config = this._fonts.get(fontId);
        return this._generateFontCSS(config, options);
    }
    
    injectFontCSS(fontName, targetElement = document.head, options = {}) {
        const css = this.getFontCSS(fontName, options);
        const styleId = `font-css-${this._normalizeFontId(fontName)}`;
        
        // حذف استایل قدیمی اگر وجود دارد
        const existingStyle = document.getElementById(styleId);
        if (existingStyle) {
            existingStyle.remove();
        }
        
        // ایجاد استایل جدید
        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = css;
        targetElement.appendChild(styleElement);
        
        return styleId;
    }
    
    // ==================== PRIVATE METHODS ====================
    
    _getDefaultFonts() {
        return {
            'vazirmatn': {
                family: 'Vazirmatn',
                weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
                styles: ['normal'],
                subsets: ['arabic', 'persian', 'latin'],
                display: 'swap',
                formats: ['woff2', 'woff'],
                fallback: ['system-ui', '-apple-system', 'sans-serif'],
                path: 'vazirmatn/{weight}.{format}'
            },
            'system-ui': {
                family: 'system-ui',
                weights: [400],
                styles: ['normal'],
                subsets: [],
                display: 'auto',
                formats: [],
                fallback: ['-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
                system: true
            }
        };
    }
    
    _registerDefaultFonts() {
        for (const [fontName, config] of Object.entries(this._config.defaultFonts)) {
            this.registerFont(fontName, config);
        }
    }
    
    _createFontConfig(fontName, userConfig) {
        const isSystemFont = userConfig.system || fontName.startsWith('system-');
        
        return {
            family: userConfig.family || fontName,
            weights: userConfig.weights || [400],
            styles: userConfig.styles || ['normal'],
            subsets: userConfig.subsets || [],
            display: userConfig.display || this._config.fontDisplay,
            formats: userConfig.formats || (isSystemFont ? [] : ['woff2']),
            fallback: userConfig.fallback || ['sans-serif'],
            path: userConfig.path || '{family}/{weight}.{format}',
            system: isSystemFont,
            ...userConfig
        };
    }
    
    async _loadFontFace(fontConfig) {
        if (fontConfig.system) {
            return new FontFace(fontConfig.family, 'local("System")', {
                display: fontConfig.display
            });
        }
        
        const src = this._generateFontSrc(fontConfig);
        
        return new FontFace(
            fontConfig.family,
            src,
            {
                display: fontConfig.display,
                weight: fontConfig.weights[0]?.toString() || '400',
                style: fontConfig.styles[0] || 'normal'
            }
        );
    }
    
    _generateFontSrc(fontConfig) {
        const sources = [];
        
        // تولید آدرس برای هر فرمت
        for (const format of fontConfig.formats) {
            for (const weight of fontConfig.weights) {
                const path = this._resolveFontPath(fontConfig, weight, format);
                const url = `${this._config.fontBasePath}${path}`;
                sources.push(`url("${url}") format("${format}")`);
            }
        }
        
        // اضافه کردن فونت‌های محلی
        if (fontConfig.local) {
            for (const localName of Array.isArray(fontConfig.local) ? fontConfig.local : [fontConfig.local]) {
                sources.unshift(`local("${localName}")`);
            }
        }
        
        return sources.join(', ');
    }
    
    _resolveFontPath(fontConfig, weight, format) {
        if (typeof fontConfig.path === 'function') {
            return fontConfig.path({ weight, format, family: fontConfig.family });
        }
        
        return fontConfig.path
            .replace('{family}', fontConfig.family.toLowerCase().replace(/\s+/g, '-'))
            .replace('{weight}', weight)
            .replace('{format}', format)
            .replace('{style}', fontConfig.styles[0] || 'normal');
    }
    
    _generateFontCSS(fontConfig, options = {}) {
        const cssRules = [];
        const selector = options.selector || `*`;
        
        // تعریف @font-face
        for (const weight of fontConfig.weights) {
            for (const style of fontConfig.styles) {
                const src = this._generateFontSrc({ ...fontConfig, weights: [weight], styles: [style] });
                
                cssRules.push(`
@font-face {
    font-family: '${fontConfig.family}';
    font-style: ${style};
    font-weight: ${weight};
    font-display: ${fontConfig.display};
    src: ${src};
}`);
            }
        }
        
        // ایجاد font stack
        const fontStack = [
            `'${fontConfig.family}'`,
            ...fontConfig.fallback.map(f => f.includes(' ') ? `"${f}"` : f)
        ].join(', ');
        
        // اضافه کردن selector
        cssRules.push(`
${selector} {
    font-family: ${fontStack};
}`);
        
        return cssRules.join('\n');
    }
    
    _normalizeFontId(fontName) {
        return fontName.toLowerCase().trim().replace(/\s+/g, '-');
    }
    
    _notifyObservers(fontId, fontFace) {
        if (!this._fontObservers.has(fontId)) return;
        
        const event = {
            fontId,
            fontFace,
            timestamp: Date.now(),
            status: 'loaded'
        };
        
        for (const observer of this._fontObservers.get(fontId)) {
            try {
                observer(event);
            } catch (error) {
                console.error(`[FontManager] Observer error for font "${fontId}":`, error);
            }
        }
    }
    
    _preloadCriticalFonts() {
        const criticalFonts = Object.keys(this._config.defaultFonts)
            .filter(name => this._config.defaultFonts[name]?.critical);
        
        for (const fontName of criticalFonts) {
            this.loadFont(fontName, { priority: 'high' }).catch(() => {
                // خطاهای پیش‌بارگذاری را سایلنت کنیم
            });
        }
    }
    
    // ==================== UTILITY METHODS ====================
    
    static getSupportedFormats() {
        const tests = {
            woff2: 'font/woff2',
            woff: 'font/woff',
            ttf: 'font/ttf',
            otf: 'font/otf',
            eot: 'application/vnd.ms-fontobject'
        };
        
        const supported = [];
        const dummyElement = document.createElement('div');
        
        for (const [format, mime] of Object.entries(tests)) {
            try {
                const font = new FontFace('TestFont', `url("data:${mime};base64,") format("${format}")`);
                supported.push(format);
            } catch (e) {
                // فرمت پشتیبانی نمی‌شود
            }
        }
        
        return supported;
    }
    
    static isFontLoaded(fontFamily) {
        return document.fonts.check(`1em "${fontFamily}"`);
    }
}

// ==================== SINGLETON EXPORT ====================

let fontManagerInstance = null;

function getFontManager(eventSystem, config) {
    if (!fontManagerInstance) {
        fontManagerInstance = new VakamovaFontManager(eventSystem, config);
    }
    return fontManagerInstance;
}

function createFontManager(eventSystem, config) {
    return new VakamovaFontManager(eventSystem, config);
}

// ==================== DEFAULT CONFIGURATION ====================

const DEFAULT_FONT_CONFIG = {
    fontBasePath: 'assets/fonts/',
    defaultFonts: {
        'vazirmatn': {
            family: 'Vazirmatn',
            weights: [100, 200, 300, 400, 500, 600, 700, 800, 900],
            styles: ['normal'],
            subsets: ['arabic', 'persian', 'latin'],
            display: 'swap',
            formats: ['woff2'],
            fallback: ['system-ui', '-apple-system', 'sans-serif'],
            path: 'vazirmatn/{weight}.{format}',
            critical: true
        },
        'system-ui': {
            family: 'system-ui',
            weights: [400],
            styles: ['normal'],
            display: 'auto',
            formats: [],
            fallback: ['-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
            system: true
        }
    },
    enableCache: true,
    enablePreload: true,
    enablePerformanceMetrics: true,
    timeout: 10000
};

// ==================== EXPORT ====================

export {
    VakamovaFontManager,
    getFontManager,
    createFontManager,
    DEFAULT_FONT_CONFIG
};
