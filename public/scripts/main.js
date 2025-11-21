// views/scripts/main.js (Fixed browser history navigation, Added refreshCurrentView, Added weekly-detail page handling)

// ==================== 全域命名空間 & 核心設定 ====================
window.CRM_APP = {
    systemConfig: {},
    currentUser: '',
    dataTimestamp: 0, // [NEW] 用於輪詢檢查的客戶端時間戳
    dataPollInterval: null, // [NEW] 輪詢計時器
    pageModules: {
        'dashboard': null, // Dashboard load function is handled by dashboardManager.refresh
        'contacts': null,
        'opportunities': null,
        'sales-analysis': null,
        'announcements': null,
        'companies': null,
        'interactions': null,
        'weekly-business': null, // Placeholder, will be assigned later
        'weekly-detail': null,   // Placeholder for the detail page loader
        'events': null,
        'follow-up': null,
        'company-details': null,
        'opportunity-details': null
    },
    formTemplates: {},
    pageConfig: {
        // *** 修正：儀表板的 loaded 狀態不再重要，因為我們會強制刷新 ***
        'dashboard': { title: '儀表板', subtitle: '以機會為核心的客戶關係管理平台', loaded: false },
        'contacts': { title: '潛在客戶管理', subtitle: '管理所有來自名片或其他來源的潛在客戶', loaded: false },
        'opportunities': { title: '機會案件管理', subtitle: '追蹤與管理所有進行中的機會案件', loaded: false },
        'sales-analysis': { title: '成交與金額分析', subtitle: '檢視已完成機會的績效指標與趨勢', loaded: false },
        'announcements': { title: '佈告欄管理', subtitle: '新增與管理團隊的公告訊息', loaded: false },
        'companies': { title: '公司管理', subtitle: '檢視與管理所有客戶公司', loaded: false },
        'interactions': { title: '互動總覽', subtitle: '檢視所有機會案件的互動紀錄', loaded: false },
        'weekly-business': { title: '週間業務總覽', subtitle: '檢視所有週次的業務摘要', loaded: false },
        'weekly-detail': { title: '週間業務詳情', subtitle: '檢視特定週次的業務紀錄', loaded: true },
        'events': { title: '事件紀錄列表', subtitle: '查看所有機會案件的詳細事件報告', loaded: false },
        'follow-up': { title: '待追蹤列表', subtitle: '查看超過7天未聯繫的機會案件', loaded: false },
        'company-details': { title: '公司詳細資料', subtitle: '查看公司的完整關聯資訊', loaded: true },
        'opportunity-details': { title: '機會詳細資料', subtitle: '檢視機會的所有關聯資訊', loaded: true }
    },
    isSidebarPinned: true,

    // --- [NEW] 資料輪詢相關函式 ---
    startDataPolling: function() {
        console.log('[Polling] Starting data polling (Interval: 2 minutes)...');
        // 1. 清除任何可能存在的舊計時器
        this.stopDataPolling();
        // 2. 立即執行一次檢查
        this.checkDataTimestamp();
        // 3. 設定新的計時器
        this.dataPollInterval = setInterval(() => {
            this.checkDataTimestamp();
        }, 120000); // 120000 ms = 2 分鐘
    },

    stopDataPolling: function() {
        if (this.dataPollInterval) {
            clearInterval(this.dataPollInterval);
            this.dataPollInterval = null;
            console.log('[Polling] Stopped data polling.');
        }
    },

    checkDataTimestamp: async function() {
        console.log('[Polling] Checking server for data timestamp...');
        try {
            // 呼叫我們在後端建立的新 API，並設定 skipRefresh: true
            const result = await authedFetch('/api/system/status', { skipRefresh: true });
            
            if (result.success && result.lastWriteTimestamp) {
                const serverTimestamp = result.lastWriteTimestamp;
                
                if (this.dataTimestamp === 0) {
                    // 這是頁面首次載入，只需設定目前的時間戳
                    console.log(`[Polling] Initial timestamp set to: ${serverTimestamp}`);
                    this.dataTimestamp = serverTimestamp;
                } else if (serverTimestamp > this.dataTimestamp) {
                    // 伺服器的時間戳 > 客戶端的時間戳，代表有新資料！
                    console.warn(`[Polling] STALE DATA DETECTED! Server: ${serverTimestamp}, Client: ${this.dataTimestamp}`);
                    this.showDataRefreshNotification(true); // 顯示通知
                    this.stopDataPolling(); // 停止輪詢，直到使用者手動刷新
                } else {
                    // 資料仍然是新的
                    console.log('[Polling] Data is up to date.');
                }
            }
        } catch (error) {
            if (error.message !== 'Unauthorized') {
                console.error('[Polling] Error checking data timestamp:', error);
                // 發生網路錯誤時不要停止輪詢，下次繼續嘗試
            }
        }
    },

    showDataRefreshNotification: function(show) {
        const notificationBar = document.getElementById('data-refresh-notification');
        if (notificationBar) {
            notificationBar.style.display = show ? 'flex' : 'none';
        }
    },

    forceRefreshAndRestartPolling: function() {
        console.log('[Polling] User triggered refresh...');
        this.showDataRefreshNotification(false); // 隱藏通知
        this.refreshCurrentView('資料重整中...'); // 觸發刷新
        // refreshCurrentView 函式內部會自動重啟輪詢
    },
    // --- [END NEW] 資料輪詢相關函式 ---


    // --- 【*** solution #1 + #2 ***】 ---
    // --- 共通刷新函式 (已修正為可刷新所有列表頁 + 重啟輪詢) ---
    refreshCurrentView: async function(successMessage = '操作成功！正在刷新...') {
        console.log('[Refresh Triggered] Common refresh logic initiated.');
        // 成功訊息已由 authedFetch 處理

        // 1. 取得當前頁面名稱與參數 (此部分邏輯不變)
        let currentPageName = 'dashboard';
        let currentPageParams = {};
        const currentHash = window.location.hash.substring(1);
        const pageIdFromDOM = document.querySelector('.page-view[style*="display: block"]')?.id.replace('page-', '');

        const potentialPageNameFromHash = currentHash.split('?')[0];
        if (currentHash && window.CRM_APP.pageConfig[potentialPageNameFromHash]) {
            const [pageNameFromHash, paramsString] = currentHash.split('?');
            currentPageName = pageNameFromHash;
            if (paramsString) {
                try {
                    currentPageParams = Object.fromEntries(new URLSearchParams(paramsString));
                    Object.keys(currentPageParams).forEach(key => {
                        currentPageParams[key] = decodeURIComponent(currentPageParams[key] ?? '');
                    });
                } catch (e) { console.warn(`[Refresh] 解析 URL hash 參數失敗: ${paramsString}`, e); currentPageParams = {}; }
            }
        } else if (pageIdFromDOM && window.CRM_APP.pageConfig[pageIdFromDOM]){
             currentPageName = pageIdFromDOM;
             const hashParams = new URLSearchParams(window.location.hash.split('?')[1]);
             if (currentPageName === 'weekly-detail' && hashParams.has('weekId')) {
                 currentPageParams = { weekId: decodeURIComponent(hashParams.get('weekId')) };
                 console.log(`[Refresh] Reconstructed weekId for weekly-detail from URL hash: ${currentPageParams.weekId}`);
             } else {
                 console.warn(`[Refresh] 無有效 Hash，使用 DOM 判斷頁面: ${currentPageName}, 嘗試從 URL 讀取參數。`);
                 const hashParts = window.location.hash.substring(1).split('?');
                  if (hashParts.length > 1) {
                      try {
                          currentPageParams = Object.fromEntries(new URLSearchParams(hashParts[1]));
                          Object.keys(currentPageParams).forEach(key => {
                              currentPageParams[key] = decodeURIComponent(currentPageParams[key] ?? '');
                          });
                          console.log('[Refresh] Reconstructed params from URL hash (DOM fallback):', currentPageParams);
                      } catch (e) {
                           console.warn(`[Refresh] 無法從 URL hash (DOM fallback) 解析參數: ${hashParts[1]}`, e);
                           currentPageParams = {};
                      }
                  } else {
                       currentPageParams = {};
                  }
             }
        }
         console.log(`[Refresh] Determined page to reload: ${currentPageName}, Params:`, currentPageParams);


        // --- 【*** 關鍵修改 (Solution #1) ***】 ---
        // 2. 標記 *所有* 列表頁面 (而不只是當前頁面) 需要重新載入資料
        if (window.CRM_APP && window.CRM_APP.pageConfig) {
            console.log('[Refresh] Invalidating all list page caches due to write operation...');
            for (const pageKey in window.CRM_APP.pageConfig) {
                
                // 檢查是否為「列表頁面」
                // (不是詳細頁面，也不是週間業務的詳細頁)
                const isListPage = !pageKey.includes('-details') && pageKey !== 'weekly-detail';

                if (isListPage) { 
                    window.CRM_APP.pageConfig[pageKey].loaded = false;
                    console.log(`[Refresh] ... marked ${pageKey} as not loaded.`);
                }
            }
        }
        // --- 【*** 修正結束 ***】 ---


        // 3. 呼叫 navigateTo (不需要延遲)
        console.log(`[Refresh] Calling navigateTo for ${currentPageName}`);
        try {
            if (currentPageName === 'weekly-detail' && !currentPageParams.weekId) {
                console.error("[Refresh]無法重新載入週間業務詳情頁面，缺少 weekId 參數！將導回列表頁。");
                await window.CRM_APP.navigateTo('weekly-business', {}, false); // Fallback
            } else {
                await window.CRM_APP.navigateTo(currentPageName, currentPageParams, false);
                console.log(`[Refresh] navigateTo for ${currentPageName} completed.`);
            }
            
            // --- 【*** 關鍵修改 (Solution #2) ***】 ---
            // 4. 刷新成功後，隱藏通知、重設時間戳並重啟輪詢
            console.log('[Refresh] Hiding notification and restarting polling...');
            this.showDataRefreshNotification(false);
            this.dataTimestamp = 0; // 設為 0，讓下次 checkDataTimestamp 強制重新獲取最新時間
            this.startDataPolling();
            // --- 【*** 修正結束 ***】 ---
            
        } catch (navError) {
             console.error(`[Refresh] Error during navigateTo for ${currentPageName}:`, navError);
             showNotification(`頁面刷新失敗: ${navError.message}`, 'error');
        }
    },
    // --- 共通刷新函式結束 ---
};

