// ==================== HYPERLANG PRO - MASTER CONFIGURATION ====================
// Architecture: Modular Microservices | Version: 4.0.0 | Build: HL-20250130-RC1
// Last Updated: 2025-01-30T12:00:00Z | Schema: config-v4.json

'use strict';

// ==================== CONFIGURATION MASTER CLASS ====================
class HyperConfig {
    constructor() {
        // Singleton Pattern
        if (HyperConfig.instance) {
            return HyperConfig.instance;
        }
        
        this._config = this._loadDefaultConfig();
        this._validators = this._createValidators();
        this._observers = new Map();
        this._cache = new Map();
        this._env = this._detectEnvironment();
        
        this._initialize();
        HyperConfig.instance = this;
        
        console.log(`🎛️  HyperConfig v${this._config.meta.version} initialized in ${this._env} mode`);
    }
    
    // ==================== CORE CONFIGURATION ====================
    _loadDefaultConfig() {
        return {
            // ==================== META INFORMATION ====================
            meta: {
                appName: 'HyperLang Pro',
                appId: 'com.hyperlang.pro',
                version: '4.0.0',
                buildNumber: '20250130.01',
                releaseChannel: 'stable',
                buildDate: '2025-01-30',
                schemaVersion: 4,
                compatibility: {
                    minAppVersion: '3.0.0',
                    maxAppVersion: '5.0.0',
                    supportedBrowsers: ['Chrome 90+', 'Firefox 88+', 'Safari 14+', 'Edge 90+']
                }
            },
            
            // ==================== APPLICATION MODES ====================
            modes: {
                development: {
                    debug: true,
                    logging: 'verbose',
                    analytics: false,
                    cacheEnabled: false,
                    apiEndpoint: 'https://dev-api.hyperlang.pro/v1',
                    features: {
                        experimental: true,
                        bypassAuth: true,
                        mockData: true
                    }
                },
                staging: {
                    debug: true,
                    logging: 'info',
                    analytics: true,
                    cacheEnabled: true,
                    apiEndpoint: 'https://staging-api.hyperlang.pro/v1',
                    features: {
                        experimental: true,
                        bypassAuth: false,
                        mockData: false
                    }
                },
                production: {
                    debug: false,
                    logging: 'warn',
                    analytics: true,
                    cacheEnabled: true,
                    apiEndpoint: 'https://api.hyperlang.pro/v1',
                    features: {
                        experimental: false,
                        bypassAuth: false,
                        mockData: false
                    }
                },
                offline: {
                    debug: false,
                    logging: 'error',
                    analytics: false,
                    cacheEnabled: true,
                    apiEndpoint: null,
                    features: {
                        experimental: false,
                        bypassAuth: true,
                        mockData: false
                    }
                }
            },
            
            // ==================== LANGUAGE CONFIGURATION ====================
            languages: {
                // Supported language codes (ISO 639-1)
                supported: [
                    'en', 'fa', 'de', 'fr', 'es', 'it', 
                    'ru', 'ar', 'tr', 'pt', 'sv', 'nl'
                ],
                
                // Default language
                default: 'en',
                
                // Language metadata
                metadata: {
                    en: {
                        id: 'en',
                        code: 'en',
                        isoCode: 'en-US',
                        name: { native: 'English', fa: 'انگلیسی', en: 'English' },
                        family: 'Indo-European',
                        branch: 'Germanic',
                        writingSystem: {
                            script: 'Latin',
                            direction: 'ltr',
                            hasCase: true,
                            specialChars: []
                        },
                        phonology: {
                            vowels: 12,
                            consonants: 24,
                            difficulty: 2,
                            phonemeCount: 44
                        },
                        grammar: {
                            wordOrder: 'SVO',
                            morphology: 'analytic',
                            verbConjugations: 5,
                            nounCases: 2,
                            genders: 0,
                            articles: true
                        },
                        statistics: {
                            nativeSpeakers: 372900000,
                            totalSpeakers: 1132000000,
                            countries: ['US', 'UK', 'CA', 'AU', 'NZ', 'IE'],
                            internetPercentage: 60.4
                        },
                        learning: {
                            difficultyForPersianSpeakers: 1,
                            cefrHours: { A1: 60, A2: 120, B1: 300, B2: 500, C1: 800, C2: 1200 },
                            cognatesWithPersian: 12,
                            resourcesAvailable: 95
                        },
                        technical: {
                            locale: 'en_US',
                            charset: 'UTF-8',
                            fontFamily: "'Segoe UI', 'Roboto', 'Arial', sans-serif",
                            rtl: false,
                            textTransform: 'none'
                        },
                        ui: {
                            flag: '🇺🇸',
                            color: '#1E40AF',
                            gradient: ['#1E40AF', '#3B82F6'],
                            icon: 'language_english',
                            audioSample: '/assets/audio/samples/en_welcome.mp3'
                        },
                        content: {
                            totalLessons: 420,
                            totalWords: 8500,
                            totalPhrases: 3200,
                            levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
                        },
                        features: {
                            speechRecognition: true,
                            textToSpeech: true,
                            handwritingRecognition: true,
                            grammarChecker: true,
                            offlineAvailable: true
                        },
                        status: {
                            enabled: true,
                            beta: false,
                            completion: 1.0,
                            qualityScore: 98
                        }
                    },
                    
                    fa: {
                        id: 'fa',
                        code: 'fa',
                        isoCode: 'fa-IR',
                        name: { native: 'فارسی', fa: 'فارسی', en: 'Persian' },
                        family: 'Indo-European',
                        branch: 'Iranian',
                        writingSystem: {
                            script: 'Arabic',
                            direction: 'rtl',
                            hasCase: false,
                            specialChars: ['پ', 'چ', 'ژ', 'گ']
                        },
                        phonology: {
                            vowels: 6,
                            consonants: 23,
                            difficulty: 3,
                            phonemeCount: 29
                        },
                        grammar: {
                            wordOrder: 'SOV',
                            morphology: 'synthetic',
                            verbConjugations: 7,
                            nounCases: 0,
                            genders: 0,
                            articles: false
                        },
                        statistics: {
                            nativeSpeakers: 77000000,
                            totalSpeakers: 110000000,
                            countries: ['IR', 'AF', 'TJ', 'UZ'],
                            internetPercentage: 4.2
                        },
                        learning: {
                            difficultyForEnglishSpeakers: 4,
                            cefrHours: { A1: 80, A2: 160, B1: 400, B2: 700, C1: 1000, C2: 1400 },
                            cognatesWithEnglish: 8,
                            resourcesAvailable: 85
                        },
                        technical: {
                            locale: 'fa_IR',
                            charset: 'UTF-8',
                            fontFamily: "'Vazirmatn', 'Tahoma', 'Segoe UI', sans-serif",
                            rtl: true,
                            textTransform: 'none'
                        },
                        ui: {
                            flag: '🇮🇷',
                            color: '#DA291C',
                            gradient: ['#DA291C', '#239F40'],
                            icon: 'language_persian',
                            audioSample: '/assets/audio/samples/fa_welcome.mp3'
                        },
                        content: {
                            totalLessons: 380,
                            totalWords: 7500,
                            totalPhrases: 2800,
                            levels: ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']
                        },
                        features: {
                            speechRecognition: true,
                            textToSpeech: true,
                            handwritingRecognition: true,
                            grammarChecker: true,
                            offlineAvailable: true,
                            poetrySection: true
                        },
                        status: {
                            enabled: true,
                            beta: false,
                            completion: 1.0,
                            qualityScore: 96
                        }
                    }
                    // Additional languages follow same structure...
                },
                
                // Language learning paths
                learningPaths: {
                    beginner: {
                        duration: '3 months',
                        lessons: 30,
                        words: 1000,
                        grammarPoints: 50,
                        dailyGoal: 20
                    },
                    intermediate: {
                        duration: '6 months',
                        lessons: 60,
                        words: 3000,
                        grammarPoints: 120,
                        dailyGoal: 30
                    },
                    advanced: {
                        duration: '9 months',
                        lessons: 90,
                        words: 6000,
                        grammarPoints: 200,
                        dailyGoal: 45
                    }
                },
                
                // Language switching behavior
                switching: {
                    allowMidLesson: false,
                    saveProgress: true,
                    preserveSettings: true,
                    confirmBeforeSwitch: true
                }
            },
            
            // ==================== DATABASE CONFIGURATION ====================
            database: {
                // Primary database (IndexedDB)
                primary: {
                    name: 'HyperLangDB',
                    version: 4,
                    stores: [
                        {
                            name: 'users',
                            keyPath: 'id',
                            autoIncrement: true,
                            indexes: [
                                { name: 'email', keyPath: 'email', unique: true },
                                { name: 'username', keyPath: 'username', unique: true },
                                { name: 'createdAt', keyPath: 'createdAt', unique: false }
                            ]
                        },
                        {
                            name: 'lessons',
                            keyPath: 'id',
                            autoIncrement: false,
                            indexes: [
                                { name: 'language', keyPath: 'language', unique: false },
                                { name: 'level', keyPath: 'level', unique: false },
                                { name: 'category', keyPath: 'category', unique: false },
                                { name: 'order', keyPath: 'order', unique: false }
                            ]
                        },
                        {
                            name: 'progress',
                            keyPath: ['userId', 'lessonId'],
                            autoIncrement: false,
                            indexes: [
                                { name: 'userId', keyPath: 'userId', unique: false },
                                { name: 'lessonId', keyPath: 'lessonId', unique: false },
                                { name: 'completedAt', keyPath: 'completedAt', unique: false },
                                { name: 'score', keyPath: 'score', unique: false }
                            ]
                        },
                        {
                            name: 'settings',
                            keyPath: 'key',
                            autoIncrement: false,
                            indexes: []
                        },
                        {
                            name: 'cache',
                            keyPath: 'url',
                            autoIncrement: false,
                            indexes: [
                                { name: 'expiresAt', keyPath: 'expiresAt', unique: false }
                            ]
                        },
                        {
                            name: 'media',
                            keyPath: 'id',
                            autoIncrement: true,
                            indexes: [
                                { name: 'lessonId', keyPath: 'lessonId', unique: false },
                                { name: 'type', keyPath: 'type', unique: false }
                            ]
                        }
                    ],
                    encryption: {
                        enabled: true,
                        algorithm: 'AES-GCM',
                        keyDerivation: 'PBKDF2',
                        iterations: 100000
                    },
                    migrations: [
                        { version: 1, script: 'initial_schema' },
                        { version: 2, script: 'add_user_settings' },
                        { version: 3, script: 'add_media_store' },
                        { version: 4, script: 'add_cache_store' }
                    ]
                },
                
                // Backup database (localStorage fallback)
                backup: {
                    enabled: true,
                    interval: 24, // hours
                    maxBackups: 7,
                    compression: true
                },
                
                // Synchronization
                sync: {
                    enabled: true,
                    interval: 300, // seconds
                    conflictResolution: 'server_wins',
                    maxRetries: 3,
                    batchSize: 50
                }
            },
            
            // ==================== API CONFIGURATION ====================
            api: {
                // Base endpoints
                endpoints: {
                    base: {
                        production: 'https://api.hyperlang.pro/v1',
                        staging: 'https://staging-api.hyperlang.pro/v1',
                        development: 'https://dev-api.hyperlang.pro/v1'
                    },
                    
                    // Service endpoints
                    auth: {
                        login: '/auth/login',
                        register: '/auth/register',
                        logout: '/auth/logout',
                        refresh: '/auth/refresh',
                        verify: '/auth/verify',
                        resetPassword: '/auth/reset-password'
                    },
                    
                    lessons: {
                        list: '/lessons',
                        get: '/lessons/{id}',
                        progress: '/lessons/{id}/progress',
                        complete: '/lessons/{id}/complete',
                        search: '/lessons/search'
                    },
                    
                    users: {
                        profile: '/users/me',
                        update: '/users/me',
                        progress: '/users/me/progress',
                        achievements: '/users/me/achievements',
                        stats: '/users/me/stats'
                    },
                    
                    content: {
                        languages: '/content/languages',
                        categories: '/content/categories',
                        levels: '/content/levels',
                        grammar: '/content/grammar',
                        vocabulary: '/content/vocabulary'
                    },
                    
                    payment: {
                        plans: '/payment/plans',
                        subscribe: '/payment/subscribe',
                        status: '/payment/status',
                        history: '/payment/history'
                    },
                    
                    analytics: {
                        track: '/analytics/track',
                        events: '/analytics/events',
                        metrics: '/analytics/metrics'
                    }
                },
                
                // Request configuration
                requests: {
                    timeout: 30000,
                    retryAttempts: 3,
                    retryDelay: 1000,
                    cacheTTL: 3600,
                    offlineQueue: true,
                    queueSize: 100
                },
                
                // Authentication
                authentication: {
                    tokenType: 'Bearer',
                    tokenHeader: 'Authorization',
                    refreshThreshold: 300, // seconds before expiry
                    autoRefresh: true
                },
                
                // Headers
                headers: {
                    common: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-App-Version': '4.0.0',
                        'X-Platform': 'web'
                    },
                    auth: {
                        'X-Device-Id': null,
                        'X-Session-Id': null
                    }
                }
            },
            
            // ==================== UI/UX CONFIGURATION ====================
            ui: {
                // Themes
                themes: {
                    dark: {
                        id: 'dark',
                        name: 'تیره',
                        colors: {
                            primary: '#1E40AF',
                            secondary: '#3B82F6',
                            accent: '#8B5CF6',
                            background: '#0F172A',
                            surface: '#1E293B',
                            text: {
                                primary: '#F1F5F9',
                                secondary: '#94A3B8',
                                disabled: '#475569'
                            },
                            error: '#EF4444',
                            warning: '#F59E0B',
                            success: '#10B981',
                            info: '#3B82F6'
                        },
                        typography: {
                            fontFamily: "'Vazirmatn', 'Segoe UI', sans-serif",
                            fontSize: {
                                xs: '0.75rem',
                                sm: '0.875rem',
                                base: '1rem',
                                lg: '1.125rem',
                                xl: '1.25rem',
                                '2xl': '1.5rem',
                                '3xl': '1.875rem',
                                '4xl': '2.25rem'
                            },
                            lineHeight: {
                                tight: 1.25,
                                normal: 1.5,
                                relaxed: 1.75
                            }
                        },
                        spacing: {
                            unit: 4,
                            scale: [0, 1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 56, 64]
                        },
                        borderRadius: {
                            none: '0',
                            sm: '0.125rem',
                            base: '0.25rem',
                            md: '0.375rem',
                            lg: '0.5rem',
                            xl: '0.75rem',
                            '2xl': '1rem',
                            full: '9999px'
                        },
                        shadows: {
                            none: 'none',
                            sm: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
                            base: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
                            md: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
                            lg: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
                            xl: '0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04)'
                        }
                    },
                    
                    light: {
                        id: 'light',
                        name: 'روشن',
                        colors: {
                            primary: '#2563EB',
                            secondary: '#3B82F6',
                            accent: '#8B5CF6',
                            background: '#FFFFFF',
                            surface: '#F8FAFC',
                            text: {
                                primary: '#1E293B',
                                secondary: '#64748B',
                                disabled: '#94A3B8'
                            },
                            error: '#DC2626',
                            warning: '#D97706',
                            success: '#059669',
                            info: '#2563EB'
                        },
                        // ... same structure as dark theme
                    }
                },
                
                // Layout
                layout: {
                    breakpoints: {
                        xs: 0,
                        sm: 640,
                        md: 768,
                        lg: 1024,
                        xl: 1280,
                        '2xl': 1536
                    },
                    container: {
                        padding: {
                            mobile: 16,
                            tablet: 24,
                            desktop: 32
                        },
                        maxWidth: '1280px'
                    },
                    grid: {
                        columns: 12,
                        gutter: 24,
                        margin: 16
                    },
                    sidebar: {
                        width: 280,
                        collapsedWidth: 80,
                        transition: '300ms ease-in-out'
                    },
                    header: {
                        height: 64,
                        fixed: true,
                        zIndex: 1000
                    },
                    footer: {
                        height: 56,
                        fixed: false
                    }
                },
                
                // Components
                components: {
                    button: {
                        sizes: {
                            xs: { padding: '4px 8px', fontSize: '0.75rem' },
                            sm: { padding: '6px 12px', fontSize: '0.875rem' },
                            md: { padding: '8px 16px', fontSize: '1rem' },
                            lg: { padding: '12px 24px', fontSize: '1.125rem' },
                            xl: { padding: '16px 32px', fontSize: '1.25rem' }
                        },
                        variants: {
                            primary: { bg: 'primary', color: 'white' },
                            secondary: { bg: 'secondary', color: 'white' },
                            outline: { bg: 'transparent', border: '1px solid', color: 'primary' },
                            ghost: { bg: 'transparent', color: 'primary' },
                            danger: { bg: 'error', color: 'white' }
                        }
                    },
                    
                    card: {
                        padding: 24,
                        borderRadius: 'lg',
                        elevation: 'base'
                    },
                    
                    input: {
                        padding: '8px 12px',
                        borderRadius: 'md',
                        border: '1px solid',
                        focus: {
                            borderColor: 'primary',
                            ring: '0 0 0 3px rgba(59, 130, 246, 0.5)'
                        }
                    }
                },
                
                // Animations
                animations: {
                    duration: {
                        fastest: 100,
                        fast: 200,
                        normal: 300,
                        slow: 500,
                        slowest: 700
                    },
                    easing: {
                        linear: 'linear',
                        ease: 'ease',
                        easeIn: 'ease-in',
                        easeOut: 'ease-out',
                        easeInOut: 'ease-in-out',
                        spring: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)'
                    },
                    transitions: {
                        fade: 'opacity {duration} {easing}',
                        slide: 'transform {duration} {easing}',
                        scale: 'transform {duration} {easing}'
                    }
                },
                
                // Accessibility
                accessibility: {
                    skipToContent: true,
                    focusVisible: true,
                    reducedMotion: false,
                    highContrast: false
                }
            },
            
