/**
 * KeyActivationModal — 密钥激活弹窗（居中卡片，不可关闭）
 *
 * 规则：
 * - 用户登录后，若未激活（或密钥已过期），弹出此弹窗
 * - 弹窗不可关闭（无 X 按钮、无 ESC、无点击外部关闭）
 * - 激活成功后弹窗消失，用户可正常使用系统
 * - Owner 永远不会看到此弹窗
 * - 仅「下载」和「退出」按钮在弹窗期间可用
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Loader2, Download, LogOut, AlertTriangle, KeyRound } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/_core/hooks/useAuth";

const LOGO_URL =
  "https://d2xsxph8kpxj0f.cloudfront.net/310519663340309886/Sfk3bwgkEZLNATmH8kTpez/dantree-logo_88164382.png";

interface KeyActivationModalProps {
  onActivated: () => void;
  /** 密钥过期日期（有值时显示过期提示，null 表示首次激活） */
  expiredAt?: Date | null;
}

export function KeyActivationModal({ onActivated, expiredAt }: KeyActivationModalProps) {
  const [key, setKey] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { logout } = useAuth();

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

  const handleDownload = () => {
    window.print();
  };

  const handleSignOut = async () => {
    try {
      await logout();
    } catch {
      window.location.href = "/";
    }
  };

  const expiredDateStr = expiredAt
    ? new Date(expiredAt).toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : null;

  return (
    /* 半透明遮罩，阻止所有穿透点击 */
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.72)", backdropFilter: "blur(8px)" }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* 居中卡片 */}
      <div
        className="relative w-full max-w-[420px] mx-4 rounded-2xl flex flex-col overflow-hidden"
        style={{
          background: "oklch(0.11 0.006 264)",
          border: "1px solid oklch(0.22 0.008 264 / 0.8)",
          boxShadow:
            "0 32px 80px oklch(0 0 0 / 0.65), 0 0 0 1px oklch(1 0 0 / 0.04) inset",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* ── 卡片头部 ── */}
        <div className="flex flex-col items-center gap-3 pt-8 pb-6 px-8 text-center">
          {/* 真实 Logo */}
          <img
            src={LOGO_URL}
            alt="DanTree"
            className="w-12 h-12 rounded-xl object-cover"
            style={{ boxShadow: "0 4px 16px oklch(0 0 0 / 0.4)" }}
          />

          {/* 标题 */}
          <div>
            <h2
              className="text-[17px] font-semibold leading-tight"
              style={{
                color: "oklch(0.93 0.005 264)",
                fontFamily: "'Inter', sans-serif",
                letterSpacing: "-0.01em",
              }}
            >
              Access Required
            </h2>
            <p
              className="text-[13px] mt-1 leading-relaxed"
              style={{
                color: "oklch(0.48 0.008 264)",
                fontFamily: "'Inter', sans-serif",
              }}
            >
              {expiredDateStr
                ? "请输入新密钥以重新激活访问权限"
                : "请输入您的 DanTree 访问密钥以继续使用"}
            </p>
          </div>

          {/* 过期提示（仅密钥过期时显示） */}
          {expiredDateStr && (
            <div
              className="flex items-center gap-2 px-3 py-2 rounded-lg w-full"
              style={{
                background: "oklch(0.65 0.18 60 / 0.10)",
                border: "1px solid oklch(0.65 0.18 60 / 0.25)",
              }}
            >
              <AlertTriangle
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: "oklch(0.75 0.18 60)" }}
              />
              <span
                className="text-[12px] leading-snug text-left"
                style={{
                  color: "oklch(0.75 0.18 60)",
                  fontFamily: "'Inter', sans-serif",
                }}
              >
                您的密钥已于{" "}
                <strong className="font-semibold">{expiredDateStr}</strong> 过期
              </span>
            </div>
          )}
        </div>

        {/* ── 分隔线 ── */}
        <div
          style={{
            height: "1px",
            background: "oklch(0.22 0.008 264 / 0.6)",
            margin: "0 24px",
          }}
        />

        {/* ── 表单区 ── */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 px-8 py-6">
          <div className="relative">
            <KeyRound
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: "oklch(0.45 0.008 264)" }}
            />
            <Input
              type="text"
              placeholder="Enter your access key..."
              value={key}
              onChange={(e) => setKey(e.target.value)}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              className="h-11 pl-9 font-mono text-sm tracking-wider"
              style={{
                background: "oklch(0.14 0.006 264)",
                border: "1px solid oklch(0.28 0.008 264)",
                color: "oklch(0.90 0.005 264)",
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") e.preventDefault();
              }}
            />
          </div>

          <Button
            type="submit"
            disabled={submitting || !key.trim()}
            className="h-11 font-medium text-sm w-full"
            style={{
              background:
                submitting || !key.trim()
                  ? "oklch(0.24 0.008 264)"
                  : "oklch(0.55 0.18 145)",
              color:
                submitting || !key.trim() ? "oklch(0.45 0.008 264)" : "white",
              transition: "all 0.2s",
              border: "none",
            }}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Activating...
              </>
            ) : (
              "Activate Key"
            )}
          </Button>
        </form>

        {/* ── 分隔线 ── */}
        <div
          style={{
            height: "1px",
            background: "oklch(0.22 0.008 264 / 0.6)",
            margin: "0 24px",
          }}
        />

        {/* ── 底部操作区（仅下载 / 退出可用） ── */}
        <div className="flex gap-3 px-8 py-5">
          <Button
            type="button"
            variant="outline"
            className="flex-1 h-10 text-sm font-medium gap-2"
            style={{
              background: "transparent",
              border: "1px solid oklch(0.28 0.008 264)",
              color: "oklch(0.72 0.005 264)",
            }}
            onClick={handleDownload}
          >
            <Download className="w-4 h-4" />
            Download
          </Button>

          <Button
            type="button"
            variant="outline"
            className="flex-1 h-10 text-sm font-medium gap-2"
            style={{
              background: "transparent",
              border: "1px solid oklch(0.45 0.18 25 / 0.35)",
              color: "oklch(0.65 0.18 25)",
            }}
            onClick={handleSignOut}
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>

        {/* ── 底部说明 ── */}
        <p
          className="text-center text-[11px] pb-5 px-8"
          style={{
            color: "oklch(0.35 0.006 264)",
            fontFamily: "'Inter', sans-serif",
          }}
        >
          Other features are disabled until a valid key is activated.
        </p>
      </div>
    </div>
  );
}
