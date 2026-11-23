# Documentação técnica do Monitor de Barreiras de Segurança

## 1. Cabeçalho

| Campo                  | Valor                                                                                                                                                           |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Título                 | Documentação técnica do Monitor de Barreiras de Segurança                                                                                                       |
| Versão do sistema      | aplicação 0.4.0 (`deno.jsonc`), runtime Deno 2.9 ou superior (`docs/ARCHITECTURE.md`, `readme.md`)                                                              |
| Componentes principais | Fresh 2.3.3, Vite 7, Preact 10 com signals, PostgreSQL via `@db/postgres` (`deno.jsonc`, `deno.lock`)                                                           |
| Data                   | 17/11/2026                                                                                                                                                      |
| Status                 | documento técnico vivo, alinhado ao código da branch de base `abd6e34`                                                                                          |
| Público                | engenharia de software, operação, SRE, integração, auditoria técnica e segurança da informação                                                                  |
| Escopo                 | arquitetura, regras de negócio, contratos HTTP e de banco, integração com o CMMS, pipeline de alertas, segurança, configuração, implantação, limites e decisões |
| Fora de escopo         | treinamento de usuário final, procedimento jurídico, contrato comercial com fornecedores e operação do provedor de mensageria                                   |

Este é um **documento técnico**. Ele explica como o sistema é construído, quais regras ele aplica e quais contratos precisam ser preservados. Ele **não** substitui o manual do usuário: para o passo a passo de uso diário, a referência é `docs/USO.md`, escrito em português e voltado a quem opera o painel. Sempre que houver dúvida sobre comportamento visível ao usuário, o manual é a fonte de linguagem; sempre que houver dúvida sobre comportamento real do sistema, o código é a fonte de verdade.

O documento foi escrito para ser lido em profundidade progressiva. Quem precisa apenas de contexto executivo pode ler o nível 1. Quem vai operar ou treinar pessoas deve ler os níveis 1 e 2. Quem vai alterar regras de negócio deve ler o nível 3. Quem vai alterar código, schema, integração ou implantação deve ler os níveis 3, 4 e 5, além das seções 8, 9 e 10.

## 2. Como ler este documento

### 2.1 Os cinco níveis

| Nível                       | Pergunta que responde                       | Conteúdo                                                                                                                    |
| --------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1. Superfície               | O que é o produto e por que existe?         | problema, solução, papéis, objetos centrais, ciclo de ponta a ponta, processos e modelo de entrega                          |
| 2. Produto em funcionamento | O que cada tela e cada fluxo permite fazer? | login, painel, tabela, detalhe, edição, configurações, administração, alertas, exportação, sincronização, primeiros passos  |
| 3. Regras de negócio        | Como o sistema decide?                      | status, conformidade, contingência, propriedade manual, escopo, KPI, gráfico, filtros, alertas, autenticação, exportação    |
| 4. Arquitetura e decisões   | Como o sistema é construído e por quê?      | stack, camadas, fluxos, banco, contratos HTTP, segurança, sync, pipeline de alertas, configuração, deploy, UI, qualidade    |
| 5. Referência               | Onde está o valor exato?                    | tabelas de status, enums, filtros, endpoints, tabelas do banco, limites, variáveis de ambiente, tarefas, decisões D01 a D36 |

Os níveis revisitam os mesmos temas em profundidade crescente. Um fato não é repetido por repetição: no nível 2 ele aparece como comportamento observável; no nível 3, como regra; no nível 4, como implementação; no nível 5, como valor de referência.

### 2.2 Fontes de verdade

A ordem de precedência adotada neste documento é:

1. **Código em execução** (`lib/`, `routes/`, `db/schema.sql`, `scripts/`), porque descreve o comportamento real.
2. **`DECISIONS.md`**, porque registra decisões vinculantes e o motivo delas. Os identificadores `Dxx` são estáveis e nunca renumerados.
3. **Documentação mantida** (`readme.md`, `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATABASE.md`, `docs/FRACTTAL.md`, `docs/STATUSES.md`, `docs/GLOSSARY.md`, `docs/DEPLOY-WINDOWS.md`, `docs/PORT-MAP.md`, `docs/USO.md`), porque descreve a intenção e o contrato social do projeto.
4. **Relatos operacionais não versionados**, usados apenas como contexto e sempre rotulados como tal.

Quando documentação e código divergem, este documento descreve o comportamento do código, registra a divergência na seção 9 e evita transformar a divergência em regra. Nenhuma afirmação não óbvia deste texto deve ser aceita sem a citação do arquivo correspondente.

### 2.3 Convenção de identificadores

- Colunas e tabelas usam `snake_case` e são citadas exatamente como no banco: `barriers.manual_fields`, `barrier_status_history`, `external_code`.
- O wire HTTP e o domínio TypeScript usam `camelCase`: `manualFields`, `externalCode`, `statusSince`, `rowScope`.
- Rótulos em português são contrato de exibição e aparecem exatamente como a interface os mostra: `Disponível`, `Fora de Operação`, `Indisponível Contingenciado`, `Degradado Contingenciado`, `Degradado`, `Indisponível`.
- Ids numéricos são contrato estável entre banco, servidor, wire e cliente. `db/seed_lookups.sql` e `lib/enums/` precisam concordar; `lib/enums/codes.ts` e `lib/enums/taxonomy.ts` são os resolvedores canônicos.
- O mapa português para inglês é único e vive em `docs/GLOSSARY.md`. Novos identificadores devem seguir aquele mapa em vez de inventar variantes.

### 2.4 Convenção de citação de arquivos

Cada afirmação relevante cita o caminho entre parênteses, por exemplo (`lib/server/sql/where.ts`, `db/schema.sql`, `docs/API.md`). Caminhos são relativos à raiz do repositório. Números de linha são evitados porque envelhecem rápido; quando um valor exato importa, ele é transcrito no texto e a citação aponta o arquivo que o define. No fim do documento há um mapa de fontes com os arquivos principais por assunto.

### 2.5 O que é contrato público

O projeto trata como contrato sensível de compatibilidade (`agents.md` seção 5):

- caminhos de rota e nomes de campos do wire;
- chaves de filtro e formas de vocabulário;
- ids de `lib/enums/`;
- o mapeamento de exportação de 30 colunas (`lib/export/columns.ts`);
- chaves de deduplicação de alerta;
- chaves de `localStorage` do painel;
- chaves de `.env.example`.

A regra prática é adicionar, nunca remover. Uma mudança incompatível exige requisito explícito, revisão de consumidores e atualização de documentação no mesmo commit (`agents.md` seção 5, `DECISIONS.md` D01). Mudanças de schema são aditivas e reexecutáveis (`agents.md` seção 7).

## 3. Nível 1: superfície do produto

### 3.1 O problema

Instalações de petróleo e gás dependem de barreiras de segurança para impedir que um desvio de processo se transforme em acidente. Essas barreiras incluem válvulas de alívio de pressão, intertravamentos de segurança, sistemas fixos de combate a incêndio, detectores de fogo e gás, malhas de aterramento e SPDA, diques de contenção, alarmes críticos, procedimentos críticos e outros dispositivos ou sistemas cuja indisponibilidade muda o risco da operação (`docs/FRACTTAL.md`, `lib/enums/taxonomy.ts`).

O dado operacional dessas barreiras existe, mas costuma estar espalhado no CMMS: o ativo tem um código, uma hierarquia, uma categoria e uma criticidade; a disponibilidade real depende de ordens de serviço e solicitações de serviço abertas, do tipo de corretiva, de o ativo estar parado e de existir contingência compensatória. Transformar esse conjunto em uma visão confiável de conformidade exige três coisas que o CMMS sozinho não entrega: normalização, cálculo consistente de status e uma trilha auditável de quem mudou o quê e quando.

O custo de não ter isso é operacional e de governança. Sem uma visão única, cada área conta barreiras de um jeito, o plano de ação é descoberto tarde, a contingência é informal e o alerta chega depois que a barreira já está indisponível há dias. Em uma auditoria, não é possível provar por que uma barreira apareceu como conforme em uma data e não conforme em outra.

### 3.2 A solução

O Monitor de Barreiras de Segurança é um dashboard web que:

- importa o inventário de ativos do CMMS upstream (Fracttal) em modo **somente leitura**, sem write-back e sem webhook (`docs/FRACTTAL.md`);
- normaliza hierarquia, estação, categoria, tipologia, criticidade e campos de ficha em um modelo PostgreSQL compacto (`db/schema.sql`);
- deriva a disponibilidade a partir de eventos de trabalho (ordens e solicitações), do estado do ativo e do sinal de contingência, com precedência determinística (`lib/server/fracttal/barrier-rules.ts`);
- aplica um overlay de contingência na leitura, de modo que uma barreira degradada ou indisponível com contingência seja exibida como contingenciada e conforme (`db/schema.sql`, `docs/STATUSES.md`);
- serve KPIs, gráficos, filtros e uma tabela paginada por API JSON (`routes/api/`, `docs/API.md`);
- registra cada transição de status em histórico com autor, nota, origem e participantes (`barrier_status_history`, `record_status_change()`);
- detecta transições e lembretes de barreira parada, aplica regras administrativas, deduplica e entrega por um provedor HTTP externo (MSGFLOW), sem SMTP local (`lib/server/alerts/`, `docs/ARCHITECTURE.md`);
- protege o acesso com sessões opacas, dois papéis e escopo de estações por grupos de acesso (`lib/server/auth.ts`, `lib/server/sql/where.ts`).

O sistema não tenta substituir o CMMS. Ele é uma camada de leitura, normalização, conformidade e alerta sobre o CMMS. A curadoria do ativo continua sendo feita na fonte: se uma linha está mal classificada no Fracttal, ela entra mal classificada no Monitor e deve ser corrigida no Fracttal (`docs/FRACTTAL.md`).

### 3.3 Os dois papéis

O modelo de acesso tem exatamente dois papéis (`db/schema.sql`, `docs/GLOSSARY.md`):

| Papel   | Escopo de estações                                     | Pode fazer                                                                                                                                                                 |
| ------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `admin` | todas as estações                                      | ler, editar barreiras, alterar status, gerenciar usuários, grupos de acesso, destinatários legados, regras de alerta e opções de campo, ver linhas desativadas e excluídas |
| `user`  | somente a união das estações dos seus grupos de acesso | ler painel, KPIs, gráfico, tabela, detalhe, histórico, exportar o que enxerga; sem escrita                                                                                 |

Não existem outros papéis de login. Os rótulos de dono da barreira (`Operação`, `SMS`, `Manutenção`) são áreas responsáveis no domínio, não permissões (`lib/enums/taxonomy.ts`). Um usuário comum sem grupo vê zero estações, por decisão de segurança fail-closed (`DECISIONS.md` D21). Um administrador vê tudo, inclusive barreiras desativadas ou excluídas quando escolhe a situação correspondente.

### 3.4 Os objetos centrais

| Objeto                    | Onde vive                                       | O que representa                                                                          |
| ------------------------- | ----------------------------------------------- | ----------------------------------------------------------------------------------------- |
| Estação (`location`)      | `locations`                                     | instalação ou unidade operacional; `ALL` (id 0) é sentinela de UI e nunca uma linha       |
| Barreira (`barrier`)      | `barriers`                                      | ativo protegido, com TAG, estação, categoria, criticidade, status, ficha e código externo |
| Categoria                 | `categories`                                    | vocabulário dinâmico que classifica a barreira (válvula, intertravamento, detecção, etc.) |
| Tipologia                 | `typologies`                                    | tipo da instalação (estação coletora, campo, duto, poço, vapor, subestação)               |
| Agrupamento               | `groupings`                                     | agrupamento de barreiras por função de segurança                                          |
| Dono                      | `owners`                                        | área responsável (Operação, SMS, Manutenção); nulo significa não informado                |
| Criticidade               | `criticality_levels`                            | rank ESO, A, B, C ou D; ESO e A são os tiers críticos                                     |
| Status de disponibilidade | `availability_statuses`                         | seis ids estáveis, de Disponível a Indisponível                                           |
| Conformidade              | `barriers.compliance_id`                        | derivada do status efetivo, 0 conforme e 1 não conforme                                   |
| Contingência manual       | `barriers.has_contingency` e `contingency_desc` | flag da ficha que promove 4 para 3 e 5 para 2 na leitura                                  |
| Vínculo de contingência   | `barrier_contingencies`                         | relação local entre a barreira e outra barreira que a cobre                               |
| Histórico de status       | `barrier_status_history`                        | uma linha por transição, com autor, nota, origem e participantes                          |
| Execução de sync          | `sync_state`                                    | uma linha por execução, com escopo, estado, contadores e nota                             |
| Alteração de sync         | `sync_barrier_changes`                          | diff por barreira e por execução, com snapshots antes e depois                            |
| Regra de alerta           | `alert_rules`                                   | gatilho, escopo, urgência, janelas e prioridade                                           |
| Evento de alerta          | `alert_events`                                  | evento deduplicado, com payload, estado de envio e erro                                   |
| Usuário e sessão          | `users`, `sessions`                             | conta local ou Entra e sessão opaca de 12 horas                                           |
| Grupo de acesso           | `access_groups` e tabelas de vínculo            | escopo de estações por usuário                                                            |

O schema tem 25 tabelas de domínio (`db/schema.sql`), sem views, sem enums nativos do PostgreSQL e sem Row-Level Security. O escopo de estações é aplicado na aplicação, não pelo banco (`docs/DATABASE.md`).

### 3.5 O ciclo de ponta a ponta

```
Fracttal (CMMS, somente leitura)
        |
        |  GET /items, /work_orders, /work_requests, OAuth2
        v
Poller ou sync one-shot
        |
        |  normaliza hierarquia, categoria, tipologia, criticidade, status
        |  reconcilia por external_code
        v
PostgreSQL (barriers, histórico, auditoria de sync, regras, eventos)
        |
        |  SQL parametrizado, escopo de estação, overlay de contingência
        v
API JSON (/api/barriers, /api/kpi, /api/chart, /api/vocabularies, /api/export)
        |
        v
Dashboard Fresh/Preact (SSR + uma ilha hidratada)
        |
        |  transição de status confirmada
        v
Detector de alertas + regras + audiência derivada
        |
        |  POST JSON por evento
        v
Provedor MSGFLOW (e-mail e WhatsApp)
```

O ciclo tem duas cadências distintas. O poller do Fracttal roda por padrão a cada 300 segundos (`FRACTTAL_POLL_SECONDS`, `scripts/fracttal-poll.ts`) e faz um sweep completo do tenant, porque o upstream não oferece filtro de estação no servidor. O worker de alertas roda por padrão a cada 900 segundos (`ALERTS_POLL_SECONDS`, mínimo 60, `scripts/alerts-poll.ts`) e lê transições desde o último watermark. Uma mudança manual de status feita por um administrador também dispara um fan-out best-effort imediatamente após o commit (`routes/api/barriers/[id].ts`, `lib/server/alerts/status-fanout.ts`).

### 3.6 Os três processos e o modelo de entrega

O sistema é operado como três processos independentes, mais tarefas de manutenção (`docs/ARCHITECTURE.md`, `compose.yml`):

| Processo    | Papel                                                              | Porta ou efeito             |
| ----------- | ------------------------------------------------------------------ | --------------------------- |
| aplicação   | serve SSR, API JSON, exportação e a ilha do painel                 | 8300, loopback em produção  |
| poller      | sincroniza o Fracttal e grava barreiras, histórico e auditoria     | saída HTTPS para o CMMS     |
| alertas     | detecta transições, aplica regras, deduplica e entrega ao provedor | saída HTTPS para o provedor |
| ferramentas | migração, importação de dump, criação de admin, diagnóstico        | execução sob demanda        |

O modelo de entrega é deliberadamente dividido. A detecção, as regras, o watermark, a deduplicação e a audiência são locais. A entrega, o retry, os templates e o opt-out pertencem ao provedor HTTP. Não existe SMTP local (`DECISIONS.md` D25, `docs/ARCHITECTURE.md`). Cada evento de barreira vira um POST; a resposta 200 ou 202 é aceita; falhas de rede e 5xx são retentáveis; 401 e 422 param imediatamente; eventos que excedem o orçamento de tentativas ficam estacionados em dead-letter (`lib/server/alerts/provider.ts`, `lib/server/alerts/run-provider.ts`).

### 3.7 O que o sistema não é

Para evitar expectativa errada, o nível 1 termina com os não-objetivos explícitos:

- não escreve no Fracttal, não registra webhook e não faz sincronização bidirecional (`docs/FRACTTAL.md`);
- não usa ORM, segundo driver de banco, telemetria ou segundo framework de UI (`agents.md` seção 2);
- não tem Row-Level Security, views ou enums nativos (`docs/DATABASE.md`);
- não tem JWT: a sessão é opaca e existe apenas como hash no banco (`docs/ARCHITECTURE.md`);
- não tem SMTP local nem digest local (`DECISIONS.md` D25);
- não tem relatórios agendados nem envio automático de exportações (`docs/USO.md`);
- não tem seletor de idioma: a interface é somente pt-BR (`docs/USO.md`);
- não guarda aparência ou filtros padrão no servidor: são preferências do navegador (`docs/ARCHITECTURE.md`);
- não cria conta Entra automaticamente e não mapeia grupos Entra (`docs/ARCHITECTURE.md`);
- não expõe endpoint HTTP de audiência de alertas (`docs/API.md`);
- não usa dados pessoais de produção em desenvolvimento ou teste (`agents.md` seção 6).

## 4. Nível 2: o produto em funcionamento

Este nível descreve o que existe na interface e o que cada fluxo permite. Ele é o elo entre o problema de negócio e as regras detalhadas do nível 3. A referência de linguagem para o usuário final continua sendo `docs/USO.md`.

### 4.1 Páginas e rotas de interface

