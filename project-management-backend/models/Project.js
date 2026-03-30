/**
 * @fileoverview 프로젝트(모집 글) 스키마 — 생성자, 인원, 마감, isPublished(관리자 게재)
 */
const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    category: { type: String, required: true },
    creator: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    maxParticipants: { type: Number, required: true, min: 1 },
    participants: {
      type: Number,
      default: 1, // 작성자 포함
      min: 1,
    },
    recruitmentDeadline: { type: Date, required: true },
    requirements: { type: String },
    tags: { type: [String], default: [] },
    status: {
      type: String,
      enum: ["recruiting", "in-progress", "completed", "cancelled"],
      default: "recruiting",
    },
    // 관리자 게시글 게재/게재중지 상태
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Project", projectSchema);







