/**
 * STATE OPTIMIZER MODULE - HyperLang Professional
 * 4 Architectural Principles Implementation:
 * 1. Dependency Injection
 * 2. Interface/Contract
 * 3. Event-Driven Communication
 * 4. Centralized Configuration
 */

// ==================== PRINCIPLE 2: INTERFACE/CONTRACT ====================
export const STATE_OPTIMIZER_CONTRACT = {
    name: 'state-optimizer',
    version: '2.0.0',
    dependencies: ['eventBus', 'config', 'logger', 'database'],
    init: 'async function',
    cleanup: 'function',
    methods: {
        optimize: 'async function',
        deduplicate: 'function',
        compress: 'async function',
        decompress: 'async function',
        normalize: 'function',
        calculateSavings: 'function',
        getMetrics: 'function',
        clearCache: 'function'
    },
    events: {
        emits: [
            'optimizer:initialized',
            'optimizer:optimizationStarted',
            'optimizer:optimizationCompleted',
            'optimizer:cacheHit',
            'optimizer:error'
        ],
        listens: [
            'state:change',
            'optimizer:optimizeRequest',
            'optimizer:clearCache'
        ]
    }
};

// ==================== PRINCIPLE 4: CENTRALIZED CONFIG ====================
const OPTIMIZER_CONFIG = {
    strategies: {
        aggressive: {
            compressStrings: true,
            deduplicate: true,
            removeNull: true,
            removeUndefined: true,
            normalizeNumbers: true,
            transformDates: true,
            maxDepth: 20
        },
        balanced: {
            compressStrings: true,
            deduplicate: true,
            removeNull: true,
            removeUndefined: false,
            normalizeNumbers: true,
            transformDates: false,
            maxDepth: 10
        },
        conservative: {
            compressStrings: false,
            deduplicate: false,
            removeNull: false,
            removeUndefined: false,
            normalizeNumbers: false,
            transformDates: false,
            maxDepth: 5
        }
    },
    cache: {
        enabled: true,
        maxSize: 1000,
        ttl: 3600000
    },
    performance: {
        timeout: 5000,
        maxOperations: 100
    }
};

// ==================== CORE MODULE ====================
export class StateOptimizer {
    // ==================== PRINCIPLE 1: DEPENDENCY INJECTION ====================
    constructor(dependencies) {
        // Validate required dependencies
        this.#validateDependencies(dependencies);
        
        // Inject dependencies
        this.deps = {
            eventBus: dependencies.eventBus,
            config: dependencies.config,
            logger: dependencies.logger,
            database: dependencies.database
        };
        
        // Internal state
        this.#state = {
            initialized: false,
            cache: new Map(),
            metrics: {
                optimizations: 0,
                totalSavings: 0,
                cacheHits: 0,
                failures: 0
            }
        };
        
        // Apply configuration
        this.#applyConfig();
        
        // Setup event listeners
        this.#setupEventListeners();
        
