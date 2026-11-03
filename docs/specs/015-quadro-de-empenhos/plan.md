# Plan: 015 — Quadro de empenhos

**Spec:** [`spec.md`](spec.md) · **Data:** 2026-11-03 · **Script:** `backend/add-017-empenhos.mjs` · **Faixa de id local:** 86xx (leituras 8601–8619, escritas 8650–8669, JAVASCRIPT 8680–8681)

## Constitution Check

| Princípio | Como a 015 atende |
|---|---|
| I. Spec antes de código | spec commitada antes do código; P-01..P-14 com proposta, implementadas e trocáveis num ponto |
| II. Requisito testável | cada C-0NN e RN-0NN tem teste com o id no título (`frontend/tests/empenhos.test.mjs`, `backend/simulator/smoke/015-empenhos.mjs`) |
| III. Fora de escopo | seção da spec, com a próxima onda do quadro listada |
| IV. Migrations | nenhuma tocada; DDL em `setup-backend.mjs` (`DDL_015`), executado só no sandbox |
| V. Duas camadas | telas montam com o vocabulário de `page.tsx`; nenhum primitivo novo |
| VI. Tokens | nenhuma cor literal; série de gráfico por `corDeSerie`; estado sempre com rótulo |
| VII. Simplicidade | nenhuma dependência nova; regra pura num arquivo (`lib/empenhos.ts`); duas JAVASCRIPT só (carga e itens em lote) |

## Como se liga ao kanban

- **Quadro `empenhos`** da lib, criado pelo `add-017` no entrypoint (idempotente por slug, como o `add-005`), dez fases com chave em `SGC_EMP_FASE` (`BOARD_ID`, `CHAVE`, `FASE_ID`, `ORDEM`), lida pela `sgcEmpFasesListar`, e não na `SGC_FASE` do quadro de compras: as SFs de compras leem a `SGC_FASE` sem filtrar quadro e contariam vinte fases. Chaves com prefixo `emp_` (`emp_analise`, `emp_tecnica`, `emp_diretoria`, `emp_pedidos`, `emp_envio`, `emp_aguardando`, `emp_transito`, `emp_pendencia`, `emp_concluido`, `emp_cancelado`) para a chave ser inconfundível no gancho, que é um só para os dois quadros.
- **Campos** (nenhum obrigatório, nenhum de fase, RN-017 da 002): `orgao`, `filial`, `fornecedor`, `valor_contrato` (moeda), `cmv`, `situacao` — todos na capa; campo vazio não ocupa linha. A tela os escreve por `api.cardAtualizar` (uma chamada) depois de salvar a análise, de desmembrar e quando um pedido termina (RNF-003: a capa não custa SF por cartão).
- **Card nasce por `kbCardCriar`**: o empenho na janela Novo empenho; cada pedido desmembrado na aprovação da diretoria. `kbCardCriar` não recebe fase: o pedido nasce na primeira (Análise) e a tela o move para a fase de entrada (o gancho só libera esse par para pedido registrado).
- **`KB_BOARD.CONFIG_JSON`** não guarda nada.
- **Pai × filhos**: o vínculo é `SGC_EMP_CARD` (um por pedido, com `ID_EMPENHO`); o card do empenho é `SGC_EMP_EMPENHO.ID_CARD`. O papel de um card (empenho, pedido de indústria, transferência) sai dessas duas tabelas.

### O gancho é um só por projeto

`KB_META` guarda **um** `gancho:podeMover` e **um** `gancho:podeExcluir` (lib, regras ligadas). Os dois são `sgcPodeMover`/`sgcPodeExcluir` do `add-005`, que recusam todo par fora das fases de compras — sem mudança, nenhum card de empenho se moveria. A correção mínima, no arquivo do integrador:

- `add-017` exporta `RAMO_PODE_MOVER_EMPENHOS`, `RAMO_PODE_EXCLUIR_EMPENHOS` e `FORA_DOS_EMPENHOS` (SQL com o contrato do gancho: `usuarioId`, `cardId`, `boardId`, `faseId` → `PODE`, `MOTIVO`).
- `add-005`: `sqlPodeMover()`/`sqlPodeExcluir()` ganham `WHERE ${FORA_DOS_EMPENHOS}` na consulta de compras e `UNION ALL ${RAMO_…}`. Exatamente uma das duas metades devolve linha. Para um card de compras o texto de compras é o de antes (C-003, provado no smoke).

