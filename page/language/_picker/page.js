/**
 * LANGUAGE PICKER PAGE - صفحه انتخاب زبان Vakamova
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * زبان‌ها: دقیقاً ۱۲ زبان مورد نظر شما
 */

class LanguagePickerPage {
    constructor(dependencies = {}) {
        // ==================== ۱. تزریق وابستگی‌ها ====================
        this.deps = Object.freeze({
            eventBus: dependencies.eventBus || window.eventBus,
            router: dependencies.router || window.router,
            state: dependencies.state || window.stateManager,
            constants: dependencies.constants || window.LANGUAGE_CONSTANTS,
            ...dependencies
        });

        this._validateDependencies();

        // ==================== ۴. پیکربندی متمرکز ====================
        this.config = Object.freeze({
            pageId: 'language-picker-page',
            containerId: 'app-content',
            storageKey: 'vakamova_selected_language',
            defaultRedirect: '/dashboard',
            animationDuration: 400,
            ...(dependencies.config || {})
        });

        // ==================== ۲. قرارداد رابط داخلی ====================
        this._state = {
            isInitialized: false,
            isRendering: false,
            selectedLanguage: null,
            viewInstance: null
        };

        this._subscriptions = new Map();
        this._elements = new Map();

        // ==================== ۳. رویدادهای استاندارد ====================
        this.EVENTS = Object.freeze({
            PAGE_LOADED: 'vakamova:language_picker:loaded',
            LANGUAGE_SELECTED: 'vakamova:language:selected',
            REDIRECT_TRIGGERED: 'vakamova:redirect:triggered'
        });

        // ==================== داده‌های زبان‌های شما ====================
        this.LANGUAGES = Object.freeze([
            {
                code: 'fa',
                name: 'فارسی',
                nativeName: 'فارسی',
                flag: '🇮🇷',
                direction: 'rtl',
                locale: 'fa-IR'
            },
            {
                code: 'en',
                name: 'English (British)',
                nativeName: 'English',
                flag: '🇬🇧',
                direction: 'ltr',
                locale: 'en-GB'
            },
            {
                code: 'ar-iq',
                name: 'Arabic (Iraqi)',
                nativeName: 'العربية العراقية',
                flag: '🇮🇶',
                direction: 'rtl',
                locale: 'ar-IQ'
            },
            {
                code: 'pt-br',
                name: 'Portuguese (Brazilian)',
                nativeName: 'Português Brasileiro',
                flag: '🇧🇷',
                direction: 'ltr',
                locale: 'pt-BR'
            },
            {
                code: 'fr',
                name: 'French',
                nativeName: 'Français',
                flag: '🇫🇷',
                direction: 'ltr',
                locale: 'fr-FR'
            },
            {
                code: 'de',
                name: 'German',
                nativeName: 'Deutsch',
                flag: '🇩🇪',
                direction: 'ltr',
                locale: 'de-DE'
            },
            {
                code: 'sv',
                name: 'Swedish',
                nativeName: 'Svenska',
                flag: '🇸🇪',
                direction: 'ltr',
                locale: 'sv-SE'
            },
            {
                code: 'nl',
                name: 'Dutch',
                nativeName: 'Nederlands',
                flag: '🇳🇱',
                direction: 'ltr',
                locale: 'nl-NL'
            },
            {
                code: 'es',
                name: 'Spanish',
                nativeName: 'Español',
                flag: '🇪🇸',
                direction: 'ltr',
                locale: 'es-ES'
            },
            {
                code: 'it',
                name: 'Italian',
                nativeName: 'Italiano',
                flag: '🇮🇹',
                direction: 'ltr',
                locale: 'it-IT'
            },
            {
                code: 'ru',
                name: 'Russian',
                nativeName: 'Русский',
                flag: '🇷🇺',
                direction: 'ltr',
                locale: 'ru-RU'
            },
            {
                code: 'tr',
                name: 'Turkish (Istanbul)',
                nativeName: 'Türkçe',
                flag: '🇹🇷',
                direction: 'ltr',
                locale: 'tr-TR'
            }
        ]);

        this._bindMethods();
    }

    // ==================== قرارداد رابط عمومی ====================
    
