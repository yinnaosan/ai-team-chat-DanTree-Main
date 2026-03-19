import { useState, useEffect, useRef, useCallback } from "react";
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
  ArrowLeft, Bot, Brain, Database, Wifi, WifiOff,
  Loader2, Plus, Trash2, CheckCircle2, Circle, Save, MessageSquare,
  ExternalLink, Monitor, RefreshCw, ShieldCheck, AlertTriangle,
} from "lucide-react";

// ─── Tab 类型 ─────────────────────────────────────────────────────────────────
type SettingsTab = "gpt-preview" | "rpa" | "database" | "about";

// ─── ChatGPT 连接引导面板 ──────────────────────────────────────────────────────
function ChatGPTPreviewPanel({ rpaStatus }: { rpaStatus: any }) {
  const isConnected = rpaStatus?.status === "ready" || rpaStatus?.status === "working";
  const CHATGPT_URL = "https://chatgpt.com/";
  const CONVERSATION_NAME = "投资manus";
  const MANUS_CONVERSATION = "金融投资";

  const steps = [
    { num: "1", title: "点击下方按钮打开 ChatGPT", desc: "在新标签页中打开 chatgpt.com" },
    { num: "2", title: "登录你的 ChatGPT 账号", desc: "使用 Google 或邮箱登录" },
    { num: "3", title: "切换到「投资manus」对话项目", desc: "在左侧边栏找到并点击该项目" },
    { num: "4", title: "返回此页面，点击「检测连接」", desc: "RPA 将自动验证登录状态" },
  ];

  return (
    <div className="space-y-5">

      {/* 状态卡片 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-4 rounded-xl border space-y-2"
          style={{
            background: isConnected ? "oklch(0.72 0.18 155 / 0.06)" : "oklch(0.18 0.005 270)",
            borderColor: isConnected ? "oklch(0.72 0.18 155 / 0.25)" : "oklch(0.28 0.008 270)",
          }}>
          <div className="flex items-center gap-2">
            {isConnected
              ? <Wifi className="w-4 h-4" style={{ color: "oklch(0.72 0.18 155)" }} />
              : <WifiOff className="w-4 h-4" style={{ color: "oklch(0.55 0.01 270)" }} />}
            <span className="text-sm font-semibold" style={{ color: isConnected ? "oklch(0.72 0.18 155)" : "oklch(0.55 0.01 270)" }}>
              {isConnected ? "RPA 已连接" : "RPA 未连接"}
            </span>
          </div>
          <p className="text-xs" style={{ color: "oklch(0.50 0.01 270)" }}>
            {isConnected ? "ChatGPT 浏览器自动化就绪，可以开始任务" : "需要先登录 ChatGPT 并建立连接"}
          </p>
        </div>

        <div className="p-4 rounded-xl border space-y-2"
          style={{ background: "oklch(0.72 0.18 250 / 0.06)", borderColor: "oklch(0.72 0.18 250 / 0.25)" }}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4" style={{ color: "oklch(0.72 0.18 250)" }} />
            <span className="text-sm font-semibold" style={{ color: "oklch(0.72 0.18 250)" }}>对话框已锁定</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--chatgpt-color, oklch(0.72 0.18 155))" }} />
              <span className="text-xs font-mono" style={{ color: "oklch(0.82 0.005 270)" }}>ChatGPT → 「{CONVERSATION_NAME}」</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: "var(--manus-color, oklch(0.72 0.18 250))" }} />
              <span className="text-xs font-mono" style={{ color: "oklch(0.82 0.005 270)" }}>Manus → 「{MANUS_CONVERSATION}」</span>
            </div>
          </div>
        </div>
      </div>

      {/* 主操作按钮 */}
      <div className="rounded-2xl overflow-hidden" style={{ border: "1px solid oklch(0.25 0.007 270)" }}>
        {/* 顶部渐变横幅 */}
        <div className="px-6 py-5 flex items-center justify-between"
          style={{ background: "linear-gradient(135deg, oklch(0.15 0.02 270), oklch(0.18 0.015 250))" }}>
          <div className="space-y-1">
            <p className="text-sm font-semibold" style={{ color: "oklch(0.92 0.005 270)" }}>手动登录 ChatGPT</p>
            <p className="text-xs" style={{ color: "oklch(0.55 0.01 270)" }}>在新标签页中打开，登录后返回此页面检测连接</p>
          </div>
          <a
            href={CHATGPT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:opacity-90 active:scale-95"
            style={{ background: "oklch(0.72 0.18 250)", color: "oklch(0.08 0.01 270)" }}>
            <ExternalLink className="w-4 h-4" />
            打开 ChatGPT
          </a>
        </div>

        {/* 步骤说明 */}
        <div className="px-6 py-4 space-y-3" style={{ background: "oklch(0.13 0.004 270)" }}>
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: "oklch(0.45 0.01 270)" }}>操作步骤</p>
          <div className="space-y-2.5">
            {steps.map((step) => (
              <div key={step.num} className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-xs font-bold"
                  style={{ background: "oklch(0.72 0.18 250 / 0.15)", border: "1px solid oklch(0.72 0.18 250 / 0.3)", color: "oklch(0.72 0.18 250)" }}>
                  {step.num}
                </div>
                <div>
                  <p className="text-xs font-medium" style={{ color: "oklch(0.82 0.005 270)" }}>{step.title}</p>
                  <p className="text-xs" style={{ color: "oklch(0.50 0.01 270)" }}>{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 快捷链接 */}
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: "ChatGPT 主页", url: "https://chatgpt.com/", icon: "💬" },
          { label: "Google 登录", url: "https://accounts.google.com/", icon: "🔑" },
          { label: "投资manus 项目", url: "https://chatgpt.com/", icon: "📁" },
        ].map((link) => (
          <a
            key={link.label}
            href={link.url}
            target="_blank"
            rel="noopener noreferrer"
            className="flex flex-col items-center gap-1.5 p-3 rounded-xl text-center transition-all hover:opacity-80"
            style={{ background: "oklch(0.18 0.005 270)", border: "1px solid oklch(0.25 0.007 270)" }}>
            <span className="text-lg">{link.icon}</span>
            <span className="text-xs" style={{ color: "oklch(0.65 0.01 270)" }}>{link.label}</span>
          </a>
        ))}
      </div>

      {/* 提示说明 */}
      <div className="px-4 py-3 rounded-xl flex items-start gap-2.5"
        style={{ background: "oklch(0.72 0.18 250 / 0.05)", border: "1px solid oklch(0.72 0.18 250 / 0.15)" }}>
        <MessageSquare className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "oklch(0.72 0.18 250)" }} />
        <p className="text-xs leading-relaxed" style={{ color: "oklch(0.60 0.01 270)" }}>
          ChatGPT 不支持在网页内嵌入（安全限制），需要在独立标签页中登录。登录后 RPA 会自动检测到登录状态，无需再次操作。
        </p>
      </div>
    </div>
  );
}

