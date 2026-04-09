/**
 * ============================================================
 * DATA ROUTING ENGINE — DanTree Phase 1
 * ============================================================
 *
 * 实现 STEP 3（routing）+ STEP 4（fallback）+ STEP 5（provider 状态）
 *
 * 规则：
 * - 每层按 Primary → Backup → Backup2 顺序尝试
 * - fail 判定：null / "" / undefined / error string / HTTP error / rate limit / malformed
 * - 全部 fail → 标记 unavailable
 * - 只有 active + valid data 才参与 evidenceScore
 *
 * 禁止：
 * - 把错误字符串当成功
 * - 把空字符串当成功
 * - 调用任何未在 DATA_ROUTING_MATRIX 中注册的 API
 */

import { ENV } from "./_core/env";
import {
  DATA_ROUTING_MATRIX,
  RoutingLayer,
  ProviderConfig,
  ProviderStatus,
  getLayerConfig,
  getLayerProviders,
} from "./dataRoutingMatrix";

// ── Provider 运行时状态 ────────────────────────────────────────────────────────
export interface ProviderResult {
  id: string;
  displayName: string;
  layer: RoutingLayer;
  status: ProviderStatus;
  /** 实际返回的数据（只有 active 时有值） */
  data: string | null;
  /** 调用耗时（ms），-1 表示未调用 */
  latencyMs: number;
  /** 错误信息（failed 时有值） */
  error?: string;
  /** 是否参与 evidenceScore */
  countsForEvidence: boolean;
}

export interface LayerResult {
  layer: RoutingLayer;
  /** 最终使用的 provider（active 的那个） */
  activeProvider: string | null;
  /** 是否触发了 fallback */
  fallbackUsed: boolean;
  /** 层级状态 */
  status: ProviderStatus;
  /** 最终有效数据 */
  data: string | null;
  /** 所有 provider 的尝试记录 */
  providerResults: ProviderResult[];
  /** 是否参与 evidenceScore */
  countsForEvidence: boolean;
}

// ── fail 判定函数 ──────────────────────────────────────────────────────────────
export function isFailedData(data: unknown): boolean {
  if (data === null || data === undefined) return true;
  if (typeof data !== "string") return false;
  const s = data.trim();
  if (s === "") return true;
  if (s.startsWith("获取") && s.includes("失败")) return true;
  if (s.startsWith("Failed")) return true;
  if (s.startsWith("Error")) return true;
  if (s.includes("TypeError: fetch failed")) return true;
  if (s.includes("fetch failed")) return true;
  if (s.includes("ECONNREFUSED")) return true;
  if (s.includes("ETIMEDOUT")) return true;
  if (s.includes("HTTP:000")) return true;
  if (s.includes("API请求失败")) return true;
  if (s.includes("rate limit") || s.includes("Rate Limit") || s.includes("429")) return true;
  if (s.includes("NOT_AUTHORIZED") || s.includes("Unauthorized") || s.includes("403")) return true;
  if (s.includes("Error Message")) return true;
  // 小于 15 字符且无数字 → 无效
  if (s.length < 15 && !/\d/.test(s)) return true;
  return false;
}

// ── Key 状态检测 ───────────────────────────────────────────────────────────────
export function getProviderKeyStatus(provider: ProviderConfig): "present" | "missing" {
  if (!provider.envKey) return "present"; // 无需 key
  const val = (ENV as unknown as Record<string, string | undefined>)[provider.envKey];
  if (!val || val.trim() === "") return "missing";
  return "present";
}

// ── 单 Provider 调用包装器 ─────────────────────────────────────────────────────
/**
 * 调用单个 provider 的 fetch 函数，返回标准化的 ProviderResult
 * @param provider provider 配置
 * @param layer 所属层
 * @param fetchFn 实际的 fetch 函数（由各层的 fetcher 提供）
 * @param role 角色：primary / backup / backup2
 */
async function callProvider(
  provider: ProviderConfig,
  layer: RoutingLayer,
  fetchFn: () => Promise<string | null>,
  role: "primary" | "backup" | "backup2"
): Promise<ProviderResult> {
  // 检查 key
  if (getProviderKeyStatus(provider) === "missing") {
    return {
      id: provider.id,
      displayName: provider.displayName,
      layer,
      status: "missing_key",
      data: null,
      latencyMs: -1,
      error: `env var ${provider.envKey} not set`,
      countsForEvidence: false,
    };
  }

  const t0 = Date.now();
  try {
    const result = await fetchFn();
    const latencyMs = Date.now() - t0;

    if (isFailedData(result)) {
      return {
        id: provider.id,
        displayName: provider.displayName,
        layer,
        status: "failed",
        data: null,
        latencyMs,
        error: typeof result === "string" ? result.slice(0, 200) : "null/undefined response",
        countsForEvidence: false,
      };
    }

    return {
      id: provider.id,
      displayName: provider.displayName,
      layer,
      status: role === "primary" ? "active" : "fallback_used",
      data: result,
      latencyMs,
      countsForEvidence: provider.participatesInEvidence,
    };
  } catch (err) {
    const latencyMs = Date.now() - t0;
    return {
      id: provider.id,
      displayName: provider.displayName,
      layer,
      status: "failed",
      data: null,
      latencyMs,
      error: (err as Error).message,
      countsForEvidence: false,
    };
  }
}

