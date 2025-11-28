// controllers/line-leads.controller.js
const { handleApiError } = require('../middleware/error.middleware');

// 輔助函式：從 req.app 獲取服務
const getServices = (req) => req.app.get('services');

// GET /api/line/leads
exports.getAllLeads = async (req, res) => {
    try {
        const { contactReader } = getServices(req);
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
        const { contactWriter } = getServices(req);
        const { rowIndex } = req.params;
        const { modifier, ...updateData } = req.body; 

        await contactWriter.updateRawContact(parseInt(rowIndex), updateData, modifier || 'LINE User');
        
        res.json({ success: true, message: '更新成功' });
    } catch (error) {
        handleApiError(res, error, 'Update Lead via LINE');
    }
};