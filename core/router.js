// core/router.js

import IRouter from './router-interface.js';
import EventBus from './event-bus.js';

/**
 * پیاده‌سازی سیستم مسیریابی برای PWA
 * @implements {IRouter}
 */
class Router extends IRouter {
  constructor(options = {}) {
    super();
    
    // پیکربندی
    this.options = {
      mode: 'hash', // 'hash' یا 'history'
      basePath: '',
      hashPrefix: '#',
      ...options
    };
    
    // ذخیره مسیرها
    this.routes = new Map();
    
    // تاریخچه
    this.history = [];
    this.historyIndex = -1;
    this.maxHistory = 50;
    
    // میدل‌ورها
    this.middlewares = {
      before: [],  // قبل از ناوبری
      after: []    // بعد از ناوبری
    };
    
    // Event Bus برای انتشار رویدادها
    this.eventBus = new EventBus();
    
    // وضعیت فعلی
    this.currentRoute = null;
    
    // bind کردن متدها
    this._handleHashChange = this._handleHashChange.bind(this);
    this._handlePopState = this._handlePopState.bind(this);
    
    // راه‌اندازی
    this._init();
  }
  
  /**
   * راه‌اندازی اولیه
   * @private
   */
  _init() {
    if (this.options.mode === 'hash') {
      window.addEventListener('hashchange', this._handleHashChange);
      this._processCurrentHash();
    } else {
      window.addEventListener('popstate', this._handlePopState);
      this._processCurrentPath();
    }
  }
  
  /**
   * افزودن مسیر جدید
   */
  async addRoute(path, component, options = {}) {
    // اعتبارسنجی مسیر
    this._validatePath(path);
    
    const route = {
      path,
      component,
      meta: options.meta || {},
      guards: options.guards || {},
      params: this._extractParams(path),
      regex: this._pathToRegex(path)
    };
    
    this.routes.set(path, route);
    
    // رویداد
    this.eventBus.publish('route:added', { path, route });
    
    console.log(`✅ Route added: ${path}`);
    return route;
  }
  
  /**
   * حذف مسیر
   */
  async removeRoute(path) {
    const existed = this.routes.delete(path);
    
    if (existed) {
      this.eventBus.publish('route:removed', { path });
      console.log(`🗑 Route removed: ${path}`);
    }
    
    return existed;
  }
  
  /**
   * دریافت اطلاعات مسیر
   */
  async getRoute(path) {
    // جستجوی مستقیم
    if (this.routes.has(path)) {
      return this.routes.get(path);
    }
    
    // جستجو با تطبیق پترن
    for (const route of this.routes.values()) {
      const match = this._matchRoute(route, path);
      if (match) {
        return {
          ...route,
          params: match.params,
          fullPath: match.fullPath
        };
      }
    }
    
    return null;
  }
  
  /**
   * ناوبری به مسیر جدید
   */
  async navigate(path, data = {}) {
    // اعتبارسنجی
    if (!path || typeof path !== 'string') {
      throw new Error('Invalid path provided');
    }
    
    // اجرای میدل‌ورهای قبل
    const beforeResult = await this._runMiddlewares('before', { path, data });
    if (beforeResult === false) {
      console.log('⏹ Navigation cancelled by middleware');
      return false;
    }
    
    // پیدا کردن مسیر
    const route = await this.getRoute(path);
    if (!route) {
      throw new Error(`Route not found: ${path}`);
    }
    
    // اجرای route guards
    if (route.guards.beforeEnter) {
      const guardResult = await this._runGuard(route.guards.beforeEnter, { route, data });
      if (guardResult === false) {
        console.log(`⏹ Navigation blocked by guard for: ${path}`);
        return false;
      }
    }
    
    // ذخیره در تاریخچه
    this._addToHistory(this.currentRoute);
    
    // ناوبری واقعی
    await this._performNavigation(route, data);
    
    // اجرای میدل‌ورهای بعد
    await this._runMiddlewares('after', { route, data });
    
    return true;
  }
  
  /**
   * جایگزینی مسیر فعلی (بدون اضافه به تاریخچه)
   */
  async replace(path, data = {}) {
    const route = await this.getRoute(path);
    if (!route) {
      throw new Error(`Route not found: ${path}`);
    }
    
    await this._performNavigation(route, data);
    return true;
  }
  