        this.deps.logger.info('StateOptimizer instance created with DI');
    }
    
    // ==================== INITIALIZATION ====================
    async init() {
        if (this.#state.initialized) {
            this.deps.logger.warn('StateOptimizer already initialized');
            return this;
        }
        
        try {
            // Load cache from storage
            await this.#loadCache();
            
            // Start monitoring
            this.#startMonitoring();
            
            this.#state.initialized = true;
            
            // ==================== PRINCIPLE 3: EVENT-DRIVEN COMMUNICATION ====================
            this.deps.eventBus.emit('optimizer:initialized', {
                timestamp: Date.now(),
                cacheSize: this.#state.cache.size
            });
            
            this.deps.logger.info('StateOptimizer initialized successfully');
            return this;
            
        } catch (error) {
            this.deps.eventBus.emit('optimizer:error', {
                type: 'initialization',
                error: error.message
            });
            throw error;
        }
    }
    
    // ==================== CORE METHODS ====================
    async optimize(state, options = {}) {
        this.#validateState(state);
        
        const operationId = this.#generateOperationId();
        const startTime = performance.now();
        
        // ==================== PRINCIPLE 3: EVENT-DRIVEN COMMUNICATION ====================
        this.deps.eventBus.emit('optimizer:optimizationStarted', {
            operationId,
            strategy: options.strategy || 'balanced',
            stateSize: JSON.stringify(state).length
        });
        
        try {
            // Check cache first
            const cacheKey = this.#generateCacheKey(state, options);
            if (this.#config.cache.enabled) {
                const cached = this.#state.cache.get(cacheKey);
                if (cached && !this.#isCacheExpired(cached)) {
                    this.#state.metrics.cacheHits++;
                    this.deps.eventBus.emit('optimizer:cacheHit', {
                        operationId,
                        cacheKey
                    });
                    return cached.result;
                }
            }
            
            // Apply optimization strategy
            const strategy = options.strategy || 'balanced';
            const optimized = await this.#applyOptimizationStrategy(state, strategy, options);
            
            // Calculate savings
            const originalSize = JSON.stringify(state).length;
            const optimizedSize = JSON.stringify(optimized).length;
            const savings = originalSize - optimizedSize;
            
            // Update metrics
            this.#state.metrics.optimizations++;
            this.#state.metrics.totalSavings += savings;
            
            // Cache result
            if (this.#config.cache.enabled) {
                this.#state.cache.set(cacheKey, {
                    result: optimized,
                    timestamp: Date.now(),
                    strategy,
                    savings
                });
                this.#cleanupCache();
            }
            
            const endTime = performance.now();
            
            // ==================== PRINCIPLE 3: EVENT-DRIVEN COMMUNICATION ====================
            this.deps.eventBus.emit('optimizer:optimizationCompleted', {
                operationId,
                duration: endTime - startTime,
                originalSize,
                optimizedSize,
                savings,
                strategy
            });
            
            return optimized;
            
        } catch (error) {
            this.#state.metrics.failures++;
            this.deps.eventBus.emit('optimizer:error', {
                type: 'optimization',
                operationId,
                error: error.message
            });
            throw error;
        }
    }
    
    deduplicate(data, options = {}) {
        if (!Array.isArray(data)) {
            throw new Error('Deduplication requires array input');
        }
        
        const seen = new Map();
        return data.filter(item => {
            const key = options.keyFn 
                ? options.keyFn(item)
                : JSON.stringify(item);
            
            if (seen.has(key)) {
                return false;
            }
            
            seen.set(key, true);
            return true;
        });
    }
    
    async compress(state, options = {}) {
        const compressionStart = performance.now();
        
        try {
            // Convert to string and compress
            const jsonString = JSON.stringify(state);
            const compressed = await this.#compressString(jsonString, options.algorithm);
            
            return {
                compressed,
                metadata: {
                    algorithm: options.algorithm || 'gzip',
                    originalSize: jsonString.length,
                    compressedSize: compressed.length,
                    ratio: compressed.length / jsonString.length,
                    timestamp: Date.now()
                }
            };
        } catch (error) {
            this.deps.eventBus.emit('optimizer:error', {
                type: 'compression',
                error: error.message
            });
            throw error;
        }
    }
    
    async decompress(compressedData, options = {}) {
        try {
            const decompressed = await this.#decompressString(
                compressedData.compressed,
                compressedData.metadata.algorithm
            );
            return JSON.parse(decompressed);
        } catch (error) {
            this.deps.eventBus.emit('optimizer:error', {
                type: 'decompression',
                error: error.message
            });
            throw error;
        }
    }
    
    normalize(state, schema) {
        const normalized = {};
        
        for (const [key, value] of Object.entries(state)) {
            const fieldSchema = schema[key];
            if (fieldSchema) {
                normalized[key] = this.#normalizeValue(value, fieldSchema);
            }
        }
        
        return normalized;
    }
    
    calculateSavings(original, optimized) {
        const originalSize = JSON.stringify(original).length;
        const optimizedSize = JSON.stringify(optimized).length;
        const savings = originalSize - optimizedSize;
        const percent = originalSize > 0 ? (savings / originalSize) * 100 : 0;
        
        return {
            bytesSaved: savings,
            percentSaved: percent,
            efficiency: percent > 10 ? 'high' : percent > 5 ? 'medium' : 'low'
        };
    }
    
    getMetrics() {
        return {
            ...this.#state.metrics,
            cacheSize: this.#state.cache.size,
            cacheHitRate: this.#state.metrics.optimizations > 0 
                ? (this.#state.metrics.cacheHits / this.#state.metrics.optimizations) * 100 
                : 0
        };
    }
    
    clearCache() {
        const cacheSize = this.#state.cache.size;
        this.#state.cache.clear();
        
        this.deps.eventBus.emit('optimizer:cacheCleared', {
            clearedEntries: cacheSize
        });
        
        return cacheSize;
    }
    
    cleanup() {
        this.clearCache();
        this.#stopMonitoring();
        this.#state.initialized = false;
        
        this.deps.logger.info('StateOptimizer cleaned up');
    }
    
    // ==================== PRIVATE METHODS ====================
    #validateDependencies(deps) {
        const required = ['eventBus', 'config', 'logger', 'database'];
        const missing = required.filter(dep => !deps[dep]);
        
        if (missing.length > 0) {
            throw new Error(`Missing required dependencies: ${missing.join(', ')}`);
        }
    }
    
    #applyConfig() {
        // Merge default config with injected config
        this.#config = {
            ...OPTIMIZER_CONFIG,
            ...(this.deps.config.get('optimizer') || {})
        };
    }
    
    #setupEventListeners() {
        // Listen for state changes
        this.deps.eventBus.on('state:change', (data) => {
            if (this.#config.autoOptimize) {
                this.optimize(data.state, { strategy: 'balanced' })
                    .catch(error => {
                        this.deps.logger.error('Auto-optimization failed', error);
                    });
            }
        });
        
        // Listen for optimization requests
        this.deps.eventBus.on('optimizer:optimizeRequest', async (data, callback) => {
            try {
                const result = await this.optimize(data.state, data.options);
                callback({ success: true, result });
            } catch (error) {
                callback({ success: false, error: error.message });
            }
        });
        
        // Listen for cache clear requests
        this.deps.eventBus.on('optimizer:clearCache', () => {
            this.clearCache();
        });
    }
    
    async #applyOptimizationStrategy(state, strategyName, options) {
        const strategyConfig = this.#config.strategies[strategyName];
        if (!strategyConfig) {
            throw new Error(`Unknown strategy: ${strategyName}`);
        }
        
        let optimized = state;
        
        // Apply optimizations based on strategy
        if (strategyConfig.deduplicate) {
            optimized = this.#deduplicateDeep(optimized);
        }
        
        if (strategyConfig.compressStrings) {
            optimized = this.#compressStrings(optimized);
        }
        
        if (strategyConfig.removeNull) {
            optimized = this.#removeNullValues(optimized);
        }
        
        if (strategyConfig.removeUndefined) {
            optimized = this.#removeUndefinedValues(optimized);
        }
        
        if (strategyConfig.normalizeNumbers) {
            optimized = this.#normalizeNumbers(optimized);
        }
        
        if (strategyConfig.transformDates) {
            optimized = this.#transformDates(optimized);
        }
        
        // Apply depth limit
        optimized = this.#limitDepth(optimized, strategyConfig.maxDepth);
        
        return optimized;
    }
    
    #deduplicateDeep(obj) {
        const seen = new Map();
        
        const deduplicate = (value) => {
            if (value && typeof value === 'object') {
                const key = JSON.stringify(value);
                if (seen.has(key)) {
                    return seen.get(key);
                }
                
                seen.set(key, value);
                
                if (Array.isArray(value)) {
                    return value.map(deduplicate);
                } else {
                    const result = {};
                    for (const [k, v] of Object.entries(value)) {
                        result[k] = deduplicate(v);
                    }
                    return result;
                }
            }
            return value;
        };
        
        return deduplicate(obj);
    }
    
    #compressStrings(obj) {
        const stringMap = new Map();
        let nextId = 0;
        
        const compress = (value) => {
            if (typeof value === 'string' && value.length > 10) {
                if (!stringMap.has(value)) {
                    stringMap.set(value, `$${nextId++}`);
                }
                return stringMap.get(value);
            }
            
            if (Array.isArray(value)) {
                return value.map(compress);
            }
            
            if (value && typeof value === 'object') {
                const result = {};
                for (const [k, v] of Object.entries(value)) {
                    result[k] = compress(v);
                }
                return result;
            }
            
            return value;
        };
        
        const compressed = compress(obj);
        
        if (stringMap.size > 0) {
            return {
                ...compressed,
                _stringMap: Object.fromEntries(stringMap.entries())
            };
        }
        
        return compressed;
    }
    
    #removeNullValues(obj) {
        const clean = (value) => {
            if (value === null) return undefined;
            
            if (Array.isArray(value)) {
                return value.map(clean).filter(v => v !== undefined);
            }
            
            if (value && typeof value === 'object') {
                const result = {};
                for (const [k, v] of Object.entries(value)) {
                    const cleaned = clean(v);
                    if (cleaned !== undefined) {
                        result[k] = cleaned;
                    }
                }
                return result;
            }
            
            return value;
        };
        
        return clean(obj);
    }
    
    #removeUndefinedValues(obj) {
        const clean = (value) => {
            if (value === undefined) return undefined;
            
            if (Array.isArray(value)) {
                return value.map(clean).filter(v => v !== undefined);
            }
            
            if (value && typeof value === 'object') {
                const result = {};
                for (const [k, v] of Object.entries(value)) {
                    const cleaned = clean(v);
                    if (cleaned !== undefined) {
                        result[k] = cleaned;
                    }
                }
                return result;
            }
            
            return value;
        };
        
        return clean(obj);
    }
    
    #normalizeNumbers(obj) {
        const normalize = (value) => {
            if (typeof value === 'number') {
                // Keep integers as is, round floats
                return Number.isInteger(value) ? value : Number(value.toFixed(6));
            }
            
            if (Array.isArray(value)) {
                return value.map(normalize);
            }
            
            if (value && typeof value === 'object') {
                const result = {};
                for (const [k, v] of Object.entries(value)) {
                    result[k] = normalize(v);
                }
                return result;
            }
            
            return value;
        };
        
        return normalize(obj);
    }
    
    #transformDates(obj) {
        const transform = (value) => {
            if (value instanceof Date) {
                return value.toISOString();
            }
            
            if (Array.isArray(value)) {
                return value.map(transform);
            }
            
            if (value && typeof value === 'object') {
                const result = {};
                for (const [k, v] of Object.entries(value)) {
                    result[k] = transform(v);
                }
                return result;
            }
            
            return value;
        };
        
        return transform(obj);
    }
    
    #limitDepth(obj, maxDepth, currentDepth = 0) {
        if (currentDepth >= maxDepth) {
            return '[Depth Limited]';
        }
        
        if (Array.isArray(obj)) {
            return obj.map(item => this.#limitDepth(item, maxDepth, currentDepth + 1));
        }
        
        if (obj && typeof obj === 'object') {
            const result = {};
            for (const [key, value] of Object.entries(obj)) {
                result[key] = this.#limitDepth(value, maxDepth, currentDepth + 1);
            }
            return result;
        }
        
        return obj;
    }
    
    #normalizeValue(value, schema) {
        if (schema.type === 'string' && typeof value !== 'string') {
            return String(value);
        }
        
        if (schema.type === 'number' && typeof value !== 'number') {
            return Number(value) || 0;
        }
        
        if (schema.type === 'boolean' && typeof value !== 'boolean') {
            return Boolean(value);
        }
        
        if (schema.type === 'array' && !Array.isArray(value)) {
            return [value];
        }
        
        if (schema.type === 'object' && typeof value !== 'object') {
            return { value };
        }
        
        return value;
    }
    
    async #compressString(str, algorithm = 'gzip') {
        // Browser-native compression API
        if (window.CompressionStream) {
            const encoder = new TextEncoder();
            const compressedReadable = new Blob([encoder.encode(str)])
                .stream()
                .pipeThrough(new CompressionStream(algorithm));
            
            const compressedBlob = await new Response(compressedReadable).blob();
            const arrayBuffer = await compressedBlob.arrayBuffer();
            return Array.from(new Uint8Array(arrayBuffer));
        }
        
        // Fallback for older browsers
        return this.#simpleCompress(str);
    }
    
    async #decompressString(compressed, algorithm = 'gzip') {
        if (window.DecompressionStream) {
            const decompressedReadable = new Blob([new Uint8Array(compressed)])
                .stream()
                .pipeThrough(new DecompressionStream(algorithm));
            
            const decompressedBlob = await new Response(decompressedReadable).blob();
            return await decompressedBlob.text();
        }
        
        // Fallback
        return this.#simpleDecompress(compressed);
    }
    
    #simpleCompress(str) {
        // Simple compression for fallback
        const compressed = [];
        let lastChar = '';
        let count = 1;
        
        for (let i = 0; i < str.length; i++) {
            if (str[i] === lastChar) {
                count++;
            } else {
                if (lastChar) {
                    compressed.push(lastChar + (count > 1 ? count : ''));
                }
                lastChar = str[i];
                count = 1;
            }
        }
        
        if (lastChar) {
            compressed.push(lastChar + (count > 1 ? count : ''));
        }
        
        return compressed.join('');
    }
    
    #simpleDecompress(compressed) {
        // Simple decompression for fallback
        let result = '';
        let i = 0;
        
        while (i < compressed.length) {
            const char = compressed[i];
            i++;
            
            let count = '';
            while (i < compressed.length && !isNaN(compressed[i])) {
                count += compressed[i];
                i++;
            }
            
            result += char.repeat(count ? parseInt(count) : 1);
        }
        
        return result;
    }
    
    #generateOperationId() {
        return Date.now().toString(36) + Math.random().toString(36).substr(2);
    }
    
    #generateCacheKey(state, options) {
        const str = JSON.stringify(state) + JSON.stringify(options);
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return hash.toString(36);
    }
    
    #isCacheExpired(cacheEntry) {
        if (!this.#config.cache.ttl) return false;
        return Date.now() - cacheEntry.timestamp > this.#config.cache.ttl;
    }
    
    #cleanupCache() {
        if (this.#state.cache.size > this.#config.cache.maxSize) {
            // Remove oldest entries
            const entries = Array.from(this.#state.cache.entries());
            entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
            
            const toRemove = entries.slice(0, entries.length - this.#config.cache.maxSize);
            for (const [key] of toRemove) {
                this.#state.cache.delete(key);
            }
        }
    }
    
    async #loadCache() {
        try {
            const savedCache = await this.deps.database.get('optimizer_cache');
            if (savedCache) {
                this.#state.cache = new Map(savedCache);
                this.deps.logger.debug('Loaded optimizer cache', {
                    size: this.#state.cache.size
                });
            }
        } catch (error) {
            this.deps.logger.warn('Failed to load optimizer cache', error);
        }
    }
    
    #startMonitoring() {
        this.#monitorInterval = setInterval(() => {
            this.#monitorPerformance();
        }, 60000); // Every minute
    }
    
    #stopMonitoring() {
        if (this.#monitorInterval) {
            clearInterval(this.#monitorInterval);
        }
    }
    
    #monitorPerformance() {
        const metrics = this.getMetrics();
        
        if (metrics.failures > 10 && metrics.failures / metrics.optimizations > 0.1) {
            this.deps.eventBus.emit('optimizer:performanceAlert', {
                failures: metrics.failures,
                failureRate: (metrics.failures / metrics.optimizations) * 100
            });
        }
    }
    
    #validateState(state) {
        if (state === undefined || state === null) {
            throw new Error('State cannot be null or undefined');
        }
        
        try {
            JSON.stringify(state);
        } catch (error) {
            throw new Error(`State is not serializable: ${error.message}`);
        }
    }
}

// ==================== FACTORY FUNCTION (DI) ====================
export const createStateOptimizer = (dependencies) => {
    return new StateOptimizer(dependencies);
};

// ==================== DEFAULT EXPORT WITH VALIDATION ====================
export default (dependencies) => {
    // Validate dependencies
    const required = ['eventBus', 'config', 'logger', 'database'];
    const missing = required.filter(dep => !dependencies[dep]);
    
    if (missing.length > 0) {
        throw new Error(`Missing dependencies: ${missing.join(', ')}`);
    }
    
    return new StateOptimizer(dependencies);
};
