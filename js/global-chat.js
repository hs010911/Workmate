/**
 * @fileoverview cap_005_1 — 프로젝트 찾기 등 전역 플로팅 팀 채팅
 */
let globalChatSocket = null;
let globalChatProjectId = null;
const globalChatMessageIds = new Set();

function globalChatEscape(text) {
  if (!text) return "";
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function renderGlobalChatMessage(msg) {
  const wrap = document.createElement("div");
  wrap.className = `chat-message chat-message--${msg.type || "user"}`;
  wrap.dataset.messageId = msg.id;

  const who =
    msg.type === "github_push"
      ? msg.githubMeta?.pusher || "GitHub"
      : msg.author?.nickname || "팀원";

  let html = `<div class="chat-message-head"><strong>${globalChatEscape(who)}</strong>`;
  html += `<span class="chat-message-time">${formatGlobalChatTime(msg.createdAt)}</span></div>`;
  html += `<p class="chat-message-body">${globalChatEscape(msg.body)}</p>`;

  if (msg.summary) {
    html += `<p class="chat-message-summary">요약: ${globalChatEscape(msg.summary)}</p>`;
  }

  if (msg.linkedTask?.title) {
    const taskUrl = msg.taskPageUrl || `#`;
    html += `<p class="chat-linked-task">작업: <a href="${taskUrl}" target="_blank" rel="noopener"><strong>${globalChatEscape(msg.linkedTask.title)}</strong></a></p>`;
  }

  const links = [];
  if (msg.githubUrl) links.push(`<a href="${msg.githubUrl}" target="_blank" rel="noopener">GitHub</a>`);
  if (links.length) {
    html += `<div class="chat-message-links">${links.join(" · ")}</div>`;
  }

  wrap.innerHTML = html;
  return wrap;
}

function formatGlobalChatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function ensureGlobalChatDom() {
  if (document.getElementById("globalChatFab")) return;

  const root = document.createElement("div");
  root.id = "globalChatRoot";
  root.innerHTML = `
    <button type="button" id="globalChatFab" class="global-chat-fab" aria-label="팀 채팅 열기" title="팀 채팅">💬</button>
    <div id="globalChatPanel" class="global-chat-panel" aria-hidden="true">
      <div class="global-chat-header">
        <strong>팀 채팅</strong>
        <div class="global-chat-header-actions">
          <button type="button" id="globalChatMaximize" class="global-chat-icon-btn" title="최대화" aria-label="최대화">⛶</button>
          <button type="button" id="globalChatClose" class="global-chat-icon-btn" title="닫기" aria-label="닫기">×</button>
        </div>
      </div>
      <div class="global-chat-body">
        <aside class="global-chat-projects" id="globalChatProjects"></aside>
        <section class="global-chat-main">
          <div id="globalChatMessages" class="global-chat-messages"></div>
          <form id="globalChatForm" class="global-chat-form">
            <input type="file" id="globalChatFile" class="global-chat-file" title="파일 첨부" />
            <input type="text" id="globalChatInput" class="form-input" placeholder="메시지 입력..." autocomplete="off" />
            <button type="submit" class="btn-primary btn-sm">전송</button>
          </form>
        </section>
      </div>
    </div>
  `;
  document.body.appendChild(root);

  root.addEventListener("click", (e) => {
    if (e.target.closest("#globalChatFab")) {
      e.preventDefault();
      e.stopPropagation();
      openGlobalChatPanel();
      return;
    }
    if (e.target.closest("#globalChatClose")) {
      e.preventDefault();
      e.stopPropagation();
      closeGlobalChatPanel();
      return;
    }
    if (e.target.closest("#globalChatMaximize")) {
      e.preventDefault();
      e.stopPropagation();
      toggleGlobalChatMaximize();
    }
  });

  document.getElementById("globalChatForm").addEventListener("submit", sendGlobalChatMessage);
}

function openGlobalChatPanel() {
  const panel = document.getElementById("globalChatPanel");
  const fab = document.getElementById("globalChatFab");
  if (!panel) return;
  panel.classList.add("is-open");
  panel.setAttribute("aria-hidden", "false");
  if (fab) fab.classList.add("is-hidden");
  loadGlobalChatProjects();
}

function closeGlobalChatPanel() {
  const panel = document.getElementById("globalChatPanel");
  const fab = document.getElementById("globalChatFab");
  if (panel) {
    panel.classList.remove("is-open", "global-chat-panel--maximized");
    panel.setAttribute("aria-hidden", "true");
  }
  if (fab) fab.classList.remove("is-hidden");
}

function toggleGlobalChatMaximize() {
  const panel = document.getElementById("globalChatPanel");
  if (panel) panel.classList.toggle("global-chat-panel--maximized");
}

async function loadGlobalChatProjects() {
  const list = document.getElementById("globalChatProjects");
  if (!list) return;
  list.innerHTML = "<p class='global-chat-hint'>불러오는 중…</p>";

  try {
    const data = await apiGet("/api/chat/projects");
    const projects = data.projects || [];
    if (!projects.length) {
      list.innerHTML = "<p class='global-chat-hint'>참여 중인 프로젝트가 없습니다.</p>";
      return;
    }
    list.innerHTML = projects
      .map(
        (p) =>
          `<button type="button" class="global-chat-project-btn" data-project-id="${p.id}">${globalChatEscape(p.title)}</button>`,
      )
      .join("");

    list.querySelectorAll(".global-chat-project-btn").forEach((btn) => {
      btn.addEventListener("click", () => selectGlobalChatProject(btn.dataset.projectId, btn));
    });

    const first = list.querySelector(".global-chat-project-btn");
    if (first && !globalChatProjectId) {
      selectGlobalChatProject(first.dataset.projectId, first);
    }
  } catch {
    list.innerHTML = "<p class='global-chat-hint'>목록을 불러오지 못했습니다.</p>";
  }
}

async function selectGlobalChatProject(projectId, btnEl) {
  if (!projectId) return;
  globalChatProjectId = projectId;
  globalChatMessageIds.clear();

  document.querySelectorAll(".global-chat-project-btn").forEach((b) => b.classList.remove("active"));
  if (btnEl) btnEl.classList.add("active");

  const box = document.getElementById("globalChatMessages");
  if (box) box.innerHTML = "<p class='global-chat-hint'>메시지 불러오는 중…</p>";

  try {
    const data = await apiGet(`/api/projects/${projectId}/chat/messages`);
    if (box) {
      box.innerHTML = "";
      (data.messages || []).forEach((m) => {
        globalChatMessageIds.add(String(m.id));
        box.appendChild(renderGlobalChatMessage(m));
      });
      box.scrollTop = box.scrollHeight;
    }
  } catch {
    if (box) box.innerHTML = "<p class='global-chat-hint'>채팅을 불러오지 못했습니다.</p>";
  }

  connectGlobalChatSocket(projectId);
}

function connectGlobalChatSocket(projectId) {
  if (typeof io === "undefined" || !projectId) return;
  const token = sessionStorage.getItem("token");
  if (!token) return;

  if (globalChatSocket) {
    if (globalChatProjectId) globalChatSocket.emit("project:leave", globalChatProjectId);
    globalChatSocket.disconnect();
  }

  globalChatSocket = io(window.apiBase, { auth: { token } });
  globalChatSocket.on("connect", () => {
    globalChatSocket.emit("project:join", projectId);
  });
  globalChatSocket.on("chat:message", (msg) => {
    const pid = String(msg.projectId || msg.project || "");
    if (globalChatProjectId && pid !== String(globalChatProjectId)) return;
    const box = document.getElementById("globalChatMessages");
    if (!box || !msg?.id) return;
    if (globalChatMessageIds.has(String(msg.id))) return;
    globalChatMessageIds.add(String(msg.id));
    box.appendChild(renderGlobalChatMessage(msg));
    box.scrollTop = box.scrollHeight;
  });
}

async function sendGlobalChatMessage(event) {
  event.preventDefault();
  if (!globalChatProjectId) {
    showModal("알림", "먼저 프로젝트를 선택해주세요.");
    return;
  }

  const input = document.getElementById("globalChatInput");
  const fileInput = document.getElementById("globalChatFile");
  let body = input?.value?.trim() || "";

  if (fileInput?.files?.length) {
    const file = fileInput.files[0];
    if (file.size > 500 * 1024) {
      showModal("알림", "파일은 500KB 이하만 첨부할 수 있습니다.");
      return;
    }
    if (file.type.startsWith("text/") || file.name.endsWith(".md") || file.name.endsWith(".json")) {
      const text = await file.text();
      body = (body ? `${body}\n\n` : "") + `[파일: ${file.name}]\n${text.slice(0, 2000)}`;
    } else {
      body = (body ? `${body}\n` : "") + `[파일 첨부: ${file.name} (${Math.round(file.size / 1024)}KB)]`;
    }
    fileInput.value = "";
  }

  if (!body) return;

  try {
    const res = await apiPost(`/api/projects/${globalChatProjectId}/chat/messages`, { body });
    if (input) input.value = "";
    if (res.message) {
      const box = document.getElementById("globalChatMessages");
      if (box && !globalChatMessageIds.has(String(res.message.id))) {
        globalChatMessageIds.add(String(res.message.id));
        box.appendChild(renderGlobalChatMessage(res.message));
        box.scrollTop = box.scrollHeight;
      }
    }
  } catch (error) {
    showError("전송 실패", error);
  }
}

function initGlobalChat() {
  const token = sessionStorage.getItem("token");
  if (!token) return;
  ensureGlobalChatDom();
}

document.addEventListener("DOMContentLoaded", initGlobalChat);
