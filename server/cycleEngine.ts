/**
 * cycleEngine.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * CYCLE ENGINE FOUNDATION — DanTree Macro + Industry Cycle Reasoning Layer
 *
 * Outputs:
 *   1. 当前宏观阶段 (Early Expansion / Mid Expansion / Late Cycle / Slowdown)
 *   2. 资金流向 (行业轮动方向)
 *   3. 领先行业 / 落后行业
 *   4. 市场风格 (risk-on / risk-off)
 *   5. 为什么 (Surface / Trend / Hidden)
 *   6. 风险提示
 *
 * Data sources: FRED (macro indicators) + Yahoo Finance sector ETFs + LLM reasoning
 */

import { getFredLatest, FRED_SERIES } from "./fredApi";
import { invokeLLM } from "./_core/llm";

// ─── Types ────────────────────────────────────────────────────────────────────

export type MacroStage =
  | "Early Expansion"
  | "Mid Expansion"
  | "Late Cycle"
  | "Slowdown / Recession";

export type MarketStyle = "risk-on" | "risk-off" | "neutral";

export interface CycleWhyBlock {
  surface: string;   // 表面现象（可直接观察的数据信号）
  trend: string;     // 趋势层（数据背后的结构性变化）
  hidden: string;    // 隐含层（市场尚未定价的深层逻辑）
}

export interface SectorRotation {
  leading: string[];    // 领先板块
  lagging: string[];    // 落后板块
  emerging: string[];   // 新兴主题
  capitalFlow: string;  // 资金流向描述
}

export interface CycleEngineOutput {
  stage: MacroStage;
  stageLabel: string;           // Chinese label
  marketStyle: MarketStyle;
  marketStyleLabel: string;
  sectorRotation: SectorRotation;
  why: CycleWhyBlock;
  riskWarnings: string[];
  confidence: number;           // 0-100
  dataSnapshot: MacroDataSnapshot;
  generatedAt: number;          // UTC ms
  cacheHit?: boolean;
}

export interface MacroDataSnapshot {
  fedFundsRate: number | null;
  cpi: number | null;
  corePce: number | null;
  unemployment: number | null;
  treasury10y: number | null;
  treasury2y: number | null;
  yieldCurveSpread: number | null;   // 10Y - 2Y
  gdpGrowth: number | null;
  creditSpread: number | null;
  m2: number | null;
  dataDate: string;
}

// ─── Sector ETF map (Yahoo Finance symbols) ───────────────────────────────────

const SECTOR_ETFS: Record<string, string> = {
  "科技 (XLK)": "XLK",
  "金融 (XLF)": "XLF",
  "能源 (XLE)": "XLE",
  "医疗 (XLV)": "XLV",
  "消费必需品 (XLP)": "XLP",
  "可选消费 (XLY)": "XLY",
  "工业 (XLI)": "XLI",
  "材料 (XLB)": "XLB",
  "公用事业 (XLU)": "XLU",
  "房地产 (XLRE)": "XLRE",
  "通信服务 (XLC)": "XLC",
};

// ─── Step 1: Fetch Macro Data ─────────────────────────────────────────────────

async function fetchMacroSnapshot(): Promise<MacroDataSnapshot> {
  const series = [
    { key: "fedFundsRate",  id: FRED_SERIES.FED_FUNDS_RATE },
    { key: "cpi",           id: FRED_SERIES.CPI },
    { key: "corePce",       id: FRED_SERIES.CORE_PCE },
    { key: "unemployment",  id: FRED_SERIES.UNEMPLOYMENT },
    { key: "treasury10y",   id: FRED_SERIES.TREASURY_10Y },
    { key: "treasury2y",    id: FRED_SERIES.TREASURY_2Y },
    { key: "gdpGrowth",     id: FRED_SERIES.GDP_GROWTH },
    { key: "creditSpread",  id: FRED_SERIES.CREDIT_SPREAD },
    { key: "m2",            id: FRED_SERIES.M2 },
  ];

  const results = await Promise.allSettled(
    series.map(s => getFredLatest(s.id).then(r => ({ key: s.key, value: r.value, date: r.date })))
  );

  const snap: MacroDataSnapshot = {
    fedFundsRate: null, cpi: null, corePce: null, unemployment: null,
    treasury10y: null, treasury2y: null, yieldCurveSpread: null,
    gdpGrowth: null, creditSpread: null, m2: null,
    dataDate: new Date().toISOString().slice(0, 10),
  };

  for (const r of results) {
    if (r.status === "fulfilled") {
      (snap as any)[r.value.key] = r.value.value;
      snap.dataDate = r.value.date;
    }
  }

  // Compute yield curve spread
  if (snap.treasury10y !== null && snap.treasury2y !== null) {
    snap.yieldCurveSpread = parseFloat((snap.treasury10y - snap.treasury2y).toFixed(3));
  }

  return snap;
}

