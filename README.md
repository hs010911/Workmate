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
