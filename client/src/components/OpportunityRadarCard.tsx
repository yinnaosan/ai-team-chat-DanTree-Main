/**
 * OpportunityRadarCard + CandidatePoolCard
 * ─────────────────────────────────────────────────────────────────────────────
 * OpportunityRadarCard: Lightweight Column 4 component for the Opportunity Radar.
 * Each item can be added to the SELECT-stage candidate pool via 「加入观察」.
 *
 * CandidatePoolCard: Shows the persisted candidate pool (SELECT stage).
 * Design: terminal-style, compact, decision-first labels.
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { ChevronDown, ChevronRight, RefreshCw, Radar, Eye, Trash2, ListChecks, Zap } from "lucide-react";

// ─── Types (mirrors server/opportunityRadar.ts + schema) ─────────────────────

type OpportunityState = "SELECT" | "WAIT";
type OpportunityCategory =
  | "industry_rotation"
  | "cycle_shift"
  | "tech_theme"
  | "energy_theme"
  | "policy_shift"
  | "macro_inflection"
  | "hidden_divergence";

interface OpportunityWhyBlock {
  surface: string;
  trend: string;
  hidden: string;
}

interface RadarItem {
  id: string;
  title: string;
  category: OpportunityCategory;
  currentPhase: string;
  opportunityState: OpportunityState;
  why: OpportunityWhyBlock;
  cycle: "Early" | "Mid" | "Late" | "Decline";
  riskSummary: string;
  confidence: number;
  relatedTickers?: string[];
  generatedAt: number;
}

interface OpportunityRadarResult {
  items: RadarItem[];
  scanTime: string;
  dataSourcesSummary: string;
  totalCount: number;
}

// DB candidate row type (mirrors radarCandidates schema)
interface CandidateRow {
  id: number;
  userId: number;
  candidateId: string;
  title: string;
  category: string;
  opportunityState: string;
  cycle: string;
  confidence: number;
  whySurface: string;
  whyTrend: string;
  whyHidden: string;
  riskSummary: string;
  relatedTickers: string;
  watchlistReady: number;
  status: string;  // SELECT | WATCH | PROMOTED | PASS
  addedAt: Date | string | null;
}

// Lifecycle status config
type CandidateStatus = "SELECT" | "WATCH" | "PROMOTED" | "PASS";
const CANDIDATE_STATUS_CONFIG: Record<CandidateStatus, {
  label: string; bg: string; text: string; border: string; description: string;
}> = {
  SELECT: {
    label: "SELECT",
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/25",
    description: "新发现机会",
  },
  WATCH: {
    label: "WATCH",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/25",
    description: "等待时机",
  },
  PROMOTED: {
    label: "PROMOTED",
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/25",
    description: "已进入研究",
  },
  PASS: {
    label: "PASS",
    bg: "bg-zinc-700/20",
    text: "text-zinc-500",
    border: "border-zinc-600/20",
    description: "已放弃",
  },
};

// ─── Config Maps ──────────────────────────────────────────────────────────────

const STATE_CONFIG: Record<OpportunityState, { label: string; bg: string; text: string; border: string }> = {
  SELECT: {
    label: "SELECT",
    bg: "bg-emerald-500/15",
    text: "text-emerald-400",
    border: "border-emerald-500/30",
  },
  WAIT: {
    label: "WAIT",
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    border: "border-amber-500/25",
  },
};

const CATEGORY_LABELS: Record<string, string> = {
  industry_rotation: "行业轮动",
  cycle_shift: "周期转换",
  tech_theme: "技术主题",
  energy_theme: "能源主题",
  policy_shift: "政策变化",
  macro_inflection: "宏观拐点",
  hidden_divergence: "隐含逻辑",
};

const CYCLE_CONFIG: Record<string, { label: string; color: string; pct: number }> = {
  Early: { label: "早期", color: "bg-emerald-500", pct: 20 },
  Mid: { label: "中期", color: "bg-blue-500", pct: 55 },
  Late: { label: "晚期", color: "bg-amber-500", pct: 80 },
  Decline: { label: "衰退", color: "bg-red-500", pct: 95 },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConfidenceBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, value));
  const color =
    pct >= 65 ? "bg-emerald-500" : pct >= 45 ? "bg-amber-500" : "bg-zinc-500";
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-0.5 bg-[#1a1f2e] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[9px] text-[#4a5568] font-mono">{pct}</span>
    </div>
  );
}

function RadarItemRow({
  item,
  addedIds,
  onAdd,
}: {
  item: RadarItem;
  addedIds: Set<string>;
  onAdd: (item: RadarItem) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const stateConf = STATE_CONFIG[item.opportunityState] ?? STATE_CONFIG.WAIT;
  const cycleConf = CYCLE_CONFIG[item.cycle] ?? CYCLE_CONFIG.Mid;
  const isAdded = addedIds.has(item.id);

  return (
    <div className="border border-[#1a1f2e] rounded bg-[#080b12] overflow-hidden">
      {/* Header row */}
      <button
        className="w-full flex items-start gap-2 px-2.5 py-2 hover:bg-[#0d1117] transition-colors text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {/* State badge */}
        <span
          className={`mt-0.5 shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded border ${stateConf.bg} ${stateConf.text} ${stateConf.border} font-mono tracking-wider`}
        >
          {stateConf.label}
        </span>

        {/* Title + meta */}
        <div className="flex-1 min-w-0">
          <div className="text-[11px] text-[#c8d0e0] font-medium leading-tight truncate">
            {item.title}
          </div>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span className="text-[8px] text-[#3a4558] font-mono">
              {CATEGORY_LABELS[item.category] ?? item.category}
            </span>
            <span className="text-[8px] text-[#2a3040]">·</span>
            <span className="text-[8px] text-[#3a4558]">{item.currentPhase}</span>
          </div>
          <ConfidenceBar value={item.confidence} />
        </div>

        {/* Expand chevron */}
        <span className="shrink-0 text-[#2a3040] mt-0.5">
          {expanded ? (
            <ChevronDown className="w-3 h-3" />
          ) : (
            <ChevronRight className="w-3 h-3" />
          )}
        </span>
      </button>

      {/* Expanded detail */}
      {expanded && (
        <div className="px-2.5 pb-2.5 border-t border-[#1a1f2e] space-y-2 mt-0">
          {/* WHY three layers */}
          <div className="space-y-1 pt-2">
            <div className="text-[8px] text-[#3a4558] font-mono uppercase tracking-widest mb-1">
              为什么值得关注
            </div>
            {[
              { key: "表面", val: item.why.surface, color: "text-[#8899aa]" },
              { key: "趋势", val: item.why.trend, color: "text-[#7a9fc0]" },
              { key: "隐含", val: item.why.hidden, color: "text-[#6a8fa8]" },
            ].map(({ key, val, color }) => (
              <div key={key} className="flex gap-1.5">
                <span className="text-[8px] text-[#3a4558] font-mono shrink-0 w-6 pt-px">
                  {key}
                </span>
                <span className={`text-[10px] leading-relaxed ${color}`}>{val}</span>
              </div>
            ))}
          </div>

          {/* Cycle + Tickers */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <div className="text-[8px] text-[#3a4558] font-mono uppercase tracking-widest mb-1">
                周期阶段
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex-1 h-1 bg-[#1a1f2e] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${cycleConf.color}`}
                    style={{ width: `${cycleConf.pct}%` }}
                  />
                </div>
                <span className="text-[9px] text-[#6a7a8a]">{cycleConf.label}</span>
              </div>
            </div>

            {item.relatedTickers && item.relatedTickers.length > 0 && (
              <div>
                <div className="text-[8px] text-[#3a4558] font-mono uppercase tracking-widest mb-1">
                  相关标的
                </div>
                <div className="flex flex-wrap gap-1">
                  {item.relatedTickers.slice(0, 3).map((t) => (
                    <span
                      key={t}
                      className="text-[8px] font-mono text-[#5a9fd4] bg-[#0d1a2a] border border-[#1a3050] px-1 py-0.5 rounded"
                    >
                      {t}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Risk */}
          <div>
            <div className="text-[8px] text-[#3a4558] font-mono uppercase tracking-widest mb-1">
              风险提示
            </div>
            <p className="text-[10px] text-[#8a6a5a] leading-relaxed">{item.riskSummary}</p>
          </div>

          {/* 加入观察 action */}
          <div className="pt-1 border-t border-[#1a1f2e]">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAdd(item);
              }}
              disabled={isAdded}
              className={`flex items-center gap-1.5 text-[9px] font-mono px-2 py-1 rounded border transition-colors ${
                isAdded
                  ? "text-[#3a5a3a] border-[#2a4a2a] bg-emerald-500/5 cursor-default"
                  : "text-[#4a8a6a] border-[#2a4a3a] hover:text-[#6aaa8a] hover:border-[#3a6a5a] hover:bg-emerald-500/5"
              }`}
            >
              <Eye className="w-2.5 h-2.5" />
              {isAdded ? "已加入观察池" : "加入观察池"}
            </button>
            {!isAdded && (
              <p className="text-[8px] text-[#2a3a4a] mt-1 font-mono">
                候选机会 · 进入 SELECT 阶段
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main OpportunityRadarCard ────────────────────────────────────────────────

export function OpportunityRadarCard() {
  const [result, setResult] = useState<OpportunityRadarResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanTime, setScanTime] = useState<string | null>(null);
  const [addedIds, setAddedIds] = useState<Set<string>>(new Set());

  const utils = trpc.useUtils();

  const scanMutation = trpc.radar.scan.useMutation({
    onSuccess: (data) => {
      setResult(data as OpportunityRadarResult);
      setScanTime(new Date().toLocaleTimeString());
      setError(null);
    },
    onError: (err) => {
      setError(err.message ?? "扫描失败");
    },
  });

  const addMutation = trpc.candidates.add.useMutation({
    onSuccess: (data, variables) => {
      if (data.added) {
        setAddedIds((prev) => new Set(Array.from(prev).concat(variables.candidateId)));
        utils.candidates.list.invalidate();
      }
    },
  });

  const handleScan = (forceRefresh = false) => {
    scanMutation.mutate({ forceRefresh });
  };

  const handleAdd = (item: RadarItem) => {
    addMutation.mutate({
      candidateId: item.id,
      title: item.title,
      category: item.category,
      opportunityState: item.opportunityState,
      cycle: item.cycle,
      confidence: item.confidence,
      whySurface: item.why.surface,
      whyTrend: item.why.trend,
      whyHidden: item.why.hidden,
      riskSummary: item.riskSummary,
      relatedTickers: item.relatedTickers?.join(",") ?? "",
    });
    // Optimistic local update
    setAddedIds((prev) => new Set(Array.from(prev).concat(item.id)));
  };

  const isLoading = scanMutation.isPending;

  return (
    <div className="border border-[#1a1f2e] rounded bg-[#06080f]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a1f2e]">
        <div className="flex items-center gap-2">
          <Radar className="w-3 h-3 text-[#3a6a9a]" />
          <span className="text-[9px] font-mono text-[#4a6a8a] uppercase tracking-widest">
            机会雷达
          </span>
          {result && (
            <span className="text-[8px] font-mono text-[#2a3a4a]">
              {result.totalCount} 项
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {scanTime && (
            <span className="text-[8px] text-[#2a3a4a] font-mono">{scanTime}</span>
          )}
          <button
            onClick={() => handleScan(!!result)}
            disabled={isLoading}
            className="flex items-center gap-1 text-[8px] font-mono text-[#3a5a7a] hover:text-[#5a8ab0] transition-colors disabled:opacity-40 px-1.5 py-0.5 border border-[#1a2a3a] rounded hover:border-[#2a4a6a]"
          >
            <RefreshCw className={`w-2.5 h-2.5 ${isLoading ? "animate-spin" : ""}`} />
            {isLoading ? "扫描中..." : result ? "刷新" : "启动扫描"}
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="p-2">
        {/* Idle state */}
        {!result && !isLoading && !error && (
          <div className="py-4 text-center">
            <Radar className="w-6 h-6 text-[#1a2a3a] mx-auto mb-2" />
            <p className="text-[9px] text-[#2a3a4a] font-mono">
              基于宏观/行业/政策信号的早期机会探测
            </p>
            <p className="text-[8px] text-[#1a2a3a] mt-1">
              点击「启动扫描」生成当前机会列表
            </p>
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="py-4 text-center space-y-1.5">
            <div className="flex justify-center gap-1">
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className="w-1 h-1 bg-[#3a6a9a] rounded-full animate-bounce"
                  style={{ animationDelay: `${i * 0.15}s` }}
                />
              ))}
            </div>
            <p className="text-[9px] text-[#3a5a7a] font-mono">
              正在扫描宏观 · 行业 · 政策信号...
            </p>
          </div>
        )}

        {/* Error */}
        {error && !isLoading && (
          <div className="py-3 text-center">
            <p className="text-[9px] text-[#8a4a3a]">{error}</p>
            <button
              onClick={() => handleScan(true)}
              className="mt-1.5 text-[8px] text-[#5a4a3a] hover:text-[#8a6a5a] font-mono underline"
            >
              重试
            </button>
          </div>
        )}

        {/* Results */}
        {result && !isLoading && (
          <div className="space-y-1.5">
            {result.items.map((item) => (
              <RadarItemRow
                key={item.id}
                item={item}
                addedIds={addedIds}
                onAdd={handleAdd}
              />
            ))}
            {result.items.length === 0 && (
              <p className="text-[9px] text-[#2a3a4a] text-center py-3 font-mono">
                当前无显著机会信号
              </p>
            )}
            <div className="pt-1 text-[8px] text-[#1a2a3a] font-mono text-right">
              {result.dataSourcesSummary}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── CandidatePoolCard ────────────────────────────────────────────────────────
// Lightweight SELECT-stage candidate pool display for Column 4

export interface CandidateSelectPayload {
  title: string;
  relatedTickers: string[];
  candidateId?: number;  // DB row id for auto-PROMOTED update
}

export function CandidatePoolCard({
  onSelectCandidate,
}: {
  onSelectCandidate?: (payload: CandidateSelectPayload) => void;
}) {
  const { data: candidates, isLoading, refetch } = trpc.candidates.list.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const utils = trpc.useUtils();

  const removeMutation = trpc.candidates.remove.useMutation({
    onSuccess: () => { utils.candidates.list.invalidate(); },
  });

  const updateStatusMutation = trpc.candidates.updateStatus.useMutation({
    onSuccess: () => { utils.candidates.list.invalidate(); },
  });

  const rows = (candidates ?? []) as CandidateRow[];

  return (
    <div className="border border-[#1a1f2e] rounded bg-[#06080f]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-[#1a1f2e]">
        <div className="flex items-center gap-2">
          <ListChecks className="w-3 h-3 text-[#3a6a4a]" />
          <span className="text-[9px] font-mono text-[#3a6a4a] uppercase tracking-widest">
            候选机会
          </span>
          {rows.length > 0 && (
            <span className="text-[8px] font-mono text-[#2a4a3a]">
              {rows.length} 项 · SELECT 阶段
            </span>
          )}
        </div>
        <button
          onClick={() => refetch()}
          disabled={isLoading}
          className="text-[8px] font-mono text-[#2a4a3a] hover:text-[#4a7a5a] transition-colors"
        >
          <RefreshCw className={`w-2.5 h-2.5 ${isLoading ? "animate-spin" : ""}`} />
        </button>
      </div>

      {/* Content */}
      <div className="p-2">
        {isLoading && (
          <div className="py-3 text-center">
            <p className="text-[9px] text-[#2a4a3a] font-mono">加载中...</p>
          </div>
        )}

        {!isLoading && rows.length === 0 && (
          <div className="py-4 text-center">
            <ListChecks className="w-5 h-5 text-[#1a2a1a] mx-auto mb-1.5" />
            <p className="text-[9px] text-[#2a3a2a] font-mono">
              观察池为空
            </p>
            <p className="text-[8px] text-[#1a2a1a] mt-0.5">
              从机会雷达加入候选机会
            </p>
          </div>
        )}

        {!isLoading && rows.length > 0 && (
          <div className="space-y-1.5">
            {rows.map((row) => {
              const stateConf =
                STATE_CONFIG[(row.opportunityState as OpportunityState)] ?? STATE_CONFIG.WAIT;
              const cycleConf = CYCLE_CONFIG[row.cycle] ?? CYCLE_CONFIG.Mid;
              const tickers = row.relatedTickers
                ? row.relatedTickers.split(",").filter(Boolean)
                : [];

              const candidateStatus = (row.status ?? "SELECT") as CandidateStatus;
              const statusConf = CANDIDATE_STATUS_CONFIG[candidateStatus] ?? CANDIDATE_STATUS_CONFIG.SELECT;
              const isWaitOpportunity = row.opportunityState === "WAIT";
              const isPass = candidateStatus === "PASS";

              return (
                <div
                  key={row.id}
                  className={`border rounded px-2.5 py-2 transition-opacity ${isPass ? "opacity-40" : ""}`}
                  style={{ background: "#080f08", borderColor: isPass ? "#1a1a1a" : "#1a2a1a" }}
                >
                  {/* Row 1: status badge + title + remove */}
                  <div className="flex items-start gap-2">
                    {/* Lifecycle status badge */}
                    <span
                      className={`mt-0.5 shrink-0 text-[8px] font-bold px-1.5 py-0.5 rounded border ${statusConf.bg} ${statusConf.text} ${statusConf.border} font-mono tracking-wider`}
                      title={statusConf.description}
                    >
                      {statusConf.label}
                    </span>

                    {/* Title + meta */}
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] text-[#b8d0b8] font-medium leading-tight truncate">
                        {row.title}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className={`text-[8px] font-bold px-1 py-0 rounded border ${stateConf.bg} ${stateConf.text} ${stateConf.border} font-mono`}
                        >
                          {stateConf.label}
                        </span>
                        <span className="text-[8px] text-[#2a4a2a] font-mono">
                          {CATEGORY_LABELS[row.category] ?? row.category}
                        </span>
                        <span className="text-[8px] text-[#1a2a1a]">·</span>
                        <span className="text-[8px] text-[#2a4a2a]">
                          {cycleConf.label}
                        </span>
                        {tickers.length > 0 && (
                          <>
                            <span className="text-[8px] text-[#1a2a1a]">·</span>
                            <span className="text-[8px] font-mono text-[#3a7a5a]">
                              {tickers.slice(0, 2).join(" ")}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Remove button */}
                    <button
                      onClick={() => removeMutation.mutate({ id: row.id })}
                      disabled={removeMutation.isPending}
                      className="shrink-0 text-[#2a3a2a] hover:text-[#8a4a3a] transition-colors mt-0.5"
                      title="移出观察池"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>

                  {/* Risk summary */}
                  {row.riskSummary && (
                    <p className="text-[9px] text-[#4a6a4a] mt-1.5 leading-relaxed">
                      {row.riskSummary}
                    </p>
                  )}

                  {/* Action row: WATCH / PASS buttons + bridge */}
                  {!isPass && (
                    <div className="mt-1.5 pt-1.5 border-t border-[#1a2a1a] flex items-center gap-1.5 flex-wrap">
                      {/* WATCH toggle */}
                      {candidateStatus !== "WATCH" && candidateStatus !== "PROMOTED" && (
                        <button
                          onClick={() => updateStatusMutation.mutate({ id: row.id, status: "WATCH" })}
                          disabled={updateStatusMutation.isPending}
                          className="flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded border text-amber-500 border-amber-500/25 hover:bg-amber-500/10 transition-colors"
                          title="标记为观察"
                        >
                          <Eye className="w-2 h-2" />
                          观察
                        </button>
                      )}
                      {candidateStatus === "WATCH" && (
                        <button
                          onClick={() => updateStatusMutation.mutate({ id: row.id, status: "SELECT" })}
                          disabled={updateStatusMutation.isPending}
                          className="flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded border text-amber-400 border-amber-400/30 bg-amber-500/10 transition-colors"
                          title="取消观察"
                        >
                          <Eye className="w-2 h-2" />
                          观察中
                        </button>
                      )}
                      {/* PASS button */}
                      <button
                        onClick={() => updateStatusMutation.mutate({ id: row.id, status: "PASS" })}
                        disabled={updateStatusMutation.isPending}
                        className="flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded border text-zinc-500 border-zinc-600/20 hover:bg-zinc-700/20 transition-colors"
                        title="标记为放弃"
                      >
                        ✕ 放弃
                      </button>
                      {/* Bridge: 开始研究 — disabled for WAIT opportunityState */}
                      {onSelectCandidate && (
                        isWaitOpportunity ? (
                          <span
                            className="flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded border text-zinc-600 border-zinc-700/20 cursor-not-allowed"
                            title="等待时机成熟后可进入研究"
                          >
                            <Zap className="w-2 h-2" />
                            等待时机
                          </span>
                        ) : (
                          <button
                            onClick={() =>
                              onSelectCandidate({ title: row.title, relatedTickers: tickers, candidateId: row.id })
                            }
                            className="flex items-center gap-1 text-[8px] font-mono px-1.5 py-0.5 rounded border text-emerald-400 border-emerald-500/25 hover:bg-emerald-500/10 transition-colors ml-auto"
                          >
                            <Zap className="w-2 h-2" />
                            开始研究
                          </button>
                        )
                      )}
                    </div>
                  )}
                  {/* Restore PASS */}
                  {isPass && (
                    <div className="mt-1 flex justify-end">
                      <button
                        onClick={() => updateStatusMutation.mutate({ id: row.id, status: "SELECT" })}
                        disabled={updateStatusMutation.isPending}
                        className="text-[8px] font-mono text-zinc-600 hover:text-zinc-400 transition-colors"
                      >
                        恢复
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* Stage label */}
            <div className="pt-1 text-[8px] text-[#1a3a1a] font-mono text-center">
              候选机会 · 进入 SELECT 阶段 · 非买入建议
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
