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
  const [label, setLabel] = useState("");
  const [maxUses, setMaxUses] = useState<number>(1);
  const [expiresInDays, setExpiresInDays] = useState<number | undefined>(undefined);
  const [generating, setGenerating] = useState(false);
  const [newCode, setNewCode] = useState<string | null>(null);

  const utils = trpc.useUtils();

  // 检查访问权限
  const { data: accessData } = trpc.access.check.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: codes = [], isLoading: codesLoading } = trpc.access.listCodes.useQuery(undefined, {
    enabled: !!accessData?.isOwner,
  });

  const { data: memories = [], isLoading: memoriesLoading } = trpc.chat.getMemory.useQuery(
    { limit: 20 },
    { enabled: !!accessData?.isOwner }
  );

  const generateMutation = trpc.access.generateCode.useMutation({
    onSuccess: (data) => {
      setNewCode(data.code);
      setLabel("");
      setMaxUses(1);
      setExpiresInDays(undefined);
      utils.access.listCodes.invalidate();
      toast.success("访问密码已生成！");
    },
    onError: (err) => toast.error(err.message),
  });

  const revokeMutation = trpc.access.revokeCode.useMutation({
    onSuccess: () => {
      utils.access.listCodes.invalidate();
      toast.success("密码已撤销");
    },
    onError: (err) => toast.error(err.message),
  });

  const handleGenerate = () => {
    setGenerating(true);
    generateMutation.mutate(
      { label: label || undefined, maxUses, expiresInDays },
      { onSettled: () => setGenerating(false) }
    );
  };

  const copyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success("密码已复制到剪贴板");
  };

  // 非Owner用户重定向
  if (isAuthenticated && accessData && !accessData.isOwner) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">仅限管理员访问</p>
          <Button variant="ghost" className="mt-4" onClick={() => navigate("/chat")}>
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
          <Button variant="ghost" size="icon" onClick={() => navigate("/chat")} className="text-muted-foreground hover:text-foreground">
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
            生成访问密码
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">备注（可选）</label>
              <Input
                placeholder="例：给张三"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                className="bg-background border-border h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">最多使用次数（-1=无限）</label>
              <Input
                type="number"
                min={-1}
                value={maxUses}
                onChange={(e) => setMaxUses(Number(e.target.value))}
                className="bg-background border-border h-9 text-sm"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">有效天数（留空=永久）</label>
              <Input
                type="number"
                min={1}
                placeholder="例：30"
                value={expiresInDays ?? ""}
                onChange={(e) => setExpiresInDays(e.target.value ? Number(e.target.value) : undefined)}
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
                <KeyRound className="w-3 h-3" />生成密码
              </span>
            )}
          </Button>

          {/* 新生成的密码展示 */}
          {newCode && (
            <div className="mt-4 p-3 bg-green-500/10 border border-green-500/20 rounded-xl flex items-center justify-between">
              <div>
                <p className="text-xs text-green-400 mb-1">新密码已生成</p>
                <code className="text-green-300 font-mono text-base font-bold tracking-widest">{newCode}</code>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => copyCode(newCode)}
                className="text-green-400 hover:text-green-300"
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
            访问密码列表
          </h2>

          {codesLoading ? (
            <p className="text-muted-foreground text-sm">加载中...</p>
          ) : codes.length === 0 ? (
            <p className="text-muted-foreground text-sm">暂无访问密码，请先生成</p>
          ) : (
            <div className="space-y-2">
              {codes.map((c) => (
                <div
                  key={c.id}
                  className={`flex items-center justify-between p-3 rounded-xl border ${
                    c.isActive
                      ? "bg-background border-border"
                      : "bg-muted/30 border-border/50 opacity-50"
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <code className="font-mono text-sm text-foreground font-semibold">{c.code}</code>
                    {c.label && (
                      <span className="text-xs text-muted-foreground truncate">— {c.label}</span>
                    )}
                    {c.isActive ? (
                      <Badge className="bg-green-500/10 text-green-400 border-green-500/20 text-xs">有效</Badge>
                    ) : (
                      <Badge variant="secondary" className="text-xs">已撤销</Badge>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      {c.maxUses === -1 ? (
                        <><Infinity className="w-3 h-3" />无限</>
                      ) : (
                        <>{c.usedCount}/{c.maxUses} 次</>
                      )}
                    </span>
                    {c.expiresAt && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(c.expiresAt).toLocaleDateString("zh-CN")}
                      </span>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => copyCode(c.code)}
                      className="h-7 w-7 text-muted-foreground hover:text-foreground"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                    {c.isActive && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => revokeMutation.mutate({ codeId: c.id })}
                        className="h-7 w-7 text-muted-foreground hover:text-red-400"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
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
