/**
 * TerminalEntry.tsx — DanTree 登录入口页 (/ 路由)
 *
 * 行为规则：
 * - 已登录用户：访问 / 时自动跳转 /research（0次点击）
 * - 未登录/新用户：看到登录页 → 点「Start Analysis」→ OAuth → 登录后跳转 /research（1次点击）
 */
import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { HeroSection } from "@/components/login/HeroSection";
import { LoginSection } from "@/components/login/LoginSection";

export default function TerminalEntry() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const loginSectionRef = useRef<HTMLDivElement>(null);

  // 已登录用户自动跳转到工作台，无需任何点击
  useEffect(() => {
    if (!loading && user) {
      navigate("/research");
    }
  }, [loading, user, navigate]);

  const scrollToLogin = () => {
    loginSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  // 加载中时显示空白（避免闪烁）
  if (loading) {
    return <div style={{ background: "#09090b", height: "100vh" }} />;
  }

  // 已登录时不渲染（useEffect 会跳转）
  if (user) {
    return <div style={{ background: "#09090b", height: "100vh" }} />;
  }

  return (
    <div style={{ background: "#09090b", overflowY: "auto", height: "100vh" }}>
      {/* Screen 1: Neural network hero + "Institutional Research Intelligence" */}
      <HeroSection onScrollDown={scrollToLogin} />

      {/* Screen 2: "The full picture, always in reach" + login card */}
      <div ref={loginSectionRef}>
        <LoginSection />
      </div>
    </div>
  );
}
