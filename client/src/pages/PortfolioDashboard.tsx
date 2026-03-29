/**
 * DANTREE LEVEL8 Final Patch — Portfolio Dashboard
 *
 * Item 3: Auto-bootstrap (if no snapshots → auto-call runSystem once)
 * Item 4: Decision Audit Modal (click decision → full replay path)
 * Item 6: Guard Visibility (suppressed tickers, danger tickers, top guard reason)
 *
 * ADVISORY ONLY — no trade execution, no order placement.
 */
import { useState, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Clock,
  Play,
  RefreshCw,
  Eye,
  Skull,
  Ban,
  TrendingDown,
} from "lucide-react";

// ─────────────────────────────────────────────────────────────────────────────
// Guard Status Badge
// ─────────────────────────────────────────────────────────────────────────────
const GUARD_STATUS_CONFIG: Record<string, { label: string; icon: React.ElementType; className: string }> = {
  healthy:    { label: "HEALTHY",    icon: ShieldCheck,   className: "bg-emerald-500/20 text-emerald-400 border-emerald-500/30" },
  guarded:    { label: "GUARDED",    icon: ShieldAlert,   className: "bg-amber-500/20 text-amber-400 border-amber-500/30" },
  suppressed: { label: "SUPPRESSED", icon: AlertTriangle, className: "bg-orange-500/20 text-orange-400 border-orange-500/30" },
  critical:   { label: "CRITICAL",   icon: AlertTriangle, className: "bg-red-500/20 text-red-400 border-red-500/30" },
  INVALID:    { label: "INVALID",    icon: AlertTriangle, className: "bg-red-700/30 text-red-300 border-red-700/40" },
};

function GuardBadge({ status }: { status: string }) {
  const cfg = GUARD_STATUS_CONFIG[status] ?? GUARD_STATUS_CONFIG.healthy;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold border ${cfg.className}`}>
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
  MONITOR:  "bg-blue-400/20 text-blue-300 border-blue-400/30",
  RECHECK:  "bg-purple-500/20 text-purple-300 border-purple-500/30",
  TRIM:     "bg-amber-500/20 text-amber-300 border-amber-500/30",
  EXIT:     "bg-red-500/20 text-red-300 border-red-500/30",
  AVOID:    "bg-red-700/20 text-red-400 border-red-700/30",
};

function ActionBadge({ label }: { label: string }) {
  const cls = ACTION_COLORS[label?.toUpperCase()] ?? "bg-slate-500/20 text-slate-300 border-slate-500/30";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold border ${cls}`}>
      {label ?? "—"}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Item 6: Guard Visibility Panel
