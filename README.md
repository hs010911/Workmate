# WorkMate — 프로젝트 모집·협업 웹앱

프론트엔드(정적 HTML/JS) + Node/Express/MongoDB API 구조입니다.

## 폴더 구조

```
cap/                          # 정적 사이트 루트 (Express static으로도 서빙 가능)
├── css/styles.css
├── js/
│   ├── config.js             # API Base URL (apiBase)
│   ├── api.js                # apiGet/Post/Put/Delete
│   ├── utils.js              # 날짜, 모달, 인증 헬퍼
│   ├── main.js               # index, 로그아웃
│   ├── auth.js               # login/register
│   ├── admin-login.js        # 관리자 전용 로그인
│   ├── nav.js                # 네비·로그아웃 버튼
│   ├── admin.js              # 관리자 페이지 전체
│   ├── project-detail.js     # 프로젝트 상세·작업
│   └── … (페이지별 스크립트)
├── *.html
└── project-management-backend/
    ├── server.js             # REST API (스키마·라우트 일원화)
    ├── middleware/auth.js    # JWT 검증
    ├── middleware/admin.js   # 관리자 역할·권한
    └── models/               # Project, Task, Application
```

## 스크립트 로드 순서 (공통)

1. `config.js` → `utils.js` → `api.js` → `main.js`  
2. 페이지별 JS는 그 뒤에 로드 (`auth.js`, `admin.js` 등)

## 백엔드 실행

```bash
cd project-management-backend
# .env 에 MONGODB_URI, JWT_SECRET 등 설정
npm install
npm start              # 기본 포트 3001
```

## 환경 변수 (예시)

- `MONGODB_URI` — MongoDB 연결 문자열  
- `JWT_SECRET` — JWT 서명  
- `PORT` — API 포트 (기본 3001)  
- `CORS_ORIGIN` — 프로덕션 시 허용 오리진  
- `PUBLIC_APP_URL` — 채팅·Webhook 링크용 프론트 URL (예: `https://your-app.netlify.app`)  
- `GITHUB_WEBHOOK_SECRET` — GitHub Webhook 서명 검증 (선택)  
- `GITHUB_TOKEN` — 저장소 언어 비율 API 동기화 (선택)  
- `GROQ_API_KEY` — 커밋 AI 한 줄 요약 ([Groq Console](https://console.groq.com)에서 발급, 없으면 커밋 메시지 첫 줄 사용)
- `GROQ_MODEL` — 기본 `llama-3.1-8b-instant`

## 협업 기능 (채팅·Skill-DNA)

1. 프로필 → **GitHub 연동**에 GitHub 사용자명 저장 (저장소 비우면 최근 공개 repo 언어 자동 동기화)  
2. 프로젝트 상세 → **팀 채팅** → 소유자가 `owner/repo` 저장 (언어 비율 자동 동기화)  
3. GitHub Webhook: `{API}/api/github/webhook`, 이벤트 **push**, **pull_request** (병합)  
4. 푸시/병합 → 채팅·AI 요약·작업 자동 매칭·Skill-DNA(2주 상위 10% 배지)  
5. PM **완료** 버튼, 채팅에서 작업 선택 후 메시지 전송  
6. **푸시 알림**: `node scripts/generate-vapid-keys.js` 후 `.env`에 VAPID 키 설정 → 프로필/채팅에서「푸시 알림 켜기」

### Groq API 설정 (AI 요약)

1. https://console.groq.com 가입 → **API Keys** → Create API Key  
2. Render `workmate-api` → **Environment** → `GROQ_API_KEY=gsk_...` 추가 → Save → 재배포  
3. (로컬 확인) `project-management-backend/.env` 에 동일 키 후 `npm run test-groq`  
4. GitHub push 후 팀 채팅에 **「AI 요약 (Groq)」** 라벨이 보이면 성공

webhook test3
