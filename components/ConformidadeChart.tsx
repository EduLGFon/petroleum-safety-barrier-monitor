'use client';

import dynamic from 'next/dynamic';
import type { CategoryConformidade } from '@/lib/types';

// ── Recharts is loaded client-side only to avoid SSR issues ─────────────────

const Chart = dynamic(() => import('./ConformidadeChartInner'), { ssr: false, loading: () => <ChartSkeleton /> });

interface Props {
  data: CategoryConformidade[];
}

export function ConformidadeChart({ data }: Props) {
  return (
    <div
      style={{
        background:   'var(--bg-surface)',
        border:       '1px solid var(--border)',
        borderRadius: 10,
        padding:      '16px 16px 8px',
        marginBottom: 20,
      }}
    >
      <div
        style={{
          fontSize:      10,
          fontWeight:    700,
          color:         'var(--text-muted)',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          marginBottom:  14,
        }}
      >
        Conformidade por Categoria
      </div>
      <Chart data={data} />
    </div>
  );
}

function ChartSkeleton() {
  return (
    <div
      style={{
        height:     240,
        background: 'var(--bg-elevated)',
        borderRadius: 6,
        animation:  'pulse 1.5s ease-in-out infinite',
      }}
    />
  );
}
