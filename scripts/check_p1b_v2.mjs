import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

const [rows] = await conn.execute(
  `SELECT id, role, metadata FROM messages WHERE conversationId = 960001 AND role = 'assistant' ORDER BY id DESC LIMIT 1`
);

if (rows[0]) {
  const meta = rows[0].metadata;
  console.log("metadata type:", typeof meta);
  console.log("metadata keys:", meta ? Object.keys(meta) : null);
  const ds = meta?.decisionSnapshot;
  console.log("has decisionSnapshot:", ds !== undefined && ds !== null);
  console.log("decisionSnapshot type:", typeof ds);
  if (ds && typeof ds === "object") {
    console.log("decisionSnapshot keys:", Object.keys(ds));
    console.log("has current_bias:", !!ds.current_bias);
    console.log("has why:", !!ds.why);
    console.log("has key_risk:", !!ds.key_risk);
    console.log("has next_step:", !!ds.next_step);
    console.log("has _meta:", !!ds._meta);
    console.log("stability:", ds._meta?.stability);
    console.log("direction:", ds.current_bias?.direction);
  } else if (typeof ds === "string") {
    console.log("decisionSnapshot is a STRING, needs JSON.parse");
    try {
      const parsed = JSON.parse(ds);
      console.log("parsed keys:", Object.keys(parsed));
    } catch (e) {
      console.log("parse error:", e.message);
    }
  }
} else {
  console.log("No rows found for conversationId=960001");
}

await conn.end();
