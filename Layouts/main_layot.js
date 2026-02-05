/**
 * VAKAMOVA MAIN LAYOUT - سیستم قالب اصلی هوشمند
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * وابستگی داخلی: event_bus.js, state_manager.js, router.js, header.js, footer.js
 */

class VakamovaMainLayout {
    constructor(config = {}) {
        // اصل ۴: پیکربندی متمرکز
        this.config = Object.freeze({
            containerId: config.containerId || '#app',
            defaultPage: config.defaultPage || '/home',
            layoutType: config.layoutType || 'default', // default | dashboard | minimal
            showHeader: config.showHeader ?? true,
            showFooter: config.showFooter ?? true,
            showSidebar: config.showSidebar ?? false,
            sidebarPosition: config.sidebarPosition || 'right', // right | left
            transitionEffect: config.transitionEffect || 'fade', // fade | slide | none
            loadingIndicator: config.loadingIndicator || true,
            errorBoundary: config.errorBoundary ?? true,
            
            layoutStyles: config.layoutStyles || {
                headerHeight: '64px',
                footerHeight: 'auto',
                sidebarWidth: '280px',
                maxContentWidth: '1400px',
                mobileBreakpoint: '768px',
                zIndexes: { header: 1000, sidebar: 900, modal: 2000 }
            },
            
            // مسیرهای کامپوننت‌های لایه‌ای
            componentPaths: config.componentPaths || {
                header: './layouts/header.js',
                footer: './layouts/footer.js',
                sidebar: './layouts/sidebar.js'
            },
            
            // صفحه‌های استاتیک (مانند 404، loading)
            staticPages: config.staticPages || {
                loading: '<div class="layout-loading">در حال بارگذاری...</div>',
                notFound: '<div class="layout-404">صفحه مورد نظر یافت نشد</div>',
                error: '<div class="layout-error">خطا در بارگذاری صفحه</div>'
            },
            
            // تنظیمات پیشرفته
            enablePrefetch: config.enablePrefetch ?? true,
            enableCaching: config.enableCaching ?? true,
            cacheTTL: config.cacheTTL || 30000,
            performanceMonitoring: config.performanceMonitoring ?? true,
            ...config
        });
        
        // اصل ۱: تزریق وابستگی‌های داخلی
        this.eventBus = config.eventBus || window.eventBus;
        this.stateManager = config.stateManager || window.stateManager;
        this.router = config.router || window.router;
        this.utils = config.utils || window.utils;
        
        // ماژول‌های لایه‌ای (با lazy loading)
        this.components = {
            header: null,
            footer: null,
            sidebar: null
        };
        
        // وضعیت داخلی
        this.isMounted = false;
        this.isInitialized = false;
        this.currentPage = null;
        this.previousPage = null;
        this.layoutContainer = null;
        this.contentArea = null;
        
        // کش صفحات
        this.pageCache = new Map();
        this.prefetchQueue = new Set();
        
        // متدهای bind شده
        this.init = this.init.bind(this);
        this.renderPage = this.renderPage.bind(this);
        this.switchLayout = this.switchLayout.bind(this);
        this.handleRouteChange = this.handleRouteChange.bind(this);
        this.handleResize = this.handleResize.bind(this);
        
        // متریک‌های عملکرد
        this.metrics = {
            pageLoads: 0,
            avgLoadTime: 0,
            cacheHits: 0,
            errors: 0
        };
        
        // اصل ۳: رویدادمحور - ثبت listeners اولیه
        this._registerCoreListeners();
    }
    
    // ==================== CORE METHODS ====================
    
    async init() {
        if (this.isInitialized) {
            console.warn('[MainLayout] Already initialized');
            return this;
        }
        
        try {
            console.log('[MainLayout] Starting initialization...');
            
            // 1. پیدا کردن کانتینر اصلی
            this.layoutContainer = document.querySelector(this.config.containerId);
            if (!this.layoutContainer) {
                throw new Error(`Container ${this.config.containerId} not found`);
            }
            
            // 2. ایجاد ساختار DOM پایه
            this._createBaseStructure();
            
            // 3. بارگذاری lazy components
            await this._loadLayoutComponents();
            
            // 4. تنظیم event listeners
            this._setupEventListeners();
            
            // 5. تنظیم state اولیه
            await this._setupInitialState();
            
            this.isInitialized = true;
            
            // انتشار رویداد
            this.eventBus.emit('layout:initialized', {
                timestamp: Date.now(),
                containerId: this.config.containerId,
                layoutType: this.config.layoutType
            });
            
            console.log('[MainLayout] ✅ Successfully initialized');
            return this;
            
        } catch (error) {
            console.error('[MainLayout] ❌ Initialization failed:', error);
            this.eventBus.emit('layout:error', { 
                phase: 'init', 
                error: error.message 
            });
            throw error;
        }
    }
    
