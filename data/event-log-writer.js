// BFN: tfc433/1027test1/1027test1-e966c259b5fd445713230ea1bdf23f158d8e9bfd/data/event-log-writer.js
// data/event-log-writer.js

const BaseWriter = require('./base-writer');

// 這份對應表維持不變
const HEADER_TO_KEY_MAP = {
    '事件ID': 'eventId', '事件名稱': 'eventName', '關聯機會ID': 'opportunityId', '關聯公司ID': 'companyId',
    '建立者': 'creator', '建立時間': 'createdTime', '最後修改時間': 'lastModifiedTime', '我方與會人員': 'ourParticipants',
    '客戶與會人員': 'clientParticipants', '會議地點': 'visitPlace', '會議內容': 'eventContent', '客戶提問': 'clientQuestions',
    '客戶情報': 'clientIntelligence', '備註': 'eventNotes', '設備規模': 'iot_deviceScale', '生產線特徵': 'iot_lineFeatures',
    '生產現況': 'iot_productionStatus', 'IoT現況': 'iot_iotStatus', '痛點分類': 'iot_painPoints', '客戶痛點說明': 'iot_painPointDetails',
    '痛點分析與對策': 'iot_painPointAnalysis', '系統架構': 'iot_systemArchitecture', '加工類型': 'dt_processingType',
    '加工產業別': 'dt_industry', '下單機率': 'orderProbability', '可能下單數量': 'potentialQuantity',
    '銷售管道': 'salesChannel', '拜訪對象': 'clientParticipants', '公司規模': 'companySize', '生產現況紀錄': 'iot_productionStatus',
    'IoT現況紀錄': 'iot_iotStatus', '需求摘要註解': 'eventContent', '痛點詳細說明': 'iot_painPointDetails',
    '系統架構描述': 'iot_systemArchitecture', '外部系統串接': 'externalSystems', '硬體規模': 'hardwareScale',
    '客戶對FANUC期望': 'fanucExpectation', '痛點補充說明': 'eventNotes'
};

class EventLogWriter extends BaseWriter {
    constructor(sheets, eventLogReader, opportunityReader) {
        super(sheets);
        if (!eventLogReader) throw new Error('EventLogWriter 需要 EventLogReader 的實例');
        if (!opportunityReader) throw new Error('EventLogWriter 需要 OpportunityReader 的實例');
        this.eventLogReader = eventLogReader;
        this.opportunityReader = opportunityReader;
    }

