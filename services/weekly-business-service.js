// services/weekly-business-service.js (已優化效能 & 修正：只抓取個人日曆)

/**
 * 專門負責處理與「週間業務」相關的業務邏輯
 */
class WeeklyBusinessService {
    constructor(services) {
        this.weeklyBusinessReader = services.weeklyBusinessReader;
        this.weeklyBusinessWriter = services.weeklyBusinessWriter;
        this.dateHelpers = services.dateHelpers;
        this.calendarService = services.calendarService;
        this.config = services.config; 
    }

    async getWeeklyBusinessSummaryList() {
        const summaryData = await this.weeklyBusinessReader.getWeeklySummary();
        const weeksList = summaryData.map(summary => {
            const weekInfo = this.dateHelpers.getWeekInfo(summary.weekId);
            return {
                id: summary.weekId,
                title: weekInfo.title,
                dateRange: weekInfo.dateRange,
                summaryCount: summary.summaryCount
            };
        });

        if (weeksList.length === 0) {
            const currentWeekId = this.dateHelpers.getWeekId(new Date());
            const currentWeekInfo = this.dateHelpers.getWeekInfo(currentWeekId);
             weeksList.push({
                 id: currentWeekId,
                 title: currentWeekInfo.title,
                 dateRange: currentWeekInfo.dateRange,
                 summaryCount: 0
             });
        }

        return weeksList.sort((a, b) => b.id.localeCompare(a.id)); 
    }

    async getWeeklyDetails(weekId) {
        console.log(`📊 [WeeklyBusinessService] 獲取週次 ${weekId} 的詳細資料...`);
        const weekInfo = this.dateHelpers.getWeekInfo(weekId);
        const entriesForWeek = await this.weeklyBusinessReader.getEntriesForWeek(weekId);
        console.log(`   - 從 Reader 獲取了 ${entriesForWeek.length} 筆 ${weekId} 的紀錄`);

        const firstDay = new Date(weekInfo.days[0].date + 'T00:00:00Z'); 
        const lastDay = new Date(weekInfo.days[weekInfo.days.length - 1].date + 'T00:00:00Z'); 
        const endQueryDate = new Date(lastDay.getTime() + 24 * 60 * 60 * 1000); 

        // --- 【核心修正】只查詢國定假日與個人日曆 ---
        // 移除對 this.config.CALENDAR_ID (系統日曆) 的查詢
        const queries = [
            this.calendarService.getHolidaysForPeriod(firstDay, endQueryDate), // 0: 國定假日
        ];

        // 如果有設定個人日曆，加入查詢
        if (this.config.PERSONAL_CALENDAR_ID) {
            queries.push(
                this.calendarService.getEventsForPeriod(firstDay, endQueryDate, this.config.PERSONAL_CALENDAR_ID)
            );
        }

        const results = await Promise.all(queries);
        const holidays = results[0];
        const personalEvents = results[1] || []; // 個人行程

        // 合併結果 (現在只剩個人行程)
        const allCalendarEvents = [...personalEvents];

        console.log(`   - ${weekId} 查詢到 ${holidays.size} 個假日，${personalEvents.length} 個個人行程`);

        // 整理日曆事件
        const eventsByDay = {};
        allCalendarEvents.forEach(event => {
            const startVal = event.start.dateTime || event.start.date;
            if (!startVal) return;

            const eventDate = new Date(startVal);
            const dateKey = eventDate.toLocaleDateString('en-CA', { timeZone: this.config.TIMEZONE });

            if (!eventsByDay[dateKey]) eventsByDay[dateKey] = [];
            
            const isAllDay = !!event.start.date;
            const timeStr = isAllDay 
                ? '全天' 
                : eventDate.toLocaleTimeString('zh-TW', { 
                    timeZone: this.config.TIMEZONE, 
                    hour: '2-digit', 
                    minute: '2-digit', 
                    hour12: false 
                  });

            eventsByDay[dateKey].push({
                summary: event.summary,
                isAllDay: isAllDay,
                time: timeStr,
                htmlLink: event.htmlLink
            });
        });

        // 排序當日事件
        Object.keys(eventsByDay).forEach(key => {
            eventsByDay[key].sort((a, b) => {
                if (a.isAllDay && !b.isAllDay) return -1;
                if (!a.isAllDay && b.isAllDay) return 1;
                return a.time.localeCompare(b.time);
            });
        });

        weekInfo.days.forEach(day => {
            if (holidays.has(day.date)) {
                day.holidayName = holidays.get(day.date);
            }
            day.calendarEvents = eventsByDay[day.date] || [];
        });

        const weekData = {
            id: weekId,
            ...weekInfo, 
            entries: entriesForWeek 
        };

        return weekData;
    }

    async getWeekOptions() {
        const today = new Date();
        const prevWeek = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);
        const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);

        const allWeeks = await this.getWeeklyBusinessSummaryList();
        const existingWeekIds = new Set(allWeeks.map(w => w.id));

        const options = [
            { id: this.dateHelpers.getWeekId(prevWeek), label: '上一週' },
            { id: this.dateHelpers.getWeekId(today),    label: '本週' },
            { id: this.dateHelpers.getWeekId(nextWeek), label: '下一週' }
        ];

        options.forEach(opt => {
            opt.disabled = existingWeekIds.has(opt.id);
        });

        return options;
    }

    async createWeeklyBusinessEntry(data) {
        const entryDate = new Date(data.date);
        const weekId = this.dateHelpers.getWeekId(entryDate);
        const fullData = { ...data, weekId };
        return this.weeklyBusinessWriter.createWeeklyBusinessEntry(fullData);
    }

    async updateWeeklyBusinessEntry(recordId, data) {
        const entryDate = new Date(data.date);
        const weekId = this.dateHelpers.getWeekId(entryDate);
        const fullData = { ...data, weekId };
        return this.weeklyBusinessWriter.updateWeeklyBusinessEntry(recordId, fullData);
    }
}

module.exports = WeeklyBusinessService;