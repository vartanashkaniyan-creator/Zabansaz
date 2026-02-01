/**
 * VAKAMOVA LESSON UI - کامپوننت‌های رابط کاربری درس‌ها
 */

class LessonUI {
    constructor(dependencies = {}, config = {}) {
        this.deps = {
            eventBus: dependencies.eventBus || window.eventBus,
            stateManager: dependencies.stateManager || window.stateManager,
            lessonService: dependencies.lessonService || window.LessonService
        };
        
        this.config = Object.freeze({
            animationDuration: config.animationDuration || 300,
            maxHintAttempts: config.maxHintAttempts || 3,
            uiTemplates: config.uiTemplates || {},
            selectors: {
                lessonContainer: '.lesson-container',
                exerciseWrapper: '.exercise-wrapper',
                feedbackArea: '.feedback-area',
                progressBar: '.lesson-progress-bar',
                ...config.selectors
            },
            events: {
                EXERCISE_RENDERED: 'lesson:ui:exercise:rendered',
                HINT_REQUESTED: 'lesson:ui:hint:requested',
                ANSWER_SUBMITTED: 'lesson:ui:answer:submitted',
                ...config.events
            },
            ...config
        });
        
        this.components = new Map();
        this.currentExercise = null;
    }
    
    // ==================== CORE RENDER METHODS ====================
    
    renderLesson(lessonData, containerId = 'lesson-content') {
        const container = document.getElementById(containerId);
        if (!container) throw new Error(`Container #${containerId} not found`);
        
        // پاک‌سازی قبلی
        this.cleanup();
        
        // رندر هدر درس
        const headerHTML = this._renderLessonHeader(lessonData);
        
        // رندر تمرین‌ها
        const exercisesHTML = this._renderExercises(lessonData.exercises);
        
        // رندر ناوبری
        const navigationHTML = this._renderNavigation(lessonData);
        
        container.innerHTML = `
            <div class="lesson-ui" data-lesson-id="${lessonData.id}">
                ${headerHTML}
                <div class="exercises-container">
                    ${exercisesHTML}
                </div>
                ${navigationHTML}
                <div class="lesson-feedback" style="display: none;"></div>
            </div>
        `;
        
        // ثبت کامپوننت‌ها
        this._registerComponents(container);
        
        // انیمیشن
        this._animateEntrance(container);
        
        this.deps.eventBus.emit(this.config.events.EXERCISE_RENDERED, {
            lessonId: lessonData.id,
            exerciseCount: lessonData.exercises?.length || 0
        });
    }
    
    renderExercise(exerciseData, options = {}) {
        const template = this._getExerciseTemplate(exerciseData.type);
        if (!template) throw new Error(`No template for exercise type: ${exerciseData.type}`);
        
        const html = template(exerciseData, options);
        const container = document.querySelector(this.config.selectors.exerciseWrapper);
        
        if (!container && !options.container) {
            throw new Error('Exercise container not found');
        }
        
        const targetContainer = options.container || container;
        
        // رندر با انیمیشن
        if (options.animate !== false) {
            this._animateExerciseTransition(targetContainer, html);
        } else {
            targetContainer.innerHTML = html;
        }
        
        // ثبت event listeners
        this._attachExerciseEvents(exerciseData);
        
        this.currentExercise = exerciseData;
        
        return html;
    }
    
    // ==================== EXERCISE TEMPLATES ====================
    
    _getExerciseTemplate(exerciseType) {
        const templates = {
            multiple_choice: this._templateMultipleChoice.bind(this),
            fill_blank: this._templateFillBlank.bind(this),
            matching: this._templateMatching.bind(this),
            speaking: this._templateSpeaking.bind(this),
            listening: this._templateListening.bind(this),
            translation: this._templateTranslation.bind(this)
        };
        
        return templates[exerciseType] || templates.multiple_choice;
    }
    
    _templateMultipleChoice(exercise) {
        return `
            <div class="exercise multiple-choice" data-exercise-id="${exercise.id}">
                <div class="exercise-header">
                    <h3 class="exercise-title">${this._escapeHTML(exercise.question)}</h3>
                    ${exercise.audioUrl ? this._renderAudioPlayer(exercise.audioUrl) : ''}
                </div>
                
                <div class="options-grid">
                    ${exercise.options.map((option, index) => `
                        <button class="option-btn" data-option-index="${index}" data-value="${this._escapeHTML(option)}">
                            <span class="option-letter">${String.fromCharCode(65 + index)}</span>
                            <span class="option-text">${this._escapeHTML(option)}</span>
                        </button>
                    `).join('')}
                </div>
                
                <div class="exercise-footer">
                    <button class="hint-btn" data-exercise-id="${exercise.id}">
                        <span>💡 دریافت راهنمایی</span>
                        <span class="hint-counter">(${exercise.hints?.length || 0} راهنمایی)</span>
                    </button>
                    <button class="submit-btn" data-exercise-id="${exercise.id}" disabled>
                        تأیید پاسخ
                    </button>
                </div>
            </div>
        `;
    }
    
