// Splash card - brand mark plus eased progress bar for the loading splash.
// This is why it exists: isolates the glass card markup so LoadingScreen stays
// a slim composer with identical visuals and progress behavior.
import { BrandMark } from "../ui/BrandMark.tsx";

interface SplashCardProps {
  progress: number;
  ready: boolean;
  msg: string;
  companyName: string;
}

// SplashCard: glass brand card with staged progress bar and shimmer.
// Every var() carries a fallback matching the comfortable/dark reference
// so first paint (before styles.css loads) already has the final metrics:
// no transparent card, no font-size/padding pop, no width growth.
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
        boxSizing: "border-box",
        // Fixed width reserves the final layout: the card no longer grows
        // to fit the title once fonts/tokens arrive.
        width: "min(92vw, 400px)",
        padding: "var(--d-splash-pad, 48px 56px)",
        background: "var(--au-card, rgba(255,255,255,.06))",
        border: "1px solid var(--au-card-border, rgba(255,255,255,.1))",
        borderRadius: "var(--d-splash-radius, 24px)",
        boxShadow: "0 32px 80px rgba(0,0,0,.55)",
        flexShrink: 0,
        animation:
          "scaleIn .45s var(--ease-out, cubic-bezier(0.16,1,0.3,1)) both",
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
          marginBottom: "var(--d-splash-gap, 30px)",
          filter: "drop-shadow(0 4px 20px rgba(99,102,241,.35))",
        }}
      >
        <BrandMark variant="adaptive" height={76} light />
      </div>

      {/* Brand text */}
      <div style={{ textAlign: "center", marginBottom: 6, maxWidth: "100%" }}>
        {companyName && (
          <div
            style={{
              fontSize: "var(--d-micro, 10px)",
              fontWeight: 800,
              letterSpacing: "0.2em",
              textTransform: "uppercase",
              marginBottom: "var(--d-opt-gap, 8px)",
              background:
                "linear-gradient(90deg,var(--accent, #6366f1),var(--accent-2, #22d3ee))",
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
            fontFamily:
              'var(--font-sans, "Inter Tight","Inter",system-ui,sans-serif)',
            fontSize: "var(--d-band-num, 20px)",
            fontWeight: 800,
            letterSpacing: "-0.025em",
            color: "var(--au-value, #ffffff)",
            lineHeight: 1.25,
            // Reserve exactly the two explicit lines so the swap from
            // fallback to webfont never reflows, and keep words from
            // wrapping mid-phrase on narrow viewports.
            minHeight: "2.5em",
            textWrap: "balance",
            overflowWrap: "break-word",
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
          margin: "var(--d-splash-div, 24px) 0",
          background:
            "linear-gradient(90deg,transparent,var(--glow, rgba(99,102,241,.35)),transparent)",
        }}
      />

      {/* Progress */}
      <div style={{ width: "100%" }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            fontSize: "var(--d-caption, 11px)",
            fontWeight: 600,
            color: "var(--au-sub, #64748b)",
            letterSpacing: "0.06em",
            marginBottom: "var(--d-opt-gap, 8px)",
          }}
        >
          <span
            style={{
              transition: "all .3s",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {msg}
          </span>
          <span
            className="tnum"
            style={{
              color: ready ? "#34d399" : "var(--au-sub, #64748b)",
              transition: "color .3s",
              flexShrink: 0,
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
            background: "var(--au-track, rgba(255,255,255,.1))",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: "100%",
              width: `${progress}%`,
              background:
                "linear-gradient(90deg,var(--accent, #6366f1),var(--accent-2, #22d3ee))",
              borderRadius: 2,
              transition: "width .07s linear",
              boxShadow: "var(--glow, rgba(99,102,241,.35))",
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
