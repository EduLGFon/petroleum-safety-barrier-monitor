# Fracttal field survey (per barrier / WO / WR)

Source of truth for this survey: a live read of the Fracttal One tenant
(`GET /items`, `/work_orders`, `/work_requests`) taken 2026-10-27, compared
with the narrow slices the app actually parses
(`lib/server/fracttal/types.ts` + `parseAsset`/`parseWorkOrder`/`parseWorkRequest`)
and with the barrier schema (`db/schema.sql`).

The app deliberately consumes a **narrow, validated slice** of each upstream
row and keeps everything else behind the raw-detail endpoint
(`routes/api/barriers/[id]/fracttal-raw.ts` + `lib/server/fracttal/raw-detail.ts`),
so "missing" here means "not part of the normal sync/derivation pipeline",
not "unreadable". Each section lists what is captured, what is missing, and
whether the gap is worth closing.

## 1. Barrier (equipment item, `item_type = 2`)

Live row carries 50 fields. Captured by `FracttalAsset` (28 fields):

- Identity: `id`, `code`
- Flags: `active`, `available`, `is_serial_control`
- Taxonomy: `items_types_description`, `groups_description`,
  `groups_1_description` (polo/area), `groups_2_description` (ESO flag),
  `priorities_description` (almost always null upstream)
- Hierarchy: `parent_description`, `location_code`, `id_parent`
- Out-of-service: `initial_date_out_of_service`, `last_final_date_available`
- Maintenance plan: `id_group_task`, `groups_tasks_description`
- Free-text inventory columns: `field_1..field_6`, `notes`,
  `description`, `units_description`

Not captured (22 fields), grouped by likely value:

| Field | Value to us | Recommendation |
|---|---|---|
| `custom_fields_values` (+ `custom_fields_groups_description`) | Per-asset custom attributes (labels/values). Could hold barrier-specific data (test dates, certifications, set-points) that today has nowhere to go. | **Inspect tenant values** before deciding; if they carry barrier evidence, add a JSONB column + sync. |
| `startup_date`, `purchase_date` | Commissioning / age context for the barrier. | Nice-to-have for lifecycle/KPI; low priority. |
| `hours_average_daily_use` | Running hours per day (e.g. `86400`). Useful for maintenance-interval reasoning. | Could feed plan-followed heuristics later. |
| `costs_center_description`, `budgets_description` | Cost center / budget. | Reporting only; not needed for status. |
| `units_code` | Unit code (vs `units_description`). | Cosmetic; skip unless exports need it. |
| `id_company`, `visible_to_all`, `id_parent` (captured), `item_url` | Access/company/link metadata. | Skip (`item_url` could be a convenience link). |
| `barcode`, `weight`, `lead_time`, `min_stock_warning`, `salvage_value`, `anual_depreciation`, `total_cost`, `total_replacement_cost` | Inventory/accounting. | Skip for a safety-barrier monitor. |
| `latitude`, `longitud` | Geolocation. | Skip unless a map view is added. |

Already-dead/ignored upstream signals (documented in `docs/FRACTTAL-DATA.md`):
`priorities_description` is null on ~18k/18k rows; criticality is derived from
the TAG suffix + ESO flag instead. `id_items_availability` is always null in
WOs. `groups_1_description` is the polo, never a category.

## 2. Work order (`/work_orders`)

Live row carries 87 fields. Captured by `FracttalWorkOrder` (19 fields):

- Join: `code`
- Classification: `tasks_log_types_description`,
  `tasks_log_types_2_description`, `tasks_log_task_type_main`,
  `types_description`
- Status: `done`, `stop_assets`
- Text: `wo_folio`, `description`, `task_note`, `note`
- Dates: `initial_date`, `date_maintenance`, `creation_date`
- People: `created_by`, `requested_by`, `personnel_description`,
  `user_assigned`, `resources_human_resources`, `validated_by_description`

Not captured (68 fields). Important candidates:

| Field | Value to us | Recommendation |
|---|---|---|
| `id_status_work_order` | Open (1) vs closed (4). Today we infer from `done !== false`, which is coarser. | Add to `FracttalWorkOrder`; use in `workOrderSlot` gate instead of `done`. |
| `event_date`, `final_date`, `wo_final_date`, `cal_date_maintenance`, `first_date_task` | Richer dates for the status-event timeline; today only `initial_date`/`date_maintenance`/`creation_date` are used. | Add to `earliestDate` candidate set in `workOrderEvent`. |
| `causes_description`, `severiry_description`, `damages_types_description`, `detection_method_description` | Failure analysis behind a degraded/unavailable barrier. | Append to `degradationDesc`/action text or store for reports. |
| `priorities_description` | WO priority (VERY_HIGH/HIGH/...). | Could drive alert urgency; today ignored. |
| `trigger_description` | Scheduled (`DATE$EVERY$...`) vs ad-hoc (`NO_SCHEDULE_TASK`). | Maintenance-compliance/KPI signal (planned vs reactive). |
| `work_orders_status_custom_description`, `labels` | Contingency signal (GM/CEC). Already scanned via `contingencyFromRaw` on the **raw** row, so no derivation gap; only the typed struct lacks them. | Keep raw scan (already done); optionally type them for clarity. |
| `stop_assets_sec`, `real_stop_assets_sec`, `time_disruption` | Downtime duration while stopped. | KPI/reporting (MTTR-ish); not status. |
| `resources_inventory`, `resources_services`, `resources_hours` | Parts/services/hours consumed. | Reporting/cost; skip for status. |
| `completed_percentage`, `duration`, `tasks_duration`, `real_duration` | Progress. | Reporting. |
| `annotations`, `rating`, `review_date` | Audit/quality. | Nice-to-have. |
| `code_create_by`, `code_responsible`, `id_item`, `id_request`, `id_personnel`, `id_personnel_log` | Traceability and WR↔WO linkage (`id_request` already links WR→WO). | `id_request`/`id_item` useful for joins; others audit. |
| `parent_description`, `groups_*` | Asset context (already on barrier). | Skip (duplicate). |
| `is_offline` | Data-quality flag. | Skip unless auditing. |
| `personnel_path_image`, `signature`, `*_path_signature`, `details_signature`, `validator_path_signature` | Signatures/images. | Skip (binary-ish paths). |
| `id_items_availability` | **Dead field** (always null). | Intentionally ignored. |

