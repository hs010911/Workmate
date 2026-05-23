/** @fileoverview 프로젝트 팀 채팅·GitHub 알림 메시지 */
const mongoose = require("mongoose");

const projectChatMessageSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    type: {
      type: String,
      enum: ["user", "github_push", "system"],
      default: "user",
    },
    body: { type: String, required: true },
    summary: { type: String },
    githubUrl: { type: String },
    taskPageUrl: { type: String },
    linkedTask: { type: mongoose.Schema.Types.ObjectId, ref: "Task", default: null },
    githubMeta: {
      repo: String,
      branch: String,
      commitCount: Number,
      pusher: String,
    },
    reviewCompleted: { type: Boolean, default: false },
    reviewCompletedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    reviewCompletedAt: { type: Date },
  },
  { timestamps: true },
);

projectChatMessageSchema.index({ project: 1, createdAt: -1 });

module.exports = mongoose.model("ProjectChatMessage", projectChatMessageSchema);
