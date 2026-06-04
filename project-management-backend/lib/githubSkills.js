/** @fileoverview GitHub push/저장소 데이터 → Skill-DNA 집계 */

const SkillContribution = require("../models/SkillContribution");

const EXT_TO_SKILL = {
  js: "JavaScript",
  mjs: "JavaScript",
  cjs: "JavaScript",
  ts: "TypeScript",
  jsx: "React",
  tsx: "React",
  vue: "Vue",
  py: "Python",
  java: "Java",
  kt: "Kotlin",
  go: "Go",
  rs: "Rust",
  html: "HTML",
  css: "CSS",
  scss: "CSS",
  sass: "CSS",
  json: "JSON",
  md: "문서",
  sql: "SQL",
  php: "PHP",
  rb: "Ruby",
  cs: "C#",
  cpp: "C++",
  c: "C",
  swift: "Swift",
};

const TWO_WEEKS_MS = 14 * 24 * 60 * 60 * 1000;

function skillFromPath(filePath) {
  if (!filePath || typeof filePath !== "string") return null;
  const base = filePath.split("/").pop() || filePath;
  const dot = base.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = base.slice(dot + 1).toLowerCase();
  return EXT_TO_SKILL[ext] || null;
}

function skillsFromPushPayload(payload) {
  const counts = {};
  const commits = payload.commits || [];
  for (const commit of commits) {
    const paths = [...(commit.added || []), ...(commit.modified || []), ...(commit.removed || [])];
    for (const p of paths) {
      const skill = skillFromPath(p);
      if (skill) counts[skill] = (counts[skill] || 0) + 1;
    }
  }
  return counts;
}

function mergeSkillCounts(userDoc, delta) {
  const langs = { ...(userDoc.skillLanguages || {}) };
  for (const [skill, n] of Object.entries(delta)) {
    langs[skill] = (langs[skill] || 0) + n;
  }
  userDoc.skillLanguages = langs;
  userDoc.markModified("skillLanguages");
  return userDoc;
}

async function recordSkillContributions(userId, projectId, skillDelta) {
  const docs = Object.entries(skillDelta).map(([skill, weight]) => ({
    user: userId,
    project: projectId,
    skill,
    weight,
  }));
  if (docs.length) await SkillContribution.insertMany(docs);
}

async function getProjectSkillTotals(projectId, since) {
  const mongoose = require("mongoose");
  const pid =
    projectId instanceof mongoose.Types.ObjectId
      ? projectId
      : new mongoose.Types.ObjectId(String(projectId));

  const rows = await SkillContribution.aggregate([
    { $match: { project: pid, createdAt: { $gte: since } } },
    {
      $group: {
        _id: { user: "$user", skill: "$skill" },
        total: { $sum: "$weight" },
      },
    },
  ]);
  const bySkill = {};
  for (const r of rows) {
    const skill = r._id.skill;
    if (!bySkill[skill]) bySkill[skill] = [];
    bySkill[skill].push({ userId: String(r._id.user), total: r.total });
  }
  return bySkill;
}

function percentileRank(values, value) {
  if (!values.length) return 0;
  const below = values.filter((v) => v < value).length;
  return below / values.length;
}

async function recomputeBadges(userDoc, projectId, projectTitle, User) {
  const since = new Date(Date.now() - TWO_WEEKS_MS);
  const langs = userDoc.skillLanguages || {};
  const entries = Object.entries(langs).sort((a, b) => b[1] - a[1]);
  const badges = [];
  const userId = String(userDoc._id);

  if (entries.length > 0 && entries[0][1] >= 5) {
    badges.push({
      id: `top-${entries[0][0]}`,
      label: `주력 스택: ${entries[0][0]}`,
      earnedAt: new Date(),
    });
  }

  if (projectId) {
    const bySkill = await getProjectSkillTotals(projectId, since);
    for (const [skill, userTotals] of Object.entries(bySkill)) {
      const mine = userTotals.find((u) => u.userId === userId);
      if (!mine || mine.total < 2) continue;
      const totals = userTotals.map((u) => u.total);
      const rank = percentileRank(totals, mine.total);
      if (rank >= 0.9 && userTotals.length >= 2) {
        badges.push({
          id: `top10-${projectId}-${skill}`,
          label: `최근 2주 ${skill} 기여 상위 10% (${projectTitle || "프로젝트"})`,
          earnedAt: new Date(),
        });
      } else if (mine.total >= 5) {
        badges.push({
          id: `contrib-${projectId}-${skill}`,
          label: `${projectTitle || "프로젝트"} — ${skill} 핵심 기여`,
          earnedAt: new Date(),
        });
      }
    }

    const topSkill = entries[0]?.[0];
    if (topSkill === "React" || topSkill === "TypeScript" || topSkill === "Vue") {
      badges.push({
        id: `role-${projectId}-${topSkill}`,
        label: `${projectTitle || "프로젝트"} ${topSkill} 담당`,
        earnedAt: new Date(),
      });
    }
  }

  const existing = userDoc.skillBadges || [];
  const byId = new Map(existing.map((b) => [b.id, b]));
  for (const b of badges) {
    if (!byId.has(b.id)) byId.set(b.id, b);
  }
  userDoc.skillBadges = Array.from(byId.values()).slice(-20);
  userDoc.markModified("skillBadges");
}

async function fetchRepoLanguages(_githubUsername, repoFullName, token) {
  if (!repoFullName || !repoFullName.includes("/")) return {};
  const headers = { Accept: "application/vnd.github+json", "User-Agent": "WorkGather" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const url = `https://api.github.com/repos/${repoFullName}/languages`;
  const res = await fetch(url, { headers });
  if (!res.ok) return {};
  const data = await res.json();
  const total = Object.values(data).reduce((a, b) => a + b, 0) || 1;
  const out = {};
  for (const [lang, bytes] of Object.entries(data)) {
    out[lang] = Math.round((bytes / total) * 100);
  }
  return out;
}

async function syncUserLanguagesFromRepo(userDoc, repoFullName) {
  const langs = await fetchRepoLanguages(userDoc.githubUsername, repoFullName, process.env.GITHUB_TOKEN);
  if (!Object.keys(langs).length) return false;
  userDoc.skillLanguages = { ...(userDoc.skillLanguages || {}), ...langs };
  userDoc.markModified("skillLanguages");
  return true;
}

module.exports = {
  EXT_TO_SKILL,
  skillFromPath,
  skillsFromPushPayload,
  mergeSkillCounts,
  recordSkillContributions,
  recomputeBadges,
  fetchRepoLanguages,
  syncUserLanguagesFromRepo,
};
