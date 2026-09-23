// Sheet inventory field pools for the mock generator - split to keep files small.
// Why: new barriers carry the GERAL columns admins fill in later; the demo
// dataset needs plausible sheet-real values, not blanks, so modal/exports
// read like the team's workbook. Samples come from test/inventory.xlsx GERAL.
import type { Rng } from "./rng.ts";

// HAZOP/APR origins covering most GERAL rows (SGSO-PG-0016 dominates).
export const ORIGINS = [
  "Gerenciamento das Barreiras de Segurança Operacional: SGSO-PG-0016",
  "HAZOP: RL-3655.00-1200-98X-SEA-001",
  "HAZOP: RL-3680.00-1253-98X-SEA-001",
  "HAZOP: RL-3656.01-1221-98G-SEA-001",
] as const;

// Frequent Local de Instalação values from GERAL.
export const INSTALL_LOCALS = [
  "Sistema Combate a Incêndio FAL",
  "Cj Detectores de Gás Estação - FAL",
  "Sistema Geração de Vapor para Injeção (UGVF's) - FAL-20",
  "Sistema de Tratamento de Petróleo FAL",
  "Sistema Geração de Vapor para Injeção - IBU-26",
  "Cj Detectores de Gás - SM-8",
  "Sistema Captação Tratamento e Bombeio Água - IBU-26",
  "Sistema de Tocha (Flare) FAL",
] as const;

// Frequent Tipologia Equipamento values from GERAL.
export const EQUIP_TYPOLOGIES = [
  "Válvula de Segurança de Pressão",
  "Detector de Gás",
  "Transmissor Indicador de Pressão",
  "Sistema de Combate a Incêndio",
  "Válvula de Desligamento/Fechamento de Emergência",
  "Painel Elétrico",
  "Dique de Contenção",
  "Tampa de Emergência",
  "Hidrante",
  "Transmissor de Nível",
] as const;

// Sheet trio answers: Sim dominates, Verificar/Não trail (GERAL Q/R/S).
const TRIO = [
  "Sim",
  "Sim",
  "Sim",
  "Sim",
  "Sim",
  "Sim",
  "Verificar",
  "Não",
] as const;

// Generates the 15 stored sheet columns for one mock barrier. Empty string
// means unset (same convention as comments/actionPlan); contingency and
// degradation details stay rare, matching the sheet.
export function genSheetFields(rng: Rng): {
  origin: string;
  installLocal: string;
  equipTypology: string;
  fieldInstalled: string;
  fieldOperational: string;
  opStatus: string;
  hasMaintPlan: string;
  planFollowed: string;
  failureFree: string;
  maintStatus: string;
  hasContingency: string;
  contingencyDesc: string;
  evidenceCode: string;
  degradationDesc: string;
  extraComments: string;
} {
  const hasMaintPlan = rng.pick(TRIO);
  const noPlan = hasMaintPlan !== "Sim";
  const maintStatus = noPlan || rng.bool(0.15) ? "Degradada" : "Disponível";
  const conting = rng.bool(0.02);
  const degr = maintStatus === "Degradada" && rng.bool(0.3);
  return {
    origin: rng.bool(0.9) ? rng.pick(ORIGINS) : "",
    installLocal: rng.bool(0.9) ? rng.pick(INSTALL_LOCALS) : "",
    equipTypology: rng.pick(EQUIP_TYPOLOGIES),
    fieldInstalled: rng.bool(0.95) ? "Sim" : "Não",
    fieldOperational: rng.bool(0.9) ? "Sim" : "Não",
    opStatus: rng.bool(0.85) ? "Disponível" : "Indisponivel",
    hasMaintPlan,
    planFollowed: noPlan ? "Verificar" : rng.pick(TRIO),
    failureFree: rng.bool(0.9) ? "Sim" : "Não",
    maintStatus,
    hasContingency: conting ? "Sim" : "Não",
    contingencyDesc: conting ? "Contingência operacional aplicada" : "",
    evidenceCode: conting && rng.bool(0.5) ? "GM-3655.01-2024-T-005" : "",
    degradationDesc: degr
      ? "Leitura instável detectada em inspeção de campo"
      : "",
    extraComments: rng.bool(0.1)
      ? "Acompanhar na próxima janela de manutenção"
      : "",
  };
}
