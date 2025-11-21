// public/scripts/event-editor-standalone.js
// 職責：獨立的事件編輯器控制器 (彈性並排 + 專屬資訊分離版)

const EventEditorStandalone = (() => {
    let _modal, _form, _inputs = {};
    let _selectedOurParticipants = new Set();
    let _selectedClientParticipants = new Set();
    let _isInitialized = false;

    function _init() {
        if (_isInitialized) return;
        _modal = document.getElementById('standalone-event-modal');
        if (!_modal) return;
        _form = document.getElementById('standalone-event-form');
        
        _inputs = {
            id: document.getElementById('standalone-eventId'),
            oppId: document.getElementById('standalone-opportunityId'),
            compId: document.getElementById('standalone-companyId'),
            type: document.getElementById('standalone-type'),
            name: document.getElementById('standalone-name'),
            time: document.getElementById('standalone-createdTime'),
            location: document.getElementById('standalone-location'),
            
            // 靜態通用欄位 (左欄)
            content: document.getElementById('standalone-content'),
            questions: document.getElementById('standalone-questions'),
            intelligence: document.getElementById('standalone-intelligence'),
            notes: document.getElementById('standalone-notes'),

            ourContainer: document.getElementById('standalone-our-participants-container'),
            clientContainer: document.getElementById('standalone-client-participants-container'),
            manualClient: document.getElementById('standalone-manual-participants'),
            
            // 動態專屬欄位容器 (右欄)
            specificWrapper: document.getElementById('standalone-specific-wrapper'),
            specificContainer: document.getElementById('standalone-specific-container'),
            workspaceGrid: document.getElementById('workspace-container'),

            submitBtn: document.getElementById('standalone-submit-btn'),
            deleteBtn: document.getElementById('standalone-delete-btn'),
            closeBtn: document.getElementById('standalone-close-btn')
        };

        _inputs.closeBtn.onclick = _close;
        _form.onsubmit = _handleSubmit;
        _isInitialized = true;
    }

    async function open(eventId) {
        _init();
        _resetForm();
        _modal.style.display = 'block';
        
        try {
            _setLoading(true, '載入中...');
            const result = await authedFetch(`/api/events/${eventId}`);
            if (result.success) {
                const eventData = result.data;
                _inputs.deleteBtn.style.display = 'block';
                _inputs.deleteBtn.onclick = () => _confirmDelete(eventData.eventId, eventData.eventName);
                await _populateForm(eventData);
            } else {
                showNotification('無法載入事件: ' + result.error, 'error');
                _close();
            }
        } catch (e) {
            console.error(e);
            showNotification('發生錯誤', 'error');
            _close();
        } finally {
            _setLoading(false);
        }
    }

    async function _populateForm(eventData) {
        // 填入基本資料
        _inputs.id.value = eventData.eventId;
        _inputs.oppId.value = eventData.opportunityId || '';
        _inputs.compId.value = eventData.companyId || '';
        _inputs.name.value = eventData.eventName || '';
        _inputs.location.value = eventData.visitPlace || '';
        
        // 填入靜態通用欄位
        _inputs.content.value = eventData.eventContent || '';
        _inputs.questions.value = eventData.clientQuestions || '';
        _inputs.intelligence.value = eventData.clientIntelligence || '';
        _inputs.notes.value = eventData.eventNotes || '';

        if (eventData.createdTime) {
            const date = new Date(eventData.createdTime);
            date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
            _inputs.time.value = date.toISOString().slice(0, 16);
        }

        const eventType = eventData.eventType || 'general';
        const typeToSelect = eventType === 'legacy' ? 'iot' : eventType;
        
        // 載入類型 (這會決定是否顯示右欄)
        await _applyTypeSwitch(typeToSelect, null);

        // 人員處理
        _selectedOurParticipants.clear();
        (eventData.ourParticipants || '').split(',').map(p => p.trim()).filter(Boolean).forEach(p => _selectedOurParticipants.add(p));
        
        _selectedClientParticipants.clear();
        const clientList = (eventData.clientParticipants || '').split(',').map(p => p.trim()).filter(Boolean);
        
        _renderParticipants('our', _inputs.ourContainer, window.CRM_APP.systemConfig['團隊成員'] || [], _selectedOurParticipants);
        await _fetchAndPopulateClientParticipants(eventData.opportunityId, eventData.companyId, clientList);

        // 填入動態專屬欄位 (右欄)
        setTimeout(() => {
            // 遍歷資料，嘗試填入表單中有名稱對應的欄位
            for (const key in eventData) {
                // 跳過已處理的標準欄位
                if (['eventId', 'opportunityId', 'companyId', 'eventName', 'visitPlace', 'createdTime', 'ourParticipants', 'clientParticipants', 'eventType', 'eventContent', 'clientQuestions', 'clientIntelligence', 'eventNotes'].includes(key)) continue;
                
                // 尋找右欄中的輸入框
                const el = _inputs.specificContainer.querySelector(`[name="${key}"], [name="iot_${key}"], [name="dt_${key}"]`);
                if (el) {
                    if (el.type === 'checkbox' || el.type === 'radio') {
                        const values = String(eventData[key]).split(',').map(s => s.trim());
                        if (values.includes(el.value)) el.checked = true;
                    } else {
                        el.value = eventData[key] || '';
                    }
                }
            }
        }, 100);
    }

    function selectType(newType, cardElement) {
        const currentType = _inputs.type.value;
        if (currentType === newType) return;
        _applyTypeSwitch(newType, cardElement);
    }

    async function _applyTypeSwitch(newType, cardElement) {
        // 更新 UI
        const grid = document.querySelector('#standalone-event-modal .type-select-grid');
        if (grid) {
            grid.querySelectorAll('.type-select-card').forEach(el => el.classList.remove('selected'));
            if (cardElement) cardElement.classList.add('selected');
            else {
                const target = grid.querySelector(`.type-select-card[data-type="${newType}"]`);
                if(target) target.classList.add('selected');
            }
        }
        _inputs.type.value = newType;

        // 如果是 General，直接隱藏右欄，結束
        if (newType === 'general') {
            _inputs.specificContainer.innerHTML = '';
            _inputs.specificWrapper.style.display = 'none';
            _inputs.workspaceGrid.classList.remove('has-sidebar');
            return;
        }

        // 載入範本並提取「專屬資訊」
        let formName = newType === 'dx' ? 'general' : newType;
        let html = window.CRM_APP.formTemplates[formName];
        
        if (!html) {
            try {
                const res = await fetch(`event-form-${formName}.html`);
                html = await res.text();
                window.CRM_APP.formTemplates[formName] = html;
            } catch (e) {
                console.error("載入範本失敗", e);
                return;
            }
        }

        // 解析 HTML 提取專屬欄位
        const parser = new DOMParser();
        const doc = parser.parseFromString(html, 'text/html');
        
        // 尋找不包含「共通資訊」的 fieldset
        let specificContent = '';
        const fieldsets = doc.querySelectorAll('fieldset');
        fieldsets.forEach(fs => {
            const legend = fs.querySelector('legend');
            if (!legend || !legend.textContent.includes('共通資訊')) {
                // 移除 legend 標籤本身，只取內容
                if(legend) legend.remove();
                specificContent += fs.innerHTML;
            }
        });

        if (specificContent.trim()) {
            _inputs.specificContainer.innerHTML = specificContent;
            _inputs.specificWrapper.style.display = 'block';
            _inputs.workspaceGrid.classList.add('has-sidebar'); // 觸發並排
        } else {
            // 如果雖然是特殊類型但沒抓到專屬欄位 (如 DX 也是用 general 範本)
            _inputs.specificContainer.innerHTML = '';
            _inputs.specificWrapper.style.display = 'none';
            _inputs.workspaceGrid.classList.remove('has-sidebar');
        }
    }

    // 人員處理
    async function _fetchAndPopulateClientParticipants(oppId, compId, currentList) {
        let contacts = [];
        try {
            if (oppId) {
                const res = await authedFetch(`/api/opportunities/${oppId}/details`);
                if (res.success) contacts = res.data.linkedContacts || [];
            } else if (compId) {
                const all = await authedFetch(`/api/companies`).then(r => r.data || []);
                const comp = all.find(c => c.companyId === compId);
                if (comp) {
                    const res = await authedFetch(`/api/companies/${encodeURIComponent(comp.companyName)}/details`);
                    if (res.success) contacts = res.data.contacts || [];
                }
            }
        } catch (e) { console.error(e); }

        const manualList = [];
        const knownNames = new Set(contacts.map(c => c.name));
        currentList.forEach(p => {
            // 只有在名單內才轉為膠囊，否則保留為手動輸入
            if (knownNames.has(p)) _selectedClientParticipants.add(p);
            else manualList.push(p);
        });
        
        _renderParticipants('client', _inputs.clientContainer, contacts, _selectedClientParticipants);
        _inputs.manualClient.value = manualList.join(', ');
    }

    function _renderParticipants(type, container, list, set) {
        if (list.length === 0) {
            container.innerHTML = '<span style="color:var(--text-muted); font-size:0.85rem;">無資料</span>';
            return;
        }
        container.innerHTML = list.map(item => {
            const val = item.name || item.note;
            const label = item.position ? `${val} (${item.position})` : val;
            const selected = set.has(val) ? 'selected' : '';
            return `<span class="participant-pill-tag ${selected}" onclick="EventEditorStandalone.toggleParticipant('${type}', '${val}', this)">${label}</span>`;
        }).join('');
    }

    function toggleParticipant(type, val, el) {
        const set = type === 'our' ? _selectedOurParticipants : _selectedClientParticipants;
        if (set.has(val)) {
            set.delete(val);
            el.classList.remove('selected');
        } else {
            set.add(val);
            el.classList.add('selected');
        }
    }

    async function _handleSubmit(e) {
        e.preventDefault();
        const id = _inputs.id.value;
        const formData = new FormData(_form);
        const data = {};
        for (let [k, v] of formData.entries()) if (!data[k]) data[k] = v;

        data.ourParticipants = Array.from(_selectedOurParticipants).join(', ');
        const manuals = _inputs.manualClient.value.split(',').map(s => s.trim()).filter(Boolean);
        data.clientParticipants = [...Array.from(_selectedClientParticipants), ...manuals].join(', ');
        if (_inputs.time.value) data.createdTime = new Date(_inputs.time.value).toISOString();

        // 多選 Checkbox 處理
        const checkboxes = _form.querySelectorAll('input[type="checkbox"][name]:checked');
        const multi = {};
        checkboxes.forEach(cb => {
            if(!multi[cb.name]) multi[cb.name] = [];
            multi[cb.name].push(cb.value);
        });
        for (let k in multi) data[k] = multi[k].join(', ');

        _setLoading(true, '儲存中...');
        try {
            const res = await authedFetch(`/api/events/${id}`, {
                method: 'PUT',
                body: JSON.stringify(data)
            });
            if (res.success) {
                _close();
                if (window.CRM_APP && window.CRM_APP.refreshCurrentView) {
                    window.CRM_APP.refreshCurrentView('更新成功！');
                }
            } else {
                throw new Error(res.error);
            }
        } catch (e) {
            showNotification('儲存失敗: ' + e.message, 'error');
        } finally {
            _setLoading(false);
        }
    }

    function _confirmDelete(id, name) {
        showConfirmDialog(`確定刪除事件 "${name}"？此操作無法復原。`, async () => {
            showLoading('刪除中...');
            try {
                await authedFetch(`/api/events/${id}`, { method: 'DELETE' });
                _close();
                closeModal('event-log-report-modal');
            } catch (e) { console.error(e); } finally { hideLoading(); }
        });
    }

    function _close() { if (_modal) _modal.style.display = 'none'; }
    function _resetForm() {
        _form.reset();
        _selectedOurParticipants.clear();
        _selectedClientParticipants.clear();
        _setLoading(false);
        // 重置佈局
        _inputs.specificContainer.innerHTML = '';
        _inputs.specificWrapper.style.display = 'none';
        _inputs.workspaceGrid.classList.remove('has-sidebar');
    }
    function _setLoading(isLoading, text) {
        _inputs.submitBtn.disabled = isLoading;
        _inputs.submitBtn.textContent = isLoading ? text : '儲存';
    }

    return {
        open: open,
        selectType: selectType,
        toggleParticipant: toggleParticipant
    };
})();

window.EventEditorStandalone = EventEditorStandalone;