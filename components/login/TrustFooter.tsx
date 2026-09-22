// Trust footer - session reassurance line under the login form.
// This is why it exists: one shared strip so the login shows a consistent
// protected-session marker with no brand copy.
import { AURORA, AURORA_TYPE } from "../../lib/aurora.ts";

// TrustFooter: padlock plus protected-session marker, no company name.
export function TrustFooter() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        flexWrap: "wrap",
        fontSize: AURORA_TYPE.kpiLabel.fontSize,
        letterSpacing: ".08em",
        color: AURORA.sub,
        textTransform: "uppercase",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: 99,
          background: "#34d399",
          boxShadow: "0 0 8px #34d399",
        }}
      />
      🔒 Sessão protegida
    </div>
  );
}
