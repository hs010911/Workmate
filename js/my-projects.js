/**
 * @fileoverview my-projects.html — 생성·참여 프로젝트 탭
 */

let createdProjects = [];
let participatedProjects = [];

document.addEventListener("DOMContentLoaded", () => {
    if (!isLoggedIn()) {
        showModal("알림", "로그인이 필요합니다.", () => {
            window.location.href = "login.html";
        });
        return;
    }

    loadMyProjects();
});

// 내 프로젝트 목록 로드
async function loadMyProjects() {
    showLoadingState("created", true);
    showLoadingState("participated", true);

    try {
        const data = await apiGet("/api/my-projects");

        let created = [];
        let participated = [];

        if (data.projects) {
            if (Array.isArray(data.projects.created)) {
                created = data.projects.created;
            } else if (Array.isArray(data.projects)) {
                created = data.projects;
            }

            if (Array.isArray(data.projects.participated)) {
                participated = data.projects.participated;
            }
        }

        createdProjects = created.map((project) => normalizeProject(project, "owner"));
        participatedProjects = participated.map((project) =>
            normalizeProject(project, "participant", project.applicationStatus, project.appliedAt)
        );

        showLoadingState("created", false);
        showLoadingState("participated", false);
        renderProjects();
    } catch (error) {
        console.error("프로젝트 로드 실패:", error);
        showLoadingState("created", false);
        showLoadingState("participated", false);
        showErrorState("created", error.message || "프로젝트를 불러오지 못했습니다");
        showErrorState("participated", error.message || "프로젝트를 불러오지 못했습니다");
    }
}

// 프로젝트 데이터 정규화
function normalizeProject(project, role, applicationStatus = null, appliedAt = null) {
    const participants = typeof project.participants === "number" ? project.participants : 1;

    return {
        id: project._id || project.id,
        title: project.title || "제목 없음",
        description: project.description || "-",
        status: project.status || "recruiting",
        category: formatCategory(project.category),
        participants,
        maxMembers: project.maxParticipants || 0,
        deadline: project.recruitmentDeadline || project.deadline || null,
        role,
        applicationStatus,
        appliedAt,
        updatedAt: project.updatedAt || project.createdAt || null,
    };
}

// 프로젝트 목록 렌더링
function renderProjects() {
    const searchTerm = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
    const statusFilter = document.getElementById("statusFilter")?.value || "all";

    renderSection(
        createdProjects,
        "myCreatedProjects",
        "createdEmptyState",
        (searchTerm || statusFilter !== "all") ? "등록한 프로젝트가 없습니다" : null
    );
    renderSection(
        participatedProjects,
        "myParticipatedProjects",
        "participatedEmptyState",
        (searchTerm || statusFilter !== "all") ? "지원한 프로젝트가 없습니다" : null
    );
}

