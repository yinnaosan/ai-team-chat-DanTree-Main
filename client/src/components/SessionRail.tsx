/**
 * SessionRail.tsx — DanTree Workspace 最终视觉母版 v5
 *
 * 专业 Research Session Control Rail
 * v5: 多选模式 + 批量操作（删除/收藏/置顶）+ 应用内确认弹窗
 */
import React, { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Search, Plus, Pin, Clock, Target, AlertTriangle, Lightbulb, Star,
  Trash2, Pencil, MoreHorizontal, PinOff, StarOff, GripVertical,
  CheckSquare, Square, X, PinIcon,
} from "lucide-react";
import {
  DndContext, closestCenter, KeyboardSensor, PointerSensor,
  useSensor, useSensors, DragEndEvent, DragOverlay, DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy,
  useSortable, arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

export interface SessionItem {
  id: string;
  entity: string;
  title: string;
  market?: string;
  type?: "thesis" | "timing" | "risk" | "research";
  time: string;
  pinned?: boolean;
  favorite?: boolean;
  active?: boolean;
  direction?: "bullish" | "bearish" | "neutral";
  hasAlert?: boolean;
}

export interface SessionActions {
  onPin?: (id: string, pinned: boolean) => void;
  onFavorite?: (id: string, favorite: boolean) => void;
  onRename?: (id: string, newTitle: string) => void;
  onDelete?: (id: string) => void;
}

export interface BatchActions {
  onBatchDelete?: (ids: string[]) => Promise<void>;
  onBatchPin?: (ids: string[], pinned: boolean) => Promise<void>;
  onBatchFavorite?: (ids: string[], favorited: boolean) => Promise<void>;
}

interface SessionRailProps {
  width?: number;
  sessions?: SessionItem[];
  activeSessionId?: string;
  onSelectSession?: (id: string) => void;
  onNewSession?: () => void;
  onNewGeneralSession?: () => void;
  activeEntity?: string;
  highlightId?: string | null;
  actions?: SessionActions;
  batchActions?: BatchActions;
  onReorder?: (orderedIds: string[]) => void;
}

const TYPE_ICON = { thesis: Target, timing: Clock, risk: AlertTriangle, research: Lightbulb };

const MARKET_BADGE_COLOR: Record<string, { bg: string; text: string }> = {
  US:     { bg: "rgba(59,130,246,0.25)",  text: "#93c5fd" },
  HK:     { bg: "rgba(249,115,22,0.25)",  text: "#fdba74" },
  SH:     { bg: "rgba(239,68,68,0.25)",   text: "#fca5a5" },
  SZ:     { bg: "rgba(239,68,68,0.25)",   text: "#fca5a5" },
  CN:     { bg: "rgba(239,68,68,0.25)",   text: "#fca5a5" },
  JP:     { bg: "rgba(168,85,247,0.25)",  text: "#d8b4fe" },
  KR:     { bg: "rgba(20,184,166,0.25)",  text: "#5eead4" },
  CRYPTO: { bg: "rgba(234,179,8,0.25)",   text: "#fde047" },
};

// ─── 应用内确认弹窗 ───────────────────────────────────────────────
function ConfirmDialog({
  open, title, message, confirmLabel, confirmColor, onConfirm, onCancel,
}: {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!open) return null;
  return createPortal(
    <div style={{
      position: "fixed", inset: 0, zIndex: 99999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "rgba(0,0,0,0.60)", backdropFilter: "blur(4px)",
    }} onClick={onCancel}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "rgba(18,20,26,0.98)", border: "1px solid rgba(255,255,255,0.14)",
          borderRadius: 12, padding: "20px 24px", minWidth: 320, maxWidth: 420,
          boxShadow: "0 16px 48px rgba(0,0,0,0.70), 0 4px 16px rgba(0,0,0,0.50)",
        }}
      >
        <div style={{ fontSize: 15, fontWeight: 600, color: "rgba(255,255,255,0.92)", marginBottom: 8 }}>
          {title}
        </div>
        <div style={{ fontSize: 13, color: "rgba(255,255,255,0.60)", lineHeight: 1.6, marginBottom: 20 }}>
          {message}
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              padding: "7px 18px", borderRadius: 7, border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.06)", color: "rgba(255,255,255,0.72)",
              fontSize: 13, fontWeight: 500, cursor: "pointer",
            }}
          >
            取消
          </button>
          <button
            onClick={onConfirm}
            style={{
              padding: "7px 18px", borderRadius: 7, border: "none",
              background: confirmColor ?? "rgba(239,68,68,0.85)", color: "#fff",
              fontSize: 13, fontWeight: 600, cursor: "pointer",
            }}
          >
            {confirmLabel ?? "确定"}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ─── 主组件 ─────────────────────────────────────────────────────
