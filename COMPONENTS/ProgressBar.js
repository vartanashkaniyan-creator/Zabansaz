/**
 * VAKAMOVA PROGRESS BAR - سیستم پیشرفته نمایش پیشرفت
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * وابستگی‌های داخلی: event_bus.js, utils.js, state_manager.js
 */

class ProgressBarSystem {
    constructor(dependencies = {}) {
        // تزریق وابستگی‌ها
        this._deps = {
            eventBus: dependencies.eventBus || window.eventBus,
            utils: dependencies.utils || window.utils,
            state: dependencies.state || window.state_manager,
            ...dependencies
        };
        
        // پیکربندی متمرکز
        this._config = Object.freeze({
            types: ['linear', 'circular', 'steps'],
            defaultType: 'linear',
            animationSpeed: 300,
            rtlSupport: true,
            colorSchemes: {
                primary: ['#0d7377', '#14ffec'],
                success: ['#4CAF50', '#8BC34A'],
                warning: ['#FF9800', '#FFC107'],
                danger: ['#F44336', '#E91E63']
            },
            events: {
                started: 'progress:started',
                updated: 'progress:updated',
                completed: 'progress:completed',
                clicked: 'progress:clicked'
            },
            ...dependencies.config
        });
        
        // وضعیت داخلی
        this._instances = new Map();
        this._templates = new Map();
        this._middlewares = [];
        
        this._initTemplates();
        this._initEventSystem();
        
        Object.seal(this);
    }
    
    // ==================== رابط عمومی (Public Interface) ====================
    
