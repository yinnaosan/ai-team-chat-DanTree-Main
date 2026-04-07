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
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import {
  Leaf, TrendingUp, TrendingDown, Minus, Zap, AlertTriangle,
  Activity, Clock, Search, ChevronDown, Settings, LogOut, Monitor,
} from "lucide-react";
import {
  Command, CommandInput, CommandList, CommandEmpty, CommandItem, CommandGroup,
} from "@/components/ui/command";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";

// ─── Compat type exports (旧 ResearchWorkspace.tsx 依赖) ─────────────────────
export type ScrollToSection = "thesis" | "timing" | "alert" | "history";

/** 候选 ticker 条目（来自 WorkspaceContext sessionList 或搜索结果） */
export interface EntityCandidate {
  id: string;
  ticker: string;       // 股票代码（如 AAPL, 700.HK, 600519.SS）
  title: string;        // 公司英文名
  cnName?: string;      // 公司中文名（如果有）
  market?: string;      // 市场标签：US / HK / CN / CRYPTO / JP / KR
  exchange?: string;    // 交易所：NASDAQ / NYSE / HKEX / SSE / SZSE
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
    const q = query.trim();
    const qUpper = q.toUpperCase();
    // 本地候选过滤：支持代码/英文名/中文名匹配
    // 空 query 时不显示历史候选，必须输入内容才触发联想
    const localFiltered = !q ? [] : candidates.filter(c =>
      c.ticker.toUpperCase().includes(qUpper) ||
      c.title.toUpperCase().includes(qUpper) ||
      (c.cnName && c.cnName.includes(q))
    );
    // 外部搜索结果：保留完整元数据（包括 market/exchange/cnName）
    const localTickers = new Set(localFiltered.map(c => c.ticker.toUpperCase()));
    const externalResults: EntityCandidate[] = (
      Array.isArray(searchData) ? searchData : []
    ).filter(
      (r: { symbol: string; name?: string; cnName?: string; market?: string; exchange?: string }) =>
        !localTickers.has(r.symbol.toUpperCase())
    ).map((r: { symbol: string; name?: string; cnName?: string; market?: string; exchange?: string }) => ({
      id: `__ext__${r.symbol}`,
      ticker: r.symbol,
      title: r.name || r.cnName || r.symbol,
      cnName: r.cnName,
      market: r.market,
      exchange: r.exchange,
      sessionType: "entity" as const,
    }));
    return [...localFiltered, ...externalResults];
  }, [candidates, query, searchData]);

  const handleSelect = (candidate: EntityCandidate) => {
    onSelect(candidate);
    setOpen(false);
    setQuery("");
  };

  // Esc 关闭；当输入框有内容且不在候选列表时，Enter 不提交原始字符，必须从列表选择
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
    }
    // 禁止 Enter 直接提交原始输入：必须从候选列表选择
    if (e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
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
              onKeyDown={handleKeyDown}
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
            {/* 候选列表：市场徽章 + 代码 + 公司名 */}
            {filtered.length > 0 && (
              <CommandGroup>
                {filtered.map(c => {
                  // 市场标签颜色映射
                  const MARKET_COLORS: Record<string, { bg: string; color: string }> = {
                    US:     { bg: "rgba(59,130,246,0.18)",  color: "#60a5fa" },
                    HK:     { bg: "rgba(251,146,60,0.18)",  color: "#fb923c" },
                    CN:     { bg: "rgba(239,68,68,0.18)",   color: "#f87171" },
                    SH:     { bg: "rgba(239,68,68,0.18)",   color: "#f87171" },
                    SZ:     { bg: "rgba(239,68,68,0.18)",   color: "#f87171" },
                    JP:     { bg: "rgba(168,85,247,0.18)",  color: "#c084fc" },
                    KR:     { bg: "rgba(20,184,166,0.18)",  color: "#2dd4bf" },
                    CRYPTO: { bg: "rgba(234,179,8,0.18)",   color: "#facc15" },
                    ETF:    { bg: "rgba(52,211,153,0.18)",  color: "#34d399" },
                  };
                  // 推断市场标签
                  const getMarketLabel = (c: EntityCandidate): string => {
                    if (c.market) return c.market;
                    if (c.ticker.endsWith(".HK") || /^\d{3,5}\.HK$/i.test(c.ticker)) return "HK";
                    if (c.ticker.endsWith(".SS")) return "SH";
                    if (c.ticker.endsWith(".SZ")) return "SZ";
                    if (c.ticker.endsWith(".T")) return "JP";
                    if (c.ticker.endsWith(".KS")) return "KR";
                    if (/^[A-Z]{1,5}$/.test(c.ticker)) return "US";
                    return "";
                  };
                  const marketLabel = getMarketLabel(c);
                  const mc = MARKET_COLORS[marketLabel] ?? { bg: "rgba(255,255,255,0.08)", color: "rgba(255,255,255,0.45)" };
                  const isActive = c.ticker === entity;
                  // 显示名称：中文名优先，其次英文名
                  const displayName = c.cnName || c.title;
                  return (
                    <CommandItem
                      key={c.id}
                      value={`${c.ticker} ${c.cnName ?? ""} ${c.title}`}
                      onSelect={() => handleSelect(c)}
                      style={{
                        display: "flex", alignItems: "center", gap: 10,
                        padding: "9px 12px", cursor: "pointer",
                        borderRadius: 0,
                        borderBottom: "1px solid rgba(255,255,255,0.04)",
                      }}
                      className="hover:bg-[rgba(52,211,153,0.07)] data-[selected=true]:bg-[rgba(52,211,153,0.07)]"
                    >
                      {/* 市场徽章 */}
                      {marketLabel ? (
                        <div style={{
                          minWidth: 32, height: 20, borderRadius: 4, flexShrink: 0,
                          background: mc.bg,
                          display: "flex", alignItems: "center", justifyContent: "center",
                          padding: "0 6px",
                        }}>
                          <span style={{ fontSize: 11, fontWeight: 800, color: mc.color, letterSpacing: "0.04em", fontFamily: "'IBM Plex Mono', ui-monospace, monospace" }}>
                            {marketLabel}
                          </span>
                        </div>
                      ) : (
                        <div style={{
                          width: 26, height: 26, borderRadius: 5, flexShrink: 0,
                          background: isActive ? "rgba(52,211,153,0.20)" : "rgba(255,255,255,0.06)",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}>
                          <span style={{ fontSize: 12, fontWeight: 800, color: isActive ? "#34d399" : "rgba(255,255,255,0.55)" }}>
                            {c.ticker[0]}
                          </span>
                        </div>
                      )}
                      {/* 主信息区 */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {/* 第一行：公司名（中文优先） */}
                        <div style={{
                          fontSize: 14, fontWeight: 600,
                          color: isActive ? "#34d399" : "rgba(237,237,239,0.94)",
                          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                          marginBottom: 2,
                        }}>
                          {displayName}
                        </div>
                        {/* 第二行：股票代码（放大，只显示一次） */}
                        <div style={{
                          fontSize: 12, fontWeight: 700,
                          color: isActive ? "rgba(52,211,153,0.85)" : "rgba(255,255,255,0.50)",
                          fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                          letterSpacing: "0.06em",
                        }}>
                          {c.ticker}
                        </div>
                      </div>
                      {isActive && (
                        <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#34d399", flexShrink: 0 }} />
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            )}

            {/* 空态：搜索中显示加载，无结果时提示用户继续输入 */}
            {filtered.length === 0 && (
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

// ─── PWAInstallButton ───────────────────────────────────────────────────────────────────
function PWAInstallButton() {
  const [deferredPrompt, setDeferredPrompt] = React.useState<Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> } | null>(null);
  const [installed, setInstalled] = React.useState(false);

  React.useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as Event & { prompt: () => void; userChoice: Promise<{ outcome: string }> });
    };
    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  if (installed) return null;

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') setInstalled(true);
    setDeferredPrompt(null);
  };

  return (
    <button
      title="安装到桌面"
      onClick={handleInstall}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: 30, height: 30, borderRadius: 7, cursor: 'pointer',
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.14)',
        color: 'rgba(255,255,255,0.50)',
        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(52,211,153,0.50)';
        (e.currentTarget as HTMLButtonElement).style.color = '#34d399';
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(52,211,153,0.06)';
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.14)';
        (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.50)';
        (e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.04)';
      }}
    >
      <Monitor size={13} />
    </button>
  );
}

// ─── LogoutButton ───────────────────────────────────────────────────────────────────
function LogoutButton() {
  const [, navigate] = useLocation();
  const logout = trpc.auth.logout.useMutation({
    onSuccess: () => navigate("/"),
    onError: () => navigate("/"),
  });
  return (
    <button
      title="退出登录"
      onClick={() => logout.mutate()}
      disabled={logout.isPending}
      style={{
        display: "flex", alignItems: "center", justifyContent: "center",
        width: 30, height: 30, borderRadius: 7, cursor: logout.isPending ? "not-allowed" : "pointer",
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.14)",
        color: "rgba(255,255,255,0.50)",
        opacity: logout.isPending ? 0.5 : 1,
        transition: "border-color 0.15s, color 0.15s, background 0.15s",
      }}
      onMouseEnter={e => {
        if (!logout.isPending) {
          (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(248,113,113,0.50)";
          (e.currentTarget as HTMLButtonElement).style.color = "#f87171";
          (e.currentTarget as HTMLButtonElement).style.background = "rgba(248,113,113,0.06)";
        }
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.14)";
        (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.50)";
        (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
      }}
    >
      <LogOut size={13} />
    </button>
  );
}

// ─── DecisionHeader ───────────────────────────────────────────────────────────────────

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
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663340309886/Sfk3bwgkEZLNATmH8kTpez/dantree-logo_88164382.png"
            alt="DanTree"
            style={{ width: 18, height: 18, borderRadius: 4, objectFit: "cover", flexShrink: 0 }}
          />
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

      {/* ── Right: System Clock + Update + Settings ── */}
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
        {/* 设置入口按鈕 */}
        <Link href="/settings">
          <button
            title="系统设置"
            style={{
              display: "flex", alignItems: "center", justifyContent: "center",
              width: 30, height: 30, borderRadius: 7, cursor: "pointer",
              background: "rgba(255,255,255,0.04)",
              border: "1px solid rgba(255,255,255,0.14)",
              color: "rgba(255,255,255,0.50)",
              transition: "border-color 0.15s, color 0.15s, background 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(52,211,153,0.50)";
              (e.currentTarget as HTMLButtonElement).style.color = "#34d399";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(52,211,153,0.06)";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "rgba(255,255,255,0.14)";
              (e.currentTarget as HTMLButtonElement).style.color = "rgba(255,255,255,0.50)";
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
            }}
          >
            <Settings size={13} />
          </button>
        </Link>
        {/* PWA 安装到桌面按钮 */}
        <PWAInstallButton />
        {/* 退出按鈕 */}
        <LogoutButton />
      </div>
    </header>
  );
}
