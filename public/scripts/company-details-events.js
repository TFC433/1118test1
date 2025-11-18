// views/scripts/company-details-events.js
// 職責：處理「公司詳細資料頁」的所有使用者互動事件

// 全域變數，用於儲存當前頁面的公司資料
let _currentCompanyInfo = null;

/**
 * 初始化函式，由主控制器呼叫以傳入資料並綁定事件
 * @param {object} companyInfo - 當前公司的詳細資料物件
 */
function initializeCompanyEventListeners(companyInfo) {
    _currentCompanyInfo = companyInfo; // 儲存公司資料以供其他函式使用
}

// =============================================
// SECTION 2: 全域互動函式
// =============================================


function showEventLogModalByCompany() {
    if (_currentCompanyInfo && _currentCompanyInfo.companyId) {
        showEventLogFormModal({
            companyId: _currentCompanyInfo.companyId,
            companyName: _currentCompanyInfo.companyName
        });
    } else {
        showNotification('找不到當前公司的資訊，無法新增事件。', 'error');
    }
}


function toggleCompanyEditMode(isEditing, aiData = null) {
    const displayMode = document.getElementById('company-info-display-mode');
    const editMode = document.getElementById('company-info-edit-mode');

    if (isEditing) {
        displayMode.style.display = 'none';
        editMode.style.display = 'block';

        const systemConfig = window.CRM_APP.systemConfig;
        
        const createSelectHTML = (configKey, dataFieldKey, selectedValue) => {
            let optionsHtml = '<option value="">請選擇...</option>';
            (systemConfig[configKey] || []).forEach(opt => {
                optionsHtml += `<option value="${opt.value}" ${opt.value === selectedValue ? 'selected' : ''}>${opt.note}</option>`;
            });
            return `<div class="select-wrapper"><select class="form-select" data-field="${dataFieldKey}">${optionsHtml}</select></div>`;
        };
        
        // 【修正】如果 aiData 存在，就與現有資料合併，而不是直接取代
        const data = aiData ? { ..._currentCompanyInfo, ...aiData } : _currentCompanyInfo;

        // 【排版修正】將按鈕從 header 移至表單底部
        editMode.innerHTML = `
            <div class="info-card-header">
                <h2 class="widget-title" style="margin: 0;">編輯公司資料</h2>
                </div>

            <div class="core-info-grid">
                <div class="core-info-item">
                    <div class="info-label">公司類型</div>
                    ${createSelectHTML('公司類型', 'companyType', data.companyType)}
                </div>
                <div class="core-info-item">
                    <div class="info-label">客戶階段</div>
                    ${createSelectHTML('客戶階段', 'customerStage', data.customerStage)}
                </div>
                <div class="core-info-item">
                    <div class="info-label">互動評級</div>
                    ${createSelectHTML('互動評級', 'engagementRating', data.engagementRating)}
                </div>
            </div>

            <div class="company-introduction-section">
                <div class="info-label">公司簡介</div>
                <textarea class="form-textarea" data-field="introduction" rows="6" placeholder="輸入或使用 AI 生成簡介...">${data.introduction || ''}</textarea>
            </div>
            
            <div class="form-group" style="margin-top: 1.5rem;">
                <label for="company-keywords-input" class="form-label" style="font-size: 0.8rem; color: var(--text-muted);">AI 生成線索 (選填)</label>
                <div style="display: flex; gap: 0.5rem;">
                    <input type="text" id="company-keywords-input" class="form-input" placeholder="例如：CNC控制器、自動化設備...">
                    <button class="action-btn primary" id="generate-profile-btn" onclick="generateCompanyProfile()" style="white-space: nowrap;">✨ AI 生成簡介</button>
                </div>
            </div>

            <div class="additional-info-grid">
                <div class="additional-info-item">
                    <div class="info-label">電話</div>
                    <input type="text" class="form-input" data-field="phone" value="${data.phone || ''}">
                </div>
                <div class="additional-info-item">
                    <div class="info-label">縣市</div>
                     <div class="select-wrapper">
                        <select class="form-select" data-field="county">
                            <option value="">請選擇縣市...</option>
                            ${["臺北市", "新北市", "桃園市", "臺中市", "臺南市", "高雄市", "基隆市", "新竹市", "嘉義市", "新竹縣", "苗栗縣", "彰化縣", "南投縣", "雲林縣", "嘉義縣", "屏東縣", "宜蘭縣", "花蓮縣", "臺東縣"].map(c => `<option value="${c}" ${c === data.county ? 'selected' : ''}>${c}</option>`).join('')}
                        </select>
                    </div>
                </div>
                <div class="additional-info-item" style="grid-column: span 2;">
                    <div class="info-label">地址</div>
                    <input type="text" class="form-input" data-field="address" value="${data.address || ''}">
                </div>
            </div>
            <div class="btn-group" id="company-info-buttons-edit">
                <button type="button" class="action-btn danger" onclick="confirmDeleteCompany()" style="margin-right: auto;">🗑️ 刪除公司</button>
                
                <button type="button" class="action-btn secondary" onclick="toggleCompanyEditMode(false)">取消</button>
                <button type="button" class="action-btn primary" onclick="saveCompanyInfo()">💾 儲存</button>
            </div>
        `;

    } else { 
        displayMode.style.display = 'block';
        editMode.style.display = 'none';
        editMode.innerHTML = '';
    }
}

