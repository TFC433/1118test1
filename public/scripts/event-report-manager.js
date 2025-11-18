// BFN: tfc433/1027test1/1027test1-e966c259b5fd445713230ea1bdf23f158d8e9bfd/views/scripts/event-report-manager.js
// views/scripts/event-report-manager.js
// 職責：專門負責「查看報告」彈窗的顯示、渲染與匯出功能

/**
 * 顯示單筆事件的詳細報告彈出視窗
 * @param {string} eventId - 要顯示報告的事件 ID
 */
async function showEventLogReport(eventId) {
    let modalContent = document.getElementById('event-log-report-content');
    
    if (!modalContent) {
        const modalContainer = document.getElementById('modal-container');
        try {
            const modalViewsHtml = await fetch('event-log-views.html').then(res => res.text());
            modalContainer.insertAdjacentHTML('beforeend', modalViewsHtml);
            modalContent = document.getElementById('event-log-report-content');
        } catch (error) {
            console.error('載入 event-log-views.html 失敗:', error);
            showNotification('無法開啟報告視窗', 'error');
            return;
        }
    }
    
    modalContent.innerHTML = '<div class="loading show"><div class="spinner"></div><p>載入報告中...</p></div>';
    showModal('event-log-report-modal');

    try {
        const result = await authedFetch(`/api/events/${eventId}`);
        if (!result.success || !result.data) throw new Error(result.error || '找不到該筆紀錄');
        
        const eventData = result.data;
        
        const reportHTML = renderEventLogReportHTML(eventData);
        modalContent.innerHTML = reportHTML;
        
        document.getElementById('edit-event-log-btn').onclick = () => {
            closeModal('event-log-report-modal');
            showEventLogFormModal({ eventId: eventId });
        };
        document.getElementById('save-report-as-pdf-btn').onclick = () => exportReportToPdf(eventData);
        
        // 【新增】綁定刪除按鈕事件
        document.getElementById('report-delete-event-btn').onclick = () => {
            // 呼叫在 event-modal-manager.js 中定義的確認函式
            confirmDeleteEvent(eventData.eventId, eventData.eventName);
        };


    } catch (error) {
        if (error.message !== 'Unauthorized') {
            modalContent.innerHTML = `<div class="alert alert-error">讀取事件報告失敗: ${error.message}</div>`;
        }
    }
}

/**
 * [向下相容版] 渲染事件報告，只顯示有資料的欄位
 * @param {object} event - 正規化後的事件物件
 * @returns {string} HTML 字串
 */
function renderEventLogReportHTML(event) {
    const createItemHTML = (label, value) => {
        if (value === null || value === undefined || String(value).trim() === '') return '';
        return `<div class="info-item"><div class="info-label">${label}</div><div class="info-value"><div class="info-value-box">${String(value).replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div></div></div>`;
    };

    // --- 【*** 邏輯修正開始 ***】 ---
    // 判斷關聯類型
    const linkedEntityType = event.opportunityId ? '關聯機會' : '關聯公司';
    
    // 根據關聯類型，決定要顯示的名稱（優先顯示名稱，若無則顯示ID）
    const linkedEntityName = event.opportunityId 
        ? (event.opportunityName || event.opportunityId) // 關聯機會時：顯示機會名稱，若無則顯示機會ID
        : (event.companyName || event.companyId || '未指定'); // 關聯公司時：顯示公司名稱，若無則顯示公司ID
    // --- 【*** 邏輯修正結束 ***】 ---


    // 【最終修正】從系統設定讀取標籤文字和顏色
    const eventTypeConfig = new Map((window.CRM_APP?.systemConfig['事件類型'] || []).map(t => [t.value, { note: t.note, color: t.color }]));
    const typeInfo = eventTypeConfig.get(event.eventType) || { note: (event.eventType || 'unknown').toUpperCase(), color: '#6c757d' };
    const eventTypeLabel = typeInfo.note;
    const tagStyle = `background-color: ${typeInfo.color}; color: white;`;


    const fieldMapping = {
        common: {
            title: "會議共通資訊",
            fields: { ourParticipants: "我方與會人員", clientParticipants: "客戶與會人員", visitPlace: "會議地點", eventContent: "會議內容", clientQuestions: "客戶提問", clientIntelligence: "客戶情報", eventNotes: "備註" }
        },
        iot: {
            title: "IOT 專屬資訊",
            fields: { iot_deviceScale: "設備規模", iot_lineFeatures: "生產線特徵", iot_productionStatus: "生產現況", iot_iotStatus: "IoT現況", iot_painPoints: "痛點分類", iot_painPointDetails: "客戶痛點說明", iot_painPointAnalysis: "痛點分析與對策", iot_systemArchitecture: "系統架構" }
        },
        dt: {
            title: "DT 專屬資訊",
            fields: { dt_deviceScale: "設備規模", dt_processingType: "加工類型", dt_industry: "加工產業別" }
        }
    };
    
    let sectionsHTML = '';
    for (const sectionKey in fieldMapping) {
        const section = fieldMapping[sectionKey];
        let sectionContent = '';
        for (const fieldKey in section.fields) {
            const value = event[fieldKey] || event[fieldKey.replace(/^(iot|dt)_/, '')];
            sectionContent += createItemHTML(section.fields[fieldKey], value);
        }
        
        if (sectionContent.trim() !== '') {
            sectionsHTML += `<div class="report-section"><h3 class="section-title">${section.title}</h3>${sectionContent}</div>`;
        }
    }

    return `<div class="report-view" id="pdf-content-${event.eventId || ''}">
        <div class="report-header">
             <h2 class="report-title">${event.eventName || '未命名事件'} <span class="card-tag" style="${tagStyle}">${eventTypeLabel}</span></h2>
             <div class="header-meta-info" style="justify-content:space-between; width:100%;">
                <span><strong>${linkedEntityType}:</strong> ${linkedEntityName}</span>
                <span><strong>建立者:</strong> ${event.creator || 'N/A'}</span>
                <span><strong>建立時間:</strong> ${formatDateTime(event.createdTime)}</span>
            </div>
        </div>
        <div class="report-container">
            <div class="report-column">
                ${sectionsHTML || '<div class="alert alert-info">此事件沒有額外的詳細記錄。</div>'}
            </div>
        </div>
    </div>`;
}

