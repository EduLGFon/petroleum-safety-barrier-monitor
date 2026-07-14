import type { Location, Disponibilidade } from './types';

export const LOCATIONS: Location[] = [
  { code:'ALL',name:'Todas', tipo:'Todas as Instalações'   },
  { code:'FAL',name:'FAL',  tipo:'Estação Coletora'        },
  { code:'CNC',name:'CNC',  tipo:'Concessão Norte-Centro'  },
  { code:'CNS',name:'CNS',  tipo:'Concessão Norte-Sul'     },
  { code:'FAP',name:'FAP',  tipo:'Planta de Processamento' },
  { code:'RJO',name:'RJO',  tipo:'Base Operacional Rio'    },
  { code:'SPL',name:'SPL',  tipo:'Base Operacional SP'     },
];

export const LOCATION_DIST = [
  {code:'FAL',tipo:'Estação Coletora',       count:800 },
  {code:'CNC',tipo:'Concessão Norte-Centro', count:1200},
  {code:'CNS',tipo:'Concessão Norte-Sul',    count:900 },
  {code:'FAP',tipo:'Planta de Processamento',count:700 },
  {code:'RJO',tipo:'Base Operacional Rio',   count:1100},
  {code:'SPL',tipo:'Base Operacional SP',    count:2100},
];

// id-keyed variant used by the mock data generator (mirrors LOCATION_CODES in lib/enums.ts)
export const LOCATION_DIST_BY_ID: { id: number; code: string; count: number }[] = [
  { id: 1, code: 'FAL', count: 800  },
  { id: 2, code: 'CNC', count: 1200 },
  { id: 3, code: 'CNS', count: 900  },
  { id: 4, code: 'FAP', count: 700  },
  { id: 5, code: 'RJO', count: 1100 },
  { id: 6, code: 'SPL', count: 2100 },
];

const CONFORME_STATUSES: Disponibilidade[] = [
  'Disponível','Fora de Operação',
  'Indisponível Contingenciado','Degradado Contingenciado',
];
export function isConforme(s: Disponibilidade): boolean {
  return CONFORME_STATUSES.includes(s);
}

export const CATEGORIES = [
  'Válvula de Alívio de Pressão','Alarmes de Emergência e Sirene',
  'Sistema de Detecção de Gás','Sistema de Combate a Incêndio',
  'Válvula de Bloqueio de Emergência','Sistema de Intertravamento (SIS)',
  'Detector de Fumaça','Dispositivo de Corte de Energia',
  'Sistema de Ventilação de Emergência','Detector de H₂S',
] as const;

export const AGRUPAMENTOS = [
  'Sistemas de Alívio','Evacuação, Resgate e Abandono',
  'Detecção e Monitoramento','Combate a Incêndio',
  'Controle de Processo','Proteção Elétrica',
] as const;

export const TIPOLOGIAS = [
  'Estação Coletora','Planta de Processamento','Duto de Transferência',
  'Base Operacional','Unidade de Compressão','Unidade de Medição',
] as const;

export const DONOS = [
  'Equipe de Manutenção','Operação FAL','Engenharia de Processo',
  'Segurança Industrial','Instrumentação','Utilidades',
] as const;

export const LOC_DESCS = [
  'Próx. ao Separador de Teste','Próx. ao Manifold de Produção',
  'Área do Compressor Principal','Sala Elétrica Principal',
  'Área de Descarregamento/Carreg.','Próximo às Caldeiras',
  'Caixa de API','Plataforma de Acesso Norte',
  'Área do Tanque de Armazenamento','Subestação Elétrica SE-01',
  'Área de Bombeamento','Torre de Destilação T-100',
  'Unidade de Processamento UP-02','Módulo de Controle MCE',
  'Linha de Transferência LT-300','Ponto de Coleta PC-14',
  'Disjuntor Interligação Gerador','Válvula de Bloqueio Principal',
  'Área de Compressão AC-05','Área de Filtração',
] as const;

export const AUTHORS = [
  'João Silva','Maria Santos','Carlos Oliveira','Ana Costa',
  'Pedro Alves','Fernanda Lima','Ricardo Souza','Camila Ferreira',
  'Marcelo Gomes','Patrícia Nunes',
] as const;

