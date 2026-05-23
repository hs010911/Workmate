/**
 * @fileoverview 프로젝트 팀 채팅 + Socket.io + GitHub 알림
 */
let projectChatSocket = null;
const chatMessageIds = new Set();

function getWebhookHintUrl() {
  const base = (window.apiBase || "").replace(/\/+$/, "");
  return `${base}/api/github/webhook`;
}

function renderChatMessage(msg, isOwner) {
  const wrap = document.createElement("div");
  wrap.className = `chat-message chat-message--${msg.type || "user"}`;
  wrap.dataset.messageId = msg.id;
  if (msg.reviewCompleted) wrap.classList.add("chat-message--done");

  const who =
    msg.type === "github_push"
      ? (msg.githubMeta?.pusher || "GitHub")
      : msg.author?.nickname || "팀원";

  let html = `<div class="chat-message-head"><strong>${escapeHtml(who)}</strong>`;
  html += `<span class="chat-message-time">${formatChatTime(msg.createdAt)}</span></div>`;
  html += `<p class="chat-message-body">${escapeHtml(msg.body)}</p>`;

  if (msg.summary) {
    const summaryLabel = msg.summaryViaGroq ? "AI 요약 (Groq)" : "요약";
    html += `<p class="chat-message-summary">${summaryLabel}: ${escapeHtml(msg.summary)}</p>`;
  }

  if (msg.linkedTask?.title) {
    html += `<p class="chat-linked-task">연결 작업: <strong>${escapeHtml(msg.linkedTask.title)}</strong> (${escapeHtml(msg.linkedTask.status || "")})</p>`;
  } else if (msg.githubMeta?.matchedTaskTitle) {
    html += `<p class="chat-linked-task">추정 작업: <strong>${escapeHtml(msg.githubMeta.matchedTaskTitle)}</strong></p>`;
  }

  const links = [];
  if (msg.taskPageUrl) {
    links.push(`<a href="${escapeHtml(msg.taskPageUrl)}" class="chat-link">작업 페이지</a>`);
  }
  if (msg.githubUrl) {
    links.push(`<a href="${escapeHtml(msg.githubUrl)}" target="_blank" rel="noopener" class="chat-link">GitHub</a>`);
  }

  if (links.length || (msg.linkedTask && isOwner)) {
    html += `<div class="chat-message-links">${links.join(" ")}`;
    if (msg.linkedTask && isOwner && !msg.reviewCompleted) {
      html += ` <button type="button" class="btn-primary btn-sm chat-complete-btn" data-msg-id="${msg.id}">완료</button>`;
    } else if (msg.reviewCompleted) {
      html += ` <span class="chat-done-label">검수 완료</span>`;
    }
    html += `</div>`;
  }

  wrap.innerHTML = html;
  const btn = wrap.querySelector(".chat-complete-btn");
  if (btn) {
    btn.addEventListener("click", () => completeChatReview(msg.id));
  }
  return wrap;
}

function formatChatTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleString("ko-KR", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function upsertChatMessage(msg) {
  const box = document.getElementById("projectChatMessages");
  if (!box || !msg?.id) return;

  const existing = box.querySelector(`[data-message-id="${msg.id}"]`);
  const ctx = window.collaborationContext || {};
  const el = renderChatMessage(msg, !!ctx.isOwner);

  if (existing) {
    existing.replaceWith(el);
  } else {
    if (chatMessageIds.has(String(msg.id))) return;
    chatMessageIds.add(String(msg.id));
    box.appendChild(el);
    box.scrollTop = box.scrollHeight;
  }
}

async function loadChatTaskOptions(projectId) {
  const select = document.getElementById("projectChatTaskSelect");
  if (!select || !projectId) return;

  try {
    const data = await apiGet(`/api/projects/${projectId}/chat/task-options`);
    const tasks = data.tasks || [];
    select.innerHTML = '<option value="">작업 연결 (선택)</option>';
    tasks.forEach((t) => {
      const opt = document.createElement("option");
      opt.value = t.id;
      opt.textContent = `${t.title} (${t.status})`;
      select.appendChild(opt);
    });
  } catch {
    /* ignore */
  }
}

async function loadProjectChat(projectId) {
  const box = document.getElementById("projectChatMessages");
  if (!box || !projectId) return;

  chatMessageIds.clear();

  try {
    const data = await apiGet(`/api/projects/${projectId}/chat/messages`);
    box.innerHTML = "";
    (data.messages || []).forEach((m) => upsertChatMessage(m));

    const repoInput = document.getElementById("projectGithubRepo");
    if (repoInput) repoInput.value = data.githubRepoFullName || "";

    const hint = document.getElementById("webhookUrlHint");
    if (hint) hint.textContent = getWebhookHintUrl();

    await loadChatTaskOptions(projectId);
  } catch (error) {
    box.innerHTML = `<p class="chat-error">채팅을 불러오지 못했습니다.</p>`;
    console.error(error);
  }
}

function connectProjectChatSocket(projectId) {
  if (typeof io === "undefined" || !projectId) return;
  const token = sessionStorage.getItem("token");
  if (!token) return;

  if (projectChatSocket) {
    projectChatSocket.emit("project:leave", projectId);
    projectChatSocket.disconnect();
  }

  projectChatSocket = io(window.apiBase, { auth: { token } });
  projectChatSocket.on("connect", () => {
    projectChatSocket.emit("project:join", projectId);
  });
  projectChatSocket.on("chat:message", (msg) => {
    upsertChatMessage(msg);
  });
  projectChatSocket.on("task:updated", () => {
    if (typeof loadTasks === "function" && window.collaborationContext?.projectId) {
      loadTasks(window.collaborationContext.projectId);
    }
    loadChatTaskOptions(window.collaborationContext?.projectId);
  });
}

async function initProjectChat(projectId) {
  if (!projectId) return;
  await loadProjectChat(projectId);
  connectProjectChatSocket(projectId);

  const setup = document.getElementById("chatGithubSetup");
  if (setup && window.collaborationContext?.isOwner) {
    setup.style.display = "flex";
  }
}

async function sendProjectChatMessage(event) {
  event.preventDefault();
  const projectId = window.collaborationContext?.projectId;
  const input = document.getElementById("projectChatInput");
  const taskSelect = document.getElementById("projectChatTaskSelect");
  if (!projectId || !input) return;
  const body = input.value.trim();
  if (!body) return;

  const linkedTaskId = taskSelect?.value || "";

  try {
    const res = await apiPost(`/api/projects/${projectId}/chat/messages`, {
      body,
      linkedTaskId: linkedTaskId || undefined,
    });
    input.value = "";
    if (taskSelect) taskSelect.value = "";
    if (res.message) upsertChatMessage(res.message);
  } catch (error) {
    showError("전송 실패", error);
  }
}

async function saveProjectGithubRepo() {
  const projectId = window.collaborationContext?.projectId;
  const repo = document.getElementById("projectGithubRepo")?.value?.trim() || "";
  if (!projectId) return;
  try {
    await apiPut(`/api/projects/${projectId}/github-repo`, { githubRepoFullName: repo });
    showModal("알림", "GitHub 저장소가 연결되었습니다. 언어 비율이 동기화됩니다.");
  } catch (error) {
    showError("저장 실패", error);
  }
}

async function completeChatReview(messageId) {
  const projectId = window.collaborationContext?.projectId;
  if (!projectId || !messageId) return;
  if (!(await confirmAction("연결된 작업을 완료 처리하시겠습니까?"))) return;
  try {
    const res = await apiPost(`/api/projects/${projectId}/chat/messages/${messageId}/complete`, {});
    if (res.message) upsertChatMessage(res.message);
  } catch (error) {
    showError("완료 처리 실패", error);
  }
}
