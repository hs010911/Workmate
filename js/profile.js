/**
 * @fileoverview profile.html — 프로필·차단 목록 등
 */

function showTab(tabName, buttonElement) {
    const tabContents = document.querySelectorAll(".tab-content");
    tabContents.forEach((content) => content.classList.remove("active"));

    const tabButtons = document.querySelectorAll(".tab-button");
    tabButtons.forEach((button) => button.classList.remove("active"));

    const targetTab = document.getElementById(tabName);
    if (targetTab) targetTab.classList.add("active");
    if (buttonElement) buttonElement.classList.add("active");
}

function updateProfile(event) {
    event.preventDefault();
    const nickname = document.getElementById("nickname")?.value;
    const email = document.getElementById("email")?.value;
    const phone = document.getElementById("phone")?.value;

    showModal("알림", "프로필 정보가 수정되었습니다.");
}

function changePassword(event) {
    event.preventDefault();
    const currentPassword = document.getElementById("currentPassword")?.value;
    const newPassword = document.getElementById("newPassword")?.value;
    const confirmPassword = document.getElementById("confirmPassword")?.value;
    const errorDiv = document.getElementById("passwordMatchError");
    const changePasswordBtn = document.getElementById("changePasswordBtn");

    if (newPassword !== confirmPassword) {
        if (errorDiv) errorDiv.style.display = "block";
        return;
    }

    if (!currentPassword) {
        if (errorDiv) errorDiv.style.display = "block";
        return;
    }

    // 실제 서버에 비밀번호 변경 요청
    (async () => {
        try {
            await apiPut("/api/auth/password", { currentPassword, newPassword });
            showModal("알림", "비밀번호가 변경되었습니다.", () => {
                event.target.reset();
                if (errorDiv) errorDiv.style.display = "none";
                if (changePasswordBtn) changePasswordBtn.disabled = true;
            });
        } catch (error) {
            showError("비밀번호 변경 실패", error);
        }
    })();
}

document.addEventListener("DOMContentLoaded", function () {
    const newPasswordInput = document.getElementById("newPassword");
    const confirmPasswordInput = document.getElementById("confirmPassword");
    const changePasswordBtn = document.getElementById("changePasswordBtn");
    const passwordMatchError = document.getElementById("passwordMatchError");

    function checkPasswordMatch() {
        if (!newPasswordInput || !confirmPasswordInput || !changePasswordBtn) return;

        const newPwd = newPasswordInput.value;
        const confirmPwd = confirmPasswordInput.value;

        if (newPwd && confirmPwd) {
            if (newPwd === confirmPwd) {
                changePasswordBtn.disabled = false;
                if (passwordMatchError) passwordMatchError.style.display = "none";
            } else {
                changePasswordBtn.disabled = true;
                if (passwordMatchError) passwordMatchError.style.display = "block";
            }
        } else {
            changePasswordBtn.disabled = true;
            if (passwordMatchError) passwordMatchError.style.display = "none";
        }
    }

    if (newPasswordInput) {
        newPasswordInput.addEventListener("input", checkPasswordMatch);
    }
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener("input", checkPasswordMatch);
    }
});

/**
 * 사용자 차단 해제
 * @param {string} userId - 사용자 ID
 * @param {HTMLElement} buttonElement - 버튼 요소
 */
async function unblockUser(userId, buttonElement) {
    if (!userId) return;
    showConfirmModal("확인", "이 사용자의 차단을 해제하시겠습니까?", async () => {
        try {
            await apiDelete(`/api/users/${userId}/block`);
            showModal("알림", "차단이 해제되었습니다.", () => {
                if (buttonElement) {
                    const blockedItem = buttonElement.closest(".blocked-user-item");
                    if (blockedItem) blockedItem.remove();
                }
                loadBlockedUsers();
            });
        } catch (error) {
            showError("차단 해제에 실패했습니다", error);
        }
    });
}

/**
 * 계정 삭제
 */
async function deleteAccount() {
    showPromptModal("회원 탈퇴", '정말로 탈퇴하시겠습니까? 확인을 위해 "탈퇴"를 입력해주세요.', "", async (confirmation) => {
        if (confirmation === "탈퇴") {
            try {
                await apiDelete("/api/auth/account");

                localStorage.removeItem("user");
                localStorage.removeItem("token");
                sessionStorage.clear();

                showModal("알림", "계정이 삭제되었습니다. 이용해 주셔서 감사합니다.", () => {
                    window.location.href = "login.html";
                });
            } catch (error) {
                showError("회원 탈퇴 실패", error);
            }
        } else {
            showModal("알림", "입력이 올바르지 않습니다.");
        }
    });
}