// ==================== 應用程式初始化 ====================
CRM_APP.init = async function() {
    console.log('🚀 [Main] TFC CRM系統初始化...');
    try {
        await loadHTMLComponents();
        await this.loadSystemConfig();
        
        // --- 【*** 關鍵修改 (Solution #2) ***】 ---
        // 在 loadSystemConfig 之後，Navigation 之前，啟動輪詢
        this.startDataPolling();
        // --- 【*** 修正結束 ***】 ---

        this.setupNavigation();
        this.displayCurrentUser();

        if (document.getElementById('sidebar-pin-toggle')) {
            this.setupSidebar();
        } else {
            console.error('❌ [Main] 致命錯誤: 找不到側邊欄切換按鈕 #sidebar-pin-toggle。功能將無法使用。');
            showNotification('側邊欄功能初始化失敗，請嘗試強制刷新頁面。', 'error', 10000);
        }

        // --- 關鍵修正：將儀表板的初始刷新移到 navigateTo 內部處理 ---
        // console.log('[Main] 執行初始儀表板刷新...');
        // if (window.dashboardManager && typeof window.dashboardManager.refresh === 'function') {
        //     await window.dashboardManager.refresh();
        //     console.log('[Main] 初始儀表板刷新完成。');
        // } else {
        //      console.warn('[Main] dashboardManager 未定義或 refresh 方法不存在，跳過初始刷新。');
        // }

        if (window.kanbanBoardManager && typeof window.kanbanBoardManager.initialize === 'function') {
            window.kanbanBoardManager.initialize();
        } else {
             console.warn('[Main] kanbanBoardManager 未定義或 initialize 方法不存在，看板拖曳功能可能無法使用。');
        }

        // --- Handle Initial URL Hash ---
        await new Promise(resolve => setTimeout(resolve, 50));
        const initialHash = window.location.hash.substring(1);
        let navigatedFromHash = false;

        if (initialHash) {
            const [pageName, paramsString] = initialHash.split('?');
            if (this.pageConfig[pageName]) {
                let params = {};
                if (paramsString) {
                    try {
                        params = Object.fromEntries(new URLSearchParams(paramsString));
                        Object.keys(params).forEach(key => {
                            params[key] = decodeURIComponent(params[key] ?? '');
                        });
                    } catch (e) { console.warn(`[Main] 解析初始 URL hash 參數失敗: ${paramsString}`, e); }
                }
                console.log(`[Main] 偵測到初始 Hash: ${pageName}, 參數:`, params);
                await this.navigateTo(pageName, params, false);
                navigatedFromHash = true;
            } else {
                 console.warn(`[Main] 初始 Hash "${pageName}" 對應到無效頁面，將載入儀表板。`);
                 window.history.replaceState(null, '', window.location.pathname + '#dashboard');
            }
        }

        // If no valid hash or navigation didn't happen, ensure dashboard is loaded
        if (!navigatedFromHash) {
             console.log('[Main] 無有效初始 Hash 或初始頁面無效，載入預設儀表板。');
             // *** 修正：直接呼叫 navigateTo 載入儀表板 ***
             await this.navigateTo('dashboard', {}, false);
        }
        // --- Hash Handling End ---

        console.log('✅ [Main] TFC CRM系統載入完成！');
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            console.error('❌ [Main] 系統初始化失敗:', error);
            showNotification(`系統初始化失敗: ${error.message}，請重新整理頁面`, 'error', 10000);
             const bodyContent = document.querySelector('.app-layout') || document.body;
             if (bodyContent) {
                 bodyContent.innerHTML = `<div class="alert alert-error" style="margin: 50px; text-align: center;"><h1>系統初始化失敗</h1><p>${error.message}</p><p>請嘗試<a href="#" onclick="location.reload()">重新整理</a>頁面，若問題持續請聯絡管理員。</p></div>`;
             }
        }
    }
};

