/**
 * multiAgentAnalysis.ts
 * 并行多 Agent 分析层 — 参考 TradingAgents/AutoHedge 架构
 *
 * 架构设计：
 * - 将单一 LLM 分析拆分为 4 个专业角色并行运行
 * - 宏观分析师 (Macro Analyst)：宏观经济环境、利率/汇率/通胀影响
 * - 技术分析师 (Technical Analyst)：价格走势、技术指标信号、支撑/阻力
 * - 基本面分析师 (Fundamental Analyst)：财务报表、估值、盈利质量
 * - 情绪分析师 (Sentiment Analyst)：新闻情绪、市场情绪、分析师评级
 * - Director (汇总)：综合 4 个角色的输出，生成最终结构化判断
 */

import { invokeLLM } from "./_core/llm";

// ── Patch A: 回退检测常量（与 catch 块硬编码字符串一致） ──────────────────────────────────────────────────────────────────────────────

const FALLBACK_VERDICT = "分析失败（数据不足或 API 错误）";

function isAgentFallback(agent: AgentAnalysis): boolean {
  return agent.verdict === FALLBACK_VERDICT;
}

// ── 类型定义 ──────────────────────────────────────────────────────────────────────────────

export interface AgentAnalysis {
  role: "macro" | "technical" | "fundamental" | "sentiment" | "interpretation";
  roleName: string;
  verdict: string;           // 该角色的核心判断（1-2句）
  keyPoints: string[];       // 3-5个关键发现
  signal: "bullish" | "bearish" | "neutral" | "mixed";
  confidence: "high" | "medium" | "low";
  dataUsed: string[];        // 使用了哪些数据
  /** LEVEL1A: interpretation agent 专属字段，其他 agent 为 undefined */
  discussionHooks?: {
    key_uncertainty: string;
    weakest_point: string;
    alternative_view: string;
    follow_up_questions: string[];
    deeper_dive: string;
  };
}

export interface MultiAgentResult {
  agents: AgentAnalysis[];
  directorSummary: string;   // Director 汇总摘要（注入 Phase A prompt）
  consensusSignal: "bullish" | "bearish" | "neutral" | "mixed";
  divergenceNote: string;    // 各角色分歧说明（若有）
  elapsedMs: number;
  // V1.5: 角色重映射到 valuation/business/risk/market_context 分类
  roleClassification: {
    valuation_view: AgentAnalysis | null;   // fundamental 角色 → 估值视角
    business_view: AgentAnalysis | null;    // fundamental 角色 → 业务质量视角
    risk_view: AgentAnalysis | null;        // macro + sentiment 合并 → 风险视角
    market_context: AgentAnalysis | null;   // technical 角色 → 市场背景
  };
  /** LEVEL1A: interpretation agent 的 discussionHooks（若已激活） */
  discussionHooks?: AgentAnalysis["discussionHooks"];
  // Patch A: agent 成功门控新增字段
  analysisSucceeded: boolean;      // false = 门控阻断了合成
  successfulAgentCount: number;    // 通过门控的 agent 数量
  requiredAgentCount: number;      // 要求的最低阈值
}

// ── Agent 角色定义 ────────────────────────────────────────────────────────────

