/**
 * LANGUAGE PICKER VIEW - انتخابگر زبان
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * وابستگی‌ها: فقط به core/event_bus.js و LANGUAGE_CONSTANTS داخلی
 */

class LanguagePickerView {
    constructor(config = {}) {
        // 1. پیکربندی متمرکز
        this.config = Object.freeze({
            containerId: config.containerId || 'app-content',
            eventPrefix: config.eventPrefix || 'language',
            animationSpeed: config.animationSpeed || 300,
            maxColumns: config.maxColumns || 4,
            gridGap: config.gridGap || '20px',
            cardAspectRatio: config.cardAspectRatio || '3/2',
            ...config
        });

        // 2. تزریق وابستگی‌ها
        this.eventSystem = config.eventSystem || window.eventBus || (() => {
            throw new Error('EventBus dependency required');
        })();

        // 3. قرارداد رابط داخلی
        this._state = {
            selectedLanguage: null,
            isRendering: false,
            renderedLanguages: new Set()
        };

        // 4. انحصار داخلی
        this._elements = new Map();
        this._subscriptions = new Map();
        this._styleElement = null;
        
        // 5. رویدادهای استاندارد (قرارداد رابط)
        this.EVENTS = Object.freeze({
            SELECTED: `${this.config.eventPrefix}:selected`,
            RENDERED: `${this.config.eventPrefix}:rendered`,
            CLICKED: `${this.config.eventPrefix}:card:clicked`
        });

        this._bindMethods();
    }

    // ==================== قرارداد رابط عمومی ====================
    
    async render(options = {}) {
        if (this._state.isRendering) {
            console.warn('[LanguagePicker] Already rendering');
            return;
        }

        this._state.isRendering = true;
        
        try {
            // 1. پاکسازی قبلی
            this._cleanup();
            
            // 2. دریافت داده‌ها
            const languages = await this._fetchLanguages(options);
            
            // 3. ایجاد ظرفیت
            const container = this._getContainer();
            
            // 4. تزریق استایل
            this._injectStyles();
            
            // 5. رندر گرید
            const grid = this._createGridElement();
            container.appendChild(grid);
            
            // 6. رندر کارت‌ها
            await this._renderLanguageCards(grid, languages);
            
            // 7. ثبت رویدادها
            this._setupEventListeners();
            
            // 8. انتشار رویداد موفقیت
            this.eventSystem.emit(this.EVENTS.RENDERED, {
                count: languages.length,
                timestamp: Date.now(),
                view: this
            });
            
            this._state.isRendering = false;
            
            return {
                success: true,
                languagesRendered: languages.length,
                container: container.id
            };
            
        } catch (error) {
            this._state.isRendering = false;
            this.eventSystem.emit(`${this.config.eventPrefix}:error`, {
                error: error.message,
                phase: 'render'
            });
            throw error;
        }
    }

    destroy() {
        // پاکسازی کامل با ترتیب معکوس
        this._cleanupEventListeners();
        this._cleanupSubscriptions();
        this._cleanupStyles();
        this._cleanupDOM();
        
        this._state.renderedLanguages.clear();
        this._elements.clear();
        
        this.eventSystem.emit(`${this.config.eventPrefix}:destroyed`);
        
        return { success: true };
    }

    selectLanguage(languageCode, options = {}) {
        // اعتبارسنجی
        if (!this._isValidLanguage(languageCode)) {
            throw new Error(`Invalid language code: ${languageCode}`);
        }

        const previous = this._state.selectedLanguage;
        this._state.selectedLanguage = languageCode;
        
        // به‌روزرسانی بصری
        this._updateCardStates(languageCode, previous);
        
        // انتشار رویداد
        const eventData = {
            language: languageCode,
            previous,
            timestamp: Date.now(),
            source: options.source || 'programmatic'
        };
        
        this.eventSystem.emit(this.EVENTS.SELECTED, eventData);
        
        return eventData;
    }

    // ==================== متدهای کمکی (قرارداد رابط) ====================
    
    getSelectedLanguage() {
        return this._state.selectedLanguage;
    }

    getRenderedLanguages() {
        return Array.from(this._state.renderedLanguages);
    }

    updateConfig(newConfig) {
        // فقط مقادیر مجاز قابل به‌روزرسانی
        const updatableKeys = ['gridGap', 'animationSpeed', 'maxColumns'];
        const updates = {};
        
        updatableKeys.forEach(key => {
            if (newConfig[key] !== undefined) {
                updates[key] = newConfig[key];
            }
        });
        
        if (Object.keys(updates).length > 0) {
            this.config = Object.freeze({ ...this.config, ...updates });
            this._applyDynamicStyles();
            
            this.eventSystem.emit(`${this.config.eventPrefix}:config:updated`, {
                updates,
                timestamp: Date.now()
            });
        }
        
        return updates;
    }

