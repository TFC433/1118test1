// data/contact-writer.js

const BaseWriter = require('./base-writer');

/**
 * 專門負責處理與「聯絡人」相關的寫入/更新操作
 */
class ContactWriter extends BaseWriter {
    /**
     * @param {import('googleapis').google.sheets_v4.Sheets} sheets 
     * @param {import('./contact-reader')} contactReader 
     */
    constructor(sheets, contactReader) {
        super(sheets);
        if (!contactReader) {
            throw new Error('ContactWriter 需要 ContactReader 的實例');
        }
        this.contactReader = contactReader;
    }

    /**
     * 取得或建立一位聯絡人 (在聯絡人總表中)
     * @param {object} contactInfo - 聯絡人資訊
     * @param {object} companyData - 公司資料
     * @param {string} modifier - 操作者
     * @returns {Promise<object>}
     */
    async getOrCreateContact(contactInfo, companyData, modifier) {
        // 使用注入的 contactReader 進行讀取操作
        const allContacts = await this.contactReader.getContactList();
        const existingContact = allContacts.find(c => c.name === contactInfo.name && c.companyId === companyData.id);
        
        if (existingContact) {
             console.log(`👤 [ContactWriter] 聯絡人已存在: ${contactInfo.name}`);
             return {
                 id: existingContact.contactId,
                 name: existingContact.name,
             };
        }

        console.log(`👤 [ContactWriter] 建立新聯絡人: ${contactInfo.name} by ${modifier}`);
        const now = new Date().toISOString();
        const newContactId = `CON${Date.now()}`;
        const newRow = [
            newContactId,
            contactInfo.rowIndex ? `BC-${contactInfo.rowIndex}` : 'MANUAL',
            contactInfo.name || '',
            companyData.id,
            contactInfo.department || '', contactInfo.position || '',
            contactInfo.mobile || '', contactInfo.phone || '',
            contactInfo.email || '',
            now, now,
            modifier,
            modifier
        ];
        
        await this.sheets.spreadsheets.values.append({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: `${this.config.SHEETS.CONTACT_LIST}!A:M`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [newRow] }
        });

        // 使聯絡人總表的快取失效
        this.contactReader.invalidateCache('contactList');

        return { id: newContactId, name: contactInfo.name };
    }

    /**
     * 更新已建檔聯絡人資料
     * @param {string} contactId - 聯絡人ID
     * @param {object} updateData - 要更新的資料物件
     * @param {string} modifier - 操作者
     * @returns {Promise<object>}
     */
    async updateContact(contactId, updateData, modifier) {
        console.log(`👤 [ContactWriter] 更新聯絡人資料: ${contactId} by ${modifier}`);
        const range = `${this.config.SHEETS.CONTACT_LIST}!A:M`;
        const contactRow = await this.contactReader.findRowByValue(range, 0, contactId);
        if (!contactRow) throw new Error(`找不到聯絡人ID: ${contactId}`);

        const { rowIndex, rowData: currentRow } = contactRow;
        const now = new Date().toISOString();
        
        // 【最終修正】確保所有從名片來的資料都能被正確更新
        if(updateData.sourceId !== undefined) currentRow[1] = updateData.sourceId;
        if(updateData.name !== undefined) currentRow[2] = updateData.name;
        if(updateData.companyId !== undefined) currentRow[3] = updateData.companyId;
        if(updateData.department !== undefined) currentRow[4] = updateData.department;
        if(updateData.position !== undefined) currentRow[5] = updateData.position;
        if(updateData.mobile !== undefined) currentRow[6] = updateData.mobile;
        if(updateData.phone !== undefined) currentRow[7] = updateData.phone;
        if(updateData.email !== undefined) currentRow[8] = updateData.email;
        
        currentRow[10] = now; // 最後更新時間
        currentRow[12] = modifier; // 最後變更者
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: `${this.config.SHEETS.CONTACT_LIST}!A${rowIndex}:M${rowIndex}`,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [currentRow] }
        });

        this.contactReader.invalidateCache('contactList');
        console.log('✅ [ContactWriter] 聯絡人資料更新成功');
        return { success: true };
    }

    /**
     * 更新潛在客戶的狀態欄位 (在原始名片資料中)
     * @param {number} rowIndex - '原始名片資料' 中的列索引 (1-based)
     * @param {string} status - 要寫入的狀態文字
     * @returns {Promise<object>}
     */
    async updateContactStatus(rowIndex, status) {
        if (isNaN(parseInt(rowIndex)) || rowIndex <= 1) throw new Error(`無效的 rowIndex: ${rowIndex}`);
        
        const range = `${this.config.SHEETS.CONTACTS}!Y${rowIndex}`;
        console.log(`📝 [ContactWriter] 更新潛在客戶狀態 - Row: ${rowIndex} -> ${status}`);
        
        await this.sheets.spreadsheets.values.update({
            spreadsheetId: this.config.SPREADSHEET_ID,
            range: range,
            valueInputOption: 'USER_ENTERED',
            resource: { values: [[status]] }
        });
        
        // 使潛在客戶的快取失效
        this.contactReader.invalidateCache('contacts');
        return { success: true };
    }
}

module.exports = ContactWriter;