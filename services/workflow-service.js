// workflow-service.js - 核心業務流程模組 (已重構為依賴注入)
const config = require('../config');

class WorkflowService {
    /**
     * @param {object} writers - 包含所有 writer 實例的物件
     * @param {object} readers - 包含所有 reader 實例的物件
     * @param {import('googleapis').google.sheets_v4.Sheets} sheets - 已認證的 Google Sheets API 實例
     */
    constructor(writers, readers, sheets) {
        // 【重構】明確注入需要的 Writer 和 Reader 模組
        if (!writers || !readers || !sheets) {
            throw new Error('WorkflowService 需要 writers, readers, 和 Sheets API 的實例');
        }
        this.companyWriter = writers.companyWriter;
        this.contactWriter = writers.contactWriter;
        this.opportunityWriter = writers.opportunityWriter;
        this.interactionWriter = writers.interactionWriter;
        
        this.contactReader = readers.contactReader; // 需要用來讀取原始名片資料
        // 【關鍵修改 #1】注入 systemReader 以便讀取系統設定
        this.systemReader = readers.systemReader; 

        this.sheets = sheets;
        this.config = config;
    }

    /**
     * 【新增】將潛在客戶建檔的流程
     * @param {number} contactRowIndex - 原始名片資料中的列索引
     * @param {string} modifier - 操作者
     * @returns {Promise<object>}
     */
    async fileContact(contactRowIndex, modifier) {
        console.log(`🗂️ [WorkflowService] **啟動[建檔]流程... (Row: ${contactRowIndex})**`);

        const allSourceContacts = await this.contactReader.getContacts(9999);
        const sourceContact = allSourceContacts.find(c => c.rowIndex === contactRowIndex);

        if (!sourceContact) {
            throw new Error(`在 "原始名片資料" 中找不到指定的聯絡人 (rowIndex: ${contactRowIndex})`);
        }
        if (!sourceContact.company || !sourceContact.name) {
            throw new Error('無法建檔：該潛在客戶缺少姓名或公司名稱。');
        }

        // 1. 確保公司存在
        const companyData = await this.companyWriter.getOrCreateCompany(sourceContact.company, sourceContact, modifier, {});
        console.log(`   - 步驟 1/3: 公司資料處理完畢 (ID: ${companyData.id})`);

        // 2. 確保聯絡人存在
        const contactData = await this.contactWriter.getOrCreateContact(sourceContact, companyData, modifier);
        console.log(`   - 步驟 2/3: 聯絡人資料處理完畢 (ID: ${contactData.id})`);

        // 3. 回寫原始名片狀態
        await this.contactWriter.updateContactStatus(
            sourceContact.rowIndex, 
            '已建檔' // 使用一個比"已升級"更通用的狀態
        );
        console.log(`   - 步驟 3/3: 已回寫原始名片狀態為 "已建檔"`);

        return {
            success: true,
            message: '潛在客戶已成功建檔。',
            data: { company: companyData, contact: contactData }
        };
    }
    
