/**
 * core/event-bus.js
 * Event Bus System for loosely-coupled communication between modules
 * 
 * Principles Applied:
 * - SRP: Single responsibility - manages event subscription and publication
 * - ISP: Small, focused interfaces (EventListener, EventPublisher)
 * - DIP: Depend on abstractions (interfaces), not implementations
 * - OCP: Extensible through decorators/plugins without modifying core
 * - DRY: No code duplication in event handling
 * - KISS: Simple pub/sub pattern implementation
 * - Testable: Pure functions and mockable interfaces
 */

// ============================================
// INTERFACES (Abstractions)
// ============================================

/**
 * @interface EventListener
 * Contract for event listeners
 * @method {Function} handleEvent - Process received event
 */
class EventListener {
  /**
   * @param {string} eventType - Type of event to handle
   * @param {*} eventData - Event payload
   * @param {EventMetadata} metadata - Event metadata
   * @returns {Promise<void>}
   */
  async handleEvent(eventType, eventData, metadata) {
    throw new Error('handleEvent() must be implemented');
  }
}

/**
 * @interface EventPublisher
 * Contract for event publishers
 */
class EventPublisher {
  /**
   * @param {string} eventType - Type of event to publish
   * @param {*} eventData - Event payload
   * @param {EventOptions} options - Publishing options
   * @returns {Promise<void>}
   */
  async publish(eventType, eventData, options = {}) {
    throw new Error('publish() must be implemented');
  }
}

// ============================================
// TYPES
// ============================================

/**
 * @typedef {Object} EventOptions
 * @property {boolean} [persistent=false] - Whether event should survive app restarts
 * @property {number} [priority=0] - Event priority (higher = processed first)
 * @property {string} [source='unknown'] - Source module identifier
 */

/**
 * @typedef {Object} EventMetadata
 * @property {string} id - Unique event identifier
 * @property {number} timestamp - Event creation timestamp
 * @property {string} source - Source module identifier
 * @property {EventOptions} options - Original event options
 */

/**
 * @typedef {Object} Subscription
 * @property {string} id - Unique subscription ID
 * @property {string} eventType - Event type to listen for
 * @property {EventListener} listener - Listener instance
 * @property {number} priority - Listener priority
 */

// ============================================
// IMPLEMENTATION
// ============================================

/**
 * Core Event Bus Implementation
 * 
 * @implements {EventPublisher}
 */
class EventBus {
  /**
   * @constructor
   * @param {Object} [dependencies] - Injected dependencies (DIP)
   * @param {EventValidator} [dependencies.validator] - Event validator
   */
  constructor(dependencies = {}) {
    /** @private */
    this.subscriptions = new Map(); // eventType -> Subscription[]
    
    /** @private */
    this.middlewares = [];
    
    /** @private @type {EventValidator} */
    this.validator = dependencies.validator || new DefaultEventValidator();
    
    /** @private */
    this.isProcessing = false;
    
    /** @private */
    this.eventQueue = [];
    
    /** @private */
    this.subscriptionIdCounter = 0;
  }

  // ============================================
  // PUBLIC API (EventPublisher Interface)
  // ============================================

  /**
   * Publish an event to all subscribers
   * 
   * @param {string} eventType - Type of event
   * @param {*} eventData - Event payload
   * @param {EventOptions} [options={}] - Publishing options
   * @returns {Promise<void>}
   */
  async publish(eventType, eventData, options = {}) {
    // Validate inputs
    this.validator.validateEventType(eventType);
    this.validator.validateEventData(eventData);
    
    const eventMetadata = this._createEventMetadata(eventType, options);
    
    // Apply middlewares
    let processedEvent = { type: eventType, data: eventData, metadata: eventMetadata };
    for (const middleware of this.middlewares) {
      processedEvent = await middleware.beforePublish(processedEvent);
    }
    
    // Queue or process immediately
    if (this.isProcessing) {
      this.eventQueue.push(processedEvent);
      return;
    }
    
    await this._processEvent(processedEvent);
    
    // Process queued events
    await this._processEventQueue();
  }

  /**
   * Subscribe to an event type
   * 
   * @param {string} eventType - Event type to subscribe to
   * @param {EventListener} listener - Listener instance
   * @param {number} [priority=0] - Listener priority
   * @returns {Function} Unsubscribe function
   */
  subscribe(eventType, listener, priority = 0) {
    this.validator.validateEventType(eventType);
    this.validator.validateListener(listener);
    
    const subscriptionId = this._generateSubscriptionId();
    const subscription = {
      id: subscriptionId,
      eventType,
      listener,
      priority
    };
    
    if (!this.subscriptions.has(eventType)) {
      this.subscriptions.set(eventType, []);
    }
    
    const eventSubscriptions = this.subscriptions.get(eventType);
    eventSubscriptions.push(subscription);
    
    // Sort by priority (higher first)
    eventSubscriptions.sort((a, b) => b.priority - a.priority);
    
    // Return unsubscribe function
    return () => this.unsubscribe(subscriptionId);
  }

