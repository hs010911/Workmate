const Application = require("../models/Application");

/**
 * 프로젝트 소유자 또는 승인된 참여자 여부
 */
async function getProjectMembership(project, userId) {
  const isCreator = String(project.creator) === String(userId);
  if (isCreator) {
    return { isCreator: true, isParticipant: true, canManage: true };
  }
  const app = await Application.findOne({
    project: project._id,
    applicant: userId,
    status: "approved",
  });
  const isParticipant = !!app;
  return { isCreator: false, isParticipant, canManage: false };
}

async function requireProjectMember(req, res, project) {
  if (!project) {
    res.status(404).json({ success: false, message: "프로젝트를 찾을 수 없습니다" });
    return null;
  }
  const membership = await getProjectMembership(project, req.user.id);
  if (!membership.isCreator && !membership.isParticipant) {
    res.status(403).json({ success: false, message: "권한이 없습니다" });
    return null;
  }
  return membership;
}

module.exports = { getProjectMembership, requireProjectMember };
