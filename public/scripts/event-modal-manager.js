// BFN: tfc433/1027test1/1027test1-e966c259b5fd445713230ea1bdf23f158d8e9bfd/views/scripts/event-modal-manager.js
// 職責：管理所有與「新增/編輯事件」彈出視窗相關的複雜邏輯

let eventOppSearchTimeout;
let eventCompanySearchTimeout;

async function showEventLogFormModal(options = {}) {
    // 確保 Modal HTML 已載入
    if (!document.getElementById('event-log-modal')) {
        console.error('Event log modal HTML not loaded!');
        showNotification('無法開啟事件紀錄視窗，元件遺失。', 'error');
        return;
    }
    
    const form = document.getElementById('event-log-form');
    form.reset();
    
    // 【修改】在重設表單後，手動隱藏管理員欄位
    const adminTimeGroup = document.getElementById('admin-created-time-group');
    if (adminTimeGroup) adminTimeGroup.style.display = 'none';
    
    showModal('event-log-modal');

    const title = document.getElementById('event-log-modal-title');
    const submitBtn = document.getElementById('event-log-submit-btn');
    const linkSection = document.getElementById('event-link-section');
    const eventIdInput = document.getElementById('event-log-eventId');
    const typeSelectorContainer = form.querySelector('.segmented-control');
    
    // 【新增】獲取刪除按鈕
    const deleteBtn = document.getElementById('event-log-delete-btn');

    if (options.eventId) { // 編輯模式
        title.textContent = '✏️ 編輯事件紀錄';
        submitBtn.textContent = '💾 儲存變更';
        linkSection.style.display = 'none'; // 編輯時隱藏關聯對象選擇
        
        typeSelectorContainer.style.pointerEvents = 'auto';
        typeSelectorContainer.style.opacity = '1';

        try {
            const result = await authedFetch(`/api/events/${options.eventId}`);
            if (!result.success) throw new Error('無法載入事件資料');
            const eventData = result.data;
            
            // 【新增】顯示並綁定刪除按鈕
            deleteBtn.style.display = 'block';
            deleteBtn.onclick = () => confirmDeleteEvent(eventData.eventId, eventData.eventName);

            await populateEventLogForm(eventData);
        } catch (error) {
            if (error.message !== 'Unauthorized') showNotification(`載入資料失敗: ${error.message}`, 'error');
            closeModal('event-log-modal');
        }

    } else { // 新增模式
        title.textContent = '📝 新增事件紀錄';
        submitBtn.textContent = '💾 儲存事件紀錄';
        eventIdInput.value = '';
        linkSection.style.display = 'block';
        typeSelectorContainer.style.pointerEvents = 'auto';
        
        // 【新增】隱藏刪除按鈕
        deleteBtn.style.display = 'none';
        deleteBtn.onclick = null;

        // --- 【核心修正】處理從特定情境開啟 modal 的情況 ---
        if (options.opportunityId) {
            document.querySelector('input[name="linkType"][value="opportunity"]').checked = true;
            toggleEventLinkType(); // 觸發介面更新
            // 直接傳入從外部按鈕帶來的機會資訊，這會自動觸發關聯聯絡人載入
            selectOpportunityForEvent({ 
                opportunityId: options.opportunityId, 
                opportunityName: options.opportunityName, 
                customerCompany: options.companyName || '' 
            });
        } else if (options.companyId) {
            document.querySelector('input[name="linkType"][value="company"]').checked = true;
            toggleEventLinkType();
            selectCompanyForEvent({ companyId: options.companyId, companyName: options.companyName });
        } else {
            // 預設情況
            document.querySelector('input[name="linkType"][value="opportunity"]').checked = true;
            toggleEventLinkType();
        }

        document.querySelector('input[name="eventType"][value="general"]').checked = true;
        await loadEventTypeForm('general');
    }
}

/**
 * 【新增】刪除事件的確認函式
 * @param {string} eventId
 * @param {string} eventName
 */
