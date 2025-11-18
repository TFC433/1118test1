// data/base-reader.js (已修正錯誤處理與快取邏輯)

const config = require('../config');

// 集中管理所有資料的快取狀態
const cache = {
    opportunities: { data: null, timestamp: 0 },
    contacts: { data: null, timestamp: 0 }, // 潛在客戶
    interactions: { data: null, timestamp: 0 },
    eventLogs: { data: null, timestamp: 0 },
    systemConfig: { data: null, timestamp: 0 },
    companyList: { data: null, timestamp: 0 },
    contactList: { data: null, timestamp: 0 }, // 已建檔聯絡人
    users: { data: null, timestamp: 0 },
    weeklyBusiness: { data: null, timestamp: 0 }, // 快取週間業務的完整資料
    weeklyBusinessSummary: { data: null, timestamp: 0 }, // 快取週間業務的摘要資料 (在 WeeklyBusinessReader 中使用)
    oppContactLinks: { data: null, timestamp: 0 },
    announcements: { data: null, timestamp: 0 }, // 新增佈告欄快取
    
    // --- 【*** 新增：全域最後寫入時間戳 ***】 ---
    // 我們使用 data 欄位來儲存時間戳，使其能在所有 Reader 實例之間共享
    _globalLastWrite: { data: Date.now(), timestamp: 0 }
    // --- 【*** 新增結束 ***】 ---
};

// 【*** 關鍵修改：平衡效能與延遲 ***】
const CACHE_DURATION = 30 * 1000; // 快取 30 秒 (原為 60 秒)
// 【*** 修改結束 ***】


/**
 * 所有 Reader 的基礎類別，負責處理通用的快取邏輯和 API 互動
 */
class BaseReader {
    /**
     * @param {import('googleapis').google.sheets_v4.Sheets} sheets - 已認證的 Google Sheets API 實例
     */
    constructor(sheets) {
        if (!sheets) {
            throw new Error('BaseReader 需要一個已認證的 Sheets API 實例');
        }
        this.sheets = sheets;
        this.config = config;
        this.cache = cache; // 直接使用共享的 cache 物件
        this.CACHE_DURATION = CACHE_DURATION;
    }

    /**
     * 使指定的快取失效
     * @param {string} [key=null] - 要失效的快取鍵名 (e.g., 'opportunities')。若為 null，則清除所有快取。
     */
    invalidateCache(key = null) {
        if (key && this.cache[key]) {
            this.cache[key].timestamp = 0;
            console.log(`✅ [Cache] 快取已失效: ${key}`);
        } else if (key === null) {
            Object.keys(this.cache).forEach(k => {
                if (this.cache[k]) { // 確保 key 存在於 cache 中
                  this.cache[k].timestamp = 0;
                }
            });
            console.log('✅ [Cache] 所有快取已失效');
        } else if (key && !this.cache[key]) {
             console.warn(`⚠️ [Cache] 嘗試清除不存在的快取鍵: ${key}`);
        }

        // --- 【*** 新增：更新全域時間戳 ***】 ---
        // 任何寫入操作觸發的 invalidateCache 都會更新這個時間
        this.cache._globalLastWrite.data = Date.now();
        console.log(`[Cache] Global write timestamp updated to: ${this.cache._globalLastWrite.data}`);
        // --- 【*** 新增結束 ***】 ---
    }

    /**
     * [核心方法] 執行 "先讀快取，若無則從 API 獲取並存入快取" 的流程
     * @protected
     * @param {string} cacheKey - 在 cache 物件中的鍵名
     * @param {string} range - 要讀取的 Google Sheet 範圍 (e.g., 'Sheet1!A:Z')
     * @param {(row: any[], index: number) => object} rowParser - 用於將單行陣列資料解析為物件的函式
     * @param {(a: object, b: object) => number} [sorter=null] - (可選) 用於排序結果陣列的比較函式
     * @returns {Promise<Array<object>>}
     */
    async _fetchAndCache(cacheKey, range, rowParser, sorter = null) {
        const now = Date.now();

        // 確保 cacheKey 存在於 cache 物件中
        if (!this.cache[cacheKey]) {
            console.warn(`⚠️ [Cache] 初始化不存在的快取鍵: ${cacheKey}`);
            this.cache[cacheKey] = { data: null, timestamp: 0 };
        }

        if (this.cache[cacheKey].data && (now - this.cache[cacheKey].timestamp < this.CACHE_DURATION)) {
            console.log(`✅ [Cache] 從快取讀取 ${cacheKey}...`);
            return this.cache[cacheKey].data;
        }

        console.log(`🔄 [API] 從 Google Sheet 讀取 ${cacheKey} (${range})...`);
        try {
            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.config.SPREADSHEET_ID,
                range: range,
            });

