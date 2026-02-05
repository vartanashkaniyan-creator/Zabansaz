/**
 * VAKAMOVA INPUT COMPONENT - سیستم ورودی پیشرفته
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 */

class VakamovaInput {
    constructor(config = {}, dependencies = {}) {
        // اصل ۱: تزریق وابستگی
        this._deps = {
            eventBus: dependencies.eventBus || window.eventBus,
            validator: dependencies.validator || null,
            formatter: dependencies.formatter || null,
            ...dependencies
        };
        
        // اصل ۴: پیکربندی متمرکز
        this._config = Object.freeze({
            type: config.type || 'text',
            name: config.name || `input_${Date.now()}`,
            placeholder: config.placeholder || '',
            value: config.value || '',
            required: config.required || false,
            disabled: config.disabled || false,
            readonly: config.readonly || false,
            minLength: config.minLength || 0,
            maxLength: config.maxLength || 524288,
            pattern: config.pattern || null,
            validationMode: config.validationMode || 'blur', // blur, change, submit
            autoComplete: config.autoComplete || 'off',
            className: config.className || '',
            style: config.style || {},
            ariaLabel: config.ariaLabel || '',
            dir: config.dir || 'auto',
            inputMode: config.inputMode || 'text',
            ...config
        });
        
        // وضعیت داخلی
        this._state = {
            value: this._config.value,
            isValid: true,
            isTouched: false,
            isFocused: false,
            isDirty: false,
            errors: [],
            previousValue: null
        };
        
        // المان DOM
        this._element = null;
        this._container = null;
        
        // Bind methods
        this._handleInput = this._handleInput.bind(this);
        this._handleFocus = this._handleFocus.bind(this);
        this._handleBlur = this._handleBlur.bind(this);
        this._handleKeyDown = this._handleKeyDown.bind(this);
        
        // شناسه منحصر به فرد
        this._id = `vak_input_${Math.random().toString(36).substr(2, 9)}`;
        
        // رجیستر کردن در سیستم رویداد
        this._registerEventListeners();
        
        console.log(`[Input] ✅ ${this._config.name} ساخته شد`);
    }
    
    // ==================== PUBLIC INTERFACE (قرارداد رابط) ====================
    
    render(container = null) {
        if (!container && !this._container) {
            throw new Error('Container is required for rendering');
        }
        
        if (container) {
            this._container = container;
        }
        
        // حذف المان قبلی اگر وجود دارد
        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        
        // ایجاد المان جدید
        this._element = this._createInputElement();
        this._container.appendChild(this._element);
        
        // اعمال استایل‌ها
        this._applyStyles();
        
        // ثبت event listeners
        this._attachEventListeners();
        
        // انتشار رویداد رندر
        this._emitEvent('input:rendered', {
            inputId: this._id,
            name: this._config.name
        });
        
        return this;
    }
    
    getValue() {
        return this._state.value;
    }
    
    setValue(value, options = {}) {
        const oldValue = this._state.value;
        this._state.value = value;
        this._state.isDirty = true;
        this._state.previousValue = oldValue;
        
        // به‌روزرسانی المان DOM
        if (this._element) {
            this._element.value = value;
        }
        
        // اعتبارسنجی خودکار
        if (options.validate !== false) {
            this.validate();
        }
        
        // انتشار رویداد
        this._emitEvent('input:valueChanged', {
            inputId: this._id,
            name: this._config.name,
            value,
            oldValue,
            source: options.source || 'programmatic'
        });
        
        return this;
    }
    
    validate(value = null) {
        const valueToValidate = value !== null ? value : this._state.value;
        const validationResult = this._performValidation(valueToValidate);
        
        // به‌روزرسانی وضعیت
        this._state.isValid = validationResult.isValid;
        this._state.errors = validationResult.errors;
        
        // اعمال کلاس‌های CSS
        this._updateValidationUI();
        
        // انتشار رویداد
        this._emitEvent('input:validated', {
            inputId: this._id,
            name: this._config.name,
            isValid: validationResult.isValid,
            errors: validationResult.errors,
            value: valueToValidate
        });
        
        return validationResult;
    }
    
