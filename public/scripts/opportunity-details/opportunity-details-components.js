// views/scripts/opportunity-details/opportunity-details-components.js
// 職責：整合機會詳細頁面中所有「純顯示」與「可編輯資訊卡」的組件
// (V2 - 修正「關聯機會」使其可編輯與移除)

/**
 * 【修改】為新的機會資訊卡片注入「雙欄佈局」專屬樣式
 */
function _injectStylesForOppInfoCard() {
    const styleId = 'opportunity-info-card-styles';
    if (document.getElementById(styleId)) return;

    const style = document.createElement('style');
    style.id = styleId;
    style.innerHTML = `
        .opportunity-info-card {
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
            padding-bottom: var(--spacing-4);
            margin-bottom: var(--spacing-4);
            border-bottom: 1px solid var(--border-color);
        }
        
        /* --- 【新增】卡片主體雙欄佈局 --- */
        .info-card-body-grid {
            display: grid;
            grid-template-columns: 1fr 1fr; /* 左右 1:1 雙欄 */
            gap: var(--spacing-6) var(--spacing-8);
        }
        .info-col-left, .info-col-right {
            display: flex;
            flex-direction: column;
            gap: var(--spacing-5); /* 欄位內的垂直間距 */
        }
        @media (max-width: 900px) {
            .info-card-body-grid {
                grid-template-columns: 1fr; /* 在小螢幕上變回單欄 */
            }
        }
        /* --- 【新增結束】 --- */

        .info-item {
            display: flex;
            flex-direction: column;
        }
        .info-item .info-label {
            font-size: var(--font-size-sm);
            color: var(--text-muted);
            margin-bottom: var(--spacing-2);
            font-weight: 500;
        }
        .info-item .info-value {
            font-size: var(--font-size-base);
            font-weight: 600;
            color: var(--text-secondary);
            white-space: pre-wrap;
            word-break: break-word;
        }
        .info-item .info-value a {
            color: var(--accent-blue);
            text-decoration: none;
        }
        .info-item .info-value a:hover {
            text-decoration: underline;
        }

        /* 【新增】價值高亮樣式 */
        .info-item.value-highlight .info-value {
            font-size: var(--font-size-xl);
            font-weight: 700;
            color: var(--accent-green);
        }
        
        /* 【新增】用於種類/來源的標籤樣式 */
        .info-tag-value {
            display: inline-block;
            padding: 6px 14px;
            border-radius: var(--rounded-full);
            font-size: var(--font-size-sm);
            font-weight: 600;
            background-color: var(--primary-bg);
            border: 1px solid var(--border-color);
            color: var(--text-secondary);
            width: fit-content;
        }
        /* 帶有顏色的標籤 */
        .info-tag-value[data-color] {
            /* 使用 CSS 變數 --brand-color (在 render 時傳入) */
            background-color: color-mix(in srgb, var(--brand-color, var(--text-muted)) 20%, transparent);
            color: var(--brand-color, var(--text-muted));
            border-color: var(--brand-color, var(--text-muted));
        }


        .notes-section {
            grid-column: 1 / -1; /* 橫跨兩欄 */
            margin-top: var(--spacing-5);
            padding-top: var(--spacing-5);
            border-top: 1px solid var(--border-color);
        }

        /* 【*** 程式碼修改點：新增大量樣式 ***】 */

        /* 藥丸式選項樣式 (銷售情報) */
        .info-options-item {
            display: flex;
            flex-direction: column; /* 【修改】改為垂直，標籤在上方 */
            gap: var(--spacing-3); /* 標籤和選項組的間距 */
        }
        .info-options-label {
            font-size: var(--font-size-sm);
            color: var(--text-muted);
            font-weight: 500;
            flex-shrink: 0;
            /* 移除固定寬度 */
        }
        .info-options-group {
            display: flex;
            flex-wrap: wrap;
            gap: var(--spacing-2);
        }
        .info-option {
            padding: 6px 14px;
            border-radius: var(--rounded-full);
            font-size: var(--font-size-sm);
            font-weight: 500;
            background-color: var(--primary-bg);
            color: var(--text-muted);
            border: 1px solid var(--border-color);
            transition: all 0.2s ease;
        }
        .info-option.selected {
            background-color: color-mix(in srgb, var(--accent-green) 20%, transparent);
            color: var(--accent-green);
            border-color: var(--accent-green);
            font-weight: 600;
            box-shadow: 0 0 10px color-mix(in srgb, var(--accent-green) 20%, transparent);
        }
        
        /* 編輯模式下的 "亮燈標籤" (Pill) 樣式 */
        .pills-container {
            background: var(--primary-bg);
            padding: var(--spacing-4);
            border-radius: var(--rounded-lg);
            border: 1px solid var(--border-color);
        }
        .info-option-pill {
            padding: 6px 14px;
            border-radius: var(--rounded-full);
            font-size: var(--font-size-sm);
            font-weight: 500;
            background-color: var(--secondary-bg);
            color: var(--text-muted);
            border: 1px solid var(--border-color);
            transition: all 0.2s ease;
            cursor: pointer;
            user-select: none;
            display: inline-flex;
            align-items: center;
            gap: var(--spacing-2);
        }
        .info-option-pill:hover {
            background-color: var(--glass-bg);
            color: var(--text-primary);
        }
        .info-option-pill.selected {
            background-color: color-mix(in srgb, var(--accent-green) 25%, transparent);
            color: var(--accent-green);
            border-color: var(--accent-green);
            font-weight: 600;
            box-shadow: 0 0 10px color-mix(in srgb, var(--accent-green) 20%, transparent);
        }
        
        /* 數量計數器樣式 */
        .pill-quantity {
            display: inline-block;
            padding: 0px 6px;
            font-size: 0.75rem;
            font-weight: 700;
            background-color: color-mix(in srgb, var(--accent-green) 80%, black 20%);
            color: white;
            border-radius: var(--rounded-md);
            cursor: pointer;
            transition: transform 0.2s ease, background-color 0.2s ease;
        }
        .pill-quantity:hover {
            transform: scale(1.1);
            background-color: var(--accent-green);
        }

        /* 手動覆蓋 Checkbox 樣式 */
        .info-item.value-manual-override {
            margin-top: var(--spacing-3);
            font-size: var(--font-size-sm);
            color: var(--text-secondary);
        }
        .info-item.value-manual-override label {
            display: flex;
            align-items: center;
            gap: var(--spacing-2);
            cursor: pointer;
        }
        .info-item.value-manual-override input[type="checkbox"] {
            width: 16px;
            height: 16px;
            accent-color: var(--accent-orange);
        }
        
        /* 價值輸入框 Wrapper */
        .value-input-wrapper input[type="text"]:disabled,
        .value-input-wrapper input[type="text"]:read-only {
            background: var(--primary-bg);
            color: var(--text-muted);
            cursor: not-allowed;
            opacity: 0.8;
        }

        /* 【*** 樣式新增結束 ***】 */
    `;
    document.head.appendChild(style);
}


