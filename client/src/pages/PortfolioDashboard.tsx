/**
 * DANTREE LEVEL8 — Portfolio Dashboard (Minimal UI)
 *
 * Displays:
 * - Active positions table (from portfolioDB.getMyPortfolio)
 * - Guard status badge (healthy / guarded / suppressed / critical)
 * - Decision timeline (from portfolioDB.getDecisionLog)
 * - Snapshot history (from portfolioDB.getSnapshotHistory)
 *
 * ADVISORY ONLY — no trade execution, no order placement.
 */

import { trpc } from "@/lib/trpc";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, ShieldAlert, ShieldCheck, Clock } from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Guard Status Badge
// ─────────────────────────────────────────────────────────────────────────────

const GUARD_STATUS_CONFIG = {
  healthy: {
    label: "HEALTHY",
    variant: "default" as const,
    icon: ShieldCheck,
    className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  },
  guarded: {
    label: "GUARDED",
    variant: "secondary" as const,
    icon: ShieldAlert,
    className: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  },
  suppressed: {
    label: "SUPPRESSED",
    variant: "destructive" as const,
    icon: AlertTriangle,
    className: "bg-orange-500/20 text-orange-400 border-orange-500/30",
  },
  critical: {
    label: "CRITICAL",
    variant: "destructive" as const,
    icon: AlertTriangle,
    className: "bg-red-500/20 text-red-400 border-red-500/30",
  },
} as const;

function GuardBadge({ status }: { status: string }) {
  const cfg = GUARD_STATUS_CONFIG[status as keyof typeof GUARD_STATUS_CONFIG] ??
    GUARD_STATUS_CONFIG.healthy;
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${cfg.className}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Action Label Badge
// ─────────────────────────────────────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  INITIATE: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  ADD:      "bg-green-500/20 text-green-300 border-green-500/30",
  HOLD:     "bg-blue-500/20 text-blue-300 border-blue-500/30",
  TRIM:     "bg-amber-500/20 text-amber-300 border-amber-500/30",
  EXIT:     "bg-red-500/20 text-red-300 border-red-500/30",
  AVOID:    "bg-red-600/20 text-red-400 border-red-600/30",
  MONITOR:  "bg-slate-500/20 text-slate-300 border-slate-500/30",
  RECHECK:  "bg-purple-500/20 text-purple-300 border-purple-500/30",
};

