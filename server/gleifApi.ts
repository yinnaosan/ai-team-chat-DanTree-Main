/**
 * GLEIF API — Global Legal Entity Identifier Foundation
 * 免费公开 API，无需 API Key
 * 文档：https://www.gleif.org/en/lei-data/gleif-api
 * 用途：查询公司全球 LEI 编码、法人结构、母子公司关系
 */

const GLEIF_BASE = "https://api.gleif.org/api/v1";

export interface GleifEntity {
  lei: string;
  legalName: string;
  jurisdiction: string;
  legalForm: string;
  registeredAddress: {
    addressLines: string[];
    city: string;
    country: string;
    postalCode?: string;
  };
  status: "ACTIVE" | "INACTIVE" | "PENDING_TRANSFER" | "PENDING_ARCHIVAL";
  registrationStatus: string;
  nextRenewalDate?: string;
  lastUpdateDate?: string;
  managingLou?: string;
}

export interface GleifRelationship {
  parentLei?: string;
  parentName?: string;
  childLei?: string;
  childName?: string;
  relationshipType: "IS_DIRECTLY_CONSOLIDATED_BY" | "IS_ULTIMATELY_CONSOLIDATED_BY" | "IS_INTERNATIONAL_BRANCH_OF";
}

export interface GleifResult {
  entities: GleifEntity[];
  relationships: GleifRelationship[];
  totalCount: number;
  query: string;
}

/** 通过公司名称搜索 LEI */
export async function searchByName(companyName: string, limit = 5): Promise<GleifEntity[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const url = `${GLEIF_BASE}/lei-records?filter[entity.legalName]=${encodeURIComponent(companyName)}&filter[entity.status]=ACTIVE&page[size]=${limit}&sort=relevance`;
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.api+json" },
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const json = await res.json();
    return (json.data || []).map((item: any) => parseEntity(item));
  } catch {
    clearTimeout(timer);
    return [];
  }
}

