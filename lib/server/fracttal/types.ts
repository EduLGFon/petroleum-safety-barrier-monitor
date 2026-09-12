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
