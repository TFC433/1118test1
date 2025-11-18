// views/scripts/announcements.js

/**
 * 載入並渲染佈告欄管理頁面的主函式
 */
async function loadAnnouncementsPage() {
    const container = document.getElementById('page-announcements');
    if (!container) return;

    container.innerHTML = `
        <div class="dashboard-widget">
            <div class="widget-header">
                <h2 class="widget-title">佈告欄管理</h2>
                <button class="action-btn primary" onclick="showAnnouncementModal()">＋ 新增公告</button>
            </div>
            <div id="announcements-list-content" class="widget-content">
                <div class="loading show"><div class="spinner"></div><p>載入公告列表中...</p></div>
            </div>
        </div>
    `;

    try {
        const result = await authedFetch('/api/announcements');
        if (!result.success) throw new Error(result.error);
        renderAnnouncementsList(result.data || []);
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            document.getElementById('announcements-list-content').innerHTML = `<div class="alert alert-error">載入公告列表失敗: ${error.message}</div>`;
        }
    }
}

/**
 * 渲染公告列表
 * @param {Array<object>} announcements - 公告資料陣列
 */
function renderAnnouncementsList(announcements) {
    const container = document.getElementById('announcements-list-content');
    if (announcements.length === 0) {
        container.innerHTML = '<div class="alert alert-info" style="text-align:center;">目前沒有任何公告</div>';
        return;
    }

    let tableHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>標題</th>
                    <th>建立者</th>
                    <th>最後更新</th>
                    <th>狀態</th>
                    <th>操作</th>
                </tr>
            </thead>
            <tbody>
    `;

    announcements.forEach(item => {
        const isPinnedIcon = item.isPinned ? '📌' : '';
        tableHTML += `
            <tr>
                <td data-label="標題"><strong>${isPinnedIcon} ${item.title}</strong></td>
                <td data-label="建立者">${item.creator}</td>
                <td data-label="最後更新">${formatDateTime(item.lastUpdateTime)}</td>
                <td data-label="狀態"><span class="card-tag ${item.status === '已發布' ? 'type' : 'assignee'}">${item.status}</span></td>
                <td data-label="操作">
                    <div class="action-buttons-container">
                        <button class="action-btn small warn" onclick='showAnnouncementModal(${JSON.stringify(item)})'>✏️ 編輯</button>
                        <button class="action-btn small danger" onclick="confirmDeleteAnnouncement('${item.id}', '${item.title.replace(/'/g, "\\'")}')">🗑️ 刪除</button>
                    </div>
                </td>
            </tr>
        `;
    });

    tableHTML += '</tbody></table>';
    container.innerHTML = tableHTML;
}

/**
 * 顯示新增或編輯公告的 Modal
 * @param {object|null} item - (可選) 要編輯的公告物件
 */
function showAnnouncementModal(item = null) {
    const isEditMode = item !== null;
    document.getElementById('announcement-form').reset();
    
    // --- 新增程式碼開始 ---
    // 1. 讀取系統設定
    const systemConfig = window.CRM_APP?.systemConfig || {};
    const configItems = systemConfig['佈告欄設定'] || [];
    
    // 尋找「輸入框行數」，若找不到預設為 8
    const rowConfig = configItems.find(i => i.value === '輸入框行數');
    const rowsCount = rowConfig ? (parseInt(rowConfig.note) || 8) : 8;

    // 2. 設定 textarea 的 rows 和 height
    const contentTextarea = document.getElementById('announcement-content');
    if (contentTextarea) {
        contentTextarea.rows = rowsCount;
        // 強制覆蓋全域 CSS 的高度限制，確保 rows 屬性生效
        contentTextarea.style.height = 'auto'; 
    }
    // --- 新增程式碼結束 ---

    document.getElementById('announcement-modal-title').textContent = isEditMode ? '編輯公告' : '新增公告';
    document.getElementById('announcement-id').value = isEditMode ? item.id : '';
    document.getElementById('announcement-title').value = isEditMode ? item.title : '';
    document.getElementById('announcement-content').value = isEditMode ? item.content : '';
    document.getElementById('announcement-status').value = isEditMode ? item.status : '已發布';
    document.getElementById('announcement-is-pinned').checked = isEditMode ? item.isPinned : false;
    
    showModal('announcement-modal');
}

/**
 * 處理公告表單提交
 * @param {Event} event - 表單提交事件
 */
async function handleAnnouncementFormSubmit(event) {
    event.preventDefault();
    const id = document.getElementById('announcement-id').value;
    const isEditMode = !!id;

    const data = {
        title: document.getElementById('announcement-title').value,
        content: document.getElementById('announcement-content').value,
        status: document.getElementById('announcement-status').value,
        isPinned: document.getElementById('announcement-is-pinned').checked
    };

    showLoading(isEditMode ? '正在更新...' : '正在新增...');
    try {
        const url = isEditMode ? `/api/announcements/${id}` : '/api/announcements';
        const method = isEditMode ? 'PUT' : 'POST';
        
        const result = await authedFetch(url, { method, body: JSON.stringify(data) });
        if (!result.success) throw new Error(result.error);
        
        closeModal('announcement-modal');
        
        // 【*** 移除衝突 ***】
        // 下方的 showNotification 和刷新邏輯 (loadAnnouncementsPage, forceRefresh)
        // 已由 authedFetch 自動處理，故移除。
        // showNotification(isEditMode ? '公告更新成功！' : '公告新增成功！', 'success');
        // CRM_APP.pageConfig.announcements.loaded = false;
        // await loadAnnouncementsPage();
        // await dashboardManager.forceRefresh();
        // 【*** 移除結束 ***】

    } catch (error) {
        if (error.message !== 'Unauthorized') showNotification(`操作失敗: ${error.message}`, 'error');
    } finally {
        hideLoading();
    }
}

/**
 * 顯示刪除確認對話框
 * @param {string} id - 公告ID
 * @param {string} title - 公告標題
 */
function confirmDeleteAnnouncement(id, title) {
    showConfirmDialog(`您確定要刪除公告 "${title}" 嗎？此操作無法復原。`, async () => {
        showLoading('正在刪除...');
        try {
            const result = await authedFetch(`/api/announcements/${id}`, { method: 'DELETE' });
            if (!result.success) throw new Error(result.error);
            
            // 【*** 移除衝突 ***】
            // 下方的 showNotification 和刷新邏輯 (loadAnnouncementsPage, forceRefresh)
            // 已由 authedFetch 自動處理，故移除。
            // showNotification('公告已刪除', 'success');
            // CRM_APP.pageConfig.announcements.loaded = false;
            // await loadAnnouncementsPage();
            // await dashboardManager.forceRefresh();
            // 【*** 移除結束 ***】
            
        } catch (error) {
            if (error.message !== 'Unauthorized') showNotification(`刪除失敗: ${error.message}`, 'error');
        } finally {
            hideLoading();
        }
    });
}

// 在頁面載入時綁定表單提交事件
document.addEventListener('DOMContentLoaded', () => {
    // 使用 document 監聽，確保 modal 被動態載入後也能捕捉到
    document.addEventListener('submit', (event) => {
        if (event.target.id === 'announcement-form') {
            handleAnnouncementFormSubmit(event);
        }
    });
});

// 【修正】向主應用程式註冊此模組的載入函式
if (window.CRM_APP) {
    window.CRM_APP.pageModules.announcements = loadAnnouncementsPage;
}