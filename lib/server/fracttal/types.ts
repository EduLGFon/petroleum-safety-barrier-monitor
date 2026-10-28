// Fracttal wire types - narrow shapes for the read-only API client.
// This is why it exists: Fracttal responses are wide and loosely typed; the
// client consumes only fields the mapping draft uses and validates them, so
// a change in the upstream contract fails loudly instead of drifting.
import type { ItemTypeValue } from "./itemType.ts";

// FracttalAsset: the slice of GET /items output this app consumes. Identity
// fields (id/code) are required; everything else may be null upstream.
export interface FracttalAsset {
  id: number;
  code: string;
  active: boolean | null;
  available: boolean | null;
  id_type_item: number;
  description: string | null;
  location_code: string | null;
  id_parent: number | null;
  items_types_description: string | null;
  groups_description: string | null;
  groups_1_description: string | null;
  groups_2_description: string | null;
  priorities_description: string | null;
  parent_description: string | null;
  units_description: string | null;
  is_serial_control: boolean | null;
  initial_date_out_of_service: string | null;
  last_final_date_available: string | null;
  // Free-text inventory columns (GERAL sheet) and the attached maintenance
  // plan. They are nullable upstream, including on rows that have no plan.
  field_1: string | null;
  field_2: string | null;
  field_3: string | null;
  field_4: string | null;
  field_5: string | null;
  field_6: string | null;
  notes: string | null;
  id_group_task: number | null;
  groups_tasks_description: string | null;
}

// FracttalPage: one normalized /items page plus the server-side total.
export interface FracttalPage {
  items: FracttalAsset[];
  total: number;
}

// ListAssetQuery mirrors the documented query_ params; limit is clamped to
// the API ceiling (100) by the client.
export interface FracttalListQuery {
  itemType?: ItemTypeValue;
  locationCode?: string;
  active?: boolean;
  available?: boolean;
  isTree?: boolean;
  start?: number;
  limit?: number;
}

// malformedRows: index-addressable reasons the validator skipped rows.
export interface FracttalReport {
  pagesFetched: number;
  rawTotal: number;
  collected: number;
  malformed?: Array<{ index: number; reason: string }>;
}

// FracttalWorkOrder: the slice of GET /work_orders output that status
// derivation consumes. Field names mirror the dump census
// (docs/FRACTTAL-DATA.md section 4); everything but the join code may be
// null upstream.
export interface FracttalWorkOrder {
  code: string;
  done: boolean | null;
  id_status_work_order: number | null;
  tasks_log_types_description: string | null;
  tasks_log_types_2_description: string | null;
  tasks_log_task_type_main: string | null;
  types_description: string | null;
  stop_assets: boolean | null;
  stop_assets_sec: number | null;
  real_stop_assets_sec: number | null;
  time_disruption: number | null;
  wo_folio: string | null;
  description: string | null;
  task_note: string | null;
  note: string | null;
  // Failure context behind a degraded/unavailable barrier.
  causes_description: string | null;
  severiry_description: string | null;
  damages_types_description: string | null;
  detection_method_description: string | null;
  // WO priority (VERY_HIGH/HIGH/...).
  priorities_description: string | null;
  // Scheduled vs ad-hoc.
  trigger_description: string | null;
  // Contingency signal (also scanned on the raw row).
  work_orders_status_custom_description: string | null;
  labels: unknown;
  // Date candidates (earliest wins for status_since).
  initial_date: string | null;
  date_maintenance: string | null;
  creation_date: string | null;
  event_date: string | null;
  final_date: string | null;
  wo_final_date: string | null;
  cal_date_maintenance: string | null;
  first_date_task: string | null;
  created_by: string | null;
  requested_by: string | null;
  personnel_description: string | null;
  user_assigned: string | null;
  resources_human_resources: string | null;
  validated_by_description: string | null;
  // Traceability / joins.
  id_request: number | null;
  id_item: number | null;
}

// FracttalWorkRequest: the slice of GET /work_requests output that status
// derivation consumes (docs/FRACTTAL-DATA.md section 5). The event date
// mirrors the import extractor (date_maintenance only); the creation `date`
// stays unread until live semantics are verified.
export interface FracttalWorkRequest {
  code_item: string;
  id_status: number | null;
  // Urgency / priority.
  is_urgent: boolean | null;
  priorities_description: string | null;
  types_1_description: string | null;
  types_2_description: string | null;
  types_description: string | null;
  wo_folio: string | null;
  description: string | null;
  observation: string | null;
  // Dates.
  date: string | null;
  date_incident: string | null;
  date_maintenance: string | null;
  date_solution: string | null;
  date_status: string | null;
  // Status-transition detail.
  requests_x_status_description: string | null;
  requests_x_status_notes: string | null;
  requests_x_status_accounts_name: string | null;
  requests_x_key_words_descriptions: string | null;
  // Join.
  id_work_order: number | null;
  id_item: number | null;
  created_by: string | null;
  requested_by: string | null;
  personnel_description: string | null;
  user_assigned: string | null;
  resources_human_resources: string | null;
  validated_by_description: string | null;
  accounts_name: string | null;
  accounts_email: string | null;
}

// FracttalWorkQuery mirrors the documented query params for the work
// endpoints that the sync actually uses (reference: Query tasks in WOs,
// Consulta de Solicitud): paging plus the ot_status filter. since/until
// are intentionally absent: a live probe (2026-09-20) showed since has no
// effect on totals, so windowing is newest-N-pages only.
export interface FracttalWorkQuery {
  start?: number;
  limit?: number;
  otStatus?: string;
  codeAsset?: string;
  codeItem?: string;
}
