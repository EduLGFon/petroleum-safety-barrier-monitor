import type { ComponentChildren, FunctionComponent } from "preact";
import { useEffect, useState } from "preact/hooks";
import {
  ACCENT_PRESETS,
  type AccentColor,
  type Density,
  DENSITY_PRESETS,
  useSettings,
} from "../context/SettingsContext.tsx";
import type { Theme } from "../lib/types.ts";
import { withBrand } from "../lib/company.ts";
import { CATEGORIES, LOCATIONS } from "../lib/constants.ts";
import {
  CloseIcon,
  FilterIcon,
  MonitorIcon,
  MoonIcon,
  SunIcon,
  UserIcon,
} from "./ui/Icons.tsx";

const THEMES: {
  value: Theme;
  Icon: FunctionComponent<
    { size?: number; color?: string; strokeWidth?: number }
  >;
  label: string;
}[] = [
  { value: "light", Icon: SunIcon, label: "Claro" },
  { value: "dark", Icon: MoonIcon, label: "Escuro" },
  { value: "amoled", Icon: MonitorIcon, label: "AMOLED" },
];
const DISP_OPTS = [
  "Disponível",
  "Fora de Operação",
  "Indisponível Contingenciado",
  "Degradado Contingenciado",
  "Degradado",
  "Indisponível",
];
const CONF_OPTS = ["Conforme", "Não Conforme"];
const SORT_OPTS = [
  { value: "id", label: "ID" },
  { value: "tag", label: "TAG" },
  { value: "disponibilidade", label: "Disponibilidade" },
  { value: "conformidade", label: "Conformidade" },
  { value: "statusSince", label: "Tempo sem contingência" },
];

interface Props {
  open: boolean;
  onClose: () => void;
  companyName: string;
}

