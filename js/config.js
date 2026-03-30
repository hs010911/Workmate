/**
 * @fileoverview API 베이스 URL 설정 (즉시 실행)
 * @description 현재 환경에 맞는 window.apiBase 설정
 */
(function () {
  if (window.__API_BASE__ && typeof window.__API_BASE__ === "string") {
    window.apiBase = window.__API_BASE__.trim().replace(/\/+$/, "");
    return;
  }

  const hostname = window.location.hostname;
  const protocol = window.location.protocol;
  const port = 3001;

  // 필요하면 아래를 해제해 window.apiBase를 직접 지정할 수 있습니다.

  const isLocalhost = hostname === "localhost" || hostname === "127.0.0.1";
  const isFileProtocol = protocol === "file:" || hostname === "";

  if (isFileProtocol || isLocalhost) {
    // 파일로 바로 열었거나 localhost일 때는 기본값 사용
    window.apiBase = `http://localhost:${port}`;
  } else {
    // 같은 네트워크의 다른 컴퓨터에서 접근할 때 현재 호스트 재사용
    // 프로덕션 환경에서는 같은 도메인 사용 (포트 없음)
    if (protocol === "https:") {
      // HTTPS 환경에서는 같은 도메인 사용 (API도 같은 서버)
      window.apiBase = `${protocol}//${hostname}`;
    } else {
      window.apiBase = `${protocol}//${hostname}:${port}`;
    }
  }
})();