async function confirmDeleteEvent(eventId, eventName) {
    const safeEventName = eventName || '此事件';
    const message = `您確定要永久刪除事件 "${safeEventName}" 嗎？\n\n此操作無法復原，但系統會留下一筆刪除互動紀錄。`;

    showConfirmDialog(message, async () => {
        showLoading('正在刪除事件...');
        try {
            // authedFetch 會自動處理 API 呼叫、成功通知和頁面刷新
            const result = await authedFetch(`/api/events/${eventId}`, {
                method: 'DELETE'
            });

            // 【*** 程式碼修改點：移除 modal 關閉邏輯 ***】
            // if (result.success) {
            //     // 關閉所有可能開啟的相關 Modal
            //     closeModal('event-log-modal');
            //     closeModal('event-log-report-modal');
            //     // 成功訊息和頁面刷新將由 authedFetch (utils.js) 處理
            // } else {
            //     throw new Error(result.error || '刪除失敗');
            // }
            // 【*** 修改結束 ***】

        } catch (error) {
            // authedFetch 已經顯示了錯誤通知
            if (error.message !== 'Unauthorized') {
                console.error('刪除事件失敗:', error);
            }
        } finally {
            // 【*** 程式碼修改點：在 finally 中統一處理 ***】
            // 無論成功或失敗，都必須隱藏 loading 畫面並關閉 Modal。
            // authedFetch 成功時會觸發 *view refresh* (非 full reload)，
            // 所以 loading 畫面會一直留著，直到這裡將它關閉。
            hideLoading();
            closeModal('event-log-modal');
            closeModal('event-log-report-modal');
        }
    });
}


function toggleEventLinkType() {
    const linkType = document.querySelector('input[name="linkType"]:checked').value;
    const entitySelector = document.getElementById('event-log-entity-selector');
    
    // --- 【核心修正】在切換時清空舊資料 ---
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
    // 【核心修正】徹底清空客戶與會人員列表，顯示預設提示
    _populateClientParticipantsCheckboxes([], []);
}

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
    
    // 收集客戶與會人員
    const clientParticipantsChecked = Array.from(container.querySelectorAll('[name="clientParticipants-checkbox"]:checked')).map(cb => cb.value);
    const otherParticipant = container.querySelector('[name="clientParticipants-other"]')?.value.trim();
    if (otherParticipant) {
        // 將手動輸入的用逗號分隔後加入
        clientParticipantsChecked.push(...otherParticipant.split(',').map(p => p.trim()).filter(Boolean));
    }
    data.clientParticipants = clientParticipantsChecked; // 直接回傳陣列，由後端處理

    return data;
}

function _setCommonFieldData(container, data) {
    if (!container || !data) return;
    for (const key in data) {
        if (key !== 'ourParticipants' && key !== 'clientParticipants') {
            const element = container.querySelector(`[name="${key}"]`);
            if (element) element.value = data[key];
        }
    }
}

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
    // 將之前已勾選或輸入的客戶與會人員傳遞下去
    const clientParticipantsArray = Array.isArray(commonData.clientParticipants) ? commonData.clientParticipants : (commonData.clientParticipants || '').split(',').map(p => p.trim());
    await _fetchAndPopulateClientParticipants(opportunityId, companyId, clientParticipantsArray);
}

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
            // 改為從API獲取公司詳細資訊來確保資料正確
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

function _populateClientParticipantsCheckboxes(contacts = [], selectedParticipants = []) {
    const container = document.getElementById('client-participants-container');
    if (!container) return;

    const selectedSet = new Set(selectedParticipants);
    const contactNames = new Set(contacts.map(c => c.name));
    
    let checkboxesHTML = '';
    if (contacts.length > 0) {
        checkboxesHTML = contacts.map(contact => `
            <label>
                <input type="checkbox" name="clientParticipants-checkbox" value="${contact.name}" ${selectedSet.has(contact.name) ? 'checked' : ''}>
                <span>${contact.name} (${contact.position || 'N/A'})</span>
            </label>
        `).join('');
    } else {
        checkboxesHTML = '<p style="color: var(--text-muted); grid-column: 1 / -1; text-align: center;">此對象尚無已建檔的關聯聯絡人。</p>';
    }

    // 將不在關聯清單中，但卻被選中的項目，視為手動輸入
    const otherParticipants = selectedParticipants.filter(p => p && !contactNames.has(p)).join(', ');

    container.innerHTML = `
        <div class="participants-checkbox-group">${checkboxesHTML}</div>
        <input type="text" name="clientParticipants-other" class="form-input other-participant-input" placeholder="其他與會人員 (若無關聯資料，請在此手動輸入，用逗號分隔)" value="${otherParticipants}">
    `;
}

