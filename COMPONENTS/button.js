/**
 * VAKAMOVA BUTTON COMPONENT - کامپوننت دکمه هوشمند
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * وابستگی: فقط event_bus.js (برای ارتباط رویدادمحور)
 */

class VakamovaButton {
    constructor(config = {}) {
        // ==================== پیکربندی متمرکز ====================
        this._config = Object.freeze({
            types: {
                primary: { base: 'v-btn-primary', color: '#0d7377', text: '#fff' },
                secondary: { base: 'v-btn-secondary', color: '#323a4d', text: '#fff' },
                success: { base: 'v-btn-success', color: '#4CAF50', text: '#fff' },
                warning: { base: 'v-btn-warning', color: '#FF9800', text: '#000' },
                danger: { base: 'v-btn-danger', color: '#f44336', text: '#fff' },
                ghost: { base: 'v-btn-ghost', color: 'transparent', text: '#0d7377' }
            },
            sizes: {
                sm: { class: 'v-btn-sm', padding: '8px 16px', fontSize: '12px' },
                md: { class: 'v-btn-md', padding: '12px 24px', fontSize: '14px' },
                lg: { class: 'v-btn-lg', padding: '16px 32px', fontSize: '16px' },
                xl: { class: 'v-btn-xl', padding: '20px 40px', fontSize: '18px' }
            },
            animations: {
                none: 'v-btn-no-animation',
                pulse: 'v-btn-pulse',
                bounce: 'v-btn-bounce',
                shimmer: 'v-btn-shimmer'
            },
            ...config
        });

        // ==================== تزریق وابستگی ====================
        this._eventBus = config.eventBus || window.eventBus || {
            emit: (event, data) => console.log(`[Button] ${event}:`, data),
            on: () => () => {}
        };

        // ==================== وضعیت داخلی ====================
        this._state = {
            disabled: false,
            loading: false,
            pressed: false,
            hover: false,
            focus: false
        };

        this._elements = {
            container: null,
            button: null,
            icon: null,
            label: null,
            loader: null
        };

        this._listeners = new Map();
        this._buttonId = `btn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // ==================== متدهای عمومی ====================
        this.render = this.render.bind(this);
        this.update = this.update.bind(this);
        this.destroy = this.destroy.bind(this);
        this.enable = this.enable.bind(this);
        this.disable = this.disable.bind(this);
        this.setLoading = this.setLoading.bind(this);
    }

    // ==================== قرارداد رابط - API عمومی ====================
    render(container, options = {}) {
        if (!container) {
            throw new Error('Container element is required');
        }

        this._options = this._normalizeOptions(options);
        
        // ایجاد ساختار HTML
        const template = this._createTemplate();
        container.innerHTML = template;
        
        // ذخیره عناصر
        this._elements.container = container;
        this._elements.button = container.querySelector(`#${this._buttonId}`);
        this._elements.icon = container.querySelector('.v-btn-icon');
        this._elements.label = container.querySelector('.v-btn-label');
        this._elements.loader = container.querySelector('.v-btn-loader');
        
        // اعمال استایل‌ها
        this._applyStyles();
        
        // اتصال رویدادها
        this._attachEventListeners();
        
        // انتشار رویداد
        this._eventBus.emit('ui:button:rendered', {
            id: this._buttonId,
            options: this._options
        });

        return this;
    }

    update(options = {}) {
        if (!this._elements.button) {
            console.warn('[Button] Cannot update - button not rendered');
            return this;
        }

        const previousOptions = { ...this._options };
        this._options = this._normalizeOptions({ ...this._options, ...options });
        
        // به‌روزرسانی ظاهری
        this._updateAppearance();
        
        // انتشار رویداد تغییر
        this._eventBus.emit('ui:button:updated', {
            id: this._buttonId,
            previous: previousOptions,
            current: this._options,
            changes: this._findChanges(previousOptions, this._options)
        });

        return this;
    }

