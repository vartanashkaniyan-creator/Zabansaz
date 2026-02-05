/**
 * VAKAMOVA FOOTER LAYOUT - سیستم نوار پایینی هوشمند
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * وابستگی داخلی: event_bus.js, utils.js
 */

class VakamovaFooter {
    constructor(config = {}) {
        // اصل ۴: پیکربندی متمرکز
        this.config = Object.freeze({
            companyName: config.companyName || 'Vakamova Language Learning',
            copyrightText: config.copyrightText || `© ${new Date().getFullYear()} Vakamova. تمامی حقوق محفوظ است.`,
            showLanguageSelector: config.showLanguageSelector ?? true,
            showSocialLinks: config.showSocialLinks ?? true,
            showQuickLinks: config.showQuickLinks ?? true,
            showAppDownload: config.showAppDownload ?? false,
            
            languages: config.languages || [
                { code: 'fa', name: 'فارسی', flag: '🇮🇷' },
                { code: 'en', name: 'English', flag: '🇺🇸' },
                { code: 'ar', name: 'العربية', flag: '🇸🇦' },
                { code: 'tr', name: 'Türkçe', flag: '🇹🇷' },
                { code: 'de', name: 'Deutsch', flag: '🇩🇪' }
            ],
            
            socialLinks: config.socialLinks || [
                { platform: 'telegram', url: '#', icon: '📱', label: 'تلگرام' },
                { platform: 'instagram', url: '#', icon: '📸', label: 'اینستاگرام' },
                { platform: 'twitter', url: '#', icon: '🐦', label: 'توییتر' },
                { platform: 'github', url: '#', icon: '💻', label: 'گیت‌هاب' }
            ],
            
            quickLinks: config.quickLinks || [
                { title: 'درباره ما', url: '/about', icon: 'ℹ️' },
                { title: 'قوانین', url: '/terms', icon: '📜' },
                { title: 'حریم خصوصی', url: '/privacy', icon: '🔒' },
                { title: 'پشتیبانی', url: '/support', icon: '🛟' },
                { title: 'وبلاگ', url: '/blog', icon: '✍️' }
            ],
            
            appStores: config.appStores || [
                { store: 'google-play', url: '#', icon: '📱', label: 'Google Play' },
                { store: 'app-store', url: '#', icon: '🍎', label: 'App Store' }
            ],
            
            theme: config.theme || 'dark', // dark | light
            currentLanguage: config.currentLanguage || 'fa',
            ...config
        });
        
        // اصل ۱: تزریق وابستگی‌های داخلی
        this.eventBus = config.eventBus || window.eventBus;
        this.utils = config.utils || window.utils;
        this.stateManager = config.stateManager || window.stateManager;
        
        // وضعیت داخلی
        this.isMounted = false;
        this.footerElement = null;
        this.currentYear = new Date().getFullYear();
        
        // Bind methods
        this.render = this.render.bind(this);
        this.updateLanguage = this.updateLanguage.bind(this);
        this.handleLinkClick = this.handleLinkClick.bind(this);
        this.handleLanguageChange = this.handleLanguageChange.bind(this);
        
        // اصل ۳: رویدادمحور - ثبت listeners
        this._registerEventListeners();
    }
    
    // ==================== CORE METHODS ====================
    
    async render(containerSelector = '#footer-container') {
        const container = document.querySelector(containerSelector);
        if (!container) {
            throw new Error(`Container ${containerSelector} not found`);
        }
        
        this.footerElement = this._createFooterElement();
        container.appendChild(this.footerElement);
        
        // بارگذاری وضعیت زبان
        await this._loadLanguageState();
        
        this.isMounted = true;
        
        // اصل ۳: انتشار رویداد
        this.eventBus.emit('footer:rendered', {
            timestamp: Date.now(),
            container: containerSelector
        });
        
        return this;
    }
    
    updateLanguage(languageCode) {
        if (!languageCode || languageCode === this.config.currentLanguage) return;
        
        // به‌روزرسانی پیکربندی
        this.config = Object.freeze({
            ...this.config,
            currentLanguage: languageCode
        });
        
        // به‌روزرسانی بخش زبان در فوتر
        const langSelector = this.footerElement?.querySelector('.footer-language-selector');
        if (langSelector) {
            langSelector.innerHTML = this._createLanguageSelector();
        }
        
        // به‌روزرسانی متن‌های ترجمه‌شده
        this._updateTranslatedTexts();
        
        this.eventBus.emit('footer:language:changed', {
            languageCode,
            previousLanguage: this.config.currentLanguage,
            timestamp: Date.now()
        });
        
        // ذخیره در state
        this.stateManager?.set('app.language', languageCode);
        
        return this;
    }
    
