# scripts/fixtures - Fracttal replay fixtures (P2 safe-harbor)

Replays, never prod: every sync/alert test and dry-run reads these files.
A reviewed prod capture (docs/FRACTTAL.md "Capture procedure") replaces the
sample below; until then the synthetic rows stand in. Rows are live-shaped:
category in `groups_description`, polo in `groups_1_description` (ignored),
and FAL-EQ-001 carries a parent chain (primary station path) while the rest
resolve via `location_code` (fallback path).

## fracttal-assets-sample.json (synthetic, `meta.synthetic: true`)

5 rows in capture format, each exercising one sync path:

| code             | path exercised                                         |
| ---------------- | ------------------------------------------------------ |
| `FAL-EQ-001`     | match + insert (`Crítica`, known category)             |
| `FAL-EQ-002`     | status change (out-of-service date → Fora de Operação) |
| `FAL_EQ_003`     | deletion candidate (sync retires it when absent)       |
| `FAL-EQ-004`     | **skip**: outside the barrier scope (`'Typo Isolada'`) |
| `X9-UNKNOWN-LOC` | **skip**: unknown location `'ZZZ'`                     |

## fracttal-work-sample.json (synthetic, `meta.synthetic: true`)

Work rows in live `/work_orders` + `/work_requests` shape for the status
pass (`--work-fixture`, also replayed by `work_test.ts`):

| row                               | signal exercised                            |
| --------------------------------- | ------------------------------------------- |
| open `CORR - Corretiva Planejada` | planned event → `FAL-EQ-001` maps Degradada |
| done corrective order             | ignored (closed gate)                       |
| solved request (`id_status` 4)    | ignored (closed gate)                       |

Unmapped values live here (the two skip rows above) and are also listed in
each `--apply`/dry-run report - ids needing new enum rows derive from that
list, never guessed. Labels use the seed vocabulary (`'Crítica'` /
`'Não Crítica'`); `'Crítico'`-style variants stay skips by design.
