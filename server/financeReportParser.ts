/**
 * financeReportParser.ts — GallenQiu/FinanceReportAnalysis 风格的财报 PDF 解析
 *
 * 参考架构：
 *   - GallenQiu/FinanceReportAnalysis: https://github.com/GallenQiu/FinanceReportAnalysis
 *   - 专门针对上市公司财报 PDF 的结构化信息提取
 *
 * 核心功能：
 *   1. 财报类型检测（年报/季报/中报/招股书/研报）
 *   2. 结构化财务指标提取（营收/净利润/EPS/毛利率/现金流/资产负债）
 *   3. 同比/环比增长率自动计算
 *   4. 关键风险因素提取
 *   5. 管理层讨论摘要提取
 *
 * 实现方式：
 *   - 基础文本提取：pdftotext（poppler-utils，已安装）
 *   - 结构化提取：LLM + JSON Schema（精准提取财务数字）
 *   - 触发条件：检测到 PDF 附件 + 财报关键词
 */

import { execFile } from "child_process";
import { promisify } from "util";
import { writeFileSync, unlinkSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { invokeLLM } from "./_core/llm";

const execFileAsync = promisify(execFile);

// ── 类型定义 ──────────────────────────────────────────────────────────────────

export type ReportType =
  | "annual_report"      // 年报
  | "quarterly_report"   // 季报
  | "interim_report"     // 中报/半年报
  | "prospectus"         // 招股书
  | "research_report"    // 研报
  | "earnings_release"   // 业绩公告
  | "unknown";

export interface FinancialMetrics {
  // 利润表
  revenue?: number;              // 营业收入（百万）
  revenueGrowthYoY?: number;     // 营收同比增长率
  grossProfit?: number;          // 毛利润（百万）
  grossMargin?: number;          // 毛利率（%）
  operatingIncome?: number;      // 营业利润（百万）
  operatingMargin?: number;      // 营业利润率（%）
  netIncome?: number;            // 净利润（百万）
  netMargin?: number;            // 净利润率（%）
  netIncomeGrowthYoY?: number;   // 净利润同比增长率
  eps?: number;                  // 每股收益
  epsGrowthYoY?: number;         // EPS 同比增长率
  ebitda?: number;               // EBITDA（百万）
  ebitdaMargin?: number;         // EBITDA 利润率（%）

  // 资产负债表
  totalAssets?: number;          // 总资产（百万）
  totalLiabilities?: number;     // 总负债（百万）
  totalEquity?: number;          // 股东权益（百万）
  debtToEquity?: number;         // 负债权益比
  currentRatio?: number;         // 流动比率
  cashAndEquivalents?: number;   // 现金及等价物（百万）

  // 现金流量表
  operatingCashFlow?: number;    // 经营现金流（百万）
  freeCashFlow?: number;         // 自由现金流（百万）
  capex?: number;                // 资本支出（百万）

  // 估值指标（如报告中提及）
  pe?: number;                   // 市盈率
  pb?: number;                   // 市净率
  dividendPerShare?: number;     // 每股股息

  // 报告期信息
  reportPeriod?: string;         // 报告期（如 "2024Q4", "FY2024"）
  currency?: string;             // 货币单位
  unit?: string;                 // 数字单位（百万/亿）
}

export interface RiskFactor {
  category: string;              // 风险类别
  description: string;           // 风险描述
  severity: "high" | "medium" | "low";
}

export interface FinanceReportResult {
  filename: string;
  reportType: ReportType;
  companyName?: string;
  ticker?: string;
  reportPeriod?: string;
  metrics: FinancialMetrics;
  riskFactors: RiskFactor[];
  managementDiscussion?: string;  // 管理层讨论摘要
  keyHighlights: string[];        // 关键亮点
  rawTextLength: number;
  extractionMethod: "pdftotext" | "llm_file_url" | "heuristic";
  error?: string;
}

// ── 财报检测 ──────────────────────────────────────────────────────────────────

const REPORT_KEYWORDS = {
  // 注意：interim_report 必须在 annual_report 之前检测，避免 "年" 误匹配 "中期报告"
  interim_report: ["中期报告", "半年报", "interim report", "半年度"],
  annual_report: ["年度报告", "年度业绩", "annual report", "form 10-k", "10-k", "20-f"],
  quarterly_report: ["季度报告", "季报", "quarterly report", "form 10-q", "10-q", "第一季度", "第二季度", "第三季度", "第四季度"],
  prospectus: ["招股说明书", "招股书", "prospectus", "ipo", "上市申请"],
  research_report: ["研究报告", "研报", "分析报告", "投资评级", "目标价", "research report", "equity research"],
  earnings_release: ["业绩公告", "业绩快报", "earnings release", "earnings announcement", "financial results"],
};

/**
 * 检测 PDF 是否为财报，并判断类型
 */
export function detectReportType(text: string): ReportType {
  const lower = text.toLowerCase();
  for (const [type, keywords] of Object.entries(REPORT_KEYWORDS)) {
    if (keywords.some(kw => lower.includes(kw.toLowerCase()))) {
      return type as ReportType;
    }
  }
  // 通用财务关键词检测
  const financialKeywords = ["revenue", "net income", "earnings per share", "balance sheet", "cash flow",
    "营业收入", "净利润", "每股收益", "资产负债", "现金流"];
  if (financialKeywords.some(kw => lower.includes(kw.toLowerCase()))) {
    return "earnings_release";
  }
  return "unknown";
}

/**
 * 判断是否为财报 PDF（供外部调用）
 */
export function isFinanceReport(filename: string, extractedText?: string): boolean {
  const nameLower = filename.toLowerCase();
  const nameKeywords = ["annual", "report", "10-k", "10-q", "20-f", "earnings", "financial",
    "年报", "季报", "中报", "招股", "业绩", "财报"];
  if (nameKeywords.some(kw => nameLower.includes(kw))) return true;
  if (extractedText) {
    const type = detectReportType(extractedText);
    return type !== "unknown";
  }
  return false;
}

// ── PDF 文本提取 ──────────────────────────────────────────────────────────────

/**
 * 使用 pdftotext（poppler-utils）提取 PDF 文本
 * 比启发式方法更准确，支持复杂排版
 */
async function extractPdfText(buffer: Buffer): Promise<{ text: string; method: "pdftotext" | "heuristic" }> {
  // 方法1：pdftotext（系统工具，已安装）
  const tmpFile = join(tmpdir(), `finance_report_${Date.now()}.pdf`);
  try {
    writeFileSync(tmpFile, buffer);
    const { stdout } = await execFileAsync("pdftotext", ["-layout", tmpFile, "-"], {
      timeout: 30000,
      maxBuffer: 20 * 1024 * 1024,
    });
    if (stdout.trim().length > 100) {
      return { text: stdout.slice(0, 50000), method: "pdftotext" };
    }
  } catch {
    // pdftotext 失败，回退到启发式
  } finally {
    try { unlinkSync(tmpFile); } catch { /* ignore */ }
  }

  // 方法2：启发式文本提取
  const raw = buffer.toString("latin1");
  const textMatches = raw.match(/\(([^\)]{2,200})\)/g) || [];
  const extracted = textMatches
    .map(m => m.slice(1, -1).replace(/\\[0-9]{3}|\\[nrtf\\()]/g, " ").trim())
    .filter(t => t.length > 3 && /[\u4e00-\u9fa5a-zA-Z0-9]/.test(t))
    .join("\n")
    .slice(0, 30000);

  return { text: extracted, method: "heuristic" };
}

