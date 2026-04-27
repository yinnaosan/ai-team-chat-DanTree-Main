# Track B Verification Artifacts

These scripts are **historical Track B verification artifacts**.

They are **not production tests**.

They should **not** be treated as a canonical regression suite.

Closure status is recorded separately in **Track B Closure Regression Pack V1** (`DanTree_TrackB_Closure_Regression_Pack_V1.md`).

Latest closure HEAD before cleanup: `53df43e89346f80df8568025e5ba4b11cc066df3`

---

## File Index

| File | Move | Purpose |
|------|------|---------|
| test_audit_event.ts | Move 1.5 / Downstream | Audit event chain verification |
| test_batch_debug.ts | Move 1.5 | Batch evaluation debug |
| test_drybatch_impl.ts | Move 1 | Dry-run batch implementation test |
| test_move2_double_run.ts | Move 2 | RUN1+RUN2 double-run delta logic |
| test_move2_run3_restart.ts | Move 2 | RUN3 post-restart cache reset |
| test_move25_run1_run2.ts | Move 2.5 | DB write-back and read-back |
| test_move25_run3_restart.ts | Move 2.5 | DB persistence across process restart |
| test_move3_snapshot_verify.ts | Move 3 | Snapshot field verification with price data |
| test_move3_runbatch.ts | Move 3 | Real runBatch with price_break analysis |
| test_runbatch_b1r2.ts | Downstream | B1R2 downstream reliability run |
| test_runbatch_debug.ts | Downstream | runBatch debug |
| test_runbatch_real.ts | Move 1.5 | Real runBatch verification |
| test_single_eval.ts | Move 1.5 | Single watch evaluation test |

---

## Notes

- These scripts may have import path issues if run from this directory (they were written for root-level execution).
- Do not run these scripts as part of CI or automated testing.
- They are preserved here for historical traceability only.
- Cleanup performed: 2026-04-27, task TRACK_B_HOUSEKEEPING_TEST_ARTIFACT_CLEANUP_V1.