    async init(options = {}) {
        if (this._state.isInitialized) {
            console.warn('[LanguagePickerPage] Already initialized');
            return this;
        }

        try {
            // ۱. ذخیره در state جهانی
            this.deps.state?.set('pages.language_picker', {
                initializedAt: Date.now(),
                availableLanguages: this.LANGUAGES.length
            });

            // ۲. ثبت رویدادها
            this._setupEventSubscriptions();

            // ۳. رندر اولیه
            await this.render(options);

            // ۴. انتشار رویداد
            this.deps.eventBus.emit(this.EVENTS.PAGE_LOADED, {
                page: this.config.pageId,
                languages: this.LANGUAGES.length,
                timestamp: Date.now()
            });

            this._state.isInitialized = true;
            
            console.log(`[Vakamova] Language picker ready with ${this.LANGUAGES.length} languages`);
            
            return this;

        } catch (error) {
            console.error('[LanguagePickerPage] Initialization failed:', error);
            throw error;
        }
    }

    async render(renderOptions = {}) {
        if (this._state.isRendering) {
            return { alreadyRendering: true };
        }

        this._state.isRendering = true;

        try {
            const container = this._getContainer();
            
            // پاکسازی قبلی
            this._cleanupView();
            
            // رندر هدر
            this._renderHeader(container);
            
            // رندر گرید زبان‌ها
            const grid = this._renderLanguagesGrid(container);
            
            // رندر کارت‌ها
            this._renderLanguageCards(grid);
            
            // رندر فوتر
            this._renderFooter(container);
            
            // تنظیم event listeners
            this._setupDOMEventListeners();
            
            // بازیابی انتخاب قبلی
            await this._restorePreviousSelection();
            
            this._state.isRendering = false;
            
            return {
                success: true,
                containerId: container.id,
                languagesRendered: this.LANGUAGES.length
            };
            
        } catch (error) {
            this._state.isRendering = false;
            console.error('[LanguagePickerPage] Render failed:', error);
            throw error;
        }
    }

    async selectLanguage(languageCode, options = {}) {
        const language = this.LANGUAGES.find(lang => lang.code === languageCode);
        
        if (!language) {
            throw new Error(`Language "${languageCode}" not found in Vakamova`);
        }

        const previous = this._state.selectedLanguage;
        this._state.selectedLanguage = language;

        // ۱. به‌روزرسانی state
        this.deps.state?.set('user.language', {
            code: language.code,
            name: language.name,
            nativeName: language.nativeName,
            direction: language.direction,
            selectedAt: Date.now()
        });

        // ۲. ذخیره در localStorage
        localStorage.setItem(this.config.storageKey, JSON.stringify({
            code: language.code,
            timestamp: Date.now(),
            source: options.source || 'manual'
        }));

        // ۳. به‌روزرسانی UI
        this._updateUIForSelection(languageCode, previous);

        // ۴. انتشار رویداد
        const eventData = {
            language,
            previous,
            timestamp: Date.now(),
            source: options.source || 'manual',
            page: this.config.pageId
        };

        this.deps.eventBus.emit(this.EVENTS.LANGUAGE_SELECTED, eventData);

        // ۵. هدایت خودکار (اگر تنظیم شده)
        if (options.autoRedirect !== false) {
            await this._redirectToLanguagePath(language);
        }

        return eventData;
    }

    destroy() {
        // ۱. پاکسازی event listeners
        this._cleanupEventSubscriptions();
        
        // ۲. پاکسازی DOM listeners
        this._cleanupDOMEventListeners();
        
        // ۳. پاکسازی view
        this._cleanupView();
        
        // ۴. پاکسازی state
        this.deps.state?.delete('pages.language_picker');
        
        // ۵. ریست internal state
        this._state.isInitialized = false;
        this._state.selectedLanguage = null;
        
        console.log('[LanguagePickerPage] Destroyed');
        
        return { success: true };
    }

    // ==================== متدهای کمکی ====================
    
    getSelectedLanguage() {
        return this._state.selectedLanguage;
    }

    getAvailableLanguages() {
        return [...this.LANGUAGES];
    }

    // ==================== پیاده‌سازی داخلی ====================
    
    _validateDependencies() {
        if (!this.deps.eventBus) {
            throw new Error('EventBus dependency is required for LanguagePickerPage');
        }
    }

    _bindMethods() {
        this.init = this.init.bind(this);
        this.render = this.render.bind(this);
        this.selectLanguage = this.selectLanguage.bind(this);
        this.destroy = this.destroy.bind(this);
        this._handleLanguageClick = this._handleLanguageClick.bind(this);
        this._handleKeyDown = this._handleKeyDown.bind(this);
    }

    _getContainer() {
        let container = document.getElementById(this.config.containerId);
        
        if (!container) {
            container = document.createElement('div');
            container.id = this.config.containerId;
            container.className = 'vakamova-language-picker-container';
            document.body.appendChild(container);
        }
        
        this._elements.set('container', container);
        return container;
    }

