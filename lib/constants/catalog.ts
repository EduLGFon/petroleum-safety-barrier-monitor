// Display catalog seed lists for categories, owners, notes and plans - split from lib/constants.ts to keep files small; why: centralizes mock/DB seed labels while UI stays dynamic.
// Note: LOC_DESCS below is storage-only legacy (Fracttal carries no location
// text; the UI and exports never display locDesc). Kept so existing
// loc_desc_id FK rows and the mock generator resolve.
export const CATEGORIES = [
  "Válvula de Alívio de Pressão",
  "Intertravamento de Segurança - Elemento Iniciador",
  "Intertravamento de Segurança - Elemento Final",
  "Sistema Fixo de Combate a Incêndio",
  "Detectores Fixos de F&G",
  "Malha de Aterramento / SPDA",
  "Dique de Contenção",
  "Tampa de Emergência",
  "Malha de Controle de Processo",
  "Geração de Emergência",
  "Intertravamento de Segurança - Lógica",
  "Plano de Resposta a Emergência",
  "Sistema de Alívio",
  "Alarmes de Emergência e Sirene",
  "Válvula Manual",
  "Vent",
  "CSB - Conjunto Solidário de Barreiras",
  "Proteção Passiva",
  "Botoeira",
  "Vaso",
  "Disco de Ruptura",
  "Sistema de drenagem",
  "Sistemas de Alívio",
  "Trava Mecânica",
  "Dispositivo de Controlede Bloqueio e Isolamento",
  "Procedimento Crítico",
  "Sistema de Dispersão",
  "UPS",
  "Sistema de Proteção contra Descarga Armosférica",
] as const;

export const GROUPINGS = [
  "Sistemas de Alívio",
  "Evacuação, Resgate e Abandono",
  "Intertravamento de Segurança",
  "Resposta à Emergência da Brigada",
  "Resposta à Emergência da Operação",
  "Sistemas de Proteção Pós Liberação",
  "Controle de Fonte de Ignição",
  "Alarmes Críticos e Intervenção Humana",
] as const;

export const TYPOLOGIES = [
  "Estação Coletora",
  "Campo",
  "Duto de Transferência",
  "Poço (RTSGI)",
  "Estação de Vapor",
  "Subestação",
] as const;

export const OWNERS = [
  "Operação",
  "SMS",
  "Manutenção",
] as const;

export const LOC_DESCS = [
  "Próx. ao Separador de Teste",
  "Próx. ao Manifold de Produção",
  "Área do Compressor Principal",
  "Sala Elétrica Principal",
  "Área de Descarregamento/Carreg.",
  "Próximo às Caldeiras",
  "Caixa de API",
  "Plataforma de Acesso Norte",
  "Área do Tanque de Armazenamento",
  "Subestação Elétrica SE-01",
  "Área de Bombeamento",
  "Torre de Destilação T-100",
  "Unidade de Processamento UP-02",
  "Módulo de Controle MCE",
  "Linha de Transferência LT-300",
  "Ponto de Coleta PC-14",
  "Disjuntor Interligação Gerador",
  "Válvula de Bloqueio Principal",
  "Área de Compressão AC-05",
  "Área de Filtração",
] as const;

export const AUTHORS = [
  "João Silva",
  "Maria Santos",
  "Carlos Oliveira",
  "Ana Costa",
  "Pedro Alves",
  "Fernanda Lima",
  "Ricardo Souza",
  "Camila Ferreira",
  "Marcelo Gomes",
  "Patrícia Nunes",
] as const;

export const HISTORY_NOTES: Record<string, readonly string[]> = {
  "Disponível": [
    "Equipamento retornou ao serviço após manutenção corretiva.",
    "Inspeção de rotina concluída - dentro dos parâmetros operacionais.",
    "Comissionamento realizado com sucesso pela equipe técnica.",
  ],
  "Fora de Operação": [
    "Parada programada para manutenção preventiva.",
    "Isolamento para execução de trabalho seguro na vizinhança.",
    "Aguardando janela de manutenção na próxima parada geral.",
  ],
  "Indisponível Contingenciado": [
    "Plano de contingência ativado - operação via sistema redundante.",
    "Indisponibilidade contingenciada conforme procedimento operacional.",
    "Contingência definida pelo time de engenharia. Monitoramento intensificado.",
  ],
  "Degradado Contingenciado": [
    "Degradação controlada com contingência ativa. Peça em pedido.",
    "Atuador com resposta lenta - contingência ativada conforme procedimento.",
    "Sensor fora da faixa. Contingência operacional aplicada.",
  ],
  "Degradado": [
    "Leitura instável detectada em inspeção de campo. Sem contingência definida.",
    "Sinal intermitente registrado. Monitoramento intensificado.",
    "Falha parcial identificada. Equipe de instrumentação notificada.",
  ],
  "Indisponível": [
    "Falha total. Aguardando peça sobressalente para reparo.",
    "Intertravamento ativado por falha de segurança. Sem contingência.",
    "Bloqueio de emergência ativado. Análise de causa raiz em andamento.",
  ],
};

export const COMMENTS = [
  "Aguardando aprovação para manutenção programada.",
  "Inspeção realizada em campo - peça em pedido ao almoxarifado.",
  "Leitura instável nas últimas 48h. Monitorando.",
] as const;

export const ACTION_PLANS = [
  "Substituição programada para próxima janela de manutenção.",
  "Solicitação de compra emitida - OS #47221.",
  "Aguardando liberação da área para intervenção corretiva.",
  "Avaliação de risco em andamento pelo time de engenharia.",
] as const;
