# Camada de API — Monitor de Barreiras Seacrest

## Visão geral

Todo dado que alimenta o dashboard passa por um único ponto de entrada:
**`lib/api.ts`**. Nenhum componente ou hook acessa o gerador mock ou um
backend real diretamente — todos chamam `api.getBarriers(...)`,
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
LOCATION_CODES = { 0: 'ALL', 1: 'FAL', 2: 'CNC', 3: 'CNS', 4: 'FAP', 5: 'RJO', 6: 'SPL' }
toLocationId('FAL')   // -> 1
fromLocationId(1)     // -> 'FAL'

// Disponibilidade
DISPONIBILIDADE_CODES = {
  0: 'Disponível', 1: 'Fora de Operação',
  2: 'Indisponível Contingenciado', 3: 'Degradado Contingenciado',
  4: 'Degradado', 5: 'Indisponível',
}

// Conformidade
CONFORMIDADE_CODES = { 0: 'Conforme', 1: 'Não Conforme' }

// Criticidade
CRITICIDADE_CODES = { 0: 'Não Crítica', 1: 'Crítica' }

// Categoria da barreira, Agrupamento, Tipologia, Dono, Local descritivo,
// Autor do histórico — todos seguem o mesmo padrão (veja lib/enums.ts).
```

Cada domínio expõe `toXId(string) -> number` e `fromXId(number) -> string`.

## Tipos "wire" vs tipos de domínio

- **`lib/wireTypes.ts`** — `WireBarrier`, `WireKpiSnapshot`, `BarriersQuery`,
  `BarriersResponse`: exatamente o que trafega na rede (só números + poucos
  campos de texto livre como `tag`, `comentarios`, `planoAcao`).
- **`lib/types.ts`** — `Barrier`, `KpiSnapshot`: os tipos de domínio que a UI
  usa, sempre com strings já resolvidas e legíveis.
- **`lib/resolve.ts`** — converte `WireBarrier -> Barrier` (e o inverso não é
  necessário, pois o frontend nunca precisa reconverter para IDs ao exibir).

Importante: `conformidade` **nunca** vem do backend — é sempre derivada de
`disponibilidadeId` via `isConforme()`, tanto no mock quanto no resolver.
Isso evita que os dois campos fiquem inconsistentes.

## Trocando para uma API real

1. Implemente os três endpoints REST esperados por `httpAdapterFactory`:
   - `GET /api/barriers?locationId=1&disponibilidadeId=4&page=1&pageSize=25`
     → `BarriersResponse { items: WireBarrier[], total, page, pageSize, totalPages }`
   - `GET /api/barriers/:id` → `WireBarrier`
   - `GET /api/kpi?locationId=1` → `WireKpiSnapshot`
2. Defina as variáveis de ambiente (veja `.env.example`):
   ```
   NEXT_PUBLIC_API_MODE=http
   NEXT_PUBLIC_API_BASE_URL=https://seu-backend.com
   ```
3. Nenhum componente precisa mudar. `api` em `lib/api.ts` passa a apontar
   para `httpAdapter` automaticamente.

## Query de filtros (string -> wire)

A função `toWireQuery()` em `lib/api.ts` converte os filtros que a UI usa
(strings como `'Degradado'`, `'FAL'`) para o `BarriersQuery` numérico que
tanto o mock quanto o backend real esperam:

```ts
toWireQuery({ location:'FAL', disponibilidade:'Degradado', page:1 })
// -> { locationId: 1, disponibilidadeId: 4, page: 1 }
```

## Arquivos desta camada

| Arquivo              | Responsabilidade                                          |
|-----------------------|------------------------------------------------------------|
| `lib/enums.ts`        | Resolvers numéricos para todos os domínios enumeráveis     |
| `lib/wireTypes.ts`    | Formato de dados que trafega na rede (ids numéricos)       |
| `lib/resolve.ts`      | Converte `WireBarrier` → `Barrier` (domínio, legível)      |
| `lib/data.ts`         | Gerador mock determinístico — produz `WireBarrier[]`       |
| `lib/api.ts`          | Cliente unificado — expõe `api.*`, escolhe mock ou HTTP    |
| `lib/constants.ts`    | Constantes de exibição (cores, listas) + `LOCATION_DIST_BY_ID` |
