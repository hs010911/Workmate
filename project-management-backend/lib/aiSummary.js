/** @fileoverview 커밋 메시지 AI 한 줄 요약 (Groq, 선택) */

function isGroqConfigured() {
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

async function summarizeCommitMessages(messages, skillDelta) {
  const text = (messages || []).filter(Boolean).join("\n").slice(0, 2000);
  const skills = skillDelta ? Object.keys(skillDelta).join(", ") : "";

  const fallback = () => {
    const first = messages?.find((m) => m && m.trim());
    const line = first ? first.split("\n")[0].slice(0, 120) : "코드 변경이 반영되었습니다.";
    const summary = skills ? `${line} (스택: ${skills})` : line;
    return { summary, viaGroq: false };
  };

  if (!text.trim()) return fallback();

  const key = process.env.GROQ_API_KEY;
  if (!key) return fallback();

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
              "한국어로 한 문장(50자 이내)만 답하세요. Git 커밋을 팀 채팅용으로 요약합니다. 기술 스택이 주어지면 자연스럽게 포함하세요.",
          },
          {
            role: "user",
            content: skills ? `커밋:\n${text}\n\n변경 스택: ${skills}` : text,
          },
        ],
        max_tokens: 100,
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
    if (line) return { summary: line, viaGroq: true };
    return fallback();
  } catch (e) {
    console.warn("[Groq] 요청 실패:", e.message);
    return fallback();
  }
}

module.exports = { summarizeCommitMessages, isGroqConfigured };
