# Camada de API — Monitor de Barreiras

## Visão geral

Todo dado que alimenta o dashboard passa por um único ponto de entrada:
**`lib/api.ts`** (barrel sobre `lib/api/*`). Nenhum componente ou hook acessa
o gerador mock ou um backend real diretamente — todos chamam
`api.getBarriers(...)`, `api.getAllBarriers(...)`, `api.getBarrierById(...)`,
`api.getKpi(...)` ou `api.getChartData(...)`.

```
routes/index.tsx (SSR: lista full em mock, vocabulários em http)
        │
        ▼
islands/Dashboard.tsx (island root: Settings + Theme providers)
        │
        ▼
islands/dashboard/DashboardView.tsx (ClientView vs ServerView)
        │
        ├── mock: hooks/useDashboard.ts (agregação client-side)
        └── http: hooks/dashboard/server.ts (páginas via fetch)
                │
                ▼
           lib/api.ts  ◄── ponto único de entrada
           ├── mockAdapter (lib/api/mock.ts sobre lib/mock/generator.ts)
           └── httpAdapterFactory(baseUrl) (lib/api/http.ts sobre fetch)
```

## Formato "wire" (números, não texto)

Um backend real troca dados por **códigos numéricos**, nunca strings de
exibição. Isso evita payloads grandes, problemas de localização e permite
renomear rótulos sem quebrar contratos.

Todo domínio enumerável tem um resolver em **`lib/enums/`** (barrel
`lib/enums.ts` sobre `codes.ts`, `taxonomy.ts`, `context.ts`):

```ts
// Localização (instalação)
LOCATION_CODES = {
  0: "ALL",
  1: "FAL",
  2: "CNC",
  3: "CNS",
  4: "FAP",
  5: "RJO",
  6: "SPL",
};
toLocationId("FAL"); // -> 1
fromLocationId(1); // -> 'FAL'

// Disponibilidade
DISPONIBILIDADE_CODES = {
  0: "Disponível",
  1: "Fora de Operação",
  2: "Indisponível Contingenciado",
  3: "Degradado Contingenciado",
  4: "Degradado",
  5: "Indisponível",
};

// Conformidade
CONFORMIDADE_CODES = { 0: "Conforme", 1: "Não Conforme" };

// Criticidade
CRITICIDADE_CODES = { 0: "Não Crítica", 1: "Crítica" };

// Categoria da barreira, Agrupamento, Tipologia, Dono, Local descritivo,
// Autor do histórico — todos seguem o mesmo padrão (veja lib/enums/).
```

Cada domínio expõe `toXId(string) -> number | undefined` (undefined = valor
desconhecido, o filtro é ignorado com warning) e `fromXId(number) -> string`
(sentindela explícita tipo `ST-7`, nunca um rótulo conhecido plausível).

## Tipos "wire" vs tipos de domínio

- **`lib/wireTypes.ts`** — `WireBarrier`, `WireStatusHistoryEntry`,
  `WireKpiSnapshot`, `WireCategoryConformidade`, `BarriersQuery`,
  `BarriersResponse`: exatamente o que trafega na rede (só números + poucos
  campos de texto livre como `tag`, `comentarios`, `planoAcao`).
- **`lib/types.ts`** — `Barrier`, `KpiSnapshot`, `CategoryConformidade`,
  `Vocabularies`, `FilterState`, `SortableColumn`, `StatusHistoryEntry`: os
  tipos de domínio que a UI usa, sempre com strings já resolvidas e legíveis.
  Vocabulários usam uniões abertas (`string & {}`) para valores novos de
  estação compilarem sem code change.
- **`lib/api/types.ts`** — `BarriersApi` (5 métodos) + `DomainQuery` (filtros
  em strings que a UI usa).
- **`lib/resolve.ts`** — `resolveBarrier(s)`, `resolveHistoryEntry`,
  `resolveKpi`, `resolveChartData`: converte wire -> domínio (o inverso não é
  necessário, pois o frontend nunca precisa reconverter para IDs ao exibir).

Importante: `conformidade` **nunca** trafega em `WireBarrier` — é sempre
derivada de `disponibilidadeId` via `isConforme()`, no mock
(`lib/api/mock.ts`), no resolver (`resolveBarrier`) e no banco via trigger
(`trg_barriers_set_conformidade` sobre a coluna armazenada
`barriers.conformidade_id`, usada só para filtro/agregação SQL).

`WireKpiSnapshot` carrega os campos fixos mais os buckets dinâmicos opcionais
`byDisponibilidade`, `byConformidade`, `byCriticidade` (chaves = id numérico
como string) e `syncedAt` (ISO do servidor). `resolveKpi` traduz as chaves
para strings de exibição (chaves já-string passam intactas para compat com
servidores antigos); quando os buckets estão ausentes a UI usa os campos
fixos (só cobre os status conhecidos).

