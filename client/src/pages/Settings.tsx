import { useState, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import {
  ArrowLeft, Bot, Brain, Database,
  Loader2, Plus, Trash2, CheckCircle2, Save, MessageSquare,
  Key, Zap, AlertTriangle, Eye, EyeOff,
} from "lucide-react";

type SettingsTab = "api" | "database" | "about";

export default function Settings() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("api");

  // OpenAI API 配置
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gpt-4.5-mini");
  const [manusSystemPrompt, setManusSystemPrompt] = useState("");
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string; model?: string } | null>(null);

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

  // ─── 数据查询 ───────────────────────────────────────────────────────────────
  const { data: savedConfig } = trpc.rpa.getConfig.useQuery(undefined, { enabled: isAuthenticated });

  useEffect(() => {
    if (savedConfig) {
      setSelectedModel(savedConfig.openaiModel || "gpt-4.5-mini");
      setManusSystemPrompt(savedConfig.manusSystemPrompt || "");
    }
  }, [savedConfig]);

  const { data: dbConnections = [], refetch: refetchConnections } = trpc.dbConnect.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const saveConfigMutation = trpc.rpa.setConfig.useMutation({
    onSuccess: () => {
      toast.success("配置已保存！每次任务将使用此 API Key 和模型");
      setApiKeyInput("");
    },
    onError: (err) => toast.error("保存失败", { description: err.message }),
  });

  const testConnectionMutation = trpc.rpa.testConnection.useMutation({
    onSuccess: (data) => {
      setTestResult(data);
      if (data.ok) toast.success(`连接成功！${data.model} 已就绪`);
      else toast.error("连接失败", { description: data.error });
    },
    onError: (err) => {
      setTestResult({ ok: false, error: err.message });
      toast.error("连接失败", { description: err.message });
    },
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
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(0.13 0.005 270)" }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: "oklch(0.72 0.18 250)" }} />
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

  const hasApiKey = savedConfig?.hasApiKey;

  const tabs: { id: SettingsTab; label: string; icon: any; badge?: string }[] = [
    { id: "api", label: "ChatGPT API", icon: Key, badge: hasApiKey ? "已配置" : undefined },
    { id: "database", label: "数据库", icon: Database },
    { id: "about", label: "关于", icon: Bot },
  ];

  const MODELS = [
    { value: "gpt-4.5-mini", label: "GPT-5.4 mini", desc: "推荐 · 投资分析性价比最高", badge: "推荐" },
    { value: "gpt-4.5", label: "GPT-5.4", desc: "最强模型 · 深度分析", badge: "最强" },
    { value: "gpt-4.5-nano", label: "GPT-5.4 nano", desc: "最经济 · 简单任务", badge: "经济" },
    { value: "gpt-4o", label: "GPT-4o", desc: "稳定成熟 · 备选方案", badge: "" },
    { value: "gpt-4o-mini", label: "GPT-4o mini", desc: "轻量版 · 快速响应", badge: "" },
  ];

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.13 0.005 270)" }}>
      {/* 顶部导航 */}
      <header className="flex items-center gap-3 px-4 py-3 shrink-0"
        style={{ borderBottom: "1px solid oklch(0.20 0.007 270)", background: "oklch(0.15 0.005 270)" }}>
        <button
          onClick={() => navigate("/chat")}
          className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/5"
          style={{ color: "oklch(0.65 0.008 270)" }}>
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-sm font-semibold" style={{ color: "oklch(0.92 0.005 270)", fontFamily: "'Google Sans', sans-serif" }}>设置</h1>
        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
            style={{
              background: hasApiKey ? "oklch(0.72 0.18 155 / 0.1)" : "oklch(0.18 0.005 270)",
              border: `1px solid ${hasApiKey ? "oklch(0.72 0.18 155 / 0.3)" : "oklch(0.28 0.008 270)"}`,
              color: hasApiKey ? "oklch(0.72 0.18 155)" : "oklch(0.50 0.01 270)",
            }}>
            {hasApiKey
              ? <><span className="w-1.5 h-1.5 rounded-full bg-current inline-block mr-1" />GPT API 已配置</>
              : <><Key className="w-3 h-3 mr-1" />GPT API 未配置</>}
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-6">
        {/* 标签页导航 */}
        <div className="flex gap-1 mb-6 p-1 rounded-xl"
          style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.22 0.007 270)" }}>
          {tabs.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                background: activeTab === id ? "oklch(0.22 0.008 270)" : "transparent",
                color: activeTab === id ? "oklch(0.92 0.005 270)" : "oklch(0.55 0.01 270)",
                boxShadow: activeTab === id ? "0 1px 3px oklch(0 0 0 / 0.3)" : "none",
              }}>
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
              {badge && (
                <span className="px-1.5 py-0.5 rounded-full"
                  style={{ background: "oklch(0.72 0.18 155 / 0.15)", color: "oklch(0.72 0.18 155)", fontSize: "10px" }}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab: ChatGPT API 配置 ── */}
        {activeTab === "api" && (
          <div className="space-y-6">
            {/* 当前状态 */}
            <div className="p-4 rounded-xl flex items-center gap-4"
              style={{
                background: hasApiKey ? "oklch(0.72 0.18 155 / 0.06)" : "oklch(0.17 0.005 270)",
                border: `1px solid ${hasApiKey ? "oklch(0.72 0.18 155 / 0.25)" : "oklch(0.23 0.007 270)"}`,
              }}>
              <div className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                style={{ background: hasApiKey ? "oklch(0.72 0.18 155 / 0.15)" : "oklch(0.22 0.007 270)" }}>
                {hasApiKey
                  ? <CheckCircle2 className="w-5 h-5" style={{ color: "oklch(0.72 0.18 155)" }} />
                  : <Key className="w-5 h-5" style={{ color: "oklch(0.50 0.01 270)" }} />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "oklch(0.92 0.005 270)" }}>
                  {hasApiKey ? "OpenAI API Key 已配置" : "尚未配置 OpenAI API Key"}
                </p>
                <p className="text-xs mt-0.5" style={{ color: "oklch(0.55 0.01 270)" }}>
                  {hasApiKey
                    ? `当前模型：${savedConfig?.openaiModel || "gpt-4.5-mini"} · ${savedConfig?.openaiApiKey}`
                    : "配置后，GPT 将作为主大脑主导每次投资分析任务"}
                </p>
              </div>
            </div>

            {/* API Key 输入 */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Key className="w-4 h-4" style={{ color: "oklch(0.72 0.18 250)" }} />
                <h2 className="text-sm font-semibold" style={{ color: "oklch(0.92 0.005 270)" }}>OpenAI API Key</h2>
              </div>
              <div className="p-4 rounded-xl space-y-4"
                style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.23 0.007 270)" }}>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium" style={{ color: "oklch(0.75 0.01 270)" }}>
                    API Key <span style={{ color: "oklch(0.55 0.01 270)" }}>（格式：sk-proj-...）</span>
                  </Label>
                  <div className="relative">
                    <Input
                      type={showApiKey ? "text" : "password"}
                      value={apiKeyInput}
                      onChange={(e) => { setApiKeyInput(e.target.value); setTestResult(null); }}
                      placeholder={hasApiKey ? "输入新 Key 以替换现有配置" : "sk-proj-..."}
                      className="pr-10 text-sm font-mono"
                      style={{ background: "oklch(0.14 0.004 270)", borderColor: "oklch(0.25 0.007 270)", color: "oklch(0.88 0.005 270)" }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-3 top-1/2 -translate-y-1/2"
                      style={{ color: "oklch(0.50 0.01 270)" }}>
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-xs" style={{ color: "oklch(0.45 0.01 270)" }}>
                    前往{" "}
                    <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer"
                      className="underline" style={{ color: "oklch(0.72 0.18 250)" }}>
                      platform.openai.com/api-keys
                    </a>{" "}
                    创建 API Key
                  </p>
                </div>

                {/* 模型选择 */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium" style={{ color: "oklch(0.75 0.01 270)" }}>选择模型</Label>
                  <Select value={selectedModel} onValueChange={setSelectedModel}>
                    <SelectTrigger className="text-sm"
                      style={{ background: "oklch(0.14 0.004 270)", borderColor: "oklch(0.25 0.007 270)", color: "oklch(0.88 0.005 270)" }}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent style={{ background: "oklch(0.18 0.005 270)", borderColor: "oklch(0.28 0.008 270)" }}>
                      {MODELS.map((m) => (
                        <SelectItem key={m.value} value={m.value}>
                          <div className="flex items-center gap-2">
                            <span>{m.label}</span>
                            {m.badge && (
                              <span className="text-xs px-1.5 py-0.5 rounded-full"
                                style={{ background: "oklch(0.72 0.18 250 / 0.15)", color: "oklch(0.72 0.18 250)", fontSize: "10px" }}>
                                {m.badge}
                              </span>
                            )}
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs" style={{ color: "oklch(0.45 0.01 270)" }}>
                    {MODELS.find(m => m.value === selectedModel)?.desc}
                  </p>
                </div>

                {/* 测试结果 */}
                {testResult && (
                  <div className="px-3 py-2 rounded-lg text-xs flex items-center gap-2"
                    style={{
                      background: testResult.ok ? "oklch(0.72 0.18 155 / 0.08)" : "oklch(0.55 0.18 25 / 0.08)",
                      border: `1px solid ${testResult.ok ? "oklch(0.72 0.18 155 / 0.25)" : "oklch(0.55 0.18 25 / 0.25)"}`,
                      color: testResult.ok ? "oklch(0.72 0.18 155)" : "oklch(0.72 0.18 25)",
                    }}>
                    {testResult.ok
                      ? <><CheckCircle2 className="w-3.5 h-3.5 shrink-0" />连接成功！{testResult.model} 已就绪</>
                      : <><AlertTriangle className="w-3.5 h-3.5 shrink-0" />{testResult.error || "连接失败，请检查 API Key"}</>}
                  </div>
                )}

                {/* 操作按钮 */}
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      const key = apiKeyInput.trim();
                      if (!key) { toast.error("请先输入 API Key"); return; }
                      testConnectionMutation.mutate({ apiKey: key, model: selectedModel });
                    }}
                    disabled={testConnectionMutation.isPending || !apiKeyInput.trim()}
                    variant="outline"
                    className="flex-1 gap-2 text-sm"
                    style={{ borderColor: "oklch(0.30 0.008 270)", color: "oklch(0.75 0.01 270)", background: "oklch(0.18 0.005 270)" }}>
                    {testConnectionMutation.isPending
                      ? <><Loader2 className="w-4 h-4 animate-spin" />测试中...</>
                      : <><Zap className="w-4 h-4" />测试连接</>}
                  </Button>
                  <Button
                    onClick={() => saveConfigMutation.mutate({
                      openaiApiKey: apiKeyInput.trim() || undefined,
                      openaiModel: selectedModel,
                      manusSystemPrompt,
                    })}
                    disabled={saveConfigMutation.isPending}
                    className="flex-1 gap-2 text-sm"
                    style={{ background: "oklch(0.72 0.18 250)", color: "oklch(0.13 0.005 270)" }}>
                    {saveConfigMutation.isPending
                      ? <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
                      : <><Save className="w-4 h-4" />保存配置</>}
                  </Button>
                </div>
              </div>
            </section>

            {/* Manus 系统提示词 */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" style={{ color: "oklch(0.72 0.18 250)" }} />
                <h2 className="text-sm font-semibold" style={{ color: "oklch(0.92 0.005 270)" }}>投资理念 & 任务守则</h2>
              </div>
              <div className="p-4 rounded-xl space-y-3"
                style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.23 0.007 270)" }}>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium" style={{ color: "oklch(0.75 0.01 270)" }}>
                    最高优先级指令（每次任务强制注入）
                  </Label>
                  <Textarea
                    value={manusSystemPrompt}
                    onChange={(e) => setManusSystemPrompt(e.target.value)}
                    placeholder={"输入你的投资理念、任务守则、数据引用来源链接等...\n\nManus 和 GPT 在每次任务执行时都必须完全遵守此处内容。"}
                    className="min-h-[160px] text-sm font-mono resize-y"
                    style={{ background: "oklch(0.14 0.004 270)", borderColor: "oklch(0.25 0.007 270)", color: "oklch(0.88 0.005 270)" }}
                  />
                  <p className="text-xs" style={{ color: "oklch(0.45 0.01 270)" }}>
                    此处内容将作为最高优先级指令注入每次任务，Manus 和 GPT 都必须遵守，包括投资理念、数据引用来源（那二十多条链接）等。
                  </p>
                </div>
                <Button
                  onClick={() => saveConfigMutation.mutate({
                    openaiApiKey: apiKeyInput.trim() || undefined,
                    openaiModel: selectedModel,
                    manusSystemPrompt,
                  })}
                  disabled={saveConfigMutation.isPending}
                  className="w-full gap-2"
                  style={{ background: "oklch(0.72 0.18 250)", color: "oklch(0.13 0.005 270)" }}>
                  {saveConfigMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
                    : <><Save className="w-4 h-4" />保存指令</>}
                </Button>
              </div>
            </section>
          </div>
        )}

        {/* ── Tab: 数据库 ── */}
        {activeTab === "database" && (
          <div className="space-y-6">
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4" style={{ color: "oklch(0.72 0.18 250)" }} />
                <h2 className="text-sm font-semibold" style={{ color: "oklch(0.92 0.005 270)" }}>金融数据库连接</h2>
              </div>
              {dbConnections.length > 0 && (
                <div className="space-y-2">
                  {dbConnections.map((conn) => (
                    <div key={conn.id} className="flex items-center justify-between p-3 rounded-xl"
                      style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.23 0.007 270)" }}>
                      <div className="flex items-center gap-3">
                        <button onClick={() => setActiveMutation.mutate({ connId: conn.id })} className="flex-shrink-0">
                          {conn.isActive
                            ? <CheckCircle2 className="w-4 h-4" style={{ color: "oklch(0.72 0.18 155)" }} />
                            : <div className="w-4 h-4 rounded-full border-2" style={{ borderColor: "oklch(0.35 0.008 270)" }} />}
                        </button>
                        <div>
                          <p className="text-sm font-medium" style={{ color: "oklch(0.88 0.005 270)" }}>{conn.name}</p>
                          <p className="text-xs" style={{ color: "oklch(0.50 0.01 270)" }}>
                            {conn.dbType}{conn.host ? ` · ${conn.host}` : ""}{conn.database ? ` · ${conn.database}` : ""}
                          </p>
                        </div>
                      </div>
                      <button onClick={() => deleteMutation.mutate({ connId: conn.id })}
                        className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
                        style={{ color: "oklch(0.50 0.01 270)" }}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="p-4 rounded-xl space-y-3"
                style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.23 0.007 270)" }}>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs" style={{ color: "oklch(0.65 0.008 270)" }}>连接名称</Label>
                    <Input placeholder="我的金融数据库" value={dbForm.name}
                      onChange={(e) => setDbForm(f => ({ ...f, name: e.target.value }))}
                      className="h-9 text-sm"
                      style={{ background: "oklch(0.14 0.004 270)", borderColor: "oklch(0.25 0.007 270)" }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs" style={{ color: "oklch(0.65 0.008 270)" }}>数据库类型</Label>
                    <Select value={dbForm.dbType} onValueChange={(v) => setDbForm(f => ({ ...f, dbType: v as any }))}>
                      <SelectTrigger className="h-9 text-sm"
                        style={{ background: "oklch(0.14 0.004 270)", borderColor: "oklch(0.25 0.007 270)" }}>
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
                    <Label className="text-xs" style={{ color: "oklch(0.65 0.008 270)" }}>SQLite 文件路径</Label>
                    <Input placeholder="/path/to/finance.db" value={dbForm.filePath}
                      onChange={(e) => setDbForm(f => ({ ...f, filePath: e.target.value }))}
                      className="h-9 text-sm font-mono"
                      style={{ background: "oklch(0.14 0.004 270)", borderColor: "oklch(0.25 0.007 270)" }} />
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    {[
                      { label: "主机地址", key: "host", placeholder: "localhost" },
                      { label: "端口", key: "port", placeholder: dbForm.dbType === "mysql" ? "3306" : "5432" },
                      { label: "数据库名", key: "database", placeholder: "finance_db" },
                      { label: "用户名", key: "username", placeholder: "root" },
                    ].map(({ label, key, placeholder }) => (
                      <div key={key} className="space-y-1.5">
                        <Label className="text-xs" style={{ color: "oklch(0.65 0.008 270)" }}>{label}</Label>
                        <Input placeholder={placeholder} value={(dbForm as any)[key]}
                          onChange={(e) => setDbForm(f => ({ ...f, [key]: e.target.value }))}
                          className="h-9 text-sm"
                          style={{ background: "oklch(0.14 0.004 270)", borderColor: "oklch(0.25 0.007 270)" }} />
                      </div>
                    ))}
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs" style={{ color: "oklch(0.65 0.008 270)" }}>密码</Label>
                      <Input type="password" placeholder="••••••••" value={dbForm.password}
                        onChange={(e) => setDbForm(f => ({ ...f, password: e.target.value }))}
                        className="h-9 text-sm"
                        style={{ background: "oklch(0.14 0.004 270)", borderColor: "oklch(0.25 0.007 270)" }} />
                    </div>
                  </div>
                )}
                <Button onClick={handleSaveDb} disabled={saveDbMutation.isPending}
                  className="w-full gap-2" variant="outline"
                  style={{ borderColor: "oklch(0.30 0.009 270)", color: "oklch(0.75 0.01 270)" }}>
                  {saveDbMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
                    : <><Plus className="w-4 h-4" />保存连接</>}
                </Button>
              </div>
            </section>
          </div>
        )}

        {/* ── Tab: 关于 ── */}
        {activeTab === "about" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl space-y-4"
              style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.23 0.007 270)" }}>
              <h2 className="text-sm font-semibold" style={{ color: "oklch(0.92 0.005 270)" }}>三步协作流程</h2>
              {[
                {
                  step: "Step 1", label: "Manus 能力评估 + 分析",
                  desc: "接收任务，判断哪些部分自己擅长（数据/计算/结构化），完成自己负责的分析，并列出交给 GPT 的任务",
                  color: "oklch(0.72 0.18 250)", icon: Bot,
                },
                {
                  step: "Step 2", label: "GPT 处理不擅长部分",
                  desc: "Manus 将主观判断、策略建议、情绪分析等任务交给 ChatGPT API，由 GPT 独立处理（内部工作，不直接输出）",
                  color: "oklch(0.72 0.18 155)", icon: Brain,
                },
                {
                  step: "Step 3", label: "GPT 汇总输出",
                  desc: "整合 Manus 数据报告 + GPT 自身分析，由 GPT 决定最终回复框架，输出唯一一条整合回复给用户",
                  color: "oklch(0.72 0.18 155)", icon: Brain,
                },
              ].map(({ step, label, desc, color, icon: Icon }, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5"
                    style={{ background: `${color.replace(")", " / 0.15)")}`, border: `1px solid ${color.replace(")", " / 0.4)")}`, color }}>
                    {i + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Icon className="w-3 h-3" style={{ color }} />
                      <span className="text-xs font-semibold" style={{ color: "oklch(0.88 0.005 270)" }}>{label}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded"
                        style={{ background: "oklch(0.20 0.007 270)", color: "oklch(0.50 0.01 270)" }}>{step}</span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: "oklch(0.55 0.01 270)" }}>{desc}</p>
                  </div>
                </div>
              ))}
              <div className="pt-2 mt-2 text-xs text-center"
                style={{ borderTop: "1px solid oklch(0.22 0.007 270)", color: "oklch(0.42 0.01 270)" }}>
                全程内部流转静默，用户只看到一条最终回复
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
