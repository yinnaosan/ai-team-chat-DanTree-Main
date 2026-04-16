# Phase 4C Stage 5 — Semantic Gate Design

**类型：** ARCHITECTURE DESIGN（无代码变更）  
**日期：** 2026-04-16  
**撰写：** Claude（核心工程师）  
**供：** GPT 审阅 + Manus 执行  

---

## 核心原则

structured_analysis 是**合成层（Synthesis Layer）**，不是提取层。  
LLM 基于完整分析用自己的语言重新表达，措辞不同于 bull_case/risks 是正确行为。  
**不得使用文本等价比较。不得与 answerObject 其他字段比较。**

---

## §1 语义门控定义

### Gate 目标

验证每个子字段是否满足其**语义角色**的结构要求，而非内容是否与其他字段相同。

### 设计原则

| 原则 | 说明 |
|------|------|
| P1 — 结构验证 | 检查字段是否满足其语义角色的结构特征 |
| P2 — 可确定性 | 所有规则可通过正则 + 关键词 + 长度逻辑判定，无需 LLM re-evaluation |
| P3 — 方向一致性优于文本相似性 | primary_bull/bear 验证立场方向，不验证措辞 |
| P4 — 宽松度分层 | 区分硬性失败（HARD FAIL）和软性警告（SOFT FAIL） |
| P5 — 字段独立评分 | 每字段独立，避免一个字段失败导致全部 FAIL |

---

## §2 各字段规则

### 2.1 primary_risk_condition

**语义角色：** 使当前论点失效的具体触发条件 + 预期后果（必须是条件句）

#### 硬性规则（任一不满足 → HARD FAIL）

| 规则 | 检测方法 |
|------|---------|
| PRC-H1: 非空 | `typeof v === 'string' && v.trim().length > 0` |
| PRC-H2: 长度 ≥ 30 字符 | `v.trim().length >= 30` |
| PRC-H3: 含条件触发词 | 见下方正则 |

```
条件触发词正则：
/如果|若|一旦|当(?!前|时|下)|假如|倘若|万一|\bif\b|\bwhen\b|\bonce\b|\bshould\b/i
```

#### 软性规则（不满足 → 扣分但不 FAIL）

| 规则 | 扣分 |
|------|------|
| PRC-S1: 含后果词（则/导致/意味着/将/would/implies） | -10 |
| PRC-S2: 长度 30-49 字符（完整表达需 ≥ 50） | -5 |
| PRC-S3: 不含量化信息（数字/百分比） | -5（非必须） |

---

### 2.2 confidence_summary

**语义角色：** 解释为什么这次分析的置信度是 HIGH/MEDIUM/LOW，需明确级别 + 理由

#### 硬性规则

| 规则 | 检测方法 |
|------|---------|
| CS-H1: 非空 | 非空字符串 |
| CS-H2: 长度 ≥ 25 字符 | `v.trim().length >= 25` |
| CS-H3: 含置信度级别词 | 见下方正则 |

```
置信度级别词正则：
/高置信度|中置信度|低置信度|置信度.{0,4}[高中低]|[高中低].{0,4}置信|\bHIGH\b|\bMEDIUM\b|\bLOW\b/i
```

#### 软性规则

| 规则 | 扣分 |
|------|------|
| CS-S1: 不含理由词（因为/由于/因为/because/since/given/数据不足/无法量化） | -15 |
| CS-S2: 长度 25-39 字符 | -5 |
| CS-S3: 与 verdict 前20字高度重叠（合成变复述） | -10 |

---

### 2.3 primary_bull

**语义角色：** 最重要的一条看多论点，立场方向必须明确看多

#### 硬性规则

| 规则 | 检测方法 |
|------|---------|
| PB-H1: 非空 | 非空字符串 |
| PB-H2: 长度 ≥ 20 字符 | `v.trim().length >= 20` |
| PB-H3: 主句不含看空词 | 主句（转折词之前）不含：看空/做空/卖出/减持/下跌风险/bearish/sell/underweight |