            // ==================== FEATURE FLAGS ====================
            features: {
                // Core features
                core: {
                    offlineMode: true,
                    multiLanguage: true,
                    progressTracking: true,
                    adaptiveLearning: true,
                    spacedRepetition: false, // v4.1
                    aiTutor: false // v4.2
                },
                
                // Learning features
                learning: {
                    speechRecognition: true,
                    textToSpeech: true,
                    pronunciationAnalysis: true,
                    handwritingRecognition: true,
                    grammarChecker: true,
                    vocabularyBuilder: true,
                    conversationPractice: true,
                    listeningComprehension: true
                },
                
                // Social features
                social: {
                    userProfiles: true,
                    achievements: true,
                    leaderboards: true,
                    socialSharing: true,
                    communityChallenges: true,
                    studyGroups: false // v4.1
                },
                
                // Content features
                content: {
                    videoLessons: false,
                    interactiveExercises: true,
                    culturalNotes: true,
                    grammarReferences: true,
                    pronunciationGuides: true,
                    downloadableContent: true,
                    userGeneratedContent: false // v4.2
                },
                
                // Technical features
                technical: {
                    pwa: true,
                    pushNotifications: true,
                    backgroundSync: true,
                    fileSystemAccess: false,
                    webAssembly: false,
                    webWorkers: true,
                    serviceWorker: true
                }
            },
            
