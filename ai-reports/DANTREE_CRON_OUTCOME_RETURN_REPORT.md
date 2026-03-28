# DANTREE CRON + Outcome Auto-Resolve — Return Report

**MODULE_ID:** `DANTREE_CRON_OUTCOME_AUTORESOLVE`
**EXECUTED_BY:** Manus
**DATE:** 2026-03-28
**CHECKPOINT:** (pending)

---

## 1. IMPLEMENTATION_STATUS

| Phase | 描述 | 文件 | 状态 |
|-------|------|------|------|
| Phase 1+2 | Cron 服务器挂载 + 调度器启动守卫 | `cronServerMount.ts` | ✅ |
| Phase 3+4 | Outcome Horizon Schema + Auto-Resolve Engine | `outcomeAutoResolve.ts` | ✅ |
| Phase 5+6 | Price Lookup 抽象 + Post-Run Hook 批量解析 | `outcomePriceLookup.ts` | ✅ |
| Phase 7+8 | 可观测性 + 故障保险 + 验证测试 | `cronOutcome.test.ts` | ✅ |

---

## 2. CRON_SERVER_MOUNT

`cronServerMount.ts` 实现了以下功能：

- **启动守卫**：`initCronMount()` 检查 kill switch、source health、guard state，全部通过才允许 cron 启动
- **状态机**：`CronMountState` — `disabled | starting | active | paused | error`
- **激活/停用**：`activateCron()` / `deactivateCron()` 带完整状态记录
- **挂载点**：设计为在 `server._core/index.ts` 的 `server.listen` 回调中调用 `initCronMount()`

---

## 3. OUTCOME_HORIZON_SCHEMA

5 个标准 Horizon：

| Key | Days | Min Move % |
|-----|------|-----------|
| 1d  | 1    | 0.5%      |
| 3d  | 3    | 1.0%      |
| 7d  | 7    | 1.5%      |
| 14d | 14   | 2.0%      |
| 30d | 30   | 3.0%      |

---

## 4. AUTO_RESOLVE_ENGINE

`outcomeAutoResolve.ts` 核心逻辑：

```
resolveSignal(signal, currentPrice, source, nowMs)
  → isResolutionDue?   NO → null (not yet)
  → isSignalExpired?   YES → { outcome_label: "invalidated" }
  → classifyOutcome(signal, currentPrice, nowMs)
    → price_change_pct >= profit_threshold → "profitable"
    → price_change_pct <= loss_threshold   → "loss"
    → otherwise                            → "neutral"
  → ResolvedOutcome { advisory_only: true }
```

---

## 5. PRICE_LOOKUP_ABSTRACTION

`outcomePriceLookup.ts` 实现：

- `buildMarketSnapshotLookup()` — 从 `getMarketSnapshot()` 构建 ticker → price 映射
- `buildMockPriceLookup()` — 测试用 mock lookup
- `batchResolveWithLookup()` — 批量解析 + 自动调用 LEVEL6.1 `persistOutcome()`
- `safeOutcomePostRunHook()` — 故障保险包装，失败不中断 scheduler

---

## 6. NON_NEGOTIABLE_RULES

```
auto_trade_allowed:    ALWAYS false (advisory_only: true on all ResolvedOutcome)
cron_default:          disabled — 需要显式调用 activateCron()
startup_guard:         kill switch / failsafe / source health 三重检查
post_run_hook:         safeOutcomePostRunHook() — 失败 → summary.errors, never thrown
signal_expiry:         max_age_days=60 (configurable via setAutoResolveConfig)
```

---

## 7. VALIDATION

```
TSC:                   0 errors
CRON_OUTCOME tests:    31/31 ✅
  TC-CO-1 (Horizon Schema):         4/4  ✅
  TC-CO-2 (Auto-Resolve Engine):    7/7  ✅
  TC-CO-3 (Price Lookup):           4/4  ✅
  TC-CO-4 (Post-Run Hook + Obs):    6/6  ✅
  TC-CO-5 (Cron Mount + Guard):     6/6  ✅
  TC-CO-6 (Safety Invariants):      4/4  ✅
Full regression:       1064/1064 ✅ (58 test files)
```

---

## 8. OPEN ITEMS (awaiting GPT decision)

| ID | Question |
|----|----------|
| OI-CO-1 | 将 `initCronMount()` 实际挂载到 `server/_core/index.ts` 的 `server.listen` 回调？ |
| OI-CO-2 | 将 `batchResolveWithLookup()` 接入 LEVEL5.1 scheduler post-run hook？ |
| OI-CO-3 | 前端 Outcome Resolution Dashboard — 展示 resolved outcomes + win rate by horizon？ |
| OI-CO-4 | 将 `getResolutionStatus()` 暴露为 tRPC procedure？ |
| OI-CO-5 | LEVEL7 — 下一层是什么？（组合优化 / 仓位管理 / 回测 / 向量嵌入？） |
| OI-L51-1 | (carried) 将 `startCronScheduler()` 挂载到 Express 启动流程？ |
| OI-L6-2 | (carried) 将 `buildAlphaSurface()` 暴露为 tRPC？ |
| OI-L6-3 | (carried) 前端 Alpha Dashboard？ |
| OI-E1 | (carried) 向量嵌入 — 现在推进？ |
| OI-P1 | (carried) 暴露 `setLearningConfigOverride()` 为 tRPC？ |
| OI-P2 | (carried) `early_stop_bias_applied` 显示在前端 badge？ |
