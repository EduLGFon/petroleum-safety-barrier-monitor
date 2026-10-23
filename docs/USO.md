# Manual do Usuário - Monitor de Barreiras de Segurança

Para obter informações técnicas sobre a implementação, consulte `docs/ARCHITECTURE.md`, `docs/API.md` e `docs/DATABASE.md`.

## 1. Introdução

O Monitor de Barreiras de Segurança permite acompanhar o estado operacional das barreiras que protegem equipamentos de processo em instalações de óleo e gás.

Os dados das barreiras são importados do sistema de gerenciamento, processados pelo servidor e disponibilizados no painel.

No painel, é possível filtrar barreiras por instalação, criticidade, disponibilidade e conformidade; acompanhar tendências de conformidade por categoria; consultar e editar registros; exportar relatórios; e receber alertas por e-mail quando uma barreira apresenta deterioração de seu estado operacional.

## 2. Acesso e perfis de usuário

O sistema possui dois perfis de acesso: `admin` (administrador) e `user` (usuário).

### 2.1. Autenticação e sessões

- **Acesso público:** a única rota pública é `/login`. Visitantes não autenticados são redirecionados para `/login?next=...` e, após o login, retornam à página que tentavam acessar.
- **Cadastro de contas:** não há cadastro público. A primeira conta deve ser criada pelo administrador por meio do comando `deno task admin:create`.
- **Duração da sessão:** cada sessão permanece válida por 12 horas.
- **Logout:** encerra a sessão e revoga sua validade imediatamente.
- **Alteração de senha pelo próprio usuário:** disponível na aba **Conta**, nas configurações. A operação revoga todas as sessões do usuário, inclusive a sessão atual. A senha deve ter entre 12 e 256 caracteres.
- **Redefinição de senha por um administrador:** disponível na aba **Usuários**. A operação revoga as sessões do usuário cuja senha foi redefinida, sem afetar as sessões dos demais usuários.

## 3. Visão geral do painel

O painel principal (`/`) organiza as informações de cima para baixo da seguinte maneira:

1. **Cabeçalho:** exibe o nome do operador, quando configurado, o indicador de saúde da sincronização e da conexão, além dos botões de configurações e exportação.
2. **Indicadores-chave de desempenho (KPIs):** apresentam o total de barreiras, a quantidade de barreiras disponíveis, não conformes e contingenciadas, o percentual de conformidade, a quantidade de barreiras críticas não conformes, as barreiras sem plano de ação e os outros estados. Essa área também apresenta a distribuição por criticidade.
3. **Distribuição por disponibilidade:** exibe uma faixa cujos segmentos são dimensionados de acordo com o volume de barreiras em cada estado. Ao clicar em um segmento, a tabela é filtrada pelo respectivo estado. Administradores também podem acessar os segmentos **Desativadas** e **Excluídas**, que alteram o conjunto de registros exibidos.
4. **Barra de filtros:** permite restringir os registros apresentados.
5. **Gráfico de conformidade por categoria:** apresenta a distribuição da conformidade entre as categorias de barreiras.
6. **Tabela de barreiras:** lista os registros e permite navegar entre as páginas de resultados.
7. **Janela de detalhes da barreira:** é aberta ao clicar em uma linha da tabela e apresenta as informações detalhadas do registro.

O painel ocupa toda a largura disponível da tela, sem um limite máximo de 1.400 pixels, aproveitando toda a área útil do monitor.

## 4. Filtros

A barra de filtros permite combinar diferentes critérios para localizar e analisar barreiras.

### 4.1. Filtros disponíveis

- **Busca textual:** pesquisa por tag e código da instalação. A busca utiliza _debounce_ para evitar atualizações excessivas durante a digitação.
- **Tipologia:** restringe os resultados de acordo com a tipologia da barreira.
- **Categoria:** filtra os registros por categoria.
- **Criticidade:** permite filtrar por faixa de criticidade. A opção **Somente críticos** restringe os resultados às faixas ESO e A.
- **Disponibilidade:** filtra pelo estado operacional da barreira.
- **Conformidade:** filtra entre registros conformes e não conformes.
- **Plano de ação:** permite selecionar barreiras com ou sem plano de ação.
- **Intervalo de datas:** define as datas inicial (**Desde**) e final (**Até**) do período desejado.

