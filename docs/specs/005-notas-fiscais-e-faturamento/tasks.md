# Tasks: Notas fiscais e faturamento — detecção, conferência e cobrança

**Plan:** `plan.md` · **Data:** 2026-09-15

> Ordem de execução. Nenhuma decisão de design se resolve aqui — se apareceu
> uma, volta pro `plan.md`.
>
> `[P]` = paralelizável (arquivos distintos, sem dependência entre si).
> **pedir à base / ao integrador** = arquivo compartilhado; esta feature não o edita.

## Backend

- [x] **T-001** — **Pedir à BASE (S2), antes do fan-out** (C-4/G-11): a base cria **todas** as tabelas e colunas da onda 2 numa passada só, antes de 005/006/007 começarem — nenhuma das três cria tabela no seu próprio `add-*`, e `SGC_AVISO` é compartilhada (a 006 e a 007 só gravam nela por `sgcEscAvisoInserir`). Da 005: `SGC_NF`, `SGC_NF_ITEM`, `SGC_NF_OCORRENCIA`, `SGC_NF_SUGESTAO`, `SGC_CONTATO_FATURAMENTO` e `SGC_AVISO` no `setup-backend.mjs`, com as colunas, os `UNIQUE KEY` (`UK_SGC_NF (ID_CARD, NUMNOTA, SERIE)`, `UK_SGC_NF_ITEM (ID_NF, CODPROD, NUMLOTE)`, `UK_SGC_NF_SUGESTAO (CHAVENFE, ID_CARD)` **e** `(ID_CARD, CODFORNEC, NUMNOTA, SERIE)`, `UK_SGC_AVISO (CHAVE)`) e os índices da seção *Modelo de dados*; mais as seis colunas novas de `SGC_PEDIDO` (`DT_PRIMEIRO_FATURAMENTO`, `VL_FATURADO`, `PERC_FATURADO_VALOR`, `PERC_FATURADO_QTD`, `ALERTA_FATURAMENTO_NIVEL`, `ALERTA_FATURAMENTO_EM`), **no `CREATE`**, sem `ALTER` → `backend/setup-backend.mjs`
- [x] **T-002** — **Pedir à base (S2)**: `backend/lib/dias-uteis.mjs` com `diasUteisEntre(colInicio, colFim)`, `somarDiasUteis(col, n)`, `somarDiasCorridos(col, n)` (os três fragmentos SQL do plan, `n` literal ou nome de coluna, base em fim de semana recuando para sexta) e os gêmeos puros `diasUteisEntreDatas`, `somarDiasUteisData`, `somarDiasCorridosData` → `backend/lib/dias-uteis.mjs`
- [x] **T-003** — Criar `add-008-notas-fiscais.mjs` com o esqueleto padrão (`definitions` exportado, preâmbulo JS do `add-005`, `__SGC_IDS__` com as SFs chamadas por id, `isEntrypoint()` resolvendo o `jdbcId` do WinThor por nome, `configureSdkMitra` guardado por `if (process.env.MITRA_BASE_URL)`) → `backend/add-008-notas-fiscais.mjs`
- [x] **T-004** `[P]` — `sgcWintNfEntradas` (7501): a consulta do plan, uma linha por item, com `ESPECIE = 'NF'`, `DTCANCEL IS NULL`, a janela de emissão **ou** a lista de `NUMPED`, e o `ROWNUM <= 2000` na consulta externa ordenada → `backend/add-008-notas-fiscais.mjs`
- [x] **T-005** `[P]` — `sgcWintNfItens` (7502) e `sgcWintNfParcelas` (7503): itens com lote, validade, `CODFAB` e `CODAUXILIAR`; parcelas de `PCLANC` com `DIAS = TRUNC(DTVENC - DTEMISSAO)` → `backend/add-008-notas-fiscais.mjs`
- [x] **T-006** `[P]` — `sgcWintNfBuscar` (7504): busca híbrida por número + fornecedor, **sem** exigir `DTENT`, `DTCANCEL IS NULL`, `ROWNUM <= 5` → `backend/add-008-notas-fiscais.mjs`
- [x] **T-007** `[P]` — `sgcNfSugestoesListar` (7505) e `sgcNfSugestoesListarTotal` (7506), com o `NOT EXISTS` que tira da fila a nota já vinculada quando o status ainda é `sugerida` e o parâmetro `hoje` (`COALESCE(NULLIF('{{hoje}}',''), CURDATE())`) por trás da coluna `DE_HOJE` (G-5) → `backend/add-008-notas-fiscais.mjs`
- [x] **T-008** — `sgcFaturamentoPendenteListar` (7508) e `sgcFaturamentoPendenteListarTotal` (7509): fases `enviado`/`transito`/`faturamento`/`bo`, `PERC_FATURADO_VALOR < 100`, `DIAS_UTEIS` pelo fragmento de T-002 contado até `COALESCE(NULLIF('{{hoje}}',''), CURDATE())` (parâmetro `hoje`, vazio em produção — G-5), as quatro faixas, `DT_PREVISAO_BO` e `QT_BO_ABERTO` (R-041) → `backend/add-008-notas-fiscais.mjs`
- [x] **T-009** `[P]` — `sgcContatosListar` (7510) → `backend/add-008-notas-fiscais.mjs`
- [x] **T-010** — Escritas da nota: `sgcEscNfInserir` (7550, com o `NOT EXISTS` da nota já vinculada em qualquer card e `DT_RECEBIMENTO = DT_ENTRADA`), `sgcEscNfItemInserir` (7551) e `sgcEscOcorrenciaInserir` (7552) em lote (`SELECT * FROM ({{linhas}}) LOTE WHERE <guarda>`), todas por id com `{{usuarioId}}` e a guarda de persona da 002 copiada literal → `backend/add-008-notas-fiscais.mjs`
- [x] **T-011** `[P]` — Escritas de decisão: `sgcEscOcorrenciaDecidir` (7553, individual e lote de conformes numa instrução) e `sgcEscSugestaoInserir` (7554, com os dois `NOT EXISTS`); `sgcEscSugestaoDecidir` (7555) e `sgcEscContatoInserir` (7556) são escritas de **tela**, com `:VAR_USER` + guarda → `backend/add-008-notas-fiscais.mjs`
- [x] **T-012** — Escritas do pedido: `sgcEscPedidoFaturamento` (7557, as quatro medidas somadas no próprio banco) e `sgcEscPedidoAlertaFaturamento` (7558, nível e data, só do cron — D-015). O campo `faturamento` do quadro **não** tem escrita própria: quem grava é `kbCardAtualizar` da lib (R-042, D-003) → `backend/add-008-notas-fiscais.mjs`
- [x] **T-013** — `sgcEscAvisoInserir` (7559): `INSERT … SELECT … FROM DUAL WHERE NOT EXISTS (mesma CHAVE)`, **sem** guarda de persona (R-023), com os sete parâmetros congelados para a 006 e a 007 → `backend/add-008-notas-fiscais.mjs`
- [x] **T-014** — `sgcNfListar` (7507, JAVASCRIPT): capa, sugestões, notas, itens, ocorrências e contatos numa execução (RNF-001) → `backend/add-008-notas-fiscais.mjs`
- [x] **T-015** — `sgcNfVincular` (7512, JAVASCRIPT): persona por `runQueryMitra` com `:VAR_USER` (`RESTRICTED` só o próprio card) e fase em `enviado`/`transito`/`faturamento`/`bo`; itens do ERP ou do `itensJson`; nota + itens + ocorrências em lote; recálculo do faturamento; devolve `percValor`/`percQtd`/`saldo` para a tela espelhar a capa; `kbNotaRegistrar` em `try/catch` → `backend/add-008-notas-fiscais.mjs`
- [x] **T-016** — As sete regras de conferência dentro do `sgcNfVincular`, espelhando `lib/nf.ts`: casamento (`item_nao_pedido`), `validade_curta`, `preco_divergente`, `qtd_maior`, `prazo_divergente`, `valor_total_divergente` e `percentual_faturado`; toda comparação vira ocorrência, inclusive a conforme → `backend/add-008-notas-fiscais.mjs`
- [x] **T-017** — `sgcOcorrenciaDecidir` (7513, JAVASCRIPT): persona, justificativa mínima de 10 caracteres na recusa, modo `individual` e `conformes` numa execução de escrita, contagem de pendentes e nota no histórico → `backend/add-008-notas-fiscais.mjs`
- [x] **T-018** — `sgcNfDetectar` (7511, JAVASCRIPT, cron `0 */30 * * * *`): lote de 30 cards, agrupamento por fornecedor + filial com **uma** chamada ao ERP por grupo, descarte das notas já vinculadas, pontuação por `pontuarSugestao`, sugestão ao card de maior score, aviso `nf_sugerida` e nota no histórico; erro de um grupo não derruba os outros → `backend/add-008-notas-fiscais.mjs`
- [x] **T-019** — `sgcFaturamentoMonitorar` (7514, JAVASCRIPT, cron `0 2 11 * * *` — dois minutos depois do cron da 007, para os dois não disputarem o mesmo minuto): lote de 30, **pula fase `bo`** (R-041), 100 % encerra, níveis 3/5/diário com idempotência por `ALERTA_FATURAMENTO_EM`, aviso ao responsável e, no nível 5, à persona `gestor`; espelho da capa por `kbCardAtualizar` **por id**, com `atualizadoPor` = responsável (ou criador) e `origem: 'sistema'` (R-042), em `try/catch` — a chamada **reenvia os quatro campos** `titulo`, `responsaveisIds`, `prazo` e `valoresJson`, lidos antes de `KB_CARD`/`KB_CARD_RESPONSAVEL` na mesma consulta do lote, senão apaga o que não mandar (R-047); nenhum e-mail e nenhuma consulta ao ERP → `backend/add-008-notas-fiscais.mjs`
- [x] **T-020** — `sgcCobrancaEnviar` (7515, JAVASCRIPT): persona, `sendEmailMitra` com o contato e a cópia fixa `compras@benenutri.com` sem duplicar, `sgcEscComunicacaoInserir` da 002 por id com `tipo = 'cobranca'`, nota no histórico; **não** grava o contato (D-005) → `backend/add-008-notas-fiscais.mjs`
- [x] **T-021** `[P]` — Fragmentos do gancho e do feed: `pendencias-transito.sql`, `pendencias-conclusao-nf.sql` e `notificacoes-avisos.sql`, no formato de `pendencias-analise.sql` → `backend/sql/`
- [x] **T-022** — **Pedir ao integrador**: colar os dois blocos de pendência em `contextoDoCard()`/`sqlPodeMover` do `add-005` com os `WHEN` do plan (cada ramo do `MOTIVO` com a sua própria condição, encadeados NF → B.O., R-044), os textos novos em `M`, o ramo de `notificacoes-avisos.sql` em `notificacoesUniao()` mais o rótulo `aviso` em `NotificacoesPage`, e os **mesmos textos** em `MOTIVOS` de `frontend/src/lib/transicoes.ts` — **só os textos**: nenhum ramo novo em `motivoDeDestino`, nenhum `antesDeMover`/`podeMover` novo, porque a trava é só do servidor (R-046, D-009, G-14) e o teste de 500 combinações da 002 continua valendo → `backend/add-005-quadro-compras.mjs`, `frontend/src/lib/transicoes.ts`, `frontend/src/pages/notificacoes/NotificacoesPage.tsx`
- [x] **T-023** — **Pedir ao integrador**: `add-008-notas-fiscais.mjs` no `PUBLISH_ORDER`, depois do `add-007` → `backend/simulator/config.mjs`
- [x] **T-024** — Campo do quadro `faturamento` (R-048, B-6): exportar `CAMPOS_008 = [{ chave: 'faturamento', label: 'Faturamento', tipo: 'texto', noCard: true }]` e criá-lo no `isEntrypoint()` de forma **idempotente** (só insere se ainda não existe no quadro `compras`), a partir dessa constante → `backend/add-008-notas-fiscais.mjs`
- [x] **T-025** — **Pedir à base (S2)**: o seed do quadro semear o campo a partir de `CAMPOS_008` importado do `add-008` (nunca uma cópia literal), como já faz com os campos da 002/003 → `backend/simulator/seed/`. **Pedir ao integrador**: `faturamento` em `CAPA_POR_FASE` das fases `enviado`, `transito`, `faturamento` e `bo` → `backend/add-005-quadro-compras.mjs`

