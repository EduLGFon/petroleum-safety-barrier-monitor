// Blurred backdrop - mock dashboard skeleton behind the login card.
// This is why it exists: the immersive login floats over a blurred,
// non-interactive preview of the monitor so the product shows through.
import { AURORA } from "../../lib/aurora.ts";

const TILES = [
  "Total 312",
  "Conformidade 94%",
  "NC 18",
  "Disponíveis 271",
  "Turno B",
  "Alertas 2",
];

// BlurredBackdrop: blurred skeleton grid, hidden from assistive tech.
export function BlurredBackdrop() {
  return (
    <div
      aria-hidden="true"
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3,1fr)",
        gap: 10,
        filter: "blur(10px)",
        opacity: 0.55,
        pointerEvents: "none",
        userSelect: "none",
      }}
    >
      {TILES.map((t) => (
        <div
          key={t}
          style={{
            background: AURORA.card,
            border: `1px solid ${AURORA.cardBorder}`,
            borderRadius: 12,
            padding: "18px 14px",
            color: AURORA.sub,
            fontSize: 12,
            whiteSpace: "nowrap",
            overflow: "hidden",
          }}
        >
          {t}
        </div>
      ))}
    </div>
  );
}
