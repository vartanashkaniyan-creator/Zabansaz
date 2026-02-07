/**
 * Payment Manager - مدیریت پرداخت
 * رعایت اصول:
 * 1. SRP: فقط مدیریت منطق پرداخت
 * 2. DIP: وابستگی به PaymentAdapterInterface
 * 3. ISP: استفاده از اینترفیس‌های تخصصی
 * 4. قابل تست: تزریق وابستگی‌ها
 */

import { PaymentAdapterInterface } from './payment-interface.js';
import { EventBus } from '../core/event-bus.js';
import { Logger } from '../core/logger.js';

export class PaymentManager {
    /**
     * @param {PaymentAdapterInterface} paymentAdapter - آداپتر پرداخت (تزریق وابستگی)
     * @param {EventBus} eventBus - سیستم رویداد
     * @param {Logger} logger - سیستم لاگ
     */
    constructor(paymentAdapter, eventBus, logger) {
        if (!(paymentAdapter instanceof PaymentAdapterInterface)) {
            throw new Error('Payment adapter must implement PaymentAdapterInterface');
        }
        
        this._adapter = paymentAdapter;
        this._eventBus = eventBus;
        this._logger = logger;
        this._transactions = new Map();
        this._isProcessing = false;
    }

    /**
     * شروع فرآیند پرداخت
     * @param {PaymentRequest} request - درخواست پرداخت
     * @returns {Promise<PaymentResult>}
     */
    async initiatePayment(request) {
        this._validatePaymentRequest(request);
        
        try {
            this._isProcessing = true;
            this._logger.info('Payment initiated', { requestId: request.id });
            
            // انتشار رویداد شروع پرداخت
            this._eventBus.emit('payment:initiated', {
                requestId: request.id,
                amount: request.amount,
                currency: request.currency
            });

            // اعتبارسنجی درخواست
            const validatedRequest = await this._validateRequest(request);
            
            // فراخوانی آداپتر
            const result = await this._adapter.processPayment(validatedRequest);
            
            // ذخیره تراکنش
            this._transactions.set(request.id, {
                ...result,
                timestamp: Date.now(),
                status: 'pending'
            });

            this._logger.info('Payment processed by adapter', { 
                requestId: request.id, 
                transactionId: result.transactionId 
            });

            // انتشار رویداد موفقیت
            this._eventBus.emit('payment:processed', {
                requestId: request.id,
                transactionId: result.transactionId,
                adapter: this._adapter.constructor.name
            });

            return this._createPaymentResult(result, true);

        } catch (error) {
            await this._handlePaymentError(error, request);
            throw error;
        } finally {
            this._isProcessing = false;
        }
    }

