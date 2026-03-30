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

async function addRoleField() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB 연결 성공\n");

    const usersWithoutRole = await User.find({ role: { $exists: false } });
    console.log(`role 필드가 없는 유저: ${usersWithoutRole.length}명\n`);

    if (usersWithoutRole.length === 0) {
      console.log("모든 유저에 role 필드가 이미 있습니다.");
      await mongoose.disconnect();
      process.exit(0);
    }

    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    console.log("=== role 필드가 없는 유저 목록 ===");
    usersWithoutRole.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (${user.nickname || user.name || "-"})`);
    });
    console.log("");

    rl.question("모든 유저를 일반 유저(user)로 설정하시겠습니까? (y/n): ", async (answer) => {
      if (answer.toLowerCase() === "y") {
        const result = await User.updateMany(
          { role: { $exists: false } },
          { $set: { role: "user", status: "active" } }
        );
        console.log(`\n✅ ${result.modifiedCount}명의 유저에 role 필드가 추가되었습니다. (기본값: user)`);
      } else {
        console.log("\n취소되었습니다.");
      }

      rl.question("\n관리자로 만들 유저 아이디를 입력하세요 (없으면 엔터): ", async (adminUsername) => {
        if (adminUsername) {
          const adminUser = await User.findOne({ username: adminUsername });
          if (adminUser) {
            adminUser.role = "admin";
            adminUser.status = "active";
            await adminUser.save();
            console.log(`\n✅ "${adminUsername}"이 관리자로 설정되었습니다.`);
          } else {
            console.log(`\n❌ "${adminUsername}" 유저를 찾을 수 없습니다.`);
          }
        }

        rl.close();
        await mongoose.disconnect();
        process.exit(0);
      });
    });
  } catch (error) {
    console.error("오류 발생:", error);
    process.exit(1);
  }
}

addRoleField();