    /**
     * 【新增】將名片資料歸檔並連結到一個已存在的手動建立聯絡人
     * @param {string} contactId - 已存在於「聯絡人總表」的聯絡人ID
     * @param {number} businessCardRowIndex - 「原始名片資料」中的名片列索引
     * @param {string} modifier - 操作者
     * @returns {Promise<object>}
     */
    async linkBusinessCardToContact(contactId, businessCardRowIndex, modifier) {
        console.log(`🔗 [WorkflowService] **啟動[名片歸檔]流程... (ContactID: ${contactId} -> CardRow: ${businessCardRowIndex})**`);

        // 1. 獲取目標聯絡人和名片資料
        const [allContacts, allBusinessCards] = await Promise.all([
            this.contactReader.getContactList(),
            this.contactReader.getContacts(9999)
        ]);

        const targetContact = allContacts.find(c => c.contactId === contactId);
        const businessCard = allBusinessCards.find(c => c.rowIndex === businessCardRowIndex);

        if (!targetContact) {
            throw new Error(`在「聯絡人總表」中找不到指定的聯絡人 (ID: ${contactId})`);
        }
        if (!businessCard) {
            throw new Error(`在「原始名片資料」中找不到指定的名片 (rowIndex: ${businessCardRowIndex})`);
        }
        if (targetContact.sourceId !== 'MANUAL') {
            throw new Error('此聯絡人不是手動建立的，無法歸檔新名片。');
        }

        // 【最終修正】以名片資料為準，準備好要覆蓋的完整資料
        
        // 2. 處理公司ID
        const companyData = await this.companyWriter.getOrCreateCompany(businessCard.company, businessCard, modifier, {});
        
        // 3. 準備包含姓名和公司ID在內的完整更新資料
        const updatedData = {
            sourceId: `BC-${businessCard.rowIndex}`,
            name: businessCard.name || '',
            companyId: companyData.id,
            department: businessCard.department || '',
            position: businessCard.position || '',
            mobile: businessCard.mobile || '',
            phone: businessCard.phone || '',
            email: businessCard.email || '',
        };

        // 4. 更新「聯絡人總表」中的紀錄
        await this.contactWriter.updateContact(contactId, updatedData, modifier);
        console.log(`   - 步驟 1/2: 已更新聯絡人總表，資料已覆蓋並連結來源 ID。`);

        // 5. 更新「原始名片資料」的狀態
        await this.contactWriter.updateContactStatus(businessCard.rowIndex, '已歸檔');
        console.log(`   - 步驟 2/2: 已回寫原始名片狀態為 "已歸檔"`);

        return {
            success: true,
            message: '名片已成功歸檔並連結至現有聯絡人。',
            data: { contactId: contactId, updatedFields: updatedData }
        };
    }

    /**
     * 從潛在客戶升級為機會案件的完整流程
     * @param {number} contactRowIndex - 原始名片資料中的列索引
     * @param {object} opportunityData - 從前端傳來的機會案件資料 (僅含機會欄位)
     * @returns {Promise<object>} - 包含成功訊息和已建立機會的物件
     */
    async upgradeContactToOpportunity(contactRowIndex, opportunityData) {
        console.log('📈 [WorkflowService] **啟動[升級]流程...**');
        
        const allSourceContacts = await this.contactReader.getContacts(9999);
        const sourceContact = allSourceContacts.find(c => c.rowIndex === contactRowIndex);

        if (!sourceContact) {
            throw new Error(`在 "原始名片資料" 中找不到指定的聯絡人 (rowIndex: ${contactRowIndex})`);
        }
        
        // --- 【BUG 修正：資料結構對齊】 ---
        // 1. 建立一個*完整*的 `opportunityData` 物件，包含從 modal 來的機會資訊 + 從 sourceContact 來的聯絡人資訊
        const completeOpportunityData = {
            ...opportunityData, // 包含 opportunityName, type, stage, assignee, value, county 等
            customerCompany: sourceContact.company,
            mainContact: sourceContact.name,
            contactPhone: sourceContact.mobile || sourceContact.phone,
        };
        
        // 2. 建立一個*精簡*的 `contactSourceInfo` 物件，**但必須包含 rowIndex**
        const contactSourceInfo = {
            name: sourceContact.name,
            company: sourceContact.company,
            phone: sourceContact.phone,
            mobile: sourceContact.mobile,
            email: sourceContact.email,
            position: sourceContact.position,
            department: sourceContact.department,
            address: sourceContact.address,
            rowIndex: sourceContact.rowIndex // <-- 這是關鍵
        };
        
        // 3. 呼叫共用函式，傳入與 "手動建立" 流程*相同結構*的參數
        const createdOpportunity = await this._createFullOpportunityWorkflow(completeOpportunityData, contactSourceInfo);
        // --- 【BUG 修正結束】 ---

        return {
            success: true,
            message: '客戶升級成功，並已同步更新所有相關資料表。',
            data: createdOpportunity
        };
    }
    