    destroy() {
        if (!this._elements.container) return;
        
        // حذف رویدادها
        this._detachEventListeners();
        
        // انتشار رویداد تخریب
        this._eventBus.emit('ui:button:destroyed', {
            id: this._buttonId,
            options: this._options
        });
        
        // پاک‌سازی
        this._elements.container.innerHTML = '';
        this._elements.container.remove();
        
        this._elements = {
            container: null,
            button: null,
            icon: null,
            label: null,
            loader: null
        };
        
        this._listeners.clear();
        
        return null;
    }

    enable() {
        return this._setDisabled(false);
    }

    disable() {
        return this._setDisabled(true);
    }

    setLoading(isLoading) {
        this._state.loading = isLoading;
        
        if (this._elements.button) {
            if (isLoading) {
                this._elements.button.classList.add('v-btn-loading');
                if (this._elements.loader) {
                    this._elements.loader.style.display = 'block';
                }
                this._elements.button.setAttribute('aria-busy', 'true');
            } else {
                this._elements.button.classList.remove('v-btn-loading');
                if (this._elements.loader) {
                    this._elements.loader.style.display = 'none';
                }
                this._elements.button.setAttribute('aria-busy', 'false');
            }
        }
        
        this._eventBus.emit('ui:button:loading', {
            id: this._buttonId,
            loading: isLoading
        });
        
        return this;
    }

    // ==================== متدهای کمکی ====================
    _normalizeOptions(options) {
        const defaults = {
            type: 'primary',
            size: 'md',
            text: 'دکمه',
            icon: null,
            iconPosition: 'left',
            disabled: false,
            loading: false,
            fullWidth: false,
            animation: 'none',
            href: null,
            target: '_self',
            ariaLabel: null,
            title: null,
            customClass: '',
            styles: {},
            onClick: null,
            onHover: null,
            onFocus: null,
            dataAttributes: {}
        };
        
        const normalized = { ...defaults, ...options };
        
        // اعتبارسنجی
        if (!this._config.types[normalized.type]) {
            console.warn(`[Button] Unknown type "${normalized.type}", falling back to "primary"`);
            normalized.type = 'primary';
        }
        
        if (!this._config.sizes[normalized.size]) {
            normalized.size = 'md';
        }
        
        return Object.freeze(normalized);
    }

    _createTemplate() {
        const { 
            text, 
            icon, 
            iconPosition, 
            href, 
            type, 
            size, 
            animation,
            fullWidth,
            ariaLabel,
            title,
            customClass,
            dataAttributes
        } = this._options;
        
        const typeConfig = this._config.types[type];
        const sizeConfig = this._config.sizes[size];
        const animationClass = this._config.animations[animation] || '';
        
        const classes = [
            'vakamova-button',
            typeConfig.base,
            sizeConfig.class,
            animationClass,
            fullWidth ? 'v-btn-fullwidth' : '',
            this._state.disabled ? 'v-btn-disabled' : '',
            this._state.loading ? 'v-btn-loading' : '',
            customClass
        ].filter(Boolean).join(' ');
        
        const iconHtml = icon ? 
            `<span class="v-btn-icon" aria-hidden="true">${icon}</span>` : '';
        
        const labelHtml = text ? 
            `<span class="v-btn-label" data-text="${text}">${text}</span>` : '';
        
        const loaderHtml = `
            <span class="v-btn-loader" aria-hidden="true" style="display: none;">
                <span class="v-btn-loader-dot"></span>
                <span class="v-btn-loader-dot"></span>
                <span class="v-btn-loader-dot"></span>
            </span>
        `;
        
        const contentHtml = iconPosition === 'left' ? 
            `${iconHtml}${labelHtml}` : `${labelHtml}${iconHtml}`;
        
        const dataAttrs = Object.entries(dataAttributes)
            .map(([key, value]) => `data-${key}="${value}"`)
            .join(' ');
        
        const ariaAttrs = ariaLabel ? `aria-label="${ariaLabel}"` : '';
        const titleAttr = title ? `title="${title}"` : '';
        
        if (href) {
            return `
                <a id="${this._buttonId}" 
                   href="${href}" 
                   target="${this._options.target}"
                   class="${classes}"
                   role="button"
                   ${ariaAttrs}
                   ${titleAttr}
                   ${dataAttrs}
                   ${this._state.disabled ? 'aria-disabled="true"' : ''}>
                   ${contentHtml}
                   ${loaderHtml}
                </a>
            `;
        }
        
        return `
            <button id="${this._buttonId}" 
                    type="button"
                    class="${classes}"
                    ${ariaAttrs}
                    ${titleAttr}
                    ${dataAttrs}
                    ${this._state.disabled ? 'disabled aria-disabled="true"' : ''}>
                ${contentHtml}
                ${loaderHtml}
            </button>
        `;
    }

