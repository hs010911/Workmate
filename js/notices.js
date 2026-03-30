/**
 * @fileoverview 사용자용 공지 목록 (공개 GET /api/notices)
 */
document.addEventListener("DOMContentLoaded", () => {
    loadNoticesPublic();
});

async function loadNoticesPublic() {
    const container = document.getElementById("noticesList");
    if (!container) return;

    try {
        const data = await apiGet("/api/notices");
        const notices = data.notices || [];

        if (notices.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="display: block; padding: 2rem; text-align: center; color: #6b7280;">
                    <p>등록된 공지사항이 없습니다.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = `
            <table class="admin-table public-table table-text-wrap" style="width: 100%;">
                <thead>
                    <tr>
                        <th style="width: 80px;">No.</th>
                        <th>제목</th>
                        <th style="width: 120px;">작성자</th>
                        <th style="width: 140px;">작성일</th>
                    </tr>
                </thead>
                <tbody>
                    ${notices
                        .map((notice, index) => {
                            const no = index + 1;
                            const title = notice.title || "";
                            const author =
                                notice.author && (notice.author.nickname || notice.author.username)
                                    ? (notice.author.nickname || notice.author.username)
                                    : "관리자";
                            const createdAt = notice.createdAt ? formatDate(notice.createdAt) : "";
                            const isImportant = notice.isImportant;
                            const rowId = notice._id || `notice-${index}`;
                            const rowBg = isImportant ? "background: #f3f4f6;" : "";

                            return `
                                <tr class="notice-row" data-notice-id="${rowId}" onclick="toggleNotice('${rowId}')" style="cursor: pointer; ${rowBg}">
                                    <td>${no}</td>
                                    <td>
                                        ${isImportant ? '<span style="color:#b91c1c; font-weight:600; margin-right:0.5rem;">[중요]</span>' : ""}
                                        ${escapeHtml(title)}
                                        <div id="noticeContent-${rowId}" class="notice-content" style="display:none; margin-top:0.5rem; color:#4b5563; font-size:0.95rem;">
                                            ${escapeHtml(notice.content || "")}
                                        </div>
                                    </td>
                                    <td>${escapeHtml(author)}</td>
                                    <td>${createdAt}</td>
                                </tr>
                            `;
                        })
                        .join("")}
                </tbody>
            </table>
        `;
    } catch (error) {
        console.error("공지사항 로드 실패:", error);
        container.innerHTML = `
            <div class="empty-state" style="display: block; padding: 2rem; text-align: center; color: #6b7280;">
                <p>공지사항을 불러오는데 실패했습니다.</p>
            </div>
        `;
    }
}

function toggleNotice(id) {
    const content = document.getElementById(`noticeContent-${id}`);
    if (!content) return;
    const isOpen = content.style.display === "block";
    content.style.display = isOpen ? "none" : "block";
}

