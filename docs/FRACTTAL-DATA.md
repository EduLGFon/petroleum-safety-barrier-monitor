# Fracttal dump - data reference (analyzed 2026-09-14)

> Read-only reference. Source: `test/fracttal-dump-2026-09-14-04-34-49/`
> (480 MB, 10 JSON arrays, 203k rows). Everything below comes from
> **streamed slices** - char-scanning block reads, one object at a time,
> never a full-file `json.load` - because the biggest array (work-orders)
> is 305 MB on a 5.8 GB / 1 CPU machine. All numbers are slice
> extrapolations unless marked "manifest".

## 1. Inventory (manifest + spot checks)

| File                                    | Rows (manifest) | Size   | Keys / shape                                                     |
| --------------------------------------- | --------------- | ------ | ---------------------------------------------------------------- |
| `items-1-locations.json`                | 24,617          | 36 MB  | All `FACILITIES` (item_type 1)                                   |
| `items-2-equipment.json`                | 18,272          | 30 MB  | All `EQUIPMENTS` (item_type 2), every row has a non-empty `code` |
| `items-3-tools.json`                    | 18              | 31 KB  | Tools, negligible                                                |
| `items-4-spare-parts-and-supplies.json` | 0               | 3 B    | empty `[]`                                                       |
| `items-5-digital.json`                  | 0               | 3 B    | empty `[]`                                                       |
| `work-orders.json`                      | 120,600         | 305 MB | 87 keys, newest-first, `date[gte]=2024-01-01`                    |
| `work-requests.json`                    | 38,500          | 78 MB  | 62 keys                                                          |
| `meters.json`                           | 28              | 26 KB  | compressor horimeters only                                       |
| `meters-reading.json`                   | 1,400           | 1.4 MB | reading history per horimeter                                    |

`data.zip` is the same payload zipped (470 MB unzipped); the dump dir is
already extracted, never unpack again.

## 2. Location hierarchy (from `parent_description`)

`items` parent chain is `/`-separated. Segment positions are consistent:

```
// Seacrest Petróleo / Área Norte / SÃO MATEUS - SM / ESTAÇÕES COLETORAS - SM /
   ESTAÇÃO COLETORA SÃO MATEUS - SM-8 / Sistema de Tratamento de Óleo - SM-08 / ...
       L1            L2           L3                 L4                      L5+
```