## Modelo de dados (`DDL_015` no `setup-backend.mjs`)

| Tabela | Conteúdo |
|---|---|
| `SGC_EMP_FASE` | `BOARD_ID`, `CHAVE`, `FASE_ID`, `ORDEM`; único (`BOARD_ID`, `CHAVE`) |
| `SGC_EMP_PREGAO` | `ID`, `CODIGO_EDITAL` (único), `ORGAO`, `CODCLI`, `DT_VIGENCIA_FIM`, `ATIVO`, `CRIADO_POR`, `CRIADO_EM` |
| `SGC_EMP_EMPENHO` (1:1 card) | `ID`, `ID_CARD` (único), `ID_PREGAO`, `NUM_EMPENHO`, `CODFILIAL`, `FILIAL`, `CODFILIAL_PEDIDO`, `DT_RECEBIMENTO`, `PRAZO_DIAS`, `PRAZO_UNIDADE` (`CORRIDOS`/`UTEIS`), `DT_LIMITE`, `ACEITA_PARCIAL`, `OBSERVACAO`, `VL_TOTAL`, `VL_CUSTO`, `CMV_PERC` (fração), `CONGELADO_EM`, `TEC_POR`/`TEC_EM`, `DIR_POR`/`DIR_EM`, `REPROV_FASE`/`REPROV_MOTIVO`/`REPROV_POR`/`REPROV_EM`, `DESMEMBRADO_EM`, `CANC_MOTIVO`/`CANC_POR`/`CANC_EM`, `CRIADO_POR`, `CRIADO_EM`, `ATUALIZADO_EM` |
| `SGC_EMP_ITEM` (`UNIQUE (ID_EMPENHO, CODPROD)`) | `CODPROD`, `DESCRICAO`, `EMBALAGEM`, `UNIDADE`, `CODFAB`, `CODFORNEC`, `FORNECEDOR`, `QT_EMPENHO`, `PRECO_VENDA`, `CUSTO_NEGOCIADO`, `CUSTO_ESPECIAL`, `CUSTO_PADRAO`, `TIPO_CUSTO_PEDIDO` (`''`/`PADRAO`), `QT_COMPRA`, `QT_TRANSFERENCIA`, `QT_ESTOQUE`, `CODFILIAL_ORIGEM`, `OBSERVACAO`, `ATUALIZADO_POR`, `ATUALIZADO_EM` |
| `SGC_EMP_CARD` (`UNIQUE (ID_CARD)`) | o pedido desmembrado: `ID_EMPENHO`, `ID_CARD`, `TIPO` (`FORNECEDOR`/`TRANSFERENCIA`), `CODFORNEC`, `FORNECEDOR`, `VL_TOTAL`, `VL_CUSTO`, `NUM_PEDIDO`, `DT_PEDIDO`, `DT_PREVISAO`, `DT_RECEBIDO`, `CRIADO_POR`, `CRIADO_EM` |
| `SGC_EMP_PENDENCIA` | `ID_EMPENHO`, `ID_CARD` (do pedido), `CODPROD`, `TIPO` (`BO`/`VENDA`/`TRANSFERENCIA`), `DESCRICAO`, `QT`, `CODFILIAL_ORIGEM`, `PREVISAO`, `STATUS` (`ABERTA`/`RESOLVIDA`/`CANCELADA`), `ABERTA_POR`/`ABERTA_EM`, `FECHADA_POR`/`FECHADA_EM` |

Os itens de um pedido não guardam o card: são os itens do empenho com `CODFORNEC` do pedido e compra > 0 (indústria) ou com transferência > 0 (transferência) — RN-010 sem coluna a mais.

## Server functions (`add-017-empenhos.mjs`)

Guarda de persona: o texto único da R-013, copiado (como no `add-016`). `OPERAR = admin, analista, gestor`; técnica `admin, gestor`; diretoria `admin, diretoria`. Toda escrita confere também que o card é do quadro `empenhos` e está na fase certa (por chave).

