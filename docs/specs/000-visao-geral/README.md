# 000 — Visão geral do SGC 2

**Data:** 2026-09-15 · **Status:** contrato da onda 1 (as specs 001–004 partem daqui) · **Regras de negócio:** [`regras.md`](regras.md) (121 decisões fechadas com o usuário)

## O que é

O SGC 2 é a reconstrução do Sistema de Gestão de Compras da Benenutri (p-45547) como
projeto Mitra **novo**, sobre a biblioteca `@benenutri/mitra-kanban` (1.3.0) e o design
system da Benenutri. O SGC atual chegou a 276 scripts de backend, 1.683 migrations e um
`PipeWorkspace.tsx` de 17 mil linhas; a troca do motor no lugar travou. Aqui o kanban
genérico é da lib e o SGC 2 só tem **domínio**: pedido, itens, alertas, fornecedores,
agenda, personas. Os dados do SGC atual **não migram**; o sistema começa vazio.

O processo, em uma frase: um analista monta um pedido de compra por fornecedor e filial
a partir da análise de vendas, estoque e trânsito no WinThor; o gestor aprova
tecnicamente; a diretoria aprova; o pedido vai à indústria por e-mail ou plataforma; o
recebimento, o faturamento e as pendências (B.O.) seguem até a conclusão.

## Princípios da reconstrução

1. **Tudo que é kanban genérico vem da lib**: fases, campos, movimentos, chat, tarefas,
   anexos, alterações, etiquetas, construtor de fases, SLA, automações com e-mail. Nada
   disso se reimplementa.
2. **Card nasce sempre por `kbCardCriar`** (ordem, texto de busca, movimento, automação).
   O cron da agenda cria com `origem: 'sistema'` e `criadoPor`.
3. **Nenhum campo de fase é obrigatório no quadro `compras`**: o motor valida
   obrigatórios em qualquer direção e barraria cancelar/voltar. Pré-requisito de saída
   vive na tela (`podeMover`/`antesDeMover`) **e** no servidor (regra ligada
   `sgcPodeMover`/`sgcPodeExcluir`, consultada pelo motor antes de gravar).
4. **Regra de compra é módulo puro** em `frontend/src/lib/*.ts`, testado por `node --test`;
   SQL/JS real das SFs testado em `backend/simulator/smoke/`. Nenhum handler reimplementado.
5. **Escrita de usuário só por SF SQL guardada por `:VAR_USER`**, chamada direto da tela;
   JS só onde há orquestração, e-mail ou cron.
6. **Nomes novos, sem compatibilidade**: fases, SFs e tabelas nascem com nome definitivo.
7. **Fase por chave estável** (`SGC_FASE.CHAVE` → `KB_FASE.ID`); regra nunca depende de
   id nem de nome de fase.
8. **Orçamento de execuções** (300/min por projeto): abrir card = `kbCardDetalhe` +
   `sgcPedidoCarregar`; quadro atualiza a cada 60 s; capa sem SF extra (fornecedor,
   filial, valor e prioridade são campos do quadro); itens gravados em lote.

## Personas (bloco P de `regras.md`)

| Persona | Quem | Faz |
|---|---|---|
| `analista` | comprador | cria e edita pedidos, monta itens, move Análise → Técnica, cancela; **padrão quando a persona não está resolvida** (P-02) |
| `gestor` | gerência de compras | tudo do analista **e** aprova/reprova tecnicamente, move em qualquer fase (P-07), exclui pedido (P-11) |
| `diretoria` | diretoria | aprova/reprova na própria fase (só nela), exclui pedido |
| `admin` | TI | tudo, e administra o quadro (fases, campos, automações) — é `ADMINS_IDS` do motor (P-11 A) |
| `comercial` | comercial | só as solicitações (onda 3); na onda 1 não vê Quadro, Agenda nem Fornecedores (P-01, P-03) |

Persona é dado (`SGC_USUARIO_PERSONA`, 1:1 `INT_USER`). `ACCESS_LEVEL` da plataforma
continua valendo: `READ_ONLY` não move nada; `RESTRICTED` só os próprios cards (P-08 B).
Menor privilégio em falha. A mesma matriz existe uma vez em `lib/permissoes.ts` (tela)
e uma vez na SQL ligada `sgcPodeMover`/`sgcPodeExcluir` (servidor); o smoke prova as duas.

## As dez fases (F-01, manter)

