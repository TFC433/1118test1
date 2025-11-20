// views/scripts/event-modal-manager.js
// 職責：管理所有與「新增/編輯事件」彈出視窗相關的複雜邏輯
// (版本: 還原舊版 + 修正職稱保存)

let eventOppSearchTimeout;
let eventCompanySearchTimeout;

// 入口函式：決定是開啟「新增精靈」還是「編輯視窗」
async function showEventLogFormModal(options = {}) {
    // ==================== 【分流邏輯】 ====================
    if (!options.eventId) {
        if (window.EventWizard) {
            EventWizard.show(options);
        } else {
            console.error("EventWizard module not loaded!");
            showNotification("無法開啟新增精靈，請重新整理頁面。", "error");
        }
        return; 
    }
    // ==================== 【分流結束】 ====================


    // --- 以下為原本的「編輯模式」邏輯 ---
    
    if (!document.getElementById('event-log-modal')) {
        console.error('Event log modal HTML not loaded!');
        showNotification('無法開啟事件紀錄視窗，元件遺失。', 'error');
        return;
    }
    
    const form = document.getElementById('event-log-form');
    form.reset();
    
    // 重設表單後，手動隱藏管理員欄位
    const adminTimeGroup = document.getElementById('admin-created-time-group');
    if (adminTimeGroup) adminTimeGroup.style.display = 'none';
    
    showModal('event-log-modal');

    const title = document.getElementById('event-log-modal-title');
    const submitBtn = document.getElementById('event-log-submit-btn');
    const linkSection = document.getElementById('event-link-section');
    const typeSelectorContainer = form.querySelector('.segmented-control');
    
    // 獲取刪除按鈕
    const deleteBtn = document.getElementById('event-log-delete-btn');

    // 進入此區塊必定是編輯模式
    title.textContent = '✏️ 編輯事件紀錄';
    submitBtn.textContent = '💾 儲存變更';
    linkSection.style.display = 'none'; 
    
    if(typeSelectorContainer) {
        typeSelectorContainer.style.pointerEvents = 'auto';
        typeSelectorContainer.style.opacity = '1';
    }

    try {
        const result = await authedFetch(`/api/events/${options.eventId}`);
        if (!result.success) throw new Error('無法載入事件資料');
        const eventData = result.data;
        
        // 顯示並綁定刪除按鈕
        deleteBtn.style.display = 'block';
        deleteBtn.onclick = () => confirmDeleteEvent(eventData.eventId, eventData.eventName);

        await populateEventLogForm(eventData);
    } catch (error) {
        if (error.message !== 'Unauthorized') showNotification(`載入資料失敗: ${error.message}`, 'error');
        closeModal('event-log-modal');
    }
}

/**
 * 刪除事件的確認函式
 */
async function confirmDeleteEvent(eventId, eventName) {
    const safeEventName = eventName || '此事件';
    const message = `您確定要永久刪除事件 "${safeEventName}" 嗎？\n\n此操作無法復原，但系統會留下一筆刪除互動紀錄。`;

    showConfirmDialog(message, async () => {
        showLoading('正在刪除事件...');
        try {
            const result = await authedFetch(`/api/events/${eventId}`, {
                method: 'DELETE'
            });
        } catch (error) {
            if (error.message !== 'Unauthorized') {
                console.error('刪除事件失敗:', error);
            }
        } finally {
            hideLoading();
            closeModal('event-log-modal');
            closeModal('event-log-report-modal');
        }
    });
}

// 切換關聯類型
function toggleEventLinkType() {
    const linkType = document.querySelector('input[name="linkType"]:checked').value;
    const entitySelector = document.getElementById('event-log-entity-selector');
    
    document.getElementById('event-log-opportunityId').value = '';
    document.getElementById('event-log-companyId').value = '';
    
    if (linkType === 'opportunity') {
        entitySelector.innerHTML = `
            <label for="event-log-search-opportunity" class="form-label">搜尋並選擇關聯機會 *</label>
            <input type="text" id="event-log-search-opportunity" class="form-input" placeholder="輸入機會名稱或公司...">
            <div id="event-log-opportunity-results" class="search-result-list"></div>
        `;
        document.getElementById('event-log-search-opportunity').addEventListener('keyup', handleOpportunitySearchForEvent);
    } else {
        entitySelector.innerHTML = `
            <label for="event-log-search-company" class="form-label">搜尋並選擇關聯公司 *</label>
            <input type="text" id="event-log-search-company" class="form-input" placeholder="輸入公司名稱...">
            <div id="event-log-company-results" class="search-result-list"></div>
        `;
        document.getElementById('event-log-search-company').addEventListener('keyup', handleCompanySearchForEvent);
    }
    _populateClientParticipantsCheckboxes([], []);
}

