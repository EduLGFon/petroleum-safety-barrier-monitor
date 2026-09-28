// Aurora Executive Dark KPI cards.
// This is why it exists: headline metrics plus two criticality group cards
// (critical ESO+A vs the rest), all rendered as identical glass cards in a
// single grid. The Disponíveis card was dropped (the StatusBand shows the
// same count a few pixels above), Sem plano de ação too (92.8% of rows
// lack a plan, so it never discriminated), and Total plus the Críticas NC
// aggregate dissolved into the group cards, which carry the same numbers
// with per-rank graphs inside; every dropped signal survives as a table
// filter. Only the "Não Conformes" card carries the red glow.
import { splitRankGroups } from "../lib/dashboard/criticality.ts";
import { AURORA, AURORA_TYPE, progressWidth } from "../lib/aurora.ts";
import { useEffect, useRef, useState } from "preact/hooks";
import { critColorFor } from "../lib/constants.ts";
import type { KpiSnapshot } from "../lib/types.ts";
import { fmt, pct1 } from "../lib/utils.ts";

interface Props {
  kpi: KpiSnapshot;
}
// One rank row inside a group card: total with NC count and NC-rate bar.
interface RankRow {
  label: string;
  color: string;
  total: number;
  nc: number;
}
interface C {
  label: string;
  rawNum: number;
  decimals?: number;
  isPercent?: boolean;
  sub: string;
  // Group cards carry rank rows instead of the bottom progress bar.
  rows?: RankRow[];
  share?: number;
  alert?: boolean;
  delay: number;
}