    /**
     * تایید پرداخت
     * @param {string} transactionId - شناسه تراکنش
     * @returns {Promise<VerificationResult>}
     */
    async verifyPayment(transactionId) {
        try {
            this._logger.info('Verifying payment', { transactionId });
            
            const result = await this._adapter.verifyPayment(transactionId);
            
            if (result.success && this._transactions.has(transactionId)) {
                const transaction = this._transactions.get(transactionId);
                transaction.status = 'completed';
                transaction.verifiedAt = Date.now();
                
                this._eventBus.emit('payment:verified', {
                    transactionId,
                    amount: transaction.amount,
                    currency: transaction.currency
                });
            }

            return result;

        } catch (error) {
            this._logger.error('Payment verification failed', { 
                transactionId, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * لغو پرداخت
     * @param {string} transactionId - شناسه تراکنش
     * @returns {Promise<CancellationResult>}
     */
    async cancelPayment(transactionId) {
        try {
            this._logger.info('Cancelling payment', { transactionId });
            
            const result = await this._adapter.cancelPayment(transactionId);
            
            if (this._transactions.has(transactionId)) {
                this._transactions.delete(transactionId);
            }

            this._eventBus.emit('payment:cancelled', { transactionId });
            return result;

        } catch (error) {
            this._logger.error('Payment cancellation failed', { 
                transactionId, 
                error: error.message 
            });
            throw error;
        }
    }

    /**
     * دریافت وضعیت تراکنش
     * @param {string} transactionId - شناسه تراکنش
     * @returns {TransactionStatus|null}
     */
    getTransactionStatus(transactionId) {
        if (!this._transactions.has(transactionId)) {
            return null;
        }
        
        const transaction = this._transactions.get(transactionId);
        return {
            id: transactionId,
            status: transaction.status,
            amount: transaction.amount,
            currency: transaction.currency,
            timestamp: transaction.timestamp,
            verifiedAt: transaction.verifiedAt
        };
    }

    /**
     * بررسی در دسترس بودن سرویس پرداخت
     * @returns {Promise<boolean>}
     */
    async isAvailable() {
        return await this._adapter.isAvailable();
    }

    /**
     * اعتبارسنجی درخواست پرداخت
     * @private
     */
    _validatePaymentRequest(request) {
        const errors = [];
        
        if (!request.id || typeof request.id !== 'string') {
            errors.push('Invalid request ID');
        }
        
        if (!request.amount || request.amount <= 0) {
            errors.push('Amount must be positive');
        }
        
        if (!request.currency || !['IRR', 'USD', 'EUR'].includes(request.currency)) {
            errors.push('Invalid currency');
        }
        
        if (!request.userId || typeof request.userId !== 'string') {
            errors.push('Invalid user ID');
        }
        
        if (errors.length > 0) {
            throw new Error(`Payment request validation failed: ${errors.join(', ')}`);
        }
    }

    /**
     * اعتبارسنجی پیشرفته درخواست
     * @private
     */
    async _validateRequest(request) {
        // اعتبارسنجی کسب‌وکار (مثلا محدودیت‌های کاربر)
        const userLimits = await this._checkUserLimits(request.userId);
        if (userLimits.remaining < request.amount) {
            throw new Error('User payment limit exceeded');
        }

        // اعتبارسنجی سرویس‌دهنده
        const isAdapterAvailable = await this._adapter.isAvailable();
        if (!isAdapterAvailable) {
            throw new Error('Payment service is unavailable');
        }

        return {
            ...request,
            validatedAt: Date.now(),
            validationToken: this._generateValidationToken(request)
        };
    }

    /**
     * مدیریت خطاهای پرداخت
     * @private
     */
    async _handlePaymentError(error, request) {
        const errorData = {
            requestId: request.id,
            error: error.message,
            stack: error.stack,
            timestamp: Date.now()
        };

        this._logger.error('Payment processing failed', errorData);
        
        this._eventBus.emit('payment:failed', {
            requestId: request.id,
            reason: error.message,
            recoverable: this._isErrorRecoverable(error)
        });

        // ذخیره خطا برای تحلیل بعدی
        await this._logErrorToAnalytics(errorData);
    }

    /**
     * تولید توکن اعتبارسنجی
     * @private
     */
    _generateValidationToken(request) {
        const data = `${request.id}:${request.amount}:${request.userId}:${Date.now()}`;
        return btoa(data).substring(0, 32);
    }

    /**
     * بررسی محدودیت‌های کاربر
     * @private
     */
    async _checkUserLimits(userId) {
        // در حالت واقعی از سرور دریافت می‌شود
        return {
            userId,
            dailyLimit: 1000000,
            monthlyLimit: 30000000,
            usedToday: 0,
            usedThisMonth: 0,
            remaining: 1000000
        };
    }

    /**
     * بررسی قابلیت بازیابی خطا
     * @private
     */
    _isErrorRecoverable(error) {
        const recoverableErrors = [
            'NetworkError',
            'TimeoutError',
            'ServiceUnavailable'
        ];
        
        return recoverableErrors.some(type => error.message.includes(type));
    }

    /**
     * ذخیره خطا در سیستم تحلیل
     * @private
     */
    async _logErrorToAnalytics(errorData) {
        // در حالت واقعی به سرویس آنالیتیکس ارسال می‌شود
        console.warn('Payment error logged to analytics:', errorData);
    }

    /**
     * ایجاد نتیجه پرداخت استاندارد
     * @private
     */
    _createPaymentResult(adapterResult, success) {
        return {
            success,
            transactionId: adapterResult.transactionId,
            gatewayReference: adapterResult.gatewayReference,
            timestamp: Date.now(),
            nextSteps: success ? ['verify_payment'] : ['retry_or_contact_support']
        };
    }

    /**
     * دریافت آمار پرداخت‌ها
     * @returns {PaymentStatistics}
     */
    getStatistics() {
        const transactions = Array.from(this._transactions.values());
        
        return {
            totalTransactions: transactions.length,
            successful: transactions.filter(t => t.status === 'completed').length,
            pending: transactions.filter(t => t.status === 'pending').length,
            failed: transactions.filter(t => t.status === 'failed').length,
            totalAmount: transactions.reduce((sum, t) => sum + (t.amount || 0), 0),
            lastTransaction: transactions.length > 0 
                ? Math.max(...transactions.map(t => t.timestamp))
                : null
        };
    }
}

/**
 * انواع داده‌ای (برای مستندسازی)
 * 
 * @typedef {Object} PaymentRequest
 * @property {string} id - شناسه یکتای درخواست
 * @property {number} amount - مبلغ پرداخت
 * @property {string} currency - ارز (IRR, USD, EUR)
 * @property {string} userId - شناسه کاربر
 * @property {Object} metadata - متادیتای اضافی
 * 
 * @typedef {Object} PaymentResult
 * @property {boolean} success - وضعیت موفقیت
 * @property {string} transactionId - شناسه تراکنش
 * @property {string} gatewayReference - مرجع درگاه
 * @property {number} timestamp - زمان پرداخت
 * @property {string[]} nextSteps - مراحل بعدی
 * 
 * @typedef {Object} VerificationResult
 * @property {boolean} success - وضعیت تایید
 * @property {string} transactionId - شناسه تراکنش
 * @property {string} verificationCode - کد تایید
 * 
 * @typedef {Object} CancellationResult
 * @property {boolean} success - وضعیت لغو
 * @property {string} transactionId - شناسه تراکنش
 * 
 * @typedef {Object} TransactionStatus
 * @property {string} id - شناسه تراکنش
 * @property {'pending'|'completed'|'failed'} status - وضعیت
 * @property {number} amount - مبلغ
 * @property {string} currency - ارز
 * @property {number} timestamp - زمان ایجاد
 * @property {number} [verifiedAt] - زمان تایید
 * 
 * @typedef {Object} PaymentStatistics
 * @property {number} totalTransactions - کل تراکنش‌ها
 * @property {number} successful - موفق
 * @property {number} pending - در حال انتظار
 * @property {number} failed - ناموفق
 * @property {number} totalAmount - مجموع مبالغ
 * @property {number|null} lastTransaction - آخرین تراکنش
 */