`WireCategoryConformidade` carrega `{ categoriaId, conforme, total }`;
`resolveChartData` deriva `Não Conforme = max(0, total - conforme)`
(fail-closed, igual a `computeChartData`) e trunca nomes além de 26 chars.

## Usando a API real (Postgres)

Os seis handlers que `httpAdapterFactory` espera já estão implementados em
`routes/api/`, sobre PostgreSQL (sem ORM — SQL puro via `jsr:@db/postgres`,
valores ligados como `$1/$2`):

- `GET /api/barriers?locationId=1&disponibilidadeId=4&conformidadeId=1&categoriaId=2&query=FAL&since=2024-01-01&until=2024-12-31&page=1&pageSize=25&sortCol=statusSince&sortDir=desc` →
  `BarriersResponse { items: WireBarrier[], total, page, pageSize, totalPages }`
  - `locationId` omitido/`0` = todas; `query` casa `tag ILIKE %q% OR loc.code`
    (`\%_` escapados, cap 200 chars); `since`/`until` = `YYYY-MM-DD` sobre
    `status_since`; `page` default 1 (floor, min 1); `pageSize` default 25
    (clamp `1..100000`); `sortCol` whitelist
    (`id/tag/criticidade/categoria/disponibilidade/conformidade/statusSince`,
    default `id`); parsers estritos em `routes/api/_params.ts`; `500 {error}`
    em falha de DB.
- `GET /api/barriers/:id` → `WireBarrier` (`400` id inválido, `404` ausente)
- `PATCH /api/barriers/:id/status` com
  `{ statusId: int >= 0, authorId: int >= 0, note?: string (cap 2000) }` →
  `WireBarrier` atualizado via `record_status_change()` (`400` corpo
  inválido, `404` ausente). Bonus: único caminho de escrita, ainda não
  chamado pela UI — veja docs/DATABASE.md.
- `GET /api/kpi?locationId=1` → `WireKpiSnapshot` (só `locationId`;
  omitido/`0` = todas; demais params ignorados)
- `GET /api/chart?locationId=1` → `WireCategoryConformidade[]` (mesmo escopo)
- `GET /api/health` → `{ ok, time }` (liveness, sem DB)

Sem rota `/api/vocabularies`: em modo http `routes/index.tsx` faz SSR de
`getVocabularies()` (`lib/server/sql/vocabularies.ts`) e entrega
`Vocabularies { locations, disponibilidades, conformidades, categorias }`
como prop da island. Em modo mock o cliente deriva as opções via
`useDashboardVocabularies` (`islands/dashboard/vocabularies.ts`).

Em `PUBLIC_API_MODE=http` o dashboard pagina pelo servidor
(`useServerDashboard` em `hooks/dashboard/server.ts`): páginas via
`getBarriers` (filtros completos), KPI via `getKpi` e gráfico via
`getChartData` (ambos só com `locationId`), com cancelamento, loading, error
card/banner e retry. `getAllBarriers` em http força `pageSize: 100000`.
Export cobre a página carregada; detalhe resolve da página atual.

Para ativar:

1. Suba um Postgres e rode as migrações + seed (veja **docs/DATABASE.md** para o
   passo a passo completo).
2. Defina as variáveis de ambiente (veja `.env.example`):
   ```
   PUBLIC_API_MODE=http
   PUBLIC_API_BASE_URL=http://localhost:8000
   DATABASE_URL=postgres://user:password@localhost:5432/barreiras
   ```
   (`dev` lê do shell — `export $(cat .env | xargs)`; `start` lê `.env`;
   `db:*` leem `.env.local`.)
3. Nenhum componente precisa mudar. `api` em `lib/api.ts` passa a apontar para
   `httpAdapter` automaticamente, que agora conversa com essas rotas.

Toda a camada SQL (`lib/server/db.ts`, `lib/server/sql/*`) é server-only
(nunca importada em `islands/`) — a connection string do Postgres nunca chega
ao bundle do cliente. `lib/server/db.ts` usa pool lazy em
`globalThis.__barrierPool` (import nunca lança; primeira query lança sem
`DATABASE_URL`).

## Query de filtros (string -> wire)

A função `toWireQuery()` em `lib/api/query.ts` (re-exportada por
`lib/api.ts`) converte os filtros que a UI usa (strings como `'Degradado'`,
`'FAL'`) para o `BarriersQuery` numérico que tanto o mock quanto o backend
real esperam. Valores desconhecidos são pulados com `console.warn`.
`cleanDateParam` aceita `YYYY-MM-DD` (ou ISO mais longo) e `buildQueryString`
serializa para a URL:

```ts
toWireQuery({ location: "FAL", disponibilidade: "Degradado", page: 1 });
// -> { locationId: 1, disponibilidadeId: 4, page: 1 }
```

## Arquivos desta camada