### 4.2. Comportamento dos filtros

- **Opções dinâmicas:** as opções de filtro são obtidas dos valores existentes no banco de dados. Não há listas fixas para esses campos.
- **Limpeza dos filtros:** o botão **Limpar filtros** aparece quando pelo menos um filtro está ativo.
- **Contagem de resultados:** a quantidade de registros encontrados é atualizada conforme os filtros são aplicados.
- **Estado inicial da tabela:** a tabela é aberta sem filtros, com 25 linhas por página e ordenação crescente por ID.
- **Configuração dos padrões:** os filtros iniciais e a ordenação padrão podem ser personalizados no painel de configurações.

## 5. Tabela de barreiras

A tabela permite visualizar, ordenar, selecionar e navegar pelos registros.

### 5.1. Organização e ordenação

- Os cabeçalhos das colunas permitem ordenar os registros. A ordenação também pode ser acionada pelo teclado, usando **Enter** ou **Espaço**.
- O atributo de acessibilidade `aria-sort` informa a ordenação aplicada.
- Existem 10 colunas que podem ser exibidas ou ocultadas e cuja ordem pode ser alterada por meio de um diálogo específico.
- Dois controles adicionais de filtro permanecem fixados à tabela.
- A última coluna visível não pode ser ocultada, garantindo que a tabela sempre mantenha pelo menos uma coluna visível.

### 5.2. Seleção de registros

A seleção possui três estados de escopo, em um modelo semelhante ao utilizado pelo Gmail:

- Selecionar os registros da página atual.
- Selecionar todos os registros que correspondem aos filtros aplicados.
- Limpar a seleção.

A seleção é preservada durante as mudanças de página e de filtro. Ao restaurar uma seleção salva, o sistema aplica as validações e limitações necessárias para manter a seleção consistente.

### 5.3. Paginação e indicadores

- A tabela possui um campo **Ir para página**, que permite navegar diretamente para uma página específica.
- Os tamanhos de página disponíveis são 25, 50 e 100 registros.
- As linhas de barreiras não conformes exibem o indicador **Dias sem contingência**, conforme as regras de apresentação do sistema.

## 6. Detalhes e histórico da barreira

Ao clicar em uma linha da tabela, abre-se uma janela com as informações detalhadas da barreira. Essa janela possui três abas.

### 6.1. Detalhes

Apresenta os dados da barreira, incluindo:

- Identificação e instalação.
- Tipologia, criticidade e categoria.
- Grupo e proprietário.
- Disponibilidade e conformidade.
- Data da última alteração de status.
- Comentários e plano de ação.
- Campos de texto livre provenientes da ficha de inventário.

### 6.2. Histórico

Apresenta uma linha do tempo com as alterações de status da barreira, permitindo consultar a evolução de seu estado operacional.

### 6.3. Edição

Disponível exclusivamente para administradores. Permite alterar os campos autorizados do registro, conforme descrito na seção 7.

## 7. Edição de registros (somente administradores)

Os administradores podem editar os campos principais da barreira, os campos da ficha de inventário e o estado de disponibilidade.

### 7.1. Alteração de status

As alterações de status são processadas pela função `record_status_change()`, responsável por:

1. Atualizar o estado de disponibilidade.
2. Atualizar a data do status.
3. Registrar a alteração no histórico.

Essas operações são executadas de forma atômica, garantindo que a atualização do registro e o respectivo histórico sejam tratados como uma única operação.

Se o novo status for igual ao status atual, o sistema não gera um novo registro de histórico nem dispara um alerta decorrente da alteração.

### 7.2. Sobreposição manual de contingência