// ─── Step 2: Fetch Sector Performance via Yahoo Finance ──────────────────────

async function fetchSectorPerformance(): Promise<Record<string, number>> {
  const symbols = Object.values(SECTOR_ETFS);
  const perf: Record<string, number> = {};

  try {
    // Use Yahoo Finance batch quote endpoint
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols.join(",")}&fields=regularMarketChangePercent`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Yahoo sector fetch failed: ${res.status}`);
    const data = await res.json();
    const quotes = data?.quoteResponse?.result ?? [];
    for (const q of quotes) {
      const label = Object.entries(SECTOR_ETFS).find(([, sym]) => sym === q.symbol)?.[0];
      if (label && typeof q.regularMarketChangePercent === "number") {
        perf[label] = parseFloat(q.regularMarketChangePercent.toFixed(2));
      }
    }
  } catch {
    // Graceful degradation — return empty, LLM will reason without sector data
  }

  return perf;
}

// ─── Step 3: Rule-based Macro Stage Classification ───────────────────────────

function classifyMacroStage(snap: MacroDataSnapshot): {
  stage: MacroStage;
  confidence: number;
  signals: string[];
} {
  const signals: string[] = [];
  let earlyScore = 0, midScore = 0, lateScore = 0, slowdownScore = 0;

  // Yield curve
  if (snap.yieldCurveSpread !== null) {
    if (snap.yieldCurveSpread < -0.2) {
      signals.push(`收益率曲线倒挂 (${snap.yieldCurveSpread}%) — 衰退信号`);
      slowdownScore += 3;
    } else if (snap.yieldCurveSpread < 0.5) {
      signals.push(`收益率曲线趋平 (${snap.yieldCurveSpread}%) — 周期后段`);
      lateScore += 2;
    } else {
      signals.push(`收益率曲线正常 (${snap.yieldCurveSpread}%) — 扩张期`);
      earlyScore += 1; midScore += 1;
    }
  }

  // Fed Funds Rate
  if (snap.fedFundsRate !== null) {
    if (snap.fedFundsRate >= 5.0) {
      signals.push(`联邦基金利率高位 (${snap.fedFundsRate}%) — 紧缩末期`);
      lateScore += 2; slowdownScore += 1;
    } else if (snap.fedFundsRate >= 3.0) {
      signals.push(`联邦基金利率中高位 (${snap.fedFundsRate}%) — 中后期`);
      midScore += 1; lateScore += 1;
    } else if (snap.fedFundsRate <= 1.0) {
      signals.push(`联邦基金利率低位 (${snap.fedFundsRate}%) — 宽松/早期扩张`);
      earlyScore += 2;
    } else {
      signals.push(`联邦基金利率正常化 (${snap.fedFundsRate}%)`);
      midScore += 1;
    }
  }

  // Unemployment
  if (snap.unemployment !== null) {
    if (snap.unemployment <= 4.0) {
      signals.push(`失业率低位 (${snap.unemployment}%) — 劳动力市场过热`);
      lateScore += 1;
    } else if (snap.unemployment >= 6.0) {
      signals.push(`失业率上升 (${snap.unemployment}%) — 经济降温`);
      slowdownScore += 2;
    } else {
      signals.push(`失业率正常 (${snap.unemployment}%)`);
      midScore += 1;
    }
  }

  // GDP Growth
  if (snap.gdpGrowth !== null) {
    if (snap.gdpGrowth >= 3.0) {
      signals.push(`GDP增速强劲 (${snap.gdpGrowth}%) — 扩张期`);
      earlyScore += 1; midScore += 1;
    } else if (snap.gdpGrowth >= 1.0) {
      signals.push(`GDP增速温和 (${snap.gdpGrowth}%)`);
      midScore += 1; lateScore += 1;
    } else {
      signals.push(`GDP增速放缓 (${snap.gdpGrowth}%) — 衰退风险`);
      slowdownScore += 2;
    }
  }

  // Credit Spread
  if (snap.creditSpread !== null) {
    if (snap.creditSpread >= 5.0) {
      signals.push(`信用利差扩大 (${snap.creditSpread}%) — 风险厌恶`);
      slowdownScore += 2;
    } else if (snap.creditSpread <= 3.0) {
      signals.push(`信用利差收窄 (${snap.creditSpread}%) — 风险偏好`);
      earlyScore += 1; midScore += 1;
    }
  }

  const scores = { earlyScore, midScore, lateScore, slowdownScore };
  const maxScore = Math.max(...Object.values(scores));
  const total = Object.values(scores).reduce((a, b) => a + b, 0) || 1;

  let stage: MacroStage;
  if (slowdownScore === maxScore) stage = "Slowdown / Recession";
  else if (lateScore === maxScore) stage = "Late Cycle";
  else if (midScore === maxScore) stage = "Mid Expansion";
  else stage = "Early Expansion";

  const confidence = Math.round((maxScore / total) * 100);

  return { stage, confidence: Math.min(confidence, 85), signals };
}

