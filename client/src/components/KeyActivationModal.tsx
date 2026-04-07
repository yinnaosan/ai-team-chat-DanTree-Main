/**
 * KeyActivationModal — 强制密钥激活弹窗
 *
 * 规则：
 * - 用户登录后，若未激活（或密钥已过期），弹出此弹窗
 * - 弹窗不可关闭（无 X 按钮、无 ESC、无点击外部关闭）
 * - 激活成功后弹窗消失，用户可正常使用系统
 * - Owner 永远不会看到此弹窗
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface KeyActivationModalProps {
  onActivated: () => void;
}

export function KeyActivationModal({ onActivated }: KeyActivationModalProps) {
  const [key, setKey] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const activateMutation = trpc.access.activateKey.useMutation({
    onSuccess: () => {
      toast.success("密钥激活成功，欢迎使用 DanTree");
      onActivated();
    },
    onError: (err: { message?: string }) => {
      toast.error(err.message || "密钥无效，请重试");
      setSubmitting(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = key.trim();
    if (!trimmed) return;
    setSubmitting(true);
    activateMutation.mutate({ key: trimmed });
  };

  return (
    // 全屏遮罩，pointer-events 阻止任何穿透点击
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.82)", backdropFilter: "blur(6px)" }}
      // 阻止点击背景关闭
      onClick={(e) => e.stopPropagation()}
    >
      <div
        className="relative w-full max-w-md mx-4 rounded-2xl p-8 flex flex-col gap-6"
        style={{
          background: "oklch(0.10 0.006 264)",
          border: "1px solid oklch(0.22 0.008 264)",
          boxShadow: "0 24px 64px oklch(0 0 0 / 0.6)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center"
            style={{ background: "oklch(0.60 0.15 250 / 0.15)", border: "1px solid oklch(0.60 0.15 250 / 0.3)" }}
          >
            <KeyRound className="w-7 h-7" style={{ color: "oklch(0.72 0.18 250)" }} />
          </div>
          <div>
            <h2 className="text-lg font-semibold" style={{ color: "oklch(0.92 0.005 264)", fontFamily: "'Inter', sans-serif" }}>
              需要访问密钥
            </h2>
            <p className="text-sm mt-1" style={{ color: "oklch(0.50 0.008 264)", fontFamily: "'Inter', sans-serif" }}>
              请输入您的 DanTree 访问密钥以继续使用。密钥一次激活，在有效期内无需重复输入。
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <Input
            type="text"
            placeholder="输入访问密钥..."
            value={key}
            onChange={(e) => setKey(e.target.value)}
            autoFocus
            autoComplete="off"
            spellCheck={false}
            className="h-11 font-mono text-sm tracking-wider"
            style={{
              background: "oklch(0.14 0.006 264)",
              border: "1px solid oklch(0.28 0.008 264)",
              color: "oklch(0.90 0.005 264)",
            }}
            onKeyDown={(e) => {
              // 阻止 ESC 关闭任何父级对话框
              if (e.key === "Escape") e.preventDefault();
            }}
          />
          <Button
            type="submit"
            disabled={submitting || !key.trim()}
            className="h-11 font-medium text-sm"
            style={{
              background: submitting || !key.trim() ? "oklch(0.28 0.008 264)" : "oklch(0.60 0.15 250)",
              color: submitting || !key.trim() ? "oklch(0.50 0.008 264)" : "white",
              transition: "all 0.2s",
            }}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />激活中...</>
            ) : (
              <><ShieldCheck className="w-4 h-4 mr-2" />激活密钥</>
            )}
          </Button>
        </form>

        {/* Footer hint */}
        <p className="text-xs text-center" style={{ color: "oklch(0.38 0.006 264)", fontFamily: "'Inter', sans-serif" }}>
          没有密钥？请联系 DanTree 管理员获取访问授权。
        </p>
      </div>
    </div>
  );
}
