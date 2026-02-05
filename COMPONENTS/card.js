/**
 * VAKAMOVA CARD COMPONENT - کامپوننت کارت هوشمند
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * وابستگی: فقط event_bus.js (برای ارتباط رویدادمحور)
 */

class VakamovaCard {
    constructor(config = {}) {
        // ==================== پیکربندی متمرکز ====================
        this._config = Object.freeze({
            types: {
                lesson: { base: 'v-card-lesson', accent: '#0d7377', icon: '📚' },
                stats: { base: 'v-card-stats', accent: '#4CAF50', icon: '📊' },
                user: { base: 'v-card-user', accent: '#9C27B0', icon: '👤' },
                info: { base: 'v-card-info', accent: '#2196F3', icon: 'ℹ️' },
                warning: { base: 'v-card-warning', accent: '#FF9800', icon: '⚠️' },
                achievement: { base: 'v-card-achievement', accent: '#FFD700', icon: '🏆' }
            },
            sizes: {
                sm: { class: 'v-card-sm', padding: '12px', radius: '8px' },
                md: { class: 'v-card-md', padding: '20px', radius: '12px' },
                lg: { class: 'v-card-lg', padding: '28px', radius: '16px' },
                xl: { class: 'v-card-xl', padding: '36px', radius: '20px' }
            },
            layouts: {
                vertical: 'v-card-vertical',
                horizontal: 'v-card-horizontal',
                compact: 'v-card-compact',
                feature: 'v-card-feature'
            },
            elevations: {
                0: 'v-card-elevation-0',
                1: 'v-card-elevation-1',
                2: 'v-card-elevation-2',
                3: 'v-card-elevation-3',
                4: 'v-card-elevation-4'
            },
            ...config
        });

        // ==================== تزریق وابستگی ====================
        this._eventBus = config.eventBus || window.eventBus || {
            emit: (event, data) => console.log(`[Card] ${event}:`, data),
            on: () => () => {}
        };

        // ==================== وضعیت داخلی ====================
        this._state = {
            expanded: false,
            selected: false,
            loading: false,
            interactive: true,
            hover: false,
            focus: false
        };

        this._elements = {
            container: null,
            card: null,
            header: null,
            body: null,
            footer: null,
            actions: null,
            overlay: null,
            badge: null
        };

        this._listeners = new Map();
        this._cardId = `card_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        this._animationFrame = null;

        // ==================== متدهای عمومی ====================
        this.render = this.render.bind(this);
        this.update = this.update.bind(this);
        this.destroy = this.destroy.bind(this);
        this.expand = this.expand.bind(this);
        this.collapse = this.collapse.bind(this);
        this.select = this.select.bind(this);
        this.deselect = this.deselect.bind(this);
        this.highlight = this.highlight.bind(this);
        this.shake = this.shake.bind(this);
        this.setLoading = this.setLoading.bind(this);
        this.setInteractive = this.setInteractive.bind(this);
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
        this._elements.card = container.querySelector(`#${this._cardId}`);
        this._elements.header = container.querySelector('.v-card-header');
        this._elements.body = container.querySelector('.v-card-body');
        this._elements.footer = container.querySelector('.v-card-footer');
        this._elements.actions = container.querySelector('.v-card-actions');
        this._elements.overlay = container.querySelector('.v-card-overlay');
        this._elements.badge = container.querySelector('.v-card-badge');
        
        // اعمال استایل‌های پویا
        this._applyDynamicStyles();
        
        // اتصال رویدادها
        this._attachEventListeners();
        
        // اعمال انیمیشن اولیه
        this._animateEntrance();
        
        // انتشار رویداد
        this._eventBus.emit('ui:card:rendered', {
            id: this._cardId,
            options: this._options,
            element: this._elements.card
        });

        return this;
    }

    update(options = {}) {
        if (!this._elements.card) {
            console.warn('[Card] Cannot update - card not rendered');
            return this;
        }

        const previousOptions = { ...this._options };
        this._options = this._normalizeOptions({ ...this._options, ...options });
        
        // به‌روزرسانی ظاهری
        this._updateAppearance();
        
        // انتشار رویداد تغییر
        this._eventBus.emit('ui:card:updated', {
            id: this._cardId,
            previous: previousOptions,
            current: this._options,
            changes: this._findChanges(previousOptions, this._options)
        });

        return this;
    }

