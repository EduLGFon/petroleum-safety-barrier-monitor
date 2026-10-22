# Manual do Usuario - Monitor de Barreiras de Segurança

Documento de uso em portugues (pt-BR). Descreve o painel visto pelo usuario final.
Para detalhes tecnicos, veja `docs/ARCHITECTURE.md`, `docs/API.md` e `docs/DATABASE.md`.

## 1. Introducao

O Monitor de Barreiras de Segurança acompanha o estado operacional das barreiras de
seguranca que protegem equipamentos de processo em uma instalacao de oleo e gas.
As barreiras sao importadas do sistema de manutencao (CMMS) do operador,
normalizadas em um modelo pequeno no PostgreSQL e servidas em um painel
Fresh/Preact. No painel e possivel filtrar por instalacao, criticidade,
disponibilidade e conformidade, acompanhar tendencias de conformidade por
categoria, editar registros, exportar relatorios e receber avisos por e-mail
quando uma barreira se degrada.

## 2. Acesso e perfis

- A unica rota publica e `/login`. Visitantes anonimos sao redirecionados para
  `/login?next=...` e voltam para a pagina original apos o login.
- Existem dois perfis: `admin` e `user`.
- Nao existe auto-cadastro. A primeira conta e criada pelo administrador via
  linha de comando (`deno task admin:create`).
- A sessao dura 12 horas. Logout revoga a sessao imediatamente.
- Troca de senha pelo proprio usuario (aba Conta nas configuracoes) revoga todas
  as sessoes, inclusive a atual. A politica exige de 12 a 256 caracteres.
- Administradores podem redefinir a senha de qualquer usuario na aba Usuarios,
  revogando apenas as sessoes desse usuario.

## 3. Visao geral do painel

O painel principal (`/`) contem, de cima para baixo:

1. Cabecalho com o nome do operador (quando configurado), o indicador de
   saude (sincronizacao + conexao) e os botoes de configuracoes e exportacao.
2. Faixa de KPIs: total, disponíveis, nao conformes, contingenciados, percentual
   de conformidade, nao conformes criticos, sem plano de acao e "outros estados",
   mais a faixa de criticidade.
3. Faixa de status de disponibilidade, dimensionada por volume. Clicar em um
   segmento filtra a tabela por aquele status. Administradores tambem tem os
   segmentos Desativadas e Excluidas, que trocam o escopo de visibilidade.
4. Barra de filtros.
5. Grafico de conformidade por categoria.
6. Tabela de barreiras com paginacao.
7. Modal de detalhes da barreira (abre ao clicar em uma linha).

O painel ocupa toda a largura da tela (sem limite de 1400 px), para usar o
monitor inteiro.

## 4. Filtros

A barra de filtros permite combinar:

- Busca textual (com debounce), em tag e codigo de instalacao.
- Tipologia.
- Categoria.
- Portao de criticidade (um toque lista apenas as faixas criticas ESO e A).
- Disponibilidade.
- Conformidade.
- Plano de acao (com / sem).
- Intervalo de datas (`Desde` / `Ate`).

Regras:

- As opcoes de filtro sao as vocabularias vivas do banco; nao ha lista fixa.
- "Limpar filtros" aparece quando algo esta ativo.
- A contagem de resultados e exibida ao vivo.
- A tabela abre sem filtros, com 25 linhas por pagina, ordenada por id
  crescente.
- Os filtros padrao e a ordenacao padrao podem ser configurados no painel de
  configuracoes.

## 5. Tabela de barreiras

- Cabecalhos ordenaveis (Enter/Espaco, `aria-sort`).
- 10 colunas alternaveis e reordenaveis a partir de um dialogo portado.
- Dois toggles de filtro extras fixados na tabela.
- Selecao tri-estadual com escopos estilo Gmail: pagina atual, todo o conjunto
  filtrado e limpar.
- Paginacao com campo "ir para pagina". Tamanhos de pagina: 25, 50 e 100.
- Linhas nao conformes mostram o chip "dias sem contingência".
- A ultima coluna visivel nao pode ser ocultada.
- A selecao sobrevive a mudancas de pagina e filtro, e e limitada ao restaurar.

## 6. Detalhes e historico

O modal da barreira tem tres abas:

- Detalhes: campos de identificacao, instalacao, tipologia, criticidade,
  categoria, grupo, proprietario, disponibilidade, conformidade, data de status,
  comentarios, plano de acao e os campos de texto livre da ficha de
  inventario.
