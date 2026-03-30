/** @fileoverview 프로젝트 지원(지원자·상태 pending/approved/rejected) */
const mongoose = require("mongoose");

const applicationSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    applicant: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    message: { type: String },
  },
  { timestamps: true },
);

applicationSchema.index({ project: 1, applicant: 1 }, { unique: true });

module.exports = mongoose.model("Application", applicationSchema);








