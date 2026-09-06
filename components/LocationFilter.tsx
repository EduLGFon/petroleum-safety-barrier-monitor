import { LOCATIONS } from "../lib/constants.ts";
import type { Barrier } from "../lib/types.ts";
interface Props {
  selected: string;
  allBarriers: Barrier[];
  onChange: (c: string) => void;
}
export function LocationFilter({ selected, allBarriers, onChange }: Props) {
  return (
    <nav
      aria-label="Filtro por instalação"
      style={{
        display: "flex",
        gap: "var(--d-gap-xs)",
        flexWrap: "wrap",
        marginBottom: "var(--d-section)",
      }}
    >
      {LOCATIONS.map((loc, i) => {
        const count = loc.code === "ALL"
          ? allBarriers.length
          : allBarriers.filter((b) => b.instalacao === loc.code).length;
        const a = selected === loc.code;
        return (
          <button
            type="button"
            key={loc.code}
            onClick={() => onChange(loc.code)}
            aria-pressed={a}
            title={loc.tipo}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--d-pill-gap)",
              padding: "var(--d-pill-pad)",
              fontSize: "var(--d-body)",
              fontWeight: a ? 700 : 500,
              borderRadius: "var(--d-pill-radius)",
              border: a ? "1px solid transparent" : "1px solid var(--border)",
              background: a
                ? "linear-gradient(135deg,var(--accent),var(--accent-2))"
                : "var(--bg-surface)",
              color: a ? "#fff" : "var(--text-secondary)",
              cursor: "pointer",
              boxShadow: a ? "0 3px 12px var(--glow)" : "var(--shadow-sm)",
              whiteSpace: "nowrap",
              transition: "all .22s var(--ease-std)",
              animation: `rowAppear .25s ${i * 35}ms var(--ease-out) both`,
            }}
            onMouseEnter={(e) => {
              if (!a) {
                (e.currentTarget as HTMLButtonElement).style.borderColor =
                  "var(--accent)";
              }
            }}
            onMouseLeave={(e) => {
              if (!a) {
                (e.currentTarget as HTMLButtonElement).style
                  .borderColor = "var(--border)";
              }
            }}
          >
            {loc.name}
            <span
              style={{
                fontSize: "var(--d-caption)",
                fontWeight: 600,
                padding: "var(--d-count-pad)",
                borderRadius: "var(--d-pill-sm-radius)",
                background: a ? "rgba(255,255,255,.2)" : "var(--bg-elevated)",
                color: a ? "rgba(255,255,255,.9)" : "var(--text-muted)",
                transition: "all .2s",
              }}
            >
              {count.toLocaleString("pt-BR")}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
