// Login shell - full-screen Aurora backdrop plus centered container.
// This is why it exists: every login concept shares one mesh canvas
// (grid + orb + page gradient) so the gallery and production stay identical.
import type { ComponentChildren } from "preact";
import { AURORA } from "../../lib/aurora.ts";

// LoginShell: fixed mesh backdrop with centered content slot.
export function LoginShell({ children }: { children: ComponentChildren }) {
  return (
    <div
      style={{
        position: "relative",
        minHeight: "100dvh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "32px 18px 56px",
        background: AURORA.page,
        backgroundColor: AURORA.pageBase,
        overflow: "clip",
      }}
    >
      <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            backgroundImage:
              "linear-gradient(rgba(99,102,241,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(99,102,241,.06) 1px,transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "radial-gradient(ellipse 90% 70% at 50% 30%,black 30%,transparent 75%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 90% 70% at 50% 30%,black 30%,transparent 75%)",
          }}
        />
        <div
          style={{
            position: "absolute",
            top: "18%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            width: 720,
            height: 720,
            maxWidth: "120vw",
            borderRadius: "50%",
            background:
              "radial-gradient(circle,rgba(99,102,241,.14) 0%,rgba(34,211,238,.06) 40%,transparent 65%)",
            animation: "orb 9s ease-in-out infinite",
          }}
        />
      </div>
      <div
        style={{
          position: "relative",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {children}
      </div>
    </div>
  );
}
