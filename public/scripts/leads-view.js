// public/scripts/leads-view.js

// 全域變數
let allLeads = [];
let currentUser = {
    userId: null,
    displayName: '訪客',
    pictureUrl: null
};
let currentView = 'all'; // 'all' or 'mine'

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 初始化 LIFF (含本地模擬)
    await initLIFF();

    // 2. 綁定事件
    bindEvents();

    // 3. 載入資料
    loadLeadsData();
});

async function initLIFF() {
    // 判斷是否為本地環境
    const isLocal = location.hostname === 'localhost' || location.hostname === '127.0.0.1';

    if (isLocal) {
        console.warn('🛠️ [Dev] 偵測到本地環境，啟動 LIFF 模擬模式。');
        currentUser.userId = 'TEST_LOCAL_USER'; // 測試 ID
        currentUser.displayName = '測試員 (Local)';
        updateUserUI(true);
        return; 
    }

    try {
        if (typeof liff === 'undefined') {
            console.error('LIFF SDK 未載入');
            return;
        }
        if (!LIFF_ID) {
            console.log('LIFF ID 未設定');
            return;
        }
        
        await liff.init({ liffId: LIFF_ID });
        
        if (liff.isLoggedIn()) {
            const profile = await liff.getProfile();
            currentUser.userId = profile.userId;
            currentUser.displayName = profile.displayName;
            currentUser.pictureUrl = profile.pictureUrl;
            updateUserUI(true);
        } else {
            updateUserUI(false);
        }
    } catch (error) {
        console.error('LIFF Init Error:', error);
        updateUserUI(false);
    }
}

function updateUserUI(isLoggedIn) {
    const userArea = document.getElementById('user-area');
    const loginBtn = document.getElementById('login-btn');
    
    if (isLoggedIn) {
        userArea.style.display = 'flex';
        loginBtn.style.display = 'none';
        document.getElementById('user-name').textContent = currentUser.displayName;
        if (currentUser.pictureUrl) {
            document.getElementById('user-avatar').src = currentUser.pictureUrl;
            document.getElementById('user-avatar').style.display = 'block';
        } else {
            document.getElementById('user-avatar').style.display = 'none';
        }
    } else {
        userArea.style.display = 'none';
        loginBtn.style.display = 'block';
    }
}

function bindEvents() {
    // 登入
    document.getElementById('login-btn').onclick = () => {
        if (typeof liff !== 'undefined' && LIFF_ID) {
            liff.login();
        } else {
            alert('LIFF 未設定或 SDK 錯誤');
        }
    };

    // 視圖切換
    document.querySelectorAll('.toggle-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.toggle-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentView = btn.dataset.view;
            
            if (currentView === 'mine' && !currentUser.userId) {
                alert('請先登入 LINE 才能篩選您的名片');
                document.querySelector('.toggle-btn[data-view="all"]').click();
                if (typeof liff !== 'undefined' && LIFF_ID) liff.login();
                return;
            }
            renderLeads();
        };
    });

    // 搜尋
    const searchInput = document.getElementById('search-input');
    const clearBtn = document.getElementById('clear-search');
    
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            clearBtn.style.display = e.target.value ? 'flex' : 'none';
            renderLeads();
        });
    }
    
    if (clearBtn) {
        clearBtn.onclick = () => {
            searchInput.value = '';
            clearBtn.style.display = 'none';
            renderLeads();
        };
    }

    // Modal 關閉
    document.querySelectorAll('.close-modal').forEach(el => {
        el.onclick = () => {
            document.getElementById('preview-modal').style.display = 'none';
            document.getElementById('edit-modal').style.display = 'none';
        };
    });
    
    window.onclick = (event) => {
        if (event.target.classList.contains('modal')) {
            event.target.style.display = 'none';
        }
    };

    // 編輯表單提交
    const editForm = document.getElementById('edit-form');
    if (editForm) {
        editForm.onsubmit = handleEditSubmit;
    }
}

async function loadLeadsData() {
    const loadingEl = document.getElementById('loading-indicator');
    const gridEl = document.getElementById('leads-grid');
    
    try {
        // 使用公開 API
        const response = await fetch('/api/line/leads');
        const result = await response.json();
        
        if (result.success) {
            allLeads = result.data;
            if(loadingEl) loadingEl.style.display = 'none';
            if(gridEl) gridEl.style.display = 'grid';
            
            updateCounts();
            renderLeads();
        } else {
            throw new Error('資料載入失敗');
        }
    } catch (error) {
        console.error(error);
        if(loadingEl) loadingEl.innerHTML = '<p style="color:red">無法連線到伺服器</p>';
    }
}

function updateCounts() {
    document.getElementById('count-all').textContent = allLeads.length;
    if (currentUser.userId) {
        const myCount = allLeads.filter(l => l.lineUserId === currentUser.userId).length;
        document.getElementById('count-mine').textContent = myCount;
    }
}

