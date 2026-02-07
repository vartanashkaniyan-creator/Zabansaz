/**
 * 💳 Payment Manager Interfaces
 * قراردادهای انتزاعی سیستم پرداخت - رعایت کامل ISP (جداسازی رابط)
 */

// ==================== اینترفیس پایه پرداخت ====================
class BasePaymentInterface {
    /**
     * دریافت وضعیت کلی سیستم پرداخت
     * @returns {Promise<PaymentSystemStatus>}
     */
    async getSystemStatus() {
        throw new Error('Method not implemented');
    }

    /**
     * راه‌اندازی اولیه سیستم پرداخت
     * @param {PaymentConfig} config - تنظیمات پرداخت
     * @returns {Promise<boolean>}
     */
    async initialize(config) {
        throw new Error('Method not implemented');
    }

    /**
     * اعتبارسنجی تنظیمات پرداخت
     * @param {PaymentConfig} config - تنظیمات
     * @returns {ValidationResult}
     */
    validateConfig(config) {
        throw new Error('Method not implemented');
    }
}

// ==================== اینترفیس درگاه‌های پرداخت ====================
class PaymentGatewayInterface {
    /**
     * دریافت لیست درگاه‌های فعال
     * @returns {Promise<PaymentGateway[]>}
     */
    async getAvailableGateways() {
        throw new Error('Method not implemented');
    }

    /**
     * انتخاب درگاه پرداخت پیش‌فرض
     * @param {string} gatewayId - شناسه درگاه
     * @returns {Promise<boolean>}
     */
    async setDefaultGateway(gatewayId) {
        throw new Error('Method not implemented');
    }

    /**
     * فعال/غیرفعال کردن درگاه
     * @param {string} gatewayId - شناسه درگاه
     * @param {boolean} enabled - وضعیت
     * @returns {Promise<boolean>}
     */
    async toggleGateway(gatewayId, enabled) {
        throw new Error('Method not implemented');
    }

    /**
     * تست اتصال به درگاه پرداخت
     * @param {string} gatewayId - شناسه درگاه
     * @returns {Promise<GatewayTestResult>}
     */
    async testGatewayConnection(gatewayId) {
        throw new Error('Method not implemented');
    }
}

// ==================== اینترفیس مدیریت تراکنش‌ها ====================
class TransactionManagerInterface {
    /**
     * ایجاد تراکنش جدید
     * @param {TransactionRequest} request - درخواست تراکنش
     * @returns {Promise<Transaction>}
     */
    async createTransaction(request) {
        throw new Error('Method not implemented');
    }

    /**
     * تایید تراکنش
     * @param {string} transactionId - شناسه تراکنش
     * @param {Object} verificationData - داده‌های تایید
     * @returns {Promise<Transaction>}
     */
    async verifyTransaction(transactionId, verificationData) {
        throw new Error('Method not implemented');
    }

    /**
     * دریافت تراکنش بر اساس شناسه
     * @param {string} transactionId - شناسه تراکنش
     * @returns {Promise<Transaction>}
     */
    async getTransaction(transactionId) {
        throw new Error('Method not implemented');
    }

    /**
     * جستجوی تراکنش‌ها
     * @param {TransactionQuery} query - پارامترهای جستجو
     * @returns {Promise<Transaction[]>}
     */
    async searchTransactions(query) {
        throw new Error('Method not implemented');
    }

    /**
     * دریافت تاریخچه تراکنش‌های کاربر
     * @param {string} userId - شناسه کاربر
     * @param {Date} startDate - تاریخ شروع
     * @param {Date} endDate - تاریخ پایان
     * @returns {Promise<Transaction[]>}
     */
    async getUserTransactions(userId, startDate, endDate) {
        throw new Error('Method not implemented');
    }
}

// ==================== اینترفیس مدیریت اشتراک‌ها ====================
class SubscriptionManagerInterface {
    /**
     * ایجاد درخواست اشتراک جدید
     * @param {SubscriptionRequest} request - درخواست اشتراک
     * @returns {Promise<Subscription>}
     */
    async createSubscription(request) {
        throw new Error('Method not implemented');
    }

    /**
     * فعال‌سازی اشتراک
     * @param {string} subscriptionId - شناسه اشتراک
     * @returns {Promise<Subscription>}
     */
    async activateSubscription(subscriptionId) {
        throw new Error('Method not implemented');
    }

    /**
     * تمدید اشتراک
     * @param {string} subscriptionId - شناسه اشتراک
     * @returns {Promise<Subscription>}
     */
    async renewSubscription(subscriptionId) {
        throw new Error('Method not implemented');
    }

    /**
     * لغو اشتراک
     * @param {string} subscriptionId - شناسه اشتراک
     * @param {string} reason - دلیل لغو
     * @returns {Promise<boolean>}
     */
    async cancelSubscription(subscriptionId, reason) {
        throw new Error('Method not implemented');
    }