| Id | Nome | Tipo | O quê |
|---|---|---|---|
| 8601 | `sgcEmpPregoesListar` | SQL | pregões por edital/órgão com `QT_EMPENHOS`, valor, custo (RN-003) e `TOTAL_REGISTROS`; `limite`/`offset` |
| 8602 | `sgcEmpPregaoEmpenhos` | SQL | empenhos de um pregão com a fase (chave e nome) e o card; paginado |
| 8603 | `sgcEmpIndicadoresResumo` | SQL | em aberto, valor, custo no período (recebimento) e filial |
| 8604 | `sgcEmpPrazosListar` | SQL | empenhos abertos por dias de atraso (fuso -03:00), paginado |
| 8605 | `sgcEmpPorOrgao` | SQL | contrato e custo por órgão no período, paginado |
| 8606 | `sgcWintEmpProdutos` | SQL Oracle | busca de produto ativo (código ou nome), com `CODFAB` e a indústria, 20 linhas |
| 8607 | `sgcWintEmpClientes` | SQL Oracle | busca de cliente (órgão) por código ou nome, 20 linhas, com o ramo |
| 8608 | `sgcWintEmpEstoqueFiliais` | SQL Oracle | por produto × filial: físico, retido, disponível, venda 45 d e última venda (venda válida com público, P-02) |
| 8609 | `sgcWintEmpVendaMensal` | SQL Oracle | mês a mês: venda pública, privada (venda válida, rede fora) e compras |
| 8610 | `sgcEmpFasesListar` | SQL | `CHAVE`, `FASE_ID`, `ORDEM` do quadro de empenhos (`SGC_EMP_FASE`); a tela traduz chave → id por ela |
| 8650 | `sgcEscEmpPregaoCriar` | SQL | `INSERT … SELECT … WHERE guarda AND NOT EXISTS edital` |
| 8651 | `sgcEscEmpEmpenhoCriar` | SQL | capa sobre um card do quadro `empenhos` criado por quem chama, sem empenho ainda |
| 8652 | `sgcEscEmpCabecalhoSalvar` | SQL | cabeçalho na Análise (C-019) |
| 8653 | `sgcEscEmpItemGravar` | SQL interna | upsert em lote (fragmento `SELECT … UNION ALL`, guarda por `{{usuarioId}}`), só na Análise |
| 8654 | `sgcEscEmpItemRemover` | SQL interna | remove itens (lista de códigos), só na Análise |
| 8655 | `sgcEscEmpTotais` | SQL interna | valor, custo e CMV vivos (não toca o congelado) |
| 8656 | `sgcEscEmpAnaliseEnviar` | SQL | limpa aprovações e reprovação da rodada anterior (o passo do `antesDeMover` Análise → Técnica) |
| 8657 | `sgcEscEmpAprovarTecnica` | SQL | `TEC_POR/TEC_EM`, admin/gestor, card em `emp_tecnica` |
| 8658 | `sgcEscEmpAprovarDiretoria` | SQL | `DIR_POR/DIR_EM` **e** congela valor, custo e CMV na mesma instrução (RN-003) |
| 8659 | `sgcEscEmpReprovar` | SQL | motivo ≥ 10, pela persona da fase, na fase; apaga as aprovações |
| 8660 | `sgcEscEmpPedidoRegistrar` | SQL | vínculo do card gerado com o empenho aprovado, com valor e custo do pedido (RN-010) |
| 8661 | `sgcEscEmpPendenciasTransferencia` | SQL | uma pendência `TRANSFERENCIA` por item com transferência > 0 (uma instrução) |
| 8662 | `sgcEscEmpDesmembrado` | SQL | `DESMEMBRADO_EM`, só com pedido registrado (P-07) |
| 8663 | `sgcEscEmpPedidoEnvio` | SQL | número e data do pedido, pedido de indústria em `emp_envio` |
| 8664 | `sgcEscEmpPedidoPrevisao` | SQL | previsão de chegada, pedido em `emp_aguardando`/`emp_transito`/`emp_pendencia` |
| 8665 | `sgcEscEmpPedidoRecebido` | SQL | data do recebimento, pedido em `emp_transito` |
| 8666 | `sgcEscEmpPendenciaAbrir` | SQL | `BO`/`VENDA`, descrição ≥ 10, pedido aberto |
| 8667 | `sgcEscEmpPendenciaFechar` | SQL | só `ABERTA` → `RESOLVIDA`/`CANCELADA` |
| 8668 | `sgcEscEmpCancelar` | SQL | motivo ≥ 10, empenho não final |
| 8680 | `sgcEmpCarregar` | JAVASCRIPT | abrir o card: empenho, pregão, itens, pedidos, pendências e o papel do card numa execução (RNF-001) |
| 8681 | `sgcEmpItensGravar` | JAVASCRIPT | itens em lote (lotes de 200) + totais; confere a persona por `:VAR_USER` antes de chamar as internas por id (RNF-002) |
| (002) | `sgcPodeMover`/`sgcPodeExcluir` | SQL | ganham o ramo do quadro `empenhos` (acima) |

