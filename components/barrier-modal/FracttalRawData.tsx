// FracttalRawData - on-demand raw upstream data panel for DEV inspection.
// This is why it exists: admins can inspect the unmodified Fracttal fields
// without changing the normal barrier detail presentation.
import { adminApi, AdminApiError } from "../../lib/api/admin-client.ts";
import type { Barrier } from "../../lib/types.ts";

import { useState } from "preact/hooks";

interface RawDetail {
  asset: unknown;
  workOrders: {
    rows: unknown[];
    upstreamTotal: number;
    pagesFetched: number;
    excludedRows: number;
    truncated: boolean;
  };
  workRequests: {
    rows: unknown[];
    upstreamTotal: number;
    pagesFetched: number;
    excludedRows: number;
    truncated: boolean;
  };
}

function isRawRelatedRows(value: unknown): value is RawDetail["workOrders"] {
  if (typeof value !== "object" || value === null) return false;
  const rows = value as Record<string, unknown>;
  return Array.isArray(rows.rows) &&
    typeof rows.upstreamTotal === "number" &&
    typeof rows.pagesFetched === "number" &&
    typeof rows.excludedRows === "number" &&
    typeof rows.truncated === "boolean";
}

function isRawDetail(value: unknown): value is RawDetail {
  if (typeof value !== "object" || value === null) return false;
  const detail = value as Record<string, unknown>;
  return "asset" in detail &&
    isRawRelatedRows(detail.workOrders) &&
    isRawRelatedRows(detail.workRequests);
}

export function FracttalRawData({ barrier }: { barrier: Barrier }) {
  const [detail, setDetail] = useState<RawDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function loadRawData() {
    setLoading(true);
    setError("");
    try {
      const payload = await adminApi(
        `/api/barriers/${barrier.id}/fracttal-raw`,
      );
      if (!isRawDetail(payload)) {
        setError("O Fracttal retornou uma resposta em formato inesperado.");
        setDetail(null);
        return;
      }
      setDetail(payload);
    } catch (err) {
      if (err instanceof AdminApiError && err.status === 429) {
        setError(
          "Limite de consultas atingido. Aguarde antes de tentar novamente.",
        );
      } else if (err instanceof AdminApiError && err.status > 0) {
        setError(
          `Não foi possível carregar os dados brutos (HTTP ${err.status}${
            err.requestId ? `, solicitação ${err.requestId}` : ""
          }).`,
        );
      } else {
        setError("Falha de conexão ao carregar os dados brutos do Fracttal.");
      }
      setDetail(null);
    } finally {
      setLoading(false);
    }
  }

  const truncated = !!detail &&
    (detail.workOrders.truncated || detail.workRequests.truncated);
  return (
    <section
      style={{
        margin: "var(--d-block-gap) 0",
        padding: "var(--d-row-pad)",
        border: "1px dashed var(--border)",
        borderRadius: "var(--d-row-radius)",
      }}
    >
      <button
        type="button"
        disabled={loading || !barrier.externalCode}
        onClick={loadRawData}
        style={{
          border: "1px solid var(--border)",
          borderRadius: "var(--d-input-radius)",
          padding: "var(--d-sel-pad)",
          color: "var(--text-primary)",
          background: "var(--bg-elevated)",
          cursor: loading ? "wait" : "pointer",
        }}
      >
        {loading
          ? "Consultando Fracttal..."
          : "Consultar dados brutos do Fracttal"}
      </button>
      {!barrier.externalCode && (
        <p style={{ color: "var(--text-muted)" }}>
          Esta barreira não possui código Fracttal.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {detail && (
        <>
          <p style={{ color: "var(--text-muted)" }}>
            Resposta bruta do ativo e até 500 linhas relacionadas por tipo.
          </p>
          {truncated && (
            <p role="status">
              O Fracttal informou mais resultados do que o limite consultado. Os
              dados relacionados podem estar incompletos.
            </p>
          )}
          {(detail.workOrders.excludedRows > 0 ||
            detail.workRequests.excludedRows > 0) && (
            <p role="status">
              Linhas que não correspondem ao código da barreira foram omitidas
              da exibição.
            </p>
          )}
          <details>
            <summary>Exibir JSON bruto</summary>
            <pre
              style={{
                maxHeight: "24rem",
                overflow: "auto",
                whiteSpace: "pre-wrap",
                overflowWrap: "anywhere",
                fontSize: "var(--d-small)",
              }}
            >
              {JSON.stringify(detail, null, 2)}
            </pre>
          </details>
        </>
      )}
    </section>
  );
}
