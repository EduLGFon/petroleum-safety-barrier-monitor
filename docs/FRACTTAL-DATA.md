# Fracttal dump data reference

Source dump lives under `test/` (git-ignored). Committed fixtures are in `scripts/fixtures/`.

## Inventory

| File              | Rows    | Notes                             |
| ----------------- | ------- | --------------------------------- |
| items locations   | 24,617  | all facilities                    |
| items equipment   | 18,272  | all equipment, every row has code |
| items tools       | 18      | negligible                        |
| items spare parts | 0       | empty                             |
| items digital     | 0       | empty                             |
| work orders       | 120,600 | newest-first                      |
| work requests     | 38,500  |                                   |
| meters            | 28      | compressor horimeters             |
| meters readings   | 1,400   |                                   |

## Hierarchy

`items` parent chain is slash-separated: L1 polo, L2 area, L3 station, L4 system, L5+ asset. Station codes are parsed from the L3 segment's trailing " - CODE" token. Two operator stations sit below L3: SM8 is the "ESTAÇÃO COLETORA SÃO MATEUS - SM-8" facility under SÃO MATEUS - SM, and CO is the 3-CO-N-ES well cluster under JACUTINGA - JCT (the CO-03 transformer under 7-JCT-5-ES stays under JCT). The L2 concession areas are Area Norte/Centro/Sul; these are physical, not the seed location rows.

## Imported catalog (full equipment scope)

- Barriers: 18,271 equipment rows (one documented transmitter mislabel excluded).
- Locations: 41 stations (39 L3-derived codes plus the SM8 and CO aliases). The two upstream facilities sharing the L3 segment `Cj Unidade de Teste Móvel` split into CJ-UTM-N (Área Norte, 46 equipment rows; the old `CJ UNIDADE DE TESTE MÓVEL` location row is renamed in place by db/schema.sql) and CJ-UTM-C (Área Centro, 5 equipment rows); run `deno task db:migrate` before the next sync (DECISIONS.md#D28).
- Categories: 528 labels.
- Criticality: ESO > A > B > C > D, derived from TAG suffix plus ESO flag.
- Availability counts after import: Disponivel 3,521; Degradado 1.

Import command: `deno run -A --env-file=.env scripts/fracttal-import.ts --dir <dump> --apply`. Replaces locations, categories and barriers. Stream the dump; do not load it fully into memory.