// ── 层级路由执行器 ─────────────────────────────────────────────────────────────
/**
 * 执行单层路由：Primary → Backup → Backup2 → unavailable
 * @param layer 层名
 * @param fetchers 各 provider 的 fetch 函数 map（key = provider.id）
 */
export async function executeLayerRouting(
  layer: RoutingLayer,
  fetchers: Map<string, () => Promise<string | null>>
): Promise<LayerResult> {
  const config = getLayerConfig(layer);
  if (!config) {
    return {
      layer,
      activeProvider: null,
      fallbackUsed: false,
      status: "unavailable",
      data: null,
      providerResults: [],
      countsForEvidence: false,
    };
  }

  const providers = getLayerProviders(layer);
  const roles: Array<"primary" | "backup" | "backup2"> = ["primary", "backup", "backup2"];
  const providerResults: ProviderResult[] = [];
  let activeResult: ProviderResult | null = null;
  let fallbackUsed = false;

  for (let i = 0; i < providers.length; i++) {
    const provider = providers[i];
    const role = roles[i];
    const fetchFn = fetchers.get(provider.id);

    if (!fetchFn) {
      // 没有提供 fetcher → 标记 disabled（未接线）
      providerResults.push({
        id: provider.id,
        displayName: provider.displayName,
        layer,
        status: "disabled",
        data: null,
        latencyMs: -1,
        error: "no fetcher registered",
        countsForEvidence: false,
      });
      continue;
    }

    const result = await callProvider(provider, layer, fetchFn, role);
    providerResults.push(result);

    if (result.status === "active" || result.status === "fallback_used") {
      activeResult = result;
      if (i > 0) fallbackUsed = true;
      break; // 命中即停
    }
  }

  if (!activeResult) {
    return {
      layer,
      activeProvider: null,
      fallbackUsed: false,
      status: "unavailable",
      data: null,
      providerResults,
      countsForEvidence: false,
    };
  }

  return {
    layer,
    activeProvider: activeResult.id,
    fallbackUsed,
    status: activeResult.status,
    data: activeResult.data,
    providerResults,
    countsForEvidence: activeResult.countsForEvidence,
  };
}

// ── 全局 Key 状态报告 ──────────────────────────────────────────────────────────
export interface KeyStatusReport {
  id: string;
  displayName: string;
  envKey: string | null;
  status: "present" | "missing";
  layer: RoutingLayer;
}

export function buildKeyStatusReport(): KeyStatusReport[] {
  const report: KeyStatusReport[] = [];
  const seen = new Set<string>();

  for (const layerConfig of DATA_ROUTING_MATRIX) {
    const providers = getLayerProviders(layerConfig.layer);
    for (const p of providers) {
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      report.push({
        id: p.id,
        displayName: p.displayName,
        envKey: p.envKey,
        status: getProviderKeyStatus(p),
        layer: layerConfig.layer,
      });
    }
  }
  return report;
}

// ── evidenceScore 计算（STEP 6 修复版） ────────────────────────────────────────
/**
 * 只有 active + valid data 的 provider 才参与 evidenceScore
 * 排除：disabled / missing_key / failed / unavailable
 */
export function computeEvidenceScore(layerResults: LayerResult[]): {
  score: number;
  activeCount: number;
  totalLayers: number;
  activeProviders: string[];
  excludedProviders: Array<{ id: string; reason: ProviderStatus }>;
} {
  const activeProviders: string[] = [];
  const excludedProviders: Array<{ id: string; reason: ProviderStatus }> = [];

  for (const lr of layerResults) {
    if (!lr.countsForEvidence) continue;

    if ((lr.status === "active" || lr.status === "fallback_used") && lr.data && !isFailedData(lr.data)) {
      activeProviders.push(lr.activeProvider!);
    } else {
      // 收集所有被排除的 provider 及原因
      for (const pr of lr.providerResults) {
        if (pr.status !== "active" && pr.status !== "fallback_used") {
          excludedProviders.push({ id: pr.id, reason: pr.status });
        }
      }
    }
  }

  const evidenceLayers = layerResults.filter(lr => lr.countsForEvidence);
  const activeLayers = evidenceLayers.filter(
    lr => (lr.status === "active" || lr.status === "fallback_used") && lr.data && !isFailedData(lr.data)
  );

  const score = evidenceLayers.length > 0
    ? Math.round((activeLayers.length / evidenceLayers.length) * 100)
    : 0;

  return {
    score,
    activeCount: activeLayers.length,
    totalLayers: evidenceLayers.length,
    activeProviders,
    excludedProviders,
  };
}
