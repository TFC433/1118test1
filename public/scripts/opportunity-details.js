// views/scripts/opportunity-details.js (重構後的主控制器)

// ==================== 全域變數 (此頁面專用) ====================
let currentDetailOpportunityId = null; // 用於儲存當前詳細頁的機會ID
let currentOpportunityData = null; 


// ==================== 主要載入與渲染函式 ====================

/**
 * 載入並渲染機會詳細頁面的主函式 (現在是總控制器)
 * @param {string} opportunityId - 機會ID
 */
async function loadOpportunityDetailPage(opportunityId) {
    currentDetailOpportunityId = opportunityId;
    const container = document.getElementById('page-opportunity-details');
    container.innerHTML = `<div class="loading show" style="padding-top: 50px;"><div class="spinner"></div><p>正在載入機會詳細資料...</p></div>`;

    try {
        // 每次都重新抓取模板，確保頁面狀態最乾淨
        const opportunityDetailPageTemplate = await fetch('opportunity-detail-page.html').then(res => res.text());

        const result = await authedFetch(`/api/opportunities/${opportunityId}/details`);
        if (!result.success) throw new Error(result.error);
        
        const { opportunityInfo, interactions, eventLogs, linkedContacts, potentialContacts, parentOpportunity, childOpportunities } = result.data;
        // 將資料儲存在局部變數中，並透過 init 函式傳遞給其他模組
        currentOpportunityData = opportunityInfo; 

        // 1. 渲染主模板並設定標題
        container.innerHTML = opportunityDetailPageTemplate;
        document.getElementById('page-title').textContent = opportunityInfo.opportunityName;
        document.getElementById('page-subtitle').textContent = '機會詳細資料與關聯活動';

        // 2. 將資料分派給各個子模組進行渲染，並確保 DOM 已準備就緒
        requestAnimationFrame(() => {
            OpportunityInfoCard.render(opportunityInfo);
            OpportunityInfoCardEvents.init(opportunityInfo);
            OpportunityStepper.init(opportunityInfo);
            
            // --- 【*** 核心修正：在這裡同時傳入 opportunityName ***】 ---
            OpportunityEvents.init(eventLogs, { 
                opportunityId: opportunityInfo.opportunityId, 
                opportunityName: opportunityInfo.opportunityName 
            });
            // --- 【*** 修正結束 ***】 ---

            // 【修改點】傳入互動區塊的容器元素
            const interactionContainer = document.getElementById('tab-content-interactions');
            OpportunityInteractions.init(interactionContainer, { opportunityId: opportunityInfo.opportunityId }, interactions);
            
            OpportunityContacts.init(opportunityInfo, linkedContacts);
            OpportunityAssociatedOpps.render({ opportunityInfo, parentOpportunity, childOpportunities });
            
            if (window.PotentialContactsManager) {
                PotentialContactsManager.render({
                    containerSelector: '#opp-potential-contacts-container',
                    potentialContacts: potentialContacts,
                    comparisonList: linkedContacts,
                    comparisonKey: 'name',
                    context: 'opportunity',
                    opportunityId: opportunityInfo.opportunityId
                });
            }
            
            // 3. 更新下拉選單等 UI 元件 (也移到此處確保元素存在)
            CRM_APP.updateAllDropdowns();
        });

    } catch (error) {
        if (error.message !== 'Unauthorized') {
            document.getElementById('page-title').textContent = '錯誤';
            container.innerHTML = `<div class="alert alert-error">載入機會詳細資料失敗: ${error.message}</div>`;
        }
    }
}


// 向主應用程式註冊此模組的載入函式
if (window.CRM_APP) {
    window.CRM_APP.pageModules['opportunity-details'] = loadOpportunityDetailPage;
}