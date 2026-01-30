// ==================== EVENT BUS ====================
const listeners = new Map();

export const eventBus = {
    // ثبت listener برای یک event
    on(eventName, callback) {
        if (!listeners.has(eventName)) {
            listeners.set(eventName, []);
        }
        listeners.get(eventName).push(callback);
        
        console.log(`[EventBus] 👂 Listener added for: ${eventName}`);
        return () => this.off(eventName, callback); // تابع unsubscribe برمی‌گرداند
    },
    
    // حذف listener
    off(eventName, callback) {
        const eventListeners = listeners.get(eventName);
        if (eventListeners) {
            const index = eventListeners.indexOf(callback);
            if (index > -1) {
                eventListeners.splice(index, 1);
                console.log(`[EventBus] 🗑️ Listener removed for: ${eventName}`);
            }
        }
    },
    
    // ارسال event
    emit(eventName, data = {}) {
        const eventListeners = listeners.get(eventName);
        if (eventListeners) {
            console.log(`[EventBus] 📢 Emitting: ${eventName}`, data);
            eventListeners.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`[EventBus] ❌ Error in ${eventName} listener:`, error);
                }
            });
        } else {
            console.log(`[EventBus] 📭 No listeners for: ${eventName}`);
        }
    },
    
    // ارسال event فقط یک بار
    once(eventName, callback) {
        const onceWrapper = (data) => {
            this.off(eventName, onceWrapper);
            callback(data);
        };
        this.on(eventName, onceWrapper);
    },
    
    // پاک کردن همه listeners یک event
    clear(eventName) {
        if (eventName) {
            listeners.delete(eventName);
            console.log(`[EventBus] 🧹 Cleared all listeners for: ${eventName}`);
        } else {
            listeners.clear();
            console.log('[EventBus] 🧹 Cleared all listeners');
        }
    },
    
    // دریافت تعداد listeners یک event
    listenerCount(eventName) {
        return listeners.get(eventName)?.length || 0;
    }
};

console.log('[EventBus] ✅ Event system initialized');
