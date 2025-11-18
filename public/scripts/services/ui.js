// public/scripts/services/ui.js
// 職責：管理所有全域 UI 元素，如彈窗、通知、面板、載入畫面和共用元件渲染器

let zIndexCounter = 1100; // Start z-index for modals above typical elements
// Global variable to store the callback for the confirm dialog
window.confirmActionCallback = null;

// --- 【*** 修正開始 ***】 ---
// 新增一個全域變數來追蹤當前正在預覽的連結
let currentPreviewDriveLink = null;
// --- 【*** 修正結束 ***】 ---


function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        zIndexCounter++; // Increment z-index for the new modal
        modal.style.zIndex = zIndexCounter; // Apply it
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden'; // Prevent background scrolling
        console.log(`[UI] Modal shown: #${modalId} (z-index: ${zIndexCounter})`);
    } else {
        console.error(`[UI] Error: Modal with ID "${modalId}" not found.`);
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
        console.log(`[UI] Modal closed: #${modalId}`);
        // Check if any *other* modals are still open before restoring scroll
        // Use a more specific selector
        const anyModalOpen = document.querySelector('.modal[style*="display: block"]');
        if (!anyModalOpen) {
            document.body.style.overflow = 'auto'; // Restore background scrolling only if no modals are left
            console.log('[UI] Restored body scroll.');
            // Reset z-index counter when last modal closes? Optional.
            // zIndexCounter = 1100;
        } else {
            console.log('[UI] Body scroll remains hidden as other modals are open.');
        }
    } else {
        console.warn(`[UI] Attempted to close non-existent modal: #${modalId}`);
    }
}

/**
 * 顯示自訂的確認對話框
 * @param {string} message - 要顯示在對話框中的訊息
 * @param {Function} callback - 當使用者點擊確認後要執行的函式
 */
function showConfirmDialog(message, callback) {
    const confirmMessageEl = document.getElementById('confirm-message');
    const confirmDialog = document.getElementById('confirm-dialog'); // Get the dialog itself

    if (confirmMessageEl && confirmDialog) {
        confirmMessageEl.textContent = message;
        window.confirmActionCallback = callback; // Store the callback globally
        showModal('confirm-dialog'); // Use showModal to handle display and z-index
    } else {
        console.warn('[UI] Custom confirm dialog elements not found. Falling back to native confirm.');
        // Fallback to native confirm if custom dialog elements are missing
        if (confirm(message)) {
            // Execute callback immediately if native confirm is used
            if (typeof callback === 'function') {
                callback();
            }
        }
    }
}

/**
 * 執行儲存的回呼函式，由確認按鈕觸發
 */
function executeConfirmAction() {
    // Check if a callback exists and is a function
    if (typeof window.confirmActionCallback === 'function') {
        try {
            window.confirmActionCallback(); // Execute the stored callback
        } catch (error) {
            console.error("[UI] Error executing confirm dialog callback:", error);
            // Optionally show an error notification to the user
            showNotification(`執行確認操作時出錯: ${error.message}`, 'error');
        }
    } else {
        console.warn("[UI] Confirm button clicked, but no callback function was found.");
    }
    closeModal('confirm-dialog'); // Close the dialog regardless of callback execution
    window.confirmActionCallback = null; // Clear the callback to prevent reuse
}


function openPanel(modalId) {
    const panelContainer = document.getElementById('slide-out-panel-container');
    const backdrop = document.getElementById('panel-backdrop');
    const sourceModal = document.getElementById(modalId); // This seems incorrect, should be panel content source?

    if (!panelContainer || !backdrop) { // Removed sourceModal check as it seems wrong context
        console.error('[UI] 開啟 Panel 所需的容器或背景元素不完整。');
        return;
    }

    // How panel content is determined needs clarification. Assuming content is passed directly or fetched.
    // Let's assume a function `getPanelContent(panelId)` exists for this example.
    // const { title, content } = getPanelContent(panelId); // Replace panelId with actual identifier

    // Placeholder content:
    const title = "詳細資訊"; // Placeholder title
    const content = "<p>面板內容應在此處動態載入。</p>"; // Placeholder content


    const panelHTML = `
        <div class="slide-out-panel" id="active-panel">
            <div class="panel-header">
                <h2 class="panel-title">${title}</h2>
                <button class="close-btn" onclick="closePanel()">&times;</button>
            </div>
            <div class="panel-content">
                ${content}
            </div>
        </div>`;

    panelContainer.innerHTML = panelHTML;

    document.body.style.overflow = 'hidden'; // Prevent background scroll

    // Use requestAnimationFrame to ensure elements are in DOM before adding classes for transition
    requestAnimationFrame(() => {
        const panel = document.getElementById('active-panel');
        backdrop.style.display = 'block'; // Make backdrop visible first
        requestAnimationFrame(() => { // Nested for opacity transition
            backdrop.classList.add('is-open');
            if(panel) panel.classList.add('is-open');
        });
    });

    // Close panel when clicking backdrop
    backdrop.onclick = () => closePanel();
    console.log(`[UI] Panel opened.`);
}

