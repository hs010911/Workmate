/**
 * @fileoverview WorkMate 공통 유틸리티
 * @description 날짜 포맷, 프로젝트/지원 상태 문구, DOM, 로그인 상태,
 *              모달(showModal/showConfirm/showPrompt), 에러 표시
 * @depends 전역: document, localStorage, sessionStorage
 */

// 날짜 관련

/**
 * 날짜 포맷팅 (한국어 형식)
 * @param {string|Date} dateString - 날짜 문자열 또는 Date 객체
 * @returns {string} 포맷된 날짜 문자열 또는 "-"
 */
function formatDate(dateString) {
    if (!dateString) return "-";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("ko-KR");
}

/**
 * 날짜를 YYYY-MM-DD 형식으로 변환 (input[type="date"]용)
 * @param {string|Date} dateString - 날짜 문자열 또는 Date 객체
 * @returns {string} YYYY-MM-DD 형식 문자열 또는 빈 문자열
 */
function formatDateForInput(dateString) {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";
    return date.toISOString().split("T")[0];
}

/**
 * 프로젝트 카테고리 코드 → 표시명
 * @param {string} [category]
 * @returns {string}
 */
function formatCategory(category) {
    const map = {
        web: "웹 개발",
        mobile: "모바일 앱",
        ai: "AI/ML",
        game: "게임",
        design: "디자인",
    };
    return map[category] || category || "기타";
}

/**
 * 년도와 월 계산 (년도가 넘어가는 경우 처리)
 * @param {number} currentMonth - 현재 월 (0-11)
 * @param {number} currentYear - 현재 년도
 * @param {number} offset - 월 오프셋
 * @returns {{year: number, month: number}} 계산된 년도와 월
 */
function calculateMonthYear(currentMonth, currentYear, offset) {
    const targetMonth = currentMonth + offset;
    const targetYear = currentYear + Math.floor(targetMonth / 12);
    const actualMonth = ((targetMonth % 12) + 12) % 12; // 음수 처리
    return { year: targetYear, month: actualMonth };
}

// 상태 텍스트 변환

/**
 * 프로젝트 상태 텍스트 변환
 * @param {string} status - 프로젝트 상태
 * @returns {string} 한국어 상태 텍스트
 */
function getStatusText(status) {
    const statusMap = {
        recruiting: "모집중",
        "in-progress": "진행중",
        completed: "완료",
        cancelled: "취소됨",
    };
    return statusMap[status] || status;
}

/**
 * 지원 상태 텍스트 변환
 * @param {string} status - 지원 상태
 * @returns {string} 한국어 상태 텍스트
 */
function getApplicationStatusText(status) {
    const statusMap = {
        pending: "대기중",
        approved: "승인됨",
        rejected: "거절됨",
    };
    return statusMap[status] || "대기중";
}

// DOM 유틸리티

/**
 * DOM 요소 가져오기 (안전)
 * @param {string} id - 요소 ID
 * @returns {HTMLElement|null} DOM 요소 또는 null
 */
function getElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`요소를 찾을 수 없습니다: ${id}`);
    }
    return element;
}

// 인증 관련

/**
 * 로그인 상태 확인
 * @returns {boolean} 로그인 여부
 */
function isLoggedIn() {
    return sessionStorage.getItem("user") !== null;
}

/**
 * 현재 사용자 정보 가져오기
 * @returns {Object|null} 사용자 정보 객체 또는 null
 */
function getCurrentUser() {
    const userStr = sessionStorage.getItem("user");
    if (!userStr) return null;
    try {
        return JSON.parse(userStr);
    } catch (e) {
        console.error("사용자 정보 파싱 오류:", e);
        return null;
    }
}

// 모달 관련

/**
 * 모달 생성 헬퍼 함수
 * @param {string} modalId - 모달 ID
 * @param {string} content - 모달 HTML 내용
 * @returns {HTMLElement} 모달 요소
 */
function createModal(modalId, content) {
    let modal = document.getElementById(modalId);
    if (!modal) {
        modal = document.createElement("div");
        modal.id = modalId;
        modal.className = "modal";
        modal.innerHTML = content;
        document.body.appendChild(modal);
    }
    return modal;
}

/**
 * 모달 닫기
 * @param {string} modalId - 모달 ID
 */
function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove("active");
    }
}

/**
 * 모달 표시 (alert 대체)
 * @param {string} title - 모달 제목
 * @param {string} message - 모달 메시지
 * @param {Function|null} onConfirm - 확인 버튼 클릭 시 실행할 함수
 */
function showModal(title, message, onConfirm = null) {
    const modalId = "commonModal";
    const content = `
        <div class="modal-content" onclick="event.stopPropagation()">
            <div class="modal-header">
                <h3 class="modal-title" id="commonModalTitle"></h3>
                <button class="modal-close" onclick="closeModal('${modalId}')">&times;</button>
            </div>
            <div id="commonModalBody" style="margin-bottom: 1.5rem;"></div>
            <div class="modal-actions">
                <button class="btn-primary" id="commonModalConfirm">확인</button>
            </div>
        </div>
    `;
    
    const modal = createModal(modalId, content);
    document.getElementById("commonModalTitle").textContent = title || "알림";
    document.getElementById("commonModalBody").innerHTML = message.replace(/\n/g, "<br>");
    
    const confirmBtn = document.getElementById("commonModalConfirm");
    confirmBtn.onclick = () => {
        closeModal(modalId);
        if (onConfirm) onConfirm();
    };
    
    modal.classList.add("active");
}

