/**
 * HyperLang - Offline Queue System
 * Version: 1.0.0
 * Principles: Dependency Injection + Event-Driven + Centralized Config
 */

import { CONFIG } from './config.js';
import { context } from './context-provider.js';
import { eventBus } from './event-bus.js';

export class OfflineQueue {
    constructor(options = {}) {
        // Dependency Injection
        this.config = context.get('config');
        this.logger = context.get('logger');
        this.eventBus = context.get('eventBus') || eventBus;
        this.statePersistence = context.get('statePersistence');
        
        // Configuration
        this.options = {
            queueKey: options.queueKey || 'hyperlang_offline_queue',
            maxQueueSize: options.maxQueueSize || 100,
            retryAttempts: options.retryAttempts || 3,
            retryDelay: options.retryDelay || 5000,
            batchSize: options.batchSize || 10,
            autoProcess: options.autoProcess ?? true,
            networkCheckInterval: options.networkCheckInterval || 10000,
            ...options
        };
        
        // Queue State
        this.queue = [];
        this.processing = false;
        this.isOnline = navigator.onLine;
        this.retryCounts = new Map();
        this.metrics = {
            totalQueued: 0,
            totalProcessed: 0,
            totalFailed: 0,
            lastProcessed: null,
            lastError: null
        };
        
        // Setup
        this.setupNetworkListeners();
        this.loadQueue();
        
        if (this.options.autoProcess) {
            this.startAutoProcessor();
        }
        
        // Register with context
        context.register('offlineQueue', {
            factory: () => this,
            dependencies: ['config', 'logger', 'eventBus', 'statePersistence'],
            lifecycle: 'singleton'
        });
        
        this.logger?.log('OfflineQueue initialized');
    }
    
    // ==================== QUEUE MANAGEMENT ====================
    
    enqueue(operation, priority = 0) {
        const operationId = this.generateId();
        
        const queueItem = {
            id: operationId,
            operation: this.validateOperation(operation),
            priority,
            timestamp: Date.now(),
            attempts: 0,
            status: 'pending',
            metadata: {
                queuedAt: Date.now(),
                source: 'user'
            }
        };
        
        // Check queue size limit
        if (this.queue.length >= this.options.maxQueueSize) {
            // Remove lowest priority item
            const lowestPriority = Math.min(...this.queue.map(item => item.priority));
            const itemsToRemove = this.queue.filter(item => item.priority === lowestPriority);
            
            if (itemsToRemove.length > 0) {
                const removed = itemsToRemove.pop();
                this.queue = this.queue.filter(item => item.id !== removed.id);
                
                this.eventBus.emit('queue:item_removed', {
                    itemId: removed.id,
                    reason: 'queue_full',
                    timestamp: Date.now()
                });
            }
        }
        
        // Add to queue
        this.queue.push(queueItem);
        
        // Sort by priority (highest first) and timestamp
        this.sortQueue();
        
        // Save queue
        this.saveQueue();
        
        // Emit event
        this.eventBus.emit('queue:enqueued', {
            itemId: operationId,
            priority,
            queueSize: this.queue.length,
            timestamp: Date.now()
        });
        
        this.logger?.log(`Operation enqueued: ${operationId} (priority: ${priority})`);
        
        // Auto-process if online
        if (this.isOnline && this.options.autoProcess) {
            this.processQueue();
        }
        
        return operationId;
    }
    
    dequeue(itemId) {
        const index = this.queue.findIndex(item => item.id === itemId);
        
        if (index === -1) {
            return false;
        }
        
        const [removed] = this.queue.splice(index, 1);
        
        this.saveQueue();
        
        this.eventBus.emit('queue:dequeued', {
            itemId,
            reason: 'manual',
            timestamp: Date.now()
        });
        
        return removed;
    }
    
    peek(count = 1) {
        return this.queue.slice(0, count);
    }
    
    clearQueue() {
        const cleared = [...this.queue];
        this.queue = [];
        
        this.saveQueue();
        
        this.eventBus.emit('queue:cleared', {
            count: cleared.length,
            timestamp: Date.now()
        });
        
        return cleared;
    }
    
    // ==================== QUEUE PROCESSING ====================
    
