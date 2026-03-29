# AI REPORT PROTOCOL — PERMANENT RULE
**Scope:** All DanTree tasks | **Enforced by:** Manus
**Last updated:** 2026-03-29

---

## MANDATORY RULE

> **Every time a task/level/patch is completed, Manus MUST generate an AI-to-AI internal handoff report and save it to `ai-reports/` before delivering results to the user.**

This rule is permanent and applies to ALL future work on this project.

---

## REPORT NAMING CONVENTION

```
MANUS_TO_GPT_{LEVEL/TASK_NAME}_HANDOFF.md
```

Examples:
- `MANUS_TO_GPT_LEVEL7_HANDOFF.md`
- `MANUS_TO_GPT_LEVEL71_HANDOFF.md`
- `MANUS_TO_GPT_LEVEL71B_HANDOFF.md`
- `MANUS_TO_GPT_LEVEL8_HANDOFF.md`
- `MANUS_TO_GPT_LEVEL8_FULL_PATCH_HANDOFF.md`
- `MANUS_TO_GPT_LEVEL8_FINAL_PATCH_HANDOFF.md`

---

## REPORT LANGUAGE & STYLE

- **Language:** English (AI-to-AI technical language)
- **Style:** Concise, structured, professional — no unnecessary filler
- **Tone:** Peer-to-peer between AI systems, not user-facing
- **Format:** Markdown with tables, code blocks, and structured sections

---

## REQUIRED SECTIONS IN EVERY REPORT

| Section | Content |
|---------|---------|
| **EXECUTIVE SUMMARY** | What was done, in 3-5 sentences |
| **COMPLETION MATRIX** | Table of all items/phases with ✅/❌ status |
| **KEY INTERFACES** | TypeScript interfaces for new/changed types |
| **FILE MANIFEST** | All new/modified files with change type |
| **REGRESSION SUMMARY** | Test counts and pass/fail status |
| **OPEN ITEMS FOR GPT** | Decisions GPT needs to make, with priority |
| **NEXT LEVEL RECOMMENDATION** | Suggested next step for GPT to assign |
| **SAFETY INVARIANTS** | Confirm advisory_only, no auto-trade, etc. |

---

## REPORT LOCATION

All reports MUST be saved to:
```
/home/ubuntu/ai-team-chat/ai-reports/
```

Current reports in this folder:
- `MANUS_TO_GPT_LEVEL7_HANDOFF.md`
- `MANUS_TO_GPT_LEVEL71_HANDOFF.md`
- `MANUS_TO_GPT_LEVEL71B_HANDOFF.md`
- `MANUS_TO_GPT_LEVEL8_HANDOFF.md`
- `MANUS_TO_GPT_LEVEL8_FULL_PATCH_HANDOFF.md`
- `MANUS_TO_GPT_LEVEL8_FINAL_PATCH_HANDOFF.md`
- `MANUS_TO_GPT_LEVEL8_FINAL_PATCH_PROOF.md`
- `DANTREE_LEVEL7_PORTFOLIO_DECISION_REPORT.md`
- `AI_REPORT_PROTOCOL.md` ← this file

---

## DELIVERY WORKFLOW

1. Complete task (code + tests + TSC 0 errors)
2. Generate `MANUS_TO_GPT_{NAME}_HANDOFF.md` in `ai-reports/`
3. Save checkpoint
4. Deliver to user: attach BOTH `manus-webdev://` AND the `.md` report file
5. User forwards `.md` to GPT for next instructions

---

*This protocol was established 2026-03-29 per user instruction.*
*Manus must follow this for every future task on this project.*
