'use client';
import { useState, useEffect, useRef, useCallback, type ReactNode } from 'react';
import { useSettings, ACCENT_PRESETS, type AccentColor } from '@/context/SettingsContext';
import type { Theme } from '@/lib/types';
import { CATEGORIES, LOCATIONS } from '@/lib/constants';
import { CloseIcon, SunIcon, MoonIcon, MonitorIcon, UserIcon, FilterIcon } from './ui/Icons';

const THEMES: { value: Theme; Icon: React.FC<{size?:number;color?:string;strokeWidth?:number}>; label: string }[] = [
  { value:'light',  Icon:SunIcon,     label:'Claro'  },
  { value:'dark',   Icon:MoonIcon,    label:'Escuro' },
  { value:'amoled', Icon:MonitorIcon, label:'AMOLED' },
];
const DISP_OPTS  = ['Disponível','Fora de Operação','Indisponível Contingenciado','Degradado Contingenciado','Degradado','Indisponível'];
const CONF_OPTS  = ['Conforme','Não Conforme'];
const SORT_OPTS  = [{ value:'id',label:'ID' },{ value:'tag',label:'TAG' },{ value:'disponibilidade',label:'Disponibilidade' },{ value:'conformidade',label:'Conformidade' },{ value:'statusSince',label:'Tempo sem contingência' }];

interface Props { open: boolean; onClose: () => void; }

