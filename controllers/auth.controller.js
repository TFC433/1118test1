// controllers/auth.controller.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const { handleApiError } = require('../middleware/error.middleware');

exports.login = async (req, res) => {
    try {
        // 從 req.app 取得服務 (這是在 app.js 中 app.set 注入的)
        const { systemReader } = req.app.get('services');
        const { username, password } = req.body;

        if (!username || !password) {
            return res.status(400).json({ success: false, message: '請輸入帳號和密碼' });
        }

        const allUsers = await systemReader.getUsers();
        const user = allUsers.find(u => u.username.toLowerCase() === username.toLowerCase());

        if (!user || !bcrypt.compareSync(password, user.passwordHash)) {
            return res.status(401).json({ success: false, message: '帳號或密碼錯誤' });
        }

        const token = jwt.sign(
            { username: user.username, name: user.displayName }, 
            config.AUTH.JWT_SECRET, 
            { expiresIn: config.AUTH.JWT_EXPIRES_IN }
        );

        res.json({ success: true, token, name: user.displayName });

    } catch (error) {
        handleApiError(res, error, 'Login');
    }
};