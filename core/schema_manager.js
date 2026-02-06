// core/schema-manager.js

/**
 * رابط انتزاعی برای مدیریت اسکیما
 * @interface
 */
class ISchemaManager {
  async defineSchema(version, stores) { throw new Error('Not implemented'); }
  async getSchema(version = null) { throw new Error('Not implemented'); }
  async validateSchema(schema) { throw new Error('Not implemented'); }
  async getMigrationSteps(fromVersion, toVersion) { throw new Error('Not implemented'); }
  async registerCustomValidator(storeName, validator) { throw new Error('Not implemented'); }
  async getStoreDefinition(storeName, version = null) { throw new Error('Not implemented'); }
}

/**
 * پیاده‌سازی مدیریت اسکیما
 * @implements {ISchemaManager}
 */
class SchemaManager extends ISchemaManager {
  constructor() {
    super();
    this.schemas = new Map(); // version -> schema
    this.customValidators = new Map(); // storeName -> validator function
    this.currentVersion = 0;
  }

  /**
   * تعریف اسکیما جدید برای یک نسخه
   * @param {number} version - شماره نسخه
   * @param {Array} stores - آرایه‌ای از تعاریف storeها
   */
  async defineSchema(version, stores) {
    if (version <= this.currentVersion) {
      throw new Error(`Version ${version} must be greater than current version ${this.currentVersion}`);
    }

    const schema = {
      version,
      stores: [],
      createdAt: new Date().toISOString()
    };

    // اعتبارسنجی و اضافه کردن storeها
    for (const store of stores) {
      const validatedStore = await this._validateStoreDefinition(store);
      schema.stores.push(validatedStore);
    }

    // بررسی عدم تداخل نام storeها
    await this._checkStoreNameConflicts(schema);

    this.schemas.set(version, schema);
    this.currentVersion = version;
    
    return schema;
  }

  /**
   * دریافت اسکیما برای نسخه خاص
   */
  async getSchema(version = null) {
    const targetVersion = version || this.currentVersion;
    
    if (!this.schemas.has(targetVersion)) {
      throw new Error(`Schema version ${targetVersion} not found`);
    }
    
    return this.schemas.get(targetVersion);
  }