| Arquivo                              | Responsabilidade                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------- |
| `lib/api.ts`                         | Barrel: escolhe mock vs HTTP via `PUBLIC_API_MODE`, re-exporta `toWireQuery` + `mockApi` |
| `lib/api/types.ts`                   | `BarriersApi` (5 métodos) + `DomainQuery` (filtros em strings)                           |
| `lib/api/query.ts`                   | `toWireQuery`, `cleanDateParam`, `buildQueryString`                                      |
| `lib/api/mock.ts`                    | `mockAdapter`: `matchesQuery` + `sortWire` numéricos, resolve só a página final          |
| `lib/api/http.ts`                    | `httpAdapterFactory(baseUrl)`: fetch sobre `routes/api/*`; `null` só em 404              |
| `lib/enums.ts`                       | Barrel sobre `lib/enums/`                                                                |
| `lib/enums/codes.ts`                 | `LOCATION/DISPONIBILIDADE/CONFORMIDADE/CRITICIDADE` + `to/fromXId`                       |
| `lib/enums/taxonomy.ts`              | `CATEGORIA/AGRUPAMENTO/TIPOLOGIA/DONO` (`donoId -1` = vazio)                             |
| `lib/enums/context.ts`               | `LOC_DESC/AUTHOR` (`from*` apenas)                                                       |
| `lib/wireTypes.ts`                   | Formato de rede (ids numéricos; sem `conformidadeId` em `WireBarrier`)                   |
| `lib/types.ts`                       | Domínio da UI (strings resolvidas, uniões abertas, `Vocabularies`)                       |
| `lib/resolve.ts`                     | `resolveBarrier(s)`, `resolveHistoryEntry`, `resolveKpi`, `resolveChartData`             |
| `lib/data.ts`                        | Barrel sobre `lib/mock/` (gerador determinístico)                                        |
| `lib/mock/generator.ts`              | `getWireBarriers()` cached (`0xdeadbeef`, dists de status/estação)                       |
| `lib/mock/history.ts`                | `generateHistory` + comentários/planos/notas por status                                  |
| `lib/mock/tags.ts`                   | `buildTag` + prefixos por categoria                                                      |
| `lib/mock/rng.ts`                    | PRNG com seed (`next/int/pick/bool`)                                                     |
| `lib/constants.ts`                   | Barrel sobre `lib/constants/`                                                            |
| `lib/constants/locations.ts`         | `LOCATIONS`, `LOCATION_DIST_BY_ID`, `SIM_DATE`, `PAGE_SIZE(_OPTS)`                       |
| `lib/constants/catalog.ts`           | Listas seed (categorias, agrupamentos, tipologias, donos, locs, autores)                 |
| `lib/constants/helpers.ts`           | `isConforme()` + `distinctBy()`                                                          |
| `lib/constants/colors.ts`            | Cores por status + `DISP_KNOWN_ORDER`, `shortStatusLabel`                                |
| `lib/server/db.ts`                   | Pool Postgres lazy server-only (`globalThis.__barrierPool`)                              |
| `lib/server/sql/barriers.ts`         | `listBarriers`, `getBarrierById`, `getKpi`, `transitionBarrierStatus`                    |
| `lib/server/sql/chart.ts`            | `getChartData` (`GROUP BY categoria_id`)                                                 |
| `lib/server/sql/vocabularies.ts`     | `getVocabularies()` SSR-only (sem rota HTTP)                                             |
| `lib/server/sql/where.ts`            | `buildWhere`, `resolveOrderBy` (whitelist), `escapeLike`                                 |
| `lib/server/sql/mappers.ts`          | `SELECT_COLUMNS`, `HISTORY_JOIN` (lateral `json_agg`), `toWireBarrier`                   |
| `routes/api/_params.ts`              | Parsers estritos (`parseInt/parseDate/parseQueryParam`); nunca é rota (`_` prefix)       |
| `routes/api/barriers.ts`             | `GET /api/barriers`                                                                      |
| `routes/api/barriers/[id].ts`        | `GET /api/barriers/:id`                                                                  |
| `routes/api/barriers/[id]/status.ts` | `PATCH /api/barriers/:id/status` (bonus)                                                 |
| `routes/api/kpi.ts`                  | `GET /api/kpi`                                                                           |
| `routes/api/chart.ts`                | `GET /api/chart`                                                                         |
| `routes/api/health.ts`               | `GET /api/health` (liveness, sem DB)                                                     |
| `islands/dashboard/vocabularies.ts`  | Hook client `useDashboardVocabularies` (só mock mode)                                    |
| `db/schema.sql`                      | DDL: tabelas de lookup, `barriers`, `barrier_status_history`                             |
| `db/seed_lookups.sql`                | Seed das tabelas de lookup, espelhando `lib/enums/`                                      |

Veja **docs/DATABASE.md** para o schema completo e o passo a passo de setup,
e **docs/ARCHITECTURE.md** para os fluxos mock vs http e a topologia da island.
