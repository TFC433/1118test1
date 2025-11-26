// views/scripts/dashboard.js (V2.4 - 儀表板週報 widget 支援雙日曆顯示)

const dashboardManager = {
    kanbanRawData: {},
    processedOpportunities: [], 
    availableYears: [], 
    kanbanViewMode: localStorage.getItem('dashboardKanbanViewMode') || 'kanban',
    chipWallInstance: null,

    async refresh(force = false) {
        console.log(`🔄 [Dashboard] 執行儀表板刷新... (強制: ${force})`);
        showLoading('正在同步儀表板資料...');

        const dashboardApiUrl = force ? `/api/dashboard?t=${Date.now()}` : '/api/dashboard';

        try {
            const [dashboardResult, announcementResult, interactionsResult] = await Promise.all([
                authedFetch(dashboardApiUrl),
                authedFetch('/api/announcements'),
                authedFetch('/api/interactions/all?fetchAll=true') 
            ]);

            if (!dashboardResult.success) throw new Error(dashboardResult.details || '獲取儀表板資料失敗');
            if (!interactionsResult || !interactionsResult.data) throw new Error('獲取互動資料失敗 (回應格式不正確)');

            const data = dashboardResult.data;
            const interactions = interactionsResult.data || [];
            this.kanbanRawData = data.kanbanData || {};
            
            const latestInteractionMap = new Map();
            interactions.forEach(interaction => {
                const id = interaction.opportunityId;
                const existing = latestInteractionMap.get(id) || 0;
                const current = new Date(interaction.interactionTime || interaction.createdTime).getTime();
                if (current > existing) latestInteractionMap.set(id, current);
            });

            const allOpportunities = Object.values(this.kanbanRawData).flatMap(stage => stage.opportunities);
            const yearSet = new Set();
            
            this.processedOpportunities = allOpportunities.map(item => {
                const selfUpdate = new Date(item.lastUpdateTime || item.createdTime).getTime();
                const lastInteraction = latestInteractionMap.get(item.opportunityId) || 0;
                item.effectiveLastActivity = Math.max(selfUpdate, lastInteraction);
                
                const year = item.createdTime ? new Date(item.createdTime).getFullYear() : null;
                item.creationYear = year;
                if(year) yearSet.add(year);
                
                return item;
            });
            this.availableYears = Array.from(yearSet).sort((a, b) => b - a); 

            this._renderHeaderControls();
            this.renderStats(data.stats);

            if(announcementResult.success) {
                this.renderAnnouncementsWidget(announcementResult.data);
            }

            this.renderKanbanView(); 

            const activityWidget = document.querySelector('#activity-feed-widget .widget-content');
            if (activityWidget) activityWidget.innerHTML = this.renderActivityFeed(data.recentActivity || []);

            const weeklyBusinessWidget = document.getElementById('weekly-business-widget');
            if (weeklyBusinessWidget) this.renderWeeklyBusinessWidget(data.weeklyBusiness || [], data.thisWeekInfo);

            if (window.mapManager) {
                await window.mapManager.update();
            }

        } catch (error) {
            if (error.message !== 'Unauthorized') {
                console.error("[Dashboard] 刷新儀表板時發生錯誤:", error);
                showNotification("儀表板刷新失敗", "error");
            }
        } finally {
            hideLoading();
            console.log('✅ [Dashboard] 儀表板刷新完成');
        }
    },

    _renderHeaderControls() {
        const container = document.querySelector('#kanban-widget .kanban-controls-container');
        if (!container) return;

        const styleId = 'dashboard-kanban-styles-final';
        if (!document.getElementById(styleId)) {
            const style = document.createElement('style');
            style.id = styleId;
            style.innerHTML = `
                #kanban-widget .widget-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: nowrap; }
                #kanban-widget .widget-title { white-space: nowrap; flex-shrink: 0; }
                .kanban-controls-container { display: flex; align-items: center; justify-content: flex-end; gap: var(--spacing-5); flex-grow: 1; flex-wrap: wrap; }
                .kanban-filter, .kanban-actions-group { display: flex; align-items: center; gap: var(--spacing-3); }
                .chip-wall-extra-controls { display: none; gap: var(--spacing-3); }
                #kanban-widget.chip-wall-active .chip-wall-extra-controls { display: flex; }
                .kanban-filter label { font-size: 0.8rem; color: var(--text-muted); }
            `;
            document.head.appendChild(style);
        }

        const systemConfig = window.CRM_APP?.systemConfig || {};

        const yearFilterHTML = `
            <div>
                <label for="kanban-year-filter">年度</label>
                <select id="kanban-year-filter" class="form-select-sm">
                    <option value="all">全部年度</option>
                    ${this.availableYears.map(y => `<option value="${y}">${y}年</option>`).join('')}
                </select>
            </div>
        `;

        const filtersHTML = `
            <div class="kanban-filter">
                ${yearFilterHTML}
                <div>
                    <label for="kanban-type-filter">種類</label>
                    <select id="kanban-type-filter" class="form-select-sm">
                        <option value="all">所有種類</option>
                        ${(systemConfig['機會種類'] || []).map(opt => `<option value="${opt.value}">${opt.note || opt.value}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label for="kanban-source-filter">來源</label>
                    <select id="kanban-source-filter" class="form-select-sm">
                        <option value="all">所有來源</option>
                         ${(systemConfig['機會來源'] || []).map(opt => `<option value="${opt.value}">${opt.note || opt.value}</option>`).join('')}
                    </select>
                </div>
                <div>
                    <label for="kanban-time-filter">活動時間</label>
                    <select id="kanban-time-filter" class="form-select-sm">
                        <option value="all">不限</option>
                        <option value="7">近 7 天</option>
                        <option value="30">近 30 天</option>
                        <option value="90">近 90 天</option>
                    </select>
                </div>
            </div>
        `;

        const actionsHTML = `
            <div class="kanban-actions-group">
                <div class="chip-wall-extra-controls">
                    <button class="action-btn small secondary" id="chip-wall-view-mode-toggle">切換模式</button>
                    <button class="action-btn small secondary" id="chip-wall-toggle-all">全部展開</button>
                </div>
                <div class="kanban-main-toggle">
                    <button class="action-btn small secondary" id="kanban-view-toggle" title="切換檢視模式">切換晶片牆</button>
                </div>
            </div>
        `;

        container.innerHTML = filtersHTML + actionsHTML;

        ['kanban-year-filter', 'kanban-type-filter', 'kanban-source-filter', 'kanban-time-filter'].forEach(id => {
            document.getElementById(id)?.addEventListener('change', () => this.renderKanbanView());
        });

        document.getElementById('kanban-view-toggle')?.addEventListener('click', () => this.toggleKanbanView());

        document.getElementById('chip-wall-view-mode-toggle')?.addEventListener('click', () => {
            if (this.chipWallInstance) {
                this.chipWallInstance.viewMode = this.chipWallInstance.viewMode === 'grid' ? 'flex' : 'grid';
                localStorage.setItem('chipWallViewMode', this.chipWallInstance.viewMode);
                this.chipWallInstance.render();
                document.getElementById('chip-wall-view-mode-toggle').textContent = this.chipWallInstance.viewMode === 'grid' ? '切換流體模式' : '切換網格模式';
            }
        });

        document.getElementById('chip-wall-toggle-all')?.addEventListener('click', (e) => {
            if (this.chipWallInstance) {
                const btn = e.currentTarget;
                const isExpanding = btn.textContent.includes('展開');
                this.chipWallInstance.container.querySelectorAll('.chip-container').forEach(c => c.classList.toggle('is-expanded', isExpanding));
                this.chipWallInstance.container.querySelectorAll('.chip-expand-btn').forEach(b => { b.textContent = isExpanding ? '收合' : '展開更多...'; });
                btn.textContent = isExpanding ? '全部收合' : '全部展開';
            }
        });
    },
    
    forceRefresh: async function() {
        showLoading('正在強制同步所有資料...');
        let currentPageName = 'dashboard'; 
        let currentPageParams = {};

        try {
            const currentHash = window.location.hash.substring(1);
            if (currentHash && window.CRM_APP.pageConfig[currentHash.split('?')[0]]) {
                const [pageName, paramsString] = currentHash.split('?');
                currentPageName = pageName;
                if (paramsString) {
                    try {
                        currentPageParams = Object.fromEntries(new URLSearchParams(paramsString));
                        Object.keys(currentPageParams).forEach(key => {
                            currentPageParams[key] = decodeURIComponent(currentPageParams[key]);
                        });
                    } catch (e) {
                        console.warn(`[Dashboard] 解析 forceRefresh 的 URL 參數失敗: ${paramsString}`, e);
                        currentPageParams = {};
                    }
                }
            }
            
            await authedFetch('/api/cache/invalidate', { method: 'POST' });
            showNotification('後端快取已清除，正在重新載入...', 'info');

            Object.keys(window.CRM_APP.pageConfig).forEach(key => {
                 if (!key.includes('-details')) { 
                     window.CRM_APP.pageConfig[key].loaded = false;
                 }
            });

            await this.refresh(true);

            showNotification('所有資料已強制同步！正在重新整理目前頁面...', 'success');

            await new Promise(resolve => setTimeout(resolve, 150));
            await window.CRM_APP.navigateTo(currentPageName, currentPageParams, false);

        } catch (error) {
            if (error.message !== 'Unauthorized') {
                console.error("[Dashboard] 強制刷新失敗:", error);
                showNotification("強制刷新失敗，請稍後再試。", "error");
            }
            hideLoading();
        } finally {
             hideLoading();
        }
    },
    renderStats: function(stats = {}) {
        document.getElementById('contacts-count').textContent = stats.contactsCount || 0;
        document.getElementById('opportunities-count').textContent = stats.opportunitiesCount || 0;
        document.getElementById('event-logs-count').textContent = stats.eventLogsCount || 0;
        document.getElementById('followup-count').textContent = stats.followUpCount || 0;

        const contactsTrend = document.getElementById('contacts-trend');
        if (contactsTrend) contactsTrend.textContent = stats.contactsCountMonth > 0 ? `+ ${stats.contactsCountMonth} 本月` : '';
        const opportunitiesTrend = document.getElementById('opportunities-trend');
        if (opportunitiesTrend) opportunitiesTrend.textContent = stats.opportunitiesCountMonth > 0 ? `+ ${stats.opportunitiesCountMonth} 本月` : '';
        const eventLogsTrend = document.getElementById('event-logs-trend');
        if (eventLogsTrend) eventLogsTrend.textContent = stats.eventLogsCountMonth > 0 ? `+ ${stats.eventLogsCountMonth} 本月` : '';
    },
    renderAnnouncementsWidget: function(announcements) {
        const container = document.querySelector('#announcement-widget .widget-content');
        const header = document.querySelector('#announcement-widget .widget-header');
        if (!container || !header) return;

        const oldBtn = header.querySelector('.action-btn');
        if(oldBtn) oldBtn.remove();

        const viewAllBtn = document.createElement('button');
        viewAllBtn.className = 'action-btn secondary';
        viewAllBtn.textContent = '查看更多公告';
        viewAllBtn.onclick = () => CRM_APP.navigateTo('announcements');
        header.appendChild(viewAllBtn);

        if (!announcements || announcements.length === 0) {
            container.innerHTML = `<div class="alert alert-info" style="text-align: center;">目前沒有公告</div>`;
            return;
        }

        let html = '<div class="announcement-list">';
        announcements.slice(0, 1).forEach(item => {
            const isPinnedIcon = item.isPinned ? '<span class="pinned-icon" title="置頂公告">📌</span>' : '';
            html += `
                <div class="announcement-item" data-announcement-id="${item.id}">
                    <div class="announcement-header">
                        <h4 class="announcement-title">${isPinnedIcon}${item.title}</h4>
                        <span class="announcement-creator">👤 ${item.creator}</span>
                    </div>
                    <p class="announcement-content">${item.content}</p>
                    <div class="announcement-footer">
                        <span class="announcement-time">發佈於 ${formatDateTime(item.lastUpdateTime)}</span>
                    </div>
                </div>
            `;
        });
        html += '</div>';
        container.innerHTML = html;

        const announcementItem = container.querySelector('.announcement-item');
        if (announcementItem) {
            const contentP = announcementItem.querySelector('.announcement-content');
            if (contentP.scrollHeight > contentP.clientHeight) {
                const footer = announcementItem.querySelector('.announcement-footer');
                const toggleBtn = document.createElement('button');
                toggleBtn.textContent = '展開';
                toggleBtn.className = 'action-btn small secondary announcement-toggle';
                toggleBtn.onclick = (e) => {
                    e.stopPropagation();
                    contentP.classList.toggle('expanded');
                    toggleBtn.textContent = contentP.classList.contains('expanded') ? '收合' : '展開';
                };
                footer.prepend(toggleBtn);
            }
        }
        
        if (!document.getElementById('announcement-styles')) {
            const style = document.createElement('style');
            style.id = 'announcement-styles';
            style.innerHTML = `
                .announcement-item { padding: 1rem; border-radius: var(--rounded-lg); cursor: pointer; transition: background-color 0.2s ease; border: 1px solid var(--border-color); }
                .announcement-item:hover { background-color: var(--glass-bg); }
                .announcement-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; gap: 1rem; }
                .announcement-title { font-weight: 600; color: var(--text-primary); margin: 0; }
                .pinned-icon { margin-right: 0.5rem; }
                .announcement-creator { font-size: 0.8rem; font-weight: 600; color: var(--text-secondary); background: var(--glass-bg); padding: 2px 8px; border-radius: 1rem; flex-shrink: 0; }
                .announcement-content { font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6; margin: 0; white-space: pre-wrap; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
                .announcement-content.expanded { -webkit-line-clamp: unset; max-height: none; }
                .announcement-footer { margin-top: 0.75rem; display:flex; justify-content: space-between; align-items: center; }
                .announcement-toggle { margin-right: auto; }
                .announcement-time { font-size: 0.8rem; color: var(--text-muted); }
            `;
            document.head.appendChild(style);
        }
    },
    toggleKanbanView: function() {
        this.kanbanViewMode = this.kanbanViewMode === 'kanban' ? 'chip-wall' : 'kanban';
        localStorage.setItem('dashboardKanbanViewMode', this.kanbanViewMode);
        this.renderKanbanView();
    },
    renderKanbanView: function() { 
        const year = document.getElementById('kanban-year-filter')?.value || 'all';
        const type = document.getElementById('kanban-type-filter')?.value || 'all';
        const source = document.getElementById('kanban-source-filter')?.value || 'all';
        const time = document.getElementById('kanban-time-filter')?.value || 'all';

        const allOpportunities = this.processedOpportunities; 
        let filteredOpportunities = allOpportunities;

        if (year !== 'all') filteredOpportunities = filteredOpportunities.filter(opp => String(opp.creationYear) === year);
        if (type !== 'all') filteredOpportunities = filteredOpportunities.filter(opp => opp.opportunityType === type);
        if (source !== 'all') filteredOpportunities = filteredOpportunities.filter(opp => opp.opportunitySource === source);
        if (time !== 'all') {
            const days = parseInt(time);
            const cutoff = new Date().getTime() - days * 24 * 60 * 60 * 1000;
            filteredOpportunities = filteredOpportunities.filter(opp => opp.effectiveLastActivity && opp.effectiveLastActivity >= cutoff);
        }

        const kanbanWidget = document.getElementById('kanban-widget');
        const kanbanContainer = document.getElementById('kanban-board-container');
        const chipWallContainer = document.getElementById('chip-wall-board-container');
        const toggleBtn = document.getElementById('kanban-view-toggle');

        if (this.kanbanViewMode === 'chip-wall') {
            kanbanWidget.classList.add('chip-wall-active');
            kanbanContainer.style.display = 'none';
            chipWallContainer.style.display = 'block';
            if (toggleBtn) toggleBtn.textContent = '切換看板';

            if (typeof ChipWall !== 'undefined') {
                this.chipWallInstance = new ChipWall('#chip-wall-board-container', {
                    stages: CRM_APP.systemConfig['機會階段'] || [],
                    items: filteredOpportunities, 
                    colorConfigKey: '機會種類',
                    isDraggable: true,
                    isCollapsible: true,
                    useDynamicSize: true,
                    showControls: false, 
                    onItemUpdate: () => { this.refresh(true); } 
                });
                this.chipWallInstance.render();
            } else {
                chipWallContainer.innerHTML = `<div class="alert alert-error">晶片牆元件載入失敗</div>`;
            }

        } else {
            kanbanWidget.classList.remove('chip-wall-active');
            kanbanContainer.style.display = 'block';
            chipWallContainer.style.display = 'none';
            if (toggleBtn) toggleBtn.textContent = '切換晶片牆';

            const filteredKanbanData = {};
            (CRM_APP.systemConfig['機會階段'] || []).forEach(stageInfo => {
                filteredKanbanData[stageInfo.value] = { name: stageInfo.note, opportunities: [], count: 0 };
            });
            filteredOpportunities.forEach(opp => {
                if (filteredKanbanData[opp.currentStage]) {
                    filteredKanbanData[opp.currentStage].opportunities.push(opp);
                }
            });
            Object.keys(filteredKanbanData).forEach(stageId => {
                filteredKanbanData[stageId].opportunities.sort((a, b) => b.effectiveLastActivity - a.effectiveLastActivity);
                filteredKanbanData[stageId].count = filteredKanbanData[stageId].opportunities.length;
            });
            this.renderKanban(filteredKanbanData);
        }
    },
    renderKanban: function(stagesData) { 
        const kanbanBoard = document.getElementById('kanban-board-container');
        const systemConfig = window.CRM_APP?.systemConfig || {};
        if (!kanbanBoard || !stagesData || !systemConfig['機會階段']) {
            kanbanBoard.innerHTML = '<div class="loading show"><div class="spinner"></div></div>';
            return;
        };

        let html = '<div class="kanban-board">';
        systemConfig['機會階段'].forEach(stageInfo => {
            const stage = stagesData[stageInfo.value] || { name: stageInfo.note, opportunities: [], count: 0 };
            html += `<div class="kanban-column" data-stage-id="${stageInfo.value}">
                        <div class="kanban-header">
                            <div class="kanban-title">${stage.name}</div>
                            <div class="kanban-count">${stage.count}</div>
                        </div>
                        <div class="opportunities-list">`;

            (stage.opportunities || []).slice(0, 5).forEach(opp => {
                const oppTypeConfig = (systemConfig['機會種類'] || []).find(t => t.value === opp.opportunityType);
                const cardColor = oppTypeConfig?.color || 'var(--border-color)';
                html += `<div id="opp-card-${opp.opportunityId}" class="kanban-card" draggable="true" ondragstart="kanbanBoardManager.drag(event)" onclick="CRM_APP.navigateTo('opportunity-details', { opportunityId: '${opp.opportunityId}' })" style="--card-brand-color: ${cardColor};">
                            <div class="card-title">${opp.opportunityName}</div>
                            <div class="card-company">🏢 ${opp.customerCompany}</div>
                            <div class="card-tags">
                                <span class="card-tag assignee">👤 ${opp.assignee}</span>
                                ${opp.opportunityType ? `<span class="card-tag type">📖 ${oppTypeConfig?.note || opp.opportunityType}</span>` : ''}
                            </div>
                            ${opp.opportunityValue ? `<div class="card-value">💰 ${opp.opportunityValue}</div>` : ''}
                        </div>`;
            });

            if (stage.opportunities && stage.opportunities.length > 5) {
                html += `<button class="expand-btn" onclick="dashboardManager.expandStage('${stageInfo.value}')">展開 (+${stage.opportunities.length - 5})</button>`;
            }
            html += `</div></div>`;
        });
        html += '</div>';
        kanbanBoard.innerHTML = html;

        if (typeof kanbanBoardManager !== 'undefined') {
            kanbanBoardManager.initialize();
        }
    },
    expandStage: function(stageId) {
        const stageData = this.kanbanRawData[stageId]; 
        if (!stageData) return;
        
        const year = document.getElementById('kanban-year-filter')?.value || 'all';
        const type = document.getElementById('kanban-type-filter')?.value || 'all';
        const source = document.getElementById('kanban-source-filter')?.value || 'all';
        const time = document.getElementById('kanban-time-filter')?.value || 'all';

        const opportunitiesToShow = this.processedOpportunities.filter(opp => {
            if (opp.currentStage !== stageId) return false;
            if (year !== 'all' && String(opp.creationYear) !== year) return false;
            if (type !== 'all' && opp.opportunityType !== type) return false;
            if (source !== 'all' && opp.opportunitySource !== source) return false;
            if (time !== 'all') {
                const days = parseInt(time);
                const cutoff = new Date().getTime() - days * 24 * 60 * 60 * 1000;
                if (!opp.effectiveLastActivity || opp.effectiveLastActivity < cutoff) return false;
            }
            return true;
        });

        const modalTitle = document.getElementById('kanban-expand-title');
        const modalContent = document.getElementById('kanban-expand-content');
        if (!modalTitle || !modalContent) return;
        
        modalTitle.textContent = `階段: ${stageData.name} (${opportunitiesToShow.length} 筆)`;
        modalContent.innerHTML = (typeof renderOpportunitiesTable === 'function') 
            ? renderOpportunitiesTable(opportunitiesToShow) 
            : '<div class="alert alert-error">無法渲染</div>';
        showModal('kanban-expand-modal');
    },
    renderActivityFeed: function(feedData) {
        if (!feedData || feedData.length === 0) return '<div class="alert alert-info">尚無最新動態</div>';
        const iconMap = { '系統事件': '⚙️', '會議討論': '📅', '事件報告': '📝', '電話聯繫': '📞', '郵件溝通': '📧', 'new_contact': '👤' };
        let html = '<ul class="activity-feed-list">';
        feedData.forEach(item => {
            html += `<li class="activity-feed-item">`;
            if (item.type === 'interaction') {
                const i = item.data;
                let contextLink = i.contextName || '系統活動';
                if (i.opportunityId) {
                    contextLink = `<a href="#" class="text-link" onclick="event.preventDefault(); CRM_APP.navigateTo('opportunity-details', { opportunityId: '${i.opportunityId}' })">${i.contextName}</a>`;
                } else if (i.companyId && i.contextName !== '系統活動' && i.contextName !== '未知公司' && i.contextName !== '未指定') {
                    const encodedCompanyName = encodeURIComponent(i.contextName);
                    contextLink = `<a href="#" class="text-link" onclick="event.preventDefault(); CRM_APP.navigateTo('company-details', { companyName: '${encodedCompanyName}' })">${i.contextName}</a>`;
                }
                let summaryHTML = i.contentSummary || '';
                const linkRegex = /\[(.*?)\]\(event_log_id=([a-zA-Z0-9]+)\)/g;
                summaryHTML = summaryHTML.replace(linkRegex, (fullMatch, text, eventId) => {
                    const safeEventId = eventId.replace(/'/g, "\\'").replace(/"/g, '&quot;');
                    return `<a href="#" class="text-link" onclick="event.preventDefault(); showEventLogReport('${safeEventId}')">${text}</a>`;
                });

                html += `<div class="feed-icon">${iconMap[i.eventType] || '🔔'}</div>
                         <div class="feed-content">
                            <div class="feed-text"><strong>${i.recorder}</strong> 在 <strong>${contextLink}</strong> ${i.eventTitle ? `建立了${i.eventTitle}` : `新增了一筆${i.eventType}`}</div>
                            <div class="feed-summary">${summaryHTML}</div>
                            <div class="feed-time">${formatDateTime(i.interactionTime)}</div>
                         </div>`;
            } else if (item.type === 'new_contact') {
                const c = item.data;
                const creator = c.userNickname ? `<strong>${c.userNickname}</strong> 新增了潛在客戶:` : `<strong>新增潛在客戶:</strong>`;
                html += `<div class="feed-icon">${iconMap['new_contact']}</div>
                         <div class="feed-content">
                            <div class="feed-text">${creator} ${c.name || '(無姓名)'}</div>
                            <div class.="feed-summary">🏢 ${c.company || '(無公司資訊)'}</div>
                            <div class="feed-time">${formatDateTime(c.createdTime)}</div>
                         </div>`;
            }
            html += `</li>`;
        });
        html += '</ul>';
        return html;
    },

    renderWeeklyBusinessWidget(entries, weekInfo) {
        const widget = document.getElementById('weekly-business-widget');
        if (!widget) return;
        const container = widget.querySelector('.widget-content');
        const header = widget.querySelector('.widget-header');
        const titleEl = header.querySelector('.widget-title');
        const systemConfig = window.CRM_APP?.systemConfig || {};
        if (weekInfo && weekInfo.title) {
            titleEl.innerHTML = `本週業務重點 <span style="font-size: 0.8rem; color: var(--text-muted); font-weight: 500;">${weekInfo.title}</span>`;
        }
        let button = header.querySelector('.action-btn');
        if (!button) {
            button = document.createElement('button');
            button.className = 'action-btn small secondary';
            header.appendChild(button);
        }
        button.textContent = '查看週報';
        button.onclick = () => { if (weekInfo?.weekId) { sessionStorage.setItem('navigateToWeekId', weekInfo.weekId); CRM_APP.navigateTo('weekly-business'); }};
        button.disabled = !weekInfo?.weekId;
        const themes = systemConfig['週間業務主題'] || [{value: 'IoT', note: 'IoT'}, {value: 'DT', note: 'DT'}];

        const todayString = new Date().toISOString().split('T')[0];

        let gridHtml = `<div class="weekly-grid-container"><div class="weekly-grid-header"><div class="day-label-placeholder"></div>${themes.map(t => `<div class="topic-header ${t.value.toLowerCase()}">${t.note}</div>`).join('')}</div><div class="weekly-grid-body">`;
        (weekInfo.days || []).forEach(dayInfo => {
            const dayIndex = dayInfo.dayIndex;
            if (dayIndex < 1 || dayIndex > 5) return;
            const holidayClass = dayInfo.holidayName ? 'is-holiday' : '';

            const isToday = dayInfo.date === todayString;
            const todayClass = isToday ? 'is-today' : '';
            const todayIndicator = isToday ? '<span class="today-indicator">今天</span>' : '';

            gridHtml += `<div class="weekly-day-row ${holidayClass}">
                            <div class="day-label ${todayClass}">
                                ${['週一','週二','週三','週四','週五'][dayIndex-1]}<br>
                                <span style="font-size: 0.8rem; color: var(--text-muted);">(${dayInfo.displayDate})</span>
                                ${holidayClass ? `<span class="holiday-name">${dayInfo.holidayName}</span>` : ''}
                                ${todayIndicator}
                            </div>
                            
                            ${themes.map(t => {
                                // 【*** 修改重點：雙日曆分流顯示 (DX左/AT右) ***】
                                let calendarEventsHtml = '';
                                
                                // 左欄 (IoT)：顯示 DX 日曆 (dxCalendarEvents)
                                if (t.value === 'IoT' && dayInfo.dxCalendarEvents && dayInfo.dxCalendarEvents.length > 0) {
                                    calendarEventsHtml = `<div class="calendar-events-list" style="margin-bottom:6px;">`;
                                    dayInfo.dxCalendarEvents.forEach(evt => {
                                       // 使用 div (換行), 顏色 #94a3b8, 粗體
                                       calendarEventsHtml += `<div class="calendar-text-item" style="font-size:0.75rem; padding:1px 4px; margin-bottom:2px; color: #94a3b8; font-weight: 700;">📅 ${evt.summary}</div>`;
                                    });
                                    calendarEventsHtml += `<div class="calendar-separator" style="margin:4px 0;"></div></div>`;
                                }

                                // 右欄 (DT)：顯示 AT 日曆 (atCalendarEvents)
                                if (t.value === 'DT' && dayInfo.atCalendarEvents && dayInfo.atCalendarEvents.length > 0) {
                                    calendarEventsHtml = `<div class="calendar-events-list" style="margin-bottom:6px;">`;
                                    dayInfo.atCalendarEvents.forEach(evt => {
                                       calendarEventsHtml += `<div class="calendar-text-item" style="font-size:0.75rem; padding:1px 4px; margin-bottom:2px; color: #94a3b8; font-weight: 700;">📅 ${evt.summary}</div>`;
                                    });
                                    calendarEventsHtml += `<div class="calendar-separator" style="margin:4px 0;"></div></div>`;
                                }
                                // 【*** 修改結束 ***】

                                return `<div class="topic-cell ${holidayClass} ${todayClass}" id="wb-dash-${dayIndex}-${t.value.toLowerCase()}">
                                    ${calendarEventsHtml}
                                </div>`;
                            }).join('')}
                         </div>`;
        });
        gridHtml += '</div></div>';
        container.innerHTML = gridHtml;
        (entries || []).forEach(entry => {
            try {
                if (entry && entry['日期'] && /^\d{4}-\d{2}-\d{2}$/.test(entry['日期'])) {
                    const [y, m, d] = entry['日期'].split('-').map(Number);
                    const entryDateUTC = new Date(Date.UTC(y, m - 1, d));
                    if (!isNaN(entryDateUTC.getTime())) {
                        const dayOfWeek = entryDateUTC.getUTCDay();
                        if (dayOfWeek >= 1 && dayOfWeek <= 5) {
                            const category = (entry['category'] || themes[0].value).toLowerCase();
                            const cell = document.getElementById(`wb-dash-${dayOfWeek}-${category}`);
                            if (cell) cell.innerHTML += `<div class="wb-item"><div class="wb-topic">${entry['主題']}</div><div class="wb-participants">👤 ${entry['參與人員'] || 'N/A'}</div></div>`;
                        }
                    }
                }
            } catch (e) {
                 console.warn('渲染儀表板業務紀錄時出錯:', entry, e);
            }
        });
    }
};

window.dashboardManager = dashboardManager;

if (typeof CRM_APP === 'undefined') {
    window.CRM_APP = { systemConfig: {} };
}