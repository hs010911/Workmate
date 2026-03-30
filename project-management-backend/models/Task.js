/** @fileoverview 프로젝트 하위 작업(부모-자식 세부작업) */
const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema(
  {
    project: { type: mongoose.Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    title: { type: String, required: true, trim: true },
    description: { type: String },
    parentTask: { type: mongoose.Schema.Types.ObjectId, ref: "Task", default: null }, // null이면 최상위 작업, 있으면 세부작업
    assignee: { type: mongoose.Schema.Types.ObjectId, ref: "User" }, // 담당자
    dueDate: { type: Date }, // 마감일
    status: {
      type: String,
      enum: ["todo", "in-progress", "completed", "rework"],
      default: "todo",
    },
    startDate: { type: Date }, // 시작일 (Gantt 차트용)
    endDate: { type: Date }, // 종료일 (Gantt 차트용)
    order: { type: Number, default: 0 }, // 정렬 순서
  },
  { timestamps: true },
);

// 인덱스 추가
taskSchema.index({ project: 1, parentTask: 1 });
taskSchema.index({ project: 1, order: 1 });

module.exports = mongoose.model("Task", taskSchema);