    async mount() {
        if (this.isMounted) return this;
        
        try {
            // 1. نمایش loading indicator
            if (this.config.loadingIndicator) {
                this._showLoading();
            }
            
            // 2. رندر هدر (اگر فعال باشد)
            if (this.config.showHeader && this.components.header) {
                await this.components.header.render('.layout-header-area');
                console.log('[MainLayout] Header rendered');
            }
            
            // 3. رندر sidebar (اگر فعال باشد)
            if (this.config.showSidebar && this.components.sidebar) {
                await this.components.sidebar.render('.layout-sidebar-area');
                console.log('[MainLayout] Sidebar rendered');
            }
            
            // 4. رندر فوتر (اگر فعال باشد)
            if (this.config.showFooter && this.components.footer) {
                await this.components.footer.render('.layout-footer-area');
                console.log('[MainLayout] Footer rendered');
            }
            
            // 5. بارگذاری صفحه اولیه
            await this._loadInitialPage();
            
            // 6. مخفی کردن loading
            if (this.config.loadingIndicator) {
                this._hideLoading();
            }
            
            // 7. فعال‌سازی prefetch (اگر فعال باشد)
            if (this.config.enablePrefetch) {
                this._startPrefetching();
            }
            
            this.isMounted = true;
            
            // انتشار رویداد
            this.eventBus.emit('layout:mounted', {
                timestamp: Date.now(),
                metrics: { ...this.metrics }
            });
            
            console.log('[MainLayout] 🚀 Successfully mounted');
            return this;
            
        } catch (error) {
            console.error('[MainLayout] ❌ Mount failed:', error);
            this.eventBus.emit('layout:error', { 
                phase: 'mount', 
                error: error.message 
            });
            
            // نمایش صفحه خطا
            this._showErrorPage(error);
            throw error;
        }
    }
    
    async renderPage(pageData) {
        const startTime = performance.now();
        
        try {
            const { pageId, content, metadata = {} } = pageData;
            
            // اعتبارسنجی
            if (!pageId || !content) {
                throw new Error('Invalid page data');
            }
            
            // ذخیره صفحه قبلی برای انیمیشن
            this.previousPage = this.currentPage;
            this.currentPage = pageId;
            
            // انتشار رویداد شروع رندر
            this.eventBus.emit('layout:page:render:start', {
                pageId,
                previousPage: this.previousPage,
                metadata
            });
            
            // اعمال افکت انتقال (اگر فعال باشد)
            if (this.config.transitionEffect !== 'none' && this.previousPage) {
                await this._applyTransition('out');
            }
            
            // رندر محتوا
            this.contentArea.innerHTML = content;
            
            // اجرای اسکریپت‌های درون صفحه
            this._executePageScripts();
            
            // اعمال افکت ورود
            if (this.config.transitionEffect !== 'none') {
                await this._applyTransition('in');
            }
            
            // به‌روزرسانی state
            this.stateManager?.set('layout.currentPage', {
                id: pageId,
                metadata,
                timestamp: Date.now()
            });
            
            // به‌روزرسانی متریک‌ها
            const loadTime = performance.now() - startTime;
            this.metrics.pageLoads++;
            this.metrics.avgLoadTime = 
                (this.metrics.avgLoadTime * (this.metrics.pageLoads - 1) + loadTime) / this.metrics.pageLoads;
            
            // انتشار رویداد موفقیت
            this.eventBus.emit('layout:page:rendered', {
                pageId,
                loadTime,
                metadata,
                metrics: { ...this.metrics }
            });
            
            // Prefetch صفحات مرتبط
            if (this.config.enablePrefetch && metadata.relatedPages) {
                this._prefetchPages(metadata.relatedPages);
            }
            
            console.log(`[MainLayout] ✅ Page "${pageId}" rendered in ${loadTime.toFixed(1)}ms`);
            
            return { success: true, loadTime };
            
        } catch (error) {
            console.error(`[MainLayout] ❌ Page render failed:`, error);
            
            this.metrics.errors++;
            this.eventBus.emit('layout:page:error', {
                pageId: pageData?.pageId,
                error: error.message,
                metrics: { ...this.metrics }
            });
            
            if (this.config.errorBoundary) {
                this._showErrorPage(error, pageData?.pageId);
            }
            
            return { success: false, error: error.message };
        }
    }
    
