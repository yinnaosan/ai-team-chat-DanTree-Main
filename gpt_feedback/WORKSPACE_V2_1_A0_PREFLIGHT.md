# DanTree Workspace v2.1-A0 骨架层预检报告

**任务：** DanTree Workspace v2.1-A0 — Discovery-Only Preflight
**日期：** 2026-04-02
**状态：** DISCOVERY COMPLETE ✅ — 零生产文件修改
**扫描文件：** 26 个只读文件

---

## 一、当前代码结构快照

### TerminalEntry.tsx 现状

| 维度 | 数据 |
|------|------|
| 总行数 | 957 行 |
| useState 变量 | 14 个 |
| tRPC 查询 | 11 个（activeEntity 驱动） |
| 面板数量 | A–L 共 12 个面板 |
| activeEntity 来源 | `rpaConfig.lastTicker ?? "AAPL"`（单一 string，无 session 概念） |
| 路由层级 | `App.tsx` → `<Route path="/" component={TerminalEntry} />` |

### 现有 contexts 目录

- `client/src/contexts/ThemeContext.tsx`（仅主题）
- 无 WorkspaceContext、SessionContext

### 现有 hooks 目录

- `useComposition.ts`、`useMobile.tsx`、`usePersistFn.ts`
- 无 useWorkspaceViewModel、useSession

### 现有 schema 持久化层

- `entity_snapshots` 表（L21.0C，12 字段，advisory_only=true）
- `memory_context` 表（已有，用于跨 session 持久化 currentTicker）
- 无 `workspace_sessions` 表

---

## 二、九项预检结论

### Q1：Session state 最适合放在哪一层？

**推荐：Context Provider（`client/src/contexts/WorkspaceContext.tsx`）**

理由：
- `activeEntity` 当前已被 11 个查询共享，是全局状态而非 page-local 状态
- TerminalEntry.tsx 已有 957 行，继续在 page-level 堆积 session state 会使文件超过 1200 行，维护成本极高
- Context Provider 可以让 Session Rail 组件、面板组件、Adapter hook 三者共享同一个 session 状态源，避免 prop drilling
- 不推荐 local store（如 Zustand）：当前项目无 store 基础设施，引入成本高于 Context
- 不推荐 page-level state：session 切换逻辑会与面板渲染逻辑耦合，难以拆分

**结论：** 新建 `client/src/contexts/WorkspaceContext.tsx`，暴露 `currentSession`、`setSession`、`sessionList`。

---

### Q2：Workspace Adapter 最适合放在哪一层？

**推荐：单一 hook（`client/src/hooks/useWorkspaceViewModel.ts`）**

理由：
- 当前 11 个 tRPC 查询分散在 TerminalEntry.tsx 的 310–443 行，全部依赖同一个 `activeEntity`
- 将这 11 个查询聚合到一个 `useWorkspaceViewModel(sessionId, focusKey)` hook 中，可以：
  1. 让 TerminalEntry.tsx 只负责渲染（JSX），不负责数据获取
  2. 让 Session 切换时只需更新 hook 的输入参数，所有查询自动失效并重新获取
  3. 让测试更容易（mock hook 而非 mock 11 个 tRPC 调用）
- 不推荐多个小 hook 聚合：当前引擎间有依赖关系（alertSummary → timingData → sessionData），多 hook 会导致依赖顺序难以管理
- 不推荐 context adapter：adapter 是计算逻辑，不是状态，放在 hook 层更符合 React 惯例

**结论：** 新建 `client/src/hooks/useWorkspaceViewModel.ts`，接受 `{ focusKey: string, sessionType: string }` 输入，返回所有面板所需数据。

---

### Q3：切入 Session Workspace System 最少需要改哪些文件？

| 文件 | 改动原因 | 改动量 |
|------|----------|--------|
| `client/src/contexts/WorkspaceContext.tsx` | **新建** — Session state 容器 | 新文件 ~80 行 |
| `client/src/hooks/useWorkspaceViewModel.ts` | **新建** — Workspace Adapter（聚合 11 个查询） | 新文件 ~120 行 |
| `client/src/pages/TerminalEntry.tsx` | 替换 11 个 tRPC 查询为 `useWorkspaceViewModel` 调用；添加 Session Rail JSX | 修改 ~100 行 |
| `client/src/App.tsx` | 在 Router 外层包裹 `<WorkspaceProvider>` | 修改 ~5 行 |
| `drizzle/schema.ts` | **新建** `workspace_sessions` 表（sessionId, title, focusKey, focusType, sessionType, pinned, favorite, updatedAt） | 追加 ~20 行 |
| `server/db.ts` | 新增 `createWorkspaceSession`、`getWorkspaceSessions`、`updateWorkspaceSession` helpers | 追加 ~40 行 |
| `server/routers.ts` | 新增 `workspace.createSession`、`workspace.listSessions`、`workspace.setActive` 路由 | 追加 ~60 行 |

**最小文件集：7 个文件（2 新建 client + 1 修改 client + 1 修改 App + 1 修改 schema + 1 修改 db + 1 修改 router）**

---

### Q4：Session 最小数据结构建议

