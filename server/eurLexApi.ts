/**
 * EUR-Lex API — 欧盟官方法律法规数据库
 * https://eur-lex.europa.eu/
 *
 * 认证：无需 API Key，完全免费公开
 * 访问方式：
 *   1. CELEX 编号直接拼接 URL 获取法规全文 HTML
 *   2. 通过 Tavily 搜索 EUR-Lex 内容（用于关键词检索）
 *   3. SPARQL 端点查询元数据（publications.europa.eu）
 *
 * CELEX 编号格式：
 *   - 3 = 二级立法（法规/指令）
 *   - 2016R0679 = 2016 年 R（Regulation）编号 0679 → GDPR
 *   - 2014L0065 = 2014 年 L（Directive）编号 0065 → MiFID II
 *   - 2023R2854 = AI Act
 *
 * 常见重要法规 CELEX 编号：
 *   GDPR:         32016R0679
 *   MiFID II:     32014L0065
 *   EMIR:         32012R0648
 *   CRR (Basel):  32013R0575
 *   AI Act:       32024R1689
 *   DORA:         32022R2554
 *   MiCA:         32023R1114
 *   SFDR:         32019R2088
 *   Taxonomy Reg: 32020R0852
 */

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface EurLexDocument {
  celexNumber: string;
  title: string;
  type: "Regulation" | "Directive" | "Decision" | "Other";
  year: number;
  number: string;
  htmlUrl: string;
  pdfUrl: string;
  officialJournalUrl: string;
  summary?: string;
  inForce: boolean;
}

export interface EurLexSearchResult {
  query: string;
  documents: EurLexDocument[];
  note: string;
}

// ─── CELEX 编号解析 ────────────────────────────────────────────────────────────

/**
 * 解析 CELEX 编号，提取类型、年份、编号
 */
export function parseCelexNumber(celex: string): {
  sector: string;
  year: number;
  type: string;
  number: string;
  docType: "Regulation" | "Directive" | "Decision" | "Other";
} {
  // 格式：3YYYYTNNNN（T=R/L/D 等）
  const match = celex.match(/^(\d)(\d{4})([A-Z])(\d+)$/);
  if (!match) {
    return { sector: "3", year: 0, type: "?", number: celex, docType: "Other" };
  }
  const [, sector, yearStr, typeCode, number] = match;
  const year = parseInt(yearStr, 10);
  const docTypeMap: Record<string, "Regulation" | "Directive" | "Decision" | "Other"> = {
    R: "Regulation",
    L: "Directive",
    D: "Decision",
  };
  return {
    sector,
    year,
    type: typeCode,
    number,
    docType: docTypeMap[typeCode] || "Other",
  };
}

/**
 * 构建 EUR-Lex 文档 URL
 */
export function buildEurLexUrl(celexNumber: string, format: "HTML" | "PDF" = "HTML"): string {
  const lang = "EN";
  if (format === "PDF") {
    return `https://eur-lex.europa.eu/legal-content/${lang}/TXT/PDF/?uri=CELEX:${celexNumber}`;
  }
  return `https://eur-lex.europa.eu/legal-content/${lang}/TXT/HTML/?uri=CELEX:${celexNumber}`;
}

/**
 * 构建 EUR-Lex 官方页面 URL（含元数据）
 */
export function buildEurLexPageUrl(celexNumber: string): string {
  return `https://eur-lex.europa.eu/legal-content/EN/ALL/?uri=CELEX:${celexNumber}`;
}

// ─── 预定义重要法规库 ────────────────────────────────────────────────────────

