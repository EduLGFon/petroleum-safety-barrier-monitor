// Location catalog and pagination defaults - split from lib/constants.ts to keep files small; why: groups station seed data and page sizes used across UI and mock generator.
import type { Location } from "../types.ts";

export const LOCATIONS: Location[] = [
  { code: "ALL", name: "Todas", type: "Todas as Instalações" },
  { code: "FAL", name: "Fazenda Alegre", type: "Estação Coletora" },
  { code: "SML", name: "São Mateus Leste", type: "Estação Coletora" },
  { code: "FSR", name: "Fazenda São Rafael", type: "Estação Coletora" },
  { code: "IBU", name: "Inhambu", type: "Campo" },
  { code: "FSL", name: "Fazenda Santa Luzia", type: "Estação Coletora" },
  { code: "CNC", name: "Cancã", type: "Estação de Vapor" },
  { code: "JCT", name: "Jacutinga", type: "Campo" },
  { code: "FSJ", name: "Fazenda São Jorge", type: "Campo" },
];

// id-keyed variant used by the mock data generator (mirrors LOCATION_CODES in lib/enums.ts)
export const LOCATION_DIST_BY_ID: {
  id: number;
  code: string;
  count: number;
}[] = [
  { id: 1, code: "FAL", count: 3350 },
  { id: 2, code: "SML", count: 830 },
  { id: 3, code: "FSR", count: 810 },
  { id: 4, code: "IBU", count: 590 },
  { id: 5, code: "FSL", count: 550 },
  { id: 6, code: "CNC", count: 550 },
  { id: 7, code: "JCT", count: 85 },
  { id: 8, code: "FSJ", count: 35 },
];

export const SIM_DATE = new Date("2026-06-22");
export const PAGE_SIZE = 25;
/** Page-size choices offered by the table pager at any scale. */
export const PAGE_SIZE_OPTS = [25, 50, 100] as const;
