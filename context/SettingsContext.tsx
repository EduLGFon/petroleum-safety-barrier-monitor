'use client';
import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import type { Theme, FilterState } from '@/lib/types';
import { defaultFilters } from '@/lib/utils';

// ─── Accent colours ───────────────────────────────────────────────────────────

export type AccentColor = 'blue'|'green'|'red'|'yellow'|'brown'|'mono'|'purple';

export const ACCENT_PRESETS: Record<AccentColor, {
  label: string; swatch: string; primary: string; secondary: string; glow: string;
  grad1: string; grad2: string; grad3: string; grad4: string; grad5: string; grad6: string;
}> = {
  blue:  { label:'Azul',     swatch:'#3b82f6', primary:'#3b82f6', secondary:'#6366f1', glow:'rgba(59,130,246,.22)',
           grad1:'linear-gradient(135deg,#1e3a8a,#2563eb)',  grad2:'linear-gradient(135deg,#14532d,#16a34a)',
           grad3:'linear-gradient(135deg,#7f1d1d,#dc2626)',  grad4:'linear-gradient(135deg,#1e3a8a,#4f46e5)',
           grad5:'linear-gradient(135deg,#064e3b,#059669)',  grad6:'linear-gradient(135deg,#7c2d12,#ea580c)' },
  green: { label:'Verde',    swatch:'#22c55e', primary:'#22c55e', secondary:'#10b981', glow:'rgba(34,197,94,.22)',
           grad1:'linear-gradient(135deg,#14532d,#16a34a)',  grad2:'linear-gradient(135deg,#134e4a,#0d9488)',
           grad3:'linear-gradient(135deg,#7f1d1d,#dc2626)',  grad4:'linear-gradient(135deg,#14532d,#059669)',
           grad5:'linear-gradient(135deg,#064e3b,#10b981)',  grad6:'linear-gradient(135deg,#7c2d12,#ea580c)' },
  red:   { label:'Vermelho', swatch:'#ef4444', primary:'#ef4444', secondary:'#f97316', glow:'rgba(239,68,68,.22)',
           grad1:'linear-gradient(135deg,#7f1d1d,#dc2626)',  grad2:'linear-gradient(135deg,#14532d,#16a34a)',
           grad3:'linear-gradient(135deg,#450a0a,#b91c1c)',  grad4:'linear-gradient(135deg,#7c2d12,#ea580c)',
           grad5:'linear-gradient(135deg,#064e3b,#059669)',  grad6:'linear-gradient(135deg,#7f1d1d,#ef4444)' },
  yellow:{ label:'Amarelo',  swatch:'#eab308', primary:'#eab308', secondary:'#f59e0b', glow:'rgba(234,179,8,.22)',
           grad1:'linear-gradient(135deg,#713f12,#ca8a04)',  grad2:'linear-gradient(135deg,#14532d,#16a34a)',
           grad3:'linear-gradient(135deg,#7f1d1d,#dc2626)',  grad4:'linear-gradient(135deg,#713f12,#d97706)',
           grad5:'linear-gradient(135deg,#064e3b,#059669)',  grad6:'linear-gradient(135deg,#7c2d12,#ea580c)' },
  brown: { label:'Marrom',   swatch:'#92400e', primary:'#b45309', secondary:'#d97706', glow:'rgba(180,83,9,.22)',
           grad1:'linear-gradient(135deg,#431407,#b45309)',  grad2:'linear-gradient(135deg,#14532d,#16a34a)',
           grad3:'linear-gradient(135deg,#7f1d1d,#dc2626)',  grad4:'linear-gradient(135deg,#431407,#d97706)',
           grad5:'linear-gradient(135deg,#064e3b,#059669)',  grad6:'linear-gradient(135deg,#7c2d12,#ea580c)' },
  mono:  { label:'Neutro',   swatch:'#94a3b8', primary:'#94a3b8', secondary:'#cbd5e1', glow:'rgba(148,163,184,.22)',
           grad1:'linear-gradient(135deg,#1e293b,#334155)',  grad2:'linear-gradient(135deg,#14532d,#16a34a)',
           grad3:'linear-gradient(135deg,#7f1d1d,#dc2626)',  grad4:'linear-gradient(135deg,#1e293b,#475569)',
           grad5:'linear-gradient(135deg,#064e3b,#059669)',  grad6:'linear-gradient(135deg,#7c2d12,#ea580c)' },
  purple:{ label:'Roxo',     swatch:'#a855f7', primary:'#a855f7', secondary:'#c084fc', glow:'rgba(168,85,247,.22)',
           grad1:'linear-gradient(135deg,#3b0764,#7c3aed)',  grad2:'linear-gradient(135deg,#14532d,#16a34a)',
           grad3:'linear-gradient(135deg,#7f1d1d,#dc2626)',  grad4:'linear-gradient(135deg,#3b0764,#a855f7)',
           grad5:'linear-gradient(135deg,#064e3b,#059669)',  grad6:'linear-gradient(135deg,#7c2d12,#ea580c)' },
};