export function SessionRail({
  sessions = [], activeSessionId, onSelectSession, onNewSession, onNewGeneralSession,
  activeEntity, highlightId, actions, batchActions, onReorder,
}: SessionRailProps) {
  const handleNewGeneral = onNewGeneralSession ?? onNewSession;
  const [query, setQuery] = useState("");
  const [activeDragId, setActiveDragId] = useState<string | null>(null);

  // ─── 多选模式 ───
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchLoading, setBatchLoading] = useState(false);

  // ─── 确认弹窗 ───
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean; title: string; message: string;
    confirmLabel?: string; confirmColor?: string;
    onConfirm: () => void;
  }>({ open: false, title: "", message: "", onConfirm: () => {} });

  const showConfirm = useCallback((opts: {
    title: string; message: string; confirmLabel?: string; confirmColor?: string; onConfirm: () => void;
  }) => {
    setConfirmDialog({ open: true, ...opts });
  }, []);

  const closeConfirm = useCallback(() => {
    setConfirmDialog(prev => ({ ...prev, open: false }));
  }, []);

  // 退出多选模式
  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  // 切换单个选中
  const toggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // 全选 / 取消全选
  const toggleSelectAll = useCallback(() => {
    const allIds = sessions.map(s => s.id);
    if (selectedIds.size === allIds.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(allIds));
    }
  }, [sessions, selectedIds.size]);

  // 批量操作
  const handleBatchDelete = useCallback(() => {
    if (selectedIds.size === 0) return;
    showConfirm({
      title: "批量删除",
      message: `确认删除选中的 ${selectedIds.size} 个会话？此操作不可撤销。`,
      confirmLabel: "删除",
      confirmColor: "rgba(239,68,68,0.85)",
      onConfirm: async () => {
        closeConfirm();
        setBatchLoading(true);
        try {
          await batchActions?.onBatchDelete?.(Array.from(selectedIds));
          exitSelectMode();
        } finally { setBatchLoading(false); }
      },
    });
  }, [selectedIds, batchActions, showConfirm, closeConfirm, exitSelectMode]);

  const handleBatchPin = useCallback(async (pinned: boolean) => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      await batchActions?.onBatchPin?.(Array.from(selectedIds), pinned);
      exitSelectMode();
    } finally { setBatchLoading(false); }
  }, [selectedIds, batchActions, exitSelectMode]);

  const handleBatchFavorite = useCallback(async (favorited: boolean) => {
    if (selectedIds.size === 0) return;
    setBatchLoading(true);
    try {
      await batchActions?.onBatchFavorite?.(Array.from(selectedIds), favorited);
      exitSelectMode();
    } finally { setBatchLoading(false); }
  }, [selectedIds, batchActions, exitSelectMode]);

  const filtered = query.trim()
    ? sessions.filter(s =>
        s.title.toLowerCase().includes(query.toLowerCase()) ||
        s.entity.toLowerCase().includes(query.toLowerCase())
      )
    : sessions;

  const pinned = filtered.filter(s => s.pinned);
  const recent = filtered.filter(s => !s.pinned);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragStart = useCallback((event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  }, []);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = recent.findIndex(s => s.id === String(active.id));
    const newIndex = recent.findIndex(s => s.id === String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(recent, oldIndex, newIndex);
    onReorder?.(newOrder.map(s => s.id));
  }, [recent, onReorder]);

  const activeDragItem = activeDragId ? recent.find(s => s.id === activeDragId) : null;

  return (
    <aside style={{
      width: 240, flexShrink: 0, display: "flex", flexDirection: "column", height: "100%",
      background: "rgba(3,4,8,1.00)", backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)",
      borderRight: "1px solid rgba(255,255,255,0.12)",
    }}>
      {/* Column Header */}
      <div style={{
        display: "flex", alignItems: "center", justifyContent: "space-between",
        padding: "12px 14px 11px", borderBottom: "1px solid rgba(255,255,255,0.12)",
        background: "rgba(255,255,255,0.025)", flexShrink: 0,
      }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: "rgba(255,255,255,0.92)", letterSpacing: "0.12em", textTransform: "uppercase" }}>
          研究会话
        </span>
        {/* 多选模式切换按钮 */}
        {sessions.length > 0 && (
          <button
            onClick={() => selectMode ? exitSelectMode() : setSelectMode(true)}
            title={selectMode ? "退出多选" : "多选管理"}
            style={{
              width: 24, height: 24, borderRadius: 5, border: "none",
              background: selectMode ? "rgba(52,211,153,0.20)" : "rgba(255,255,255,0.06)",
              cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
              transition: "background 0.12s",
            }}
          >
            {selectMode
              ? <X size={12} color="#34d399" />
              : <CheckSquare size={12} color="rgba(255,255,255,0.50)" />
            }
          </button>
        )}
      </div>

      {/* 多选模式工具栏 */}
      {selectMode && (
        <div style={{
          padding: "8px 10px", borderBottom: "1px solid rgba(255,255,255,0.08)",
          background: "rgba(52,211,153,0.04)", flexShrink: 0,
        }}>
          {/* 选中计数 + 全选 */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.60)" }}>
              已选 <span style={{ color: "#34d399", fontWeight: 700 }}>{selectedIds.size}</span> / {sessions.length}
            </span>
            <button
              onClick={toggleSelectAll}
              style={{
                fontSize: 11, color: "rgba(52,211,153,0.85)", background: "none",
                border: "none", cursor: "pointer", fontWeight: 500,
                textDecoration: "underline", textUnderlineOffset: 2,
              }}
            >
              {selectedIds.size === sessions.length ? "取消全选" : "全选"}
            </button>
          </div>

          {/* 批量操作按钮 */}
          <div style={{ display: "flex", gap: 6 }}>
            <BatchButton
              icon={Pin} label="置顶" disabled={selectedIds.size === 0 || batchLoading}
              onClick={() => handleBatchPin(true)}
            />
            <BatchButton
              icon={Star} label="收藏" color="#fbbf24" disabled={selectedIds.size === 0 || batchLoading}
              onClick={() => handleBatchFavorite(true)}
            />
            <BatchButton
              icon={Trash2} label="删除" color="#f87171" disabled={selectedIds.size === 0 || batchLoading}
              onClick={handleBatchDelete}
            />
          </div>
        </div>
      )}

      {/* Search + New */}
      {!selectMode && (
        <div style={{ padding: "8px 10px 6px" }}>
          <div style={{ display: "flex", gap: 6 }}>
            <div style={{ flex: 1, position: "relative" }}>
              <Search size={12} color="rgba(255,255,255,0.18)" style={{ position: "absolute", left: 9, top: "50%", transform: "translateY(-50%)", pointerEvents: "none" }} />
              <input
                value={query} onChange={e => setQuery(e.target.value)}
                placeholder="搜索..."
                style={{
                  width: "100%", height: 28, paddingLeft: 28, paddingRight: 8,
                  fontSize: 12, lineHeight: 1, background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.12)", borderRadius: 6,
                  color: "rgba(255,255,255,0.80)", outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
            <button
              onClick={handleNewGeneral}
              title="新建空白研究（General Session）"
              style={{
                width: 28, height: 28, borderRadius: 6, border: "1px solid rgba(52,211,153,0.20)",
                background: "rgba(52,211,153,0.08)", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
              }}
            >
              <Plus size={14} color="#34d399" />
            </button>
          </div>
        </div>
      )}

      {/* List */}
      <div style={{ flex: 1, overflowY: "auto", padding: "2px 6px 8px" }}>
        {sessions.length === 0 && (
          <div style={{ padding: "28px 12px", textAlign: "center" }}>
            <Target size={18} color="rgba(255,255,255,0.10)" style={{ margin: "0 auto 8px", display: "block" }} />
            <p style={{ fontSize: 11, color: "rgba(255,255,255,0.24)", lineHeight: 1.6, margin: 0 }}>
              暂无研究会话<br />点击 + 开始新分析
            </p>
          </div>
        )}

        {/* Pinned */}
        {pinned.length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <SectionLabel icon={Pin} label="已置顶" />
            {pinned.map(s => (
              <SessionCard
                key={s.id} session={s}
                isActive={s.id === activeSessionId}
                isHighlighted={s.id === highlightId}
                onClick={() => selectMode ? toggleSelect(s.id) : onSelectSession?.(s.id)}
                actions={actions} draggable={false}
                selectMode={selectMode}
                selected={selectedIds.has(s.id)}
                onToggleSelect={() => toggleSelect(s.id)}
                showConfirm={showConfirm}
                closeConfirm={closeConfirm}
              />
            ))}
          </div>
        )}

        {/* Recent — 支持拖拽排序 */}
        {recent.length > 0 && (
          selectMode ? (
            <div>
              {recent.map(s => (
                <SessionCard
                  key={s.id} session={s}
                  isActive={s.id === activeSessionId}
                  isHighlighted={s.id === highlightId}
                  onClick={() => toggleSelect(s.id)}
                  actions={actions} draggable={false}
                  selectMode={selectMode}
                  selected={selectedIds.has(s.id)}
                  onToggleSelect={() => toggleSelect(s.id)}
                  showConfirm={showConfirm}
                  closeConfirm={closeConfirm}
                />
              ))}
            </div>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter}
              onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
              <SortableContext items={recent.map(s => s.id)} strategy={verticalListSortingStrategy}>
                <div>
                  {recent.map(s => (
                    <SortableSessionCard
                      key={s.id} session={s}
                      isActive={s.id === activeSessionId}
                      isHighlighted={s.id === highlightId}
                      onClick={() => onSelectSession?.(s.id)}
                      actions={actions}
                      isDragging={s.id === activeDragId}
                      showConfirm={showConfirm}
                      closeConfirm={closeConfirm}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {activeDragItem ? (
                  <SessionCard
                    session={activeDragItem}
                    isActive={activeDragItem.id === activeSessionId}
                    isHighlighted={false} onClick={() => {}}
                    actions={undefined} draggable={false} isOverlay
                    showConfirm={showConfirm} closeConfirm={closeConfirm}
                  />
                ) : null}
              </DragOverlay>
            </DndContext>
          )
        )}
      </div>

      {/* 确认弹窗 */}
      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmLabel={confirmDialog.confirmLabel}
        confirmColor={confirmDialog.confirmColor}
        onConfirm={confirmDialog.onConfirm}
        onCancel={closeConfirm}
      />
    </aside>
  );
}