            // ==================== PAYMENT & SUBSCRIPTION ====================
            payment: {
                // Providers
                providers: {
                    iran: {
                        zarinpal: {
                            enabled: true,
                            merchantId: null,
                            sandbox: true,
                            callbackUrl: '/payment/callback/zarinpal'
                        },
                        mellat: {
                            enabled: false,
                            terminalId: null,
                            username: null,
                            password: null
                        },
                        saman: {
                            enabled: false,
                            merchantId: null
                        }
                    },
                    
                    international: {
                        stripe: {
                            enabled: false,
                            publishableKey: null,
                            secretKey: null
                        },
                        paypal: {
                            enabled: false,
                            clientId: null,
                            clientSecret: null
                        },
                        googlePay: {
                            enabled: false,
                            merchantId: null
                        }
                    }
                },
                
                // Subscription plans
                plans: {
                    free: {
                        id: 'free',
                        name: 'رایگان',
                        price: 0,
                        currency: 'IRR',
                        features: [
                            '3 زبان اول',
                            'درس‌های مبتدی',
                            'تمرین‌های روزانه',
                            'ردیابی پیشرفت پایه'
                        ],
                        limitations: {
                            maxLanguages: 3,
                            maxLessonsPerDay: 5,
                            noOfflineAccess: true,
                            ads: true
                        }
                    },
                    
                    premium: {
                        id: 'premium',
                        name: 'پرمیوم',
                        prices: {
                            monthly: {
                                amount: 49000,
                                currency: 'IRR',
                                period: 'month'
                            },
                            yearly: {
                                amount: 490000,
                                currency: 'IRR',
                                period: 'year',
                                discount: 16
                            },
                            lifetime: {
                                amount: 1990000,
                                currency: 'IRR',
                                period: 'lifetime'
                            }
                        },
                        features: [
                            'تمام ۱۲ زبان',
                            'همه سطوح (مبتدی تا پیشرفته)',
                            'دسترسی آفلاین',
                            'بدون تبلیغات',
                            'تمرین‌های پیشرفته',
                            'پشتیبانی اولویت‌دار',
                            'آمار پیشرفت کامل'
                        ],
                        trial: {
                            enabled: true,
                            days: 7
                        }
                    }
                },
                
                // Payment configuration
                config: {
                    currency: 'IRR',
                    currencySymbol: 'تومان',
                    decimalSeparator: '.',
                    thousandSeparator: ',',
                    taxRate: 9,
                    invoiceEnabled: true,
                    receiptEnabled: true
                }
            },
            