    reset(options = {}) {
        const oldValue = this._state.value;
        
        this._state = {
            value: options.defaultValue || this._config.value || '',
            isValid: true,
            isTouched: false,
            isFocused: false,
            isDirty: false,
            errors: [],
            previousValue: oldValue
        };
        
        if (this._element) {
            this._element.value = this._state.value;
            this._element.classList.remove('vak-input-invalid', 'vak-input-valid', 'vak-input-touched');
            this._element.blur();
        }
        
        // انتشار رویداد
        this._emitEvent('input:reset', {
            inputId: this._id,
            name: this._config.name,
            oldValue,
            newValue: this._state.value
        });
        
        return this;
    }
    
    focus() {
        if (this._element) {
            this._element.focus();
        }
        return this;
    }
    
    blur() {
        if (this._element) {
            this._element.blur();
        }
        return this;
    }
    
    enable() {
        if (this._element) {
            this._element.disabled = false;
        }
        return this;
    }
    
    disable() {
        if (this._element) {
            this._element.disabled = true;
        }
        return this;
    }
    
    destroy() {
        // حذف event listeners
        this._removeEventListeners();
        
        // حذف المان از DOM
        if (this._element && this._element.parentNode) {
            this._element.parentNode.removeChild(this._element);
        }
        
        // انتشار رویداد نابودی
        this._emitEvent('input:destroyed', {
            inputId: this._id,
            name: this._config.name
        });
        
        // پاک‌سازی منابع
        this._element = null;
        this._container = null;
        
        console.log(`[Input] 🗑️ ${this._config.name} از بین رفت`);
        
        return null;
    }
    
    getState() {
        return { ...this._state };
    }
    
    getConfig() {
        return { ...this._config };
    }
    
    getElement() {
        return this._element;
    }
    
    // ==================== VALIDATION SYSTEM ====================
    
    _performValidation(value) {
        const errors = [];
        
        // اعتبارسنجی required
        if (this._config.required && (!value || value.trim() === '')) {
            errors.push('این فیلد اجباری است');
        }
        
        // اعتبارسنجی minLength
        if (value && value.length < this._config.minLength) {
            errors.push(`حداقل ${this._config.minLength} کاراکتر لازم است`);
        }
        
        // اعتبارسنجی maxLength
        if (value && value.length > this._config.maxLength) {
            errors.push(`حداکثر ${this._config.maxLength} کاراکتر مجاز است`);
        }
        
        // اعتبارسنجی pattern
        if (this._config.pattern && value) {
            const regex = new RegExp(this._config.pattern);
            if (!regex.test(value)) {
                errors.push('قالب وارد شده صحیح نیست');
            }
        }
        
        // اعتبارسنجی سفارشی
        if (this._deps.validator && typeof this._deps.validator === 'function') {
            const customValidation = this._deps.validator(value, this._config);
            if (customValidation && !customValidation.isValid) {
                errors.push(...(customValidation.errors || ['مقدار نامعتبر']));
            }
        }
        
        // اعتبارسنجی نوع خاص
        switch (this._config.type) {
            case 'email':
                if (value && !this._validateEmail(value)) {
                    errors.push('آدرس ایمیل معتبر نیست');
                }
                break;
                
            case 'number':
                if (value && isNaN(Number(value))) {
                    errors.push('مقدار عددی معتبر نیست');
                }
                break;
                
            case 'tel':
                if (value && !this._validatePhone(value)) {
                    errors.push('شماره تلفن معتبر نیست');
                }
                break;
                
            case 'url':
                if (value && !this._validateUrl(value)) {
                    errors.push('آدرس اینترنتی معتبر نیست');
                }
                break;
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            value
        };
    }
    
    _validateEmail(email) {
        const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return re.test(email);
    }
    
    _validatePhone(phone) {
        const re = /^[\+]?[0-9\s\-\(\)]{10,}$/;
        return re.test(phone);
    }
    
    _validateUrl(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }
    
    // ==================== DOM MANAGEMENT ====================
    
