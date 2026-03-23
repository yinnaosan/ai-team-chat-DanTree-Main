import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Plus, Pencil, Trash2, DollarSign, CreditCard, BarChart3 } from "lucide-react";

// ── 颜色配置 ─────────────────────────────────────────────────────────────────
const ASSET_COLORS: Record<string, string> = {
  stocks: "#6366f1",
  crypto: "#f59e0b",
  cash: "#10b981",
  real_estate: "#3b82f6",
  bonds: "#8b5cf6",
  other: "#6b7280",
};

const LIABILITY_COLORS: Record<string, string> = {
  mortgage: "#ef4444",
  car_loan: "#f97316",
  credit_card: "#ec4899",
  student_loan: "#14b8a6",
  personal_loan: "#a855f7",
  other: "#6b7280",
};

const ASSET_LABELS: Record<string, string> = {
  stocks: "股票/ETF", crypto: "加密货币", cash: "现金/存款",
  real_estate: "房产", bonds: "债券", other: "其他",
};

const LIABILITY_LABELS: Record<string, string> = {
  mortgage: "房贷", car_loan: "车贷", credit_card: "信用卡",
  student_loan: "学生贷款", personal_loan: "个人贷款", other: "其他",
};

function fmt(val: string | number | null | undefined): string {
  const n = parseFloat(String(val ?? "0"));
  if (isNaN(n)) return "$0";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}

function fmtPct(val: number): string {
  return `${val >= 0 ? "+" : ""}${val.toFixed(1)}%`;
}

// ── 资产表单 ─────────────────────────────────────────────────────────────────
interface AssetFormData {
  name: string; category: string; ticker: string; quantity: string;
  costBasis: string; currentValue: string; notes: string;
}

const emptyAsset: AssetFormData = { name: "", category: "stocks", ticker: "", quantity: "", costBasis: "", currentValue: "", notes: "" };

function AssetForm({ initial, onSubmit, loading }: { initial?: AssetFormData; onSubmit: (d: AssetFormData) => void; loading: boolean }) {
  const [form, setForm] = useState<AssetFormData>(initial ?? emptyAsset);
  const set = (k: keyof AssetFormData) => (v: string) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>名称 *</Label>
          <Input value={form.name} onChange={e => set("name")(e.target.value)} placeholder="如：苹果股票" />
        </div>
        <div className="space-y-1">
          <Label>类别 *</Label>
          <Select value={form.category} onValueChange={set("category")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ASSET_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>股票代码</Label>
          <Input value={form.ticker} onChange={e => set("ticker")(e.target.value.toUpperCase())} placeholder="如：AAPL" />
        </div>
        <div className="space-y-1">
          <Label>持有数量</Label>
          <Input type="number" value={form.quantity} onChange={e => set("quantity")(e.target.value)} placeholder="如：100" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>成本价（USD）</Label>
          <Input type="number" value={form.costBasis} onChange={e => set("costBasis")(e.target.value)} placeholder="如：15000" />
        </div>
        <div className="space-y-1">
          <Label>当前市值（USD）*</Label>
          <Input type="number" value={form.currentValue} onChange={e => set("currentValue")(e.target.value)} placeholder="如：18000" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>备注</Label>
        <Textarea value={form.notes} onChange={e => set("notes")(e.target.value)} rows={2} placeholder="可选备注" />
      </div>
      <Button onClick={() => onSubmit(form)} disabled={loading || !form.name || !form.currentValue} className="w-full">
        {loading ? "保存中..." : "保存资产"}
      </Button>
    </div>
  );
}

// ── 负债表单 ─────────────────────────────────────────────────────────────────
interface LiabilityFormData {
  name: string; category: string; outstandingBalance: string;
  interestRate: string; monthlyPayment: string; notes: string;
}

const emptyLiability: LiabilityFormData = { name: "", category: "mortgage", outstandingBalance: "", interestRate: "", monthlyPayment: "", notes: "" };

