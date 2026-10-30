# Identifier Glossary

Dev-facing reference for domain terminology. Code identifiers are English; display values are Portuguese.

The mapping below is the single source of truth. Translate new identifiers from Portuguese to the English form listed here.

## Domain concepts

| Portuguese (display)        | English identifier                               |
| --------------------------- | ------------------------------------------------ |
| Disponibilidade             | `availability`                                   |
| Disponível                  | `available`                                      |
| Fora de Operação            | `outOfService`                                   |
| Indisponível Contingenciado | `contingencyOutage`                              |
| Degradado Contingenciado    | `degradedContingency`                            |
| Degradado                   | `degraded`                                       |
| Indisponível                | `unavailable`                                    |
| Conformidade                | `compliance`                                     |
| Conforme                    | `compliant`                                      |
| Não Conforme                | `nonCompliant`                                   |
| % Conforme                  | `pctCompliant`                                   |
| Críticas não conformes      | `criticalNonCompliant`                           |
| Criticidade                 | `criticality`                                    |
| Categoria                   | `category`                                       |
| Agrupamento                 | `grouping`                                       |
| Tipologia                   | `typology`                                       |
| Dono                        | `owner`                                          |
| Instalação                  | `location`                                       |
| Local (descrição)           | `locDesc`                                        |
| Comentários                 | `comments`                                       |
| Comentários extra           | `extraComments`                                  |
| Plano de ação               | `actionPlan` (SQL `action_plan`)                 |
| Com plano / Sem plano       | `hasActionPlan` (filter + wire)                  |
| Origem (HAZOP/APR)          | `origin`                                         |
| Código Fracttal             | `externalCode` (SQL `external_code`)             |
| Nome da instalação          | `locationName` (resolved, read-only)             |
| Local de instalação         | `installLocal` (SQL `install_local`)             |
| Tipologia do equipamento    | `equipTypology` (SQL `equip_typology`)           |
| Elemento instalado em campo | `fieldInstalled` (SQL `field_installed`)         |
| Elemento operacional        | `fieldOperational` (SQL `field_operational`)     |
| Status operacional          | `opStatus` (SQL `op_status`)                     |
| Possui plano de manutenção  | `hasMaintPlan` (SQL `has_maint_plan`)            |
| Plano cumprido              | `planFollowed` (SQL `plan_followed`)             |
| Sem falha                   | `failureFree` (SQL `failure_free`)               |
| Status manutenção           | `maintStatus` (SQL `maint_status`)               |
| Há contingência             | `hasContingency` (SQL `has_contingency`)         |
| Descrição contingência      | `contingencyDesc` (SQL `contingency_desc`)       |
| Código evidência            | `evidenceCode` (SQL `evidence_code`)             |
| Descrição degradação        | `degradationDesc` (SQL `degradation_desc`)       |
| Tipo de instalação          | `type`                                           |
| Usuário                     | `user`                                           |
| Conta (perfil + senha)      | `account`                                        |
| Papel                       | `role` (`admin` / `user`)                        |
| Sessão                      | `session`                                        |
| Senha                       | `password` (`password_hash`)                     |
| Regra de alerta             | `alertRule` (`alert_rules`)                      |
| Destinatário                | `recipient` (`alert_recipients`)                 |
| Desativada (barreira)       | `inactive` (`is_active = false`)                 |
| Excluída (barreira)         | `deleted` (`deleted_at IS NOT NULL`)             |
| Situação (filtro)           | `rowScope` (`active`/`inactive`/`deleted`/`all`) |
| Histórico de status         | `statusHistory`                                  |
| Envolvidos                  | `participants`                                   |
| Criado por                  | `created_by` (Fracttal author preference)        |
| Solicitado por              | `requested_by` (author fallback)                 |
| Pessoal                     | `personnel_description`                          |
| Usuário atribuído           | `user_assigned`                                  |
| Recursos humanos            | `resources_human_resources`                      |
| Validado por                | `validated_by_description`                       |

Rename tables for types, wire fields, enums, and DB schema follow the same Portuguese to English rule.
