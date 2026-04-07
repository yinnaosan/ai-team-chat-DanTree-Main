/**
 * TerminalEntry.tsx — DanTree 登录入口页 (/ 路由)
 *
 * 设计来源：ui.zip（HeroSection + LoginSection）
 * 认证方式：Manus OAuth（通过 getLoginUrl() 跳转）
 * 已登录用户：自动重定向到 /research
 */
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { HeroSection } from "@/components/login/HeroSection";
import { LoginSection } from "@/components/login/LoginSection";

export default function TerminalEntry() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const loginSectionRef = useRef<HTMLDivElement>(null);

  // 已登录用户检查访问权限后重定向
  const { data: accessData } = trpc.access.check.useQuery(undefined, {
    enabled: !!user,
  });

  useEffect(() => {
    if (loading) return;
    if (user && accessData?.hasAccess) {
      navigate("/research");
    } else if (user && accessData && !accessData.hasAccess) {
      navigate("/access");
    }
  }, [loading, user, accessData, navigate]);

  const scrollToLogin = () => {
    loginSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 已登录但 accessData 还在加载时，显示极简加载状态
  if (loading || (user && !accessData)) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          background: "#09090b",
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div
            style={{
              width: 24,
              height: 24,
              border: "2px solid #22c55e",
              borderTopColor: "transparent",
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <span
            style={{
              fontSize: 10,
              fontFamily: "'IBM Plex Mono', monospace",
              letterSpacing: "0.12em",
              color: "#3f3f46",
            }}
          >
            INITIALIZING...
          </span>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{ background: "#09090b", overflowY: "auto", height: "100vh" }}>
      {/* Screen 1: Neural network hero + "Institutional Research Intelligence" */}
      <HeroSection onScrollDown={scrollToLogin} />

      {/* Screen 2: "The full picture, always in reach" + Manus OAuth login card */}
      <div ref={loginSectionRef}>
        <LoginSection />
      </div>
    </div>
  );
}
