// services/calendar-service.js - 日曆服務模組
const { google } = require('googleapis');
const config = require('../config');

class CalendarService {
    constructor(authClient) {
        if (!authClient) throw new Error('CalendarService 需要 authClient');
        this.calendar = google.calendar({ version: 'v3', auth: authClient });
        this.config = config;
        this.holidayCalendarId = 'zh-TW.taiwan#holiday@group.v.calendar.google.com';
    }

    /**
     * 建立日曆事件 (支援全天事件)
     * @param {object} eventData - { title, description, startTime, endTime, location, isAllDay }
     */
    async createCalendarEvent(eventData) {
        try {
            console.log(`📅 [CalendarService] 建立日曆事件: ${eventData.title} (全天: ${eventData.isAllDay})`);
            
            const event = {
                summary: eventData.title,
                description: eventData.description || '',
                location: eventData.location || '',
            };

            if (eventData.isAllDay) {
                // 全天事件
                const startDateStr = new Date(eventData.startTime).toLocaleDateString('en-CA', { 
                    timeZone: this.config.TIMEZONE 
                });
                
                const startDate = new Date(eventData.startTime);
                const endDateDate = new Date(startDate);
                endDateDate.setDate(endDateDate.getDate() + 1);
                
                const endDateStr = endDateDate.toLocaleDateString('en-CA', { 
                    timeZone: this.config.TIMEZONE 
                });

                event.start = { date: startDateStr };
                event.end = { date: endDateStr };
            } else {
                // 一般事件
                const startTime = new Date(eventData.startTime);
                let endTime = eventData.endTime ? new Date(eventData.endTime) : null;
                if (!endTime) {
                    const duration = eventData.duration || 60;
                    endTime = new Date(startTime.getTime() + duration * 60000);
                }

                event.start = { dateTime: startTime.toISOString(), timeZone: this.config.TIMEZONE };
                event.end = { dateTime: endTime.toISOString(), timeZone: this.config.TIMEZONE };
            }
    
            const response = await this.calendar.events.insert({
                calendarId: this.config.CALENDAR_ID,
                resource: event,
            });
            
            console.log('✅ [CalendarService] 日曆事件建立成功:', response.data.id);
            return { success: true, eventId: response.data.id, eventUrl: response.data.htmlLink };
        } catch (error) {
            console.error('❌ [CalendarService] 建立Calendar事件失敗:', error.response ? error.response.data.error : error.message);
            throw error;
        }
    }

    async getThisWeekEvents() {
        try {
            const now = new Date();
            const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
            startOfWeek.setHours(0, 0, 0, 0);
            const endOfWeek = new Date(startOfWeek);
            endOfWeek.setDate(endOfWeek.getDate() + 6);
            endOfWeek.setHours(23, 59, 59, 999);
            
            const response = await this.calendar.events.list({
                calendarId: this.config.CALENDAR_ID,
                timeMin: startOfWeek.toISOString(),
                timeMax: endOfWeek.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });
            
            const events = response.data.items || [];
            const today = new Date().toDateString();
            
            const todayEvents = events.filter(event => {
                const eventDate = new Date(event.start.dateTime || event.start.date);
                return eventDate.toDateString() === today;
            });
            
            return {
                todayCount: todayEvents.length,
                weekCount: events.length,
                todayEvents: todayEvents.slice(0, 3),
                allEvents: events
            };
        } catch (error) {
            console.error('❌ [CalendarService] 讀取Calendar事件失敗:', error);
            return { todayCount: 0, weekCount: 0, todayEvents: [], allEvents: [] };
        }
    }

    /**
     * 【修改】取得指定期間的所有日曆事件 (支援指定 calendarId)
     * @param {Date} startDate - 開始時間
     * @param {Date} endDate - 結束時間
     * @param {string} [calendarId] - (可選) 指定要查詢的日曆ID，若未填則使用預設系統日曆
     * @returns {Promise<Array>} - 事件列表
     */
    async getEventsForPeriod(startDate, endDate, calendarId = null) {
        // 決定要使用的 Calendar ID
        const targetCalendarId = calendarId || this.config.CALENDAR_ID;
        
        if (!targetCalendarId) {
            console.warn('⚠️ [CalendarService] 未設定 Calendar ID，跳過查詢。');
            return [];
        }

        try {
            // console.log(`📅 [CalendarService] 查詢日曆事件 (${targetCalendarId}): ${startDate.toISOString()} - ${endDate.toISOString()}`);
            const response = await this.calendar.events.list({
                calendarId: targetCalendarId,
                timeMin: startDate.toISOString(),
                timeMax: endDate.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });
            
            return response.data.items || [];
        } catch (error) {
            // 避免特定日曆錯誤影響整個流程 (例如權限不足或ID錯誤)
            console.warn(`⚠️ [CalendarService] 讀取日曆 (${targetCalendarId}) 失敗:`, error.message);
            return [];
        }
    }

    async getHolidaysForPeriod(startDate, endDate) {
        try {
            console.log(`[CalendarService] 查詢國定假日: ${startDate.toISOString()} - ${endDate.toISOString()}`);
            const response = await this.calendar.events.list({
                calendarId: this.holidayCalendarId,
                timeMin: startDate.toISOString(),
                timeMax: endDate.toISOString(),
                singleEvents: true,
                orderBy: 'startTime',
            });

            const holidays = new Map();
            if (response.data.items) {
                response.data.items.forEach(event => {
                    const holidayDate = event.start.date; 
                    if (holidayDate) {
                        holidays.set(holidayDate, event.summary);
                    }
                });
            }
            return holidays;
        } catch (error) {
            console.error('❌ [CalendarService] 獲取國定假日失敗:', error.message);
            return new Map();
        }
    }
}

module.exports = CalendarService;