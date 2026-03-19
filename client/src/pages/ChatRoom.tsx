import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import React from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot, Brain, User, Settings, Send, Plus, Menu, X,
  Wifi, WifiOff, ChevronDown, LogOut, Shield, Loader2,
  MessageSquare, Database, History, Download, Star, Pin,
  MoreHorizontal, ChevronRight, FileText, Table2, Copy, Check,
  Paperclip, Image, Film, Music, File, XCircle, Sparkles,
  FolderPlus, Folder, FolderOpen, Pencil, Trash2, MoveRight,
} from "lucide-react";

// ─── Markdown ErrorBoundary ─────────────────────────────────────────────────
class MarkdownErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback: string },
  { hasError: boolean }
> {
  constructor(props: { children: React.ReactNode; fallback: string }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return <pre className="whitespace-pre-wrap text-sm">{this.props.fallback}</pre>;
    }
    return this.props.children;
  }
}

// ─── Types ────────────────────────────────────────────────────────────────────
type MsgRole = "user" | "manus" | "chatgpt" | "system" | "assistant";
interface Msg {
  id: number;
  role: MsgRole;
  content: string;
  taskId?: number | null;
  conversationId?: number | null;
  createdAt: Date;
}

// ─── Attachment Types ─────────────────────────────────────────────────────────
interface PendingFile {
  id: string;
  file: File;
  preview?: string;
  uploading: boolean;
  uploadedUrl?: string;
  error?: string;
}

function getFileIcon(type: string) {
  if (type.startsWith("image/")) return Image;
  if (type.startsWith("video/")) return Film;
  if (type.startsWith("audio/")) return Music;
  if (type === "application/pdf") return FileText;
  return File;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── File Preview Card ────────────────────────────────────────────────────────
function FileCard({ pf, onRemove }: { pf: PendingFile; onRemove: () => void }) {
  const Icon = getFileIcon(pf.file.type);
  const isImage = pf.file.type.startsWith("image/");
  return (
    <div className="relative flex items-center gap-2 px-2.5 py-2 rounded-xl group/card"
      style={{ background: "oklch(0.18 0.005 270)", border: "1px solid oklch(0.27 0.008 270)", minWidth: "140px", maxWidth: "180px" }}>
      {isImage && pf.preview ? (
        <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0">
          <img src={pf.preview} alt={pf.file.name} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
          style={{ background: "oklch(0.72 0.18 250 / 0.1)", border: "1px solid oklch(0.72 0.18 250 / 0.2)" }}>
          <Icon className="w-4 h-4" style={{ color: "oklch(0.72 0.18 250)" }} />
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: "oklch(0.88 0.005 270)" }}>{pf.file.name}</p>
        <p className="text-xs" style={{ color: "oklch(0.50 0.01 270)" }}>{formatFileSize(pf.file.size)}</p>
      </div>
      {pf.uploading && <Loader2 className="w-3 h-3 animate-spin shrink-0" style={{ color: "oklch(0.72 0.18 250)" }} />}
      {pf.error && <span className="text-xs shrink-0" style={{ color: "oklch(0.65 0.18 25)" }}>失败</span>}
      {pf.uploadedUrl && !pf.uploading && <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "oklch(0.72 0.18 155)" }} />}
      <button onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity"
        style={{ background: "oklch(0.55 0.18 25)", color: "white" }}>
        <XCircle className="w-3 h-3" />
      </button>
    </div>
  );
}

// ─── Download helpers ─────────────────────────────────────────────────────────
function extractTables(md: string): string[][] {
  const tables: string[][] = [];
  const lines = md.split("\n");
  let inTable = false;
  let currentTable: string[] = [];
  for (const line of lines) {
    if (/^\|.+\|/.test(line.trim())) {
      inTable = true;
      if (!/^[\|\s\-:]+$/.test(line.trim())) currentTable.push(line.trim());
    } else if (inTable) {
      if (currentTable.length > 0) { tables.push([...currentTable]); currentTable = []; }
      inTable = false;
    }
  }
  if (currentTable.length > 0) tables.push(currentTable);
  return tables;
}

function tableToCSV(rows: string[]): string {
  return rows.map(row =>
    row.replace(/^\||\|$/g, "").split("|").map(cell =>
      `"${cell.trim().replace(/"/g, '""')}"`
    ).join(",")
  ).join("\n");
}

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Message Components ───────────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button onClick={() => { navigator.clipboard.writeText(text).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); }); }}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all hover:bg-white/8"
      style={{ color: "oklch(0.55 0.01 270)" }}>
      {copied ? <Check className="w-3 h-3" style={{ color: "oklch(0.72 0.18 155)" }} /> : <Copy className="w-3 h-3" />}
      {copied ? "已复制" : "复制"}
    </button>
  );
}