| Rota                              | Público               | Comportamento                                                                                                                                              |
| --------------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/login`                          | público               | formulário de e-mail e senha, botão de login Microsoft quando o SSO está habilitado e mensagens de falha                                                   |
| `/trocar-senha`                   | sessão local pendente | troca obrigatória de senha temporária; a sessão permanece autenticada, mas contida                                                                         |
| `/`                               | sessão autenticada    | painel principal; sem sessão redireciona para `/login` com retorno, e conta local com troca pendente recebe 303 para `/trocar-senha`                       |
| `/auth/entra/login`               | público               | inicia o fluxo OIDC com PKCE, state e nonce                                                                                                                |
| `/auth/entra/callback`            | público               | valida o retorno do provedor e cria a sessão, ou volta ao login com código de erro                                                                         |
| `/auth/entra/frontchannel-logout` | público               | revoga sessões pelo `sid` hasheado quando o recurso está habilitado                                                                                        |
| `/auth/entra/logged-out`          | público               | 404 quando o SSO está desabilitado; em requisição cross-site não revoga a sessão do servidor, apenas limpa o cookie e redireciona para `/login?sso=logout` |

O gate de sessão da página inicial roda no servidor, não na ilha (`routes/index.tsx`). Essa escolha é deliberada: um gate no cliente seria apenas uma sugestão, e a decisão de acesso precisa acontecer antes de qualquer dado ser carregado.

### 4.2 A tela de acesso

A tela de login aceita dois caminhos:

- **conta local**: e-mail e senha; falha sempre responde um 401 genérico, com verificação de hash dummy para igualar o tempo entre conta inexistente, conta inativa e senha errada (`routes/api/auth/login.ts`);
- **Microsoft Entra**: botão que inicia o fluxo OIDC; a conta precisa ter sido provisionada por um administrador, porque não existe criação just-in-time (`routes/auth/entra/callback.ts`, `docs/ARCHITECTURE.md`).

Quando o SSO está desabilitado, todas as rotas `/auth/entra/*` respondem 404 (`docs/API.md`). A conta local é o caminho break-glass e não pode ser desligada: `AUTH_LOCAL_ENABLED=false` é recusado no boot (`lib/server/config.ts`).

### 4.3 Primeiro acesso e senha temporária

Uma conta local criada ou redefinida por um administrador recebe uma senha temporária gerada individualmente, com 16 caracteres de um alfabeto de 55 símbolos sem caracteres ambíguos (o comentário de `lib/server/auth/password.ts` diz 54, mas a constante `TEMP_ALPHABET` tem 55 caracteres), devolvida uma única vez na resposta administrativa (`lib/server/auth/password.ts`, `routes/api/users.ts`). A conta fica com `must_change_password = true`.

No primeiro acesso:

- o painel não abre; o servidor responde 303 para `/trocar-senha`;
- a nova senha precisa ter entre 12 e 256 caracteres e ser diferente da atual;
- a troca grava a nova senha e limpa o flag na mesma transação, revoga todas as sessões e limpa o cookie (`routes/api/auth/password.ts`);
- depois da troca, a pessoa entra novamente.

A senha temporária não expira, porque o sistema não consegue impor expiração. A mitigação é o gate de troca forçada (`DECISIONS.md` D30, D31). Contas Entra nunca carregam esse flag e não usam senha local.

### 4.4 O painel

O painel é uma única ilha hidratada (`islands/Dashboard.tsx`) que recebe do servidor o modo de API, a base URL, o nome da empresa e os dados iniciais. De cima para baixo, a tela tem:

1. **Cabeçalho**: marca da empresa, indicador de conexão, linha de sincronização, usuário, botão de configurações e saída.
2. **Abas de instalação**: `Todas` e uma aba por estação, com a quantidade de barreiras, rolando horizontalmente (`components/LocationFilter.tsx`).
3. **Faixa de disponibilidade**: totais por status, clicáveis para filtrar. Administradores veem também `Desativadas` e `Excluídas` (`components/StatusBand.tsx`).
4. **Cartões de KPI**: percentual de conformidade, total de não conformes e recortes por criticidade (`components/KpiGrid.tsx`).
5. **Gráfico de conformidade por categoria**, com visão de barras ou resumo e três ordenações (`components/ComplianceChart.tsx`).
6. **Alerta de não conformidade**, com o botão `Ver urgentes` que prioriza os casos críticos e mais antigos (`islands/dashboard/NcAlert.tsx`).
7. **Filtros**, **tabela** e **rodapé** com paginação e seleção (`components/FilterBar.tsx`, `components/BarriersTable.tsx`).

#### Cabeçalho e saúde da conexão

O indicador de saúde combina o estado da conexão com o estado da última sincronização. A matriz de precedência é: offline vence tudo; sincronizando vence idle, falha e stale; stale aparece antes de never; uma última execução com falha aparece como falha, exceto quando a nota indica run reapa, que vira interrompida; uma execução `ok` antiga além de 30 minutos vira desatualizada (`lib/sync-indicator.ts`). A linha de sincronização mostra resultado, horário, duração, escopo, nota e as alterações da última execução ou das últimas 24 horas (`components/header/`).

#### Abas e faixa de disponibilidade

As abas vêm dos vocabulários de estação do escopo do usuário. A faixa de disponibilidade usa a ordem canônica `Disponível`, `Fora de Operação`, `Indisponível Contingenciado`, `Degradado Contingenciado`, `Degradado`, `Indisponível`; valores novos aparecem depois, ordenados por volume (`lib/constants/colors.ts`). Clicar em um status aplica o filtro correspondente. Para administradores, os segmentos `Desativadas` e `Excluídas` mudam o conjunto de linhas, mas não aparecem para usuários comuns.

#### Cartões de KPI

Os cartões mostram:

- `% Conformidade`, com uma casa decimal, e a decomposição entre conformes e não conformes;
- `Não Conformes`, com a decomposição entre degradadas e indisponíveis e a participação de cada uma no total de não conformes;
- `Críticas ESO+A`, com total, não conformes do grupo e participação;
- `Não Críticas`, com o restante do inventário.

O cálculo vem do snapshot do servidor (`lib/server/sql/kpi.ts`) e é reproduzido no cliente (`lib/dashboard/kpi.ts`). A seção 5.6 detalha a semântica exata.

#### Gráfico por categoria

O gráfico agrupa barreiras por categoria e mostra conforme versus não conforme. Ele permite:

- alternar entre barras e resumo (`volume`, `ncRate` e `alpha`);
- clicar em uma categoria para filtrar a tabela;
- expandir para uma visão maior;
- ver tooltip com totais e taxa.

As constantes são `CHART_TOP_N = 20`, `CHART_COLUMNS = 2`, `CHART_MIN_VOLUME = 5` e `CHART_TOP_NC = 8`; rótulos são truncados apenas na apresentação, em 26 caracteres (`lib/dashboard/chart.ts`). O resumo executivo lista até oito categorias com não conformes maiores que zero e ordena por não conformes, depois total, depois nome.

#### Alerta de não conformidade e urgentes

O alerta aparece quando existe pelo menos uma barreira não conforme no filtro. A definição de urgência é única em `lib/dashboard/urgent.ts`:

- `critical`: não conforme e criticidade ESO ou A;
- `urgent`: qualquer outro não conforme;
- `none`: conforme.

A lista de urgentes ordena críticos primeiro, depois `statusSince` mais antigo, com ausência de data no fim e desempate por `id`. O botão alterna entre aplicar e limpar o filtro de urgentes.

### 4.5 Tabela, busca e filtros

A tabela tem 11 definições de coluna e 8 visíveis por padrão (`components/table/columns.ts`):

| Coluna            | Visível por padrão | Filtro associado |
| ----------------- | ------------------ | ---------------- |
| `#`               | sim                | nenhum           |
| `TAG`             | sim                | busca            |
| `Tipologia`       | sim                | tipologia        |
| `Estação`         | sim                | estação          |
| `Criticidade`     | sim                | criticidade      |
| `Categoria`       | sim                | categoria        |
| `Dono`            | não                | nenhum           |
| `Disponibilidade` | sim                | disponibilidade  |
| `Conformidade`    | sim                | conformidade     |
| `Contingência`    | sim                | nenhum           |
| `Desde`           | não                | nenhum           |

O menu de colunas permite mostrar e ocultar, reordenar e restaurar o padrão. Os filtros fixos `Plano` e `Período` podem ser ocultados (`components/table/columns.ts`).

Comportamentos importantes:

- a busca rápida encontra por TAG, código da estação e rótulo da categoria (`docs/USO.md`, `lib/server/sql/where.ts`);
- filtros de tipologia, categoria, criticidade, disponibilidade, conformidade, plano de ação e período podem ser combinados;
- administradores também filtram `Situação` (ativas, desativadas, excluídas, todas); usuários comuns veem apenas ativas;
- a paginação oferece 25, 50 ou 100 linhas;
- o cabeçalho seleciona a página atual; a opção de selecionar tudo estende a seleção a todas as linhas do filtro, inclusive em outras páginas; `Limpar seleção` desfaz;
- a exportação usa somente as linhas selecionadas.

### 4.6 Detalhe da barreira

Clicar em uma linha abre o modal de detalhe, com quatro abas (`components/barrier-modal/BarrierModal.tsx`):

| Aba            | Conteúdo                                                                                        | Quem edita                                                 |
| -------------- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `Detalhes`     | identificação, categoria, criticidade, dono, status, ficha e o bloco `Causa da Disponibilidade` | leitura para todos; edição na aba `Editar`                 |
| `Contingência` | vínculos de saída, de entrada e candidatos; referências de MOC e análise de risco               | administradores criam, editam e removem vínculos elegíveis |
| `Histórico`    | transições de status com data, autor, nota, origem e participantes                              | leitura                                                    |
| `Editar`       | campos editáveis da barreira, com marca `Manual` e botão `Reverter p/ Fracttal`                 | somente administradores, em barreiras ativas               |

O bloco `Causa da Disponibilidade` é derivado em tempo de leitura do histórico e dos comentários, sem persistir linhas brutas de ordem de serviço (`lib/status-explanation.ts`, `DECISIONS.md` D36). Ele reconhece as notas determinísticas gravadas pelo sync e pela importação e usa fallback determinístico para o que não reconhece.

Cada campo editável indica a origem no Fracttal, para orientar a correção na fonte (`lib/field-ownership.ts`). Um campo editado recebe a marca `Manual` e deixa de ser sobrescrito pelo sync; `Reverter p/ Fracttal` o devolve, e o valor do Fracttal volta a valer no próximo ciclo.

Quando `DEV=true` e o modo é `http`, administradores também podem abrir o painel de detalhe raw do Fracttal (`components/barrier-modal/FracttalRawData.tsx`). A rota `GET /api/barriers/:id/fracttal-raw` responde 404 quando o painel está desligado, usa `cache-control: private, no-store` e tem throttle próprio de 5 requisições por minuto (`routes/api/barriers/[id]/fracttal-raw.ts`).

### 4.7 Configurações

O botão de engrenagem abre um workspace centralizado, não um slide-over: um diálogo de aproximadamente 1180 px de largura e 88 dvh de altura, com rail de páginas fixo e coluna de conteúdo com scroll próprio; em telas pequenas ele colapsa em uma coluna sem scroll horizontal (`DECISIONS.md` D33, `static/styles.css`).

O rail tem quatro grupos (`components/settings/PanelChrome.tsx`):

| Grupo         | Páginas                                                   | Acesso        |
| ------------- | --------------------------------------------------------- | ------------- |
| Preferências  | `Aparência`, `Filtros`                                    | público       |
| Conta         | `Conta`                                                   | sessão        |
| Administração | `Usuários`, `Grupos`, `Destinatários`, `Regras`, `Opções` | administrador |
| Sistema       | `Sincronização`                                           | sessão        |

A página administrativa é carregada em chunk lazy e tem gate fail-closed duplo: o shell não renderiza a seção para não administrador, e o próprio `AdminSection` repete a checagem e mostra `Acesso restrito` (`components/settings/AdminSection.tsx`, `components/SettingsPanel.tsx`). Um usuário comum nunca faz parse do chunk administrativo.

#### Aparência

Oferece tema `Claro`, `Escuro` ou `Black` (AMOLED), oito acentos, densidade `Compacto`, `Confortável` ou `Amplo`, quatro tamanhos de texto (93,75 %, 100 %, 112,5 %, 125 %), redução de animações e desativação de desfoque (`context/settings/presets.ts`). As preferências são salvas no navegador, não no servidor.

#### Filtros

Permite definir instalação, disponibilidade, conformidade, categoria, tipologia, criticidade, plano de ação e ordenação iniciais aplicados ao abrir o monitor. O estado persistido é sanitizado campo a campo e tem versão de defaults 3; blobs antigos com `criticalOnly` implícito são migrados (`lib/dashboard/filters.ts`).

#### Conta

Atualiza nome, e-mail e telefone, e permite trocar a própria senha. A troca de senha encerra todas as sessões. Para conta Entra, a interface informa que a senha é gerenciada pela organização.

### 4.8 Administração

As cinco telas administrativas compartilham busca que ignora maiúsculas e acentos, paginação 25/50/100, seleção com poda e ações em lote (`hooks/useAdminList.ts`, `components/settings/admin/`).

| Tela            | O que permite                                                                                                                            |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `Usuários`      | criar, editar, ativar, desativar, promover, rebaixar, redefinir senha, revogar sessões e converter conta local para Entra; ações em lote |
| `Grupos`        | definir nome, descrição, estações e usuários de um grupo de acesso; ações em lote                                                        |
| `Destinatários` | manter a lista manual legada; não define a entrega atual                                                                                 |
| `Regras`        | criar e editar regras de alerta com escopo, gatilho, urgência, anti-ruído, validade e prioridade; ações em lote                          |
| `Opções`        | editar as respostas e os padrões dos campos da ficha; restaurar os valores mais comuns                                                   |

Comportamentos de confirmação (definidos em `docs/USO.md` e implementados em `AdminToast`):

- na tela `Usuários`, o sucesso aparece como toast temporário que desaparece sozinho;
- nas demais telas administrativas, a confirmação de sucesso permanece até ser fechada;
- erros permanecem na própria tela até serem corrigidos.

A redefinição de senha gera uma senha temporária exibida uma única vez, com `no-store`; contas Entra não têm senha local para redefinir. A conversão para Entra preserva o `id` e o histórico, limpa o hash de senha, revoga sessões e desabilita login local e reset de senha; a conversão de volta para local não é suportada (`lib/server/sql/users.ts`, `docs/ARCHITECTURE.md`).

### 4.9 Alertas pela ótica do produto

O público dos alertas não é uma lista configurável. Ele é derivado dos usuários ativos e dos grupos de acesso:

- administradores recebem alertas de todas as estações;
- usuários comuns recebem apenas alertas das estações dos seus grupos;
- usuários sem grupo não recebem nada;
- cada alerta é filtrado pela estação da barreira que o originou;
- a tela `Destinatários` não participa desse cálculo (`docs/API.md`, `docs/USO.md`).

A tela `Regras` define quando e como os alertas disparam: categoria, local, criticidade, tipologia, agrupamento, responsável, status de origem e de destino, transição, lembrete de barreira parada, urgência do caso, pausa por barreira, limite diário, janela de silêncio, validade e prioridade entre regras concorrentes (`docs/USO.md`, `lib/server/alerts/rules.ts`).

Sem nenhuma regra cadastrada, todo estado não conforme alerta. Com regras cadastradas, só o que casar com escopo, gatilho e janela anti-ruído alerta, e a regra de maior prioridade vence (`lib/server/alerts/rules.ts`).

### 4.10 Exportação

A exportação usa apenas as linhas selecionadas. O botão fica desabilitado sem seleção. Os formatos são:

- **XLSX**: planilha gerada por um builder in-house, sem a biblioteca `xlsx` no caminho de runtime;
- **PDF**: relatório tabular;
- **CSV**: texto delimitado.

Todos os formatos abrangem a seleção completa, inclusive linhas de outras páginas. O servidor faz streaming em lotes de 5.000 linhas, com teto de 200.000 linhas por exportação; acima do teto responde 400 com a contagem real (`lib/export/limits.ts`, `docs/API.md`). Não há relatórios agendados nem envio automático.

### 4.11 Sincronização pela interface

A página `Sincronização`, no grupo Sistema, mostra o estado da integração: resultado e horário da última execução, duração, origem, detalhe técnico e alterações da última sincronização ou das últimas 24 horas, com acesso à barreira correspondente (`docs/USO.md`, `components/settings/SyncSection.tsx`).

O estado exposto pela API é um de quatro valores (`lib/server/sql/sync-status.ts`):

| Estado    | Significado                                                             |
| --------- | ----------------------------------------------------------------------- |
| `syncing` | existe uma execução em voo dentro da janela fresca                      |
| `idle`    | existe uma última execução concluída e não há execução em voo           |
| `stale`   | existe uma linha `running` antiga, provavelmente de processo que morreu |
| `unknown` | não há execução conhecida                                               |

`SYNC_FRESH_MINUTES = 10` define a janela de execução em voo e `SYNC_STALE_MINUTES = 15` define a janela provável de crash. A linha reapa aparece como `Interrompida`, não como falha (`lib/sync-indicator.ts`).

### 4.12 Primeiros passos

Para subir um ambiente local:

```bash
cp .env.example .env
# editar DATABASE_URL e, se necessário, APP_BASE_URL e COMPANY_NAME
deno task db:migrate
deno task db:seed
deno task admin:create -- --email <endereco-do-admin>
deno task dev
```

O `admin:create` pede a senha em stdin mascarado, com mínimo de 12 caracteres. A opção `--password` é depreciada porque o segredo vaza no histórico do shell e na lista de processos; para instalação não interativa, use `ADMIN_PASSWORD` (`readme.md`, `scripts/create-admin.ts`). Quando já existem usuários, é preciso `--confirm-existing` para criar outro administrador intencionalmente.

O modo `mock` serve dados em memória pela mesma interface `lib/api.ts` do modo `http`; o painel não se ramifica por transporte (`docs/ARCHITECTURE.md`). Em produção, `PUBLIC_API_MODE=http` é obrigatório e o modo mock é recusado (`lib/server/config.ts`).

### 4.13 Problemas comuns e o que eles significam

| Sintoma                            | Causa provável                                                          | Onde verificar                                                   |
| ---------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------- |
| não consigo entrar                 | credencial inválida, conta inativa ou conta Entra sem provisionamento   | `/login`, resposta 401 genérica, `users.active`, `auth_source`   |
| só aparece a troca de senha        | conta local ainda com `must_change_password`                            | `/trocar-senha`, `DECISIONS.md` D31                              |
| o painel não mostra barreiras      | usuário comum sem grupo, ou grupo sem estações                          | `user_access_groups`, `access_group_locations`                   |
| não recebo alertas                 | conta inativa, sem grupo que cubra a estação, ou nenhuma regra que case | `lib/server/sql/alert-audience.ts`, `lib/server/alerts/rules.ts` |
| o botão exportar está desabilitado | nenhuma linha selecionada                                               | `components/export/ExportButtons.tsx`                            |
| os dados parecem antigos           | campo marcado como `Manual` ou poller parado                            | `manual_fields`, `/api/sync-status`                              |
| a tela está pesada                 | animações e desfoque ligados                                            | `Aparência`                                                      |

## 5. Nível 3: regras de negócio

Este nível descreve as decisões que o sistema toma, na ordem em que um leitor precisa entendê-las: status, contingência, propriedade, escopo, agregados, filtros, alertas, autenticação e exportação. Sempre que uma regra tem limite documentado ou divergência entre documentação e código, isso é dito no lugar e retomado na seção 9.

### 5.1 Status e conformidade

Os ids de status são contrato entre banco, enum, wire e cliente. Os rótulos são exatamente os exibidos (`db/seed_lookups.sql`, `lib/enums/codes.ts`, `docs/STATUSES.md`):

| Id | Rótulo                      | Conforme | Semântica                                                        |
| -: | --------------------------- | -------- | ---------------------------------------------------------------- |
|  0 | Disponível                  | sim      | sem sinal urgente aberto e sem parada ou fora de operação        |
|  1 | Fora de Operação            | sim      | ativo protegido parado e isolado positivamente; parada planejada |
|  2 | Indisponível Contingenciado | sim      | indisponibilidade com contingência em vigor                      |
|  3 | Degradado Contingenciado    | sim      | degradação com contingência em vigor                             |
|  4 | Degradado                   | não      | corretiva planejada aberta com marcador de urgência              |
|  5 | Indisponível                | não      | corretiva emergencial aberta ou ativo sinalizado indisponível    |

A conformidade é fixa por id: 0, 1, 2 e 3 são `Conforme`; 4 e 5 são `Não Conforme`; um id desconhecido falha fechado para `Não Conforme` (`lib/constants/helpers.ts`, `lib/resolve.ts`, `docs/STATUSES.md`). O banco materializa `barriers.compliance_id` como 0 conforme e 1 não conforme por trigger, a partir da disponibilidade efetiva; não é foreign key para `availability_statuses` (`db/schema.sql`).

Não existe matriz de transição. Qualquer status pode suceder qualquer outro, e só uma mudança real é registrada (`docs/STATUSES.md`). `Fora de Operação` é um status conforme de parada planejada e é suprimido da entrega de alertas: não pagina nem envia e-mail como violação, mas continua nos totais e no histórico (`lib/server/alerts/provider.ts`). Os status 2 e 3 continuam conformes mesmo quando derivam de bases não conformes, porque existe contingência.

### 5.2 Derivação de status no sync e na importação

`resolveAvailability` é a regra pura compartilhada pelo sync live e pelo import de dump (`lib/server/fracttal/barrier-rules.ts`). A precedência, primeiro match vence, é:

| Ordem | Condição                                            | Resultado                                   |
| ----: | --------------------------------------------------- | ------------------------------------------- |
|     1 | corretiva emergencial aberta                        | 5 Indisponível, ou 2 se houver contingência |
|     2 | corretiva planejada aberta com flag de urgência     | 4 Degradado, ou 3 se houver contingência    |
|     3 | corretiva planejada aberta sem flag de urgência     | nenhum sinal de status                      |
|     4 | ativo parado ou data de fora de operação            | 1 Fora de Operação                          |
|     5 | ativo sinalizado indisponível (`available = false`) | 5 Indisponível                              |
|     6 | nenhuma das anteriores                              | 0 Disponível                                |

Detalhes que mudam o resultado:

- **Classificação de trabalho**: `Corretiva Emergencial` e `Falha Funcional` são urgentes; `Corretiva Planejada` e `Falha Potencial` são planejadas (`lib/server/fracttal/barrier-rules.ts`). Uma requisição só classifica quando o texto contém o radical `corretiva` ou `falha`; `emergencial` dentro desse texto a torna urgente, caso contrário planejada. Rótulos abreviados como `CORR - Planejada` não carregam sinal.
- **Flag de urgência**: em requisição, `is_urgent === true`; em ordem de serviço, prioridade alta ou emergência (`very_high`, `very high`, `muito alta`, `high`, `alta`, `emergenc`, `urgent`) (`lib/server/fracttal/work.ts`, `lib/server/fracttal/barrier-rules.ts`).
- **Aberto e fechado**: uma ordem é fechada quando `done === true` ou `id_status === 4`; é aberta quando `done === false` ou `id_status` em 1 ou 2 (`lib/server/fracttal/work.ts`, duplicado em `scripts/fracttal-import.ts`). Requisições fechadas são 4, 5, 6, 11 e 12; o status 9, que representa ordem cancelada, permanece deliberadamente aberto, porque a necessidade subjacente pode persistir e, para barreiras de segurança, um sinal grudado é preferível a um decaimento silencioso (`lib/server/fracttal/barrier-rules.ts`).
- **Data explícita vence flag**: uma data de fora de operação vence o `available = false`; a regra 4 é avaliada antes da regra 5.
- **Trabalho preventivo**: nunca altera disponibilidade. Ele alimenta apenas o indicador de plano cumprido (`lib/server/fracttal/barrier-rules.ts`).
- **Data do evento**: é a mais antiga data válida `YYYY-MM-DD` entre os candidatos. Ordens consideram `initial_date`, `date_maintenance`, `creation_date`, `event_date`, `final_date`, `wo_final_date`, `cal_date_maintenance` e `first_date_task`; requisições consideram `date_incident`, `date_maintenance`, `date` e `date_status` (`lib/server/fracttal/work.ts`). Eventos mesclados mantêm a data mais antiga e a primeira fonte não vazia. Evento sem data ainda deriva status aberto, e a data cai para hoje.
- **Import usa extrator mais estreito**: apenas `initial_date`, `date_maintenance` e `creation_date` para os dois tipos de linha (`scripts/fracttal-import.ts`, `docs/FRACTTAL.md`).

**Persistência da data (comportamento real).** A importação grava `status_since` e a data do histórico a partir de `s.statusSince`, isto é, da data derivada do evento (`scripts/fracttal-import.ts`). O sync live calcula `statusSince` na regra pura, mas o caminho de aplicação chama `record_status_change()` sem esse valor, e a função grava `current_date` tanto em `barriers.status_since` quanto em `barrier_status_history.date` (`lib/server/sql/sync-apply.ts`, `db/schema.sql`). O efeito prático é que transições vindas do sync live usam a data do processamento, não a data do evento upstream, o que afeta `Desde`, filtros de período e `stale_days`. A documentação de `docs/FRACTTAL.md` descreve o comportamento do import como se valesse para os dois caminhos; a divergência está registrada na seção 9.

### 5.3 Contingência e disponibilidade efetiva

Existem dois conceitos de contingência que não devem ser confundidos:

1. **Flag manual da ficha**: o campo `has_contingency` responde `Sim` ou qualquer outra coisa. A comparação dobra caixa e acentos e remove espaços; somente `sim` conta (`db/schema.sql` `is_contingency_flag`, `lib/server/fracttal/barrier-rules.ts`).
2. **Vínculo entre barreiras**: a tabela `barrier_contingencies` registra que uma barreira é coberta por outra, com `management_change` (MOC) e `risk_analysis` opcionais (`db/schema.sql`).

A disponibilidade efetiva é definida uma vez no SQL e reutilizada por filtros, KPI, gráfico, vocabulários, contingências e alertas de staleness (`DECISIONS.md` D23):

```
efetivo = 3 se armazenado = 4 e flag = Sim
efetivo = 2 se armazenado = 5 e flag = Sim
efetivo = armazenado em qualquer outro caso
```

A função `effective_availability_id(base_id, has_contingency)` implementa isso, e o trigger `trg_barriers_set_compliance` grava `compliance_id` a partir dela (`db/schema.sql`). Há backfill idempotente para linhas antigas. O cliente nunca confia na conformidade do wire: `resolveBarrier` recalcula a partir da disponibilidade efetiva (`lib/resolve.ts`).

**Promoção e rebaixamento na edição.** No PATCH administrativo, quando o cliente **não** envia `availabilityId`, alterar o flag de contingência executa uma transição real e registra histórico:

| Mudança                    | Transição | Nota                      |
| -------------------------- | --------- | ------------------------- |
| marcar `Sim` em barreira 4 | 4 para 3  | `Contingência registrada` |
| marcar `Sim` em barreira 5 | 5 para 2  | `Contingência registrada` |
| limpar em barreira 3       | 3 para 4  | `Contingência removida`   |
| limpar em barreira 2       | 2 para 5  | `Contingência removida`   |

Se o request envia `availabilityId` explícito, o status explícito vence e o overlay não é aplicado (`routes/api/barriers/[id].ts`, `docs/API.md`).

**Contingência automática.** O sync pode derivar 2 ou 3 diretamente quando o texto de ordem ou requisição contém sinal de contingência: o texto dobrado contendo `contingenc`, um código `GM-...` ou `GM ...`, o token isolado `gm` ou o token isolado `cec` (`lib/server/fracttal/barrier-rules.ts`). A fonte é registrada em `contingency_desc`. O flag manual é separado e aplicado no overlay de leitura.

**Elegibilidade de vínculo.** Uma barreira só pode ser escolhida como contingência quando está ativa, não excluída, na mesma estação, com status **armazenado** 0 (Disponível) e conforme (`lib/server/sql/contingencies.ts`). Essa checagem usa `c.availability_id`, não `effective_availability_id`, apesar de D23 dizer que a disponibilidade efetiva dirige contingências. Consequência documentada: uma barreira armazenada como 4 ou 5 com `has_contingency = Sim` é exibida como 3 ou 2 e conforme, mas **não** é elegível como barreira de contingência. O vínculo existente sobrevive à perda de elegibilidade; a lista apenas marca `eligible = false` (`db/schema.sql`, `docs/DATABASE.md`).

A lista de candidatos tem limite de 50, com `candidatesHaveMore` para indicar truncamento; a busca `q` tem limite de 200 caracteres (`lib/server/sql/contingencies.ts`, `docs/API.md`).

### 5.4 Propriedade manual de campos

O editor administrativo pode assumir campos do Fracttal. A propriedade é registrada em `barriers.manual_fields`, um array de chaves **camelCase**; vazio significa que tudo segue o Fracttal (`db/schema.sql`, `lib/field-ownership.ts`).

Existem exatamente **24 chaves apropriáveis** (`lib/field-ownership.ts`):

`tag`, `locationId`, `typologyId`, `categoryId`, `groupingId`, `ownerId`, `criticalityId`, `comments`, `actionPlan`, `origin`, `installLocal`, `equipTypology`, `fieldInstalled`, `fieldOperational`, `opStatus`, `hasMaintPlan`, `planFollowed`, `failureFree`, `maintStatus`, `hasContingency`, `contingencyDesc`, `evidenceCode`, `degradationDesc`, `extraComments`.

Regras:

- O PATCH grava **apenas chaves cujo valor realmente mudou**. Salvar sem mudança não congela a linha (`DECISIONS.md` D20, `lib/server/sql/barriers.ts`).
- `releaseFields` remove chaves do conjunto e devolve o campo ao sync; nomes desconhecidos ou não string geram 400 (`routes/api/barriers/[id].ts`, `docs/API.md`). O valor atual permanece até o próximo sync, quando o valor do Fracttal volta a valer.
- `availability_id` **nunca** entra em `manual_fields`; a propriedade de status é do autor do histórico (`docs/DATABASE.md`, `lib/field-ownership.ts`).
- `isActive`, `locDescId` e `scopeSource` são exclusivos do sync e não aparecem no editor (`lib/field-ownership.ts`).
- `hasContingency` e `contingencyDesc` compartilham um fragmento de UPDATE: assumir o flag assume o par; a descrição só é significativa com `Sim` (`lib/field-ownership.ts`, `lib/server/sql/sync-apply.ts`).

**Exclusão da assinatura de mudança.** A assinatura do sync (`SIGNATURE_FIELD_KEYS`) tem **27 chaves**: `tag`, `locationId`, `typologyId`, `locDescId`, `criticalityId`, `categoryId`, `groupingId`, `ownerId`, `comments`, `actionPlan`, `isActive`, `scopeSource`, `origin`, `installLocal`, `equipTypology`, `fieldInstalled`, `fieldOperational`, `opStatus`, `hasMaintPlan`, `planFollowed`, `failureFree`, `maintStatus`, `hasContingency`, `contingencyDesc`, `evidenceCode`, `degradationDesc`, `extraComments` (`lib/server/fracttal/sync.ts`). A ordem faz parte do contrato com a assinatura armazenada. `fieldsSignature` exclui dos dois lados as chaves presentes em `manual_fields`; por isso uma edição manual sozinha não marca a linha como alterada e o sync não a reverte. `hasContingency` normaliza nulo para `Não`, e `contingencyDesc` normaliza nulo para string vazia.

**Corrida de edição.** No UPDATE do sync, a propriedade é verificada dentro da própria instrução SQL, contra o `manual_fields` corrente da linha, e não contra o snapshot do plano:

```sql
col = case when 'chave' = any(manual_fields) then col else $n end
```

Isso fecha a corrida de um sweep longo que começou antes de uma edição administrativa (`lib/server/sql/sync-apply.ts`, `DECISIONS.md` D24). O PATCH de barreira é uma única transação que cobre status, metadados e overlay de contingência; os locks de linha serializam edições concorrentes e o read-modify-write de `manual_fields`.

**Propriedade de status.** Além de `manual_fields`, o sync protege o status quando a última transição foi de um administrador. `statusIsSyncOwned(latestAuthorId)` é verdadeiro quando o último autor é nulo (linha legada ou de seed, sem histórico) ou quando é o autor do sync (`SYNC_AUTHOR_ID = 10`). Só nesse caso o sync propaga a disponibilidade. Se a última transição foi administrativa, o sync não a reverte no próximo sweep (`lib/server/sql/sync-apply.ts`, `lib/server/sql/sync-constants.ts`).

Após o commit, o fan-out de alerta é best-effort e não aguardado. Uma falha do provedor não segura o salvamento; o ciclo periódico tenta de novo (`routes/api/barriers/[id].ts`, `lib/server/alerts/status-fanout.ts`).

### 5.5 Escopo de estações

O escopo de estações é a fronteira de autorização mais importante do sistema depois do login. A cadeia é:

```
users -> user_access_groups -> access_groups -> access_group_locations -> locations
```

Regras (`lib/server/auth.ts`, `lib/server/sql/access-groups.ts`, `docs/ARCHITECTURE.md`):

- `resolveAllowedLocationIds()` retorna `null` **somente** para administrador. Para qualquer não administrador, inclusive sessão malformada ou usuário legado sem grupo, retorna um array explícito.
- Um array vazio significa **zero estações**. Nunca é tratado como irrestrito.
- `allowedLocationsForUser()` devolve a união distinta das estações dos grupos; sem vínculo, array vazio.
- `buildWhere()` transforma array vazio em `and false` e array não vazio em `b.location_id = any($n)` (`lib/server/sql/where.ts`).
- O mesmo escopo é aplicado a leitura de barreiras, KPI, gráfico, vocabulários, exportação e busca de barreira por id. Um cliente pode estreitar o escopo com filtros, nunca ampliá-lo.
- Não há Row-Level Security. O banco não filtra linhas por usuário; uma conexão SQL direta vê tudo (`db/schema.sql`, `docs/DATABASE.md`).

**Grupo padrão.** A migração cria a linha do grupo `Acesso geral`, mas não (re)concede estações nem inscreve usuários: `db:migrate` é idempotente e não desfaz remoções feitas por um administrador (`db/schema.sql`). O grupo permanece disponível para quem o usa; a remoção manual de vínculos persiste entre migrações.

### 5.6 KPI e gráfico

O KPI do servidor é calculado em uma única ida ao banco (`lib/server/sql/kpi.ts`):

- `total` conta todas as linhas do filtro;
- os contadores fixos `available`, `outOfService`, `contingencyOutage`, `degradedContingency`, `degraded` e `unavailable` contam linhas **ativas e não excluídas** com a disponibilidade efetiva correspondente;
- `other` absorve linhas ocultas (inativas ou excluídas), status desconhecidos e qualquer id fora de 0 a 5, de forma que a soma dos fixos mais `other` seja igual a `total`;
- `compliant` e `nonCompliant` contam todas as linhas do filtro, inclusive ocultas quando `rowScope = all`;
- `criticalNonCompliant` conta não conformes com criticidade 0 ou 1 (ESO ou A);
- `withoutActionPlan` conta `action_plan` nulo ou vazio;
- `pctCompliant` é `round(compliant / total * 1000) / 10`, com uma casa decimal; total zero resulta em 0;
- `byAvailability`, `byCompliance`, `byCriticality` e `ncByCriticality` são buckets dinâmicos com ids numéricos convertidos para rótulos no cliente;
- `inactive` e `deleted` são contados sobre o subconjunto de filtros **ignorando `rowScope`**, mas mantendo os demais filtros, e apenas para administradores (`lib/server/sql/kpi.ts`, `routes/api/kpi.ts`).

O cliente `computeKpi` segue a mesma política: linhas ocultas não entram nos buckets de disponibilidade, entram em `other` e continuam contando em conformidade e criticidade (`lib/dashboard/kpi.ts`). O snapshot do servidor tem memoização de 30 segundos.

O gráfico (`lib/server/sql/chart.ts`, `lib/dashboard/chart.ts`):

- agrupa por `category_id` e conta `compliant` pela disponibilidade efetiva e `total`;
- ordena por total decrescente no servidor;
- no cliente, agrupa por categoria resolvida e calcula `Não Conforme = max(0, total - compliant)` para lidar com categorias ou status novos de forma fail-closed (`lib/resolve.ts`);
- mantém nomes completos no dado; a truncagem em 26 caracteres é apenas de apresentação;
- usa `CHART_TOP_N = 20`, `CHART_COLUMNS = 2`, `CHART_MIN_VOLUME = 5` e `CHART_TOP_NC = 8`;
- oferece ordenação `volume` (maior total primeiro), `ncRate` (maior taxa de não conformes primeiro, com linhas de volume menor que 5 afundando) e `alpha` (A-Z em pt-BR);
- o resumo lista até oito categorias com não conformes maiores que zero, ordenadas por não conformes, depois total, depois nome.

A barra de disponibilidade usa a ordem canônica e coloca valores novos depois, por volume (`lib/constants/colors.ts`). Cores de valores novos são um hash determinístico de hue.

### 5.7 Filtros, ordenação e paginação

As chaves abaixo são compartilhadas por `/api/barriers`, `/api/barriers/ids`, `/api/kpi`, `/api/chart`, `/api/barriers/deleted` e `/api/export` (`docs/API.md`, `routes/api/_params.ts`):

| Chave            | Valores                                | Regra                                                                                                                       |
| ---------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `locationId`     | id de estação                          | `0` significa todas; uma estação por vez                                                                                    |
| `availabilityId` | id ou lista separada por vírgula       | multi-select                                                                                                                |
| `complianceId`   | id ou lista                            | multi-select                                                                                                                |
| `categoryId`     | id ou lista                            | multi-select                                                                                                                |
| `typologyId`     | id ou lista                            | multi-select                                                                                                                |
| `criticalityId`  | id ou lista                            | multi-select                                                                                                                |
| `criticalOnly`   | `true`                                 | mantém ESO e A                                                                                                              |
| `hasActionPlan`  | `true` ou `false`                      | presença ou ausência de plano; ausência é nulo ou string vazia                                                              |
| `query`          | texto                                  | trimado, no máximo 200 caracteres; busca TAG, código da estação e rótulo da categoria; `ILIKE` com escape de `%`, `_` e `\` |
| `since`          | `YYYY-MM-DD`                           | limite inclusivo sobre `status_since`                                                                                       |
| `until`          | `YYYY-MM-DD`                           | limite inclusivo sobre `status_since`                                                                                       |
| `rowScope`       | `active`, `inactive`, `deleted`, `all` | padrão `active`; `deleted` e `all` são somente admin                                                                        |
| `sortCol`        | 11 colunas                             | fora da whitelist cai para `id`                                                                                             |
| `sortDir`        | `asc` ou `desc`                        | qualquer outro valor vira `asc`                                                                                             |
| `page`           | inteiro                                | página mínima 1                                                                                                             |
| `pageSize`       | inteiro                                | padrão 25, máximo 1000 no servidor; a UI usa 25, 50 ou 100                                                                  |
| `ids`            | lista de ids                           | usado na seleção de exportação; limite de 200.000 ids na rota de ids                                                        |
| `includeDeleted` | booleano                               | alias legado de `rowScope = deleted`                                                                                        |

Semântica de `rowScope` (`lib/server/sql/where.ts`):

- `active`: `deleted_at is null and coalesce(is_active, true)`;
- `inactive`: `deleted_at is null and not coalesce(is_active, true)`;
- `deleted`: `deleted_at is not null`;
- `all`: sem filtro de visibilidade.

A rota `/api/barriers/deleted` é sempre deleted-only e ignora `typologyId`, `criticalOnly` e `rowScope` (`docs/API.md`). A rota `/api/barriers/ids` devolve no máximo 200.000 ids do escopo filtrado. Páginas fora do intervalo retornam vazio e fazem uma contagem extra para `totalPages` exato (`lib/server/sql/barriers.ts`).

A whitelist de ordenação tem 11 colunas: `id`, `tag`, `location`, `typology`, `criticality`, `category`, `owner`, `availability`, `compliance`, `contingency` e `statusSince` (`lib/server/sql/where.ts`, `lib/dashboard/filters.ts`). A conformidade ordena pelo resultado de `effective_availability_id` e a contingência ordena pelo TAG da contingência.

No cliente, `applySorting` ordena uma cópia; `id` é numérico e as demais colunas usam um único `Intl.Collator("pt-BR", { numeric: true })` sobre chaves minúsculas (`lib/dashboard/filters.ts`). O estado persistido é sanitizado: texto máximo 200, página máxima 100000, `pageSize` restrito a 25, 50 ou 100, `rowScope` restrito aos valores conhecidos, datas restritas a `YYYY-MM-DD` e `sortCol` restrito à whitelist. A versão de defaults é 3.

### 5.8 Regras de alerta, audiência e deduplicação

#### Detecção e watermark

O worker `alerts:poll` roda a cada `ALERTS_POLL_SECONDS` (padrão 900 segundos, mínimo 60, com jitter de mais ou menos 10 por cento) (`scripts/alerts-poll.ts`). A detecção parte do **watermark**, que é `max(transition_date)` de `alert_events`; sem eventos, lê todo o histórico (`lib/server/sql/alerts.ts`). A leitura de transições é paginada por cursor `(date, id)`, com limite de 20.000 por chamada, usando o índice `idx_history_date_id`.

A **verdade do landing** é o `statusId` da linha de histórico, não o estado atual da barreira. Isso evita que uma transição revertida pelo sync fique invisível: conformidade e urgência são derivadas do landing (`lib/server/alerts/detect.ts`). Barreiras excluídas, ausentes ou com `isActive === false` não alertam. O status de origem é reconstruído varrendo o histórico para trás.

#### Casamento de regras

Sem nenhuma regra configurada (`hasAnyRule = false`), vale o comportamento legado: todo landing não conforme alerta, sem imediatez (`lib/server/alerts/rules.ts`). Com regras, mesmo que todas inativas, só o que casar alerta; uma categoria sem regra ativa fica muda.

A primeira regra que casa vence, ordenada por prioridade decrescente e, em empate, pelo menor `id`. Ela define `immediate` e `ruleId`. Os campos de escopo e condição são:

- `category_ids`, com fallback legado para `category_id`;
- `from_status_ids`;
- `to_status_ids`, com fallback legado para `to_status_id`;
- `location_ids`, `criticality_ids`, `typology_ids`, `grouping_ids`, `owner_ids`;
- `criticality_ids` explícito vence `critical_only`; `critical_only` sem lista equivale a ESO e A;
- `urgency`: `any`, `urgent` ou `critical`; `critical` exige criticidade ESO ou A; `urgent` aceita urgent e critical, mas não `none`;
- `only_no_action_plan = true` exclui barreiras com plano de ação;
- `include_recovery = true` permite que landings conformes casem uma regra sem escopo explícito de landing;
- `on_transition = false` faz a regra não casar transições; ela serve apenas para lembrete de staleness.

Listas nulas ou vazias significam todas. Landing conforme, 0 a 3, só casa se houver escopo explícito de landing ou `include_recovery = true`; sem escopo explícito, landings calmos são ignorados.

#### Janelas e anti-ruído

- `valid_from` e `valid_to` são datas.
- `active_days` usa 0 para domingo em UTC.
- `quiet_start_hour` e `quiet_end_hour` são horas UTC de 0 a 23, com travessia de meia-noite (22 para 6) e `start = end` sem silêncio.
- `cooldown_minutes` aplica uma janela deslizante por barreira e regra.
- `max_per_day` conta eventos desde `T00:00:00Z` do dia.
- `last_triggered_at` é atualizado em best-effort quando a regra dispara.
- `priority` aceita inteiro de menos 1000 a 1000; nome até 200 caracteres e descrição até 2000 (`lib/server/sql/alert_rules.ts`, `lib/server/alerts/rules.ts`).

#### Staleness

`stale_days` positivo ativa o gatilho de tempo. A barreira precisa estar não conforme (`compliance_id = 1`), ativa, não excluída e com `status_since <= current_date - stale_days`. O casamento reaplica escopo, criticidade, urgência, `only_no_action_plan` e janelas, mas ignora `from` e landing (`lib/server/alerts/rules.ts`, `lib/server/alerts/run-provider.ts`).

`stale_repeat_days` controla a repetição: o lembrete só dispara quando `(daysSince - stale_days) % repeat === 0`; nulo vira 1, ou seja, lembrete diário a partir do limiar. A chave de deduplicação de stale é `stale:{ruleId}:{barrierId}:{date}` e o tipo é `stale`.

#### Deduplicação e dead-letter

A chave de deduplicação de transição é `barrierId:transitionDate:statusId[:historyId]`. O id do histórico distingue dois landings reais do mesmo status no mesmo dia (`lib/server/alerts/store.ts`, `lib/server/alerts/detect.ts`, `DECISIONS.md` D23). `dedup_key` é único; o enqueue é `insert ... on conflict (dedup_key) do nothing`, em lotes de 500 (`lib/server/sql/alerts.ts`).

`alert_events.sent_at` nulo significa pendente. `listUnsent` exclui `payload.dead_letter = true`. Em falha, `markFailed` incrementa `attempts`, grava `last_error` truncado em 2000 caracteres e liga `dead_letter` no limite. O ciclo usa `PROVIDER_MAX_SEND_RUNS = 5`. Erros 401 e 422, além de erro não retentável, estacionam imediatamente; rede e 5xx gastam o orçamento (`lib/server/alerts/run-provider.ts`, `lib/server/alerts/store.ts`). `--reprocess` limpa todos os dead letters (`attempts = 0`, `last_error = null`, `dead_letter = false`) e devolve a contagem.

#### Audiência derivada

Não existe endpoint HTTP de audiência (`docs/API.md`). `loadAlertAudience()` faz uma leitura set-based de usuários ativos com e-mail não vazio (`lib/server/sql/alert-audience.ts`):

- `admin` mapeia para `locationIds = null`, isto é, todas as estações;
- `user` mapeia para a união distinta de `access_group_locations.location_id` dos seus grupos;
- usuário sem grupo mapeia para array vazio, que não recebe nada;
- e-mail vazio ou conta inativa é excluído.

O filtro por evento é `recipientsForLocation`: e-mail vazio nunca recebe; `locationIds` nulo ou indefinido significa irrestrito; estação nula ou desconhecida só alcança irrestritos; caso contrário, a estação da barreira precisa estar no array (`lib/server/alerts/audience.ts`). Esse filtro é aplicado no ciclo agendado, no envio imediato e no fan-out de status.

A lista `alert_recipients` é legada. As telas e endpoints administrativos ainda a gerenciam, mas a entrega não a lê (`docs/API.md`, `lib/server/sql/recipients.ts`).

#### Mapeamento do provedor

|                        Status | `situacao`    | Canais                               | `despachar_agora` | Envia                                                              |
| ----------------------------: | ------------- | ------------------------------------ | ----------------- | ------------------------------------------------------------------ |
|                5 Indisponível | `violada`     | e-mail e WhatsApp se houver telefone | `true`            | sim                                                                |
|                   4 Degradado | `degradada`   | e-mail                               | `false`           | sim                                                                |
| 2 Indisponível Contingenciado | `degradada`   | e-mail                               | `false`           | sim                                                                |
|    3 Degradado Contingenciado | `degradada`   | e-mail                               | `false`           | sim                                                                |
|                  0 Disponível | `normalizada` | e-mail                               | `false`           | sim, se o chamador garantir que o estado anterior era não conforme |
|            1 Fora de Operação | `degradada`   | e-mail                               | `false`           | não, suprimido                                                     |
|                  desconhecido | `degradada`   | e-mail                               | `false`           | sim, fail-closed                                                   |

O WhatsApp só é anexado quando `withMessaging = true` (status 5) e há telefone; a lista de destinatários é limitada a 50 (`lib/server/alerts/provider.ts`).

**Envio imediato (comportamento real).** `maybeSendProviderImmediate` sempre enfileira o evento, mas só faz POST se o mapa tiver `send` e `despacharAgora`, o que só acontece para status 5, e se houver remetente e audiência. Status 4, 2, 3 e 0 alterados manualmente são enfileirados, mas não são postados na hora; aguardam o próximo ciclo (`lib/server/alerts/immediate.ts`). O campo `notify_immediate` da regra é persistido e colocado em `payload.immediate`, mas **não** altera o `despachar_agora` do provedor (`lib/server/alerts/provider.ts`, `lib/server/alerts/rules.ts`). A divergência com a leitura superficial de imediato versus digest está registrada na seção 9.

#### Limites de payload e retry

Um evento vira um POST para `/internal/api/monitor/alertas`, com header `X-MSGFLOW-TOKEN`. A resposta 200 ou 202 é aceita; o corpo é limitado a 1 MB; `postAlert` usa timeout padrão de 65 segundos e o ciclo impõe 15 segundos por POST (`lib/server/alerts/provider.ts`, `lib/server/alerts/run-provider.ts`). O `alerta_id` é estável por barreira, data, status e histórico, limitado a 120 caracteres; título 180, mensagem 1200, código 60, nome da barreira 160, local 160, tipo e criticidade 60. `ocorrido_em` é meio-dia no fuso menos três da data da transição. O link é `APP_BASE_URL/barriers/:id`, omitido se a URL for inválida.

A entrega é paginada em 200 eventos, com concorrência 4. Um evento sem audiência para a estação é aceito localmente com o aviso `sem destinatários para a estação` e não é retentado. Entrega parcial grava `provider_parcial = true`, `provider_correlation_id` e o recibo em `payload`; `sent_at` é marcado mesmo em parcial (`lib/server/alerts/run-provider.ts`, `lib/server/sql/alerts.ts`).

#### Avisos de conta

Os avisos de conta criada, reset ou convite reutilizam a configuração do provedor e `APP_BASE_URL`, mas não fazem parte da audiência de barreiras. O envio é deliberadamente não fatal: uma queda de mensageria não pode desfazer a criação de uma conta, e a senha continua visível na tela do administrador (`lib/server/alerts/account-notice.ts`, `DECISIONS.md` D30). O provedor deduplica por conta e tipo, então um segundo reset do mesmo tipo pode ser engolido como duplicata.

### 5.9 Autenticação e autorização

**Sessões.** São opacas, não JWT. `createSessionToken()` gera 32 bytes aleatórios em hexadecimal; apenas o SHA-256 é armazenado; o navegador guarda o token bruto no cookie `barrier_session`, `HttpOnly`, `SameSite=Lax`, `Secure` em HTTPS, com TTL de 12 horas (`lib/server/auth/session.ts`, `docs/ARCHITECTURE.md`). Logout, troca de senha, desativação, mudança de identidade e reset administrativo revogam sessões (`lib/server/sql/sessions.ts`, `lib/server/sql/users.ts`).

**Senhas locais.** Mínimo de 12 e máximo de 256 caracteres. O hash é PBKDF2-SHA256 com 210.000 iterações, salt de 16 bytes e 32 bytes de hash, no formato `pbkdf2$iterations$salt_b64$hash_b64` (`lib/server/auth/password.ts`). A troca self-service verifica a senha atual, exige que a nova seja diferente e revoga todas as sessões. O login falha com 401 genérico e usa um hash dummy para igualar o tempo entre conta inexistente, inativa e senha errada (`routes/api/auth/login.ts`).

**Gate de troca forçada.** Aplica-se somente a sessão local com `must_change_password = true`. Rotas guardadas respondem 403 `PASSWORD_CHANGE_REQUIRED`; `GET /` redireciona com 303 para `/trocar-senha`. As exceções são `POST /api/auth/password`, `POST /api/auth/logout`, `GET /api/auth/me`, autenticação por `ADMIN_TOKEN` e a própria página de troca (`lib/server/auth.ts`, `DECISIONS.md` D31). O flag é limpo na mesma transação que grava a nova senha.

**Entra ID.** O SSO é opcional, atrás de `AUTH_SSO_ENABLED=true`, e o login local continua disponível como break-glass. Não há provisionamento just-in-time: a conta precisa existir, estar ativa e ter `auth_source = 'entra'`; um endereço não provisionado recebe `no_access` mesmo com token válido (`routes/auth/entra/callback.ts`, `docs/ARCHITECTURE.md`). No primeiro login, o callback extrai endereços de `preferred_username`, `email` e `upn`, exige `@`, limita a 320 caracteres, normaliza para minúsculas e deduplica. Se exatamente um id distinto casar, faz o bind; zero ou mais de um nega (`lib/server/auth/entra/claims.ts`, `lib/server/sql/users.ts`). O bind usa `entra_oid is null and entra_tid is null and lower(email) = ... and active` como lock; se outro callback venceu, o login é negado. Depois do bind, logins seguem por `(entra_tid, entra_oid)`. A conta Entra é passwordless pelo check `users_auth_source_shape`, e conta local nunca é casada por e-mail no fluxo Entra (`DECISIONS.md` D29).

**Último administrador.** Rebaixar, desativar, excluir ou converter um administrador verifica a contagem de administradores ativos; se sobrar um ou menos, a operação é bloqueada. Há também proteção específica para o último administrador local ativo, para garantir o caminho break-glass. `lockActiveAdmins()` faz `select ... for update` nos administradores ativos para serializar a checagem (`lib/server/sql/users.ts`). As mesmas guardas valem nos batches.

**`ADMIN_TOKEN`.** É um Bearer de operação: aceito para leituras de dados e rotas administrativas, mas sem identidade de usuário. Por isso é isento do gate de troca de senha (`lib/server/auth.ts`, `docs/API.md`). Sem token configurado, a autenticação por token falha fechada.

**CSRF e throttles.** Escritas exigem mesma origem: `Origin` ou `Sec-Fetch-Site` cross-site explícito recebe 403; chamadas same-origin ou sem esses headers passam (`docs/API.md`). Os throttles são fixos por cliente e por processo: leitura 120 por minuto, escrita 30, senha 10, exportação 120, detalhe raw do Fracttal 5; `/api/health` e `/api/ready` não são throttled (`lib/server/throttle.ts`, `docs/API.md`). A identidade do cliente usa `remoteAddr` e só aceita `X-Real-IP` ou o primeiro salto de `X-Forwarded-For` de um proxy confiável.

**Respostas de negação.** Anônimo em rota de dados ou admin recebe 404 de camuflagem; credencial morta recebe 401; autenticado não administrador em rota admin recebe 403 (`lib/server/auth.ts`, `docs/API.md`). Toda falha usa `{ error, code, requestId }` com header `x-request-id`; sucesso também carrega o header. Erros 500 nunca incluem texto de banco.

### 5.10 Exportação

A exportação é sob demanda e usa a mesma semântica de filtros das leituras. Regras:

- a UI exporta somente as linhas selecionadas, e a seleção pode abranger outras páginas;
- a API aceita `GET` e `POST` com o mesmo contrato; filtros e `format` podem ir na query; a seleção `{ ids, timeZone }` vai no corpo para não estourar a URL;
- corpo ausente ou não JSON significa exportar todo o escopo filtrado;
- o limite é de 200.000 linhas por exportação e o streaming é feito em lotes de 5.000; acima do teto a resposta é 400 `BAD_REQUEST` com a contagem real;
- o mapeamento tem 30 colunas, compartilhadas por CSV, XLSX e PDF (`lib/export/columns.ts`);
- `rowScope = deleted` ou `all` exige admin;
- a resposta é anexo binário com `x-export-total`, `content-disposition: attachment` e `private, no-store`;
- não há armazenamento server-side da exportação, nem agendamento, nem envio automático;
- a exportação passa pelo mesmo escopo de estação das leituras e pelo throttle de exportação (`docs/API.md`, `lib/export/limits.ts`).

## 6. Nível 4: arquitetura e decisões técnicas

### 6.1 Stack e runtime

O projeto é Deno-only. Não existe `package.json`, `tsconfig.json`, ORM, segundo driver de banco, telemetria ou segundo framework de UI (`agents.md` seção 2). A configuração inteira vive em `deno.jsonc`: tarefas, import map, opções de TypeScript, lint e formatação. A versão da aplicação é 0.4.0 e o runtime exigido é Deno 2.9 ou superior.

| Preocupação        | Escolha                                 | Fonte                                    |
| ------------------ | --------------------------------------- | ---------------------------------------- |
| runtime            | Deno 2.9 ou superior                    | `docs/ARCHITECTURE.md`, `readme.md`      |
| framework          | Fresh 2.3.3                             | `deno.jsonc`                             |
| build              | Vite 7 com `@fresh/plugin-vite`         | `deno.jsonc`, `vite.config.ts`           |
| UI                 | Preact 10 com signals                   | `deno.jsonc`                             |
| banco              | PostgreSQL via `@db/postgres`           | `deno.jsonc`, `lib/server/db.ts`         |
| autenticação       | sessões locais e Entra ID OIDC com PKCE | `lib/server/auth/`, `routes/auth/entra/` |
| entrega de alertas | provedor HTTP MSGFLOW                   | `lib/server/alerts/provider.ts`          |
| testes             | `deno test` e linkedom                  | `deno.jsonc`, `scripts/test-dom.ts`      |

O boot do servidor é `main.ts`: importa `App` e `staticFiles` de Fresh, chama `loadServerConfig()` somente quando `isProductionEnv()`, registra `staticFiles()` e `fsRoutes()` (`main.ts`). O `client.ts` importa `./static/styles.css` apenas para o HMR do Vite. O build produz `_fresh/server.js` e `_fresh/client/`; o diretório é ignorado no git e não entra em commit (`docs/ARCHITECTURE.md`).

O TypeScript é estrito, com JSX em modo `precompile` e `jsxImportSource: "preact"`. O `deno fmt` usa largura de 80 colunas, indentação de 2 espaços, aspas duplas e `proseWrap: "preserve"` (`deno.jsonc`). O lint usa as tags `fresh` e `recommended`.

### 6.2 Camadas e fronteiras

| Camada                              | Responsabilidade                                                                                                                       | Regra de dependência                                     |
| ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| `routes/`                           | borda SSR e HTTP; páginas validam sessão antes de carregar dados; rotas de API são donas de validação, autenticação, escopo e envelope | pode importar `lib/` e `lib/server/`                     |
| `lib/`                              | lógica pura compartilhada e tipos                                                                                                      | sem Preact e sem `localStorage`                          |
| `islands/`                          | código hidratado no navegador; uma raiz principal, `Dashboard.tsx`                                                                     | nunca importa `lib/server/*`                             |
| `components/`, `hooks/`, `context/` | apresentação, estado de cliente, preferências, tema e saúde da conexão                                                                 | nunca importam `lib/server/*` e nunca consultam Postgres |
| `lib/server/`                       | PostgreSQL, SQL, autenticação, exportação, sync, alertas e logging                                                                     | exclusivo de servidor                                    |
| `lib/export/`                       | builders puros de CSV, XLSX e PDF                                                                                                      | sem dependência de servidor                              |
| `scripts/`                          | CLIs operacionais                                                                                                                      | executam contra `lib/server/` e banco                    |

Regras adicionais (`agents.md` seção 3, `docs/ARCHITECTURE.md`):

- um handler por arquivo em `routes/api/`, com parsing compartilhado em `routes/api/_params.ts`; arquivos com `_` não são rotas no Fresh;
- uma raiz hidratada mais seções focadas em `islands/`;
- um assunto por módulo em `lib/server/sql/`, `lib/server/fracttal/`, `lib/server/alerts/`, `lib/dashboard/` e `lib/export/`;
- um CLI por script em `scripts/`;
- o dashboard nunca faz `fetch` fora de `lib/api` (`lib/api.ts`, `agents.md` seção 5).

Donos únicos (`agents.md` seção 4):

| Assunto                 | Dono                                                      |
| ----------------------- | --------------------------------------------------------- |
| pool de conexões        | `lib/server/db.ts`                                        |
| filtragem e ordenação   | `lib/server/sql/where.ts`                                 |
| escrita de status       | `record_status_change()` via `lib/server/sql/barriers.ts` |
| derivação de domínio    | `lib/resolve.ts` e `lib/dashboard/*`                      |
| streaming de exportação | `lib/server/export*.ts`                                   |

### 6.3 Fluxos de dados

#### Leitura HTTP

1. O middleware raiz aplica cache de assets, compressão e cabeçalhos de segurança (`routes/_middleware.ts`).
2. A rota de API chama o guard de autenticação adequado: dados aceitam sessão ou `ADMIN_TOKEN`; escritas exigem admin (`lib/server/auth.ts`).
3. O handler valida parâmetros e corpo com os parsers de `routes/api/_params.ts`.
4. `resolveAllowedLocationIds()` resolve o escopo; `buildWhere()` monta o WHERE com parâmetros vinculados.
5. A consulta SQL retorna linhas; o mapper converte para o wire.
6. A resposta leva `x-request-id` e, na maioria dos GETs JSON, `etag`, `cache-control: private, no-cache` e `vary: Cookie`; `If-None-Match` pode resultar em 304 (`docs/API.md`).

#### Escrita de barreira

1. Guard de mesma origem, throttle de escrita e autenticação admin.
2. Corpo limitado e campos validados; `releaseFields` só aceita chaves conhecidas.
3. Uma transação abre (`withTx`) e bloqueia a linha.
4. Se houver `availabilityId` diferente do atual, `transitionBarrierStatus()` chama `record_status_change()`.
5. `updateBarrier()` grava metadados e atualiza `manual_fields` com as chaves que realmente mudaram.
6. Se o request não trouxe `availabilityId` e trouxe `hasContingency`, o overlay promove ou rebaixa o status com histórico.
7. O commit acontece; depois, o fan-out de alerta é disparado sem ser aguardado.

O ponto importante é que status, metadados e overlay não podem divergir: ou tudo commita, ou nada (`DECISIONS.md` D24).

#### Sincronização

1. O poller monta a passagem de trabalho antes do sweep de itens, para falhar fechado com zero escritas quando o upstream está instável (`scripts/fracttal-poll.ts`).
2. O planejador puro `planReconcile()` compara remoto e local por `external_code` e classifica cada linha em `insert`, `update`, `restore`, `delete` ou `skip` (`lib/server/fracttal/sync.ts`).
3. `loadLocal()` carrega as barreiras das estações resolvidas **ou** as que têm código presente upstream; o segundo braço é o que permite uma mudança de estação reconciliar como update em vez de soft delete mais insert com violação de unicidade.
4. A aplicação grava em chunks transacionais, chama `record_status_change()` quando o status muda e grava a auditoria por barreira (`lib/server/sql/sync-apply.ts`).
5. A run termina com estado `ok` ou `failed`, contadores e nota; a linha `sync_state` é a auditoria operacional.

#### Alerta

1. `alerts:poll` lê o watermark e busca transições paginadas.
2. `detectUrgentTransitions()` resolve o landing, a conformidade e a urgência, e aplica as regras.
3. A audiência é carregada em uma consulta set-based e filtrada por estação.
4. O evento é enfileirado com `dedup_key`; se já existe, nada acontece.
5. O ciclo lista não enviados, posta um a um com concorrência limitada e marca o recibo, o parcial ou o erro.
6. Eventos que excedem o orçamento ficam em dead-letter até `--reprocess`.

#### Exportação

1. A rota resolve filtros, escopo e seleção.
2. Conta as linhas do escopo e recusa acima de 200.000 com a contagem real.
3. Faz streaming em lotes de 5.000, convertendo para CSV, XLSX ou PDF.
4. Responde como anexo, com `x-export-total`, sem guardar o arquivo no servidor.

### 6.4 Modelo de banco e triggers

A migração é aplicada por `scripts/migrate.ts` na ordem `db/schema.sql`, `db/cleanup-unused-auth.sql` e `db/seed_lookups.sql`. Cada arquivo roda em transação própria e é reaplicado em toda execução; a tabela `schema_migrations` registra o nome aplicado e serve de auditoria, não de controle de versão (`docs/DATABASE.md`). Não há arquivos de migração versionados nem skip por arquivo.

O schema tem 25 tabelas de domínio (`db/schema.sql`), agrupadas em:

| Grupo                 | Tabelas                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| lookups               | `locations`, `availability_statuses`, `criticality_levels`, `categories`, `groupings`, `typologies`, `owners`, `loc_descs`, `authors` |
| barreiras e histórico | `barriers`, `barrier_contingencies`, `barrier_status_history`                                                                         |
| auditoria de sync     | `sync_state`, `sync_barrier_changes`                                                                                                  |
| alertas               | `alert_rules`, `alert_events`, `alert_recipients`                                                                                     |
| autenticação e acesso | `users`, `sessions`, `auth_flows`, `access_groups`, `access_group_locations`, `user_access_groups`                                    |
| operação              | `throttle_buckets`, `field_option_sets`                                                                                               |

Invariantes estruturais:

- `barriers.external_code` é único e não nulo; é a chave de reconciliação do sync.
- `barriers.deleted_at` marca exclusão lógica; `is_active` espelha o flag de habilitação upstream. Nenhum dos dois remove a linha.
- `barriers.compliance_id` é derivado por trigger; não é foreign key.
- `barrier_contingencies` tem chave primária composta e check que rejeita auto-vínculo.
- `barriers.manual_fields` é `text[] not null default '{}'`.
- `barrier_status_history` guarda `sync_run_id` com `on delete set null`, `source_author` e `participants jsonb not null default '[]'`.
- `sync_state` tem índice único parcial que permite apenas uma linha `running` por escopo.
- `sync_barrier_changes` tem unique `(run_id, barrier_id)` e guarda `kind`, disponibilidades antiga e nova, `changed_fields` e snapshots.
- `alert_events.dedup_key` é único; `sent_at` nulo significa pendente; `provider_correlation_id` e `provider_parcial` guardam o recibo.
- `users.email` é único e sempre minúsculo; o check `users_auth_source_shape` garante conta local com hash e sem par Entra, e conta Entra sem hash com o par tenant/objeto tudo ou nada.
- `sessions.token_hash` é único; `auth_flows.state_hash` é chave primária e expira.
- Não há views, enums nativos nem Row-Level Security (`docs/DATABASE.md`).

Funções e triggers (`db/schema.sql`, `docs/DATABASE.md`):

| Função                                                | Tipo              | Comportamento                                                                                                                                  |
| ----------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `is_contingency_flag(text)`                           | SQL imutável      | dobra acentos e espaços e testa `sim`                                                                                                          |
| `effective_availability_id(base_id, has_contingency)` | SQL imutável      | 4 e 5 com flag viram 3 e 2; o resto passa                                                                                                      |
| `barriers_set_compliance()`                           | função de trigger | grava `compliance_id` 0 para efetivo 0 a 3 e 1 caso contrário                                                                                  |
| `set_updated_at()`                                    | função de trigger | grava `updated_at = now()` antes de update                                                                                                     |
| `record_status_change(...)`                           | PL/pgSQL          | escrita sancionada de status: seta o GUC, atualiza `availability_id` e `status_since`, insere histórico; valida `participants` como array JSON |
| `guard_availability_write()`                          | função de trigger | rejeita update direto de `availability_id` sem `app.status_write = 'on'`                                                                       |

| Trigger                        | Tabela e momento                                                               |
| ------------------------------ | ------------------------------------------------------------------------------ |
| `trg_barriers_set_compliance`  | `barriers`, antes de insert ou update de `availability_id` e `has_contingency` |
| `trg_guard_availability_write` | `barriers`, antes de update de `availability_id`                               |
| `trg_barriers_updated_at`      | `barriers`, antes de update                                                    |
| `trg_users_updated_at`         | `users`, antes de update                                                       |
| `trg_access_groups_updated_at` | `access_groups`, antes de update                                               |
| `trg_alert_rules_updated_at`   | `alert_rules`, antes de update                                                 |

`record_status_change()` é a única via sancionada de escrita de status. Ela não verifica se o status novo é igual ao atual; a função sempre atualiza e insere. O no-op de mesmo status está na camada de aplicação: `transitionBarrierStatus()` bloqueia a linha, compara o status e retorna sem chamar a função, e a rota de status tem um early return adicional antes do fan-out (`lib/server/sql/barriers.ts`, `routes/api/barriers/[id]/status.ts`). A documentação que atribui o no-op à função SQL está desatualizada; a seção 9 registra a divergência.

A ordem do schema é protegida por `scripts/check-migration-order.ts`, que roda dentro de `deno task check` e falha quando um índice aparece antes da coluna que referencia ou quando um `ALTER TABLE` ou `REFERENCES` usa uma tabela criada depois. A justificativa é que `create table if not exists` é no-op em banco existente: um índice antes do `ADD COLUMN` passa em banco novo e quebra em banco real (`scripts/check-migration-order.ts`, `docs/DATABASE.md`).

### 6.5 Contratos HTTP

Toda falha usa o envelope `{ error, code, requestId }` com `x-request-id`. Os códigos são (`docs/API.md`):

| Status | Código                     | Significado                                                             |
| -----: | -------------------------- | ----------------------------------------------------------------------- |
|    400 | `BAD_REQUEST`              | JSON, parâmetro, id ou valor inválido                                   |
|    401 | `UNAUTHORIZED`             | credencial morta ou ausente quando não há camuflagem                    |
|    403 | `FORBIDDEN`                | autenticado sem permissão, admin-only ou cross-site                     |
|    403 | `PASSWORD_CHANGE_REQUIRED` | sessão local válida com senha temporária                                |
|    404 | `NOT_FOUND`                | linha ausente ou camuflagem anônima                                     |
|    429 | `RATE_LIMITED`             | orçamento de janela fixa esgotado; acompanha `retry-after`              |
|    500 | `INTERNAL`                 | falha inesperada; nunca inclui texto de banco                           |
|    503 | `UNAVAILABLE`              | configuração, auth store ou banco indisponível; acompanha `retry-after` |

Os níveis de autenticação são:

| Nível          | Credenciais aceitas                                 | Usado por                                                                    |
| -------------- | --------------------------------------------------- | ---------------------------------------------------------------------------- |
| público        | nenhuma                                             | `/login`, `/trocar-senha`, `/api/health`, `/api/ready`, `/auth/entra/*`      |
| somente sessão | cookie `barrier_session`; `ADMIN_TOKEN` é rejeitado | `/api/auth/me`, `/api/auth/password`, `/api/auth/profile`                    |
| dados          | `ADMIN_TOKEN` ou qualquer sessão ativa              | leituras do painel e `/api/export`                                           |
| admin          | `ADMIN_TOKEN` ou sessão de administrador            | escritas, gestão de usuários, grupos, regras e destinatários, `/api/lookups` |

Política de requisição:

- escritas exigem mesma origem, com `Origin` ou `Sec-Fetch-Site` cross-site explícito recebendo 403;
- throttles em memória por processo e por cliente: leitura 120 por minuto, escrita 30, senha 10, exportação 120, raw do Fracttal 5;
- `GET`s JSON carregam ETag forte, `cache-control: private, no-cache` e `vary: Cookie`; exceções são health, ready, access group por id, raw do Fracttal e exportação binária;
- corpo JSON padrão limitado a 256 KiB, com limites específicos menores ou maiores por rota (`docs/API.md`).

Os padrões de contrato são:

- listas paginadas respondem `{ items, total, page, pageSize, totalPages }`;
- a rota de ids responde `{ ids, total }`;
- batches respondem `{ affected }` e são atômicos;
- a exportação responde binário com `x-export-total`;
- o detalhe de barreira inclui histórico e `manualFields`;
- o detalhe de sync inclui snapshots antes e depois;
- os vocabulários respondem rótulos e contagens, não ids crus, exceto `/api/lookups`, que é admin e devolve ids.

A tabela completa de endpoints está no nível 5.

### 6.6 Segurança em profundidade

A segurança não depende de uma única barreira. As camadas são:

1. **Perímetro**: em produção, a aplicação publica apenas `127.0.0.1:8300` e o PostgreSQL apenas `127.0.0.1:5432`; o acesso externo passa por proxy TLS com firewall que nega inbound por padrão (`compose.yml`, `docs/PORT-MAP.md`, `docs/DEPLOY-WINDOWS.md`).
2. **Cabeçalhos**: a aplicação aplica `x-content-type-options: nosniff`, `x-frame-options: DENY`, `referrer-policy: no-referrer`, `permissions-policy` restritiva, CSP estrita fora de desenvolvimento e HSTS quando a requisição ou `APP_BASE_URL` é HTTPS (`routes/_middleware.ts`).
3. **CSRF**: escrita com origem cruzada explícita é recusada; chamadas sem os headers passam, o que preserva scripts operacionais (`docs/API.md`).
4. **Autenticação**: sessão opaca com hash no banco, cookie `HttpOnly` e `SameSite=Lax`, TTL de 12 horas, revogação em logout e troca de senha (`docs/ARCHITECTURE.md`).
5. **Gate de senha**: sessão local com senha temporária fica autenticada, mas contida, com 403 nas rotas guardadas e 303 na página inicial (`DECISIONS.md` D31).
6. **Autorização**: papel e escopo verificados no servidor em toda leitura, escrita, exportação, busca e agregado; `rowScope` deleted e all é admin-only (`agents.md` seção 6).
7. **Escopo SQL**: array vazio vira `and false`; array não vazio vira `= any(...)`; o cliente nunca amplia (`lib/server/sql/where.ts`).
8. **SQL**: todos os valores são parâmetros vinculados; o único identificador interpolado vem da whitelist `SORTABLE`; curingas de `LIKE` são escapados (`lib/server/sql/where.ts`).
9. **Entrada**: parsers estritos, ids validados com `Number.isSafeInteger`, corpos limitados por rota, listas com limites máximos (`routes/api/_params.ts`, `routes/api/*/batch.ts`).
10. **Negação**: 404 de camuflagem para anônimo, 401 para credencial morta, 403 para autenticado sem permissão; nada revela a existência de rota protegida (`lib/server/auth.ts`).
11. **Throttles**: janelas fixas por cliente; a exportação tenta primeiro o bucket compartilhado do banco; o mapa em memória tem evicção LRU acima de 5000 chaves (`lib/server/throttle.ts`, `lib/server/sql/throttle.ts`).
12. **Segredos**: ficam no ambiente ou em arquivos montados somente leitura; a imagem não carrega segredos; `.env` é local, não versionado e nunca é aberto, impresso ou resumido (`agents.md` seção 6).
13. **Logs**: nunca registram tokens, hashes, senhas, cookies, connection strings ou dados pessoais desnecessários; ações administrativas relevantes e execuções de sync e alerta deixam registro auditável (`agents.md` seção 6).
14. **Privacidade**: escopo Brasil e LGPD; nunca usar dados pessoais de produção em desenvolvimento ou teste; fixtures são sintéticas; exportações são downloads e não ficam no servidor (`agents.md` seção 6).

O provider de alerta exige HTTPS, exceto loopback em desenvolvimento (`lib/server/alerts/provider.ts`). A URL base do Fracttal tem allow-list de host (`lib/server/config.ts`). O painel raw do Fracttal é admin-only, desligado por padrão e responde 404 quando `DEV` não é exatamente `true` (`routes/api/barriers/[id]/fracttal-raw.ts`).

Há um advisory aceito e documentado: `xlsx@0.18.5`, usado apenas por `scripts/geral-coverage.ts` para ler uma planilha local confiável, fora do runtime e do caminho de exportação, que usa o builder in-house (`docs/ARCHITECTURE.md`).

### 6.7 Sincronização com o Fracttal

#### Cliente e autenticação

O Fracttal é somente leitura. O cliente só emite GET nos endpoints de dados; a única chamada não GET é o POST de token OAuth (`lib/server/fracttal/client.ts`, `docs/FRACTTAL.md`). A URL base tem allow-list de host `app.fracttal.com`, com padrão `https://app.fracttal.com/api`; uma URL fora da lista falha fechado antes do primeiro request (`lib/server/config.ts`). As credenciais vêm de `FRACTTAL_KEY` e `FRACTTAL_SECRET`, nunca de argv e nunca commitadas.