    _createInputElement() {
        const input = document.createElement('input');
        
        // تنظیمات پایه
        input.id = this._id;
        input.name = this._config.name;
        input.type = this._config.type;
        input.placeholder = this._config.placeholder;
        input.value = this._state.value;
        input.required = this._config.required;
        input.disabled = this._config.disabled;
        input.readOnly = this._config.readonly;
        input.autocomplete = this._config.autoComplete;
        input.dir = this._config.dir;
        input.inputMode = this._config.inputMode;
        
        // ویژگی‌های دسترسی‌پذیری
        if (this._config.ariaLabel) {
            input.setAttribute('aria-label', this._config.ariaLabel);
        }
        
        // کلاس‌های پایه
        input.className = `vakamova-input ${this._config.className}`.trim();
        
        // اعتبارسنجی HTML5
        if (this._config.minLength > 0) {
            input.minLength = this._config.minLength;
        }
        
        if (this._config.maxLength < 524288) {
            input.maxLength = this._config.maxLength;
        }
        
        if (this._config.pattern) {
            input.pattern = this._config.pattern;
        }
        
        // ویژگی‌های داده سفارشی
        input.dataset.inputName = this._config.name;
        input.dataset.inputType = this._config.type;
        
        return input;
    }
    
    _applyStyles() {
        if (!this._element || !this._config.style) return;
        
        // اعمال استایل‌های پایه
        Object.assign(this._element.style, {
            fontFamily: 'inherit',
            fontSize: '1rem',
            padding: '12px 16px',
            border: '2px solid #e0e0e0',
            borderRadius: '8px',
            outline: 'none',
            transition: 'border-color 0.3s, box-shadow 0.3s',
            width: '100%',
            boxSizing: 'border-box',
            backgroundColor: this._config.disabled ? '#f5f5f5' : '#ffffff',
            color: this._config.disabled ? '#888' : '#333',
            ...this._config.style
        });
        
        // استایل‌های focus
        const focusStyle = `
            .vakamova-input:focus {
                border-color: #0d7377;
                box-shadow: 0 0 0 3px rgba(13, 115, 119, 0.1);
            }
            
            .vakamova-input.vak-input-invalid {
                border-color: #ff5252;
                background-color: rgba(255, 82, 82, 0.05);
            }
            
            .vamova-input.vak-input-valid {
                border-color: #4CAF50;
            }
            
            .vakamova-input.vak-input-touched:not(:focus) {
                border-color: #9e9e9e;
            }
            
            .vakamova-input:disabled {
                cursor: not-allowed;
                opacity: 0.7;
            }
        `;
        
        // اضافه کردن استایل‌های دینامیک
        if (!document.querySelector('#vakamova-input-styles')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'vakamova-input-styles';
            styleEl.textContent = focusStyle;
            document.head.appendChild(styleEl);
        }
    }
    
    _updateValidationUI() {
        if (!this._element) return;
        
        // حذف کلاس‌های قبلی
        this._element.classList.remove('vak-input-invalid', 'vak-input-valid');
        
        // اضافه کردن کلاس‌های جدید
        if (this._state.isTouched) {
            this._element.classList.add('vak-input-touched');
        }
        
        if (!this._state.isValid && this._state.isTouched) {
            this._element.classList.add('vak-input-invalid');
        } else if (this._state.isValid && this._state.isTouched) {
            this._element.classList.add('vak-input-valid');
        }
    }
    
    // ==================== EVENT HANDLING ====================
    
    _registerEventListeners() {
        // لیست‌نرهای داخلی برای انتشار رویداد
        this._internalListeners = [];
    }
    
    _attachEventListeners() {
        if (!this._element) return;
        
        const listeners = [
            { event: 'input', handler: this._handleInput },
            { event: 'focus', handler: this._handleFocus },
            { event: 'blur', handler: this._handleBlur },
            { event: 'keydown', handler: this._handleKeyDown },
            { event: 'change', handler: this._handleInput }
        ];
        
        listeners.forEach(({ event, handler }) => {
            this._element.addEventListener(event, handler);
            this._internalListeners.push({ event, handler });
        });
    }
    
    _removeEventListeners() {
        if (!this._element) return;
        
        this._internalListeners.forEach(({ event, handler }) => {
            this._element.removeEventListener(event, handler);
        });
        
        this._internalListeners = [];
    }
    
