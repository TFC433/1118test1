// data/opportunity-reader.js

const BaseReader = require('./base-reader');

/**
 * 專門負責讀取所有與「機會案件」相關資料的類別
 */
class OpportunityReader extends BaseReader {
    constructor(sheets) {
        super(sheets);
    }

    /**
     * 取得所有機會案件
     * @returns {Promise<Array<object>>}
     */
    async getOpportunities() {
        const cacheKey = 'opportunities';
        // 【*** 修改：擴大讀取範圍到 X 欄 (24欄) ***】
        const range = `${this.config.SHEETS.OPPORTUNITIES}!A:X`;

        // 定義如何將一行 [col1, col2, ...] 的陣列資料，轉換為一個物件
        const rowParser = (row, index) => ({
            rowIndex: index + 2,
            opportunityId: row[0] || '',
            opportunityName: row[1] || '',
            customerCompany: row[2] || '',
            mainContact: row[3] || '',
            contactPhone: row[4] || '',
            assignee: row[5] || '',
            opportunityType: row[6] || '',
            opportunitySource: row[7] || '',
            currentStage: row[8] || '',
            createdTime: row[9] || '',
            expectedCloseDate: row[10] || '',
            opportunityValue: row[11] || '',
            currentStatus: row[12] || '',
            driveFolderLink: row[13] || '',
            lastUpdateTime: row[14] || '',
            notes: row[15] || '',
            lastModifier: row[16] || '',
            stageHistory: row[17] || '',
            parentOpportunityId: row[18] || '',
            // 【新增】解析新的銷售情報欄位
            orderProbability: row[19] || '',
            potentialSpecification: row[20] || '', // (U欄) - 現在可能是 JSON
            salesChannel: row[21] || '',
            deviceScale: row[22] || '',
            // 【*** 新增：解析機會價值類型欄位 ***】
            opportunityValueType: row[23] || '' // (X欄)
        });

        // 定義排序邏輯
        const sorter = (a, b) => {
            const timeA = a.lastUpdateTime || a.createdTime;
            const timeB = b.lastUpdateTime || b.createdTime;
            const dateA = new Date(timeA);
            const dateB = new Date(timeB);
            if (isNaN(dateB)) return -1;
            if (isNaN(dateA)) return 1;
            return dateB - dateA;
        };
        
        // 從快取或 API 獲取資料，並過濾掉已封存的項目
        const allData = await this._fetchAndCache(cacheKey, range, rowParser, sorter);
        return allData.filter(opp => opp.currentStatus !== this.config.CONSTANTS.OPPORTUNITY_STATUS.ARCHIVED);
    }

    /**
     * 【重構】搜尋並分頁機會案件，支援 page=0 回傳全部
     * @param {string} query - 搜尋關鍵字
     * @param {number} [page=1] - 頁碼 (若為 0 或 falsy，則回傳全部)
     * @param {object} [filters={}] - 篩選條件 { assignee, type, stage }
     * @returns {Promise<object|Array<object>>} - 若分頁則回傳物件，否則回傳陣列
     */
    async searchOpportunities(query, page = 1, filters = {}) {
        let opportunities = await this.getOpportunities();

        if (query) {
            const searchTerm = query.toLowerCase();
            opportunities = opportunities.filter(o => {
                if (searchTerm.startsWith('opp') && o.opportunityId.toLowerCase() === searchTerm) {
                    return true;
                }
                return (o.opportunityName && o.opportunityName.toLowerCase().includes(searchTerm)) ||
                       (o.customerCompany && o.customerCompany.toLowerCase().includes(searchTerm));
            });
        }

        if (filters.assignee) {
            opportunities = opportunities.filter(o => o.assignee === filters.assignee);
        }
        if (filters.type) {
            opportunities = opportunities.filter(o => o.opportunityType === filters.type);
        }
        if (filters.stage) {
            opportunities = opportunities.filter(o => o.currentStage === filters.stage);
        }
        
        // 如果 page 為 0 或未提供，則回傳所有資料的陣列
        if (!page || page <= 0) {
            return opportunities;
        }

        // --- 以下為原本的分頁邏輯 ---
        const pageSize = this.config.PAGINATION.OPPORTUNITIES_PER_PAGE;
        const startIndex = (page - 1) * pageSize;
        const paginated = opportunities.slice(startIndex, startIndex + pageSize);
        return {
            data: paginated,
            pagination: { 
                current: page, 
                total: Math.ceil(opportunities.length / pageSize), 
                totalItems: opportunities.length, 
                hasNext: (startIndex + pageSize) < opportunities.length, 
                hasPrev: page > 1 
            }
        };
    }

    /**
     * 按縣市聚合機會案件數量
     * @param {string|null} opportunityType - (可選) 機會種類
     * @returns {Promise<Array<{county: string, count: number}>>}
     */
    async getOpportunitiesByCounty(opportunityType = null) {
        const [opportunities, companies] = await Promise.all([
            this.getOpportunities(),
            this.getCompanyList()
        ]);
        
        let filteredOpportunities = opportunityType
            ? opportunities.filter(opp => opp.opportunityType === opportunityType)
            : opportunities;
        
        const companyToCountyMap = new Map(companies.map(c => [c.companyName, c.county]));

        const countyCounts = {};
        filteredOpportunities.forEach(opp => {
            const county = companyToCountyMap.get(opp.customerCompany);
            if (county) {
                countyCounts[county] = (countyCounts[county] || 0) + 1;
            }
        });

        return Object.entries(countyCounts).map(([county, count]) => ({ county, count }));
    }

    /**
     * 按階段聚合機會案件
     * @returns {Promise<object>}
     */
    async getOpportunitiesByStage() {
        const [opportunities, systemConfig] = await Promise.all([
            this.getOpportunities(),
            this.getSystemConfig()
        ]);
        
        const stages = systemConfig['機會階段'] || [];
        const stageGroups = {};

        stages.forEach(stage => {
            stageGroups[stage.value] = { name: stage.note || stage.value, opportunities: [], count: 0 };
        });

        opportunities.forEach(opp => {
            if (opp.currentStatus === '進行中') {
                const stageKey = opp.currentStage;
                if (stageGroups[stageKey]) {
                    stageGroups[stageKey].opportunities.push(opp);
                    stageGroups[stageKey].count++;
                }
            }
        });
        return stageGroups;
    }

    // 在 Phase 2 中，這些會被移除，改為依賴注入
    async getCompanyList() {
        const CompanyReader = require('./company-reader');
        const companyReader = new CompanyReader(this.sheets);
        return companyReader.getCompanyList();
    }
    async getSystemConfig() {
        const SystemReader = require('./system-reader');
        const systemReader = new SystemReader(this.sheets);
        return systemReader.getSystemConfig();
    }
}

module.exports = OpportunityReader;