    async createEventLog(eventData) {
        const eventType = eventData.eventType || 'general';
        console.log(`📝 [EventLogWriter] 建立新的事件紀錄... 類型: ${eventType.toUpperCase()}`);

        const now = new Date().toISOString();
        const eventId = `EVT${Date.now()}`;

        const S = this.config.SHEETS;
        const F = this.config;
        
        let sheetName, specificFields;
        switch (eventType) {
            case 'iot': sheetName = S.EVENT_LOGS_IOT; specificFields = F.EVENT_LOG_IOT_FIELDS; break;
            case 'dt': sheetName = S.EVENT_LOGS_DT; specificFields = F.EVENT_LOG_DT_FIELDS; break;
            case 'dx': sheetName = S.EVENT_LOGS_DX; specificFields = []; break;
            default: sheetName = S.EVENT_LOGS_GENERAL; specificFields = []; break;
        }

        const rowData = [];
        const allHeaders = [...F.EVENT_LOG_COMMON_FIELDS, ...specificFields];

        allHeaders.forEach(header => {
            let key = (header === '設備規模' && (eventType === 'iot' || eventType === 'dt')) ? `${eventType}_deviceScale` : HEADER_TO_KEY_MAP[header];
            if (!key) { rowData.push(''); return; }
            
            let valueToPush;
            
            switch (key) {
                case 'eventId':
                    valueToPush = eventId;
                    break;
                case 'createdTime':
                    valueToPush = eventData.createdTime || now;
                    break; 
                case 'lastModifiedTime':
                    valueToPush = eventData.createdTime || now; // 建立時，最後修改時間 = 建立時間
                    break;
                default:
                    const value = eventData[key];
                    // --- 【核心修正】 ---
                    // 檢查傳入的值是否為陣列。如果是，則將其轉換為逗號分隔的字串。
                    // 否則，直接使用原值。
                    valueToPush = Array.isArray(value) ? value.join(', ') : (value || '');
                    // --- 【修正結束】 ---
            }
            rowData.push(valueToPush);
        });
        
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: sheetName,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [rowData] }
        });
        
        this.eventLogReader.invalidateCache('eventLogs');
        if (eventData.opportunityId || eventData.companyId) {
            this.opportunityReader.invalidateCache('opportunities');
        }
        
        console.log(`✅ [EventLogWriter] 事件紀錄建立成功: ${eventId} 已寫入 ${sheetName}`);
        return { success: true, eventId: eventId, createdTime: eventData.createdTime || now };
    }

    async updateEventLog(eventId, updateData, modifier) {
        console.log(`📝 [EventLogWriter] 更新事件紀錄 - ID: ${eventId} by ${modifier}`);
        
        const originalEvent = await this.eventLogReader.getEventLogById(eventId);
        if (!originalEvent) throw new Error(`找不到事件ID為 ${eventId} 的紀錄`);

        const originalEventType = originalEvent.eventType;
        const newEventType = updateData.eventType;
        
        const isMigrating = newEventType && newEventType !== originalEventType;

        if (isMigrating) {
            console.log(`🚀 [EventLogWriter] 正在遷移事件 ${eventId} 從 ${originalEventType} 到 ${newEventType}`);

            const newData = { ...originalEvent, ...updateData, modifier };
            
            const createResult = await this.createEventLog(newData);

            const S = this.config.SHEETS;
            let oldSheetName;
            switch(originalEventType) {
                case 'iot': oldSheetName = S.EVENT_LOGS_IOT; break;
                case 'dt': oldSheetName = S.EVENT_LOGS_DT; break;
                case 'dx': oldSheetName = S.EVENT_LOGS_DX; break;
                case 'legacy': oldSheetName = '事件紀錄總表'; break;
                default: oldSheetName = S.EVENT_LOGS_GENERAL; break;
            }
            
            await this._deleteRow(oldSheetName, originalEvent.rowIndex, this.eventLogReader);
            console.log(`✅ [EventLogWriter] 已從舊工作表 ${oldSheetName} 刪除第 ${originalEvent.rowIndex} 列`);

            return { success: true, migrated: true, newEventId: createResult.eventId };
        }

        const eventType = originalEvent.eventType;
        const rowIndex = originalEvent.rowIndex;
        const now = new Date().toISOString();

        const S = this.config.SHEETS;
        const F = this.config;
        
        let sheetName, specificFields;
        let commonHeaders = F.EVENT_LOG_COMMON_FIELDS;

        switch (eventType) {
            case 'iot': sheetName = S.EVENT_LOGS_IOT; specificFields = F.EVENT_LOG_IOT_FIELDS; break;
            case 'dt': sheetName = S.EVENT_LOGS_DT; specificFields = F.EVENT_LOG_DT_FIELDS; break;
            case 'dx': sheetName = S.EVENT_LOGS_DX; specificFields = []; break;
            case 'legacy':
                sheetName = '事件紀錄總表';
                commonHeaders = ['事件ID', '事件名稱', '機會ID', '建立者', '建立時間', '下單機率', '可能下單數量', '銷售管道', '我方與會人員', '拜訪對象', '公司規模', '拜訪地點', '生產線特徵', '生產現況紀錄', 'IoT現況紀錄', '需求摘要註解', '痛點分類', '痛點詳細說明', '系統架構描述', '外部系統串接', '硬體規模', '客戶對FANUC期望', '痛點補充說明', '公司ID'];
                specificFields = [];
                break;
            default: sheetName = S.EVENT_LOGS_GENERAL; specificFields = []; break;
        }

        const fullHeaders = [...commonHeaders, ...specificFields];
        const lastColumn = String.fromCharCode(65 + fullHeaders.length - 1);
        const readRange = `${sheetName}!A${rowIndex}:${lastColumn}${rowIndex}`;
        
        const response = await this.sheets.spreadsheets.values.get({ spreadsheetId: this.config.SPREADSHEET_ID, range: readRange });
        const currentRow = response.data.values ? response.data.values[0] : [];
        if (currentRow.length === 0) throw new Error(`在 ${sheetName} 的第 ${rowIndex} 行找不到資料可更新`);

        // 【修改】移除 dataToUpdate 中的 lastModifiedTime: now
        const dataToUpdate = { ...updateData, modifier };

        // 【修改】恢復原始邏輯：finalModifiedTime 永遠是 "now"
        const isOverwritingTime = updateData.createdTime !== undefined;
        const finalModifiedTime = now;

        fullHeaders.forEach((header, i) => {
            let key = (header === '設備規模' && (eventType === 'iot' || eventType === 'dt')) ? `${eventType}_deviceScale` : HEADER_TO_KEY_MAP[header];
            const legacyKey = key ? key.replace(/^(iot|dt)_/, '') : null;
            
            // --- 【核心修正】 ---
            // 在更新時，也檢查值是否為陣列，並進行轉換
            if (dataToUpdate[key] !== undefined) {
                 // 【修改】如果正在覆寫時間，則 createdTime 欄位也會被更新
                 currentRow[i] = Array.isArray(dataToUpdate[key]) ? dataToUpdate[key].join(', ') : dataToUpdate[key];
            } else if (legacyKey && dataToUpdate[legacyKey] !== undefined) {
                 currentRow[i] = Array.isArray(dataToUpdate[legacyKey]) ? dataToUpdate[legacyKey].join(', ') : dataToUpdate[legacyKey];
            }
            // --- 【修正結束】 ---
        });
        
        // 【修改】使用 finalModifiedTime (即 "now")
        const modifiedTimeIndex = commonHeaders.indexOf('最後修改時間');
        if (modifiedTimeIndex !== -1) {
            currentRow[modifiedTimeIndex] = finalModifiedTime;
        }
        
        const modifierIndex = commonHeaders.indexOf('最後變更者');
        if (modifierIndex !== -1) currentRow[modifierIndex] = modifier;

        // 【修改】如果覆寫時間，也要確保 '建立時間' 欄位本身被更新
        if (isOverwritingTime) {
            const createdTimeIndex = commonHeaders.indexOf('建立時間');
            if (createdTimeIndex !== -1) {
                currentRow[createdTimeIndex] = updateData.createdTime;
            }
        }

        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: readRange,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [currentRow] }
        });

        this.eventLogReader.invalidateCache('eventLogs');
        this.opportunityReader.invalidateCache('opportunities');

        console.log(`✅ [EventLogWriter] 事件紀錄更新成功: ${eventId} 已更新於 ${sheetName}`);
        return { success: true };
    }

    /**
     * 【新增】刪除一筆事件紀錄
     * @param {string} eventId - 要刪除的事件 ID
     * @param {string} modifier - 操作者
     * @returns {Promise<object>}
     */
    async deleteEventLog(eventId, modifier) {
        console.log(`🗑️ [EventLogWriter] 準備刪除事件紀錄 - ID: ${eventId} by ${modifier}`);
        
        // 1. 查找事件以獲取 rowIndex 和 sheetName
        const originalEvent = await this.eventLogReader.getEventLogById(eventId);
        if (!originalEvent) throw new Error(`找不到事件ID為 ${eventId} 的紀錄`);

        const { rowIndex, eventType } = originalEvent;
        const S = this.config.SHEETS;
        let sheetName;

        // 2. 根據 eventType 決定要刪除哪張工作表
        switch(eventType) {
            case 'iot': sheetName = S.EVENT_LOGS_IOT; break;
            case 'dt': sheetName = S.EVENT_LOGS_DT; break;
            case 'dx': sheetName = S.EVENT_LOGS_DX; break;
            case 'legacy': sheetName = '事件紀錄總表'; break;
            default: sheetName = S.EVENT_LOGS_GENERAL; break;
        }

        // 3. 執行刪除
        await this._deleteRow(sheetName, rowIndex, this.eventLogReader);
        
        // 4. 清除快取
        this.eventLogReader.invalidateCache('eventLogs');
        this.opportunityReader.invalidateCache('opportunities'); // 事件會影響機會的活動

        console.log(`✅ [EventLogWriter] 事件紀錄 ${eventId} (位於 ${sheetName}, Row ${rowIndex}) 已被 ${modifier} 刪除`);
        return { success: true, deletedEvent: originalEvent };
    }
}

module.exports = EventLogWriter;