O token é obtido em `https://one.fracttal.com/oauth/token`, com `Authorization: Basic base64(key:secret)` e corpo `application/x-www-form-urlencoded`. O cache é single-flight: o TTL vem de `expires_in`, com margem de segurança de 30 segundos, e expirações curtas ou zero são limitadas a 60 segundos para evitar stampede de refresh (`lib/server/fracttal/token.ts`). Quando há refresh token, o grant `refresh_token` é usado; se ele morrer, o cache descarta o token quebrado e refaz `client_credentials` uma vez. Um 401 nos dados provoca **um único** refresh; um segundo 401 lança `[fracttal] token rejected after refresh` (`lib/server/fracttal/client.ts`).

#### Paginação, timeout e retries

Constantes do cliente (`lib/server/fracttal/client.ts`):

| Constante              |  Valor | Efeito                                               |
| ---------------------- | -----: | ---------------------------------------------------- |
| `MAX_PAGE_SIZE`        |    100 | nenhuma página pode pedir mais que 100 linhas        |
| `DEFAULT_TIMEOUT_MS`   | 15.000 | timeout por requisição                               |
| `DEFAULT_MAX_RETRIES`  |      3 | tentativas adicionais                                |
| `DEFAULT_RATE_WAIT_MS` | 60.000 | espera padrão quando o reset de rate não é conhecido |

