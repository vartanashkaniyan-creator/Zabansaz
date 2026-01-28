
// autoloader.js - سیستم حرفه‌ای کشف خودکار فایل‌ها
class LessonAutoLoader {
    constructor() {
        this.lessons = [];
        this.maxParallel = 5; // حداکثر درخواست همزمان
    }

    // پیدا کردن همه فایل‌های JSON به صورت هوشمند
    async discoverLessonFiles() {
        console.log('🔍 شروع کشف خودکار فایل‌های درس...');
        
        // استراتژی ۱: جستجوی عددی (۱ تا ۵۰)
        const foundFiles = [];
        const promises = [];
        
        // ایجاد گروه‌های ۵ تایی برای درخواست موازی
        for (let i = 1; i <= 50; i += this.maxParallel) {
            const group = [];
            for (let j = 0; j < this.maxParallel && (i + j) <= 50; j++) {
                group.push(this.checkFile(`english_lesson_${i + j}.json`));
            }
            
            const results = await Promise.allSettled(group);
            results.forEach(result => {
                if (result.status === 'fulfilled' && result.value.exists) {
                    foundFiles.push(result.value);
                }
            });
            
            // نمایش پیشرفت
            if (foundFiles.length > 0) {
                console.log(`✅ ${foundFiles.length} فایل پیدا شد:`, 
                    foundFiles.map(f => f.fileName));
            }
        }
        
        return foundFiles.sort((a, b) => a.fileName.localeCompare(b.fileName));
    }
    
    async checkFile(fileName) {
        try {
            const response = await fetch(fileName, { method: 'HEAD' });
            return { 
                exists: response.ok, 
                fileName: fileName,
                url: fileName 
            };
        } catch {
            return { exists: false, fileName: fileName };
        }
    }
    
    // بارگذاری هوشمند درس‌ها
    async loadLessons() {
        const container = document.getElementById('lessonsContainer');
        const status = document.getElementById('lessons-status');
        const lessonsCount = document.getElementById('lessons-count');
        const wordsCount = document.getElementById('words-count');
        const activeLessons = document.getElementById('active-lessons');
        
        container.innerHTML = '<div class="loading">🔍 در حال کشف فایل‌های درس...</div>';
        status.textContent = 'در حال جستجوی هوشمند...';
        
        // مرحله ۱: کشف فایل‌ها
        const files = await this.discoverLessonFiles();
        
        if (files.length === 0) {
            container.innerHTML = `
                <div style="grid-column: 1/-1; text-align: center; padding: 40px; background: rgba(255,0,0,0.1); border-radius: 15px;">
                    <h3>📭 هیچ فایل درسی پیدا نشد</h3>
                    <p>فایل‌های JSON با نام‌های english_lesson_*.json را در سرور آپلود کنید.</p>
                </div>
            `;
            status.textContent = '❌ هیچ فایل درسی پیدا نشد';
            return;
        }
        
        // مرحله ۲: بارگذاری محتوا
        status.textContent = `📥 در حال بارگذاری ${files.length} درس...`;
        container.innerHTML = '<div class="loading">📥 در حال بارگذاری محتوا...</div>';
        
        let loadedLessons = 0;
        let totalWords = 0;
        let lessonHTML = '';
        
        // بارگذاری موازی درس‌ها
        const loadPromises = files.map(async (file, index) => {
            try {
                const response = await fetch(file.fileName);
                const data = await response.json();
                
                const vocabWords = data.content.vocabulary?.words || [];
                
                lessonHTML += `
                    <div class="lesson-card animate" style="animation-delay: ${index * 0.1}s">
                        <h3>📘 ${data.metadata.title}</h3>
                        <p class="subtitle">${data.metadata.subtitle}</p>
                        
                        <div class="objectives">
                            ${data.metadata.learning_objectives.map(obj => 
                                `<span class="objective">${obj}</span>`
                            ).join('')}
                        </div>
                        
                        ${vocabWords.length > 0 ? `
                            <div class="vocabulary-preview">
                                <h4>📝 واژگان (${vocabWords.length} کلمه):</h4>
                                ${vocabWords.slice(0, 3).map(word => 
                                    `<div class="word-item">
                                        <span class="english-word">${word.english}</span>
                                        <span class="farsi-word">${word.farsi}</span>
                                    </div>`
                                ).join('')}
                                ${vocabWords.length > 3 ? 
                                    `<p style="text-align: center; margin-top: 10px; opacity: 0.7;">
                                        + ${vocabWords.length - 3} کلمه دیگر
                                    </p>` : ''}
                            </div>
                        ` : ''}
                        
                        <div style="margin-top: 15px; font-size: 0.9rem; opacity: 0.8;">
                            <span>🕒 ${data.metadata.estimated_time || 15} دقیقه</span> • 
                            <span>📊 سطح: ${data.metadata.level}</span> •
                            <span>🔢 ${vocabWords.length} کلمه</span>
                        </div>
                    </div>
                `;
                
                loadedLessons++;
                totalWords += vocabWords.length;
                
                // به‌روزرسانی زنده آمار
                lessonsCount.textContent = loadedLessons;
                wordsCount.textContent = totalWords;
                activeLessons.textContent = `${loadedLessons} درس فعال`;
                
            } catch (error) {
                console.error(`❌ خطا در بارگذاری ${file.fileName}:`, error);
            }
        });
        
        await Promise.all(loadPromises);
        
        // نمایش نهایی
        container.innerHTML = lessonHTML;
        status.textContent = `✅ ${loadedLessons} درس با ${totalWords} کلمه بارگذاری شد`;
        lessonsCount.textContent = loadedLessons;
        wordsCount.textContent = totalWords;
        activeLessons.textContent = `${loadedLessons} درس فعال`;
        
        console.log(`🎉 ${loadedLessons} درس با موفقیت بارگذاری شدند`);
    }
}

// راه‌اندازی سیستم
document.addEventListener('DOMContentLoaded', () => {
    const loader = new LessonAutoLoader();
    
    // تأخیر برای نمایش انیمیشن‌ها
    setTimeout(() => loader.loadLessons(), 1000);
    
    // قابلیت رفرش دستی
    window.refreshLessons = () => loader.loadLessons();
});