// ─────────────────────────────────────────────────────────────────────────────
function GuardVisibilityPanel({ snapshot }: { snapshot: any }) {
  if (!snapshot) return null;

  const data = snapshot.snapshotData as any;
  const safetyReport = data?.guard_output?.safety_report;

  const suppressedTickers: string[] = safetyReport?.suppressed_tickers ?? [];
  const dangerTickers: string[] = safetyReport?.danger_tickers ?? [];
  const topGuardReason: string = safetyReport?.dominant_guard ?? safetyReport?.top_guard_reason ?? "—";
  const conflictFlags = safetyReport?.conflict_flags ?? [];

  const hasIssues = suppressedTickers.length > 0 || dangerTickers.length > 0 || conflictFlags.length > 0;

  if (!hasIssues && snapshot.guardStatus === "healthy") {
    return (
      <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
        <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
        <p className="text-xs text-emerald-300/80">所有守卫通过 — 无抑制标的，无危险信号，无冲突</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div className="px-4 py-3 rounded-lg bg-orange-500/5 border border-orange-500/20">
        <div className="flex items-center gap-1.5 mb-2">
          <Ban className="w-3.5 h-3.5 text-orange-400" />
          <span className="text-xs font-semibold text-orange-400">抑制标的</span>
          <span className="ml-auto text-xs text-orange-300/60">{suppressedTickers.length}</span>
        </div>
        {suppressedTickers.length === 0 ? (
          <p className="text-xs text-slate-500">无</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {suppressedTickers.map((t) => (
              <span key={t} className="px-1.5 py-0.5 rounded text-xs font-mono bg-orange-500/10 text-orange-300 border border-orange-500/20">{t}</span>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-3 rounded-lg bg-red-500/5 border border-red-500/20">
        <div className="flex items-center gap-1.5 mb-2">
          <Skull className="w-3.5 h-3.5 text-red-400" />
          <span className="text-xs font-semibold text-red-400">危险标的</span>
          <span className="ml-auto text-xs text-red-300/60">{dangerTickers.length}</span>
        </div>
        {dangerTickers.length === 0 ? (
          <p className="text-xs text-slate-500">无</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {dangerTickers.map((t) => (
              <span key={t} className="px-1.5 py-0.5 rounded text-xs font-mono bg-red-500/10 text-red-300 border border-red-500/20">{t}</span>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-3 rounded-lg bg-amber-500/5 border border-amber-500/20">
        <div className="flex items-center gap-1.5 mb-2">
          <TrendingDown className="w-3.5 h-3.5 text-amber-400" />
          <span className="text-xs font-semibold text-amber-400">主要守卫原因</span>
        </div>
        <p className="text-xs text-amber-300/80 font-mono">{topGuardReason}</p>
        {conflictFlags.length > 0 && (
          <p className="text-xs text-red-300/60 mt-1">{conflictFlags.length} 个冲突信号</p>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Item 4: Decision Audit Modal
// ─────────────────────────────────────────────────────────────────────────────
function DecisionAuditModal({
  open,
  onClose,
  decision,
  portfolioId,
}: {
  open: boolean;
  onClose: () => void;
  decision: any;
  portfolioId: number | undefined;
}) {
  const replayQuery = trpc.portfolioDB.replayDecision.useQuery(
    {
      ticker: decision?.ticker ?? "",
      snapshotId: decision?.snapshotId ?? undefined,
    },
    { enabled: open && !!decision }
  );

  const replay = replayQuery.data as any;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-700 max-w-2xl">
        <DialogHeader>
          <DialogTitle className="text-slate-100 flex items-center gap-2">
            <Eye className="w-4 h-4 text-blue-400" />
            决策审计追踪 — {decision?.ticker}
          </DialogTitle>
        </DialogHeader>

        {replayQuery.isLoading ? (
          <div className="space-y-3 py-4">
            {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : replay ? (
          <div className="space-y-4 py-2">
            {/* Original Decision */}
            <div className="rounded-lg bg-slate-800/60 border border-slate-700/40 p-4">
              <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">原始决策</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="flex items-center gap-2"><span className="text-slate-500">Action：</span><ActionBadge label={replay.decisionAtSnapshot?.actionLabel ?? "—"} /></div>
                <div><span className="text-slate-500">Bias：</span><span className="text-slate-300 font-mono">{replay.decisionAtSnapshot?.decisionBias ?? "—"}</span></div>
                <div><span className="text-slate-500">Fusion Score：</span><span className="text-slate-300 font-mono">{typeof replay.decisionAtSnapshot?.fusionScore === "number" ? replay.decisionAtSnapshot.fusionScore.toFixed(4) : "—"}</span></div>
                <div><span className="text-slate-500">Allocation：</span><span className="text-slate-300 font-mono">{replay.decisionAtSnapshot?.allocationPct != null ? `${parseFloat(replay.decisionAtSnapshot.allocationPct).toFixed(2)}%` : "—"}</span></div>
              </div>
            </div>

            {/* Guard Result */}
            <div className="rounded-lg bg-slate-800/60 border border-slate-700/40 p-4">
              <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">守卫结果</p>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-500">主要守卫：</span><span className="text-amber-300 font-mono">{replay.guardAtSnapshot?.dominantGuard ?? "NONE"}</span></div>
                <div><span className="text-slate-500">已抑制：</span><span className={replay.guardAtSnapshot?.suppressed ? "text-red-400 font-semibold" : "text-emerald-400"}>{replay.guardAtSnapshot?.suppressed ? "是" : "否"}</span></div>
                <div><span className="text-slate-500">衰减乘数：</span><span className="text-slate-300 font-mono">{typeof replay.guardAtSnapshot?.decayMultiplier === "number" ? replay.guardAtSnapshot.decayMultiplier.toFixed(4) : "—"}</span></div>
              </div>
            </div>

            {/* Decay Trace */}
            {replay.guardAtSnapshot?.decayTrace && (
              <div className="rounded-lg bg-slate-800/60 border border-slate-700/40 p-4">
                <p className="text-xs font-semibold text-slate-400 mb-2 uppercase tracking-wide">仓位衰减追踪</p>
                <pre className="text-xs text-slate-400 font-mono overflow-auto max-h-40 whitespace-pre-wrap">
                  {JSON.stringify(replay.guardAtSnapshot.decayTrace, null, 2)}
                </pre>
              </div>
            )}

            {/* Advisory Text */}
            {replay.decisionAtSnapshot?.advisoryText && (
              <div className="rounded-lg bg-blue-500/5 border border-blue-500/20 p-4">
                <p className="text-xs font-semibold text-blue-400 mb-1 uppercase tracking-wide">Advisory 说明</p>
                <p className="text-xs text-slate-300 leading-relaxed">{replay.decisionAtSnapshot.advisoryText}</p>
              </div>
            )}

            <p className="text-xs text-slate-600 text-center">advisory_only: true — 仅供参考，不构成投资建议</p>
          </div>
        ) : (
          <div className="py-8 text-center text-slate-500 text-sm">
            {portfolioId ? "暂无回放数据" : "加载投资组合中..."}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Positions Table
// ─────────────────────────────────────────────────────────────────────────────
function PositionsTable({ positions }: { positions: any[] }) {
  if (positions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <CheckCircle2 className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">暂无活跃持仓记录</p>
        <p className="text-xs mt-1 opacity-60">点击「运行系统」后将自动填充</p>
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
// Decision Timeline (with Audit click)
// ─────────────────────────────────────────────────────────────────────────────
function DecisionTimeline({ decisions, onAudit }: { decisions: any[]; onAudit: (d: any) => void }) {
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
          className="flex items-center gap-3 px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700/30 cursor-pointer hover:bg-slate-700/40 transition-colors"
          onClick={() => onAudit(d)}
          title="点击查看审计追踪"
        >
          <span className="font-mono text-xs text-slate-400 w-20 shrink-0">
            {new Date(d.createdAt).toLocaleDateString()}
          </span>
          <span className="font-mono font-semibold text-slate-100 w-16 shrink-0">{d.ticker}</span>
          <ActionBadge label={d.actionLabel} />
          <span className="text-xs text-slate-500 ml-auto font-mono">
            {parseFloat(d.fusionScore).toFixed(3)}
          </span>
          <Eye className="w-3 h-3 text-slate-600 shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Snapshot History
// ─────────────────────────────────────────────────────────────────────────────
function SnapshotHistory({ snapshots }: { snapshots: any[] }) {
  if (snapshots.length === 0) {
    return <p className="text-xs text-slate-500 py-4 text-center">暂无快照记录</p>;
  }
  return (
    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
      {snapshots.map((s, i) => (
        <div key={s.id} className="flex items-center gap-2 px-2.5 py-1.5 rounded bg-slate-800/30 border border-slate-700/20">
          <span className="text-xs text-slate-500 w-5 shrink-0">#{i + 1}</span>
          <GuardBadge status={s.guardStatus} />
          <span className="text-xs text-slate-400 ml-auto">{s.totalTickers} tickers</span>
          <span className="text-xs text-slate-500 font-mono">{new Date(s.createdAt).toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Dashboard
// ─────────────────────────────────────────────────────────────────────────────
export default function PortfolioDashboard() {
  const utils = trpc.useUtils();

  const { data: portfolioData, isLoading: loadingPortfolio } = trpc.portfolioDB.getMyPortfolio.useQuery();
  const { data: decisions, isLoading: loadingDecisions } = trpc.portfolioDB.getDecisionLog.useQuery({ limit: 50 });
  const { data: snapshots, isLoading: loadingSnapshots } = trpc.portfolioDB.getSnapshotHistory.useQuery({ limit: 30 });

  const runSystemMutation = trpc.portfolioDB.runSystem.useMutation({
    onSuccess: () => {
      utils.portfolioDB.getMyPortfolio.invalidate();
      utils.portfolioDB.getDecisionLog.invalidate();
      utils.portfolioDB.getSnapshotHistory.invalidate();
    },
  });

  // Item 3: Auto-bootstrap — if no snapshots, run system once automatically
  const [autoBootstrapped, setAutoBootstrapped] = useState(false);
  useEffect(() => {
    if (!loadingSnapshots && !autoBootstrapped && Array.isArray(snapshots) && snapshots.length === 0) {
      setAutoBootstrapped(true);
      runSystemMutation.mutate();
    }
  }, [loadingSnapshots, snapshots, autoBootstrapped]);

  // Item 4: Decision Audit Modal state
  const [auditDecision, setAuditDecision] = useState<any>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const handleAudit = useCallback((d: any) => { setAuditDecision(d); setAuditOpen(true); }, []);

  // Latest snapshot for guard visibility
  const snapshotList = Array.isArray(snapshots) ? snapshots : [];
  const latestSnapshot = snapshotList.length > 0 ? snapshotList[0] : null;
  const guardStatus = (portfolioData as any)?.snapshot?.guardStatus ?? latestSnapshot?.guardStatus ?? "healthy";
  const portfolioId = (portfolioData as any)?.portfolio?.id as number | undefined;
  const isRunning = runSystemMutation.isPending;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-100">投资组合决策面板</h1>
          <p className="text-xs text-slate-500 mt-0.5">DANTREE LEVEL8 · Advisory Only · No Auto-Trade</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">守卫状态</span>
          {loadingPortfolio ? <Skeleton className="h-7 w-24" /> : <GuardBadge status={guardStatus} />}
          <Button
            size="sm"
            variant="outline"
            className="gap-1.5 border-slate-600 text-slate-300 hover:bg-slate-700 hover:text-slate-100"
            onClick={() => runSystemMutation.mutate()}
            disabled={isRunning}
          >
            {isRunning ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
            {isRunning ? "运行中..." : "运行系统"}
          </Button>
        </div>
      </div>

      {/* Auto-bootstrap notice */}
      {autoBootstrapped && isRunning && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-blue-500/5 border border-blue-500/20">
          <RefreshCw className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
          <p className="text-xs text-blue-300/80">首次访问，正在自动运行系统初始化...</p>
        </div>
      )}

      {/* Run result notice */}
      {runSystemMutation.isSuccess && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-emerald-500/5 border border-emerald-500/20">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <p className="text-xs text-emerald-300/80">
            系统运行完成 — snapshotId: {(runSystemMutation.data as any)?.snapshotId} ·
            决策数: {(runSystemMutation.data as any)?.decisionCount} ·
            守卫状态: {(runSystemMutation.data as any)?.guardStatus}
          </p>
        </div>
      )}

      {/* Item 6: Guard Visibility Panel */}
      <GuardVisibilityPanel snapshot={latestSnapshot} />

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-slate-400 font-medium">活跃持仓</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loadingPortfolio ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold text-slate-100">{(portfolioData as any)?.positions?.length ?? 0}</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-slate-400 font-medium">决策记录</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loadingDecisions ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold text-slate-100">{(decisions as any[])?.length ?? 0}</p>
            )}
          </CardContent>
        </Card>
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader className="pb-1 pt-4 px-4">
            <CardTitle className="text-xs text-slate-400 font-medium">快照数量</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loadingSnapshots ? <Skeleton className="h-8 w-16" /> : (
              <p className="text-2xl font-bold text-slate-100">{snapshotList.length}</p>
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
            <PositionsTable positions={(portfolioData as any)?.positions ?? []} />
          )}
        </CardContent>
      </Card>

      {/* Decision Timeline + Snapshot History */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="bg-slate-800/50 border-slate-700/50">
          <CardHeader className="px-5 py-4 border-b border-slate-700/50">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-slate-200">决策时间线</CardTitle>
              <span className="text-xs text-slate-500">点击行查看审计追踪</span>
            </div>
          </CardHeader>
          <CardContent className="p-4">
            {loadingDecisions ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
              </div>
            ) : (
              <DecisionTimeline decisions={(decisions ?? []) as any[]} onAudit={handleAudit} />
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
              <SnapshotHistory snapshots={snapshotList} />
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

      {/* Item 4: Decision Audit Modal */}
      <DecisionAuditModal
        open={auditOpen}
        onClose={() => setAuditOpen(false)}
        decision={auditDecision}
        portfolioId={portfolioId}
      />
    </div>
  );
}
