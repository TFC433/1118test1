// data/interaction-writer.js

const BaseWriter = require('./base-writer');

class InteractionWriter extends BaseWriter {
    /**
     * @param {import('googleapis').google.sheets_v4.Sheets} sheets 
     * @param {import('./interaction-reader')} interactionReader 
     * @param {import('./opportunity-reader')} opportunityReader 
     */
    constructor(sheets, interactionReader, opportunityReader) {
        super(sheets);
        if (!interactionReader) {
            throw new Error('InteractionWriter 需要 InteractionReader 的實例');
        }
        // 【修改點】新增對 opportunityReader 的檢查與保存
        if (!opportunityReader) {
            throw new Error('InteractionWriter 需要 OpportunityReader 的實例');
        }
        this.interactionReader = interactionReader;
        this.opportunityReader = opportunityReader;
    }

    async createInteraction(interactionData) {
        console.log('📝 [InteractionWriter] 建立互動記錄...');
        const now = new Date().toISOString();
        const interactionId = `INT${Date.now()}`;
        
        // 【修改】在 rowData 中新增 companyId 欄位
        const rowData = [
            interactionId, interactionData.opportunityId || '',
            interactionData.interactionTime || now, interactionData.eventType || '',
            interactionData.eventTitle || '', interactionData.contentSummary || '',
            interactionData.participants || '', interactionData.nextAction || '',
            interactionData.attachmentLink || '', interactionData.calendarEventId || '',
            interactionData.recorder || '', now,
            interactionData.companyId || '' // 新增 companyId
        ];
        
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.config.SPREADSHEET_ID,
            // 【修改】擴大寫入範圍到 M 欄
            range: `${this.config.SHEETS.INTERACTIONS}!A:M`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [rowData] }
        });
        
        this.interactionReader.invalidateCache('interactions');
        // 【修改點】同時清除機會案件的快取，確保排序即時更新
        this.opportunityReader.invalidateCache('opportunities');

        console.log('✅ [InteractionWriter] 互動記錄建立成功:', interactionId);
        return { success: true, interactionId, data: rowData };
    }

    async updateInteraction(rowIndex, updateData, modifier) {
        if (isNaN(parseInt(rowIndex)) || rowIndex <= 1) throw new Error(`無效的 rowIndex: ${rowIndex}`);
        console.log(`📝 [InteractionWriter] 更新互動紀錄 - Row: ${rowIndex} by ${modifier}`);
        // 【修改】擴大範圍到 M 欄以確保一致性，但請注意下方說明
        const range = `${this.config.SHEETS.INTERACTIONS}!A${rowIndex}:M${rowIndex}`;

        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.config.SPREADSHEET_ID, range: range,
        });

        const currentRow = response.data.values ? response.data.values[0] : [];
        if(currentRow.length === 0) throw new Error(`在 ${rowIndex} 列找不到互動紀錄`);

        // --- 【*** 程式碼修改點：後端安全鎖定 ***】 ---
        
        const eventType = currentRow[3] || ''; // 獲取當前儲存的事件類型
        const isLockedRecord = ['系統事件', '事件報告'].includes(eventType);

        console.log(`[InteractionWriter] 檢查紀錄類型: "${eventType}". 是否鎖定: ${isLockedRecord}`);

        // 1. 無論如何，互動時間 (2) 和最後變更者 (10) 都可以更新
        if(updateData.interactionTime !== undefined) currentRow[2] = updateData.interactionTime;
        currentRow[10] = modifier;

        // 2. 只有在「非鎖定」狀態下，才允許更新其他欄位
        if (!isLockedRecord) {
            console.log(`[InteractionWriter] 允許更新所有欄位。`);
            if(updateData.eventType !== undefined) currentRow[3] = updateData.eventType;
            if(updateData.contentSummary !== undefined) currentRow[5] = updateData.contentSummary;
            if(updateData.nextAction !== undefined) currentRow[7] = updateData.nextAction;
        } else {
            console.warn(`[InteractionWriter] 紀錄類型為 "${eventType}"，已鎖定內容欄位，僅更新時間。`);
        }
        // --- 【*** 修改結束 ***】 ---

        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.config.SPREADSHEET_ID, range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [currentRow] }
        });

        this.interactionReader.invalidateCache('interactions');
        // 【修改點】更新時也同時清除機會案件的快取
        this.opportunityReader.invalidateCache('opportunities');
        
        console.log('✅ [InteractionWriter] 互動紀錄更新成功');
        return { success: true };
    }

    /**
     * 【新增】刪除一筆互動紀錄
     * @param {number} rowIndex 
     * @returns {Promise<object>}
     */
    async deleteInteraction(rowIndex) {
        if (isNaN(parseInt(rowIndex)) || rowIndex <= 1) {
            throw new Error(`無效的 rowIndex: ${rowIndex}`);
        }
        console.log(`🗑️ [InteractionWriter] 刪除互動紀錄 - Row: ${rowIndex}`);

        // 使用 BaseWriter 提供的 _deleteRow 輔助函式
        await this._deleteRow(
            this.config.SHEETS.INTERACTIONS, 
            rowIndex, 
            this.interactionReader // 傳入 reader 以便清除快取
        );
        
        // 清除快取
        this.interactionReader.invalidateCache('interactions');
        this.opportunityReader.invalidateCache('opportunities'); // 互動會影響機會的最後活動時間

        console.log('✅ [InteractionWriter] 互動紀錄刪除成功');
        return { success: true };
    }
}

module.exports = InteractionWriter;