O fluxo de `getJson` é: obtém token, executa com `AbortController` e timeout; erro de rede entra em backoff exponencial de `100 * 2^attempt` milissegundos; 401 faz refresh e nova tentativa; 406 e 429 esperam o `ratelimit-reset` em segundos; 5xx entram em backoff exponencial; os demais `!ok` viram `[fracttal] HTTP <status>`. Retries consomem token, porque são requisições de verdade (`lib/server/fracttal/adaptive-rate.ts`).

O parsing é estrito: envelope não objeto ou `data` não objeto falha alto; `parseAsset` exige `code` string e `id` número e rejeita `id_type_item` desconhecido; `parsePage` **lista** as linhas rejeitadas com índice e motivo, em vez de silenciar (`lib/server/fracttal/client.ts`). `fetchRawItem` resolve ausência como `row: null`, sem throw: ausência é dado, não indisponibilidade.

#### Token bucket adaptativo

O ritmo é controlado por um bucket adaptativo com AIMD (`lib/server/fracttal/adaptive-rate.ts`):

| Parâmetro                   | Padrão | Limite                                   |
| --------------------------- | -----: | ---------------------------------------- |
| `FRACTTAL_RATE_PER_MIN`     |    180 | teto efetivo de 200 por minuto           |
| `FRACTTAL_RATE_MAX_PER_MIN` |    190 | clamp em 200                             |
| `FRACTTAL_RATE_MIN_PER_MIN` |     80 | mínimo configurável                      |
| `FRACTTAL_RATE_BURST`       |     10 | clamp em 50                              |
| `RATE_LOW_WATER`            |     15 | abaixo disso, o gasto local é limitado   |
| `RATE_HOLD`                 |      5 | abaixo disso, hold com piso de 5 minutos |
| `RATE_INCREASE_EVERY`       |     25 | sucessos entre aumentos                  |

O aumento é aditivo, com passo proporcional de `max(1, floor((max - rate) / 10))`. A diminuição é multiplicativa, só em 406 e 429 (`rate * 0.7`, drenando o burst) e em 5xx (`rate * 0.9`). `ratelimit-remaining` baixo nunca reduz a taxa sustentada: ele limita o gasto local ao que resta. Os cabeçalhos são aceitos nas duas grafias conhecidas (`ratelimit-reset` e `Request-Call-Limit-Reset`, `ratelimit-remaining` e `Request-Call-Limit-Remaining`), e reset desconhecido assume 60 segundos.

O teto upstream documentado é de aproximadamente 200 requisições por minuto por IP; a fábrica clampa o máximo em 200 e o burst em 50 (`docs/FRACTTAL.md`, `lib/server/fracttal/adaptive-rate.ts`). O bucket é compartilhado pelos fetchers paralelos, então a concorrência nunca excede o teto.

#### Endpoints e campos

| Método | Caminho                                | Finalidade                                 |
| ------ | -------------------------------------- | ------------------------------------------ |
| GET    | `/api/items`                           | lista de ativos e feed de barreiras        |
| GET    | `/api/items/{code}`                    | um ativo por código                        |
| GET    | `/api/work_orders`                     | ordens de serviço usadas para status       |
| GET    | `/api/work_requests`                   | solicitações de serviço usadas para status |
| POST   | `https://one.fracttal.com/oauth/token` | OAuth2 client credentials                  |

Do ativo, o sync captura identidade e flags (`id`, `code`, `active`, `available`, `id_type_item`, `description`, `location_code`, `id_parent`), taxonomia e hierarquia (`items_types_description`, `groups_description`, `groups_1_description`, `groups_2_description`, `priorities_description`, `parent_description`, `units_description`, `is_serial_control`), plano de manutenção (`id_group_task`, `groups_tasks_description`), datas de fora de operação (`initial_date_out_of_service`, `last_final_date_available`) e texto livre (`field_1` a `field_6` e `notes`) (`docs/FRACTTAL.md`, `lib/server/fracttal/client.ts`). Campos customizados adicionais, datas de comissionamento, horas de operação, centro de custo, geolocalização e inventário contábil **não** são capturados.

`groups_1_description` é polo ou área, nunca a categoria; a categoria é `groups_description`. A criticidade é derivada do sufixo do TAG mais o flag ESO, porque `priorities_description` é praticamente nulo upstream.

Das ordens de serviço, são capturados código de join, aberto e concluído, status, classificação corretiva ou preventiva, flag de parada e durações, texto e notas, contexto de falha, prioridade, gatilho, status e rótulos de contingência, candidatos de data, pessoas e joins de requisição e item (`lib/server/fracttal/work.ts`). Das requisições, são capturados `code_item`, status, `is_urgent`, prioridade, rótulos de tipo, texto, candidatos de data, detalhe de transição de status, pessoas e joins de item e ordem.

Os tipos de item são `Locations=1`, `Equipment=2`, `Tools=3`, `SpareParts=4` e `Digital=5`; `toItemType` rejeita valor desconhecido em vez de coagir (`lib/server/fracttal/itemType.ts`).

#### Hierarquia, estações e aliases

O `parent_description` é separado por barra; segmentos vazios são descartados. A hierarquia é L1 operador ou polo, L2 área, L3 estação, L4 sistema e L5 ou mais ativo (`docs/FRACTTAL.md`, `lib/server/fracttal/barrier-rules.ts`).

A ordem de resolução da estação é:

1. alias de segmento abaixo do L3;
2. unidade de teste móvel;
3. override de segmento L2 ou L3;
4. token final `- CODE` do segmento;
5. o próprio segmento em maiúsculas.

Aliases e overrides documentados:

| Padrão                                                       | Resultado                                           | Observação                                      |
| ------------------------------------------------------------ | --------------------------------------------------- | ----------------------------------------------- |
| segmento dobrado `estacao coletora sao mateus - sm-8`        | `SM8`, nome `São Mateus 8`, tipo `Estação Coletora` | D27                                             |
| regex ancorada `^3-co-[0-9]+-es$`                            | `CO`, nome nulo, tipo `Campo`                       | D27; a UI cai para o código                     |
| segmento L2 `Base Seacrest - São Mateus-ES`                  | `SM`                                                | `-ES` é sufixo de estado, não código de estação |
| segmento L3 `cj unidade de teste movel` com L2 `Area Centro` | `CJ-UTM-C`, tipo `Unidade Móvel`                    | D28                                             |
| o mesmo segmento com L2 `Area Norte`                         | `CJ-UTM-N`, tipo `Unidade Móvel`                    | D28                                             |

O parser de alias varre os segmentos a partir do L3 (`slice(2)`), então o alias vence em qualquer profundidade. Um segmento transformador como `CO-03` não casa com o padrão do poço e permanece sob sua estação L3. `location_code` é apenas fallback quando nenhum pai resolve; valores live são tags de grupo ou ativo, nunca códigos de estação (`lib/server/fracttal/map.ts`).

O schema renomeia a linha antiga `CJ UNIDADE DE TESTE MÓVEL` para `CJ-UTM-N` no lugar, de forma guardada e idempotente, para preservar ids de barreiras e grupos, e adiciona `CJ-UTM-C` no próximo sync. `deno task db:migrate` precisa rodar antes do próximo sync (`db/schema.sql`, `DECISIONS.md` D28). O catálogo é auditável por `scripts/fracttal-audit-stations.ts`, que compara estações vivas com o catálogo e sai 1 em `empty-live` ou `unknown-station`.

#### Escopo, taxonomia e criticidade

Os gates de admissão são dois (`lib/server/fracttal/barrier-rules.ts`):

- match dobrado e sem acento de `BARRIER_KEYWORDS` contra o rótulo de taxonomia `groups_description`;
- `groups_2_description` igual a `eso`.

As keywords são `valvula`, `extintor`, `detec`, `alarme`, `sirene`, `incendio`, `bloqueio`, `intertravamento`, `seguran`, `emerg`, `psv`, `alivio`, `hidrante`, `gas`, `fumaca`, `h2s` e `corta-chamas`. O escopo é **totalmente aberto**: toda linha de equipamento com código entra no monitor quando estação e categoria resolvem; os gates são gravados em `scope_source` como `keyword`, `eso`, `keyword+eso` ou `all`, para reversibilidade futura (`lib/server/fracttal/map.ts`, `docs/FRACTTAL.md`). O texto livre `description` nunca é casado, porque puxaria ativos que apenas contêm a palavra.

A categoria vem de `groups_description` trimado ou do fallback `(sem categoria)`. A tipologia segue a precedência de keywords na cadeia: `subest`, `se-[0-9]` ou `69 kv` para subestação; `vapor`, `ugv` ou `caldeira` para estação de vapor; `estac` ou `coletor` para estação coletora; `poco`, `pocos` ou `rtsgi` para poço; `duto` ou `transfer` para duto; `compres`, `medic`, `medid`, `plant` ou `process` para estação coletora; caso contrário, campo (`lib/server/fracttal/barrier-rules.ts`). A criticidade usa `groups_2_description = eso` para ESO, senão a letra do sufixo do TAG, senão `priorities_description`, senão `D` com warning. Rank desconhecido no catálogo gera skip alto e barulhento; criticidade não parseável vira D com warning, nunca silêncio.

#### Reconciliação e idempotência

`planReconcile(remote, local)` é puro e classifica cada linha em `insert`, `update`, `restore`, `delete` ou `skip` (`lib/server/fracttal/sync.ts`). A reconciliação é por `external_code`. Uma linha local já deletada que reaparece upstream vira `restore`, nunca duplicata. Linhas locais ausentes upstream recebem soft delete, mas apenas dentro do escopo resolvido. Um código visto upstream que pula o mapeamento ou chega malformado (linha skip) também é protegido contra soft delete: a barreira existente não é ocultada, apenas o skip é registrado. Os códigos são comparados já normalizados (trim), de modo que um código upstream com espaços não escapa à proteção.

A assinatura de mudança tem 27 chaves e a ordem faz parte do contrato com a assinatura armazenada (`lib/server/fracttal/sync.ts`). Mesma assinatura mais mesmo status resulta em `skip`; `hasContingency` normaliza nulo para `Não`, e `contingencyDesc` normaliza nulo para string vazia. `diffSignatureFields` nomeia as colunas que mudaram e acrescenta `availabilityId` quando o status virou; `snapshotOf` grava um JSON simétrico com apenas as chaves de assinatura e o status.

A guarda de mass-delete é `assertCompletePage(rows, total, scope)`: uma página truncada, por outage ou cap atingido, aborta a run **antes de qualquer escrita**. `total === null` passa, porque o contrato do endpoint, não a guarda, é dono desse caso (`lib/server/fracttal/sync.ts`). O dry-run é o padrão; em dry-run não se abre linha de auditoria, não se chama `ensureCatalog` e não se escreve nada.

A aplicação é feita em chunks transacionais `SYNC_APPLY_CHUNK`, para que um crash deixe blocos inteiros aplicados ou não (`lib/server/sql/sync-apply.ts`). A nota de auditoria segue o formato `parsed=... malformed=... mapSkips=... warnings=... plan i:... u:... d:... s:...` com até cinco motivos de skip, truncada em 500 caracteres (`lib/server/fracttal/sync.ts`).

#### Lock de sobreposição e auditoria

O lock é o índice único parcial `uniq_sync_state_running_scope on sync_state(scope) where status='running'` (`db/schema.sql`). Antes de criar a linha, `startRun` executa `reapStaleRuns(scope)` em best-effort; o claim é atômico com `insert ... where not exists (fresh running) on conflict ... do nothing returning id`; sem linha, a execução levanta `ScopeBusyError` (`lib/server/sql/sync.ts`).

`finished_at` é o heartbeat, reescrito por `touchSyncRun`, nunca `started_at`; assim um sweep lento vivo não expira o próprio lock. As janelas são distintas: `syncScopeRunning(scope)` usa 10 minutos para considerar a lease fresca, e o reaper usa `SYNC_STALE_MINUTES = 15` para considerar a linha órfã (`lib/server/sql/sync-status.ts`, `lib/server/sql/sync.ts`). O heartbeat do run é enviado a cada 60 segundos, com mínimo de 10 segundos, e é best-effort (`lib/server/fracttal/sync.ts`).

Contenção de lock é **skip**, nunca falha; o poller marca o ciclo como `skipped` (`lib/server/fracttal/runner.ts`, `lib/server/fracttal/cycle.ts`). O `fracttal:force-sync` trata sobreposição como exit 3, a menos que `--force` seja passado; `--force` só sobrepõe lock vivo, porque o `startRun` ainda reapa órfãos mortos (`scripts/fracttal-force-sync.ts`).

A auditoria operacional vive em `sync_state` (`scope`, `status`, `cursor`, `inserts`, `updates`, `skips`, `deletes`, `note`, `started_at`, `finished_at`) e `sync_barrier_changes` (`kind`, disponibilidades antiga e nova, `changed_fields`, `old_snapshot`, `new_snapshot`), com unique `(run_id, barrier_id)` (`db/schema.sql`). Não existe notificador por e-mail para falha de sync; falhas são linhas estruturadas de console e registros no banco (`lib/server/fracttal/notify.ts`, `docs/FRACTTAL.md`).

#### Import, sync, force-sync e poll

| Comando               | O que faz                                                                                       | Padrões e guardas                                                                                                                                                                                             |
| --------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `fracttal:import`     | reconstrói o banco a partir de um dump local, em passes A, B e C, com streaming objeto a objeto | dry-run por padrão; `--apply` trunca histórico, barreiras, sync e eventos, depois recria estações e categorias com ids determinísticos; passa `available: true` porque a semântica do dump não foi verificada |
| `fracttal:sync`       | replay de fixture por padrão; `--live` faz sweep real                                           | `--pages` padrão 200, máximo 400; `--work-pages` padrão 5, máximo 40; escrita só com `--apply`; fixture precisa ser filho direto de `scripts/fixtures/*.json`                                                 |
| `fracttal:force-sync` | sweep live completo de recuperação                                                              | `--pages` padrão 400, máximo 400; dry-run por padrão; sobreposição gera exit 3, salvo `--force`; credenciais ausentes geram exit 2                                                                            |
| `fracttal:poll`       | loop live com passagem de trabalho compartilhada e sweep completo de equipment                  | `FRACTTAL_POLL_SECONDS` com piso 60; `FRACTTAL_SYNC_MAX_PAGES` com padrão 250; lock por escopo; no Windows os pollers registram SIGINT e SIGBREAK, nos demais SIGINT e SIGTERM, e aguardam o sweep em voo     |

A variável `FRACTTAL_SYNC_MAX_PAGES` tem três valores em jogo: `.env.example` comenta 200, o poller usa 250 e o script `fracttal:sync` usa 200 no `--pages`. O `fracttal:force-sync` usa 400. A divergência é de defaults, não de contrato de ambiente, e está registrada na seção 9.

### 6.8 Pipeline de alertas

O pipeline tem quatro etapas (`docs/ARCHITECTURE.md`):

1. **Detectar**: o worker agendado lê transições desde o watermark e aplica as regras ativas. Uma mudança manual de status também faz fan-out depois do commit.
2. **Derivar a audiência**: `loadAlertAudience()` seleciona usuários ativos com e-mail não vazio em uma consulta set-based.
3. **Filtrar por estação**: `recipientsForLocation()` descarta e-mails vazios, mantém irrestritos para todas as estações e restritos apenas quando a estação da barreira está no array. Estação nula ou desconhecida alcança apenas irrestritos.
4. **Enviar**: cada evento vira um POST no provedor, com landing `violada`, `degradada`, `normalizada` ou parada planejada suprimida.

Componentes:

| Componente                   | Papel                                                                                        | Fonte                                |
| ---------------------------- | -------------------------------------------------------------------------------------------- | ------------------------------------ |
| `alerts:poll`                | loop de detecção e entrega                                                                   | `scripts/alerts-poll.ts`             |
| `alerts:check`               | execução única, dry-run por padrão, com `--apply` e `--reprocess`                            | `scripts/alerts-check.ts`            |
| `alerts:provider-check`      | preflight de ambiente, ping, tabelas, audiência e regras; `--send-test` envia um alerta real | `scripts/alerts-provider-check.ts`   |
| `runProviderCycle`           | orquestra detecção, enqueue, envio, retry e recibo                                           | `lib/server/alerts/run-provider.ts`  |
| `maybeSendProviderImmediate` | enfileira e tenta o envio imediato somente para status 5                                     | `lib/server/alerts/immediate.ts`     |
| `fanoutStatusChange`         | fan-out best-effort e não aguardado pela rota                                                | `lib/server/alerts/status-fanout.ts` |
| `detectUrgentTransitions`    | resolve landing, conformidade, origem e regras                                               | `lib/server/alerts/detect.ts`        |
| `extractDetail`              | enriquece o payload com tipologia, agrupamento, dono, autor, nota, plano, diff e histórico   | `lib/server/alerts/enrich.ts`        |

O worker `alerts:poll` roda a cada `ALERTS_POLL_SECONDS` (padrão 900, mínimo 60) com jitter de mais ou menos 10 por cento. Sem token de provedor, o loop roda em dry-run: detecta e reporta, mas não enfileira nem posta (`scripts/alerts-poll.ts`). O mesmo vale para `alerts:check`, que só escreve e envia com `--apply`.

O provedor é configurado por `ALERT_PROVIDER_BASE_URL`, `ALERT_PROVIDER_TOKEN` e `ALERT_PROVIDER_COMPANY_ID` (padrão 1). A URL exige HTTPS, exceto loopback em desenvolvimento (`lib/server/alerts/provider.ts`). Os endpoints são `POST {base}/internal/api/monitor/alertas` para envio, `GET {base}/internal/api/monitor/ping` para saúde e `POST {base}/internal/api/monitor/conta` para avisos de conta. O header de autenticação é `X-MSGFLOW-TOKEN`.

O corpo de resposta é limitado a 1 MB, com pré-check de `Content-Length` e pós-check de tamanho. `ProviderFailure` carrega `status`, `code` e `retryable`; `retryable` é verdadeiro para status 0 (rede ou timeout) e para 5xx. Os status 401 e 422 não são retentáveis: 422 é conteúdo, e 401 significa token trocado, que exige humano e não loop (`lib/server/alerts/provider.ts`, `lib/server/alerts/run-provider.ts`).

Entrega parcial grava `provider_parcial`, `provider_correlation_id` e o recibo no payload; `sent_at` é marcado mesmo em parcial. Um evento sem audiência para a estação é aceito localmente com o aviso `sem destinatários para a estação`, para nunca reprocessar para sempre (`lib/server/sql/alerts.ts`, `lib/server/alerts/run-provider.ts`).

Os avisos de conta usam o mesmo provedor, mas não a audiência de barreiras. O corpo é montado com um destino por canal; telefone só entra no canal WhatsApp com pelo menos 10 dígitos; `conta_id` é string por paridade com o provedor; `validade_horas` não é enviado de propósito, porque essas senhas não expiram; o convite leva `ocorrido_em` como marca de idempotência, e a senha só é enviada nos templates de criação e reset (`lib/server/alerts/account-notice.ts`, `DECISIONS.md` D30). O segredo é verificado contra o corpo de erro antes de truncar, para não devolver prefixo da senha.