    create(container, options = {}) {
        this._validateContainer(container);
        
        const instanceId = `progress_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const normalizedOptions = this._normalizeOptions(options);
        
        const instance = {
            id: instanceId,
            container,
            options: normalizedOptions,
            state: {
                current: normalizedOptions.initialValue || 0,
                target: normalizedOptions.value || 0,
                isAnimating: false,
                lastUpdate: Date.now(),
                history: []
            },
            elements: {},
            listeners: new Map()
        };
        
        // ایجاد DOM
        this._render(instance);
        
        // ذخیره instance
        this._instances.set(instanceId, instance);
        
        // ثبت در state manager
        this._deps.state.set(`ui.progress.${instanceId}`, {
            ...instance.state,
            options: normalizedOptions
        });
        
        // انتشار رویداد
        this._deps.eventBus.emit(this._config.events.started, {
            instanceId,
            options: normalizedOptions
        });
        
        return {
            id: instanceId,
            update: (value) => this.update(instanceId, value),
            animateTo: (value, duration) => this.animateTo(instanceId, value, duration),
            reset: () => this.reset(instanceId),
            destroy: () => this.destroy(instanceId),
            getState: () => ({ ...instance.state }),
            on: (event, handler) => this._addListener(instanceId, event, handler)
        };
    }
    
    update(instanceId, value) {
        const instance = this._instances.get(instanceId);
        if (!instance) throw new Error(`Instance ${instanceId} not found`);
        
        const oldValue = instance.state.current;
        const newValue = this._clampValue(value, instance.options);
        
        // اجرای middleware قبل از به‌روزرسانی
        const middlewareResult = this._runMiddlewares('beforeUpdate', {
            instanceId,
            oldValue,
            newValue,
            instance
        });
        
        if (middlewareResult.canceled) {
            return { success: false, reason: 'middleware_blocked' };
        }
        
        // به‌روزرسانی وضعیت
        instance.state.current = newValue;
        instance.state.lastUpdate = Date.now();
        instance.state.history.push({ value: newValue, timestamp: Date.now() });
        
        // محدود کردن تاریخچه
        if (instance.state.history.length > 50) {
            instance.state.history.shift();
        }
        
        // به‌روزرسانی state manager
        this._deps.state.update(`ui.progress.${instanceId}`, {
            current: newValue,
            lastUpdate: instance.state.lastUpdate
        });
        
        // رندر
        this._updateVisual(instance, oldValue, newValue);
        
        // انتشار رویداد
        this._deps.eventBus.emit(this._config.events.updated, {
            instanceId,
            oldValue,
            newValue,
            instance: { ...instance.state }
        });
        
        // بررسی تکمیل
        if (newValue >= (instance.options.max || 100) && instance.options.autoComplete !== false) {
            this._handleCompletion(instanceId);
        }
        
        // اجرای middleware بعد از به‌روزرسانی
        this._runMiddlewares('afterUpdate', {
            instanceId,
            oldValue,
            newValue,
            instance
        });
        
        return {
            success: true,
            instanceId,
            oldValue,
            newValue,
            progress: this._calculateProgress(newValue, instance.options)
        };
    }
    
    animateTo(instanceId, targetValue, duration = 1000) {
        const instance = this._instances.get(instanceId);
        if (!instance) throw new Error(`Instance ${instanceId} not found`);
        
        const startValue = instance.state.current;
        const endValue = this._clampValue(targetValue, instance.options);
        const startTime = Date.now();
        
        if (instance.state.isAnimating) {
            this._cancelAnimation(instanceId);
        }
        
        instance.state.isAnimating = true;
        instance.state.target = endValue;
        
        const animate = () => {
            if (!instance.state.isAnimating) return;
            
            const now = Date.now();
            const elapsed = now - startTime;
            const progress = Math.min(elapsed / duration, 1);
            
            // easing function
            const easeProgress = this._easeOutCubic(progress);
            const currentValue = startValue + (endValue - startValue) * easeProgress;
            
            this.update(instanceId, currentValue);
            
            if (progress < 1) {
                instance.animationFrame = requestAnimationFrame(animate);
            } else {
                instance.state.isAnimating = false;
                instance.state.target = currentValue;
            }
        };
        
        instance.animationFrame = requestAnimationFrame(animate);
        
        return {
            cancel: () => this._cancelAnimation(instanceId),
            promise: new Promise(resolve => {
                const checkComplete = () => {
                    if (!instance.state.isAnimating) {
                        resolve({
                            instanceId,
                            startValue,
                            endValue,
                            duration: Date.now() - startTime
                        });
                    } else {
                        setTimeout(checkComplete, 50);
                    }
                };
                checkComplete();
            })
        };
    }
    
    reset(instanceId) {
        const instance = this._instances.get(instanceId);
        if (!instance) throw new Error(`Instance ${instanceId} not found`);
        
        const initialValue = instance.options.initialValue || 0;
        
        this._cancelAnimation(instanceId);
        
        instance.state.current = initialValue;
        instance.state.target = initialValue;
        instance.state.history = [];
        instance.state.isAnimating = false;
        
        this._updateVisual(instance, instance.state.current, initialValue);
        
        this._deps.eventBus.emit(this._config.events.updated, {
            instanceId,
            oldValue: instance.state.current,
            newValue: initialValue,
            isReset: true
        });
        
        return { success: true, instanceId, value: initialValue };
    }
    
    destroy(instanceId) {
        const instance = this._instances.get(instanceId);
        if (!instance) return false;
        
        this._cancelAnimation(instanceId);
        
        // حذف event listeners
        for (const [event, handlers] of instance.listeners) {
            for (const handler of handlers) {
                instance.container.removeEventListener(event, handler);
            }
        }
        
        // حذف DOM
        if (instance.elements.root && instance.elements.root.parentNode) {
            instance.elements.root.parentNode.removeChild(instance.elements.root);
        }
        
        // حذف از state manager
        this._deps.state.delete(`ui.progress.${instanceId}`);
        
        // حذف instance
        this._instances.delete(instanceId);
        
        return true;
    }
    
    use(middleware) {
        if (typeof middleware !== 'function') {
            throw new TypeError('Middleware must be a function');
        }
        
        this._middlewares.push(middleware);
        return () => {
            this._middlewares = this._middlewares.filter(m => m !== middleware);
        };
    }
    
    // ==================== رابط خصوصی (Private Interface) ====================
    
    _initTemplates() {
        // تمپلیت خطی
        this._templates.set('linear', (instance) => {
            const isRTL = this._config.rtlSupport && this._deps.utils?.isRTL();
            
            return `
                <div class="v-progress-container" dir="${isRTL ? 'rtl' : 'ltr'}">
                    <div class="v-progress-header">
                        ${instance.options.label ? `
                            <span class="v-progress-label">${this._escapeHtml(instance.options.label)}</span>
                        ` : ''}
                        ${instance.options.showPercentage ? `
                            <span class="v-progress-percentage">0%</span>
                        ` : ''}
                    </div>
                    
                    <div class="v-progress-track" 
                         role="progressbar"
                         aria-valuemin="${instance.options.min || 0}"
                         aria-valuemax="${instance.options.max || 100}"
                         aria-valuenow="0"
                         tabindex="0">
                        <div class="v-progress-fill"></div>
                        ${instance.options.showSteps && instance.options.steps ? `
                            <div class="v-progress-steps">
                                ${instance.options.steps.map((step, i) => `
                                    <div class="v-progress-step" 
                                         data-step="${i}"
                                         data-value="${step.value}"
                                         title="${this._escapeHtml(step.label || `Step ${i + 1}`)}"></div>
                                `).join('')}
                            </div>
                        ` : ''}
                    </div>
                    
                    ${instance.options.showInfo ? `
                        <div class="v-progress-info">
                            <span class="v-progress-current">0</span>
                            <span class="v-progress-separator">/</span>
                            <span class="v-progress-total">${instance.options.max || 100}</span>
                        </div>
                    ` : ''}
                </div>
            `;
        });
        
        // تمپلیت دایره‌ای
        this._templates.set('circular', (instance) => {
            const size = instance.options.size || 120;
            const strokeWidth = instance.options.strokeWidth || 8;
            const radius = (size - strokeWidth) / 2;
            const circumference = 2 * Math.PI * radius;
            
            return `
                <div class="v-progress-circular" style="width: ${size}px; height: ${size}px;">
                    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                        <circle class="v-progress-circular-bg"
                                cx="${size / 2}"
                                cy="${size / 2}"
                                r="${radius}"
                                stroke-width="${strokeWidth}"
                                fill="none"/>
                        
                        <circle class="v-progress-circular-fill"
                                cx="${size / 2}"
                                cy="${size / 2}"
                                r="${radius}"
                                stroke-width="${strokeWidth}"
                                fill="none"
                                stroke-dasharray="${circumference}"
                                stroke-dashoffset="${circumference}"
                                transform="rotate(-90 ${size / 2} ${size / 2})"/>
                    </svg>
                    
                    <div class="v-progress-circular-content">
                        ${instance.options.showPercentage ? `
                            <div class="v-progress-circular-percentage">0%</div>
                        ` : ''}
                        ${instance.options.label ? `
                            <div class="v-progress-circular-label">${this._escapeHtml(instance.options.label)}</div>
                        ` : ''}
                    </div>
                </div>
            `;
        });
        
        // تمپلیت مرحله‌ای
        this._templates.set('steps', (instance) => {
            const steps = instance.options.steps || [];
            const isRTL = this._config.rtlSupport && this._deps.utils?.isRTL();
            
            return `
                <div class="v-progress-steps-container" dir="${isRTL ? 'rtl' : 'ltr'}">
                    ${steps.map((step, index) => `
                        <div class="v-progress-step-item" data-step="${index}">
                            <div class="v-progress-step-indicator">
                                <div class="v-progress-step-icon">${step.icon || (index + 1)}</div>
                                ${index < steps.length - 1 ? `
                                    <div class="v-progress-step-connector"></div>
                                ` : ''}
                            </div>
                            <div class="v-progress-step-content">
                                <div class="v-progress-step-title">${this._escapeHtml(step.title)}</div>
                                ${step.description ? `
                                    <div class="v-progress-step-desc">${this._escapeHtml(step.description)}</div>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        });
    }
    
