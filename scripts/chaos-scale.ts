// Chaos scale check - proves the UI logic survives future catalog growth.
// This is why it exists: synthesizes 50 stations x 100 categories (50k rows)
// plus brand new status/criticality values, then asserts every dynamic-data
// contract (KPI reconciliation, chart derivation, filter vocabularies,
// color/label fallbacks, pagination). Run with: deno run scripts/chaos-scale.ts
import type { Barrier } from "../lib/types.ts";
import {
  applyFilters,
  computeChartData,
  computeKpi,
  paginate,
} from "../lib/utils.ts";
import {
  confColorFor,
  critColorFor,
  dispColorFor,
  distinctBy,
  shortStatusLabel,
} from "../lib/constants.ts";

const STATIONS = 50, CATS = 100, PER_COMBO = 10;
const NEW_DISP = "Em Comissionamento";
const NEW_CONF = "Parcialmente Conforme";
const NEW_CRIT = "Muito Crítica";
const DISPS = ["Disponível", "Degradado", "Indisponível", NEW_DISP];

function build(): Barrier[] {
  const out: Barrier[] = [];
  let id = 1;
  for (let s = 0; s < STATIONS; s++) {
    for (let c = 0; c < CATS; c++) {
      for (let k = 0; k < PER_COMBO; k++) {
        const disp = DISPS[(s + c + k) % DISPS.length];
        const conf = (s + c) % 11 === 0
          ? NEW_CONF
          : disp === "Disponível"
          ? "Conforme"
          : "Não Conforme";
        out.push({
          id: id++,
          tag: `ST${s}-CAT${c}-${k}`,
          tipologia: `Tipologia ${s % 9}`,
          instalacao: s < 6
            ? ["FAL", "CNC", "CNS", "FAP", "RJO", "SPL"][s]
            : `ST-${s}`,
          locDesc: "Chaos rig",
          criticidade: (s + c + k) % 13 === 0 ? NEW_CRIT : "Crítica",
          categoria: `Categoria de Teste ${c}`,
          agrupamento: "Chaos",
          dono: `Dono ${s % 12}`,
          disponibilidade: disp,
          conformidade: conf,
          comentarios: "",
          planoAcao: "",
          statusSince: "2026-01-01",
          statusHistory: [],
        });
      }
    }
  }
  return out;
}

let failures = 0;
function check(name: string, cond: boolean, extra = "") {
  console.log(`${cond ? "PASS" : "FAIL"} ${name}${extra ? ` (${extra})` : ""}`);
  if (!cond) failures++;
}

const data = build();
check(
  "dataset size",
  data.length === STATIONS * CATS * PER_COMBO,
  `${data.length}`,
);

const kpi = computeKpi(data);
const bucketSum = Object.values(kpi.byDisponibilidade ?? {}).reduce(
  (a, b) => a + b,
  0,
);
check(
  "KPI buckets reconcile to total",
  bucketSum === kpi.total,
  `${bucketSum}/${kpi.total}`,
);
check(
  "new disponibilidade counted",
  (kpi.byDisponibilidade?.[NEW_DISP] ?? 0) > 0,
);
check("new conformidade counted", (kpi.byConformidade?.[NEW_CONF] ?? 0) > 0);
check("new criticidade counted", (kpi.byCriticidade?.[NEW_CRIT] ?? 0) > 0);
check(
  "fixed conforme reconciles to total",
  kpi.conforme + kpi.naoConforme === kpi.total,
  `${kpi.conforme}+${kpi.naoConforme}/${kpi.total}`,
);
check(
  "novel conformidade fails closed into NC",
  (kpi.byConformidade?.[NEW_CONF] ?? 0) > 0 &&
    kpi.naoConforme >= (kpi.byConformidade?.[NEW_CONF] ?? 0),
);

const chart = computeChartData(data);
check(
  "chart derives one row per category",
  chart.length === CATS,
  `${chart.length}`,
);
check(
  "chart sorted biggest-first",
  chart.every((r, i, a) =>
    i === 0 ||
    (a[i - 1].Conforme + a[i - 1]["Não Conforme"]) >=
      (r.Conforme + r["Não Conforme"])
  ),
);

const stations = distinctBy(data, (b) => b.instalacao);
check(
  "all stations discovered",
  stations.length === STATIONS,
  `${stations.length}`,
);
const cats = distinctBy(data, (b) => b.categoria);
check(
  "all categories discovered",
  cats.length === CATS,
  `${cats.length}`,
);

const newStatusRows = applyFilters(data, {
  query: "",
  disponibilidade: NEW_DISP,
  conformidade: "",
  categoria: "",
  page: 1,
  pageSize: 25,
  sortCol: "id",
  sortDir: "asc",
});
check(
  "filter selects new status",
  newStatusRows.length > 0,
  `${newStatusRows.length}`,
);
check(
  "filter result matches bucket",
  newStatusRows.length === kpi.byDisponibilidade?.[NEW_DISP],
);

const pages = Math.ceil(data.length / 100);
const last = paginate(data, pages, 100);
check(
  "pagination covers tail",
  last.length > 0 && last.length <= 100,
  `${last.length}`,
);

const c1 = dispColorFor(NEW_DISP), c2 = dispColorFor(NEW_DISP);
check("fallback colors deterministic", c1.solid === c2.solid, c1.solid);
check(
  "fallback differs per value",
  dispColorFor(NEW_DISP).solid !== dispColorFor("Outro Novo Status").solid,
);
check("known color intact", dispColorFor("Disponível").solid === "#22c55e");
check(
  "conf/crit fallbacks defined",
  !!confColorFor(NEW_CONF).solid && !!critColorFor(NEW_CRIT).solid,
);
check(
  "short label known",
  shortStatusLabel("Indisponível Contingenciado") === "Indisp. Cont.",
);
check(
  "short label future",
  shortStatusLabel("Em Comissionamento Extra Longo Nome") ===
    "Em Comissionamento",
);

if (failures) {
  console.error(`\n${failures} chaos check(s) failed`);
  Deno.exit(1);
}
console.log(
  "\nChaos scale check passed: " +
    `${data.length} rows, ${STATIONS} stations, ${CATS} categories, ` +
    "new vocabularies.",
);
