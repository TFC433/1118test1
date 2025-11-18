// services/company-service.js

/**
 * 專門負責處理與「公司」相關的複雜業務邏輯
 */
class CompanyService {
    /**
     * @param {object} services - 包含所有已初始化服務的容器
     */
    constructor(services) {
        this.companyReader = services.companyReader;
        this.contactReader = services.contactReader;
        this.opportunityReader = services.opportunityReader;
        this.interactionReader = services.interactionReader;
        this.eventLogReader = services.eventLogReader;
        this.companyWriter = services.companyWriter;
        // --- 新增依賴 ---
        this.interactionWriter = services.interactionWriter;
        this.systemReader = services.systemReader;
    }

    /**
     * 【新增】標準化公司名稱的輔助函式
     * @param {string} name - 公司名稱
     * @returns {string} - 標準化後的名稱
     */
    _normalizeCompanyName(name) {
        if (!name) return '';
        return name
            .toLowerCase()
            .trim()
            .replace(/股份有限公司|有限公司|公司/g, '') // 移除常見後綴
            .replace(/\(.*\)/g, '') // 移除括號內容
            .trim();
    }

    /**
     * 【新增】輔助函式：建立一筆公司互動日誌
     * @private
     */
    async _logCompanyInteraction(companyId, title, summary, modifier) {
        try {
            await this.interactionWriter.createInteraction({
                companyId: companyId,
                eventType: '系統事件',
                eventTitle: title,
                contentSummary: summary,
                recorder: modifier,
            });
        } catch (logError) {
            console.warn(`[CompanyService] 寫入公司日誌失敗 (CompanyID: ${companyId}): ${logError.message}`);
        }
    }

    /**
     * 【新增】攔截並處理公司資料更新，以增加日誌
     * @param {string} companyName
     * @param {object} updateData
     * @param {string} modifier
     * @returns {Promise<object>}
     */
    async updateCompany(companyName, updateData, modifier) {
        const allCompanies = await this.companyReader.getCompanyList();
        const originalCompany = allCompanies.find(c => c.companyName.toLowerCase().trim() === companyName.toLowerCase().trim());
        
        if (!originalCompany) {
            throw new Error(`找不到要更新的公司: ${companyName}`);
        }

        const config = await this.systemReader.getSystemConfig();
        const getNote = (configKey, value) => (config[configKey] || []).find(i => i.value === value)?.note || value || 'N/A';
        
        const logs = []; // 儲存要記錄的變更

        // 檢查客戶階段
        if (updateData.customerStage !== undefined && updateData.customerStage !== originalCompany.customerStage) {
            logs.push(`客戶階段從 [${getNote('客戶階段', originalCompany.customerStage)}] 更新為 [${getNote('客戶階段', updateData.customerStage)}]`);
        }
        // 檢查互動評級
        if (updateData.engagementRating !== undefined && updateData.engagementRating !== originalCompany.engagementRating) {
            logs.push(`互動評級從 [${getNote('互動評級', originalCompany.engagementRating)}] 更新為 [${getNote('互動評級', updateData.engagementRating)}]`);
        }
        // 檢查公司類型
        if (updateData.companyType !== undefined && updateData.companyType !== originalCompany.companyType) {
            logs.push(`公司類型從 [${getNote('公司類型', originalCompany.companyType)}] 更新為 [${getNote('公司類型', updateData.companyType)}]`);
        }

        // 執行更新
        const updateResult = await this.companyWriter.updateCompany(companyName, updateData, modifier);
        
        // 如果更新成功且有日誌，則寫入互動紀錄
        if (updateResult.success && logs.length > 0) {
            await this._logCompanyInteraction(
                originalCompany.companyId,
                '公司資料變更',
                logs.join('； '),
                modifier
            );
        }

        return updateResult;
    }


