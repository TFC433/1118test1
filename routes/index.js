// routes/index.js (最終版)
const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth.middleware');

// --- 引入所有功能的路由 ---
const authRoutes = require('./auth.routes');
const opportunityRoutes = require('./opportunity.routes');
const systemRoutes = require('./system.routes');
const announcementRoutes = require('./announcement.routes');
const contactRoutes = require('./contact.routes');
const companyRoutes = require('./company.routes');
const interactionRoutes = require('./interaction.routes');
const weeklyRoutes = require('./weekly.routes');
const salesRoutes = require('./sales.routes');
const eventRoutes = require('./event.routes');         // <-- 新增
const calendarRoutes = require('./calendar.routes');   // <-- 新增
const externalRoutes = require('./external.routes');   // <-- 新增

// --- 引入特例 Controller ---
const contactController = require('../controllers/contact.controller'); 

// --- 掛載路由 ---

// 1. 公開路由 (不需要 Token 驗證)
// 匹配: POST /api/auth/login
router.use('/auth', authRoutes);


// 2. 受保護的路由 (所有在此之後的路由都需要 Token 驗證)
router.use(authMiddleware.verifyToken); // <-- 【重要】Token 驗證中介軟體

// 掛載所有受保護的模組
router.use('/opportunities', opportunityRoutes);
router.use('/', systemRoutes);
router.use('/announcements', announcementRoutes);
router.use('/contacts', contactRoutes);
router.use('/companies', companyRoutes);
router.use('/interactions', interactionRoutes);
router.use('/business/weekly', weeklyRoutes);
router.use('/sales-analysis', salesRoutes);
router.use('/events', eventRoutes);         // <-- 新增
router.use('/calendar', calendarRoutes);   // <-- 新增
router.use('/', externalRoutes);           // <-- 新增 (例如 /api/drive/thumbnail)

// 【特例處理】匹配: GET /api/contact-list
router.get('/contact-list', contactController.searchContactList);


// 3. API 404 處理
// 如果請求以 /api 開頭，但沒有匹配到任何路由，會在這裡回傳 404
router.use('*', (req, res) => {
    res.status(404).json({ success: false, error: 'API 端點不存在' });
});

module.exports = router;