## Simulador

- [x] **T-030** — **Pedir ao integrador**: `PCNFENT` e `PCLANC` novas, `PCMOV` com `NUMTRANSENT`/`NUMNOTA`/`SERIE`/`NUMLOTE`/`DATAVALIDADE` e `PCPRODUT` com `CODFAB`/`CODAUXILIAR` (R-027) → `backend/simulator/schema-winthor.mjs`
- [x] **T-031** — **Pedir ao integrador**: shims `FLOOR` e `MOD` e `DATE_ADD(col, INTERVAL (<expressão>) DAY)` → `backend/simulator/mysql-dialect.mjs`
- [x] **T-032** — Seed `005-notas-fiscais.mjs`, **só INSERT**: os **onze** cards da tabela do plan (nove pendentes + `notaDeOutro` + `cemPorCento`; datas de envio calculadas a partir de hoje por `somarDiasUteisData`), com `enviadoComPedido` em `NUMPED_WINTHOR` **998901** (não 998877, que a 002 já usa — B-5); as **seis** notas em `PCNFENT`/`PCMOV`/`PCLANC` (`NUMNOTA < 90000`; 90001–90015 são da 006), incluindo a **7006** do fornecedor **1042** com os mesmos dois lotes da 7002, para o card **`validade1042`** (C-011); os itens com os preços 10,0000 / 20,1600 / 30,4500, os lotes de 143 e 81 dias, o item por `CODFAB`, o por EAN e o não pedido; a NF 7004 já vinculada; o card **`emBo`** com `DT_PREVISAO_BO` = hoje + 10 dias e **2 linhas em `SGC_BO_ITEM` com `STATUS = 'aberto'`** (C-028); **1 contato** em cada card pendente **menos** `semNota` e `semNota2` (é o que faz o filtro "sem contato" devolver esses dois); **nenhum aviso** (quem cria é o cron); e o **`export const CARDS_005`** com os onze ids, como a 003 faz com `CARDS_003`, para o smoke recortar as asserções (R-045). Fornecedores, filiais, personas e produtos vêm dos seeds da 001, 002 e 003 — este seed **não** os grava (R-017) → `backend/simulator/seed/005-notas-fiscais.mjs`
- [x] **T-033** — **Pedir ao integrador**: a seção 005 do `CHECK_INPUT` (só as nove leituras SQL; `numpeds: '998901'`) → `backend/simulator/config.mjs`. O `VALIDADE_MINIMA_DIAS` dos fornecedores — **90** no 1015 e **180** no 1042 (C-011) — é **da base** (R-017/R-043): esta spec só depende dele e lê o cadastro no teste, nunca supõe o valor