function closePanel() {
    const panelContainer = document.getElementById('slide-out-panel-container');
    const panel = document.getElementById('active-panel');
    const backdrop = document.getElementById('panel-backdrop');

    if (panel && backdrop) {
        panel.classList.remove('is-open');
        backdrop.classList.remove('is-open');
        console.log(`[UI] Panel closing...`);

        // Wait for transition to finish before removing content and restoring scroll
        panel.addEventListener('transitionend', () => {
            if (!panel.classList.contains('is-open')) { // Ensure it's the closing transition
                if(panelContainer) panelContainer.innerHTML = ''; // Clear content
                backdrop.style.display = 'none'; // Hide backdrop completely
                // Check if any modals are still open before restoring scroll
                const anyModalOpen = document.querySelector('.modal[style*="display: block"]');
                if (!anyModalOpen) {
                    document.body.style.overflow = 'auto';
                    console.log('[UI] Restored body scroll after panel close.');
                }
                console.log(`[UI] Panel closed completely.`);
            }
        }, { once: true }); // Use {once: true} to automatically remove listener

        // Fallback timeout in case transitionend event doesn't fire reliably
        setTimeout(() => {
            if (panel && !panel.classList.contains('is-open')) { // Double check state
                if(panelContainer) panelContainer.innerHTML = '';
                if(backdrop) backdrop.style.display = 'none';
                const anyModalOpen = document.querySelector('.modal[style*="display: block"]');
                if (!anyModalOpen && document.body.style.overflow !== 'auto') {
                    document.body.style.overflow = 'auto';
                    console.log('[UI] Restored body scroll after panel close (timeout fallback).');
                }
            }
        }, 500); // Duration slightly longer than CSS transition

    } else {
        console.warn('[UI] Cannot close panel: Panel or backdrop element not found.');
        // Force restore scroll if elements are missing but body scroll is locked
        if(document.body.style.overflow === 'hidden'){
            document.body.style.overflow = 'auto';
        }
    }
}


function showLoading(message = '處理中...') {
    const overlay = document.getElementById('loading-overlay');
    const messageEl = document.getElementById('loading-message');
    if (overlay && messageEl) {
        messageEl.textContent = message;
        overlay.style.display = 'flex'; // Use flex to center content
        console.log(`[UI] Loading shown: ${message}`);
    } else {
        console.error("[UI] Loading overlay elements not found.");
    }
}

function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
        console.log(`[UI] Loading hidden.`);
    }
}

