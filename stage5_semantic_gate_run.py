#!/usr/bin/env python3
"""
Phase 4C Stage 5 — Semantic Gate Offline Runner
Queries DB for ≥30 post-Stage3 messages with structured_analysis,
applies the same semantic rules as structuredAnalysisGate.ts,
and outputs gate stats + report.
"""
import os, re, json, sys
import pymysql
from urllib.parse import urlparse

# ── DB connect ────────────────────────────────────────────────────────────────
DB_URL = os.environ.get("DATABASE_URL", "")
if not DB_URL:
    print("ERROR: DATABASE_URL not set"); sys.exit(1)

u = urlparse(DB_URL)
conn = pymysql.connect(
    host=u.hostname, port=u.port or 3306,
    user=u.username, password=u.password,
    database=u.path.lstrip("/"),
    ssl={"ssl": {}}, charset="utf8mb4",
    cursorclass=pymysql.cursors.DictCursor,
)

# ── Fetch messages ────────────────────────────────────────────────────────────
# Post-Stage3 baseline: msgId > 1500165 (first 3 post-patch messages start at 1500166)
BASELINE_MSG_ID = 1500165

with conn.cursor() as cur:
    cur.execute("""
        SELECT id, metadata
        FROM messages
        WHERE role = 'assistant'
          AND id > %s
          AND metadata IS NOT NULL
        ORDER BY id ASC
        LIMIT 200
    """, (BASELINE_MSG_ID,))
    rows = cur.fetchall()

conn.close()

# ── Filter: must have structured_analysis ────────────────────────────────────
samples = []
for row in rows:
    try:
        meta = row["metadata"] if isinstance(row["metadata"], dict) else json.loads(row["metadata"] or "{}")
        sa = meta.get("structured_analysis")
        ao = meta.get("answerObject") or {}
        if sa and isinstance(sa, dict):
            samples.append({
                "msgId": row["id"],
                "sa": sa,
                "verdict": ao.get("verdict", "") if isinstance(ao, dict) else "",
            })
    except Exception:
        pass

print(f"Found {len(samples)} messages with structured_analysis (post-baseline)")
if len(samples) < 30:
    print(f"WARNING: only {len(samples)} samples (need ≥30). Running with available data.")

# ── Semantic Gate rules (mirror of structuredAnalysisGate.ts) ─────────────────

CONDITIONAL_TRIGGER = re.compile(
    r"如果|若|一旦|当(?!前|时|下)|假如|倘若|万一|\bif\b|\bwhen\b|\bonce\b|\bshould\b", re.I)
CONSEQUENCE_WORD    = re.compile(r"则|导致|意味着|将会|将使|将导|would|implies|result in|trigger", re.I)
CONFIDENCE_LEVEL    = re.compile(
    r"高置信度|中置信度|低置信度|置信度.{0,4}[高中低]|[高中低].{0,4}置信|\bHIGH\b|\bMEDIUM\b|\bLOW\b|置信度为[高中低]", re.I)
REASON_WORD         = re.compile(r"因为|由于|鉴于|因此|基于|because|since|given|数据不足|无法量化", re.I)
BULLISH_SIGNAL      = re.compile(
    r"增长|上涨|超预期|强劲|看多|买入|增持|bullish|upside|beat|growth|positive|outperform", re.I)
BEARISH_SIGNAL      = re.compile(
    r"风险|下跌|利空|压力|看空|做空|卖出|减持|bearish|downside|miss|concern|negative|underperform", re.I)
BEARISH_IN_BULL     = re.compile(r"看空|做空|卖出|减持|下跌风险|估值偏高|bearish|overvalued|sell|underweight", re.I)
BULLISH_IN_BEAR     = re.compile(r"买入|增持|强烈推荐|大幅上涨|bullish|strong buy|outperform", re.I)
STANCE_WORD         = re.compile(r"BULLISH|BEARISH|NEUTRAL|看多|看空|中性|多头|空头", re.I)
REASON_CONNECTOR    = re.compile(r"因为|由于|鉴于|because|given|since", re.I)

def main_clause(text):
    return re.split(r"但|然而|不过|however|but", text, flags=re.I)[0]