// --- Load System Config --- (無變更)
CRM_APP.loadSystemConfig = async function() {
    try {
        const configData = await authedFetch('/api/config');
        if (configData && typeof configData === 'object') {
            this.systemConfig = configData;
            console.log('[Main] 系統設定載入成功:', '(config logged)');
            this.updateAllDropdowns();
        } else {
             throw new Error("API 回傳的系統設定格式不正確");
        }
    } catch (error) {
        if (error.message !== 'Unauthorized') {
            console.error('❌ [Main] 載入系統設定失敗:', error);
            showNotification('載入系統設定失敗，部分下拉選單可能無法使用', 'warning');
            this.systemConfig = {};
        }
         if (error.message !== 'Unauthorized') throw error;
    }
};

// --- Sidebar Setup --- (無變更)
CRM_APP.setupSidebar = function() {
    const pinToggleBtn = document.getElementById('sidebar-pin-toggle');
    if (!pinToggleBtn) {
        console.error('❌ [Sidebar] 致命錯誤：找不到側邊欄釘選按鈕 #sidebar-pin-toggle');
        return;
    }
    console.log('🔗 [Sidebar] 找到釘選按鈕，準備綁定事件...');
    const storedPinState = localStorage.getItem('crm-sidebar-pinned');
    this.isSidebarPinned = storedPinState === null ? true : (storedPinState === 'true');

    this.toggleSidebarPin = () => {
        console.log('📌 [Sidebar] 釘選按鈕被點擊！');
        this.isSidebarPinned = !this.isSidebarPinned;
        localStorage.setItem('crm-sidebar-pinned', this.isSidebarPinned);
        this.updateSidebarState();
    };

    pinToggleBtn.removeEventListener('click', this.toggleSidebarPin);
    pinToggleBtn.addEventListener('click', this.toggleSidebarPin);

    this.updateSidebarState();
    console.log(`✅ [Sidebar] 側邊欄功能初始化完成 (初始狀態 Pinned: ${this.isSidebarPinned})。`);
};

