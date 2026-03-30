/**
 * @fileoverview admin-login.html — 관리자 전용 로그인
 * @description 관리자 로그인 처리(관리자만 통과)
 */

document.addEventListener("DOMContentLoaded", () => {
    const form = document.getElementById("adminLoginForm");
    if (form) {
        form.addEventListener("submit", handleAdminLogin);
    }
    setupPasswordToggle("adminPassword", "adminPasswordToggle");
});

// 관리자 로그인 처리
async function handleAdminLogin(event) {
    event.preventDefault();

    const usernameError = document.getElementById("adminUsernameError");
    const passwordError = document.getElementById("adminPasswordError");
    if (usernameError) usernameError.style.display = "none";
    if (passwordError) passwordError.style.display = "none";

    const formData = new FormData(event.target);
    const loginData = {
        username: formData.get("username"),
        password: formData.get("password"),
    };

    try {
        const res = await fetch(`${window.apiBase}/api/auth/login`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(loginData),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            const errorMsg = data.message || "로그인 실패";
            if (errorMsg.includes("아이디") || errorMsg.includes("ID")) {
                if (usernameError) usernameError.style.display = "block";
            } else if (errorMsg.includes("비밀번호") || errorMsg.includes("password")) {
                if (passwordError) passwordError.style.display = "block";
            } else {
                showNotification(errorMsg, "error");
            }
            return;
        }

        if (!data.user || data.user.role !== "admin") {
            showNotification("관리자 권한이 있는 계정으로 로그인해 주세요.", "error");
            return;
        }

        sessionStorage.setItem("token", data.token);
        sessionStorage.setItem("user", JSON.stringify(data.user));
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        window.location.href = "admin.html";
    } catch (error) {
        console.error("관리자 로그인 실패:", error);
        showNotification("로그인에 실패했습니다: " + error.message, "error");
    }
}
