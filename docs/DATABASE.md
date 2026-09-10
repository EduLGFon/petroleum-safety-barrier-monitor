# Banco de Dados — Monitor de Barreiras

Sem Prisma, sem ORM: SQL puro via `jsr:@db/postgres` (`Pool` Deno-native),
com valores sempre ligados como args `$1/$2` via `queryObject` (nunca
concatenação de input em `text`; `ORDER BY` só pela whitelist `SORTABLE`).

## Setup rápido

```bash
# 1. Suba um Postgres (local, Docker, RDS, Supabase, o que preferir)
#    e crie o banco:
createdb barreiras

# 2. Configure as variáveis de ambiente.
#    Cada task lê um arquivo diferente — não há um único arquivo global:
#      .env.local  ->  deno task db:migrate / db:seed (DATABASE_URL)
#      .env        ->  deno task start (tudo: DATABASE_URL, PUBLIC_*)
#      shell       ->  deno task dev / preview / build NÃO leem --env-file;
#                       exporte no shell: export $(cat .env | xargs)
#    O jeito simples local: cp .env.example .env.local E .env, edite
#    DATABASE_URL nos dois.

# 3. Aplique o schema + seed das tabelas de lookup
deno task db:migrate

# 4. Popule dados de demonstração (reaproveita o gerador mock existente)
deno task db:seed

# 5. Aponte o app para a API real. Em .env (para `start`) ou exportadas
#    no shell (para `dev`):
#    PUBLIC_API_MODE=http
#    PUBLIC_API_BASE_URL=http://localhost:8000

deno task dev   # ou: deno task start (lê .env), deno task preview (shell only)
```

`deno task db:migrate` e `deno task db:seed` são idempotentes: rodar de novo não
duplica nada. Para reseedar do zero: `deno task db:seed -- --force` (isso trunca
`barriers`/`barrier_status_history` com `TRUNCATE ... RESTART IDENTITY CASCADE`
antes de repopular).

## Por que Postgres puro e não um ORM

O contrato de dados já existia antes do banco: `lib/wireTypes.ts` define
exatamente que forma um `WireBarrier` tem (ids numéricos, ver `lib/enums/`), e
`lib/api/http.ts` já sabia como consumir esse formato. Um ORM como
Prisma imporia seu próprio dialeto de schema e geraria os tipos por cima — aqui,
as queries já sabem exatamente qual formato produzir porque esse formato foi
definido primeiro, do lado do frontend. SQL direto com driver Deno-native deixa essa
camada fina: schema.sql declara a verdade, as queries em
`lib/server/sql/` a moldam no formato wire, sem geração de código no
meio do caminho.

## Schema

```
locations           id, code, tipo
disponibilidades     id, label, is_conforme
criticidades          id, label
categorias            id, label
agrupamentos          id, label
tipologias            id, label
donos                 id, label
loc_descs             id, label
authors               id, name

barriers
  id                    identity, PK
  tag                   text
  location_id           → locations
  tipologia_id          → tipologias
  loc_desc_id           → loc_descs
  criticidade_id        → criticidades
  categoria_id          → categorias
  agrupamento_id        → agrupamentos
  dono_id               → donos, nullable (null = "não informado")
  disponibilidade_id    → disponibilidades
  conformidade_id       mantido por trigger, nunca escrito diretamente
  comentarios           text
  plano_acao            text
  status_since          date
  created_at / updated_at

barrier_status_history
  id                    identity, PK
  barrier_id            → barriers, on delete cascade
  date, status_id, author_id, note
```

### Tabelas de lookup = contrato com `lib/enums/`

Cada `id` nas tabelas de lookup **precisa** significar exatamente a mesma coisa
que o `id` correspondente em `lib/enums/` (`codes.ts`, `taxonomy.ts`,
`context.ts`) — é esse acordo que permite ao frontend resolver
`disponibilidade_id: 4` para `'Degradado'` sem nunca consultar o banco para
isso. `db/seed_lookups.sql` popula essas tabelas id-a-id a partir dos mesmos
valores (`ON CONFLICT(id) DO UPDATE`). Se adicionar uma nova
categoria/status/etc., adicione a nova linha (com um novo id) tanto em
`lib/enums/` quanto em `db/seed_lookups.sql` — nunca renumere uma linha
existente enquanto houver barreiras referenciando aquele id. `ALL (0)` é
UI-only, nunca é linha em `locations` (o seed remove `id = 0` se não
referenciado); `donoId = -1` significa "sem linha" (`dono_id NULL`).

### `conformidade_id` é derivado, nunca escrito

Igual ao lado do frontend (`resolveBarrier` em `lib/resolve.ts` nunca confia em
um `conformidadeId` vindo da rede — ele sempre deriva de `disponibilidadeId`), o
banco também nunca aceita uma escrita direta em `conformidade_id`. Um trigger
(`trg_barriers_set_conformidade`, `BEFORE INSERT OR UPDATE OF
disponibilidade_id`) recalcula essa coluna a partir de
`disponibilidades.is_conforme` toda vez que `disponibilidade_id` é definido ou
muda — então as duas nunca podem ficar dessincronizadas, nem por um bug de
aplicação, nem por uma query manual. (`conformidade_id` tem `DEFAULT 1`; não é
`GENERATED` porque a sintaxe nativa proíbe joins e o conjunto conforme vive na
lookup, não em literais.)

