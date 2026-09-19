// Login brand header - wave mark plus company eyebrow and hero title.
// This is why it exists: one brand lockup shared by production login and
// all seven static concepts, so the logo hierarchy never drifts.
import { AURORA, AURORA_TYPE } from "../../lib/aurora.ts";
import { BrandMark } from "../ui/BrandMark.tsx";

interface P {
  companyName?: string;
  markSize?: number;
  title?: string;
  subtitle?: string;
}

// BrandHeader: centered logo, uppercase eyebrow, thin display title.
export function BrandHeader(
  {
    companyName = "",
    markSize = 60,
    title = "Monitor de Barreiras",
    subtitle = "Segurança operacional em tempo real",
  }: P,
) {
  return (
    <div style={{ textAlign: "center" }}>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginBottom: 16,
          filter: "drop-shadow(0 4px 20px rgba(99,102,241,.35))",
        }}
      >
        <BrandMark variant="adaptive" height={markSize} light />
      </div>
      {companyName && (
        <div
          style={{
            fontSize: AURORA_TYPE.eyebrow.fontSize,
            fontWeight: AURORA_TYPE.eyebrow.fontWeight,
            letterSpacing: AURORA_TYPE.eyebrow.letterSpacing,
            background: AURORA.grad,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          {companyName}
        </div>
      )}
      <div
        className="font-display"
        style={{
          fontSize: 24,
          fontWeight: 300,
          letterSpacing: "-.02em",
          color: AURORA.value,
          lineHeight: 1.2,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontSize: 13,
          color: AURORA.sub,
          marginTop: 6,
          lineHeight: 1.5,
        }}
      >
        {subtitle}
      </div>
    </div>
  );
}
