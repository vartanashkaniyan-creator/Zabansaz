/**
 * VAKAMOVA HEADER LAYOUT - سیستم نوار بالایی هوشمند
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * وابستگی داخلی: event_bus.js, state_manager.js, utils.js
 */

class VakamovaHeader {
    constructor(config = {}) {
        // اصل ۴: پیکربندی متمرکز
        this.config = Object.freeze({
            logoUrl: config.logoUrl || './assets/images/global/logo.svg',
            logoAlt: config.logoAlt || 'Vakamova Language Learning',
            menuItems: config.menuItems || [
                { id: 'home', label: 'خانه', icon: '🏠', route: '/home' },
                { id: 'lessons', label: 'درس‌ها', icon: '📚', route: '/lessons' },
                { id: 'practice', label: 'تمرین', icon: '💪', route: '/practice' },
                { id: 'progress', label: 'پیشرفت', icon: '📈', route: '/progress' },
                { id: 'profile', label: 'پروفایل', icon: '👤', route: '/profile' }
            ],
            userMenuItems: config.userMenuItems || [
                { id: 'settings', label: 'تنظیمات', icon: '⚙️' },
                { id: 'logout', label: 'خروج', icon: '🚪' }
            ],
            breakpoints: { mobile: 768, tablet: 1024 },
            animationSpeed: 300,
            ...config
        });
        
        // اصل ۱: تزریق وابستگی‌های داخلی
        this.eventBus = config.eventBus || window.eventBus;
        this.stateManager = config.stateManager || window.stateManager;
        this.utils = config.utils || window.utils;
        
        // وضعیت داخلی
        this.isMounted = false;
        this.currentUser = null;
        this.isMobileMenuOpen = false;
        this.headerElement = null;
        
        // Bind methods
        this.render = this.render.bind(this);
        this.updateUser = this.updateUser.bind(this);
        this.handleMenuClick = this.handleMenuClick.bind(this);
        this.handleSearch = this.handleSearch.bind(this);
        
        // اصل ۳: رویدادمحور - ثبت listeners
        this._registerEventListeners();
    }
    
    // ==================== CORE METHODS ====================
    
    async render(containerSelector = '#header-container') {
        const container = document.querySelector(containerSelector);
        if (!container) {
            throw new Error(`Container ${containerSelector} not found`);
        }
        
        this.headerElement = this._createHeaderElement();
        container.appendChild(this.headerElement);
        
        // بارگذاری وضعیت کاربر
        await this._loadUserState();
        
        // تنظیم واکنش‌گرایی
        this._setupResponsiveBehavior();
        
        this.isMounted = true;
        
        // اصل ۳: انتشار رویداد
        this.eventBus.emit('header:rendered', {
            timestamp: Date.now(),
            container: containerSelector
        });
        
        return this;
    }
    
    updateUser(userData) {
        if (!userData) return;
        
        this.currentUser = userData;
        
        // به‌روزرسانی بخش کاربر در هدر
        const userSection = this.headerElement?.querySelector('.header-user-section');
        if (userSection) {
            userSection.innerHTML = this._createUserSection();
        }
        
        this.eventBus.emit('header:user:updated', userData);
    }
    
    // ==================== PRIVATE RENDER METHODS ====================
    
    _createHeaderElement() {
        const header = document.createElement('header');
        header.className = 'vakamova-header';
        header.setAttribute('role', 'banner');
        
        header.innerHTML = `
            <div class="header-container">
                <!-- لوگو و برند -->
                <div class="header-brand">
                    <a href="/" class="logo-link" aria-label="${this.config.logoAlt}">
                        <img src="${this.config.logoUrl}" alt="${this.config.logoAlt}" class="header-logo">
                        <span class="brand-name">Vakamova</span>
                    </a>
                </div>
                
                <!-- منوی اصلی -->
                <nav class="header-nav" aria-label="منوی اصلی">
                    <ul class="nav-list" role="menubar">
                        ${this.config.menuItems.map(item => `
                            <li class="nav-item" role="none">
                                <a href="${item.route}" 
                                   class="nav-link" 
                                   role="menuitem"
                                   data-menu-id="${item.id}"
                                   aria-label="${item.label}">
                                    <span class="nav-icon">${item.icon}</span>
                                    <span class="nav-text">${item.label}</span>
                                </a>
                            </li>
                        `).join('')}
                    </ul>
                </nav>
                
                <!-- بخش جستجو -->
                <div class="header-search">
                    <div class="search-container">
                        <input type="search" 
                               class="search-input" 
                               placeholder="جستجوی درس یا واژه..."
                               aria-label="جستجو">
                        <button class="search-btn" aria-label="جستجو">
                            <span class="search-icon">🔍</span>
                        </button>
                    </div>
                </div>
                
                <!-- بخش کاربر -->
                <div class="header-user-section">
                    ${this._createUserSection()}
                </div>
                
                <!-- منوی موبایل -->
                <button class="mobile-menu-toggle" aria-label="منو" aria-expanded="false">
                    <span class="toggle-icon">☰</span>
                </button>
            </div>
            
            <!-- منوی موبایل (پنهان) -->
            <div class="mobile-menu-overlay" aria-hidden="true">
                <div class="mobile-menu-content">
                    <button class="mobile-menu-close" aria-label="بستن منو">✕</button>
                    <div class="mobile-user-info"></div>
                    <nav class="mobile-nav"></nav>
                </div>
            </div>
        `;
        
        // اعمال استایل‌های پایه
        this._applyBaseStyles(header);
        
        return header;
    }
    