  /**
   * Unsubscribe from events
   * 
   * @param {string} subscriptionId - Subscription ID to remove
   * @returns {boolean} True if unsubscribed successfully
   */
  unsubscribe(subscriptionId) {
    for (const [eventType, subscriptions] of this.subscriptions.entries()) {
      const index = subscriptions.findIndex(sub => sub.id === subscriptionId);
      if (index !== -1) {
        subscriptions.splice(index, 1);
        
        // Clean up empty arrays
        if (subscriptions.length === 0) {
          this.subscriptions.delete(eventType);
        }
        
        return true;
      }
    }
    return false;
  }

  /**
   * Add middleware for event processing
   * 
   * @param {EventMiddleware} middleware - Middleware instance
   */
  addMiddleware(middleware) {
    this.middlewares.push(middleware);
  }

  /**
   * Remove all subscriptions for cleanup
   */
  clearAllSubscriptions() {
    this.subscriptions.clear();
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /** @private */
  async _processEvent(event) {
    this.isProcessing = true;
    
    try {
      const subscribers = this.subscriptions.get(event.type) || [];
      
      // Execute all subscribers in parallel (non-blocking)
      const promises = subscribers.map(async (subscription) => {
        try {
          await subscription.listener.handleEvent(
            event.type,
            event.data,
            event.metadata
          );
        } catch (error) {
          console.error(`Event listener failed for ${event.type}:`, error);
          // Continue with other listeners (don't break chain)
        }
      });
      
      await Promise.all(promises);
      
      // Execute afterPublish middlewares
      for (const middleware of this.middlewares) {
        await middleware.afterPublish(event);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /** @private */
  async _processEventQueue() {
    while (this.eventQueue.length > 0 && !this.isProcessing) {
      const nextEvent = this.eventQueue.shift();
      await this._processEvent(nextEvent);
    }
  }

  /** @private */
  _createEventMetadata(eventType, options) {
    return {
      id: `event_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
      source: options.source || 'unknown',
      options: { ...options }
    };
  }

  /** @private */
  _generateSubscriptionId() {
    return `sub_${++this.subscriptionIdCounter}_${Date.now()}`;
  }
}

// ============================================
// SUPPORTING CLASSES
// ============================================

/**
 * Event Validator (SRP: Single responsibility - validation only)
 */
class DefaultEventValidator {
  validateEventType(eventType) {
    if (!eventType || typeof eventType !== 'string') {
      throw new Error('Event type must be a non-empty string');
    }
    
    if (eventType.length > 100) {
      throw new Error('Event type too long (max 100 chars)');
    }
    
    // Prevent reserved event types
    const reservedPrefixes = ['system.', 'internal.'];
    if (reservedPrefixes.some(prefix => eventType.startsWith(prefix))) {
      throw new Error(`Event type "${eventType}" is reserved for internal use`);
    }
  }
  
  validateEventData(eventData) {
    // Allow any data type, but check for circular references in development
    if (process.env.NODE_ENV === 'development') {
      try {
        JSON.stringify(eventData);
      } catch (error) {
        throw new Error('Event data contains circular references');
      }
    }
  }
  
  validateListener(listener) {
    if (!listener || typeof listener.handleEvent !== 'function') {
      throw new Error('Listener must implement EventListener interface');
    }
  }
}

/**
 * @interface EventMiddleware
 * Contract for event processing middlewares
 */
class EventMiddleware {
  async beforePublish(event) { return event; }
  async afterPublish(event) { }
}

// ============================================
// DECORATORS (OCP: Extensible without modification)
// ============================================

/**
 * Logging Middleware - adds event logging
 */
class LoggingMiddleware extends EventMiddleware {
  async beforePublish(event) {
    console.log(`[EventBus] Publishing: ${event.type}`, {
      source: event.metadata.source,
      timestamp: new Date(event.metadata.timestamp).toISOString()
    });
    return event;
  }
}

/**
 * Error Handling Middleware - catches and logs errors
 */
class ErrorHandlingMiddleware extends EventMiddleware {
  async afterPublish(event) {
    // Can be extended to send errors to monitoring service
    // Currently just logs for demonstration
  }
}

// ============================================
// FACTORY FUNCTION (DIP: Dependency injection)
// ============================================

/**
 * Factory function to create a configured EventBus instance
 * 
 * @param {Object} [config] - Configuration options
 * @param {boolean} [config.enableLogging=true] - Enable logging middleware
 * @param {boolean} [config.enableErrorHandling=true] - Enable error middleware
 * @returns {EventBus} Configured EventBus instance
 */
export function createEventBus(config = {}) {
  const {
    enableLogging = true,
    enableErrorHandling = true
  } = config;
  
  const eventBus = new EventBus();
  
  // Add middlewares based on configuration (OCP)
  if (enableLogging) {
    eventBus.addMiddleware(new LoggingMiddleware());
  }
  
  if (enableErrorHandling) {
    eventBus.addMiddleware(new ErrorHandlingMiddleware());
  }
  
  return eventBus;
}

// ============================================
// DEFAULT EXPORT (Singleton pattern - careful use)
// ============================================

/**
 * Default singleton instance (use carefully - prefer dependency injection)
 */
const defaultEventBus = createEventBus();

export { EventBus, EventListener, EventPublisher, EventMiddleware };
export default defaultEventBus;