## Frontend

- [x] **T-040** `[P]` — **Pedir à base (S2)**: `lib/dias-uteis.ts` (`diasUteisEntre`, `somarDiasUteis`, `somarDiasCorridos`), `lib/csv.ts` (`textoCsv`, `baixarCsv`) e as chaves `verNotasFiscais`, `operarNf`, `verFaturamentoPendente`, `registrarContato` em `lib/permissoes.ts` (R-028: diretoria lê os dois painéis; `operarNf` cobre também a 006) → `frontend/src/lib/`
- [x] **T-041** `[P]` — `lib/nf.ts`: `TOLERANCIA_PRECO`, `VALIDADE_MINIMA_PADRAO_DIAS`, `pontuarSugestao`, `casarItem`, `classificarDelta`, `diasDeValidade`, `resultadoDeValidade`, `resultadoDeQuantidade`, `resultadoDePrazo` (importando `parcelasDoPrazo`/`textoDeParcelas` da 003), `ocorrenciasDaNota` e `textoDaOcorrencia` → `frontend/src/lib/nf.ts`
- [x] **T-042** `[P]` — `lib/faturamento.ts`: `percentuaisFaturados`, `nivelDeAlerta`, `textoDaCapaFaturamento`, `colunasDoCsv` → `frontend/src/lib/faturamento.ts`
- [x] **T-043** — Bloco 75xx em `SERVER_FUNCTION_NAMES` e `SERVER_FUNCTIONS` (7501–7516 e 7550–7559), no formato rígido do arquivo → `frontend/src/lib/server-functions.ts`
- [x] **T-044** — `AbaNotasFiscais`: uma chamada de `sgcNfListar` por abertura; blocos de sugestões, notas vinculadas com itens e ocorrências agrupadas por item, contatos; `Status` com rótulo escrito para resultado e decisão (tons `live`/`attention`/`alert`, os do `page.tsx`); a aba **não** declara `contagem` — `AbaExtra.contagem` é síncrona e lê só `card.valores`, e não há campo do quadro com notas pendentes (R-049) → `frontend/src/pages/quadros/abas/NotasFiscais.tsx`
- [x] **T-045** — Diálogos da aba: registrar NF pelo número (`sgcWintNfBuscar` → `sgcNfVincular`), decidir ocorrência (recusa com contador de 10 caracteres), registrar contato (`DatePicker` na previsão) e enviar cobrança (contatos do fornecedor pela 001) → `frontend/src/pages/quadros/abas/nf-dialogos.tsx`
- [x] **T-046** — Ações da aba: "Validar" (`sgcNfVincular` → `sgcEscSugestaoDecidir` com `validada`), "Recusar" (`sgcEscSugestaoDecidir`), "Aceitar todos os conformes" e decisão individual (`sgcOcorrenciaDecidir`), cada uma seguida de `recarregar()` e, quando `capaMudou`, de `atualizarCapaDoQuadro(card, { faturamento })` — o módulo `abas/capa-do-quadro.ts` da 003, reusado sem alteração (R-042) → `frontend/src/pages/quadros/abas/NotasFiscais.tsx`
- [x] **T-047** `[P]` — `NotasFiscaisPage`: fila de sugestões paginada, filtro por situação e fornecedor, busca por número, ações Validar / Ver / Recusar, controles desabilitados (nunca escondidos) para quem não opera; o total exibido vem de `sgcNfSugestoesListarTotal`, nunca de contagem local, e nenhum teste desta tela assere número absoluto de sugestões (R-045) → `frontend/src/pages/notas-fiscais/NotasFiscaisPage.tsx`
- [x] **T-048** `[P]` — `FaturamentosPendentesPage`: total (de `sgcFaturamentoPendenteListarTotal`, nunca contado na tela), as quatro faixas em `FilterChip`, busca, exportar CSV por `textoCsv`/`baixarCsv`, "Registrar contato" e "Enviar cobrança"; pedido em B.O. aparece com a previsão de liberação e os itens em aberto; os testes da tela exercitam `colunasDoCsv`/`nivelDeAlerta` com linhas montadas à mão — nenhuma asserção sobre o total do banco (R-045) → `frontend/src/pages/faturamentos/FaturamentosPendentesPage.tsx`
- [ ] **T-049** — **Pedir ao integrador**: ligar a aba no `/quadro` (`abasExtras` com "Notas fiscais"), as rotas `/notas-fiscais` e `/faturamentos-pendentes`, os dois itens de menu **no `MENU` de `frontend/src/lib/permissoes.ts`** (é lá que mora o menu, com a chave de permissão de cada item; o `AdminLayout` só fornece o ícone — G-7) e a linha de faturamento + etiqueta na capa do cartão (a partir do campo `faturamento`) → `frontend/src/pages/quadros/QuadroPage.tsx`, `frontend/src/App.tsx`, `frontend/src/lib/permissoes.ts`, `frontend/src/components/AdminLayout.tsx`
- [x] **T-100** — R-150: bloco Notas fiscais em cartões (`abas/nf-cartoes.tsx`): números em cima e ações embaixo; nota recolhida com divergências e conferências sem decisão no cabeçalho; aberta, só o que diverge, com "Mostrar os N itens conformes" → `frontend/src/pages/quadros/abas/NotasFiscais.tsx`
- [x] **T-101** — R-150: blocos Conclusão (saldo por item + pendências) e Concluído (itens faturados), lendo o MESMO `sgcNfListar`/`sgcBoCarregar` pela carga compartilhada (`abas/carga-do-card.ts`) → `frontend/src/pages/quadros/abas/`