/**
 * 【新增】刪除公司的確認函式
 */
async function confirmDeleteCompany() {
    if (!_currentCompanyInfo) return;

    const companyName = _currentCompanyInfo.companyName;
    const message = `您確定要永久刪除公司「${companyName}」嗎？\n\n⚠️ 警告：此操作無法復原。\n\n(注意：如果該公司仍有關聯的機會案件或事件紀錄，系統將會阻止刪除。)`;

    showConfirmDialog(message, async () => {
        showLoading('正在刪除公司...');
        try {
            const encodedCompanyName = encodeURIComponent(companyName);
            
            // --- 【*** 核心修改 ***】 ---
            // 呼叫 authedFetch 進行刪除。
            const result = await authedFetch(`/api/companies/${encodedCompanyName}`, {
                method: 'DELETE'
            });

            if (result.success) {
                // 刪除成功後，authedFetch 會顯示通知並排程刷新。
                // 我們立即導航到公司列表頁，這會覆蓋掉 authedFetch 的刷新動作，
                // 避免使用者刷新到一個已經不存在的 404 頁面。
                CRM_APP.navigateTo('companies'); 
            }
            // 如果 result.success 是 false (例如業務邏輯不允許刪除)，
            // authedFetch 會拋出錯誤，並在 catch 區塊被接住。
            // --- 【*** 修改結束 ***】 ---

        } catch (error) {
            // authedFetch 會自動顯示 400 (業務邏輯錯誤) 或 500 (伺服器錯誤) 的通知
            // 並且 authedFetch 會自動 hideLoading
            if (error.message !== 'Unauthorized') {
                 console.error('刪除公司失敗 (由 authedFetch 處理):', error);
            }
            // 確保 loading 隱藏 (即使 authedFetch 邏輯出錯)
            hideLoading();
        }
    });
}


async function saveCompanyInfo() {
    const editMode = document.getElementById('company-info-edit-mode');
    if (!editMode) return;

    const updateData = {};
    const fields = editMode.querySelectorAll('[data-field]');
    fields.forEach(input => {
        const fieldName = input.dataset.field;
        updateData[fieldName] = input.value;
    });

    showLoading('正在儲存公司資料...');
    try {
        const encodedCompanyName = encodeURIComponent(_currentCompanyInfo.companyName);
        const result = await authedFetch(`/api/companies/${encodedCompanyName}`, {
            method: 'PUT',
            body: JSON.stringify(updateData),
        });

        if (result.success) {
            // 【*** 移除衝突 ***】
            // 儲存成功，authedFetch 會自動處理通知和刷新當前頁面
            // showNotification('公司資料更新成功！', 'success'); // authedFetch 會處理
            // 【*** 移除結束 ***】
        } else {
            throw new Error(result.error || '儲存失敗');
        }
    } catch (error) {
        if (error.message !== 'Unauthorized') {
             // authedFetch 會處理錯誤通知
             // showNotification(`儲存失敗: ${error.message}`, 'error');
        }
    } finally {
        // authedFetch 會自動隱藏 loading
        hideLoading();
    }
}

