// Barrier row - single <tr> for the barriers ledger.
// Why: isolates per-row select/detail/NC-badge render so the table frame stays lean.
import {
  confColorFor,
  critColorFor,
  dispColorFor,
} from "../../lib/constants.ts";
import { daysSince, fmtDate, humanDuration } from "../../lib/utils.ts";
import { AURORA, AURORA_TYPE } from "../../lib/aurora.ts";
import type { Barrier } from "../../lib/types.ts";
import type { ColumnKey } from "./columns.ts";
import type { CSSProperties } from "preact";
import { ClockIcon } from "../ui/Icons.tsx";
import { RowChk } from "./RowCheck.tsx";
import { Badge } from "../ui/Badge.tsx";

interface BarrierRowProps {
  barrier: Barrier;
  index: number;
  selected: boolean;
  // Ordered visible columns from the registry; cells render in this order.
  visibleCols: ColumnKey[];
  onToggleSelect: (id: number) => void;
  onSelect: (b: Barrier) => void;
}

// Shared centered cell: vertically middle + horizontally centered + shrunk
// to its content (width 1% under auto layout). TAG overrides alignment.
const tdC: CSSProperties = {
  padding: "var(--d-cell-pad)",
  textAlign: "center",
  verticalAlign: "middle",
  whiteSpace: "nowrap",
  width: "1%",
};

// BarrierRow: renders one ledger row with select checkbox, badges, and detail open.
// Entrance uses the shared .table-row-enter class (stagger via --row-delay)
// so selection toggles reuse the DOM node without replaying the animation;
// only newly mounted ids (filter/page/search/pageSize changes) animate in.
// Text cells clamp to one line and the NC slot keeps a fixed reserve so row
// heights stay stable and identical on every page.
// Centering: every cell is vertically middle + horizontally centered, except
// the TAG column which stays left-aligned for mono scannability (per UX).
export function BarrierRow(
  {
    barrier: b,
    index: i,
    selected: isSel,
    visibleCols,
    onToggleSelect,
    onSelect,
  }: BarrierRowProps,
) {
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
      <td style={tdC}>
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
      {visibleCols.map((key) => (
        <Cell key={key} col={key} barrier={b} onSelect={onSelect} />
      ))}
      {/* Arrow */}
      <td
        onClick={() => onSelect(b)}
        style={{
          padding: "var(--d-arrow-pad)",
          textAlign: "center",
          verticalAlign: "middle",
          fontSize: "var(--d-arrow)",
          color: "var(--text-muted)",
          transition: "color .15s,transform .15s",
          whiteSpace: "nowrap",
          width: "1%",
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

interface CellProps {
  col: ColumnKey;
  barrier: Barrier;
  onSelect: (b: Barrier) => void;
}

// Cell: one registry-column <td> for the row. Unknown keys render nothing
// so a corrupt visibleCols entry degrades to a missing cell, never a crash.
function Cell({ col, barrier: b, onSelect }: CellProps) {
  switch (col) {
    case "id":
      return (
        <td
          onClick={() => onSelect(b)}
          style={{
            ...tdC,
            fontSize: "var(--d-body)",
            color: AURORA.sub,
            fontWeight: 600,
          }}
        >
          {b.id}
        </td>
      );
    case "tag": {
      const isNC = b.compliance === "Não Conforme";
      const ncDays = isNC && b.statusSince ? daysSince(b.statusSince) : 0;
      return (
        <td
          onClick={() => onSelect(b)}
          style={{
            padding: "var(--d-cell-pad)",
            textAlign: "left",
            verticalAlign: "middle",
            whiteSpace: "nowrap",
          }}
        >
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
                <ClockIcon
                  size={10}
                  color={AURORA.dangerFg}
                  strokeWidth={2.5}
                />
                {humanDuration(ncDays)} sem contingenciamento
              </div>
            )}
          </div>
        </td>
      );
    }
    case "typology":
      return (
        <td
          onClick={() => onSelect(b)}
          className="trow-ellipsis"
          style={{
            ...tdC,
            fontSize: "var(--d-body)",
            color: "var(--text-secondary)",
          }}
        >
          {b.typology}
        </td>
      );
    case "location":
      return (
        <td
          onClick={() => onSelect(b)}
          className="tnum trow-ellipsis"
          style={{
            ...tdC,
            fontSize: "var(--d-body)",
            fontWeight: 700,
            color: "var(--text-secondary)",
          }}
        >
          {b.location}
        </td>
      );
    case "criticality":
      return (
        <td onClick={() => onSelect(b)} style={tdC}>
          <Badge
            label={b.criticality}
            {...critColorFor(b.criticality)}
            size="sm"
          />
        </td>
      );
    case "category":
      return (
        <td
          onClick={() => onSelect(b)}
          className="trow-ellipsis"
          style={{
            ...tdC,
            fontSize: "var(--d-body)",
            color: "var(--text-secondary)",
          }}
        >
          {b.category}
        </td>
      );
    case "owner":
      return (
        <td
          onClick={() => onSelect(b)}
          className="trow-ellipsis"
          style={{
            ...tdC,
            fontSize: "var(--d-body)",
            color: b.owner ? "var(--text-secondary)" : "var(--text-muted)",
            fontStyle: b.owner ? "normal" : "italic",
          }}
        >
          {b.owner || "Não informado"}
        </td>
      );
    case "availability":
      return (
        <td onClick={() => onSelect(b)} style={tdC}>
          <Badge label={b.availability} {...dispColorFor(b.availability)} />
        </td>
      );
    case "compliance":
      return (
        <td onClick={() => onSelect(b)} style={tdC}>
          <Badge label={b.compliance} {...confColorFor(b.compliance)} />
        </td>
      );
    case "statusSince":
      return (
        <td
          onClick={() => onSelect(b)}
          className="tnum"
          style={{
            ...tdC,
            fontSize: "var(--d-body)",
            color: b.statusSince
              ? "var(--text-secondary)"
              : "var(--text-muted)",
          }}
        >
          {b.statusSince ? fmtDate(b.statusSince) : "-"}
        </td>
      );
    default:
      return null;
  }
}
