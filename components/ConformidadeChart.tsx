'use client';
import dynamic from 'next/dynamic';
import type { CategoryConformidade } from '@/lib/types';
const Chart = dynamic(() => import('./ConformidadeChartInner'), { ssr:false, loading:()=><div style={{height:240,background:'var(--bg-elevated)',borderRadius:8,animation:'pulse 1.5s ease-in-out infinite'}}/> });
interface Props { data: CategoryConformidade[]; }
export function ConformidadeChart({ data }: Props) {
  return (
    <div style={{ background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:12, padding:'18px 18px 10px', marginBottom:20, boxShadow:'var(--shadow-sm)' }}>
      <div style={{ fontSize:10, fontWeight:800, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.12em', marginBottom:14 }}>
        Conformidade por Categoria
      </div>
      <Chart data={data}/>
    </div>
  );
}