    _applyStyles() {
        if (!this._elements.button) return;
        
        const { type, size, styles } = this._options;
        const typeConfig = this._config.types[type];
        const sizeConfig = this._config.sizes[size];
        
        // استایل‌های پایه از پیکربندی
        const baseStyles = {
            backgroundColor: typeConfig.color,
            color: typeConfig.text,
            padding: sizeConfig.padding,
            fontSize: sizeConfig.fontSize,
            border: 'none',
            borderRadius: '8px',
            cursor: this._state.disabled ? 'not-allowed' : 'pointer',
            transition: 'all 0.3s ease',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '8px',
            fontFamily: 'inherit',
            fontWeight: '500',
            lineHeight: '1.5',
            textDecoration: 'none',
            position: 'relative',
            overflow: 'hidden',
            opacity: this._state.disabled ? '0.6' : '1',
            ...styles
        };
        
        // اعمال استایل‌ها
        Object.assign(this._elements.button.style, baseStyles);
        
        // استایل‌های واکنش‌گرا
        this._elements.button.addEventListener('mouseenter', () => {
            if (!this._state.disabled && !this._state.loading) {
                this._elements.button.style.transform = 'translateY(-2px)';
                this._elements.button.style.boxShadow = '0 6px 12px rgba(0, 0, 0, 0.15)';
            }
        });
        
        this._elements.button.addEventListener('mouseleave', () => {
            this._elements.button.style.transform = 'translateY(0)';
            this._elements.button.style.boxShadow = 'none';
        });
        
        // استایل برای RTL
        if (document.documentElement.dir === 'rtl') {
            this._elements.button.style.flexDirection = 'row-reverse';
        }
    }

    _updateAppearance() {
        if (!this._elements.button) return;
        
        // به‌روزرسانی کلاس‌ها
        const oldClasses = this._elements.button.className.split(' ');
        const newClasses = [
            'vakamova-button',
            this._config.types[this._options.type].base,
            this._config.sizes[this._options.size].class,
            this._config.animations[this._options.animation] || '',
            this._options.fullWidth ? 'v-btn-fullwidth' : '',
            this._state.disabled ? 'v-btn-disabled' : '',
            this._state.loading ? 'v-btn-loading' : '',
            this._options.customClass
        ].filter(Boolean);
        
        this._elements.button.className = newClasses.join(' ');
        
        // به‌روزرسانی متن
        if (this._elements.label && this._options.text) {
            this._elements.label.textContent = this._options.text;
            this._elements.label.setAttribute('data-text', this._options.text);
        }
        
        // به‌روزرسانی آیکون
        if (this._elements.icon) {
            if (this._options.icon) {
                this._elements.icon.innerHTML = this._options.icon;
                this._elements.icon.style.display = 'inline-flex';
            } else {
                this._elements.icon.style.display = 'none';
            }
        }
        
        // اعمال مجدد استایل‌ها
        this._applyStyles();
    }

