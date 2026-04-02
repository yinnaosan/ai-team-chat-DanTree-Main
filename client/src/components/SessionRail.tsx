/**
 * SessionRail — DanTree Workspace v2.1-A1
 *
 * 左侧独立列，显示 workspace sessions。
 * 包含：新建 Session、搜索、pinned 区、recent 区、thesisStance 徽章。
 * 默认排序：pinned 优先，其余按 lastActiveAt 降序（由后端保证）。
 */
import React, { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useWorkspace, WorkspaceSession, WorkspaceSessionType } from "@/contexts/WorkspaceContext";
import { useAuth } from "@/_core/hooks/useAuth";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins}分钟前`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}小时前`;
  const days = Math.floor(hrs / 24);
  return `${days}天前`;
}

const SESSION_TYPE_LABELS: Record<WorkspaceSessionType, string> = {
  entity: "股票",
  basket: "组合",
  theme: "主题",
  compare: "对比",
  explore: "探索",
};

const STANCE_BADGE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  bullish:     { bg: "rgba(16,185,129,0.15)", text: "#10b981", label: "多" },
  bearish:     { bg: "rgba(239,68,68,0.15)",  text: "#ef4444", label: "空" },
  neutral:     { bg: "rgba(100,116,139,0.15)", text: "#94a3b8", label: "中" },
  cautious:    { bg: "rgba(245,158,11,0.15)", text: "#f59e0b", label: "谨" },
  unavailable: { bg: "rgba(71,85,105,0.1)",   text: "#475569", label: "—" },
};

function StanceBadge({ stance }: { stance: string | null }) {
  const s = STANCE_BADGE_STYLES[stance ?? "unavailable"] ?? STANCE_BADGE_STYLES.unavailable;
  return (
    <span style={{
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      width: "18px",
      height: "18px",
      borderRadius: "3px",
      fontSize: "9px",
      fontWeight: 700,
      fontFamily: "monospace",
      background: s.bg,
      color: s.text,
      flexShrink: 0,
    }}>
      {s.label}
    </span>
  );
}

// ─── New Session Dialog ───────────────────────────────────────────────────────

interface NewSessionDialogProps {
  onClose: () => void;
  onCreate: (focusKey: string, title: string, sessionType: WorkspaceSessionType) => void;
}