    destroy() {
        if (!this._elements.container) return;
        
        // انتشار رویداد قبل از تخریب
        this._eventBus.emit('ui:card:destroying', {
            id: this._cardId,
            options: this._options
        });
        
        // انیمیشن خروج
        this._animateExit().then(() => {
            // حذف رویدادها
            this._detachEventListeners();
            
            // پاک‌سازی
            this._elements.container.innerHTML = '';
            this._elements.container.remove();
            
            this._elements = {
                container: null,
                card: null,
                header: null,
                body: null,
                footer: null,
                actions: null,
                overlay: null,
                badge: null
            };
            
            this._listeners.clear();
            
            if (this._animationFrame) {
                cancelAnimationFrame(this._animationFrame);
            }
            
            // انتشار رویداد تخریب
            this._eventBus.emit('ui:card:destroyed', {
                id: this._cardId
            });
        });
        
        return null;
    }

    expand() {
        if (!this._options.expandable) return this;
        return this._setExpanded(true);
    }

    collapse() {
        return this._setExpanded(false);
    }

    select() {
        if (!this._options.selectable) return this;
        return this._setSelected(true);
    }

    deselect() {
        return this._setSelected(false);
    }

    highlight(duration = 1000) {
        if (!this._elements.card) return this;
        
        this._elements.card.classList.add('v-card-highlight');
        
        setTimeout(() => {
            this._elements.card.classList.remove('v-card-highlight');
        }, duration);
        
        this._eventBus.emit('ui:card:highlighted', {
            id: this._cardId,
            duration
        });
        
        return this;
    }

    shake() {
        if (!this._elements.card) return this;
        
        this._elements.card.classList.add('v-card-shake');
        
        setTimeout(() => {
            this._elements.card.classList.remove('v-card-shake');
        }, 500);
        
        return this;
    }

    setLoading(isLoading) {
        this._state.loading = isLoading;
        
        if (this._elements.card) {
            if (isLoading) {
                this._elements.card.classList.add('v-card-loading');
                this._elements.card.setAttribute('aria-busy', 'true');
                this._showOverlay(true);
            } else {
                this._elements.card.classList.remove('v-card-loading');
                this._elements.card.setAttribute('aria-busy', 'false');
                this._showOverlay(false);
            }
        }
        
        this._eventBus.emit('ui:card:loading', {
            id: this._cardId,
            loading: isLoading
        });
        
        return this;
    }

    setInteractive(isInteractive) {
        this._state.interactive = isInteractive;
        
        if (this._elements.card) {
            if (isInteractive) {
                this._elements.card.classList.remove('v-card-static');
                this._elements.card.setAttribute('tabindex', '0');
                this._elements.card.setAttribute('role', 'button');
            } else {
                this._elements.card.classList.add('v-card-static');
                this._elements.card.setAttribute('tabindex', '-1');
                this._elements.card.setAttribute('role', 'article');
            }
        }
        
        return this;
    }

    // ==================== متدهای کمکی ====================
    _normalizeOptions(options) {
        const defaults = {
            type: 'lesson',
            size: 'md',
            layout: 'vertical',
            elevation: 1,
            title: '',
            subtitle: '',
            content: '',
            footer: '',
            image: null,
            imageAlt: '',
            icon: null,
            badge: null,
            badgeColor: '#ff4757',
            progress: null,
            stats: [],
            actions: [],
            tags: [],
            expandable: false,
            selectable: false,
            selected: false,
            interactive: true,
            collapsible: false,
            draggable: false,
            customClass: '',
            styles: {},
            onClick: null,
            onHover: null,
            onSelect: null,
            onExpand: null,
            dataAttributes: {},
            ariaLabel: null
        };
        
        const normalized = { ...defaults, ...options };
        
        // اعتبارسنجی
        if (!this._config.types[normalized.type]) {
            normalized.type = 'lesson';
        }
        
        if (!this._config.sizes[normalized.size]) {
            normalized.size = 'md';
        }
        
        if (!this._config.layouts[normalized.layout]) {
            normalized.layout = 'vertical';
        }
        
        if (!this._config.elevations[normalized.elevation]) {
            normalized.elevation = 1;
        }
        
        return Object.freeze(normalized);
    }

