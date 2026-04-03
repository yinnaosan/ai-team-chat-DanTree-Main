/**
 * SessionRail.tsx — DanTree Workspace v2.1-B5
 * Column 1 | 220–260px | 会话导航轨道
 * 职责：搜索、会话列表、置顶、最近记录
 */
import React, { useState } from "react";
import {
  Search, Plus, Pin, Clock, Star, ChevronRight,
  MessageSquare, TrendingUp, X, Hash
} from "lucide-react";

interface SessionItem {
  id: string;
  entity: string;
  title: string;
  time: string;
  pinned?: boolean;
  active?: boolean;
  direction?: "bullish" | "bearish" | "neutral";
}

interface SessionRailProps {
  sessions?: SessionItem[];
  activeSessionId?: string;
  onSelectSession?: (id: string) => void;
  onNewSession?: () => void;
  activeEntity?: string;
  /** compat: legacy callers pass width; ignored internally */
  width?: number;
}

// 无默认 demo 会话 — 由父组件传入真实 sessions

function DirectionDot({ direction }: { direction?: "bullish" | "bearish" | "neutral" }) {
  const color = direction === "bullish" ? "#34d399" : direction === "bearish" ? "#f87171" : "#6b7280";
  return (
    <span
      className="inline-block rounded-full flex-shrink-0"
      style={{ width: 6, height: 6, background: color, boxShadow: direction !== "neutral" ? `0 0 6px ${color}60` : "none" }}
    />
  );
}

export function SessionRail({
  sessions = [],
  activeSessionId,
  onSelectSession,
  onNewSession,
  activeEntity,
}: SessionRailProps) {
  const [query, setQuery] = useState("");

  const filtered = sessions.filter(
    (s) =>
      !query ||
      s.entity.toLowerCase().includes(query.toLowerCase()) ||
      s.title.toLowerCase().includes(query.toLowerCase())
  );

  const pinned = filtered.filter((s) => s.pinned);
  const recent = filtered.filter((s) => !s.pinned);

  return (
    <aside
      className="flex flex-col h-full select-none"
      style={{
        width: 240,
        minWidth: 220,
        maxWidth: 260,
        background: "linear-gradient(180deg, #0d0f11 0%, #0a0c0e 100%)",
        borderRight: "1px solid #1c1f23",
        fontFamily: "'SF Pro Display', 'JetBrains Mono', monospace",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-5 pb-3">
        <div className="flex items-center gap-2">
          <Hash className="w-3.5 h-3.5" style={{ color: "#3b82f6" }} />
          <span className="text-xs font-bold tracking-[0.15em] uppercase" style={{ color: "#94a3b8" }}>
            Sessions
          </span>
        </div>
        <button
          onClick={onNewSession}
          className="flex items-center justify-center rounded-md transition-all duration-150 active:scale-95"
          style={{
            width: 24, height: 24,
            background: "#1e293b",
            border: "1px solid #2d3748",
            color: "#64748b",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#1e3a5f";
            (e.currentTarget as HTMLButtonElement).style.color = "#3b82f6";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.background = "#1e293b";
            (e.currentTarget as HTMLButtonElement).style.color = "#64748b";
          }}
        >
          <Plus className="w-3 h-3" />
        </button>
      </div>

      {/* Search */}
      <div className="px-3 pb-3">
        <div
          className="flex items-center gap-2 rounded-lg px-3"
          style={{
            background: "#111418",
            border: "1px solid #1c2028",
            height: 32,
          }}
        >
          <Search className="w-3 h-3 flex-shrink-0" style={{ color: "#4b5563" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索会话..."
            className="bg-transparent border-none outline-none text-xs w-full"
            style={{ color: "#94a3b8", fontFamily: "inherit" }}
          />
          {query && (
            <button onClick={() => setQuery("")}>
              <X className="w-3 h-3" style={{ color: "#4b5563" }} />
            </button>
          )}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-2 pb-4" style={{ scrollbarWidth: "none" }}>
        {/* Pinned */}
        {pinned.length > 0 && (
          <div className="mb-3">
            <div className="flex items-center gap-1.5 px-2 mb-1.5">
              <Pin className="w-2.5 h-2.5" style={{ color: "#475569" }} />
              <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "#475569" }}>
                置顶
              </span>
            </div>
            {pinned.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                active={!!(s.id === activeSessionId || s.active)}
                onClick={() => onSelectSession?.(s.id)}
              />
            ))}
          </div>
        )}

        {/* Recent */}
        {recent.length > 0 && (
          <div>
            <div className="flex items-center gap-1.5 px-2 mb-1.5">
              <Clock className="w-2.5 h-2.5" style={{ color: "#475569" }} />
              <span className="text-[10px] font-semibold tracking-widest uppercase" style={{ color: "#475569" }}>
                最近
              </span>
            </div>
            {recent.map((s) => (
              <SessionCard
                key={s.id}
                session={s}
                active={s.id === activeSessionId}
                onClick={() => onSelectSession?.(s.id)}
              />
            ))}
          </div>
        )}

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-8 gap-2">
            <MessageSquare className="w-6 h-6" style={{ color: "#1e293b" }} />
            <p className="text-[11px]" style={{ color: "#374151" }}>
              暂无会话
            </p>
          </div>
        )}
      </div>
    </aside>
  );
}

function SessionCard({
  session,
  active,
  onClick,
}: {
  session: SessionItem;
  active: boolean;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="w-full text-left flex items-start gap-2.5 px-2.5 py-2 rounded-lg mb-0.5 transition-all duration-150"
      style={{
        background: active
          ? "linear-gradient(135deg, #0f2040 0%, #0d1a2e 100%)"
          : hovered
            ? "#0f1620"
            : "transparent",
        border: active ? "1px solid #1e3a5f" : "1px solid transparent",
      }}
    >
      {/* Entity badge */}
      <div
        className="flex-shrink-0 rounded font-mono font-bold text-[9px] flex items-center justify-center mt-0.5"
        style={{
          width: 28, height: 18,
          background: active ? "#1e3a5f" : "#131920",
          color: active ? "#60a5fa" : "#4b5563",
          letterSpacing: "0.05em",
        }}
      >
        {session.entity.slice(0, 4)}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <DirectionDot direction={session.direction} />
          <span
            className="text-[11px] font-medium truncate"
            style={{ color: active ? "#e2e8f0" : "#9ca3af" }}
          >
            {session.title}
          </span>
        </div>
        <span className="text-[10px]" style={{ color: "#374151" }}>
          {session.time}
        </span>
      </div>

      {active && (
        <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5" style={{ color: "#3b82f6" }} />
      )}
    </button>
  );
}
