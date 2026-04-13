/**
 * Phase 1 Runtime Verification
 * Checks server logs for BP-2/BP-3 routing after a stock analysis
 * Does NOT call the API directly (avoids auth complexity)
 * Instead, scans recent devserver.log for MODEL_PATH and step3 evidence
 */
import { readFileSync } from "fs";

const logPath = "/home/ubuntu/ai-team-chat/.manus-logs/devserver.log";

let log = "";
try {
  log = readFileSync(logPath, "utf-8");
} catch {
  console.log("LOG_READ_ERROR: cannot read devserver.log");
  process.exit(1);
}

// Get last 500 lines
const lines = log.split("\n").slice(-500);

// Check for callOpenAI in recent logs (should NOT appear for step3_main / repair_pass)
const callOpenAILines = lines.filter(l => l.includes("callOpenAI") || l.includes("openai_failed_fallback"));
const step3MainLines = lines.filter(l => l.includes('"source":"step3_main"') || l.includes('"source": "step3_main"'));
const repairPassLines = lines.filter(l => l.includes('"source":"repair_pass"') || l.includes('"source": "repair_pass"'));
const modelPathLines = lines.filter(l => l.includes("[DT-DEBUG][MODEL_PATH]")).slice(-3);
const agentErrorLines = lines.filter(l => l.includes("AGENT_ERROR") || l.includes("step3_breakage"));

console.log("=== Phase 1 Runtime Verification ===");
console.log(`callOpenAI in recent logs: ${callOpenAILines.length} (should be 0 for step3_main/repair_pass)`);
if (callOpenAILines.length > 0) {
  callOpenAILines.slice(-3).forEach(l => console.log("  FOUND:", l.slice(0, 200)));
}
console.log(`step3_main invocations in recent logs: ${step3MainLines.length}`);
console.log(`repair_pass invocations in recent logs: ${repairPassLines.length}`);
console.log(`AGENT_ERROR lines: ${agentErrorLines.length}`);
console.log("\nRecent MODEL_PATH entries:");
modelPathLines.forEach(l => {
  try {
    const match = l.match(/\{.*\}/);
    if (match) {
      const obj = JSON.parse(match[0]);
      console.log("  modelPath:", obj.modelPath, "| hasOpenAIKey:", obj.hasOpenAIKey, "| event:", obj.event || "initial");
    }
  } catch { console.log("  (parse error)", l.slice(0, 150)); }
});
console.log("\n=== ROUTING CHECK ===");
console.log("BP-2 callOpenAI removed:", callOpenAILines.filter(l => l.includes("step3_main")).length === 0 ? "PASS" : "FAIL");
console.log("BP-3 callOpenAI removed:", callOpenAILines.filter(l => l.includes("repair_pass")).length === 0 ? "PASS" : "FAIL");
console.log("No AGENT_ERROR:", agentErrorLines.length === 0 ? "PASS" : `WARN (${agentErrorLines.length} found)`);