  /**
   * اعتبارسنجی کامل یک اسکیما
   */
  async validateSchema(schema) {
    const errors = [];

    // بررسی ساختار اصلی
    if (!schema.version || typeof schema.version !== 'number') {
      errors.push('Schema must have a numeric version');
    }

    if (!Array.isArray(schema.stores)) {
      errors.push('Schema must have a stores array');
    } else {
      // اعتبارسنجی هر store
      for (const [index, store] of schema.stores.entries()) {
        try {
          await this._validateStoreDefinition(store);
        } catch (error) {
          errors.push(`Store at index ${index}: ${error.message}`);
        }
      }

      // بررسی نام‌های تکراری
      const storeNames = new Set();
      for (const store of schema.stores) {
        if (storeNames.has(store.name)) {
          errors.push(`Duplicate store name: ${store.name}`);
        }
        storeNames.add(store.name);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Schema validation failed:\n${errors.join('\n')}`);
    }

    return true;
  }

  /**
   * دریافت مراحل مهاجرت بین دو نسخه
   */
  async getMigrationSteps(fromVersion, toVersion) {
    if (!this.schemas.has(fromVersion) || !this.schemas.has(toVersion)) {
      throw new Error('One or both schema versions not found');
    }

    const fromSchema = this.schemas.get(fromVersion);
    const toSchema = this.schemas.get(toVersion);

    const steps = {
      createStores: [],
      deleteStores: [],
      modifyStores: [],
      createIndexes: [],
      deleteIndexes: []
    };

    // مقایسه storeها
    const fromStores = new Map(fromSchema.stores.map(s => [s.name, s]));
    const toStores = new Map(toSchema.stores.map(s => [s.name, s]));

    // پیدا کردن storeهای جدید
    for (const [name, toStore] of toStores) {
      if (!fromStores.has(name)) {
        steps.createStores.push(toStore);
      } else {
        // مقایسه store موجود
        const fromStore = fromStores.get(name);
        const modifications = this._compareStores(fromStore, toStore);
        if (modifications.hasChanges) {
          steps.modifyStores.push({
            storeName: name,
            ...modifications
          });
        }
      }
    }

    // پیدا کردن storeهای حذف شده
    for (const [name, fromStore] of fromStores) {
      if (!toStores.has(name)) {
        steps.deleteStores.push(fromStore);
      }
    }

    return steps;
  }

  /**
   * ثبت validator سفارشی برای یک store
   */
  async registerCustomValidator(storeName, validator) {
    if (typeof validator !== 'function') {
      throw new Error('Validator must be a function');
    }
    this.customValidators.set(storeName, validator);
  }

  /**
   * دریافت تعریف یک store خاص
   */
  async getStoreDefinition(storeName, version = null) {
    const schema = await this.getSchema(version);
    const store = schema.stores.find(s => s.name === storeName);
    
    if (!store) {
      throw new Error(`Store "${storeName}" not found in schema version ${version || this.currentVersion}`);
    }
    
    return store;
  }

  /**
   * اعتبارسنجی تعریف یک store
   * @private
   */
  async _validateStoreDefinition(store) {
    const errors = [];

    // بررسی فیلدهای ضروری
    if (!store.name || typeof store.name !== 'string') {
      errors.push('Store must have a string name');
    }

    if (store.keyPath && typeof store.keyPath !== 'string') {
      errors.push('keyPath must be a string if provided');
    }

    if (store.autoIncrement && typeof store.autoIncrement !== 'boolean') {
      errors.push('autoIncrement must be a boolean if provided');
    }

    // اعتبارسنجی indexes
    if (store.indexes) {
      if (!Array.isArray(store.indexes)) {
        errors.push('Indexes must be an array');
      } else {
        const indexNames = new Set();
        for (const [index, idx] of store.indexes.entries()) {
          if (!idx.name || typeof idx.name !== 'string') {
            errors.push(`Index ${index} must have a string name`);
          } else if (indexNames.has(idx.name)) {
            errors.push(`Duplicate index name: ${idx.name}`);
          }
          indexNames.add(idx.name);

          if (!idx.keyPath || typeof idx.keyPath !== 'string') {
            errors.push(`Index ${idx.name} must have a string keyPath`);
          }

          if (idx.unique !== undefined && typeof idx.unique !== 'boolean') {
            errors.push(`Index ${idx.name} unique must be boolean if provided`);
          }

          if (idx.multiEntry !== undefined && typeof idx.multiEntry !== 'boolean') {
            errors.push(`Index ${idx.name} multiEntry must be boolean if provided`);
          }
        }
      }
    }

    // اجرای validator سفارشی
    const customValidator = this.customValidators.get(store.name);
    if (customValidator) {
      try {
        const customResult = await customValidator(store);
        if (customResult !== true) {
          errors.push(`Custom validation failed: ${customResult}`);
        }
      } catch (error) {
        errors.push(`Custom validator error: ${error.message}`);
      }
    }

    if (errors.length > 0) {
      throw new Error(`Store "${store.name}" invalid:\n${errors.join('\n')}`);
    }

    return {
      name: store.name,
      keyPath: store.keyPath || 'id',
      autoIncrement: store.autoIncrement || false,
      indexes: store.indexes || []
    };
  }

  /**
   * بررسی تداخل نام storeها
   * @private
   */
  async _checkStoreNameConflicts(schema) {
    const allStoreNames = new Set();
    
    // جمع‌آوری نام‌ها از تمام نسخه‌ها
    for (const existingSchema of this.schemas.values()) {
      for (const store of existingSchema.stores) {
        allStoreNames.add(store.name);
      }
    }
    
    // بررسی با اسکیما جدید
    for (const store of schema.stores) {
      if (allStoreNames.has(store.name)) {
        throw new Error(`Store name "${store.name}" conflicts with existing store`);
      }
    }
  }

  /**
   * مقایسه دو store
   * @private
   */
  _compareStores(fromStore, toStore) {
    const changes = {
      hasChanges: false,
      keyPathChanged: fromStore.keyPath !== toStore.keyPath,
      autoIncrementChanged: fromStore.autoIncrement !== toStore.autoIncrement,
      indexesAdded: [],
      indexesRemoved: [],
      indexesModified: []
    };

    // مقایسه indexes
    const fromIndexes = new Map(fromStore.indexes.map(i => [i.name, i]));
    const toIndexes = new Map(toStore.indexes.map(i => [i.name, i]));

    for (const [name, toIndex] of toIndexes) {
      if (!fromIndexes.has(name)) {
        changes.indexesAdded.push(toIndex);
      } else {
        const fromIndex = fromIndexes.get(name);
        if (JSON.stringify(fromIndex) !== JSON.stringify(toIndex)) {
          changes.indexesModified.push({
            name,
            from: fromIndex,
            to: toIndex
          });
        }
      }
    }

    for (const [name, fromIndex] of fromIndexes) {
      if (!toIndexes.has(name)) {
        changes.indexesRemoved.push(fromIndex);
      }
    }

    changes.hasChanges = changes.keyPathChanged || 
                         changes.autoIncrementChanged || 
                         changes.indexesAdded.length > 0 ||
                         changes.indexesRemoved.length > 0 ||
                         changes.indexesModified.length > 0;

    return changes;
  }
}

export default SchemaManager;