    /**
     * دریافت اطلاعات اشتراک
     * @param {string} subscriptionId - شناسه اشتراک
     * @returns {Promise<Subscription>}
     */
    async getSubscription(subscriptionId) {
        throw new Error('Method not implemented');
    }

    /**
     * بررسی وضعیت اشتراک کاربر
     * @param {string} userId - شناسه کاربر
     * @returns {Promise<UserSubscriptionStatus>}
     */
    async getUserSubscriptionStatus(userId) {
        throw new Error('Method not implemented');
    }
}

// ==================== اینترفیس بازگشت وجه ====================
class RefundManagerInterface {
    /**
     * درخواست بازگشت وجه
     * @param {RefundRequest} request - درخواست بازگشت وجه
     * @returns {Promise<Refund>}
     */
    async requestRefund(request) {
        throw new Error('Method not implemented');
    }

    /**
     * تایید بازگشت وجه
     * @param {string} refundId - شناسه بازگشت وجه
     * @returns {Promise<Refund>}
     */
    async approveRefund(refundId) {
        throw new Error('Method not implemented');
    }

    /**
     * رد درخواست بازگشت وجه
     * @param {string} refundId - شناسه بازگشت وجه
     * @param {string} reason - دلیل رد
     * @returns {Promise<boolean>}
     */
    async rejectRefund(refundId, reason) {
        throw new Error('Method not implemented');
    }

    /**
     * دریافت وضعیت بازگشت وجه
     * @param {string} refundId - شناسه بازگشت وجه
     * @returns {Promise<Refund>}
     */
    async getRefundStatus(refundId) {
        throw new Error('Method not implemented');
    }
}

// ==================== اینترفیس امنیت پرداخت ====================
class PaymentSecurityInterface {
    /**
     * رمزنگاری داده‌های حساس پرداخت
     * @param {PaymentData} data - داده‌های حساس
     * @returns {Promise<EncryptedPaymentData>}
     */
    async encryptPaymentData(data) {
        throw new Error('Method not implemented');
    }

    /**
     * بررسی صحت امضای تراکنش
     * @param {Transaction} transaction - تراکنش
     * @param {string} signature - امضا
     * @returns {Promise<boolean>}
     */
    async verifyTransactionSignature(transaction, signature) {
        throw new Error('Method not implemented');
    }

    /**
     * بررسی تقلب در تراکنش
     * @param {Transaction} transaction - تراکنش
     * @returns {Promise<FraudDetectionResult>}
     */
    async detectFraud(transaction) {
        throw new Error('Method not implemented');
    }

    /**
     * لاگ‌گیری امن پرداخت
     * @param {PaymentLog} log - لاگ پرداخت
     * @returns {Promise<boolean>}
     */
    async logSecurePayment(log) {
        throw new Error('Method not implemented');
    }
}

// ==================== اینترفیس صورتحساب و مالی ====================
class InvoiceManagerInterface {
    /**
     * ایجاد صورتحساب
     * @param {InvoiceRequest} request - درخواست صورتحساب
     * @returns {Promise<Invoice>}
     */
    async createInvoice(request) {
        throw new Error('Method not implemented');
    }

    /**
     * دریافت صورتحساب
     * @param {string} invoiceId - شناسه صورتحساب
     * @returns {Promise<Invoice>}
     */
    async getInvoice(invoiceId) {
        throw new Error('Method not implemented');
    }

    /**
     * دریافت صورتحساب‌های کاربر
     * @param {string} userId - شناسه کاربر
     * @returns {Promise<Invoice[]>}
     */
    async getUserInvoices(userId) {
        throw new Error('Method not implemented');
    }

    /**
     * ارسال صورتحساب از طریق ایمیل
     * @param {string} invoiceId - شناسه صورتحساب
     * @returns {Promise<boolean>}
     */
    async sendInvoiceByEmail(invoiceId) {
        throw new Error('Method not implemented');
    }
}

// ==================== اینترفیس گزارش‌گیری و تحلیل ====================
class PaymentAnalyticsInterface {
    /**
     * دریافت آمار فروش
     * @param {Date} startDate - تاریخ شروع
     * @param {Date} endDate - تاریخ پایان
     * @returns {Promise<SalesReport>}
     */
    async getSalesReport(startDate, endDate) {
        throw new Error('Method not implemented');
    }

    /**
     * دریافت گزارش درآمد
     * @param {string} period - دوره (daily, weekly, monthly, yearly)
     * @returns {Promise<RevenueReport>}
     */
    async getRevenueReport(period) {
        throw new Error('Method not implemented');
    }

    /**
     * دریافت گزارش اشتراک‌ها
     * @returns {Promise<SubscriptionReport>}
     */
    async getSubscriptionReport() {
        throw new Error('Method not implemented');
    }

