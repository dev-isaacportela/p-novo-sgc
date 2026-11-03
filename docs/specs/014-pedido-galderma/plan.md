# Plan: Pedido Galderma

**Spec:** `spec.md` · **Data:** 2026-11-03 · **Faixa de id:** 84xx (`add-016-galderma.mjs`) · **Registro no 000:** R-150

## Constitution Check

| Princípio | Como a feature atende |
|---|---|
| I. Spec antes de código | `spec.md` com 31 cenários e 15 regras; as divergências do legado viraram as perguntas P-01..P-14 com padrão provisório reversível (nenhuma bloqueia o plan) |
| II. Requisito testável | cada C-0NN e RN-0NN tem linha na tabela **Testes** abaixo, com arquivo e camada |
| III. Escopo negativo | *Fora de escopo* da spec: variação/dentro do mês, NF, observação por filial, outros fornecedores, pizza, xlsx |
| IV. Migrations | nenhuma: o DDL entra no `setup-backend.mjs` (arquivo do integrador, só escrito); `backend/migrations/` intocado |
| V. Duas camadas | telas montadas com o vocabulário de `page.tsx`; nenhum primitivo novo; nenhuma dependência nova (P-03: CSV em vez de `xlsx`) |
| VI. Tokens | cor só por token; séries de gráfico por `corDeSerie`; semáforo por `Status` com texto; zero `style={{}}` |
| VII. Simplicidade | regra pura num arquivo (`lib/galderma.ts`, testado); SQL de uma instrução por SF; nenhum JavaScript novo no servidor, nenhum cron |
| VIII. Build | `cd frontend && npm run build && npm run lint`; commit sem trailer de agente |
| IX. Credenciais | nada de `.env` no git; nenhuma `VITE_*` nova; WinThor e Gestão de Custos só no simulador da VPS |

## Como o pedido Galderma se liga ao kanban

A negociação **não** é card: ela vive nas tabelas `SGC_GALD_*` e é a origem de N
pedidos de compra comuns. "Gerar pedidos" cria, por filial com pedido gravado > 0, um
pedido no quadro `compras` pelo **mesmo caminho do carrinho da 011** (R-091):

1. `api.cardCriar` (`kbCardCriar` — ordem, texto de busca, movimento, automação; regra do
   CLAUDE.md) com `titulo = "Galderma · <filial> · <competência>"` e os valores da capa do
   quadro (`fornecedor`, `filial`, `prioridade: 'normal'`, `valor_total`).
2. `sgcEscGaldCardRegistrar` (8462) — o vínculo `SGC_GALD_NEGOCIACAO_CARD`
   (`UNIQUE (ID_NEGOCIACAO, CODFILIAL)`), gravado **logo depois** do card: é ele que torna
   a geração retomável (RN-009/C-016).
3. `sgcEscGaldPedidoCapaCriar` (8463) — a capa em `SGC_PEDIDO` com `ORIGEM = 'galderma'`
   (cabe nos 20 caracteres de R-098). Escrita própria (P-14): a de `/quadro?novo=1`
   (`sgcEscPedidoCriar`, 7250) tem lista fechada `('manual', 'compras_inteligentes')` e o
   `add-005` não é desta feature. A própria cobra o fornecedor 1541, a negociação não
   convertida e a filial participante.