// 收集共通欄位資料
function _getCommonFieldData(container) {
    if (!container) return {};
    const data = {};
    const commonFieldNames = [
        'eventName', 'visitPlace', 'eventContent',
        'clientQuestions', 'clientIntelligence', 'eventNotes'
    ];
    
    commonFieldNames.forEach(name => {
        const element = container.querySelector(`[name="${name}"]`);
        if (element) data[name] = element.value;
    });

    data.ourParticipants = Array.from(container.querySelectorAll('[name="ourParticipants"]:checked')).map(cb => cb.value);
    
    const clientParticipantsChecked = Array.from(container.querySelectorAll('[name="clientParticipants-checkbox"]:checked')).map(cb => cb.value);
    const otherParticipant = container.querySelector('[name="clientParticipants-other"]')?.value.trim();
    if (otherParticipant) {
        clientParticipantsChecked.push(...otherParticipant.split(',').map(p => p.trim()).filter(Boolean));
    }
    data.clientParticipants = clientParticipantsChecked; 

    return data;
}

// 填充共通欄位資料
function _setCommonFieldData(container, data) {
    if (!container || !data) return;
    for (const key in data) {
        if (key !== 'ourParticipants' && key !== 'clientParticipants') {
            const element = container.querySelector(`[name="${key}"]`);
            if (element) element.value = data[key];
        }
    }
}

// 動態載入不同類型的表單範本
async function loadEventTypeForm(eventType) {
    const formContainer = document.getElementById('event-form-container');
    const eventTypeInput = document.getElementById('event-log-type');
    if (!formContainer || !eventTypeInput) return;
    
    const commonData = _getCommonFieldData(formContainer);

    let formName = eventType === 'dx' ? 'general' : eventType;
    eventTypeInput.value = eventType;

    const template = window.CRM_APP.formTemplates[formName];
    if (template) {
        formContainer.innerHTML = template;
    } else {
        formContainer.innerHTML = '<div class="loading show"><div class="spinner"></div></div>';
        try {
            const response = await fetch(`event-form-${formName}.html`);
            if (!response.ok) throw new Error(`找不到 ${formName} 的表單範本`);
            formContainer.innerHTML = await response.text();
        } catch (error) {
            formContainer.innerHTML = `<div class="alert alert-error">無法載入 ${eventType} 表單。</div>`;
            return;
        }
    }

    _setCommonFieldData(formContainer, commonData);
    _populateOurParticipantsCheckboxes(commonData.ourParticipants || []);

    const opportunityId = document.getElementById('event-log-opportunityId').value;
    const companyId = document.getElementById('event-log-companyId').value;
    const clientParticipantsArray = Array.isArray(commonData.clientParticipants) ? commonData.clientParticipants : (commonData.clientParticipants || '').split(',').map(p => p.trim());
    await _fetchAndPopulateClientParticipants(opportunityId, companyId, clientParticipantsArray);
}

// 渲染我方與會人員 Checkbox
function _populateOurParticipantsCheckboxes(selectedParticipants = []) {
    const container = document.getElementById('our-participants-container');
    if (!container) return;

    const members = window.CRM_APP.systemConfig['團隊成員'] || [];
    if (members.length === 0) {
        container.innerHTML = '<p style="color: var(--text-muted);">系統設定中未找到團隊成員</p>';
        return;
    }
    const selectedSet = new Set(selectedParticipants);
    container.innerHTML = members.map(member => `
        <label>
            <input type="checkbox" name="ourParticipants" value="${member.note}" ${selectedSet.has(member.note) ? 'checked' : ''}>
            <span>${member.note}</span>
        </label>
    `).join('');
}

