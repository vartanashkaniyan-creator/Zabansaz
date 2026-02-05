/**
 * VAKAMOVA EXERCISE ENGINE - موتور هوشمند تمرین‌های آموزشی
 * اصول: ۱. تزریق وابستگی ۲. قرارداد رابط ۳. رویدادمحور ۴. پیکربندی متمرکز
 */

class ExerciseEngine {
    constructor(dependencies = {}, config = {}) {
        // اصل ۱: تزریق وابستگی
        this.deps = {
            eventBus: dependencies.eventBus || window.eventBus,
            stateManager: dependencies.stateManager || window.stateManager,
            audioService: dependencies.audioService || null,
            speechService: dependencies.speechService || null,
            utils: dependencies.utils || window.utils,
            analytics: dependencies.analytics || null,
            lessonManager: dependencies.lessonManager || null,
            ...dependencies
        };
        
        // اصل ۴: پیکربندی متمرکز
        this.config = Object.freeze({
            // تنظیمات انواع تمرین
            exerciseTypes: {
                multiple_choice: {
                    validator: 'validateMultipleChoice',
                    scorer: 'scoreMultipleChoice',
                    timeMultiplier: 1.0,
                    hintStrategy: 'progressive'
                },
                fill_blank: {
                    validator: 'validateFillBlank',
                    scorer: 'scoreFillBlank',
                    timeMultiplier: 1.2,
                    hintStrategy: 'letter_by_letter'
                },
                matching: {
                    validator: 'validateMatching',
                    scorer: 'scoreMatching',
                    timeMultiplier: 1.3,
                    hintStrategy: 'partial_reveal'
                },
                speaking: {
                    validator: 'validateSpeaking',
                    scorer: 'scoreSpeaking',
                    timeMultiplier: 1.5,
                    hintStrategy: 'audio_hint'
                },
                ordering: {
                    validator: 'validateOrdering',
                    scorer: 'scoreOrdering',
                    timeMultiplier: 1.4,
                    hintStrategy: 'first_last'
                },
                listening: {
                    validator: 'validateListening',
                    scorer: 'scoreListening',
                    timeMultiplier: 1.1,
                    hintStrategy: 'repeat_audio'
                },
                ...config.exerciseTypes
            },
            
            // تنظیمات اعتبارسنجی
            validation: {
                maxAttempts: 3,
                showSolutionAfterAttempts: 2,
                acceptSynonyms: true,
                acceptPartial: true,
                partialThreshold: 0.7,
                strictMode: false,
                timeoutSeconds: 60,
                ...config.validation
            },
            
            // تنظیمات نمره‌دهی
            scoring: {
                baseScore: 100,
                timeDecayRate: 0.1,
                attemptPenalty: 0.2,
                streakBonus: 10,
                perfectBonus: 25,
                adaptiveScoring: true,
                difficultyMultipliers: {
                    easy: 0.8,
                    medium: 1.0,
                    hard: 1.3,
                    expert: 1.5
                },
                ...config.scoring
            },
            
            // تنظیمات بازخورد
            feedback: {
                immediate: true,
                detailed: true,
                showCorrectAnswer: true,
                adaptiveFeedback: true,
                positiveMessages: [
                    'عالی!',
                    'آفرین!',
                    'درست جواب دادی!',
                    'همینطور ادامه بده!',
                    'خیلی خوب!'
                ],
                constructiveMessages: [
                    'نزدیک بود! دوباره تلاش کن.',
                    'اشکال نداره، بیا دوباره سعی کنیم.',
                    'مجددا امتحان کن.',
                    'یک بار دیگر فکر کن.',
                    'به نکات راهنما توجه کن.'
                ],
                ...config.feedback
            },
            
            // تنظیمات زمان
            timing: {
                countdown: true,
                warningThreshold: 10, // ثانیه
                overtimePenalty: 0.1,
                saveProgressInterval: 5000,
                ...config.timing
            },
            
            // تنظیمات راهنمایی
            hints: {
                maxHintsPerExercise: 3,
                hintDelay: 15000, // میلی‌ثانیه
                progressiveReveal: true,
                hintCost: 5, // امتیاز
                ...config.hints
            },
            
            // تنظیمات رویدادها
            events: {
                EXERCISE_LOADED: 'exercise:loaded',
                EXERCISE_STARTED: 'exercise:started',
                EXERCISE_PAUSED: 'exercise:paused',
                EXERCISE_RESUMED: 'exercise:resumed',
                ANSWER_SUBMITTED: 'answer:submitted',
                ANSWER_VALIDATED: 'answer:validated',
                ANSWER_SCORED: 'answer:scored',
                HINT_REQUESTED: 'hint:requested',
                HINT_PROVIDED: 'hint:provided',
                EXERCISE_COMPLETED: 'exercise:completed',
                EXERCISE_FAILED: 'exercise:failed',
                EXERCISE_TIMEOUT: 'exercise:timeout',
                PROGRESS_SAVED: 'exercise:progress:saved',
                ...config.events
            },
            
            // تنظیمات UI
            ui: {
                showProgressBar: true,
                showTimer: true,
                showScore: true,
                showStreak: true,
                animationSpeed: 300,
                transitionDuration: 200,
                ...config.ui
            },
            
            // تنظیمات تشخیص گفتار
            speechRecognition: {
                enabled: typeof webkitSpeechRecognition !== 'undefined',
                language: 'fa-IR',
                maxAlternatives: 3,
                confidenceThreshold: 0.7,
                timeout: 10000,
                ...config.speechRecognition
            },
            
            ...config
        });
        
        // حالت داخلی
        this.state = {
            currentExercise: null,
            session: {
                id: null,
                startTime: null,
                endTime: null,
                timeSpent: 0,
                isPaused: false,
                isTimedOut: false,
                attempts: 0,
                currentStreak: 0,
                totalScore: 0,
                hintsUsed: 0,
                answers: []
            },
            validationState: {
                isValidating: false,
                validationResults: null,
                scoringResults: null
            },
            timers: new Map(),
            eventSubscriptions: new Map(),
            recognition: null
        };
        
        // کش تمرین‌ها
        this.cache = {
            exercises: new Map(),
            userAnswers: new Map(),
            statistics: new Map()
        };
        
        // سیستم راهنمایی
        this.hintSystem = {
            availableHints: [],
            usedHints: [],
            hintTimers: new Map()
        };
        
        // Bind methods
        this.loadExercise = this.loadExercise.bind(this);
        this.startExercise = this.startExercise.bind(this);
        this.submitAnswer = this.submitAnswer.bind(this);
        this.requestHint = this.requestHint.bind(this);
        this.pauseExercise = this.pauseExercise.bind(this);
        this.resumeExercise = this.resumeExercise.bind(this);
        this.resetExercise = this.resetExercise.bind(this);
        this.completeExercise = this.completeExercise.bind(this);
        this.cleanup = this.cleanup.bind(this);
        
        // راه‌اندازی تشخیص گفتار اگر فعال باشد
        if (this.config.speechRecognition.enabled && this.deps.speechService === null) {
            this._setupSpeechRecognition();
        }
        
        console.log('[ExerciseEngine] ✅ Initialized with dependency injection');
    }
    
    // ==================== CORE EXERCISE METHODS ====================
    
