/**
 * @fileoverview 관리자 전용 미들웨어 (auth 이후 사용)
 * @description role=admin, status=active 만 통과. req.adminUser, req.adminPermission(full|read) 설정.
 */
async function adminMiddleware(req, res, next) {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ success: false, message: "인증이 필요합니다" });
    }

    const mongoose = require("mongoose");
    const User = mongoose.model("User");
    const user = await User.findById(req.user.id);
    if (!user || user.role !== "admin") {
      return res.status(403).json({ success: false, message: "관리자 권한이 필요합니다" });
    }

    if (user.status !== "active") {
      return res.status(403).json({ success: false, message: "정지된 계정입니다" });
    }

    // 관리자 정보 및 권한을 요청 객체에 저장 (조회 전용/전체 권한 구분)
    req.adminUser = user;
    req.adminPermission = user.adminPermission || "full";

    next();
  } catch (e) {
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
}

module.exports = adminMiddleware;

