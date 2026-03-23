import { describe, it, expect } from "vitest";

// ── 复制 routers.ts 中的解析逻辑，独立测试 ──────────────────────────────────
function parseDeliverable(finalReply: string) {
  const DELIVERABLE_RE = /%%DELIVERABLE%%([\s\S]*?)%%END_DELIVERABLE%%/;
  const match = finalReply.match(DELIVERABLE_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    const requiredKeys = ["verdict", "confidence", "key_evidence", "reasoning", "counterarguments", "risks", "next_steps"];
    const hasAllKeys = requiredKeys.every(k => k in parsed);
    return hasAllKeys ? parsed : null;
  } catch {
    return null;
  }
}

function parseDiscussion(finalReply: string) {
  const DISCUSSION_RE = /%%DISCUSSION%%([\s\S]*?)%%END_DISCUSSION%%/;
  const match = finalReply.match(DISCUSSION_RE);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    const requiredKeys = ["key_uncertainty", "weakest_point", "alternative_view", "follow_up_questions", "exploration_paths"];
    const hasAllKeys = requiredKeys.every(k => k in parsed);
    return hasAllKeys ? parsed : null;
  } catch {
    return null;
  }
}

function stripMarkers(finalReply: string) {
  return finalReply
    .replace(/%%DELIVERABLE%%[\s\S]*?%%END_DELIVERABLE%%/g, "")
    .replace(/%%DISCUSSION%%[\s\S]*?%%END_DISCUSSION%%/g, "")
    .trimEnd();
}

// ── 测试用例 ─────────────────────────────────────────────────────────────────
const VALID_REPLY = `这是分析正文内容。

%%DELIVERABLE%%
{
  "verdict": "苹果公司当前估值偏高约20-30%",
  "confidence": "medium",
  "key_evidence": ["PE=28.4x（来源：Yahoo Finance，2025Q4）", "行业均值PE=22x"],
  "reasoning": ["估值溢价来自品牌护城河", "但增长放缓压制扩张空间"],
  "counterarguments": ["服务业务高利润率支撑溢价"],
  "risks": [{"description": "利率上升100bp → 估值压缩8-12%", "magnitude": "high"}],
  "next_steps": ["关注Q1财报", "观察服务收入增速"]
}
%%END_DELIVERABLE%%

%%DISCUSSION%%
{
  "key_uncertainty": "服务业务增速是否可持续",
  "weakest_point": "缺乏近期机构持仓数据",
  "alternative_view": "AI硬件超级周期可能重估估值",
  "follow_up_questions": ["服务收入占比趋势？", "回购计划规模？", "中国市场风险？"],
  "exploration_paths": ["对比微软估值体系", "分析AI芯片供应链影响"]
}
%%END_DISCUSSION%%`;

const MALFORMED_REPLY = `分析内容

%%DELIVERABLE%%
{ "verdict": "测试", "confidence": "high"
%%END_DELIVERABLE%%`;

const NO_MARKERS_REPLY = `这是一个普通回复，没有结构化标记块。`;

describe("V2.1 DELIVERABLE parser", () => {
  it("should parse valid DELIVERABLE block", () => {
    const result = parseDeliverable(VALID_REPLY);
    expect(result).not.toBeNull();
    expect(result.verdict).toBe("苹果公司当前估值偏高约20-30%");
    expect(result.confidence).toBe("medium");
    expect(result.key_evidence).toHaveLength(2);
    expect(result.risks[0].magnitude).toBe("high");
  });

  it("should return null for malformed JSON", () => {
    const result = parseDeliverable(MALFORMED_REPLY);
    expect(result).toBeNull();
  });

  it("should return null when no DELIVERABLE block", () => {
    const result = parseDeliverable(NO_MARKERS_REPLY);
    expect(result).toBeNull();
  });
});

describe("V2.1 DISCUSSION parser", () => {
  it("should parse valid DISCUSSION block", () => {
    const result = parseDiscussion(VALID_REPLY);
    expect(result).not.toBeNull();
    expect(result.key_uncertainty).toBe("服务业务增速是否可持续");
    expect(result.follow_up_questions).toHaveLength(3);
    expect(result.exploration_paths).toHaveLength(2);
  });

  it("should return null when no DISCUSSION block", () => {
    const result = parseDiscussion(NO_MARKERS_REPLY);
    expect(result).toBeNull();
  });
});

describe("V2.1 marker strip", () => {
  it("should strip both marker blocks from finalReply", () => {
    const stripped = stripMarkers(VALID_REPLY);
    expect(stripped).not.toContain("%%DELIVERABLE%%");
    expect(stripped).not.toContain("%%END_DELIVERABLE%%");
    expect(stripped).not.toContain("%%DISCUSSION%%");
    expect(stripped).not.toContain("%%END_DISCUSSION%%");
    expect(stripped).toContain("这是分析正文内容");
  });

  it("should not modify reply without markers", () => {
    const stripped = stripMarkers(NO_MARKERS_REPLY);
    expect(stripped).toBe(NO_MARKERS_REPLY.trimEnd());
  });

  it("should handle graceful degradation: no markers → no crash", () => {
    expect(() => stripMarkers("")).not.toThrow();
    expect(() => parseDeliverable("")).not.toThrow();
    expect(() => parseDiscussion("")).not.toThrow();
  });
});