            const rows = response.data.values || [];
            let data = [];
            // 確保至少有標頭行（長度>0）才處理 slice(1)
            if (rows.length > 1) {
                // 將 rowIndex 的計算移到 rowParser 外部，使其更通用
                data = rows.slice(1).map((row, index) => {
                     // 傳遞原始的 0-based 索引給 parser
                    const parsedRow = rowParser(row, index);
                    // 如果 parser 沒有自行添加 rowIndex，則在這裡添加 (1-based for Sheets row number)
                    if (parsedRow && typeof parsedRow.rowIndex === 'undefined') {
                       // rowIndex 應該是相對於 slice(1) 後的索引 + 2 (1 for header, 1 for 1-based index)
                       parsedRow.rowIndex = index + 2;
                    }
                    return parsedRow;
                }).filter(item => item !== null && item !== undefined); // 過濾掉 parser 可能回傳的 null/undefined
            } else {
                 console.log(`[DataReader] 工作表 ${range} 為空或只有標頭，回傳空陣列。`);
            }


            if (sorter) {
                data = data.sort(sorter);
            }

            this.cache[cacheKey] = { data, timestamp: now };
            console.log(`[Cache] ${cacheKey} 快取已更新，共 ${data.length} 筆紀錄。`);
            return data;

        } catch (error) {
            console.error(`❌ [DataReader] 讀取 ${range} 時發生錯誤:`, error.message);

            // --- 【修改】 ---
            // 檢查是否為 'Unable to parse range' 錯誤
            if (error.code === 400 && error.message.includes('Unable to parse range')) {
                 console.warn(`⚠️ [DataReader] 工作表或範圍不存在: ${range}，將快取空陣列結果。`);
                 // 將空陣列存入快取，並設定時間戳
                 this.cache[cacheKey] = { data: [], timestamp: now };
                 return []; // 回傳空陣列
            }
            // --- 修改結束 ---

            // 對於其他類型的錯誤，可以選擇拋出，或者也快取空陣列/null 來避免短時間內重複失敗
            // 這裡選擇快取空陣列，防止短時間內對同一個錯誤 API 的重複呼叫
            console.warn(`⚠️ [DataReader] 讀取 ${cacheKey} 時發生非預期錯誤，暫時快取空陣列。`);
            this.cache[cacheKey] = { data: [], timestamp: now };
            return []; // 或者可以考慮 throw error; 如果希望API層面直接知道失敗
        }
    }

    /**
     * 在指定範圍內根據欄位值查找特定列 (此為低效能操作，應盡量避免)
     * @param {string} range - 工作表與範圍, e.g., 'Sheet1!A:B'
     * @param {number} columnIndex - 要比對的欄位索引 (0-based)
     * @param {string} value - 要尋找的值
     * @returns {Promise<object|null>} - 包含 rowData 和 rowIndex 的物件，或 null
     */
    async findRowByValue(range, columnIndex, value) {
        try {
            // 優化：先嘗試從快取讀取
            const cacheKey = range.split('!')[0]; // Use sheet name as potential cache key segment
            // Note: This simple cache check might not be fully reliable if the range changes often
            // or if the underlying data uses a different cache key.
            // A more robust solution might involve parsing the sheet name and checking its specific cache.
            // For now, we proceed to the direct API call for simplicity/correctness for now.

            // if (this.cache[cacheKey] && this.cache[cacheKey].data) {
            //     console.log(`[Cache] Attempting findRowByValue for ${value} in cached ${cacheKey}`);
            //     const found = this.cache[cacheKey].data.find((row, index) => {
            //         // This assumes the cached data is an array of objects
            //         // Need to map columnIndex back to object property if possible, or adjust cache structure
            //         // This part is complex and depends heavily on how data is cached.
            //         // Let's stick to the direct API call for simplicity/correctness for now.
            //     });
            //     if (found) return found; // Adjust return format { rowData, rowIndex }
            // }


            const response = await this.sheets.spreadsheets.values.get({
                spreadsheetId: this.config.SPREADSHEET_ID,
                range: range,
            });
            const rows = response.data.values || [];
            // 確保 columnIndex 在 row 的範圍內
            if (rows.length > 0 && columnIndex >= rows[0].length) {
                 console.warn(`⚠️ [DataReader] findRowByValue: columnIndex ${columnIndex} is out of bounds for range ${range}`);
                 return null;
            }
            for (let i = 1; i < rows.length; i++) { // 從 1 開始忽略標頭
                // 增加檢查確保 row[i] 存在且 row[i][columnIndex] 存在
                if (rows[i] && rows[i][columnIndex] !== undefined && rows[i][columnIndex] !== null) {
                   // 比較時轉換為字串並轉小寫
                   if (String(rows[i][columnIndex]).toLowerCase() === String(value).toLowerCase()) {
                        return { rowData: rows[i], rowIndex: i + 1 }; // rowIndex 是 1-based
                   }
                }
            }
            return null;
        } catch (error) {
            if (error.code === 400 && error.message.includes('Unable to parse range')) {
                 console.warn(`⚠️ [DataReader] findRowByValue: 工作表或範圍不存在: ${range}，將其視為找不到。`);
                 return null;
            }
            console.error(`❌ [DataReader] 在 ${range} 查找 ${value} 時發生錯誤:`, error.message);
            throw error; // Rethrow unexpected errors
        }
    }
}

module.exports = BaseReader;