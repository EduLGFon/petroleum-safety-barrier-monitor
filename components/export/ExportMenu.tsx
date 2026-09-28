// ExportMenu - icon-only export button with a format dropdown.
// This is why it exists: the toolbar keeps two side-by-side icon buttons
// (columns + export) with no text labels; this one opens a small menu with
// the existing Excel / PDF / CSV actions. Every format covers the whole
// selection and never just the loaded page, and every format downloads as a
// file - no preview step, so a large selection cannot freeze the tab. In
// server mode the rows come from /api/export (streamed, so a cross-page
// selection of 18k barriers exports completely), in client mode from the
// in-memory list. The dropdown portals to document.body (like FilterSelect
// and ColumnsMenu) because the animated section and the table card both trap
// stacking contexts, so a nested menu would paint under the rows.
import { exportToCSV, exportToPDF, exportToXlsx } from "../../lib/export.ts";

import { useEffect, useMemo, useRef, useState } from "preact/hooks";

import { FMTS } from "./ExportButtons.tsx";

import type { Barrier } from "../../lib/types.ts";

import { DownloadIcon } from "../ui/Icons.tsx";

import type { Fmt } from "../../lib/export/format.ts";

import { AURORA } from "../../lib/aurora.ts";

import { createPortal } from "preact/compat";

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
  // Fixed-position anchor for the portalled dropdown: the trigger's right
  // edge and bottom edge in viewport coordinates (translateX(-100%) right-
  // aligns the panel, so it never leaves the viewport near the right side).
  const [anchor, setAnchor] = useState({ left: 0, top: 0 });
  const wrapRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

  // Measures the trigger into the portal anchor. Called while opening (so the
  // panel never paints a frame at 0,0) and again while open (page scroll and
  // resize), rAF-throttled with an equality guard so a fling issues at most
  // one update per frame and identical rects skip the render.
  function place(): void {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const next = { left: Math.round(r.right), top: Math.round(r.bottom + 4) };
    setAnchor((prev) =>
      prev.left === next.left && prev.top === next.top ? prev : next
    );
  }

  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(place);
    };
    globalThis.addEventListener("scroll", onScroll, { passive: true });
    globalThis.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      globalThis.removeEventListener("scroll", onScroll);
      globalThis.removeEventListener("resize", onScroll);
    };
  }, [open]);

  // Outside click or Escape closes while open. The dropdown is portalled, so
  // the trigger wrapper and the panel are both "inside" - otherwise a click
  // on a format would close the menu before its own handler ran.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        wrapRef.current?.contains(target) || menuRef.current?.contains(target)
      ) {
        return;
      }
      setOpen(false);
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
        if (kind === "xlsx") {
          await exportToXlsx(exportable, name, companyName);
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
        ref={btnRef}
        type="button"
        onClick={() => {
          if (empty) return;
          place();
          setOpen((v) => !v);
        }}
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
      {open && !empty && typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              left: `${anchor.left}px`,
              top: `${anchor.top}px`,
              // Right-aligned to the trigger: the panel grows leftwards.
              transform: "translateX(-100%)",
              zIndex: 900,
            }}
          >
            <div
              role="menu"
              aria-label="Formatos de exportação"
              className="animate-fade-in"
              style={{
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
                Todos os formatos exportam as {fmt(count)}{" "}
                barreiras selecionadas
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