async function generateCompanyProfile() {
    const keywords = document.getElementById('company-keywords-input').value;
    const btn = document.getElementById('generate-profile-btn');
    btn.disabled = true;
    btn.innerHTML = `<div class="spinner" style="width: 20px; height: 20px; border-width: 2px; margin: 0 auto;"></div>`;

    try {
        const encodedCompanyName = encodeURIComponent(_currentCompanyInfo.companyName);
        // 【關鍵修正】加入 skipRefresh: true，防止 AI 生成 (POST 請求) 觸發頁面重載，導致編輯狀態丟失
        const result = await authedFetch(`/api/companies/${encodedCompanyName}/generate-profile`, {
            method: 'POST',
            body: JSON.stringify({ userKeywords: keywords }),
            skipRefresh: true // <--- 修正重點
        });

        if (result.success && result.data) {
            showNotification('AI 簡介已成功生成！', 'success');
            // 【修正】直接在這裡合併資料，而不是讓 toggleCompanyEditMode 處理
            const mergedData = {
                ..._currentCompanyInfo, // 先帶入現有資料
                ...result.data          // 再用 AI 的資料覆蓋特定欄位
            };
            // 重新渲染編輯模式，這會把新生成的資料填入表單
            toggleCompanyEditMode(true, mergedData);
        } else {
            throw new Error(result.message || 'AI 未能生成有效的資料');
        }
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            // authedFetch 會處理
            // showNotification(`AI 生成失敗: ${error.message}`, 'error');
        }
    } finally {
        // AI 生成不是寫入操作 (skipRefresh=true)，authedFetch 不會 reload，
        // 所以我們必須手動恢復按鈕狀態
        btn.disabled = false;
        btn.innerHTML = '✨ AI 生成簡介';
        hideLoading(); // 確保 hideLoading 被呼叫
    }
}

function toggleIntroduction(btn) {
    const content = document.getElementById('intro-content');
    content.classList.toggle('expanded');
    btn.textContent = content.classList.contains('expanded') ? '收合' : '...顯示更多';
}

function showEditContactModal(contact) {
    const modalContainer = document.createElement('div');
    modalContainer.id = 'edit-contact-modal-container';
    
    modalContainer.innerHTML = `
        <div id="edit-contact-modal" class="modal" style="display: block;">
            <div class="modal-content" style="max-width: 600px;">
                <div class="modal-header">
                    <h2 class="modal-title">編輯聯絡人: ${contact.name}</h2>
                    <button class="close-btn" onclick="closeEditContactModal()">&times;</button>
                </div>
                <form id="edit-contact-form">
                    <input type="hidden" id="edit-contact-id" value="${contact.contactId}">
                    <div class="form-row">
                        <div class="form-group"><label class="form-label">部門</label><input type="text" class="form-input" id="edit-contact-department" value="${contact.department || ''}"></div>
                        <div class="form-group"><label class="form-label">職位</label><input type="text" class="form-input" id="edit-contact-position" value="${contact.position || ''}"></div>
                    </div>
                    <div class="form-row">
                        <div class="form-group"><label class="form-label">手機</label><input type="tel" class="form-input" id="edit-contact-mobile" value="${contact.mobile || ''}"></div>
                        <div class="form-group"><label class="form-label">公司電話</label><input type="tel" class="form-input" id="edit-contact-phone" value="${contact.phone || ''}"></div>
                    </div>
                    <div class="form-group"><label class="form-label">Email</label><input type="email" class="form-input" id="edit-contact-email" value="${contact.email || ''}"></div>
                    <button type="submit" class="submit-btn">💾 儲存變更</button>
                </form>
            </div>
        </div>
    `;
    
    document.body.appendChild(modalContainer);
    document.getElementById('edit-contact-form').addEventListener('submit', handleSaveContact);
}

function closeEditContactModal() {
    const modalContainer = document.getElementById('edit-contact-modal-container');
    if (modalContainer) {
        modalContainer.remove();
    }
}

async function handleSaveContact(e) {
    e.preventDefault();
    const contactId = document.getElementById('edit-contact-id').value;
    const updateData = {
        department: document.getElementById('edit-contact-department').value,
        position: document.getElementById('edit-contact-position').value,
        mobile: document.getElementById('edit-contact-mobile').value,
        phone: document.getElementById('edit-contact-phone').value,
        email: document.getElementById('edit-contact-email').value,
    };

    showLoading('正在儲存聯絡人資料...');
    try {
        const result = await authedFetch(`/api/contacts/${contactId}`, {
            method: 'PUT',
            body: JSON.stringify(updateData)
        });

        if (result.success) {
            // 【*** 移除衝突 ***】
            // authedFetch 會處理刷新
            closeEditContactModal();
            // 【*** 移除結束 ***】
        } else {
            throw new Error(result.error || '儲存失敗');
        }
    } catch (error) {
        if (error.message !== 'Unauthorized') {
             // authedFetch 會處理
        }
    } finally {
        // authedFetch 會處理
        hideLoading(); 
    }
}