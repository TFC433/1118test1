// public/scripts/opportunities.js
// 職責：管理「機會案件列表頁」的圖表、篩選、列表渲染與操作
// (V-Final: 移除列表編輯按鈕 + 修復刪除轉圈問題)

// ==================== 全域變數 (此頁面專用) ====================
let opportunitiesData = [];
// 用於反向查找篩選鍵值
let reverseNameMaps = {};

// ==================== 主要功能函式 ====================

/**
 * 載入並渲染所有機會案件，並支援搜尋功能
 * @param {string} [query=''] - 搜尋關鍵字
 */
async function loadOpportunities(query = '') {
    const container = document.getElementById('page-opportunities');
    if (!container) return;

    // 渲染頁面骨架
    container.innerHTML = `
        <div id="opportunities-dashboard-container" class="dashboard-grid-flexible" style="margin-bottom: 24px;">
            <div class="loading show" style="grid-column: span 12;"><div class="spinner"></div><p>載入分析圖表中...</p></div>
        </div>

        <div id="opportunity-chip-wall-container" class="dashboard-widget" style="margin-bottom: 24px;">
            <div class="widget-header"><h2 class="widget-title">機會階段總覽 (晶片牆)</h2></div>
            <div class="widget-content">
                <div class="loading show"><div class="spinner"></div><p>載入晶片牆資料中...</p></div>
            </div>
        </div>

        <div class="dashboard-widget">
            <div class="widget-header">
                <h2 class="widget-title">機會案件列表</h2>
                <div id="opportunities-filter-status" style="display: none; align-items: center; gap: 10px;">
                    <span id="opportunities-filter-text" style="font-weight: 600;"></span>
                    <button class="action-btn small danger" onclick="filterAndRenderOpportunities(null, null)">清除篩選</button>
                </div>
            </div>
            <div class="search-pagination" style="padding: 0 1.5rem 1rem;">
                <input type="text" class="search-box" id="opportunities-list-search" placeholder="搜尋機會名稱或客戶公司..." onkeyup="handleOpportunitiesSearch(event)" value="${query}">
            </div>
            <div id="opportunities-page-content" class="widget-content">
                <div class="loading show"><div class="spinner"></div><p>載入機會資料中...</p></div>
            </div>
        </div>
    `;

    // Ensure search event listener is attached after rendering
    const searchInput = document.getElementById('opportunities-list-search');
    if (searchInput) {
        searchInput.removeEventListener('keyup', handleOpportunitiesSearch); // Remove potential duplicates
        searchInput.addEventListener('keyup', handleOpportunitiesSearch);
    }

    try {
        const [dashboardResult, opportunitiesResult, interactionsResult] = await Promise.all([
            authedFetch(`/api/opportunities/dashboard`),
            authedFetch(`/api/opportunities?page=0`), // 獲取所有機會
            authedFetch(`/api/interactions/all?fetchAll=true`) // 獲取所有互動紀錄
        ]);

        if (dashboardResult.success && dashboardResult.data && dashboardResult.data.chartData) {
            // 建立反向名稱映射
            const systemConfig = window.CRM_APP?.systemConfig; // 安全訪問
            if (systemConfig) {
                reverseNameMaps = {
                    opportunitySource: new Map((systemConfig['機會來源'] || []).map(i => [i.note || i.value, i.value])), // 使用 note 作為 key
                    opportunityType: new Map((systemConfig['機會種類'] || []).map(i => [i.note || i.value, i.value])),
                    currentStage: new Map((systemConfig['機會階段'] || []).map(i => [i.note || i.value, i.value])),
                    orderProbability: new Map((systemConfig['下單機率'] || []).map(i => [i.note || i.value, i.value])),
                    potentialSpecification: new Map((systemConfig['可能下單規格'] || []).map(i => [i.note || i.value, i.value])),
                    salesChannel: new Map((systemConfig['可能銷售管道'] || []).map(i => [i.note || i.value, i.value])),
                    deviceScale: new Map((systemConfig['設備規模'] || []).map(i => [i.note || i.value, i.value]))
                };
            } else {
                 console.warn('[Opportunities] 系統設定未載入，篩選功能可能受影響。');
                 reverseNameMaps = {};
            }
            renderOpportunityCharts(dashboardResult.data.chartData);
        } else {
             console.warn('[Opportunities] 無法獲取圖表資料:', dashboardResult.error || '未知錯誤');
            const dashboardContainer = document.getElementById('opportunities-dashboard-container');
             if (dashboardContainer) dashboardContainer.innerHTML = `<div class="alert alert-error" style="grid-column: span 12;">圖表資料載入失敗</div>`;
        }

        let opportunities = opportunitiesResult || []; // API 直接回傳陣列
        const interactions = interactionsResult.data || [];

        // 在資料載入後立即計算 effectiveLastActivity
        const latestInteractionMap = new Map();
        interactions.forEach(interaction => {
            const id = interaction.opportunityId;
            const existing = latestInteractionMap.get(id) || 0;
            const current = new Date(interaction.interactionTime || interaction.createdTime).getTime();
            if (current > existing) latestInteractionMap.set(id, current);
        });

        opportunities.forEach(opp => {
             const selfUpdate = new Date(opp.lastUpdateTime || opp.createdTime).getTime();
             const lastInteraction = latestInteractionMap.get(opp.opportunityId) || 0;
             opp.effectiveLastActivity = Math.max(selfUpdate, lastInteraction);
             // 確保即使沒有活動時間戳，也有一個基礎值 (例如建立時間)，避免排序出錯
             if (isNaN(opp.effectiveLastActivity)) {
                 opp.effectiveLastActivity = new Date(opp.createdTime || 0).getTime();
             }
        });

        opportunitiesData = opportunities; // 儲存包含活動時間的資料

        // 渲染 Chip Wall
        const chipWallContainer = document.getElementById('opportunity-chip-wall-container');
        if (typeof ChipWall !== 'undefined' && chipWallContainer) {
            const ongoingOpportunities = opportunitiesData.filter(opp => opp.currentStatus === '進行中');
            const chipWall = new ChipWall('#opportunity-chip-wall-container', {
                stages: window.CRM_APP?.systemConfig?.['機會階段'] || [], // 安全訪問
                items: ongoingOpportunities,
                interactions: interactions, // 傳入互動紀錄以計算活動時間
                colorConfigKey: '機會種類',
                useDynamicSize: true,
                isCollapsible: true,
                isDraggable: true,
                showControls: true, // 讓 ChipWall 自己處理控制項
                onItemUpdate: () => {
                     // 當 ChipWall 內部拖曳更新後的回調
                    if(window.CRM_APP?.pageConfig) window.CRM_APP.pageConfig.dashboard.loaded = false; // 標記儀表板需刷新
                }
            });
            chipWall.render();
        } else if (chipWallContainer) {
            chipWallContainer.querySelector('.widget-content').innerHTML = `<div class="alert alert-error">晶片牆元件載入失敗</div>`;
        }

        // 初始渲染列表
        filterAndRenderOpportunities(null, null, query);

    } catch (error) {
        if (error.message !== 'Unauthorized') {
            console.error('❌ 載入機會案件頁面失敗:', error);
            ['opportunities-dashboard-container', 'opportunity-chip-wall-container', 'opportunities-page-content'].forEach(id => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = `<div class="alert alert-error">載入資料失敗: ${error.message}</div>`;
            });
        }
    }
}

