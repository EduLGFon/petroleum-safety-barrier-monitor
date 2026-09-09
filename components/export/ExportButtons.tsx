// ExportButtons - FMTS array plus format buttons block with spinner.
// This is why it exists: the toolbar shell stays lean while format buttons and loading state live in one reusable block.
import {
  DownloadIcon,
  FilePdfIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
} from "../ui/Icons.tsx";
import type { FunctionComponent } from "preact";
import { AURORA } from "../../lib/aurora.ts";
export type Fmt = "xls" | "pdf" | "csv";
type I = FunctionComponent<
  { size?: number; color?: string; strokeWidth?: number }
>;
const FMTS: { key: Fmt; Icon: I; label: string; ext: string; color: string }[] =
  [
    {
      key: "xls",
      Icon: FileSpreadsheetIcon,
      label: "Excel",
      ext: ".xls",
      color: "#34d399",
    },
    {
      key: "pdf",
      Icon: FilePdfIcon,
      label: "PDF",
      ext: ".pdf",
      color: "#f87171",
    },
    {
      key: "csv",
      Icon: FileTextIcon,
      label: "CSV",
      ext: ".csv",
      color: "#6366f1",
    },
  ];
// ExportButtons: renders header count plus FMTS buttons; shows spinner on the active format.
export function ExportButtons(
  { count, loading, onExport }: {
    count: number;
    loading: Fmt | null;
    onExport: (fmt: Fmt) => void | Promise<void>;
  },
) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--d-gap-xs)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--d-mini-gap)",
          marginRight: 4,
        }}
      >
        <DownloadIcon size={13} color={AURORA.label} />
        <span
          className="tnum"
          style={{
            fontSize: "var(--d-body)",
            color: AURORA.label,
            whiteSpace: "nowrap",
          }}
        >
          Exportar {count.toLocaleString("pt-BR")}:
        </span>
      </div>
      {FMTS.map(({ key, Icon, label, ext, color }) => (
        <button
          type="button"
          key={key}
          onClick={() => onExport(key)}
          disabled={!!loading}
          className="lift"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--d-mini-gap)",
            padding: "var(--d-btn-pad)",
            fontSize: "var(--d-small)",
            fontWeight: 700,
            borderRadius: 7,
            cursor: loading ? "wait" : "pointer",
            border: `1px solid ${color}55`,
            background: `${color}1a`,
            color,
            opacity: loading && loading !== key ? 0.4 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {loading === key
            ? (
              <span
                style={{
                  animation: "pulse 1s infinite",
                  fontSize: "var(--d-small)",
                  display: "inline-block",
                  width: 13,
                  height: 13,
                  borderRadius: "50%",
                  border: "2px solid currentColor",
                  borderTopColor: "transparent",
                  animationDuration: ".7s",
                  animationName: "spin",
                }}
              />
            )
            : <Icon size={14} color={color} strokeWidth={2} />}
          {label}
          <span style={{ fontSize: "var(--d-micro)", opacity: .6 }}>
            {ext}
          </span>
        </button>
      ))}
    </div>
  );
}
