// services/dashboard-service.js (已修正儀表板週間業務資料獲取)

/**
 * 專門負責處理所有儀表板資料組合的業務邏輯
 */
class DashboardService {
    /**
     * @param {object} services - 包含所有已初始化服務的容器
     */
    constructor(services) {
        this.config = services.config;
        this.opportunityReader = services.opportunityReader;
        this.contactReader = services.contactReader;
        this.interactionReader = services.interactionReader;
        this.eventLogReader = services.eventLogReader;
        this.systemReader = services.systemReader;
        // 【修改】注入 weeklyBusinessService 而不是 reader
        this.weeklyBusinessService = services.weeklyBusinessService;
        this.companyReader = services.companyReader;
        this.calendarService = services.calendarService;
        this.dateHelpers = services.dateHelpers;
    }

    async getDashboardData() {
        console.log('📊 [DashboardService] 執行主儀表板資料整合...');

        // 【修改】計算 thisWeekId 移到前面
        const today = new Date();
        const thisWeekId = this.dateHelpers.getWeekId(today);

        // 【修改】將 weeklyBusiness 的 Promise.all 拆分出來，以便使用 thisWeekId
        const [
            opportunitiesRaw,
            contacts,
            interactions,
            calendarData,
            eventLogs,
            systemConfig,
            companies
            // 移除 weeklyBusinessReader.getAllWeeklyBusiness 的呼叫
        ] = await Promise.all([
            this.opportunityReader.getOpportunities(),
            this.contactReader.getContacts(),
            this.interactionReader.getInteractions(),
            this.calendarService.getThisWeekEvents(),
            this.eventLogReader.getEventLogs(),
            this.systemReader.getSystemConfig(),
            // this.weeklyBusinessReader.getAllWeeklyBusiness('', 1, true), // <-- 移除此行
            this.companyReader.getCompanyList()
        ]);

        // 【新增】單獨獲取當週的詳細業務資料
        const thisWeekDetails = await this.weeklyBusinessService.getWeeklyDetails(thisWeekId);
        const thisWeeksEntries = thisWeekDetails.entries || []; // 從詳細資料中獲取 entries

        const latestInteractionMap = new Map();
        interactions.forEach(interaction => {
            const existingTimestamp = latestInteractionMap.get(interaction.opportunityId) || 0;
            const currentTimestamp = new Date(interaction.interactionTime || interaction.createdTime).getTime();
            if (currentTimestamp > existingTimestamp) {
                latestInteractionMap.set(interaction.opportunityId, currentTimestamp);
            }
        });

        opportunitiesRaw.forEach(opp => {
            const selfUpdateTime = new Date(opp.lastUpdateTime || opp.createdTime).getTime();
            const lastInteractionTime = latestInteractionMap.get(opp.opportunityId) || 0;
            opp.effectiveLastActivity = Math.max(selfUpdateTime, lastInteractionTime);
        });

        const opportunities = opportunitiesRaw.sort((a, b) => b.effectiveLastActivity - a.effectiveLastActivity);

        // const today = new Date(); // 移到前面了
        const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        const contactsCountMonth = contacts.filter(c => new Date(c.createdTime) >= startOfMonth).length;
        const opportunitiesCountMonth = opportunities.filter(o => new Date(o.createdTime) >= startOfMonth).length;
        const eventLogsCountMonth = eventLogs.filter(e => new Date(e.createdTime) >= startOfMonth).length;

        const followUps = this._getFollowUpOpportunities(opportunities, interactions);

        const stats = {
            contactsCount: contacts.length,
            opportunitiesCount: opportunities.length,
            eventLogsCount: eventLogs.length,
            todayEventsCount: calendarData.todayCount,
            weekEventsCount: calendarData.weekCount,
            followUpCount: followUps.length,
            contactsCountMonth,
            opportunitiesCountMonth,
            eventLogsCountMonth,
        };

        const kanbanData = this._prepareKanbanData(opportunities, systemConfig);
        const recentActivity = this._prepareRecentActivity(interactions, contacts, opportunities, companies, 5);

        // const thisWeekId = this.dateHelpers.getWeekId(today); // 移到前面了
        // 【修改】直接使用從 thisWeekDetails 獲取的 weekInfo (已包含假日)
        const weekInfo = thisWeekDetails; // weekInfo 現在包含 title, dateRange, days (含 holidayName)

        // --- 移除重複獲取假日資訊的邏輯 ---
        // const firstDay = new Date(weekInfo.days[0].date);
        // const lastDay = new Date(weekInfo.days[weekInfo.days.length - 1].date);
        // lastDay.setDate(lastDay.getDate() + 1);
        // const holidays = await this.calendarService.getHolidaysForPeriod(firstDay, lastDay);
        // weekInfo.days.forEach(day => {
        //     if (holidays.has(day.date)) {
        //         day.holidayName = holidays.get(day.date);
        //     }
        // });
        // --- 移除結束 ---


        // const thisWeeksEntries = (weeklyBusiness.data || []).filter(entry => entry.weekId === thisWeekId); // 已在前面獲取

        // 【修改】組合 thisWeekInfo，使用 weekInfo 中的資訊
        const thisWeekInfoForDashboard = {
            weekId: thisWeekId,
            title: `(${weekInfo.month}第${weekInfo.weekOfMonth}週，${weekInfo.shortDateRange})`,
            days: weekInfo.days // 傳遞包含假日資訊的 days 陣列
        };

        return {
            stats,
            kanbanData,
            followUpList: followUps.slice(0, 5),
            todaysAgenda: calendarData.todayEvents,
            recentActivity,
            weeklyBusiness: thisWeeksEntries, // 傳遞當週的紀錄
            thisWeekInfo: thisWeekInfoForDashboard // 傳遞處理過的 weekInfo
        };
    }