function DownloadMenu({ content, taskTitle }: { content: string; taskTitle?: string }) {
  const [open, setOpen] = useState(false);
  const tables = useMemo(() => extractTables(content), [content]);
  const slug = (taskTitle || "ai-reply").slice(0, 30).replace(/\s+/g, "-");
  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all hover:bg-white/8"
        style={{ color: "oklch(0.55 0.01 270)" }}>
        <Download className="w-3 h-3" />下载
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-7 z-50 rounded-xl py-1 min-w-[160px] shadow-xl"
            style={{ background: "oklch(0.20 0.007 270)", border: "1px solid oklch(0.28 0.008 270)" }}>
            <button onClick={() => { downloadText(content, `${slug}.md`, "text/markdown"); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8"
              style={{ color: "oklch(0.82 0.005 270)" }}>
              <FileText className="w-3.5 h-3.5" style={{ color: "oklch(0.72 0.18 250)" }} />下载 Markdown
            </button>
            <button onClick={() => { downloadText(content, `${slug}.txt`, "text/plain"); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8"
              style={{ color: "oklch(0.82 0.005 270)" }}>
              <FileText className="w-3.5 h-3.5" />下载纯文本
            </button>
            {tables.length > 0 && tables.map((t, i) => (
              <button key={i} onClick={() => { downloadText(tableToCSV(t), `${slug}-table${i + 1}.csv`, "text/csv"); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8"
                style={{ color: "oklch(0.82 0.005 270)" }}>
                <Table2 className="w-3.5 h-3.5" style={{ color: "oklch(0.74 0.14 155)" }} />下载表格 {tables.length > 1 ? i + 1 : ""}(.csv)
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function AIMessage({ msg, taskTitle }: { msg: Msg; taskTitle?: string }) {
  const isAssistant = msg.role === "assistant";
  const colorVar = isAssistant ? "chatgpt" : "manus";
  const label = isAssistant ? "AI 协作回复" : (msg.role === "chatgpt" ? "ChatGPT" : "Manus");
  const abbr = isAssistant ? "AI" : (msg.role === "chatgpt" ? "G" : "M");
  return (
    <div className="flex gap-4 items-start py-3 group">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5"
        style={{ background: `var(--${colorVar}-bg)`, border: `1.5px solid var(--${colorVar}-border)`, color: `var(--${colorVar}-color)` }}>
        {abbr}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold" style={{ color: `var(--${colorVar}-color)` }}>{label}</span>
          <span className="text-xs" style={{ color: "oklch(0.42 0.01 270)" }}>
            {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        <div className="prose-chat w-full">
          <MarkdownErrorBoundary fallback={msg.content}>
            <ReactMarkdown
              key={`md-${msg.id}`}
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ children }) => (
                  <div className="overflow-x-auto my-3">
                    <table className="min-w-full border-collapse text-sm">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border px-3 py-1.5 text-left font-semibold" style={{ borderColor: "oklch(0.32 0.01 270)", background: "oklch(0.22 0.01 270)" }}>{children}</th>
                ),
                td: ({ children }) => (
                  <td className="border px-3 py-1.5" style={{ borderColor: "oklch(0.32 0.01 270)" }}>{children}</td>
                ),
                code: ({ className, children, ...props }) => {
                  const isBlock = className?.includes("language-");
                  return isBlock ? (
                    <pre className="rounded-lg p-3 my-2 overflow-x-auto text-xs" style={{ background: "oklch(0.15 0.01 270)" }}>
                      <code className={className}>{children}</code>
                    </pre>
                  ) : (
                    <code className="px-1 py-0.5 rounded text-xs" style={{ background: "oklch(0.22 0.01 270)", color: "oklch(0.82 0.12 250)" }} {...props}>{children}</code>
                  );
                },
                blockquote: ({ children }) => (
                  <blockquote className="border-l-4 pl-3 my-2 italic" style={{ borderColor: "oklch(0.55 0.18 250)", color: "oklch(0.65 0.01 270)" }}>{children}</blockquote>
                ),
                h1: ({ children }) => <h1 className="text-xl font-bold mt-4 mb-2">{children}</h1>,
                h2: ({ children }) => <h2 className="text-lg font-bold mt-3 mb-1.5">{children}</h2>,
                h3: ({ children }) => <h3 className="text-base font-semibold mt-2 mb-1">{children}</h3>,
                strong: ({ children }) => <strong className="font-bold" style={{ color: "oklch(0.92 0.005 270)" }}>{children}</strong>,
                a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer" className="underline" style={{ color: "oklch(0.72 0.18 250)" }}>{children}</a>,
                ul: ({ children }) => <ul className="list-disc pl-5 my-1.5 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal pl-5 my-1.5 space-y-0.5">{children}</ol>,
                li: ({ children }) => <li className="text-sm leading-relaxed">{children}</li>,
                p: ({ children }) => <p className="text-sm leading-relaxed my-1.5">{children}</p>,
              }}
            >
              {msg.content}
            </ReactMarkdown>
          </MarkdownErrorBoundary>
        </div>
        <div className="flex items-center gap-0.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton text={msg.content} />
          <DownloadMenu content={msg.content} taskTitle={taskTitle} />
        </div>
      </div>
    </div>
  );
}

function UserMessage({ msg }: { msg: Msg }) {
  return (
    <div className="flex gap-4 items-start py-3 flex-row-reverse">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5"
        style={{ background: "var(--user-bg)", border: "1.5px solid var(--user-border)", color: "var(--user-color)" }}>
        <User className="w-4 h-4" />
      </div>
      <div className="flex flex-col items-end gap-1" style={{ maxWidth: "72%" }}>
        <div className="flex items-center gap-2">
          <span className="text-xs" style={{ color: "oklch(0.42 0.01 270)" }}>
            {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="text-sm font-semibold" style={{ color: "oklch(0.82 0.005 270)" }}>你</span>
        </div>
        <div className="px-4 py-3 rounded-2xl rounded-br-md text-sm leading-relaxed"
          style={{ background: "var(--user-bg)", border: "1px solid var(--user-border)", color: "oklch(0.92 0.005 270)", wordBreak: "break-word" }}>
          {msg.content}
        </div>
      </div>
    </div>
  );
}

function SystemMessage({ msg }: { msg: Msg }) {
  return (
    <div className="flex justify-center my-2">
      <div className="px-3 py-1.5 rounded-full text-xs text-center max-w-[85%]"
        style={{ background: "oklch(0.18 0.005 270)", border: "1px solid oklch(0.25 0.007 270)", color: "oklch(0.55 0.01 270)" }}>
        {msg.content}
      </div>
    </div>
  );
}

function MsgRow({ msg, taskTitle }: { msg: Msg; taskTitle?: string }) {
  if (msg.role === "system") return <SystemMessage msg={msg} />;
  if (msg.role === "user") return <UserMessage msg={msg} />;
  return <AIMessage msg={msg} taskTitle={taskTitle} />;
}

function TypingIndicator() {
  return (
    <div className="flex gap-4 items-start py-3">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5"
        style={{ background: "var(--chatgpt-bg)", border: "1.5px solid var(--chatgpt-border)", color: "var(--chatgpt-color)" }}>
        AI
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm font-semibold" style={{ color: "var(--chatgpt-color)" }}>AI 协作回复</span>
        <div className="flex items-center gap-2 py-1">
          <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: "var(--chatgpt-color)" }} />
          <span className="text-xs" style={{ color: "oklch(0.55 0.01 270)" }}>Manus 分析擅长领域 → GPT 处理主观判断 → GPT 汇总输出</span>
        </div>
      </div>
    </div>
  );
}

// ─── Color map for groups ─────────────────────────────────────────────────────
const GROUP_COLORS: Record<string, string> = {
  blue: "oklch(0.72 0.18 250)",
  green: "oklch(0.72 0.18 155)",
  orange: "oklch(0.78 0.18 55)",
  red: "oklch(0.65 0.18 25)",
  purple: "oklch(0.72 0.18 300)",
  pink: "oklch(0.72 0.18 340)",
};

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ChatRoom() {
  const [, navigate] = useLocation();
  const { isAuthenticated, loading: authLoading, logout } = useAuth();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isTyping, setIsTyping] = useState(false);

  // Active conversation state
  const [activeConvId, setActiveConvId] = useState<number | null>(null);
  const [convMessages, setConvMessages] = useState<Msg[]>([]);

  // File upload state
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const utils = trpc.useUtils();

  // ─── New task dialog ──────────────────────────────────────────────────────
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const newTaskInputRef = useRef<HTMLInputElement>(null);

  // ─── Group dialog ─────────────────────────────────────────────────────────
  const [newGroupDialogOpen, setNewGroupDialogOpen] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [newGroupColor, setNewGroupColor] = useState("blue");
  const [renameGroupId, setRenameGroupId] = useState<number | null>(null);
  const [renameGroupName, setRenameGroupName] = useState("");

  // ─── Move to group dialog ─────────────────────────────────────────────────
  const [moveConvId, setMoveConvId] = useState<number | null>(null);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);

  // ─── Search ───────────────────────────────────────────────────────────────────
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement>(null);

  // ─── Queries ──────────────────────────────────────────────────────────────
  const { data: accessData, isLoading: accessLoading } = trpc.access.check.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: rpaConfig } = trpc.rpa.getConfig.useQuery(undefined, {
    enabled: isAuthenticated && !!accessData?.hasAccess,
  });
  const rpaConnected = rpaConfig?.hasApiKey === true;

  // All conversations (ungrouped + grouped)
  const { data: allConversations, refetch: refetchConvs } = trpc.chat.listConversations.useQuery(undefined, {
    enabled: isAuthenticated && !!accessData?.hasAccess,
    refetchInterval: 10000,
  });

  // Search results
  const debouncedSearch = useMemo(() => searchQuery.trim(), [searchQuery]);
  const { data: searchResults } = trpc.chat.searchConversations.useQuery(
    { keyword: debouncedSearch },
    { enabled: isAuthenticated && !!accessData?.hasAccess && debouncedSearch.length >= 1 }
  );

  // Groups with their conversations
  const { data: groups, refetch: refetchGroups } = trpc.chat.listGroups.useQuery(undefined, {
    enabled: isAuthenticated && !!accessData?.hasAccess,
    refetchInterval: 10000,
  });

  // Messages for the active conversation
  const { data: rawConvMsgs, isLoading: msgsLoading, refetch: refetchMsgs } = trpc.chat.getConversationMessages.useQuery(
    { conversationId: activeConvId! },
    {
      enabled: isAuthenticated && !!accessData?.hasAccess && activeConvId !== null,
      refetchInterval: 3000,
    }
  );

  useEffect(() => {
    if (!rawConvMsgs) return;
    const mapped: Msg[] = rawConvMsgs.map((m) => ({
      id: m.id,
      role: m.role as MsgRole,
      content: typeof m.content === "string" ? m.content : String(m.content),
      taskId: m.taskId,
      conversationId: m.conversationId,
      createdAt: new Date(m.createdAt),
    }));
    setConvMessages(mapped);
    const last = mapped[mapped.length - 1];
    if (last?.role === "assistant" || last?.content?.includes("[ERROR]")) {
      setIsTyping(false);
      setSending(false);
    }
  }, [rawConvMsgs]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 200) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convMessages, isTyping]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!accessLoading && accessData && !accessData.hasAccess) navigate("/access");
  }, [accessLoading, accessData, navigate]);

  // ─── Mutations ────────────────────────────────────────────────────────────
  const createConvMutation = trpc.chat.createConversation.useMutation({
    onSuccess: (data) => {
      refetchConvs();
      refetchGroups();
      setActiveConvId(data.id);
      setConvMessages([]);
      setNewTaskDialogOpen(false);
      setNewTaskName("");
      setTimeout(() => document.querySelector<HTMLTextAreaElement>("textarea")?.focus(), 100);
    },
    onError: (err) => toast.error(err.message || "创建会话失败"),
  });

  const submitMutation = trpc.chat.submitTask.useMutation({
    onSuccess: () => {
      refetchMsgs();
      refetchConvs();
    },
    onError: (err) => {
      toast.error(err.message || "任务提交失败");
      setSending(false);
      setIsTyping(false);
    },
  });

  const createGroupMutation = trpc.chat.createGroup.useMutation({
    onSuccess: () => { refetchGroups(); setNewGroupDialogOpen(false); setNewGroupName(""); toast.success("分组已创建"); },
    onError: (err) => toast.error(err.message || "创建分组失败"),
  });

  const deleteGroupMutation = trpc.chat.deleteGroup.useMutation({
    onSuccess: () => { refetchGroups(); refetchConvs(); toast.success("分组已删除"); },
    onError: (err) => toast.error(err.message || "删除分组失败"),
  });

  const renameGroupMutation = trpc.chat.renameGroup.useMutation({
    onSuccess: () => { refetchGroups(); setRenameGroupId(null); },
    onError: (err) => toast.error(err.message || "重命名失败"),
  });

  const moveToGroupMutation = trpc.chat.moveToGroup.useMutation({
    onSuccess: () => { refetchGroups(); refetchConvs(); setMoveDialogOpen(false); toast.success("已移入分组"); },
    onError: (err) => toast.error(err.message || "移动失败"),
  });

  // ─── File handlers ────────────────────────────────────────────────────────
  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    const MAX_SIZE = 50 * 1024 * 1024;
    const ALLOWED = ["image/", "video/", "audio/", "application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument", "text/"];
    arr.forEach(file => {
      if (file.size > MAX_SIZE) { toast.error(`文件过大：${file.name}（最大 50MB）`); return; }
      if (!ALLOWED.some(t => file.type.startsWith(t))) { toast.error(`不支持的文件类型：${file.name}`); return; }
      const id = crypto.randomUUID();
      const pf: PendingFile = { id, file, uploading: true };
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => setPendingFiles(prev => prev.map(p => p.id === id ? { ...p, preview: e.target?.result as string } : p));
        reader.readAsDataURL(file);
      }
      setPendingFiles(prev => [...prev, pf]);
      const formData = new FormData();
      formData.append("file", file);
      fetch("/api/upload", { method: "POST", body: formData, credentials: "include" })
        .then(r => r.json())
        .then((data: any) => {
          if (data.url) setPendingFiles(prev => prev.map(p => p.id === id ? { ...p, uploading: false, uploadedUrl: data.url } : p));
          else setPendingFiles(prev => prev.map(p => p.id === id ? { ...p, uploading: false, error: data.error || "上传失败" } : p));
        })
        .catch(() => setPendingFiles(prev => prev.map(p => p.id === id ? { ...p, uploading: false, error: "网络错误" } : p)));
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || sending) return;
    if (!activeConvId) {
      toast.error("请先点击「新任务」创建一个对话");
      return;
    }
    const uploadedFiles = pendingFiles.filter(p => p.uploadedUrl && !p.error);
    const attachmentNote = uploadedFiles.length > 0
      ? `\n\n[附件: ${uploadedFiles.map(p => `${p.file.name}(${p.uploadedUrl})`).join(", ")}]`
      : "";
    setInput("");
    setPendingFiles([]);
    setSending(true);
    setIsTyping(true);
    submitMutation.mutate({ title: text + attachmentNote, conversationId: activeConvId });
  }, [input, sending, pendingFiles, activeConvId, submitMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  // ─── Derived data ─────────────────────────────────────────────────────────
  // Ungrouped conversations (not in any group)
  const groupedConvIds = useMemo(() => {
    if (!groups) return new Set<number>();
    return new Set(groups.flatMap(g => g.conversations.map(c => c.id)));
  }, [groups]);

  const ungroupedConvs = useMemo(() => {
    if (!allConversations) return [];
    return allConversations.filter(c => !groupedConvIds.has(c.id));
  }, [allConversations, groupedConvIds]);

  const activeConvTitle = useMemo(() => {
    if (!activeConvId || !allConversations) return null;
    return allConversations.find(c => c.id === activeConvId)?.title || `对话 #${activeConvId}`;
  }, [activeConvId, allConversations]);

  if (authLoading || accessLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(0.13 0.005 270)" }}>
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="h-screen flex overflow-hidden" style={{ background: "oklch(0.13 0.005 270)" }}
      onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
      onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
      onDrop={handleDrop}>

      {/* Drag overlay */}
      {isDragOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ background: "oklch(0.72 0.18 250 / 0.08)", border: "2px dashed oklch(0.72 0.18 250 / 0.5)" }}>
          <div className="text-center space-y-2">
            <Paperclip className="w-10 h-10 mx-auto" style={{ color: "oklch(0.72 0.18 250)" }} />
            <p className="text-sm font-medium" style={{ color: "oklch(0.72 0.18 250)" }}>拖放文件到此处上传</p>
          </div>
        </div>
      )}

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

        {/* Action buttons */}
        <div className="px-3 mb-3 shrink-0 flex gap-2">
          <button onClick={() => { setNewTaskName(""); setNewTaskDialogOpen(true); setTimeout(() => newTaskInputRef.current?.focus(), 80); }}
            className="flex-1 h-9 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: "oklch(0.72 0.18 250 / 0.12)", border: "1px solid oklch(0.72 0.18 250 / 0.3)", color: "oklch(0.72 0.18 250)" }}>
            <Plus className="w-4 h-4" />新任务
          </button>
          <button onClick={() => { setNewGroupName(""); setNewGroupColor("blue"); setNewGroupDialogOpen(true); }}
            className="w-9 h-9 rounded-xl flex items-center justify-center transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: "oklch(0.72 0.18 155 / 0.10)", border: "1px solid oklch(0.72 0.18 155 / 0.25)", color: "oklch(0.72 0.18 155)" }}
            title="新建分组">
            <FolderPlus className="w-4 h-4" />
          </button>
        </div>

        {/* Search bar */}
        {searchOpen ? (
          <div className="px-3 mb-2 shrink-0">
            <div className="flex items-center gap-2 h-9 rounded-xl px-3" style={{ background: "oklch(0.20 0.007 270)", border: "1px solid oklch(0.30 0.01 270)" }}>
              <svg className="w-3.5 h-3.5 shrink-0" style={{ color: "oklch(0.55 0.01 270)" }} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/></svg>
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                onKeyDown={e => { if (e.key === "Escape") { setSearchOpen(false); setSearchQuery(""); } }}
                placeholder="搜索任务名称或内容..."
                className="flex-1 bg-transparent text-xs outline-none"
                style={{ color: "oklch(0.82 0.005 270)", caretColor: "oklch(0.72 0.18 250)" }}
                autoFocus
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="shrink-0 hover:opacity-70" style={{ color: "oklch(0.55 0.01 270)" }}>
                  <X className="w-3 h-3" />
                </button>
              )}
              <button onClick={() => { setSearchOpen(false); setSearchQuery(""); }} className="shrink-0 text-xs hover:opacity-70" style={{ color: "oklch(0.55 0.01 270)" }}>取消</button>
            </div>
          </div>
        ) : (
          <div className="px-3 mb-2 shrink-0">
            <button
              onClick={() => { setSearchOpen(true); setTimeout(() => searchInputRef.current?.focus(), 50); }}
              className="w-full h-8 rounded-xl flex items-center gap-2 px-3 text-xs transition-colors hover:bg-white/5"
              style={{ color: "oklch(0.45 0.01 270)", background: "oklch(0.18 0.005 270)", border: "1px solid oklch(0.25 0.007 270)" }}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/></svg>
              搜索任务...
              <span className="ml-auto text-xs opacity-50">⌘K</span>
            </button>
          </div>
        )}

        {/* Conversation list */}
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">

          {/* Search results */}
          {searchOpen && searchQuery.trim() && (
            <div>
              <div className="flex items-center gap-1.5 px-2 py-1 text-xs mb-1" style={{ color: "oklch(0.42 0.01 270)" }}>
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><circle cx={11} cy={11} r={8}/><path d="m21 21-4.35-4.35"/></svg>
                <span>搜索结果</span>
                {searchResults && <span className="ml-auto opacity-60">{searchResults.length} 条</span>}
              </div>
              {searchResults && searchResults.length > 0 ? searchResults.map(conv => {
                const title = conv.title || "未命名任务";
                const idx = title.toLowerCase().indexOf(searchQuery.toLowerCase());
                return (
                  <button
                    key={conv.id}
                    onClick={() => { setActiveConvId(conv.id); setSearchOpen(false); setSearchQuery(""); }}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors hover:bg-white/5"
                    style={{ background: activeConvId === conv.id ? "oklch(0.72 0.18 250 / 0.12)" : "transparent" }}
                  >
                    <MessageSquare className="w-3.5 h-3.5 shrink-0" style={{ color: "oklch(0.55 0.01 270)" }} />
                    <span className="text-xs truncate" style={{ color: "oklch(0.75 0.005 270)" }}>
                      {idx >= 0 ? (
                        <>
                          {title.slice(0, idx)}
                          <mark className="rounded px-0.5" style={{ background: "oklch(0.72 0.18 250 / 0.35)", color: "oklch(0.92 0.005 270)" }}>
                            {title.slice(idx, idx + searchQuery.length)}
                          </mark>
                          {title.slice(idx + searchQuery.length)}
                        </>
                      ) : title}
                    </span>
                  </button>
                );
              }) : (
                <div className="px-3 py-6 text-center">
                  <p className="text-xs" style={{ color: "oklch(0.42 0.01 270)" }}>未找到匹配的任务</p>
                </div>
              )}
            </div>
          )}

          {/* Normal list (hidden during search) */}
          {(!searchOpen || !searchQuery.trim()) && (
          <>
          {/* Groups */}
          {groups && groups.map(group => (
            <GroupSection
              key={group.id}
              group={group}
              activeConvId={activeConvId}
              onSelectConv={setActiveConvId}
              onRename={(id, name) => { setRenameGroupId(id); setRenameGroupName(name); }}
              onDelete={(id) => deleteGroupMutation.mutate({ groupId: id })}
              onMoveConv={(convId) => { setMoveConvId(convId); setMoveDialogOpen(true); }}
            />
          ))}

          {/* Ungrouped conversations */}
          {ungroupedConvs.length > 0 && (
            <div>
              {groups && groups.length > 0 && (
                <div className="flex items-center gap-1.5 px-2 py-1 text-xs mt-2" style={{ color: "oklch(0.42 0.01 270)" }}>
                  <History className="w-3 h-3" />
                  <span>未分组</span>
                  <span className="ml-auto opacity-60">{ungroupedConvs.length}</span>
                </div>
              )}
              {ungroupedConvs.slice().reverse().map(conv => (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  active={activeConvId === conv.id}
                  onSelect={() => setActiveConvId(conv.id)}
                  onMove={() => { setMoveConvId(conv.id); setMoveDialogOpen(true); }}
                />
              ))}
            </div>
          )}

          {/* Empty state */}
          {(!allConversations || allConversations.length === 0) && (
            <div className="px-3 py-8 text-center">
              <MessageSquare className="w-6 h-6 mx-auto mb-2 opacity-30" style={{ color: "oklch(0.55 0.01 270)" }} />
              <p className="text-xs" style={{ color: "oklch(0.42 0.01 270)" }}>点击「新任务」开始</p>
            </div>
          )}
          </>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-3 shrink-0" style={{ borderTop: "1px solid oklch(0.22 0.007 270)" }}>
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
            {activeConvTitle || "选择或新建任务"}
          </span>
          <div className="ml-auto hidden sm:flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ background: "var(--manus-bg)", border: "1px solid var(--manus-border)", color: "var(--manus-color)" }}>
              <Bot className="w-3 h-3" />Manus · 金融投资
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium"
              style={{ background: "var(--chatgpt-bg)", border: "1px solid var(--chatgpt-border)", color: "var(--chatgpt-color)" }}>
              <Brain className="w-3 h-3" />ChatGPT · 投资manus
            </div>
          </div>
        </header>

        {/* Messages */}
        <div className="relative flex-1 overflow-hidden">
          <div ref={scrollRef} onScroll={() => {
            const el = scrollRef.current;
            if (!el) return;
            setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
          }} className="h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-4">
              {!activeConvId ? (
                // No conversation selected
                <div className="flex items-center justify-center min-h-[60vh]">
                  <div className="text-center space-y-5 max-w-md">
                    <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto"
                      style={{ background: "oklch(0.72 0.18 250 / 0.1)", border: "1px solid oklch(0.72 0.18 250 / 0.2)" }}>
                      <MessageSquare className="w-8 h-8" style={{ color: "oklch(0.72 0.18 250)" }} />
                    </div>
                    <div>
                      <h3 className="text-lg font-semibold mb-2" style={{ color: "oklch(0.92 0.005 270)", fontFamily: "'Google Sans', sans-serif" }}>开始协作</h3>
                      <p className="text-sm leading-relaxed" style={{ color: "oklch(0.55 0.01 270)" }}>
                        点击左侧「新任务」创建独立对话框，每个任务完全隔离，AI 自动携带历史摘要实现跨任务联动。
                      </p>
                    </div>
                    <button onClick={() => { setNewTaskName(""); setNewTaskDialogOpen(true); setTimeout(() => newTaskInputRef.current?.focus(), 80); }}
                      className="mx-auto flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-[1.02]"
                      style={{ background: "oklch(0.72 0.18 250 / 0.12)", border: "1px solid oklch(0.72 0.18 250 / 0.3)", color: "oklch(0.72 0.18 250)" }}>
                      <Plus className="w-4 h-4" />新建任务
                    </button>
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
              ) : msgsLoading ? (
                <div className="flex items-center justify-center h-64">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: "oklch(0.72 0.18 250)" }} />
                </div>
              ) : convMessages.length === 0 ? (
                // Empty conversation
                <div className="flex items-center justify-center min-h-[60vh]">
                  <div className="text-center space-y-4 max-w-sm">
                    <div className="w-12 h-12 rounded-xl flex items-center justify-center mx-auto"
                      style={{ background: "oklch(0.72 0.18 250 / 0.1)", border: "1px solid oklch(0.72 0.18 250 / 0.2)" }}>
                      <Sparkles className="w-6 h-6" style={{ color: "oklch(0.72 0.18 250)" }} />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold mb-1" style={{ color: "oklch(0.92 0.005 270)" }}>
                        {activeConvTitle || "新任务"}
                      </h3>
                      <p className="text-sm" style={{ color: "oklch(0.55 0.01 270)" }}>
                        输入你的任务，AI 团队将协作完成分析
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {convMessages.map((msg) => (
                    <MsgRow key={msg.id} msg={msg} taskTitle={activeConvTitle || undefined} />
                  ))}
                  {isTyping && <TypingIndicator />}
                </>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Scroll to bottom */}
          {showScrollBtn && (
            <button onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="absolute bottom-4 right-4 w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition-all hover:scale-110"
              style={{ background: "oklch(0.20 0.007 270)", border: "1px solid oklch(0.28 0.008 270)", color: "oklch(0.65 0.01 270)" }}>
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Input area */}
        <div className="px-4 pb-4 pt-2 shrink-0">
          <div className="max-w-3xl mx-auto">
            {/* File previews */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2 px-1">
                {pendingFiles.map(pf => (
                  <FileCard key={pf.id} pf={pf} onRemove={() => setPendingFiles(prev => prev.filter(p => p.id !== pf.id))} />
                ))}
              </div>
            )}
            <div className="rounded-2xl overflow-hidden transition-all"
              style={{ background: "oklch(0.17 0.005 270)", border: `1px solid ${isDragOver ? "oklch(0.72 0.18 250 / 0.6)" : "oklch(0.25 0.007 270)"}` }}>
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={activeConvId ? "输入任务内容... (Enter 发送，Shift+Enter 换行)" : "请先点击「新任务」创建对话框"}
                disabled={!activeConvId || sending}
                rows={3}
                className="resize-none border-0 bg-transparent px-4 pt-3 pb-1 text-sm focus-visible:ring-0 focus-visible:ring-offset-0"
                style={{ color: "oklch(0.88 0.005 270)" }}
              />
              <div className="flex items-center justify-between px-3 pb-2.5">
                <div className="flex items-center gap-1">
                  <input ref={fileInputRef} type="file" multiple className="hidden"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                    onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/8"
                    style={{ color: "oklch(0.50 0.01 270)" }} title="添加附件">
                    <Paperclip className="w-3.5 h-3.5" />
                  </button>
                </div>
                <button onClick={handleSubmit} disabled={!input.trim() || !activeConvId || sending}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: input.trim() && activeConvId && !sending ? "oklch(0.72 0.18 250)" : "oklch(0.25 0.007 270)", color: "white" }}>
                  {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <p className="text-center text-xs mt-1.5" style={{ color: "oklch(0.38 0.007 270)" }}>
              Manus 分析擅长领域 · GPT 处理主观判断 · GPT 汇总输出
            </p>
          </div>
        </div>
      </div>

      {/* ── New Task Dialog ── */}
      <Dialog open={newTaskDialogOpen} onOpenChange={setNewTaskDialogOpen}>
        <DialogContent className="sm:max-w-md" style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.27 0.008 270)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "oklch(0.92 0.005 270)" }}>新建任务</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <p className="text-sm mb-3" style={{ color: "oklch(0.60 0.01 270)" }}>
              每个任务拥有独立对话框，AI 自动携带历史摘要实现跨任务联动。
            </p>
            <Input
              ref={newTaskInputRef}
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); createConvMutation.mutate({ title: newTaskName.trim() || undefined }); } }}
              placeholder="任务名称（可选）"
              className="border-0 text-sm"
              style={{ background: "oklch(0.22 0.007 270)", color: "oklch(0.88 0.005 270)" }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewTaskDialogOpen(false)} style={{ color: "oklch(0.60 0.01 270)" }}>取消</Button>
            <Button onClick={() => createConvMutation.mutate({ title: newTaskName.trim() || undefined })}
              disabled={createConvMutation.isPending}
              style={{ background: "oklch(0.72 0.18 250)", color: "white", border: "none" }}>
              {createConvMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "开始任务"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── New Group Dialog ── */}
      <Dialog open={newGroupDialogOpen} onOpenChange={setNewGroupDialogOpen}>
        <DialogContent className="sm:max-w-sm" style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.27 0.008 270)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "oklch(0.92 0.005 270)" }}>新建分组</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-3">
            <Input
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && newGroupName.trim()) createGroupMutation.mutate({ name: newGroupName.trim(), color: newGroupColor }); }}
              placeholder="分组名称"
              className="border-0 text-sm"
              style={{ background: "oklch(0.22 0.007 270)", color: "oklch(0.88 0.005 270)" }}
            />
            <div className="flex items-center gap-2">
              <span className="text-xs" style={{ color: "oklch(0.60 0.01 270)" }}>颜色</span>
              <div className="flex gap-1.5">
                {Object.entries(GROUP_COLORS).map(([key, color]) => (
                  <button key={key} onClick={() => setNewGroupColor(key)}
                    className="w-5 h-5 rounded-full transition-all hover:scale-110"
                    style={{ background: color, outline: newGroupColor === key ? `2px solid ${color}` : "none", outlineOffset: "2px" }} />
                ))}
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setNewGroupDialogOpen(false)} style={{ color: "oklch(0.60 0.01 270)" }}>取消</Button>
            <Button onClick={() => createGroupMutation.mutate({ name: newGroupName.trim(), color: newGroupColor })}
              disabled={!newGroupName.trim() || createGroupMutation.isPending}
              style={{ background: "oklch(0.72 0.18 155)", color: "white", border: "none" }}>
              {createGroupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "创建"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Rename Group Dialog ── */}
      <Dialog open={renameGroupId !== null} onOpenChange={(open) => { if (!open) setRenameGroupId(null); }}>
        <DialogContent className="sm:max-w-sm" style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.27 0.008 270)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "oklch(0.92 0.005 270)" }}>重命名分组</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Input
              value={renameGroupName}
              onChange={(e) => setRenameGroupName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && renameGroupName.trim() && renameGroupId) renameGroupMutation.mutate({ groupId: renameGroupId, name: renameGroupName.trim() }); }}
              placeholder="新名称"
              className="border-0 text-sm"
              style={{ background: "oklch(0.22 0.007 270)", color: "oklch(0.88 0.005 270)" }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRenameGroupId(null)} style={{ color: "oklch(0.60 0.01 270)" }}>取消</Button>
            <Button onClick={() => { if (renameGroupId && renameGroupName.trim()) renameGroupMutation.mutate({ groupId: renameGroupId, name: renameGroupName.trim() }); }}
              disabled={!renameGroupName.trim() || renameGroupMutation.isPending}
              style={{ background: "oklch(0.72 0.18 250)", color: "white", border: "none" }}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Move to Group Dialog ── */}
      <Dialog open={moveDialogOpen} onOpenChange={setMoveDialogOpen}>
        <DialogContent className="sm:max-w-sm" style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.27 0.008 270)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "oklch(0.92 0.005 270)" }}>移入分组</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-1">
            <button onClick={() => { if (moveConvId) moveToGroupMutation.mutate({ conversationId: moveConvId, groupId: null }); }}
              className="w-full text-left px-3 py-2.5 rounded-xl text-sm hover:bg-white/5 transition-colors"
              style={{ color: "oklch(0.65 0.008 270)" }}>
              不属于任何分组
            </button>
            {groups && groups.map(g => (
              <button key={g.id} onClick={() => { if (moveConvId) moveToGroupMutation.mutate({ conversationId: moveConvId, groupId: g.id }); }}
                className="w-full text-left px-3 py-2.5 rounded-xl text-sm hover:bg-white/5 transition-colors flex items-center gap-2"
                style={{ color: "oklch(0.82 0.005 270)" }}>
                <Folder className="w-4 h-4" style={{ color: GROUP_COLORS[g.color] || GROUP_COLORS.blue }} />
                {g.name}
                <span className="ml-auto text-xs" style={{ color: "oklch(0.45 0.01 270)" }}>{g.conversations.length} 个任务</span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Group Section Component ──────────────────────────────────────────────────
interface GroupSectionProps {
  group: {
    id: number;
    name: string;
    color: string;
    isCollapsed: boolean;
    conversations: Array<{ id: number; title: string | null; createdAt: Date; updatedAt: Date }>;
  };
  activeConvId: number | null;
  onSelectConv: (id: number) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  onMoveConv: (convId: number) => void;
}

function GroupSection({ group, activeConvId, onSelectConv, onRename, onDelete, onMoveConv }: GroupSectionProps) {
  const [collapsed, setCollapsed] = useState(group.isCollapsed);
  const [menuOpen, setMenuOpen] = useState(false);
  const color = GROUP_COLORS[group.color] || GROUP_COLORS.blue;

  return (
    <div className="mb-1">
      <div className="flex items-center gap-1 group/group">
        <button onClick={() => setCollapsed(o => !o)}
          className="flex-1 flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors text-xs"
          style={{ color: "oklch(0.60 0.01 270)" }}>
          <ChevronRight className={`w-3 h-3 transition-transform shrink-0 ${collapsed ? "" : "rotate-90"}`} />
          {collapsed ? <Folder className="w-3 h-3 shrink-0" style={{ color }} /> : <FolderOpen className="w-3 h-3 shrink-0" style={{ color }} />}
          <span className="truncate font-medium" style={{ color }}>{group.name}</span>
          <span className="ml-auto opacity-50 shrink-0">{group.conversations.length}</span>
        </button>
        <div className="relative">
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
            className="w-5 h-5 rounded flex items-center justify-center opacity-0 group-hover/group:opacity-100 transition-opacity hover:bg-white/10"
            style={{ color: "oklch(0.55 0.01 270)" }}>
            <MoreHorizontal className="w-3 h-3" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-6 z-50 rounded-xl py-1 min-w-[140px] shadow-xl"
                style={{ background: "oklch(0.20 0.007 270)", border: "1px solid oklch(0.28 0.008 270)" }}>
                <button onClick={() => { onRename(group.id, group.name); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8"
                  style={{ color: "oklch(0.82 0.005 270)" }}>
                  <Pencil className="w-3.5 h-3.5" />重命名
                </button>
                <button onClick={() => { onDelete(group.id); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8"
                  style={{ color: "oklch(0.65 0.18 25)" }}>
                  <Trash2 className="w-3.5 h-3.5" />删除分组
                </button>
              </div>
            </>
          )}
        </div>
      </div>
      {!collapsed && group.conversations.slice().reverse().map(conv => (
        <ConvItem
          key={conv.id}
          conv={conv}
          active={activeConvId === conv.id}
          onSelect={() => onSelectConv(conv.id)}
          onMove={() => onMoveConv(conv.id)}
          indent
        />
      ))}
    </div>
  );
}

// ─── Conversation Item Component ──────────────────────────────────────────────
interface ConvItemProps {
  conv: { id: number; title: string | null; createdAt: Date };
  active: boolean;
  onSelect: () => void;
  onMove: () => void;
  indent?: boolean;
}

function ConvItem({ conv, active, onSelect, onMove, indent }: ConvItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className={`relative group/item ${indent ? "pl-4" : ""}`}>
      <button onClick={onSelect}
        className="w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-2 text-xs transition-colors"
        style={{
          background: active ? "oklch(0.72 0.18 250 / 0.12)" : "transparent",
          color: active ? "oklch(0.80 0.15 250)" : "oklch(0.65 0.008 270)",
        }}>
        <MessageSquare className="w-3 h-3 shrink-0 opacity-50" />
        <span className="truncate flex-1">{conv.title || `对话 #${conv.id}`}</span>
      </button>
      <button onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity hover:bg-white/10"
        style={{ color: "oklch(0.55 0.01 270)" }}>
        <MoreHorizontal className="w-3 h-3" />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-8 z-50 rounded-xl py-1 min-w-[140px] shadow-xl"
            style={{ background: "oklch(0.20 0.007 270)", border: "1px solid oklch(0.28 0.008 270)" }}>
            <button onClick={() => { onMove(); setMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8"
              style={{ color: "oklch(0.82 0.005 270)" }}>
              <MoveRight className="w-3.5 h-3.5" />移入分组
            </button>
          </div>
        </>
      )}
    </div>
  );
}