function showNotification(message, type = 'info', duration = 3000) {
    const notificationArea = document.getElementById('notification-area');
    const template = document.getElementById('notification-template'); // Get template content
    if (!notificationArea || !template || !template.content) {
        console.error('[UI] Notification area or template not found/invalid.');
        // Fallback to alert if notification system fails
        alert(`${type.toUpperCase()}: ${message}`);
        return;
    }

    // Clone the template content to create a new notification element
    const notification = template.content.cloneNode(true).firstElementChild;
    if (!notification) {
        console.error('[UI] Failed to clone notification template.');
        return;
    }

    const iconMap = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
    const iconSpan = notification.querySelector('.notification-icon');
    const messageSpan = notification.querySelector('.notification-message');
    const closeBtn = notification.querySelector('.notification-close');

    // Apply type class and content
    notification.classList.add(type);
    if (iconSpan) iconSpan.textContent = iconMap[type] || '🔔'; // Fallback icon
    if (messageSpan) messageSpan.textContent = message;

    // Function to remove the notification with animation
    const removeNotification = () => {
        notification.style.animation = 'slideOutRight 0.3s ease forwards';
        // Remove the element after the animation completes
        notification.addEventListener('animationend', () => notification.remove(), { once: true });
        // Fallback removal in case animationend doesn't fire
        setTimeout(() => notification.remove(), 400);
        console.log(`[UI] Notification removed: ${message.substring(0, 30)}...`);
    };

    // Attach close button listener
    if (closeBtn) {
        closeBtn.onclick = removeNotification;
    }

    // Append to the notification area
    notificationArea.appendChild(notification);
    console.log(`[UI] Notification shown: ${type} - ${message.substring(0, 50)}...`);


    // Set timeout for automatic removal
    setTimeout(removeNotification, duration);
}

