/**
 * State Persistence - ذخیره و بازیابی وضعیت برنامه
 * اصول رعایت شده: SRP, DIP, KISS, DRY
 */

class StatePersistence {
  constructor(stateManager, options = {}) {
    this._stateManager = stateManager;
    this._options = {
      storageKey: 'vakamova_app_state',
      autoSave: true,
      saveDebounceMs: 1000,
      maxStateSizeMB: 5,
      ...options
    };
    
    this._saveTimeout = null;
    this._isInitialized = false;
    
    // حجم ذخیره‌سازی را بررسی می‌کنیم
    this._checkStorageAvailability();
  }

  /**
   * راه‌اندازی خودکار ذخیره‌سازی
   * اصل SRP: فقط ذخیره‌سازی، نه منطق دیگر
   */
  initialize() {
    if (this._isInitialized) return;
    
    // بارگذاری وضعیت ذخیره شده
    this.loadState();
    
    // گوش دادن به تغییرات State برای ذخیره خودکار
    if (this._options.autoSave) {
      this._setupAutoSave();
    }
    
    // ذخیره وضعیت قبل از بسته شدن صفحه
    window.addEventListener('beforeunload', () => {
      this.saveStateImmediately();
    });
    
    this._isInitialized = true;
    return true;
  }

  /**
   * تنظیم ذخیره خودکار با تاخیر
   */
  _setupAutoSave() {
    const unsubscribe = this._stateManager.subscribe(() => {
      this._debouncedSave();
    });
    
    // تابع لغو اشتراک را نگه می‌داریم
    this._unsubscribeAutoSave = unsubscribe;
  }

  /**
   * ذخیره با تاخیر (برای عملکرد بهتر)
   */
  _debouncedSave() {
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
    }
    