// --- Update Sidebar State (UI) --- (無變更)
CRM_APP.updateSidebarState = function() {
    const appLayout = document.querySelector('.app-layout');
    const pinToggleBtn = document.getElementById('sidebar-pin-toggle');
    if (!appLayout || !pinToggleBtn) {
         console.warn('[Sidebar] 無法更新側邊欄狀態：缺少 .app-layout 或 #sidebar-pin-toggle 元素。');
         return;
    }
    const pinToggleText = pinToggleBtn.querySelector('.nav-text');
    const pinIconContainer = pinToggleBtn.querySelector('.nav-icon');
    const navLinks = document.querySelectorAll('.sidebar .nav-list .nav-link');

    const createIcon = (points) => { /* ... (SVG creation logic remains) ... */
        const svgNS = "http://www.w3.org/2000/svg";
        const svg = document.createElementNS(svgNS, "svg");
        svg.setAttribute("xmlns", svgNS);
        svg.setAttribute("width", "24");
        svg.setAttribute("height", "24");
        svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("fill", "none");
        svg.setAttribute("stroke", "currentColor");
        svg.setAttribute("stroke-width", "2");
        svg.setAttribute("stroke-linecap", "round");
        svg.setAttribute("stroke-linejoin", "round");
        const polyline = document.createElementNS(svgNS, "polyline");
        polyline.setAttribute("points", points);
        svg.appendChild(polyline);
        return svg;
    };


    if (pinIconContainer) pinIconContainer.innerHTML = '';

    if (this.isSidebarPinned) {
        appLayout.classList.remove('sidebar-collapsed');
        if (pinToggleText) pinToggleText.textContent = '收合側邊欄';
        pinToggleBtn.title = '收合側邊欄';
        if (pinIconContainer) pinIconContainer.appendChild(createIcon("15 18 9 12 15 6")); // Left arrow
        navLinks.forEach(link => link.removeAttribute('title'));
    } else {
        appLayout.classList.add('sidebar-collapsed');
        if (pinToggleText) pinToggleText.textContent = '展開側邊欄';
        pinToggleBtn.title = '展開側邊欄';
        if (pinIconContainer) pinIconContainer.appendChild(createIcon("9 18 15 12 9 6")); // Right arrow
        navLinks.forEach(link => {
            const text = link.querySelector('.nav-text')?.textContent;
            if (text) link.setAttribute('title', text);
        });
    }
};


