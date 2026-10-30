# Manual do Usuário - Monitor de Barreiras de Segurança

Informações técnicas: `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATABASE.md`.

## 1. Introdução

O Monitor acompanha o estado operacional das barreiras que protegem equipamentos de processo em instalações de óleo e gás. Os dados são importados do sistema de gerenciamento, processados pelo servidor e exibidos no painel.

No painel é possível filtrar barreiras por instalação, criticidade, disponibilidade e conformidade; acompanhar tendências de conformidade por categoria; consultar e editar registros; exportar relatórios; e receber alertas por e-mail em deterioração operacional.

## 2. Acesso e perfis

Perfis: `admin` e `user`.

### 2.1 Autenticação e sessões

- Única rota pública: `/login`; não autenticados redirecionados para `/login?next=...`.
- Sem cadastro público; primeira conta via `deno task admin:create`.
- Login local por e-mail e senha (quando habilitado) e, se configurado pelo administrador, login com Microsoft Entra ID ("Entrar com Microsoft") na mesma tela.
- Contas podem ser locais ou Entra. A conversão de uma conta local para Entra preserva o identificador e o histórico; contas Entra não alteram senha no monitor (gerenciada pela organização).
- Sessão válida 12 horas; logout revoga imediatamente. Para sessões Entra, o logout também oferece encerramento da sessão no provedor (quando habilitado).
- Alteração de senha (aba Conta): apenas contas locais; revoga todas as sessões; senha 12 a 256 caracteres.
- Edição de perfil (aba Conta): nome, e-mail e telefone do próprio usuário.
- Redefinição por admin (aba Usuários): revoga sessões apenas do usuário afetado; admin pode revogar todas as sessões de qualquer usuário ("Revogar sessões").

## 3. Visão geral do painel

De cima para baixo:

1. Cabeçalho: nome do operador (se configurado), indicador de saúde de sincronização e conexão, botões de configurações e exportação.
2. KPIs: total de barreiras, disponíveis, não conformes, contingenciadas, percentual de conformidade, críticas não conformes, sem plano de ação e demais estados; distribuição por criticidade.
3. Distribuição por disponibilidade: faixa com segmentos dimensionados por volume; clique filtra a tabela. Admins também veem segmentos Desativadas e Excluídas.
4. Barra de filtros.
5. Gráfico de conformidade por categoria.
6. Tabela de barreiras com paginação.
7. Janela de detalhes, aberta ao clicar em uma linha.

## 4. Filtros

### 4.1 Disponíveis

Busca textual (tag e código da instalação); Tipologia; Categoria; Criticidade (Somente críticos para ESO/A); Disponibilidade; Conformidade; Plano de ação; intervalo de datas (Desde/Até).

### 4.2 Comportamento

- Opções dinâmicas, obtidas do banco. Sem listas fixas.
- Botão Limpar filtros aparece com ao menos um filtro ativo.
- Contagem de resultados atualizada conforme filtros.
- Estado inicial: sem filtros, 25 linhas por página, ordenação crescente por ID.
- Padrões personalizáveis no painel de configurações.
- Usuários vinculados a grupos de acesso visualizam apenas barreiras das estações dos seus grupos; sem vínculo, acesso irrestrito.

## 5. Tabela de barreiras

### 5.1 Organização e ordenação

Cabeçalhos ordenam. 10 colunas exibíveis/ocultáveis e reordenáveis via menu; a última visível não pode ser ocultada.

### 5.2 Seleção

Três escopos (estilo Gmail): página atual; todos que correspondem aos filtros; limpar seleção. Preservada em mudanças de página e filtro, com validações ao restaurar.

### 5.3 Paginação e indicadores

Campo Ir para página. Tamanhos de página: 25, 50, 100. Linhas não conformes exibem Dias sem contingência.

## 6. Detalhes, contingências e histórico

Janela com abas Detalhes, Contingência e Histórico; admins também veem Edição.

### 6.1 Detalhes

Identificação e instalação; tipologia, criticidade e categoria; grupo e proprietário; disponibilidade e conformidade; data da última alteração de status; degradação, comentários e plano de ação; campos livres da ficha de inventário. Plano Preventivo Cumprido? considera apenas tarefas preventivas em aberto vencidas; corretiva em aberto não altera o campo.

