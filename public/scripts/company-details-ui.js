// views/scripts/company-details-ui.js
// 職責：渲染「公司詳細資料頁」的所有UI元件

/**
 * 為新的公司資訊卡片注入專屬樣式
 */
function _injectStylesForInfoCard() {
    const styleId = 'company-info-card-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
        .company-info-card {
            background-color: var(--secondary-bg);
            padding: var(--spacing-6);
            border-radius: var(--rounded-xl);
            border: 1px solid var(--border-color);
            margin-bottom: var(--spacing-6);
        }
        .info-card-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: var(--spacing-4);
            padding-bottom: var(--spacing-4);
            border-bottom: 1px solid var(--border-color);
        }
        /* --- 【修改】核心指標網格樣式 --- */
        .core-info-grid {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: var(--spacing-6);
            text-align: center;
            margin-bottom: var(--spacing-5);
            padding-bottom: var(--spacing-5);
            border-bottom: 1px solid var(--border-color);
        }
        .core-info-item {
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
        }
        .core-info-item .info-label {
            font-size: var(--font-size-xs);
            color: var(--text-muted);
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.5px;
        }
        /* --- 【新增】核心指標的 Badge 樣式 --- */
        .core-info-badge {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 6px 16px;
            border-radius: 20px; /* 圓角造型 */
            font-size: var(--font-size-base);
            font-weight: 700;
            color: white; /* 文字預設白色 */
            min-width: 100px; /* 固定最小寬度讓排版整齊 */
            background-color: var(--badge-color, var(--text-muted)); /* 使用 CSS 變數 */
            box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
            border: 1px solid rgba(255, 255, 255, 0.1);
            transition: transform 0.2s ease;
        }
        .core-info-badge:hover {
            transform: translateY(-2px);
        }
        /* --- 【修改】公司簡介樣式 (移除收合功能) --- */
        .company-introduction-section .info-label {
            font-size: var(--font-size-sm);
            color: var(--text-muted);
            margin-bottom: var(--spacing-3);
            font-weight: 600;
        }
        .company-introduction-content {
            font-size: var(--font-size-base);
            color: var(--text-secondary);
            line-height: 1.8;
            white-space: pre-wrap;
            /* 移除 max-height 和 overflow */
            background-color: var(--primary-bg);
            padding: var(--spacing-4);
            border-radius: var(--rounded-lg);
            border: 1px solid var(--border-color);
        }
        
        .additional-info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: var(--spacing-4);
            margin-top: var(--spacing-5);
            padding-top: var(--spacing-5);
            border-top: 1px solid var(--border-color);
        }
        .additional-info-item {
            display: flex;
            flex-direction: column;
        }
        .additional-info-item .info-label {
            font-size: var(--font-size-sm);
            color: var(--text-muted);
            margin-bottom: var(--spacing-1);
        }
        .additional-info-item .info-value {
            font-size: var(--font-size-base);
            color: var(--text-secondary);
            font-weight: 500;
        }
    `;
    document.head.appendChild(style);
}


/**
 * 渲染公司基本資訊卡片 (V3 - 視覺優化版)
 * @param {object} companyInfo - 公司資料物件
 * @returns {string} HTML 字串
 */
function renderCompanyInfoCard(companyInfo) {
    _injectStylesForInfoCard(); // 注入樣式

    if (!companyInfo) return `<div class="company-info-card"><div class="alert alert-warning">找不到公司基本資料</div></div>`;

    const encodedCompanyName = encodeURIComponent(companyInfo.companyName);
    
    if (companyInfo.isPotential) {
        return `
        <div class="company-info-card">
             <div class="widget-header" style="border-bottom: none; padding-bottom: 0; margin-bottom: 0;">
                <h2 class="widget-title">公司基本資料 (潛在)</h2>
             </div>
             <div class="alert alert-info">此公司來自潛在客戶名單，尚未建立正式檔案。請先將其任一潛在聯絡人升級為機會案件，系統將自動建立公司檔案。</div>
        </div>`;
    }
    
    const systemConfig = window.CRM_APP.systemConfig;
    
    // --- 【新增】取得設定物件 (包含顏色) ---
    const getConfigItem = (configKey, value) => {
        const item = (systemConfig[configKey] || []).find(i => i.value === value);
        return {
            text: item?.note || value || '-',
            color: item?.color || '#64748b' // 若無設定顏色，使用預設灰藍色
        };
    };
    
    const typeInfo = getConfigItem('公司類型', companyInfo.companyType);
    const stageInfo = getConfigItem('客戶階段', companyInfo.customerStage);
    const ratingInfo = getConfigItem('互動評級', companyInfo.engagementRating);

    // --- 【修改】公司簡介直接顯示完整內容 ---
    const introductionContent = companyInfo.introduction || '尚無公司簡介。';

    return `
        <div class="company-info-card" id="company-info-card-container">
            <div id="company-info-display-mode">
                <div class="info-card-header">
                    <h2 class="widget-title" style="margin: 0;">${companyInfo.companyName}</h2>
                    <div id="company-info-buttons">
                        <button class="action-btn small warn" onclick="toggleCompanyEditMode(true)">✏️ 編輯</button>
                    </div>
                </div>

                <div class="core-info-grid">
                    <div class="core-info-item">
                        <div class="info-label">公司類型</div>
                        <div class="core-info-badge" style="--badge-color: ${typeInfo.color}">
                            ${typeInfo.text}
                        </div>
                    </div>
                    <div class="core-info-item">
                        <div class="info-label">客戶階段</div>
                        <div class="core-info-badge" style="--badge-color: ${stageInfo.color}">
                            ${stageInfo.text}
                        </div>
                    </div>
                    <div class="core-info-item">
                        <div class="info-label">互動評級</div>
                        <div class="core-info-badge" style="--badge-color: ${ratingInfo.color}">
                            ${ratingInfo.text}
                        </div>
                    </div>
                </div>

                <div class="company-introduction-section">
                    <div class="info-label">公司簡介</div>
                    <div class="company-introduction-content">${introductionContent}</div>
                </div>

                <div class="additional-info-grid">
                    <div class="additional-info-item">
                        <div class="info-label">電話</div>
                        <div class="info-value">${companyInfo.phone || '-'}</div>
                    </div>
                     <div class="additional-info-item">
                        <div class="info-label">縣市</div>
                        <div class="info-value">${companyInfo.county || '-'}</div>
                    </div>
                    <div class="additional-info-item" style="grid-column: span 2;">
                        <div class="info-label">地址</div>
                        <div class="info-value">${companyInfo.address || '-'}</div>
                    </div>
                </div>
            </div>

            <div id="company-info-edit-mode" style="display: none;">
                </div>
        </div>
    `;
}

// ====================================================================
// 以下為詳細頁面中其他元件的渲染函式 (保持不變)
// ====================================================================

function renderCompanyInteractionsTab(interactions, companyInfo) {
    // 實際的渲染邏輯由 CompanyInteractions 模組處理
}

function renderCompanyFullDetails(companyInfo) {
    // 略 (保持原樣)
}

function renderCompanyOpportunitiesTable(opportunities) {
    if (!opportunities || opportunities.length === 0) return '<div class="alert alert-info" style="text-align:center;">該公司尚無相關機會案件</div>';
    if (typeof renderOpportunitiesTable === 'function') {
        return renderOpportunitiesTable(opportunities);
    }
    return '<div class="alert alert-warning">機會列表渲染函式不可用</div>';
}

function renderCompanyContactsTable(contacts) {
    if (!contacts || contacts.length === 0) return '<div class="alert alert-info" style="text-align:center;">該公司尚無已建檔的聯絡人</div>';
    
    let tableHTML = `<table class="data-table"><thead><tr><th>姓名</th><th>職位</th><th>部門</th><th>手機</th><th>公司電話</th><th>Email</th><th>操作</th></tr></thead><tbody>`;

    contacts.forEach(contact => {
        const contactJsonString = JSON.stringify(contact).replace(/'/g, "&apos;");
        tableHTML += `
            <tr>
                <td data-label="姓名"><strong>${contact.name || '-'}</strong></td>
                <td data-label="職位">${contact.position || '-'}</td>
                <td data-label="部門">${contact.department || '-'}</td>
                <td data-label="手機">${contact.mobile || '-'}</td>
                <td data-label="公司電話">${contact.phone || '-'}</td>
                <td data-label="Email">${contact.email || '-'}</td>
                <td data-label="操作">
                    <button class="action-btn small warn" onclick='showEditContactModal(${contactJsonString})'>✏️ 編輯</button>
                </td>
            </tr>
        `;
    });

    tableHTML += '</tbody></table>';
    return tableHTML;
}