    async processQueue(force = false) {
        if (this.processing && !force) {
            this.logger?.log('Queue processing already in progress');
            return false;
        }
        
        if (!this.isOnline && !force) {
            this.logger?.log('Skipping processing - offline');
            return false;
        }
        
        if (this.queue.length === 0) {
            return false;
        }
        
        this.processing = true;
        
        try {
            const startTime = Date.now();
            const batch = this.getNextBatch();
            
            this.eventBus.emit('queue:processing_start', {
                batchSize: batch.length,
                timestamp: Date.now()
            });
            
            const results = await this.processBatch(batch);
            
            // Update metrics
            const processedCount = results.filter(r => r.success).length;
            const failedCount = results.filter(r => !r.success).length;
            
            this.metrics.totalProcessed += processedCount;
            this.metrics.totalFailed += failedCount;
            this.metrics.lastProcessed = Date.now();
            
            const processingTime = Date.now() - startTime;
            
            // Emit completion event
            this.eventBus.emit('queue:processing_complete', {
                processed: processedCount,
                failed: failedCount,
                processingTime,
                timestamp: Date.now(),
                results
            });
            
            this.logger?.log(`Queue processing completed: ${processedCount} processed, ${failedCount} failed in ${processingTime}ms`);
            
            return {
                success: true,
                processed: processedCount,
                failed: failedCount,
                processingTime,
                results
            };
            
        } catch (error) {
            this.metrics.lastError = {
                message: error.message,
                timestamp: Date.now()
            };
            
            this.eventBus.emit('queue:processing_error', {
                error: error.message,
                timestamp: Date.now()
            });
            
            this.logger?.error('Queue processing failed:', error);
            
            return {
                success: false,
                error: error.message
            };
            
        } finally {
            this.processing = false;
            
            // Save updated queue
            this.saveQueue();
        }
    }
    
    async processBatch(batch) {
        const results = [];
        
        for (const item of batch) {
            try {
                const startTime = Date.now();
                
                // Update attempt count
                item.attempts++;
                item.lastAttempt = Date.now();
                item.status = 'processing';
                
                // Execute operation
                const result = await this.executeOperation(item.operation);
                
                const processingTime = Date.now() - startTime;
                
                // Mark as successful
                item.status = 'completed';
                item.completedAt = Date.now();
                item.result = result;
                item.processingTime = processingTime;
                
                // Remove from queue
                this.queue = this.queue.filter(q => q.id !== item.id);
                
                // Clear retry count
                this.retryCounts.delete(item.id);
                
                results.push({
                    itemId: item.id,
                    success: true,
                    result,
                    processingTime,
                    attempts: item.attempts
                });
                
                this.eventBus.emit('queue:item_success', {
                    itemId: item.id,
                    processingTime,
                    attempts: item.attempts,
                    timestamp: Date.now()
                });
                
            } catch (error) {
                // Handle failure
                item.status = 'failed';
                item.lastError = error.message;
                
                // Check if should retry
                if (item.attempts < this.options.retryAttempts) {
                    item.status = 'retrying';
                    item.retryAfter = Date.now() + this.options.retryDelay;
                    
                    // Update retry count
                    let count = this.retryCounts.get(item.id) || 0;
                    this.retryCounts.set(item.id, count + 1);
                    
                    results.push({
                        itemId: item.id,
                        success: false,
                        error: error.message,
                        willRetry: true,
                        retryCount: item.attempts
                    });
                    
                    this.eventBus.emit('queue:item_retry', {
                        itemId: item.id,
                        error: error.message,
                        attempt: item.attempts,
                        retryAfter: item.retryAfter,
                        timestamp: Date.now()
                    });
                    
                } else {
                    // Max retries reached
                    item.status = 'failed_permanently';
                    item.failedAt = Date.now();
                    
                    // Move to failed items
                    this.moveToFailedItems(item, error);
                    
                    results.push({
                        itemId: item.id,
                        success: false,
                        error: error.message,
                        willRetry: false,
                        attempts: item.attempts
                    });
                    
                    this.eventBus.emit('queue:item_failed', {
                        itemId: item.id,
                        error: error.message,
                        attempts: item.attempts,
                        timestamp: Date.now()
                    });
                }
            }
        }
        
        return results;
    }
    
    // ==================== OPERATION EXECUTION ====================
    
    async executeOperation(operation) {
        // Validate operation type
        switch (operation.type) {
            case 'api_call':
                return await this.executeApiCall(operation);
                
            case 'state_update':
                return await this.executeStateUpdate(operation);
                
            case 'storage_operation':
                return await this.executeStorageOperation(operation);
                
            case 'custom':
                return await this.executeCustomOperation(operation);
                
            default:
                throw new Error(`Unknown operation type: ${operation.type}`);
        }
    }
    
