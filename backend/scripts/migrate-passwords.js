/**
 * Migration script: Migrate legacy user passwords to passwordHash.
 *
 * Usage:
 *   node scripts/migrate-passwords.js
 */

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const connectDB = require("../src/config/database");
const User = require("../src/models/User");

async function migrate() {
  await connectDB();

  if (!mongoose.connection.readyState) {
    console.error("Could not connect to database.");
    process.exit(1);
  }

  console.log("Checking user accounts for missing or legacy password hashes...");
  const users = await User.find({}).select("+passwordHash +password");
  console.log(`Found ${users.length} total user(s).`);

  let updatedCount = 0;
  let healthyCount = 0;
  let missingCount = 0;

  for (const user of users) {
    const rawDoc = user._doc || {};
    const legacyPass = user.password || rawDoc.password;
    const currentHash = user.passwordHash || rawDoc.passwordHash;

    if (currentHash && currentHash.startsWith("$2")) {
      healthyCount += 1;
      console.log(`  [OK] ${user.email} (valid passwordHash)`);
      continue;
    }

    if (legacyPass) {
      const newHash = legacyPass.startsWith("$2")
        ? legacyPass
        : await bcrypt.hash(legacyPass, 12);

      await User.updateOne(
        { _id: user._id },
        {
          $set: { passwordHash: newHash },
          $unset: { password: "" },
        },
      );
      updatedCount += 1;
      console.log(`  [UPDATED] ${user.email} (migrated legacy password -> passwordHash)`);
    } else {
      missingCount += 1;
      console.warn(`  [WARNING] ${user.email} has no password or passwordHash field!`);
    }
  }

  console.log("\nMigration completed:");
  console.log(`  Healthy: ${healthyCount}`);
  console.log(`  Updated: ${updatedCount}`);
  console.log(`  Missing: ${missingCount}`);

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error("Migration failed:", err);
  process.exit(1);
});