    async loadExercise(exerciseId, options = {}) {
        try {
            if (!exerciseId) throw new Error('Exercise ID is required');
            
            // بررسی کش
            const cached = this.cache.exercises.get(exerciseId);
            if (cached && !options.forceReload) {
                this.state.currentExercise = cached;
                this._emitEvent(this.config.events.EXERCISE_LOADED, {
                    exerciseId,
                    type: cached.type,
                    fromCache: true,
                    timestamp: Date.now()
                });
                return { success: true, exercise: cached, cached: true };
            }
            
            // بارگذاری تمرین
            const exercise = await this._fetchExercise(exerciseId);
            
            // اعتبارسنجی ساختار
            this._validateExerciseStructure(exercise);
            
            // آماده‌سازی تمرین
            const preparedExercise = await this._prepareExercise(exercise, options);
            
            // ذخیره در کش
            this.cache.exercises.set(exerciseId, preparedExercise);
            this.state.currentExercise = preparedExercise;
            
            // بارگذاری آمار کاربر
            await this._loadUserStats(exerciseId);
            
            this._emitEvent(this.config.events.EXERCISE_LOADED, {
                exerciseId,
                type: exercise.type,
                difficulty: exercise.difficulty,
                timestamp: Date.now()
            });
            
            return { success: true, exercise: preparedExercise, cached: false };
            
        } catch (error) {
            console.error('[ExerciseEngine] Load exercise failed:', error);
            return { 
                success: false, 
                error: error.message,
                retryable: this._isRetryableError(error)
            };
        }
    }
    
