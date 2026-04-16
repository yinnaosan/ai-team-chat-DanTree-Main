"""
Phase 4C Stage 4 — Quality Gate
Compares structured_analysis fields vs answerObject fields
Classification: EXACT / NEAR / PARTIAL / MATERIALLY DIFFERENT
Gates: G1 NEAR+EXACT >= 85%, G2 MATERIALLY DIFFERENT <= 10%, G3 no systematic bias
"""
import os, json, re
from urllib.parse import urlparse
import pymysql

url = urlparse(os.environ['DATABASE_URL'])
conn = pymysql.connect(
    host=url.hostname, port=url.port or 3306,
    user=url.username, password=url.password,
    database=url.path.lstrip('/'), ssl={'ssl': {}},
    connect_timeout=10
)
cur = conn.cursor()

# Fetch 32 post-6c3835d messages with structured_analysis
cur.execute("""
  SELECT
    m.id,
    m.conversationId,
    JSON_EXTRACT(m.metadata, '$.structured_analysis') AS sa,
    JSON_EXTRACT(m.metadata, '$.answerObject') AS ao
  FROM messages m
  WHERE m.role = 'assistant'
    AND m.id > 1500168
    AND JSON_EXTRACT(m.metadata, '$.structured_analysis') IS NOT NULL
    AND JSON_EXTRACT(m.metadata, '$.answerObject') IS NOT NULL
  ORDER BY m.id ASC
  LIMIT 35
""")
rows = cur.fetchall()
conn.close()

print(f"[Stage 4 Quality Gate] Analyzing {len(rows)} messages\n")

def normalize(text):
    """Normalize text for comparison: lowercase, strip punctuation, collapse whitespace"""
    if not text:
        return ""
    t = text.lower().strip()
    t = re.sub(r'[，。！？、；：""''【】（）《》\s]+', ' ', t)
    return t.strip()

def similarity_ratio(a, b):
    """Simple character-level overlap ratio"""
    if not a or not b:
        return 0.0
    a_set = set(a)
    b_set = set(b)
    intersection = len(a_set & b_set)
    union = len(a_set | b_set)
    return intersection / union if union > 0 else 0.0

def classify(sa_val, ao_val):
    """
    EXACT: identical after normalization
    NEAR: >70% char overlap OR one is substring of other (>60%)
    PARTIAL: 40-70% overlap OR same topic/direction
    MATERIALLY DIFFERENT: <40% overlap AND different direction/topic
    """
    if not sa_val or not ao_val:
        return "MISSING"
    
    sa_n = normalize(sa_val)
    ao_n = normalize(ao_val)
    
    if sa_n == ao_n:
        return "EXACT"
    
    ratio = similarity_ratio(sa_n, ao_n)
    
    # Check if one is a substring of the other
    shorter = sa_n if len(sa_n) < len(ao_n) else ao_n
    longer = ao_n if len(sa_n) < len(ao_n) else sa_n
    substr_ratio = len(shorter) / len(longer) if longer else 0
    is_substring = shorter in longer
    
    if ratio > 0.70 or (is_substring and substr_ratio > 0.60):
        return "NEAR"
    elif ratio > 0.40:
        return "PARTIAL"
    else:
        return "MATERIALLY DIFFERENT"

# Comparison pairs
PAIRS = [
    ("primary_bull",           "bull_case",   0,   "primary_bull vs bull_case[0]"),
    ("primary_bear",           "bear_case",   0,   "primary_bear vs bear_case[0]"),
    ("primary_risk_condition", "risks",       0,   "primary_risk_condition vs risks[0].description"),
    ("confidence_summary",     "reasoning",   0,   "confidence_summary vs reasoning[0]"),
]

# Results storage
all_results = []
pair_stats = {p[3]: {"EXACT": 0, "NEAR": 0, "PARTIAL": 0, "MATERIALLY DIFFERENT": 0, "MISSING": 0} for p in PAIRS}

print("=" * 80)
print(f"{'msgId':<10} {'pair':<45} {'class':<22} {'sa_len':>6} {'ao_len':>6}")
print("=" * 80)

for row in rows:
    msg_id, conv_id, sa_raw, ao_raw = row
    try:
        sa = json.loads(sa_raw)
        ao = json.loads(ao_raw)
    except Exception as e:
        print(f"  PARSE ERROR msgId={msg_id}: {e}")
        continue
    
    row_results = {"msgId": msg_id, "convId": conv_id, "pairs": {}}
    
    for sa_key, ao_key, ao_idx, label in PAIRS:
        sa_val = sa.get(sa_key, "")
        
        # Extract ao value
        if ao_key == "risks":
            ao_list = ao.get("risks", [])
            if ao_list and isinstance(ao_list[0], dict):
                ao_val = ao_list[0].get("description", "")
            elif ao_list and isinstance(ao_list[0], str):
                ao_val = ao_list[0]
            else:
                ao_val = ""
        else:
            ao_list = ao.get(ao_key, [])
            if isinstance(ao_list, list) and len(ao_list) > ao_idx:
                ao_val = ao_list[ao_idx]
            elif isinstance(ao_list, str):
                ao_val = ao_list
            else:
                ao_val = ""
        
        classification = classify(sa_val, ao_val)
        pair_stats[label][classification] += 1
        row_results["pairs"][label] = {
            "class": classification,
            "sa_len": len(sa_val),
            "ao_len": len(ao_val),
            "sa_preview": sa_val[:50],
            "ao_preview": ao_val[:50],
        }
        
        print(f"  {msg_id:<8} {label:<45} {classification:<22} {len(sa_val):>6} {len(ao_val):>6}")
    
    all_results.append(row_results)
    print()

