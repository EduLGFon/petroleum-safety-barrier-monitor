// Loading screen - Aurora mesh splash shown while the island hydrates.
// This is why it exists: covers first paint with progress until onDone,
// already dressed in the interface identity so there is no visual pop.
import { useCallback, useEffect, useState } from "preact/hooks";
import { AURORA } from "../lib/aurora.ts";
import { BrandMark } from "./ui/BrandMark.tsx";

interface Props {
  onDone: () => void;
  companyName: string;
}

export function LoadingScreen({ onDone, companyName }: Props) {
  const [progress, setProgress] = useState(0);
  const [ready, setReady] = useState(false);
  const [exit, setExit] = useState(false);

  const done = useCallback(onDone, [onDone]);

  useEffect(() => {
    const steps = 55, dur = 1500;
    let step = 0;
    const id = setInterval(() => {
      step++;
      const t = step / steps;
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      setProgress(Math.round(e * 100));
      if (step >= steps) {
        clearInterval(id);
        setReady(true);
        setTimeout(() => {
          setExit(true);
          setTimeout(done, 550);
        }, 300);
      }
    }, dur / steps);
    return () => clearInterval(id);
  }, [done]);

  const msg = progress < 35
    ? "Inicializando…"
    : progress < 65
    ? "Carregando inventário…"
    : progress < 90
    ? "Processando métricas…"
    : "Concluído";

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: AURORA.page,
        backgroundColor: AURORA.pageBase,
        opacity: exit ? 0 : 1,
        transition: "opacity .55s cubic-bezier(0.4,0,1,1)",
        pointerEvents: exit ? "none" : "auto",
      }}
    >
      {/* Background */}
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(59,130,246,0.04) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,0.04) 1px,transparent 1px)",
            backgroundSize: "48px 48px",
            opacity: 0.6,
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "40%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            width: 640,
            height: 640,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(37,99,235,.07) 0%,transparent 60%)",
            animation: "orb 9s ease-in-out infinite",
          }}
        />
      </div>

      {/* Card */}
      <div
        className="glass-card"
        style={{
          position: "relative",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "var(--d-splash-pad)",
          background: AURORA.card,
          border: `1px solid ${AURORA.cardBorder}`,
          borderRadius: "var(--d-splash-radius)",
          boxShadow: "0 32px 80px rgba(0,0,0,.55)",
          minWidth: 360,
          animation: "scaleIn .45s var(--ease-out) both",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: "8%",
            right: "8%",
            height: 1,
            background:
              "linear-gradient(90deg,transparent,rgba(99,102,241,.5),rgba(34,211,238,.4),transparent)",
            borderRadius: 1,
          }}
        />

        {/* Logo */}
        <div
          style={{
            marginBottom: "var(--d-splash-gap)",
            filter: "drop-shadow(0 4px 20px rgba(99,102,241,.35))",
          }}
        >
          <BrandMark variant="adaptive" height={76} light />
        </div>

        {/* Brand text */}
        <div style={{ textAlign: "center", marginBottom: 6 }}>
          {companyName && (
            <div
              style={{
                fontSize: "var(--d-micro)",
                fontWeight: 800,
                letterSpacing: "0.2em",
                textTransform: "uppercase",
                marginBottom: "var(--d-opt-gap)",
                background:
                  "linear-gradient(90deg,var(--accent),var(--accent-2))",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              {companyName}
            </div>
          )}
          <div
            style={{
              fontSize: "var(--d-band-num)",
              fontWeight: 800,
              letterSpacing: "-0.025em",
              color: AURORA.value,
              lineHeight: 1.25,
            }}
          >
            Monitor de Barreiras<br />de Segurança
          </div>
        </div>

        {/* Divider */}
        <div
          style={{
            width: "100%",
            height: 1,
            margin: "var(--d-splash-div) 0",
            background:
              "linear-gradient(90deg,transparent,var(--glow),transparent)",
          }}
        />

        {/* Progress */}
        <div style={{ width: "100%" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontSize: "var(--d-caption)",
              fontWeight: 600,
              color: AURORA.sub,
              letterSpacing: "0.06em",
              marginBottom: "var(--d-opt-gap)",
            }}
          >
            <span style={{ transition: "all .3s" }}>{msg}</span>
            <span
              className="tnum"
              style={{
                color: ready ? "#34d399" : AURORA.sub,
                transition: "color .3s",
              }}
            >
              {progress}%
            </span>
          </div>
          <div
            style={{
              width: "100%",
              height: 4,
              borderRadius: 2,
              background: AURORA.track,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${progress}%`,
                background: AURORA.grad,
                borderRadius: 2,
                transition: "width .07s linear",
                boxShadow: AURORA.auroraGlow,
                position: "relative",
              }}
            >
              {progress < 100 && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background:
                      "linear-gradient(90deg,transparent 30%,rgba(255,255,255,.3) 50%,transparent 70%)",
                    backgroundSize: "200% 100%",
                    animation: "shimmer 1.4s linear infinite",
                  }}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          position: "absolute",
          bottom: 24,
          fontSize: "var(--d-micro)",
          color: AURORA.sub,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          animation: "fadeInFast .8s .4s both",
        }}
      >
        {companyName
          ? `${companyName} · Segurança Operacional`
          : "Segurança Operacional"}
      </div>
    </div>
  );
}