function NewSessionDialog({ onClose, onCreate }: NewSessionDialogProps) {
  const [focusKey, setFocusKey] = useState("");
  const [title, setTitle] = useState("");
  const [sessionType, setSessionType] = useState<WorkspaceSessionType>("entity");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const key = focusKey.trim().toUpperCase();
    if (!key) return;
    const t = title.trim() || key;
    onCreate(key, t, sessionType);
    onClose();
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.6)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        background: "#0f172a", border: "1px solid #1e293b",
        borderRadius: "8px", padding: "20px", width: "300px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
      }} onClick={e => e.stopPropagation()}>
        <div style={{ fontSize: "12px", fontWeight: 700, color: "#e2e8f0", marginBottom: "16px", fontFamily: "monospace" }}>
          新建 Session
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "10px" }}>
            <label style={{ fontSize: "10px", color: "#64748b", fontFamily: "monospace", display: "block", marginBottom: "4px" }}>
              当前对象（Ticker / 代码）
            </label>
            <input
              autoFocus
              value={focusKey}
              onChange={e => setFocusKey(e.target.value)}
              placeholder="如 AAPL / 0700.HK / BTC"
              style={{
                width: "100%", padding: "6px 8px", background: "#1e293b",
                border: "1px solid #334155", borderRadius: "4px",
                color: "#e2e8f0", fontSize: "11px", fontFamily: "monospace",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ marginBottom: "10px" }}>
            <label style={{ fontSize: "10px", color: "#64748b", fontFamily: "monospace", display: "block", marginBottom: "4px" }}>
              Session 名称（可选）
            </label>
            <input
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="留空则使用对象代码"
              style={{
                width: "100%", padding: "6px 8px", background: "#1e293b",
                border: "1px solid #334155", borderRadius: "4px",
                color: "#e2e8f0", fontSize: "11px", fontFamily: "monospace",
                outline: "none", boxSizing: "border-box",
              }}
            />
          </div>
          <div style={{ marginBottom: "16px" }}>
            <label style={{ fontSize: "10px", color: "#64748b", fontFamily: "monospace", display: "block", marginBottom: "4px" }}>
              类型
            </label>
            <select
              value={sessionType}
              onChange={e => setSessionType(e.target.value as WorkspaceSessionType)}
              style={{
                width: "100%", padding: "6px 8px", background: "#1e293b",
                border: "1px solid #334155", borderRadius: "4px",
                color: "#e2e8f0", fontSize: "11px", fontFamily: "monospace",
                outline: "none", boxSizing: "border-box",
              }}
            >
              {(Object.entries(SESSION_TYPE_LABELS) as [WorkspaceSessionType, string][]).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div style={{ display: "flex", gap: "8px" }}>
            <button type="button" onClick={onClose} style={{
              flex: 1, padding: "7px", background: "transparent",
              border: "1px solid #334155", borderRadius: "4px",
              color: "#64748b", fontSize: "11px", fontFamily: "monospace", cursor: "pointer",
            }}>
              取消
            </button>
            <button type="submit" style={{
              flex: 1, padding: "7px", background: "#0ea5e9",
              border: "none", borderRadius: "4px",
              color: "#fff", fontSize: "11px", fontFamily: "monospace", cursor: "pointer",
              fontWeight: 700,
            }}>
              创建
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Session Item ─────────────────────────────────────────────────────────────

interface SessionItemProps {
  session: WorkspaceSession;
  isActive: boolean;
  onSelect: () => void;
  onPin: () => void;
}

function SessionItem({ session, isActive, onSelect, onPin }: SessionItemProps) {
  const [hovered, setHovered] = useState(false);

  // Try to get thesisStance from entity snapshots (L21.2A: auto-snapshot writes here)
  // Fallback chain: entity_snapshots.thesisStance → null (renders as "unavailable")
  const { data: snapshots } = trpc.market.getEntitySnapshots.useQuery(
    { entityKey: session.focusKey, limit: 1 },
    { staleTime: 60_000, enabled: session.sessionType === "entity" }
  );
  // snapshots is { snapshots: [...], count: N } per the route shape
  const latestStance = (snapshots as any)?.snapshots?.[0]?.thesisStance ?? null;

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: "8px 10px",
        borderRadius: "5px",
        cursor: "pointer",
        background: isActive
          ? "rgba(14,165,233,0.12)"
          : hovered ? "rgba(255,255,255,0.04)" : "transparent",
        borderLeft: isActive ? "2px solid #0ea5e9" : "2px solid transparent",
        marginBottom: "2px",
        transition: "background 0.15s",
        position: "relative",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "3px" }}>
        <StanceBadge stance={latestStance} />
        <span style={{
          fontSize: "11px", fontWeight: isActive ? 700 : 500,
          color: isActive ? "#e2e8f0" : "#94a3b8",
          fontFamily: "monospace",
          flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {session.title}
        </span>
        {session.pinned && (
          <span style={{ fontSize: "9px", color: "#f59e0b" }}>📌</span>
        )}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
        <span style={{
          fontSize: "9px", color: "#475569", fontFamily: "monospace",
          background: "rgba(71,85,105,0.2)", padding: "1px 4px", borderRadius: "2px",
        }}>
          {SESSION_TYPE_LABELS[session.sessionType as WorkspaceSessionType] ?? session.sessionType}
        </span>
        <span style={{ fontSize: "9px", color: "#475569", fontFamily: "monospace" }}>
          {session.focusKey}
        </span>
        <span style={{ fontSize: "9px", color: "#334155", fontFamily: "monospace", marginLeft: "auto" }}>
          {formatRelativeTime(session.lastActiveAt)}
        </span>
      </div>
      {hovered && (
        <button
          onClick={e => { e.stopPropagation(); onPin(); }}
          style={{
            position: "absolute", top: "6px", right: "6px",
            background: "transparent", border: "none", cursor: "pointer",
            fontSize: "9px", color: session.pinned ? "#f59e0b" : "#475569",
            padding: "2px",
          }}
          title={session.pinned ? "取消置顶" : "置顶"}
        >
          {session.pinned ? "📌" : "📎"}
        </button>
      )}
    </div>
  );
}

// ─── SessionRail ──────────────────────────────────────────────────────────────

interface SessionRailProps {
  /** Width of the rail in px */
  width?: number;
}