// 섹션 렌더링
function renderSection(list, gridId, emptyId, emptyTitle) {
    const grid = document.getElementById(gridId);
    const emptyState = document.getElementById(emptyId);
    const searchTerm = document.getElementById("searchInput")?.value.trim().toLowerCase() || "";
    const statusFilter = document.getElementById("statusFilter")?.value || "all";

    if (!grid || !emptyState) return;

    const filtered = list.filter((project) => {
        const matchesSearch = !searchTerm || project.title.toLowerCase().includes(searchTerm);
        const matchesStatus = statusFilter === "all" || project.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    if (filtered.length === 0) {
        grid.style.display = "none";
        emptyState.style.display = "block";

        const h3 = emptyState.querySelector("h3");
        const p = emptyState.querySelector("p");

        if (h3 && p) {
            if (emptyTitle) {
                h3.textContent = emptyTitle;
                p.textContent = searchTerm
                    ? "다른 검색어를 시도해보세요."
                    : statusFilter !== "all"
                        ? "다른 상태를 선택해보세요."
                        : emptyState.dataset.defaultMessage || "";
            } else {
                h3.textContent = gridId === "myCreatedProjects" ? "등록한 프로젝트가 없습니다" : "지원한 프로젝트가 없습니다";
                p.textContent = emptyState.dataset.defaultMessage || "";
            }
        }
        return;
    }

    grid.style.display = "grid";
    emptyState.style.display = "none";
    grid.innerHTML = filtered.map(createProjectCard).join("");
}

/**
 * 프로젝트 카드 HTML 생성
 * @param {Object} project - 프로젝트 데이터
 * @returns {string} HTML 문자열
 */
function createProjectCard(project) {
    const statusText = getStatusText(project.status);
    const roleText = project.role === "owner" ? "작성자" : "참여자";
    const roleClass = project.role === "owner" ? "role-leader" : "role-member";
    const applicationInfo = project.role === "participant"
        ? `<div class="meta-item">
            <span class="icon">📨</span>
            <span>${getApplicationStatusText(project.applicationStatus)} · ${formatDateTime(project.appliedAt)}</span>
         </div>`
        : "";

    return `
        <div class="project-card">
            <div class="project-header">
                <div class="project-badges">
                    <span class="status-badge status-${project.status}">${statusText}</span>
                    <span class="role-badge ${roleClass}">${roleText}</span>
                </div>
            </div>
            <div class="project-content">
                <h3 class="project-title">${escapeHtml(project.title)}</h3>
                <p class="project-description">${escapeHtml(project.description)}</p>
                
                <div class="project-meta">
                    <div class="meta-item">
                        <span class="icon">📁</span>
                        <span>${escapeHtml(project.category)}</span>
                    </div>
                    <div class="meta-item">
                        <span class="icon">👥</span>
                        <span>${project.participants}/${project.maxMembers || "-"}명</span>
                    </div>
                </div>
                
                <div class="project-meta">
                    <div class="meta-item">
                        <span class="icon">⏰</span>
                        <span>마감: ${formatDate(project.deadline)}</span>
                    </div>
                    ${applicationInfo}
                </div>
                
                <div class="project-actions">
                    <a href="project-detail.html?id=${project.id}" class="btn-primary">자세히 보기</a>
                    ${createActionButtons(project)}
                </div>
            </div>
        </div>
    `;
}

/**
 * 액션 버튼 HTML 생성
 * @param {Object} project - 프로젝트 데이터
 * @returns {string} 버튼 HTML
 */
function createActionButtons(project) {
    if (project.role === "owner") {
        return `<a href="project-detail.html?id=${project.id}" class="btn-secondary">지원자 관리</a>`;
    } else if (project.role === "participant" && (project.applicationStatus === "pending" || !project.applicationStatus)) {
        return `<button onclick="cancelApplication('${project.id}')" class="btn-secondary">지원 취소</button>`;
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
 * 필터링
 */
function filterProjects() {
    renderProjects();
}

/**
 * 로딩 상태 표시
 * @param {string} section - 섹션 타입 (created/participated)
 * @param {boolean} isLoading - 로딩 여부
 */
function showLoadingState(section, isLoading) {
    const gridId = section === "created" ? "myCreatedProjects" : "myParticipatedProjects";
    const grid = document.getElementById(gridId);
    const emptyState = document.getElementById(section === "created" ? "createdEmptyState" : "participatedEmptyState");

    if (!grid) return;

    if (isLoading) {
        grid.style.display = "grid";
        if (emptyState) emptyState.style.display = "none";
        grid.innerHTML = '<div class="loading-state" style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #6b7280;">프로젝트를 불러오는 중...</div>';
    }
}

/**
 * 에러 상태 표시
 * @param {string} section - 섹션 타입 (created/participated)
 * @param {string} message - 에러 메시지
 */
function showErrorState(section, message) {
    const gridId = section === "created" ? "myCreatedProjects" : "myParticipatedProjects";
    const grid = document.getElementById(gridId);
    const emptyState = document.getElementById(section === "created" ? "createdEmptyState" : "participatedEmptyState");

    if (!grid || !emptyState) return;

    grid.style.display = "none";
    emptyState.style.display = "block";

    const h3 = emptyState.querySelector("h3");
    const p = emptyState.querySelector("p");

    if (h3) h3.textContent = "프로젝트를 불러오지 못했습니다";
    if (p) p.textContent = message;
}

/**
 * 날짜/시간 포맷팅
 * @param {string|Date} value - 날짜 값
 * @returns {string} 포맷된 날짜/시간 문자열
 */
function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return `${date.toLocaleDateString("ko-KR")} ${date.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`;
}

/**
 * 지원 취소
 * @param {string} projectId - 프로젝트 ID
 */
async function cancelApplication(projectId) {
    showConfirmModal("확인", "정말로 지원을 취소하시겠습니까?", async () => {
        try {
            await apiDelete(`/api/projects/${projectId}/apply`);
            showModal("알림", "지원이 취소되었습니다!", () => {
                loadMyProjects();
            });
        } catch (error) {
            showError("지원 취소에 실패했습니다", error);
        }
    });
}