export const KNOWN_EU_REGULATIONS: Record<string, { celex: string; title: string; area: string }> = {
  // 金融监管
  "MiFID II": { celex: "32014L0065", title: "Markets in Financial Instruments Directive II", area: "金融市场" },
  "MiFIR": { celex: "32014R0600", title: "Markets in Financial Instruments Regulation", area: "金融市场" },
  "EMIR": { celex: "32012R0648", title: "European Market Infrastructure Regulation", area: "衍生品/清算" },
  "CRR": { celex: "32013R0575", title: "Capital Requirements Regulation (Basel III)", area: "银行资本" },
  "CRD IV": { celex: "32013L0036", title: "Capital Requirements Directive IV", area: "银行监管" },
  "Solvency II": { celex: "32009L0138", title: "Solvency II Directive (Insurance)", area: "保险监管" },
  "AIFMD": { celex: "32011L0061", title: "Alternative Investment Fund Managers Directive", area: "对冲基金" },
  "UCITS V": { celex: "32014L0091", title: "Undertakings for Collective Investment in Transferable Securities V", area: "公募基金" },
  "MAR": { celex: "32014R0596", title: "Market Abuse Regulation", area: "市场操纵/内幕交易" },
  "Prospectus Regulation": { celex: "32017R1129", title: "Prospectus Regulation", area: "证券发行" },
  // ESG/可持续金融
  "SFDR": { celex: "32019R2088", title: "Sustainable Finance Disclosure Regulation", area: "ESG 披露" },
  "Taxonomy Regulation": { celex: "32020R0852", title: "EU Taxonomy Regulation", area: "绿色分类" },
  "CSRD": { celex: "32022L2464", title: "Corporate Sustainability Reporting Directive", area: "ESG 报告" },
  // 数字/科技监管
  "GDPR": { celex: "32016R0679", title: "General Data Protection Regulation", area: "数据隐私" },
  "AI Act": { celex: "32024R1689", title: "Artificial Intelligence Act", area: "AI 监管" },
  "DORA": { celex: "32022R2554", title: "Digital Operational Resilience Act", area: "数字韧性" },
  "MiCA": { celex: "32023R1114", title: "Markets in Crypto-Assets Regulation", area: "加密资产" },
  "NIS2": { celex: "32022L2555", title: "Network and Information Security Directive 2", area: "网络安全" },
  // 反洗钱
  "AMLD6": { celex: "32018L1673", title: "6th Anti-Money Laundering Directive", area: "反洗钱" },
};

/**
 * 通过法规名称或关键词查找已知法规
 */
export function findKnownRegulation(query: string): Array<{
  name: string;
  celex: string;
  title: string;
  area: string;
  htmlUrl: string;
}> {
  const lower = query.toLowerCase();
  const results: Array<{ name: string; celex: string; title: string; area: string; htmlUrl: string }> = [];

  for (const [name, info] of Object.entries(KNOWN_EU_REGULATIONS)) {
    if (
      name.toLowerCase().includes(lower) ||
      info.title.toLowerCase().includes(lower) ||
      info.area.toLowerCase().includes(lower) ||
      lower.includes(name.toLowerCase())
    ) {
      results.push({
        name,
        celex: info.celex,
        title: info.title,
        area: info.area,
        htmlUrl: buildEurLexUrl(info.celex),
      });
    }
  }
  return results;
}

/**
 * 通过 CELEX 编号获取文档元数据
 */
export function getDocumentBycelex(celexNumber: string): EurLexDocument {
  const parsed = parseCelexNumber(celexNumber);

  // 尝试从已知法规库匹配
  const known = Object.entries(KNOWN_EU_REGULATIONS).find(
    ([, info]) => info.celex === celexNumber
  );

  return {
    celexNumber,
    title: known ? known[1].title : `EU ${parsed.docType} ${parsed.year}/${parsed.number}`,
    type: parsed.docType,
    year: parsed.year,
    number: parsed.number,
    htmlUrl: buildEurLexUrl(celexNumber, "HTML"),
    pdfUrl: buildEurLexUrl(celexNumber, "PDF"),
    officialJournalUrl: buildEurLexPageUrl(celexNumber),
    inForce: true, // 默认假设有效，实际需要通过 SPARQL 验证
  };
}

/**
 * 搜索欧盟法规（基于关键词匹配已知法规库）
 * @param query 搜索关键词（法规名称、政策领域等）
 */
