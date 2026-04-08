/**
 * DiscussionPanelVNext.tsx
 * 映射来源: components/workspace/discussion-panel.tsx
 *
 * Discussion Panel — 副驾驶推理区
 * 壳层状态: props-first，无 initialMessages demo
 * Manus 接线入口: messages / isStreaming / onSendMessage / entity
 *
 * STRICT: 所有 assistant 消息都走 adapter → WorkspaceDiscussionRender
 * 禁止 raw content fallback
 */
import React, { useRef, useEffect, useState, useMemo } from "react";
import { Send, Sparkles, User, ArrowRight, MoreHorizontal } from "lucide-react";
import { ManusOrb } from "@/components/ManusOrb";
import { WorkspaceDiscussionRender } from "@/components/WorkspaceDiscussionRender";
import type { DiscussionViewModel } from "@/lib/WorkspaceOutputModel";
import { adaptToWorkspaceOutput } from "@/lib/workspaceOutputAdapter";


// ── Types ─────────────────────────────────────────────────────────────────────

export interface DiscussionMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  /** 推理证据要点列表 — 显示为编号卡片 */
  keyPoints?: string[];
  /** 建议下一步 — 显示为绿色引导条 */
  suggestedNext?: string;
  /** Optional answerObject metadata for adapter */
  answerObject?: any;
}

export interface DiscussionPanelVNextProps {
  /**
   * WorkspaceOutputRefactor v1 — structured view model for latest assistant message.
   * When provided, replaces raw text rendering for the latest assistant message.
   */
  latestAssistantViewModel?: DiscussionViewModel;
  /** Called when user clicks a followup suggestion */
  onFollowup?: (question: string) => void;
  /** Manus 注入标的代码 */
  entity?: string;
  /** Manus 注入消息列表 */
  messages?: DiscussionMessage[];
  /** Manus 注入流式状态 */
  isStreaming?: boolean;
  /** Manus 绑定发送回调 */
  onSendMessage?: (text: string) => void;
  /** 输入框占位文案 */
  placeholder?: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DiscussionPanelVNext({
  entity,
  messages = [],
  isStreaming = false,
  onSendMessage,
  latestAssistantViewModel,
  onFollowup,
  placeholder,
}: DiscussionPanelVNextProps) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = () => {
    const text = input.trim();
    if (!text || isStreaming) return;
    onSendMessage?.(text);
    setInput("");
  };

  // Build per-message view models for ALL assistant messages via adapter
  const messageViewModels = useMemo(() => {
    const vms = new Map<string, DiscussionViewModel>();
    const assistantMsgs = messages.filter(m => m.role === "assistant");
    
    for (let i = 0; i < assistantMsgs.length; i++) {
      const msg = assistantMsgs[i];
      const isLast = i === assistantMsgs.length - 1;
      
      // Latest message: use pre-computed latestAssistantViewModel if available
      if (isLast && latestAssistantViewModel) {
        vms.set(msg.id, latestAssistantViewModel);
      } else {
        // All other assistant messages: run through adapter
        const output = adaptToWorkspaceOutput({
          content: msg.content,
          answerObject: msg.answerObject,
          entity,
        });
        vms.set(msg.id, output.discussion);
      }
    }
    return vms;
  }, [messages, latestAssistantViewModel, entity]);

  const defaultPlaceholder = placeholder
    ?? (entity ? `讨论 ${entity} 的 Thesis、Timing 或 Risk...` : "讨论 Thesis、Timing 或 Risk...");