| # | Chave (`SGC_FASE.CHAVE`) | Nome | Tipo |
|---|---|---|---|
| 1 | `analise` | Análise/Montagem de Pedido | comum |
| 2 | `tecnica` | Aprovação Técnica | comum |
| 3 | `diretoria` | Aprovação da Diretoria | comum |
| 4 | `envio` | Envio para Indústria | comum |
| 5 | `enviado` | Enviado para Indústria | comum |
| 6 | `transito` | Em Trânsito para BN | comum |
| 7 | `faturamento` | Faturamento em Andamento | comum |
| 8 | `bo` | Produtos em B.O. | comum |
| 9 | `concluido` | Compras Concluídas | sucesso |
| 10 | `cancelado` | Compras Canceladas | cancelado |

Transições (F-03 A, fixas na regra, testadas): `analise → tecnica`; `tecnica → diretoria`
ou `→ analise` (reprovação); `diretoria → envio`, `→ tecnica` (devolver) ou `→ analise`
(reprovação); `envio → enviado` ou `→ diretoria` (retorno); `enviado → transito`;
`transito → faturamento`; `faturamento → bo` ou `→ concluido`; `bo → faturamento` ou
`→ concluido`; qualquer fase `→ cancelado` (motivo obrigatório). `analise → diretoria`
nunca (F-04). Fases 5–8 na onda 1: só a persona decide (sem pré-requisito de NF/trânsito
até a onda 2). O administrador renomeia e recolore fases no construtor do motor; não
remove nem reordena (o `add-005` cria as dez com a chave; o seed idem).

## Modelo de dados (todas as tabelas da onda 1 entram no `setup-backend.mjs` antes do fan-out)

| Tabela | Conteúdo | Spec |
|---|---|---|
| `SGC_FASE` | `CHAVE` → `FASE_ID` de `KB_FASE`; criada pelo `add-005` junto do quadro (idempotente por slug) e pelo seed | 002 |
| `SGC_USUARIO_PERSONA` | `USUARIO_ID` (1:1 `INT_USER`), `PERSONA` | 002 |
| `SGC_PEDIDO` (1:1 `KB_CARD`) | `ID_CARD`, `CODFORNEC`, `FORNECEDOR`, `CODFILIAL`, `FILIAL`, `PERIODO_INICIO/FIM` (padrão 45 dias, AN-11), `VL_TOTAL`, prazo de pagamento (`PRAZO_PADRAO`, `PRAZO_ACORDADO`, `PRAZO_JUSTIFICATIVA`), aprovação técnica (`TEC_POR`, `TEC_EM`, `TEC_MOTIVO`, `TEC_PRODUTOS_REPROVADOS`), diretoria (`DIR_POR`, `DIR_EM`, `DIR_MOTIVO`), envio (`DT_ENVIO`, `CANAL`, `EMAIL_ENVIO`, `NUMPED_WINTHOR`, `ENVIO_OBS`, `ENVIO_POR`, `ENVIO_EM`), cancelamento (`CANC_MOTIVO`, `CANC_POR`, `CANC_EM`), `ORIGEM` (`manual`/`agenda`), `ID_AGENDA` | 002 |
| `SGC_PEDIDO_ITEM` (N:1 card, `UNIQUE (ID_CARD, CODPROD)`) | `CODPROD`, `CODEPTO`, `CODSEC` (resolvem o limite de cobertura sem reconsultar o ERP), `DESCRICAO`, `EMBALAGEM`, `UNIDADE`, `UN_POR_CAIXA` (gestão de custos, AN-05 B), `QT_VENDA_TOTAL`, `QT_VENDA_LICITACAO`, `QT_ESTOQUE`, `QT_TRANSITO`, `QT_SUGERIDA`, `QT_PEDIDA`, `PRECO_CUSTO`, `TIPO_PRECO` (AN-08 B), `CURVA_ABC`, `COBERTURA_DIAS`, `COBERTURA_LIMITE`, `COBERTURA_JUSTIFICATIVA`, `OBSERVACAO`, `STATUS` (`montagem`, `aprovado`, `reprovado`, `enviado`, `removido`), `CRIADO_EM`, `ATUALIZADO_POR`, `ATUALIZADO_EM` | 003 |
| `SGC_ALERTA` (N:1 card, `UNIQUE (ID_CARD, CHAVE)`) | `CODPROD` (não o id do item: o upsert em lote não devolve ids e o item pode sair e voltar), `CHAVE` (idempotência da regeração), `TIPO` (`vencimento` RN-02, `excesso` RN-03), `MENSAGEM`, `LIDO`, `LIDO_POR`, `LIDO_EM`, `JUSTIFICATIVA`, `CRIADO_EM` | 003 |
| `SGC_COBERTURA` (`UNIQUE (NIVEL, CODIGO)`) | limite de cobertura futura: `NIVEL` (`fornecedor`, `departamento`, `secao`, `sku`), `CODIGO`, `DESCRICAO`, `LIMITE_DIAS`, `ATIVO`, `CRIADO_EM`, `ATUALIZADO_POR`, `ATUALIZADO_EM`; vale a mais específica; sem parametrização, 35 dias (AN-07) | 003 |
| `SGC_COMUNICACAO` (N:1 card) | e-mails e envios registrados (EN-06 B): `TIPO`, `PARA`, `CC`, `ASSUNTO`, `CORPO`, `ENVIADO_POR`, `ENVIADO_EM` | 002 |
| `SGC_FORNECEDOR` + `_FILIAL`, `_LINHA`, `_LINHA_CONTATO`, `_FAIXA_PRAZO`, `_DOCUMENTO`, `_LOG` | parametrização própria sobre o cadastro do WinThor — `CODFORNEC` (chave do ERP, único), `FORNECEDOR` (nome copiado do ERP), `CNPJ`, `CNPJ_FORMATADO`, `ATIVO`, prazo de entrega (úteis/corridos), pedido mínimo, janela de fechamento, link da plataforma, validade mínima, SLA de análise (1) e faturamento (5) dias úteis; filiais atendidas; linhas com contatos de envio; faixas de valor com opções de prazo (`"30/60/90"`); documentos; log campo a campo (FO-06 B) | 001 |
| `SGC_AGENDA` + `SGC_AGENDA_PARTICIPANTE` | `CODFORNEC`, `FORNECEDOR`, `CODFILIAL`, `FILIAL`, `DATA_ANALISE`, `PERIODO_INICIO/FIM`, `RECORRENCIA` (`nenhuma`/`semanal`/`quinzenal`/`mensal`), `DATA_LIMITE_RECORRENCIA`, `ATIVO`, `PROCESSADO_EM`, `ID_CARD_GERADO`, `CANCELADO_EM`, `CANCELADO_POR`, `OBSERVACAO` (a descrição da reunião, AG-02 B), `DATA_PLANEJADA_ORIGINAL` e `DATA_ENVIO_REAL` (planejado × real, EN-05 A), `CRIADO_POR`, `CRIADO_EM`, `ATUALIZADO_EM`; participantes em `SGC_AGENDA_PARTICIPANTE` (`ID`, `ID_AGENDA`, `USUARIO_ID`, `CRIADO_EM`) | 004 |

