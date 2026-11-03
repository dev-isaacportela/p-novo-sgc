# Plan: 017 — Solicitações: apoio à avaliação e visões agrupadas

**Spec:** [`spec.md`](spec.md) · **Data:** 2026-11-03 · **Script:** `backend/add-019-solicitacoes-apoio.mjs` · **Faixa de id local:** 88xx (leituras 8801–8802)

## Constitution Check

| Princípio | Como a 017 atende |
|---|---|
| I. Spec antes de código | spec commitada com o código; P-01..P-09 com a opção recomendada implementada, aguardando o usuário |
| II. Requisito testável | cada C-NN e RN-NN tem teste com o id no título (`frontend/tests/solicitacoes-apoio.test.mjs`, `frontend/tests/solicitacoes-visoes.test.mjs`, `backend/simulator/smoke/017-solicitacoes-apoio.mjs`) |
| III. Fora de escopo | seção da spec |
| IV. Migrations | nenhuma tocada; **nenhum DDL** (não há `DDL_017`): as duas SFs leem as tabelas da 008 |
| V. Duas camadas | as telas montam com o vocabulário de `page.tsx` (`AlternaOpcoes`, `Table`, `FilterChip`, `Pagination`…); nenhum primitivo novo |
| VI. Tokens | nenhuma cor literal; a série do gráfico é a do `VendasNaFilial` (`corDeSerie(1)`), com o valor em cada barra (R-116) |
| VII. Simplicidade | nenhuma dependência nova; o apoio **reusa** três SFs e dois componentes que já existem; regra pura em dois arquivos de `lib/` |

## O que se reusa (pedido do usuário)

| Peça | De onde | Para quê |
|---|---|---|
| Venda válida | `backend/venda-valida.mjs` (`VENDA_VALIDA`, `PUBLICO`, R-131) | já é o recorte das SFs abaixo; nada novo é escrito |
| `sgcWintProdutoHistorico` (8102) | `add-013` | saídas por mês com `SAIDAS_PUBLICAS` à parte; `meses = 7` |
| `VendasNaFilial` + `lib/vendas-filial.ts` (R-139) | `pages/compras-inteligentes/vendas-filial-ui.tsx` | o gráfico de 6 meses fechados + o corrente parcial, com total, média, estoque e cobertura — "vale para todo o SGC". Recebe `semPublico` e o estoque disponível |
| `sgcWintProdutoVendasNotas` (R-135) | `add-013` | as notas de venda válida por cliente na janela, com `incluirPublico = 0` |
| `lib/clientes-produto.ts` (R-135) | o "Clientes que compraram" do popup do kanban | `semPublico`, `clientesDoMes`, `topClientes`, `janelaDosClientes` — os cinco maiores são `topClientes(clientesDoMes(semPublico(notas), '', meses), false, 5)` |
| `sgcWintProdutoEstoqueFiliais` (8104) | `add-013` | `ESTOQUE_ATUAL` (líquido de bloqueado, avariado e reservado) e `ESTOQUE_EM_TRANSITO` (pedido + trânsito) da filial |
| Fragmentos da lista | `add-011` (`RECORTE_COMERCIAL`, `JUNCOES_SOLICITACAO`, `FILTROS_PUBLICADOS`, agora exportados) e `sql/situacao-solicitacao.sql` | as visões agrupadas filtram e recortam com o **mesmo texto** da lista detalhada (R-070/R-075) |

`add-011` muda só em três `export` (as constantes já existiam): é a forma de a mesma régua de
filtro e recorte valer nas duas consultas sem cópia.

## Apoio à avaliação

- **Onde (P-01):** `AvaliarDialogo` (`solicitacoes-dialogos.tsx`), entre a ficha da solicitação e o
  motivo, só quando o diálogo **não** é `somenteRecusa` (a recusa pelo bloco da montagem segue como
  está). O diálogo passa a `sm:max-w-3xl` nesse caso. Componente novo
  `pages/solicitacoes/ApoioAvaliacao.tsx`.
- **Consultas (RNF-01):** três, no `useEffect` de abertura: o `VendasNaFilial` faz a sua (com o
  cache por produto × filial que já tem); `sgcWintProdutoVendasNotas` e
  `sgcWintProdutoEstoqueFiliais` ficam num `Map` de promessas no módulo, por chave, como o do
  `VendasNaFilial` — reabrir a mesma solicitação não consulta de novo. Cada uma falha sozinha
  (`Promise` separada, `EmptyState` com a mensagem — RN-06).
