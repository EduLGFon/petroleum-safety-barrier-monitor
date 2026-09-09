// Barriers table - Aurora glass ledger.
// This is why it exists: the tabular inventory itself; rows read as dark
// list items (mono tag, dim location, glass pills) while
// sorting, selection and pagination keep working underneath.
import type { Barrier, FilterState, SortableColumn } from "../lib/types.ts";
import { ChevronDownIcon, ChevronUpIcon, SortIcon } from "./ui/Icons.tsx";
import { BarrierRow } from "./table/BarrierRow.tsx";
import { Pagination } from "./table/Pagination.tsx";
import { COLS, thSt } from "./table/columns.ts";
import { AURORA } from "../lib/aurora.ts";

interface Props {
  rows: Barrier[];
  filters: FilterState;
  filteredTotal: number;
  totalPages: number;
  selectedIds: Set<number>;
  onToggleSelect: (id: number) => void;
  onSort: (c: SortableColumn) => void;
  onPageChange: (p: number) => void;
  onPageSize: (n: number) => void;
  onSelect: (b: Barrier) => void;
}

// BarriersTable: renders the current page slice (rows) with sort headers, row select, and detail open; Pagination only shows when totalPages > 1.
export function BarriersTable(
  {
    rows,
    filters,
    filteredTotal,
    totalPages,
    selectedIds,
    onToggleSelect,
    onSort,
    onPageChange,
    onPageSize,
    onSelect,
  }: Props,
) {
  return (
    <div>
      <div
        className="glass-card"
        style={{
          background: AURORA.data,
          border: `1px solid ${AURORA.dataBorder}`,
          borderRadius: AURORA.dataRadius,
          overflow: "hidden",
          marginBottom: "var(--d-stack-sm)",
        }}
      >
        <div style={{ overflowX: "auto" }}>
          <table
            style={{ width: "100%", borderCollapse: "collapse", minWidth: 720 }}
          >
            <thead>
              <tr>
                <th style={{ ...thSt, width: 44, cursor: "default" }} />
                {COLS.map((c) => (
                  <th
                    key={c.col}
                    onClick={() => onSort(c.col)}
                    style={{
                      ...thSt,
                      width: c.w,
                      color: filters.sortCol === c.col
                        ? "var(--accent)"
                        : "var(--text-muted)",
                    }}
                  >
                    {c.label}
                    {filters.sortCol === c.col
                      ? filters.sortDir === "asc"
                        ? (
                          <ChevronUpIcon
                            size={12}
                            color="var(--accent)"
                            strokeWidth={2.5}
                          />
                        )
                        : (
                          <ChevronDownIcon
                            size={12}
                            color="var(--accent)"
                            strokeWidth={2.5}
                          />
                        )
                      : (
                        <SortIcon
                          size={11}
                          color="var(--border)"
                          strokeWidth={2}
                        />
                      )}
                  </th>
                ))}
                <th style={{ ...thSt, width: 40, cursor: "default" }} />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0
                ? (
                  <tr>
                    <td
                      colSpan={COLS.length + 2}
                      style={{
                        padding: "var(--d-empty-pad)",
                        textAlign: "center",
                        color: "var(--text-muted)",
                        fontSize: "var(--d-lead)",
                      }}
                    >
                      Nenhuma barreira encontrada.
                    </td>
                  </tr>
                )
                : rows.map((b, i) => (
                  <BarrierRow
                    key={b.id}
                    barrier={b}
                    index={i}
                    selected={selectedIds.has(b.id)}
                    onToggleSelect={onToggleSelect}
                    onSelect={onSelect}
                  />
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {totalPages > 1 && (
        <Pagination
          page={filters.page}
          totalPages={totalPages}
          total={filteredTotal}
          pageSize={filters.pageSize}
          onChange={onPageChange}
          onPageSize={onPageSize}
        />
      )}
    </div>
  );
}