    _createTemplate() {
        const { 
            type, size, layout, elevation,
            title, subtitle, content, footer,
            image, imageAlt, icon, badge, badgeColor,
            progress, stats, actions, tags,
            expandable, selectable, collapsible,
            customClass, dataAttributes, ariaLabel
        } = this._options;
        
        const typeConfig = this._config.types[type];
        const sizeConfig = this._config.sizes[size];
        const layoutClass = this._config.layouts[layout];
        const elevationClass = this._config.elevations[elevation];
        
        const classes = [
            'vakamova-card',
            typeConfig.base,
            sizeConfig.class,
            layoutClass,
            elevationClass,
            this._state.expanded ? 'v-card-expanded' : '',
            this._state.selected ? 'v-card-selected' : '',
            this._state.loading ? 'v-card-loading' : '',
            !this._state.interactive ? 'v-card-static' : '',
            expandable ? 'v-card-expandable' : '',
            selectable ? 'v-card-selectable' : '',
            collapsible ? 'v-card-collapsible' : '',
            customClass
        ].filter(Boolean).join(' ');
        
        // تصویر
        const imageHtml = image ? `
            <div class="v-card-image" style="background-color: ${typeConfig.accent}20">
                <img src="${image}" alt="${imageAlt}" loading="lazy" />
                ${progress !== null ? `
                    <div class="v-card-progress">
                        <div class="v-card-progress-bar" style="width: ${progress}%"></div>
                    </div>
                ` : ''}
            </div>
        ` : '';
        
        // آیکون
        const iconHtml = icon || typeConfig.icon ? `
            <div class="v-card-icon" style="color: ${typeConfig.accent}">
                ${icon || typeConfig.icon}
            </div>
        ` : '';
        
        // هدر
        const headerHtml = (title || subtitle) ? `
            <div class="v-card-header">
                ${iconHtml}
                <div class="v-card-header-content">
                    ${title ? `<h3 class="v-card-title">${title}</h3>` : ''}
                    ${subtitle ? `<p class="v-card-subtitle">${subtitle}</p>` : ''}
                </div>
            </div>
        ` : '';
        
        // تگ‌ها
        const tagsHtml = tags.length > 0 ? `
            <div class="v-card-tags">
                ${tags.map(tag => `<span class="v-card-tag">${tag}</span>`).join('')}
            </div>
        ` : '';
        
        // محتوا
        const bodyHtml = content ? `
            <div class="v-card-body">
                ${tagsHtml}
                <div class="v-card-content">${content}</div>
            </div>
        ` : '';
        
        // آمار
        const statsHtml = stats.length > 0 ? `
            <div class="v-card-stats">
                ${stats.map(stat => `
                    <div class="v-card-stat">
                        <span class="v-card-stat-value">${stat.value}</span>
                        <span class="v-card-stat-label">${stat.label}</span>
                    </div>
                `).join('')}
            </div>
        ` : '';
        
        // فوتر
        const footerHtml = footer || stats.length > 0 ? `
            <div class="v-card-footer">
                ${footer ? `<div class="v-card-footer-text">${footer}</div>` : ''}
                ${statsHtml}
            </div>
        ` : '';
        
        // اکشن‌ها
        const actionsHtml = actions.length > 0 ? `
            <div class="v-card-actions">
                ${actions.map((action, index) => `
                    <button class="v-card-action ${action.primary ? 'v-card-action-primary' : ''}" 
                            data-action-index="${index}"
                            ${action.disabled ? 'disabled' : ''}>
                        ${action.icon ? `<span class="v-card-action-icon">${action.icon}</span>` : ''}
                        ${action.text ? `<span class="v-card-action-text">${action.text}</span>` : ''}
                    </button>
                `).join('')}
            </div>
        ` : '';
        
        // بج
        const badgeHtml = badge ? `
            <div class="v-card-badge" style="background-color: ${badgeColor}">
                ${badge}
            </div>
        ` : '';
        
        // اوورلی برای loading
        const overlayHtml = `
            <div class="v-card-overlay" style="display: none;">
                <div class="v-card-spinner"></div>
            </div>
        `;
        
        // کنترل‌های توسعه
        const expandControl = expandable ? `
            <button class="v-card-expand-control" aria-label="${this._state.expanded ? 'بستن' : 'گسترش'}">
                ${this._state.expanded ? '▲' : '▼'}
            </button>
        ` : '';
        
        const selectControl = selectable ? `
            <div class="v-card-select-control"></div>
        ` : '';
        
        const dataAttrs = Object.entries(dataAttributes)
            .map(([key, value]) => `data-${key}="${value}"`)
            .join(' ');
        
        const ariaAttrs = [
            ariaLabel ? `aria-label="${ariaLabel}"` : '',
            `aria-expanded="${expandable ? this._state.expanded : 'false'}"`,
            `aria-selected="${selectable ? this._state.selected : 'false'}"`,
            `aria-busy="${this._state.loading}"`
        ].filter(Boolean).join(' ');
        
        return `
            <div id="${this._cardId}" 
                 class="${classes}"
                 ${dataAttrs}
                 ${ariaAttrs}
                 draggable="${this._options.draggable}">
                ${selectControl}
                ${badgeHtml}
                ${imageHtml}
                ${headerHtml}
                ${bodyHtml}
                ${footerHtml}
                ${actionsHtml}
                ${overlayHtml}
                ${expandControl}
            </div>
        `;
    }

