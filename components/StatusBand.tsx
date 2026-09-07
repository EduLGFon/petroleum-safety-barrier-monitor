// Status band - proportional availability segments derived from the data.
// This is why it exists: statuses are dynamic, so segments render from the
// KPI buckets (new statuses appear automatically with hashed colors) and
// scroll horizontally instead of squeezing into slivers at 7+ segments.
import type { KpiSnapshot } from "../lib/types.ts";
import { dispColorFor, shortStatusLabel } from "../lib/constants.ts";
import { ActivityIcon } from "./ui/Icons.tsx";
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
  const keys = Object.keys(counts).sort((a, b) => {
    const ia = KNOWN_ORDER.indexOf(a), ib = KNOWN_ORDER.indexOf(b);
    if (ia !== -1 || ib !== -1) {
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    }
    return counts[b] - counts[a];
  });
  const total = kpi.total || 1;
  return (
    <div style={{ marginBottom: "var(--d-section)" }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--d-gap-xs)",
          fontSize: "var(--d-caption)",
          fontWeight: 700,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
          marginBottom: "var(--d-opt-gap)",
        }}
      >
        <ActivityIcon size={13} color="var(--accent)" strokeWidth={2} />{" "}
        Disponibilidade — clique para filtrar
      </div>
      <div
        style={{
          display: "flex",
          gap: "var(--d-gap-2xs)",
          height: "var(--d-band-h)",
          background: "var(--bg-elevated)",
          borderRadius: "var(--d-hero-radius)",
          padding: "var(--d-band-pad)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          overflowX: "auto",
          maxWidth: "100%",
        }}
      >
        {keys.map((key, i) => {
          const count = counts[key] ?? 0,
            ptPct = Math.round(count / total * 100);
          const cfg = dispColorFor(key),
            short = shortStatusLabel(key),
            isA = activeFilter === key,
            isDim = !!activeFilter && !isA;
          return (
            <button
              type="button"
              key={key}
              onClick={() => onFilter(isA ? "" : key)}
              title={key}
              aria-pressed={isA}
              style={{
                flex: Math.max(count, 1),
                background: cfg.grad,
                border: isA
                  ? "2px solid rgba(255,255,255,.6)"
                  : "2px solid transparent",
                borderRadius: "var(--d-row-radius)",
                cursor: "pointer",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 1,
                padding: "var(--d-seg-pad)",
                opacity: isDim ? 0.16 : 1,
                transform: isA ? "scale(1.025)" : "scale(1)",
                transition:
                  "opacity .22s var(--ease-std), transform .22s var(--ease-std), box-shadow .22s var(--ease-std), border .15s",
                overflow: "hidden",
                minWidth: "var(--d-seg-min)",
                flexShrink: 0,
                boxShadow: isA ? `0 0 18px ${cfg.solid}55` : "none",
                position: "relative",
                animation: `cardAppear .3s ${
                  Math.min(i * 40, 400)
                }ms var(--ease-out) both`,
              }}
              onMouseEnter={(e) => {
                if (!isA) {
                  (e.currentTarget as HTMLButtonElement).style.transform =
                    "scale(1.015)";
                }
              }}
              onMouseLeave={(e) => {
                if (!isA) {
                  (e.currentTarget as HTMLButtonElement).style
                    .transform = "scale(1)";
                }
              }}
            >
              <div
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  height: "44%",
                  background:
                    "linear-gradient(180deg,rgba(255,255,255,.12) 0%,transparent 100%)",
                  pointerEvents: "none",
                }}
              />
              <span
                style={{
                  fontSize: "var(--d-tiny)",
                  fontWeight: 700,
                  color: "rgba(255,255,255,.82)",
                  letterSpacing: "0.07em",
                  textTransform: "uppercase",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: "100%",
                  position: "relative",
                }}
              >
                {short}
              </span>
              <span
                style={{
                  fontSize: "var(--d-band-num)",
                  fontWeight: 800,
                  color: "#fff",
                  lineHeight: 1,
                  textShadow: "0 1px 5px rgba(0,0,0,.4)",
                  position: "relative",
                }}
              >
                {count.toLocaleString("pt-BR")}
              </span>
              <span
                style={{
                  fontSize: "var(--d-tiny)",
                  color: "rgba(255,255,255,.6)",
                  fontWeight: 600,
                  position: "relative",
                }}
              >
                {ptPct}%
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