Quando o campo **Há Contingência?** está definido como **Sim**, o sistema considera a contingência manual na apresentação e no processamento das alterações de status (`PATCH`).

Nesse caso:

- **Degradado** passa a ser exibido como **Degradado Contingenciado**.
- **Indisponível** passa a ser exibido como **Indisponível Contingenciado**.

### 7.3. Alertas após alterações

Após uma alteração de status, o sistema pode enviar alertas imediatos, de acordo com as regras configuradas. Independentemente do envio imediato, o evento é enfileirado para processamento pelo ciclo de notificações agrupadas (_digest_).

## 8. Gráfico de conformidade

O gráfico de conformidade pode ser apresentado em dois modos.

### 8.1. Barras horizontais empilhadas

Exibe a distribuição dos estados de conformidade por categoria, permitindo comparar os volumes e as proporções entre as categorias.

### 8.2. Resumo executivo

Apresenta um gráfico de rosca com o percentual de conformidade e uma lista **Top-NC**, destinada a destacar as categorias ou os registros com maior destaque negativo em conformidade, conforme a agregação utilizada pelo sistema.

### 8.3. Recursos disponíveis

- **Ordenação:** por volume de registros, taxa de não conformidade ou nome da categoria.
- **Expansão de categorias:** permite visualizar categorias além das 20 primeiras, agrupando as categorias restantes em uma cauda agregada.
- **Filtragem pela categoria:** clicar em uma linha do gráfico filtra a tabela de barreiras pela categoria correspondente.
- **Busca interna:** permite pesquisar categorias diretamente no gráfico.
- **Adaptação do layout:** a geometria do gráfico é ajustada à densidade dos dados e à largura do monitor.
- **Área de dicas:** os _tooltips_ são limitados à área visível da interface.
- **Persistência das preferências:** as preferências de visualização do gráfico são salvas localmente.

## 9. Exportação de relatórios

O sistema permite exportar os dados nos formatos CSV, XLSX e PDF.

As exportações abrangem toda a seleção válida, inclusive registros de páginas que não foram carregadas no navegador. Os dados são transmitidos a partir do banco de dados por meio de processamento em fluxo (_streaming_).

### 9.1. Limite de exportação

Cada arquivo pode conter, no máximo, 200.000 linhas de dados.

Se a exportação ultrapassar esse limite:

- A operação é recusada.
- O sistema informa a quantidade real de registros encontrados.
- O usuário deve restringir os filtros para reduzir o conjunto de dados.

Nenhum registro é omitido silenciosamente para fazer uma exportação excedente caber no limite.

A seleção também é intersectada, no servidor, com os filtros ativos. Assim, uma seleção anterior não permite incluir no arquivo registros que já não correspondem aos filtros atuais.

### 9.2. CSV

O arquivo CSV possui as seguintes características:

- 30 colunas de dados.
- Codificação UTF-8 com BOM, para melhorar a compatibilidade com programas como o Microsoft Excel.
- Ponto e vírgula (`;`) como separador de campos.
- Bloco `RESUMO` com os indicadores-chave de desempenho (KPIs).

### 9.3. XLSX

O arquivo XLSX é uma pasta de trabalho OOXML válida, com os seguintes recursos:

- Cabeçalho com a identidade visual do sistema.
- Faixa de indicadores-chave de desempenho (KPIs).
- Linha de cabeçalho congelada e filtros automáticos.
- Larguras de colunas ajustadas ao conteúdo.
- Cores aplicadas aos estados de disponibilidade e às faixas de criticidade.
- IDs armazenados como valores numéricos.
- Aba **Resumo**, com os indicadores consolidados.

### 9.4. PDF

O relatório PDF possui as seguintes características:

- Formato A4 em orientação paisagem.
- Cabeçalho com a identidade visual do sistema.
- Indicadores-chave de desempenho (KPIs) apresentados em cartões.
- Até 30 colunas, organizadas para acomodar o conteúdo no espaço disponível.
- Texto quebrado em linhas quando necessário, evitando cortes nas bordas da página.
- Repetição do cabeçalho da tabela nas páginas seguintes.
- Numeração de páginas no rodapé.