## Testes

Cada id da seção **Testes** do `plan.md` aparece em exatamente uma task abaixo.

- [x] **T-080** — `teste('C-001 …')`, `teste('C-002 …')`, `teste('C-003 …')`, `teste('C-004 …')` e `teste('RN-010 …')` em `backend/simulator/smoke/005-notas-fiscais.mjs`: a rodada de detecção cria a sugestão 100/`pedido` e a 88/`heuristica`, não sugere a 7004 nem a 7003 (as consultas ao ERP com contagem > 0) e não vincula nada
- [x] **T-081** — `teste('C-005 …')`, `teste('C-006 …')` e `teste('RN-015 …')`: card sem candidata devolve listas vazias; `sgcWintNfBuscar` (7005) devolve a nota sem entrada e `sgcWintNfItens` os 2 itens; a 7003 não aparece em nenhuma das duas
- [x] **T-082** — `teste('C-007 …')`, `teste('C-009 …')` e `teste('C-016 …')`: validar grava 1 nota, 3 itens e 15 ocorrências pendentes mais a nota no histórico; o item 9999 vira `item_nao_pedido` divergente; recusar com 9 caracteres falha, com 10 grava, e a nota continua vinculada
- [x] **T-083** — `teste('C-010 …')`, `teste('C-011 …')`, `teste('C-013 …')` e `teste('C-008 …')` (parte servidor): as ocorrências de preço saem conforme/atenção/divergente; as de validade, **com o mínimo lido do cadastro do fornecedor** (1015 = 90 → uma conforme e uma divergente na NF 7002; 1042 = 180 → as duas divergentes na NF 7006 do card `validade1042`), nunca com o padrão de 120 suposto; a de prazo conforme com 28/35/42 e divergente com 30/60; e as dos casamentos alternativos em atenção
- [x] **T-084** — `teste('C-014 …')`, `teste('C-019 …')` e `teste('RN-008 …')` (parte servidor): depois do vínculo, `PERC_FATURADO_VALOR` e `PERC_FATURADO_QTD` são 60 e `DT_PRIMEIRO_FATURAMENTO` é `2026-09-11`; o espelho da capa é provado nos **dois** caminhos — `kbCardAtualizar` com sessão e, na rodada do cron, `kbCardAtualizar` por id com `atualizadoPor` + `origem: 'sistema'` —, e nos dois `KB_CARD.VALORES_JSON` passa a ter o texto na chave `faturamento`, com `TITULO`, `PRAZO` e os `KB_CARD_RESPONSAVEL` do card **iguais aos de antes da chamada** (R-047)
- [x] **T-085** — `teste('C-015 …')`, `teste('C-018 …')` e `teste('RN-011 …')`: `modo: 'conformes'` decide 9 e deixa 3; `sgcPodeMover` para `concluido` recusa com as pendentes e libera depois, saindo de `faturamento` e de `bo`
- [x] **T-086** — `teste('C-017 …')` e `teste('RN-012 …')`: `sgcPodeMover` de `enviado` para `transito` recusa sem nota com o texto exato do fragmento e libera com uma nota
- [x] **T-087** — `teste('C-020 …')`, `teste('C-021 …')`, `teste('C-022 …')`, `teste('C-023 …')` e `teste('C-028 …')`: a rodada diária encerra o card de 100 %, cria `faturamento_3`, `faturamento_5` (mais o da persona `gestor`) e `faturamento_diario` uma vez por dia, e **não** cria aviso nenhum para o card em `bo`; em todos eles, título, prazo e responsáveis dos cards continuam intactos depois das rodadas (R-047)
- [x] **T-088** — `teste('C-024 …')`, `teste('C-025 …')`, `teste('C-026 …')` e `teste('RN-014 …')`: dois contatos lidos na ordem certa; a cobrança envia 1 e-mail com a cópia fixa e grava a comunicação; a listagem, **recortada por `ID_CARD IN (CARDS_005)`** (nunca por total absoluto — o banco do smoke é compartilhado com as suítes 002/006/007, R-045), traz os 9 pedidos do seed com as faixas 2/4/1/2, e `sgcFaturamentoPendenteListarTotal` é conferido por diferença; a rodada do cron não envia e-mail
- [x] **T-089** — `teste('C-027 …')` e `teste('RN-001 …')` (parte servidor): vincular como `leo` e como `dora` devolve `ok: false`, `sgcEscContatoInserir` como `leo` não grava; um `SELECT` com o fragmento de dias úteis entre `2026-08-24` e `2026-09-14` devolve 15
- [x] **T-090** `[P]` — `test('RN-001 …')` em `frontend/tests/dias-uteis.test.mjs`: `somarDiasUteis('2026-08-24', 15)` → `'2026-09-14'`; `diasUteisEntre` 15; sex→seg 1; seg→sáb 4; mesmo dia 0; sábado recua para sexta
- [x] **T-091** `[P]` — `test('C-002 …')`, `test('RN-002 …')` e `test('RN-003 …')` em `frontend/tests/nf.test.mjs`: pontuação 88, 12, `null`, piso e teto; casamento na ordem `codprod` → `codfab` → `ean` → `nenhum`
- [x] **T-092** `[P]` — `test('C-008 …')` (parte tela), `test('C-010 …')`, `test('C-011 …')`, `test('C-012 …')`, `test('C-013 …')`, `test('RN-004 …')`, `test('RN-005 …')`, `test('RN-006 …')` e `test('RN-007 …')` em `frontend/tests/nf.test.mjs`
- [x] **T-093** `[P]` — `test('C-014 …')`, `test('C-019 …')`, `test('C-026 …')` (parte tela), `test('RN-008 …')`, `test('RN-009 …')` e `test('RN-013 …')` em `frontend/tests/faturamento.test.mjs`
- [x] **T-094** `[P]` — `test('C-027 …')` em `frontend/tests/permissoes.test.mjs` (**arquivo da 002**): as quatro chaves novas por persona, diretoria lendo e não operando, `READ_ONLY` zerando `operarNf` e `registrarContato`
- [x] **T-099** — D-016: `sgcWintProdutosCodigos` (7516, `WINTHOR`) substitui o subselect em `PCPRODUT` que `sgcNfVincular` e `sgcNfDetectar` mandavam por `runQueryMitra` (`codigosDoErp` no prelúdio); `teste('D-016 …')` em `smoke/005-notas-fiscais.mjs` (executor externo + `onQuery`, em `BEGIN … ROLLBACK`) e `teste('S0-018 …')` em `smoke/000-esqueleto.mjs` → `backend/add-008-notas-fiscais.mjs`, `frontend/src/lib/server-functions.ts`

