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
  tasks_log_types_description: string | null;
  types_description: string | null;
  stop_assets: boolean | null;
  wo_folio: string | null;
  description: string | null;
  initial_date: string | null;
  date_maintenance: string | null;
  creation_date: string | null;
}

// FracttalWorkRequest: the slice of GET /work_requests output that status
// derivation consumes (docs/FRACTTAL-DATA.md section 5). The event date
// mirrors the import extractor (date_maintenance only); the creation `date`
// stays unread until live semantics are verified.
export interface FracttalWorkRequest {
  code_item: string;
  id_status: number | null;
  types_2_description: string | null;
  wo_folio: string | null;
  description: string | null;
  date_maintenance: string | null;
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
}
