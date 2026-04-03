/**
 * HistoryBlock.tsx — DanTree Workspace v2.1-B5
 * Decision Canvas｜论点历史时间线模块
 */
import React, { useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";

export interface HistoryEntry {
  time: string;
  changeMarker: "first_observation" | "stable" | "strengthening" | "weakening" | "reversal" | "diverging" | "unknown";
  stance: string;
  actionBias: string;
  alertSeverity?: string | null;
  deltaSummary?: string;
}

export interface HistoryBlockProps {
  entity?: string;
  entries?: HistoryEntry[];
}

const MARKER = {
  first_observation: { label: "首次观测", color: "#60a5fa" },
  stable:            { label: "稳定",     color: "#94a3b8" },
  strengthening:     { label: "强化",     color: "#34d399" },
  weakening:         { label: "弱化",     color: "#fbbf24" },
  reversal:          { label: "逆转",     color: "#f87171" },
  diverging:         { label: "分歧",     color: "#f97316" },
  unknown:           { label: "未知",     color: "#4b5563" },
};

// 无默认 demo 历史记录 — 由父组件传入真实历史数据

export function HistoryBlock({ entity, entries = [] }: HistoryBlockProps) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ background: "#0a0e1a", border: "1px solid #1e2736", borderRadius: 10, overflow: "hidden" }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "11px 14px", cursor: "pointer", background: "transparent", border: "none", borderBottom: open ? "1px solid #1e2736" : "none" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <History size={13} color="#94a3b8" />
          <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: "0.08em", color: "#64748b", textTransform: "uppercase" }}>论点历史</span>
          <span style={{ fontSize: 10, color: "#374151" }}>{entries.length} 条记录</span>
        </div>
        {open ? <ChevronDown size={13} color="#374151" /> : <ChevronRight size={13} color="#374151" />}
      </button>
      {open && (
        <div style={{ padding: "10px 14px" }}>
          {entries.map((e, i) => {
            const mk = MARKER[e.changeMarker] ?? MARKER.unknown;
            return (
              <div key={i} style={{ display: "flex", gap: 12, paddingBottom: 10, position: "relative" }}>
                {/* Timeline line */}
                {i < entries.length - 1 && (
                  <div style={{ position: "absolute", left: 7, top: 16, bottom: 0, width: 1, background: "#1e2736" }} />
                )}
                {/* Dot */}
                <div style={{ width: 15, height: 15, borderRadius: "50%", flexShrink: 0, background: mk.color + "20", border: `1.5px solid ${mk.color}`, display: "flex", alignItems: "center", justifyContent: "center", marginTop: 2 }}>
                  <span style={{ width: 5, height: 5, borderRadius: "50%", background: mk.color }} />
                </div>
                {/* Content */}
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: mk.color, background: mk.color + "15", padding: "1px 5px", borderRadius: 3 }}>{mk.label}</span>
                    <span style={{ fontSize: 10, color: "#374151" }}>{e.time}</span>
                    {e.alertSeverity && (
                      <span style={{ fontSize: 10, color: "#f97316" }}>⚠ 告警</span>
                    )}
                  </div>
                  <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.5 }}>
                    立场 <strong style={{ color: "#60a5fa" }}>{e.stance}</strong> · 行动 <strong style={{ color: "#fbbf24" }}>{e.actionBias}</strong>
                  </div>
                  {e.deltaSummary && (
                    <div style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>{e.deltaSummary}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