    _applyDynamicStyles() {
        if (!this._elements.card) return;
        
        const { type, size, styles } = this._options;
        const typeConfig = this._config.types[type];
        const sizeConfig = this._config.sizes[size];
        
        // استایل‌های داینامیک از پیکربندی
        const dynamicStyles = {
            '--card-accent': typeConfig.accent,
            '--card-padding': sizeConfig.padding,
            '--card-radius': sizeConfig.radius,
            borderRadius: sizeConfig.radius,
            borderLeft: `4px solid ${typeConfig.accent}`,
            ...styles
        };
        
        // اعمال استایل‌های داینامیک
        Object.assign(this._elements.card.style, dynamicStyles);
        
        // استایل‌های واکنش‌گرا
        if (this._state.interactive) {
            this._setupHoverEffects();
        }
        
        // استایل برای RTL
        if (document.documentElement.dir === 'rtl') {
            this._elements.card.style.borderLeft = 'none';
            this._elements.card.style.borderRight = `4px solid ${typeConfig.accent}`;
            this._elements.card.style.direction = 'rtl';
            this._elements.card.style.textAlign = 'right';
        }
    }

    _setupHoverEffects() {
        if (!this._elements.card) return;
        
        let hoverAnimationId = null;
        
        const onMouseEnter = () => {
            if (this._state.loading) return;
            
            this._state.hover = true;
            
            hoverAnimationId = requestAnimationFrame(() => {
                this._elements.card.style.transform = 'translateY(-4px) scale(1.02)';
                this._elements.card.style.boxShadow = '0 12px 24px rgba(0, 0, 0, 0.15)';
                this._elements.card.style.zIndex = '10';
            });
            
            this._eventBus.emit('ui:card:hover', {
                id: this._cardId,
                hover: true
            });
        };
        
        const onMouseLeave = () => {
            this._state.hover = false;
            
            if (hoverAnimationId) {
                cancelAnimationFrame(hoverAnimationId);
            }
            
            requestAnimationFrame(() => {
                this._elements.card.style.transform = 'translateY(0) scale(1)';
                this._elements.card.style.boxShadow = '';
                this._elements.card.style.zIndex = '';
            });
        };
        
        this._listeners.set('mouseenter', onMouseEnter);
        this._listeners.set('mouseleave', onMouseLeave);
        
        this._elements.card.addEventListener('mouseenter', onMouseEnter);
        this._elements.card.addEventListener('mouseleave', onMouseLeave);
    }

    _updateAppearance() {
        if (!this._elements.card) return;
        
        // به‌روزرسانی کلاس‌ها
        const newClasses = [
            'vakamova-card',
            this._config.types[this._options.type].base,
            this._config.sizes[this._options.size].class,
            this._config.layouts[this._options.layout],
            this._config.elevations[this._options.elevation],
            this._state.expanded ? 'v-card-expanded' : '',
            this._state.selected ? 'v-card-selected' : '',
            this._state.loading ? 'v-card-loading' : '',
            !this._state.interactive ? 'v-card-static' : '',
            this._options.expandable ? 'v-card-expandable' : '',
            this._options.selectable ? 'v-card-selectable' : '',
            this._options.collapsible ? 'v-card-collapsible' : '',
            this._options.customClass
        ].filter(Boolean);
        
        this._elements.card.className = newClasses.join(' ');
        
        // به‌روزرسانی محتوا
        this._updateContent();
        
        // اعمال مجدد استایل‌های داینامیک
        this._applyDynamicStyles();
    }

