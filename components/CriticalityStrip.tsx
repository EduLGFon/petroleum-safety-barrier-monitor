// Criticality rank panel - per-rank totals with NC counts and NC rates.
// This is why it exists: the ranked ESO > A > B > C > D model needs more
// than glanceable totals - each rank shows how many barriers it holds, how
// many are non-compliant, and at what rate, so risk concentrates visually
// without opening the table. The snapshot carries dynamic byCriticality +
// ncByCriticality buckets; this only orders (canonical ranks first, novel
// labels after by volume) and paints each row with its rank color. When the
// NC bucket is absent (old servers) rows fall back to totals only.
import { critColorFor } from "../lib/constants.ts";
import { fmt, pct1 } from "../lib/utils.ts";
import { AURORA } from "../lib/aurora.ts";

// Canonical rank order; anything unknown sorts after by count so future
// ranks never hide or break the panel.
const RANK_ORDER = ["ESO", "A", "B", "C", "D"];

// orderRankEntries: canonical ranks first, novel labels after by volume.
// Pure (no DOM) so the ordering contract is unit-testable.
export function orderRankEntries(
  entries: Array<[string, number]>,
): Array<[string, number]> {
  const rank = (label: string): number => {
    const known = RANK_ORDER.indexOf(label);
    return known === -1 ? RANK_ORDER.length : known;
  };
  return [...entries].sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1]);
}

export function CriticalityStrip(
  { byCriticality, ncByCriticality }: {
    byCriticality?: Record<string, number>;
    ncByCriticality?: Record<string, number>;
  },
) {
  const entries = orderRankEntries(
    Object.entries(byCriticality ?? {}).filter(([, n]) => n > 0),
  );
  if (entries.length === 0) return null;
  return (
    <div
      aria-label="Barreiras por criticidade"
      className="glass-card"
      style={{
        background: AURORA.card,
        border: `1px solid ${AURORA.cardBorder}`,
        borderRadius: AURORA.cardRadius,
        padding: "12px 16px",
        marginBottom: "var(--d-section)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontWeight: 800,
          color: AURORA.label,
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          marginBottom: 8,
        }}
      >
        Criticidade · totais e não conformes
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(min(210px,100%),1fr))",
          gap: "8px 20px",
        }}
      >
        {entries.map(([label, n]) => {
          const c = critColorFor(label);
          const nc = ncByCriticality?.[label] ?? 0;
          const rate = n > 0 ? nc / n * 100 : 0;
          return (
            <div
              key={label}
              title={`${fmt(n)} barreiras de criticidade ${label}, ${
                fmt(nc)
              } não conformes`}
              style={{ minWidth: 0 }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    background: c.solid,
                    flexShrink: 0,
                    alignSelf: "center",
                  }}
                />
                <span
                  style={{
                    fontSize: 12,
                    fontWeight: 700,
                    color: c.solid,
                    whiteSpace: "nowrap",
                  }}
                >
                  {label}
                </span>
                <span
                  className="tnum"
                  style={{
                    marginLeft: "auto",
                    fontSize: 13,
                    fontWeight: 700,
                    color: AURORA.value,
                  }}
                >
                  {fmt(n)}
                </span>
                {ncByCriticality !== undefined && (
                  <span
                    className="tnum"
                    style={{
                      fontSize: 12,
                      fontWeight: nc > 0 ? 700 : 500,
                      color: nc > 0 ? "#ef4444" : AURORA.sub,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {fmt(nc)} NC · {pct1(rate)}
                  </span>
                )}
              </div>
              {ncByCriticality !== undefined && (
                <div
                  style={{
                    height: 3,
                    borderRadius: 99,
                    marginTop: 5,
                    background: AURORA.track,
                  }}
                >
                  <div
                    style={{
                      width: `${Math.max(0, Math.min(100, rate))}%`,
                      height: "100%",
                      borderRadius: 99,
                      background: nc > 0 ? "#ef4444" : AURORA.track,
                      transition: "width .5s var(--ease-out)",
                    }}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