## 3. Work request (`/work_requests`)

Live row carries 62 fields. Captured by `FracttalWorkRequest` (14 fields):

- Join: `code_item`
- Status: `id_status`
- Classification: `types_2_description`, `types_description`
- Text: `wo_folio`, `description`, `observation`
- Date: `date_maintenance`
- People: `created_by`, `requested_by`, `personnel_description`,
  `user_assigned`, `resources_human_resources`, `validated_by_description`

Not captured (48 fields). Important candidates:

| Field | Value to us | Recommendation |
|---|---|---|
| `is_urgent` | 29% of WRs are urgent. Today dropped; could prioritize alerts/queue. | Add to `FracttalWorkRequest` and surface in UI/alerts. |
| `date`, `date_incident`, `date_solution`, `date_status` | Timeline; `date_incident` is when the failure started (better than `date_maintenance`). | Use `date_incident`/`date` as event date fallback. |
| `id_work_order` | Direct WR→WO link (today only matched by code/text). | Use for correlation when present. |
| `types_1_description` | Request category (e.g. "Patrimônio"). | Reporting/grouping. |
| `priorities_description` | Request priority (null in dump, but live may populate). | Check live; probably skip if always null. |
| `rating`, `rating_notes` | Quality feedback. | Reporting. |
| `requests_x_status_notes`, `requests_x_status_description`, `requests_x_status_accounts_name`, `requests_x_status_third_parties_name` | Status-transition detail/owner. | Could enrich history participants. |
| `requests_x_key_words_descriptions` | Tags. | Could feed contingency/keyword search. |
| `accounts_name`, `accounts_email`, `code_creator`, `email_requested_by`, `requested_by` (captured) | Requester identity. | Already have `requested_by`; email/account add contactability. |
| `costs_center_description` | Cost center. | Reporting. |
| `items_description`, `parent_description`, `parent_path_node` | Asset context (duplicate of barrier). | Skip. |
| `geolocation` | Location of request. | Skip unless map view. |
| `visible_to_all`, `id_company`, `id_*` (cost center, group, account, user, personnel log, contact log) | Access/audit metadata. | Skip except `id_work_order`. |
| `from_guest_portal`, `identifier`, `annotations`, `status_path_image`, `types_color` | UI/portal metadata. | Skip. |

## 4. Cross-cutting observations

1. **Contingency** is the one signal we deliberately read from the *raw* row
   (labels + `work_orders_status_custom_description`) via `contingencyFromRaw`,
   because the typed structs drop those fields. That coverage is already
   correct; the gap is only typing, not data.
2. **Dates** are the highest-value missing WO/WR fields: today's status
   timeline uses 3 of ~7 available dates, so event ordering can be off when
   `initial_date`/`date_maintenance` are null (they are null on ~93% of rows).
   `cal_date_maintenance`/`first_date_task`/`date_incident` are populated more
   often and would improve `status_since` accuracy.
3. **Failure context** (`causes_description`, `severiry_description`,
   `damages_types_description`) is entirely dropped; only `description`/
   `task_note` survive into `degradationDesc`/`actionPlan`. Adding these would
   make the barrier dialog's degradation text materially better.
4. **Urgency** (`is_urgent` on WRs, `priorities_description` on WOs) is dropped,
   so the monitor cannot distinguish an urgent corrective from a routine one
   beyond the planned/emergency classification.
5. **Custom fields** on items are the one asset-side unknown: we capture
   `field_1..field_6` but not `custom_fields_values`. A tenant probe of those
   values is the next step before deciding whether they warrant a column.

## 5. Suggested priority order

1. WO/WR additional dates → `status_since` accuracy (medium effort, high value).
2. WO failure context → better `degradationDesc`/`actionPlan` (low effort).
3. `is_urgent` + WO priority → alert prioritization (low effort).
4. `id_status_work_order` → replace `done` heuristic (low effort).
5. `custom_fields_values` probe → decide if a new column is warranted.
6. Everything else (costs, accounting, signatures, geolocation) → keep out of
   the sync payload; reachable via raw detail when an operator needs it.