    _attachEventListeners() {
        if (!this._elements.button) return;
        
        const clickHandler = (event) => {
            if (this._state.disabled || this._state.loading) {
                event.preventDefault();
                return;
            }
            
            // انتشار رویداد کلیک
            this._eventBus.emit('ui:button:clicked', {
                id: this._buttonId,
                options: this._options,
                event: {
                    type: event.type,
                    timestamp: Date.now(),
                    coordinates: { x: event.clientX, y: event.clientY }
                }
            });
            
            // فراخوانی کالبک کاربر
            if (typeof this._options.onClick === 'function') {
                this._options.onClick(event, this);
            }
        };
        
        const hoverHandler = (event) => {
            this._state.hover = event.type === 'mouseenter';
            
            this._eventBus.emit(`ui:button:${event.type}`, {
                id: this._buttonId,
                hover: this._state.hover
            });
            
            if (typeof this._options.onHover === 'function') {
                this._options.onHover(this._state.hover, event, this);
            }
        };
        
        const focusHandler = (event) => {
            this._state.focus = event.type === 'focus';
            
            this._eventBus.emit(`ui:button:${event.type}`, {
                id: this._buttonId,
                focused: this._state.focus
            });
            
            if (typeof this._options.onFocus === 'function') {
                this._options.onFocus(this._state.focus, event, this);
            }
        };
        
        // ذخیره هندلرها
        this._listeners.set('click', clickHandler);
        this._listeners.set('mouseenter', hoverHandler);
        this._listeners.set('mouseleave', hoverHandler);
        this._listeners.set('focus', focusHandler);
        this._listeners.set('blur', focusHandler);
        
        // اتصال رویدادها
        this._elements.button.addEventListener('click', clickHandler);
        this._elements.button.addEventListener('mouseenter', hoverHandler);
        this._elements.button.addEventListener('mouseleave', hoverHandler);
        this._elements.button.addEventListener('focus', focusHandler);
        this._elements.button.addEventListener('blur', focusHandler);
    }

    _detachEventListeners() {
        if (!this._elements.button) return;
        
        for (const [event, handler] of this._listeners) {
            this._elements.button.removeEventListener(event, handler);
        }
        
        this._listeners.clear();
    }

    _setDisabled(isDisabled) {
        this._state.disabled = isDisabled;
        
        if (this._elements.button) {
            if (isDisabled) {
                this._elements.button.disabled = true;
                this._elements.button.setAttribute('aria-disabled', 'true');
                this._elements.button.classList.add('v-btn-disabled');
            } else {
                this._elements.button.disabled = false;
                this._elements.button.removeAttribute('aria-disabled');
                this._elements.button.classList.remove('v-btn-disabled');
            }
            
            this._applyStyles();
        }
        
        this._eventBus.emit('ui:button:disabled', {
            id: this._buttonId,
            disabled: isDisabled
        });
        
        return this;
    }

    _findChanges(prev, current) {
        const changes = {};
        for (const key in current) {
            if (prev[key] !== current[key]) {
                changes[key] = { from: prev[key], to: current[key] };
            }
        }
        return changes;
    }

    // ==================== متدهای دسترسی ====================
    getState() {
        return { ...this._state, id: this._buttonId, options: this._options };
    }

    getId() {
        return this._buttonId;
    }

    getElement() {
        return this._elements.button;
    }

    isDisabled() {
        return this._state.disabled;
    }

    isLoading() {
        return this._state.loading;
    }
}

// ==================== فکتوری برای ایجاد آسان ====================
class ButtonFactory {
    static create(config = {}) {
        return new VakamovaButton(config);
    }
    
    static createPrimary(text, options = {}) {
        return new VakamovaButton({
            type: 'primary',
            text,
            ...options
        });
    }
    
    static createSecondary(text, options = {}) {
        return new VakamovaButton({
            type: 'secondary',
            text,
            ...options
        });
    }
    
    static createIconButton(icon, options = {}) {
        return new VakamovaButton({
            icon,
            text: '',
            size: options.size || 'sm',
            ...options
        });
    }
}

// ==================== اکسپورت ====================
export { VakamovaButton, ButtonFactory };

// اکسپورت پیش‌فرض
export default VakamovaButton;
