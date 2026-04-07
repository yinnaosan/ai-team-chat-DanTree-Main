/**
 * TerminalEntry.tsx — DanTree 登录入口页 (/ 路由)
 *
 * 行为规则：
 * - 所有用户访问 / 时，始终看到登录页，不自动跳转
 * - 未登录用户：点「Start Analysis」→ Manus OAuth → 登录后跳转 /research
 * - 已登录用户：点「Enter Terminal」→ 跳转 /research
 */
import { useRef } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { HeroSection } from "@/components/login/HeroSection";
import { LoginSection } from "@/components/login/LoginSection";

export default function TerminalEntry() {
  const [, navigate] = useLocation();
  const { user, loading } = useAuth();
  const loginSectionRef = useRef<HTMLDivElement>(null);

  const scrollToLogin = () => {
    loginSectionRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const handleEnterTerminal = () => {
    navigate("/research");
  };

  return (
    <div style={{ background: "#09090b", overflowY: "auto", height: "100vh" }}>
      <HeroSection onScrollDown={scrollToLogin} />
      <div ref={loginSectionRef}>
        <LoginSection
          isLoggedIn={!loading && !!user}
          onEnterTerminal={handleEnterTerminal}
        />
      </div>
    </div>
  );
}
