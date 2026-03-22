/**
 * Resource Budget Controller
 * 控制每个任务的 API/搜索/Token/图表/fallback 预算，
 * 实现"少调用、准调用、必要时再调用"的资源节流策略。
 */

// ── 类型定义 ──────────────────────────────────────────────────────────
export type BudgetProfile = "standard" | "deep";

export interface ResourceBudget {
  maxApiCallsPerTask: number;
  maxPaidApiCallsPerTask: number;
  maxWebSearchCallsPerTask: number;
  maxFallbackRoundsPerTask: number;
  maxChartJobsPerTask: number;
  maxLlmTokensStep1: number;
  maxLlmTokensStep3: number;
  maxHealthChecksPerRefresh: number;
}

export interface ResourceUsage {
  apiCalls: number;
  paidApiCalls: number;
  webSearchCalls: number;
  fallbackRounds: number;
  chartJobs: number;
  llmTokensStep1: number;
  llmTokensStep3: number;
  healthChecks: number;
}

// ── 默认预算 ──────────────────────────────────────────────────────────
const BUDGET_STANDARD: ResourceBudget = {
  maxApiCallsPerTask: 8,
  maxPaidApiCallsPerTask: 4,
  maxWebSearchCallsPerTask: 2,
  maxFallbackRoundsPerTask: 1,
  maxChartJobsPerTask: 1,
  maxLlmTokensStep1: 2500,
  maxLlmTokensStep3: 5000,
  maxHealthChecksPerRefresh: 5,
};

const BUDGET_DEEP: ResourceBudget = {
  maxApiCallsPerTask: 14,
  maxPaidApiCallsPerTask: 6,
  maxWebSearchCallsPerTask: 4,
  maxFallbackRoundsPerTask: 2,
  maxChartJobsPerTask: 3,
  maxLlmTokensStep1: 3500,
  maxLlmTokensStep3: 7000,
  maxHealthChecksPerRefresh: 5,
};

export function getBudget(profile: BudgetProfile): ResourceBudget {
  return profile === "deep" ? { ...BUDGET_DEEP } : { ...BUDGET_STANDARD };
}

// ── 搜索缓存（30 分钟内相同 query 不重复搜索）─────────────────────────
interface CacheEntry {
  result: unknown;
  timestamp: number;
}
const searchCache = new Map<string, CacheEntry>();
const SEARCH_CACHE_TTL = 30 * 60 * 1000; // 30 分钟

export function getCachedSearch(query: string): unknown | null {
  const entry = searchCache.get(query);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > SEARCH_CACHE_TTL) {
    searchCache.delete(query);
    return null;
  }
  return entry.result;
}

export function setCachedSearch(query: string, result: unknown): void {
  searchCache.set(query, { result, timestamp: Date.now() });
  // 清理过期条目（最多保留 200 条）
  if (searchCache.size > 200) {
    const now = Date.now();
    const keysToDelete: string[] = [];
    searchCache.forEach((val, key) => {
      if (now - val.timestamp > SEARCH_CACHE_TTL) keysToDelete.push(key);
    });
    keysToDelete.forEach(k => searchCache.delete(k));
  }
}

// ── 字段去重缓存（同一 task 内 field+entity+scope 不重复调用）──────────
const fieldCallCache = new Map<string, Set<string>>();

function getFieldCallKey(taskId: string, field: string, entity: string, timeScope: string): string {
  return `${field}|${entity}|${timeScope}`;
}

export function hasFieldBeenFetched(taskId: string, field: string, entity: string, timeScope: string = "current"): boolean {
  const cache = fieldCallCache.get(taskId);
  if (!cache) return false;
  return cache.has(getFieldCallKey(taskId, field, entity, timeScope));
}

export function markFieldFetched(taskId: string, field: string, entity: string, timeScope: string = "current"): void {
  if (!fieldCallCache.has(taskId)) {
    fieldCallCache.set(taskId, new Set());
  }
  fieldCallCache.get(taskId)!.add(getFieldCallKey(taskId, field, entity, timeScope));
}

export function clearTaskFieldCache(taskId: string): void {
  fieldCallCache.delete(taskId);
}

// ── Budget Tracker（每个任务一个实例）──────────────────────────────────
export class BudgetTracker {
  public budget: ResourceBudget;
  public usage: ResourceUsage;
  public taskId: string;