`updated_at` é mantido por `trg_barriers_updated_at` (`BEFORE UPDATE` via
`set_updated_at()`).

### O único caminho de escrita: `record_status_change()`

Mudar o status de uma barreira nunca deve ser um
`UPDATE barriers SET
disponibilidade_id = ...` direto — isso deixaria
`status_since` (quando o status atual começou) e `barrier_status_history` (a
timeline exibida no modal de detalhes) desatualizados. A função SQL
`record_status_change(
barrier_id, status_id, author_id, note)` faz as duas
coisas atomicamente: atualiza `disponibilidade_id` + `status_since`
(`current_date`), lança `barrier % does not exist` se ausente, e insere a
linha correspondente no histórico. `lib/server/sql/barriers.ts`'s
`transitionBarrierStatus()` chama exatamente essa função — é o único lugar no
código da aplicação que deveria fazer isso.

Isso já está exposto via `PATCH /api/barriers/:id/status`, mas a UI ainda não
chama esse endpoint — é o caminho natural para quando a feature de "admins podem
editar contingenciamento" for implementada (papéis de acesso ainda não existem
no app).

## Índices

`location_id`, `disponibilidade_id`, `conformidade_id`, `categoria_id` e
`criticidade_id` têm índices simples — são exatamente os campos que
`BarriersQuery` filtra. `status_since` também é indexado, usado pela ordenação
"mais urgente primeiro" (`sortCol=statusSince`). `tag` tem btree simples
(`idx_barriers_tag`): igualdade e prefixo usam índice, `%q%` faz seq-scan —
trigrama (`pg_trgm`) ficou de fora de propósito para não exigir a extensão (o
schema derruba o nome legado `idx_barriers_tag_trgm`). Histórico tem
`idx_history_barrier(barrier_id, date)`.

## Seed de dados de demonstração

`scripts/seed.ts` não reimplementa a geração de dados mock — ele importa
`getWireBarriers()` de `lib/data.ts` (o mesmo gerador determinístico que
alimenta o modo "mock" do app, impl em `lib/mock/generator.ts`) e insere o
resultado no Postgres em lotes de 500 linhas (`BATCH_SIZE`), com
`donoId < 0 → NULL` e `RETURNING id` preservando a ordem para o join do
histórico. Isso garante que os dados de demonstração no banco sejam idênticos,
id a id, ao que o app mostraria em `PUBLIC_API_MODE=mock` — útil para
comparar/depurar os dois modos lado a lado.

`scripts/migrate.ts` aplica `db/schema.sql` + `db/seed_lookups.sql` com um
splitter que respeita corpos dollar-quoted (`$$`), quotes e comentários
(inclusive quotes duplas).

## Arquivos desta camada

| Arquivo                              | Responsabilidade                                                                                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db/schema.sql`                      | DDL completo: tabelas, índices, triggers (`trg_barriers_set_conformidade`, `trg_barriers_updated_at`), funções (`barriers_set_conformidade()`, `set_updated_at()`, `record_status_change()`) |
| `db/seed_lookups.sql`                | Popula as tabelas de lookup a partir de `lib/enums/` (idempotente)                                                                                                                           |
| `scripts/migrate.ts`                 | Aplica os dois arquivos acima contra `DATABASE_URL` (pool size 1)                                                                                                                            |
| `scripts/seed.ts`                    | Popula `barriers`/`barrier_status_history` com dados mock (batches 500, `--force` trunca)                                                                                                    |
| `lib/server/db.ts`                   | Pool Postgres lazy server-only (`globalThis.__barrierPool`, `queryRows<T>`)                                                                                                                  |
| `lib/server/sql/barriers.ts`         | `listBarriers` (paginado + count), `getBarrierById`, `getKpi` (fixos + buckets `GROUP BY`), `transitionBarrierStatus`                                                                        |
| `lib/server/sql/chart.ts`            | `getChartData` (`GROUP BY categoria_id`, `conforme` + `total`)                                                                                                                               |
| `lib/server/sql/vocabularies.ts`     | `getVocabularies()` (labels + counts, SSR-only, sem rota HTTP)                                                                                                                               |
| `lib/server/sql/where.ts`            | `buildWhere` (args `$n`, `escapeLike`), `resolveOrderBy` (whitelist `SORTABLE`)                                                                                                              |
| `lib/server/sql/mappers.ts`          | `SELECT_COLUMNS`, `HISTORY_JOIN` (lateral `json_agg`), `toWireBarrier`, `toHistory`                                                                                                          |
| `routes/api/_params.ts`              | Parsers estritos compartilhados (`parseInt/parseDate/parseQueryParam`)                                                                                                                       |
| `routes/api/barriers.ts`             | `GET /api/barriers`                                                                                                                                                                          |
| `routes/api/barriers/[id].ts`        | `GET /api/barriers/:id`                                                                                                                                                                      |
| `routes/api/barriers/[id]/status.ts` | `PATCH /api/barriers/:id/status` (bonus)                                                                                                                                                     |
| `routes/api/kpi.ts`                  | `GET /api/kpi`                                                                                                                                                                               |
| `routes/api/chart.ts`                | `GET /api/chart`                                                                                                                                                                             |
| `routes/api/health.ts`               | `GET /api/health` (liveness, sem DB)                                                                                                                                                         |
