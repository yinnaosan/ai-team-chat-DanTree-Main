/**
 * GlobalMarketBar.tsx
 * DashboardLayout 顶部全局市场状态聚合栏
 * 显示：A股 | 港股 | 美股 | 英股 | 德股 | 法股 的实时开闭市状态
 * 点击市场徽章弹出该市场主要指数快照浮层（不跳转页面）
 * 每 60 秒自动刷新
 */

import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useRef, useState } from "react";
import { TrendingUp, TrendingDown, Minus, X } from "lucide-react";

// ─── 类型 ────────────────────────────────────────────────────────────────────

type TradingSession =
  | "trading" | "pre_auction" | "post_auction"
  | "pre_market" | "post_market" | "lunch" | "closed";

type MarketCode = "CN" | "HK" | "US" | "GB" | "DE" | "FR";

interface MarketStatus {
  market: MarketCode;
  name: string;
  session: TradingSession;
  isOpen: boolean;
  localTime: string;
  timezone: string;
  pollIntervalMs: number;
}

interface IndexSnapshot {
  symbol: string;
  name: string;
  price: number | null;
  change: number | null;
  pctChange: number | null;
  prevClose: number | null;
  high: number | null;
  low: number | null;
  error: string | null;
}

// ─── 时段标签与颜色 ──────────────────────────────────────────────────────────

const SESSION_LABEL: Record<TradingSession, string> = {
  trading:      "交易中",
  pre_auction:  "竞价中",
  post_auction: "撮合中",
  pre_market:   "盘前",
  post_market:  "盘后",
  lunch:        "午休",
  closed:       "休市",
};

function getSessionStyle(session: TradingSession): {
  dot: string; text: string; bg: string; border: string;
} {
  if (session === "trading") {
    return { dot: "bg-green-500", text: "text-green-400", bg: "rgba(34,197,94,0.08)", border: "rgba(34,197,94,0.2)" };
  }
  if (session === "pre_auction" || session === "post_auction") {
    return { dot: "bg-amber-400", text: "text-amber-400", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)" };
  }
  if (session === "pre_market" || session === "post_market") {
    return { dot: "bg-blue-400", text: "text-blue-400", bg: "rgba(96,165,250,0.08)", border: "rgba(96,165,250,0.2)" };
  }
  return { dot: "bg-gray-500", text: "text-gray-500", bg: "rgba(100,100,100,0.06)", border: "rgba(100,100,100,0.15)" };
}

const SHORT_NAME: Record<MarketCode, string> = {
  CN: "A股", HK: "港股", US: "美股", GB: "英股", DE: "德股", FR: "法股",
};

// ─── 指数快照浮层 ─────────────────────────────────────────────────────────────