def eval_prc(v):
    if not v or not v.strip(): return False, 0, "PRC-H1: empty", []
    t = v.strip()
    if len(t) < 30: return False, 0, f"PRC-H2: too short ({len(t)}<30)", []
    if not CONDITIONAL_TRIGGER.search(t): return False, 0, "PRC-H3: no conditional trigger", []
    score, warns = 100, []
    if not CONSEQUENCE_WORD.search(t): score -= 10; warns.append("PRC-S1")
    if len(t) < 50: score -= 5; warns.append("PRC-S2")
    if not re.search(r"\d|%|百分", t): score -= 5; warns.append("PRC-S3")
    return True, max(0, score), "OK", warns

def eval_cs(v, verdict=""):
    if not v or not v.strip(): return False, 0, "CS-H1: empty", []
    t = v.strip()
    if len(t) < 25: return False, 0, f"CS-H2: too short ({len(t)}<25)", []
    if not CONFIDENCE_LEVEL.search(t): return False, 0, "CS-H3: no confidence level word", []
    score, warns = 100, []
    if not REASON_WORD.search(t): score -= 15; warns.append("CS-S1")
    if len(t) < 40: score -= 5; warns.append("CS-S2")
    return True, max(0, score), "OK", warns

def eval_bull(v):
    if not v or not v.strip(): return False, 0, "PB-H1: empty", []
    t = v.strip()
    if len(t) < 20: return False, 0, f"PB-H2: too short ({len(t)}<20)", []
    mc = main_clause(t)
    if BEARISH_IN_BULL.search(mc): return False, 0, "PB-H3: bearish word in main clause", []
    score, warns = 100, []
    if not BULLISH_SIGNAL.search(t): score -= 10; warns.append("PB-S1")
    if len(t) < 30: score -= 5; warns.append("PB-S2")
    return True, max(0, score), "OK", warns

def eval_bear(v):
    if not v or not v.strip(): return False, 0, "PBR-H1: empty", []
    t = v.strip()
    if len(t) < 20: return False, 0, f"PBR-H2: too short ({len(t)}<20)", []
    mc = main_clause(t)
    if BULLISH_IN_BEAR.search(mc): return False, 0, "PBR-H3: bullish word in main clause", []
    score, warns = 100, []
    if not BEARISH_SIGNAL.search(t): score -= 10; warns.append("PBR-S1")
    if len(t) < 30: score -= 5; warns.append("PBR-S2")
    return True, max(0, score), "OK", warns

def eval_sr(v):
    if not v or not v.strip(): return False, 0, "SR-H1: empty", []
    t = v.strip()
    if len(t) < 20: return False, 0, f"SR-H2: too short ({len(t)}<20)", []
    if not STANCE_WORD.search(t): return False, 0, "SR-H3: no stance word", []
    score, warns = 100, []
    if not REASON_CONNECTOR.search(t): score -= 10; warns.append("SR-S1")
    return True, max(0, score), "OK", warns

WEIGHTS = {
    "primary_risk_condition": 0.25,
    "confidence_summary":     0.20,
    "primary_bull":           0.20,
    "primary_bear":           0.20,
    "stance_rationale":       0.15,
}

def evaluate(sa, verdict=""):
    fields = {
        "primary_risk_condition": eval_prc(sa.get("primary_risk_condition")),
        "confidence_summary":     eval_cs(sa.get("confidence_summary"), verdict),
        "primary_bull":           eval_bull(sa.get("primary_bull")),
        "primary_bear":           eval_bear(sa.get("primary_bear")),
        "stance_rationale":       eval_sr(sa.get("stance_rationale")),
    }
    hard_fails, warns, ws = [], [], 0.0
    for fname, (ok, score, reason, fw) in fields.items():
        ws += score * WEIGHTS[fname]
        if not ok: hard_fails.append(f"{fname}: {reason}")
        warns.extend([f"{fname}: {w}" for w in fw])
    ws = round(ws)
    if hard_fails:          overall = "HARD_FAIL"
    elif ws < 65:           overall = "SOFT_FAIL"
    elif ws >= 85:          overall = "FULL_PASS"
    else:                   overall = "PASS"
    return overall, ws, hard_fails, warns, fields