- **Janela (P-02):** `janelaDoApoio(hoje)` = `janelaDosClientes(hoje, MESES_CONSULTA_FILIAL)`: do dia 1
  do sexto mês fechado até hoje — os mesmos 7 meses de `serieDaFilial`.
- **Cliente da solicitação (P-05):** `clienteNoApoio(lista, codcli)` devolve
  `sem_cliente` | `entre_os_cinco` | `fora_dos_cinco` (com quantidade e notas) | `nao_comprou`.
- **Estoque (P-04):** `estoqueNoApoio(linhas, codfilial)` devolve `{ disponivel, aCaminho }` ou `null`
  (sem posição). O `VendasNaFilial` recebe o disponível (calcula a cobertura); sem disponível ele
  recebe `null` e a prop opcional nova `semEstoque` com o porquê ("carregando", "não foi possível
  ler", "sem posição de estoque nesta filial") — o padrão da prop é o texto de antes, e as telas que
  já o usam não mudam.
- **Teto (RNF-04):** `listaParcial(notas)` = `notas.length >= 3000` (o teto da SF).
- Layout: o gráfico do `VendasNaFilial` em cima; embaixo, em duas colunas a partir de `sm`, a
  tabela dos cinco maiores (Cliente, Qtd., Notas, Última) com a linha do cliente da solicitação em
  `aria-selected` + barra à esquerda (§8.8), e a ficha de estoque (disponível, a caminho) com a
  frase do cliente da solicitação.

## Visões agrupadas

- **Alternador:** `AlternaOpcoes` "Visão" com Detalhada · Por vendedor · Por fornecedor · Por filial,
  na faixa acima da `Toolbar` (dentro do mesmo `Panel`, colada ao que filtra — §9.2). Detalhada é o
  padrão e não se lembra entre visitas.
- **Componente novo** `pages/solicitacoes/VisoesAgrupadas.tsx`: recebe a dimensão e os filtros, chama
  `sgcSolicitacoesAgrupar` + `sgcSolicitacoesAgruparTotal` (RNF-02: só quando a visão é escolhida),
  desenha a tabela e a `Pagination` (20 grupos). A lista detalhada não é consultada enquanto a visão
  agrupada está aberta.
- **Abrir o grupo (P-07):** o nome do grupo é um botão; `filtroDoGrupo(dimensao, grupo)` devolve
  `{ vendedor }`, `{ codfornec }` ou `{ codfilial }` e o rótulo; a página aplica, volta à Detalhada e
  mostra a ficha. O filtro de vendedor é novo na tela (a SF da lista já tinha `{{vendedor}}`, que a
  tela mandava sempre `0`): estado `{ id, nome }`, ficha "Vendedor", sem seletor próprio na barra.
  O seletor de fornecedor e o de filial ganham a opção do grupo aberto mesmo que ela não esteja
  na página à vista (a lista de opções deles sai da página, como antes).

## Server functions (`add-019-solicitacoes-apoio.mjs`)

Nenhuma escrita, nenhuma guarda de persona nova: a leitura da fila é de todas as personas, e o
recorte do comercial é o `RECORTE_COMERCIAL` da 008 (`:VAR_USER`).

| Id | Nome | Tipo | O quê |
|---|---|---|---|
| 8801 | `sgcSolicitacoesAgrupar` | SQL | uma linha por grupo: `CHAVE`, `ROTULO`, `TOTAL`, `PRODUTOS`, `PENDENTES`, `NA_FILA`, `EM_COMPRA`, `ATENDIDAS`, `NAO_ATENDIDAS`, `ENCERRADAS`, `ULTIMA`. Params: `dimensao` (`vendedor`/`fornecedor`/`filial`), os filtros da `sgcSolicitacoesListar` (`status`, `situacao`, `codfornec`, `codfilial`, `vendedor`, `minhas`, `busca`), `limite`, `offset` |
| 8802 | `sgcSolicitacoesAgruparTotal` | SQL | `TOTAL` = número de grupos, mesmos params sem `limite`/`offset` |

Forma da consulta:

```sql
SELECT T.CHAVE, MAX(T.ROTULO) AS ROTULO, COUNT(*) AS TOTAL, COUNT(DISTINCT T.CODPROD) AS PRODUTOS,
  SUM(CASE WHEN T.STATUS = 'pendente' THEN 1 ELSE 0 END) AS PENDENTES,
  SUM(CASE WHEN T.STATUS = 'aprovada' AND T.SITUACAO = 'sem_pedido' THEN 1 ELSE 0 END) AS NA_FILA,
  SUM(CASE WHEN T.STATUS = 'aprovada' AND T.SITUACAO NOT IN ('sem_pedido','atendida','nao_atendida') THEN 1 ELSE 0 END) AS EM_COMPRA,
  …ATENDIDAS, NAO_ATENDIDAS, ENCERRADAS (recusada, cancelada), MAX(T.CRIADO_EM) AS ULTIMA
FROM ( SELECT S.CODPROD, S.STATUS, S.CRIADO_EM, ${SITUACAO} AS SITUACAO,
         CASE '{{dimensao}}' WHEN 'vendedor' THEN CAST(S.CRIADO_POR AS CHAR)
                             WHEN 'fornecedor' THEN CAST(S.CODFORNEC AS CHAR)
                             ELSE S.CODFILIAL END AS CHAVE,
         CASE … UC.NOME / S.FORNECEDOR / COALESCE(NULLIF(S.FILIAL,''), S.CODFILIAL) END AS ROTULO
       FROM SGC_SOLICITACAO S ${JUNCOES_SOLICITACAO}
       WHERE ${RECORTE_COMERCIAL} ${FILTROS_PUBLICADOS}
         AND '{{dimensao}}' IN ('vendedor','fornecedor','filial') ) T
GROUP BY T.CHAVE
ORDER BY TOTAL DESC, ULTIMA DESC, T.CHAVE
LIMIT {{limite}} OFFSET {{offset}}
```

A partição de RN-07 é completa porque `STATUS` só tem quatro valores (`pendente`, `aprovada`,
`recusada`, `cancelada`) e a régua de situação devolve `sem_pedido` para tudo que não é aprovado
com card vivo (R-076). O total do grupo é `COUNT(*)`, e a tela confere a soma (`particaoConfere`).

## Regra pura (`frontend/src/lib/`)

| Arquivo | Funções |
|---|---|
| `solicitacoes-apoio.ts` | `janelaDoApoio`, `cincoMaiores`, `clienteNoApoio`, `estoqueNoApoio`, `listaParcial`, `TETO_NOTAS` |
| `solicitacoes-visoes.ts` | `DIMENSOES`, `OPCOES_VISAO`, `linhaDoGrupo` (normaliza números e rótulo vazio), `filtroDoGrupo`, `particaoConfere`, `COLUNAS_SITUACAO` |

## Simulador

- **Seed** `backend/simulator/seed/017-solicitacoes-apoio.mjs` — só WinThor, nada no banco do projeto
  (as contagens da 008 não mudam): o produto **5311** "SUPLEMENTO PROTEICO SEM SABOR 400 G" do
  fornecedor 1042; clientes 9311–9318 (9317 órgão público, ramo 11; 9318 ramo 20, a rede); `PCEST`
  da filial 3 (80 físico, 10 bloqueado, 5 reservado, 24 pedido) e 12 em `PCESTTRANSITO`; as vendas
  do C-01..C-03 em datas relativas a hoje (dia 15 dos meses fechados, dia 1 do corrente), mais os
  controles do C-02 (público, rede, remessa futura com `PCNFSAID.CONDVENDA = 8`, filial 1, entrada,
  e uma venda de 8 meses atrás). `NUMTRANSITEM` a partir de 970001.
- **Smoke** `backend/simulator/smoke/017-solicitacoes-apoio.mjs` — as três SFs reusadas sobre o 5311
  (contagem > 0) e as duas novas sobre **sete solicitações inseridas pela própria suíte** (fornecedor
  1099, dois autores, três cards do quadro de compras nas fases enviado, concluído e cancelado). A
  suíte roda por último e só lê depois de inserir; as suítes anteriores não veem esses dados.
- `config.mjs`: `add-019` no fim do `PUBLISH_ORDER`; `CHECK_INPUT` ganha `dimensao: 'vendedor'`.
- Portas desta feature: simulador **3111**, Vite **5181**.

## Ordem no sandbox

`add-019` roda depois do `add-011` e do `add-013` (lê os fragmentos de um e as SFs reusadas são do
outro) e antes do `add-002`. Nenhum `setup-backend` novo.

## Complexity Tracking

| Desvio | Por quê |
|---|---|
| `add-011` (arquivo da 008) ganha três `export` | a alternativa é copiar o recorte e os filtros, e R-070 proíbe duas cópias da mesma régua |
| `VendasNaFilial` (R-139) ganha a prop opcional `semEstoque` | com estoque nulo ele escrevia "ver o alerta", texto do card; passar `0` afirmaria estoque zero e cobertura inventada. O padrão da prop é o texto antigo, então o card e as Compras inteligentes não mudam |
