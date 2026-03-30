const mongoose = require("mongoose");
require("dotenv").config();

const userSchema = new mongoose.Schema({
  username: { type: String, unique: true, required: true },
  name: String,
  nickname: String,
  phone: String,
  password: { type: String, required: true },
  role: { type: String, enum: ["user", "admin"], default: "user" },
  status: { type: String, enum: ["active", "suspended", "dormant", "withdrawn"], default: "active" },
  lastActivityAt: { type: Date, default: Date.now },
}, { timestamps: true });

const User = mongoose.model("User", userSchema);

async function checkUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB 연결 성공\n");

    const users = await User.find({}).select("username nickname name role status createdAt");
    
    console.log("=== 유저 목록 ===\n");
    if (users.length === 0) {
      console.log("등록된 유저가 없습니다.");
    } else {
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.username}`);
        console.log(`   닉네임: ${user.nickname || "-"}`);
        console.log(`   이름: ${user.name || "-"}`);
        console.log(`   역할: ${user.role || "user"} ${user.role === "admin" ? "👑" : ""}`);
        console.log(`   상태: ${user.status || "active"}`);
        console.log(`   가입일: ${user.createdAt ? new Date(user.createdAt).toLocaleString("ko-KR") : "-"}`);
        console.log("");
      });
    }

    const adminCount = users.filter(u => u.role === "admin").length;
    console.log(`\n총 ${users.length}명 (관리자: ${adminCount}명)`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error("오류 발생:", error);
    process.exit(1);
  }
}

checkUsers();

