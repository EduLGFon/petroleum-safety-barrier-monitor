// SyncDeltas: colored actual-change counts for the subtitle line.
// This is why it exists: operators see what changed (+new ~updated
// -removed) without opening the hover card. Unchanged items stay out of
// this row - the card explains them under "Sem alteração". Purely
// presentational.
import type { Deltas } from "../../lib/sync-indicator.ts";

// chip: one mini count with tone color and pt-BR tooltip.
function Chip(
  { text, color, tip }: { text: string; color: string; tip: string },
) {
  return (
    <span
      title={tip}
      style={{
        display: "inline-flex",
        alignItems: "center",
        fontFamily: "var(--font-mono)",
        fontSize: 11,
        fontWeight: 700,
        color,
        background: `color-mix(in srgb, ${color} 13%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 32%, transparent)`,
        borderRadius: 5,
        padding: "0 5px",
        lineHeight: "16px",
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

// SyncDeltas: +3 ~12 -1 chips for real changes. Zero-change runs render
// "sem alterações" so an empty sync never looks broken.
export function SyncDeltas({ deltas }: { deltas: Deltas | null }) {
  if (deltas === null) return null;
  if (deltas.changed === 0) {
    return (
      <span style={{ fontSize: 11, color: "var(--au-sub)" }}>
        sem alterações
      </span>
    );
  }
  return (
    <span
      aria-label={`${deltas.inserts} novas, ${deltas.updates} atualizadas, ${deltas.deletes} removidas`}
      style={{ display: "inline-flex", alignItems: "center", gap: 4 }}
    >
      {deltas.inserts > 0 && (
        <Chip
          text={`+${deltas.inserts}`}
          color="#17c964"
          tip={`${deltas.inserts} novas`}
        />
      )}
      {deltas.updates > 0 && (
        <Chip
          text={`~${deltas.updates}`}
          color="#f5a524"
          tip={`${deltas.updates} atualizadas`}
        />
      )}
      {deltas.deletes > 0 && (
        <Chip
          text={`-${deltas.deletes}`}
          color="#f31260"
          tip={`${deltas.deletes} removidas`}
        />
      )}
    </span>
  );
}
