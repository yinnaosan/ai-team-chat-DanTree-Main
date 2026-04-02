# FEEDBACK — DanTree Workspace v2.1-A0 骨架层预检

**任务：** DanTree Workspace v2.1-A0 — Discovery-Only Preflight
**日期：** 2026-04-02
**执行者：** Manus AI
**状态：** DISCOVERY COMPLETE ✅ — 零生产文件修改

---

## 一、任务执行摘要

### 完成内容

1. **扫描 26 个只读文件**，重点分析：
   - `client/src/pages/TerminalEntry.tsx`（957 行，11 个 tRPC 查询，12 个面板）
   - `client/src/App.tsx`（路由结构，contexts 目录）
   - `drizzle/schema.ts`（entity_snapshots 表，memory_context 表）
   - 6 个引擎文件（thesisStateEngine、executionTimingEngine、alertEngine、sessionHistoryEngine、snapshotPersistenceEngine、portfolioAnalysisEngine）
   - `server/routers.ts`（现有 market router 路由）

2. **回答 9 项预检问题**，明确：
   - Session state 最适合放在 Context Provider 层
   - Workspace Adapter 最适合做成单一 hook `useWorkspaceViewModel`
   - 最小文件集：7 个文件（2 新建 client + 1 修改 client + 1 修改 App + 1 修改 schema + 1 修改 db + 1 修改 router）
   - Session 最小数据结构：10 字段（sessionId、title、sessionType、focusKey、focusType、createdAt、updatedAt、lastActiveAt、pinned、favorite）
   - 6 个区域必须同步刷新，2 个条件同步，右侧区域 A-1 阶段不同步

3. **生成完整预检报告**（`WORKSPACE_V2_1_A0_PREFLIGHT.md`），包含：
   - 当前代码结构快照
   - 九项预检结论（Q1–Q9）
   - Discovery Hints 回答
   - L21.1B Task Specification（供 A-1 主实现参考）

4. **识别 6 个潜在风险**：
   - TerminalEntry.tsx 体量过大（高风险）
   - activeEntity 状态源分散（高风险）
   - Session 切换导致 stale data（中风险）
   - query 绑定方式不适合扩展（中风险）
   - basket/comparison 状态与 session 不绑定（低风险）
   - rpaConfig.lastTicker 异步加载（低风险）

### 未修改的生产文件

**零生产文件修改。** 本任务严格遵守 discovery-only 原则，仅输出两个 gpt_feedback 文档。

---

## 二、关键发现与建议

### 关键发现 1：TerminalEntry.tsx 已接近维护上限

**现状：** 957 行，包含 11 个内联 tRPC 查询、14 个 useState 变量、12 个面板的 JSX。

**风险：** 若 A-1 继续在此文件添加 Session Rail JSX（预计 +150 行），文件将超过 1100 行，成为"上帝组件"。

**建议：** A-1 的首要任务是**瘦身**，而非堆积。具体步骤：
1. 提取 `useWorkspaceViewModel` hook（将 11 个查询移出 TerminalEntry）
2. 提取 `<SessionRail>` 独立组件（将 Rail JSX 移出 TerminalEntry）
3. 预期瘦身后：957 → ~750 行（可持续维护）

---

### 关键发现 2：activeEntity 状态源分散，不适合 Session 切换

**现状：** `activeEntity` 来自 `rpaConfig.lastTicker`（tRPC 查询），不是 React state。

**问题：** Session 切换时无法直接 `setState(newEntity)`，必须通过 `rpa.setLastTicker` mutation 或引入 WorkspaceContext 覆盖。

**建议：** A-1 引入 `WorkspaceContext`，暴露 `currentSession.focusKey` 作为新的 `activeEntity` 源，覆盖 `rpaConfig.lastTicker`。这样 Session 切换时只需 `setSession(newSession)`，所有查询自动失效并重新获取。

---

### 关键发现 3：11 个查询有 3 层依赖关系，必须聚合管理

**现状：** 11 个查询分散在 TerminalEntry.tsx 的 310–443 行，依赖关系隐式（通过 `enabled` 参数）。