const AGENT_ROLES = {
  macro: {
    name: "宏观分析师",
    systemPrompt: `你是专业的宏观经济分析师。你的职责是从宏观视角分析投资标的所处的经济环境。
专注于：利率环境、通胀趋势、汇率影响、全球经济周期、行业宏观驱动因素、政策风险。
输出格式（严格 JSON）：
{
  "verdict": "核心宏观判断（1-2句，必须有方向性）",
  "keyPoints": ["关键发现1", "关键发现2", "关键发现3"],
  "signal": "bullish|bearish|neutral|mixed",
  "confidence": "high|medium|low",
  "dataUsed": ["使用的数据来源1", "使用的数据来源2"]
}`,
  },
  technical: {
    name: "技术分析师",
    systemPrompt: `你是专业的技术分析师。你的职责是从价格行为和技术指标角度分析投资标的。
专注于：趋势方向、支撑/阻力位、RSI/MACD/布林带信号、成交量确认、关键价格形态。
输出格式（严格 JSON）：
{
  "verdict": "核心技术判断（1-2句，必须有方向性）",
  "keyPoints": ["关键发现1", "关键发现2", "关键发现3"],
  "signal": "bullish|bearish|neutral|mixed",
  "confidence": "high|medium|low",
  "dataUsed": ["使用的数据来源1", "使用的数据来源2"]
}`,
  },
  fundamental: {
    name: "基本面分析师",
    systemPrompt: `你是专业的基本面分析师。你的职责是从财务报表和估值角度分析投资标的。
专注于：盈利能力（ROE/ROIC/毛利率）、成长性（营收/EPS增速）、估值（PE/PB/EV-EBITDA vs 历史/行业）、资产负债质量、自由现金流。
【重要】A股数据以中文呈现，以下中文字段等同于标准财务字段，必须识别并使用：
- 营业收入 = revenue（收入）
- 净利润 = net income（盈利）
- 每股收益 = EPS
- 市盈率 = PE ratio
- 净资产收益率 = ROE
- 毛利率 = gross margin
- 净利率 = net margin
若数据中包含上述中文字段，视为财务数据完整，必须基于这些数据给出有方向性的判断，禁止输出"数据不足"或"分析失败"。
输出格式（严格 JSON）：
{
  "verdict": "核心基本面判断（1-2句，必须有方向性）",
  "keyPoints": ["关键发现1", "关键发现2", "关键发现3"],
  "signal": "bullish|bearish|neutral|mixed",
  "confidence": "high|medium|low",
  "dataUsed": ["使用的数据来源1", "使用的数据来源2"]
}`,
  },
  sentiment: {
    name: "情绪分析师",
    systemPrompt: `你是专业的市场情绪分析师。你的职责是从市场情绪和新闻角度分析投资标的。
专注于：新闻情绪倾向、分析师评级变化、机构持仓变动、社交媒体情绪、内部人交易信号、短期催化剂。
输出格式（严格 JSON）：
{
  "verdict": "核心情绪判断（1-2句，必须有方向性）",
  "keyPoints": ["关键发现1", "关键发现2", "关键发现3"],
  "signal": "bullish|bearish|neutral|mixed",
  "confidence": "high|medium|low",
  "dataUsed": ["使用的数据来源1", "使用的数据来源2"]
}`,
  },
  interpretation: {
    name: "解读分析师",
    systemPrompt: `你是专业的投资解读分析师（Interpretation Agent）。你的职责是基于已有数据，生成深度讨论钩子和延伸问题。\n专注于：识别最大不确定性、指出分析中最薄弱的环节、提出对立观点、生成有价值的追问问题。\n输出格式（严格 JSON）：\n{\n  "verdict": "本次分析的核心解读（1-2句）",\n  "keyPoints": ["最大不确定性", "最薄弱环节", "对立观点"],\n  "signal": "neutral",\n  "confidence": "medium",\n  "dataUsed": ["使用的数据来源"],\n  "discussionHooks": {\n    "key_uncertainty": "最大不确定性（1句）",\n    "weakest_point": "分析中最薄弱的环节（1句）",\n    "alternative_view": "对立观点（1句）",\n    "follow_up_questions": ["追问1", "追问2", "追问3"],\n    "deeper_dive": "值得深入研究的方向（1句）"\n  }\n}`,
  },
};

// ── 核心函数 ──────────────────────────────────────────────────────────────────

/**
 * 运行单个 Agent 分析
 */
