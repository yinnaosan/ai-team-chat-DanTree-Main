/**
 * efinanceApi.ts
 * 通过 Python 子进程调用 efinance 库，获取 A股/港股/美股数据
 * 数据来源：东方财富（efinance 封装）
 */
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

// ─── 类型定义 ─────────────────────────────────────────────────────────────────

export interface EFinanceKLine {
  date: string;
  open: number;
  close: number;
  high: number;
  low: number;
  volume: number;
  amount: number;
  pctChange: number;
  turnoverRate: number;
}

export interface EFinanceBaseInfo {
  code: string;
  name: string;
  netProfit: number | null;
  totalMarketCap: number | null;
  circulatingMarketCap: number | null;
  industry: string;
  pe: number | null;
  pb: number | null;
  roe: number | null;
  grossMargin: number | null;
  netMargin: number | null;
}

export interface EFinanceSnapshot {
  code: string;
  name: string;
  latestPrice: number;
  prevClose: number;
  open: number;
  high: number;
  low: number;
  pctChange: number;
  change: number;
  volume: number;
  amount: number;
  turnoverRate: number;
  limitUp: number;
  limitDown: number;
  avgPrice: number;
  updatedAt: string;
}

export interface EFinanceHolder {
  reportDate: string;
  holderName: string;
  shares: string;
  holdRatio: string;
  change: string;
}

export interface EFinanceData {
  code: string;
  name: string;
  source: "efinance（东方财富）";
  fetchedAt: string;
  baseInfo: EFinanceBaseInfo | null;
  snapshot: EFinanceSnapshot | null;
  klines: EFinanceKLine[];
  topHolders: EFinanceHolder[];
}

// ─── Python 脚本 ──────────────────────────────────────────────────────────────

const PYTHON_SCRIPT = `
import sys, json
import efinance as ef

code = sys.argv[1]
days = int(sys.argv[2]) if len(sys.argv) > 2 else 30

result = {
    "code": code,
    "baseInfo": None,
    "snapshot": None,
    "klines": [],
    "topHolders": [],
    "name": "",
    "error": None,
}

# 基本信息
try:
    info = ef.stock.get_base_info(code)
    if info is not None and not (hasattr(info, 'empty') and info.empty):
        if hasattr(info, 'to_dict'):
            d = info.to_dict()
        else:
            d = dict(info)
        result["name"] = str(d.get("股票名称", "") or d.get("名称", "") or "")
        result["baseInfo"] = {
            "code": code,
            "name": result["name"],
            "netProfit": float(d["净利润"]) if d.get("净利润") and str(d["净利润"]) not in ["nan","None",""] else None,
            "totalMarketCap": float(d["总市值"]) if d.get("总市值") and str(d["总市值"]) not in ["nan","None",""] else None,
            "circulatingMarketCap": float(d["流通市值"]) if d.get("流通市值") and str(d["流通市值"]) not in ["nan","None",""] else None,
            "industry": str(d.get("所处行业", "") or ""),
            "pe": float(d["市盈率(动)"]) if d.get("市盈率(动)") and str(d["市盈率(动)"]) not in ["nan","None","","-"] else None,
            "pb": float(d["市净率"]) if d.get("市净率") and str(d["市净率"]) not in ["nan","None","","-"] else None,
            "roe": float(d["ROE"]) if d.get("ROE") and str(d["ROE"]) not in ["nan","None",""] else None,
            "grossMargin": float(d["毛利率"]) if d.get("毛利率") and str(d["毛利率"]) not in ["nan","None",""] else None,
            "netMargin": float(d["净利率"]) if d.get("净利率") and str(d["净利率"]) not in ["nan","None",""] else None,
        }
except Exception as e:
    result["error"] = f"baseInfo: {e}"

# 实时快照
try:
    snap = ef.stock.get_quote_snapshot(code)
    if snap is not None:
        if hasattr(snap, 'to_dict'):
            s = snap.to_dict()
        else:
            s = dict(snap)
        def fv(k):
            v = s.get(k)
            if v is None or str(v) in ["nan","None",""]: return None
            try: return float(v)
            except: return None
        result["snapshot"] = {
            "code": code,
            "name": result["name"],
            "latestPrice": fv("最新价"),
            "prevClose": fv("昨收"),
            "open": fv("今开") or fv("开盘"),
            "high": fv("最高"),
            "low": fv("最低"),
            "pctChange": fv("涨跌幅"),
            "change": fv("涨跌额"),
            "volume": fv("成交量"),
            "amount": fv("成交额"),
            "turnoverRate": fv("换手率"),
            "limitUp": fv("涨停价"),
            "limitDown": fv("跌停价"),
            "avgPrice": fv("均价"),
            "updatedAt": str(s.get("时间", "")),
        }
except Exception as e:
    if not result["error"]:
        result["error"] = f"snapshot: {e}"

# 历史K线
try:
    from datetime import datetime, timedelta
    end = datetime.today()
    beg = end - timedelta(days=max(days, 30))
    df = ef.stock.get_quote_history(code, beg=beg.strftime("%Y%m%d"), end=end.strftime("%Y%m%d"))
    if df is not None and not df.empty:
        if not result["name"] and "股票名称" in df.columns:
            result["name"] = str(df["股票名称"].iloc[0])
        klines = []
        for _, row in df.tail(60).iterrows():
            def rv(k):
                v = row.get(k)
                if v is None or str(v) in ["nan","None",""]: return 0.0
                try: return float(v)
                except: return 0.0
            klines.append({
                "date": str(row.get("日期", "")),
                "open": rv("开盘"),
                "close": rv("收盘"),
                "high": rv("最高"),
                "low": rv("最低"),
                "volume": rv("成交量"),
                "amount": rv("成交额"),
                "pctChange": rv("涨跌幅"),
                "turnoverRate": rv("换手率"),
            })
        result["klines"] = klines
except Exception as e:
    if not result["error"]:
        result["error"] = f"klines: {e}"

# 十大股东（仅A股）
try:
    if not (code.startswith("0") and len(code) == 5) and not code.isalpha():
        df_h = ef.stock.get_top10_stock_holder_info(code)
        if df_h is not None and not df_h.empty:
            holders = []
            for _, row in df_h.head(10).iterrows():
                holders.append({
                    "reportDate": str(row.get("更新日期", "")),
                    "holderName": str(row.get("股东名称", "")),
                    "shares": str(row.get("持股数", "")),
                    "holdRatio": str(row.get("持股比例", "")),
                    "change": str(row.get("增减", "")),
                })
            result["topHolders"] = holders
except Exception:
    pass

print(json.dumps(result, ensure_ascii=False, default=str))
`;

