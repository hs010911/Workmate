/**
 * @fileoverview WorkMate API 서버 (Express + Mongoose)
 * 사용자/관리자/공개 API 라우트를 한 파일에 정의(모델은 models/ 사용).
 */

const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3001;
const Project = require("./models/Project");
const auth = require("./middleware/auth");
const admin = require("./middleware/admin");
const Application = require("./models/Application");
const Task = require("./models/Task");

// ==================== 미들웨어 설정 ====================

const rawCorsOrigins = process.env.CORS_ORIGIN || "";
const allowedOrigins = rawCorsOrigins
  .split(",")
  .map((v) => v.trim())
  .filter(Boolean);

const corsOptions = {
  origin(origin, callback) {
    // 서버-서버 호출, health check 등 origin 없는 요청은 허용
    if (!origin) return callback(null, true);
    if (allowedOrigins.length === 0) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("CORS 허용되지 않은 Origin"));
  },
  credentials: true,
};
app.use(cors(corsOptions));
app.use(express.json());

const rootDir = path.join(__dirname, "..");
app.use(express.static(rootDir));

// ==================== 데이터베이스 연결 ====================

mongoose
  .connect(process.env.MONGODB_URI, {})
  .then(() => console.log("MongoDB 연결 성공"))
  .catch((err) => console.error("MongoDB 연결 실패:", err));

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  name: String,
  nickname: String,
  phone: String,
  email: String,
  password: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  status: { type: String, enum: ["active", "suspended", "dormant", "withdrawn"], default: "active" },
  adminPermission: { type: String, enum: ["full", "read"], default: "full" },
  lastActivityAt: { type: Date, default: Date.now },
  blockedUsers: [
    {
      user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
      blockedAt: { type: Date, default: Date.now },
    },
  ],
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

const noticeSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  isImportant: { type: Boolean, default: false },
}, { timestamps: true });

const Notice = mongoose.model("Notice", noticeSchema);

const faqSchema = new mongoose.Schema({
  question: { type: String, required: true },
  answer: { type: String, required: true },
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  order: { type: Number, default: 0 },
}, { timestamps: true });

const FAQ = mongoose.model("FAQ", faqSchema);

const supportTicketSchema = new mongoose.Schema({
  author: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true },
  content: { type: String, required: true },
  status: { type: String, enum: ["pending", "answered"], default: "pending" },
  answer: { type: String },
  answeredAt: { type: Date },
}, { timestamps: true });

const SupportTicket = mongoose.model("SupportTicket", supportTicketSchema);

// ==================== 관리자 권한 유틸 ====================

/**
 * 관리자 쓰기 작업 권한 확인
 * 조회 전용(adminPermission === "read") 인 경우 403 반환
 * @param {express.Request} req 
 * @param {express.Response} res 
 * @returns {boolean} true: 계속 진행, false: 종료
 */
function ensureAdminWrite(req, res) {
  if (req.adminPermission && req.adminPermission === "read") {
    res.status(403).json({ success: false, message: "조회 전용 관리자 계정은 이 작업을 수행할 수 없습니다" });
    return false;
  }
  return true;
}

// ==================== 라우트 ====================

/**
 * 서버 상태 확인
 */
app.get("/", (_req, res) => {
  res.json({ message: "프로젝트 관리 API 서버가 실행 중입니다!" });
});

// ==================== 프로젝트 API ====================

/**
 * 프로젝트 목록 조회
 * @route GET /api/projects
 * @query {string} search - 검색어
 * @query {string} category - 카테고리 필터
 * @query {string} status - 상태 필터
 * @query {string} sortBy - 정렬 기준 (latest/deadline)
 * @query {number} page - 페이지 번호
 * @query {number} limit - 페이지당 항목 수
 */