// --- Setup Navigation (Hash Change & Clicks) --- (無變更)
CRM_APP.setupNavigation = function() {
    window.addEventListener('hashchange', () => {
        const hash = window.location.hash.substring(1);
        const [pageName, paramsString] = hash.split('?');
        let params = {};

        if (paramsString) {
             try {
                params = Object.fromEntries(new URLSearchParams(paramsString));
                Object.keys(params).forEach(key => {
                    params[key] = decodeURIComponent(params[key] ?? '');
                });
            } catch (e) { console.warn(`[Main] 解析 hashchange 參數失敗: ${paramsString}`, e); }
        }

        const currentPageId = document.querySelector('.page-view[style*="display: block"]')?.id.replace('page-', '');
        const targetPageConfig = this.pageConfig[pageName];

        if (targetPageConfig && pageName !== currentPageId) {
             console.log(`[Main] Hash 變更 (from browser history)，導航至: ${pageName}, 參數:`, params);
             this.navigateTo(pageName, params, false);
        } else if (!hash && currentPageId !== 'dashboard') {
            console.log("[Main] Hash 清空 (from browser history)，導航回儀表板");
            this.navigateTo('dashboard', {}, false);
        } else if (targetPageConfig && pageName === currentPageId) {
             console.log(`[Main] Hash changed to current page (${pageName}). Checking params...`);
             const currentParamsString = window.location.hash.split('?')[1] || '';
             if (paramsString !== currentParamsString) {
                 console.log(`[Main] Params changed. Reloading page ${pageName} via hashchange.`);
                 this.navigateTo(pageName, params, false);
             } else {
                  console.log(`[Main] Params unchanged. Ignoring hashchange.`);
             }
        } else if (!targetPageConfig && hash) {
             console.warn(`[Main] Hash change to invalid page "${pageName}". Redirecting to dashboard.`);
             this.navigateTo('dashboard', {}, false);
             window.history.replaceState(null, '', '#dashboard');
        }
    });

    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-page]');
        if (target) {
            e.preventDefault();
            const pageName = target.dataset.page;
            let params = {};
            if (target.dataset.params) {
                try {
                    params = JSON.parse(target.dataset.params);
                } catch (jsonError) {
                    console.error(`[Main] Failed to parse data-params JSON for ${pageName}:`, target.dataset.params, jsonError);
                }
            }
            this.navigateTo(pageName, params);
            if (document.body.classList.contains('sidebar-is-open')) {
                this.toggleMobileNav(false);
            }
        }
    });

    const mobileNavToggle = document.querySelector('.mobile-nav-toggle');
    const mobileNavBackdrop = document.querySelector('.mobile-nav-backdrop');
    if (mobileNavToggle) mobileNavToggle.addEventListener('click', () => this.toggleMobileNav());
    if (mobileNavBackdrop) mobileNavBackdrop.addEventListener('click', () => this.toggleMobileNav(false));
};

// --- Toggle Mobile Navigation --- (無變更)
CRM_APP.toggleMobileNav = function(forceOpen) { /* ... (Logic remains the same) ... */
    const sidebar = document.querySelector('.sidebar');
    const backdrop = document.querySelector('.mobile-nav-backdrop');
    const body = document.body;
    if (!sidebar || !backdrop || !body) return;
    const isOpen = body.classList.contains('sidebar-is-open');
    const shouldOpen = forceOpen !== undefined ? forceOpen : !isOpen;
    if (shouldOpen) {
        sidebar.classList.add('is-open');
        backdrop.classList.add('is-open');
        body.classList.add('sidebar-is-open');
    } else {
        sidebar.classList.remove('is-open');
        backdrop.classList.remove('is-open');
        body.classList.remove('sidebar-is-open');
    }
};


