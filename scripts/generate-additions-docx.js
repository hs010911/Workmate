/**
 * WorkGather 추가 구현 보고서 (.docx) — 주요 코드 중심
 * 실행: node scripts/generate-additions-docx.js
 */
const fs = require("fs");
const path = require("path");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
  BorderStyle,
} = require("docx");

function h1(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 180 } });
}
function h2(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_2, spacing: { before: 260, after: 100 } });
}
function h3(text) {
  return new Paragraph({ text, heading: HeadingLevel.HEADING_3, spacing: { before: 180, after: 60 } });
}
function p(text) {
  return new Paragraph({ children: [new TextRun({ text })], spacing: { after: 100 } });
}
function fileLabel(path) {
  return new Paragraph({
    spacing: { before: 120, after: 40 },
    children: [new TextRun({ text: path, bold: true, color: "2563EB", size: 20 })],
  });
}
function code(lines) {
  const text = (Array.isArray(lines) ? lines : [lines]).join("\n");
  return new Paragraph({
    spacing: { before: 40, after: 140 },
    border: {
      top: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      left: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
      right: { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" },
    },
    shading: { fill: "F8FAFC" },
    children: [new TextRun({ text, font: "Consolas", size: 17 })],
  });
}

const doc = new Document({
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 300 },
          children: [new TextRun({ text: "WorkGather 추가 구현 보고서", bold: true, size: 36 })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 400 },
          children: [new TextRun({ text: "(주요 코드 중심)", size: 24, color: "666666" })],
        }),
        p("본 문서는 기존 보고서 이후 추가·보완된 기능별 구현 흐름과 핵심 소스 코드를 정리합니다."),

        // ─── 1. GitHub → AI 요약 ───
        h1("1. GitHub Webhook → Diff → Groq AI → 팀 채팅"),
        p("GitHub push/PR 병합 시 Webhook을 받아 diff를 조회하고, Groq로 한 줄 요약한 뒤 MongoDB에 저장하고 Socket.io로 실시간 전송합니다."),

        h3("① Webhook 수신 (collaboration.js)"),
        fileLabel("project-management-backend/routes/collaboration.js"),
        code([
          "app.post('/api/github/webhook', async (req, res) => {",
          "  const event = req.headers['x-github-event'];",
          "  if (event === 'ping') return res.json({ ok: true, message: 'pong' });",
          "  // GITHUB_WEBHOOK_SECRET 있으면 HMAC sha256 서명 검증",
          "  const repoFull = req.body.repository?.full_name;",
          "  const project = await Project.findOne({ githubRepoFullName: repoFull });",
          "  // push / pull_request(merged) → processGithubActivity() 호출",
          "});",
        ]),

        h3("② diff 조회 (githubDiff.js)"),
        fileLabel("project-management-backend/lib/githubDiff.js"),
        code([
          "// push: compare/{before}...{after} API → files[].patch",
          "async function fetchPushDiff(repoFull, payload) {",
          "  const { before, after, commits } = payload;",
          "  if (before && after && !/^0+$/.test(before)) {",
          "    const data = await githubGetJson(",
          "      `https://api.github.com/repos/${repoFull}/compare/${before}...${after}`);",
          "    return buildExcerptFromFiles(data?.files);  // 최대 8파일, 6KB",
          "  }",
          "  const lastSha = commits.length ? commits[commits.length - 1].id : after;",
          "  return fetchCommitDiff(repoFull, lastSha);",
          "}",
        ]),

        h3("③ Groq AI 요약 (aiSummary.js)"),
        fileLabel("project-management-backend/lib/aiSummary.js"),
        code([
          "async function summarizeCommitMessages(messages, skillDelta, diffExcerpt) {",
          "  const userParts = [];",
          "  if (text.trim()) userParts.push(`커밋 메시지:\\n${text}`);",
          "  if (diff)       userParts.push(`변경 내용(diff):\\n${diff}`);",
          "  if (skills)     userParts.push(`변경 스택: ${skills}`);",
          "",
          "  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {",
          "    body: JSON.stringify({",
          "      model: 'llama-3.1-8b-instant',",
          "      messages: [",
          "        { role: 'system', content: 'diff가 있으면 커밋 메시지보다 diff 우선...' },",
          "        { role: 'user', content: userParts.join('\\n\\n') },",
          "      ],",
          "    }),",
          "  });",
          "  return { summary: line, viaGroq: true, usedDiff: Boolean(diff) };",
          "}",
        ]),

        h3("④ 채팅 저장 + 실시간 브로드캐스트 (githubWebhook.js)"),
        fileLabel("project-management-backend/lib/githubWebhook.js"),
        code([
          "async function processGithubActivity({ project, payload, user, User, io, eventLabel }) {",
          "  const skillDelta = skillsFromPushPayload(payload);",
          "  diffExcerpt = eventLabel === 'merge'",
          "    ? await fetchMergeDiff(repoFull, payload)",
          "    : await fetchPushDiff(repoFull, payload);",
          "",
          "  const matchedTask = matchTaskFromGithubPayload(tasks, payload, diffExcerpt);",
          "  const { summary, viaGroq, usedDiff } = await summarizeCommitMessages(",
          "    commitMessages, skillDelta, diffExcerpt);",
          "",
          "  const chatMsg = await ProjectChatMessage.create({",
          "    project: project._id, type: 'github_push', body, summary,",
          "    githubUrl: compareUrl, linkedTask: matchedTask?._id,",
          "    githubMeta: { summaryViaGroq, summaryUsedDiff: usedDiff, ... },",
          "  });",
          "",
          "  io.to(`project:${project._id}`).emit('chat:message', formatMessage(populated));",
          "}",
        ]),

        h3("⑤ 프론트 — 채팅 수신 (project-chat.js)"),
        fileLabel("js/project-chat.js"),
        code([
          "projectChatSocket = io(window.apiBase, { auth: { token } });",
          "projectChatSocket.on('connect', () => {",
          "  projectChatSocket.emit('project:join', projectId);",
          "});",
          "projectChatSocket.on('chat:message', (msg) => { upsertChatMessage(msg); });",
          "",
          "// renderChatMessage — summary, linkedTask, GitHub 링크 표시",
          "if (msg.summary) {",
          "  html += `<p class=\"chat-message-summary\">요약: ${msg.summary}</p>`;",
          "}",
        ]),

        // ─── 2. Skill-DNA ───
        h1("2. Skill-DNA (Chart.js + GitHub 기여 집계)"),
        p("GitHub push 시 파일 확장자별 스택을 집계하고, 프로필에 레이더 차트·배지를 표시합니다."),

        h3("① push payload → 스택 집계 (githubSkills.js)"),
        fileLabel("project-management-backend/lib/githubSkills.js"),
        code([
          "const EXT_TO_SKILL = { js: 'JavaScript', tsx: 'React', md: '문서', ... };",
          "",
          "function skillsFromPushPayload(payload) {",
          "  const counts = {};",
          "  for (const commit of payload.commits || []) {",
          "    const paths = [...commit.added, ...commit.modified, ...commit.removed];",
          "    for (const p of paths) {",
          "      const skill = skillFromPath(p);  // 확장자 → 스택명",
          "      if (skill) counts[skill] = (counts[skill] || 0) + 1;",
          "    }",
          "  }",
          "  return counts;",
          "}",
        ]),

        h3("② 레이더 차트 렌더 (skill-dna.js)"),
        fileLabel("js/skill-dna.js"),
        code([
          "skillDnaChartInstance = new Chart(canvas, {",
          "  type: 'radar',",
          "  data: {",
          "    labels,  // ['JavaScript', 'HTML', 'CSS', ...]",
          "    datasets: [{",
          "      data: values,",
          "      backgroundColor: 'rgba(37, 99, 235, 0.2)',",
          "      borderColor: '#2563eb',",
          "    }],",
          "  },",
          "  options: { scales: { r: { beginAtZero: true } } },",
          "});",
          "",
          "async function loadSkillDna(userId) {",
          "  const data = await apiGet(`/api/users/${userId}/skill-dna`);",
          "  renderSkillDnaChart(d.languages);",
          "  renderSkillBadges(d.badges);",
          "  renderProfileHeaderBadges(d.badges, d.languages);",
          "}",
        ]),

        // ─── 3. 플로팅 채팅 ───
        h1("3. 플로팅 팀 채팅 (cap_005_1)"),
        p("프로젝트 찾기 등 전역 페이지에서 💬 버튼으로 참여 중인 프로젝트 채팅에 접근합니다."),

        h3("① 참여 프로젝트 목록 API"),
        fileLabel("project-management-backend/routes/collaboration.js"),
        code([
          "app.get('/api/chat/projects', auth, async (req, res) => {",
          "  const created = await Project.find({ creator: userId });",
          "  const approvedApps = await Application.find({",
          "    applicant: userId, status: 'approved' }).populate('project');",
          "  // 중복 제거 후 { id, title, status, role: 'owner'|'member' } 반환",
          "  return res.json({ success: true, projects });",
          "});",
        ]),

        h3("② UI 생성 + Socket 연결 (global-chat.js)"),
        fileLabel("js/global-chat.js"),
        code([
          "// FAB 클릭 → 패널 is-open, 프로젝트 목록 로드",
          "async function selectGlobalChatProject(projectId, btnEl) {",
          "  globalChatProjectId = projectId;",
          "  const data = await apiGet(`/api/projects/${projectId}/chat/messages`);",
          "  (data.messages || []).forEach(m => box.appendChild(renderGlobalChatMessage(m)));",
          "  connectGlobalChatSocket(projectId);",
          "}",
          "",
          "globalChatSocket = io(window.apiBase, { auth: { token } });",
          "globalChatSocket.on('chat:message', (msg) => { /* 실시간 append */ });",
          "",
          "// + 버튼 → 숨긴 file input 클릭, 텍스트 파일은 메시지 본문에 포함",
          "document.getElementById('globalChatFile')?.click();",
        ]),

        h3("③ 패널 표시/닫기 CSS"),
        fileLabel("css/styles.css"),
        code([
          ".global-chat-panel { display: none; }",
          ".global-chat-panel.is-open { display: flex; }",
          "",
          ".global-chat-attach-btn {",
          "  width: 2.5rem; height: 2.5rem; border-radius: 0.5rem;",
          "  /* + 파일 첨부 버튼 */",
          "}",
        ]),

        // ─── 4. 회원가입/로그인 ───
        h1("4. 회원가입·로그인 검증 (cap_003, cap_004)"),

        h3("① 백엔드 — 중복 확인 API"),
        fileLabel("project-management-backend/server.js"),
        code([
          "app.get('/api/auth/check-username', async (req, res) => {",
          "  const username = String(req.query.username || '').trim();",
          "  const existed = await User.findOne({ username });",
          "  return res.json({ success: true, available: !existed });",
          "});",
          "",
          "app.get('/api/auth/check-nickname', async (req, res) => {",
          "  const existed = await User.findOne({ nickname });",
          "  return res.json({ success: true, available: !existed });",
          "});",
        ]),

        h3("② 프론트 — 실시간 검증 + 버튼 활성화 (auth.js)"),
        fileLabel("js/auth.js"),
        code([
          "usernameInput.addEventListener('input', () => {",
          "  usernameTimer = setTimeout(async () => {",
          "    const res = await fetch(",
          "      `${window.apiBase}/api/auth/check-username?username=${encodeURIComponent(v)}`);",
          "    registerState.usernameOk = !!data.available;",
          "    setFieldHint(usernameHint,",
          "      data.available ? '사용가능한 ID입니다.' : '이미 사용중인 ID입니다.');",
          "    refreshSubmit();  // 모든 조건 충족 시 submitBtn.disabled = false",
          "  }, 400);",
          "});",
        ]),

        h3("③ 로그인 — 필드별 오류 (auth.js + server.js)"),
        fileLabel("project-management-backend/server.js"),
        code([
          "if (!user) return res.status(400).json({",
          "  message: 'ID를 확인해주세요', errorField: 'username' });",
          "if (!ok) return res.status(400).json({",
          "  message: '비밀번호를 확인해주세요', errorField: 'password' });",
        ]),
        fileLabel("js/auth.js"),
        code([
          "if (data.errorField === 'username') {",
          "  usernameError.textContent = 'ID를 확인해주세요';",
          "  usernameError.style.display = 'block';",
          "}",
        ]),

        // ─── 5. 프로필/대시보드 ───
        h1("5. 프로필·대시보드 보완"),

        h3("① 프로필 닉네임 수정 API"),
        fileLabel("project-management-backend/server.js"),
        code([
          "app.put('/api/auth/profile', auth, async (req, res) => {",
          "  const nickname = String(req.body?.nickname || '').trim();",
          "  const taken = await User.findOne({ nickname, _id: { $ne: req.user.id } });",
          "  if (taken) return res.status(400).json({ message: '이미 사용중인 닉네임' });",
          "  user.nickname = nickname; await user.save();",
          "  return res.json({ success: true, user: { ... } });",
          "});",
        ]),
        fileLabel("js/profile.js"),
        code([
          "async function updateProfile(event) {",
          "  const data = await apiPut('/api/auth/profile', { nickname });",
          "  sessionStorage.setItem('user', JSON.stringify({ ...stored, ...data.user }));",
          "}",
        ]),

        h3("② 대시보드 최근 활동"),
        fileLabel("project-management-backend/server.js"),
        code([
          "// GET /api/dashboard/activities",
          "const recruitActivities = incomingApplications.map(app => ({",
          "  message: `모집글에 새로운 지원이 있습니다 — \"${app.project.title}\"`,",
          "}));",
          "const statusActivities = statusProjects.map(project => ({",
          "  message: project.status === 'in-progress'",
          "    ? `프로젝트가 시작되었습니다 — \"${project.title}\"`",
          "    : `프로젝트가 완료됐습니다 — \"${project.title}\"`,",
          "}));",
        ]),

        h3("③ 프로필 헤더 뱃지 (모바일)"),
        fileLabel("profile.html + css/styles.css"),
        code([
          "<div class=\"profile-header\">",
          "  <div class=\"profile-header-top\">  <!-- 아바타 + 이름 -->",
          "  <div id=\"profileHeaderBadges\" class=\"profile-header-badges\" hidden>",
          "    <!-- 짧은 스택 태그만: JavaScript, HTML ... -->",
          "</div>",
          "",
          ".profile-header { display: flex; flex-direction: column; }",
          ".profile-header-badge { max-width: 100%; word-break: break-word; }",
        ]),

        // ─── 6. PM 완료 + UX ───
        h1("6. PM 완료 버튼 · UX 개선"),

        h3("① 채팅 메시지 → 작업 완료"),
        fileLabel("project-management-backend/routes/collaboration.js"),
        code([
          "app.post('/api/projects/:id/chat/messages/:messageId/complete', auth, ...);",
          "  if (!membership.canManage) return res.status(403);",
          "  task.status = 'completed'; await task.save();",
          "  msg.reviewCompleted = true;",
          "  io.to(`project:${project._id}`).emit('chat:message', payload);",
          "  io.to(`project:${project._id}`).emit('task:updated', { status: 'completed' });",
        ]),

        h3("② 네비 깜빡임 완화"),
        fileLabel("css/styles.css + js/nav.js"),
        code([
          "/* JS 적용 전 네비 숨김 */",
          "body:not(.nav-ready) .nav-links { visibility: hidden; }",
          "",
          "function setupNavigation() {",
          "  // sessionStorage → 로그인/로그아웃 버튼 전환",
          "  document.body.classList.add('nav-ready');",
          "}",
        ]),

        h1("7. 환경 변수 (추가 기능용)"),
        p("GROQ_API_KEY — Groq AI 요약 (필수)"),
        p("GITHUB_TOKEN — diff·언어 API (권장)"),
        p("GITHUB_WEBHOOK_SECRET — Webhook 서명 (선택)"),
        p("PUBLIC_APP_URL — 채팅·작업 링크 (Netlify URL)"),
        p("VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY — PWA 푸시 (선택)"),

        p("— 문서 끝 —"),
      ],
    },
  ],
});

const outPath = path.join(__dirname, "..", "WorkGather_추가구현_보고서_v2.docx");
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outPath, buffer);
  console.log("생성 완료:", outPath);
});
