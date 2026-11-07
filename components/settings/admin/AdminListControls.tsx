// AdminListControls - shared search, selection summary, and bulk buttons.
// Why it exists: every admin list needs the same PT search field and tri-state
// page selection without importing the dashboard filter machinery. Later
// pages compose these controls around Pagination and their own rows.
import type { AdminListKey } from "../../../hooks/useAdminList.ts";

import { CloseIcon, SearchIcon } from "../../ui/Icons.tsx";

import { TriCheck } from "../../export/TriCheck.tsx";

import type { ComponentChildren } from "preact";

import { AURORA } from "../../../lib/aurora.ts";

import { fmt } from "../../../lib/utils.ts";

interface SearchProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  ariaLabel?: string;
  disabled?: boolean;
}

// AdminSearchInput: premium search field with icon and clear affordance.
export function AdminSearchInput(
  {
    value,
    onChange,
    placeholder = "Buscar...",
    ariaLabel,
    disabled = false,
  }: SearchProps,
) {
  return (
    <div
      style={{
        position: "relative",
        display: "flex",
        alignItems: "center",
        flex: "1 1 220px",
        minWidth: 0,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          position: "absolute",
          left: 10,
          display: "flex",
          pointerEvents: "none",
        }}
      >
        <SearchIcon size={13} color={AURORA.label} />
      </span>
      <input
        type="search"
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        aria-label={ariaLabel ?? placeholder}
        autoComplete="off"
        spellcheck={false}
        onInput={(event) => onChange(event.currentTarget.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "8px 32px 8px 31px",
          fontSize: "var(--d-body)",
          background: AURORA.seg,
          border: `1px solid ${AURORA.segBorder}`,
          borderRadius: 9,
          color: AURORA.pillText,
          outline: "none",
          opacity: disabled ? 0.55 : 1,
        }}
      />
      {value !== "" && (
        <button
          type="button"
          aria-label="Limpar busca"
          onClick={() => onChange("")}
          style={{
            position: "absolute",
            right: 5,
            display: "flex",
            padding: 5,
            border: "none",
            background: "transparent",
            color: "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          <CloseIcon size={12} color="var(--text-muted)" strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

interface SelectionProps {
  pageIds: AdminListKey[];
  selectedIds: ReadonlySet<AdminListKey>;
  total: number;
  onSelectPage: () => void;
  onSelectAll: () => void;
  onClearAll: () => void;
  children?: ComponentChildren;
}

const linkSt = {
  background: "transparent",
  border: "none",
  padding: 0,
  fontSize: "var(--d-small)",
  fontWeight: 600,
  color: "var(--accent)",
  cursor: "pointer",
  textDecoration: "underline",
  textUnderlineOffset: 2,
  whiteSpace: "nowrap",
} as const;

// AdminSelectionBar: tri-state page checkbox plus result/selection summary.
// A full page offers extension to every filtered row; a full filtered set
// offers the inline clear link, mirroring the dashboard table semantics.
export function AdminSelectionBar(
  {
    pageIds,
    selectedIds,
    total,
    onSelectPage,
    onSelectAll,
    onClearAll,
    children,
  }: SelectionProps,
) {
  const selectedOnPage = pageIds.reduce<number>(
    (count, id) => count + (selectedIds.has(id) ? 1 : 0),
    0,
  );
  const allPageSelected = pageIds.length > 0 &&
    selectedOnPage === pageIds.length;
  const somePageSelected = selectedOnPage > 0 && !allPageSelected;
  const allFilteredSelected = total > 0 &&
    selectedIds.size === total &&
    pageIds.length > 0 &&
    pageIds.every((id) => selectedIds.has(id));
  const selectedCount = selectedIds.size;

  const togglePage = () => {
    if (pageIds.length === 0) return;
    if (allPageSelected) onClearAll();
    else onSelectPage();
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "var(--d-opt-gap)",
        flexWrap: "wrap",
        padding: "0 4px",
        minWidth: 0,
      }}
    >
      <span
        title={allFilteredSelected
          ? "Toda a seleção filtrada ativa - limpar tudo"
          : allPageSelected
          ? "Limpar seleção"
          : "Selecionar todos desta página"}
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <TriCheck
          checked={allPageSelected}
          indeterminate={somePageSelected}
          variant={allFilteredSelected ? "full" : "page"}
          onChange={togglePage}
        />
      </span>

      {selectedCount === 0
        ? (
          <span
            className="tnum"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 5,
              fontSize: "var(--d-body)",
              color: AURORA.sub,
              whiteSpace: "nowrap",
            }}
          >
            {fmt(total)} resultado{total === 1 ? "" : "s"}
          </span>
        )
        : allFilteredSelected
        ? (
          <span
            className="tnum"
            role="status"
            style={{
              fontSize: "var(--d-small)",
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            {fmt(selectedCount)} selecionada
            {selectedCount === 1 ? "" : "s"}
            {" · "}
            <button type="button" onClick={onClearAll} style={linkSt}>
              Limpar
            </button>
          </span>
        )
        : allPageSelected && selectedCount < total
        ? (
          <span
            className="tnum"
            role="status"
            style={{
              fontSize: "var(--d-small)",
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            {fmt(selectedCount)} selecionada
            {selectedCount === 1 ? "" : "s"}
            {" · "}
            <button type="button" onClick={onSelectAll} style={linkSt}>
              Selecionar todas as {fmt(total)}
            </button>
          </span>
        )
        : (
          <span
            className="tnum"
            role="status"
            style={{
              fontSize: "var(--d-small)",
              color: "var(--text-muted)",
              whiteSpace: "nowrap",
            }}
          >
            {fmt(selectedCount)} selecionada
            {selectedCount === 1 ? "" : "s"}
          </span>
        )}

      {children && (
        <span
          style={{
            display: "flex",
            gap: 6,
            flexWrap: "wrap",
            marginLeft: "auto",
            minWidth: 0,
          }}
        >
          {children}
        </span>
      )}
    </div>
  );
}

interface BulkButtonProps {
  children: ComponentChildren;
  onClick: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger";
  type?: "button" | "submit";
}

// AdminBulkButton: compact action button for the selection bar and dialogs.
export function AdminBulkButton(
  {
    children,
    onClick,
    disabled = false,
    tone = "default",
    type = "button",
  }: BulkButtonProps,
) {
  const primary = tone === "primary";
  const danger = tone === "danger";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={primary ? "lift" : undefined}
      style={{
        padding: "5px 11px",
        fontSize: "var(--d-small)",
        fontWeight: 700,
        borderRadius: "var(--d-chip-radius)",
        cursor: disabled ? "not-allowed" : "pointer",
        opacity: disabled ? 0.5 : 1,
        whiteSpace: "nowrap",
        border: primary
          ? "none"
          : `1.5px solid ${danger ? "rgba(239,68,68,.35)" : "var(--border)"}`,
        background: primary
          ? "linear-gradient(90deg,var(--accent),var(--accent-2))"
          : danger
          ? "rgba(239,68,68,.07)"
          : "transparent",
        color: primary ? "#fff" : danger ? "#ef4444" : "var(--text-secondary)",
        boxShadow: primary ? "0 4px 14px var(--glow)" : "none",
      }}
    >
      {children}
    </button>
  );
}
