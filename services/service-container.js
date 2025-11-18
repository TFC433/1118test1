// services/service-container.js (已重構為注入所有模組 + 新增 Drive)

const { google } = require('googleapis'); // 確保引入 google
const AuthService = require('./auth-service');
const WorkflowService = require('./workflow-service');
const CalendarService = require('./calendar-service');

// 從 data/index.js 一次性引入所有資料層模組
const {
    OpportunityReader, ContactReader, CompanyReader, InteractionReader,
    EventLogReader, SystemReader, WeeklyBusinessReader, AnnouncementReader,
    CompanyWriter, ContactWriter, OpportunityWriter, InteractionWriter,
    EventLogWriter, WeeklyBusinessWriter, AnnouncementWriter
} = require('../data');

// 這是應用程式服務的單例容器
const services = {};

/**
 * 初始化所有應用程式服務。這個函式在應用程式啟動時只會執行一次。
 */
async function initializeServices() {
    if (services.isInitialized) {
        return services;
    }

    console.log('🔧 [Service Container] 正在初始化所有服務...');

    // 1. 認證服務 (最底層)
    const authService = new AuthService();
    const authClient = await authService.getOAuthClient(); // 或者 getAuthClient()

    // 2. Google API 實例
    const sheets = google.sheets({ version: 'v4', auth: authClient });
    const calendar = google.calendar({ version: 'v3', auth: authClient });
    const drive = google.drive({ version: 'v3', auth: authClient }); // **新增 Drive Client**

    // 3. 資料讀取層 (Readers) - 將 sheets 實例注入
    const opportunityReader = new OpportunityReader(sheets);
    const contactReader = new ContactReader(sheets);
    const companyReader = new CompanyReader(sheets);
    const interactionReader = new InteractionReader(sheets);
    const eventLogReader = new EventLogReader(sheets);
    const systemReader = new SystemReader(sheets);
    const weeklyBusinessReader = new WeeklyBusinessReader(sheets);
    const announcementReader = new AnnouncementReader(sheets);

    const readers = {
        opportunityReader, contactReader, companyReader, interactionReader,
        eventLogReader, systemReader, weeklyBusinessReader, announcementReader
    };

    // 4. 資料寫入層 (Writers) - 注入 sheets 和對應的 reader
    const companyWriter = new CompanyWriter(sheets, companyReader);
    const contactWriter = new ContactWriter(sheets, contactReader);
    const opportunityWriter = new OpportunityWriter(sheets, opportunityReader, contactReader);
    const interactionWriter = new InteractionWriter(sheets, interactionReader, opportunityReader);
    const eventLogWriter = new EventLogWriter(sheets, eventLogReader, opportunityReader);
    const weeklyBusinessWriter = new WeeklyBusinessWriter(sheets, weeklyBusinessReader);
    const announcementWriter = new AnnouncementWriter(sheets, announcementReader);

    const writers = {
        companyWriter, contactWriter, opportunityWriter, interactionWriter,
        eventLogWriter, weeklyBusinessWriter, announcementWriter
    };

    // 5. 工作流與日曆服務 (注入 writers 和 readers)
    const workflowService = new WorkflowService(writers, readers, sheets);
    const calendarService = new CalendarService(authClient);

    // 6. 將所有服務實例儲存到容器中，以便 app.js 使用
    Object.assign(services, {
        authService,
        sheets,
        calendar,
        drive, // **將 drive client 加入 services**
        ...readers,
        ...writers,
        workflowService,
        calendarService,
        isInitialized: true
    });

    console.log('✅ [Service Container] 所有服務初始化完成！');
    return services;
}

// 匯出一個函式，它回傳一個 Promise，解析後是已初始化的服務容器
module.exports = initializeServices;