export const HISTORY_NOTES: Record<string,readonly string[]> = {
  'Disponível': [
    'Equipamento retornou ao serviço após manutenção corretiva.',
    'Inspeção de rotina concluída — dentro dos parâmetros operacionais.',
    'Comissionamento realizado com sucesso pela equipe técnica.',
  ],
  'Fora de Operação': [
    'Parada programada para manutenção preventiva.',
    'Isolamento para execução de trabalho seguro na vizinhança.',
    'Aguardando janela de manutenção na próxima parada geral.',
  ],
  'Indisponível Contingenciado': [
    'Plano de contingência ativado — operação via sistema redundante.',
    'Indisponibilidade contingenciada conforme procedimento operacional.',
    'Contingência definida pelo time de engenharia. Monitoramento intensificado.',
  ],
  'Degradado Contingenciado': [
    'Degradação controlada com contingência ativa. Peça em pedido.',
    'Atuador com resposta lenta — contingência ativada conforme procedimento.',
    'Sensor fora da faixa. Contingência operacional aplicada.',
  ],
  'Degradado': [
    'Leitura instável detectada em inspeção de campo. Sem contingência definida.',
    'Sinal intermitente registrado. Monitoramento intensificado.',
    'Falha parcial identificada. Equipe de instrumentação notificada.',
  ],
  'Indisponível': [
    'Falha total. Aguardando peça sobressalente para reparo.',
    'Intertravamento ativado por falha de segurança. Sem contingência.',
    'Bloqueio de emergência ativado. Análise de causa raiz em andamento.',
  ],
};

export const COMMENTS = [
  'Aguardando aprovação para manutenção programada.',
  'Inspeção realizada em campo — peça em pedido ao almoxarifado.',
  'Leitura instável nas últimas 48h. Monitorando.',
] as const;

export const ACTION_PLANS = [
  'Substituição programada para próxima janela de manutenção.',
  'Solicitação de compra emitida — OS #47221.',
  'Aguardando liberação da área para intervenção corretiva.',
  'Avaliação de risco em andamento pelo time de engenharia.',
] as const;

export const DISP_COLORS: Record<string,{solid:string;bg:string;border:string;grad:string}> = {
  'Disponível':                  {solid:'#22c55e',bg:'rgba(34,197,94,.1)',   border:'rgba(34,197,94,.28)',  grad:'linear-gradient(135deg,#14532d,#16a34a)'},
  'Fora de Operação':            {solid:'#f59e0b',bg:'rgba(245,158,11,.1)',  border:'rgba(245,158,11,.28)', grad:'linear-gradient(135deg,#78350f,#d97706)'},
  'Indisponível Contingenciado': {solid:'#38bdf8',bg:'rgba(56,189,248,.1)',  border:'rgba(56,189,248,.28)', grad:'linear-gradient(135deg,#0c4a6e,#0284c7)'},
  'Degradado Contingenciado':    {solid:'#a78bfa',bg:'rgba(167,139,250,.1)', border:'rgba(167,139,250,.28)',grad:'linear-gradient(135deg,#4c1d95,#7c3aed)'},
  'Degradado':                   {solid:'#fb923c',bg:'rgba(251,146,60,.1)',  border:'rgba(251,146,60,.28)', grad:'linear-gradient(135deg,#7c2d12,#ea580c)'},
  'Indisponível':                {solid:'#ef4444',bg:'rgba(239,68,68,.1)',   border:'rgba(239,68,68,.28)',  grad:'linear-gradient(135deg,#7f1d1d,#dc2626)'},
};

export const CONF_COLORS: Record<string,{solid:string;bg:string;border:string}> = {
  'Conforme':     {solid:'#22c55e',bg:'rgba(34,197,94,.1)', border:'rgba(34,197,94,.28)' },
  'Não Conforme': {solid:'#ef4444',bg:'rgba(239,68,68,.1)', border:'rgba(239,68,68,.28)' },
};

export const CRIT_COLORS: Record<string,{solid:string;bg:string;border:string}> = {
  'Crítica':    {solid:'#f97316',bg:'rgba(249,115,22,.1)',  border:'rgba(249,115,22,.28)' },
  'Não Crítica':{solid:'#94a3b8',bg:'rgba(148,163,184,.1)',border:'rgba(148,163,184,.28)'},
};

export const SIM_DATE = new Date('2026-06-22');
export const PAGE_SIZE = 25;