### 6.9 Configuração

A configuração é lida no boot e falha rápido. Os grupos de variáveis são (`lib/server/config.ts`, `.env.example`):

| Grupo    | Variáveis principais                                                                                                                           | Observação                                            |
| -------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| marca    | `COMPANY_NAME`                                                                                                                                 | vazio significa sem marca; lida por requisição        |
| API      | `PUBLIC_API_MODE`, `PUBLIC_API_BASE_URL`                                                                                                       | modo `mock` ou `http`; valor desconhecido lança       |
| ambiente | `DENO_ENV` ou `APP_ENV`                                                                                                                        | `production` ou `prod`; separado de `NODE_ENV`        |
| proxy    | `TRUSTED_PROXY_IPS`                                                                                                                            | CSV de IPs extras; loopback é confiável por padrão    |
| log      | `LOG_LEVEL`, `LOG_FORMAT`                                                                                                                      | `debug`, `info`, `warn`, `error`; `text` ou `json`    |
| banco    | `DATABASE_URL`, `DATABASE_URL_DOCKER`, `POSTGRES_*`                                                                                            | `DATABASE_URL` obrigatória em modo `http`             |
| pool     | `POOL_SIZE_APP`, `POOL_SIZE_POLLER`, `POOL_SIZE_ALERTS`, `POOL_STATEMENT_TIMEOUT_MS`                                                           | padrões 10, 4 e 2; statement timeout padrão 30.000 ms |
| operação | `ADMIN_TOKEN`                                                                                                                                  | Bearer de operação                                    |
| Fracttal | `FRACTTAL_KEY`, `FRACTTAL_SECRET`, `FRACTTAL_BASE_URL`, `DEV`                                                                                  | `DEV` só aceita a string exata `true`                 |
| polling  | `FRACTTAL_POLL_SECONDS`, `FRACTTAL_SYNC_*`, `FRACTTAL_WORK_OPEN_*`, `FRACTTAL_RATE_*`, `FRACTTAL_FETCH_CONCURRENCY`, `FRACTTAL_WORK_OPEN_ONLY` | ver nível 5                                           |
| alertas  | `ALERT_PROVIDER_*`, `ALERTS_POLL_SECONDS`, `APP_BASE_URL`                                                                                      | `APP_BASE_URL` também é base do link de login         |
| SSO      | `AUTH_SSO_ENABLED`, `AUTH_LOCAL_ENABLED`, `AUTH_ENTRA_*`, `AUTH_SSO_*`                                                                         | login local é o break-glass                           |

Regras estritas de produção (`lib/server/config.ts`, `DECISIONS.md` D22):

- em modo `http`, `DATABASE_URL` é obrigatória e o erro nomeia a variável;
- em produção, o modo `mock` é recusado com a mensagem `refusing to serve mock data`;
- `AUTH_LOCAL_ENABLED=false` é rejeitado no boot;
- `AUTH_ENTRA_CLIENT_SECRET` e o par chave e certificado são mutuamente exclusivos; chave e certificado precisam ser ambos definidos; segredo com menos de 32 caracteres é recusado; caminhos de chave e certificado são verificados com `stat`;
- `normalizeAppBaseUrl` exige URL válida, sem credenciais, query, hash ou caminho, e exige HTTPS fora de localhost e 127.0.0.1;
- `AUTH_SSO_FLOW_TTL_SECONDS` é clampado em 120 a 900 (padrão 600), `AUTH_SSO_CLOCK_TOLERANCE_SECONDS` em 0 a 300 (padrão 60) e `AUTH_SSO_HTTP_TIMEOUT_MS` em 1.000 a 30.000 (padrão 10.000).

O banco tem um único dono de pool, `lib/server/db.ts`. O pool é lazy, cacheado em `globalThis.__barrierPool`; `POOL_SIZE` fica entre 1 e 50, com padrão 10. O statement timeout é aplicado por checkout com `set_config('statement_timeout', ...)`. Hosts loopback ou `sslmode=disable` pulam TLS; qualquer outro host tenta TLS primeiro. Cada processo loga uma linha com a identidade efetiva `user@host:port/db`, nunca a senha. Retry de conexão morta existe apenas para `SELECT` e `WITH`, nunca para escritas; `withTx` não faz retry (`lib/server/db.ts`).

O `doctor` é o preflight de host: verifica plataforma, runtime, `.env`, modo de API, URL e identidade do banco, override de `DATABASE_URL`, token de admin, ping, SSO, bundle e portas 8300 e 5432. Ele imprime `user@host:port/db` e falha se a identidade do processo divergir do `.env` (`scripts/doctor.ts`, `DECISIONS.md` D26).

### 6.10 Implantação

#### Docker Compose

O `compose.yml` define o projeto `barrier-monitor` com os serviços (`compose.yml`):

| Serviço  | Imagem ou comando                            | Detalhes                                                                                                                                                                      |
| -------- | -------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `db`     | `postgres:18-alpine` com digest pinado       | volume `pgdata`, healthcheck `pg_isready`, publicação `127.0.0.1:${POSTGRES_PORT:-5432}:5432`                                                                                 |
| `app`    | build local, imagem `barrier-monitor:latest` | `env_file: .env`, `DATABASE_URL` sobrescrita por `DATABASE_URL_DOCKER`, `POOL_SIZE` 10, depende do banco saudável, publica `127.0.0.1:8300:8300`, healthcheck em `/api/ready` |
| `poller` | mesma imagem, `scripts/fracttal-poll.ts`     | `POOL_SIZE` 4, `stop_grace_period` de 3 minutos                                                                                                                               |
| `alerts` | mesma imagem, `scripts/alerts-poll.ts`       | `POOL_SIZE` 2, `stop_grace_period` de 1 minuto                                                                                                                                |
| `tools`  | mesma imagem, perfil `tools`                 | nunca sobe no `compose up`; usado para migração, auditoria, sync e criação de admin                                                                                           |

O `stop_grace_period` do poller existe porque o Docker envia SIGKILL 10 segundos após o SIGTERM; sem a janela maior, o próximo `startRun` reapa um órfão ruidoso (`compose.yml`). O `compose.dev.yml` adiciona bind mount, serviço `migrate` a cada boot, `DEV=true`, publicação `8300:8300` em todas as interfaces e `--watch` no poller e nos alertas. O `compose.external.yml` remove a dependência do banco local e adiciona `host.docker.internal`, necessário no Linux (`compose.external.yml`).

O guard `deploy/check-compose-prod.sh` falha se `POSTGRES_PASSWORD` estiver vazio, for o default de desenvolvimento `barrier` ou tiver menos de 16 caracteres, e também se o Compose deixar de bindar 8300 ou 5432 no loopback.

#### Imagem

O `Dockerfile` tem dois estágios, `base` e `prod`, sobre `denoland/deno:2.9.7` com digest pinado. A camada de dependências vem primeiro para cache; o estágio `prod` copia o código, roda `deno task build` e remove do runtime as ferramentas de build (`vite`, `rollup`, `esbuild`, `linkedom`, `xlsx`, `codepage`, `caniuse-lite`, `@esbuild`, `@rollup`, `@types`, `@babel`). Em seguida roda `deno check --cached-only` nos entrypoints (`main.ts`, `scripts/fracttal-poll.ts`, `scripts/alerts-poll.ts`, `scripts/migrate.ts`): qualquer import de runtime de um pacote podado quebra o build, não o container às 3 da manhã (`Dockerfile`). A imagem expõe 8300, roda como usuário `deno`, define `DENO_ENV=production` e usa `CMD ["task", "start"]`.

#### Windows nativo

O caminho Windows é Windows Server 2022 ou 2025 com Deno, PostgreSQL, NSSM e Caddy, instalado por `deploy/windows/Setup.cmd`, que relança `Setup-Production.ps1` elevado (`docs/DEPLOY-WINDOWS.md`). O instalador:

- instala Deno 2.9.7 pinado, PostgreSQL 18 no diretório vendorizado (padrão `C:\sites\seacrest\.vendor\pgsql18\bin`) com fallback EDB PostgreSQL 16 quando ausente, NSSM e Caddy;
- cria `.env` a partir de `.env.example` com senha de banco, `ADMIN_TOKEN` e senha de admin gerados; um `.env` existente nunca é rotacionado; a ACL é restrita;
- roda `doctor`, build, migrações e criação do primeiro admin;
- registra serviços, firewall, Caddy opcional e tarefa de backup;
- faz smoke test de `/api/health` e `/login`.

Os serviços NSSM usam o prefixo configurável (`-ServicePrefix`, padrão `SeaMonitor`): `SeaMonitorApp`, `SeaMonitorPoller`, `SeaMonitorAlerts` e `SeaMonitorCaddy`; `-ServicePrefix Barrier` restaura o layout legado `Barrier*`. No Docker os nomes equivalentes são os serviços do Compose. A postura de firewall é negar inbound por padrão; o setup só abre 80 e 443 com `-AllowedLanRanges`, e a porta 8300 nunca é aberta, exceto com `-SkipCaddy -AllowLanAppPort`, que serve HTTP puro e só é aceitável atrás de VPN (`docs/DEPLOY-WINDOWS.md`).

O Caddy faz `reverse_proxy 127.0.0.1:8300` com `X-Real-IP`, remove o banner do servidor e aplica `nosniff`, `DENY` e `no-referrer`; HSTS fica comentado até o primeiro smoke test HTTPS; nunca há `Access-Control-Allow-Origin`, porque o desenho é mesma origem (`deploy/windows/Caddyfile`).

O backup no Windows é uma tarefa diária às 02:00 que roda `deploy/windows/Backup-Database.ps1`, grava dump custom format com `pg_dump -Fc` e falha se o dump sair vazio, mantendo 14 dias. Não há helper de restore: o restore é `pg_restore` manual, destrutivo, com parada dos serviços e verificação de `/api/ready`. No Compose não há backup agendado; o roteiro documentado é `pg_dump` no container, `docker compose cp` e `pg_restore --clean --if-exists` (`docs/DEPLOY-WINDOWS.md`).

O rollback oficial é voltar ao modo mock mais a imagem anterior, sem tocar no banco (`agents.md` seção 7). Migração major do PostgreSQL dentro do container não é update normal: exige dump, recriação do volume e restore.

#### Produção versus desenvolvimento

| Aspecto             | Desenvolvimento                                   | Produção                                                              |
| ------------------- | ------------------------------------------------- | --------------------------------------------------------------------- |
| modo de API         | `mock` por padrão                                 | `http` obrigatório                                                    |
| marca de ambiente   | não exigida                                       | `DENO_ENV=production` no container ou `APP_ENV=production` no Windows |
| publicação de porta | `8300:8300` em todas as interfaces no Compose dev | `127.0.0.1:8300:8300`                                                 |
| build               | Vite com HMR                                      | bundle `_fresh/` assado na imagem                                     |
| migração            | serviço `migrate` a cada boot                     | `docker compose run --rm tools ...` antes do `up`                     |
| senha do PostgreSQL | default de desenvolvimento                        | guard exige pelo menos 16 caracteres e valor diferente do default     |
| CSP                 | desligada quando `DEV=true`                       | CSP estrita                                                           |

### 6.11 UI, islands e preferências

Há uma única raiz hidratada: `islands/Dashboard.tsx`, que compõe `SettingsProvider`, `ThemeProvider`, `ErrorBoundary` e `DashboardView`. Ela recebe do servidor o modo de API, a base URL, o nome da empresa e os dados iniciais, porque islands não leem env (`islands/Dashboard.tsx`, `docs/ARCHITECTURE.md`). As seções do painel vivem em `islands/dashboard/`. Outros islands são `LoginForm`, `ForcePasswordChange`, `ErrorBoundary` e o editor de barreira (`islands/BarrierEditor*.tsx`).

O workspace de configurações é o descrito no nível 2: diálogo centralizado de aproximadamente 1180 px por 88 dvh, rail fixo, coluna com scroll, colapso em uma coluna em telas pequenas e nenhum scroll horizontal (`DECISIONS.md` D33, `static/styles.css`). Os managers administrativos ficam em um chunk lazy com gate fail-closed duplo.

Preferências do navegador (`context/settings/presets.ts`, `context/settings/storage.ts`, `hooks/dashboard/persistence.ts`):

| Chave               | Conteúdo                                                                                                       |
| ------------------- | -------------------------------------------------------------------------------------------------------------- |
| `barrier-settings`  | tema, acento, densidade, tamanho de fonte, `reduceMotion`, `disableBlur`, filtros padrão e instalação padrão   |
| `barrier-dashboard` | instalação, filtros, ids selecionados, id aberto, colunas visíveis, filtros fixos ocultos e versão de defaults |
| `barrier-chart`     | ordenação, expandido e visão (`bars` ou `summary`)                                                             |

A hidratação acontece depois do mount, com validação campo a campo e fallback ao default em JSON velho ou adulterado. Falha de storage, como modo privado, é engolida; as preferências continuam valendo ao vivo. Nada de aparência é persistido no servidor. As chaves de `localStorage` são contrato público e não podem ser removidas (`agents.md` seção 5).

Acessibilidade observável: `role="dialog"`, `aria-modal`, `aria-labelledby` e `tabIndex` no workspace; navegação com `aria-label` e `aria-current`; backdrop e workspace com `inert` quando fechados; foco visível; `aria-sort` válido nos cabeçalhos; `aria-label` no gráfico e tooltip com `role="tooltip"` (`components/`, `scripts/browser-smoke.ts`). A tabela usa scroll horizontal em telas de até 768 px; o workspace de configurações não.

### 6.12 Qualidade e testes

Os comandos sancionados estão em `deno.jsonc` e `agents.md` seção 3:

- `deno task check` executa `deno fmt` em modo escrita, `deno lint`, `deno check` e a guarda de ordem de migração;
- `deno task test` executa a suíte em paralelo, sem type-check;
- `deno task dev` sobe o Vite com HMR;
- `deno task build` gera `_fresh/`;
- `deno task start` serve a build na 8300 lendo `.env`; `start:alt` serve na 8301; `preview` serve sem `.env`;
- `deno task db:migrate`, `db:seed`, `admin:create`, `doctor`, `browser:capture`, `alerts:*`, `fracttal:*` e `docker:*` completam o conjunto.

A ordem obrigatória depois de mudanças de código é `deno task check`, depois `deno task test`; `deno task build` quando islands, rotas, estilos ou bundles mudam; `scripts/chaos-scale.ts` para dados dinâmicos; `scripts/browser-smoke.ts` ou `deno task browser:capture` para hidratação e interação (`agents.md` seção 8).

A suíte tem 105 arquivos `*_test.ts` no repositório, contagem feita nesta revisão excluindo `node_modules` e `_fresh`. Em uma execução de pesquisa anterior, com Deno 2.9.8 e sem `DATABASE_URL`, o snapshot registrou 743 testes aprovados, 0 falhas e 23 skips. Esses números são um **snapshot observado**, não uma verdade permanente. Nesta revisão, a suíte completa não foi executada porque o worktree não tem `node_modules` e o projeto usa `nodeModulesDir: "manual"`; em vez de instalar dependências e gerar artefatos, foram executados 86 testes direcionados de sync, regras de barreira, regras de alerta, provider, envio imediato e indicador de sincronização, todos aprovados. O relatório final da tarefa registra exatamente o que rodou.

Os oito arquivos `*_integration_test.ts` de `lib/server/sql/` seguem um padrão uniforme: se `DATABASE_URL` não está definida, o teste imprime `skip: DATABASE_URL unset` e retorna sem falhar. O skip é visível no log, e a regra do projeto é nunca alegar uma execução que não foi feita (`agents.md` seção 2).

Ferramentas de verificação:

| Ferramenta                         | O que cobre                                                                                                                                                                                            |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `scripts/check-migration-order.ts` | índice antes da coluna e referência a tabela criada depois; roda no `check`                                                                                                                            |
| `scripts/browser-smoke.ts`         | Chromium headless via CDP na porta 9333; modos `mock`, `http-ok` e `http-err`; verifica gráfico, linhas, checkboxes, `aria-sort`, tooltip, modal, ESC e troca de tema; falha também em erro de console |
| `scripts/browser-capture.ts`       | screenshot ou PDF por CDP na porta 9336; URL loopback, saída sob `/tmp/opencode/`, `CHROME_BIN` com allow-list, sem `--no-sandbox` por padrão                                                          |
| `scripts/chaos-scale.ts`           | sintetiza 50 estações, 100 categorias e 50.000 barreiras, com status e criticidades novos, e verifica buckets, totais e fallbacks                                                                      |
| `scripts/test-dom.ts`              | monta linkedom e um shim de `localStorage` em memória para testes de componente                                                                                                                        |

As fixtures são sempre sintéticas e carregam `meta.synthetic: true` (`scripts/fixtures/README.md`). A captura ao vivo é anonimizada antes de tocar o disco, e a saída de `fracttal:extract` contém códigos vivos do tenant e não pode ser commitada (`docs/FRACTTAL.md`). Arquivos de credenciais de importação são criados com modo 0600 e só o caminho e a contagem vão para o stdout (`scripts/import-users.ts`, `DECISIONS.md` D32).

## 7. Nível 5: referência

Este nível concentra valores exatos. Ele não substitui os níveis anteriores: serve para consulta durante implementação, revisão de contrato e auditoria.

### 7.1 Referência de status

|           Id | Rótulo exato                | Conforme | `compliance_id` | Chave de wire         | Papel no overlay       | Landing no provedor |
| -----------: | --------------------------- | -------- | --------------: | --------------------- | ---------------------- | ------------------- |
|            0 | Disponível                  | sim      |               0 | `available`           | base                   | `normalizada`       |
|            1 | Fora de Operação            | sim      |               0 | `outOfService`        | base                   | suprimido           |
|            2 | Indisponível Contingenciado | sim      |               0 | `contingencyOutage`   | derivado de 5 com flag | `degradada`         |
|            3 | Degradado Contingenciado    | sim      |               0 | `degradedContingency` | derivado de 4 com flag | `degradada`         |
|            4 | Degradado                   | não      |               1 | `degraded`            | base                   | `degradada`         |
|            5 | Indisponível                | não      |               1 | `unavailable`         | base                   | `violada`           |
| desconhecido | `Disponibilidade (id)`      | não      |               1 | não previsto          | fail-closed            | `degradada`         |

A tabela de conformidade é 0 e 1: `Conforme` e `Não Conforme` (`lib/enums/codes.ts`). Um id desconhecido falha fechado para `Não Conforme` em `lib/constants/helpers.ts` e `lib/resolve.ts`.

### 7.2 Enums e vocabulários

#### Estações semeadas

| Id | Código | Nome                | Tipo                                                   |
| -: | ------ | ------------------- | ------------------------------------------------------ |
|  0 | `ALL`  | Todas               | Todas as Instalações, sentinela de UI, nunca uma linha |
|  1 | `FAL`  | Fazenda Alegre      | Estação Coletora                                       |
|  2 | `SML`  | São Mateus Leste    | Estação Coletora                                       |
|  3 | `FSR`  | Fazenda São Rafael  | Estação Coletora                                       |
|  4 | `IBU`  | Inhambu             | Campo                                                  |
|  5 | `FSL`  | Fazenda Santa Luzia | Estação Coletora                                       |
|  6 | `CNC`  | Cancã               | Estação de Vapor                                       |
|  7 | `JCT`  | Jacutinga           | Campo                                                  |
|  8 | `FSJ`  | Fazenda São Jorge   | Campo                                                  |

As estações são vocabulário dinâmico: o sync cria linhas novas, e a lista acima é o catálogo inicial (`lib/constants/locations.ts`, `db/schema.sql`). `CJ-UTM-N` e `CJ-UTM-C` são unidades móveis adicionadas pelo sync e pela migração (D28).

#### Criticidade

| Id | Rank | Crítico para KPI e alerta |
| -: | ---- | ------------------------- |
|  0 | ESO  | sim                       |
|  1 | A    | sim                       |
|  2 | B    | não                       |
|  3 | C    | não                       |
|  4 | D    | não                       |

`CRITICAL_RANK_IDS = [0, 1]` é a definição compartilhada entre servidor, cliente e alertas (`lib/enums/codes.ts`).

#### Categorias semeadas

As 29 categorias abaixo são contrato de id e de grafia. Algumas grafias preservam erros do vocabulário de origem, como `Controlede` e `Armosférica`, e não devem ser corrigidas sem decisão de contrato (`lib/enums/taxonomy.ts`).

| Id | Rótulo                                            | Id | Rótulo                                          |
| -: | ------------------------------------------------- | -: | ----------------------------------------------- |
|  0 | Válvula de Alívio de Pressão                      | 15 | Vent                                            |
|  1 | Intertravamento de Segurança - Elemento Iniciador | 16 | CSB - Conjunto Solidário de Barreiras           |
|  2 | Intertravamento de Segurança - Elemento Final     | 17 | Proteção Passiva                                |
|  3 | Sistema Fixo de Combate a Incêndio                | 18 | Botoeira                                        |
|  4 | Detectores Fixos de F&G                           | 19 | Vaso                                            |
|  5 | Malha de Aterramento / SPDA                       | 20 | Disco de Ruptura                                |
|  6 | Dique de Contenção                                | 21 | Sistema de drenagem                             |
|  7 | Tampa de Emergência                               | 22 | Sistemas de Alívio                              |
|  8 | Malha de Controle de Processo                     | 23 | Trava Mecânica                                  |
|  9 | Geração de Emergência                             | 24 | Dispositivo de Controlede Bloqueio e Isolamento |
| 10 | Intertravamento de Segurança - Lógica             | 25 | Procedimento Crítico                            |
| 11 | Plano de Resposta a Emergência                    | 26 | Sistema de Dispersão                            |
| 12 | Sistema de Alívio                                 | 27 | UPS                                             |
| 13 | Alarmes de Emergência e Sirene                    | 28 | Sistema de Proteção contra Descarga Armosférica |
| 14 | Válvula Manual                                    |    |                                                 |

#### Agrupamentos

| Id | Rótulo                                |
| -: | ------------------------------------- |
|  0 | Sistemas de Alívio                    |
|  1 | Evacuação, Resgate e Abandono         |
|  2 | Intertravamento de Segurança          |
|  3 | Resposta à Emergência da Brigada      |
|  4 | Resposta à Emergência da Operação     |
|  5 | Sistemas de Proteção Pós Liberação    |
|  6 | Controle de Fonte de Ignição          |
|  7 | Alarmes Críticos e Intervenção Humana |

#### Tipologias

| Id | Rótulo                |
| -: | --------------------- |
|  0 | Estação Coletora      |
|  1 | Campo                 |
|  2 | Duto de Transferência |
|  3 | Poço (RTSGI)          |
|  4 | Estação de Vapor      |
|  5 | Subestação            |

#### Donos

|         Id | Rótulo                                 |
| ---------: | -------------------------------------- |
|          0 | Operação                               |
|          1 | SMS                                    |
|          2 | Manutenção                             |
| nulo ou -1 | não informado; a UI exibe string vazia |

#### Tipos de item do Fracttal

| Id | Tipo         |
| -: | ------------ |
|  1 | `Locations`  |
|  2 | `Equipment`  |
|  3 | `Tools`      |
|  4 | `SpareParts` |
|  5 | `Digital`    |

#### Status de trabalho usados na derivação

| Contexto            | Valores                                                                      | Efeito                        |
| ------------------- | ---------------------------------------------------------------------------- | ----------------------------- |
| ordem aberta        | `done = false` ou `id_status` 1 ou 2                                         | entra na derivação            |
| ordem concluída     | `done = true` ou `id_status = 4`                                             | não gera sinal                |
| requisição fechada  | 4, 5, 6, 11, 12                                                              | não gera sinal                |
| requisição status 9 | ordem cancelada                                                              | permanece aberta de propósito |
| prioridade alta     | `very_high`, `very high`, `muito alta`, `high`, `alta`, `emergenc`, `urgent` | ativa flag de urgência        |

#### Autores

Os autores são um lookup com 11 linhas semeadas; o id 10 é `Sincronização Fracttal` e é o `SYNC_AUTHOR_ID` usado pelo sync e pela importação (`db/seed_lookups.sql`, `lib/server/sql/sync-constants.ts`). Os demais ids são dados sintéticos de demonstração e não devem ser tratados como catálogo de pessoas reais.

### 7.3 Referência de filtros