document.addEventListener("DOMContentLoaded", async function () {
    const user = getCurrentUser();
    if (!user || !user.id) {
        window.location.href = "login.html";
        return;
    }

    const profileName = document.getElementById("profileName");
    const profileMeta = document.getElementById("profileMeta");
    const profileEmail = document.getElementById("profileEmail");
    const profileAvatar = document.getElementById("profileAvatar");
    const nicknameInput = document.getElementById("nickname");
    const emailInput = document.getElementById("email");
    const phoneInput = document.getElementById("phone");

    if (user.nickname) {
        if (profileName) profileName.textContent = user.nickname;
        if (nicknameInput) nicknameInput.value = user.nickname;
        if (profileAvatar) {
            profileAvatar.textContent = user.nickname.charAt(0).toUpperCase();
        }
    }

    if (user.email) {
        if (profileEmail) profileEmail.textContent = user.email;
        if (emailInput) emailInput.value = user.email;
    }

    // 테스트 모드에서는 휴대폰을 임의 입력하지 않는 것을 목표로 함.
    // 서버에 값이 없거나 더미 값이면 "-"로 표시합니다.
    if (phoneInput) {
        const rawPhone = user.phone || "";
        const trimmedPhone = String(rawPhone).trim();
        const DUMMY_PHONES = new Set([
            "000-0000-0000",
            "010-1234-5678", // 입력 폼 placeholder로 자주 쓰이는 더미
            "010-0000-0000",
            "0000000000",
            "01000000000",
        ]);

        if (!trimmedPhone || DUMMY_PHONES.has(trimmedPhone)) {
            phoneInput.value = "-";
        } else {
            phoneInput.value = trimmedPhone;
        }
    }

    if (user.createdAt) {
        const joinDate = new Date(user.createdAt);
        const joinDateStr = `${joinDate.getFullYear()}년 ${joinDate.getMonth() + 1}월`;
        if (profileMeta) {
            profileMeta.textContent = `가입일: ${joinDateStr}`;
        }
    } else if (profileMeta) {
        profileMeta.textContent = "";
    }

    try {
        const data = await apiGet("/api/dashboard/stats");
        if (data.success) {
            const registeredProjectsEl = document.getElementById("registeredProjects");
            const participatedProjectsEl = document.getElementById("participatedProjects");
            const completedProjectsEl = document.getElementById("completedProjects");

            if (registeredProjectsEl) registeredProjectsEl.textContent = data.stats.myPosts || 0;
            if (participatedProjectsEl) participatedProjectsEl.textContent = data.stats.activeProjects || 0;
            if (completedProjectsEl) completedProjectsEl.textContent = data.stats.completedProjects || 0;
        }
    } catch (error) {
        // 통계 로드 실패 시 무시
    }

    await loadBlockedUsers();
});

/**
 * 차단한 사용자 목록 로드
 */
async function loadBlockedUsers() {
    const blockedUsersList = document.getElementById("blockedUsersList");
    if (!blockedUsersList) return;

    try {
        const data = await apiGet("/api/users/blocked");
        const blocked = data.blockedUsers || [];
        if (blocked.length === 0) {
            showEmptyBlockedUsers();
        } else {
            renderBlockedUsers(blocked);
        }
    } catch (error) {
        showEmptyBlockedUsers();
    }
}

/**
 * 차단한 사용자 목록 렌더링
 * @param {Array} blockedUsers - 차단한 사용자 배열
 */
function renderBlockedUsers(blockedUsers) {
    const blockedUsersList = document.getElementById("blockedUsersList");
    if (!blockedUsersList) return;

    blockedUsersList.innerHTML = blockedUsers
        .map(
            (user) => `
        <div class="blocked-user-item">
            <div class="user-info">
                <div class="user-avatar">${user.nickname ? user.nickname.charAt(0).toUpperCase() : "-"}</div>
                <div>
                    <div class="user-name">${escapeHtml(user.nickname || "사용자")}</div>
                    <div class="user-meta">차단일: ${formatDate(user.blockedAt)}</div>
                </div>
            </div>
            <button class="btn-primary btn-sm" onclick="unblockUser('${user._id}', this)">차단 해제</button>
        </div>
    `
        )
        .join("");
}

/**
 * 빈 차단 사용자 상태 표시
 */
function showEmptyBlockedUsers() {
    const blockedUsersList = document.getElementById("blockedUsersList");
    if (!blockedUsersList) return;

    const emptyState = blockedUsersList.querySelector(".empty-state");
    if (emptyState) {
        emptyState.style.display = "block";
    } else {
        blockedUsersList.innerHTML = `
            <div class="empty-state" style="display: block; padding: 2rem; text-align: center; color: #6b7280;">
                <p>차단한 사용자가 없습니다.</p>
            </div>
        `;
    }
}

/**
 * HTML 이스케이프
 * @param {string} text - 이스케이프할 텍스트
 * @returns {string} 이스케이프된 텍스트
 */
function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}