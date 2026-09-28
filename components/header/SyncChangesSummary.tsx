// SyncChangesSummary - grouped counts for one scope tab.
// This is why it exists: raw run counts (i/u/d) never explain where the
// change concentrates; kind + critical + top-status chips do.
import type { SyncChangeSummary } from "../../lib/types.ts";

import { SectionTitle, Stat } from "./SyncHoverCard.tsx";

export function SyncChangesSummary(
  { summary }: { summary: SyncChangeSummary },
) {
  const byKind = summary.byKind ?? {};
  const fresh = byKind["new"] ?? 0;
  const updated = (byKind["updated"] ?? 0) + (byKind["restored"] ?? 0);
  const removed = byKind["removed"] ?? 0;
  const topStatus = Object.entries(summary.byStatus ?? {})
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <SectionTitle text={`RESUMO (${summary.total})`} />
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          border: "1px solid var(--au-row)",
          borderRadius: 8,
        }}
      >
        <Stat value={fresh} caption="Novas" color="#17c964" />
        <Stat value={updated} caption="Atualizadas" color="#f5a524" />
        <Stat value={removed} caption="Removidas" color="#f31260" />
        <Stat
          value={summary.critical}
          caption="Críticas (ESO/A)"
          color="#7c3aed"
        />
      </div>
      {topStatus.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {topStatus.map(([label, n]) => (
            <span
              key={label}
              style={{
                fontSize: 11,
                color: "var(--au-sub)",
                border: "1px solid var(--au-row)",
                borderRadius: 99,
                padding: "2px 8px",
              }}
            >
              {label}: {n}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