    _updateContent() {
        const { title, subtitle, content, footer, badge, badgeColor, stats, actions, tags } = this._options;
        
        // به‌روزرسانی عنوان
        if (this._elements.header) {
            const titleEl = this._elements.header.querySelector('.v-card-title');
            const subtitleEl = this._elements.header.querySelector('.v-card-subtitle');
            
            if (titleEl && title) titleEl.textContent = title;
            if (subtitleEl && subtitle) subtitleEl.textContent = subtitle;
        }
        
        // به‌روزرسانی محتوا
        if (this._elements.body && content) {
            const contentEl = this._elements.body.querySelector('.v-card-content');
            if (contentEl) contentEl.innerHTML = content;
        }
        
        // به‌روزرسانی تگ‌ها
        if (this._elements.body && tags.length > 0) {
            const tagsEl = this._elements.body.querySelector('.v-card-tags');
            if (tagsEl) {
                tagsEl.innerHTML = tags.map(tag => `<span class="v-card-tag">${tag}</span>`).join('');
            }
        }
        
        // به‌روزرسانی فوتر
        if (this._elements.footer && footer) {
            const footerTextEl = this._elements.footer.querySelector('.v-card-footer-text');
            if (footerTextEl) footerTextEl.textContent = footer;
        }
        
        // به‌روزرسانی آمار
        if (this._elements.footer && stats.length > 0) {
            const statsEl = this._elements.footer.querySelector('.v-card-stats');
            if (statsEl) {
                statsEl.innerHTML = stats.map(stat => `
                    <div class="v-card-stat">
                        <span class="v-card-stat-value">${stat.value}</span>
                        <span class="v-card-stat-label">${stat.label}</span>
                    </div>
                `).join('');
            }
        }
        
        // به‌روزرسانی اکشن‌ها
        if (this._elements.actions) {
            this._elements.actions.innerHTML = actions.map((action, index) => `
                <button class="v-card-action ${action.primary ? 'v-card-action-primary' : ''}" 
                        data-action-index="${index}"
                        ${action.disabled ? 'disabled' : ''}>
                    ${action.icon ? `<span class="v-card-action-icon">${action.icon}</span>` : ''}
                    ${action.text ? `<span class="v-card-action-text">${action.text}</span>` : ''}
                </button>
            `).join('');
        }
        
        // به‌روزرسانی بج
        if (this._elements.badge && badge) {
            this._elements.badge.textContent = badge;
            this._elements.badge.style.backgroundColor = badgeColor;
            this._elements.badge.style.display = 'block';
        } else if (this._elements.badge) {
            this._elements.badge.style.display = 'none';
        }
    }

    _attachEventListeners() {
        if (!this._elements.card) return;
        
        const onClick = (event) => {
            if (this._state.loading || !this._state.interactive) return;
            
            // اگر کلیک روی اکشن بود
            const actionBtn = event.target.closest('.v-card-action');
            if (actionBtn && this._elements.actions?.contains(actionBtn)) {
                const index = parseInt(actionBtn.dataset.actionIndex);
                const action = this._options.actions[index];
                
                if (action && !action.disabled) {
                    this._eventBus.emit('ui:card:action', {
                        id: this._cardId,
                        actionIndex: index,
                        action,
                        event: { type: 'click', timestamp: Date.now() }
                    });
                    
                    if (typeof action.onClick === 'function') {
                        action.onClick(event, this);
                    }
                }
                return;
            }
            
            // اگر کلیک روی کنترل توسعه بود
            const expandBtn = event.target.closest('.v-card-expand-control');
            if (expandBtn && this._options.expandable) {
                this._setExpanded(!this._state.expanded);
                return;
            }
            
            // کلیک کلی روی کارت
            this._eventBus.emit('ui:card:clicked', {
                id: this._cardId,
                options: this._options,
                event: { type: 'click', timestamp: Date.now() }
            });
            
            // انتخاب اگر قابل انتخاب باشد
            if (this._options.selectable) {
                this._setSelected(!this._state.selected);
            }
            
            // کالبک کاربر
            if (typeof this._options.onClick === 'function') {
                this._options.onClick(event, this);
            }
        };
        
        const onKeyDown = (event) => {
            if (!this._state.interactive) return;
            
            if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                this._elements.card.click();
            }
            
            if (event.key === 'Escape' && this._state.expanded) {
                this.collapse();
            }
        };
        