### 6.2 Contingência

Lista vínculos desta barreira como contingência e os em que ela é contingência de outra, com tags e referências de Gestão de Mudança e Análise de Risco.

Elegíveis: ativas, não excluídas, Disponível, Conforme, mesma instalação; busca por tag. Admins criam/removem vínculos e preenchem referências; demais consultam. Vínculo que deixa de atender critérios continua visível como não elegível; vínculos com inativas/excluídas restritos à consulta admin.

Se Não Conforme sem contingência elegível, a tela recomenda colocá-la fora de operação (somente texto).

### 6.3 Histórico

Linha do tempo das alterações de status.

### 6.4 Edição

Somente admins; campos autorizados conforme seção 7.

## 7. Edição de registros (somente admins)

Campos principais, ficha de inventário e estado de disponibilidade.

### 7.1 Alteração de status

Status igual ao atual não gera novo registro de histórico nem alerta decorrente da alteração.

### 7.2 Sobreposição manual de contingência

Com Há Contingência? = Sim, o sistema considera a contingência manual na apresentação e no processamento de status (PATCH): Degradado vira Degradado Contingenciado; Indisponível vira Indisponível Contingenciado.

### 7.3 Alertas após alterações

Após alteração de status, o sistema pode enviar alertas imediatos conforme regras configuradas.

## 8. Gráfico de conformidade

Dois modos: barras horizontais empilhadas (distribuição por categoria) e resumo executivo (rosca com percentual de conformidade e lista Top-NC).

Recursos: ordenação por volume, taxa de não conformidade ou nome; expansão além das 20 primeiras com cauda agregada; clique em linha filtra a tabela pela categoria; busca interna de categorias.

## 9. Exportação de relatórios

Formatos CSV, XLSX e PDF. Abrange toda a seleção válida, inclusive páginas não carregadas no navegador; dados transmitidos em fluxo do banco.

### 9.1 Limite

Máximo de 200.000 linhas por arquivo; acima, operação recusada com quantidade real. Usuário deve restringir filtros; nenhum registro omitido. Seleção intersectada no servidor com filtros ativos.

### 9.2 Nome do arquivo

Inclui a data da exportação; cada operação gera um arquivo.

## 10. Configurações e personalização

Painel via botão de engrenagem.

### 10.1 Preferências do usuário

Tema (claro, escuro, preto puro); cor de destaque (8 paletas); densidade (3 predefinições); redução de movimento; desativar desfoque (desempenho); filtros padrão; ordenação padrão; alteração de senha (aba Conta).

### 10.2 Configurações administrativas

Usuários: listar, criar, editar, remover contas; proteção da última conta de admin ativa. Criação e edição incluem nome, e-mail, telefone e tipo de conta (senha local ou Microsoft Entra com Object ID); contas locais podem ser convertidas para Entra. Admin pode revogar todas as sessões de um usuário.

Grupos de acesso: criar, editar e remover grupos que restringem usuários a um conjunto de estações. Cada grupo vincula usuários e estações; um usuário pode pertencer a vários grupos e visualiza a união das estações. Usuário sem vínculo a grupo tem acesso irrestrito; administradores têm acesso irrestrito. Nas telas de seleção de estações e usuários há botão "Selecionar todos" para marcar/desmarcar em lote.

Destinatários de alertas: listar, cadastrar, ativar, remover.

Regras de alerta: categoria da barreira, status de chegada, criticidade, recuperação do estado operacional, dias de atraso, envio imediato ou agrupado.

Opções de campo: listas controladas para perguntas da ficha de inventário.

### 10.3 Persistência

Preferências armazenadas localmente no navegador e restauradas ao abrir o site. Chaves detalhadas na seção 13.

## 11. Indicador de sincronização e conexão

Indicador visual de saúde combinando sincronização e conexão.

### 11.1 Indicador de saúde

O núcleo representa o estado da sincronização.

### 11.2 Informações de sincronização

Linha de status: horário local da última atualização e variações `+N ~N -N`. Cartão flutuante exibe duração do último ciclo e resumo. Modal de auditoria lista registros afetados.

### 11.3 Monitoramento da conexão

Ping a cada 5 segundos; pausado com aba oculta.