/**
 * 【最終修改】將報告匯出為 PDF 檔案 (暫時解除 Modal 限制)
 * @param {object} event - 事件資料物件
 */
async function exportReportToPdf(event) {
    showLoading('正在產生寬版 PDF，請稍候...');
    
    const reportElement = document.getElementById(`pdf-content-${event.eventId || ''}`);
    // 找到 modal-content 和 modal 元素
    const modalContent = reportElement ? reportElement.closest('.modal-content') : null;
    const modalBackdrop = reportElement ? reportElement.closest('.modal') : null;

    if (!reportElement || !modalContent || !modalBackdrop) {
        hideLoading();
        showNotification('找不到報告內容或 Modal 容器，無法匯出', 'error');
        return;
    }
    
    // 儲存 modal-content 和 modal 當前的樣式
    const originalModalContentStyle = modalContent.style.cssText;
    const originalModalBackdropStyle = modalBackdrop.style.cssText;

    try {
        // 1. 檢查 html2pdf 函式庫是否存在
        if (typeof html2pdf === 'undefined' || typeof html2pdf().from !== 'function') {
            console.error('html2pdf library is not loaded or is invalid!');
            throw new Error('PDF 產生器 (html2pdf) 載入失敗。');
        }

        // 2. 【核心修改】暫時解除 Modal 的樣式限制
        // 這會讓 html2pdf 看到內容的「真實」高度
        modalBackdrop.style.overflow = 'visible'; // 解除 modal (背景) 的滾動限制
        modalContent.style.overflow = 'visible'; // 解除 modal-content 的滾動限制
        modalContent.style.maxHeight = 'none'; // 解除 modal-content 的最大高度限制
        modalContent.style.width = '1920px'; // 強制設定為寬螢幕寬度
        modalContent.style.maxWidth = '1920px'; // 覆蓋 max-width

        // 3. 等待一個 very short time 讓瀏覽器重新渲染佈局
        await new Promise(resolve => setTimeout(resolve, 50));

        // 4. 設定 PDF 選項
        const options = {
            margin: 15, // 設置統一邊界 (mm)
            filename: `事件報告-${event.eventName || '未命名'}-${event.eventId}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: { 
                scale: 2, // 提高解析度
                useCORS: true,
                logging: false, // 關閉 html2canvas 的日誌
                // 我們不再需要指定寬度，因為元素本身已經被設為 1920px
                // width: 1920 
            },
            // 移除 jsPDF 和 pagebreak 屬性，以觸發「單一長頁面」模式
        };
        
        // 5. 執行 PDF 產生
        // 我們擷取的對象仍然是 reportElement，但它現在處於一個不受限制的容器中
        await html2pdf().from(reportElement).set(options).save();

    } catch (error) {
        console.error("PDF生成失敗:", error);
        showNotification("PDF 產生失敗，請再試一次。", "error");
    } finally {
        // 6. 【核心修改】無論成功或失敗，都必須將 Modal 恢復回原來的樣式
        modalContent.style.cssText = originalModalContentStyle;
        modalBackdrop.style.cssText = originalModalBackdropStyle;

        // 確保 modal 在樣式被還原後仍然可見
        if (modalBackdrop.style.display !== 'block') {
             modalBackdrop.style.display = 'block'; 
        }
        
        hideLoading();
    }
}