**问题：** 新增查询或调整依赖顺序时，需要手动修改多个 `enabled` 条件，容易出错。

**建议：** A-1 将 11 个查询聚合到 `useWorkspaceViewModel` hook 中，显式声明 3 层依赖：
- Layer 1（无依赖）：`getSourceSelectionStats`、`getOutputGateStats`、`getSemanticStats`
- Layer 2（依赖 Layer 1）：`evaluateEntityAlerts`、`getEntityThesisState`
- Layer 3（依赖 Layer 2）：`getExecutionTiming`、`getSessionHistory`

这样依赖关系一目了然，且可以在 hook 内部统一处理 `enabled` 逻辑。

---

### 关键发现 4：Session 切换时 staleTime 可能导致旧数据显示

**现状：** 11 个查询使用 `staleTime: 30_000–60_000`，切换 session 后旧数据可能仍在缓存中显示。

**建议：** A-1 在 `setSession` 时调用 `trpc.useUtils().market.invalidate()`，强制所有查询失效并重新获取。或者在 `queryKey` 中包含 `sessionId`，让 tRPC 自动识别不同 session 的缓存。

---

### 关键发现 5：右侧区域 A-1 阶段应保持静态 placeholder

**现状：** 右侧区域（Opportunity/Briefing/Utility）在 TerminalEntry.tsx 中尚未实现。

**建议：** A-1 阶段只做静态 placeholder（显示 `"OPPORTUNITY — Coming in v2.2"` 等文字），不实现任何动态逻辑。右侧区域的内容需要 Session 概念稳定后才能设计，A-1 阶段的核心是 Session 骨架，不应分散精力。

---

### 关键发现 6：A-1 适合纯 Manus Direct，无需 Claude

**理由：**
- schema + 后端（Steps 1–2）：标准模式，Manus 已有 L21.0C 的参考实现
- Context + hook（Steps 3–4）：纯 TypeScript/React，无复杂算法
- TerminalEntry 瘦身 + Rail（Steps 5–6）：需要精确的文件结构理解，Manus 比 Claude 更适合
- 切换逻辑 + 测试（Steps 7–8）：标准 tRPC invalidate 模式

**唯一可能需要 Claude 的层：** 如果 Session Rail 需要复杂的动画或拖拽排序逻辑（A-2 阶段），可以考虑 Claude 辅助设计交互逻辑。A-1 阶段不需要。

---

## 三、A-1 主实现建议

### 推荐实施顺序（8 步）

```
Step 1: schema 迁移（~30 分钟）
  → 追加 workspace_sessions 表到 drizzle/schema.ts
  → pnpm drizzle-kit generate → 应用 SQL

Step 2: 后端 helpers + 路由（~45 分钟）
  → db.ts 新增 createWorkspaceSession / getWorkspaceSessions / updateWorkspaceSession
  → routers.ts 新增 workspace.createSession / listSessions / setActive / updateTitle

Step 3: WorkspaceContext（~30 分钟）
  → 新建 client/src/contexts/WorkspaceContext.tsx
  → 暴露 currentSession / setSession / sessionList / isLoading
  → 在 App.tsx 中包裹 <WorkspaceProvider>

Step 4: useWorkspaceViewModel hook（~60 分钟）
  → 新建 client/src/hooks/useWorkspaceViewModel.ts
  → 将 TerminalEntry.tsx 中 11 个 tRPC 查询迁移进 hook
  → 保持 Layer 1→2→3 的依赖顺序

Step 5: TerminalEntry.tsx 瘦身（~45 分钟）
  → 替换 11 个内联查询为 useWorkspaceViewModel 调用
  → 移除 activeEntity 的 rpaConfig 依赖，改为从 WorkspaceContext 读取
  → 文件行数应从 957 降至 ~750

Step 6: Session Rail 组件（~60 分钟）
  → 新建 client/src/components/SessionRail.tsx
  → 独立组件，从 WorkspaceContext 读取 sessionList
  → 显示 session 标题、focusKey、thesisStance 徽章（从 entity_snapshots 读取）
  → 插入 TerminalEntry.tsx 左侧区域

Step 7: Session 切换刷新逻辑（~30 分钟）
  → setSession 时调用 trpc.useUtils().market.invalidate()
  → 更新 compA/basketEntities[0] 与新 session 的 focusKey 同步

Step 8: 测试 + 检查点（~30 分钟）
  → TSC 0 errors
  → 回归测试
  → webdev_save_checkpoint
```

