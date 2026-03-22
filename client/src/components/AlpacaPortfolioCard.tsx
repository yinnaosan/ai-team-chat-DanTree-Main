/**
 * AlpacaPortfolioCard.tsx — Alpaca Paper Trading 实时持仓卡片
 * 功能：
 *   - 显示模拟账户余额、持仓盈亏
 *   - 快速下单（市价买入/卖出）
 *   - 实时刷新（30 秒自动刷新）
 *   - 订单历史查看
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, RefreshCw, Plus, X, Clock, DollarSign, BarChart3, AlertCircle } from "lucide-react";

interface PlaceOrderForm {
  symbol: string;
  qty: string;
  side: "buy" | "sell";
  type: "market" | "limit";
  limitPrice: string;
  note: string;
}

export function AlpacaPortfolioCard() {
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [orderForm, setOrderForm] = useState<PlaceOrderForm>({
    symbol: "",
    qty: "1",
    side: "buy",
    type: "market",
    limitPrice: "",
    note: "",
  });

  // 数据查询
  const accountQuery = trpc.alpaca.getAccount.useQuery(undefined, {
    refetchInterval: 30000, // 30 秒自动刷新
  });
  const positionsQuery = trpc.alpaca.getPositions.useQuery(undefined, {
    refetchInterval: 30000,
  });
  const clockQuery = trpc.alpaca.getClock.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const ordersQuery = trpc.alpaca.getOrders.useQuery(
    { status: "all", limit: 20 },
    { refetchInterval: 30000 }
  );

  // 下单 mutation
  const placeOrderMutation = trpc.alpaca.placeOrder.useMutation({
    onSuccess: (data) => {
      toast.success(`✅ 模拟订单已提交：${data.order.side === "buy" ? "买入" : "卖出"} ${data.order.symbol} × ${data.order.qty} 股`);
      setOrderDialogOpen(false);
      positionsQuery.refetch();
      ordersQuery.refetch();
      accountQuery.refetch();
    },
    onError: (err) => {
      toast.error(`❌ 下单失败：${err.message}`);
    },
  });

  // 取消订单 mutation
  const cancelOrderMutation = trpc.alpaca.cancelOrder.useMutation({
    onSuccess: () => {
      toast.success("✅ 订单已取消");
      ordersQuery.refetch();
    },
    onError: (err) => {
      toast.error(`❌ 取消失败：${err.message}`);
    },
  });

  const handlePlaceOrder = () => {
    if (!orderForm.symbol.trim()) {
      toast.error("请输入股票代码");
      return;
    }
    const qty = parseFloat(orderForm.qty);
    if (isNaN(qty) || qty <= 0) {
      toast.error("请输入有效数量");
      return;
    }
    placeOrderMutation.mutate({
      symbol: orderForm.symbol.toUpperCase(),
      qty,
      side: orderForm.side,
      type: orderForm.type,
      limitPrice: orderForm.type === "limit" && orderForm.limitPrice ? parseFloat(orderForm.limitPrice) : undefined,
      note: orderForm.note || undefined,
    });
  };

  // 未配置状态
  if (accountQuery.data && !accountQuery.data.configured) {
    return (
      <Card className="border-dashed border-muted-foreground/30">
        <CardContent className="pt-6 text-center text-muted-foreground">
          <AlertCircle className="mx-auto mb-2 h-8 w-8 opacity-50" />
          <p className="text-sm">Alpaca Paper Trading 未配置</p>
          <p className="text-xs mt-1">请在设置中添加 API Key</p>
        </CardContent>
      </Card>
    );
  }

  const account = accountQuery.data?.account;
  const positions = positionsQuery.data?.positions ?? [];
  const clock = clockQuery.data?.clock;
  const orders = ordersQuery.data?.orders ?? [];

  const totalEquity = account ? parseFloat(account.equity) : 0;
  const totalPnL = account ? parseFloat(account.equity) - parseFloat(account.last_equity) : 0;
  const pnlPercent = account && parseFloat(account.last_equity) > 0
    ? (totalPnL / parseFloat(account.last_equity)) * 100
    : 0;
  const isPositive = totalPnL >= 0;

  return (
    <Card className="w-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base flex items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            模拟账户
            {clock && (
              <Badge variant={clock.is_open ? "default" : "secondary"} className="text-xs">
                {clock.is_open ? "🟢 市场开放" : "🔴 市场关闭"}
              </Badge>
            )}
          </CardTitle>
          <div className="flex gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => { accountQuery.refetch(); positionsQuery.refetch(); ordersQuery.refetch(); }}
              disabled={accountQuery.isFetching}
            >
              <RefreshCw className={`h-3.5 w-3.5 ${accountQuery.isFetching ? "animate-spin" : ""}`} />
            </Button>
            <Dialog open={orderDialogOpen} onOpenChange={setOrderDialogOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="h-7 text-xs gap-1">
                  <Plus className="h-3.5 w-3.5" />
                  下单
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md">
                <DialogHeader>
                  <DialogTitle>模拟下单</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">股票代码</Label>
                      <Input
                        placeholder="如 AAPL"
                        value={orderForm.symbol}
                        onChange={e => setOrderForm(f => ({ ...f, symbol: e.target.value.toUpperCase() }))}
                        className="mt-1"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">数量（股）</Label>
                      <Input
                        type="number"
                        min="1"
                        placeholder="1"
                        value={orderForm.qty}
                        onChange={e => setOrderForm(f => ({ ...f, qty: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">方向</Label>
                      <Select value={orderForm.side} onValueChange={(v: "buy" | "sell") => setOrderForm(f => ({ ...f, side: v }))}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="buy">买入</SelectItem>
                          <SelectItem value="sell">卖出</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">订单类型</Label>
                      <Select value={orderForm.type} onValueChange={(v: "market" | "limit") => setOrderForm(f => ({ ...f, type: v }))}>
                        <SelectTrigger className="mt-1">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="market">市价单</SelectItem>
                          <SelectItem value="limit">限价单</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  {orderForm.type === "limit" && (
                    <div>
                      <Label className="text-xs">限价（$）</Label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={orderForm.limitPrice}
                        onChange={e => setOrderForm(f => ({ ...f, limitPrice: e.target.value }))}
                        className="mt-1"
                      />
                    </div>
                  )}
                  <div>
                    <Label className="text-xs">备注（可选）</Label>
                    <Input
                      placeholder="如：基于 GPT 分析建议"
                      value={orderForm.note}
                      onChange={e => setOrderForm(f => ({ ...f, note: e.target.value }))}
                      className="mt-1"
                    />
                  </div>
                  <Button
                    className="w-full"
                    onClick={handlePlaceOrder}
                    disabled={placeOrderMutation.isPending}
                    variant={orderForm.side === "buy" ? "default" : "destructive"}
                  >
                    {placeOrderMutation.isPending ? "提交中..." : `确认${orderForm.side === "buy" ? "买入" : "卖出"}`}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* 账户概览 */}
        {account && (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-lg bg-muted/50 p-3">
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                <DollarSign className="h-3 w-3" />
                总资产
              </div>
              <div className="text-lg font-bold">${totalEquity.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
            </div>
            <div className={`rounded-lg p-3 ${isPositive ? "bg-green-500/10" : "bg-red-500/10"}`}>
              <div className="flex items-center gap-1 text-xs text-muted-foreground mb-1">
                {isPositive ? <TrendingUp className="h-3 w-3 text-green-500" /> : <TrendingDown className="h-3 w-3 text-red-500" />}
                今日盈亏
              </div>
              <div className={`text-lg font-bold ${isPositive ? "text-green-600" : "text-red-600"}`}>
                {isPositive ? "+" : ""}{totalPnL.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className={`text-xs ${isPositive ? "text-green-500" : "text-red-500"}`}>
                {isPositive ? "+" : ""}{pnlPercent.toFixed(2)}%
              </div>
            </div>
          </div>
        )}

        {/* 持仓和订单 Tabs */}
        <Tabs defaultValue="positions">
          <TabsList className="w-full h-8">
            <TabsTrigger value="positions" className="flex-1 text-xs">
              持仓 {positions.length > 0 && <Badge variant="secondary" className="ml-1 h-4 text-[10px]">{positions.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="orders" className="flex-1 text-xs">
              订单 {orders.filter(o => o.status === "new" || o.status === "partially_filled").length > 0 && (
                <Badge variant="secondary" className="ml-1 h-4 text-[10px]">
                  {orders.filter(o => o.status === "new" || o.status === "partially_filled").length}
                </Badge>
              )}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="positions" className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
            {positionsQuery.isLoading ? (
              <div className="text-center text-xs text-muted-foreground py-4">加载中...</div>
            ) : positions.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-4">暂无持仓</div>
            ) : (
              positions.map(pos => {
                const pnl = parseFloat(pos.unrealized_pl);
                const pnlPct = parseFloat(pos.unrealized_plpc) * 100;
                const isUp = pnl >= 0;
                return (
                  <div key={pos.symbol} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                    <div>
                      <div className="text-sm font-medium">{pos.symbol}</div>
                      <div className="text-xs text-muted-foreground">{pos.qty} 股 @ ${parseFloat(pos.avg_entry_price).toFixed(2)}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-medium">${parseFloat(pos.market_value).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div>
                      <div className={`text-xs ${isUp ? "text-green-500" : "text-red-500"}`}>
                        {isUp ? "+" : ""}{pnl.toFixed(2)} ({isUp ? "+" : ""}{pnlPct.toFixed(2)}%)
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>

          <TabsContent value="orders" className="mt-2 space-y-1.5 max-h-48 overflow-y-auto">
            {ordersQuery.isLoading ? (
              <div className="text-center text-xs text-muted-foreground py-4">加载中...</div>
            ) : orders.length === 0 ? (
              <div className="text-center text-xs text-muted-foreground py-4">暂无订单记录</div>
            ) : (
              orders.map(order => {
                const isOpen = order.status === "new" || order.status === "partially_filled";
                const isBuy = order.side === "buy";
                return (
                  <div key={order.id} className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <Badge variant={isBuy ? "default" : "destructive"} className="text-[10px] h-4 px-1">
                        {isBuy ? "买" : "卖"}
                      </Badge>
                      <div>
                        <div className="text-sm font-medium">{order.symbol}</div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="h-2.5 w-2.5" />
                          {order.qty} 股
                          {order.limit_price && ` @ $${parseFloat(order.limit_price).toFixed(2)}`}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge
                        variant={order.status === "filled" ? "default" : order.status === "canceled" ? "secondary" : "outline"}
                        className="text-[10px]"
                      >
                        {order.status === "filled" ? "已成交" : order.status === "canceled" ? "已取消" : order.status === "new" ? "待成交" : order.status}
                      </Badge>
                      {isOpen && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={() => cancelOrderMutation.mutate({ orderId: order.id })}
                          disabled={cancelOrderMutation.isPending}
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </TabsContent>
        </Tabs>

        {/* 账户详情 */}
        {account && (
          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground border-t pt-3">
            <div>
              <div>可用资金</div>
              <div className="text-foreground font-medium">${parseFloat(account.buying_power).toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
            </div>
            <div>
              <div>持仓市值</div>
              <div className="text-foreground font-medium">${parseFloat(account.long_market_value).toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
            </div>
            <div>
              <div>现金余额</div>
              <div className="text-foreground font-medium">${parseFloat(account.cash).toLocaleString("en-US", { maximumFractionDigits: 0 })}</div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
