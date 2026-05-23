/**
 * Groq API 키 테스트: node scripts/test-groq.js
 * .env 에 GROQ_API_KEY 가 있어야 합니다.
 */
require("dotenv").config();
const { summarizeCommitMessages } = require("../lib/aiSummary");

async function main() {
  if (!process.env.GROQ_API_KEY) {
    console.error("❌ GROQ_API_KEY 가 .env 에 없습니다.");
    process.exit(1);
  }

  console.log("모델:", process.env.GROQ_MODEL || "llama-3.1-8b-instant");
  console.log("테스트 중...\n");

  const sampleDiff = `--- README.md (modified) ---
@@ -1,3 +1,4 @@
 # WorkMate
+Webhook 테스트: diff 기반 AI 요약
 `;

  const { summary, viaGroq, usedDiff } = await summarizeCommitMessages(
    ["123"],
    { 문서: 1 },
    sampleDiff,
  );

  console.log("요약 결과:", summary);
  console.log("diff 반영:", usedDiff);
  console.log(
    viaGroq
      ? "\n✅ Groq API 연동 성공"
      : "\n⚠️ Groq 미사용 — 키 오류 또는 API 실패. Render Logs에서 [Groq] 메시지 확인.",
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
