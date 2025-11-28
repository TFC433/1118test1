// controllers/line-leads.controller.js
const { handleApiError } = require('../middleware/error.middleware');

// 輔助函式：從 req.app 獲取服務
const getServices = (req) => req.app.get('services');

// GET /api/line/leads
exports.getAllLeads = async (req, res) => {
    try {
        const { contactReader, systemReader } = getServices(req); // 加入 systemReader

        // 1. 【安全驗證】獲取前端傳來的 LINE User ID
        const lineUserId = req.headers['x-line-userid'];

        // 如果沒有 User ID (未登入)，直接拒絕
        if (!lineUserId) {
            return res.status(401).json({ success: false, message: '請先登入 LINE 帳號' });
        }

        // 2. 【白名單檢查】讀取系統設定
        const systemConfig = await systemReader.getSystemConfig();
        const allowedUsers = systemConfig['LINE白名單'] || []; // 取得白名單列表

        // 檢查 User ID 是否存在於白名單中 (比對 value 欄位)
        // 允許開發模式下的特定測試 ID
        const isAllowed = allowedUsers.some(u => u.value === lineUserId) || 
                          (process.env.NODE_ENV === 'development' && lineUserId === 'TEST_LOCAL_USER');

        if (!isAllowed) {
            // 如果不在名單內，回傳 403 並附上使用者的 ID，方便管理者複製新增
            return res.status(403).json({ 
                success: false, 
                error: 'ACCESS_DENIED',
                message: '您的 LINE 帳號尚未被授權瀏覽此頁面。',
                yourUserId: lineUserId // 回傳 ID 給前端顯示
            });
        }

        // 3. 【權限通過】獲取並回傳資料
        const contacts = await contactReader.getContacts(5000);
        
        const simplifiedContacts = contacts.map(c => ({
            rowIndex: c.rowIndex,
            name: c.name || '(未命名)',
            company: c.company || '',
            position: c.position || '',
            mobile: c.mobile || '',
            email: c.email || '',
            driveLink: c.driveLink || '',
            lineUserId: c.lineUserId || '', 
            userNickname: c.userNickname || 'Unknown',
            createdTime: c.createdTime || ''
        }));

        simplifiedContacts.sort((a, b) => {
            const timeA = new Date(a.createdTime).getTime();
            const timeB = new Date(b.createdTime).getTime();
            return timeB - timeA;
        });

        res.json({ success: true, data: simplifiedContacts });
    } catch (error) {
        handleApiError(res, error, 'Get All Leads for LINE');
    }
};

// PUT /api/line/leads/:rowIndex
exports.updateLead = async (req, res) => {
    try {
        const { contactWriter, systemReader } = getServices(req);
        const { rowIndex } = req.params;
        const { modifier, ...updateData } = req.body; 
        
        // 編輯時也做同樣的權限檢查 (從 Header 拿 ID)
        const lineUserId = req.headers['x-line-userid'];
        if (!lineUserId) return res.status(401).json({ success: false, message: '未授權' });

        const systemConfig = await systemReader.getSystemConfig();
        const allowedUsers = systemConfig['LINE白名單'] || [];
        const isAllowed = allowedUsers.some(u => u.value === lineUserId) || 
                          (process.env.NODE_ENV === 'development' && lineUserId === 'TEST_LOCAL_USER');

        if (!isAllowed) return res.status(403).json({ success: false, message: '您沒有編輯權限' });

        await contactWriter.updateRawContact(parseInt(rowIndex), updateData, modifier || 'LINE User');
        
        res.json({ success: true, message: '更新成功' });
    } catch (error) {
        handleApiError(res, error, 'Update Lead via LINE');
    }
};