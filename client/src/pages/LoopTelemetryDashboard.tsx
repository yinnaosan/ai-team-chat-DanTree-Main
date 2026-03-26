/**
 * LEVEL2E: Loop Telemetry & Threshold Tuning Dashboard
 * Visualizes LEVEL2 reasoning loop trigger distribution and evidence delta.
 * MODULE_ID: LEVEL2E_TELEMETRY_DASHBOARD
 */

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Brain, TrendingUp, TrendingDown, Minus, RefreshCw, BarChart3, Activity, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

// ── Current threshold config (mirrors loopTelemetryWriter.ts) ──────────────
const CURRENT_THRESHOLDS = {
  EVIDENCE_SCORE_TRIGGER: 0.65,
  CONFIDENCE_TRIGGER_VALUES: ["low", "very_low", "insufficient"],
  MAX_LOOP_ITERATIONS: 1,
  MAX_LLM_CALLS_PER_LOOP: 2,
};

// ── Stat Card ─────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color }: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card className="p-4 flex flex-col gap-1"
      style={{ background: "oklch(0.16 0.01 250)", border: "1px solid oklch(0.25 0.02 250)" }}>
      <div className="text-xs opacity-60">{label}</div>
      <div className="text-2xl font-bold" style={{ color: color ?? "oklch(0.85 0 0)" }}>{value}</div>
      {sub && <div className="text-xs opacity-50">{sub}</div>}
    </Card>
  );
}