**总估计：** ~5.5 小时，适合 Manus Direct 分 2–3 次任务完成。

---

### 推荐分任务策略

**任务 1（A-1a）：后端骨架**
- Steps 1–2（schema + 后端）
- 预期时长：~1.5 小时
- 交付物：`workspace_sessions` 表 + 3 个 db helpers + 4 个 tRPC 路由

**任务 2（A-1b）：前端骨架**
- Steps 3–5（Context + hook + TerminalEntry 瘦身）
- 预期时长：~2.5 小时
- 交付物：WorkspaceContext + useWorkspaceViewModel + TerminalEntry 瘦身至 ~750 行

**任务 3（A-1c）：Session Rail + 切换逻辑**
- Steps 6–8（Rail 组件 + 切换逻辑 + 测试）
- 预期时长：~2 小时
- 交付物：SessionRail 组件 + session 切换刷新逻辑 + 检查点

---

## 四、待 GPT 确认的决策点

### 决策点 1：Session Rail 位置

**候选方案：**
- A. TerminalEntry 左侧区域（独立列，宽度 ~200px）
- B. TerminalEntry 顶部区域（横向 tab 栏）
- C. 独立页面（`/workspace`，TerminalEntry 变成 workspace 的子页面）

**Manus 推荐：** A（左侧区域），理由：
- 符合 IDE/Notion 的 sidebar 惯例
- 不破坏现有 TerminalEntry 的顶部 header 布局
- 可以显示更多 session 元信息（title、focusKey、thesisStance 徽章）

**请 GPT 确认：** 是否同意方案 A？

---

### 决策点 2：Session 默认排序

**候选方案：**
- A. 按 `updatedAt` 降序（最近更新的在最上）
- B. 按 `lastActiveAt` 降序（最近激活的在最上）
- C. 按 `createdAt` 降序（最新创建的在最上）
- D. 按 `pinned` + `lastActiveAt`（固定的在最上，其余按激活时间）

**Manus 推荐：** D（固定 + 激活时间），理由：
- 用户可以固定常用 session（如 "AAPL 主分析"）
- 其余 session 按最近激活时间排序，符合"最近使用"的直觉

**请 GPT 确认：** 是否同意方案 D？

---

### 决策点 3：Session Rail 是否显示 thesisStance 徽章

**候选方案：**
- A. 显示（从 `entity_snapshots` 读取最近一次快照的 `thesisStance`）
- B. 不显示（A-1 阶段保持简单，A-2 阶段再添加）

**Manus 推荐：** A（显示），理由：
- `entity_snapshots` 表已在 L21.0C 实现，读取成本低
- thesisStance 徽章是 Session 的核心视觉标识，有助于用户快速识别 session 状态
- 实现成本低（~20 行代码）

**请 GPT 确认：** 是否同意方案 A？

---

### 决策点 4：A-1 是否实现 Session 创建 UI

**候选方案：**
- A. 实现（Rail 顶部添加 "+ New Session" 按钮，点击后弹出 dialog 输入 focusKey）
- B. 不实现（A-1 阶段只实现 session 切换，session 创建通过后端 API 手动触发）

**Manus 推荐：** A（实现），理由：
- Session 创建是 Workspace 的核心交互，不实现会导致用户无法体验完整流程
- 实现成本低（~40 行代码 + shadcn/ui Dialog 组件）

**请 GPT 确认：** 是否同意方案 A？

---

## 五、Claude 合作问题反馈（L16–L21 累计）

### 累计 bug 统计