function ActionBadge({ label }: { label: string }) {
  const cls = ACTION_COLORS[label] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${cls}`}>
      {label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Positions Table
// ─────────────────────────────────────────────────────────────────────────────

function PositionsTable({
  positions,
}: {
  positions: Array<{
    ticker: string;
    actionLabel: string;
    allocationPct: string | null;
    fusionScore: string | null;
    sizingBucket: string | null;
    decisionBias: string | null;
    updatedAt: number;
  }>;
}) {
  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <CheckCircle2 className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">暂无活跃持仓记录</p>
        <p className="text-xs mt-1 opacity-60">运行 Level7 Pipeline 后将自动填充</p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow className="border-slate-700/50">
          <TableHead className="text-slate-400 text-xs">标的</TableHead>
          <TableHead className="text-slate-400 text-xs">决策</TableHead>
          <TableHead className="text-slate-400 text-xs text-right">配置比例</TableHead>
          <TableHead className="text-slate-400 text-xs text-right">融合分数</TableHead>
          <TableHead className="text-slate-400 text-xs">仓位桶</TableHead>
          <TableHead className="text-slate-400 text-xs">偏向</TableHead>
          <TableHead className="text-slate-400 text-xs text-right">更新时间</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {positions.map((pos) => (
          <TableRow key={pos.ticker} className="border-slate-700/30 hover:bg-slate-800/30">
            <TableCell className="font-mono font-semibold text-slate-100">{pos.ticker}</TableCell>
            <TableCell><ActionBadge label={pos.actionLabel} /></TableCell>
            <TableCell className="text-right text-slate-300 font-mono text-sm">
              {pos.allocationPct != null ? `${parseFloat(pos.allocationPct).toFixed(2)}%` : "—"}
            </TableCell>
            <TableCell className="text-right text-slate-300 font-mono text-sm">
              {pos.fusionScore != null ? parseFloat(pos.fusionScore).toFixed(3) : "—"}
            </TableCell>
            <TableCell className="text-slate-400 text-xs uppercase">{pos.sizingBucket ?? "—"}</TableCell>
            <TableCell className="text-slate-400 text-xs">{pos.decisionBias ?? "—"}</TableCell>
            <TableCell className="text-right text-slate-500 text-xs">
              {new Date(pos.updatedAt).toLocaleString()}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision Timeline
// ─────────────────────────────────────────────────────────────────────────────

function DecisionTimeline({
  decisions,
}: {
  decisions: Array<{
    id: number;
    ticker: string;
    actionLabel: string;
    fusionScore: string;
    decisionBias: string;
    sizingBucket: string | null;
    allocationPct: string | null;
    advisoryOnly: boolean;
    createdAt: number;
  }>;
}) {
  if (decisions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-slate-500">
        <Clock className="w-6 h-6 mb-2 opacity-40" />
        <p className="text-sm">暂无决策记录</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
      {decisions.slice(0, 20).map((d) => (
        <div
          key={d.id}
          className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30"
        >
          <span className="font-mono text-xs text-slate-400 w-20 shrink-0">
            {new Date(d.createdAt).toLocaleDateString()}
          </span>
          <span className="font-mono font-semibold text-slate-100 w-16 shrink-0">{d.ticker}</span>
          <ActionBadge label={d.actionLabel} />
          <span className="text-xs text-slate-500 ml-auto font-mono">
            {parseFloat(d.fusionScore).toFixed(3)}
          </span>
          {d.allocationPct && (
            <span className="text-xs text-slate-400 font-mono">
              {parseFloat(d.allocationPct).toFixed(1)}%
            </span>
          )}
          {d.advisoryOnly && (
            <span className="text-xs text-slate-600 italic">advisory</span>
          )}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot History
// ─────────────────────────────────────────────────────────────────────────────

function SnapshotHistory({
  snapshots,
}: {
  snapshots: Array<{
    id: number;
    guardStatus: string;
    totalTickers: number;
    createdAt: number;
  }>;
}) {
  if (snapshots.length === 0) {
    return <p className="text-xs text-slate-500 py-4 text-center">暂无快照记录</p>;
  }

  return (
    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
      {snapshots.map((s, i) => (
        <div
          key={s.id}
          className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-slate-800/30 border border-slate-700/20"
        >
          <span className="text-xs text-slate-500 w-5 shrink-0">#{i + 1}</span>
          <GuardBadge status={s.guardStatus} />
          <span className="text-xs text-slate-400 ml-auto">{s.totalTickers} tickers</span>
          <span className="text-xs text-slate-500 font-mono">
            {new Date(s.createdAt).toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────

export default function PortfolioDashboard() {
  const { data: portfolioData, isLoading: loadingPortfolio } =
    trpc.portfolioDB.getMyPortfolio.useQuery();

  const { data: decisions, isLoading: loadingDecisions } =
    trpc.portfolioDB.getDecisionLog.useQuery({ limit: 30 });

  const { data: snapshots, isLoading: loadingSnapshots } =
    trpc.portfolioDB.getSnapshotHistory.useQuery({ limit: 10 });

  const guardStatus =
    (portfolioData?.snapshot?.guardStatus as string | undefined) ?? "healthy";

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">投资组合决策面板</h1>
          <p className="text-xs text-slate-500 mt-0.5">
            DANTREE LEVEL8 · Advisory Only · No Auto-Trade
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">守卫状态</span>
          {loadingPortfolio ? (
            <Skeleton className="h-7 w-24" />
          ) : (
            <GuardBadge status={guardStatus} />
          )}
        </div>
      </div>

      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-slate-400 font-medium">活跃持仓</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loadingPortfolio ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold text-slate-100">
                {portfolioData?.positions?.length ?? 0}
              </p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-slate-400 font-medium">决策记录</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loadingDecisions ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold text-slate-100">{decisions?.length ?? 0}</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-slate-400 font-medium">快照数量</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loadingSnapshots ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <p className="text-2xl font-bold text-slate-100">{snapshots?.length ?? 0}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Active Positions Table */}
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader className="px-5 py-4 border-b border-slate-700/50">
          <CardTitle className="text-sm font-semibold text-slate-200">活跃持仓</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {loadingPortfolio ? (
            <div className="p-5 space-y-2">
              {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <PositionsTable positions={(portfolioData?.positions ?? []) as any} />
          )}
        </CardContent>
      </Card>

      {/* Decision Timeline + Snapshot History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader className="px-5 py-4 border-b border-slate-700/50">
            <CardTitle className="text-sm font-semibold text-slate-200">决策时间线</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {loadingDecisions ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <DecisionTimeline decisions={(decisions ?? []) as any} />
            )}
          </CardContent>
        </Card>

        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader className="px-5 py-4 border-b border-slate-700/50">
            <CardTitle className="text-sm font-semibold text-slate-200">快照历史</CardTitle>
          </CardHeader>
          <CardContent className="p-4">
            {loadingSnapshots ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <SnapshotHistory snapshots={(snapshots ?? []) as any} />
            )}
          </CardContent>
        </Card>
      </div>

      {/* Advisory Disclaimer */}
      <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-xs text-amber-300/80 leading-relaxed">
          <strong>仅供参考 (Advisory Only)：</strong>
          本面板展示的所有决策均为 DANTREE 系统的分析建议，不构成任何投资建议，不触发任何自动交易。
          所有投资决策须由用户独立判断并承担相应风险。
        </p>
      </div>
    </div>
  );
}