    // ==================== PRIVATE RENDER METHODS ====================
    
    _createFooterElement() {
        const footer = document.createElement('footer');
        footer.className = `vakamova-footer theme-${this.config.theme}`;
        footer.setAttribute('role', 'contentinfo');
        
        footer.innerHTML = `
            <div class="footer-container">
                <!-- بخش بالایی فوتر -->
                <div class="footer-top">
                    <!-- لوگو و توضیحات -->
                    <div class="footer-brand">
                        <div class="footer-logo" aria-label="${this.config.companyName}">
                            <span class="logo-icon">🌐</span>
                            <span class="logo-text">Vakamova</span>
                        </div>
                        <p class="footer-description">
                            پلتفرم آموزش ۱۲ زبان زنده دنیا با متدهای مدرن و تعاملی
                        </p>
                        
                        ${this.config.showAppDownload ? this._createAppDownloadSection() : ''}
                    </div>
                    
                    <!-- لینک‌های سریع -->
                    ${this.config.showQuickLinks ? `
                    <div class="footer-links">
                        <h3 class="links-title">دسترسی سریع</h3>
                        <ul class="links-list" role="list">
                            ${this.config.quickLinks.map(link => `
                                <li class="link-item" role="listitem">
                                    <a href="${link.url}" 
                                       class="link-anchor"
                                       data-link-type="quick"
                                       data-link-target="${link.url}">
                                        <span class="link-icon">${link.icon}</span>
                                        <span class="link-text">${link.title}</span>
                                    </a>
                                </li>
                            `).join('')}
                        </ul>
                    </div>
                    ` : ''}
                    
                    <!-- انتخابگر زبان -->
                    ${this.config.showLanguageSelector ? `
                    <div class="footer-language">
                        <h3 class="language-title">زبان رابط</h3>
                        <div class="footer-language-selector">
                            ${this._createLanguageSelector()}
                        </div>
                    </div>
                    ` : ''}
                </div>
                
                <!-- جداکننده -->
                <div class="footer-divider"></div>
                
                <!-- بخش پایینی فوتر -->
                <div class="footer-bottom">
                    <!-- کپی‌رایت -->
                    <div class="footer-copyright">
                        <p class="copyright-text">
                            ${this.config.copyrightText.replace('{year}', this.currentYear)}
                        </p>
                        <p class="footer-version">نسخه: ۱.۰.۰</p>
                    </div>
                    
                    <!-- لینک‌های اجتماعی -->
                    ${this.config.showSocialLinks ? `
                    <div class="footer-social">
                        <div class="social-title">شبکه‌های اجتماعی</div>
                        <div class="social-links">
                            ${this.config.socialLinks.map(social => `
                                <a href="${social.url}" 
                                   class="social-link"
                                   data-social="${social.platform}"
                                   aria-label="${social.label}">
                                    <span class="social-icon">${social.icon}</span>
                                    <span class="social-label">${social.label}</span>
                                </a>
                            `).join('')}
                        </div>
                    </div>
                    ` : ''}
                </div>
                
                <!-- پیام پویا -->
                <div class="footer-dynamic">
                    <div class="dynamic-message" id="footer-message">
                        ${this._getDynamicMessage()}
                    </div>
                    <div class="footer-stats" id="footer-stats">
                        <!-- آمار به صورت پویا پر می‌شود -->
                    </div>
                </div>
            </div>
        `;
        
        // اعمال استایل‌های پایه
        this._applyBaseStyles(footer);
        
        // به‌روزرسانی آمار پویا
        this._updateDynamicStats();
        
        return footer;
    }
    
