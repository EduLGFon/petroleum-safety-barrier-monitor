// Trust footer - session reassurance line under the login form.
// This is why it exists: one shared strip (company plus protected
// session) so the login never drifts from the brand promise.
import { AURORA, AURORA_TYPE } from "../../lib/aurora.ts";

// TrustFooter: live-dot plus company and protected-session marker.
export function TrustFooter({ companyName = "" }: { companyName?: string }) {
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
      {companyName ? `${companyName} · ` : ""}Sessão protegida
    </div>
  );
}