- Historico: linha do tempo de mudancas de status.
- Edicao: apenas para administradores (ver secao 7).

## 7. Edicao (somente admin)

Administradores podem editar campos centrais e da ficha, e alterar o status de
disponibilidade. A mudanca de status passa por `record_status_change()`, que
atualiza disponibilidade e data de status e acrescenta historico de forma
atomica. Escritas com o mesmo status nao geram historico nem alerta.

A sobreposicao manual de contingência (Há Contingência?=Sim) promove
Degradado para Degradado Contingenciado e Indisponível para Indisponível
Contingenciado na exibicao e no PATCH.

Apos uma mudanca de status, o sistema pode enviar alertas imediatos conforme
as regras configuradas, e sempre enfileira o evento para o ciclo de digest.

## 8. Grafico de conformidade

Dois modos:

- Barras horizontais empilhadas por categoria.
- Resumo executivo: rosca com percentual de conformidade e lista Top-NC.

Funcionalidades:

- Ordenacao por volume, taxa de nao conformidade ou nome.
- Expansao alem das 20 primeiras categorias em uma cauda agregada.
- Clique em uma linha para filtrar a tabela.
- Busca interna por categoria.
- Geometria adaptada a densidade e a largura do monitor.
- Tooltip limitado a area visivel.
- Preferencias persistidas.

## 9. Exportacao

Formatos: CSV, XLSX e PDF. Toda exportacao cobre a selecao inteira (inclusive
selecoes que cruzam paginas nunca carregadas no navegador), com streaming a
partir do banco.

Limites e conteudo:

- Teto de 200.000 linhas por exportacao. Acima disso a exportacao e recusada
  com a contagem real, para que os filtros sejam estreitados. Nada e cortado
  silenciosamente.
- A selecao e intersectada com os filtros ativos no servidor, para que uma
  selecao antiga nao amplie o arquivo.
- CSV: 30 colunas, UTF-8 com BOM, separado por ponto e virgula, mais bloco
  RESUMO de KPIs.
- XLSX: pasta de trabalho OOXML real, com cabecalho de marca, faixa de KPIs,
  linha de cabecalho congelada com autofiltro, larguras ajustadas, cores de
  status e criticidade, IDs numericos e uma aba Resumo.
- PDF: bytes PDF reais, relatorio em A4 paisagem com bloco de marca, chips de
  KPI, as 30 colunas (partes fixas, texto quebrado, nada cortado na borda do
  papel), linha de cabecalho repetida e numeracao de paginas no rodape.
- Arquivos nomeados com a data da exportacao, um arquivo por exportacao.

## 10. Configuracoes e tema

O painel de configuracoes (engrenagem) permite:

- Tema: claro, escuro ou preto puro.
- Cor de destaque: 8 paletas, que recoloram o fundo da pagina.
- Densidade: 3 presets, que re-ritmam a interface via variaveis CSS.
- Reducao de movimento.
- Filtros padrao e ordenacao padrao.
- Troca de senha (aba Conta).

Aba administrativa (somente admin):

- Usuarios: listar, criar, editar, remover; protecao do ultimo admin ativo.
- Destinatarios de alerta: listar, criar, ativar, remover.
- Regras de alerta: definir gatilhos por categoria, status de chegada,
  criticidade, recuperacao, dias de atraso, imediato vs. digest.
- Opcoes de campo: listas curadas por pergunta da ficha.

Tudo persiste em `localStorage` e e restaurado antes da hidratacao, evitando
flash de tema errado.

## 11. Indicador de sincronizacao e conexao

- Um ponto de saude unico combina o estado de sincronizacao (nucleo) com o
  estado de conexao (halo), com animacoes distintas.
- Linha de status com hora local e deltas `+N ~N -N`.
- Cartao flutuante com a duracao do ultimo ciclo e o que mudou.
- Modal de auditoria listando as linhas tocadas pelo ciclo.
- A sonda de conexao faz ping a cada 5 segundos e pausa em abas ocultas.
- Estados de sincronizacao: sincronizando, ocioso, atrasado, desconhecido.

## 12. Papeis e permissoes

| Acao                                | user | admin |
| ----------------------------------- | ---- | ----- |
| Visualizar dashboard, KPIs, grafico | sim  | sim   |
| Filtrar e ordenar                   | sim  | sim   |
| Exportar                            | sim  | sim   |
| Ver linhas excluidas/desativadas    | nao  | sim   |
| Editar barreira                     | nao  | sim   |
| Alterar status                      | nao  | sim   |
| Gerenciar usuarios                  | nao  | sim   |
| Gerenciar destinatarios e regras    | nao  | sim   |
| Gerenciar opcoes de campo           | nao  | sim   |

