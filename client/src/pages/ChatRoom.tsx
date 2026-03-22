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
import { InlineChart, parseChartBlocks } from "@/components/InlineChart";
import {
  Bot, Brain, User, Settings, Send, Plus, Menu, X,
  Wifi, WifiOff, ChevronDown, LogOut, Shield, Loader2,
  MessageSquare, Database, History, Download, Star, Pin,
  MoreHorizontal, ChevronRight, FileText, Table2, Copy, Check,
  Paperclip, Image, Film, Music, File, XCircle, Sparkles,
  FolderPlus, Folder, FolderOpen, Pencil, Trash2, MoveRight, FileDown,
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

// ─── Types ────────────────────────────────────────────────────────────────────────────────
type MsgRole = "user" | "manus" | "chatgpt" | "system" | "assistant";
interface DataSource {
  domain: string;
  url: string;
  title: string;
  success: boolean;
}
interface ApiSource {
  name: string;        // API 显示名称，如 "Yahoo Finance"
  category: string;   // 分类，如 "市场数据" | "宏观指标" | "新闻情绪" | "加密货币" | "A股数据"
  icon?: string;      // 可选 emoji 图标
  description?: string; // 可选简短说明，如 "财务报表"
  latencyMs?: number; // 实际调用耗时（毫秒）
}
interface Msg {
  id: number;
  role: MsgRole;
  content: string;
  taskId?: number | null;
  conversationId?: number | null;
  createdAt: Date;
  metadata?: {
    dataSources?: DataSource[];
    apiSources?: ApiSource[];
    citationHits?: ApiSource[];
    answerObject?: {
      verdict: string;
      confidence: "high" | "medium" | "low";
      data_gaps?: string[];
      citations_count?: number;
      citations?: Array<{ claim: string; source: string; value?: string }>;
    };
    evidenceScore?: number;
    outputMode?: "decisive" | "directional" | "framework_only";
  } | null;
}

// ─── Attachment Types ─────────────────────────────────────────────
interface PendingFile {
  id: string;
  file: File;
  preview?: string;
  uploading: boolean;
  uploadedUrl?: string;
  attachmentId?: number;  // 数据库附件ID（用于AI分析）
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

function DownloadMenu({ content, taskTitle, msgRef }: { content: string; taskTitle?: string; msgRef?: React.RefObject<HTMLDivElement | null> }) {
  const [open, setOpen] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);
  const tables = useMemo(() => extractTables(content), [content]);
  const slug = (taskTitle || "ai-reply").slice(0, 30).replace(/\s+/g, "-");

  const handlePdfExport = async () => {
    setOpen(false);
    if (!msgRef?.current) {
      // fallback: export as text if no ref
      const { exportAsText } = await import("@/lib/exportMessage");
      exportAsText(content, taskTitle);
      return;
    }
    setPdfLoading(true);
    try {
      const { exportAsPDF } = await import("@/lib/exportMessage");
      await exportAsPDF(msgRef.current, taskTitle);
    } catch {
      toast.error("导出 PDF 失败，请重试");
    } finally {
      setPdfLoading(false);
    }
  };

  return (
    <div className="relative">
      <button onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs transition-all hover:bg-white/8"
        style={{ color: pdfLoading ? "oklch(0.72 0.18 250)" : "oklch(0.55 0.01 270)" }}
        disabled={pdfLoading}>
        {pdfLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3" />}
        {pdfLoading ? "导出中..." : "导出"}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-7 z-50 rounded-xl py-1 min-w-[170px] shadow-xl"
            style={{ background: "oklch(0.20 0.007 270)", border: "1px solid oklch(0.28 0.008 270)" }}>
            <button onClick={() => { downloadText(content, `${slug}.md`, "text/markdown"); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8"
              style={{ color: "oklch(0.82 0.005 270)" }}>
              <FileText className="w-3.5 h-3.5" style={{ color: "oklch(0.72 0.18 250)" }} />Markdown (.md)
            </button>
            <button onClick={() => { downloadText(content, `${slug}.txt`, "text/plain"); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8"
              style={{ color: "oklch(0.82 0.005 270)" }}>
              <FileText className="w-3.5 h-3.5" />纯文本 (.txt)
            </button>
            <button onClick={handlePdfExport}
              className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8"
              style={{ color: "oklch(0.82 0.005 270)" }}>
              <FileText className="w-3.5 h-3.5" style={{ color: "oklch(0.72 0.18 25)" }} />PDF 文档 (.pdf)
            </button>
            {tables.length > 0 && tables.map((t, i) => (
              <button key={i} onClick={() => { downloadText(tableToCSV(t), `${slug}-table${i + 1}.csv`, "text/csv"); setOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8"
                style={{ color: "oklch(0.82 0.005 270)" }}>
                <Table2 className="w-3.5 h-3.5" style={{ color: "oklch(0.74 0.14 155)" }} />表格 {tables.length > 1 ? i + 1 : ""} (.csv)
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function parseFollowups(content: string): { cleanContent: string; followups: string[] } {
  const followups: string[] = [];
  const cleanContent = content.replace(/%%FOLLOWUP%%([\s\S]*?)%%END%%/g, (_, q) => {
    const trimmed = q.trim();
    if (trimmed) followups.push(trimmed);
    return "";
  }).trim();
  return { cleanContent, followups };
}

// ─── DataSourcesFooter ───────────────────────────────────────────────────────────────────────────────
// 分类颜色映射
const CATEGORY_COLORS: Record<string, { bg: string; text: string; border: string }> = {
  "市场数据": { bg: "oklch(0.72 0.18 250 / 0.1)", text: "oklch(0.60 0.12 250)", border: "oklch(0.72 0.18 250 / 0.25)" },
  "宏观指标": { bg: "oklch(0.72 0.18 155 / 0.1)", text: "oklch(0.55 0.15 155)", border: "oklch(0.72 0.18 155 / 0.25)" },
  "新闻情绪": { bg: "oklch(0.72 0.18 50 / 0.1)", text: "oklch(0.60 0.15 50)", border: "oklch(0.72 0.18 50 / 0.25)" },
  "加密货币": { bg: "oklch(0.72 0.18 310 / 0.1)", text: "oklch(0.60 0.12 310)", border: "oklch(0.72 0.18 310 / 0.25)" },
  "A股数据": { bg: "oklch(0.72 0.18 25 / 0.1)", text: "oklch(0.60 0.15 25)", border: "oklch(0.72 0.18 25 / 0.25)" },
  "模型数据": { bg: "oklch(0.55 0.01 270 / 0.1)", text: "oklch(0.50 0.01 270)", border: "oklch(0.55 0.01 270 / 0.25)" },
  "法律监管": { bg: "oklch(0.72 0.18 200 / 0.1)", text: "oklch(0.55 0.12 200)", border: "oklch(0.72 0.18 200 / 0.25)" },
  "港股公告": { bg: "oklch(0.72 0.18 25 / 0.08)", text: "oklch(0.60 0.15 25)", border: "oklch(0.72 0.18 25 / 0.2)" },
  "期权数据": { bg: "oklch(0.72 0.18 280 / 0.1)", text: "oklch(0.60 0.12 280)", border: "oklch(0.72 0.18 280 / 0.25)" },
  "技术分析": { bg: "oklch(0.72 0.18 170 / 0.1)", text: "oklch(0.55 0.12 170)", border: "oklch(0.72 0.18 170 / 0.25)" },
};

function ApiSourceBadge({ src }: { src: ApiSource }) {
  const colors = CATEGORY_COLORS[src.category] ?? CATEGORY_COLORS["网页搜索"];
  return (
    <span
      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
      style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.border}` }}
    >
      {src.icon && <span>{src.icon}</span>}
      <span>{src.name}</span>
      {src.latencyMs !== undefined && (
        <span style={{ color: colors.text, opacity: 0.6, fontSize: "0.65rem" }}>{src.latencyMs}ms</span>
      )}
    </span>
  );
}

function DataSourcesFooter({ sources, apiSources }: { sources?: DataSource[]; apiSources?: ApiSource[] }) {
  const [expanded, setExpanded] = React.useState(false);
  const [apiExpanded, setApiExpanded] = React.useState(false);
  const hasWebSources = sources && sources.length > 0;
  const hasApiSources = apiSources && apiSources.length > 0;
  if (!hasWebSources && !hasApiSources) return null;

  const successCount = sources ? sources.filter(s => s.success).length : 0;
  const totalCount = sources ? sources.length : 0;

  // 将 API 数据源按分组分类
  const apiByCategory = React.useMemo(() => {
    if (!apiSources) return {};
    const map: Record<string, ApiSource[]> = {};
    for (const src of apiSources) {
      const cat = src.category || "其他";
      if (!map[cat]) map[cat] = [];
      map[cat].push(src);
    }
    return map;
  }, [apiSources]);

  const categoryOrder = ["市场数据", "技术分析", "期权数据", "宏观指标", "新闻情绪", "加密货币", "A股数据", "港股公告", "法律监管", "网页搜索", "其他"];
  const sortedCategories = Object.keys(apiByCategory).sort(
    (a, b) => (categoryOrder.indexOf(a) === -1 ? 99 : categoryOrder.indexOf(a)) - (categoryOrder.indexOf(b) === -1 ? 99 : categoryOrder.indexOf(b))
  );

  return (
    <div className="mt-3" style={{ borderTop: "1px solid oklch(0.22 0.01 270)", paddingTop: "8px" }}>
      {/* API 数据源分组折叠卡片 */}
      {hasApiSources && (
        <div className="mb-2">
          <button
            onClick={() => setApiExpanded(e => !e)}
            className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80 mb-1.5"
            style={{ color: "oklch(0.42 0.01 270)" }}
          >
            <Database className="w-3 h-3" />
            <span>数据来源：{apiSources!.length} 个 API</span>
            <ChevronDown
              className="w-3 h-3 transition-transform"
              style={{ transform: apiExpanded ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>
          {/* 折叠前展示简洁标签行 */}
          {!apiExpanded && (
            <div className="flex flex-wrap gap-1">
              {apiSources!.map((src, i) => (
                <ApiSourceBadge key={i} src={src} />
              ))}
            </div>
          )}
          {/* 展开后显示分组卡片 */}
          {apiExpanded && (
            <div className="flex flex-col gap-2 mt-1">
              {sortedCategories.map(cat => {
                const colors = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS["网页搜索"];
                const catSources = apiByCategory[cat];
                return (
                  <div key={cat}
                    className="rounded-lg p-2"
                    style={{ background: colors.bg, border: `1px solid ${colors.border}` }}
                  >
                    <div className="text-xs font-medium mb-1" style={{ color: colors.text }}>
                      {cat}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {catSources.map((src, i) => (
                        <span key={i}
                          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
                          style={{ background: "oklch(0.14 0.005 270 / 0.6)", color: "oklch(0.82 0.005 270)", border: `1px solid ${colors.border}` }}
                        >
                          {src.icon && <span>{src.icon}</span>}
                          <span>{src.name}</span>
                          {src.description && (
                            <span style={{ color: "oklch(0.50 0.01 270)" }}>— {src.description}</span>
                          )}
                          {src.latencyMs !== undefined && (
                            <span
                              className="ml-0.5 font-mono"
                              style={{
                                color: src.latencyMs < 500 ? "oklch(0.65 0.15 155)" : src.latencyMs < 2000 ? "oklch(0.65 0.15 80)" : "oklch(0.65 0.15 25)",
                                fontSize: "0.6rem",
                                opacity: 0.85
                              }}
                            >
                              {src.latencyMs < 1000 ? `${src.latencyMs}ms` : `${(src.latencyMs / 1000).toFixed(1)}s`}
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {/* 网页搜索来源可折叠列表 */}
      {hasWebSources && (
        <>
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1.5 text-xs transition-colors hover:opacity-80"
            style={{ color: "oklch(0.42 0.01 270)" }}
          >
            <span>网页搜索：{successCount}/{totalCount} 个来源</span>
            <ChevronDown
              className="w-3 h-3 transition-transform"
              style={{ transform: expanded ? "rotate(180deg)" : "rotate(0deg)" }}
            />
          </button>
          {expanded && (
            <div className="mt-2 flex flex-col gap-1">
              {sources!.map((src, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: src.success ? "oklch(0.72 0.18 155)" : "oklch(0.65 0.18 25)" }}
                  />
                  <a
                    href={src.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs truncate hover:underline"
                    style={{ color: src.success ? "oklch(0.62 0.08 250)" : "oklch(0.50 0.05 25)", maxWidth: "360px" }}
                    title={src.title || src.url}
                  >
                    {src.title || src.domain}
                  </a>
                  <span className="text-xs shrink-0" style={{ color: "oklch(0.38 0.01 270)" }}>
                    {src.domain}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function AnswerHeader({ answerObject, evidenceScore, outputMode }: {
  answerObject: NonNullable<NonNullable<Msg["metadata"]>["answerObject"]>;
  evidenceScore?: number;
  outputMode?: "decisive" | "directional" | "framework_only";
}) {
  const outputModeMap = {
    decisive: { label: "证据充分", color: "oklch(0.72 0.18 155)", bg: "oklch(0.72 0.18 155 / 0.1)", border: "oklch(0.72 0.18 155 / 0.2)" },
    directional: { label: "方向性", color: "oklch(0.78 0.18 75)", bg: "oklch(0.78 0.18 75 / 0.1)", border: "oklch(0.78 0.18 75 / 0.2)" },
    framework_only: { label: "框架参考", color: "oklch(0.72 0.18 25)", bg: "oklch(0.72 0.18 25 / 0.1)", border: "oklch(0.72 0.18 25 / 0.2)" },
  };
  const confidenceMap = {
    high: { label: "高置信", color: "oklch(0.72 0.18 155)", bg: "oklch(0.72 0.18 155 / 0.12)", border: "oklch(0.72 0.18 155 / 0.25)" },
    medium: { label: "中置信", color: "oklch(0.78 0.18 75)", bg: "oklch(0.78 0.18 75 / 0.12)", border: "oklch(0.78 0.18 75 / 0.25)" },
    low: { label: "低置信", color: "oklch(0.72 0.18 25)", bg: "oklch(0.72 0.18 25 / 0.12)", border: "oklch(0.72 0.18 25 / 0.25)" },
  };
  const conf = confidenceMap[answerObject.confidence] ?? confidenceMap.medium;
  return (
    <div className="mb-3 rounded-xl px-4 py-3 flex flex-col gap-2"
      style={{ background: "oklch(0.16 0.01 270)", border: "1px solid oklch(0.28 0.01 270)" }}>
      {/* Verdict */}
      <div className="flex items-start gap-2">
        <span className="shrink-0 text-xs font-semibold mt-0.5" style={{ color: "oklch(0.55 0.01 270)" }}>核心判断</span>
        <span className="text-sm font-medium leading-snug" style={{ color: "oklch(0.92 0.005 270)" }}>{answerObject.verdict}</span>
      </div>
      {/* Badges row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
          style={{ background: conf.bg, border: `1px solid ${conf.border}`, color: conf.color }}>
          {conf.label}
        </span>
        {outputMode && outputModeMap[outputMode] && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ background: outputModeMap[outputMode].bg, border: `1px solid ${outputModeMap[outputMode].border}`, color: outputModeMap[outputMode].color }}>
            {outputModeMap[outputMode].label}
          </span>
        )}
        {evidenceScore !== undefined && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ background: "oklch(0.72 0.18 250 / 0.08)", border: "1px solid oklch(0.72 0.18 250 / 0.18)", color: "oklch(0.62 0.12 250)" }}>
            证据 {evidenceScore}
          </span>
        )}
        {answerObject.citations_count !== undefined && answerObject.citations_count > 0 && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ background: "oklch(0.72 0.18 250 / 0.1)", border: "1px solid oklch(0.72 0.18 250 / 0.2)", color: "oklch(0.72 0.18 250)" }}>
            {answerObject.citations_count} 条引用
          </span>
        )}
        {answerObject.data_gaps && answerObject.data_gaps.length > 0 && (
          <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full"
            style={{ background: "oklch(0.78 0.18 75 / 0.08)", border: "1px solid oklch(0.78 0.18 75 / 0.2)", color: "oklch(0.78 0.18 75)" }}>
            {answerObject.data_gaps.length} 个数据缺口
          </span>
        )}
      </div>
    </div>
  );
}

function AIMessage({ msg, taskTitle, onFollowup }: { msg: Msg; taskTitle?: string; onFollowup?: (q: string) => void }) {
  const isAssistant = msg.role === "assistant";
  const { cleanContent, followups } = React.useMemo(() => parseFollowups(msg.content), [msg.content]);
  const chartBlocks = React.useMemo(() => parseChartBlocks(cleanContent), [cleanContent]);
  const colorVar = isAssistant ? "chatgpt" : "manus";
  const label = isAssistant ? "投资研究助手" : (msg.role === "chatgpt" ? "ChatGPT" : "Manus");
  const abbr = isAssistant ? "AI" : (msg.role === "chatgpt" ? "G" : "M");
  const msgRef = React.useRef<HTMLDivElement>(null);
  const answerObject = msg.metadata?.answerObject;
  return (
    <div className="flex gap-4 items-start py-3 group" data-pdf-message="ai">
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
        {/* Answer Header：展示 verdict / confidence / outputMode / evidenceScore / citations_count / data_gaps */}
        {isAssistant && answerObject && (
          <AnswerHeader
            answerObject={answerObject}
            evidenceScore={msg.metadata?.evidenceScore}
            outputMode={msg.metadata?.outputMode}
          />
        )}
        <div className="prose-chat w-full" ref={msgRef}>
          {chartBlocks.map((block, idx) =>
            block.type === "chart" ? (
              <InlineChart key={idx} raw={block.raw} />
            ) : (
              <MarkdownErrorBoundary key={idx} fallback={block.text}>
                <ReactMarkdown
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
                  {block.text}
                </ReactMarkdown>
              </MarkdownErrorBoundary>
            )
          )}
        </div>
        <div className="flex items-center gap-0.5 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <CopyButton text={cleanContent} />
          <DownloadMenu content={cleanContent} taskTitle={taskTitle} msgRef={msgRef} />
        </div>
        {followups.length > 0 && onFollowup && (
          <div className="flex flex-wrap gap-2 mt-3">
            {followups.map((q, i) => (
              <button
                key={i}
                onClick={() => onFollowup(q)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs transition-all hover:scale-[1.02] active:scale-[0.98]"
                style={{
                  background: "oklch(0.18 0.025 250)",
                  border: "1px solid oklch(0.35 0.08 250)",
                  color: "oklch(0.72 0.12 250)",
                }}
              >
                <ChevronRight className="w-3 h-3 shrink-0" />
                <span>{q}</span>
              </button>
            ))}
          </div>
        )}
        {/* 数据来源归因展示 */}
        {(msg.metadata?.dataSources?.length || msg.metadata?.apiSources?.length) ? (
          <DataSourcesFooter
            sources={msg.metadata?.dataSources}
            apiSources={msg.metadata?.apiSources}
          />
        ) : null}
      </div>
    </div>
  );
}

function UserMessage({ msg }: { msg: Msg }) {
  const [copied, setCopied] = React.useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(msg.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };
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
        <div className="group relative px-4 py-3 rounded-2xl rounded-br-md text-sm leading-relaxed"
          style={{ background: "var(--user-bg)", border: "1px solid var(--user-border)", color: "oklch(0.92 0.005 270)", wordBreak: "break-word" }}>
          {msg.content}
          <button
            onClick={handleCopy}
            className="absolute -left-8 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg"
            style={{ background: "oklch(0.22 0.008 270)", border: "1px solid oklch(0.28 0.01 270)", color: "oklch(0.65 0.01 270)" }}
            title="复制消息"
          >
            {copied ? <Check className="w-3 h-3" style={{ color: "oklch(0.75 0.15 145)" }} /> : <Copy className="w-3 h-3" />}
          </button>
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

function MsgRow({ msg, taskTitle, onFollowup }: { msg: Msg; taskTitle?: string; onFollowup?: (q: string) => void }) {
  if (msg.role === "system") return <SystemMessage msg={msg} />;
  if (msg.role === "user") return <UserMessage msg={msg} />;
  return <AIMessage msg={msg} taskTitle={taskTitle} onFollowup={onFollowup} />;
}

function TypingIndicator({ phase }: { phase?: string }) {
  const steps = [
    { key: "manus_working", label: "正在理解你的问题", Icon: Database, color: "var(--manus-color)" },
    { key: "manus_analyzing", label: "正在验证关键证据", Icon: Database, color: "var(--manus-color)" },
    { key: "gpt_reviewing", label: "正在形成研究结论", Icon: Brain, color: "var(--chatgpt-color)" },
  ];
  // manus_working 对应第一阶段（并行规划），第二次 manus_working 对应第二阶段（数据执行）
  // 简化处理：manus_working 显示第一阶段，gpt_reviewing 显示第三阶段
  const phaseMap: Record<string, number> = {
    manus_working: 0,
    manus_analyzing: 1,
    gpt_reviewing: 2,
  };
  const activeIdx = phase ? (phaseMap[phase] ?? 0) : 0;
  return (
    <div className="flex gap-4 items-start py-3">
      <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold mt-0.5"
        style={{ background: "var(--chatgpt-bg)", border: "1.5px solid var(--chatgpt-border)", color: "var(--chatgpt-color)" }}>
        AI
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-sm font-semibold" style={{ color: "var(--chatgpt-color)" }}>投资研究助手</span>
        <div className="flex items-center gap-2">
          {steps.map((step, i) => {
            const isActive = i === activeIdx;
            const isDone = i < activeIdx;
            return (
              <div key={step.key} className="flex items-center gap-1.5">
                {isActive ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: step.color }} />
                ) : (
                  <step.Icon className="w-3.5 h-3.5" style={{ color: isDone ? "oklch(0.72 0.18 155)" : "oklch(0.35 0.01 270)" }} />
                )}
                <span className="text-xs" style={{ color: isActive ? step.color : isDone ? "oklch(0.72 0.18 155)" : "oklch(0.35 0.01 270)" }}>
                  {step.label}
                </span>
                {i < steps.length - 1 && (
                  <span className="text-xs mx-0.5" style={{ color: "oklch(0.35 0.01 270)" }}>→</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Export Report Button ───────────────────────────────────────────────────────
function ExportReportButton({ title }: { title: string }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);

  const handleExport = async () => {
    setLoading(true);
    setProgress(0);
    try {
      const { exportConversationAsPDF } = await import("@/lib/exportMessage");
      await exportConversationAsPDF(title, (pct) => setProgress(pct));
      toast.success("PDF 报告已下载");
    } catch (err) {
      console.error(err);
      toast.error("导出失败，请重试");
    } finally {
      setLoading(false);
      setProgress(0);
    }
  };

  return (
    <button
      onClick={handleExport}
      disabled={loading}
      data-export-ignore
      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-all hover:bg-white/8 disabled:opacity-60"
      style={{ color: loading ? "oklch(0.72 0.18 250)" : "oklch(0.55 0.01 270)", border: "1px solid oklch(0.25 0.007 270)" }}
      title="导出完整报告为 PDF"
    >
      {loading ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>{progress > 0 ? `${progress}%` : "准备中..."}</span>
        </>
      ) : (
        <>
          <FileDown className="w-3.5 h-3.5" />
          <span>导出报告</span>
        </>
      )}
    </button>
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
  const [analysisMode, setAnalysisMode] = useState<"quick" | "standard" | "deep">("standard");
  const [sending, setSending] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [isTyping, setIsTyping] = useState(false);
  const [taskPhase, setTaskPhase] = useState<string>("manus_working");

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

  // ─── Memory panel state ────────────────────────────────────────────────
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);

  // ─── PWA Install ──────────────────────────────────────────────────────────────────────────────
  const [pwaInstallPrompt, setPwaInstallPrompt] = useState<any>(null);
  const [pwaInstalled, setPwaInstalled] = useState(() =>
    window.matchMedia("(display-mode: standalone)").matches
  );
  const [pwaGuideOpen, setPwaGuideOpen] = useState(false);
  const pwaIsIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const pwaIsSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent) && !pwaIsIOS;
  const pwaIsEdge = /edg\//i.test(navigator.userAgent);
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setPwaInstallPrompt(e); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);
  // ─── Queries ────────────────────────────────────────────────
  const { data: accessData, isLoading: accessLoading } = trpc.access.check.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const { data: rpaConfig } = trpc.rpa.getConfig.useQuery(undefined, {
    enabled: isAuthenticated && !!accessData?.hasAccess,
  });
  const rpaConnected = rpaConfig?.hasApiKey === true;

  // 对话记忆查询
  const { data: memoryData, refetch: refetchMemory } = trpc.chat.getMemory.useQuery(
    { limit: 20, conversationId: activeConvId ?? undefined },
    { enabled: isAuthenticated && !!accessData?.hasAccess && memoryPanelOpen && activeConvId !== null }
  );

  // All conversations (ungrouped + grouped)
  const { data: allConversations, refetch: refetchConvs } = trpc.chat.listConversations.useQuery(undefined, {
    enabled: isAuthenticated && !!accessData?.hasAccess,
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
  });

  // streaming 状态标志
  const [isStreaming, setIsStreaming] = useState(false);

  // Messages for the active conversation
  const { data: rawConvMsgs, isLoading: msgsLoading, refetch: refetchMsgs } = trpc.chat.getConversationMessages.useQuery(
    { conversationId: activeConvId! },
    {
      enabled: isAuthenticated && !!accessData?.hasAccess && activeConvId !== null,
      // SSE 已处理流式内容，轮询仅作兑底：空闲 5s，进行中 3s
      refetchInterval: isTyping ? 3000 : 5000,
    }
  );

  // 当前活跃任务 ID
  const [activeTaskId, setActiveTaskId] = useState<number | null>(null);

  // SSE 连接引用（用于清理）
  const sseRef = useRef<EventSource | null>(null);

  // 启动 SSE 订阅（替代任务状态轮询）
  const startSSE = (taskId: number) => {
    // 关闭旧连接
    if (sseRef.current) { sseRef.current.close(); sseRef.current = null; }

    const es = new EventSource(`/api/task-stream/${taskId}`, { withCredentials: true });
    sseRef.current = es;

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as {
          type: string;
          status?: string;
          streamMsgId?: number;
          msgId?: number;
          content?: string;
          message?: string;
        };

        if (event.type === "status") {
          const status = event.status ?? "";
          if (status === "manus_working") { setTaskPhase("manus_working"); setIsStreaming(false); }
          else if (status === "manus_analyzing") { setTaskPhase("manus_analyzing"); setIsStreaming(false); }
          else if (status === "gpt_reviewing" || status === "gpt_planning") { setTaskPhase("gpt_reviewing"); setIsStreaming(false); }
          else if (status === "streaming") {
            setTaskPhase("gpt_reviewing");
            setIsStreaming(true);
            setIsTyping(false);
          }
        } else if (event.type === "chunk" && event.msgId != null && event.content != null) {
          // 实时更新消息内容（直接写入 state，不等轮询）
          setConvMessages(prev => {
            const idx = prev.findIndex(m => m.id === event.msgId);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], content: event.content! };
              return updated;
            }
            // 如果消息还没在列表里（占位消息还未加载），添加占位条目
            return [...prev, {
              id: event.msgId!,
              role: "assistant" as MsgRole,
              content: event.content!,
              taskId,
              conversationId: activeConvId,
              createdAt: new Date(),
            }];
          });
        } else if (event.type === "done" && event.msgId != null && event.content != null) {
          // 流式完成：写入最终内容
          setConvMessages(prev => {
            const idx = prev.findIndex(m => m.id === event.msgId);
            if (idx >= 0) {
              const updated = [...prev];
              updated[idx] = { ...updated[idx], content: event.content! };
              return updated;
            }
            return [...prev, {
              id: event.msgId!,
              role: "assistant" as MsgRole,
              content: event.content!,
              taskId,
              conversationId: activeConvId,
              createdAt: new Date(),
            }];
          });
          setIsStreaming(false);
          setIsTyping(false);
          setSending(false);
          setActiveTaskId(null);
          es.close();
          sseRef.current = null;
          if (memoryPanelOpen) setTimeout(() => refetchMemory(), 2000);
          // 刷新一次消息列表确保数据一致
          setTimeout(() => refetchMsgs(), 500);
        } else if (event.type === "error") {
          setIsStreaming(false);
          setIsTyping(false);
          setSending(false);
          setActiveTaskId(null);
          es.close();
          sseRef.current = null;
          toast.error("任务处理失败，请重试");
        }
      } catch { /* JSON 解析失败，忽略 */ }
    };

    es.onerror = () => {
      // SSE 断开时回退到轮询模式（已有 refetchInterval 兑底）
      es.close();
      sseRef.current = null;
    };
  };

  // 组件卸载时关闭 SSE
  useEffect(() => {
    return () => { if (sseRef.current) { sseRef.current.close(); sseRef.current = null; } };
  }, []);

  // 客户端超时保护：任务运行超过 5 分钟自动解除卡住
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (isTyping) {
      typingTimeoutRef.current = setTimeout(() => {
        setIsTyping(false);
        setSending(false);
        setActiveTaskId(null);
        toast.error("任务超时（>5分钟），请重试");
      }, 5 * 60 * 1000);
    } else {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
        typingTimeoutRef.current = null;
      }
    }
    return () => {
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [isTyping]);

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
    // streaming 状态下，消息内容正在逐步写入，不重置状态
    if (!isStreaming && (last?.role === "assistant" || last?.content?.includes("[ERROR]"))) {
      setIsTyping(false);
      setSending(false);
      setActiveTaskId(null);
    }
  }, [rawConvMsgs, isStreaming]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (distFromBottom < 200) bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [convMessages, isTyping]);

  // 切换对话框时自动滚到最底部
  useEffect(() => {
    if (activeConvId) {
      setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: "instant" }), 80);
    }
  }, [activeConvId]);

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
    onSuccess: (data) => {
      if (data?.taskId) {
        setActiveTaskId(data.taskId);
        startSSE(data.taskId); // 启动 SSE 实时推送
      }
      // 如果后端自动创建了新对话框，同步到前端
      if (data?.conversationId && !activeConvId) {
        setActiveConvId(data.conversationId);
        setConvMessages([]);
      }
      refetchMsgs();
      refetchConvs();
      refetchGroups();
    },
    onError: (err) => {
      toast.error(err.message || "任务提交失败");
      setSending(false);
      setIsTyping(false);
      setActiveTaskId(null);
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

  const deleteConvMutation = trpc.conversation.delete.useMutation({
    onSuccess: () => {
      refetchGroups();
      refetchConvs();
      toast.success("对话已删除");
      setActiveConvId(prev => prev === null ? null : prev);
    },
    onError: (err) => toast.error(err.message || "删除失败"),
  });

  const pinConvMutation = trpc.conversation.pin.useMutation({
    onSuccess: () => { refetchGroups(); refetchConvs(); },
    onError: (err) => toast.error(err.message || "操作失败"),
  });

  const renameConvMutation = trpc.conversation.rename.useMutation({
    onSuccess: () => { refetchGroups(); refetchConvs(); toast.success("标题已更新"); },
    onError: (err) => toast.error(err.message || "重命名失败"),
  });

  const retryTaskMutation = trpc.chat.retryTask.useMutation({
    onSuccess: (data) => {
      if (data?.taskId) {
        setActiveTaskId(data.taskId);
        startSSE(data.taskId); // 重试时也启动 SSE
      }
      setSending(true);
      setIsTyping(true);
      setTaskPhase("manus_working");
      toast.success("任务已重新开始");
      refetchMsgs();
    },
    onError: (err) => toast.error(err.message || "重试失败"),
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
      // 传递 conversationId 以实现对话级附件关联
      if (activeConvId) formData.append("conversationId", String(activeConvId));
      fetch("/api/upload", { method: "POST", body: formData, credentials: "include" })
        .then(r => r.json())
        .then((data: any) => {
          if (data.url) setPendingFiles(prev => prev.map(p => p.id === id ? { ...p, uploading: false, uploadedUrl: data.url, attachmentId: data.attachmentId ?? undefined } : p));
          else setPendingFiles(prev => prev.map(p => p.id === id ? { ...p, uploading: false, error: data.error || "上传失败" } : p));
        })
        .catch(() => setPendingFiles(prev => prev.map(p => p.id === id ? { ...p, uploading: false, error: "网络错误" } : p)));
    });
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragOver(false);
    if (e.dataTransfer.files.length > 0) addFiles(e.dataTransfer.files);
  }, [addFiles]);

  const handleSubmit = useCallback((overrideText?: string) => {
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;
    // 跟进问题不携带附件，正常发送才处理附件
    const uploadedFiles = overrideText ? [] : pendingFiles.filter(p => p.uploadedUrl && !p.error);
    // 收集附件ID列表（优先使用数据库ID，让AI能读取提取的文件内容）
    const attachmentIds = uploadedFiles
      .filter(p => p.attachmentId != null)
      .map(p => p.attachmentId as number);
    // 兼容旧逻辑：如果没有attachmentId，则将文件名和URL附在文本中
    const filesWithoutId = uploadedFiles.filter(p => p.attachmentId == null);
    const attachmentNote = filesWithoutId.length > 0
      ? `\n\n[附件: ${filesWithoutId.map(p => `${p.file.name}(${p.uploadedUrl})`).join(", ")}]`
      : "";
    setInput("");
    setPendingFiles([]);
    setSending(true);
    setIsTyping(true);
    setTaskPhase("manus_working");
    setActiveTaskId(null);
    // 如果没有对话框，不传 conversationId，后端会自动创建并返回新 conversationId
    submitMutation.mutate({ title: text + attachmentNote, conversationId: activeConvId ?? undefined, analysisMode, attachmentIds: attachmentIds.length > 0 ? attachmentIds : undefined });
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
            <span className="text-sm font-semibold" style={{ color: "oklch(0.92 0.005 270)", fontFamily: "'Google Sans', sans-serif" }}>DanTree</span>
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
                    <span className="text-sm font-semibold truncate" style={{ color: "oklch(0.78 0.008 270)" }}>
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
              onDeleteConv={(convId) => {
                deleteConvMutation.mutate({ conversationId: convId });
                if (activeConvId === convId) setActiveConvId(null);
              }}
              onPinConv={(convId, pinned) => pinConvMutation.mutate({ conversationId: convId, pinned })}
              onRenameConv={(convId, title) => renameConvMutation.mutate({ conversationId: convId, title })}
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
              {ungroupedConvs.map(conv => (
                <ConvItem
                  key={conv.id}
                  conv={conv}
                  active={activeConvId === conv.id}
                  onSelect={() => setActiveConvId(conv.id)}
                  onMove={() => { setMoveConvId(conv.id); setMoveDialogOpen(true); }}
                  onDelete={(id) => {
                    deleteConvMutation.mutate({ conversationId: id });
                    if (activeConvId === id) setActiveConvId(null);
                  }}
                  onPin={(id, pinned) => pinConvMutation.mutate({ conversationId: id, pinned })}
                  onRename={(id, title) => renameConvMutation.mutate({ conversationId: id, title })}
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
            {/* 数据引擎状态 */}
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                {isTyping && (taskPhase === "manus_working" || taskPhase === "manus_analyzing")
                  ? <><span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "var(--manus-color)" }} /><span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "var(--manus-color)" }} /></>
                  : <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "oklch(0.55 0.12 155)" }} />}
              </span>
              <span className="text-xs" style={{ color: isTyping && (taskPhase === "manus_working" || taskPhase === "manus_analyzing") ? "var(--manus-color)" : "oklch(0.65 0.01 270)" }}>
                数据引擎
              </span>
              <span className="text-xs ml-auto" style={{ color: isTyping && (taskPhase === "manus_working" || taskPhase === "manus_analyzing") ? "var(--manus-color)" : "oklch(0.4 0.01 270)" }}>
                {isTyping && taskPhase === "manus_working" ? "理解问题中…" : isTyping && taskPhase === "manus_analyzing" ? "验证证据中…" : "就绪"}
              </span>
            </div>
            {/* 首席顾问状态 */}
            <div className="flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                {isTyping && taskPhase === "gpt_reviewing"
                  ? <><span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "var(--chatgpt-color)" }} /><span className="relative inline-flex rounded-full h-2 w-2" style={{ background: "var(--chatgpt-color)" }} /></>
                  : <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: rpaConnected ? "oklch(0.65 0.18 155)" : "oklch(0.38 0.01 270)" }} />}
              </span>
              <span className="text-xs" style={{ color: isTyping && taskPhase === "gpt_reviewing" ? "var(--chatgpt-color)" : rpaConnected ? "oklch(0.65 0.01 270)" : "oklch(0.42 0.01 270)" }}>
                首席顾问
              </span>
              <span className="text-xs ml-auto" style={{ color: isTyping && taskPhase === "gpt_reviewing" ? "var(--chatgpt-color)" : "oklch(0.4 0.01 270)" }}>
                {isTyping && taskPhase === "gpt_reviewing" ? "形成结论中…" : rpaConnected ? "GPT 已接入" : "GPT 未接入"}
              </span>
            </div>
          </div>
          {/* 安装App按鈕 */}
          {!pwaInstalled && (
            <button
              onClick={async () => {
                if (pwaInstallPrompt) {
                  await pwaInstallPrompt.prompt();
                  const { outcome } = await pwaInstallPrompt.userChoice;
                  if (outcome === "accepted") { setPwaInstalled(true); setPwaInstallPrompt(null); }
                } else if (pwaIsIOS) {
                  toast.info("请点击底部「分享」按钮 → 添加到主屏幕", { duration: 5000 });
                } else if (pwaIsSafari) {
                  toast.info("请点击地址栏「分享」图标 → 添加到扣接栏", { duration: 5000 });
                } else {
                  toast.info("请点击地址栏右侧的安装图标，或菜单 → 安装应用", { duration: 5000 });
                }
              }}
              className="w-full flex items-center gap-2 rounded-xl px-3 py-2 text-xs transition-colors mb-0.5 hover:bg-white/5"
              style={{ color: "oklch(0.75 0.15 250)", background: "oklch(0.72 0.18 250 / 0.08)", border: "1px solid oklch(0.72 0.18 250 / 0.15)" }}
            >
              <Download className="w-3.5 h-3.5" />
              <span>安装桌面 App</span>
              <span className="ml-auto text-xs px-1.5 py-0.5 rounded-md" style={{ background: "oklch(0.72 0.18 250 / 0.15)", color: "oklch(0.72 0.18 250)" }}>NEW</span>
            </button>
          )}
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
            {/* 导出完整报告按鈕 */}
            {convMessages.some(m => m.role === "assistant") && (
              <ExportReportButton title={activeConvTitle || "AI 分析报告"} />
            )}
            {/* 记忆面板按鈕 */}
            {activeConvId && (
              <button
                onClick={() => { setMemoryPanelOpen(o => !o); }}
                title="对话记忆"
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 transition-all hover:bg-white/8"
                style={{ background: memoryPanelOpen ? "oklch(0.72 0.18 250 / 0.15)" : "transparent", border: `1px solid ${memoryPanelOpen ? "oklch(0.72 0.18 250 / 0.4)" : "oklch(0.27 0.008 270)"}`, color: memoryPanelOpen ? "oklch(0.72 0.18 250)" : "oklch(0.55 0.01 270)" }}>
                <Brain className="w-3 h-3" />
                <span>记忆</span>
                {memoryData && memoryData.length > 0 && (
                  <span className="ml-0.5 px-1 py-0.5 rounded text-[10px] font-bold" style={{ background: "oklch(0.72 0.18 250 / 0.2)", color: "oklch(0.72 0.18 250)" }}>{memoryData.length}</span>
                )}
              </button>
            )}
            {/* 数据引擎状态标志 - 只显示固定职责名称 */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
              style={{ background: "var(--manus-bg)", border: "1px solid var(--manus-border)", color: "var(--manus-color)" }}>
              <span className="relative flex h-1.5 w-1.5">
                {isTyping && (taskPhase === "manus_working" || taskPhase === "manus_analyzing")
                  ? <><span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "var(--manus-color)" }} /><span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "var(--manus-color)" }} /></>
                  : <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "oklch(0.55 0.12 155)" }} />}
              </span>
              <Bot className="w-3 h-3" />
              <span>数据引擎</span>
            </div>
            {/* 首席顾问状态标志 - 只显示固定职责名称 */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium whitespace-nowrap shrink-0"
              style={{ background: "var(--chatgpt-bg)", border: "1px solid var(--chatgpt-border)", color: rpaConnected ? "var(--chatgpt-color)" : "oklch(0.42 0.01 270)" }}>
              <span className="relative flex h-1.5 w-1.5">
                {isTyping && taskPhase === "gpt_reviewing"
                  ? <><span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: "var(--chatgpt-color)" }} /><span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: "var(--chatgpt-color)" }} /></>
                  : <span className="relative inline-flex rounded-full h-1.5 w-1.5" style={{ background: rpaConnected ? "oklch(0.65 0.18 155)" : "oklch(0.38 0.01 270)" }} />}
              </span>
              <Brain className="w-3 h-3" />
              <span>首席顾问</span>
            </div>
          </div>
        </header>

        {/* Three-phase progress bar */}
        {isTyping && (
          <div className="shrink-0 px-4 py-2" style={{ borderBottom: "1px solid oklch(0.18 0.007 270)" }}>
            <div className="max-w-3xl mx-auto">
              {/* Stage labels */}
              <div className="flex items-center justify-between mb-1.5">
                {[
                  { key: "manus_working", label: "理解问题", icon: "01" },
                  { key: "manus_analyzing", label: "验证证据", icon: "02" },
                  { key: "gpt_reviewing", label: "形成结论", icon: "03" },
                ].map((stage, i) => {
                  const phaseOrder: Record<string, number> = { manus_working: 0, manus_analyzing: 1, gpt_reviewing: 2 };
                  const currentOrder = phaseOrder[taskPhase] ?? 0;
                  const stageOrder = phaseOrder[stage.key] ?? i;
                  const isActive = taskPhase === stage.key;
                  const isDone = currentOrder > stageOrder;
                  return (
                    <div key={stage.key} className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded"
                        style={{
                          background: isActive ? "oklch(0.72 0.18 250 / 0.15)" : isDone ? "oklch(0.55 0.12 155 / 0.15)" : "oklch(0.15 0.005 270)",
                          color: isActive ? "oklch(0.72 0.18 250)" : isDone ? "oklch(0.65 0.15 155)" : "oklch(0.38 0.01 270)",
                          border: `1px solid ${isActive ? "oklch(0.72 0.18 250 / 0.3)" : isDone ? "oklch(0.55 0.12 155 / 0.3)" : "oklch(0.22 0.007 270)"}`
                        }}>{stage.icon}</span>
                      <span className="text-xs" style={{ color: isActive ? "oklch(0.85 0.005 270)" : isDone ? "oklch(0.65 0.15 155)" : "oklch(0.38 0.01 270)" }}>
                        {stage.label}
                      </span>
                      {isDone && <span className="text-[10px]" style={{ color: "oklch(0.65 0.15 155)" }}>✓</span>}
                      {isActive && <span className="text-[10px] animate-pulse" style={{ color: "oklch(0.72 0.18 250)" }}>•••</span>}
                    </div>
                  );
                })}
              </div>
              {/* Progress track */}
              <div className="relative h-0.5 rounded-full overflow-hidden" style={{ background: "oklch(0.18 0.007 270)" }}>
                {/* Completed segments */}
                <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
                  style={{
                    background: "oklch(0.65 0.15 155)",
                    width: taskPhase === "manus_working" ? "0%" : taskPhase === "manus_analyzing" ? "33.3%" : taskPhase === "gpt_reviewing" ? "66.6%" : "100%"
                  }} />
                {/* Active animated segment */}
                <div className="absolute inset-y-0 rounded-full"
                  style={{
                    background: "linear-gradient(90deg, oklch(0.72 0.18 250 / 0.8), oklch(0.72 0.18 250))",
                    left: taskPhase === "manus_working" ? "0%" : taskPhase === "manus_analyzing" ? "33.3%" : taskPhase === "gpt_reviewing" ? "66.6%" : "100%",
                    width: "33.3%",
                    animation: "progressPulse 1.8s ease-in-out infinite"
                  }} />
              </div>
            </div>
          </div>
        )}

        {/* Messages + Memory Panel */}
        <div className="relative flex-1 overflow-hidden flex">
          <div ref={scrollRef} onScroll={() => {
            const el = scrollRef.current;
            if (!el) return;
            setShowScrollBtn(el.scrollHeight - el.scrollTop - el.clientHeight > 120);
          }} className="flex-1 h-full overflow-y-auto">
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
                    <MsgRow
                      key={msg.id}
                      msg={msg}
                      taskTitle={activeConvTitle || undefined}
                      onFollowup={(q) => {
                        if (sending) return;
                        handleSubmit(q);
                      }}
                    />
                  ))}
                  {isTyping && <TypingIndicator phase={taskPhase} />}
                  {/* streaming 状态：显示打字光标动画 */}
                  {isStreaming && (
                    <span className="inline-block w-0.5 h-4 ml-0.5 align-middle animate-pulse" style={{ background: "oklch(0.72 0.18 250)", verticalAlign: "text-bottom" }} />
                  )}
                  {/* 任务失败重试按钮：当最后一条是系统错误消息且任务已失败时显示 */}
                  {(() => {
                    if (isTyping || sending) return null;
                    const lastMsg = convMessages[convMessages.length - 1];
                    if (!lastMsg || lastMsg.role !== "system" || !lastMsg.content.includes("处理任务时发生错误")) return null;
                    const failedTaskId = lastMsg.taskId;
                    if (!failedTaskId) return null;
                    return (
                      <div className="flex justify-center py-3">
                        <button
                          onClick={() => retryTaskMutation.mutate({ taskId: failedTaskId })}
                          disabled={retryTaskMutation.isPending}
                          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50"
                          style={{
                            background: "oklch(0.65 0.18 25 / 0.12)",
                            border: "1px solid oklch(0.65 0.18 25 / 0.35)",
                            color: "oklch(0.75 0.18 25)",
                          }}
                        >
                          {retryTaskMutation.isPending
                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            : <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
                          }
                          <span>重试任务</span>
                        </button>
                      </div>
                    );
                  })()}
                </>
              )}
              <div ref={bottomRef} />
            </div>
          </div>

          {/* Scroll to bottom */}
          {showScrollBtn && (
            <button onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
              className="absolute bottom-5 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full flex items-center justify-center shadow-xl transition-all hover:scale-110 active:scale-95 z-10"
              style={{ background: "oklch(0.22 0.015 250)", border: "1px solid oklch(0.45 0.12 250 / 0.6)", color: "oklch(0.72 0.18 250)", boxShadow: "0 4px 16px oklch(0.72 0.18 250 / 0.2)" }}>
              <ChevronDown className="w-4 h-4" />
            </button>
          )}
          {/* Memory Panel */}
          {memoryPanelOpen && activeConvId && (
            <div className="w-72 shrink-0 h-full overflow-y-auto flex flex-col" style={{ borderLeft: "1px solid oklch(0.20 0.007 270)", background: "oklch(0.14 0.005 270)" }}>
              <div className="flex items-center justify-between px-4 py-3 shrink-0" style={{ borderBottom: "1px solid oklch(0.20 0.007 270)" }}>
                <div className="flex items-center gap-2">
                  <Brain className="w-3.5 h-3.5" style={{ color: "oklch(0.72 0.18 250)" }} />
                  <span className="text-sm font-medium" style={{ color: "oklch(0.88 0.005 270)" }}>对话记忆</span>
                </div>
                <button onClick={() => setMemoryPanelOpen(false)} className="w-6 h-6 rounded-md flex items-center justify-center hover:bg-white/8" style={{ color: "oklch(0.50 0.01 270)" }}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
                {!memoryData ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="w-4 h-4 animate-spin" style={{ color: "oklch(0.55 0.01 270)" }} />
                  </div>
                ) : memoryData.length === 0 ? (
                  <div className="text-center py-8">
                    <Brain className="w-8 h-8 mx-auto mb-2 opacity-20" style={{ color: "oklch(0.55 0.01 270)" }} />
                    <p className="text-xs" style={{ color: "oklch(0.42 0.01 270)" }}>对话完成后会自动生成记忆</p>
                    <p className="text-xs mt-1" style={{ color: "oklch(0.35 0.007 270)" }}>包含关注的股票、行业和分析结论</p>
                  </div>
                ) : (
                  memoryData.map((m) => (
                    <div key={m.id} className="rounded-xl p-3" style={{ background: "oklch(0.18 0.005 270)", border: "1px solid oklch(0.25 0.007 270)" }}>
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <span className="text-xs font-medium truncate flex-1" style={{ color: "oklch(0.82 0.008 270)" }}>{m.taskTitle}</span>
                        <span className="text-[10px] shrink-0" style={{ color: "oklch(0.40 0.007 270)" }}>
                          {new Date(m.createdAt).toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" })}
                        </span>
                      </div>
                      <p className="text-xs leading-relaxed" style={{ color: "oklch(0.62 0.01 270)" }}>{m.summary}</p>
                      {m.keywords && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {m.keywords.split(",").slice(0, 4).map((kw, i) => (
                            <span key={i} className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: "oklch(0.72 0.18 250 / 0.1)", color: "oklch(0.65 0.12 250)" }}>{kw.trim()}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="px-3 py-2.5 shrink-0" style={{ borderTop: "1px solid oklch(0.20 0.007 270)" }}>
                <p className="text-[10px] text-center" style={{ color: "oklch(0.38 0.007 270)" }}>每次任务完成后自动更新 · AI 下次将自动带入背景</p>
              </div>
            </div>
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
                <div className="flex items-center gap-2">
                  <input ref={fileInputRef} type="file" multiple className="hidden"
                    accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.csv"
                    onChange={(e) => { if (e.target.files) addFiles(e.target.files); e.target.value = ""; }} />
                  <button onClick={() => fileInputRef.current?.click()}
                    className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors hover:bg-white/8"
                    style={{ color: "oklch(0.50 0.01 270)" }} title="添加附件">
                    <Paperclip className="w-3.5 h-3.5" />
                  </button>
                  {/* 分析模式选择器 */}
                  <div className="flex items-center gap-0.5 rounded-lg p-0.5" style={{ background: "oklch(0.13 0.005 270)" }}>
                    {([
                      { value: "quick", label: "快速", desc: "简洁结论，节省时间" },
                      { value: "standard", label: "标准", desc: "平衡深度与速度" },
                      { value: "deep", label: "深度", desc: "全面详细分析" },
                    ] as const).map(({ value, label, desc }) => (
                      <button
                        key={value}
                        onClick={() => setAnalysisMode(value)}
                        title={desc}
                        className="px-2.5 py-1 rounded-md text-xs font-medium transition-all"
                        style={{
                          background: analysisMode === value
                            ? value === "quick" ? "oklch(0.65 0.15 145)" : value === "deep" ? "oklch(0.65 0.18 30)" : "oklch(0.72 0.18 250)"
                            : "transparent",
                          color: analysisMode === value ? "white" : "oklch(0.45 0.01 270)",
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <button onClick={() => handleSubmit()} disabled={!input.trim() || sending}
                  className="w-8 h-8 rounded-xl flex items-center justify-center transition-all hover:scale-105 active:scale-95 disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: input.trim() && !sending ? "oklch(0.72 0.18 250)" : "oklch(0.25 0.007 270)", color: "white" }}>
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

      {/* ── PWA Install Guide Dialog ── */}
      <Dialog open={pwaGuideOpen} onOpenChange={setPwaGuideOpen}>
        <DialogContent className="sm:max-w-md" style={{ background: "oklch(0.17 0.005 270)", border: "1px solid oklch(0.27 0.008 270)" }}>
          <DialogHeader>
            <DialogTitle style={{ color: "oklch(0.92 0.005 270)" }}>安装桌面 App</DialogTitle>
          </DialogHeader>
          <div className="py-2 space-y-4">
            <p className="text-sm" style={{ color: "oklch(0.65 0.01 270)" }}>
              将此平台安装为桌面应用，无需浏览器即可直接打开，支持离线访问。
            </p>
            {pwaIsIOS ? (
              <div className="rounded-xl p-4 space-y-3" style={{ background: "oklch(0.20 0.007 270)", border: "1px solid oklch(0.28 0.008 270)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-base">🌐</span>
                  <span className="text-sm font-medium" style={{ color: "oklch(0.88 0.005 270)" }}>Safari（iPhone / iPad）</span>
                </div>
                <ol className="space-y-2 text-sm" style={{ color: "oklch(0.72 0.01 270)" }}>
                  <li className="flex items-start gap-2"><span className="shrink-0 w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium" style={{ background: "oklch(0.72 0.18 250 / 0.2)", color: "oklch(0.72 0.18 250)" }}>1</span>点击底部工具栏中的 「分享」 按鈕 📤</li>
                  <li className="flex items-start gap-2"><span className="shrink-0 w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium" style={{ background: "oklch(0.72 0.18 250 / 0.2)", color: "oklch(0.72 0.18 250)" }}>2</span>向下滚动，选择 「添加到主屏幕」</li>
                  <li className="flex items-start gap-2"><span className="shrink-0 w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium" style={{ background: "oklch(0.72 0.18 250 / 0.2)", color: "oklch(0.72 0.18 250)" }}>3</span>点击 「添加」 即完成安装</li>
                </ol>
              </div>
            ) : pwaIsSafari ? (
              <div className="rounded-xl p-4 space-y-3" style={{ background: "oklch(0.20 0.007 270)", border: "1px solid oklch(0.28 0.008 270)" }}>
                <div className="flex items-center gap-2">
                  <span className="text-base">🌐</span>
                  <span className="text-sm font-medium" style={{ color: "oklch(0.88 0.005 270)" }}>Safari（Mac）</span>
                </div>
                <ol className="space-y-2 text-sm" style={{ color: "oklch(0.72 0.01 270)" }}>
                  <li className="flex items-start gap-2"><span className="shrink-0 w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium" style={{ background: "oklch(0.72 0.18 250 / 0.2)", color: "oklch(0.72 0.18 250)" }}>1</span>点击地址栏右侧的 「分享」 图标</li>
                  <li className="flex items-start gap-2"><span className="shrink-0 w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium" style={{ background: "oklch(0.72 0.18 250 / 0.2)", color: "oklch(0.72 0.18 250)" }}>2</span>选择 「添加到扣接栏」</li>
                </ol>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="rounded-xl p-4 space-y-3" style={{ background: "oklch(0.20 0.007 270)", border: "1px solid oklch(0.28 0.008 270)" }}>
                  <div className="flex items-center gap-2">
                    <span className="text-base">🖥️</span>
                    <span className="text-sm font-medium" style={{ color: "oklch(0.88 0.005 270)" }}>Chrome / {pwaIsEdge ? "Edge" : "Edge / Arc"}</span>
                  </div>
                  <ol className="space-y-2 text-sm" style={{ color: "oklch(0.72 0.01 270)" }}>
                    <li className="flex items-start gap-2"><span className="shrink-0 w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium" style={{ background: "oklch(0.72 0.18 250 / 0.2)", color: "oklch(0.72 0.18 250)" }}>1</span>点击地址栏右侧的 「安装」图标 💻（或菜单→安装应用）</li>
                    <li className="flex items-start gap-2"><span className="shrink-0 w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium" style={{ background: "oklch(0.72 0.18 250 / 0.2)", color: "oklch(0.72 0.18 250)" }}>2</span>在弹出的确认框中点击 「安装」</li>
                    <li className="flex items-start gap-2"><span className="shrink-0 w-5 h-5 rounded-full text-xs flex items-center justify-center font-medium" style={{ background: "oklch(0.72 0.18 250 / 0.2)", color: "oklch(0.72 0.18 250)" }}>3</span>应用将出现在桌面和应用程序列表中</li>
                  </ol>
                </div>
                <p className="text-xs" style={{ color: "oklch(0.45 0.01 270)" }}>
                  提示：如果地址栏没有安装图标，请点击浏览器菜单 (…) → 「将此站点安装为应用程序」
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button onClick={() => setPwaGuideOpen(false)}
              style={{ background: "oklch(0.72 0.18 250)", color: "white", border: "none" }}>
              明白了
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
    conversations: Array<{ id: number; title: string | null; createdAt: Date; updatedAt: Date; isPinned?: boolean }>;
  };
  activeConvId: number | null;
  onSelectConv: (id: number) => void;
  onRename: (id: number, name: string) => void;
  onDelete: (id: number) => void;
  onMoveConv: (convId: number) => void;
  onDeleteConv: (convId: number) => void;
  onPinConv: (convId: number, pinned: boolean) => void;
  onRenameConv: (convId: number, title: string) => void;
}

function GroupSection({ group, activeConvId, onSelectConv, onRename, onDelete, onMoveConv, onDeleteConv, onPinConv, onRenameConv }: GroupSectionProps) {
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
      {!collapsed && group.conversations.map(conv => (
        <ConvItem
          key={conv.id}
          conv={conv}
          active={activeConvId === conv.id}
          onSelect={() => onSelectConv(conv.id)}
          onMove={() => onMoveConv(conv.id)}
          onDelete={onDeleteConv}
          onPin={onPinConv}
          onRename={onRenameConv}
          indent
        />
      ))}
    </div>
  );
}

// ─── Conversation Item Component ──────────────────────────────────────────────
interface ConvItemProps {
  conv: { id: number; title: string | null; createdAt: Date; isPinned?: boolean };
  active: boolean;
  onSelect: () => void;
  onMove: () => void;
  onDelete: (id: number) => void;
  onPin: (id: number, pinned: boolean) => void;
  onRename: (id: number, newTitle: string) => void;
  indent?: boolean;
}

function ConvItem({ conv, active, onSelect, onMove, onDelete, onPin, onRename, indent }: ConvItemProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const editInputRef = useRef<HTMLInputElement>(null);
  const isPinned = conv.isPinned ?? false;

  const startEdit = () => {
    setEditValue(conv.title || "");
    setEditing(true);
    setMenuOpen(false);
    setTimeout(() => editInputRef.current?.select(), 50);
  };

  const commitEdit = () => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== conv.title) onRename(conv.id, trimmed);
    setEditing(false);
  };

  return (
    <div className={`relative group/item ${indent ? "pl-4" : ""}`}>
      {editing ? (
        <div className="px-3 py-2">
          <input
            ref={editInputRef}
            value={editValue}
            onChange={e => setEditValue(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={e => { if (e.key === "Enter") commitEdit(); if (e.key === "Escape") setEditing(false); }}
            className="w-full rounded-lg px-2 py-1 text-sm outline-none"
            style={{ background: "oklch(0.22 0.008 270)", color: "oklch(0.92 0.005 270)", border: "1px solid oklch(0.45 0.15 250 / 0.6)" }}
            maxLength={100}
            autoFocus
          />
        </div>
      ) : (
        <>
          <button onClick={onSelect}
            onDoubleClick={startEdit}
            className="w-full text-left rounded-xl px-3 py-3 flex items-center gap-2.5 text-sm font-semibold transition-colors"
            style={{
              background: active ? "oklch(0.72 0.18 250 / 0.14)" : "transparent",
              color: active ? "oklch(0.85 0.15 250)" : "oklch(0.78 0.008 270)",
            }}>
            {isPinned
              ? <Pin className="w-3 h-3 shrink-0" style={{ color: "oklch(0.82 0.18 75)" }} />
              : <MessageSquare className="w-3.5 h-3.5 shrink-0 opacity-60" />}
            <span className="truncate flex-1 leading-snug">{conv.title || `对话 #${conv.id}`}</span>
          </button>
          <button onClick={(e) => { e.stopPropagation(); setMenuOpen(o => !o); }}
            className="absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded-md flex items-center justify-center opacity-0 group-hover/item:opacity-100 transition-opacity hover:bg-white/10"
            style={{ color: "oklch(0.55 0.01 270)" }}>
            <MoreHorizontal className="w-3 h-3" />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-8 z-50 rounded-xl py-1 min-w-[150px] shadow-xl"
                style={{ background: "oklch(0.20 0.007 270)", border: "1px solid oklch(0.28 0.008 270)" }}>
                <button onClick={startEdit}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8"
                  style={{ color: "oklch(0.82 0.005 270)" }}>
                  <Pencil className="w-3.5 h-3.5" />重命名
                </button>
                <button onClick={() => { onPin(conv.id, !isPinned); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8"
                  style={{ color: isPinned ? "oklch(0.82 0.18 75)" : "oklch(0.82 0.005 270)" }}>
                  <Pin className="w-3.5 h-3.5" />{isPinned ? "取消置顶" : "置顶对话"}
                </button>
                <button onClick={() => { onMove(); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8"
                  style={{ color: "oklch(0.82 0.005 270)" }}>
                  <MoveRight className="w-3.5 h-3.5" />移入分组
                </button>
                <button onClick={() => { setConfirmDelete(true); setMenuOpen(false); }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-white/8"
                  style={{ color: "oklch(0.65 0.18 25)" }}>
                  <Trash2 className="w-3.5 h-3.5" />删除对话
                </button>
              </div>
            </>
          )}
          {/* 删除确认对话框 */}
          {confirmDelete && (
            <>
              <div className="fixed inset-0 z-50" onClick={() => setConfirmDelete(false)} />
              <div className="absolute right-0 top-8 z-50 rounded-xl p-3 shadow-xl"
                style={{ background: "oklch(0.20 0.007 270)", border: "1px solid oklch(0.35 0.12 25 / 0.5)", minWidth: "180px" }}>
                <p className="text-xs mb-2.5" style={{ color: "oklch(0.82 0.005 270)" }}>
                  确定删除「{conv.title || `对话 #${conv.id}`}」？
                </p>
                <p className="text-xs mb-3" style={{ color: "oklch(0.50 0.01 270)" }}>删除后无法恢复</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-1.5 rounded-lg text-xs transition-colors hover:bg-white/5"
                    style={{ color: "oklch(0.65 0.01 270)", border: "1px solid oklch(0.28 0.008 270)" }}>
                    取消
                  </button>
                  <button onClick={() => { onDelete(conv.id); setConfirmDelete(false); }}
                    className="flex-1 py-1.5 rounded-lg text-xs font-medium"
                    style={{ background: "oklch(0.55 0.18 25)", color: "white" }}>
                    删除
                  </button>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