// 1. 頂部資訊卡片模組 (已升級為包含檢視與編輯模式)
const OpportunityInfoCard = (() => {

    // 渲染主函式，會根據模式呼叫對應的渲染函式
    function render(opp) {
        _injectStylesForOppInfoCard();
        const container = document.getElementById('opportunity-info-card-container');
        if (!container) return;

        container.innerHTML = `
            <div id="opportunity-info-display-mode">
                ${_renderDisplayMode(opp)}
            </div>
            <div id="opportunity-info-edit-mode" style="display: none;">
                ${_renderEditMode(opp)}
            </div>
        `;
    }

    /**
     * 【*** 程式碼修改點：重寫 _renderOptionsGroup (顯示所有標籤) ***】
     * 輔助函式：渲染藥丸式選項組，使其支援複選與 JSON 格式
     * @param {string} configKey - 系統設定的 Key (e.g., '可能下單規格')
     * @param {string} selectedValue - 儲存的值 (可能是 "規格A,規格B" 或 '{"product_a": 5, "product_b": 1}')
     * @param {string} label - 顯示的標籤
     */
    function _renderOptionsGroup(configKey, selectedValue, label) {
        const systemConfig = window.CRM_APP ? window.CRM_APP.systemConfig : {};
        const options = systemConfig[configKey] || [];
        
        // 如果系統設定中沒有定義這個類別，則不顯示
        if (options.length === 0) {
             return `
                <div class="info-options-item">
                    <div class="info-options-label">${label}</div>
                    <div class="info-value">-</div>
                </div>
            `;
        }

        const selectedMap = new Map();

        // 1. Populate selectedMap from selectedValue
        try {
            // 嘗試解析新版 JSON
            const parsedJson = JSON.parse(selectedValue);
            if (parsedJson && typeof parsedJson === 'object') {
                for (const [key, quantity] of Object.entries(parsedJson)) {
                    if (quantity > 0) { // 只添加數量大於 0 的
                        selectedMap.set(key, quantity);
                    }
                }
            } else {
                // 雖然是 JSON，但不是物件 (例如 "null" 或 "true")，拋出錯誤
                throw new Error('Not an object, fallback to string parsing');
            }
        } catch (e) {
            // 向下相容：解析舊版 "規格A,規格B"
            if (selectedValue && typeof selectedValue === 'string') {
                selectedValue.split(',').map(s => s.trim()).filter(Boolean).forEach(specKey => {
                    selectedMap.set(specKey, 1); // 舊格式一律視為 1
                });
            }
        }

        // 2. 遍歷*所有*在系統設定中定義的選項
        let allItemsHtml = '';
        options.forEach(opt => {
            const isSelected = selectedMap.has(opt.value);
            const quantity = selectedMap.get(opt.value) || 0;
            const behavior = opt.value3 || 'boolean'; // 讀取 H 欄的行為模式
            const selectedClass = isSelected ? 'selected' : '';
            
            let displayText = opt.note || opt.value;
            
            // 只有當 (已選中) 且 (行為模式是 allow_quantity) 且 (數量大於0) 時
            // 才顯示數量。布林型的 (x1) 會被隱藏。
            if (isSelected && behavior === 'allow_quantity' && quantity > 0) {
                displayText = `${displayText} (x${quantity})`;
            }

            allItemsHtml += `<span class="info-option ${selectedClass}">${displayText}</span>`;
        });

        // 3. 渲染
        return `
            <div class="info-options-item">
                <div class="info-options-label">${label}</div>
                <div class="info-options-group">${allItemsHtml || '-'}</div>
            </div>
        `;
    }


    // 渲染「檢視模式」的 HTML
    function _renderDisplayMode(opp) {
        const systemConfig = window.CRM_APP ? window.CRM_APP.systemConfig : {};
        const getNote = (configKey, value) => (systemConfig[configKey] || []).find(i => i.value === value)?.note || value || '-';
        
        const typeConfig = (systemConfig['機會種類'] || []).find(i => i.value === opp.opportunityType);
        const typeColor = typeConfig?.color || 'var(--text-muted)';
        const typeNote = typeConfig?.note || opp.opportunityType || '-';

        const sourceNote = getNote('機會來源', opp.opportunitySource);

        const encodedCompanyName = encodeURIComponent(opp.customerCompany);
        const formatCurrency = (value) => {
            if (!value) return '-';
            const num = parseFloat(String(value).replace(/,/g, ''));
            if (isNaN(num)) return '-';
            return num.toLocaleString('zh-TW', { style: 'currency', currency: 'TWD', minimumFractionDigits: 0 });
        };
        const formatDate = (dateString) => {
            if (!dateString) return '-';
            try {
                const date = new Date(dateString);
                if (isNaN(date.getTime()) || date.getTime() === 0) return '-';
                return date.toISOString().split('T')[0];
            } catch (e) { return '-'; }
        };

        // 【*** 程式碼修改點：新增 valueTypeBadge ***】
        let valueTypeBadge = '';
        if (opp.opportunityValueType === 'manual') {
            valueTypeBadge = `<span class="card-tag" style="background: var(--accent-orange); color: white; font-size: 0.7rem; margin-left: 8px;" title="此為手動輸入的價值">手動</span>`;
        } else {
            // 預設為 'auto' 或空值
            valueTypeBadge = `<span class="card-tag" style="background: var(--accent-green); color: white; font-size: 0.7rem; margin-left: 8px;" title="根據「可能下單規格」自動估算">估算</span>`;
        }
        // 【*** 修改結束 ***】

        // 【修改】使用新的雙欄佈局
        return `
            <div class="info-card-header">
                <h2 class="widget-title" style="margin: 0;">機會核心資訊</h2>
                <button class="action-btn small warn" onclick="OpportunityInfoCardEvents.toggleEditMode(true)">✏️ 編輯</button>
            </div>

            <div class="info-card-body-grid">
                
                <div class="info-col-left">
                    <div class="info-item">
                        <span class="info-label">客戶公司</span>
                        <span class="info-value"><a href="#" onclick="event.preventDefault(); CRM_APP.navigateTo('company-details', { companyName: '${encodedCompanyName}' })">${opp.customerCompany}</a></span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">負責業務</span>
                        <span class="info-value">${opp.assignee}</span>
                    </div>
                    <div class="info-item value-highlight">
                        <span class="info-label">機會價值</span>
                        <span class="info-value">${formatCurrency(opp.opportunityValue)} ${valueTypeBadge}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">預計結案日期</span>
                        <span class="info-value">${formatDate(opp.expectedCloseDate)}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">機會種類</span>
                        <span class="info-tag-value" data-color style="--brand-color: ${typeColor};">${typeNote}</span>
                    </div>
                    <div class="info-item">
                        <span class="info-label">機會來源</span>
                        <span class="info-tag-value">${sourceNote}</span>
                    </div>
                </div>

                <div class="info-col-right">
                    ${_renderOptionsGroup('下單機率', opp.orderProbability, '下單機率')}
                    
                    ${_renderOptionsGroup('可能下單規格', opp.potentialSpecification, '可能下單規格')}
                    
                    ${_renderOptionsGroup('可能銷售管道', opp.salesChannel, '可能銷售管道')}
                    ${_renderOptionsGroup('設備規模', opp.deviceScale, '設備規模')}
                </div>

                <div class="notes-section">
                    <div class="info-item">
                        <span class="info-label">備註</span>
                        <span class="info-value">${opp.notes || '-'}</span>
                    </div>
                </div>

            </div>
        `;
    }

    // 渲染「編輯模式」的 HTML 骨架
    function _renderEditMode(opp) {
        // 實際的表單內容將由 events.js 動態填入，這裡只提供骨架
        return `
            <div class="info-card-header">
                <h2 class="widget-title" style="margin: 0;">編輯核心資訊</h2>
                <div>
                    <button class="action-btn small secondary" onclick="OpportunityInfoCardEvents.toggleEditMode(false)">取消</button>
                    <button class="action-btn small primary" onclick="OpportunityInfoCardEvents.save()">💾 儲存</button>
                </div>
            </div>
            <div id="opportunity-info-edit-form-container">
                <div class="loading show"><div class="spinner"></div></div>
            </div>
        `;
    }

    return { render };
})();


