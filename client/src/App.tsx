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
import PWAInstallBanner from "./components/PWAInstallBanner";
import { CommandPalette, useCommandPalette } from "./components/CommandPalette";

function Router() {
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/chat"} component={ChatRoom} />
      <Route path={"/settings"} component={Settings} />
      <Route path={"/access"} component={AccessGate} />
      <Route path={"/admin"} component={AdminPanel} />
      <Route path={"/library"} component={InvestmentLibrary} />
      <Route path={"/networth"} component={NetWorthDashboard} />
      <Route path={"/backtest"} component={FactorBacktest} />
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

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
          <PWAInstallBanner />
          <GlobalCommandPalette />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
