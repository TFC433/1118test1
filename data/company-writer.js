// data/company-writer.js

const BaseWriter = require('./base-writer');

/**
 * 專門負責處理與「公司總表」相關的寫入/更新操作
 */
class CompanyWriter extends BaseWriter {
    /**
     * @param {import('googleapis').google.sheets_v4.Sheets} sheets 
     * @param {import('./company-reader')} companyReader 
     */
    constructor(sheets, companyReader) {
        super(sheets);
        if (!companyReader) {
            throw new Error('CompanyWriter 需要 CompanyReader 的實例');
        }
        this.companyReader = companyReader;
    }

    /**
     * 取得或建立一間公司
     * @param {string} companyName - 公司名稱
     * @param {object} contactInfo - 聯絡人資訊 (用於填充)
     * @param {string} modifier - 操作者
     * @param {object} opportunityData - 機會資料 (用於填充縣市)
     * @returns {Promise<object>}
     */
    async getOrCreateCompany(companyName, contactInfo, modifier, opportunityData) {
        // 【修改】擴大範圍以匹配新的工作表結構
        const range = `${this.config.SHEETS.COMPANY_LIST}!A:M`;
        // 使用注入的 companyReader 進行操作
        const existingCompany = await this.companyReader.findRowByValue(range, 1, companyName);

        if (existingCompany) {
            console.log(`🏢 [CompanyWriter] 公司已存在: ${companyName}`);
            return {
                id: existingCompany.rowData[0],
                name: existingCompany.rowData[1],
                rowIndex: existingCompany.rowIndex
            };
        }

        const county = opportunityData.county || '';
        console.log(`🏢 [CompanyWriter] 建立新公司: ${companyName} 位於 ${county} by ${modifier}`);
        const now = new Date().toISOString();
        const newCompanyId = `COM${Date.now()}`;
        
        // 【修改】在建立新公司時，為新欄位提供預設空值
        const newRow = [
            newCompanyId, companyName,
            contactInfo.phone || contactInfo.mobile || '',
            contactInfo.address || '',
            now, now, county,
            modifier,
            modifier,
            '', // 公司簡介初始為空
            '', // 公司類型
            '', // 客戶階段
            ''  // 互動評級
        ];

        const response = await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [newRow] }
        });
        
        // 清除 CompanyList 的快取
        this.companyReader.invalidateCache('companyList');

        const updatedRange = response.data.updates.updatedRange;
        const match = updatedRange.match(/!A(\d+)/);
        const newRowIndex = match ? parseInt(match[1]) : null;

        return { id: newCompanyId, name: companyName, rowIndex: newRowIndex };
    }

    /**
     * 更新公司資料
     * @param {string} companyName - 公司名稱
     * @param {object} updateData - 要更新的資料物件
     * @param {string} modifier - 操作者
     * @returns {Promise<object>}
     */
    async updateCompany(companyName, updateData, modifier) {
        console.log(`🏢 [CompanyWriter] 更新公司資料: ${companyName} by ${modifier}`);
        // 【修改】擴大範圍以匹配新的工作表結構
        const range = `${this.config.SHEETS.COMPANY_LIST}!A:M`;
        const companyRow = await this.companyReader.findRowByValue(range, 1, companyName);
        if (!companyRow) throw new Error(`找不到公司: ${companyName}`);

        const { rowIndex, rowData: currentRow } = companyRow;
        const now = new Date().toISOString();

        if(updateData.phone !== undefined) currentRow[2] = updateData.phone;
        if(updateData.address !== undefined) currentRow[3] = updateData.address;
        if(updateData.county !== undefined) currentRow[6] = updateData.county;
        if(updateData.introduction !== undefined) currentRow[9] = updateData.introduction;
        
        // 【修改】增加對新欄位的更新邏輯
        if(updateData.companyType !== undefined) currentRow[10] = updateData.companyType;
        if(updateData.customerStage !== undefined) currentRow[11] = updateData.customerStage;
        if(updateData.engagementRating !== undefined) currentRow[12] = updateData.engagementRating;

        currentRow[5] = now; // 最後更新時間
        currentRow[8] = modifier; // 最後變更者

        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.config.SPREADSHEET_ID,
            // 【修改】擴大更新範圍
            range: `${this.config.SHEETS.COMPANY_LIST}!A${rowIndex}:M${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [currentRow] }
        });

        this.companyReader.invalidateCache('companyList');
        console.log('✅ [CompanyWriter] 公司資料更新成功');
        return { success: true };
    }

    /**
     * 【新增】刪除一間公司
     * @param {string} companyName - 要刪除的公司名稱
     * @returns {Promise<object>}
     */
    async deleteCompany(companyName) {
        console.log(`🗑️ [CompanyWriter] 準備刪除公司: ${companyName}`);
        const range = `${this.config.SHEETS.COMPANY_LIST}!A:M`;
        
        // 依賴注入的 reader 查找
        const companyRow = await this.companyReader.findRowByValue(range, 1, companyName);
        if (!companyRow) {
            throw new Error(`找不到公司: ${companyName}`);
        }

        const { rowIndex } = companyRow;

        // 呼叫 BaseWriter 的輔助函式來刪除
        await this._deleteRow(
            this.config.SHEETS.COMPANY_LIST,
            rowIndex,
            this.companyReader // 傳入 reader 以便清除快取
        );

        // invalidateCache 已在 _deleteRow 中呼叫
        console.log(`✅ [CompanyWriter] 公司 "${companyName}" (Row: ${rowIndex}) 已被刪除`);
        return { success: true, deletedCompanyId: companyRow.rowData[0] /* companyId */ };
    }
}

module.exports = CompanyWriter;