// ── Trigger Type Bar ──────────────────────────────────────────────────────────
function TriggerBar({ type, count, total }: { type: string; count: number; total: number }) {
  const pct = total > 0 ? (count / total) * 100 : 0;
  const color = type === "no_trigger"
    ? "oklch(0.5 0 0)"
    : type.includes("evidence")
      ? "oklch(0.65 0.18 250)"
      : "oklch(0.65 0.18 145)";
  return (
    <div className="flex items-center gap-3">
      <div className="w-40 text-xs opacity-70 truncate">{type}</div>
      <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ background: "oklch(0.25 0 0)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="w-12 text-right text-xs opacity-70">{count} ({pct.toFixed(0)}%)</div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function LoopTelemetryDashboard() {
  const [limit, setLimit] = useState(50);
  const { data, isLoading, refetch } = trpc.telemetry.getLoopStats.useQuery({ limit });

  const summary = data?.summary;
  const rows = data?.rows ?? [];

  return (
    <div className="min-h-screen p-6 space-y-6"
      style={{ background: "oklch(0.12 0.01 250)", color: "oklch(0.85 0 0)" }}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Brain className="w-6 h-6" style={{ color: "oklch(0.65 0.18 250)" }} />
          <div>
            <h1 className="text-xl font-bold">LEVEL2 推理循环 · 遥测仪表盘</h1>
            <p className="text-xs opacity-50 mt-0.5">MODULE: LEVEL2E · 阈值校准 · 触发分布分析</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="text-xs px-2 py-1 rounded"
            style={{ background: "oklch(0.2 0.01 250)", border: "1px solid oklch(0.3 0.02 250)", color: "oklch(0.8 0 0)" }}
            value={limit}
            onChange={e => setLimit(Number(e.target.value))}
          >
            <option value={20}>最近 20 条</option>
            <option value={50}>最近 50 条</option>
            <option value={100}>最近 100 条</option>
            <option value={200}>最近 200 条</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {/* Current Threshold Config */}
      <Card className="p-4" style={{ background: "oklch(0.16 0.01 250)", border: "1px solid oklch(0.3 0.18 250 / 0.4)" }}>
        <div className="flex items-center gap-2 mb-3">
          <Target className="w-4 h-4" style={{ color: "oklch(0.72 0.18 250)" }} />
          <span className="text-sm font-semibold" style={{ color: "oklch(0.72 0.18 250)" }}>当前阈值配置</span>
          <span className="text-xs opacity-40 ml-1">（修改需编辑 loopTelemetryWriter.ts）</span>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
          <div className="space-y-0.5">
            <div className="opacity-50">证据评分触发阈值</div>
            <div className="font-mono font-bold text-base" style={{ color: "oklch(0.72 0.18 35)" }}>
              &lt; {CURRENT_THRESHOLDS.EVIDENCE_SCORE_TRIGGER * 100}%
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="opacity-50">置信度触发值</div>
            <div className="font-mono" style={{ color: "oklch(0.72 0.18 145)" }}>
              {CURRENT_THRESHOLDS.CONFIDENCE_TRIGGER_VALUES.join(" | ")}
            </div>
          </div>
          <div className="space-y-0.5">
            <div className="opacity-50">最大循环轮次</div>
            <div className="font-mono font-bold text-base">{CURRENT_THRESHOLDS.MAX_LOOP_ITERATIONS}</div>
          </div>
          <div className="space-y-0.5">
            <div className="opacity-50">每轮最大 LLM 调用</div>
            <div className="font-mono font-bold text-base">{CURRENT_THRESHOLDS.MAX_LLM_CALLS_PER_LOOP}</div>
          </div>
        </div>
      </Card>

      {/* No data state */}
      {!isLoading && rows.length === 0 && (
        <Card className="p-8 text-center" style={{ background: "oklch(0.16 0.01 250)", border: "1px solid oklch(0.25 0.02 250)" }}>
          <Activity className="w-8 h-8 mx-auto mb-3 opacity-30" />
          <p className="opacity-50 text-sm">暂无遥测数据</p>
          <p className="opacity-30 text-xs mt-1">完成至少一次 standard/deep 模式分析后，数据将在此显示</p>
        </Card>
      )}

      {/* Summary Stats */}
      {summary && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard
              label="总分析次数"
              value={summary.total}
              sub={`最近 ${limit} 条记录`}
            />
            <StatCard
              label="触发率"
              value={`${(summary.triggerRate * 100).toFixed(1)}%`}
              sub={`${summary.triggered} / ${summary.total} 次触发`}
              color="oklch(0.72 0.18 250)"
            />
            <StatCard
              label="判断变更率"
              value={`${(summary.verdictChangeRate * 100).toFixed(1)}%`}
              sub={`${summary.verdictChangedCount} 次判断更新`}
              color={summary.verdictChangeRate > 0.3 ? "oklch(0.72 0.18 35)" : "oklch(0.65 0.18 145)"}
            />
            <StatCard
              label="平均证据增益"
              value={`${summary.avgEvidenceDelta >= 0 ? "+" : ""}${(summary.avgEvidenceDelta * 100).toFixed(2)}%`}
              sub="evidence_score_delta 均值"
              color={summary.avgEvidenceDelta > 0 ? "oklch(0.65 0.18 145)" : "oklch(0.65 0.18 25)"}
            />
          </div>

          {/* Trigger Type Distribution */}
          <Card className="p-4" style={{ background: "oklch(0.16 0.01 250)", border: "1px solid oklch(0.25 0.02 250)" }}>
            <div className="flex items-center gap-2 mb-4">
              <BarChart3 className="w-4 h-4" style={{ color: "oklch(0.65 0.18 250)" }} />
              <span className="text-sm font-semibold">触发类型分布</span>
            </div>
            <div className="space-y-2">
              {Object.entries(summary.triggerTypeDistribution)
                .sort(([, a], [, b]) => b - a)
                .map(([type, count]) => (
                  <TriggerBar key={type} type={type} count={count} total={summary.total} />
                ))}
            </div>
          </Card>
        </>
      )}

      {/* Recent Rows Table */}
      {rows.length > 0 && (
        <Card className="p-4 overflow-x-auto" style={{ background: "oklch(0.16 0.01 250)", border: "1px solid oklch(0.25 0.02 250)" }}>
          <div className="flex items-center gap-2 mb-4">
            <Activity className="w-4 h-4" style={{ color: "oklch(0.65 0.18 145)" }} />
            <span className="text-sm font-semibold">最近遥测记录</span>
          </div>
          <table className="w-full text-xs" style={{ borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid oklch(0.25 0 0)" }}>
                {["时间", "标的", "触发类型", "证据前", "证据后", "Δ", "判断变更", "模式"].map(h => (
                  <th key={h} className="text-left py-1.5 px-2 opacity-50 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const delta = Number(r.evidenceDelta);
                const DeltaIcon = delta > 0.01 ? TrendingUp : delta < -0.01 ? TrendingDown : Minus;
                const deltaColor = delta > 0.01 ? "oklch(0.65 0.18 145)" : delta < -0.01 ? "oklch(0.65 0.18 25)" : "oklch(0.5 0 0)";
                return (
                  <tr key={r.id} style={{ borderBottom: "1px solid oklch(0.2 0 0 / 0.5)" }}>
                    <td className="py-1.5 px-2 opacity-50">
                      {new Date(r.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}
                    </td>
                    <td className="py-1.5 px-2 font-mono">{r.primaryTicker || "—"}</td>
                    <td className="py-1.5 px-2">
                      <span className="px-1.5 py-0.5 rounded font-mono"
                        style={{ background: "oklch(0.2 0.02 250 / 0.5)", border: "1px solid oklch(0.3 0.02 250 / 0.5)" }}>
                        {r.triggerType}
                      </span>
                    </td>
                    <td className="py-1.5 px-2 opacity-70">{(Number(r.evidenceScoreAtTrigger) * 100).toFixed(1)}%</td>
                    <td className="py-1.5 px-2">
                      {(Number(r.evidenceScoreAtTrigger) * 100 + delta * 100).toFixed(1)}%
                    </td>
                    <td className="py-1.5 px-2">
                      <span className="flex items-center gap-1" style={{ color: deltaColor }}>
                        <DeltaIcon className="w-3 h-3" />
                        {delta >= 0 ? "+" : ""}{(delta * 100).toFixed(2)}%
                      </span>
                    </td>
                    <td className="py-1.5 px-2">
                      {r.verdictChanged === 1
                        ? <span style={{ color: "oklch(0.72 0.18 35)" }}>✓ 已变更</span>
                        : <span className="opacity-40">—</span>}
                    </td>
                    <td className="py-1.5 px-2 opacity-60">{r.outputMode}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