app.get("/api/projects", async (req, res) => {
  try {
    const { search, category, status, sortBy = "latest", page = 1, limit = 12 } = req.query;
    const filter = {};
    if (category) filter.category = category;
    if (status) filter.status = status;
    // 관리자에 의해 게재중지된 프로젝트는 사용자 리스트에서 숨김
    filter.isPublished = { $ne: false };
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    const sort = sortBy === "deadline" ? { recruitmentDeadline: 1 } : { createdAt: -1 };
    const skip = (Number(page) - 1) * Number(limit);
    const [projects, totalCount] = await Promise.all([
      Project.find(filter)
        .populate("creator", "nickname username name")
        .sort(sort)
        .skip(skip)
        .limit(Number(limit)),
      Project.countDocuments(filter),
    ]);

    // 로그인한 사용자의 지원 정보 가져오기 (선택적)
    let userApplications = [];
    try {
      const authHeader = req.headers.authorization || "";
      const [, token] = authHeader.split(" ");
      if (token && process.env.JWT_SECRET) {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const applications = await Application.find({ applicant: payload.id }).select("project status");
        userApplications = applications.map((app) => ({
          projectId: String(app.project),
          status: app.status,
        }));
      }
    } catch (e) {
      // 인증 실패는 무시 (비로그인 사용자)
    }

    // 프로젝트에 지원 정보 추가
    const projectsWithApplication = projects.map((project) => {
      const projectObj = project.toObject();
      const application = userApplications.find((app) => app.projectId === String(project._id));
      if (application) {
        projectObj.hasApplied = true;
        projectObj.applicationStatus = application.status;
      } else {
        projectObj.hasApplied = false;
      }
      return projectObj;
    });

    res.json({
      success: true,
      projects: projectsWithApplication,
      pagination: {
        currentPage: Number(page),
        totalPages: Math.ceil(totalCount / Number(limit)),
        totalCount,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 최근 프로젝트 조회
 * @route GET /api/projects/recent
 */
app.get("/api/projects/recent", async (_req, res) => {
  try {
    const projects = await Project.find({ isPublished: { $ne: false } })
      .populate("creator", "nickname username name")
      .sort({ createdAt: -1 })
      .limit(6);
    res.json({ success: true, projects });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 프로젝트 상세 조회
 * @route GET /api/projects/:id
 * @param {string} id - 프로젝트 ID
 */
app.get("/api/projects/:id", async (req, res) => {
  try {
    const project = await Project.findById(req.params.id).populate("creator", "username nickname name");
    if (!project) return res.status(404).json({ success: false, message: "프로젝트를 찾을 수 없습니다" });
    
    const projectObj = project.toObject();
    
    // 로그인한 사용자의 지원 정보 가져오기 (선택적)
    try {
      const authHeader = req.headers.authorization || "";
      const [, token] = authHeader.split(" ");
      if (token && process.env.JWT_SECRET) {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const application = await Application.findOne({ 
          project: project._id, 
          applicant: payload.id 
        });
        if (application) {
          projectObj.hasApplied = true;
          projectObj.applicationStatus = application.status;
        } else {
          projectObj.hasApplied = false;
        }
      } else {
        projectObj.hasApplied = false;
      }
    } catch (e) {
      // 인증 실패는 무시 (비로그인 사용자)
      projectObj.hasApplied = false;
    }
    
    res.json({ success: true, project: projectObj });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 프로젝트 생성
 * @route POST /api/projects
 * @requires auth
 * @body {string} title - 프로젝트 제목
 * @body {string} description - 프로젝트 설명
 * @body {string} category - 카테고리
 * @body {number} maxParticipants - 최대 참여자 수
 * @body {string} deadline - 모집 마감일
 * @body {string} requirements - 요구사항
 * @body {Array} tags - 태그 배열
 */
app.post("/api/projects", auth, async (req, res) => {
  try {
    const { title, description, category, maxParticipants, deadline, requirements, tags } = req.body;
    if (!title || !description || !category || !maxParticipants || !deadline) {
      return res.status(400).json({ success: false, message: "필수 값 누락" });
    }
    const project = await Project.create({
      title,
      description,
      category,
      maxParticipants,
      recruitmentDeadline: new Date(deadline),
      requirements,
      tags: Array.isArray(tags) ? tags : [],
      creator: req.user.id,
      status: "recruiting",
      participants: 1,
    });
    res.json({ success: true, project });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 프로젝트 지원
 * @route POST /api/projects/:id/apply
 * @requires auth
 * @param {string} id - 프로젝트 ID
 */
app.post("/api/projects/:id/apply", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "프로젝트를 찾을 수 없습니다" });
    if (project.status !== "recruiting") {
      return res.status(400).json({ success: false, message: "모집이 마감되었거나 진행할 수 없습니다" });
    }
    if (String(project.creator) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: "내 프로젝트에는 지원할 수 없습니다" });
    }
    if (project.recruitmentDeadline && project.recruitmentDeadline < new Date()) {
      return res.status(400).json({ success: false, message: "모집 기간이 종료되었습니다" });
    }
    // 중복 지원 체크
    const existed = await Application.findOne({ project: project._id, applicant: req.user.id });
    if (existed) {
      return res.status(400).json({ success: false, message: "이미 지원한 프로젝트입니다" });
    }
    await Application.create({ project: project._id, applicant: req.user.id, status: "pending" });
    res.json({ success: true, message: "지원이 완료되었습니다" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 지원 취소
 * @route DELETE /api/projects/:id/apply
 * @requires auth
 * @param {string} id - 프로젝트 ID
 */
app.delete("/api/projects/:id/apply", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "프로젝트를 찾을 수 없습니다" });
    }
    
    const application = await Application.findOne({ 
      project: project._id, 
      applicant: req.user.id 
    });
    
    if (!application) {
      return res.status(404).json({ success: false, message: "지원 내역을 찾을 수 없습니다" });
    }

    await Application.deleteOne({ _id: application._id });
    
    res.json({ success: true, message: "지원이 취소되었습니다" });
  } catch (e) {
    console.error("지원 취소 오류:", e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 지원자 목록 조회
 * @route GET /api/projects/:id/applicants
 * @requires auth
 * @param {string} id - 프로젝트 ID
 */
app.get("/api/projects/:id/applicants", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "프로젝트를 찾을 수 없습니다" });
    if (String(project.creator) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다" });
    }
    const applicants = await Application.find({ project: project._id })
      .populate("applicant", "username nickname name")
      .sort({ createdAt: -1 });
    res.json({ success: true, applicants });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 지원 승인/거절
 * @route POST /api/projects/:id/applicants/:applicantId/:action
 * @requires auth
 * @param {string} id - 프로젝트 ID
 * @param {string} applicantId - 지원자 ID
 * @param {string} action - 액션 (approve/reject)
 */
app.post("/api/projects/:id/applicants/:applicantId/:action", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "프로젝트를 찾을 수 없습니다" });
    if (String(project.creator) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다" });
    }
    const action = req.params.action;
    if (!["approve", "reject"].includes(action)) {
      return res.status(400).json({ success: false, message: "잘못된 요청입니다" });
    }
    const application = await Application.findOne({ project: project._id, applicant: req.params.applicantId });
    if (!application) return res.status(404).json({ success: false, message: "지원 내역이 없습니다" });

    let approvedCount = await Application.countDocuments({ project: project._id, status: "approved" });

    if (action === "approve") {
      if (application.status === "approved") {
        return res.json({ success: true, message: "이미 승인된 지원자입니다" });
      }
      // 진행중 상태에서도 승인 가능하도록 제한 제거 (단, 모집 인원 체크는 유지)
      if (approvedCount + 1 > project.maxParticipants) {
        return res.status(400).json({ success: false, message: "모집 인원을 초과할 수 없습니다" });
      }
      application.status = "approved";
      await application.save();
      approvedCount += 1;
      project.participants = Math.min(project.maxParticipants, approvedCount + 1);
      await project.save();
      return res.json({ success: true, message: "승인되었습니다" });
    } else {
      const wasApproved = application.status === "approved";
      application.status = "rejected";
      await application.save();
      if (wasApproved && approvedCount > 0) {
        approvedCount -= 1;
      }
      project.participants = Math.max(1, Math.min(project.maxParticipants, approvedCount + 1));
      await project.save();
      return res.json({ success: true, message: "거절되었습니다" });
    }
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 프로젝트 수정
 * @route PUT /api/projects/:id
 * @requires auth
 * @param {string} id - 프로젝트 ID
 */
app.put("/api/projects/:id", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "프로젝트를 찾을 수 없습니다" });
    if (String(project.creator) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다" });
    }
    const updatable = ["title", "description", "category", "maxParticipants", "requirements", "tags", "status"];
    for (const key of updatable) {
      if (key in req.body) {
        if (key === "tags" && !Array.isArray(req.body.tags)) continue;
        project[key] = req.body[key];
      }
    }
    if (req.body.deadline) {
      project.recruitmentDeadline = new Date(req.body.deadline);
    }
    await project.save();
    res.json({ success: true, project });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 프로젝트 삭제
 * @route DELETE /api/projects/:id
 * @requires auth
 * @param {string} id - 프로젝트 ID
 */
app.delete("/api/projects/:id", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "프로젝트를 찾을 수 없습니다" });
    if (String(project.creator) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다" });
    }
    await Application.deleteMany({ project: project._id });
    await project.deleteOne();
    res.json({ success: true, message: "삭제되었습니다" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 대시보드 통계 조회
 * @route GET /api/dashboard/stats
 * @requires auth
 */
app.get("/api/dashboard/stats", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const [myProjects, myApplications] = await Promise.all([
      Project.countDocuments({ creator: userId }),
      Application.countDocuments({ applicant: userId }),
    ]);

    // "참여한 프로젝트/완료한 프로젝트"는 유저가 실제로 승인받은 지원(approved) 기준으로 계산
    const approvedApps = await Application.find({ applicant: userId, status: "approved" }).select("project");
    const projectIds = approvedApps.map((a) => a.project).filter(Boolean);

    const participatedProjects = projectIds.length
      ? await Project.countDocuments({ _id: { $in: projectIds }, status: { $in: ["recruiting", "in-progress"] } })
      : 0;

    const completedProjects = projectIds.length
      ? await Project.countDocuments({ _id: { $in: projectIds }, status: "completed" })
      : 0;

    res.json({
      success: true,
      stats: {
        // 기존 프론트(profile.js)에서 "참여한 프로젝트"로 쓰는 키
        activeProjects: participatedProjects,
        myPosts: myProjects,
        applications: myApplications,
        completedProjects: completedProjects,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 대시보드 최근 활동 조회
 * @route GET /api/dashboard/activities
 * @requires auth
 */
app.get("/api/dashboard/activities", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    // 최근 생성한 프로젝트와 최근 지원 내역을 기반으로 활동 메시지 생성
    const [recentProjects, recentApplications] = await Promise.all([
      Project.find({ creator: userId })
        .sort({ createdAt: -1 })
        .limit(10),
      Application.find({ applicant: userId })
        .populate("project", "title status")
        .sort({ createdAt: -1 })
        .limit(10),
    ]);

    const now = new Date();
    const isRecent = (date) => {
      if (!date) return false;
      const diffDays = (now - date) / (1000 * 60 * 60 * 24);
      return diffDays <= 7; // 최근 7일 이내면 새 활동으로 간주
    };

    const projectActivities = recentProjects.map((project) => ({
      type: "project_created",
      createdAt: project.createdAt,
      isNew: isRecent(project.createdAt),
      message: `프로젝트 "${project.title}"을(를) 생성했습니다.`,
    }));

    const applicationActivities = recentApplications
      .filter((app) => app.project)
      .map((app) => {
        let statusText = "대기중";
        if (app.status === "approved") statusText = "승인됨";
        else if (app.status === "rejected") statusText = "거절됨";

        return {
          type: "project_applied",
          createdAt: app.createdAt,
          isNew: isRecent(app.createdAt),
          message: `"${app.project.title}" 프로젝트에 지원했습니다. (상태: ${statusText})`,
        };
      });

    const activities = [...projectActivities, ...applicationActivities]
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 10)
      .map(({ createdAt, ...rest }) => rest); // createdAt은 정렬용이므로 응답에서는 제외

    res.json({
      success: true,
      activities,
    });
  } catch (e) {
    console.error("대시보드 최근 활동 조회 오류:", e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 내 프로젝트 목록 조회
 * @route GET /api/my-projects
 * @requires auth
 */
app.get("/api/my-projects", auth, async (req, res) => {
  try {
    const [createdProjects, appliedApplications] = await Promise.all([
      Project.find({ creator: req.user.id })
        .populate("creator", "nickname username name")
        .sort({ createdAt: -1 }),
      Application.find({ applicant: req.user.id })
        .populate({
          path: "project",
          populate: { path: "creator", select: "nickname username name" },
        })
        .sort({ createdAt: -1 }),
    ]);

    const participatedProjects = appliedApplications
      .filter((application) => application.project)
      .map((application) => {
        const projectObj = application.project.toObject();
        return {
          ...projectObj,
          applicationStatus: application.status,
          appliedAt: application.createdAt,
        };
      });

    res.json({
      success: true,
      projects: {
        created: createdProjects,
        participated: participatedProjects,
      },
    });
  } catch (e) {
    console.error("내 프로젝트 API 오류:", e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ==================== 인증 API ====================

/**
 * 회원가입
 * @route POST /api/auth/register
 * @body {string} username - 아이디
 * @body {string} password - 비밀번호
 * @body {string} nickname - 닉네임
 * @body {string} name - 이름
 * @body {string} phone - 전화번호
 */
app.post("/api/auth/register", async (req, res) => {
  try {
    const { username, name, nickname, phone, password } = req.body;
    if (!username || !password || !nickname) {
      return res.status(400).json({ success: false, message: "필수 값 누락" });
    }
    
    // 비밀번호 검증
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: "비밀번호는 최소 6자 이상이어야 합니다" });
    }
    
    // 아이디 중복 확인
    const existed = await User.findOne({ username });
    if (existed) {
      return res.status(400).json({ success: false, message: "이미 존재하는 아이디입니다" });
    }
    
    // 비밀번호 해싱
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ username, name, nickname, phone, password: hashed });
    return res.json({
      success: true,
      user: { id: user._id, username: user.username, nickname: user.nickname, name: user.name, phone: user.phone },
    });
  } catch (e) {
    console.error(e);
    if (e.code === 11000) {
      return res.status(400).json({ success: false, message: "이미 사용 중인 아이디입니다" });
    }
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 로그인
 * @route POST /api/auth/login
 * @body {string} username - 아이디
 * @body {string} password - 비밀번호
 */
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "아이디와 비밀번호를 입력해주세요" });
    }
    
    const user = await User.findOne({ username });
    if (!user) return res.status(400).json({ success: false, message: "아이디 또는 비밀번호가 올바르지 않습니다" });

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) return res.status(400).json({ success: false, message: "아이디 또는 비밀번호가 올바르지 않습니다" });

    // 3개월 이상 미접속 계정 자동 정지
    if (user.lastActivityAt) {
      const now = new Date();
      const threeMonthsAgo = new Date(now);
      threeMonthsAgo.setMonth(now.getMonth() - 3);
      if (user.lastActivityAt < threeMonthsAgo && user.status === "active") {
        user.status = "suspended";
        await user.save();
      }
    }

    if (user.status !== "active") {
      return res.status(403).json({ success: false, message: "정지된 계정입니다" });
    }

    user.lastActivityAt = new Date();
    await user.save();

    if (!process.env.JWT_SECRET) {
      console.error("JWT_SECRET이 설정되지 않았습니다!");
      return res.status(500).json({ success: false, message: "서버 설정 오류" });
    }

    const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "7d" });
    return res.json({
      success: true,
      token,
      user: { 
        id: user._id, 
        username: user.username, 
        nickname: user.nickname, 
        name: user.name, 
        phone: user.phone,
        role: user.role || "user",
        status: user.status || "active"
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 현재 사용자 정보 조회
 * @route GET /api/auth/me
 * @requires auth
 */
app.get("/api/auth/me", auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다" });
    }
    return res.json({
      success: true,
      user: { 
        id: user._id, 
        username: user.username, 
        nickname: user.nickname, 
        name: user.name, 
        phone: user.phone,
        email: user.email,
        role: user.role || "user",
        status: user.status || "active",
        adminPermission: user.adminPermission || undefined,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 계정 삭제 (회원 탈퇴)
 * @route DELETE /api/auth/account
 * @requires auth
 */
app.delete("/api/auth/account", auth, async (req, res) => {
  try {
    const userId = req.user.id;

    const createdProjects = await Project.find({ creator: userId });
    if (createdProjects.length > 0) {
      return res.status(400).json({ 
        success: false, 
        message: `생성한 프로젝트가 ${createdProjects.length}개 있어 탈퇴할 수 없습니다. 먼저 프로젝트를 삭제하거나 다른 사용자에게 소유권을 이전해주세요.` 
      });
    }

    await Application.deleteMany({ applicant: userId });
    await Task.updateMany({ assignee: userId }, { $unset: { assignee: 1 } });
    await User.deleteOne({ _id: userId });

    return res.json({ success: true, message: "회원 탈퇴가 완료되었습니다" });
  } catch (e) {
    console.error("회원 탈퇴 오류:", e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 비밀번호 변경
 * @route PUT /api/auth/password
 * @requires auth
 * @body {string} currentPassword - 현재 비밀번호
 * @body {string} newPassword - 새 비밀번호
 */
app.put("/api/auth/password", auth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: "현재 비밀번호와 새 비밀번호를 입력해주세요" });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: "비밀번호는 최소 6자 이상이어야 합니다" });
    }

    const user = await User.findById(req.user.id).select("password");
    if (!user) {
      return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다" });
    }

    const ok = await bcrypt.compare(String(currentPassword), user.password);
    if (!ok) {
      return res.status(400).json({ success: false, message: "현재 비밀번호가 올바르지 않습니다" });
    }

    user.password = await bcrypt.hash(String(newPassword), 10);
    await user.save();

    return res.json({ success: true, message: "비밀번호가 변경되었습니다" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ==================== 사용자 차단 API ====================

/**
 * 차단한 사용자 목록 조회
 * @route GET /api/users/blocked
 * @requires auth
 */
app.get("/api/users/blocked", auth, async (req, res) => {
  try {
    const me = await User.findById(req.user.id)
      .populate("blockedUsers.user", "nickname username name");
    if (!me) {
      return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다" });
    }

    const blocked = (me.blockedUsers || []).map((entry) => ({
      _id: entry.user ? entry.user._id : undefined,
      nickname: entry.user ? (entry.user.nickname || entry.user.username || entry.user.name) : "알 수 없음",
      blockedAt: entry.blockedAt,
    }));

    res.json({ success: true, blockedUsers: blocked });
  } catch (e) {
    console.error("차단한 사용자 목록 조회 오류:", e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 사용자 차단
 * @route POST /api/users/:id/block
 * @requires auth
 * @param {string} id - 차단할 사용자 ID
 */
app.post("/api/users/:id/block", auth, async (req, res) => {
  try {
    const targetId = req.params.id;
    if (String(targetId) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: "자기 자신은 차단할 수 없습니다" });
    }

    const [me, target] = await Promise.all([
      User.findById(req.user.id),
      User.findById(targetId).select("nickname username name"),
    ]);

    if (!me || !target) {
      return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다" });
    }

    const exists = (me.blockedUsers || []).some((entry) => String(entry.user) === String(targetId));
    if (exists) {
      return res.json({ success: true, message: "이미 차단한 사용자입니다" });
    }

    me.blockedUsers.push({ user: targetId, blockedAt: new Date() });
    await me.save();

    res.json({
      success: true,
      message: "사용자를 차단했습니다",
      blockedUser: {
        _id: target._id,
        nickname: target.nickname || target.username || target.name,
        blockedAt: new Date(),
      },
    });
  } catch (e) {
    console.error("사용자 차단 오류:", e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 사용자 차단 해제
 * @route DELETE /api/users/:id/block
 * @requires auth
 * @param {string} id - 차단 해제할 사용자 ID
 */
app.delete("/api/users/:id/block", auth, async (req, res) => {
  try {
    const targetId = req.params.id;
    const me = await User.findById(req.user.id);
    if (!me) {
      return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다" });
    }

    const originalLength = (me.blockedUsers || []).length;
    me.blockedUsers = (me.blockedUsers || []).filter((entry) => String(entry.user) !== String(targetId));

    if (me.blockedUsers.length === originalLength) {
      return res.status(404).json({ success: false, message: "차단한 사용자 목록에서 찾을 수 없습니다" });
    }

    await me.save();

    res.json({ success: true, message: "차단이 해제되었습니다" });
  } catch (e) {
    console.error("사용자 차단 해제 오류:", e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ==================== 작업 관리 API ====================

/**
 * 작업 목록 조회
 * @route GET /api/projects/:id/tasks
 * @requires auth
 * @param {string} id - 프로젝트 ID
 */
app.get("/api/projects/:id/tasks", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "프로젝트를 찾을 수 없습니다" });
    if (String(project.creator) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다" });
    }

    const tasks = await Task.find({ project: project._id })
      .populate("assignee", "nickname username name")
      .populate("parentTask", "title")
      .sort({ order: 1, createdAt: 1 });

    res.json({ success: true, tasks });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 작업 생성
 * @route POST /api/projects/:id/tasks
 * @requires auth
 * @param {string} id - 프로젝트 ID
 */
app.post("/api/projects/:id/tasks", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "프로젝트를 찾을 수 없습니다" });
    
    // 프로젝트 소유자이거나 승인된 참여자인지 확인
    const isCreator = String(project.creator) === String(req.user.id);
    const userApplication = await Application.findOne({
      project: project._id,
      applicant: req.user.id,
      status: "approved",
    });
    const isParticipant = !!userApplication;
    
    // 소유자도 아니고 참여자도 아니면 권한 없음
    if (!isCreator && !isParticipant) {
      return res.status(403).json({ success: false, message: "권한이 없습니다" });
    }
    
    // 구성원(참여자)은 본인에게만 할당 가능
    if (!isCreator && req.body.assignee && String(req.body.assignee) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "구성원은 본인에게만 작업을 할당할 수 있습니다" });
    }

    const { title, description, parentTask, assignee, dueDate, startDate, endDate } = req.body;
    // endDate는 제거하고 dueDate만 사용하도록 전환
    // (기존 클라이언트가 endDate만 보내는 경우를 대비해 dueDate가 없으면 승격)
    const effectiveDueDate = dueDate ? dueDate : endDate;

    // 최대 order 값 찾기
    const maxOrder = await Task.findOne({ project: project._id, parentTask: parentTask || null })
      .sort({ order: -1 })
      .select("order");

    const task = await Task.create({
      project: project._id,
      title: title || "새 작업",
      description,
      parentTask: parentTask || null,
      assignee: assignee || null,
      dueDate: effectiveDueDate ? new Date(effectiveDueDate) : null,
      startDate: startDate ? new Date(startDate) : null,
      endDate: null, // 종료일 필드는 사용하지 않음
      order: maxOrder ? maxOrder.order + 1 : 0,
    });

    const populatedTask = await Task.findById(task._id)
      .populate("assignee", "nickname username name")
      .populate("parentTask", "title");

    res.json({ success: true, task: populatedTask });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 작업 수정
 * @route PUT /api/projects/:id/tasks/:taskId
 * @requires auth
 * @param {string} id - 프로젝트 ID
 * @param {string} taskId - 작업 ID
 */
app.put("/api/projects/:id/tasks/:taskId", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "프로젝트를 찾을 수 없습니다" });
    
    // 프로젝트 소유자이거나 승인된 참여자인지 확인
    const isCreator = String(project.creator) === String(req.user.id);
    const userApplication = await Application.findOne({
      project: project._id,
      applicant: req.user.id,
      status: "approved",
    });
    const isParticipant = !!userApplication;
    
    // 소유자도 아니고 참여자도 아니면 권한 없음
    if (!isCreator && !isParticipant) {
      return res.status(403).json({ success: false, message: "권한이 없습니다" });
    }

    const task = await Task.findOne({ _id: req.params.taskId, project: project._id });
    if (!task) return res.status(404).json({ success: false, message: "작업을 찾을 수 없습니다" });

    // 구성원(참여자)은 본인에게만 할당 가능
    if (!isCreator && "assignee" in req.body && req.body.assignee && String(req.body.assignee) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "구성원은 본인에게만 작업을 할당할 수 있습니다" });
    }

    // endDate는 제거하고 dueDate만 사용
    // (단, 구버전 클라이언트가 endDate만 보내는 경우를 대비해 dueDate가 없으면 승격)
    if (!("dueDate" in req.body) && ("endDate" in req.body)) {
      req.body.dueDate = req.body.endDate;
    }

    const updatable = ["title", "description", "parentTask", "assignee", "dueDate", "startDate", "status", "order"];
    for (const key of updatable) {
      if (key in req.body) {
        if (key === "dueDate" || key === "startDate") {
          task[key] = req.body[key] ? new Date(req.body[key]) : null;
        } else {
          task[key] = req.body[key];
        }
      }
    }

    // 종료일 값은 유지하지 않음
    task.endDate = null;

    await task.save();

    const populatedTask = await Task.findById(task._id)
      .populate("assignee", "nickname username name")
      .populate("parentTask", "title");

    res.json({ success: true, task: populatedTask });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 작업 삭제
 * @route DELETE /api/projects/:id/tasks/:taskId
 * @requires auth
 * @param {string} id - 프로젝트 ID
 * @param {string} taskId - 작업 ID
 */
app.delete("/api/projects/:id/tasks/:taskId", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "프로젝트를 찾을 수 없습니다" });
    if (String(project.creator) !== String(req.user.id)) {
      return res.status(403).json({ success: false, message: "권한이 없습니다" });
    }

    const task = await Task.findOne({ _id: req.params.taskId, project: project._id });
    if (!task) return res.status(404).json({ success: false, message: "작업을 찾을 수 없습니다" });

    // 세부 작업도 함께 삭제
    await Task.deleteMany({ parentTask: task._id });
    await Task.deleteOne({ _id: task._id });

    res.json({ success: true, message: "작업이 삭제되었습니다" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 프로젝트 참여자 목록 조회
 * @route GET /api/projects/:id/participants
 * @requires auth
 * @param {string} id - 프로젝트 ID
 */
app.get("/api/projects/:id/participants", auth, async (req, res) => {
  try {
    const project = await Project.findById(req.params.id);
    if (!project) return res.status(404).json({ success: false, message: "프로젝트를 찾을 수 없습니다" });
    
    // 프로젝트 소유자이거나 승인된 참여자인지 확인
    const isCreator = String(project.creator) === String(req.user.id);
    const userApplication = await Application.findOne({
      project: project._id,
      applicant: req.user.id,
      status: "approved",
    });
    const isParticipant = !!userApplication;
    
    // 소유자도 아니고 참여자도 아니면 권한 없음
    if (!isCreator && !isParticipant) {
      return res.status(403).json({ success: false, message: "권한이 없습니다" });
    }

    // 승인된 지원자 + 작성자
    const approvedApplications = await Application.find({
      project: project._id,
      status: "approved",
    }).populate("applicant", "nickname username name");

    const participants = [];

    const creator = await User.findById(project.creator).select("nickname username name");
    if (creator) {
      participants.push({
        _id: creator._id,
        nickname: creator.nickname || creator.username,
        username: creator.username,
        name: creator.name || creator.username,
      });
    } else {
      participants.push({
        _id: project.creator,
        nickname: "작성자",
        username: "creator",
        name: "작성자",
      });
    }

    approvedApplications.forEach((app) => {
      if (app.applicant) {
        const isCreator = String(app.applicant._id) === String(project.creator);
        if (!isCreator) {
          participants.push({
            _id: app.applicant._id,
            nickname: app.applicant.nickname || app.applicant.username,
            username: app.applicant.username,
            name: app.applicant.name || app.applicant.username,
          });
        }
      }
    });

    res.json({ success: true, participants });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ==================== 관리자 API ====================

/**
 * 유저 목록 조회
 * @route GET /api/admin/users
 * @requires auth, admin
 */
app.get("/api/admin/users", auth, admin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const filter = { role: { $ne: "admin" } };
    
    if (status && status !== "all") {
      filter.status = status;
    }
    
    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { nickname: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
      ];
    }
    
    const skip = (Number(page) - 1) * Number(limit);
    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      User.countDocuments(filter),
    ]);
    
    res.json({
      success: true,
      users,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 유저 상세 정보 조회
 * @route GET /api/admin/users/:id
 * @requires auth, admin
 * @param {string} id - 사용자 ID
 */
app.get("/api/admin/users/:id", auth, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) {
      return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다" });
    }
    
    const createdProjects = await Project.countDocuments({ creator: user._id });
    const appliedProjects = await Application.countDocuments({ applicant: user._id });
    
    res.json({
      success: true,
      user: {
        ...user.toObject(),
        stats: {
          createdProjects,
          appliedProjects,
        },
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 유저 상태 변경
 * @route PUT /api/admin/users/:id/status
 * @requires auth, admin
 * @param {string} id - 사용자 ID
 */
app.put("/api/admin/users/:id/status", auth, admin, async (req, res) => {
  try {
    if (!ensureAdminWrite(req, res)) return;
    const { status } = req.body;
    if (!["active", "suspended", "dormant", "withdrawn"].includes(status)) {
      return res.status(400).json({ success: false, message: "유효하지 않은 상태입니다" });
    }
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: "사용자를 찾을 수 없습니다" });
    }
    
    user.status = status;
    await user.save();
    
    res.json({ success: true, message: "유저 상태가 변경되었습니다", user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 프로젝트 목록 조회 (관리자용)
 * @route GET /api/admin/projects
 * @requires auth, admin
 */
app.get("/api/admin/projects", auth, admin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const filter = {};
    
    if (status && status !== "all") {
      filter.status = status;
    }
    
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: "i" } },
        { description: { $regex: search, $options: "i" } },
      ];
    }
    
    const skip = (Number(page) - 1) * Number(limit);
    const [projects, total] = await Promise.all([
      Project.find(filter)
        .populate("creator", "nickname username name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      Project.countDocuments(filter),
    ]);
    
    res.json({
      success: true,
      projects,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 프로젝트 삭제 (관리자용)
 * @route DELETE /api/admin/projects/:id
 * @requires auth, admin
 * @param {string} id - 프로젝트 ID
 */
app.delete("/api/admin/projects/:id", auth, admin, async (req, res) => {
  try {
    if (!ensureAdminWrite(req, res)) return;
    const project = await Project.findById(req.params.id).populate("creator", "nickname username");
    if (!project) {
      return res.status(404).json({ success: false, message: "프로젝트를 찾을 수 없습니다" });
    }
    
    await Task.deleteMany({ project: project._id });
    await Application.deleteMany({ project: project._id });
    await Project.deleteOne({ _id: project._id });
    
    res.json({
      success: true,
      message: "프로젝트가 삭제되었습니다",
      deletedProject: {
        id: project._id,
        title: project.title,
        creator: project.creator ? {
          id: project.creator._id,
          nickname: project.creator.nickname,
          username: project.creator.username,
        } : null,
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 프로젝트 게시 상태 변경 (게재/게재중지)
 * @route PUT /api/admin/projects/:id/publish
 * @requires auth, admin
 * @param {string} id - 프로젝트 ID
 */
app.put("/api/admin/projects/:id/publish", auth, admin, async (req, res) => {
  try {
    if (!ensureAdminWrite(req, res)) return;

    const { isPublished } = req.body;
    if (typeof isPublished !== "boolean") {
      return res.status(400).json({ success: false, message: "유효하지 않은 게시 상태입니다" });
    }

    const project = await Project.findById(req.params.id);
    if (!project) {
      return res.status(404).json({ success: false, message: "프로젝트를 찾을 수 없습니다" });
    }

    project.isPublished = isPublished;
    await project.save();

    res.json({
      success: true,
      project,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 공지사항 목록 조회 (페이지네이션)
 * @route GET /api/admin/notices
 * @query {number} page - 페이지
 * @query {number} limit - 페이지당 개수
 * @requires auth, admin
 */
app.get("/api/admin/notices", auth, admin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const [notices, total] = await Promise.all([
      Notice.find()
        .populate("author", "nickname username")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notice.countDocuments(),
    ]);

    res.json({ success: true, notices, total, page, limit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 공지사항 단건 조회 (수정용)
 * @route GET /api/admin/notices/:id
 * @requires auth, admin
 */
app.get("/api/admin/notices/:id", auth, admin, async (req, res) => {
  try {
    const notice = await Notice.findById(req.params.id).populate("author", "nickname username").lean();
    if (!notice) {
      return res.status(404).json({ success: false, message: "공지사항을 찾을 수 없습니다" });
    }
    res.json({ success: true, notice });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 공지사항 생성
 * @route POST /api/admin/notices
 * @requires auth, admin
 */
app.post("/api/admin/notices", auth, admin, async (req, res) => {
  try {
    if (!ensureAdminWrite(req, res)) return;
    const { title, content, isImportant } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, message: "제목과 내용을 입력해주세요" });
    }
    
    const notice = await Notice.create({
      title,
      content,
      author: req.user.id,
      isImportant: isImportant || false,
    });
    
    const populatedNotice = await Notice.findById(notice._id).populate("author", "nickname username");
    
    res.json({ success: true, notice: populatedNotice });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 공지사항 수정
 * @route PUT /api/admin/notices/:id
 * @requires auth, admin
 * @param {string} id - 공지사항 ID
 */
app.put("/api/admin/notices/:id", auth, admin, async (req, res) => {
  try {
    if (!ensureAdminWrite(req, res)) return;
    const { title, content, isImportant } = req.body;
    const notice = await Notice.findById(req.params.id);
    
    if (!notice) {
      return res.status(404).json({ success: false, message: "공지사항을 찾을 수 없습니다" });
    }
    
    if (title) notice.title = title;
    if (content) notice.content = content;
    if (isImportant !== undefined) notice.isImportant = isImportant;
    
    await notice.save();
    
    const populatedNotice = await Notice.findById(notice._id).populate("author", "nickname username");
    
    res.json({ success: true, notice: populatedNotice });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 공지사항 삭제
 * @route DELETE /api/admin/notices/:id
 * @requires auth, admin
 * @param {string} id - 공지사항 ID
 */
app.delete("/api/admin/notices/:id", auth, admin, async (req, res) => {
  try {
    if (!ensureAdminWrite(req, res)) return;
    const notice = await Notice.findById(req.params.id);
    if (!notice) {
      return res.status(404).json({ success: false, message: "공지사항을 찾을 수 없습니다" });
    }
    
    await Notice.deleteOne({ _id: notice._id });
    res.json({ success: true, message: "공지사항이 삭제되었습니다" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ==================== 공지/FAQ 공개 API ====================

/**
 * 공지사항 목록 조회 (사용자용)
 * @route GET /api/notices
 */
app.get("/api/notices", async (_req, res) => {
  try {
    const notices = await Notice.find()
      .populate("author", "nickname username")
      .sort({ isImportant: -1, createdAt: -1 });

    res.json({
      success: true,
      notices,
    });
  } catch (e) {
    console.error("공지사항 목록 조회 오류:", e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * FAQ 목록 조회 (사용자용)
 * @route GET /api/faqs
 */
app.get("/api/faqs", async (_req, res) => {
  try {
    const faqs = await FAQ.find()
      .populate("author", "nickname username")
      .sort({ order: 1, createdAt: -1 });

    res.json({
      success: true,
      faqs,
    });
  } catch (e) {
    console.error("FAQ 목록 조회 오류:", e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * FAQ 목록 조회
 * @route GET /api/admin/faqs
 * @requires auth, admin
 */
app.get("/api/admin/faqs", auth, admin, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const skip = (page - 1) * limit;

    const [faqs, total] = await Promise.all([
      FAQ.find()
        .populate("author", "nickname username")
        .sort({ order: 1, createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      FAQ.countDocuments(),
    ]);

    res.json({ success: true, faqs, total, page, limit });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * FAQ 단건 조회 (수정용)
 * @route GET /api/admin/faqs/:id
 * @requires auth, admin
 */
app.get("/api/admin/faqs/:id", auth, admin, async (req, res) => {
  try {
    const faq = await FAQ.findById(req.params.id).populate("author", "nickname username").lean();
    if (!faq) {
      return res.status(404).json({ success: false, message: "FAQ를 찾을 수 없습니다" });
    }
    res.json({ success: true, faq });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * FAQ 생성
 * @route POST /api/admin/faqs
 * @requires auth, admin
 */
app.post("/api/admin/faqs", auth, admin, async (req, res) => {
  try {
    if (!ensureAdminWrite(req, res)) return;
    const { question, answer, order } = req.body;
    if (!question || !answer) {
      return res.status(400).json({ success: false, message: "질문과 답변을 입력해주세요" });
    }

    const orderNum = parseInt(order, 10);
    const safeOrder = Number.isNaN(orderNum) || orderNum < 1 ? 1 : orderNum;
    
    const faq = await FAQ.create({
      question,
      answer,
      author: req.user.id,
      order: safeOrder,
    });
    
    const populatedFAQ = await FAQ.findById(faq._id).populate("author", "nickname username");
    
    res.json({ success: true, faq: populatedFAQ });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * FAQ 수정
 * @route PUT /api/admin/faqs/:id
 * @requires auth, admin
 * @param {string} id - FAQ ID
 */
app.put("/api/admin/faqs/:id", auth, admin, async (req, res) => {
  try {
    if (!ensureAdminWrite(req, res)) return;
    const { question, answer, order } = req.body;
    const faq = await FAQ.findById(req.params.id);
    
    if (!faq) {
      return res.status(404).json({ success: false, message: "FAQ를 찾을 수 없습니다" });
    }
    
    if (question) faq.question = question;
    if (answer) faq.answer = answer;
    if (order !== undefined) {
      const orderNum = parseInt(order, 10);
      const safeOrder = Number.isNaN(orderNum) || orderNum < 1 ? 1 : orderNum;
      faq.order = safeOrder;
    }
    
    await faq.save();
    
    const populatedFAQ = await FAQ.findById(faq._id).populate("author", "nickname username");
    
    res.json({ success: true, faq: populatedFAQ });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * FAQ 삭제
 * @route DELETE /api/admin/faqs/:id
 * @requires auth, admin
 * @param {string} id - FAQ ID
 */
app.delete("/api/admin/faqs/:id", auth, admin, async (req, res) => {
  try {
    if (!ensureAdminWrite(req, res)) return;
    const faq = await FAQ.findById(req.params.id);
    if (!faq) {
      return res.status(404).json({ success: false, message: "FAQ를 찾을 수 없습니다" });
    }
    
    await FAQ.deleteOne({ _id: faq._id });
    res.json({ success: true, message: "FAQ가 삭제되었습니다" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 관리자 계정 목록 조회
 * @route GET /api/admin/admin-accounts
 * @requires auth, admin
 */
app.get("/api/admin/admin-accounts", auth, admin, async (req, res) => {
  try {
    const { page = 1, limit = 20, search } = req.query;
    const filter = { role: "admin" };

    if (search) {
      filter.$or = [
        { username: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [admins, total] = await Promise.all([
      User.find(filter)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      User.countDocuments(filter),
    ]);

    res.json({
      success: true,
      admins,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 관리자 계정 상세 조회
 * @route GET /api/admin/admin-accounts/:id
 * @requires auth, admin
 */
app.get("/api/admin/admin-accounts/:id", auth, admin, async (req, res) => {
  try {
    const adminUser = await User.findOne({ _id: req.params.id, role: "admin" }).select("-password");
    if (!adminUser) {
      return res.status(404).json({ success: false, message: "관리자 계정을 찾을 수 없습니다" });
    }

    res.json({ success: true, admin: adminUser });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 관리자 계정 생성
 * @route POST /api/admin/admin-accounts
 * @requires auth, admin
 */
app.post("/api/admin/admin-accounts", auth, admin, async (req, res) => {
  try {
    if (!ensureAdminWrite(req, res)) return;

    const { username, name, email, password, permission } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "아이디와 비밀번호는 필수입니다" });
    }

    const existed = await User.findOne({ username });
    if (existed) {
      return res.status(400).json({ success: false, message: "이미 사용 중인 아이디입니다" });
    }

    const hashed = await bcrypt.hash(password, 10);
    const adminUser = await User.create({
      username,
      name,
      email,
      password: hashed,
      role: "admin",
      status: "active",
      adminPermission: permission === "read" ? "read" : "full",
    });

    const plainAdmin = adminUser.toObject();
    delete plainAdmin.password;

    res.json({ success: true, admin: plainAdmin });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 관리자 계정 수정 (권한/정보)
 * @route PUT /api/admin/admin-accounts/:id
 * @requires auth, admin
 */
app.put("/api/admin/admin-accounts/:id", auth, admin, async (req, res) => {
  try {
    if (!ensureAdminWrite(req, res)) return;

    const { name, email, permission } = req.body;
    const adminUser = await User.findOne({ _id: req.params.id, role: "admin" });
    if (!adminUser) {
      return res.status(404).json({ success: false, message: "관리자 계정을 찾을 수 없습니다" });
    }

    if (name !== undefined) adminUser.name = name;
    if (email !== undefined) adminUser.email = email;
    if (permission === "read" || permission === "full") {
      adminUser.adminPermission = permission;
    }

    await adminUser.save();
    const plainAdmin = adminUser.toObject();
    delete plainAdmin.password;

    res.json({ success: true, admin: plainAdmin });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 관리자 계정 삭제
 * @route DELETE /api/admin/admin-accounts/:id
 * @requires auth, admin
 */
app.delete("/api/admin/admin-accounts/:id", auth, admin, async (req, res) => {
  try {
    if (!ensureAdminWrite(req, res)) return;

    const adminUser = await User.findOne({ _id: req.params.id, role: "admin" });
    if (!adminUser) {
      return res.status(404).json({ success: false, message: "관리자 계정을 찾을 수 없습니다" });
    }

    // 자신 계정 삭제 방지
    if (String(adminUser._id) === String(req.user.id)) {
      return res.status(400).json({ success: false, message: "본인 계정은 삭제할 수 없습니다" });
    }

    await User.deleteOne({ _id: adminUser._id });
    res.json({ success: true, message: "관리자 계정이 삭제되었습니다" });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 고객센터 문의 목록 조회
 * @route GET /api/admin/support
 * @requires auth, admin
 */
app.get("/api/admin/support", auth, admin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status } = req.query;
    const filter = {};

    if (status && status !== "all") {
      filter.status = status;
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .populate("author", "nickname username name")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      SupportTicket.countDocuments(filter),
    ]);

    res.json({
      success: true,
      tickets,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 고객센터 문의 상세 조회
 * @route GET /api/admin/support/:id
 * @requires auth, admin
 */
app.get("/api/admin/support/:id", auth, admin, async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id).populate("author", "nickname username name");
    if (!ticket) {
      return res.status(404).json({ success: false, message: "문의글을 찾을 수 없습니다" });
    }

    res.json({ success: true, ticket });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 고객센터 문의 답변 등록/수정
 * @route POST /api/admin/support/:id/answer
 * @requires auth, admin
 */
app.post("/api/admin/support/:id/answer", auth, admin, async (req, res) => {
  try {
    if (!ensureAdminWrite(req, res)) return;

    const { answer } = req.body;
    const ticket = await SupportTicket.findById(req.params.id).populate("author", "nickname username name");
    if (!ticket) {
      return res.status(404).json({ success: false, message: "문의글을 찾을 수 없습니다" });
    }

    ticket.answer = answer;
    ticket.status = answer ? "answered" : "pending";
    ticket.answeredAt = answer ? new Date() : null;
    await ticket.save();

    res.json({ success: true, ticket });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ==================== 고객센터 API (사용자용) ====================

/**
 * 문의 등록
 * @route POST /api/support
 * @requires auth
 */
app.post("/api/support", auth, async (req, res) => {
  try {
    const { title, content } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, message: "제목과 내용을 입력해주세요" });
    }

    const ticket = await SupportTicket.create({
      author: req.user.id,
      title,
      content,
      status: "pending",
    });

    res.json({ success: true, ticket });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 내 문의 목록 조회
 * @route GET /api/support/my
 * @requires auth
 */
app.get("/api/support/my", auth, async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const filter = { author: req.user.id };
    const skip = (Number(page) - 1) * Number(limit);

    const [tickets, total] = await Promise.all([
      SupportTicket.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(Number(limit)),
      SupportTicket.countDocuments(filter),
    ]);

    res.json({
      success: true,
      tickets,
      total,
      page: Number(page),
      limit: Number(limit),
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

/**
 * 내 문의 상세 조회
 * @route GET /api/support/:id
 * @requires auth
 */
app.get("/api/support/:id", auth, async (req, res) => {
  try {
    const ticket = await SupportTicket.findById(req.params.id);
    if (!ticket || String(ticket.author) !== String(req.user.id)) {
      return res.status(404).json({ success: false, message: "문의글을 찾을 수 없습니다" });
    }

    res.json({ success: true, ticket });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "서버 오류" });
  }
});

// ==================== 에러 핸들러 ====================

/**
 * 404 핸들러
 */
app.use((req, res) => {
  console.log(`404 - ${req.method} ${req.path} - 라우트를 찾을 수 없습니다`);
  res.status(404).json({ success: false, message: "요청한 리소스를 찾을 수 없습니다" });
});

// ==================== 서버 시작 ====================

/**
 * 서버 시작
 * 모든 네트워크 인터페이스(0.0.0.0)에서 접속 가능하도록 바인딩
 */
app.listen(PORT, "0.0.0.0", () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`로컬 접속: http://localhost:${PORT}`);
  console.log(`네트워크 접속: http://[서버IP]:${PORT}`);
  
  const os = require("os");
  const networkInterfaces = os.networkInterfaces();
  console.log("\n=== 네트워크 접속 정보 ===");
  Object.keys(networkInterfaces).forEach((interfaceName) => {
    networkInterfaces[interfaceName].forEach((iface) => {
      if (iface.family === "IPv4" && !iface.internal) {
        console.log(`  http://${iface.address}:${PORT}`);
      }
    });
  });
  console.log("========================\n");
});
