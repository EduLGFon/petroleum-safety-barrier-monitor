# Manual do Usuário - Monitor de Barreiras de Segurança

## 1. Introdução

O Monitor acompanha o estado operacional das barreiras que protegem equipamentos de processo. É possível filtrar, acompanhar conformidade, consultar/editar registros, exportar relatórios e receber alertas por e-mail.

## 2. Acesso

Perfis: `admin` e `user`. A única rota pública é `/login`.

- Login local por e-mail e senha, ou Microsoft Entra ID quando configurado.
- Contas podem ser locais ou Entra.
- Sessão válida por 12 horas; logout revoga imediatamente.
- Senha: 12 a 256 caracteres. Alteração de senha revoga todas as sessões.
- Admins podem redefinir senhas e revogar sessões de usuários.

## 3. Painel

De cima para baixo: cabeçalho, KPIs, distribuição por disponibilidade, filtros, gráfico de conformidade por categoria, tabela e janela de detalhes.

Filtros: busca textual, tipologia, categoria, criticidade, disponibilidade, conformidade, plano de ação e datas. Opções são dinâmicas.

## 4. Tabela

- Cabeçalhos ordenam.
- 10 colunas exibíveis/ocultáveis e reordenáveis.
- Paginação: 25, 50 ou 100 registros.
- Linhas não conformes exibem dias sem contingência.
- Seleção por página, por filtro ou limpar.

## 5. Detalhes

Abas: Detalhes, Contingência, Histórico. Admins também veem Edição.

Na aba Detalhes, o bloco "Causa da Disponibilidade" explica o status atual e mostra a OS ou SS que influenciou a disponibilidade, com referência, classificação, detalhe e sinal de contingência quando houver. A explicação é derivada do histórico persistido, sem criar registros novos.

Contingência: vínculos da barreira como contingência e vice-versa. Elegíveis: ativas, não excluídas, Disponível, Conforme, mesma instalação. Admins criam/removem vínculos e preenchem referências.

Campos manuais: ao editar uma barreira, os campos alterados passam a ser
marcados como "Manual" e a sincronização Fracttal deixa de sobrescrevê-los.
O botão "Devolver ao sync" libera o campo para seguir o Fracttal novamente
na próxima sincronização. Cada campo exibe a origem no Fracttal para orientar
a correção na fonte.

## 6. Configurações

Tema, cor, densidade, tamanho do texto, movimento reduzido, filtros padrão, ordenação padrão, alteração de senha, edição de perfil e, para admins, usuários, destinatários, regras de alerta e opções de campos.

O tamanho do texto tem quatro opções (Pequeno, Padrão, Grande e Muito grande). A densidade continua controlando o espaçamento; o tamanho do texto ajusta apenas a leitura e é salvo neste navegador.

## 7. Exportação

CSV, XLSX e PDF sobre o conjunto selecionado/filtrado.

Informações técnicas: `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATABASE.md`.
