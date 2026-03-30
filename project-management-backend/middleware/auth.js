/**
 * @fileoverview JWT 인증 미들웨어
 * @description Authorization: Bearer <token> 검증 후 req.user = { id } 설정.
 */
const jwt = require("jsonwebtoken");

function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization || "";
    const [, token] = authHeader.split(" ");
    if (!token) {
      return res.status(401).json({ success: false, message: "인증이 필요합니다" });
    }
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({ success: false, message: "서버 설정 오류(JWT)" });
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: payload.id };
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: "유효하지 않은 토큰입니다" });
  }
}

module.exports = authMiddleware;