// useAnimatedValue: eases cur toward target over duration (ease-out cubic via rAF); skips when unchanged and cancels on cleanup.
function useAnimatedValue(target: number, duration = 600) {
  const [cur, setCur] = useState(target);
  const prev = useRef(target);
  const raf = useRef<number>(0);
  useEffect(() => {
    if (prev.current === target) return;
    const start = prev.current, end = target, t0 = performance.now();
    prev.current = target;
    const tick = (now: number) => {
      const p = Math.min((now - t0) / duration, 1);
      // Ease out cubic
      const e = 1 - Math.pow(1 - p, 3);
      setCur(start + (end - start) * e);
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return cur;
}

// AnimVal: pt-BR animated number with optional decimals and % suffix; bumps key on n change to retrigger the pop animation.
function AnimVal(
  { n, decimals = 0, isPercent }: {
    n: number;
    decimals?: number;
    isPercent?: boolean;
  },
) {
  const v = useAnimatedValue(n);
  const prev = useRef(n);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (prev.current !== n) {
      setKey((k) => k + 1);
      prev.current = n;
    }
  }, [n]);
  const shown = decimals > 0
    ? v.toLocaleString("pt-BR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    : fmt(Math.round(v));
  return (
    <span key={key} className="animate-num">
      {shown}
      {isPercent ? "%" : ""}
    </span>
  );
}

// RankRows: per-rank breakdown inside a group card - dot + rank, total,
// NC count, and an NC-rate bar. Pure markup over precomputed rows.
function RankRows({ rows }: { rows: RankRow[] }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 7,
        marginTop: 10,
      }}
    >
      {rows.map((r) => {
        const rate = r.total > 0 ? r.nc / r.total * 100 : 0;
        return (
          <div key={r.label} style={{ minWidth: 0 }}>
            <div
              style={{
                display: "flex",
                alignItems: "baseline",
                gap: 7,
                fontSize: 12,
              }}
            >
              <span
                aria-hidden="true"
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  background: r.color,
                  flexShrink: 0,
                  alignSelf: "center",
                }}
              />
              <span
                style={{
                  fontWeight: 700,
                  color: r.color,
                  whiteSpace: "nowrap",
                }}
              >
                {r.label}
              </span>
              <span
                className="tnum"
                style={{
                  marginLeft: "auto",
                  fontWeight: 700,
                  color: AURORA.value,
                }}
              >
                {fmt(r.total)}
              </span>
              <span
                className="tnum"
                style={{
                  fontWeight: r.nc > 0 ? 700 : 500,
                  color: r.nc > 0 ? "#ef4444" : AURORA.sub,
                  whiteSpace: "nowrap",
                }}
              >
                {fmt(r.nc)} NC
              </span>
            </div>
            <div
              style={{
                height: 3,
                borderRadius: 99,
                marginTop: 4,
                background: AURORA.track,
              }}
            >
              <div
                style={{
                  width: `${Math.max(0, Math.min(100, rate))}%`,
                  height: "100%",
                  borderRadius: 99,
                  background: r.nc > 0 ? "#ef4444" : AURORA.track,
                  transition: "width .5s var(--ease-out)",
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

// KpiGrid: glass cards from KpiSnapshot; shares divide by total||1 with one
// decimal. Criticality renders as two group cards (critical ESO+A vs the
// rest) with per-rank graphs inside.
export function KpiGrid({ kpi }: Props) {
  const t = kpi.total || 1;
  // One-decimal share of the scope total (bar widths + sub labels).
  const share1 = (v: number) => Math.round(v / t * 1000) / 10;
  // One-decimal rate within a group (NC concentration per group).
  const rate1 = (nc: number, total: number) =>
    total > 0 ? Math.round(nc / total * 1000) / 10 : 0;
  const byCrit = kpi.byCriticality ?? {};
  const ncByCrit = kpi.ncByCriticality ?? {};
  // Folds one rank group into a card: group total as value, group NC rate
  // as sub, per-rank rows with graphs inside.
  const groupOf = (entries: Array<[string, number]>) => {
    let total = 0, nc = 0;
    const rows = entries.map(([label, n]) => {
      const c = ncByCrit[label] ?? 0;
      total += n;
      nc += c;
      return {
        label,
        color: critColorFor(label).solid,
        total: n,
        nc: c,
      };
    });
    return { total, nc, rows };
  };
  const { critical: critEntries, other: otherEntries } = splitRankGroups(
    Object.entries(byCrit).filter(([, n]) => n > 0),
  );
  const crit = groupOf(critEntries);
  const rest = groupOf(otherEntries);
  const ncShare = share1(kpi.nonCompliant);
  const otherShare = share1(kpi.other ?? 0);
  const cards: C[] = [
    {
      label: "% Conformidade",
      rawNum: kpi.pctCompliant,
      decimals: 1,
      isPercent: true,
      sub: `${fmt(kpi.compliant)} conformes de ${fmt(kpi.total)}`,
      share: kpi.pctCompliant,
      delay: 0,
    },
    {
      label: "Não Conformes",
      rawNum: kpi.nonCompliant,
      sub: `${pct1(ncShare)} do inv. · ${fmt(kpi.degraded)} degrad. + ${
        fmt(kpi.unavailable)
      } indisp.`,
      share: ncShare,
      alert: true,
      delay: 50,
    },
    ...(crit.total > 0
      ? [{
        label: "Críticas ESO+A",
        rawNum: crit.total,
        sub: `${fmt(crit.nc)} NC · ${
          pct1(rate1(crit.nc, crit.total))
        } do grupo`,
        rows: crit.rows,
        alert: crit.nc > 0,
        delay: 100,
      } as C]
      : []),
    ...(rest.total > 0
      ? [{
        label: "Não Críticas",
        rawNum: rest.total,
        sub: `${fmt(rest.nc)} NC · ${
          pct1(rate1(rest.nc, rest.total))
        } do grupo`,
        rows: rest.rows,
        delay: 150,
      } as C]
      : []),
    ...((kpi.other ?? 0) > 0
      ? [{
        label: "Outros Status",
        rawNum: kpi.other ?? 0,
        sub: pct1(otherShare) + " do inv.",
        share: otherShare,
        alert: true,
        delay: 200,
      } as C]
      : []),
  ];

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit,minmax(var(--d-kpi-min),1fr))",
        gap: "var(--d-kpi-gap)",
        marginBottom: "var(--d-section)",
      }}
    >
      {cards.map((c) => (
        <div
          key={c.label}
          className="animate-card-in glass-card"
          style={{
            background: AURORA.card,
            border: `1px solid ${AURORA.cardBorder}`,
            borderRadius: AURORA.cardRadius,
            padding: "14px 16px",
            boxShadow: c.alert ? AURORA.redGlow : "none",
            minWidth: 0,
            animationDelay: `${c.delay}ms`,
          }}
        >
          <div
            style={{
              fontSize: AURORA_TYPE.kpiLabel.fontSize,
              letterSpacing: AURORA_TYPE.kpiLabel.letterSpacing,
              fontWeight: AURORA_TYPE.kpiLabel.fontWeight,
              color: AURORA.label,
              textTransform: "uppercase",
            }}
          >
            {c.label.toUpperCase()}
          </div>
          <div
            className="tnum"
            style={{
              fontFamily: "var(--font-display)",
              fontSize: AURORA_TYPE.kpiValue.fontSize,
              fontWeight: AURORA_TYPE.kpiValue.fontWeight,
              color: AURORA.value,
              letterSpacing: AURORA_TYPE.kpiValue.letterSpacing,
            }}
          >
            <AnimVal
              n={c.rawNum}
              decimals={c.decimals}
              isPercent={c.isPercent}
            />
          </div>
          <div style={{ fontSize: 12, color: AURORA.sub }}>{c.sub}</div>
          {c.rows ? <RankRows rows={c.rows} /> : c.share !== undefined && (
            <div
              style={{
                height: 3,
                borderRadius: 99,
                marginTop: 10,
                background: AURORA.track,
              }}
            >
              <div
                style={{
                  width: progressWidth(c.share),
                  height: "100%",
                  borderRadius: 99,
                  background: AURORA.grad,
                  transition: "width .7s var(--ease-out)",
                }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
