// Location tabs - Aurora glass pills, one per station in the data.
// This is why it exists: stations are dynamic (30-50+), so tabs derive from
// the loaded barriers merged with seed metadata, counted in a single pass,
// and scroll horizontally instead of wrapping into a wall. The active tab
// runs the signature gradient; idle tabs are quiet glass cells.
import { LOCATIONS } from "../lib/constants.ts";
import type { Barrier } from "../lib/types.ts";
import { AURORA } from "../lib/aurora.ts";
import { useMemo } from "preact/hooks";
interface Props {
  selected: string;
  allBarriers: Barrier[];
  // Precomputed tabs for server mode (client derives tabs from allBarriers).
  stations?: { code: string; count: number }[];
  total?: number;
  onChange: (c: string) => void;
}
// LocationFilter: station tabs derived from data plus Todas; scrolls horizontally.
export function LocationFilter(
  { selected, allBarriers, stations, total, onChange }: Props,
) {
  // Stations from the data first (future stations appear automatically),
  // seed metadata only supplies display names for known codes. Server mode
  // passes precomputed stations instead of the full barrier list.
  const tabs = useMemo(() => {
    const meta = new Map(LOCATIONS.map((l) => [l.code, l]));
    const counts = new Map<string, number>();
    if (stations) {
      for (const s of stations) counts.set(s.code, s.count);
    } else {
      for (const b of allBarriers) {
        counts.set(b.instalacao, (counts.get(b.instalacao) ?? 0) + 1);
      }
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
  }, [allBarriers, stations]);
  return (
    <nav
      aria-label="Filtro por instalação"
      style={{
        display: "flex",
        gap: 6,
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
        count={total ?? allBarriers.length}
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

// Tab: single glass pill tab with count badge and staggered entrance.
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
        gap: 8,
        padding: "8px 14px",
        fontSize: 13,
        fontWeight: active ? 700 : 500,
        borderRadius: AURORA.segRadius,
        border: active
          ? "1px solid transparent"
          : `1px solid ${AURORA.segBorder}`,
        background: active ? AURORA.grad : AURORA.seg,
        color: active ? "#fff" : AURORA.pillText,
        cursor: "pointer",
        boxShadow: active ? AURORA.auroraGlow : "none",
        whiteSpace: "nowrap",
        flexShrink: 0,
        transition: "all .22s var(--ease-std)",
        animation: `rowAppear .25s ${
          Math.min(index * 35, 400)
        }ms var(--ease-out) both`,
      }}
    >
      {name}
      <span
        className="tnum"
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "1px 7px",
          borderRadius: 5,
          background: active ? "rgba(255,255,255,.2)" : AURORA.pill,
          color: active ? "#fff" : AURORA.label,
        }}
      >
        {count.toLocaleString("pt-BR")}
      </span>
    </button>
  );
}
