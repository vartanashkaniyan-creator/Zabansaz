/**
 * core/state-validator.js
 * State structure validation and schema enforcement
 * 
 * Principles Applied:
 * - SRP: Single responsibility - validates state structure only
 * - OCP: Extensible validation rules without modifying core
 * - ISP: Small, focused validation interfaces
 * - DIP: Depend on Validator abstractions, not concrete implementations
 * - DRY: Reusable validation rules and schemas
 * - KISS: Simple, readable validation logic
 * - Testable: Pure validation functions with no side effects
 */

// ============================================
// INTERFACES (Abstractions)
// ============================================

/**
 * @interface StateValidator
 * Contract for state validation
 * @method {Function} validate - Validate state against schema
 * @method {Function} validatePartial - Validate partial state update
 */
class StateValidator {
  /**
   * Validate complete state object
   * @param {Object} state - State to validate
   * @returns {ValidationResult}
   */
  validate(state) {
    throw new Error('validate() must be implemented');
  }
  
  /**
   * Validate partial state update
   * @param {Object} currentState - Current state
   * @param {Object} partialState - Partial state to merge
   * @returns {ValidationResult}
   */
  validatePartial(currentState, partialState) {
    throw new Error('validatePartial() must be implemented');
  }
}

/**
 * @interface ValidationRule
 * Contract for individual validation rules
 */
class ValidationRule {
  /**
   * @param {string} path - JSON path to validate (e.g., 'user.profile')
   * @param {*} value - Value to validate
   * @param {Object} fullState - Complete state object
   * @returns {ValidationError[]}
   */
  validate(path, value, fullState) {
    throw new Error('validate() must be implemented');
  }
}

// ============================================
// TYPES
// ============================================

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether validation passed
 * @property {ValidationError[]} errors - Array of validation errors
 * @property {Object} [sanitizedState] - Sanitized state (if sanitization enabled)
 */

/**
 * @typedef {Object} ValidationError
 * @property {string} path - JSON path where error occurred
 * @property {string} message - Human-readable error message
 * @property {string} code - Error code for programmatic handling
 * @property {*} [expected] - Expected value/type
 * @property {*} [actual] - Actual value received
 */

/**
 * @typedef {Object} ValidationSchema
 * @property {Object} structure - Expected state structure
 * @property {ValidationRule[]} rules - Validation rules to apply
 * @property {boolean} [strict=true] - Whether to allow unknown properties
 */

// ============================================
// CORE VALIDATOR IMPLEMENTATION
// ============================================

/**
 * Core State Validator Implementation
 * 
 * @implements {StateValidator}
 */
class CoreStateValidator {
  /**
   * @constructor
   * @param {ValidationSchema} schema - Validation schema
   * @param {Object} [dependencies] - Injected dependencies
   * @param {StateSanitizer} [dependencies.sanitizer] - Optional state sanitizer
   */
  constructor(schema, dependencies = {}) {
    /** @private @type {ValidationSchema} */
    this.schema = schema;
    
    /** @private @type {StateSanitizer} */
    this.sanitizer = dependencies.sanitizer || null;
    
    /** @private */
    this.cachedPaths = this._extractSchemaPaths(schema.structure);
  }

  // ============================================
  // PUBLIC API (StateValidator Interface)
  // ============================================

  /**
   * Validate complete state object
   * @param {Object} state - State to validate
   * @returns {ValidationResult}
   */
  validate(state) {
    const errors = [];
    
    // 1. Validate structure
    if (this.schema.strict !== false) {
      errors.push(...this._validateStructure(state, this.schema.structure));
    }
    
    // 2. Apply custom validation rules
    errors.push(...this._applyValidationRules(state));
    
    // 3. Check for required properties
    errors.push(...this._validateRequiredProperties(state));
    
    const isValid = errors.length === 0;
    const result = { isValid, errors };
    
    // 4. Sanitize if requested and valid
    if (isValid && this.sanitizer) {
      result.sanitizedState = this.sanitizer.sanitize(state, this.schema);
    }
    
    return result;
  }