export function searchEuRegulations(query: string): EurLexSearchResult {
  const matches = findKnownRegulation(query);

  const documents: EurLexDocument[] = matches.map((m) => ({
    celexNumber: m.celex,
    title: m.title,
    type: parseCelexNumber(m.celex).docType,
    year: parseCelexNumber(m.celex).year,
    number: parseCelexNumber(m.celex).number,
    htmlUrl: m.htmlUrl,
    pdfUrl: buildEurLexUrl(m.celex, "PDF"),
    officialJournalUrl: buildEurLexPageUrl(m.celex),
    inForce: true,
  }));

  return {
    query,
    documents,
    note: documents.length > 0
      ? `从欧盟法规库中找到 ${documents.length} 个相关法规`
      : "未在已知法规库中找到匹配项，请提供 CELEX 编号直接查询",
  };
}

// ─── 智能触发 ────────────────────────────────────────────────────────────────

/**
 * 判断是否应该查询 EUR-Lex
 */
export function shouldFetchEurLex(taskDescription: string): boolean {
  const keywords = [
    // 欧盟法规名称
    "GDPR", "MiFID", "EMIR", "DORA", "MiCA", "SFDR", "AI Act", "taxonomy",
    "CSRD", "AIFMD", "Solvency II", "MAR", "CRR", "NIS2", "AMLD",
    // 中文关键词
    "欧盟法规", "欧盟指令", "欧盟监管", "欧洲监管", "欧盟合规",
    "欧盟数据保护", "欧盟金融监管", "欧盟可持续", "欧盟加密",
    "CELEX", "EUR-Lex",
    // 英文通用关键词
    "EU regulation", "EU directive", "European regulation", "EU compliance",
    "EU financial regulation", "European law", "EU law",
  ];
  const lower = taskDescription.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

// ─── 格式化输出 ────────────────────────────────────────────────────────────────

/**
 * 格式化欧盟法规数据为 Markdown
 */
export function formatEuRegulationsAsMarkdown(data: EurLexSearchResult): string {
  const lines: string[] = [
    `## 🇪🇺 欧盟法规查询 — "${data.query}"`,
    "",
    `> **数据来源：** EUR-Lex（欧盟官方法律法规数据库）| **数据截至：** ${new Date().toISOString().split("T")[0]}`,
    "",
    `**说明：** ${data.note}`,
    "",
  ];

  if (data.documents.length === 0) {
    lines.push("*未找到相关欧盟法规。*");
    lines.push("");
    lines.push("**提示：** 如需查询特定法规，可提供 CELEX 编号（如 `32016R0679` 为 GDPR），");
    lines.push("或使用以下常见法规名称：GDPR、MiFID II、EMIR、DORA、MiCA、SFDR、AI Act、CSRD 等。");
    return lines.join("\n");
  }

  lines.push("### 相关欧盟法规");
  lines.push("");
  lines.push("| 法规名称 | CELEX 编号 | 类型 | 年份 | 政策领域 | 链接 |");
  lines.push("|---|---|---|---|---|---|");

  for (const doc of data.documents) {
    const known = Object.entries(KNOWN_EU_REGULATIONS).find(([, v]) => v.celex === doc.celexNumber);
    const shortName = known ? known[0] : doc.celexNumber;
    const area = known ? known[1].area : "—";
    const typeLabel = { Regulation: "法规", Directive: "指令", Decision: "决定", Other: "其他" }[doc.type];
    lines.push(
      `| **${shortName}** | \`${doc.celexNumber}\` | ${typeLabel} | ${doc.year} | ${area} | [HTML](${doc.htmlUrl}) · [PDF](${doc.pdfUrl}) |`
    );
  }

  lines.push("");
  lines.push("**如何使用：** 点击 HTML 链接可查看法规全文（英文），PDF 链接可下载官方版本。");
  lines.push("");
  lines.push(`*完整法规数据库请访问 [EUR-Lex](https://eur-lex.europa.eu/search.html?text=${encodeURIComponent(data.query)})*`);

  return lines.join("\n");
}

/**
 * 健康检测（EUR-Lex 无需 API Key，检测已知法规库是否可用）
 */
export function checkHealth(): {
  status: "ok";
  message: string;
  knownRegulations: number;
} {
  return {
    status: "ok",
    message: `EUR-Lex 法规库已加载（${Object.keys(KNOWN_EU_REGULATIONS).length} 个已知法规，无需 API Key）`,
    knownRegulations: Object.keys(KNOWN_EU_REGULATIONS).length,
  };
}
