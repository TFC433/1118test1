// views/scripts/contacts.js

// ==================== 全域變數 ====================
let selectedContactForUpgrade = null;
let allContactsData = []; // 【新增】全域變數，用於儲存所有聯絡人資料

// ==================== 主要功能函式 ====================

async function loadContacts(query = '') {
    const container = document.getElementById('page-contacts');
    if (!container) return;

    container.innerHTML = `
        <div id="contacts-dashboard-container" class="dashboard-grid-flexible" style="margin-bottom: 24px;">
            <div class="loading show" style="grid-column: span 12;"><div class="spinner"></div></div>
        </div>
        <div class="dashboard-widget">
            <div class="widget-header"><h2 class="widget-title">潛在客戶列表</h2></div>
            <div class="search-pagination" style="padding: 0 1.5rem; margin-bottom: 1rem;">
                <input type="text" class="search-box" id="contacts-page-search" placeholder="搜尋姓名或公司..." onkeyup="searchContactsEvent(event)" value="${query}">
            </div>
            <div id="contacts-page-content">
                <div class="loading show"><div class="spinner"></div><p>載入潛在客戶資料中...</p></div>
            </div>
        </div>
    `;

    // Ensure search event listener is attached after rendering
    const searchInput = document.getElementById('contacts-page-search');
    if (searchInput) {
        searchInput.removeEventListener('keyup', searchContactsEvent); // Remove potential duplicates
        searchInput.addEventListener('keyup', searchContactsEvent);
    }

    try {
        // 【修改】只在 allContactsData 為空時才從 API 獲取資料
        if (allContactsData.length === 0) {
            console.log('[Contacts] 首次載入，正在獲取所有潛在客戶資料...');
            const [dashboardResult, listResult] = await Promise.all([
                authedFetch(`/api/contacts/dashboard`),
                authedFetch(`/api/contacts?q=`) // 【修改】使用空查詢獲取所有資料
            ]);

            if (dashboardResult.success && dashboardResult.data && dashboardResult.data.chartData) {
                renderContactsDashboard(dashboardResult.data.chartData);
            } else {
                console.warn('[Contacts] 無法獲取圖表資料:', dashboardResult.error || '未知錯誤');
                const dashboardContainer = document.getElementById('contacts-dashboard-container');
                 if(dashboardContainer) dashboardContainer.innerHTML = `<div class="alert alert-error" style="grid-column: span 12;">圖表資料載入失敗</div>`;
            }

            // 【修改】將獲取到的資料存入全域變數
            allContactsData = listResult.data || [];
        } else {
            console.log('[Contacts] 使用已快取的潛在客戶資料。');
            // 如果資料已存在，我們仍然需要重新渲染圖表（因為圖表可能在切換頁面時被清除了）
            const dashboardResult = await authedFetch(`/api/contacts/dashboard`);
            if (dashboardResult.success && dashboardResult.data && dashboardResult.data.chartData) {
                renderContactsDashboard(dashboardResult.data.chartData);
            }
        }
        
        // 【修改】呼叫新的本地篩選函式來渲染列表
        filterAndRenderContacts(query);

    } catch (error) {
        if (error.message !== 'Unauthorized') {
            console.error(`❌ 載入潛在客戶失敗:`, error);
            const dashboardContainer = document.getElementById('contacts-dashboard-container');
            const listContent = document.getElementById('contacts-page-content');
            if(dashboardContainer) dashboardContainer.innerHTML = '';
            if(listContent) listContent.innerHTML = `<div class="alert alert-error">載入資料失敗: ${error.message}</div>`;
        }
    }
}

function searchContactsEvent(event) {
    // 【修改】改為呼叫本地篩選函式
    const query = document.getElementById('contacts-page-search').value;
    handleSearch(() => filterAndRenderContacts(query));
}

// 【新增】本地篩選與渲染函式
function filterAndRenderContacts(query = '') {
    const listContent = document.getElementById('contacts-page-content');
    if (!listContent) {
        console.error('[Contacts] 列表容器 #contacts-page-content 未找到。');
        return;
    }

    // 從全域變數讀取資料
    let filteredData = [...allContactsData];
    const searchTerm = query.toLowerCase();

    // 執行本地篩選
    if (searchTerm) {
        filteredData = filteredData.filter(c =>
            (c.name && c.name.toLowerCase().includes(searchTerm)) ||
            (c.company && c.company.toLowerCase().includes(searchTerm))
        );
    }
    
    // 伺服器回傳的資料預設已排序，直接渲染
    listContent.innerHTML = renderContactsTable(filteredData);
}


// ==================== 圖表渲染函式 (已修改) ====================