  constructor(taskId: string, profile: BudgetProfile = "standard") {
    this.taskId = taskId;
    this.budget = getBudget(profile);
    this.usage = {
      apiCalls: 0,
      paidApiCalls: 0,
      webSearchCalls: 0,
      fallbackRounds: 0,
      chartJobs: 0,
      llmTokensStep1: 0,
      llmTokensStep3: 0,
      healthChecks: 0,
    };
  }

  // ── 检查是否可以执行某类操作 ──
  canMakeApiCall(): boolean {
    return this.usage.apiCalls < this.budget.maxApiCallsPerTask;
  }

  canMakePaidApiCall(): boolean {
    return this.usage.paidApiCalls < this.budget.maxPaidApiCallsPerTask && this.canMakeApiCall();
  }

  canMakeWebSearch(): boolean {
    return this.usage.webSearchCalls < this.budget.maxWebSearchCallsPerTask;
  }

  canMakeFallback(): boolean {
    return this.usage.fallbackRounds < this.budget.maxFallbackRoundsPerTask;
  }

  canMakeChart(): boolean {
    return this.usage.chartJobs < this.budget.maxChartJobsPerTask;
  }

  canMakeHealthCheck(): boolean {
    return this.usage.healthChecks < this.budget.maxHealthChecksPerRefresh;
  }

  // ── 记录消耗 ──
  recordApiCall(isPaid: boolean = false): void {
    this.usage.apiCalls++;
    if (isPaid) this.usage.paidApiCalls++;
  }

  recordWebSearch(): void {
    this.usage.webSearchCalls++;
  }

  recordFallback(): void {
    this.usage.fallbackRounds++;
  }

  recordChart(): void {
    this.usage.chartJobs++;
  }

  recordHealthCheck(): void {
    this.usage.healthChecks++;
  }

  recordLlmTokens(step: "step1" | "step3", tokens: number): void {
    if (step === "step1") this.usage.llmTokensStep1 += tokens;
    else this.usage.llmTokensStep3 += tokens;
  }

  // ── 预算摘要（用于 metadata 和日志）──
  getSummary(): { budget: ResourceBudget; usage: ResourceUsage; utilization: Record<string, string> } {
    return {
      budget: this.budget,
      usage: this.usage,
      utilization: {
        apiCalls: `${this.usage.apiCalls}/${this.budget.maxApiCallsPerTask}`,
        paidApiCalls: `${this.usage.paidApiCalls}/${this.budget.maxPaidApiCallsPerTask}`,
        webSearchCalls: `${this.usage.webSearchCalls}/${this.budget.maxWebSearchCallsPerTask}`,
        fallbackRounds: `${this.usage.fallbackRounds}/${this.budget.maxFallbackRoundsPerTask}`,
        chartJobs: `${this.usage.chartJobs}/${this.budget.maxChartJobsPerTask}`,
      },
    };
  }

  // ── 判断是否应该为 optional 字段继续调用 paid source ──
  shouldSkipOptionalPaidCall(currentOutputMode: string): boolean {
    // 一旦已达到 directional 输出门槛，禁止继续为 optional 字段调用 paid source
    if (currentOutputMode === "decisive" || currentOutputMode === "directional") {
      return true;
    }
    // 预算紧张时也跳过
    const paidRemaining = this.budget.maxPaidApiCallsPerTask - this.usage.paidApiCalls;
    return paidRemaining <= 1; // 保留 1 个给 blocking 字段
  }

  // ── 清理 ──
  cleanup(): void {
    clearTaskFieldCache(this.taskId);
  }
}

// ── 全局 tracker 管理 ──────────────────────────────────────────────────
const activeTrackers = new Map<string, BudgetTracker>();

export function createBudgetTracker(taskId: string, profile: BudgetProfile = "standard"): BudgetTracker {
  const tracker = new BudgetTracker(taskId, profile);
  activeTrackers.set(taskId, tracker);
  return tracker;
}

export function getBudgetTracker(taskId: string): BudgetTracker | undefined {
  return activeTrackers.get(taskId);
}

export function removeBudgetTracker(taskId: string): void {
  const tracker = activeTrackers.get(taskId);
  if (tracker) {
    tracker.cleanup();
    activeTrackers.delete(taskId);
  }
}
