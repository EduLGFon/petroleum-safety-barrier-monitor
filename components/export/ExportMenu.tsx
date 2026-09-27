// ExportMenu - icon-only export button with a format dropdown.
// This is why it exists: the toolbar keeps two side-by-side icon buttons
// (columns + export) with no text labels; this one opens a small menu with
// the existing Excel / PDF / CSV actions. Every format covers the whole
// selection and never just the loaded page: in server mode the rows come
// from /api/export (streamed, so a cross-page selection of 18k barriers
// exports completely), in client mode from the in-memory list. The menu
// closes on outside click or Escape, matching the dismissal used elsewhere.
import { exportToCSV, exportToExcel, exportToPDF } from "../../lib/export.ts";

import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { FMTS } from "./ExportButtons.tsx";

import type { Barrier } from "../../lib/types.ts";

import { DownloadIcon } from "../ui/Icons.tsx";

import type { Fmt } from "../../lib/export/format.ts";

import { AURORA } from "../../lib/aurora.ts";

import { fmt } from "../../lib/utils.ts";

interface Props {
  selectedIds: Set<number>;
  allFiltered: Barrier[];
  companyName: string;
  // Server mode pages from the API: every format is served by
  // /api/export over the whole selection (onServerExport).
  serverMode?: boolean;
  onServerExport?: (
    kind: Fmt,
    ids: number[],
    filename: string,
  ) => Promise<void>;
}

// ExportMenu: icon-only button + independent format menu; owns the export
// actions (and loading/error handling) the inline buttons had.
export function ExportMenu(
  {
    selectedIds,
    allFiltered,
    companyName,
    serverMode,
    onServerExport,
  }: Props,
) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState<Fmt | null>(null);
  const [error, setError] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Client mode: the selected rows of the in-memory filtered list, which is
  // the whole scope there. Server mode: the selection itself, because it can
  // span pages this browser never loaded - the server resolves the ids.
  const exportable = useMemo(
    () => allFiltered.filter((b) => selectedIds.has(b.id)),
    [allFiltered, selectedIds],
  );
  const ids = useMemo(() => [...selectedIds], [selectedIds]);
  const count = serverMode ? ids.length : exportable.length;
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

  // doExport: every format exports the whole selection, either from the
  // server (streamed) or from the in-memory list. Returns success so the menu
  // closes on completion while staying open to surface failures inline.
  async function doExport(kind: Fmt): Promise<boolean> {
    if (empty || loading) return false;
    const name = `barreiras-${new Date().toISOString().slice(0, 10)}`;
    setLoading(kind);
    setError(null);
    try {
      if (serverMode && onServerExport) {
        await onServerExport(kind, ids, name);
      } else {
        if (kind === "xls") {
          await exportToExcel(exportable, name, companyName);
        }
        if (kind === "pdf") {
          await exportToPDF(exportable, name, companyName);
        }
        if (kind === "csv") exportToCSV(exportable, name);
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
            data-export-scope-note
            className="tnum"
            style={{
              padding: "6px 10px 4px",
              fontSize: "var(--d-micro)",
              color: AURORA.sub,
              whiteSpace: "normal",
            }}
          >
            Todos os formatos exportam as {fmt(count)} barreiras selecionadas
          </div>
        </div>
      )}
    </div>
  );
}
