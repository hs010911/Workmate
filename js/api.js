/**
 * @fileoverview REST API 래퍼
 * @description sessionStorage 토큰 자동 첨부 + JSON 응답/성공여부 처리
 */

/**
 * 인증 헤더 포함 fetch 래퍼
 * @param {string} url
 * @param {Object} options
 * @returns {Promise<Object>}
 */
async function apiRequest(url, options = {}) {
    const token = sessionStorage.getItem("token");
    const headers = {
        "Content-Type": "application/json",
        ...options.headers,
    };
    
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    try {
        const response = await fetch(`${window.apiBase}${url}`, {
            ...options,
            headers,
        });

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
            const text = await response.text();
            throw new Error(`서버 응답 오류: JSON 형식이 아닙니다. (${response.status})`);
        }

        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error(data.message || `요청 실패: ${response.status}`);
        }

        return data;
    } catch (error) {
        if (error.name === "TypeError" && error.message.includes("fetch")) {
            throw new Error("서버에 연결할 수 없습니다. 서버가 실행 중인지 확인해주세요.");
        }
        throw error;
    }
}

// GET
async function apiGet(url) {
    return apiRequest(url, { method: "GET" });
}

// POST
async function apiPost(url, body) {
    return apiRequest(url, {
        method: "POST",
        body: JSON.stringify(body),
    });
}

// PUT
async function apiPut(url, body) {
    return apiRequest(url, {
        method: "PUT",
        body: JSON.stringify(body),
    });
}

// DELETE
async function apiDelete(url) {
    return apiRequest(url, { method: "DELETE" });
}
