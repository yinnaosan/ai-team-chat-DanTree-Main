import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import { getLoginUrl } from "@/const";
import { GlobalMarketBar } from "@/components/GlobalMarketBar";
import { useIsMobile } from "@/hooks/useMobile";
import {
  LayoutDashboard, LogOut, PanelLeft, MessageSquare, BookOpen,
  Settings, Wallet, FlaskConical, Command, ChevronRight,
  Activity, Zap, Bell, Microscope
} from "lucide-react";
import { CSSProperties, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { DashboardLayoutSkeleton } from './DashboardLayoutSkeleton';
import { Button } from "./ui/button";

const menuItems = [
  { icon: LayoutDashboard, label: "首页总览", path: "/", shortcut: "⌘0", group: "main" },
  { icon: Microscope, label: "研究工作台", path: "/research", shortcut: "⌘1", group: "main" },
  { icon: MessageSquare, label: "AI 对话模式", path: "/chat", shortcut: "⌘C", group: "main" },
  { icon: FlaskConical, label: "因子回测", path: "/backtest", shortcut: "⌘2", group: "main" },
  { icon: Wallet, label: "资产负债表", path: "/networth", shortcut: "⌘3", group: "main" },
  { icon: Activity, label: "组合决策面板", path: "/portfolio", shortcut: "⌘5", group: "main" },
  { icon: BookOpen, label: "投资知识库", path: "/library", shortcut: "⌘4", group: "main" },
  { icon: Settings, label: "设置", path: "/settings", shortcut: "⌘,", group: "system" },
];

const SIDEBAR_WIDTH_KEY = "sidebar-width";
const DEFAULT_WIDTH = 240;
const MIN_WIDTH = 200;
const MAX_WIDTH = 380;

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem(SIDEBAR_WIDTH_KEY);
    return saved ? parseInt(saved, 10) : DEFAULT_WIDTH;
  });
  const { loading, user } = useAuth();

  useEffect(() => {
    localStorage.setItem(SIDEBAR_WIDTH_KEY, sidebarWidth.toString());
  }, [sidebarWidth]);

  if (loading) {
    return <DashboardLayoutSkeleton />;
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-screen"
        style={{ background: "var(--bloomberg-surface-0)" }}>
        <div className="flex flex-col items-center gap-6 p-8 max-w-sm w-full">
          <div className="w-12 h-12 rounded flex items-center justify-center"
            style={{ background: "oklch(78% 0.18 75 / 0.1)", border: "1px solid oklch(78% 0.18 75 / 0.2)" }}>
            <Zap className="w-6 h-6" style={{ color: "var(--bloomberg-gold)" }} />
          </div>
          <div className="text-center">
            <h1 className="text-lg font-bold mb-2"
              style={{ color: "var(--bloomberg-text-primary)", fontFamily: "'Space Grotesk', sans-serif" }}>
              需要登录
            </h1>
            <p className="text-sm" style={{ color: "var(--bloomberg-text-tertiary)" }}>
              访问 DanTree Terminal 需要身份验证
            </p>
          </div>
          <button
            onClick={() => { window.location.href = getLoginUrl(); }}
            className="bloomberg-btn-primary w-full justify-center py-2.5">
            登录访问
          </button>
        </div>
      </div>
    );
  }

  return (
    <SidebarProvider
      style={{ "--sidebar-width": `${sidebarWidth}px` } as CSSProperties}
    >
      <DashboardLayoutContent setSidebarWidth={setSidebarWidth}>
        {children}
      </DashboardLayoutContent>
    </SidebarProvider>
  );
}

type DashboardLayoutContentProps = {
  children: React.ReactNode;
  setSidebarWidth: (width: number) => void;
};