export function SettingsPanel({ open, onClose, companyName }: Props) {
  const {
    settings,
    setTheme,
    setAccent,
    setDensity,
    setDefaults,
    setDefaultLoc,
    setReduceMotion,
  } = useSettings();
  const [section, setSection] = useState<"appearance" | "filters" | "members">(
    "appearance",
  );
  const [activeTheme, setActiveTheme] = useState<Theme | null>(null);
  const [activeAccent, setActiveAccent] = useState<AccentColor | null>(null);
  const [activeDensity, setActiveDensity] = useState<Density | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const handleTheme = (t: Theme) => {
    setActiveTheme(t);
    setTheme(t);
    setTimeout(() => setActiveTheme(null), 350);
  };
  const handleAccent = (c: AccentColor) => {
    setActiveAccent(c);
    setAccent(c);
    setTimeout(() => setActiveAccent(null), 350);
  };
  const handleDensity = (d: Density) => {
    setActiveDensity(d);
    setDensity(d);
    setTimeout(() => setActiveDensity(null), 350);
  };

  const selSt = {
    padding: "var(--d-input-y) var(--d-input-x)",
    fontSize: "var(--d-body)",
    background: "var(--bg-elevated)",
    border: "1.5px solid var(--border)",
    borderRadius: "var(--d-input-radius)",
    color: "var(--text-primary)",
    outline: "none",
    cursor: "pointer",
    width: "100%",
    transition: "border .2s",
  } as const;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 1000,
          background: "rgba(0,0,0,.5)",
          backdropFilter: "blur(4px)",
          opacity: open ? 1 : 0,
          pointerEvents: open ? "auto" : "none",
          transition: "opacity .28s var(--ease-std)",
        }}
      />

      {/* Panel */}
      <aside
        role="dialog"
        aria-label="Configurações"
        style={{
          position: "fixed",
          top: 0,
          right: 0,
          height: "100dvh",
          width: "var(--d-panel-w)",
          maxWidth: "96vw",
          background: "var(--bg-surface)",
          borderLeft: "1px solid var(--border)",
          zIndex: 1001,
          display: "flex",
          flexDirection: "column",
          overflowY: "auto",
          transform: open ? "translateX(0)" : "translateX(100%)",
          transition: "transform .32s var(--ease-out)",
          boxShadow: open ? "var(--shadow-lg)" : "none",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "var(--d-dialog-head)",
            borderBottom: "1px solid var(--border)",
            flexShrink: 0,
            background: "var(--bg-elevated)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              top: -30,
              right: -20,
              width: 120,
              height: 120,
              borderRadius: "50%",
              background:
                "radial-gradient(circle,var(--glow) 0%,transparent 70%)",
              pointerEvents: "none",
            }}
          />
          <div>
            <div
              style={{
                fontSize: "var(--d-micro)",
                fontWeight: 800,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "var(--accent)",
                marginBottom: "var(--d-gap-2xs)",
              }}
            >
              {companyName || "Configurações"}
            </div>
            <div
              style={{
                fontSize: "var(--d-panel-title)",
                fontWeight: 800,
                color: "var(--text-primary)",
                letterSpacing: "-0.02em",
              }}
            >
              Configurações
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="lift"
            style={{
              width: "var(--d-close-btn)",
              height: "var(--d-close-btn)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--bg-surface)",
              border: "1.5px solid var(--border)",
              borderRadius: "var(--d-input-radius)",
              cursor: "pointer",
            }}
          >
            <CloseIcon size={14} color="var(--text-muted)" strokeWidth={2.5} />
          </button>
        </div>

        {/* Tabs */}
        <div
          style={{
            display: "flex",
            borderBottom: "1px solid var(--border)",
            background: "var(--bg-elevated)",
            flexShrink: 0,
          }}
        >
          {[{ key: "appearance", label: "Aparência", Icon: SunIcon }, {
            key: "filters",
            label: "Filtros",
            Icon: FilterIcon,
          }, { key: "members", label: "Membros", Icon: UserIcon }].map((
            { key, label, Icon },
          ) => (
            <button
              type="button"
              key={key}
              onClick={() => setSection(key as never)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "var(--d-gap-2xs)",
                padding: "var(--d-panel-tab)",
                fontSize: "var(--d-caption)",
                fontWeight: 600,
                border: "none",
                cursor: "pointer",
                background: "transparent",
                color: section === key ? "var(--accent)" : "var(--text-muted)",
                borderBottom: section === key
                  ? "2px solid var(--accent)"
                  : "2px solid transparent",
                transition: "all .2s",
                marginBottom: -1,
              }}
            >
              <Icon
                size={14}
                color={section === key ? "var(--accent)" : "var(--text-muted)"}
                strokeWidth={2}
              />
              {label}
            </button>
          ))}
        </div>

        {/* ── APPEARANCE ── */}
        {section === "appearance" && (
          <div
            className="animate-settings-in"
            style={{
              padding: "var(--d-panel-body)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--d-panel-gap-lg)",
            }}
          >
            {/* Theme */}
            <div>
              <SectTitle>Tema da Interface</SectTitle>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "var(--d-opt-gap)",
                }}
              >
                {THEMES.map(({ value, Icon, label }) => {
                  const isA = settings.theme === value;
                  const isAnim = activeTheme === value;
                  return (
                    <button
                      type="button"
                      key={value}
                      onClick={() => handleTheme(value)}
                      className={isAnim ? "animate-theme" : ""}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "var(--d-opt-gap)",
                        padding: "var(--d-opt-pad)",
                        borderRadius: "var(--d-opt-radius)",
                        border: isA
                          ? "2px solid var(--accent)"
                          : "2px solid var(--border)",
                        background: "var(--bg-elevated)",
                        cursor: "pointer",
                        transition: "all .2s var(--ease-std)",
                        boxShadow: isA ? "0 0 12px var(--glow)" : "none",
                      }}
                    >
                      <div
                        style={{
                          width: "var(--d-thumb)",
                          height: "var(--d-thumb)",
                          borderRadius: "var(--d-thumb-radius)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          background: isA
                            ? "linear-gradient(135deg,var(--accent),var(--accent-2))"
                            : "var(--bg-surface)",
                          boxShadow: isA
                            ? "0 4px 12px var(--glow)"
                            : "var(--shadow-sm)",
                          transition: "all .25s",
                        }}
                      >
                        <Icon
                          size={18}
                          color={isA ? "#fff" : "var(--text-muted)"}
                          strokeWidth={2.5}
                        />
                      </div>
                      <span
                        style={{
                          fontSize: "var(--d-small)",
                          fontWeight: isA ? 700 : 500,
                          color: isA
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                        }}
                      >
                        {label}
                      </span>
                      {isA && (
                        <div
                          style={{
                            width: 20,
                            height: 2,
                            borderRadius: 1,
                            background: "var(--accent)",
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Density */}
            <div>
              <SectTitle>Densidade da Interface</SectTitle>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: "var(--d-opt-gap)",
                }}
              >
                {(Object.entries(DENSITY_PRESETS) as [
                  Density,
                  typeof DENSITY_PRESETS[Density],
                ][]).map(([value, p]) => {
                  const isA = settings.density === value;
                  const isAnim = activeDensity === value;
                  return (
                    <button
                      type="button"
                      key={value}
                      onClick={() => handleDensity(value)}
                      className={isAnim ? "animate-theme" : ""}
                      aria-pressed={isA}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "var(--d-pill-gap)",
                        padding: "var(--d-density-pad)",
                        borderRadius: "var(--d-opt-radius)",
                        border: isA
                          ? "2px solid var(--accent)"
                          : "2px solid var(--border)",
                        background: "var(--bg-elevated)",
                        cursor: "pointer",
                        transition: "all .2s var(--ease-std)",
                        boxShadow: isA ? "0 0 12px var(--glow)" : "none",
                      }}
                    >
                      <DensityGlyph value={value} active={isA} />
                      <span
                        style={{
                          fontSize: "var(--d-small)",
                          fontWeight: isA ? 700 : 500,
                          color: isA
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                        }}
                      >
                        {p.label}
                      </span>
                      <span
                        style={{
                          fontSize: "var(--d-density-hint)",
                          lineHeight: 1.4,
                          color: "var(--text-muted)",
                          textAlign: "center",
                        }}
                      >
                        {p.hint}
                      </span>
                      <div
                        style={{
                          minHeight: 18,
                          display: "flex",
                          alignItems: "center",
                        }}
                      >
                        {value === "comfortable" && (
                          <span
                            style={{
                              fontSize: "var(--d-tiny)",
                              fontWeight: 800,
                              letterSpacing: "0.1em",
                              textTransform: "uppercase",
                              color: "var(--accent)",
                              background:
                                "color-mix(in srgb,var(--accent) 12%,transparent)",
                              border:
                                "1px solid color-mix(in srgb,var(--accent) 30%,transparent)",
                              borderRadius: "var(--d-pill-sm-radius)",
                              padding: "var(--d-count-pad)",
                            }}
                          >
                            Padrão
                          </span>
                        )}
                      </div>
                      {isA && (
                        <div
                          style={{
                            width: 20,
                            height: 2,
                            borderRadius: 1,
                            background: "var(--accent)",
                          }}
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Accent colour */}
            <div>
              <SectTitle>Cor Predominante</SectTitle>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7,1fr)",
                  gap: "var(--d-bar-gap)",
                }}
              >
                {(Object.entries(ACCENT_PRESETS) as [
                  AccentColor,
                  typeof ACCENT_PRESETS[AccentColor],
                ][]).map(([key, p]) => {
                  const isA = settings.accentColor === key;
                  const isAnim = activeAccent === key;
                  return (
                    <div
                      key={key}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        gap: "var(--d-mini-gap)",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => handleAccent(key)}
                        className={isAnim ? "animate-swatch" : ""}
                        style={{
                          width: "var(--d-swatch)",
                          height: "var(--d-swatch)",
                          borderRadius: "var(--d-thumb-radius)",
                          background: p.swatch,
                          border: isA
                            ? "3px solid var(--text-primary)"
                            : "3px solid transparent",
                          cursor: "pointer",
                          transition: "all .2s var(--ease-std)",
                          boxShadow: isA
                            ? `0 0 16px ${p.swatch}88,0 4px 12px ${p.swatch}44`
                            : `0 2px 6px ${p.swatch}44`,
                          transform: isA ? "scale(1.1)" : "scale(1)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {isA && (
                          <svg
                            width="13"
                            height="10"
                            viewBox="0 0 13 10"
                            fill="none"
                          >
                            <path
                              d="M1 5L4.5 8.5L12 1"
                              stroke="white"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </button>
                      <span
                        style={{
                          fontSize: "var(--d-tiny)",
                          color: "var(--text-muted)",
                          fontWeight: 500,
                          textAlign: "center",
                        }}
                      >
                        {p.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reduce motion toggle */}
            <div>
              <SectTitle>Acessibilidade</SectTitle>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "var(--d-row-pad)",
                  background: "var(--bg-elevated)",
                  border: "1.5px solid var(--border)",
                  borderRadius: "var(--d-row-radius)",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: "var(--d-lead)",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    Reduzir animações
                  </div>
                  <div
                    style={{
                      fontSize: "var(--d-small)",
                      color: "var(--text-muted)",
                      marginTop: 2,
                    }}
                  >
                    Desativa transições e efeitos visuais
                  </div>
                </div>
                <Toggle
                  checked={settings.reduceMotion}
                  onChange={setReduceMotion}
                />
              </div>
            </div>

            {/* Preview */}
            <div
              style={{
                padding: "var(--d-preview-pad)",
                background:
                  "color-mix(in srgb,var(--accent) 7%,var(--bg-elevated))",
                border: "1.5px solid var(--border)",
                borderRadius: "var(--d-row-radius)",
              }}
            >
              <div
                style={{
                  fontSize: "var(--d-caption)",
                  fontWeight: 700,
                  color: "var(--accent)",
                  textTransform: "uppercase",
                  letterSpacing: "0.1em",
                  marginBottom: "var(--d-opt-gap)",
                }}
              >
                Prévia
              </div>
              <div
                style={{
                  display: "flex",
                  gap: "var(--d-opt-gap)",
                  flexWrap: "wrap",
                }}
              >
                <span
                  style={{
                    padding: "var(--d-chip-pad)",
                    background: "var(--accent)",
                    color: "#fff",
                    borderRadius: "var(--d-chip-radius)",
                    fontSize: "var(--d-small)",
                    fontWeight: 700,
                  }}
                >
                  Ativo
                </span>
                <span
                  style={{
                    padding: "var(--d-chip-pad)",
                    background: "transparent",
                    border: "1.5px solid var(--accent)",
                    color: "var(--accent)",
                    borderRadius: "var(--d-chip-radius)",
                    fontSize: "var(--d-small)",
                    fontWeight: 600,
                  }}
                >
                  Contorno
                </span>
                <span
                  style={{
                    padding: "var(--d-chip-pad)",
                    background: "var(--bg-surface)",
                    border: "1.5px solid var(--border)",
                    color: "var(--text-secondary)",
                    borderRadius: "var(--d-chip-radius)",
                    fontSize: "var(--d-small)",
                  }}
                >
                  Neutro
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ── FILTERS ── */}
        {section === "filters" && (
          <div
            className="animate-settings-in"
            style={{
              padding: "var(--d-panel-body)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--d-panel-gap)",
            }}
          >
            <SectTitle>Filtros Padrão ao Carregar</SectTitle>
            <p
              style={{
                margin: 0,
                fontSize: "var(--d-body)",
                color: "var(--text-muted)",
                lineHeight: 1.6,
              }}
            >
              Aplicados automaticamente ao iniciar o sistema.
            </p>

            {/* Default location — ITEM 7 */}
            <div>
              <FieldLabel>Instalação (localização)</FieldLabel>
              <select
                value={settings.defaultLocation}
                onChange={(e) => setDefaultLoc(e.currentTarget.value)}
                style={selSt}
              >
                {LOCATIONS.map((l) => (
                  <option key={l.code} value={l.code}>
                    {l.name}
                    {l.code !== "ALL" ? ` — ${l.tipo}` : ""}
                  </option>
                ))}
              </select>
            </div>

            {[
              {
                label: "Disponibilidade",
                key: "disponibilidade",
                opts: DISP_OPTS,
              },
              { label: "Conformidade", key: "conformidade", opts: CONF_OPTS },
              { label: "Categoria", key: "categoria", opts: [...CATEGORIES] },
            ].map(({ label, key, opts }) => (
              <div key={key}>
                <FieldLabel>{label}</FieldLabel>
                <select
                  value={(settings.defaultFilters as Record<string, string>)[
                    key
                  ] ?? ""}
                  onChange={(e) =>
                    setDefaults({
                      ...settings.defaultFilters,
                      [key]: e.currentTarget.value,
                    })}
                  style={selSt}
                >
                  <option value="">Todas</option>
                  {opts.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}

            <div>
              <FieldLabel>Ordenação</FieldLabel>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "var(--d-opt-gap)",
                }}
              >
                <select
                  value={(settings.defaultFilters as Record<string, string>)
                    .sortCol ?? "id"}
                  onChange={(e) =>
                    setDefaults({
                      ...settings.defaultFilters,
                      sortCol: e.currentTarget.value as never,
                    })}
                  style={selSt}
                >
                  {SORT_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <select
                  value={(settings.defaultFilters as Record<string, string>)
                    .sortDir ?? "asc"}
                  onChange={(e) =>
                    setDefaults({
                      ...settings.defaultFilters,
                      sortDir: e.currentTarget.value as never,
                    })}
                  style={selSt}
                >
                  <option value="asc">Crescente ↑</option>
                  <option value="desc">Decrescente ↓</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setDefaults({});
                setDefaultLoc("ALL");
              }}
              style={{
                padding: "var(--d-reset-pad)",
                background: "rgba(239,68,68,.07)",
                border: "1.5px solid rgba(239,68,68,.22)",
                borderRadius: "var(--d-input-radius)",
                color: "#ef4444",
                fontSize: "var(--d-body)",
                fontWeight: 600,
                cursor: "pointer",
                transition: "all .2s",
              }}
            >
              Restaurar padrões
            </button>
          </div>
        )}

        {/* ── MEMBERS ── */}
        {section === "members" && (
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
                background:
                  "color-mix(in srgb,var(--accent) 6%,var(--bg-elevated))",
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
        )}

        {/* Footer */}
        <div
          style={{
            marginTop: "auto",
            padding: "var(--d-foot-pad)",
            borderTop: "1px solid var(--border)",
            background: "var(--bg-elevated)",
            fontSize: "var(--d-caption)",
            color: "var(--text-muted)",
            textAlign: "center",
            letterSpacing: "0.05em",
            flexShrink: 0,
          }}
        >
          {withBrand(companyName, "Monitor de Barreiras")} · v0.4
        </div>
      </aside>
    </>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function SectTitle({ children }: { children: ComponentChildren }) {
  return (
    <div
      style={{
        fontSize: "var(--d-small)",
        fontWeight: 800,
        color: "var(--text-primary)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: "var(--d-sect-title-gap)",
      }}
    >
      {children}
    </div>
  );
}
function FieldLabel({ children }: { children: ComponentChildren }) {
  return (
    <div
      style={{
        fontSize: "var(--d-caption)",
        fontWeight: 700,
        color: "var(--text-muted)",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
        marginBottom: "var(--d-field-gap)",
      }}
    >
      {children}
    </div>
  );
}

/* Miniature content-rows preview: bar height/gap mirror the density mode. */
function DensityGlyph(
  { value, active }: { value: Density; active: boolean },
) {
  const dims = value === "compact"
    ? { bar: 3, gap: 2 }
    : value === "spacious"
    ? { bar: 5, gap: 4 }
    : { bar: 4, gap: 3 };
  return (
    <div
      aria-hidden="true"
      style={{
        width: 46,
        height: 30,
        borderRadius: "var(--d-chip-radius)",
        background: "var(--bg-surface)",
        border: "1.5px solid var(--border)",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        justifyContent: "center",
        gap: dims.gap,
        padding: "5px 6px",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          style={{
            height: dims.bar,
            borderRadius: 2,
            width: i === 2 ? "62%" : "100%",
            background: active
              ? "linear-gradient(90deg,var(--accent),var(--accent-2))"
              : "var(--border)",
          }}
        />
      ))}
    </div>
  );
}

function Toggle(
  { checked, onChange }: { checked: boolean; onChange: (v: boolean) => void },
) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      role="switch"
      aria-checked={checked}
      style={{
        width: "var(--d-toggle-w)",
        height: "var(--d-toggle-h)",
        borderRadius: "var(--d-toggle-h)",
        border: "none",
        cursor: "pointer",
        position: "relative",
        flexShrink: 0,
        background: checked ? "var(--accent)" : "var(--border)",
        transition: "background .25s var(--ease-std)",
        boxShadow: checked ? "0 0 8px var(--glow)" : "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 3,
          left: checked
            ? "calc(var(--d-toggle-w) - var(--d-toggle-knob) - 4px)"
            : "3px",
          width: "var(--d-toggle-knob)",
          height: "var(--d-toggle-knob)",
          borderRadius: "50%",
          background: "#fff",
          transition: "left .25s var(--ease-out)",
          boxShadow: "0 1px 3px rgba(0,0,0,.25)",
        }}
      />
    </button>
  );
}
