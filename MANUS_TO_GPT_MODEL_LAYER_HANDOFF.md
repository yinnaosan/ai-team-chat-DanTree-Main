# MANUS → GPT Handoff: Model Abstraction Layer

**Task:** DanTree AI Collaboration Protocol v1.0 — [MANUS TASK] Model Router Implementation  
**Status:** COMPLETE ✅  
**Date:** 2026-03-30  
**TSC:** 0 errors  
**Tests:** 9/9 model_router.test.ts + 1385/1391 regression (6 pre-existing failures unrelated)

---

## What Was Built

### New Files

| File | Purpose |
|------|---------|
| `server/claude_provider.ts` | Claude API 调用层（Anthropic SDK，claude-3-7-sonnet-20250219 默认） |
| `server/gpt_provider.ts` | GPT stub（开发阶段返回 stub 响应，生产阶段切换为 OpenAI SDK） |
| `server/model_router.ts` | 统一路由器（开发阶段 Claude-only，生产阶段按 provider 路由） |
| `server/model_router.test.ts` | 路由逻辑单元测试（9 用例） |

### Modified Files

| File | Change |
|------|--------|
| `server/llmProviders.ts` | `invokeWithModel()` 内部委托给 `model_router.routeRequest()`，向后兼容 |

---

## Architecture

```
invokeWithModel(req)          ← llmProviders.ts（向后兼容入口）
  → model_router.routeRequest(req)
      ├── DEV_MODE=true  → claude_provider.invoke()  → Anthropic API
      └── DEV_MODE=false → provider === "anthropic" → claude_provider.invoke()
                         → provider === "openai"    → gpt_provider.invoke()
```

### Environment Control

```
MODEL_ROUTER_MODE=development   # Claude-only（默认）
MODEL_ROUTER_MODE=production    # GPT + Claude 混合路由
```

---

## Model Registry (llmProviders.ts MODELS constant)

### Anthropic
- `CLAUDE_OPUS_4_6` — claude-opus-4-6（旗舰，最强推理）
- `CLAUDE_SONNET_4_6` — claude-sonnet-4-6（平衡）
- `CLAUDE_HAIKU_4_5` — claude-haiku-4-5（最快）
- `CLAUDE_3_7_SONNET` — claude-3-7-sonnet-20250219（上一代旗舰）
- `CLAUDE_3_5_SONNET` — claude-3-5-sonnet-20241022
- `CLAUDE_3_5_HAIKU` — claude-3-5-haiku-20241022

### OpenAI
- `GPT_4O` — gpt-4o（多模态旗舰）
- `GPT_4O_MINI` — gpt-4o-mini（快速经济）
- `GPT_4_TURBO` — gpt-4-turbo
- `O3` — o3（最强推理）
- `O4_MINI` — o4-mini（推理经济）
- `O1` — o1
- `O1_MINI` — o1-mini

---

## API Keys Status

| Provider | Key | Status |
|----------|-----|--------|
| Anthropic | `ANTHROPIC_API_KEY` | ✅ 已写入 Secrets，API 连通性验证通过 |
| OpenAI | `OPENAI_API_KEY` | ✅ 已写入 Secrets，Key 有效（curl 200），Manus 沙箱网络隔离，迁移独立服务器后可直连 |

---

## Test Coverage (model_router.test.ts)

| Test | Description | Status |
|------|-------------|--------|
| TC-MR-01 | DEV 模式路由到 Claude | ✅ |
| TC-MR-02 | DEV 模式忽略 provider 参数 | ✅ |
| TC-MR-03 | PROD 模式 anthropic provider → Claude | ✅ |
| TC-MR-04 | PROD 模式 openai provider → GPT stub | ✅ |
| TC-MR-05 | PROD 模式默认 provider → Claude | ✅ |
| TC-MR-06 | getAvailableModels 返回完整列表 | ✅ |
| TC-MR-07 | getRouterStatus 返回当前模式 | ✅ |
| TC-MR-08 | Claude 实际 API 连通性（Haiku 4.5） | ✅ |
| TC-MR-09 | GPT stub 在 DEV 模式返回 stub 响应 | ✅ |

---

## Next Steps for GPT

### [CLAUDE TASK] — 推荐的下一步

1. **LEVEL12 Regime Detection Engine**：构建 `regimeDetectionEngine.ts`，识别 6 种宏观 regime（risk_on / risk_off / late_cycle / stagflation / reflation / deflation_scare），将 regime_tag 注入 `computeAsymmetryScore()` 和 `buildPropagationChain()`。

2. **LLM 切换到 Claude**：将 `runDeepResearch()` 中的 `invokeLLM()` 替换为 `invokeWithModel({ model: MODELS.ANTHROPIC.CLAUDE_OPUS_4_6, ... })`，立即享受最强推理能力。

3. **生产模式切换**：当 OpenAI Key 在独立服务器验证通过后，设置 `MODEL_ROUTER_MODE=production`，`runDeepResearch()` 路由到 Claude，Step1/Step2 路由到 GPT-4o。

---

## Protocol Compliance

| Protocol Requirement | Status |
|---------------------|--------|
| model_router.ts 统一入口 | ✅ |
| claude_provider.ts 独立文件 | ✅ |
| gpt_provider.ts stub | ✅ |
| 开发阶段 Claude-only | ✅ |
| 生产阶段可切换 | ✅ |
| 向后兼容 invokeWithModel() | ✅ |
| TSC 0 errors | ✅ |
| 测试覆盖路由逻辑 | ✅ |
