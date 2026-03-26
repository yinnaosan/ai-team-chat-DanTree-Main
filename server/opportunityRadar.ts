/**
 * Opportunity Radar Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Early-opportunity detection layer for DanTree.
 * NOT a stock screener. NOT a fast-news chaser.
 * Detects: industry rotation, cycle shifts, tech/energy trends,
 *          policy shifts, hidden divergence between narrative and reality.
 *
 * Output state limited to: SELECT | WAIT
 * Full BUY/HOLD/SELL execution is handled by Level4 Action Engine.
 */

import { invokeLLM } from "./_core/llm";
import { getMacroDashboard } from "./fredApi";
import { searchFinancialNews } from "./tavilySearch";
// worldMonitorApi requires per-ticker context — not used for global radar scan

// ─── Data Model ───────────────────────────────────────────────────────────────

export type OpportunityState = "SELECT" | "WAIT";

export type OpportunityCategory =
  | "industry_rotation"    // 行业轮动
  | "cycle_shift"          // 周期转换
  | "tech_theme"           // 技术主题
  | "energy_theme"         // 能源主题
  | "policy_shift"         // 政策变化
  | "macro_inflection"     // 宏观拐点
  | "hidden_divergence";   // 隐含逻辑/叙事与现实背离

export interface OpportunityWhyBlock {
  surface: string;   // 表面：可见的、已被市场讨论的
  trend: string;     // 趋势：方向性变化，但尚未被充分定价
  hidden: string;    // 隐含：非显性驱动因素，逆向或超前逻辑
}

export interface RadarItem {
  id: string;                      // unique key
  title: string;                   // 机会方向
  category: OpportunityCategory;   // 分类
  currentPhase: string;            // 当前阶段（e.g. "早期布局期", "政策催化窗口"）
  opportunityState: OpportunityState;  // SELECT | WAIT
  why: OpportunityWhyBlock;        // 为什么值得关注
  cycle: "Early" | "Mid" | "Late" | "Decline";  // 周期阶段
  riskSummary: string;             // 风险提示
  confidence: number;              // 0-100
  relatedTickers?: string[];       // 相关标的（可选）
  generatedAt: number;             // timestamp
}

export interface OpportunityRadarResult {
  items: RadarItem[];
  scanTime: string;
  dataSourcesSummary: string;
  totalCount: number;
}

// ─── Input Aggregation ────────────────────────────────────────────────────────

interface RadarInputBundle {
  macroDashboard: string;
  worldMonitorSummary: string;
  thematicNewsBlocks: string[];
}

const THEMATIC_QUERIES = [
  "AI semiconductor industry rotation 2025",
  "energy transition policy shift renewable",
  "emerging market macro inflection rate cycle",
  "biotech regulatory approval pipeline",
  "China stimulus sector rotation consumer",
];

async function aggregateRadarInputs(): Promise<RadarInputBundle> {
  // macroResult is index 0, newsResults are indices 1..N
  const allResults = await Promise.allSettled([
    getMacroDashboard(),
    ...THEMATIC_QUERIES.map((q) => searchFinancialNews(q, 3)),
  ]);

  const macroResult = allResults[0];
  const newsSettled = allResults.slice(1);

  const macroDashboard =
    macroResult.status === "fulfilled"
      ? (macroResult.value as string)
      : "宏观数据暂不可用";

  // worldMonitorApi requires per-ticker context; reuse macro for global context
  const worldMonitorSummary = macroDashboard.slice(0, 600);

  const thematicNewsBlocks = newsSettled.map((r, i) =>
    r.status === "fulfilled" && r.value
      ? `[主题 ${i + 1}: ${THEMATIC_QUERIES[i]}]\n${r.value as string}`
      : `[主题 ${i + 1}: ${THEMATIC_QUERIES[i]}] 数据暂不可用`
  );

  return { macroDashboard, worldMonitorSummary, thematicNewsBlocks };
}

// ─── LLM Prompt Builder ───────────────────────────────────────────────────────

function buildRadarSystemPrompt(): string {
  return `You are DanTree's Opportunity Radar Engine.

Your role is NOT to chase fast news or screen stocks.
Your role is to detect EARLY opportunities based on:
- Industry rotation patterns
- Cycle phase transitions
- Technology and energy structural themes
- Policy shifts and regulatory catalysts
- Hidden divergence between market narrative and underlying reality

PHILOSOPHY:
DanTree competes on EARLIER understanding, DEEPER logic, and PATIENT capital positioning.
Surface what others miss. Identify what is not yet priced.

OUTPUT RULES:
1. Return EXACTLY 4-6 structured opportunity items
2. Each item must have a clear WHY with three layers: surface / trend / hidden
3. opportunityState is ONLY "SELECT" or "WAIT" — no BUY/SELL/HOLD at this stage
4. SELECT = worth building a watchlist position / starting research
5. WAIT = interesting but timing not right, monitor for entry
6. confidence: 0-100 (be honest, early opportunities are often 40-65)
7. relatedTickers: 1-3 representative tickers max, or omit if uncertain
8. cycle: one of "Early" | "Mid" | "Late" | "Decline"

CATEGORY OPTIONS:
- industry_rotation: sector money flow shifts
- cycle_shift: macro cycle phase change
- tech_theme: structural technology trend
- energy_theme: energy transition or commodity cycle
- policy_shift: regulatory or government policy catalyst
- macro_inflection: macro data turning point
- hidden_divergence: narrative vs reality gap

QUALITY RULES:
- Surface = what is already being discussed publicly
- Trend = directional change not yet fully priced
- Hidden = non-obvious driver, contrarian or early logic
- riskSummary = specific, not generic ("regulatory uncertainty" is too vague)
- currentPhase = descriptive Chinese label (e.g. "政策催化窗口期", "早期布局阶段", "周期底部确认中")

Return valid JSON only. No markdown. No explanation outside JSON.`;
}

