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

Contingência: vínculos da barreira como contingência e vice-versa. Elegíveis: ativas, não excluídas, Disponível, Conforme, mesma instalação. Admins criam/removem vínculos e preenchem referências.

## 6. Configurações

Tema, cor, densidade, movimento reduzido, filtros padrão, ordenação padrão, alteração de senha, edição de perfil e, para admins, usuários, destinatários, regras de alerta e opções de campos.

## 7. Exportação

CSV, XLSX e PDF sobre o conjunto selecionado/filtrado.

Informações técnicas: `docs/ARCHITECTURE.md`, `docs/API.md`, `docs/DATABASE.md`.
