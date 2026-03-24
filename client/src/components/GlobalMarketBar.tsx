/**
 * GlobalMarketBar.tsx
 * DashboardLayout 顶部全局市场状态聚合栏
 * 显示：A股 | 港股 | 美股 | 英股 | 德股 | 法股 的实时开闭市状态
 * 每 60 秒自动刷新
 */

import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";

// ─── 类型 ────────────────────────────────────────────────────────────────────

type TradingSession =
  | "trading" | "pre_auction" | "post_auction"
  | "pre_market" | "post_market" | "lunch" | "closed";

interface MarketStatus {
  market: string;
  name: string;
  session: TradingSession;
  isOpen: boolean;
  localTime: string;
  timezone: string;
  pollIntervalMs: number;
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

// 三色系统：绿色（交易中）/ 黄色（竞价/盘前/盘后）/ 灰色（午休/休市）
function getSessionStyle(session: TradingSession): {
  dot: string;
  text: string;
  bg: string;
  border: string;
} {
  if (session === "trading") {
    return {
      dot:    "bg-green-500",
      text:   "text-green-400",
      bg:     "rgba(34,197,94,0.08)",
      border: "rgba(34,197,94,0.2)",
    };
  }
  if (session === "pre_auction" || session === "post_auction") {
    return {
      dot:    "bg-amber-400",
      text:   "text-amber-400",
      bg:     "rgba(245,158,11,0.08)",
      border: "rgba(245,158,11,0.2)",
    };
  }
  if (session === "pre_market" || session === "post_market") {
    return {
      dot:    "bg-blue-400",
      text:   "text-blue-400",
      bg:     "rgba(96,165,250,0.08)",
      border: "rgba(96,165,250,0.2)",
    };
  }
  // lunch / closed
  return {
    dot:    "bg-gray-500",
    text:   "text-gray-500",
    bg:     "rgba(100,100,100,0.06)",
    border: "rgba(100,100,100,0.15)",
  };
}

// ─── 单个市场徽章 ────────────────────────────────────────────────────────────

function MarketBadge({ status }: { status: MarketStatus }) {
  const style = getSessionStyle(status.session);
  const label = SESSION_LABEL[status.session] ?? status.session;

  // 市场简称
  const SHORT_NAME: Record<string, string> = {
    CN: "A股",
    HK: "港股",
    US: "美股",
    GB: "英股",
    DE: "德股",
    FR: "法股",
  };
  const shortName = SHORT_NAME[status.market] ?? status.market;

  return (
    <div
      className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-mono whitespace-nowrap select-none"
      style={{ background: style.bg, border: `1px solid ${style.border}` }}
      title={`${status.name} · ${status.localTime} 本地时间`}
    >
      {/* 状态点 */}
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${style.dot} ${status.session === "trading" ? "animate-pulse" : ""}`}
      />
      {/* 市场名 */}
      <span className="text-gray-300 font-medium">{shortName}</span>
      {/* 时段标签 */}
      <span className={`${style.text} opacity-90`}>{label}</span>
      {/* 本地时间 */}
      <span className="text-gray-600 text-[10px]">{status.localTime}</span>
    </div>
  );
}

// ─── 骨架屏 ──────────────────────────────────────────────────────────────────

function MarketBarSkeleton() {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1 overflow-x-auto">
      {[...Array(6)].map((_, i) => (
        <div
          key={i}
          className="h-5 w-20 rounded bg-white/5 animate-pulse flex-shrink-0"
        />
      ))}
    </div>
  );
}

// ─── 主组件 ──────────────────────────────────────────────────────────────────

export function GlobalMarketBar() {
  const [refetchTick, setRefetchTick] = useState(0);

  // 每 60 秒触发一次重新查询
  useEffect(() => {
    const timer = setInterval(() => setRefetchTick(t => t + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const { data, isLoading, isError } = trpc.market.getAllMarketStatuses.useQuery(undefined, {
    // 禁用自动重新获取，由 refetchTick 手动控制
    staleTime: 55_000,
    refetchOnWindowFocus: false,
    // 通过 queryKey 变化触发重新查询
  });

  // 当 refetchTick 变化时重新查询（通过 enabled 切换实现）
  const { data: data2, isLoading: isLoading2 } = trpc.market.getAllMarketStatuses.useQuery(undefined, {
    enabled: refetchTick > 0,
    staleTime: 0,
    refetchOnWindowFocus: false,
  });

  const statuses: MarketStatus[] = (refetchTick > 0 ? data2 : data) as MarketStatus[] ?? [];

  if (isLoading && isLoading2 && refetchTick === 0) {
    return (
      <div className="border-b border-white/5 bg-[#0a0a0f]/80">
        <MarketBarSkeleton />
      </div>
    );
  }

  if (isError || statuses.length === 0) {
    return null; // 静默失败，不显示错误
  }

  return (
    <div
      className="border-b border-white/5 bg-[#0a0a0f]/80 backdrop-blur-sm"
      style={{ minHeight: 28 }}
    >
      <div className="flex items-center gap-1.5 px-3 py-1 overflow-x-auto scrollbar-none">
        {/* 标题 */}
        <span className="text-gray-600 text-[10px] font-mono mr-0.5 flex-shrink-0">全球市场</span>
        {/* 分隔线 */}
        <div className="w-px h-3 bg-white/10 flex-shrink-0" />
        {/* 各市场徽章 */}
        {statuses.map((s) => (
          <MarketBadge key={s.market} status={s} />
        ))}
        {/* 最后更新时间 */}
        <span className="ml-auto text-gray-700 text-[10px] font-mono flex-shrink-0">
          {new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })} 更新
        </span>
      </div>
    </div>
  );
}