        const onFocus = () => {
            this._state.focus = true;
            this._elements.card.classList.add('v-card-focused');
        };
        
        const onBlur = () => {
            this._state.focus = false;
            this._elements.card.classList.remove('v-card-focused');
        };
        
        // ذخیره هندلرها
        this._listeners.set('click', onClick);
        this._listeners.set('keydown', onKeyDown);
        this._listeners.set('focus', onFocus);
        this._listeners.set('blur', onBlur);
        
        // اتصال رویدادها
        this._elements.card.addEventListener('click', onClick);
        this._elements.card.addEventListener('keydown', onKeyDown);
        this._elements.card.addEventListener('focus', onFocus);
        this._elements.card.addEventListener('blur', onBlur);
        
        // کشیدن و رها کردن
        if (this._options.draggable) {
            this._setupDragAndDrop();
        }
    }

    _setupDragAndDrop() {
        let dragStartX, dragStartY;
        
        const onDragStart = (event) => {
            if (!this._state.interactive) return;
            
            dragStartX = event.clientX;
            dragStartY = event.clientY;
            
            this._elements.card.classList.add('v-card-dragging');
            
            this._eventBus.emit('ui:card:dragstart', {
                id: this._cardId,
                position: { x: dragStartX, y: dragStartY }
            });
        };
        
        const onDragEnd = (event) => {
            this._elements.card.classList.remove('v-card-dragging');
            
            this._eventBus.emit('ui:card:dragend', {
                id: this._cardId,
                position: { x: event.clientX, y: event.clientY }
            });
        };
        
        this._listeners.set('dragstart', onDragStart);
        this._listeners.set('dragend', onDragEnd);
        
        this._elements.card.addEventListener('dragstart', onDragStart);
        this._elements.card.addEventListener('dragend', onDragEnd);
    }

    _detachEventListeners() {
        if (!this._elements.card) return;
        
        for (const [event, handler] of this._listeners) {
            this._elements.card.removeEventListener(event, handler);
        }
        
        this._listeners.clear();
    }

    _setExpanded(isExpanded) {
        if (!this._options.expandable) return this;
        
        this._state.expanded = isExpanded;
        
        if (this._elements.card) {
            if (isExpanded) {
                this._elements.card.classList.add('v-card-expanded');
                this._elements.card.setAttribute('aria-expanded', 'true');
                
                // انیمیشن توسعه
                this._animateExpand();
            } else {
                this._elements.card.classList.remove('v-card-expanded');
                this._elements.card.setAttribute('aria-expanded', 'false');
                
                // انیمیشن جمع‌شدن
                this._animateCollapse();
            }
        }
        
        this._eventBus.emit('ui:card:expanded', {
            id: this._cardId,
            expanded: isExpanded
        });
        
        if (typeof this._options.onExpand === 'function') {
            this._options.onExpand(isExpanded, this);
        }
        
        return this;
    }

    _setSelected(isSelected) {
        if (!this._options.selectable) return this;
        
        this._state.selected = isSelected;
        
        if (this._elements.card) {
            if (isSelected) {
                this._elements.card.classList.add('v-card-selected');
                this._elements.card.setAttribute('aria-selected', 'true');
            } else {
                this._elements.card.classList.remove('v-card-selected');
                this._elements.card.setAttribute('aria-selected', 'false');
            }
        }
        
        this._eventBus.emit('ui:card:selected', {
            id: this._cardId,
            selected: isSelected
        });
        
        if (typeof this._options.onSelect === 'function') {
            this._options.onSelect(isSelected, this);
        }
        
        return this;
    }

    _showOverlay(show) {
        if (!this._elements.overlay) return;
        
        if (show) {
            this._elements.overlay.style.display = 'flex';
            this._animateLoading();
        } else {
            this._elements.overlay.style.display = 'none';
        }
    }

    _animateEntrance() {
        if (!this._elements.card) return;
        
        this._elements.card.style.opacity = '0';
        this._elements.card.style.transform = 'translateY(20px) scale(0.95)';
        
        requestAnimationFrame(() => {
            this._elements.card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
            this._elements.card.style.opacity = '1';
            this._elements.card.style.transform = 'translateY(0) scale(1)';
        });
    }

    _animateExit() {
        return new Promise(resolve => {
            if (!this._elements.card) {
                resolve();
                return;
            }
            
            this._elements.card.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            this._elements.card.style.opacity = '0';
            this._elements.card.style.transform = 'translateY(20px) scale(0.95)';
            
            setTimeout(resolve, 300);
        });
    }

    _animateExpand() {
        if (!this._elements.card) return;
        
        const originalHeight = this._elements.card.offsetHeight;
        this._elements.card.style.height = `${originalHeight}px`;
        
        requestAnimationFrame(() => {
            this._elements.card.style.height = 'auto';
            const newHeight = this._elements.card.offsetHeight;
            
            this._elements.card.style.height = `${originalHeight}px`;
            this._elements.card.style.overflow = 'hidden';
            
            requestAnimationFrame(() => {
                this._elements.card.style.transition = 'height 0.3s ease';
                this._elements.card.style.height = `${newHeight}px`;
                
                setTimeout(() => {
                    this._elements.card.style.height = 'auto';
                    this._elements.card.style.overflow = '';
                }, 300);
            });
        });
    }

    _animateCollapse() {
        if (!this._elements.card) return;
        
        const originalHeight = this._elements.card.offsetHeight;
        this._elements.card.style.height = `${originalHeight}px`;
        this._elements.card.style.overflow = 'hidden';
        
        requestAnimationFrame(() => {
            this._elements.card.style.transition = 'height 0.3s ease';
            this._elements.card.style.height = '0';
            
            setTimeout(() => {
                this._elements.card.style.overflow = '';
            }, 300);
        });
    }

    _animateLoading() {
        if (!this._elements.overlay || !this._state.loading) return;
        
        let rotation = 0;
        
        const animate = () => {
            if (!this._state.loading) return;
            
            rotation = (rotation + 2) % 360;
            const spinner = this._elements.overlay.querySelector('.v-card-spinner');
            if (spinner) {
                spinner.style.transform = `rotate(${rotation}deg)`;
            }
            
            this._animationFrame = requestAnimationFrame(animate);
        };
        
        animate();
    }

    _findChanges(prev, current) {
        const changes = {};
        for (const key in current) {
            if (JSON.stringify(prev[key]) !== JSON.stringify(current[key])) {
                changes[key] = { from: prev[key], to: current[key] };
            }
        }
        return changes;
    }

    // ==================== متدهای دسترسی ====================
    getState() {
        return { ...this._state, id: this._cardId, options: this._options };
    }

    getId() {
        return this._cardId;
    }

    getElement() {
        return this._elements.card;
    }

    isExpanded() {
        return this._state.expanded;
    }

    isSelected() {
        return this._state.selected;
    }

    isLoading() {
        return this._state.loading;
    }

    isInteractive() {
        return this._state.interactive;
    }

    getOptions() {
        return { ...this._options };
    }
}

