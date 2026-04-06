/**
 * useDiscussion.ts — DanTree Discussion System v1
 *
 * Discussion Core Logic：
 * - 统一 Message 结构（user/assistant/system，含 metadata）
 * - 消息列表管理（optimistic + server sync）
 * - 滚动行为控制（默认到底部 / jump 按钮状态）
 * - 发送 + streaming 状态
 * - File ingestion v1：上传 → FileCard message（processing→ready）
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Unified Message Type
// ─────────────────────────────────────────────────────────────────────────────

export interface FileCardData {
  /** Card type discriminator */
  type: "file_card";
  fileName: string;
  fileType: string;
  sizeBytes: number;
  /** processing | ready | error */
  status: "processing" | "ready" | "error";
  /** Short LLM summary (filled when ready) */
  summary?: string;
  /** Key points extracted from file (filled when ready) */
  keyPoints?: string[];
  /** S3 URL for direct access */
  s3Url?: string;
  /** Attachment ID in DB */
  attachmentId?: number;
  /** Error message if status=error */
  error?: string;
}

export interface DiscussionMessage {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
  taskId?: number | null;
  /** If present, this message IS a file card */
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
  /** Optimistic: message not yet confirmed by server */
  isOptimistic?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// File Ingestion Interface (legacy — kept for compat)
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

  // ── tRPC mutations ─────────────────────────────────────────────────────────
  const uploadMutation = trpc.file.upload.useMutation();

  // ── Server sync ────────────────────────────────────────────────────────────
  const { data: rawMessages, refetch: refetchMessages } =
    trpc.chat.getConversationMessages.useQuery(
      { conversationId: conversationId! },
      { enabled: !!conversationId }
    );

  const submitMutation = trpc.chat.submitTask.useMutation({
    onSuccess: (result) => {
      setSending(false);
      setIsTyping(false);
      if (result) {
        const assistantMsg: DiscussionMessage = {
          id: Date.now() + 1,
          role: "assistant",
          content: typeof result === "string" ? result : (result as any).content ?? "",
          createdAt: new Date(),
          metadata: (result as any).metadata ?? null,
        };
        setMessages(prev => [...prev.filter(m => !m.isOptimistic), assistantMsg]);
      }
    },
    onError: (err) => {
      setSending(false);
      setIsTyping(false);
      setMessages(prev => prev.filter(m => !m.isOptimistic));
      toast.error(`发送失败：${err.message}`);
    },
  });

  // ── Sync messages from server when conversation changes ───────────────────
  useEffect(() => {
    if (!rawMessages) return;
    if (conversationId === prevConvIdRef.current && rawMessages.length === messages.filter(m => !m.isOptimistic).length) return;
    prevConvIdRef.current = conversationId;
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

  // Reset when conversation changes
  useEffect(() => {
    if (conversationId !== prevConvIdRef.current) {
      setInput("");
      setPendingFileContext(null);
      setShowJumpToBottom(false);
    }
  }, [conversationId]);

  // ── Scroll behavior ────────────────────────────────────────────────────────

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;
    if (isNearBottom) {
      scrollToBottom("smooth");
    }
  }, [messages.length, scrollToBottom]);

  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setShowJumpToBottom(scrollHeight - scrollTop - clientHeight > 150);
  }, []);

  // ── Send message ───────────────────────────────────────────────────────────

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

  // ── File ingestion v1 ──────────────────────────────────────────────────────
  // Uploads file to S3 via trpc.file.upload, inserts FileCard message
  // with processing → ready state flow.

  const attachFile = useCallback(async (file: File) => {
    if (!conversationId || isUploading) return;

    // Validate type
    const allowed = ["application/pdf", "text/plain", "text/csv", "text/markdown"];
    const isAllowed = allowed.includes(file.type) || file.name.endsWith(".txt") || file.name.endsWith(".csv") || file.name.endsWith(".md");
    if (!isAllowed) {
      toast.error("仅支持 PDF、TXT、CSV 文件");
      return;
    }

    // 16MB limit
    if (file.size > 16 * 1024 * 1024) {
      toast.error("文件大小不能超过 16MB");
      return;
    }

    setIsUploading(true);

    // Insert processing FileCard message immediately (optimistic)
    const cardId = Date.now();
    const processingCard: DiscussionMessage = {
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
    };
    setMessages(prev => [...prev, processingCard]);
    scrollToBottom("smooth");

    try {
      // Read file as base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          // Strip data URL prefix (data:...;base64,)
          resolve(result.split(",")[1] ?? result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      // Upload to S3 via tRPC
      const uploadResult = await uploadMutation.mutateAsync({
        filename: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        base64Data,
        conversationId,
      });

      // Build summary from extracted text preview
      const extractedPreview = uploadResult.extractedText
        ? uploadResult.extractedText.replace(/\[文件内容：[^\]]+\]\n?/, "").slice(0, 200)
        : undefined;

      // Update FileCard to ready
      setMessages(prev => prev.map(m =>
        m.id === cardId
          ? {
              ...m,
              isOptimistic: false,
              fileCard: {
                type: "file_card",
                fileName: file.name,
                fileType: file.type,
                sizeBytes: file.size,
                status: "ready",
                summary: extractedPreview ? `${extractedPreview}...` : "文件已就绪，可继续提问",
                s3Url: uploadResult.s3Url,
                attachmentId: uploadResult.attachmentId,
              },
            }
          : m
      ));

      // Set pending file context for next message
      setPendingFileContext({
        fileName: file.name,
        fileType: file.type,
        sizeBytes: file.size,
        extractedText: uploadResult.extractedText ?? undefined,
      });

      toast.success(`${file.name} 已就绪，可继续提问`);
    } catch (e: any) {
      // Update FileCard to error
      setMessages(prev => prev.map(m =>
        m.id === cardId
          ? {
              ...m,
              isOptimistic: false,
              fileCard: {
                type: "file_card",
                fileName: file.name,
                fileType: file.type,
                sizeBytes: file.size,
                status: "error",
                error: e?.message ?? "上传失败",
              },
            }
          : m
      ));
      toast.error(`上传失败：${e?.message ?? "未知错误"}`);
    } finally {
      setIsUploading(false);
    }
  }, [conversationId, isUploading, uploadMutation, scrollToBottom]);

  const clearFile = useCallback(() => {
    setPendingFileContext(null);
  }, []);

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
    // State
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
    // Refs
    scrollContainerRef,
    bottomRef,
    // Actions
    sendMessage,
    attachFile,
    clearFile,
    scrollToBottom,
    handleScroll,
    refetchMessages,
  };
}
