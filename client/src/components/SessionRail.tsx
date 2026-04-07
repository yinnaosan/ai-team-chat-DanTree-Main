/**
 * SessionRail.tsx — DanTree Workspace 最终视觉母版 v1
 *
 * 专业 Research Session Control Rail
 * 不是聊天会话栏——是研究会话状态导航
 * 有层级感、状态感、克制感
 */
import React, { useState } from "react";
import { Search, Plus, Pin, Clock, Target, AlertTriangle, Lightbulb, TrendingUp, TrendingDown } from "lucide-react";

export interface SessionItem {
  id: string;
  entity: string;
  title: string;
  type?: "thesis" | "timing" | "risk" | "research";
  time: string;
  pinned?: boolean;
  active?: boolean;
  direction?: "bullish" | "bearish" | "neutral";
  hasAlert?: boolean;
}

interface SessionRailProps {
  // ─── Compat field (TerminalEntry.tsx 依赖) ───
  width?: number;
  // ─── Real props ───
  sessions?: SessionItem[];
  activeSessionId?: string;
  onSelectSession?: (id: string) => void;
  /** @deprecated 旧接口兼容，勿新增使用 */
  onNewSession?: () => void;
  /** 绿色加号：创建空白 general session（无 focusKey） */
  onNewGeneralSession?: () => void;
  activeEntity?: string;
}

const TYPE_ICON = { thesis: Target, timing: Clock, risk: AlertTriangle, research: Lightbulb };
const TYPE_LABEL = { thesis: "Thesis", timing: "Timing", risk: "Risk", research: "研究" };

export function SessionRail({
  sessions = [], activeSessionId, onSelectSession, onNewSession, onNewGeneralSession, activeEntity,
}: SessionRailProps) {
  // 绿色加号优先使用 onNewGeneralSession，向后兼容 onNewSession
  const handleNewGeneral = onNewGeneralSession ?? onNewSession;
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? sessions.filter(s =>
        s.title.toLowerCase().includes(query.toLowerCase()) ||
        s.entity.toLowerCase().includes(query.toLowerCase())
      )
    : sessions;

  const pinned = filtered.filter(s => s.pinned);
  const recent = filtered.filter(s => !s.pinned);

  return (
    <aside style={{
      width: 240, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%",
      background: "rgba(3,4,8,1.00)",
      backdropFilter: "blur(24px)",
      WebkitBackdropFilter: "blur(24px)",
      borderRight: "1px solid rgba(255,255,255,0.12)",
    }}>

      {/* Column Header — 灰色加号已移除（产品逻辑：只保留绿色加号创建 general session） */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px 11px",
        borderBottom: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.025)",
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.92)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          研究会话
        </span>
      </div>

      {/* Search + New */}
      <div style={{ padding: "8px 10px 6px" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={12} color="rgba(255,255,255,0.18)" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="搜索..."
              style={{
                width: "100%", height: 28, paddingLeft: 28, paddingRight: 8,
                fontSize: 11, lineHeight: 1,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6,
                color: "rgba(255,255,255,0.80)", outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
          <button
            onClick={handleNewGeneral}
            title="新建空白研究（General Session）"
            style={{
              width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(52,211,153,0.20)",
              background: "rgba(52,211,153,0.08)", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <Plus size={14} color="#34d399" />
          </button>
        </div>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px 8px" }}>

        {/* Empty state */}
        {sessions.length === 0 && (
          <div style={{ padding: "28px 12px", textAlign: "center" }}>
            <Target size={18} color="rgba(255,255,255,0.10)" style={{ margin: "0 auto 8px", display: "block" }} />
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.24)", lineHeight: 1.6, margin: 0 }}>
              暂无研究会话<br />点击 + 开始新分析
            </p>
          </div>
        )}

        {/* Pinned */}
        {pinned.length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <SectionLabel icon={Pin} label="已固定" />
            {pinned.map(s => <SessionCard key={s.id} session={s} isActive={s.id === activeSessionId} onClick={() => onSelectSession?.(s.id)} />)}
          </div>
        )}

        {/* Recent */}
        {recent.length > 0 && (
          <div>
            <SectionLabel icon={Clock} label="最近" />
            {recent.map(s => <SessionCard key={s.id} session={s} isActive={s.id === activeSessionId} onClick={() => onSelectSession?.(s.id)} />)}
          </div>
        )}
      </div>
    </aside>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: React.FC<any>; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 8px 4px" }}>
      <Icon size={9} color="rgba(255,255,255,0.28)" />
      <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.32)", textTransform: "uppercase", letterSpacing: "0.10em" }}>
        {label}
      </span>
    </div>
  );
}

function SessionCard({ session, isActive, onClick }: { session: SessionItem; isActive: boolean; onClick: () => void }) {
  const [hovered, setHovered] = useState(false);
  const TypeIcon = TYPE_ICON[session.type ?? "research"] ?? Lightbulb;
  const typeLabel = TYPE_LABEL[session.type ?? "research"];

  const dirColor = session.direction === "bullish" ? "#34d399"
    : session.direction === "bearish" ? "#f87171"
    : "rgba(255,255,255,0.30)";

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%", textAlign: "left",
        display: "flex", alignItems: "flex-start", gap: 8,
        padding: "8px 10px", borderRadius: 7, marginBottom: 2,
        cursor: "pointer", border: "none",
        borderLeft: `3px solid ${isActive ? "#34d399" : "transparent"}`,
        background: isActive
          ? "rgba(52,211,153,0.16)"
          : hovered ? "rgba(255,255,255,0.065)" : "transparent",
        boxShadow: isActive ? "0 0 0 1px rgba(52,211,153,0.32), inset 0 0 24px rgba(52,211,153,0.10), 0 2px 12px rgba(52,211,153,0.12)" : "none",
        transition: "background 0.12s, box-shadow 0.12s",
      }}
    >
      {/* Type badge */}
      <div style={{
        width: 24, height: 24, borderRadius: 6, flexShrink: 0, marginTop: 1,
        background: isActive ? "rgba(52,211,153,0.14)" : "rgba(255,255,255,0.05)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}>
        <TypeIcon size={12} color={isActive ? "#34d399" : "rgba(255,255,255,0.32)"} />
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
          <span style={{
            fontSize: 11, fontWeight: isActive ? 600 : 400,
            color: isActive ? "rgba(237,237,239,0.92)" : "rgba(255,255,255,0.60)",
            overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1,
          }}>
            {session.title}
          </span>
          {session.hasAlert && (
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
          )}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ fontSize: 9, fontWeight: 600, color: dirColor }}>
            {session.direction === "bullish" ? "看多" : session.direction === "bearish" ? "看空" : session.entity}
          </span>
          <span style={{ fontSize: 9, color: "rgba(255,255,255,0.25)", marginLeft: "auto", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
            {session.time}
          </span>
        </div>
      </div>
    </button>
  );
}
