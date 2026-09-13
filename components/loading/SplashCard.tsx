// Splash card - brand mark plus eased progress bar for the loading splash.
// This is why it exists: isolates the glass card markup so LoadingScreen stays
// a slim composer with identical visuals and progress behavior.
import { BrandMark } from "../ui/BrandMark.tsx";
import { AURORA } from "../../lib/aurora.ts";

interface SplashCardProps {
  progress: number;
  ready: boolean;
  msg: string;
  companyName: string;
}

// SplashCard: glass brand card with staged progress bar and shimmer.
export function SplashCard(
  { progress, ready, msg, companyName }: SplashCardProps,
) {
  return (
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
  );
}