// ─── 主组件 ───────────────────────────────────────────────────────────────────
export default function Settings() {
  const { isAuthenticated, loading } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<SettingsTab>("gpt-preview");

  // RPA 配置表单
  const [rpaConfigForm, setRpaConfigForm] = useState({
    chatgptConversationName: "投资manus",
    manusSystemPrompt: "",
  });

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

  const { data: savedRpaConfig } = trpc.rpa.getConfig.useQuery(undefined, { enabled: isAuthenticated });

  useEffect(() => {
    if (savedRpaConfig) {
      setRpaConfigForm({
        chatgptConversationName: savedRpaConfig.chatgptConversationName || "投资manus",
        manusSystemPrompt: savedRpaConfig.manusSystemPrompt || "",
      });
    }
  }, [savedRpaConfig]);

  const { data: rpaStatus, refetch: refetchRpa } = trpc.rpa.getStatus.useQuery(
    undefined,
    { refetchInterval: 5000, enabled: isAuthenticated }
  );

  const { data: dbConnections = [], refetch: refetchConnections } = trpc.dbConnect.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const saveRpaConfigMutation = trpc.rpa.setConfig.useMutation({
    onSuccess: () => toast.success("配置已保存！每次任务将自动使用此设置"),
    onError: (err) => toast.error("保存失败", { description: err.message }),
  });

  const connectRpaMutation = trpc.rpa.connect.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("RPA 连接成功！ChatGPT 浏览器已就绪");
      } else {
        toast.error("RPA 连接失败", { description: (data as any).error || "请确保 ChatGPT 已在浏览器中登录" });
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

  const isConnected = rpaStatus?.status === "ready" || rpaStatus?.status === "working";

  const tabs: { id: SettingsTab; label: string; icon: any; badge?: string }[] = [
    { id: "gpt-preview", label: "ChatGPT 状态", icon: Monitor, badge: isConnected ? "已连接" : undefined },
    { id: "rpa", label: "RPA 连接", icon: Brain },
    { id: "database", label: "数据库", icon: Database },
    { id: "about", label: "关于", icon: Bot },
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

        {/* 连接状态徽标 */}
        <div className="ml-auto flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${isConnected ? "" : ""}`}
            style={{
              background: isConnected ? "oklch(0.72 0.18 155 / 0.1)" : "oklch(0.18 0.005 270)",
              border: `1px solid ${isConnected ? "oklch(0.72 0.18 155 / 0.3)" : "oklch(0.28 0.008 270)"}`,
              color: isConnected ? "oklch(0.72 0.18 155)" : "oklch(0.50 0.01 270)",
            }}>
            {isConnected
              ? <><span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />ChatGPT 已连接</>
              : <><WifiOff className="w-3 h-3" />ChatGPT 未连接</>}
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
                <span className="px-1.5 py-0.5 rounded-full text-xs font-medium"
                  style={{ background: "oklch(0.72 0.18 155 / 0.15)", color: "oklch(0.72 0.18 155)", fontSize: "10px" }}>
                  {badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* ── Tab: ChatGPT 状态预览 ── */}
        {activeTab === "gpt-preview" && (
          <ChatGPTPreviewPanel rpaStatus={rpaStatus} />
        )}

        {/* ── Tab: RPA 连接 ── */}
        {activeTab === "rpa" && (
          <div className="space-y-6">

            {/* 对话框锁定配置 */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4" style={{ color: "var(--chatgpt-color)" }} />
                <h2 className="text-sm font-semibold" style={{ color: "oklch(0.92 0.005 270)" }}>对话框配置</h2>
              </div>

              {/* 锁定提示 */}
              <div className="px-3 py-2.5 rounded-xl flex items-start gap-2.5"
                style={{ background: "oklch(0.72 0.18 250 / 0.06)", border: "1px solid oklch(0.72 0.18 250 / 0.2)" }}>
                <ShieldCheck className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "oklch(0.72 0.18 250)" }} />
                <div className="text-xs space-y-0.5" style={{ color: "oklch(0.75 0.01 270)" }}>
                  <p><strong style={{ color: "oklch(0.92 0.005 270)" }}>对话框名称已硬编码锁定</strong>，无法通过设置修改：</p>
                  <p>• ChatGPT 固定使用 <code className="px-1 rounded" style={{ background: "oklch(0.20 0.007 270)", color: "oklch(0.80 0.15 250)" }}>「投资manus」</code> 对话框</p>
                  <p>• Manus 固定使用 <code className="px-1 rounded" style={{ background: "oklch(0.20 0.007 270)", color: "var(--manus-color)" }}>「金融投资」</code> 对话框</p>
                </div>
              </div>

              <div className="p-4 rounded-xl space-y-4"
                style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.23 0.007 270)" }}>
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium" style={{ color: "oklch(0.75 0.01 270)" }}>
                    Manus 底层指令（System Prompt）
                  </Label>
                  <Textarea
                    value={rpaConfigForm.manusSystemPrompt}
                    onChange={(e) => setRpaConfigForm(f => ({ ...f, manusSystemPrompt: e.target.value }))}
                    placeholder="输入你已经训练好的 Manus 底层指令，例如：你是一个专业的金融投资分析师...（留空使用默认指令）"
                    className="min-h-[120px] text-sm font-mono resize-y"
                    style={{ background: "oklch(0.14 0.004 270)", borderColor: "oklch(0.25 0.007 270)", color: "oklch(0.88 0.005 270)" }}
                  />
                  <p className="text-xs" style={{ color: "oklch(0.45 0.01 270)" }}>
                    这里的指令将作为 Manus 的 System Prompt 注入每次任务。留空则使用默认的金融分析指令。
                  </p>
                </div>

                <Button
                  onClick={() => saveRpaConfigMutation.mutate(rpaConfigForm)}
                  disabled={saveRpaConfigMutation.isPending}
                  className="w-full gap-2"
                  style={{ background: "oklch(0.72 0.18 250)", color: "oklch(0.13 0.005 270)" }}>
                  {saveRpaConfigMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" />保存中...</>
                    : <><Save className="w-4 h-4" />保存配置</>}
                </Button>
              </div>
            </section>

            {/* RPA 连接 */}
            <section className="space-y-3">
              <div className="flex items-center gap-2">
                <Brain className="w-4 h-4" style={{ color: "var(--chatgpt-color)" }} />
                <h2 className="text-sm font-semibold" style={{ color: "oklch(0.92 0.005 270)" }}>ChatGPT RPA 连接</h2>
              </div>

              <div className="p-4 rounded-xl space-y-4"
                style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.23 0.007 270)" }}>
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-sm font-medium" style={{ color: "oklch(0.92 0.005 270)" }}>浏览器自动化状态</p>
                    <p className="text-xs" style={{ color: "oklch(0.50 0.01 270)" }}>
                      通过 RPA 操控已登录的 ChatGPT 账号，无需 API Key
                    </p>
                  </div>
                  <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium`}
                    style={{
                      background: isConnected ? "oklch(0.72 0.18 155 / 0.1)" : "oklch(0.55 0.01 270 / 0.1)",
                      border: `1px solid ${isConnected ? "oklch(0.72 0.18 155 / 0.3)" : "oklch(0.40 0.01 270 / 0.3)"}`,
                      color: isConnected ? "oklch(0.72 0.18 155)" : "oklch(0.55 0.01 270)",
                    }}>
                    {isConnected
                      ? <><span className="w-1.5 h-1.5 rounded-full bg-current" />已连接</>
                      : <><WifiOff className="w-3 h-3" />未连接</>}
                  </div>
                </div>

                {rpaStatus?.error && (
                  <div className="px-3 py-2 rounded-lg text-xs"
                    style={{ background: "oklch(0.55 0.18 25 / 0.1)", border: "1px solid oklch(0.55 0.18 25 / 0.2)", color: "oklch(0.72 0.18 25)" }}>
                    错误：{rpaStatus.error}
                  </div>
                )}

                <div className="p-3 rounded-lg text-xs space-y-1"
                  style={{ background: "oklch(0.14 0.004 270)", border: "1px solid oklch(0.22 0.007 270)", color: "oklch(0.55 0.01 270)" }}>
                  <p className="font-medium" style={{ color: "oklch(0.75 0.01 270)" }}>连接前请确认：</p>
                  <p>1. 已在「ChatGPT 状态」标签页中确认登录状态</p>
                  <p>2. 已导航到「投资manus」对话项目</p>
                  <p>3. 点击下方按钮建立 RPA 连接</p>
                </div>

                <Button
                  onClick={() => connectRpaMutation.mutate()}
                  disabled={connectRpaMutation.isPending || isConnected}
                  className="w-full gap-2"
                  style={isConnected
                    ? { background: "oklch(0.72 0.18 155 / 0.1)", border: "1px solid oklch(0.72 0.18 155 / 0.3)", color: "oklch(0.72 0.18 155)" }
                    : { background: "oklch(0.72 0.18 250)", color: "oklch(0.13 0.005 270)" }}>
                  {connectRpaMutation.isPending
                    ? <><Loader2 className="w-4 h-4 animate-spin" />连接中...</>
                    : isConnected
                    ? <><CheckCircle2 className="w-4 h-4" />已连接</>
                    : <><Wifi className="w-4 h-4" />连接 ChatGPT 浏览器</>}
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
                <Database className="w-4 h-4" style={{ color: "var(--user-color)" }} />
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
                            : <Circle className="w-4 h-4" style={{ color: "oklch(0.45 0.01 270)" }} />}
                        </button>
                        <div>
                          <p className="text-sm font-medium" style={{ color: "oklch(0.92 0.005 270)" }}>{conn.name}</p>
                          <p className="text-xs" style={{ color: "oklch(0.50 0.01 270)" }}>
                            {conn.dbType.toUpperCase()} · {conn.host ? `${conn.host}:${conn.port}/${conn.database}` : conn.filePath}
                          </p>
                        </div>
                      </div>
                      <Button variant="ghost" size="icon" className="h-7 w-7"
                        style={{ color: "oklch(0.50 0.01 270)" }}
                        onClick={() => deleteMutation.mutate({ connId: conn.id })}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <div className="p-4 rounded-xl space-y-4"
                style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.23 0.007 270)" }}>
                <h3 className="text-sm font-medium" style={{ color: "oklch(0.92 0.005 270)" }}>添加新连接</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs" style={{ color: "oklch(0.65 0.008 270)" }}>连接名称</Label>
                    <Input placeholder="例：金融投资数据库" value={dbForm.name}
                      onChange={(e) => setDbForm(f => ({ ...f, name: e.target.value }))}
                      className="h-9 text-sm" style={{ background: "oklch(0.14 0.004 270)", borderColor: "oklch(0.25 0.007 270)" }} />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs" style={{ color: "oklch(0.65 0.008 270)" }}>数据库类型</Label>
                    <Select value={dbForm.dbType} onValueChange={(v) => setDbForm(f => ({ ...f, dbType: v as any }))}>
                      <SelectTrigger className="h-9 text-sm" style={{ background: "oklch(0.14 0.004 270)", borderColor: "oklch(0.25 0.007 270)" }}>
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
                      className="h-9 text-sm font-mono" style={{ background: "oklch(0.14 0.004 270)", borderColor: "oklch(0.25 0.007 270)" }} />
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
                          className="h-9 text-sm" style={{ background: "oklch(0.14 0.004 270)", borderColor: "oklch(0.25 0.007 270)" }} />
                      </div>
                    ))}
                    <div className="col-span-2 space-y-1.5">
                      <Label className="text-xs" style={{ color: "oklch(0.65 0.008 270)" }}>密码</Label>
                      <Input type="password" placeholder="••••••••" value={dbForm.password}
                        onChange={(e) => setDbForm(f => ({ ...f, password: e.target.value }))}
                        className="h-9 text-sm" style={{ background: "oklch(0.14 0.004 270)", borderColor: "oklch(0.25 0.007 270)" }} />
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
                { step: "Step 1", label: "Manus 能力评估 + 分析", desc: "接收任务，判断哪些部分自己擅长（数据/计算/结构化），完成自己负责的分析，并列出交给 GPT 的任务", color: "var(--manus-color)", icon: Bot },
                { step: "Step 2", label: "GPT 处理不擅长部分", desc: "Manus 将主观判断、策略建议、情绪分析等任务交给 ChatGPT，由 GPT 独立处理（内部工作，不直接输出）", color: "var(--chatgpt-color)", icon: Brain },
                { step: "Step 3", label: "GPT 汇总输出", desc: "整合 Manus 数据报告 + GPT 自身分析，由 GPT 决定最终回复框架，输出唯一一条整合回复给用户", color: "var(--chatgpt-color)", icon: Brain },
              ].map(({ step, label, desc, color, icon: Icon }, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5"
                    style={{ background: `${color}20`, border: `1px solid ${color}40`, color }}>
                    {i + 1}
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <Icon className="w-3 h-3" style={{ color }} />
                      <span className="text-xs font-semibold" style={{ color: "oklch(0.88 0.005 270)" }}>{label}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: "oklch(0.20 0.007 270)", color: "oklch(0.50 0.01 270)" }}>{step}</span>
                    </div>
                    <p className="text-xs leading-relaxed" style={{ color: "oklch(0.55 0.01 270)" }}>{desc}</p>
                  </div>
                </div>
              ))}

              <div className="pt-2 mt-2 text-xs text-center" style={{ borderTop: "1px solid oklch(0.22 0.007 270)", color: "oklch(0.42 0.01 270)" }}>
                全程内部流转静默，用户只看到一条最终回复
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