async function runAgent(
  role: keyof typeof AGENT_ROLES,
  taskDescription: string,
  dataReport: string,
  maxTokens = 400,
): Promise<AgentAnalysis> {
  const agentDef = AGENT_ROLES[role];
  // Option D: CN field mapping injection for fundamental agent
  // Scope: fundamental role only, triggered when dataReport contains CN markers
  const isCNFundamental =
    role === "fundamental" &&
    (dataReport.includes("A股基本面数据") || dataReport.includes("BaoStock"));
  const cnFieldMappingBlock = isCNFundamental
    ? `[CN_FIELD_MAPPING_FOR_AGENT]
营业收入 = financials.income.revenue
净利润 = financials.income.netIncome
每股收益 = financials.income.eps
市盈率 = valuation.pe
净资产收益率 = profitability.roe
毛利率 = profitability.grossMargin
净利率 = profitability.netMargin
负债权益比 = leverage.debtToEquity
流动比率 = liquidity.currentRatio

`
    : "";
  const userMsg = `分析任务：${taskDescription.slice(0, 200)}

可用数据：
${cnFieldMappingBlock}${dataReport.slice(0, 3000)}

请基于以上数据，从${agentDef.name}角度给出分析。只输出 JSON，不要任何其他文字。`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: agentDef.systemPrompt },
        { role: "user", content: userMsg },
      ],
      maxTokens,
      response_format: { type: "json_object" } as any,
    });

    const content = String(response.choices?.[0]?.message?.content || "{}");
    // Strip possible markdown code fences returned by Claude (e.g. ```json\n{...}\n```)
    const cleaned = content
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "")
      .trim();
    const parsed = JSON.parse(cleaned);

    // LEVEL1A: 提取 interpretation agent 的 discussionHooks
    const discussionHooks = role === "interpretation" && parsed.discussionHooks
      ? {
          key_uncertainty: String(parsed.discussionHooks.key_uncertainty || ""),
          weakest_point: String(parsed.discussionHooks.weakest_point || ""),
          alternative_view: String(parsed.discussionHooks.alternative_view || ""),
          follow_up_questions: Array.isArray(parsed.discussionHooks.follow_up_questions)
            ? parsed.discussionHooks.follow_up_questions.slice(0, 5)
            : [],
          deeper_dive: String(parsed.discussionHooks.deeper_dive || ""),
        }
      : undefined;

    return {
      role,
      roleName: agentDef.name,
      verdict: parsed.verdict || "无法生成判断",
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 5) : [],
      signal: ["bullish", "bearish", "neutral", "mixed"].includes(parsed.signal)
        ? parsed.signal
        : "neutral",
      confidence: ["high", "medium", "low"].includes(parsed.confidence)
        ? parsed.confidence
        : "low",
      dataUsed: Array.isArray(parsed.dataUsed) ? parsed.dataUsed : [],
      discussionHooks,
    };
  } catch (err) {
    console.error(`[AGENT_ERROR] role=${role} error=${String(err)}`);
    return {
      role,
      roleName: agentDef.name,
      verdict: "分析失败（数据不足或 API 错误）",
      keyPoints: [],
      signal: "neutral",
      confidence: "low",
      dataUsed: [],
    };
  }
}

/**
 * 计算共识信号
 */
function calcConsensusSignal(agents: AgentAnalysis[]): "bullish" | "bearish" | "neutral" | "mixed" {
  const signals = agents.map(a => a.signal);
  const bullCount = signals.filter(s => s === "bullish").length;
  const bearCount = signals.filter(s => s === "bearish").length;
  const neutralCount = signals.filter(s => s === "neutral" || s === "mixed").length;

  if (bullCount >= 3) return "bullish";
  if (bearCount >= 3) return "bearish";
  if (bullCount > bearCount + 1) return "bullish";
  if (bearCount > bullCount + 1) return "bearish";
  if (neutralCount >= 3) return "neutral";
  return "mixed";
}

/**
 * 生成 Director 汇总摘要（注入 Phase A prompt）
 */
function buildDirectorSummary(agents: AgentAnalysis[], consensus: string): string {
  const signalEmoji: Record<string, string> = {
    bullish: "🟢",
    bearish: "🔴",
    neutral: "⚪",
    mixed: "🟡",
  };

  const lines: string[] = [
    `[MULTI_AGENT_ANALYSIS — 并行 4 角色分析结果]`,
    `共识信号：${signalEmoji[consensus] ?? "⚪"} ${consensus.toUpperCase()}`,
    "",
  ];

  for (const agent of agents) {
    const emoji = signalEmoji[agent.signal] ?? "⚪";
    lines.push(`## ${agent.roleName} ${emoji} [${agent.signal.toUpperCase()}|${agent.confidence.toUpperCase()}]`);
    lines.push(`判断：${agent.verdict}`);
    if (agent.keyPoints.length > 0) {
      lines.push(`要点：${agent.keyPoints.join(" | ")}`);
    }
    lines.push("");
  }

  // 分歧检测
  const signals = agents.map(a => a.signal);
  const uniqueSignals = new Set(signals);
  if (uniqueSignals.size >= 3) {
    lines.push(`⚠️ 分歧警告：4 个分析角色出现 ${uniqueSignals.size} 种不同信号，建议在报告中明确标注不确定性。`);
  } else if (uniqueSignals.size === 2 && signals.includes("bullish") && signals.includes("bearish")) {
    lines.push(`⚠️ 多空分歧：存在明显多空对立，需要在报告中充分呈现两方论据。`);
  }

  return lines.join("\n");
}

