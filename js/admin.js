/**
 * @fileoverview admin.html — 관리자 콘솔
 *
 * @description 사용자/게시글/공지/FAQ/관리자계정/고객센터(문의) 관리용 UI 로직
 */

let currentUsersPage = 1;
let currentProjectsPage = 1;
let currentNoticesPage = 1;
let currentFaqsPage = 1;
let currentAdminAccountsPage = 1;
let currentSupportPage = 1;
let editingNoticeId = null;
let editingFAQId = null;
let deletingProjectId = null;
let editingAdminAccountId = null;
let editingSupportTicketId = null;
let isSavingNotice = false;
let isSavingFAQ = false;
let isDeletingProject = false;

/**
 * 사용자 상태 텍스트 맵
 */
const USER_STATUS_MAP = {
    active: "활동 중",
    suspended: "정지",
    dormant: "휴면",
    withdrawn: "탈퇴",
};

document.addEventListener("DOMContentLoaded", async () => {
    if (!isLoggedIn()) {
        window.location.href = "login.html";
        return;
    }

    try {
        const user = getCurrentUser();
        if (!user) {
            window.location.href = "login.html";
            return;
        }

        const userData = await apiGet("/api/auth/me");

        if (!userData.user || userData.user.role !== "admin") {
            showModal("알림", "관리자 권한이 필요합니다.", () => {
                window.location.href = "index.html";
            });
            return;
        }

        await Promise.all([
            loadUsers(),
            loadProjects(),
            loadNotices(),
            loadFAQs(),
            loadAdminAccounts(),
            loadSupportTickets(),
        ]);
    } catch (error) {
        showError("권한 확인 실패", error);
        window.location.href = "index.html";
    }
});

/**
 * 관리자 탭 전환
 * @param {string} tabName - 탭 이름 (users/projects/notices/faqs)
 * @param {Event} [event] - 클릭 이벤트 객체
 */
function switchAdminTab(tabName, event) {
    document.querySelectorAll(".admin-tab").forEach((tab) => {
        const isActive = tab.dataset.tab === tabName;
        if (isActive) {
            tab.classList.add("active");
        } else {
            tab.classList.remove("active");
        }
    });

    document.querySelectorAll(".admin-content").forEach((content) => content.classList.remove("active"));
    const contentId = `admin${tabName.charAt(0).toUpperCase() + tabName.slice(1)}`;
    const content = document.getElementById(contentId);
    if (content) {
        content.classList.add("active");
    }
}

async function loadUsers() {
    try {
        const search = document.getElementById("userSearch").value;
        const status = document.getElementById("userStatusFilter").value;
        const params = new URLSearchParams({ page: currentUsersPage, limit: 10 });
        if (status !== "all") params.append("status", status);
        if (search) params.append("search", search);

        const data = await apiGet(`/api/admin/users?${params}`);
        renderUsersTable(data.users);
        renderUsersPagination(data.total, data.page, data.limit);
    } catch (error) {
        showError("유저 목록 로드 실패", error);
    }
}

/**
 * 사용자 상태 텍스트 가져오기
 * @param {string} status - 상태 코드
 * @returns {string} 상태 텍스트
 */
function getUserStatusText(status) {
    return USER_STATUS_MAP[status] || status;
}

/**
 * 사용자 테이블 렌더링
 * @param {Array} users - 사용자 배열
 */
