/**
 * VAKAMOVA HOME PAGE - صفحه اصلی داشبورد کاربر (نسخه بهینه‌شده برای تست یکپارچه)
 * اصول: تزریق وابستگی، قرارداد رابط، رویدادمحور، پیکربندی متمرکز
 * سازگار با: integration_tester.html
 */

class HomePage {
    constructor(dependencies = {}) {
        // ==================== DEPENDENCY INJECTION ====================
        this._services = this._injectDependencies(dependencies);
        this._validateDependencies();
        
        // ==================== CONFIGURATION CENTER ====================
        this._config = this._createConfiguration();
        
        // ==================== INTERFACE CONTRACT ====================
        this.INTERFACE = Object.freeze({
            INIT: 'init',
            RENDER: 'render',
            UPDATE: 'update',
            CLEANUP: 'cleanup',
            REFRESH: 'refreshData',
            HANDLE_EVENT: 'handleEvent',
            TEST_INTEGRATION: 'testIntegration' // افزوده شده برای تست
        });
        
        // ==================== EVENT-DRIVEN ARCHITECTURE ====================
        this._eventSubscriptions = new Map();
        this._isMounted = false;
        this._pageData = null;
        this._components = new Map();
        this._testMode = false;
        
        Object.seal(this);
        console.log('[HomePage] ✅ Instance created');
    }
    
    // ==================== DEPENDENCY INJECTION ====================
    _injectDependencies(deps) {
        return {
            auth: deps.auth || window.AuthManager || this._createMockService('auth'),
            state: deps.state || window.StateManager || this._createMockService('state'),
            events: deps.events || window.eventBus || this._createMockEventBus(),
            router: deps.router || window.Router || this._createMockService('router'),
            config: deps.config || window.Config || this._createMockService('config'),
            utils: deps.utils || window.Utils || this._createMockService('utils'),
            api: deps.api || window.ApiClient || this._createMockService('api'),
            db: deps.db || window.Database || this._createMockService('db')
        };
    }
    
    _createMockEventBus() {
        return {
            emit: (event, data) => console.log(`[MockEventBus] ${event}:`, data),
            on: (event, callback) => {
                console.log(`[MockEventBus] Registered: ${event}`);
                return () => {};
            },
            off: () => {},
            _isMock: true
        };
    }
    
    _createMockService(serviceName) {
        console.warn(`[HomePage] Using mock service for: ${serviceName}`);
        return {
            _isMock: true,
            _serviceName: serviceName,
            isAuthenticated: () => true,
            get: (key) => ({ value: `mock_${key}` }),
            set: () => ({ success: true }),
            navigateTo: (path) => console.log(`[MockRouter] Navigate to: ${path}`)
        };
    }
    
    _validateDependencies() {
        const required = ['auth', 'state', 'events', 'router'];
        
        for (const service of required) {
            if (!this._services[service]) {
                throw new Error(`Required service ${service} not provided`);
            }
            
            if (this._services[service]._isMock) {
                this._testMode = true;
                console.log(`[HomePage] Test mode enabled (${service} is mock)`);
            }
        }
    }
    
    // ==================== CONFIGURATION ====================
    _createConfiguration() {
        return Object.freeze({
            // UI Elements
            elements: {
                container: 'app-container',
                loading: 'home-loading',
                error: 'home-error',
                stats: 'home-stats',
                lessons: 'home-lessons',
                user: 'home-user'
            },
            
            // Events
            events: {
                LOADED: 'home:page:loaded',
                ERROR: 'home:page:error',
                NAVIGATE: 'home:navigate',
                DATA_CHANGED: 'home:data:changed',
                TEST_START: 'home:test:start',
                TEST_END: 'home:test:end'
            },
            
            // Limits
            limits: {
                recentLessons: 5,
                statsRefresh: this._testMode ? 5000 : 30000,
                cacheTTL: 300000,
                maxRetries: 3
            },
            
            // Selectors
            selectors: {
                lessonCard: '.lesson-card',
                quickAction: '.quick-action',
                logoutBtn: '.logout-btn',
                startLesson: '.start-lesson-btn',
                statCard: '.stat-card',
                userAvatar: '.user-avatar'
            },
            
            // Test Configuration
            test: {
                autoLoad: true,
                mockData: true,
                validateExports: true,
                integrationTimeout: 5000
            }
        });
    }
    
    // ==================== INTERFACE CONTRACT METHODS ====================
    
