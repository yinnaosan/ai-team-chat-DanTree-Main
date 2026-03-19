import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { getLoginUrl } from "@/const";
import { useLocation } from "wouter";
import { Bot, Brain, Database, Shield, ArrowRight, Zap, MessageSquare } from "lucide-react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  if (!loading && isAuthenticated) {
    navigate("/chat");
    return null;
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
        {!loading && (
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
            双AI协作 · RPA驱动
          </div>

          {/* Title */}
          <div className="space-y-4">
            <h2 className="text-4xl font-bold text-foreground leading-tight">
              让 Manus 与 ChatGPT
              <br />
              <span className="text-primary">协同工作</span>
            </h2>
            <p className="text-lg text-muted-foreground leading-relaxed">
              Manus 负责数据统筹与执行分析，ChatGPT 作为主管进行二次审查与战略汇总。
              通过 RPA 自动化，无需 API Key，直接操控你已登录的 ChatGPT 账号。
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
              <p className="text-xs text-muted-foreground">数据库查询、文档处理、数据分析与统计，精准高效地完成执行任务。</p>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border space-y-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--chatgpt-bg)", border: "1px solid var(--chatgpt-color)" }}>
                <Brain className="w-4 h-4" style={{ color: "var(--chatgpt-color)" }} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">ChatGPT 主管</h3>
              <p className="text-xs text-muted-foreground">通过 RPA 操控你已登录的 ChatGPT，进行二次检查并输出战略汇总报告。</p>
            </div>

            <div className="p-4 rounded-xl bg-card border border-border space-y-2">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "var(--user-bg)", border: "1px solid var(--user-color)" }}>
                <Database className="w-4 h-4" style={{ color: "var(--user-color)" }} />
              </div>
              <h3 className="text-sm font-semibold text-foreground">金融数据库</h3>
              <p className="text-xs text-muted-foreground">无缝连接你的 MySQL / PostgreSQL / SQLite 金融投资数据库，保留所有历史数据。</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-border px-6 py-4 text-center">
        <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
          <Shield className="w-3 h-3" />
          你的数据和账号完全由你掌控，RPA 仅在本地沙盒中运行
        </p>
      </footer>
    </div>
  );
}