/**
 * 篩選並重新渲染機會列表的核心函式
 * @param {string|null} filterKey - 要篩選的欄位鍵名
 * @param {string|null} filterDisplayValue - 要篩選的顯示值
 * @param {string} [query=''] - 搜尋框的關鍵字
 */
function filterAndRenderOpportunities(filterKey, filterDisplayValue, query = '') {
    const listContent = document.getElementById('opportunities-page-content');
    const filterStatus = document.getElementById('opportunities-filter-status');
    const filterText = document.getElementById('opportunities-filter-text');

    if (!listContent || !filterStatus || !filterText) {
        console.error('[Opportunities] 列表或篩選狀態元素未找到。');
        return;
    }

    let filteredData = [...opportunitiesData];

    // 步驟 1: 處理圖表點擊篩選
    let currentFilterDisplayValue = null;
    if (filterKey && filterDisplayValue) {
        const filterValue = reverseNameMaps[filterKey]?.get(filterDisplayValue) || filterDisplayValue;
        console.log(`[Filter] Applying filter: Key=${filterKey}, DisplayValue=${filterDisplayValue}, ActualValue=${filterValue}`);
        
        if (filterKey === 'potentialSpecification') {
            filteredData = filteredData.filter(opp => {
                const specData = opp.potentialSpecification;
                if (!specData) return false;
                try {
                    const parsedJson = JSON.parse(specData);
                    if (parsedJson && typeof parsedJson === 'object') {
                        return parsedJson.hasOwnProperty(filterValue) && parsedJson[filterValue] > 0;
                    }
                } catch (e) {
                    if (typeof specData === 'string') {
                        return specData.split(',').map(s => s.trim()).includes(filterValue);
                    }
                }
                return false;
            });
        } else {
            filteredData = filteredData.filter(opp => {
                const oppValue = opp[filterKey] || '';
                return oppValue === filterValue;
            });
        }

        filterStatus.style.display = 'flex';
        filterText.textContent = `篩選條件: ${filterDisplayValue}`;
        currentFilterDisplayValue = filterDisplayValue;

        Highcharts.charts.forEach(chart => {
            if (chart && chart.series && chart.series[0] && chart.series[0].points) {
                chart.series[0].points.forEach(point => {
                    if (point && typeof point.select === 'function' && point.name !== filterDisplayValue) {
                        point.select(false, true);
                    }
                });
            }
        });

    } else {
        filterStatus.style.display = 'none';
        filterText.textContent = '';
        currentFilterDisplayValue = null;
        Highcharts.charts.forEach(chart => {
            if (chart && chart.series && chart.series[0] && chart.series[0].points) {
                 chart.series[0].points.forEach(point => {
                     if (point && typeof point.select === 'function') {
                        point.select(false, true);
                     }
                 });
            }
        });
    }

    // 步驟 2: 處理搜尋框篩選
    const searchTerm = (query !== undefined ? query : document.getElementById('opportunities-list-search')?.value || '').toLowerCase();
    if (searchTerm) {
        filteredData = filteredData.filter(o =>
            (o.opportunityName && o.opportunityName.toLowerCase().includes(searchTerm)) ||
            (o.customerCompany && o.customerCompany.toLowerCase().includes(searchTerm))
        );
    }

    // 步驟 3: 排序並渲染表格
    const sortedForTable = filteredData.sort((a, b) => (b.effectiveLastActivity || 0) - (a.effectiveLastActivity || 0));
    listContent.innerHTML = renderOpportunitiesTable(sortedForTable);

    // 步驟 4: 更新搜尋框的值
    const searchInput = document.getElementById('opportunities-list-search');
    if (searchInput && query !== undefined && searchInput.value !== query) {
        searchInput.value = query;
    }
}


