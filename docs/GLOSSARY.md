# Identifier glossary

Portuguese display to English identifier map. Code, wire fields, enums and SQL
use the English form; the UI keeps the exact Portuguese label. Translate new
identifiers from Portuguese to the English form below instead of inventing a
variant.

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
| Campos manuais              | `manualFields` (SQL `manual_fields`)             |
| Plano de ação               | `actionPlan` (SQL `action_plan`)                 |
| Com plano / Sem plano       | `hasActionPlan` (filter and wire)                |
| Origem                      | `origin`                                         |
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
| Contingência elegível       | `eligible` (contingency link)                    |
| Tipo de instalação          | `type`                                           |
| Usuário                     | `user`                                           |
| Conta                       | `account`                                        |
| Papel                       | `role` (`admin` / `user`)                        |
| Sessão                      | `session`                                        |
| Senha                       | `password` (`password_hash`)                     |
| Regra de alerta             | `alertRule` (`alert_rules`)                      |
| Destinatário                | `recipient` (`alert_recipients`)                 |
| Sincronização               | `sync` (`sync_state`, `SyncStatus`)              |
| Digest                      | `digest` (`notify_immediate = false`)            |
| Ativa                       | `active`                                         |
| Desativada                  | `inactive` (`is_active = false`)                 |
| Excluída                    | `deleted` (`deleted_at IS NOT NULL`)             |
| Situação                    | `rowScope` (`active`/`inactive`/`deleted`/`all`) |
| Histórico de status         | `statusHistory`                                  |
| Envolvidos                  | `participants`                                   |
| Criado por                  | `created_by` (Fracttal author preference)        |
| Solicitado por              | `requested_by` (author fallback)                 |
| Pessoal                     | `personnel_description`                          |
| Usuário atribuído           | `user_assigned`                                  |
| Recursos humanos            | `resources_human_resources`                      |
| Validado por                | `validated_by_description`                       |
