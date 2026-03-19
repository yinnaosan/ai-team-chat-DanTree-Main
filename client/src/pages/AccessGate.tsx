import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Lock, ShieldCheck, KeyRound } from "lucide-react";

export default function AccessGate() {
  const [, navigate] = useLocation();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);

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
                type="password"
                placeholder="请输入访问密码..."
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="bg-background border-border focus:border-blue-500 text-foreground placeholder:text-muted-foreground h-11"
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
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