    this._saveTimeout = setTimeout(() => {
      this.saveStateImmediately();
    }, this._options.saveDebounceMs);
  }

  /**
   * ذخیره فوری وضعیت
   */
  saveStateImmediately() {
    try {
      const state = this._stateManager.getState();
      
      // حذف داده‌های موقت از State قبل از ذخیره
      const stateToSave = this._prepareStateForSave(state);
      
      // فشرده سازی اگر حجم زیاد شد
      const processedState = this._compressStateIfNeeded(stateToSave);
      
      // ذخیره در localStorage
      localStorage.setItem(
        this._options.storageKey,
        JSON.stringify(processedState)
      );
      
      // ذخیره بک‌آپ نسخه قبلی
      this._createBackup(stateToSave);
      
      this._logSaveOperation('success', stateToSave);
      return true;
      
    } catch (error) {
      this._logSaveOperation('error', null, error.message);
      return false;
    }
  }

  /**
   * آماده‌سازی State برای ذخیره
   * اصل DIP: وابسته به ساختار StateManager
   */
  _prepareStateForSave(state) {
    // کپی از State می‌گیریم
    const stateCopy = JSON.parse(JSON.stringify(state));
    
    // حذف داده‌های موقت که نباید ذخیره شوند
    delete stateCopy.ui?.isLoading;
    delete stateCopy._lastUpdated;
    
    // اضافه کردن متادیتای ذخیره
    stateCopy._persistedAt = new Date().toISOString();
    stateCopy._persistedVersion = stateCopy._version || 0;
    
    return stateCopy;
  }

  /**
   * بارگذاری وضعیت ذخیره شده
   */
  loadState() {
    try {
      const savedData = localStorage.getItem(this._options.storageKey);
      
      if (!savedData) {
        this._logLoadOperation('no_data');
        return null;
      }
      
      const parsedState = JSON.parse(savedData);
      
      // بررسی سلامت داده‌های بارگذاری شده
      if (!this._validateLoadedState(parsedState)) {
        this._logLoadOperation('invalid_data');
        this._attemptRecovery();
        return null;
      }
      
      // بازیابی اگر فشرده شده بود
      const restoredState = this._decompressStateIfNeeded(parsedState);
      
      // اعمال State بارگذاری شده
      this._applyLoadedState(restoredState);
      
      this._logLoadOperation('success', restoredState);
      return restoredState;
      
    } catch (error) {
      this._logLoadOperation('error', null, error.message);
      this._attemptRecovery();
      return null;
    }
  }

  /**
   * اعمال State بارگذاری شده به State Manager
   */
  _applyLoadedState(loadedState) {
    if (!loadedState || typeof loadedState !== 'object') {
      return;
    }
    
    // کاربر
    if (loadedState.user) {
      this._stateManager.dispatch({
        type: 'USER_LOGIN',
        payload: loadedState.user
      });
    }
    
    // دروس
    if (loadedState.lessons && typeof loadedState.lessons === 'object') {
      Object.values(loadedState.lessons).forEach(lesson => {
        this._stateManager.dispatch({
          type: 'LESSON_LOADED',
          payload: lesson
        });
      });
    }
    
    // پیشرفت
    if (loadedState.progress && typeof loadedState.progress === 'object') {
      Object.entries(loadedState.progress).forEach(([lessonId, progress]) => {
        if (progress.completed) {
          this._stateManager.dispatch({
            type: 'LESSON_COMPLETED',
            payload: {
              lessonId,
              score: progress.score || 0
            }
          });
        }
      });
    }
  }

  /**
   * اعتبارسنجی State بارگذاری شده
   */
  _validateLoadedState(state) {
    if (!state || typeof state !== 'object') {
      return false;
    }
    
    // بررسی نسخه
    if (state._version && typeof state._version !== 'number') {
      return false;
    }
    
    // بررسی ساختار کاربر
    if (state.user) {
      if (typeof state.user !== 'object') return false;
      if (state.user.email && typeof state.user.email !== 'string') return false;
    }
    
    // بررسی ساختار دروس
    if (state.lessons && typeof state.lessons !== 'object') {
      return false;
    }
    
    return true;
  }

  /**
   * تلاش برای بازیابی از بک‌آپ
   */
  _attemptRecovery() {
    try {
      const backupKey = `${this._options.storageKey}_backup`;
      const backupData = localStorage.getItem(backupKey);
      
      if (backupData) {
        const backupState = JSON.parse(backupData);
        
        if (this._validateLoadedState(backupState)) {
          localStorage.setItem(this._options.storageKey, backupData);
          this.loadState(); // تلاش مجدد
          this._logRecovery('backup_restored');
          return true;
        }
      }
    } catch (error) {
      // در صورت خطا، وضعیت خالی شروع می‌کنیم
      this._logRecovery('recovery_failed', error.message);
    }
    
    return false;
  }

  /**
   * ایجاد بک‌آپ از State
   */
  _createBackup(state) {
    try {
      const backupKey = `${this._options.storageKey}_backup`;
      const currentBackup = localStorage.getItem(backupKey);
      
      // فقط اگر State تغییر کرده، بک‌آپ می‌گیریم
      if (!currentBackup || currentBackup !== JSON.stringify(state)) {
        localStorage.setItem(backupKey, JSON.stringify(state));
      }
    } catch (error) {
      // بک‌آپ اختیاری است، خطا را نادیده می‌گیریم
    }
  }

  /**
   * فشرده‌سازی State اگر حجم زیاد شد
   */
  _compressStateIfNeeded(state) {
    const stateString = JSON.stringify(state);
    const sizeMB = (new TextEncoder().encode(stateString).length) / (1024 * 1024);
    
    if (sizeMB > this._options.maxStateSizeMB) {
      // حذف داده‌های قدیمی
      const compressed = { ...state };
      
      // حذف لاگ‌های قدیمی
      if (compressed._logs && Array.isArray(compressed._logs)) {
        compressed._logs = compressed._logs.slice(-20); // ۲۰ لاگ آخر
      }
      
      // حذف داده‌های موقت
      delete compressed._temp;
      delete compressed._cache;
      
      this._logCompression('compressed', sizeMB);
      return compressed;
    }
    
    return state;
  }

  /**
   * بازیابی State فشرده
   */
  _decompressStateIfNeeded(state) {
    // اگر در آینده الگوریتم فشرده‌سازی پیچیده‌تری اضافه کنیم
    // اینجا آن را مدیریت می‌کنیم
    return state;
  }

  /**
   * بررسی دسترسی به localStorage
   */
  _checkStorageAvailability() {
    try {
      const testKey = '__vakamova_test__';
      localStorage.setItem(testKey, 'test');
      localStorage.removeItem(testKey);
      this._storageAvailable = true;
    } catch (error) {
      this._storageAvailable = false;
      console.warn('LocalStorage not available. State will not be persisted.');
    }
  }

  /**
   * پاک‌سازی State ذخیره شده
   */
  clearPersistedState() {
    try {
      localStorage.removeItem(this._options.storageKey);
      localStorage.removeItem(`${this._options.storageKey}_backup`);
      this._logClearOperation('success');
      return true;
    } catch (error) {
      this._logClearOperation('error', error.message);
      return false;
    }
  }

  /**
   * دریافت اطلاعات وضعیت ذخیره‌سازی
   */
  getStorageInfo() {
    try {
      const data = localStorage.getItem(this._options.storageKey);
      const backup = localStorage.getItem(`${this._options.storageKey}_backup`);
      
      return {
        hasData: !!data,
        hasBackup: !!backup,
        dataSize: data ? (new Blob([data]).size / 1024).toFixed(2) + ' KB' : '0 KB',
        lastPersisted: data ? new Date(JSON.parse(data)._persistedAt || 0).toLocaleString() : 'Never',
        storageAvailable: this._storageAvailable
      };
    } catch (error) {
      return {
        hasData: false,
        hasBackup: false,
        dataSize: '0 KB',
        lastPersisted: 'Never',
        storageAvailable: false,
        error: error.message
      };
    }
  }

  /**
   * لاگ عملیات ذخیره
   */
  _logSaveOperation(status, state, error = null) {
    const logEntry = {
      type: 'save',
      status,
      timestamp: new Date().toISOString(),
      stateVersion: state?._version,
      error
    };
    
    this._storeLog(logEntry);
  }

  /**
   * لاگ عملیات بارگذاری
   */
  _logLoadOperation(status, state = null, error = null) {
    const logEntry = {
      type: 'load',
      status,
      timestamp: new Date().toISOString(),
      stateVersion: state?._version,
      error
    };
    
    this._storeLog(logEntry);
  }

  /**
   * لاگ بازیابی
   */
  _logRecovery(status, error = null) {
    const logEntry = {
      type: 'recovery',
      status,
      timestamp: new Date().toISOString(),
      error
    };
    
    this._storeLog(logEntry);
  }

  /**
   * لاگ فشرده‌سازی
   */
  _logCompression(status, sizeMB) {
    const logEntry = {
      type: 'compression',
      status,
      timestamp: new Date().toISOString(),
      sizeMB: sizeMB.toFixed(2)
    };
    
    this._storeLog(logEntry);
  }

  /**
   * لاگ پاک‌سازی
   */
  _logClearOperation(status, error = null) {
    const logEntry = {
      type: 'clear',
      status,
      timestamp: new Date().toISOString(),
      error
    };
    
    this._storeLog(logEntry);
  }

  /**
   * ذخیره لاگ در localStorage
   */
  _storeLog(logEntry) {
    try {
      const logsKey = 'vakamova_persistence_logs';
      const existingLogs = JSON.parse(localStorage.getItem(logsKey) || '[]');
      
      existingLogs.push(logEntry);
      // نگه‌داری فقط ۱۰۰ لاگ آخر
      const trimmedLogs = existingLogs.slice(-100);
      
      localStorage.setItem(logsKey, JSON.stringify(trimmedLogs));
    } catch (error) {
      // اگر خطا در ذخیره لاگ اتفاق افتاد، نادیده می‌گیریم
    }
  }

  /**
   * غیرفعال کردن ذخیره‌سازی
   */
  disable() {
    if (this._unsubscribeAutoSave) {
      this._unsubscribeAutoSave();
      this._unsubscribeAutoSave = null;
    }
    
    if (this._saveTimeout) {
      clearTimeout(this._saveTimeout);
      this._saveTimeout = null;
    }
    
    this._isInitialized = false;
  }
}

// ایجاد و export نمونه اصلی
let persistenceInstance = null;

export function createStatePersistence(stateManager, options) {
  if (!persistenceInstance) {
    persistenceInstance = new StatePersistence(stateManager, options);
  }
  return persistenceInstance;
}

export function getStatePersistence() {
  if (!persistenceInstance) {
    throw new Error('State Persistence not initialized. Call createStatePersistence first.');
  }
  return persistenceInstance;
}

// Helper function برای استفاده آسان
export function initializeStatePersistence(stateManager, options) {
  const persistence = createStatePersistence(stateManager, options);
  return persistence.initialize();
  }