    /**
     * 手動建立新機會案件的完整流程
     * @param {object} opportunityData - 從前端傳來的機會案件資料 (包含機會 + 聯絡人欄位)
     * @returns {Promise<object>} - 包含成功訊息和已建立機會的物件
     */
    async createOpportunity(opportunityData) {
        console.log('🎯 [WorkflowService] **啟動[新增]流程...**');
        
        // 1. (保持不變) 建立*精簡*的 `contactSourceInfo` 物件
        const contactSourceInfo = {
            name: opportunityData.mainContact,
            company: opportunityData.customerCompany,
            phone: opportunityData.contactPhone,
            email: '', // 手動建立時沒有 email
            position: '', // 手動建立時沒有 position
        };

        // 2. (保持不變) 呼叫共用函式
        const createdOpportunity = await this._createFullOpportunityWorkflow(opportunityData, contactSourceInfo);
        
        return {
            success: true,
            message: '機會建立成功，並已同步更新所有相關資料表。',
            data: createdOpportunity
        };
    }

    /**
     * 內部使用的核心機會建立工作流程
     * @private
     * @param {object} opportunityData - 完整的機會資料 (必須包含所有 opp 欄位 + customerCompany, mainContact, contactPhone)
     * @param {object} contactSourceInfo - 精簡的聯絡人資訊 (可能包含 rowIndex)
     * @returns {Promise<object>} - 已建立的機會案件物件
     */
    async _createFullOpportunityWorkflow(opportunityData, contactSourceInfo) {
        const modifier = opportunityData.assignee || '系統';
        console.log(`⚙️ [WorkflowService] **執行統一的核心機會建立流程 (操作者: ${modifier})...**`);
        
        const companyData = await this.companyWriter.getOrCreateCompany(opportunityData.customerCompany, contactSourceInfo, modifier, opportunityData);
        console.log(`   - 步驟 1/6: 公司資料處理完畢 (ID: ${companyData.id})`);

        const contactData = await this.contactWriter.getOrCreateContact(contactSourceInfo, companyData, modifier);
        console.log(`   - 步驟 2/6: 聯絡人資料處理完畢 (ID: ${contactData.id})`);

        console.log('   - 步驟 3/6: 準備寫入機會案件...');
        const now = new Date().toISOString();
        const opportunityId = `OPP${Date.now()}`;
        
        let currentStage = opportunityData.currentStage;
        if (!currentStage) {
            console.log('   - 正在從系統設定中獲取預設機會階段...');
            const systemConfig = await this.systemReader.getSystemConfig();
            const opportunityStages = systemConfig['機會階段'];
            if (opportunityStages && opportunityStages.length > 0) {
                currentStage = opportunityStages[0].value;
                console.log(`   - 已設定預設階段為: ${currentStage}`);
            } else {
                currentStage = '未分類'; 
                console.warn('   - 警告: 在系統設定中找不到任何「機會階段」，使用 "未分類" 作為備用。');
            }
        }

        // --- 【*** 程式碼修改：擴充 rowData 並修正範圍 ***】 ---
        const rowData = [
            /* 0: A */ opportunityId, 
            /* 1: B */ opportunityData.opportunityName || '', 
            /* 2: C */ opportunityData.customerCompany || '',
            /* 3: D */ opportunityData.mainContact || '', 
            /* 4: E */ opportunityData.contactPhone || '', 
            /* 5: F */ opportunityData.assignee || '',
            /* 6: G */ opportunityData.opportunityType || '', 
            /* 7: H */ opportunityData.opportunitySource || '', 
            /* 8: I */ currentStage,
            /* 9: J */ now, // 建立時間
            /* 10: K */ opportunityData.expectedCloseDate || '', 
            /* 11: L */ opportunityData.opportunityValue || '',
            /* 12: M */ this.config.CONSTANTS.DEFAULT_VALUES.OPPORTUNITY_STATUS, 
            /* 13: N */ '', // Drive資料夾連結
            /* 14: O */ now, // 最後更新時間
            /* 15: P */ opportunityData.notes || '',
            /* 16: Q */ modifier,
            /* 17: R */ '', // 階段歷程
            /* 18: S */ opportunityData.parentOpportunityId || '', // 母機會ID
            /* 19: T */ opportunityData.orderProbability || '', // 下單機率
            /* 20: U */ opportunityData.potentialSpecification || '', // 可能下單規格 (JSON)
            /* 21: V */ opportunityData.salesChannel || '', // 可能銷售管道
            /* 22: W */ opportunityData.deviceScale || '', // 設備規模
            /* 23: X */ 'auto' // 機會價值類型 (預設為 auto)
        ];

        const response = await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.config.SPREADSHEET_ID, 
            range: `${this.config.SHEETS.OPPORTUNITIES}!A:X`, // 確保範圍是 A:X
            valueInputOption: 'USER_ENTERED', 
            resource: { values: [rowData] }
        });
        // --- 【*** 修改結束 ***】 ---

        this.opportunityWriter.opportunityReader.invalidateCache('opportunities');

        const updatedRange = response.data.updates.updatedRange;
        const match = updatedRange.match(/!A(\d+)/);
        const newRowIndex = match ? parseInt(match[1]) : null;

        const createdOpportunity = {
            rowIndex: newRowIndex, 
            opportunityId: rowData[0], 
            opportunityName: rowData[1],
            customerCompany: rowData[2], 
            mainContact: rowData[3], 
            contactPhone: rowData[4],
            assignee: rowData[5], 
            opportunityType: rowData[6], 
            opportunitySource: rowData[7],
            currentStage: rowData[8], 
            createdTime: rowData[9], 
            expectedCloseDate: rowData[10],
            opportunityValue: rowData[11], 
            currentStatus: rowData[12], 
            driveFolderLink: rowData[13],
            lastUpdateTime: rowData[14], 
            notes: rowData[15], 
            lastModifier: rowData[16],
            stageHistory: rowData[17],
            parentOpportunityId: rowData[18],
            orderProbability: rowData[19],
            potentialSpecification: rowData[20],
            salesChannel: rowData[21],
            deviceScale: rowData[22],
            opportunityValueType: rowData[23] // <-- 回傳新欄位
        };
        console.log(`   - 步驟 3/6: 機會案件資料已寫入 (ID: ${createdOpportunity.opportunityId})`);

        const interactionData = {
            opportunityId: createdOpportunity.opportunityId,
            eventType: '系統事件',
            eventTitle: contactSourceInfo.rowIndex ? '從潛在客戶升級為機會' : '手動建立新機會',
            contentSummary: contactSourceInfo.rowIndex ?
                `將 "原始名片資料" 中的 ${contactSourceInfo.name} (${contactSourceInfo.company}) 升級為正式機會。` :
                `手動建立新的機會案件 "${createdOpportunity.opportunityName}"。`,
            recorder: modifier,
        };
        await this.interactionWriter.createInteraction(interactionData);
        console.log(`   - 步驟 4/6: 初始互動紀錄已建立`);

        await this.opportunityWriter.linkContactToOpportunity(
            createdOpportunity.opportunityId,
            contactData.id,
            modifier
        );
        console.log(`   - 步驟 5/6: 主要聯絡人關聯已建立`);
        
        if (contactSourceInfo.rowIndex) {
            await this.contactWriter.updateContactStatus(
                contactSourceInfo.rowIndex, 
                this.config.CONSTANTS.CONTACT_STATUS.UPGRADED
            );
            console.log(`   - 步驟 6/6: 已回寫原始名片狀態為 "已升級"`);
        }

        console.log('✅ [WorkflowService] **核心機會建立流程執行成功!**');
        return createdOpportunity;
    }
}

module.exports = WorkflowService;