function handleOpportunitiesSearch(event) {
    const query = event.target.value;
    const filterStatus = document.getElementById('opportunities-filter-status');
    const filterText = document.getElementById('opportunities-filter-text');
    let filterKey = null;
    let filterDisplayValue = null;

    if (filterStatus && filterStatus.style.display !== 'none' && filterText) {
        const match = filterText.textContent.match(/篩選條件: (.*)/);
        filterDisplayValue = match ? match[1] : null;
        if (filterDisplayValue) {
            for (const k in reverseNameMaps) {
                if (reverseNameMaps[k]?.has(filterDisplayValue)) {
                    filterKey = k;
                    break;
                }
            }
        }
    }
    handleSearch(() => filterAndRenderOpportunities(filterKey, filterDisplayValue, query));
}


/**
 * 通用圓餅圖選項產生器
 */
function getPieChartOptions(seriesName, data, filterKey) {
    if (!Array.isArray(data)) {
        console.warn(`[getPieChartOptions] Invalid data for ${seriesName}:`, data);
        data = [];
    }
     const validatedData = data.map(d => ({
        name: d.name || '未分類',
        y: d.y || 0
     }));

    const specificOptions = {
        chart: { type: 'pie' },
        title: { text: '' },
        tooltip: { pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b> ({point.y} 件)' },
        plotOptions: {
            pie: {
                allowPointSelect: true,
                cursor: 'pointer',
                dataLabels: {
                    enabled: true,
                    format: '<b>{point.name}</b>: {point.percentage:.1f}%',
                    distance: 20,
                },
                showInLegend: false,
                point: {
                    events: {
                        click: function() {
                            const currentFilterTextEl = document.getElementById('opportunities-filter-text');
                            const currentFilterStatusEl = document.getElementById('opportunities-filter-status');
                            const isCurrentlySelected = this.selected;
                            const currentFilterDisplay = currentFilterTextEl ? currentFilterTextEl.textContent.replace('篩選條件: ','') : null;

                            if (isCurrentlySelected || (currentFilterStatusEl && currentFilterStatusEl.style.display !== 'none' && currentFilterDisplay !== this.name)) {
                                filterAndRenderOpportunities(null, null);
                            } else {
                                filterAndRenderOpportunities(filterKey, this.name);
                            }
                        }
                    }
                }
            }
        },
        series: [{ name: seriesName, data: validatedData }]
    };
    return specificOptions;
}


function renderOpportunityCharts(chartData) {
    const container = document.getElementById('opportunities-dashboard-container');
    if (!container) return;
    
    container.innerHTML = `
        <div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">機會趨勢 (近30天)</h2></div><div id="opp-trend-chart" class="widget-content" style="height: 250px;"></div></div>
        <div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">機會來源分佈</h2></div><div id="opp-source-chart" class="widget-content" style="height: 250px;"></div></div>
        <div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">機會種類分佈</h2></div><div id="opp-type-chart" class="widget-content" style="height: 250px;"></div></div>
        <div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">機會階段分佈</h2></div><div id="opp-stage-chart" class="widget-content" style="height: 250px;"></div></div>
        <div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">下單機率</h2></div><div id="opp-probability-chart" class="widget-content" style="height: 250px;"></div></div>
        <div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">可能下單規格</h2></div><div id="opp-spec-chart" class="widget-content" style="height: 250px;"></div></div>
        <div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">可能銷售管道</h2></div><div id="opp-channel-chart" class="widget-content" style="height: 250px;"></div></div>
        <div class="dashboard-widget grid-col-3"><div class="widget-header"><h2 class="widget-title">設備規模</h2></div><div id="opp-scale-chart" class="widget-content" style="height: 250px;"></div></div>
    `;

    setTimeout(() => {
        if (typeof Highcharts !== 'undefined' && typeof createThemedChart === 'function' && chartData) {
            renderOppTrendChart(chartData.trend);
            createThemedChart('opp-source-chart', getPieChartOptions('來源', chartData.source, 'opportunitySource'));
            createThemedChart('opp-type-chart', getPieChartOptions('種類', chartData.type, 'opportunityType'));
            renderOppStageChart(chartData.stage);
            createThemedChart('opp-probability-chart', getPieChartOptions('機率', chartData.probability, 'orderProbability'));
            createThemedChart('opp-spec-chart', getPieChartOptions('規格', chartData.specification, 'potentialSpecification'));
            createThemedChart('opp-channel-chart', getPieChartOptions('管道', chartData.channel, 'salesChannel'));
            createThemedChart('opp-scale-chart', getPieChartOptions('規模', chartData.scale, 'deviceScale'));
        }
    }, 0);
}

function renderOppTrendChart(data) {
     if (!data || !Array.isArray(data)) {
        const container = document.getElementById('opp-trend-chart');
        if (container) container.innerHTML = '<div class="alert alert-warning" style="text-align: center; padding: 10px;">無趨勢資料</div>';
        return;
     }
     const specificOptions = {
        chart: { type: 'line' },
        title: { text: '' },
        xAxis: { categories: data.map(d => d[0] ? d[0].substring(5) : '') },
        yAxis: { title: { text: '數量' }, allowDecimals: false },
        legend: { enabled: false },
        series: [{ name: '機會數', data: data.map(d => d[1] || 0) }]
    };
    createThemedChart('opp-trend-chart', specificOptions);
}

function renderOppStageChart(data) {
     if (!data || !Array.isArray(data)) {
        const container = document.getElementById('opp-stage-chart');
        if (container) container.innerHTML = '<div class="alert alert-warning" style="text-align: center; padding: 10px;">無階段資料</div>';
        return;
     }
     const validatedData = data.map(d => [d[0] || '未分類', d[1] || 0]);

    const specificOptions = {
        chart: { type: 'bar' },
        title: { text: '' },
        xAxis: { categories: validatedData.map(d => d[0]), title: { text: null } },
        yAxis: { min: 0, title: { text: '案件數量', align: 'high' }, allowDecimals: false },
        legend: { enabled: false },
        series: [{ name: '數量', data: validatedData.map(d => d[1]) }],
        plotOptions: {
            bar: {
                 cursor: 'pointer',
                 point: {
                    events: {
                        click: function() {
                           const currentFilterTextEl = document.getElementById('opportunities-filter-text');
                           const currentFilterStatusEl = document.getElementById('opportunities-filter-status');
                           const isCurrentlySelected = this.selected;
                           const currentFilterDisplay = currentFilterTextEl ? currentFilterTextEl.textContent.replace('篩選條件: ','') : null;

                           if (isCurrentlySelected || (currentFilterStatusEl && currentFilterStatusEl.style.display !== 'none' && currentFilterDisplay !== this.category)) {
                               filterAndRenderOpportunities(null, null);
                           } else {
                               filterAndRenderOpportunities('currentStage', this.category);
                           }
                        }
                    }
                }
            }
        }
    };
    createThemedChart('opp-stage-chart', specificOptions);
}

/**
 * 渲染機會案件列表的表格 HTML
 * @param {Array<object>} opportunities - 機會案件資料陣列
 * @returns {string} HTML 字串
 */
function renderOpportunitiesTable(opportunities) {
    const styleId = 'opportunity-list-table-styles';
    if (!document.getElementById(styleId)) {
        const style = document.createElement('style');
        style.id = styleId;
        style.innerHTML = `
            .opportunity-list-table .col-last-activity { min-width: 140px; }
            .opportunity-list-table .col-opportunity-name,
            .opportunity-list-table .col-company-name { max-width: 200px; }
            .opportunity-list-table .col-actions { min-width: 80px; overflow: visible; } /* 調整寬度 */
            .opportunity-list-table td { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        `;
        document.head.appendChild(style);
    }

    if (!opportunities || opportunities.length === 0) {
        return '<div class="alert alert-info" style="text-align:center;">暫無符合條件的機會案件資料</div>';
    }

    let html = `<table class="data-table opportunity-list-table"><thead><tr>
                    <th>最後活動</th>
                    <th>機會名稱</th>
                    <th>客戶公司</th>
                    <th>負責業務</th>
                    <th>目前階段</th>
                    <th>操作</th>
                </tr></thead><tbody>`;

    const systemConfig = window.CRM_APP?.systemConfig;
    const stageNotes = new Map((systemConfig?.['機會階段'] || []).map(s => [s.value, s.note || s.value]));
    const typeConfigs = new Map((systemConfig?.['機會種類'] || []).map(t => [t.value, { note: t.note, color: t.color }]));

    opportunities.forEach(opp => {
        const stageDisplayName = stageNotes.get(opp.currentStage) || opp.currentStage || '未分類';
        const companyName = opp.customerCompany || '';
        const encodedCompanyName = encodeURIComponent(companyName);
        const opportunityName = opp.opportunityName || '(未命名)';
        const safeOpportunityName = opportunityName.replace(/'/g, "\\'").replace(/"/g, '&quot;');

        const companyCell = companyName
            ? `<td data-label="客戶公司" class="col-company-name" title="${companyName}"><a href="#" class="text-link" onclick="event.preventDefault(); CRM_APP.navigateTo('company-details', { companyName: '${encodedCompanyName}' })">${companyName}</a></td>`
            : `<td data-label="客戶公司">-</td>`;

        const oppId = opp.opportunityId || '';
        const deleteButtonOnClick = `confirmDeleteOpportunity(${opp.rowIndex}, '${safeOpportunityName}')`;

        const typeConfig = typeConfigs.get(opp.opportunityType);
        const rowColor = typeConfig?.color || 'transparent';

        // --- 修正點 1: 移除編輯按鈕，保留刪除按鈕 ---
        html += `
            <tr style="--card-brand-color: ${rowColor};">
                <td data-label="最後活動" class="col-last-activity">${formatDateTime(opp.effectiveLastActivity)}</td>
                <td data-label="機會名稱" class="col-opportunity-name" title="${opportunityName}">
                    <a href="#" class="text-link" onclick="event.preventDefault(); CRM_APP.navigateTo('opportunity-details', { opportunityId: '${oppId}' })">
                        <strong>${opportunityName}</strong>
                    </a>
                </td>
                ${companyCell}
                <td data-label="負責業務">${opp.assignee || '-'}</td>
                <td data-label="目前階段">${stageDisplayName}</td>
                <td data-label="操作" class="col-actions"><div class="action-buttons-container">
                    <button class="action-btn small danger" onclick="${deleteButtonOnClick}">🗑️ 刪除</button>
                </div></td>
            </tr>`;
    });
    html += '</tbody></table>';
    return html;
}


async function confirmDeleteOpportunity(rowIndex, opportunityName) {
    if (!rowIndex) {
        showNotification('無法刪除：缺少必要的紀錄索引。', 'error');
        return;
    }
    const safeOpportunityName = opportunityName || '(未命名)';
    const message = `您確定要"永久刪除"\n機會案件 "${safeOpportunityName}" 嗎？\n此操作無法復原！!`;

    showConfirmDialog(message, async () => {
        showLoading('正在刪除...');
        try {
            const result = await authedFetch(`/api/opportunities/${rowIndex}`, { method: 'DELETE' });
            
            if (result.success) {
                // --- 修正點 2: 移除手動顯示成功訊息 (避免重複) ---
                // showNotification('刪除成功', 'success'); 
                
                // 獲取當前搜尋關鍵字，保持搜尋狀態
                const searchInput = document.getElementById('opportunities-list-search');
                const currentQuery = searchInput ? searchInput.value : '';
                
                // 重新載入列表資料，讓被刪除的項目消失
                await loadOpportunities(currentQuery);
                
            } else {
                 throw new Error(result.details || '刪除操作失敗');
            }
        } catch (error) {
            if (error.message !== 'Unauthorized') {
                 console.error('刪除機會失敗:', error);
                 // authedFetch 會處理錯誤提示
            }
        } finally {
             // --- 修正點 3: 確保 Loading 視窗關閉 ---
             hideLoading();
        }
    });
}

function quickCreateMeeting(opportunityId) {
    if (!opportunityId) {
        showNotification('無法建立會議：無效的機會ID', 'error');
        return;
    }
    showNewMeetingModal().then(() => {
        const select = document.getElementById('meeting-opportunity');
        if (!select) return;
        for (let option of select.options) {
            if (option.value && option.value !== 'manual') {
                try {
                    const data = JSON.parse(option.value);
                    if (data.opportunityId === opportunityId) {
                        select.value = option.value;
                        if (typeof updateMeetingInfo === 'function') {
                            updateMeetingInfo();
                        }
                        break;
                    }
                } catch (e) {
                     console.warn('解析會議選項時出錯:', e);
                     continue;
                }
            }
        }
    });
}

async function loadFollowUpPage() {
    const container = document.getElementById('page-follow-up');
    if (!container) return;
    container.innerHTML = '<div class="loading show"><div class="spinner"></div><p>載入待追蹤清單中...</p></div>';
    try {
        const result = await authedFetch('/api/dashboard');
        if (!result.success || !result.data) throw new Error(result.error || '無法獲取儀表板資料');

        const dashboardData = result.data;
        const followUpBasicList = dashboardData.followUpList || [];
        const followUpFullList = followUpBasicList;

        followUpFullList.sort((a, b) => (a.effectiveLastActivity || 0) - (b.effectiveLastActivity || 0));

        if (followUpFullList.length === 0) {
            container.innerHTML = '<div class="alert alert-success" style="padding: 2rem; text-align: center;">🎉 太棒了！目前沒有需要追蹤的機會案件。</div>';
        } else {
            const thresholdDays = window.CRM_APP?.systemConfig?.FOLLOW_UP?.DAYS_THRESHOLD || 7;
            container.innerHTML = `<div class="dashboard-widget"><div class="widget-header"><h2 class="widget-title">待追蹤機會案件 (${followUpFullList.length})</h2></div><div class="widget-content"><div class="alert alert-warning">⚠️ 以下機會案件已超過 ${thresholdDays} 天未有新活動，建議盡快跟進。</div>${renderOpportunitiesTable(followUpFullList)}</div></div>`;
        }
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            console.error('❌ 載入待追蹤清單失敗:', error);
            container.innerHTML = '<div class="alert alert-error">載入待追蹤清單失敗，請稍後再試。</div>';
        }
    }
}


// 向主應用程式註冊此模組
if (window.CRM_APP) {
    if (!window.CRM_APP.pageModules) {
        window.CRM_APP.pageModules = {};
    }
    window.CRM_APP.pageModules.opportunities = loadOpportunities;
    window.CRM_APP.pageModules['follow-up'] = loadFollowUpPage;
} else {
    console.error('[Opportunities] CRM_APP 全域物件未定義，無法註冊頁面模組。');
}