  /**
   * Validate partial state update
   * @param {Object} currentState - Current state
   * @param {Object} partialState - Partial state to merge
   * @returns {ValidationResult}
   */
  validatePartial(currentState, partialState) {
    const errors = [];
    
    // 1. Validate partial state structure
    const paths = Object.keys(partialState);
    for (const path of paths) {
      // Check if path exists in schema
      if (!this._isPathInSchema(path)) {
        if (this.schema.strict !== false) {
          errors.push({
            path,
            message: `Unknown property: ${path}`,
            code: 'UNKNOWN_PROPERTY'
          });
        }
        continue;
      }
      
      // Get schema definition for this path
      const schemaDef = this._getSchemaDefinition(path);
      if (schemaDef) {
        const value = this._getValueByPath(partialState, path);
        errors.push(...this._validateValue(path, value, schemaDef));
      }
    }
    
    // 2. Apply validation rules to merged state
    const mergedState = { ...currentState, ...partialState };
    errors.push(...this._applyValidationRules(mergedState));
    
    const isValid = errors.length === 0;
    const result = { isValid, errors };
    
    // 3. Sanitize if requested
    if (isValid && this.sanitizer) {
      result.sanitizedState = this.sanitizer.sanitizePartial(
        currentState,
        partialState,
        this.schema
      );
    }
    
    return result;
  }

