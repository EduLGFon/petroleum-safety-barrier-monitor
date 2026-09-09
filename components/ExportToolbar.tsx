// Export toolbar - Aurora glass selection/export bar.
// This is why it exists: row selection needs a visible anchor and the
// export actions need one home; idle and active states share the same
// glass bar language as the rest of the identity.
import { exportToCSV, exportToExcel, exportToPDF } from "../lib/export.ts";
import { ExportButtons, type Fmt } from "./export/ExportButtons.tsx";
import { TriCheck } from "./export/TriCheck.tsx";
import { useMemo, useState } from "preact/hooks";
import type { Barrier } from "../lib/types.ts";
import { CloseIcon } from "./ui/Icons.tsx";
import { AURORA } from "../lib/aurora.ts";
interface Props {
  selectedIds: Set<number>;
  allFiltered: Barrier[];
  onSelectAll: () => void;
  onClearAll: () => void;
  companyName: string;
}
// ExportToolbar: selection bar over selectedIds + allFiltered; derives all/some-selected tri-state and shows format buttons only when a row is selected.
export function ExportToolbar(
  { selectedIds, allFiltered, onSelectAll, onClearAll, companyName }: Props,
) {
  const [loading, setLoading] = useState<Fmt | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Rows actually present in the current filter (selection can go stale when
  // filters narrow, so the label and export use matched rows, not raw ids).
  const exportable = useMemo(
    () => allFiltered.filter((b) => selectedIds.has(b.id)),
    [allFiltered, selectedIds],
  );
  const count = exportable.length, hasAny = count > 0;
  const allSel = count === allFiltered.length && allFiltered.length > 0,
    someSel = count > 0 && !allSel;
  // doExport: exports matched rows; surfaces failures inline instead of
  // silently clearing the spinner (previous try/finally had no catch).
  async function doExport(fmt: Fmt) {
    if (!hasAny || loading) return;
    const bs = exportable;
    const name = `barreiras-${new Date().toISOString().slice(0, 10)}`;
    setLoading(fmt);
    setError(null);
    try {
      if (fmt === "xls") await exportToExcel(bs, name, companyName);
      if (fmt === "pdf") await exportToPDF(bs, name, companyName);
      if (fmt === "csv") exportToCSV(bs, name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao exportar");
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
        <TriCheck
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
          <ExportButtons
            count={count}
            loading={loading}
            onExport={doExport}
          />
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
      {error && (
        <div
          role="alert"
          onClick={() => setError(null)}
          title="Clique para dispensar"
          style={{
            flexBasis: "100%",
            fontSize: "var(--d-small)",
            color: "#f87171",
            cursor: "pointer",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