Convenções: colunas em UPPERCASE; datas em `VARCHAR(10)`/`VARCHAR(19)`; chaves
estrangeiras por convenção (sem `FOREIGN KEY` — o simulador e a plataforma não dependem
delas); `ID` autoincremento; tabela de log com `CAMPO`, `DE`, `PARA`, `POR`, `EM`.
`KB_BOARD.CONFIG_JSON` não guarda nada do SGC.

Campos do quadro `compras` (criados pelo `add-005`, chave estável): `fornecedor`,
`filial`, `valor_total` (moeda), `prioridade` (seleção: normal/alta/urgente, C-07),
`alertas_pendentes` (número: a contagem da capa e da aba Alertas, DS-01/C-06),
`motivo_cancelamento` (capa de Canceladas, CA-04). Prioridade vive **só** no campo (R-009). São
espelho de `SGC_PEDIDO` para a capa, a busca e o filtro não custarem SF por cartão; a
gravação do pedido atualiza os dois (uma SF).

## Server functions

Prefixo `sgc`. Uma faixa de id local por spec (o `sync-server-function-map` traz os reais):

| Spec | Faixa | Leitura (SQL/JS) | Escrita SQL guardada por `:VAR_USER` | JS (orquestração, e-mail, cron) |
|---|---|---|---|---|
| 001 fornecedores | 71xx | `sgcFornecedorListar`, `sgcFornecedorListarTotal`, `sgcWintFornecedores`, `sgcWintFiliais` | `sgcEscFornecedor*` (7150–7162, uma instrução por SF; recebem `{{usuarioId}}` e são chamadas por id só pelo `sgcFornecedorSalvar`) | `sgcFornecedorCarregar` (uma execução: parametrização + filhas + log), `sgcFornecedorSalvar` (confere a persona por `runQueryMitra` com `:VAR_USER` antes de escrever; grava o pai e as filhas, log campo a campo) |
| 002 quadro | 72xx | `sgcPersonaAtual` (`:VAR_USER`), `sgcPersonasListar`, `sgcPersonasListarTotal`, `sgcFasesListar`, `sgcPodeMover`/`sgcPodeExcluir` (SQL ligadas nos ganchos da lib; a saída da Análise é a subconsulta `PENDENCIAS`, que a 003 preenche), `sgcComunicacoesListar`, `sgcNotificacoesListar`, `sgcNotificacoesListarTotal` | tela, `:VAR_USER`: `sgcEscPedidoCriar` (capa; a tela chama `api.cardCriar` da lib antes), técnica (aprovar/reprovar), diretoria (aprovar/reprovar), `sgcEscPedidoCancelar`, `sgcEscPedidoEnvio`, `sgcEscComunicacaoInserir`, `sgcEscPersonaSalvar`; por id, `{{usuarioId}}`: `sgcEscPedidoCapaInserir` (cron da 004, R-010), `sgcEscPedidoReprovacoesLimpar` (`sgcAnaliseSair` da 003, R-011) | `sgcPedidoCarregar` (capa + itens + alertas numa execução), `sgcEnvioIndustriaRegistrar` (`sendEmailMitra` com cópia fixa compras@; chama `sgcEscAgendaEnvio` da 004 por id quando `ID_AGENDA > 0`, R-012) |
| 003 itens | 73xx | `sgcWintAnaliseMontagem`, `sgcWintBuscarProduto`, `sgcWintLotesAVencer`, `sgcWintExcessoOutrasFiliais`, `sgcWintPrazoPagamento` (Oracle), `sgcCustoUnidadesPorCaixa` (INTEGRATION `gestao-de-custos`, AN-05 B), `sgcCoberturaListar`, `sgcAnaliseSaidaVerificar` (as travas de saída da Análise; `sgcPodeMover` a incorpora como subconsulta no ramo `analise → tecnica`) | `sgcEscItemGravar`, `sgcEscItemRemover`, `sgcEscItemRemoverZerados`, `sgcEscItemStatusFase`, `sgcEscAlertaInserir`, `sgcEscAlertaRemoverObsoletos`, `sgcEscAlertaLer`, `sgcEscAlertaJustificar`, `sgcEscCoberturaGravar`, `sgcEscCoberturaExcluir`, `sgcEscPedidoPrazo`, `sgcEscPedidoTotal` (7350–7361) | `sgcItensGravar` (lote), `sgcAlertasGerar`, `sgcAnaliseSair` (remove zerados, limpa reprovações por `sgcEscPedidoReprovacoesLimpar` da 002, recalcula o total) |
| 004 agenda | 74xx | `sgcAgendaListar`, `sgcAgendaListarTotal`, `sgcAgendaCarregar` | `sgcEscAgendaInserir`, `sgcEscAgendaAtualizar`, `sgcEscAgendaCancelar`, `sgcEscAgendaParticipanteLimpar`, `sgcEscAgendaParticipanteInserir` (tela, `:VAR_USER`); internas sem sessão, chamadas por id pelo cron e pelo envio: `sgcEscAgendaProcessada`, `sgcEscAgendaProximaInserir`, `sgcEscAgendaParticipanteCopiar`, `sgcEscAgendaEnvio` | `sgcAgendaProcessar` (cron `0 */30 * * * *`, cria o card com `origem: 'sistema'`), `sgcAgendaProcessarManual` (quatro recortes, AG-06 B) |