  /**
   * Add a validation rule at runtime
   * @param {ValidationRule} rule - Rule to add
   */
  addRule(rule) {
    if (!this.schema.rules) {
      this.schema.rules = [];
    }
    this.schema.rules.push(rule);
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  /** @private */
  _validateStructure(state, schema, basePath = '') {
    const errors = [];
    
    // Check all schema properties exist in state
    for (const [key, schemaDef] of Object.entries(schema)) {
      const path = basePath ? `${basePath}.${key}` : key;
      const value = state[key];
      
      if (value === undefined) {
        if (schemaDef.required !== false) {
          errors.push({
            path,
            message: `Required property missing: ${path}`,
            code: 'REQUIRED_PROPERTY_MISSING',
            expected: 'defined value',
            actual: 'undefined'
          });
        }
        continue;
      }
      
      // Validate type
      if (schemaDef.type) {
        errors.push(...this._validateType(path, value, schemaDef.type));
      }
      
      // Validate nested objects
      if (schemaDef.properties && typeof value === 'object' && value !== null) {
        if (Array.isArray(value)) {
          errors.push({
            path,
            message: `Expected object, got array at: ${path}`,
            code: 'TYPE_MISMATCH',
            expected: 'object',
            actual: 'array'
          });
        } else {
          errors.push(...this._validateStructure(value, schemaDef.properties, path));
        }
      }
      
      // Validate arrays
      if (schemaDef.items && Array.isArray(value)) {
        for (let i = 0; i < value.length; i++) {
          const itemPath = `${path}[${i}]`;
          if (typeof schemaDef.items === 'object') {
            errors.push(...this._validateStructure(
              { item: value[i] },
              { item: schemaDef.items },
              itemPath
            ));
          }
        }
      }
    }
    
    return errors;
  }

  /** @private */
  _validateType(path, value, expectedType) {
    const errors = [];
    let actualType = typeof value;
    
    if (Array.isArray(value)) {
      actualType = 'array';
    } else if (value === null) {
      actualType = 'null';
    }
    
    if (actualType !== expectedType) {
      errors.push({
        path,
        message: `Type mismatch at ${path}: expected ${expectedType}, got ${actualType}`,
        code: 'TYPE_MISMATCH',
        expected: expectedType,
        actual: actualType
      });
    }
    
    return errors;
  }

  /** @private */
  _validateValue(path, value, schemaDef) {
    const errors = [];
    
    if (schemaDef.type) {
      errors.push(...this._validateType(path, value, schemaDef.type));
    }
    
    // Validate enums
    if (schemaDef.enum && !schemaDef.enum.includes(value)) {
      errors.push({
        path,
        message: `Invalid value at ${path}: must be one of ${schemaDef.enum.join(', ')}`,
        code: 'INVALID_ENUM_VALUE',
        expected: schemaDef.enum,
        actual: value
      });
    }
    
    // Validate min/max for numbers
    if (typeof value === 'number') {
      if (schemaDef.min !== undefined && value < schemaDef.min) {
        errors.push({
          path,
          message: `Value too small at ${path}: minimum ${schemaDef.min}`,
          code: 'VALUE_TOO_SMALL',
          expected: `>= ${schemaDef.min}`,
          actual: value
        });
      }
      
      if (schemaDef.max !== undefined && value > schemaDef.max) {
        errors.push({
          path,
          message: `Value too large at ${path}: maximum ${schemaDef.max}`,
          code: 'VALUE_TOO_LARGE',
          expected: `<= ${schemaDef.max}`,
          actual: value
        });
      }
    }
    
    // Validate string length
    if (typeof value === 'string') {
      if (schemaDef.minLength !== undefined && value.length < schemaDef.minLength) {
        errors.push({
          path,
          message: `String too short at ${path}: minimum length ${schemaDef.minLength}`,
          code: 'STRING_TOO_SHORT',
          expected: `length >= ${schemaDef.minLength}`,
          actual: value.length
        });
      }
      
      if (schemaDef.maxLength !== undefined && value.length > schemaDef.maxLength) {
        errors.push({
          path,
          message: `String too long at ${path}: maximum length ${schemaDef.maxLength}`,
          code: 'STRING_TOO_LONG',
          expected: `length <= ${schemaDef.maxLength}`,
          actual: value.length
        });
      }
      
      // Validate regex pattern
      if (schemaDef.pattern && !new RegExp(schemaDef.pattern).test(value)) {
        errors.push({
          path,
          message: `String format invalid at ${path}: must match pattern ${schemaDef.pattern}`,
          code: 'PATTERN_MISMATCH',
          expected: `pattern: ${schemaDef.pattern}`,
          actual: value
        });
      }
    }
    
    return errors;
  }

  /** @private */
  _applyValidationRules(state) {
    const errors = [];
    
    if (!this.schema.rules) {
      return errors;
    }
    
    for (const rule of this.schema.rules) {
      // Apply rule to all schema paths
      for (const path of this.cachedPaths) {
        const value = this._getValueByPath(state, path);
        if (value !== undefined) {
          const ruleErrors = rule.validate(path, value, state);
          errors.push(...ruleErrors);
        }
      }
    }
    
    return errors;
  }

  /** @private */
  _validateRequiredProperties(state) {
    const errors = [];
    const requiredPaths = this._extractRequiredPaths(this.schema.structure);
    
    for (const path of requiredPaths) {
      const value = this._getValueByPath(state, path);
      if (value === undefined) {
        errors.push({
          path,
          message: `Required property missing: ${path}`,
          code: 'REQUIRED_PROPERTY_MISSING'
        });
      }
    }
    
    return errors;
  }

  /** @private */
  _extractSchemaPaths(structure, basePath = '') {
    const paths = [];
    
    for (const [key, schemaDef] of Object.entries(structure)) {
      const path = basePath ? `${basePath}.${key}` : key;
      paths.push(path);
      
      if (schemaDef.properties) {
        paths.push(...this._extractSchemaPaths(schemaDef.properties, path));
      }
    }
    
    return paths;
  }

  /** @private */
  _extractRequiredPaths(structure, basePath = '') {
    const paths = [];
    
    for (const [key, schemaDef] of Object.entries(structure)) {
      const path = basePath ? `${basePath}.${key}` : key;
      
      if (schemaDef.required !== false) {
        paths.push(path);
      }
      
      if (schemaDef.properties) {
        paths.push(...this._extractRequiredPaths(schemaDef.properties, path));
      }
    }
    
    return paths;
  }

  /** @private */
  _isPathInSchema(path) {
    return this.cachedPaths.some(schemaPath => 
      schemaPath === path || schemaPath.startsWith(`${path}.`)
    );
  }

  /** @private */
  _getSchemaDefinition(path) {
    // Simplified path resolution - in production use a proper path resolver
    const parts = path.split('.');
    let current = this.schema.structure;
    
    for (const part of parts) {
      if (current && current[part]) {
        current = current[part];
      } else {
        return null;
      }
    }
    
    return current;
  }

  /** @private */
  _getValueByPath(obj, path) {
    return path.split('.').reduce((current, part) => {
      return current && current[part];
    }, obj);
  }
}

// ============================================
// VALIDATION RULES (OCP: Extensible)
// ============================================

/**
 * Rule: State must be serializable (no functions, symbols, etc.)
 */
class SerializableRule extends ValidationRule {
  validate(path, value) {
    const errors = [];
    
    try {
      JSON.stringify(value);
    } catch (error) {
      errors.push({
        path,
        message: `Value at ${path} is not JSON serializable`,
        code: 'NOT_SERIALIZABLE',
        actual: typeof value
      });
    }
    
    return errors;
  }
}

/**
 * Rule: No circular references in state
 */
class NoCircularReferencesRule extends ValidationRule {
  validate(path, value, fullState) {
    const errors = [];
    
    if (typeof value === 'object' && value !== null) {
      const seen = new WeakSet();
      const hasCircular = this._checkCircular(value, seen);
      
      if (hasCircular) {
        errors.push({
          path,
          message: `Circular reference detected at ${path}`,
          code: 'CIRCULAR_REFERENCE'
        });
      }
    }
    
    return errors;
  }
  
  /** @private */
  _checkCircular(obj, seen) {
    if (obj && typeof obj === 'object') {
      if (seen.has(obj)) {
        return true;
      }
      seen.add(obj);
      
      for (const key of Object.keys(obj)) {
        if (this._checkCircular(obj[key], seen)) {
          return true;
        }
      }
    }
    return false;
  }
}

/**
 * Rule: State size limit
 */
class StateSizeRule extends ValidationRule {
  constructor(maxSizeKB = 1024) {
    super();
    this.maxSizeKB = maxSizeKB;
  }
  