/**
 * 확인 모달 (confirm 대체)
 * @param {string} title - 모달 제목
 * @param {string} message - 모달 메시지
 * @param {Function} onConfirm - 확인 버튼 클릭 시 실행할 함수
 * @param {Function|null} onCancel - 취소 버튼 클릭 시 실행할 함수
 */
function showConfirmModal(title, message, onConfirm, onCancel = null) {
    const modalId = "confirmModal";
    const content = `
        <div class="modal-content" onclick="event.stopPropagation()">
            <div class="modal-header">
                <h3 class="modal-title" id="confirmModalTitle"></h3>
                <button class="modal-close" onclick="closeModal('${modalId}')">&times;</button>
            </div>
            <div id="confirmModalBody" style="margin-bottom: 1.5rem;"></div>
            <div class="modal-actions">
                <button class="btn-secondary" id="confirmModalCancel">취소</button>
                <button class="btn-primary" id="confirmModalConfirm">확인</button>
            </div>
        </div>
    `;
    
    const modal = createModal(modalId, content);
    document.getElementById("confirmModalTitle").textContent = title || "확인";
    document.getElementById("confirmModalBody").innerHTML = message.replace(/\n/g, "<br>");
    
    const confirmBtn = document.getElementById("confirmModalConfirm");
    const cancelBtn = document.getElementById("confirmModalCancel");
    
    confirmBtn.onclick = () => {
        closeModal(modalId);
        if (onConfirm) onConfirm();
    };
    
    cancelBtn.onclick = () => {
        closeModal(modalId);
        if (onCancel) onCancel();
    };
    
    modal.classList.add("active");
}

/**
 * 입력 모달 (prompt 대체)
 * @param {string} title - 모달 제목
 * @param {string} message - 모달 메시지
 * @param {string} defaultValue - 기본 입력값
 * @param {Function} onConfirm - 확인 버튼 클릭 시 실행할 함수 (입력값을 인자로 받음)
 * @param {Function|null} onCancel - 취소 버튼 클릭 시 실행할 함수
 */
function showPromptModal(title, message, defaultValue = "", onConfirm, onCancel = null) {
    const modalId = "promptModal";
    const content = `
        <div class="modal-content" onclick="event.stopPropagation()">
            <div class="modal-header">
                <h3 class="modal-title" id="promptModalTitle"></h3>
                <button class="modal-close" onclick="closeModal('${modalId}')">&times;</button>
            </div>
            <div id="promptModalBody" style="margin-bottom: 1rem;"></div>
            <div class="form-group">
                <input type="text" id="promptModalInput" class="form-input" style="width: 100%;">
            </div>
            <div class="modal-actions">
                <button class="btn-secondary" id="promptModalCancel">취소</button>
                <button class="btn-primary" id="promptModalConfirm">확인</button>
            </div>
        </div>
    `;
    
    const modal = createModal(modalId, content);
    document.getElementById("promptModalTitle").textContent = title || "입력";
    document.getElementById("promptModalBody").innerHTML = message.replace(/\n/g, "<br>");
    
    const input = document.getElementById("promptModalInput");
    input.value = defaultValue;
    
    const confirmBtn = document.getElementById("promptModalConfirm");
    const cancelBtn = document.getElementById("promptModalCancel");
    
    const handleConfirm = () => {
        const value = input.value;
        closeModal(modalId);
        if (onConfirm) onConfirm(value);
    };
    
    confirmBtn.onclick = handleConfirm;
    input.addEventListener("keypress", (e) => {
        if (e.key === "Enter") handleConfirm();
    });
    
    cancelBtn.onclick = () => {
        closeModal(modalId);
        if (onCancel) onCancel();
    };
    
    modal.classList.add("active");
    setTimeout(() => input.focus(), 100);
}

/**
 * 확인 다이얼로그 래퍼 (Promise 기반)
 * @param {string} message - 확인 메시지
 * @returns {Promise<boolean>} 확인 여부
 */
function confirmAction(message) {
    return new Promise((resolve) => {
        showConfirmModal("확인", message, () => resolve(true), () => resolve(false));
    });
}

// 에러 처리

/**
 * 에러 메시지 표시
 * @param {string} message - 에러 메시지
 * @param {Error|string|null} error - 에러 객체 또는 에러 메시지
 */
function showError(message, error = null) {
    console.error(message, error);
    const errorMessage = message + (error ? `: ${error.message || error}` : "");
    showModal("오류", errorMessage);
}

// 하위 호환성

function closeCommonModal() {
    closeModal("commonModal");
}

function closeConfirmModal() {
    closeModal("confirmModal");
}

/** @deprecated promptModal 닫기 — closeModal("promptModal")과 동일 */
function closePromptModal() {
    closeModal("promptModal");
}
