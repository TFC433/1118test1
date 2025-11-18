// views/scripts/sales-analysis.js
// (已修改為使用 createThemedChart)
let salesAnalysisData = null;
let salesStartDate = null;
let salesEndDate = null;

async function loadSalesAnalysisPage(startDateISO, endDateISO) {
    const container = document.getElementById('page-sales-analysis');
    if (!container) return;

    // 設定預設日期範圍（如果未提供）
    if (!startDateISO || !endDateISO) {
        const endDate = new Date();
        const startDate = new Date();
        startDate.setFullYear(startDate.getFullYear() - 1);
        startDate.setDate(startDate.getDate() + 1); // 往前推一年再加一天，例如 2024-10-23 到 2025-10-22

        salesEndDate = endDate.toISOString().split('T')[0];
        salesStartDate = startDate.toISOString().split('T')[0];
    } else {
        salesStartDate = startDateISO;
        salesEndDate = endDateISO;
    }

    container.innerHTML = `
        <div class="dashboard-widget">
            <div class="widget-header" style="align-items: flex-start;">
                <div>
                    <h2 class="widget-title">績效概覽</h2>
                    <p id="sales-date-range-display" style="color: var(--text-muted); font-size: 0.9rem; margin-top: 5px;">
                        資料期間：${new Date(salesStartDate + 'T00:00:00').toLocaleDateString('zh-TW')} - ${new Date(salesEndDate + 'T00:00:00').toLocaleDateString('zh-TW')}
                    </p>
                </div>
                <div style="display: flex; gap: 15px; align-items: center; flex-wrap: wrap;">
                    <div class="form-group" style="margin-bottom: 0;">
                        <label for="sales-start-date" class="form-label" style="font-size: 0.8rem;">開始日期</label>
                        <input type="date" id="sales-start-date" class="form-input form-input-sm" value="${salesStartDate}">
                    </div>
                    <div class="form-group" style="margin-bottom: 0;">
                        <label for="sales-end-date" class="form-label" style="font-size: 0.8rem;">結束日期</label>
                        <input type="date" id="sales-end-date" class="form-input form-input-sm" value="${salesEndDate}">
                    </div>
                    <button class="action-btn primary" style="height: 40px; margin-top: 20px;" onclick="refreshSalesAnalysis()">
                        <svg viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" /></svg>
                        查詢
                    </button>
                </div>
            </div>
            <div id="sales-overview-content" class="widget-content">
                <div class="loading show"><div class="spinner"></div></div>
            </div>
        </div>

        <div id="sales-charts-container" class="dashboard-grid-flexible" style="margin-top: 24px;">
             <div class="loading show" style="grid-column: span 12;"><div class="spinner"></div><p>載入圖表中...</p></div>
        </div>

        <div class="dashboard-widget" style="margin-top: 24px;">
            <div class="widget-header"><h2 class="widget-title">高價值成交案件 (Top 20)</h2></div>
            <div id="top-deals-content" class="widget-content">
                <div class="loading show"><div class="spinner"></div><p>載入成交列表...</p></div>
            </div>
        </div>
    `;

    // 確保 DOM 元素存在後再獲取資料和渲染
    await fetchAndRenderSalesData(salesStartDate, salesEndDate);
}

function refreshSalesAnalysis() {
    const startDateInput = document.getElementById('sales-start-date');
    const endDateInput = document.getElementById('sales-end-date');
    if (!startDateInput || !endDateInput) return; // 保護

    const startDate = startDateInput.value;
    const endDate = endDateInput.value;

    if (startDate && endDate && startDate <= endDate) {
        // 先顯示載入中
        const overviewContent = document.getElementById('sales-overview-content');
        const chartsContainer = document.getElementById('sales-charts-container');
        const topDealsContent = document.getElementById('top-deals-content');

        if(overviewContent) overviewContent.innerHTML = '<div class="loading show"><div class="spinner"></div></div>';
        if(chartsContainer) chartsContainer.innerHTML = '<div class="loading show" style="grid-column: span 12;"><div class="spinner"></div><p>載入圖表中...</p></div>';
        if(topDealsContent) topDealsContent.innerHTML = '<div class="loading show"><div class="spinner"></div><p>載入成交列表...</p></div>';

        // 重新載入頁面數據
        loadSalesAnalysisPage(startDate, endDate);
    } else {
        showNotification('請選擇有效的開始和結束日期 (開始日期不能晚於結束日期)', 'warning');
    }
}

