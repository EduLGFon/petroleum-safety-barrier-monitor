// Display catalog seed lists for categories, owners, notes and plans - split from lib/constants.ts to keep files small; why: centralizes mock/DB seed labels while UI stays dynamic.
export const CATEGORIES = [
  "Válvula de Alívio de Pressão",
  "Alarmes de Emergência e Sirene",
  "Sistema de Detecção de Gás",
  "Sistema de Combate a Incêndio",
  "Válvula de Bloqueio de Emergência",
  "Sistema de Intertravamento (SIS)",
  "Detector de Fumaça",
  "Dispositivo de Corte de Energia",
  "Sistema de Ventilação de Emergência",
  "Detector de H₂S",
] as const;

export const AGRUPAMENTOS = [
  "Sistemas de Alívio",
  "Evacuação, Resgate e Abandono",
  "Detecção e Monitoramento",
  "Combate a Incêndio",
  "Controle de Processo",
  "Proteção Elétrica",
] as const;

export const TIPOLOGIAS = [
  "Estação Coletora",
  "Planta de Processamento",
  "Duto de Transferência",
  "Base Operacional",
  "Unidade de Compressão",
  "Unidade de Medição",
] as const;

export const DONOS = [
  "Equipe de Manutenção",
  "Operação FAL",
  "Engenharia de Processo",
  "Segurança Industrial",
  "Instrumentação",
  "Utilidades",
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
    "Inspeção de rotina concluída — dentro dos parâmetros operacionais.",
    "Comissionamento realizado com sucesso pela equipe técnica.",
  ],
  "Fora de Operação": [
    "Parada programada para manutenção preventiva.",
    "Isolamento para execução de trabalho seguro na vizinhança.",
    "Aguardando janela de manutenção na próxima parada geral.",
  ],
  "Indisponível Contingenciado": [
    "Plano de contingência ativado — operação via sistema redundante.",
    "Indisponibilidade contingenciada conforme procedimento operacional.",
    "Contingência definida pelo time de engenharia. Monitoramento intensificado.",
  ],
  "Degradado Contingenciado": [
    "Degradação controlada com contingência ativa. Peça em pedido.",
    "Atuador com resposta lenta — contingência ativada conforme procedimento.",
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
  "Inspeção realizada em campo — peça em pedido ao almoxarifado.",
  "Leitura instável nas últimas 48h. Monitorando.",
] as const;

export const ACTION_PLANS = [
  "Substituição programada para próxima janela de manutenção.",
  "Solicitação de compra emitida — OS #47221.",
  "Aguardando liberação da área para intervenção corretiva.",
  "Avaliação de risco em andamento pelo time de engenharia.",
] as const;
