// Splash background - Aurora mesh grid plus ambient orb glow layer.
// This is why it exists: isolates the fixed backdrop decoration from the card
// so the splash composer stays slim with no visual change.

// SplashBackground: fixed grid + ambient orb behind the splash card.
export function SplashBackground() {
  return (
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
  );
}
