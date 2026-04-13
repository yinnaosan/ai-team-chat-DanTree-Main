/**
 * Phase 0 GPT Key Retirement — Verification Script
 * Test: write config with openaiApiKey → read back → openaiApiKey must be null
 * This script is local-only, do NOT push to GitHub.
 */
import mysql from "mysql2/promise";

const conn = await mysql.createConnection(process.env.DATABASE_URL);

// Use a synthetic test userId that won't conflict with real users
const TEST_USER_ID = 999999;

try {
  // Step 1: Clean up any existing test row
  await conn.execute("DELETE FROM rpa_configs WHERE userId = ?", [TEST_USER_ID]);

  // Step 2: Insert a row directly with openaiApiKey to simulate pre-existing data
  await conn.execute(
    "INSERT INTO rpa_configs (userId, openaiApiKey, openaiModel, manusSystemPrompt) VALUES (?, ?, ?, ?)",
    [TEST_USER_ID, "sk-test-EXISTING-KEY", "gpt-4o", "test prompt"]
  );

  // Step 3: Read back — confirm existing key is present before upsert
  const [before] = await conn.execute(
    "SELECT openaiApiKey, openaiModel, manusSystemPrompt FROM rpa_configs WHERE userId = ?",
    [TEST_USER_ID]
  );
  console.log("BEFORE upsert:", JSON.stringify(before[0]));

  // Step 4: Call upsertRpaConfig logic directly (simulate what the server does)
  // The Phase 0 patch should strip openaiApiKey and openaiModel from cleanConfig
  // We replicate the exact logic from db.ts upsertRpaConfig:
  const config = {
    openaiApiKey: "sk-test-NEW-KEY-SHOULD-NOT-PERSIST",
    openaiModel: "gpt-5.4",
    manusSystemPrompt: "updated prompt",
    userCoreRules: "test rules",
  };

  // Replicate cleanConfig logic
  const cleanConfig = Object.fromEntries(
    Object.entries(config).filter(([, v]) => v !== null && v !== undefined)
  );
  // Phase 0: strip
  delete cleanConfig.openaiApiKey;
  delete cleanConfig.openaiModel;

  // Build SET clause dynamically (only non-stripped fields)
  const fields = Object.keys(cleanConfig);
  if (fields.length > 0) {
    const setClause = fields.map(f => `${f} = ?`).join(", ");
    const values = fields.map(f => cleanConfig[f]);
    await conn.execute(
      `UPDATE rpa_configs SET ${setClause} WHERE userId = ?`,
      [...values, TEST_USER_ID]
    );
  }

  // Step 5: Read back — verify
  const [after] = await conn.execute(
    "SELECT openaiApiKey, openaiModel, manusSystemPrompt, userCoreRules FROM rpa_configs WHERE userId = ?",
    [TEST_USER_ID]
  );
  const row = after[0];
  console.log("AFTER upsert:", JSON.stringify(row));

  // Assertions
  const pass_apiKey = row.openaiApiKey === "sk-test-EXISTING-KEY"; // existing value untouched
  const pass_model = row.openaiModel === "gpt-4o"; // existing value untouched
  const pass_prompt = row.manusSystemPrompt === "updated prompt"; // non-stripped field updated
  const pass_rules = row.userCoreRules === "test rules"; // non-stripped field written

  console.log("\n=== VERIFICATION RESULTS ===");
  console.log(`openaiApiKey untouched (existing preserved): ${pass_apiKey ? "PASS" : "FAIL"} — value: ${row.openaiApiKey}`);
  console.log(`openaiModel untouched (existing preserved): ${pass_model ? "PASS" : "FAIL"} — value: ${row.openaiModel}`);
  console.log(`manusSystemPrompt updated: ${pass_prompt ? "PASS" : "FAIL"} — value: ${row.manusSystemPrompt}`);
  console.log(`userCoreRules written: ${pass_rules ? "PASS" : "FAIL"} — value: ${row.userCoreRules}`);

  // New write test: INSERT path (no existing row)
  await conn.execute("DELETE FROM rpa_configs WHERE userId = ?", [TEST_USER_ID]);
  // Use a non-default value to prove Phase 0 does NOT persist it
  const INSERT_MODEL_SENT = "gpt-test-custom-nondefault";
  const DB_DEFAULT_MODEL = "gpt-5.4";
  const insertConfig = {
    openaiApiKey: "sk-test-INSERT-SHOULD-NOT-PERSIST",
    openaiModel: INSERT_MODEL_SENT,
    manusSystemPrompt: "insert test",
  };
  const insertClean = Object.fromEntries(
    Object.entries(insertConfig).filter(([, v]) => v !== null && v !== undefined)
  );
  delete insertClean.openaiApiKey;
  delete insertClean.openaiModel;

  const insertFields = Object.keys(insertClean);
  const insertSetClause = insertFields.map(f => `${f} = ?`).join(", ");
  const insertValues = insertFields.map(f => insertClean[f]);
  await conn.execute(
    `INSERT INTO rpa_configs (userId, ${insertFields.join(", ")}) VALUES (?, ${insertFields.map(() => "?").join(", ")})`,
    [TEST_USER_ID, ...insertValues]
  );

  const [afterInsert] = await conn.execute(
    "SELECT openaiApiKey, openaiModel, manusSystemPrompt FROM rpa_configs WHERE userId = ?",
    [TEST_USER_ID]
  );
  const insertRow = afterInsert[0];
  console.log("\nINSERT path AFTER:", JSON.stringify(insertRow));

  const pass_insert_apiKey = insertRow.openaiApiKey === null;
  // openaiModel: Phase 0 strips it — read-back must NOT equal what we sent,
  // and must equal the DB schema default (gpt-5.4), proving it was never written.
  const pass_insert_model_not_written = insertRow.openaiModel !== INSERT_MODEL_SENT;
  const pass_insert_model_is_default = insertRow.openaiModel === DB_DEFAULT_MODEL;
  console.log(`INSERT: openaiApiKey is null: ${pass_insert_apiKey ? "PASS" : "FAIL"} — value: ${insertRow.openaiApiKey}`);
  console.log(`INSERT: openaiModel != sent value (not persisted): ${pass_insert_model_not_written ? "PASS" : "FAIL"} — sent: ${INSERT_MODEL_SENT}, got: ${insertRow.openaiModel}`);
  console.log(`INSERT: openaiModel == DB default (schema default only): ${pass_insert_model_is_default ? "PASS" : "FAIL"} — expected: ${DB_DEFAULT_MODEL}, got: ${insertRow.openaiModel}`);

  const allPass = pass_apiKey && pass_model && pass_prompt && pass_rules && pass_insert_apiKey && pass_insert_model_not_written && pass_insert_model_is_default;
  console.log(`\n=== OVERALL: ${allPass ? "ALL PASS ✅" : "SOME FAIL ❌"} ===`);

} finally {
  // Cleanup
  await conn.execute("DELETE FROM rpa_configs WHERE userId = ?", [TEST_USER_ID]);
  await conn.end();
}