  return (
    <aside style={{
      flex: 1, minWidth: 280, height: "100%",
      display: "flex", flexDirection: "column",
      background: "linear-gradient(180deg, #11151b 0%, #0d1016 100%)",
      borderLeft: "1px solid rgba(255,255,255,0.04)",
    }}>

      {/* Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 18px 10px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        flexShrink: 0,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.60)" }}>Discussion</span>
          <span style={{ fontSize: 10, color: "rgba(255,255,255,0.22)" }}>AI 辅助</span>
          {entity && (
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.20)", fontFamily: "ui-monospace, monospace" }}>
              · {entity}
            </span>
          )}
        </div>
        <button style={{ background: "none", border: "none", cursor: "pointer", padding: 3 }}>
          <MoreHorizontal size={14} color="rgba(255,255,255,0.16)" />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto" }}>
        {messages.length === 0 ? (
          <div style={{
            display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center",
            height: "100%", gap: 10, padding: "24px",
          }}>
            <Sparkles size={24} color="rgba(16,185,129,0.14)" />
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.18)", textAlign: "center", lineHeight: 1.7, margin: 0 }}>
              {entity
                ? `开始讨论 ${entity} 的投资论点`
                : "选择标的，开始讨论"}
            </p>
          </div>
        ) : (
          <div style={{ padding: "8px 0 4px" }}>
            {messages.map((msg, idx) => {
              const isLatest = idx === messages.length - 1 && msg.role === "assistant";
              const isUser = msg.role === "user";
              return (
                <div key={msg.id} style={{
                  padding: "14px 18px",
                  borderLeft: isLatest
                    ? "2px solid rgba(16,185,129,0.28)"
                    : "2px solid transparent",
                }}>
                  {/* Role + time */}
                  <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 8 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                      background: isUser ? "rgba(255,255,255,0.05)" : "rgba(16,185,129,0.10)",
                      display: "flex", alignItems: "center", justifyContent: "center",
                    }}>
                      {isUser
                        ? <User size={10} color="rgba(255,255,255,0.35)" />
                        : <Sparkles size={10} color="rgba(16,185,129,0.65)" />}
                    </div>
                    <span style={{ fontSize: 10, fontWeight: 500, color: "rgba(255,255,255,0.38)" }}>
                      {isUser ? "你" : "助手"}
                    </span>
                    <span style={{ fontSize: 9, color: "rgba(255,255,255,0.16)" }}>{msg.timestamp}</span>
                  </div>

                  {/* Body — ALL messages go through adapter, no raw fallback */}
                  {isUser ? (
                    <div style={{ paddingLeft: 27 }}>
                      <p style={{ fontSize: 13, lineHeight: 1.78, margin: 0, color: "rgba(255,255,255,0.72)" }}>
                        {msg.content}
                      </p>
                    </div>
                  ) : (
                    // ALL assistant messages: structured render via adapter
                    <WorkspaceDiscussionRender
                      viewModel={messageViewModels.get(msg.id) ?? { blocks: [], isStructured: false }}
                      onFollowup={onFollowup}
                    />
                  )}
                </div>
              );
            })}

            {/* Streaming indicator — ManusOrb 悬浮小球 */}
            {isStreaming && (
              <div style={{ padding: "14px 18px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <ManusOrb isActive size={32} />
                  <span style={{ fontSize: 11, color: "rgba(255,255,255,0.35)", letterSpacing: "0.04em" }}>分析中...</span>
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {/* Input area */}
      <div style={{ padding: "10px 14px 14px", flexShrink: 0 }}>
        <div style={{
          position: "relative", borderRadius: 10,
          background: "rgba(255,255,255,0.025)",
          border: "1px solid rgba(255,255,255,0.07)",
        }}>
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={defaultPlaceholder}
            rows={1}
            style={{
              width: "100%", background: "transparent", border: "none", outline: "none",
              padding: "12px 46px 12px 14px",
              fontSize: 13, color: "rgba(255,255,255,0.80)",
              resize: "none", lineHeight: 1.6, fontFamily: "inherit", boxSizing: "border-box",
            }}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isStreaming}
            style={{
              position: "absolute", right: 10, bottom: 9,
              width: 28, height: 28, borderRadius: 7, border: "none", cursor: "pointer",
              background: input.trim() ? "rgba(16,185,129,0.88)" : "rgba(255,255,255,0.04)",
              display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.15s",
            }}
          >
            <Send size={12} color={input.trim() ? "#fff" : "rgba(255,255,255,0.15)"} />
          </button>
        </div>
      </div>
    </aside>
  );
}