    async switchLayout(layoutType, options = {}) {
        const validLayouts = ['default', 'dashboard', 'minimal', 'fullscreen'];
        if (!validLayouts.includes(layoutType)) {
            throw new Error(`Invalid layout type: ${layoutType}`);
        }
        
        const oldLayout = this.config.layoutType;
        
        // انتشار رویداد شروع تغییر
        this.eventBus.emit('layout:switch:start', {
            from: oldLayout,
            to: layoutType,
            options
        });
        
        try {
            // 1. مخفی کردن کامپوننت‌های فعلی
            await this._hideLayoutComponents();
            
            // 2. به‌روزرسانی پیکربندی
            this.config = Object.freeze({
                ...this.config,
                layoutType,
                showHeader: options.showHeader ?? (layoutType !== 'minimal' && layoutType !== 'fullscreen'),
                showFooter: options.showFooter ?? (layoutType === 'default'),
                showSidebar: options.showSidebar ?? (layoutType === 'dashboard')
            });
            
            // 3. اعمال استایل‌های جدید
            this._applyLayoutStyles(layoutType);
            
            // 4. نمایش مجدد کامپوننت‌ها (اگر نیاز باشد)
            await this._showLayoutComponents();
            
            // 5. به‌روزرسانی state
            this.stateManager?.set('layout.current', {
                type: layoutType,
                changedAt: Date.now(),
                options
            });
            
            // انتشار رویداد موفقیت
            this.eventBus.emit('layout:switched', {
                from: oldLayout,
                to: layoutType,
                options,
                timestamp: Date.now()
            });
            
            console.log(`[MainLayout] 🔄 Layout switched from ${oldLayout} to ${layoutType}`);
            
            return { success: true, from: oldLayout, to: layoutType };
            
        } catch (error) {
            console.error(`[MainLayout] ❌ Layout switch failed:`, error);
            this.eventBus.emit('layout:switch:error', {
                from: oldLayout,
                to: layoutType,
                error: error.message
            });
            throw error;
        }
    }
    
    // ==================== EVENT HANDLERS ====================
    
    async handleRouteChange(event) {
        const { route, params = {}, query = {} } = event;
        
        try {
            // انتشار رویداد شروع تغییر مسیر
            this.eventBus.emit('layout:route:change:start', {
                route,
                params,
                query,
                previousRoute: this.currentPage
            });
            
            // بررسی کش
            const cacheKey = this._generateCacheKey(route, params, query);
            const cachedPage = this.pageCache.get(cacheKey);
            
            if (cachedPage && this.config.enableCaching) {
                // استفاده از صفحه کش شده
                this.metrics.cacheHits++;
                
                console.log(`[MainLayout] 🔄 Loading from cache: ${route}`);
                
                await this.renderPage({
                    pageId: route,
                    content: cachedPage.content,
                    metadata: cachedPage.metadata
                });
                
                return;
            }
            
            // نمایش loading (اگر فعال باشد)
            if (this.config.loadingIndicator) {
                this._showLoading();
            }
            
            // درخواست صفحه از router
            const pageData = await this.router.resolveRoute(route, params, query);
            
            if (!pageData) {
                throw new Error(`Route not resolved: ${route}`);
            }
            
            // رندر صفحه
            const result = await this.renderPage(pageData);
            
            if (result.success && this.config.enableCaching) {
                // ذخیره در کش
                this.pageCache.set(cacheKey, {
                    content: pageData.content,
                    metadata: pageData.metadata,
                    timestamp: Date.now(),
                    expiresAt: Date.now() + this.config.cacheTTL
                });
                
                // پاک‌سازی کش منقضی شده
                this._cleanupExpiredCache();
            }
            
            // مخفی کردن loading
            if (this.config.loadingIndicator) {
                this._hideLoading();
            }
            
            // انتشار رویداد موفقیت
            this.eventBus.emit('layout:route:changed', {
                route,
                params,
                query,
                loadTime: result.loadTime,
                cached: !!cachedPage
            });
            
        } catch (error) {
            console.error(`[MainLayout] ❌ Route change failed:`, error);
            
            // انتشار رویداد خطا
            this.eventBus.emit('layout:route:error', {
                route,
                params,
                query,
                error: error.message
            });
            
            // نمایش صفحه خطا
            if (this.config.errorBoundary) {
                this._showErrorPage(error, route);
            }
            
            // مخفی کردن loading
            if (this.config.loadingIndicator) {
                this._hideLoading();
            }
        }
    }
    
