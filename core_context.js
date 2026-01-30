// ==================== DEPENDENCY INJECTION CONTEXT ====================
const services = new Map();

export const context = {
    // ثبت سرویس
    register(name, service) {
        services.set(name, service);
        console.log(`[Context] ✅ Registered: ${name}`);
        return this;
    },
    
    // دریافت سرویس
    get(name) {
        const service = services.get(name);
        if (!service) {
            console.warn(`[Context] ⚠️ Service not found: ${name}`);
        }
        return service;
    },
    
    // تزریق وابستگی‌ها به یک کلاس
    inject(dependencies) {
        const injected = {};
        dependencies.forEach(dep => {
            injected[dep] = this.get(dep);
        });
        return injected;
    },
    
    // بررسی وجود سرویس
    has(name) {
        return services.has(name);
    },
    
    // حذف سرویس
    remove(name) {
        return services.delete(name);
    }
};

// ثبت خود context
context.register('context', context);

console.log('[Context] ✅ Dependency context initialized');
