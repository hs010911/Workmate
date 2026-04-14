/**
 * @fileoverview project-detail.html — 프로젝트 상세, 지원, 작업(간트)·참여자·일정 표시
 */

const APPLICANTS_PAGE_SIZE = 10;
let currentProject = null;
let isOwner = false;
let applicants = [];
let applicantsPage = 1;

let tasks = [];
let participants = [];
let selectedTask = null;
let chartMonthCount = parseInt(localStorage.getItem("chartMonthCount") || "4", 10);

const expandedTasks = new Set();

/**
 * 달력 한 줄(일~토) 기준으로 해당 월이 며칠씩 몇 줄로 나뉘는지.
 * 예: 1일이 수요일이면 첫 줄은 수~토 4일, 이후 줄은 각 7일(또는 말일까지).
 * @param {number} year
 * @param {number} monthIndex 0-11
 * @returns {number[]} 각 줄의 일수 (합 = 해당 월 일수)
 */
function getCalendarWeekSegmentLengths(year, monthIndex) {
    const first = new Date(year, monthIndex, 1);
    const last = new Date(year, monthIndex + 1, 0);
    const daysInMonth = last.getDate();
    const sun0 = first.getDay();

    const segments = [];
    const firstLen = Math.min(daysInMonth, 1 + (6 - sun0));
    segments.push(firstLen);
    let dayAfter = firstLen + 1;

    while (dayAfter <= daysInMonth) {
        const len = Math.min(7, daysInMonth - dayAfter + 1);
        segments.push(len);
        dayAfter += len;
    }
    return segments;
}

/**
 * 월 열 안에서 주(달력 줄) 경계에 세로 점선 — 실제 일수 비율로 위치.
 * @param {number} year
 * @param {number} monthIndex 0-11
 * @returns {string} HTML
 */
function buildWeekDividerOverlay(year, monthIndex) {
    const lengths = getCalendarWeekSegmentLengths(year, monthIndex);
    const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
    if (lengths.length < 2) return "";

    let cum = 0;
    let lines = "";
    for (let i = 0; i < lengths.length - 1; i++) {
        cum += lengths[i];
        const leftPct = (cum / daysInMonth) * 100;
        lines += `<div class="gantt-week-divider-line" style="position:absolute;left:${leftPct}%;top:0;bottom:0;width:0;border-left:1px dashed rgba(209,213,219,0.75);pointer-events:none;"></div>`;
    }
    return `<div class="gantt-week-dividers" aria-hidden="true" style="position:absolute;left:0;top:0;right:0;bottom:0;pointer-events:none;z-index:0;">${lines}</div>`;
}

