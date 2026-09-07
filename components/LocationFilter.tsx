// Location tabs - one pill per station present in the data.
// This is why it exists: stations are dynamic (30-50+), so tabs derive from
// the loaded barriers merged with seed metadata, counted in a single pass,
// and scroll horizontally instead of wrapping into a wall.
import { useMemo } from "preact/hooks";
import { LOCATIONS } from "../lib/constants.ts";
import type { Barrier } from "../lib/types.ts";
interface Props {
  selected: string;
  allBarriers: Barrier[];
  onChange: (c: string) => void;
}
export function LocationFilter({ selected, allBarriers, onChange }: Props) {
  // Stations from the data first (future stations appear automatically),
  // seed metadata only supplies display names for known codes.
  const tabs = useMemo(() => {
    const meta = new Map(LOCATIONS.map((l) => [l.code, l]));
    const counts = new Map<string, number>();
    for (const b of allBarriers) {
      counts.set(b.instalacao, (counts.get(b.instalacao) ?? 0) + 1);
    }
    const codes = [...counts.keys()].sort((a, b) =>
      a.localeCompare(b, "pt-BR")
    );
    return codes.map((code) => ({
      code,
      name: meta.get(code)?.name ?? code,
      tipo: meta.get(code)?.tipo ?? "Instalação",
      count: counts.get(code) ?? 0,
    }));
  }, [allBarriers]);
  return (
    <nav
      aria-label="Filtro por instalação"
      style={{
        display: "flex",
        gap: "var(--d-gap-xs)",
        flexWrap: "nowrap",
        overflowX: "auto",
        maxWidth: "100%",
        paddingBottom: 4,
        marginBottom: "var(--d-section)",
      }}
    >
      <Tab
        name="Todas"
        tipo="Todas as Instalações"
        count={allBarriers.length}
        active={selected === "ALL"}
        index={0}
        onClick={() => onChange("ALL")}
      />
      {tabs.map((t, i) => (
        <Tab
          key={t.code}
          name={t.name}
          tipo={t.tipo}
          count={t.count}
          active={selected === t.code}
          index={i + 1}
          onClick={() => onChange(t.code)}
        />
      ))}
    </nav>
  );
}

function Tab(
  { name, tipo, count, active, index, onClick }: {
    name: string;
    tipo: string;
    count: number;
    active: boolean;
    index: number;
    onClick: () => void;
  },
) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={tipo}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--d-pill-gap)",
        padding: "var(--d-pill-pad)",
        fontSize: "var(--d-body)",
        fontWeight: active ? 700 : 500,
        borderRadius: "var(--d-pill-radius)",
        border: active ? "1px solid transparent" : "1px solid var(--border)",
        background: active
          ? "linear-gradient(135deg,var(--accent),var(--accent-2))"
          : "var(--bg-surface)",
        color: active ? "#fff" : "var(--text-secondary)",
        cursor: "pointer",
        boxShadow: active ? "0 3px 12px var(--glow)" : "var(--shadow-sm)",
        whiteSpace: "nowrap",
        flexShrink: 0,
        transition: "all .22s var(--ease-std)",
        animation: `rowAppear .25s ${
          Math.min(index * 35, 400)
        }ms var(--ease-out) both`,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "var(--accent)";
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          (e.currentTarget as HTMLButtonElement).style.borderColor =
            "var(--border)";
        }
      }}
    >
      {name}
      <span
        style={{
          fontSize: "var(--d-caption)",
          fontWeight: 600,
          padding: "var(--d-count-pad)",
          borderRadius: "var(--d-pill-sm-radius)",
          background: active ? "rgba(255,255,255,.2)" : "var(--bg-elevated)",
          color: active ? "rgba(255,255,255,.9)" : "var(--text-muted)",
          transition: "all .2s",
        }}
      >
        {count.toLocaleString("pt-BR")}
      </span>
    </button>
  );
}
