# API layer - Barrier Monitor

Single entry point `lib/api.ts` (barrel over `lib/api/*`). No component/hook accesses mock generator or backend directly; all call `api.getBarriers(...)`, `api.getAllBarriers(...)`, `api.getBarrierById(...)`, `api.getKpi(...)`, `api.getChartData(...)`.

```
routes/index.tsx (SSR)
  -> islands/Dashboard.tsx (providers)
  -> DashboardView (ClientView vs ServerView)
     mock: hooks/useDashboard.ts
     http: hooks/dashboard/server.ts -> lib/api.ts
            mockAdapter (lib/api/mock.ts) | httpAdapterFactory(baseUrl) (lib/api/http.ts)
```

## Wire format (numbers, not text)

Real backend exchanges numeric codes, never display strings. Resolvers in `lib/enums/` (barrel over codes.ts, taxonomy.ts, context.ts):

- Location: 0 ALL, 1 FAL, 2 SML, 3 FSR, 4 IBU, 5 FSL, 6 CNC, 7 JCT, 8 FSJ.
- Availability: 0 Disponível, 1 Fora de Operação, 2 Indisponível Contingenciado, 3 Degradado Contingenciado, 4 Degradado, 5 Indisponível.
- Compliance: 0 Conforme, 1 Não Conforme.
- Criticality: 0 ESO, 1 A, 2 B, 3 C, 4 D (ESO/A critical tiers).
- Category, grouping, typology, owner, descriptive location, history author follow same pattern.
  Each domain: `toXId(string) -> number | undefined` (undefined = unknown, filter skipped + warn) and `fromXId(number) -> string` (explicit sentinel like `ST-7`).

## Wire vs domain types

- `lib/wireTypes.ts`: `WireBarrier`, `WireStatusHistoryEntry`, `WireKpiSnapshot`, `WireCategoryCompliance`, `BarriersQuery`, `BarriersResponse` (numbers + few free-text fields). Sync history entries also carry Fracttal author/participant snapshots, explanation, optional `syncRunId`; legacy/manual omit optionals.
- `lib/types.ts`: `Barrier`, `KpiSnapshot`, `CategoryCompliance`, `Vocabularies`, `FilterState`, `SortableColumn`, `StatusHistoryEntry` (resolved strings; open `string & {}` unions).
- `lib/api/types.ts`: `BarriersApi` (5 methods) + `DomainQuery`.
- `lib/resolve.ts`: `resolveBarrier`, `resolveHistoryEntry`, `resolveKpi`, `resolveChartData` (wire -> domain).
  `compliance` never travels in `WireBarrier`; derived from `availabilityId` via `isCompliant()` in mock, resolver, and DB trigger. Resolver first applies contingency overlay (`effectiveAvailabilityId`: stored 4/5 with `hasContingency='Sim'` read as 3/2); server KPI/chart/filter/vocabulary queries apply same overlay in SQL.

`WireKpiSnapshot`: fixed fields + optional dynamic buckets `byAvailability`, `byCompliance`, `byCriticality` (keys = numeric id as string) + `syncedAt` (server ISO). `resolveKpi` translates keys to display strings (already-string keys pass through). Buckets absent -> UI uses fixed fields (known statuses only). Admin snapshots also carry `inactive`/`deleted` counts over same filter subset ignoring `rowScope` (absent reads 0); feed band Situacao segments; never computed for other roles.

`WireCategoryCompliance`: `{ categoryId, compliant, total }`; `resolveChartData` derives `Não Conforme = max(0, total - compliant)` (fail-closed). Names stay full (26-char shortening presentation-only in `ChartRow`).

## Using the real API (Postgres)

Handlers in `routes/api/` on PostgreSQL (no ORM; pure SQL via `jsr:@db/postgres`, values bound `$1/$2`). 40 method+path combos:
GET /api/health, /barriers, /barriers/deleted, /barriers/:id, /barriers/:id/contingencies, /barriers/:id/fracttal-raw, /barriers/:id/sync-detail, /export, /kpi, /chart, /vocabularies, /lookups, /field-options, /sync-status, /sync-runs, /sync-changes, /recipients, /users, /alert-rules, /alert-rules/preview, /auth/me
POST /api/auth/login, /auth/logout, /auth/password, /barriers/:id/contingencies, /export, /recipients, /users, /alert-rules (PUT /field-options)
PATCH /api/barriers/:id, /barriers/:id/status, /barriers/:id/contingencies, /recipients/:id, /users/:id, /alert-rules/:id
DELETE /api/barriers/:id/contingencies, /recipients/:id, /users/:id, /alert-rules/:id
(`_params.ts` parsers + `validation_test.ts` tests are not routes.)

Key behaviors:

