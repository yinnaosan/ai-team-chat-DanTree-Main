import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as dotenv from "dotenv";
dotenv.config();

const conn = await mysql.createConnection(process.env.DATABASE_URL);
const db = drizzle(conn);

// Raw SQL query to check messages for conversationId=960001
const [rows] = await conn.execute(
  `SELECT id, role, 
    JSON_EXTRACT(metadata, '$.decisionSnapshot') as decisionSnapshot,
    JSON_EXTRACT(metadata, '$.decisionObject') as decisionObject,
    createdAt
   FROM messages 
   WHERE conversationId = 960001 AND role = 'assistant'
   ORDER BY id DESC
   LIMIT 3`
);

console.log("=== Messages for conversationId=960001 (assistant) ===");
for (const row of rows) {
  console.log({
    id: row.id,
    role: row.role,
    has_decisionSnapshot: row.decisionSnapshot !== null,
    decisionSnapshot_preview: row.decisionSnapshot 
      ? JSON.stringify(row.decisionSnapshot).slice(0, 200) 
      : null,
    has_decisionObject: row.decisionObject !== null,
    created_at: row.created_at,
  });
}

await conn.end();