    _initEventSystem() {
        // گوش دادن به رویدادهای کلیک
        this._deps.eventBus.on('progress:clicked', (data) => {
            this._handleClick(data.instanceId, data.event);
        });
    }
    
    _render(instance) {
        const template = this._templates.get(instance.options.type) || this._templates.get('linear');
        const html = template(instance);
        
        // ایجاد المنت ریشه
        const root = document.createElement('div');
        root.className = `v-progress v-progress-${instance.options.type}`;
        root.innerHTML = html;
        
        // ذخیره عناصر مهم
        instance.elements.root = root;
        
        switch (instance.options.type) {
            case 'linear':
                instance.elements.fill = root.querySelector('.v-progress-fill');
                instance.elements.percentage = root.querySelector('.v-progress-percentage');
                instance.elements.current = root.querySelector('.v-progress-current');
                instance.elements.track = root.querySelector('.v-progress-track');
                break;
                
            case 'circular':
                instance.elements.fill = root.querySelector('.v-progress-circular-fill');
                instance.elements.percentage = root.querySelector('.v-progress-circular-percentage');
                break;
                
            case 'steps':
                instance.elements.steps = Array.from(root.querySelectorAll('.v-progress-step-item'));
                instance.elements.indicators = Array.from(root.querySelectorAll('.v-progress-step-icon'));
                instance.elements.connectors = Array.from(root.querySelectorAll('.v-progress-step-connector'));
                break;
        }
        
        // اضافه کردن به container
        instance.container.appendChild(root);
        
        // رویداد کلیک
        if (instance.options.clickable) {
            const clickHandler = (e) => {
                this._deps.eventBus.emit(this._config.events.clicked, {
                    instanceId: instance.id,
                    event: e,
                    progress: this._calculateProgress(instance.state.current, instance.options)
                });
            };
            
            root.addEventListener('click', clickHandler);
            instance.listeners.set('click', [clickHandler]);
        }
        
        // به‌روزرسانی اولیه
        this._updateVisual(instance, 0, instance.state.current);
    }
    