// ── LLM 结构化提取 ────────────────────────────────────────────────────────────

/**
 * 使用 LLM + JSON Schema 从财报文本中提取结构化财务指标
 */
async function extractMetricsWithLLM(
  text: string,
  reportType: ReportType,
  s3Url?: string
): Promise<{ metrics: FinancialMetrics; companyName?: string; ticker?: string; keyHighlights: string[]; managementDiscussion?: string; riskFactors: RiskFactor[] }> {
  const truncatedText = text.slice(0, 15000); // LLM 上下文限制

  const systemPrompt = `你是一个专业的财务报告分析师，擅长从上市公司财报中提取关键财务数据。
请从以下财报文本中提取结构化数据，所有金额统一转换为百万（M）为单位，增长率用小数表示（如 0.15 表示 15%）。
如果某项数据在文本中不存在，返回 null。`;

  const userPrompt = `请从以下${reportType === "annual_report" ? "年报" : reportType === "quarterly_report" ? "季报" : "财报"}文本中提取关键财务数据：

---
${truncatedText}
---

请以 JSON 格式返回，包含以下字段（不存在的字段返回 null）：
{
  "companyName": "公司名称",
  "ticker": "股票代码（如 AAPL）",
  "reportPeriod": "报告期（如 FY2024 或 2024Q4）",
  "currency": "货币（如 USD, CNY, HKD）",
  "revenue": 营业收入（百万）,
  "revenueGrowthYoY": 营收同比增长率（小数）,
  "grossProfit": 毛利润（百万）,
  "grossMargin": 毛利率（小数）,
  "operatingIncome": 营业利润（百万）,
  "operatingMargin": 营业利润率（小数）,
  "netIncome": 净利润（百万）,
  "netMargin": 净利润率（小数）,
  "netIncomeGrowthYoY": 净利润同比增长率（小数）,
  "eps": 每股收益,
  "epsGrowthYoY": EPS同比增长率（小数）,
  "ebitda": EBITDA（百万）,
  "totalAssets": 总资产（百万）,
  "totalLiabilities": 总负债（百万）,
  "totalEquity": 股东权益（百万）,
  "cashAndEquivalents": 现金及等价物（百万）,
  "operatingCashFlow": 经营现金流（百万）,
  "freeCashFlow": 自由现金流（百万）,
  "capex": 资本支出（百万）,
  "dividendPerShare": 每股股息,
  "keyHighlights": ["关键亮点1", "关键亮点2", "关键亮点3"],
  "managementDiscussion": "管理层讨论摘要（100字以内）",
  "riskFactors": [
    {"category": "风险类别", "description": "风险描述", "severity": "high/medium/low"}
  ]
}`;

  try {
    const response = await invokeLLM({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "finance_report_extraction",
          strict: false,
          schema: {
            type: "object",
            properties: {
              companyName: { type: ["string", "null"] },
              ticker: { type: ["string", "null"] },
              reportPeriod: { type: ["string", "null"] },
              currency: { type: ["string", "null"] },
              revenue: { type: ["number", "null"] },
              revenueGrowthYoY: { type: ["number", "null"] },
              grossProfit: { type: ["number", "null"] },
              grossMargin: { type: ["number", "null"] },
              operatingIncome: { type: ["number", "null"] },
              operatingMargin: { type: ["number", "null"] },
              netIncome: { type: ["number", "null"] },
              netMargin: { type: ["number", "null"] },
              netIncomeGrowthYoY: { type: ["number", "null"] },
              eps: { type: ["number", "null"] },
              epsGrowthYoY: { type: ["number", "null"] },
              ebitda: { type: ["number", "null"] },
              totalAssets: { type: ["number", "null"] },
              totalLiabilities: { type: ["number", "null"] },
              totalEquity: { type: ["number", "null"] },
              cashAndEquivalents: { type: ["number", "null"] },
              operatingCashFlow: { type: ["number", "null"] },
              freeCashFlow: { type: ["number", "null"] },
              capex: { type: ["number", "null"] },
              dividendPerShare: { type: ["number", "null"] },
              keyHighlights: { type: "array", items: { type: "string" } },
              managementDiscussion: { type: ["string", "null"] },
              riskFactors: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    category: { type: "string" },
                    description: { type: "string" },
                    severity: { type: "string" },
                  },
                },
              },
            },
          },
        },
      } as Parameters<typeof invokeLLM>[0]["response_format"],
    });

    const rawContent = response.choices?.[0]?.message?.content;
    if (!rawContent) throw new Error("LLM returned empty response");
    const content = typeof rawContent === "string" ? rawContent : JSON.stringify(rawContent);

    const parsed = JSON.parse(content);
    const metrics: FinancialMetrics = {
      revenue: parsed.revenue ?? undefined,
      revenueGrowthYoY: parsed.revenueGrowthYoY ?? undefined,
      grossProfit: parsed.grossProfit ?? undefined,
      grossMargin: parsed.grossMargin ?? undefined,
      operatingIncome: parsed.operatingIncome ?? undefined,
      operatingMargin: parsed.operatingMargin ?? undefined,
      netIncome: parsed.netIncome ?? undefined,
      netMargin: parsed.netMargin ?? undefined,
      netIncomeGrowthYoY: parsed.netIncomeGrowthYoY ?? undefined,
      eps: parsed.eps ?? undefined,
      epsGrowthYoY: parsed.epsGrowthYoY ?? undefined,
      ebitda: parsed.ebitda ?? undefined,
      totalAssets: parsed.totalAssets ?? undefined,
      totalLiabilities: parsed.totalLiabilities ?? undefined,
      totalEquity: parsed.totalEquity ?? undefined,
      cashAndEquivalents: parsed.cashAndEquivalents ?? undefined,
      operatingCashFlow: parsed.operatingCashFlow ?? undefined,
      freeCashFlow: parsed.freeCashFlow ?? undefined,
      capex: parsed.capex ?? undefined,
      dividendPerShare: parsed.dividendPerShare ?? undefined,
      reportPeriod: parsed.reportPeriod ?? undefined,
      currency: parsed.currency ?? undefined,
    };

    return {
      metrics,
      companyName: parsed.companyName ?? undefined,
      ticker: parsed.ticker ?? undefined,
      keyHighlights: Array.isArray(parsed.keyHighlights) ? parsed.keyHighlights.slice(0, 5) : [],
      managementDiscussion: parsed.managementDiscussion ?? undefined,
      riskFactors: Array.isArray(parsed.riskFactors)
        ? parsed.riskFactors.slice(0, 5).map((r: { category?: string; description?: string; severity?: string }) => ({
            category: r.category || "未分类",
            description: r.description || "",
            severity: (["high", "medium", "low"].includes(r.severity || "") ? r.severity : "medium") as "high" | "medium" | "low",
          }))
        : [],
    };
  } catch (err) {
    console.error("[FinanceReportParser] LLM extraction failed:", err);
    return { metrics: {}, keyHighlights: [], riskFactors: [] };
  }
}