    // ==================== پیاده‌سازی داخلی ====================
    
    _bindMethods() {
        // متدهای عمومی
        this.render = this.render.bind(this);
        this.destroy = this.destroy.bind(this);
        this.selectLanguage = this.selectLanguage.bind(this);
        this.getSelectedLanguage = this.getSelectedLanguage.bind(this);
        
        // متدهای داخلی
        this._handleCardClick = this._handleCardClick.bind(this);
        this._handleKeyPress = this._handleKeyPress.bind(this);
    }

    async _fetchLanguages(options) {
        // 1. اولویت: داده‌های ورودی
        if (options.languages && Array.isArray(options.languages)) {
            return this._validateLanguages(options.languages);
        }
        
        // 2. ثابت‌های داخلی پروژه
        if (window.LANGUAGE_CONSTANTS && window.LANGUAGE_CONSTANTS.SUPPORTED_LANGUAGES) {
            return window.LANGUAGE_CONSTANTS.SUPPORTED_LANGUAGES;
        }
        
        // 3. پیش‌فرض‌های ایمن
        const defaults = [
            { code: 'fa', name: 'فارسی', flag: '🇮🇷', direction: 'rtl' },
            { code: 'en', name: 'English', flag: '🇺🇸', direction: 'ltr' },
            { code: 'ar', name: 'العربية', flag: '🇸🇦', direction: 'rtl' },
            { code: 'tr', name: 'Türkçe', flag: '🇹🇷', direction: 'ltr' },
            { code: 'de', name: 'Deutsch', flag: '🇩🇪', direction: 'ltr' },
            { code: 'es', name: 'Español', flag: '🇪🇸', direction: 'ltr' },
            { code: 'fr', name: 'Français', flag: '🇫🇷', direction: 'ltr' },
            { code: 'ru', name: 'Русский', flag: '🇷🇺', direction: 'ltr' },
            { code: 'zh', name: '中文', flag: '🇨🇳', direction: 'ltr' },
            { code: 'ja', name: '日本語', flag: '🇯🇵', direction: 'ltr' },
            { code: 'ko', name: '한국어', flag: '🇰🇷', direction: 'ltr' },
            { code: 'it', name: 'Italiano', flag: '🇮🇹', direction: 'ltr' }
        ];
        
        return defaults.slice(0, this.config.maxColumns * 3); // محدودیت منطقی
    }

    _validateLanguages(languages) {
        return languages.filter(lang => 
            lang && 
            typeof lang === 'object' &&
            lang.code && 
            typeof lang.code === 'string' &&
            lang.name && 
            typeof lang.name === 'string' &&
            (!lang.flag || typeof lang.flag === 'string')
        );
    }

    _isValidLanguage(code) {
        return this._state.renderedLanguages.has(code);
    }

    _getContainer() {
        let container = document.getElementById(this.config.containerId);
        
        if (!container) {
            container = document.createElement('div');
            container.id = this.config.containerId;
            container.className = 'language-picker-container';
            document.body.appendChild(container);
        }
        
        this._elements.set('container', container);
        return container;
    }

    _injectStyles() {
        if (this._styleElement) return;
        
        const styles = `
            .language-picker-container {
                width: 100%;
                max-width: 1200px;
                margin: 0 auto;
                padding: 20px;
                font-family: system-ui, -apple-system, sans-serif;
            }
            
            .language-grid {
                display: grid;
                grid-template-columns: repeat(${this.config.maxColumns}, 1fr);
                gap: ${this.config.gridGap};
                padding: 20px;
            }
            
            .language-card {
                aspect-ratio: ${this.config.cardAspectRatio};
                background: linear-gradient(145deg, #ffffff 0%, #f8f9fa 100%);
                border: 2px solid #e9ecef;
                border-radius: 16px;
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                cursor: pointer;
                transition: all ${this.config.animationSpeed}ms cubic-bezier(0.4, 0, 0.2, 1);
                position: relative;
                overflow: hidden;
                user-select: none;
            }
            
            .language-card:hover {
                transform: translateY(-4px);
                border-color: #339af0;
                box-shadow: 0 10px 30px rgba(0, 0, 0, 0.1);
            }
            
            .language-card.selected {
                border-color: #339af0;
                background: linear-gradient(145deg, #e7f5ff 0%, #d0ebff 100%);
                box-shadow: inset 0 0 0 2px #339af0;
            }
            
            .language-card.disabled {
                opacity: 0.6;
                cursor: not-allowed;
                filter: grayscale(0.8);
            }
            
            .language-flag {
                font-size: 3em;
                margin-bottom: 12px;
                line-height: 1;
            }
            
            .language-name {
                font-size: 1.1em;
                font-weight: 600;
                color: #343a40;
                text-align: center;
                margin: 0 10px;
            }
            
            .language-code {
                position: absolute;
                top: 8px;
                right: 8px;
                font-size: 0.8em;
                color: #868e96;
                background: #f8f9fa;
                padding: 2px 8px;
                border-radius: 10px;
            }
            
            .language-direction {
                position: absolute;
                bottom: 8px;
                left: 8px;
                font-size: 0.8em;
                color: #868e96;
            }
            
            @media (max-width: 768px) {
                .language-grid {
                    grid-template-columns: repeat(2, 1fr);
                }
            }
            
            @media (max-width: 480px) {
                .language-grid {
                    grid-template-columns: 1fr;
                }
            }
        `;
        
        this._styleElement = document.createElement('style');
        this._styleElement.textContent = styles;
        document.head.appendChild(this._styleElement);
    }