function buildRadarUserPrompt(inputs: RadarInputBundle): string {
  const newsBlock = inputs.thematicNewsBlocks.slice(0, 4).join("\n\n");
  return `Based on the following real-time data, identify 4-6 early investment opportunities.

=== MACRO DASHBOARD ===
${inputs.macroDashboard.slice(0, 1200)}

=== GLOBAL MONITOR ===
${inputs.worldMonitorSummary.slice(0, 600)}

=== THEMATIC NEWS SIGNALS ===
${newsBlock.slice(0, 2000)}

Return JSON array of opportunity items matching this exact schema:
[
  {
    "id": "unique-slug",
    "title": "机会方向标题（中文）",
    "category": "industry_rotation|cycle_shift|tech_theme|energy_theme|policy_shift|macro_inflection|hidden_divergence",
    "currentPhase": "当前阶段描述（中文）",
    "opportunityState": "SELECT|WAIT",
    "why": {
      "surface": "表面可见的驱动因素",
      "trend": "方向性趋势，尚未充分定价",
      "hidden": "非显性驱动，逆向或超前逻辑"
    },
    "cycle": "Early|Mid|Late|Decline",
    "riskSummary": "具体风险提示（中文）",
    "confidence": 55,
    "relatedTickers": ["TICKER1", "TICKER2"]
  }
]`;
}

// ─── JSON Schema for Structured Output ───────────────────────────────────────

const RADAR_JSON_SCHEMA = {
  type: "json_schema" as const,
  json_schema: {
    name: "opportunity_radar_result",
    strict: true,
    schema: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              title: { type: "string" },
              category: {
                type: "string",
                enum: [
                  "industry_rotation",
                  "cycle_shift",
                  "tech_theme",
                  "energy_theme",
                  "policy_shift",
                  "macro_inflection",
                  "hidden_divergence",
                ],
              },
              currentPhase: { type: "string" },
              opportunityState: { type: "string", enum: ["SELECT", "WAIT"] },
              why: {
                type: "object",
                properties: {
                  surface: { type: "string" },
                  trend: { type: "string" },
                  hidden: { type: "string" },
                },
                required: ["surface", "trend", "hidden"],
                additionalProperties: false,
              },
              cycle: {
                type: "string",
                enum: ["Early", "Mid", "Late", "Decline"],
              },
              riskSummary: { type: "string" },
              confidence: { type: "number" },
              relatedTickers: { type: "array", items: { type: "string" } },
            },
            required: [
              "id",
              "title",
              "category",
              "currentPhase",
              "opportunityState",
              "why",
              "cycle",
              "riskSummary",
              "confidence",
              "relatedTickers",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
};

// ─── Main Engine ──────────────────────────────────────────────────────────────

export async function runOpportunityRadar(): Promise<OpportunityRadarResult> {
  const scanTime = new Date().toISOString();

  // 1. Aggregate inputs
  const inputs = await aggregateRadarInputs();

  // 2. Call LLM with structured output
  const response = await invokeLLM({
    messages: [
      { role: "system", content: buildRadarSystemPrompt() },
      { role: "user", content: buildRadarUserPrompt(inputs) },
    ],
    response_format: RADAR_JSON_SCHEMA,
  });

  const rawContent = response?.choices?.[0]?.message?.content;
  if (!rawContent) {
    throw new Error("[OpportunityRadar] LLM returned empty response");
  }

  // 3. Parse result
  let parsed: { items: Omit<RadarItem, "generatedAt">[] };
  try {
    parsed =
      typeof rawContent === "string" ? JSON.parse(rawContent) : rawContent;
  } catch {
    throw new Error("[OpportunityRadar] Failed to parse LLM JSON response");
  }

  const now = Date.now();
  const items: RadarItem[] = (parsed.items ?? []).map((item) => ({
    ...item,
    generatedAt: now,
  }));

  return {
    items,
    scanTime,
    dataSourcesSummary: "FRED宏观 + 全球监控 + Tavily主题新闻（5个方向）",
    totalCount: items.length,
  };
}

// ─── Cache Layer (in-memory, 30-min TTL) ─────────────────────────────────────

interface RadarCache {
  result: OpportunityRadarResult;
  cachedAt: number;
}

let radarCache: RadarCache | null = null;
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function getOpportunityRadarCached(): Promise<OpportunityRadarResult> {
  const now = Date.now();
  if (radarCache && now - radarCache.cachedAt < CACHE_TTL_MS) {
    return radarCache.result;
  }
  const result = await runOpportunityRadar();
  radarCache = { result, cachedAt: now };
  return result;
}

export function invalidateRadarCache(): void {
  radarCache = null;
}