/**
 * 主函数：并行运行所有 Agent 分析
 * @param taskDescription 任务描述
 * @param dataReport Manus 收集的数据报告
 * @param taskType 任务类型（决定激活哪些 Agent）
 * @param maxTokensPerAgent 每个 Agent 的最大 token 数
 */
export async function runMultiAgentAnalysis(
  taskDescription: string,
  dataReport: string,
  taskType: "stock_analysis" | "macro_analysis" | "crypto_analysis" | "portfolio_review" | "event_driven" | "discussion" | "general" | string = "general",
  maxTokensPerAgent = 300,
): Promise<MultiAgentResult> {
  const t0 = Date.now();

  // 根据任务类型决定激活哪些 Agent
  let activeRoles: Array<keyof typeof AGENT_ROLES>;
  if (taskType === "stock_analysis") {
    activeRoles = ["macro", "technical", "fundamental", "sentiment", "interpretation"];
  } else if (taskType === "macro_analysis") {
    activeRoles = ["macro", "sentiment", "interpretation"];
  } else if (taskType === "crypto_analysis") {
    activeRoles = ["technical", "sentiment", "interpretation"];
  } else if (taskType === "portfolio_review") {
    activeRoles = ["macro", "fundamental", "interpretation"];
  } else if (taskType === "event_driven") {
    activeRoles = ["fundamental", "sentiment", "interpretation"];
  } else if (taskType === "discussion") {
    activeRoles = ["interpretation"];
  } else {
    // general：基本面 + 情绪 + 解读
    activeRoles = ["fundamental", "sentiment", "interpretation"];
  }

  // 并行运行所有激活的 Agent
  const agentPromises = activeRoles.map(role =>
    runAgent(role, taskDescription, dataReport, maxTokensPerAgent)
  );
   const agents = await Promise.all(agentPromises);

  // ── Patch A: Agent 成功门控 ──────────────────────────────────────────────────────────────────────────────
  const successfulAgents = agents.filter(a => !isAgentFallback(a));
  const requiredSuccessCount = Math.ceil(activeRoles.length / 2);
  if (successfulAgents.length < requiredSuccessCount) {
    console.warn(
      `[MultiAgent:GATE] 代理数量不足：` +
      `${successfulAgents.length}/${activeRoles.length} 个成功，` +
      `需要 ${requiredSuccessCount} 个。终止合成。`
    );
    return {
      agents: [],            // 空数组：防止 agentTaxonomyNormalizer 产出错误分类
      directorSummary: "",   // 空字符串：防止注入 Step3 提示词
      consensusSignal: "neutral" as const,
      divergenceNote: `[分析中断] ${successfulAgents.length}/${activeRoles.length} 个代理成功，` +
        `低于最低要求 ${requiredSuccessCount} 个 — 跳过多代理分析`,
      elapsedMs: Date.now() - t0,
      roleClassification: {
        valuation_view: null,
        business_view: null,
        risk_view: null,
        market_context: null,
      },
      discussionHooks: undefined,
      analysisSucceeded: false,
      successfulAgentCount: successfulAgents.length,
      requiredAgentCount: requiredSuccessCount,
    };
  }
  // ── 门控通过，继续合成 ──────────────────────────────────────────────────────────────────────────────

  const consensusSignal = calcConsensusSignal(agents);
  const directorSummary = buildDirectorSummary(agents, consensusSignal);

  // 分歧说明
  const signals = agents.map(a => a.signal);
  const uniqueSignals = new Set(signals);
  let divergenceNote = "";
  if (uniqueSignals.size >= 3) {
    divergenceNote = `多角色分析出现 ${uniqueSignals.size} 种不同信号，存在较大分歧`;
  } else if (uniqueSignals.size === 2) {
    const signalList = Array.from(uniqueSignals);
    divergenceNote = `${signalList[0]} vs ${signalList[1]} 存在分歧`;
  }

  // V1.5: 角色重映射 — fundamental 拆分为 valuation_view + business_view，其他角色直接映射
  const fundamentalAgent = agents.find(a => a.role === "fundamental") ?? null;
  const macroAgent = agents.find(a => a.role === "macro") ?? null;
  const sentimentAgent = agents.find(a => a.role === "sentiment") ?? null;
  const technicalAgent = agents.find(a => a.role === "technical") ?? null;

  // valuation_view: fundamental 角色，但强调估值相关内容
  const valuation_view = fundamentalAgent ? {
    ...fundamentalAgent,
    roleName: "估値视角",
    keyPoints: fundamentalAgent.keyPoints.filter(p =>
      /PE|PB|EV|EBITDA|估値|市盈率|市净率|盘市率|目标价|安全边际|DCF|FCF|自由现金流/i.test(p)
    ).concat(fundamentalAgent.keyPoints.filter(p =>
      !/PE|PB|EV|EBITDA|估値|市盈率|市净率|盘市率|目标价|安全边际|DCF|FCF|自由现金流/i.test(p)
    )).slice(0, 5),
  } : null;

  // business_view: fundamental 角色，但强调业务质量相关内容
  const business_view = fundamentalAgent ? {
    ...fundamentalAgent,
    roleName: "业务质量视角",
    keyPoints: fundamentalAgent.keyPoints.filter(p =>
      /ROE|ROIC|毛利率|营收|增速|EPS|盈利能力|资产质量|负帏质量|业务|商业模式|护城河/i.test(p)
    ).concat(fundamentalAgent.keyPoints.filter(p =>
      !/ROE|ROIC|毛利率|营收|增速|EPS|盈利能力|资产质量|负帏质量|业务|商业模式|护城河/i.test(p)
    )).slice(0, 5),
  } : null;

  // risk_view: macro + sentiment 合并，强调风险因素
  const risk_view = (macroAgent || sentimentAgent) ? {
    role: "macro" as const,
    roleName: "风险视角",
    verdict: [
      macroAgent ? `宏观风险：${macroAgent.verdict}` : "",
      sentimentAgent ? `情绪风险：${sentimentAgent.verdict}` : "",
    ].filter(Boolean).join(" | "),
    keyPoints: [
      ...(macroAgent?.keyPoints ?? []).slice(0, 2),
      ...(sentimentAgent?.keyPoints ?? []).slice(0, 2),
    ].slice(0, 5),
    signal: (macroAgent?.signal === "bearish" || sentimentAgent?.signal === "bearish")
      ? "bearish" as const
      : (macroAgent?.signal === "bullish" && sentimentAgent?.signal === "bullish")
        ? "bullish" as const
        : "mixed" as const,
    confidence: "medium" as const,
    dataUsed: [
      ...(macroAgent?.dataUsed ?? []),
      ...(sentimentAgent?.dataUsed ?? []),
    ],
  } : null;

  // market_context: technical 角色直接映射
  const market_context = technicalAgent ? {
    ...technicalAgent,
    roleName: "市场背景",
  } : null;

  // LEVEL1A: 提取 interpretation agent 的 discussionHooks 到顶层
  const interpretationAgent = agents.find(a => a.role === "interpretation");
  const discussionHooks = interpretationAgent?.discussionHooks;

  return {
    agents,
    directorSummary,
    consensusSignal,
    divergenceNote,
    elapsedMs: Date.now() - t0,
    roleClassification: { valuation_view, business_view, risk_view, market_context },
    discussionHooks,
    // Patch A: 门控通过时必填字段
    analysisSucceeded: true,
    successfulAgentCount: successfulAgents.length,
    requiredAgentCount: requiredSuccessCount,
  };
}

