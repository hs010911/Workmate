/**
 * @fileoverview 팀 채팅, GitHub Webhook, Skill-DNA, Web Push API
 */
const crypto = require("crypto");
const Application = require("../models/Application");
const Project = require("../models/Project");
const Task = require("../models/Task");
const ProjectChatMessage = require("../models/ProjectChatMessage");
const { requireProjectMember } = require("../lib/projectAccess");
const { syncUserLanguagesFromRepo, fetchRepoLanguages } = require("../lib/githubSkills");
const { formatMessage } = require("../lib/chatMessageFormat");
const { processGithubActivity } = require("../lib/githubWebhook");
const { isPushConfigured } = require("../lib/pushNotify");

function registerCollaborationRoutes(app, io, { User, auth }) {
  const publicAppUrl = (process.env.PUBLIC_APP_URL || "").replace(/\/+$/, "");

  /** 참여 중인 프로젝트 목록 (플로팅 채팅용) */
  app.get("/api/chat/projects", auth, async (req, res) => {
    try {
      const userId = req.user.id;
      const [created, approvedApps] = await Promise.all([
        Project.find({ creator: userId }).select("title status").sort({ updatedAt: -1 }),
        Application.find({ applicant: userId, status: "approved" })
          .populate("project", "title status")
          .sort({ updatedAt: -1 }),
      ]);

      const seen = new Set();
      const projects = [];
      for (const p of created) {
        const id = String(p._id);
        if (seen.has(id)) continue;
        seen.add(id);
        projects.push({ id, title: p.title, status: p.status, role: "owner" });
      }
      for (const app of approvedApps) {
        if (!app.project) continue;
        const id = String(app.project._id);
        if (seen.has(id)) continue;
        seen.add(id);
        projects.push({ id, title: app.project.title, status: app.project.status, role: "member" });
      }
      return res.json({ success: true, projects });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "서버 오류" });
    }
  });

  app.get("/api/push/vapid-public-key", (_req, res) => {
    const key = process.env.VAPID_PUBLIC_KEY || "";
    return res.json({ success: true, configured: isPushConfigured(), publicKey: key });
  });

  app.post("/api/push/subscribe", auth, async (req, res) => {
    try {
      const sub = req.body?.subscription;
      if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
        return res.status(400).json({ success: false, message: "구독 정보가 올바르지 않습니다" });
      }
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다" });

      const list = user.pushSubscriptions || [];
      if (!list.some((s) => s.endpoint === sub.endpoint)) {
        list.push({
          endpoint: sub.endpoint,
          keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth },
          createdAt: new Date(),
        });
      }
      user.pushSubscriptions = list.slice(-5);
      user.markModified("pushSubscriptions");
      await user.save();
      return res.json({ success: true, message: "푸시 알림이 등록되었습니다" });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "서버 오류" });
    }
  });

  app.delete("/api/push/subscribe", auth, async (req, res) => {
    try {
      const endpoint = req.body?.endpoint;
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다" });
      user.pushSubscriptions = (user.pushSubscriptions || []).filter((s) => s.endpoint !== endpoint);
      user.markModified("pushSubscriptions");
      await user.save();
      return res.json({ success: true });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "서버 오류" });
    }
  });

  app.put("/api/auth/github", auth, async (req, res) => {
    try {
      const { githubUsername, syncRepo } = req.body || {};
      const user = await User.findById(req.user.id);
      if (!user) return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다" });

      if (githubUsername !== undefined) {
        user.githubUsername = String(githubUsername).trim().replace(/^@/, "") || "";
      }

      const repo = String(syncRepo || "").trim();
      if (repo.includes("/")) {
        await syncUserLanguagesFromRepo(user, repo);
      } else if (user.githubUsername) {
        try {
          const headers = { Accept: "application/vnd.github+json", "User-Agent": "WorkMate" };
          if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
          const r = await fetch(`https://api.github.com/users/${user.githubUsername}/repos?per_page=1&sort=updated`, {
            headers,
          });
          if (r.ok) {
            const repos = await r.json();
            if (repos[0]?.full_name) await syncUserLanguagesFromRepo(user, repos[0].full_name);
          }
        } catch {
          /* ignore */
        }
      }

      await user.save();
      return res.json({
        success: true,
        githubUsername: user.githubUsername,
        skillLanguages: user.skillLanguages || {},
        skillBadges: user.skillBadges || [],
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "서버 오류" });
    }
  });

  app.get("/api/users/:userId/skill-dna", auth, async (req, res) => {
    try {
      const user = await User.findById(req.params.userId).select(
        "githubUsername skillLanguages skillBadges nickname username",
      );
      if (!user) return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다" });
      return res.json({
        success: true,
        skillDna: {
          githubUsername: user.githubUsername || "",
          languages: user.skillLanguages || {},
          badges: user.skillBadges || [],
          nickname: user.nickname || user.username,
        },
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "서버 오류" });
    }
  });

  app.put("/api/projects/:id/github-repo", auth, async (req, res) => {
    try {
      const project = await Project.findById(req.params.id);
      const membership = await requireProjectMember(req, res, project);
      if (!membership || !membership.canManage) {
        if (membership) {
          return res.status(403).json({ success: false, message: "프로젝트 소유자만 설정할 수 있습니다" });
        }
        return;
      }
      const raw = String(req.body.githubRepoFullName || "").trim();
      project.githubRepoFullName = raw;
      await project.save();

      const owner = await User.findById(req.user.id);
      if (owner && raw.includes("/")) {
        await syncUserLanguagesFromRepo(owner, raw);
        await owner.save();
      }

      return res.json({ success: true, githubRepoFullName: project.githubRepoFullName });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "서버 오류" });
    }
  });

  app.get("/api/projects/:id/chat/task-options", auth, async (req, res) => {
    try {
      const project = await Project.findById(req.params.id);
      if (!(await requireProjectMember(req, res, project))) return;

      const tasks = await Task.find({ project: project._id })
        .select("title status _id")
        .sort({ order: 1, createdAt: 1 });

      return res.json({
        success: true,
        tasks: tasks.map((t) => ({ id: t._id, title: t.title, status: t.status })),
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "서버 오류" });
    }
  });

  app.get("/api/projects/:id/chat/messages", auth, async (req, res) => {
    try {
      const project = await Project.findById(req.params.id);
      if (!(await requireProjectMember(req, res, project))) return;

      const limit = Math.min(parseInt(req.query.limit, 10) || 80, 200);
      const messages = await ProjectChatMessage.find({ project: project._id })
        .sort({ createdAt: -1 })
        .limit(limit)
        .populate("author", "nickname username")
        .populate("linkedTask", "title status");

      return res.json({
        success: true,
        messages: messages.reverse().map((m) => {
          const f = formatMessage(m);
          if (m.linkedTask) {
            f.linkedTask = { id: m.linkedTask._id, title: m.linkedTask.title, status: m.linkedTask.status };
          }
          return f;
        }),
        githubRepoFullName: project.githubRepoFullName || "",
      });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "서버 오류" });
    }
  });

  app.post("/api/projects/:id/chat/messages", auth, async (req, res) => {
    try {
      const project = await Project.findById(req.params.id);
      if (!(await requireProjectMember(req, res, project))) return;

      const { body, linkedTaskId } = req.body || {};
      if (!body || !String(body).trim()) {
        return res.status(400).json({ success: false, message: "메시지를 입력해주세요" });
      }

      let linkedTask = null;
      if (linkedTaskId) {
        linkedTask = await Task.findOne({ _id: linkedTaskId, project: project._id });
      }

      const taskPageUrl = publicAppUrl
        ? `${publicAppUrl}/project-detail.html?id=${project._id}&tab=tasks`
        : `/project-detail.html?id=${project._id}&tab=tasks`;

      const msg = await ProjectChatMessage.create({
        project: project._id,
        author: req.user.id,
        type: "user",
        body: String(body).trim(),
        linkedTask: linkedTask ? linkedTask._id : null,
        taskPageUrl: linkedTask ? taskPageUrl : null,
      });

      const populated = await ProjectChatMessage.findById(msg._id)
        .populate("author", "nickname username")
        .populate("linkedTask", "title status");
      const payload = formatMessage(populated);
      if (populated.linkedTask) {
        payload.linkedTask = {
          id: populated.linkedTask._id,
          title: populated.linkedTask.title,
          status: populated.linkedTask.status,
        };
      }
      io.to(`project:${project._id}`).emit("chat:message", payload);
      return res.json({ success: true, message: payload });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "서버 오류" });
    }
  });

  app.post("/api/projects/:id/chat/messages/:messageId/complete", auth, async (req, res) => {
    try {
      const project = await Project.findById(req.params.id);
      const membership = await requireProjectMember(req, res, project);
      if (!membership) return;
      if (!membership.canManage) {
        return res.status(403).json({ success: false, message: "프로젝트 소유자(PM)만 완료 처리할 수 있습니다" });
      }

      const msg = await ProjectChatMessage.findOne({
        _id: req.params.messageId,
        project: project._id,
      });
      if (!msg) return res.status(404).json({ success: false, message: "메시지를 찾을 수 없습니다" });
      if (!msg.linkedTask) {
        return res.status(400).json({ success: false, message: "연결된 작업이 없습니다" });
      }

      const task = await Task.findById(msg.linkedTask);
      if (task) {
        task.status = "completed";
        await task.save();
      }

      msg.reviewCompleted = true;
      msg.reviewCompletedBy = req.user.id;
      msg.reviewCompletedAt = new Date();
      await msg.save();

      const populated = await ProjectChatMessage.findById(msg._id)
        .populate("author", "nickname username")
        .populate("linkedTask", "title status");
      const payload = formatMessage(populated);
      if (populated.linkedTask) {
        payload.linkedTask = {
          id: populated.linkedTask._id,
          title: populated.linkedTask.title,
          status: populated.linkedTask.status,
        };
      }

      io.to(`project:${project._id}`).emit("chat:message", payload);
      io.to(`project:${project._id}`).emit("task:updated", { taskId: task?._id, status: "completed" });
      return res.json({ success: true, message: payload });
    } catch (e) {
      console.error(e);
      return res.status(500).json({ success: false, message: "서버 오류" });
    }
  });

  app.post("/api/github/webhook", async (req, res) => {
    try {
      const event = req.headers["x-github-event"];

      if (event === "ping") {
        return res.json({ ok: true, message: "pong" });
      }

      const secret = process.env.GITHUB_WEBHOOK_SECRET;
      if (secret) {
        const sig = req.headers["x-hub-signature-256"];
        const raw = req.rawBody || Buffer.from(JSON.stringify(req.body));
        const expected =
          "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
        if (sig !== expected) {
          return res.status(401).json({ success: false, message: "Webhook 서명 불일치" });
        }
      }

      const payload = req.body;
      let syntheticPayload = payload;
      let eventLabel = "push";

      if (event === "pull_request") {
        const pr = payload.pull_request;
        if (payload.action !== "closed" || !pr?.merged) {
          return res.json({ ok: true, ignored: true });
        }
        eventLabel = "merge";
        syntheticPayload = {
          ...payload,
          ref: `refs/heads/${pr.base?.ref || "main"}`,
          pusher: { name: payload.sender?.login },
          commits: [
            {
              message: pr.title || "Merged pull request",
              url: pr.html_url,
              added: [],
              modified: [],
              removed: [],
            },
          ],
          compare: pr.html_url,
          repository: payload.repository,
        };
      } else if (event !== "push") {
        return res.json({ ok: true, ignored: true });
      }

      const repoFull = syntheticPayload.repository?.full_name;
      if (!repoFull) return res.status(400).json({ success: false, message: "저장소 정보 없음" });

      const project = await Project.findOne({ githubRepoFullName: repoFull });
      if (!project) {
        return res.json({ ok: true, message: "연결된 프로젝트 없음" });
      }

      const pusher = syntheticPayload.pusher?.name || syntheticPayload.sender?.login || "";
      const user = pusher
        ? await User.findOne({ githubUsername: new RegExp(`^${pusher}$`, "i") })
        : null;

      await processGithubActivity({
        project,
        payload: syntheticPayload,
        user,
        User,
        io,
        eventLabel,
      });

      return res.json({ ok: true });
    } catch (e) {
      console.error("GitHub webhook error:", e);
      return res.status(500).json({ success: false, message: "서버 오류" });
    }
  });
}

module.exports = { registerCollaborationRoutes, formatMessage };