function DashboardLayoutContent({
  children,
  setSidebarWidth,
}: DashboardLayoutContentProps) {
  const { user, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { state, toggleSidebar } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [isResizing, setIsResizing] = useState(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const activeMenuItem = menuItems.find(item => item.path === location);
  const isMobile = useIsMobile();

  // 键盘快捷键
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        const key = e.key;
        const item = menuItems.find(m => m.shortcut === `⌘${key}` || m.shortcut === `⌘${key.toUpperCase()}`);
        if (item) {
          e.preventDefault();
          setLocation(item.path);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [setLocation]);

  useEffect(() => {
    if (isCollapsed) setIsResizing(false);
  }, [isCollapsed]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      const sidebarLeft = sidebarRef.current?.getBoundingClientRect().left ?? 0;
      const newWidth = e.clientX - sidebarLeft;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => setIsResizing(false);
    if (isResizing) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
    }
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
  }, [isResizing, setSidebarWidth]);

  const mainItems = menuItems.filter(m => m.group === "main");
  const systemItems = menuItems.filter(m => m.group === "system");

  return (
    <>
      <div className="relative" ref={sidebarRef}>
        <Sidebar
          collapsible="icon"
          className="border-r-0"
          disableTransition={isResizing}
          style={{ background: "var(--bloomberg-surface-0)", borderRight: "1px solid var(--bloomberg-border-dim)" } as CSSProperties}
        >
          {/* ── 侧边栏头部 ── */}
          <SidebarHeader className="h-14 justify-center px-3"
            style={{ borderBottom: "1px solid var(--bloomberg-border-dim)" }}>
            <div className="flex items-center gap-2.5 w-full">
              <button
                onClick={toggleSidebar}
                className="h-7 w-7 flex items-center justify-center rounded transition-colors focus:outline-none shrink-0"
                style={{ color: "var(--bloomberg-text-tertiary)" }}
                onMouseEnter={e => (e.currentTarget.style.color = "var(--bloomberg-text-primary)")}
                onMouseLeave={e => (e.currentTarget.style.color = "var(--bloomberg-text-tertiary)")}
                aria-label="Toggle navigation"
              >
                <PanelLeft className="h-4 w-4" />
              </button>
              {!isCollapsed && (
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <img
                    src="https://d2xsxph8kpxj0f.cloudfront.net/310519663340309886/Sfk3bwgkEZLNATmH8kTpez/logo-64_4554290f.png"
                    alt="DanTree"
                    className="w-5 h-5 rounded object-cover shrink-0"
                  />
                  <span className="font-bold tracking-tight truncate text-sm"
                    style={{ color: "var(--bloomberg-text-primary)", fontFamily: "'Space Grotesk', sans-serif" }}>
                    DanTree
                  </span>
                  <span className="bloomberg-badge gold shrink-0">TERM</span>
                </div>
              )}
              {isCollapsed && (
                <div className="flex items-center justify-center w-full">
                  <img
                    src="https://d2xsxph8kpxj0f.cloudfront.net/310519663340309886/Sfk3bwgkEZLNATmH8kTpez/logo-64_4554290f.png"
                    alt="DanTree"
                    className="w-5 h-5 rounded object-cover"
                  />
                </div>
              )}
            </div>
          </SidebarHeader>

          {/* ── 导航菜单 ── */}
          <SidebarContent className="gap-0 py-2">
            {/* 主导航分组 */}
            {!isCollapsed && (
              <div className="bloomberg-section-label px-3 mb-1 mt-1">导航</div>
            )}
            <SidebarMenu className="px-2">
              {mainItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-9 transition-all font-normal rounded"
                      style={{
                        background: isActive ? "oklch(14% 0.025 75)" : "transparent",
                        color: isActive ? "var(--bloomberg-gold)" : "var(--bloomberg-text-tertiary)",
                        borderLeft: isActive ? "2px solid var(--bloomberg-gold)" : "2px solid transparent",
                        paddingLeft: "calc(0.625rem - 2px)",
                      } as CSSProperties}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium">{item.label}</span>
                      {!isCollapsed && (
                        <span className="ml-auto bloomberg-command-kbd text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                          {item.shortcut}
                        </span>
                      )}
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            {/* 系统分组 */}
            {!isCollapsed && (
              <div className="bloomberg-section-label px-3 mb-1 mt-3">系统</div>
            )}
            {isCollapsed && <div className="mt-2" />}
            <SidebarMenu className="px-2">
              {systemItems.map(item => {
                const isActive = location === item.path;
                return (
                  <SidebarMenuItem key={item.path}>
                    <SidebarMenuButton
                      isActive={isActive}
                      onClick={() => setLocation(item.path)}
                      tooltip={item.label}
                      className="h-9 transition-all font-normal rounded"
                      style={{
                        background: isActive ? "oklch(14% 0.025 75)" : "transparent",
                        color: isActive ? "var(--bloomberg-gold)" : "var(--bloomberg-text-tertiary)",
                        borderLeft: isActive ? "2px solid var(--bloomberg-gold)" : "2px solid transparent",
                        paddingLeft: "calc(0.625rem - 2px)",
                      } as CSSProperties}
                    >
                      <item.icon className="h-4 w-4 shrink-0" />
                      <span className="text-sm font-medium">{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>

            {/* 命令面板提示 */}
            {!isCollapsed && (
              <div className="px-3 mt-4">
                <div className="rounded p-2.5 cursor-pointer transition-all"
                  style={{ background: "var(--bloomberg-surface-1)", border: "1px solid var(--bloomberg-border-dim)" }}
                  onClick={() => {
                    const event = new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true });
                    document.dispatchEvent(event);
                  }}>
                  <div className="flex items-center gap-2">
                    <Command className="w-3.5 h-3.5 shrink-0" style={{ color: "var(--bloomberg-text-tertiary)" }} />
                    <span className="text-xs" style={{ color: "var(--bloomberg-text-tertiary)" }}>命令面板</span>
                    <span className="ml-auto bloomberg-command-kbd text-xs">⌘K</span>
                  </div>
                </div>
              </div>
            )}
          </SidebarContent>

          {/* ── 用户信息 ── */}
          <SidebarFooter className="p-2"
            style={{ borderTop: "1px solid var(--bloomberg-border-dim)" }}>
            {/* 系统状态指示器 */}
            {!isCollapsed && (
              <div className="flex items-center gap-2 px-2 py-1.5 mb-1">
                <div className="flex items-center gap-1.5">
                  <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: "var(--bloomberg-green)" }} />
                  <span className="text-xs font-mono" style={{ color: "var(--bloomberg-text-tertiary)" }}>SYSTEM ONLINE</span>
                </div>
              </div>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2.5 rounded px-2 py-2 w-full text-left transition-colors focus:outline-none"
                  style={{ color: "var(--bloomberg-text-secondary)" }}
                  onMouseEnter={e => (e.currentTarget.style.background = "var(--bloomberg-surface-2)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                  <Avatar className="h-7 w-7 shrink-0" style={{ border: "1px solid var(--bloomberg-border)" }}>
                    <AvatarFallback className="text-xs font-bold"
                      style={{ background: "oklch(14% 0.025 75)", color: "var(--bloomberg-gold)", fontSize: "0.75rem" }}>
                      {user?.name?.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate leading-none"
                        style={{ color: "var(--bloomberg-text-primary)" }}>
                        {user?.name || "-"}
                      </p>
                      <p className="text-xs truncate mt-0.5"
                        style={{ color: "var(--bloomberg-text-secondary)" }}>
                        {user?.email || "-"}
                      </p>
                    </div>
                  )}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44"
                style={{ background: "var(--bloomberg-surface-1)", border: "1px solid var(--bloomberg-border)" }}>
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer text-sm"
                  style={{ color: "var(--bloomberg-red)" }}>
                  <LogOut className="mr-2 h-4 w-4" />
                  <span>退出登录</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarFooter>
        </Sidebar>

        {/* 拖拽调整宽度手柄 */}
        <div
          className={`absolute top-0 right-0 w-1 h-full cursor-col-resize transition-colors ${isCollapsed ? "hidden" : ""}`}
          onMouseDown={() => { if (!isCollapsed) setIsResizing(true); }}
          style={{ zIndex: 50, background: isResizing ? "var(--bloomberg-gold)" : "transparent" }}
          onMouseEnter={e => { if (!isCollapsed) e.currentTarget.style.background = "var(--bloomberg-border)"; }}
          onMouseLeave={e => { if (!isResizing) e.currentTarget.style.background = "transparent"; }}
        />
      </div>

      <SidebarInset style={{ background: "var(--bloomberg-surface-0)" }}>
        {/* 移动端顶部栏 */}
        {isMobile && (
          <div className="flex h-12 items-center justify-between px-3 sticky top-0 z-40"
            style={{ background: "oklch(8.5% 0.015 240 / 0.95)", backdropFilter: "blur(20px)", borderBottom: "1px solid var(--bloomberg-border-dim)" }}>
            <div className="flex items-center gap-2">
              <SidebarTrigger className="h-8 w-8 rounded"
                style={{ background: "var(--bloomberg-surface-2)", border: "1px solid var(--bloomberg-border-dim)", color: "var(--bloomberg-text-secondary)" }} />
              <span className="text-sm font-semibold"
                style={{ color: "var(--bloomberg-text-primary)", fontFamily: "'Space Grotesk', sans-serif" }}>
                {activeMenuItem?.label ?? "DanTree"}
              </span>
            </div>
          </div>
        )}
        <main className="flex-1">
          {/* 全局市场状态聚合栏 */}
          <GlobalMarketBar />
          {children}
        </main>
      </SidebarInset>
    </>
  );
}
