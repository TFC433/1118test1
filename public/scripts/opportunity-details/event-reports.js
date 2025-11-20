// views/scripts/opportunity-details/event-reports.js
// 職責：專門管理「事件報告」頁籤的 UI 與功能，包含總覽模式
// (V2 - 修正總覽模式下的職稱顯示：注入聯絡人清單以支援智慧補完)

const OpportunityEvents = (() => {
    // 模組私有變數
    let _eventLogs = [];
    let _context = {}; // 通用的 context 物件

    // 動態注入樣式 (保持不變，確保 10% 偏移排版)
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

            /* 左側內縮 10% (保持您要求的排版) */
            #tab-content-events [id^="event-logs-overview-view-"] .report-container,
            #tab-content-company-events [id^="event-logs-overview-view-"] .report-container {
                padding-left: 10%; 
                padding-right: 0; 
            }
        `;
        document.head.appendChild(style);
    }

    // 渲染主視圖（列表模式） - 保持不變
    function _render() {
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
            const opportunityName = _context.opportunityName ? _context.opportunityName.replace(/'/g, "\\'") : '';
            showEventLogModalByOpp(_context.opportunityId, opportunityName);
        } else if (_context.companyId) {
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
                
                // 【*** 關鍵修改 ***】
                // 為了讓總覽模式也能顯示職稱，我們需要先去後端撈取該機會/公司的聯絡人清單
                let contextContacts = [];
                try {
                    if (_context.opportunityId) {
                        // 如果在機會頁面，撈機會的聯絡人
                        const res = await authedFetch(`/api/opportunities/${_context.opportunityId}/details`);
                        if (res.success && res.data) contextContacts = res.data.linkedContacts || [];
                    } else if (_context.companyName) { 
                        // 如果在公司頁面，撈公司的聯絡人
                        const res = await authedFetch(`/api/companies/${encodeURIComponent(_context.companyName)}/details`);
                        if (res.success && res.data) contextContacts = res.data.contacts || [];
                    }
                } catch (e) {
                    console.warn("[OpportunityEvents] 無法獲取關聯聯絡人 (職稱自動補完將失效)", e);
                }
                // 【*** 修改結束 ***】

                if (_eventLogs.length > 0) {
                    const allReportsHtml = _eventLogs.map(log => {
                        const logWithContext = { ...log };
                        
                        // 補上可能缺失的名稱 (雖不影響職稱，但為完整性保留)
                        if (_context.opportunityId) {
                            if (logWithContext.opportunityId === _context.opportunityId && !logWithContext.opportunityName) {
                                logWithContext.opportunityName = _context.opportunityName;
                            }
                        } else if (_context.companyId) {
                            if (logWithContext.companyId === _context.companyId && !logWithContext.companyName) {
                                logWithContext.companyName = _context.companyName;
                            }
                        }
                        
                        // 【*** 關鍵修改：將撈到的 contextContacts 傳進去 ***】
                        // renderEventLogReportHTML 會利用這份清單去比對名字，自動補上 (職稱)
                        return renderEventLogReportHTML(logWithContext, contextContacts);
                    }).join('');
                    
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
        _context = { 
            ...context, 
            id: context.opportunityId || context.companyId 
        };
        _injectStyles();
        _render();
    }

    return {
        init,
        toggleOverview,
        showAddEventModal
    };
})();