            // ==================== ANALYTICS & MONITORING ====================
            analytics: {
                // Providers
                providers: {
                    googleAnalytics: {
                        enabled: false,
                        measurementId: null
                    },
                    mixpanel: {
                        enabled: false,
                        token: null
                    },
                    sentry: {
                        enabled: true,
                        dsn: null,
                        environment: 'production'
                    },
                    custom: {
                        enabled: true,
                        endpoint: '/api/analytics'
                    }
                },
                
                // Events to track
                events: {
                    user: [
                        'user_register',
                        'user_login',
                        'user_logout',
                        'user_upgrade',
                        'user_cancel'
                    ],
                    learning: [
                        'lesson_start',
                        'lesson_complete',
                        'exercise_attempt',
                        'exercise_success',
                        'exercise_failure',
                        'review_start',
                        'review_complete'
                    ],
                    app: [
                        'app_launch',
                        'app_error',
                        'app_crash',
                        'performance_metric',
                        'feature_usage'
                    ],
                    payment: [
                        'payment_initiated',
                        'payment_success',
                        'payment_failed',
                        'subscription_started',
                        'subscription_renewed',
                        'subscription_cancelled'
                    ]
                },
                
                // Metrics
                metrics: {
                    learning: {
                        dailyActiveUsers: true,
                        completionRate: true,
                        averageScore: true,
                        timeSpent: true,
                        retentionRate: true
                    },
                    business: {
                        conversionRate: true,
                        arpu: true,
                        churnRate: true,
                        ltv: true
                    },
                    technical: {
                        loadTime: true,
                        errorRate: true,
                        cacheHitRate: true,
                        memoryUsage: true
                    }
                },
                
                // Privacy
                privacy: {
                    anonymizeIp: true,
                    respectDnt: true,
                    dataRetention: 365, // days
                    autoPurge: true
                }
            },
            
