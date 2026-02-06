/**
 * State Manager Core - مدیریت مرکزی وضعیت برنامه
 * اصول رعایت شده: SRP, OCP, DIP, KISS
 */

class VakamovaStateManager {
  constructor(initialState = {}) {
    // وضعیت فعلی برنامه
    this._state = initialState;
    
    // لیست شنودکننده‌های تغییرات state
    this._listeners = new Set();
    
    // میدلورها برای گسترش قابلیت‌ها
    this._middlewares = [];
    
    // فلاگ برای حالت توسعه
    this._isDevelopment = true;
  }

  /**
   * دریافت وضعیت فعلی
   * اصل DIP: برگرداندن کپی برای جلوگیری از تغییر مستقیم
   */
  getState() {
    return JSON.parse(JSON.stringify(this._state));
  }

  /**
   * تغییر وضعیت با action
   * اصل SRP: فقط یک وظیفه - تغییر state
   */
  dispatch(action) {
    if (!action || typeof action !== 'object' || !action.type) {
      throw new Error('Action must be an object with type property');
    }

    // اجرای میدلورها قبل از تغییر state
    let processedAction = action;
    for (const middleware of this._middlewares) {
      processedAction = middleware(processedAction, this.getState.bind(this));
      if (!processedAction) break;
    }

    if (!processedAction) return;

    // اعمال تغییرات بر اساس نوع action
    const prevState = this.getState();
    const nextState = this._reduce(prevState, processedAction);

    // اعتبارسنجی تغییرات
    if (this._validateStateTransition(prevState, nextState)) {
      this._state = nextState;
      
      // اطلاع‌رسانی به همه شنودکننده‌ها
      this._notifyListeners();
      
      // لاگ در حالت توسعه
      if (this._isDevelopment) {
        this._logStateChange(action.type, prevState, nextState);
      }
    }
  }

  /**
   * تابع reducer اصلی - تغییر state بر اساس action
   * اصل OCP: قابل گسترش بدون تغییر کد اصلی
   */
  _reduce(state, action) {
    const newState = { ...state };
    
    switch (action.type) {
      // مدیریت کاربر
      case 'USER_LOGIN':
        newState.user = action.payload;
        newState.user.lastLogin = new Date().toISOString();
        break;
        
      case 'USER_LOGOUT':
        newState.user = null;
        break;
        
      case 'USER_UPDATE':
        newState.user = { ...newState.user, ...action.payload };
        break;
        
      // مدیریت دروس
      case 'LESSON_LOADED':
        newState.lessons = {
          ...newState.lessons,
          [action.payload.id]: action.payload
        };
        break;
        
      case 'LESSON_COMPLETED':
        if (!newState.progress) newState.progress = {};
        newState.progress[action.payload.lessonId] = {
          completed: true,
          score: action.payload.score,
          completedAt: new Date().toISOString()
        };
        break;
        
      // UI State
      case 'UI_LOADING_START':
        newState.ui = { ...newState.ui, isLoading: true };
        break;
        
      case 'UI_LOADING_END':
        newState.ui = { ...newState.ui, isLoading: false };
        break;
        
      default:
        // برای actionهای نامعلوم، state را تغییر نمی‌دهیم
        console.warn(`Unknown action type: ${action.type}`);
        return state;
    }
    
    // افزودن timestamp به همه تغییرات
    newState._lastUpdated = new Date().toISOString();
    newState._version = (newState._version || 0) + 1;
    
    return newState;
  }

