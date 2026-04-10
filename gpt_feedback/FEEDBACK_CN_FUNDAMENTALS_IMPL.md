# FEEDBACK — CN Fundamentals 数据层实现报告

**日期**：2026-04-10
**范围**：china-fundamentals-service 建立 + Node.js orchestrator 接入
**TSC**：0 errors
**Checkpoint**：待保存

---

## 一、实现架构

```
Node.js orchestrator
  └── market === "CN" && needFundamentals
        └── fetchChinaFundamentals(ticker)  [server/fetchChinaFundamentals.ts]
              └── HTTP GET http://localhost:8001/fundamentals?symbol=600519
                    └── china-fundamentals-service (FastAPI, port 8001)
                          ├── BaoStock (Primary, confidence=high)
                          ├── AKShare (Fallback 1, confidence=medium)
                          └── efinance (Fallback 2, confidence=low)
```

**文件清单**：
| 文件 | 说明 |
|------|------|
| `china-fundamentals-service/main.py` | FastAPI 主服务，含 fallback 逻辑、24h 缓存、限流 |
| `china-fundamentals-service/baostock_provider.py` | Primary：PE/PB/ROE/Revenue/NetIncome/GrossMargin/NetMargin/EPS |
| `china-fundamentals-service/akshare_provider.py` | Fallback 1：同字段集，来自 AKShare |
| `china-fundamentals-service/efinance_provider.py` | Fallback 2：同字段集，来自 efinance |
| `server/fetchChinaFundamentals.ts` | Node.js 调用层，含格式化输出 |
| `server/dataRoutingOrchestrator.ts` | 新增 CN fundamentals block（market=CN 条件） |
| `scripts/start-china-service.sh` | 自动启动脚本，失败不影响 Node.js |
| `package.json` | dev 脚本改为 concurrently 同时启动两个服务 |

---

## 二、统一字段 Schema

```json
{
  "pe": float | null,
  "pb": float | null,
  "roe": float | null,       // 0-1 小数（如 0.384 = 38.4%）
  "revenue": float | null,   // 单位：元（CNY）
  "netIncome": float | null, // 单位：元（CNY）
  "grossMargin": float | null, // 0-1 小数
  "netMargin": float | null,   // 0-1 小数
  "eps": float | null          // 单位：元/股
}
```

---

## 三、Provider 成功判定规则

```python
def is_sufficient(data):
    has_valuation = (data.pe is not None) or (data.pb is not None)
    has_profitability = (data.roe is not None) or (data.netMargin is not None)
    return has_valuation and has_profitability
```

- 单字段缺失 → 返回 null，不触发 fallback
- 核心字段整体缺失（无估值 AND 无盈利指标）→ 触发 fallback

---

## 四、验证结果

### 600519 贵州茅台（BaoStock Primary）

| 指标 | 数值 | 合理性 |
|------|------|--------|
| PE | 20.32 | ✅ 合理（茅台当前约 20-22x） |
| PB | 7.11 | ✅ 合理 |
| ROE | 38.43% | ✅ 合理（茅台 ROE 历史约 35-40%） |
| 营业收入 | 1706.12亿元 | ✅ 合理（2024年报约 1738亿） |
| 净利润 | 893.35亿元 | ✅ 合理（2024年报约 857亿） |
| 毛利率 | 91.93% | ✅ 合理（茅台毛利率约 90-92%） |
| 净利率 | 52.27% | ✅ 合理 |
| EPS | 68.64元 | ✅ 合理 |
| 来源 | baostock | active |

### 000858 五粮液（BaoStock Primary）

| 指标 | 数值 | 合理性 |
|------|------|--------|
| PE | 14.01 | ✅ 合理 |
| PB | 2.79 | ✅ 合理 |
| ROE | 24.24% | ✅ 合理 |
| 营业收入 | 891.75亿元 | ✅ 合理 |
| 净利润 | 331.93亿元 | ✅ 合理 |
| 毛利率 | 77.05% | ✅ 合理 |
| 净利率 | 37.22% | ✅ 合理 |
| EPS | 8.21元 | ✅ 合理 |
| 来源 | baostock | active |

---

## 五、关键修复记录

**BaoStock 单位 Bug**：
- `MBRevenue` 和 `netProfit` 字段单位是**元**（不是万元）
- 原代码错误地 `* 10000`，导致数值虚高 10000 倍
- 修复：去掉乘法，直接使用原始值

---

## 六、降级保护机制

1. **Python 服务启动失败**：`start-china-service.sh` 以 `exit 0` 退出，Node.js 进程不受影响
2. **Python 服务运行中崩溃**：`fetchChinaFundamentals.ts` 捕获所有异常，返回 null，orchestrator 记录 fallback log
3. **单个 provider 失败**：继续尝试下一个 provider（BaoStock → AKShare → efinance）
4. **全部 provider 失败**：返回 `status=unavailable`，orchestrator 记录日志，不抛出异常
5. **请求超时**（30s）：AbortError 静默处理，返回 null

---

## 七、待 GPT 决策的问题

**Q1：BaoStock 的 FY 年份**
当前 `year = datetime.now().year - 1`（即 FY2025）。BaoStock 的 FY2025 数据是否已入库？还是应该先试 FY2024？

**Q2：港股（HK）覆盖**
当前 `market === "CN"` 才调用 china-fundamentals-service。港股（market=HK）是否需要接入？BaoStock 不支持港股，需要另外的 provider。

**Q3：AKShare / efinance 验证**
BaoStock 作为 Primary 已验证通过。AKShare 和 efinance 的 fallback 路径尚未实际触发测试（因为 BaoStock 成功了）。是否需要手动触发 fallback 验证？

**Q4：revenue 显示单位**
当前 `fetchChinaFundamentals.ts` 的 `fmtBillion` 函数将元转换为亿元（`/ 1e8`）显示。是否需要同时提供原始元值供 LLM 计算使用？

---

## 八、US fundamentals 隔离确认

- `market === "CN"` → 调用 china-fundamentals-service
- `market === "US"` → 调用 FMP + SimFin（不变）
- `market === "HK"` → 当前无 fundamentals 层（同之前）
- CN/HK 不会误入 US fundamentals 主链 ✅
