# Identifier Glossary

Dev-facing reference for the codebase's domain terminology.

All _code identifiers_ (type names, field names, DB table/column names, API
query keys, enum map names, function names) are written in English. The
_display values_ those identifiers point to are Portuguese on purpose, because
the product's users are Portuguese-only speakers.

The mapping below is the single source of truth. When introducing a new
identifier for a domain concept, translate from Portuguese to the English form
listed here exactly, so the codebase does not fork.

## Domain concepts

| Portuguese (display value)  | English identifier               |
| --------------------------- | -------------------------------- |
| Disponibilidade             | `availability`                   |
| Disponível                  | `available`                      |
| Fora de Operação            | `outOfService`                   |
| Indisponível Contingenciado | `contingencyOutage`              |
| Degradado Contingenciado    | `degradedContingency`            |
| Degradado                   | `degraded`                       |
| Indisponível                | `unavailable`                    |
| Conformidade                | `compliance`                     |
| Conforme                    | `compliant`                      |
| Não Conforme                | `nonCompliant`                   |
| % Conforme                  | `pctCompliant`                   |
| Críticas não conformes      | `criticalNonCompliant`           |
| Criticidade                 | `criticality`                    |
| Categoria                   | `category`                       |
| Agrupamento                 | `grouping`                       |
| Tipologia                   | `typology`                       |
| Dono                        | `owner`                          |
| Instalação                  | `location`                       |
| Local (descrição)           | `locDesc`                        |
| Comentários                 | `comments`                       |
| Plano de ação               | `actionPlan` (SQL `action_plan`) |
| Tipo de instalação          | `type`                           |

## Type / property renames

| Old (PT)                        | New (EN)                 |
| ------------------------------- | ------------------------ |
| `Disponibilidade`               | `Availability`           |
| `Conformidade`                  | `Compliance`             |
| `Criticidade`                   | `Criticality`            |
| `Barrier.tipologia`             | `Barrier.typology`       |
| `Barrier.instalacao`            | `Barrier.location`       |
| `Barrier.criticidade`           | `Barrier.criticality`    |
| `Barrier.categoria`             | `Barrier.category`       |
| `Barrier.agrupamento`           | `Barrier.grouping`       |
| `Barrier.dono`                  | `Barrier.owner`          |
| `Barrier.disponibilidade`       | `Barrier.availability`   |
| `Barrier.conformidade`          | `Barrier.compliance`     |
| `Barrier.comentarios`           | `Barrier.comments`       |
| `Barrier.planoAcao`             | `Barrier.actionPlan`     |
| `Location.tipo`                 | `Location.type`          |
| KPI `disponivel`                | `available`              |
| KPI `foraDeOp`                  | `outOfService`           |
| KPI `indispCont`                | `contingencyOutage`      |
| KPI `degrCont`                  | `degradedContingency`    |
| KPI `degradado`                 | `degraded`               |
| KPI `indisponivel`              | `unavailable`            |
| KPI `conforme`                  | `compliant`              |
| KPI `naoConforme`               | `nonCompliant`           |
| KPI `pctConforme`               | `pctCompliant`           |
| KPI `criticasNC`                | `criticalNonCompliant`   |
| KPI `byDisponibilidade`         | `byAvailability`         |
| KPI `byConformidade`            | `byCompliance`           |
| KPI `byCriticidade`             | `byCriticality`          |
| `Vocabularies.disponibilidades` | `availabilities`         |
| `Vocabularies.conformidades`    | `compliances`            |
| `Vocabularies.categorias`       | `categories`             |
| `FilterState.disponibilidade`   | `availability`           |
| `FilterState.conformidade`      | `compliance`             |
| `FilterState.categoria`         | `category`               |
| `DomainQuery.disponibilidade`   | `availability`           |
| `DomainQuery.conformidade`      | `compliance`             |
| `DomainQuery.categoria`         | `category`               |
| `CategoryConformidade`          | `CategoryCompliance`     |
| `WireCategoryConformidade`      | `WireCategoryCompliance` |
| `isConforme`                    | `isCompliant`            |
| `CONFORME_STATUS_IDS`           | `COMPLIANT_STATUS_IDS`   |
| `wireConformidadeId`            | `wireComplianceId`       |
| `showUrgentes`                  | `showUrgent`             |
| `isUrgentesActive`              | `isUrgentActive`         |

## Wire / API id fields