    _handleInput(event) {
        const oldValue = this._state.value;
        const newValue = event.target.value;
        
        // به‌روزرسانی وضعیت
        this._state.value = newValue;
        this._state.isDirty = oldValue !== newValue;
        this._state.previousValue = oldValue;
        
        // اعتبارسنجی بر اساس mode
        if (this._config.validationMode === 'change') {
            this.validate(newValue);
        }
        
        // انتشار رویداد
        this._emitEvent('input:input', {
            inputId: this._id,
            name: this._config.name,
            value: newValue,
            oldValue,
            eventType: 'input',
            isDirty: this._state.isDirty,
            nativeEvent: event
        });
    }
    
    _handleFocus(event) {
        this._state.isFocused = true;
        
        this._emitEvent('input:focus', {
            inputId: this._id,
            name: this._config.name,
            value: this._state.value,
            eventType: 'focus',
            nativeEvent: event
        });
    }
    
    _handleBlur(event) {
        this._state.isFocused = false;
        this._state.isTouched = true;
        
        // اعتبارسنجی بر اساس mode
        if (this._config.validationMode === 'blur') {
            this.validate();
        }
        
        // به‌روزرسانی UI
        this._updateValidationUI();
        
        this._emitEvent('input:blur', {
            inputId: this._id,
            name: this._config.name,
            value: this._state.value,
            eventType: 'blur',
            nativeEvent: event,
            isValid: this._state.isValid
        });
    }
    
    _handleKeyDown(event) {
        const keyEvents = {
            Enter: 'enter',
            Escape: 'escape',
            Tab: 'tab'
        };
        
        if (keyEvents[event.key]) {
            this._emitEvent('input:keydown', {
                inputId: this._id,
                name: this._config.name,
                value: this._state.value,
                key: event.key,
                eventType: keyEvents[event.key],
                nativeEvent: event
            });
        }
    }
    
    _emitEvent(eventName, data) {
        // انتشار از طریق Event Bus
        if (this._deps.eventBus && typeof this._deps.eventBus.emit === 'function') {
            this._deps.emit(eventName, {
                source: 'VakamovaInput',
                timestamp: Date.now(),
                ...data
            });
        }
        
        // انتشار رویداد سفارشی در DOM
        if (this._element) {
            const customEvent = new CustomEvent(`vakamova:${eventName}`, {
                bubbles: true,
                cancelable: true,
                detail: data
            });
            
            this._element.dispatchEvent(customEvent);
        }
    }
    
    // ==================== FORMATTING ====================
    
    format(value, formatType = null) {
        if (!this._deps.formatter || typeof this._deps.formatter !== 'function') {
            return value;
        }
        
        const formatted = this._deps.formatter(value, formatType || this._config.type, this._config);
        
        // انتشار رویداد فرمت شدن
        this._emitEvent('input:formatted', {
            inputId: this._id,
            name: this._config.name,
            rawValue: value,
            formattedValue: formatted,
            formatType: formatType || this._config.type
        });
        
        return formatted;
    }
    
    // ==================== STATIC METHODS ====================
    
    static create(config, dependencies = {}) {
        return new VakamovaInput(config, dependencies);
    }
    
    static createFormInputs(inputConfigs, dependencies = {}) {
        return inputConfigs.map(config => 
            VakamovaInput.create(config, dependencies)
        );
    }
    
    static attachToExisting(selector, config = {}, dependencies = {}) {
        const elements = document.querySelectorAll(selector);
        const inputs = [];
        
        elements.forEach((element, index) => {
            const input = new VakamovaInput({
                name: element.name || `existing_input_${index}`,
                ...config
            }, dependencies);
            
            // جایگزینی المان موجود
            const parent = element.parentNode;
            input.render(parent);
            element.remove();
            
            inputs.push(input);
        });
        
        return inputs.length === 1 ? inputs[0] : inputs;
    }
}

// ثبت جهانی برای دسترسی آسان
if (typeof window !== 'undefined') {
    window.VakamovaInput = VakamovaInput;
}

export { VakamovaInput };