    _applyDynamicStyles() {
        if (!this._styleElement) return;
        
        // فقط به‌روزرسانی بخش‌های پویا
        const newStyles = `
            .language-grid {
                grid-template-columns: repeat(${this.config.maxColumns}, 1fr);
                gap: ${this.config.gridGap};
            }
            
            .language-card {
                transition: all ${this.config.animationSpeed}ms cubic-bezier(0.4, 0, 0.2, 1);
                aspect-ratio: ${this.config.cardAspectRatio};
            }
        `;
        
        this._styleElement.textContent = this._styleElement.textContent.replace(
            /\/\* DYNAMIC_STYLES \*\/[\s\S]*?\/\* END_DYNAMIC_STYLES \*\//,
            `/* DYNAMIC_STYLES */${newStyles}/* END_DYNAMIC_STYLES */`
        );
    }

    _createGridElement() {
        const grid = document.createElement('div');
        grid.className = 'language-grid';
        this._elements.set('grid', grid);
        return grid;
    }

    async _renderLanguageCards(grid, languages) {
        const fragment = document.createDocumentFragment();
        
        for (const lang of languages) {
            const card = this._createLanguageCard(lang);
            fragment.appendChild(card);
            this._state.renderedLanguages.add(lang.code);
        }
        
        grid.appendChild(fragment);
        
        // انتشار رویداد تکمیل رندر
        this.eventSystem.emit(`${this.config.eventPrefix}:cards:rendered`, {
            count: languages.length,
            languages: languages.map(l => l.code)
        });
    }

    _createLanguageCard(language) {
        const card = document.createElement('div');
        card.className = 'language-card';
        card.dataset.languageCode = language.code;
        card.dataset.languageName = language.name;
        card.setAttribute('role', 'button');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `Select ${language.name} language`);
        
        // پرچم
        const flag = document.createElement('div');
        flag.className = 'language-flag';
        flag.textContent = language.flag || '🏳️';
        
        // نام
        const name = document.createElement('div');
        name.className = 'language-name';
        name.textContent = language.name;
        
        // کد زبان
        const code = document.createElement('div');
        code.className = 'language-code';
        code.textContent = language.code.toUpperCase();
        
        // جهت نوشتار
        const direction = document.createElement('div');
        direction.className = 'language-direction';
        direction.textContent = language.direction === 'rtl' ? '←' : '→';
        
        card.appendChild(flag);
        card.appendChild(name);
        card.appendChild(code);
        card.appendChild(direction);
        
        this._elements.set(`card_${language.code}`, card);
        
