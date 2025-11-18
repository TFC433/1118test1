document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('login-form');
    const errorMessage = document.getElementById('error-message');
    const loginBtn = document.getElementById('login-btn');

    // 檢查是否已經登入，如果是，直接跳轉到儀表板
    if (localStorage.getItem('crm-token')) {
        window.location.href = '/dashboard.html';
    }
    
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        errorMessage.textContent = '';
        loginBtn.disabled = true;
        loginBtn.textContent = '登入中...';

        const username = loginForm.username.value;
        const password = loginForm.password.value;

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            });

            const result = await response.json();

            if (response.ok && result.success) {
                // 登入成功，儲存 Token 並跳轉
                localStorage.setItem('crm-token', result.token);
                window.location.href = '/dashboard.html';
            } else {
                // 登入失敗
                errorMessage.textContent = result.message || '登入失敗，請稍後再試';
                loginBtn.disabled = false;
                loginBtn.textContent = '登入';
            }
        } catch (error) {
            console.error('登入時發生錯誤:', error);
            errorMessage.textContent = '網路連線錯誤，請檢查您的網路';
            loginBtn.disabled = false;
            loginBtn.textContent = '登入';
        }
    });
});