// views/scripts/opportunity-details/opportunity-details-components.js
// 職責：整合機會詳細頁面中所有「純顯示」與「可編輯資訊卡」的組件
// (V6 - 支援分類群組樣式 + 雙欄獨立流動佈局)

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
        
        /* --- 【修改】雙欄獨立佈局 (非 Grid) --- */
        .info-card-body-layout {
            display: flex;
            gap: var(--spacing-8);
            align-items: flex-start; /* 頂部對齊，高度互不影響 */
        }
        .info-col {
            flex: 1;
            display: flex;
            flex-direction: column;
            gap: var(--spacing-5);
            min-width: 0; /* 防止內容撐爆 */
        }
        
        @media (max-width: 900px) {
            .info-card-body-layout {
                flex-direction: column; /* 手機版變單欄堆疊 */
            }
        }

        .info-item {
            display: flex;
            flex-direction: column;
            width: 100%;
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

        .info-item.value-highlight .info-value {
            font-size: var(--font-size-xl);
            font-weight: 700;
            color: var(--accent-green);
        }
        
        /* 標籤樣式 (顯示模式) */
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
        .info-tag-value[data-color] {
            background-color: color-mix(in srgb, var(--brand-color, var(--text-muted)) 20%, transparent);
            color: var(--brand-color, var(--text-muted));
            border-color: var(--brand-color, var(--text-muted));
        }

        .notes-section {
            margin-top: var(--spacing-5);
            padding-top: var(--spacing-5);
            border-top: 1px solid var(--border-color);
            width: 100%;
        }

        /* --- Pills 容器樣式 --- */
        .pills-container {
            background: var(--primary-bg);
            padding: var(--spacing-4);
            border-radius: var(--rounded-lg);
            border: 1px solid var(--border-color);
            /* 移除 flex，因為內部有分組標題區塊 */
        }
        /* 單選按鈕容器 (如負責業務) 保持 Flex */
        .pills-container.single-select-container {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }

        /* --- 【新增】分類群組樣式 --- */
        .spec-category-group {
            margin-bottom: 12px;
        }
        .spec-category-group:last-child {
            margin-bottom: 0;
        }
        .spec-category-title {
            font-size: 0.8rem;
            font-weight: 700;
            color: var(--text-muted);
            margin-bottom: 6px;
            padding-left: 2px;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            display: flex;
            align-items: center;
            gap: 4px;
        }
        .spec-category-title::after {
            content: '';
            flex-grow: 1;
            height: 1px;
            background-color: var(--border-color);
            opacity: 0.5;
        }
        .spec-pills-wrapper {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
        }
        /* --- 新增結束 --- */

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
        /* 複選樣式 (綠色) */
        .info-option-pill.selected {
            background-color: color-mix(in srgb, var(--accent-green) 25%, transparent);
            color: var(--accent-green);
            border-color: var(--accent-green);
            font-weight: 600;
            box-shadow: 0 0 10px color-mix(in srgb, var(--accent-green) 20%, transparent);
        }
        /* 單選樣式 (藍色) */
        .info-option-pill.single-select.selected {
            background-color: color-mix(in srgb, var(--accent-blue) 25%, transparent);
            color: var(--accent-blue);
            border-color: var(--accent-blue);
            box-shadow: 0 0 10px color-mix(in srgb, var(--accent-blue) 20%, transparent);
        }
        
        .pill-quantity {
            display: inline-block;
            padding: 0px 6px;
            font-size: 0.75rem;
            font-weight: 700;
            background-color: color-mix(in srgb, var(--accent-green) 80%, black 20%);
            color: white;
            border-radius: var(--rounded-md);
            cursor: pointer;
            transition: transform 0.2s ease;
        }
        .pill-quantity:hover {
            transform: scale(1.1);
        }

        /* --- 手動覆蓋 checkbox 樣式 --- */
        .manual-override-row {
            margin-top: 8px;
            width: 100%;
        }
        .manual-override-label {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: var(--font-size-sm);
            color: var(--text-secondary);
            cursor: pointer;
            white-space: normal; /* 允許換行 */
            line-height: 1.5;
        }
        .manual-override-label input[type="checkbox"] {
            width: 16px;
            height: 16px;
            accent-color: var(--accent-orange);
            flex-shrink: 0;
            margin-top: 2px;
        }
        
        .value-input-wrapper input[type="text"]:disabled,
        .value-input-wrapper input[type="text"]:read-only {
            background: var(--primary-bg);
            color: var(--text-muted);
            cursor: not-allowed;
            opacity: 0.8;
        }
        
        /* 顯示模式的選項樣式 */
        .info-options-item { display: flex; flex-direction: column; gap: var(--spacing-3); }
        .info-options-label { font-size: var(--font-size-sm); color: var(--text-muted); font-weight: 500; }
        .info-options-group { display: flex; flex-wrap: wrap; gap: var(--spacing-2); }
        .info-option {
            padding: 6px 14px; border-radius: var(--rounded-full);
            font-size: var(--font-size-sm); font-weight: 500;
            background-color: var(--primary-bg); color: var(--text-muted);
            border: 1px solid var(--border-color); transition: all 0.2s ease;
        }
        .info-option.selected {
            background-color: color-mix(in srgb, var(--accent-green) 20%, transparent);
            color: var(--accent-green); border-color: var(--accent-green); font-weight: 600;
        }
    `;
    document.head.appendChild(style);
}


const OpportunityInfoCard = (() => {

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

    function _renderOptionsGroup(configKey, selectedValue, label) {
        const systemConfig = window.CRM_APP ? window.CRM_APP.systemConfig : {};
        const options = systemConfig[configKey] || [];
        if (options.length === 0) {
             return `<div class="info-options-item"><div class="info-options-label">${label}</div><div class="info-value">-</div></div>`;
        }

        const selectedMap = new Map();
        try {
            const parsedJson = JSON.parse(selectedValue);
            if (parsedJson && typeof parsedJson === 'object') {
                for (const [key, quantity] of Object.entries(parsedJson)) {
                    if (quantity > 0) selectedMap.set(key, quantity);
                }
            } else { throw new Error(); }
        } catch (e) {
            if (selectedValue && typeof selectedValue === 'string') {
                selectedValue.split(',').map(s => s.trim()).filter(Boolean).forEach(specKey => {
                    selectedMap.set(specKey, 1);
                });
            }
        }

        let allItemsHtml = '';
        options.forEach(opt => {
            const isSelected = selectedMap.has(opt.value);
            const quantity = selectedMap.get(opt.value) || 0;
            const behavior = opt.value3 || 'boolean';
            const selectedClass = isSelected ? 'selected' : '';
            let displayText = opt.note || opt.value;
            if (isSelected && behavior === 'allow_quantity' && quantity > 0) {
                displayText = `${displayText} (x${quantity})`;
            }
            if (isSelected) {
                 allItemsHtml += `<span class="info-option ${selectedClass}">${displayText}</span>`;
            }
        });
        
        if (allItemsHtml === '') allItemsHtml = '<span class="info-value">-</span>';

        return `
            <div class="info-options-item">
                <div class="info-options-label">${label}</div>
                <div class="info-options-group">${allItemsHtml}</div>
            </div>
        `;
    }

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

        let valueTypeBadge = '';
        if (opp.opportunityValueType === 'manual') {
            valueTypeBadge = `<span class="card-tag" style="background: var(--accent-orange); color: white; font-size: 0.7rem; margin-left: 8px;" title="此為手動輸入的價值">手動</span>`;
        } else {
            valueTypeBadge = `<span class="card-tag" style="background: var(--accent-green); color: white; font-size: 0.7rem; margin-left: 8px;" title="根據「可能下單規格」自動估算">估算</span>`;
        }

        // 【修改】使用雙欄 (info-col) 佈局，確保左右高度獨立
        return `
            <div class="info-card-header">
                <h2 class="widget-title" style="margin: 0;">機會核心資訊</h2>
                <button class="action-btn small warn" onclick="OpportunityInfoCardEvents.toggleEditMode(true)">✏️ 編輯</button>
            </div>

            <div class="info-card-body-layout">
                <div class="info-col">
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

                <div class="info-col">
                    ${_renderOptionsGroup('下單機率', opp.orderProbability, '下單機率').match(/<div class="info-options-group">[\s\S]*?<\/div>/) ? `<div class="info-item"><div class="info-options-label">下單機率</div>${_renderOptionsGroup('下單機率', opp.orderProbability, '').match(/<div class="info-options-group">[\s\S]*?<\/div>/)[0]}</div>` : ''}
                    
                    ${_renderOptionsGroup('可能下單規格', opp.potentialSpecification, '可能下單規格').match(/<div class="info-options-group">[\s\S]*?<\/div>/) ? `<div class="info-item"><div class="info-options-label">可能下單規格</div>${_renderOptionsGroup('可能下單規格', opp.potentialSpecification, '').match(/<div class="info-options-group">[\s\S]*?<\/div>/)[0]}</div>` : ''}
                    
                    ${_renderOptionsGroup('可能銷售管道', opp.salesChannel, '可能銷售管道').match(/<div class="info-options-group">[\s\S]*?<\/div>/) ? `<div class="info-item"><div class="info-options-label">可能銷售管道</div>${_renderOptionsGroup('可能銷售管道', opp.salesChannel, '').match(/<div class="info-options-group">[\s\S]*?<\/div>/)[0]}</div>` : ''}
                    
                    ${_renderOptionsGroup('設備規模', opp.deviceScale, '設備規模').match(/<div class="info-options-group">[\s\S]*?<\/div>/) ? `<div class="info-item"><div class="info-options-label">設備規模</div>${_renderOptionsGroup('設備規模', opp.deviceScale, '').match(/<div class="info-options-group">[\s\S]*?<\/div>/)[0]}</div>` : ''}
                </div>
            </div>

            <div class="notes-section">
                <div class="info-item">
                    <span class="info-label">備註</span>
                    <span class="info-value">${opp.notes || '-'}</span>
                </div>
            </div>
        `;
    }

    function _renderEditMode(opp) {
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


const OpportunityAssociatedOpps = (() => {
    async function _handleRemoveParentLink(opportunityId, rowIndex) {
        showConfirmDialog('您確定要移除此母機會關聯嗎？', async () => {
            showLoading('正在移除關聯...');
            try {
                const result = await authedFetch(`/api/opportunities/${rowIndex}`, {
                    method: 'PUT',
                    body: JSON.stringify({ 
                        parentOpportunityId: '',
                        modifier: getCurrentUser() 
                    })
                });
                if (!result.success) throw new Error(result.error || '移除失敗');
            } catch (error) {
                if (error.message !== 'Unauthorized') showNotification(`移除關聯失敗: ${error.message}`, 'error');
            } finally {
                hideLoading();
            }
        });
    }

    function render(details) {
        const container = document.getElementById('associated-opportunities-list');
        const addButton = document.getElementById('add-associated-opportunity-btn');
        if (!container || !addButton) return;

        const { opportunityInfo, parentOpportunity, childOpportunities } = details;
        let html = '';

        addButton.style.display = 'flex'; 
        addButton.onclick = () => showLinkOpportunityModal(opportunityInfo.opportunityId, opportunityInfo.rowIndex);

        if (parentOpportunity) {
            html += `
                <div class="summary-item" style="margin-bottom: 1rem;">
                    <span class="summary-label">母機會</span>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span class="summary-value" style="font-size: 1rem;">
                            <a href="#" class="text-link" onclick="event.preventDefault(); CRM_APP.navigateTo('opportunity-details', { opportunityId: '${parentOpportunity.opportunityId}' })">${parentOpportunity.opportunityName}</a>
                        </span>
                        <button class="action-btn small danger" style="padding: 2px 6px; font-size: 0.7rem;" 
                                onclick="OpportunityAssociatedOpps._handleRemoveParentLink('${opportunityInfo.opportunityId}', ${opportunityInfo.rowIndex})" 
                                title="移除母機會關聯">移除</button>
                    </div>
                </div>
            `;
            addButton.textContent = '✏️ 變更母機會';
        } else {
            addButton.textContent = '+ 設定母機會';
        }

        if (childOpportunities && childOpportunities.length > 0) {
            html += `<div class="summary-item"><span class="summary-label">子機會 (${childOpportunities.length})</span></div>`;
            html += `<ul style="list-style: none; padding-left: 1rem; margin-top: 0.5rem;">`;
            childOpportunities.forEach(child => {
                html += `<li style="margin-bottom: 0.5rem;"><a href="#" class="text-link" onclick="event.preventDefault(); CRM_APP.navigateTo('opportunity-details', { opportunityId: '${child.opportunityId}' })">${child.opportunityName}</a></li>`;
            });
            html += `</ul>`;
        }

        if (!parentOpportunity && (!childOpportunities || childOpportunities.length === 0)) {
            html = '<div class="alert alert-info">尚無關聯機會。</div>';
        }
        container.innerHTML = html;
    }

    return { render, _handleRemoveParentLink };
})();