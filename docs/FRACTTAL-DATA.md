# Fracttal dump - data reference (analyzed 2026-09-14)

> Read-only reference. Source: `test/fracttal-dump-2026-09-14-04-34-49/` (480 MB, 10 JSON arrays, 203k rows). Streamed slices only (char-scanning block reads), never full-file `json.load`; biggest array (work-orders) is 305 MB on a 5.8 GB / 1 CPU machine. Numbers are slice extrapolations unless marked "manifest".

## 1. Inventory (manifest + spot checks)

| File | Rows (manifest) | Size | Keys / shape |
| `items-1-locations.json` | 24,617 | 36 MB | All `FACILITIES` (item_type 1) |
| `items-2-equipment.json` | 18,272 | 30 MB | All `EQUIPMENTS` (item_type 2), every row has a non-empty `code` |
| `items-3-tools.json` | 18 | 31 KB | Tools, negligible |
| `items-4-spare-parts-and-supplies.json` | 0 | 3 B | empty `[]` |
| `items-5-digital.json` | 0 | 3 B | empty `[]` |
| `work-orders.json` | 120,600 | 305 MB | 87 keys, newest-first, `date[gte]=2024-01-01` |
| `work-requests.json` | 38,500 | 78 MB | 62 keys |
| `meters.json` | 28 | 26 KB | compressor horimeters only |
| `meters-reading.json` | 1,400 | 1.4 MB | reading history per horimeter |

`data.zip` is the same payload zipped (470 MB unzipped); the dump dir is already extracted, never unpack again.

## 2. Location hierarchy (from `parent_description`)

`items` parent chain is `/`-separated. Segment positions consistent:

```
// Seacrest Petroleo / Area Norte / SAO MATEUS - SM / ESTACOES COLETORAS - SM /
   ESTACAO COLETORA SAO MATEUS - SM-8 / Sistema de Tratamento de Oleo - SM-08 / ...
       L1            L2           L3                 L4                      L5+
```

