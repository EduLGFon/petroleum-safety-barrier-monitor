// Static icon set - barrel re-exporting grouped icon modules.
// This is why it exists: importers keep a single stable path while groups
// live in small files by usage (status/navigation/files/theme/domain).
export * from "./icons/navigation.tsx";
export * from "./icons/status.tsx";
export * from "./icons/files.tsx";
export * from "./icons/theme.tsx";
export * from "./icons/domain.tsx";
