// SyncChangesList - filterable paged list for one scope.
// This is why it exists: hundreds of changed barriers need search, kind
// filter and paging instead of one long dump.
import { useSyncChangeList } from "../../hooks/dashboard/sync-change-list.ts";

import { SyncChangesSummary } from "./SyncChangesSummary.tsx";

import type { SyncChangeItem } from "../../lib/types.ts";

import { SyncChangeRow } from "./SyncChangeRow.tsx";

import { useState } from "preact/hooks";

export function SyncChangesList(
  { baseUrl, scope, runId, onOpenBarrier }: {
    baseUrl: string;
    scope: "last-run" | "last-day";
    runId?: number | null;
    onOpenBarrier?: (barrierId: number) => void;
  },
) {
  const [kind, setKind] = useState("all");
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(1);
  const list = useSyncChangeList(baseUrl, {
    scope,
    runId: runId ?? null,
    kind,
    query: debounced,
    page,
    pageSize: 25,
  }, true);

  const onSearch = (v: string) => {
    setQuery(v);
    setPage(1);
    globalThis.clearTimeout((onSearch as unknown as { t?: number }).t);
    (onSearch as unknown as { t?: number }).t = globalThis.setTimeout(
      () => setDebounced(v.trim()),
      300,
    );
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <SyncChangesSummary summary={list.summary} />
      <div style={{ display: "flex", gap: 6 }}>
        <select
          value={kind}
          aria-label="Filtrar por tipo"
          onChange={(e) => {
            setKind((e.target as HTMLSelectElement).value);
            setPage(1);
          }}
          style={{
            background: "var(--au-dialog)",
            color: "var(--au-pill-text)",
            border: "1px solid var(--au-card-border)",
            borderRadius: 8,
            padding: "4px 8px",
            fontSize: 12,
          }}
        >
          <option value="all">Todas</option>
          <option value="new">Novas</option>
          <option value="updated">Atualizadas</option>
          <option value="removed">Removidas</option>
          <option value="restored">Restauradas</option>
        </select>
        <input
          value={query}
          onInput={(e) => onSearch((e.target as HTMLInputElement).value)}
          placeholder="Buscar tag…"
          aria-label="Buscar por tag"
          style={{
            flex: 1,
            background: "var(--au-dialog)",
            color: "var(--au-pill-text)",
            border: "1px solid var(--au-card-border)",
            borderRadius: 8,
            padding: "4px 8px",
            fontSize: 12,
          }}
        />
      </div>
      {list.loading && list.items.length === 0 && (
        <div style={{ color: "var(--au-sub)", fontSize: 11 }}>
          Carregando alterações…
        </div>
      )}
      {list.error && (
        <div style={{ fontSize: 11 }}>
          <span style={{ color: "#f31260" }}>{list.error}</span>{" "}
          <button
            type="button"
            onClick={list.retry}
            style={{
              background: "transparent",
              border: 0,
              color: "var(--au-value)",
              cursor: "pointer",
              textDecoration: "underline",
              fontSize: 11,
            }}
          >
            Tentar de novo
          </button>
        </div>
      )}
      {!list.loading && !list.error && list.total === 0 && (
        <div style={{ color: "var(--au-sub)", fontSize: 11 }}>
          {scope === "last-run"
            ? "Nenhuma alteração nesta sincronização."
            : "Nenhuma alteração nas últimas 24h."}
        </div>
      )}
      {list.items.map((c: SyncChangeItem) => (
        <SyncChangeRow
          key={`${c.runId ?? scope}-${c.barrierId}`}
          item={c}
          baseUrl={baseUrl}
          runId={list.run?.id ?? runId ?? null}
          scope={scope}
          onOpenBarrier={onOpenBarrier}
        />
      ))}
      {list.totalPages > 1 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 11,
            color: "var(--au-sub)",
          }}
        >
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            style={{
              background: "transparent",
              border: "1px solid var(--au-card-border)",
              color: "var(--au-pill-text)",
              borderRadius: 8,
              padding: "4px 10px",
              cursor: page <= 1 ? "default" : "pointer",
              opacity: page <= 1 ? 0.4 : 1,
            }}
          >
            ← Anterior
          </button>
          <span>Página {page} de {list.totalPages} ({list.total})</span>
          <button
            type="button"
            disabled={page >= list.totalPages}
            onClick={() => setPage((p) => Math.min(list.totalPages, p + 1))}
            style={{
              background: "transparent",
              border: "1px solid var(--au-card-border)",
              color: "var(--au-pill-text)",
              borderRadius: 8,
              padding: "4px 10px",
              cursor: page >= list.totalPages ? "default" : "pointer",
              opacity: page >= list.totalPages ? 0.4 : 1,
            }}
          >
            Próxima →
          </button>
        </div>
      )}
    </div>
  );
}