    handleResize() {
        const width = window.innerWidth;
        const isMobile = width <= parseInt(this.config.layoutStyles.mobileBreakpoint);
        
        // انتشار رویداد تغییر سایز
        this.eventBus.emit('layout:resize', {
            width,
            height: window.innerHeight,
            isMobile,
            previousWidth: this._lastWidth || width
        });
        
        this._lastWidth = width;
        
        // اعمال تغییرات برای موبایل
        if (isMobile) {
            this._adaptForMobile();
        } else {
            this._adaptForDesktop();
        }
    }
    
    // ==================== PRIVATE METHODS ====================
    
    _createBaseStructure() {
        // پاک‌سازی کانتینر
        this.layoutContainer.innerHTML = '';
        
        // ایجاد ساختار پایه
        this.layoutContainer.innerHTML = `
            <!-- Loading Indicator -->
            ${this.config.loadingIndicator ? 
                `<div class="layout-loading-indicator" aria-hidden="true">
                    <div class="loading-spinner"></div>
                    <div class="loading-text">در حال بارگذاری...</div>
                </div>` : ''}
            
            <!-- Error Boundary -->
            ${this.config.errorBoundary ? 
                `<div class="layout-error-boundary" aria-hidden="true"></div>` : ''}
            
            <!-- Layout Structure -->
            <div class="layout-wrapper" data-layout="${this.config.layoutType}">
                ${this.config.showHeader ? 
                    `<header class="layout-header-area" role="banner"></header>` : ''}
                
                <div class="layout-body">
                    ${this.config.showSidebar && this.config.sidebarPosition === 'left' ? 
                        `<aside class="layout-sidebar-area sidebar-left" role="complementary"></aside>` : ''}
                    
                    <main class="layout-content-area" role="main">
                        <div class="content-container" id="content-container"></div>
                    </main>
                    
                    ${this.config.showSidebar && this.config.sidebarPosition === 'right' ? 
                        `<aside class="layout-sidebar-area sidebar-right" role="complementary"></aside>` : ''}
                </div>
                
                ${this.config.showFooter ? 
                    `<footer class="layout-footer-area" role="contentinfo"></footer>` : ''}
            </div>
        `;
        
        // ذخیره ارجاع‌ها به عناصر مهم
        this.contentArea = this.layoutContainer.querySelector('#content-container');
        
        // اعمال استایل‌های پایه
        this._applyBaseStyles();
    }
    
    async _loadLayoutComponents() {
        const loadPromises = [];
        
        // بارگذاری هدر
        if (this.config.showHeader && this.config.componentPaths.header) {
            loadPromises.push(
                this._loadComponent('header', this.config.componentPaths.header)
                    .then(module => {
                        this.components.header = module.createHeader || module.default;
                    })
            );
        }
        
        // بارگذاری فوتر
        if (this.config.showFooter && this.config.componentPaths.footer) {
            loadPromises.push(
                this._loadComponent('footer', this.config.componentPaths.footer)
                    .then(module => {
                        this.components.footer = module.createFooter || module.default;
                    })
            );
        }
        
        // بارگذاری sidebar
        if (this.config.showSidebar && this.config.componentPaths.sidebar) {
            loadPromises.push(
                this._loadComponent('sidebar', this.config.componentPaths.sidebar)
                    .then(module => {
                        this.components.sidebar = module.createSidebar || module.default;
                    })
            );
        }
        
        // اجرای موازی بارگذاری
        await Promise.allSettled(loadPromises);
    }
    
    async _loadComponent(name, path) {
        try {
            const module = await import(path);
            console.log(`[MainLayout] ✅ Component "${name}" loaded`);
            return module;
        } catch (error) {
            console.warn(`[MainLayout] ⚠️ Failed to load component "${name}":`, error);
            this.eventBus.emit('layout:component:load:error', { name, path, error: error.message });
            return null;
        }
    }
    
