// Location catalog and pagination defaults - split from lib/constants.ts to keep files small; why: groups station seed data and page sizes used across UI and mock generator.
import type { Location } from "../types.ts";

export const LOCATIONS: Location[] = [
  { code: "ALL", name: "Todas", tipo: "Todas as Instalações" },
  { code: "FAL", name: "FAL", tipo: "Estação Coletora" },
  { code: "CNC", name: "CNC", tipo: "Concessão Norte-Centro" },
  { code: "CNS", name: "CNS", tipo: "Concessão Norte-Sul" },
  { code: "FAP", name: "FAP", tipo: "Planta de Processamento" },
  { code: "RJO", name: "RJO", tipo: "Base Operacional Rio" },
  { code: "SPL", name: "SPL", tipo: "Base Operacional SP" },
];

export const LOCATION_DIST = [
  { code: "FAL", tipo: "Estação Coletora", count: 800 },
  { code: "CNC", tipo: "Concessão Norte-Centro", count: 1200 },
  { code: "CNS", tipo: "Concessão Norte-Sul", count: 900 },
  { code: "FAP", tipo: "Planta de Processamento", count: 700 },
  { code: "RJO", tipo: "Base Operacional Rio", count: 1100 },
  { code: "SPL", tipo: "Base Operacional SP", count: 2100 },
];

// id-keyed variant used by the mock data generator (mirrors LOCATION_CODES in lib/enums.ts)
export const LOCATION_DIST_BY_ID: {
  id: number;
  code: string;
  count: number;
}[] = [
  { id: 1, code: "FAL", count: 800 },
  { id: 2, code: "CNC", count: 1200 },
  { id: 3, code: "CNS", count: 900 },
  { id: 4, code: "FAP", count: 700 },
  { id: 5, code: "RJO", count: 1100 },
  { id: 6, code: "SPL", count: 2100 },
];

export const SIM_DATE = new Date("2026-06-22");
export const PAGE_SIZE = 25;
/** Page-size choices offered by the table pager at any scale. */
export const PAGE_SIZE_OPTS = [25, 50, 100] as const;