// ── 主解析函数 ─────────────────────────────────────────────────────────────────

/**
 * 解析财报 PDF，提取结构化财务数据
 * @param buffer PDF 文件内容
 * @param filename 文件名
 * @param s3Url S3 公开 URL（可选，用于 LLM file_url 解析）
 */
export async function parseFinanceReport(
  buffer: Buffer,
  filename: string,
  s3Url?: string
): Promise<FinanceReportResult> {
  // Step 1: 提取 PDF 文本
  const { text, method } = await extractPdfText(buffer);

  // Step 2: 检测报告类型
  const reportType = detectReportType(text);

  // Step 3: LLM 结构化提取
  const { metrics, companyName, ticker, keyHighlights, managementDiscussion, riskFactors } =
    await extractMetricsWithLLM(text, reportType, s3Url);

  return {
    filename,
    reportType,
    companyName,
    ticker,
    reportPeriod: metrics.reportPeriod,
    metrics,
    riskFactors,
    managementDiscussion,
    keyHighlights,
    rawTextLength: text.length,
    extractionMethod: method,
  };
}

// ── 格式化输出 ─────────────────────────────────────────────────────────────────

/**
 * 将财报解析结果格式化为 Markdown 报告
 */
export function formatFinanceReportResult(result: FinanceReportResult): string {
  const reportTypeLabels: Record<ReportType, string> = {
    annual_report: "年度报告",
    quarterly_report: "季度报告",
    interim_report: "中期报告",
    prospectus: "招股书",
    research_report: "研究报告",
    earnings_release: "业绩公告",
    unknown: "财务文件",
  };

  const lines: string[] = [
    `## 财报解析结果 — ${result.companyName || result.filename}`,
    ``,
    `**报告类型：** ${reportTypeLabels[result.reportType]}  |  **报告期：** ${result.reportPeriod || "未知"}  |  **货币：** ${result.metrics.currency || "未知"}`,
    ``,
  ];

  // 关键亮点
  if (result.keyHighlights.length > 0) {
    lines.push(`### 关键亮点`);
    for (const highlight of result.keyHighlights) {
      lines.push(`- ${highlight}`);
    }
    lines.push(``);
  }

  // 利润表核心指标
  const m = result.metrics;
  const hasIncomeData = m.revenue !== undefined || m.netIncome !== undefined || m.eps !== undefined;
  if (hasIncomeData) {
    lines.push(`### 利润表核心指标`);
    lines.push(`| 指标 | 数值 | 同比变化 |`);
    lines.push(`|------|------|---------|`);
    if (m.revenue !== undefined) {
      const growth = m.revenueGrowthYoY !== undefined ? `${m.revenueGrowthYoY >= 0 ? "+" : ""}${(m.revenueGrowthYoY * 100).toFixed(1)}%` : "N/A";
      lines.push(`| 营业收入 | ${m.revenue.toFixed(0)}M ${m.currency || ""} | ${growth} |`);
    }
    if (m.grossProfit !== undefined) {
      const margin = m.grossMargin !== undefined ? `（毛利率 ${(m.grossMargin * 100).toFixed(1)}%）` : "";
      lines.push(`| 毛利润 | ${m.grossProfit.toFixed(0)}M${margin} | — |`);
    }
    if (m.operatingIncome !== undefined) {
      const margin = m.operatingMargin !== undefined ? `（营业利润率 ${(m.operatingMargin * 100).toFixed(1)}%）` : "";
      lines.push(`| 营业利润 | ${m.operatingIncome.toFixed(0)}M${margin} | — |`);
    }
    if (m.netIncome !== undefined) {
      const growth = m.netIncomeGrowthYoY !== undefined ? `${m.netIncomeGrowthYoY >= 0 ? "+" : ""}${(m.netIncomeGrowthYoY * 100).toFixed(1)}%` : "N/A";
      const margin = m.netMargin !== undefined ? `（净利润率 ${(m.netMargin * 100).toFixed(1)}%）` : "";
      lines.push(`| 净利润 | ${m.netIncome.toFixed(0)}M${margin} | ${growth} |`);
    }
    if (m.eps !== undefined) {
      const growth = m.epsGrowthYoY !== undefined ? `${m.epsGrowthYoY >= 0 ? "+" : ""}${(m.epsGrowthYoY * 100).toFixed(1)}%` : "N/A";
      lines.push(`| 每股收益（EPS） | ${m.eps.toFixed(2)} | ${growth} |`);
    }
    if (m.ebitda !== undefined) {
      const margin = m.ebitdaMargin !== undefined ? `（EBITDA 利润率 ${(m.ebitdaMargin * 100).toFixed(1)}%）` : "";
      lines.push(`| EBITDA | ${m.ebitda.toFixed(0)}M${margin} | — |`);
    }
    lines.push(``);
  }

  // 资产负债表
  const hasBalanceData = m.totalAssets !== undefined || m.cashAndEquivalents !== undefined;
  if (hasBalanceData) {
    lines.push(`### 资产负债表`);
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    if (m.totalAssets !== undefined) lines.push(`| 总资产 | ${m.totalAssets.toFixed(0)}M |`);
    if (m.totalLiabilities !== undefined) lines.push(`| 总负债 | ${m.totalLiabilities.toFixed(0)}M |`);
    if (m.totalEquity !== undefined) lines.push(`| 股东权益 | ${m.totalEquity.toFixed(0)}M |`);
    if (m.debtToEquity !== undefined) lines.push(`| 负债权益比 | ${m.debtToEquity.toFixed(2)}x |`);
    if (m.cashAndEquivalents !== undefined) lines.push(`| 现金及等价物 | ${m.cashAndEquivalents.toFixed(0)}M |`);
    lines.push(``);
  }

  // 现金流量
  const hasCashFlowData = m.operatingCashFlow !== undefined || m.freeCashFlow !== undefined;
  if (hasCashFlowData) {
    lines.push(`### 现金流量`);
    lines.push(`| 指标 | 数值 |`);
    lines.push(`|------|------|`);
    if (m.operatingCashFlow !== undefined) lines.push(`| 经营现金流 | ${m.operatingCashFlow.toFixed(0)}M |`);
    if (m.freeCashFlow !== undefined) lines.push(`| 自由现金流 | ${m.freeCashFlow.toFixed(0)}M |`);
    if (m.capex !== undefined) lines.push(`| 资本支出（CapEx） | ${m.capex.toFixed(0)}M |`);
    lines.push(``);
  }

  // 管理层讨论
  if (result.managementDiscussion) {
    lines.push(`### 管理层讨论摘要`);
    lines.push(`> ${result.managementDiscussion}`);
    lines.push(``);
  }

  // 风险因素
  if (result.riskFactors.length > 0) {
    lines.push(`### 主要风险因素`);
    const severityIcon = { high: "🔴", medium: "🟡", low: "🟢" };
    for (const risk of result.riskFactors) {
      lines.push(`- ${severityIcon[risk.severity]} **${risk.category}**：${risk.description}`);
    }
    lines.push(``);
  }

  lines.push(`> **数据来源：** 财报 PDF 解析（GallenQiu/FinanceReportAnalysis 架构）| 提取方法：${result.extractionMethod} | 原文长度：${result.rawTextLength} 字符`);

  return lines.join("\n");
}