function LiabilityForm({ initial, onSubmit, loading }: { initial?: LiabilityFormData; onSubmit: (d: LiabilityFormData) => void; loading: boolean }) {
  const [form, setForm] = useState<LiabilityFormData>(initial ?? emptyLiability);
  const set = (k: keyof LiabilityFormData) => (v: string) => setForm(f => ({ ...f, [k]: v }));
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>名称 *</Label>
          <Input value={form.name} onChange={e => set("name")(e.target.value)} placeholder="如：房屋贷款" />
        </div>
        <div className="space-y-1">
          <Label>类别 *</Label>
          <Select value={form.category} onValueChange={set("category")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(LIABILITY_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label>未偿余额（USD）*</Label>
          <Input type="number" value={form.outstandingBalance} onChange={e => set("outstandingBalance")(e.target.value)} placeholder="如：250000" />
        </div>
        <div className="space-y-1">
          <Label>年利率（%）</Label>
          <Input type="number" value={form.interestRate} onChange={e => set("interestRate")(e.target.value)} placeholder="如：3.5" />
        </div>
      </div>
      <div className="space-y-1">
        <Label>月供（USD）</Label>
        <Input type="number" value={form.monthlyPayment} onChange={e => set("monthlyPayment")(e.target.value)} placeholder="如：1500" />
      </div>
      <div className="space-y-1">
        <Label>备注</Label>
        <Textarea value={form.notes} onChange={e => set("notes")(e.target.value)} rows={2} placeholder="可选备注" />
      </div>
      <Button onClick={() => onSubmit(form)} disabled={loading || !form.name || !form.outstandingBalance} className="w-full bg-red-600 hover:bg-red-700">
        {loading ? "保存中..." : "保存负债"}
      </Button>
    </div>
  );
}

// ── 主页面 ─────────────────────────────────────────────────────────────────
export default function NetWorthDashboard() {
  const utils = trpc.useUtils();

  const { data: assets = [], isLoading: assetsLoading } = trpc.netWorth.getAssets.useQuery();
  const { data: liabilities = [], isLoading: liabilitiesLoading } = trpc.netWorth.getLiabilities.useQuery();
  const { data: history = [] } = trpc.netWorth.getHistory.useQuery();

  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [addLiabilityOpen, setAddLiabilityOpen] = useState(false);
  const [editAssetId, setEditAssetId] = useState<number | null>(null);
  const [editLiabilityId, setEditLiabilityId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "assets" | "liabilities">("overview");

  const createAsset = trpc.netWorth.createAsset.useMutation({
    onSuccess: () => { utils.netWorth.getAssets.invalidate(); utils.netWorth.getHistory.invalidate(); setAddAssetOpen(false); toast.success("资产已添加"); },
    onError: (e) => toast.error(`添加失败: ${e.message}`),
  });

  const updateAsset = trpc.netWorth.updateAsset.useMutation({
    onSuccess: () => { utils.netWorth.getAssets.invalidate(); utils.netWorth.getHistory.invalidate(); setEditAssetId(null); toast.success("资产已更新"); },
    onError: (e) => toast.error(`更新失败: ${e.message}`),
  });

  const deleteAsset = trpc.netWorth.deleteAsset.useMutation({
    onSuccess: () => { utils.netWorth.getAssets.invalidate(); utils.netWorth.getHistory.invalidate(); toast.success("资产已删除"); },
  });

  const createLiability = trpc.netWorth.createLiability.useMutation({
    onSuccess: () => { utils.netWorth.getLiabilities.invalidate(); utils.netWorth.getHistory.invalidate(); setAddLiabilityOpen(false); toast.success("负债已添加"); },
    onError: (e) => toast.error(`添加失败: ${e.message}`),
  });

  const updateLiability = trpc.netWorth.updateLiability.useMutation({
    onSuccess: () => { utils.netWorth.getLiabilities.invalidate(); utils.netWorth.getHistory.invalidate(); setEditLiabilityId(null); toast.success("负债已更新"); },
    onError: (e) => toast.error(`更新失败: ${e.message}`),
  });

  const deleteLiability = trpc.netWorth.deleteLiability.useMutation({
    onSuccess: () => { utils.netWorth.getLiabilities.invalidate(); utils.netWorth.getHistory.invalidate(); toast.success("负债已删除"); },
  });

  // ── 计算汇总数据 ────────────────────────────────────────────────────────
  const totalAssets = useMemo(() => assets.reduce((s, a) => s + parseFloat(a.currentValue), 0), [assets]);
  const totalLiabilities = useMemo(() => liabilities.reduce((s, l) => s + parseFloat(l.outstandingBalance), 0), [liabilities]);
  const netWorth = totalAssets - totalLiabilities;
  const debtToAssetRatio = totalAssets > 0 ? (totalLiabilities / totalAssets) * 100 : 0;

  // 净资产历史趋势（最近 30 条，倒序 → 正序）
  const historyChartData = useMemo(() => {
    return [...history].reverse().map(h => ({
      date: new Date(h.snapshotAt).toLocaleDateString("zh-CN", { month: "short", day: "numeric" }),
      netWorth: parseFloat(h.netWorth),
      assets: parseFloat(h.totalAssets),
      liabilities: parseFloat(h.totalLiabilities),
    }));
  }, [history]);

  // 资产分类饼图
  const assetPieData = useMemo(() => {
    const map = new Map<string, number>();
    assets.forEach(a => map.set(a.category, (map.get(a.category) ?? 0) + parseFloat(a.currentValue)));
    return Array.from(map.entries()).map(([name, value]) => ({ name: ASSET_LABELS[name] ?? name, value, color: ASSET_COLORS[name] ?? "#6b7280" }));
  }, [assets]);

  // 净资产变化（与上次快照对比）
  const netWorthChange = useMemo(() => {
    if (history.length < 2) return null;
    const prev = parseFloat(history[1].netWorth);
    const curr = parseFloat(history[0].netWorth);
    return { abs: curr - prev, pct: prev !== 0 ? ((curr - prev) / Math.abs(prev)) * 100 : 0 };
  }, [history]);

  const editingAsset = assets.find(a => a.id === editAssetId);
  const editingLiability = liabilities.find(l => l.id === editLiabilityId);

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">资产负债表</h1>
          <p className="text-sm text-muted-foreground mt-0.5">参考 maybe-finance/maybe 设计 · 追踪你的净资产变化</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={addAssetOpen} onOpenChange={setAddAssetOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1"><Plus className="h-4 w-4" />添加资产</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>添加资产</DialogTitle></DialogHeader>
              <AssetForm onSubmit={d => createAsset.mutate({ name: d.name, category: d.category as any, ticker: d.ticker || undefined, quantity: d.quantity || undefined, costBasis: d.costBasis || undefined, currentValue: d.currentValue, notes: d.notes || undefined })} loading={createAsset.isPending} />
            </DialogContent>
          </Dialog>
          <Dialog open={addLiabilityOpen} onOpenChange={setAddLiabilityOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="gap-1 border-red-500/30 text-red-400 hover:bg-red-500/10"><Plus className="h-4 w-4" />添加负债</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>添加负债</DialogTitle></DialogHeader>
              <LiabilityForm onSubmit={d => createLiability.mutate({ name: d.name, category: d.category as any, outstandingBalance: d.outstandingBalance, interestRate: d.interestRate || undefined, monthlyPayment: d.monthlyPayment || undefined, notes: d.notes || undefined })} loading={createLiability.isPending} />
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* 净资产概览卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="md:col-span-2 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 border-indigo-500/20">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">净资产</p>
                <p className={`text-3xl font-bold mt-1 ${netWorth >= 0 ? "text-indigo-400" : "text-red-400"}`}>{fmt(netWorth)}</p>
                {netWorthChange && (
                  <div className={`flex items-center gap-1 mt-1 text-sm ${netWorthChange.abs >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {netWorthChange.abs >= 0 ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    <span>{fmt(Math.abs(netWorthChange.abs))} ({fmtPct(netWorthChange.pct)})</span>
                    <span className="text-muted-foreground text-xs">vs 上次</span>
                  </div>
                )}
              </div>
              <BarChart3 className="h-8 w-8 text-indigo-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-emerald-500/5 border-emerald-500/20">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">总资产</p>
                <p className="text-2xl font-bold text-emerald-400 mt-1">{fmt(totalAssets)}</p>
                <p className="text-xs text-muted-foreground mt-1">{assets.length} 项资产</p>
              </div>
              <DollarSign className="h-7 w-7 text-emerald-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
        <Card className="bg-red-500/5 border-red-500/20">
          <CardContent className="pt-6">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-muted-foreground">总负债</p>
                <p className="text-2xl font-bold text-red-400 mt-1">{fmt(totalLiabilities)}</p>
                <p className="text-xs text-muted-foreground mt-1">负债率 {debtToAssetRatio.toFixed(1)}%</p>
              </div>
              <CreditCard className="h-7 w-7 text-red-400 opacity-60" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Tab 切换 */}
      <div className="flex gap-1 border-b border-border">
        {(["overview", "assets", "liabilities"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-indigo-500 text-indigo-400" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {tab === "overview" ? "概览" : tab === "assets" ? `资产 (${assets.length})` : `负债 (${liabilities.length})`}
          </button>
        ))}
      </div>

      {/* 概览 Tab */}
      {activeTab === "overview" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 净资产历史趋势 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">净资产历史趋势</CardTitle>
            </CardHeader>
            <CardContent>
              {historyChartData.length < 2 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">添加资产/负债后自动记录趋势</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <AreaChart data={historyChartData}>
                    <defs>
                      <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#9ca3af" }} />
                    <YAxis tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} tick={{ fontSize: 10, fill: "#9ca3af" }} />
                    <Tooltip formatter={(v: number) => [fmt(v), "净资产"]} contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }} />
                    <Area type="monotone" dataKey="netWorth" stroke="#6366f1" fill="url(#nwGrad)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* 资产分类饼图 */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">资产分类分布</CardTitle>
            </CardHeader>
            <CardContent>
              {assetPieData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">暂无资产数据</div>
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie data={assetPieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} dataKey="value" paddingAngle={2}>
                      {assetPieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => [fmt(v)]} contentStyle={{ background: "#1f2937", border: "1px solid #374151", borderRadius: "8px" }} />
                    <Legend formatter={(v) => <span style={{ color: "#9ca3af", fontSize: 11 }}>{v}</span>} />
                  </PieChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* 资产 Tab */}
      {activeTab === "assets" && (
        <div className="space-y-3">
          {assetsLoading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : assets.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <DollarSign className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>暂无资产记录</p>
              <p className="text-sm mt-1">点击「添加资产」开始追踪你的财富</p>
            </div>
          ) : (
            assets.map(asset => {
              const cost = parseFloat(asset.costBasis ?? "0");
              const curr = parseFloat(asset.currentValue);
              const gain = cost > 0 ? curr - cost : null;
              const gainPct = gain !== null && cost > 0 ? (gain / cost) * 100 : null;
              return (
                <Card key={asset.id} className="hover:border-indigo-500/30 transition-colors">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-8 rounded-full" style={{ background: ASSET_COLORS[asset.category] ?? "#6b7280" }} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{asset.name}</span>
                            {asset.ticker && <Badge variant="outline" className="text-xs px-1.5 py-0">{asset.ticker}</Badge>}
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">{ASSET_LABELS[asset.category]}</Badge>
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {asset.quantity && <span>持有 {asset.quantity} 份</span>}
                            {cost > 0 && <span className="ml-2">成本 {fmt(cost)}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-semibold text-emerald-400">{fmt(curr)}</div>
                          {gainPct !== null && (
                            <div className={`text-xs ${gainPct >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                              {gainPct >= 0 ? "+" : ""}{gainPct.toFixed(1)}% ({fmt(Math.abs(gain!))})
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditAssetId(asset.id)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => deleteAsset.mutate({ id: asset.id })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* 负债 Tab */}
      {activeTab === "liabilities" && (
        <div className="space-y-3">
          {liabilitiesLoading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : liabilities.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CreditCard className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p>暂无负债记录</p>
            </div>
          ) : (
            liabilities.map(liability => {
              const rate = liability.interestRate ? (parseFloat(liability.interestRate) * 100).toFixed(2) : null;
              return (
                <Card key={liability.id} className="hover:border-red-500/30 transition-colors">
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-2 h-8 rounded-full" style={{ background: LIABILITY_COLORS[liability.category] ?? "#6b7280" }} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm">{liability.name}</span>
                            <Badge variant="secondary" className="text-xs px-1.5 py-0">{LIABILITY_LABELS[liability.category]}</Badge>
                            {rate && <Badge variant="outline" className="text-xs px-1.5 py-0 border-red-500/30 text-red-400">{rate}% 年利率</Badge>}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {liability.monthlyPayment && <span>月供 {fmt(liability.monthlyPayment)}</span>}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-semibold text-red-400">{fmt(liability.outstandingBalance)}</div>
                          <div className="text-xs text-muted-foreground">未偿余额</div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => setEditLiabilityId(liability.id)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 text-red-400 hover:text-red-300" onClick={() => deleteLiability.mutate({ id: liability.id })}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      )}

      {/* 编辑资产 Dialog */}
      <Dialog open={editAssetId !== null} onOpenChange={open => !open && setEditAssetId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑资产</DialogTitle></DialogHeader>
          {editingAsset && (
            <AssetForm
              initial={{ name: editingAsset.name, category: editingAsset.category, ticker: editingAsset.ticker ?? "", quantity: editingAsset.quantity ?? "", costBasis: editingAsset.costBasis ?? "", currentValue: editingAsset.currentValue, notes: editingAsset.notes ?? "" }}
              onSubmit={d => updateAsset.mutate({ id: editAssetId!, name: d.name || undefined, category: d.category as any, ticker: d.ticker || undefined, quantity: d.quantity || undefined, costBasis: d.costBasis || undefined, currentValue: d.currentValue || undefined, notes: d.notes || undefined })}
              loading={updateAsset.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* 编辑负债 Dialog */}
      <Dialog open={editLiabilityId !== null} onOpenChange={open => !open && setEditLiabilityId(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>编辑负债</DialogTitle></DialogHeader>
          {editingLiability && (
            <LiabilityForm
              initial={{ name: editingLiability.name, category: editingLiability.category, outstandingBalance: editingLiability.outstandingBalance, interestRate: editingLiability.interestRate ? (parseFloat(editingLiability.interestRate) * 100).toString() : "", monthlyPayment: editingLiability.monthlyPayment ?? "", notes: editingLiability.notes ?? "" }}
              onSubmit={d => updateLiability.mutate({ id: editLiabilityId!, name: d.name || undefined, category: d.category as any, outstandingBalance: d.outstandingBalance || undefined, interestRate: d.interestRate ? (parseFloat(d.interestRate) / 100).toString() : undefined, monthlyPayment: d.monthlyPayment || undefined, notes: d.notes || undefined })}
              loading={updateLiability.isPending}
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
