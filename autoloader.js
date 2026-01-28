// سیستم ساده و مطمئن بارگذری خودکار
async function smartLoadLessons() {
    const container = document.getElementById('lessonsContainer');
    const status = document.getElementById('lessons-status');
    const lessonsCount = document.getElementById('lessons-count');
    const wordsCount = document.getElementById('words-count');
    
    container.innerHTML = '<div class="loading">🔍 در حال پیدا کردن درس‌ها...</div>';
    
    let found = 0;
    let words = 0;
    let html = '';
    
    // جستجوی ۱ تا ۱۰
    for (let i = 1; i <= 10; i++) {
        try {
            const file = `english_lesson_${i}.json`;
            const response = await fetch(file);
            if (!response.ok) continue;
            
            const data = await response.json();
            found++;
            
            // استخراج واژگان از هر ساختار ممکن
            let vocab = [];
            if (data.content && data.content.vocabulary && data.content.vocabulary.words) {
                vocab = data.content.vocabulary.words;
            } else if (data.vocabulary) {
                vocab = Array.isArray(data.vocabulary) ? data.vocabulary : data.vocabulary.words || [];
            }
            
            // ساخت کارت درس
            html += `
                <div class="lesson-card" style="animation-delay: ${found * 0.1}s">
                    <h3>📘 ${data.metadata.title}</h3>
                    <p class="subtitle">${data.metadata.subtitle}</p>
                    
                    <div class="objectives">
                        ${(data.metadata.learning_objectives || []).map(obj => 
                            `<span class="objective">${obj}</span>`
                        ).join('')}
                    </div>
                    
                    ${vocab.length > 0 ? `
                        <div class="vocabulary-preview">
                            <h4>📝 ${vocab.length} واژه:</h4>
                            ${vocab.slice(0, 4).map(word => `
                                <div class="word-item">
                                    <span class="english-word">${word.english || word.word}</span>
                                    <span class="farsi-word">${word.farsi || word.translation}</span>
                                </div>
                            `).join('')}
                        </div>
                    ` : ''}
                </div>
            `;
            
            words += vocab.length;
            
        } catch (e) {
            console.log(`درس ${i} خطا:`, e.message);
        }
    }
    
    // نمایش
    container.innerHTML = html || '<div>هیچ درسی پیدا نشد</div>';
    status.textContent = found ? `✅ ${found} درس پیدا شد` : '❌ درسی پیدا نشد';
    lessonsCount.textContent = found;
    wordsCount.textContent = words;
    document.getElementById('active-lessons').textContent = `${found} درس فعال`;
}

// اجرا
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(smartLoadLessons, 800);
});
