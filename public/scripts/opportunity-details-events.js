// views/scripts/opportunity-details-events.js
// 職責：處理「機會資訊卡」的所有使用者互動事件，包括編輯、儲存等

const OpportunityInfoCardEvents = (() => {
    // 【*** 程式碼修改點：新增狀態變數 ***】
    let _currentOppForEditing = null;
    let _specConfigMap = new Map(); // 儲存 '可能下單規格' 的系統設定 (value, note, price, behavior)
    let _specQuantities = new Map(); // 儲存當前選中的規格與數量 (e.g., {'product_a': 5})

    /**
     * 【新增】初始化函式，由主控制器呼叫以傳入資料
     * @param {object} opportunityData - 當前機會的詳細資料物件
     */
    function init(opportunityData) {
        _currentOppForEditing = opportunityData;
    }

    /**
     * 切換檢視模式與編輯模式
     * @param {boolean} isEditing - 是否要進入編輯模式
     */
    function toggleEditMode(isEditing) {
        const displayMode = document.getElementById('opportunity-info-display-mode');
        const editMode = document.getElementById('opportunity-info-edit-mode');

        if (isEditing) {
            // 【修正】在進入編輯模式前，先確保資料已經被初始化
            if (!_currentOppForEditing) {
                showNotification('機會資料尚未載入完成，無法編輯。', 'error');
                console.error('OpportunityInfoCardEvents: _currentOppForEditing is not initialized.');
                return;
            }
            displayMode.style.display = 'none';
            editMode.style.display = 'block';
            _populateEditForm(); // 動態填入編輯表單
        } else {
            displayMode.style.display = 'block';
            editMode.style.display = 'none';
        }
    }

    /**
     * 【*** 程式碼修改點：重寫 _populateEditForm (使用雙欄佈局) ***】
     * 動態產生並填入編輯表單的 HTML，並綁定所有新事件
     * @private
     */
    function _populateEditForm() {
        const container = document.getElementById('opportunity-info-edit-form-container');
        const opp = _currentOppForEditing;
        const systemConfig = window.CRM_APP.systemConfig;

        // 1. 清理並快取規格設定
        _specConfigMap.clear();
        (systemConfig['可能下單規格'] || []).forEach(spec => {
            _specConfigMap.set(spec.value, {
                note: spec.note || spec.value,
                price: parseFloat(spec.value2) || 0, // G欄: 規格單價
                behavior: spec.value3 || 'boolean' // H欄: 行為模式 (boolean | allow_quantity)
            });
        });

        // 2. 解析儲存的規格與數量
        _specQuantities.clear();
        try {
            // 嘗試解析新版 JSON
            const parsedSpecs = JSON.parse(opp.potentialSpecification);
            if (parsedSpecs && typeof parsedSpecs === 'object') {
                _specQuantities = new Map(Object.entries(parsedSpecs));
            } else {
                throw new Error('Not an object, try parsing as old string.');
            }
        } catch (e) {
            // 向下相容：解析舊版 "規格A,規格B"
            if (opp.potentialSpecification && typeof opp.potentialSpecification === 'string') {
                opp.potentialSpecification.split(',').map(s => s.trim()).filter(Boolean).forEach(specKey => {
                    if (_specConfigMap.has(specKey)) {
                        _specQuantities.set(specKey, 1); // 舊資料一律視為 1
                    }
                });
            }
        }

        // 3. 決定初始模式
        // 預設為 'auto'，除非明確儲存為 'manual'
        const isManualMode = opp.opportunityValueType === 'manual';
        const valueInputState = isManualMode ? '' : 'disabled';
        const manualCheckboxState = isManualMode ? 'checked' : '';
        const formattedValue = (opp.opportunityValue || '0').replace(/,/g, '');

        // 4. 輔助函式：產生下拉選單
        const createSelectHTML = (configKey, selectedValue, dataField) => {
            let optionsHtml = '<option value="">請選擇...</option>';
            (systemConfig[configKey] || []).forEach(opt => {
                optionsHtml += `<option value="${opt.value}" ${opt.value === selectedValue ? 'selected' : ''}>${opt.note}</option>`;
            });
            return `<div class="select-wrapper"><select class="form-select" data-field="${dataField}">${optionsHtml}</select></div>`;
        };

        // 5. 輔助函式：產生規格標籤 (Pills)
        let specsHtml = '';
        _specConfigMap.forEach((config, key) => {
            const isSelected = _specQuantities.has(key);
            const quantity = _specQuantities.get(key) || 0;
            
            let quantityHtml = '';
            // 只有在 (被選中) 且 (行為是 allow_quantity) 且 (數量大於0) 時才顯示數量
            if (isSelected && config.behavior === 'allow_quantity' && quantity > 0) {
                quantityHtml = `
                    <span class="pill-quantity" data-spec-id="${key}" title="點擊以修改數量">
                        (x${quantity})
                    </span>`;
            }
            
            specsHtml += `
                <span class="info-option-pill ${isSelected ? 'selected' : ''}" 
                      data-spec-id="${key}" 
                      title="${config.note} (單價: ${config.price.toLocaleString()})">
                    
                    ${config.note}
                    ${quantityHtml}
                </span>
            `;
        });
        if (specsHtml === '') specsHtml = '<span>系統設定中未定義「可能下單規格」。</span>';


        // 6. 產生完整表單 HTML (使用 info-card-body-grid 雙欄佈局)
        container.innerHTML = `
            <div class="info-card-body-grid">
            
                <div class="info-col-left">
                    <div class="info-item form-group">
                        <label class="info-label form-label">機會名稱 *</label>
                        <input type="text" class="form-input" data-field="opportunityName" value="${opp.opportunityName || ''}" required>
                    </div>
                    <div class="info-item form-group">
                        <label class="info-label form-label">負責業務</label>
                        ${createSelectHTML('團隊成員', opp.assignee, 'assignee')}
                    </div>
                    <div class="info-item form-group value-highlight">
                        <label class="info-label form-label">機會價值</label>
                        <div class="value-input-wrapper">
                            <input type="text" class="form-input" id="opp-value-input" data-field="opportunityValue" value="${formattedValue}" ${valueInputState}>
                        </div>
                        <div class="info-item value-manual-override">
                            <label>
                                <input type="checkbox" id="value-manual-override-checkbox" ${manualCheckboxState}>
                                <span>手動覆蓋 (勾選後可自行輸入總價，取消勾選則自動計算)</span>
                            </label>
                        </div>
                    </div>
                    <div class="info-item form-group">
                        <label class="info-label form-label">結案日期</label>
                        <input type="date" class="form-input" data-field="expectedCloseDate" value="${opp.expectedCloseDate || ''}">
                    </div>
                    <div class="info-item form-group">
                        <label class="info-label form-label">機會種類</label>
                        ${createSelectHTML('機會種類', opp.opportunityType, 'opportunityType')}
                    </div>
                    <div class="info-item form-group">
                        <label class="info-label form-label">機會來源</label>
                        ${createSelectHTML('機會來源', opp.opportunitySource, 'opportunitySource')}
                    </div>
                </div>

                <div class="info-col-right">
                    <div class="info-item form-group">
                        <label class="info-label form-label">下單機率</label>
                        ${createSelectHTML('下單機率', opp.orderProbability, 'orderProbability')}
                    </div>
                    <div class="info-item form-group">
                        <label class="info-label form-label">可能下單規格 (點擊選取)</label>
                        <div class="info-options-group pills-container" id="spec-pills-container">
                            ${specsHtml}
                        </div>
                    </div>
                    <div class="info-item form-group">
                        <label class="info-label form-label">可能銷售管道</label>
                        ${createSelectHTML('可能銷售管道', opp.salesChannel, 'salesChannel')}
                    </div>
                    <div class="info-item form-group">
                        <label class="info-label form-label">設備規模</label>
                        ${createSelectHTML('設備規模', opp.deviceScale, 'deviceScale')}
                    </div>
                </div>

                <div class="notes-section form-group">
                     <label class="info-label form-label">備註</label>
                     <textarea class="form-textarea" data-field="notes" rows="4">${opp.notes || ''}</textarea>
                </div>
            </div>
        `;

        // 7. 綁定新事件
        container.querySelector('#value-manual-override-checkbox').addEventListener('change', _handleManualOverrideToggle);
        
        const pillContainer = container.querySelector('#spec-pills-container');
        // 使用事件委派來處理標籤和數量的點擊
        pillContainer.addEventListener('click', (e) => {
            const quantitySpan = e.target.closest('.pill-quantity');
            const pill = e.target.closest('.info-option-pill');
            
            if (quantitySpan) {
                // 點擊了數量
                _handleQuantityClick(quantitySpan);
            } else if (pill) {
                // 點擊了標籤
                _handleSpecPillClick(pill);
            }
        });

        // 8. 載入時計算一次總價 (但如果非手動模式，才更新輸入框)
        _calculateTotalValue(!isManualMode);
    }

    /**
     * 【*** 新增 ***】
     * 處理「手動覆蓋」Checkbox 的點擊邏輯
     */
    function _handleManualOverrideToggle(event) {
        const isChecked = event.target.checked;
        const valueInput = document.getElementById('opp-value-input');
        
        if (isChecked) {
            // 進入手動模式
            valueInput.disabled = false;
            valueInput.readOnly = false;
            valueInput.focus();
        } else {
            // 進入自動模式
            valueInput.disabled = true;
            valueInput.readOnly = true;
            _calculateTotalValue(true); // 強制重算並更新輸入框
        }
    }

    /**
     * 【*** 程式碼修改點：修正 key is not defined ***】
     * 處理「規格標籤」的點擊邏輯
     */
    function _handleSpecPillClick(pillElement) {
        const specId = pillElement.dataset.specId;
        if (!specId || !_specConfigMap.has(specId)) return;

        const config = _specConfigMap.get(specId);
        
        // 【*** 錯誤修正：將 'key' 改為 'specId' ***】
        const isSelected = _specQuantities.has(specId);
        const currentQty = _specQuantities.get(specId) || 0;

        if (config.behavior === 'allow_quantity') {
            // 數量型：
            if (isSelected) {
                // 如果是點擊標籤本身，且已有數量，我們預設為 +1
                const newQty = currentQty + 1;
                _specQuantities.set(specId, newQty);
                // 更新數量顯示
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
                // 未選中，新增一個
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
            // 布林型：純粹開關
            if (isSelected) {
                _specQuantities.delete(specId);
                pillElement.classList.remove('selected');
            } else {
                _specQuantities.set(specId, 1); // 布林型永遠是 1
                pillElement.classList.add('selected');
            }
        }
        
        // 重算總價
        _calculateTotalValue();
    }

    /**
     * 【*** 新增 ***】
     * 處理「數量計數器」的點擊邏輯
     */
    function _handleQuantityClick(quantityElement) {
        event.stopPropagation(); // 阻止觸發父層 pill 的點擊事件
        
        const specId = quantityElement.dataset.specId;
        if (!specId || !_specConfigMap.has(specId)) return;

        const currentQty = _specQuantities.get(specId) || 1;
        const newQtyStr = prompt(`請輸入「${_specConfigMap.get(specId).note}」的數量：`, currentQty);

        if (newQtyStr === null) return; // 使用者按下取消

        const newQty = parseInt(newQtyStr);

        if (!isNaN(newQty) && newQty > 0) {
            // 更新數量
            _specQuantities.set(specId, newQty);
            quantityElement.innerText = `(x${newQty})`;
        } else {
            // 數量為 0 或無效，移除此項目
            _specQuantities.delete(specId);
            const pillElement = quantityElement.closest('.info-option-pill');
            if (pillElement) {
                pillElement.classList.remove('selected');
                quantityElement.remove();
            }
        }
        
        // 重算總價
        _calculateTotalValue();
    }

    /**
     * 【*** 新增 ***】
     * 根據 _specQuantities Map 重新計算總價，並視情況更新 UI
     * @param {boolean} [forceUpdateInput=false] - 是否強制更新輸入框 (用於從手動切換回自動時)
     */
    function _calculateTotalValue(forceUpdateInput = false) {
        const valueInput = document.getElementById('opp-value-input');
        // 確保 checkbox 存在
        const manualCheckbox = document.getElementById('value-manual-override-checkbox');
        if (!valueInput || !manualCheckbox) return;

        const isManual = manualCheckbox.checked;

        // 如果是手動模式且非強制更新，則不執行任何動作
        if (isManual && !forceUpdateInput) {
            return;
        }

        let total = 0;
        for (const [specId, quantity] of _specQuantities.entries()) {
            const config = _specConfigMap.get(specId);
            if (config && config.price > 0) {
                total += config.price * quantity;
            }
        }

        // 格式化為無小數的數字字串
        const formattedTotal = total.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/,/g, '');
        
        valueInput.value = formattedTotal;
    }


    /**
     * 【*** 程式碼修改點：重寫 save 函式 ***】
     * 儲存編輯後的資訊
     */
    async function save() {
        const formContainer = document.getElementById('opportunity-info-edit-form-container');
        if (!formContainer) return;

        const updateData = {};

        try {
            // 1. 處理下拉選單、文字區域和一般輸入框
            formContainer.querySelectorAll('select[data-field], textarea[data-field], input[data-field]').forEach(input => {
                const fieldName = input.dataset.field;
                if (!fieldName) return;

                // 檢查是否為機會名稱，若是且為空，則提示錯誤
                if (fieldName === 'opportunityName' && !input.value.trim()) {
                    showNotification('機會名稱為必填欄位。', 'error');
                    input.focus(); // 聚焦到該欄位
                    throw new Error("機會名稱不可為空"); // 拋出錯誤阻止儲存
                }
                
                // 【修改】跳過 value 和 spec 欄位，稍後手動處理
                if (fieldName !== 'opportunityValue' && fieldName !== 'potentialSpecification') {
                    updateData[fieldName] = input.value;
                }
            });

            // 2. 專門處理機會價值和類型
            const isManual = formContainer.querySelector('#value-manual-override-checkbox').checked;
            updateData.opportunityValueType = isManual ? 'manual' : 'auto';
            updateData.opportunityValue = formContainer.querySelector('#opp-value-input').value.replace(/,/g, '') || '0';

            // 3. 專門處理規格 (將 Map 轉為 JSON)
            const specData = {};
            for (const [specId, quantity] of _specQuantities.entries()) {
                if (quantity > 0) { // 只儲存數量大於 0 的
                    specData[specId] = quantity;
                }
            }
            updateData.potentialSpecification = JSON.stringify(specData);
            
            // 4. 驗證機會名稱是否已填寫 (雙重檢查)
            if (!updateData.opportunityName) {
                showNotification('機會名稱為必填欄位。', 'error');
                return; // 不執行儲存
            }

            // 5. 執行儲存
            showLoading('正在儲存變更...');
            const result = await authedFetch(`/api/opportunities/${_currentOppForEditing.rowIndex}`, {
                method: 'PUT',
                body: JSON.stringify({
                    ...updateData,
                    modifier: getCurrentUser()
                })
            });

            if (result.success) {
                // 成功。authedFetch 會自動處理通知和頁面刷新
                // 刷新後，新的 _currentOppForEditing 會被載入
            } else {
                throw new Error(result.error || '儲存失敗');
            }
        } catch (error) {
             // 只有在不是機會名稱驗證錯誤時才顯示一般錯誤訊息
            if (error.message !== "機會名稱不可為空" && error.message !== 'Unauthorized') {
                showNotification(`儲存失敗: ${error.message}`, 'error');
            } else if (error.message === 'Unauthorized') {
                // Unauthorized 錯誤由 authedFetch 處理
            }
        } finally {
            hideLoading(); // authedFetch 會處理，但這裡多加一層保險
        }
    }

    // 返回公開的 API
    return {
        init, // 【新增】匯出 init 方法
        toggleEditMode,
        save
    };
})();