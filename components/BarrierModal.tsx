'use client';

import { useEffect, useCallback, useState, type ReactNode } from 'react';
import type { Barrier } from '@/lib/types';
import { DISP_COLORS, CONF_COLORS, CRIT_COLORS } from '@/lib/constants';
import { Badge } from './ui/Badge';
import { daysSince, humanDuration, fmtDate } from '@/lib/utils';

interface Props {
  barrier: Barrier | null;
  onClose: () => void;
}

export function BarrierModal({ barrier, onClose }: Props) {
  const [tab, setTab] = useState<'details' | 'history'>('details');

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape') onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleKey]);

  useEffect(() => {
    document.body.style.overflow = barrier ? 'hidden' : '';
    if (barrier) setTab('details');
    return () => { document.body.style.overflow = ''; };
  }, [barrier]);

  const isOpen = !!barrier;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 990,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(6px)',
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.25s',
        }}
      />

      {/* Modal */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={barrier ? `Detalhes: ${barrier.tag}` : 'Detalhes'}
        style={{
          position: 'fixed', inset: 0, zIndex: 991,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: isOpen ? 'auto' : 'none',
          padding: '16px',
        }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      >
        <div
          className={isOpen ? 'animate-scale-in' : ''}
          style={{
            width: '100%', maxWidth: 560,
            maxHeight: '90dvh',
            background: 'var(--bg-surface)',
            borderRadius: 18,
            border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column',
            overflow: 'hidden',
            boxShadow: 'var(--shadow-lg)',
            opacity: isOpen ? 1 : 0,
            transform: isOpen ? 'scale(1)' : 'scale(0.94)',
            transition: 'opacity 0.22s, transform 0.22s cubic-bezier(0.34,1.2,0.64,1)',
          }}
        >
          {barrier && (
            <ModalContent
              barrier={barrier}
              onClose={onClose}
              tab={tab}
              onTabChange={setTab}
            />
          )}
        </div>
      </div>
    </>
  );
}

// ─── Modal content ────────────────────────────────────────────────────────────

