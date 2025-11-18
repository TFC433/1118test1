// views/scripts/opportunity-details/event-reports.js
// 職責：專門管理「事件報告」頁籤的 UI 與功能，包含總覽模式

const OpportunityEvents = (() => {
    // 模組私有變數
    let _eventLogs = [];
    let _context = {}; // 改為通用的 context 物件

    // 動態注入樣式
    function _injectStyles() {
        const styleId = 'event-reports-dynamic-styles';
        if (document.getElementById(styleId)) return;
        
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            /* 總覽模式下，為每份報告加上卡片樣式 */
            #event-logs-overview-view .report-view, #company-event-logs-overview-view .report-view {
                margin-bottom: var(--spacing-6);
                border-radius: var(--rounded-xl);
                border: 1px solid var(--border-color);
                box-shadow: var(--shadow-md);
                overflow: hidden;
            }

            /* 【修正】使用正確的父層 ID 和屬性選擇器來選取動態 ID */
            #tab-content-events [id^="event-logs-overview-view-"] .report-container,
            #tab-content-company-events [id^="event-logs-overview-view-"] .report-container {
                padding-left: 10%;  /* 【修改】左側內縮 10% */
                padding-right: 0; /* 【修改】右側不內縮 */
            }
        `;
        document.head.appendChild(style);
    }

    // 渲染主視圖（列表模式）
    function _render() {
        // 根據 context 決定渲染到哪個容器
        const container = _context.opportunityId 
            ? document.getElementById('tab-content-events') 
            : document.getElementById('tab-content-company-events');

        if (!container) return;

        const headerHtml = `
            <div class="widget-header">
                <h2 class="widget-title">相關事件報告</h2>
                <div style="display: flex; gap: 10px;">
                    ${_eventLogs.length > 0 ? `
                    <button id="toggle-overview-btn-${_context.id}" class="action-btn small secondary" 
                            onclick="OpportunityEvents.toggleOverview(true, '${_context.id}')">
                        總覽模式
                    </button>` : ''}
                    <button class="action-btn small primary" 
                            onclick="OpportunityEvents.showAddEventModal()">
                        📝 新增事件
                    </button>
                </div>
            </div>
        `;
        
        let listHtml = '';
        if (_eventLogs.length === 0) {
            listHtml = '<div class="alert alert-info">此處尚無相關的事件報告</div>';
        } else {
            listHtml = `<table class="data-table"><thead><tr><th>建立時間</th><th>事件名稱</th><th>建立者</th><th>操作</th></tr></thead><tbody>`;
            _eventLogs.forEach(log => {
                listHtml += `
                    <tr>
                        <td data-label="建立時間">${formatDateTime(log.createdTime)}</td>
                        <td data-label="事件名稱">${log.eventName}</td>
                        <td data-label="建立者">${log.creator}</td>
                        <td data-label="操作"><button class="action-btn small info" onclick="showEventLogReport('${log.eventId}')">📄 查看報告</button></td>
                    </tr>
                `;
            });
            listHtml += '</tbody></table>';
        }

        container.innerHTML = `
            <div class="dashboard-widget">
                ${headerHtml}
                <div class="widget-content">
                    <div id="event-logs-list-view-${_context.id}">${listHtml}</div>
                    <div id="event-logs-overview-view-${_context.id}" style="display: none;"></div>
                </div>
            </div>
        `;
    }

    // --- 公開方法 ---
    
    function showAddEventModal() {
        if (_context.opportunityId) {
            // 【*** 修正：從 _context 獲取名稱 ***】
            const opportunityName = _context.opportunityName ? _context.opportunityName.replace(/'/g, "\\'") : '';
            showEventLogModalByOpp(_context.opportunityId, opportunityName);
        } else if (_context.companyId) {
             // 【*** 修正：從 _context 獲取名稱 ***】
             // 呼叫 showEventLogFormModal 並傳入公司情境
             showEventLogFormModal({ 
                companyId: _context.companyId, 
                companyName: _context.companyName 
            });
        }
    }

    // 切換列表模式與總覽模式
    async function toggleOverview(showOverview, contextId) {
        const listView = document.getElementById(`event-logs-list-view-${contextId}`);
        const overviewView = document.getElementById(`event-logs-overview-view-${contextId}`);
        const toggleBtn = document.getElementById(`toggle-overview-btn-${contextId}`);

        if (showOverview) {
            listView.style.display = 'none';
            overviewView.style.display = 'block';
            overviewView.innerHTML = '<div class="loading show"><div class="spinner"></div><p>載入報告總覽中...</p></div>';
            
            toggleBtn.textContent = '返回列表';
            toggleBtn.setAttribute('onclick', `OpportunityEvents.toggleOverview(false, '${contextId}')`);

            if (typeof renderEventLogReportHTML === 'function') {
                if (_eventLogs.length > 0) {
                    
                    // --- 【*** 核心修正：在此處注入缺少的名稱 ***】 ---
                    const allReportsHtml = _eventLogs.map(log => {
                        // 建立一個日誌物件的淺層複製
                        const logWithContext = { ...log };
                        
                        // 檢查是否為機會情境
                        if (_context.opportunityId) {
                            // 如果日誌的機會ID與當前頁面ID相符，且日誌本身沒有名稱
                            if (logWithContext.opportunityId === _context.opportunityId && !logWithContext.opportunityName) {
                                // 從 _context 注入機會名稱
                                logWithContext.opportunityName = _context.opportunityName;
                            }
                        } 
                        // 檢查是否為公司情境
                        else if (_context.companyId) {
                             // 如果日誌的公司ID與當前頁面ID相符，且日誌本身沒有名稱
                            if (logWithContext.companyId === _context.companyId && !logWithContext.companyName) {
                                // 從 _context 注入公司名稱
                                logWithContext.companyName = _context.companyName;
                            }
                        }
                        
                        // 使用補充完畢的 log 物件去渲染
                        return renderEventLogReportHTML(logWithContext);
                    }).join('');
                    // --- 【*** 修正結束 ***】 ---
                    
                    overviewView.innerHTML = allReportsHtml;
                } else {
                    overviewView.innerHTML = '<div class="alert alert-info">此處尚無相關的事件報告</div>';
                }
            } else {
                overviewView.innerHTML = '<div class="alert alert-error">報告渲染功能載入失敗</div>';
            }

        } else {
            listView.style.display = 'block';
            overviewView.style.display = 'none';
            toggleBtn.textContent = '總覽模式';
            toggleBtn.setAttribute('onclick', `OpportunityEvents.toggleOverview(true, '${contextId}')`);
        }
    }

    // 初始化模組
    function init(eventLogs, context) {
        _eventLogs = eventLogs;
        
        // 【*** 修正：確保 context 包含所有需要的資訊 ***】
        // 建立一個唯一的 context ID 以區分不同頁面的元件實例
        // context 物件現在會包含 { opportunityId, opportunityName } 或 { companyId, companyName }
        _context = { 
            ...context, 
            id: context.opportunityId || context.companyId 
        };
        
        _injectStyles();
        _render();
    }

    // 返回公開的 API
    return {
        init,
        toggleOverview,
        showAddEventModal
    };
})();