- GET /api/barriers?locationId=1&availabilityId=4&complianceId=1&categoryId=2&typologyId=0&criticalityId=1&criticalOnly=true&hasActionPlan=false&rowScope=active&query=FAL&since=YYYY-MM-DD&until=YYYY-MM-DD&page=1&pageSize=25&sortCol=statusSince&sortDir=desc -> 200 BarriersResponse { items, total, page, pageSize, totalPages } (+ETag, 304). locationId omitted/0 = all; query matches tag ILIKE %q% OR loc.code (%_ escaped, capped 200 chars); typologyId filters Tipologia; criticalOnly restricts ESO/A (absent/false=all); hasActionPlan filters plan presence; since/until over status_since; rowScope active (default live), inactive, deleted, all (admin-only; non-admin 403); availabilityId/complianceId match effective display state; page default 1 (floor min 1); pageSize default 25 (clamped 1..100000); sortCol whitelist (id/tag/location/typology/criticality/category/owner/availability/compliance/statusSince, default id); strict parsers in `_params.ts` (malformed -> undefined, never 400); {error,code,requestId} envelope on DB failure.
- GET /api/barriers/:id -> 200 WireBarrier (400 invalid id, 404 missing). Admins see soft-deleted (includeDeleted), others live-only.
- GET /api/barriers/:id/contingencies?q=TAG -> outgoing/incoming links + candidates + candidatesHaveMore. Outgoing/incoming: {barrierId, barrierTag, contingencyBarrierId, contingencyTag, managementChange, riskAnalysis, eligible}. Candidates capped first 50 sorted tags; refine q. Eligibility: active, not soft-deleted, same installation, availability exactly Disponível, compliant. Existing links visible to admins with eligible:false if conditions later fail. Readers need session/token; non-admins only see links between active non-deleted barriers.
- POST/PATCH/DELETE /api/barriers/:id/contingencies: create/update/remove links. POST body {contingencyBarrierId, managementChange?, riskAnalysis?}; PATCH updates refs for named contingencyBarrierId; DELETE takes id as query param. Refs capped 2000 chars each, body 10000 bytes. Admin session/token. Insertion locks + rechecks eligibility in DB, rejects self-links/dups, no status changes. Standard throttle + error envelope. Modal shows both tag directions + Gestão de Mudança/Análise de Risco refs. For Não Conforme barrier with no eligible outgoing link, displays recommendation to put barrier out of operation (text only, never updates status).
- GET /api/barriers/:id/fracttal-raw -> raw Fracttal asset + raw work-order/work-request rows for stored external_code. Enabled only DEV=true; admin session/token. At most five 100-row pages per work endpoint using code_asset/code_item filters, then removes rows whose code doesn't exactly match. truncated/excludedRows flags. private, no-store; raw rows not logged/persisted. Throttled 5 req/address/min. Anonymous 404, authenticated non-admin denied.
- PATCH /api/barriers/:id/status body {statusId int>=0, authorId? int>=0, note? cap 2000} -> 200 updated WireBarrier via record_status_change() (400 invalid body, 404 missing; same-status returns 200 existing, no history row, no alert fan-out). Requires admin (session cookie or Bearer ADMIN_TOKEN). Session admins may omit authorId (derived from user via authors); token callers must send it. 401 dead creds, 404 camouflage without credential, 403 authenticated non-admin. After commit hybrid immediate fan-out: matches always enqueue in alert_events; winning rules with notify_immediate send at once ([Imediato] subject, single attempt, 10s budget) when provider configured, else digest cron. Second-channel via generic provider (lib/server/alerts/provider.ts, MSGFlow HTTPS+JSON): only violada landing (status 5) attaches whatsapp recipients (and only recipients with phone); every other landing email-only. Provider accepts email/whatsapp/internal channels, rejects unknown (422). Fan-out failures only log; response stays updated WireBarrier.
- GET|POST /api/export?format=csv|xlsx|pdf (+ same filters) -> whole scope as CSV/.xlsx/PDF bytes (CSV BOM + 30-col header + RESUMO; workbook real OOXML with brand block, KPI strip, frozen header, autofilter, Resumo sheet; PDF hand-written A4-landscape with brand block, KPI chips, all 30 columns, repeated header, footer; byte-identical cell mapping via row()/csvCell()/row()/summaryRowsFrom()). Rows stream from DB in 5,000-row batches (ReadableStream, nothing buffered whole), ceiling EXPORT_MAX_ROWS=200,000 (400 naming real total when exceeded - refine filters), Content-Disposition attachment, X-Export-Total scope total. Workbook streams out of ZIP writer, PDF out of page writer; 200k export never materializes in memory. format=xls/html accepted as legacy aliases of xlsx/pdf. POST body {format?, ids?, timeZone?}: ids narrows to selected rows (intersected with filters, stale selection can't widen; positive safe ints only, deduped, capped 200,000; empty/malformed = whole scope); timeZone resolves via resolveTimeZone for report header. Body format wins over ?format=; default csv. Unknown format -> 400 format must be csv, xlsx or pdf.
- GET /api/barriers/deleted (+ same filters minus typologyId/criticalOnly/rowScope forced deleted) -> 200 BarriersResponse only deleted rows (soft-delete sync audit, legacy alias for GET /api/barriers?rowScope=deleted). Requires admin (session admin or Bearer ADMIN_TOKEN; non-admin session 403, no credential 404, dead credential 401). /api/barriers/:id detail returns deleted rows to admins, hides from others. WireBarrier carries isActive (false=Desativada) and deletedAt (null=live) so dashboard Situacao filter badges rows without second lookup.
- GET /api/kpi?... -> 200 WireKpiSnapshot over same filter subset (location, availability, compliance, category, typology, criticality, criticalOnly, action-plan presence, text, dates, rowScope; omitted=all). Admins additionally get inactive/deleted scope counts over same subset ignoring rowScope; other roles scope-local only. rowScope=deleted|all by non-admin -> 403.
- GET /api/chart?... (same subset) -> 200 WireCategoryCompliance[] ({categoryId, compliant, total}; non-compliant derives total-compliant). Same 403 rule.
- GET /api/vocabularies -> 200 Vocabularies (locations: [{id,code,name,count}], availabilities/compliances/criticalities: string[], categories/typologies: [{id,label}], authors?: [{id,name}]). id-bearing locations+categories for refresh cadence; SSR seeds first paint.
- GET /api/sync-status -> 200 SyncStatus (state syncing/idle/stale/unknown, runningSince, last finished run with counts+note, tracked barrier total). Polls every minute (15s fast lane while run in flight).
- GET /api/sync-changes?scope=last-run|last-day&runId=&kind=new|updated|removed|restored|all&query=&page=1&pageSize=25 -> 200 {run: SyncRun|null, items: SyncChangeItem[], total, page, pageSize, totalPages, summary:{total,byKind,byStatus,critical}} (paged per-barrier list with oldStatus, changedFields, runId; summary reconciles by kind/status/critical). runId overrides scope; non-positive/NaN runId means unpinned. query (alias q, tag substring, capped 200 chars) filters. page clamps 1..100000 (default 1), pageSize clamps 1..100 (default 25). Unknown scope falls back to 24h window; malformed values never 400, use defaults. Legacy ?limit=8 alone still returns 200 {changes: SyncChange[]} ({barrierId,tag,location,kind,status,changedAt}[], page 1, pageSize=limit clamped 1..100 default 8) for old hover card.
- GET /api/sync-runs?limit=10 -> 200 {runs: SyncRun[]} (recent finished runs newest first; limit clamps 1..50, default 10, malformed -> 10).
- GET /api/barriers/:id/sync-detail?runId=&scope=last-day -> 200 {detail: SyncBarrierDetail} ({barrierId,tag,location,kind:new|updated|removed|restored, oldAvailabilityId,newAvailabilityId,changedFields,oldSnapshot,newSnapshot,changedAt,runId} before/after snapshots + changed fields; loaded only when row expands). runId pins a run; scope=last-day uses rolling 24h; absent both uses latest change. 400 invalid id, 404 no sync change found.
- GET /api/health -> 200 {ok:true,time:ISO} (liveness, no DB, no auth, no throttle).
- GET /api/recipients (+?activeOnly=1) -> 200 AlertRecipient[]; POST {email,name?} (upsert by email - revives/renames on conflict, 201 AlertRecipient {id,email,name,active,created_at}); PATCH /:id {name?,active?} (400 empty patch/bad types, 404 missing); DELETE /:id -> 200 {ok:true} (404 missing) - all require admin. Email normalizes (trim/lower/slice-254 + user@host.tld check); name trims to 200 chars, default "".
- POST /api/auth/login {email,password} -> 200 PublicUser {id,email,name,role,active,created_at} + HttpOnly session cookie (barrier_session, 12h, SameSite=Lax, Secure on https or when APP_BASE_URL https behind TLS proxy; write throttle; 400 invalid JSON/missing fields/bad email, 401 generic on bad credentials - wrong email, inactive user, or bad hash all read same and pay same PBKDF2 cost, so accounts cannot be enumerated by body or timing). GET /api/auth/me -> 200 SessionUser {id,email,name,role,active} (read throttle; session cookie only - ADMIN_TOKEN alone doesn't satisfy; 401 without one, 503 when auth store down). POST /api/auth/logout -> 200 {ok:true} + cleared cookie (write throttle; missing cookie still succeeds). POST /api/auth/password {currentPassword,newPassword} -> 200 {ok:true} + cleared cookie - self-service change for any active session (admin or user; ADMIN_TOKEN rejected, identity from session alone so no user can address another's password; admins use PATCH /api/users/:id to reset someone else). Requires current password, enforces 12-256 policy, rejects reuse (400 new password must differ), revokes every session (re-login everywhere). 401 on wrong current password or concurrent admin reset/deactivation. Password throttle (10/min); ADMIN_TOKEN callers get 401 session required.
- GET /api/users -> 200 PublicUser[] (no hashes, order by id); POST {email,name?,password (12-256),role? admin|user default user} (201 PublicUser) - both require admin; first account provisioned via CLI (scripts/create-admin.ts), never via this route. PATCH /:id {name?,role?,active?,password?} (200 PublicUser, 400 empty patch/bad types/last-admin violation/unchanged password; password change is admin reset path: target's current password not required, any user incl another admin can be reset, all that user's sessions revoked; changing active also revokes them. Self-service remains POST /api/auth/password). DELETE /:id -> 200 {ok:true} (404 missing) - last active admin cannot be demoted/deactivated/deleted (400).
- GET /api/alert-rules (+?activeOnly=1) -> 200 AlertRule[]; POST (201 AlertRule) with {name required trim<=200 non-empty, description? trim<=2000 default "", categoryId? int>=0|null default null=all, toStatusId? int>=0|null, criticalOnly?, includeRecovery?, notifyImmediate?, active? (bools; defaults false,false,false,true), staleDays? positive int|null, categoryIds?, fromStatusIds?, toStatusIds?, locationIds?, criticalityIds?, typologyIds?, groupingIds?, ownerIds? (int[] deduped sorted, empty/null=all), urgency? any|urgent|critical default any, onlyNoActionPlan? default false, onTransition? default true, cooldownMinutes?, maxPerDay?, staleRepeatDays? positive int|null, quietStartHour?, quietEndHour? 0..23|null, activeDays? int[] 0..6, priority? int -1000..1000 default 0, validFrom?, validTo? YYYY-MM-DD|null}. PATCH /:id (same fields, all optional/partial; 400 empty patch, 404 missing); DELETE /:id -> 200 {ok:true} (404 missing) - all require admin. Duplicate names -> 400. categoryId null (and empty id lists) means all categories; no active rule covering a category mutes it.
- GET /api/alert-rules/preview?categoryIds=1,2&locationIds=3&criticalityIds=&typologyIds=&groupingIds=&ownerIds=&staleDays=7&onlyNoActionPlan=1 -> 200 {count:number, tags:string[<=5]} (dry-run count over live rows for a rule draft; categoryIds/locationIds/... CSV int>=0[], empty/malformed=all; staleDays adds compliance=NC AND status_since <= today-days, 400 unless positive int; onlyNoActionPlan=1 adds empty-plan gate). Admin only; read throttle. Fresh routes static preview.ts before [id].ts, so /preview never parses as id.
- GET /api/lookups -> 200 {availabilities:[{id,label}], categories:[{id,label}], locations:[{id,code,name}], criticalities/typologies/groupings/owners:[{id,label}], authors:[{id,name}]} - requires any authenticated caller (session or token; anonymous 404, dead credential 401); feeds admin forms.
- GET /api/field-options -> 200 FieldOptionSet[] {field,options,updated_at,updated_by} (any data reader - session of either role or token; missing rows seed from GERAL extraction); PUT /api/field-options?field=<key> {options:string[]} (200 updated set, admin only; field must be one of origin|installLocal|equipTypology|category|evidenceCode|outOfService|fieldInstalled|fieldOperational|opStatus|hasMaintPlan|planFollowed|failureFree|maintStatus|hasContingency, else 400 Unknown field; options trims/collapses-space/slices-200, drops empty/dupes, caps 200, non-empty else 400) - curated answer lists for barrier sheet questions.
- PATCH /api/barriers/:id (200 updated WireBarrier, admin only) - partial update of editable core and sheet fields (tag cap 200, locationId, typologyId, categoryId, groupingId, ownerId null allowed, criticalityId, comments, actionPlan, plus 15 sheet columns origin|installLocal|equipTypology|fieldInstalled|fieldOperational|opStatus|hasMaintPlan|planFollowed|failureFree|maintStatus|hasContingency|contingencyDesc|evidenceCode|degradationDesc|extraComments caps 200/2000; all optional; strings must be strings, ints non-negative ints, else 400); availabilityId routes through record_status_change() (with statusNote? default "Edição de barreira") so history/alerts keep working, plus same best-effort immediate fan-out (never fails response). When request does not set availabilityId explicitly, a hasContingency change also materializes the overlay: Sim promotes stored 4->3 / 5->2 ("Contingência registrada"), clearing demotes 3->4 / 2->5 ("Contingência removida"). Compliance and statusSince never writable. 404 when barrier missing.

## Filter query (string -> wire)

`toWireQuery()` in `lib/api/query.ts` (re-exported by `lib/api.ts`) converts UI filters (strings like 'Degradado','FAL') into numeric `BarriersQuery`. Unknown values skipped with console.warn. `cleanDateParam` accepts YYYY-MM-DD (or longer ISO); `buildQueryString` serializes to URL:

```
toWireQuery({ location: "FAL", availability: "Degradado", page: 1 });
// -> { locationId: 1, availabilityId: 4, page: 1 }
```

## Errors, auth, and throttle (P4)

Every failure responds {error, code, requestId} + x-request-id header (code: BAD_REQUEST/NOT_FOUND/UNAUTHORIZED/FORBIDDEN/RATE_LIMITED/UNAVAILABLE/INTERNAL; 500 never leaks stack/column - public message fixed per route, detail to log with requestId). Every JSON success also carries x-request-id (ok()/created() in lib/server/errors.ts), so client report correlates with server log. Every GET JSON success additionally carries ETag (SHA-256 over exact response bytes) plus Cache-Control: private, no-cache, and answers 304 no body when If-None-Match matches (okWithEtag() in lib/server/errors.ts) - shared caches never store authenticated bodies, revalidating clients skip re-downloading unchanged polls. HTTP adapter (lib/api/http.ts) revalidates per URL from bounded per-adapter memory cache and serves 304 answers from memory, so steady-state polls cost a header round-trip instead of full JSON bodies. Pipeline order fixed everywhere: throttle -> loadServerConfig -> auth -> validation -> DB.

Login => Dashboard: dashboard GETs require auth (barriers, :id, :id/contingencies, :id/sync-detail, kpi, chart, export, vocabularies, sync-status, sync-runs, sync-changes, field-options GET) - session cookie or ADMIN_TOKEN. Anonymous -> 404 camouflage (NOT_FOUND, same shape as missing route); dead credentials -> 401. Throwing session store (DB blip) -> 503 UNAVAILABLE + Retry-After, never 401, so dashboard backs off instead of dropping user to login. Writes and admin data require admin (admin session cookie or ADMIN_TOKEN): PATCH .../status, PATCH .../:id, POST|PATCH|DELETE .../:id/contingencies, PUT .../field-options, recipients, users, alert-rules (incl preview), GET /api/barriers/deleted. GET /api/lookups and POST /api/auth/password require any authenticated caller (session or token), password additionally requires session path (ADMIN_TOKEN alone -> 401 session required). Authenticated non-admin on admin-only scope -> 403 FORBIDDEN (admin only), never 401, so clients show "restricted" instead of redirecting to login in a loop. Pages: /login only public route; / redirects logged-out sessions to /login?next=. Admin management lives in settings sidepanel Admin tab (admin role only); admin APIs server-enforced regardless of drawer. In-memory throttle by remote IP (never X-Forwarded-For, forgeable): 120 req/min reads, 30 req/min writes, 120 req/min export, 10 req/min self-service password changes (429 {error,code:RATE_LIMITED} + Retry-After). /api/health not throttled (liveness probe - only unthrottled route). Export additionally shares budget across isolates via throttle_buckets table (lib/server/sql/throttle.ts, memory fallback). Boot validates DATABASE_URL with PUBLIC_API_MODE=http on first call (500 naming variable).

GET /api/vocabularies refreshes same payload on dashboard cadence (SSR still seeds first paint in http mode via routes/index.tsx; mock mode derives options client-side via useDashboardVocabularies).

In PUBLIC_API_MODE=http dashboard pages through server (useServerDashboard in hooks/dashboard/server.ts): pages via getBarriers (full filters), KPI via getKpi, chart via getChartData (same filter subset, minus paging/sort), with cancellation, loading, error card/banner, retry, 5-min refresh cadence (hidden tabs skip), vocabulary refetch. getAllBarriers in http forces pageSize:100000. Every export format streams full filtered set from GET /api/export (200k ceiling); detail resolves from current page.

Enable:

1. Start Postgres and run migrations+seed (docs/DATABASE.md).
2. Set env (.env.example): PUBLIC_API_MODE=http; PUBLIC_API_BASE_URL= (empty = same page origin recommended); DATABASE_URL=postgres://...
   (dev reads shell - export $(cat .env | xargs); start/db:* read .env.) When PUBLIC_API_BASE_URL empty, routes/index.tsx uses request's own origin - browser fetches /api/* same-origin on whatever port app serves. Set explicitly only when API on another origin (that origin needs CORS).
3. No component changes. api in lib/api.ts points to httpAdapter automatically.

Entire SQL layer (lib/server/db.ts, lib/server/sql/*) server-only (never imported in islands/) - Postgres connection string never reaches client bundle. lib/server/db.ts uses lazy pool on globalThis.__barrierPool (import never throws; first query throws without DATABASE_URL).

## Files in this layer

| File                                                                                 | Responsibility                                                                                        |
| ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| lib/api.ts                                                                           | Barrel: picks mock vs HTTP via PUBLIC_API_MODE, re-exports toWireQuery + mockApi                      |
| lib/api/types.ts                                                                     | BarriersApi (5 methods) + DomainQuery (string filters)                                                |
| lib/api/query.ts                                                                     | toWireQuery, cleanDateParam, buildQueryString                                                         |
| lib/api/mock.ts                                                                      | mockAdapter: numeric matchesQuery + sortWire, resolves only final page                                |
| lib/api/http.ts                                                                      | httpAdapterFactory(baseUrl): fetch over routes/api/*; null only on 404                                |
| lib/enums.ts                                                                         | Barrel over lib/enums/                                                                                |
| lib/enums/codes.ts                                                                   | LOCATION/AVAILABILITY/COMPLIANCE/CRITICALITY + to/fromXId                                             |
| lib/enums/taxonomy.ts                                                                | CATEGORY/GROUPING/TYPOLOGY/OWNER (ownerId -1 = empty)                                                 |
| lib/enums/context.ts                                                                 | LOC_DESC/AUTHOR (from* only)                                                                          |
| lib/wireTypes.ts                                                                     | Wire format (numeric ids; no complianceId in WireBarrier)                                             |
| lib/types.ts                                                                         | UI domain (resolved strings, open unions, Vocabularies)                                               |
| lib/resolve.ts                                                                       | resolveBarrier(s), resolveHistoryEntry, resolveKpi, resolveChartData                                  |
| lib/data.ts                                                                          | Barrel over lib/mock/ (deterministic generator)                                                       |
| lib/mock/generator.ts                                                                | getWireBarriers() cached (0xdeadbeef, status/station distributions)                                   |
| lib/mock/history.ts                                                                  | generateHistory + comments/plans/notes per status                                                     |
| lib/mock/tags.ts                                                                     | buildTag + prefixes per category                                                                      |
| lib/mock/rng.ts                                                                      | PRNG with seed (next/int/pick/bool)                                                                   |
| lib/constants.ts                                                                     | Barrel over lib/constants/                                                                            |
| lib/constants/locations.ts                                                           | LOCATIONS, LOCATION_DIST_BY_ID, SIM_DATE, PAGE_SIZE(_OPTS)                                            |
| lib/constants/catalog.ts                                                             | Seed lists (categories, groupings, typologies, owners, locs, authors)                                 |
| lib/constants/helpers.ts                                                             | isCompliant() + distinctBy()                                                                          |
| lib/constants/colors.ts                                                              | Colors per status + DISP_KNOWN_ORDER, shortStatusLabel                                                |
| lib/server/db.ts                                                                     | Lazy server-only Postgres pool (globalThis.__barrierPool)                                             |
| lib/server/sql/barriers.ts                                                           | listBarriers, listBarrierWindow (export paging), getBarrierById, getKpi, transitionBarrierStatus      |
| lib/server/sql/chart.ts                                                              | getChartData (GROUP BY category_id)                                                                   |
| lib/server/sql/vocabularies.ts                                                       | getVocabularies() (SSR seed + GET /api/vocabularies refresh)                                          |
| lib/server/sql/where.ts                                                              | buildWhere, resolveOrderBy (whitelist), escapeLike                                                    |
| lib/server/sql/mappers.ts                                                            | SELECT_COLUMNS, HISTORY_JOIN (lateral json_agg), toWireBarrier                                        |
| routes/api/_params.ts                                                                | Strict parsers (parseInt/parseDate/parseQueryParam); never a route (_ prefix)                         |
| routes/api/barriers.ts                                                               | GET /api/barriers (session/token, read throttle)                                                      |
| routes/api/barriers/deleted.ts                                                       | GET /api/barriers/deleted (deleted only, admin session or token)                                      |
| routes/api/barriers/[id].ts                                                          | GET/PATCH /api/barriers/:id (GET any reader, PATCH admin field update)                                |
| routes/api/barriers/[id]/fracttal-raw.ts                                             | GET /api/barriers/:id/fracttal-raw (admin + DEV=true, capped raw upstream detail)                     |
| routes/api/barriers/[id]/status.ts                                                   | PATCH /api/barriers/:id/status (requires admin, write throttle; author derives from session)          |
| routes/api/barriers/[id]/contingencies.ts                                            | GET contingency links/candidates (session/token); POST/PATCH/DELETE links (admin, write throttle)     |
| routes/api/barriers/[id]/sync-detail.ts                                              | GET /api/barriers/:id/sync-detail (session/token, read throttle; pinned run or 24h window)            |
| routes/api/export.ts                                                                 | GET/POST /api/export (csv/xlsx/pdf; session/token, export throttle, streamed, selection via ids)      |
| routes/api/kpi.ts                                                                    | GET /api/kpi (session/token, read throttle)                                                           |
| routes/api/chart.ts                                                                  | GET /api/chart (session/token, read throttle)                                                         |
| routes/api/sync-status.ts                                                            | GET /api/sync-status (session/token, read throttle; dashboard indicator)                              |
| routes/api/sync-runs.ts                                                              | GET /api/sync-runs (session/token, read throttle; ?limit= 1..50)                                      |
| routes/api/sync-changes.ts                                                           | GET /api/sync-changes (session/token, read throttle; paged + legacy ?limit= shape)                    |
| routes/api/vocabularies.ts                                                           | GET /api/vocabularies (session/token, read throttle; refresh cadence)                                 |
| routes/api/health.ts                                                                 | GET /api/health (liveness, no DB, no auth, no throttle)                                               |
| routes/api/recipients.ts                                                             | GET/POST /api/recipients (admin, upsert by email)                                                     |
| routes/api/recipients/[id].ts                                                        | PATCH/DELETE /api/recipients/:id (admin)                                                              |
| routes/api/auth/login.ts                                                             | POST /api/auth/login (credentials -> session cookie)                                                  |
| routes/api/auth/logout.ts                                                            | POST /api/auth/logout (revoke + clear cookie)                                                         |
| routes/api/auth/me.ts                                                                | GET /api/auth/me (session user for islands)                                                           |
| routes/api/auth/password.ts                                                          | POST /api/auth/password (own password change, session-only)                                           |
| routes/api/users.ts                                                                  | GET/POST /api/users (admin only; first account via CLI)                                               |
| routes/api/users/[id].ts                                                             | PATCH/DELETE /api/users/:id (admin, last-admin guard)                                                 |
| routes/api/alert-rules.ts                                                            | GET/POST /api/alert-rules (admin, scoped triggers + anti-noise windows)                               |
| routes/api/alert-rules/[id].ts                                                       | PATCH/DELETE /api/alert-rules/:id (admin)                                                             |
| routes/api/alert-rules/preview.ts                                                    | GET /api/alert-rules/preview (admin dry-run count + sample tags)                                      |
| routes/api/lookups.ts                                                                | GET /api/lookups (authenticated id lists for admin forms)                                             |
| routes/api/field-options.ts                                                          | GET/PUT /api/field-options (GET any reader, PUT admin only)                                           |
| lib/server/sql/field-options.ts, lib/field-options.ts, islands/BarrierEditor.tsx     | Field options store/registry + admin barrier editor                                                   |
| lib/server/config.ts, errors.ts, auth.ts                                             | Server config, error envelope, auth helpers                                                           |
| lib/server/throttle.ts, lib/server/sql/throttle.ts                                   | Throttle (fixed window, shared budget via Postgres)                                                   |
| lib/server/exportRows.ts, exportStream.ts, exportCsv.ts, exportXlsx.ts, exportPdf.ts | Export streaming (scope, CSV/XLSX/PDF)                                                                |
| lib/server/sql/_, lib/server/auth/_, lib/server/alerts/*                             | SQL repos, PBKDF2 auth, alert store/rules/detect/run/mailer/provider/templates (see docs/DATABASE.md) |
| lib/dashboard/urgent.ts, islands/dashboard/vocabularies.ts                           | Urgency helpers + mock vocabularies hook                                                              |
| db/schema.sql, db/seed_lookups.sql                                                   | DDL + static lookup seeds (see docs/DATABASE.md)                                                      |

See docs/DATABASE.md for schema/setup; docs/ARCHITECTURE.md for mock vs http flows and island topology.

## Operations (P5)

Docker runtime (primary):

```
cp .env.example .env  # set DATABASE_URL + FRACTTAL_* + ADMIN_TOKEN (+ OPS_*)
docker compose build
docker compose run --rm tools deno run -A --env-file=.env scripts/migrate.ts
docker compose up -d                       # app + poller
curl -s localhost:8300/api/health          # {"ok":true,...}
docker compose ps                          # both healthy / running
```

Config from host .env (mounted read-only, never baked; see .dockerignore). deno task fracttal:* shortcuts mirror scripts for local runs. Alert digest stays host cron every 15 min: `*/15 * * * * cd /opt/barrier-monitor && docker compose run --rm tools deno run -A --env-file=.env scripts/alerts-check.ts --apply >> /var/log/alerts.log 2>&1` (drop --apply for dry-run). Backup host cron (`pg_dump "$DATABASE_URL" -Fc`), verified by restore into empty DB with identical barriers/barrier_status_history counts.

Drills: kill-poller -> unless-stopped restarts; logs show cadence resuming; missed tick is gap (next tick reconciles). Rollback to mock: set PUBLIC_API_MODE=mock in .env, then `docker compose up -d --force-recreate app` (client returns to deterministic generator; DB untouched).

Systemd runtime (alternative, no Docker; Windows Server: docs/DEPLOY-WINDOWS.md):
Service (deno task start reads .env):

```
# /etc/systemd/system/barrier-monitor.service
[Unit]
Description=Barrier Monitor (Fresh)
After=network.target postgresql.service
[Service]
User=barreiras
WorkingDirectory=/opt/barrier-monitor
EnvironmentFile=/opt/barrier-monitor/.env
ExecStart=/home/barreiras/.deno/bin/deno task start
Restart=on-failure
[Install]
WantedBy=multi-user.target
```

Scheduling: scripts/fracttal-poll.ts own service (same template, ExecStart=... deno run -A scripts/fracttal-poll.ts with FRACTTAL_SYNC_SCOPES in EnvironmentFile). Digest: `*/15 * * * *` -> `deno run -A scripts/alerts-check.ts --apply >> /var/log/alerts.log 2>&1` (dry-run without --apply; --reprocess manual only after reading log). Relay failure never loses event: tries 3 times, stamps attempts/last_error, parks (dead_letter) after 5 failing runs; log names `event <id> <tag>` for retry via --reprocess.

Post-deploy smoke:

```
curl -s -o /dev/null -w "root=%{http_code}\n" "$BASE/"
curl -s "$BASE/api/health"  # {"ok":true,"time":"..."}
```

Backup/restore verified: `pg_dump "$DATABASE_URL" -Fc -f barreiras.dump`; `createdb -O monitor barreiras_restore`; `pg_restore -d "$RESTORE_URL" barreiras.dump`. Rollback to mock without touching DB: PUBLIC_API_MODE=mock (client returns to deterministic generator; /api/* routes still require DATABASE_URL but nothing calls them). Total rollback: previous build + mock mode.

Production cutover (P3, first pass), strict order:

1. Backup: `pg_dump "$DATABASE_URL" -Fc -f barreiras-pre-cutover.dump` (restorable via pg_restore; counts checked in Operations).
2. Migrate against backup, never directly: start empty DB from dump, run `deno task db:migrate`, verify barriers/lookups/sync_state/alert_events/alert_recipients present; only then migrate prod.
3. Dual-run mock-vs-http: with DB migrated+seeded, compare dashboard totals in both modes (same filters): mock records KPI total, non-compliant count, grid rows; http same numbers must reconcile with seed (mock deterministic, seed fixed - divergence beyond expected is stop-ship); GET /api/export?format=csv full filters: total data rows == X-Export-Total == total from /api/barriers.
4. Cutover checklist: clean sync dry-run on fixture (scripts/fracttal-sync.ts without --apply); ADMIN_TOKEN + OPS_SMTP_* configured; active recipient registered; alerts-check.ts dry-run green; smoke / + /api/health on prod build.
5. Switch on: systemd service + poll + digest cron; first sync --apply in reviewed session (P3: production read-only until this point).

## SSO (Microsoft Entra ID)

When `AUTH_SSO_ENABLED=true`, the app exposes provider-specific routes:

- `GET /auth/entra/login?next=...`
- `GET /auth/entra/callback?code=...&state=...`
- `GET /auth/entra/logged-out`
- `GET /auth/entra/frontchannel-logout` (optional, phase 9)

`POST /api/auth/logout` returns `{ ok, ssoLogoutUrl }`. `ssoLogoutUrl` is null
for local sessions or when SSO is disabled.

Admin user APIs include `auth_source` and `entra_oid`. `POST /api/users` can
create an Entra user with `authSource: "entra"` and `entraObjectId`.
`PATCH /api/users/:id` can convert a local user to Entra or correct an object
id. `DELETE /api/users/:id/sessions` revokes all sessions for a user.

Entra users cannot use `/api/auth/login`, `/api/auth/password`, or admin
password reset. Unknown or inactive Entra identities return the same generic
`no_access` result.