    _createLanguageSelector() {
        const currentLang = this.config.languages.find(l => l.code === this.config.currentLanguage);
        
        return `
            <div class="language-dropdown">
                <button class="language-current" aria-label="تغییر زبان" aria-expanded="false">
                    <span class="current-flag">${currentLang?.flag || '🏳️'}</span>
                    <span class="current-name">${currentLang?.name || 'فارسی'}</span>
                    <span class="dropdown-arrow">▼</span>
                </button>
                <div class="language-options" role="listbox" aria-hidden="true">
                    ${this.config.languages.map(lang => `
                        <button class="language-option ${lang.code === this.config.currentLanguage ? 'selected' : ''}"
                                data-lang="${lang.code}"
                                role="option"
                                aria-selected="${lang.code === this.config.currentLanguage}">
                            <span class="option-flag">${lang.flag}</span>
                            <span class="option-name">${lang.name}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    _createAppDownloadSection() {
        return `
            <div class="app-download">
                <div class="download-title">دانلود اپلیکیشن</div>
                <div class="store-buttons">
                    ${this.config.appStores.map(store => `
                        <a href="${store.url}" class="store-button" data-store="${store.store}">
                            <span class="store-icon">${store.icon}</span>
                            <span class="store-label">${store.label}</span>
                        </a>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    _getDynamicMessage() {
        const hour = new Date().getHours();
        let message;
        
        if (hour < 12) message = 'صبحتان بخیر! روزی پر از یادگیری داشته باشید 🌅';
        else if (hour < 18) message = 'عصر خوبی داشته باشید! وقت مناسبی برای تمرین زبان است ☕';
        else message = 'شب بخیر! یادگیری زبان خواب‌هایتان را شیرین می‌کند 🌙';
        
        return message;
    }
    
    // ==================== EVENT HANDLERS ====================
    
    handleLinkClick(event) {
        const link = event.target.closest('[data-link-type], [data-social], [data-store]');
        if (!link) return;
        
        const linkType = link.dataset.linkType || link.dataset.social || link.dataset.store;
        const target = link.href || link.dataset.linkTarget;
        
        // اصل ۳: انتشار رویداد
        this.eventBus.emit('footer:link:click', {
            type: linkType,
            target,
            timestamp: Date.now(),
            element: link
        });
        
        // جلوگیری از ناوبری مستقیم برای برخی لینک‌ها
        if (linkType === 'social' || linkType === 'store') {
            event.preventDefault();
            
            // شبیه‌سازی باز کردن در tab جدید
            window.open(target, '_blank', 'noopener,noreferrer');
        }
        
        // برای لینک‌های داخلی، از سیستم router پروژه استفاده کنید
        if (linkType === 'quick' && target.startsWith('/')) {
            event.preventDefault();
            this.eventBus.emit('router:navigate', { route: target });
        }
    }
    
    handleLanguageChange(event) {
        const langButton = event.target.closest('[data-lang]');
        if (!langButton) return;
        
        const newLanguage = langButton.dataset.lang;
        this.updateLanguage(newLanguage);
        
        // بستن dropdown
        const dropdown = this.footerElement?.querySelector('.language-options');
        if (dropdown) {
            dropdown.setAttribute('aria-hidden', 'true');
        }
    }
    
    // ==================== PRIVATE UTILITIES ====================
    
    async _loadLanguageState() {
        // تلاش برای دریافت زبان از state manager
        const savedLanguage = this.stateManager?.get('app.language') || 
                            this.stateManager?.get('user.preferredLanguage');
        
        if (savedLanguage && savedLanguage !== this.config.currentLanguage) {
            this.updateLanguage(savedLanguage);
        }
        
        // گوش دادن به تغییرات زبان
        this.eventBus?.on('app:language:changed', (event) => {
            if (event.languageCode) {
                this.updateLanguage(event.languageCode);
            }
        });
    }
    
    _registerEventListeners() {
        // Event delegation برای کلیک‌ها
        document.addEventListener('click', (event) => {
            if (this.footerElement?.contains(event.target)) {
                this.handleLinkClick(event);
                this.handleLanguageChange(event);
                
                // مدیریت باز/بستن dropdown زبان
                if (event.target.closest('.language-current')) {
                    const dropdown = this.footerElement?.querySelector('.language-options');
                    if (dropdown) {
                        const isHidden = dropdown.getAttribute('aria-hidden') === 'true';
                        dropdown.setAttribute('aria-hidden', !isHidden);
                        event.target.setAttribute('aria-expanded', isHidden);
                    }
                }
            }
        });
        
        // به‌روزرسانی پیام پویا هر ساعت
        setInterval(() => {
            const messageEl = this.footerElement?.querySelector('#footer-message');
            if (messageEl) {
                messageEl.textContent = this._getDynamicMessage();
            }
        }, 3600000); // هر ساعت
    }
    
    _updateTranslatedTexts() {
        // اینجا می‌توانید متن‌های ترجمه‌شده را بر اساس زبان به‌روز کنید
        const translations = {
            fa: {
                description: 'پلتفرم آموزش ۱۲ زبان زنده دنیا با متدهای مدرن و تعاملی',
                quickLinks: 'دسترسی سریع',
                languageTitle: 'زبان رابط',
                socialTitle: 'شبکه‌های اجتماعی',
                downloadTitle: 'دانلود اپلیکیشن'
            },
            en: {
                description: 'Platform for learning 12 living languages with modern and interactive methods',
                quickLinks: 'Quick Links',
                languageTitle: 'Interface Language',
                socialTitle: 'Social Networks',
                downloadTitle: 'Download App'
            }
            // ترجمه‌های سایر زبان‌ها...
        };
        
        const currentLang = this.config.currentLanguage;
        const texts = translations[currentLang] || translations.fa;
        
        // به‌روزرسانی عناصر
        const elements = {
            '.footer-description': texts.description,
            '.links-title': texts.quickLinks,
            '.language-title': texts.languageTitle,
            '.social-title': texts.socialTitle,
            '.download-title': texts.downloadTitle
        };
        
        for (const [selector, text] of Object.entries(elements)) {
            const element = this.footerElement?.querySelector(selector);
            if (element) element.textContent = text;
        }
    }
    
    _updateDynamicStats() {
        // شبیه‌سازی آمار پویا (در واقعیت از API یا State می‌آید)
        const stats = {
            activeUsers: Math.floor(Math.random() * 10000) + 5000,
            lessonsCompleted: Math.floor(Math.random() * 500000) + 100000,
            languages: 12
        };
        
        const statsEl = this.footerElement?.querySelector('#footer-stats');
        if (statsEl) {
            statsEl.innerHTML = `
                <span class="stat-item">
                    <span class="stat-number">${stats.activeUsers.toLocaleString('fa-IR')}</span>
                    <span class="stat-label">کاربر فعال</span>
                </span>
                •
                <span class="stat-item">
                    <span class="stat-number">${stats.lessonsCompleted.toLocaleString('fa-IR')}</span>
                    <span class="stat-label">درس تکمیل شده</span>
                </span>
                •
                <span class="stat-item">
                    <span class="stat-number">${stats.languages}</span>
                    <span class="stat-label">زبان</span>
                </span>
            `;
        }
    }
    
    _applyBaseStyles(footerElement) {
        const style = document.createElement('style');
        style.textContent = `
            .vakamova-footer {
                background: ${this.config.theme === 'dark' ? '#0f172a' : '#f8fafc'};
                color: ${this.config.theme === 'dark' ? '#f8fafc' : '#0f172a'};
                padding: 3rem 2rem 2rem;
                margin-top: auto;
                font-family: 'Vazirmatn', sans-serif;
                border-top: 1px solid ${this.config.theme === 'dark' ? '#1e293b' : '#e2e8f0'};
            }
            
            .footer-container {
                max-width: 1400px;
                margin: 0 auto;
            }
            
            .footer-top {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
                gap: 3rem;
                margin-bottom: 2.5rem;
            }
            
            .footer-brand {
                display: flex;
                flex-direction: column;
                gap: 1rem;
            }
            
            .footer-logo {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                font-size: 1.8rem;
                font-weight: bold;
            }
            
            .logo-icon {
                background: linear-gradient(135deg, #8b5cf6, #3b82f6);
                border-radius: 10px;
                padding: 0.5rem;
            }
            
            .logo-text {
                background: linear-gradient(90deg, #38bdf8, #818cf8);
                -webkit-background-clip: text;
                -webkit-text-fill-color: transparent;
            }
            
            .footer-description {
                color: ${this.config.theme === 'dark' ? '#94a3b8' : '#475569'};
                line-height: 1.6;
                max-width: 300px;
            }
            
            .footer-links .links-list {
                list-style: none;
                padding: 0;
                margin: 1rem 0 0;
            }
            
            .link-item {
                margin-bottom: 0.75rem;
            }
            
            .link-anchor {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                color: ${this.config.theme === 'dark' ? '#cbd5e1' : '#475569'};
                text-decoration: none;
                transition: color 0.2s;
            }
            
            .link-anchor:hover {
                color: ${this.config.theme === 'dark' ? '#38bdf8' : '#0ea5e9'};
            }
            
            .footer-language-selector {
                margin-top: 1rem;
                position: relative;
            }
            
            .language-current {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                padding: 0.75rem 1rem;
                background: ${this.config.theme === 'dark' ? '#1e293b' : '#e2e8f0'};
                border: 1px solid ${this.config.theme === 'dark' ? '#334155' : '#cbd5e1'};
                border-radius: 8px;
                color: inherit;
                cursor: pointer;
                width: 100%;
                text-align: right;
            }
            
            .language-options {
                position: absolute;
                bottom: 100%;
                right: 0;
                background: ${this.config.theme === 'dark' ? '#1e293b' : '#ffffff'};
                border: 1px solid ${this.config.theme === 'dark' ? '#334155' : '#e2e8f0'};
                border-radius: 8px;
                padding: 0.5rem;
                margin-bottom: 0.5rem;
                min-width: 200px;
                box-shadow: 0 4px 20px rgba(0, 0, 0, 0.2);
                display: none;
            }
            
            .language-options[aria-hidden="false"] {
                display: block;
            }
            
            .language-option {
                display: flex;
                align-items: center;
                gap: 0.75rem;
                padding: 0.75rem 1rem;
                width: 100%;
                border: none;
                background: none;
                color: inherit;
                cursor: pointer;
                border-radius: 6px;
                text-align: right;
            }
            
            .language-option:hover {
                background: ${this.config.theme === 'dark' ? '#334155' : '#f1f5f9'};
            }
            
            .language-option.selected {
                background: ${this.config.theme === 'dark' ? '#3b82f6' : '#0ea5e9'};
                color: white;
            }
            
            .footer-divider {
                height: 1px;
                background: ${this.config.theme === 'dark' ? '#334155' : '#e2e8f0'};
                margin: 2rem 0;
            }
            
            .footer-bottom {
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 2rem;
            }
            
            .copyright-text {
                color: ${this.config.theme === 'dark' ? '#94a3b8' : '#64748b'};
                font-size: 0.9rem;
            }
            
            .social-links {
                display: flex;
                gap: 1.5rem;
            }
            
            .social-link {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                color: ${this.config.theme === 'dark' ? '#cbd5e1' : '#475569'};
                text-decoration: none;
            }
            
            .app-download {
                margin-top: 1.5rem;
            }
            
            .store-buttons {
                display: flex;
                gap: 1rem;
                margin-top: 0.75rem;
            }
            
            .store-button {
                display: flex;
                align-items: center;
                gap: 0.5rem;
                padding: 0.75rem 1.25rem;
                background: ${this.config.theme === 'dark' ? '#1e293b' : '#3b82f6'};
                color: ${this.config.theme === 'dark' ? '#f8fafc' : '#ffffff'};
                border-radius: 8px;
                text-decoration: none;
                font-weight: 500;
            }
            
            .footer-dynamic {
                margin-top: 2rem;
                padding-top: 2rem;
                border-top: 1px dashed ${this.config.theme === 'dark' ? '#334155' : '#cbd5e1'};
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 1rem;
            }
            
            .dynamic-message {
                color: ${this.config.theme === 'dark' ? '#38bdf8' : '#0ea5e9'};
                font-style: italic;
            }
            
            .footer-stats {
                display: flex;
                gap: 1.5rem;
                color: ${this.config.theme === 'dark' ? '#94a3b8' : '#64748b'};
                font-size: 0.9rem;
            }
            
            @media (max-width: 768px) {
                .footer-top {
                    grid-template-columns: 1fr;
                    gap: 2rem;
                }
                
                .footer-bottom {
                    flex-direction: column;
                    align-items: flex-start;
                }
                
                .social-links {
                    flex-wrap: wrap;
                }
            }
        `;
        
        footerElement.appendChild(style);
    }
    
    // ==================== PUBLIC API (قرارداد رابط) ====================
    
    // اصل ۲: قرارداد رابط - متدهای عمومی ثابت
    
    updateTheme(newTheme) {
        if (!['dark', 'light'].includes(newTheme)) return this;
        
        this.config = Object.freeze({
            ...this.config,
            theme: newTheme
        });
        
        if (this.footerElement) {
            this.footerElement.className = `vakamova-footer theme-${newTheme}`;
            this._applyBaseStyles(this.footerElement);
        }
        
        this.eventBus.emit('footer:theme:changed', { theme: newTheme });
        return this;
    }
    
    getCurrentState() {
        return {
            isMounted: this.isMounted,
            currentLanguage: this.config.currentLanguage,
            theme: this.config.theme,
            config: { ...this.config }
        };
    }
    
    destroy() {
        // پاک‌سازی event listeners
        document.removeEventListener('click', this.handleLinkClick);
        
        // حذف interval
        clearInterval(this._updateInterval);
        
        // حذف از DOM
        if (this.footerElement && this.footerElement.parentNode) {
            this.footerElement.parentNode.removeChild(this.footerElement);
        }
        
        this.isMounted = false;
        this.eventBus.emit('footer:destroyed');
    }
}

// ==================== FACTORY & EXPORT ====================

// اصل ۱: تزریق وابستگی از طریق Factory
export function createFooter(config = {}) {
    return new VakamovaFooter(config);
}

// Export اصلی برای استفاده در سیستم
export default VakamovaFooter;

// ثبت در window برای دسترسی سریع (اختیاری)
if (typeof window !== 'undefined') {
    window.VakamovaFooter = VakamovaFooter;
    window.createFooter = createFooter;
}