  /**
   * بازگشت به مسیر قبلی
   */
  async back() {
    if (this.historyIndex <= 0) {
      console.log('⚠️ No history to go back');
      return false;
    }
    
    this.historyIndex--;
    const previousRoute = this.history[this.historyIndex];
    
    if (previousRoute) {
      await this._performNavigation(previousRoute.route, previousRoute.data, true);
      return true;
    }
    
    return false;
  }
  
  /**
   * رفتن به مسیر بعدی
   */
  async forward() {
    if (this.historyIndex >= this.history.length - 1) {
      console.log('⚠️ No forward history');
      return false;
    }
    
    this.historyIndex++;
    const nextRoute = this.history[this.historyIndex];
    
    if (nextRoute) {
      await this._performNavigation(nextRoute.route, nextRoute.data, true);
      return true;
    }
    
    return false;
  }
  
  /**
   * دریافت مسیر فعلی
   */
  async getCurrentRoute() {
    return this.currentRoute;
  }
  
  /**
   * دریافت تاریخچه ناوبری
   */
  async getHistory() {
    return [...this.history];
  }
  
  /**
   * پاک کردن تاریخچه
   */
  async clearHistory() {
    this.history = [];
    this.historyIndex = -1;
    console.log('🧹 Navigation history cleared');
  }
  
  /**
   * افزودن میدل‌ور
   */
  async addMiddleware(middleware) {
    if (!middleware.type || !['before', 'after'].includes(middleware.type)) {
      throw new Error('Middleware must have type "before" or "after"');
    }
    
    if (typeof middleware.handler !== 'function') {
      throw new Error('Middleware must have a handler function');
    }
    
    this.middlewares[middleware.type].push(middleware.handler);
    console.log(`➕ ${middleware.type} middleware added`);
  }
  
  /**
   * حذف میدل‌ور
   */
  async removeMiddleware(middleware) {
    const type = middleware.type || 'before';
    const index = this.middlewares[type].indexOf(middleware.handler);
    
    if (index > -1) {
      this.middlewares[type].splice(index, 1);
      console.log(`➖ ${type} middleware removed`);
      return true;
    }
    
    return false;
  }
  
  /**
   * ثبت شنونده رویداد
   */
  async on(event, handler) {
    return this.eventBus.subscribe(event, handler);
  }
  
  /**
   * حذف شنونده رویداد
   */
  async off(event, handler) {
    return this.eventBus.unsubscribe(event, handler);
  }
  
  /**
   * اجرای ناوبری واقعی
   * @private
   */
  async _performNavigation(route, data = {}, fromHistory = false) {
    // آپدیت URL مرورگر
    await this._updateBrowserUrl(route.fullPath || route.path, fromHistory);
    
    // آپدیت وضعیت فعلی
    const previousRoute = this.currentRoute;
    this.currentRoute = {
      ...route,
      data,
      timestamp: new Date().toISOString(),
      previous: previousRoute ? { path: previousRoute.path, timestamp: previousRoute.timestamp } : null
    };
    
    // انتشار رویداد
    this.eventBus.publish('route:changed', {
      from: previousRoute,
      to: this.currentRoute,
      data
    });
    
    console.log(`📍 Navigated to: ${route.path}`, data);
  }
  
  /**
   * آپدیت URL مرورگر
   * @private
   */
  async _updateBrowserUrl(path, replace = false) {
    const fullPath = this.options.basePath + path;
    
    if (this.options.mode === 'hash') {
      const hash = this.options.hashPrefix + fullPath;
      if (replace) {
        window.location.replace(hash);
      } else {
        window.location.hash = hash;
      }
    } else {
      if (replace) {
        window.history.replaceState({}, '', fullPath);
      } else {
        window.history.pushState({}, '', fullPath);
      }
    }
  }
  
  /**
   * پردازش hash فعلی
   * @private
   */
  _processCurrentHash() {
    const hash = window.location.hash.replace(this.options.hashPrefix, '') || '/';
    this._navigateToPath(hash, {}, true);
  }
  
  /**
   * پردازش path فعلی
   * @private
   */
  _processCurrentPath() {
    const path = window.location.pathname.replace(this.options.basePath, '') || '/';
    this._navigateToPath(path, {}, true);
  }
  