Escritas por id e perfil de acesso (exceção ao princípio 5): escrita disparada por processo
sem sessão (cron da agenda) ou de dentro de um JS (`sgcFornecedorSalvar`, `sgcEnvioIndustriaRegistrar`)
não pode ser guardada por `:VAR_USER` — chamada aninhada não o propaga com garantia. Essas
SQL recebem `{{usuarioId}}` cru e quem confere a persona é o JS, por `runQueryMitra` com
`:VAR_USER`, **antes** de qualquer escrita. O perfil business (`add-002`) libera todas as SFs,
como a lib faz com as `kbEsc*`; se o sandbox provar que chamada aninhada dispensa o perfil, as
`sgcEsc*` chamadas só por id saem dele (item da verificação da onda 1).

Scripts do backend, na ordem do sandbox: `add-001-kanban.mjs` (instala a lib com
`instalar({ ganchos })`), `add-003-jdbc-winthor.mjs`, `add-004-fornecedores.mjs`,
`add-005-quadro-compras.mjs`, `add-006-itens.mjs`, `add-007-agenda.mjs` e, por último e fora do
`PUBLISH_ORDER`, `add-002-perfil-acesso.mjs`. Todo o DDL `SGC_*` mora no `setup-backend.mjs`.

Escritas por id e perfil de acesso (exceção ao princípio 5): escrita disparada por processo
sem sessão (cron da agenda) ou de dentro de um JS (`sgcFornecedorSalvar`, `sgcEnvioIndustriaRegistrar`)
não pode ser guardada por `:VAR_USER` — chamada aninhada não o propaga com garantia. Essas
SQL recebem `{{usuarioId}}` cru e quem confere a persona é o JS, por `runQueryMitra` com
`:VAR_USER`, **antes** de qualquer escrita. O perfil business (`add-002`) libera todas as SFs,
como a lib faz com as `kbEsc*`; se o sandbox provar que chamada aninhada dispensa o perfil, as
`sgcEsc*` chamadas só por id saem dele (item da verificação da onda 1).