// ==================== فکتوری برای ایجاد آسان ====================
class CardFactory {
    static create(config = {}) {
        return new VakamovaCard(config);
    }
    
    static createLessonCard(title, language, progress, options = {}) {
        return new VakamovaCard({
            type: 'lesson',
            title,
            subtitle: `زبان: ${language}`,
            progress,
            badge: 'درس',
            tags: [language, `${progress}% تکمیل`],
            stats: [
                { value: `${progress}%`, label: 'پیشرفت' },
                { value: '⭐', label: 'سطح' }
            ],
            actions: [
                { text: 'ادامه', icon: '▶️', primary: true },
                { text: 'مرور', icon: '🔄' }
            ],
            ...options
        });
    }
    
    static createStatsCard(title, value, trend, options = {}) {
        return new VakamovaCard({
            type: 'stats',
            title,
            content: `<div class="v-card-stats-value">${value}</div>`,
            subtitle: trend,
            icon: '📊',
            interactive: false,
            ...options
        });
    }
    
    static createAchievementCard(title, description, icon, options = {}) {
        return new VakamovaCard({
            type: 'achievement',
            title,
            content: description,
            icon: icon || '🏆',
            badge: 'دستاورد',
            badgeColor: '#FFD700',
            ...options
        });
    }
}

// ==================== اکسپورت ====================
export { VakamovaCard, CardFactory };
export default VakamovaCard;