// ─── Member types ─────────────────────────────────────────────────────────────

export type MemberRole = 'admin' | 'viewer';
export interface Member { email: string; role: MemberRole; addedAt: string; }

// ─── Settings state ───────────────────────────────────────────────────────────

export interface SettingsState {
  theme:          Theme;
  accentColor:    AccentColor;
  defaultFilters: Partial<FilterState>;
  members:        Member[];
}

const DEFAULTS: SettingsState = {
  theme:          'dark',
  accentColor:    'blue',
  defaultFilters: {},
  members:        [],
};

const KEY = 'seacrest-settings';

// ─── Context ──────────────────────────────────────────────────────────────────

interface SettingsCtx {
  settings:     SettingsState;
  setTheme:     (t: Theme) => void;
  setAccent:    (c: AccentColor) => void;
  setDefaults:  (f: Partial<FilterState>) => void;
  addMember:    (email: string, role: MemberRole) => void;
  removeMember: (email: string) => void;
}

const Ctx = createContext<SettingsCtx>({
  settings:     DEFAULTS,
  setTheme:     () => {},
  setAccent:    () => {},
  setDefaults:  () => {},
  addMember:    () => {},
  removeMember: () => {},
});

function load(): SettingsState {
  if (typeof window === 'undefined') return DEFAULTS;
  try {
    const s = localStorage.getItem(KEY);
    return s ? { ...DEFAULTS, ...JSON.parse(s) } : DEFAULTS;
  } catch { return DEFAULTS; }
}

function applyAccent(color: AccentColor) {
  const p = ACCENT_PRESETS[color];
  const r = document.documentElement;
  r.style.setProperty('--accent',    p.primary);
  r.style.setProperty('--accent-2',  p.secondary);
  r.style.setProperty('--glow',      p.glow);
  r.style.setProperty('--kpi-grad-1', p.grad1);
  r.style.setProperty('--kpi-grad-4', p.grad4);
}

function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
}

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(DEFAULTS);

  useEffect(() => {
    const s = load();
    setSettings(s);
    applyTheme(s.theme);
    applyAccent(s.accentColor);
  }, []);

  const save = useCallback((next: SettingsState) => {
    setSettings(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  }, []);

  const setTheme = useCallback((t: Theme) => {
    applyTheme(t);
    save({ ...settings, theme: t });
  }, [settings, save]);

  const setAccent = useCallback((c: AccentColor) => {
    applyAccent(c);
    save({ ...settings, accentColor: c });
  }, [settings, save]);

  const setDefaults = useCallback((f: Partial<FilterState>) => {
    save({ ...settings, defaultFilters: f });
  }, [settings, save]);

  const addMember = useCallback((email: string, role: MemberRole) => {
    const exists = settings.members.some(m => m.email === email);
    if (exists) return;
    save({ ...settings, members: [...settings.members, { email, role, addedAt: new Date().toISOString() }] });
  }, [settings, save]);

  const removeMember = useCallback((email: string) => {
    save({ ...settings, members: settings.members.filter(m => m.email !== email) });
  }, [settings, save]);

  return (
    <Ctx.Provider value={{ settings, setTheme, setAccent, setDefaults, addMember, removeMember }}>
      {children}
    </Ctx.Provider>
  );
}

export function useSettings() { return useContext(Ctx); }