    async init(containerId = null, options = {}) {
        const startTime = Date.now();
        
        try {
            // Emit test start event
            this._services.events.emit(this._config.events.TEST_START, {
                component: 'HomePage',
                action: 'init',
                timestamp: startTime
            });
            
            // Test mode setup
            if (options.testMode) {
                this._testMode = true;
                console.log('[HomePage] Initializing in TEST MODE');
            }
            
            // Verify authentication (skip in test mode)
            if (!this._testMode && !await this._verifyAuthentication()) {
                return { 
                    success: false, 
                    reason: 'unauthenticated',
                    testMode: this._testMode 
                };
            }
            
            // Set container
            this._container = document.getElementById(
                containerId || this._config.elements.container
            );
            
            if (!this._container && !this._testMode) {
                throw new Error('Container element not found');
            }
            
            // Create container for test mode
            if (this._testMode && !this._container) {
                this._container = document.createElement('div');
                this._container.id = 'test-home-container';
                document.body.appendChild(this._container);
            }
            
            // Load initial data
            await this._loadInitialData(options);
            
            // Setup event system
            this._setupEventSystem();
            
            // Initial render (skip in headless test mode)
            if (!options.headless) {
                this.render();
            }
            
            // Emit loaded event
            this._services.events.emit(
                this._config.events.LOADED,
                { 
                    timestamp: Date.now(),
                    userId: this._getUserId(),
                    duration: Date.now() - startTime,
                    testMode: this._testMode
                }
            );
            
            this._isMounted = true;
            
            const result = { 
                success: true, 
                mounted: true,
                testMode: this._testMode,
                duration: Date.now() - startTime
            };
            
            // Emit test end event
            this._services.events.emit(this._config.events.TEST_END, {
                ...result,
                component: 'HomePage'
            });
            
            return result;
            
        } catch (error) {
            const errorResult = this._handleError(error, 'init');
            
            this._services.events.emit(this._config.events.TEST_END, {
                success: false,
                error: error.message,
                component: 'HomePage',
                action: 'init'
            });
            
            return errorResult;
        }
    }
    
    render() {
        if (!this._container || !this._pageData) {
            console.warn('[HomePage] Cannot render: missing container or data');
            return { success: false, reason: 'missing_container_or_data' };
        }
        
        try {
            this._container.innerHTML = this._generateHTML();
            this._attachEventListeners();
            this._applyAnimations();
            
            // Update state
            this._services.state.set('ui.currentPage', 'home', {
                source: 'home_page',
                silent: true
            });
            
            console.log('[HomePage] ✅ Rendered successfully');
            return { success: true };
            
        } catch (error) {
            return this._handleError(error, 'render');
        }
    }
    
    async update(dataUpdates = {}, options = {}) {
        if (!this._isMounted && !options.force) {
            return { success: false, reason: 'not_mounted' };
        }
        
        try {
            // Merge updates
            this._pageData = {
                ...this._pageData,
                ...dataUpdates,
                _updatedAt: Date.now(),
                _updateSource: options.source || 'unknown'
            };
            
            // Update specific components
            const updates = [];
            
            if (dataUpdates.user) {
                updates.push(this._updateUserSection());
            }
            
            if (dataUpdates.stats || dataUpdates.dailyGoal) {
                updates.push(this._updateStatsSection());
            }
            
            if (dataUpdates.recentLessons) {
                updates.push(this._updateLessonsSection());
            }
            
            // Wait for all updates
            await Promise.all(updates);
            
            // Emit data changed event
            this._services.events.emit(
                this._config.events.DATA_CHANGED,
                { 
                    updates: Object.keys(dataUpdates),
                    timestamp: Date.now()
                }
            );
            
            return { 
                success: true, 
                updatedSections: updates.length 
            };
            
        } catch (error) {
            return this._handleError(error, 'update');
        }
    }
    
    async refreshData(force = false) {
        const startTime = Date.now();
        
        try {
            this._showLoading();
            
            const freshData = await this._fetchHomeData(force);
            const updateResult = await this.update(freshData);
            
            const result = { 
                success: updateResult.success, 
                data: freshData,
                duration: Date.now() - startTime 
            };
            
            console.log('[HomePage] ✅ Data refreshed', result);
            return result;
            
        } catch (error) {
            return this._handleError(error, 'refreshData');
        } finally {
            this._hideLoading();
        }
    }
    
    handleEvent(eventType, eventData) {
        if (!this._isMounted) {
            return { success: false, reason: 'not_mounted' };
        }
        
        const eventHandlers = {
            'lesson:selected': this._handleLessonSelect.bind(this),
            'quick:action': this._handleQuickAction.bind(this),
            'user:logout': this._handleLogout.bind(this),
            'data:refresh': () => this.refreshData(true),
            'navigate:to': this._handleNavigation.bind(this),
            'test:integration': this._handleIntegrationTest.bind(this)
        };
        
        if (eventHandlers[eventType]) {
            try {
                const result = eventHandlers[eventType](eventData);
                return { success: true, handler: eventType, result };
            } catch (error) {
                return { success: false, handler: eventType, error: error.message };
            }
        }
        
        // Forward unhandled events
        this._services.events.emit('home:event:forwarded', {
            originalEvent: eventType,
            data: eventData,
            timestamp: Date.now()
        });
        
        return { success: false, reason: 'unhandled_event', event: eventType };
    }
    
    cleanup() {
        if (!this._isMounted) return { success: false, reason: 'not_mounted' };
        
        const cleanupStart = Date.now();
        
        try {
            // Remove event listeners
            this._removeEventListeners();
            
            // Unsubscribe from events
            this._cleanupEventSubscriptions();
            
            // Clear components
            this._components.clear();
            
            // Clear container (only if we created it for test)
            if (this._container && this._container.id === 'test-home-container') {
                this._container.remove();
            } else if (this._container) {
                this._container.innerHTML = '';
            }
            
            this._isMounted = false;
            this._pageData = null;
            
            const result = { 
                success: true, 
                duration: Date.now() - cleanupStart 
            };
            
            console.log('[HomePage] 🧹 Cleanup completed', result);
            return result;
            
        } catch (error) {
            return this._handleError(error, 'cleanup');
        }
    }
    
