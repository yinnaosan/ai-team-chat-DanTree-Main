/**
 * DecisionHeader.tsx — DanTree Workspace 最终视觉母版 v1
 *
 * Global Top Bar / Decision Control Strip
 * 驾驶舱全局控制条：一抬头看到最重要状态
 * 不是行情栏，不是 navbar，是 decision-first 的全局状态条
 *
 * P1-3: 实体搜索升级 — prompt() → 内联 Combobox (Popover + cmdk)
 */
import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import {
  Leaf, TrendingUp, TrendingDown, Minus, Zap, AlertTriangle,
  Activity, Clock, Search, ChevronDown,
} from "lucide-react";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup,
} from "@/components/ui/command";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

// ─── Compat type exports (旧 ResearchWorkspace.tsx 依赖) ─────────────────────
export type ScrollToSection = "thesis" | "timing" | "alert" | "history";

/** 候选 ticker 条目（来自 WorkspaceContext sessionList） */
export interface EntityCandidate {
  id: string;
  ticker: string;
  title: string;
  sessionType?: string;
}

export interface DecisionHeaderProps {
  // ─── Compat fields (旧 ResearchWorkspace.tsx 依赖) ───
  vm?: unknown;
  onScrollTo?: unknown;
  activeSection?: unknown;
  // ─── Real props ───
  entity?: string;
  stance?: "bullish" | "bearish" | "neutral" | "mixed" | "unavailable";
  confidence?: number | null;
  changeMarker?: "stable" | "strengthening" | "weakening" | "reversal" | "unknown";
  alertCount?: number;
  highestAlertSeverity?: "low" | "medium" | "high" | "critical" | null;
  gateState?: "pass" | "block" | "fallback";
  lastUpdated?: string;
  /** P1-3: 候选 entity 列表（来自 WorkspaceContext sessionList） */
  entityCandidates?: EntityCandidate[];
  /** P1-3: 选中候选后的回调（传入选中的 candidate） */
  onSelectEntity?: (candidate: EntityCandidate) => void;
  /** P1-3: 用户输入新 ticker 并确认（不在候选列表中） */
  onNewEntity?: (ticker: string) => void;
  /** 兼容旧接口（已废弃，P1-3 后不再使用） */
  onEntitySearch?: () => void;
}

const STANCE = {
  bullish:     { label: "看多",   color: "#34d399", dim: "rgba(52,211,153,0.10)",  Icon: TrendingUp },
  bearish:     { label: "看空",   color: "#f87171", dim: "rgba(248,113,113,0.09)",  Icon: TrendingDown },
  neutral:     { label: "中性",   color: "#94a3b8", dim: "rgba(148,163,184,0.07)", Icon: Minus },
  mixed:       { label: "混合",   color: "#fbbf24", dim: "rgba(251,191,36,0.08)",  Icon: Activity },
  unavailable: { label: "未分析", color: "#4b5563", dim: "rgba(75,85,99,0.07)",    Icon: Minus },
};

const GATE_LABEL: Record<string, { label: string; color: string }> = {
  pass:     { label: "介入",  color: "#34d399" },
  block:    { label: "回避",  color: "#f87171" },
  fallback: { label: "待评",  color: "#6b7280" },
};

const SEVERITY_COLOR: Record<string, string> = {
  low: "rgba(255,255,255,0.55)", medium: "#f59e0b", high: "#f97316", critical: "#ef4444",
};

const MARKER_LABEL: Record<string, { label: string; color: string }> = {
  strengthening: { label: "↑ 强化",   color: "#34d399" },
  weakening:     { label: "↓ 弱化",   color: "#f87171" },
  reversal:      { label: "⟳ 逆转",   color: "#fb923c" },
  stable:        { label: "— 稳定",   color: "#4b5563" },
  unknown:       { label: "—",        color: "#374151" },
};

// ─── EntityCombobox: 内联搜索下拉框 ──────────────────────────────────────────

interface EntityComboboxProps {
  entity?: string;
  candidates: EntityCandidate[];
  onSelect: (candidate: EntityCandidate) => void;
  onNew: (ticker: string) => void;
}