### 9.5. Nome dos arquivos

Os arquivos exportados recebem nomes que incluem a data da exportação. Cada operação de exportação gera um arquivo.

## 10. Configurações e personalização

O painel de configurações, acessível pelo botão de engrenagem, permite personalizar a aparência e o comportamento da interface.

### 10.1. Preferências do usuário

- **Tema:** claro, escuro ou preto puro.
- **Cor de destaque:** seleção entre oito paletas de cores, que alteram a coloração da interface e do fundo da página.
- **Densidade da interface:** três predefinições que ajustam o espaçamento e o ritmo visual dos componentes por meio de variáveis CSS.
- **Redução de movimento:** permite reduzir animações e movimentos na interface.
- **Filtros padrão:** define os filtros aplicados inicialmente ao abrir o painel.
- **Ordenação padrão:** define a ordenação inicial dos registros.
- **Alteração de senha:** disponível na aba **Conta**.

### 10.2. Configurações administrativas

Os recursos a seguir estão disponíveis somente para administradores.

**Usuários**

Permite listar, criar, editar e remover contas. O sistema protege a última conta de administrador ativa, impedindo que o sistema fique sem um administrador ativo.

**Destinatários de alertas**

Permite listar, cadastrar, ativar e remover os destinatários das notificações por e-mail.

**Regras de alerta**

Permite configurar os critérios que determinam quando um alerta deve ser gerado, incluindo:

- Categoria da barreira.
- Status de chegada.
- Criticidade.
- Recuperação do estado operacional.
- Quantidade de dias de atraso.
- Envio imediato ou agrupado em notificações periódicas (_digest_).

**Opções de campo**

Permite administrar listas de opções controladas para as perguntas da ficha de inventário.

### 10.3. Persistência das preferências

As preferências da interface são armazenadas no `localStorage` do navegador e restauradas antes da hidratação da aplicação. Isso evita que o usuário veja temporariamente um tema diferente daquele que havia selecionado.

As preferências persistidas e suas respectivas chaves são detalhadas na seção 13.

## 11. Indicador de sincronização e conexão

O painel possui um indicador visual de saúde que combina informações sobre a sincronização dos dados e a conexão com o sistema.

### 11.1. Indicador de saúde

- O **núcleo** do indicador representa o estado da sincronização.
- O **halo** representa o estado da conexão.
- Cada componente utiliza animações distintas para facilitar a diferenciação visual entre os estados.

### 11.2. Informações de sincronização

A linha de status apresenta:

- Horário local da última atualização pertinente.
- Variações identificadas durante o ciclo, no formato `+N ~N -N`.

Um cartão flutuante exibe a duração do último ciclo de sincronização e um resumo das alterações detectadas.

O sistema também disponibiliza um modal de auditoria que lista os registros afetados pelo ciclo.

### 11.3. Monitoramento da conexão

A verificação de conectividade executa um _ping_ a cada cinco segundos. Essa verificação é pausada quando a aba do navegador fica oculta.

### 11.4. Estados de sincronização

O indicador pode assumir os seguintes estados:

- **Sincronizando:** um ciclo de sincronização está em andamento.
- **Ocioso:** não há atividade de sincronização em andamento.
- **Atrasado:** a sincronização está atrasada em relação ao esperado.
- **Desconhecido:** não há informações suficientes para determinar o estado atual.

## 12. Papéis e permissões

A tabela abaixo resume as permissões de cada perfil.

| Ação                                          | `user` | `admin` |
| --------------------------------------------- | ------ | ------- |
| Visualizar o painel, os KPIs e o gráfico      | Sim    | Sim     |
| Filtrar e ordenar registros                   | Sim    | Sim     |
| Exportar dados                                | Sim    | Sim     |
| Visualizar registros excluídos ou desativados | Não    | Sim     |
| Editar barreiras                              | Não    | Sim     |
| Alterar o status das barreiras                | Não    | Sim     |
| Gerenciar usuários                            | Não    | Sim     |
| Gerenciar destinatários e regras de alerta    | Não    | Sim     |
| Gerenciar opções de campo                     | Não    | Sim     |

