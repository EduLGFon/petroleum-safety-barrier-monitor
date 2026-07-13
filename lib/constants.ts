import type { Location } from './types';

// ─── Locations ────────────────────────────────────────────────────────────────

export const LOCATIONS: Location[] = [
  { code: 'ALL', name: 'Todas',  tipo: 'Todas as Instalações'   },
  { code: 'FAL', name: 'FAL',   tipo: 'Estação Coletora'        },
  { code: 'CNC', name: 'CNC',   tipo: 'Concessão Norte-Centro'  },
  { code: 'CNS', name: 'CNS',   tipo: 'Concessão Norte-Sul'     },
  { code: 'FAP', name: 'FAP',   tipo: 'Planta de Processamento' },
  { code: 'RJO', name: 'RJO',   tipo: 'Base Operacional Rio'    },
  { code: 'SPL', name: 'SPL',   tipo: 'Base Operacional SP'     },
];

export const LOCATION_DIST: { code: string; tipo: string; count: number }[] = [
  { code: 'FAL', tipo: 'Estação Coletora',        count: 800  },
  { code: 'CNC', tipo: 'Concessão Norte-Centro',  count: 1200 },
  { code: 'CNS', tipo: 'Concessão Norte-Sul',     count: 900  },
  { code: 'FAP', tipo: 'Planta de Processamento', count: 700  },
  { code: 'RJO', tipo: 'Base Operacional Rio',    count: 1100 },
  { code: 'SPL', tipo: 'Base Operacional SP',     count: 2100 },
];

// ─── Barrier attributes ───────────────────────────────────────────────────────

export const CATEGORIES = [
  'Válvula de Alívio de Pressão',
  'Alarmes de Emergência e Sirene',
  'Sistema de Detecção de Gás',
  'Sistema de Combate a Incêndio',
  'Válvula de Bloqueio de Emergência',
  'Sistema de Intertravamento (SIS)',
  'Detector de Fumaça',
  'Dispositivo de Corte de Energia',
  'Sistema de Ventilação de Emergência',
  'Detector de H₂S',
] as const;

export const AGRUPAMENTOS = [
  'Sistemas de Alívio',
  'Evacuação, Resgate e Abandono',
  'Detecção e Monitoramento',
  'Combate a Incêndio',
  'Controle de Processo',
  'Proteção Elétrica',
] as const;

export const TIPOLOGIAS = [
  'Estação Coletora',
  'Planta de Processamento',
  'Duto de Transferência',
  'Base Operacional',
  'Unidade de Compressão',
  'Unidade de Medição',
] as const;

export const DONOS = [
  'Equipe de Manutenção',
  'Operação FAL',
  'Engenharia de Processo',
  'Segurança Industrial',
  'Instrumentação',
  'Utilidades',
] as const;

export const LOC_DESCS = [
  'Próx. ao Separador de Teste',
  'Próx. ao Manifold de Produção',
  'Área do Compressor Principal',
  'Sala Elétrica Principal',
  'Área de Descarregamento/Carreg.',
  'Próximo às Caldeiras',
  'Caixa de API',
  'Plataforma de Acesso Norte',
  'Área do Tanque de Armazenamento',
  'Subestação Elétrica SE-01',
  'Área de Bombeamento',
  'Torre de Destilação T-100',
  'Unidade de Processamento UP-02',
  'Módulo de Controle MCE',
  'Área de Filtração',
  'Linha de Transferência LT-300',
  'Ponto de Coleta PC-14',
  'Disjuntor Interligação Gerador',
  'Válvula de Bloqueio Principal',
  'Área de Compressão AC-05',
] as const;

// ─── History data ──────────────────────────────────────────────────────────────

export const AUTHORS = [
  'João Silva',       'Maria Santos',    'Carlos Oliveira',
  'Ana Costa',        'Pedro Alves',     'Fernanda Lima',
  'Ricardo Souza',    'Camila Ferreira', 'Marcelo Gomes',
  'Patrícia Nunes',
] as const;