# ─── Summary Statistics ───────────────────────────────────────────────────────
print("\n" + "=" * 80)
print("  CLASSIFICATION SUMMARY BY PAIR")
print("=" * 80)

total_comparisons = len(rows) * len(PAIRS)
grand_exact = grand_near = grand_partial = grand_md = grand_missing = 0

for label, stats in pair_stats.items():
    total = sum(stats.values())
    near_exact = stats["EXACT"] + stats["NEAR"]
    pct_ne = near_exact / total * 100 if total else 0
    pct_md = stats["MATERIALLY DIFFERENT"] / total * 100 if total else 0
    print(f"\n  {label}")
    print(f"    EXACT={stats['EXACT']}  NEAR={stats['NEAR']}  PARTIAL={stats['PARTIAL']}  MAT_DIFF={stats['MATERIALLY DIFFERENT']}  MISSING={stats['MISSING']}")
    print(f"    NEAR+EXACT={near_exact}/{total} ({pct_ne:.1f}%)  MAT_DIFF={stats['MATERIALLY DIFFERENT']}/{total} ({pct_md:.1f}%)")
    grand_exact += stats["EXACT"]
    grand_near += stats["NEAR"]
    grand_partial += stats["PARTIAL"]
    grand_md += stats["MATERIALLY DIFFERENT"]
    grand_missing += stats["MISSING"]

grand_ne = grand_exact + grand_near
pct_ne_total = grand_ne / total_comparisons * 100 if total_comparisons else 0
pct_md_total = grand_md / total_comparisons * 100 if total_comparisons else 0

print(f"\n{'─'*80}")
print(f"  GRAND TOTAL ({total_comparisons} comparisons across {len(rows)} messages × {len(PAIRS)} pairs)")
print(f"  EXACT={grand_exact}  NEAR={grand_near}  PARTIAL={grand_partial}  MAT_DIFF={grand_md}  MISSING={grand_missing}")
print(f"  NEAR+EXACT = {grand_ne}/{total_comparisons} = {pct_ne_total:.1f}%")
print(f"  MAT_DIFF   = {grand_md}/{total_comparisons} = {pct_md_total:.1f}%")

# ─── Systematic Bias Check (G3) ───────────────────────────────────────────────
print(f"\n{'─'*80}")
print("  G3 SYSTEMATIC BIAS CHECK")
print(f"{'─'*80}")

sa_lengths = []
ao_lengths = []
for r in all_results:
    for label, d in r["pairs"].items():
        if d["sa_len"] > 0 and d["ao_len"] > 0:
            sa_lengths.append(d["sa_len"])
            ao_lengths.append(d["ao_len"])

if sa_lengths and ao_lengths:
    avg_sa = sum(sa_lengths) / len(sa_lengths)
    avg_ao = sum(ao_lengths) / len(ao_lengths)
    length_ratio = avg_sa / avg_ao if avg_ao else 0
    print(f"  avg SA length: {avg_sa:.0f} chars")
    print(f"  avg AO length: {avg_ao:.0f} chars")
    print(f"  SA/AO ratio:   {length_ratio:.2f}  (1.0 = no length bias)")
    
    if 0.7 <= length_ratio <= 1.4:
        g3_bias = "PASS ✓ — no systematic length bias"
    elif length_ratio < 0.5:
        g3_bias = "WARN — SA consistently shorter (possible truncation)"
    elif length_ratio > 2.0:
        g3_bias = "WARN — SA consistently longer (possible hallucination)"
    else:
        g3_bias = "PASS ✓ — mild length difference, within tolerance"
else:
    g3_bias = "SKIP — insufficient data"

print(f"  Bias verdict: {g3_bias}")

# ─── Gate Results ─────────────────────────────────────────────────────────────
print(f"\n{'='*80}")
print("  Phase 4C Stage 4 — GATE RESULTS")
print(f"{'='*80}")

G1 = pct_ne_total >= 85.0
G2 = pct_md_total <= 10.0
G3 = "PASS" in g3_bias

print(f"  G1  NEAR+EXACT >= 85%:              {pct_ne_total:.1f}%  →  {'PASS ✓' if G1 else 'FAIL ✗'}")
print(f"  G2  MATERIALLY DIFFERENT <= 10%:    {pct_md_total:.1f}%  →  {'PASS ✓' if G2 else 'FAIL ✗'}")
print(f"  G3  No systematic bias:             {g3_bias[:40]}  →  {'PASS ✓' if G3 else 'FAIL ✗'}")

FINAL = G1 and G2 and G3
print(f"\n  FINAL: {'READY for integration ✓' if FINAL else 'NOT READY ✗'}")
print(f"{'='*80}\n")