    /**
     * دریافت گزارش تراکنش‌های ناموفق
     * @param {Date} startDate - تاریخ شروع
     * @param {Date} endDate - تاریخ پایان
     * @returns {Promise<FailedTransactionsReport>}
     */
    async getFailedTransactionsReport(startDate, endDate) {
        throw new Error('Method not implemented');
    }
}

// ==================== اینترفیس اصلی Payment Manager ====================
class PaymentManagerInterface extends BasePaymentInterface {
    constructor() {
        super();
        this.gatewayManager = null;
        this.transactionManager = null;
        this.subscriptionManager = null;
        this.refundManager = null;
        this.securityManager = null;
        this.invoiceManager = null;
        this.analyticsManager = null;
    }

    /**
     * پردازش درخواست پرداخت
     * @param {PaymentRequest} request - درخواست پرداخت
     * @returns {Promise<PaymentResult>}
     */
    async processPayment(request) {
        throw new Error('Method not implemented');
    }

    /**
     * بررسی وضعیت پرداخت
     * @param {string} paymentId - شناسه پرداخت
     * @returns {Promise<PaymentStatus>}
     */
    async checkPaymentStatus(paymentId) {
        throw new Error('Method not implemented');
    }

    /**
     * تایید پرداخت از طریق callback
     * @param {string} gatewayId - شناسه درگاه
     * @param {Object} callbackData - داده‌های callback
     * @returns {Promise<PaymentVerification>}
     */
    async handlePaymentCallback(gatewayId, callbackData) {
        throw new Error('Method not implemented');
    }

    /**
     * بستن روز مالی
     * @returns {Promise<DailyClosing>}
     */
    async closeDailyAccounts() {
        throw new Error('Method not implemented');
    }

    /**
     * تهیه پشتیبان از داده‌های پرداخت
     * @returns {Promise<PaymentBackup>}
     */
    async backupPaymentData() {
        throw new Error('Method not implemented');
    }

    /**
     * بازیابی از پشتیبان
     * @param {string} backupId - شناسه پشتیبان
     * @returns {Promise<boolean>}
     */
    async restoreFromBackup(backupId) {
        throw new Error('Method not implemented');
    }
}

// ==================== نوع‌های داده (Type Definitions) ====================

/**
 * @typedef {Object} PaymentSystemStatus
 * @property {boolean} isActive - وضعیت فعال بودن سیستم
 * @property {string} version - نسخه سیستم پرداخت
 * @property {Date} lastChecked - آخرین بررسی
 * @property {GatewayStatus[]} gatewayStatuses - وضعیت درگاه‌ها
 * @property {SystemMetrics} metrics - متریک‌های سیستم
 */

/**
 * @typedef {Object} PaymentConfig
 * @property {boolean} sandboxMode - حالت آزمایشی
 * @property {string} defaultCurrency - ارز پیش‌فرض
 * @property {number} taxRate - نرخ مالیات
 * @property {boolean} autoRenew - تمدید خودکار اشتراک
 * @property {number} refundPeriodDays - دوره بازگشت وجه (روز)
 * @property {SecurityConfig} security - تنظیمات امنیتی
 */

/**
 * @typedef {Object} PaymentGateway
 * @property {string} id - شناسه درگاه
 * @property {string} name - نام درگاه
 * @property {string} type - نوع (zarinpal, google_play, paypal)
 * @property {boolean} enabled - فعال/غیرفعال
 * @property {boolean} isDefault - درگاه پیش‌فرض
 * @property {GatewayConfig} config - تنظیمات درگاه
 * @property {GatewayCapabilities} capabilities - قابلیت‌ها
 */

/**
 * @typedef {Object} Transaction
 * @property {string} id - شناسه تراکنش
 * @property {string} userId - شناسه کاربر
 * @property {number} amount - مبلغ
 * @property {string} currency - ارز
 * @property {string} gatewayId - شناسه درگاه
 * @property {string} status - وضعیت (pending, success, failed, refunded)
 * @property {string} type - نوع (subscription, one_time, refund)
 * @property {string} description - توضیحات
 * @property {Date} createdAt - زمان ایجاد
 * @property {Date} updatedAt - زمان به‌روزرسانی
 * @property {string} referenceId - شناسه مرجع درگاه
 * @property {Object} metadata - داده‌های اضافی
 */

/**
 * @typedef {Object} Subscription
 * @property {string} id - شناسه اشتراک
 * @property {string} userId - شناسه کاربر
 * @property {string} planId - شناسه پلن
 * @property {string} status - وضعیت (active, expired, canceled)
 * @property {Date} startDate - تاریخ شروع
 * @property {Date} expiryDate - تاریخ انقضا
 * @property {boolean} autoRenew - تمدید خودکار
 * @property {string} paymentMethod - روش پرداخت
 * @property {number} price - قیمت
 * @property {string} currency - ارز
 * @property {string[]} features - ویژگی‌ها
 * @property {Date} nextBillingDate - تاریخ صورتحساب بعدی
 */