// --- Navigate To Page ---
CRM_APP.navigateTo = async function(pageName, params = {}, updateHistory = true) {
    const config = this.pageConfig[pageName];
    // *** 修正：儀表板沒有自己的 loadFn，它的刷新由 dashboardManager 處理 ***
    const loadFn = (pageName === 'dashboard') ? null : this.pageModules[pageName];

    if (!config) {
        console.error(`[Main] NavigateTo: 未知的頁面: ${pageName}. Redirecting to dashboard.`);
        if (pageName !== 'dashboard') {
            await this.navigateTo('dashboard', {}, updateHistory);
        }
        return;
    }

    console.log(`[Main] Navigating to: ${pageName}, Params:`, params, `UpdateHistory: ${updateHistory}`);

    const isDetailPage = pageName.includes('-details');
    const requiresParamLoad = isDetailPage || pageName === 'weekly-detail';

    // --- Update Browser History --- (無變更)
    if (updateHistory) { /* ... (Logic remains the same) ... */
        let newHash = `#${pageName}`;
        const encodedParams = new URLSearchParams();
        let hasParams = false;
        Object.entries(params).forEach(([key, value]) => {
            if (value !== undefined && value !== null) {
                encodedParams.set(key, String(value));
                hasParams = true;
            }
        });
        if (hasParams) {
            newHash += `?${encodedParams.toString()}`;
        }

        if (window.location.hash !== newHash) {
            window.history.pushState({ page: pageName, params: params }, '', newHash);
            console.log(`[Main] URL Hash (pushState) 更新為: ${newHash}`);
        } else {
             console.log(`[Main] Target hash ${newHash} is same as current. Skipping history update.`);
        }
    }

    // --- Update Header Title/Subtitle and Sidebar Active State --- (無變更)
    if (!requiresParamLoad) { /* ... (Logic remains the same) ... */
        const pageTitleEl = document.getElementById('page-title');
        const pageSubtitleEl = document.getElementById('page-subtitle');
        if (pageTitleEl) pageTitleEl.textContent = config.title;
        if (pageSubtitleEl) pageSubtitleEl.textContent = config.subtitle;

        document.querySelectorAll('.nav-list .nav-item').forEach(item => item.classList.remove('active'));
        const activeNavItem = document.querySelector(`.nav-link[data-page="${pageName}"]`);
        if (activeNavItem) activeNavItem.closest('.nav-item')?.classList.add('active');
    } else { /* ... (Logic remains the same) ... */
         let listPageAttr = 'dashboard';
         if (pageName === 'opportunity-details') listPageAttr = 'opportunities';
         if (pageName === 'company-details') listPageAttr = 'companies';
         if (pageName === 'weekly-detail') listPageAttr = 'weekly-business';
          document.querySelectorAll('.nav-list .nav-item').forEach(item => item.classList.remove('active'));
          const activeNavItem = document.querySelector(`.nav-link[data-page="${listPageAttr}"]`);
          if (activeNavItem) activeNavItem.closest('.nav-item')?.classList.add('active');
    }

    // --- Show/Hide Page Views --- (無變更)
    const targetPageView = document.getElementById(`page-${pageName}`) || (pageName === 'weekly-detail' ? document.getElementById('page-weekly-business') : null);

    document.querySelectorAll('.page-view').forEach(page => {
        if (page) page.style.display = 'none';
    });

    if (targetPageView) {
         targetPageView.style.display = 'block';
         console.log(`[Main] Displaying page view in: #${targetPageView.id}`);
    } else { /* ... (Error handling remains the same) ... */
        console.error(`[Main] NavigateTo: 找不到頁面視圖元素: #page-${pageName}. Falling back to dashboard.`);
        const dashboardView = document.getElementById('page-dashboard');
        if (dashboardView) dashboardView.style.display = 'block';
         const dashConfig = this.pageConfig['dashboard'];
         const pageTitleEl = document.getElementById('page-title');
         const pageSubtitleEl = document.getElementById('page-subtitle');
         if (pageTitleEl) pageTitleEl.textContent = dashConfig.title;
         if (pageSubtitleEl) pageSubtitleEl.textContent = dashConfig.subtitle;
         document.querySelectorAll('.nav-list .nav-item').forEach(item => item.classList.remove('active'));
         const dashNavItem = document.querySelector(`.nav-link[data-page="dashboard"]`);
         if (dashNavItem) dashNavItem.closest('.nav-item')?.classList.add('active');
         window.history.replaceState(null, '', '#dashboard');
        return;
    }

    // --- Load Page Module Function ---
    // *** 修正：當 pageName 是 'dashboard' 時，直接呼叫 dashboardManager.refresh() ***
    if (pageName === 'dashboard') {
        console.log(`[Main] Navigating to dashboard, forcing refresh...`);
        if (window.dashboardManager && typeof window.dashboardManager.refresh === 'function') {
            try {
                await window.dashboardManager.refresh(); // Always refresh dashboard
                // 儀表板的 loaded 狀態在這裡不重要，每次都刷新
                // config.loaded = true; // Or keep false
                console.log(`[Main] Dashboard refresh completed successfully.`);
            } catch (loadError) {
                 console.error(`[Main] 載入頁面 ${pageName} (Dashboard) 失敗:`, loadError);
                 if (targetPageView) {
                    targetPageView.innerHTML = `<div class="alert alert-error" style="margin: 20px;">載入儀表板時發生錯誤: ${loadError.message}</div>`;
                 }
            }
        } else {
            console.error('[Main] dashboardManager not found or refresh function is missing!');
            if (targetPageView) {
                targetPageView.innerHTML = `<div class="alert alert-error" style="margin: 20px;">儀表板管理模組載入失敗。</div>`;
            }
        }
    } else {
        // --- 原有的其他頁面載入邏輯 ---
        const needsLoad = loadFn && (requiresParamLoad || !config.loaded);
        console.log(`[Main] Page ${pageName} needs load: ${needsLoad} (requiresParamLoad: ${requiresParamLoad}, loaded: ${!requiresParamLoad && config.loaded})`);

        if (needsLoad) {
            console.log(`[Main] Executing load function for ${pageName}...`);
            try {
                if (requiresParamLoad) {
                    let paramKey;
                    if (pageName === 'weekly-detail') paramKey = 'weekId';
                    else if (pageName === 'opportunity-details') paramKey = 'opportunityId';
                    else if (pageName === 'company-details') paramKey = 'companyName';
                    else paramKey = Object.keys(params)[0];

                    const paramValueToPass = params[paramKey];

                    if (paramValueToPass === undefined || paramValueToPass === null || paramValueToPass === '') {
                        const errorMsg = `缺少有效的參數 (${paramKey}) 來載入頁面 ${pageName}`;
                        console.error(`[Main] ${errorMsg}`);
                        throw new Error(errorMsg);
                    }
                    await loadFn(paramValueToPass);
                } else {
                    await loadFn();
                }

                if (!requiresParamLoad) config.loaded = true;
                console.log(`[Main] Load function for ${pageName} completed successfully.`);
            } catch (loadError) {
                console.error(`[Main] 載入頁面 ${pageName} 失敗:`, loadError);
                if (targetPageView) {
                    targetPageView.innerHTML = `<div class="alert alert-error" style="margin: 20px;">載入頁面內容時發生錯誤: ${loadError.message}</div>`;
                }
                if (!requiresParamLoad) config.loaded = false;
            }
        } else if (!loadFn) {
            console.warn(`[Main] 頁面 ${pageName} 沒有註冊的載入函式。只切換顯示。`);
        } else {
            console.log(`[Main] 頁面 ${pageName} 已載入過，直接顯示。`);
        }
    }
    // --- Module Loading End ---
};


