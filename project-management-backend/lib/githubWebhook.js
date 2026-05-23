/** @fileoverview GitHub push / pull_request(merge) 공통 처리 */
const Project = require("../models/Project");
const Task = require("../models/Task");
const Application = require("../models/Application");
const ProjectChatMessage = require("../models/ProjectChatMessage");
const {
  skillsFromPushPayload,
  mergeSkillCounts,
  recomputeBadges,
  fetchRepoLanguages,
  recordSkillContributions,
} = require("./githubSkills");
const { summarizeCommitMessages } = require("./aiSummary");
const { matchTaskFromGithubPayload } = require("./taskMatcher");
const { sendPushToUser } = require("./pushNotify");
const { formatMessage } = require("./chatMessageFormat");

async function getProjectMemberUsers(project, User) {
  const ids = new Set([String(project.creator)]);
  const apps = await Application.find({ project: project._id, status: "approved" });
  apps.forEach((a) => ids.add(String(a.applicant)));
  return User.find({ _id: { $in: [...ids] } });
}

async function notifyProjectMembers(project, User, excludeUserId, payload) {
  const members = await getProjectMemberUsers(project, User);
  for (const m of members) {
    if (excludeUserId && String(m._id) === String(excludeUserId)) continue;
    await sendPushToUser(m, payload);
  }
}

async function processGithubActivity({
  project,
  payload,
  user,
  User,
  io,
  eventLabel,
}) {
  const publicAppUrl = (process.env.PUBLIC_APP_URL || "").replace(/\/+$/, "");
  const repoFull = payload.repository?.full_name || project.githubRepoFullName;
  const pusher = payload.pusher?.name || payload.sender?.login || "";

  const skillDelta = skillsFromPushPayload(payload);
  if (user) {
    if (Object.keys(skillDelta).length) {
      mergeSkillCounts(user, skillDelta);
      await recordSkillContributions(user._id, project._id, skillDelta);
      await recomputeBadges(user, project._id, project.title, User);
    }
    if (repoFull) {
      const langs = await fetchRepoLanguages(user.githubUsername, repoFull, process.env.GITHUB_TOKEN);
      if (Object.keys(langs).length) {
        const merged = { ...(user.skillLanguages || {}), ...langs };
        user.skillLanguages = merged;
        user.markModified("skillLanguages");
      }
    }
    await user.save();
  }

  const tasks = await Task.find({ project: project._id }).select("title status _id");
  const matchedTask = matchTaskFromGithubPayload(tasks, payload);

  const commits = payload.commits || [];
  const commitMessages = commits.map((c) => c.message).filter(Boolean);
      const { summary, viaGroq: summaryViaGroq } = await summarizeCommitMessages(
        commitMessages,
        skillDelta,
      );
  const compareUrl =
    payload.compare ||
    (commits[0] && commits[0].url) ||
    payload.pull_request?.html_url ||
    payload.repository?.html_url;

  const taskPageUrl = publicAppUrl
    ? `${publicAppUrl}/project-detail.html?id=${project._id}&tab=tasks`
    : `/project-detail.html?id=${project._id}&tab=tasks`;

  const branch = (payload.ref || "").replace("refs/heads/", "") || payload.pull_request?.base?.ref || "";
  const body =
    eventLabel === "merge"
      ? `[GitHub] ${pusher || "unknown"}님이 PR을 병합했습니다. (${branch})`
      : `[GitHub] ${pusher || "unknown"}님이 ${branch}에 푸시했습니다.`;

  const chatMsg = await ProjectChatMessage.create({
    project: project._id,
    author: user ? user._id : null,
    type: "github_push",
    body,
    summary,
    githubUrl: compareUrl,
    taskPageUrl: matchedTask ? taskPageUrl : taskPageUrl,
    linkedTask: matchedTask ? matchedTask._id : null,
        githubMeta: {
          repo: repoFull,
          branch,
          commitCount: commits.length || 1,
          pusher,
          event: eventLabel,
          matchedTaskTitle: matchedTask ? matchedTask.title : null,
          summaryViaGroq,
        },
  });

  const populated = await ProjectChatMessage.findById(chatMsg._id)
    .populate("author", "nickname username")
    .populate("linkedTask", "title status");

  const out = formatMessage(populated);
  if (populated.linkedTask) {
    out.linkedTask = {
      id: populated.linkedTask._id,
      title: populated.linkedTask.title,
      status: populated.linkedTask.status,
    };
  }

  io.to(`project:${project._id}`).emit("chat:message", out);

  const chatUrl = publicAppUrl
    ? `${publicAppUrl}/project-detail.html?id=${project._id}&tab=chat`
    : `/project-detail.html?id=${project._id}&tab=chat`;

  await notifyProjectMembers(
    project,
    User,
    user?._id,
    {
      title: "WorkMate — GitHub 업데이트",
      body: summary || body,
      url: chatUrl,
      projectId: String(project._id),
    },
  );

  return out;
}

module.exports = { processGithubActivity, getProjectMemberUsers };
