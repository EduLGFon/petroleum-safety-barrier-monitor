'use client';
import { LOCATIONS } from '@/lib/constants';
import type { Barrier } from '@/lib/types';
interface Props { selected:string; allBarriers:Barrier[]; onChange:(c:string)=>void; }
export function LocationFilter({ selected, allBarriers, onChange }: Props) {
  return (
    <nav aria-label="Filtro por instalação" style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:20 }}>
      {LOCATIONS.map((loc,i) => {
        const count = loc.code==='ALL' ? allBarriers.length : allBarriers.filter(b=>b.instalacao===loc.code).length;
        const a = selected===loc.code;
        return (
          <button key={loc.code} onClick={()=>onChange(loc.code)} aria-pressed={a} title={loc.tipo}
            style={{
              display:'flex', alignItems:'center', gap:7, padding:'8px 14px',
              fontSize:13, fontWeight:a?700:500, borderRadius:10,
              border:a?'1px solid transparent':'1px solid var(--border)',
              background:a?'linear-gradient(135deg,var(--accent),var(--accent-2))':'var(--bg-surface)',
              color:a?'#fff':'var(--text-secondary)', cursor:'pointer',
              boxShadow:a?'0 3px 12px var(--glow)':'var(--shadow-sm)',
              whiteSpace:'nowrap',
              transition:'all .22s var(--ease-std)',
              animation:`rowAppear .25s ${i*35}ms var(--ease-out) both`,
            }}
            onMouseEnter={e=>{if(!a)(e.currentTarget as HTMLButtonElement).style.borderColor='var(--accent)';}}
            onMouseLeave={e=>{if(!a)(e.currentTarget as HTMLButtonElement).style.borderColor='var(--border)';}}>
            {loc.name}
            <span style={{fontSize:11,fontWeight:600,padding:'1px 7px',borderRadius:5,
              background:a?'rgba(255,255,255,.2)':'var(--bg-elevated)',
              color:a?'rgba(255,255,255,.9)':'var(--text-muted)',transition:'all .2s'}}>
              {count.toLocaleString('pt-BR')}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
