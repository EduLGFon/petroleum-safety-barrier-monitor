# scripts/fixtures - Fracttal replay fixtures (P2 safe-harbor)

Replays, never prod: every sync/alert test and dry-run reads these files.
A reviewed prod capture (docs/FRACTTAL.md "Capture procedure") replaces the
sample below; until then the synthetic rows stand in.

## fracttal-assets-sample.json (synthetic, `meta.synthetic: true`)

5 rows in capture format, each exercising one sync path:

| code             | path exercised                                    |
| ---------------- | ------------------------------------------------- |
| `FAL-EQ-001`     | match + insert (`Crítica`, known category)        |
| `FAL-EQ-002`     | status change (`available: false` → Indisponível) |
| `FAL_EQ_003`     | deletion candidate (sync retires it when absent)  |
| `FAL-EQ-004`     | **skip**: unmapped category `'Typo Isolada'`      |
| `X9-UNKNOWN-LOC` | **skip**: unknown location `'ZZZ'`                |

Unmapped values live here (the two skip rows above) and are also listed in
each `--apply`/dry-run report - ids needing new enum rows derive from that
list, never guessed. Labels use the seed vocabulary (`'Crítica'` /
`'Não Crítica'`); `'Crítico'`-style variants stay skips by design.