function EntityCombobox({ entity, candidates, onSelect, onNew }: EntityComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // debounce 300ms
  const handleQueryChange = useCallback((val: string) => {
    setQuery(val);
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => setDebouncedQuery(val.trim()), 300);
  }, []);

  // 外部搜索（debounced）
  const { data: searchData, isFetching: isSearching } = trpc.market.searchTicker.useQuery(
    { query: debouncedQuery },
    { enabled: debouncedQuery.length >= 1, staleTime: 30000 }
  );

  // 打开时聚焦输入框
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  // 合并本地候选 + 外部搜索结果
  const filtered = useMemo(() => {
    const q = query.trim().toUpperCase();
    // 本地候选过滤
    const localFiltered = !q ? candidates : candidates.filter(c =>
      c.ticker.toUpperCase().includes(q) ||
      c.title.toUpperCase().includes(q)
    );
    // 外部搜索结果（去重：已在本地候选中的不重复显示）
    const localTickers = new Set(localFiltered.map(c => c.ticker.toUpperCase()));
    const externalResults: EntityCandidate[] = (Array.isArray(searchData) ? searchData : []).filter(
      (r: { symbol: string; name?: string; cnName?: string }) => !localTickers.has(r.symbol.toUpperCase())
    ).map((r: { symbol: string; name?: string; cnName?: string }) => ({
      id: `__ext__${r.symbol}`,
      ticker: r.symbol,
      title: r.cnName || r.name || r.symbol,
      sessionType: "entity" as const,
    }));
    return [...localFiltered, ...externalResults];
  }, [candidates, query, searchData]);

  // 判断当前输入是否是新 ticker（不在候选列表中）
  const isNewTicker = query.trim().length > 0 &&
    !candidates.some(c => c.ticker.toUpperCase() === query.trim().toUpperCase());

  const handleSelect = (candidate: EntityCandidate) => {
    onSelect(candidate);
    setOpen(false);
    setQuery("");
  };

  const handleNewTicker = () => {
    const t = query.trim().toUpperCase();
    if (t) {
      onNew(t);
      setOpen(false);
      setQuery("");
    }
  };

  // Esc 关闭
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        {/* 触发按钮：与原有 entity 胶囊视觉完全一致 */}
        <button
          style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "5px 14px 5px 10px", borderRadius: 8,
            background: entity ? "rgba(52,211,153,0.08)" : "rgba(255,255,255,0.04)",
            border: entity ? "1px solid rgba(52,211,153,0.85)" : "1px solid rgba(255,255,255,0.12)",
            boxShadow: entity ? "0 0 28px rgba(52,211,153,0.38), 0 0 12px rgba(52,211,153,0.22), inset 0 0 12px rgba(52,211,153,0.07)" : "none",
            cursor: "pointer",
          }}
        >
          {entity ? (
            <>
              <div style={{
                width: 24, height: 24, borderRadius: 5,
                background: "rgba(52,211,153,0.16)",
                display: "flex", alignItems: "center", justifyContent: "center",
                flexShrink: 0,
              }}>
                <span style={{ fontSize: 11, fontWeight: 800, color: "#34d399" }}>
                  {entity[0]}
                </span>
              </div>
              <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(237,237,239,0.94)", letterSpacing: "0.03em", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
                {entity}
              </span>
              <ChevronDown size={11} color="rgba(255,255,255,0.28)" />
            </>
          ) : (
            <>
              <Search size={12} color="rgba(255,255,255,0.28)" />
              <span style={{ fontSize: 12, color: "rgba(255,255,255,0.35)" }}>选择研究标的</span>
            </>
          )}
        </button>
      </PopoverTrigger>

      {/* 下拉候选面板：v8 视觉语言，不破坏边框/颜色/圆角体系 */}
      <PopoverContent
        align="start"
        sideOffset={6}
        style={{
          width: 280, padding: 0,
          background: "rgba(8,10,14,0.97)",
          border: "1px solid rgba(52,211,153,0.22)",
          borderRadius: 10,
          boxShadow: "0 8px 32px rgba(0,0,0,0.85), 0 0 20px rgba(52,211,153,0.08)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          overflow: "hidden",
        }}
        className="p-0"
        onKeyDown={handleKeyDown}
      >
        <Command shouldFilter={false} style={{ background: "transparent" }}>
          {/* 搜索输入框 */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "8px 12px",
            borderBottom: "1px solid rgba(255,255,255,0.07)",
          }}>
            <Search size={12} color="rgba(52,211,153,0.55)" style={{ flexShrink: 0 }} />
            <input
              ref={inputRef}
              value={query}
              onChange={e => handleQueryChange(e.target.value)}
              onKeyDown={e => {
                if (e.key === "Escape") { setOpen(false); setQuery(""); }
                if (e.key === "Enter" && isNewTicker) handleNewTicker();
              }}
              placeholder="输入股票代码或名称..."
              style={{
                flex: 1, background: "transparent", border: "none", outline: "none",
                fontSize: 12, color: "rgba(237,237,239,0.9)",
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                caretColor: "#34d399",
              }}
            />
          </div>

          <CommandList style={{ maxHeight: 240, overflowY: "auto" }}>
            {/* 候选列表 */}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map(c => (
                  <CommandItem
                    key={c.id}
                    value={c.ticker}
                    onSelect={() => handleSelect(c)}
                    style={{
                      display: "flex", alignItems: "center", gap: 10,
                      padding: "8px 12px", cursor: "pointer",
                      borderRadius: 0,
                    }}
                    className="hover:bg-[rgba(52,211,153,0.07)] data-[selected=true]:bg-[rgba(52,211,153,0.07)]"
                  >
                    <div style={{
                      width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                      background: c.ticker === entity ? "rgba(52,211,153,0.20)" : "rgba(255,255,255,0.06)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      <span style={{
                        fontSize: 10, fontWeight: 800,
                        color: c.ticker === entity ? "#34d399" : "rgba(255,255,255,0.55)",
                      }}>
                        {c.ticker[0]}
                      </span>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        fontSize: 12, fontWeight: 700,
                        color: c.ticker === entity ? "#34d399" : "rgba(237,237,239,0.9)",
                        fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                        letterSpacing: "0.03em",
                      }}>
                        {c.ticker}
                      </div>
                      <div style={{
                        fontSize: 10, color: "rgba(255,255,255,0.35)",
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                      }}>
                        {c.title}
                      </div>
                    </div>
                    {c.ticker === entity && (
                      <div style={{
                        width: 5, height: 5, borderRadius: "50%",
                        background: "#34d399", flexShrink: 0,
                      }} />
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}

            {/* 新 ticker 快捷入口 */}
            {isNewTicker && (
              <CommandGroup>
                <CommandItem
                  value={`__new__${query}`}
                  onSelect={handleNewTicker}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    padding: "8px 12px", cursor: "pointer",
                  }}
                  className="hover:bg-[rgba(52,211,153,0.07)] data-[selected=true]:bg-[rgba(52,211,153,0.07)]"
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: 5, flexShrink: 0,
                    background: "rgba(52,211,153,0.12)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <Search size={10} color="#34d399" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#34d399", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
                      分析 {query.trim().toUpperCase()}
                    </div>
                    <div style={{ fontSize: 10, color: "rgba(255,255,255,0.35)" }}>
                      新建研究会话
                    </div>
                  </div>
                </CommandItem>
              </CommandGroup>
            )}

            {/* 空态 */}
            {filtered.length === 0 && !isNewTicker && (
              <CommandEmpty>
                <div style={{ padding: "16px 12px", textAlign: "center", fontSize: 11, color: "rgba(255,255,255,0.28)" }}>
                  暂无匹配的研究标的
                </div>
              </CommandEmpty>
            )}
          </CommandList>

          {/* 底部提示 */}
          <div style={{
            padding: "6px 12px",
            borderTop: "1px solid rgba(255,255,255,0.05)",
            display: "flex", alignItems: "center", gap: 8,
          }}>
            <span style={{ fontSize: 9, color: "rgba(255,255,255,0.20)", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
              ↑↓ 导航 · Enter 确认 · Esc 关闭
            </span>
          </div>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ─── DecisionHeader ───────────────────────────────────────────────────────────

export function DecisionHeader({
  entity, stance = "unavailable", confidence = null,
  changeMarker = "unknown", alertCount = 0,
  highestAlertSeverity = null, gateState = "fallback",
  lastUpdated,
  entityCandidates = [],
  onSelectEntity,
  onNewEntity,
  onEntitySearch, // 兼容旧接口，不再使用
}: DecisionHeaderProps) {
  const st = STANCE[stance] ?? STANCE.unavailable;
  const gt = GATE_LABEL[gateState] ?? GATE_LABEL.fallback;
  const mk = MARKER_LABEL[changeMarker] ?? MARKER_LABEL.unknown;
  const { Icon: StIcon } = st;

  const handleSelect = (candidate: EntityCandidate) => {
    onSelectEntity?.(candidate);
  };

  const handleNew = (ticker: string) => {
    onNewEntity?.(ticker);
  };

  return (
    <header style={{
      height: 56, flexShrink: 0, width: "100%",
      display: "flex", alignItems: "center", justifyContent: "space-between",
      padding: "0 22px",
      background: "rgba(3,4,7,1.00)",
      backdropFilter: "blur(28px)",
      WebkitBackdropFilter: "blur(28px)",
      borderBottom: "1px solid rgba(255,255,255,0.12)",
      boxShadow: "0 1px 0 rgba(255,255,255,0.07), 0 6px 32px rgba(0,0,0,0.85)",
      position: "sticky", top: 0, zIndex: 50,
    }}>

      {/* ── Left: Brand + Entity Combobox ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 20, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7, flexShrink: 0 }}>
          <Leaf size={14} color="rgba(52,211,153,0.85)" />
          <span style={{ fontSize: 13, fontWeight: 700, color: "rgba(255,255,255,0.82)", letterSpacing: "0.06em", fontFamily: "'Inter', system-ui, sans-serif" }}>
            DanTree
          </span>
        </div>

        <div style={{ width: 1, height: 20, background: "rgba(255,255,255,0.06)", flexShrink: 0 }} />

        {/* P1-3: 内联 Combobox 替换原 prompt() 按钮 */}
        <EntityCombobox
          entity={entity}
          candidates={entityCandidates}
          onSelect={handleSelect}
          onNew={handleNew}
        />
      </div>

      {/* ── Center: Decision State ── */}
      {entity && (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>

          {/* Stance */}
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "5px 13px", borderRadius: 7,
            background: st.dim,
            border: `1px solid ${st.color}70`,
            boxShadow: `0 0 12px ${st.color}28, 0 0 4px ${st.color}14`,
          }}>
            <StIcon size={12} color={st.color} />
            <span style={{ fontSize: 12, fontWeight: 700, color: st.color, letterSpacing: "0.02em" }}>
              {st.label}
            </span>
          </div>

          {/* Readiness — 5-bar visual */}
          {confidence != null && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <div style={{ display: "flex", gap: 2 }}>
                {[1,2,3,4,5].map(i => {
                  const filled = i <= Math.round(confidence / 20);
                  return (
                    <div key={i} style={{
                      width: 4, height: 13, borderRadius: 2,
                      background: filled ? `rgba(255,255,255,0.72)` : "rgba(255,255,255,0.10)",
                      transition: "background 0.2s",
                    }} />
                  );
                })}
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.72)", fontVariantNumeric: "tabular-nums", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
                {Math.round(confidence / 20)}/5
              </span>
            </div>
          )}

          {/* Action bias */}
          <div style={{
            display: "flex", alignItems: "center", gap: 5,
            padding: "4px 10px", borderRadius: 6,
            background: "rgba(52,211,153,0.07)",
            border: "1px solid rgba(52,211,153,0.18)",
          }}>
            <Zap size={11} color={gt.color} />
            <span style={{ fontSize: 12, fontWeight: 700, color: gt.color }}>
              {gt.label}
            </span>
          </div>

          {/* Alert severity */}
          {alertCount > 0 && (
            <div
              className={highestAlertSeverity === "critical" || highestAlertSeverity === "high" ? "animate-pulse" : ""}
              style={{
                display: "flex", alignItems: "center", gap: 5,
                padding: "4px 10px", borderRadius: 6,
                background: highestAlertSeverity === "critical" ? "rgba(239,68,68,0.12)" :
                            highestAlertSeverity === "high" ? "rgba(249,115,22,0.10)" :
                            "rgba(245,158,11,0.08)",
                border: `1px solid ${SEVERITY_COLOR[highestAlertSeverity ?? "medium"] ?? "#f59e0b"}40`,
              }}
            >
              <AlertTriangle size={11} color={SEVERITY_COLOR[highestAlertSeverity ?? "medium"] ?? "#f59e0b"} />
              <span style={{ fontSize: 11, fontWeight: 700, color: SEVERITY_COLOR[highestAlertSeverity ?? "medium"] ?? "#f59e0b", letterSpacing: "0.01em" }}>
                {alertCount} 风险
              </span>
            </div>
          )}

          {/* Change marker */}
          <span style={{ fontSize: 11, fontWeight: 600, color: mk.color, letterSpacing: "0.01em" }}>
            {mk.label}
          </span>
        </div>
      )}

      {/* ── Right: System Clock + Update ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Clock size={10} color="rgba(255,255,255,0.25)" />
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.30)", fontVariantNumeric: "tabular-nums", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
            {lastUpdated ? `已更新 · ${lastUpdated}` : "待分析"}
          </span>
        </div>
        <button
          onClick={() => {
            // 更新按钮：触发 entity 重新分析（复用 onNewEntity 传入当前 entity）
            if (entity) onNewEntity?.(entity);
          }}
          style={{
            padding: "5px 14px", borderRadius: 7, cursor: "pointer",
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.22)",
            color: "rgba(255,255,255,0.82)",
            fontSize: 11, fontWeight: 700, letterSpacing: "0.06em",
            transition: "border-color 0.15s, color 0.15s",
          }}
        >
          更新
        </button>
      </div>
    </header>
  );
}
