/**
 * VAKAMOVA LOGIN PAGE - صفحه ورود حرفه‌ای
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * وابستگی‌های داخلی: auth_manager.js, event_bus.js, state_manager.js, config.js, router.js
 */

class VakamovaLoginPage {
    constructor(dependencies = {}) {
        // ==================== DEPENDENCY INJECTION ====================
        this._authManager = dependencies.authManager || {
            login: async () => ({ success: false }),
            isAuthenticated: () => false
        };
        
        this._eventBus = dependencies.eventBus || {
            emit: () => {},
            on: () => () => {},
            off: () => {}
        };
        
        this._stateManager = dependencies.stateManager || {
            set: () => {},
            get: () => null,
            subscribe: () => () => {}
        };
        
        this._config = dependencies.config || {
            get: (path, def) => def
        };
        
        this._router = dependencies.router || {
            navigateTo: () => {},
            getQueryParam: () => null
        };
        
        // ==================== INTERFACE CONTRACT ====================
        this.PAGE_STATES = Object.freeze({
            INITIAL: 'initial',
            LOADING: 'loading',
            VALIDATING: 'validating',
            SUCCESS: 'success',
            ERROR: 'error',
            DISABLED: 'disabled'
        });
        
        this.FORM_FIELDS = Object.freeze({
            EMAIL: 'email',
            PASSWORD: 'password',
            REMEMBER_ME: 'remember_me'
        });
        
        // ==================== EVENT-DRIVEN STATE ====================
        this._currentState = this.PAGE_STATES.INITIAL;
        this._formData = new Map();
        this._validationErrors = new Map();
        this._uiElements = new Map();
        this._subscriptions = new Map();
        this._pageConfig = null;
        
        // ==================== CENTRALIZED CONFIGURATION ====================
        this._initializeConfiguration();
        
        // Bind methods
        this._handleEmailChange = this._handleEmailChange.bind(this);
        this._handlePasswordChange = this._handlePasswordChange.bind(this);
        this._handleRememberMeChange = this._handleRememberMeChange.bind(this);
        this._handleFormSubmit = this._handleFormSubmit.bind(this);
        this._handleForgotPassword = this._handleForgotPassword.bind(this);
        this._handleSocialLogin = this._handleSocialLogin.bind(this);
        this._cleanup = this._cleanup.bind(this);
        
        Object.seal(this);
        Object.freeze(this.PAGE_STATES);
        Object.freeze(this.FORM_FIELDS);
    }
    
    // ==================== INTERFACE CONTRACT METHODS ====================
    
    async initialize(containerId = 'app') {
        try {
            // Check if already authenticated
            if (await this._authManager.isAuthenticated()) {
                const redirectTo = this._router.getQueryParam('redirect') || '/dashboard';
                this._router.navigateTo(redirectTo, { replace: true });
                return { success: false, reason: 'already_authenticated' };
            }
            
            // Set up state
            this._setPageState(this.PAGE_STATES.INITIAL);
            
            // Initialize form data
            this._initializeFormData();
            
            // Load configuration
            await this._loadPageConfiguration();
            
            // Set up event listeners
            this._setupEventListeners();
            
            // Render the page
            await this._render(containerId);
            
            // Emit page initialized event
            this._eventBus.emit('login_page:initialized', {
                timestamp: Date.now(),
                containerId
            });
            
            return { success: true, state: this._currentState };
            
        } catch (error) {
            console.error('[LoginPage] Initialization failed:', error);
            this._eventBus.emit('login_page:initialization_failed', { error });
            
            return {
                success: false,
                error: error.message,
                state: this._currentState
            };
        }
    }
    
    async render(containerId = 'app') {
        return this._render(containerId);
    }
    
