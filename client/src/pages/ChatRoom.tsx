import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import {
  Bot, Brain, User, Settings, Send, Plus, Menu, X,
  Wifi, WifiOff, ChevronRight, LogOut, Shield, Loader2,
  MessageSquare, Database, History
} from "lucide-react";

type MsgRole = "user" | "manus" | "chatgpt" | "system" | "assistant";
interface Msg {
  id: number;
  role: MsgRole;
  content: string;
  taskId?: number | null;
  createdAt: Date;
}
interface TaskGroup {
  taskId: number;
  title: string;
  createdAt: Date;
  msgs: Msg[];
}

// 只展示给用户看的角色：user（用户输入）和assistant（最终整合回复）
const VISIBLE_ROLES: MsgRole[] = ["user", "assistant"];

const ROLE_META: Record<MsgRole, { label: string; abbr: string }> = {
  user:      { label: "你",       abbr: "你" },
  manus:     { label: "Manus",   abbr: "M"  },
  chatgpt:   { label: "ChatGPT", abbr: "G"  },
  system:    { label: "系统",     abbr: "·"  },
  assistant: { label: "AI 回复",  abbr: "AI" },
};

function groupByTask(msgs: Msg[]): TaskGroup[] {
  const map = new Map<number, TaskGroup>();
  // 只处理可见消息
  const visibleMsgs = msgs.filter(m => VISIBLE_ROLES.includes(m.role));
  for (const m of visibleMsgs) {
    if (!m.taskId) continue;
    if (!map.has(m.taskId)) {
      const userMsg = visibleMsgs.find(x => x.taskId === m.taskId && x.role === "user");
      map.set(m.taskId, {
        taskId: m.taskId,
        title: userMsg?.content.slice(0, 55) || `任务 #${m.taskId}`,
        createdAt: m.createdAt,
        msgs: [],
      });
    }
    map.get(m.taskId)!.msgs.push(m);
  }
  return Array.from(map.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function MsgBubble({ msg }: { msg: Msg }) {
  const meta = ROLE_META[msg.role] || ROLE_META.system;
  if (msg.role === "system") {
    return (
      <div className="flex justify-center my-2">
        <div className="px-3 py-1.5 rounded-full text-xs text-center max-w-[85%]"
          style={{ background: "oklch(0.18 0.005 270)", border: "1px solid oklch(0.25 0.007 270)", color: "oklch(0.55 0.01 270)" }}>
          {msg.content}
        </div>
      </div>
    );
  }
  const isUser = msg.role === "user";
  // assistant（最终整合回复）使用 chatgpt 颜色风格
  const colorVar = msg.role === "manus" ? "manus" : (msg.role === "chatgpt" || msg.role === "assistant") ? "chatgpt" : "user";
  return (
    <div className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"} items-start`}>
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5"
        style={{ background: `var(--${colorVar}-bg)`, border: `1.5px solid var(--${colorVar}-border, var(--${colorVar}-color))`, color: `var(--${colorVar}-color)` }}>
        {meta.abbr}
      </div>
      <div className={`flex flex-col gap-0.5 ${isUser ? "items-end" : "items-start"}`} style={{ maxWidth: "75%" }}>
        <div className={`flex items-center gap-2 ${isUser ? "flex-row-reverse" : ""}`}>
          <span className="text-xs font-medium" style={{ color: `var(--${colorVar}-color)` }}>{meta.label}</span>
          <span className="text-xs" style={{ color: "oklch(0.45 0.01 270)" }}>
            {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
          style={{
            background: `var(--${colorVar}-bg)`,
            border: `1px solid var(--${colorVar}-border, var(--${colorVar}-color))`,
            borderBottomRightRadius: isUser ? "0.375rem" : undefined,
            borderBottomLeftRadius: !isUser ? "0.375rem" : undefined,
            color: "oklch(0.92 0.005 270)",
          }}>
          <div className="prose-chat"><Streamdown>{msg.content}</Streamdown></div>
        </div>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5"
        style={{ background: "var(--chatgpt-bg)", border: "1.5px solid var(--chatgpt-color)", color: "var(--chatgpt-color)" }}>
        AI
      </div>
      <div className="flex flex-col gap-0.5">
        <span className="text-xs font-medium" style={{ color: "var(--chatgpt-color)" }}>正在协作中...</span>
        <div className="px-4 py-3 rounded-2xl flex items-center gap-2"
          style={{ background: "var(--chatgpt-bg)", border: "1px solid var(--chatgpt-color)", borderBottomLeftRadius: "0.375rem" }}>
          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--chatgpt-color)" }} />
          <span className="text-xs" style={{ color: "oklch(0.65 0.01 270)" }}>Manus 分析 → ChatGPT 决策 → Manus 校验</span>
        </div>
      </div>
    </div>
  );
}

export default function ChatRoom() {
  const [, navigate] = useLocation();
  const { isAuthenticated, loading: authLoading, logout } = useAuth();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [allMsgs, setAllMsgs] = useState<Msg[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [isTypingManus, setIsTypingManus] = useState(false);
  const [isTypingGpt, setIsTypingGpt] = useState(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const utils = trpc.useUtils();

  const { data: accessData, isLoading: accessLoading } = trpc.access.check.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: rawMsgs, isLoading: msgsLoading } = trpc.chat.getAllMessages.useQuery(undefined, {
    enabled: isAuthenticated && !!accessData?.hasAccess,
    refetchInterval: 3000,
  });

  const { data: rpaStatus } = trpc.rpa.getStatus.useQuery(undefined, {
    enabled: isAuthenticated && !!accessData?.hasAccess,
    refetchInterval: 5000,
  });
  const rpaConnected = rpaStatus?.status === "ready" || rpaStatus?.status === "working";

  const submitMutation = trpc.chat.submitTask.useMutation({
    onSuccess: (data) => {
      setActiveTaskId(data.taskId);
      utils.chat.getAllMessages.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "任务提交失败");
      setSending(false);
      setIsTypingManus(false);
      setIsTypingGpt(false);
    },
  });

  useEffect(() => {
    if (!rawMsgs) return;
    const mapped: Msg[] = rawMsgs.map((m) => ({
      id: m.id,
      role: m.role as MsgRole,
      content: typeof m.content === "string" ? m.content : String(m.content),
      taskId: m.taskId,
      createdAt: new Date(m.createdAt),
    }));
    setAllMsgs(mapped);
    setTaskGroups(groupByTask(mapped));
    const last = mapped[mapped.length - 1];
    if (last?.role === "chatgpt" || last?.content?.includes("❌")) {
      setIsTypingManus(false);
      setIsTypingGpt(false);
      setSending(false);
    }
  }, [rawMsgs]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [allMsgs, isTypingManus, isTypingGpt]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!accessLoading && accessData && !accessData.hasAccess) navigate("/access");
  }, [accessLoading, accessData, navigate]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || sending) return;
    setInput("");
    setSending(true);
    setIsTypingManus(true);
    submitMutation.mutate({ title: text }, {
      onSuccess: () => setTimeout(() => setIsTypingGpt(true), 2500),
    });
  }, [input, sending, submitMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  const displayMsgs = activeTaskId === null
    ? allMsgs
    : allMsgs.filter((m) => m.taskId === activeTaskId || !m.taskId);

  if (authLoading || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(0.13 0.005 270)" }}>
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: "oklch(0.13 0.005 270)" }}>

      {/* ── Sidebar ── */}
      <aside className={`flex flex-col shrink-0 transition-all duration-300 ${sidebarOpen ? "w-64" : "w-0 overflow-hidden"}`}
        style={{ background: "oklch(0.15 0.005 270)", borderRight: "1px solid oklch(0.22 0.007 270)" }}>
        
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-4 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "oklch(0.72 0.18 250 / 0.15)" }}>
              <MessageSquare className="w-4 h-4" style={{ color: "oklch(0.72 0.18 250)" }} />
            </div>
            <span className="text-sm font-semibold" style={{ color: "oklch(0.92 0.005 270)", fontFamily: "'Google Sans', sans-serif" }}>AI Team Chat</span>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="w-7 h-7 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors" style={{ color: "oklch(0.55 0.01 270)" }}>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* New task */}
        <div className="px-3 mb-3 shrink-0">
          <button onClick={() => setActiveTaskId(null)}
            className="w-full h-9 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-colors"
            style={{ background: "oklch(0.72 0.18 250 / 0.1)", border: "1px solid oklch(0.72 0.18 250 / 0.2)", color: "oklch(0.72 0.18 250)" }}>
            <Plus className="w-4 h-4" />新任务
          </button>
        </div>

        {/* History */}
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5">
          <p className="text-xs px-2 py-1.5 flex items-center gap-1.5" style={{ color: "oklch(0.45 0.01 270)" }}>
            <History className="w-3 h-3" />历史对话
          </p>

          <button onClick={() => setActiveTaskId(null)}
            className="w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-2 text-xs transition-colors"
            style={{
              background: activeTaskId === null ? "oklch(0.72 0.18 250 / 0.12)" : "transparent",
              color: activeTaskId === null ? "oklch(0.80 0.15 250)" : "oklch(0.65 0.008 270)",
            }}>
            <MessageSquare className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">全部对话</span>
            <span className="ml-auto opacity-50">{allMsgs.filter(m => m.role === "user").length}</span>
          </button>

          {taskGroups.map((g) => (
            <button key={g.taskId} onClick={() => setActiveTaskId(g.taskId)}
              className="w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-2 text-xs transition-colors"
              style={{
                background: activeTaskId === g.taskId ? "oklch(0.72 0.18 250 / 0.12)" : "transparent",
                color: activeTaskId === g.taskId ? "oklch(0.80 0.15 250)" : "oklch(0.65 0.008 270)",
              }}>
              <ChevronRight className="w-3 h-3 shrink-0 opacity-50" />
              <span className="truncate">{g.title}</span>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="px-3 py-3 shrink-0" style={{ borderTop: "1px solid oklch(0.22 0.007 270)" }}>
          {/* RPA + dialog names */}
          <div className="px-2 py-2 rounded-xl mb-2 space-y-1.5" style={{ background: "oklch(0.18 0.005 270)" }}>
            <div className="flex items-center gap-2">
              {rpaConnected
                ? <Wifi className="w-3 h-3" style={{ color: "oklch(0.72 0.18 155)" }} />
                : <WifiOff className="w-3 h-3" style={{ color: "oklch(0.45 0.01 270)" }} />}
              <span className="text-xs" style={{ color: rpaConnected ? "oklch(0.72 0.18 155)" : "oklch(0.45 0.01 270)" }}>
                {rpaConnected ? "ChatGPT 已连接" : "ChatGPT 未连接"}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--manus-color)" }} />
              <span className="text-xs" style={{ color: "oklch(0.55 0.01 270)" }}>金融投资</span>
              <span className="mx-1 text-xs" style={{ color: "oklch(0.35 0.007 270)" }}>·</span>
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--chatgpt-color)" }} />
              <span className="text-xs" style={{ color: "oklch(0.55 0.01 270)" }}>投资manus</span>
            </div>
          </div>

          {[
            { icon: Settings, label: "设置", action: () => navigate("/settings") },
            ...(accessData?.isOwner ? [{ icon: Shield, label: "管理面板", action: () => navigate("/admin") }] : []),
            { icon: LogOut, label: "退出登录", action: logout },
          ].map(({ icon: Icon, label, action }) => (
            <button key={label} onClick={action}
              className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition-colors hover:bg-white/5"
              style={{ color: "oklch(0.65 0.008 270)" }}>
              <Icon className="w-3.5 h-3.5" />{label}
            </button>
          ))}
        </div>
      </aside>

      {/* ── Main ── */}
      <div className="flex-1 flex flex-col min-w-0">

        {/* Top bar */}
        <header className="h-12 flex items-center gap-3 px-4 shrink-0" style={{ borderBottom: "1px solid oklch(0.20 0.007 270)" }}>
          {!sidebarOpen && (
            <button onClick={() => setSidebarOpen(true)} className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-white/5 transition-colors" style={{ color: "oklch(0.55 0.01 270)" }}>
              <Menu className="w-4 h-4" />
            </button>
          )}
          <span className="text-sm font-medium truncate" style={{ color: "oklch(0.85 0.005 270)", fontFamily: "'Google Sans', sans-serif" }}>
            {activeTaskId === null ? "全部对话" : taskGroups.find(g => g.taskId === activeTaskId)?.title || `任务 #${activeTaskId}`}
          </span>
          <div className="ml-auto hidden sm:flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ background: "var(--manus-bg)", border: "1px solid var(--manus-border, var(--manus-color))", color: "var(--manus-color)" }}>
              <Bot className="w-3 h-3" />Manus · 金融投资
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ background: "var(--chatgpt-bg)", border: "1px solid var(--chatgpt-border, var(--chatgpt-color))", color: "var(--chatgpt-color)" }}>
              <Brain className="w-3 h-3" />ChatGPT · 投资manus
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
          {msgsLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-3">
                <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: "oklch(0.72 0.18 250)" }} />
                <p className="text-sm" style={{ color: "oklch(0.55 0.01 270)" }}>正在加载历史对话...</p>
              </div>
            </div>
          ) : displayMsgs.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center space-y-5 max-w-md">
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                  style={{ background: "oklch(0.72 0.18 250 / 0.1)", border: "1px solid oklch(0.72 0.18 250 / 0.2)" }}>
                  <MessageSquare className="w-8 h-8" style={{ color: "oklch(0.72 0.18 250)" }} />
                </div>
                <div>
                  <h3 className="text-lg font-semibold mb-2" style={{ color: "oklch(0.92 0.005 270)", fontFamily: "'Google Sans', sans-serif" }}>开始协作</h3>
                  <p className="text-sm leading-relaxed" style={{ color: "oklch(0.55 0.01 270)" }}>
                    输入你的金融投资任务，Manus 将通过「金融投资」对话框执行分析，
                    ChatGPT 将通过「投资manus」对话框进行审查和战略汇总。
                  </p>
                </div>
                <div className="flex items-center justify-center gap-6 text-xs" style={{ color: "oklch(0.45 0.01 270)" }}>
                  <div className="flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5" style={{ color: "var(--manus-color)" }} />
                    数据统筹 · 分析执行
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5" style={{ color: "var(--chatgpt-color)" }} />
                    审查 · 战略汇总
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <>
              {displayMsgs.map((msg) => <MsgBubble key={msg.id} msg={msg} />)}
              {(isTypingManus || isTypingGpt) && <TypingIndicator />}
            </>
          )}
          <div ref={bottomRef} />
        </div>

        {/* Input */}
        <div className="px-6 pb-5 pt-2 shrink-0">
          <div className="flex items-end gap-3 px-4 py-3 rounded-2xl"
            style={{ background: "oklch(0.20 0.007 270)", border: "1px solid oklch(0.28 0.008 270)", transition: "border-color 0.15s" }}>
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="输入任务，按 Enter 发送，Shift+Enter 换行..."
              className="flex-1 bg-transparent border-0 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 text-sm min-h-[24px] max-h-[160px] p-0 leading-relaxed placeholder:text-muted-foreground"
              rows={1}
              disabled={sending}
              style={{ color: "oklch(0.92 0.005 270)" }}
            />
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || sending}
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all disabled:opacity-30"
              style={{ background: "oklch(0.72 0.18 250)", color: "oklch(0.13 0.005 270)" }}>
              {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </button>
          </div>
          <p className="text-center text-xs mt-2" style={{ color: "oklch(0.38 0.008 270)" }}>
            Manus「金融投资」执行分析 · ChatGPT「投资manus」审查汇总 · 所有对话永久保存
          </p>
        </div>
      </div>
    </div>
  );
}