```javascript
// 方向冲突检测（转折从句不计入主句）：
const mainClause = v.split(/但|然而|不过|however|but/i)[0];
const BEARISH_IN_BULL = /看空|做空|卖出|减持|下跌风险|估值偏高|bearish|overvalued|sell|underweight/i;
const hasConflict = BEARISH_IN_BULL.test(mainClause);  // true → HARD FAIL
```

#### 软性规则

| 规则 | 扣分 |
|------|------|
| PB-S1: 不含看多信号词（增长/上涨/超预期/强劲/bullish/upside/beat/growth） | -10 |
| PB-S2: 长度 20-29 字符 | -5 |

---

### 2.4 primary_bear

**语义角色：** 最重要的一条看空论点（与 primary_bull 镜像对称）

#### 硬性规则

| 规则 | 检测方法 |
|------|---------|
| PBR-H1: 非空 | 非空字符串 |
| PBR-H2: 长度 ≥ 20 字符 | `v.trim().length >= 20` |
| PBR-H3: 主句不含强看多词 | 主句不含：买入/增持/强烈推荐/bullish/strong buy/outperform |

```javascript
const bearMainClause = v.split(/但|然而|不过|however|but/i)[0];
const BULLISH_IN_BEAR = /买入|增持|强烈推荐|大幅上涨|bullish|strong buy|outperform/i;
const hasConflict = BULLISH_IN_BEAR.test(bearMainClause);  // true → HARD FAIL
```

#### 软性规则（与 primary_bull 镜像）

| 规则 | 扣分 |
|------|------|
| PBR-S1: 不含看空信号词（风险/下跌/利空/压力/bearish/downside/miss/concern） | -10 |
| PBR-S2: 长度 20-29 字符 | -5 |

---

### 2.5 stance_rationale

**语义角色：** 用一句话解释为什么最终立场是 BULLISH/BEARISH/NEUTRAL

#### 规则

| 规则 | 类型 | 检测方法 | 扣分 |
|------|------|---------|------|
| SR-H1: 非空 | 硬性 | 非空字符串 | — |
| SR-H2: 长度 ≥ 20 字符 | 硬性 | `length >= 20` | — |
| SR-H3: 含立场词 | 硬性 | `/BULLISH\|BEARISH\|NEUTRAL\|看多\|看空\|中性\|多头\|空头/i` | — |
| SR-S1: 不含理由连接词 | 软性 | 因为/由于/鉴于/because/given/since | -10 |

---

## §3 PASS / FAIL 判定标准

### 3.1 评分模型

```typescript
interface FieldResult {
  pass: boolean;      // 是否通过所有硬性规则
  score: number;      // 0-100
  reason: string;     // 失败原因或 'OK'
}

interface SemanticGateResult {
  overall: 'HARD_FAIL' | 'SOFT_FAIL' | 'PASS' | 'FULL_PASS';
  weighted_score: number;         // 0-100 加权分
  hard_fail_fields: string[];     // 触发硬性规则失败的字段
  warnings: string[];             // 软性规则警告
  fields: Record<string, FieldResult>;
}
```

### 3.2 权重分配

| 字段 | 权重 |
|------|------|
| primary_risk_condition | 25% |
| confidence_summary | 20% |
| primary_bull | 20% |
| primary_bear | 20% |
| stance_rationale | 15% |

### 3.3 四级判定

| 级别 | 条件 | 行动 |
|------|------|------|
| **HARD_FAIL** | 任何字段触发硬性规则失败 | 记录 hard_fail_fields，metadata 写入结果 |
| **SOFT_FAIL** | 全部通过硬性规则，加权分 < 65 | 允许继续，记录警告 |
| **PASS** | 全部通过硬性规则，加权分 65-84 | 正常通过 |
| **FULL_PASS** | 全部通过硬性规则，加权分 ≥ 85 | 高质量，可用于提升下游字段 |

