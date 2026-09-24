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
import type { CSSProperties } from "preact";

interface BarrierRowProps {
  barrier: Barrier;
  index: number;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  onSelect: (b: Barrier) => void;
}

// BarrierRow: renders one ledger row with select checkbox, badges, and detail open.
// Entrance uses the shared .table-row-enter class (stagger via --row-delay)
// so selection toggles reuse the DOM node without replaying the animation;
// only newly mounted ids (filter/page/search/pageSize changes) animate in.
// Text cells clamp to one line and the NC slot keeps a fixed reserve so row
// heights stay stable and pageSize changes grow/shrink smoothly.
export function BarrierRow(
  { barrier: b, index: i, selected: isSel, onToggleSelect, onSelect }:
    BarrierRowProps,
) {
  const isNC = b.compliance === "Não Conforme";
  const ncDays = isNC && b.statusSince ? daysSince(b.statusSince) : 0;
  return (
    <tr
      key={b.id}
      tabIndex={0}
      className="table-row-enter"
      style={{
        ["--row-delay" as string]: `${Math.min(i * 20, 200)}ms`,
        borderBottom: `1px solid ${AURORA.rowDivider}`,
        background: isSel ? "rgba(99,102,241,.12)" : "transparent",
        cursor: "pointer",
      } as CSSProperties}
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
      {/* TAG + NC badge (NC slot reserves fixed height to keep rows stable) */}
      <td onClick={() => onSelect(b)} style={{ padding: "var(--d-cell-pad)" }}>
        <div
          className="tnum trow-ellipsis"
          style={{
            fontFamily: "var(--font-mono)",
            fontWeight: AURORA_TYPE.tag.fontWeight,
            fontSize: AURORA_TYPE.tag.fontSize,
            color: AURORA.value,
          }}
        >
          {b.tag}
        </div>
        {/* "sem contingenciamento" duration label for NC items */}
        <div className="trow-nc-slot">
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
                whiteSpace: "nowrap",
              }}
            >
              <ClockIcon size={10} color={AURORA.dangerFg} strokeWidth={2.5} />
              {humanDuration(ncDays)} sem contingenciamento
            </div>
          )}
        </div>
      </td>
      {/* Criticality */}
      <td onClick={() => onSelect(b)} style={{ padding: "var(--d-cell-pad)" }}>
        <Badge
          label={b.criticality}
          {...critColorFor(b.criticality)}
          size="sm"
        />
      </td>
      {/* Category */}
      <td
        onClick={() => onSelect(b)}
        className="trow-ellipsis"
        style={{
          padding: "var(--d-cell-pad)",
          fontSize: "var(--d-body)",
          color: "var(--text-secondary)",
        }}
      >
        {b.category}
      </td>
      {/* Typology (sheet Tipologia da Instalação) */}
      <td
        onClick={() => onSelect(b)}
        className="trow-ellipsis"
        style={{
          padding: "var(--d-cell-pad)",
          fontSize: "var(--d-body)",
          color: "var(--text-secondary)",
        }}
      >
        {b.typology}
      </td>
      {/* Owner (sheet Dono da Barreira) */}
      <td
        onClick={() => onSelect(b)}
        className="trow-ellipsis"
        style={{
          padding: "var(--d-cell-pad)",
          fontSize: "var(--d-body)",
          color: b.owner ? "var(--text-secondary)" : "var(--text-muted)",
          fontStyle: b.owner ? "normal" : "italic",
        }}
      >
        {b.owner || "Não informado"}
      </td>
      {/* Availability */}
      <td onClick={() => onSelect(b)} style={{ padding: "var(--d-cell-pad)" }}>
        <Badge label={b.availability} {...dispColorFor(b.availability)} />
      </td>
      {/* Compliance */}
      <td onClick={() => onSelect(b)} style={{ padding: "var(--d-cell-pad)" }}>
        <Badge label={b.compliance} {...confColorFor(b.compliance)} />
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