// Renders pagination controls (ensure loadFnName matches a global function)
function renderPagination(containerId, pagination, loadFnName, filters = {}) {
    const paginationElement = document.getElementById(containerId);
    if (!paginationElement) {
        console.warn(`[UI] Pagination container #${containerId} not found.`);
        return;
    }

    let html = '';
    // Only render controls if there's more than one page
    if (pagination && pagination.total && pagination.total > 1) {
        // Find associated search box based on naming convention
        const searchBoxId = containerId.replace('-pagination', '-search'); // Assumes ID convention
        const searchBox = document.getElementById(searchBoxId);
        // Safely get query value, escaping for JS string literal
        const query = searchBox ? searchBox.value.replace(/'/g, "\\'") : '';
        // Safely stringify filters, escaping for JS string literal
        const filtersJson = JSON.stringify(filters || {}).replace(/'/g, "\\'"); // Ensure filters is object

        // Ensure loadFnName is a valid global function name (basic check)
        const loadFunctionExists = typeof window[loadFnName] === 'function';
        if (!loadFunctionExists) {
            console.error(`[UI] Pagination load function "${loadFnName}" is not defined globally.`);
            paginationElement.innerHTML = '<span style="color:red;">分頁錯誤</span>';
            return;
        }


        // Previous button
        html += `<button class="pagination-btn prev" ${!pagination.hasPrev ? 'disabled' : ''} onclick="${loadFnName}(${pagination.current - 1}, '${query}', ${filtersJson})">‹ 上一頁</button>`;
        // Page info
        html += `<span class="pagination-info">第 ${pagination.current} / ${pagination.total} 頁</span>`;
        // Next button
        html += `<button class="pagination-btn next" ${!pagination.hasNext ? 'disabled' : ''} onclick="${loadFnName}(${pagination.current + 1}, '${query}', ${filtersJson})">下一頁 ›</button>`;
    } else if (pagination && pagination.totalItems !== undefined) {
        // Show total items if only one page or no items
        // html = `<span class="pagination-info">共 ${pagination.totalItems} 筆</span>`;
        html = ''; // Or display nothing if only one page
    }
    paginationElement.innerHTML = html;
}

// --- 【*** 程式碼修改點：新增 SVG 圖示庫 ***】 ---
/**
 * 根據事件類型返回對應的 SVG 圖示字串
 * @param {string} eventType - 事件類型 (e.g., "會議討論")
 * @returns {string} SVG HTML string
 */
function _getTimelineIconSVG(eventType) {
    // 標準 SVG 屬性
    const svgAttrs = 'viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"';
    
    switch (eventType) {
        case '會議討論':
            return `<svg ${svgAttrs}><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>`; // 日曆
        case '電話聯繫':
            return `<svg ${svgAttrs}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"></path></svg>`; // 電話
        case '郵件溝通':
            return `<svg ${svgAttrs}><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>`; // 郵件
        case '事件報告':
            return `<svg ${svgAttrs}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>`; // 文件
        case '系統事件':
            return `<svg ${svgAttrs}><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>`; // 齒輪
        default:
            return `<svg ${svgAttrs}><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path><path d="M13.73 21a2 2 0 0 1-3.46 0"></path></svg>`; // 鈴鐺
    }
}
// --- 【*** SVG 圖示庫結束 ***】 ---


/**
 * 渲染單個互動紀錄時間軸項目的共用函式
 * @param {object} item - 互動紀錄物件
 * @returns {string} HTML 字串
 */
function renderSingleInteractionItem(item) {
    // Basic validation
    if (!item || !item.interactionId) {
        console.warn("[Util] renderSingleInteractionItem called with invalid item:", item);
        return '<div class="timeline-item"><div class="alert alert-error">無法渲染此互動紀錄</div></div>'; // Return an error message
    }

    // --- 【*** 程式碼修改點：讀取系統設定 ***】 ---
    const layoutConfig = window.CRM_APP?.systemConfig?.['時間軸佈局'] || [];
    const layoutMap = new Map(layoutConfig.map(configItem => [configItem.value, configItem.note]));
    
    const eventType = item.eventType || '互動'; // Default type
    
    // 根據 eventType (e.g., "會議討論") 查找 "left" or "right"
    const direction = layoutMap.get(eventType) || 'right'; // 預設靠右
    const layoutClass = direction === 'left' ? 'timeline-item-left' : 'timeline-item-right';
    // --- 【*** 修改結束 ***】 ---


    // --- 【*** 程式碼修改點：改用 SVG 圖示 ***】 ---
    const iconSVG = _getTimelineIconSVG(eventType); // 獲取 SVG 字串
    // --- 【*** 修改結束 ***】 ---


    // Sanitize and linkify summary content
    let summaryHTML = item.contentSummary || '';
    // Basic sanitization (replace potential HTML tags - consider a more robust library if needed)
    summaryHTML = summaryHTML.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    // Linkify event log references
    const linkRegex = /\[(.*?)\]\(event_log_id=([a-zA-Z0-9]+)\)/g; // More specific event ID match
    summaryHTML = summaryHTML.replace(linkRegex, (fullMatch, text, eventId) => {
        // Ensure eventId is somewhat valid before creating link
        if (eventId && eventId.length > 5) {
            // Escape potentially problematic characters in eventId for JS call
            const safeEventId = eventId.replace(/'/g, "\\'").replace(/"/g, '&quot;');
            // Ensure showEventLogReport function exists globally
            const onclickAction = typeof showEventLogReport === 'function'
                ? `showEventLogReport('${safeEventId}')`
                : `alert('查看報告功能無法使用')`;
            return `<a href="#" class="text-link" onclick="event.preventDefault(); ${onclickAction}">${text}</a>`;
        }
        return text; // Return plain text if format is wrong
    });

    // Determine which edit function to call based on context/availability
    // This relies on OpportunityInteractions being globally available when needed
    const safeInteractionId = item.interactionId.replace(/'/g, "\\'").replace(/"/g, '&quot;');
    const editOnClick = (typeof OpportunityInteractions !== 'undefined' && OpportunityInteractions.showForEditing)
        ? `OpportunityInteractions.showForEditing('${safeInteractionId}')`
        : `console.warn('OpportunityInteractions.showForEditing not available in this context')`; // Log warning instead of alert

    // 【新增】準備刪除按鈕的點擊事件
    // 我們需要傳遞 interactionId (用於查找摘要) 和 rowIndex (用於 API 呼叫)
    const deleteOnClick = (typeof OpportunityInteractions !== 'undefined' && OpportunityInteractions.confirmDelete)
        ? `OpportunityInteractions.confirmDelete('${safeInteractionId}', ${item.rowIndex})`
        : `console.warn('OpportunityInteractions.confirmDelete not available in this context')`;

    // Escape other potentially problematic characters in data attributes/text
    const safeTitle = (item.eventTitle || eventType).replace(/"/g, '&quot;');
    const safeNextAction = (item.nextAction || '').replace(/"/g, '&quot;');
    const safeRecorder = (item.recorder || '-').replace(/"/g, '&quot;');

    // --- 【*** 程式碼修改點：在 class 中加入 layoutClass, 並在 header 中插入 SVG ***】 ---
    return `
        <div class="timeline-item ${layoutClass}" data-type="${eventType}">
            <div class="timeline-icon" title="${safeTitle}"></div>
            <div class="timeline-content">
                <div class="interaction-card" id="interaction-${item.interactionId}">
                    <div class="interaction-card-header">
                        ${iconSVG} 
                        <h4 class="interaction-title">${safeTitle}</h4>
                        <span class="interaction-time">${formatDateTime(item.interactionTime)}</span>
                    </div>
                    <div class="interaction-card-body">
                        <p class="interaction-summary">${summaryHTML || '(無摘要)'}</p>
                        ${item.nextAction ? `<div class="interaction-next-action" style="margin-top: 8px;"><strong>下次行動:</strong> ${safeNextAction}</div>` : ''}
                    </div>
                    <div class="interaction-card-footer">
                        <span class="interaction-recorder" title="記錄人">👤 ${safeRecorder}</span>

                        <div class="action-buttons-container" style="display: inline-flex; gap: 4px;">
                            <button class="action-btn small warn" style="padding: 2px 6px; font-size: 0.7rem;" onclick="${editOnClick}" title="編輯此紀錄">✏️</button>
                            <button class="action-btn small danger" style="padding: 2px 6px; font-size: 0.7rem;" onclick="${deleteOnClick}" title="刪除此紀錄">🗑️</button>
                        </div>

                    </div>
                </div>
            </div>
        </div>
    `;
    // --- 【*** 修改結束 ***】 ---
}

// **新增開始：名片預覽相關函式 (已修正為呼叫後端 API)**
/**
 * 顯示名片預覽 Modal (已修正為呼叫後端 API)
 * @param {string} driveLink - Google Drive 的連結
 */
async function showBusinessCardPreview(driveLink) {
    // --- 【*** 修正開始 ***】 ---
    // 1. 設定當前應該顯示的連結
    currentPreviewDriveLink = driveLink;
    // --- 【*** 修正結束 ***】 ---

    const modal = document.getElementById('business-card-preview-modal');
    const contentArea = document.getElementById('business-card-preview-content');
    if (!modal || !contentArea) {
        console.error('找不到名片預覽 modal 或內容區域');
        showNotification('無法開啟預覽視窗', 'error');
        return;
    }

    // 顯示載入中
    contentArea.innerHTML = '<div class="loading show"><div class="spinner"></div><p>載入預覽中...</p></div>';
    showModal('business-card-preview-modal');

    try {
        // 1. 呼叫後端 API 獲取縮圖
        // (authedFetch 函式定義在 public/scripts/services/api.js)
        const result = await authedFetch(`/api/drive/thumbnail?link=${encodeURIComponent(driveLink)}`);
        
        if (result.success && result.thumbnailUrl) {
            // 2. 建立 <img> 標籤來顯示圖片

            // *** 【修改：實作 s1600 -> s800 -> s220 降級邏輯】 ***
            const originalUrl = result.thumbnailUrl; // 原始 URL (e.g., =s220)
            const highResUrl = originalUrl.replace(/=s\d+/g, '=s1600');
            const mediumResUrl = originalUrl.replace(/=s\d+/g, '=s800');

            const img = document.createElement('img');
            img.style.width = '100%';
            img.style.height = 'auto'; // 保持圖片比例
            img.style.borderRadius = '8px';
            img.style.display = 'block'; // 確保正確顯示

            // 最終的失敗處理 (如果連 s220 都失敗)
            const handleFinalError = () => {
                // --- 【*** 修正開始 ***】 ---
                // 在顯示錯誤前，檢查這個請求是否仍然是當前要顯示的
                if (currentPreviewDriveLink !== driveLink) {
                    console.warn('[UI] Stale thumbnail error (s220) ignored.');
                    return; // 忽略這個過期的錯誤
                }
                // --- 【*** 修正結束 ***】 ---
                console.error('[UI] All thumbnail resolutions failed to load (s1600, s800, s220).');
                const safeOriginalLink = driveLink.replace(/"/g, '&quot;');
                contentArea.innerHTML = `<div class="alert alert-error">無法載入名片預覽 (所有解析度均失敗)。<br><a href="${safeOriginalLink}" target="_blank" class="text-link" style="margin-top: 10px; display: inline-block;" onclick="closeBusinessCardPreview()">點此在新分頁開啟</a></div>`;
            };

            // 嘗試 s220 (原始)
            const handleMediumError = () => {
                // --- 【*** 修正開始 ***】 ---
                if (currentPreviewDriveLink !== driveLink) {
                    console.warn('[UI] Stale thumbnail error (s800) ignored.');
                    return; // 忽略這個過期的錯誤
                }
                // --- 【*** 修正結束 ***】 ---
                console.warn(`[UI] Medium-res thumbnail (s800) failed. Falling back to original (s220)...`);
                img.onerror = handleFinalError; // 這是最後一次嘗試
                img.src = originalUrl;
            };

            // 嘗試 s800
            const handleHighResError = () => {
                // --- 【*** 修正開始 ***】 ---
                if (currentPreviewDriveLink !== driveLink) {
                    console.warn('[UI] Stale thumbnail error (s1600) ignored.');
                    return; // 忽略這個過期的錯誤
                }
                // --- 【*** 修正結束 ***】 ---
                console.warn(`[UI] High-res thumbnail (s1600) failed. Falling back to medium-res (s800)...`);
                img.onerror = handleMediumError; // 設置下一階段的錯誤處理
                img.src = mediumResUrl;
            };
            
            // 統一的成功處理
            img.onload = () => {
                // --- 【*** 修正開始 ***】 ---
                // 檢查這個載入成功的圖片是否仍然是使用者想看的
                if (currentPreviewDriveLink === driveLink) {
                    contentArea.innerHTML = ''; // 清除 loading
                    contentArea.appendChild(img);
                    console.log(`[UI] Business card preview loaded successfully (at size: ${img.src.match(/=s(\d+)/)?.[1] || 'original'}).`);
                } else {
                    // 這是一個過期的請求，其圖片已不再需要
                    console.warn(`[UI] Stale business card preview (link: ${driveLink}) loaded but was ignored.`);
                }
                // --- 【*** 修正結束 ***】 ---
            };

            // 1. 啟動鏈式載入：首先嘗試 s1600
            img.onerror = handleHighResError;
            img.src = highResUrl; 
            // *** 【修改結束】 ***

        } else {
            throw new Error(result.error || '無法取得縮圖 URL');
        }
    } catch (error) {
        // --- 【*** 修正開始 ***】 ---
        // 檢查這個 API 錯誤是否對應當前的預覽請求
        if (currentPreviewDriveLink === driveLink) {
            // 3. 任何步驟失敗 (例如 authedFetch 失敗)，都退回「新分頁開啟」的備案
            console.warn("名片預覽失敗 (Catch Block):", error.message);
            const safeOriginalLink = driveLink.replace(/"/g, '&quot;');
            // 增加一個 onclick 來關閉 modal，體驗更好
            contentArea.innerHTML = `<div class="alert alert-error">無法載入名片預覽。<br><a href="${safeOriginalLink}" target="_blank" class="text-link" style="margin-top: 10px; display: inline-block;" onclick="closeBusinessCardPreview()">點此在新分頁開啟</a></div>`;
        } else {
            console.warn(`[UI] Stale business card preview API error ignored for link: ${driveLink}`);
        }
        // --- 【*** 修正結束 ***】 ---
    }
}

/**
 * 關閉名片預覽 Modal 並清除 iframe 內容
 */
function closeBusinessCardPreview() {
    // --- 【*** 修正開始 ***】 ---
    // 關閉 Modal 時，重設當前連結
    currentPreviewDriveLink = null;
    // --- 【*** 修正結束 ***】 ---

    const contentArea = document.getElementById('business-card-preview-content');
    const iframe = document.getElementById('business-card-iframe');
    if (iframe) {
        iframe.src = 'about:blank'; // 清除內容，停止載入
        iframe.remove(); // 從 DOM 中移除 iframe
    }
    // 【修改】同時清除可能存在的 img
    const img = contentArea ? contentArea.querySelector('img') : null;
    if (img) {
        img.remove();
    }
    
    if(contentArea) {
        contentArea.innerHTML = '<div class="loading show"><div class="spinner"></div></div>'; // 重置為載入中狀態
    }
    closeModal('business-card-preview-modal');
}
// **新增結束：名片預覽相關函式**