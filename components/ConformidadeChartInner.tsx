'use client';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, type TooltipProps } from 'recharts';
import type { CategoryConformidade } from '@/lib/types';
interface Props { data: CategoryConformidade[]; }
function Tip({ active, payload, label }: TooltipProps<number,string>) {
  if(!active||!payload?.length)return null;
  return (
    <div style={{background:'var(--bg-elevated)',border:'1px solid var(--border)',borderRadius:9,padding:'10px 14px',fontSize:13,boxShadow:'var(--shadow-md)'}}>
      <div style={{fontWeight:700,color:'var(--text-primary)',marginBottom:8,maxWidth:230,lineHeight:1.4}}>{label}</div>
      {payload.map(p=>(
        <div key={p.name} style={{display:'flex',gap:8,color:p.color,fontWeight:600,marginBottom:3}}>
          <span>{p.name}:</span><span>{p.value?.toLocaleString('pt-BR')}</span>
        </div>
      ))}
    </div>
  );
}
export default function ConformidadeChartInner({ data }: Props) {
  return (
    <ResponsiveContainer width="100%" height={268}>
      <BarChart data={data} layout="vertical" margin={{top:0,right:18,left:0,bottom:22}} barCategoryGap="28%">
        <XAxis type="number" stroke="var(--border)" tick={{fill:'var(--text-muted)',fontSize:12}} axisLine={false} tickLine={false}/>
        <YAxis type="category" dataKey="name" width={200} stroke="transparent" tick={{fill:'var(--text-secondary)',fontSize:12}} tickLine={false}/>
        <Tooltip content={<Tip/>} cursor={{fill:'rgba(128,128,128,0.04)'}}/>
        <Legend iconSize={8} iconType="circle" wrapperStyle={{fontSize:12,color:'var(--text-muted)',paddingTop:10}}/>
        <Bar dataKey="Conforme"      stackId="s" fill="#22c55e" barSize={18}/>
        <Bar dataKey="Não Conforme"  stackId="s" fill="#ef4444" barSize={18} radius={[0,4,4,0]}/>
      </BarChart>
    </ResponsiveContainer>
  );
}
