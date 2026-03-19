import { useState, useRef, useEffect } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useLocation } from "wouter";
import { getLoginUrl } from "@/const";
import {
  Bot, Brain, User, Settings, Send, Loader2,
  Wifi, WifiOff, AlertCircle, CheckCircle2, Clock,
  Database, ChevronRight, LogOut, RefreshCw
} from "lucide-react";
import { Streamdown } from "streamdown";

// ─── 类型定义 ──────────────────────────────────────────────────────────────────

type MessageRole = "user" | "manus" | "chatgpt" | "system";

interface ChatMessage {
  id: number;
  role: MessageRole;
  content: string;
  createdAt: Date | string;
  taskId?: number | null;
  metadata?: any;
}

// ─── 辅助组件 ──────────────────────────────────────────────────────────────────

function RoleAvatar({ role }: { role: MessageRole }) {
  if (role === "manus") {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--manus-bg)", border: "1.5px solid var(--manus-color)" }}>
        <Bot className="w-4 h-4" style={{ color: "var(--manus-color)" }} />
      </div>
    );
  }
  if (role === "chatgpt") {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--chatgpt-bg)", border: "1.5px solid var(--chatgpt-color)" }}>
        <Brain className="w-4 h-4" style={{ color: "var(--chatgpt-color)" }} />
      </div>
    );
  }
  if (role === "user") {
    return (
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: "var(--user-bg)", border: "1.5px solid var(--user-color)" }}>
        <User className="w-4 h-4" style={{ color: "var(--user-color)" }} />
      </div>
    );
  }
  return null;
}

function RoleLabel({ role }: { role: MessageRole }) {
  if (role === "manus") return <span className="text-xs font-semibold" style={{ color: "var(--manus-color)" }}>Manus · 执行层</span>;
  if (role === "chatgpt") return <span className="text-xs font-semibold" style={{ color: "var(--chatgpt-color)" }}>ChatGPT · 主管</span>;
  if (role === "user") return <span className="text-xs font-semibold" style={{ color: "var(--user-color)" }}>你</span>;
  return null;
}

function SystemMessage({ content }: { content: string }) {
  return (
    <div className="flex justify-center my-2">
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-muted/50 border border-border/50 text-xs text-muted-foreground max-w-md text-center">
        {content}
      </div>
    </div>
  );
}

function MessageBubble({ msg }: { msg: ChatMessage }) {
  if (msg.role === "system") return <SystemMessage content={msg.content} />;

  const isUser = msg.role === "user";

  return (
    <div className={`flex gap-3 message-bubble ${isUser ? "flex-row-reverse" : "flex-row"}`}>
      <RoleAvatar role={msg.role} />
      <div className={`flex flex-col gap-1 max-w-[75%] ${isUser ? "items-end" : "items-start"}`}>
        <div className={`flex items-center gap-2 ${isUser ? "flex-row-reverse" : "flex-row"}`}>
          <RoleLabel role={msg.role} />
          <span className="text-xs text-muted-foreground">
            {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div
          className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
          style={{
            background: msg.role === "manus"
              ? "var(--manus-bg)"
              : msg.role === "chatgpt"
                ? "var(--chatgpt-bg)"
                : "var(--user-bg)",
            border: `1px solid ${msg.role === "manus"
              ? "oklch(0.62 0.18 255 / 0.25)"
              : msg.role === "chatgpt"
                ? "oklch(0.68 0.16 155 / 0.25)"
                : "oklch(0.75 0.12 45 / 0.25)"}`,
          }}
        >
          <Streamdown>{msg.content}</Streamdown>
        </div>
      </div>
    </div>
  );
}

function TypingIndicator({ role }: { role: "manus" | "chatgpt" }) {
  return (
    <div className="flex gap-3 message-bubble">
      <RoleAvatar role={role} />
      <div className="flex flex-col gap-1">
        <RoleLabel role={role} />
        <div className="px-4 py-3 rounded-2xl flex items-center gap-1.5"
          style={{
            background: role === "manus" ? "var(--manus-bg)" : "var(--chatgpt-bg)",
            border: `1px solid ${role === "manus" ? "oklch(0.62 0.18 255 / 0.25)" : "oklch(0.68 0.16 155 / 0.25)"}`,
          }}>
          <div className="w-1.5 h-1.5 rounded-full typing-dot" style={{ background: role === "manus" ? "var(--manus-color)" : "var(--chatgpt-color)" }} />
          <div className="w-1.5 h-1.5 rounded-full typing-dot" style={{ background: role === "manus" ? "var(--manus-color)" : "var(--chatgpt-color)" }} />
          <div className="w-1.5 h-1.5 rounded-full typing-dot" style={{ background: role === "manus" ? "var(--manus-color)" : "var(--chatgpt-color)" }} />
        </div>
      </div>
    </div>
  );
}

function RpaStatusBadge({ status, onConnect }: { status: string; onConnect: () => void }) {
  if (status === "ready") {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-green-500/10 border border-green-500/20 text-xs text-green-400">
        <div className="w-1.5 h-1.5 rounded-full bg-green-400 rpa-pulse" />
        RPA 已连接
      </div>
    );
  }
  if (status === "working") {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs text-blue-400">
        <Loader2 className="w-3 h-3 animate-spin" />
        RPA 工作中
      </div>
    );
  }
  if (status === "connecting") {
    return (
      <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-yellow-500/10 border border-yellow-500/20 text-xs text-yellow-400">
        <Loader2 className="w-3 h-3 animate-spin" />
        连接中...
      </div>
    );
  }
  return (
    <button
      onClick={onConnect}
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-xs text-red-400 hover:bg-red-500/20 transition-colors cursor-pointer"
    >
      <WifiOff className="w-3 h-3" />
      RPA 未连接 · 点击连接
    </button>
  );
}

