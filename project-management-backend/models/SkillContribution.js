/** @fileoverview 프로젝트별 스킬 기여 이벤트 (Skill-DNA 배지·랭킹용) */
const mongoose = require("mongoose");

const skillContributionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    skill: { type: String, required: true },
    weight: { type: Number, default: 1 },
  },
  { timestamps: true },
);

skillContributionSchema.index({ project: 1, skill: 1, createdAt: -1 });
skillContributionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("SkillContribution", skillContributionSchema);