function renderUsersTable(users) {
    const tbody = document.getElementById("usersTableBody");
    if (!tbody) return;

    if (users.length === 0) {
        tbody.innerHTML = '<tr><td colspan="9" style="text-align: center; padding: 2rem;">유저가 없습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = users
        .map((user, index) => createUserRowHTML(user, index + 1))
        .join("");
}

/**
 * 사용자 행 HTML 생성
 * @param {Object} user - 사용자 데이터
 * @param {number} index - 현재 페이지 내 번호
 * @returns {string} HTML 문자열
 */
function createUserRowHTML(user, index) {
    const statusText = getUserStatusText(user.status);
    const statusClass = `status-${user.status}`;
    const joinDate = formatDate(user.createdAt);
    const lastActivity = user.lastActivityAt ? formatDate(user.lastActivityAt) : "-";
    const actionButton = createUserActionButton(user);

    return `
        <tr>
            <td>${index}</td>
            <td>${joinDate}</td>
            <td>${escapeHtml(user.name || "-")}</td>
            <td>${escapeHtml(user.nickname || "-")}</td>
            <td>${escapeHtml(user.phone || "-")}</td>
            <td>${escapeHtml(user.username)}</td>
            <td>${lastActivity}</td>
            <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            <td>
                <div class="admin-actions">
                    <button class="btn-primary btn-sm" onclick="viewUserDetail('${user._id}')">상세</button>
                    ${actionButton}
                </div>
            </td>
        </tr>
    `;
}

/**
 * 사용자 액션 버튼 HTML 생성
 * @param {Object} user - 사용자 데이터
 * @returns {string} 버튼 HTML
 */
function createUserActionButton(user) {
    if (user.status === "active") {
        return `<button class="btn-danger btn-sm" onclick="changeUserStatus('${user._id}', 'suspended')">정지</button>`;
    } else if (user.status === "suspended") {
        return `<button class="btn-primary btn-sm" onclick="changeUserStatus('${user._id}', 'active')">해제</button>`;
    }
    return "";
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

/**
 * 페이지네이션 렌더링 (기획서: 현재 페이지 회색+흰글씨, 페이지 번호 버튼)
 * @param {number} total - 전체 항목 수
 * @param {number} page - 현재 페이지
 * @param {number} limit - 페이지당 항목 수
 * @param {string} paginationId - 페이지네이션 컨테이너 ID
 * @param {Function} loadFunction - 페이지 로드 함수
 * @param {Object} pageVar - 페이지 변수 객체
 */
function renderPagination(total, page, limit, paginationId, loadFunction, pageVar) {
    var totalCount = Number(total) || 0;
    var limitNum = Number(limit) || 10;
    var currentPage = Number(page) || 1;
    const totalPages = Math.max(1, Math.ceil(totalCount / limitNum));
    const pagination = document.getElementById(paginationId);
    if (!pagination) return;

    const name = pageVar.name;
    const fn = loadFunction.name;

    var prevDisabled = currentPage <= 1;
    var nextDisabled = currentPage >= totalPages;
    var baseCls = "pagination-btn";
    var prevCls = baseCls + " pagination-arrow" + (prevDisabled ? " pagination-disabled" : "");
    var nextCls = baseCls + " pagination-arrow" + (nextDisabled ? " pagination-disabled" : "");

    var html = "<button type=\"button\" class=\"" + prevCls + "\" " + (prevDisabled ? "disabled" : "onclick=\"" + name + "=" + (currentPage - 1) + ";" + fn + "();\"") + ">&lt;</button> ";
    for (var p = 1; p <= totalPages; p++) {
        var isCurrent = p === currentPage;
        var cls = baseCls + (isCurrent ? " pagination-current" : "");
        html += "<button type=\"button\" class=\"" + cls + "\" onclick=\"" + name + "=" + p + ";" + fn + "();\">" + p + "</button> ";
    }
    html += "<button type=\"button\" class=\"" + nextCls + "\" " + (nextDisabled ? "disabled" : "onclick=\"" + name + "=" + (currentPage + 1) + ";" + fn + "();\"") + ">&gt;</button>";
    pagination.innerHTML = html.trim();
}

/**
 * 사용자 페이지네이션 렌더링
 * @param {number} total - 전체 사용자 수
 * @param {number} page - 현재 페이지
 * @param {number} limit - 페이지당 사용자 수
 */
function renderUsersPagination(total, page, limit) {
    renderPagination(total, page, limit, "usersPagination", loadUsers, { name: "currentUsersPage" });
}


/**
 * 사용자 상세 정보 모달 닫기
 */
function closeUserDetailModal() {
    const modal = document.getElementById("userDetailModal");
    if (modal) modal.classList.remove("active");
}

/**
 * 사용자 상세 정보 보기
 * @param {string} userId - 사용자 ID
 */
async function viewUserDetail(userId) {
    try {
        const data = await apiGet(`/api/admin/users/${userId}`);
        const user = data.user;
        const stats = data.user.stats || {};
        const statusText = getUserStatusText(user.status);

        const detailHtml = `
            <div style="line-height: 2;">
                <p><strong>이름:</strong> ${escapeHtml(user.name || "-")}</p>
                <p><strong>닉네임:</strong> ${escapeHtml(user.nickname || "-")}</p>
                <p><strong>아이디:</strong> ${escapeHtml(user.username)}</p>
                <p><strong>전화번호:</strong> ${escapeHtml(user.phone || "-")}</p>
                <p><strong>상태:</strong> ${statusText}</p>
                <p><strong>생성한 프로젝트:</strong> ${stats.createdProjects || 0}개</p>
                <p><strong>지원한 프로젝트:</strong> ${stats.appliedProjects || 0}개</p>
            </div>
        `;

        const body = document.getElementById("userDetailBody");
        const modal = document.getElementById("userDetailModal");
        if (body) body.innerHTML = detailHtml;
        if (modal) modal.classList.add("active");
    } catch (error) {
        showError("유저 정보 로드 실패", error);
    }
}

async function changeUserStatus(userId, newStatus) {
    const action = newStatus === "suspended" ? "정지" : "해제";
    showConfirmModal("확인", `이 유저를 ${action}하시겠습니까?`, async () => {
        try {
            await apiPut(`/api/admin/users/${userId}/status`, { status: newStatus });
            showModal("알림", `유저가 ${action}되었습니다.`, () => {
                loadUsers();
            });
        } catch (error) {
            showError("유저 상태 변경 실패", error);
        }
    });
}

async function loadProjects() {
    try {
        const search = document.getElementById("projectSearch").value;
        const status = document.getElementById("projectStatusFilter").value;
        const params = new URLSearchParams({ page: currentProjectsPage, limit: 20 });
        if (status !== "all") params.append("status", status);
        if (search) params.append("search", search);

        const data = await apiGet(`/api/admin/projects?${params}`);
        renderProjectsTable(data.projects);
        renderProjectsPagination(data.total, data.page, data.limit);
    } catch (error) {
        showError("프로젝트 목록 로드 실패", error);
    }
}

function renderProjectsTable(projects) {
    const tbody = document.getElementById("projectsTableBody");
    if (projects.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">프로젝트가 없습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = projects
        .map((project) => {
            const statusText = getStatusText(project.status);
            const createdDate = formatDate(project.createdAt);
            const creator = project.creator ? (project.creator.nickname || project.creator.username) : "알 수 없음";
            const isPublished = project.isPublished !== false;
            const publishText = isPublished ? "게재중" : "게재중지";
            const toggleLabel = isPublished ? "게재중지" : "게재";

            return `
                <tr>
                    <td>${createdDate}</td>
                    <td><a href="project-detail.html?id=${project._id}" style="color: #2563eb;">${project.title}</a></td>
                    <td>${creator}</td>
                    <td><span class="status-badge status-${project.status}">${statusText}</span></td>
                    <td>${publishText}</td>
                    <td>
                        <div class="admin-actions">
                            <button class="btn-outline btn-sm" onclick="toggleProjectPublish('${project._id}', ${isPublished ? "false" : "true"})">${toggleLabel}</button>
                            <button class="btn-danger btn-sm" onclick="openDeleteProjectModal('${project._id}')">삭제</button>
                        </div>
                    </td>
                </tr>
            `;
        })
        .join("");
}

/**
 * 프로젝트 페이지네이션 렌더링
 * @param {number} total - 전체 프로젝트 수
 * @param {number} page - 현재 페이지
 * @param {number} limit - 페이지당 프로젝트 수
 */
function renderProjectsPagination(total, page, limit) {
    renderPagination(total, page, limit, "projectsPagination", loadProjects, { name: "currentProjectsPage" });
}

function openDeleteProjectModal(projectId) {
    deletingProjectId = projectId;
    const targetInput = document.getElementById("deleteProjectTargetId");
    if (targetInput) targetInput.value = projectId;
    isDeletingProject = false;
    document.getElementById("deleteProjectModal").classList.add("active");
    document.getElementById("deleteMessage").value = "";
}

function closeDeleteProjectModal() {
    document.getElementById("deleteProjectModal").classList.remove("active");
    deletingProjectId = null;
    const targetInput = document.getElementById("deleteProjectTargetId");
    if (targetInput) targetInput.value = "";
    isDeletingProject = false;
    const modal = document.getElementById("deleteProjectModal");
    const deleteBtn = modal ? modal.querySelector('button[onclick="confirmDeleteProject()"]') : null;
    const cancelBtn = modal ? modal.querySelector('button[onclick="closeDeleteProjectModal()"]') : null;
    if (deleteBtn) deleteBtn.disabled = false;
    if (cancelBtn) cancelBtn.disabled = false;
}

async function confirmDeleteProject() {
    if (isDeletingProject) return;
    const targetInput = document.getElementById("deleteProjectTargetId");
    const targetId = targetInput ? targetInput.value : deletingProjectId;
    if (!targetId) return;

    isDeletingProject = true;

    const modal = document.getElementById("deleteProjectModal");
    const deleteBtn = modal ? modal.querySelector('button[onclick="confirmDeleteProject()"]') : null;
    const cancelBtn = modal ? modal.querySelector('button[onclick="closeDeleteProjectModal()"]') : null;
    if (deleteBtn) deleteBtn.disabled = true;
    if (cancelBtn) cancelBtn.disabled = true;

    try {
        await apiDelete(`/api/admin/projects/${targetId}`);
        showModal("알림", "프로젝트가 삭제되었습니다.", () => {
            closeDeleteProjectModal();
            loadProjects();
        });
    } catch (error) {
        showError("프로젝트 삭제 실패", error);
        if (deleteBtn) deleteBtn.disabled = false;
        if (cancelBtn) cancelBtn.disabled = false;
        isDeletingProject = false;
    }
}

async function toggleProjectPublish(projectId, nextPublished) {
    const actionText = nextPublished ? "게재" : "게재중지";
    showConfirmModal("확인", `해당 프로젝트를 ${actionText}하시겠습니까?`, async () => {
        try {
            await apiPut(`/api/admin/projects/${projectId}/publish`, { isPublished: nextPublished });
            showModal("알림", `프로젝트가 ${actionText}되었습니다.`, () => {
                loadProjects();
            });
        } catch (error) {
            showError("프로젝트 게시 상태 변경 실패", error);
        }
    });
}

async function loadNotices() {
    try {
        const params = new URLSearchParams({ page: currentNoticesPage, limit: 10 });
        const data = await apiGet(`/api/admin/notices?${params}`);
        renderNoticesTable(data.notices);
        renderPagination(data.total, data.page, data.limit, "noticesPagination", loadNotices, { name: "currentNoticesPage" });
    } catch (error) {
        showError("공지사항 로드 실패", error);
    }
}

function renderNoticesTable(notices) {
    const tbody = document.getElementById("noticesTableBody");
    if (notices.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">공지사항이 없습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = notices.map(notice => {
        const author = notice.author ? (notice.author.nickname || notice.author.username) : "알 수 없음";
        const createdDate = formatDate(notice.createdAt);

        return `
            <tr>
                <td>${notice.title}</td>
                <td>${author}</td>
                <td>${createdDate}</td>
                <td>${notice.isImportant ? "✓" : "-"}</td>
                <td>
                    <div class="admin-actions">
                        <button class="btn-primary btn-sm" onclick="editNotice('${notice._id}')">수정</button>
                        <button class="btn-danger btn-sm" onclick="deleteNotice('${notice._id}')">삭제</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function openNoticeModal(noticeId = null) {
    editingNoticeId = noticeId;
    document.getElementById("noticeModalTitle").textContent = noticeId ? "공지사항 수정" : "공지사항 작성";
    document.getElementById("noticeTitle").value = "";
    document.getElementById("noticeContent").value = "";
    document.getElementById("noticeImportant").checked = false;
    document.getElementById("noticeModal").classList.add("active");

    if (noticeId) {
        loadNoticeDetail(noticeId);
    }
}

function closeNoticeModal() {
    document.getElementById("noticeModal").classList.remove("active");
    editingNoticeId = null;
}

async function loadNoticeDetail(noticeId) {
    try {
        const data = await apiGet(`/api/admin/notices/${noticeId}`);
        const notice = data.notice;
        if (notice) {
            document.getElementById("noticeTitle").value = notice.title;
            document.getElementById("noticeContent").value = notice.content;
            document.getElementById("noticeImportant").checked = notice.isImportant || false;
        }
    } catch (error) {
        showError("공지사항 로드 실패", error);
    }
}

async function saveNotice() {
    if (isSavingNotice) return;
    const title = document.getElementById("noticeTitle").value;
    const content = document.getElementById("noticeContent").value;
    const isImportant = document.getElementById("noticeImportant").checked;

    if (!title || !content) {
        showModal("알림", "제목과 내용을 입력해주세요.");
        return;
    }

    try {
        isSavingNotice = true;
        const saveBtn = document.getElementById("noticeModal")?.querySelector('button[onclick="saveNotice()"]');
        if (saveBtn) saveBtn.disabled = true;

        if (editingNoticeId) {
            await apiPut(`/api/admin/notices/${editingNoticeId}`, { title, content, isImportant });
            showModal("알림", "공지사항이 수정되었습니다.", () => {
                closeNoticeModal();
                loadNotices();
            });
        } else {
            await apiPost("/api/admin/notices", { title, content, isImportant });
            showModal("알림", "공지사항이 작성되었습니다.", () => {
                closeNoticeModal();
                loadNotices();
            });
        }
    } catch (error) {
        showError("공지사항 저장 실패", error);
    } finally {
        const saveBtn = document.getElementById("noticeModal")?.querySelector('button[onclick="saveNotice()"]');
        if (saveBtn) saveBtn.disabled = false;
        isSavingNotice = false;
    }
}

function editNotice(noticeId) {
    openNoticeModal(noticeId);
}

async function deleteNotice(noticeId) {
    showConfirmModal("확인", "이 공지사항을 삭제하시겠습니까?", async () => {
        try {
            await apiDelete(`/api/admin/notices/${noticeId}`);
            showModal("알림", "공지사항이 삭제되었습니다.", () => {
                loadNotices();
            });
        } catch (error) {
            showError("공지사항 삭제 실패", error);
        }
    });
}

async function loadFAQs() {
    try {
        const params = new URLSearchParams({ page: currentFaqsPage, limit: 10 });
        const data = await apiGet("/api/admin/faqs?" + params);
        renderFAQsTable(data.faqs);
        renderPagination(data.total, data.page, data.limit, "faqsPagination", loadFAQs, { name: "currentFaqsPage" });
    } catch (error) {
        showError("FAQ 로드 실패", error);
    }
}

/**
 * 관리자 계정 목록 로드
 */
async function loadAdminAccounts() {
    try {
        const search = document.getElementById("adminSearch").value;
        const params = new URLSearchParams({ page: currentAdminAccountsPage, limit: 10 });
        if (search) params.append("search", search);

        const data = await apiGet(`/api/admin/admin-accounts?${params}`);
        renderAdminAccountsTable(data.admins, data.page, data.limit, data.total);
    } catch (error) {
        showError("관리자 계정 로드 실패", error);
    }
}

/**
 * 관리자 계정 테이블 렌더링
 * @param {Array} admins
 * @param {number} page
 * @param {number} limit
 * @param {number} total
 */
function renderAdminAccountsTable(admins, page, limit, total) {
    const tbody = document.getElementById("adminAccountsTableBody");
    if (!tbody) return;

    if (!admins || admins.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; padding: 2rem;">관리자 계정이 없습니다.</td></tr>';
        renderPagination(total || 0, page || 1, limit || 10, "adminAccountsPagination", loadAdminAccounts, { name: "currentAdminAccountsPage" });
        return;
    }

    const startIndex = (page - 1) * limit;
    tbody.innerHTML = admins
        .map((admin, idx) => {
            const index = startIndex + idx + 1;
            const createdAt = admin.createdAt ? formatDate(admin.createdAt) : "-";
            const lastActivity = admin.lastActivityAt ? formatDate(admin.lastActivityAt) : "-";
            const permissionText = admin.adminPermission === "read" ? "조회가능" : "전체권한";

            return `
                <tr>
                    <td>${index}</td>
                    <td>${escapeHtml(admin.name || "-")}</td>
                    <td>${escapeHtml(admin.username)}</td>
                    <td>${escapeHtml(admin.email || "-")}</td>
                    <td>${permissionText}</td>
                    <td>${createdAt}</td>
                    <td>${lastActivity}</td>
                    <td>
                        <div class="admin-actions">
                            <button class="btn-primary btn-sm" onclick="editAdminAccount('${admin._id}')">상세</button>
                            <button class="btn-danger btn-sm" onclick="deleteAdminAccount('${admin._id}')">삭제</button>
                        </div>
                    </td>
                </tr>
            `;
        })
        .join("");

    renderPagination(total, page, limit, "adminAccountsPagination", loadAdminAccounts, { name: "currentAdminAccountsPage" });
}

function openAdminAccountModal(adminId = null) {
    editingAdminAccountId = adminId;
    const titleEl = document.getElementById("adminAccountModalTitle");
    const nameEl = document.getElementById("adminAccountName");
    const usernameEl = document.getElementById("adminAccountUsername");
    const emailEl = document.getElementById("adminAccountEmail");
    const passwordEl = document.getElementById("adminAccountPassword");
    const permissionEl = document.getElementById("adminAccountPermission");
    const pwHintEl = document.getElementById("adminAccountPasswordHint");

    if (titleEl) titleEl.textContent = adminId ? "관리자 계정 수정" : "관리자 계정 등록";
    if (nameEl) nameEl.value = "";
    if (usernameEl) {
        usernameEl.value = "";
        usernameEl.disabled = !!adminId;
    }
    if (emailEl) emailEl.value = "";
    if (passwordEl) passwordEl.value = "";
    if (permissionEl) permissionEl.value = "full";
    if (pwHintEl) pwHintEl.textContent = adminId ? "(비밀번호 변경 시에만 입력)" : "(신규 생성 시 필수)";

    document.getElementById("adminAccountModal").classList.add("active");

    if (adminId) {
        loadAdminAccountDetail(adminId);
    }
}

function closeAdminAccountModal() {
    const modal = document.getElementById("adminAccountModal");
    if (modal) modal.classList.remove("active");
    editingAdminAccountId = null;
}

async function loadAdminAccountDetail(adminId) {
    try {
        const data = await apiGet(`/api/admin/admin-accounts/${adminId}`);
        const admin = data.admin;
        if (!admin) return;

        document.getElementById("adminAccountName").value = admin.name || "";
        document.getElementById("adminAccountUsername").value = admin.username || "";
        document.getElementById("adminAccountEmail").value = admin.email || "";
        document.getElementById("adminAccountPermission").value = admin.adminPermission === "read" ? "read" : "full";
    } catch (error) {
        showError("관리자 계정 정보 로드 실패", error);
    }
}

async function saveAdminAccount() {
    const name = document.getElementById("adminAccountName").value;
    const username = document.getElementById("adminAccountUsername").value;
    const email = document.getElementById("adminAccountEmail").value;
    const password = document.getElementById("adminAccountPassword").value;
    const permission = document.getElementById("adminAccountPermission").value;

    if (!editingAdminAccountId && (!username || !password)) {
        showModal("알림", "아이디와 비밀번호를 입력해주세요.");
        return;
    }

    try {
        if (editingAdminAccountId) {
            await apiPut(`/api/admin/admin-accounts/${editingAdminAccountId}`, {
                name,
                email,
                permission,
            });
            showModal("알림", "관리자 계정이 수정되었습니다.", () => {
                closeAdminAccountModal();
                loadAdminAccounts();
            });
        } else {
            await apiPost("/api/admin/admin-accounts", {
                name,
                username,
                email,
                password,
                permission,
            });
            showModal("알림", "관리자 계정이 생성되었습니다.", () => {
                closeAdminAccountModal();
                loadAdminAccounts();
            });
        }
    } catch (error) {
        showError("관리자 계정 저장 실패", error);
    }
}

function editAdminAccount(adminId) {
    openAdminAccountModal(adminId);
}

async function deleteAdminAccount(adminId) {
    showConfirmModal("확인", "해당 관리자 계정을 삭제하시겠습니까?", async () => {
        try {
            await apiDelete(`/api/admin/admin-accounts/${adminId}`);
            showModal("알림", "관리자 계정이 삭제되었습니다.", () => {
                loadAdminAccounts();
            });
        } catch (error) {
            showError("관리자 계정 삭제 실패", error);
        }
    });
}

/**
 * 고객센터 문의 목록 로드
 */
async function loadSupportTickets() {
    try {
        const status = document.getElementById("supportStatusFilter").value;
        const params = new URLSearchParams({ page: currentSupportPage, limit: 20 });
        if (status && status !== "all") params.append("status", status);

        const data = await apiGet(`/api/admin/support?${params}`);
        renderSupportTicketsTable(data.tickets, data.page, data.limit, data.total);
    } catch (error) {
        showError("고객센터 문의 로드 실패", error);
    }
}

function renderSupportTicketsTable(tickets, page, limit, total) {
    const tbody = document.getElementById("supportTableBody");
    if (!tbody) return;

    if (!tickets || tickets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">문의글이 없습니다.</td></tr>';
        document.getElementById("supportPagination").innerHTML = "";
        return;
    }

    const startIndex = (page - 1) * limit;
    tbody.innerHTML = tickets
        .map((ticket, idx) => {
            const index = startIndex + idx + 1;
            const createdAt = ticket.createdAt ? formatDate(ticket.createdAt) : "-";
            const statusText = ticket.status === "answered" ? "답변완료" : "미확인";
            const author =
                ticket.author && (ticket.author.nickname || ticket.author.username || ticket.author.name)
                    ? (ticket.author.nickname || ticket.author.username || ticket.author.name)
                    : "알 수 없음";

            return `
                <tr>
                    <td>${index}</td>
                    <td>${escapeHtml(author)}</td>
                    <td>${escapeHtml(ticket.title)}</td>
                    <td>${createdAt}</td>
                    <td>${statusText}</td>
                    <td>
                        <button class="btn-primary btn-sm" onclick="openSupportDetail('${ticket._id}')">상세</button>
                    </td>
                </tr>
            `;
        })
        .join("");

    renderPagination(total, page, limit, "supportPagination", loadSupportTickets, { name: "currentSupportPage" });
}

async function openSupportDetail(ticketId) {
    editingSupportTicketId = ticketId;
    try {
        const data = await apiGet(`/api/admin/support/${ticketId}`);
        const ticket = data.ticket;
        if (!ticket) return;

        const author =
            ticket.author && (ticket.author.nickname || ticket.author.username || ticket.author.name)
                ? (ticket.author.nickname || ticket.author.username || ticket.author.name)
                : "알 수 없음";
        const createdAt = ticket.createdAt ? formatDate(ticket.createdAt) : "-";
        const answeredAt = ticket.answeredAt ? formatDate(ticket.answeredAt) : "-";
        const statusText = ticket.status === "answered" ? "답변완료" : "미확인";

        const detailHtml = `
            <div style="line-height: 1.8;">
                <p><strong>작성자:</strong> ${escapeHtml(author)}</p>
                <p><strong>작성일:</strong> ${createdAt}</p>
                <p><strong>상태:</strong> ${statusText}</p>
                ${ticket.answeredAt ? `<p><strong>답변일:</strong> ${answeredAt}</p>` : ""}
                <p><strong>제목:</strong> ${escapeHtml(ticket.title)}</p>
                <p><strong>본문:</strong><br>${escapeHtml(ticket.content)}</p>
            </div>
        `;

        const bodyEl = document.getElementById("supportDetailBody");
        const answerEl = document.getElementById("supportAnswer");
        if (bodyEl) bodyEl.innerHTML = detailHtml;
        if (answerEl) answerEl.value = ticket.answer || "";

        document.getElementById("supportDetailModal").classList.add("active");
    } catch (error) {
        showError("문의 상세 로드 실패", error);
    }
}

function closeSupportDetailModal() {
    const modal = document.getElementById("supportDetailModal");
    if (modal) modal.classList.remove("active");
    editingSupportTicketId = null;
}

async function saveSupportAnswer() {
    if (!editingSupportTicketId) {
        closeSupportDetailModal();
        return;
    }

    const answer = document.getElementById("supportAnswer").value;

    try {
        await apiPost(`/api/admin/support/${editingSupportTicketId}/answer`, { answer });
        showModal("알림", "답변이 저장되었습니다.", () => {
            closeSupportDetailModal();
            loadSupportTickets();
        });
    } catch (error) {
        showError("답변 저장 실패", error);
    }
}

function renderFAQsTable(faqs) {
    const tbody = document.getElementById("faqsTableBody");
    if (faqs.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">FAQ가 없습니다.</td></tr>';
        return;
    }

    tbody.innerHTML = faqs.map((faq, index) => {
        const author = faq.author ? (faq.author.nickname || faq.author.username) : "알 수 없음";
        const createdDate = formatDate(faq.createdAt);

        return `
            <tr>
                <td>${index + 1}</td>
                <td>${faq.question}</td>
                <td style="max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${faq.answer}</td>
                <td>${createdDate}</td>
                <td>
                    <div class="admin-actions">
                        <button class="btn-primary btn-sm" onclick="editFAQ('${faq._id}')">수정</button>
                        <button class="btn-danger btn-sm" onclick="deleteFAQ('${faq._id}')">삭제</button>
                    </div>
                </td>
            </tr>
        `;
    }).join("");
}

function openFAQModal(faqId = null) {
    editingFAQId = faqId;
    document.getElementById("faqModalTitle").textContent = faqId ? "FAQ 수정" : "FAQ 작성";
    document.getElementById("faqQuestion").value = "";
    document.getElementById("faqAnswer").value = "";
    document.getElementById("faqOrder").value = "1";
    document.getElementById("faqModal").classList.add("active");

    if (faqId) {
        loadFAQDetail(faqId);
    }
}

function closeFAQModal() {
    document.getElementById("faqModal").classList.remove("active");
    editingFAQId = null;
}

async function loadFAQDetail(faqId) {
    try {
        const data = await apiGet("/api/admin/faqs/" + faqId);
        const faq = data.faq;
        if (faq) {
            document.getElementById("faqQuestion").value = faq.question;
            document.getElementById("faqAnswer").value = faq.answer;
            const safeOrder = Math.max(1, parseInt(faq.order, 10) || 1);
            document.getElementById("faqOrder").value = String(safeOrder);
        }
    } catch (error) {
        showError("FAQ 로드 실패", error);
    }
}

async function saveFAQ() {
    if (isSavingFAQ) return;
    const question = document.getElementById("faqQuestion").value;
    const answer = document.getElementById("faqAnswer").value;
    const orderRaw = parseInt(document.getElementById("faqOrder").value, 10);
    const order = Number.isNaN(orderRaw) ? 1 : Math.max(1, orderRaw);

    if (!question || !answer) {
        showModal("알림", "질문과 답변을 입력해주세요.");
        return;
    }

    try {
        isSavingFAQ = true;
        const saveBtn = document.getElementById("faqModal")?.querySelector('button[onclick="saveFAQ()"]');
        if (saveBtn) saveBtn.disabled = true;

        if (editingFAQId) {
            await apiPut(`/api/admin/faqs/${editingFAQId}`, { question, answer, order });
            showModal("알림", "FAQ가 수정되었습니다.", () => {
                closeFAQModal();
                loadFAQs();
            });
        } else {
            await apiPost("/api/admin/faqs", { question, answer, order });
            showModal("알림", "FAQ가 작성되었습니다.", () => {
                closeFAQModal();
                loadFAQs();
            });
        }
    } catch (error) {
        showError("FAQ 저장 실패", error);
    } finally {
        const saveBtn = document.getElementById("faqModal")?.querySelector('button[onclick="saveFAQ()"]');
        if (saveBtn) saveBtn.disabled = false;
        isSavingFAQ = false;
    }
}

function editFAQ(faqId) {
    openFAQModal(faqId);
}

async function deleteFAQ(faqId) {
    showConfirmModal("확인", "이 FAQ를 삭제하시겠습니까?", async () => {
        try {
            await apiDelete(`/api/admin/faqs/${faqId}`);
            showModal("알림", "FAQ가 삭제되었습니다.", () => {
                loadFAQs();
            });
        } catch (error) {
            showError("FAQ 삭제 실패", error);
        }
    });
}

