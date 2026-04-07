/**
 * TerminalEntry.tsx — DanTree 登录入口页 (/ 路由)
 *
 * 设计来源：ui.zip（HeroSection + LoginSection）
 * 认证方式：Manus OAuth（通过 getLoginUrl() 跳转）
 *
 * 行为规则：
 * - 所有用户（包括已登录）访问 / 时，始终先看到登录页
 * - 未登录：点击「Continue with Manus」→ OAuth 跳转
 * - 已登录：LoginSection 显示「进入终端」按钮，点击后跳转 /research
 * - 不再自动跳转，用户必须主动操作
 */
import { useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { HeroSection } from "@/components/login/HeroSection";
import { LoginSection } from "@/components/login/LoginSection";

export default function TerminalEntry() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const loginSectionRef = useRef<HTMLDivElement>(null);

  // 已登录用户预加载访问权限（不自动跳转，只用于按钮逻辑）
  const { data: accessData } = trpc.access.check.useQuery(undefined, {
    enabled: !!user,
  });

  const scrollToLogin = () => {
    loginSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 已登录用户点击「进入终端」时的处理
  const handleEnterTerminal = () => {
    if (accessData?.hasAccess) {
      navigate("/research");
    } else if (accessData && !accessData.hasAccess) {
      navigate("/access");
    } else {
      // accessData 还在加载，稍后重试
      navigate("/research");
    }
  };

  return (
    <div style={{ background: "#09090b", overflowY: "auto", height: "100vh" }}>
      {/* Screen 1: Neural network hero + "Institutional Research Intelligence" */}
      <HeroSection onScrollDown={scrollToLogin} />

      {/* Screen 2: "The full picture, always in reach" + login card */}
      <div ref={loginSectionRef}>
        <LoginSection
          isLoggedIn={!loading && !!user}
          onEnterTerminal={handleEnterTerminal}
        />
      </div>
    </div>
  );
}
