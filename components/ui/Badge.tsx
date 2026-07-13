import type { CSSProperties } from 'react';
interface BadgeProps { label:string; solid:string; bg:string; border:string; size?:'xs'|'sm'|'md'; dot?:boolean; }
export function Badge({ label, solid, bg, border, size='md', dot=true }: BadgeProps) {
  const fs  = size==='xs'?9:size==='sm'?10:11;
  const pad = size==='xs'?'2px 6px':size==='sm'?'3px 8px':'4px 10px';
  const ds  = size==='xs'?5:6;
  const s: CSSProperties = {
    display:'inline-flex', alignItems:'center', gap:4,
    fontSize:fs, fontWeight:700, padding:pad, borderRadius:6,
    background:bg, border:`1px solid ${border}`, color:solid,
    whiteSpace:'nowrap', letterSpacing:'0.025em', textTransform:'uppercase',
  };
  return (
    <span style={s}>
      {dot && <span style={{ width:ds, height:ds, borderRadius:'50%', background:solid, flexShrink:0, boxShadow:`0 0 5px ${solid}99` }}/>}
      {label}
    </span>
  );
}
