// Mock status history notes, comments, plans and generator - split from lib/data.ts to keep files small; why: isolates timeline building from barrier dataset assembly.
import type { WireStatusHistoryEntry } from "../wireTypes.ts";
import { AUTHOR_CODES } from "../enums.ts";
import { SIM_DATE } from "../constants.ts";
import type { Rng } from "./rng.ts";

// Returns a copy of date shifted by d days, using UTC math so the mock
// timeline never shifts across local DST boundaries.
function addDays(b: Date, d: number): Date {
  const x = new Date(b);
  x.setUTCDate(x.getUTCDate() + d);
  return x;
}
// Formats a date as YYYY-MM-DD (date part of ISO string).
function fmtISO(d: Date): string {
  return d.toISOString().split("T")[0];
}

// ─── Status distribution (id-keyed) ──────────────────────────────────────
// 0=available 1=out-of-service 2=contingency-outage 3=degraded-contingency 4=degraded 5=unavailable

export const STATUS_DIST: [number, number][] = [
  [0, 0.52],
  [1, 0.14],
  [2, 0.08],
  [3, 0.07],
  [4, 0.12],
  [5, 0.07],
];

// Current-status notes mirror the deterministic explanation the sync writes,
// so mock mode exercises the "Causa da Disponibilidade" card. Status 0 keeps a
// plain available phrase and status 1 uses the stopped-asset sentence; 2-5 use
// the structured OS/SS format with the optional contingency suffix.
const CURRENT_STATUS_NOTES: Record<number, string> = {
  0: "O ativo consta como disponível e não houve sinal de corretiva aberta ou equipamento parado nos dados consultados neste ciclo",
  1: "Ordem de serviço aberta indica equipamento parado",
  2: "Ordem de serviço em aberto. Classificação: Corretiva emergencial. Referência: OS-24018: Falha no intertravamento da válvula de bloqueio. Detalhe: Substituição do solenoide em andamento.\nEquipe de instrumentação acionada. Sinal de contingência: GM-03 atuando em paralelo",
  3: "Ordem de serviço em aberto. Classificação: Corretiva planejada. Referência: OS-23871: Degradação do sensor de pressão. Detalhe: Calibração prevista para a próxima janela. Sinal de contingência: CEC do transmissor redundante",
  4: "Solicitação de serviço em aberto. Classificação: Corretiva planejada. Referência: SS-11842: Leitura intermitente no transmissor de nível. Detalhe: Inspeção agendada pela instrumentação",
  5: "Ordem de serviço em aberto. Classificação: Corretiva emergencial. Referência: OS-24102: Falha total no atuador de segurança. Detalhe: Aguardando peça sobressalente para reparo",
};

const HISTORY_NOTES_BY_STATUS_ID: Record<number, readonly string[]> = {
  0: [
    "Equipamento retornou ao serviço após manutenção corretiva.",
    "Inspeção de rotina concluída - dentro dos parâmetros operacionais.",
    "Comissionamento realizado com sucesso pela equipe técnica.",
  ],
  1: [
    "Parada programada para manutenção preventiva.",
    "Isolamento para execução de trabalho seguro na vizinhança.",
    "Aguardando janela de manutenção na próxima parada geral.",
  ],
  2: [
    "Plano de contingência ativado - operação via sistema redundante.",
    "Indisponibilidade contingenciada conforme procedimento operacional.",
    "Contingência definida pelo time de engenharia. Monitoramento intensificado.",
  ],
  3: [
    "Degradação controlada com contingência ativa. Peça em pedido.",
    "Atuador com resposta lenta - contingência ativada conforme procedimento.",
    "Sensor fora da faixa. Contingência operacional aplicada.",
  ],
  4: [
    "Leitura instável detectada em inspeção de campo. Sem contingência definida.",
    "Sinal intermitente registrado. Monitoramento intensificado.",
    "Falha parcial identificada. Equipe de instrumentação notificada.",
  ],
  5: [
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

// ─── History generation (id-keyed statuses/authors) ──────────────────────

export function generateHistory(
  rng: Rng,
  currentStatusId: number,
): { history: WireStatusHistoryEntry[]; statusSince: string } {
  const numEntries = rng.int(2, 5);
  const spanDays = rng.int(120, 400);
  const stepDays = Math.floor(spanDays / numEntries);
  let cursor = addDays(SIM_DATE, -spanDays);

  const allIds = STATUS_DIST.map(([id]) => id);
  const entries: WireStatusHistoryEntry[] = [];

  let prevId = rng.pick([0, 0, 1]); // mostly starts available/out-of-service

  for (let i = 0; i < numEntries - 1; i++) {
    entries.push({
      id: entries.length + 1,
      date: fmtISO(cursor),
      statusId: prevId,
      authorId: rng.int(0, Object.keys(AUTHOR_CODES).length),
      note: rng.pick(
        HISTORY_NOTES_BY_STATUS_ID[prevId] ?? HISTORY_NOTES_BY_STATUS_ID[0],
      ),
    });
    cursor = addDays(cursor, rng.int(stepDays - 10, stepDays + 20));
    prevId = rng.pick(allIds.filter((id) => id !== prevId));
  }

  const since = addDays(SIM_DATE, -rng.int(3, 90));
  const statusSince = fmtISO(since);

  entries.push({
    id: entries.length + 1,
    date: statusSince,
    statusId: currentStatusId,
    authorId: rng.int(0, Object.keys(AUTHOR_CODES).length),
    note: CURRENT_STATUS_NOTES[currentStatusId] ??
      rng.pick(
        HISTORY_NOTES_BY_STATUS_ID[currentStatusId] ??
          HISTORY_NOTES_BY_STATUS_ID[0],
      ),
  });

  entries.sort((a, b) => a.date.localeCompare(b.date));
  return { history: entries, statusSince };
}