function renderLeads() {
    const grid = document.getElementById('leads-grid');
    const emptyState = document.getElementById('empty-state');
    const searchTerm = document.getElementById('search-input').value.toLowerCase().trim();

    if (!grid) return;

    let filtered = allLeads.filter(lead => {
        if (currentView === 'mine' && lead.lineUserId !== currentUser.userId) return false;
        
        if (searchTerm) {
            const text = `${lead.name} ${lead.company} ${lead.position}`.toLowerCase();
            return text.includes(searchTerm);
        }
        return true;
    });

    if (filtered.length === 0) {
        grid.style.display = 'none';
        if(emptyState) emptyState.style.display = 'block';
        return;
    }

    grid.style.display = 'grid';
    if(emptyState) emptyState.style.display = 'none';
    grid.innerHTML = filtered.map(lead => createCardHTML(lead)).join('');
}

function createCardHTML(lead) {
    const isMine = (lead.lineUserId === currentUser.userId);
    const ownerName = lead.userNickname || 'Unknown';
    const ownerBadge = `👤 ${ownerName}`; 

    const safe = (str) => (str || '').replace(/"/g, '&quot;');
    const safeHtml = (str) => (str || '').replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const leadJson = JSON.stringify(lead).replace(/'/g, "&apos;").replace(/"/g, "&quot;");

    return `
        <div class="lead-card ${isMine ? 'is-mine' : ''}">
            <div class="card-header">
                <span class="owner-badge">${safeHtml(ownerBadge)}</span>
            </div>
            <div class="card-body">
                <div class="lead-name">${safeHtml(lead.name)}</div>
                <div class="lead-position">${safeHtml(lead.position) || '無職稱'}</div>
                <div class="lead-company">
                    <span class="company-icon">🏢</span>
                    ${safeHtml(lead.company)}
                </div>
            </div>
            <div class="card-actions">
                <button class="action-btn" onclick='openPreview("${safe(lead.driveLink)}")'>👁️ 預覽</button>
                <button class="action-btn" onclick='openEdit(${leadJson})'>✏️ 編輯</button>
            </div>
        </div>
    `;
}

async function openPreview(driveLink) {
    if (!driveLink) {
        alert('此名片沒有圖片連結');
        return;
    }
    const modal = document.getElementById('preview-modal');
    const container = document.getElementById('preview-image-container');
    const downloadLink = document.getElementById('preview-download-link');
    
    modal.style.display = 'block';
    container.innerHTML = '<div class="spinner"></div>';
    
    try {
        // 直接呼叫公開的 API (routes/index.js 已修正)
        const res = await fetch(`/api/drive/thumbnail?link=${encodeURIComponent(driveLink)}`);
        const result = await res.json();
        
        if (result.success && result.thumbnailUrl) {
            // 嘗試獲取高解析度
            const highResUrl = result.thumbnailUrl.replace(/=s\d+/, '=s1200');
            container.innerHTML = `<img src="${highResUrl}" alt="名片預覽">`;
            downloadLink.href = driveLink;
        } else {
            throw new Error('無法取得圖片');
        }
    } catch (e) {
        container.innerHTML = '<p>圖片載入失敗 (可能是權限或連結問題)</p>';
        downloadLink.href = driveLink;
    }
}

function openEdit(lead) {
    // 本地測試或已登入都可編輯
    if (!currentUser.userId) {
        if(confirm('請先登入 LINE 才能編輯名片。是否登入？')) {
            if(typeof liff !== 'undefined' && LIFF_ID) liff.login();
        }
        return;
    }

    const modal = document.getElementById('edit-modal');
    
    document.getElementById('edit-rowIndex').value = lead.rowIndex;
    document.getElementById('edit-name').value = lead.name || '';
    document.getElementById('edit-position').value = lead.position || '';
    document.getElementById('edit-company').value = lead.company || '';
    document.getElementById('edit-mobile').value = lead.mobile || '';
    document.getElementById('edit-email').value = lead.email || '';
    document.getElementById('edit-notes').value = ''; // 清空備註
    
    modal.style.display = 'block';
}

async function handleEditSubmit(e) {
    e.preventDefault();
    const btn = e.target.querySelector('button');
    const originalText = btn.textContent;
    btn.disabled = true;
    btn.textContent = '儲存中...';

    const rowIndex = document.getElementById('edit-rowIndex').value;
    const data = {
        name: document.getElementById('edit-name').value,
        position: document.getElementById('edit-position').value,
        company: document.getElementById('edit-company').value,
        mobile: document.getElementById('edit-mobile').value,
        email: document.getElementById('edit-email').value,
        modifier: currentUser.displayName 
    };
    
    // 處理備註 (如果有填寫)
    const notes = document.getElementById('edit-notes').value.trim();
    if (notes) {
        // 注意：後端 updateRawContact 需要您確認是否有對應的備註欄位邏輯
        // 這裡先傳送，若後端未實作則會被忽略
        data.notes = notes;
    }

    try {
        const res = await fetch(`/api/line/leads/${rowIndex}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const result = await res.json();
        
        if (result.success) {
            alert('更新成功！');
            document.getElementById('edit-modal').style.display = 'none';
            loadLeadsData();
        } else {
            alert('更新失敗: ' + result.error);
        }
    } catch (e) {
        alert('網路錯誤');
    } finally {
        btn.disabled = false;
        btn.textContent = originalText;
    }
}