'use client';
import { useTheme } from '@/context/ThemeContext';
import type { Theme } from '@/lib/types';
import { SunIcon, MoonIcon, MonitorIcon } from './Icons';
type I = React.FC<{size?:number;color?:string;strokeWidth?:number}>;
const OPTS: {value:Theme;Icon:I;label:string}[] = [
  {value:'light', Icon:SunIcon,     label:'Claro'},
  {value:'dark',  Icon:MoonIcon,    label:'Escuro'},
  {value:'amoled',Icon:MonitorIcon, label:'AMOLED'},
];
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <div style={{ display:'flex', background:'rgba(0,0,0,0.25)', border:'1px solid rgba(255,255,255,0.1)', borderRadius:10, padding:3, gap:2 }}>
      {OPTS.map(({ value, Icon, label }) => {
        const a = theme === value;
        return (
          <button key={value} onClick={()=>setTheme(value)} title={label} aria-pressed={a}
            style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', fontSize:11, fontWeight:600, borderRadius:7, border:'none', cursor:'pointer', transition:'all .2s', background:a?'linear-gradient(135deg,rgba(37,99,235,.9),rgba(124,58,237,.9))':'transparent', color:a?'#fff':'rgba(148,163,184,.8)', boxShadow:a?'0 2px 8px rgba(37,99,235,.4)':'none' }}>
            <Icon size={12} color={a?'#fff':'rgba(148,163,184,.8)'} strokeWidth={2.5}/>
            <span>{label}</span>
          </button>
        );
      })}
    </div>
  );
}
