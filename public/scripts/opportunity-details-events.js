// views/scripts/opportunity-details-events.js
// 職責：處理「機會資訊卡」的所有使用者互動事件，包括編輯、儲存等

const OpportunityInfoCardEvents = (() => {
    let _currentOppForEditing = null;
    let _specConfigMap = new Map();
    let _specQuantities = new Map();

    function init(opportunityData) {
        _currentOppForEditing = opportunityData;
    }

    function toggleEditMode(isEditing) {
        const displayMode = document.getElementById('opportunity-info-display-mode');
        const editMode = document.getElementById('opportunity-info-edit-mode');

        if (isEditing) {
            if (!_currentOppForEditing) {
                showNotification('機會資料尚未載入完成，無法編輯。', 'error');
                return;
            }
            displayMode.style.display = 'none';
            editMode.style.display = 'block';
            _populateEditForm();
        } else {
            displayMode.style.display = 'block';
            editMode.style.display = 'none';
        }
    }

    function _populateEditForm() {
        const container = document.getElementById('opportunity-info-edit-form-container');
        const opp = _currentOppForEditing;
        const systemConfig = window.CRM_APP.systemConfig;

        // 1. 清理並快取規格設定，同時讀取分類
        _specConfigMap.clear();
        
        // 準備分組結構
        const groups = new Map(); // key: categoryName, value: array of config
        const defaultCategory = '其他';

        (systemConfig['可能下單規格'] || []).forEach(spec => {
            const configItem = {
                value: spec.value,
                note: spec.note || spec.value,
                price: parseFloat(spec.value2) || 0,
                behavior: spec.value3 || 'boolean',
                category: spec.category || defaultCategory // 從 reader 讀取的分類
            };
            
            _specConfigMap.set(spec.value, configItem);

            // 分組邏輯
            if (!groups.has(configItem.category)) {
                groups.set(configItem.category, []);
            }
            groups.get(configItem.category).push(configItem);
        });

        // 2. 解析現有規格
        _specQuantities.clear();
        try {
            const parsedSpecs = JSON.parse(opp.potentialSpecification);
            if (parsedSpecs && typeof parsedSpecs === 'object') {
                _specQuantities = new Map(Object.entries(parsedSpecs));
            } else { throw new Error(); }
        } catch (e) {
            if (opp.potentialSpecification && typeof opp.potentialSpecification === 'string') {
                opp.potentialSpecification.split(',').map(s => s.trim()).filter(Boolean).forEach(specKey => {
                    if (_specConfigMap.has(specKey)) _specQuantities.set(specKey, 1);
                });
            }
        }

        // 3. 價值模式
        const isManualMode = opp.opportunityValueType === 'manual';
        const valueInputState = isManualMode ? '' : 'disabled';
        const manualCheckboxState = isManualMode ? 'checked' : '';
        const formattedValue = (opp.opportunityValue || '0').replace(/,/g, '');

        // 輔助函式：單選按鈕
        const createSingleSelectPillsHTML = (configKey, selectedValue, dataField) => {
            const options = systemConfig[configKey] || [];
            let pillsHtml = '';
            options.forEach(opt => {
                const isSelected = opt.value === selectedValue;
                pillsHtml += `
                    <span class="info-option-pill single-select ${isSelected ? 'selected' : ''}" 
                          data-value="${opt.value}" 
                          data-field-target="${dataField}"
                          onclick="OpportunityInfoCardEvents.handleSingleSelectClick(this)">
                        ${opt.note || opt.value}
                    </span>
                `;
            });
            return `
                <div class="info-options-group pills-container single-select-container" id="pills-${dataField}">
                    ${pillsHtml}
                    <input type="hidden" data-field="${dataField}" value="${selectedValue || ''}">
                </div>
            `;
        };

        // 輔助函式：下拉選單
        const createSelectHTML = (configKey, selectedValue, dataField) => {
            let optionsHtml = '<option value="">請選擇...</option>';
            (systemConfig[configKey] || []).forEach(opt => {
                optionsHtml += `<option value="${opt.value}" ${opt.value === selectedValue ? 'selected' : ''}>${opt.note}</option>`;
            });
            return `<div class="select-wrapper"><select class="form-select" data-field="${dataField}">${optionsHtml}</select></div>`;
        };

        // --- 【修改】輔助函式：產生分組後的規格標籤 ---
        let specsHtml = '';
        
        // 確保「其他」分類排在最後
        const sortedCategories = Array.from(groups.keys()).sort((a, b) => {
            if (a === defaultCategory) return 1;
            if (b === defaultCategory) return -1;
            return a.localeCompare(b);
        });

        sortedCategories.forEach(category => {
            const items = groups.get(category);
            let groupPillsHtml = '';
            
            items.forEach(config => {
                const isSelected = _specQuantities.has(config.value);
                const quantity = _specQuantities.get(config.value) || 0;
                let quantityHtml = '';
                if (isSelected && config.behavior === 'allow_quantity' && quantity > 0) {
                    quantityHtml = `<span class="pill-quantity" data-spec-id="${config.value}" title="點擊以修改數量">(x${quantity})</span>`;
                }
                groupPillsHtml += `
                    <span class="info-option-pill ${isSelected ? 'selected' : ''}" 
                          data-spec-id="${config.value}" 
                          title="${config.note}">
                        ${config.note}
                        ${quantityHtml}
                    </span>
                `;
            });

            // 為每個分類建立一個區塊
            specsHtml += `
                <div class="spec-category-group">
                    <div class="spec-category-title">▼ ${category}</div>
                    <div class="spec-pills-wrapper">
                        ${groupPillsHtml}
                    </div>
                </div>
            `;
        });

        if (specsHtml === '') specsHtml = '<span>系統設定中未定義「可能下單規格」。</span>';


        // 6. 產生表單 HTML (使用雙欄獨立佈局)
        container.innerHTML = `
            <div class="info-card-body-layout">
            
                <div class="info-col">
                    <div class="info-item form-group">
                        <label class="info-label form-label">機會名稱 *</label>
                        <input type="text" class="form-input" data-field="opportunityName" value="${opp.opportunityName || ''}" required>
                    </div>

                    <div class="info-item form-group">
                        <label class="info-label form-label">負責業務</label>
                        ${createSingleSelectPillsHTML('團隊成員', opp.assignee, 'assignee')}
                    </div>

                    <div class="info-item form-group value-highlight">
                        <label class="info-label form-label">機會價值</label>
                        <div class="value-input-wrapper">
                            <input type="text" class="form-input" id="opp-value-input" data-field="opportunityValue" value="${formattedValue}" ${valueInputState}>
                        </div>
                        <div class="manual-override-row">
                            <label class="manual-override-label">
                                <input type="checkbox" id="value-manual-override-checkbox" ${manualCheckboxState}>
                                <span>手動覆蓋 (勾選後可自行輸入總價，取消勾選則自動計算)</span>
                            </label>
                        </div>
                    </div>

                    <div class="info-item form-group">
                        <label class="info-label form-label">機會種類</label>
                        ${createSingleSelectPillsHTML('機會種類', opp.opportunityType, 'opportunityType')}
                    </div>

                    <div class="info-item form-group">
                        <label class="info-label form-label">機會來源</label>
                        ${createSelectHTML('機會來源', opp.opportunitySource, 'opportunitySource')}
                    </div>

                    <div class="info-item form-group">
                        <label class="info-label form-label">結案日期</label>
                        <input type="date" class="form-input" data-field="expectedCloseDate" value="${opp.expectedCloseDate || ''}">
                    </div>
                </div>

                <div class="info-col">
                    <div class="info-item form-group">
                        <label class="info-label form-label">下單機率</label>
                        ${createSingleSelectPillsHTML('下單機率', opp.orderProbability, 'orderProbability')}
                    </div>

                    <div class="info-item form-group">
                        <label class="info-label form-label">可能下單規格 (點擊選取)</label>
                        <div class="info-options-group pills-container" id="spec-pills-container" style="display: block;">
                            ${specsHtml}
                        </div>
                    </div>

                    <div class="info-item form-group">
                        <label class="info-label form-label">可能銷售管道</label>
                        ${createSingleSelectPillsHTML('可能銷售管道', opp.salesChannel, 'salesChannel')}
                    </div>

                    <div class="info-item form-group">
                        <label class="info-label form-label">設備規模</label>
                        ${createSingleSelectPillsHTML('設備規模', opp.deviceScale, 'deviceScale')}
                    </div>
                </div>
            </div>
            
            <div class="notes-section form-group">
                 <label class="info-label form-label">備註</label>
                 <textarea class="form-textarea" data-field="notes" rows="4">${opp.notes || ''}</textarea>
            </div>
        `;

        // 7. 綁定事件
        container.querySelector('#value-manual-override-checkbox').addEventListener('change', _handleManualOverrideToggle);
        
        const pillContainer = container.querySelector('#spec-pills-container');
        pillContainer.addEventListener('click', (e) => {
            const quantitySpan = e.target.closest('.pill-quantity');
            const pill = e.target.closest('.info-option-pill');
            if (quantitySpan) {
                _handleQuantityClick(quantitySpan);
            } else if (pill) {
                _handleSpecPillClick(pill);
            }
        });

        _calculateTotalValue(!isManualMode);
    }

    function handleSingleSelectClick(element) {
        const container = element.closest('.single-select-container');
        const targetField = element.dataset.fieldTarget;
        const value = element.dataset.value;
        
        container.querySelectorAll('.info-option-pill').forEach(pill => {
            pill.classList.remove('selected');
        });
        element.classList.add('selected');
        
        const hiddenInput = container.querySelector(`input[data-field="${targetField}"]`);
        if (hiddenInput) {
            hiddenInput.value = value;
        }
    }

    function _handleManualOverrideToggle(event) {
        const isChecked = event.target.checked;
        const valueInput = document.getElementById('opp-value-input');
        if (isChecked) {
            valueInput.disabled = false;
            valueInput.readOnly = false;
            valueInput.focus();
        } else {
            valueInput.disabled = true;
            valueInput.readOnly = true;
            _calculateTotalValue(true);
        }
    }

    function _handleSpecPillClick(pillElement) {
        const specId = pillElement.dataset.specId;
        if (!specId || !_specConfigMap.has(specId)) return;
        const config = _specConfigMap.get(specId);
        const isSelected = _specQuantities.has(specId);
        const currentQty = _specQuantities.get(specId) || 0;

        if (config.behavior === 'allow_quantity') {
            if (isSelected) {
                const newQty = currentQty + 1;
                _specQuantities.set(specId, newQty);
                let qtySpan = pillElement.querySelector('.pill-quantity');
                if (!qtySpan) {
                     qtySpan = document.createElement('span');
                     qtySpan.className = 'pill-quantity';
                     qtySpan.dataset.specId = specId;
                     qtySpan.title = '點擊以修改數量';
                     pillElement.appendChild(qtySpan);
                }
                qtySpan.innerText = `(x${newQty})`;
            } else {
                _specQuantities.set(specId, 1);
                pillElement.classList.add('selected');
                const qtySpan = document.createElement('span');
                qtySpan.className = 'pill-quantity';
                qtySpan.dataset.specId = specId;
                qtySpan.title = '點擊以修改數量';
                qtySpan.innerText = '(x1)';
                pillElement.appendChild(qtySpan);
            }
        } else {
            if (isSelected) {
                _specQuantities.delete(specId);
                pillElement.classList.remove('selected');
            } else {
                _specQuantities.set(specId, 1);
                pillElement.classList.add('selected');
            }
        }
        _calculateTotalValue();
    }

    function _handleQuantityClick(quantityElement) {
        event.stopPropagation();
        const specId = quantityElement.dataset.specId;
        if (!specId || !_specConfigMap.has(specId)) return;
        const currentQty = _specQuantities.get(specId) || 1;
        const newQtyStr = prompt(`請輸入「${_specConfigMap.get(specId).note}」的數量：`, currentQty);
        if (newQtyStr === null) return;
        const newQty = parseInt(newQtyStr);
        if (!isNaN(newQty) && newQty > 0) {
            _specQuantities.set(specId, newQty);
            quantityElement.innerText = `(x${newQty})`;
        } else {
            _specQuantities.delete(specId);
            const pillElement = quantityElement.closest('.info-option-pill');
            if (pillElement) {
                pillElement.classList.remove('selected');
                quantityElement.remove();
            }
        }
        _calculateTotalValue();
    }

    function _calculateTotalValue(forceUpdateInput = false) {
        const valueInput = document.getElementById('opp-value-input');
        const manualCheckbox = document.getElementById('value-manual-override-checkbox');
        if (!valueInput || !manualCheckbox) return;
        if (manualCheckbox.checked && !forceUpdateInput) return;

        let total = 0;
        for (const [specId, quantity] of _specQuantities.entries()) {
            const config = _specConfigMap.get(specId);
            if (config && config.price > 0) {
                total += config.price * quantity;
            }
        }
        valueInput.value = total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/,/g, '');
    }

    async function save() {
        const formContainer = document.getElementById('opportunity-info-edit-form-container');
        if (!formContainer) return;
        const updateData = {};

        try {
            formContainer.querySelectorAll('select[data-field], textarea[data-field], input[data-field]').forEach(input => {
                const fieldName = input.dataset.field;
                if (!fieldName) return;
                if (fieldName === 'opportunityName' && !input.value.trim()) {
                    showNotification('機會名稱為必填欄位。', 'error');
                    input.focus();
                    throw new Error("機會名稱不可為空");
                }
                if (fieldName !== 'opportunityValue' && fieldName !== 'potentialSpecification') {
                    updateData[fieldName] = input.value;
                }
            });

            const isManual = formContainer.querySelector('#value-manual-override-checkbox').checked;
            updateData.opportunityValueType = isManual ? 'manual' : 'auto';
            updateData.opportunityValue = formContainer.querySelector('#opp-value-input').value.replace(/,/g, '') || '0';

            const specData = {};
            for (const [specId, quantity] of _specQuantities.entries()) {
                if (quantity > 0) specData[specId] = quantity;
            }
            updateData.potentialSpecification = JSON.stringify(specData);
            
            if (!updateData.opportunityName) return;

            showLoading('正在儲存變更...');
            const result = await authedFetch(`/api/opportunities/${_currentOppForEditing.rowIndex}`, {
                method: 'PUT',
                body: JSON.stringify({ ...updateData, modifier: getCurrentUser() })
            });

            if (result.success) {
                // 成功
            } else {
                throw new Error(result.error || '儲存失敗');
            }
        } catch (error) {
            if (error.message !== "機會名稱不可為空" && error.message !== 'Unauthorized') {
                showNotification(`儲存失敗: ${error.message}`, 'error');
            }
        } finally {
            hideLoading();
        }
    }

    return {
        init,
        toggleEditMode,
        save,
        handleSingleSelectClick
    };
})();