/**
 * @typedef {Object} Refund
 * @property {string} id - شناسه بازگشت وجه
 * @property {string} transactionId - شناسه تراکنش مرتبط
 * @property {string} userId - شناسه کاربر
 * @property {number} amount - مبلغ بازگشتی
 * @property {string} reason - دلیل بازگشت وجه
 * @property {string} status - وضعیت (pending, approved, rejected)
 * @property {Date} requestedAt - زمان درخواست
 * @property {Date} processedAt - زمان پردازش
 * @property {string} processorId - شناسه پردازنده
 */

/**
 * @typedef {Object} Invoice
 * @property {string} id - شناسه صورتحساب
 * @property {string} userId - شناسه کاربر
 * @property {string} subscriptionId - شناسه اشتراک
 * @property {number} amount - مبلغ
 * @property {string} currency - ارز
 * @property {string} status - وضعیت (paid, unpaid, overdue)
 * @property {Date} issueDate - تاریخ صدور
 * @property {Date} dueDate - تاریخ سررسید
 * @property {Date} paidDate - تاریخ پرداخت
 * @property {InvoiceItem[]} items - آیتم‌ها
 * @property {TaxBreakdown} taxes - جزئیات مالیات
 * @property {string} pdfUrl - آدرس PDF صورتحساب
 */

/**
 * @typedef {Object} PaymentRequest
 * @property {string} userId - شناسه کاربر
 * @property {number} amount - مبلغ
 * @property {string} currency - ارز
 * @property {string} description - توضیحات
 * @property {string} gatewayId - شناسه درگاه
 * @property {string} callbackUrl - آدرس بازگشت
 * @property {Object} metadata - داده‌های اضافی
 */

/**
 * @typedef {Object} PaymentResult
 * @property {boolean} success - موفقیت/عدم موفقیت
 * @property {string} paymentId - شناسه پرداخت
 * @property {string} gatewayId - شناسه درگاه
 * @property {string} redirectUrl - آدرس ریدایرکت
 * @property {string} status - وضعیت
 * @property {string} message - پیام
 */

/**
 * @typedef {Object} SalesReport
 * @property {Date} periodStart - شروع دوره
 * @property {Date} periodEnd - پایان دوره
 * @property {number} totalSales - کل فروش
 * @property {number} totalTransactions - تعداد تراکنش‌ها
 * @property {number} averageTransaction - میانگین تراکنش
 * @property {SalesByGateway[]} salesByGateway - فروش بر اساس درگاه
 * @property {SalesByPlan[]} salesByPlan - فروش بر اساس پلن
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - اعتبارسنجی موفق/ناموفق
 * @property {string[]} errors - خطاها
 * @property {string[]} warnings - اخطارها
 */

/**
 * @typedef {Object} GatewayTestResult
 * @property {boolean} connected - وضعیت اتصال
 * @property {number} responseTime - زمان پاسخ (میلی‌ثانیه)
 * @property {string} status - وضعیت
 * @property {string} message - پیام
 */

/**
 * @typedef {Object} UserSubscriptionStatus
 * @property {boolean} hasActiveSubscription - اشتراک فعال دارد
 * @property {Subscription} currentSubscription - اشتراک فعلی
 * @property {Date} expiryDate - تاریخ انقضا
 * @property {boolean} willAutoRenew - تمدید خودکار خواهد شد
 * @property {number} daysRemaining - روزهای باقیمانده
 */

/**
 * @typedef {Object} FraudDetectionResult
 * @property {boolean} isFraudulent - کلاهبرداری است/نیست
 * @property {number} riskScore - امتیاز ریسک (0-100)
 * @property {string[]} reasons - دلایل
 * @property {string} recommendation - توصیه
 */

/**
 * @typedef {Object} DailyClosing
 * @property {Date} date - تاریخ
 * @property {number} totalTransactions - کل تراکنش‌ها
 * @property {number} totalAmount - کل مبلغ
 * @property {number} successfulTransactions - تراکنش‌های موفق
 * @property {number} failedTransactions - تراکنش‌های ناموفق
 * @property {Transaction[]} transactions - تراکنش‌ها
 */

// اکسپورت اینترفیس‌ها
export {
    BasePaymentInterface,
    PaymentGatewayInterface,
    TransactionManagerInterface,
    SubscriptionManagerInterface,
    RefundManagerInterface,
    PaymentSecurityInterface,
    InvoiceManagerInterface,
    PaymentAnalyticsInterface,
    PaymentManagerInterface
};