    _setupEventListeners() {
        // گوش دادن به رویدادهای router
        if (this.eventBus) {
            this.eventBus.on('router:navigate', this.handleRouteChange);
            this.eventBus.on('router:route:changed', this.handleRouteChange);
        }
        
        // گوش دادن به تغییر سایز پنجره
        window.addEventListener('resize', this._debounce(this.handleResize, 250));
        
        // گوش دادن به کلیک‌های داخلی برای prefetch
        if (this.config.enablePrefetch) {
            document.addEventListener('mouseover', this._handleLinkHover.bind(this));
        }
        
        // گوش دادن به خطاهای جهانی
        if (this.config.errorBoundary) {
            window.addEventListener('error', this._handleGlobalError.bind(this));
            window.addEventListener('unhandledrejection', this._handlePromiseError.bind(this));
        }
    }
    
    async _setupInitialState() {
        // تنظیم state اولیه
        this.stateManager?.set('layout', {
            type: this.config.layoutType,
            components: {
                header: !!this.components.header,
                footer: !!this.components.footer,
                sidebar: !!this.components.sidebar
            },
            initialized: true,
            mounted: false
        });
        
        // تنظیم متریک‌ها
        this.stateManager?.set('layout.metrics', { ...this.metrics });
    }
    
    async _loadInitialPage() {
        try {
            // دریافت صفحه اولیه از router
            const initialPage = await this.router.resolveRoute(this.config.defaultPage);
            
            if (initialPage) {
                await this.renderPage(initialPage);
            } else {
                // استفاده از صفحه پیش‌فرض
                await this.renderPage({
                    pageId: 'home',
                    content: this.config.staticPages.loading,
                    metadata: { isDefault: true }
                });
            }
        } catch (error) {
            console.error('[MainLayout] ❌ Initial page load failed:', error);
            this._showErrorPage(error, this.config.defaultPage);
        }
    }
    
    _applyBaseStyles() {
        const style = document.createElement('style');
        style.textContent = `
            /* Base Layout Styles */
            .layout-wrapper {
                min-height: 100vh;
                display: flex;
                flex-direction: column;
                font-family: 'Vazirmatn', sans-serif;
            }
            
            .layout-body {
                flex: 1;
                display: flex;
                position: relative;
            }
            
            .layout-content-area {
                flex: 1;
                padding: 2rem;
                max-width: ${this.config.layoutStyles.maxContentWidth};
                margin: 0 auto;
                width: 100%;
            }
            
            .content-container {
                animation: fadeIn 0.3s ease;
            }
            
            .layout-header-area {
                height: ${this.config.layoutStyles.headerHeight};
                position: sticky;
                top: 0;
                z-index: ${this.config.layoutStyles.zIndexes.header};
            }
            
            .layout-footer-area {
                z-index: 10;
            }
            
            .layout-sidebar-area {
                width: ${this.config.layoutStyles.sidebarWidth};
                position: sticky;
                top: ${this.config.layoutStyles.headerHeight};
                height: calc(100vh - ${this.config.layoutStyles.headerHeight});
                overflow-y: auto;
                z-index: ${this.config.layoutStyles.zIndexes.sidebar};
            }
            
            .sidebar-left {
                order: -1;
                border-right: 1px solid #e2e8f0;
            }
            
            .sidebar-right {
                order: 2;
                border-left: 1px solid #e2e8f0;
            }
            
            /* Loading Indicator */
            .layout-loading-indicator {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(255, 255, 255, 0.9);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: ${this.config.layoutStyles.zIndexes.modal + 1};
                transition: opacity 0.3s ease;
            }
            
            .layout-loading-indicator[aria-hidden="true"] {
                opacity: 0;
                pointer-events: none;
            }
            
            .loading-spinner {
                width: 50px;
                height: 50px;
                border: 5px solid #e2e8f0;
                border-top-color: #3b82f6;
                border-radius: 50%;
                animation: spin 1s linear infinite;
                margin-bottom: 1rem;
            }
            
            .loading-text {
                color: #475569;
                font-size: 1.1rem;
            }
            
            /* Error Boundary */
            .layout-error-boundary {
                position: fixed;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(239, 68, 68, 0.1);
                z-index: ${this.config.layoutStyles.zIndexes.modal};
                display: none;
            }
            
            /* Transitions */
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes slideInRight {
                from { transform: translateX(100%); }
                to { transform: translateX(0); }
            }
            
            @keyframes slideInLeft {
                from { transform: translateX(-100%); }
                to { transform: translateX(0); }
            }
            
            @keyframes spin {
                to { transform: rotate(360deg); }
            }
            
            /* Responsive */
            @media (max-width: ${this.config.layoutStyles.mobileBreakpoint}) {
                .layout-body {
                    flex-direction: column;
                }
                
                .layout-sidebar-area {
                    width: 100%;
                    height: auto;
                    position: static;
                    order: 2;
                }
                
                .layout-content-area {
                    padding: 1rem;
                    order: 1;
                }
                
                .sidebar-left, .sidebar-right {
                    border: none;
                    border-top: 1px solid #e2e8f0;
                }
            }
            
            /* Layout Variations */
            .layout-wrapper[data-layout="minimal"] .layout-header-area,
            .layout-wrapper[data-layout="minimal"] .layout-footer-area,
            .layout-wrapper[data-layout="fullscreen"] .layout-header-area,
            .layout-wrapper[data-layout="fullscreen"] .layout-footer-area,
            .layout-wrapper[data-layout="fullscreen"] .layout-sidebar-area {
                display: none;
            }
            
            .layout-wrapper[data-layout="fullscreen"] .layout-content-area {
                padding: 0;
                max-width: none;
            }
            
            .layout-wrapper[data-layout="dashboard"] .layout-sidebar-area {
                display: block;
            }
        `;
        
        document.head.appendChild(style);
    }
    