4. `sgcItensGravar` (003, JavaScript existente) com os itens **inteiros** (R-112):
   `qtPedida = qtSugerida = pedido gravado`, `precoCusto = PRECO_LISTA_DESC` e
   `tipoPreco = 'especial'` (P-01), estoque e trânsito da posição, `unPorCaixa`, curva `C`,
   `coberturaDias` = cobertura futura da filial, `coberturaLimite` = cobertura alvo.
   A remontagem da Análise preserva o item existente inteiro (`Itens.tsx`, "o que já estava
   na lista manda"), então o preço negociado sobrevive ao abrir o card.
5. Ao fim, `sgcEscGaldNegociacaoConverter` (8464), que só converte se **nenhuma** filial com
   pedido > 0 ficou sem vínculo com capa — a regra está no SQL, não só na tela.

Retomada: `sgcGaldCardsListar` (8408) devolve, por filial, o card e se já tem capa
(`TEM_CAPA`). Filial com vínculo e capa é pulada; com vínculo e sem capa, refaz 3 e 4 sobre
o mesmo card (as duas são idempotentes por `ID_CARD`). A única janela de card órfão é entre
1 e 2 (uma volta de rede) — `ponytail:` sem transação entre o motor e o domínio; o upgrade
é um `kbCardCriar` que aceite um gancho de pós-criação.

Nenhum gancho novo no quadro, nenhum campo de fase novo, nenhuma mudança em
`pages/quadros/`. O pedido gerado segue o fluxo normal das dez fases.

## Modelo de dados (DDL no `setup-backend.mjs`, bloco `DDL_014`)

```sql
CREATE TABLE IF NOT EXISTS SGC_GALD_NEGOCIACAO (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  COMPETENCIA VARCHAR(7) NOT NULL,           -- AAAA-MM
  DATA_PEDIDO VARCHAR(10) NOT NULL,
  DESCRICAO VARCHAR(200),
  FILIAIS VARCHAR(200) NOT NULL,             -- CSV de códigos de filial, só dígitos
  COBERTURA_ALVO_DIAS INT NOT NULL DEFAULT 35,
  TRANSITO_COMO_COMPRA INT NOT NULL DEFAULT 0,
  META_SELLOUT_VALOR DECIMAL(15,2) NOT NULL DEFAULT 0,
  OBSERVACAO VARCHAR(1000),
  STATUS VARCHAR(12) NOT NULL DEFAULT 'aberta', -- aberta | fechada | convertida
  ID_PAI INT NOT NULL DEFAULT 0,             -- 0 = não é complementar
  CRIADO_POR INT, CRIADO_EM VARCHAR(19),
  ATUALIZADO_POR INT, ATUALIZADO_EM VARCHAR(19),
  INDEX IX_SGC_GALD_NEG_COMP (COMPETENCIA)
);
CREATE TABLE IF NOT EXISTS SGC_GALD_ITEM (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  ID_NEGOCIACAO INT NOT NULL,
  CODPROD INT NOT NULL,
  EAN VARCHAR(20), DESCRICAO VARCHAR(200),
  PRECO_SELLOUT DECIMAL(14,4) NOT NULL DEFAULT 0,
  PRECO_NET DECIMAL(14,4) NOT NULL DEFAULT 0,
  PRECO_LISTA DECIMAL(14,4) NOT NULL DEFAULT 0,
  PRECO_LISTA_DESC DECIMAL(14,4) NOT NULL DEFAULT 0,
  ESTOQUE_INICIAL DECIMAL(15,3) NOT NULL DEFAULT 0,
  MEDIA_SELLOUT DECIMAL(15,3) NOT NULL DEFAULT 0,
  PREVISAO_SELLOUT DECIMAL(15,3) NOT NULL DEFAULT 0,
  PROPOSTA_SELLIN DECIMAL(15,3) NOT NULL DEFAULT 0,
  META_SELLIN_VALOR DECIMAL(15,2) NOT NULL DEFAULT 0,
  OBSERVACAO VARCHAR(500),
  CRIADO_EM VARCHAR(19), ATUALIZADO_EM VARCHAR(19),
  UNIQUE KEY UK_SGC_GALD_ITEM (ID_NEGOCIACAO, CODPROD)
);
CREATE TABLE IF NOT EXISTS SGC_GALD_ITEM_FILIAL (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  ID_ITEM INT NOT NULL,
  CODFILIAL VARCHAR(4) NOT NULL,
  QTD_PEDIDA DECIMAL(15,3) NOT NULL DEFAULT 0,
  ATUALIZADO_POR INT, ATUALIZADO_EM VARCHAR(19),
  UNIQUE KEY UK_SGC_GALD_ITEM_FILIAL (ID_ITEM, CODFILIAL)
);
CREATE TABLE IF NOT EXISTS SGC_GALD_DECISAO_LOG (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  ID_NEGOCIACAO INT NOT NULL, ID_ITEM INT NOT NULL, CODPROD INT NOT NULL,
  CODFILIAL VARCHAR(4) NOT NULL,
  CAMPO VARCHAR(30) NOT NULL DEFAULT 'QTD_PEDIDA',
  ANTES VARCHAR(50), DEPOIS VARCHAR(50),
  POR INT, EM VARCHAR(19),
  INDEX IX_SGC_GALD_LOG_NEG (ID_NEGOCIACAO)
);
CREATE TABLE IF NOT EXISTS SGC_GALD_NEGOCIACAO_CARD (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  ID_NEGOCIACAO INT NOT NULL,
  CODFILIAL VARCHAR(4) NOT NULL,
  ID_CARD INT NOT NULL,
  POR INT, EM VARCHAR(19),
  UNIQUE KEY UK_SGC_GALD_NEG_CARD (ID_NEGOCIACAO, CODFILIAL)
);
CREATE TABLE IF NOT EXISTS SGC_GALD_SELLOUT (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  CODPROD INT NOT NULL,
  COMPETENCIA VARCHAR(7) NOT NULL,
  PREVISAO_SELLOUT DECIMAL(15,3) NOT NULL DEFAULT 0,
  ATUALIZADO_POR INT, ATUALIZADO_EM VARCHAR(19),
  UNIQUE KEY UK_SGC_GALD_SELLOUT (CODPROD, COMPETENCIA)
);
CREATE TABLE IF NOT EXISTS SGC_GALD_SELLOUT_LOG (
  ID INT AUTO_INCREMENT PRIMARY KEY,
  CODPROD INT NOT NULL,
  COMPETENCIA VARCHAR(7) NOT NULL,
  ANTES VARCHAR(50), DEPOIS VARCHAR(50),
  ORIGEM_ANTERIOR VARCHAR(10) NOT NULL,      -- mesa | lancado
  POR INT, EM VARCHAR(19),
  INDEX IX_SGC_GALD_SELLOUT_LOG (COMPETENCIA, CODPROD)
);
```

Sem `OBSERVACAO` por filial (P-12) e sem FK (padrão do projeto). Status em minúsculas,
como as situações do resto do SGC 2. `SGC_PEDIDO.ORIGEM` ganha o valor `galderma` (só
dado; o tipo não muda).

## Server Functions (`backend/add-016-galderma.mjs`, faixa 84xx)

Leituras 8401–8430, escritas 8450–8479. Toda escrita é SQL de **uma** instrução, chamada
direto da tela, guardada por `:VAR_USER` com a guarda literal da 002 (`guarda([...])`, a
mesma do `add-014`), lista `OPERAR = ['admin', 'analista', 'gestor']` (RN-015, P-10).
Nenhum JavaScript, nenhum cron. Fornecedor fixo **1541** no SQL (constante `GALDERMA`,
nunca parâmetro). As `sgcWint*` entram em `WINTHOR` e recebem o `jdbcId` por nome.

**Venda válida (RF-003):** `VENDA_VALIDA` e `PUBLICO` vêm de `backend/venda-valida.mjs`,
importados — não copiados. O arquivo é **byte a byte** o da `feature/003-analise-legado`
(que o extraiu do `add-013` e ainda não entrou em `develop`): os dois merges ficam limpos e,
quando a 003 entrar, o `add-013` passa a importar dele. Até lá o `add-013` tem a cópia
antiga, que não é desta feature tocar. Recorte da Galderma = `VENDA_VALIDA AND NOT PUBLICO`
(o público fica fora sempre, sem seletor — como o legado e o padrão da R-131).

**Estoque disponível** = `GREATEST(QTEST − QTBLOQUEADA − QTRESERV, 0)` (legado; o
`QTINDENIZ` da R-085 não entra — no WinThor real ele repete o bloqueado da filial 1, 116 un.).
**Trânsito** = `QTPEDIDA + QTTRANSITO` (o SQL vivo do legado, `fix-galderma-transito-
pedidos-pendentes`, e a R-085; o `18-pedido-galderma.md` está desatualizado nesse ponto).
**Corte de data** = `M.DTMOV >= TO_DATE(início) AND TRUNC(M.DTMOV) <= TO_DATE(fim)` (o
`+ 1` do legado não existe no dialeto do simulador; o resultado é o mesmo).

| Id | Nome | Tipo | Parâmetros → colunas |
|---|---|---|---|
| 8401 | `sgcWintGaldProdutos` | SQL Oracle | — → `CODPROD, DESCRICAO, EAN, EMBALAGEM, UNIDADE, UN_POR_CAIXA_ERP` (ativos: `OBS2` vazio), `ORDER BY DESCRICAO` |
| 8402 | `sgcWintGaldPosicao` | SQL Oracle | `codprods` (fragmento), `filiais` (fragmento), `dataInicioTri`, `dataFimTri`, `dataInicioMes`, `dataFimMes` → `CODPROD, CODFILIAL, FILIAL, QTEST, QTEST_FISICO, QTBLOQUEADA, QTRESERV, QT_PEDIDA_ERP, QT_TRANSITO, EM_TRANSITO, VENDA_MES, VENDA_TRIMESTRE, COMPRA_MES` (uma passada na PCMOV de `dataInicioTri` a `dataFimMes`, com `CASE` por janela) |
| 8403 | `sgcGaldNegociacoesListar` | SQL | `limite`, `offset` → a negociação + `CRIADO_POR_NOME`, `TEM_COMPLEMENTAR`, `CARDS`; `ORDER BY DATA_PEDIDO DESC, ID DESC` |
| 8404 | `sgcGaldItensListar` | SQL | `idNegociacao`, `limite`, `offset` → o item; `ORDER BY CODPROD` |
| 8405 | `sgcGaldPedidosFilialListar` | SQL | `idNegociacao` → `ID_ITEM, CODPROD, CODFILIAL, QTD_PEDIDA` |
| 8406 | `sgcGaldHerdadoListar` | SQL | `idNegociacao` (a complementar) → `CODPROD, CODFILIAL, QTD_HERDADA` da de origem |
| 8407 | `sgcGaldDecisaoLogListar` | SQL | `idNegociacao`, `limite`, `offset` → log + `DESCRICAO`, `POR_NOME`; `ORDER BY ID DESC` |
| 8408 | `sgcGaldCardsListar` | SQL | `idNegociacao` → `CODFILIAL, ID_CARD, TEM_CAPA, EM` |
| 8409 | `sgcGaldAcompanhamento` | SQL | `competenciaInicio`, `competenciaFim` → por `CODPROD × COMPETENCIA`: preços (`MAX`), estoque inicial, média, previsão e proposta **só das negociações sem origem** (`ID_PAI = 0`, P-09), meta de sell-in e `PEDIDO_ENVIADO` (soma de todas) |
| 8410 | `sgcWintGaldRealizadoMensal` | SQL Oracle | `dataInicio`, `dataFim` → `CODPROD, CODFILIAL, MES, VENDA_REALIZADA, VALOR_VENDA, COMPRA_REALIZADA, VALOR_COMPRA` |
| 8411 | `sgcGaldSelloutListar` | SQL | `competenciaInicio`, `competenciaFim` → `CODPROD, COMPETENCIA, PREVISAO_SELLOUT, POR_NOME, ATUALIZADO_EM` |
| 8412 | `sgcGaldSelloutLogListar` | SQL | `competenciaInicio`, `competenciaFim`, `limite`, `offset` → log + `DESCRICAO`, `POR_NOME`; `ORDER BY ID DESC` |
| 8413 | `sgcWintGaldEstoqueInicial` | SQL Oracle | `dataInicio` → `CODPROD, CODFILIAL, QTEST_HOJE, ENTRADAS, SAIDAS, ESTOQUE_INICIAL` (sem `DTCANCEL`; a nota `CONDVENDA 7` não conta como saída física — RN-013) |
| 8414 | `sgcWintGaldComposicao` | SQL Oracle | `dataInicio`, `dataFim` → por `CODFILIAL`: `FILIAL, VALOR_SELLIN, QTD_SELLIN, VALOR_VENDAS, QTD_VENDAS` (o grupo é soma na tela) |
| 8415 | `sgcWintGaldEstoqueAtual` | SQL Oracle | — → por `CODPROD × CODFILIAL` (filial ≠ 99, físico > 0): `FILIAL, QT_DISPONIVEL, QT_FISICO`; o valor é `× custo padrão` na tela (R-128) |
| 8450 | `sgcEscGaldNegociacaoCriar` | SQL | `competencia, dataPedido, descricao, filiais, coberturaAlvoDias, transitoComoCompra, metaSelloutValor, observacao, idPai, agora`; recusa filiais vazias; `idPai` só se convertida, mesma competência e sem complementar (P-08) |
| 8451 | `sgcEscGaldNegociacaoAtualizar` | SQL | `id` + os campos do cabeçalho; `WHERE STATUS <> 'convertida'` (P-06/P-07); `ID_PAI` não muda |
| 8452 | `sgcEscGaldNegociacaoSituacao` | SQL | `id, status` (`aberta`/`fechada`); só entre as duas |
| 8453 | `sgcEscGaldNegociacaoExcluirPedidos` | SQL | `id`; pedidos por filial da não convertida |
| 8454 | `sgcEscGaldNegociacaoExcluirItens` | SQL | `id`; itens da não convertida |
| 8455 | `sgcEscGaldNegociacaoExcluir` | SQL | `id`; a não convertida (o log fica) |
| 8456 | `sgcEscGaldItemSalvar` | SQL | `idNegociacao, codprod, ean, descricao` + os 9 números + `observacao, agora`; upsert por `(ID_NEGOCIACAO, CODPROD)`; negociação aberta |
| 8457 | `sgcEscGaldItemImportar` | SQL | idem sem `precoLista`, `metaSellinValor`, `observacao` — o `ON DUPLICATE KEY UPDATE` não os toca (P-05) |
| 8458 | `sgcEscGaldItemExcluirPedidos` | SQL | `idItem`; negociação aberta |
| 8459 | `sgcEscGaldItemExcluir` | SQL | `idItem`; negociação aberta |
| 8460 | `sgcEscGaldPedidoFilialSalvar` | SQL | `idItem, codfilial, qtdPedida, agora`; upsert; negociação aberta e filial participante |
| 8461 | `sgcEscGaldDecisaoLogInserir` | SQL | `idItem, codfilial, antes, depois, agora`; `INSERT … SELECT` com a **mesma** condição de 8460 (RNF-006) |
| 8462 | `sgcEscGaldCardRegistrar` | SQL | `idNegociacao, codfilial, cardId, agora`; `NOT EXISTS` + `UNIQUE`; negociação não convertida |
| 8463 | `sgcEscGaldPedidoCapaCriar` | SQL | `cardId, idNegociacao, codfilial, filial, periodoInicio, periodoFim, agora`; `ORIGEM = 'galderma'`, `CODFORNEC = 1541`; exige o vínculo de 8462 com esse card |
| 8464 | `sgcEscGaldNegociacaoConverter` | SQL | `id`; `WHERE STATUS <> 'convertida' AND NOT EXISTS (filial com pedido > 0 sem vínculo com capa)` |
| 8465 | `sgcEscGaldSelloutSalvar` | SQL | `codprod, competencia, previsaoSellout, agora`; upsert |
| 8466 | `sgcEscGaldSelloutExcluir` | SQL | `codprod, competencia` |
| 8467 | `sgcEscGaldSelloutLogInserir` | SQL | `codprod, competencia, antes, depois, origemAnterior, agora` |

Reaproveitadas, sem mudança: `sgcWintFiliais` (7105, nomes de filial), `sgcCustoUnidadesPorCaixa`
(caixa do Gestão de Custos), `sgcCustoPadraoAtual` (8114, custo padrão — R-128), `sgcPersonaAtual`,
`kbBoardCarregar`/`kbCardCriar` (pela `api` da lib), `sgcItensGravar` (003).

Fragmentos (`codprods`, `filiais`): só dígitos e vírgulas, validados na regra pura
(`listaDeCodigos`) antes da chamada; vazio vira `0`/`-1` (não casa nada). Sem paginação nas
leituras do ERP: são as linhas de um fornecedor (21 produtos × até 8 filiais) — `ponytail:`
teto prático de ~2.000 linhas; acima disso a posição teria de ir por lote de produtos.

## Telas

| Rota | Arquivo | Conteúdo |
|---|---|---|
| `/galderma` | `pages/galderma/PedidoGaldermaPage.tsx` | lista de negociações (paginada) + mesa da selecionada: cabeçalho e situação, KPIs (proposta, saldo simulado, sugestão, pedido, valor), valores em reais (`GradeKpi`), tabela do grupo com linha expansível por filial (`GaldermaLinhaFiliais.tsx`), diálogos de negociação, item, importação, histórico, extrato e geração |
| `/galderma/acompanhamento` | `pages/galderma/AcompanhamentoGaldermaPage.tsx` | filtros, KPIs do mês, dois gráficos do período (sell-out meta × realizado, sell-in proposta × enviado), tabela de uma competência com blocos de colunas (`ChipContagem` para esconder), lançamento de sell-out e histórico |
| `/galderma/composicao` | `pages/galderma/ComposicaoGaldermaPage.tsx` | filtros, barras de sell-in e de vendas por filial (valor e participação em cada barra), painel de estoque de agora a custo padrão |

As três páginas compartilham `pages/galderma/abas.tsx` (navegação entre as três telas e a
recusa de acesso), `acesso.ts` (o hook de persona), `grafico.tsx` (barras com o valor em cada
marca, R-116) e `formato.ts` (rótulos curtos). Teto de 800 linhas por arquivo: a mesa se divide em
`PedidoGaldermaPage.tsx` (estado e carga), `mesa.tsx` (tabela do grupo e da filial) e
`dialogos.tsx` (os diálogos).

Menu: grupo **Compras** ganha "Pedido Galderma" (`/galderma`) depois de "Compras
inteligentes" — `permissoes.ts` (`verGalderma`, `operarGalderma`) e o ícone em
`AdminLayout.tsx`. Rotas no `App.tsx`. Os três arquivos são do integrador: a mudança é a
mínima e fica listada no relatório.

## Regra pura (`frontend/src/lib/galderma.ts` e `galderma-acompanhamento.ts`)

Dois arquivos pelo teto de 800 linhas: a mesa em `galderma.ts`, o acompanhamento e a composição em `galderma-acompanhamento.ts`.

Porte de `galderma-calculos.ts`, `galderma-importar.ts` (parser), `galderma-modelo-
planilha.ts`, `galderma-kanban.ts` (`montarPedidosPorFilial`) e dos cálculos do
acompanhamento, sem React e sem transporte:

- `periodoDaCompetencia`, `periodoDoTrimestre`, `competenciasDoPeriodo`, `recuarCompetencia`
- `calcularLinhaFilial`, `consolidarGrupo`, `tomCobertura`, `ehMultiploCaixa`,
  `proximoMultiploCaixa`, `sugestaoEmCaixa` (P-04), `metaSellinDoItem`, `precoListaCheio`,
  `somarValores`
- `montarMesa(itens, pedidos, posicoes, herdado, simulacao, negociacao, caixas)` → linhas do grupo
- `montarPedidosPorFilial(mesa, nomes)` → o que vira pedido (só o **gravado**, C-015) e
  `itemDoPedidoGalderma` → o `ItemPedido` inteiro da 003
- `cabecalhoPadrao(hoje)`, `validarCabecalho`, `listaDeCodigos`
- `parsearPlanilha(texto)` (CSV `;` ou `,`, aspas, RN-010), `numeroDaPlanilha`, `textoDoModelo`
- `linhasCsvMesa`, `extratoPorFilial`
- acompanhamento: `juntarAcompanhamento`, `percentualDaMeta`, `semaforoDaMeta`,
  `faltaPercentual`, `totaisAcompanhamento`, `serieMensal`, `textoDivergenciaEstoque`
- composição: `montarComposicao` (filial/grupo, participação), `valorizarEstoque` (custo padrão)
- permissão: `podeOperarGalderma(permissoes, situacao)`

A permissão de rota e menu fica em `permissoes.ts` (`verGalderma`: admin, analista,
gestor, diretoria; `operarGalderma`: admin, analista, gestor; READ_ONLY zera operar).

## Orçamento de execuções (teto 300/min)

| Momento | Chamadas |
|---|---|
| abrir a mesa | 4 (`sgcGaldNegociacoesListar`, `sgcWintFiliais`, `sgcWintGaldProdutos`, `sgcPersonaAtual` em cache) |
| escolher negociação | até 6 (itens, pedidos por filial, cards, herdado se complementar, posição, caixas) |
| digitar pedido | 0; confirmar 2; mesmo valor 0 |
| gerar pedidos | `boardCarregar` + `cardsListar` + 4 por filial + converter |
| acompanhamento | 5; trocar a competência da tabela: 1 (estoque inicial) |
| composição | 3; trocar filtro: 1 (a composição; estoque e custo não se repetem) |

Nada roda em intervalo, nada por linha da tabela.

## Simulador

- `simulator/seed/014-galderma.mjs`: fornecedor **1541** em `PCFORNEC`; produtos **5801–5806**
  (com EAN), `PCEST` nas filiais 1, 2 e 6, `PCESTTRANSITO`, vendas e compras de 2026-05 a
  2026-09 (comuns, públicas, entre filiais, remessa `CONDVENDA 8`, cancelada), custo padrão
  em `CUSTOPRODUTO` (um produto sem custo), unidades por caixa em `CUSTO_PRODUTOS`; uma
  negociação convertida de 2026-08 com itens e pedidos por filial, e uma aberta de 2026-09.
  Clientes 9501–9504, `NUMTRANSVENDA` ≥ 980001.
- `seed.mjs` registra `seed014`; `smoke.mjs` registra a suíte; `config.mjs` ganha
  `add-016-galderma.mjs` no `PUBLISH_ORDER` (depois do `add-014`; o `add-015` é da 013) e as
  chaves novas do `CHECK_INPUT` (`idNegociacao`, `idItem`, `filiais`, `dataInicioTri`,
  `dataFimTri`, `dataInicioMes`, `dataFimMes`, `competenciaInicio`, `competenciaFim`).
- `smoke/014-galderma.mjs`: um `teste()` por cenário de servidor (tabela abaixo), SF real e
  banco descartável.
- `smoke/014-galderma-winthor.mjs`: roda as seis `sgcWint*Gald*` no **WinThor real** e prova
  contagem > 0 para a Galderma (só com `SIMULATOR_WINTHOR=oracle`; fora do `npm test`, como o
  `winthor-checar.mjs`). Uso: `cd backend && node simulator/smoke/014-galderma-winthor.mjs`.

## Testes

| Cenário / regra | Teste | Arquivo |
|---|---|---|
| C-001 | `test('C-001 …')` cabeçalho padrão e validação; `teste('C-001 …')` criar devolve aberta, sem filial não cria | `frontend/tests/galderma.test.mjs`, `smoke/014-galderma.mjs` |
| C-002, C-003 | `teste('C-002 …')`, `teste('C-003 …')` na `sgcWintGaldPosicao` do seed; `test('C-003 …')` períodos | smoke, frontend |
| C-004..C-008 | `test(…)` puros | frontend |
| C-009, C-011 | `test(…)` parser e modelo | frontend |
| C-009, C-010, C-012 | `teste(…)` importar, preservar, unicidade | smoke |
| C-013, C-016, C-017, C-018 | `teste(…)` situação, retomada, convertida, herdado | smoke |
| C-014, C-015 | `test(…)` montagem dos pedidos; `teste('C-014 …')` cria card pelo `kbCardCriar`, vínculo, capa `galderma`, itens, converte | frontend, smoke |
| C-019..C-022, C-024, C-025, C-028 | `test(…)` puros | frontend |
| C-023 | `test(…)` origem anterior; `teste(…)` grava, loga, remove | frontend, smoke |
| C-026 | `teste('C-026 …')` reconstrução; `test('C-026 …')` texto | smoke, frontend |
| C-027 | `teste('C-027 …')` proposta só da de origem | smoke |
| C-029 | `teste('C-029 …')` composição do seed; `test('C-029 …')` participação e grupo | smoke, frontend |
| C-030 | `test('C-030 …')` valorização | frontend |
| C-031 | `teste('C-031 …')` diretora e comercial não gravam; `test('C-031 …')` matriz | smoke, `frontend/tests/permissoes.test.mjs` |
| RN-001..RN-015 | `test('RN-0NN …')` / `teste('RN-0NN …')` conforme a tabela da spec | frontend, smoke |

## Complexity Tracking

| Desvio | Por quê | Alternativa rejeitada |
|---|---|---|
| `backend/venda-valida.mjs` novo, idêntico ao da `feature/003-analise-legado` | reaproveitar o recorte sem copiá-lo e sem tocar o `add-013` | `export` no `add-013` (conflita com a 003, que apagou essas linhas) |
| Escrita própria da capa (`sgcEscGaldPedidoCapaCriar`) | `sgcEscPedidoCriar` tem lista fechada de origem e é do `add-005` (P-14) | origem `manual` (perde a origem); editar o `add-005` (fora da feature) |
| Arquivos do integrador tocados: `setup-backend.mjs`, `config.mjs`, `seed.mjs`, `smoke.mjs`, `permissoes.ts`, `permissoes.test.mjs`, `App.tsx`, `AdminLayout.tsx`, `server-functions.ts` | rota, menu, permissão, DDL e registro de seed/suíte não têm outro lugar | — (mudança mínima, listada no relatório) |
| CSV em vez de `.xlsx` (P-03) | `design.md` §1.4: dependência nova exige emenda | `npm i xlsx` |
| Participação em barras, não rosca | `design.md` §12.3: pizza não entra em tela operacional | rosca do legado |
