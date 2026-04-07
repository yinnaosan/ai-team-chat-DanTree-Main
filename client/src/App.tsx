import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useLocation } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import ChatRoom from "./pages/ChatRoom";
import Settings from "./pages/Settings";
import AccessGate from "./pages/AccessGate";
import AdminPanel from "./pages/AdminPanel";
import InvestmentLibrary from "./pages/InvestmentLibrary";
import NetWorthDashboard from "./pages/NetWorthDashboard";
import FactorBacktest from "./pages/FactorBacktest";
import ResearchWorkspace from "./pages/ResearchWorkspace";
import ResearchWorkspaceVNext from "./pages/ResearchWorkspaceVNext";
import TerminalEntry from "./pages/TerminalEntry";
import LoopTelemetryDashboard from "./pages/LoopTelemetryDashboard";
import PortfolioDashboard from "./pages/PortfolioDashboard";
import PWAInstallBanner from "./components/PWAInstallBanner";
import { CommandPalette, useCommandPalette } from "./components/CommandPalette";
import { WorkspaceProvider } from "./contexts/WorkspaceContext";
import { KeyActivationModal } from "./components/KeyActivationModal";
import { useAuth } from "./_core/hooks/useAuth";
import { trpc } from "./lib/trpc";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={TerminalEntry} />
      <Route path={"/terminal-entry"} component={TerminalEntry} />
      <Route path={"/home"} component={Home} />
      <Route path={"/chat"} component={ChatRoom} />
      <Route path={"/settings"} component={Settings} />
      <Route path={"/access"} component={AccessGate} />
      <Route path={"/admin"} component={AdminPanel} />
      <Route path={"/library"} component={InvestmentLibrary} />
      <Route path={"/networth"} component={NetWorthDashboard} />
      <Route path={"/backtest"} component={FactorBacktest} />
      {/* S3-C: /research 已切换到 VNext（正式主路由） */}
      <Route path={"/research"} component={ResearchWorkspaceVNext} />
      {/* /research-vnext 保留为临时别名，便于回退和检查 */}
      <Route path={"/research-vnext"} component={ResearchWorkspaceVNext} />
      <Route path={"/telemetry"} component={LoopTelemetryDashboard} />
      <Route path={"/portfolio"} component={PortfolioDashboard} />
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function GlobalCommandPalette() {
  const { open, setOpen } = useCommandPalette();
  const [, navigate] = useLocation();
  return (
    <CommandPalette
      open={open}
      onClose={() => setOpen(false)}
      onNavigate={(path, query) => {
        navigate(path);
        if (query) {
          sessionStorage.setItem("commandPaletteQuery", query);
        }
      }}
    />
  );
}

function AccessGuard() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const utils = trpc.useUtils();

  const { data: accessData, isLoading: accessLoading } = trpc.access.check.useQuery(undefined, {
    enabled: isAuthenticated,
    // 每次窗口聚焦时重新检查（密钥可能已过期）
    refetchOnWindowFocus: true,
  });

  // 未登录 / Owner / 已激活 → 不显示弹窗
  if (!isAuthenticated || authLoading || accessLoading) return null;
  if (accessData?.isOwner || accessData?.hasAccess) return null;

  return (
    <KeyActivationModal
      onActivated={() => {
        // 激活成功后刷新 access.check，弹窗消失
        utils.access.check.invalidate();
      }}
    />
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <WorkspaceProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
            <AccessGuard />
            <PWAInstallBanner />
            <GlobalCommandPalette />
          </TooltipProvider>
        </WorkspaceProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