---

## §4 Manus 测试方法

### 4.1 测试脚本设计

```javascript
// server/structuredAnalysisGate.ts（建议新文件，Stage 5 实施时创建）
// 输入：structured_analysis 对象 + {verdict, stance}
// 输出：SemanticGateResult
// 依赖：无外部依赖，纯 TypeScript 正则 + 逻辑

// 调用位置：validateFinalOutput() 返回 valid:true 之后（附加，不阻断现有流程）
// 写入位置：metadataToSave.structured_analysis_gate = gateResult
```

### 4.2 Stage 5 Gate 采样要求

```
最小样本量：≥ 20 条 post-Stage 3（SHA 2be1a7d）的 assistant 消息
标的要求：≥ 3 个不同标的（股票/债券/指数混合）
数据源：直查 DB structured_analysis_gate 字段（同 check_db_sa.mjs 模式）
```

### 4.3 SQL 查询模板

```sql
SELECT
  m.id,
  json_extract(m.metadata, '$.structured_analysis_gate.overall') AS gate_overall,
  json_extract(m.metadata, '$.structured_analysis_gate.weighted_score') AS score,
  json_extract(m.metadata, '$.structured_analysis_gate.hard_fail_fields') AS hard_fails,
  json_extract(m.metadata, '$.structured_analysis.primary_risk_condition') AS prc
FROM messages m
WHERE m.role = 'assistant'
  AND json_extract(m.metadata, '$.structured_analysis') IS NOT NULL
ORDER BY m.id DESC
LIMIT 30;
```

### 4.4 Gate 通过阈值

| 门控项 | 通过阈值 |
|--------|---------|
| G1: HARD_FAIL 率 | ≤ 10%（即 ≥ 90% 无硬性失败） |
| G2: PASS + FULL_PASS 合计率 | ≥ 70% |
| G3: primary_risk_condition 硬性通过率 | ≥ 85%（最核心字段单独验证） |
| G4: weighted_score 均值 | ≥ 65 |

---

## §5 边界情况

### 5.1 语言混合
中英文同时检测，任一语言触发词命中即有效。纯英文分析使用英文关键词列表。

### 5.2 转折句方向判断
只检测转折词（但/然而/however/but）之前的主句方向。  
`"营收增长强劲，但估值偏高"` → primary_bull 方向检测：主句="营收增长强劲" → PASS（无看空词）

### 5.3 隐式条件句
`"EPS 低于预期将触发估值重估"` → 无条件触发词 → PRC-H3 FAIL（建议 CRITICAL 指令中明确要求使用「如果/若/if」）

### 5.4 NEUTRAL verdict 的双面呈现
`verdict=NEUTRAL` 时，primary_bull 含看多词 + primary_bear 含看空词 = 正确行为，不扣分。  
若两者方向相同（都看多或都看空）= 软性扣分 -20，不触发 HARD FAIL。

### 5.5 占位符检测
`"暂无"` `"N/A"` `"待补充"` `"无风险"` → 长度检测会触发 TOO_SHORT（< 20-30 字）→ HARD FAIL。

### 5.6 Stage 4 Gate 失败原因（供参考，说明旧方法的问题）
| 旧方法 | 问题 |
|--------|------|
| primary_bull == bull_case[0] | 合成层必然改写，等价比较永远 FAIL |
| primary_risk_condition ⊂ risks[0].description | 合成不是引用，子串检测无效 |
| similarity(confidence_summary, verdict) > 0.8 | 置信解释与立场叙述不应相似 |

---

## §6 不变更项

- 不回退 structured_analysis 字段
- 不使用文本等价（textual equality）
- 不与 answerObject 其他字段比较
- 语义门控结果写入 metadata，不阻断现有分析流程
- structured_analysis 字段在 HARD_FAIL 时照常存储（gate 仅记录，不拦截）

---

*Phase 4C Stage 5 Semantic Gate Design · Claude（核心工程师）· 2026-04-16*