// --- Display Current User --- (無變更)
CRM_APP.displayCurrentUser = function() { /* ... (Logic remains the same) ... */
    const userDisplay = document.getElementById('user-display-name');
    if (!userDisplay) {
         console.warn('[Main] Cannot display user: #user-display-name element not found.');
         return;
    }
    const userName = localStorage.getItem('crmCurrentUserName');
    if (userName) {
        userDisplay.textContent = `👤 ${userName}`;
        this.currentUser = userName;
    } else {
        userDisplay.textContent = `👤 使用者`;
        this.currentUser = '系統';
    }
     console.log(`[Main] Current user set to: ${this.currentUser}`);
};

// --- Get Current User (Global Helper) --- (無變更)
function getCurrentUser() { /* ... (Logic remains the same) ... */
    return window.CRM_APP?.currentUser || localStorage.getItem('crmCurrentUserName') || '系統';
}

// --- Logout Function --- (無變更)
function logout() { /* ... (Logic remains the same) ... */
    console.log('[Auth] Logging out...');
    localStorage.removeItem('crm-token');
    localStorage.removeItem('crmCurrentUserName');
    localStorage.removeItem('crm-remembered-username');
    window.history.replaceState(null, '', window.location.pathname); // Clear hash
    showNotification('您已成功登出', 'success');
    setTimeout(() => { window.location.href = '/'; }, 1000);
}

