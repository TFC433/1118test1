// services/event-log-service.js

/**
 * 專門負責處理與「事件紀錄」相關的業務邏輯
 */
class EventLogService {
    /**
     * @param {object} services - 包含所有已初始化服務的容器
     */
    constructor(services) {
        this.eventLogWriter = services.eventLogWriter;
        this.interactionWriter = services.interactionWriter; 
        this.eventLogReader = services.eventLogReader;
    }

    /**
     * 建立一筆事件紀錄，並自動產生對應的互動紀錄
     * @param {object} eventData 
     * @returns {Promise<object>}
     */
    async createEventLog(eventData) {
        // 直接將收到的 eventData 傳遞給 writer，writer 內部會處理不同類型的邏輯
        const result = await this.eventLogWriter.createEventLog(eventData);
        if (!result.success) {
            throw new Error("建立事件紀錄失敗");
        }

        // 建立事件成功後，自動產生一筆對應的互動紀錄
        try {
            console.log('📝 [EventLogService] 自動建立關聯的互動紀錄...');
            const interactionData = {
                opportunityId: eventData.opportunityId,
                companyId: eventData.companyId,
                interactionTime: result.createdTime,
                eventType: '事件報告',
                eventTitle: eventData.eventName || '建立事件紀錄報告',
                contentSummary: `已建立事件報告: "${eventData.eventName}". [點此查看報告](event_log_id=${result.eventId})`,
                recorder: eventData.creator,
                participants: `${eventData.ourParticipants || ''} (我方), ${eventData.clientParticipants || ''} (客戶方)`
            };
            await this.interactionWriter.createInteraction(interactionData);
            console.log('✅ [EventLogService] 已成功建立關聯的互動紀錄');
        } catch (interactionError) {
            console.warn('⚠️ [EventLogService] 建立關聯的互動紀錄失敗:', interactionError);
            // 即使這裡失敗，主流程也算成功，只記錄警告
        }
        
        return result;
    }

    /**
     * 更新一筆事件紀錄，並自動產生對應的互動紀錄
     * @param {string} eventId 
     * @param {object} eventData 
     * @param {string} modifier 
     * @returns {Promise<object>}
     */
    async updateEventLog(eventId, eventData, modifier) {
        // 直接將 eventData 傳遞給 writer
        const result = await this.eventLogWriter.updateEventLog(eventId, eventData, modifier);
        if (!result.success) {
            throw new Error("更新事件紀錄失敗");
        }

        // 更新成功後，也產生一筆互動紀錄
        try {
            // 從 reader 獲取更新後的完整事件資料，以確保 opportunityId 和 companyId 正確
            const eventLog = await this.eventLogReader.getEventLogById(eventId);
            if (eventLog) {
                console.log('📝 [EventLogService] 自動建立事件更新的互動紀錄...');
                const interactionData = {
                    opportunityId: eventLog.opportunityId,
                    companyId: eventLog.companyId,
                    eventType: '系統事件',
                    eventTitle: '更新事件報告',
                    contentSummary: `更新了事件報告: "${eventData.eventName || eventLog.eventName}". [點此查看報告](event_log_id=${eventId})`,
                    recorder: modifier,
                };
                await this.interactionWriter.createInteraction(interactionData);
                console.log('✅ [EventLogService] 已成功建立事件更新的互動紀錄');
            }
        } catch (interactionError) {
            console.warn('⚠️ [EventLogService] 建立事件更新的互動紀錄失敗:', interactionError);
        }
        
        return result;
    }

    /**
     * 【新增】刪除一筆事件紀錄，並自動產生對應的互動紀錄
     * @param {string} eventId 
     * @param {string} modifier 
     * @returns {Promise<object>}
     */
    async deleteEventLog(eventId, modifier) {
        // 1. 先獲取事件資料，以便刪除後還能記錄
        const eventLog = await this.eventLogReader.getEventLogById(eventId);
        if (!eventLog) {
            throw new Error(`刪除失敗：找不到 Event ID ${eventId}`);
        }
        
        // 2. 執行刪除
        const result = await this.eventLogWriter.deleteEventLog(eventId, modifier);
        if (!result.success) {
            throw new Error("刪除事件紀錄失敗");
        }

        // 3. 刪除成功後，產生一筆互動紀錄
        try {
            console.log('📝 [EventLogService] 自動建立事件刪除的互動紀錄...');
            const interactionData = {
                opportunityId: eventLog.opportunityId,
                companyId: eventLog.companyId,
                eventType: '系統事件',
                eventTitle: '刪除事件報告',
                contentSummary: `事件報告 "${eventLog.eventName}" 已被 ${modifier} 刪除。`,
                recorder: modifier,
            };
            await this.interactionWriter.createInteraction(interactionData);
            console.log('✅ [EventLogService] 已成功建立事件刪除的互動紀錄');
        } catch (interactionError) {
            console.warn('⚠️ [EventLogService] 建立事件刪除的互動紀錄失敗:', interactionError);
        }
        
        return result;
    }
}

module.exports = EventLogService;