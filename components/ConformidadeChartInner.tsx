'use client';

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  ResponsiveContainer,
  type TooltipProps,
} from 'recharts';
import type { CategoryConformidade } from '@/lib/types';

interface Props {
  data: CategoryConformidade[];
}

function CustomTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background:   'var(--bg-elevated)',
        border:       '1px solid var(--border)',
        borderRadius: 8,
        padding:      '10px 14px',
        fontSize:     12,
      }}
    >
      <div
        style={{
          fontWeight:    700,
          color:         'var(--text-primary)',
          marginBottom:  8,
          maxWidth:      220,
          lineHeight:    1.4,
        }}
      >
        {label}
      </div>
      {payload.map(p => (
        <div
          key={p.name}
          style={{
            display:   'flex',
            gap:       8,
            color:     p.color,
            fontWeight: 600,
          }}
        >
          <span>{p.name}:</span>
          <span>{p.value?.toLocaleString('pt-BR')}</span>
        </div>
      ))}
    </div>
  );
}

export default function ConformidadeChartInner({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={260}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 0, right: 16, left: 0, bottom: 20 }}
        barCategoryGap="30%"
      >
        <XAxis
          type="number"
          stroke="var(--border)"
          tick={{ fill: 'var(--text-muted)', fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          type="category"
          dataKey="name"
          width={185}
          stroke="transparent"
          tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
          tickLine={false}
        />
        <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
        <Legend
          iconSize={8}
          iconType="circle"
          wrapperStyle={{ fontSize: 11, color: 'var(--text-muted)', paddingTop: 8 }}
        />
        <Bar dataKey="Conforme"      stackId="s" fill="#22c55e" barSize={20} />
        <Bar dataKey="Não Conforme"  stackId="s" fill="#ef4444" barSize={20} />
        <Bar dataKey="Não avaliado"  stackId="s" fill="#64748b" barSize={20} radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
