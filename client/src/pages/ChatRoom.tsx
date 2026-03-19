import { useState, useEffect, useRef, useCallback, useMemo } from "react";
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
import { Streamdown } from "streamdown";
import {
  Bot, Brain, User, Settings, Send, Plus, Menu, X,
  Wifi, WifiOff, ChevronDown, LogOut, Shield, Loader2,
  MessageSquare, Database, History, Download, Star, Pin,
  MoreHorizontal, ChevronRight, FileText, Table2, Copy, Check,
  Paperclip, Image, Film, Music, File, XCircle, Sparkles,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
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
  pinned?: boolean;
  starred?: boolean;
}

const VISIBLE_ROLES: MsgRole[] = ["user", "assistant"];

// ─── Attachment Types ─────────────────────────────────────────────────────────
interface PendingFile {
  id: string;          // local UUID
  file: File;
  preview?: string;    // data URL for images
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

      {/* Thumbnail or icon */}
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

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: "oklch(0.88 0.005 270)" }}>{pf.file.name}</p>
        <p className="text-xs" style={{ color: "oklch(0.50 0.01 270)" }}>{formatFileSize(pf.file.size)}</p>
      </div>

      {/* Status */}
      {pf.uploading && (
        <Loader2 className="w-3 h-3 animate-spin shrink-0" style={{ color: "oklch(0.72 0.18 250)" }} />
      )}
      {pf.error && (
        <span className="text-xs shrink-0" style={{ color: "oklch(0.65 0.18 25)" }}>失败</span>
      )}
      {pf.uploadedUrl && !pf.uploading && (
        <div className="w-2 h-2 rounded-full shrink-0" style={{ background: "oklch(0.72 0.18 155)" }} />
      )}

      {/* Remove */}
      <button
        onClick={onRemove}
        className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity"
        style={{ background: "oklch(0.55 0.18 25)", color: "white" }}>
        <XCircle className="w-3 h-3" />
      </button>
    </div>
  );
}