    _updateVisual(instance, oldValue, newValue) {
        const progress = this._calculateProgress(newValue, instance.options);
        const colorScheme = this._getColorScheme(instance.options);
        
        switch (instance.options.type) {
            case 'linear':
                this._updateLinearProgress(instance, progress, colorScheme);
                break;
                
            case 'circular':
                this._updateCircularProgress(instance, progress, colorScheme);
                break;
                
            case 'steps':
                this._updateStepsProgress(instance, progress);
                break;
        }
        
        // به‌روزرسانی ARIA
        this._updateARIA(instance, newValue);
    }
    
    _updateLinearProgress(instance, progress, colorScheme) {
        if (!instance.elements.fill) return;
        
        const fillWidth = `${progress.percentage}%`;
        instance.elements.fill.style.width = fillWidth;
        instance.elements.fill.style.background = this._createGradient(colorScheme);
        
        // به‌روزرسانی درصد
        if (instance.elements.percentage) {
            instance.elements.percentage.textContent = `${Math.round(progress.percentage)}%`;
        }
        
        // به‌روزرسانی مقادیر
        if (instance.elements.current) {
            instance.elements.current.textContent = progress.value;
        }
        
        // به‌روزرسانی steps
        if (instance.options.showSteps && instance.options.steps) {
            this._updateStepsHighlights(instance, progress.value);
        }
    }
    