function handleOpportunitySearchForEvent(event) {
    clearTimeout(eventOppSearchTimeout);
    eventOppSearchTimeout = setTimeout(async () => {
        const query = event.target.value;
        const resultsContainer = document.getElementById('event-log-opportunity-results');
        if (query.length < 1) { resultsContainer.innerHTML = ''; return; }
        resultsContainer.innerHTML = '<div class="loading show"><div class="spinner" style="width: 20px; height: 20px;"></div></div>';
        try {
            const opportunities = await authedFetch(`/api/opportunities?q=${encodeURIComponent(query)}&page=0`);
            resultsContainer.innerHTML = (opportunities && opportunities.length > 0)
                ? opportunities.map(opp => `<div class="search-result-item" onclick='selectOpportunityForEvent(${JSON.stringify(opp).replace(/'/g, "&apos;")})'><strong>${opp.opportunityName}</strong><br><small>${opp.customerCompany}</small></div>`).join('')
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
            const companies = (result.data || []).filter(c => c.companyName.toLowerCase().includes(query.toLowerCase()));
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
    
    // 【新增】顯示並填入「建立時間」欄位
    const createdTimeGroup = document.getElementById('admin-created-time-group');
    const createdTimeInput = document.getElementById('event-log-createdTime');
    if (createdTimeGroup && createdTimeInput && eventData.createdTime) {
        try {
            const date = new Date(eventData.createdTime);
            // 轉換為 YYYY-MM-DDTHH:MM 格式
            const localDateTime = new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().slice(0, 16);
            createdTimeInput.value = localDateTime;
            createdTimeGroup.style.display = 'block'; // 顯示欄位
        } catch (e) {
            console.warn("無法解析建立時間:", eventData.createdTime, e);
            createdTimeGroup.style.display = 'none';
        }
    }
    // 【新增結束】
}

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

        // 【新增】處理「建立時間」覆寫
        const createdTimeInput = document.getElementById('admin-created-time-group');
        if (isEditMode && createdTimeInput && createdTimeInput.style.display !== 'none' && form.createdTime.value) {
            try {
                // 將本地時間轉換為 ISO 字串
                const localDate = new Date(form.createdTime.value);
                if (!isNaN(localDate.getTime())) {
                    eventData.createdTime = localDate.toISOString();
                    console.log("正在覆寫建立時間為:", eventData.createdTime);
                }
            } catch (e) {
                console.warn("無法解析覆寫的建立時間:", form.createdTime.value);
            }
        }
        // 【新增結束】

        for (let [key, value] of formData.entries()) {
            // 【修改】如果 'createdTime' 已經被手動處理，就跳過
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
            // 如果是新增模式，且使用者手動填了時間，也接受
            if (formData.has('createdTime') && formData.get('createdTime')) {
                 try {
                    const localDate = new Date(formData.get('createdTime'));
                    if (!isNaN(localDate.getTime())) {
                        eventData.createdTime = localDate.toISOString();
                    }
                 } catch(e) { /* 忽略錯誤，使用後端預設值 */ }
            }
        }
        
        const url = isEditMode ? `/api/events/${eventId}` : '/api/events';
        const method = isEditMode ? 'PUT' : 'POST';

        const result = await authedFetch(url, { method, body: JSON.stringify(eventData) });
        
        if (result.success) {
            // 【*** 移除衝突 ***】
            // 關閉 Modal 的邏輯移到 authedFetch 成功回呼中
            // authedFetch 會處理頁面刷新和通知
            closeModal('event-log-modal');
            // showNotification(result.migrated ? '事件已成功遷移至新分類！' : (isEditMode ? '事件紀錄更新成功！' : '事件紀錄儲存成功！'), 'success');
            
            // if (document.getElementById('page-events').style.display === 'block') await loadEventLogsPage();
            // if (document.getElementById('page-opportunity-details').style.display === 'block' && window.currentDetailOpportunityId) await loadOpportunityDetailPage(window.currentDetailOpportunityId);
            // if (document.getElementById('page-company-details').style.display === 'block') {
            //     const companyName = document.querySelector('#page-title').textContent;
            //     if(companyName) await CRM_APP.navigateTo('company-details', { companyName: encodeURIComponent(companyName) });
            // }
            // 【*** 移除結束 ***】
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