export const HISTORY_NOTES: Record<string, readonly string[]> = {
  'Disponível': [
    'Equipamento retornou ao serviço após manutenção corretiva.',
    'Inspeção de rotina concluída — dentro dos parâmetros.',
    'Comissionamento realizado com sucesso pela equipe.',
    'Reparo concluído. Liberado após testes de desempenho.',
    'Substituição do componente finalizada. Operação normal.',
  ],
  'Degradada': [
    'Leitura instável detectada em inspeção de campo.',
    'Atuador com resposta lenta — equipe de instrumentação notificada.',
    'Sensor fora da faixa de calibração. Aguardando peça sobressalente.',
    'Sinal intermitente registrado. Monitoramento intensificado.',
    'Retorno parcial do serviço — falha residual em investigação.',
  ],
  'Fora de Operação': [
    'Parada programada para manutenção preventiva.',
    'Isolamento para trabalho seguro na vizinhança.',
    'Intertravamento ativado por procedimento operacional.',
    'Aguardando janela de manutenção na próxima parada.',
    'Bloqueado para inspeção de integridade estrutural.',
  ],
  'Em Manutenção': [
    'Manutenção corretiva em andamento — OS #47221.',
    'Substituição de componente em curso pelo time de manutenção.',
    'Calibração em andamento pelo time de instrumentação.',
    'Revisão geral programada. Previsão: 3 dias úteis.',
  ],
};

export const COMMENTS = [
  'Aguardando aprovação para manutenção programada.',
  'Inspeção realizada em campo — peça em pedido ao almoxarifado.',
  'Sensor com leitura instável nas últimas 48h. Monitorando.',
  'Reparado provisoriamente até chegada da peça OEM.',
  'Equipe acionada para verificação in loco. Aguardando retorno.',
  'Anomalia detectada durante ronda de inspeção diária.',
  'Registrado no sistema de gestão de manutenção.',
] as const;

export const ACTION_PLANS = [
  'Substituição programada para próxima janela de manutenção.',
  'Solicitação de compra emitida — OS #47221.',
  'Aguardando liberação da área para intervenção corretiva.',
  'Troca do selo mecânico prevista para T+15 dias.',
  'Avaliação de risco em andamento pelo time de engenharia.',
  'Contingenciamento: uso do equipamento redundante FAL-02.',
  'Isolamento físico realizado conforme PT-SEG-1042.',
] as const;

// ─── Status colour tokens ──────────────────────────────────────────────────────

export const DISP_COLORS: Record<string, { solid: string; bg: string; border: string; grad: string }> = {
  'Disponível':       { solid: '#22c55e', bg: 'rgba(34,197,94,.09)',   border: 'rgba(34,197,94,.25)',  grad: 'linear-gradient(135deg,#15803d,#22c55e)' },
  'Degradada':        { solid: '#ef4444', bg: 'rgba(239,68,68,.09)',   border: 'rgba(239,68,68,.25)',  grad: 'linear-gradient(135deg,#b91c1c,#ef4444)' },
  'Fora de Operação': { solid: '#f59e0b', bg: 'rgba(245,158,11,.09)',  border: 'rgba(245,158,11,.25)', grad: 'linear-gradient(135deg,#b45309,#f59e0b)' },
  'Em Manutenção':    { solid: '#3b82f6', bg: 'rgba(59,130,246,.09)',  border: 'rgba(59,130,246,.25)', grad: 'linear-gradient(135deg,#1d4ed8,#3b82f6)' },
};

export const CONF_COLORS: Record<string, { solid: string; bg: string; border: string }> = {
  'Conforme':      { solid: '#22c55e', bg: 'rgba(34,197,94,.09)',    border: 'rgba(34,197,94,.25)'    },
  'Não Conforme':  { solid: '#ef4444', bg: 'rgba(239,68,68,.09)',    border: 'rgba(239,68,68,.25)'    },
  'Não avaliado':  { solid: '#94a3b8', bg: 'rgba(148,163,184,.09)', border: 'rgba(148,163,184,.25)'  },
};

export const CRIT_COLORS: Record<string, { solid: string; bg: string; border: string }> = {
  'Barreira Crítica':   { solid: '#fb923c', bg: 'rgba(251,146,60,.09)',  border: 'rgba(251,146,60,.25)'  },
  'Barreira Relevante': { solid: '#a78bfa', bg: 'rgba(167,139,250,.09)', border: 'rgba(167,139,250,.25)' },
};

export const PAGE_SIZE = 25;

// Reference date for generating deterministic historical data
export const SIM_DATE = new Date('2026-06-22');
