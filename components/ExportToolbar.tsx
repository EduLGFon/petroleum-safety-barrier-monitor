// Export toolbar - Aurora glass selection/export bar.
// This is why it exists: row selection needs a visible anchor and the
// export actions need one home; idle and active states share the same
// glass bar language as the rest of the identity.
import { exportToCSV, exportToExcel, exportToPDF } from "../lib/export.ts";
import type { FunctionComponent } from "preact";
import type { Barrier } from "../lib/types.ts";
import { useState } from "preact/hooks";
import { AURORA } from "../lib/aurora.ts";
import {
  CloseIcon,
  DownloadIcon,
  FilePdfIcon,
  FileSpreadsheetIcon,
  FileTextIcon,
} from "./ui/Icons.tsx";
interface Props {
  selectedIds: Set<number>;
  allFiltered: Barrier[];
  onSelectAll: () => void;
  onClearAll: () => void;
  companyName: string;
}
type Fmt = "xls" | "pdf" | "csv";
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
export function ExportToolbar(
  { selectedIds, allFiltered, onSelectAll, onClearAll, companyName }: Props,
) {
  const [loading, setLoading] = useState<Fmt | null>(null);
  const count = selectedIds.size, hasAny = count > 0;
  const allSel = count === allFiltered.length && allFiltered.length > 0,
    someSel = count > 0 && !allSel;
  async function doExport(fmt: Fmt) {
    if (!hasAny || loading) return;
    const bs = allFiltered.filter((b) => selectedIds.has(b.id));
    const name = `barreiras-${new Date().toISOString().slice(0, 10)}`;
    setLoading(fmt);
    try {
      if (fmt === "xls") await exportToExcel(bs, name, companyName);
      if (fmt === "pdf") await exportToPDF(bs, name, companyName);
      if (fmt === "csv") exportToCSV(bs, name);
    } finally {
      setLoading(null);
    }
  }
  return (
    <div
      className="glass-card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--d-bar-gap)",
        flexWrap: "wrap",
        padding: "var(--d-bar-pad)",
        marginBottom: "var(--d-bar-gap)",
        background: AURORA.data,
        border: hasAny
          ? "1px solid rgba(99,102,241,.4)"
          : `1px solid ${AURORA.dataBorder}`,
        borderRadius: AURORA.dataRadius,
        boxShadow: hasAny ? AURORA.auroraGlow : "none",
        transition: "all .25s var(--ease-std)",
      }}
    >
      {/* Checkbox + label */}
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--d-check-gap)",
          cursor: "pointer",
        }}
      >
        <Chk
          checked={allSel}
          indeterminate={someSel}
          onChange={() => allSel ? onClearAll() : onSelectAll()}
        />
        <span
          className="tnum"
          style={{
            fontSize: "var(--d-body)",
            fontWeight: 600,
            color: AURORA.pillText,
            whiteSpace: "nowrap",
          }}
        >
          {allSel
            ? `${allFiltered.length.toLocaleString("pt-BR")} selecionados`
            : someSel
            ? `${count.toLocaleString("pt-BR")} de ${
              allFiltered.length.toLocaleString("pt-BR")
            }`
            : "Selecionar todos"}
        </span>
      </label>
      {someSel && (
        <button
          type="button"
          onClick={onClearAll}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--d-gap-2xs)",
            fontSize: "var(--d-small)",
            padding: "var(--d-mini-pad)",
            borderRadius: 6,
            background: "transparent",
            border: `1px solid ${AURORA.dataBorder}`,
            color: AURORA.label,
            cursor: "pointer",
            transition: "all .2s",
          }}
        >
          <CloseIcon size={11} color={AURORA.label} />Limpar
        </button>
      )}
      <div style={{ flex: 1 }} />
      {hasAny
        ? (
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
                onClick={() => doExport(key)}
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
        )
        : (
          <span
            style={{
              fontSize: "var(--d-small)",
              color: AURORA.sub,
              fontStyle: "italic",
            }}
          >
            Selecione itens para exportar
          </span>
        )}
    </div>
  );
}
function Chk(
  { checked, indeterminate, onChange }: {
    checked: boolean;
    indeterminate: boolean;
    onChange: () => void;
  },
) {
  const a = checked || indeterminate;
  return (
    <div
      onClick={onChange}
      style={{
        width: "var(--d-chk)",
        height: "var(--d-chk)",
        borderRadius: 4,
        flexShrink: 0,
        border: a
          ? "2px solid var(--accent)"
          : `2px solid ${AURORA.dataBorder}`,
        background: a ? AURORA.grad : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        cursor: "pointer",
        transition: "all .18s var(--ease-std)",
        boxShadow: a ? AURORA.auroraGlow : "none",
      }}
    >
      {checked && (
        <svg width="8" height="6" viewBox="0 0 8 6" fill="none">
          <path
            d="M1 3L3 5L7 1"
            stroke="white"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
      {indeterminate && (
        <div
          style={{ width: 8, height: 2, background: "white", borderRadius: 1 }}
        />
      )}
    </div>
  );
}
