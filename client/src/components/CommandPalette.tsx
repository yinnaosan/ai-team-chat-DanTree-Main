import { useEffect, useRef, useState, useCallback } from "react";
import { useLocation } from "wouter";
import {
  MessageSquare, FlaskConical, Wallet, BookOpen, Settings,
  LayoutDashboard, Search, Command, ArrowRight, Zap,
  TrendingUp, Brain, Database, Globe, BarChart3, Clock,
  ChevronRight, X
} from "lucide-react";

// ── 命令定义 ────────────────────────────────────────────────────────────────
const COMMANDS = [
  // 导航
  { id: "nav-home",      group: "导航",    icon: LayoutDashboard, label: "首页总览",    desc: "返回主仪表盘",       path: "/",          shortcut: "⌘0" },
  { id: "nav-research", group: "导航", icon: MessageSquare, label: "研究工作台", desc: "Bloomberg 四列研究终端", path: "/research", shortcut: "⌘1" },
  { id: "nav-backtest",  group: "导航",    icon: FlaskConical,    label: "因子回测",    desc: "量化因子回测引擎",   path: "/backtest",  shortcut: "⌘2" },
  { id: "nav-networth",  group: "导航",    icon: Wallet,          label: "资产负债表",  desc: "个人资产组合管理",   path: "/networth",  shortcut: "⌘3" },
  { id: "nav-library",   group: "导航",    icon: BookOpen,        label: "投资知识库",  desc: "量化因子 + 投资定律", path: "/library",  shortcut: "⌘4" },
  { id: "nav-settings",  group: "导航",    icon: Settings,        label: "设置",        desc: "系统设置与记忆管理", path: "/settings",  shortcut: "⌘," },
  // 快速分析
  { id: "analyze-us",    group: "快速分析", icon: TrendingUp,     label: "分析美股",    desc: "输入股票代码开始分析", path: "/research",  query: "分析美股" },
  { id: "analyze-cn",    group: "快速分析", icon: TrendingUp,     label: "分析 A 股",   desc: "输入股票代码开始分析", path: "/research",  query: "分析A股" },
  { id: "analyze-hk",    group: "快速分析", icon: TrendingUp,     label: "分析港股",    desc: "输入股票代码开始分析", path: "/research",  query: "分析港股" },
  { id: "analyze-macro", group: "快速分析", icon: Globe,          label: "宏观经济分析", desc: "美联储、通胀、GDP",  path: "/research",  query: "宏观经济分析" },
  { id: "analyze-crypto",group: "快速分析", icon: Database,       label: "加密货币分析", desc: "BTC、ETH 技术面",   path: "/research",  query: "加密货币分析" },
  { id: "analyze-market",group: "快速分析", icon: BarChart3,      label: "今日市场概览", desc: "全球市场今日表现",   path: "/research",  query: "给我一份今日全球市场概览，包括美股、港股和A股" },
];

// ── 命令面板组件 ────────────────────────────────────────────────────────────
interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigate?: (path: string, query?: string) => void;
}