- **L1** - concession polo: `Área Norte`, `Área Centro`, `Área Sul` (physical,
  not the seed's `CNC/CNS/FAP/RJO/SPL` rows).
- **L2** - field, format `NOME - CODE` (e.g. `SÃO MATEUS - SM`, `INHAMBU - IBU`,
  `FAZENDA ALEGRE - FAL`, `FAZENDA SÃO RAFAEL - FSR`). `CODE` is the station
  slug; dozens of distinct codes exist, the seed's 6 (FAL/CNC/CNS/FAP/RJO/SPL)
  do **not** match this tenant's taxonomy.
- **L3** - installation: `ESTAÇÕES COLETORAS - SM`, `POÇOS - SM`, `CPS`,
  `MAI`, `COG` (abbreviations appear at L3 on the equipment side).
- **L4+** - system / conjunto / equipment, free text.

Station codes seen (slice top counts, sampled 5,000 items): SM 1,860 /
IBU 1,173 / RI 549 / FQ 411 / RSM 365 / RPO 239 / LS 187 / FSJ 312 /
RP 178 / FCN 278 / FC 264 / MA 158 / RPS 94 / JCT 135 / CCN 54 / CP 43 /
CAB 72 / CG 79 / BIG 34 / CD 55 / GU 40 / SEI 33 / FAL 32 / FSR 10 / other.

`groups_1_description` on both item types is the polo, not a category:
`Polo Norte Capixaba` 15,799 + 12,602 / `Polo Cricaré` 8,805 + 5,645 /
two typo variants (`Polo  Cricaré` 18). This column is the stable "area"
signal; `groups_description` is the asset type / category.

## 3. Barrier candidates (equipment census)

`items-2` full-pass logic: `code` is unique and non-empty everywhere, so it is
the join / `external_code` key. Data quality:

- `available:false` only 6 rows; `active:false` 5,332 (29%). Availability
  alone is almost always `true`; the signal comes from work orders, not this
  field.
- `priorities_description` is null / `None` on 18,267 of 18,272 equipment
  rows. Only 5 rows set: VERY_HIGH 1, HIGH 1, MEDIUM 3. Criticality is
  **unmapped** in this dump.
- `groups_1_description`: Polo Norte Capixaba 12,602 / Polo Cricare 5,645 /
  Polo Cricare 18 (whitespace typo) / None 7. This is polo (area), not
  category.
- `groups_description` / `groups_2_description`: free-text labels (Válvula 1,407
  / Transmissor 1,378 / Indicador 1,241 / Base 1,163 / Poço 1,150 /
  Extintor 466 / etc). No controlled vocab; new labels appear without
  code changes.
- `initial_date_out_of_service` present on 6 rows; `last_final_date_available`
  present on a few more. Most rows have both null.
- `location_code`: 6,044 distinct codes; top families `PNC-FAL-POCOS` 199 /
  `CRI-SM-POCOS` 94 / `PNC-IBU-POCOS` 90. Code format: `family-target-group`
  and directly joinable to work orders.

### Safety barrier keyword filter (groups_description only)

Count of equipment whose `groups_description` taxonomy label hits the
keyword list (full pass, 18,272 rows): **3,523 rows** (~19%).

The filter runs on `groups_description` only (the asset-type taxonomy).
Free-text `description` is NOT matched: it pulls in non-barrier types
(e.g. a gas pump whose description mentions "gás") and produces a noisy
category taxonomy. Every keyword hit is imported as a barrier - the
catalog is data-driven.

Top groups with hits:

| groups_description           | count |
| ---------------------------- | ----- |
| Válvula                      | 1,407 |
| Extintor                     | 466   |
| Equipamento - Emergência     | 289   |
| Válvulas                     | 231   |
| Detector de Gás              | 176   |
| Válvula XV                   | 137   |
| Tampa - Alívio de Emergência | 96    |
| Detector                     | 88    |
| Hidrante                     | 81    |
| Válvula de Emergência        | 65    |
| Válvula Corta Chamas         | 45    |
| Válvula Emergência           | 36    |
| Válvula de Segurança         | 35    |
| Válvulas segurança           | 34    |
| Extintor de incêndio         | 28    |
| Válvula Bloqueio             | 24    |
| Miscelânea Segurança         | 29    |
| Válvula Corta-chamas         | 29    |

Full keyword list used (case-insensitive): valvula, extintor, detec, alarme,
sirene, incendio, bloqueio, intertravamento, seguran, emerg, PSV, alivio,
hidrante, gas, fumaca, H2S, corta-chamas.

Locations with safety keywords: only 2 rows (`Válvula Segurança` and
`Válvula de Segurança` groups), negligible. Location items are hierarchy
nodes, not barriers.

### Recommendation (Step 2 output)

Barrier scope = equipment filtered by `groups_description` keyword match
(3,523 candidates, ~19% of equipment). Location items stay hierarchy.

## 4. Work orders (status signal source)

120,600 rows (manifest), `date[gte]=2024-01-01`, newest-first.
Two 60k slices analyzed; date range in first 60k rows: 2026-09-11 to
2026-09-12 only (tail contains 2024-2025).

### Key status fields (30k row sample, proportionally stable)

| Field                           | Value                        | Count  | App meaning                          |
| ------------------------------- | ---------------------------- | ------ | ------------------------------------ |
| `tasks_log_types_description`   | PREV - Sistemática           | 22,500 | preventive, no status impact         |
|                                 | CORR - Corretiva Planejada   | 3,600  | **Degradada**                        |
|                                 | APOP - Apoio Operacional     | 2,100  | operational support                  |
|                                 | CORR - Corretiva Emergencial | 1,500  | **Indisponível**                     |
|                                 | PREV - Calibração            | 300    | preventive                           |
| `tasks_log_types_2_description` | Operação                     | 15,600 | sub-type                             |
|                                 | Elétrica                     | 7,500  |                                      |
|                                 | Mecânica                     | 2,700  |                                      |
|                                 | Caldeiraria                  | 1,500  |                                      |
|                                 | Instrumentação               | 1,200  |                                      |
|                                 | Medição de Fluidos           | 900    |                                      |
| `tasks_log_task_type_main`      | Integridade de Poços         | 15,600 | well integrity                       |
|                                 | Manutenção                   | 10,800 | maintenance                          |
|                                 | Sondas                       | 2,700  | rigs                                 |
|                                 | Medição de Fluídos           | 900    | fluid measurement                    |
| `task_status`                   | NO_STARTED                   | 27,900 | not yet started                      |
|                                 | DONE                         | 2,100  | completed                            |
| `done`                          | false                        | 27,900 |                                      |
|                                 | true                         | 2,100  |                                      |
| `id_status_work_order`          | 1                            | 28,800 | open                                 |
|                                 | 4                            | 1,200  | closed (subset)                      |
| `stop_assets`                   | false                        | 22,800 |                                      |
|                                 | true                         | 7,200  | 24% - **Fora de Operação** candidate |
| `types_description`             | None                         | 14,250 | null                                 |
|                                 | Falha Potencial              | 750    | matches "Corretiva Planejada"        |
| `causes_description`            | None                         | 14,250 |                                      |
|                                 | Desbalanceamento             | 450    |                                      |
|                                 | Contaminação                 | 150    |                                      |
| `severiry_description`          | None                         | 14,700 |                                      |
|                                 | HIGH                         | 300    |                                      |
| `damages_types_description`     | None                         | 14,250 |                                      |
|                                 | NEITHER                      | 750    |                                      |
| `id_items_availability`         | None                         | 30,000 | **dead field**, always null          |
| `trigger_description`           | NO_SCHEDULE_TASK             | 7,200  | ad-hoc work order                    |
|                                 | DATE$EVERY$6$MONTHS          | 18,300 | scheduled 6-month                    |
|                                 | DATE$EVERY$1$YEARS           | 3,900  | scheduled yearly                     |
|                                 | DATE$EVERY$365$DAYS          | 300    | same as yearly                       |
|                                 | DATE$EVERY$3$MONTHS          | 300    | scheduled quarterly                  |

### Date fields available (per work order task)

`creation_date`, `date_maintenance`, `event_date`, `initial_date`,
`final_date`, `wo_final_date`, `first_date_task`, `cal_date_maintenance`.

`final_date` and `initial_date` are null on ~93% of rows (started but
planned tasks); `wo_final_date` exists on completed WOs.

### Summary status derivation rule

Open corrective WO on an asset:

- `tasks_log_types_description` contains `Corretiva Planejada` or
  `types_description = Falha Potencial` -> **Degradada**
- `tasks_log_types_description` contains `Corretiva Emergencial` ->
  **Indisponível**
- `stop_assets = true` or `initial_date_out_of_service` set ->
  **Fora de Operação**
- No open corrective WO, not out of service -> **Disponível**

## 5. Work requests (supplementary signal)

38,500 rows, 62 keys. 20k slice:

| Field                     | Value                        | Count  | App meaning         |
| ------------------------- | ---------------------------- | ------ | ------------------- |
| `types_2_description`     | CORR - Planejada             | 6,600  | same signal as WO   |
|                           | CORR - Emergencial           | 1,200  | same signal as WO   |
|                           | PROA - Melhoria/Adequação    | 400    | improvement         |
|                           | APOP - Apoio Operacional     | 400    | operational support |
|                           | PREV - Sistemática           | 400    | preventive          |
| `id_status` / description | 6 / SOLVED_WITH_OT_STATUS    | 14,400 | solved via WO       |
|                           | 5 / CANCEL_STATUS            | 3,200  | cancelled           |
|                           | 4 / SOLVED_WITHOUT_OT_STATUS | 1,800  | solved without WO   |
|                           | 12 / REJECTED                | 600    | rejected            |
| `is_urgent`               | true                         | 5,800  | 29% urgent          |
| `types_description`       | Mecânica                     | 4,400  |                     |
|                           | Elétrica                     | 3,600  |                     |
|                           | Calderaria                   | 3,000  |                     |
|                           | Serviços Gerais              | 2,400  |                     |
| `priorities_description`  | None                         | 20,000 | **all null**        |

### Date fields (per work request)

`date` (creation), `date_incident`, `date_maintenance`, `date_solution`,
`date_status`.

WRs with status `SOLVED_WITH_OT_STATUS` link to WOs and carry the same
corrective signal. Cancelled/rejected WRs should be ignored in status
derivation.

## 6. Join keys

Work orders / requests do not share numeric `id` values with items. The join
key is the **text code**:

| Source field              | Target                    | Match rate (10k slice) |
| ------------------------- | ------------------------- | ---------------------- |
| `work_orders.code`        | `equipment.code`          | 31%                    |
| `work_orders.code`        | `locations.location_code` | 66%                    |
| `work_orders.code`        | neither                   | 3%                     |
| `work_requests.code_item` | `equipment.code`          | 35%                    |
| `work_requests.code_item` | `locations.location_code` | 43%                    |
| `work_requests.code_item` | neither                   | 22%                    |

Most WOs that match `locations.location_code` instead of equipment codes
are **station-level interventions** (e.g. `PNC-EC-FSR`, `ME-RI-11`).
These set context (station under intervention) but do not individually
change a specific barrier's status.

A small subset (~3%) are custom instrumentation tags (`FIT-365601A2`,
`FQI-CV-6250-001`) not present in either item list.

## 7. Contingency signal (GM / CEC)

STATUSES.md defines Degradada Contingenciada and Indisponível Contingenciada
via GM or CEC contingency. A regex hunt for `contingen`, `GM`, `CEC`,
`provid[eencia]`, `mitiga` across 15,000 WOs returned **zero explicit hits**
in the sampled data. Contingency is not represented in these fields:

- `tasks_log_types_description` (CORR/PREV only)
- `tasks_log_types_2_description` (trade sub-types only)
- `description`, `task_note`, `notes`
- `groups_*` fields

Contingency events may live in:

- `labels` array (was empty on all sampled rows but present as schema)
- `work_orders_status_custom_description` (null on all sampled rows)
- Records created after the dump date
- A different Fracttal module not captured in this dump

**Status**: unmapped for import. Always list, never guess.

## 8. Meters (not a status signal)

28 compressor horimeters (one active=False at FSL), all from Seacrest
Petroleo stations. Meters do not carry availability or compliance signals
but provide running-hour context for equipment use patterns.

Stations with horimeters: SM-8 (compressor A/B, battery), IBU-26
(compressor 05/06), FAL (compressors A/B/C), FSR (compressors A/B/F),
FSL (compressors A/B + emergency), CNC (compressors 01/02), UGVM-01/02/03
(mobile units), IBU-10 (compressor 10).

## 9. `id_items_availability` (dead field)

Always null in work orders (30k sampled). The field exists but carries no
signal. Do not use for status derivation.

## 10. Maturity summary for status derivation

| Signal                      | Source                                                         | Ready?                        |
| --------------------------- | -------------------------------------------------------------- | ----------------------------- |
| Degradada                   | `tasks_log_types_description` = `CORR - Corretiva Planejada`   | yes                           |
| Indisponível                | `tasks_log_types_description` = `CORR - Corretiva Emergencial` | yes                           |
| Fora de Operação            | `stop_assets = true` or `initial_date_out_of_service` on item  | yes                           |
| Disponível                  | default (no open corrective WO, not out of service)            | yes                           |
| Degradada Contingenciada    | GM / CEC in labels or custom status                            | **no** - not in dump          |
| Indisponível Contingenciada | GM / CEC in labels or custom status                            | **no** - not in dump          |
| Criticality                 | `priorities_description` on equipment                          | **no** - 18,267 null / 5 rows |
| Category                    | `groups_description` on equipment                              | available, ~200 unique labels |
| Polo / Area                 | `groups_1_description` on equipment                            | available, 2 polo families    |

## 11. Seed replacement decision (done)

The import script `scripts/fracttal-import.ts` now replaces the synthetic
locations/categories with real data. It streams the 480 MB dump (no
in-memory load), truncates `locations`, `categories`, and `barriers`,
and rebuilds from the dump in ~37 seconds.

Actual imported catalog from `test/fracttal-dump-2026-09-14-04-34-49/`:

- **barriers**: 3,523 (every `groups_description` keyword hit)
- **locations**: 36 stations (codes extracted from L2 segment of
  `parent_description`, ids 1-36 sorted by code, type derived)
- **categories**: 67 labels (from distinct `groups_description` in the
  barrier subset, ids 0-66 sorted alphabetically)
- **availability_statuses**: unchanged, matches `docs/STATUSES.md`
- **criticality_levels**: unchanged, `Não Crítica` default until upstream
  signal is populated

The old fake 6-location/10-category seed rows in `db/seed_lookups.sql`
have been replaced with the real 36/67 rows so the seed task remains
approximate but close to reality. The id contract in
`lib/enums.ts` is now only used for the static lookup tables
(availability, compliance, groupings, typologies, owners, loc_descs,
authors). Locations and categories are fully dynamic: the server
serves id-bearing vocabularies and the UI never depends on a static
id mapping for them.

## 12. Import run results

**Run command:**

```
deno run -A --env-file=.env scripts/fracttal-import.ts \
  --dir test/fracttal-dump-2026-09-14-04-34-49 --apply
```

| Pass | Input                   | Scanned | Matched | Notes                       |
| ---- | ----------------------- | ------- | ------- | --------------------------- |
| A    | `items-2-equipment.json` | 18,272  | 3,523   | `groups_description` only   |
| B    | `work-orders.json`       | 120,600 | 1,206   | all `CORR - Corretiva Planejada` |
| C    | `work-requests.json`     | 38,500  | 0       | all in closed statuses      |

**Derived availability:** Disponível 3,522 / Degradado 1.
The single degraded barrier (`SSV-BRA01-001`, code `1013959`) carries a
real WO comment in its `actionPlan` field ("Sanar falha de atuação da
SSV") and a `statusSince` of `2026-09-11`.

**Station breakdown (top 5):** FAL 1,282 / SM 461 / IBU 262 / FSR 252 /
CNC 200 (36 total stations).

**Category breakdown (top 5):** Válvula 381 at FAL / Equipamento -
Emergência 245 at FAL / Válvulas 125 at FAL / Extintor 115 at FAL /
Detector de Gás 107 at FAL (67 total categories across all stations).
