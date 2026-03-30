/**
 * @fileoverview 메인(index) 페이지 + 전역 로그아웃
 * @description 최근 프로젝트 로딩 + 로그아웃
 */

document.addEventListener("DOMContentLoaded", () => {
    const mobileMenuBtn = document.querySelector(".mobile-menu-btn");
    const navLinks = document.querySelector(".nav-links");

    if (mobileMenuBtn && navLinks) {
        mobileMenuBtn.addEventListener("click", () => {
            navLinks.classList.toggle("active");
        });
    }

    loadRecentProjects();
});

// 최근 프로젝트 로드
async function loadRecentProjects() {
    const container = document.getElementById("recent-projects");
    if (!container) return;

    container.innerHTML = '<p style="text-align: center; color: #6b7280;">프로젝트를 불러오는 중...</p>';

    try {
        const data = await apiGet("/api/projects/recent");
        const projects = data.projects.map((p) => ({
            id: p._id,
            title: p.title,
            description: p.description,
            status: p.status,
            category: p.category,
            recruiter: p.creator?.nickname || "닉네임 없음",
            participants: typeof p.participants === "number" ? p.participants : 1,
            maxParticipants: p.maxParticipants,
            deadline: p.recruitmentDeadline,
            tags: p.tags || [],
        }));
        renderProjects(projects, container);
    } catch (error) {
        console.error("프로젝트 로드 실패:", error);
        if (container) {
            container.innerHTML = '<p style="text-align: center; color: #ef4444;">프로젝트를 불러오는데 실패했습니다.</p>';
        }
    }
}

// 프로젝트 목록 렌더링
function renderProjects(projects, container) {
    if (!container) return;

    if (projects.length === 0) {
        container.innerHTML = '<p style="text-align: center; color: #6b7280;">등록된 프로젝트가 없습니다.</p>';
        return;
    }

    const projectsHTML = projects
        .map(
            (project) => `
        <div class="project-card">
            <div class="project-header">
                <div>
                    <h3 class="project-title">${escapeHtml(project.title)}</h3>
                    <p style="color: #6b7280; font-size: 0.875rem;">by ${escapeHtml(project.recruiter)}</p>
                </div>
                <span class="project-status status-${project.status}">
                    ${getStatusText(project.status)}
                </span>
            </div>
            <p class="project-description">${escapeHtml(project.description)}</p>
            <div class="project-tags">
                ${project.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join("")}
            </div>
            <div class="project-meta">
                <span>카테고리: ${escapeHtml(typeof formatCategory === "function" ? formatCategory(project.category) : project.category || "기타")}</span>
                <span>참여자: ${project.participants}/${project.maxParticipants}명</span>
                <span>마감: ${formatDate(project.deadline)}</span>
            </div>
            <div style="margin-top: 1rem;">
                <a href="project-detail.html?id=${project.id}" class="btn-primary" style="width: 100%; text-align: center;">자세히 보기</a>
            </div>
        </div>
    `
        )
        .join("");

    container.innerHTML = projectsHTML;
}

// HTML 이스케이프
function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// 알림 표시
function showNotification(message, type = "info") {
    showModal("알림", message);
}

// 로그아웃 (전역 함수)
function logout() {
    const path = (window.location.pathname || "");
    const onAdminPage = /admin\.html$/i.test(path) && !/admin-login\.html$/i.test(path);
    const loginTarget = onAdminPage ? "admin-login.html" : "login.html";

    showConfirmModal("확인", "로그아웃 하시겠습니까?", () => {
        localStorage.removeItem("user");
        localStorage.removeItem("token");
        sessionStorage.clear();
        window.location.href = loginTarget;
    });
}
