/**
 * @fileoverview projects.html — 프로젝트 검색·필터·카드 목록
 */

let currentProjects = [];
let filteredProjects = [];
let currentUser = null;
let currentUserId = null;

document.addEventListener("DOMContentLoaded", () => {
    setupProjectsPage();
    currentUser = typeof getCurrentUser === "function" ? getCurrentUser() : null;
    currentUserId = currentUser?.id || null;
    loadProjects();
});

// 프로젝트 페이지 초기 설정
function setupProjectsPage() {
    const searchBtn = document.getElementById("searchBtn");
    const resetBtn = document.getElementById("resetBtn");
    const sortBy = document.getElementById("sortBy");
    const searchTitle = document.getElementById("searchTitle");
    const searchRecruiter = document.getElementById("searchRecruiter");

    if (searchBtn) searchBtn.addEventListener("click", filterProjects);
    if (resetBtn) resetBtn.addEventListener("click", resetFilters);
    if (sortBy) sortBy.addEventListener("change", sortProjects);

    const handleEnterKey = (e) => {
        if (e.key === "Enter") filterProjects();
    };

    if (searchTitle) searchTitle.addEventListener("keypress", handleEnterKey);
    if (searchRecruiter) searchRecruiter.addEventListener("keypress", handleEnterKey);
}

// 프로젝트 목록 로드
async function loadProjects() {
    const loading = document.getElementById("loading");
    const recruitingList = document.getElementById("recruitingProjectsList");
    const closedList = document.getElementById("closedProjectsList");

    if (loading) loading.style.display = "block";
    if (recruitingList) recruitingList.innerHTML = "";
    if (closedList) closedList.innerHTML = "";

    try {
        const token = sessionStorage.getItem("token");
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const response = await fetch(`${window.apiBase}/api/projects`, { headers });
        const data = await response.json();

        if (!response.ok || !data.success) {
            throw new Error("프로젝트 목록 로드 실패");
        }

        const now = Date.now();
        const projects = data.projects.map((p) => normalizeProject(p, now));

        currentProjects = projects;
        filteredProjects = [...projects];

        if (loading) loading.style.display = "none";
        renderProjectsList();
    } catch (error) {
        console.error("프로젝트 로드 실패:", error);
        if (loading) loading.style.display = "none";
        if (recruitingList) {
            recruitingList.innerHTML = '<p style="text-align: center; color: #ef4444;">프로젝트를 불러오는데 실패했습니다.</p>';
        }
    }
}

// 프로젝트 데이터 정규화
function normalizeProject(p, now) {
    const deadline = p.recruitmentDeadline;
    const deadlineTime = deadline ? new Date(deadline).getTime() : null;
    const isExpired = deadlineTime ? deadlineTime < now : false;
    const participants = typeof p.participants === "number" ? p.participants : 1;
    const maxParticipants = p.maxParticipants || 0;
    const isFull = participants >= maxParticipants && maxParticipants > 0;
    const isClosed = isExpired || isFull || p.status !== "recruiting";

    return {
        id: p._id,
        title: p.title,
        description: p.description,
        status: p.status,
        category: p.category,
        recruiter: p.creator?.nickname || "닉네임 없음",
        recruiterId: p.creator?._id || p.creator,
        participants,
        maxParticipants,
        deadline,
        createdAt: p.createdAt,
        tags: p.tags || [],
        isExpired,
        isFull,
        isClosed,
        hasApplied: p.hasApplied || false,
        applicationStatus: p.applicationStatus || null,
    };
}

// 프로젝트 목록 렌더링
function renderProjectsList() {
    const recruitingProjects = filteredProjects.filter((p) => !p.isClosed);
    const closedProjects = filteredProjects.filter((p) => p.isClosed);

    renderProjectSection(recruitingProjects, "recruitingProjectsList", "recruitingEmptyState", true);
    renderProjectSection(closedProjects, "closedProjectsList", "closedEmptyState", false);
}