```typescript
interface WorkspaceSession {
  sessionId: string;          // UUID，主键
  title: string;              // 用户可编辑，默认 = focusKey + sessionType
  sessionType: "entity" | "basket" | "comparison" | "macro";
  focusKey: string;           // 主标的，如 "AAPL" 或 "AAPL,MSFT,NVDA"
  focusType: "ticker" | "basket" | "macro_theme";
  updatedAt: number;          // UTC ms timestamp
  pinned: boolean;
  favorite: boolean;
  // 推荐额外字段：
  createdAt: number;          // 创建时间，用于排序
  lastActiveAt: number;       // 最近激活时间，用于 Rail 排序
  snapshotRef?: string;       // 关联 entity_snapshots.snapshotId（可选，用于快速恢复）
}
```

**额外字段说明：**
- `createdAt`：必须有，Rail 需要按时间排序
- `lastActiveAt`：必须有，区分"最近使用"和"创建时间"两种排序模式
- `snapshotRef`：强烈推荐，切换 session 时可从 `entity_snapshots` 恢复上次分析状态，避免重新请求所有引擎

---

### Q5：Session 切换时哪些区域必须同步刷新？

| 区域 | 是否必须同步 | 原因 |
|------|-------------|------|
| Top Header（activeEntity 显示） | **必须** | `activeEntity` 是所有查询的根输入，切换后必须立即更新 |
| Engine Stats（Panel D/E） | **必须** | `getSourceSelectionStats`、`getOutputGateStats`、`getSemanticStats` 全部依赖 `activeEntity` |
| Thesis（Panel K） | **必须** | `getEntityThesisState` 输入包含 `activeEntity` |
| Timing（Panel J） | **必须** | `getExecutionTiming` 输入包含 `activeEntity` |
| Alert（Panel I） | **必须** | `evaluateEntityAlerts` 输入包含 `activeEntity` |
| History（Panel L） | **必须** | `getSessionHistory` 依赖 thesisData + alertSummary，间接依赖 `activeEntity` |
| Comparison（Panel G） | **条件同步** | 仅当 `compA` 与旧 `activeEntity` 相同时才需要同步更新 `compA`；用户手动设置的 `compB` 不应被覆盖 |
| Basket Analysis（Panel H） | **条件同步** | 仅当 `basketEntities[0]` 与旧 `activeEntity` 相同时才需要同步更新 Slot 0；其余 Slot 不应被覆盖 |
| Right-side（Opportunity/Briefing/Utility） | **A-1 阶段 placeholder，不同步** | A-1 阶段这些区域尚未实现，应保持静态 placeholder |

**结论：** 6 个区域必须同步，2 个条件同步，右侧区域 A-1 阶段不同步。

---

### Q6：哪些路由最适合进入 Workspace Adapter？

所有 5 个指定路由均应进入 `useWorkspaceViewModel`，组合方式如下：

```
useWorkspaceViewModel(focusKey, sessionType)
├── Layer 1（无依赖）：
│   ├── market.getSourceSelectionStats(entity)
│   ├── market.getOutputGateStats()
│   └── market.getSemanticStats(entity, timeframe)
├── Layer 2（依赖 Layer 1 输出）：
│   ├── market.evaluateEntityAlerts(entity, gateResult, sourceResult)
│   └── market.getEntityThesisState(entity, semantic_stats, gate_result, source_result, alert_summary)
├── Layer 3（依赖 Layer 2 输出）：
│   ├── market.getExecutionTiming(entity, thesisState, alertSummary, gateResult, semanticStats)
│   └── market.getSessionHistory(thesisState, alertSummary, timingResult)
└── Layer 4（可选，持久化）：
    └── market.getEntitySnapshots(entityKey)
```

**组合原则：** Layer 1 并行请求，Layer 2 在 Layer 1 完成后启动（`enabled: !!gateStats && !!semanticStats`），Layer 3 在 Layer 2 完成后启动，Layer 4 独立请求（不阻塞 UI）。

---

### Q7：潜在冲突与风险

| 风险 | 严重程度 | 说明 |
|------|----------|------|
| **TerminalEntry.tsx 体量过大** | 高 | 当前 957 行，A-1 若继续在此文件添加 Session Rail JSX，将超过 1100 行。必须先提取 Workspace Adapter hook，再添加 Rail。 |
| **activeEntity 状态源分散** | 高 | `activeEntity` 当前来自 `rpaConfig.lastTicker`（tRPC 查询），不是 React state。Session 切换时无法直接 `setState`，需要通过 `rpa.setLastTicker` mutation 或引入 WorkspaceContext 覆盖。 |
| **Session 切换导致 stale data** | 中 | 当前 11 个查询使用 `staleTime: 30_000–60_000`，切换 session 后旧数据可能仍在缓存中显示。需要在 session 切换时调用 `trpc.useUtils().market.invalidate()` 或使用 `queryKey` 包含 `sessionId`。 |
| **query 绑定方式不适合扩展** | 中 | 当前查询直接在 TerminalEntry.tsx 中声明，无法跨组件复用。A-1 的 Session Rail 组件需要知道当前 session 的 `thesisStance`（用于 Rail 徽章），但无法访问 TerminalEntry 内部的 `thesisData`。 |
| **basket/comparison 状态与 session 不绑定** | 低 | 当前 `basketEntities` 和 `compA/compB` 是 page-local state，session 切换后会丢失。A-1 阶段可暂时接受，A-2 阶段需要将这些状态存入 `workspace_sessions` 表。 |
| **`rpaConfig.lastTicker` 异步加载** | 低 | `activeEntity` 在 `rpaConfig` 加载前默认为 `"AAPL"`，可能导致第一次渲染时所有查询用错误的 ticker。WorkspaceContext 应在 `rpaConfig` 加载完成后才设置 `activeEntity`。 |

