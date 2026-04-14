/**
 * @fileoverview 사용자 로그인·회원가입 (login.html, register.html)
 * @description 사용자 로그인/회원가입 처리
 */
let phoneVerified = false;
/** true면 회원가입에서 휴대폰 인증 UI를 숨기고 인증 없이 제출 가능 */
const testMode = true;

document.addEventListener("DOMContentLoaded", () => {
    const loginForm = document.getElementById("loginForm");
    if (loginForm) {
        loginForm.addEventListener("submit", handleLogin);
        setupPasswordToggle("password", "passwordToggle");
    }

    const registerForm = document.getElementById("registerForm");
    if (registerForm) {
        registerForm.addEventListener("submit", handleRegister);
        setupPhoneVerification();
        setupPasswordToggle("password", "passwordToggle");
        setupPasswordToggle("confirmPassword", "confirmPasswordToggle");
    }
});

// 비밀번호 표시/숨기기 토글 설정
function setupPasswordToggle(inputId, buttonId) {
    const passwordInput = document.getElementById(inputId);
    const toggleButton = document.getElementById(buttonId);
    
    if (!passwordInput || !toggleButton) return;

    toggleButton.addEventListener("click", () => {
        const isPassword = passwordInput.type === "password";
        passwordInput.type = isPassword ? "text" : "password";
        
        if (isPassword) {
            toggleButton.classList.add("show-password");
            toggleButton.setAttribute("aria-label", "비밀번호 숨기기");
        } else {
            toggleButton.classList.remove("show-password");
            toggleButton.setAttribute("aria-label", "비밀번호 보기");
        }
    });
}

// 로그인 처리
async function handleLogin(event) {
    event.preventDefault();

    const usernameError = document.getElementById("usernameError");
    const passwordError = document.getElementById("passwordError");
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
            const unifiedCred =
                errorMsg.includes("아이디 또는 비밀번호") ||
                errorMsg.includes("올바르지 않습니다") ||
                (errorMsg.includes("아이디") && errorMsg.includes("비밀번호"));
            if (unifiedCred) {
                if (usernameError) {
                    usernameError.textContent = "ID,PW를 확인해주세요";
                    usernameError.style.display = "block";
                }
                return;
            }
            if (errorMsg.includes("비밀번호") || errorMsg.includes("password")) {
                if (passwordError) passwordError.style.display = "block";
            } else if (errorMsg.includes("아이디") || errorMsg.includes("ID")) {
                if (usernameError) {
                    usernameError.textContent = "ID,PW를 확인해주세요";
                    usernameError.style.display = "block";
                }
            } else {
                showNotification(errorMsg, "error");
            }
            return;
        }

        if (data.user && data.user.role === "admin") {
            sessionStorage.clear();
            localStorage.removeItem("token");
            localStorage.removeItem("user");
            showNotification("허용되지 않은 접근입니다.", "error");
            return;
        }

        sessionStorage.setItem("token", data.token);
        sessionStorage.setItem("user", JSON.stringify(data.user));
        localStorage.removeItem("token");
        localStorage.removeItem("user");

        window.location.href = "index.html";
    } catch (error) {
        console.error("로그인 실패:", error);
        showNotification("로그인에 실패했습니다: " + error.message, "error");
    }
}


// 회원가입 처리
async function handleRegister(event) {
    event.preventDefault();

    const formData = new FormData(event.target);
    const registerData = {
        username: formData.get("username"),
        name: formData.get("name"),
        nickname: formData.get("nickname"),
        phone: formData.get("phone"),
        password: formData.get("password"),
        confirmPassword: formData.get("confirmPassword"),
    };

    const submitBtn = document.getElementById("submitBtn");
    const resetButton = () => {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = "회원가입";
        }
    };

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = "처리 중...";
    }

    if (registerData.password !== registerData.confirmPassword) {
        showNotification("비밀번호가 일치하지 않습니다.", "error");
        resetButton();
        return;
    }

    if (!testMode && !window.isPhoneVerified()) {
        showNotification("휴대폰 인증을 완료해주세요.", "error");
        resetButton();
        return;
    }

    try {
        const res = await fetch(`${window.apiBase}/api/auth/register`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(registerData),
        });

        const data = await res.json();
        if (!res.ok || !data.success) {
            throw new Error(data.message || "회원가입 실패");
        }

        showNotification("회원가입이 완료되었습니다!");
        window.location.href = "login.html";
    } catch (error) {
        console.error("회원가입 실패:", error);
        const hint = error.message.includes("Failed to fetch")
            ? "\n서버 실행 여부와 네트워크 연결을 확인해주세요."
            : "";
        showNotification("회원가입에 실패했습니다: " + error.message + hint, "error");
    } finally {
        resetButton();
    }
}

/**
 * 휴대폰 인증 설정
 */
function setupPhoneVerification() {
    const verifyPhoneBtn = document.getElementById("verifyPhoneBtn");
    const confirmCodeBtn = document.getElementById("confirmCodeBtn");
    const verificationGroup = document.getElementById("verificationGroup");
    const submitBtn = document.getElementById("submitBtn");

    if (testMode) {
        if (submitBtn) submitBtn.disabled = false;
        try {
            const phoneInput = document.getElementById("phone");
            const phoneGroup = phoneInput ? phoneInput.closest(".form-group") : null;
            if (phoneGroup) {
                phoneGroup.style.display = "none";
            }
            if (phoneInput) {
                phoneInput.disabled = true;
                phoneInput.removeAttribute("required");
                if (!phoneInput.value) {
                    phoneInput.value = "000-0000-0000";
                }
            }
        } catch (e) {
            console.warn("phone group hide error:", e);
        }
        return;
    }

    if (verifyPhoneBtn) {
        verifyPhoneBtn.addEventListener("click", () => {
            const phone = document.getElementById("phone")?.value;
            if (!phone) {
                showNotification("휴대폰번호를 입력해주세요.", "error");
                return;
            }
            if (verificationGroup) verificationGroup.style.display = "block";
            verifyPhoneBtn.textContent = "재전송";
            showNotification("인증번호가 전송되었습니다.");
        });
    }

    if (confirmCodeBtn) {
        confirmCodeBtn.addEventListener("click", () => {
            const code = document.getElementById("verificationCode")?.value;
            if (!code) {
                showNotification("인증번호를 입력해주세요.", "error");
                return;
            }

            if (code === "123456" || code.length === 6) {
                phoneVerified = true;
                confirmCodeBtn.textContent = "인증완료";
                confirmCodeBtn.disabled = true;
                confirmCodeBtn.style.background = "#059669";
                if (submitBtn) submitBtn.disabled = false;
                showNotification("휴대폰 인증이 완료되었습니다.");
            } else {
                showNotification("잘못된 인증번호입니다.", "error");
            }
        });
    }
}

/**
 * 알림 표시
 * @param {string} message - 알림 메시지
 * @param {string} type - 알림 타입(호환용 인자, 내부에서 미사용)
 */
function showNotification(message, type = "info") {
    showModal("알림", message);
}

window.isPhoneVerified = () => phoneVerified;