    // ==================== TRANSITION METHODS ====================
    
    async _applyTransition(direction) {
        if (this.config.transitionEffect === 'none') return;
        
        const contentContainer = this.contentArea;
        if (!contentContainer) return;
        
        // اعمال کلاس‌های transition
        contentContainer.classList.remove('transition-in', 'transition-out');
        contentContainer.classList.add(`transition-${direction}`);
        
        // انتظار برای پایان انیمیشن
        return new Promise(resolve => {
            const onTransitionEnd = () => {
                contentContainer.removeEventListener('transitionend', onTransitionEnd);
                contentContainer.classList.remove(`transition-${direction}`);
                resolve();
            };
            
            contentContainer.addEventListener('transitionend', onTransitionEnd);
            
            // Fallback timeout
            setTimeout(resolve, this.config.transitionEffect === 'fade' ? 300 : 500);
        });
    }
    
    // ==================== CACHE MANAGEMENT ====================
    
    _generateCacheKey(route, params, query) {
        return `${route}:${JSON.stringify(params)}:${JSON.stringify(query)}`;
    }
    
    _cleanupExpiredCache() {
        const now = Date.now();
        for (const [key, value] of this.pageCache.entries()) {
            if (value.expiresAt < now) {
                this.pageCache.delete(key);
            }
        }
    }
    
    // ==================== PREFETCHING ====================
    
    _startPrefetching() {
        // Prefetch صفحات پرکاربرد
        const popularPages = ['/home', '/lessons', '/practice', '/profile'];
        setTimeout(() => {
            this._prefetchPages(popularPages);
        }, 2000);
    }
    
    async _prefetchPages(pageUrls) {
        for (const url of pageUrls) {
            if (this.prefetchQueue.has(url) || this.pageCache.has(url)) continue;
            
            this.prefetchQueue.add(url);
            
            try {
                const pageData = await this.router.resolveRoute(url);
                if (pageData) {
                    this.pageCache.set(url, {
                        content: pageData.content,
                        metadata: pageData.metadata,
                        timestamp: Date.now(),
                        expiresAt: Date.now() + this.config.cacheTTL,
                        prefetched: true
                    });
                    
                    this.eventBus.emit('layout:page:prefetched', { url });
                }
            } catch (error) {
                // خطای prefetch نادیده گرفته می‌شود
            } finally {
                this.prefetchQueue.delete(url);
            }
        }
    }
    
    _handleLinkHover(event) {
        const link = event.target.closest('a[href^="/"]');
        if (!link) return;
        
        const href = link.getAttribute('href');
        if (href && !this.prefetchQueue.has(href) && !this.pageCache.has(href)) {
            // تاخیر برای prefetch
            setTimeout(() => {
                if (link.matches(':hover')) {
                    this._prefetchPages([href]);
                }
            }, 100);
        }
    }
    
    // ==================== ERROR HANDLING ====================
    
