# CODEBASE CONTEXT — DanTree
**Version:** 2.1 (post-Level12.6)  
**Maintained by:** GPT Architecture

---

## FLAT SERVER RULE (CRITICAL)

```
server/ is FLAT. Zero subdirectories for task purposes.
ALL imports must use: ./filename
FORBIDDEN: ../  ../../  ./protocol/  ./subdir/
```

Even though `server/protocol/` physically exists, all task packages must reference files as if they are in `server/` root. The tsconfig handles resolution.

---

## LIGHTWEIGHT PACKAGE RULES (OI-L12-007)

**Include `TEST_MOCK_TYPE_PACK.md` (or its contents) in any lightweight Claude package when:**

1. The task touches `Level11AnalysisOutput` mock objects in tests
2. The task touches semantic activation or semantic surface tests
3. The task involves `PropagationLink`, `IncentiveAnalysisOutput`, `AssetType`, or `SentimentPhase`

**Why:** These types have common field-name traps (`from_asset` vs `from`, `links` vs `chain`, `lag_estimate` vs `lag`) that cause repeated TSC failures and Manus repair overhead.

**Reference:** `gpt_feedback/TEST_MOCK_TYPE_PACK.md`

---

## FILE OWNERSHIP

| File | Owner | Rule |
|---|---|---|
| `server/protocol/semantic_protocol.ts` | Claude | Core transport types |
| `server/protocol/semantic_aggregator.ts` | Claude | Aggregation engine |
| `server/protocol/semantic_packet_builders.ts` | Claude | Level11 + Position builders |
| `server/level12_4_semantic_activation.ts` | Claude | 3-path activation helpers |
| `server/level12_5_semantic_surface.test.ts` | Claude | Surface/integration tests |
| `server/level11MultiAssetEngine.ts` | READ-ONLY | Multi-asset engine |
| `server/experienceLayer.ts` | READ-ONLY | Experience layer |
| `server/level105PositionLayer.ts` | READ-ONLY | Position layer |
| `server/deepResearchEngine.ts` | READ-ONLY (except permitted appends) | Deep research |
| `server/danTreeSystem.ts` | READ-ONLY (except permitted appends) | DanTree orchestrator |
| `server/routers.ts` | APPEND-ONLY | tRPC procedures |
| `drizzle/schema.ts` | READ-ONLY | DB schema |

---

## PIPELINE STATUS (post-Level12.6)

```
User input
  → Step0: task classification
  → Step1: resource planning
  → Step2: 28-source data collection
  → Step2-B: LLM data analysis
  → Step2-C: evidence validation
  → Step3: final synthesis (GPT/Anthropic)
       ↑
       └── [SEMANTIC_AGGREGATION_LAYER | LEVEL12.5]
             PATH-A: Level11 analysis → SemanticTransportPacket
             PATH-B: ExperienceLayer  → SemanticTransportPacket
             PATH-C: PositionLayer    → SemanticTransportPacket
             ↓
             aggregateSemanticPackets() → UnifiedSemanticState
             ↓
             buildSynthesisSemanticEnvelope() → semanticEnvelopeBlock
             ↓
             injected into gptUserMessage before [FINALIZE]
```

---

## FREQUENTLY NEEDED IMPORT PATHS

```ts
// Semantic protocol (Claude-owned)
import { buildSemanticPacket } from "./semantic_protocol";
import { aggregateSemanticPackets, buildSynthesisSemanticEnvelope } from "./semantic_aggregator";
import { buildLevel11SemanticPacket, buildPositionSemanticPacket } from "./semantic_packet_builders";
import { buildSemanticActivationResult, attachUnifiedSemanticState } from "./level12_4_semantic_activation";

// Engine types (READ-ONLY — import type only)
import type { Level11AnalysisOutput } from "./level11MultiAssetEngine";
import type { ExperienceLayerOutput } from "./experienceLayer";
import type { PositionLayerOutput } from "./level105PositionLayer";
import type { DeepResearchContextMap, DeepResearchOutput } from "./deepResearchEngine";
```

---

## ANTI-PATTERNS (recurring failures)

| Pattern | Problem | Fix |
|---|---|---|
| `import from "./protocol/semantic_aggregator"` | Subdirectory import | Use `"./semantic_aggregator"` |
| `PropagationLink.from_asset` | Wrong field name | Use `.from` |
| `PropagationChainOutput.links` | Wrong field name | Use `.chain` |
| `PropagationLink.lag_estimate` | Wrong field name | Use `.lag` |
| `PropagationLink.correlation_strength` | Wrong field name | Use `.confidence` |
| `AssetType = "etf"` | Invalid enum value | Use `"etf_equity"` / `"etf_sector"` / `"etf_macro"` |
| `SentimentPhase = "recovery"` | Invalid enum value | Use only the 6 valid values |
| `=== 14` for SemanticTaskType count | Brittle assertion | Use `>= 14` |
