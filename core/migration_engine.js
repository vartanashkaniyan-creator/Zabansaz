// core/migration-engine.js

/**
 * رابط انتزاعی برای موتور مهاجرت دیتابیس
 * @interface
 */
class IMigrationEngine {
  async migrate(fromVersion, toVersion) { throw new Error('Not implemented'); }
  async registerDataMigration(version, migrationFunction) { throw new Error('Not implemented'); }
  async registerSchemaMigration(version, migrationFunction) { throw new Error('Not implemented'); }
  async getMigrationHistory() { throw new Error('Not implemented'); }
  async rollback(version) { throw new Error('Not implemented'); }
  async needsMigration(currentVersion) { throw new Error('Not implemented'); }
}

/**
 * پیاده‌سازی موتور مهاجرت
 * @implements {IMigrationEngine}
 */
class MigrationEngine extends IMigrationEngine {
  constructor(database, schemaManager) {
    super();
    
    // وابستگی‌ها از طریق DIP
    if (!database || !database.init) throw new Error('Valid IDatabase implementation required');
    if (!schemaManager || !schemaManager.getSchema) throw new Error('Valid ISchemaManager required');
    
    this.database = database;
    this.schemaManager = schemaManager;
    
    // ذخیره migrationهای سفارشی
    this.dataMigrations = new Map(); // version -> function
    this.schemaMigrations = new Map(); // version -> function
    
    // تاریخچه مهاجرت‌ها
    this.migrationHistory = [];
    this.migrationHistoryKey = '_migration_history';
  }

  /**
   * بررسی نیاز به مهاجرت
   */
  async needsMigration(currentVersion) {
    try {
      const latestSchema = await this.schemaManager.getSchema();
      return currentVersion < latestSchema.version;
    } catch (error) {
      console.warn('Could not check migration needs:', error.message);
      return false;
    }
  }

  /**
   * اجرای مهاجرت از نسخه فعلی به نسخه هدف
   */
  async migrate(fromVersion, toVersion = null) {
    console.log(`Starting migration from v${fromVersion} to v${toVersion || 'latest'}`);
    
    // دریافت نسخه هدف
    const targetSchema = await this.schemaManager.getSchema(toVersion);
    const targetVersion = targetSchema.version;
    
    if (fromVersion === targetVersion) {
      console.log('Already at target version');
      return { success: true, skipped: true };
    }
    
    if (fromVersion > targetVersion) {
      throw new Error(`Cannot downgrade from v${fromVersion} to v${targetVersion}`);
    }

    const startTime = Date.now();
    const steps = await this._calculateMigrationSteps(fromVersion, targetVersion);
    
    // اجرای مهاجرت‌ها به صورت تراکنشی
    await this._executeMigrationTransaction(steps, fromVersion, targetVersion);
    
    // ذخیره تاریخچه
    await this._recordMigrationHistory({
      fromVersion,
      toVersion: targetVersion,
      steps: steps.length,
      timestamp: new Date().toISOString(),
      duration: Date.now() - startTime
    });
    
    console.log(`Migration completed in ${Date.now() - startTime}ms`);
    return {
      success: true,
      fromVersion,
      toVersion: targetVersion,
      steps: steps.length
    };
  }

  /**
   * ثبت migration سفارشی برای داده‌ها
   */
  async registerDataMigration(version, migrationFunction) {
    this._validateMigrationFunction(migrationFunction, 'Data migration');
    this.dataMigrations.set(version, migrationFunction);
    console.log(`Registered data migration for v${version}`);
  }

  /**
   * ثبت migration سفارشی برای اسکیما
   */
  async registerSchemaMigration(version, migrationFunction) {
    this._validateMigrationFunction(migrationFunction, 'Schema migration');
    this.schemaMigrations.set(version, migrationFunction);
    console.log(`Registered schema migration for v${version}`);
  }

  /**
   * دریافت تاریخچه مهاجرت‌ها
   */
  async getMigrationHistory() {
    try {
      // تلاش برای بارگذاری از دیتابیس
      if (await this.database.isReady()) {
        const history = await this.database.queryByIndex(
          '_system',
          'type',
          'migration_history'
        ).catch(() => []);
        return history;
      }
    } catch (error) {
      console.warn('Could not load migration history:', error.message);
    }
    
    // Fallback به حافظه
    return this.migrationHistory;
  }

  /**
   * بازگرداندن به نسخه قبلی
   */
  async rollback(version) {
    console.log(`Rolling back to version ${version}`);
    
    const currentSchema = await this.schemaManager.getSchema();
    if (currentSchema.version <= version) {
      throw new Error(`Current version v${currentSchema.version} is already at or below target v${version}`);
    }
    
    // دریافت تاریخچه
    const history = await this.getMigrationHistory();
    const relevantMigrations = history
      .filter(h => h.fromVersion >= version && h.toVersion <= currentSchema.version)
      .sort((a, b) => b.toVersion - a.toVersion);
    
    if (relevantMigrations.length === 0) {
      throw new Error(`No migration history found for rollback to v${version}`);
    }
    
    // اجرای rollback برای هر migration (معکوس)
    for (const migration of relevantMigrations) {
      console.log(`Rolling back migration v${migration.fromVersion} -> v${migration.toVersion}`);
      
      // در این پیاده‌سازی ساده، فقط نسخه را کاهش می‌دهیم
      // در پیاده‌سازی واقعی، باید reverse migrationها ذخیره و اجرا شوند
      await this._executeRollbackStep(migration);
    }
    
    console.log(`Rollback to v${version} completed`);
    return { success: true, targetVersion: version };
  }