Reaproveitadas, sem mudança: `sgcCustoPadraoAtual` e `sgcCustoEspeciaisProdutos` (add-013, R-128/R-125: o especial do órgão é a política vigente do `CODCLI` do pregão), `sgcWintFiliais` (add-004), `sgcFasesListar` (add-005), `kbCardCriar`/`kbCardMover`/`kbCardAtualizar`/`kbNotaRegistrar` (lib).

Venda (R-131): `VENDA_VALIDA` e `PUBLICO` importados de `backend/venda-valida.mjs`. Análise: `VENDA_VALIDA` (com público, P-02). Indicadores: `VENDA_VALIDA AND PUBLICO` × `VENDA_VALIDA AND NOT PUBLICO` (P-03).

## O gancho do quadro `empenhos` (RN-008/RN-009)

Uma subconsulta traduz o card em chaves: persona efetiva, acesso, criador, `ORIGEM`/`DESTINO` (`SGC_EMP_FASE`), `PAPEL` (`EMPENHO`/`FORNECEDOR`/`TRANSFERENCIA`/`''`), o estado do empenho (aprovações, reprovação, desmembrado, cancelamento), do pedido (nº, datas) e as contagens (itens não prontos, itens a pedir, pendências abertas do pedido, pedidos e pedidos finais/cancelados do empenho). O `CASE` recusa na ordem: comercial, somente-leitura, restrito alheio, diretoria fora da fase, par fora da lista do papel, e então a condição do par. `MOTIVO` vazio quando pode (R-020). O mesmo texto existe em TS em `motivoDeDestinoEmpenho` (`lib/empenhos.ts`), alimentado pelo `sgcEmpCarregar` — a tela desabilita, o servidor recusa.

Excluir (C-034): empenho na Análise sem pedido, por admin/gestor/diretoria; card sem empenho (criação que falhou no meio) também por quem o criou.

## Telas

| Rota | Arquivo | O quê |
|---|---|---|
| `/empenhos` | `pages/empenhos/EmpenhosPage.tsx` | `KanbanBoard slug="empenhos"` com `novoCard` "Novo empenho" (`?novo=1`, janela `NovoEmpenhoDialogo`), `conteudoDaFase` (`ConteudoEmpenho`: análise, aprovação, pedidos do empenho, pedido), `acoesExtras` (`AcoesEmpenho`), `abasExtras` Pregão (`AbaPregao`), `podeMover`/`antesDeMover`/`podeExcluir`, 60 s; a página faz a única carga por card aberto (`sgcEmpCarregar`) e a entrega por `EmpenhoContexto` (`pages/empenhos/contexto.ts`) |
| `/empenhos/admin` | `pages/empenhos/EmpenhosAdminPage.tsx` | `BoardAdmin slug="empenhos"` (só admin) |
| `/empenhos/pregoes` | `pages/empenhos/PregoesPage.tsx` | lista paginada com busca, o pregão escolhido com os empenhos e o consolidado |
| `/empenhos/indicadores` | `pages/empenhos/IndicadoresEmpenhosPage.tsx` | período + filial, KPIs, gráfico mês a mês (barras lado a lado, `LabelList`, R-116), prazos e por órgão paginados; seções em `SecaoRecolhivel` com resumo (R-126) |

Peças: `operacoes.ts` (desmembrar, cancelar levando os pedidos, reagrupar, capa por `kbCardAtualizar`), `analise.tsx` (um bloco por item com os campos em grade — doze colunas não cabem no painel do card), `itens.tsx` (busca no ERP, campo numérico, resumo do CMV), `dialogos.tsx` (formulário com texto ≥ 10, data e escolha), `DialogoPregao.tsx`. O gráfico dos indicadores reusa `GraficoBarras` de `pages/galderma/grafico.tsx` sem mudá-lo. O mesmo `sgcEmpCarregar` alimenta `estadoDaCarga`, e o smoke prova que tela e gancho dão a mesma frase em cada card × persona × destino.

