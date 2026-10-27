// BarrierContingency - shows linked contingencies and eligible alternatives.
import {
  ContingencyCandidates,
  IncomingLink,
  OutgoingLink,
} from "./ContingencyLinks.tsx";

import {
  type BarrierContingencies,
  createContingencyApi,
} from "../../lib/api.ts";

import { useCallback, useEffect, useMemo, useState } from "preact/hooks";

import { shouldRecommendOutOfOperation } from "../../lib/contingency.ts";

import { BuildingIcon, ShieldCheckIcon } from "../ui/Icons.tsx";

import type { Barrier } from "../../lib/types.ts";

import { FR, Sec, Txt } from "./primitives.tsx";

interface Props {
  b: Barrier;
  apiBaseUrl: string;
  connected: boolean;
  isAdmin: boolean;
}

type References = { managementChange: string; riskAnalysis: string };

const EMPTY_REFERENCES: References = {
  managementChange: "",
  riskAnalysis: "",
};

export function BarrierContingency(
  { b, apiBaseUrl, connected, isAdmin }: Props,
) {
  const api = useMemo(() => createContingencyApi(apiBaseUrl), [apiBaseUrl]);
  const [data, setData] = useState<BarrierContingencies | null>(null);
  const [query, setQuery] = useState("");
  const [reloadId, setReloadId] = useState(0);
  const [drafts, setDrafts] = useState<Record<number, References>>({});
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const canManage = isAdmin && !b.deletedAt;

  useEffect(() => {
    if (!connected) return;
    let active = true;
    setData(null);
    setLoading(true);
    const timer = setTimeout(() => {
      setError("");
      void api.get(b.id, query).then((result) => {
        if (!active) return;
        setData(result);
        setDrafts((current) => {
          const next = { ...current };
          for (const link of result.outgoing) {
            if (next[link.contingencyBarrierId] === undefined) {
              next[link.contingencyBarrierId] = {
                managementChange: link.managementChange,
                riskAnalysis: link.riskAnalysis,
              };
            }
          }
          return next;
        });
      }).catch((err: unknown) => {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : "Falha ao carregar contingências",
          );
        }
      }).finally(() => {
        if (active) setLoading(false);
      });
    }, query.trim() ? 250 : 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, b.id, connected, query, reloadId]);

  const reload = useCallback(() => setReloadId((id) => id + 1), []);
  const updateDraft = useCallback((
    id: number,
    key: keyof References,
    value: string,
  ) => {
    setDrafts((current) => ({
      ...current,
      [id]: { ...(current[id] ?? EMPTY_REFERENCES), [key]: value },
    }));
  }, []);

  const mutate = useCallback(async (
    action: () => Promise<void>,
    successMessage: string,
  ) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      setMessage(successMessage);
      reload();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Falha ao salvar contingência",
      );
    } finally {
      setBusy(false);
    }
  }, [reload]);

  const recommendation = data !== null &&
    shouldRecommendOutOfOperation(b.compliance, data.outgoing);

  return (
    <div style={{ padding: "var(--d-dialog-body)" }}>
      <Sec>Contingência</Sec>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "var(--d-details-gap)",
          marginBottom: "var(--d-details-gap)",
        }}
      >
        <FR
          Icon={ShieldCheckIcon}
          label="Há Contingência?"
          value={b.hasContingency || "Não informado"}
          italic={!b.hasContingency}
        />
        <FR
          Icon={BuildingIcon}
          label="Código Evidência"
          value={b.evidenceCode || "Não informado"}
          italic={!b.evidenceCode}
        />
      </div>
      <Txt
        value={b.contingencyDesc || "Sem descrição de contingência."}
        muted={!b.contingencyDesc}
      />

      {!connected
        ? (
          <p role="status" style={{ color: "var(--text-muted)" }}>
            Os vínculos entre barreiras ficam disponíveis no modo conectado.
          </p>
        )
        : (
          <>
            {error && (
              <p role="alert" style={{ color: "var(--au-danger-fg)" }}>
                {error}
              </p>
            )}
            {message && (
              <p role="status" style={{ color: "var(--accent)" }}>
                {message}
              </p>
            )}
            {recommendation && !loading && (
              <p
                role="alert"
                style={{
                  margin: "var(--d-details-gap) 0",
                  padding: "12px 14px",
                  border: "1px solid var(--au-danger-fg)",
                  borderRadius: "var(--d-input-radius)",
                  color: "var(--au-danger-fg)",
                  fontWeight: 700,
                }}
              >
                Recomenda-se colocar esta barreira fora de operação, pois não há
                contingência elegível vinculada. Esta é apenas uma orientação: o
                status da barreira não foi alterado.
              </p>
            )}
            {loading && (
              <p role="status" style={{ color: "var(--text-muted)" }}>
                Carregando contingências...
              </p>
            )}
            {data && (
              <>
                <section style={{ marginTop: "var(--d-details-gap)" }}>
                  <Sec>Contingências desta barreira</Sec>
                  {data?.outgoing.length
                    ? data.outgoing.map((link) => (
                      <OutgoingLink
                        key={link.contingencyBarrierId}
                        link={link}
                        references={drafts[link.contingencyBarrierId] ??
                          EMPTY_REFERENCES}
                        canManage={canManage}
                        busy={busy}
                        onReferenceChange={(key, value) =>
                          updateDraft(link.contingencyBarrierId, key, value)}
                        onSave={() =>
                          mutate(
                            () =>
                              api.update(
                                b.id,
                                link.contingencyBarrierId,
                                drafts[link.contingencyBarrierId] ??
                                  EMPTY_REFERENCES,
                              ),
                            "Referências salvas.",
                          )}
                        onRemove={() =>
                          mutate(
                            () => api.remove(b.id, link.contingencyBarrierId),
                            "Contingência removida.",
                          )}
                      />
                    ))
                    : (
                      <p style={{ color: "var(--text-muted)" }}>
                        Nenhuma contingência vinculada.
                      </p>
                    )}
                </section>

                <section style={{ marginTop: "var(--d-details-gap)" }}>
                  <Sec>Barreiras que usam esta como contingência</Sec>
                  {data?.incoming.length
                    ? data.incoming.map((link) => (
                      <IncomingLink key={link.barrierId} link={link} />
                    ))
                    : (
                      <p style={{ color: "var(--text-muted)" }}>
                        Esta barreira não está vinculada como contingência de
                        outra.
                      </p>
                    )}
                </section>

                <section style={{ marginTop: "var(--d-details-gap)" }}>
                  <Sec>Barreiras elegíveis para contingência</Sec>
                  <ContingencyCandidates
                    candidates={data.candidates}
                    candidatesHaveMore={data.candidatesHaveMore}
                    query={query}
                    canManage={canManage}
                    busy={busy || loading}
                    onQuery={setQuery}
                    onAdd={(candidateId) =>
                      mutate(
                        () => api.add(b.id, candidateId, EMPTY_REFERENCES),
                        "Contingência vinculada.",
                      )}
                  />
                </section>
              </>
            )}
          </>
        )}
    </div>
  );
}