- L1 - concession polo: `Area Norte`, `Area Centro`, `Area Sul` (physical, not the seed's `CNC/CNS/FAP/RJO/SPL` rows).
- L2 - field, format `NOME - CODE` (e.g. `SAO MATEUS - SM`, `INHAMBU - IBU`, `FAZENDA ALEGRE - FAL`, `FAZENDA SAO RAFAEL - FSR`). `CODE` is the station slug; dozens of distinct codes exist, the seed's 6 do not match this tenant's taxonomy.
- L3 - installation: `ESTACOES COLETORAS - SM`, `POCOS - SM`, `CPS`, `MAI`, `COG`.
- L4+ - system / conjunto / equipment, free text.

Station codes seen (sampled 5,000 items): SM 1,860 / IBU 1,173 / RI 549 / FQ 411 / RSM 365 / RPO 239 / LS 187 / FSJ 312 / RP 178 / FCN 278 / FC 264 / MA 158 / RPS 94 / JCT 135 / CCN 54 / CP 43 / CAB 72 / CG 79 / BIG 34 / CD 55 / GU 40 / SEI 33 / FAL 32 / FSR 10 / other.

`groups_1_description` on both item types is the polo, not a category: `Polo Norte Capixaba` 15,799 + 12,602 / `Polo Cricare` 8,805 + 5,645 / two typo variants (`Polo  Cricare` 18). This column is the stable "area" signal; `groups_description` is the asset type / category.

## 3. Barrier candidates (equipment census)

`items-2` full-pass logic: `code` is unique and non-empty everywhere, so it is the join / `external_code` key. Data quality: `available:false` only 6 rows; `active:false` 5,332 (29%). Availability alone is almost always `true`; the signal comes from work orders, not this field. `priorities_description` is null / `None` on 18,267 of 18,272 equipment rows; only 5 rows set (VERY_HIGH 1, HIGH 1, MEDIUM 3). Criticality does not come from this field: it derives from the TAG suffix letter (`... { code } A/B/C/D`, 100% match in this dump) with the `groups_2_description = 'ESO'` flag outranking to ESO. `groups_description` / `groups_2_description`: free-text labels (Valvula 1,407 / Transmissor 1,378 / Indicador 1,241 / Base 1,163 / Poco 1,150 / Extintor 466 / etc). No controlled vocab; new labels appear without code changes. `initial_date_out_of_service` present on 6 rows; `last_final_date_available` present on a few more. Most rows have both null. `location_code`: 6,044 distinct codes; top families `PNC-FAL-POCOS` 199 / `CRI-SM-POCOS` 94 / `PNC-IBU-POCOS` 90. Code format: `family-target-group`, directly joinable to work orders.

Safety barrier scope (all equipment): every `item_type = 2` row enters the monitor (minus the documented exclusion); admitting gates ride per row in `scope_source` (`keyword` / `eso` / `keyword+eso` / `all`), so scope stays reversible. Dashboard opens on every rank and offers a one-tap `criticalOnly` gate (ESO/A) in the Criticidade filter. GERAL manual-barrier coverage measured by `scripts/geral-coverage.ts`: 49.8% (keyword scope) -> 89.8% (ESO-OR-keyword) -> 94.5% (all equipment; the 123 residual codes exist neither in the dump nor live).

Count of equipment whose `groups_description` taxonomy label hits the keyword list (full pass, 18,272 rows): 3,523 rows (~19%). The keyword list is kept only as scope provenance, not as a gate: every row enters (the one-time exclusion that used to sit here was removed; the monitor mirrors upstream 1:1 and mislabels are fixed in Fracttal). The filter runs on `groups_description` only (the asset-type taxonomy). Free-text `description` is NOT matched: it pulls in non-barrier types (e.g. a gas pump whose description mentions "gas") and produces a noisy category taxonomy. Every keyword hit is imported as a barrier - the catalog is data-driven.

Top groups with hits: Valvula 1,407 / Extintor 466 / Equipamento - Emergencia 289 / Valvulas 231 / Detector de Gas 176 / Valvula XV 137 / Tampa - Alivio de Emergencia 96 / Detector 88 / Hidrante 81 / Valvula de Emergencia 65 / Valvula Corta Chamas 45 / Valvula Emergencia 36 / Valvula de Seguranca 35 / Valvulas seguranca 34 / Extintor de incendio 28 / Valvula Bloqueio 24 / Miscelanea Seguranca 29 / Valvula Corta-chamas 29. Full keyword list (case-insensitive): valvula, extintor, detec, alarme, sirene, incendio, bloqueio, intertravamento, seguran, emerg, PSV, alivio, hidrante, gas, fumaca, H2S, corta-chamas. Locations with safety keywords: only 2 rows (`Valvula Seguranca` and `Valvula de Seguranca` groups), negligible. Location items are hierarchy nodes, not barriers.

Recommendation (Step 2 output): Barrier scope = equipment filtered by `groups_description` keyword match (3,523 candidates, ~19% of equipment, 1 documented exclusion). Location items stay hierarchy.

## 4. Work orders (status signal source)

120,600 rows (manifest), `date[gte]=2024-01-01`, newest-first. Two 60k slices analyzed; date range in first 60k rows: 2026-09-11 to 2026-09-12 only (tail contains 2024-2025). 30k row sample (proportionally stable): task types: PREV - Sistematica 22,500 (preventive, no status impact); CORR - Corretiva Planejada 3,600 (Degradada); APOP - Apoio Operacional 2,100 (operational support); CORR - Corretiva Emergencial 1,500 (Indisponivel); PREV - Calibracao 300 (preventive). stop_assets: false 22,800 / true 7,200 (24% - Fora de Operacao candidate). id_status_work_order: 1 (open) 28,800 / 4 (closed) 1,200. done: false 27,900 / true 2,100. trigger_description: NO_SCHEDULE_TASK 7,200 (ad-hoc) / DATE$EVERY$6$MONTHS 18,300 (scheduled 6-month) / DATE$EVERY$1$YEARS 3,900 (scheduled yearly) / DATE$EVERY$365$DAYS 300 / DATE$EVERY$3$MONTHS 300. id_items_availability: None 30,000 (dead field, always null). types_description: None 14,250 / Falha Potencial 750 (matches "Corretiva Planejada").

Date fields available (per work order task): `creation_date`, `date_maintenance`, `event_date`, `initial_date`, `final_date`, `wo_final_date`, `first_date_task`, `cal_date_maintenance`. `final_date` and `initial_date` are null on ~93% of rows (started but planned tasks); `wo_final_date` exists on completed WOs.

People retained in sync-generated status history: `created_by` (primary author), `requested_by` (author fallback and requester participant), `personnel_description` (personnel), `user_assigned` (assigned user), `resources_human_resources` (one or more semicolon-separated human resources), `validated_by_description` (validator). The sync snapshots names and roles only when it writes a new status-history row. Employee codes, personnel ids, signatures, and image paths are not stored. Work-request actor-field parity is not verified; the parser uses these fields only if the endpoint includes them.

Summary status derivation rule: Open corrective work on an asset:
- `tasks_log_types_description` contains `Corretiva Emergencial` -> Indisponivel (urgent slot, regardless of `is_urgent`)
- planned corrective (`Corretiva Planejada` / `Falha Potencial`, WO or WR) WITH urgent flag (`StatusEvent.isUrgent`, from WR `is_urgent=true`) -> Degradada; planned work without the urgent flag carries no status signal -> Disponivel
- `stop_assets = true` or `initial_date_out_of_service` set -> Fora de Operacao
- No open urgent/planned-urgent corrective work, not out of service -> Disponivel

Sample attribute: WR `is_urgent` (boolean, 29% true in the dump slice) is parsed in `lib/server/fracttal/work.ts` (`parseWorkRequest` → `workRequestEvent.isUrgent`) and merged per code; the dump import reads the same field in `scripts/fracttal-import.ts` (`extractEvent`). WO rows carry no `is_urgent`, so WO planned events stay non-urgent and no longer degrade.

## 5. Work requests (supplementary signal)

38,500 rows, 62 keys. 20k slice: types_2_description: CORR - Planejada 6,600 (same signal as WO) / CORR - Emergencial 1,200 (same signal as WO) / PROA - Melhoria/Adequacao 400 (improvement) / APOP - Apoio Operacional 400 (operational support) / PREV - Sistematica 400 (preventive). id_status / description: 6 / SOLVED_WITH_OT_STATUS 14,400 (solved via WO) / 5 / CANCEL_STATUS 3,200 (cancelled) / 4 / SOLVED_WITHOUT_OT_STATUS 1,800 (solved without WO) / 12 / REJECTED 600 (rejected). is_urgent: true 5,800 (29% urgent). types_description: Mecanica 4,400 / Eletrica 3,600 / Calderaria 3,000 / Servicos Gerais 2,400. priorities_description: None 20,000 (all null).

Date fields (per work request): `date` (creation), `date_incident`, `date_maintenance`, `date_solution`, `date_status`. WRs with status `SOLVED_WITH_OT_STATUS` link to WOs and carry the same corrective signal. Cancelled/rejected WRs should be ignored in status derivation.

## 6. Join keys

Work orders / requests do not share numeric `id` values with items. The join key is the text code:

| Source field | Target | Match rate (10k slice) |
| `work_orders.code` | `equipment.code` | 31% |
| `work_orders.code` | `locations.location_code` | 66% |
| `work_orders.code` | neither | 3% |
| `work_requests.code_item` | `equipment.code` | 35% |
| `work_requests.code_item` | `locations.location_code` | 43% |
| `work_requests.code_item` | neither | 22% |

Most WOs that match `locations.location_code` instead of equipment codes are station-level interventions (e.g. `PNC-EC-FSR`, `ME-RI-11`). These set context (station under intervention) but do not individually change a specific barrier's status. A small subset (~3%) are custom instrumentation tags (`FIT-365601A2`, `FQI-CV-6250-001`) not present in either item list.

## 7. Contingency signal (GM / CEC)

STATUSES.md defines Degradada Contingenciada and Indisponivel Contingenciada via GM or CEC contingency. A regex hunt for `contingen`, `GM`, `CEC`, `providencia`, `mitiga` across 15,000 WOs returned zero explicit hits in the sampled data. Contingency is not represented in these fields: `tasks_log_types_description` (CORR/PREV only), `tasks_log_types_2_description` (trade sub-types only), `description`, `task_note`, `notes`, `groups_*` fields.

Contingency events may live in: `labels` array (empty on all sampled rows but present as schema), `work_orders_status_custom_description` (null on all sampled rows), records created after the dump date, or a different Fracttal module not captured in this dump.

Status: mapped. Open corrective work whose free text carries `contingenc`, a `GM-...` evidence code (or bare `GM`), or a `CEC` token promotes Degradada -> Degradado Contingenciado and Indisponivel -> Indisponivel Contingenciado (`isContingencyText` / `hasContingencySignal` in `lib/server/fracttal/barrier-rules.ts`, merged per code in `lib/server/fracttal/work.ts`, applied in `map.ts` and `scripts/fracttal-import.ts`). Manual Ha Contingencia?=Sim promotes the same way on display (`effectiveAvailabilityId`, applied in `lib/resolve.ts` and the server KPI/filter) and materializes to 2/3 on PATCH. The 2026-09 dump samples carried no such signal, so a rebuild from that dump still yields zero contingencies until live work text or manual entries provide one.

## 8. Meters (not a status signal)

28 compressor horimeters (one active=False at FSL), all from Seacrest Petroleo stations. Meters do not carry availability or compliance signals but provide running-hour context for equipment use patterns. Stations with horimeters: SM-8 (compressor A/B, battery), IBU-26 (compressor 05/06), FAL (compressors A/B/C), FSR (compressors A/B/F), FSL (compressors A/B + emergency), CNC (compressors 01/02), UGVM-01/02/03 (mobile units), IBU-10 (compressor 10).

## 9. `id_items_availability` (dead field)

Always null in work orders (30k sampled). The field exists but carries no signal. Do not use for status derivation.

## 10. Maturity summary for status derivation

| Signal | Source | Ready? |
| Degradada | planned corrective (`CORR - Corretiva Planejada` / `Falha Potencial`) WITH urgent flag (WR `is_urgent=true` → `StatusEvent.isUrgent`) | yes - urgent gate |
| Indisponivel | `tasks_log_types_description` = `CORR - Corretiva Emergencial` | yes |
| Fora de Operacao | `stop_assets = true` or `initial_date_out_of_service` on item | yes |
| Disponivel | default (no open corrective WO, not out of service) | yes |
| Degradada Contingenciada | GM / CEC in labels or custom status | no - not in dump |
| Indisponivel Contingenciada | GM / CEC in labels or custom status | no - not in dump |
| Criticality | TAG suffix letter + `groups_2 = 'ESO'` flag | yes - ESO > A > B > C > D ranks, ESO/A critical |
| Category | `groups_description` on equipment | available, ~200 unique labels |
| Polo / Area | `groups_1_description` on equipment | available, 2 polo families |

## 11. Seed replacement and import run results (done)

Import script `scripts/fracttal-import.ts` replaces the synthetic locations/categories with real data: streams the 480 MB dump (no in-memory load), truncates `locations`, `categories`, `barriers`, rebuilds in ~37s. Run command: `deno run -A --env-file=.env scripts/fracttal-import.ts --dir test/fracttal-dump-2026-09-14-04-34-49 --apply`.

Actual imported catalog (full equipment scope, 2026-09-27): barriers 18,271 (every equipment row minus the documented transmitter mislabel exclusion; admitting gates ride per row in `scope_source`: keyword / eso / keyword+eso / all); locations 38 stations (codes extracted from L2 segment of `parent_description`, type derived); categories 528 labels (every distinct `groups_description`); availability_statuses unchanged, matches `docs/STATUSES.md`; criticality_levels ranked ESO > A > B > C > D, derived per barrier from the TAG suffix letter plus the ESO flag (shared `criticalityLabelFor`); ESO and A are the critical tiers.

Import run passes: A `items-2-equipment.json` scanned 18,272 matched 18,271 (all equipment, 1 exclusion); B `work-orders.json` scanned 120,600 matched 1,206 (all `CORR - Corretiva Planejada`); C `work-requests.json` scanned 38,500 matched 0 (all in closed statuses). Derived availability: Disponivel 3,521 / Degradado 1 (single degraded barrier `SSV-BRA01-001`, code `1013959`, real WO comment "Sanar falha de atuacao da SSV", `statusSince` 2026-09-11). Station breakdown (top 5): FAL 1,282 / SM 461 / IBU 262 / FSR 252 / CNC 200 (35 total stations). Category breakdown (top 5): Valvula 381 at FAL / Equipamento - Emergencia 245 at FAL / Valvulas 125 at FAL / Extintor 115 at FAL / Detector de Gas 107 at FAL (67 total categories across all stations).

The static location/category rows in `db/seed_lookups.sql` are only a stale fallback for fresh databases before the first import runs; the import owns the real catalog (38 stations / 528 categories from the full dump). The id contract in `lib/enums.ts` is now only used for the static lookup tables (availability, compliance, groupings, typologies, owners, loc_descs, authors). Locations and categories are fully dynamic: the server serves id-bearing vocabularies and the UI never depends on a static id mapping for them.