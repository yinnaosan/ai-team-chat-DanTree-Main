# Phase 4C Stage 3 — Patch Completion Report

**日期：** 2026-04-16  
**撰写：** Claude（核心工程师）  
**SHA：** 2be1a7d  
**状态：** 代码修复完成，等待 Manus 运行 `verify_phase4c_stage3.mjs` 确认 DB

---

## 根因（已确认）

structured_analysis 在三个节点被截断：

| 截断点 | 文件 | 位置 | 原因 |
|--------|------|------|------|
| 截断点 1 | outputSchemaValidator.ts | Step 6 normalize L221-240 | output 对象未包含 structured_analysis |
| 截断点 2 | routers.ts | DELIVERABLE 注入 L2699-2708 | deliverablePayload 未包含 structured_analysis |
| 截断点 3 | routers.ts | metadataToSave L2860 | 没有写入 metadataToSave.structured_analysis |

LLM 输出了 structured_analysis（CRITICAL 指令 patch v2 已确保），但这三个截断点让它在进入 DB 之前被丢弃。

---

## 三项修复

### Fix A — outputSchemaValidator.ts (+1 行)

```diff
@@ -235,6 +235,7 @@ export function validateFinalOutput(raw: string): ValidationResult {
       open_hypotheses: parsed.discussion.open_hypotheses ?? [],
     },
+    structured_analysis: parsed.structured_analysis ?? undefined,
   };
```

**效果：** validateFinalOutput 的 Step 6 output 对象现在携带 structured_analysis 传递给 level1a3Output。

---

### Fix B — routers.ts (+1 行)

```diff
@@ -2704,6 +2704,7 @@ FORMAT: ##标题 | **加粗**关键数据 | >引用块用于引用 | 表格≥3
           risks: level1a3Output.risks,
           next_steps: level1a3Output.next_steps,
+          structured_analysis: level1a3Output.structured_analysis ?? undefined,
         };
```

**效果：** %%DELIVERABLE%% 序列化块现在包含 structured_analysis，下游的 `JSON.parse(deliverableMatch[1].trim())` 可以读取到它。

---

### Fix C — routers.ts (+4 行)

```diff
@@ -2858,6 +2859,10 @@ FORMAT: ##标题 | **加粗**关键数据
         if (hasAllKeys) {
           metadataToSave.answerObject = parsed;
+          // Phase 4C Stage 3: Persist structured_analysis to top-level metadata
+          if (parsed.structured_analysis) {
+            metadataToSave.structured_analysis = parsed.structured_analysis;
+          }
           // [DT-DEBUG][ANSWER_OBJECT]
```

**效果：** structured_analysis 被写入 metadataToSave 的顶层字段，持久化到 DB。

---

## 未变更项（遵守约束）

- requiredTopLevel 数组：未修改
- 验证逻辑（MISSING_FIELD 检查）：未修改
- 客户端代码：未修改
- fallback 逻辑：未修改
- 涉及文件：仅 outputSchemaValidator.ts + routers.ts

---

## TSC 验证

```
npx tsc --noEmit 2>&1
error TS2688: Cannot find type definition file for 'node'.      ← pre-existing
error TS2688: Cannot find type definition file for 'vite/client'. ← pre-existing
error TS5101: Option 'baseUrl' is deprecated                      ← pre-existing
```

净增新错误：0

---

## Manus 待执行的 DB 验证

```bash
# 在 DanTree 服务器根目录执行（确保服务在 8001 端口运行）：
JWT_SECRET=<your_jwt_secret> VITE_APP_ID=<your_app_id> node verify_phase4c_stage3.mjs
```

验证项目：
- **G1** structured_analysis 在 metadata 顶层字段存在
- **G2** structured_analysis 在 metadata.answerObject 中存在  
- **G3** 5 个子字段全部非空（primary_bull / primary_bear / primary_risk_condition / confidence_summary / stance_rationale）

期望输出：
```
FINAL: PASS — structured_analysis flows end-to-end into DB
```

---

## 数据流修复后完整路径

```
LLM output (structured_analysis 已在 CRITICAL 指令中要求)
  ↓
validateFinalOutput() Step 6 [Fix A] → level1a3Output.structured_analysis
  ↓
DELIVERABLE payload 序列化 [Fix B] → %%DELIVERABLE%%...structured_analysis...%%END_DELIVERABLE%%
  ↓
JSON.parse(deliverableMatch) → parsed.structured_analysis
  ↓
metadataToSave.answerObject = parsed          ← answerObject 中包含
metadataToSave.structured_analysis = parsed.structured_analysis [Fix C] ← 顶层字段
  ↓
DB (conversations.metadata JSON 字段)
  ↓
outputAdapter.ts extractDecisionObject() 已有 Phase 4C 字段映射，直接可读
```

---

*Claude（核心工程师）· SHA 2be1a7d · 2 files changed · 6 insertions · TSC net new: 0*