    async getCompaniesDashboardData() {
        const companies = await this.companyReader.getCompanyList();

        return {
            chartData: {
                trend: this._prepareTrendData(companies),
                type: this._prepareCompanyTypeData(companies),
                stage: this._prepareCustomerStageData(companies),
                rating: this._prepareEngagementRatingData(companies),
            }
        };
    }

    async getEventsDashboardData() {
        const [eventLogs, opportunities, companies] = await Promise.all([
            this.eventLogReader.getEventLogs(),
            this.opportunityReader.getOpportunities(),
            this.companyReader.getCompanyList(),
        ]);

        const opportunityMap = new Map(opportunities.map(opp => [opp.opportunityId, opp]));
        const companyMap = new Map(companies.map(comp => [comp.companyId, comp]));

        const eventList = eventLogs.map(log => {
            const relatedOpp = opportunityMap.get(log.opportunityId);
            const relatedComp = companyMap.get(log.companyId);

            return {
                ...log,
                opportunityName: relatedOpp ? relatedOpp.opportunityName : (relatedComp ? relatedComp.companyName : null),
                companyName: relatedComp ? relatedComp.companyName : null,
                opportunityType: relatedOpp ? relatedOpp.opportunityType : null
            };
        });

        eventList.sort((a, b) => {
            const timeA = new Date(a.lastModifiedTime || a.createdTime).getTime();
            const timeB = new Date(b.lastModifiedTime || b.createdTime).getTime();
            if (isNaN(timeA)) return 1;
            if (isNaN(timeB)) return -1;
            return timeB - timeA;
        });

        return {
            eventList,
            chartData: {
                trend: this._prepareTrendData(eventLogs),
                eventType: this._prepareEventTypeData(eventLogs),
                size: this._prepareSizeData(eventLogs),
            }
        };
    }

