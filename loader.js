// loader.js
async function loadLessons() {
  const container = document.getElementById('lessons');
  if (!container) return;
  
  for (let i = 1; i <= 50; i++) {
    const fileName = `english_lesson_${i}.json`;
    
    try {
      const response = await fetch(fileName);
      if (!response.ok) continue;
      
      const data = await response.json();
      container.innerHTML += `
        <div style="border:1px solid #ddd; padding:15px; margin:10px; border-radius:5px;">
          <h3>${data.metadata.title}</h3>
          <p><strong>زیرعنوان:</strong> ${data.metadata.subtitle}</p>
          <p><strong>اهداف:</strong> ${data.metadata.learning_objectives.join(' • ')}</p>
        </div>
      `;
    } catch(e) {
      console.log(`فایل ${fileName} بارگذاری نشد`);
    }
  }
}

// اجرای خودکار پس از لود صفحه
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', loadLessons);
} else {
  loadLessons();
}
