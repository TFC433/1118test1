// controllers/company.controller.js
const { handleApiError } = require('../middleware/error.middleware');

// 輔助函式：從 req.app 獲取服務
const getServices = (req) => req.app.get('services');

// GET /api/companies
exports.getCompanies = async (req, res) => {
    try {
        const { companyService } = getServices(req);
        const sortedCompanies = await companyService.getCompanyListWithActivity();
        res.json({ success: true, data: sortedCompanies });
    } catch (error) {
        handleApiError(res, error, 'Get Companies');
    }
};

// GET /api/companies/:companyName/details
exports.getCompanyDetails = async (req, res) => {
    try {
        const { companyService } = getServices(req);
        res.json({ success: true, data: await companyService.getCompanyDetails(decodeURIComponent(req.params.companyName)) });
    } catch (error) {
        handleApiError(res, error, 'Get Company Details');
    }
};

// PUT /api/companies/:companyName
exports.updateCompany = async (req, res) => {
    try {
        // --- 修改點：改為呼叫 companyService ---
        const { companyService } = getServices(req);
        res.json(await companyService.updateCompany(decodeURIComponent(req.params.companyName), req.body, req.user.name));
    } catch (error) {
        handleApiError(res, error, 'Update Company');
    }
};

// DELETE /api/companies/:companyName
exports.deleteCompany = async (req, res) => {
    try {
        const { companyService } = getServices(req);
        const companyName = decodeURIComponent(req.params.companyName);
        const result = await companyService.deleteCompany(companyName, req.user.name);
        res.json(result);
    } catch (error) {
        // 【重要】這裡是我們之前修正過的特殊錯誤處理
        // 檢查是否為我們預期的「安全的」業務邏輯錯誤 (例如 "無法刪除：...")
        if (error.message.startsWith('無法刪除：')) {
            console.warn(`[Delete Company] Business logic error: ${error.message}`);
            // 回傳 400 (Bad Request)，並附上具體的錯誤訊息
            res.status(400).json({ success: false, error: error.message, details: error.message });
        } else {
            // 對於其他非預期的錯誤，才使用通用的 500 錯誤處理
            handleApiError(res, error, 'Delete Company');
        }
    }
};