    _templateFillBlank(exercise) {
        return `
            <div class="exercise fill-blank" data-exercise-id="${exercise.id}">
                <div class="exercise-header">
                    <h3 class="exercise-title">جاهای خالی را پر کنید</h3>
                    <div class="sentence-structure">
                        ${this._renderSentenceWithBlanks(exercise.sentence, exercise.blanks)}
                    </div>
                </div>
                
                <div class="blanks-container">
                    ${exercise.blanks.map((blank, index) => `
                        <div class="blank-group">
                            <label for="blank-${index}">${blank.label || `کلمه ${index + 1}`}</label>
                            <input type="text" 
                                   id="blank-${index}" 
                                   class="blank-input"
                                   data-blank-index="${index}"
                                   placeholder="${blank.hint || 'پاسخ خود را وارد کنید'}"
                                   maxlength="${blank.maxLength || 50}">
                            <div class="input-hint">${blank.wordCount || 'تک کلمه'}</div>
                        </div>
                    `).join('')}
                </div>
                
                <div class="exercise-footer">
                    ${this._renderWordBank(exercise.wordBank)}
                    <button class="submit-btn" data-exercise-id="${exercise.id}">
                        بررسی پاسخ
                    </button>
                </div>
            </div>
        `;
    }
    
    // ==================== FEEDBACK SYSTEM ====================
    
    showFeedback(feedbackData, options = {}) {
        const feedbackArea = document.querySelector(this.config.selectors.feedbackArea);
        if (!feedbackArea) return;
        
        const feedbackType = feedbackData.correct ? 'correct' : 'incorrect';
        
        const html = `
            <div class="feedback ${feedbackType}">
                <div class="feedback-icon">
                    ${feedbackData.correct ? '✅' : '❌'}
                </div>
                <div class="feedback-content">
                    <h4>${feedbackData.correct ? 'آفرین!' : 'باید دوباره تلاش کنید'}</h4>
                    <p>${this._escapeHTML(feedbackData.message)}</p>
                    
                    ${feedbackData.explanation ? `
                        <div class="explanation">
                            <strong>توضیح:</strong>
                            <p>${this._escapeHTML(feedbackData.explanation)}</p>
                        </div>
                    ` : ''}
                    
                    ${feedbackData.correctAnswer ? `
                        <div class="correct-answer">
                            <strong>پاسخ صحیح:</strong>
                            <p>${this._escapeHTML(feedbackData.correctAnswer)}</p>
                        </div>
                    ` : ''}
                </div>
                
                ${options.showContinue ? `
                    <button class="continue-btn" data-action="continue">
                        ادامه
                    </button>
                ` : ''}
            </div>
        `;
        
        // نمایش با انیمیشن
        feedbackArea.innerHTML = html;
        feedbackArea.style.display = 'block';
        
        this._animateFeedback(feedbackArea, feedbackType);
        
        // پنهان شدن خودکار برای بازخورد صحیح
        if (feedbackData.correct && !options.persistent) {
            setTimeout(() => {
                this.hideFeedback();
            }, 3000);
        }
    }
    
    hideFeedback() {
        const feedbackArea = document.querySelector(this.config.selectors.feedbackArea);
        if (feedbackArea) {
            feedbackArea.style.display = 'none';
            feedbackArea.innerHTML = '';
        }
    }
    
    // ==================== PROGRESS DISPLAY ====================
    
    updateProgress(progressData) {
        const progressBar = document.querySelector(this.config.selectors.progressBar);
        if (!progressBar) return;
        
        const percent = Math.min(100, (progressData.current / progressData.total) * 100);
        
        // به‌روزرسانی نوار پیشرفت
        progressBar.querySelector('.progress-fill').style.width = `${percent}%`;
        progressBar.querySelector('.progress-text').textContent = 
            `${progressData.current} از ${progressData.total}`;
        
        // انیمیشن
        this._animateProgressUpdate(progressBar, percent);
    }
    
    // ==================== UTILITY METHODS ====================
    
    _animateEntrance(container) {
        container.style.opacity = '0';
        container.style.transform = 'translateY(20px)';
        
        requestAnimationFrame(() => {
            container.style.transition = `opacity ${this.config.animationDuration}ms ease, transform ${this.config.animationDuration}ms ease`;
            container.style.opacity = '1';
            container.style.transform = 'translateY(0)';
        });
    }
    
    _animateExerciseTransition(container, newHTML) {
        const oldContent = container.innerHTML;
        
        // انیمیشن خروج
        container.style.transform = 'translateX(-20px)';
        container.style.opacity = '0';
        
        setTimeout(() => {
            container.innerHTML = newHTML;
            
            // انیمیشن ورود
            container.style.transform = 'translateX(20px)';
            requestAnimationFrame(() => {
                container.style.transition = `opacity ${this.config.animationDuration}ms ease, transform ${this.config.animationDuration}ms ease`;
                container.style.opacity = '1';
                container.style.transform = 'translateX(0)';
            });
        }, this.config.animationDuration);
    }
    
    _escapeHTML(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    cleanup() {
        // حذف event listeners
        this.components.forEach(component => {
            if (component.element && component.events) {
                component.events.forEach(event => {
                    component.element.removeEventListener(event.type, event.handler);
                });
            }
        });
        
        this.components.clear();
        this.currentExercise = null;
    }
}

// Export
if (typeof window !== 'undefined') {
    window.LessonUI = LessonUI;
}

export { LessonUI };
