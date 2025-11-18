// routes/company.routes.js (更新版)
const express = require('express');
const router = express.Router();
const companyController = require('../controllers/company.controller');
const externalController = require('../controllers/external.controller'); // <-- 引入 AI 控制器

// GET /api/companies/
router.get('/', companyController.getCompanies);

// --- AI 路由 ---
// POST /api/companies/:companyName/generate-profile
// (必須定義在 :companyName/details 之前，以免被誤判)
router.post('/:companyName/generate-profile', externalController.generateCompanyProfile); // <-- 新增

// --- 公司路由 ---
// GET /api/companies/:companyName/details
router.get('/:companyName/details', companyController.getCompanyDetails);

// PUT /api/companies/:companyName
router.put('/:companyName', companyController.updateCompany);

// DELETE /api/companies/:companyName
router.delete('/:companyName', companyController.deleteCompany);

module.exports = router;