    _updateCircularProgress(instance, progress, colorScheme) {
        if (!instance.elements.fill) return;
        
        const size = instance.options.size || 120;
        const strokeWidth = instance.options.strokeWidth || 8;
        const radius = (size - strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (progress.percentage / 100) * circumference;
        
        instance.elements.fill.style.strokeDashoffset = offset;
        instance.elements.fill.style.stroke = colorScheme[0];
        
        if (instance.elements.percentage) {
            instance.elements.percentage.textContent = `${Math.round(progress.percentage)}%`;
        }
    }
    
    _updateStepsProgress(instance, progress) {
        if (!instance.elements.steps || !instance.options.steps) return;
        
        const currentStepIndex = this._findCurrentStepIndex(progress.value, instance.options.steps);
        
        instance.elements.steps.forEach((stepEl, index) => {
            const isCompleted = index < currentStepIndex;
            const isActive = index === currentStepIndex;
            const isFuture = index > currentStepIndex;
            
            stepEl.classList.toggle('completed', isCompleted);
            stepEl.classList.toggle('active', isActive);
            stepEl.classList.toggle('future', isFuture);
            
            // به‌روزرسانی connector
            if (index < instance.elements.connectors.length) {
                const connector = instance.elements.connectors[index];
                if (connector) {
                    connector.classList.toggle('completed', isCompleted);
                }
            }
        });
    }
    
    _updateARIA(instance, value) {
        const track = instance.elements.track || instance.elements.root;
        if (!track) return;
        
        track.setAttribute('aria-valuenow', value);
        track.setAttribute('aria-valuetext', `${value} of ${instance.options.max || 100}`);
    }
    
    _handleCompletion(instanceId) {
        const instance = this._instances.get(instanceId);
        if (!instance) return;
        
        this._deps.eventBus.emit(this._config.events.completed, {
            instanceId,
            value: instance.state.current,
            progress: this._calculateProgress(instance.state.current, instance.options)
        });
        
        if (instance.options.onComplete) {
            instance.options.onComplete(instance);
        }
    }
    
    _handleClick(instanceId, event) {
        const instance = this._instances.get(instanceId);
        if (!instance || !instance.options.onClick) return;
        
        const rect = instance.elements.root.getBoundingClientRect();
        const clickPosition = {
            x: event.clientX - rect.left,
            y: event.clientY - rect.top,
            percentageX: (event.clientX - rect.left) / rect.width * 100,
            percentageY: (event.clientY - rect.top) / rect.height * 100
        };
        
        instance.options.onClick({
            instanceId,
            event,
            clickPosition,
            progress: this._calculateProgress(instance.state.current, instance.options)
        });
    }
    
    _cancelAnimation(instanceId) {
        const instance = this._instances.get(instanceId);
        if (!instance) return;
        
        if (instance.animationFrame) {
            cancelAnimationFrame(instance.animationFrame);
            instance.animationFrame = null;
        }
        
        instance.state.isAnimating = false;
    }
    
    _addListener(instanceId, event, handler) {
        const instance = this._instances.get(instanceId);
        if (!instance) throw new Error(`Instance ${instanceId} not found`);
        
        if (!instance.listeners.has(event)) {
            instance.listeners.set(event, []);
        }
        
        instance.listeners.get(event).push(handler);
        
        return () => {
            const handlers = instance.listeners.get(event);
            if (handlers) {
                instance.listeners.set(event, handlers.filter(h => h !== handler));
            }
        };
    }
    
    // ==================== Utility Methods ====================
    
    _validateContainer(container) {
        if (!container || !(container instanceof HTMLElement)) {
            throw new TypeError('Container must be a valid DOM element');
        }
    }
    
    _normalizeOptions(options) {
        const defaults = {
            type: this._config.defaultType,
            min: 0,
            max: 100,
            initialValue: 0,
            showPercentage: true,
            showInfo: false,
            showSteps: false,
            clickable: false,
            colorScheme: 'primary',
            autoComplete: true,
            rtl: this._config.rtlSupport && this._deps.utils?.isRTL()
        };
        
        const normalized = { ...defaults, ...options };
        
        // اعتبارسنجی
        if (!this._config.types.includes(normalized.type)) {
            throw new Error(`Invalid progress type: ${normalized.type}`);
        }
        
        if (normalized.min >= normalized.max) {
            throw new Error('min must be less than max');
        }
        
        if (normalized.type === 'steps' && (!normalized.steps || !Array.isArray(normalized.steps))) {
            throw new Error('Steps type requires steps array');
        }
        
        return normalized;
    }
    
    _clampValue(value, options) {
        return Math.max(options.min || 0, Math.min(value, options.max || 100));
    }
    
    _calculateProgress(value, options) {
        const min = options.min || 0;
        const max = options.max || 100;
        const range = max - min;
        const normalized = value - min;
        
        return {
            value,
            normalized,
            percentage: range > 0 ? (normalized / range) * 100 : 0,
            fraction: range > 0 ? normalized / range : 0
        };
    }
    
    _getColorScheme(options) {
        const scheme = options.colorScheme || 'primary';
        return this._config.colorSchemes[scheme] || this._config.colorSchemes.primary;
    }
    
    _createGradient(colors) {
        if (colors.length === 1) return colors[0];
        return `linear-gradient(90deg, ${colors.join(', ')})`;
    }
    
    _findCurrentStepIndex(value, steps) {
        for (let i = steps.length - 1; i >= 0; i--) {
            if (value >= steps[i].value) {
                return i;
            }
        }
        return 0;
    }
    
    _updateStepsHighlights(instance, currentValue) {
        if (!instance.options.steps || !instance.elements.root) return;
        
        const stepMarkers = instance.elements.root.querySelectorAll('.v-progress-step');
        stepMarkers.forEach((marker, index) => {
            const stepValue = parseFloat(marker.dataset.value);
            const isActive = currentValue >= stepValue;
            marker.classList.toggle('active', isActive);
        });
    }
    
    _escapeHtml(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    _easeOutCubic(t) {
        return 1 - Math.pow(1 - t, 3);
    }
    
    _runMiddlewares(phase, data) {
        let result = { canceled: false };
        
        for (const middleware of this._middlewares) {
            try {
                const middlewareResult = middleware(phase, data, result);
                if (middlewareResult === false) {
                    return { canceled: true, reason: 'middleware_blocked' };
                }
                if (middlewareResult && typeof middlewareResult === 'object') {
                    result = { ...result, ...middlewareResult };
                }
            } catch (error) {
                console.error('[ProgressBar] Middleware error:', error);
            }
        }
        
        return result;
    }
}

// ==================== CSS Styles (Inject Automatically) ====================
const PROGRESS_BAR_STYLES = `
.v-progress {
    font-family: system-ui, -apple-system, sans-serif;
    direction: var(--progress-direction, ltr);
}

/* Linear Progress */
.v-progress-linear {
    width: 100%;
}

.v-progress-container {
    padding: 8px 0;
}

.v-progress-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 6px;
}

.v-progress-label {
    font-size: 14px;
    font-weight: 500;
    color: #333;
}

.v-progress-percentage {
    font-size: 13px;
    font-weight: bold;
    color: #666;
}

.v-progress-track {
    position: relative;
    height: 8px;
    background: #e0e0e0;
    border-radius: 4px;
    overflow: hidden;
    cursor: pointer;
    transition: background-color 0.2s;
}

.v-progress-track:hover {
    background: #d5d5d5;
}

.v-progress-fill {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
    position: relative;
    overflow: hidden;
}

.v-progress-fill::after {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg, 
        transparent 0%, 
        rgba(255,255,255,0.3) 50%, 
        transparent 100%);
    animation: progress-shimmer 2s infinite;
}

@keyframes progress-shimmer {
    0% { transform: translateX(-100%); }
    100% { transform: translateX(100%); }
}

.v-progress-steps {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    display: flex;
    justify-content: space-between;
    pointer-events: none;
}

.v-progress-step {
    width: 2px;
    height: 100%;
    background: rgba(255,255,255,0.5);
    transform: translateX(-50%);
}

.v-progress-step.active {
    background: #fff;
    box-shadow: 0 0 4px rgba(0,0,0,0.3);
}

.v-progress-info {
    display: flex;
    justify-content: center;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    font-size: 12px;
    color: #666;
}

/* Circular Progress */
.v-progress-circular {
    position: relative;
    margin: 0 auto;
}

.v-progress-circular-bg {
    stroke: #e0e0e0;
}

.v-progress-circular-fill {
    stroke-linecap: round;
    transition: stroke-dashoffset 0.3s ease;
}

.v-progress-circular-content {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    text-align: center;
}

.v-progress-circular-percentage {
    font-size: 24px;
    font-weight: bold;
    color: #333;
}

.v-progress-circular-label {
    font-size: 12px;
    color: #666;
    margin-top: 4px;
}

/* Steps Progress */
.v-progress-steps-container {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.v-progress-step-item {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    opacity: 0.5;
    transition: opacity 0.3s ease;
}

.v-progress-step-item.completed {
    opacity: 1;
}

.v-progress-step-item.active {
    opacity: 1;
    transform: scale(1.02);
}

.v-progress-step-item.future {
    opacity: 0.3;
}

.v-progress-step-indicator {
    position: relative;
    flex-shrink: 0;
}

.v-progress-step-icon {
    width: 32px;
    height: 32px;
    background: #e0e0e0;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 14px;
    font-weight: bold;
    color: #666;
    transition: all 0.3s ease;
    z-index: 1;
    position: relative;
}

.v-progress-step-item.completed .v-progress-step-icon {
    background: #4CAF50;
    color: white;
}

.v-progress-step-item.active .v-progress-step-icon {
    background: #2196F3;
    color: white;
    box-shadow: 0 0 0 4px rgba(33, 150, 243, 0.2);
}

.v-progress-step-connector {
    position: absolute;
    top: 32px;
    left: 50%;
    transform: translateX(-50%);
    width: 2px;
    height: calc(100% + 16px);
    background: #e0e0e0;
    transition: background 0.3s ease;
}

.v-progress-step-item.completed .v-progress-step-connector {
    background: #4CAF50;
}

.v-progress-step-content {
    flex: 1;
}

.v-progress-step-title {
    font-weight: 500;
    color: #333;
    margin-bottom: 2px;
}

.v-progress-step-desc {
    font-size: 12px;
    color: #666;
    line-height: 1.4;
}

/* RTL Support */
[dir="rtl"] .v-progress-fill {
    right: 0;
    left: auto;
}

[dir="rtl"] .v-progress-step-connector {
    left: auto;
    right: 50%;
    transform: translateX(50%);
}
`;

// ==================== Singleton Instance ====================
let progressBarSystem = null;

function initProgressBarSystem(dependencies = {}) {
    if (!progressBarSystem) {
        // تزریق استایل‌ها
        if (!document.querySelector('#v-progress-styles')) {
            const styleEl = document.createElement('style');
            styleEl.id = 'v-progress-styles';
            styleEl.textContent = PROGRESS_BAR_STYLES;
            document.head.appendChild(styleEl);
        }
        
        progressBarSystem = new ProgressBarSystem(dependencies);
        Object.freeze(progressBarSystem);
    }
    return progressBarSystem;
}

// Export for ES6 modules
export { ProgressBarSystem, initProgressBarSystem };

// Global registration for non-module environments
if (typeof window !== 'undefined') {
    window.ProgressBarSystem = ProgressBarSystem;
    window.initProgressBarSystem = initProgressBarSystem;
}

console.log('[ProgressBar] ✅ سیستم ProgressBar Vakamova بارگذاری شد');