// ─── Step 4: Sector Rotation Classification ──────────────────────────────────

function classifySectorRotation(
  stage: MacroStage,
  sectorPerf: Record<string, number>
): SectorRotation {
  // Stage-based rotation theory (Fidelity sector rotation model)
  const stageRotationMap: Record<MacroStage, { leading: string[]; lagging: string[]; emerging: string[] }> = {
    "Early Expansion": {
      leading: ["金融 (XLF)", "可选消费 (XLY)", "工业 (XLI)", "材料 (XLB)"],
      lagging: ["公用事业 (XLU)", "消费必需品 (XLP)", "医疗 (XLV)"],
      emerging: ["科技 (XLK)", "通信服务 (XLC)"],
    },
    "Mid Expansion": {
      leading: ["科技 (XLK)", "通信服务 (XLC)", "工业 (XLI)", "可选消费 (XLY)"],
      lagging: ["能源 (XLE)", "材料 (XLB)", "公用事业 (XLU)"],
      emerging: ["医疗 (XLV)", "金融 (XLF)"],
    },
    "Late Cycle": {
      leading: ["能源 (XLE)", "材料 (XLB)", "医疗 (XLV)"],
      lagging: ["科技 (XLK)", "可选消费 (XLY)", "金融 (XLF)"],
      emerging: ["消费必需品 (XLP)", "公用事业 (XLU)"],
    },
    "Slowdown / Recession": {
      leading: ["消费必需品 (XLP)", "公用事业 (XLU)", "医疗 (XLV)"],
      lagging: ["能源 (XLE)", "材料 (XLB)", "工业 (XLI)", "金融 (XLF)"],
      emerging: ["国债/现金防御"],
    },
  };

  const base = stageRotationMap[stage];

  // If we have live sector performance, override with actual data
  let leading = [...base.leading];
  let lagging = [...base.lagging];

  if (Object.keys(sectorPerf).length >= 5) {
    const sorted = Object.entries(sectorPerf).sort(([, a], [, b]) => b - a);
    const topN = sorted.slice(0, 3).map(([k]) => k);
    const botN = sorted.slice(-3).map(([k]) => k);
    // Blend: theory + live data
    leading = Array.from(new Set([...topN, ...base.leading.slice(0, 2)])).slice(0, 4);
    lagging = Array.from(new Set([...botN, ...base.lagging.slice(0, 2)])).slice(0, 4);
  }

  const capitalFlowMap: Record<MacroStage, string> = {
    "Early Expansion": "资金从防御性资产流向周期性资产，金融与工业率先受益",
    "Mid Expansion": "资金集中于成长股与科技，动量效应主导",
    "Late Cycle": "资金向大宗商品与能源轮动，通胀受益资产占优",
    "Slowdown / Recession": "资金撤出风险资产，流向防御性板块与国债",
  };

  return {
    leading,
    lagging,
    emerging: base.emerging,
    capitalFlow: capitalFlowMap[stage],
  };
}

// ─── Step 5: Market Style ─────────────────────────────────────────────────────

function classifyMarketStyle(snap: MacroDataSnapshot, stage: MacroStage): MarketStyle {
  if (stage === "Slowdown / Recession") return "risk-off";
  if (stage === "Early Expansion") return "risk-on";
  if (snap.yieldCurveSpread !== null && snap.yieldCurveSpread < 0) return "risk-off";
  if (snap.creditSpread !== null && snap.creditSpread >= 5.0) return "risk-off";
  if (stage === "Late Cycle") return "neutral";
  return "risk-on";
}

// ─── Step 6: LLM Three-Layer Reasoning ───────────────────────────────────────

