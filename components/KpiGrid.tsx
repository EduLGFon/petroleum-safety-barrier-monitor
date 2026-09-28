// Aurora Executive Dark KPI cards.
// This is why it exists: five live metrics rendered as identical glass
// cards (label / value / sub / signature-gradient progress) plus a
// per-rank criticality panel. The Disponíveis card was dropped (the
// StatusBand shows the same count a few pixels above) and Sem plano de
// ação too (92.8% of rows lack a plan, so it never discriminated); both
// signals survive as table filters. Only the "Não Conformes" card carries
// the red glow.
import { AURORA, AURORA_TYPE, progressWidth } from "../lib/aurora.ts";
import { CriticalityStrip } from "./CriticalityStrip.tsx";
import { useEffect, useRef, useState } from "preact/hooks";
import type { KpiSnapshot } from "../lib/types.ts";
import { fmt, pct1 } from "../lib/utils.ts";

interface Props {
  kpi: KpiSnapshot;
}
interface C {
  label: string;
  rawNum: number;
  decimals?: number;
  isPercent?: boolean;
  sub: string;
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

// KpiGrid: glass cards from KpiSnapshot; shares divide by total||1 with one
// decimal, contingency card sums contingencyOutage + degradedContingency.
export function KpiGrid({ kpi }: Props) {
  const t = kpi.total || 1;
  // One-decimal share of the scope total (bar widths + sub labels).
  const share1 = (v: number) => Math.round(v / t * 1000) / 10;
  const byCrit = kpi.byCriticality ?? {};
  const ncByCrit = kpi.ncByCriticality ?? {};
  const criticalTotal = (byCrit["ESO"] ?? 0) + (byCrit["A"] ?? 0);
  const ncEso = ncByCrit["ESO"] ?? 0;
  const ncA = ncByCrit["A"] ?? 0;
  const ncShare = share1(kpi.nonCompliant);
  const cont = kpi.contingencyOutage + kpi.degradedContingency;
  const otherShare = share1(kpi.other ?? 0);
  const cards: C[] = [
    {
      label: "Total de Barreiras",
      rawNum: kpi.total,
      sub: `${fmt(criticalTotal)} críticas ESO+A`,
      share: 100,
      delay: 0,
    },
    {
      label: "% Conformidade",
      rawNum: kpi.pctCompliant,
      decimals: 1,
      isPercent: true,
      sub: `${fmt(kpi.compliant)} conformes de ${fmt(kpi.total)}`,
      share: kpi.pctCompliant,
      delay: 50,
    },
    {
      label: "Não Conformes",
      rawNum: kpi.nonCompliant,
      sub: `${pct1(ncShare)} do inv. · ${fmt(kpi.degraded)} degrad. + ${
        fmt(kpi.unavailable)
      } indisp.`,
      share: ncShare,
      alert: true,
      delay: 100,
    },
    {
      label: "Críticas NC",
      rawNum: kpi.criticalNonCompliant,
      sub: `${fmt(ncEso)} ESO · ${fmt(ncA)} A`,
      share: share1(kpi.criticalNonCompliant),
      alert: kpi.criticalNonCompliant > 0,
      delay: 150,
    },
    {
      label: "Contingenciadas",
      rawNum: cont,
      sub: `${fmt(kpi.contingencyOutage)} indisp. + ${
        fmt(kpi.degradedContingency)
      } degrad.`,
      share: share1(cont),
      delay: 200,
    },
    ...((kpi.other ?? 0) > 0
      ? [{
        label: "Outros Status",
        rawNum: kpi.other ?? 0,
        sub: pct1(otherShare) + " do inv.",
        share: otherShare,
        alert: true,
        delay: 250,
      } as C]
      : []),
  ];

  return (
    <>
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
            {c.share !== undefined && (
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
      <CriticalityStrip
        byCriticality={kpi.byCriticality}
        ncByCriticality={kpi.ncByCriticality}
      />
    </>
  );
}