// 根據 ID 獲取並渲染客戶聯絡人
async function _fetchAndPopulateClientParticipants(opportunityId, companyId, selectedParticipants = []) {
    if (!opportunityId && !companyId) {
        _populateClientParticipantsCheckboxes([], selectedParticipants);
        return;
    }

    let contacts = [];
    try {
        if (opportunityId) {
            const result = await authedFetch(`/api/opportunities/${opportunityId}/details`);
            contacts = result.success ? result.data.linkedContacts : [];
        } else if (companyId) {
            const allCompanies = await authedFetch(`/api/companies`).then(res => res.data || []);
            const company = allCompanies.find(c => c.companyId === companyId);
            if (company) {
                 const result = await authedFetch(`/api/companies/${encodeURIComponent(company.companyName)}/details`);
                 contacts = result.success ? result.data.contacts : [];
            }
        }
    } catch (error) {
        console.error('獲取客戶聯絡人失敗:', error);
    }
    _populateClientParticipantsCheckboxes(contacts, selectedParticipants);
}

// 渲染客戶與會人員 Checkbox
function _populateClientParticipantsCheckboxes(contacts = [], selectedParticipants = []) {
    const container = document.getElementById('client-participants-container');
    if (!container) return;

    const selectedSet = new Set(selectedParticipants);
    
    let checkboxesHTML = '';
    if (contacts.length > 0) {
        checkboxesHTML = contacts.map(contact => {
            // 【重要修正】自動組合 姓名 + 職稱 作為 value
            // 這樣儲存時就會是 "王小明 (經理)" 而不僅是 "王小明"
            const displayName = contact.position 
                ? `${contact.name} (${contact.position})` 
                : contact.name;
            
            // 判斷是否被選中：先比對全名，若不符合則嘗試比對純姓名 (相容舊資料)
            let isChecked = selectedSet.has(displayName);
            if (!isChecked && selectedSet.has(contact.name)) {
                isChecked = true;
            }

            return `
            <label>
                <input type="checkbox" name="clientParticipants-checkbox" value="${displayName}" ${isChecked ? 'checked' : ''}>
                <span>${displayName}</span>
            </label>
            `;
        }).join('');
    } else {
        checkboxesHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1; text-align: center;">此對象尚無已建檔的關聯聯絡人。</p>';
    }

    // 過濾出不在選單內的「其他」人員
    // 這裡的邏輯比較簡單：如果 selectedParticipants 裡的字串，在通訊錄裡找不到 match，就當作是手動輸入的
    // 注意：比對時要考慮 displayName
    const contactDisplayNames = new Set(contacts.map(c => c.position ? `${c.name} (${c.position})` : c.name));
    // 也要考慮舊格式 (純姓名)
    const contactRawNames = new Set(contacts.map(c => c.name));

    const otherParticipants = selectedParticipants.filter(p => {
        const pTrim = p.trim();
        return pTrim && !contactDisplayNames.has(pTrim) && !contactRawNames.has(pTrim);
    }).join(', ');

    container.innerHTML = `
        <div class="participants-checkbox-group">${checkboxesHTML}</div>
        <input type="text" name="clientParticipants-other" class="form-input other-participant-input" placeholder="其他與會人員 (若無關聯資料，請在此手動輸入，用逗號分隔)" value="${otherParticipants}">
    `;
}

// 搜尋處理
function handleOpportunitySearchForEvent(event) {
    clearTimeout(eventOppSearchTimeout);
    eventOppSearchTimeout = setTimeout(async () => {
        const query = event.target.value;
        const resultsContainer = document.getElementById('event-log-opportunity-results');
        if (query.length < 1) { resultsContainer.innerHTML = ''; return; }
        resultsContainer.innerHTML = '<div class="loading show"><div class="spinner" style="width: 20px; height: 20px;"></div></div>';
        try {
            const opportunities = await authedFetch(`/api/opportunities?q=${encodeURIComponent(query)}&page=0`);
            const list = Array.isArray(opportunities) ? opportunities : (opportunities.data || []);
            
            resultsContainer.innerHTML = (list && list.length > 0)
                ? list.map(opp => `<div class="search-result-item" onclick='selectOpportunityForEvent(${JSON.stringify(opp).replace(/'/g, "&apos;")})'><strong>${opp.opportunityName}</strong><br><small>${opp.customerCompany}</small></div>`).join('')
                : '<div class="search-result-item">找不到符合的機會</div>';
        } catch(e) { 
            if (e.message !== 'Unauthorized') resultsContainer.innerHTML = '<div class="alert alert-error">搜尋失敗</div>';
        }
    }, 400);
}

