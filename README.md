# WorkGather — 프로젝트 모집·협업 웹앱

## 프로젝트 개요
WorkGather는 학생들이 프로젝트 팀을 모집하고 협업할 수 있는 웹 애플리케이션입니다. 사용자는 프로젝트를 등록하고 팀원을 모집하며, 팀 채팅을 통해 소통하고 GitHub와 연동하여 협업 과정을 관리할 수 있습니다.

## 주요 기능
- **사용자 인증**: 회원가입, 로그인, 관리자 기능
- **프로젝트 모집**: 프로젝트 등록, 지원서 작성, 팀원 선정
- **팀 채팅**: 실시간 팀 소통, 작업 관리
- **GitHub 연동**: 저장소 연결, 커밋 히스토리 추적
- **AI 요약**: Groq API를 활용한 커밋 자동 요약
- **푸시 알림**: 브라우저 푸시 알림 지원

## 기술 스택
- **프론트엔드**: HTML, CSS, JavaScript (Vanilla)
- **백엔드**: Node.js, Express
- **데이터베이스**: MongoDB
- **인증**: JWT (JSON Web Token)
- **외부 API**: GitHub API, Groq API

## 실행 방법

### 백엔드 실행
```bash
cd project-management-backend
npm install
npm start
```

### 환경 변수 설정
`.env` 파일에 다음 변수들을 설정해야 합니다:
- `MONGODB_URI`: MongoDB 연결 문자열
- `JWT_SECRET`: JWT 서명 키
- `PORT`: API 포트 (기본 3001)
- `GROQ_API_KEY`: AI 요약용 Groq API 키 (선택)