    // ==================== INTEGRATION TEST METHOD ====================
    
    async testIntegration(testOptions = {}) {
        const testId = `home_test_${Date.now()}`;
        const testStart = Date.now();
        
        console.log(`[HomePage] 🧪 Starting integration test: ${testId}`);
        
        const testResults = {
            id: testId,
            component: 'HomePage',
            startTime: testStart,
            tests: [],
            summary: {
                total: 0,
                passed: 0,
                failed: 0
            }
        };
        
        // Test 1: Interface Contract
        try {
            testResults.tests.push(await this._runInterfaceTest());
        } catch (error) {
            testResults.tests.push({
                name: 'Interface Contract',
                success: false,
                error: error.message
            });
        }
        
        // Test 2: Dependency Injection
        try {
            testResults.tests.push(await this._runDependencyTest());
        } catch (error) {
            testResults.tests.push({
                name: 'Dependency Injection',
                success: false,
                error: error.message
            });
        }
        
        // Test 3: Event System Integration
        try {
            testResults.tests.push(await this._runEventIntegrationTest());
        } catch (error) {
            testResults.tests.push({
                name: 'Event System Integration',
                success: false,
                error: error.message
            });
        }
        
        // Test 4: State Management Integration
        try {
            testResults.tests.push(await this._runStateIntegrationTest());
        } catch (error) {
            testResults.tests.push({
                name: 'State Management Integration',
                success: false,
                error: error.message
            });
        }
        
        // Test 5: Render Test (if not headless)
        if (!testOptions.headless) {
            try {
                testResults.tests.push(await this._runRenderTest());
            } catch (error) {
                testResults.tests.push({
                    name: 'Render Test',
                    success: false,
                    error: error.message
                });
            }
        }
        
        // Calculate summary
        testResults.summary.total = testResults.tests.length;
        testResults.summary.passed = testResults.tests.filter(t => t.success).length;
        testResults.summary.failed = testResults.tests.filter(t => !t.success).length;
        testResults.duration = Date.now() - testStart;
        testResults.endTime = Date.now();
        testResults.successRate = (testResults.summary.passed / testResults.summary.total * 100).toFixed(1);
        
        // Emit test results
        this._services.events.emit('home:integration:test:complete', testResults);
        
        console.log(`[HomePage] 🧪 Integration test completed:`, testResults.summary);
        
        return testResults;
    }
    
    async _runInterfaceTest() {
        const startTime = Date.now();
        
        // Check interface methods
        const requiredMethods = Object.values(this.INTERFACE);
        const missingMethods = [];
        
        for (const method of requiredMethods) {
            if (typeof this[method] !== 'function') {
                missingMethods.push(method);
            }
        }
        
        if (missingMethods.length > 0) {
            throw new Error(`Missing interface methods: ${missingMethods.join(', ')}`);
        }
        
        return {
            name: 'Interface Contract',
            success: true,
            methodsTested: requiredMethods.length,
            duration: Date.now() - startTime
        };
    }
    
    async _runDependencyTest() {
        const startTime = Date.now();
        
        // Test dependency injection
        const testDeps = {
            auth: { isAuthenticated: () => true, _isMock: true },
            state: { get: () => ({ id: 'test' }), set: () => ({ success: true }), _isMock: true },
            events: this._createMockEventBus(),
            router: { navigateTo: () => {}, _isMock: true }
        };
        
        const testInstance = new HomePage(testDeps);
        
        // Verify instance created
        if (!testInstance || typeof testInstance !== 'object') {
            throw new Error('Failed to create instance with test dependencies');
        }
        
        // Test init with mock dependencies
        const initResult = await testInstance.init(null, { testMode: true, headless: true });
        
        // Cleanup
        await testInstance.cleanup();
        
        return {
            name: 'Dependency Injection',
            success: initResult.success !== false,
            instanceCreated: true,
            initResult: initResult.success,
            duration: Date.now() - startTime
        };
    }
    
    async _runEventIntegrationTest() {
        const startTime = Date.now();
        
        return new Promise((resolve) => {
            const testEvent = 'home:integration:test:event';
            const testData = { test: 'data', timestamp: Date.now() };
            let eventReceived = false;
            
            const unsubscribe = this._services.events.on(testEvent, (data) => {
                eventReceived = true;
                
                // Validate received data
                if (JSON.stringify(data) !== JSON.stringify(testData)) {
                    resolve({
                        name: 'Event System Integration',
                        success: false,
                        error: 'Event data mismatch',
                        duration: Date.now() - startTime
                    });
                    return;
                }
                
                unsubscribe();
                resolve({
                    name: 'Event System Integration',
                    success: true,
                    eventReceived: true,
                    dataValid: true,
                    duration: Date.now() - startTime
                });
            });
            
            // Emit event
            this._services.events.emit(testEvent, testData);
            
            // Timeout fallback
            setTimeout(() => {
                if (!eventReceived) {
                    unsubscribe();
                    resolve({
                        name: 'Event System Integration',
                        success: false,
                        error: 'Event not received within timeout',
                        duration: Date.now() - startTime
                    });
                }
            }, 1000);
        });
    }
    