async function fetchAndRenderSalesData(startDate, endDate) {
    // 確保 DOM 元素存在
    const dateRangeDisplay = document.getElementById('sales-date-range-display');
    const overviewContent = document.getElementById('sales-overview-content');
    const chartsContainer = document.getElementById('sales-charts-container');
    const topDealsContent = document.getElementById('top-deals-content');

    if (!dateRangeDisplay || !overviewContent || !chartsContainer || !topDealsContent) {
        console.error('[Sales Analysis] 頁面必要元素缺失，無法渲染資料。');
        return;
    }


    try {
        const result = await authedFetch(`/api/sales-analysis?startDate=${startDate}&endDate=${endDate}`);
        if (!result.success || !result.data) throw new Error(result.error || '無法獲取分析數據');
        salesAnalysisData = result.data;

        // 更新日期範圍顯示
        const startDateDisplay = new Date(startDate + 'T00:00:00').toLocaleDateString('zh-TW');
        const endDateDisplay = new Date(endDate + 'T00:00:00').toLocaleDateString('zh-TW');
        dateRangeDisplay.textContent = `資料期間：${startDateDisplay} - ${endDateDisplay}`;

        // 渲染各個區塊
        renderSalesOverview(salesAnalysisData.overview);
        renderSalesCharts(salesAnalysisData);
        renderTopDealsTable(salesAnalysisData.topDeals);

    } catch (error) {
        if (error.message !== 'Unauthorized') {
            console.error('載入成交分析數據失敗:', error);
            overviewContent.innerHTML = ''; // 清空概覽區
            chartsContainer.innerHTML = `<div class="alert alert-error" style="grid-column: span 12;">載入圖表失敗: ${error.message}</div>`;
            topDealsContent.innerHTML = `<div class="alert alert-error">載入列表失敗: ${error.message}</div>`;
        }
    }
}

function renderSalesOverview(overview) {
    const container = document.getElementById('sales-overview-content');
    if (!container || !overview) return;
    const formatCurrency = (value) => (value || 0).toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }); // 增加保護
    const formatNumber = (value) => (value || 0).toLocaleString('zh-TW'); // 增加保護

    container.innerHTML = `
        <div class="stats-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));"> 
            <div class="stat-card green">
                <div class="stat-header">
                    <div class="stat-icon" style="background: var(--accent-green);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
                            <line x1="12" y1="1" x2="12" y2="23"></line>
                            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
                        </svg>
                    </div>
                    <div class="stat-label">總成交金額</div>
                </div>
                <div class="stat-content"><div class="stat-number">${formatCurrency(overview.totalWonValue)}</div></div>
            </div>
            <div class="stat-card blue">
                <div class="stat-header">
                    <div class="stat-icon" style="background: var(--accent-blue);">
                         <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
                            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                            <polyline points="22 4 12 14.01 9 11.01"></polyline>
                        </svg>
                    </div>
                    <div class="stat-label">總成交案件數</div>
                </div>
                <div class="stat-content"><div class="stat-number">${formatNumber(overview.totalWonDeals)} 件</div></div>
            </div>
            <div class="stat-card purple">
                <div class="stat-header">
                    <div class="stat-icon" style="background: var(--accent-purple);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
                           <line x1="19" y1="5" x2="5" y2="19"></line>
                           <circle cx="6.5" cy="6.5" r="2.5"></circle>
                           <circle cx="17.5" cy="17.5" r="2.5"></circle>
                        </svg>
                    </div>
                    <div class="stat-label">平均成交金額</div>
                </div>
                <div class="stat-content"><div class="stat-number">${formatCurrency(overview.averageDealValue)}</div></div>
            </div>
            <div class="stat-card orange">
                <div class="stat-header">
                    <div class="stat-icon" style="background: var(--accent-orange);">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20">
                            <circle cx="12" cy="12" r="10"></circle>
                            <polyline points="12 6 12 12 16 14"></polyline>
                        </svg>
                    </div>
                    <div class="stat-label">平均成交週期</div>
                </div>
                <div class="stat-content"><div class="stat-number">${formatNumber(overview.averageSalesCycleInDays)} 天</div></div>
            </div>
        </div>
    `;
}