    async executeApiCall(operation) {
        const { method, url, data, headers } = operation;
        
        const fetchOptions = {
            method,
            headers: {
                'Content-Type': 'application/json',
                ...headers
            }
        };
        
        if (data && method !== 'GET') {
            fetchOptions.body = JSON.stringify(data);
        }
        
        const response = await fetch(url, fetchOptions);
        
        if (!response.ok) {
            throw new Error(`API call failed: ${response.status} ${response.statusText}`);
        }
        
        return await response.json();
    }
    
    async executeStateUpdate(operation) {
        const stateManager = context.get('stateManager');
        
        if (!stateManager) {
            throw new Error('State manager not available');
        }
        
        return stateManager.setState(operation.updater, operation.description);
    }
    
    async executeStorageOperation(operation) {
        const { action, key, value } = operation;
        
        switch (action) {
            case 'set':
                localStorage.setItem(key, JSON.stringify(value));
                return { success: true };
                
            case 'get':
                const data = localStorage.getItem(key);
                return data ? JSON.parse(data) : null;
                
            case 'remove':
                localStorage.removeItem(key);
                return { success: true };
                
            default:
                throw new Error(`Unknown storage action: ${action}`);
        }
    }
    
    async executeCustomOperation(operation) {
        if (typeof operation.execute !== 'function') {
            throw new Error('Custom operation must have execute function');
        }
        
        return await operation.execute();
    }
    
    // ==================== NETWORK MANAGEMENT ====================
    
    setupNetworkListeners() {
        window.addEventListener('online', () => {
            this.isOnline = true;
            this.onNetworkStatusChange(true);
        });
        
        window.addEventListener('offline', () => {
            this.isOnline = false;
            this.onNetworkStatusChange(false);
        });
    }
    
    onNetworkStatusChange(isOnline) {
        this.eventBus.emit('queue:network_change', {
            isOnline,
            timestamp: Date.now(),
            queueSize: this.queue.length
        });
        
        if (isOnline && this.options.autoProcess && this.queue.length > 0) {
            this.logger?.log('Network restored, processing queue...');
            this.processQueue();
        }
    }
    
    // ==================== BATCH MANAGEMENT ====================
    
    getNextBatch() {
        // Get items that are ready to process
        const now = Date.now();
        const readyItems = this.queue.filter(item => {
            if (item.status === 'retrying') {
                return item.retryAfter <= now;
            }
            return item.status === 'pending';
        });
        
        // Sort by priority and timestamp
        readyItems.sort((a, b) => {
            if (b.priority !== a.priority) {
                return b.priority - a.priority;
            }
            return a.timestamp - b.timestamp;
        });
        
        // Return batch
        return readyItems.slice(0, this.options.batchSize);
    }
    
    sortQueue() {
        this.queue.sort((a, b) => {
            // First by priority (higher first)
            if (b.priority !== a.priority) {
                return b.priority - a.priority;
            }
            
            // Then by timestamp (older first)
            return a.timestamp - b.timestamp;
        });
    }
    
    // ==================== FAILED ITEMS MANAGEMENT ====================
    
    moveToFailedItems(item, error) {
        const failedItem = {
            ...item,
            error: error.message,
            failedAt: Date.now(),
            stack: error.stack
        };
        
        // Save to failed items storage
        this.saveFailedItem(failedItem);
        
        // Remove from main queue
        this.queue = this.queue.filter(q => q.id !== item.id);
    }
    
    saveFailedItem(item) {
        try {
            const failedItems = JSON.parse(
                localStorage.getItem('hyperlang_failed_operations') || '[]'
            );
            
            failedItems.unshift(item);
            
            // Keep only last 50 failed items
            if (failedItems.length > 50) {
                failedItems.pop();
            }
            
            localStorage.setItem(
                'hyperlang_failed_operations',
                JSON.stringify(failedItems)
            );
        } catch (error) {
            this.logger?.warn('Failed to save failed item:', error);
        }
    }
    
    getFailedItems(limit = 20) {
        try {
            const failedItems = JSON.parse(
                localStorage.getItem('hyperlang_failed_operations') || '[]'
            );
            
            return failedItems.slice(0, limit);
        } catch (error) {
            return [];
        }
    }
    
    retryFailedItem(itemId) {
        try {
            const failedItems = JSON.parse(
                localStorage.getItem('hyperlang_failed_operations') || '[]'
            );
            
            const itemIndex = failedItems.findIndex(item => item.id === itemId);
            if (itemIndex === -1) {
                return false;
            }
            
            const [item] = failedItems.splice(itemIndex, 1);
            
            // Reset item status
            item.status = 'pending';
            item.attempts = 0;
            delete item.error;
            delete item.failedAt;
            
            // Add back to queue
            this.queue.push(item);
            this.sortQueue();
            
            // Update storage
            localStorage.setItem(
                'hyperlang_failed_operations',
                JSON.stringify(failedItems)
            );
            
            this.saveQueue();
            
            this.eventBus.emit('queue:item_retried', {
                itemId,
                timestamp: Date.now()
            });
            
            return true;
        } catch (error) {
            this.logger?.warn('Failed to retry item:', error);
            return false;
        }
    }
    