  validate(path, value, fullState) {
    const errors = [];
    
    try {
      const jsonString = JSON.stringify(fullState);
      const sizeKB = new Blob([jsonString]).size / 1024;
      
      if (sizeKB > this.maxSizeKB) {
        errors.push({
          path: 'root',
          message: `State too large: ${sizeKB.toFixed(2)}KB exceeds limit of ${this.maxSizeKB}KB`,
          code: 'STATE_TOO_LARGE',
          actual: `${sizeKB.toFixed(2)}KB`,
          expected: `<= ${this.maxSizeKB}KB`
        });
      }
    } catch (error) {
      // Ignore serialization errors (handled by SerializableRule)
    }
    
    return errors;
  }
}

// ============================================
// SANITIZER (Separate concern - SRP)
// ============================================

/**
 * @interface StateSanitizer
 */
class StateSanitizer {
  sanitize(state, schema) {
    throw new Error('sanitize() must be implemented');
  }
  
  sanitizePartial(currentState, partialState, schema) {
    throw new Error('sanitizePartial() must be implemented');
  }
}

/**
 * Basic State Sanitizer - removes undefined values, trims strings
 */
class BasicStateSanitizer extends StateSanitizer {
  sanitize(state, schema) {
    return this._deepSanitize(state, schema.structure);
  }
  
  sanitizePartial(currentState, partialState, schema) {
    const sanitizedPartial = this._deepSanitize(partialState, schema.structure);
    return { ...currentState, ...sanitizedPartial };
  }
  
  /** @private */
  _deepSanitize(obj, schema) {
    if (!obj || typeof obj !== 'object') {
      return obj;
    }
    
    const result = Array.isArray(obj) ? [] : {};
    
    for (const [key, value] of Object.entries(obj)) {
      // Skip undefined values
      if (value === undefined) {
        continue;
      }
      
      // Get schema for this key
      const keySchema = schema && schema[key];
      
      // Process based on type
      if (typeof value === 'string') {
        result[key] = value.trim();
      } else if (typeof value === 'object' && value !== null) {
        if (keySchema && keySchema.properties) {
          result[key] = this._deepSanitize(value, keySchema.properties);
        } else {
          result[key] = this._deepSanitize(value, null);
        }
      } else {
        result[key] = value;
      }
    }
    
    return result;
  }
}

// ============================================
// FACTORY FUNCTIONS (DIP)
// ============================================

/**
 * Create a state validator for the app
 * @param {Object} appSchema - Application state schema
 * @param {Object} [config] - Configuration
 * @returns {CoreStateValidator}
 */
export function createAppStateValidator(appSchema, config = {}) {
  const schema = {
    structure: appSchema,
    strict: config.strict !== false,
    rules: [
      new SerializableRule(),
      new NoCircularReferencesRule(),
      new StateSizeRule(config.maxStateSizeKB || 2048)
    ]
  };
  
  const dependencies = {};
  
  if (config.enableSanitization) {
    dependencies.sanitizer = new BasicStateSanitizer();
  }
  
  return new CoreStateValidator(schema, dependencies);
}

/**
 * Create schema for Vakamova app state
 * @returns {Object} State schema
 */
export function createVakamovaStateSchema() {
  return {
    user: {
      type: 'object',
      properties: {
        id: { type: 'string', pattern: '^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$' },
        email: { type: 'string', pattern: '^[^@]+@[^@]+\\.[^@]+$' },
        name: { type: 'string', minLength: 2, maxLength: 100 },
        subscription: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['free', 'premium', 'trial'] },
            expiresAt: { type: 'number' },
            isActive: { type: 'boolean' }
          }
        }
      }
    },
    lessons: {
      type: 'object',
      properties: {
        currentLevel: { type: 'number', min: 1, max: 100 },
        completedLessons: { type: 'array', items: { type: 'string' } },
        progress: { type: 'number', min: 0, max: 100 }
      }
    },
    settings: {
      type: 'object',
      properties: {
        language: { type: 'string', enum: ['en', 'fa', 'ar', 'fr', 'es', 'de', 'ru', 'zh', 'ja', 'ko', 'tr', 'hi'] },
        notifications: { type: 'boolean' },
        offlineMode: { type: 'boolean' }
      }
    }
  };
}

// ============================================
// EXPORTS
// ============================================

export {
  CoreStateValidator as StateValidator,
  ValidationRule,
  StateSanitizer,
  SerializableRule,
  NoCircularReferencesRule,
  StateSizeRule,
  BasicStateSanitizer
};