/** 通过 LEI 编码精确查询 */
export async function getByLei(lei: string): Promise<GleifEntity | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${GLEIF_BASE}/lei-records/${lei}`, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.api+json" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    return json.data ? parseEntity(json.data) : null;
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/** 查询直接母公司关系 */
export async function getDirectParent(lei: string): Promise<GleifRelationship | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${GLEIF_BASE}/lei-records/${lei}/direct-parent`, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.api+json" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.data) return null;
    const parent = json.data;
    return {
      parentLei: parent.id,
      parentName: parent.attributes?.entity?.legalName?.name ?? "",
      childLei: lei,
      relationshipType: "IS_DIRECTLY_CONSOLIDATED_BY",
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/** 查询最终母公司关系 */
export async function getUltimateParent(lei: string): Promise<GleifRelationship | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(`${GLEIF_BASE}/lei-records/${lei}/ultimate-parent`, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.api+json" },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const json = await res.json();
    if (!json.data) return null;
    const parent = json.data;
    return {
      parentLei: parent.id,
      parentName: parent.attributes?.entity?.legalName?.name ?? "",
      childLei: lei,
      relationshipType: "IS_ULTIMATELY_CONSOLIDATED_BY",
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

/** 主入口：按公司名称搜索并获取法人结构 */
export async function getCompanyLeiInfo(companyName: string): Promise<GleifResult | null> {
  const entities = await searchByName(companyName, 3);
  if (entities.length === 0) return null;

  const relationships: GleifRelationship[] = [];
  // 只对第一个（最相关）结果查询母公司关系
  const primaryLei = entities[0].lei;
  const [directParent, ultimateParent] = await Promise.allSettled([
    getDirectParent(primaryLei),
    getUltimateParent(primaryLei),
  ]);
  if (directParent.status === "fulfilled" && directParent.value) {
    relationships.push(directParent.value);
  }
  if (ultimateParent.status === "fulfilled" && ultimateParent.value) {
    // 避免重复（直接母公司 = 最终母公司时只保留一条）
    const up = ultimateParent.value;
    if (!relationships.some(r => r.parentLei === up.parentLei)) {
      relationships.push(up);
    }
  }

  return { entities, relationships, totalCount: entities.length, query: companyName };
}

/** 格式化为 Markdown */
export function formatGleifAsMarkdown(result: GleifResult): string {
  if (!result || result.entities.length === 0) return "";

  const lines: string[] = [
    `## GLEIF 法人识别码 — ${result.query}`,
    "",
    `> 查询到 ${result.totalCount} 条活跃法人记录，以下显示最相关结果`,
    "",
  ];

  // 主要实体表格
  lines.push("### 法人实体信息");
  lines.push("");
  lines.push("| 字段 | 内容 |");
  lines.push("|------|------|");

  const primary = result.entities[0];
  lines.push(`| **LEI 编码** | \`${primary.lei}\` |`);
  lines.push(`| **法定名称** | ${primary.legalName} |`);
  lines.push(`| **注册司法管辖区** | ${primary.jurisdiction} |`);
  lines.push(`| **法律形式** | ${primary.legalForm} |`);
  lines.push(`| **注册地址** | ${[...primary.registeredAddress.addressLines, primary.registeredAddress.city, primary.registeredAddress.country].filter(Boolean).join(", ")} |`);
  lines.push(`| **实体状态** | ${primary.status} |`);
  lines.push(`| **注册状态** | ${primary.registrationStatus} |`);
  if (primary.nextRenewalDate) {
    lines.push(`| **下次续期日** | ${primary.nextRenewalDate.slice(0, 10)} |`);
  }
  if (primary.lastUpdateDate) {
    lines.push(`| **最后更新** | ${primary.lastUpdateDate.slice(0, 10)} |`);
  }

  // 其他匹配实体（如有）
  if (result.entities.length > 1) {
    lines.push("");
    lines.push("### 其他匹配实体");
    lines.push("");
    lines.push("| LEI | 法定名称 | 国家 | 状态 |");
    lines.push("|-----|---------|------|------|");
    for (const e of result.entities.slice(1)) {
      lines.push(`| \`${e.lei}\` | ${e.legalName} | ${e.registeredAddress.country} | ${e.status} |`);
    }
  }

  // 法人结构关系
  if (result.relationships.length > 0) {
    lines.push("");
    lines.push("### 法人结构关系");
    lines.push("");
    for (const rel of result.relationships) {
      const typeLabel = rel.relationshipType === "IS_DIRECTLY_CONSOLIDATED_BY"
        ? "直接母公司"
        : rel.relationshipType === "IS_ULTIMATELY_CONSOLIDATED_BY"
          ? "最终母公司"
          : "国际分支";
      lines.push(`- **${typeLabel}**：${rel.parentName || "未知"} (\`${rel.parentLei || "N/A"}\`)`);
    }
  }

  lines.push("");
  lines.push(`*数据来源：GLEIF (Global Legal Entity Identifier Foundation) — 免费公开数据*`);

  return lines.join("\n");
}

/** 判断是否需要调用 GLEIF（检测到跨国公司/LEI/法人结构关键词时触发） */
export function shouldFetchGleif(text: string): boolean {
  const lower = text.toLowerCase();
  const triggers = [
    "lei", "legal entity identifier", "法人识别码", "法人编码",
    "母公司", "子公司", "法人结构", "跨国公司", "跨国企业",
    "parent company", "subsidiary", "corporate structure", "holding company",
    "gleif", "lei code", "lei number",
    "法人实体", "注册法人", "境外注册", "offshore entity",
  ];
  return triggers.some(t => lower.includes(t));
}

/** 健康检测 */
export async function checkGleifHealth(): Promise<{ status: "ok" | "error"; latencyMs?: number }> {
  const start = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 6000);
  try {
    // 用一个已知的 LEI 做探针（Apple Inc.）
    const res = await fetch(`${GLEIF_BASE}/lei-records/HWUPKR0MPOU8FGXBT394`, {
      signal: controller.signal,
      headers: { Accept: "application/vnd.api+json" },
    });
    clearTimeout(timer);
    return { status: res.ok ? "ok" : "error", latencyMs: Date.now() - start };
  } catch {
    clearTimeout(timer);
    return { status: "error", latencyMs: Date.now() - start };
  }
}

// ── 内部解析辅助 ──────────────────────────────────────────────────────────────

function parseEntity(item: any): GleifEntity {
  const attrs = item.attributes || {};
  const entity = attrs.entity || {};
  const reg = attrs.registration || {};
  const addr = entity.registeredAddress || {};
  return {
    lei: item.id || attrs.lei || "",
    legalName: entity.legalName?.name || entity.legalName || "",
    jurisdiction: entity.jurisdiction || "",
    legalForm: entity.legalForm?.id || entity.legalForm || "",
    registeredAddress: {
      addressLines: addr.addressLines || [],
      city: addr.city || "",
      country: addr.country || "",
      postalCode: addr.postalCode,
    },
    status: entity.status || "ACTIVE",
    registrationStatus: reg.status || "",
    nextRenewalDate: reg.nextRenewalDate,
    lastUpdateDate: reg.lastUpdateDate,
    managingLou: reg.managingLou,
  };
}
