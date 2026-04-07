/**
 * useDiscussion.ts — DanTree Discussion System v1
 *
 * Discussion Core Logic：
 * - 统一 Message 结构（user/assistant/system，含 metadata）
 * - 消息列表管理（optimistic + server sync）
 * - 滚动行为控制（默认到底部 / jump 按钮状态）
 * - 发送 + streaming 状态
 * - SSE 实时推送（/api/task-stream/:taskId）+ refetchInterval fallback
 * - File ingestion v1：上传 → FileCard message（processing→ready）
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Unified Message Type
// ─────────────────────────────────────────────────────────────────────────────

export interface FileCardData {
  type: "file_card";
  fileName: string;
  fileType: string;
  sizeBytes: number;
  status: "processing" | "ready" | "error";
  summary?: string;
  keyPoints?: string[];
  s3Url?: string;
  attachmentId?: number;
  error?: string;
}

export interface DiscussionMessage {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
  taskId?: number | null;
  fileCard?: FileCardData;
  metadata?: {
    answerObject?: {
      verdict: string;
      confidence: "high" | "medium" | "low";
      bull_case?: string[];
      bear_case?: string[];
      reasoning?: string[];
      risks?: Array<{ description: string; magnitude?: string }>;
      key_points?: string[];
      suggested_next?: string;
    };
    evidenceScore?: number;
    outputMode?: "decisive" | "directional" | "framework_only";
    fileContext?: {
      fileName: string;
      fileType: string;
      summary?: string;
    };
  } | null;
  isOptimistic?: boolean;
  isStreaming?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// File Ingestion Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface FileIngestionRequest {
  file: File;
  conversationId: number;
  intent?: "analyze" | "reference" | "summarize";
}

export interface FileIngestionResult {
  fileName: string;
  fileType: string;
  sizeBytes: number;
  extractedText?: string;
  error?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useDiscussion(conversationId: number | null) {
  const [messages, setMessages] = useState<DiscussionMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [showJumpToBottom, setShowJumpToBottom] = useState(false);
  const [pendingFileContext, setPendingFileContext] = useState<FileIngestionResult | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevConvIdRef = useRef<number | null>(null);
  const sseRef = useRef<EventSource | null>(null);

  // ── tRPC ──────────────────────────────────────────────────────────────────
  const uploadMutation = trpc.file.upload.useMutation();

  const { data: rawMessages, refetch: refetchMessages } =
    trpc.chat.getConversationMessages.useQuery(
      { conversationId: conversationId! },
      {
        enabled: !!conversationId,
        refetchInterval: (sending || isTyping) ? 3000 : false,
      }
    );

  // ── SSE ───────────────────────────────────────────────────────────────────

  const startSSE = useCallback((taskId: number) => {
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }

    const es = new EventSource(`/api/task-stream/${taskId}`, { withCredentials: true });
    sseRef.current = es;

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);

        if (data.type === "chunk" && data.content) {
          setMessages(prev => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.isStreaming) {
              return [
                ...prev.slice(0, -1),
                { ...last, content: last.content + data.content },
              ];
            }
            return [
              ...prev.filter(m => !m.isOptimistic),
              {
                id: data.msgId ?? Date.now(),
                role: "assistant" as const,
                content: data.content,
                createdAt: new Date(),
                isStreaming: true,
              },
            ];
          });
        } else if (data.type === "done") {
          setSending(false);
          setIsTyping(false);
          setMessages(prev =>
            prev.map(m => m.isStreaming ? { ...m, isStreaming: false } : m)
          );
          refetchMessages();
          es.close();
          sseRef.current = null;
        } else if (data.type === "error") {
          setSending(false);
          setIsTyping(false);
          setMessages(prev => prev.filter(m => !m.isOptimistic && !m.isStreaming));
          toast.error(`AI 处理失败：${data.message ?? "未知错误"}`);
          refetchMessages();
          es.close();
          sseRef.current = null;
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      setSending(false);
      setIsTyping(false);
      refetchMessages();
      es.close();
      sseRef.current = null;
    };
  }, [refetchMessages]);

  useEffect(() => {
    return () => {
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
    };
  }, []);

  const submitMutation = trpc.chat.submitTask.useMutation({
    onSuccess: (data) => {
      if ((data as any)?.taskId) {
        startSSE((data as any).taskId);
      } else {
        setSending(false);
        setIsTyping(false);
        refetchMessages();
      }
    },
    onError: (err) => {
      setSending(false);
      setIsTyping(false);
      setMessages(prev => prev.filter(m => !m.isOptimistic));
      toast.error(`发送失败：${err.message}`);
    },
  });

   // ── Server sync ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!rawMessages) return;
    const hasStreaming = messages.some(m => m.isStreaming);
    if (hasStreaming) return;
    // BUG-003 fix: 不再依赖 prevConvIdRef 判断，直接比较 rawMessages 与当前非乐观消息数量
    // 如果数据相同则跳过（避免重复渲染）
    const serverCount = rawMessages.length;
    const localCount = messages.filter(m => !m.isOptimistic).length;
    if (serverCount === localCount && serverCount > 0) return;
    const mapped: DiscussionMessage[] = (rawMessages as any[]).map(m => ({
      id: m.id,
      role: m.role as DiscussionMessage["role"],
      content: m.content,
      createdAt: new Date(m.createdAt),
      taskId: m.taskId ?? null,
      metadata: m.metadata ?? null,
    }));
    setMessages(mapped);
  }, [rawMessages, conversationId]);

  useEffect(() => {
    if (conversationId !== prevConvIdRef.current) {
      // BUG-003 fix: 切换 session 时立即清空消息列表，避免旧消息短暂显示
      setMessages([]);
      setInput("");
      setPendingFileContext(null);
      setShowJumpToBottom(false);
      setSending(false);
      setIsTyping(false);
      if (sseRef.current) {
        sseRef.current.close();
        sseRef.current = null;
      }
      // 更新 prevConvIdRef 以避免 server sync useEffect 跳过新数据
      prevConvIdRef.current = conversationId;
    }
  }, [conversationId]);

  // ── Scroll ─────────────────────────────────────────────────────────────────

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    if (scrollHeight - scrollTop - clientHeight < 120) {
      scrollToBottom("smooth");
    }
  }, [messages.length, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setShowJumpToBottom(scrollHeight - scrollTop - clientHeight > 150);
  }, []);

  // ── Send ───────────────────────────────────────────────────────────────────

  const sendMessage = useCallback((text?: string) => {
    const raw = (text ?? input).trim();
    if (!raw || sending || !conversationId) return;
    if (!text) setInput("");

    let content = raw;
    let fileContextMeta: DiscussionMessage["metadata"] = null;
    if (pendingFileContext) {
      if (pendingFileContext.extractedText) {
        content = `[文件: ${pendingFileContext.fileName}]\n\n${pendingFileContext.extractedText.slice(0, 4000)}\n\n---\n\n${raw}`;
      }
      fileContextMeta = {
        fileContext: {
          fileName: pendingFileContext.fileName,
          fileType: pendingFileContext.fileType,
          summary: pendingFileContext.extractedText ? "已注入上下文" : pendingFileContext.error,
        },
      };
      setPendingFileContext(null);
    }

    const optimistic: DiscussionMessage = {
      id: Date.now(),
      role: "user",
      content: raw,
      createdAt: new Date(),
      metadata: fileContextMeta,
      isOptimistic: true,
    };
    setMessages(prev => [...prev, optimistic]);
    setSending(true);
    setIsTyping(true);
    scrollToBottom("smooth");

    submitMutation.mutate({ title: content, conversationId });
  }, [input, sending, conversationId, pendingFileContext, submitMutation, scrollToBottom]);

  // ── File ingestion ─────────────────────────────────────────────────────────

  const attachFile = useCallback(async (file: File) => {
    if (!conversationId || isUploading) return;

    const allowed = ["application/pdf", "text/plain", "text/csv", "text/markdown"];
    const isAllowed = allowed.includes(file.type) || file.name.endsWith(".txt") || file.name.endsWith(".csv") || file.name.endsWith(".md");
    if (!isAllowed) {
      toast.error("仅支持 PDF、TXT、CSV 文件");
      return;
    }
    if (file.size > 16 * 1024 * 1024) {
      toast.error("文件大小不能超过 16MB");
      return;
    }

    setIsUploading(true);
    const cardId = Date.now();
    setMessages(prev => [...prev, {
      id: cardId,
      role: "user",
      content: `[文件上传] ${file.name}`,
      createdAt: new Date(),
      isOptimistic: true,
      fileCard: {
        type: "file_card",
        fileName: file.name,
        fileType: file.type || "application/octet-stream",
        sizeBytes: file.size,
        status: "processing",
      },
    }]);
    scrollToBottom("smooth");

    try {
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(",")[1] ?? (reader.result as string));
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      const uploadResult = await uploadMutation.mutateAsync({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        base64Data,
        conversationId,
      });

      const extractedPreview = uploadResult.extractedText
        ? uploadResult.extractedText.replace(/\[文件内容：[^\]]+\]\n?/, "").slice(0, 200)
        : undefined;

      setMessages(prev => prev.map(m =>
        m.id === cardId ? {
          ...m,
          isOptimistic: false,
          fileCard: {
            type: "file_card" as const,
            fileName: file.name,
            fileType: file.type,
            sizeBytes: file.size,
            status: "ready" as const,
            summary: extractedPreview ? `${extractedPreview}...` : "文件已就绪，可继续提问",
            s3Url: uploadResult.s3Url,
            attachmentId: uploadResult.attachmentId,
          },
        } : m
      ));

      setPendingFileContext({
        fileName: file.name,
        fileType: file.type,
        sizeBytes: file.size,
        extractedText: uploadResult.extractedText ?? undefined,
      });

      toast.success(`${file.name} 已就绪，可继续提问`);
    } catch (e: any) {
      setMessages(prev => prev.map(m =>
        m.id === cardId ? {
          ...m,
          isOptimistic: false,
          fileCard: {
            type: "file_card" as const,
            fileName: file.name,
            fileType: file.type,
            sizeBytes: file.size,
            status: "error" as const,
            error: e?.message ?? "上传失败",
          },
        } : m
      ));
      toast.error(`上传失败：${e?.message ?? "未知错误"}`);
    } finally {
      setIsUploading(false);
    }
  }, [conversationId, isUploading, uploadMutation, scrollToBottom]);

  const clearFile = useCallback(() => setPendingFileContext(null), []);

  // ── Derived ────────────────────────────────────────────────────────────────

  const visibleMessages = useMemo(
    () => messages.filter(m => m.role !== "system"),
    [messages]
  );

  const lastAssistantMessage = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i];
    }
    return null;
  }, [messages]);

  return {
    messages,
    visibleMessages,
    lastAssistantMessage,
    input,
    setInput,
    sending,
    isTyping,
    showJumpToBottom,
    pendingFileContext,
    isUploading,
    scrollContainerRef,
    bottomRef,
    sendMessage,
    attachFile,
    clearFile,
    scrollToBottom,
    handleScroll,
    refetchMessages,
  };
}