function renderSalesCharts(data) {
    const container = document.getElementById('sales-charts-container');
    if (!container || !data) return;

    // 確保 chartData 存在
    const trendData = data.trendChartData || [];
    const sourceData = data.sourceAnalysis?.chartDataValue || [];
    const typeData = data.typeAnalysis?.chartDataValue || [];

    container.innerHTML = `
        <div class="dashboard-widget grid-col-4">
            <div class="widget-header"><h2 class="widget-title">成交金額趨勢 (月)</h2></div>
            <div id="sales-value-trend-chart" class="widget-content" style="height: 300px;"></div>
        </div>
        <div class="dashboard-widget grid-col-4">
            <div class="widget-header"><h2 class="widget-title">成交件數趨勢 (月)</h2></div>
            <div id="sales-count-trend-chart" class="widget-content" style="height: 300px;"></div>
        </div>
        <div class="dashboard-widget grid-col-4">
            <div class="widget-header"><h2 class="widget-title">平均成交週期趨勢 (月)</h2></div>
            <div id="sales-cycle-trend-chart" class="widget-content" style="height: 300px;"></div>
        </div>
        <div class="dashboard-widget grid-col-6" style="margin-top: 24px;">
            <div class="widget-header"><h2 class="widget-title">成交案件來源分析 (依金額)</h2></div>
            <div id="sales-source-value-chart" class="widget-content" style="height: 300px;"></div>
        </div>
        <div class="dashboard-widget grid-col-6" style="margin-top: 24px;">
            <div class="widget-header"><h2 class="widget-title">成交案件類型分析 (依金額)</h2></div>
            <div id="sales-type-value-chart" class="widget-content" style="height: 300px;"></div>
        </div>
    `;

    // 使用 setTimeout 確保 DOM 渲染完成
    setTimeout(() => {
        if (typeof Highcharts !== 'undefined' && typeof createThemedChart === 'function') {
            renderSalesTrendChart('sales-value-trend-chart', trendData, 'value', '成交金額');
            renderSalesTrendChart('sales-count-trend-chart', trendData, 'count', '成交件數');
            renderSalesCycleTrendChart('sales-cycle-trend-chart', trendData);
            renderSalesPieChart('sales-source-value-chart', sourceData, '來源金額');
            renderSalesPieChart('sales-type-value-chart', typeData, '類型金額');
        } else {
            console.error('[Sales Analysis] Highcharts 或 createThemedChart 未定義，無法渲染圖表。');
             // 可以在此處為每個圖表容器顯示錯誤訊息
             ['sales-value-trend-chart', 'sales-count-trend-chart', 'sales-cycle-trend-chart', 'sales-source-value-chart', 'sales-type-value-chart'].forEach(id => {
                 const chartContainer = document.getElementById(id);
                 if (chartContainer) chartContainer.innerHTML = '<div class="alert alert-error" style="text-align: center; padding: 10px;">圖表渲染功能異常</div>';
             });
        }
    }, 0);
}

// 渲染趨勢圖 (柱狀圖) - 已修改
function renderSalesTrendChart(chartId, trendData, dataKey, seriesName) {
    if (!trendData || !Array.isArray(trendData)) {
        console.warn(`[Sales Analysis] ${seriesName} 趨勢圖渲染失敗：無效的 trendData。`, trendData);
        const container = document.getElementById(chartId);
        if (container) container.innerHTML = '<div class="alert alert-warning" style="text-align: center; padding: 10px;">無趨勢資料</div>';
        return;
    }

    const categories = trendData.map(d => d.month || ''); // 保護
    const seriesData = trendData.map(d => d[dataKey] || 0); // 保護

    const specificOptions = {
        chart: { type: 'column' },
        title: { text: '' },
        xAxis: { categories: categories },
        yAxis: {
            title: { text: seriesName },
            allowDecimals: dataKey === 'value' // 金額允許小數
        },
        legend: { enabled: false },
        tooltip: { pointFormat: '{series.name}: <b>{point.y:,.0f}</b>' + (dataKey === 'value' ? ' 元' : ' 件') },
        series: [{
            name: seriesName,
            data: seriesData,
            // 顏色會自動從主題繼承 (第一個或第二個)
            // color: getHighchartsThemeOptions().colors[dataKey === 'value' ? 0 : 1] // 不再需要手動指定
        }]
    };
    createThemedChart(chartId, specificOptions);
}