| Chave            | Tipo       | Padrão          | Validação                                                              | Onde se aplica                                |
| ---------------- | ---------- | --------------- | ---------------------------------------------------------------------- | --------------------------------------------- |
| `locationId`     | inteiro    | todas           | `0` significa todas; id inválido é 400                                 | barreiras, ids, KPI, gráfico, deleted, export |
| `availabilityId` | id ou CSV  | todas           | ids numéricos                                                          | barreiras, ids, KPI, gráfico, deleted, export |
| `complianceId`   | id ou CSV  | todas           | ids numéricos                                                          | barreiras, ids, KPI, gráfico, deleted, export |
| `categoryId`     | id ou CSV  | todas           | ids numéricos                                                          | barreiras, ids, KPI, gráfico, deleted, export |
| `typologyId`     | id ou CSV  | todas           | ids numéricos; ignorado em deleted                                     | barreiras, ids, KPI, gráfico, export          |
| `criticalityId`  | id ou CSV  | todas           | ids numéricos                                                          | barreiras, ids, KPI, gráfico, deleted, export |
| `criticalOnly`   | booleano   | falso           | `true` mantém ESO e A                                                  | barreiras, ids, KPI, gráfico, export          |
| `hasActionPlan`  | booleano   | ambos           | `true` ou `false`                                                      | barreiras, ids, KPI, gráfico, deleted, export |
| `query`          | texto      | vazio           | trim, máximo 200; escape de `%`, `_`, `\`                              | barreiras, ids, KPI, gráfico, deleted, export |
| `since`          | data       | sem limite      | `YYYY-MM-DD`, inclusivo; inválido é 400                                | barreiras, ids, KPI, gráfico, deleted, export |
| `until`          | data       | sem limite      | `YYYY-MM-DD`, inclusivo; inválido é 400                                | barreiras, ids, KPI, gráfico, deleted, export |
| `rowScope`       | enum       | `active`        | `active`, `inactive`, `deleted`, `all`; deleted e all são admin        | barreiras, ids, KPI, gráfico, export          |
| `includeDeleted` | booleano   | falso           | alias legado de `deleted`                                              | barreiras, ids, KPI, gráfico, export          |
| `sortCol`        | enum       | `id`            | whitelist de 11 colunas; inválido cai para `id`                        | barreiras, deleted, export                    |
| `sortDir`        | enum       | `asc`           | só `desc` tem efeito; qualquer outro vira `asc`                        | barreiras, deleted, export                    |
| `page`           | inteiro    | 1               | mínimo 1                                                               | barreiras, deleted, sync-changes              |
| `pageSize`       | inteiro    | 25              | máximo 1000 em barreiras; máximo 100 em sync-changes; UI 25, 50 ou 100 | barreiras, deleted, sync-changes              |
| `ids`            | CSV de ids | nenhum          | seleção de exportação; limite de 200.000 na rota de ids                | export, ids                                   |
| `format`         | enum       | csv na ausência | `csv`, `xlsx` ou `pdf`                                                 | export                                        |
| `timeZone`       | texto IANA | UTC             | usado na renderização de datas do relatório                            | export                                        |

A whitelist de ordenação é exatamente `id`, `tag`, `location`, `typology`, `criticality`, `category`, `owner`, `availability`, `compliance`, `contingency` e `statusSince` (`lib/server/sql/where.ts`). A ordenação de conformidade usa `effective_availability_id(...) in (0,1,2,3)`; a de contingência usa o TAG da contingência; a de estação usa `loc.code`; rótulos usam `coalesce(ref_*.label, '')`.

### 7.4 Referência de endpoints

Além de `/api/*`, as páginas são `/`, `/login`, `/trocar-senha` e `/auth/entra/*`. `routes/api/_params.ts` e `routes/api/validation_test.ts` não são rotas (`docs/API.md`).

#### Saúde

| Método e caminho  | Auth    | Resposta                                                                                         |
| ----------------- | ------- | ------------------------------------------------------------------------------------------------ |
| `GET /api/health` | público | `{ ok, time }`; nunca toca o banco; sem throttle                                                 |
| `GET /api/ready`  | público | `{ ok, mode, time }` após config e `select 1`; 503 com `retry-after` em falha; mock pula o banco |

#### Sessões e conta

| Método e caminho          | Auth           | Observação                                                                                                                                                                                                                                      |
| ------------------------- | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /api/auth/login`    | público        | `{ email, password }`; 200 com usuário público e cookie; 401 genérico; revoga sessão apresentada antes de emitir a nova; throttle de escrita                                                                                                    |
| `POST /api/auth/logout`   | público        | `{ ok, ssoLogoutUrl }`; limpa o cookie; sessão ausente ou inválida ainda sucede                                                                                                                                                                 |
| `GET /api/auth/me`        | somente sessão | usuário atual com `allowedLocationIds`, `auth_source`, `auth_method` e `mustChangePassword`                                                                                                                                                     |
| `POST /api/auth/password` | somente sessão | `{ currentPassword, newPassword }`; verifica a atual, aplica 12 a 256, rejeita reuso, limpa o flag, revoga sessões e limpa o cookie na mesma transação                                                                                          |
| `PATCH /api/auth/profile` | somente sessão | `{ name?, email?, phone?, currentPassword?, newPassword? }`; mudança de e-mail exige `currentPassword`, contas Entra-only não podem mudar e-mail, erro de duplicidade é genérico e sessões são revogadas; token responde 401 `session required` |

#### Entra OIDC

| Método e caminho                      | Auth    | Observação                                                                                                                           |
| ------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /auth/entra/login`               | público | 302 para o Entra com PKCE, state e nonce; `no-store`                                                                                 |
| `GET /auth/entra/callback`            | público | 303 para o caminho de retorno com cookie, ou `/login?sso=<codigo>`; valida issuer, nonce, state, PKCE e claims                       |
| `GET /auth/entra/frontchannel-logout` | público | 200 `text/plain` em configuração válida; valida issuer e `sid` hasheado e revoga sessões                                             |
| `GET /auth/entra/logged-out`          | público | 404 quando o SSO está desabilitado; em GET cross-site não revoga a sessão do servidor; 303 para `/login?sso=logout` e limpa o cookie |

#### Barreiras

| Método e caminho                                | Auth  | Observação                                                                                                                                                        |
| ----------------------------------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/barriers`                             | dados | filtros compartilhados, `page`, `pageSize`, `sortCol`, `sortDir`; `{ items, total, page, pageSize, totalPages }`; tamanho máximo 1000; deleted e all exigem admin |
| `GET /api/barriers/ids`                         | dados | mesmos filtros, sem paginação; `{ ids, total }`; até 200.000 ids                                                                                                  |
| `GET /api/barriers/:id`                         | dados | barreira wire com histórico e `manualFields`; admin lê excluídas; não admin recebe 404 fora do escopo                                                             |
| `PATCH /api/barriers/:id`                       | admin | campos editáveis e `releaseFields`; uma transação para metadados, status e overlay                                                                                |
| `PATCH /api/barriers/:id/status`                | admin | `{ statusId, authorId?, note? }`; sessão deriva o autor; token precisa informar; mesmo status é no-op sem histórico                                               |
| `GET /api/barriers/:id/contingencies`           | dados | `?q=` até 200; `{ outgoing, incoming, candidates, candidatesHaveMore }`; 50 candidatos                                                                            |
| `POST /api/barriers/:id/contingencies`          | admin | `{ contingencyBarrierId, managementChange?, riskAnalysis? }`; duplicado ou inelegível é 400; corpo de 10.000 bytes                                                |
| `PATCH, DELETE /api/barriers/:id/contingencies` | admin | atualiza ou remove vínculo; corpo de 10.000 bytes; 404 quando o vínculo não existe                                                                                |
| `GET /api/barriers/:id/sync-detail`             | dados | `?runId=` ou `?scope=last-day`; snapshot antes e depois; sem parâmetro usa a última alteração                                                                     |
| `GET /api/barriers/deleted`                     | admin | mesma forma paginada; sempre deleted-only; ignora tipologia, `criticalOnly` e `rowScope`                                                                          |
| `GET /api/barriers/:id/fracttal-raw`            | admin | só com `DEV=true`, senão 404; `private, no-store`; 5 por minuto                                                                                                   |

#### Agregados

| Método e caminho         | Auth  | Observação                                                                                                                                                                                      |
| ------------------------ | ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/kpi`           | dados | snapshot com contadores fixos, `pctCompliant`, críticas não conformes, sem plano, buckets, inativas e excluídas para admin, `syncedAt`; memo de 30 s                                            |
| `GET /api/chart`         | dados | `{ categoryId, compliant, total }[]`, maior total primeiro; memo de 30 s                                                                                                                        |
| `GET /api/vocabularies`  | dados | `{ locations, availabilities, compliances, criticalities, categories, typologies, authors }` com rótulos e contagens; escopo de estação; usuário sem estação recebe listas vazias; memo de 60 s |
| `GET /api/field-options` | dados | `{ field, options, updated_at, updated_by }[]`; campos ausentes são semeados na leitura                                                                                                         |
| `PUT /api/field-options` | admin | `?field=<chave>` e `{ options }`; máximo 200 opções de 200 caracteres; corpo de 64 KiB; campo desconhecido é 400                                                                                |
| `GET /api/lookups`       | admin | lookups com ids: availabilities, categories, locations, criticalities, typologies, groupings, owners e authors                                                                                  |

#### Exportação

| Método e caminho        | Auth  | Observação                                                                                        |
| ----------------------- | ----- | ------------------------------------------------------------------------------------------------- |
| `GET, POST /api/export` | dados | `format=csv\|xlsx\|pdf`, filtros compartilhados de barreira, corpo `{ format?, ids?, timeZone? }` |

#### Inspeção de sync

| Método e caminho        | Auth  | Observação                                                                                                              |
| ----------------------- | ----- | ----------------------------------------------------------------------------------------------------------------------- |
| `GET /api/sync-status`  | dados | `{ state, runningSince, lastRun, totals }`; `state` é `syncing`, `idle`, `stale` ou `unknown`; memo de 15 s             |
| `GET /api/sync-runs`    | dados | `?limit=` de 1 a 50, padrão 10; runs concluídas mais novas primeiro                                                     |
| `GET /api/sync-changes` | dados | `?scope=last-run\|last-day`, `?runId=`, `?kind=new\|updated\|removed\|restored\|all`, `?query=`, `?page=`, `?pageSize=` |

#### Usuários

| Método e caminho                 | Auth  | Observação                                                                                                                                                                                                                                        |
| -------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/users`                 | admin | linhas públicas mais `entra_oid`; nunca hash de senha                                                                                                                                                                                             |
| `POST /api/users`                | admin | `{ email, name?, phone?, password?, role?, authSource?, entraObjectId?, accessGroupIds? }`; 201; senha omitida ou vazia gera senha temporária por pessoa, marca troca obrigatória e devolve `temporaryPassword` e `aviso` uma vez, com `no-store` |
| `PATCH, DELETE /api/users/:id`   | admin | PATCH aceita `email`, `name`, `phone`, `role`, `active`, `password`, `resetPassword`, `authSource` e `entraObjectId`; `resetPassword=true` é local-only e devolve senha temporária; guards de último admin retornam 400                           |
| `DELETE /api/users/:id/sessions` | admin | `{ revoked }`; 404 para usuário ausente                                                                                                                                                                                                           |
| `POST /api/users/batch`          | admin | `{ action, ids }`; ações `activate`, `deactivate`, `promote`, `demote`, `revokeSessions`; até 500 ids únicos; atômico; guards de último admin preservados                                                                                         |

#### Grupos de acesso

| Método e caminho                            | Auth  | Observação                                                                                                                                    |
| ------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET, POST /api/access-groups`              | admin | lista ordenada por nome com `locationIds` e `userIds`, ou 201 com grupo criado; nome obrigatório; corpo de 10.000 bytes; nome duplicado é 400 |
| `GET, PATCH, DELETE /api/access-groups/:id` | admin | PATCH substitui arrays; DELETE cascateia vínculos; corpo de 10.000 bytes                                                                      |
| `POST /api/access-groups/batch`             | admin | `{ action, ids, userIds? \| locationIds? }`                                                                                                   |

#### Destinatários legados

| Método e caminho                    | Auth  | Observação                                                                                                                                                    |
| ----------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/recipients`               | admin | `?activeOnly=1`; lista com id, email, nome, telefone, ativo e criação                                                                                         |
| `POST /api/recipients`              | admin | `{ email, name?, phone? }`; 201; upsert de nome e telefone por e-mail; `active` inalterado                                                                    |
| `PATCH, DELETE /api/recipients/:id` | admin | `{ name?, phone?, active? }` ou id; patch vazio é 400                                                                                                         |
| `POST /api/recipients/batch`        | admin | `{ action, ids?, userIds? }`; ações `activate`, `deactivate`, `delete`, `addUsers`; até 500 ids; `addUsers` copia usuários por e-mail e força `active = true` |

#### Regras de alerta

| Método e caminho                     | Auth  | Observação                                                                                                                                                                                  |
| ------------------------------------ | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/alert-rules`               | admin | `?activeOnly=1`; regras com escopos, urgência, anti-ruído, prioridade, validade e timestamps                                                                                                |
| `POST /api/alert-rules`              | admin | 201; nome duplicado é 400; escopo, urgência, hora, dia ou data inválidos são 400                                                                                                            |
| `PATCH, DELETE /api/alert-rules/:id` | admin | qualquer campo ou id; patch vazio é 400                                                                                                                                                     |
| `POST /api/alert-rules/batch`        | admin | `{ action, ids }`; ações `activate`, `deactivate`, `delete`; até 500 ids; atômico e tudo ou nada                                                                                            |
| `GET /api/alert-rules/preview`       | admin | `?categoryIds=`, `?locationIds=`, `?criticalityIds=`, `?typologyIds=`, `?groupingIds=`, `?ownerIds=`, `?staleDays=`, `?onlyNoActionPlan=1`; `{ count, tags }` com até cinco TAGs de amostra |

Os campos de regra aceitos no POST são `name`, `description`, `categoryId`, `toStatusId`, `criticalOnly`, `includeRecovery`, `staleDays`, `notifyImmediate`, `active`, `categoryIds`, `fromStatusIds`, `toStatusIds`, `locationIds`, `criticalityIds`, `typologyIds`, `groupingIds`, `ownerIds`, `urgency`, `onlyNoActionPlan`, `onTransition`, `cooldownMinutes`, `maxPerDay`, `quietStartHour`, `quietEndHour`, `activeDays`, `priority`, `validFrom`, `validTo` e `staleRepeatDays` (`docs/API.md`).

### 7.5 Referência de tabelas

As 25 tabelas de domínio, com chave e uso principal (`db/schema.sql`, `docs/DATABASE.md`). `schema_migrations` é tabela de auditoria da migração e não entra na contagem.

| Tabela                   | Chave                                  | Uso principal                                                                                                       |
| ------------------------ | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `locations`              | `id`                                   | estações e instalações; `code` único; `ALL` (0) só na UI                                                            |
| `availability_statuses`  | `id`                                   | contrato de status; `label` único; `is_compliant`                                                                   |
| `criticality_levels`     | `id`                                   | ranks ESO a D                                                                                                       |
| `categories`             | `id`                                   | categorias dinâmicas; `label` único                                                                                 |
| `groupings`              | `id`                                   | agrupamentos estáticos                                                                                              |
| `typologies`             | `id`                                   | tipologias estáticas                                                                                                |
| `owners`                 | `id`                                   | donos; nulo em `barriers` significa não informado                                                                   |
| `loc_descs`              | `id`                                   | descrições de local; 20 linhas semeadas                                                                             |
| `authors`                | `id`                                   | autores de histórico; id 10 é a sincronização                                                                       |
| `users`                  | `id`                                   | contas locais e Entra; `email` único e minúsculo                                                                    |
| `barriers`               | `id`                                   | ativo protegido; FKs de taxonomia; `external_code` único; `compliance_id` derivado; `manual_fields`; `scope_source` |
| `barrier_contingencies`  | `(barrier_id, contingency_barrier_id)` | vínculos locais de contingência; check de auto-vínculo                                                              |
| `barrier_status_history` | `id`                                   | uma linha por transição; autor, nota, `sync_run_id`, `source_author`, `participants`                                |
| `sync_state`             | `id`                                   | uma linha por execução; escopo, estado, contadores, nota, heartbeat                                                 |
| `sync_barrier_changes`   | `id`                                   | diff por barreira e execução; unique `(run_id, barrier_id)`                                                         |
| `alert_rules`            | `id`                                   | gatilho e escopo de alerta; `name` único                                                                            |
| `alert_events`           | `id`                                   | evento deduplicado; `dedup_key` único; `sent_at` nulo é pendente                                                    |
| `alert_recipients`       | `id`                                   | lista manual legada; não lida pela entrega                                                                          |
| `sessions`               | `id`                                   | sessões opacas; `token_hash` único; expiração                                                                       |
| `auth_flows`             | `state_hash`                           | fluxos OIDC de uso único; expiração                                                                                 |
| `access_groups`          | `id`                                   | grupos de escopo; `name` único                                                                                      |
| `access_group_locations` | `(group_id, location_id)`              | vínculo grupo e estação                                                                                             |
| `user_access_groups`     | `(user_id, group_id)`                  | vínculo usuário e grupo                                                                                             |
| `throttle_buckets`       | `(bucket, key)`                        | contadores compartilhados; orçamento de exportação                                                                  |
| `field_option_sets`      | `field`                                | opções curadas da ficha; semeadas na primeira leitura                                                               |

### 7.6 Limites e cotas

| Área                             | Limite                                                         | Fonte                                                                |
| -------------------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| página de barreiras              | padrão 25, máximo 1000 no servidor; UI 25, 50 ou 100           | `lib/server/sql/barriers.ts`, `lib/constants/locations.ts`           |
| página de alterações de sync     | padrão 25, máximo 100                                          | `docs/API.md`                                                        |
| execuções de sync por consulta   | 1 a 50, padrão 10                                              | `docs/API.md`                                                        |
| ids para exportação e seleção    | 200.000                                                        | `lib/export/limits.ts`                                               |
| linhas por exportação            | 200.000                                                        | `lib/export/limits.ts`                                               |
| linhas por lote de exportação    | 5.000                                                          | `lib/export/limits.ts`                                               |
| colunas de exportação            | 30                                                             | `lib/export/columns.ts`                                              |
| busca textual                    | 200 caracteres                                                 | `routes/api/_params.ts`                                              |
| candidatos de contingência       | 50 por consulta                                                | `lib/server/sql/contingencies.ts`                                    |
| opções de campo                  | 200 opções de 200 caracteres                                   | `docs/API.md`                                                        |
| batch de usuários                | 500 ids únicos                                                 | `docs/API.md`                                                        |
| batch de destinatários           | 500 ids únicos                                                 | `docs/API.md`                                                        |
| batch de regras                  | 500 ids únicos                                                 | `docs/API.md`                                                        |
| batch de grupos                  | 200 grupos, 500 ids relacionados, 20.000 no produto cartesiano | `docs/API.md`, `DECISIONS.md` D34                                    |
| corpo JSON padrão                | 256 KiB                                                        | `docs/API.md`                                                        |
| corpo de exportação              | 4 MiB                                                          | `lib/server/validation.ts`                                           |
| corpo de contingência            | 10.000 bytes                                                   | `routes/api/barriers/[id]/contingencies.ts`                          |
| corpo de grupo de acesso         | 10.000 bytes                                                   | `routes/api/access-groups.ts`                                        |
| corpo de batch de grupos         | 256 KiB                                                        | `routes/api/access-groups/batch.ts`                                  |
| corpo de opções de campo         | 64 KiB                                                         | `routes/api/field-options.ts`                                        |
| throttle de leitura              | 120 por minuto                                                 | `lib/server/throttle.ts`                                             |
| throttle de escrita              | 30 por minuto                                                  | `lib/server/throttle.ts`                                             |
| throttle de senha                | 10 por minuto                                                  | `lib/server/throttle.ts`                                             |
| throttle de exportação           | 120 por minuto                                                 | `lib/server/throttle.ts`                                             |
| throttle de raw do Fracttal      | 5 por minuto                                                   | `lib/server/throttle.ts`                                             |
| destinos por alerta              | 50                                                             | `lib/server/alerts/provider.ts`                                      |
| título de alerta                 | 180 caracteres                                                 | `lib/server/alerts/provider.ts`                                      |
| mensagem de alerta               | 1200 caracteres                                                | `lib/server/alerts/provider.ts`                                      |
| código, tipo e criticidade       | 60 caracteres                                                  | `lib/server/alerts/provider.ts`                                      |
| nome da barreira e local         | 160 caracteres                                                 | `lib/server/alerts/provider.ts`                                      |
| `alerta_id`                      | 120 caracteres                                                 | `lib/server/alerts/provider.ts`                                      |
| corpo de resposta do provedor    | 1 MB                                                           | `lib/server/alerts/provider.ts`                                      |
| timeout de POST do provedor      | 65 s no cliente, 15 s no ciclo                                 | `lib/server/alerts/provider.ts`, `lib/server/alerts/run-provider.ts` |
| transições por leitura de alerta | 20.000                                                         | `lib/server/sql/alerts.ts`                                           |
| enqueue de alertas               | 500 por lote                                                   | `lib/server/sql/alerts.ts`                                           |
| envio por página                 | 200 eventos, concorrência 4                                    | `lib/server/alerts/run-provider.ts`                                  |
| tentativas antes de dead-letter  | 5                                                              | `lib/server/alerts/run-provider.ts`                                  |
| página do Fracttal               | 100 linhas                                                     | `lib/server/fracttal/client.ts`                                      |
| páginas de item no poller        | padrão 250, sem teto superior no parse da env                  | `scripts/fracttal-poll.ts`                                           |
| páginas de item no sync one-shot | padrão 200, máximo 400                                         | `scripts/fracttal-sync.ts`                                           |
| páginas de item no force-sync    | padrão 400, máximo 400                                         | `scripts/fracttal-force-sync.ts`                                     |
| páginas de trabalho              | padrão 5, máximo 40 nos one-shots                              | `scripts/fracttal-sync.ts`                                           |
| sweep aberto de OS               | padrão 40 páginas                                              | `scripts/fracttal-poll.ts`                                           |
| rate do Fracttal                 | padrão 180 por minuto, teto 200, burst máximo 50               | `lib/server/fracttal/adaptive-rate.ts`                               |
| retries do Fracttal              | 3 adicionais                                                   | `lib/server/fracttal/client.ts`                                      |
| timeout do Fracttal              | 15 s                                                           | `lib/server/fracttal/client.ts`                                      |
| sessão                           | 12 horas                                                       | `lib/server/auth/session.ts`                                         |
| senha                            | 12 a 256 caracteres                                            | `lib/server/auth/password.ts`                                        |
| iterações PBKDF2                 | 210.000                                                        | `lib/server/auth/password.ts`                                        |
| senha temporária                 | 16 caracteres de 55 símbolos (o comentário do arquivo diz 54)  | `lib/server/auth/password.ts`                                        |
| TTL de fluxo SSO                 | 120 a 900 s, padrão 600                                        | `lib/server/config.ts`                                               |
| tolerância de relógio SSO        | 0 a 300 s, padrão 60                                           | `lib/server/config.ts`                                               |
| timeout HTTP SSO                 | 1000 a 30.000 ms, padrão 10.000                                | `lib/server/config.ts`                                               |
| lock de sync                     | 10 min para lease fresca, 15 min para reaper                   | `lib/server/sql/sync-status.ts`                                      |
| heartbeat de sync                | 60 s, mínimo 10 s                                              | `lib/server/fracttal/sync.ts`                                        |
| memo de KPI e gráfico            | 30 s                                                           | `routes/api/kpi.ts`, `routes/api/chart.ts`                           |
| memo de vocabulários             | 60 s                                                           | `routes/api/vocabularies.ts`, `lib/server/sql/vocabularies.ts`       |
| memo de status de sync           | 15 s                                                           | `routes/api/sync-status.ts`                                          |
| pool de conexões                 | `POOL_SIZE` 1 a 50, padrão 10                                  | `lib/server/db.ts`                                                   |
| statement timeout                | 1000 a 600.000 ms, padrão 30.000                               | `lib/server/db.ts`                                                   |

### 7.7 Variáveis de ambiente

As variáveis abaixo aparecem em `.env.example` ou são lidas por código e scripts. Valores entre parênteses são padrões quando a variável não está definida.

| Variável                               | Padrão                                              | Consumida por                                                            |
| -------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------ |
| `COMPANY_NAME`                         | vazio, sem marca                                    | `lib/company.ts`                                                         |
| `PUBLIC_API_MODE`                      | `mock`                                              | `lib/server/config.ts`, `lib/api.ts`                                     |
| `PUBLIC_API_BASE_URL`                  | vazio, mesma origem                                 | `routes/index.tsx`, `lib/api.ts`                                         |
| `DENO_ENV` / `APP_ENV`                 | não definido                                        | `lib/server/config.ts`                                                   |
| `TRUSTED_PROXY_IPS`                    | vazio; loopback é confiável                         | `lib/server/throttle.ts`                                                 |
| `LOG_LEVEL`                            | `info`                                              | `lib/server/log.ts`                                                      |
| `LOG_FORMAT`                           | `text`                                              | `lib/server/log.ts`                                                      |
| `DATABASE_URL`                         | sem padrão em produção                              | `lib/server/db.ts`, `scripts/migrate.ts`                                 |
| `DATABASE_URL_DOCKER`                  | não definido                                        | `compose.yml`                                                            |
| `POSTGRES_DB`                          | `barreiras` no exemplo                              | `compose.yml`                                                            |
| `POSTGRES_USER`                        | `barrier` no exemplo                                | `compose.yml`                                                            |
| `POSTGRES_PASSWORD`                    | `barrier` no exemplo; proibido em produção          | `compose.yml`, `deploy/check-compose-prod.sh`                            |
| `POSTGRES_PORT`                        | `5432`                                              | `compose.yml`                                                            |
| `POOL_SIZE_APP`                        | 10                                                  | `compose.yml`                                                            |
| `POOL_SIZE_POLLER`                     | 4                                                   | `compose.yml`                                                            |
| `POOL_SIZE_ALERTS`                     | 2                                                   | `compose.yml`                                                            |
| `POOL_STATEMENT_TIMEOUT_MS`            | 30.000                                              | `lib/server/db.ts`                                                       |
| `ADMIN_TOKEN`                          | vazio, autenticação por token falha fechada         | `lib/server/auth.ts`                                                     |
| `ADMIN_PASSWORD`                       | não definido                                        | `scripts/create-admin.ts`                                                |
| `FRACTTAL_KEY`                         | sem padrão                                          | `lib/server/config.ts`, scripts                                          |
| `FRACTTAL_SECRET`                      | sem padrão                                          | `lib/server/config.ts`, scripts                                          |
| `FRACTTAL_BASE_URL`                    | `https://app.fracttal.com/api`                      | `lib/server/config.ts`                                                   |
| `DEV`                                  | `false`; só a string exata `true` liga              | `lib/server/config.ts`, `routes/_middleware.ts`                          |
| `ALERT_PROVIDER_BASE_URL`              | sem padrão                                          | `lib/server/alerts/provider.ts`                                          |
| `ALERT_PROVIDER_TOKEN`                 | sem padrão; ausência deixa o poller em dry-run      | `lib/server/alerts/provider.ts`, `scripts/alerts-poll.ts`                |
| `ALERT_PROVIDER_COMPANY_ID`            | 1                                                   | `lib/server/alerts/provider.ts`                                          |
| `ALERTS_POLL_SECONDS`                  | 900, mínimo 60                                      | `scripts/alerts-poll.ts`                                                 |
| `APP_BASE_URL`                         | sem padrão                                          | `lib/server/alerts/provider.ts`, `account-notice.ts`, `routes/index.tsx` |
| `FRACTTAL_POLL_SECONDS`                | 300, mínimo 60                                      | `scripts/fracttal-poll.ts`                                               |
| `FRACTTAL_SYNC_ITEM_TYPE`              | 2                                                   | `scripts/fracttal-poll.ts`                                               |
| `FRACTTAL_SYNC_MAX_PAGES`              | 250 no poller; 200 no `--pages` do sync             | `scripts/fracttal-poll.ts`, `scripts/fracttal-sync.ts`                   |
| `FRACTTAL_SYNC_WORK_MAX_PAGES`         | 5                                                   | `scripts/fracttal-poll.ts`                                               |
| `FRACTTAL_WORK_OPEN_MAX_PAGES`         | 40                                                  | `scripts/fracttal-poll.ts`                                               |
| `FRACTTAL_RATE_PER_MIN`                | 180                                                 | `lib/server/fracttal/adaptive-rate.ts`                                   |
| `FRACTTAL_RATE_MAX_PER_MIN`            | 190, clamp em 200                                   | `lib/server/fracttal/adaptive-rate.ts`                                   |
| `FRACTTAL_RATE_MIN_PER_MIN`            | 80                                                  | `lib/server/fracttal/adaptive-rate.ts`                                   |
| `FRACTTAL_RATE_BURST`                  | 10, clamp em 50                                     | `lib/server/fracttal/adaptive-rate.ts`                                   |
| `FRACTTAL_FETCH_CONCURRENCY`           | 4                                                   | `scripts/fracttal-poll.ts`                                               |
| `FRACTTAL_WORK_OPEN_ONLY`              | 1                                                   | `scripts/fracttal-poll.ts`                                               |
| `AUTH_SSO_ENABLED`                     | `false`                                             | `lib/server/config.ts`                                                   |
| `AUTH_LOCAL_ENABLED`                   | `true`; `false` é recusado no boot                  | `lib/server/config.ts`                                                   |
| `AUTH_ENTRA_TENANT_ID`                 | sem padrão                                          | `lib/server/config.ts`                                                   |
| `AUTH_ENTRA_CLIENT_ID`                 | sem padrão                                          | `lib/server/config.ts`                                                   |
| `AUTH_ENTRA_CLIENT_SECRET`             | sem padrão; mutuamente exclusivo com o par de chave | `lib/server/config.ts`                                                   |
| `AUTH_ENTRA_PRIVATE_KEY_PATH`          | `./secrets/entra.key`                               | `lib/server/config.ts`                                                   |
| `AUTH_ENTRA_CERTIFICATE_PATH`          | `./secrets/entra.crt`                               | `lib/server/config.ts`                                                   |
| `AUTH_ENTRA_CLIENT_ASSERTION_ALG`      | `RS256`; `PS256` aceito                             | `lib/server/config.ts`; não está no `.env.example`                       |
| `AUTH_SSO_FORCE_ACCOUNT_PICKER`        | `true`                                              | `lib/server/config.ts`                                                   |
| `AUTH_SSO_FLOW_TTL_SECONDS`            | 600, clamp 120 a 900                                | `lib/server/config.ts`                                                   |
| `AUTH_SSO_CLOCK_TOLERANCE_SECONDS`     | 60, clamp 0 a 300                                   | `lib/server/config.ts`                                                   |
| `AUTH_SSO_HTTP_TIMEOUT_MS`             | 10.000, clamp 1000 a 30.000                         | `lib/server/config.ts`                                                   |
| `AUTH_SSO_FRONTCHANNEL_LOGOUT_ENABLED` | `false`                                             | `lib/server/config.ts`                                                   |
| `SEED_FORCE`                           | não definido                                        | `scripts/seed.ts`                                                        |
| `LEGACY_SHARED_PASSWORD`               | não definido                                        | `scripts/flag-shared-password-users.ts`                                  |
| `CHROME_BIN`                           | não definido; allow-list de prefixos                | `scripts/browser-capture.ts`                                             |
| `CHROME_NO_SANDBOX`                    | não definido; `1` remove o sandbox                  | `scripts/browser-capture.ts`                                             |
| `POOL_SIZE`                            | 10                                                  | `lib/server/db.ts`; sobrescrito por serviço no Compose                   |

### 7.8 Tarefas e scripts

Tarefas de `deno.jsonc`:

| Tarefa                  | Comando                                                        | Observação                                                          |
| ----------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------- |
| `check`                 | `deno fmt && deno lint && deno check && check-migration-order` | `deno fmt` escreve formatação                                       |
| `test`                  | `deno test --parallel --no-check ...`                          | sem type-check; `check` é dono do type-check                        |
| `dev`                   | `vite`                                                         | HMR                                                                 |
| `build`                 | `vite build`                                                   | gera `_fresh/`                                                      |
| `preview`               | `deno serve ... _fresh/server.js`                              | sem `.env`                                                          |
| `start`                 | `deno serve --env-file=.env ... --port 8300`                   | produção local                                                      |
| `start:alt`             | idem na 8301                                                   | instância alternativa                                               |
| `db:migrate`            | `scripts/migrate.ts`                                           | schema, cleanup e seeds; reexecutável                               |
| `db:seed`               | `scripts/seed.ts`                                              | não idempotente; `--force` exige `SEED_FORCE=1` e `YES`             |
| `admin:create`          | `scripts/create-admin.ts`                                      | primeiro admin; senha por stdin mascarado                           |
| `doctor`                | `scripts/doctor.ts`                                            | preflight de host                                                   |
| `browser:capture`       | `scripts/browser-capture.ts`                                   | screenshot ou PDF                                                   |
| `fracttal:import`       | `scripts/fracttal-import.ts`                                   | dump local; dry-run por padrão                                      |
| `fracttal:sync`         | `scripts/fracttal-sync.ts`                                     | fixture ou `--live`; dry-run por padrão                             |
| `fracttal:force-sync`   | `scripts/fracttal-force-sync.ts`                               | recuperação live; dry-run por padrão                                |
| `fracttal:poll`         | `scripts/fracttal-poll.ts`                                     | loop live                                                           |
| `fracttal:audit`        | `scripts/fracttal-audit-stations.ts`                           | auditoria read-only de estações                                     |
| `fracttal:capture`      | `scripts/fracttal-capture.ts`                                  | captura anonimizada                                                 |
| `fracttal:extract`      | `scripts/fracttal-extract.ts`                                  | amostra read-only em stdout                                         |
| `alerts:check`          | `scripts/alerts-check.ts`                                      | dry-run por padrão; `--apply`, `--reprocess`, `--only-barrier`      |
| `alerts:poll`           | `scripts/alerts-poll.ts`                                       | loop de entrega                                                     |
| `alerts:provider-check` | `scripts/alerts-provider-check.ts`                             | preflight do provedor; `--send-test`                                |
| `import:users`          | `scripts/import-users.ts`                                      | roster por pessoa; senha 0600                                       |
| `import:users:check`    | `scripts/import-users.ts --dry-run`                            | auditoria sem escrita                                               |
| `docker:*`              | Compose                                                        | build, up, down, dev, logs, migrate, audit, sync, force-sync, adcre |

Scripts operacionais diretos, sem task dedicada:

| Script                                  | Uso                                                      | Guarda                                                                         |
| --------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `scripts/flag-shared-password-users.ts` | marca contas que ainda usam a senha compartilhada legado | legado nunca impresso; dry-run por padrão; `--apply`; `--limit`                |
| `scripts/x1509-habilitar-entra.ts`      | converte contas locais para Entra em lote                | sem `--apply` só mostra; confere e-mail contra lista do tenant; não cria conta |
| `scripts/x1509-avisar-convite.ts`       | envia convite sem senha às contas convertidas            | sem `--apply` chama o endpoint de teste do provedor                            |
| `scripts/backfill-degraded-urgent.ts`   | rebaixa 3 e 4 gravados sob a regra antiga                | dry-run por padrão; ignora histórico cujo autor não é o sync                   |
| `scripts/dump-sync-anomalies.ts`        | diagnóstico read-only do caminho do poller               | dry-run eterno; sem linhas em `sync_state`                                     |
| `scripts/geral-coverage.ts`             | cobertura da planilha GERAL contra o monitor             | read-only; usa `xlsx` fora do runtime                                          |
| `scripts/browser-smoke.ts`              | smoke headless                                           | porta 9333; perfil apagado a cada run                                          |
| `scripts/chaos-scale.ts`                | prova a UI com 50.000 barreiras e valores novos          | sem banco, somente leitura                                                     |
| `scripts/import-sort.ts`                | ordena imports por linha descendente                     | `--fix` reescreve                                                              |
| `scripts/check-migration-order.ts`      | guarda de ordem do schema                                | roda no `check`                                                                |
| `scripts/test-dom.ts`                   | linkedom e shim de storage para testes                   | biblioteca de teste                                                            |

### 7.9 Decisões D01 a D36

Todas as decisões ficam em `DECISIONS.md`; os ids são estáveis e os buracos na sequência são decisões aposentadas. As decisões abaixo são as vigentes no código.

| ID  | Decisão e consequência prática                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 | Índices de banco são somente aditivos. Nunca remover índice ou recurso para simplificar; novas consultas ganham índice em vez de perder funcionalidade.                                                                                                    |
| D20 | Propriedade manual: o PATCH grava em `manual_fields` apenas chaves que realmente mudaram; o sync exclui os campos possuídos; `releaseFields` devolve; a migração de coluna é idempotente.                                                                  |
| D21 | Acesso a estações é fail-closed. Não administrador sem grupo vê zero estações; `null` é exclusivo de admin; a criação de usuário aceita `accessGroupIds` para escopo atômico.                                                                              |
| D22 | Configuração de produção é estrita: `PUBLIC_API_MODE` precisa ser conhecido, produção recusa mock, o boot valida a configuração; `/api/ready` é readiness com banco e `/api/health` é liveness.                                                            |
| D23 | A disponibilidade efetiva vive uma vez no SQL (`effective_availability_id`) e dirige filtros, KPI, gráfico, vocabulários, contingências e alertas stale; o trigger de conformidade espelha; as chaves de dedup incluem o id do histórico.                  |
| D24 | O PATCH de barreira é uma transação que cobre status, metadados e overlay; a propriedade do sync é checada dentro do UPDATE contra o `manual_fields` corrente, fechando a corrida do sweep longo.                                                          |
| D25 | SMTP local foi removido; a entrega é do provedor de alertas; fontes são self-hosted; o sync foi dividido em escrita, aplicação e leitura; a UI é typechecked pelo `deno task check`.                                                                       |
| D26 | Credenciais de banco são reportadas por identidade; `doctor` imprime `user@host:port/db` e falha quando `DATABASE_URL` do processo sobrepõe o `.env`; o pool loga uma linha de configuração.                                                               |
| D27 | Aliases de estação: `SM8` e o cluster de poços `CO` são mapeados; o parser varre a partir do L3; segmento transformador com CO que não casa fica sob o L3; `SM-1` fica sob `SM`; o catálogo sofre upsert.                                                  |
| D28 | A unidade móvel é dividida em `CJ-UTM-N` e `CJ-UTM-C` pelo L2 (`Area Norte` e `Area Centro`); o schema renomeia a linha antiga no lugar e adiciona a segunda; migrar antes do próximo sync.                                                                |
| D29 | Primeiro bind Entra por e-mail: linha pendente (`auth_source = 'entra'`, `entra_oid` nulo, ativa) liga no primeiro token válido cujo endereço casa; depois só por object id; endereço desconhecido é negado; sem JIT; conta local nunca casa.              |
| D30 | Senha temporária em texto é exceção estreita: devolvida uma vez no create ou reset e no aviso; nunca armazenada em claro nem logada; sem expiração; o provedor deduplica por conta e tipo.                                                                 |
| D31 | Gate de troca forçada: sessão local pendente permanece autenticada, mas contida; rotas guardadas dão 403 `PASSWORD_CHANGE_REQUIRED`; `GET /` redireciona para `/trocar-senha`; isenções estreitas; Entra nunca carrega o flag.                             |
| D32 | Backfill de senha compartilhada e importação por pessoa: senha distinta por usuário, hash individual, flag de troca, arquivo 0600; backfill idempotente e dry-run por padrão.                                                                              |
| D33 | Settings é um workspace centralizado de aproximadamente 1180 px por 88 dvh, com rail fixo, coluna com scroll e uma coluna em telas pequenas sem scroll horizontal; managers admin em chunk lazy com gate fail-closed.                                      |
| D34 | Padrão de batch: um POST admin por recurso; limites de 500 usuários, destinatários e regras, 200 grupos com 500 ids relacionados e 20.000 no produto cartesiano; transação única, guardas de último admin, revogação de sessões e resposta `{ affected }`. |
| D35 | Batch usa `ValidationError` tipado, mapeado para 400; demais erros viram 500 `INTERNAL` sem texto de banco; ids validados com `Number.isSafeInteger`; aliases removidos.                                                                                   |
| D36 | `Causa da Disponibilidade` deriva em leitura de `barrier_status_history.note` e `barriers.comments`, sem persistir ordens brutas nem criar campos de API; limitação: só o evento decisivo é armazenado.                                                    |

## 8. Invariantes e guardas que nunca podem ser removidos

As guardas abaixo são parte do contrato de segurança, integridade ou compatibilidade. Removê-las para ganhar velocidade, simplificar código ou esconder instabilidade é proibido (`agents.md` seções 4 e 6).

| Invariante                                        | O que garante                                                                                    | Onde vive                                                           |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| Escrita de status só por `record_status_change()` | histórico, `status_since` e auditoria coerentes; nenhuma atualização direta de `availability_id` | `db/schema.sql`, `lib/server/sql/barriers.ts`                       |
| `guard_availability_write()`                      | rejeita `UPDATE barriers.availability_id` fora do GUC `app.status_write = 'on'`                  | `db/schema.sql`                                                     |
| Disponibilidade efetiva única                     | filtros, KPI, gráfico, vocabulários, contingências e stale alerts concordam                      | `db/schema.sql`, D23                                                |
| Trigger de conformidade                           | `compliance_id` sempre espelha o status efetivo, inclusive em linhas antigas                     | `db/schema.sql`                                                     |
| Escopo de estação fail-closed                     | não administrador sem grupo vê zero; `null` é só admin                                           | `lib/server/auth.ts`, `lib/server/sql/where.ts`                     |
| Sessão opaca com hash                             | token bruto nunca é armazenado; revogação é imediata                                             | `lib/server/auth/session.ts`, `lib/server/sql/sessions.ts`          |
| Login local indisponível para desligar            | caminho break-glass sempre existe                                                                | `lib/server/config.ts`                                              |
| Gate de troca forçada                             | senha temporária não vira acesso permanente                                                      | `lib/server/auth.ts`, D31                                           |
| `manual_fields` e checagem dentro do UPDATE       | edição administrativa não é revertida pelo sync, nem em corrida                                  | `lib/server/sql/sync-apply.ts`, D20, D24                            |
| Propriedade de status pelo autor do histórico     | transição administrativa não é sobrescrita no sweep seguinte                                     | `lib/server/sql/sync-apply.ts`                                      |
| `external_code` único e não nulo                  | reconciliação idempotente do sync                                                                | `db/schema.sql`                                                     |
| Soft delete e `is_active`                         | nada é apagado fisicamente; histórico sobrevive                                                  | `db/schema.sql`, `docs/DATABASE.md`                                 |
| Lock de sobreposição de sync                      | dois pollers não escrevem ao mesmo tempo                                                         | `db/schema.sql`, `lib/server/sql/sync.ts`                           |
| Heartbeat em `finished_at`                        | sweep lento vivo não expira o próprio lock                                                       | `lib/server/sql/sync.ts`, `lib/server/fracttal/sync.ts`             |
| `assertCompletePage`                              | página de itens truncada aborta antes de qualquer escrita                                        | `lib/server/fracttal/sync.ts`                                       |
| Bucket adaptativo e backoff                       | nunca excede o teto upstream e reage a 406, 429 e 5xx                                            | `lib/server/fracttal/adaptive-rate.ts`                              |
| Dedup de alerta com id do histórico               | dois landings reais no mesmo dia não colapsam                                                    | `lib/server/alerts/store.ts`, D23                                   |
| Dead-letter parking                               | falha persistente não é reenviada para sempre                                                    | `lib/server/alerts/store.ts`, `lib/server/alerts/run-provider.ts`   |
| Watermark por `alert_events`                      | rerun não perde transição nem duplica evento                                                     | `lib/server/sql/alerts.ts`                                          |
| Audiência derivada e filtro por estação           | alerta chega só a quem enxerga a estação; lista legada não controla entrega                      | `lib/server/sql/alert-audience.ts`, `lib/server/alerts/audience.ts` |
| Parada planejada suprimida                        | `Fora de Operação` não pagina como violação                                                      | `lib/server/alerts/provider.ts`                                     |
| Teto e lote de exportação                         | uma exportação não derruba a memória nem mente sobre o volume                                    | `lib/export/limits.ts`                                              |
| Throttles por cliente                             | orçamento de leitura, escrita, senha, exportação e raw                                           | `lib/server/throttle.ts`                                            |
| Guarda de mesma origem                            | escrita cross-site explícita é recusada                                                          | `docs/API.md`                                                       |
| Camuflagem de negação                             | anônimo recebe 404, credencial morta 401, sem permissão 403                                      | `lib/server/auth.ts`                                                |
| Envelope de erro sem vazamento                    | nunca inclui stack, SQL, env ou internals                                                        | `lib/server/errors.ts`                                              |
| Segredos fora da imagem                           | ambiente ou arquivo montado somente leitura                                                      | `agents.md` seção 6, `compose.yml`                                  |
| Contratos públicos                                | rotas, wire, filtros, enums, 30 colunas, dedup, `localStorage`, `.env.example`                   | `agents.md` seção 5                                                 |
| Schema aditivo e reexecutável                     | migração roda em banco existente sem perder dados                                                | `scripts/migrate.ts`, `scripts/check-migration-order.ts`            |
| Guarda de ordem de migração                       | índice não nasce antes da coluna; referência não aponta tabela futura                            | `scripts/check-migration-order.ts`                                  |
| Fixtures sintéticas                               | teste e desenvolvimento não usam dado pessoal de produção                                        | `agents.md` seção 6, `scripts/fixtures/README.md`                   |
| Skip visível de teste de banco                    | ausência de `DATABASE_URL` não vira falso verde silencioso                                       | `lib/server/sql/*_integration_test.ts`                              |

## 9. Limitações, lacunas e divergências

### 9.1 Limitações conhecidas

| Limitação                                                            | Consequência                                                                                           | Fonte                                                              |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------ |
| Sem Row-Level Security                                               | uma conexão SQL direta vê todas as linhas; o escopo é só da aplicação                                  | `db/schema.sql`, `docs/DATABASE.md`                                |
| Fracttal somente leitura                                             | não há write-back, webhook ou sincronização bidirecional; a atualização é por polling                  | `docs/FRACTTAL.md`                                                 |
| Sem filtro de estação no upstream                                    | o sweep é do tenant inteiro e a estação é resolvida no cliente                                         | `lib/server/fracttal/live-scope.ts`, `docs/FRACTTAL.md`            |
| Limite upstream de aproximadamente 200 requisições por minuto por IP | o bucket clampa o máximo em 200                                                                        | `lib/server/fracttal/adaptive-rate.ts`                             |
| Página de item truncada                                              | a run aborta antes de escrever, por guarda de mass-delete                                              | `lib/server/fracttal/sync.ts`                                      |
| Página de trabalho truncada                                          | perde sinal, mas não apaga linha; não aborta                                                           | `lib/server/fracttal/live-scope.ts`                                |
| Requisições sempre em janela                                         | não há varredura aberta documentada para requisições; a completude vem do sweep aberto de ordens       | `lib/server/fracttal/live-scope.ts`                                |
| Sem notificação de falha de sync por e-mail                          | falha fica em console e em `sync_state`                                                                | `docs/FRACTTAL.md`                                                 |
| Sem SMTP local e sem digest local                                    | entrega, retry, template e opt-out são do provedor                                                     | `DECISIONS.md` D25                                                 |
| Sem relatórios agendados                                             | exportação é sob demanda e usa a seleção                                                               | `docs/USO.md`                                                      |
| Interface somente pt-BR                                              | não há seletor de idioma                                                                               | `docs/USO.md`                                                      |
| Aparência e filtros padrão no navegador                              | não há persistência server-side dessas preferências                                                    | `docs/ARCHITECTURE.md`                                             |
| Senha temporária sem expiração                                       | mitigada pelo gate de troca forçada                                                                    | `DECISIONS.md` D30                                                 |
| Provedor deduplica por conta e tipo                                  | um segundo aviso do mesmo tipo pode ser engolido; a tela ainda mostra a senha uma vez                  | `lib/server/alerts/account-notice.ts`, D30                         |
| `Causa da Disponibilidade` limitada ao evento decisivo               | ordens concorrentes não podem ser reconstruídas                                                        | `DECISIONS.md` D36                                                 |
| Import assume `available = true`                                     | a semântica da coluna no dump não foi verificada; status vem dos eventos e da data de fora de operação | `docs/FRACTTAL.md`                                                 |
| Sem curadoria de linha mal classificada                              | toda linha com estação e categoria resolvidas entra; a correção é upstream                             | `docs/FRACTTAL.md`                                                 |
| Criticidade não parseável vira D com warning                         | não há skip silencioso, mas o rank pode ficar impreciso                                                | `lib/server/fracttal/barrier-rules.ts`                             |
| Rank desconhecido no catálogo                                        | skip alto e barulhento                                                                                 | `lib/server/fracttal/map.ts`                                       |
| Estação ou categoria desconhecida                                    | dry-run e audit listam; `--apply` cria a linha antes do mapeamento                                     | `lib/server/fracttal/map.ts`, `scripts/fracttal-audit-stations.ts` |
| Dois pollers não podem sobrepor                                      | lease por escopo; run travado bloqueia até a janela de stale                                           | `db/schema.sql`, `docs/FRACTTAL.md`                                |
| `xlsx@0.18.5` com advisory aceito                                    | prototype pollution e ReDoS; usado só por `scripts/geral-coverage.ts`                                  | `docs/ARCHITECTURE.md`                                             |
| Throttle em memória é por processo                                   | deploy multi-isolate deve usar `lib/server/sql/throttle.ts`                                            | `lib/server/throttle.ts`                                           |
| Sem JIT de Entra                                                     | conta não provisionada não entra                                                                       | `docs/ARCHITECTURE.md`                                             |
| Grupos Entra não mapeados                                            | papéis locais continuam autoritativos                                                                  | `docs/ARCHITECTURE.md`                                             |
| Sem helper de restore                                                | restore é manual e destrutivo                                                                          | `docs/DEPLOY-WINDOWS.md`                                           |
| Sem endpoint de audiência                                            | audiência é derivada internamente                                                                      | `docs/API.md`                                                      |
| Sem métricas ou telemetria                                           | observabilidade é log, `sync_state`, `alert_events` e sondas de saúde                                  | `agents.md` seção 2                                                |
| `alert_events` sem rotina de retenção no código                      | a tabela cresce com o histórico de eventos; retenção precisa de decisão operacional                    | `db/schema.sql`                                                    |

### 9.2 Divergências entre documentação e código

As divergências abaixo foram verificadas no código desta revisão. Quando a documentação e o código discordam, o comportamento descrito é o do código.

Os rótulos DV1 a DV15 identificam divergências deste documento e não são decisões de `DECISIONS.md`, cujos ids são D01 e D20 a D37.

#### DV1. Contagem de `OWNABLE_FIELD_KEYS`: 24, não 25

O dossiê de integrações menciona 25 chaves, mas `lib/field-ownership.ts` define **24**: `tag`, `locationId`, `typologyId`, `categoryId`, `groupingId`, `ownerId`, `criticalityId`, `comments`, `actionPlan`, `origin`, `installLocal`, `equipTypology`, `fieldInstalled`, `fieldOperational`, `opStatus`, `hasMaintPlan`, `planFollowed`, `failureFree`, `maintStatus`, `hasContingency`, `contingencyDesc`, `evidenceCode`, `degradationDesc` e `extraComments`. O teste `lib/field-ownership_test.ts` também confirma que toda chave apropriável tem coluna e origem no Fracttal. A contagem correta é 24, e este documento usa 24.

#### DV2. Contagem de `SIGNATURE_FIELD_KEYS`: 27, não 28

O dossiê de integrações menciona 28 chaves, mas `lib/server/fracttal/sync.ts` define **27**, incluindo `locDescId`, `isActive` e `scopeSource`, que não são apropriáveis. A ordem é contrato com a assinatura armazenada, e o comentário no próprio arquivo diz que a ordem não pode mudar sem atualizar o outro lado. A contagem correta é 27.

#### DV3. `FRACTTAL_SYNC_MAX_PAGES`: três defaults

| Lugar                                        | Valor                                                       |
| -------------------------------------------- | ----------------------------------------------------------- |
| `.env.example`                               | 200, comentado                                              |
| `scripts/fracttal-poll.ts`                   | 250 quando a env não existe, com piso 1 e sem teto superior |
| `scripts/fracttal-sync.ts` (`--pages`)       | 200, com clamp entre 1 e 400                                |
| `scripts/fracttal-force-sync.ts` (`--pages`) | 400, com clamp entre 1 e 400                                |

Não existe um único default. O valor efetivo depende do processo. O poller é o único que não aplica teto superior no parse da env; a guarda de página completa ainda impede que uma página truncada seja aplicada. Uma padronização exige decisão do dono, porque mudar o default do poller muda a carga upstream.

#### DV4. `notify_immediate` não torna o envio imediato

`notify_immediate` é apresentado como imediato versus digest pelo nome do campo, pelo mapa `Digest` de `docs/GLOSSARY.md` (`notify_immediate = false`), pela lista de colunas em `docs/DATABASE.md` e pelo comentário de `lib/server/sql/alert_rules.ts`. O código persiste o campo, coloca o valor em `payload.immediate` e o usa para escolher a regra, mas o `despachar_agora` do provedor vem exclusivamente de `mapLanding(statusId)`, que só é verdadeiro para status 5 (`lib/server/alerts/provider.ts`, `lib/server/alerts/immediate.ts`, `lib/server/alerts/rules.ts`). Regras com `notify_immediate = true` sobre status 4, 3, 2 ou 0 não tornam o POST imediato; o evento fica enfileirado para o próximo ciclo. A documentação deve ser corrigida ou a funcionalidade deve ser implementada; o comportamento atual é o do código.

#### DV5. Chave de deduplicação: a documentação omite o id do histórico

`docs/DATABASE.md` descreve `dedup_key` único por barreira, data de transição e status. O código inclui o id da linha de histórico quando ele existe: `barrierId:date:statusId[:historyId]` (`lib/server/alerts/store.ts`, `lib/server/alerts/detect.ts`). A inclusão é intencional e está em D23: distingue dois landings reais do mesmo status no mesmo dia. A documentação do banco está desatualizada nesse ponto.

#### DV6. `status_since` no sync live versus importação

A documentação diz que a data do evento mais antiga dirige `status_since` e que, sem data, cai para hoje (`docs/FRACTTAL.md`). O import grava a data derivada (`scripts/fracttal-import.ts`). O sync live calcula `statusSince` na regra pura, mas o caminho de aplicação chama `record_status_change()` sem esse valor, e a função grava `current_date` (`lib/server/sql/sync-apply.ts`, `db/schema.sql`). Consequência: em transições do sync live, `Desde`, filtros de período e `stale_days` usam a data do processamento, não a data do evento upstream. É uma divergência de comportamento, não apenas de texto.

#### DV7. Elegibilidade de contingência usa status armazenado

D23 afirma que a disponibilidade efetiva dirige contingências. A elegibilidade em `lib/server/sql/contingencies.ts` usa o status **armazenado** (`a.id = 0` sobre `c.availability_id`) e `is_compliant`, tanto na listagem quanto na criação. Uma barreira armazenada como 4 ou 5 com `has_contingency = Sim` é exibida como 3 ou 2 e conforme, mas não é elegível como contingência. O comportamento é consistente com a regra de negócio atual, mas não com a redação de D23.

#### DV8. No-op de mesmo status não está na função SQL

`docs/STATUSES.md`, `docs/DATABASE.md` e `docs/FRACTTAL.md` afirmam que `record_status_change()` não insere histórico quando o status novo é igual ao atual. A função em `db/schema.sql` **não** verifica igualdade: ela sempre atualiza `availability_id` e `status_since` e insere uma linha de histórico. O no-op real está em `transitionBarrierStatus()`, que bloqueia a linha e retorna sem chamar a função, e no early return da rota de status (`lib/server/sql/barriers.ts`, `routes/api/barriers/[id]/status.ts`). Uma chamada SQL direta à função com o mesmo status cria uma linha de histórico extra. Para o usuário, o efeito observável é o documentado; para quem escreve SQL direto, não é.

#### DV9. Comentário de escopo obsoleto no parser

`lib/server/fracttal/barrier-rules.ts` tem um comentário que diz que escopo vazio faria o sync pular a linha. O comportamento implementado é o oposto: o escopo é totalmente aberto, toda linha com código entra quando estação e categoria resolvem, e `scope_source` vira `all` quando nenhum gate casa (`lib/server/fracttal/map.ts`, `docs/FRACTTAL.md`). O comentário é legado e não deve ser usado como contrato.

#### DV10. Follow-up de plano preventivo é comportamento do import

`docs/FRACTTAL.md` descreve que o acompanhamento de plano preventivo usa o par de datas de manutenção agendada no import, para não marcar plano futuro como atrasado. O caminho live usa a data do evento corretivo para o preventivo e não tem par agendado equivalente (`lib/server/fracttal/work.ts`). A afirmação vale apenas para o import.

#### DV11. Audit de estações: exit 1 por estação desconhecida

`docs/FRACTTAL.md` diz que o audit sai 1 em falha de auditoria de estação. O código também sai 1 por `unknown-station`, que é uma estação nova a triar, não necessariamente uma falha. O próprio script chama isso de triagem antes de aplicar (`scripts/fracttal-audit-stations.ts`).

#### DV12. `AUTH_ENTRA_CLIENT_ASSERTION_ALG` fora do `.env.example`

A variável é lida em `lib/server/config.ts`, com default `RS256` e `PS256` aceito, mas não aparece em `.env.example`. O mesmo padrão vale para `APP_ENV`, `ADMIN_PASSWORD`, `SEED_FORCE`, `LEGACY_SHARED_PASSWORD` e `CHROME_NO_SANDBOX`, que são lidas por scripts ou deploy e não estão no exemplo. Isso não quebra boot, mas reduz a descoberta.

#### DV13. Topologia de produção APP10 documentada

A documentação versionada descreve agora a topologia APP10 como padrão: PostgreSQL 18 no diretório vendorizado, base `monitor`, serviços com prefixo `SeaMonitor` (`SeaMonitorApp`, `SeaMonitorPoller`, `SeaMonitorAlerts`, `SeaMonitorCaddy`) e tarefa de backup `BarrierBackup`. O layout legado `Barrier*` permanece disponível via `-ServicePrefix Barrier`, e o EDB PostgreSQL 16 é o fallback quando o diretório vendorizado não existe. O relato operacional de handoff de 16/11/2026, que descrevia a mesma topologia, deixa de ser divergente; a divergência residual é apenas o prefixo legado e a versão do PostgreSQL no fallback (`docs/DEPLOY-WINDOWS.md`, `docs/PORT-MAP.md`, `deploy/windows/Setup-Production.ps1`).

#### DV14. Handoff desatualizado sobre `CO`, `SM8` e senha padrão

O mesmo relato diz que 14 usuários não foram importados porque as estações `CO` e `SM8` não existiam no catálogo, e fala em senha padrão. O código atual contém os aliases `SM8` e `CO` (D27) e gera senha por pessoa com `generateTemporaryPassword()` e troca obrigatória (`routes/api/users.ts`, D30, D32). A pendência de dados pode estar desatualizada; a validação exige consultar o catálogo real e reprocessar o roster.

#### DV15. Grupo `Acesso geral` não recria vínculos em migração

A migração mantém apenas a linha do grupo `Acesso geral`; ela não (re)inscreve usuários nem (re)concede estações, então remoções feitas por um administrador persistem entre execuções de `db:migrate` (`db/schema.sql`). A tensão anterior entre compatibilidade de migração e fail-closed de D21 deixa de existir para esse grupo.

### 9.3 O que foi verificado nesta revisão

| Verificação                           | Resultado                                                                                                                    |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `OWNABLE_FIELD_KEYS`                  | 24 chaves, conferidas por leitura do array e por teste                                                                       |
| `SIGNATURE_FIELD_KEYS`                | 27 chaves, conferidas por leitura do array                                                                                   |
| `FIELD_COLUMNS`                       | 24 entradas, uma por chave apropriável                                                                                       |
| defaults de `FRACTTAL_SYNC_MAX_PAGES` | 200 no `.env.example`, 250 no poller, 200 no sync, 400 no force-sync                                                         |
| `notify_immediate`                    | persistido em `payload.immediate`; `despachar_agora` só é verdadeiro para status 5                                           |
| `dedup_key`                           | inclui `:historyId` quando o id existe                                                                                       |
| `record_status_change()`              | grava `current_date`; não há checagem de mesmo status                                                                        |
| import de dump                        | grava `status_since` e `date` a partir de `s.statusSince`                                                                    |
| elegibilidade de contingência         | usa `c.availability_id = 0`, não a disponibilidade efetiva                                                                   |
| número de tabelas                     | 25 `create table if not exists` em `db/schema.sql`                                                                           |
| arquivos de teste                     | 105 arquivos `*_test.ts`, contados nesta revisão                                                                             |
| testes direcionados executados        | 86 aprovados, 0 falhas, em sync, regras de barreira, regras de alerta, provider, envio imediato e indicador de sincronização |
| suíte completa                        | não executada neste worktree por ausência de `node_modules`; snapshot anterior registra 743 aprovados e 23 skips             |

## 10. Pendências operacionais e decisões que exigem o dono

Os itens abaixo não são bugs de código comprovados. São decisões de negócio, operação ou contrato que o time de engenharia não deve tomar sozinho, porque mudam risco, carga upstream, acesso de pessoas ou semântica de alerta. Cada item traz o que se sabe, por que importa, quem decide e qual evidência coletar antes de decidir.

### 10.1 Escopo da regra de alerta id 1

**O que se sabe.** Um relato operacional de handoff de 16/11/2026, não versionado neste repositório, descreve uma única regra de produção com `id = 1`, nome associado a barreira violada crítica sem plano de ação, `critical_only = true`, `to_status_id = 5` e `only_no_action_plan = true`. O mesmo relato afirma que 15 barreiras ESO ou A caíram em Indisponível desde 12/11, todas com plano de ação, resultando em `detected = 1`, `enqueued = 0` e watermark parado em 12/11. O código confirma a semântica: uma regra com esses campos só casa landing 5, criticidade ESO ou A e barreira sem plano; barreira com plano é excluída por `only_no_action_plan` (`lib/server/alerts/rules.ts`). A detecção também exige barreira ativa e não excluída (`lib/server/alerts/detect.ts`).

**Por que importa.** O sistema pode estar correto e ainda assim produzir zero alertas em um cenário de indisponibilidade real, porque o filtro de plano de ação exclui justamente as barreiras já tratadas. Isso é uma escolha de negócio, não uma falha do motor. Se a operação espera alerta para toda barreira crítica indisponível, a regra precisa mudar.

**Quem decide.** O dono da operação de barreiras, com apoio de SMS e do administrador do monitor. Engenharia apenas executa a mudança e registra a decisão.

**Evidência a coletar.** Ler a regra efetiva (`select ... from alert_rules where id = 1`); contar landings 5 no período por criticidade e por presença de plano; contar `alert_events` com `payload->>'ruleId' = '1'`; conferir o watermark real (`max(transition_date)`); comparar `detected` e `enqueued` nos logs do ciclo. Se a decisão for ampliar, registrar o novo escopo e o motivo em `DECISIONS.md` antes do `UPDATE`.

### 10.2 Reimportação do roster com estações `CO` e `SM8`

**O que se sabe.** O mesmo relato operacional afirma que 14 pessoas não foram importadas porque as estações `CO` (10) e `SM8` (4) não existiam no catálogo. O código atual já contém os aliases `CO` e `SM8` (D27), e o importador de usuários resolve tokens de estação contra o catálogo e sai 1 no modo `--check` quando algum token é desconhecido (`scripts/import-users.ts`). A importação real cria grupos de acesso com o conjunto exato de estações e senha temporária por pessoa, com troca obrigatória.

**Por que importa.** Pessoas ausentes do roster não entram, não enxergam as estações corretas e não recebem alertas. Como a audiência é derivada dos grupos de acesso, um roster incompleto silencia exatamente as estações afetadas. O alias no código não garante que a linha de catálogo exista no banco de produção antes do próximo sync; a ordem correta é migrar, sincronizar e só então importar.

**Quem decide.** O administrador do monitor, com o dono da operação validando a lista de pessoas e estações. Engenharia não deve reimportar contra audiência real sem autorização da tarefa corrente.

**Evidência a coletar.** Listar os códigos de estação do catálogo; rodar `import:users:check` em dry-run contra uma cópia do roster; comparar o conjunto de estações esperado com o grupo criado; conferir `allowedLocationIds` de uma conta de teste; verificar se `CO` e `SM8` aparecem em `locations` após `db:migrate` e o primeiro sync. Não imprimir nomes, e-mails ou telefones no relatório.

### 10.3 Grupo `Acesso geral` e o escopo de estações

**O que se sabe.** A migração cria apenas a linha do grupo `Acesso geral`; ela não inscreve usuários nem concede estações, e `db:migrate` não desfaz remoções feitas por um administrador (`db/schema.sql`). O grupo pode ser usado manualmente para dar acesso amplo, mas não é recriado automaticamente.

**Por que importa.** O fail-closed de D21 segue valendo: um usuário sem grupo vê zero estações, e uma remoção de vínculo persiste entre migrações. O risco residual é operacional: se alguém inscrever usuários nesse grupo, eles passam a ver todas as estações e a receber alertas de todas elas.

**Quem decide.** O dono da operação e o administrador do monitor. O grupo permanece disponível para uso deliberado; a exposição depende da inscrição manual, não da migração.

**Evidência a coletar.** Contar membros do grupo antes e depois de uma migração em banco de teste; listar as estações do grupo; verificar `allowedLocationIds` de uma conta não administradora; comparar o conjunto de estações do grupo com o esperado por pessoa. Não expor e-mails no relatório; usar apenas contagens e ids.

### 10.4 Três defaults de `FRACTTAL_SYNC_MAX_PAGES`

**O que se sabe.** `.env.example` comenta 200; o poller usa 250 quando a variável não existe, com piso 1 e sem teto superior no parse; o `fracttal:sync` usa 200 no `--pages`, com clamp entre 1 e 400; o `fracttal:force-sync` usa 400, com o mesmo clamp (`scripts/fracttal-poll.ts`, `scripts/fracttal-sync.ts`, `scripts/fracttal-force-sync.ts`). A guarda de página completa aborta a run antes de qualquer escrita quando a página de itens vem truncada.

**Por que importa.** O valor efetivo depende do processo, não de uma configuração única. Um valor alto no poller aumenta a carga upstream e a duração do sweep; um valor baixo demais aborta a run por truncamento. O poller não tem teto superior, então uma variável mal configurada pode varrer muito mais do que o esperado.

**Quem decide.** O dono da operação, com o time de engenharia avaliando carga e tempo de sweep. A decisão pode ser padronizar o default, adicionar clamp no poller ou apenas documentar os três valores.

**Evidência a coletar.** Ver o valor efetivo em cada serviço sem imprimir segredos; ler a linha de boot do poller com `max_pages`; analisar `sync_state.note` por run (páginas, truncamento, duração); verificar 429 e 406 no log upstream; medir o tempo de sweep em horário de pico.

### 10.5 `notify_immediate`: corrigir a documentação ou implementar o envio

**O que se sabe.** O campo é persistido e colocado em `payload.immediate`, mas o `despachar_agora` do provedor é decidido apenas por `mapLanding(statusId)`, verdadeiro somente para status 5 (`lib/server/alerts/provider.ts`, `lib/server/alerts/immediate.ts`). Regras marcadas como imediatas sobre status 4, 3, 2 ou 0 continuam enfileiradas até o próximo ciclo. O nome do campo, o mapa `Digest` de `docs/GLOSSARY.md`, a lista de colunas em `docs/DATABASE.md` e o comentário de `lib/server/sql/alert_rules.ts` sugerem a semântica de imediato versus digest, que o provedor não implementa.

**Por que importa.** Um administrador pode acreditar que uma regra imediata entrega em segundos quando, na prática, ela espera o ciclo de 900 segundos. Em uma barreira degradada, essa diferença é operacionalmente relevante.

**Quem decide.** O dono do produto de monitoramento, com engenharia e operação. As opções são implementar o envio imediato para regras que casarem com `notify_immediate = true` (com cuidado de throttling, dedup e falha), ou documentar que o campo não tem efeito de entrega e planejar sua retirada com revisão de contrato. Remover o campo sem decisão quebra compatibilidade de wire.

**Evidência a coletar.** Listar regras com `notify_immediate = true` e `to_status_id` diferente de 5; medir a diferença entre a data da transição e `sent_at` para status 4; confirmar no payload do provedor o valor de `despachar_agora`; revisar o volume de eventos que passariam a ser postados na hora.

### 10.6 Elegibilidade de contingência: status armazenado ou efetivo

**O que se sabe.** A listagem, os candidatos e a criação de vínculo usam o status **armazenado** 0 e `is_compliant` (`lib/server/sql/contingencies.ts`). Uma barreira armazenada como 4 ou 5 com `has_contingency = Sim` é exibida como 3 ou 2 e conforme, mas não pode ser escolhida como contingência de outra. D23 afirma que a disponibilidade efetiva dirige contingências, o que não corresponde ao código.

**Por que importa.** O administrador vê uma barreira conforme na tela e não a encontra na lista de candidatas, o que parece inconsistência. Por outro lado, uma barreira que só está conforme porque tem contingência pode não ser uma cobertura real para outra barreira, e a regra atual pode ser a mais conservadora.

**Quem decide.** O dono de segurança de barreiras, com engenharia. A decisão é entre mudar o SQL para usar `effective_availability_id` e aceitar a semântica atual, documentando-a. A primeira opção é mudança de comportamento e exige testes de integração.

**Evidência a coletar.** Contar barreiras armazenadas 4 ou 5 com flag `Sim`; listar tentativas de vínculo recusadas por inelegibilidade; comparar candidatos exibidos com o conjunto que o time espera; revisar D23 e `docs/STATUSES.md` para alinhar a redação.

### 10.7 `status_since` no caminho live

**O que se sabe.** A importação grava `status_since` e a data do histórico a partir da data derivada do evento (`scripts/fracttal-import.ts`). O sync live chama `record_status_change()` sem essa data, e a função grava `current_date` (`lib/server/sql/sync-apply.ts`, `db/schema.sql`). O cálculo da data do evento existe na regra pura, mas não é propagado no caminho live.

**Por que importa.** `Desde`, filtros de período e `stale_days` usam a data de processamento, não a data do evento upstream. Uma barreira que está indisponível há dias pode parecer recém-indisponível, atrasando o lembrete de staleness; ou uma transição antiga pode ser contada no período errado. É uma diferença de auditoria e de operação.

**Quem decide.** Engenharia de dados e operação. Corrigir exige mudar a assinatura de `record_status_change()` ou o caminho de aplicação, com migração e teste; aceitar exige documentar que o live usa a data do processamento.

**Evidência a coletar.** Comparar, para uma amostra de transições live, a data do histórico com a data do evento upstream; verificar se algum lembrete de staleness disparou antes ou depois do esperado; revisar `sync_barrier_changes` e as notas de sync. Não usar dados pessoais na amostra.

### 10.8 Topologia e versão de produção

**O que se sabe.** A documentação versionada descreve a topologia APP10 como padrão: Windows nativo com PostgreSQL 18 no diretório vendorizado, base `monitor`, serviços `SeaMonitorApp`, `SeaMonitorPoller`, `SeaMonitorAlerts` e `SeaMonitorCaddy`, além da tarefa `BarrierBackup` (`docs/DEPLOY-WINDOWS.md`, `docs/PORT-MAP.md`, `deploy/windows/Setup-Production.ps1`). O layout legado `Barrier*` e o fallback EDB PostgreSQL 16 permanecem disponíveis por parâmetro. O relato de handoff de 16/11/2026 descreve a mesma topologia APP10 e deixa de ser não verificável quanto à versão, ao diretório do banco e aos nomes de serviço; a confirmação residual é a topologia efetivamente instalada no host (prefixo, diretório do banco e portas).

**Por que importa.** Runbooks, backup, restore, upgrade de versão e abertura de firewall dependem da topologia real. Seguir o documento errado pode levar a backup no diretório errado, restore em base errada ou janela de manutenção no serviço errado. A divergência de versão maior do PostgreSQL também afeta o procedimento de upgrade.

**Quem decide.** O dono da infraestrutura de produção, com o administrador do monitor. Engenharia pode reconciliar a documentação depois da confirmação.

**Evidência a coletar.** Consultar a versão e o diretório de dados do banco em produção; listar os serviços instalados e seus comandos; conferir portas e bindings; verificar o caminho da tarefa de backup; comparar o `.env` efetivo com o documentado sem imprimir segredos. Com a evidência, atualizar `docs/DEPLOY-WINDOWS.md` e `docs/PORT-MAP.md` ou registrar a exceção.

### 10.9 Ordem sugerida de decisão

1. Confirmar a topologia real (10.8), porque ela condiciona todos os demais procedimentos.
2. Resolver o acesso (10.2 e 10.3), porque sem escopo correto a leitura de alertas e de dados fica distorcida.
3. Decidir o escopo da regra de alerta (10.1) e a semântica de `notify_immediate` (10.5), que definem o que a operação efetivamente recebe.
4. Decidir as semânticas de status e contingência (10.6 e 10.7), que exigem mudança de código e migração.
5. Tratar os defaults de sync (10.4) como ajuste operacional contínuo, com medição.

## 11. Glossário PT-BR/EN e mapa de fontes

### 11.1 Glossário de identificadores

O mapa abaixo reproduz `docs/GLOSSARY.md`, que é a única fonte autorizada de tradução de identificadores. Código, wire, enums e SQL usam a forma em inglês; a interface mantém o rótulo exato em português. Não inventar variantes.

| Português (exibição)        | Identificador em inglês                          |
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

Termos técnicos usados neste documento e que não estão no glossário de interface, com a forma adotada:

| Termo                   | Forma no documento      | Observação                                         |
| ----------------------- | ----------------------- | -------------------------------------------------- |
| barreira                | `barrier`               | ativo protegido; tabela `barriers`                 |
| estação                 | `location`              | instalação operacional; tabela `locations`         |
| vínculo de contingência | `barrier_contingencies` | relação local entre barreiras                      |
| execução de sync        | `sync_state`            | uma linha por execução                             |
| alteração de sync       | `sync_barrier_changes`  | diff por barreira e execução                       |
| evento de alerta        | `alert_events`          | evento deduplicado                                 |
| chave de deduplicação   | `dedup_key`             | única em `alert_events`                            |
| watermark               | `watermark`             | maior `transition_date` em `alert_events`          |
| landing                 | `landing`               | status da linha de histórico que originou o alerta |
| dead-letter             | `dead_letter`           | evento estacionado após o orçamento de tentativas  |
| escopo de estação       | `allowedLocationIds`    | array de estações permitidas; `null` só para admin |
| campos manuais          | `manual_fields`         | colunas assumidas pelo administrador               |
| autoria de status       | `SYNC_AUTHOR_ID`        | id 10, autor de sincronização                      |

### 11.2 Manutenção deste documento

- Alterações de código que mudem regra, contrato, limite, variável de ambiente ou decisão devem atualizar este documento no mesmo commit, como exige `agents.md` seção 10.
- Decisões novas entram em `DECISIONS.md` com o próximo número livre e são refletidas na seção 7.9 deste documento.
- Divergências verificadas devem entrar na seção 9 com o comportamento do código e a recomendação, nunca apenas com a redação da documentação antiga.
- Números de teste, contagens e snapshots devem ser rotulados com a data e o comando que os produziu. Nunca apresentar um snapshot como verdade permanente.
- O documento não deve conter nomes pessoais, e-mails, tokens, cookies, connection strings ou dados de tenant.

### 11.3 Mapa de fontes

As fontes abaixo foram usadas para escrever e verificar este documento. Caminhos são relativos à raiz do repositório.

#### Runtime, configuração e entrada

| Arquivo                | Conteúdo                                                       |
| ---------------------- | -------------------------------------------------------------- |
| `deno.jsonc`           | versão 0.4.0, tarefas, import map, TypeScript, lint e fmt      |
| `deno.lock`            | versões resolvidas das dependências                            |
| `main.ts`              | boot do `App<State>`, `staticFiles()` e `fsRoutes()`           |
| `client.ts`            | import de estilos para HMR                                     |
| `vite.config.ts`       | plugin Fresh, porta 8300 e `strictPort`                        |
| `lib/server/config.ts` | configuração de servidor, sync, auth, Entra e allow-lists      |
| `lib/server/db.ts`     | pool, TLS, statement timeout, retry de leitura e identidade    |
| `lib/company.ts`       | `COMPANY_NAME` por requisição                                  |
| `.env.example`         | inventário de variáveis de ambiente                            |
| `docs/PORT-MAP.md`     | portas e bindings                                              |
| `docs/ARCHITECTURE.md` | runtime, camadas, autenticação, escopo, alertas, sync e deploy |

#### Dados e schema

| Arquivo                            | Conteúdo                                                                                    |
| ---------------------------------- | ------------------------------------------------------------------------------------------- |
| `db/schema.sql`                    | 25 tabelas, funções, triggers, índices e backfills                                          |
| `db/seed_lookups.sql`              | lookups estáticos, incluindo status, criticidade, agrupamentos, tipologias, donos e autores |
| `db/cleanup-unused-auth.sql`       | limpeza de auth aplicada na migração                                                        |
| `scripts/migrate.ts`               | ordem de migração, transações e `schema_migrations`                                         |
| `scripts/seed.ts`                  | seed de demonstração, destrutivo com `--force`                                              |
| `scripts/check-migration-order.ts` | guarda estática de ordem de índice e tabela                                                 |
| `docs/DATABASE.md`                 | tabelas, relações, funções, triggers e diagnóstico                                          |
| `lib/server/sql/where.ts`          | filtros, whitelist de ordenação e escopo                                                    |
| `lib/server/sql/barriers.ts`       | leitura, página, update e transição de status                                               |
| `lib/server/sql/sync-apply.ts`     | aplicação do plano de sync, chunks e propriedade                                            |
| `lib/server/sql/contingencies.ts`  | vínculos, candidatos e elegibilidade                                                        |
| `lib/server/sql/kpi.ts`            | snapshot de KPI                                                                             |
| `lib/server/sql/chart.ts`          | agregação do gráfico                                                                        |
| `lib/server/sql/vocabularies.ts`   | vocabulários e memo de labels                                                               |
| `lib/server/sql/sync-status.ts`    | estado do indicador de sync                                                                 |
| `lib/server/sql/sync-read.ts`      | leitura de runs e alterações                                                                |
| `lib/server/sql/alert-audience.ts` | audiência derivada                                                                          |
| `lib/server/sql/alerts.ts`         | watermark, transições, enqueue, envio e dead-letter                                         |
| `lib/server/sql/alert_rules.ts`    | persistência e validação de regras                                                          |
| `lib/server/sql/recipients.ts`     | lista legada de destinatários                                                               |
| `lib/server/sql/users.ts`          | usuários, bind Entra e guards de último admin                                               |
| `lib/server/sql/sessions.ts`       | sessões, hash e revogação                                                                   |
| `lib/server/sql/access-groups.ts`  | grupos, vínculos e escopo por usuário                                                       |

#### API, autenticação e segurança

| Arquivo                                                                          | Conteúdo                                                            |
| -------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| `routes/_middleware.ts`                                                          | cache, compressão, CSP, HSTS e cabeçalhos                           |
| `routes/index.tsx`                                                               | gate de sessão e troca de senha na página inicial                   |
| `routes/login.tsx`                                                               | página de login                                                     |
| `routes/trocar-senha.tsx`                                                        | página de troca obrigatória                                         |
| `routes/api/_params.ts`                                                          | parsers compartilhados de filtros e ids                             |
| `routes/api/barriers*.ts`                                                        | leitura, detalhe, status, contingências, deleted, raw e sync-detail |
| `routes/api/kpi.ts`, `chart.ts`, `vocabularies.ts`, `lookups.ts`                 | agregados e vocabulários                                            |
| `routes/api/export.ts`                                                           | exportação CSV, XLSX e PDF                                          |
| `routes/api/users*.ts`, `access-groups*.ts`, `recipients*.ts`, `alert-rules*.ts` | administração e batches                                             |
| `routes/api/auth/*`                                                              | login, logout, me, password e profile                               |
| `routes/auth/entra/*`                                                            | login, callback, front-channel logout e logged-out                  |
| `lib/server/auth.ts`                                                             | guards, escopo, camuflagem e gate de senha                          |
| `lib/server/auth/session.ts`                                                     | token opaco, cookie e TTL                                           |
| `lib/server/auth/password.ts`                                                    | PBKDF2, política e senha temporária                                 |
| `lib/server/auth/entra/*`                                                        | claims, fluxo OIDC e validação                                      |
| `lib/server/errors.ts`                                                           | envelope de erro e request id                                       |
| `lib/server/validation.ts`                                                       | leitura de corpo, limites e validação                               |
| `lib/server/throttle.ts`                                                         | throttles por cliente e proxy confiável                             |
| `docs/API.md`                                                                    | rotas, auth levels, política de requisição, filtros e erros         |

#### Exportação

| Arquivo                                                                                        | Conteúdo                                            |
| ---------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| `lib/export/columns.ts`                                                                        | 30 cabeçalhos na ordem compartilhada                |
| `lib/export/rows.ts`                                                                           | mapeamento de linha para as 30 colunas              |
| `lib/export/limits.ts`                                                                         | teto de 200.000, lote de 5.000 e mensagem de recusa |
| `lib/server/exportRows.ts`, `exportStream.ts`, `exportCsv.ts`, `exportXlsx.ts`, `exportPdf.ts` | streaming e builders                                |
| `routes/api/export.ts`                                                                         | contrato HTTP da exportação                         |

#### Sincronização Fracttal

| Arquivo                                                                                        | Conteúdo                                                       |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| `lib/server/fracttal/client.ts`                                                                | GET, OAuth, timeout, retries, parsing estrito e raw            |
| `lib/server/fracttal/token.ts`                                                                 | cache single-flight e refresh                                  |
| `lib/server/fracttal/adaptive-rate.ts`                                                         | bucket AIMD e headers de rate                                  |
| `lib/server/fracttal/barrier-rules.ts`                                                         | escopo, estação, tipologia, criticidade, status e contingência |
| `lib/server/fracttal/map.ts`                                                                   | mapeamento de ativo, catálogo e notas                          |
| `lib/server/fracttal/work.ts`                                                                  | parsing de ordens e requisições, abertura e datas              |
| `lib/server/fracttal/sync.ts`                                                                  | plano de reconciliação, assinatura, run e guarda de página     |
| `lib/server/fracttal/live-scope.ts`                                                            | paginação, sweep de itens e work                               |
| `lib/server/fracttal/cycle.ts`                                                                 | ciclo, jitter e shutdown                                       |
| `lib/server/fracttal/runner.ts`                                                                | contenção de lock e resultado do ciclo                         |
| `lib/server/fracttal/raw-detail.ts`                                                            | detalhe raw para o painel DEV                                  |
| `lib/server/fracttal/anonymize.ts`                                                             | anonimização de captura                                        |
| `scripts/fracttal-poll.ts`, `fracttal-sync.ts`, `fracttal-force-sync.ts`, `fracttal-import.ts` | operação de sync                                               |
| `scripts/fracttal-audit-stations.ts`, `fracttal-capture.ts`, `fracttal-extract.ts`             | auditoria, captura e amostra                                   |
| `docs/FRACTTAL.md`                                                                             | endpoints, hierarquia, status, sync, limites e import          |

#### Alertas

| Arquivo                                                                 | Conteúdo                                              |
| ----------------------------------------------------------------------- | ----------------------------------------------------- |
| `lib/server/alerts/rules.ts`                                            | casamento puro, prioridade, janelas, urgência e stale |
| `lib/server/alerts/detect.ts`                                           | detecção, landing, origem e dedup                     |
| `lib/server/alerts/audience.ts`                                         | filtro de audiência por estação                       |
| `lib/server/alerts/store.ts`                                            | contrato de store, dedup key, dead-letter e delivered |
| `lib/server/alerts/provider.ts`                                         | MSGFLOW, landing map, payload e retryable             |
| `lib/server/alerts/run-provider.ts`                                     | ciclo, anti-ruído, envio, dead-letter e stale         |
| `lib/server/alerts/immediate.ts`                                        | enfileiramento e envio imediato real                  |
| `lib/server/alerts/status-fanout.ts`                                    | fan-out best-effort após commit                       |
| `lib/server/alerts/enrich.ts`                                           | detalhe do payload                                    |
| `lib/server/alerts/account-notice.ts`                                   | avisos de conta                                       |
| `scripts/alerts-poll.ts`, `alerts-check.ts`, `alerts-provider-check.ts` | operação de alertas                                   |

#### UI, domínio e preferências

| Arquivo                        | Conteúdo                                                        |
| ------------------------------ | --------------------------------------------------------------- |
| `islands/Dashboard.tsx`        | raiz hidratada                                                  |
| `islands/dashboard/*`          | seções, KPI, NcAlert, chrome e erro de servidor                 |
| `islands/BarrierEditor*.tsx`   | editor de barreira                                              |
| `components/*`                 | tabela, gráfico, filtros, modal, header, settings, loading e UI |
| `components/settings/*`        | workspace, páginas e managers admin                             |
| `hooks/*`, `hooks/dashboard/*` | estado, persistência, seleção, export e sync                    |
| `context/*`                    | settings, tema e storage                                        |
| `lib/api.ts` e `lib/api/*`     | única entrada de dados do cliente                               |
| `lib/dashboard/*`              | KPI, gráfico, urgência, filtros e ordenação do cliente          |
| `lib/resolve.ts`               | wire para domínio, conformidade e fallbacks                     |
| `lib/enums/*`                  | ids de status, criticidade, taxonomia e localização             |
| `lib/field-ownership.ts`       | 24 campos apropriáveis e origem no Fracttal                     |
| `lib/status-explanation.ts`    | `Causa da Disponibilidade`                                      |
| `lib/sync-indicator.ts`        | saúde, rótulos e deltas de sync                                 |
| `static/styles.css`            | workspace, responsividade, temas e acessibilidade               |
| `docs/USO.md`                  | manual do usuário em pt-BR                                      |
| `docs/GLOSSARY.md`             | mapa único PT-BR para EN                                        |
| `docs/STATUSES.md`             | definição de status e conformidade                              |

#### Implantação

| Arquivo                                            | Conteúdo                                                      |
| -------------------------------------------------- | ------------------------------------------------------------- |
| `compose.yml`                                      | serviços, imagens pinadas, volumes, healthchecks e portas     |
| `compose.dev.yml`                                  | override de desenvolvimento e serviço de migração             |
| `compose.external.yml`                             | uso com banco externo e `host.docker.internal`                |
| `Dockerfile`                                       | dois estágios, poda de toolchain e `deno check --cached-only` |
| `deploy/check-compose-prod.sh`                     | guarda de senha e de binding loopback                         |
| `deploy/windows/Setup.cmd`, `Setup-Production.ps1` | instalador Windows idempotente                                |
| `deploy/windows/Register-Services.ps1`             | serviços NSSM                                                 |
| `deploy/windows/Backup-Database.ps1`               | backup diário e retenção                                      |
| `deploy/windows/Caddyfile`                         | proxy TLS, headers e `X-Real-IP`                              |
| `docs/DEPLOY-WINDOWS.md`                           | instalação, firewall, upgrade, backup e restore               |

#### Qualidade, testes e decisões

| Arquivo                            | Conteúdo                                                  |
| ---------------------------------- | --------------------------------------------------------- |
| `agents.md`                        | regras de trabalho, segurança, privacidade e documentação |
| `DECISIONS.md`                     | decisões vinculantes D01 e D20 a D37                      |
| `scripts/check-migration-order.ts` | guarda de ordem do schema                                 |
| `scripts/browser-smoke.ts`         | smoke headless de hidratação e interação                  |
| `scripts/browser-capture.ts`       | captura de tela e PDF                                     |
| `scripts/chaos-scale.ts`           | prova de 50.000 barreiras e valores novos                 |
| `scripts/test-dom.ts`              | linkedom e storage para testes                            |
| `scripts/fixtures/README.md`       | fixtures sintéticas e cobertura                           |
| `readme.md`                        | visão geral, stack, capacidades e documentação            |
| `docs/ARCHITECTURE.md`             | camadas, fluxos, auth, escopo, alertas e deploy           |

#### Fontes não versionadas

O relato operacional de handoff de 16/11/2026 é citado apenas como contexto nas seções 9 e 10. Ele não está versionado na lista de documentos mantidos por `agents.md` seção 10 e não deve ser tratado como contrato. Números de produção citados a partir dele, como 38 estações, 134 destinatários, 15 barreiras críticas indisponíveis ou 17 eventos históricos, são relatos e precisam de confirmação no ambiente real antes de virarem decisão.
