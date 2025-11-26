// data/system-reader.js

const BaseReader = require('./base-reader');

/**
 * 專門負責讀取系統級資料的類別 (系統設定、使用者)
 */
class SystemReader extends BaseReader {
    constructor(sheets) {
        super(sheets);
    }

    /**
     * 取得系統設定工作表內容
     * @returns {Promise<object>}
     */
    async getSystemConfig() {
        const cacheKey = 'systemConfig';
        const now = Date.now();
        
        if (this.cache[cacheKey] && this.cache[cacheKey].data && (now - this.cache[cacheKey].timestamp < this.CACHE_DURATION)) {
            console.log(`✅ [Cache] 從快取讀取 ${cacheKey}...`);
            return this.cache[cacheKey].data;
        }

        console.log(`🔄 [API] 從 Google Sheet 讀取 ${cacheKey}...`);
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.config.SPREADSHEET_ID,
                // 【修改】擴大讀取範圍到 I 欄 (第9欄) 用來讀取分類
                range: `${this.config.SHEETS.SYSTEM_CONFIG}!A:I`,
            });
            
            const rows = response.data.values || [];
            
            const settings = {};
            
            // 初始化事件類型 (硬編碼部分，確保基本類型存在)
            if (!settings['事件類型']) {
                settings['事件類型'] = [
                    { value: 'general', note: '一般', order: 1, color: '#6c757d' },
                    { value: 'iot', note: 'IOT', order: 2, color: '#007bff' },
                    { value: 'dt', note: 'DT', order: 3, color: '#28a745' },
                    { value: 'dx', note: 'DX', order: 4, color: '#ffc107' },
                    { value: 'legacy', note: '舊事件', order: 5, color: '#dc3545' }
                ];
            }

            // --- 【修正】日曆篩選規則的預設值 (只留結構，不留資料) ---
            // 確保資料結構存在，但內容為空，完全依賴 Sheet 設定
            if (!settings['日曆篩選規則']) {
                settings['日曆篩選規則'] = []; 
            }
            // --- 修正結束 ---
            
            if (rows.length > 1) {
                rows.slice(1).forEach(row => {
                    // 【修改】解構賦值增加 category (I欄)
                    const [type, item, order, enabled, note, color, value2, value3, category] = row;
                    
                    if (enabled === 'TRUE' && type && item) {
                        if (!settings[type]) settings[type] = [];
                        
                        const exists = settings[type].find(i => i.value === item);
                        if (exists) {
                            // 如果 Sheet 有設定，更新預設值
                            exists.note = note || item;
                            exists.order = parseInt(order) || 99;
                        } else {
                            settings[type].push({
                                value: item,
                                note: note || item,
                                order: parseInt(order) || 99,
                                color: color || null,
                                value2: value2 || null, // G欄: 規格單價
                                value3: value3 || null, // H欄: 行為模式
                                category: category || '其他' // 【新增】I欄 分類，預設為 '其他'
                            });
                        }
                    }
                });
            }
            
            // 依照順序欄位排序
            Object.keys(settings).forEach(type => settings[type].sort((a, b) => a.order - b.order));
            
            this.cache[cacheKey] = { data: settings, timestamp: now };
            return settings;

        } catch (error) {
            console.error('❌ [DataReader] 讀取系統設定失敗:', error);
            return this.config.DEFAULT_SETTINGS || {};
        }
    }

    /**
     * 取得使用者名冊
     * @returns {Promise<Array<object>>}
     */
    async getUsers() {
        const cacheKey = 'users';
        const range = '使用者名冊!A:C';

        const rowParser = (row) => ({
            username: row[0],
            passwordHash: row[1],
            displayName: row[2]
        });

        const allUsers = await this._fetchAndCache(cacheKey, range, rowParser);
        return allUsers.filter(user => user.username && user.passwordHash);
    }
}

module.exports = SystemReader;