  /**
   * ثبت شنودکننده برای تغییرات state
   */
  subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new Error('Listener must be a function');
    }
    
    this._listeners.add(listener);
    
    // تابع لغو اشتراک
    return () => {
      this._listeners.delete(listener);
    };
  }

  /**
   * ثبت میدلور جدید
   */
  use(middleware) {
    if (typeof middleware !== 'function') {
      throw new Error('Middleware must be a function');
    }
    
    this._middlewares.push(middleware);
  }

  /**
   * اعتبارسنجی انتقال state
   */
  _validateStateTransition(prevState, nextState) {
    // بررسی ساختار اصلی
    if (!nextState || typeof nextState !== 'object') {
      console.error('Invalid state: must be an object');
      return false;
    }
    
    // می‌توانید قوانین اعتبارسنجی خاص خود را اضافه کنید
    // مثلاً: کاربر باید دارای ایمیل معتبر باشد
    if (nextState.user && nextState.user.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(nextState.user.email)) {
        console.error('Invalid email in user state');
        return false;
      }
    }
    
    return true;
  }

  /**
   * لاگ تغییرات state (فقط در حالت توسعه)
   */
  _logStateChange(actionType, prevState, nextState) {
    // ساختار لاگ تمیز و خوانا
    const logEntry = {
      timestamp: new Date().toISOString(),
      action: actionType,
      changes: this._findChanges(prevState, nextState),
      nextState: nextState
    };
    
    // ذخیره در localStorage برای مشاهده در مرورگر
    try {
      const logs = JSON.parse(localStorage.getItem('vakamova_state_logs') || '[]');
      logs.unshift(logEntry);
      // نگه‌داری فقط ۵۰ لاگ آخر
      localStorage.setItem('vakamova_state_logs', JSON.stringify(logs.slice(0, 50)));
    } catch (e) {
      // در صورت خطا در localStorage، لاگ نکن
    }
  }

  /**
   * پیدا کردن تغییرات بین دو state
   */
  _findChanges(prev, next) {
    const changes = {};
    
    const checkObject = (obj1, obj2, path = '') => {
      const allKeys = new Set([...Object.keys(obj1 || {}), ...Object.keys(obj2 || {})]);
      
      for (const key of allKeys) {
        const currentPath = path ? `${path}.${key}` : key;
        const val1 = obj1 ? obj1[key] : undefined;
        const val2 = obj2 ? obj2[key] : undefined;
        
        if (val1 !== val2) {
          if (typeof val1 === 'object' && typeof val2 === 'object') {
            checkObject(val1, val2, currentPath);
          } else {
            changes[currentPath] = {
              from: val1,
              to: val2
            };
          }
        }
      }
    };
    
    checkObject(prev, next);
    return changes;
  }

  /**
   * اطلاع‌رسانی به شنودکننده‌ها
   */
  _notifyListeners() {
    const currentState = this.getState();
    this._listeners.forEach(listener => {
      try {
        listener(currentState);
      } catch (error) {
        console.error('State listener error:', error);
      }
    });
  }

  /**
   * تنظیم حالت توسعه
   */
  setDevelopmentMode(isDev) {
    this._isDevelopment = isDev;
  }
}

// ایجاد نمونه واحد (Singleton) از State Manager
let stateManagerInstance = null;

export function createStateManager(initialState = {}) {
  if (!stateManagerInstance) {
    stateManagerInstance = new VakamovaStateManager(initialState);
  }
  return stateManagerInstance;
}

export function getStateManager() {
  if (!stateManagerInstance) {
    throw new Error('State Manager not initialized. Call createStateManager first.');
  }
  return stateManagerInstance;
}

// Action Creators - توابع کمکی برای ساخت action
export const ActionCreators = {
  loginUser: (userData) => ({
    type: 'USER_LOGIN',
    payload: userData
  }),
  
  logoutUser: () => ({
    type: 'USER_LOGOUT'
  }),
  
  updateUser: (updates) => ({
    type: 'USER_UPDATE',
    payload: updates
  }),
  
  loadLesson: (lesson) => ({
    type: 'LESSON_LOADED',
    payload: lesson
  }),
  
  completeLesson: (lessonId, score) => ({
    type: 'LESSON_COMPLETED',
    payload: { lessonId, score }
  }),
  
  startLoading: () => ({
    type: 'UI_LOADING_START'
  }),
  
  endLoading: () => ({
    type: 'UI_LOADING_END'
  })
};
