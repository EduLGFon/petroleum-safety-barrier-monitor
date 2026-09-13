// Catalog defaults - seed data and display metadata, NOT the source of truth.
// The UI derives stations, categories, statuses and owners from the loaded
// dataset; these lists only seed the mock/DB and label known values. Any new
// value arriving at runtime must still render, filter and aggregate via the
// dynamic fallbacks below (dynamic-data principle in agents.md).

// Barrel re-export - split to keep files small; implementations live in ./constants/.
export * from "./constants/locations.ts";
export * from "./constants/catalog.ts";
export * from "./constants/helpers.ts";
export * from "./constants/colors.ts";