    async getOpportunitiesDashboardData() {
        const [opportunities, systemConfig] = await Promise.all([
            this.opportunityReader.getOpportunities(),
            this.systemReader.getSystemConfig(),
        ]);

        return {
            chartData: {
                trend: this._prepareTrendData(opportunities),
                source: this._prepareCategoricalData(opportunities, 'opportunitySource', '機會來源', systemConfig),
                type: this._prepareCategoricalData(opportunities, 'opportunityType', '機會種類', systemConfig),
                stage: this._prepareOpportunityStageData(opportunities, systemConfig),
                // 【新增】呼叫新的資料準備函式
                probability: this._prepareCategoricalData(opportunities, 'orderProbability', '下單機率', systemConfig),
                
                // 【*** 程式碼修改點：呼叫新的 _prepareSpecificationData ***】
                specification: this._prepareSpecificationData(opportunities, '可能下單規格', systemConfig),
                
                channel: this._prepareCategoricalData(opportunities, 'salesChannel', '可能銷售管道', systemConfig),
                scale: this._prepareCategoricalData(opportunities, 'deviceScale', '設備規模', systemConfig),
            }
        };
    }

    async getContactsDashboardData() {
        const contacts = await this.contactReader.getContacts();
        return {
            chartData: {
                trend: this._prepareTrendData(contacts),
            }
        };
    }

    _getFollowUpOpportunities(opportunities, interactions) {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - this.config.FOLLOW_UP.DAYS_THRESHOLD);

