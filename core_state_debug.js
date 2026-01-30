/**
 * State Debug Module - Advanced debugging and profiling tools
 * Contract: STATE_DEBUG_CONTRACT
 */

export const STATE_DEBUG_CONTRACT = {
    name: 'state-debug',
    version: '2.0.0',
    dependencies: ['eventBus', 'config', 'logger', 'storage'],
    init: 'function',
    enable: 'function',
    disable: 'function',
    logState: 'function',
    trackMutation: 'function',
    methods: [
        'startProfiling',
        'stopProfiling',
        'getProfile',
        'timeTravel',
        'createSnapshot',
        'restoreSnapshot',
        'inspectState',
        'trackPerformance',
        'setBreakpoint',
        'clearBreakpoints'
    ]
};

export class StateDebug {
    #eventBus;
    #config;
    #logger;
    #storage;
    #isEnabled = false;
    #mutationLog = [];
    #stateSnapshots = new Map();
    #performanceEntries = [];
    #breakpoints = new Map();
    #profiling = {
        active: false,
        startTime: 0,
        entries: []
    };
    #timeTravel = {
        timeline: [],
        currentIndex: -1,
        maxSnapshots: 100
    };
    #memoryWatcher = {
        interval: null,
        baseline: 0,
        leaks: []
    };
    #inspector = {
        watches: new Map(),
        expressions: new Map()
    };
    #debugConsole = {
        history: [],
        maxHistory: 1000
    };

    constructor({ eventBus, config, logger, storage }) {
        if (!eventBus || !config || !logger || !storage) {
            throw new Error('All dependencies required: eventBus, config, logger, storage');
        }
        
        this.#eventBus = eventBus;
        this.#config = config.get('debug') || {};
        this.#logger = logger;
        this.#storage = storage;
        
        this.#setupEventListeners();
        this.#setupDebugHooks();
        this.#initializeDebugConsole();
        
        this.#logger.info('StateDebug initialized', { 
            maxSnapshots: this.#timeTravel.maxSnapshots,
            defaultEnabled: this.#config.enabled || false
        });
    }

    init() {
        if (this.#config.enabled) {
            this.enable();
        }
        
        this.#eventBus.emit('debug:initialized', {
            version: '2.0.0',
            enabled: this.#isEnabled,
            features: ['profiling', 'timeTravel', 'breakpoints', 'memoryWatch']
        });
        
        return this;
    }

    enable(options = {}) {
        if (this.#isEnabled) return;
        
        this.#isEnabled = true;
        this.#startMemoryWatcher();
        this.#startPerformanceMonitor();
        
        if (options.captureInitialState) {
            this.#captureInitialState();
        }

        this.#eventBus.emit('debug:enabled', {
            timestamp: Date.now(),
            options,
            memory: performance.memory?.usedJSHeapSize
        });

        this.#logger.info('State debugging enabled', { options });
    }

    disable() {
        if (!this.#isEnabled) return;
        
        this.#isEnabled = false;
        this.#stopMemoryWatcher();
        this.#stopPerformanceMonitor();
        
        this.#eventBus.emit('debug:disabled', {
            timestamp: Date.now(),
            logs: this.#mutationLog.length,
            snapshots: this.#stateSnapshots.size
        });

        this.#logger.info('State debugging disabled');
    }

    logState(state, label = 'State', options = {}) {
        if (!this.#isEnabled && !options.force) return;
        
        const snapshot = {
            id: this.#generateSnapshotId(),
            timestamp: performance.now(),
            label,
            state: this.#safeClone(state, options.depth),
            metadata: {
                memoryUsage: performance.memory?.usedJSHeapSize,
                stackTrace: options.captureStackTrace ? new Error().stack : null,
                url: window.location.href,
                userAgent: navigator.userAgent
            },
            performance: {
                now: performance.now(),
                timeOrigin: performance.timeOrigin
            }
        };

        if (options.saveToStorage) {
            this.#saveSnapshotToStorage(snapshot);
        }

        this.#mutationLog.push(snapshot);
        
        // Trim log if needed
        if (this.#mutationLog.length > this.#debugConsole.maxHistory) {
            this.#mutationLog = this.#mutationLog.slice(-this.#debugConsole.maxHistory);
        }

        this.#eventBus.emit('debug:stateLogged', {
            id: snapshot.id,
            label,
            size: JSON.stringify(snapshot.state).length,
            logSize: this.#mutationLog.length
        });

        return snapshot.id;
    }

    trackMutation(previous, current, mutation, options = {}) {
        if (!this.#isEnabled && !options.force) return;
        
        const mutationRecord = {
            id: this.#generateMutationId(),
            timestamp: Date.now(),
            previous: this.#safeClone(previous, options.depth),
            current: this.#safeClone(current, options.depth),
            mutation,
            diff: this.#calculateDiff(previous, current),
            performance: {
                duration: options.duration || 0,
                startTime: options.startTime || performance.now()
            },
            context: {
                trigger: mutation.trigger || 'unknown',
                component: mutation.component || 'unknown',
                action: mutation.action || 'unknown'
            }
        };

        // Check breakpoints
        this.#checkBreakpoints(mutationRecord);

        // Add to time travel timeline
        this.#addToTimeline(mutationRecord);

        // Track performance
        if (options.duration) {
            this.#trackPerformance(mutationRecord);
        }

        this.#eventBus.emit('debug:mutationTracked', {
            id: mutationRecord.id,
            mutationType: mutation.type,
            diffSize: JSON.stringify(mutationRecord.diff).length
        });

        return mutationRecord.id;
    }

    startProfiling(label = 'Profile') {
        if (this.#profiling.active) {
            this.#logger.warn('Profiling already active');
            return false;
        }

        this.#profiling = {
            active: true,
            startTime: performance.now(),
            label,
            entries: []
        };

        this.#eventBus.emit('debug:profilingStarted', {
            label,
            startTime: this.#profiling.startTime
        });

        this.#logger.info('Profiling started', { label });
        return true;
    }

    stopProfiling() {
        if (!this.#profiling.active) {
            this.#logger.warn('No active profiling session');
            return null;
        }

        const profile = {
            label: this.#profiling.label,
            startTime: this.#profiling.startTime,
            endTime: performance.now(),
            duration: performance.now() - this.#profiling.startTime,
            entries: [...this.#profiling.entries],
            summary: this.#createProfileSummary()
        };

        this.#profiling.active = false;
        
        this.#eventBus.emit('debug:profilingStopped', {
            label: profile.label,
            duration: profile.duration,
            entries: profile.entries.length
        });

        this.#logger.info('Profiling stopped', {
            label: profile.label,
            duration: profile.duration,
            entries: profile.entries.length
        });

        return profile;
    }

    getProfile() {
        if (this.#profiling.active) {
            return {
                active: true,
                label: this.#profiling.label,
                runningFor: performance.now() - this.#profiling.startTime,
                entries: this.#profiling.entries.length
            };
        }
        
        return {
            active: false,
            message: 'No active profiling session'
        };
    }

    timeTravel(direction, steps = 1) {
        if (direction === 'back' && this.#timeTravel.currentIndex >= steps) {
            this.#timeTravel.currentIndex -= steps;
            const snapshot = this.#timeTravel.timeline[this.#timeTravel.currentIndex];
            
            this.#eventBus.emit('debug:timeTravel', {
                direction: 'back',
                steps,
                currentIndex: this.#timeTravel.currentIndex,
                total: this.#timeTravel.timeline.length,
                snapshotId: snapshot?.id
            });

            return snapshot?.state || null;
        } else if (direction === 'forward' && this.#timeTravel.currentIndex < this.#timeTravel.timeline.length - steps) {
            this.#timeTravel.currentIndex += steps;
            const snapshot = this.#timeTravel.timeline[this.#timeTravel.currentIndex];
            
            this.#eventBus.emit('debug:timeTravel', {
                direction: 'forward',
                steps,
                currentIndex: this.#timeTravel.currentIndex,
                total: this.#timeTravel.timeline.length,
                snapshotId: snapshot?.id
            });

            return snapshot?.state || null;
        } else if (direction === 'jump' && steps >= 0 && steps < this.#timeTravel.timeline.length) {
            this.#timeTravel.currentIndex = steps;
            const snapshot = this.#timeTravel.timeline[steps];
            
            this.#eventBus.emit('debug:timeTravel', {
                direction: 'jump',
                to: steps,
                snapshotId: snapshot?.id
            });

            return snapshot?.state || null;
        }

        this.#logger.warn('Time travel out of bounds', { direction, steps, currentIndex: this.#timeTravel.currentIndex });
        return null;
    }

    createSnapshot(state, label = 'Manual Snapshot') {
        const snapshot = {
            id: this.#generateSnapshotId(),
            timestamp: Date.now(),
            label,
            state: this.#safeClone(state),
            metadata: {
                createdBy: 'manual',
                memory: performance.memory?.usedJSHeapSize
            }
        };

        this.#stateSnapshots.set(snapshot.id, snapshot);
        
        this.#eventBus.emit('debug:snapshotCreated', {
            id: snapshot.id,
            label,
            size: JSON.stringify(snapshot.state).length
        });

        return snapshot.id;
    }

    restoreSnapshot(snapshotId) {
        const snapshot = this.#stateSnapshots.get(snapshotId);
        if (!snapshot) {
            throw new Error(`Snapshot ${snapshotId} not found`);
        }

        this.#eventBus.emit('debug:snapshotRestored', {
            id: snapshotId,
            label: snapshot.label,
            timestamp: snapshot.timestamp
        });

        return snapshot.state;
    }

    inspectState(state, path = '', options = {}) {
        const result = {
            path,
            exists: true,
            value: undefined,
            type: 'undefined',
            size: 0,
            children: [],
            metadata: {}
        };

        try {
            const value = this.#getValueByPath(state, path);
            result.value = value;
            result.type = Array.isArray(value) ? 'array' : typeof value;
            result.size = this.#calculateSize(value);
            result.metadata = this.#getValueMetadata(value);

            if (options.deep && value && typeof value === 'object') {
                result.children = this.#getObjectChildren(value, path);
            }
        } catch (error) {
            result.exists = false;
            result.error = error.message;
        }

        this.#eventBus.emit('debug:stateInspected', {
            path,
            exists: result.exists,
            type: result.type,
            size: result.size
        });

        return result;
    }

    trackPerformance(entry) {
        if (!this.#isEnabled) return;
        
        this.#performanceEntries.push({
            ...entry,
            timestamp: Date.now(),
            memory: performance.memory?.usedJSHeapSize
        });

        // Trim if needed
        if (this.#performanceEntries.length > 1000) {
            this.#performanceEntries = this.#performanceEntries.slice(-1000);
        }

        // Analyze for anomalies
        this.#analyzePerformance(entry);
    }

    setBreakpoint(condition, options = {}) {
        const breakpointId = this.#generateBreakpointId();
        
        const breakpoint = {
            id: breakpointId,
            condition,
            options,
            hits: 0,
            createdAt: Date.now(),
            lastHit: null
        };

        this.#breakpoints.set(breakpointId, breakpoint);
        
        this.#eventBus.emit('debug:breakpointSet', {
            id: breakpointId,
            condition: condition.toString()
        });

        return breakpointId;
    }

    clearBreakpoints(filter = {}) {
        let cleared = 0;
        
        for (const [id, breakpoint] of this.#breakpoints.entries()) {
            if (filter.ids && !filter.ids.includes(id)) continue;
            if (filter.minHits && breakpoint.hits < filter.minHits) continue;
            
            this.#breakpoints.delete(id);
            cleared++;
        }

        this.#eventBus.emit('debug:breakpointsCleared', { cleared });
        return cleared;
    }

    getMutationLog(filter = {}) {
        let log = [...this.#mutationLog];

        if (filter.startTime) {
            log = log.filter(entry => entry.timestamp >= filter.startTime);
        }

        if (filter.endTime) {
            log = log.filter(entry => entry.timestamp <= filter.endTime);
        }

        if (filter.label) {
            log = log.filter(entry => entry.label.includes(filter.label));
        }

        if (filter.minSize) {
            log = log.filter(entry => JSON.stringify(entry.state).length >= filter.minSize);
        }

        return {
            total: log.length,
            log: log.slice(filter.offset || 0, (filter.limit || 50) + (filter.offset || 0))
        };
    }

    getSnapshots(filter = {}) {
        const snapshots = Array.from(this.#stateSnapshots.values());
        
        if (filter.label) {
            return snapshots.filter(s => s.label.includes(filter.label));
        }

        return snapshots;
    }

    getPerformanceReport(options = {}) {
        const entries = [...this.#performanceEntries];
        
        if (options.period) {
            const cutoff = Date.now() - options.period;
            entries = entries.filter(e => e.timestamp >= cutoff);
        }

        const report = {
            totalEntries: entries.length,
            averageDuration: entries.length > 0 
                ? entries.reduce((sum, e) => sum + (e.duration || 0), 0) / entries.length
                : 0,
            maxDuration: Math.max(...entries.map(e => e.duration || 0)),
            minDuration: Math.min(...entries.map(e => e.duration || 0)),
            anomalies: this.#detectAnomalies(entries),
            timeline: entries.map(e => ({
                timestamp: e.timestamp,
                duration: e.duration,
                type: e.type
            }))
        };

        return report;
    }

    evaluateExpression(expression, context = {}) {
        try {
            const result = this.#safeEval(expression, context);
            
            this.#debugConsole.history.push({
                timestamp: Date.now(),
                expression,
                result,
                success: true
            });

            this.#eventBus.emit('debug:expressionEvaluated', {
                expression,
                success: true,
                resultType: typeof result
            });

            return { success: true, result };
        } catch (error) {
            this.#debugConsole.history.push({
                timestamp: Date.now(),
                expression,
                error: error.message,
                success: false
            });

            this.#eventBus.emit('debug:expressionFailed', {
                expression,
                error: error.message
            });

            return { success: false, error: error.message };
        }
    }

    clearLogs() {
        const mutationCount = this.#mutationLog.length;
        const performanceCount = this.#performanceEntries.length;
        
        this.#mutationLog = [];
        this.#performanceEntries = [];
        this.#debugConsole.history = [];
        
        this.#eventBus.emit('debug:logsCleared', {
            mutations: mutationCount,
            performance: performanceCount
        });

        this.#logger.info('Debug logs cleared', {
            mutations: mutationCount,
            performance: performanceCount
        });
    }

    exportData(format = 'json') {
        const data = {
            mutationLog: this.#mutationLog,
            snapshots: Array.from(this.#stateSnapshots.values()),
            performanceEntries: this.#performanceEntries,
            breakpoints: Array.from(this.#breakpoints.values()),
            timeline: this.#timeTravel.timeline,
            metadata: {
                exportedAt: Date.now(),
                version: '2.0.0',
                totalMutations: this.#mutationLog.length,
                totalSnapshots: this.#stateSnapshots.size
            }
        };

        if (format === 'json') {
            return JSON.stringify(data, null, 2);
        } else if (format === 'csv') {
            return this.#convertToCSV(data);
        }

        return data;
    }

    // Private methods
    #setupEventListeners() {
        this.#eventBus.on('debug:enable', () => this.enable());
        this.#eventBus.on('debug:disable', () => this.disable());
        this.#eventBus.on('debug:logState', (data, callback) => {
            const id = this.logState(data.state, data.label, data.options);
            callback({ success: true, id });
        });
        this.#eventBus.on('debug:trackMutation', (data, callback) => {
            const id = this.trackMutation(data.previous, data.current, data.mutation, data.options);
            callback({ success: true, id });
        });
        this.#eventBus.on('state:mutated', (data) => {
            this.trackMutation(data.previous, data.current, data.mutation, {
                duration: data.duration,
                startTime: data.startTime
            });
        });
    }

    #setupDebugHooks() {
        // Hook into console methods
        const originalConsole = { ...console };
        
        console.log = (...args) => {
            originalConsole.log(...args);
            this.#captureConsoleLog('log', args);
        };
        
        console.warn = (...args) => {
            originalConsole.warn(...args);
            this.#captureConsoleLog('warn', args);
        };
        
        console.error = (...args) => {
            originalConsole.error(...args);
            this.#captureConsoleLog('error', args);
        };
        
        // Store original for cleanup
        this.#originalConsole = originalConsole;
    }

    #initializeDebugConsole() {
        window.__hyperlangDebug = {
            debug: this,
            logState: (state, label) => this.logState(state, label),
            inspect: (state, path) => this.inspectState(state, path),
            evaluate: (expr, context) => this.evaluateExpression(expr, context),
            getLogs: (filter) => this.getMutationLog(filter),
            getSnapshots: () => this.getSnapshots(),
            enable: () => this.enable(),
            disable: () => this.disable(),
            clear: () => this.clearLogs(),
            export: (format) => this.exportData(format)
        };
    }

    #startMemoryWatcher() {
        if (this.#memoryWatcher.interval) {
            clearInterval(this.#memoryWatcher.interval);
        }

        this.#memoryWatcher.interval = setInterval(() => {
            this.#checkForMemoryLeaks();
        }, 30000); // Every 30 seconds
    }

    #stopMemoryWatcher() {
        if (this.#memoryWatcher.interval) {
            clearInterval(this.#memoryWatcher.interval);
            this.#memoryWatcher.interval = null;
        }
    }

    #startPerformanceMonitor() {
        // Start monitoring performance marks
        const observer = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                this.trackPerformance({
                    type: 'performance',
                    name: entry.name,
                    duration: entry.duration,
                    entryType: entry.entryType
                });
            }
        });

        observer.observe({ entryTypes: ['measure', 'mark'] });
        this.#performanceObserver = observer;
    }

    #stopPerformanceMonitor() {
        if (this.#performanceObserver) {
            this.#performanceObserver.disconnect();
            this.#performanceObserver = null;
        }
    }

    #captureInitialState() {
        // To be implemented when state is available
        this.#eventBus.once('state:initialized', (state) => {
            this.createSnapshot(state, 'Initial State');
        });
    }

    #checkBreakpoints(mutationRecord) {
        for (const [id, breakpoint] of this.#breakpoints.entries()) {
            try {
                if (breakpoint.condition(mutationRecord)) {
                    breakpoint.hits++;
                    breakpoint.lastHit = Date.now();
                    
                    this.#eventBus.emit('debug:breakpointHit', {
                        breakpointId: id,
                        mutationId: mutationRecord.id,
                        hits: breakpoint.hits,
                        condition: breakpoint.condition.toString()
                    });

                    // Trigger debugger if requested
                    if (breakpoint.options.break) {
                        debugger;
                    }
                }
            } catch (error) {
                this.#logger.error('Breakpoint condition error', { breakpointId: id, error });
            }
        }
    }

    #addToTimeline(mutationRecord) {
        this.#timeTravel.timeline.push(mutationRecord);
        this.#timeTravel.currentIndex = this.#timeTravel.timeline.length - 1;
        
        // Trim timeline if needed
        if (this.#timeTravel.timeline.length > this.#timeTravel.maxSnapshots) {
            this.#timeTravel.timeline = this.#timeTravel.timeline.slice(-this.#timeTravel.maxSnapshots);
            this.#timeTravel.currentIndex = this.#timeTravel.timeline.length - 1;
        }
    }

    #checkForMemoryLeaks() {
        if (!performance.memory) return;
        
        const currentMemory = performance.memory.usedJSHeapSize;
        
        if (this.#memoryWatcher.baseline === 0) {
            this.#memoryWatcher.baseline = currentMemory;
            return;
        }

        const growth = currentMemory - this.#memoryWatcher.baseline;
        const growthPercentage = (growth / this.#memoryWatcher.baseline) * 100;

        if (growthPercentage > 50) { // 50% growth threshold
            this.#memoryWatcher.leaks.push({
                timestamp: Date.now(),
                baseline: this.#memoryWatcher.baseline,
                current: currentMemory,
                growth,
                growthPercentage
            });

            this.#eventBus.emit('debug:memoryLeakDetected', {
                baseline: this.#memoryWatcher.baseline,
                current: currentMemory,
                growth,
                growthPercentage,
                totalLeaks: this.#memoryWatcher.leaks.length
            });

            this.#logger.warn('Possible memory leak detected', {
                growth: `${growthPercentage.toFixed(2)}%`,
                totalLeaks: this.#memoryWatcher.leaks.length
            });
        }
    }

    #analyzePerformance(entry) {
        // Detect slow operations
        if (entry.duration && entry.duration > 100) { // > 100ms is slow
            this.#eventBus.emit('debug:slowOperation', {
                duration: entry.duration,
                type: entry.type,
                context: entry.context
            });
        }

        // Detect performance degradation
        const recentEntries = this.#performanceEntries.slice(-10);
        if (recentEntries.length >= 5) {
            const average = recentEntries.reduce((sum, e) => sum + (e.duration || 0), 0) / recentEntries.length;
            if (entry.duration && entry.duration > average * 2) {
                this.#eventBus.emit('debug:performanceDegradation', {
                    current: entry.duration,
                    average,
                    degradation: ((entry.duration - average) / average) * 100
                });
            }
        }
    }

    #detectAnomalies(entries) {
        const anomalies = [];
        const durations = entries.map(e => e.duration || 0).filter(d => d > 0);
        
        if (durations.length < 5) return anomalies;

        const mean = durations.reduce((sum, d) => sum + d, 0) / durations.length;
        const variance = durations.reduce((sum, d) => sum + Math.pow(d - mean, 2), 0) / durations.length;
        const stdDev = Math.sqrt(variance);

        for (let i = 0; i < durations.length; i++) {
            if (durations[i] > mean + (2 * stdDev)) {
                anomalies.push({
                    index: i,
                    duration: durations[i],
                    deviation: ((durations[i] - mean) / mean) * 100,
                    timestamp: entries[i].timestamp
                });
            }
        }

        return anomalies;
    }

    #createProfileSummary() {
        const entries = this.#profiling.entries;
        if (entries.length === 0) return {};

        const byType = {};
        for (const entry of entries) {
            if (!byType[entry.type]) {
                byType[entry.type] = { count: 0, totalDuration: 0 };
            }
            byType[entry.type].count++;
            byType[entry.type].totalDuration += entry.duration;
        }

        const summary = {};
        for (const [type, data] of Object.entries(byType)) {
            summary[type] = {
                count: data.count,
                totalDuration: data.totalDuration,
                averageDuration: data.totalDuration / data.count
            };
        }

        return summary;
    }

    #safeClone(obj, maxDepth = 5, currentDepth = 0) {
        if (currentDepth >= maxDepth) {
            return '[Max Depth Reached]';
        }

        if (obj === null || obj === undefined) {
            return obj;
        }

        if (typeof obj !== 'object') {
            return obj;
        }

        if (obj instanceof Date) {
            return new Date(obj);
        }

        if (Array.isArray(obj)) {
            return obj.map(item => this.#safeClone(item, maxDepth, currentDepth + 1));
        }

        if (typeof obj === 'object') {
            const clone = {};
            for (const [key, value] of Object.entries(obj)) {
                // Skip large objects or sensitive data
                if (key.startsWith('_') && key.length > 10) continue;
                if (typeof value === 'function') continue;
                
                clone[key] = this.#safeClone(value, maxDepth, currentDepth + 1);
            }
            return clone;
        }

        return obj;
    }

    #calculateDiff(prev, current) {
        const diff = {};
        
        if (prev === current) return diff;
        
        if (typeof prev !== typeof current) {
            return { typeChanged: { from: typeof prev, to: typeof current } };
        }

        if (Array.isArray(prev) && Array.isArray(current)) {
            return this.#calculateArrayDiff(prev, current);
        }

        if (typeof prev === 'object' && typeof current === 'object') {
            return this.#calculateObjectDiff(prev, current);
        }

        return { changed: { from: prev, to: current } };
    }

    #calculateArrayDiff(prev, current) {
        const diff = {
            lengthChanged: prev.length !== current.length,
            added: [],
            removed: [],
            modified: []
        };

        const maxLength = Math.max(prev.length, current.length);
        for (let i = 0; i < maxLength; i++) {
            if (i >= prev.length) {
                diff.added.push({ index: i, value: current[i] });
            } else if (i >= current.length) {
                diff.removed.push({ index: i, value: prev[i] });
            } else if (prev[i] !== current[i]) {
                diff.modified.push({ 
                    index: i, 
                    from: prev[i], 
                    to: current[i ],
                    diff: this.#calculateDiff(prev[i], current[i])
                });
            }
        }

        return diff;
    }

    #calculateObjectDiff(prev, current) {
        const diff = {
            added: [],
            removed: [],
            modified: []
        };

        const allKeys = new Set([...Object.keys(prev), ...Object.keys(current)]);

        for (const key of allKeys) {
            if (!(key in prev)) {
                diff.added.push({ key, value: current[key] });
            } else if (!(key in current)) {
                diff.removed.push({ key, value: prev[key] });
            } else if (prev[key] !== current[key]) {
                diff.modified.push({
                    key,
                    from: prev[key],
                    to: current[key],
                    diff: this.#calculateDiff(prev[key], current[key])
                });
            }
        }

        return diff;
    }

    #getValueByPath(obj, path) {
        if (!path) return obj;
        
        const parts = path.split('.').filter(Boolean);
        let current = obj;
        
        for (const part of parts) {
            if (current === null || current === undefined) {
                throw new Error(`Cannot read property '${part}' of null`);
            }
            
            if (part.includes('[') && part.includes(']')) {
                const [arrayName, index] = part.match(/(\w+)\[(\d+)\]/).slice(1);
                current = current[arrayName];
                if (!Array.isArray(current)) {
                    throw new Error(`Property '${arrayName}' is not an array`);
                }
                current = current[parseInt(index)];
            } else {
                current = current[part];
            }
        }
        
        return current;
    }

    #calculateSize(value) {
        if (value === null || value === undefined) return 0;
        if (typeof value === 'string') return value.length;
        if (typeof value === 'number') return 8; // Approximation
        if (typeof value === 'boolean') return 1;
        
        try {
            return JSON.stringify(value).length;
        } catch {
            return 0;
        }
    }

    #getValueMetadata(value) {
        const metadata = {
            isPrimitive: typeof value !== 'object' || value === null,
            isArray: Array.isArray(value),
            isObject: value && typeof value === 'object' && !Array.isArray(value),
            isFunction: typeof value === 'function',
            isDate: value instanceof Date,
            isRegExp: value instanceof RegExp
        };

        if (metadata.isArray) {
            metadata.length = value.length;
            metadata.isEmpty = value.length === 0;
        } else if (metadata.isObject) {
            metadata.keys = Object.keys(value);
            metadata.keyCount = metadata.keys.length;
            metadata.isEmpty = metadata.keyCount === 0;
        }

        return metadata;
    }

    #getObjectChildren(obj, basePath = '') {
        const children = [];
        
        if (Array.isArray(obj)) {
            for (let i = 0; i < Math.min(obj.length, 10); i++) {
                children.push({
                    path: `${basePath}[${i}]`,
                    type: typeof obj[i],
                    value: this.#truncateValue(obj[i]),
                    size: this.#calculateSize(obj[i])
                });
            }
        } else if (obj && typeof obj === 'object') {
            for (const [key, value] of Object.entries(obj)) {
                children.push({
                    path: basePath ? `${basePath}.${key}` : key,
                    type: typeof value,
                    value: this.#truncateValue(value),
                    size: this.#calculateSize(value)
                });
            }
        }
        
        return children;
    }

    #truncateValue(value, maxLength = 50) {
        if (value === null) return 'null';
        if (value === undefined) return 'undefined';
        
        const str = String(value);
        if (str.length <= maxLength) return str;
        
        return str.substring(0, maxLength) + '...';
    }

    #safeEval(expression, context) {
        // Use Function constructor for safe evaluation
        const safeContext = {
            ...context,
            console: this.#originalConsole,
            JSON,
            Math,
            Date,
            Array,
            Object,
            String,
            Number,
            Boolean,
            RegExp
        };

        const functionBody = `
            "use strict";
            try {
                return (${expression});
            } catch (error) {
                throw error;
            }
        `;

        const argNames = Object.keys(safeContext);
        const argValues = argNames.map(name => safeContext[name]);
        
        const func = new Function(...argNames, functionBody);
        return func(...argValues);
    }

    #captureConsoleLog(level, args) {
        if (!this.#isEnabled) return;
        
        const entry = {
            timestamp: Date.now(),
            level,
            args: args.map(arg => 
                typeof arg === 'object' ? this.#safeClone(arg, 2) : arg
            ),
            stackTrace: new Error().stack
        };

        this.#debugConsole.history.push(entry);
        
        if (this.#debugConsole.history.length > this.#debugConsole.maxHistory) {
            this.#debugConsole.history.shift();
        }
    }

    #convertToCSV(data) {
        // Simplified CSV conversion
        const rows = [];
        
        // Convert mutation log
        if (data.mutationLog && data.mutationLog.length > 0) {
            rows.push('Mutation Log');
            rows.push('Timestamp,Label,Size');
            for (const entry of data.mutationLog) {
                rows.push(`${entry.timestamp},${entry.label},${JSON.stringify(entry.state).length}`);
            }
            rows.push('');
        }

        // Convert performance entries
        if (data.performanceEntries && data.performanceEntries.length > 0) {
            rows.push('Performance Entries');
            rows.push('Timestamp,Type,Duration');
            for (const entry of data.performanceEntries) {
                rows.push(`${entry.timestamp},${entry.type},${entry.duration || 0}`);
            }
        }

        return rows.join('\n');
    }

    #generateSnapshotId() {
        return `snap-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    #generateMutationId() {
        return `mut-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    #generateBreakpointId() {
        return `bp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }

    #saveSnapshotToStorage(snapshot) {
        const key = `debug_snapshot_${snapshot.id}`;
        this.#storage.set(key, snapshot).catch(error => {
            this.#logger.error('Failed to save snapshot', { id: snapshot.id, error });
        });
    }

    get isEnabled() {
        return this.#isEnabled;
    }
}

// Factory function for Dependency Injection
export const createStateDebug = (dependencies) => {
    return new StateDebug(dependencies);
};

// Default export with validation
export default (dependencies) => {
    const required = ['eventBus', 'config', 'logger', 'storage'];
    const missing = required.filter(dep => !dependencies[dep]);
    
    if (missing.length > 0) {
        throw new Error(`Missing dependencies: ${missing.join(', ')}`);
    }
    
    return new StateDebug(dependencies);
};