| Old (PT)                                             | New (EN)         |
| ---------------------------------------------------- | ---------------- |
| `tipologiaId`                                        | `typologyId`     |
| `criticidadeId`                                      | `criticalityId`  |
| `categoriaId`                                        | `categoryId`     |
| `agrupamentoId`                                      | `groupingId`     |
| `donoId`                                             | `ownerId`        |
| `disponibilidadeId`                                  | `availabilityId` |
| `conformidadeId`                                     | `complianceId`   |
| `comentarios`                                        | `comments`       |
| `planoAcao`                                          | `actionPlan`     |
| `statusId` / `locationId` / `locDescId` / `authorId` | unchanged        |

## Enum maps / resolvers

| Old (PT)                                                             | New (EN)                                             |
| -------------------------------------------------------------------- | ---------------------------------------------------- |
| `DISPONIBILIDADE_CODES` / `_IDS`                                     | `AVAILABILITY_CODES` / `AVAILABILITY_IDS`            |
| `toDisponibilidadeId` / `fromDisponibilidadeId`                      | `toAvailabilityId` / `fromAvailabilityId`            |
| `CONFORMIDADE_CODES` / `_IDS`                                        | `COMPLIANCE_CODES` / `COMPLIANCE_IDS`                |
| `toConformidadeId` / `fromConformidadeId`                            | `toComplianceId` / `fromComplianceId`                |
| `CRITICIDADE_CODES` / `_IDS`                                         | `CRITICALITY_CODES` / `CRITICALITY_IDS`              |
| `toCriticidadeId` / `fromCriticidadeId`                              | `toCriticalityId` / `fromCriticalityId`              |
| `CATEGORIA_CODES` / `_IDS`                                           | `CATEGORY_CODES` / `CATEGORY_IDS`                    |
| `toCategoriaId` / `fromCategoriaId`                                  | `toCategoryId` / `fromCategoryId`                    |
| `AGRUPAMENTO_CODES` / `_IDS`                                         | `GROUPING_CODES` / `GROUPING_IDS`                    |
| `fromAgrupamentoId`                                                  | `fromGroupingId`                                     |
| `TIPOLOGIA_CODES` / `_IDS`                                           | `TYPOLOGY_CODES` / `TYPOLOGY_IDS`                    |
| `fromTipologiaId`                                                    | `fromTypologyId`                                     |
| `DONO_CODES` / `_IDS`                                                | `OWNER_CODES` / `OWNER_IDS`                          |
| `fromDonoId`                                                         | `fromOwnerId`                                        |
| `CATEGORIES` / `AGRUPAMENTOS` / `TIPOLOGIAS` / `DONOS` (seed arrays) | `CATEGORIES` / `GROUPINGS` / `TYPOLOGIES` / `OWNERS` |

## Database schema

| Old (PT)                                | New (EN)                      |
| --------------------------------------- | ----------------------------- |
| table `disponibilidades`                | `availability_statuses`       |
| table `criticidades`                    | `criticality_levels`          |
| table `categorias`                      | `categories`                  |
| table `agrupamentos`                    | `groupings`                   |
| table `tipologias`                      | `typologies`                  |
| table `donos`                           | `owners`                      |
| column `tipo`                           | `type`                        |
| column `is_conforme`                    | `is_compliant`                |
| column `tipologia_id`                   | `typology_id`                 |
| column `criticidade_id`                 | `criticality_id`              |
| column `categoria_id`                   | `category_id`                 |
| column `agrupamento_id`                 | `grouping_id`                 |
| column `dono_id`                        | `owner_id`                    |
| column `disponibilidade_id`             | `availability_id`             |
| column `conformidade_id`                | `compliance_id`               |
| column `comentarios`                    | `comments`                    |
| column `plano_acao`                     | `action_plan`                 |
| fn `barriers_set_conformidade`          | `barriers_set_compliance`     |
| trigger `trg_barriers_set_conformidade` | `trg_barriers_set_compliance` |
| index `idx_barriers_disponibilidade`    | `idx_barriers_availability`   |
| index `idx_barriers_conformidade`       | `idx_barriers_compliance`     |
| index `idx_barriers_categoria`          | `idx_barriers_category`       |
| index `idx_barriers_criticidade`        | `idx_barriers_criticality`    |

Unchanged: `locations`, `loc_descs`, `authors`, `barriers`,
`barrier_status_history`, `location_id`, `loc_desc_id`, `status_since`,
`status_history`, `external_code`.
