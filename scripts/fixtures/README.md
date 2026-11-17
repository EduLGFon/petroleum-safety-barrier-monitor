# scripts/fixtures - Fracttal replay fixtures

Synthetic replays for sync tests, dry runs and local development; never
production data. Both files carry `meta.synthetic: true`. A reviewed
production capture replaces the asset sample; see the
[capture procedure](../../docs/FRACTTAL.md#capture). Rows are live-shaped:
category in `groups_description`, polo in `groups_1_description` (ignored).
`FAL-EQ-001` carries a parent chain (primary station path); the other rows
resolve through `location_code` (fallback path).

## fracttal-assets-sample.json (synthetic, `meta.synthetic: true`)

5 rows, one sync path each:

| code             | path exercised                                                |
| ---------------- | ------------------------------------------------------------- |
| `FAL-EQ-001`     | match and insert (known category, parent-chain station)       |
| `FAL-EQ-002`     | status change (out-of-service date maps Fora de Operação)     |
| `FAL_EQ_003`     | deletion candidate (retired when absent upstream)             |
| `FAL-EQ-004`     | skip: category `Typo Isolada` absent from the fixture context |
| `X9-UNKNOWN-LOC` | skip: unknown station `ZZZ`                                   |

`FAL-EQ-002` also has `available: false`, but the explicit out-of-service date
outranks the bare flag, so the row maps to Fora de Operação. The typo and
unknown-station rows document deliberate skip reporting.

## fracttal-work-sample.json (synthetic, `meta.synthetic: true`)

Work rows in live `/work_orders` and `/work_requests` shape for the status
pass (`--work-fixture`, replayed by `work_test.ts`). The sample contains two
orders and one request:

| row                                                      | signal exercised                                    |
| -------------------------------------------------------- | --------------------------------------------------- |
| open `CORR - Corretiva Planejada` order (no `is_urgent`) | planned event without urgent flag: no status signal |
| done corrective order                                    | ignored (closed gate)                               |
| solved request (`id_status` 4)                           | ignored (closed gate)                               |

The fixture deliberately has no `is_urgent` row. A planned corrective only
changes availability when the urgent flag is present; without it the barrier
stays Disponível. The urgent planned branch is covered by inline rows in
`work_test.ts`, not by this sample. Do not describe this file as containing an
urgent request.

Unmapped labels in an applying or dry run are listed in the report, never
guessed. The two asset skips reflect the headless fixture `MapContext`; the
live sync creates missing location and category rows before mapping. Never
commit live tenant output or personal data.
