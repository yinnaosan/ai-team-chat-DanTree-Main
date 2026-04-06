/**
 * useDiscussion.ts — DanTree Discussion System v1
 *
 * Discussion Core Logic：
 * - 统一 Message 结构（user/assistant/system，含 metadata）
 * - 消息列表管理（optimistic + server sync）
 * - 滚动行为控制（默认到底部 / jump 按钮状态）
 * - 发送 + streaming 状态
 * - File ingestion 基础接口（接口层，不做重解析）
 */
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

// ─────────────────────────────────────────────────────────────────────────────
// Unified Message Type
// ─────────────────────────────────────────────────────────────────────────────

export interface DiscussionMessage {
  id: number;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: Date;
  taskId?: number | null;
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
// File Ingestion Interface
// ─────────────────────────────────────────────────────────────────────────────

export interface FileIngestionRequest {
  file: File;
  conversationId: number;
  /** How to use this file in context */
  intent?: "analyze" | "reference" | "summarize";
}

export interface FileIngestionResult {
  fileName: string;
  fileType: string;
  sizeBytes: number;
  /** Text extracted for context injection */
  extractedText?: string;
  /** Error if extraction failed */
  error?: string;
}

/**
 * ingestFile — basic file ingestion interface.
 * Extracts text content for context injection into the next message.
 * Does NOT implement a full re-parsing system — just text extraction.
 */
export async function ingestFile(req: FileIngestionRequest): Promise<FileIngestionResult> {
  const { file } = req;
  const result: FileIngestionResult = {
    fileName: file.name,
    fileType: file.type,
    sizeBytes: file.size,
  };

  try {
    if (file.type.startsWith("text/") || file.name.endsWith(".md") || file.name.endsWith(".txt") || file.name.endsWith(".csv")) {
      result.extractedText = await file.text();
    } else if (file.type === "application/json") {
      const raw = await file.text();
      result.extractedText = raw.slice(0, 8000); // cap at 8k chars for context
    } else {
      // PDF, DOCX etc — signal to caller that server-side extraction is needed
      result.extractedText = undefined;
      result.error = `${file.type} 需要服务端解析（当前仅支持文本文件）`;
    }
  } catch (e) {
    result.error = "文件读取失败";
  }

  return result;
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

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevConvIdRef = useRef<number | null>(null);

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
      // Remove optimistic message on error
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

  /** Scroll to bottom (smooth or instant) */
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior });
  }, []);

  /** Auto-scroll when new messages arrive */
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 120;
    if (isNearBottom) {
      scrollToBottom("smooth");
    }
  }, [messages.length, scrollToBottom]);

  /** Track scroll position for jump button */
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

    // Build content — prepend file context if pending
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

    // Optimistic message
    const optimistic: DiscussionMessage = {
      id: Date.now(),
      role: "user",
      content: raw, // show original text, not file-prepended
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
    if (!conversationId) return;
    const result = await ingestFile({ file, conversationId });
    setPendingFileContext(result);
    if (result.error) {
      toast.warning(result.error);
    } else {
      toast.success(`已加载 ${result.fileName}`);
    }
  }, [conversationId]);

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