// ─── 批量操作按钮 ─────────────────────────────────────────────
function BatchButton({ icon: Icon, label, color, disabled, onClick }: {
  icon: React.FC<any>; label: string; color?: string; disabled?: boolean; onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const c = color ?? "rgba(255,255,255,0.72)";
  return (
    <button
      onClick={onClick} disabled={disabled}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
        padding: "5px 0", borderRadius: 6, border: "1px solid rgba(255,255,255,0.10)",
        background: hovered && !disabled ? "rgba(255,255,255,0.08)" : "rgba(255,255,255,0.03)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.4 : 1, transition: "background 0.12s, opacity 0.12s",
        color: c, fontSize: 11, fontWeight: 500,
      }}
    >
      <Icon size={12} color={c} />
      {label}
    </button>
  );
}

function SectionLabel({ icon: Icon, label }: { icon: React.FC<any>; label: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, padding: "6px 8px 4px" }}>
      <Icon size={9} color="rgba(255,255,255,0.28)" />
      <span style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.32)", textTransform: "uppercase", letterSpacing: "0.10em" }}>
        {label}
      </span>
    </div>
  );
}

/** 可排序的 SessionCard 包装器 */
function SortableSessionCard(props: {
  session: SessionItem; isActive: boolean; isHighlighted?: boolean;
  onClick: () => void; actions?: SessionActions; isDragging?: boolean;
  showConfirm: (opts: any) => void; closeConfirm: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging: isSortableDragging } = useSortable({ id: props.session.id });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform), transition,
    opacity: isSortableDragging ? 0.35 : 1, position: "relative",
  };
  return (
    <div ref={setNodeRef} style={style}>
      <SessionCard {...props} draggable dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function SessionCard({
  session, isActive, isHighlighted, onClick, actions, draggable, dragHandleProps, isOverlay,
  selectMode, selected, onToggleSelect, showConfirm, closeConfirm,
}: {
  session: SessionItem; isActive: boolean; isHighlighted?: boolean;
  onClick: () => void; actions?: SessionActions;
  draggable?: boolean; dragHandleProps?: Record<string, any>; isOverlay?: boolean;
  selectMode?: boolean; selected?: boolean; onToggleSelect?: () => void;
  showConfirm: (opts: any) => void; closeConfirm: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [flash, setFlash] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.title);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isHighlighted) { setFlash(true); const t = setTimeout(() => setFlash(false), 800); return () => clearTimeout(t); }
  }, [isHighlighted]);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [menuOpen]);

  useEffect(() => {
    if (renaming) { setRenameValue(session.title); setTimeout(() => renameRef.current?.select(), 50); }
  }, [renaming, session.title]);

  const TypeIcon = TYPE_ICON[session.type ?? "research"] ?? Lightbulb;
  const dirColor = session.direction === "bullish" ? "#34d399" : session.direction === "bearish" ? "#f87171" : "rgba(255,255,255,0.30)";

  const handleRenameConfirm = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== session.title) actions?.onRename?.(session.id, trimmed);
    setRenaming(false);
  };

  const handleMenuAction = (e: React.MouseEvent, action: () => void) => {
    e.stopPropagation();
    setMenuOpen(false);
    action();
  };

  const badgeColor = session.market ? MARKET_BADGE_COLOR[session.market] : null;

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); if (!menuOpen) setMenuOpen(false); }}
    >
      {/* 多选勾选框 */}
      {selectMode && (
        <button
          onClick={e => { e.stopPropagation(); onToggleSelect?.(); }}
          style={{
            position: "absolute", left: 2, top: "50%", transform: "translateY(-50%)",
            width: 20, height: 20, display: "flex", alignItems: "center", justifyContent: "center",
            background: "none", border: "none", cursor: "pointer", zIndex: 10,
          }}
        >
          {selected
            ? <CheckSquare size={14} color="#34d399" fill="rgba(52,211,153,0.20)" />
            : <Square size={14} color="rgba(255,255,255,0.30)" />
          }
        </button>
      )}

      {/* 拖拽手柄 */}
      {!selectMode && draggable && (hovered || isOverlay) && !renaming && (
        <div
          {...dragHandleProps}
          style={{
            position: "absolute", left: -2, top: "50%", transform: "translateY(-50%)",
            width: 16, height: 28, display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "grab", zIndex: 10, opacity: 0.45, touchAction: "none",
          }}
          title="拖拽排序" onClick={e => e.stopPropagation()}
        >
          <GripVertical size={11} color="rgba(255,255,255,0.60)" />
        </div>
      )}

      <button
        onClick={renaming ? undefined : onClick}
        style={{
          width: "100%", textAlign: "left",
          display: "flex", alignItems: "flex-start", gap: 8,
          padding: "9px 10px", borderRadius: 7, marginBottom: 2,
          cursor: renaming ? "default" : "pointer", border: "none",
          borderLeft: `3px solid ${selectMode && selected ? "#34d399" : isActive && !selectMode ? "#34d399" : "transparent"}`,
          background: selectMode && selected
            ? "rgba(52,211,153,0.12)"
            : flash ? "rgba(52,211,153,0.30)"
            : isActive ? "rgba(52,211,153,0.16)"
            : hovered ? "rgba(255,255,255,0.065)" : "transparent",
          boxShadow: isOverlay
            ? "0 8px 32px rgba(0,0,0,0.60), 0 2px 8px rgba(0,0,0,0.40)"
            : flash ? "0 0 0 2px rgba(52,211,153,0.60), 0 0 16px rgba(52,211,153,0.30)"
            : isActive && !selectMode ? "0 0 0 1px rgba(52,211,153,0.32), inset 0 0 24px rgba(52,211,153,0.10), 0 2px 12px rgba(52,211,153,0.12)" : "none",
          transition: "background 0.15s, box-shadow 0.15s",
          paddingRight: !selectMode && hovered ? 32 : 10,
          paddingLeft: selectMode ? 26 : (draggable && hovered ? 18 : 10),
        }}
      >
        {/* Type badge */}
        <div style={{
          width: 26, height: 26, borderRadius: 6, flexShrink: 0, marginTop: 1,
          background: isActive ? "rgba(52,211,153,0.14)" : "rgba(255,255,255,0.05)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <TypeIcon size={13} color={isActive ? "#34d399" : "rgba(255,255,255,0.32)"} />
        </div>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 4 }}>
            {renaming ? (
              <input
                ref={renameRef} value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onBlur={handleRenameConfirm}
                onKeyDown={e => { if (e.key === "Enter") handleRenameConfirm(); if (e.key === "Escape") setRenaming(false); }}
                onClick={e => e.stopPropagation()}
                style={{
                  flex: 1, fontSize: 13, fontWeight: 500,
                  background: "rgba(255,255,255,0.08)", border: "1px solid rgba(52,211,153,0.40)",
                  borderRadius: 4, color: "rgba(237,237,239,0.92)", outline: "none", padding: "1px 5px",
                }}
              />
            ) : (
              <span style={{
                fontSize: 14, fontWeight: isActive ? 600 : 500,
                color: isActive ? "rgba(237,237,239,0.96)" : "rgba(255,255,255,0.72)",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, lineHeight: 1.3,
              }}>
                {session.title}
              </span>
            )}
            {session.hasAlert && !renaming && (
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
            )}
            {session.favorite && !renaming && (
              <Star size={9} color="#fbbf24" fill="#fbbf24" style={{ flexShrink: 0 }} />
            )}
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            {badgeColor ? (
              <span style={{
                fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
                background: badgeColor.bg, color: badgeColor.text,
                letterSpacing: "0.04em", flexShrink: 0,
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
              }}>
                {session.market}
              </span>
            ) : null}
            {session.entity && session.entity !== "—" && (
              <span style={{
                fontSize: 12, fontWeight: 700,
                color: isActive ? "rgba(52,211,153,0.85)" : "rgba(255,255,255,0.50)",
                fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
                letterSpacing: "0.04em", overflow: "hidden", textOverflow: "ellipsis",
                whiteSpace: "nowrap", flex: 1,
              }}>
                {session.entity}
              </span>
            )}
            {(!session.entity || session.entity === "—") && session.direction && session.direction !== "neutral" && (
              <span style={{ fontSize: 11, fontWeight: 600, color: dirColor, flex: 1 }}>
                {session.direction === "bullish" ? "看多" : "看空"}
              </span>
            )}
            <span style={{
              fontSize: 11, color: "rgba(255,255,255,0.28)", marginLeft: "auto", flexShrink: 0,
              fontFamily: "'IBM Plex Mono', ui-monospace, monospace",
            }}>
              {session.time}
            </span>
          </div>
        </div>
      </button>

      {/* ⋯ 操作按钮（非多选模式悬停时显示） */}
      {!selectMode && (hovered || menuOpen) && !renaming && (
        <button
          onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
          style={{
            position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
            width: 22, height: 22, borderRadius: 5, border: "none",
            background: menuOpen ? "rgba(255,255,255,0.12)" : "rgba(255,255,255,0.06)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            transition: "background 0.12s",
          }}
        >
          <MoreHorizontal size={12} color="rgba(255,255,255,0.60)" />
        </button>
      )}

      {/* 操作菜单 */}
      {menuOpen && !selectMode && (
        <div
          ref={menuRef}
          style={{
            position: "absolute", right: 4, top: "calc(100% - 4px)", zIndex: 100,
            background: "rgba(18,20,26,0.98)", border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 8, padding: "4px 0",
            boxShadow: "0 8px 32px rgba(0,0,0,0.60), 0 2px 8px rgba(0,0,0,0.40)",
            minWidth: 148, backdropFilter: "blur(16px)",
          }}
        >
          <MenuAction icon={session.pinned ? PinOff : Pin} label={session.pinned ? "取消置顶" : "置顶"}
            onClick={e => handleMenuAction(e, () => actions?.onPin?.(session.id, !session.pinned))} />
          <MenuAction icon={session.favorite ? StarOff : Star} label={session.favorite ? "取消收藏" : "收藏"}
            color={session.favorite ? undefined : "#fbbf24"}
            onClick={e => handleMenuAction(e, () => actions?.onFavorite?.(session.id, !session.favorite))} />
          <MenuAction icon={Pencil} label="改名"
            onClick={e => handleMenuAction(e, () => setRenaming(true))} />
          <div style={{ height: 1, background: "rgba(255,255,255,0.08)", margin: "3px 0" }} />
          <MenuAction icon={Trash2} label="删除" color="#f87171"
            onClick={e => handleMenuAction(e, () => {
              showConfirm({
                title: "删除会话",
                message: `确认删除会话「${session.title}」？此操作不可撤销。`,
                confirmLabel: "删除",
                confirmColor: "rgba(239,68,68,0.85)",
                onConfirm: () => { closeConfirm(); actions?.onDelete?.(session.id); },
              });
            })} />
        </div>
      )}
    </div>
  );
}

function MenuAction({ icon: Icon, label, color, onClick }: {
  icon: React.FC<any>; label: string; color?: string; onClick: (e: React.MouseEvent) => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        width: "100%", display: "flex", alignItems: "center", gap: 8,
        padding: "6px 12px", border: "none", cursor: "pointer",
        background: hovered ? "rgba(255,255,255,0.07)" : "transparent",
        color: color ?? "rgba(255,255,255,0.72)",
        fontSize: 12, fontWeight: 400, textAlign: "left", transition: "background 0.10s",
      }}
    >
      <Icon size={13} color={color ?? "rgba(255,255,255,0.50)"} />
      {label}
    </button>
  );
}
