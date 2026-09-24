// BarrierEditor - admin barrier metadata and sheet inventory editor.
// This is why it exists: admins can edit every barrier field directly from
// the modal, picking from curated option lists or typing custom text.
import { type FieldKey, SEED_DEFAULTS } from "../lib/field-options.ts";
import { AURORA } from "../lib/aurora.ts";
import type { Barrier } from "../lib/types.ts";
import { useEffect, useState } from "preact/hooks";

interface Lookups {
  availabilities?: { id: number; label: string }[];
  categories?: { id: number; label: string }[];
  locations?: { id: number; code: string; name: string | null }[];
  criticalities?: { id: number; label: string }[];
  typologies?: { id: number; label: string }[];
  groupings?: { id: number; label: string }[];
  owners?: { id: number; label: string }[];
}

interface Props {
  barrier: Barrier;
  onSaved: (updated?: Barrier) => void;
  onCancel: () => void;
}

const inputStyle = {
  width: "100%",
  boxSizing: "border-box" as const,
  padding: "var(--d-sel-pad)",
  fontSize: "var(--d-body)",
  background: AURORA.seg,
  border: `1px solid ${AURORA.segBorder}`,
  borderRadius: "var(--d-input-radius)",
  color: "var(--text-primary)",
  outline: "none",
};