# ── Run gate on all samples ───────────────────────────────────────────────────
results = []
for s in samples:
    overall, ws, hf, warns, fields = evaluate(s["sa"], s["verdict"])
    results.append({
        "msgId": s["msgId"],
        "overall": overall,
        "weighted_score": ws,
        "hard_fail_fields": hf,
        "warnings": warns,
        "prc_pass": fields["primary_risk_condition"][0],
    })

# ── Stats ─────────────────────────────────────────────────────────────────────
n = len(results)
hard_fail_count  = sum(1 for r in results if r["overall"] == "HARD_FAIL")
soft_fail_count  = sum(1 for r in results if r["overall"] == "SOFT_FAIL")
pass_count       = sum(1 for r in results if r["overall"] == "PASS")
full_pass_count  = sum(1 for r in results if r["overall"] == "FULL_PASS")
prc_pass_count   = sum(1 for r in results if r["prc_pass"])
avg_score        = round(sum(r["weighted_score"] for r in results) / n, 1) if n else 0

hard_fail_rate   = round(hard_fail_count / n * 100, 1) if n else 0
pass_plus_rate   = round((pass_count + full_pass_count) / n * 100, 1) if n else 0
prc_pass_rate    = round(prc_pass_count / n * 100, 1) if n else 0

# ── Gate decisions ────────────────────────────────────────────────────────────
g1 = hard_fail_rate <= 10
g2 = pass_plus_rate >= 70
g3 = prc_pass_rate  >= 85
g4 = avg_score      >= 65

# ── Print sample rows ─────────────────────────────────────────────────────────
print("\n── Sample Rows (first 10) ──")
print(f"{'msgId':>10}  {'overall':>10}  {'score':>6}  hard_fail_fields")
for r in results[:10]:
    hf = "; ".join(r["hard_fail_fields"][:2]) if r["hard_fail_fields"] else "—"
    print(f"{r['msgId']:>10}  {r['overall']:>10}  {r['weighted_score']:>6}  {hf}")

# ── Stats table ───────────────────────────────────────────────────────────────
print(f"""
── Classification Stats ──
  Total samples        : {n}
  HARD_FAIL            : {hard_fail_count}  ({hard_fail_rate}%)
  SOFT_FAIL            : {soft_fail_count}  ({round(soft_fail_count/n*100,1) if n else 0}%)
  PASS                 : {pass_count}  ({round(pass_count/n*100,1) if n else 0}%)
  FULL_PASS            : {full_pass_count}  ({round(full_pass_count/n*100,1) if n else 0}%)
  PASS+FULL_PASS       : {pass_count+full_pass_count}  ({pass_plus_rate}%)
  prc_pass             : {prc_pass_count}  ({prc_pass_rate}%)
  avg weighted_score   : {avg_score}

── Gate Results ──
  G1  HARD_FAIL ≤ 10%        : {hard_fail_rate}%  → {"PASS ✓" if g1 else "FAIL ✗"}
  G2  PASS+FULL_PASS ≥ 70%   : {pass_plus_rate}%  → {"PASS ✓" if g2 else "FAIL ✗"}
  G3  prc_pass ≥ 85%         : {prc_pass_rate}%  → {"PASS ✓" if g3 else "FAIL ✗"}
  G4  avg_score ≥ 65         : {avg_score}  → {"PASS ✓" if g4 else "FAIL ✗"}
""")

all_pass = g1 and g2 and g3 and g4
print("═" * 55)
print(f"  FINAL: {'READY for integration ✓' if all_pass else 'NOT READY ✗'}")
print("═" * 55)

# ── Failure patterns ──────────────────────────────────────────────────────────
from collections import Counter
fail_reasons = Counter()
for r in results:
    for hf in r["hard_fail_fields"]:
        key = hf.split(":")[0].strip()
        fail_reasons[key] += 1
if fail_reasons:
    print("\n── Failure Patterns ──")
    for k, v in fail_reasons.most_common():
        print(f"  {k}: {v} ({round(v/n*100,1)}%)")