// ─── 主页面 ────────────────────────────────────────────────────────────────────

export default function ChatRoom() {
  const { user, loading, isAuthenticated, logout } = useAuth();
  const [, navigate] = useLocation();

  const [input, setInput] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [currentTaskStatus, setCurrentTaskStatus] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // 重定向未登录用户
  useEffect(() => {
    if (!loading && !isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [loading, isAuthenticated]);

  // 获取消息列表（每3秒轮询一次）
  const { data: messages = [], refetch: refetchMessages } = trpc.chat.getMessages.useQuery(
    { limit: 100 },
    { refetchInterval: 3000, enabled: isAuthenticated }
  );

  // 获取RPA状态（每5秒轮询）
  const { data: rpaStatus, refetch: refetchRpa } = trpc.rpa.getStatus.useQuery(
    undefined,
    { refetchInterval: 5000, enabled: isAuthenticated }
  );

  // 提交任务
  const submitTaskMutation = trpc.chat.submitTask.useMutation({
    onSuccess: (data) => {
      setCurrentTaskStatus("manus_working");
      refetchMessages();
    },
    onError: (err) => {
      toast.error("提交失败", { description: err.message });
      setIsSubmitting(false);
    },
  });

  // 连接RPA
  const connectRpaMutation = trpc.rpa.connect.useMutation({
    onSuccess: (data) => {
      if (data.success) {
        toast.success("RPA 连接成功", { description: "已连接到 ChatGPT 浏览器" });
      } else {
        toast.error("RPA 连接失败", { description: data.error || "请确保 ChatGPT 已在浏览器中登录" });
      }
      refetchRpa();
    },
    onError: (err) => {
      toast.error("连接失败", { description: err.message });
    },
  });

  // 自动滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // 检测任务完成状态
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      if (lastMsg.role === "system" && lastMsg.content.includes("✅")) {
        setIsSubmitting(false);
        setCurrentTaskStatus("completed");
      } else if (lastMsg.role === "system" && lastMsg.content.includes("❌")) {
        setIsSubmitting(false);
        setCurrentTaskStatus("failed");
      }
    }
  }, [messages]);

  const handleSubmit = async () => {
    if (!input.trim() || isSubmitting) return;
    const taskText = input.trim();
    setInput("");
    setIsSubmitting(true);
    setCurrentTaskStatus("pending");
    await submitTaskMutation.mutateAsync({ title: taskText });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAuthenticated) return null;

  return (
    <div className="h-screen bg-background flex flex-col overflow-hidden">
      {/* 顶部导航栏 */}
      <header className="flex-shrink-0 border-b border-border px-4 py-3 flex items-center justify-between bg-card/50 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            {/* Manus 角色标识 */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium"
              style={{ background: "var(--manus-bg)", borderColor: "oklch(0.62 0.18 255 / 0.3)", color: "var(--manus-color)" }}>
              <Bot className="w-3.5 h-3.5" />
              Manus
            </div>
            <span className="text-muted-foreground text-xs">+</span>
            {/* ChatGPT 角色标识 */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium"
              style={{ background: "var(--chatgpt-bg)", borderColor: "oklch(0.68 0.16 155 / 0.3)", color: "var(--chatgpt-color)" }}>
              <Brain className="w-3.5 h-3.5" />
              ChatGPT
            </div>
          </div>
          <span className="text-muted-foreground text-xs hidden sm:block">AI 协作群聊</span>
        </div>

        <div className="flex items-center gap-2">
          {/* RPA 状态 */}
          <RpaStatusBadge
            status={rpaStatus?.status || "idle"}
            onConnect={() => connectRpaMutation.mutate()}
          />

          {/* 设置按钮 */}
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => navigate("/settings")}>
            <Settings className="w-4 h-4" />
          </Button>

          {/* 用户信息 & 登出 */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden sm:block">{user?.name}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => { logout(); navigate("/"); }}>
              <LogOut className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </header>

      {/* 消息区域 */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center space-y-4 py-16">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: "var(--manus-bg)", border: "1.5px solid var(--manus-color)" }}>
                <Bot className="w-6 h-6" style={{ color: "var(--manus-color)" }} />
              </div>
              <span className="text-2xl text-muted-foreground">+</span>
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: "var(--chatgpt-bg)", border: "1.5px solid var(--chatgpt-color)" }}>
                <Brain className="w-6 h-6" style={{ color: "var(--chatgpt-color)" }} />
              </div>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-foreground">AI 协作团队就绪</h3>
              <p className="text-sm text-muted-foreground mt-1">
                输入任务，Manus 将执行分析，ChatGPT 将审查并汇总报告
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md w-full mt-4">
              {[
                "分析我的投资组合过去30天的收益表现",
                "查询持仓中风险最高的3支股票",
                "对比本月与上月的交易频率和盈亏比",
                "生成本周金融市场摘要报告",
              ].map((example) => (
                <button
                  key={example}
                  onClick={() => setInput(example)}
                  className="text-left px-3 py-2.5 rounded-xl bg-card border border-border hover:border-primary/40 hover:bg-accent/50 transition-all text-xs text-muted-foreground hover:text-foreground"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <>
            {messages.map((msg) => (
              <MessageBubble key={msg.id} msg={msg as ChatMessage} />
            ))}
            {/* 正在工作的打字指示器 */}
            {isSubmitting && currentTaskStatus === "manus_working" && (
              <TypingIndicator role="manus" />
            )}
            {isSubmitting && currentTaskStatus === "gpt_reviewing" && (
              <TypingIndicator role="chatgpt" />
            )}
          </>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* 输入区域 */}
      <div className="flex-shrink-0 border-t border-border px-4 py-4 bg-card/30 backdrop-blur-sm">
        {/* 任务状态条 */}
        {isSubmitting && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/5 border border-primary/15 text-xs text-primary">
            <Loader2 className="w-3.5 h-3.5 animate-spin flex-shrink-0" />
            <span>
              {currentTaskStatus === "manus_working" && "Manus 正在执行数据分析..."}
              {currentTaskStatus === "gpt_reviewing" && "ChatGPT 主管正在审查并汇总报告..."}
              {currentTaskStatus === "pending" && "任务已提交，等待处理..."}
            </span>
          </div>
        )}

        <div className="flex gap-2 items-end">
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="输入任务，例如：分析我的投资组合表现... (Enter 发送，Shift+Enter 换行)"
            className="flex-1 min-h-[52px] max-h-[160px] resize-none bg-card border-border focus:border-primary/50 text-sm"
            disabled={isSubmitting}
          />
          <Button
            onClick={handleSubmit}
            disabled={!input.trim() || isSubmitting}
            size="icon"
            className="h-[52px] w-[52px] flex-shrink-0"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Send className="w-5 h-5" />
            )}
          </Button>
        </div>

        <div className="mt-2 flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1">
              <Bot className="w-3 h-3" style={{ color: "var(--manus-color)" }} />
              执行层
            </span>
            <span className="flex items-center gap-1">
              <Brain className="w-3 h-3" style={{ color: "var(--chatgpt-color)" }} />
              主管审查
            </span>
          </div>
          <span>Enter 发送</span>
        </div>
      </div>
    </div>
  );
}
