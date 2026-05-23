/**
 * GitHub 커밋 메시지·변경 파일명과 프로젝트 작업 제목 매칭
 */
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[#\[\]()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function matchTaskFromGithubPayload(tasks, payload, diffExcerpt) {
  if (!tasks?.length || !payload) return null;

  const commits = payload.commits || [];
  const haystacks = [];
  for (const c of commits) {
    if (c.message) haystacks.push(normalize(c.message));
    for (const p of [...(c.added || []), ...(c.modified || [])]) {
      haystacks.push(normalize(p));
    }
  }
  if (diffExcerpt) {
    haystacks.push(normalize(diffExcerpt.slice(0, 4000)));
  }

  const branch = (payload.ref || "").replace("refs/heads/", "");
  if (branch) haystacks.push(normalize(branch));

  const sorted = [...tasks].sort((a, b) => (b.title?.length || 0) - (a.title?.length || 0));

  for (const task of sorted) {
    const title = normalize(task.title);
    if (title.length < 2) continue;
    for (const h of haystacks) {
      if (h.includes(title)) return task;
    }
  }

  for (const task of sorted) {
    const words = normalize(task.title).split(" ").filter((w) => w.length >= 3);
    if (words.length === 0) continue;
    for (const h of haystacks) {
      if (words.every((w) => h.includes(w))) return task;
    }
  }

  return null;
}

module.exports = { matchTaskFromGithubPayload };