### 11.4 Estados de sincronização

Sincronizando; Ocioso; Atrasado; Desconhecido.

## 12. Papéis e permissões

| Ação | user | admin |
| --- | --- | --- |
| Visualizar painel, KPIs e gráfico | Sim | Sim |
| Filtrar e ordenar | Sim | Sim |
| Exportar dados | Sim | Sim |
| Visualizar excluídos/desativados | Não | Sim |
| Editar barreiras | Não | Sim |
| Alterar status | Não | Sim |
| Gerenciar usuários | Não | Sim |
| Gerenciar destinatários e regras | Não | Sim |
| Gerenciar opções de campo | Não | Sim |
| Gerenciar grupos de acesso | Não | Sim |
| Visualizar estações conforme grupos de acesso | Conforme grupos | Sim |

Alterações são recusadas quando nenhuma credencial está configurada.

## 13. Atalhos e acessibilidade

Escape fecha sobreposições; Tab mantém foco em menus; foco retorna ao elemento de origem; anel de foco destaca seleção; sem atalhos de tecla única.

## 14. Status de disponibilidade e conformidade

### 14.1 Estados de disponibilidade

Seis estados:

| Status | Significado |
| --- | --- |
| Disponível | Ativo protegido livre de falhas ou defeitos. |
| Degradado | Intervenção corretiva planejada e urgente em aberto no ativo. |
| Indisponível | Intervenção corretiva emergencial em aberto no ativo. |
| Degradado Contingenciado | Condição degradada com contingência em vigor. |
| Indisponível Contingenciado | Indisponível com contingência em vigor. |
| Fora de Operação | Ativo fora de serviço, isolado positivamente. |

Observação: Degradado exige gatilho urgente (atributo de urgência do trabalho planejado); trabalho planejado sem urgência não altera a disponibilidade e a barreira permanece Disponível.

### 14.2 Regras de contingência

Estados contingenciados são derivados dos estados-base. Com intervenção corretiva em aberto e evidência de contingência, o estado-base pode ser promovido: Degradado para Degradado Contingenciado; Indisponível para Indisponível Contingenciado.

Evidências: GM/CEC; nota explícita de contingência no texto da intervenção; campo Há Contingência? = Sim.

A degradação exige intervenção corretiva planejada urgente; intervenção planejada não urgente não gera Degradado.

### 14.3 Regras de conformidade

Conformidade derivada da disponibilidade, não status independente. Dois resultados: Conforme e Não Conforme. Qualquer disponibilidade fora do conjunto conforme é Não Conforme. Aplicado em indicadores, filtros, gráficos e alertas.

### 14.4 Classificação de criticidade

Ordem (maior para menor): `ESO > A > B > C > D`. ESO e A são críticos, usados para KPI de críticas não conformes, filtro Somente críticos e urgência de alertas.

### 14.5 Classificação de urgência

| Nível | Regra |
| --- | --- |
| Crítico | Não conforme e faixa crítica (ESO ou A). |
| Urgente | Não conforme, mas não crítico. |
| Nenhum | Conforme. |

### 14.6 Ordenação por urgência

Dentro de cada nível: maior criticidade primeiro; data de status mais antiga primeiro; ID crescente para desempate.

## 15. Limites e observações

| Recurso | Limite/comportamento |
| --- | --- |
| Exportação | Máximo de 200.000 linhas por arquivo. |
| Tamanhos de página | 25, 50 ou 100 registros. |
| Duração da sessão | 12 horas. |
| Comprimento da senha | 12 a 256 caracteres. |
| Consultas de leitura | 120 req/min por endereço remoto. |
| Operações de escrita | 30 req/min por endereço remoto. |
| Exportações | 120 req/min por endereço remoto. |
| Alterações de senha | 10 req/min por endereço remoto. |
| Categorias no gráfico | 20 primeiras individuais; demais agrupáveis em cauda. |

Interface em pt-BR. Identificadores técnicos, comentários e logs em inglês. Limites aplicados por endereço remoto.

## 16. Mapa da documentação

Demais documentos em `docs/`: `ARCHITECTURE.md`, `API.md`, `DATABASE.md`, `GLOSSARY.md`, `STATUSES.md`. Projeto: `readme.md`, `agents.md`.