function ModalContent({
  barrier: b, onClose, tab, onTabChange,
}: {
  barrier: Barrier; onClose: () => void;
  tab: 'details' | 'history'; onTabChange: (t: 'details' | 'history') => void;
}) {
  const dispCfg = DISP_COLORS[b.disponibilidade];
  const confCfg = CONF_COLORS[b.conformidade];
  const critCfg = CRIT_COLORS[b.criticidade];
  const isDeg   = b.disponibilidade === 'Degradada';
  const degDays = isDeg && b.degradedSince ? daysSince(b.degradedSince) : 0;

  return (
    <>
      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        padding: '20px 22px 16px',
        background: 'linear-gradient(135deg, var(--bg-elevated) 0%, var(--bg-surface) 100%)',
        borderBottom: '1px solid var(--border)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        {/* Decorative gradient orb */}
        <div style={{
          position: 'absolute', top: -30, right: -30,
          width: 140, height: 140, borderRadius: '50%',
          background: `radial-gradient(circle, ${dispCfg?.solid ?? '#3b82f6'}22 0%, transparent 70%)`,
          pointerEvents: 'none',
        }} />

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{
              fontSize: 9, fontWeight: 800, letterSpacing: '0.14em',
              textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 5,
            }}>
              Barreira #{b.id} · {b.instalacao}
            </div>
            <div style={{
              fontFamily: 'ui-monospace, "Cascadia Code", Menlo, monospace',
              fontSize: 22, fontWeight: 900,
              color: 'var(--text-primary)',
              wordBreak: 'break-all', lineHeight: 1.2,
              letterSpacing: '-0.01em',
            }}>
              {b.tag}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4, lineHeight: 1.4 }}>
              {b.locDesc}
            </div>
          </div>
          <button onClick={onClose} aria-label="Fechar"
            style={{
              width: 32, height: 32, flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--bg-elevated)', border: '1px solid var(--border)',
              borderRadius: 9, cursor: 'pointer', color: 'var(--text-muted)',
              fontSize: 14, transition: 'all 0.15s',
            }}>
            ✕
          </button>
        </div>

        {/* Status badges */}
        <div style={{ display: 'flex', gap: 6, marginTop: 14, flexWrap: 'wrap' }}>
          <Badge label={b.disponibilidade} {...dispCfg} />
          <Badge label={b.conformidade}    {...confCfg} />
          <Badge label={b.criticidade}     {...critCfg} size="sm" />
        </div>

        {/* Degradation alert */}
        {isDeg && b.degradedSince && (
          <div style={{
            marginTop: 12, padding: '8px 12px',
            background: 'rgba(239,68,68,0.08)',
            border: '1px solid rgba(239,68,68,0.22)',
            borderRadius: 9, display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span style={{ fontSize: 16 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#ef4444' }}>
                Degradada há {humanDuration(degDays)}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                Desde {fmtDate(b.degradedSince)}
                {b.lastContingency
                  ? ` · Contingência em ${fmtDate(b.lastContingency)}`
                  : ' · Sem definição de contingenciamento'}
              </div>
            </div>
            {!b.lastContingency && (
              <span style={{
                marginLeft: 'auto', padding: '3px 8px', borderRadius: 5,
                background: 'rgba(239,68,68,0.15)', fontSize: 9, fontWeight: 800,
                color: '#fca5a5', textTransform: 'uppercase', letterSpacing: '0.1em',
                whiteSpace: 'nowrap',
              }}>
                Sem contingência
              </span>
            )}
          </div>
        )}
      </div>

      {/* ── Tabs ───────────────────────────────────────────── */}
      <div style={{
        display: 'flex', gap: 0,
        borderBottom: '1px solid var(--border)',
        background: 'var(--bg-elevated)',
        flexShrink: 0,
      }}>
        {(['details', 'history'] as const).map(t => (
          <button key={t} onClick={() => onTabChange(t)}
            style={{
              padding: '11px 20px', fontSize: 12, fontWeight: 600,
              border: 'none', cursor: 'pointer', background: 'transparent',
              color: tab === t ? 'var(--accent)' : 'var(--text-muted)',
              borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
              transition: 'all 0.15s', marginBottom: -1,
            }}>
            {t === 'details' ? '📋 Detalhes' : '📅 Histórico'}
          </button>
        ))}
      </div>

      {/* ── Body ───────────────────────────────────────────── */}
      <div style={{ overflowY: 'auto', flex: 1 }}>
        {tab === 'details' ? (
          <DetailsTab b={b} />
        ) : (
          <HistoryTab b={b} />
        )}
      </div>
    </>
  );
}

// ─── Details tab ─────────────────────────────────────────────────────────────

function DetailsTab({ b }: { b: Barrier }) {
  return (
    <div style={{ padding: '20px 22px' }}>
      {/* Grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        gap: '16px 20px', marginBottom: 22,
      }}>
        <Field label="Instalação"    value={b.instalacao} />
        <Field label="Tipologia"     value={b.tipologia}  />
        <Field label="Categoria"     value={b.categoria}  full />
        <Field label="Agrupamento"   value={b.agrupamento} full />
        <Field label="Criticidade"   value={b.criticidade} accent={CRIT_COLORS[b.criticidade]?.solid} />
        <Field label="Dono da Barreira"
          value={b.dono || 'Não informado'}
          accent={!b.dono ? 'var(--text-muted)' : undefined}
          italic={!b.dono} />
      </div>

      <Divider />

      {/* Status */}
      <SectionTitle>Status Atual</SectionTitle>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px 20px', marginBottom: 22 }}>
        <div>
          <Label>Disponibilidade</Label>
          <Badge label={b.disponibilidade} {...DISP_COLORS[b.disponibilidade]} />
        </div>
        <div>
          <Label>Conformidade</Label>
          <Badge label={b.conformidade} {...CONF_COLORS[b.conformidade]} />
        </div>
        {b.degradedSince && (
          <div style={{ gridColumn: '1 / -1' }}>
            <Label>Tempo degradada</Label>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>
              {humanDuration(daysSince(b.degradedSince))}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)', marginLeft: 8 }}>
              desde {fmtDate(b.degradedSince)}
            </span>
          </div>
        )}
        {b.lastContingency && (
          <div style={{ gridColumn: '1 / -1' }}>
            <Label>Último contingenciamento</Label>
            <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {fmtDate(b.lastContingency)}
            </span>
          </div>
        )}
      </div>

      <Divider />

      <SectionTitle>Comentários</SectionTitle>
      <TextBlock value={b.comentarios || 'Sem comentários registrados.'} muted={!b.comentarios} />

      <Divider />

      <SectionTitle>Plano de Ação</SectionTitle>
      <TextBlock
        value={b.planoAcao || 'Vazio'}
        muted={!b.planoAcao}
        accent={b.planoAcao ? '#f59e0b' : undefined}
      />
    </div>
  );
}

// ─── History tab ──────────────────────────────────────────────────────────────

function HistoryTab({ b }: { b: Barrier }) {
  const history = [...b.statusHistory].reverse(); // Most recent first

  return (
    <div style={{ padding: '20px 22px' }}>
      <SectionTitle>Histórico de Status</SectionTitle>

      <div style={{ position: 'relative', marginTop: 8 }}>
        {/* Vertical line */}
        <div style={{
          position: 'absolute', left: 13, top: 0, bottom: 0, width: 2,
          background: 'linear-gradient(180deg, var(--accent) 0%, var(--border) 100%)',
          borderRadius: 1,
        }} />

        {history.map((entry, i) => {
          const cfg  = DISP_COLORS[entry.status];
          const isFirst = i === 0;
          return (
            <div key={i} style={{
              display: 'flex', gap: 16, marginBottom: i < history.length - 1 ? 22 : 0,
              paddingLeft: 0, position: 'relative',
            }}>
              {/* Timeline dot */}
              <div style={{
                width: 28, flexShrink: 0, display: 'flex',
                flexDirection: 'column', alignItems: 'center',
              }}>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%',
                  background: isFirst ? cfg?.solid ?? 'var(--accent)' : 'var(--bg-elevated)',
                  border: `2px solid ${cfg?.solid ?? 'var(--border)'}`,
                  boxShadow: isFirst ? `0 0 10px ${cfg?.solid ?? 'var(--accent)'}66` : 'none',
                  marginTop: 3, zIndex: 1, flexShrink: 0,
                  transition: 'all 0.2s',
                }} />
              </div>

              {/* Content */}
              <div style={{
                flex: 1, minWidth: 0,
                padding: '10px 14px',
                background: isFirst ? `${cfg?.bg ?? 'var(--bg-elevated)'}` : 'var(--bg-elevated)',
                border: `1px solid ${isFirst ? cfg?.border ?? 'var(--border)' : 'var(--border)'}`,
                borderRadius: 10,
                boxShadow: isFirst ? 'var(--shadow-sm)' : 'none',
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Badge label={entry.status} {...(cfg ?? { solid: '#94a3b8', bg: 'transparent', border: 'var(--border)' })} size="sm" />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                    {fmtDate(entry.date)}
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
                  {entry.note}
                </p>
                <div style={{ marginTop: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                  👤 {entry.author}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Field({ label, value, accent, italic, full }: {
  label: string; value: string; accent?: string; italic?: boolean; full?: boolean;
}) {
  return (
    <div style={{ gridColumn: full ? '1 / -1' : undefined }}>
      <div style={{
        fontSize: 9, fontWeight: 800, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4,
      }}>{label}</div>
      <div style={{
        fontSize: 13, color: accent ?? 'var(--text-secondary)',
        fontWeight: accent ? 700 : 400,
        fontStyle: italic ? 'italic' : 'normal',
        lineHeight: 1.45,
      }}>{value || '—'}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 800, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12,
    }}>{children}</div>
  );
}

function Label({ children }: { children: ReactNode }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, color: 'var(--text-muted)',
      textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 5,
    }}>{children}</div>
  );
}

function Divider() {
  return <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '18px 0' }} />;
}

function TextBlock({ value, muted, accent }: { value: string; muted?: boolean; accent?: string }) {
  return (
    <p style={{
      margin: 0, fontSize: 13,
      color: accent ?? (muted ? 'var(--text-muted)' : 'var(--text-secondary)'),
      lineHeight: 1.65, fontStyle: muted ? 'italic' : 'normal',
      fontWeight: accent ? 600 : 400,
    }}>
      {value}
    </p>
  );
}
