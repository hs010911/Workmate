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

const projectSchema = new mongoose.Schema({}, { strict: false });
const Project = mongoose.model("Project", projectSchema);

const applicationSchema = new mongoose.Schema({}, { strict: false });
const Application = mongoose.model("Application", applicationSchema);

async function deleteUsers() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log("MongoDB 연결 성공\n");

    const users = await User.find({}).select("username nickname name role createdAt");
    
    console.log("=== 현재 유저 목록 ===\n");
    users.forEach((user, index) => {
      console.log(`${index + 1}. ${user.username} (${user.nickname || user.name || "-"}) - ${user.role || "user"}`);
    });
    console.log("");

    const readline = require("readline");
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question("삭제할 유저 아이디를 입력하세요 (쉼표로 구분, 예: user1,user2): ", async (input) => {
      if (!input.trim()) {
        console.log("\n취소되었습니다.");
        rl.close();
        await mongoose.disconnect();
        process.exit(0);
      }

      const usernamesToDelete = input.split(",").map(u => u.trim()).filter(u => u);
      
      console.log(`\n삭제할 유저: ${usernamesToDelete.join(", ")}\n`);

      for (const username of usernamesToDelete) {
        const user = await User.findOne({ username });
        if (!user) {
          console.log(`❌ "${username}" 유저를 찾을 수 없습니다.`);
          continue;
        }

        if (user.role === "admin") {
          console.log(`⚠️  "${username}"은 관리자입니다. 건너뜁니다.`);
          continue;
        }

        const createdProjects = await Project.countDocuments({ creator: user._id });
        const applications = await Application.countDocuments({ applicant: user._id });

        console.log(`\n유저: ${username}`);
        console.log(`  - 생성한 프로젝트: ${createdProjects}개`);
        console.log(`  - 지원한 프로젝트: ${applications}개`);

        if (createdProjects > 0) {
          console.log(`  ⚠️  이 유저가 생성한 프로젝트가 ${createdProjects}개 있습니다.`);
        }
      }

      rl.question("\n정말 삭제하시겠습니까? (yes 입력): ", async (confirm) => {
        if (confirm.toLowerCase() !== "yes") {
          console.log("\n취소되었습니다.");
          rl.close();
          await mongoose.disconnect();
          process.exit(0);
        }

        console.log("\n삭제 중...\n");

        for (const username of usernamesToDelete) {
          const user = await User.findOne({ username });
          if (!user) continue;
          if (user.role === "admin") continue;

          try {
            await Application.deleteMany({ applicant: user._id });
            await Project.deleteMany({ creator: user._id });
            await User.deleteOne({ _id: user._id });
            console.log(`✅ "${username}" 삭제 완료`);
          } catch (error) {
            console.log(`❌ "${username}" 삭제 실패: ${error.message}`);
          }
        }

        console.log("\n삭제 작업이 완료되었습니다.");
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

deleteUsers();

