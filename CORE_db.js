class AppDatabase {
    constructor(dbName = 'HyperLangDB', version = 3) {
        this.dbName = dbName;
        this.db = null;
        
        this.STORES = {
            USERS: 'users',
            PROGRESS: 'user_progress',
            LESSONS: 'lessons_cache',
            SETTINGS: 'app_settings'
        };
    }
    
    async init() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, 3);
            
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                
                // ساخت جدول‌ها با کلیدهای مرکب
                if(!db.objectStoreNames.contains(this.STORES.PROGRESS)) {
                    const store = db.createObjectStore(this.STORES.PROGRESS, { 
                        keyPath: ['userId', 'lessonId', 'exerciseId']
                    });
                    store.createIndex('by_user_lesson', ['userId', 'lessonId']);
                }
                
                // سایر جدول‌ها...
            };
            
            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve(this);
            };
            
            request.onerror = (event) => reject(event.target.error);
        });
    }
    
    // متدهای پیشرفته CRUD با تراکنش
    async saveUserProgress(userId, lessonId, data) {
        const transaction = this.db.transaction([this.STORES.PROGRESS], 'readwrite');
        const store = transaction.objectStore(this.STORES.PROGRESS);
        
        return new Promise((resolve, reject) => {
            const request = store.put({
                userId, 
                lessonId,
                exerciseId: data.exerciseId,
                score: data.score,
                completedAt: new Date().toISOString(),
                metadata: JSON.stringify(data.metadata || {})
            });
            
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    }
}