function groupByTask(msgs: Msg[]): TaskGroup[] {
  const map = new Map<number, TaskGroup>();
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
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button onClick={handleCopy}
      className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all hover:bg-white/8"
      style={{ color: "oklch(0.55 0.01 270)" }}
      title="复制内容">
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
        style={{ color: "oklch(0.55 0.01 270)" }}
        title="下载">
        <Download className="w-3 h-3" />下载
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-7 z-50 rounded-xl py-1 min-w-[160px] shadow-xl"
            style={{ background: "oklch(0.20 0.007 270)", border: "1px solid oklch(0.28 0.008 270)" }}>
            <button onClick={() => { downloadText(content, `${slug}.md`, "text/markdown"); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8 transition-colors"
              style={{ color: "oklch(0.82 0.005 270)" }}>
              <FileText className="w-3.5 h-3.5" style={{ color: "oklch(0.72 0.18 250)" }} />
              下载 Markdown (.md)
            </button>
            <button onClick={() => { downloadText(content, `${slug}.txt`, "text/plain"); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8 transition-colors"
              style={{ color: "oklch(0.82 0.005 270)" }}>
              <FileText className="w-3.5 h-3.5" style={{ color: "oklch(0.65 0.01 270)" }} />
              下载纯文本 (.txt)
            </button>
            {tables.length > 0 && (
              <>
                <div className="mx-3 my-1" style={{ borderTop: "1px solid oklch(0.28 0.008 270)" }} />
                {tables.map((t, i) => (
                  <button key={i} onClick={() => { downloadText(tableToCSV(t), `${slug}-table${tables.length > 1 ? `-${i + 1}` : ""}.csv`, "text/csv"); setOpen(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8 transition-colors"
                    style={{ color: "oklch(0.82 0.005 270)" }}>
                    <Table2 className="w-3.5 h-3.5" style={{ color: "oklch(0.74 0.14 155)" }} />
                    {tables.length > 1 ? `下载表格 ${i + 1} (.csv)` : "下载表格 (.csv)"}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// ChatGPT 风格：AI 消息无气泡，左对齐纯文本
function AIMessage({ msg, taskTitle }: { msg: Msg; taskTitle?: string }) {
  const isAssistant = msg.role === "assistant";
  const colorVar = isAssistant ? "chatgpt" : "manus";
  const label = isAssistant ? "AI 协作回复" : (msg.role === "chatgpt" ? "ChatGPT" : "Manus");
  const abbr = isAssistant ? "AI" : (msg.role === "chatgpt" ? "G" : "M");

  return (
    <div className="flex gap-4 items-start py-3 group">
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5"
        style={{ background: `var(--${colorVar}-bg)`, border: `1.5px solid var(--${colorVar}-border)`, color: `var(--${colorVar}-color)` }}>
        {abbr}
      </div>
      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-sm font-semibold" style={{ color: `var(--${colorVar}-color)` }}>{label}</span>
          <span className="text-xs" style={{ color: "oklch(0.42 0.01 270)" }}>
            {new Date(msg.createdAt).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}
          </span>
        </div>
        {/* No bubble: clean text with full-width markdown */}
        <div className="prose-chat w-full">
          <Streamdown>{msg.content}</Streamdown>
        </div>
        {/* Action row (visible on hover) */}
        <div className="flex items-center gap-0.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton text={msg.content} />
          <DownloadMenu content={msg.content} taskTitle={taskTitle} />
        </div>
      </div>
    </div>
  );
}

// 用户消息保留圆角气泡（右对齐）
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
          <span className="text-xs" style={{ color: "oklch(0.55 0.01 270)" }}>Manus 分析 → ChatGPT 决策 → Manus 校验</span>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
interface SidebarItemProps {
  group: TaskGroup;
  active: boolean;
  onClick: () => void;
  onPin: () => void;
  onStar: () => void;
}

function SidebarItem({ group, active, onClick, onPin, onStar }: SidebarItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <div className="relative group/item">
      <button onClick={onClick}
        className="w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-2 text-xs transition-colors"
        style={{
          background: active ? "oklch(0.72 0.18 250 / 0.12)" : "transparent",
          color: active ? "oklch(0.80 0.15 250)" : "oklch(0.65 0.008 270)",
        }}>
        {group.pinned
          ? <Pin className="w-3 h-3 shrink-0" style={{ color: "oklch(0.72 0.18 250)" }} />
          : <MessageSquare className="w-3 h-3 shrink-0 opacity-50" />}
        <span className="truncate flex-1">{group.title}</span>
        {group.starred && <Star className="w-2.5 h-2.5 shrink-0" style={{ color: "oklch(0.78 0.18 55)" }} />}
      </button>
      {/* Hover action button */}
      <button
        onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
        className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity hover:bg-white/10"
        style={{ color: "oklch(0.55 0.01 270)" }}>
        <MoreHorizontal className="w-3 h-3" />
      </button>
      {menuOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
          <div className="absolute right-0 top-8 z-50 rounded-xl py-1 min-w-[140px] shadow-xl"
            style={{ background: "oklch(0.20 0.007 270)", border: "1px solid oklch(0.28 0.008 270)" }}>
            <button onClick={() => { onPin(); setMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8 transition-colors"
              style={{ color: "oklch(0.82 0.005 270)" }}>
              <Pin className="w-3.5 h-3.5" style={{ color: "oklch(0.72 0.18 250)" }} />
              {group.pinned ? "取消置顶" : "置顶"}
            </button>
            <button onClick={() => { onStar(); setMenuOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8 transition-colors"
              style={{ color: "oklch(0.82 0.005 270)" }}>
              <Star className="w-3.5 h-3.5" style={{ color: "oklch(0.78 0.18 55)" }} />
              {group.starred ? "取消收藏" : "收藏"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ChatRoom() {
  const [, navigate] = useLocation();
  const { isAuthenticated, loading: authLoading, logout } = useAuth();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);
  const [allMsgs, setAllMsgs] = useState<Msg[]>([]);
  const [taskGroups, setTaskGroups] = useState<TaskGroup[]>([]);
  const [isTyping, setIsTyping] = useState(false);
  // Local pin/star state (persisted in memory for session)
  const [pinnedIds, setPinnedIds] = useState<Set<number>>(new Set());
  const [starredIds, setStarredIds] = useState<Set<number>>(new Set());
  const [showPinned, setShowPinned] = useState(true);
  const [showStarred, setShowStarred] = useState(true);
  const [showRecent, setShowRecent] = useState(true);

  // ─── New task dialog state ─────────────────────────────────────────────────────
  const [newTaskDialogOpen, setNewTaskDialogOpen] = useState(false);
  const [newTaskName, setNewTaskName] = useState("");
  const newTaskInputRef = useRef<HTMLInputElement>(null);

  // Local conversation list (augments taskGroups with named conversations)
  const [conversations, setConversations] = useState<Array<{ id: string; title: string; createdAt: Date }>>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);

  // ─── File upload state ─────────────────────────────────────────────────────────
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const utils = trpc.useUtils();

  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBtn(distFromBottom > 120);
  }, []);

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
      setIsTyping(false);
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
    const groups = groupByTask(mapped);
    setTaskGroups(groups.map(g => ({
      ...g,
      pinned: pinnedIds.has(g.taskId),
      starred: starredIds.has(g.taskId),
    })));
    const last = mapped[mapped.length - 1];
    if (last?.role === "assistant" || last?.content?.includes("[ERROR]")) {
      setIsTyping(false);
      setSending(false);
    }
  }, [rawMsgs, pinnedIds, starredIds]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 200) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [allMsgs, isTyping]);

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate("/");
  }, [authLoading, isAuthenticated, navigate]);

  useEffect(() => {
    if (!accessLoading && accessData && !accessData.hasAccess) navigate("/access");
  }, [accessLoading, accessData, navigate]);

  // ─── File handlers ─────────────────────────────────────────────────────────
  const addFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files);
    const MAX_SIZE = 50 * 1024 * 1024; // 50MB
    const ALLOWED = [
      "image/", "video/", "audio/",
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument",
      "text/",
    ];
    arr.forEach(file => {
      if (file.size > MAX_SIZE) { toast.error(`文件过大：${file.name}（最大 50MB）`); return; }
      const allowed = ALLOWED.some(t => file.type.startsWith(t));
      if (!allowed) { toast.error(`不支持的文件类型：${file.name}`); return; }

      const id = crypto.randomUUID();
      const pf: PendingFile = { id, file, uploading: true };

      // Generate preview for images
      if (file.type.startsWith("image/")) {
        const reader = new FileReader();
        reader.onload = (e) => {
          setPendingFiles(prev => prev.map(p => p.id === id ? { ...p, preview: e.target?.result as string } : p));
        };
        reader.readAsDataURL(file);
      }

      setPendingFiles(prev => [...prev, pf]);

      // Upload to server
      const formData = new FormData();
      formData.append("file", file);
      fetch("/api/upload", { method: "POST", body: formData, credentials: "include" })
        .then(r => r.json())
        .then((data: any) => {
          if (data.url) {
            setPendingFiles(prev => prev.map(p => p.id === id ? { ...p, uploading: false, uploadedUrl: data.url } : p));
          } else {
            setPendingFiles(prev => prev.map(p => p.id === id ? { ...p, uploading: false, error: data.error || "上传失败" } : p));
          }
        })
        .catch(() => {
          setPendingFiles(prev => prev.map(p => p.id === id ? { ...p, uploading: false, error: "网络错误" } : p));
        });
    });
  }, []);

  const removeFile = useCallback((id: string) => {
    setPendingFiles(prev => prev.filter(p => p.id !== id));
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleSubmit = useCallback(() => {
    const text = input.trim();
    if (!text || sending) return;
    // Build attachment context
    const uploadedFiles = pendingFiles.filter(p => p.uploadedUrl && !p.error);
    const attachmentNote = uploadedFiles.length > 0
      ? `\n\n[附件: ${uploadedFiles.map(p => `${p.file.name}(${p.uploadedUrl})`).join(", ")}]`
      : "";
    setInput("");
    setPendingFiles([]);
    setSending(true);
    setIsTyping(true);
    submitMutation.mutate({ title: text + attachmentNote });
  }, [input, sending, pendingFiles, submitMutation]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
  };

  // ─── New task dialog handlers ─────────────────────────────────────────────────────
  const openNewTaskDialog = useCallback(() => {
    setNewTaskName("");
    setNewTaskDialogOpen(true);
    // Focus input after dialog opens
    setTimeout(() => newTaskInputRef.current?.focus(), 80);
  }, []);

  const confirmNewTask = useCallback(() => {
    const title = newTaskName.trim() || `新任务 ${new Date().toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
    const id = crypto.randomUUID();
    const conv = { id, title, createdAt: new Date() };
    setConversations(prev => [conv, ...prev]);
    setActiveConvId(id);
    setActiveTaskId(null); // reset task filter for new empty conversation
    setNewTaskDialogOpen(false);
    setNewTaskName("");
    // Focus the main input
    setTimeout(() => {
      const ta = document.querySelector<HTMLTextAreaElement>("textarea[placeholder]");
      ta?.focus();
    }, 100);
  }, [newTaskName]);

  const togglePin = useCallback((taskId: number) => {
    setPinnedIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }, []);

  const toggleStar = useCallback((taskId: number) => {
    setStarredIds(prev => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId); else next.add(taskId);
      return next;
    });
  }, []);

  const pinnedGroups = taskGroups.filter(g => pinnedIds.has(g.taskId));
  const starredGroups = taskGroups.filter(g => starredIds.has(g.taskId) && !pinnedIds.has(g.taskId));
  const recentGroups = taskGroups.filter(g => !pinnedIds.has(g.taskId) && !starredIds.has(g.taskId)).slice().reverse();

  const displayMsgs = activeTaskId === null
    ? allMsgs
    : allMsgs.filter((m) => m.taskId === activeTaskId || !m.taskId);

  const activeTaskTitle = activeTaskId === null ? undefined
    : taskGroups.find(g => g.taskId === activeTaskId)?.title;

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
          <button onClick={openNewTaskDialog}
            className="w-full h-9 rounded-xl flex items-center justify-center gap-2 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]"
            style={{ background: "oklch(0.72 0.18 250 / 0.12)", border: "1px solid oklch(0.72 0.18 250 / 0.3)", color: "oklch(0.72 0.18 250)" }}>
            <Plus className="w-4 h-4" />新任务
          </button>
        </div>

        {/* Conversation list with groups */}
        <div className="flex-1 overflow-y-auto px-2 space-y-0.5 pb-2">

          {/* Named conversations (created via "New Task" dialog) */}
          {conversations.length > 0 && (
            <div className="mb-2">
              <div className="flex items-center gap-1.5 px-2 py-1 text-xs" style={{ color: "oklch(0.42 0.01 270)" }}>
                <Sparkles className="w-3 h-3" />
                <span>任务会话</span>
                <span className="ml-auto opacity-60">{conversations.length}</span>
              </div>
              {conversations.map(conv => (
                <button
                  key={conv.id}
                  onClick={() => { setActiveConvId(conv.id); setActiveTaskId(null); }}
                  className="w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-2 text-xs transition-colors group/conv"
                  style={{
                    background: activeConvId === conv.id ? "oklch(0.72 0.18 250 / 0.12)" : "transparent",
                    color: activeConvId === conv.id ? "oklch(0.80 0.15 250)" : "oklch(0.65 0.008 270)",
                  }}>
                  <MessageSquare className="w-3 h-3 shrink-0 opacity-60" />
                  <span className="truncate flex-1">{conv.title}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConversations(prev => prev.filter(c => c.id !== conv.id)); if (activeConvId === conv.id) setActiveConvId(null); }}
                    className="w-4 h-4 rounded flex items-center justify-center opacity-0 group-hover/conv:opacity-100 transition-opacity hover:bg-white/10"
                    style={{ color: "oklch(0.55 0.01 270)" }}>
                    <X className="w-2.5 h-2.5" />
                  </button>
                </button>
              ))}
              <div className="mx-2 my-1.5" style={{ borderTop: "1px solid oklch(0.22 0.007 270)" }} />
            </div>
          )}

          {/* All conversations entry */}
          <button onClick={() => { setActiveTaskId(null); setActiveConvId(null); }}
            className="w-full text-left rounded-xl px-3 py-2.5 flex items-center gap-2 text-xs transition-colors mb-1"
            style={{
              background: activeTaskId === null && activeConvId === null ? "oklch(0.72 0.18 250 / 0.12)" : "transparent",
              color: activeTaskId === null && activeConvId === null ? "oklch(0.80 0.15 250)" : "oklch(0.65 0.008 270)",
            }}>
            <History className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate flex-1">全部对话</span>
            <span className="opacity-50">{allMsgs.filter(m => m.role === "user").length}</span>
          </button>

          {/* Pinned group */}
          {pinnedGroups.length > 0 && (
            <div className="mb-1">
              <button onClick={() => setShowPinned(o => !o)}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg hover:bg-white/5 transition-colors"
                style={{ color: "oklch(0.45 0.01 270)" }}>
                <ChevronRight className={`w-3 h-3 transition-transform ${showPinned ? "rotate-90" : ""}`} />
                <Pin className="w-3 h-3" />置顶
                <span className="ml-auto opacity-60">{pinnedGroups.length}</span>
              </button>
              {showPinned && pinnedGroups.map(g => (
                <SidebarItem key={g.taskId} group={g} active={activeTaskId === g.taskId}
                  onClick={() => setActiveTaskId(g.taskId)}
                  onPin={() => togglePin(g.taskId)}
                  onStar={() => toggleStar(g.taskId)} />
              ))}
            </div>
          )}

          {/* Starred group */}
          {starredGroups.length > 0 && (
            <div className="mb-1">
              <button onClick={() => setShowStarred(o => !o)}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg hover:bg-white/5 transition-colors"
                style={{ color: "oklch(0.45 0.01 270)" }}>
                <ChevronRight className={`w-3 h-3 transition-transform ${showStarred ? "rotate-90" : ""}`} />
                <Star className="w-3 h-3" />收藏
                <span className="ml-auto opacity-60">{starredGroups.length}</span>
              </button>
              {showStarred && starredGroups.map(g => (
                <SidebarItem key={g.taskId} group={g} active={activeTaskId === g.taskId}
                  onClick={() => setActiveTaskId(g.taskId)}
                  onPin={() => togglePin(g.taskId)}
                  onStar={() => toggleStar(g.taskId)} />
              ))}
            </div>
          )}

          {/* Recent group */}
          {recentGroups.length > 0 && (
            <div>
              <button onClick={() => setShowRecent(o => !o)}
                className="w-full flex items-center gap-1.5 px-2 py-1 text-xs rounded-lg hover:bg-white/5 transition-colors"
                style={{ color: "oklch(0.45 0.01 270)" }}>
                <ChevronRight className={`w-3 h-3 transition-transform ${showRecent ? "rotate-90" : ""}`} />
                <History className="w-3 h-3" />最近
                <span className="ml-auto opacity-60">{recentGroups.length}</span>
              </button>
              {showRecent && recentGroups.map(g => (
                <SidebarItem key={g.taskId} group={g} active={activeTaskId === g.taskId}
                  onClick={() => setActiveTaskId(g.taskId)}
                  onPin={() => togglePin(g.taskId)}
                  onStar={() => toggleStar(g.taskId)} />
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-3 py-3 shrink-0" style={{ borderTop: "1px solid oklch(0.22 0.007 270)" }}>
          {/* RPA status */}
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
          <div ref={scrollRef} onScroll={handleScroll} className="h-full overflow-y-auto">
            <div className="max-w-3xl mx-auto px-6 py-4">
              {msgsLoading ? (
                <div className="flex items-center justify-center h-64">
                  <div className="text-center space-y-3">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto" style={{ color: "oklch(0.72 0.18 250)" }} />
                    <p className="text-sm" style={{ color: "oklch(0.55 0.01 270)" }}>正在加载历史对话...</p>
                  </div>
                </div>
              ) : displayMsgs.length === 0 ? (
                <div className="flex items-center justify-center min-h-[60vh]">
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
                  {displayMsgs.map((msg) => (
                    <MsgRow key={msg.id} msg={msg} taskTitle={activeTaskTitle} />
                  ))}
                  {isTyping && <TypingIndicator />}
                </>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Scroll to bottom button */}
          {showScrollBtn && (
            <button
              onClick={scrollToBottom}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 hover:scale-110 active:scale-95"
              style={{
                background: "oklch(0.22 0.008 270)",
                border: "1px solid oklch(0.35 0.01 270)",
                boxShadow: "0 2px 12px oklch(0 0 0 / 0.4)",
                color: "oklch(0.75 0.01 270)",
              }}
              aria-label="滚动到最新消息">
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Input */}
        <div className="px-6 pb-5 pt-2 shrink-0"
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}>
          <div className="max-w-3xl mx-auto">

            {/* Drag overlay */}
            {isDragOver && (
              <div className="mb-2 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-medium"
                style={{ background: "oklch(0.72 0.18 250 / 0.08)", border: "2px dashed oklch(0.72 0.18 250 / 0.5)", color: "oklch(0.72 0.18 250)" }}>
                <Paperclip className="w-4 h-4" />
                松开以上传文件
              </div>
            )}

            {/* File preview cards */}
            {pendingFiles.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {pendingFiles.map(pf => (
                  <FileCard key={pf.id} pf={pf} onRemove={() => removeFile(pf.id)} />
                ))}
              </div>
            )}

            {/* Input box */}
            <div className="flex items-end gap-3 px-4 py-3 rounded-2xl"
              style={{
                background: "oklch(0.20 0.007 270)",
                border: `1px solid ${isDragOver ? "oklch(0.72 0.18 250 / 0.6)" : "oklch(0.28 0.008 270)"}`,
                transition: "border-color 0.15s",
              }}>

              {/* Attach button */}
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-colors hover:bg-white/8 disabled:opacity-30"
                style={{ color: "oklch(0.55 0.01 270)" }}
                title="上传文件">
                <Paperclip className="w-4 h-4" />
              </button>

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
                disabled={(!input.trim() && pendingFiles.length === 0) || sending}
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-all disabled:opacity-30"
                style={{ background: "oklch(0.72 0.18 250)", color: "oklch(0.13 0.005 270)" }}>
                {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </div>

            {/* Hidden file input */}
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
              className="hidden"
              onChange={(e) => { if (e.target.files) { addFiles(e.target.files); e.target.value = ""; } }}
            />

            <p className="text-center text-xs mt-2" style={{ color: "oklch(0.38 0.008 270)" }}>
              Manus「金融投资」执行分析 · ChatGPT「投资manus」审查汇总 · 支持拖拽上传文件
            </p>
          </div>
        </div>
      </div>

      {/* ─── New Task Dialog ──────────────────────────────────────────────────────── */}
      <Dialog open={newTaskDialogOpen} onOpenChange={setNewTaskDialogOpen}>
        <DialogContent
          className="sm:max-w-md"
          style={{
            background: "oklch(0.17 0.006 270)",
            border: "1px solid oklch(0.28 0.008 270)",
            borderRadius: "1rem",
          }}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5 text-base" style={{ color: "oklch(0.92 0.005 270)" }}>
              <div className="w-8 h-8 rounded-xl flex items-center justify-center"
                style={{ background: "oklch(0.72 0.18 250 / 0.12)", border: "1px solid oklch(0.72 0.18 250 / 0.25)" }}>
                <Sparkles className="w-4 h-4" style={{ color: "oklch(0.72 0.18 250)" }} />
              </div>
              新建任务
            </DialogTitle>
          </DialogHeader>

          <div className="py-2">
            <p className="text-xs mb-3" style={{ color: "oklch(0.52 0.01 270)" }}>
              给这个任务起一个名字，方便在左侧栏找到它。也可以直接点确认使用默认名称。
            </p>
            <Input
              ref={newTaskInputRef}
              value={newTaskName}
              onChange={(e) => setNewTaskName(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") confirmNewTask(); }}
              placeholder="例：氪深300分析、Q1投资回顾..."
              className="text-sm"
              style={{
                background: "oklch(0.22 0.007 270)",
                border: "1px solid oklch(0.32 0.009 270)",
                color: "oklch(0.92 0.005 270)",
                borderRadius: "0.75rem",
              }}
            />
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="ghost"
              onClick={() => setNewTaskDialogOpen(false)}
              className="text-sm"
              style={{ color: "oklch(0.55 0.01 270)" }}>
              取消
            </Button>
            <Button
              onClick={confirmNewTask}
              className="text-sm font-medium"
              style={{ background: "oklch(0.72 0.18 250)", color: "oklch(0.13 0.005 270)" }}>
              <Plus className="w-3.5 h-3.5 mr-1.5" />
              创建任务
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