            // ==================== SECURITY CONFIGURATION ====================
            security: {
                // Authentication
                authentication: {
                    jwt: {
                        secret: null, // Set from environment
                        expiresIn: '7d',
                        refreshExpiresIn: '30d',
                        algorithm: 'HS256'
                    },
                    oauth: {
                        google: {
                            clientId: null,
                            clientSecret: null,
                            callbackUrl: '/auth/google/callback'
                        },
                        github: {
                            clientId: null,
                            clientSecret: null,
                            callbackUrl: '/auth/github/callback'
                        }
                    }
                },
                
                // Encryption
                encryption: {
                    storage: {
                        enabled: true,
                        algorithm: 'AES-GCM',
                        keyDerivation: 'PBKDF2'
                    },
                    network: {
                        enabled: true,
                        requireTLS: true,
                        minTLSVersion: '1.2'
                    }
                },
                
                // Headers
                headers: {
                    csp: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline';",
                    hsts: 'max-age=31536000; includeSubDomains',
                    xFrameOptions: 'DENY',
                    xContentTypeOptions: 'nosniff',
                    referrerPolicy: 'strict-origin-when-cross-origin'
                },
                
                // Rate limiting
                rateLimiting: {
                    enabled: true,
                    windowMs: 15 * 60 * 1000, // 15 minutes
                    maxRequests: 100,
                    skipSuccessfulRequests: false
                },
                
                // Audit logging
                audit: {
                    enabled: true,
                    logLevel: 'info',
                    events: [
                        'auth_failure',
                        'privilege_escalation',
                        'data_export',
                        'config_change'
                    ]
                }
            },
            
            // ==================== PERFORMANCE CONFIGURATION ====================
            performance: {
                // Caching
                caching: {
                    enabled: true,
                    strategies: {
                        static: {
                            maxAge: 31536000, // 1 year
                            immutable: true
                        },
                        dynamic: {
                            maxAge: 3600, // 1 hour
                            staleWhileRevalidate: 86400 // 24 hours
                        },
                        api: {
                            maxAge: 300, // 5 minutes
                            staleIfError: 3600 // 1 hour
                        }
                    },
                    storage: {
                        type: 'indexedDB',
                        maxSize: 100 * 1024 * 1024, // 100MB
                        cleanupThreshold: 0.8 // 80%
                    }
                },
                
                // Lazy loading
                lazyLoading: {
                    enabled: true,
                    threshold: 0.1, // 10% of viewport
                    prefetch: true,
                    prefetchDistance: 2 // prefetch 2 pages ahead
                },
                
                // Compression
                compression: {
                    enabled: true,
                    algorithms: ['gzip', 'brotli'],
                    minSize: 1024 // 1KB
                },
                
                // Monitoring
                monitoring: {
                    enabled: true,
                    metrics: [
                        'fcp', // First Contentful Paint
                        'lcp', // Largest Contentful Paint
                        'fid', // First Input Delay
                        'cls', // Cumulative Layout Shift
                        'ttfb' // Time to First Byte
                    ],
                    samplingRate: 0.1 // 10% of users
                }
            },
            
