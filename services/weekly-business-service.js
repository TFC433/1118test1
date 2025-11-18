// services/weekly-business-service.js (已優化效能)

/**
 * 專門負責處理與「週間業務」相關的業務邏輯
 */
class WeeklyBusinessService {
    /**
     * @param {object} services - 包含所有已初始化服務的容器
     */
    constructor(services) {
        this.weeklyBusinessReader = services.weeklyBusinessReader;
        this.weeklyBusinessWriter = services.weeklyBusinessWriter;
        this.dateHelpers = services.dateHelpers;
        this.calendarService = services.calendarService;
    }

    /**
     * 【優化】獲取週間業務的摘要列表 (僅包含 weekId 和 summaryCount)
     * @returns {Promise<Array<object>>}
     */
    async getWeeklyBusinessSummaryList() {
        const summaryData = await this.weeklyBusinessReader.getWeeklySummary();

        // 將 weekId 轉換為包含 title 和 dateRange 的完整物件
        const weeksList = summaryData.map(summary => {
            const weekInfo = this.dateHelpers.getWeekInfo(summary.weekId);
            return {
                id: summary.weekId,
                title: weekInfo.title,
                dateRange: weekInfo.dateRange,
                summaryCount: summary.summaryCount
            };
        });

        // 確保即使沒有任何紀錄，也回傳本週的空摘要
        if (weeksList.length === 0) {
            const currentWeekId = this.dateHelpers.getWeekId(new Date());
            const currentWeekInfo = this.dateHelpers.getWeekInfo(currentWeekId);
             weeksList.push({
                 id: currentWeekId,
                 title: currentWeekInfo.title,
                 dateRange: currentWeekInfo.dateRange,
                 summaryCount: 0
             });
        }

        return weeksList.sort((a, b) => b.id.localeCompare(a.id)); // 保持按週次倒序
    }

    /**
     * 【優化】獲取單一週的詳細資料 (包含假日和該週紀錄)
     * @param {string} weekId
     * @returns {Promise<object>}
     */
    async getWeeklyDetails(weekId) {
        console.log(`📊 [WeeklyBusinessService] 獲取週次 ${weekId} 的詳細資料...`);
        // 1. 獲取該週的日期基本資訊
        const weekInfo = this.dateHelpers.getWeekInfo(weekId);

        // 2. 獲取該週的業務紀錄 (從 Reader)
        const entriesForWeek = await this.weeklyBusinessReader.getEntriesForWeek(weekId);
        console.log(`   - 從 Reader 獲取了 ${entriesForWeek.length} 筆 ${weekId} 的紀錄`);

        // 3. 【只查詢當週假日】非同步獲取該週的假日資訊
        const firstDay = new Date(weekInfo.days[0].date + 'T00:00:00Z'); //確保UTC
        const lastDay = new Date(weekInfo.days[weekInfo.days.length - 1].date + 'T00:00:00Z'); //確保UTC
        // 查詢範圍需要包含最後一天
        const endQueryDate = new Date(lastDay.getTime() + 24 * 60 * 60 * 1000);

        console.log(`   - 查詢 ${weekId} 的假日範圍: ${firstDay.toISOString().split('T')[0]} 到 ${endQueryDate.toISOString().split('T')[0]}`);
        const holidays = await this.calendarService.getHolidaysForPeriod(firstDay, endQueryDate);
        console.log(`   - ${weekId} 查詢到 ${holidays.size} 個假日`);


        // 4. 將假日資訊附加到 weekInfo 的 days 陣列中
        weekInfo.days.forEach(day => {
            if (holidays.has(day.date)) {
                day.holidayName = holidays.get(day.date);
                console.log(`   - 找到假日: ${day.date} - ${day.holidayName}`);
            }
        });

        // 5. 組合最終結果
        const weekData = {
            id: weekId,
            ...weekInfo, // 包含已附加假日資訊的 days 陣列
            entries: entriesForWeek // 該週的詳細紀錄
        };

        return weekData;
    }

    /**
     * 產生「新增週報」時的選項 (邏輯不變，但依賴的 getWeeklyBusinessSummaryList 已優化)
     * @returns {Promise<Array<object>>}
     */
    async getWeekOptions() {
        const today = new Date();
        const prevWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

        // 使用優化後的摘要列表來檢查週次是否已存在
        const allWeeks = await this.getWeeklyBusinessSummaryList();
        const existingWeekIds = new Set(allWeeks.map(w => w.id));

        const options = [
            { id: this.dateHelpers.getWeekId(prevWeek), label: '上一週' },
            { id: this.dateHelpers.getWeekId(today),    label: '本週' },
            { id: this.dateHelpers.getWeekId(nextWeek), label: '下一週' }
        ];

        options.forEach(opt => {
            opt.disabled = existingWeekIds.has(opt.id);
        });

        return options;
    }

    /**
     * 建立一筆週間業務紀錄 (邏輯不變)
     * @param {object} data
     * @returns {Promise<object>}
     */
    async createWeeklyBusinessEntry(data) {
        const entryDate = new Date(data.date);
        const weekId = this.dateHelpers.getWeekId(entryDate);
        const fullData = { ...data, weekId };
        return this.weeklyBusinessWriter.createWeeklyBusinessEntry(fullData);
    }

    /**
     * 更新一筆週間業務紀錄 (邏輯不變)
     * @param {string} recordId
     * @param {object} data
     * @returns {Promise<object>}
     */
    async updateWeeklyBusinessEntry(recordId, data) {
        const entryDate = new Date(data.date);
        const weekId = this.dateHelpers.getWeekId(entryDate);
        const fullData = { ...data, weekId };
        return this.weeklyBusinessWriter.updateWeeklyBusinessEntry(recordId, fullData);
    }

     // --- 原 getWeeklyBusinessByWeek 方法已移除 ---
}

module.exports = WeeklyBusinessService;