## Verificação

- [x] **T-095** — `cd backend && npm test` verde (`sim:check` + `sim:smoke`); nenhuma consulta Oracle com 0 linha
- [x] **T-096** — `cd frontend && npm test` verde; `npm run build` e `npm run lint` limpos
- [ ] **T-097** — Verificação manual no simulador: C-007 (aba com 3 notas e 40 conferências agrupadas por item), C-015 (aceitar conformes ao lado das decisões individuais), C-019 (linha e etiqueta no cartão), C-026 (os quatro filtros e a exportação), C-027 (controles desabilitados, nunca escondidos)
- [ ] **T-098** — Tema claro e tema escuro sem cor quebrada na aba e nas duas telas

## Dependências

```
T-001 · T-002 → T-003 → T-004 · T-005 · T-006 · T-007 · T-009 · T-010 · T-011 · T-012 · T-013
T-002 → T-008
T-010 · T-011 · T-012 · T-013 → T-014 · T-015 → T-016 → T-017
T-004 + T-011 + T-013 → T-018 ·  T-008 + T-012 + T-013 → T-019 ·  T-010 → T-020
T-021 → T-022 ·  T-003 → T-023 → T-024 → T-025
T-030 → T-031 → T-032 → T-033
T-040 · T-041 · T-042 · T-043 [P] independentes do backend
T-043 + T-014 → T-044 → T-045 → T-046
T-043 + T-042 + T-040 → T-047 · T-048 → T-049
T-032 + T-015..T-020 → T-080 … T-089
T-040 · T-041 · T-042 → T-090 … T-094
tudo → T-095 · T-096 → T-097 · T-098
```

