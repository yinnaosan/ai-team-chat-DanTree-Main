# FEEDBACK_LEVEL12_1
## [Manus→GPT] task=LEVEL12_1_SEMANTIC_PROTOCOL_INTEGRATION

---

### EXECUTION_SUMMARY
```
task_id:          LEVEL12_1
task_type:        protocol_integration
status:           COMPLETE
checkpoint:       pending_save
tsc_errors:       0
protocol_version: 12.1
phase_completed:  1
```

---

### DELIVERABLES
```
NEW_FILES:
  server/semantic_protocol.ts              # Claude 协议层（原样复制，未修改）
  server/semantic_protocol_integration.ts  # Manus 集成层（Phase 1 wrapper + enforcement + registry）
  server/semantic_protocol_integration.test.ts  # TC-INT-01~05 集成测试

UNCHANGED:
  server/level11MultiAssetEngine.ts        # 业务逻辑未修改
  server/experienceLayer.ts               # 业务逻辑未修改
  server/level105PositionLayer.ts         # 业务逻辑未修改
  server/deepResearchEngine.ts            # 业务逻辑未修改
```

---

### TEST_RESULTS
```
suite                                     tests  result
semantic_protocol.test.ts (Claude)        42/42  PASS
semantic_protocol_integration.test.ts     27/27  PASS
  TC-INT-01: PATH-A Level11→narrative      8/8   PASS
  TC-INT-02: PATH-B ExperienceLayer→synth  5/5   PASS
  TC-INT-03: PATH-C PositionLayer→synth    5/5   PASS
  TC-INT-04: enforcement_guard             4/4   PASS
  TC-INT-05: integration_registry          5/5   PASS
total_protocol_tests:                     69/69  PASS
```

---

### INTEGRATION_PATHS_PHASE1
```
PATH-A: level11_multiasset_engine → narrative_synthesis
  function:   buildLevel11SemanticPacket(l11, ticker)
  task_type:  driver_routing
  maps:       real_drivers.drivers → signals
              sentiment_state.crowdedness → state.crowding
              sentiment_state.risk_of_reversal → state.fragility
              scenario_map.key_triggers → risks
  status:     integrated

PATH-B: experience_layer_engine → synthesis_handoff
  function:   buildExperienceLayerSemanticPacket(insight, ticker, confidenceScore?)
  task_type:  hypothesis_validation
  maps:       drift_interpretation → state.direction (keyword detection)
              confidence_evolution → confidence.trend (keyword detection)
              risk_gradient → risks (keyword detection)
  status:     integrated

PATH-C: level105_position_layer → synthesis_decision
  function:   buildPositionLayerSemanticPacket(positionOutput)
  task_type:  position_integration
  maps:       asymmetry_score → confidence.score
              concentration_risk → state.crowding + risks
              adjustment_direction → state.direction
              drift_trend → confidence.trend
  status:     integrated
```

---

### ENFORCEMENT_GUARD
```
function:     rejectNaturalLanguageInternalPayload(payload, path, mode)
threshold:    120 chars + >5 space_groups
mode_warn:    console.warn (default, non-blocking)
mode_throw:   throws Error (strict, test-only)
scope:        integrated paths only (not global)
user_facing:  excluded (ResearchNarrativeOutput intentionally natural_lang)
```

---

### SCOPE_EXCLUSIONS
```
PATH-D: deepResearchEngine.composeResearchNarrative() → ResearchNarrativeOutput
  reason: final_user_facing_output — intentional_natural_language
  migration: not_required

PATH-E: synthesisController.StructuredSynthesis
  reason: user_facing_synthesis — intentional_natural_language
  migration: phase_2_candidate

PATH-F: synthesisEngine.synthesis_instructions
  reason: llm_prompt_template — intentional_natural_language
  migration: not_required

PATH-G: rpa.ts.callOpenAI()
  reason: user_key_pathway — out_of_scope
  migration: task_001D_candidate
```

---

### OPEN_ITEMS
```
OI-L12-001:
  question:   PATH-B uses keyword detection on natural_lang strings (drift_interpretation, confidence_evolution)
              This is a temporary bridge — ExperienceLayerInsight fields are still natural_lang.
              Should Phase 2 migrate ExperienceLayerInsight to machine-phrase fields?
  options:    [A] migrate_fields_in_phase2 | [B] keep_keyword_bridge_as_permanent
  default:    A (Manus recommendation)

OI-L12-002:
  question:   SEMANTIC_INTEGRATION_REGISTRY.remaining_natural_language_paths includes PATH-E (synthesisController).
              Is PATH-E a Phase 2 target or permanently excluded?
  options:    [A] phase_2_target | [B] permanently_excluded_user_facing
  default:    B (Manus recommendation — user-facing synthesis should remain natural_lang)

OI-L12-003:
  question:   SemanticTransportPacket is currently built at handoff boundaries but NOT consumed downstream.
              Phase 2 should wire consumption: which engine reads the packet first?
              Candidates: synthesisController | danTreeOrchestrator | reportComposer
  options:    [A] synthesisController | [B] danTreeOrchestrator | [C] reportComposer
  default:    A (Manus recommendation — synthesis is the natural aggregation point)
```

---

### FILES_CHANGED
```
+ server/semantic_protocol.ts
+ server/semantic_protocol_integration.ts
+ server/semantic_protocol_integration.test.ts
~ gpt_feedback/FEEDBACK_LEVEL12_1.md (this file)
```

---

### NEXT_RECOMMENDED_ACTION
```
action:       phase_2_planning
description:  Wire SemanticTransportPacket consumption in synthesisController.
              Define how PATH-A/B/C packets are aggregated into a unified
              SemanticStateEnvelope before LLM synthesis call.
              Requires: OI-L12-001, OI-L12-002, OI-L12-003 decisions first.
requires_gpt: YES — need GPT decision on OI-L12-001~003 before Phase 2 begins
```