    _createUserSection() {
        if (this.currentUser) {
            return `
                <div class="user-info">
                    <div class="user-avatar" aria-label="آواتار ${this.currentUser.name}">
                        ${this.currentUser.avatar || this.currentUser.name.charAt(0)}
                    </div>
                    <div class="user-details">
                        <span class="user-name">${this.currentUser.name}</span>
                        <span class="user-level">سطح ${this.currentUser.level || 'مبتدی'}</span>
                    </div>
                    <div class="user-dropdown">
                        <button class="dropdown-toggle" aria-label="منوی کاربر">
                            <span class="dropdown-icon">▼</span>
                        </button>
                        <div class="dropdown-menu" role="menu" aria-hidden="true">
                            ${this.config.userMenuItems.map(item => `
                                <button class="dropdown-item" 
                                        data-action="${item.id}"
                                        role="menuitem">
                                    <span class="item-icon">${item.icon}</span>
                                    <span class="item-text">${item.label}</span>
                                </button>
                            `).join('')}
                        </div>
                    </div>
                </div>
            `;
        }
        
        // حالت مهمان
        return `
            <div class="auth-buttons">
                <button class="auth-btn login-btn" data-action="login">
                    <span class="btn-icon">🔐</span>
                    <span class="btn-text">ورود</span>
                </button>
                <button class="auth-btn signup-btn" data-action="signup">
                    <span class="btn-icon">📝</span>
                    <span class="btn-text">ثبت‌نام</span>
                </button>
            </div>
        `;
    }
    
    // ==================== EVENT HANDLERS ====================
    
    handleMenuClick(event) {
        const menuItem = event.target.closest('[data-menu-id], [data-action]');
        if (!menuItem) return;
        
        const menuId = menuItem.dataset.menuId || menuItem.dataset.action;
        
        // اصل ۳: انتشار رویداد برای سیستم‌های دیگر
        this.eventBus.emit('header:menu:click', {
            menuId,
            element: menuItem,
            timestamp: Date.now(),
            user: this.currentUser
        });
        
        // اجرای اکشن‌های خاص
        switch(menuId) {
            case 'logout':
                this._handleLogout();
                break;
            case 'login':
                this._handleLogin();
                break;
            default:
                // ناوبری عادی
                if (menuItem.href) {
                    event.preventDefault();
                    this.eventBus.emit('router:navigate', {
                        route: menuItem.getAttribute('href')
                    });
                }
        }
    }
    
    handleSearch(event) {
        const searchInput = this.headerElement?.querySelector('.search-input');
        if (!searchInput) return;
        
        const query = searchInput.value.trim();
        if (query.length < 2) return;
        
        this.eventBus.emit('header:search', {
            query,
            timestamp: Date.now(),
            source: 'header'
        });
        
        // ذخیره در state
        this.stateManager?.set('search.lastQuery', query);
    }
    
    // ==================== PRIVATE UTILITIES ====================
    
    async _loadUserState() {
        // تلاش برای دریافت کاربر از state manager
        const user = this.stateManager?.get('auth.user') || 
                    this.stateManager?.get('user.current');
        
        if (user) {
            this.updateUser(user);
        }
        
        // گوش دادن به تغییرات کاربر
        this.eventBus?.on('auth:login', this.updateUser);
        this.eventBus?.on('auth:logout', () => this.updateUser(null));
    }
    
