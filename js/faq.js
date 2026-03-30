/**
 * @fileoverview 사용자용 FAQ (공개 GET /api/faqs)
 * @description 공개 FAQ 목록 렌더링(번호표시/아코디언).
 */
document.addEventListener("DOMContentLoaded", () => {
    loadFaqs();
});

async function loadFaqs() {
    const container = document.getElementById("faqList");
    if (!container) return;

    try {
        const data = await apiGet("/api/faqs");
        const faqs = data.faqs || [];

        if (faqs.length === 0) {
            container.innerHTML = `
                <div class="empty-state" style="display: block; padding: 2rem; text-align: center; color: #6b7280;">
                    <p>등록된 FAQ가 없습니다.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = faqs
            .map((faq, index) => {
                const question = faq.question || "";
                const answer = faq.answer || "";
                const createdAt = faq.createdAt ? formatDate(faq.createdAt) : "";
                const displayNum = index + 1;
                const id = faq._id || `faq-${index}`;

                return `
                    <article class="faq-item" data-faq-id="${id}">
                        <button type="button" class="faq-question" onclick="toggleFaq('${id}')">
                            <div class="faq-question-inner">
                                <span class="faq-q-num">Q${displayNum}</span>
                                <span class="faq-q-text">${escapeHtml(question)}</span>
                            </div>
                            <span id="faqToggleIcon-${id}" class="faq-toggle-icon" style="color: #9ca3af; font-size: 0.9rem; flex-shrink: 0;">▼</span>
                        </button>
                        <div id="faqAnswer-${id}" class="faq-answer" style="display: none;">
                            <p>${escapeHtml(answer)}</p>
                            ${createdAt ? `<p style="margin-top: 0.75rem; font-size: 0.8rem; color: #9ca3af;">등록일: ${formatDate(faq.createdAt)}</p>` : ""}
                        </div>
                    </article>
                `;
            })
            .join("");
    } catch (error) {
        console.error("FAQ 로드 실패:", error);
        container.innerHTML = `
            <div class="empty-state" style="display: block; padding: 2rem; text-align: center; color: #6b7280;">
                <p>FAQ를 불러오는데 실패했습니다.</p>
            </div>
        `;
    }
}

function toggleFaq(id) {
    const answer = document.getElementById(`faqAnswer-${id}`);
    const icon = document.getElementById(`faqToggleIcon-${id}`);
    if (!answer) return;

    const isOpen = answer.style.display === "block";
    answer.style.display = isOpen ? "none" : "block";
    if (icon) icon.textContent = isOpen ? "▼" : "▲";
}