Chamadas anonimas a API recebem 404 com a mesma forma de uma rota inexistente;
credenciais invalidas recebem 401. Escritas falham fechadas quando nenhuma
credencial esta configurada.

## 13. Persistencia local

Tres chaves no `localStorage`:

- `barrier-dashboard`: instalacao, filtros, selecao, linha aberta, colunas
  visiveis e fixadas.
- `barrier-chart`: modo do grafico, ordenacao, expansao.
- `barrier-settings`: tema, cor, densidade, movimento, filtros e ordenacao
  padrao.

Cada chave e validada campo a campo na restauracao; uma pagina salva antiga
se autocorrige.

## 14. Atalhos e acessibilidade

- Escape fecha todas as sobreposicoes.
- Tab fica preso dentro dos dialogos e o foco retorna ao gatilho.
- Anel de foco visivel.
- Regioes ao vivo para a linha de sincronizacao e o status da tabela.
- Suporte a reducao de movimento (toggle mais preferencia do sistema).
- Nao ha atalhos globais de tecla unica.

## 15. Status de disponibilidade e conformidade

Disponibilidade (seis estados):

| Status                      | Significado                                                   |
| --------------------------- | ------------------------------------------------------------- |
| Disponível                  | Livre de falhas ou defeitos                                   |
| Degradado                   | Obra corretiva planejada aberta no ativo protegido            |
| Indisponível                | Obra corretiva emergencial aberta no ativo protegido          |
| Degradado Contingenciado    | Igual ao degradado, com contingência em vigor                 |
| Indisponível Contingenciado | Igual ao indisponível, com contingência em vigor              |
| Fora de Operacao            | O ativo protegido esta fora de servico, isolado positivamente |

Os dois estados contingenciados sao estados de exibicao sobre os dois estados
base: obra corretiva aberta mais sinal de contingência (evidencia GM/CEC ou
nota explicita de contingência no texto da obra, ou Há Contingência?=Sim na
ficha) promove Degradado para Degradado Contingenciado e Indisponível para
Indisponível Contingenciado.

Conformidade e sempre derivada: `Conforme` ou `Não Conforme`. Qualquer
disponibilidade fora do conjunto conforme conta como nao conforme, em toda a
aplicacao, de forma consistente.

Criticidade ranqueada: `ESO > A > B > C > D`. ESO e A sao as faixas criticas
que alimentam o KPI de nao conformes criticos, o filtro "somente criticos" e a
urgencia dos alertas.

Urgencia (necessita atencao agora):

| Nivel   | Regra                                  |
| ------- | -------------------------------------- |
| critico | nao conforme E faixa critica (ESO / A) |
| urgente | qualquer outro nao conforme            |
| nenhum  | conforme                               |

Ordenacao dentro de um nivel: mais critico primeiro, depois a data de status
mais antiga, depois o id.

## 16. Limites e observacoes

- Teto de exportacao: 200.000 linhas por arquivo.
- Tamanhos de pagina: 25, 50, 100.
- Sessao: 12 horas.
- Senha: de 12 a 256 caracteres.
- Limites de taxa por endereco remoto: 120/min leituras, 30/min escritas,
  120/min exportacoes, 10/min trocas de senha.
- O grafico expande alem das 20 primeiras categorias em cauda agregada.
- A interface e pt-BR; identificadores, comentarios e logs sao em ingles.

## 17. Mapa de documentacao

| Documento              | Cobre                                                      |
| ---------------------- | ---------------------------------------------------------- |
| `docs/USO.md`          | Este manual (uso final)                                    |
| `docs/ARCHITECTURE.md` | Modulos, fluxos, ciclo de vida, topologia de ilhas, config |
| `docs/API.md`          | Contrato de fio, endpoints, autenticacao, throttling       |
| `docs/DATABASE.md`     | Esquema, invariantes, passo a passo de configuracao        |
| `docs/GLOSSARY.md`     | Mapeamento de valor de exibicao para identificador         |
| `docs/STATUSES.md`     | Definicoes de status de disponibilidade                    |
| `readme.md`            | Escopo do produto e convencoes (em ingles)                 |
| `agents.md`            | Regras do espaco de trabalho para agentes e contribuidores |
