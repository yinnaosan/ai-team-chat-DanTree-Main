import mysql from 'mysql2/promise';

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Check the latest assistant messages for conversationId=1050001
const [rows] = await conn.execute(`
  SELECT id, role, LEFT(content, 100) as content_preview, createdAt, conversationId,
    JSON_EXTRACT(metadata, '$.level4Result.state') as l4_state,
    JSON_EXTRACT(metadata, '$.level4Result.timingSignal') as l4_timing,
    JSON_EXTRACT(metadata, '$.level4Result.cycle') as l4_cycle,
    metadata IS NOT NULL as has_metadata
  FROM messages
  WHERE role = 'assistant' AND conversationId = 1050001
  ORDER BY createdAt DESC
  LIMIT 5
`);

console.log('Latest assistant messages for conversationId=1050001:');
for (const r of rows) {
  console.log(`---`);
  console.log(`id: ${r.id}, convId: ${r.conversationId}`);
  console.log(`createdAt: ${r.createdAt}`);
  console.log(`content_preview: ${r.content_preview}`);
  console.log(`has_metadata: ${r.has_metadata}`);
  console.log(`l4_state: ${r.l4_state}`);
  console.log(`l4_timing: ${r.l4_timing}`);
  console.log(`l4_cycle: ${r.l4_cycle}`);
}

// Also check what conversation IDs have recent messages
const [convRows] = await conn.execute(`
  SELECT conversationId, COUNT(*) as msg_count, MAX(createdAt) as latest
  FROM messages
  WHERE role = 'assistant'
  GROUP BY conversationId
  ORDER BY latest DESC
  LIMIT 10
`);

console.log('\nRecent conversations with assistant messages:');
for (const r of convRows) {
  console.log(`convId: ${r.conversationId}, count: ${r.msg_count}, latest: ${r.latest}`);
}

await conn.end();
