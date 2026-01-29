class LessonManager {
    constructor() {
        this.lessons = new Map();
        this.currentState = {
            language: 'en',
            level: 'beginner',
            currentLesson: null,
            userProgress: {}
        };
    }
    
    // بارگذاری هوشمند با کش و فال‌بک
    async loadLesson(lang, level, lessonId, options = {}) {
        const cacheKey = `${lang}_${level}_${lessonId}`;
        
        // 1. چک کش حافظه
        if(this.lessons.has(cacheKey) && !options.forceReload) {
            return this.lessons.get(cacheKey);
        }
        
        // 2. چک کش IndexedDB
        const cached = await this._getFromDB(lang, level, lessonId);
        if(cached && !options.forceReload) {
            this.lessons.set(cacheKey, cached);
            return cached;
        }
        
        // 3. بارگذاری از سرور/فایل
        try {
            const path = `${AppConfig.OFFLINE_MODE ? './DATA' : AppConfig.API_BASE}/lessons/${lang}/${level}/${lessonId}.json`;
            const response = await fetch(path);
            
            if(!response.ok) throw new Error(`HTTP ${response.status}`);
            
            const lesson = await response.json();
            
            // اعتبارسنجی ساختار درس
            this._validateLessonStructure(lesson);
            
            // ذخیره در کش‌ها
            this.lessons.set(cacheKey, lesson);
            await this._saveToDB(lang, level, lessonId, lesson);
            
            // اعمال پیش‌پردازش‌ها
            return this._preprocessLesson(lesson);
            
        } catch(error) {
            console.error('خطا در بارگذاری درس:', error);
            return this._getFallbackLesson(lang, level, lessonId);
        }
    }
    
    // پردازش هوشمند محتوا
    _preprocessLesson(lesson) {
        return {
            ...lesson,
            estimatedTime: this._calculateReadingTime(lesson.content),
            difficultyScore: this._calculateDifficulty(lesson),
            dependencies: this._findPrerequisites(lesson),
            interactiveElements: this._extractInteractiveParts(lesson)
        };
    }
    
    _calculateReadingTime(content) {
        const words = content.text.split(' ').length;
        return Math.ceil(words / 200); // دقیقه
    }
}