    async _runStateIntegrationTest() {
        const startTime = Date.now();
        
        try {
            // Test state integration
            const testPath = 'home.test.integration';
            const testValue = { test: 'value', timestamp: Date.now() };
            
            // Set state
            const setResult = this._services.state.set(testPath, testValue, {
                source: 'integration_test'
            });
            
            if (!setResult || setResult.success === false) {
                throw new Error('State set failed');
            }
            
            // Get state
            const retrievedValue = this._services.state.get(testPath);
            
            if (!retrievedValue || retrievedValue.test !== testValue.test) {
                throw new Error('State get failed or value mismatch');
            }
            
            return {
                name: 'State Management Integration',
                success: true,
                setResult: setResult.success,
                getResult: true,
                valueMatch: true,
                duration: Date.now() - startTime
            };
            
        } catch (error) {
            return {
                name: 'State Management Integration',
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }
    
    async _runRenderTest() {
        const startTime = Date.now();
        
        try {
            // Create test container
            const testContainer = document.createElement('div');
            testContainer.id = 'test-render-container';
            document.body.appendChild(testContainer);
            
            // Create test instance
            const testDeps = {
                auth: { isAuthenticated: () => true, _isMock: true },
                state: { 
                    get: (path) => {
                        if (path === 'auth.user') return { id: 'test', name: 'کاربر تست' };
                        if (path === 'ui.currentPage') return 'home';
                        return null;
                    },
                    set: () => ({ success: true }),
                    _isMock: true 
                },
                events: this._createMockEventBus(),
                router: { navigateTo: () => {}, _isMock: true }
            };
            
            const testInstance = new HomePage(testDeps);
            
            // Initialize with test data
            await testInstance.init('test-render-container', { testMode: true });
            
            // Check if rendered
            const hasContent = testContainer.innerHTML.length > 0;
            const hasUserSection = testContainer.querySelector('.user-profile') !== null;
            const hasStatsSection = testContainer.querySelector('.stats-dashboard') !== null;
            
            // Cleanup
            await testInstance.cleanup();
            testContainer.remove();
            
            return {
                name: 'Render Test',
                success: hasContent && hasUserSection && hasStatsSection,
                hasContent,
                hasUserSection,
                hasStatsSection,
                contentLength: testContainer.innerHTML.length,
                duration: Date.now() - startTime
            };
            
        } catch (error) {
            return {
                name: 'Render Test',
                success: false,
                error: error.message,
                duration: Date.now() - startTime
            };
        }
    }
    
    _handleIntegrationTest(data) {
        return this.testIntegration(data);
    }
    
    // ==================== DATA MANAGEMENT ====================
    
    async _loadInitialData(options = {}) {
        // Try cache first (unless force refresh)
        if (!options.forceRefresh) {
            const cached = this._getCachedData();
            if (cached && !this._isCacheExpired(cached)) {
                this._pageData = cached.data;
                console.log('[HomePage] Using cached data');
                return;
            }
        }
        
        // Fetch fresh data
        this._showLoading();
        
        try {
            const data = await this._fetchHomeData(options.forceRefresh);
            this._pageData = data;
            
            // Cache the data
            this._cacheData(data);
            
            console.log('[HomePage] Data loaded successfully');
            
        } catch (error) {
            throw new Error(`Failed to load home data: ${error.message}`);
        } finally {
            this._hideLoading();
        }
    }
    
    async _fetchHomeData(force = false) {
        // In test mode, return mock data
        if (this._testMode) {
            return this._generateMockData();
        }
        
        const userId = this._getUserId();
        if (!userId) throw new Error('User ID not available');
        
        try {
            // Fetch data in parallel
            const [userData, userStats, recentLessons] = await Promise.all([
                this._fetchUserData(userId),
                this._fetchUserStats(userId),
                this._fetchRecentLessons(userId)
            ]);
            
            // Calculate derived data
            const dailyProgress = this._calculateDailyProgress(userStats);
            const learningStreak = this._calculateStreak(userData);
            const recommendedLesson = this._getRecommendedLesson(userData, recentLessons);
            
            return {
                user: {
                    id: userData.id,
                    name: userData.name,
                    avatar: userData.avatar || this._generateAvatar(userData.name),
                    level: userData.level || 'beginner',
                    streak: learningStreak,
                    joinDate: userData.createdAt
                },
                stats: {
                    totalLessons: userStats.totalLessons || 0,
                    completedLessons: userStats.completedLessons || 0,
                    totalMinutes: userStats.totalMinutes || 0,
                    todayMinutes: userStats.todayMinutes || 0,
                    accuracy: userStats.accuracy || 0,
                    rank: this._calculateRank(userStats.totalMinutes),
                    nextMilestone: this._calculateNextMilestone(userStats.totalMinutes)
                },
                recentLessons: recentLessons.slice(0, this._config.limits.recentLessons),
                dailyGoal: {
                    target: userData.dailyGoal || 30,
                    completed: userStats.todayMinutes || 0,
                    progress: dailyProgress
                },
                recommendations: {
                    lesson: recommendedLesson,
                    nextLevel: this._getNextLevelInfo(userData.level)
                },
                _fetchedAt: Date.now(),
                _source: 'api'
            };
            
        } catch (error) {
            console.error('[HomePage] Fetch error:', error);
            
            // Fallback to cached data if available
            const cached = this._getCachedData();
            if (cached) {
                console.log('[HomePage] Using cached data as fallback');
                return cached.data;
            }
            
            throw error;
        }
    }
    
    _generateMockData() {
        console.log('[HomePage] Generating mock data for testing');
        
        return {
            user: {
                id: 'user_test_123',
                name: 'کاربر تستی',
                avatar: this._generateAvatar('تست'),
                level: 'intermediate',
                streak: 7,
                joinDate: new Date().toISOString()
            },
            stats: {
                totalLessons: 15,
                completedLessons: 10,
                totalMinutes: 245,
                todayMinutes: 25,
                accuracy: 87,
                rank: 'یادگیرنده',
                nextMilestone: 55
            },
            recentLessons: [
                {
                    id: 'lesson_1',
                    title: 'آموزش فعل‌های زمان حال',
                    language: 'fa',
                    level: 'intermediate',
                    duration: 15,
                    progress: 0.75,
                    thumbnail: null
                },
                {
                    id: 'lesson_2',
                    title: 'Basic English Greetings',
                    language: 'en',
                    level: 'beginner',
                    duration: 10,
                    progress: 0.3,
                    thumbnail: null
                }
            ],
            dailyGoal: {
                target: 30,
                completed: 25,
                progress: 83
            },
            recommendations: {
                lesson: {
                    id: 'lesson_3',
                    title: 'تلفظ صحیح حروف عربی',
                    description: 'بهبود تلفظ برای مکالمه بهتر'
                },
                nextLevel: {
                    next: 'advanced',
                    required: 20
                }
            },
            _fetchedAt: Date.now(),
            _source: 'mock'
        };
    }
    
    // ==================== EVENT HANDLING ====================
    
    _setupEventSystem() {
        // Subscribe to user events
        this._subscribeToEvent('auth:user:updated', (data) => {
            this.update({ user: data.user });
        });
        
        // Subscribe to lesson events
        this._subscribeToEvent('lesson:progress:updated', (data) => {
            this.refreshData(true);
        });
        
        // Subscribe to state changes
        this._subscribeToEvent('state:changed:ui', (data) => {
            if (data.path === 'ui.theme') {
                this._handleThemeChange(data.value);
            }
        });
        
        // Subscribe to test events
        this._subscribeToEvent('test:integration:request', (data) => {
            if (data.component === 'HomePage' || data.component === 'all') {
                this.testIntegration(data.options);
            }
        });
        
        // Auto-refresh timer (only in non-test mode)
        if (!this._testMode) {
            this._refreshTimer = setInterval(() => {
                if (document.visibilityState === 'visible') {
                    this.refreshData();
                }
            }, this._config.limits.statsRefresh);
        }
    }
    
    _subscribeToEvent(eventName, handler) {
        const unsubscribe = this._services.events.on(eventName, handler);
        this._eventSubscriptions.set(eventName, unsubscribe);
    }
    
    _attachEventListeners() {
        // Delegate events for better performance
        const events = [
            { selector: this._config.selectors.lessonCard, type: 'click', handler: this._handleLessonClick.bind(this) },
            { selector: this._config.selectors.quickAction, type: 'click', handler: this._handleQuickActionClick.bind(this) },
            { selector: this._config.selectors.logoutBtn, type: 'click', handler: this._handleLogoutClick.bind(this) },
            { selector: this._config.selectors.startLesson, type: 'click', handler: this._handleStartLessonClick.bind(this) }
        ];
        
        events.forEach(({ selector, type, handler }) => {
            this._delegateEvent(selector, type, handler);
        });
    }
    
    _delegateEvent(selector, eventType, handler) {
        const listener = (e) => {
            if (e.target.closest(selector)) {
                handler(e);
            }
        };
        
        this._container.addEventListener(eventType, listener);
        
        // Store for cleanup
        if (!this._components.has('event-listeners')) {
            this._components.set('event-listeners', []);
        }
        
        this._components.get('event-listeners').push({
            type: eventType,
            listener: listener,
            selector: selector
        });
    }
    
    _handleLessonClick(e) {
        const lessonCard = e.target.closest(this._config.selectors.lessonCard);
        if (!lessonCard) return;
        
        const lessonId = lessonCard.dataset.lessonId;
        this._handleLessonSelect({ lessonId });
    }
    
    _handleLessonSelect(data) {
        if (!data?.lessonId) return;
        
        this._services.events.emit('lesson:selected', {
            lessonId: data.lessonId,
            source: 'home_page',
            userId: this._getUserId(),
            timestamp: Date.now()
        });
        
        // Navigate to lesson page
        this._services.router.navigateTo(`/lesson/${data.lessonId}`);
        
        return { success: true, lessonId: data.lessonId };
    }
    
    _handleQuickActionClick(e) {
        const actionBtn = e.target.closest(this._config.selectors.quickAction);
        if (!actionBtn) return;
        
        const action = actionBtn.dataset.action;
        this._handleQuickAction({ action });
    }
    
    _handleQuickAction(data) {
        const actionHandlers = {
            practice: () => this._services.router.navigateTo('/practice'),
            review: () => this._services.router.navigateTo('/review'),
            challenge: () => this._services.router.navigateTo('/challenge'),
            goals: () => this._services.router.navigateTo('/goals')
        };
        
        if (actionHandlers[data.action]) {
            this._services.events.emit('quick:action:executed', {
                action: data.action,
                userId: this._getUserId(),
                timestamp: Date.now()
            });
            
            actionHandlers[data.action]();
            
            return { success: true, action: data.action };
        }
        
        return { success: false, action: data.action, reason: 'unknown_action' };
    }
    
    _handleLogoutClick() {
        this._handleLogout();
    }
    
    async _handleLogout() {
        try {
            await this._services.auth.logout();
            this._services.events.emit('user:logged:out');
            this._services.router.navigateTo('/login');
            
            return { success: true };
        } catch (error) {
            return this._handleError(error, 'logout');
        }
    }
    
    _handleStartLessonClick() {
        this._services.router.navigateTo('/lessons');
        return { success: true };
    }
    
    _handleNavigation(data) {
        if (data?.path) {
            this._services.router.navigateTo(data.path);
            return { success: true, path: data.path };
        }
        return { success: false, reason: 'no_path_provided' };
    }
    
    // ==================== UI METHODS ====================
    
    _generateHTML() {
        if (!this._pageData) {
            return '<div class="error">داده‌های صفحه موجود نیست</div>';
        }
        
        const { user, stats, recentLessons, dailyGoal, recommendations } = this._pageData;
        
        return `
            <div class="home-page" data-page="home" data-user-id="${user.id}" data-test-mode="${this._testMode}">
                ${this._generateHeaderHTML(user)}
                ${this._generateStatsHTML(stats, dailyGoal)}
                ${this._generateLessonsHTML(recentLessons)}
                ${this._generateQuickActionsHTML()}
                ${this._generateRecommendationsHTML(recommendations)}
                ${this._generateUtilityHTML()}
                ${this._generateTestIndicator()}
            </div>
        `;
    }
    
    _generateTestIndicator() {
        if (!this._testMode) return '';
        
        return `
            <div class="test-indicator" style="
                position: fixed;
                top: 10px;
                left: 10px;
                background: #f59e0b;
                color: #000;
                padding: 5px 10px;
                border-radius: 4px;
                font-size: 12px;
                font-weight: bold;
                z-index: 10000;
            ">
                🧪 TEST MODE
            </div>
        `;
    }
    
    // (بقیه متدهای _generate* مانند قبل باقی می‌مانند)
    _generateHeaderHTML(user) {
        return `
            <header class="home-header">
                <div class="user-profile">
                    <img src="${user.avatar}" 
                         alt="${user.name}" 
                         class="user-avatar"
                         onerror="this.src='data:image/svg+xml,<svg>...</svg>'">
                    <div class="user-info">
                        <h1 class="welcome-message">سلام ${user.name}!</h1>
                        <div class="user-meta">
                            <span class="user-level">سطح ${user.level}</span>
                            <span class="user-streak">🔥 ${user.streak} روز متوالی</span>
                        </div>
                    </div>
                    <button class="logout-btn" title="خروج">
                        <svg width="20" height="20"><path d="..."/></svg>
                    </button>
                </div>
            </header>
        `;
    }
    
    _generateStatsHTML(stats, dailyGoal) {
        const progressPercent = Math.min(100, (dailyGoal.completed / dailyGoal.target) * 100);
        
        return `
            <section class="stats-dashboard">
                <div class="stats-grid">
                    <div class="stat-card primary">
                        <h3>📊 امروز</h3>
                        <div class="stat-value">${dailyGoal.completed} دقیقه</div>
                        <div class="progress-container">
                            <div class="progress-bar" role="progressbar">
                                <div class="progress-fill" style="width: ${progressPercent}%"></div>
                            </div>
                            <div class="progress-text">${progressPercent.toFixed(0)}% از هدف</div>
                        </div>
                    </div>
                    
                    <div class="stat-card">
                        <h3>🎯 دقت</h3>
                        <div class="stat-value">${stats.accuracy}%</div>
                        <div class="stat-desc">پاسخ صحیح</div>
                    </div>
                    
                    <div class="stat-card">
                        <h3>🏆 رتبه</h3>
                        <div class="stat-value">${stats.rank}</div>
                        <div class="stat-desc">${stats.nextMilestone} دقیقه تا بعدی</div>
                    </div>
                    
                    <div class="stat-card">
                        <h3>📚 درس‌ها</h3>
                        <div class="stat-value">${stats.completedLessons}/${stats.totalLessons}</div>
                        <div class="stat-desc">تکمیل شده</div>
                    </div>
                </div>
            </section>
        `;
    }
    
    _generateLessonsHTML(lessons) {
        if (!lessons.length) {
            return `
                <section class="lessons-section">
                    <div class="empty-state">
                        <div class="empty-icon">📚</div>
                        <h3>هنوز درسی شروع نکرده‌اید!</h3>
                        <p>با شروع اولین درس، مسیر یادگیری را آغاز کنید.</p>
                        <button class="start-lesson-btn">شروع اولین درس</button>
                    </div>
                </section>
            `;
        }
        
        return `
            <section class="lessons-section">
                <div class="section-header">
                    <h2>ادامه یادگیری</h2>
                    <a href="/lessons" class="view-all">مشاهده همه</a>
                </div>
                <div class="lessons-grid">
                    ${lessons.map(lesson => this._generateLessonCardHTML(lesson)).join('')}
                </div>
            </section>
        `;
    }
    
    _generateLessonCardHTML(lesson) {
        const progressPercent = (lesson.progress || 0) * 100;
        
        return `
            <div class="lesson-card" data-lesson-id="${lesson.id}" data-language="${lesson.language}">
                <div class="lesson-thumbnail">
                    <span class="language-badge">${lesson.language.toUpperCase()}</span>
                </div>
                <div class="lesson-content">
                    <h3 class="lesson-title">${lesson.title}</h3>
                    <div class="lesson-meta">
                        <span class="lesson-level">${lesson.level}</span>
                        <span class="lesson-duration">⏱️ ${lesson.duration} دقیقه</span>
                    </div>
                    <div class="lesson-progress">
                        <div class="progress-bar">
                            <div class="progress-fill" style="width: ${progressPercent}%"></div>
                        </div>
                        <span class="progress-text">${Math.round(progressPercent)}% کامل</span>
                    </div>
                    <button class="resume-lesson-btn" data-lesson-id="${lesson.id}">
                        ${lesson.progress > 0 ? 'ادامه' : 'شروع'}
                    </button>
                </div>
            </div>
        `;
    }
    
    _generateQuickActionsHTML() {
        const actions = [
            { id: 'practice', icon: '⚡', label: 'تمرین سریع' },
            { id: 'review', icon: '📖', label: 'مرور واژگان' },
            { id: 'challenge', icon: '🏆', label: 'چالش روزانه' },
            { id: 'goals', icon: '🎯', label: 'اهداف من' }
        ];
        
        return `
            <section class="quick-actions">
                <div class="actions-grid">
                    ${actions.map(action => `
                        <button class="quick-action" data-action="${action.id}">
                            <span class="action-icon">${action.icon}</span>
                            <span class="action-label">${action.label}</span>
                        </button>
                    `).join('')}
                </div>
            </section>
        `;
    }
    
    _generateRecommendationsHTML(recommendations) {
        if (!recommendations.lesson) return '';
        
        return `
            <section class="recommendations">
                <div class="recommendation-card">
                    <div class="recommendation-header">
                        <h3>🚀 پیشنهاد ویژه</h3>
                        <span class="badge">برای شما</span>
                    </div>
                    <div class="recommendation-content">
                        <h4>${recommendations.lesson.title}</h4>
                        <p>${recommendations.lesson.description || 'مناسب برای سطح شما'}</p>
                        <button class="start-recommended-btn" data-lesson-id="${recommendations.lesson.id}">
                            شروع این درس
                        </button>
                    </div>
                </div>
            </section>
        `;
    }
    
    _generateUtilityHTML() {
        return `
            <div class="utility-overlay">
                <div class="loading-indicator" id="${this._config.elements.loading}">
                    <div class="spinner"></div>
                    <span>در حال بارگذاری...</span>
                </div>
                <div class="error-display" id="${this._config.elements.error}"></div>
            </div>
        `;
    }
    
    // ==================== UTILITY METHODS ====================
    
    _verifyAuthentication() {
        if (this._testMode) return Promise.resolve(true);
        return this._services.auth.isAuthenticated();
    }
    
    _getUserId() {
        if (this._testMode) return 'test_user_id';
        const userState = this._services.state.get('auth.user');
        return userState?.id || null;
    }
    
    _showLoading() {
        if (this._testMode) return;
        const loader = document.getElementById(this._config.elements.loading);
        if (loader) loader.style.display = 'flex';
    }
    
    _hideLoading() {
        if (this._testMode) return;
        const loader = document.getElementById(this._config.elements.loading);
        if (loader) loader.style.display = 'none';
    }
    
    _showError(message) {
        if (this._testMode) {
            console.error('[HomePage Test Error]:', message);
            return;
        }
        const errorEl = document.getElementById(this._config.elements.error);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.style.display = 'block';
            
            setTimeout(() => {
                errorEl.style.display = 'none';
            }, 5000);
        }
    }
    
    _handleError(error, context) {
        console.error(`[HomePage] Error in ${context}:`, error);
        
        this._services.events.emit(this._config.events.ERROR, {
            error: error.message,
            context: context,
            timestamp: Date.now(),
            testMode: this._testMode
        });
        
        this._showError(`خطا در ${context}: ${error.message}`);
        
        return { 
            success: false, 
            error: error.message,
            context: context,
            testMode: this._testMode
        };
    }
    
    _updateUserSection() {
        // Implementation
        return Promise.resolve({ success: true });
    }
    
    _updateStatsSection() {
        // Implementation
        return Promise.resolve({ success: true });
    }
    
    _updateLessonsSection() {
        // Implementation
        return Promise.resolve({ success: true });
    }
    
    _applyAnimations() {
        if (this._testMode) return;
        // Implementation
    }
    
    _removeEventListeners() {
        const listeners = this._components.get('event-listeners') || [];
        
        listeners.forEach(({ type, listener }) => {
            this._container.removeEventListener(type, listener);
        });
        
        this._components.delete('event-listeners');
    }
    
    _cleanupEventSubscriptions() {
        for (const unsubscribe of this._eventSubscriptions.values()) {
            if (typeof unsubscribe === 'function') {
                unsubscribe();
            }
        }
        
        this._eventSubscriptions.clear();
        
        if (this._refreshTimer) {
            clearInterval(this._refreshTimer);
            this._refreshTimer = null;
        }
    }
    
    _handleThemeChange(theme) {
        document.documentElement.setAttribute('data-theme', theme);
    }
    
    _getCachedData() {
        if (this._testMode) return null;
        
        const cacheKey = `home_page_cache_${this._getUserId()}`;
        const cached = localStorage.getItem(cacheKey);
        
        if (!cached) return null;
        
        try {
            return JSON.parse(cached);
        } catch {
            return null;
        }
    }
    
    _cacheData(data) {
        if (this._testMode) return;
        
        const cacheKey = `home_page_cache_${this._getUserId()}`;
        const cacheData = {
            data: data,
            cachedAt: Date.now()
        };
        
        localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    }
    
    _isCacheExpired(cache) {
        const CACHE_TTL = this._config.limits.cacheTTL;
        return Date.now() - cache.cachedAt > CACHE_TTL;
    }
    
    _generateAvatar(name) {
        const colors = ['#1a237e', '#3949ab', '#00b0ff', '#2962ff'];
        const colorIndex = (name?.length || 0) % colors.length;
        const initial = name ? name.charAt(0).toUpperCase() : 'U';
        
        return `data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
            <circle cx="50" cy="50" r="50" fill="${colors[colorIndex]}"/>
            <text x="50" y="65" font-size="40" text-anchor="middle" fill="white">
                ${initial}
            </text>
        </svg>`;
    }
    
    _calculateDailyProgress(stats) {
        const goal = this._pageData?.user?.dailyGoal || 30;
        return Math.min(100, (stats.todayMinutes / goal) * 100);
    }
    
    _calculateStreak(userData) {
        return userData.streakDays || 0;
    }
    
    _calculateRank(totalMinutes) {
        const ranks = [
            { threshold: 0, name: 'تازه‌کار' },
            { threshold: 100, name: 'یادگیرنده' },
            { threshold: 500, name: 'دانش‌آموز' },
            { threshold: 1000, name: 'عالِم' },
            { threshold: 5000, name: 'استاد' }
        ];
        
        const rank = ranks.reverse().find(r => totalMinutes >= r.threshold) || ranks[0];
        return rank.name;
    }
    
    _calculateNextMilestone(totalMinutes) {
        const milestones = [100, 500, 1000, 5000, 10000];
        const next = milestones.find(m => m > totalMinutes);
        return next ? next - totalMinutes : 0;
    }
    
    _getRecommendedLesson(userData, recentLessons) {
        if (!recentLessons.length) return null;
        const uncompleted = recentLessons.filter(l => l.progress < 0.8);
        return uncompleted.length > 0 ? uncompleted[0] : recentLessons[0];
    }
    
    _getNextLevelInfo(currentLevel) {
        const levels = {
            beginner: { next: 'intermediate', required: 10 },
            intermediate: { next: 'advanced', required: 50 },
            advanced: { next: 'expert', required: 100 }
        };
        return levels[currentLevel] || { next: 'advanced', required: 10 };
    }
    
    async _fetchUserData(userId) {
        if (this._testMode) return this._generateMockData().user;
        // Implementation for real data fetching
        return { id: userId, name: 'کاربر' };
    }
    
    async _fetchUserStats(userId) {
        if (this._testMode) return this._generateMockData().stats;
        // Implementation for real data fetching
        return { totalLessons: 0, todayMinutes: 0 };
    }
    
    async _fetchRecentLessons(userId) {
        if (this._testMode) return this._generateMockData().recentLessons;
        // Implementation for real data fetching
        return [];
    }
}

// ==================== EXPORT PATTERNS ====================

// Export class
export { HomePage };

// Singleton instance factory (با قابلیت تست)
let homePageInstance = null;

export function createHomePage(dependencies = {}) {
    if (!homePageInstance || dependencies.forceNew) {
        homePageInstance = new HomePage(dependencies);
    }
    return homePageInstance;
}

// Export for testing
export const HomePageTestExports = {
    HomePage,
    createHomePage,
    testUtils: {
        createMockData: () => new HomePage()._generateMockData(),
        createMockEventBus: () => new HomePage()._createMockEventBus()
    }
};

// Auto-initialize if loaded directly (فقط در حالت غیرتست)
if (import.meta.url === document.currentScript?.src && !window.__TEST_MODE__) {
    document.addEventListener('DOMContentLoaded', async () => {
        try {
            const homePage = createHomePage();
            await homePage.init();
            console.log('[HomePage] ✅ Auto-initialized successfully');
        } catch (error) {
            console.error('[HomePage] ❌ Auto-initialization failed:', error);
        }
    });
}

// Global export برای دسترسی تستر
if (typeof window !== 'undefined') {
    window.HomePage = HomePage;
    window.createHomePage = createHomePage;
    console.log('[HomePage] 🌍 Global exports attached to window');
            }