  /**
   * هندلر تغییر hash
   * @private
   */
  _handleHashChange(event) {
    const newHash = window.location.hash.replace(this.options.hashPrefix, '') || '/';
    const oldHash = event.oldURL ? new URL(event.oldURL).hash.replace(this.options.hashPrefix, '') || '/' : '/';
    
    this._navigateToPath(newHash, { fromHashChange: true, oldHash });
  }
  
  /**
   * هندلر popstate
   * @private
   */
  _handlePopState(event) {
    const path = window.location.pathname.replace(this.options.basePath, '') || '/';
    this._navigateToPath(path, { fromPopState: true, state: event.state });
  }
  
  /**
   * ناوبری به مسیر
   * @private
   */
  async _navigateToPath(path, context = {}, initial = false) {
    try {
      const route = await this.getRoute(path);
      if (route) {
        if (!initial) {
          this._addToHistory(this.currentRoute);
        }
        await this._performNavigation(route, context, initial);
      } else {
        // مسیر پیدا نشد - خطای ۴۰۴
        this.eventBus.publish('route:notfound', { path, context });
        console.warn(`🚫 Route not found: ${path}`);
      }
    } catch (error) {
      this.eventBus.publish('route:error', { path, error, context });
      console.error(`❌ Navigation error for ${path}:`, error);
    }
  }
  
  /**
   * افزودن به تاریخچه
   * @private
   */
  _addToHistory(route) {
    if (!route) return;
    
    // حذف آینده اگر از وسط تاریخچه برگشتیم
    if (this.historyIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.historyIndex + 1);
    }
    
    // افزودن به تاریخچه
    this.history.push({
      route: {
        path: route.path,
        params: route.params,
        meta: route.meta
      },
      data: route.data,
      timestamp: new Date().toISOString()
    });
    
    // محدود کردن سایز تاریخچه
    if (this.history.length > this.maxHistory) {
      this.history.shift();
    }
    
    this.historyIndex = this.history.length - 1;
  }
  
  /**
   * اجرای میدل‌ورها
   * @private
   */
  async _runMiddlewares(type, context) {
    for (const middleware of this.middlewares[type]) {
      try {
        const result = await middleware(context);
        if (result === false) {
          return false;
        }
      } catch (error) {
        console.error(`Middleware error (${type}):`, error);
        this.eventBus.publish('middleware:error', { type, error, context });
      }
    }
    return true;
  }
  
  /**
   * اجرای route guard
   * @private
   */
  async _runGuard(guard, context) {
    try {
      return await guard(context);
    } catch (error) {
      console.error('Route guard error:', error);
      this.eventBus.publish('guard:error', { error, context });
      return false;
    }
  }
  
  /**
   * استخراج پارامترها از مسیر
   * @private
   */
  _extractParams(path) {
    const params = [];
    const segments = path.split('/');
    
    for (const segment of segments) {
      if (segment.startsWith(':')) {
        params.push(segment.substring(1));
      }
    }
    
    return params;
  }
  
  /**
   * تبدیل مسیر به regex
   * @private
   */
  _pathToRegex(path) {
    const pattern = path
      .replace(/:(\w+)/g, '(?<$1>[^/]+)')
      .replace(/\*/g, '.*');
    
    return new RegExp(`^${pattern}$`);
  }
  
  /**
   * تطبیق مسیر با pattern
   * @private
   */
  _matchRoute(route, path) {
    const match = path.match(route.regex);
    
    if (!match) return null;
    
    const params = {};
    if (route.params.length > 0) {
      route.params.forEach(param => {
        if (match.groups && match.groups[param]) {
          params[param] = match.groups[param];
        }
      });
    }
    
    return {
      params,
      fullPath: path
    };
  }
  
  /**
   * اعتبارسنجی مسیر
   * @private
   */
  _validatePath(path) {
    if (!path || typeof path !== 'string') {
      throw new Error('Route path must be a string');
    }
    
    if (!path.startsWith('/')) {
      throw new Error('Route path must start with "/"');
    }
    
    if (this.routes.has(path)) {
      throw new Error(`Route already exists: ${path}`);
    }
  }
  
  /**
   * تخریب (cleanup)
   */
  destroy() {
    if (this.options.mode === 'hash') {
      window.removeEventListener('hashchange', this._handleHashChange);
    } else {
      window.removeEventListener('popstate', this._handlePopState);
    }
    
    this.routes.clear();
    this.history = [];
    this.middlewares = { before: [], after: [] };
    
    console.log('🧹 Router destroyed');
  }
}

export default Router;
