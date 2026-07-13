'use client';
import { useTheme } from '@/context/ThemeContext';
import type { Theme } from '@/lib/types';

const OPTIONS: { value: Theme; icon: string; label: string }[] = [
  { value: 'light',  icon: '☀',  label: 'Claro'  },
  { value: 'dark',   icon: '🌙', label: 'Escuro' },
  { value: 'amoled', icon: '⬛', label: 'AMOLED' },
];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div style={{
      display: 'flex',
      background: 'var(--bg-elevated)',
      border: '1px solid var(--border)',
      borderRadius: 10,
      padding: 3,
      gap: 2,
    }}>
      {OPTIONS.map(opt => {
        const active = theme === opt.value;
        return (
          <button key={opt.value} onClick={() => setTheme(opt.value)}
            title={opt.label} aria-pressed={active}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 10px', fontSize: 11, fontWeight: 600,
              borderRadius: 7, border: 'none', cursor: 'pointer',
              transition: 'all 0.2s',
              background: active
                ? 'linear-gradient(135deg, var(--accent), var(--accent-2))'
                : 'transparent',
              color: active ? '#fff' : 'var(--text-muted)',
              boxShadow: active ? '0 2px 8px var(--glow)' : 'none',
            }}>
            <span style={{ fontSize: 12 }}>{opt.icon}</span>
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
