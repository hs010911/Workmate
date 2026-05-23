/** @fileoverview GitHub API로 push/compare diff 조회 (Groq 요약용) */

const MAX_FILES = 8;
const MAX_TOTAL_CHARS = 6000;
const MAX_PATCH_PER_FILE = 1200;

const BINARY_OR_SKIP = /\.(png|jpg|jpeg|gif|webp|ico|pdf|zip|lock|woff2?|ttf|eot)$/i;

function githubHeaders() {
  const headers = {
    Accept: "application/vnd.github+json",
    "User-Agent": "WorkMate",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  return headers;
}

function truncatePatch(patch) {
  if (!patch) return "";
  const lines = patch.split("\n");
  const trimmed = lines.slice(0, 80).join("\n");
  if (trimmed.length > MAX_PATCH_PER_FILE) {
    return `${trimmed.slice(0, MAX_PATCH_PER_FILE)}\n…(생략)`;
  }
  return trimmed;
}

function buildExcerptFromFiles(files) {
  if (!files?.length) return "";

  const parts = [];
  let total = 0;

  for (const f of files) {
    if (parts.length >= MAX_FILES) break;
    const name = f.filename || f.previous_filename || "";
    if (!name || BINARY_OR_SKIP.test(name)) continue;

    const patch = truncatePatch(f.patch);
    if (!patch && f.status === "added") {
      const block = `--- ${name} (신규 파일, diff 없음) ---\n`;
      if (total + block.length > MAX_TOTAL_CHARS) break;
      parts.push(block);
      total += block.length;
      continue;
    }
    if (!patch) continue;

    const block = `--- ${name} (${f.status || "modified"}) ---\n${patch}\n`;
    if (total + block.length > MAX_TOTAL_CHARS) {
      parts.push("…(추가 변경 파일 생략)\n");
      break;
    }
    parts.push(block);
    total += block.length;
  }

  return parts.join("\n").trim();
}

async function githubGetJson(url) {
  const res = await fetch(url, { headers: githubHeaders() });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn("[GitHub Diff] API", res.status, url, body.slice(0, 200));
    return null;
  }
  return res.json();
}

/**
 * 단일 커밋의 파일별 patch
 */
async function fetchCommitDiff(repoFull, sha) {
  if (!repoFull || !sha) return "";
  const data = await githubGetJson(`https://api.github.com/repos/${repoFull}/commits/${sha}`);
  return buildExcerptFromFiles(data?.files);
}

/**
 * push Webhook payload에서 compare diff (before...after)
 */
async function fetchPushDiff(repoFull, payload) {
  if (!repoFull || !payload) return "";

  const before = payload.before;
  const after = payload.after;
  const commits = payload.commits || [];

  if (before && after && !/^0+$/.test(before)) {
    const data = await githubGetJson(
      `https://api.github.com/repos/${repoFull}/compare/${before}...${after}`,
    );
    const excerpt = buildExcerptFromFiles(data?.files);
    if (excerpt) return excerpt;
  }

  const lastSha = commits.length ? commits[commits.length - 1].id : after;
  if (lastSha) {
    return fetchCommitDiff(repoFull, lastSha);
  }

  return "";
}

/**
 * PR 병합 시 merge commit sha로 diff
 */
async function fetchMergeDiff(repoFull, payload) {
  const sha = payload.pull_request?.merge_commit_sha || payload.after;
  if (sha) return fetchCommitDiff(repoFull, sha);
  return fetchPushDiff(repoFull, payload);
}

module.exports = {
  fetchPushDiff,
  fetchMergeDiff,
  buildExcerptFromFiles,
};