### 12.1. Proteção das rotas e operações

- **Requisições sem autenticação:** chamadas anônimas à API recebem uma resposta HTTP `404`, com o mesmo formato utilizado para rotas inexistentes.
- **Credenciais inválidas:** resultam em uma resposta HTTP `401`.
- **Falha segura:** operações de escrita são recusadas quando nenhuma credencial está configurada.

Essas medidas evitam a exposição desnecessária de informações sobre rotas protegidas e impedem alterações sem autenticação adequada.

## 13. Persistência local

O navegador utiliza três chaves no `localStorage` para armazenar preferências e o estado da interface.

| Chave               | Informações armazenadas                                                                                   |
| ------------------- | --------------------------------------------------------------------------------------------------------- |
| `barrier-dashboard` | Instalação, filtros, seleção de registros, linha aberta e colunas visíveis e fixadas.                     |
| `barrier-chart`     | Modo de visualização do gráfico, ordenação e estado de expansão.                                          |
| `barrier-settings`  | Tema, cor de destaque, densidade, preferência de redução de movimento, filtros padrão e ordenação padrão. |

### 13.1. Validação e restauração

Cada chave é validada campo a campo durante a restauração.

Se os dados salvos forem incompatíveis com a versão atual da aplicação, o sistema aplica as correções necessárias para restaurar um estado válido da interface.

## 14. Atalhos e acessibilidade

O sistema oferece recursos de acessibilidade para facilitar a navegação por teclado e o uso de tecnologias assistivas.

- **Tecla Escape:** fecha as sobreposições abertas.
- **Navegação por teclado:** a tecla Tab mantém o foco dentro dos diálogos enquanto estiverem abertos.
- **Restauração do foco:** ao fechar um diálogo, o foco retorna ao elemento que o abriu.
- **Indicador de foco:** um anel de foco visível destaca o componente que está selecionado para interação pelo teclado.
- **Regiões dinâmicas:** regiões acessíveis são utilizadas para anunciar atualizações na linha de sincronização e no status da tabela.
- **Redução de movimento:** a interface respeita a preferência configurada no sistema operacional, além de disponibilizar um controle próprio nas configurações.
- **Atalhos globais:** não existem atalhos baseados em uma única tecla que possam interferir inesperadamente na navegação.

## 15. Status de disponibilidade e conformidade

Esta seção explica os estados operacionais utilizados pelo painel, a relação entre disponibilidade e conformidade e os critérios de urgência.

### 15.1. Estados de disponibilidade

O sistema utiliza seis estados de disponibilidade.

| Status                          | Significado                                                                             |
| ------------------------------- | --------------------------------------------------------------------------------------- |
| **Disponível**                  | O ativo protegido está livre de falhas ou defeitos que comprometam sua disponibilidade. |
| **Degradado**                   | Existe uma intervenção corretiva planejada em aberto no ativo protegido.                |
| **Indisponível**                | Existe uma intervenção corretiva emergencial em aberto no ativo protegido.              |
| **Degradado Contingenciado**    | O ativo apresenta a condição degradada, com uma contingência em vigor.                  |
| **Indisponível Contingenciado** | O ativo está indisponível, com uma contingência em vigor.                               |
| **Fora de Operação**            | O ativo protegido está fora de serviço e foi positivamente isolado.                     |

### 15.2. Regras de contingência

Os estados **Degradado Contingenciado** e **Indisponível Contingenciado** são estados de exibição derivados dos respectivos estados-base.

Quando existe uma intervenção corretiva em aberto e há evidência de contingência, o sistema pode promover o estado-base para o estado contingenciado correspondente.

As evidências consideradas incluem:

- Evidência GM/CEC.
- Nota explícita de contingência no texto da intervenção corretiva.
- Campo **Há Contingência?** definido como **Sim** na ficha de inventário.

Assim, as seguintes transições de exibição são aplicadas:

- **Degradado** → **Degradado Contingenciado**.
- **Indisponível** → **Indisponível Contingenciado**.

### 15.3. Regras de conformidade

A conformidade é sempre derivada do estado de disponibilidade, não sendo tratada como um status independente.

O sistema apresenta dois resultados possíveis:

- **Conforme**.
- **Não Conforme**.

Qualquer estado de disponibilidade que não pertença ao conjunto definido como conforme é classificado como **Não Conforme**.

Essa regra é aplicada de maneira consistente em toda a aplicação, incluindo os indicadores, os filtros, os gráficos e os alertas.

### 15.4. Classificação de criticidade

A ordem de criticidade, da maior para a menor, é:

`ESO > A > B > C > D`

As faixas **ESO** e **A** são consideradas críticas e são utilizadas para:

- Calcular o indicador de barreiras críticas não conformes.
- Aplicar o filtro **Somente críticos**.
- Determinar a urgência dos alertas.

### 15.5. Classificação de urgência

A urgência indica se uma barreira precisa de atenção imediata.

| Nível       | Regra                                                                          |
| ----------- | ------------------------------------------------------------------------------ |
| **Crítico** | A barreira está não conforme e pertence a uma faixa crítica (ESO ou A).        |
| **Urgente** | A barreira está não conforme, mas não atende ao critério de criticidade acima. |
| **Nenhum**  | A barreira está conforme.                                                      |

### 15.6. Ordenação por urgência

Dentro de cada nível de urgência, os registros são ordenados pelos seguintes critérios, nesta sequência:

1. Maior criticidade primeiro.
2. Data de status mais antiga primeiro.
3. ID crescente, para desempate.

## 16. Limites e observações

Os principais limites operacionais do sistema são:

| Recurso               | Limite ou comportamento                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------- |
| Exportação            | Máximo de 200.000 linhas por arquivo.                                                              |
| Tamanhos de página    | 25, 50 ou 100 registros.                                                                           |
| Duração da sessão     | 12 horas.                                                                                          |
| Comprimento da senha  | De 12 a 256 caracteres.                                                                            |
| Consultas de leitura  | 120 requisições por minuto, por endereço remoto.                                                   |
| Operações de escrita  | 30 requisições por minuto, por endereço remoto.                                                    |
| Exportações           | 120 requisições por minuto, por endereço remoto.                                                   |
| Alterações de senha   | 10 requisições por minuto, por endereço remoto.                                                    |
| Categorias no gráfico | As 20 primeiras são exibidas individualmente; as demais podem ser agrupadas em uma cauda agregada. |

A interface do usuário está em português brasileiro (pt-BR). Identificadores técnicos, comentários e registros de log permanecem em inglês.

Os limites de requisições são aplicados por endereço remoto, conforme a configuração do sistema.

## 17. Mapa da documentação

Os demais documentos do projeto contêm informações complementares sobre a implementação e a operação do sistema.

| Documento              | Conteúdo                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| `docs/USO.md`          | Este manual, destinado aos usuários finais.                                                  |
| `docs/ARCHITECTURE.md` | Módulos, fluxos, ciclo de vida, topologia de ilhas e configuração da aplicação.              |
| `docs/API.md`          | Contratos de comunicação, endpoints, autenticação e limitação de requisições (_throttling_). |
| `docs/DATABASE.md`     | Esquema do banco de dados, invariantes e procedimentos de configuração.                      |
| `docs/GLOSSARY.md`     | Mapeamento entre os valores exibidos na interface e seus identificadores internos.           |
| `docs/STATUSES.md`     | Definições dos estados de disponibilidade.                                                   |
| `readme.md`            | Escopo do produto e convenções do projeto, em inglês.                                        |
| `agents.md`            | Regras do ambiente de trabalho destinadas a agentes e contribuidores.                        |