// 프로젝트 섹션 렌더링
function renderProjectSection(projects, containerId, emptyStateId, isRecruiting) {
    const container = document.getElementById(containerId);
    const emptyState = document.getElementById(emptyStateId);

    if (!container) return;

    if (projects.length === 0) {
        container.innerHTML = "";
        if (emptyState) emptyState.style.display = "block";
        return;
    }

    if (emptyState) emptyState.style.display = "none";

    const projectsHTML = projects.map((project) => createProjectCardHTML(project, isRecruiting)).join("");
    container.innerHTML = projectsHTML;
}

/**
 * 프로젝트 카드 HTML 생성
 * @param {Object} project - 프로젝트 데이터
 * @param {boolean} isRecruiting - 모집중 여부
 * @returns {string} HTML 문자열
 */
function createProjectCardHTML(project, isRecruiting) {
    const { statusClass, statusText } = getProjectStatus(project);
    const isOwner = currentUserId && project.recruiterId === currentUserId;
    const participantsText = `${project.participants}/${project.maxParticipants || "-"}명`;
    const actionButton = createActionButton(project, isRecruiting, isOwner);

    return `
        <div class="project-card">
            <div class="project-header">
                <div>
                    <h3 class="project-title">${escapeHtml(project.title)}</h3>
                    <p style="color: #6b7280; font-size: 0.875rem;">by ${escapeHtml(project.recruiter)}</p>
                </div>
                <span class="project-status ${statusClass}">${statusText}</span>
            </div>
            <p class="project-description">${escapeHtml(project.description)}</p>
            <div class="project-tags">
                ${project.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
            </div>
            <div class="project-meta">
                <span>카테고리: ${escapeHtml(typeof formatCategory === "function" ? formatCategory(project.category) : project.category || "기타")}</span>
                <span>참여자: ${participantsText}</span>
                <span>마감: ${formatDate(project.deadline)}</span>
            </div>
            <div style="margin-top: 1rem; display: flex; gap: 0.5rem;">
                <a href="project-detail.html?id=${project.id}" class="btn-primary" style="flex: 1; text-align: center;">자세히 보기</a>
                ${actionButton}
            </div>
        </div>
    `;
}

/**
 * 프로젝트 상태 정보 가져오기
 * @param {Object} project - 프로젝트 데이터
 * @returns {{statusClass: string, statusText: string}} 상태 클래스와 텍스트
 */
function getProjectStatus(project) {
    const statusExpired = project.isExpired && project.status === "recruiting";
    const statusFull = project.isFull && project.status === "recruiting";

    if (statusExpired) {
        return { statusClass: "status-expired", statusText: "기간 만료" };
    } else if (statusFull) {
        return { statusClass: "status-expired", statusText: "인원 마감" };
    }

    return { statusClass: `status-${project.status}`, statusText: getStatusText(project.status) };
}

/**
 * 액션 버튼 HTML 생성
 * @param {Object} project - 프로젝트 데이터
 * @param {boolean} isRecruiting - 모집중 여부
 * @param {boolean} isOwner - 작성자 여부
 * @returns {string} 버튼 HTML
 */
