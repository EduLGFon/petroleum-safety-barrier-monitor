# Camada de API — Monitor de Barreiras

## Visão geral

Todo dado que alimenta o dashboard passa por um único ponto de entrada:
**`lib/api.ts`**. Nenhum componente ou hook acessa o gerador mock ou um backend
real diretamente — todos chamam `api.getBarriers(...)`,
`api.getAllBarriers(...)`, `api.getBarrierById(...)` ou `api.getKpi(...)`.

```
components/Dashboard.tsx
        │
        ▼
hooks/useDashboard.ts
        │
        ▼
   lib/api.ts  ◄── ponto único de entrada
   ├── mockAdapter  (lib/data.ts — gerador determinístico)
   └── httpAdapter  (fetch real, mesmo contrato)
```

## Formato "wire" (números, não texto)

Um backend real troca dados por **códigos numéricos**, nunca strings de
exibição. Isso evita payloads grandes, problemas de localização e permite
renomear rótulos sem quebrar contratos.

Todo domínio enumerável tem um resolver em **`lib/enums.ts`**:

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
// Autor do histórico — todos seguem o mesmo padrão (veja lib/enums.ts).
```

Cada domínio expõe `toXId(string) -> number | undefined` (undefined = valor
desconhecido, o filtro é ignorado com warning) e `fromXId(number) -> string`
(sentindela explícita tipo `ST-7`, nunca um rótulo conhecido plausível).

## Tipos "wire" vs tipos de domínio

- **`lib/wireTypes.ts`** — `WireBarrier`, `WireKpiSnapshot`, `BarriersQuery`,
  `BarriersResponse`: exatamente o que trafega na rede (só números + poucos
  campos de texto livre como `tag`, `comentarios`, `planoAcao`).
- **`lib/types.ts`** — `Barrier`, `KpiSnapshot`: os tipos de domínio que a UI
  usa, sempre com strings já resolvidas e legíveis.
- **`lib/resolve.ts`** — converte `WireBarrier -> Barrier` (e o inverso não é
  necessário, pois o frontend nunca precisa reconverter para IDs ao exibir).

Importante: `conformidade` **nunca** vem do backend — é sempre derivada de
`disponibilidadeId` via `isConforme()`, tanto no mock quanto no resolver. Isso
evita que os dois campos fiquem inconsistentes.

`WireKpiSnapshot` carrega os campos fixos mais os buckets dinâmicos opcionais
`byDisponibilidade`, `byConformidade`, `byCriticidade` (chaves = id numérico
como string) e `syncedAt` (ISO do servidor). `resolveKpi` traduz as chaves
para strings de exibição; quando os buckets estão ausentes a UI usa os campos
fixos (só cobre os status conhecidos).

## Usando a API real (Postgres)

Os três endpoints que `httpAdapterFactory` espera já estão implementados em
`routes/api/`, sobre PostgreSQL (sem ORM — SQL puro via the Deno-native driver):

- `GET /api/barriers?locationId=1&disponibilidadeId=4&page=1&pageSize=25` →
  `BarriersResponse { items: WireBarrier[], total, page, pageSize, totalPages }`
- `GET /api/barriers/:id` → `WireBarrier`
- `GET /api/kpi?locationId=1` → `WireKpiSnapshot`
- `GET /api/chart?locationId=1` → `WireCategoryConformidade[]`
- `GET /api/health` → `{ ok, time }` (liveness, sem DB)
- `PATCH /api/barriers/:id/status` → `WireBarrier` (bonus: único caminho de
  escrita, ainda não chamado pela UI — veja docs/DATABASE.md)

Em `PUBLIC_API_MODE=http` o dashboard pagina pelo servidor (`useServerDashboard`):
páginas via `getBarriers`, KPI via `getKpi`, gráfico via `getChartData` e
vocabulários via SSR (`getVocabularies`). Export cobre a página carregada.

Para ativar:

1. Suba um Postgres e rode as migrações + seed (veja **docs/DATABASE.md** para o
   passo a passo completo).
2. Defina as variáveis de ambiente (veja `.env.example`):
   ```
   PUBLIC_API_MODE=http
   PUBLIC_API_BASE_URL=http://localhost:8000
   DATABASE_URL=postgres://user:password@localhost:5432/barreiras
   ```
3. Nenhum componente precisa mudar. `api` em `lib/api.ts` passa a apontar para
   `httpAdapter` automaticamente, que agora conversa com essas rotas.

Toda a camada SQL (`lib/server/db.ts`, `lib/server/sql/barriers.ts`) é
server-only (guardada pelo limite server/routes (nunca importada em islands)) — a connection string do
Postgres nunca chega ao bundle do cliente.

## Query de filtros (string -> wire)

A função `toWireQuery()` em `lib/api.ts` converte os filtros que a UI usa
(strings como `'Degradado'`, `'FAL'`) para o `BarriersQuery` numérico que tanto
o mock quanto o backend real esperam:

```ts
toWireQuery({ location: "FAL", disponibilidade: "Degradado", page: 1 });
// -> { locationId: 1, disponibilidadeId: 4, page: 1 }
```

## Arquivos desta camada

| Arquivo                      | Responsabilidade                                               |
| ---------------------------- | -------------------------------------------------------------- |
| `lib/enums.ts`               | Resolvers numéricos para todos os domínios enumeráveis         |
| `lib/wireTypes.ts`           | Formato de dados que trafega na rede (ids numéricos)           |
| `lib/resolve.ts`             | Converte `WireBarrier` → `Barrier` (domínio, legível)          |
| `lib/data.ts`                | Gerador mock determinístico — produz `WireBarrier[]`           |
| `lib/api.ts`                 | Cliente unificado — expõe `api.*`, escolhe mock ou HTTP        |
| `lib/constants.ts`           | Constantes de exibição (cores, listas) + `LOCATION_DIST_BY_ID` |
| `lib/server/db.ts`           | Cliente Postgres (server routes only)                          |
| `lib/server/sql/barriers.ts` | Queries SQL: listagem, filtro, sort, KPI, transição de status  |
| `routes/api/`                | Route handlers Fresh que expõem as queries acima via HTTP      |
| `db/schema.sql`              | DDL: tabelas de lookup, `barriers`, `barrier_status_history`   |
| `db/seed_lookups.sql`        | Seed das tabelas de lookup, espelhando `lib/enums.ts`          |

Veja **docs/DATABASE.md** para o schema completo e o passo a passo de setup.