    _renderHeader(container) {
        const header = document.createElement('div');
        header.className = 'vakamova-picker-header';
        
        header.innerHTML = `
            <h1 class="vakamova-picker-title">🌐 Vakamova Language</h1>
            <p class="vakamova-picker-subtitle">انتخاب کنید. یاد بگیرید. پیشرفت کنید.</p>
            <p class="vakamova-picker-instruction">برای شروع یادگیری، یک زبان را انتخاب کنید:</p>
        `;
        
        container.appendChild(header);
        this._elements.set('header', header);
    }

    _renderLanguagesGrid(container) {
        const grid = document.createElement('div');
        grid.className = 'vakamova-languages-grid';
        grid.setAttribute('role', 'grid');
        grid.setAttribute('aria-label', 'Available languages in Vakamova');
        
        container.appendChild(grid);
        this._elements.set('grid', grid);
        
        return grid;
    }

    _renderLanguageCards(grid) {
        const fragment = document.createDocumentFragment();
        
        this.LANGUAGES.forEach((lang, index) => {
            const card = this._createLanguageCard(lang, index);
            fragment.appendChild(card);
            this._elements.set(`card_${lang.code}`, card);
        });
        
        grid.appendChild(fragment);
    }

    _createLanguageCard(language, index) {
        const card = document.createElement('div');
        card.className = 'vakamova-language-card';
        card.dataset.languageCode = language.code;
        card.dataset.languageName = language.name;
        card.dataset.index = index;
        
        card.setAttribute('role', 'gridcell');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `${language.name} (${language.nativeName})`);
        
        card.innerHTML = `
            <div class="vakamova-card-flag" aria-hidden="true">${language.flag}</div>
            <div class="vakamova-card-content">
                <h3 class="vakamova-card-title">${language.name}</h3>
                <p class="vakamova-card-native">${language.nativeName}</p>
                <div class="vakamova-card-meta">
                    <span class="vakamova-card-code">${language.code.toUpperCase()}</span>
                    <span class="vakamova-card-direction">${language.direction === 'rtl' ? 'راست‌به‌چپ' : 'چپ‌به‌راست'}</span>
                </div>
            </div>
            <div class="vakamova-card-selector" aria-hidden="true">○</div>
        `;
        