async function selectOpportunityForEvent(opp) {
    document.getElementById('event-log-opportunityId').value = opp.opportunityId;
    document.getElementById('event-log-companyId').value = ''; 
    const selectorContainer = document.getElementById('event-log-entity-selector');
    selectorContainer.innerHTML = `
        <label class="form-label">已選擇關聯機會</label>
        <div class="selected-item-display">
            <span>${opp.opportunityName}</span>
            <button type="button" class="action-btn small secondary" onclick="resetEntitySelectorForEvent()">更改</button>
        </div>
    `;
    await _fetchAndPopulateClientParticipants(opp.opportunityId, null);
}

function handleCompanySearchForEvent(event) {
    clearTimeout(eventCompanySearchTimeout);
    eventCompanySearchTimeout = setTimeout(async () => {
        const query = event.target.value;
        const resultsContainer = document.getElementById('event-log-company-results');
        if (query.length < 1) { resultsContainer.innerHTML = ''; return; }
        resultsContainer.innerHTML = '<div class="loading show"><div class="spinner" style="width: 20px; height: 20px;"></div></div>';
        try {
            const result = await authedFetch(`/api/companies`);
            const list = Array.isArray(result) ? result : (result.data || []);
            const companies = list.filter(c => c.companyName.toLowerCase().includes(query.toLowerCase()));
            
            resultsContainer.innerHTML = (companies.length > 0)
                ? companies.map(comp => `<div class="search-result-item" onclick='selectCompanyForEvent(${JSON.stringify(comp).replace(/'/g, "&apos;")})'><strong>${comp.companyName}</strong></div>`).join('')
                : '<div class="search-result-item">找不到符合的公司</div>';
        } catch(e) { 
            if (e.message !== 'Unauthorized') resultsContainer.innerHTML = '<div class="alert alert-error">搜尋失敗</div>';
        }
    }, 400);
}

async function selectCompanyForEvent(comp) {
    document.getElementById('event-log-companyId').value = comp.companyId;
    document.getElementById('event-log-opportunityId').value = '';
    const selectorContainer = document.getElementById('event-log-entity-selector');
    selectorContainer.innerHTML = `
        <label class="form-label">已選擇關聯公司</label>
        <div class="selected-item-display">
            <span>${comp.companyName}</span>
            <button type="button" class="action-btn small secondary" onclick="resetEntitySelectorForEvent()">更改</button>
        </div>
    `;
    await _fetchAndPopulateClientParticipants(null, comp.companyId);
}

function resetEntitySelectorForEvent() {
    document.getElementById('event-log-opportunityId').value = '';
    document.getElementById('event-log-companyId').value = '';
    toggleEventLinkType();
}

