/**
 * @fileoverview dashboard.html — 통계·최근 활동 (인증)
 * @description 대시보드 데이터 로드/렌더링
 */

document.addEventListener("DOMContentLoaded", () => {
    loadDashboardData();
    loadRecentActivities();
});

// 대시보드 통계 데이터 로드
async function loadDashboardData() {
    try {
        const data = await apiGet("/api/dashboard/stats");

        const activeProjectsEl = document.getElementById("active-projects");
        const myPostsEl = document.getElementById("my-posts");
        const applicationsEl = document.getElementById("applications");

        if (activeProjectsEl) activeProjectsEl.textContent = data.stats?.activeProjects || 0;
        if (myPostsEl) myPostsEl.textContent = data.stats?.myPosts || 0;
        if (applicationsEl) applicationsEl.textContent = data.stats?.applications || 0;
    } catch (error) {
        console.error("대시보드 데이터 로드 실패:", error);
        const activeProjectsEl = document.getElementById("active-projects");
        const myPostsEl = document.getElementById("my-posts");
        const applicationsEl = document.getElementById("applications");

        if (activeProjectsEl) activeProjectsEl.textContent = 0;
        if (myPostsEl) myPostsEl.textContent = 0;
        if (applicationsEl) applicationsEl.textContent = 0;
    }
}

// 최근 활동 로드
async function loadRecentActivities() {
    const activitiesContainer = document.getElementById("recent-activities");
    if (!activitiesContainer) return;

    try {
        const data = await apiGet("/api/dashboard/activities");

        if (!data.success || !data.activities || data.activities.length === 0) {
            showEmptyActivities(activitiesContainer);
            return;
        }

        renderActivities(activitiesContainer, data.activities);
    } catch (error) {
        console.error("최근 활동 로드 실패:", error);
        showEmptyActivities(activitiesContainer, "최근 활동을 불러올 수 없습니다.");
    }
}

// 빈 활동 상태 표시
function showEmptyActivities(container, message = "최근 활동이 없습니다.") {
    const emptyState = container.querySelector(".empty-state");
    if (emptyState) {
        emptyState.style.display = "block";
        const p = emptyState.querySelector("p");
        if (p) p.textContent = message;
    } else {
        container.innerHTML = `
            <div class="empty-state" style="display: block; padding: 2rem; text-align: center; color: #6b7280;">
                <p>${message}</p>
            </div>
        `;
    }
}

// 활동 목록 렌더링
function renderActivities(container, activities) {
    container.innerHTML = "";
    const emptyState = container.querySelector(".empty-state");
    if (emptyState) emptyState.style.display = "none";

    activities.forEach((activity) => {
        const activityElement = document.createElement("div");
        activityElement.className = "activity-item";

        const dotClass = activity.isNew ? "activity-dot active" : "activity-dot";
        activityElement.innerHTML = `
            <div class="${dotClass}"></div>
            <p>${escapeHtml(activity.message)}</p>
        `;

        container.appendChild(activityElement);
    });
}

// HTML 이스케이프
function escapeHtml(text) {
    if (!text) return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

// 프로젝트 페이지로 이동
function navigateToProjects() {
    window.location.href = "projects.html";
}

// 내 프로젝트 페이지로 이동
function navigateToMyProjects() {
    window.location.href = "my-projects.html";
}

// 프로필 페이지로 이동
function navigateToProfile() {
    window.location.href = "profile.html";
}
