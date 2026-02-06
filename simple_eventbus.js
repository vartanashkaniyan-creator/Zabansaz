// ==================== SIMPLE EVENTBUS ====================
// نسخه ساده و کارآمد برای شروع پروژه Vakamova

class SimpleEventBus {
    constructor() {
        this._events = new Map();
        console.log('✅ SimpleEventBus ساخته شد - پروژه Vakamova');
    }
    
    // ثبت listener
    on(eventName, listener) {
        this._validateEventName(eventName);
        this._validateListener(listener);
        
        if (!this._events.has(eventName)) {
            this._events.set(eventName, []);
        }
        
        this._events.get(eventName).push({
            listener,
            once: false
        });
        
        // بازگرداندن تابع unsubscribe
        return () => this.off(eventName, listener);
    }
    
    // ثبت listener یکبار مصرف
    once(eventName, listener) {
        this._validateEventName(eventName);
        this._validateListener(listener);
        
        if (!this._events.has(eventName)) {
            this._events.set(eventName, []);
        }
        
        this._events.get(eventName).push({
            listener,
            once: true
        });
        
        return () => this.off(eventName, listener);
    }
    
    // حذف listener
    off(eventName, listenerToRemove) {
        if (!this._events.has(eventName)) return false;
        
        const listeners = this._events.get(eventName);
        const initialLength = listeners.length;
        
        // فیلتر کردن listener مورد نظر
        const newListeners = [];
        for (const item of listeners) {
            if (item.listener !== listenerToRemove) {
                newListeners.push(item);
            }
        }
        
        if (newListeners.length > 0) {
            this._events.set(eventName, newListeners);
        } else {
            this._events.delete(eventName);
        }
        
        return listeners.length !== initialLength;
    }
    
    // ارسال event
    emit(eventName, data = null) {
        this._validateEventName(eventName);
        
        if (!this._events.has(eventName)) {
            return { 
                success: true, 
                listenersTriggered: 0,
                message: 'هیچ listenerی ثبت نشده'
            };
        }
        
        const listeners = this._events.get(eventName);
        const results = [];
        let triggered = 0;
        
        // اجرای listeners
        const remainingListeners = [];
        for (const item of listeners) {
            try {
                const result = item.listener(data);
                results.push(result);
                triggered++;
                
                // اگر once نبود، نگه دار
                if (!item.once) {
                    remainingListeners.push(item);
                }
            } catch (error) {
                console.error(`خطا در listener رویداد "${eventName}":`, error);
                // اگر once نبود، نگه دار حتی با خطا
                if (!item.once) {
                    remainingListeners.push(item);
                }
            }
        }
        
        // بروزرسانی listeners
        if (remainingListeners.length > 0) {
            this._events.set(eventName, remainingListeners);
        } else {
            this._events.delete(eventName);
        }
        
        return {
            success: true,
            listenersTriggered: triggered,
            results: results
        };
    }
    
    // پاک کردن events
    clear(eventName = null) {
        if (eventName) {
            this._events.delete(eventName);
            return true;
        } else {
            this._events.clear();
            return true;
        }
    }
    
    // تعداد listeners
    getListenerCount(eventName = null) {
        if (eventName) {
            return this._events.has(eventName) ? this._events.get(eventName).length : 0;
        }
        
        let total = 0;
        for (const listeners of this._events.values()) {
            total += listeners.length;
        }
        return total;
    }
    
    // دریافت نام تمام events
    getEventNames() {
        return Array.from(this._events.keys());
    }
    
    // ==================== PRIVATE METHODS ====================
    
    _validateEventName(eventName) {
        if (typeof eventName !== 'string' || eventName.trim() === '') {
            throw new Error('نام رویداد باید رشته غیرخالی باشد');
        }
    }
    
    _validateListener(listener) {
        if (typeof listener !== 'function') {
            throw new Error('Listener باید تابع باشد');
        }
    }
}

// ==================== GLOBAL INSTANCE ====================

// ساخت نمونه اصلی
const simpleEventBus = new SimpleEventBus();

// در دسترس قرار دادن
window.SimpleEventBus = SimpleEventBus;
window.simpleEventBus = simpleEventBus;

console.log('🎯 SimpleEventBus آماده استفاده در Vakamova!');
console.log('📦 نمونه global: simpleEventBus');
console.log('📦 کلاس: SimpleEventBus');