    _registerEventListeners() {
        // Event delegation برای کلیک‌ها
        document.addEventListener('click', (event) => {
            if (this.headerElement?.contains(event.target)) {
                this.handleMenuClick(event);
            }
        });
        
        // جستجو با دکمه Enter
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && 
                event.target.classList?.contains('search-input')) {
                this.handleSearch(event);
            }
        });
    }
    
    _setupResponsiveBehavior() {
        const toggleBtn = this.headerElement?.querySelector('.mobile-menu-toggle');
        const closeBtn = this.headerElement?.querySelector('.mobile-menu-close');
        const overlay = this.headerElement?.querySelector('.mobile-menu-overlay');
        
        if (toggleBtn && overlay) {
            toggleBtn.addEventListener('click', () => {
                this.isMobileMenuOpen = !this.isMobileMenuOpen;
                overlay.setAttribute('aria-hidden', !this.isMobileMenuOpen);
                toggleBtn.setAttribute('aria-expanded', this.isMobileMenuOpen);
                
                this.eventBus.emit('header:mobile:toggle', {
                    isOpen: this.isMobileMenuOpen
                });
            });
            
            closeBtn?.addEventListener('click', () => {
                this.isMobileMenuOpen = false;
                overlay.setAttribute('aria-hidden', 'true');
                toggleBtn.setAttribute('aria-expanded', 'false');
            });
        }
        
        // واکنش‌گرایی بر اساس عرض صفحه
        const mediaQuery = window.matchMedia(
            `(max-width: ${this.config.breakpoints.mobile}px)`
        );
        
        mediaQuery.addEventListener('change', (event) => {
            this.eventBus.emit('header:responsive:change', {
                isMobile: event.matches,
                width: window.innerWidth
            });
        });
    }
    
    _handleLogout() {
        this.eventBus.emit('auth:logout:request', {
            timestamp: Date.now(),
            source: 'header'
        });
        
        // ریست وضعیت
        this.updateUser(null);
    }
    
    _handleLogin() {
        this.eventBus.emit('auth:login:request', {
            timestamp: Date.now(),
            source: 'header'
        });
    }
    
    _applyBaseStyles(headerElement) {
        const style = document.createElement('style');
        style.textContent = `
            .vakamova-header {
                background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
                color: #f8fafc;
                padding: 1rem 2rem;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                position: sticky;
                top: 0;
                z-index: 1000;
                font-family: 'Vazirmatn', sans-serif;
            }
            
            .header-container {
                display: flex;
                align-items: center;
                justify-content: space-between;
                max-width: 1400px;
                margin: 0 auto;
                gap: 2rem;
            }
            
            .header-brand {
                display: flex;
                align-items: center;
                gap: 1rem;
            }
            
            .logo-link {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                text-decoration: none;
                color: inherit;
            }
            
            .header-logo {
                height: 40px;
                width: auto;
            }
            
            .brand-name {
                font-size: 1.5rem;
                font-weight: bold;
                background: linear-gradient(90deg, #38bdf8, #818cf8);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            
            .header-nav .nav-list {
                display: flex;
                gap: 1.5rem;
                list-style: none;
                margin: 0;
                padding: 0;
            }
            
            .nav-link {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                color: #cbd5e1;
                text-decoration: none;
                padding: 0.5rem 1rem;
                border-radius: 8px;
                transition: all 0.2s;
            }
            
            .nav-link:hover, .nav-link:focus {
                background: rgba(255, 255, 255, 0.1);
                color: #ffffff;
            }
            
            .header-search {
                flex: 1;
                max-width: 400px;
            }
            
            .search-container {
                display: flex;
                background: rgba(255, 255, 255, 0.1);
                border-radius: 10px;
                overflow: hidden;
            }
            
            .search-input {
                flex: 1;
                padding: 0.75rem 1rem;
                border: none;
                background: transparent;
                color: #f8fafc;
                font-family: 'Vazirmatn', sans-serif;
            }
            
            .search-input::placeholder {
                color: #94a3b8;
            }
            
            .search-btn {
                padding: 0.75rem 1.25rem;
                background: #3b82f6;
                border: none;
                color: white;
                cursor: pointer;
            }
            
            .user-info {
                display: flex;
                align-items: center;
                gap: 1rem;
                position: relative;
            }
            
            .user-avatar {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                background: linear-gradient(135deg, #8b5cf6, #3b82f6);
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: bold;
                color: white;
            }
            
            .mobile-menu-toggle {
                display: none;
                background: none;
                border: none;
                color: white;
                font-size: 1.5rem;
                cursor: pointer;
            }
            
            @media (max-width: 768px) {
                .header-nav, .header-search, .auth-buttons {
                    display: none;
                }
                
                .mobile-menu-toggle {
                    display: block;
                }
                
                .header-container {
                    gap: 1rem;
                }
            }
            
            /* سایر استایل‌ها برای dropdown و منوی موبایل */
        `;
        
        headerElement.appendChild(style);
    }
    
    // ==================== PUBLIC API (قرارداد رابط) ====================
    
    // اصل ۲: قرارداد رابط - متدهای عمومی ثابت
    
    updateConfig(newConfig) {
        // ادغام پیکربندی جدید
        this.config = Object.freeze({
            ...this.config,
            ...newConfig
        });
        
        this.eventBus.emit('header:config:updated', this.config);
        return this;
    }
    
    getCurrentState() {
        return {
            isMounted: this.isMounted,
            currentUser: this.currentUser,
            isMobileMenuOpen: this.isMobileMenuOpen,
            config: { ...this.config }
        };
    }
    
    destroy() {
        // پاک‌سازی event listeners
        document.removeEventListener('click', this.handleMenuClick);
        
        // حذف از DOM
        if (this.headerElement && this.headerElement.parentNode) {
            this.headerElement.parentNode.removeChild(this.headerElement);
        }
        
        this.isMounted = false;
        this.eventBus.emit('header:destroyed');
    }
}

// ==================== FACTORY & EXPORT ====================

// اصل ۱: تزریق وابستگی از طریق Factory
export function createHeader(config = {}) {
    return new VakamovaHeader(config);
}

// Export اصلی برای استفاده در سیستم
export default VakamovaHeader;

// ثبت در window برای دسترسی سریع (اختیاری)
if (typeof window !== 'undefined') {
    window.VakamovaHeader = VakamovaHeader;
    window.createHeader = createHeader;
    }
