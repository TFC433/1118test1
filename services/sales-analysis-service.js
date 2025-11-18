// services/sales-analysis-service.js

/**
 * 專門負責處理成交與金額分析的業務邏輯
 */
class SalesAnalysisService {
    /**
     * @param {object} services - 包含所有已初始化服務的容器
     */
    constructor(services) {
        this.opportunityReader = services.opportunityReader;
        this.systemReader = services.systemReader;
        this.config = services.config;
        // --- !!! 重要：請確認您系統設定中「受注」階段的實際值並修改這裡 !!! ---
        this.WON_STAGE_VALUE = '受注'; // <---- 請根據您的 Google Sheet 設定修改此值
        // --- !!! ---
    }

    /**
     * 獲取指定時間範圍內的成交分析數據
     * @param {string} startDateISO - 開始日期 (ISO 格式字串)
     * @param {string} endDateISO - 結束日期 (ISO 格式字串)
     * @returns {Promise<object>} - 包含分析結果的物件
     */
    async getSalesAnalysisData(startDateISO, endDateISO) {
        console.log(`📈 [SalesAnalysisService] 計算成交分析資料 (${startDateISO} - ${endDateISO})...`);
        console.log(`   *** 使用 "${this.WON_STAGE_VALUE}" 階段作為成交定義 ***`); // 添加日誌確認

        const allOpportunities = await this.opportunityReader.getOpportunities();
        const systemConfig = await this.systemReader.getSystemConfig();

        // 預設時間範圍：如果未提供，則預設為過去 365 天
        const endDate = endDateISO ? new Date(endDateISO) : new Date();
        const startDate = startDateISO ? new Date(startDateISO) : new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
        // 將結束日期設為當天結束
        endDate.setHours(23, 59, 59, 999);
        // 將開始日期設為當天開始
        startDate.setHours(0, 0, 0, 0);

        const wonOpportunities = []; // 所有被認定為成交的案件 (階段符合)
        const wonOpportunitiesInDateRange = []; // 在日期範圍內成交的案件 (階段符合 + 日期符合)

        allOpportunities.forEach(opp => {
            if (opp.currentStage === this.WON_STAGE_VALUE) {
                wonOpportunities.push(opp);

                const closeDateStr = opp.expectedCloseDate || opp.lastUpdateTime;
                if (closeDateStr) {
                    const closeDate = new Date(closeDateStr);
                    if (!isNaN(closeDate.getTime()) && closeDate >= startDate && closeDate <= endDate) {
                        wonOpportunitiesInDateRange.push(opp);
                    }
                }
            }
        });

        console.log(`   - 找到 ${wonOpportunities.length} 筆 '${this.WON_STAGE_VALUE}' 階段案件 (用於總數)`);
        console.log(`   - 其中 ${wonOpportunitiesInDateRange.length} 筆在指定日期範圍內 (用於趨勢圖)`);

        // 2. 計算績效概覽 (使用所有 '成交階段' 的案件)
        let totalWonValue = 0;
        let totalSalesCycleDays = 0;
        let validSalesCycleCount = 0;

        wonOpportunities.forEach(opp => {
            const value = parseFloat(String(opp.opportunityValue || '0').replace(/,/g, ''));
            if (!isNaN(value)) {
                totalWonValue += value;
            }

            if (opp.createdTime && opp.expectedCloseDate) {
                try {
                    const createdDate = new Date(opp.createdTime);
                    const closedDate = new Date(opp.expectedCloseDate);
                    if (!isNaN(createdDate.getTime()) && !isNaN(closedDate.getTime())) {
                        const diffTime = Math.abs(closedDate - createdDate);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        totalSalesCycleDays += diffDays;
                        validSalesCycleCount++;
                    }
                } catch (e) {
                    console.warn(`計算成交週期時出錯，案件ID: ${opp.opportunityId}`, e);
                }
            }
        });
        const totalWonDeals = wonOpportunities.length;
        const averageDealValue = totalWonDeals > 0 ? totalWonValue / totalWonDeals : 0;
        const averageSalesCycleInDays = validSalesCycleCount > 0 ? Math.round(totalSalesCycleDays / validSalesCycleCount) : 0;

        const overview = {
            totalWonValue: totalWonValue,
            totalWonDeals: totalWonDeals,
            averageDealValue: averageDealValue,
            averageSalesCycleInDays: averageSalesCycleInDays,
        };
        console.log(`   - 平均成交週期: ${averageSalesCycleInDays} 天 (基於 ${validSalesCycleCount} 筆有效資料)`);

        // --- 3. 準備趨勢資料 (包含每月平均成交週期) ---
        const trendData = {}; // { 'YYYY-MM': { value: 0, count: 0, totalCycleDays: 0, cycleCount: 0 } }
        wonOpportunitiesInDateRange.forEach(opp => {
            const closeDateStr = opp.expectedCloseDate || opp.lastUpdateTime;
            const closeDate = new Date(closeDateStr);
            const monthKey = `${closeDate.getFullYear()}-${String(closeDate.getMonth() + 1).padStart(2, '0')}`;
            if (!trendData[monthKey]) {
                trendData[monthKey] = { value: 0, count: 0, totalCycleDays: 0, cycleCount: 0 };
            }
            // 金額與數量
            const value = parseFloat(String(opp.opportunityValue || '0').replace(/,/g, ''));
            if (!isNaN(value)) {
                trendData[monthKey].value += value;
            }
            trendData[monthKey].count += 1;
            // 成交週期
            if (opp.createdTime && opp.expectedCloseDate) {
                 try {
                    const createdDate = new Date(opp.createdTime);
                    const closedDate = new Date(opp.expectedCloseDate); // 使用結案日期
                    if (!isNaN(createdDate.getTime()) && !isNaN(closedDate.getTime())) {
                        const diffTime = Math.abs(closedDate - createdDate);
                        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                        trendData[monthKey].totalCycleDays += diffDays;
                        trendData[monthKey].cycleCount += 1;
                    }
                } catch (e) { /* ignore calculation error for trend */ }
            }
        });
        // 確保趨勢圖包含所有在範圍內的月份，並計算平均週期
        const trendChartData = [];
        let currentDate = new Date(startDate);
        while (currentDate <= endDate) {
            const monthKey = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}`;
            const monthData = trendData[monthKey];
            const avgCycle = (monthData && monthData.cycleCount > 0)
                ? Math.round(monthData.totalCycleDays / monthData.cycleCount)
                : 0; // 如果該月沒有有效週期資料，則為 0

            trendChartData.push({
                month: monthKey,
                value: monthData?.value || 0,
                count: monthData?.count || 0,
                avgSalesCycle: avgCycle // 新增每月平均成交週期
            });
            // 移至下個月第一天
            currentDate.setMonth(currentDate.getMonth() + 1);
            currentDate.setDate(1);
        }
        // 按月份排序
        trendChartData.sort((a, b) => a.month.localeCompare(b.month));
        // --- 趨勢資料準備結束 ---


        // 4. 準備分組資料 (來源、類型、業務員，使用所有 '成交階段' 的案件)
        const sourceAnalysis = this._analyzeByGroup(wonOpportunities, 'opportunitySource', '機會來源', systemConfig);
        const typeAnalysis = this._analyzeByGroup(wonOpportunities, 'opportunityType', '機會種類', systemConfig);
        const assigneeAnalysis = this._analyzeByGroup(wonOpportunities, 'assignee', '團隊成員', systemConfig);

        // 5. 高價值成交案件列表 (使用所有 '成交階段' 的案件)
        const topDeals = wonOpportunities
            .map(opp => ({
                ...opp,
                numericValue: parseFloat(String(opp.opportunityValue || '0').replace(/,/g, '')) || 0,
                wonDate: opp.expectedCloseDate || opp.lastUpdateTime || opp.createdTime
            }))
            .sort((a, b) => b.numericValue - a.numericValue)
            .slice(0, 20);

        console.log(`✅ [SalesAnalysisService] 成交分析資料計算完成`);

        return {
            overview,
            trendChartData, // 現在包含 avgSalesCycle
            sourceAnalysis,
            typeAnalysis,
            assigneeAnalysis,
            topDeals,
        };
    }

    /**
     * 內部輔助函式：按指定欄位分組並計算總金額與數量
     * @private
     */
    _analyzeByGroup(opportunities, groupKey, configKey, systemConfig) {
        const groupData = {}; // { 'groupValue': { value: 0, count: 0 } }
        const nameMap = new Map((systemConfig[configKey] || []).map(item => [item.value, item.note]));

        opportunities.forEach(opp => {
            const key = opp[groupKey] || '未分類';
            const displayName = nameMap.get(key) || key;

            if (!groupData[displayName]) {
                groupData[displayName] = { value: 0, count: 0 };
            }
            const value = parseFloat(String(opp.opportunityValue || '0').replace(/,/g, ''));
            if (!isNaN(value)) {
                groupData[displayName].value += value;
            }
            groupData[displayName].count += 1;
        });

        // 轉換為 Highcharts (或其他圖表庫) 容易使用的格式
        const chartDataValue = Object.entries(groupData).map(([name, data]) => ({ name, y: data.value }));
        const chartDataCount = Object.entries(groupData).map(([name, data]) => ({ name, y: data.count }));

        // 按金額排序
        chartDataValue.sort((a, b) => b.y - a.y);
        chartDataCount.sort((a, b) => b.y - a.y);

        return { chartDataValue, chartDataCount };
    }
}

module.exports = SalesAnalysisService;