        return card;
    }

    _renderFooter(container) {
        const footer = document.createElement('div');
        footer.className = 'vakamova-picker-footer';
        
        footer.innerHTML = `
            <p class="vakamova-footer-note">
                <strong>توجه:</strong> این انتخاب در مراحل بعدی قابل تغییر است.
            </p>
            <p class="vakamova-footer-brand">
                ✨ ساخته شده با passion توسط <strong>Vakamova</strong>
            </p>
        `;
        
        container.appendChild(footer);
        this._elements.set('footer', footer);
    }

    _setupDOMEventListeners() {
        const grid = this._elements.get('grid');
        if (!grid) return;
        
        // کلیک روی کارت
        grid.addEventListener('click', this._handleLanguageClick);
        this._subscriptions.set('grid-click', {
            type: 'dom',
            handler: this._handleLanguageClick
        });
        
        // رویدادهای کیبورد
        grid.addEventListener('keydown', this._handleKeyDown);
        this._subscriptions.set('grid-keydown', {
            type: 'dom',
            handler: this._handleKeyDown
        });
    }

    _setupEventSubscriptions() {
        // گوش دادن به رویدادهای خارجی برای انتخاب زبان
        const externalSelectHandler = (data) => {
            if (data?.language?.code) {
                this.selectLanguage(data.language.code, {
                    source: 'external',
                    autoRedirect: false
                });
            }
        };
        
        const unsubscribe = this.deps.eventBus.on(
            'vakamova:language:select',
            externalSelectHandler
        );
        
        this._subscriptions.set('external-select', {
            type: 'event',
            unsubscribe
        });
        
        // گوش دادن به درخواست بازخوانی صفحه
        const refreshHandler = () => {
            this.render();
        };
        
        const refreshUnsubscribe = this.deps.eventBus.on(
            'vakamova:language_picker:refresh',
            refreshHandler
        );
        
        this._subscriptions.set('refresh', {
            type: 'event',
            unsubscribe: refreshUnsubscribe
        });
    }

    _handleLanguageClick(event) {
        const card = event.target.closest('.vakamova-language-card');
        if (!card) return;
        
        event.preventDefault();
        event.stopPropagation();
        
        const languageCode = card.dataset.languageCode;
        
        // افکت بصری کلیک
        card.style.transform = 'scale(0.98)';
        setTimeout(() => {
            card.style.transform = '';
        }, 150);
        
        this.selectLanguage(languageCode, {
            source: 'click',
            autoRedirect: true
        });
    }

    _handleKeyDown(event) {
        const card = event.target.closest('.vakamova-language-card');
        if (!card) return;
        
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this._handleLanguageClick(event);
        }
        
        if (event.key.startsWith('Arrow')) {
            this._handleKeyboardNavigation(event, card);
        }
    }

    _handleKeyboardNavigation(event, currentCard) {
        event.preventDefault();
        
        const cards = Array.from(
            this._elements.get('grid').querySelectorAll('.vakamova-language-card')
        );
        const currentIndex = cards.indexOf(currentCard);
        
        let nextIndex = currentIndex;
        
        switch (event.key) {
            case 'ArrowRight':
                nextIndex = (currentIndex + 1) % cards.length;
                break;
            case 'ArrowLeft':
                nextIndex = (currentIndex - 1 + cards.length) % cards.length;
                break;
            case 'ArrowDown':
                nextIndex = (currentIndex + 4) % cards.length; // 4 ستون فرضی
                break;
            case 'ArrowUp':
                nextIndex = (currentIndex - 4 + cards.length) % cards.length;
                break;
        }
        
        if (cards[nextIndex]) {
            cards[nextIndex].focus();
            cards[nextIndex].scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    }

    async _restorePreviousSelection() {
        try {
            const saved = localStorage.getItem(this.config.storageKey);
            if (!saved) return;
            
            const { code, timestamp } = JSON.parse(saved);
            
            // اگر کمتر از ۷ روز گذشته باشد
            if (Date.now() - timestamp < 7 * 24 * 60 * 60 * 1000) {
                const language = this.LANGUAGES.find(lang => lang.code === code);
                if (language) {
                    await this.selectLanguage(code, {
                        source: 'restored',
                        autoRedirect: false
                    });
                }
            }
        } catch (error) {
            console.warn('[LanguagePickerPage] Failed to restore selection:', error);
        }
    }

    _updateUIForSelection(selectedCode, previousCode) {
        // حذف انتخاب قبلی
        if (previousCode) {
            const prevCard = this._elements.get(`card_${previousCode}`);
            if (prevCard) {
                prevCard.classList.remove('vakamova-card-selected');
                prevCard.querySelector('.vakamova-card-selector').textContent = '○';
                prevCard.setAttribute('aria-selected', 'false');
            }
        }
        
        // اعمال انتخاب جدید
        const selectedCard = this._elements.get(`card_${selectedCode}`);
        if (selectedCard) {
            selectedCard.classList.add('vakamova-card-selected');
            selectedCard.querySelector('.vakamova-card-selector').textContent = '●';
            selectedCard.setAttribute('aria-selected', 'true');
            
            // اسکرول به کارت انتخاب شده
            selectedCard.scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });
            
            // افکت بصری
            selectedCard.style.boxShadow = '0 0 0 3px rgba(59, 130, 246, 0.5)';
            setTimeout(() => {
                selectedCard.style.boxShadow = '';
            }, 1000);
        }
    }

    async _redirectToLanguagePath(language) {
        if (!this.deps.router) {
            console.warn('[LanguagePickerPage] No router available for redirect');
            return;
        }
        
        const redirectPath = `/${language.code}/dashboard`;
        
        // انتشار رویداد هدایت
        this.deps.eventBus.emit(this.EVENTS.REDIRECT_TRIGGERED, {
            from: this.config.pageId,
            to: redirectPath,
            language: language.code,
            timestamp: Date.now()
        });
        
        // تأخیر برای مشاهده افکت انتخاب
        await new Promise(resolve => setTimeout(resolve, this.config.animationDuration));
        
        // هدایت
        this.deps.router.navigate(redirectPath);
    }

    _cleanupView() {
        const container = this._elements.get('container');
        if (container) {
            container.innerHTML = '';
        }
    }

    _cleanupEventSubscriptions() {
        this._subscriptions.forEach((sub, key) => {
            if (sub.type === 'event' && typeof sub.unsubscribe === 'function') {
                sub.unsubscribe();
            }
        });
    }

    _cleanupDOMEventListeners() {
        const grid = this._elements.get('grid');
        if (!grid) return;
        
        this._subscriptions.forEach((sub, key) => {
            if (sub.type === 'dom' && grid && sub.handler) {
                grid.removeEventListener(key.replace('grid-', ''), sub.handler);
            }
        });
    }

    _injectStyles() {
        if (document.getElementById('vakamova-language-picker-styles')) {
            return;
        }
        
        const styles = document.createElement('style');
        styles.id = 'vakamova-language-picker-styles';
        
        styles.textContent = `
            .vakamova-language-picker-container {
                max-width: 1200px;
                margin: 0 auto;
                padding: 2rem;
                font-family: system-ui, -apple-system, sans-serif;
            }
            
            .vakamova-picker-header {
                text-align: center;
                margin-bottom: 3rem;
            }
            
            .vakamova-picker-title {
                font-size: 2.5rem;
                color: #1e40af;
                margin-bottom: 0.5rem;
            }
            
            .vakamova-picker-subtitle {
                font-size: 1.2rem;
                color: #4b5563;
                margin-bottom: 1rem;
            }
            
            .vakamova-picker-instruction {
                font-size: 1rem;
                color: #6b7280;
            }
            
            .vakamova-languages-grid {
                display: grid;
                grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
                gap: 1.5rem;
                margin: 2rem 0;
            }
            
            .vakamova-language-card {
                background: white;
                border: 2px solid #e5e7eb;
                border-radius: 16px;
                padding: 1.5rem;
                cursor: pointer;
                transition: all 0.3s ease;
                position: relative;
                display: flex;
                flex-direction: column;
                min-height: 180px;
            }
            
            .vakamova-language-card:hover {
                transform: translateY(-4px);
                border-color: #3b82f6;
                box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
            }
            
            .vakamova-language-card:focus {
                outline: none;
                border-color: #3b82f6;
                box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.3);
            }
            
            .vakamova-card-selected {
                border-color: #10b981;
                background: linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%);
            }
            
            .vakamova-card-flag {
                font-size: 3rem;
                margin-bottom: 1rem;
                text-align: center;
            }
            
            .vakamova-card-content {
                flex-grow: 1;
            }
            
            .vakamova-card-title {
                font-size: 1.25rem;
                font-weight: 600;
                color: #1f2937;
                margin-bottom: 0.5rem;
            }
            
            .vakamova-card-native {
                font-size: 1rem;
                color: #4b5563;
                margin-bottom: 1rem;
                font-style: italic;
            }
            
            .vakamova-card-meta {
                display: flex;
                justify-content: space-between;
                font-size: 0.875rem;
                color: #6b7280;
            }
            
            .vakamova-card-selector {
                position: absolute;
                top: 1rem;
                right: 1rem;
                font-size: 1.5rem;
                color: #d1d5db;
            }
            
            .vakamova-card-selected .vakamova-card-selector {
                color: #10b981;
            }
            
            .vakamova-picker-footer {
                margin-top: 3rem;
                padding-top: 2rem;
                border-top: 1px solid #e5e7eb;
                text-align: center;
                color: #6b7280;
                font-size: 0.9rem;
            }
            
            .vakamova-footer-note {
                margin-bottom: 0.5rem;
            }
            
            .vakamova-footer-brand {
                color: #1e40af;
                font-weight: 500;
            }
            
            @media (max-width: 768px) {
                .vakamova-languages-grid {
                    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
                }
                
                .vakamova-picker-title {
                    font-size: 2rem;
                }
            }
            
            @media (max-width: 480px) {
                .vakamova-languages-grid {
                    grid-template-columns: 1fr;
                }
                
                .vakamova-language-picker-container {
                    padding: 1rem;
                }
            }
        `;
        
        document.head.appendChild(styles);
    }
}

// ==================== فکتوری ====================

class VakamovaLanguagePicker {
    static create(config = {}) {
        return new LanguagePickerPage(config);
    }
    
    static async initialize(config = {}) {
        const instance = this.create(config);
        await instance.init();
        return instance;
    }
}

// ==================== خودراه‌انداز ====================

if (typeof window !== 'undefined') {
    // تزریق استایل‌ها
    const styleInjector = new LanguagePickerPage();
    styleInjector._injectStyles();
    
    // اکسپورت جهانی
    window.VakamovaLanguagePicker = VakamovaLanguagePicker;
    window.LanguagePickerPage = LanguagePickerPage;
}

// ==================== مستندات ====================
/**
 * @class LanguagePickerPage
 * @description صفحه انتخاب زبان ۱۲‌زبانه Vakamova
 * 
 * @example
 * // استفاده در Router
 * const picker = await VakamovaLanguagePicker.initialize({
 *   eventBus: window.eventBus,
 *   router: window.router
 * });
 */
