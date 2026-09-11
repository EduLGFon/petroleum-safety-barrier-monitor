// Barrier row - single <tr> for the barriers ledger.
// Why: isolates per-row select/detail/NC-badge render so the table frame stays lean.
import {
  confColorFor,
  critColorFor,
  dispColorFor,
} from "../../lib/constants.ts";
import { daysSince, humanDuration } from "../../lib/utils.ts";
import { AURORA, AURORA_TYPE } from "../../lib/aurora.ts";
import type { Barrier } from "../../lib/types.ts";
import { ClockIcon } from "../ui/Icons.tsx";
import { Badge } from "../ui/Badge.tsx";
import { RowChk } from "./RowCheck.tsx";

interface BarrierRowProps {
  barrier: Barrier;
  index: number;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  onSelect: (b: Barrier) => void;
}

// BarrierRow: renders one ledger row with select checkbox, badges, and detail open.
export function BarrierRow(
  { barrier: b, index: i, selected: isSel, onToggleSelect, onSelect }:
    BarrierRowProps,
) {
  const isNC = b.conformidade === "Não Conforme";
  const ncDays = isNC && b.statusSince ? daysSince(b.statusSince) : 0;
  return (
    <tr
      key={b.id}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect(b);
        }
      }}
      style={{
        borderBottom: `1px solid ${AURORA.rowDivider}`,
        background: isSel ? "rgba(99,102,241,.12)" : "transparent",
        cursor: "pointer",
        transition: "background .15s var(--ease-std)",
        animation: `rowAppear .22s ${
          Math.min(i * 18, 280)
        }ms var(--ease-out) both`,
      }}
      onMouseEnter={(e) => {
        if (!isSel) {
          (e.currentTarget as HTMLTableRowElement).style.background =
            "var(--bg-hover)";
        }
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLTableRowElement).style.background = isSel
          ? "rgba(99,102,241,.12)"
          : "transparent";
      }}
    >
      {/* Checkbox */}
      <td style={{ padding: "var(--d-cell-pad)" }}>
        <label
          className="trow-chk-label"
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <input
            type="checkbox"
            checked={isSel}
            onChange={() => onToggleSelect(b.id)}
            aria-label={`Selecionar ${b.tag}`}
            style={{
              position: "absolute",
              opacity: 0,
              width: 1,
              height: 1,
              overflow: "hidden",
              clip: "rect(0 0 0 0)",
            }}
          />
          <RowChk checked={isSel} />
        </label>
      </td>
      {/* # */}
      <td
        onClick={() => onSelect(b)}
        style={{
          padding: "var(--d-cell-pad)",
          fontSize: "var(--d-body)",
          color: AURORA.sub,
          fontWeight: 600,
        }}
      >
        {b.id}
      </td>
      {/* TAG + NC badge */}
      <td onClick={() => onSelect(b)} style={{ padding: "var(--d-cell-pad)" }}>
        <div
          className="tnum"
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: AURORA_TYPE.tag.fontWeight,
            fontSize: AURORA_TYPE.tag.fontSize,
            color: AURORA.value,
          }}
        >
          {b.tag}
        </div>
        <div style={{ fontSize: 12, color: AURORA.loc, marginTop: 2 }}>
          {b.locDesc}
        </div>
        {/* "X tempo sem contingenciamento" for NC items */}
        {isNC && b.statusSince && (
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--d-mini-gap)",
              marginTop: "var(--d-gap-xs)",
              padding: "var(--d-nc-pad)",
              background: AURORA.dangerBg,
              borderRadius: 7,
              fontSize: "var(--d-caption)",
              fontWeight: 600,
              color: AURORA.dangerFg,
            }}
          >
            <ClockIcon size={10} color={AURORA.dangerFg} strokeWidth={2.5} />
            {humanDuration(ncDays)} sem contingenciamento
          </div>
        )}
      </td>
      {/* Criticidade */}
      <td onClick={() => onSelect(b)} style={{ padding: "var(--d-cell-pad)" }}>
        <Badge
          label={b.criticidade}
          {...critColorFor(b.criticidade)}
          size="sm"
        />
      </td>
      {/* Categoria */}
      <td
        onClick={() => onSelect(b)}
        style={{
          padding: "var(--d-cell-pad)",
          fontSize: "var(--d-body)",
          color: "var(--text-secondary)",
        }}
      >
        {b.categoria}
      </td>
      {/* Disponibilidade */}
      <td onClick={() => onSelect(b)} style={{ padding: "var(--d-cell-pad)" }}>
        <Badge label={b.disponibilidade} {...dispColorFor(b.disponibilidade)} />
      </td>
      {/* Conformidade */}
      <td onClick={() => onSelect(b)} style={{ padding: "var(--d-cell-pad)" }}>
        <Badge label={b.conformidade} {...confColorFor(b.conformidade)} />
      </td>
      {/* Arrow */}
      <td
        onClick={() => onSelect(b)}
        style={{
          padding: "var(--d-arrow-pad)",
          textAlign: "center",
          fontSize: "var(--d-arrow)",
          color: "var(--text-muted)",
          transition: "color .15s,transform .15s",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLTableCellElement).style.color =
            "var(--accent)";
          (e.currentTarget as HTMLTableCellElement).style.transform =
            "translateX(2px)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLTableCellElement).style.color =
            "var(--text-muted)";
          (e.currentTarget as HTMLTableCellElement).style.transform = "none";
        }}
      >
        ›
      </td>
    </tr>
  );
}
