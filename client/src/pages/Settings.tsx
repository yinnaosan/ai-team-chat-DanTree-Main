import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import {
  ArrowLeft, Bot, Brain, Database, Wifi, WifiOff,
  Loader2, Plus, Trash2, CheckCircle2, Circle
} from "lucide-react";

export default function Settings() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();

  // 数据库连接表单
  const [dbForm, setDbForm] = useState({
    name: "",
    dbType: "mysql" as "mysql" | "postgresql" | "sqlite",
    host: "",
    port: "",
    database: "",
    username: "",
    password: "",
    filePath: "",
  });

  // RPA状态
  const { data: rpaStatus, refetch: refetchRpa } = trpc.rpa.getStatus.useQuery(
    undefined,
    { refetchInterval: 5000, enabled: isAuthenticated }
  );

  // 数据库连接列表
  const { data: dbConnections = [], refetch: refetchConnections } = trpc.dbConnect.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const connectRpaMutation = trpc.rpa.connect.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("RPA 连接成功！ChatGPT 浏览器已就绪");
      } else {
        toast.error("RPA 连接失败", { description: data.error || "请确保 ChatGPT 已在浏览器中登录" });
      }
      refetchRpa();
    },
    onError: (err) => toast.error("连接失败", { description: err.message }),
  });

  const saveDbMutation = trpc.dbConnect.save.useMutation({
    onSuccess: () => {
      toast.success("数据库连接已保存");
      setDbForm({ name: "", dbType: "mysql", host: "", port: "", database: "", username: "", password: "", filePath: "" });
      refetchConnections();
    },
    onError: (err) => toast.error("保存失败", { description: err.message }),
  });

  const setActiveMutation = trpc.dbConnect.setActive.useMutation({
    onSuccess: () => { toast.success("已切换活跃数据库连接"); refetchConnections(); },
    onError: (err) => toast.error("切换失败", { description: err.message }),
  });

  const deleteMutation = trpc.dbConnect.delete.useMutation({
    onSuccess: () => { toast.success("连接已删除"); refetchConnections(); },
    onError: (err) => toast.error("删除失败", { description: err.message }),
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  const handleSaveDb = () => {
    if (!dbForm.name) { toast.error("请输入连接名称"); return; }
    saveDbMutation.mutate({
      name: dbForm.name,
      dbType: dbForm.dbType,
      host: dbForm.host || undefined,
      port: dbForm.port ? parseInt(dbForm.port) : undefined,
      database: dbForm.database || undefined,
      username: dbForm.username || undefined,
      password: dbForm.password || undefined,
      filePath: dbForm.filePath || undefined,
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* 顶部导航 */}
      <header className="border-b border-border px-4 py-3 flex items-center gap-3 bg-card/50">
        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/chat")}>
          <ArrowLeft className="w-4 h-4" />
        </Button>
        <h1 className="text-sm font-semibold text-foreground">设置</h1>
      </header>

      <div className="max-w-2xl mx-auto px-4 py-8 space-y-8">

        {/* RPA 连接设置 */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5" style={{ color: "var(--chatgpt-color)" }} />
            <h2 className="text-base font-semibold text-foreground">ChatGPT RPA 连接</h2>
          </div>
          <div className="p-4 rounded-xl bg-card border border-border space-y-4">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">浏览器自动化状态</p>
                <p className="text-xs text-muted-foreground">
                  通过 RPA 操控你已登录的 ChatGPT 账号，无需 API Key
                </p>
              </div>
              <div className="flex items-center gap-2">
                {rpaStatus?.status === "ready" ? (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-xs text-green-400">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-400" />
                    已连接
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                    <WifiOff className="w-3 h-3" />
                    未连接
                  </div>
                )}
              </div>
            </div>

            {rpaStatus?.error && (
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                错误：{rpaStatus.error}
              </div>
            )}

            <div className="p-3 rounded-lg bg-muted/30 border border-border/50 text-xs text-muted-foreground space-y-1">
              <p className="font-medium text-foreground">连接前请确认：</p>
              <p>1. 已在本平台的沙盒浏览器中打开并登录 ChatGPT</p>
              <p>2. 导航到你已训练好的对话窗口（保留记忆的那个）</p>
              <p>3. 点击下方按钮建立 RPA 连接</p>
            </div>

            <Button
              onClick={() => connectRpaMutation.mutate()}
              disabled={connectRpaMutation.isPending || rpaStatus?.status === "ready"}
              className="w-full gap-2"
            >
              {connectRpaMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />连接中...</>
              ) : rpaStatus?.status === "ready" ? (
                <><CheckCircle2 className="w-4 h-4" />已连接</>
              ) : (
                <><Wifi className="w-4 h-4" />连接 ChatGPT 浏览器</>
              )}
            </Button>
          </div>
        </section>

        {/* 金融数据库连接 */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Database className="w-5 h-5" style={{ color: "var(--user-color)" }} />
            <h2 className="text-base font-semibold text-foreground">金融数据库连接</h2>
          </div>

          {/* 已保存的连接 */}
          {dbConnections.length > 0 && (
            <div className="space-y-2">
              {dbConnections.map((conn) => (
                <div key={conn.id} className="flex items-center justify-between p-3 rounded-xl bg-card border border-border">
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setActiveMutation.mutate({ connId: conn.id })}
                      className="flex-shrink-0"
                    >
                      {conn.isActive ? (
                        <CheckCircle2 className="w-4 h-4 text-green-400" />
                      ) : (
                        <Circle className="w-4 h-4 text-muted-foreground" />
                      )}
                    </button>
                    <div>
                      <p className="text-sm font-medium text-foreground">{conn.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {conn.dbType.toUpperCase()} · {conn.host ? `${conn.host}:${conn.port}/${conn.database}` : conn.filePath}
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    onClick={() => deleteMutation.mutate({ connId: conn.id })}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* 添加新连接 */}
          <div className="p-4 rounded-xl bg-card border border-border space-y-4">
            <h3 className="text-sm font-medium text-foreground">添加新连接</h3>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">连接名称</Label>
                <Input
                  placeholder="例：金融投资数据库"
                  value={dbForm.name}
                  onChange={(e) => setDbForm(f => ({ ...f, name: e.target.value }))}
                  className="h-9 text-sm"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">数据库类型</Label>
                <Select
                  value={dbForm.dbType}
                  onValueChange={(v) => setDbForm(f => ({ ...f, dbType: v as any }))}
                >
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mysql">MySQL</SelectItem>
                    <SelectItem value="postgresql">PostgreSQL</SelectItem>
                    <SelectItem value="sqlite">SQLite</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {dbForm.dbType === "sqlite" ? (
              <div className="space-y-1.5">
                <Label className="text-xs">SQLite 文件路径</Label>
                <Input
                  placeholder="/path/to/finance.db"
                  value={dbForm.filePath}
                  onChange={(e) => setDbForm(f => ({ ...f, filePath: e.target.value }))}
                  className="h-9 text-sm font-mono"
                />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">主机地址</Label>
                  <Input
                    placeholder="localhost"
                    value={dbForm.host}
                    onChange={(e) => setDbForm(f => ({ ...f, host: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">端口</Label>
                  <Input
                    placeholder={dbForm.dbType === "mysql" ? "3306" : "5432"}
                    value={dbForm.port}
                    onChange={(e) => setDbForm(f => ({ ...f, port: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">数据库名</Label>
                  <Input
                    placeholder="finance_db"
                    value={dbForm.database}
                    onChange={(e) => setDbForm(f => ({ ...f, database: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">用户名</Label>
                  <Input
                    placeholder="root"
                    value={dbForm.username}
                    onChange={(e) => setDbForm(f => ({ ...f, username: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <Label className="text-xs">密码</Label>
                  <Input
                    type="password"
                    placeholder="••••••••"
                    value={dbForm.password}
                    onChange={(e) => setDbForm(f => ({ ...f, password: e.target.value }))}
                    className="h-9 text-sm"
                  />
                </div>
              </div>
            )}

            <Button
              onClick={handleSaveDb}
              disabled={saveDbMutation.isPending}
              className="w-full gap-2"
              variant="outline"
            >
              {saveDbMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
              ) : (
                <><Plus className="w-4 h-4" />保存连接</>
              )}
            </Button>
          </div>
        </section>

        {/* 关于 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-foreground">关于协作流程</h2>
          <div className="p-4 rounded-xl bg-card border border-border text-xs text-muted-foreground space-y-2 leading-relaxed">
            <div className="flex items-start gap-2">
              <Bot className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "var(--manus-color)" }} />
              <p><span className="font-medium" style={{ color: "var(--manus-color)" }}>Manus（执行层）</span>：接收任务后，调用内置 LLM 进行数据库查询、文档处理、数据分析和统计，输出结构化执行结果。</p>
            </div>
            <div className="flex items-start gap-2">
              <Brain className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "var(--chatgpt-color)" }} />
              <p><span className="font-medium" style={{ color: "var(--chatgpt-color)" }}>ChatGPT（主管）</span>：通过 RPA 自动化，将 Manus 的分析结果发送到你已登录的 ChatGPT 账号，由你训练好的 ChatGPT 进行二次审查并生成最终汇总报告。</p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
