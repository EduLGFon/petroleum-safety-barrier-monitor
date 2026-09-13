// API query conversion - domain filters to numeric wire query plus URL encoding.
// This is why it exists: one place for toWireQuery (with unknown-value
// warnings) and buildQueryString, shared by mock and HTTP adapters.
import {
  toCategoriaId,
  toConformidadeId,
  toDisponibilidadeId,
  toLocationId,
} from "../enums.ts";
import type { BarriersQuery } from "../wireTypes.ts";
import type { DomainQuery } from "./types.ts";

// Accepts YYYY-MM-DD (or longer ISO starting with a valid date); else undefined.
export function cleanDateParam(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const date = v.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined;
}

/** Converts UI-facing string filters into the numeric wire query the API expects.
 *  Unknown vocabulary values are skipped (with a warning) instead of silently
 *  mapping to a wrong known id — the server will learn the new value first. */
export function toWireQuery(f: DomainQuery): BarriersQuery {
  const q: BarriersQuery = {};
  if (f.location && f.location !== "ALL") {
    const id = toLocationId(f.location);
    if (id === undefined) {
      console.warn(`[toWireQuery] unknown location: ${f.location}`);
    } else q.locationId = id;
  }
  if (f.disponibilidade) {
    const id = toDisponibilidadeId(f.disponibilidade as never);
    if (id === undefined) {
      console.warn(
        `[toWireQuery] unknown disponibilidade: ${f.disponibilidade}`,
      );
    } else q.disponibilidadeId = id;
  }
  if (f.conformidade) {
    const id = toConformidadeId(f.conformidade as never);
    if (id === undefined) {
      console.warn(`[toWireQuery] unknown conformidade: ${f.conformidade}`);
    } else q.conformidadeId = id;
  }
  if (f.categoria) {
    const id = toCategoriaId(f.categoria);
    if (id === undefined) {
      console.warn(`[toWireQuery] unknown categoria: ${f.categoria}`);
    } else q.categoriaId = id;
  }
  if (f.query) q.query = f.query;
  const since = cleanDateParam(f.since);
  if (since) q.since = since;
  const until = cleanDateParam(f.until);
  if (until) q.until = until;
  if (f.page) q.page = f.page;
  if (f.pageSize) q.pageSize = f.pageSize;
  if (f.sortCol) q.sortCol = f.sortCol;
  if (f.sortDir) q.sortDir = f.sortDir;
  return q;
}

// Serializes wire query to URL search string, skipping empty values.
export function buildQueryString(q: BarriersQuery): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  return params.toString();
}
