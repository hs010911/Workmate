/**
 * @fileoverview 고객센터 — 문의 작성·내 문의 목록·상세 (인증 필요)
 */
let currentMySupportPage = 1;

document.addEventListener("DOMContentLoaded", () => {
    if (!isLoggedIn()) {
        const tbody = document.getElementById("mySupportTableBody");
        if (tbody) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">문의 내역을 확인하려면 로그인 해주세요.</td></tr>';
        }
        const submitBtn = document.getElementById("supportSubmitBtn");
        if (submitBtn) {
            submitBtn.addEventListener("click", () => {
                showModal("알림", "문의하기 기능은 로그인 후 이용 가능합니다.", () => {
                    window.location.href = "login.html";
                });
            });
        }
        return;
    }

    const submitBtn = document.getElementById("supportSubmitBtn");
    if (submitBtn) {
        submitBtn.addEventListener("click", handleSupportSubmit);
    }

    loadMySupportTickets();
});

async function handleSupportSubmit() {
    const titleEl = document.getElementById("supportTitle");
    const contentEl = document.getElementById("supportContent");
    const title = titleEl ? titleEl.value.trim() : "";
    const content = contentEl ? contentEl.value.trim() : "";

    if (!title || !content) {
        showModal("알림", "제목과 내용을 입력해주세요.");
        return;
    }

    try {
        const btn = document.getElementById("supportSubmitBtn");
        if (btn) btn.disabled = true;

        await apiPost("/api/support", { title, content });

        showModal("알림", "문의가 등록되었습니다. 답변은 이 페이지의 내 문의 내역에서 확인하실 수 있습니다.", () => {
            if (titleEl) titleEl.value = "";
            if (contentEl) contentEl.value = "";
            currentMySupportPage = 1;
            loadMySupportTickets();
        });
    } catch (error) {
        showError("문의 등록 실패", error);
    } finally {
        const btn = document.getElementById("supportSubmitBtn");
        if (btn) btn.disabled = false;
    }
}

async function loadMySupportTickets() {
    try {
        const params = new URLSearchParams({ page: currentMySupportPage, limit: 10 });
        const data = await apiGet(`/api/support/my?${params}`);
        renderMySupportTable(data.tickets, data.page, data.limit, data.total);
    } catch (error) {
        showError("문의 내역 로드 실패", error);
    }
}

function renderMySupportTable(tickets, page, limit, total) {
    const tbody = document.getElementById("mySupportTableBody");
    if (!tbody) return;

    if (!tickets || tickets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">등록된 문의가 없습니다.</td></tr>';
        document.getElementById("mySupportPagination").innerHTML = "";
        return;
    }

    const startIndex = (page - 1) * limit;
    tbody.innerHTML = tickets
        .map((ticket, idx) => {
            const index = startIndex + idx + 1;
            const createdAt = ticket.createdAt ? formatDate(ticket.createdAt) : "-";
            const statusText = ticket.status === "answered" ? "답변완료" : "미확인";

            return `
                <tr>
                    <td>${index}</td>
                    <td>${escapeHtml(ticket.title)}</td>
                    <td>${createdAt}</td>
                    <td>${statusText}</td>
                    <td><button class="btn-primary btn-sm" onclick="openMySupportDetail('${ticket._id}')">상세</button></td>
                </tr>
            `;
        })
        .join("");

    renderMySupportPagination(total, page, limit);
}

function renderMySupportPagination(total, page, limit) {
    const pagination = document.getElementById("mySupportPagination");
    if (!pagination) return;

    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) {
        pagination.innerHTML = "";
        return;
    }

    let html = "";
    if (page > 1) {
        html += `<button class="btn-secondary btn-sm" onclick="currentMySupportPage=${page - 1}; loadMySupportTickets();">이전</button> `;
    }
    html += `<span>${page} / ${totalPages}</span>`;
    if (page < totalPages) {
        html += ` <button class="btn-secondary btn-sm" onclick="currentMySupportPage=${page + 1}; loadMySupportTickets();">다음</button>`;
    }

    pagination.innerHTML = html;
}

async function openMySupportDetail(ticketId) {
    try {
        const data = await apiGet(`/api/support/${ticketId}`);
        const ticket = data.ticket;
        if (!ticket) return;

        const createdAt = ticket.createdAt ? formatDate(ticket.createdAt) : "-";
        const answeredAt = ticket.answeredAt ? formatDate(ticket.answeredAt) : "-";
        const statusText = ticket.status === "answered" ? "답변완료" : "미확인";

        const bodyHtml = `
            <div class="support-detail-body">
                <p><strong>작성일:</strong> ${createdAt}</p>
                <p><strong>상태:</strong> ${statusText}</p>
                ${ticket.answeredAt ? `<p><strong>답변일:</strong> ${answeredAt}</p>` : ""}
                <p><strong>제목:</strong> ${escapeHtml(ticket.title)}</p>
                <p><strong>문의 내용:</strong><br>${escapeHtml(ticket.content)}</p>
                <hr style="margin: 1rem 0;">
                <p><strong>관리자 답변:</strong><br>${ticket.answer ? escapeHtml(ticket.answer) : "아직 답변이 등록되지 않았습니다."}</p>
            </div>
        `;

        const bodyEl = document.getElementById("mySupportDetailBody");
        if (bodyEl) bodyEl.innerHTML = bodyHtml;

        document.getElementById("mySupportDetailModal").classList.add("active");
    } catch (error) {
        showError("문의 상세 로드 실패", error);
    }
}

function closeMySupportDetailModal() {
    const modal = document.getElementById("mySupportDetailModal");
    if (modal) modal.classList.remove("active");
}

