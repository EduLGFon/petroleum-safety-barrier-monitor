// ContingencyLinks - cards for viewing and administering barrier links.
import type { ContingencyCandidate, ContingencyLink } from "../../lib/api.ts";

import { useState } from "preact/hooks";

interface References {
  managementChange: string;
  riskAnalysis: string;
}

export function OutgoingLink(
  { link, references, canManage, busy, onReferenceChange, onSave, onRemove }: {
    link: ContingencyLink;
    references: References;
    canManage: boolean;
    busy: boolean;
    onReferenceChange: (key: keyof References, value: string) => void;
    onSave: () => void;
    onRemove: () => void;
  },
) {
  const [confirmingRemoval, setConfirmingRemoval] = useState(false);
  return (
    <article style={cardStyle}>
      <strong>{link.barrierTag} → {link.contingencyTag}</strong>
      <p
        style={{
          color: link.eligible ? "var(--accent)" : "var(--au-danger-fg)",
        }}
      >
        {link.eligible
          ? "Contingência elegível"
          : "Vínculo mantido para consulta, mas a contingência não atende mais aos critérios."}
      </p>
      <ReferenceFields
        references={references}
        disabled={!canManage || busy}
        onChange={onReferenceChange}
      />
      {canManage && (
        <div>
          <button
            type="button"
            disabled={busy}
            onClick={onSave}
            style={buttonStyle}
          >
            Salvar referências
          </button>
          {confirmingRemoval
            ? (
              <>
                <span>Remover este vínculo?</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={onRemove}
                  style={buttonStyle}
                >
                  Confirmar remoção
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmingRemoval(false)}
                  style={buttonStyle}
                >
                  Cancelar
                </button>
              </>
            )
            : (
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmingRemoval(true)}
                style={buttonStyle}
              >
                Remover vínculo
              </button>
            )}
        </div>
      )}
    </article>
  );
}

export function IncomingLink({ link }: { link: ContingencyLink }) {
  return (
    <article style={cardStyle}>
      <strong>{link.barrierTag} → {link.contingencyTag}</strong>
      <ReferenceValues link={link} />
      {!link.eligible && (
        <p style={{ color: "var(--au-danger-fg)" }}>
          Esta barreira não atende mais aos critérios de elegibilidade.
        </p>
      )}
    </article>
  );
}

export function ContingencyCandidates(
  { candidates, candidatesHaveMore, query, canManage, busy, onQuery, onAdd }: {
    candidates: ContingencyCandidate[];
    candidatesHaveMore: boolean;
    query: string;
    canManage: boolean;
    busy: boolean;
    onQuery: (query: string) => void;
    onAdd: (candidateId: number) => void;
  },
) {
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const selected = candidates.find((c) => c.id === selectedId) ?? null;
  return (
    <>
      <label style={{ display: "block", marginBottom: "var(--d-gap-xs)" }}>
        Buscar por tag na mesma instalação
        <input
          type="search"
          value={query}
          maxLength={200}
          onInput={(event) =>
            onQuery((event.currentTarget as HTMLInputElement).value)}
          placeholder="Digite a tag da barreira"
          style={inputStyle}
        />
      </label>
      <p style={{ color: "var(--text-muted)", marginTop: 0 }}>
        Elegíveis: ativas, não excluídas, disponíveis, conformes e da mesma
        instalação.
      </p>
      {candidates.length
        ? (
          <ul style={{ paddingLeft: 22, marginBottom: "var(--d-gap)" }}>
            {candidates.map((candidate) => (
              <li
                key={candidate.id}
                style={{
                  margin: "var(--d-gap-xs) 0",
                  color: "var(--text-primary)",
                  cursor: canManage ? "pointer" : "default",
                }}
                onClick={() => canManage && setSelectedId(candidate.id)}
              >
                <span
                  style={{
                    display: "inline-block",
                    padding: "2px 8px",
                    borderRadius: "var(--d-input-radius)",
                    background: selectedId === candidate.id
                      ? "var(--accent)"
                      : "transparent",
                    color: selectedId === candidate.id ? "#fff" : "inherit",
                  }}
                >
                  {candidate.tag}
                </span>
              </li>
            ))}
          </ul>
        )
        : (
          <p style={{ color: "var(--text-muted)" }}>
            Nenhuma barreira elegível encontrada para esta busca.
          </p>
        )}
      {candidatesHaveMore && (
        <p style={{ color: "var(--text-muted)" }}>
          Há mais resultados. Refine a busca pela tag.
        </p>
      )}
      {canManage && candidates.length > 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "var(--d-gap)",
            marginTop: "var(--d-gap)",
            paddingTop: "var(--d-gap)",
            borderTop: "1px solid var(--border)",
          }}
        >
          <span
            style={{ color: "var(--text-muted)", fontSize: "var(--d-small)" }}
          >
            {selected
              ? `Selecionada: ${selected.tag}`
              : "Selecione uma barreira acima"}
          </span>
          <button
            type="button"
            disabled={busy || selectedId === null}
            onClick={() => selectedId !== null && onAdd(selectedId)}
            style={buttonStyle}
          >
            Vincular
          </button>
        </div>
      )}
    </>
  );
}

function ReferenceFields(
  { references, disabled, onChange }: {
    references: References;
    disabled: boolean;
    onChange: (key: keyof References, value: string) => void;
  },
) {
  return (
    <div
      style={{
        display: "grid",
        gap: "var(--d-gap-xs)",
        margin: "var(--d-stack-sm) 0",
      }}
    >
      <label>
        Gestão de Mudança
        <input
          value={references.managementChange}
          maxLength={2000}
          disabled={disabled}
          onInput={(event) =>
            onChange(
              "managementChange",
              (event.currentTarget as HTMLInputElement).value,
            )}
          style={inputStyle}
        />
      </label>
      <label>
        Análise de Risco
        <input
          value={references.riskAnalysis}
          maxLength={2000}
          disabled={disabled}
          onInput={(event) =>
            onChange(
              "riskAnalysis",
              (event.currentTarget as HTMLInputElement).value,
            )}
          style={inputStyle}
        />
      </label>
    </div>
  );
}

function ReferenceValues({ link }: { link: ContingencyLink }) {
  return (
    <p style={{ color: "var(--text-muted)" }}>
      Gestão de Mudança: {link.managementChange || "Não informada"}{" "}
      | Análise de Risco: {link.riskAnalysis || "Não informada"}
    </p>
  );
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "var(--d-sel-pad)",
  marginTop: "var(--d-gap-xs)",
  border: "1px solid var(--border)",
  borderRadius: "var(--d-input-radius)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
};

const cardStyle = {
  border: "1px solid var(--border)",
  borderRadius: "var(--d-input-radius)",
  padding: "var(--d-row-pad)",
  margin: "var(--d-gap) 0",
};

const buttonStyle = {
  margin: "var(--d-gap-xs) var(--d-gap-xs) var(--d-gap-xs) 0",
  padding: "var(--d-mini-pad)",
  border: "1px solid var(--border)",
  borderRadius: "var(--d-input-radius)",
  background: "var(--bg-elevated)",
  color: "var(--text-primary)",
  cursor: "pointer",
};