---

### Q8：A-1 最合理实施顺序

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

### Q9：生产文件修改确认

**本任务未修改任何 production file。** 仅输出以下两个 gpt_feedback 文档：
- `gpt_feedback/WORKSPACE_V2_1_A0_PREFLIGHT.md`（本文件）
- `gpt_feedback/FEEDBACK_WORKSPACE_V2_1_A0.md`

---

## 三、Discovery Hints 回答

### TerminalEntry 是否适合继续承载 Workspace？

**推荐：先抽出 Workspace shell，再在 TerminalEntry 演进。**

具体方案：不新建独立页面，而是在 TerminalEntry.tsx 内部引入 `useWorkspaceViewModel` hook 和 `<SessionRail>` 组件，让 TerminalEntry 从"数据获取 + 渲染"的混合体变成"纯渲染容器"。这样既不破坏现有路由，又能控制文件体量。

### Session Rail 最适合先做成？

**推荐：独立组件（`client/src/components/SessionRail.tsx`）+ 独立 provider（WorkspaceContext）。**

不推荐页面内左侧区块（会与 TerminalEntry 的 CSS 布局耦合），不推荐纯 provider（无 UI 无法验证）。独立组件 + 独立 provider 的组合可以单独测试，也可以在不同页面复用。

### Workspace Adapter 是否应先做成单一 hook？

**推荐：单一 hook `useWorkspaceViewModel`。**

原因：当前 11 个查询有明确的 3 层依赖关系，单一 hook 可以用 `enabled` 参数控制层间依赖，多个小 hook 会导致依赖顺序难以管理（例如 alertSummary 需要在 gateStats 完成后才能计算）。

### 右侧区域（Opportunity/Briefing/Utility）在 A-1 是否只做 placeholder？

**明确建议：A-1 阶段只做静态 placeholder。**

右侧区域的内容需要 Session 概念稳定后才能设计，A-1 阶段的核心是 Session 骨架，不应分散精力。Placeholder 显示 `"OPPORTUNITY — Coming in v2.2"` 等文字即可。

### A-1 主实现是否适合纯 Manus Direct？

**推荐：A-1 主实现适合纯 Manus Direct（Steps 1–8 全部）。**

理由：
- Step 1–2（schema + 后端）：标准模式，Manus 已有 L21.0C 的参考实现
- Step 3–4（Context + hook）：纯 TypeScript/React，无复杂算法，Manus 可直接实现
- Step 5–6（TerminalEntry 瘦身 + Rail）：需要精确的文件结构理解，Manus 比 Claude 更适合（Claude 容易假设字段名）
- Step 7–8（切换逻辑 + 测试）：标准 tRPC invalidate 模式，Manus 已熟悉

**唯一可能需要 Claude 的层：** 如果 Session Rail 需要复杂的动画或拖拽排序逻辑（A-2 阶段），可以考虑 Claude 辅助设计交互逻辑。A-1 阶段不需要。

---

## 四、L21.1B Task Specification（供 A-1 主实现参考）

```
TASK: DanTree Workspace v2.1-A1 — Session Workspace System 骨架层实现
CLASSIFICATION: MANUS_DIRECT
ESTIMATED_SESSIONS: 2–3 次 Manus 任务

STEP_ORDER:
  1. schema: 追加 workspace_sessions 表（8+2 字段）
  2. db.ts: 新增 3 个 session helpers
  3. routers.ts: 新增 workspace router（4 个路由）
  4. WorkspaceContext.tsx: 新建，暴露 currentSession/setSession/sessionList
  5. App.tsx: 包裹 <WorkspaceProvider>
  6. useWorkspaceViewModel.ts: 新建，聚合 11 个查询（3 层依赖）
  7. TerminalEntry.tsx: 替换内联查询，添加 <SessionRail> 插槽
  8. SessionRail.tsx: 新建独立组件，从 WorkspaceContext 读取

GUARD_CONDITIONS:
  - activeEntity 切换时必须调用 trpc.useUtils().market.invalidate()
  - basket/compA 仅在 session 首次加载时同步，不覆盖用户手动编辑
  - entity_snapshots 查询独立于主 adapter，不阻塞 UI
  - 右侧区域 A-1 阶段保持静态 placeholder

TEST_REQUIREMENTS:
  - TSC 0 errors
  - 回归测试通过率 ≥ 2050/2056
  - 无新的 vitest 测试文件要求（UI-only + Context 变更）
```
