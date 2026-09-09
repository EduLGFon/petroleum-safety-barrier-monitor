// Aurora Executive Dark status segments.
// This is why it exists: availability shares as a bare row of glass
// cells (colored label over white value), sized by volume. Segments are
// dynamic - new statuses appear automatically - and click to filter.
import { dispColorFor, shortStatusLabel } from "../lib/constants.ts";
import { AURORA, AURORA_TYPE } from "../lib/aurora.ts";
import type { KpiSnapshot } from "../lib/types.ts";
// Curated order for the well-known statuses; anything new sorts after them
// by volume so the band stays stable across deploys.
const KNOWN_ORDER = [
  "Disponível",
  "Fora de Operação",
  "Indisponível Contingenciado",
  "Degradado Contingenciado",
  "Degradado",
  "Indisponível",
];
interface Props {
  kpi: KpiSnapshot;
  activeFilter: string;
  onFilter: (k: string) => void;
}
// StatusBand: clickable availability segments sized by volume; click toggles the filter.
export function StatusBand({ kpi, activeFilter, onFilter }: Props) {
  // Prefer the dynamic buckets; the wire path only carries fixed fields, so
  // reconstruct from those when buckets are absent (known statuses only).
  const counts = kpi.byDisponibilidade ?? {
    "Disponível": kpi.disponivel,
    "Fora de Operação": kpi.foraDeOp,
    "Indisponível Contingenciado": kpi.indispCont,
    "Degradado Contingenciado": kpi.degrCont,
    "Degradado": kpi.degradado,
    "Indisponível": kpi.indisponivel,
  };
  // Sort comparator: known statuses in KNOWN_ORDER first; unknowns trail by volume.
  const keys = Object.keys(counts).sort((a, b) => {
    const ia = KNOWN_ORDER.indexOf(a), ib = KNOWN_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) {
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }
    return counts[b] - counts[a];
  });
  return (
    <div style={{ marginBottom: "var(--d-section)" }}>
      <div
        style={{
          display: "flex",
          gap: 6,
          overflowX: "auto",
          maxWidth: "100%",
        }}
      >
        {keys.map((key, i) => {
          const count = counts[key] ?? 0;
          const cfg = dispColorFor(key),
            short = shortStatusLabel(key),
            isA = activeFilter === key,
            isDim = !!activeFilter && !isA;
          return (
            <button
              type="button"
              key={key}
              onClick={() => onFilter(isA ? "" : key)}
              title={`${key} - clique para filtrar`}
              aria-pressed={isA}
              style={{
                flex: Math.max(count, 1),
                background: AURORA.seg,
                border: isA
                  ? `1px solid ${AURORA.value}`
                  : `1px solid ${AURORA.segBorder}`,
                borderRadius: AURORA.segRadius,
                cursor: "pointer",
                padding: "10px 4px",
                textAlign: "center",
                opacity: isDim ? 0.35 : 1,
                minWidth: "var(--d-seg-min)",
                flexShrink: 0,
                boxShadow: isA ? `0 0 18px ${cfg.solid}55` : "none",
                transition:
                  "opacity .22s var(--ease-std), box-shadow .22s var(--ease-std), border .15s",
                animation: `cardAppear .3s ${
                  Math.min(i * 40, 400)
                }ms var(--ease-out) both`,
              }}
            >
              <div
                style={{
                  fontSize: AURORA_TYPE.bandLabel.fontSize,
                  fontWeight: AURORA_TYPE.bandLabel.fontWeight,
                  color: cfg.solid,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {short}
              </div>
              <div
                className="tnum"
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: AURORA_TYPE.bandValue.fontSize,
                  fontWeight: AURORA_TYPE.bandValue.fontWeight,
                  color: AURORA.value,
                }}
              >
                {count.toLocaleString("pt-BR")}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