// ─── 核心调用函数 ─────────────────────────────────────────────────────────────

export async function fetchEFinanceData(
  code: string,
  days = 30
): Promise<EFinanceData | null> {
  if (!code || !code.trim()) return null;

  try {
    const { stdout, stderr } = await execFileAsync(
      "python3",
      ["-c", PYTHON_SCRIPT, code.trim(), String(days)],
      { timeout: 30000, maxBuffer: 5 * 1024 * 1024 }
    );

    if (stderr && !stderr.includes("it/s]") && !stderr.includes("Processing")) {
      // 忽略 tqdm 进度条输出，只记录真实错误
      const realErrors = stderr.split("\n").filter(
        l => l.trim() && !l.includes("it/s]") && !l.includes("Processing =>") && !l.includes("%|")
      );
      if (realErrors.length > 0) {
        console.warn("[efinanceApi] Python stderr:", realErrors.slice(0, 3).join("; "));
      }
    }

    const raw = JSON.parse(stdout.trim());
    if (!raw || typeof raw !== "object") return null;

    return {
      code: raw.code,
      name: raw.name || code,
      source: "efinance（东方财富）",
      fetchedAt: new Date().toISOString(),
      baseInfo: raw.baseInfo || null,
      snapshot: raw.snapshot || null,
      klines: raw.klines || [],
      topHolders: raw.topHolders || [],
    };
  } catch (err) {
    console.error("[efinanceApi] Error fetching", code, ":", err instanceof Error ? err.message : err);
    return null;
  }
}

// ─── 格式化为 Markdown ────────────────────────────────────────────────────────