  /**
   * محاسبه مراحل مهاجرت
   * @private
   */
  async _calculateMigrationSteps(fromVersion, toVersion) {
    const steps = [];
    
    // مهاجرت مرحله به مرحله
    for (let current = fromVersion; current < toVersion; current++) {
      const next = current + 1;
      
      // 1. دریافت تغییرات اسکیما
      const schemaChanges = await this.schemaManager.getMigrationSteps(current, next);
      
      // 2. اضافه کردن migration سفارشی اسکیما اگر وجود دارد
      const customSchemaMigration = this.schemaMigrations.get(next);
      if (customSchemaMigration) {
        steps.push({
          type: 'custom_schema',
          version: next,
          function: customSchemaMigration
        });
      }
      
      // 3. اضافه کردن تغییرات ساختاری
      if (schemaChanges.createStores.length > 0) {
        steps.push({
          type: 'create_stores',
          version: next,
          stores: schemaChanges.createStores
        });
      }
      
      if (schemaChanges.modifyStores.length > 0) {
        steps.push({
          type: 'modify_stores',
          version: next,
          modifications: schemaChanges.modifyStores
        });
      }
      
      if (schemaChanges.deleteStores.length > 0) {
        steps.push({
          type: 'delete_stores',
          version: next,
          stores: schemaChanges.deleteStores
        });
      }
      
      // 4. اضافه کردن migration سفارشی داده‌ها
      const customDataMigration = this.dataMigrations.get(next);
      if (customDataMigration) {
        steps.push({
          type: 'custom_data',
          version: next,
          function: customDataMigration
        });
      }
    }
    
    return steps;
  }

  /**
   * اجرای مهاجرت در قالب تراکنش
   * @private
   */
  async _executeMigrationTransaction(steps, fromVersion, toVersion) {
    console.log(`Executing ${steps.length} migration steps...`);
    
    for (const [index, step] of steps.entries()) {
      console.log(`Step ${index + 1}/${steps.length}: ${step.type} for v${step.version}`);
      
      try {
        switch (step.type) {
          case 'create_stores':
            await this._createStores(step.stores);
            break;
            
          case 'modify_stores':
            await this._modifyStores(step.modifications);
            break;
            
          case 'delete_stores':
            await this._deleteStores(step.stores);
            break;
            
          case 'custom_schema':
            await step.function(this.database, this.schemaManager);
            break;
            
          case 'custom_data':
            await step.function(this.database, this.schemaManager);
            break;
            
          default:
            console.warn(`Unknown migration step type: ${step.type}`);
        }
        
        console.log(`✓ Step ${index + 1} completed`);
      } catch (error) {
        console.error(`✗ Failed at step ${index + 1} (${step.type}):`, error);
        throw new Error(`Migration failed at step ${index + 1}: ${error.message}`);
      }
    }
  }

  /**
   * ایجاد storeهای جدید
   * @private
   */
  async _createStores(stores) {
    // در IndexedDB، storeها فقط در event onupgradeneeded ایجاد می‌شوند
    // بنابراین باید نسخه دیتابیس را افزایش دهیم
    console.log(`Creating ${stores.length} new store(s):`, stores.map(s => s.name));
    
    // این عملیات نیاز به بسته شدن و بازگشایی دیتابیس با نسخه جدید دارد
    // در این نمونه ساده، فقط لاگ می‌کنیم
    // در پیاده‌سازی واقعی، باید منطق خاص IndexedDB را پیاده‌سازی کرد
  }

  /**
   * تغییر storeهای موجود
   * @private
   */
  async _modifyStores(modifications) {
    for (const mod of modifications) {
      console.log(`Modifying store: ${mod.storeName}`);
      
      if (mod.indexesAdded.length > 0) {
        console.log(`  Adding indexes: ${mod.indexesAdded.map(i => i.name).join(', ')}`);
      }
      
      if (mod.indexesRemoved.length > 0) {
        console.log(`  Removing indexes: ${mod.indexesRemoved.map(i => i.name).join(', ')}`);
      }
    }
  }

  /**
   * حذف storeها
   * @private
   */
  async _deleteStores(stores) {
    console.log(`Deleting ${stores.length} store(s):`, stores.map(s => s.name));
    
    // هشدار: حذف store باعث از بین رفتن داده‌ها می‌شود
    // در این نمونه، فقط لاگ می‌کنیم
  }

  /**
   * اجرای یک مرحله rollback
   * @private
   */
  async _executeRollbackStep(migrationRecord) {
    // پیاده‌سازی ساده: فقط تاریخچه را به روز می‌کنیم
    console.log(`Reversing migration to v${migrationRecord.toVersion}`);
    
    // در پیاده‌سازی واقعی، باید reverse migrationها اجرا شوند
    return true;
  }

  /**
   * ذخیره تاریخچه مهاجرت
   * @private
   */
  async _recordMigrationHistory(record) {
    const historyEntry = {
      id: `migration_${Date.now()}`,
      type: 'migration_history',
      ...record
    };
    
    this.migrationHistory.push(historyEntry);
    
    // ذخیره در دیتابیس اگر آماده است
    try {
      if (await this.database.isReady()) {
        await this.database.add('_system', historyEntry);
      }
    } catch (error) {
      console.warn('Could not save migration history to database:', error.message);
    }
  }

  /**
   * اعتبارسنجی تابع migration
   * @private
   */
  _validateMigrationFunction(func, funcType) {
    if (typeof func !== 'function') {
      throw new Error(`${funcType} must be a function`);
    }
    
    if (func.length < 2) {
      console.warn(`${funcType} should accept at least 2 parameters (database, schemaManager)`);
    }
  }
}

export default MigrationEngine;