// 填充表單資料 (編輯模式用)
async function populateEventLogForm(eventData) {
    document.getElementById('event-log-eventId').value = eventData.eventId;
    
    if (eventData.opportunityId) {
        document.getElementById('event-log-opportunityId').value = eventData.opportunityId;
    } else if (eventData.companyId) {
        document.getElementById('event-log-companyId').value = eventData.companyId;
    }
    
    const eventType = eventData.eventType || 'general';
    const typeToSelect = eventType === 'legacy' ? 'iot' : eventType;
    const typeRadio = document.querySelector(`input[name="eventType"][value="${typeToSelect}"]`);
    if (typeRadio) typeRadio.checked = true;
    
    document.getElementById('event-log-type').value = eventType;

    await loadEventTypeForm(typeToSelect);
    
    await new Promise(resolve => setTimeout(resolve, 150));

    const ourParticipants = (eventData.ourParticipants || '').split(',').map(p => p.trim()).filter(Boolean);
    _populateOurParticipantsCheckboxes(ourParticipants);
    
    const clientParticipants = (eventData.clientParticipants || '').split(',').map(p => p.trim()).filter(Boolean);
    await _fetchAndPopulateClientParticipants(eventData.opportunityId, eventData.companyId, clientParticipants);

    const form = document.getElementById('event-log-form');
    for (const key in eventData) {
        if (!['ourParticipants', 'clientParticipants'].includes(key)) {
            const elements = form.querySelectorAll(`[name="${key}"], [name="iot_${key}"], [name="dt_${key}"]`);
            if (elements.length > 0) {
                if (elements[0].type === 'checkbox' || elements[0].type === 'radio') {
                    const values = String(eventData[key]).split(',').map(s => s.trim());
                    elements.forEach(cb => { if (values.includes(cb.value)) cb.checked = true; });
                } else {
                    elements[0].value = eventData[key] || '';
                }
            }
        }
    }
    
    // 管理員功能：覆寫建立時間
    const createdTimeGroup = document.getElementById('admin-created-time-group');
    const createdTimeInput = document.getElementById('event-log-createdTime');
    if (createdTimeGroup && createdTimeInput && eventData.createdTime) {
        try {
            const date = new Date(eventData.createdTime);
            const localDateTime = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            createdTimeInput.value = localDateTime;
            createdTimeGroup.style.display = 'block'; 
        } catch (e) {
            console.warn("無法解析建立時間:", eventData.createdTime, e);
            createdTimeGroup.style.display = 'none';
        }
    }
}

// 表單提交處理 (編輯模式)
async function handleEventFormSubmit(e) {
    e.preventDefault();
    
    const eventId = document.getElementById('event-log-eventId').value;
    const isEditMode = !!eventId;

    showLoading(isEditMode ? '正在更新...' : '正在儲存...');

    try {
        const form = document.getElementById('event-log-form');
        if (!isEditMode && !form.opportunityId.value && !form.companyId.value) {
            throw new Error('請先選擇一個關聯的機會案件或公司');
        }

        const commonData = _getCommonFieldData(form);
        const eventData = { ...commonData };
        
        const formData = new FormData(form);

        const createdTimeInput = document.getElementById('admin-created-time-group');
        if (isEditMode && createdTimeInput && createdTimeInput.style.display !== 'none' && form.createdTime.value) {
            try {
                const localDate = new Date(form.createdTime.value);
                if (!isNaN(localDate.getTime())) {
                    eventData.createdTime = localDate.toISOString();
                }
            } catch (e) {
                console.warn("無法解析覆寫的建立時間:", form.createdTime.value);
            }
        }

        for (let [key, value] of formData.entries()) {
            if (key === 'createdTime' && eventData.hasOwnProperty('createdTime')) {
                continue;
            }
            if (!eventData.hasOwnProperty(key) && !key.startsWith('clientParticipants-')) {
                 const allValues = formData.getAll(key);
                 eventData[key] = allValues.length > 1 ? allValues.join(', ') : allValues[0];
            }
        }
        
        eventData.eventType = form.querySelector('input[name="eventType"]:checked').value;
        if(!isEditMode) {
            eventData.creator = getCurrentUser();
            if (formData.has('createdTime') && formData.get('createdTime')) {
                 try {
                    const localDate = new Date(formData.get('createdTime'));
                    if (!isNaN(localDate.getTime())) {
                        eventData.createdTime = localDate.toISOString();
                    }
                 } catch(e) { /* 忽略 */ }
            }
        }
        
        const url = isEditMode ? `/api/events/${eventId}` : '/api/events';
        const method = isEditMode ? 'PUT' : 'POST';

        const result = await authedFetch(url, { method, body: JSON.stringify(eventData) });
        
        if (result.success) {
            closeModal('event-log-modal');
        } else {
            throw new Error(result.details || '操作失敗');
        }
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            showNotification(`操作失敗: ${error.message}`, 'error');
        }
    } finally {
        hideLoading();
    }
}

document.addEventListener('submit', function(e) {
    if (e.target.id === 'event-log-form') {
        handleEventFormSubmit(e);
    }
});