    _showErrorPage(error, pageId = 'unknown') {
        const errorContent = `
            <div class="error-page">
                <div class="error-icon">⚠️</div>
                <h1 class="error-title">خطا در بارگذاری صفحه</h1>
                <p class="error-message">${error.message || 'خطای نامشخص'}</p>
                <p class="error-page-id">صفحه: ${pageId}</p>
                <div class="error-actions">
                    <button class="error-retry" data-action="retry">تلاش مجدد</button>
                    <button class="error-home" data-action="home">بازگشت به خانه</button>
                </div>
                <details class="error-details">
                    <summary>جزئیات فنی</summary>
                    <pre>${error.stack || 'No stack trace'}</pre>
                </details>
            </div>
        `;
        
        this.contentArea.innerHTML = errorContent;
        
        // اضافه کردن event listeners برای دکمه‌ها
        this.contentArea.querySelector('.error-retry')?.addEventListener('click', () => {
            this.handleRouteChange({ route: pageId });
        });
        
        this.contentArea.querySelector('.error-home')?.addEventListener('click', () => {
            this.handleRouteChange({ route: '/home' });
        });
    }
    
    _handleGlobalError(event) {
        if (!this.config.errorBoundary) return;
        
        console.error('[MainLayout] Global error:', event.error);
        
        this.eventBus.emit('layout:global:error', {
            message: event.message,
            error: event.error,
            timestamp: Date.now()
        });
    }
    
    _handlePromiseError(event) {
        if (!this.config.errorBoundary) return;
        
        console.error('[MainLayout] Unhandled promise rejection:', event.reason);
        
        this.eventBus.emit('layout:promise:error', {
            reason: event.reason,
            timestamp: Date.now()
        });
    }
    
    // ==================== RESPONSIVE METHODS ====================
    
    _adaptForMobile() {
        this.layoutContainer?.classList.add('mobile-view');
        this.layoutContainer?.classList.remove('desktop-view');
        
        // مخفی کردن sidebar در موبایل (اگر تنظیم نشده باشد)
        if (!this.config.showSidebarOnMobile) {
            this.layoutContainer?.querySelector('.layout-sidebar-area')?.style.setProperty('display', 'none');
        }
    }
    
    _adaptForDesktop() {
        this.layoutContainer?.classList.add('desktop-view');
        this.layoutContainer?.classList.remove('mobile-view');
        
        // نمایش مجدد sidebar
        if (this.config.showSidebar) {
            this.layoutContainer?.querySelector('.layout-sidebar-area')?.style.removeProperty('display');
        }
    }
    
    // ==================== COMPONENT MANAGEMENT ====================
    
    async _hideLayoutComponents() {
        const hidePromises = [];
        
        if (this.components.header && this.components.header.destroy) {
            hidePromises.push(Promise.resolve(this.components.header.destroy()));
        }
        
        if (this.components.footer && this.components.footer.destroy) {
            hidePromises.push(Promise.resolve(this.components.footer.destroy()));
        }
        
        if (this.components.sidebar && this.components.sidebar.destroy) {
            hidePromises.push(Promise.resolve(this.components.sidebar.destroy()));
        }
        
        await Promise.allSettled(hidePromises);
    }
    
    async _showLayoutComponents() {
        const showPromises = [];
        
        if (this.config.showHeader && this.components.header && this.components.header.render) {
            showPromises.push(
                this.components.header.render('.layout-header-area').catch(console.error)
            );
        }
        
        if (this.config.showFooter && this.components.footer && this.components.footer.render) {
            showPromises.push(
                this.components.footer.render('.layout-footer-area').catch(console.error)
            );
        }
        
        if (this.config.showSidebar && this.components.sidebar && this.components.sidebar.render) {
            const selector = this.config.sidebarPosition === 'left' ? '.sidebar-left' : '.sidebar-right';
            showPromises.push(
                this.components.sidebar.render(selector).catch(console.error)
            );
        }
        
        await Promise.allSettled(showPromises);
    }
    
    _applyLayoutStyles(layoutType) {
        const wrapper = this.layoutContainer?.querySelector('.layout-wrapper');
        if (wrapper) {
            wrapper.setAttribute('data-layout', layoutType);
            wrapper.className = `layout-wrapper layout-${layoutType}`;
        }
    }
    
    // ==================== UTILITY METHODS ====================
    
    _showLoading() {
        const loadingEl = this.layoutContainer?.querySelector('.layout-loading-indicator');
        if (loadingEl) {
            loadingEl.setAttribute('aria-hidden', 'false');
        }
    }
    
    _hideLoading() {
        const loadingEl = this.layoutContainer?.querySelector('.layout-loading-indicator');
        if (loadingEl) {
            loadingEl.setAttribute('aria-hidden', 'true');
        }
    }
    