async function generateWhyBlock(
  snap: MacroDataSnapshot,
  stage: MacroStage,
  rotation: SectorRotation,
  signals: string[]
): Promise<CycleWhyBlock> {
  const dataContext = `
宏观数据快照（来源：FRED）：
- 联邦基金利率: ${snap.fedFundsRate ?? "N/A"}%
- CPI: ${snap.cpi ?? "N/A"}
- 核心PCE: ${snap.corePce ?? "N/A"}%
- 失业率: ${snap.unemployment ?? "N/A"}%
- 10年期美债收益率: ${snap.treasury10y ?? "N/A"}%
- 2年期美债收益率: ${snap.treasury2y ?? "N/A"}%
- 收益率曲线利差(10Y-2Y): ${snap.yieldCurveSpread ?? "N/A"}%
- 实际GDP增速: ${snap.gdpGrowth ?? "N/A"}%
- 高收益信用利差: ${snap.creditSpread ?? "N/A"}%

当前判断：${stage}
领先板块：${rotation.leading.join("、")}
落后板块：${rotation.lagging.join("、")}
资金流向：${rotation.capitalFlow}
关键信号：${signals.join("；")}
`.trim();

  const prompt = `你是一位宏观周期分析师，请基于以下数据，用中文输出三层分析：

${dataContext}

请严格按以下JSON格式输出（不要有任何额外文字）：
{
  "surface": "表面现象：用1-2句话描述当前可直接观察到的宏观数据信号",
  "trend": "趋势层：用1-2句话描述数据背后的结构性变化和周期方向",
  "hidden": "隐含层：用1-2句话描述市场尚未充分定价的深层逻辑或风险"
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: "你是DanTree宏观周期引擎，专注于宏观周期判断与行业轮动分析。只输出JSON，不输出其他内容。" },
        { role: "user", content: prompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "cycle_why_block",
          strict: true,
          schema: {
            type: "object",
            properties: {
              surface: { type: "string" },
              trend: { type: "string" },
              hidden: { type: "string" },
            },
            required: ["surface", "trend", "hidden"],
            additionalProperties: false,
          },
        },
      },
    });

    const rawContent = response?.choices?.[0]?.message?.content;
    const content = typeof rawContent === "string" ? rawContent : null;
    if (content) {
      const parsed = JSON.parse(content);
      return { surface: parsed.surface, trend: parsed.trend, hidden: parsed.hidden };
    }
  } catch {
    // Fallback to rule-based
  }

  return {
    surface: `当前处于${stage}阶段，${signals[0] ?? "宏观数据显示周期特征"}`,
    trend: rotation.capitalFlow,
    hidden: "市场定价可能尚未完全反映周期转换的速度与幅度，需关注领先指标变化",
  };
}

// ─── Step 7: Risk Warnings ────────────────────────────────────────────────────

function generateRiskWarnings(snap: MacroDataSnapshot, stage: MacroStage): string[] {
  const warnings: string[] = [];

  if (snap.yieldCurveSpread !== null && snap.yieldCurveSpread < 0) {
    warnings.push(`收益率曲线倒挂 (${snap.yieldCurveSpread}%)：历史上此信号领先衰退 6-18 个月`);
  }
  if (snap.fedFundsRate !== null && snap.fedFundsRate >= 5.0) {
    warnings.push(`高利率环境 (${snap.fedFundsRate}%)：持续高利率压制估值，关注信贷收缩`);
  }
  if (snap.creditSpread !== null && snap.creditSpread >= 5.0) {
    warnings.push(`信用利差扩大 (${snap.creditSpread}%)：市场风险厌恶上升，高收益债承压`);
  }
  if (stage === "Late Cycle") {
    warnings.push("周期后段：通胀粘性与货币政策滞后效应叠加，波动率可能上升");
  }
  if (stage === "Slowdown / Recession") {
    warnings.push("衰退风险：企业盈利下修压力增大，防御性配置优先");
  }
  if (snap.unemployment !== null && snap.unemployment >= 5.5) {
    warnings.push(`失业率上升 (${snap.unemployment}%)：消费需求可能走弱`);
  }

  if (warnings.length === 0) {
    warnings.push("当前宏观环境相对稳定，维持正常风险管理");
  }

  return warnings;
}

// ─── Main Export: runCycleEngine ──────────────────────────────────────────────

export async function runCycleEngine(): Promise<CycleEngineOutput> {
  // Parallel data fetch
  const [snap, sectorPerf] = await Promise.all([
    fetchMacroSnapshot(),
    fetchSectorPerformance(),
  ]);

  const { stage, confidence, signals } = classifyMacroStage(snap);
  const rotation = classifySectorRotation(stage, sectorPerf);
  const marketStyle = classifyMarketStyle(snap, stage);
  const why = await generateWhyBlock(snap, stage, rotation, signals);
  const riskWarnings = generateRiskWarnings(snap, stage);

  const stageLabelMap: Record<MacroStage, string> = {
    "Early Expansion": "早期扩张",
    "Mid Expansion": "中期扩张",
    "Late Cycle": "周期后段",
    "Slowdown / Recession": "放缓 / 衰退",
  };

  const marketStyleLabelMap: Record<MarketStyle, string> = {
    "risk-on": "风险偏好（Risk-On）",
    "risk-off": "风险规避（Risk-Off）",
    "neutral": "中性观望",
  };

  return {
    stage,
    stageLabel: stageLabelMap[stage],
    marketStyle,
    marketStyleLabel: marketStyleLabelMap[marketStyle],
    sectorRotation: rotation,
    why,
    riskWarnings,
    confidence,
    dataSnapshot: snap,
    generatedAt: Date.now(),
  };
}
