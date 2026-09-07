// Aurora Executive Dark KPI cards.
// This is why it exists: six live metrics rendered as identical glass
// cards (label / value / sub / signature-gradient progress). Only the
// "Não Conformes" card carries the red glow.
import { useEffect, useRef, useState } from "preact/hooks";
import { AURORA, AURORA_TYPE, progressWidth } from "../lib/aurora.ts";
import type { KpiSnapshot } from "../lib/types.ts";
import { fmt, pct } from "../lib/utils.ts";

interface Props {
  kpi: KpiSnapshot;
  location: string;
}
interface C {
  label: string;
  rawNum: number;
  isPercent?: boolean;
  sub: string;
  share?: number;
  alert?: boolean;
  delay: number;
}

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
      setCur(Math.round(start + (end - start) * e));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);
  return cur;
}

function AnimVal({ n, isPercent }: { n: number; isPercent?: boolean }) {
  const v = useAnimatedValue(n);
  const prev = useRef(n);
  const [key, setKey] = useState(0);
  useEffect(() => {
    if (prev.current !== n) {
      setKey((k) => k + 1);
      prev.current = n;
    }
  }, [n]);
  return (
    <span key={key} className="animate-num">
      {v.toLocaleString("pt-BR")}
      {isPercent ? "%" : ""}
    </span>
  );
}

export function KpiGrid({ kpi, location }: Props) {
  const t = kpi.total || 1;
  const loc = location === "ALL" ? "total geral" : `em ${location}`;
  const dispShare = Math.round(kpi.disponivel / t * 100);
  const ncShare = Math.round(kpi.naoConforme / t * 100);
  const contShare = Math.round((kpi.indispCont + kpi.degrCont) / t * 100);
  const cards: C[] = [
    {
      label: "Total de Barreiras",
      rawNum: kpi.total,
      sub: loc,
      share: 100,
      delay: 0,
    },
    {
      label: "Disponíveis",
      rawNum: kpi.disponivel,
      sub: pct(dispShare) + " do inv.",
      share: dispShare,
      delay: 50,
    },
    {
      label: "Não Conformes",
      rawNum: kpi.naoConforme,
      sub: pct(ncShare) + " do inv.",
      share: ncShare,
      alert: true,
      delay: 100,
    },
    {
      label: "Contingenciadas",
      rawNum: kpi.indispCont + kpi.degrCont,
      sub: "Ind. + Degr. contingenciadas",
      share: contShare,
      delay: 150,
    },
    {
      label: "% Conformidade",
      rawNum: kpi.pctConforme,
      isPercent: true,
      sub: fmt(kpi.conforme) + " conformes",
      share: kpi.pctConforme,
      delay: 200,
    },
    {
      label: "Críticas NC",
      rawNum: kpi.criticasNC,
      sub: "Críticas não conformes",
      alert: kpi.criticasNC > 0,
      delay: 250,
    },
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
            <AnimVal n={c.rawNum} isPercent={c.isPercent} />
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
  );
}
