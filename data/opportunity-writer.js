// data/opportunity-writer.js

const BaseWriter = require('./base-writer');

/**
 * 專門負責處理與「機會案件」及「關聯」相關的寫入/更新操作
 */
class OpportunityWriter extends BaseWriter {
    /**
     * @param {import('googleapis').google.sheets_v4.Sheets} sheets 
     * @param {import('./opportunity-reader')} opportunityReader 
     * @param {import('./contact-reader')} contactReader 
     */
    constructor(sheets, opportunityReader, contactReader) {
        super(sheets);
        if (!opportunityReader || !contactReader) {
            throw new Error('OpportunityWriter 需要 OpportunityReader 和 ContactReader 的實例');
        }
        this.opportunityReader = opportunityReader;
        this.contactReader = contactReader;
    }

    /**
     * 更新單筆機會案件
     * @param {number} rowIndex 
     * @param {object} updateData 
     * @param {string} modifier 
     * @returns {Promise<object>}
     */
    async updateOpportunity(rowIndex, updateData, modifier) {
        if (isNaN(parseInt(rowIndex)) || rowIndex <= 1) throw new Error(`無效的 rowIndex: ${rowIndex}`);
        console.log(`📝 [OpportunityWriter] 更新機會案件 - Row: ${rowIndex} by ${modifier}`);
        
        const now = new Date().toISOString();
        // 【*** 修改：擴大範圍到 X 欄 ***】
        const range = `${this.config.SHEETS.OPPORTUNITIES}!A${rowIndex}:X${rowIndex}`;

        const response = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: range,
        });
        
        const currentRow = response.data.values ? response.data.values[0] : [];
        if(currentRow.length === 0) throw new Error(`在 ${rowIndex} 列找不到資料`);
        
        // 更新欄位
        if(updateData.opportunityName !== undefined) currentRow[1] = updateData.opportunityName;
        if(updateData.customerCompany !== undefined) currentRow[2] = updateData.customerCompany;
        if(updateData.mainContact !== undefined) currentRow[3] = updateData.mainContact;
        if(updateData.contactPhone !== undefined) currentRow[4] = updateData.contactPhone;
        if(updateData.assignee !== undefined) currentRow[5] = updateData.assignee;
        if(updateData.opportunityType !== undefined) currentRow[6] = updateData.opportunityType;
        if(updateData.opportunitySource !== undefined) currentRow[7] = updateData.opportunitySource;
        if(updateData.currentStage !== undefined) currentRow[8] = updateData.currentStage;
        if(updateData.expectedCloseDate !== undefined) currentRow[10] = updateData.expectedCloseDate;
        if(updateData.opportunityValue !== undefined) currentRow[11] = updateData.opportunityValue;
        if(updateData.currentStatus !== undefined) currentRow[12] = updateData.currentStatus;
        if(updateData.notes !== undefined) currentRow[15] = updateData.notes;
        
        if(updateData.stageHistory !== undefined) currentRow[17] = updateData.stageHistory;
        if(updateData.parentOpportunityId !== undefined) currentRow[18] = updateData.parentOpportunityId;
        
        // 【新增】對新的銷售情報欄位進行更新
        if(updateData.orderProbability !== undefined) currentRow[19] = updateData.orderProbability;
        
        // 【*** 修改：寫入 potentialSpecification (JSON 字串) ***】
        if(updateData.potentialSpecification !== undefined) currentRow[20] = updateData.potentialSpecification; 
        
        if(updateData.salesChannel !== undefined) currentRow[21] = updateData.salesChannel;
        if(updateData.deviceScale !== undefined) currentRow[22] = updateData.deviceScale;

        // 【*** 新增：寫入 opportunityValueType ***】
        if(updateData.opportunityValueType !== undefined) currentRow[23] = updateData.opportunityValueType;

        currentRow[14] = now; // 最後更新時間
        currentRow[16] = modifier; // 最後變更者
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [currentRow] }
        });

        this.opportunityReader.invalidateCache('opportunities');
        console.log('✅ [OpportunityWriter] 機會案件更新成功');

        const updatedOpportunity = {
            rowIndex: rowIndex,
            opportunityId: currentRow[0],
            // ... (可以根據需要回傳完整的物件)
        };
        return { success: true, data: updatedOpportunity };
    }

    /**
     * 批量更新機會案件
     * @param {Array<object>} updates 
     * @returns {Promise<object>}
     */
    async batchUpdateOpportunities(updates) {
        console.log('📝 [OpportunityWriter] 執行高效批量更新機會案件...');
        const data = await Promise.all(updates.map(async (update) => {
            // 【*** 修改：擴大範圍到 X 欄 ***】
            const range = `${this.config.SHEETS.OPPORTUNITIES}!A${update.rowIndex}:X${update.rowIndex}`;
            const response = await this.sheets.spreadsheets.values.get({ spreadsheetId: this.config.SPREADSHEET_ID, range });
            const currentRow = response.data.values ? response.data.values[0] : [];
            if (currentRow.length === 0) return null;

            const { data, modifier } = update;
            if (data.currentStage !== undefined) currentRow[8] = data.currentStage;
            
            if (data.stageHistory !== undefined) currentRow[17] = data.stageHistory;

            currentRow[14] = new Date().toISOString();
            currentRow[16] = modifier;
            
            return { range, values: [currentRow] };
        }));

        const validData = data.filter(d => d !== null);
        if (validData.length === 0) {
            return { success: true, successCount: 0, failCount: updates.length };
        }

        await this.sheets.spreadsheets.values.batchUpdate({
            spreadsheetId: this.config.SPREADSHEET_ID,
            resource: {
                valueInputOption: 'USER_ENTERED',
                data: validData
            }
        });

        this.opportunityReader.invalidateCache('opportunities');
        console.log(`✅ [OpportunityWriter] 批量更新完成`);
        return { success: true, successCount: validData.length, failCount: updates.length - validData.length };
    }
    
    /**
     * 刪除一筆機會案件
     * @param {number} rowIndex 
     * @param {string} modifier 
     * @returns {Promise<object>}
     */
    async deleteOpportunity(rowIndex, modifier) {
        if (isNaN(parseInt(rowIndex)) || rowIndex <= 1) throw new Error(`無效的 rowIndex: ${rowIndex}`);
        console.log(`🗑️ [OpportunityWriter] 刪除機會案件 - Row: ${rowIndex} by ${modifier}`);
        
        // _deleteRow 需要一個 reader 實例來清除快取
        await this._deleteRow(this.config.SHEETS.OPPORTUNITIES, rowIndex, this.opportunityReader);
        
        console.log('✅ [OpportunityWriter] 機會案件刪除成功');
        return { success: true };
    }

    /**
     * 建立機會與聯絡人的關聯
     * @param {string} opportunityId 
     * @param {string} contactId 
     * @param {string} modifier 
     * @returns {Promise<object>}
     */
    async linkContactToOpportunity(opportunityId, contactId, modifier) {
        console.log(`🔗 [OpportunityWriter] 建立關聯: 機會 ${opportunityId} <-> 聯絡人 ${contactId}`);
        const now = new Date().toISOString();
        const linkId = `LNK${Date.now()}`;
        
        const rowData = [linkId, opportunityId, contactId, now, 'active', modifier];
        
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: `${this.config.SHEETS.OPPORTUNITY_CONTACT_LINK}!A:F`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [rowData] }
        });
        
        this.contactReader.invalidateCache('oppContactLinks');
        
        console.log('✅ [OpportunityWriter] 關聯建立成功:', linkId);
        return { success: true, linkId: linkId };
    }

    /**
     * 刪除機會與聯絡人的關聯
     * @param {string} opportunityId 
     * @param {string} contactId 
     * @returns {Promise<object>}
     */
    async deleteContactLink(opportunityId, contactId) {
        console.log(`🗑️ [OpportunityWriter] 永久刪除關聯: 機會 ${opportunityId} <-> 聯絡人 ${contactId}`);
        const range = `${this.config.SHEETS.OPPORTUNITY_CONTACT_LINK}!A:F`;
        
        const allLinks = await this.contactReader.getAllOppContactLinks();
        // 為了找到 rowIndex，我們需要讀取原始資料
        const linkRowsResponse = await this.sheets.spreadsheets.values.get({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: range,
        });

        const rows = linkRowsResponse.data.values || [];
        for (let i = 1; i < rows.length; i++) { // i=1 忽略標頭
            const rowOppId = rows[i][this.config.OPP_CONTACT_LINK_FIELDS.OPPORTUNITY_ID];
            const rowContactId = rows[i][this.config.OPP_CONTACT_LINK_FIELDS.CONTACT_ID];
            
            if (rowOppId === opportunityId && rowContactId === contactId) {
                const rowIndexToDelete = i + 1;
                await this._deleteRow(this.config.SHEETS.OPPORTUNITY_CONTACT_LINK, rowIndexToDelete, this.contactReader);
                console.log(`✅ [OpportunityWriter] 成功刪除關聯於第 ${rowIndexToDelete} 列`);
                return { success: true, rowIndex: rowIndexToDelete };
            }
        }
        throw new Error('找不到對應的關聯紀錄');
    }
}

module.exports = OpportunityWriter;