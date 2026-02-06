/**
 * 📜 Interface Exercise Manager
 * قرارداد مدیریت تمرین‌ها - رعایت ISP (جداسازی رابط)
 */

class ExerciseManagerInterface {
    /**
     * ایجاد تمرین جدید
     * @param {string} type - نوع تمرین (multipleChoice, fillBlank, ...)
     * @param {Object} config - تنظیمات تمرین
     * @returns {Promise<Exercise>} - شیء تمرین ایجاد شده
     */
    async createExercise(type, config) {
        throw new Error('Method not implemented');
    }

    /**
     * ارزیابی پاسخ کاربر
     * @param {string} exerciseId - شناسه تمرین
     * @param {any} userAnswer - پاسخ کاربر
     * @returns {Promise<EvaluationResult>} - نتیجه ارزیابی
     */
    async evaluateAnswer(exerciseId, userAnswer) {
        throw new Error('Method not implemented');
    }

    /**
     * دریافت نکات آموزشی مرتبط با تمرین
     * @param {string} exerciseId - شناسه تمرین
     * @returns {Promise<string[]>} - لیست نکات
     */
    async getExerciseTips(exerciseId) {
        throw new Error('Method not implemented');
    }

    /**
     * محاسبه امتیاز تمرین
     * @param {string} exerciseId - شناسه تمرین
     * @param {EvaluationResult} evaluation - نتیجه ارزیابی
     * @returns {number} - امتیاز
     */
    calculateScore(exerciseId, evaluation) {
        throw new Error('Method not implemented');
    }
}

export default ExerciseManagerInterface;
