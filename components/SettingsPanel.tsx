'use client';
import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useSettings, ACCENT_PRESETS, type AccentColor } from '@/context/SettingsContext';
import type { Theme } from '@/lib/types';
import { CATEGORIES } from '@/lib/constants';
import { CloseIcon, SunIcon, MoonIcon, MonitorIcon, UserIcon, LayersIcon, FilterIcon, ShieldIcon } from './ui/Icons';

const THEMES: { value: Theme; Icon: React.FC<{size?:number;color?:string;strokeWidth?:number}>; label: string }[] = [
  { value:'light',  Icon:SunIcon,     label:'Claro'  },
  { value:'dark',   Icon:MoonIcon,    label:'Escuro' },
  { value:'amoled', Icon:MonitorIcon, label:'AMOLED' },
];

const DISP_OPTS = [
  { value:'',        label:'Todas'                     },
  { value:'Disponível',                   label:'Disponível'                   },
  { value:'Fora de Operação',             label:'Fora de Operação'             },
  { value:'Indisponível Contingenciado',  label:'Ind. Contingenciado'          },
  { value:'Degradado Contingenciado',     label:'Degr. Contingenciado'         },
  { value:'Degradado',                    label:'Degradado'                    },
  { value:'Indisponível',                 label:'Indisponível'                 },
  { value:'__NC__',                       label:'Não Conformes (NC)'           },
];
const CONF_OPTS = [{ value:'',label:'Todas' },{ value:'Conforme',label:'Conforme' },{ value:'Não Conforme',label:'Não Conforme' }];
const SORT_OPTS = [{ value:'id',label:'ID' },{ value:'tag',label:'TAG' },{ value:'disponibilidade',label:'Disponibilidade' },{ value:'conformidade',label:'Conformidade' },{ value:'criticidade',label:'Criticidade' },{ value:'categoria',label:'Categoria' }];

interface Props { open: boolean; onClose: () => void; }

