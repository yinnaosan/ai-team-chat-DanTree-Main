/**
 * Web Search Engine — PERMANENTLY DISABLED
 *
 * ⛔ SYSTEM DECISION: Tavily, Serper, and all web search/scraping providers
 * are permanently disabled per architecture decision.
 *
 * Reasons:
 * 1. Sandbox network restrictions prevent outbound HTTP connections
 * 2. Web scraping pollutes evidenceScore and analysis quality
 * 3. Architecture relies exclusively on structured financial data APIs
 *
 * DO NOT re-enable unless GPT explicitly authorizes it.
 * All functions return empty strings / disabled status.
 */

// ── Type stubs (kept for import compatibility) ────────────────────────────────

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score?: number;
  published_date?: string;
}

export interface SearchResult {
  content: string;
  sources: Array<{ domain: string; url: string; title: string; success: boolean }>;
}

export interface TaskSearchResult {
  content: string;
  sources: SearchResult["sources"];
}

// ── Status functions (return DISABLED state) ─────────────────────────────────

export function isTavilyConfigured(): boolean {
  return false; // DISABLED
}

export function isSerperConfigured(): boolean {
  return false; // DISABLED
}

export function getActiveSearchEngine(): "tavily" | "serper" | "none" {
  return "none"; // DISABLED
}

export function getTavilyKeyStatuses(): Array<{
  index: number;
  masked: string;
  status: "active" | "exhausted" | "error";
  configured: boolean;
}> {
  // Return 4 slots all marked as disabled
  return [1, 2, 3, 4].map(i => ({
    index: i,
    masked: "DISABLED",
    status: "error" as const,
    configured: false,
  }));
}

export function getSerperKeyStatuses(): Array<{
  index: number;
  masked: string;
  status: "active" | "exhausted" | "error";
  configured: boolean;
}> {
  // Return 3 slots all marked as disabled
  return [1, 2, 3].map(i => ({
    index: i,
    masked: "DISABLED",
    status: "error" as const,
    configured: false,
  }));
}

// ── Search functions (all return empty / disabled) ────────────────────────────

export async function searchFromUserLibrary(
  _query: string,
  _libraryUrls: string[]
): Promise<SearchResult> {
  return { content: "", sources: [] }; // DISABLED
}

export async function searchFinancialNews(_query: string, _maxResults = 5): Promise<string> {
  return ""; // DISABLED — web search permanently disabled
}

export async function searchStockNews(_ticker: string, _companyName?: string): Promise<string> {
  return ""; // DISABLED — web search permanently disabled
}

export async function searchMacroNews(_topic: string): Promise<string> {
  return ""; // DISABLED — web search permanently disabled
}

export async function searchForTask(
  _taskDescription: string,
  _userDataSources?: string[]
): Promise<TaskSearchResult> {
  return { content: "", sources: [] }; // DISABLED — web search permanently disabled
}
