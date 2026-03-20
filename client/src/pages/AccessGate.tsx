import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Lock, ShieldCheck, KeyRound, Loader2, ArrowRight } from "lucide-react";
import { getLoginUrl } from "@/const";

export default function AccessGate() {
  const [, navigate] = useLocation();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 检查当前用户的访问权限
  const { data: accessData, isLoading: accessLoading } = trpc.access.check.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  // 已登录且已有权限（Owner 或已验证访客）→ 直接跳转聊天
  useEffect(() => {
    if (!authLoading && !accessLoading && accessData?.hasAccess) {
      navigate("/chat");
    }
  }, [authLoading, accessLoading, accessData, navigate]);

  const verifyMutation = trpc.access.verify.useMutation({
    onSuccess: () => {
      toast.success("验证成功！欢迎进入 AI 协作平台");
      navigate("/chat");
    },
    onError: (err) => {
      toast.error(err.message || "密码无效，请重试");
      setCode("");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!code.trim()) return;
    setSubmitting(true);
    verifyMutation.mutate({ code: code.trim() }, {
      onSettled: () => setSubmitting(false),
    });
  };

  // 未登录 → 显示登录引导
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-4">
              <ShieldCheck className="w-8 h-8 text-blue-400" />
            </div>
            <h1 className="text-2xl font-bold text-foreground mb-2">访问验证</h1>
            <p className="text-muted-foreground text-sm">
              请先登录你的 Manus 账号，再输入访问密码
            </p>
          </div>
          <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
            <Button
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium"
              onClick={() => window.location.href = getLoginUrl()}
            >
              <ArrowRight className="w-4 h-4 mr-2" />
              登录 Manus 账号
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-4">
              登录后将自动返回此页面完成验证
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 正在加载权限状态
  if (authLoading || accessLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <p className="text-sm text-muted-foreground">正在验证身份...</p>
        </div>
      </div>
    );
  }

  // 已有权限 → useEffect 会跳转，这里显示跳转中
  if (accessData?.hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
          <p className="text-sm text-muted-foreground">正在进入平台...</p>
        </div>
      </div>
    );
  }

  // 已登录但无权限 → 显示密码输入页
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo区域 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20 mb-4">
            <ShieldCheck className="w-8 h-8 text-blue-400" />
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">访问验证</h1>
          <p className="text-muted-foreground text-sm">
            此平台为私有系统，请输入访问密码继续
          </p>
          {user && (
            <p className="text-xs text-muted-foreground mt-2 opacity-60">
              当前账号：{user.name || user.email || user.openId}
            </p>
          )}
        </div>

        {/* 密码输入卡片 */}
        <div className="bg-card border border-border rounded-2xl p-6 shadow-lg">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground flex items-center gap-2">
                <KeyRound className="w-4 h-4 text-muted-foreground" />
                访问密码
              </label>
              <Input
                type="text"
                placeholder="请输入访问密码..."
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="bg-background border-border focus:border-blue-500 text-foreground placeholder:text-muted-foreground h-11 font-mono tracking-widest"
                autoFocus
                disabled={submitting}
              />
            </div>

            <Button
              type="submit"
              className="w-full h-11 bg-blue-600 hover:bg-blue-700 text-white font-medium"
              disabled={submitting || !code.trim()}
            >
              {submitting ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  验证中...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Lock className="w-4 h-4" />
                  进入平台
                </span>
              )}
            </Button>
          </form>

          <p className="text-center text-xs text-muted-foreground mt-4">
            没有密码？请联系平台管理员获取访问权限
          </p>
        </div>

        {/* 底部说明 */}
        <p className="text-center text-xs text-muted-foreground mt-6">
          AI Team Chat · 私有协作平台
        </p>
      </div>
    </div>
  );
}