Scripts do backend, na ordem do sandbox: `add-001-kanban.mjs` (instala a lib com
`instalar({ ganchos })`), `add-003-jdbc-winthor.mjs`, `add-004-fornecedores.mjs`,
`add-005-quadro-compras.mjs`, `add-006-itens.mjs`, `add-007-agenda.mjs` e, por último e fora do
`PUBLISH_ORDER`, `add-002-perfil-acesso.mjs`. Todo o DDL `SGC_*` mora no `setup-backend.mjs`.

Oracle (WinThor): `add-003-jdbc-winthor.mjs` cria a conexão com as credenciais do `.env`
do sandbox; as `sgcWint*` recebem o `jdbcId` resolvido por nome no `isEntrypoint()`. No
simulador, as tabelas `PC*` existem em SQLite com os mesmos nomes e colunas (só no schema do
simulador, nunca no `setup-backend.mjs`: na plataforma elas são do Oracle), e o dialeto
tem os shims `NVL`, `TO_DATE`, `TO_CHAR`, `TRUNC`, `SYSDATE`, `ROWNUM`; cada teste de
consulta Oracle prova contagem > 0. A consulta de análise do p-45547 zerava a venda de
licitação (filtro no `WHERE` da subconsulta); a `sgcWintAnaliseMontagem` da 003 corrige
(AN-03, AN-04 A).

E-mails por fase (EM-01 A): automações do motor (`KB_AUTOMACAO`, gatilho `card_movido` →
`enviar_email`), criadas pelo `add-005` com o texto de hoje, sempre com cópia para
`compras@benenutri.com` (EM-02); anexos ao criador pelo marcador `{{anexos}}` (EM-03 B).

## Telas (rotas)

| Rota | Tela | Spec |
|---|---|---|
| `/quadro` | `KanbanBoard slug="compras"` com `abasExtras` [Itens, Alertas], `acoesExtras` (aprovar/reprovar/cancelar/enviar), `podeMover`/`antesDeMover`/`podeExcluir`, `novoCard` "Novo pedido", `atualizarACadaMs` 60 s | 002 (+003 nas abas) |
| `/quadro/admin` | `BoardAdmin` (só admin) | 002 |
| `/pedidos/novo` | criação manual: fornecedor, filial, período (C-05) | 002 |
| `/fornecedores`, `/fornecedores/:id` | listagem e parametrização | 001 |
| `/agenda` | agendamentos, recorrência, participantes, processamento manual | 004 |
| `/coberturas` | limites de cobertura futura por fornecedor/departamento/seção/SKU (admin e gestor) | 003 |
| `/notificacoes` | novo responsável, card movido, mensagem nova nos meus cards (UI-07 B) | 002 |
| `/seguranca` | personas por usuário (admin) | 002 |

Layout, tokens e primitivos: `docs/design.md`. Sem arrastar cartão (UI-01), sem toast
(UI-02), seletor de data próprio sobre os tokens (UI-03 B): `src/components/DatePicker.tsx`,
especificado na spec 004 e usado por todas as telas; o `design.md` §1.4 e §9.2 têm a emenda.

## Decisões tomadas na revisão das specs (2026-09-15)

