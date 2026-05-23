/** @fileoverview 커밋 메시지 + diff → Groq 한 줄 요약 */

function isGroqConfigured() {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

async function summarizeCommitMessages(messages, skillDelta, diffExcerpt) {
  const text = (messages || []).filter(Boolean).join("\n").slice(0, 2000);
  const skills = skillDelta ? Object.keys(skillDelta).join(", ") : "";
  const diff = (diffExcerpt || "").trim().slice(0, 6000);

  const fallback = () => {
    const first = messages?.find((m) => m && m.trim());
    const line = first ? first.split("\n")[0].slice(0, 120) : "코드 변경이 반영되었습니다.";
    const summary = skills ? `${line} (스택: ${skills})` : line;
    return { summary, viaGroq: false, usedDiff: false };
  };

  if (!text.trim() && !diff) return fallback();

  const key = process.env.GROQ_API_KEY;
  if (!key) return fallback();

  const userParts = [];
  if (text.trim()) userParts.push(`커밋 메시지:\n${text}`);
  if (diff) userParts.push(`변경 내용(diff):\n${diff}`);
  if (skills) userParts.push(`변경 스택(파일 확장자): ${skills}`);

  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content:
              "한국어로 한 문장(60자 이내)만 답하세요. Git 커밋 메시지와 diff(코드 변경)를 읽고, 팀원이 무엇을 수정했는지 쉽게 요약합니다. diff가 있으면 커밋 메시지보다 diff를 우선 반영하세요.",
          },
          {
            role: "user",
            content: userParts.join("\n\n"),
          },
        ],
        max_tokens: 120,
        temperature: 0.3,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.warn("[Groq] API 오류", res.status, errBody.slice(0, 300));
      return fallback();
    }
    const data = await res.json();
    const line = data.choices?.[0]?.message?.content?.trim();
    if (line) return { summary: line, viaGroq: true, usedDiff: Boolean(diff) };
    return fallback();
  } catch (e) {
    console.warn("[Groq] 요청 실패:", e.message);
    return fallback();
  }
}

module.exports = { summarizeCommitMessages, isGroqConfigured };