    // ==================== PERSISTENCE ====================
    
    saveQueue() {
        try {
            const queueData = {
                queue: this.queue,
                metrics: this.metrics,
                version: '1.0.0',
                savedAt: Date.now()
            };
            
            localStorage.setItem(this.options.queueKey, JSON.stringify(queueData));
            
            // Also persist via state persistence if available
            if (this.statePersistence) {
                this.statePersistence.save(queueData, {
                    source: 'offline_queue',
                    type: 'queue_snapshot'
                });
            }
            
            return true;
        } catch (error) {
            this.logger?.error('Failed to save queue:', error);
            return false;
        }
    }
    
    loadQueue() {
        try {
            const stored = localStorage.getItem(this.options.queueKey);
            if (!stored) return false;
            
            const data = JSON.parse(stored);
            
            if (data.version !== '1.0.0') {
                this.logger?.warn('Queue version mismatch, clearing old queue');
                localStorage.removeItem(this.options.queueKey);
                return false;
            }
            
            this.queue = data.queue || [];
            this.metrics = data.metrics || this.metrics;
            
            // Reset processing status for items that were processing
            this.queue.forEach(item => {
                if (item.status === 'processing') {
                    item.status = 'pending';
                }
            });
            
            this.logger?.log(`Queue loaded: ${this.queue.length} items`);
            
            return true;
        } catch (error) {
            this.logger?.error('Failed to load queue:', error);
            return false;
        }
    }
    
    // ==================== VALIDATION ====================
    
    validateOperation(operation) {
        if (!operation || typeof operation !== 'object') {
            throw new Error('Operation must be an object');
        }
        
        if (!operation.type) {
            throw new Error('Operation must have a type');
        }
        
        const validTypes = ['api_call', 'state_update', 'storage_operation', 'custom'];
        if (!validTypes.includes(operation.type)) {
            throw new Error(`Invalid operation type: ${operation.type}`);
        }
        
        // Type-specific validation
        switch (operation.type) {
            case 'api_call':
                if (!operation.url || !operation.method) {
                    throw new Error('API calls require url and method');
                }
                break;
                
            case 'state_update':
                if (!operation.updater) {
                    throw new Error('State updates require updater function');
                }
                break;
                
            case 'storage_operation':
                if (!operation.action || !operation.key) {
                    throw new Error('Storage operations require action and key');
                }
                break;
                
            case 'custom':
                if (typeof operation.execute !== 'function') {
                    throw new Error('Custom operations require execute function');
                }
                break;
        }
        
        return operation;
    }
    
    // ==================== AUTO PROCESSOR ====================
    
    startAutoProcessor() {
        this.stopAutoProcessor();
        
        this.autoProcessor = setInterval(() => {
            if (this.isOnline && this.queue.length > 0 && !this.processing) {
                this.processQueue();
            }
        }, this.options.networkCheckInterval);
    }
    
    stopAutoProcessor() {
        if (this.autoProcessor) {
            clearInterval(this.autoProcessor);
            this.autoProcessor = null;
        }
    }
    
    // ==================== UTILITY METHODS ====================
    
    generateId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }
    
    getQueueStats() {
        const now = Date.now();
        const pending = this.queue.filter(item => item.status === 'pending').length;
        const retrying = this.queue.filter(item => item.status === 'retrying').length;
        const processing = this.queue.filter(item => item.status === 'processing').length;
        
        return {
            total: this.queue.length,
            pending,
            retrying,
            processing,
            failed: this.getFailedItems().length,
            isOnline: this.isOnline,
            isProcessing: this.processing,
            metrics: { ...this.metrics }
        };
    }
    
    // ==================== LIFECYCLE ====================
    
    destroy() {
        this.stopAutoProcessor();
        this.saveQueue();
        
        // Clean up event listeners
        window.removeEventListener('online', () => {});
        window.removeEventListener('offline', () => {});
        
        this.logger?.log('OfflineQueue destroyed');
    }
}

// Singleton instance
export const offlineQueue = new OfflineQueue();

// Register with context
context.registerSingleton('offlineQueue', offlineQueue);

// Export for global use
if (typeof window !== 'undefined') {
    window.offlineQueue = offlineQueue;
}

export default offlineQueue;