| Level | Claude bug 数量 | 修复者 | 根因 |
|-------|----------------|--------|------|
| L16.0B | 0 | N/A | 无 bug |
| L17.0B | 0 | N/A | 无 bug |
| L18.0B | 2 | Manus | 枚举值假设错误（ThesisChangeMarker、SnapshotChangeMarker） |
| L19.0B | 3 | Manus | 分支顺序错误（`stance=unavailable` 应在 `not_ready` 之前）+ TSC 类型比较重叠 + `entityResults` 必填字段遗漏 |
| L20.0B | 3 | Manus | 测试断言不匹配（`"first_observation"` vs `"First observation"`）+ 函数签名错误（2 处） |
| L21.0B | 0 | N/A | 无 bug（迄今最干净的交付） |

**总计：** 6 个 Level，累计 8 个 bug，全部由 Manus 修复。

### 改进建议（发给 GPT）

1. **枚举值假设问题（L18.0B）**：Claude 假设 `ThesisChangeMarker` 包含 `"first_observation"` 值，但实际枚举为 `"INITIAL" | "STRENGTHENED" | "WEAKENED" | "REVERSED" | "STABLE"`。建议 GPT 在 Task Specification 中明确要求 Claude：**"不假设任何枚举值，必须从引擎接口推导"**。

2. **分支顺序问题（L19.0B）**：Claude 在 `deriveActionBias` 中将 `readiness_state="not_ready"` 分支放在 `stance="unavailable"` 分支之前，导致 `stance="unavailable"` 时返回 `"WAIT"` 而非 `"NONE"`。建议 GPT 在 Task Specification 中明确要求 Claude：**"特殊值（如 unavailable、fallback）的分支必须优先于通用值分支"**。

3. **测试断言不匹配（L20.0B）**：Claude 测试断言 `delta_summary` 包含 `"first_observation"`，但引擎实际返回 `"First observation recorded. Baseline established. Advisory only."`。建议 GPT 在 Task Specification 中明确要求 Claude：**"测试断言应使用 `.toContain()` 而非精确字符串匹配，允许引擎返回完整句子"**。

4. **函数签名错误（L20.0B）**：Claude 在 routers.ts 示例代码中直接传入 `input.current.thesisState`，但实际函数签名要求传入完整 `input` 对象。建议 GPT 在 Task Specification 中明确要求 Claude：**"不提供 routers.ts 示例代码，Manus 负责 tRPC 路由集成"**。

---

## 六、下一步行动

### 推荐 A-1 主实现任务包结构

```
DanTree_Workspace_v2_1_A1_Manus_Direct.zip
├── DanTree_Workspace_v2_1_A1_Task_Spec.txt
│   ├── STEP_ORDER（8 步）
│   ├── GUARD_CONDITIONS（4 个守卫）
│   ├── TEST_REQUIREMENTS（TSC + 回归）
│   └── REFERENCE_FILES（本预检报告）
└── (无 Claude 输出包，纯 Manus Direct)
```

### 推荐 GPT 下一步操作

1. **阅读本 FEEDBACK** 和 `WORKSPACE_V2_1_A0_PREFLIGHT.md`
2. **确认 4 个决策点**（Session Rail 位置、默认排序、thesisStance 徽章、创建 UI）
3. **生成 A-1 Task Spec**（发给 Manus，纯 Manus Direct，无需 Claude）
4. **Manus 执行 A-1a/A-1b/A-1c** 三个子任务
5. **A-1 完成后，GPT 决定 A-2 方向**（候选：Session 编辑/删除、拖拽排序、右侧区域实现、Basket Session 支持）

---

## 七、交付清单

- ✅ `gpt_feedback/WORKSPACE_V2_1_A0_PREFLIGHT.md`（预检报告，26 个文件扫描结果）
- ✅ `gpt_feedback/FEEDBACK_WORKSPACE_V2_1_A0.md`（本文件）
- ✅ 检查点 `d8404aa2`（无生产文件修改，仅 gpt_feedback 更新）
- ✅ 反馈包 `FEEDBACK_PACKAGE_WORKSPACE_V2_1_A0.zip`（含 L12.1 至 Workspace v2.1-A0 全部文档）

---

**预检完成。** 等待 GPT 确认 4 个决策点并发送 A-1 Task Spec。