export function BarrierEditor({ barrier, onSaved, onCancel }: Props) {
  const [lookups, setLookups] = useState<Lookups | null>(null);
  const [fieldOpts, setFieldOpts] = useState<Record<string, string[]>>(
    SEED_DEFAULTS,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Identification & core fields
  const [tag, setTag] = useState(barrier.tag);
  const [locationId, setLocationId] = useState<number | undefined>(undefined);
  const [typologyId, setTypologyId] = useState<number | undefined>(undefined);
  const [categoryId, setCategoryId] = useState<number | undefined>(undefined);
  const [groupingId, setGroupingId] = useState<number | undefined>(undefined);
  const [ownerId, setOwnerId] = useState<number | undefined>(undefined);
  const [criticalityId, setCriticalityId] = useState<number | undefined>(
    undefined,
  );
  const [availabilityId, setAvailabilityId] = useState<number | undefined>(
    undefined,
  );
  const [statusNote, setStatusNote] = useState("");
  const [comments, setComments] = useState(barrier.comments);
  const [actionPlan, setActionPlan] = useState(barrier.actionPlan);

  // Sheet fields
  const [origin, setOrigin] = useState(barrier.origin);
  const [installLocal, setInstallLocal] = useState(barrier.installLocal);
  const [equipTypology, setEquipTypology] = useState(barrier.equipTypology);
  const [fieldInstalled, setFieldInstalled] = useState(barrier.fieldInstalled);
  const [fieldOperational, setFieldOperational] = useState(
    barrier.fieldOperational,
  );
  const [opStatus, setOpStatus] = useState(barrier.opStatus);
  const [hasMaintPlan, setHasMaintPlan] = useState(barrier.hasMaintPlan);
  const [planFollowed, setPlanFollowed] = useState(barrier.planFollowed);
  const [failureFree, setFailureFree] = useState(barrier.failureFree);
  const [maintStatus, setMaintStatus] = useState(barrier.maintStatus);
  const [hasContingency, setHasContingency] = useState(barrier.hasContingency);
  const [contingencyDesc, setContingencyDesc] = useState(
    barrier.contingencyDesc,
  );
  const [evidenceCode, setEvidenceCode] = useState(barrier.evidenceCode);
  const [degradationDesc, setDegradationDesc] = useState(
    barrier.degradationDesc,
  );
  const [extraComments, setExtraComments] = useState(barrier.extraComments);

  useEffect(() => {
    // Fetch lookups with ids + custom field options
    Promise.all([
      fetch("/api/lookups", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch("/api/field-options", { credentials: "same-origin" })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]).then(([l, f]) => {
      if (l) {
        setLookups(l);
        // Find matching ids for the barrier
        if (l.locations) {
          const m = l.locations.find((x: { code: string }) =>
            x.code === barrier.location
          );
          if (m) setLocationId(m.id);
        }
        if (l.typologies) {
          const m = l.typologies.find((x: { label: string }) =>
            x.label === barrier.typology
          );
          if (m) setTypologyId(m.id);
        }
        if (l.categories) {
          const m = l.categories.find((x: { label: string }) =>
            x.label === barrier.category
          );
          if (m) setCategoryId(m.id);
        }
        if (l.groupings) {
          const m = l.groupings.find((x: { label: string }) =>
            x.label === barrier.grouping
          );
          if (m) setGroupingId(m.id);
        }
        if (l.owners && barrier.owner) {
          const m = l.owners.find((x: { label: string }) =>
            x.label === barrier.owner
          );
          if (m) setOwnerId(m.id);
        }
        if (l.criticalities) {
          const m = l.criticalities.find((x: { label: string }) =>
            x.label === barrier.criticality
          );
          if (m) setCriticalityId(m.id);
        }
        if (l.availabilities) {
          const m = l.availabilities.find((x: { label: string }) =>
            x.label === barrier.availability
          );
          if (m) setAvailabilityId(m.id);
        }
      }
      if (Array.isArray(f)) {
        const map: Record<string, string[]> = { ...SEED_DEFAULTS };
        for (const item of f) map[item.field] = item.options;
        setFieldOpts(map);
      }
    });
  }, [barrier]);

  async function submit(e: Event) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const payload = {
        tag,
        locationId,
        typologyId,
        categoryId,
        groupingId,
        ownerId: ownerId ?? null,
        criticalityId,
        availabilityId,
        statusNote: statusNote || undefined,
        comments,
        actionPlan,
        origin,
        installLocal,
        equipTypology,
        fieldInstalled,
        fieldOperational,
        opStatus,
        hasMaintPlan,
        planFollowed,
        failureFree,
        maintStatus,
        hasContingency,
        contingencyDesc,
        evidenceCode,
        degradationDesc,
        extraComments,
      };

      const res = await fetch(`/api/barriers/${barrier.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        let msg = `Erro ${res.status}`;
        try {
          const data = await res.json() as { error?: string };
          if (data.error) msg = data.error;
        } catch {
          // fallback
        }
        throw new Error(msg);
      }

      const updated = (await res.json()) as Barrier;
      setSuccess("Barreira atualizada com sucesso.");
      setTimeout(() => {
        onSaved(updated);
      }, 500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  const renderSelectOrCombo = (
    label: string,
    fieldKey: FieldKey,
    value: string,
    setValue: (v: string) => void,
  ) => {
    const opts = fieldOpts[fieldKey] ?? SEED_DEFAULTS[fieldKey] ?? [];
    return (
      <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
        <label
          style={{
            fontSize: "var(--d-micro)",
            fontWeight: 700,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          {label}
        </label>
        <div style={{ display: "flex", gap: 6 }}>
          <select
            value={opts.includes(value) ? value : "__custom__"}
            onChange={(e) => {
              const v = e.currentTarget.value;
              if (v !== "__custom__") setValue(v);
            }}
            style={{
              ...inputStyle,
              flex: opts.includes(value) ? 1 : "0 0 130px",
            }}
          >
            {opts.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
            {!opts.includes(value) && (
              <option value="__custom__">Outro valor…</option>
            )}
          </select>
          {(!opts.includes(value) || opts.length === 0) && (
            <input
              type="text"
              placeholder="Digite o valor..."
              value={value}
              onInput={(e) => setValue(e.currentTarget.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
          )}
        </div>
      </div>
    );
  };

  return (
    <form
      onSubmit={submit}
      style={{
        padding: "var(--d-dialog-body)",
        display: "grid",
        gap: "var(--d-block-gap)",
      }}
    >
      {error && (
        <div
          style={{
            padding: "10px 14px",
            background: "var(--au-danger-bg)",
            border: "1px solid var(--alert-nc-border)",
            borderRadius: "var(--d-row-radius)",
            color: "var(--alert-nc-text)",
            fontSize: "var(--d-body)",
            fontWeight: 600,
          }}
        >
          {error}
        </div>
      )}

      {success && (
        <div
          style={{
            padding: "10px 14px",
            background: "rgba(16,185,129,.14)",
            border: "1px solid rgba(16,185,129,.3)",
            borderRadius: "var(--d-row-radius)",
            color: "#10b981",
            fontSize: "var(--d-body)",
            fontWeight: 600,
          }}
        >
          {success}
        </div>
      )}

      {/* Section: Identificação */}
      <div>
        <div
          style={{
            fontSize: "var(--d-caption)",
            fontWeight: 800,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "var(--d-stack-sm)",
          }}
        >
          Identificação & Classificação
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--d-details-gap)",
          }}
        >
          <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
            <label
              style={{
                fontSize: "var(--d-micro)",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              TAG
            </label>
            <input
              type="text"
              value={tag}
              onInput={(e) => setTag(e.currentTarget.value)}
              style={inputStyle}
              required
            />
          </div>

          <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
            <label
              style={{
                fontSize: "var(--d-micro)",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Instalação
            </label>
            <select
              value={locationId ?? ""}
              onChange={(e) => setLocationId(Number(e.currentTarget.value))}
              style={inputStyle}
            >
              {lookups?.locations?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.code} {l.name ? `- ${l.name}` : ""}
                </option>
              )) ?? <option value="">Carregando…</option>}
            </select>
          </div>

          <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
            <label
              style={{
                fontSize: "var(--d-micro)",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Tipologia
            </label>
            <select
              value={typologyId ?? ""}
              onChange={(e) => setTypologyId(Number(e.currentTarget.value))}
              style={inputStyle}
            >
              {lookups?.typologies?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              )) ?? <option value="">Carregando…</option>}
            </select>
          </div>

          <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
            <label
              style={{
                fontSize: "var(--d-micro)",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Categoria
            </label>
            <select
              value={categoryId ?? ""}
              onChange={(e) => setCategoryId(Number(e.currentTarget.value))}
              style={inputStyle}
            >
              {lookups?.categories?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              )) ?? <option value="">Carregando…</option>}
            </select>
          </div>

          <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
            <label
              style={{
                fontSize: "var(--d-micro)",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Agrupamento
            </label>
            <select
              value={groupingId ?? ""}
              onChange={(e) => setGroupingId(Number(e.currentTarget.value))}
              style={inputStyle}
            >
              {lookups?.groupings?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              )) ?? <option value="">Carregando…</option>}
            </select>
          </div>

          <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
            <label
              style={{
                fontSize: "var(--d-micro)",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Dono
            </label>
            <select
              value={ownerId ?? ""}
              onChange={(e) => {
                const v = e.currentTarget.value;
                setOwnerId(v === "" ? undefined : Number(v));
              }}
              style={inputStyle}
            >
              <option value="">Não informado</option>
              {lookups?.owners?.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
            <label
              style={{
                fontSize: "var(--d-micro)",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Criticidade
            </label>
            <select
              value={criticalityId ?? ""}
              onChange={(e) => setCriticalityId(Number(e.currentTarget.value))}
              style={inputStyle}
            >
              {lookups?.criticalities?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              )) ?? <option value="">Carregando…</option>}
            </select>
          </div>

          <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
            <label
              style={{
                fontSize: "var(--d-micro)",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Disponibilidade
            </label>
            <select
              value={availabilityId ?? ""}
              onChange={(e) => setAvailabilityId(Number(e.currentTarget.value))}
              style={inputStyle}
            >
              {lookups?.availabilities?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.label}
                </option>
              )) ?? <option value="">Carregando…</option>}
            </select>
          </div>
        </div>

        {availabilityId !== undefined &&
          lookups?.availabilities?.find((a) => a.id === availabilityId)
              ?.label !==
            barrier.availability &&
          (
            <div style={{ marginTop: 10 }}>
              <label
                style={{
                  fontSize: "var(--d-micro)",
                  fontWeight: 700,
                  color: "var(--accent)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                }}
              >
                Motivo / Nota da Alteração de Status
              </label>
              <input
                type="text"
                placeholder="Ex: Manutenção preventiva realizada"
                value={statusNote}
                onInput={(e) => setStatusNote(e.currentTarget.value)}
                style={{ ...inputStyle, marginTop: 4 }}
              />
            </div>
          )}
      </div>

      <hr
        style={{
          border: "none",
          borderTop: "1px solid var(--border)",
          margin: 0,
        }}
      />

      {/* Section: Ficha do Inventário */}
      <div>
        <div
          style={{
            fontSize: "var(--d-caption)",
            fontWeight: 800,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "var(--d-stack-sm)",
          }}
        >
          Ficha do Inventário
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--d-details-gap)",
          }}
        >
          {renderSelectOrCombo("Origem", "origin", origin, setOrigin)}
          {renderSelectOrCombo(
            "Local de Instalação",
            "installLocal",
            installLocal,
            setInstallLocal,
          )}
          {renderSelectOrCombo(
            "Tipologia Equipamento",
            "equipTypology",
            equipTypology,
            setEquipTypology,
          )}
          {renderSelectOrCombo(
            "Elemento em Campo?",
            "fieldInstalled",
            fieldInstalled,
            setFieldInstalled,
          )}
          {renderSelectOrCombo(
            "Elemento Operacional?",
            "fieldOperational",
            fieldOperational,
            setFieldOperational,
          )}
          {renderSelectOrCombo(
            "Status Operacional",
            "opStatus",
            opStatus,
            setOpStatus,
          )}
          {renderSelectOrCombo(
            "Status Manutenção",
            "maintStatus",
            maintStatus,
            setMaintStatus,
          )}
        </div>
      </div>

      <hr
        style={{
          border: "none",
          borderTop: "1px solid var(--border)",
          margin: 0,
        }}
      />

      {/* Section: Plano de Manutenção */}
      <div>
        <div
          style={{
            fontSize: "var(--d-caption)",
            fontWeight: 800,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "var(--d-stack-sm)",
          }}
        >
          Plano de Manutenção
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--d-details-gap)",
          }}
        >
          {renderSelectOrCombo(
            "Possui Plano?",
            "hasMaintPlan",
            hasMaintPlan,
            setHasMaintPlan,
          )}
          {renderSelectOrCombo(
            "Plano Cumprido?",
            "planFollowed",
            planFollowed,
            setPlanFollowed,
          )}
          {renderSelectOrCombo(
            "Sem Falha?",
            "failureFree",
            failureFree,
            setFailureFree,
          )}
        </div>
      </div>

      <hr
        style={{
          border: "none",
          borderTop: "1px solid var(--border)",
          margin: 0,
        }}
      />

      {/* Section: Contingência */}
      <div>
        <div
          style={{
            fontSize: "var(--d-caption)",
            fontWeight: 800,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
            marginBottom: "var(--d-stack-sm)",
          }}
        >
          Contingência
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "var(--d-details-gap)",
            marginBottom: "var(--d-stack-sm)",
          }}
        >
          {renderSelectOrCombo(
            "Há Contingência?",
            "hasContingency",
            hasContingency,
            setHasContingency,
          )}
          <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
            <label
              style={{
                fontSize: "var(--d-micro)",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.1em",
              }}
            >
              Código da Evidência
            </label>
            <input
              type="text"
              placeholder="Ex: GM-3655.01-2024-T-005"
              value={evidenceCode}
              onInput={(e) => setEvidenceCode(e.currentTarget.value)}
              style={inputStyle}
            />
          </div>
        </div>
        <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
          <label
            style={{
              fontSize: "var(--d-micro)",
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Descrição da Contingência
          </label>
          <textarea
            rows={2}
            placeholder="Detalhes do contingenciamento aplicado..."
            value={contingencyDesc}
            onInput={(e) => setContingencyDesc(e.currentTarget.value)}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>
      </div>

      <hr
        style={{
          border: "none",
          borderTop: "1px solid var(--border)",
          margin: 0,
        }}
      />

      {/* Section: Degradação & Comentários */}
      <div style={{ display: "grid", gap: "var(--d-stack-sm)" }}>
        <div
          style={{
            fontSize: "var(--d-caption)",
            fontWeight: 800,
            color: "var(--text-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.1em",
          }}
        >
          Degradação & Observações
        </div>
        <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
          <label
            style={{
              fontSize: "var(--d-micro)",
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Descrição da Degradação
          </label>
          <textarea
            rows={2}
            placeholder="Descreva eventuais falhas ou degradação..."
            value={degradationDesc}
            onInput={(e) => setDegradationDesc(e.currentTarget.value)}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
          <label
            style={{
              fontSize: "var(--d-micro)",
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Comentários
          </label>
          <textarea
            rows={2}
            value={comments}
            onInput={(e) => setComments(e.currentTarget.value)}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
          <label
            style={{
              fontSize: "var(--d-micro)",
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Comentários 2 (Complementares)
          </label>
          <textarea
            rows={2}
            value={extraComments}
            onInput={(e) => setExtraComments(e.currentTarget.value)}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>

        <div style={{ display: "grid", gap: "var(--d-mini-gap)" }}>
          <label
            style={{
              fontSize: "var(--d-micro)",
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              letterSpacing: "0.1em",
            }}
          >
            Plano de Ação
          </label>
          <textarea
            rows={2}
            placeholder="Ações previstas para restabelecimento..."
            value={actionPlan}
            onInput={(e) => setActionPlan(e.currentTarget.value)}
            style={{ ...inputStyle, resize: "vertical" }}
          />
        </div>
      </div>

      {/* Action buttons */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          gap: "var(--d-gap)",
          marginTop: 10,
          paddingTop: 12,
          borderTop: "1px solid var(--border)",
        }}
      >
        <button
          type="button"
          disabled={busy}
          onClick={onCancel}
          style={{
            padding: "9px 16px",
            background: "transparent",
            border: "1px solid var(--border)",
            borderRadius: "var(--d-input-radius)",
            color: "var(--text-secondary)",
            fontSize: "var(--d-body)",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Cancelar
        </button>
        <button
          type="submit"
          disabled={busy}
          style={{
            padding: "9px 20px",
            background: "linear-gradient(90deg,var(--accent),var(--accent-2))",
            border: "none",
            borderRadius: "var(--d-input-radius)",
            color: "#ffffff",
            fontSize: "var(--d-body)",
            fontWeight: 700,
            cursor: busy ? "default" : "pointer",
            boxShadow: "0 4px 14px var(--glow)",
            opacity: busy ? 0.7 : 1,
          }}
        >
          {busy ? "Salvando…" : "Salvar alterações"}
        </button>
      </div>
    </form>
  );
}
