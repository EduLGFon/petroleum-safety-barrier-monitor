// MembersSection.tsx - members placeholder tab for future member management.
// Why: keeps future-only members UI out of the shell and filters sections.
import { FieldLabel, SectTitle } from "./SectionPrimitives.tsx";
import { selSt } from "./settings-options.ts";

// MembersSection: soon placeholder plus disabled preview of the add-member form.
export function MembersSection() {
  return (
    <div
      className="animate-settings-in"
      style={{
        padding: "var(--d-panel-body)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--d-panel-gap)",
      }}
    >
      <SectTitle>Gerenciamento de Membros</SectTitle>
      <div
        style={{
          padding: "var(--d-soon-pad)",
          background: "color-mix(in srgb,var(--accent) 6%,var(--bg-elevated))",
          border: "1.5px solid var(--border)",
          borderRadius: "var(--d-opt-radius)",
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: "var(--d-body)",
            fontWeight: 700,
            color: "var(--text-primary)",
            marginBottom: "var(--d-opt-gap)",
          }}
        >
          Disponível em breve
        </div>
        <div
          style={{
            fontSize: "var(--d-small)",
            color: "var(--text-muted)",
            lineHeight: 1.65,
          }}
        >
          Adicione usuários por e-mail com perfis de acesso:<br />
          <strong style={{ color: "var(--text-secondary)" }}>
            Visualizador
          </strong>{" "}
          (leitura) ou{" "}
          <strong style={{ color: "var(--accent)" }}>
            Administrador
          </strong>{" "}
          (edita contingenciamentos).
        </div>
      </div>
      {/* Preview members UI */}
      <div style={{ opacity: .45, pointerEvents: "none" }}>
        <FieldLabel>Adicionar membro</FieldLabel>
        <div style={{ display: "flex", gap: "var(--d-opt-gap)" }}>
          <input
            disabled
            placeholder="nome@empresa.com.br"
            style={{ ...selSt, flex: 1 }}
          />
          <button
            type="button"
            disabled
            style={{
              padding: "9px 14px",
              background: "var(--accent)",
              border: "none",
              borderRadius: 9,
              color: "#fff",
              fontSize: 13,
              fontWeight: 700,
              cursor: "not-allowed",
            }}
          >
            +
          </button>
        </div>
      </div>
    </div>
  );
}
