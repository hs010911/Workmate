/**
 * @fileoverview projects-create.html — 새 프로젝트 등록 폼
 */

document.addEventListener("DOMContentLoaded", () => {
    if (!isLoggedIn()) {
        showModal("알림", "로그인이 필요합니다.", () => {
            window.location.href = "login.html";
        });
        return;
    }

    const form = document.getElementById("projectCreateForm");
    if (!form) return;

    form.addEventListener("submit", handleFormSubmit);

    const deadlineInput = document.getElementById("deadline");
    if (deadlineInput) {
        // 오늘은 바로 기간 만료가 되어 선택 불가하도록 내일로 설정
        const d = new Date();
        d.setDate(d.getDate() + 1);
        const tomorrow = d.toISOString().split("T")[0];
        deadlineInput.setAttribute("min", tomorrow);
    }
});

/**
 * 폼 제출 처리
 * @param {Event} e - 폼 제출 이벤트
 */
async function handleFormSubmit(e) {
    e.preventDefault();

    const form = e.target;
    const formData = new FormData(form);
    const tags = formData.get("tags")
        ? formData.get("tags").split(",").map((tag) => tag.trim()).filter((tag) => tag)
        : [];

    const projectData = {
        title: formData.get("title"),
        description: formData.get("description"),
        category: formData.get("category"),
        maxParticipants: parseInt(formData.get("maxParticipants"), 10),
        deadline: formData.get("deadline"),
        requirements: formData.get("requirements"),
        tags: tags,
    };

    try {
        await apiPost("/api/projects", projectData);
        showModal("알림", "프로젝트가 성공적으로 등록되었습니다!", () => {
            window.location.href = "projects.html";
        });
    } catch (error) {
        console.error("프로젝트 등록 실패:", error);
        showError("프로젝트 등록에 실패했습니다", error);
    }
}
