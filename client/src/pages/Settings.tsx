import { useState, useEffect, useRef } from "react";
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

// ─── ChatGPT 预览窗口 ─────────────────────────────────────────────────────────
function ChatGPTPreviewPanel({ rpaStatus }: { rpaStatus: any }) {
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeError, setIframeError] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const isConnected = rpaStatus?.status === "ready" || rpaStatus?.status === "working";
  const CHATGPT_URL = "https://chatgpt.com/";
  const CONVERSATION_NAME = "投资manus";
  const MANUS_CONVERSATION = "金融投资";

  const handleReload = () => {
    setIframeError(false);
    setIframeLoading(true);
    setIframeKey(k => k + 1);
  };

  return (
    <div className="space-y-4">

      {/* 状态卡片 */}
      <div className="grid grid-cols-2 gap-3">
        {/* ChatGPT 连接状态 */}
        <div className="p-3 rounded-xl border space-y-2"
          style={{
            background: isConnected ? "oklch(0.72 0.18 155 / 0.06)" : "oklch(0.18 0.005 270)",
            borderColor: isConnected ? "oklch(0.72 0.18 155 / 0.25)" : "oklch(0.28 0.008 270)",
          }}>
          <div className="flex items-center gap-2">
            {isConnected
              ? <Wifi className="w-3.5 h-3.5" style={{ color: "oklch(0.72 0.18 155)" }} />
              : <WifiOff className="w-3.5 h-3.5" style={{ color: "oklch(0.55 0.01 270)" }} />}
            <span className="text-xs font-medium" style={{ color: isConnected ? "oklch(0.72 0.18 155)" : "oklch(0.55 0.01 270)" }}>
              {isConnected ? "RPA 已连接" : "RPA 未连接"}
            </span>
          </div>
          <p className="text-xs" style={{ color: "oklch(0.50 0.01 270)" }}>
            {isConnected ? "ChatGPT 浏览器自动化就绪" : "请在「RPA 连接」标签页建立连接"}
          </p>
        </div>

        {/* 对话框配置 */}
        <div className="p-3 rounded-xl border space-y-2"
          style={{ background: "oklch(0.72 0.18 250 / 0.06)", borderColor: "oklch(0.72 0.18 250 / 0.25)" }}>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-3.5 h-3.5" style={{ color: "oklch(0.72 0.18 250)" }} />
            <span className="text-xs font-medium" style={{ color: "oklch(0.72 0.18 250)" }}>对话框已锁定</span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--chatgpt-color)" }} />
              <span className="text-xs font-mono" style={{ color: "oklch(0.82 0.005 270)" }}>ChatGPT → 「{CONVERSATION_NAME}」</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--manus-color)" }} />
              <span className="text-xs font-mono" style={{ color: "oklch(0.82 0.005 270)" }}>Manus → 「{MANUS_CONVERSATION}」</span>
            </div>
          </div>
        </div>
      </div>

      {/* 操作说明 */}
      <div className="px-3 py-2.5 rounded-xl flex items-start gap-2.5"
        style={{ background: "oklch(0.78 0.18 55 / 0.07)", border: "1px solid oklch(0.78 0.18 55 / 0.2)" }}>
        <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" style={{ color: "oklch(0.78 0.18 55)" }} />
        <p className="text-xs leading-relaxed" style={{ color: "oklch(0.75 0.01 270)" }}>
          请在下方窗口中确认：<strong style={{ color: "oklch(0.92 0.005 270)" }}>① 已登录你的 ChatGPT 账号</strong>，
          <strong style={{ color: "oklch(0.92 0.005 270)" }}>② 当前对话项目为「{CONVERSATION_NAME}」</strong>。
          如需切换，直接在窗口内操作即可。
        </p>
      </div>

      {/* iframe 工具栏 */}
      <div className="flex items-center justify-between px-3 py-2 rounded-t-xl"
        style={{ background: "oklch(0.18 0.005 270)", border: "1px solid oklch(0.25 0.007 270)", borderBottom: "none" }}>
        <div className="flex items-center gap-2">
          <Monitor className="w-3.5 h-3.5" style={{ color: "oklch(0.55 0.01 270)" }} />
          <span className="text-xs font-mono" style={{ color: "oklch(0.55 0.01 270)" }}>chatgpt.com</span>
          {!iframeError && !iframeLoading && (
            <span className="flex items-center gap-1 text-xs" style={{ color: "oklch(0.72 0.18 155)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse" />
              已加载
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleReload}
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors hover:bg-white/8"
            style={{ color: "oklch(0.55 0.01 270)" }}
            title="刷新">
            <RefreshCw className="w-3 h-3" />刷新
          </button>
          <a
            href={CHATGPT_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-colors hover:bg-white/8"
            style={{ color: "oklch(0.55 0.01 270)" }}
            title="在新窗口打开">
            <ExternalLink className="w-3 h-3" />新窗口
          </a>
        </div>
      </div>

      {/* iframe 主体 */}
      <div className="relative rounded-b-xl overflow-hidden"
        style={{
          height: "520px",
          border: "1px solid oklch(0.25 0.007 270)",
          background: "oklch(0.12 0.004 270)",
        }}>

        {/* 加载中遮罩 */}
        {iframeLoading && !iframeError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-3"
            style={{ background: "oklch(0.12 0.004 270)" }}>
            <Loader2 className="w-6 h-6 animate-spin" style={{ color: "oklch(0.72 0.18 250)" }} />
            <p className="text-xs" style={{ color: "oklch(0.55 0.01 270)" }}>正在加载 ChatGPT...</p>
          </div>
        )}

        {/* 加载失败提示 */}
        {iframeError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center z-10 gap-4 px-8 text-center"
            style={{ background: "oklch(0.12 0.004 270)" }}>
            <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: "oklch(0.78 0.18 55 / 0.1)", border: "1px solid oklch(0.78 0.18 55 / 0.2)" }}>
              <AlertTriangle className="w-6 h-6" style={{ color: "oklch(0.78 0.18 55)" }} />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium" style={{ color: "oklch(0.92 0.005 270)" }}>浏览器安全限制</p>
              <p className="text-xs leading-relaxed" style={{ color: "oklch(0.55 0.01 270)" }}>
                ChatGPT 设置了 <code className="px-1 py-0.5 rounded text-xs" style={{ background: "oklch(0.20 0.007 270)" }}>X-Frame-Options</code> 安全头，
                阻止了 iframe 嵌入。请点击「新窗口」按钮在独立标签页中打开并确认登录状态。
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleReload}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
                style={{ background: "oklch(0.22 0.008 270)", border: "1px solid oklch(0.30 0.009 270)", color: "oklch(0.75 0.01 270)" }}>
                <RefreshCw className="w-3 h-3" />重试
              </button>
              <a
                href={CHATGPT_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs transition-colors"
                style={{ background: "oklch(0.72 0.18 250 / 0.15)", border: "1px solid oklch(0.72 0.18 250 / 0.3)", color: "oklch(0.72 0.18 250)" }}>
                <ExternalLink className="w-3 h-3" />在新窗口打开 ChatGPT
              </a>
            </div>
          </div>
        )}

        <iframe
          key={iframeKey}
          ref={iframeRef}
          src={CHATGPT_URL}
          className="w-full h-full border-0"
          title="ChatGPT 预览"
          sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox allow-top-navigation"
          onLoad={() => {
            setIframeLoading(false);
            setIframeError(false);
          }}
          onError={() => {
            setIframeLoading(false);
            setIframeError(true);
          }}
          style={{ display: iframeError ? "none" : "block" }}
        />
      </div>

      {/* 底部提示 */}
      <p className="text-center text-xs" style={{ color: "oklch(0.40 0.008 270)" }}>
        如果 iframe 无法加载，请点击「新窗口」按钮在独立标签页中确认登录状态和对话项目
      </p>
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
              <h2 className="text-sm font-semibold" style={{ color: "oklch(0.92 0.005 270)" }}>四步协作流程</h2>

              {[
                { step: "Step 1", label: "Manus 分解任务", desc: "理解需求，拆解子步骤，识别数据需求，制定执行计划", color: "var(--manus-color)", icon: Bot },
                { step: "Step 2", label: "Manus 执行分析", desc: "数据收集、量化分析、统计计算，生成结构化数据报告", color: "var(--manus-color)", icon: Bot },
                { step: "Step 3", label: "GPT 经理审阅", desc: "审阅数据报告，补充观点和洞察，给出最终表达框架建议（内部，不输出）", color: "var(--chatgpt-color)", icon: Brain },
                { step: "Step 4", label: "Manus 整合输出", desc: "按 GPT 经理建议整合最终结构化 Markdown 回复", color: "var(--manus-color)", icon: Bot },
                { step: "Step 5", label: "GPT 最终审核", desc: "确认质量，直接修正后输出唯一一条最终回复给用户", color: "var(--chatgpt-color)", icon: Brain },
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
