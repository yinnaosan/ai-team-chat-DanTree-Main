/**
 * DANTREE_LEVEL21B Tests
 * Validates: historyBootstrap control fields, loopStateTriggerEngine history-aware logic,
 * loopStopController delta-driven stop, finalConvergedOutput LEVEL21B fields.
 */

import { describe, it, expect } from "vitest";

// ── historyBootstrap ──────────────────────────────────────────────────────────
import {
  computeControlFlags,
  buildDeltaObjects,
  evaluateDeltaDrivenStop,
  buildHistoryControlSummary,
  type HistoryBootstrap,
} from "./historyBootstrap";

// ── loopStopController ────────────────────────────────────────────────────────
import { evaluateStopCondition } from "./loopStopController";
import type { LoopState } from "./loopStateTriggerEngine";
import type { EvidenceDelta } from "./evidenceDeltaEngine";
import type { UpdatedVerdict } from "./verdictUpdater";

// ── finalConvergedOutput ──────────────────────────────────────────────────────
import { buildConvergedOutput } from "./finalConvergedOutput";
import type { FinalOutputSchema } from "./outputSchemaValidator";

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeBootstrap(overrides: Partial<HistoryBootstrap> = {}): HistoryBootstrap {
  return {
    has_prior_history: true,
    prior_decision_count: 3,
    previous_action: "BUY",
    previous_state: "HIGH",
    previous_verdict: "看涨，基本面强劲",
    previous_key_thesis: "营收增长超预期，估值合理",
    previous_risks: "宏观风险",
    previous_cycle: "mid",
    previous_timing: "entry",
    previous_confidence: "high",
    history_quality: "rich",
    recent_decisions: [],
    action_pattern: "consistent_bullish",
    days_since_last_decision: 14,
    history_requires_control: false,
    revalidation_mandatory: false,
    history_control_reason: "",
    preferred_probe_order: [],
    ...overrides,
  };
}

function makeLoopState(overrides: Partial<LoopState> = {}): LoopState {
  return {
    iteration: 1,
    max_iterations: 3,
    budget_used: 1,
    budget_max: 5,
    triggered: true,
    trigger_reason: "evidence_gap",
    trigger_time: Date.now(),
    step0_ran: false,
    step0_object: null,
    history_controlled: false,
    controller_path: [],
    ...overrides,
  };
}

function makeEvidenceDelta(overrides: Partial<EvidenceDelta> = {}): EvidenceDelta {
  return {
    evidence_score_before: 0.55,
    evidence_score_after: 0.65,
    evidence_score_delta: 0.10,
    confidence_before: "medium",
    confidence_after: "high",
    confidence_changed: true,
    convergence_signal: "converged",
    convergence_reason: "Score improved significantly",
    new_risk_introduced: false,
    ...overrides,
  };
}

function makeUpdatedVerdict(overrides: Partial<UpdatedVerdict> = {}): UpdatedVerdict {
  return {
    final_verdict: "看涨",
    final_confidence: "high",
    verdict_changed: false,
    change_type: "reinforced",
    change_narrative: "二次分析强化了原判断",
    second_pass_finding: "营收加速增长",
    second_pass_contribution: "新增技术面支撑",
    merged_risks: [],
    ...overrides,
  };
}

function makeLevel1Output(): FinalOutputSchema {
  return {
    verdict: "看涨",
    confidence: "medium",
    horizon: "mid-term",
    bull_case: ["营收增长"],
    reasoning: ["基本面分析"],
    bear_case: ["估值偏高"],
    risks: [],
    next_steps: ["关注财报"],
    discussion: {
      key_uncertainty: "宏观风险",
      weakest_point: "估值",
      alternative_view: "看空",
      follow_up_questions: [],
      exploration_paths: [],
      open_hypotheses: [],
    },
  };
}

// ── Tests: computeControlFlags ────────────────────────────────────────────────

describe("computeControlFlags", () => {
  it("should set revalidation_mandatory for BUY action with 14 days elapsed", () => {
    const flags = computeControlFlags({
      previousAction: "BUY",
      daysSince: 14,
      quality: "rich",
      currentQuery: "should I still hold?",
      actionPattern: "BUY → BUY",
      priorDecisionCount: 2,
    });
    expect(flags.revalidation_mandatory).toBe(true);
    expect(flags.history_requires_control).toBe(true);
  });

  it("should set history_requires_control for decision-relevant query", () => {
    const flags = computeControlFlags({
      previousAction: "HOLD",
      daysSince: 3,
      quality: "single",
      currentQuery: "buy or sell?",
      actionPattern: "HOLD",
      priorDecisionCount: 1,
    });
    expect(flags.history_requires_control).toBe(true);
  });

  it("should not require mandatory revalidation for HOLD < 7 days with empty query", () => {
    const flags = computeControlFlags({
      previousAction: "HOLD",
      daysSince: 3,
      quality: "single",
      currentQuery: "",
      actionPattern: "HOLD",
      priorDecisionCount: 1,
    });
    expect(flags.revalidation_mandatory).toBe(false);
  });
});