    /**
     * 【新增】獲取公司列表，並根據最後活動時間排序
     * @returns {Promise<Array<object>>}
     */
    async getCompanyListWithActivity() {
        const [
            allCompanies,
            allInteractions,
            allOpportunities
        ] = await Promise.all([
            this.companyReader.getCompanyList(),
            this.interactionReader.getInteractions(),
            this.opportunityReader.getOpportunities()
        ]);

        const companyActivityMap = new Map();

        // 1. 初始化每家公司的最後活動時間為其自身的更新時間
        allCompanies.forEach(comp => {
            const initialTimestamp = new Date(comp.lastUpdateTime || comp.createdTime).getTime();
            if (!isNaN(initialTimestamp)) {
                companyActivityMap.set(comp.companyId, initialTimestamp);
            }
        });

        // 2. 建立一個從機會名稱到公司ID的映射，以便稍後查找
        const companyNameToIdMap = new Map(allCompanies.map(c => [c.companyName, c.companyId]));
        const oppToCompanyIdMap = new Map();
        allOpportunities.forEach(opp => {
            if (companyNameToIdMap.has(opp.customerCompany)) {
                oppToCompanyIdMap.set(opp.opportunityId, companyNameToIdMap.get(opp.customerCompany));
            }
        });

        // 3. 遍歷所有互動，更新公司的最後活動時間
        allInteractions.forEach(inter => {
            let companyId = inter.companyId; // 直接關聯公司的互動

            // 如果沒有直接關聯，則透過機會來間接查找公司ID
            if (!companyId && inter.opportunityId && oppToCompanyIdMap.has(inter.opportunityId)) {
                companyId = oppToCompanyIdMap.get(inter.opportunityId);
            }

            if (companyId) {
                const existingTimestamp = companyActivityMap.get(companyId) || 0;
                const currentTimestamp = new Date(inter.interactionTime || inter.createdTime).getTime();
                if (currentTimestamp > existingTimestamp) {
                    companyActivityMap.set(companyId, currentTimestamp);
                }
            }
        });

        // 4. 將計算出的最後活動時間附加到公司物件上
        const companiesWithActivity = allCompanies.map(comp => ({
            ...comp,
            lastActivity: companyActivityMap.get(comp.companyId) || new Date(comp.createdTime).getTime()
        }));

        // 5. 根據最後活動時間進行降序排序
        companiesWithActivity.sort((a, b) => b.lastActivity - a.lastActivity);

        return companiesWithActivity;
    }


    /**
     * 【修改】高效獲取公司的完整詳細資料，現在包含互動與事件
     * @param {string} companyName 
     * @returns {Promise<object>}
     */
    async getCompanyDetails(companyName) {
        // 【修改】移除 allInteractions 的獲取
        const [
            allCompanies, 
            allContacts, 
            allOpportunities, 
            allPotentialContacts,
            allEventLogs
        ] = await Promise.all([
            this.companyReader.getCompanyList(),
            this.contactReader.getContactList(),
            this.opportunityReader.getOpportunities(),
            this.contactReader.getContacts(), // 潛在客戶
            this.eventLogReader.getEventLogs()
        ]);

        // --- 【*** 這是新加入的程式碼 ***】 ---
        // 為了計算「相關機會案件」的「最後活動時間」，我們需要在後端
        // 組合 allOpportunities 和 allInteractions
        // 【修改】由於我們不再獲取 allInteractions，這段邏輯需要調整。
        // 我們將依賴 OpportunityReader 在獲取機會時自行處理（或假設它已經處理了）。
        // 為了安全起見，我們將在這裡手動獲取互動紀錄，僅用於計算機會的活動時間。
        console.log(`[CompanyService] 正在為 ${allOpportunities.length} 筆機會計算最後活動時間...`);
        
        // 【修改】單獨獲取互動紀錄
        const allInteractions = await this.interactionReader.getInteractions();

        const latestInteractionMap = new Map();
        allInteractions.forEach(interaction => {
            // 只需要考慮有關聯 opportunityId 的互動
            if (interaction.opportunityId) {
                const id = interaction.opportunityId;
                const existing = latestInteractionMap.get(id) || 0;
                // 使用 interactionTime 或 createdTime 來獲取時間戳
                const current = new Date(interaction.interactionTime || interaction.createdTime).getTime();
                if (current > existing) {
                    latestInteractionMap.set(id, current);
                }
            }
        });

        // 將計算結果附加到 allOpportunities 陣列的每個物件上
        allOpportunities.forEach(opp => {
            const selfUpdate = new Date(opp.lastUpdateTime || opp.createdTime).getTime();
            const lastInteraction = latestInteractionMap.get(opp.opportunityId) || 0;
            opp.effectiveLastActivity = Math.max(selfUpdate, lastInteraction);
        });
        // --- 【*** 新程式碼結束 ***】 ---


        const normalizedCompanyName = companyName.toLowerCase().trim();

        const company = allCompanies.find(c => c.companyName.toLowerCase().trim() === normalizedCompanyName);
        if (!company) {
            const potentialMatch = allPotentialContacts.find(pc => pc.company && pc.company.toLowerCase().trim() === normalizedCompanyName);
            if (potentialMatch) {
                return {
                    companyInfo: { companyName: potentialMatch.company, isPotential: true },
                    contacts: [],
                    opportunities: [],
                    potentialContacts: allPotentialContacts.filter(pc => pc.company && pc.company.toLowerCase().trim() === normalizedCompanyName),
                    // 【修改】回傳空陣列
                    interactions: [], 
                    eventLogs: []
                };
            }
            throw new Error(`找不到公司: ${companyName}`);
        }

        const relatedContacts = allContacts.filter(c => c.companyId === company.companyId);
        
        // 現在 allOpportunities 已經包含 effectiveLastActivity，
        // 所以 relatedOpportunities 也會自動包含
        const relatedOpportunities = allOpportunities.filter(o => o.customerCompany.toLowerCase().trim() === normalizedCompanyName);
        
        const relatedPotentialContacts = allPotentialContacts.filter(pc => 
            pc.company && pc.company.toLowerCase().trim() === normalizedCompanyName
        );
        
        // --- 【修改】移除 relatedInteractions 的篩選 ---

        // 這裡的事件是*公司層級*的，與您要求的機會活動無關，保持不變
        const relatedEventLogs = allEventLogs
            .filter(log => log.companyId === company.companyId)
            .sort((a, b) => new Date(b.lastModifiedTime || b.createdTime) - new Date(a.lastModifiedTime || a.createdTime));
        // --- 【修正結束】 ---

        console.log(`✅ [CompanyService] 公司資料整合完畢: ${relatedContacts.length} 位聯絡人, ${relatedOpportunities.length} 個機會, 0 筆互動, ${relatedEventLogs.length} 筆事件`);
        
        return {
            companyInfo: company,
            contacts: relatedContacts,
            opportunities: relatedOpportunities, // <-- 這個陣列現在包含 `effectiveLastActivity`
            potentialContacts: relatedPotentialContacts,
            // 【修改】回傳空陣列
            interactions: [],
            eventLogs: relatedEventLogs
        };
    }