document.addEventListener("DOMContentLoaded", async () => {
    if (typeof apiGet !== "function") {
        document.getElementById("projectTitle").textContent = "API 로드 실패";
        document.getElementById("projectDescription").textContent = "config.js, api.js 등 스크립트가 올바르게 로드되지 않았습니다. 페이지를 새로 고침해 주세요.";
        return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const projectId = urlParams.get("id");

    if (!projectId) {
        if (typeof showModal === "function") {
            showModal("알림", "프로젝트 ID가 없습니다.", () => { window.location.href = "projects.html"; });
        } else {
            window.location.href = "projects.html";
        }
        return;
    }

    await loadProjectDetail(projectId);
});

/**
 * 프로젝트 상세 정보 로드
 * @param {string} projectId - 프로젝트 ID
 */
async function loadProjectDetail(projectId) {
    try {
        const data = await apiGet(`/api/projects/${projectId}`);
        const p = data && data.project;
        if (!p) {
            showModal("오류", "프로젝트 정보를 불러올 수 없습니다.", () => {
                window.location.href = "projects.html";
            });
            return;
        }

        const creatorId = p.creator && (p.creator._id || p.creator);
        const project = {
            id: p._id,
            title: p.title != null ? String(p.title) : "",
            description: p.description != null ? String(p.description) : "-",
            status: p.status || "recruiting",
            category: p.category || "web",
            recruiter: (p.creator && (p.creator.nickname || p.creator.username || p.creator.name)) || "닉네임 없음",
            recruiterId: creatorId,
            participants: typeof p.participants === "number" ? p.participants : 1,
            maxParticipants: p.maxParticipants || 0,
            deadline: p.recruitmentDeadline,
            requirements: p.requirements != null ? String(p.requirements) : "",
            tags: Array.isArray(p.tags) ? p.tags : [],
            isExpired: p.recruitmentDeadline ? new Date(p.recruitmentDeadline) < new Date() : false,
            hasApplied: p.hasApplied || false,
            applicationStatus: p.applicationStatus || null,
        };

        currentProject = project;
        const currentUser = typeof getCurrentUser === "function" ? getCurrentUser() : null;
        isOwner = currentUser && String(currentUser.id) === String(project.recruiterId);
        const isParticipant = currentUser && project.applicationStatus === "approved";

        renderProjectDetail(project);
        if (isOwner) {
            document.getElementById("applicantsSection").style.display = "block";
            loadApplicants();
        } else {
            document.getElementById("applicantsSection").style.display = "none";
        }
        
        const tabTasksBtn = document.getElementById("tabTasksBtn");
        if ((isOwner || isParticipant) && (project.status === "in-progress" || project.status === "completed")) {
            if (tabTasksBtn) {
                tabTasksBtn.style.display = "block";
                try {
                    await loadParticipants(project.id);
                    await loadTasks(project.id);
                    
                    const chartMonthInput = document.getElementById("chartMonthCount");
                    if (chartMonthInput) {
                        const savedCount = parseInt(localStorage.getItem("chartMonthCount") || "4", 10);
                        chartMonthCount = savedCount;
                        chartMonthInput.value = savedCount;
                    }
                    
                    generateMonthHeaders();
                } catch (error) {
                    console.error("작업 관리 데이터 로드 실패:", error);
                }
            }
        } else {
            if (tabTasksBtn) {
                tabTasksBtn.style.display = "none";
            }
        }
    } catch (error) {
        console.error("프로젝트 로드 실패:", error);
        const msg = error && error.message && error.message.includes("연결")
            ? "서버에 연결할 수 없습니다. 터미널에서 백엔드 서버를 실행했는지 확인하세요 (예: cd project-management-backend && npm run dev)."
            : "프로젝트를 불러오는데 실패했습니다.";
        if (typeof showModal === "function") {
            showModal("오류", msg, () => { window.location.href = "projects.html"; });
        } else {
            const desc = document.getElementById("projectDescription");
            if (desc) desc.textContent = msg;
        }
    }
}

/**
 * 프로젝트 상세 정보 렌더링
 * @param {Object} project - 프로젝트 데이터
 */
function renderProjectDetail(project) {
    const tabInfo = document.getElementById("tabInfo");
    const projectInfoSection = document.getElementById("projectInfo");
    if (tabInfo) tabInfo.classList.add("active");
    if (tabInfo) tabInfo.style.display = "";
    if (projectInfoSection) projectInfoSection.style.display = "";

    const projectTitle = document.getElementById("projectTitle");
    if (projectTitle) projectTitle.textContent = escapeHtml(project.title || "프로젝트 제목");

    const statusElement = document.getElementById("projectStatus");
    if (statusElement) {
        const statusExpired = project.isExpired && project.status === "recruiting";
        statusElement.textContent = statusExpired ? "모집 기간 만료" : (typeof getStatusText === "function" ? getStatusText(project.status) : project.status);
        statusElement.className = "project-status " + (statusExpired ? "status-expired" : "status-" + (project.status || "recruiting"));
    }

    const projectDescription = document.getElementById("projectDescription");
    if (projectDescription) projectDescription.textContent = escapeHtml(project.description || "설명 없음");

    const projectCategory = document.getElementById("projectCategory");
    if (projectCategory) {
        projectCategory.textContent =
            typeof formatCategory === "function" ? formatCategory(project.category) : project.category || "-";
    }

    const projectRecruiter = document.getElementById("projectRecruiter");
    if (projectRecruiter) projectRecruiter.textContent = escapeHtml(project.recruiter || "-");

    const participantsEl = document.getElementById("projectParticipants");
    if (participantsEl) {
        const participantsText = project.maxParticipants
            ? `${project.participants}/${project.maxParticipants}명`
            : `${project.participants}명`;
        participantsEl.textContent = participantsText;
    }

    const deadlineEl = document.getElementById("projectDeadline");
    if (deadlineEl) deadlineEl.textContent = project.deadline ? (typeof formatDate === "function" ? formatDate(project.deadline) : String(project.deadline)) : "-";

    const actionsContainer = document.getElementById("projectActions");
    actionsContainer.innerHTML = "";

    if (isOwner) {
        let statusButton = "";
        if (project.status === "recruiting") {
            statusButton = `<button class="btn-primary" onclick="changeProjectStatus('in-progress')">프로젝트 시작</button>`;
        } else if (project.status === "in-progress") {
            statusButton = `<button class="btn-secondary" onclick="changeProjectStatus('completed')">프로젝트 완료</button>`;
        }
        
            const canDelete = project.status === "recruiting";
            const deleteButton = canDelete ? `<button class="btn-danger" onclick="deleteProject()">삭제</button>` : "";
        actionsContainer.innerHTML = `
            <button class="btn-secondary" onclick="editProject()">프로젝트 수정</button>
            ${statusButton}
                ${deleteButton}
        `;
    } else if (isLoggedIn()) {
        if (project.status === "recruiting" && !project.isExpired) {
            if (project.hasApplied) {
                const statusText = project.applicationStatus === "approved" ? "승인됨" : 
                                  project.applicationStatus === "rejected" ? "거절됨" : "지원완료";
                const canCancel = project.applicationStatus === "pending" || !project.applicationStatus;
                if (canCancel) {
                    actionsContainer.innerHTML = `
                        <button class="btn-outline" disabled style="margin-right: 0.5rem;">${statusText}</button>
                        <button class="btn-secondary" onclick="cancelApplication('${project.id}')">지원 취소</button>
                    `;
                } else {
                    actionsContainer.innerHTML = `
                        <button class="btn-outline" disabled>${statusText}</button>
                    `;
                }
            } else {
                actionsContainer.innerHTML = `
                    <button class="btn-primary" onclick="applyToProject('${project.id}')">지원하기</button>
                `;
            }
        } else if (project.status === "recruiting" && project.isExpired) {
            actionsContainer.innerHTML = `
                <button class="btn-secondary" disabled>모집 기간 만료</button>
            `;
        } else {
            actionsContainer.innerHTML = `
                <p style="color: #6b7280;">모집이 마감되었습니다.</p>
            `;
        }
    } else {
        const guestHtml = project.status === "recruiting" && !project.isExpired
            ? '<a href="login.html" class="btn-primary">로그인 후 지원하기</a>'
            : '<p style="color: #6b7280;">모집이 마감되었습니다.</p>';
        actionsContainer.innerHTML = guestHtml;
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

/**
 * 프로젝트 지원
 * @param {string} projectId - 프로젝트 ID
 */
async function applyToProject(projectId) {
    if (!await confirmAction("이 프로젝트에 지원하시겠습니까?")) {
        return;
    }

    try {
        await apiPost(`/api/projects/${projectId}/apply`, {});
        showModal("알림", "지원이 완료되었습니다!", () => {
            location.reload();
        });
    } catch (error) {
        showError("지원에 실패했습니다", error);
    }
}

/**
 * 지원 취소
 * @param {string} projectId - 프로젝트 ID
 */
async function cancelApplication(projectId) {
    if (!await confirmAction("정말로 지원을 취소하시겠습니까?")) {
        return;
    }

    try {
        await apiDelete(`/api/projects/${projectId}/apply`);
        showModal("알림", "지원이 취소되었습니다!", () => {
            location.reload();
        });
    } catch (error) {
        showError("지원 취소에 실패했습니다", error);
    }
}

/**
 * 프로젝트 수정
 */
function editProject() {
    const modalId = "projectEditModal";
    const d = new Date();
    d.setDate(d.getDate() + 1);
    const today = d.toISOString().split("T")[0];
    const requirementsValue = currentProject?.requirements || "";
    const tagsValue = Array.isArray(currentProject?.tags) ? currentProject.tags.join(", ") : "";

    const content = `
        <div class="modal-content" onclick="event.stopPropagation()">
            <div class="modal-header">
                <h3 class="modal-title">프로젝트 수정</h3>
                <button class="modal-close" onclick="closeModal('${modalId}')">&times;</button>
            </div>

            <div class="form-group">
                <label>프로젝트 제목</label>
                <input type="text" id="editProjectTitle" class="form-input" required>
            </div>

            <div class="form-group">
                <label>프로젝트 설명</label>
                <textarea id="editProjectDescription" class="form-input" required style="min-height: 150px;"></textarea>
            </div>

            <div class="form-group">
                <label>카테고리</label>
                <select id="editProjectCategory" class="form-input" required>
                    <option value="web">웹 개발</option>
                    <option value="mobile">모바일 앱</option>
                    <option value="ai">AI/ML</option>
                    <option value="game">게임</option>
                    <option value="design">디자인</option>
                </select>
            </div>

            <div class="form-group">
                <label>모집 인원</label>
                <input type="number" id="editProjectMaxParticipants" class="form-input" required min="1" max="20">
            </div>

            <div class="form-group">
                <label>모집 마감일</label>
                <input type="date" id="editProjectDeadline" class="form-input" required>
            </div>

            <div class="form-group">
                <label>필요한 기술/역할</label>
                <textarea id="editProjectRequirements" class="form-input" style="min-height: 120px;"></textarea>
            </div>

            <div class="form-group">
                <label>태그 (쉼표로 구분)</label>
                <input type="text" id="editProjectTags" class="form-input" value="">
                <p style="color: #6b7280; font-size: 0.875rem; margin-top: 0.5rem;">예: React, Node.js, MongoDB</p>
            </div>

            <div style="display: flex; gap: 0.5rem; justify-content: flex-end; margin-top: 1rem;">
                <button type="button" class="btn-secondary" onclick="closeModal('${modalId}')">취소</button>
                <button type="button" class="btn-primary" onclick="saveProjectEdit()">저장</button>
            </div>
        </div>
    `;

    const modal = createModal(modalId, content);
    modal.innerHTML = content;
    modal.classList.add("active");

    const titleEl = document.getElementById("editProjectTitle");
    const descEl = document.getElementById("editProjectDescription");
    const categoryEl = document.getElementById("editProjectCategory");
    const maxEl = document.getElementById("editProjectMaxParticipants");
    const deadlineEl = document.getElementById("editProjectDeadline");
    const reqEl = document.getElementById("editProjectRequirements");
    const tagsEl = document.getElementById("editProjectTags");

    if (titleEl) titleEl.value = currentProject?.title || "";
    if (descEl) descEl.value = currentProject?.description || "";
    if (categoryEl) categoryEl.value = currentProject?.category || "web";
    if (maxEl) maxEl.value = currentProject?.maxParticipants || 1;
    if (deadlineEl) {
        const dateVal = currentProject?.deadline ? formatDateForInput(currentProject.deadline) : "";
        deadlineEl.min = today;
        deadlineEl.value = dateVal;
    }
    if (reqEl) reqEl.value = requirementsValue;
    if (tagsEl) tagsEl.value = tagsValue;
}

/**
 * 프로젝트 수정 저장
 */
async function saveProjectEdit() {
    const modalId = "projectEditModal";
    try {
        const title = document.getElementById("editProjectTitle")?.value?.trim();
        const description = document.getElementById("editProjectDescription")?.value?.trim();
        const category = document.getElementById("editProjectCategory")?.value;
        const maxParticipants = parseInt(document.getElementById("editProjectMaxParticipants")?.value, 10);
        const deadline = document.getElementById("editProjectDeadline")?.value;
        const requirements = document.getElementById("editProjectRequirements")?.value || "";
        const tagsText = document.getElementById("editProjectTags")?.value || "";
        const tags = tagsText
            .split(",")
            .map((t) => t.trim())
            .filter((t) => t);

        if (!title || !description || !category || !maxParticipants || !deadline) {
            showModal("알림", "필수 값을 모두 입력해주세요.");
            return;
        }

        await apiPut(`/api/projects/${currentProject.id}`, {
            title,
            description,
            category,
            maxParticipants,
            deadline,
            requirements,
            tags,
        });

        closeModal(modalId);
        showModal("알림", "프로젝트가 수정되었습니다.", () => {
            window.location.reload();
        });
    } catch (error) {
        console.error("프로젝트 수정 실패:", error);
        showError("프로젝트 수정 실패", error);
    }
}

/**
 * 프로젝트 상태 변경
 * @param {string} newStatus - 새로운 상태
 */
async function changeProjectStatus(newStatus) {
    const statusText = {
        "in-progress": "진행중",
        "completed": "완료",
    }[newStatus] || newStatus;

    if (!await confirmAction(`프로젝트 상태를 "${statusText}"로 변경하시겠습니까?`)) {
        return;
    }

    try {
        await apiPut(`/api/projects/${currentProject.id}`, { status: newStatus });
        showModal("알림", `프로젝트 상태가 "${statusText}"로 변경되었습니다.`, () => {
            location.reload();
        });
    } catch (error) {
        showError("상태 변경에 실패했습니다", error);
    }
}

/**
 * 지원자 목록 로드
 * @param {number} page - 페이지 번호
 */
async function loadApplicants(page = 1) {
    if (!isOwner) return;
    try {
        const data = await apiGet(`/api/projects/${currentProject.id}/applicants`);
        applicants = data.applicants || [];
        applicantsPage = page;
        renderApplicantsTable();
    } catch (error) {
        showError("지원자 목록 로드 실패", error);
        const tbody = getElement("applicantsTableBody");
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="empty-cell error">지원자 목록을 불러올 수 없습니다.</td></tr>`;
        }
        const pagination = getElement("applicantsPagination");
        if (pagination) {
            pagination.innerHTML = "";
        }
    }
}

/**
 * 지원자 테이블 렌더링
 */
function renderApplicantsTable() {
    const tbody = document.getElementById("applicantsTableBody");
    const total = applicants.length;
    document.getElementById("applicantsCount").textContent = `총 ${total}명`;

    if (total === 0) {
        tbody.innerHTML = `<tr><td colspan="6" class="empty-cell">지원자가 없습니다.</td></tr>`;
        renderApplicantsPagination(1);
        return;
    }

    const totalPages = Math.ceil(total / APPLICANTS_PAGE_SIZE);
    if (applicantsPage > totalPages) {
        applicantsPage = totalPages;
    }
    const startIndex = (applicantsPage - 1) * APPLICANTS_PAGE_SIZE;
    const pageItems = applicants.slice(startIndex, startIndex + APPLICANTS_PAGE_SIZE);

    tbody.innerHTML = pageItems
        .map((applicant, idx) => {
            const no = startIndex + idx + 1;
            const nickname = escapeHtml(applicant.applicant?.nickname || applicant.applicant?.username || "사용자");
            const name = escapeHtml(applicant.applicant?.name || "-");
            const email = escapeHtml(applicant.applicant?.username || "-");
            const appliedAt = formatDate(applicant.createdAt);
            const profileLink = applicant.applicant?._id
                ? `profile.html?id=${applicant.applicant._id}`
                : "#";
            const status = applicant.status || "pending";
            const applicantId = applicant.applicant?._id || applicant.applicant;

            let actionButtons = "";
            if (status === "pending") {
                actionButtons = `
                    <button class="btn-primary" style="padding: 0.25rem 0.5rem; font-size: 0.875rem; margin-right: 0.25rem;" onclick="handleApplication('${currentProject.id}', '${applicantId}', 'approve')">승인</button>
                    <button class="btn-secondary" style="padding: 0.25rem 0.5rem; font-size: 0.875rem;" onclick="handleApplication('${currentProject.id}', '${applicantId}', 'reject')">거절</button>
                `;
            } else if (status === "approved") {
                actionButtons = '<span style="color: #10b981; font-weight: 500;">승인됨</span>';
            } else if (status === "rejected") {
                actionButtons = '<span style="color: #ef4444; font-weight: 500;">거절됨</span>';
            }

            const nicknameCell = currentProject.status === "recruiting"
                ? "<a href=\"" + profileLink + "\" class=\"nickname-link\">" + nickname + "</a>"
                : nickname;
            return `
                <tr>
                    <td>${no}</td>
                    <td>${nicknameCell}</td>
                    <td>${name}</td>
                    <td>${email}</td>
                    <td>${appliedAt}</td>
                    <td>${actionButtons}</td>
                </tr>
            `;
        })
        .join("");

    renderApplicantsPagination(totalPages);
}

/**
 * 지원 승인/거절 처리
 * @param {string} projectId - 프로젝트 ID
 * @param {string} applicantId - 지원자 ID
 * @param {string} action - 액션 (approve/reject)
 */
async function handleApplication(projectId, applicantId, action) {
    const message = action === "approve" ? "이 지원자를 승인하시겠습니까?" : "이 지원을 거절하시겠습니까?";
    if (!(await confirmAction(message))) {
        return;
    }

    try {
        const response = await apiPost(`/api/projects/${projectId}/applicants/${applicantId}/${action}`);
        
        if (response.success) {
            await loadApplicants(applicantsPage);
            
            if (action === "approve") {
                await loadParticipants(projectId);
                updateAssigneeSelect();
            }
            
            showModal("알림", response.message || (action === "approve" ? "승인되었습니다." : "거절되었습니다."), () => {
                loadApplicants();
            });
        }
    } catch (error) {
        console.error("지원 승인/거절 실패:", error);
        showError("처리에 실패했습니다", error);
    }
}

/**
 * 지원자 페이지네이션 렌더링
 * @param {number} totalPages - 전체 페이지 수
 */
function renderApplicantsPagination(totalPages) {
    const pagination = document.getElementById("applicantsPagination");
    if (!pagination) return;

    const safeTotalPages = Math.max(1, Number(totalPages) || 1);
    applicantsPage = Math.min(Math.max(1, applicantsPage), safeTotalPages);

    if (safeTotalPages === 1) {
        pagination.innerHTML = `
            <button type="button" class="pagination-btn" disabled onclick="goToApplicantsPage(1)">&lt;</button>
            <button type="button" class="pagination-btn active" onclick="goToApplicantsPage(1)">1</button>
            <button type="button" class="pagination-btn" disabled onclick="goToApplicantsPage(1)">&gt;</button>
        `;
        return;
    }

    const showNumbersMax = 9;
    const numbersToShow = Math.min(showNumbersMax, safeTotalPages);
    const hasMorePages = safeTotalPages > showNumbersMax;

    const prevDisabled = applicantsPage === 1;
    const nextDisabled = applicantsPage === safeTotalPages;

    let buttons = "";
    buttons += `
        <button type="button" class="pagination-btn pagination-prev" ${prevDisabled ? "disabled" : ""} onclick="goToApplicantsPage(${applicantsPage - 1})">&lt;</button>
    `;

    for (let page = 1; page <= numbersToShow; page += 1) {
        buttons += `
            <button type="button" class="pagination-btn ${page === applicantsPage ? "active" : ""}" onclick="goToApplicantsPage(${page})">${page}</button>
        `;
    }

    if (hasMorePages) {
        buttons += `
            <button type="button" class="pagination-btn" disabled>...</button>
        `;
        const lastDisabled = applicantsPage === safeTotalPages;
        buttons += `
            <button type="button" class="pagination-btn pagination-last" ${lastDisabled ? "disabled" : ""} onclick="goToApplicantsPage(${safeTotalPages})">&gt;|</button>
        `;
    }

    buttons += `
        <button type="button" class="pagination-btn pagination-next" ${nextDisabled ? "disabled" : ""} onclick="goToApplicantsPage(${applicantsPage + 1})">&gt;</button>
    `;

    pagination.innerHTML = buttons;
}

/**
 * 지원자 페이지 이동
 * @param {number} page - 페이지 번호
 */
function goToApplicantsPage(page) {
    const totalPages = Math.max(1, Math.ceil(applicants.length / APPLICANTS_PAGE_SIZE));
    if (page < 1 || page > totalPages) return;
    applicantsPage = page;
    renderApplicantsTable();
}

/**
 * 프로젝트 삭제
 */
async function deleteProject() {
    if (!await confirmAction("정말로 이 프로젝트를 삭제하시겠습니까?")) {
        return;
    }

    try {
        await apiDelete(`/api/projects/${currentProject.id}`);
        showModal("알림", "삭제되었습니다.", () => {
            window.location.href = "projects.html";
        });
    } catch (error) {
        showError("삭제 실패", error);
    }
}

function switchTab(tabName) {
    document.querySelectorAll(".detail-tab-btn").forEach(btn => {
        btn.classList.remove("active");
    });
    
    document.querySelectorAll(".tab-content").forEach(content => {
        content.classList.remove("active");
        content.style.display = "none";
    });

    if (tabName === "info") {
        const infoBtn = document.getElementById("tabInfoBtn");
        const infoTab = document.getElementById("tabInfo");
        if (infoBtn) infoBtn.classList.add("active");
        if (infoTab) {
            infoTab.classList.add("active");
            infoTab.style.display = "block";
        }
    } else if (tabName === "tasks") {
        const tasksBtn = document.getElementById("tabTasksBtn");
        const tasksTab = document.getElementById("tabTasks");
        if (tasksBtn) tasksBtn.classList.add("active");
        if (tasksTab) {
            tasksTab.classList.add("active");
            tasksTab.style.display = "block";

            const chartMonthInput = document.getElementById("chartMonthCount");
            if (chartMonthInput) {
                const savedCount = parseInt(localStorage.getItem("chartMonthCount") || "4", 10);
                chartMonthCount = savedCount;
                chartMonthInput.value = savedCount;
            }

            if (currentProject && (currentProject.status === "in-progress" || currentProject.status === "completed")) {
                (async () => {
                    try {
                        await loadParticipants(currentProject.id);
                        generateMonthHeaders();
                        await loadTasks(currentProject.id);

                        setTimeout(() => {
                            const headerRow = document.querySelector("#monthHeader")?.parentElement;
                            if (headerRow) {
                                const headerCount = headerRow.querySelectorAll("th:not(:first-child)").length;
                                const taskRows = document.querySelectorAll("#tasksTableBody tr");
                                const n = new Date();
                                const cm = n.getMonth();
                                const cy = n.getFullYear();
                                taskRows.forEach((row) => {
                                    const cellCount = row.querySelectorAll("td:not(:first-child)").length;
                                    if (cellCount < headerCount) {
                                        for (let i = cellCount; i < headerCount; i++) {
                                            const { year: ty, month: am } = calculateMonthYear(cm, cy, i);
                                            const td = document.createElement("td");
                                            td.className = "month-cell";
                                            td.style.cssText = "text-align: center;";
                                            td.innerHTML = buildWeekDividerOverlay(ty, am);
                                            row.appendChild(td);
                                        }
                                    }
                                });
                            }
                        }, 100);
                    } catch (error) {
                        console.error("작업 관리 데이터 로드 실패:", error);
                    }
                })();
            }
        }
    }
}

/**
 * 참여자 목록 로드
 * @param {string} projectId - 프로젝트 ID
 */
async function loadParticipants(projectId) {
    try {
        const data = await apiGet(`/api/projects/${projectId}/participants`);
        participants = data.participants || [];
        updateAssigneeSelect();
    } catch (error) {
        showError("참여자 로드 실패", error);
    }
}

/**
 * 작업 목록 로드
 * @param {string} projectId - 프로젝트 ID
 */
async function loadTasks(projectId) {
    try {
        const data = await apiGet(`/api/projects/${projectId}/tasks`);
        tasks = data.tasks || [];
        
        tasks = tasks.map((t) => {
            if (!t.dueDate && t.endDate) {
                return { ...t, dueDate: t.endDate, endDate: null };
            }
            return t;
        });
        
        const previousSelectedTaskId = selectedTask ? String(selectedTask._id) : null;
        
        renderTasks();
        
        if (previousSelectedTaskId) {
            const taskExists = tasks.find((t) => String(t._id) === previousSelectedTaskId);
            if (taskExists) {
                setTimeout(() => {
                    selectTask(previousSelectedTaskId);
                }, 100);
            }
        }
    } catch (error) {
        showError("작업 로드 실패", error);
    }
}

/**
 * 월 헤더 생성
 */
function generateMonthHeaders() {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();
    
    let headerRow = document.querySelector("#monthHeader")?.parentElement;
    if (!headerRow) {
        const thead = document.querySelector(".gantt-table thead");
        if (thead) {
            headerRow = thead.querySelector("tr");
        }
    }
    
    if (!headerRow) {
        return;
    }
    
    const monthHeader = document.getElementById("monthHeader");
    const existingHeaders = headerRow.querySelectorAll("th:not(:first-child)");
    
    existingHeaders.forEach((h) => {
        if (h.id !== "monthHeader") {
            h.remove();
        }
    });
    
    if (monthHeader && monthHeader.parentElement === headerRow) {
        monthHeader.remove();
    }

    const createdHeaders = [];
    for (let i = 0; i < chartMonthCount; i++) {
        const { year: targetYear, month: actualMonth } = calculateMonthYear(currentMonth, currentYear, i);
        const month = new Date(targetYear, actualMonth, 1);
        const monthYear = month.getFullYear();
        const monthName = month.toLocaleDateString("ko-KR", { month: "long" });
        
        const headerText = `${monthYear}년 ${monthName}`;
        
        const th = document.createElement("th");
        th.style.cssText = "border: 1px solid #e5e7eb; padding: 0.75rem; text-align: center; background: #f3f4f6; font-weight: 600; position: sticky; top: 0; z-index: 10; min-width: 120px;";
        th.textContent = headerText;
        headerRow.appendChild(th);
        createdHeaders.push(headerText);
    }
    
    const finalHeaders = headerRow.querySelectorAll("th:not(:first-child)");

    const taskRows = document.querySelectorAll("#tasksTableBody tr");
    if (taskRows.length > 0) {
        taskRows.forEach((row) => {
            const existingCells = row.querySelectorAll("td:not(:first-child)");
            const hasChartBars = existingCells.length > 0 && Array.from(existingCells).some(cell => cell.querySelector(".gantt-bar"));
            
            if (hasChartBars) {
                if (existingCells.length < chartMonthCount) {
                    for (let i = existingCells.length; i < chartMonthCount; i++) {
                        const { year: ty, month: am } = calculateMonthYear(currentMonth, currentYear, i);
                        const td = document.createElement("td");
                        td.className = "month-cell";
                        td.style.cssText = "text-align: center;";
                        td.innerHTML = buildWeekDividerOverlay(ty, am);
                        row.appendChild(td);
                    }
                }
                return;
            }
            
            existingCells.forEach((cell) => cell.remove());

            for (let i = 0; i < chartMonthCount; i++) {
                const { year: ty, month: am } = calculateMonthYear(currentMonth, currentYear, i);
                const td = document.createElement("td");
                td.className = "month-cell";
                td.style.cssText = "text-align: center;";
                td.innerHTML = buildWeekDividerOverlay(ty, am);
                row.appendChild(td);
            }
        });
    }
}

/**
 * 차트 기간 업데이트
 */
function updateChartPeriod() {
    const input = document.getElementById("chartMonthCount");
    if (!input) {
        console.error("차트 기간 입력 필드를 찾을 수 없습니다.");
        return;
    }
    
    const newCount = parseInt(input.value, 10);
    if (isNaN(newCount) || newCount < 1 || newCount > 24) {
        showModal("알림", "1부터 24 사이의 숫자를 입력해주세요.");
        input.value = chartMonthCount;
        return;
    }
    
    if (newCount === chartMonthCount) {
        return;
    }
    
    chartMonthCount = newCount;
    
    localStorage.setItem("chartMonthCount", newCount.toString());
    
    generateMonthHeaders();
    
    if (tasks.length > 0) {
        renderTasks();
    } else {
        const tbody = document.getElementById("tasksTableBody");
        if (tbody) {
            const monthCount = chartMonthCount;
            tbody.innerHTML = `
                <tr>
                    <td colspan="${monthCount + 1}" style="text-align: center; padding: 2rem; color: #6b7280;">
                        작업이 없습니다. + 버튼을 클릭하여 작업을 추가하세요.
                    </td>
                </tr>
            `;
        }
    }
}

/**
 * 작업 목록 렌더링
 */
function renderTasks() {
    const tbody = document.getElementById("tasksTableBody");
    if (!tbody) return;
    
    if (tasks.length === 0) {
        const headerRow = document.querySelector("#monthHeader")?.parentElement;
        const monthCount = headerRow ? headerRow.querySelectorAll("th").length - 1 : chartMonthCount;
        
        let emptyCells = "";
        for (let i = 0; i < monthCount; i++) {
            emptyCells += '<td style="border: 1px solid #e5e7eb; padding: 0.75rem;"></td>';
        }
        
        tbody.innerHTML = `
            <tr>
                <td colspan="${monthCount + 1}" style="text-align: center; padding: 2rem; color: #6b7280;">
                    작업이 없습니다. + 버튼을 클릭하여 작업을 추가하세요.
                </td>
            </tr>
        `;
        return;
    }

    const topLevelTasks = tasks.filter((t) => !t.parentTask);
    let html = "";
    
    topLevelTasks.forEach((task) => {
        const subtasks = tasks.filter((t) => t.parentTask && String(t.parentTask._id) === String(task._id));
        const hasSubtasks = subtasks.length > 0;
        const isExpanded = expandedTasks.has(String(task._id));
        const expandBtnHtml = hasSubtasks
            ? "<button class=\"task-expand-btn\" onclick=\"toggleSubtasks('" + task._id + "')\" data-expanded=\"" + isExpanded + "\" style=\"background: none; border: none; cursor: pointer; padding: 0.25rem; color: #6b7280; font-size: 0.875rem;\">" + (isExpanded ? "▲" : "▼") + "</button>"
            : "";

        html += `
            <tr class="task-row" data-task-id="${task._id}">
                <td class="task-cell" style="text-align: left; display: flex; align-items: center; gap: 0.5rem; border: 1px solid #e5e7eb; padding: 0.75rem; position: sticky; left: 0; background: #ffffff; z-index: 5;">
                    <input type="checkbox" class="task-checkbox" ${task.status === "completed" ? "checked" : ""} 
                        onchange="toggleTaskStatus('${task._id}')" style="width: 18px; height: 18px; cursor: pointer;">
                    ${expandBtnHtml}
                    <span class="task-title" data-task-id="${task._id}" onclick="selectTask('${task._id}')" ondblclick="editTaskTitle('${task._id}', event)" style="flex: 1; cursor: pointer; padding: 0.25rem 0.5rem; border-radius: 0.25rem;">
                        ${escapeHtml(task.title)}
                    </span>
                    <button class="task-delete-btn" onclick="deleteTask('${task._id}')" style="background: #ef4444; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.75rem;" title="작업 삭제">×</button>
                </td>
                ${generateMonthCells(task)}
            </tr>
        `;

        if (hasSubtasks && isExpanded) {
            subtasks.forEach((subtask) => {
                html += `
                    <tr class="subtask-row" data-task-id="${subtask._id}" data-parent-id="${task._id}" style="background: #f9fafb;">
                        <td class="task-cell" style="text-align: left; display: flex; align-items: center; gap: 0.5rem; border: 1px solid #e5e7eb; padding: 0.75rem; padding-left: 3rem; position: sticky; left: 0; background: #f9fafb; z-index: 4;">
                            <input type="checkbox" class="task-checkbox" ${subtask.status === "completed" ? "checked" : ""} 
                                onchange="toggleTaskStatus('${subtask._id}')" style="width: 18px; height: 18px; cursor: pointer;">
                            <span class="task-title" data-task-id="${subtask._id}" onclick="selectTask('${subtask._id}')" ondblclick="editTaskTitle('${subtask._id}', event)" style="flex: 1; cursor: pointer; padding: 0.25rem 0.5rem; border-radius: 0.25rem;">
                                ${escapeHtml(subtask.title)}
                            </span>
                            <button class="task-delete-btn" onclick="deleteTask('${subtask._id}')" style="background: #ef4444; color: white; border: none; padding: 0.25rem 0.5rem; border-radius: 0.25rem; cursor: pointer; font-size: 0.75rem;" title="작업 삭제">×</button>
                        </td>
                        ${generateMonthCells(subtask)}
                    </tr>
                `;
            });
        }
    });
    
    tbody.innerHTML = html;
}

/**
 * 월 셀 생성
 * @param {Object} task - 작업 데이터
 * @returns {string} HTML 문자열
 */
function generateMonthCells(task) {
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    if (!task.startDate || !task.dueDate) {
        let emptyCells = "";
        for (let i = 0; i < chartMonthCount; i++) {
            const { year: targetYear, month: actualMonth } = calculateMonthYear(currentMonth, currentYear, i);
            emptyCells += `<td class="month-cell">${buildWeekDividerOverlay(targetYear, actualMonth)}</td>`;
        }
        return emptyCells;
    }

    const startDate = new Date(task.startDate);
    const endDate = new Date(task.dueDate);

    if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
        let emptyCells = "";
        for (let i = 0; i < chartMonthCount; i++) {
            const { year: targetYear, month: actualMonth } = calculateMonthYear(currentMonth, currentYear, i);
            emptyCells += `<td class="month-cell">${buildWeekDividerOverlay(targetYear, actualMonth)}</td>`;
        }
        return emptyCells;
    }

    const spanIndices = [];
    for (let j = 0; j < chartMonthCount; j++) {
        const { year: ty, month: am } = calculateMonthYear(currentMonth, currentYear, j);
        const ms = new Date(ty, am, 1);
        const me = new Date(ty, am + 1, 0);
        if (endDate >= ms && startDate <= me) {
            spanIndices.push(j);
        }
    }

    let cells = "";
    for (let i = 0; i < chartMonthCount; i++) {
        const { year: targetYear, month: actualMonth } = calculateMonthYear(currentMonth, currentYear, i);
        const monthStart = new Date(targetYear, actualMonth, 1);
        const monthEnd = new Date(targetYear, actualMonth + 1, 0);

        if (endDate >= monthStart && startDate <= monthEnd) {
            const barStart = new Date(Math.max(startDate.getTime(), monthStart.getTime()));
            const barEnd = new Date(Math.min(endDate.getTime(), monthEnd.getTime()));
            const monthDays = monthEnd.getDate();
            const startDay = barStart.getDate();
            const endDay = barEnd.getDate();
            
            const width = Math.max(0, Math.min(100, ((endDay - startDay + 1) / monthDays) * 100));
            const left = Math.max(0, Math.min(100, ((startDay - 1) / monthDays) * 100));

            let barColor = "blue";
            if (task.status === "in-progress") barColor = "yellow";
            else if (task.status === "rework") barColor = "purple";
            else if (task.status === "completed") barColor = "green";

            const barBg =
                barColor === "yellow"
                    ? "#fbbf24"
                    : barColor === "purple"
                        ? "#c4b5fd"
                        : barColor === "green"
                            ? "#86efac"
                            : "#93c5fd";

            const isFirstSeg = spanIndices.length === 0 ? true : spanIndices[0] === i;
            const isLastSeg = spanIndices.length === 0 ? true : spanIndices[spanIndices.length - 1] === i;
            let segClass = "gantt-bar-seg-mid";
            if (spanIndices.length <= 1 || (isFirstSeg && isLastSeg)) {
                segClass = "gantt-bar-seg-only";
            } else if (isFirstSeg) {
                segClass = "gantt-bar-seg-start";
            } else if (isLastSeg) {
                segClass = "gantt-bar-seg-end";
            }
            const bridgeShadow = !isLastSeg ? `box-shadow: 1px 0 0 0 ${barBg};` : "";

            cells += `
                <td class="month-cell">
                    ${buildWeekDividerOverlay(targetYear, actualMonth)}
                    <div class="gantt-bar ${barColor} ${segClass}" style="height: 24px; position: relative; z-index: 1; margin: 0.25rem 0; width: ${width}%; margin-left: ${left}%; background: ${barBg}; ${bridgeShadow}">
                    </div>
                </td>
            `;
        } else {
            cells += `<td class="month-cell">${buildWeekDividerOverlay(targetYear, actualMonth)}</td>`;
        }
    }
    return cells;
}

/**
 * 작업 추가
 */
async function addTask() {
    if (!currentProject) {
        if (typeof showModal === "function") {
            showModal("알림", "프로젝트 정보를 먼저 불러온 후 다시 시도해주세요.");
        }
        return;
    }

    if (typeof showPromptModal === "function") {
        showPromptModal(
            "작업 추가",
            "추가할 작업의 제목을 입력해주세요.",
            "새 작업",
            async (value) => {
                const title = (value || "").trim();
                if (!title) {
                    showModal("알림", "작업 제목을 입력해주세요.");
                    return;
                }
                try {
                    await apiPost(`/api/projects/${currentProject.id}/tasks`, { title });
                    await loadTasks(currentProject.id);
                    generateMonthHeaders();
                } catch (error) {
                    showError("작업 생성에 실패했습니다", error);
                }
            },
        );
    } else {
        try {
            await apiPost(`/api/projects/${currentProject.id}/tasks`, { title: "새 작업" });
            await loadTasks(currentProject.id);
            generateMonthHeaders();
        } catch (error) {
            showError("작업 생성에 실패했습니다", error);
        }
    }
}

/**
 * 세부 작업 추가
 */
async function addSubtask() {
    if (!selectedTask) {
        showModal("알림", "먼저 작업을 선택해주세요.");
        return;
    }

    if (typeof showPromptModal === "function") {
        showPromptModal(
            "세부 작업 추가",
            `"${selectedTask.title || "작업"}" 아래에 추가할 세부 작업 제목을 입력해주세요.`,
            "새 세부 작업",
            async (value) => {
                const title = (value || "").trim();
                if (!title) {
                    showModal("알림", "세부 작업 제목을 입력해주세요.");
                    return;
                }
                try {
                    await apiPost(`/api/projects/${currentProject.id}/tasks`, {
                        title,
                        parentTask: selectedTask._id,
                    });
                    await loadTasks(currentProject.id);
                    generateMonthHeaders();
                    if (selectedTask) {
                        selectTask(selectedTask._id);
                    }
                } catch (error) {
                    showError("세부 작업 생성에 실패했습니다", error);
                }
            },
        );
    } else {
        try {
            await apiPost(`/api/projects/${currentProject.id}/tasks`, {
                title: "새 세부 작업",
                parentTask: selectedTask._id,
            });
            await loadTasks(currentProject.id);
            generateMonthHeaders();
            if (selectedTask) {
                selectTask(selectedTask._id);
            }
        } catch (error) {
            showError("세부 작업 생성에 실패했습니다", error);
        }
    }
}

/**
 * 작업 삭제
 * @param {string} taskId - 작업 ID
 */
async function deleteTask(taskId) {
    const task = tasks.find((t) => String(t._id) === String(taskId));
    if (!task) return;

    const taskTitle = task.title || "작업";
    const subtasks = tasks.filter((t) => t.parentTask && String(t.parentTask._id) === String(taskId));
    const hasSubtasks = subtasks.length > 0;

    let confirmMessage = `"${taskTitle}" 작업을 삭제하시겠습니까?`;
    if (hasSubtasks) {
        confirmMessage += `\n\n주의: 이 작업에는 ${subtasks.length}개의 세부 작업이 있습니다. 세부 작업도 함께 삭제됩니다.`;
    }

    if (!await confirmAction(confirmMessage)) {
        return;
    }

    try {
        await apiDelete(`/api/projects/${currentProject.id}/tasks/${taskId}`);

        if (selectedTask && String(selectedTask._id) === String(taskId)) {
            selectedTask = null;
            const subtasksSection = getElement("subtasksSection");
            const taskDetailPanel = getElement("taskDetailPanel");
            if (subtasksSection) subtasksSection.style.display = "none";
            if (taskDetailPanel) taskDetailPanel.style.display = "none";
        }

        await loadTasks(currentProject.id);
        generateMonthHeaders();
        
        showModal("알림", "작업이 삭제되었습니다.", () => {
            loadTasks();
        });
    } catch (error) {
        showError("작업 삭제에 실패했습니다", error);
    }
}

/**
 * 작업 선택
 * @param {string} taskId - 작업 ID
 */
function selectTask(taskId) {
    const task = tasks.find((t) => String(t._id) === String(taskId));
    if (!task) return;

    selectedTask = task;
    const selectedTaskTitle = document.getElementById("selectedTaskTitle");
    if (selectedTaskTitle) selectedTaskTitle.textContent = task.title;

    const isParentTask = !task.parentTask;
    const subtasks = isParentTask ? tasks.filter((t) => t.parentTask && String(t.parentTask._id) === String(taskId)) : [];
    const subtaskList = document.getElementById("subtaskList");
    if (subtaskList) {
        if (isParentTask) {
            if (subtasks.length === 0) {
                subtaskList.innerHTML = '<li style="color: #6b7280; padding: 0.5rem;">세부 작업이 없습니다.</li>';
            } else {
                subtaskList.innerHTML = subtasks
                    .map(
                        (st) => `
                    <li class="subtask-item" onclick="selectTask('${st._id}')" ondblclick="editTaskTitle('${st._id}', event)" style="padding: 0.5rem; margin-bottom: 0.5rem; background: #f9fafb; border-radius: 0.5rem; cursor: pointer;">
                        ${st.title}
                    </li>
                `,
                    )
                    .join("");
            }
        } else {
            subtaskList.innerHTML = '<li style="color: #6b7280; padding: 0.5rem;">이 작업은 세부 작업입니다.</li>';
        }
    }

    const subtasksSection = document.getElementById("subtasksSection");
    if (subtasksSection) subtasksSection.style.display = "block";

    const taskAssignee = document.getElementById("taskAssignee");
    const taskStartDate = document.getElementById("taskStartDate");
    const taskDueDate = document.getElementById("taskDueDate");
    const taskStatus = document.getElementById("taskStatus");
    
    updateAssigneeSelect();
    
    if (taskAssignee) {
        const currentUser = getCurrentUser();
        const isOwnerCheck = currentUser && currentProject && String(currentUser.id) === String(currentProject.recruiterId);
        
        if (task.assignee) {
            const assigneeId = typeof task.assignee === 'object' ? task.assignee._id : task.assignee;
            if (!isOwnerCheck) {
                if (currentUser && String(assigneeId) !== String(currentUser.id)) {
                    taskAssignee.value = "";
                } else {
                    taskAssignee.value = assigneeId || "";
                }
            } else {
                taskAssignee.value = assigneeId || "";
            }
        } else {
            taskAssignee.value = "";
        }
    }
    
    if (taskStartDate) {
        taskStartDate.value = formatDateForInput(task.startDate);
    }
    if (taskDueDate) {
        taskDueDate.value = formatDateForInput(task.dueDate);
    }
    if (taskStatus) {
        taskStatus.value = task.status || "todo";
    }

    const taskDetailPanel = document.getElementById("taskDetailPanel");
    if (taskDetailPanel) taskDetailPanel.style.display = "block";
}

/**
 * 세부 작업 표시/숨기기 토글
 * @param {string} taskId - 작업 ID
 */
function toggleSubtasks(taskId) {
    const taskIdStr = String(taskId);
    if (expandedTasks.has(taskIdStr)) {
        expandedTasks.delete(taskIdStr);
    } else {
        expandedTasks.add(taskIdStr);
    }
    renderTasks();
}

/**
 * 작업 제목 인라인 편집
 * @param {string} taskId - 작업 ID
 * @param {Event} event - 이벤트 객체
 */
function editTaskTitle(taskId, event) {
    if (event) {
        event.stopPropagation();
    }
    
    const task = tasks.find((t) => String(t._id) === String(taskId));
    if (!task) return;

    const titleElement = document.querySelector(`.task-title[data-task-id="${taskId}"]`);
    if (!titleElement) return;

    const currentTitle = task.title;
    const input = document.createElement("input");
    input.type = "text";
    input.value = currentTitle;
    input.className = "task-title-input";
    input.style.cssText = "flex: 1; border: 1px solid #2563eb; border-radius: 0.25rem; padding: 0.25rem 0.5rem; font-size: 0.875rem;";
    
    const saveTitle = async () => {
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== currentTitle) {
            try {
                await apiPut(`/api/projects/${currentProject.id}/tasks/${taskId}`, { title: newTitle });
                await loadTasks(currentProject.id);
                generateMonthHeaders();
                if (selectedTask && String(selectedTask._id) === String(taskId)) {
                    selectTask(taskId);
                }
            } catch (error) {
                showError("제목 변경에 실패했습니다", error);
                titleElement.textContent = currentTitle;
            }
        } else {
            titleElement.textContent = currentTitle;
        }
    };

    input.addEventListener("blur", saveTitle);
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            input.blur();
        } else if (e.key === "Escape") {
            titleElement.textContent = currentTitle;
            input.remove();
        }
    });

    titleElement.textContent = "";
    titleElement.appendChild(input);
    input.focus();
    input.select();
}

/**
 * 작업 상태 토글
 * @param {string} taskId - 작업 ID
 */
async function toggleTaskStatus(taskId) {
    const task = tasks.find((t) => String(t._id) === String(taskId));
    if (!task) return;

    const newStatus = task.status === "completed" ? "todo" : "completed";

    try {
        await apiPut(`/api/projects/${currentProject.id}/tasks/${taskId}`, { status: newStatus });
        await loadTasks(currentProject.id);
        generateMonthHeaders();
    } catch (error) {
        showError("상태 변경에 실패했습니다", error);
    }
}

/**
 * 작업 상세 정보 업데이트
 * @param {string} field - 업데이트할 필드명
 */
async function updateTaskDetail(field) {
    if (!selectedTask) return;

    const inputElement = getElement(`task${field.charAt(0).toUpperCase() + field.slice(1)}`);
    if (!inputElement) return;
    
    const value = inputElement.value;

    try {
        const updateData = {};
        if (field === "assignee") {
            updateData.assignee = value || null;
        } else if (field === "startDate") {
            updateData.startDate = value ? new Date(value).toISOString() : null;
        } else if (field === "dueDate") {
            updateData.dueDate = value ? new Date(value).toISOString() : null;
        } else if (field === "status") {
            updateData.status = value;
        }

        await apiPut(`/api/projects/${currentProject.id}/tasks/${selectedTask._id}`, updateData);

        await loadTasks(currentProject.id);
        generateMonthHeaders();
        
        if (selectedTask) {
            selectTask(selectedTask._id);
        }
    } catch (error) {
        showError("업데이트에 실패했습니다", error);
    }
}

/**
 * 담당자 선택 드롭다운 업데이트
 */
function updateAssigneeSelect() {
    const select = document.getElementById("taskAssignee");
    if (!select) return;
    
    const currentUser = getCurrentUser();
    if (!currentUser || !currentProject) return;
    
    const isOwnerCheck = String(currentUser.id) === String(currentProject.recruiterId);
    
    select.innerHTML = '<option value="">선택 안함</option>';
    
    if (participants.length === 0) {
        loadParticipants(currentProject.id).then(() => {
            updateAssigneeSelect();
        });
        return;
    }
    
    if (isOwnerCheck) {
        participants.forEach((p) => {
            const option = document.createElement("option");
            option.value = p._id;
            option.textContent = p.nickname || p.name || p.username;
            select.appendChild(option);
        });
    } else {
        const currentUserParticipant = participants.find((p) => String(p._id) === String(currentUser.id));
        if (currentUserParticipant) {
            const option = document.createElement("option");
            option.value = currentUserParticipant._id;
            option.textContent = currentUserParticipant.nickname || currentUserParticipant.name || currentUserParticipant.username;
            select.appendChild(option);
        }
    }
}