// ── Tests: buildDeltaObjects ──────────────────────────────────────────────────

describe("buildDeltaObjects", () => {
  it("should detect action_changed when current action differs from previous", () => {
    const bootstrap = makeBootstrap({ previous_action: "BUY" });
    const result = buildDeltaObjects({
      bootstrap,
      currentAction: "SELL",
      currentVerdict: "看跌",
      currentConfidence: "medium",
    });
    expect(result.action_delta.change_type).not.toBe("unchanged");
    expect(result.action_delta.previous_action).toBe("BUY");
    expect(result.action_delta.current_action).toBe("SELL");
  });

  it("should detect thesis invalidated when action reversed", () => {
    const bootstrap = makeBootstrap({ previous_action: "BUY", previous_verdict: "看涨，基本面强劲" });
    const result = buildDeltaObjects({
      bootstrap,
      currentAction: "SELL",
      currentVerdict: "看跌，风险上升",
      currentConfidence: "medium",
    });
    expect(result.thesis_delta.change_type).toBe("invalidated");
  });

  it("should mark reaffirmation when action and thesis unchanged", () => {
    const bootstrap = makeBootstrap({ previous_action: "BUY", previous_verdict: "看涨" });
    const result = buildDeltaObjects({
      bootstrap,
      currentAction: "BUY",
      currentVerdict: "看涨",
      currentConfidence: "high",
    });
    expect(result.action_delta.change_type).toBe("unchanged");
    expect(result.thesis_delta.change_type).toBe("unchanged");
  });
});

// ── Tests: evaluateDeltaDrivenStop ────────────────────────────────────────────

describe("evaluateDeltaDrivenStop", () => {
  it("should return reaffirmation=true when action and thesis unchanged", () => {
    const bootstrap = makeBootstrap({ previous_action: "BUY", previous_verdict: "看涨" });
    const { thesis_delta, action_delta } = buildDeltaObjects({
      bootstrap,
      currentAction: "BUY",
      currentVerdict: "看涨",
      currentConfidence: "high",
    });
    const result = evaluateDeltaDrivenStop(thesis_delta, action_delta);
    expect(result.reaffirmation).toBe(true);
    expect(result.reconsideration).toBe(false);
  });

  it("should return reconsideration=true when action changed", () => {
    const bootstrap = makeBootstrap({ previous_action: "BUY" });
    const { thesis_delta, action_delta } = buildDeltaObjects({
      bootstrap,
      currentAction: "SELL",
      currentVerdict: "看跌",
      currentConfidence: "medium",
    });
    const result = evaluateDeltaDrivenStop(thesis_delta, action_delta);
    expect(result.reconsideration).toBe(true);
    expect(result.reaffirmation).toBe(false);
  });

  it("should require_thesis_update_step when action reversed", () => {
    const bootstrap = makeBootstrap({ previous_action: "BUY" });
    const { thesis_delta, action_delta } = buildDeltaObjects({
      bootstrap,
      currentAction: "SELL",
      currentVerdict: "看跌",
      currentConfidence: "medium",
    });
    const result = evaluateDeltaDrivenStop(thesis_delta, action_delta);
    expect(result.require_thesis_update_step).toBe(true);
  });
});

// ── Tests: buildHistoryControlSummary ────────────────────────────────────────

describe("buildHistoryControlSummary", () => {
  it("should produce a non-empty summary_line when action changed", () => {
    const bootstrap = makeBootstrap({ previous_action: "BUY" });
    const { thesis_delta, action_delta } = buildDeltaObjects({
      bootstrap,
      currentAction: "SELL",
      currentVerdict: "看跌",
      currentConfidence: "medium",
    });
    const result = buildHistoryControlSummary({
      bootstrap,
      step0: null,
      currentAction: "SELL",
      thesisDelta: thesis_delta,
      actionDelta: action_delta,
      controllerPath: ["step0", "revalidation"],
    });
    expect(result.summary_line).toBeTruthy();
    expect(result.action_changed).toBe(true);
  });

  it("should mark thesis_changed when action reversed", () => {
    const bootstrap = makeBootstrap({ previous_action: "BUY", previous_verdict: "看涨" });
    const { thesis_delta, action_delta } = buildDeltaObjects({
      bootstrap,
      currentAction: "SELL",
      currentVerdict: "看跌",
      currentConfidence: "low",
    });
    const result = buildHistoryControlSummary({
      bootstrap,
      step0: null,
      currentAction: "SELL",
      thesisDelta: thesis_delta,
      actionDelta: action_delta,
      controllerPath: [],
    });
    expect(result.thesis_changed).toBe(true);
  });
});

// ── Tests: evaluateStopCondition (LEVEL21B) ───────────────────────────────────