function renderContactsDashboard(chartData) {
    const container = document.getElementById('contacts-dashboard-container');
    if (!container) {
         console.error('[Contacts] 圖表容器 #contacts-dashboard-container 未找到。');
         return;
    }
    container.innerHTML = `
        <div class="dashboard-widget grid-col-12">
            <div class="widget-header"><h2 class="widget-title">潛在客戶增加趨勢 (近30天)</h2></div>
            <div id="contacts-trend-chart" class="widget-content" style="height: 300px;"></div>
        </div>
    `;
    // 使用 setTimeout 確保 DOM 渲染完成
    setTimeout(() => {
        renderContactsTrendChart(chartData.trend);
    }, 0);
}

function renderContactsTrendChart(data) {
    if (!data || !Array.isArray(data)) {
        console.warn('[Contacts] 趨勢圖渲染失敗：無效的 data。', data);
        const container = document.getElementById('contacts-trend-chart');
        if (container) container.innerHTML = '<div class="alert alert-warning" style="text-align: center; padding: 10px;">無趨勢資料</div>';
        return;
    }

    // 只定義此圖表特定的選項
    const specificOptions = {
        chart: { type: 'area' },
        title: { text: '' },
        xAxis: {
            categories: data.map(d => d[0] ? d[0].substring(5) : '') // 增加保護
        },
        yAxis: {
            title: { text: '數量' }
            // allowDecimals: false // Area chart might benefit from decimals if data varies less
        },
        legend: { enabled: false },
        plotOptions: {
            area: {
                // 從主題繼承基本樣式，這裡可以添加 area 特有的樣式
                fillColor: { // 漸層填充效果，顏色會基於主題的 series color
                    linearGradient: { x1: 0, y1: 0, x2: 0, y2: 1 },
                    stops: [
                        // [0, Highcharts.color(getHighchartsThemeOptions().colors[0]).setOpacity(0.5).get('rgba')], // Color automatically applied
                        // [1, Highcharts.color(getHighchartsThemeOptions().colors[0]).setOpacity(0).get('rgba')]
                        // Let Highcharts handle the gradient based on the series color derived from the theme
                    ]
                },
                marker: { radius: 2 }, // Keep markers small
                lineWidth: 2,
                states: { hover: { lineWidth: 3 } },
                threshold: null
            }
        },
        series: [{
            name: '新增客戶數',
            data: data.map(d => d[1] || 0) // 增加保護
            // 顏色會自動從主題繼承
        }]
    };

    // 使用共通函式建立圖表
    createThemedChart('contacts-trend-chart', specificOptions);
}


// ==================== 專用渲染函式 (重構為卡片) ====================