        return card;
    }

    _setupEventListeners() {
        const grid = this._elements.get('grid');
        if (!grid) return;
        
        // کلیک روی کارت
        const clickHandler = (e) => {
            const card = e.target.closest('.language-card');
            if (card && !card.classList.contains('disabled')) {
                this._handleCardClick(card);
            }
        };
        
        grid.addEventListener('click', clickHandler);
        this._subscriptions.set('grid-click', clickHandler);
        
        // رویدادهای کیبورد
        const keyHandler = (e) => {
            if (e.target.classList.contains('language-card')) {
                this._handleKeyPress(e);
            }
        };
        
        grid.addEventListener('keydown', keyHandler);
        this._subscriptions.set('grid-keydown', keyHandler);
        
        // رویدادهای خارجی
        const externalSelectHandler = (data) => {
            if (data && data.language) {
                this.selectLanguage(data.language, { source: 'external' });
            }
        };
        
        const unsubscribe = this.eventSystem.on(
            `${this.config.eventPrefix}:select`,
            externalSelectHandler
        );
        
        this._subscriptions.set('external-select', unsubscribe);
    }

    _handleCardClick(card) {
        const languageCode = card.dataset.languageCode;
        
        // انتشار رویداد کلیک
        this.eventSystem.emit(this.EVENTS.CLICKED, {
            language: languageCode,
            element: card,
            timestamp: Date.now()
        });
        
        // انتخاب زبان
        this.selectLanguage(languageCode, { source: 'click' });
    }

    _handleKeyPress(event) {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            this._handleCardClick(event.target);
        }
        
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
            this._focusNextCard(event.target);
        }
        
        if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
            this._focusPreviousCard(event.target);
        }
    }

    _focusNextCard(currentCard) {
        const cards = Array.from(
            this._elements.get('grid').querySelectorAll('.language-card:not(.disabled)')
        );
        const currentIndex = cards.indexOf(currentCard);
        const nextIndex = (currentIndex + 1) % cards.length;
        
        if (cards[nextIndex]) {
            cards[nextIndex].focus();
        }
    }

    _focusPreviousCard(currentCard) {
        const cards = Array.from(
            this._elements.get('grid').querySelectorAll('.language-card:not(.disabled)')
        );
        const currentIndex = cards.indexOf(currentCard);
        const prevIndex = (currentIndex - 1 + cards.length) % cards.length;
        
        if (cards[prevIndex]) {
            cards[prevIndex].focus();
        }
    }

    _updateCardStates(selectedCode, previousCode) {
        // حذف انتخاب قبلی
        if (previousCode) {
            const prevCard = this._elements.get(`card_${previousCode}`);
            if (prevCard) {
                prevCard.classList.remove('selected');
                prevCard.setAttribute('aria-checked', 'false');
            }
        }
        
        // اعمال انتخاب جدید
        const selectedCard = this._elements.get(`card_${selectedCode}`);
        if (selectedCard) {
            selectedCard.classList.add('selected');
            selectedCard.setAttribute('aria-checked', 'true');
            
            // انیمیشن تمرکز
            selectedCard.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest'
            });
        }
    }

    _cleanup() {
        const container = this._elements.get('container');
        if (container) {
            container.innerHTML = '';
        }
        this._state.renderedLanguages.clear();
    }

    _cleanupEventListeners() {
        const grid = this._elements.get('grid');
        
        this._subscriptions.forEach((handler, key) => {
            if (key.startsWith('grid-') && grid) {
                const [event, type] = key.split('-');
                grid.removeEventListener(event, handler);
            }
        });
    }

    _cleanupSubscriptions() {
        this._subscriptions.forEach((unsubscribe, key) => {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        });
        this._subscriptions.clear();
    }

    _cleanupStyles() {
        if (this._styleElement && this._styleElement.parentNode) {
            this._styleElement.parentNode.removeChild(this._styleElement);
        }
        this._styleElement = null;
    }

    _cleanupDOM() {
        this._elements.forEach((element, key) => {
            if (key !== 'container' && element.parentNode) {
                element.parentNode.removeChild(element);
            }
        });
        
        const container = this._elements.get('container');
        if (container && container.parentNode && container.id !== this.config.containerId) {
            container.parentNode.removeChild(container);
        }
    }
}

// ==================== فکتوری و Singleton ====================

const LanguagePickerFactory = {
    create(config = {}) {
        return new LanguagePickerView(config);
    },
    
    getInstance(config = {}) {
        if (!this._instance) {
            this._instance = this.create(config);
        }
        return this._instance;
    },
    
    destroyInstance() {
        if (this._instance) {
            this._instance.destroy();
            this._instance = null;
        }
    }
};

// ==================== اکسپورت ====================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { LanguagePickerView, LanguagePickerFactory };
} else if (typeof define === 'function' && define.amd) {
    define([], () => ({ LanguagePickerView, LanguagePickerFactory }));
} else {
    window.LanguagePickerView = LanguagePickerView;
    window.LanguagePickerFactory = LanguagePickerFactory;
}

// ==================== مستندات داخلی ====================
/**
 * @class LanguagePickerView
 * @description ویو انتخابگر زبان مبتنی بر ۴ اصل معماری
 * 
 * @example
 * const picker = new LanguagePickerView({
 *   containerId: 'app',
 *   eventSystem: window.eventBus
 * });
 * 
 * await picker.render();
 * 
 * @emits language:selected - هنگام انتخاب زبان
 * @emits language:rendered - پس از رندر کامل
 * @emits language:card:clicked - هنگام کلیک روی کارت
 */
