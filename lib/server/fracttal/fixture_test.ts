// Fixture sanity tests (P3): the synthetic asset fixture must parse, then
// map to the scenarios it claims — 3 mapped inserts + 2 deliberate skips
// (unmapped categoria typo, unknown station). Guards drift in the fixture.
import { assertStrictEquals } from "jsr:@std/assert@^1";
import { parsePage } from "./client.ts";
import { mapAsset, type MapContext } from "./map.ts";
import { planReconcile } from "./sync.ts";

const ctx: MapContext = {
  locationIds: { FAL: 1 },
  categoriaIds: {
    "Sistema de Combate a Incêndio": 7,
    "Sistema de Detecção de Gás": 8,
    "Válvula de Alívio de Pressão": 9,
  },
  criticidadeIds: { "Crítica": 1, "Não Crítica": 2 },
};

async function loadFixture(): Promise<unknown[]> {
  const url = new URL(
    "../../../scripts/fixtures/fracttal-assets-sample.json",
    import.meta.url,
  );
  const text = await Deno.readTextFile(decodeURIComponent(url.pathname));
  const json = JSON.parse(text) as {
    meta?: { synthetic?: boolean };
    items?: unknown[];
  };
  assertStrictEquals(
    json.meta?.synthetic,
    true,
    "fixture must stay labeled synthetic",
  );
  assertStrictEquals(Array.isArray(json.items), true);
  return json.items ?? [];
}

Deno.test("fixture parses to 5 valid rows", async () => {
  const parsed = parsePage({ data: await loadFixture() });
  assertStrictEquals(parsed.items.length, 5);
  assertStrictEquals(parsed.malformed.length, 0);
});

Deno.test("fixture maps to 3 inserts and 2 deliberate skips", async () => {
  const parsed = parsePage({ data: await loadFixture() });
  const inputs = [];
  const skips: string[] = [];
  for (const item of parsed.items) {
    const mapped = mapAsset(item, ctx);
    if (mapped.ok) inputs.push(mapped.input);
    else skips.push(item.code);
  }
  assertStrictEquals(inputs.length, 3);
  assertStrictEquals(skips.join(","), "FAL-EQ-004,X9-UNKNOWN-LOC");

  // The two deliberate skips are the typo categoria and the unknown station.
  const plan = planReconcile(inputs, []);
  assertStrictEquals(plan.counts.inserts, 3);
  assertStrictEquals(plan.counts.updates, 0);
  assertStrictEquals(plan.counts.deletes, 0);
  assertStrictEquals(plan.counts.skips, 0);

  // FAL-EQ-002 is unavailable -> Indisponível.
  const unavailable = inputs.find((i) => i.externalCode === "FAL-EQ-002");
  assertStrictEquals(unavailable?.disponibilidadeId, 5);
});