// 渲染平均成交週期趨勢圖 (折線圖) - 已修改
function renderSalesCycleTrendChart(chartId, trendData) {
     if (!trendData || !Array.isArray(trendData)) {
        console.warn('[Sales Analysis] 平均週期趨勢圖渲染失敗：無效的 trendData。', trendData);
        const container = document.getElementById(chartId);
        if (container) container.innerHTML = '<div class="alert alert-warning" style="text-align: center; padding: 10px;">無週期資料</div>';
        return;
    }
    const categories = trendData.map(d => d.month || ''); // 保護
    const seriesData = trendData.map(d => d.avgSalesCycle || 0); // 保護

    const specificOptions = {
        chart: { type: 'line' },
        title: { text: '' },
        xAxis: { categories: categories },
        yAxis: {
            title: { text: '平均天數' },
            allowDecimals: false
        },
        legend: { enabled: false },
        tooltip: { pointFormat: '{series.name}: <b>{point.y} 天</b>' },
        series: [{
            name: '平均成交週期',
            data: seriesData,
            // 顏色會自動從主題繼承 (通常是第三個)
            // color: getHighchartsThemeOptions().colors[2] // 不再需要手動指定
        }]
    };
    createThemedChart(chartId, specificOptions);
}

// 渲染圓餅圖 - 已修改
function renderSalesPieChart(chartId, chartData, seriesName) {
     if (!chartData || !Array.isArray(chartData)) {
        console.warn(`[Sales Analysis] ${seriesName} 圓餅圖渲染失敗：無效的 chartData。`, chartData);
        const container = document.getElementById(chartId);
        if (container) container.innerHTML = '<div class="alert alert-warning" style="text-align: center; padding: 10px;">無資料</div>';
        return;
    }
    // 確保資料格式正確
    const formattedData = chartData.map(d => ({
        name: d.name || '未分類',
        y: d.y || 0
    }));

    const specificOptions = {
        chart: { type: 'pie' },
        title: { text: '' },
        tooltip: { pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b> ({point.y:,.0f} 元)' },
        plotOptions: {
            pie: {
                allowPointSelect: true,
                cursor: 'pointer',
                dataLabels: {
                    enabled: true,
                    format: '<b>{point.name}</b>: {point.percentage:.1f} %',
                    distance: 20,
                    // style 和 connectorColor 會從主題繼承
                },
                showInLegend: false
            }
        },
        series: [{ name: seriesName, data: formattedData }]
    };
    createThemedChart(chartId, specificOptions);
}

function renderTopDealsTable(deals) {
    const container = document.getElementById('top-deals-content');
    if (!container) return;
    if (!deals || deals.length === 0) {
        container.innerHTML = '<div class="alert alert-info" style="text-align:center;">此期間內沒有成交案件</div>';
        return;
    }
    const formatCurrency = (value) => (value || 0).toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 }); // 保護

    let html = `<table class="data-table"><thead><tr>
                    <th>機會名稱</th>
                    <th>客戶公司</th>
                    <th>負責業務</th>
                    <th>成交金額</th>
                    <th>成交日期</th>
                </tr></thead><tbody>`;
    deals.forEach(deal => {
        // 保護措施
        const oppId = deal.opportunityId || '';
        const oppName = deal.opportunityName || '(未命名)';
        const safeOppName = oppName.replace(/"/g, '&quot;'); // 處理引號即可
        const detailLink = oppId ? `<a href="#" class="text-link" onclick="event.preventDefault(); CRM_APP.navigateTo('opportunity-details', { opportunityId: '${oppId}' })"><strong>${safeOppName}</strong></a>` : `<strong>${safeOppName}</strong>`;

        html += `
            <tr>
                <td data-label="機會名稱">${detailLink}</td>
                <td data-label="客戶公司">${deal.customerCompany || '-'}</td>
                <td data-label="負責業務">${deal.assignee || '-'}</td>
                <td data-label="成交金額" style="text-align: right; font-weight: 600;">${formatCurrency(deal.numericValue)}</td>
                <td data-label="成交日期">${formatDateTime(deal.wonDate)}</td>
            </tr>`;
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

// 向主應用程式註冊此模組
if (window.CRM_APP) {
     if (!window.CRM_APP.pageModules) {
        window.CRM_APP.pageModules = {};
    }
    window.CRM_APP.pageModules['sales-analysis'] = loadSalesAnalysisPage;
} else {
    console.error('[Sales Analysis] CRM_APP 全域物件未定義，無法註冊頁面模組。');
}