    async update(configUpdates = {}) {
        try {
            // Update configuration
            if (configUpdates.config) {
                this._pageConfig = {
                    ...this._pageConfig,
                    ...configUpdates.config
                };
            }
            
            // Update form data if provided
            if (configUpdates.formData) {
                for (const [field, value] of Object.entries(configUpdates.formData)) {
                    this._formData.set(field, value);
                }
                
                // Re-render if needed
                if (configUpdates.reRender !== false) {
                    await this._updateFormDisplay();
                }
            }
            
            this._eventBus.emit('login_page:updated', { updates: configUpdates });
            
            return { success: true };
            
        } catch (error) {
            console.error('[LoginPage] Update failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    async validateForm(field = null) {
        try {
            const validationResults = new Map();
            
            if (field) {
                // Validate single field
                const result = await this._validateField(field, this._formData.get(field));
                validationResults.set(field, result);
            } else {
                // Validate all fields
                for (const [fieldName, value] of this._formData) {
                    const result = await this._validateField(fieldName, value);
                    validationResults.set(fieldName, result);
                }
            }
            
            // Update validation errors
            this._validationErrors.clear();
            for (const [fieldName, result] of validationResults) {
                if (!result.isValid) {
                    this._validationErrors.set(fieldName, result.errors);
                }
            }
            
            // Update UI
            await this._updateValidationDisplay();
            
            // Check if form is valid
            const isValid = validationResults.size > 0 && 
                          Array.from(validationResults.values()).every(r => r.isValid);
            
            this._eventBus.emit('login_page:validation_completed', {
                isValid,
                results: Object.fromEntries(validationResults),
                field
            });
            
            return {
                isValid,
                results: Object.fromEntries(validationResults),
                errors: Object.fromEntries(this._validationErrors)
            };
            
        } catch (error) {
            console.error('[LoginPage] Validation failed:', error);
            return { isValid: false, error: error.message };
        }
    }
    
    async submit() {
        // Check if already submitting
        if (this._currentState === this.PAGE_STATES.LOADING) {
            return { success: false, error: 'Already submitting' };
        }
        
        try {
            // Set loading state
            this._setPageState(this.PAGE_STATES.LOADING);
            
            // Validate form
            const validationResult = await this.validateForm();
            if (!validationResult.isValid) {
                this._setPageState(this.PAGE_STATES.ERROR);
                return {
                    success: false,
                    error: 'Form validation failed',
                    validationErrors: validationResult.errors
                };
            }
            
            // Prepare login data
            const loginData = {
                [this.FORM_FIELDS.EMAIL]: this._formData.get(this.FORM_FIELDS.EMAIL),
                [this.FORM_FIELDS.PASSWORD]: this._formData.get(this.FORM_FIELDS.PASSWORD),
                [this.FORM_FIELDS.REMEMBER_ME]: this._formData.get(this.FORM_FIELDS.REMEMBER_ME),
                deviceInfo: this._getDeviceInfo(),
                timestamp: Date.now()
            };
            
            // Emit pre-login event
            this._eventBus.emit('login_page:pre_login', { data: loginData });
            
            // Call auth manager
            const loginResult = await this._authManager.login(loginData);
            
            if (loginResult.success) {
                // Success
                this._setPageState(this.PAGE_STATES.SUCCESS);
                
                // Update state
                this._stateManager.set('user.auth', {
                    isAuthenticated: true,
                    lastLogin: Date.now(),
                    method: 'email_password'
                });
                
                // Emit success event
                this._eventBus.emit('login_page:login_success', {
                    userId: loginResult.user?.id,
                    method: 'email_password',
                    timestamp: Date.now()
                });
                
                // Redirect
                const redirectTo = this._router.getQueryParam('redirect') || 
                                 this._pageConfig.redirectAfterLogin || 
                                 '/dashboard';
                
                setTimeout(() => {
                    this._router.navigateTo(redirectTo, { 
                        replace: true,
                        transition: 'slide-left'
                    });
                }, this._pageConfig.successRedirectDelay || 1500);
                
                return {
                    success: true,
                    redirectTo,
                    user: loginResult.user
                };
                
            } else {
                // Failure
                this._setPageState(this.PAGE_STATES.ERROR);
                
                // Update validation errors
                if (loginResult.fieldErrors) {
                    for (const [field, error] of Object.entries(loginResult.fieldErrors)) {
                        this._validationErrors.set(field, [error]);
                    }
                    await this._updateValidationDisplay();
                }
                
                // Emit failure event
                this._eventBus.emit('login_page:login_failed', {
                    reason: loginResult.reason,
                    error: loginResult.error,
                    timestamp: Date.now()
                });
                
                return {
                    success: false,
                    error: loginResult.error || 'Login failed',
                    fieldErrors: loginResult.fieldErrors
                };
            }
            
        } catch (error) {
            console.error('[LoginPage] Submit failed:', error);
            
            this._setPageState(this.PAGE_STATES.ERROR);
            this._eventBus.emit('login_page:submit_error', { error });
            
            return {
                success: false,
                error: error.message || 'An unexpected error occurred'
            };
        }
    }
    
    reset() {
        // Reset form data
        this._initializeFormData();
        
        // Clear validation errors
        this._validationErrors.clear();
        
        // Reset state
        this._setPageState(this.PAGE_STATES.INITIAL);
        
        // Update UI
        this._updateFormDisplay();
        this._updateValidationDisplay();
        
        this._eventBus.emit('login_page:reset');
        
        return { success: true };
    }
    
    cleanup() {
        return this._cleanup();
    }
    
    getState() {
        return {
            pageState: this._currentState,
            formData: Object.fromEntries(this._formData),
            validationErrors: Object.fromEntries(this._validationErrors),
            config: { ...this._pageConfig }
        };
    }
    
    // ==================== PRIVATE METHODS ====================
    
    _initializeConfiguration() {
        this._pageConfig = {
            // Visual settings
            theme: 'default',
            language: 'fa',
            direction: 'rtl',
            
            // Form settings
            enableEmailAutocomplete: true,
            enablePasswordVisibilityToggle: true,
            enableRememberMe: true,
            enableSocialLogin: false,
            enableForgotPassword: true,
            enableGuestAccess: false,
            
            // Validation settings
            minPasswordLength: 8,
            requireSpecialChars: true,
            requireNumbers: true,
            
            // Behavior settings
            autoValidate: true,
            validateOnBlur: true,
            validateOnChange: false,
            successRedirectDelay: 1500,
            redirectAfterLogin: '/dashboard',
            
            // UI settings
            showLogo: true,
            showLanguageSelector: false,
            showThemeToggle: false,
            
            // Social login providers
            socialProviders: [],
            
            // Error messages
            errorMessages: {
                invalid_email: 'لطفا یک ایمیل معتبر وارد کنید',
                password_too_short: 'رمز عبور باید حداقل ۸ کاراکتر باشد',
                password_no_number: 'رمز عبور باید شامل اعداد باشد',
                password_no_special: 'رمز عبور باید شامل کاراکترهای ویژه باشد',
                login_failed: 'ایمیل یا رمز عبور اشتباه است',
                network_error: 'خطا در ارتباط با سرور',
                too_many_attempts: 'تلاش‌های زیادی انجام شده است. لطفا کمی صبر کنید'
            }
        };
    }
    
    async _loadPageConfiguration() {
        try {
            // Load from central config
            const appConfig = this._config.get('app', {});
            const uiConfig = this._config.get('ui', {});
            const authConfig = this._config.get('auth', {});
            
            // Merge configurations
            this._pageConfig = {
                ...this._pageConfig,
                language: appConfig.defaultLanguage || 'fa',
                direction: appConfig.rtlLanguages?.includes(appConfig.defaultLanguage) ? 'rtl' : 'ltr',
                theme: uiConfig.theme || 'default',
                enableSocialLogin: authConfig.socialLogin || false,
                socialProviders: authConfig.socialProviders || [],
                errorMessages: {
                    ...this._pageConfig.errorMessages,
                    ...authConfig.errorMessages
                }
            };
            
            // Load translations if available
            await this._loadTranslations();
            
        } catch (error) {
            console.warn('[LoginPage] Failed to load configuration:', error);
            // Continue with default config
        }
    }
    
    async _loadTranslations() {
        // This would load translations from a service
        // For now, using static translations
        const translations = {
            fa: {
                title: 'ورود به واکاموا',
                email_label: 'ایمیل',
                email_placeholder: 'example@domain.com',
                password_label: 'رمز عبور',
                password_placeholder: 'رمز عبور خود را وارد کنید',
                remember_me: 'مرا به خاطر بسپار',
                submit_button: 'ورود',
                forgot_password: 'رمز عبور را فراموش کرده‌اید؟',
                no_account: 'حساب کاربری ندارید؟',
                sign_up: 'ثبت‌نام',
                or: 'یا',
                loading: 'در حال ورود...',
                success: 'ورود موفقیت‌آمیز!',
                guest_access: 'ورود به عنوان مهمان'
            }
        };
        
        this._translations = translations[this._pageConfig.language] || translations.fa;
    }
    
    _initializeFormData() {
        this._formData.set(this.FORM_FIELDS.EMAIL, '');
        this._formData.set(this.FORM_FIELDS.PASSWORD, '');
        this._formData.set(this.FORM_FIELDS.REMEMBER_ME, false);
    }
    
    _setupEventListeners() {
        // Listen for auth state changes
        const authSubscription = this._eventBus.on('auth:state_changed', (event) => {
            if (event.isAuthenticated && this._currentState !== this.PAGE_STATES.SUCCESS) {
                this._router.navigateTo('/dashboard', { replace: true });
            }
        });
        
        // Listen for config changes
        const configSubscription = this._config.subscribe?.('auth.', (newValue, oldValue, path) => {
            this._loadPageConfiguration();
            this._eventBus.emit('login_page:config_updated', { path });
        });
        
        // Listen for language changes
        const languageSubscription = this._eventBus.on('language:changed', (event) => {
            this._pageConfig.language = event.language;
            this._pageConfig.direction = event.direction;
            this._loadTranslations();
            this._render(document.getElementById('app')?.id || 'app');
        });
        
        // Store subscriptions for cleanup
        this._subscriptions.set('auth', authSubscription);
        if (configSubscription) this._subscriptions.set('config', configSubscription);
        this._subscriptions.set('language', languageSubscription);
    }
    
    async _render(containerId) {
        const container = document.getElementById(containerId);
        if (!container) {
            throw new Error(`Container #${containerId} not found`);
        }
        
        // Clear container
        container.innerHTML = '';
        
        // Create page structure
        const pageElement = document.createElement('div');
        pageElement.className = `login-page ${this._pageConfig.direction} theme-${this._pageConfig.theme}`;
        pageElement.setAttribute('data-state', this._currentState);
        
        // Generate HTML
        pageElement.innerHTML = this._generateHTML();
        
        // Append to container
        container.appendChild(pageElement);
        
        // Cache UI elements
        this._cacheUIElements(pageElement);
        
        // Attach event listeners to form elements
        this._attachEventListeners();
        
        // Update UI based on current state
        this._updateUIState();
        
        // Emit render event
        this._eventBus.emit('login_page:rendered', {
            containerId,
            state: this._currentState
        });
        
        return pageElement;
    }
    
    _generateHTML() {
        const t = this._translations;
        
        return `
            <div class="login-container">
                ${this._pageConfig.showLogo ? this._generateLogo() : ''}
                
                <div class="login-card">
                    <h1 class="login-title">${t.title}</h1>
                    
                    <form class="login-form" id="loginForm" novalidate>
                        <div class="form-group">
                            <label for="email">${t.email_label}</label>
                            <input 
                                type="email" 
                                id="email" 
                                name="email"
                                class="form-input ${this._validationErrors.has('email') ? 'error' : ''}"
                                placeholder="${t.email_placeholder}"
                                value="${this._formData.get('email')}"
                                autocomplete="${this._pageConfig.enableEmailAutocomplete ? 'email' : 'off'}"
                                ${this._currentState === this.PAGE_STATES.LOADING ? 'disabled' : ''}
                            />
                            ${this._generateErrorDisplay('email')}
                        </div>
                        
                        <div class="form-group">
                            <label for="password">${t.password_label}</label>
                            <div class="password-input-container">
                                <input 
                                    type="password" 
                                    id="password" 
                                    name="password"
                                    class="form-input ${this._validationErrors.has('password') ? 'error' : ''}"
                                    placeholder="${t.password_placeholder}"
                                    value="${this._formData.get('password')}"
                                    ${this._currentState === this.PAGE_STATES.LOADING ? 'disabled' : ''}
                                />
                                ${this._pageConfig.enablePasswordVisibilityToggle ? 
                                    '<button type="button" class="password-toggle" aria-label="نمایش رمز عبور">👁️</button>' : 
                                    ''}
                            </div>
                            ${this._generateErrorDisplay('password')}
                        </div>
                        
                        ${this._pageConfig.enableRememberMe ? `
                            <div class="form-group remember-me">
                                <label class="checkbox-label">
                                    <input 
                                        type="checkbox" 
                                        id="rememberMe" 
                                        name="remember_me"
                                        ${this._formData.get('remember_me') ? 'checked' : ''}
                                        ${this._currentState === this.PAGE_STATES.LOADING ? 'disabled' : ''}
                                    />
                                    <span>${t.remember_me}</span>
                                </label>
                            </div>
                        ` : ''}
                        
                        <div class="form-group">
                            <button 
                                type="submit" 
                                class="submit-button"
                                id="submitButton"
                                ${this._currentState === this.PAGE_STATES.LOADING ? 'disabled' : ''}
                            >
                                ${this._currentState === this.PAGE_STATES.LOADING ? 
                                    `<span class="loading-spinner"></span> ${t.loading}` : 
                                    t.submit_button
                                }
                            </button>
                        </div>
                    </form>
                    
                    ${this._pageConfig.enableForgotPassword ? `
                        <div class="forgot-password">
                            <button type="button" class="link-button" id="forgotPassword">
                                ${t.forgot_password}
                            </button>
                        </div>
                    ` : ''}
                    
                    ${this._pageConfig.enableSocialLogin && this._pageConfig.socialProviders.length > 0 ? 
                        this._generateSocialLoginSection() : 
                        ''
                    }
                    
                    ${this._pageConfig.enableGuestAccess ? `
                        <div class="guest-access">
                            <button type="button" class="guest-button" id="guestAccess">
                                ${t.guest_access}
                            </button>
                        </div>
                    ` : ''}
                    
                    <div class="signup-link">
                        <span>${t.no_account}</span>
                        <button type="button" class="link-button" id="signupLink">
                            ${t.sign_up}
                        </button>
                    </div>
                </div>
                
                ${this._pageConfig.showLanguageSelector ? this._generateLanguageSelector() : ''}
                ${this._pageConfig.showThemeToggle ? this._generateThemeToggle() : ''}
            </div>
        `;
    }
    
    _generateLogo() {
        return `
            <div class="login-logo">
                <svg width="64" height="64" viewBox="0 0 64 64">
                    <circle cx="32" cy="32" r="30" fill="#4F46E5" opacity="0.9"/>
                    <text x="32" y="40" text-anchor="middle" fill="white" font-size="24" font-weight="bold">V</text>
                </svg>
                <h2 class="logo-text">Vakamova</h2>
            </div>
        `;
    }
    
    _generateErrorDisplay(field) {
        if (!this._validationErrors.has(field)) return '';
        
        const errors = this._validationErrors.get(field);
        return `
            <div class="error-messages" id="error-${field}">
                ${errors.map(error => `
                    <div class="error-message">
                        ${this._pageConfig.errorMessages[error] || error}
                    </div>
                `).join('')}
            </div>
        `;
    }
    
    _generateSocialLoginSection() {
        const t = this._translations;
        
        return `
            <div class="social-login">
                <div class="divider">
                    <span>${t.or}</span>
                </div>
                <div class="social-buttons">
                    ${this._pageConfig.socialProviders.map(provider => `
                        <button 
                            type="button" 
                            class="social-button ${provider}"
                            data-provider="${provider}"
                            ${this._currentState === this.PAGE_STATES.LOADING ? 'disabled' : ''}
                        >
                            ${this._getSocialProviderIcon(provider)}
                            <span>${this._getSocialProviderName(provider)}</span>
                        </button>
                    `).join('')}
                </div>
            </div>
        `;
    }
    
    _generateLanguageSelector() {
        return `
            <div class="language-selector">
                <select id="languageSelect">
                    <option value="fa" ${this._pageConfig.language === 'fa' ? 'selected' : ''}>فارسی</option>
                    <option value="en" ${this._pageConfig.language === 'en' ? 'selected' : ''}>English</option>
                    <option value="ar" ${this._pageConfig.language === 'ar' ? 'selected' : ''}>العربية</option>
                </select>
            </div>
        `;
    }
    
    _generateThemeToggle() {
        return `
            <div class="theme-toggle">
                <button type="button" id="themeToggle" aria-label="تغییر تم">
                    ${this._pageConfig.theme === 'dark' ? '☀️' : '🌙'}
                </button>
            </div>
        `;
    }
    
    _getSocialProviderIcon(provider) {
        const icons = {
            google: 'G',
            github: 'G',
            facebook: 'f',
            twitter: 't',
            apple: 'A'
        };
        
        return icons[provider] || provider.charAt(0).toUpperCase();
    }
    
    _getSocialProviderName(provider) {
        const names = {
            google: 'Google',
            github: 'GitHub',
            facebook: 'Facebook',
            twitter: 'Twitter',
            apple: 'Apple'
        };
        
        return names[provider] || provider;
    }
    
    _cacheUIElements(container) {
        this._uiElements.clear();
        
        const elements = {
            form: container.querySelector('#loginForm'),
            emailInput: container.querySelector('#email'),
            passwordInput: container.querySelector('#password'),
            rememberMeCheckbox: container.querySelector('#rememberMe'),
            submitButton: container.querySelector('#submitButton'),
            forgotPasswordButton: container.querySelector('#forgotPassword'),
            signupLinkButton: container.querySelector('#signupLink'),
            guestAccessButton: container.querySelector('#guestAccess'),
            passwordToggle: container.querySelector('.password-toggle'),
            languageSelect: container.querySelector('#languageSelect'),
            themeToggle: container.querySelector('#themeToggle'),
            socialButtons: container.querySelectorAll('.social-button')
        };
        
        for (const [key, element] of Object.entries(elements)) {
            if (element) {
                this._uiElements.set(key, element);
            }
        }
    }
    
    _attachEventListeners() {
        // Form submit
        const form = this._uiElements.get('form');
        if (form) {
            form.addEventListener('submit', this._handleFormSubmit);
        }
        
        // Input events
        const emailInput = this._uiElements.get('emailInput');
        if (emailInput) {
            emailInput.addEventListener('input', this._handleEmailChange);
            if (this._pageConfig.validateOnBlur) {
                emailInput.addEventListener('blur', () => this.validateForm('email'));
            }
        }
        
        const passwordInput = this._uiElements.get('passwordInput');
        if (passwordInput) {
            passwordInput.addEventListener('input', this._handlePasswordChange);
            if (this._pageConfig.validateOnBlur) {
                passwordInput.addEventListener('blur', () => this.validateForm('password'));
            }
        }
        
        // Password toggle
        const passwordToggle = this._uiElements.get('passwordToggle');
        if (passwordToggle) {
            passwordToggle.addEventListener('click', () => {
                const input = this._uiElements.get('passwordInput');
                if (input) {
                    const type = input.type === 'password' ? 'text' : 'password';
                    input.type = type;
                    passwordToggle.setAttribute('aria-label', 
                        type === 'password' ? 'نمایش رمز عبور' : 'مخفی کردن رمز عبور'
                    );
                }
            });
        }
        
        // Remember me
        const rememberMeCheckbox = this._uiElements.get('rememberMeCheckbox');
        if (rememberMeCheckbox) {
            rememberMeCheckbox.addEventListener('change', this._handleRememberMeChange);
        }
        
        // Forgot password
        const forgotPasswordButton = this._uiElements.get('forgotPasswordButton');
        if (forgotPasswordButton) {
            forgotPasswordButton.addEventListener('click', this._handleForgotPassword);
        }
        
        // Sign up link
        const signupLinkButton = this._uiElements.get('signupLinkButton');
        if (signupLinkButton) {
            signupLinkButton.addEventListener('click', () => {
                this._router.navigateTo('/register');
            });
        }
        
        // Guest access
        const guestAccessButton = this._uiElements.get('guestAccessButton');
        if (guestAccessButton) {
            guestAccessButton.addEventListener('click', async () => {
                this._eventBus.emit('login_page:guest_access_requested');
                // Implement guest access logic
            });
        }
        
        // Social login buttons
        const socialButtons = this._uiElements.get('socialButtons');
        if (socialButtons) {
            socialButtons.forEach(button => {
                button.addEventListener('click', (e) => {
                    const provider = e.target.closest('.social-button').dataset.provider;
                    this._handleSocialLogin(provider);
                });
            });
        }
        
        // Language selector
        const languageSelect = this._uiElements.get('languageSelect');
        if (languageSelect) {
            languageSelect.addEventListener('change', (e) => {
                this._eventBus.emit('language:changed', {
                    language: e.target.value,
                    direction: e.target.value === 'fa' || e.target.value === 'ar' ? 'rtl' : 'ltr'
                });
            });
        }
        
        // Theme toggle
        const themeToggle = this._uiElements.get('themeToggle');
        if (themeToggle) {
            themeToggle.addEventListener('click', () => {
                const newTheme = this._pageConfig.theme === 'dark' ? 'light' : 'dark';
                this._pageConfig.theme = newTheme;
                this._eventBus.emit('theme:changed', { theme: newTheme });
                this._render(document.getElementById('app')?.id || 'app');
            });
        }
    }
    
    _handleEmailChange(e) {
        const value = e.target.value.trim();
        this._formData.set(this.FORM_FIELDS.EMAIL, value);
        
        if (this._pageConfig.validateOnChange && this._pageConfig.autoValidate) {
            this.validateForm('email');
        }
        
        this._eventBus.emit('login_page:email_changed', { value });
    }
    
    _handlePasswordChange(e) {
        const value = e.target.value;
        this._formData.set(this.FORM_FIELDS.PASSWORD, value);
        
        if (this._pageConfig.validateOnChange && this._pageConfig.autoValidate) {
            this.validateForm('password');
        }
        
        this._eventBus.emit('login_page:password_changed', { length: value.length });
    }
    
    _handleRememberMeChange(e) {
        const value = e.target.checked;
        this._formData.set(this.FORM_FIELDS.REMEMBER_ME, value);
        
        this._eventBus.emit('login_page:remember_me_changed', { value });
    }
    
    async _handleFormSubmit(e) {
        e.preventDefault();
        await this.submit();
    }
    
    async _handleForgotPassword() {
        this._eventBus.emit('login_page:forgot_password_clicked');
        
        // Navigate to forgot password page
        this._router.navigateTo('/forgot-password', {
            state: { email: this._formData.get('email') }
        });
    }
    
    async _handleSocialLogin(provider) {
        try {
            this._setPageState(this.PAGE_STATES.LOADING);
            
            this._eventBus.emit('login_page:social_login_started', { provider });
            
            // Here you would integrate with your social login service
            // For now, just simulate a delay and navigate
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            this._router.navigateTo('/dashboard');
            
        } catch (error) {
            console.error('[LoginPage] Social login failed:', error);
            this._setPageState(this.PAGE_STATES.ERROR);
        }
    }
    
    async _validateField(field, value) {
        const validators = {
            [this.FORM_FIELDS.EMAIL]: this._validateEmail.bind(this),
            [this.FORM_FIELDS.PASSWORD]: this._validatePassword.bind(this)
        };
        
        const validator = validators[field];
        if (validator) {
            return validator(value);
        }
        
        return { isValid: true, errors: [] };
    }
    
    _validateEmail(email) {
        const errors = [];
        
        if (!email) {
            errors.push('email_required');
        } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            errors.push('invalid_email');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    
    _validatePassword(password) {
        const errors = [];
        
        if (!password) {
            errors.push('password_required');
        } else {
            if (password.length < this._pageConfig.minPasswordLength) {
                errors.push('password_too_short');
            }
            
            if (this._pageConfig.requireNumbers && !/\d/.test(password)) {
                errors.push('password_no_number');
            }
            
            if (this._pageConfig.requireSpecialChars && !/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
                errors.push('password_no_special');
            }
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
    
    _setPageState(newState) {
        const oldState = this._currentState;
        this._currentState = newState;
        
        // Update UI
        this._updateUIState();
        
        // Emit state change event
        this._eventBus.emit('login_page:state_changed', {
            oldState,
            newState,
            timestamp: Date.now()
        });
    }
    
    _updateUIState() {
        const pageElement = document.querySelector('.login-page');
        if (pageElement) {
            pageElement.setAttribute('data-state', this._currentState);
        }
        
        // Update submit button
        const submitButton = this._uiElements.get('submitButton');
        if (submitButton) {
            submitButton.disabled = this._currentState === this.PAGE_STATES.LOADING;
        }
        
        // Update inputs
        const inputs = ['emailInput', 'passwordInput'];
        inputs.forEach(inputKey => {
            const input = this._uiElements.get(inputKey);
            if (input) {
                input.disabled = this._currentState === this.PAGE_STATES.LOADING;
            }
        });
        
        // Update other interactive elements
        const interactiveElements = [
            'rememberMeCheckbox',
            'forgotPasswordButton',
            'signupLinkButton',
            'guestAccessButton',
            'passwordToggle',
            'languageSelect',
            'themeToggle'
        ];
        
        interactiveElements.forEach(elementKey => {
            const element = this._uiElements.get(elementKey);
            if (element) {
                element.disabled = this._currentState === this.PAGE_STATES.LOADING;
            }
        });
    }
    
    _updateFormDisplay() {
        // Update input values
        const emailInput = this._uiElements.get('emailInput');
        if (emailInput) {
            emailInput.value = this._formData.get('email') || '';
        }
        
        const passwordInput = this._uiElements.get('passwordInput');
        if (passwordInput) {
            passwordInput.value = this._formData.get('password') || '';
        }
        
        const rememberMeCheckbox = this._uiElements.get('rememberMeCheckbox');
        if (rememberMeCheckbox) {
            rememberMeCheckbox.checked = this._formData.get('remember_me') || false;
        }
    }
    
    _updateValidationDisplay() {
        // Update error displays
        for (const [field] of this._formData) {
            const input = this._uiElements.get(`${field}Input`);
            const errorContainer = document.getElementById(`error-${field}`);
            
            if (input) {
                if (this._validationErrors.has(field)) {
                    input.classList.add('error');
                } else {
                    input.classList.remove('error');
                }
            }
            
            if (errorContainer) {
                if (this._validationErrors.has(field)) {
                    const errors = this._validationErrors.get(field);
                    errorContainer.innerHTML = errors.map(error => `
                        <div class="error-message">
                            ${this._pageConfig.errorMessages[error] || error}
                        </div>
                    `).join('');
                    errorContainer.style.display = 'block';
                } else {
                    errorContainer.style.display = 'none';
                }
            }
        }
    }
    
    _getDeviceInfo() {
        return {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            screenSize: `${window.screen.width}x${window.screen.height}`,
            isMobile: /Mobi|Android/i.test(navigator.userAgent),
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
        };
    }
    
    _cleanup() {
        // Remove event listeners
        const form = this._uiElements.get('form');
        if (form) {
            form.removeEventListener('submit', this._handleFormSubmit);
        }
        
        // Unsubscribe from events
        for (const unsubscribe of this._subscriptions.values()) {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        }
        
        this._subscriptions.clear();
        this._uiElements.clear();
        
        // Emit cleanup event
        this._eventBus.emit('login_page:cleanup');
        
        return { success: true };
    }
}

// ==================== EXPORT PATTERN ====================

function createLoginPage(dependencies = {}) {
    return new VakamovaLoginPage(dependencies);
}

export { VakamovaLoginPage, createLoginPage };
