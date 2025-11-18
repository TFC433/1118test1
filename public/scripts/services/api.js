// public/scripts/services/api.js
// 職責：專門處理 API 請求、認證 Token、錯誤處理以及「寫入後自動刷新」的核心邏輯

// Flag to prevent multiple login redirects on concurrent unauthorized requests
let isRedirectingToLogin = false;

/**
 * 經過認證的 fetch 函式，會自動附加 JWT Token，
 * 並在成功的寫入操作後自動觸發瀏覽器刷新。
 * @param {string} url - API 的 URL
 * @param {object} [options={}] - fetch 的選項 (e.g., method, body, headers, skipRefresh)
 * @returns {Promise<any>} - 回傳 API 的 JSON 結果 (或在非 JSON 情況下為 null/text)
 */
async function authedFetch(url, options = {}) {
    const token = localStorage.getItem('crm-token');
    // Default headers, allow overriding/adding via options.headers
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }

    // --- 判斷是否為寫入操作 ---
    const method = options.method ? options.method.toUpperCase() : 'GET';
    const isWriteOperation = ['POST', 'PUT', 'DELETE'].includes(method);
    // --- 判斷結束 ---

    let response; // Declare response outside try for potential use in finally
    try {
        console.log(`[authedFetch] Requesting: ${method} ${url}`); // Log request start
        response = await fetch(url, { ...options, headers });

        // --- Handle Unauthorized/Forbidden ---
        if (response.status === 401 || response.status === 403) {
            // Prevent multiple redirects if several requests fail concurrently
            if (!isRedirectingToLogin) {
                isRedirectingToLogin = true; // Set flag
                console.warn(`[authedFetch] Unauthorized (${response.status}). Redirecting to login.`);
                localStorage.removeItem('crm-token');
                localStorage.removeItem('crmCurrentUserName'); // Also clear user name
                showNotification('您的登入已過期或無效，將跳轉至登入頁面。', 'error', 3000);
                // Delay redirect slightly to allow notification to show
                setTimeout(() => { window.location.href = '/login.html'; }, 2000);
            }
            // Throw error to stop processing this specific request
            throw new Error('Unauthorized');
        }

        // --- Parse Response Body ---
        let result = null; // Default result
        const contentType = response.headers.get("content-type");

        if (contentType && contentType.indexOf("application/json") !== -1) {
            // If JSON is expected, try parsing
            try {
                result = await response.json();
            } catch (jsonError) {
                // Handle cases where server *says* JSON but sends invalid JSON
                console.error(`[authedFetch] Failed to parse JSON response from ${url}:`, jsonError);
                if (!response.ok) {
                    // If the status was already bad, throw a generic error
                    throw new Error(`API 請求失敗，狀態碼: ${response.status}，且回應非有效 JSON。`);
                } else {
                    // If status was ok but JSON is bad, maybe treat as non-critical error?
                    // Or throw, depending on how strict you want to be.
                    throw new Error(`API 請求成功，但回應的 JSON 格式無效。`);
                }
            }
        } else if (response.ok && response.body) {
            // Handle non-JSON successful responses if necessary (e.g., text, blob)
            console.log(`[authedFetch] Received non-JSON response from ${url}. Status: ${response.status}.`);
            result = null;
        }


        // --- Handle Non-OK HTTP Status ---
        if (!response.ok) {
            // Use error details from JSON if available, otherwise use status text
            const errorDetails = result?.details || result?.message || result?.error || response.statusText || `HTTP error ${response.status}`;
            console.error(`[authedFetch] API Error (${method} ${url}): Status ${response.status}, Details: ${errorDetails}`);
            throw new Error(errorDetails);
        }

        // --- 【*** 關鍵修改：從「強制刷新」改為「智慧刷新」 ***】 ---
        // 加入 !options.skipRefresh 判斷，允許呼叫端略過自動刷新
        if (isWriteOperation && response.ok && !options.skipRefresh) {
            console.log(`[authedFetch] Successful write operation (${method} ${url}), triggering VIEW refresh.`);

            // 顯示成功訊息
            const successMsg = result?.message || (method === 'DELETE' ? '刪除成功！' : '操作成功！');
            showNotification(successMsg, 'success', 2000);

            // 呼叫 main.js 中的智慧刷新函式
            if (window.CRM_APP && typeof window.CRM_APP.refreshCurrentView === 'function') {
                // 稍微延遲，讓使用者看到成功訊息，然後才開始刷新
                setTimeout(() => {
                    // 呼叫這個函式会重新載入當前頁面的資料，但不會刷新整個網頁
                    window.CRM_APP.refreshCurrentView(successMsg);
                }, 100); 
            } else {
                // 備用方案（如果 refreshCurrentView 找不到，才使用重載）
                console.warn('[authedFetch] CRM_APP.refreshCurrentView is not defined, falling back to location.reload().');
                setTimeout(() => { location.reload(); }, 1500);
            }
        }
        // --- 【*** 修改結束 ***】 ---

        // Return the parsed JSON result (or null/text if non-JSON)
        return result;

    } catch (error) {
        // Log the caught error (could be network error, JSON parse error, HTTP error, Unauthorized)
        // Avoid double logging Unauthorized if redirect is happening
        if (error.message !== 'Unauthorized') {
            console.error(`[authedFetch] Final Catch Block Error (${method} ${url}):`, error.message);
        }

        // Show notification for non-Unauthorized errors if redirect isn't active
        if (error.message !== 'Unauthorized' && !isRedirectingToLogin) {
            // Sanitize message slightly for user display
            const displayError = error.message.length > 100 ? error.message.substring(0, 97) + '...' : error.message;
            showNotification(`操作失敗: ${displayError}`, 'error');
        }

        // IMPORTANT: Re-throw the error so the calling function knows the operation failed
        throw error;
    }
}