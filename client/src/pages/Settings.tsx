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
  Key, Zap, AlertTriangle, Eye, EyeOff, Shield, Copy, RefreshCw, UserX,
} from "lucide-react";

type SettingsTab = "api" | "database" | "access" | "about";

export default function Settings() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("api");

  // OpenAI API 配置
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [showApiKey, setShowApiKey] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gpt-4o-mini");
  const [manusSystemPrompt, setManusSystemPrompt] = useState("");
  const [userCoreRules, setUserCoreRules] = useState("");
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
      setSelectedModel(savedConfig.openaiModel || "gpt-4o-mini");
      setManusSystemPrompt(savedConfig.manusSystemPrompt || "");
      setUserCoreRules(savedConfig.userCoreRules || "");
    }
  }, [savedConfig]);

  const { data: dbConnections = [], refetch: refetchConnections } = trpc.dbConnect.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  // ─── 访问管理 hooks（必须在所有条件 return 之前）────────────────────────────
  const { data: accessCheck, isLoading: accessCheckLoading } = trpc.access.check.useQuery(undefined, { enabled: isAuthenticated });
  const isOwner = accessCheck?.isOwner ?? false;

  // listCodes 是 ownerProcedure，必须等 isOwner 确认后才能调用
  const { data: accessCodes = [], refetch: refetchCodes } = trpc.access.listCodes.useQuery(
    undefined,
    { enabled: isAuthenticated && isOwner }
  );

  const [codeLabel, setCodeLabel] = useState("");
  const [codeMaxUses, setCodeMaxUses] = useState("1");
  const [codeExpireDays, setCodeExpireDays] = useState("");
  const [generatedCode, setGeneratedCode] = useState<string | null>(null);

  const generateCodeMutation = trpc.access.generateCode.useMutation({
    onSuccess: (data) => {
      setGeneratedCode(data.code);
      setCodeLabel("");
      setCodeMaxUses("1");
      setCodeExpireDays("");
      refetchCodes();
      toast.success("访客密码已生成");
    },
    onError: (err) => toast.error("生成失败", { description: err.message }),
  });

  const revokeCodeMutation = trpc.access.revokeCode.useMutation({
    onSuccess: () => { toast.success("密码已撤销"); refetchCodes(); },
    onError: (err) => toast.error("撤销失败", { description: err.message }),
  });

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

  // 等待 auth 和 accessCheck 都加载完成，防止 Tab 因 isOwner=false 而闪烁消失
  if (loading || (isAuthenticated && accessCheckLoading)) {
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

  const tabs: { id: SettingsTab; label: string; icon: any; badge?: string; ownerOnly?: boolean }[] = [
    { id: "api", label: "ChatGPT API", icon: Key, badge: hasApiKey ? "已配置" : undefined },
    { id: "database", label: "数据库", icon: Database },
    ...(isOwner ? [{ id: "access" as SettingsTab, label: "访问管理", icon: Shield, ownerOnly: true }] : []),
    { id: "about", label: "关于", icon: Bot },
  ];

  const DEFAULT_INVESTMENT_RULES = `### 投资理念（段永平体系）
- 以企业内在价值为核心，不做短线投机
- 买入前问：如果市场关闭10年，我还愿意持有吗？
- 只投资自己真正理解的企业（能力圈原则）
- 安全边际优先，宁可错过也不冒险
- 长期持有优质企业，让复利发挥作用
- 分散风险但不过度分散（集中在最有把握的机会）
- 买的是公司，不是股票代码

### 估值方法
- 优先使用自由现金流折现（DCF），辅以市盈率（PE）、市净率（PB）横向对比
- 合理估值 = 未来3-5年自由现金流现值之和 / 流通股本
- 安全边际要求：买入价不超过合理估值的70%（即30%折扣）
- 对成长型公司：关注ROE、净利润率趋势，而非短期EPS

### 护城河评估（必须逐项检查）
1. 品牌护城河：用户是否愿意为品牌溢价付费？
2. 网络效应：用户越多，产品价值是否越高？
3. 转换成本：客户切换竞争对手的代价有多高？
4. 成本优势：规模效应或独特资源是否带来持续低成本？
5. 无形资产：专利、许可证、政府特许经营权

### 重点关注市场（按优先级）
1. 美国（纳斯达克、NYSE）— 最高优先级
2. 香港（恒生、港股通）
3. 中国大陆（A股、沪深）
4. 欧盟（DAX、CAC40）
5. 英国（FTSE100）
- 分析时必须考虑市场间关联性、异动传导和跨市场影响
- 必须进行逻辑正推（当前→未来）和倒推（结果→原因）双向验证

### 风险控制规则
- 单只股票仓位不超过总资产的20%
- 同一行业仓位不超过总资产的35%
- 必须评估：流动性风险、监管风险、汇率风险、竞争格局变化
- 遇到无法理解的商业模式，直接排除，不做分析

### 回复格式规范（必须执行）
- 每个章节必须有 ## 二级标题
- 关键数字、结论、风险点必须 **加粗**
- 核心判断和投资建议放在 > 引用块中
- 数据对比必须用 Markdown 表格（不少于3列）
- 整体排版有视觉层次，禁止输出纯文本段落
- 中文输出，专业但不晦涩

### 任务执行规范
- 每次任务执行前、执行中、输出前必须自我复查是否遵守以上规则
- 回复末尾必须提供2-3个具体的后续跟进问题，引导用户深入探讨
- 任务之间有上下文关联，需主动引用历史任务结论进行对比和跟进
- 每次任务开头声明：已遵守投资守则 ✓`;

  const MODELS = [
    { value: "gpt-4o-mini", label: "GPT-4o mini", desc: "推荐 · 投资分析性价比最高", badge: "推荐" },
    { value: "gpt-4o", label: "GPT-4o", desc: "强力模型 · 深度分析", badge: "强力" },
    { value: "gpt-4-turbo", label: "GPT-4 Turbo", desc: "高性能 · 复杂任务", badge: "" },
    { value: "gpt-3.5-turbo", label: "GPT-3.5 Turbo", desc: "最经济 · 快速响应", badge: "经济" },
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
              {(tabs.find(t => t.id === id) as any)?.ownerOnly && (
                <span className="px-1.5 py-0.5 rounded-full"
                  style={{ background: "oklch(0.65 0.18 25 / 0.2)", color: "oklch(0.75 0.18 25)", fontSize: "10px", border: "1px solid oklch(0.65 0.18 25 / 0.4)" }}>
                  Owner
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
                    ? `当前模型：${savedConfig?.openaiModel || "gpt-4o-mini"} · ${savedConfig?.openaiApiKey}`
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

            {/* 投资理念 & 任务守则（合并：GPT守则 + Manus数据引擎指令，统一保存） */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4" style={{ color: "oklch(0.72 0.18 250)" }} />
                <h2 className="text-sm font-semibold" style={{ color: "oklch(0.92 0.005 270)" }}>投资理念 & 任务守则</h2>
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full"
                  style={{ background: userCoreRules.trim() ? "oklch(0.72 0.18 155 / 0.12)" : "oklch(0.22 0.007 270)",
                           color: userCoreRules.trim() ? "oklch(0.72 0.18 155)" : "oklch(0.50 0.01 270)",
                           border: `1px solid ${userCoreRules.trim() ? "oklch(0.72 0.18 155 / 0.25)" : "oklch(0.28 0.008 270)"}` }}>
                  {userCoreRules.trim() ? "自定义守则已启用" : "使用默认守则"}
                </span>
              </div>
              <div className="p-4 rounded-xl space-y-4"
                style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.23 0.007 270)" }}>

                {/* GPT + Manus 共同遵守的投资守则 */}
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium" style={{ color: "oklch(0.75 0.01 270)" }}>
                    投资守则（GPT & Manus 最高优先级，每次任务强制注入）
                  </Label>
                  <Textarea
                    value={userCoreRules}
                    onChange={(e) => setUserCoreRules(e.target.value)}
                    placeholder={"空白时自动使用内置的完整段永平价值投资体系守则。\n点击下方「填入默认守则」可查看并编辑完整内容。"}
                    className="min-h-[320px] text-sm font-mono resize-y"
                    style={{ background: "oklch(0.14 0.004 270)", borderColor: "oklch(0.25 0.007 270)", color: "oklch(0.88 0.005 270)" }}
                  />
                  <div className="flex items-center justify-between">
                    <p className="text-xs" style={{ color: "oklch(0.45 0.01 270)" }}>
                      GPT 和 Manus 都必须完全遵守。{userCoreRules.trim() ? `已自定义（${userCoreRules.length} 字符）` : "空白时自动使用内置守则。"}
                    </p>
                    <button
                      type="button"
                      onClick={() => setUserCoreRules(DEFAULT_INVESTMENT_RULES)}
                      className="text-xs px-2 py-1 rounded transition-colors hover:opacity-80"
                      style={{ color: "oklch(0.72 0.18 250)", background: "oklch(0.72 0.18 250 / 0.1)", border: "1px solid oklch(0.72 0.18 250 / 0.25)" }}>
                      填入默认守则
                    </button>
                  </div>
                </div>

                {/* 分隔线 */}
                <div style={{ borderTop: "1px solid oklch(0.23 0.007 270)" }} />

                {/* 全局任务指令（最高优先级） */}
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <Label className="text-xs font-semibold" style={{ color: "oklch(0.82 0.005 270)" }}>
                      全局任务指令
                    </Label>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold" style={{ background: "oklch(0.65 0.18 25 / 0.15)", border: "1px solid oklch(0.65 0.18 25 / 0.4)", color: "oklch(0.75 0.18 25)" }}>
                      GPT & Manus 最高优先级，每次强制注入
                    </span>
                  </div>
                  <Textarea
                    value={manusSystemPrompt}
                    onChange={(e) => setManusSystemPrompt(e.target.value)}
                    placeholder={"输入全局任务指令，例如：\n- 只分析 A 股和港股\n- 关注市盈率 > 15% 的公司\n- 每次必须评估安全边际\n\n空白表示不设置额外全局指令"}
                    className="min-h-[120px] text-sm font-mono resize-y"
                    style={{ background: "oklch(0.13 0.004 270)", borderColor: "oklch(0.30 0.015 25)", color: "oklch(0.88 0.005 270)" }}
                  />
                  <p className="text-xs" style={{ color: "oklch(0.50 0.01 270)" }}>
                    此指令将同时注入 GPT 和 Manus，优先级高于投资守则，每次任务强制执行。
                  </p>
                </div>

                {/* 统一保存按钮 */}
                <div className="flex gap-2 pt-1">
                  {userCoreRules.trim() && (
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (confirm("确认清空自定义守则，恢复使用内置默认守则？")) {
                          setUserCoreRules("");
                          saveConfigMutation.mutate({
                            openaiModel: selectedModel,
                            userCoreRules: null,
                            manusSystemPrompt,
                          });
                        }
                      }}
                      disabled={saveConfigMutation.isPending}
                      className="gap-2 text-sm"
                      style={{ borderColor: "oklch(0.30 0.008 270)", color: "oklch(0.65 0.01 270)", background: "oklch(0.18 0.005 270)" }}>
                      <RefreshCw className="w-3.5 h-3.5" />清空自定义
                    </Button>
                  )}
                  <Button
                    onClick={() => saveConfigMutation.mutate({
                      openaiModel: selectedModel,
                      userCoreRules: userCoreRules.trim() || null,
                      manusSystemPrompt,
                    })}
                    disabled={saveConfigMutation.isPending}
                    className="flex-1 gap-2"
                    style={{ background: "oklch(0.72 0.18 250)", color: "oklch(0.13 0.005 270)" }}>
                    {saveConfigMutation.isPending
                      ? <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
                      : <><Save className="w-4 h-4" />保存守则与指令</>}
                  </Button>
                </div>
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
        {activeTab === "access" && isOwner && (
          <div className="space-y-4">
            {/* 生成新密码 */}
            <div className="p-4 rounded-xl space-y-3"
              style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.23 0.007 270)" }}>
              <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "oklch(0.92 0.005 270)" }}>
                <Plus className="w-4 h-4" style={{ color: "oklch(0.72 0.18 250)" }} />
                生成访客密码
              </h2>
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-3">
                  <Label className="text-xs mb-1 block" style={{ color: "oklch(0.60 0.01 270)" }}>备注标签（可选）</Label>
                  <Input
                    placeholder="如：朋友A"
                    value={codeLabel}
                    onChange={(e) => setCodeLabel(e.target.value)}
                    className="h-8 text-sm"
                    style={{ background: "oklch(0.13 0.005 270)", border: "1px solid oklch(0.25 0.007 270)", color: "oklch(0.88 0.005 270)" }}
                  />
                </div>
                <div>
                  <Label className="text-xs mb-1 block" style={{ color: "oklch(0.60 0.01 270)" }}>使用次数</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="1"
                    value={codeMaxUses}
                    onChange={(e) => setCodeMaxUses(e.target.value)}
                    className="h-8 text-sm"
                    style={{ background: "oklch(0.13 0.005 270)", border: "1px solid oklch(0.25 0.007 270)", color: "oklch(0.88 0.005 270)" }}
                  />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs mb-1 block" style={{ color: "oklch(0.60 0.01 270)" }}>有效天数（留空=永久）</Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="永久有效"
                    value={codeExpireDays}
                    onChange={(e) => setCodeExpireDays(e.target.value)}
                    className="h-8 text-sm"
                    style={{ background: "oklch(0.13 0.005 270)", border: "1px solid oklch(0.25 0.007 270)", color: "oklch(0.88 0.005 270)" }}
                  />
                </div>
              </div>
              <Button
                className="w-full h-8 text-sm font-medium"
                style={{ background: "oklch(0.72 0.18 250)", color: "white" }}
                disabled={generateCodeMutation.isPending}
                onClick={() => generateCodeMutation.mutate({
                  label: codeLabel || undefined,
                  maxUses: parseInt(codeMaxUses) || 1,
                  expiresInDays: codeExpireDays ? parseInt(codeExpireDays) : undefined,
                })}
              >
                {generateCodeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                生成密码
              </Button>

              {/* 显示刚生成的密码 */}
              {generatedCode && (
                <div className="p-3 rounded-lg flex items-center justify-between gap-2"
                  style={{ background: "oklch(0.72 0.18 155 / 0.12)", border: "1px solid oklch(0.72 0.18 155 / 0.4)" }}>
                  <div>
                    <div className="text-xs mb-0.5" style={{ color: "oklch(0.55 0.01 270)" }}>新密码（请立即复制）</div>
                    <div className="font-mono text-base font-bold tracking-widest" style={{ color: "oklch(0.72 0.18 155)" }}>{generatedCode}</div>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="shrink-0"
                    onClick={() => { navigator.clipboard.writeText(generatedCode); toast.success("已复制到剪贴板"); }}
                  >
                    <Copy className="w-4 h-4" style={{ color: "oklch(0.72 0.18 155)" }} />
                  </Button>
                </div>
              )}
            </div>

            {/* 密码列表 */}
            <div className="p-4 rounded-xl space-y-2"
              style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.23 0.007 270)" }}>
              <div className="flex items-center justify-between mb-2">
                <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "oklch(0.92 0.005 270)" }}>
                  <Shield className="w-4 h-4" style={{ color: "oklch(0.72 0.18 250)" }} />
                  已生成密码 ({accessCodes.length})
                </h2>
                <Button size="icon" variant="ghost" onClick={() => refetchCodes()} className="w-6 h-6">
                  <RefreshCw className="w-3 h-3" style={{ color: "oklch(0.55 0.01 270)" }} />
                </Button>
              </div>
              {accessCodes.length === 0 ? (
                <div className="text-xs text-center py-4" style={{ color: "oklch(0.42 0.01 270)" }}>暂无密码，点击上方「生成密码」创建</div>
              ) : (
                <div className="space-y-2">
                  {accessCodes.map((c: any) => (
                    <div key={c.id} className="flex items-center justify-between p-2.5 rounded-lg"
                      style={{ background: "oklch(0.13 0.005 270)", border: "1px solid oklch(0.20 0.007 270)" }}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm font-semibold" style={{ color: c.isRevoked ? "oklch(0.40 0.01 270)" : "oklch(0.88 0.005 270)" }}>{c.code}</span>
                          {c.isRevoked && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "oklch(0.35 0.12 25 / 0.2)", color: "oklch(0.60 0.12 25)" }}>已撤销</span>}
                          {!c.isRevoked && c.usedCount >= c.maxUses && c.maxUses !== -1 && <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "oklch(0.35 0.12 60 / 0.2)", color: "oklch(0.65 0.12 60)" }}>已用完</span>}
                        </div>
                        <div className="text-xs mt-0.5" style={{ color: "oklch(0.45 0.01 270)" }}>
                          {c.label && <span className="mr-2">{c.label}</span>}
                          已用 {c.usedCount}/{c.maxUses === -1 ? "∞" : c.maxUses} 次
                          {c.expiresAt && <span className="ml-2">· 到期 {new Date(c.expiresAt).toLocaleDateString()}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button size="icon" variant="ghost" className="w-7 h-7"
                          onClick={() => { navigator.clipboard.writeText(c.code); toast.success("已复制密码"); }}>
                          <Copy className="w-3.5 h-3.5" style={{ color: "oklch(0.55 0.01 270)" }} />
                        </Button>
                        {!c.isRevoked && (
                          <Button size="icon" variant="ghost" className="w-7 h-7"
                            disabled={revokeCodeMutation.isPending}
                            onClick={() => revokeCodeMutation.mutate({ codeId: c.id })}>
                            <UserX className="w-3.5 h-3.5" style={{ color: "oklch(0.60 0.12 25)" }} />
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 说明 */}
            <div className="p-3 rounded-xl text-xs" style={{ background: "oklch(0.72 0.18 250 / 0.08)", border: "1px solid oklch(0.72 0.18 250 / 0.2)", color: "oklch(0.60 0.01 270)" }}>
              <p className="font-medium mb-1" style={{ color: "oklch(0.72 0.18 250)" }}>使用说明</p>
              <p>· 将密码发给访客，访客登录后输入密码即可访问</p>
              <p>· 使用次数为 1 时，密码使用后立即失效（防止分享）</p>
              <p>· 点击撤销可立即禁止该密码的后续使用</p>
            </div>
          </div>
        )}

        {activeTab === "about" && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl space-y-4"
              style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.23 0.007 270)" }}>
              <h2 className="text-sm font-semibold" style={{ color: "oklch(0.92 0.005 270)" }}>三步串行协作流程</h2>
              {[
                {
                  step: "Step 1 · GPT", label: "GPT 主导规划 + 初步分析",
                  desc: "GPT 判断任务是否为上一对话的延续，制定完整分析框架，并对主观判断、逻辑推理、市场情绪等擅长领域直接开始处理，同时列出 Manus 的数据需求清单",
                  color: "oklch(0.72 0.18 155)", icon: Brain,
                },
                {
                  step: "Step 2 · Manus", label: "Manus 完善任务 + 数据收集",
                  desc: "Manus 先将任务描述专业化补全（补充细节、量化维度），再严格按 GPT 框架收集数据、整理表格，根据任务复杂度自适应输出长度（简单任务约500字，复杂任务不超过2000字）",
                  color: "oklch(0.72 0.18 250)", icon: Bot,
                },
                {
                  step: "Step 3 · GPT", label: "GPT 深度整合，输出最终回复",
                  desc: "GPT 将 Step1 初步分析与 Manus 数据报告深度结合，进行正推（当前→未来）和倒推（结果→原因）双向验证，输出完整投资判断。同一对话框内自动延续上下文，回复末尾提出 2-3 个跟进问题",
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
                全程静默内部流转，用户只看到最终回复 · 同对话框内新消息默认延续上一任务
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