export function SettingsPanel({ open, onClose }: Props) {
  const { settings, setTheme, setAccent, setDefaults, setDefaultLoc, setReduceMotion } = useSettings();
  const [section, setSection] = useState<'appearance'|'filters'|'members'>('appearance');
  const [activeTheme,  setActiveTheme]  = useState<Theme|null>(null);
  const [activeAccent, setActiveAccent] = useState<AccentColor|null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key==='Escape') onClose(); };
    document.addEventListener('keydown',h);
    return () => document.removeEventListener('keydown',h);
  }, [onClose]);

  useEffect(() => { document.body.style.overflow = open ? 'hidden' : ''; return () => { document.body.style.overflow=''; }; }, [open]);

  const handleTheme  = (t: Theme)        => { setActiveTheme(t);  setTheme(t);   setTimeout(()=>setActiveTheme(null),350);  };
  const handleAccent = (c: AccentColor)  => { setActiveAccent(c); setAccent(c);  setTimeout(()=>setActiveAccent(null),350); };

  const selSt = { padding:'9px 12px', fontSize:13, background:'var(--bg-elevated)', border:'1.5px solid var(--border)', borderRadius:9, color:'var(--text-primary)', outline:'none', cursor:'pointer', width:'100%', transition:'border .2s' } as const;

  return (
    <>
      {/* Backdrop */}
      <div onClick={onClose} style={{ position:'fixed',inset:0,zIndex:1000,background:'rgba(0,0,0,.5)',backdropFilter:'blur(4px)',opacity:open?1:0,pointerEvents:open?'auto':'none',transition:'opacity .28s var(--ease-std)' }}/>

      {/* Panel */}
      <aside role="dialog" aria-label="Configurações" style={{
        position:'fixed',top:0,right:0,height:'100dvh',width:420,maxWidth:'96vw',
        background:'var(--bg-surface)',borderLeft:'1px solid var(--border)',
        zIndex:1001,display:'flex',flexDirection:'column',overflowY:'auto',
        transform:open?'translateX(0)':'translateX(100%)',
        transition:'transform .32s var(--ease-out)',
        boxShadow:open?'var(--shadow-lg)':'none',
      }}>

        {/* Header */}
        <div style={{ padding:'20px 22px 16px',borderBottom:'1px solid var(--border)',flexShrink:0,background:'var(--bg-elevated)',display:'flex',justifyContent:'space-between',alignItems:'center',position:'relative',overflow:'hidden' }}>
          <div style={{ position:'absolute',top:-30,right:-20,width:120,height:120,borderRadius:'50%',background:'radial-gradient(circle,var(--glow) 0%,transparent 70%)',pointerEvents:'none' }}/>
          <div>
            <div style={{ fontSize:10,fontWeight:800,letterSpacing:'0.16em',textTransform:'uppercase',color:'var(--accent)',marginBottom:4 }}>Seacrest Petróleo</div>
            <div style={{ fontSize:18,fontWeight:800,color:'var(--text-primary)',letterSpacing:'-0.02em' }}>Configurações</div>
          </div>
          <button onClick={onClose} className="lift" style={{ width:34,height:34,display:'flex',alignItems:'center',justifyContent:'center',background:'var(--bg-surface)',border:'1.5px solid var(--border)',borderRadius:9,cursor:'pointer' }}>
            <CloseIcon size={14} color="var(--text-muted)" strokeWidth={2.5}/>
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display:'flex',borderBottom:'1px solid var(--border)',background:'var(--bg-elevated)',flexShrink:0 }}>
          {[{key:'appearance',label:'Aparência',Icon:SunIcon},{key:'filters',label:'Filtros',Icon:FilterIcon},{key:'members',label:'Membros',Icon:UserIcon}].map(({key,label,Icon}) => (
            <button key={key} onClick={()=>setSection(key as never)}
              style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4,padding:'10px 8px',fontSize:11,fontWeight:600,border:'none',cursor:'pointer',background:'transparent',color:section===key?'var(--accent)':'var(--text-muted)',borderBottom:section===key?'2px solid var(--accent)':'2px solid transparent',transition:'all .2s',marginBottom:-1 }}>
              <Icon size={14} color={section===key?'var(--accent)':'var(--text-muted)'} strokeWidth={2}/>{label}
            </button>
          ))}
        </div>

        {/* ── APPEARANCE ── */}
        {section==='appearance' && (
          <div className="animate-settings-in" style={{ padding:'22px',display:'flex',flexDirection:'column',gap:26 }}>

            {/* Theme */}
            <div>
              <SectTitle>Tema da Interface</SectTitle>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8 }}>
                {THEMES.map(({ value, Icon, label }) => {
                  const isA = settings.theme===value;
                  const isAnim = activeTheme===value;
                  return (
                    <button key={value} onClick={()=>handleTheme(value)}
                      className={isAnim?'animate-theme':''}
                      style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:8,padding:'14px 8px',borderRadius:12,border:isA?'2px solid var(--accent)':'2px solid var(--border)',background:'var(--bg-elevated)',cursor:'pointer',transition:'all .2s var(--ease-std)',boxShadow:isA?'0 0 12px var(--glow)':'none' }}>
                      <div style={{ width:40,height:40,borderRadius:10,display:'flex',alignItems:'center',justifyContent:'center',background:isA?'linear-gradient(135deg,var(--accent),var(--accent-2))':'var(--bg-surface)',boxShadow:isA?'0 4px 12px var(--glow)':'var(--shadow-sm)',transition:'all .25s' }}>
                        <Icon size={18} color={isA?'#fff':'var(--text-muted)'} strokeWidth={2.5}/>
                      </div>
                      <span style={{ fontSize:12,fontWeight:isA?700:500,color:isA?'var(--accent)':'var(--text-secondary)' }}>{label}</span>
                      {isA&&<div style={{ width:20,height:2,borderRadius:1,background:'var(--accent)' }}/>}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Accent colour */}
            <div>
              <SectTitle>Cor Predominante</SectTitle>
              <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:10 }}>
                {(Object.entries(ACCENT_PRESETS) as [AccentColor,typeof ACCENT_PRESETS[AccentColor]][]).map(([key,p])=>{
                  const isA = settings.accentColor===key;
                  const isAnim = activeAccent===key;
                  return (
                    <div key={key} style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:5 }}>
                      <button onClick={()=>handleAccent(key)}
                        className={isAnim?'animate-swatch':''}
                        style={{ width:36,height:36,borderRadius:10,background:p.swatch,border:isA?'3px solid var(--text-primary)':'3px solid transparent',cursor:'pointer',transition:'all .2s var(--ease-std)',boxShadow:isA?`0 0 16px ${p.swatch}88,0 4px 12px ${p.swatch}44`:`0 2px 6px ${p.swatch}44`,transform:isA?'scale(1.1)':'scale(1)',display:'flex',alignItems:'center',justifyContent:'center' }}>
                        {isA&&<svg width="13" height="10" viewBox="0 0 13 10" fill="none"><path d="M1 5L4.5 8.5L12 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                      </button>
                      <span style={{ fontSize:9,color:'var(--text-muted)',fontWeight:500,textAlign:'center' }}>{p.label}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Reduce motion toggle */}
            <div>
              <SectTitle>Acessibilidade</SectTitle>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 14px',background:'var(--bg-elevated)',border:'1.5px solid var(--border)',borderRadius:10 }}>
                <div>
                  <div style={{ fontSize:14,fontWeight:600,color:'var(--text-primary)' }}>Reduzir animações</div>
                  <div style={{ fontSize:12,color:'var(--text-muted)',marginTop:2 }}>Desativa transições e efeitos visuais</div>
                </div>
                <Toggle checked={settings.reduceMotion} onChange={setReduceMotion}/>
              </div>
            </div>

            {/* Preview */}
            <div style={{ padding:'14px 16px',background:'color-mix(in srgb,var(--accent) 7%,var(--bg-elevated))',border:'1.5px solid var(--border)',borderRadius:10 }}>
              <div style={{ fontSize:11,fontWeight:700,color:'var(--accent)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:8 }}>Prévia</div>
              <div style={{ display:'flex',gap:8,flexWrap:'wrap' }}>
                <span style={{ padding:'5px 12px',background:'var(--accent)',color:'#fff',borderRadius:7,fontSize:12,fontWeight:700 }}>Ativo</span>
                <span style={{ padding:'5px 12px',background:'transparent',border:'1.5px solid var(--accent)',color:'var(--accent)',borderRadius:7,fontSize:12,fontWeight:600 }}>Contorno</span>
                <span style={{ padding:'5px 12px',background:'var(--bg-surface)',border:'1.5px solid var(--border)',color:'var(--text-secondary)',borderRadius:7,fontSize:12 }}>Neutro</span>
              </div>
            </div>
          </div>
        )}

        {/* ── FILTERS ── */}
        {section==='filters' && (
          <div className="animate-settings-in" style={{ padding:'22px',display:'flex',flexDirection:'column',gap:18 }}>
            <SectTitle>Filtros Padrão ao Carregar</SectTitle>
            <p style={{ margin:0,fontSize:13,color:'var(--text-muted)',lineHeight:1.6 }}>Aplicados automaticamente ao iniciar o sistema.</p>

            {/* Default location — ITEM 7 */}
            <div>
              <FieldLabel>Instalação (localização)</FieldLabel>
              <select value={settings.defaultLocation} onChange={e=>setDefaultLoc(e.target.value)} style={selSt}>
                {LOCATIONS.map(l=><option key={l.code} value={l.code}>{l.name}{l.code!=='ALL'?` — ${l.tipo}`:''}</option>)}
              </select>
            </div>

            {[
              { label:'Disponibilidade', key:'disponibilidade', opts:DISP_OPTS  },
              { label:'Conformidade',    key:'conformidade',    opts:CONF_OPTS   },
              { label:'Categoria',       key:'categoria',       opts:[...CATEGORIES] },
            ].map(({ label, key, opts }) => (
              <div key={key}>
                <FieldLabel>{label}</FieldLabel>
                <select
                  value={(settings.defaultFilters as Record<string,string>)[key]??''}
                  onChange={e=>setDefaults({...settings.defaultFilters,[key]:e.target.value})}
                  style={selSt}>
                  <option value="">Todas</option>
                  {opts.map(o=><option key={o} value={o}>{o}</option>)}
                </select>
              </div>
            ))}

            <div>
              <FieldLabel>Ordenação</FieldLabel>
              <div style={{ display:'grid',gridTemplateColumns:'1fr 1fr',gap:8 }}>
                <select
                  value={(settings.defaultFilters as Record<string,string>).sortCol??'id'}
                  onChange={e=>setDefaults({...settings.defaultFilters,sortCol:e.target.value as never})}
                  style={selSt}>
                  {SORT_OPTS.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                <select
                  value={(settings.defaultFilters as Record<string,string>).sortDir??'asc'}
                  onChange={e=>setDefaults({...settings.defaultFilters,sortDir:e.target.value as never})}
                  style={selSt}>
                  <option value="asc">Crescente ↑</option>
                  <option value="desc">Decrescente ↓</option>
                </select>
              </div>
            </div>

            <button onClick={()=>{setDefaults({});setDefaultLoc('ALL');}}
              style={{ padding:'10px 16px',background:'rgba(239,68,68,.07)',border:'1.5px solid rgba(239,68,68,.22)',borderRadius:9,color:'#ef4444',fontSize:13,fontWeight:600,cursor:'pointer',transition:'all .2s' }}>
              Restaurar padrões
            </button>
          </div>
        )}

        {/* ── MEMBERS ── */}
        {section==='members' && (
          <div className="animate-settings-in" style={{ padding:'22px',display:'flex',flexDirection:'column',gap:18 }}>
            <SectTitle>Gerenciamento de Membros</SectTitle>
            <div style={{ padding:'20px',background:'color-mix(in srgb,var(--accent) 6%,var(--bg-elevated))',border:'1.5px solid var(--border)',borderRadius:12,textAlign:'center' }}>
              <div style={{ fontSize:13,fontWeight:700,color:'var(--text-primary)',marginBottom:8 }}>Disponível em breve</div>
              <div style={{ fontSize:12,color:'var(--text-muted)',lineHeight:1.65 }}>
                Adicione usuários por e-mail com perfis de acesso:<br/>
                <strong style={{color:'var(--text-secondary)'}}>Visualizador</strong> (leitura) ou{' '}
                <strong style={{color:'var(--accent)'}}>Administrador</strong> (edita contingenciamentos).
              </div>
            </div>
            {/* Preview members UI */}
            <div style={{ opacity:.45,pointerEvents:'none' }}>
              <FieldLabel>Adicionar membro</FieldLabel>
              <div style={{ display:'flex',gap:8 }}>
                <input disabled placeholder="nome@empresa.com.br" style={{...selSt,flex:1}}/>
                <button disabled style={{ padding:'9px 14px',background:'var(--accent)',border:'none',borderRadius:9,color:'#fff',fontSize:13,fontWeight:700,cursor:'not-allowed' }}>+</button>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div style={{ marginTop:'auto',padding:'14px 22px',borderTop:'1px solid var(--border)',background:'var(--bg-elevated)',fontSize:11,color:'var(--text-muted)',textAlign:'center',letterSpacing:'0.05em',flexShrink:0 }}>
          Seacrest Petróleo · Monitor de Barreiras · v0.4
        </div>
      </aside>
    </>
  );
}

/* ── Helpers ──────────────────────────────────────────────────────────────── */
function SectTitle({ children }: { children: ReactNode }) {
  return <div style={{ fontSize:12,fontWeight:800,color:'var(--text-primary)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:14 }}>{children}</div>;
}
function FieldLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontSize:11,fontWeight:700,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'0.1em',marginBottom:7 }}>{children}</div>;
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v:boolean)=>void }) {
  return (
    <button onClick={()=>onChange(!checked)} role="switch" aria-checked={checked}
      style={{ width:44,height:24,borderRadius:12,border:'none',cursor:'pointer',position:'relative',flexShrink:0,
        background:checked?'var(--accent)':'var(--border)',
        transition:'background .25s var(--ease-std)',
        boxShadow:checked?'0 0 8px var(--glow)':'none',
      }}>
      <div style={{ position:'absolute',top:3,left:checked?22:3,width:18,height:18,borderRadius:'50%',background:'#fff',
        transition:'left .25s var(--ease-out)',
        boxShadow:'0 1px 3px rgba(0,0,0,.25)',
      }}/>
    </button>
  );
}
