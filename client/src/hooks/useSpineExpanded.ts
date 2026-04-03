/**
 * useSpineExpanded — DanTree Workspace v2.1-B2c
 * 四块折叠状态 sessionStorage 持久化
 * key 格式：spine_{sessionId}_{section}_expanded
 * 默认值：true（维持当前默认展开行为）
 * session-aware：不同 session 互相独立，不污染
 */
import { useState, useCallback, useEffect } from "react";

type SpineSection = "thesis" | "timing" | "alert" | "history";

function getKey(sessionId: string | null | undefined, section: SpineSection): string {
  // 若无 sessionId，使用 "default" 作为 fallback，避免 key 为 undefined
  const sid = sessionId || "default";
  return `spine_${sid}_${section}_expanded`;
}

function readStorage(key: string, defaultValue: boolean): boolean {
  try {
    const raw = sessionStorage.getItem(key);
    if (raw === null) return defaultValue;
    return raw === "true";
  } catch {
    return defaultValue;
  }
}

function writeStorage(key: string, value: boolean): void {
  try {
    sessionStorage.setItem(key, String(value));
  } catch {
    // sessionStorage 不可用时静默失败（隐私模式等）
  }
}

/**
 * useSpineExpanded
 * @param sessionId  当前 session 的唯一标识（来自 WorkspaceContext.currentSession.id）
 * @param section    区块名称
 * @param defaultExpanded  初始默认值（默认 true）
 */
export function useSpineExpanded(
  sessionId: string | null | undefined,
  section: SpineSection,
  defaultExpanded = true
): [boolean, (value: boolean | ((prev: boolean) => boolean)) => void] {
  const key = getKey(sessionId, section);

  const [expanded, setExpandedState] = useState<boolean>(() =>
    readStorage(key, defaultExpanded)
  );

  // 当 sessionId 变化时（切换 session），重新从 storage 读取
  useEffect(() => {
    const newKey = getKey(sessionId, section);
    setExpandedState(readStorage(newKey, defaultExpanded));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const setExpanded = useCallback(
    (value: boolean | ((prev: boolean) => boolean)) => {
      setExpandedState(prev => {
        const next = typeof value === "function" ? value(prev) : value;
        writeStorage(getKey(sessionId, section), next);
        return next;
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sessionId, section]
  );

  return [expanded, setExpanded];
}
