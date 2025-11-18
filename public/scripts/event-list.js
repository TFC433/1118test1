// views/scripts/event-list.js
// 職責：專門負責渲染「事件紀錄」頁面的主列表

/**
 * 渲染事件紀錄明細的表格
 * @param {HTMLElement} container - 要渲染列表的容器元素
 * @param {Array<object>} eventList - 從 API 獲取的、已排序且包含關聯名稱的事件列表數據
 */
function renderEventLogList(container, eventList) {
    if (!container) return;

    // 注入 CSS 樣式來控制欄寬和文字截斷
    const styleId = 'event-list-table-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .event-log-list-table .col-event-name,
            .event-log-list-table .col-linked-entity {
                max-width: 300px; 
            }

            .event-log-list-table td {
                white-space: nowrap;
                overflow: hidden;
                text-overflow: ellipsis;
            }
            
            .event-log-list-table .col-actions {
                min-width: 100px; 
                overflow: visible;
            }
        `;
        document.head.appendChild(style);
    }


    let listHtml = `
        <div class="dashboard-widget" style="margin-top: 24px;">
            <div class="widget-header">
                <h2 class="widget-title">事件紀錄明細</h2>
                <button class="action-btn primary" onclick="showEventLogForCreation()">📝 新增事件紀錄</button>
            </div>
            <div class="widget-content">
                <table class="data-table event-log-list-table">
                    <thead>
                        <tr>
                            <th>最後更新時間</th>
                            <th>事件名稱</th>
                            <th>關聯對象</th>
                            <th>事件類型</th>
                            <th>建立者</th>
                            <th>操作</th>
                        </tr>
                    </thead>
                    <tbody>`;
    
    if (!eventList || eventList.length === 0) {
        listHtml += '<tr><td colspan="6" style="text-align: center; padding: 20px;">尚無任何事件紀錄</td></tr>';
    } else {
        const eventTypeConfig = new Map((window.CRM_APP?.systemConfig['事件類型'] || []).map(t => [t.value, { note: t.note, color: t.color }]));

        eventList.forEach(event => {
            const oppTypeConfig = (window.CRM_APP?.systemConfig['機會種類'] || []).find(t => t.value === event.opportunityType);
            const rowColor = oppTypeConfig?.color || 'transparent';
            
            // --- 修正開始：建立可點擊的關聯連結 ---
            const linkedEntityName = event.opportunityName || event.companyName || event.opportunityId || event.companyId || '未關聯';
            
            let linkedEntityHTML = linkedEntityName; // 預設為純文字
            if (event.opportunityId) {
                // 連結至機會
                linkedEntityHTML = `<a href="#" class="text-link" onclick="event.preventDefault(); CRM_APP.navigateTo('opportunity-details', { opportunityId: '${event.opportunityId}' })">
                                        ${event.opportunityName || event.opportunityId}
                                    </a>`;
            } else if (event.companyId) {
                // 連結至公司
                const companyName = event.companyName || event.companyId;
                const encodedCompanyName = encodeURIComponent(companyName);
                linkedEntityHTML = `<a href="#" class="text-link" onclick="event.preventDefault(); CRM_APP.navigateTo('company-details', { companyName: '${encodedCompanyName}' })">
                                        ${companyName} (公司)
                                    </a>`;
            }
            // --- 修正結束 ---
            
            const typeInfo = eventTypeConfig.get(event.eventType) || { note: (event.eventType || 'unknown').toUpperCase(), color: '#6c757d' };
            const eventTypeLabel = typeInfo.note;
            const tagStyle = `background-color: ${typeInfo.color}; color: white;`;

            const displayTime = event.lastModifiedTime || event.createdTime;

            listHtml += `
                <tr style="--card-brand-color: ${rowColor};">
                    <td data-label="最後更新時間">${formatDateTime(displayTime)}</td>
                    <td data-label="事件名稱" class="col-event-name" title="${event.eventName || '(未命名)'}"><strong>${event.eventName || '(未命名)'}</strong></td>
                    <td data-label="關聯對象" class="col-linked-entity" title="${linkedEntityName}">${linkedEntityHTML}</td>
                    <td data-label="事件類型"><span class="card-tag" style="${tagStyle}">${eventTypeLabel}</span></td>
                    <td data-label="建立者">${event.creator}</td>
                    <td data-label="操作" class="col-actions">
                        <button class="action-btn small info" onclick="showEventLogReport('${event.eventId}')">📄 查看報告</button>
                    </td>
                </tr>`;
        });
    }
    
    listHtml += '</tbody></table></div></div>';
    container.innerHTML = listHtml;
}