// 2. 關聯機會模組 (母/子機會)
const OpportunityAssociatedOpps = (() => {

    /**
     * 【*** 新增：移除關聯的函式 ***】
     * @param {string} opportunityId - 當前機會的 ID
     * @param {number} rowIndex - 當前機會的 RowIndex
     */
    async function _handleRemoveParentLink(opportunityId, rowIndex) {
        showConfirmDialog('您確定要移除此母機會關聯嗎？', async () => {
            showLoading('正在移除關聯...');
            try {
                // 呼叫 API，將 parentOpportunityId 設為空字串
                const result = await authedFetch(`/api/opportunities/${rowIndex}`, {
                    method: 'PUT',
                    body: JSON.stringify({ 
                        parentOpportunityId: '', // 設為空
                        modifier: getCurrentUser() 
                    })
                });

                if (result.success) {
                    // authedFetch 會自動處理刷新和通知
                } else {
                    throw new Error(result.error || '移除失敗');
                }
            } catch (error) {
                if (error.message !== 'Unauthorized') {
                    showNotification(`移除關聯失敗: ${error.message}`, 'error');
                }
            } finally {
                hideLoading(); // authedFetch 會處理，但加一層保險
            }
        });
    }


    /**
     * 【*** 修改：重寫 render 函式 ***】
     */
    function render(details) {
        const container = document.getElementById('associated-opportunities-list');
        const addButton = document.getElementById('add-associated-opportunity-btn');
        if (!container || !addButton) {
            console.error('[OppComponents] 找不到 #associated-opportunities-list 或 #add-associated-opportunity-btn');
            return;
        }

        const { opportunityInfo, parentOpportunity, childOpportunities } = details;
        let html = '';

        // --- 按鈕邏輯 ---
        // 永遠顯示按鈕
        addButton.style.display = 'flex'; 
        // 永遠綁定開啟 Modal 的事件
        addButton.onclick = () => showLinkOpportunityModal(opportunityInfo.opportunityId, opportunityInfo.rowIndex);

        if (parentOpportunity) {
            // 1. 如果有母機會
            
            // 1a. 顯示母機會資訊
            html += `
                <div class="summary-item" style="margin-bottom: 1rem;">
                    <span class="summary-label">母機會</span>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="summary-value" style="font-size: 1rem;">
                            <a href="#" class="text-link" onclick="event.preventDefault(); CRM_APP.navigateTo('opportunity-details', { opportunityId: '${parentOpportunity.opportunityId}' })">${parentOpportunity.opportunityName}</a>
                        </span>
                        <button class="action-btn small danger" style="padding: 2px 6px; font-size: 0.7rem;" 
                                onclick="OpportunityAssociatedOpps._handleRemoveParentLink('${opportunityInfo.opportunityId}', ${opportunityInfo.rowIndex})" 
                                title="移除母機會關聯">
                            移除
                        </button>
                    </div>
                </div>
            `;
            // 1c. 修改主要按鈕的文字
            addButton.textContent = '✏️ 變更母機會';
            
        } else {
            // 2. 如果沒有母機會
            // 保持主要按鈕的預設文字
            addButton.textContent = '+ 設定母機會';
        }

        // --- 子機會邏輯 (不變) ---
        if (childOpportunities && childOpportunities.length > 0) {
            html += `<div class="summary-item"><span class="summary-label">子機會 (${childOpportunities.length})</span></div>`;
            html += `<ul style="list-style: none; padding-left: 1rem; margin-top: 0.5rem;">`;
            childOpportunities.forEach(child => {
                html += `<li style="margin-bottom: 0.5rem;"><a href="#" class="text-link" onclick="event.preventDefault(); CRM_APP.navigateTo('opportunity-details', { opportunityId: '${child.opportunityId}' })">${child.opportunityName}</a></li>`;
            });
            html += `</ul>`;
        }

        // --- 空白狀態邏輯 (修改) ---
        // 只有在沒有母機會，也沒有子機會時，才顯示提示
        if (!parentOpportunity && (!childOpportunities || childOpportunities.length === 0)) {
            html = '<div class="alert alert-info">尚無關聯機會。</div>';
        }

        container.innerHTML = html;
    }

    // 返回公開的 API
    return { 
        render,
        _handleRemoveParentLink // 將函式掛載到模組上，以便 onclick 可以呼叫
    };
})();