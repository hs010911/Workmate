const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
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

async function createAdmin() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB 연결 성공");

    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question("관리자 아이디를 입력하세요: ", async (username) => {
      rl.question("비밀번호를 입력하세요: ", async (password) => {
        rl.question("이름을 입력하세요 (선택사항): ", async (name) => {
          rl.question("닉네임을 입력하세요 (선택사항): ", async (nickname) => {
            rl.question("전화번호를 입력하세요 (선택사항): ", async (phone) => {
              try {
                const existingUser = await User.findOne({ username });
                if (existingUser) {
                  existingUser.role = "admin";
                  existingUser.status = "active";
                  if (password) {
                    existingUser.password = await bcrypt.hash(password, 10);
                  }
                  if (name) existingUser.name = name;
                  if (nickname) existingUser.nickname = nickname;
                  if (phone) existingUser.phone = phone;
                  await existingUser.save();
                  console.log(`\n✅ 기존 계정 "${username}"이 관리자로 변경되었습니다.`);
                } else {
                  if (!password) {
                    console.log("\n❌ 비밀번호는 필수입니다.");
                    rl.close();
                    process.exit(1);
                  }
                  const hashedPassword = await bcrypt.hash(password, 10);
                  const admin = await User.create({
                    username,
                    password: hashedPassword,
                    name: name || "",
                    nickname: nickname || username,
                    phone: phone || "",
                    role: "admin",
                    status: "active"
                  });
                  console.log(`\n✅ 관리자 계정 "${username}"이 생성되었습니다.`);
                  console.log(`   - 아이디: ${admin.username}`);
                  console.log(`   - 닉네임: ${admin.nickname}`);
                  console.log(`   - 역할: ${admin.role}`);
                }
              } catch (error) {
                console.error("\n❌ 오류 발생:", error.message);
              } finally {
                rl.close();
                await mongoose.disconnect();
                process.exit(0);
              }
            });
          });
        });
      });
    });
  } catch (error) {
    console.error("MongoDB 연결 실패:", error);
    process.exit(1);
  }
}

createAdmin();