Menu: grupo novo **Empenhos** (Quadro de empenhos, Pregões, Indicadores), `verEmpenhos`. Permissões novas em `lib/permissoes.ts`: `verEmpenhos` (todos menos comercial; atravessa somente-leitura), `operarEmpenhos` (admin, analista, gestor; zera em somente-leitura); as aprovações usam `aprovarTecnica`/`aprovarDiretoria` de sempre.

## Regra pura (`frontend/src/lib/empenhos.ts`)

Chaves e transições (`FASES_EMPENHO`, `motivoDeDestinoEmpenho`, `motivoDeExcluirEmpenho`), `custoEfetivo`, `cmvItem`, `totaisEmpenho`, `cmvAcimaDaReferencia`, `dataLimite`/`prazoEmDias` (sobre `lib/dias-uteis.ts` se servir, senão local), `validarDecisao`, `origemPrincipal`, `prontidaoDaAnalise`, `resumoDaFilial`, `planoDeDesmembramento`, `destinoDoReagrupamento`, `destinoAoAbrirPendencia`/`destinoAoFecharPendencia`, `nivelDoPrazo` (entrega e vigência)/`alertaDoEmpenho`/`diasAte`/`hojeEmBrasilia`, `validarNovoEmpenho`, `tituloDoEmpenho`/`tituloDoPedido`, `outrosEmpenhos`, `textoSituacao`, `estadoDaCarga`, `custoEspecialDoOrgao`, `filiaisDoItem`. Testes em `frontend/tests/empenhos.test.mjs`.

## Simulador

- `seed/015-empenhos.mjs`: o quadro `empenhos` (fases, `SGC_EMP_FASE`, campos), um pregão, um empenho na Análise com dois itens de duas indústrias e as linhas `PC*` próprias (produtos 6601–6603, cliente órgão público 9661 e privado 9662, indústrias 1661 e 1662, movimentos de venda e entrada) para as `sgcWintEmp*` no SQLite. Ligado ao `seed.mjs` (integrador) depois do 014.
- `smoke/015-empenhos.mjs`: o fluxo inteiro com as SFs reais (criar → análise → técnica → diretoria → desmembrar → envio → trânsito → pendência → concluído → reagrupamento; reprovação; cancelamento; excluir) e o gancho de compras intacto.
- `smoke/015-empenhos-winthor.mjs`: as quatro `sgcWintEmp*` no WinThor real, contagem > 0 (fora do `npm test`, como o da 014).
- `config.mjs`: `add-017-empenhos.mjs` no `PUBLISH_ORDER`; parâmetros novos no `CHECK_INPUT`.

## Ordem no sandbox

`setup-backend.mjs` → … → `add-016` → **`add-017-empenhos.mjs`** (cria o quadro e as SFs) → `add-005-quadro-compras.mjs` (republica o gancho com o ramo) → `sync-server-function-map.mjs` → `add-002-perfil-acesso.mjs` (por último).

## Complexity Tracking

| Desvio | Por quê | Alternativa rejeitada |
|---|---|---|
| Toque no `add-005` (arquivo do integrador) | o gancho é um por projeto; sem o ramo nenhum card de empenho se move | copiar a regra de compras para um gancho novo (duas fontes da mesma regra) |
| Fase a mais (`emp_pedidos`) | a lib não esconde card (P-01) | mudar a lib daqui (proibido) |
| Duas JAVASCRIPT | carga do card numa execução e itens em lote (teto de 300/min) | uma SF por item ou cinco leituras ao abrir |

## Riscos

- `kbCardCriar` sem fase: o pedido passa segundos na Análise antes de ir à fase de entrada; se o movimento falhar, o card fica lá e o gancho continua liberando o par para ele (repetível na tela).
- Desmembrar é uma sequência da tela (criar, registrar, mover por pedido): se a janela fechar no meio, o empenho fica sem `DESMEMBRADO_EM` com parte dos pedidos; repetir a aprovação registra só o que falta (`UNIQUE` por card, e pedidos já registrados são pulados pela tela).
