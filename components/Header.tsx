import { BrandMark } from "./ui/BrandMark.tsx";
import { ShieldIcon } from "./ui/Icons.tsx";

interface Props {
  onOpenSettings: () => void;
}

function GearIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="rgba(255,255,255,0.85)"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z" />
      <path d="M12 14a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

export function Header({ onOpenSettings }: Props) {
  return (
    <header
      style={{
        background: "var(--hero-grad)",
        borderRadius: "var(--d-hero-radius)",
        padding: "var(--d-hero-pad)",
        marginBottom: "var(--d-section)",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "var(--d-gap-lg)",
        flexWrap: "wrap",
        position: "relative",
        overflow: "hidden",
        boxShadow: "var(--shadow-md)",
        animation: "cardAppear .35s var(--ease-out) both",
      }}
    >
      {/* Decoration */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          overflow: "hidden",
          pointerEvents: "none",
        }}
      >
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(59,130,246,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(59,130,246,.04) 1px,transparent 1px)",
            backgroundSize: "36px 36px",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: -60,
            right: 60,
            width: 240,
            height: 240,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(59,130,246,.18) 0%,transparent 70%)",
            animation: "orb 10s ease-in-out infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: -40,
            right: 300,
            width: 160,
            height: 160,
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(124,58,237,.12) 0%,transparent 70%)",
            animation: "orb 7s ease-in-out 3s infinite",
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 1,
            background:
              "linear-gradient(90deg,transparent,var(--accent),var(--accent-2),transparent)",
          }}
        />
      </div>

      {/* Brand */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--d-hero-gap)",
          position: "relative",
        }}
      >
        <BrandMark variant="icon" height={44} light />
        <div
          style={{
            width: 1,
            height: "var(--d-hero-div)",
            background: "rgba(255,255,255,.12)",
            flexShrink: 0,
          }}
        />
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "var(--d-gap-xs)",
              marginBottom: "var(--d-gap-2xs)",
            }}
          >
            <ShieldIcon
              size={11}
              color="rgba(96,165,250,.8)"
              strokeWidth={2.5}
            />
            <span
              style={{
                fontSize: "var(--d-tiny)",
                fontWeight: 800,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                background: "linear-gradient(90deg,#60a5fa,#a78bfa)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              Sistema de Segurança Operacional
            </span>
          </div>
          <h1
            style={{
              margin: 0,
              fontSize: "var(--d-hero)",
              fontWeight: 900,
              color: "#fff",
              letterSpacing: "-0.025em",
              lineHeight: 1.15,
              textShadow: "0 2px 12px rgba(0,0,0,.35)",
            }}
          >
            Monitor de Barreiras de Segurança
          </h1>
        </div>
      </div>

      {/* Right */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--d-gap)",
          position: "relative",
          flexWrap: "wrap",
        }}
      >
        <div
          style={{
            textAlign: "right",
            fontSize: "var(--d-caption)",
            color: "rgba(148,163,184,.8)",
            lineHeight: 1.7,
          }}
        >
          <div
            style={{
              fontFamily: 'ui-monospace,"Cascadia Code",monospace',
              letterSpacing: "0.05em",
              fontSize: "var(--d-micro)",
            }}
          >
            Todas as Concessões
          </div>
          <div>
            {new Date().toLocaleDateString("pt-BR", {
              day: "2-digit",
              month: "2-digit",
              year: "numeric",
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={onOpenSettings}
          className="lift"
          title="Configurações"
          style={{
            width: "var(--d-gear)",
            height: "var(--d-gear)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(255,255,255,.1)",
            border: "1px solid rgba(255,255,255,.15)",
            borderRadius: "var(--d-row-radius)",
            cursor: "pointer",
            backdropFilter: "blur(4px)",
          }}
        >
          <GearIcon />
        </button>
      </div>
    </header>
  );
}
