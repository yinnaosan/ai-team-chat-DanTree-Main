import { useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Bot, Brain, Database, Shield, ArrowRight, Zap, MessageSquare, Loader2 } from "lucide-react";

export default function Home() {
  const { loading: authLoading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  // 查询访问权限（仅在已登录时执行）
  const { data: accessData, isLoading: accessLoading } = trpc.access.check.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // 登录后根据权限决定跳转目标
  useEffect(() => {
    if (authLoading || !isAuthenticated) return;
    if (accessLoading) return;
    if (accessData?.hasAccess) {
      // Owner 或已验证访客 → 直接进入聊天
      navigate("/chat");
    } else if (accessData && !accessData.hasAccess) {
      // 已登录但无权限 → 跳转到密码验证页
      navigate("/access");
    }
  }, [authLoading, isAuthenticated, accessLoading, accessData, navigate]);

  // 正在加载或已登录（等待跳转）→ 显示加载状态
  if (!authLoading && isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">正在加载...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-primary/20 flex items-center justify-center">
            <MessageSquare className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-foreground">AI Team Chat</h1>
            <p className="text-xs text-muted-foreground">智能协作平台</p>
          </div>
        </div>
        {!authLoading && (
          <Button
            size="sm"
            onClick={() => window.location.href = getLoginUrl()}
          >
            登录
            <ArrowRight className="w-4 h-4 ml-1" />
          </Button>
        )}
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="max-w-2xl mx-auto space-y-8">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium">
            <Zap className="w-3.5 h-3.5" />
            双AI协作 · 价值投资
          </div>

          {/* Title */}
          <div className="space-y-4">
            <h2 className="text-4xl font-bold text-foreground leading-tight">
              让 Manus 与 ChatGPT
              <br />
              <span className="text-primary">协同工作</span>
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Manus 负责数据统筹与执行分析，ChatGPT 作为主管进行战略汇总。
              严格遵循段永平价值投资体系，为你的投资决策提供专业支持。
            </p>
          </div>

          {/* CTA */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              size="lg"
              className="gap-2"
              onClick={() => window.location.href = getLoginUrl()}
            >
              <MessageSquare className="w-5 h-5" />
              开始协作
            </Button>
          </div>

          {/* Feature Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-12 text-left">
            <div className="p-4 rounded-xl bg-card border border-border space-y-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--manus-bg)", border: "1px solid var(--manus-color)" }}>
                <Bot className="w-4 h-4" style={{ color: "var(--manus-color)" }} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">Manus 执行层</h3>
              <p className="text-xs text-muted-foreground">数据收集、分析与统计，按价值投资视角筛选关键数据，精准高效地完成执行任务。</p>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border space-y-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--chatgpt-bg)", border: "1px solid var(--chatgpt-color)" }}>
                <Brain className="w-4 h-4" style={{ color: "var(--chatgpt-color)" }} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">ChatGPT 主管</h3>
              <p className="text-xs text-muted-foreground">整合 Manus 数据报告，输出战略汇总与投资建议，并提出跟进问题引导深度分析。</p>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border space-y-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--user-bg)", border: "1px solid var(--user-color)" }}>
                <Database className="w-4 h-4" style={{ color: "var(--user-color)" }} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">段永平投资体系</h3>
              <p className="text-xs text-muted-foreground">严格遵循价值投资原则：安全边际、护城河、五大市场，拒绝投机，专注长期价值。</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 text-center">
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <Shield className="w-3 h-3" />
          私有协作平台 · 仅限授权用户访问
        </p>
      </footer>
    </div>
  );
}
