// ExportMenu - icon-only export button with a format dropdown.
// This is why it exists: the toolbar keeps two side-by-side icon buttons
// (columns + export) with no text labels; this one opens a small menu with
// the existing Excel / PDF / CSV actions. Export scope is unchanged: CSV
// covers the full filtered selection (server-streamed in server mode),
// XLS/PDF stay page-local. The menu closes on outside click or Escape,
// matching the dialog/menu dismissal used elsewhere in the app.
import { exportToCSV, exportToExcel, exportToPDF } from "../../lib/export.ts";

import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { type Fmt, FMTS } from "./ExportButtons.tsx";

import type { Barrier } from "../../lib/types.ts";

import { DownloadIcon } from "../ui/Icons.tsx";

import { AURORA } from "../../lib/aurora.ts";

import { fmt } from "../../lib/utils.ts";

interface Props {
  selectedIds: Set<number>;
  allFiltered: Barrier[];
  // Current page slice: XLS/PDF export only the selected rows on this
  // page, while CSV covers the full filtered selection. Defaults to
  // allFiltered when the caller has no separate page (server mode).
  pageRows?: Barrier[];
  companyName: string;
  // Server mode pages from the API: xls/pdf cover only the current page,
  // while CSV streams the full filtered set from the server (onServerCsv).
  serverMode?: boolean;
  onServerCsv?: () => Promise<void>;
}

// ExportMenu: icon-only button + independent format menu; owns the same
// export actions (and loading/error handling) the inline buttons had.
export function ExportMenu(
  {
    selectedIds,
    allFiltered,
    pageRows,
    companyName,
    serverMode,
    onServerCsv,
  }: Props,
) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<Fmt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Full filtered selection (CSV scope) vs page-local selection (XLS/PDF
  // scope). Stale ids outside the filter are ignored, as before.
  const fullExportable = useMemo(
    () => allFiltered.filter((b) => selectedIds.has(b.id)),
    [allFiltered, selectedIds],
  );
  const pageList = pageRows ?? allFiltered;
  const pageExportable = useMemo(
    () => pageList.filter((b) => selectedIds.has(b.id)),
    [pageList, selectedIds],
  );
  const count = fullExportable.length;
  const pageCount = pageExportable.length;
  const empty = count === 0;

  // Outside click or Escape closes while open.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // doExport: same scope contract as before (CSV full, xls/pdf page-local;
  // server CSV streams from the endpoint). Returns success so the menu can
  // close on completion while staying open to surface failures inline.
  async function doExport(kind: Fmt): Promise<boolean> {
    if (empty || loading) return false;
    const name = `barreiras-${new Date().toISOString().slice(0, 10)}`;
    setLoading(kind);
    setError(null);
    try {
      if (kind === "xls") {
        await exportToExcel(pageExportable, name, companyName);
      }
      if (kind === "pdf") await exportToPDF(pageExportable, name, companyName);
      if (kind === "csv") {
        if (serverMode && onServerCsv) await onServerCsv();
        else exportToCSV(fullExportable, name);
      }
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao exportar");
      return false;
    } finally {
      setLoading(null);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", flexShrink: 0 }}>
      <button
        type="button"
        onClick={() => (empty ? undefined : setOpen((v) => !v))}
        disabled={empty}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Exportar"
        title={empty ? "Selecione linhas para exportar" : "Exportar"}
        className="lift"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "var(--d-input-y) var(--d-input-x)",
          background: AURORA.seg,
          border: `1px solid ${AURORA.segBorder}`,
          borderRadius: 10,
          color: AURORA.pillText,
          cursor: empty ? "default" : "pointer",
          opacity: empty ? 0.4 : 1,
          whiteSpace: "nowrap",
        }}
      >
        <DownloadIcon size={14} color={AURORA.sub} />
      </button>
      {open && !empty && (
        <div
          role="menu"
          aria-label="Formatos de exportação"
          className="animate-fade-in"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 4px)",
            zIndex: 900,
            minWidth: 190,
            padding: 4,
            background: AURORA.dialog,
            backdropFilter: "blur(16px) saturate(1.25)",
            WebkitBackdropFilter: "blur(16px) saturate(1.25)",
            border: `1px solid ${AURORA.segBorder}`,
            borderRadius: 10,
            boxShadow: "0 12px 32px rgba(0,0,0,.35)",
          }}
        >
          <div
            className="tnum"
            style={{
              padding: "6px 10px 4px",
              fontSize: "var(--d-micro)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              color: AURORA.sub,
              whiteSpace: "nowrap",
            }}
          >
            Exportar {fmt(count)}
          </div>
          {FMTS.map(({ key, Icon, label, ext, color }) => (
            <button
              type="button"
              key={key}
              role="menuitem"
              onClick={async () => {
                if (await doExport(key)) setOpen(false);
              }}
              disabled={!!loading}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "var(--d-mini-gap)",
                width: "100%",
                boxSizing: "border-box",
                padding: "6px 10px",
                fontSize: "var(--d-body)",
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
              <span style={{ fontSize: "var(--d-micro)", opacity: 0.6 }}>
                {ext}
              </span>
            </button>
          ))}
          {error && (
            <div
              role="alert"
              onClick={() => setError(null)}
              title="Clique para dispensar"
              style={{
                padding: "6px 10px 2px",
                fontSize: "var(--d-small)",
                color: "#f87171",
                cursor: "pointer",
              }}
            >
              {error}
            </div>
          )}
          <div
            role="note"
            data-page-export-note
            className="tnum"
            style={{
              padding: "6px 10px 4px",
              fontSize: "var(--d-micro)",
              color: AURORA.sub,
              whiteSpace: "normal",
            }}
          >
            CSV abrange o conjunto filtrado ({fmt(count)}); XLS/PDF somente a
            página atual ({fmt(pageCount)})
          </div>
        </div>
      )}
    </div>
  );
}