        return opportunities.filter(opp => {
            if (opp.currentStatus !== '進行中' || !this.config.FOLLOW_UP.ACTIVE_STAGES.includes(opp.currentStage)) {
                return false;
            }
            const oppInteractions = interactions.filter(i => i.opportunityId === opp.opportunityId);
            if (oppInteractions.length === 0) {
                const createdDate = new Date(opp.createdTime);
                return createdDate < sevenDaysAgo;
            }
            const lastInteractionDate = new Date(oppInteractions.sort((a,b) => new Date(b.interactionTime || b.createdTime) - new Date(a.interactionTime || a.createdTime))[0].interactionTime || oppInteractions[0].createdTime); // Added fallback for createdTime
            return lastInteractionDate < sevenDaysAgo;
        });
    }

    _prepareKanbanData(opportunities, systemConfig) {
        const stages = systemConfig['機會階段'] || [];
        const stageGroups = {};
        stages.forEach(stage => { stageGroups[stage.value] = { name: stage.note || stage.value, opportunities: [], count: 0 }; });
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

    _prepareRecentActivity(interactions, contacts, opportunities, companies, limit) {
        // --- 修正開始：處理無效日期 ---
        const contactFeed = contacts.map(item => {
            const ts = new Date(item.createdTime);
            // 檢查是否為無效日期，若是則給一個 0 (或一個極舊的時間)
            return { type: 'new_contact', timestamp: isNaN(ts.getTime()) ? 0 : ts.getTime(), data: item };
        });
        const interactionFeed = interactions.map(item => {
            const ts = new Date(item.interactionTime || item.createdTime);
            // 同樣檢查無效日期
            return { type: 'interaction', timestamp: isNaN(ts.getTime()) ? 0 : ts.getTime(), data: item };
        });
        // --- 修正結束 ---

        const combinedFeed = [...interactionFeed, ...contactFeed]
            .sort((a, b) => b.timestamp - a.timestamp) // 現在 timestamp 都是有效數字
            .slice(0, limit);

        const opportunityMap = new Map(opportunities.map(opp => [opp.opportunityId, opp.opportunityName]));
        const companyMap = new Map(companies.map(comp => [comp.companyId, comp.companyName]));

        return combinedFeed.map(item => {
            if (item.type === 'interaction') {
                let contextName = opportunityMap.get(item.data.opportunityId);
                if (!contextName && item.data.companyId) {
                    contextName = companyMap.get(item.data.companyId);
                }

                return {
                    ...item,
                    data: {
                        ...item.data,
                        contextName: contextName || '系統活動'
                    }
                };
            }
            return item;
        });
    }

    _prepareTrendData(data, days = 30) {
        const trend = {};
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < days; i++) {
            const date = new Date(today);
            date.setDate(date.getDate() - i);
            trend[date.toISOString().split('T')[0]] = 0;
        }

        data.forEach(item => {
            if (item.createdTime) {
                try {
                    const itemDate = new Date(item.createdTime);
                    const dateString = new Date(itemDate.getFullYear(), itemDate.getMonth(), itemDate.getDate()).toISOString().split('T')[0];
                    if (trend.hasOwnProperty(dateString)) trend[dateString]++;
                } catch(e) { /* ignore */ }
            }
        });
        return Object.entries(trend).sort(([dateA], [dateB]) => new Date(dateA) - new Date(dateB));
    }

    _prepareEventTypeData(eventLogs) {
        const counts = eventLogs.reduce((acc, log) => {
            const key = log.eventType || 'general';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).map(([name, y]) => ({ name, y }));
    }

    _prepareSizeData(eventLogs) {
        const counts = eventLogs.reduce((acc, log) => {
            const key = log.companySize || log.iot_deviceScale || '未填寫';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
    }

    // 【重構】建立一個通用的分類資料準備函式
    _prepareCategoricalData(data, fieldKey, configKey, systemConfig) {
        const nameMap = new Map((systemConfig[configKey] || []).map(item => [item.value, item.note]));
        const counts = data.reduce((acc, item) => {
            const value = item[fieldKey];
            // 將原始值或其對應的顯示名稱作為 key
            const key = nameMap.get(value) || value || '未分類';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).map(([name, y]) => ({ name, y }));
    }

    /**
     * 【*** 程式碼修改點：新增專門處理規格的函式 ***】
     * @param {Array<object>} opportunities - 所有機會案件
     * @param {string} configKey - 系統設定的 Key (e.g., '可能下單規格')
     * @param {object} systemConfig - 系統設定
     * @returns {Array<object>} - 圖表用的資料
     */
    _prepareSpecificationData(opportunities, configKey, systemConfig) {
        const nameMap = new Map((systemConfig[configKey] || []).map(item => [item.value, item.note]));
        const counts = {}; // 使用物件來累計

        opportunities.forEach(item => {
            const value = item.potentialSpecification;
            if (!value) return;

            let keys = [];
            
            // 嘗試解析 JSON
            try {
                const parsedJson = JSON.parse(value);
                if (parsedJson && typeof parsedJson === 'object') {
                    // 新格式：{"product_a": 5, "product_b": 1}
                    // 我們只計算有哪些 key (有哪些產品)，而不計算總數量
                    keys = Object.keys(parsedJson).filter(k => parsedJson[k] > 0);
                } else {
                    // 雖然是 JSON，但不是物件 (例如 "null" 或 "true")，拋出錯誤
                    throw new Error('Not an object, fallback to string parsing');
                }
            } catch (e) {
                // 向下相容：解析舊版 "規格A,規格B"
                if (typeof value === 'string') {
                    keys = value.split(',').map(s => s.trim()).filter(Boolean);
                }
            }
            
            // 累計
            keys.forEach(key => {
                const displayName = nameMap.get(key) || key;
                counts[displayName] = (counts[displayName] || 0) + 1;
            });
        });

        // 轉換為圖表格式
        return Object.entries(counts).map(([name, y]) => ({ name, y }));
    }


    _prepareOpportunityStageData(opportunities, systemConfig) {
        const stageMapping = new Map((systemConfig['機會階段'] || []).map(item => [item.value, item.note]));
        const counts = opportunities.reduce((acc, opp) => {
            if (opp.currentStatus === '進行中') {
                const key = stageMapping.get(opp.currentStage) || opp.currentStage || '未分類';
                acc[key] = (acc[key] || 0) + 1;
            }
            return acc;
        }, {});
        return Object.entries(counts);
    }

    _prepareCompanyTypeData(companies) {
        const counts = companies.reduce((acc, company) => {
            const key = company.companyType || '未分類';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).map(([name, y]) => ({ name, y }));
    }

    _prepareCustomerStageData(companies) {
        const counts = companies.reduce((acc, company) => {
            const key = company.customerStage || '未分類';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).map(([name, y]) => ({ name, y }));
    }

    _prepareEngagementRatingData(companies) {
        const counts = companies.reduce((acc, company) => {
            const key = company.engagementRating || '未評級';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(counts).map(([name, y]) => ({ name, y }));
    }
}

module.exports = DashboardService;