export function SettingsPanel({ open, onClose }: Props) {
  const { settings, setTheme, setAccent, setDefaults } = useSettings();
  const [activeTheme,  setActiveTheme]  = useState<Theme | null>(null);
  const [activeAccent, setActiveAccent] = useState<AccentColor | null>(null);
  const [emailInput,   setEmailInput]   = useState('');
  const [section, setSection] = useState<'appearance'|'filters'|'members'>('appearance');
  const panelRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [onClose]);

  // Lock body scroll
  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [open]);

  const handleTheme = useCallback((t: Theme) => {
    setActiveTheme(t);
    setTheme(t);
    setTimeout(() => setActiveTheme(null), 500);
  }, [setTheme]);

  const handleAccent = useCallback((c: AccentColor) => {
    setActiveAccent(c);
    setAccent(c);
    setTimeout(() => setActiveAccent(null), 500);
  }, [setAccent]);

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,.55)', backdropFilter:'blur(4px)', opacity:open?1:0, pointerEvents:open?'auto':'none', transition:'opacity .3s' }}/>

      {/* Panel */}
      <aside ref={panelRef} role="dialog" aria-label="Configurações" style={{
        position:'fixed', top:0, right:0, height:'100dvh', width:400, maxWidth:'96vw',
        background:'var(--bg-surface)', borderLeft:'1px solid var(--border)',
        zIndex:1001, display:'flex', flexDirection:'column',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform .38s cubic-bezier(.34,1.2,.64,1)',
        boxShadow: open ? 'var(--shadow-lg)' : 'none',
        overflowY:'auto',
      }}>

        {/* Header */}
        <div style={{ padding:'20px 22px 16px', borderBottom:'1px solid var(--border)', flexShrink:0, background:'var(--bg-elevated)', display:'flex', justifyContent:'space-between', alignItems:'center', position:'relative', overflow:'hidden' }}>
          <div style={{ position:'absolute', top:-30, right:-20, width:120, height:120, borderRadius:'50%', background:'radial-gradient(circle,var(--glow) 0%,transparent 70%)', pointerEvents:'none' }}/>
          <div>
            <div style={{ fontSize:9, fontWeight:800, letterSpacing:'0.16em', textTransform:'uppercase', color:'var(--accent)', marginBottom:4 }}>Seacrest Petróleo</div>
            <div style={{ fontSize:17, fontWeight:900, color:'var(--text-primary)', letterSpacing:'-0.02em' }}>Configurações</div>
          </div>
          <button onClick={onClose} className="lift" style={{ width:34, height:34, display:'flex', alignItems:'center', justifyContent:'center', background:'var(--bg-surface)', border:'1px solid var(--border)', borderRadius:9, cursor:'pointer', color:'var(--text-muted)' }}>
            <CloseIcon size={14} color="var(--text-muted)" strokeWidth={2.5}/>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', background:'var(--bg-elevated)', flexShrink:0 }}>
          {([
            { key:'appearance', label:'Aparência',    Icon: SunIcon },
            { key:'filters',    label:'Filtros',       Icon: FilterIcon },
            { key:'members',    label:'Membros',       Icon: UserIcon },
          ] as const).map(({ key, label, Icon }) => (
            <button key={key} onClick={() => setSection(key)}
              style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4, padding:'10px 8px', fontSize:10, fontWeight:600, border:'none', cursor:'pointer', background:'transparent', color: section===key ? 'var(--accent)' : 'var(--text-muted)', borderBottom: section===key ? '2px solid var(--accent)' : '2px solid transparent', transition:'all .2s', marginBottom:-1 }}>
              <Icon size={14} color={section===key?'var(--accent)':'var(--text-muted)'} strokeWidth={2}/>
              {label}
            </button>
          ))}
        </div>

        {/* Appearance */}
        {section === 'appearance' && (
          <div className="animate-settings-in" style={{ padding:'22px', display:'flex', flexDirection:'column', gap:28 }}>

            {/* Theme */}
            <div>
              <SectionTitle icon={<SunIcon size={13} color="var(--accent)" strokeWidth={2}/>}>Tema da Interface</SectionTitle>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
                {THEMES.map(({ value, Icon, label }) => {
                  const isActive = settings.theme === value;
                  const isAnim   = activeTheme === value;
                  return (
                    <button key={value} onClick={() => handleTheme(value)}
                      className={isAnim ? 'animate-theme' : ''}
                      style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8, padding:'14px 8px', borderRadius:12, border: isActive ? '2px solid var(--accent)' : '2px solid var(--border)', background: isActive ? 'var(--bg-elevated)' : 'var(--bg-elevated)', cursor:'pointer', transition:'all .2s', boxShadow: isActive ? '0 0 14px var(--glow)' : 'none' }}>
                      <div style={{ width:40, height:40, borderRadius:10, display:'flex', alignItems:'center', justifyContent:'center', background: isActive ? 'linear-gradient(135deg,var(--accent),var(--accent-2))' : 'var(--bg-surface)', boxShadow: isActive ? '0 4px 12px var(--glow)' : 'var(--shadow-sm)', transition:'all .25s' }}>
                        <Icon size={18} color={isActive?'#fff':'var(--text-muted)'} strokeWidth={2.5}/>
                      </div>
                      <span style={{ fontSize:11, fontWeight: isActive?700:500, color: isActive?'var(--accent)':'var(--text-secondary)' }}>{label}</span>
                      {isActive && <div style={{ width:20, height:3, borderRadius:2, background:'var(--accent)' }}/>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Accent colour */}
            <div>
              <SectionTitle icon={<div style={{ width:13, height:13, borderRadius:'50%', background:'var(--accent)' }}/>}>Cor Predominante</SectionTitle>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:10 }}>
                {(Object.entries(ACCENT_PRESETS) as [AccentColor, typeof ACCENT_PRESETS[AccentColor]][]).map(([key, p]) => {
                  const isActive = settings.accentColor === key;
                  const isAnim   = activeAccent === key;
                  return (
                    <div key={key} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:5 }}>
                      <button onClick={() => handleAccent(key)}
                        className={isAnim ? 'animate-swatch' : ''}
                        style={{ width:36, height:36, borderRadius:10, background:p.swatch, border: isActive ? '3px solid var(--text-primary)' : '3px solid transparent', cursor:'pointer', transition:'all .2s', boxShadow: isActive ? `0 0 16px ${p.swatch}88, 0 4px 12px ${p.swatch}44` : `0 2px 8px ${p.swatch}44`, transform: isActive ? 'scale(1.12)' : 'scale(1)', position:'relative', display:'flex', alignItems:'center', justifyContent:'center' }}>
                        {isActive && (
                          <svg width="14" height="11" viewBox="0 0 14 11" fill="none">
                            <path d="M1 5.5L5 9.5L13 1.5" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                      <span style={{ fontSize:9, color:'var(--text-muted)', fontWeight:500, textAlign:'center' }}>{p.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Live preview */}
            <div style={{ padding:'14px 16px', background:`linear-gradient(135deg,var(--accent)18,var(--accent-2)10)`, border:'1px solid var(--border)', borderRadius:10 }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8 }}>Prévia</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                <span style={{ padding:'4px 10px', background:'var(--accent)', color:'#fff', borderRadius:6, fontSize:11, fontWeight:700 }}>Botão ativo</span>
                <span style={{ padding:'4px 10px', background:'transparent', border:'1px solid var(--accent)', color:'var(--accent)', borderRadius:6, fontSize:11, fontWeight:600 }}>Contorno</span>
                <span style={{ padding:'4px 10px', background:`rgba(0,0,0,0)`, border:'1px solid var(--border)', color:'var(--text-secondary)', borderRadius:6, fontSize:11 }}>Neutro</span>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        {section === 'filters' && (
          <div className="animate-settings-in" style={{ padding:'22px', display:'flex', flexDirection:'column', gap:18 }}>
            <SectionTitle icon={<FilterIcon size={13} color="var(--accent)" strokeWidth={2}/>}>
              Filtros Activados por Padrão
            </SectionTitle>
            <p style={{ margin:0, fontSize:12, color:'var(--text-muted)', lineHeight:1.6 }}>
              Estes filtros serão aplicados automaticamente ao carregar o sistema.
            </p>

            {[
              { label:'Disponibilidade', key:'disponibilidade', opts:DISP_OPTS },
              { label:'Conformidade',    key:'conformidade',    opts:CONF_OPTS },
              { label:'Categoria',       key:'categoria',       opts:[{value:'',label:'Todas'},...CATEGORIES.map(c=>({value:c,label:c}))] },
            ].map(({ label, key, opts }) => (
              <div key={key}>
                <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:7 }}>{label}</div>
                <select
                  value={(settings.defaultFilters as Record<string,string>)[key] ?? ''}
                  onChange={e => setDefaults({ ...settings.defaultFilters, [key]: e.target.value })}
                  style={{ width:'100%', padding:'9px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:9, color:'var(--text-primary)', fontSize:13, outline:'none', cursor:'pointer' }}>
                  {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </div>
            ))}

            <div>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:7 }}>Ordenação</div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                <select
                  value={(settings.defaultFilters as Record<string,string>).sortCol ?? 'id'}
                  onChange={e => setDefaults({ ...settings.defaultFilters, sortCol: e.target.value as never })}
                  style={{ padding:'9px 10px', background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:9, color:'var(--text-primary)', fontSize:12, outline:'none', cursor:'pointer' }}>
                  {SORT_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select
                  value={(settings.defaultFilters as Record<string,string>).sortDir ?? 'asc'}
                  onChange={e => setDefaults({ ...settings.defaultFilters, sortDir: e.target.value as never })}
                  style={{ padding:'9px 10px', background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:9, color:'var(--text-primary)', fontSize:12, outline:'none', cursor:'pointer' }}>
                  <option value="asc">Crescente ↑</option>
                  <option value="desc">Decrescente ↓</option>
                </select>
              </div>
            </div>

            <button onClick={() => setDefaults({})} style={{ padding:'10px 16px', background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:9, color:'#ef4444', fontSize:12, fontWeight:600, cursor:'pointer' }}>
              Limpar filtros padrão
            </button>
          </div>
        )}

        {/* Members */}
        {section === 'members' && (
          <div className="animate-settings-in" style={{ padding:'22px', display:'flex', flexDirection:'column', gap:18 }}>
            <SectionTitle icon={<UserIcon size={13} color="var(--accent)" strokeWidth={2}/>}>
              Gerenciamento de Membros
            </SectionTitle>

            {/* Coming soon banner */}
            <div style={{ padding:'16px', background:`linear-gradient(135deg,var(--accent)12,var(--accent-2)08)`, border:'1px solid var(--border)', borderRadius:12, textAlign:'center' }}>
              <div style={{ fontSize:28, marginBottom:8 }}>🚀</div>
              <div style={{ fontSize:13, fontWeight:700, color:'var(--text-primary)', marginBottom:6 }}>Disponível em breve</div>
              <div style={{ fontSize:11, color:'var(--text-muted)', lineHeight:1.6 }}>
                O gerenciamento de membros permitirá adicionar usuários por e-mail com perfis de acesso: <strong style={{color:'var(--text-secondary)'}}>Visualizador</strong> (apenas leitura) e <strong style={{color:'var(--accent)'}}>Administrador</strong> (pode editar contingenciamentos).
              </div>
            </div>

            {/* Preview UI */}
            <div style={{ opacity:.5, pointerEvents:'none' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8 }}>Adicionar membro</div>
              <div style={{ display:'flex', gap:8 }}>
                <input disabled placeholder="nome@empresa.com.br" value={emailInput} onChange={e=>setEmailInput(e.target.value)}
                  style={{ flex:1, padding:'9px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:9, color:'var(--text-primary)', fontSize:13, outline:'none' }}/>
                <button disabled style={{ padding:'9px 14px', background:'var(--accent)', border:'none', borderRadius:9, color:'#fff', fontSize:12, fontWeight:700, cursor:'not-allowed' }}>+</button>
              </div>
              <div style={{ marginTop:16, fontSize:10, fontWeight:700, color:'var(--text-muted)', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:8 }}>Membros (prévia)</div>
              {[
                { email:'admin@seacrest.com.br', role:'admin' as const },
                { email:'operador@seacrest.com.br', role:'viewer' as const },
              ].map(m => (
                <div key={m.email} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 12px', background:'var(--bg-elevated)', border:'1px solid var(--border)', borderRadius:9, marginBottom:6 }}>
                  <div style={{ width:30, height:30, borderRadius:'50%', background:'linear-gradient(135deg,var(--accent),var(--accent-2))', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    <UserIcon size={14} color="#fff" strokeWidth={2}/>
                  </div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:12, fontWeight:600, color:'var(--text-primary)' }}>{m.email}</div>
                    <div style={{ fontSize:10, color:'var(--text-muted)' }}>{m.role==='admin'?'Administrador':'Visualizador'}</div>
                  </div>
                  <span style={{ fontSize:9, padding:'2px 8px', borderRadius:4, background:m.role==='admin'?'rgba(59,130,246,.12)':'rgba(34,197,94,.12)', color:m.role==='admin'?'var(--accent)':'#22c55e', fontWeight:700, textTransform:'uppercase' }}>
                    {m.role==='admin'?'ADMIN':'VIEW'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop:'auto', padding:'14px 22px', borderTop:'1px solid var(--border)', background:'var(--bg-elevated)', fontSize:10, color:'var(--text-muted)', textAlign:'center', letterSpacing:'0.06em', flexShrink:0 }}>
          Seacrest Petróleo · Monitor de Barreiras · v0.3
        </div>
      </aside>
    </>
  );
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:14 }}>
      {icon}
      <span style={{ fontSize:11, fontWeight:800, color:'var(--text-primary)', textTransform:'uppercase', letterSpacing:'0.1em' }}>{children}</span>
    </div>
  );
}
