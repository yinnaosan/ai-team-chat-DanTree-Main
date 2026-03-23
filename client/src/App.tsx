import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import ChatRoom from "./pages/ChatRoom";
import Settings from "./pages/Settings";
import AccessGate from "./pages/AccessGate";
import AdminPanel from "./pages/AdminPanel";
import InvestmentLibrary from "./pages/InvestmentLibrary";
import NetWorthDashboard from "./pages/NetWorthDashboard";
import PWAInstallBanner from "./components/PWAInstallBanner";

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
      <Route path={"/404"} component={NotFound} />
      <Route component={NotFound} />
    </Switch>
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
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
