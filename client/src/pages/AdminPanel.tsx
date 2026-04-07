import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  KeyRound, Plus, Trash2, ArrowLeft, Brain,
  Users, Clock, RefreshCw, Copy, Infinity
} from "lucide-react";

export default function AdminPanel() {
  const [, navigate] = useLocation();
  const { user, isAuthenticated } = useAuth();
  const [keyLabel, setKeyLabel] = useState("");
  const [keyExpireDays, setKeyExpireDays] = useState<number>(365);
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // 检查访问权限
  const { data: accessData } = trpc.access.check.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: keys = [], isLoading: keysLoading } = trpc.access.listKeys.useQuery(undefined, {
    enabled: !!accessData?.isOwner,
  });

  const { data: memories = [], isLoading: memoriesLoading } = trpc.chat.getMemory.useQuery(
    { limit: 20 },
    { enabled: !!accessData?.isOwner }
  );

  const generateMutation = trpc.access.generateKey.useMutation({
    onSuccess: (data: { key: string; expiresAt: Date }) => {
      setNewKey(data.key);
      setKeyLabel("");
      setKeyExpireDays(365);
      utils.access.listKeys.invalidate();
      toast.success("密钥已生成！请立即复制保存");
    },
    onError: (err: { message?: string }) => toast.error(err.message ?? "生成失败"),
  });

  const revokeMutation = trpc.access.revokeKey.useMutation({
    onSuccess: () => {
      utils.access.listKeys.invalidate();
      toast.success("密钥已撤销");
    },
    onError: (err: { message?: string }) => toast.error(err.message ?? "撤销失败"),
  });

  const handleGenerate = () => {
    setGenerating(true);
    generateMutation.mutate(
      { label: keyLabel || undefined, expiresInDays: keyExpireDays },
      { onSettled: () => setGenerating(false) }
    );
  };

  const copyKey = (key: string) => {
    navigator.clipboard.writeText(key);
    toast.success("已复制到剪贴板");
  };

  // 非Owner用户重定向
  if (isAuthenticated && accessData && !accessData.isOwner) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">仅限管理员访问</p>
          <Button variant="ghost" className="mt-4" onClick={() => navigate("/research")}>
            返回聊天室
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 顶部导航 */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => navigate("/research")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <h1 className="font-semibold text-foreground">管理面板</h1>
          <Badge variant="secondary" className="text-xs">Owner</Badge>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">

        {/* 生成新密码 */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4">
            <Plus className="w-4 h-4 text-blue-400" />
            生成访问密钥
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">备注标签（可选）</label>
              <Input
                placeholder="例：用户A"
                value={keyLabel}
                onChange={(e) => setKeyLabel(e.target.value)}
                className="bg-background border-border h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">有效天数（默认 365 天）</label>
              <Input
                type="number"
                min={1}
                placeholder="365"
                value={keyExpireDays}
                onChange={(e) => setKeyExpireDays(Number(e.target.value) || 365)}
                className="bg-background border-border h-9 text-sm"
              />
            </div>
          </div>

          <Button
            onClick={handleGenerate}
            disabled={generating}
            className="bg-blue-600 hover:bg-blue-700 text-white h-9 text-sm"
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <RefreshCw className="w-3 h-3 animate-spin" />生成中...
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <KeyRound className="w-3 h-3" />生成密钥
              </span>
            )}
          </Button>

          {/* 新生成的密钥展示（仅此一次） */}
          {newKey && (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-xs text-green-400 mb-1">新密钥已生成（仅显示一次，请立即复制）</p>
                <code className="text-green-300 font-mono text-sm font-bold break-all">{newKey}</code>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyKey(newKey)}
                className="text-green-400 hover:text-green-300 shrink-0"
              >
                <Copy className="w-4 h-4" />
              </Button>
            </div>
          )}
        </div>

        {/* 密码列表 */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-purple-400" />
            访问密钥列表
          </h2>

          {keysLoading ? (
            <p className="text-muted-foreground text-sm">加载中...</p>
          ) : keys.length === 0 ? (
            <p className="text-muted-foreground text-sm">暂无密钥，请先生成</p>
          ) : (
            <div className="space-y-2">
              {keys.map((k: any) => {
                const isExpired = k.expiresAt && new Date(k.expiresAt) < new Date();
                const isActive = !k.revoked && !isExpired;
                return (
                  <div
                    key={k.id}
                    className={`flex items-center justify-between p-3 rounded-xl border ${
                      isActive ? "bg-background border-border" : "bg-muted/30 border-border/50 opacity-50"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="font-medium text-sm text-foreground truncate">{k.label || `密钥 #${k.id}`}</span>
                      {k.boundEmail && (
                        <span className="text-xs text-muted-foreground truncate">— {k.boundEmail}</span>
                      )}
                      {k.revoked ? (
                        <Badge variant="secondary" className="text-xs">已撤销</Badge>
                      ) : isExpired ? (
                        <Badge variant="secondary" className="text-xs">已过期</Badge>
                      ) : k.boundEmail ? (
                        <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs">已激活</Badge>
                      ) : (
                        <Badge className="bg-blue-500/10 text-blue-400 border-blue-500/20 text-xs">未激活</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {k.expiresAt && (
                        <span className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(k.expiresAt).toLocaleDateString("zh-CN")}
                        </span>
                      )}
                      {isActive && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => revokeMutation.mutate({ keyId: k.id })}
                          className="h-7 w-7 text-muted-foreground hover:text-red-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 长期记忆列表 */}
        <div className="bg-card border border-border rounded-2xl p-5">
          <h2 className="font-semibold text-foreground flex items-center gap-2 mb-4">
            <Brain className="w-4 h-4 text-orange-400" />
            跨任务记忆库
            <span className="text-xs text-muted-foreground font-normal">（最近20条任务摘要）</span>
          </h2>

          {memoriesLoading ? (
            <p className="text-muted-foreground text-sm">加载中...</p>
          ) : memories.length === 0 ? (
            <p className="text-muted-foreground text-sm">暂无历史记忆，完成第一个任务后自动生成</p>
          ) : (
            <div className="space-y-3">
              {memories.map((m, i) => (
                <div key={m.id} className="flex gap-3 p-3 bg-background rounded-xl border border-border">
                  <div className="w-6 h-6 rounded-full bg-orange-500/10 border border-orange-500/20 flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs text-orange-400 font-bold">{i + 1}</span>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{m.taskTitle}</p>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{m.summary}</p>
                    <p className="text-xs text-muted-foreground/60 mt-1">
                      {new Date(m.createdAt).toLocaleString("zh-CN")}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