export function formatEFinanceDataAsMarkdown(data: EFinanceData): string {
  const lines: string[] = [];
  const fmt = (n: number | null | undefined, digits = 2, suffix = "") =>
    n != null && !isNaN(n) ? `${n.toFixed(digits)}${suffix}` : "N/A";
  const fmtB = (n: number | null | undefined) => {
    if (n == null || isNaN(n)) return "N/A";
    if (Math.abs(n) >= 1e12) return `${(n / 1e12).toFixed(2)} 万亿`;
    if (Math.abs(n) >= 1e8) return `${(n / 1e8).toFixed(2)} 亿`;
    if (Math.abs(n) >= 1e4) return `${(n / 1e4).toFixed(2)} 万`;
    return n.toFixed(2);
  };

  lines.push(`## ${data.name}（${data.code}）— efinance 东方财富数据`);
  lines.push(`> 数据获取时间：${new Date(data.fetchedAt).toLocaleString("zh-CN")}`);
  lines.push("");

  // 实时快照
  if (data.snapshot) {
    const s = data.snapshot;
    const sign = (s.pctChange ?? 0) >= 0 ? "▲" : "▼";
    lines.push("### 实时行情");
    lines.push(`| 项目 | 数值 | 项目 | 数值 |`);
    lines.push(`|------|------|------|------|`);
    lines.push(`| 最新价 | **${fmt(s.latestPrice)}** | 涨跌幅 | ${sign} ${fmt(s.pctChange)}% |`);
    lines.push(`| 今开 | ${fmt(s.open)} | 昨收 | ${fmt(s.prevClose)} |`);
    lines.push(`| 最高 | ${fmt(s.high)} | 最低 | ${fmt(s.low)} |`);
    lines.push(`| 成交量 | ${fmtB(s.volume)} 手 | 成交额 | ${fmtB(s.amount)} |`);
    lines.push(`| 换手率 | ${fmt(s.turnoverRate)}% | 均价 | ${fmt(s.avgPrice)} |`);
    lines.push(`| 涨停价 | ${fmt(s.limitUp)} | 跌停价 | ${fmt(s.limitDown)} |`);
    lines.push("");
  }

  // 基本面
  if (data.baseInfo) {
    const b = data.baseInfo;
    lines.push("### 基本面数据");
    lines.push(`| 指标 | 数值 | 指标 | 数值 |`);
    lines.push(`|------|------|------|------|`);
    lines.push(`| 总市值 | ${fmtB(b.totalMarketCap)} | 流通市值 | ${fmtB(b.circulatingMarketCap)} |`);
    lines.push(`| 净利润 | ${fmtB(b.netProfit)} | 所属行业 | ${b.industry || "N/A"} |`);
    lines.push(`| 市盈率(动) | ${fmt(b.pe)} | 市净率 | ${fmt(b.pb)} |`);
    lines.push(`| ROE | ${fmt(b.roe)}% | 毛利率 | ${fmt(b.grossMargin)}% |`);
    lines.push(`| 净利率 | ${fmt(b.netMargin)}% | | |`);
    lines.push("");
  }

  // 近期K线
  if (data.klines.length > 0) {
    const recent = data.klines.slice(-10);
    lines.push("### 近期行情（最近10个交易日）");
    lines.push("| 日期 | 开盘 | 收盘 | 最高 | 最低 | 涨跌幅 | 换手率 |");
    lines.push("|------|------|------|------|------|--------|--------|");
    for (const k of recent) {
      const sign = k.pctChange >= 0 ? "▲" : "▼";
      lines.push(`| ${k.date} | ${k.open.toFixed(2)} | ${k.close.toFixed(2)} | ${k.high.toFixed(2)} | ${k.low.toFixed(2)} | ${sign}${Math.abs(k.pctChange).toFixed(2)}% | ${k.turnoverRate.toFixed(2)}% |`);
    }
    lines.push("");
  }

  // 十大股东
  if (data.topHolders.length > 0) {
    lines.push("### 十大股东");
    lines.push("| 股东名称 | 持股数 | 持股比例 | 增减 |");
    lines.push("|----------|--------|----------|------|");
    for (const h of data.topHolders.slice(0, 5)) {
      lines.push(`| ${h.holderName} | ${h.shares} | ${h.holdRatio} | ${h.change} |`);
    }
    lines.push(`> 数据截至：${data.topHolders[0]?.reportDate || "N/A"}`);
    lines.push("");
  }

  lines.push(`*数据来源：efinance（东方财富）*`);
  return lines.join("\n");
}

// ─── 任务识别辅助函数 ─────────────────────────────────────────────────────────

/** 判断是否为需要 efinance 的股票任务（A/港/美股） */
export function isEFinanceTask(text: string): boolean {
  // A股代码（6位数字）
  if (/\b[036]\d{5}\b/.test(text)) return true;
  // 港股代码（5位数字，0开头）
  if (/\b0\d{4}\b/.test(text)) return true;
  // 美股代码（2-5位字母）
  if (/\b[A-Z]{2,5}\b/.test(text)) return true;
  // 中文公司名关键词
  const keywords = ["股票", "A股", "港股", "美股", "行情", "K线", "涨跌", "市值", "市盈率", "股价", "茅台", "腾讯", "阿里", "比亚迪", "宁德", "招商", "工行", "建行", "苹果", "微软", "谷歌", "特斯拉"];
  return keywords.some(k => text.includes(k));
}

/** 从文本中提取股票代码 */
export function extractStockCodes(text: string): string[] {
  const codes = new Set<string>();
  // A股：6位数字
  const aStockMatches = text.match(/\b([036]\d{5})\b/g) || [];
  aStockMatches.forEach(c => codes.add(c));
  // 港股：5位数字（0开头）
  const hkMatches = text.match(/\b(0\d{4})\b/g) || [];
  hkMatches.forEach(c => codes.add(c));
  // 美股：2-5位大写字母
  const usMatches = text.match(/\b([A-Z]{2,5})\b/g) || [];
  const commonUS = ["AAPL","MSFT","GOOGL","GOOG","AMZN","TSLA","META","NVDA","BRK","JPM","JNJ","V","WMT","PG","MA","UNH","HD","DIS","BAC","XOM","CVX","PFE","KO","PEP","ABBV","MRK","TMO","COST","AVGO","CSCO","ACN","DHR","VZ","ADBE","NEE","NKE","LIN","TXN","PM","RTX","QCOM","HON","LOW","UNP","SBUX","AMGN","IBM","GS","MS","CAT","INTU","SPGI","BLK","AXP","MDLZ","MMM","DE","GE","F","GM","BABA","JD","PDD","NIO","XPEV","LI","BIDU"];
  usMatches.filter(c => commonUS.includes(c)).forEach(c => codes.add(c));
  return Array.from(codes).slice(0, 3); // 最多3只
}

/** 健康检测 */
export async function pingEFinance(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync(
      "python3",
      ["-c", "import efinance as ef; print('ok')"],
      { timeout: 5000 }
    );
    return stdout.trim() === "ok";
  } catch {
    return false;
  }
}
