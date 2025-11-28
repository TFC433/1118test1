// routes/index.js (修正版：開放預覽圖片 API 權限)
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
const eventRoutes = require('./event.routes');         
const calendarRoutes = require('./calendar.routes');   
const externalRoutes = require('./external.routes');   
const lineLeadsRoutes = require('./line-leads.routes'); 

// --- 引入特例 Controller ---
const contactController = require('../controllers/contact.controller'); 

// --- 掛載路由 ---

// ==========================================
// 1. 公開路由 (不需要 Token 驗證)
// ==========================================

// 登入相關
router.use('/auth', authRoutes);

// LINE LIFF 專用 (名片牆)
router.use('/line', lineLeadsRoutes); 

// 【修正重點】將 External Routes (包含 /drive/thumbnail) 移到這裡
// 這樣 leads-view.html 才能在不登入 CRM 的情況下預覽圖片
router.use('/', externalRoutes);


// ==========================================
// 2. 受保護的路由 (所有在此之後的路由都需要 Token 驗證)
// ==========================================
router.use(authMiddleware.verifyToken); // <-- 驗證閘門

// 掛載所有需要保護的模組
router.use('/opportunities', opportunityRoutes);
router.use('/', systemRoutes);
router.use('/announcements', announcementRoutes);
router.use('/contacts', contactRoutes);
router.use('/companies', companyRoutes);
router.use('/interactions', interactionRoutes);
router.use('/business/weekly', weeklyRoutes);
router.use('/sales-analysis', salesRoutes);
router.use('/events', eventRoutes);         
router.use('/calendar', calendarRoutes);   
// router.use('/', externalRoutes); // <--- 原本在這裡，已移到上面


// 【特例處理】匹配: GET /api/contact-list
router.get('/contact-list', contactController.searchContactList);


// 3. API 404 處理
router.use('*', (req, res) => {
    res.status(404).json({ success: false, error: 'API 端點不存在' });
});

module.exports = router;