    /**
     * 【修改】刪除一間公司（包含相依性檢查並增加日誌）
     * @param {string} companyName - 要刪除的公司名稱
     * @param {string} modifier - 操作者
     * @returns {Promise<object>}
     */
    async deleteCompany(companyName, modifier) {
        console.log(`🗑️ [CompanyService] 請求刪除公司: ${companyName} by ${modifier}`);

        // 1. 檢查相依性：是否仍有關聯的「機會案件」
        const allOpportunities = await this.opportunityReader.getOpportunities();
        const relatedOpportunities = allOpportunities.filter(
            opp => opp.customerCompany.toLowerCase().trim() === companyName.toLowerCase().trim()
        );

        if (relatedOpportunities.length > 0) {
            console.warn(`[CompanyService] 刪除失敗：公司 ${companyName} 仍關聯 ${relatedOpportunities.length} 個機會案件。`);
            throw new Error(`無法刪除：此公司仍關聯 ${relatedOpportunities.length} 個機會案件 (例如: "${relatedOpportunities[0].opportunityName}")。請先刪除或轉移這些案件。`);
        }

        // 2. 檢查相依性：是否仍有關聯的「事件紀錄」(非機會)
        const allEventLogs = await this.eventLogReader.getEventLogs();
        // 獲取 companyId，使用已有的 getCompanyDetails 方法
        const companyDetails = await this.getCompanyDetails(companyName); 
        
        if (companyDetails.companyInfo && companyDetails.companyInfo.companyId) {
            const relatedEventLogs = allEventLogs.filter(
                log => !log.opportunityId && log.companyId === companyDetails.companyInfo.companyId
            );
            if (relatedEventLogs.length > 0) {
                 console.warn(`[CompanyService] 刪除失敗：公司 ${companyName} 仍關聯 ${relatedEventLogs.length} 個僅關聯公司的事件紀錄。`);
                 throw new Error(`無法刪除：此公司仍關聯 ${relatedEventLogs.length} 個事件紀錄。請先處理這些紀錄。`);
            }
            
            // --- 新增日誌 ---
            // 在刪除前記錄日誌 (此日誌將隨公司資料一同被刪除，但若刪除失敗則會留下)
            await this._logCompanyInteraction(
                companyDetails.companyInfo.companyId,
                '刪除公司',
                `公司 ${companyName} (ID: ${companyDetails.companyInfo.companyId}) 已被 ${modifier} 請求刪除。`,
                modifier
            );
            // --- 日誌結束 ---

        }

        // 3. 執行刪除
        const result = await this.companyWriter.deleteCompany(companyName);
        
        console.log(`✅ [CompanyService] 公司 ${companyName} 已成功刪除。`);
        
        return result;
    }
}

module.exports = CompanyService;