export function SessionRail({ width = 200 }: SessionRailProps) {
  const { user } = useAuth();
  const { currentSession, sessionList, isLoading, createSession, setSession, pinSession } = useWorkspace();
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewDialog, setShowNewDialog] = useState(false);

  const handleCreate = useCallback(async (focusKey: string, title: string, sessionType: WorkspaceSessionType) => {
    await createSession({ focusKey, title, sessionType });
  }, [createSession]);

  const filteredSessions = sessionList.filter(s =>
    !searchQuery ||
    s.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    s.focusKey.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pinnedSessions = filteredSessions.filter(s => s.pinned);
  const recentSessions = filteredSessions.filter(s => !s.pinned);

  if (!user) {
    return (
      <div style={{
        width, minWidth: width, flexShrink: 0,
        background: "#080e1a", borderRight: "1px solid #1e293b",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: "20px",
      }}>
        <span style={{ fontSize: "10px", color: "#334155", fontFamily: "monospace", textAlign: "center" }}>
          登录后<br />查看 Sessions
        </span>
      </div>
    );
  }

  return (
    <>
      <div style={{
        width, minWidth: width, flexShrink: 0,
        background: "#080e1a",
        borderRight: "1px solid #1e293b",
        display: "flex", flexDirection: "column",
        height: "100%",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "12px 10px 8px",
          borderBottom: "1px solid #1e293b",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
            <span style={{ fontSize: "9px", fontWeight: 700, color: "#475569", fontFamily: "monospace", letterSpacing: "0.08em" }}>
              SESSIONS
            </span>
            <button
              onClick={() => setShowNewDialog(true)}
              style={{
                background: "rgba(14,165,233,0.15)", border: "1px solid rgba(14,165,233,0.3)",
                borderRadius: "4px", padding: "3px 8px", cursor: "pointer",
                fontSize: "10px", color: "#0ea5e9", fontFamily: "monospace", fontWeight: 700,
              }}
              title="新建 Session"
            >
              + 新建
            </button>
          </div>
          {/* Search */}
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="搜索 Session..."
            style={{
              width: "100%", padding: "5px 8px",
              background: "#0f172a", border: "1px solid #1e293b",
              borderRadius: "4px", color: "#94a3b8",
              fontSize: "10px", fontFamily: "monospace",
              outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Session List */}
        <div style={{ flex: 1, overflowY: "auto", padding: "8px 6px" }}>
          {isLoading ? (
            <div style={{ padding: "12px", fontSize: "10px", color: "#334155", fontFamily: "monospace", textAlign: "center" }}>
              加载中...
            </div>
          ) : sessionList.length === 0 ? (
            <div style={{ padding: "16px 8px", textAlign: "center" }}>
              <div style={{ fontSize: "10px", color: "#334155", fontFamily: "monospace", lineHeight: 1.6 }}>
                暂无 Session<br />
                <span style={{ color: "#0ea5e9", cursor: "pointer" }} onClick={() => setShowNewDialog(true)}>
                  + 新建第一个
                </span>
              </div>
            </div>
          ) : (
            <>
              {/* Pinned */}
              {pinnedSessions.length > 0 && (
                <>
                  <div style={{ fontSize: "9px", color: "#334155", fontFamily: "monospace", padding: "4px 4px 2px", letterSpacing: "0.06em" }}>
                    已置顶
                  </div>
                  {pinnedSessions.map(s => (
                    <SessionItem
                      key={s.id}
                      session={s}
                      isActive={currentSession?.id === s.id}
                      onSelect={() => setSession(s)}
                      onPin={() => pinSession(s.id, !s.pinned)}
                    />
                  ))}
                  {recentSessions.length > 0 && (
                    <div style={{ height: "1px", background: "#1e293b", margin: "6px 4px" }} />
                  )}
                </>
              )}

              {/* Recent */}
              {recentSessions.length > 0 && (
                <>
                  <div style={{ fontSize: "9px", color: "#334155", fontFamily: "monospace", padding: "4px 4px 2px", letterSpacing: "0.06em" }}>
                    最近会话
                  </div>
                  {recentSessions.map(s => (
                    <SessionItem
                      key={s.id}
                      session={s}
                      isActive={currentSession?.id === s.id}
                      onSelect={() => setSession(s)}
                      onPin={() => pinSession(s.id, !s.pinned)}
                    />
                  ))}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer: current session info */}
        {currentSession && (
          <div style={{
            padding: "8px 10px",
            borderTop: "1px solid #1e293b",
            flexShrink: 0,
          }}>
            <div style={{ fontSize: "9px", color: "#334155", fontFamily: "monospace", marginBottom: "2px" }}>
              当前对象
            </div>
            <div style={{ fontSize: "11px", color: "#0ea5e9", fontFamily: "monospace", fontWeight: 700 }}>
              {currentSession.focusKey}
            </div>
          </div>
        )}
      </div>

      {showNewDialog && (
        <NewSessionDialog
          onClose={() => setShowNewDialog(false)}
          onCreate={handleCreate}
        />
      )}
    </>
  );
}

export default SessionRail;