function IndexSnapshotPopup({
  market,
  marketName,
  anchorRef,
  onClose,
}: {
  market: MarketCode;
  marketName: string;
  anchorRef: React.RefObject<HTMLDivElement | null>;
  onClose: () => void;
}) {
  const popupRef = useRef<HTMLDivElement>(null);
  const { isAuthenticated } = useAuth();
  const { data, isLoading } = trpc.market.getMarketIndexSnapshot.useQuery(
    { market },
    { enabled: isAuthenticated, staleTime: 30_000, refetchOnWindowFocus: false }
  );

  // 点击外部关闭
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        popupRef.current && !popupRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [onClose, anchorRef]);

  // 计算浮层位置（锚定到徽章下方）
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      setPos({
        top: rect.bottom + 6,
        left: Math.min(rect.left, window.innerWidth - 260),
      });
    }
  }, [anchorRef]);

  const snapshots = data as IndexSnapshot[] | undefined;

  return (
    <div
      ref={popupRef}
      className="fixed z-[200] w-56 rounded-lg shadow-2xl border border-white/10 overflow-hidden"
      style={{
        top: pos.top,
        left: pos.left,
        background: "rgba(14,14,22,0.97)",
        backdropFilter: "blur(16px)",
      }}
    >
      {/* 标题栏 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/8">
        <span className="text-sm font-semibold text-gray-100">{marketName} 主要指数</span>
        <button onClick={onClose} className="text-gray-500 hover:text-gray-300 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* 指数列表 */}
      <div className="p-2 space-y-1">
        {isLoading ? (
          [...Array(3)].map((_, i) => (
            <div key={i} className="h-8 rounded bg-white/5 animate-pulse" />
          ))
        ) : snapshots && snapshots.length > 0 ? (
          snapshots.map((snap) => {
            const isUp = (snap.pctChange ?? 0) > 0;
            const isDown = (snap.pctChange ?? 0) < 0;
            const color = isUp ? "#22c55e" : isDown ? "#ef4444" : "#9ca3af";
            const Icon = isUp ? TrendingUp : isDown ? TrendingDown : Minus;
            return (
              <div
                key={snap.symbol}
                className="flex items-center justify-between px-2 py-1.5 rounded"
                style={{ background: "rgba(255,255,255,0.03)" }}
              >
                <div className="flex flex-col min-w-0">
                  <span className="text-xs font-semibold text-gray-100 truncate">{snap.name}</span>
                  <span className="text-[11px] text-gray-500 font-mono">{snap.symbol}</span>
                </div>
                <div className="flex flex-col items-end ml-2 flex-shrink-0">
                  {snap.price != null ? (
                    <>
                      <span className="text-sm font-bold font-mono tabular-nums" style={{ color }}>
                        {snap.price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </span>
                      <div className="flex items-center gap-0.5">
                        <Icon className="w-2.5 h-2.5" style={{ color }} />
                        <span className="text-xs font-mono tabular-nums" style={{ color }}>
                          {snap.pctChange != null ? `${snap.pctChange >= 0 ? "+" : ""}${snap.pctChange.toFixed(2)}%` : "—"}
                        </span>
                      </div>
                    </>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {snap.error ? "获取失败" : "暂无数据"}
                    </span>
                  )}
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-center py-3 text-sm text-gray-500">暂无数据</div>
        )}
      </div>

      {/* 底部提示 */}
      <div className="px-3 py-1.5 border-t border-white/5">
        <span className="text-[11px] text-gray-600 font-mono">
          {new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} 快照
        </span>
      </div>
    </div>
  );
}

// ─── 单个市场徽章 ────────────────────────────────────────────────────────────

function MarketBadge({
  status,
  isActive,
  onClick,
  badgeRef,
}: {
  status: MarketStatus;
  isActive: boolean;
  onClick: () => void;
  badgeRef: React.RefObject<HTMLDivElement | null>;
}) {
  const style = getSessionStyle(status.session);
  const label = SESSION_LABEL[status.session] ?? status.session;
  const shortName = SHORT_NAME[status.market] ?? status.market;

  return (
    <div
      ref={badgeRef}
      onClick={onClick}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-mono whitespace-nowrap select-none cursor-pointer transition-all duration-150"
      style={{
        background: isActive ? `rgba(255,255,255,0.08)` : style.bg,
        border: `1px solid ${isActive ? "rgba(255,255,255,0.2)" : style.border}`,
        boxShadow: isActive ? "0 0 0 1px rgba(255,255,255,0.1)" : undefined,
      }}
      title={`${status.name} · ${status.localTime} 本地时间 · 点击查看主要指数`}
    >
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot} ${status.session === "trading" ? "animate-pulse" : ""}`} />
      <span className="text-gray-200 font-semibold">{shortName}</span>
      <span className={`${style.text} opacity-90 font-medium`}>{label}</span>
      <span className="text-gray-500 text-[11px]">{status.localTime}</span>
    </div>
  );
}

// ─── 骨架屏 ──────────────────────────────────────────────────────────────────

function MarketBarSkeleton() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 overflow-x-auto">
      {[...Array(6)].map((_, i) => (
        <div key={i} className="h-5 w-20 rounded bg-white/5 animate-pulse flex-shrink-0" />
      ))}
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export function GlobalMarketBar() {
  const [refetchTick, setRefetchTick] = useState(0);
  const [activeMarket, setActiveMarket] = useState<MarketCode | null>(null);
  const badgeRefs = useRef<Record<string, React.RefObject<HTMLDivElement | null>>>({});

  // 每 60 秒触发一次重新查询
  useEffect(() => {
    const timer = setInterval(() => setRefetchTick(t => t + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const { isAuthenticated } = useAuth();
  const { data, isLoading, isError } = trpc.market.getAllMarketStatuses.useQuery(undefined, {
    enabled: isAuthenticated,
    staleTime: 55_000,
    refetchOnWindowFocus: false,
  });

  const { data: data2, isLoading: isLoading2 } = trpc.market.getAllMarketStatuses.useQuery(undefined, {
    enabled: isAuthenticated && refetchTick > 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const statuses: MarketStatus[] = ((refetchTick > 0 ? data2 : data) as MarketStatus[] | undefined) ?? [];

  // 确保每个市场都有对应的 ref
  statuses.forEach(s => {
    if (!badgeRefs.current[s.market]) {
      badgeRefs.current[s.market] = { current: null } as React.RefObject<HTMLDivElement | null>;
    }
  });

  const handleBadgeClick = (market: MarketCode) => {
    setActiveMarket(prev => prev === market ? null : market);
  };

  if (isLoading && isLoading2 && refetchTick === 0) {
    return (
      <div className="border-b border-white/5 bg-[#0a0a0f]/80">
        <MarketBarSkeleton />
      </div>
    );
  }

  if (isError || statuses.length === 0) return null;

  const activeStatus = statuses.find(s => s.market === activeMarket);

  return (
    <>
      <div
        className="border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-sm"
        style={{ minHeight: 28 }}
      >
        <div className="flex items-center gap-1.5 px-3 py-1 overflow-x-auto scrollbar-none">
          <span className="text-gray-500 text-xs font-mono mr-0.5 flex-shrink-0">全球市场</span>
          <div className="w-px h-3 bg-white/10 flex-shrink-0" />
          {statuses.map((s) => {
            if (!badgeRefs.current[s.market]) {
              badgeRefs.current[s.market] = { current: null } as React.RefObject<HTMLDivElement | null>;
            }
            return (
              <MarketBadge
                key={s.market}
                status={s}
                isActive={activeMarket === s.market}
                onClick={() => handleBadgeClick(s.market)}
                badgeRef={badgeRefs.current[s.market]}
              />
            );
          })}
          <span className="ml-auto text-gray-600 text-[11px] font-mono flex-shrink-0">
            {new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 更新
          </span>
        </div>
      </div>

      {/* 指数快照浮层（Portal 到 body 外层，避免被 overflow:hidden 裁剪） */}
      {activeMarket && activeStatus && badgeRefs.current[activeMarket] && (
        <IndexSnapshotPopup
          market={activeMarket}
          marketName={activeStatus.name}
          anchorRef={badgeRefs.current[activeMarket]}
          onClose={() => setActiveMarket(null)}
        />
      )}
    </>
  );
}