## Rastreabilidade

| Requisito / cenário | Tasks | Teste |
|---|---|---|
| RF-001, RF-002 / C-001, C-002, RN-002 | T-004, T-018, T-032, T-041 | T-080, T-091 |
| RF-003 / C-003, C-004, RN-015 | T-004, T-010, T-011, T-018 | T-080, T-081 |
| RF-004 / RN-010 | T-018 | T-080 |
| RF-005 / C-005, C-006 | T-006, T-015, T-045 | T-081 |
| RF-006 / C-007 | T-010, T-015, T-016 | T-082 |
| RF-007 / C-008, RN-003 | T-016, T-041 | T-083, T-091 |
| RF-008 / C-010, C-014, RN-004 | T-016, T-041 | T-083, T-092 |
| RF-009 / C-009, C-011, C-012, C-013, RN-005, RN-006, RN-007 | T-005, T-016, T-041 | T-082, T-083, T-092 |
| RF-010 / C-011, RN-005 | T-016, T-033, T-041 | T-083, T-092 |
| RF-011, RF-012 / C-015, C-016 | T-011, T-017, T-046 | T-082, T-085 |
| RF-013 / C-016, RN-011 | T-015, T-021 | T-082, T-085 |
| RF-014 / C-017, RN-012 | T-021, T-022 | T-086 |
| RF-015 / C-018, RN-011 | T-021, T-022 | T-085 |
| RF-016 / C-014, C-019, RN-008 | T-012, T-015, T-042 | T-084, T-093 |
| RF-017 / C-019, RN-013 | T-019, T-024, T-025, T-042, T-046, T-049 | T-084, T-093 |
| RF-018 / RN-001 | T-002, T-008, T-040 | T-089, T-090 |
| RF-019, RF-020 / C-020, C-021, C-022, C-023, C-028, RN-009 | T-012, T-013, T-019, T-032 | T-087, T-093 |
| RF-021 / C-021, R-023 | T-013, T-021, T-022 | T-087 |
| RF-022 / C-024 | T-011, T-009, T-045 | T-088 |
| RF-023 / C-025, RN-014 | T-020, T-045 | T-088 |
| RF-024 / C-001, C-005 | T-007, T-011, T-047 | T-080, T-081 |
| RF-025 / C-026, C-028 | T-008, T-042, T-048 | T-088 |
| RF-026 / C-027 | T-010..T-013, T-015, T-040 | T-089, T-094 |
| RNF-001 | T-014, T-044 | T-082 |
| RNF-002, RNF-006 | T-004, T-018 | T-080 |
| RF-002, RF-007 / D-016 | T-099 | T-099 |
| RNF-003 | T-019 | T-087 |
| RNF-004 | T-004, T-005, T-006 | T-080, T-081 |
| RNF-005 | T-007, T-008 | T-088 |