// --- Load HTML Components (Modals, Templates) --- (修改處)
async function loadHTMLComponents() { 
    console.log('[Main] Loading HTML components...');
    
    // 【修改】加入 'event-editor-standalone'
    const modalComponents = [
        'contact-modals', 
        'opportunity-modals', 
        'meeting-modals', 
        'system-modals', 
        'event-log-modal', 
        'event-log-views', 
        'link-contact-modal', 
        'link-opportunity-modal', 
        'announcement-modals',
        'event-editor-standalone' // <--- 新增這一行
    ];
    
    const formTemplates = ['general', 'iot', 'dt', 'dx']; // 'dx' maps to 'general'

    try {
        // Load Modals
        const modalPromises = modalComponents.map(c =>
            fetch(`${c}.html`)
                .then(res => res.ok ? res.text() : Promise.reject(`Failed to fetch modal ${c}.html: ${res.statusText}`))
        );
        const modalHtmls = await Promise.all(modalPromises);
        const modalContainer = document.getElementById('modal-container');
        if (modalContainer) {
            modalContainer.innerHTML = modalHtmls.join('');
            console.log(`✅ [Main] ${modalComponents.length} modal components loaded.`);
        } else {
             console.error('❌ [Main] Modal container #modal-container not found!');
        }

        // Load Event Form Templates
        console.log('⚡️ [Main] Pre-loading event form templates...');
        const templatePromises = formTemplates.map(type => {
            const templateFileName = `event-form-${type === 'dx' ? 'general' : type}.html`;
            return fetch(templateFileName)
                .then(res => res.ok ? res.text() : Promise.reject(`Failed to fetch template ${templateFileName}: ${res.statusText}`))
                .then(html => ({ type, html }));
            }
        );
        const loadedTemplates = await Promise.all(templatePromises);
        loadedTemplates.forEach(({ type, html }) => {
            window.CRM_APP.formTemplates[type] = html;
        });
        console.log(`✅ [Main] ${formTemplates.length} event form templates cached.`);

    } catch (error) {
        console.error('❌ [Main] 載入 HTML 組件或範本失敗:', error);
        showNotification('頁面元件載入失敗，部分功能可能異常', 'error', 5000);
        throw error;
    }
}


// --- Update All Dropdowns based on System Config --- (無變更)
CRM_APP.updateAllDropdowns = function() { /* ... (Logic remains the same) ... */
    console.log('[Main] Updating all dropdowns...');
    const dropdownMappings = {
        'opportunity-type': '機會種類', 'upgrade-opportunity-type': '機會種類',
        'current-stage': '機會階段', 'upgrade-current-stage': '機會階段',
        'opportunity-source': '機會來源', 'assignee': '團隊成員',
        'upgrade-assignee': '團隊成員', 'interaction-event-type': '互動類型',
        'map-opportunity-filter': '機會種類',
        'edit-opportunity-type': '機會種類',
        'edit-opportunity-source': '機會來源',
        'edit-current-stage': '機會階段',
        'edit-assignee': '團隊成員'
        // Add other mappings as needed
    };
    const systemConfig = this.systemConfig;
    if (!systemConfig || Object.keys(systemConfig).length === 0) {
        console.warn('[Main] Cannot update dropdowns: systemConfig is empty or not loaded.');
        return;
    }
    Object.entries(dropdownMappings).forEach(([elementId, configKey]) => {
        const element = document.getElementById(elementId);
        if (element && Array.isArray(systemConfig[configKey])) {
            const currentSelectedValue = element.value;
            const firstOptionHTML = element.querySelector('option:first-child')?.outerHTML || '<option value="">請選擇...</option>';
            element.innerHTML = firstOptionHTML;
            systemConfig[configKey]
                .sort((a, b) => (a.order || 99) - (b.order || 99))
                .forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.value;
                    option.textContent = item.note || item.value;
                    element.appendChild(option);
                });
             if (currentSelectedValue && element.querySelector(`option[value="${currentSelectedValue}"]`)) {
                 element.value = currentSelectedValue;
             } else {
                 element.selectedIndex = 0;
             }
        } else if (element && (!systemConfig[configKey] || !Array.isArray(systemConfig[configKey]))) {
             console.warn(`[Main] Dropdown update skipped for #${elementId}: Config key "${configKey}" missing or not an array.`);
        }
    });
     console.log('[Main] Dropdown update process completed.');
};

// --- Initialize App on DOMContentLoaded --- (無變更)
document.addEventListener('DOMContentLoaded', async () => {
    if (!window.CRM_APP_INITIALIZED) {
        window.CRM_APP_INITIALIZED = true;

        if (typeof loadWeeklyBusinessPage === 'function') {
            window.CRM_APP.pageModules['weekly-business'] = loadWeeklyBusinessPage;
            console.log('[Main] Weekly Business List module registered before init.');
        } else {
            console.error('錯誤：找不到 loadWeeklyBusinessPage 函式。');
        }
        if (typeof navigateToWeeklyDetail === 'function') {
            window.CRM_APP.pageModules['weekly-detail'] = navigateToWeeklyDetail;
            console.log('[Main] Weekly Business Detail module registered before init.');
        } else {
            console.error('錯誤：找不到 navigateToWeeklyDetail 函式。');
        }

        await CRM_APP.init();

        if (typeof loadSalesAnalysisPage === 'function') {
            window.CRM_APP.pageModules['sales-analysis'] = loadSalesAnalysisPage;
             console.log('[Main] Sales Analysis module registered.');
        } else {
            console.error('錯誤：找不到 loadSalesAnalysisPage 函式，成交分析頁面可能無法載入。');
        }
    }
});