            // ==================== ERROR HANDLING ====================
            errors: {
                // Error codes
                codes: {
                    // Database errors (DBxxx)
                    DB001: 'Database not initialized',
                    DB002: 'Database query failed',
                    DB003: 'Database version mismatch',
                    DB004: 'Database migration failed',
                    
                    // Authentication errors (AUTHxxx)
                    AUTH001: 'Invalid credentials',
                    AUTH002: 'Session expired',
                    AUTH003: 'Permission denied',
                    AUTH004: 'Account locked',
                    AUTH005: 'Email not verified',
                    
                    // Network errors (NETxxx)
                    NET001: 'Network unavailable',
                    NET002: 'Request timeout',
                    NET003: 'Server error',
                    NET004: 'Invalid response',
                    
                    // Validation errors (VALxxx)
                    VAL001: 'Invalid input',
                    VAL002: 'Required field missing',
                    VAL003: 'Invalid format',
                    VAL004: 'Value out of range',
                    
                    // Business errors (BIZxxx)
                    BIZ001: 'Payment required',
                    BIZ002: 'Subscription expired',
                    BIZ003: 'Feature not available',
                    BIZ004: 'Rate limit exceeded',
                    
                    // System errors (SYSxxx)
                    SYS001: 'Internal error',
                    SYS002: 'Configuration error',
                    SYS003: 'Resource unavailable',
                    SYS004: 'Maintenance mode'
                },
                
                // Error handling
                handling: {
                    showUserFriendly: true,
                    logToServer: true,
                    autoRetry: true,
                    maxRetries: 3,
                    fallbackEnabled: true
                },
                
                // Fallback strategies
                fallbacks: {
                    database: 'localStorage',
                    api: 'cachedData',
                    assets: 'placeholder',
                    translation: 'defaultLanguage'
                }
            }
        };
    }
    
    // ==================== INITIALIZATION ====================
    _initialize() {
        // Load environment-specific config
        this._loadEnvironmentConfig();
        
        // Apply feature flags based on environment
        this._applyFeatureFlags();
        
        // Setup configuration validation
        this._setupValidation();
        
        // Initialize observers
        this._setupObservers();
        
        // Load user preferences
        this._loadUserPreferences();
        
        // Validate configuration
        this._validateConfiguration();
    }
    
    _detectEnvironment() {
        const hostname = window.location.hostname;
        
        if (hostname.includes('localhost') || hostname.includes('127.0.0.1')) {
            return 'development';
        } else if (hostname.includes('staging') || hostname.includes('test')) {
            return 'staging';
        } else if (hostname.includes('dev')) {
            return 'development';
        } else {
            return 'production';
        }
    }
    
    _loadEnvironmentConfig() {
        const env = this._env;
        const modeConfig = this._config.modes[env];
        
        // Merge environment config with default config
        this._config = this._deepMerge(this._config, {
            modes: { [env]: modeConfig }
        });
        
        // Set current mode
        this._config.currentMode = env;
        
        console.log(`🌍 Environment detected: ${env}`);
    }
    
    _applyFeatureFlags() {
        const env = this._env;
        const features = this._config.modes[env].features;
        
        // Apply feature flags
        for (const [category, categoryFeatures] of Object.entries(this._config.features)) {
            for (const [feature, enabled] of Object.entries(categoryFeatures)) {
                if (features[feature] !== undefined) {
                    this._config.features[category][feature] = features[feature];
                }
            }
        }
    }
    
    _setupValidation() {
        // Add runtime validation methods
        this.validate = {
            language: (code) => {
                return this._config.languages.supported.includes(code);
            },
            
            level: (level) => {
                return ['beginner', 'intermediate', 'advanced'].includes(level);
            },
            
            theme: (theme) => {
                return Object.keys(this._config.ui.themes).includes(theme);
            },
            
            feature: (featurePath) => {
                const parts = featurePath.split('.');
                let current = this._config.features;
                
                for (const part of parts) {
                    if (current[part] === undefined) {
                        return false;
                    }
                    current = current[part];
                }
                
                return typeof current === 'boolean';
            }
        };
    }
    
    _setupObservers() {
        // Configuration change observers
        this._observers.set('language.change', []);
        this._observers.set('theme.change', []);
        this._observers.set('feature.toggle', []);
        this._observers.set('config.update', []);
    }
    
    _loadUserPreferences() {
        try {
            const prefs = localStorage.getItem('hyperlang_preferences');
            if (prefs) {
                const preferences = JSON.parse(prefs);
                
                // Apply user preferences
                if (preferences.language) {
                    this.setLanguage(preferences.language);
                }
                
                if (preferences.theme) {
                    this.setTheme(preferences.theme);
                }
                
                console.log('👤 User preferences loaded');
            }
        } catch (error) {
            console.warn('Failed to load user preferences:', error);
        }
    }
    
    _validateConfiguration() {
        try {
            // Validate required sections
            if (!this._config.languages || !this._config.languages.supported) {
                throw new Error('Invalid languages configuration');
            }
            
            if (!this._config.database || !this._config.database.primary) {
                throw new Error('Invalid database configuration');
            }
            
            if (!this._config.ui || !this._config.ui.themes) {
                throw new Error('Invalid UI configuration');
            }
            
            // Validate language metadata
            for (const langCode of this._config.languages.supported) {
                if (!this._config.languages.metadata[langCode]) {
                    console.warn(`Missing metadata for language: ${langCode}`);
                }
            }
            
            console.log('✅ Configuration validation passed');
            
        } catch (error) {
            console.error('❌ Configuration validation failed:', error);
            throw error;
        }
    }
    
    // ==================== PUBLIC API ====================
    
    // Getters for configuration sections
    get meta() { return { ...this._config.meta }; }
    get languages() { return { ...this._config.languages }; }
    get database() { return { ...this._config.database }; }
    get api() { return { ...this._config.api }; }
    get ui() { return { ...this._config.ui }; }
    get features() { return { ...this._config.features }; }
    get payment() { return { ...this._config.payment }; }
    get analytics() { return { ...this._config.analytics }; }
    get security() { return { ...this._config.security }; }
    get performance() { return { ...this._config.performance }; }
    get errors() { return { ...this._config.errors }; }
    
    // Get current environment
    get environment() { return this._env; }
    
    // Get current mode configuration
    get currentMode() { 
        return { 
            ...this._config.modes[this._env],
            name: this._env 
        }; 
    }
    
    // ==================== CONFIGURATION METHODS ====================
    
    // Language management
    getLanguageInfo(code) {
        return this._config.languages.metadata[code] || null;
    }
    
    getSupportedLanguages() {
        return this._config.languages.supported.map(code => 
            this._config.languages.metadata[code]
        ).filter(Boolean);
    }
    
    setLanguage(code) {
        if (!this.validate.language(code)) {
            throw new Error(`Unsupported language: ${code}`);
        }
        
        const oldLang = this._config.languages.default;
        this._config.languages.default = code;
        
        // Notify observers
        this._notifyObservers('language.change', { 
            old: oldLang, 
            new: code,
            info: this.getLanguageInfo(code)
        });
        
        // Save to preferences
        this._savePreference('language', code);
        
        return true;
    }
    
    getCurrentLanguage() {
        return this._config.languages.default;
    }
    
    // Theme management
    getTheme(themeId) {
        return this._config.ui.themes[themeId] || this._config.ui.themes.dark;
    }
    
    setTheme(themeId) {
        if (!this.validate.theme(themeId)) {
            throw new Error(`Unsupported theme: ${themeId}`);
        }
        
        const oldTheme = this._config.ui.currentTheme;
        this._config.ui.currentTheme = themeId;
        
        // Notify observers
        this._notifyObservers('theme.change', { 
            old: oldTheme, 
            new: themeId,
            theme: this.getTheme(themeId)
        });
        
        // Save to preferences
        this._savePreference('theme', themeId);
        
        return true;
    }
    
    getCurrentTheme() {
        return this._config.ui.currentTheme || 'dark';
    }
    
    // Feature management
    isFeatureEnabled(featurePath) {
        if (!this.validate.feature(featurePath)) {
            return false;
        }
        
        const parts = featurePath.split('.');
        let current = this._config.features;
        
        for (const part of parts) {
            current = current[part];
        }
        
        return current === true;
    }
    
    enableFeature(featurePath) {
        if (!this._setFeature(featurePath, true)) {
            throw new Error(`Cannot enable feature: ${featurePath}`);
        }
        
        this._notifyObservers('feature.toggle', {
            feature: featurePath,
            enabled: true
        });
        
        return true;
    }
    
    disableFeature(featurePath) {
        if (!this._setFeature(featurePath, false)) {
            throw new Error(`Cannot disable feature: ${featurePath}`);
        }
        
        this._notifyObservers('feature.toggle', {
            feature: featurePath,
            enabled: false
        });
        
        return true;
    }
    
    _setFeature(featurePath, value) {
        const parts = featurePath.split('.');
        let current = this._config.features;
        
        for (let i = 0; i < parts.length - 1; i++) {
            if (current[parts[i]] === undefined) {
                return false;
            }
            current = current[parts[i]];
        }
        
        const lastPart = parts[parts.length - 1];
        if (current[lastPart] === undefined) {
            return false;
        }
        
        current[lastPart] = value;
        return true;
    }
    
    // API configuration
    getApiEndpoint(service, endpoint, params = {}) {
        const serviceConfig = this._config.api.endpoints[service];
        if (!serviceConfig) {
            throw new Error(`Unknown API service: ${service}`);
        }
        
        let url = serviceConfig[endpoint];
        if (!url) {
            throw new Error(`Unknown endpoint: ${service}.${endpoint}`);
        }
        
        // Replace path parameters
        for (const [key, value] of Object.entries(params)) {
            url = url.replace(`{${key}}`, encodeURIComponent(value));
        }
        
        // Add base URL
        const baseUrl = this._config.api.endpoints.base[this._env];
        return baseUrl + url;
    }
    
    getApiHeaders(additional = {}) {
        const headers = { ...this._config.api.headers.common };
        
        // Add auth headers if available
        const token = localStorage.getItem('auth_token');
        if (token) {
            headers[this._config.api.authentication.tokenHeader] = 
                `${this._config.api.authentication.tokenType} ${token}`;
        }
        
        // Add device/session IDs
        const deviceId = localStorage.getItem('device_id');
        if (deviceId) {
            headers['X-Device-Id'] = deviceId;
        }
        
        const sessionId = localStorage.getItem('session_id');
        if (sessionId) {
            headers['X-Session-Id'] = sessionId;
        }
        
        // Merge additional headers
        return { ...headers, ...additional };
    }
    
    // Database configuration
    getDatabaseConfig() {
        return {
            ...this._config.database.primary,
            name: `${this._config.database.primary.name}_${this._env}`
        };
    }
    
    // Payment configuration
    getPaymentConfig(provider = null) {
        if (provider) {
            const providerConfig = 
                this._config.payment.providers.iran[provider] || 
                this._config.payment.providers.international[provider];
            
            if (!providerConfig) {
                throw new Error(`Unknown payment provider: ${provider}`);
            }
            
            return { ...providerConfig };
        }
        
        return { ...this._config.payment };
    }
    
    getSubscriptionPlans() {
        return { ...this._config.payment.plans };
    }
    
    // UI Configuration
    getUIConfig() {
        const currentTheme = this.getCurrentTheme();
        return {
            ...this._config.ui,
            currentTheme: currentTheme,
            theme: this.getTheme(currentTheme)
        };
    }
    
    getBreakpoint() {
        const width = window.innerWidth;
        const breakpoints = this._config.ui.layout.breakpoints;
        
        if (width >= breakpoints['2xl']) return '2xl';
        if (width >= breakpoints.xl) return 'xl';
        if (width >= breakpoints.lg) return 'lg';
        if (width >= breakpoints.md) return 'md';
        if (width >= breakpoints.sm) return 'sm';
        return 'xs';
    }
    
    // Error handling
    getErrorInfo(code) {
        return this._config.errors.codes[code] || 'Unknown error';
    }
    
    // ==================== OBSERVER PATTERN ====================
    subscribe(event, callback) {
        if (!this._observers.has(event)) {
            this._observers.set(event, []);
        }
        
        this._observers.get(event).push(callback);
        
        // Return unsubscribe function
        return () => this.unsubscribe(event, callback);
    }
    
    unsubscribe(event, callback) {
        if (this._observers.has(event)) {
            const callbacks = this._observers.get(event);
            const index = callbacks.indexOf(callback);
            if (index > -1) {
                callbacks.splice(index, 1);
            }
        }
    }
    
    _notifyObservers(event, data) {
        if (this._observers.has(event)) {
            this._observers.get(event).forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Error in ${event} observer:`, error);
                }
            });
        }
    }
    
    // ==================== UTILITY METHODS ====================
    _deepMerge(target, source) {
        const output = { ...target };
        
        if (this._isObject(target) && this._isObject(source)) {
            Object.keys(source).forEach(key => {
                if (this._isObject(source[key])) {
                    if (!(key in target)) {
                        output[key] = source[key];
                    } else {
                        output[key] = this._deepMerge(target[key], source[key]);
                    }
                } else {
                    output[key] = source[key];
                }
            });
        }
        
        return output;
    }
    
    _isObject(item) {
        return item && typeof item === 'object' && !Array.isArray(item);
    }
    
    _savePreference(key, value) {
        try {
            let prefs = {};
            const stored = localStorage.getItem('hyperlang_preferences');
            if (stored) {
                prefs = JSON.parse(stored);
            }
            
            prefs[key] = value;
            localStorage.setItem('hyperlang_preferences', JSON.stringify(prefs));
        } catch (error) {
            console.warn('Failed to save preference:', error);
        }
    }
    
    _createValidators() {
        return {
            email: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
            username: (username) => /^[a-zA-Z0-9_-]{3,30}$/.test(username),
            password: (password) => password.length >= 8,
            languageCode: (code) => /^[a-z]{2}$/.test(code),
            themeId: (id) => /^[a-z]+$/.test(id),
            featurePath: (path) => /^[a-z]+\.[a-z]+(?:\.[a-z]+)*$/.test(path)
        };
    }
    
    // ==================== DEBUG METHODS ====================
    dump() {
        return JSON.parse(JSON.stringify(this._config));
    }
    
    stats() {
        const config = this._config;
        return {
            languages: config.languages.supported.length,
            features: this._countFeatures(config.features),
            apiEndpoints: this._countEndpoints(config.api.endpoints),
            themes: Object.keys(config.ui.themes).length,
            databaseStores: config.database.primary.stores.length,
            errorCodes: Object.keys(config.errors.codes).length
        };
    }
    
    _countFeatures(features) {
        let count = 0;
        
        const countRecursive = (obj) => {
            for (const value of Object.values(obj)) {
                if (typeof value === 'boolean') {
                    count++;
                } else if (typeof value === 'object') {
                    countRecursive(value);
                }
            }
        };
        
        countRecursive(features);
        return count;
    }
    
    _countEndpoints(endpoints) {
        let count = 0;
        
        const countRecursive = (obj) => {
            for (const value of Object.values(obj)) {
                if (typeof value === 'string') {
                    count++;
                } else if (typeof value === 'object') {
                    countRecursive(value);
                }
            }
        };
        
        countRecursive(endpoints);
        return count;
    }
}

// ==================== GLOBAL INSTANCE & EXPORTS ====================

// Create singleton instance
let configInstance = null;

function getConfig() {
    if (!configInstance) {
        configInstance = new HyperConfig();
    }
    return configInstance;
}

// Global exports for browser
if (typeof window !== 'undefined') {
    window.HyperConfig = HyperConfig;
    window.getConfig = getConfig;
    window.AppConfig = getConfig(); // Legacy support
}

// Module exports
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        HyperConfig,
        getConfig
    };
}

// Auto-initialize in browser
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    document.addEventListener('DOMContentLoaded', () => {
        const config = getConfig();
        console.log(`🎛️ ${config.meta.appName} Configuration Ready`);
        
        // Apply initial theme
        const theme = config.getCurrentTheme();
        document.documentElement.setAttribute('data-theme', theme);
        
        // Apply language direction
        const lang = config.getCurrentLanguage();
        const langInfo = config.getLanguageInfo(lang);
        if (langInfo && langInfo.writingSystem.direction === 'rtl') {
            document.documentElement.setAttribute('dir', 'rtl');
        }
    });
}

// ==================== CONFIGURATION CONSTANTS ====================
// Legacy constants for backward compatibility
const CONFIG = {
    APP_NAME: 'HyperLang Pro',
    VERSION: '4.0.0',
    DEFAULT_LANGUAGE: 'en',
    SUPPORTED_LANGUAGES: ['en', 'fa', 'de', 'fr', 'es', 'it', 'ru', 'ar', 'tr', 'pt', 'sv', 'nl'],
    IS_RTL: (lang) => ['fa', 'ar'].includes(lang),
    IS_PRODUCTION: () => getConfig().environment === 'production',
    IS_DEVELOPMENT: () => getConfig().environment === 'development'
};

// Export constants
if (typeof window !== 'undefined') {
    window.CONFIG = CONFIG;
}

console.log('⚙️  HyperLang Pro Configuration System v4.0.0 loaded');