    async startExercise(exerciseId, options = {}) {
        try {
            if (this.state.session.id) {
                await this.completeExercise(false);
            }
            
            // بارگذاری تمرین
            const loadResult = await this.loadExercise(exerciseId, options);
            if (!loadResult.success) throw new Error(loadResult.error);
            
            // ایجاد سشن جدید
            this.state.session = {
                id: `ex_session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                startTime: Date.now(),
                endTime: null,
                timeSpent: 0,
                isPaused: false,
                isTimedOut: false,
                attempts: 0,
                currentStreak: 0,
                totalScore: 0,
                hintsUsed: 0,
                answers: []
            };
            
            // راه‌اندازی تایمرها
            this._setupExerciseTimers();
            
            // تنظیم تشخیص گفتار برای تمرین‌های speaking
            if (this.state.currentExercise.type === 'speaking' && this.recognition) {
                this._setupSpeechRecognitionForExercise();
            }
            
            // ذخیره در state manager
            this.deps.stateManager.set('exercise.currentSession', {
                exerciseId,
                sessionId: this.state.session.id,
                startTime: this.state.session.startTime
            });
            
            this._emitEvent(this.config.events.EXERCISE_STARTED, {
                exerciseId,
                sessionId: this.state.session.id,
                exerciseType: this.state.currentExercise.type,
                timestamp: this.state.session.startTime
            });
            
            return { 
                success: true, 
                sessionId: this.state.session.id,
                exercise: this.state.currentExercise 
            };
            
        } catch (error) {
            console.error('[ExerciseEngine] Start exercise failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    async submitAnswer(answer, options = {}) {
        try {
            if (!this.state.currentExercise) {
                throw new Error('No active exercise');
            }
            
            if (this.state.validationState.isValidating) {
                throw new Error('Validation already in progress');
            }
            
            const exercise = this.state.currentExercise;
            const startTime = Date.now();
            
            this.state.validationState.isValidating = true;
            
            // اعتبارسنجی فرمت پاسخ
            const validatedAnswer = this._validateAnswerFormat(answer, exercise.type);
            
            // اعتبارسنجی محتوای پاسخ
            const validationResult = await this._validateAnswerContent(validatedAnswer, exercise, options);
            
            // محاسبه امتیاز
            const scoringResult = this._calculateScore(exercise, validationResult, {
                responseTime: Date.now() - startTime,
                attemptNumber: this.state.session.attempts + 1,
                currentStreak: this.state.session.currentStreak,
                hintsUsed: this.state.session.hintsUsed
            });
            
            // به‌روزرسانی سشن
            this.state.session.attempts++;
            
            // به‌روزرسانی streak
            if (validationResult.isCorrect) {
                this.state.session.currentStreak++;
            } else {
                this.state.session.currentStreak = 0;
            }
            
            // به‌روزرسانی امتیاز
            this.state.session.totalScore += scoringResult.score;
            
            // ثبت پاسخ
            const answerRecord = {
                answer: validatedAnswer,
                isCorrect: validationResult.isCorrect,
                score: scoringResult.score,
                timeSpent: Date.now() - startTime,
                timestamp: Date.now(),
                attempt: this.state.session.attempts,
                validationResult,
                scoringResult
            };
            
            this.state.session.answers.push(answerRecord);
            
            // ذخیره در کش
            this.cache.userAnswers.set(`${exercise.id}_${this.state.session.attempts}`, answerRecord);
            
            // انتشار رویدادها
            this._emitEvent(this.config.events.ANSWER_SUBMITTED, {
                exerciseId: exercise.id,
                answer: validatedAnswer,
                timestamp: Date.now()
            });
            
            this._emitEvent(this.config.events.ANSWER_VALIDATED, {
                exerciseId: exercise.id,
                ...validationResult,
                timestamp: Date.now()
            });
            
            this._emitEvent(this.config.events.ANSWER_SCORED, {
                exerciseId: exercise.id,
                ...scoringResult,
                timestamp: Date.now()
            });
            
            // ارائه بازخورد
            const feedback = this._generateFeedback(validationResult, scoringResult, options);
            
            this.state.validationState.isValidating = false;
            this.state.validationState.validationResults = validationResult;
            this.state.validationState.scoringResults = scoringResult;
            
            // بررسی تکمیل تمرین
            const shouldComplete = validationResult.isCorrect || 
                this.state.session.attempts >= this.config.validation.maxAttempts;
            
            if (shouldComplete) {
                await this.completeExercise(validationResult.isCorrect);
            }
            
            return {
                success: true,
                answerRecord,
                validationResult,
                scoringResult,
                feedback,
                shouldComplete,
                attemptsLeft: this.config.validation.maxAttempts - this.state.session.attempts
            };
            
        } catch (error) {
            this.state.validationState.isValidating = false;
            console.error('[ExerciseEngine] Submit answer failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    async requestHint(hintType = 'default', options = {}) {
        try {
            if (!this.state.currentExercise) {
                throw new Error('No active exercise');
            }
            
            if (this.state.session.hintsUsed >= this.config.hints.maxHintsPerExercise) {
                throw new Error('Maximum hints reached');
            }
            
            const exercise = this.state.currentExercise;
            
            // بررسی تاخیر بین راهنمایی‌ها
            const lastHintTime = this.hintSystem.hintTimers.get(exercise.id);
            if (lastHintTime && Date.now() - lastHintTime < this.config.hints.hintDelay) {
                const remaining = Math.ceil((this.config.hints.hintDelay - (Date.now() - lastHintTime)) / 1000);
                throw new Error(`Please wait ${remaining} seconds before requesting another hint`);
            }
            
            this._emitEvent(this.config.events.HINT_REQUESTED, {
                exerciseId: exercise.id,
                hintType,
                timestamp: Date.now()
            });
            
            // تولید راهنمایی
            const hint = this._generateHint(exercise, hintType, options);
            
            // به‌روزرسانی سشن
            this.state.session.hintsUsed++;
            
            // ثبت در سیستم راهنمایی
            this.hintSystem.usedHints.push({
                exerciseId: exercise.id,
                hint,
                timestamp: Date.now(),
                type: hintType
            });
            
            this.hintSystem.hintTimers.set(exercise.id, Date.now());
            
            // کسر امتیاز برای استفاده از راهنمایی
            const hintPenalty = this.config.hints.hintCost;
            this.state.session.totalScore = Math.max(0, this.state.session.totalScore - hintPenalty);
            
            this._emitEvent(this.config.events.HINT_PROVIDED, {
                exerciseId: exercise.id,
                hint,
                hintType,
                hintsUsed: this.state.session.hintsUsed,
                penaltyApplied: hintPenalty,
                timestamp: Date.now()
            });
            
            return {
                success: true,
                hint,
                hintsUsed: this.state.session.hintsUsed,
                hintsRemaining: this.config.hints.maxHintsPerExercise - this.state.session.hintsUsed,
                penalty: hintPenalty
            };
            
        } catch (error) {
            console.error('[ExerciseEngine] Request hint failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    async pauseExercise() {
        if (!this.state.session.id || this.state.session.isPaused) {
            return { success: false, error: 'Exercise not active or already paused' };
        }
        
        this.state.session.isPaused = true;
        this.state.session.pauseStartTime = Date.now();
        
        // متوقف کردن تایمرها
        this._pauseTimers();
        
        // متوقف کردن تشخیص گفتار
        if (this.recognition && this.recognition.isListening) {
            this.recognition.stop();
        }
        
        this._emitEvent(this.config.events.EXERCISE_PAUSED, {
            sessionId: this.state.session.id,
            timestamp: Date.now()
        });
        
        return { success: true, sessionId: this.state.session.id };
    }
    
    async resumeExercise() {
        if (!this.state.session.id || !this.state.session.isPaused) {
            return { success: false, error: 'Exercise not paused' };
        }
        
        this.state.session.isPaused = false;
        const pauseDuration = Date.now() - this.state.session.pauseStartTime;
        
        // تنظیم مجدد تایمرها
        this._resumeTimers(pauseDuration);
        
        // ادامه تشخیص گفتار
        if (this.state.currentExercise.type === 'speaking' && this.recognition) {
            this.recognition.start();
        }
        
        this._emitEvent(this.config.events.EXERCISE_RESUMED, {
            sessionId: this.state.session.id,
            pauseDuration,
            timestamp: Date.now()
        });
        
        return { success: true, sessionId: this.state.session.id };
    }
    
    async resetExercise(options = {}) {
        try {
            if (!this.state.currentExercise) {
                throw new Error('No active exercise');
            }
            
            const exerciseId = this.state.currentExercise.id;
            const sessionId = this.state.session.id;
            
            // پاک‌سازی سشن جاری
            this._cleanupSession();
            
            // راه‌اندازی مجدد
            return await this.startExercise(exerciseId, options);
            
        } catch (error) {
            console.error('[ExerciseEngine] Reset exercise failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    async completeExercise(success = true, options = {}) {
        try {
            if (!this.state.currentExercise || !this.state.session.id) {
                throw new Error('No active exercise session');
            }
            
            const session = this.state.session;
            const exercise = this.state.currentExercise;
            
            session.endTime = Date.now();
            session.timeSpent = session.endTime - session.startTime;
            
            // محاسبه نمره نهایی
            const finalScore = this._calculateFinalScore(success);
            
            // آماده‌سازی داده تکمیل
            const completionData = {
                exerciseId: exercise.id,
                sessionId: session.id,
                success,
                score: finalScore,
                timeSpent: session.timeSpent,
                attempts: session.attempts,
                hintsUsed: session.hintsUsed,
                streak: session.currentStreak,
                answers: session.answers,
                timestamp: session.endTime
            };
            
            // ذخیره نتایج
            await this._saveExerciseResults(completionData);
            
            // پاک‌سازی سشن جاری
            this._cleanupSession();
            
            // انتشار رویداد
            this._emitEvent(success ? 
                this.config.events.EXERCISE_COMPLETED : 
                this.config.events.EXERCISE_FAILED, 
                completionData
            );
            
            // اگر timeout بود
            if (session.isTimedOut) {
                this._emitEvent(this.config.events.EXERCISE_TIMEOUT, completionData);
            }
            
            return {
                success: true,
                ...completionData
            };
            
        } catch (error) {
            console.error('[ExerciseEngine] Complete exercise failed:', error);
            return { success: false, error: error.message };
        }
    }
    
    // ==================== PRIVATE CORE METHODS ====================
    
    async _fetchExercise(exerciseId) {
        // اولویت‌بندی منابع: کش ← دیتابیس ← API ← فال‌بک
        
        // از LessonManager اگر موجود باشد
        if (this.deps.lessonManager && typeof this.deps.lessonManager.getExercise === 'function') {
            try {
                const exercise = await this.deps.lessonManager.getExercise(exerciseId);
                if (exercise) return this._normalizeExerciseData(exercise);
            } catch (error) {
                console.warn('[ExerciseEngine] LessonManager fetch failed:', error);
            }
        }
        
        // از دیتابیس
        if (this.deps.database) {
            try {
                const exercise = await this.deps.database.getExerciseById(exerciseId);
                if (exercise) return this._normalizeExerciseData(exercise);
            } catch (error) {
                console.warn('[ExerciseEngine] Database fetch failed:', error);
            }
        }
        
        // از API
        if (this.deps.apiClient) {
            try {
                const response = await this.deps.apiClient.get(`/exercises/${exerciseId}`);
                if (response.data) return this._normalizeExerciseData(response.data);
            } catch (error) {
                console.warn('[ExerciseEngine] API fetch failed:', error);
            }
        }
        
        // فال‌بک
        return this._createFallbackExercise(exerciseId);
    }
    
    _normalizeExerciseData(rawData) {
        const base = {
            id: rawData.id,
            type: rawData.type || 'multiple_choice',
            difficulty: rawData.difficulty || 'medium',
            language: rawData.language || 'en',
            category: rawData.category,
            subcategory: rawData.subcategory,
            tags: rawData.tags || []
        };
        
        // نوع‌های مختلف تمرین
        switch (base.type) {
            case 'multiple_choice':
                return {
                    ...base,
                    question: rawData.question,
                    options: rawData.options || [],
                    correctAnswer: rawData.correctAnswer,
                    explanation: rawData.explanation,
                    shuffleOptions: rawData.shuffleOptions ?? true
                };
                
            case 'fill_blank':
                return {
                    ...base,
                    text: rawData.text,
                    blanks: rawData.blanks || [],
                    correctAnswers: rawData.correctAnswers || {},
                    acceptSynonyms: rawData.acceptSynonyms ?? this.config.validation.acceptSynonyms,
                    caseSensitive: rawData.caseSensitive ?? false
                };
                
            case 'matching':
                return {
                    ...base,
                    leftColumn: rawData.leftColumn || [],
                    rightColumn: rawData.rightColumn || [],
                    correctPairs: rawData.correctPairs || [],
                    shuffleColumns: rawData.shuffleColumns ?? true
                };
                
            case 'speaking':
                return {
                    ...base,
                    prompt: rawData.prompt,
                    targetPhrase: rawData.targetPhrase,
                    pronunciationGuide: rawData.pronunciationGuide,
                    sampleAudio: rawData.sampleAudio,
                    confidenceThreshold: rawData.confidenceThreshold || this.config.speechRecognition.confidenceThreshold
                };
                
            case 'ordering':
                return {
                    ...base,
                    items: rawData.items || [],
                    correctOrder: rawData.correctOrder || [],
                    shuffleItems: rawData.shuffleItems ?? true
                };
                
            case 'listening':
                return {
                    ...base,
                    audioUrl: rawData.audioUrl,
                    transcript: rawData.transcript,
                    questions: rawData.questions || []
                };
                
            default:
                return {
                    ...base,
                    data: rawData,
                    type: 'custom'
                };
        }
    }
    
    async _prepareExercise(exercise, options) {
        const prepared = { ...exercise };
        
        // شافل کردن گزینه‌ها اگر لازم باشد
        if (exercise.shuffleOptions && prepared.options) {
            prepared.options = this._shuffleArray([...prepared.options]);
        }
        
        if (exercise.shuffleColumns && prepared.leftColumn && prepared.rightColumn) {
            prepared.leftColumn = this._shuffleArray([...prepared.leftColumn]);
            prepared.rightColumn = this._shuffleArray([...prepared.rightColumn]);
        }
        
        if (exercise.shuffleItems && prepared.items) {
            prepared.items = this._shuffleArray([...prepared.items]);
        }
        
        // تولید راهنمایی‌ها
        prepared.hints = this._generateExerciseHints(prepared);
        
        // تنظیم تایم‌آوت
        prepared.timeout = this._calculateTimeout(prepared);
        
        // بارگذاری منابع
        if (prepared.type === 'listening' && prepared.audioUrl && this.deps.audioService) {
            try {
                prepared.audioBuffer = await this.deps.audioService.preloadAudio(prepared.audioUrl);
            } catch (error) {
                console.warn('[ExerciseEngine] Failed to preload audio:', error);
            }
        }
        
        // تنظیم تشخیص گفتار
        if (prepared.type === 'speaking' && this.recognition) {
            prepared.speechConfig = {
                language: prepared.language || this.config.speechRecognition.language,
                maxAlternatives: this.config.speechRecognition.maxAlternatives
            };
        }
        
        return prepared;
    }
    
    async _validateAnswerContent(answer, exercise, options) {
        const validatorName = this.config.exerciseTypes[exercise.type]?.validator;
        if (!validatorName || !this[validatorName]) {
            return this._validateGenericAnswer(answer, exercise);
        }
        
        return await this[validatorName](answer, exercise, options);
    }
    
    async validateMultipleChoice(answer, exercise, options) {
        const selectedOption = exercise.options.find(opt => opt.id === answer);
        
        if (!selectedOption) {
            return {
                isCorrect: false,
                error: 'Invalid option selected',
                correctAnswer: exercise.correctAnswer
            };
        }
        
        const isCorrect = selectedOption.id === exercise.correctAnswer;
        
        return {
            isCorrect,
            selectedOption: selectedOption.text,
            correctOption: exercise.options.find(opt => opt.id === exercise.correctAnswer)?.text,
            explanation: isCorrect ? selectedOption.explanation : exercise.explanation,
            confidence: isCorrect ? 1.0 : 0.0
        };
    }
    
    async validateFillBlank(answer, exercise, options) {
        const results = [];
        let totalCorrect = 0;
        let totalBlanks = exercise.blanks.length;
        
        for (const blank of exercise.blanks) {
            const userAnswer = answer[blank.id] || '';
            const correctAnswers = exercise.correctAnswers[blank.id] || [];
            
            let isCorrect = false;
            let matchedAnswer = null;
            
            // تطبیق مستقیم
            for (const correctAnswer of correctAnswers) {
                const normalizedUser = this._normalizeText(userAnswer);
                const normalizedCorrect = this._normalizeText(correctAnswer);
                
                if (normalizedUser === normalizedCorrect) {
                    isCorrect = true;
                    matchedAnswer = correctAnswer;
                    break;
                }
            }
            
            // تطبیق مترادف اگر فعال باشد
            if (!isCorrect && exercise.acceptSynonyms) {
                // منطق تطبیق مترادف ساده
                const synonymMatch = this._checkForSynonyms(userAnswer, correctAnswers);
                if (synonymMatch.found) {
                    isCorrect = synonymMatch.isMatch;
                    matchedAnswer = synonymMatch.matchedAnswer;
                }
            }
            
            // تطبیق جزئی اگر فعال باشد
            if (!isCorrect && this.config.validation.acceptPartial) {
                const partialMatch = this._checkPartialMatch(userAnswer, correctAnswers);
                if (partialMatch.score >= this.config.validation.partialThreshold) {
                    isCorrect = true;
                    matchedAnswer = partialMatch.bestMatch;
                }
            }
            
            if (isCorrect) totalCorrect++;
            
            results.push({
                blankId: blank.id,
                userAnswer,
                isCorrect,
                correctAnswer: matchedAnswer || correctAnswers[0],
                allCorrectAnswers: correctAnswers
            });
        }
        
        const accuracy = totalCorrect / totalBlanks;
        const isFullyCorrect = accuracy === 1;
        const isPartiallyCorrect = accuracy >= this.config.validation.partialThreshold;
        
        return {
            isCorrect: isFullyCorrect || (isPartiallyCorrect && this.config.validation.acceptPartial),
            accuracy,
            totalCorrect,
            totalBlanks,
            results,
            fullyCorrect: isFullyCorrect,
            partiallyCorrect: isPartiallyCorrect && !isFullyCorrect
        };
    }
    
    async validateMatching(answer, exercise, options) {
        const userPairs = answer.pairs || [];
        const correctPairs = exercise.correctPairs || [];
        
        let correctCount = 0;
        const pairResults = [];
        
        for (const userPair of userPairs) {
            const isCorrect = correctPairs.some(correctPair => 
                correctPair.left === userPair.left && 
                correctPair.right === userPair.right
            );
            
            if (isCorrect) correctCount++;
            
            pairResults.push({
                left: userPair.left,
                right: userPair.right,
                isCorrect,
                correctMatch: isCorrect ? userPair.right : 
                    correctPairs.find(p => p.left === userPair.left)?.right
            });
        }
        
        const accuracy = correctPairs.length > 0 ? correctCount / correctPairs.length : 0;
        const isComplete = correctCount === correctPairs.length;
        
        return {
            isCorrect: isComplete,
            accuracy,
            correctCount,
            totalPairs: correctPairs.length,
            pairResults,
            isComplete,
            missingPairs: correctPairs.length - correctCount
        };
    }
    
    async validateSpeaking(answer, exercise, options) {
        let validationResult;
        
        // استفاده از سرویس تشخیص گفتار اگر موجود باشد
        if (this.deps.speechService && typeof this.deps.speechService.analyzeSpeech === 'function') {
            try {
                validationResult = await this.deps.speechService.analyzeSpeech(
                    answer.audio || answer.text,
                    exercise.targetPhrase,
                    {
                        language: exercise.language,
                        confidenceThreshold: exercise.confidenceThreshold
                    }
                );
            } catch (error) {
                console.warn('[ExerciseEngine] Speech service failed:', error);
                validationResult = this._validateSpeakingFallback(answer, exercise);
            }
        } else {
            // فال‌بک برای تشخیص گفتار
            validationResult = this._validateSpeakingFallback(answer, exercise);
        }
        
        return validationResult;
    }
    
    async validateOrdering(answer, exercise, options) {
        const userOrder = answer.order || [];
        const correctOrder = exercise.correctOrder || [];
        
        if (userOrder.length !== correctOrder.length) {
            return {
                isCorrect: false,
                error: 'Invalid number of items',
                correctOrder
            };
        }
        
        let correctCount = 0;
        const itemResults = [];
        
        for (let i = 0; i < userOrder.length; i++) {
            const isCorrect = userOrder[i] === correctOrder[i];
            if (isCorrect) correctCount++;
            
            itemResults.push({
                position: i + 1,
                userItem: userOrder[i],
                correctItem: correctOrder[i],
                isCorrect
            });
        }
        
        const accuracy = correctCount / correctOrder.length;
        const isFullyCorrect = accuracy === 1;
        
        return {
            isCorrect: isFullyCorrect,
            accuracy,
            correctCount,
            totalItems: correctOrder.length,
            itemResults,
            fullyCorrect: isFullyCorrect,
            correctOrder
        };
    }
    
    async validateListening(answer, exercise, options) {
        const results = [];
        let totalCorrect = 0;
        
        for (const question of exercise.questions) {
            const userAnswer = answer[question.id];
            const isCorrect = this._checkListeningAnswer(userAnswer, question);
            
            if (isCorrect) totalCorrect++;
            
            results.push({
                questionId: question.id,
                userAnswer,
                isCorrect,
                correctAnswer: question.correctAnswer,
                explanation: question.explanation
            });
        }
        
        const accuracy = totalCorrect / exercise.questions.length;
        const isFullyCorrect = accuracy === 1;
        
        return {
            isCorrect: isFullyCorrect,
            accuracy,
            totalCorrect,
            totalQuestions: exercise.questions.length,
            results,
            fullyCorrect: isFullyCorrect
        };
    }
    
    _calculateScore(exercise, validationResult, context) {
        const typeConfig = this.config.exerciseTypes[exercise.type];
        const difficultyMultiplier = this.config.scoring.difficultyMultipliers[exercise.difficulty] || 1.0;
        
        let score = 0;
        
        if (validationResult.isCorrect) {
            // امتیاز پایه
            score = this.config.scoring.baseScore * difficultyMultiplier * typeConfig.timeMultiplier;
            
            // پاداش زمان
            if (this.config.scoring.timeDecayRate > 0) {
                const maxTime = exercise.timeout || 60000;
                const timeRatio = Math.max(0, 1 - (context.responseTime / maxTime));
                const timeBonus = timeRatio * this.config.scoring.timeDecayRate * score;
                score += timeBonus;
            }
            
            // پاداش استریک
            if (context.currentStreak > 0) {
                const streakBonus = Math.min(
                    this.config.scoring.streakBonus * context.currentStreak,
                    score * 0.3
                );
                score += streakBonus;
            }
            
            // پاداش کامل
            if (validationResult.accuracy === 1 || validationResult.fullyCorrect) {
                score += this.config.scoring.perfectBonus;
            }
            
            // کاهش بر اساس تعداد تلاش
            if (context.attemptNumber > 1) {
                const penalty = Math.pow(this.config.scoring.attemptPenalty, context.attemptNumber - 1);
                score *= penalty;
            }
            
            // کسر برای راهنمایی‌های استفاده شده
            if (context.hintsUsed > 0) {
                const hintPenalty = this.config.hints.hintCost * context.hintsUsed;
                score = Math.max(0, score - hintPenalty);
            }
            
            // امتیاز تطبیقی
            if (this.config.scoring.adaptiveScoring) {
                score = this._applyAdaptiveScoring(score, exercise, validationResult);
            }
        } else if (validationResult.partiallyCorrect) {
            // امتیاز جزئی برای پاسخ‌های نیمه درست
            score = Math.floor(this.config.scoring.baseScore * difficultyMultiplier * validationResult.accuracy * 0.7);
        }
        
        // گرد کردن
        score = Math.round(score);
        
        return {
            score,
            breakdown: {
                base: this.config.scoring.baseScore * difficultyMultiplier * typeConfig.timeMultiplier,
                timeBonus: validationResult.isCorrect && this.config.scoring.timeDecayRate > 0 ? 
                    Math.max(0, 1 - (context.responseTime / (exercise.timeout || 60000))) * 
                    this.config.scoring.timeDecayRate * this.config.scoring.baseScore * difficultyMultiplier * typeConfig.timeMultiplier : 0,
                streakBonus: validationResult.isCorrect && context.currentStreak > 0 ? 
                    Math.min(this.config.scoring.streakBonus * context.currentStreak, score * 0.3) : 0,
                perfectBonus: (validationResult.accuracy === 1 || validationResult.fullyCorrect) ? 
                    this.config.scoring.perfectBonus : 0,
                attemptPenalty: context.attemptNumber > 1 ? 
                    Math.pow(this.config.scoring.attemptPenalty, context.attemptNumber - 1) : 1,
                hintPenalty: context.hintsUsed * this.config.hints.hintCost,
                adaptiveAdjustment: this.config.scoring.adaptiveScoring ? 
                    this._getAdaptiveAdjustment(score, exercise, validationResult) : 0
            }
        };
    }
    
    _generateFeedback(validationResult, scoringResult, options) {
        const feedback = {
            immediate: this.config.feedback.immediate ? {
                message: validationResult.isCorrect ? 
                    this._getRandomFeedback('positive') : 
                    this._getRandomFeedback('constructive'),
                type: validationResult.isCorrect ? 'success' : 'error',
                score: scoringResult.score
            } : null,
            
            detailed: this.config.feedback.detailed ? {
                validation: validationResult,
                scoring: scoringResult,
                suggestions: this._generateSuggestions(validationResult)
            } : null,
            
            correctAnswer: this.config.feedback.showCorrectAnswer ? 
                this._getCorrectAnswerDisplay(validationResult) : null
        };
        
        // بازخورد تطبیقی
        if (this.config.feedback.adaptiveFeedback) {
            feedback.adaptive = this._generateAdaptiveFeedback(validationResult, scoringResult);
        }
        
        return feedback;
    }
    
    // ==================== UTILITY METHODS ====================
    
    _setupSpeechRecognition() {
        if (typeof webkitSpeechRecognition === 'undefined') {
            console.warn('[ExerciseEngine] Speech recognition not available');
            return;
        }
        
        try {
            this.recognition = new webkitSpeechRecognition();
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.lang = this.config.speechRecognition.language;
            this.recognition.maxAlternatives = this.config.speechRecognition.maxAlternatives;
            
            this.recognition.onresult = (event) => {
                const result = event.results[0][0];
                this._handleSpeechResult(result);
            };
            
            this.recognition.onerror = (event) => {
                console.error('[ExerciseEngine] Speech recognition error:', event.error);
            };
            
        } catch (error) {
            console.error('[ExerciseEngine] Failed to setup speech recognition:', error);
        }
    }
    
    _setupExerciseTimers() {
        // تایمر ذخیره پیشرفت
        const saveTimer = setInterval(() => {
            this._autoSaveProgress();
        }, this.config.timing.saveProgressInterval);
        
        // تایمر timeout
        if (this.state.currentExercise.timeout) {
            const timeoutTimer = setTimeout(() => {
                this._handleTimeout();
            }, this.state.currentExercise.timeout);
            
            this.state.timers.set('timeout', timeoutTimer);
        }
        
        // تایمر هشدار
        if (this.config.timing.warningThreshold && this.state.currentExercise.timeout) {
            const warningTime = this.state.currentExercise.timeout - (this.config.timing.warningThreshold * 1000);
            if (warningTime > 0) {
                const warningTimer = setTimeout(() => {
                    this._emitEvent('exercise:time:warning', {
                        remainingSeconds: this.config.timing.warningThreshold,
                        sessionId: this.state.session.id
                    });
                }, warningTime);
                
                this.state.timers.set('warning', warningTimer);
            }
        }
        
        this.state.timers.set('save', saveTimer);
    }
    
    _calculateTimeout(exercise) {
        const baseTime = 60000; // 1 دقیقه پایه
        
        switch (exercise.type) {
            case 'multiple_choice':
                return baseTime;
            case 'fill_blank':
                return baseTime * 1.2;
            case 'matching':
                return baseTime * 1.5;
            case 'speaking':
                return baseTime * 2;
            case 'ordering':
                return baseTime * 1.3;
            case 'listening':
                return (exercise.audioUrl ? 120000 : 90000) + (exercise.questions.length * 30000);
            default:
                return baseTime;
        }
    }
    
    _generateExerciseHints(exercise) {
        const hints = [];
        const hintStrategy = this.config.exerciseTypes[exercise.type]?.hintStrategy;
        
        switch (hintStrategy) {
            case 'progressive':
                hints.push('اولین گزینه را در نظر بگیر');
                hints.push('به کلمات کلیدی سوال توجه کن');
                hints.push('گزینه صحیح معمولاً کامل‌ترین پاسخ است');
                break;
                
            case 'letter_by_letter':
                const correctAnswer = exercise.correctAnswer || exercise.correctAnswers;
                if (correctAnswer) {
                    hints.push(`کلمه با حرف "${correctAnswer[0]}" شروع می‌شود`);
                    if (correctAnswer.length > 1) {
                        hints.push(`کلمه ${correctAnswer.length} حرفی است`);
                    }
                }
                break;
                
            case 'partial_reveal':
                hints.push('سعی کن موارد مشابه را حذف کنی');
                hints.push('به ارتباط منطقی بین آیتم‌ها فکر کن');
                break;
                
            case 'audio_hint':
                if (exercise.sampleAudio) {
                    hints.push('دوباره به فایل صوتی گوش بده');
                }
                if (exercise.pronunciationGuide) {
                    hints.push(`تلفظ صحیح: ${exercise.pronunciationGuide}`);
                }
                break;
                
            case 'first_last':
                hints.push('اولین و آخرین آیتم معمولاً سرنخ خوبی هستند');
                break;
                
            case 'repeat_audio':
                hints.push('می‌توانی فایل صوتی را دوباره پخش کنی');
                break;
                
            default:
                hints.push('دوباره سوال را با دقت بخوان');
                hints.push('به نکات مهم توجه کن');
        }
        
        return hints.slice(0, this.config.hints.maxHintsPerExercise);
    }
    
    _generateHint(exercise, hintType, options) {
        const availableHints = exercise.hints || [];
        
        if (availableHints.length === 0) {
            return 'متأسفانه راهنمایی‌ای برای این سوال وجود ندارد.';
        }
        
        // اگر راهنمایی استفاده نشده وجود دارد
        const unusedHints = availableHints.filter(hint => 
            !this.hintSystem.usedHints.some(used => used.hint === hint)
        );
        
        if (unusedHints.length > 0) {
            if (this.config.hints.progressiveReveal) {
                // ارائه راهنمایی‌ها به ترتیب
                return unusedHints[0];
            } else {
                // انتخاب تصادفی
                return unusedHints[Math.floor(Math.random() * unusedHints.length)];
            }
        }
        
        // اگر همه راهنمایی‌ها استفاده شده‌اند
        if (hintType === 'additional') {
            return this._generateAdditionalHint(exercise, options);
        }
        
        // تکرار یکی از راهنمایی‌های قبلی
        const randomIndex = Math.floor(Math.random() * this.hintSystem.usedHints.length);
        return `(تکرار) ${this.hintSystem.usedHints[randomIndex].hint}`;
    }
    
    _calculateFinalScore(success) {
        const session = this.state.session;
        
        if (!success || session.answers.length === 0) return 0;
        
        // میانگین امتیاز پاسخ‌ها
        const answerScores = session.answers
            .filter(a => a.isCorrect)
            .map(a => a.score);
        
        const averageScore = answerScores.length > 0 
            ? answerScores.reduce((a, b) => a + b, 0) / answerScores.length 
            : 0;
        
        // ضریب موفقیت
        const successRatio = answerScores.length / session.attempts;
        
        // نمره نهایی
        let finalScore = averageScore * successRatio;
        
        // پنالتی زمان
        if (session.timeSpent > (this.state.currentExercise.timeout || 60000)) {
            const overtimeRatio = session.timeSpent / (this.state.currentExercise.timeout || 60000);
            const penalty = Math.min(overtimeRatio - 1, 0.5) * this.config.timing.overtimePenalty * finalScore;
            finalScore -= penalty;
        }
        
        // محدود کردن
        finalScore = Math.min(finalScore, 1000);
        
        return Math.round(finalScore);
    }
    
    async _saveExerciseResults(results) {
        try {
            // ذخیره در دیتابیس
            if (this.deps.database) {
                await this.deps.database.saveExerciseResults(results);
            }
            
            // ذخیره در state manager
            this.deps.stateManager.set(`exercise.results.${results.exerciseId}`, results);
            
            // ارسال آنالیتیکس
            if (this.deps.analytics) {
                this.deps.analytics.track('exercise_completed', results);
            }
            
            this._emitEvent(this.config.events.PROGRESS_SAVED, results);
            
        } catch (error) {
            console.error('[ExerciseEngine] Save results failed:', error);
        }
    }
    
    async _loadUserStats(exerciseId) {
        try {
            if (this.deps.database) {
                const stats = await this.deps.database.getExerciseStats(
                    this._getCurrentUserId(),
                    exerciseId
                );
                
                if (stats) {
                    this.cache.statistics.set(exerciseId, stats);
                }
            }
        } catch (error) {
            console.warn('[ExerciseEngine] Load user stats failed:', error);
        }
    }
    
    _cleanupSession() {
        // پاک‌سازی تایمرها
        for (const [name, timer] of this.state.timers) {
            if (name.includes('interval')) {
                clearInterval(timer);
            } else {
                clearTimeout(timer);
            }
        }
        this.state.timers.clear();
        
        // متوقف کردن تشخیص گفتار
        if (this.recognition && this.recognition.isListening) {
            this.recognition.stop();
        }
        
        // ریست state سشن
        this.state.session = {
            id: null,
            startTime: null,
            endTime: null,
            timeSpent: 0,
            isPaused: false,
            isTimedOut: false,
            attempts: 0,
            currentStreak: 0,
            totalScore: 0,
            hintsUsed: 0,
            answers: []
        };
        
        this.state.validationState = {
            isValidating: false,
            validationResults: null,
            scoringResults: null
        };
    }
    
    // ==================== HELPER METHODS ====================
    
    _validateAnswerFormat(answer, type) {
        switch (type) {
            case 'multiple_choice':
                if (typeof answer !== 'string') throw new Error('Answer must be a string');
                return answer.trim();
                
            case 'fill_blank':
                if (typeof answer !== 'object' || answer === null) {
                    throw new Error('Answer must be an object');
                }
                return answer;
                
            case 'matching':
                if (!Array.isArray(answer.pairs)) throw new Error('Pairs must be an array');
                return answer;
                
            case 'speaking':
                if (typeof answer !== 'object' || !(answer.audio || answer.text)) {
                    throw new Error('Answer must contain audio or text');
                }
                return answer;
                
            case 'ordering':
                if (!Array.isArray(answer.order)) throw new Error('Order must be an array');
                return answer;
                
            case 'listening':
                if (typeof answer !== 'object') throw new Error('Answer must be an object');
                return answer;
                
            default:
                return answer;
        }
    }
    
    _normalizeText(text) {
        return String(text).toLowerCase().trim()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '') // حذف اعراب
            .replace(/[.\s,;:!?]/g, '')
            .replace(/[آاآ]/g, 'ا')
            .replace(/[یي]/g, 'ی')
            .replace(/[کك]/g, 'ک')
            .replace(/[ۀه]/g, 'ه');
    }
    
    _checkForSynonyms(userAnswer, correctAnswers) {
        // اینجا می‌تواند به یک دیکشنری مترادف متصل شود
        // فعلاً یک منطق ساده
        const synonyms = {
            'بزرگ': ['عظیم', 'کلان', 'وسیع'],
            'کوچک': ['ریز', 'خرد', 'صغیر'],
            'خوب': ['عالی', 'نیک', 'ممتاز'],
            'بد': ['زشت', 'ناپسند', 'نامطلوب']
        };
        
        const normalizedUser = this._normalizeText(userAnswer);
        
        for (const correct of correctAnswers) {
            const normalizedCorrect = this._normalizeText(correct);
            
            if (normalizedUser === normalizedCorrect) {
                return { found: true, isMatch: true, matchedAnswer: correct };
            }
            
            // بررسی مترادف‌ها
            const wordSynonyms = synonyms[normalizedCorrect] || [];
            if (wordSynonyms.some(syn => this._normalizeText(syn) === normalizedUser)) {
                return { found: true, isMatch: true, matchedAnswer: correct };
            }
        }
        
        return { found: false, isMatch: false };
    }
    
    _checkPartialMatch(userAnswer, correctAnswers) {
        let bestScore = 0;
        let bestMatch = null;
        
        const normalizedUser = this._normalizeText(userAnswer);
        
        for (const correct of correctAnswers) {
            const normalizedCorrect = this._normalizeText(correct);
            
            // تطبیق کاراکتر به کاراکتر
            let matches = 0;
            const maxLength = Math.max(normalizedUser.length, normalizedCorrect.length);
            
            for (let i = 0; i < maxLength; i++) {
                if (normalizedUser[i] === normalizedCorrect[i]) {
                    matches++;
                }
            }
            
            const score = matches / maxLength;
            
            if (score > bestScore) {
                bestScore = score;
                bestMatch = correct;
            }
        }
        
        return { score: bestScore, bestMatch };
    }
    
    _validateSpeakingFallback(answer, exercise) {
        const userText = answer.text || '';
        const normalizedUser = this._normalizeText(userText);
        const normalizedTarget = this._normalizeText(exercise.targetPhrase);
        
        const isExactMatch = normalizedUser === normalizedTarget;
        const similarity = this._calculateSimilarity(normalizedUser, normalizedTarget);
        
        return {
            isCorrect: isExactMatch || similarity >= exercise.confidenceThreshold,
            confidence: similarity,
            userText,
            targetPhrase: exercise.targetPhrase,
            isExactMatch,
            similarity,
            pronunciationScore: similarity * 100
        };
    }
    
    _checkListeningAnswer(userAnswer, question) {
        if (!userAnswer) return false;
        
        const normalizedUser = this._normalizeText(userAnswer);
        const normalizedCorrect = this._normalizeText(question.correctAnswer);
        
        // تطبیق مستقیم
        if (normalizedUser === normalizedCorrect) return true;
        
        // تطبیق مترادف
        if (question.acceptSynonyms !== false && this.config.validation.acceptSynonyms) {
            const synonymCheck = this._checkForSynonyms(userAnswer, [question.correctAnswer]);
            if (synonymCheck.found && synonymCheck.isMatch) return true;
        }
        
        // تطبیق جزئی
        if (this.config.validation.acceptPartial) {
            const partialMatch = this._checkPartialMatch(userAnswer, [question.correctAnswer]);
            if (partialMatch.score >= this.config.validation.partialThreshold) return true;
        }
        
        return false;
    }
    
    _calculateSimilarity(str1, str2) {
        if (str1 === str2) return 1.0;
        
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        // فاصله لونشتاین
        const distance = this._levenshteinDistance(longer, shorter);
        return 1.0 - (distance / longer.length);
    }
    
    _levenshteinDistance(a, b) {
        if (a.length === 0) return b.length;
        if (b.length === 0) return a.length;
        
        const matrix = [];
        
        for (let i = 0; i <= b.length; i++) {
            matrix[i] = [i];
        }
        
        for (let j = 0; j <= a.length; j++) {
            matrix[0][j] = j;
        }
        
        for (let i = 1; i <= b.length; i++) {
            for (let j = 1; j <= a.length; j++) {
                const cost = a[j - 1] === b[i - 1] ? 0 : 1;
                matrix[i][j] = Math.min(
                    matrix[i - 1][j] + 1,
                    matrix[i][j - 1] + 1,
                    matrix[i - 1][j - 1] + cost
                );
            }
        }
        
        return matrix[b.length][a.length];
    }
    
    _applyAdaptiveScoring(baseScore, exercise, validationResult) {
        const stats = this.cache.statistics.get(exercise.id);
        
        if (!stats || stats.attempts < 5) {
            return baseScore;
        }
        
        const averageAccuracy = stats.correct / stats.attempts;
        const adjustment = 1.0 + ((validationResult.accuracy || (validationResult.isCorrect ? 1 : 0)) - averageAccuracy);
        
        return Math.round(baseScore * Math.min(Math.max(adjustment, 0.5), 2.0));
    }
    
    _getAdaptiveAdjustment(baseScore, exercise, validationResult) {
        const stats = this.cache.statistics.get(exercise.id);
        
        if (!stats || stats.attempts < 5) {
            return 0;
        }
        
        const averageAccuracy = stats.correct / stats.attempts;
        const adjustment = ((validationResult.accuracy || (validationResult.isCorrect ? 1 : 0)) - averageAccuracy) * baseScore;
        
        return Math.round(adjustment);
    }
    
    _getRandomFeedback(type) {
        const messages = this.config.feedback[`${type}Messages`];
        if (!messages || messages.length === 0) {
            return type === 'positive' ? 'خوب' : 'دوباره تلاش کن';
        }
        
        return messages[Math.floor(Math.random() * messages.length)];
    }
    
    _generateSuggestions(validationResult) {
        const suggestions = [];
        
        if (!validationResult.isCorrect) {
            if (validationResult.partiallyCorrect) {
                suggestions.push('شما نزدیک بودید! دوباره با دقت بیشتر تلاش کنید.');
            } else {
                suggestions.push('مجددا سوال را با دقت بخوانید.');
                suggestions.push('به نکات کلیدی توجه کنید.');
            }
        }
        
        if (validationResult.results) {
            const incorrectCount = validationResult.results.filter(r => !r.isCorrect).length;
            if (incorrectCount > 0) {
                suggestions.push(`${incorrectCount} مورد نیاز به اصلاح دارد.`);
            }
        }
        
        return suggestions;
    }
    
    _getCorrectAnswerDisplay(validationResult) {
        if (validationResult.correctAnswer) {
            return validationResult.correctAnswer;
        }
        
        if (validationResult.correctOrder) {
            return validationResult.correctOrder.join(' → ');
        }
        
        if (validationResult.results) {
            return validationResult.results.map(r => r.correctAnswer).join(', ');
        }
        
        return 'پاسخ صحیح';
    }
    
    _generateAdaptiveFeedback(validationResult, scoringResult) {
        const adaptive = {};
        
        if (scoringResult.score < 50) {
            adaptive.message = 'نیاز به تمرین بیشتر دارید.';
            adaptive.priority = 'high';
        } else if (scoringResult.score < 80) {
            adaptive.message = 'خوب بود، اما می‌توانید بهتر شوید.';
            adaptive.priority = 'medium';
        } else {
            adaptive.message = 'عالی! همینطور ادامه دهید.';
            adaptive.priority = 'low';
        }
        
        if (validationResult.timeSpent && validationResult.timeSpent > 45000) {
            adaptive.tip = 'سعی کنید سریع‌تر پاسخ دهید.';
        }
        
        return adaptive;
    }
    
    _generateAdditionalHint(exercise, options) {
        switch (exercise.type) {
            case 'multiple_choice':
                const correctOption = exercise.options.find(opt => opt.id === exercise.correctAnswer);
                if (correctOption) {
                    return `گزینه صحیح "${correctOption.text.substr(0, Math.ceil(correctOption.text.length / 2))}..." شروع می‌شود`;
                }
                break;
                
            case 'fill_blank':
                return 'به گرامر جمله توجه کنید.';
                
            case 'matching':
                return 'سعی کنید ارتباط معنایی بین آیتم‌ها را پیدا کنید.';
                
            default:
                return 'یک بار دیگر با دقت بیشتر فکر کنید.';
        }
        
        return 'می‌توانید پاسخ را حدس بزنید.';
    }
    
    _createFallbackExercise(exerciseId) {
        return {
            id: exerciseId,
            type: 'multiple_choice',
            difficulty: 'medium',
            language: 'fa',
            question: 'این یک سوال نمونه است',
            options: [
                { id: 'a', text: 'گزینه اول' },
                { id: 'b', text: 'گزینه دوم', correct: true },
                { id: 'c', text: 'گزینه سوم' }
            ],
            correctAnswer: 'b',
            explanation: 'این توضیح نمونه است'
        };
    }
    
    _shuffleArray(array) {
        const shuffled = [...array];
        for (let i = shuffled.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }
    
    _getCurrentUserId() {
        return this.deps.stateManager?.get('user.id') || 'anonymous';
    }
    
    _isRetryableError(error) {
        const retryableErrors = [
            'network',
            'timeout',
            'server',
            'connection',
            'fetch'
        ];
        
        return retryableErrors.some(keyword => 
            error.message.toLowerCase().includes(keyword)
        );
    }
    
    _validateExerciseStructure(exercise) {
        if (!exercise.id) throw new Error('Exercise must have an id');
        if (!exercise.type) throw new Error('Exercise must have a type');
        
        const validTypes = Object.keys(this.config.exerciseTypes);
        if (!validTypes.includes(exercise.type) && exercise.type !== 'custom') {
            throw new Error(`Invalid exercise type: ${exercise.type}`);
        }
        
        // نوع‌های خاص
        switch (exercise.type) {
            case 'multiple_choice':
                if (!exercise.question) throw new Error('Multiple choice must have question');
                if (!Array.isArray(exercise.options) || exercise.options.length < 2) {
                    throw new Error('Multiple choice must have at least 2 options');
                }
                if (!exercise.correctAnswer) throw new Error('Multiple choice must have correctAnswer');
                break;
                
            case 'fill_blank':
                if (!exercise.text) throw new Error('Fill blank must have text');
                if (!Array.isArray(exercise.blanks) || exercise.blanks.length === 0) {
                    throw new Error('Fill blank must have blanks');
                }
                break;
        }
    }
    
    _validateGenericAnswer(answer, exercise) {
        return {
            isCorrect: false,
            error: `No validator for exercise type: ${exercise.type}`,
            canProceed: false
        };
    }
    
    _handleSpeechResult(result) {
        if (!this.state.currentExercise || this.state.currentExercise.type !== 'speaking') {
            return;
        }
        
        const answer = {
            text: result.transcript,
            confidence: result.confidence,
            alternatives: result.alternatives || []
        };
        
        this.submitAnswer(answer);
    }
    
    _handleTimeout() {
        this.state.session.isTimedOut = true;
        this.completeExercise(false);
    }
    
    async _autoSaveProgress() {
        if (!this.state.session.id || !this.state.currentExercise) {
            return;
        }
        
        try {
            const progress = {
                exerciseId: this.state.currentExercise.id,
                sessionId: this.state.session.id,
                answers: this.state.session.answers,
                timeSpent: Date.now() - this.state.session.startTime,
                timestamp: Date.now()
            };
            
            if (this.deps.database) {
                await this.deps.database.saveExerciseProgress(progress);
            }
            
        } catch (error) {
            console.error('[ExerciseEngine] Auto-save failed:', error);
        }
    }
    
    _pauseTimers() {
        this.state.timers.forEach(timer => {
            if (typeof timer === 'number') {
                clearTimeout(timer);
            }
        });
    }
    
    _resumeTimers(pauseDuration) {
        // تایمرهای جدید با جبران مدت توقف
        this._setupExerciseTimers();
        
        // تنظیم مجدد startTime برای محاسبه زمان
        this.state.session.startTime += pauseDuration;
    }
    
    _emitEvent(eventName, data) {
        if (this.deps.eventBus) {
            this.deps.eventBus.emit(eventName, data);
        }
    }
    
    _setupSpeechRecognitionForExercise() {
        if (!this.recognition || !this.state.currentExercise) return;
        
        const exercise = this.state.currentExercise;
        
        this.recognition.lang = exercise.language || this.config.speechRecognition.language;
        this.recognition.maxAlternatives = this.config.speechRecognition.maxAlternatives;
        
        if (exercise.speechConfig) {
            Object.assign(this.recognition, exercise.speechConfig);
        }
    }
    
    // ==================== CLEANUP ====================
    
    cleanup() {
        this._cleanupSession();
        
        // پاک‌سازی تشخیص گفتار
        if (this.recognition) {
            this.recognition.abort();
            this.recognition = null;
        }
        
        // پاک‌سازی کش
        this.cache.exercises.clear();
        this.cache.userAnswers.clear();
        this.cache.statistics.clear();
        
        // پاک‌سازی سیستم راهنمایی
        this.hintSystem.availableHints = [];
        this.hintSystem.usedHints = [];
        this.hintSystem.hintTimers.clear();
        
        console.log('[ExerciseEngine] 🧹 Cleaned up');
    }
}

// Export
if (typeof window !== 'undefined') {
    window.ExerciseEngine = ExerciseEngine;
}

export { ExerciseEngine };