export function CommandPalette({ open, onClose, onNavigate }: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [selectedIdx, setSelectedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [, navigate] = useLocation();

  // 过滤命令
  const filtered = query.trim()
    ? COMMANDS.filter(c =>
        c.label.toLowerCase().includes(query.toLowerCase()) ||
        c.desc.toLowerCase().includes(query.toLowerCase()) ||
        c.group.toLowerCase().includes(query.toLowerCase())
      )
    : COMMANDS;

  // 分组
  const groups = Array.from(new Set(filtered.map(c => c.group)));

  // 重置选中
  useEffect(() => { setSelectedIdx(0); }, [query]);

  // 打开时聚焦
  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // 键盘导航
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx(i => Math.min(i + 1, filtered.length - 1));
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx(i => Math.max(i - 1, 0));
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const cmd = filtered[selectedIdx];
        if (cmd) executeCommand(cmd);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, filtered, selectedIdx]);

  // 滚动到选中项
  useEffect(() => {
    const el = listRef.current?.querySelector(`[data-idx="${selectedIdx}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [selectedIdx]);

  const executeCommand = useCallback((cmd: typeof COMMANDS[0]) => {
    onClose();
    if (onNavigate) {
      onNavigate(cmd.path, (cmd as any).query);
    } else {
      navigate(cmd.path);
    }
  }, [onClose, onNavigate, navigate]);

  if (!open) return null;

  let globalIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-start justify-center pt-[15vh]"
      style={{ background: "oklch(0% 0 0 / 0.6)", backdropFilter: "blur(4px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl mx-4 rounded-lg overflow-hidden shadow-2xl"
        style={{
          background: "var(--bloomberg-surface-1)",
          border: "1px solid var(--bloomberg-border)",
          boxShadow: "0 24px 80px oklch(0% 0 0 / 0.6), 0 0 0 1px var(--bloomberg-border)"
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* 搜索输入框 */}
        <div className="flex items-center gap-3 px-4 py-3"
          style={{ borderBottom: "1px solid var(--bloomberg-border-dim)" }}>
          <Search className="w-4 h-4 shrink-0" style={{ color: "var(--bloomberg-text-tertiary)" }} />
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="搜索命令、导航、快速分析..."
            className="flex-1 bg-transparent outline-none text-sm"
            style={{
              color: "var(--bloomberg-text-primary)",
              fontFamily: "'Space Grotesk', sans-serif",
            }}
          />
          {query && (
            <button onClick={() => setQuery("")}
              style={{ color: "var(--bloomberg-text-dim)" }}>
              <X className="w-3.5 h-3.5" />
            </button>
          )}
          <span className="bloomberg-command-kbd text-[10px] shrink-0">ESC</span>
        </div>

        {/* 命令列表 */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-sm" style={{ color: "var(--bloomberg-text-dim)" }}>未找到匹配命令</p>
            </div>
          ) : (
            groups.map(group => {
              const groupItems = filtered.filter(c => c.group === group);
              return (
                <div key={group}>
                  <div className="bloomberg-section-label px-4 pt-3 pb-1">{group}</div>
                  {groupItems.map(cmd => {
                    globalIdx++;
                    const idx = globalIdx;
                    const isSelected = selectedIdx === idx;
                    const Icon = cmd.icon;
                    return (
                      <button
                        key={cmd.id}
                        data-idx={idx}
                        onClick={() => executeCommand(cmd)}
                        onMouseEnter={() => setSelectedIdx(idx)}
                        className="w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors"
                        style={{
                          background: isSelected ? "var(--bloomberg-surface-2)" : "transparent",
                          borderLeft: isSelected ? "2px solid var(--bloomberg-gold)" : "2px solid transparent",
                        }}
                      >
                        <div className="w-7 h-7 rounded flex items-center justify-center shrink-0"
                          style={{
                            background: isSelected ? "oklch(78% 0.18 75 / 0.1)" : "var(--bloomberg-surface-2)",
                            border: `1px solid ${isSelected ? "oklch(78% 0.18 75 / 0.2)" : "var(--bloomberg-border-dim)"}`,
                          }}>
                          <Icon className="w-3.5 h-3.5"
                            style={{ color: isSelected ? "var(--bloomberg-gold)" : "var(--bloomberg-text-tertiary)" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-semibold"
                            style={{
                              color: isSelected ? "var(--bloomberg-text-primary)" : "var(--bloomberg-text-secondary)",
                              fontFamily: "'Space Grotesk', sans-serif",
                            }}>
                            {cmd.label}
                          </div>
                          <div className="text-[10px]" style={{ color: "var(--bloomberg-text-dim)" }}>
                            {cmd.desc}
                          </div>
                        </div>
                        {(cmd as any).shortcut && (
                          <span className="bloomberg-command-kbd text-[10px] shrink-0">{(cmd as any).shortcut}</span>
                        )}
                        {isSelected && (
                          <ChevronRight className="w-3 h-3 shrink-0" style={{ color: "var(--bloomberg-gold)" }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>

        {/* 底部提示 */}
        <div className="flex items-center justify-between px-4 py-2"
          style={{ borderTop: "1px solid var(--bloomberg-border-dim)" }}>
          <div className="flex items-center gap-3 text-[10px]" style={{ color: "var(--bloomberg-text-dim)" }}>
            <span className="flex items-center gap-1">
              <span className="bloomberg-command-kbd">↑↓</span> 导航
            </span>
            <span className="flex items-center gap-1">
              <span className="bloomberg-command-kbd">↵</span> 确认
            </span>
            <span className="flex items-center gap-1">
              <span className="bloomberg-command-kbd">ESC</span> 关闭
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--bloomberg-text-dim)" }}>
            <Command className="w-3 h-3" />
            <span>DanTree Terminal</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── 全局命令面板 Provider ───────────────────────────────────────────────────
export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen(o => !o);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  return { open, setOpen };
}