/**
 * 格式化多 Agent 结果为 Markdown（用于报告展示）
 */
export function formatMultiAgentResult(result: MultiAgentResult): string {
  if (result.agents.length === 0) return "";

  const signalEmoji: Record<string, string> = {
    bullish: "🟢 看多",
    bearish: "🔴 看空",
    neutral: "⚪ 中性",
    mixed: "🟡 混合",
  };

  const confidenceLabel: Record<string, string> = {
    high: "高",
    medium: "中",
    low: "低",
  };

  const lines: string[] = [
    `### 多角色并行分析结果`,
    ``,
    `| 分析角色 | 信号 | 置信度 | 核心判断 |`,
    `|---------|------|--------|---------|`,
  ];

  for (const agent of result.agents) {
    const signal = signalEmoji[agent.signal] ?? agent.signal;
    const conf = confidenceLabel[agent.confidence] ?? agent.confidence;
    lines.push(`| ${agent.roleName} | ${signal} | ${conf} | ${agent.verdict.slice(0, 60)}... |`);
  }

  lines.push(``);
  lines.push(`**共识信号：** ${signalEmoji[result.consensusSignal] ?? result.consensusSignal}`);

  if (result.divergenceNote) {
    lines.push(`**分歧说明：** ${result.divergenceNote}`);
  }

  lines.push(``);
  lines.push(`*各角色分析耗时：${result.elapsedMs}ms（并行执行）*`);

  return lines.join("\n");
}
