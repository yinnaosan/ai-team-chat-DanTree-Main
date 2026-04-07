import "dotenv/config";
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

try {
  // Check if columns already exist
  const [cols] = await conn.execute("SHOW COLUMNS FROM tasks LIKE 'sessionId'");
  if (cols.length === 0) {
    await conn.execute("ALTER TABLE `tasks` ADD `sessionId` varchar(64)");
    console.log("✅ Added sessionId column");
  } else {
    console.log("⏭️  sessionId already exists");
  }

  const [cols2] = await conn.execute("SHOW COLUMNS FROM tasks LIKE 'inputData'");
  if (cols2.length === 0) {
    await conn.execute("ALTER TABLE `tasks` ADD `inputData` text");
    console.log("✅ Added inputData column");
  } else {
    console.log("⏭️  inputData already exists");
  }

  console.log("✅ Migration complete");
} catch (err) {
  console.error("❌ Migration failed:", err.message);
  process.exit(1);
} finally {
  await conn.end();
}