describe("evaluateStopCondition LEVEL21B", () => {
  it("should stop early on history reaffirmation", () => {
    const loopState = makeLoopState();
    const evidenceDelta = makeEvidenceDelta({ convergence_signal: "inconclusive" });
    const updatedVerdict = makeUpdatedVerdict({
      change_type: "unchanged",
      verdict_changed: false,
      final_confidence: "medium",
    });

    const deltaStopEval = {
      reaffirmation: true,
      reconsideration: false,
      change_materiality: "low" as const,
      require_thesis_update_step: false,
      stop_reason: "prior action reaffirmed",
    };

    const result = evaluateStopCondition({
      loopState,
      evidenceDelta,
      updatedVerdict,
      secondPassSucceeded: true,
      deltaStopEval,
    });

    expect(result.should_stop).toBe(true);
    expect(result.stop_reason).toBe("history_reaffirmed");
    expect(result.delta_stop_applied).toBe(true);
  });

  it("should continue when thesis_update step required (non-reversed verdict)", () => {
    const loopState = makeLoopState();
    const evidenceDelta = makeEvidenceDelta({ convergence_signal: "inconclusive" });
    const updatedVerdict = makeUpdatedVerdict({
      change_type: "reinforced",
      verdict_changed: false,
      final_confidence: "medium",
    });

    const deltaStopEval = {
      reaffirmation: false,
      reconsideration: true,
      change_materiality: "high" as const,
      require_thesis_update_step: true,
      stop_reason: "action reversed",
    };

    const result = evaluateStopCondition({
      loopState,
      evidenceDelta,
      updatedVerdict,
      secondPassSucceeded: true,
      deltaStopEval,
    });

    expect(result.should_stop).toBe(false);
    expect(result.require_thesis_update_step).toBe(true);
  });

  it("should attach history_control_summary to result", () => {
    const loopState = makeLoopState();
    const evidenceDelta = makeEvidenceDelta();
    const updatedVerdict = makeUpdatedVerdict({ final_confidence: "high" });

    const historyControlSummary = {
      has_prior_history: true,
      revalidation_mandatory: false,
      previous_action: "BUY",
      current_action: "SELL",
      summary_line: "行动方向从 BUY 变为 SELL",
      action_changed: true,
      thesis_changed: true,
      change_type: "reversed",
      controller_path: [],
    };

    const result = evaluateStopCondition({
      loopState,
      evidenceDelta,
      updatedVerdict,
      secondPassSucceeded: true,
      historyControlSummary,
    });

    expect(result.history_control_summary).toBeDefined();
    expect(result.history_control_summary?.action_changed).toBe(true);
  });
});

// ── Tests: buildConvergedOutput (LEVEL21B fields) ─────────────────────────────

describe("buildConvergedOutput LEVEL21B fields", () => {
  it("should include LEVEL21B fields in loop_metadata when loop ran", () => {
    const level1Output = makeLevel1Output();
    const loopState = makeLoopState({
      history_controlled: true,
      controller_path: ["step0", "revalidation"],
    });
    const evidenceDelta = makeEvidenceDelta();
    const updatedVerdict = makeUpdatedVerdict();

    const stopDecision = evaluateStopCondition({
      loopState,
      evidenceDelta,
      updatedVerdict,
      secondPassSucceeded: true,
    });

    const level21Payload = {
      history_bootstrap_used: true,
      history_record_count: 3,
      history_action_pattern: "consistent_bullish",
      history_days_since_last: 14,
      history_revalidation_summary: "历史重申",
      thesis_delta: "{}",
      action_delta: "{}",
      step0_ran: true,
      history_requires_control: true,
      revalidation_mandatory: false,
      history_control_reason: "recent decision",
      preferred_probe_order: ["fundamental", "technical"],
      history_controlled: true,
      controller_path: ["step0", "revalidation"],
      delta_stop_applied: false,
      delta_stop_reason: "",
      require_thesis_update_step: false,
      history_control_summary_line: "历史重申",
      action_changed: false,
      thesis_changed: false,
    };

    const result = buildConvergedOutput({
      level1Output,
      loopRan: true,
      loopState,
      evidenceDelta,
      updatedVerdict,
      stopDecision,
      level21: level21Payload,
    });

    expect(result.loop_metadata.history_bootstrap_used).toBe(true);
    expect(result.loop_metadata.history_controlled).toBe(true);
    expect(result.loop_metadata.preferred_probe_order).toEqual(["fundamental", "technical"]);
    expect(typeof result.loop_metadata.history_control_summary_line).toBe("string");
  });

  it("should include LEVEL21B defaults when loop did not run", () => {
    const level1Output = makeLevel1Output();
    const result = buildConvergedOutput({
      level1Output,
      loopRan: false,
    });

    expect(result.loop_metadata.history_controlled).toBe(false);
    expect(result.loop_metadata.delta_stop_applied).toBe(false);
    expect(result.loop_metadata.controller_path).toEqual([]);
  });
});