| # | Dúvida levantada | Decisão |
|---|---|---|
| R-001 (001) | a persona `leitura` do 000 é a `comercial` de P-01? | Sim: o nome é `comercial`, como em P-01; na onda 1 não vê Quadro, Agenda nem Fornecedores (P-03). O usuário do seed é `leo@sgc.local`, persona `comercial` |
| R-002 (001) | o que "fornecedor inativo" impede? | Não é oferecido na criação de pedido (002) nem no agendamento (004); pedidos e agendamentos existentes seguem normalmente |
| R-003 (001) | a janela de fechamento pode virar o mês (28 → 5)? | Pode, como no SGC anterior: os dois dias valem de 1 a 31 e não há exigência de início ≤ fim |
| R-004 (001) | documento vencido precisa de sinal? | Marca "vencido" na lista de documentos da parametrização; nenhum aviso além disso na onda 1 |
| R-005 (004) | quem cria e edita agendamento? | `admin`, `analista` **e** `gestor` (P-04 vale para a agenda por simetria); cancela: `admin`, `gestor`, `diretoria` (P-10) |
| R-006 (001, 004) | `design.md` §1.4/§9.2 mandam `<input type="date">` | Vale UI-03 B: o `design.md` ganhou a emenda; o `DatePicker` da 004 é o campo de data de todas as telas |
| R-007 (001) | `sgcEsc*` chamadas por id ficam no perfil business? | Ficam, como as `kbEsc*` da lib; a persona é conferida pelo JS antes de escrever. Verificar no sandbox se chamada aninhada dispensa o perfil e, se sim, tirá-las |
| R-008 (003) | sair da Análise exige ao menos um item com quantidade? | Exige (condição nova, não existia no p-45547): pedido sem item não tem o que enviar (EN-02) |
| R-009 (002) | `SGC_PEDIDO.PRIORIDADE` × campo `prioridade` do quadro: quem é o dono? | Só o campo do quadro (C-07 B: a pessoa edita no card); a coluna sai de `SGC_PEDIDO` |
| R-010 (002, 004) | capa do pedido criado pelo cron (sem sessão) | `sgcEscPedidoCapaInserir` (002, recebe `{{usuarioId}}`, `origem`, `idAgenda`; sem `:VAR_USER`), chamada por id só pelo `sgcAgendaProcessar`; a tela continua em `sgcEscPedidoCriar` (`:VAR_USER`) |
| R-011 (002, 003) | quem limpa as reprovações ao sair da Análise? | `sgcEscPedidoReprovacoesLimpar` (002, `{{usuarioId}}` + `{{idCard}}`), chamada por id só pelo `sgcAnaliseSair` da 003, que é o passo do `antesDeMover` em `analise → tecnica`; `sgcEscPedidoReenviar` não existe |
| R-012 (002, 004) | nome da escrita que sincroniza a agenda no envio (EN-05 A) | `sgcEscAgendaEnvio` (004, `{ idCard, dtEnvio }`), chamada por id pelo `sgcEnvioIndustriaRegistrar` quando `ID_AGENDA > 0` |

## Mapa das ondas

| Onda | Specs | Origem no p-45547 |
|---|---|---|
| **1 (esta)** | 001 fornecedores · 002 quadro de compras · 003 itens e análise WinThor · 004 agenda de análises | 006 (parte), 001, 007, 003 |
| 2 | NF × pedido, faturamento e cobrança · trânsito e recebimento · produtos em B.O. | 009, 010, 001 (B.O.) |
| 3 | solicitações do comercial · indicadores e relatórios · extrato PDF | 004, 005, 001 (HU-12) — **formulário público descartado** (C-01, O3-04) |
| 4 | compras inteligentes · coberturas ABC (refina a `SGC_COBERTURA`) | 002, 006 |
| 5 | movimentação, perdas, promocionais, ruptura · pedido Galderma | 011, 012, 014, 015, 013 |

Ordem de implementação da onda 1: 001 → 002 → 003 → 004 (criar pedido precisa de
fornecedor/filial; as travas de saída da Análise só existem com os itens). Na prática as
quatro rodam em paralelo sobre este contrato; a ligação das abas no quadro é do
integrador.

## Fora do SGC 2 (registrado, não planejado)

Formulário público; migração de dados do p-45547; integrações TOTVS/Comercial 360 além
do que a onda cita; reuniões internas sem fornecedor; curva ABC na cobertura (onda 4).
