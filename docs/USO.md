# Manual do Usuário - Monitor de Barreiras de Segurança

O Monitor acompanha a disponibilidade e a conformidade das barreiras de segurança das instalações.
A interface é somente em português, sem seletor de idioma, e as telas do painel exigem sessão autenticada.

## Acesso

- Entre com o e-mail corporativo e a senha na tela de acesso.
- Quando o login com Microsoft estiver habilitado, use **Entrar com Microsoft** e siga o fluxo da organização.
- Contas locais usam senha própria. Contas Microsoft Entra não têm senha local: a autenticação e a senha são gerenciadas pela organização.
- Se o acesso for negado pelo Microsoft, a tela informa o motivo (acesso cancelado, sessão expirada, conta sem acesso ao monitor ou serviço indisponível). Procure um administrador.

### Primeiro acesso e senha temporária

Uma conta local criada ou redefinida por um administrador recebe uma senha temporária. No primeiro acesso, o Monitor abre a tela de troca de senha e mantém a conta nela até a conclusão.

- Informe a senha temporária e escolha uma nova senha com pelo menos 12 caracteres; repita a nova senha para confirmar.
- A troca encerra todas as sessões da conta. Entre novamente com a nova senha.
- A senha de uma conta Entra não é alterada pelo Monitor. Nesse caso, use os recursos de senha da organização.

## Painel

O painel apresenta, de cima para baixo, o **cabeçalho** (empresa, conexão, sincronização, usuário, configurações e saída), as **abas de instalação**, a **faixa de disponibilidade**, os **cartões de indicadores**, o **gráfico de conformidade por categoria**, o **alerta de não conformidade**, os **filtros**, a **tabela** e o **rodapé**.

- As abas trazem **Todas** e uma estação por aba, com a quantidade de barreiras, e rolam horizontalmente.
- A faixa de disponibilidade mostra os totais por status; clique em um status para filtrar. Administradores também veem **Desativadas** e **Excluídas**, que mudam o conjunto de linhas.
- Os cartões mostram o percentual de conformidade, as barreiras não conformes e os recortes por criticidade (ESO+A e demais).
- O gráfico permite clicar em uma categoria para filtrar a tabela. O alerta de não conformidade aparece quando há casos e o botão **Ver urgentes** prioriza os mais antigos.

## Status, conformidade e contingência

1. **Disponível** - livre de falhas ou defeitos.
2. **Fora de Operação** - equipamento protegido fora de operação e isolado do processo.
3. **Indisponível Contingenciado** - indisponibilidade com contingência.
4. **Degradado Contingenciado** - degradação com contingência.
5. **Degradado** - falha potencial, com ordem ou tarefa corretiva planejada.
6. **Indisponível** - falha funcional, com ordem ou tarefa corretiva emergencial.

Os quatro primeiros status são **Conforme**; os dois últimos são **Não Conforme**. **Fora de Operação** é conforme e não gera alerta.

A contingência aparece no status **Indisponível Contingenciado** ou **Degradado Contingenciado** e no campo **Há Contingência?**. Uma barreira Degradado ou Indisponível marcada com contingência passa a ser exibida como contingenciada e permanece conforme. Os vínculos ficam na aba **Contingência** dos detalhes. As definições completas estão em [STATUSES.md](STATUSES.md).

## Tabela, busca e filtros

A tabela possui 11 definições de coluna. Oito ficam visíveis por padrão: **#**, **TAG**, **Tipologia**, **Estação**, **Categoria**, **Disponibilidade**, **Conformidade** e **Contingência**. **Criticidade**, **Dono** e **Desde** podem ser ativadas no menu de colunas.

- Clique em um cabeçalho para ordenar a tabela.
- No menu **Colunas**, marque ou desmarque colunas, use as setas para reordenar e escolha **Restaurar padrão**. O mesmo menu permite ocultar os filtros **Plano** e **Período**.
- A pesquisa rápida encontra por TAG, código da estação e categoria.
- Os filtros de tipologia, categoria, criticidade, disponibilidade, conformidade, plano de ação e período podem ser combinados; use o botão de limpar para removê-los.
- Administradores também filtram por **Situação** (ativas, desativadas, excluídas ou todas). Usuários comuns veem apenas as barreiras ativas.
- A paginação permite 25, 50 ou 100 registros por página.
- O cabeçalho da tabela seleciona a página atual; a opção de selecionar tudo estende a seleção a todas as linhas do filtro, inclusive em outras páginas. **Limpar seleção** desfaz a seleção.

A exportação usa somente as linhas selecionadas.

## Detalhes da barreira

Clique em uma linha para abrir os detalhes:

- **Detalhes** - identificação, categoria, criticidade, dono, status e demais campos. O bloco **Causa da Disponibilidade** explica o status atual e a ordem ou solicitação que influenciou a disponibilidade.
- **Contingência** - vínculos da barreira como contingência e barreiras que a contingenciam. Administradores podem criar e remover vínculos elegíveis.
- **Histórico** - mudanças de status registradas.
- **Editar** - exclusiva para administradores em barreiras ativas.

Ao editar um campo, ele recebe a marca **Manual** e deixa de ser sobrescrito pela sincronização. O botão **Reverter p/ Fracttal** devolve o campo à sincronização; o valor do Fracttal volta a valer no próximo ciclo. Cada campo manual indica a origem do dado no Fracttal para orientar a correção na fonte.

## Configurações

Abra as configurações pelo ícone de engrenagem no cabeçalho. O menu tem quatro grupos:

- **Preferências** - **Aparência** e **Filtros**.
- **Conta** - dados do próprio usuário e senha.
- **Administração** - **Usuários**, **Grupos**, **Destinatários**, **Regras** e **Opções** (somente administradores).
- **Sistema** - **Sincronização**.

Em **Aparência**, escolha o tema **Claro**, **Escuro** ou **Black**, a cor de destaque, a densidade, o tamanho do texto, a redução de animações e a opção de desativar o desfoque. O tamanho do texto tem quatro opções: **Pequeno**, **Padrão**, **Grande** e **Muito grande**. A densidade altera o espaçamento; o tamanho do texto altera apenas a leitura. Essas preferências são salvas neste navegador.

Em **Filtros**, defina instalação, disponibilidade, conformidade, categoria, tipologia, criticidade, plano de ação e ordenação iniciais aplicados ao abrir o monitor.

Em **Conta**, atualize nome, e-mail e telefone, e altere a própria senha. A alteração de senha encerra todas as sessões. Para contas Entra, o Monitor informa que a senha é gerenciada pela organização.

## Administração

As telas administrativas confirmam o sucesso com um aviso temporário (toast), que pode ser fechado e desaparece sozinho. Erros permanecem visíveis na tela até a correção. A busca nas listas administrativas ignora maiúsculas e acentos.

### Usuários

Permite criar, editar, ativar, desativar, promover e rebaixar contas, além de redefinir senhas, revogar sessões e converter contas locais para Microsoft Entra.

- A conta pode ser **Admin** ou **Usuário** e **Local** ou **Entra**.
- A redefinição de senha gera uma senha temporária, exibida uma única vez; no próximo acesso, a pessoa é obrigada a trocá-la.
- Contas Entra não têm senha local para redefinir. A conversão para Entra faz a senha local deixar de valer.
- Ações em lote estão disponíveis para as contas selecionadas.

### Grupos

Um grupo de acesso define quais **estações** e **usuários** ele abrange. A restrição vale para o painel, os dados e os alertas.

- Administradores veem todas as estações.
- Um usuário comum sem grupo não vê nenhuma barreira.
- Um usuário comum vê apenas as estações dos grupos dos quais participa.

### Destinatários

A tela **Destinatários** mantém uma lista manual legada. Esses registros não definem mais quem recebe os alertas: a entrega é calculada a partir dos usuários ativos e dos grupos de acesso, conforme a seção de alertas.

### Regras

As regras definem quando e como os alertas são disparados. É possível restringir por categoria, local, criticidade, tipologia, agrupamento, responsável, status de origem e status de destino, além de disparar na transição de status, lembrar barreiras paradas há um número de dias, tratar a urgência do caso e aplicar pausa por barreira, limite diário, janela de silêncio, validade e prioridade entre regras concorrentes.

Sem regras, todo estado não conforme alerta. Com regras, só o que casar com escopo, gatilho e janela anti-ruído alerta; a regra de maior prioridade vence.

### Opções

Em **Opções**, edite as respostas e os padrões dos campos da ficha da barreira. A tela permite adicionar, remover e reordenar opções e restaurar os valores mais comuns recebidos do Fracttal.

## Alertas e público

O público dos alertas é derivado dos usuários ativos e dos grupos de acesso:

- administradores recebem alertas de todas as estações;
- usuários comuns recebem apenas alertas das estações dos seus grupos;
- usuários sem grupo não recebem alertas.

Cada alerta é filtrado pela estação da barreira que o originou. A tela **Destinatários** não participa desse cálculo.

## Exportação

A exportação usa apenas as linhas selecionadas. Selecione uma ou mais barreiras para habilitar o botão **Exportar** e escolha **XLSX** (planilha), **PDF** (relatório) ou **CSV** (texto delimitado). Todos os formatos abrangem a seleção completa, inclusive linhas de outras páginas. Não há relatórios agendados nem envio automático de exportações.

## Sincronização

A página **Sincronização**, no grupo Sistema, mostra o estado da integração com o Fracttal: resultado e horário da última execução, duração, origem, detalhe técnico e alterações da última sincronização ou das últimas 24 horas, com acesso à barreira correspondente.

O Fracttal é somente leitura para o Monitor: a sincronização traz os dados do CMMS, mas as alterações feitas no Monitor não são gravadas de volta. Campos editados manualmente permanecem com a marca **Manual** até serem revertidos em **Reverter p/ Fracttal**.

## Problemas comuns

- **Não consigo entrar** - confira e-mail e senha. Se a conta for Entra, use **Entrar com Microsoft**. Se a mensagem indicar falta de acesso, peça a um administrador para verificar a conta e o grupo.
- **Só aparece a troca de senha** - a conta ainda usa uma senha temporária. Defina uma nova senha com pelo menos 12 caracteres e entre novamente.
- **O painel não mostra barreiras** - usuários comuns sem grupo não veem dados. Peça ao administrador para incluir a conta em um grupo com as estações corretas.
- **Não recebo alertas** - verifique se a conta está ativa, se participa de um grupo com a estação da barreira e se existe uma regra que cubra o caso. A lista de Destinatários não controla a entrega.
- **O botão Exportar está desabilitado** - selecione ao menos uma linha.
- **Os dados parecem antigos** - consulte a página Sincronização. Se um campo estiver marcado como **Manual**, ele não é atualizado pelo Fracttal até ser revertido.
- **A tela está pesada** - em Aparência, ative **Reduzir animações** e **Desativar desfoque**.