    _executePageScripts() {
        // اجرای اسکریپت‌های داخل صفحه
        const scripts = this.contentArea.querySelectorAll('script');
        scripts.forEach(script => {
            const newScript = document.createElement('script');
            if (script.src) {
                newScript.src = script.src;
            } else {
                newScript.textContent = script.textContent;
            }
            
            // کپی سایر attributes
            Array.from(script.attributes).forEach(attr => {
                newScript.setAttribute(attr.name, attr.value);
            });
            
            script.parentNode.replaceChild(newScript, script);
        });
    }
    
    _debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
    
    _registerCoreListeners() {
        // گوش دادن به رویدادهای سیستمی
        if (this.eventBus) {
            this.eventBus.on('app:language:changed', (event) => {
                this._handleLanguageChange(event);
            });
            
            this.eventBus.on('auth:login', (user) => {
                this._handleUserLogin(user);
            });
            
            this.eventBus.on('auth:logout', () => {
                this._handleUserLogout();
            });
        }
    }
    
    _handleLanguageChange(event) {
        // به‌روزرسانی layout برای زبان جدید
        const rtlLanguages = ['fa', 'ar', 'he'];
        const isRTL = rtlLanguages.includes(event.languageCode);
        
        document.documentElement.setAttribute('dir', isRTL ? 'rtl' : 'ltr');
        document.documentElement.setAttribute('lang', event.languageCode);
        
        this.eventBus.emit('layout:language:changed', {
            language: event.languageCode,
            isRTL,
            timestamp: Date.now()
        });
    }
    
    _handleUserLogin(user) {
        // به‌روزرسانی layout برای کاربر لاگین شده
        if (this.components.header && this.components.header.updateUser) {
            this.components.header.updateUser(user);
        }
        
        // تغییر layout به dashboard (اگر کاربر جدید باشد)
        if (user.isNewUser) {
            this.switchLayout('dashboard');
        }
    }
    
    _handleUserLogout() {
        // بازنشانی layout به حالت پیش‌فرض
        this.switchLayout('default');
        
        if (this.components.header && this.components.header.updateUser) {
            this.components.header.updateUser(null);
        }
    }
    
    // ==================== PUBLIC API (قرارداد رابط) ====================
    
    // اصل ۲: قرارداد رابط - متدهای عمومی ثابت
    
    getCurrentState() {
        return {
            isInitialized: this.isInitialized,
            isMounted: this.isMounted,
            currentPage: this.currentPage,
            previousPage: this.previousPage,
            layoutType: this.config.layoutType,
            components: Object.keys(this.components).filter(key => this.components[key]),
            metrics: { ...this.metrics },
            cacheSize: this.pageCache.size
        };
    }
    
    clearCache() {
        const size = this.pageCache.size;
        this.pageCache.clear();
        
        this.eventBus.emit('layout:cache:cleared', { 
            clearedItems: size,
            timestamp: Date.now() 
        });
        
        return { clearedItems: size };
    }
    
    getPerformanceMetrics() {
        return {
            ...this.metrics,
            cacheHitRate: this.metrics.pageLoads > 0 ? 
                (this.metrics.cacheHits / this.metrics.pageLoads) * 100 : 0
        };
    }
    
    destroy() {
        // پاک‌سازی event listeners
        if (this.eventBus) {
            this.eventBus.off('router:navigate', this.handleRouteChange);
            this.eventBus.off('router:route:changed', this.handleRouteChange);
        }
        
        window.removeEventListener('resize', this.handleResize);
        document.removeEventListener('mouseover', this._handleLinkHover);
        
        // پاک‌سازی کامپوننت‌ها
        Object.values(this.components).forEach(component => {
            if (component && component.destroy) {
                component.destroy();
            }
        });
        
        // پاک‌سازی کش
        this.pageCache.clear();
        this.prefetchQueue.clear();
        
        // پاک‌سازی DOM
        if (this.layoutContainer) {
            this.layoutContainer.innerHTML = '';
        }
        
        this.isInitialized = false;
        this.isMounted = false;
        
        this.eventBus.emit('layout:destroyed');
        
        console.log('[MainLayout] 🗑️ Successfully destroyed');
    }
}

// ==================== FACTORY & EXPORT ====================

// اصل ۱: تزریق وابستگی از طریق Factory
export function createMainLayout(config = {}) {
    return new VakamovaMainLayout(config);
}

// Export اصلی برای استفاده در سیستم
export default VakamovaMainLayout;

// ثبت در window برای دسترسی سریع (اختیاری)
if (typeof window !== 'undefined') {
    window.VakamovaMainLayout = VakamovaMainLayout;
    window.createMainLayout = createMainLayout;
}