function createActionButton(project, isRecruiting, isOwner) {
    const statusExpired = project.isExpired && project.status === "recruiting";
    const statusFull = project.isFull && project.status === "recruiting";

    if (isRecruiting && project.status === "recruiting" && !statusExpired && !statusFull) {
        if (isOwner) {
            return `<button class="btn-secondary" disabled>내 프로젝트</button>`;
        } else if (project.hasApplied) {
            const statusText = project.applicationStatus === "approved" ? "승인됨" :
                project.applicationStatus === "rejected" ? "거절됨" : "지원완료";
            const canCancel = project.applicationStatus === "pending" || !project.applicationStatus;
            if (canCancel) {
                return `<button onclick="cancelApplication('${project.id}', event)" class="btn-secondary">지원 취소</button>`;
            } else {
                return `<button class="btn-outline" disabled>${statusText}</button>`;
            }
        } else {
            return `<button onclick="applyToProject('${project.id}', event)" class="btn-secondary">지원하기</button>`;
        }
    } else if (isRecruiting && (statusExpired || statusFull)) {
        return `<button class="btn-secondary" disabled>${statusExpired ? "기간 만료" : "인원 마감"}</button>`;
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
 * 프로젝트 필터링
 */
function filterProjects() {
    const searchTitle = document.getElementById("searchTitle")?.value.toLowerCase() || "";
    const searchRecruiter = document.getElementById("searchRecruiter")?.value.toLowerCase() || "";
    const categoryFilter = document.getElementById("categoryFilter")?.value || "";
    const statusFilter = document.getElementById("statusFilter")?.value || "";

    filteredProjects = currentProjects.filter((project) => {
        const matchTitle = !searchTitle || project.title.toLowerCase().includes(searchTitle);
        const matchRecruiter = !searchRecruiter || project.recruiter.toLowerCase().includes(searchRecruiter);
        const matchCategory = !categoryFilter || project.category === categoryFilter;
        const matchStatus = !statusFilter || project.status === statusFilter;

        return matchTitle && matchRecruiter && matchCategory && matchStatus;
    });

    sortProjects();
}

/**
 * 필터 초기화
 */
function resetFilters() {
    const searchTitle = document.getElementById("searchTitle");
    const searchRecruiter = document.getElementById("searchRecruiter");
    const categoryFilter = document.getElementById("categoryFilter");
    const statusFilter = document.getElementById("statusFilter");
    const sortBy = document.getElementById("sortBy");

    if (searchTitle) searchTitle.value = "";
    if (searchRecruiter) searchRecruiter.value = "";
    if (categoryFilter) categoryFilter.value = "";
    if (statusFilter) statusFilter.value = "";
    if (sortBy) sortBy.value = "latest";

    filteredProjects = [...currentProjects];
    sortProjects();
}

/**
 * 프로젝트 정렬
 */
function sortProjects() {
    const sortBy = document.getElementById("sortBy")?.value || "latest";

    filteredProjects.sort((a, b) => {
        switch (sortBy) {
            case "latest":
                return new Date(b.createdAt) - new Date(a.createdAt);
            case "deadline":
                return new Date(a.deadline) - new Date(b.deadline);
            case "popular":
                return b.participants - a.participants;
            default:
                return 0;
        }
    });

    renderProjectsList();
}

/**
 * 프로젝트 지원
 * @param {string} projectId - 프로젝트 ID
 * @param {Event} event - 이벤트 객체
 */
async function applyToProject(projectId, event) {
    if (!isLoggedIn()) {
        showModal("알림", "로그인이 필요합니다.", () => {
            window.location.href = "login.html";
        });
        return;
    }

    try {
        await apiPost(`/api/projects/${projectId}/apply`, {});
        showModal("알림", "프로젝트에 지원했습니다!", () => {
            loadProjects();
        });
    } catch (error) {
        console.error("지원 실패:", error);
        showError("지원에 실패했습니다", error);
    }
}

/**
 * 지원 취소
 * @param {string} projectId - 프로젝트 ID
 * @param {Event} event - 이벤트 객체
 */
async function cancelApplication(projectId, event) {
    if (!isLoggedIn()) {
        showModal("알림", "로그인이 필요합니다.", () => {
            window.location.href = "login.html";
        });
        return;
    }

    showConfirmModal("확인", "정말로 지원을 취소하시겠습니까?", async () => {
        try {
            await apiDelete(`/api/projects/${projectId}/apply`);
            showModal("알림", "지원이 취소되었습니다!", () => {
                loadProjects();
            });
        } catch (error) {
            console.error("지원 취소 실패:", error);
            showError("지원 취소에 실패했습니다", error);
        }
    });
}