function renderContactsTable(data) {
    if (!data || data.length === 0) {
        return '<div class="alert alert-info" style="text-align:center; margin-top: 20px;">沒有找到聯絡人資料</div>';
    }

    let listHTML = `<div class="contact-card-list">`;
    data.forEach(contact => {
        const isUpgraded = contact.status === '已升級';
        const isArchived = contact.status === '已歸檔';
        const isFiled = contact.status === '已建檔';
        const isPending = !isUpgraded && !isArchived && !isFiled;

        // Ensure contact data is stringified safely for onclick attribute
        const contactJsonString = JSON.stringify(contact).replace(/'/g, "&apos;").replace(/"/g, '&quot;');

        // **修改開始：將 a 標籤改為 button，並呼叫 showBusinessCardPreview**
        // 將 contact.driveLink 安全地傳遞給 showBusinessCardPreview
        const safeDriveLink = contact.driveLink ? contact.driveLink.replace(/'/g, "\\'") : '';
        const driveLinkBtn = contact.driveLink
            ? `<button class="action-btn small info" title="預覽名片" onclick="showBusinessCardPreview('${safeDriveLink}')">💳 名片</button>`
            : '';
        // **修改結束**

        // Upgrade button only for pending contacts
        const upgradeBtn = isPending
            ? `<button class="action-btn small primary" onclick='startUpgradeContact(${contactJsonString})'>📈 升級</button>`
            : '';

        let statusBadge = '';
        if (isUpgraded) {
            statusBadge = `<span class="contact-card-status upgraded">已升級</span>`;
        } else if (isArchived) {
            statusBadge = `<span class="contact-card-status archived">已歸檔</span>`;
        } else if (isFiled) {
            statusBadge = `<span class="contact-card-status filed">已建檔</span>`;
        } else { // isPending
            statusBadge = `<span class="contact-card-status pending">待處理</span>`;
        }

        listHTML += `
            <div class="contact-card">
                <div class="contact-card-main">
                    <div class="contact-card-header">
                        <span class="contact-card-name">${contact.name || '(無姓名)'}</span>
                        ${statusBadge}
                    </div>
                    <div class="contact-card-company">${contact.company || '(無公司)'}</div>
                    <div class="contact-card-position">${contact.position || '(無職位)'}</div>
                </div>
                <div class="contact-card-actions">
                    ${driveLinkBtn}
                    ${upgradeBtn}
                </div>
            </div>
        `;
    });
    listHTML += '</div>';
    return listHTML;
}

// ==================== 升級聯絡人相關功能 ====================
let upgradeSearchTimeout;

async function showUpgradeContactModal() {
    // Ensure modal HTML is loaded before showing
    if (!document.getElementById('upgrade-contact-modal')) {
        console.error('[Contacts] Upgrade contact modal HTML not loaded.');
        showNotification('無法開啟升級視窗，元件遺失。', 'error');
        return;
    }
    showModal('upgrade-contact-modal');
    const assigneeSelect = document.getElementById('upgrade-assignee');
    if (assigneeSelect) {
        // Set default assignee, ensure dropdown is populated correctly
        if (typeof populateSelect === 'function' && window.CRM_APP?.systemConfig?.['團隊成員']) {
            populateSelect('upgrade-assignee', window.CRM_APP.systemConfig['團隊成員'], getCurrentUser());
        } else {
             assigneeSelect.value = getCurrentUser(); // Fallback
        }
    }
    await loadContactsForUpgrade();
}

async function loadContactsForUpgrade(query = '') {
    const listElement = document.getElementById('upgrade-contacts-list');
    const paginationContainer = document.getElementById('upgrade-contacts-pagination');

    if (!listElement) {
        console.error('[Contacts] Upgrade contact list container #upgrade-contacts-list not found.');
        return;
    }
    listElement.innerHTML = '<div class="loading show"><div class="spinner"></div></div>';
    if(paginationContainer) paginationContainer.innerHTML = ''; // Clear pagination

    try {
        const result = await authedFetch(`/api/contacts?q=${encodeURIComponent(query)}`); // API returns { data: [...] }

        // Only show pending contacts for upgrade
        const upgradableContacts = (result.data || []).filter(c => c.status !== '已升級' && c.status !== '已歸檔' && c.status !== '已建檔');

        renderUpgradeContactsList(upgradableContacts);

    } catch (error) {
        if (error.message !== 'Unauthorized') {
            console.error('❌ 載入升級聯絡人失敗:', error);
            listElement.innerHTML = '<div class="alert alert-error">載入聯絡人失敗</div>';
        }
    }
}

function renderUpgradeContactsList(contacts) {
    const listElement = document.getElementById('upgrade-contacts-list');
    if (!listElement) return;

    let html = '';
    if (!contacts || contacts.length === 0) {
        html = '<div class="alert alert-warning">沒有找到符合的待升級聯絡人</div>';
    } else {
        contacts.forEach(contact => {
            // Ensure safe stringification for onclick
            const contactJsonString = JSON.stringify(contact).replace(/'/g, "&apos;").replace(/"/g, '&quot;');
            html += `
                <div class="kanban-card" onclick='selectContactForUpgrade(${contactJsonString})'
                     style="border-left: 3px solid var(--accent-green); margin-bottom: 10px; cursor: pointer;">
                    <div class="card-title">${contact.name || '無姓名'}</div>
                    <div class="card-company">🏢 ${contact.company || '無公司'}</div>
                    <div class="card-assignee">📞 ${contact.mobile || contact.phone || '無電話'}</div>
                </div>
            `;
        });
    }
    listElement.innerHTML = html;
}

function searchContactsForUpgrade() {
    clearTimeout(upgradeSearchTimeout);
    upgradeSearchTimeout = setTimeout(() => {
        const searchInput = document.getElementById('upgrade-search');
        const query = searchInput ? searchInput.value : '';
        loadContactsForUpgrade(query);
    }, 400);
}

function selectContactForUpgrade(contact) {
    selectedContactForUpgrade = contact;

    // Ensure confirm modal HTML is loaded
    if (!document.getElementById('upgrade-confirm-modal')) {
        console.error('[Contacts] Upgrade confirm modal HTML not loaded.');
        showNotification('無法開啟確認視窗，元件遺失。', 'error');
        closeModal('upgrade-contact-modal'); // Close the selection modal
        return;
    }

    closeModal('upgrade-contact-modal');
    showModal('upgrade-confirm-modal');

    const infoElement = document.getElementById('selected-contact-info');
    const nameInput = document.getElementById('upgrade-opportunity-name');
    const assigneeSelect = document.getElementById('upgrade-assignee');
    const countySelect = document.getElementById('upgrade-company-county');

    if (!infoElement || !nameInput || !assigneeSelect || !countySelect) {
        console.error('[Contacts] Upgrade confirm modal elements missing.');
        closeModal('upgrade-confirm-modal');
        return;
    }

    const driveLinkHTML = contact.driveLink
        ? `<p><strong>原始名片:</strong> <a href="${contact.driveLink}" target="_blank" class="text-link">點此查看名片照片</a></p>`
        : '';

    infoElement.innerHTML = `
        <h4>📋 選中的聯絡人</h4>
        <p><strong>姓名:</strong> ${contact.name || '-'}</p>
        <p><strong>公司:</strong> ${contact.company || '-'}</p>
        <p><strong>職位:</strong> ${contact.position || '-'}</p>
        <p><strong>電話:</strong> ${contact.mobile || contact.phone || '-'}</p>
        ${driveLinkHTML}
    `;

    // Pre-fill opportunity name
    nameInput.value = contact.company ? `${contact.company} 合作機會` : '新機會案件';

    // Set default assignee and populate dropdowns (redundant check, but safe)
    if (typeof populateSelect === 'function' && window.CRM_APP?.systemConfig) {
        populateSelect('upgrade-opportunity-type', window.CRM_APP.systemConfig['機會種類']);
        populateSelect('upgrade-current-stage', window.CRM_APP.systemConfig['機會階段'], window.CRM_APP.systemConfig['機會階段']?.[0]?.value); // Default to first stage
        populateSelect('upgrade-assignee', window.CRM_APP.systemConfig['團隊成員'], getCurrentUser());
        populateCountyDropdown('upgrade-company-county'); // Ensure county dropdown is populated
    } else {
        assigneeSelect.value = getCurrentUser(); // Fallback
    }

    // Try auto-selecting county
    populateCountyFromAddress(contact, 'upgrade-company-county');
}


function startUpgradeContact(contact) {
    if (contact) {
        selectContactForUpgrade(contact);
    } else {
        showNotification('找不到對應的聯絡人資料', 'error');
    }
}

// ==================== 升級表單提交 ====================
// Form submission handler (called by event listener below)
async function handleUpgradeFormSubmit(e) {
    e.preventDefault(); // 確保阻止瀏覽器預設提交

    if (!selectedContactForUpgrade) {
        showNotification('請先選擇要升級的聯絡人', 'warning');
        return;
    }

    showLoading('正在升級聯絡人並同步所有資料...');

    try {
        // Collect opportunity data from the form
        const opportunityData = {
            opportunityName: document.getElementById('upgrade-opportunity-name').value,
            opportunityType: document.getElementById('upgrade-opportunity-type').value,
            currentStage: document.getElementById('upgrade-current-stage').value,
            assignee: document.getElementById('upgrade-assignee').value,
            expectedCloseDate: document.getElementById('upgrade-expected-close-date').value,
            opportunityValue: document.getElementById('upgrade-opportunity-value').value,
            notes: document.getElementById('upgrade-notes').value,
            county: document.getElementById('upgrade-company-county').value
        };

        // Validate required fields client-side
        if (!opportunityData.opportunityName) {
            throw new Error('機會名稱為必填欄位。');
        }

        const result = await authedFetch(`/api/contacts/${selectedContactForUpgrade.rowIndex}/upgrade`, {
            method: 'POST',
            body: JSON.stringify(opportunityData)
        });

        // authedFetch 會處理成功後的刷新和通知
        
        // 只需要在 authedFetch 成功後（它會返回 result）關閉 modal 並清除狀態
        closeModal('upgrade-confirm-modal');
        selectedContactForUpgrade = null; // Clear selected contact
        
        // 【修改】升級成功後，手動清除本地快取，確保下次點進來時資料是新的
        allContactsData = [];
        // authedFetch 會自動刷新頁面，所以上面的清除是為了下次載入

    } catch (error) {
        // authedFetch 會自動顯示大部分錯誤通知
        if (error.message !== 'Unauthorized') {
            console.error('❌ 升級聯絡人失敗:', error);
            // 確保 loading 畫面被關閉
             const loadingOverlay = document.getElementById('loading-overlay');
             if (loadingOverlay && loadingOverlay.style.display !== 'none') {
                 hideLoading();
                 // 如果 authedFetch 沒有顯示通知 (例如 client-side 驗證)，這裡會顯示
                 if (!document.querySelector('.notification.error')) {
                    showNotification('升級失敗: ' + error.message, 'error');
                 }
             }
        }
    } finally {
        // 確保 loading 隱藏
        hideLoading();
    }
}

// --- 【BUG 修正】 ---
// 移除舊的、有競爭條件的 DOMContentLoaded 監聽器
// 改用事件委派，確保 #upgrade-form 即使是動態載入也能被監聽到
document.addEventListener('submit', function(e) {
    if (e.target.id === 'upgrade-form') {
        handleUpgradeFormSubmit(e);
    }
});
// --- 【BUG 修正結束】 ---


// 向主應用程式註冊此模組
if (window.CRM_APP) {
     if (!window.CRM_APP.pageModules) {
        window.CRM_APP.pageModules = {};
    }
    window.CRM_APP.pageModules.contacts = loadContacts;
} else {
    console.error('[Contacts] CRM_APP 全域物件未定義，無法註冊頁面模組。');
}