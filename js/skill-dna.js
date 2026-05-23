/**
 * @fileoverview Skill-DNA 레이더 차트·배지 (Chart.js)
 */
let skillDnaChartInstance = null;

function skillLabelsAndValues(languages) {
  const entries = Object.entries(languages || {})
    .filter(([, v]) => Number(v) > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8);
  if (!entries.length) return { labels: [], values: [] };
  return {
    labels: entries.map(([k]) => k),
    values: entries.map(([, v]) => (v > 100 ? v : v)),
  };
}

function renderSkillDnaChart(languages) {
  const canvas = document.getElementById("skillDnaChart");
  const empty = document.getElementById("skillDnaEmpty");
  if (!canvas || typeof Chart === "undefined") return;

  const { labels, values } = skillLabelsAndValues(languages);
  if (!labels.length) {
    if (empty) empty.style.display = "block";
    if (skillDnaChartInstance) {
      skillDnaChartInstance.destroy();
      skillDnaChartInstance = null;
    }
    return;
  }
  if (empty) empty.style.display = "none";

  if (skillDnaChartInstance) skillDnaChartInstance.destroy();
  skillDnaChartInstance = new Chart(canvas, {
    type: "radar",
    data: {
      labels,
      datasets: [
        {
          label: "기여도",
          data: values,
          backgroundColor: "rgba(37, 99, 235, 0.2)",
          borderColor: "#2563eb",
          pointBackgroundColor: "#2563eb",
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        r: {
          beginAtZero: true,
          ticks: { display: false },
        },
      },
      plugins: { legend: { display: false } },
    },
  });
}

function renderSkillBadges(badges) {
  const el = document.getElementById("skillDnaBadges");
  if (!el) return;
  const list = badges || [];
  if (!list.length) {
    el.innerHTML = "";
    return;
  }
  el.innerHTML = list
    .map((b) => `<span class="skill-dna-badge">${escapeHtml(b.label || b.id || "")}</span>`)
    .join("");
}

async function loadSkillDna(userId) {
  if (!userId) return;
  try {
    const data = await apiGet(`/api/users/${userId}/skill-dna`);
    if (!data.success) return;
    const d = data.skillDna || {};
    renderSkillDnaChart(d.languages);
    renderSkillBadges(d.badges);
    const ghInput = document.getElementById("githubUsername");
    if (ghInput && d.githubUsername) ghInput.value = d.githubUsername;
  } catch (e) {
    console.warn("Skill-DNA 로드 실패", e);
  }
}

async function saveGithubLink() {
  const githubUsername = document.getElementById("githubUsername")?.value?.trim() || "";
  const syncRepo = document.getElementById("githubSyncRepo")?.value?.trim() || "";
  try {
    const data = await apiPut("/api/auth/github", { githubUsername, syncRepo: syncRepo || undefined });
    showModal("알림", "GitHub 연동이 저장되었습니다.");
    const user = getCurrentUser();
    if (user) {
      user.githubUsername = data.githubUsername;
      localStorage.setItem("user", JSON.stringify(user));
    }
    renderSkillDnaChart(data.skillLanguages);
    renderSkillBadges(data.skillBadges);
  } catch (error) {
    showError("GitHub 연동 실패", error);
  }
}
