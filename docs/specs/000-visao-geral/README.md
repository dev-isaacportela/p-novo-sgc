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

Convenções: colunas em UPPERCASE; datas em `VARCHAR(10)`/`VARCHAR(19)`; o mesmo dado tem o mesmo
tipo em toda tabela: `CODFORNEC INT`, `CODFILIAL VARCHAR(10)`, `FORNECEDOR VARCHAR(200)`,
`FILIAL VARCHAR(200)` (C-14 da revisão cruzada); chaves
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
| 002 quadro | 72xx | `sgcPersonaAtual` (`:VAR_USER`), `sgcPersonasListar`, `sgcPersonasListarTotal`, `sgcFasesListar`, `sgcPodeMover`/`sgcPodeExcluir` (SQL ligadas nos ganchos da lib; a saída da Análise é a subconsulta `PENDENCIAS`, que a 003 preenche), `sgcComunicacoesListar`, `sgcNotificacoesListar`, `sgcNotificacoesListarTotal` | tela, `:VAR_USER`: `sgcEscPedidoCriar` (capa; a tela chama `api.cardCriar` da lib antes), técnica (aprovar/reprovar), diretoria (aprovar/reprovar), `sgcEscPedidoCancelar`, `sgcEscPersonaSalvar`; por id, `{{usuarioId}}`: `sgcEscPedidoEnvio` e `sgcEscComunicacaoInserir` (de `sgcEnvioIndustriaRegistrar`), `sgcEscPedidoCapaInserir` (cron da 004, R-010), `sgcEscPedidoReprovacoesLimpar` (`sgcAnaliseSair` da 003, R-011) | `sgcPedidoCarregar` (capa + itens + alertas numa execução), `sgcEnvioIndustriaRegistrar` (`sendEmailMitra` com cópia fixa compras@; chama `sgcEscAgendaEnvio` da 004 por id quando `ID_AGENDA > 0`, R-012) |
| 003 itens | 73xx | `sgcWintAnaliseMontagem`, `sgcWintBuscarProduto`, `sgcWintLotesAVencer`, `sgcWintExcessoOutrasFiliais`, `sgcWintPrazoPagamento` (Oracle), `sgcCustoUnidadesPorCaixa` (INTEGRATION `gestao-de-custos`, AN-05 B), `sgcCoberturaListar`, `sgcAnaliseSaidaVerificar` (as travas de saída da Análise; `sgcPodeMover` a incorpora como subconsulta no ramo `analise → tecnica`) | 7350–7361: `sgcEscItemGravar`, `sgcEscItemRemover`, `sgcEscItemRemoverZerados`, `sgcEscItemStatusFase` (tela, `:VAR_USER`; quem a chama é a tela da 002, depois da aprovação da diretoria e depois do envio, F-07), `sgcEscAlertaInserir`, `sgcEscAlertaRemoverObsoletos`, `sgcEscAlertaLer`, `sgcEscAlertaJustificar`, `sgcEscCoberturaGravar`, `sgcEscCoberturaExcluir`, `sgcEscPedidoPrazo`, `sgcEscPedidoTotal` — as chamadas direto da tela guardadas por `:VAR_USER`; as chamadas por id de dentro de `sgcItensGravar`/`sgcAlertasGerar`/`sgcAnaliseSair` com `{{usuarioId}}` (o plan da 003 diz qual é qual) | `sgcItensGravar` (lote), `sgcAlertasGerar`, `sgcAnaliseSair` (remove zerados, limpa reprovações por `sgcEscPedidoReprovacoesLimpar` da 002, recalcula o total) |
| 004 agenda | 74xx | `sgcAgendaListar`, `sgcAgendaListarTotal`, `sgcAgendaCarregar` | `sgcEscAgendaInserir`, `sgcEscAgendaAtualizar`, `sgcEscAgendaCancelar`, `sgcEscAgendaParticipanteLimpar`, `sgcEscAgendaParticipanteInserir` (tela, `:VAR_USER`); internas sem sessão, chamadas por id pelo cron e pelo envio: `sgcEscAgendaProcessada`, `sgcEscAgendaProximaInserir`, `sgcEscAgendaParticipanteCopiar`, `sgcEscAgendaEnvio` | `sgcAgendaProcessar` (cron `0 */30 * * * *`, cria o card com `origem: 'sistema'`), `sgcAgendaProcessarManual` (quatro recortes, AG-06 B: `agendamento` por id, `intervalo` de datas, `dias` a partir de hoje, `mes` corrente — o padrão) |

Escritas por id e perfil de acesso (exceção ao princípio 5): escrita disparada por processo
sem sessão (cron da agenda) ou de dentro de um JS (`sgcFornecedorSalvar`, `sgcEnvioIndustriaRegistrar`)
não pode ser guardada por `:VAR_USER` — chamada aninhada não o propaga com garantia. Essas
SQL recebem `{{usuarioId}}` cru e quem confere a persona é o JS, por `runQueryMitra` com
`:VAR_USER`, **antes** de qualquer escrita. O perfil business (`add-002`) libera todas as SFs,
como a lib faz com as `kbEsc*`; se o sandbox provar que chamada aninhada dispensa o perfil, as
`sgcEsc*` chamadas só por id saem dele (item da verificação da onda 1). A guarda de persona no
servidor é UM texto só, o da 002 (mapa completo de `ACCESS_LEVEL`: ADMIN → admin, MEMBER → analista,
RESTRICTED → comercial, sem linha → analista, e `ACCESS_LEVEL <> 'READ_ONLY'`), copiado literal nas
outras specs (R-013). Ids no simulador: helper `backend/ids-do-mapa.mjs` (nome → id de todos os blocos
de `server-functions.ts`; o `lerIdsDoMapa` da lib só devolve as `kbEsc*`); na publicação, por nome
(`listServerFunctionsMitra`) (R-016).

Scripts do backend, na ordem do sandbox: `add-001-kanban.mjs` (instala a lib com
`instalar({ ganchos })`), `add-003-jdbc-winthor.mjs`, `add-004-fornecedores.mjs`,
`add-005-quadro-compras.mjs`, `add-006-itens.mjs`, `add-007-agenda.mjs` e, por último e fora do
`PUBLISH_ORDER`, `add-002-perfil-acesso.mjs`. Todo o DDL `SGC_*` mora no `setup-backend.mjs`.

Oracle (WinThor): `add-003-jdbc-winthor.mjs` cria a conexão com as credenciais do `.env`
do sandbox; as `sgcWint*` recebem o `jdbcId` resolvido por nome no `isEntrypoint()`. No
simulador, as tabelas `PC*` existem em SQLite com os mesmos nomes e colunas — um DDL só, do
integrador, em `backend/simulator/schema-winthor.mjs`, com a união das colunas que as specs usam; nunca
no `setup-backend.mjs`, porque na plataforma elas são do Oracle; os seeds das features só inserem linhas,
o seed da 001 é a única fonte de fornecedores (1015 e 1042 ativos, 1088 inativo) e filiais (1 Matriz,
2 Filial Norte, 3 Filial Sul) e `SGC_USUARIO_PERSONA` só é semeada pelo `seed/002-quadro.mjs` (R-017) — e o dialeto
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
| R-012 (002, 004) | nome da escrita que sincroniza a agenda no envio (EN-05 A) | `sgcEscAgendaEnvio` (004, `{ idCard, dtEnvio }` com `dtEnvio` em `AAAA-MM-DD`), chamada por id pelo `sgcEnvioIndustriaRegistrar` quando `ID_AGENDA > 0` |
| R-013 (todas) | duas guardas de persona diferentes no servidor | Um texto só, o da 002 (mapa completo de `ACCESS_LEVEL`, RESTRICTED → comercial, `<> 'READ_ONLY'`), copiado literal em 001, 003 e 004 |
| R-014 (002, 003) | quem chama `sgcEscItemStatusFase` (F-07)? | A tela da 002, depois da aprovação da diretoria (`aprovado`) e depois do envio (`enviado`); é escrita de tela, `:VAR_USER`, input `{ idCard, status, atualizadoEm }` |
| R-015 (001, 003) | regra de parcelas em dois arquivos | Dono único `lib/prazo-pagamento.ts` (003): `parcelasDoPrazo`/`textoDeParcelas`; a 001 importa e apaga as duplicatas |
| R-016 (todas) | ids de SF chamadas por id no simulador | Helper do integrador `backend/ids-do-mapa.mjs` (todos os blocos); `lerIdsDoMapa` da lib fica só para as `kbEsc*` do add-001 |
| R-017 (001, 003, 004) | seeds contraditórios (PC*, fornecedores, personas) | DDL das `PC*` no `schema-winthor.mjs` do integrador; fornecedores e filiais só no seed da 001; personas só no seed da 002; os demais seeds só inserem as próprias linhas |
| R-018 (002, 004) | título do card criado pelo cron | Igual à RN-014 da 002 (`FILIAL · FORNECEDOR` em maiúsculas), repetida no JS do cron |
| R-019 (004) | lote do cron | 30 agendamentos por rodada (teto de 300 execuções/min é do projeto inteiro) |
| R-020 (002) | `sgcPodeMover` devolvia `MOTIVO` com `PODE = 1` | `MOTIVO` vazio quando pode (contrato da lib); `sgcPodeExcluir` trata `RESTRICTED` como o `sgcPodeMover`; diretoria só cancela na própria fase, também na escrita |

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

## Revisão adversarial da onda 1 (2026-09-15) e dívidas abertas

Revisão feita sobre `develop` depois da integração das quatro features, com o código nas mãos (não a spec). Seis achados de risco (A1–A6) foram corrigidos nas branches `fix/00N-revisao` e mergeados antes da `release/onda-1`; o que ficou está listado aqui para não se perder.

**Corrigido antes da release**

| Id | O que era | Como ficou |
|---|---|---|
| A1 | Escritas `sgcEsc*` chamadas por id (002, 003, 004) sem guarda de persona: o perfil business libera todas as SFs, então qualquer usuário podia chamá-las direto pelo SDK. | Toda escrita por id leva a mesma guarda da 002 sobre `{{usuarioId}}` (R-013); os JS passam `usuarioId` em cada chamada, inclusive `sgcEnvioIndustriaRegistrar` → `sgcEscAgendaEnvio` (C-031 provado no smoke). |
| A2 | `RESTRICTED` não conferido nas escritas por id da 003 (podia gravar item de pedido alheio). | `pedidoEmAnalise(cardId, usuarioId)` exige `CRIADO_POR = usuário` para RESTRICTED; a aba Itens espelha o servidor no `podeEditar`. |
| A3 | `NovoPedidoPage` e `DialogoEnvio` liam `sgcFornecedorCarregar` (uma linha) com `linhas()` e perdiam filiais e contatos. | Passaram a `acao()`, lendo o objeto (filiais e contatos aparecem). |
| A4 | `verificarSaidaAnalise` lia `resposta.error`, mas o contrato devolve `erro`: a saída da Análise mostrava frase genérica. | Lê `erro` e devolve a mensagem real de cada condição de RN-012. |
| A5 | `AgendaDialogo` localizava a agenda pelo índice na página e sobrescrevia os participantes de outra agenda ao paginar. | Localiza por `CRIADO_EM`. |
| A6 | `INSERT … SELECT … WHERE` sem `FROM DUAL` em 10 escritas (001, 003, 004): roda no SQLite, quebra no MySQL. | Corrigidas; o `sim:check` acusa qualquer nova (`INSERT ... SELECT ... WHERE sem FROM DUAL`). |
| D-07 | `kbNotaRegistrar` sem `try/catch` no `sgcAnaliseSair`. | Nota que falha não derruba a saída da Análise. |
| D-10 | Comentários defasados pela integração (stubs, "só a 002 grava", worktree). | Apagados ou reescritos. |
| D-11 | `FornecedorPage` escondia o botão Salvar sem permissão. | Desabilitado com o motivo no `title` (RF-032/C-040). |
| D-12 | Gestor `READ_ONLY` perdia o item Coberturas do menu. | `verCoberturas` (admin, gestor) não é zerado por READ_ONLY. |

**Aberto — verificar no sandbox na primeira publicação**

| Id | O que é | Onde |
|---|---|---|
| D-03 | Escrita SQL guardada recusada devolve 0 linhas e nenhum erro: a tela acredita que gravou (aprovar, reprovar, cancelar, criar pedido, salvar persona e cobertura). Depende de saber o que a plataforma devolve para um `UPDATE` de 0 linhas; com isso o `acao()` passa a acusar "nada foi gravado". | `lib/mitra-api.ts`, `AcoesDoPedido.tsx`, `NovoPedidoPage.tsx`, `SegurancaPage.tsx`, `CoberturasPage.tsx` |
| D-04 | Sessão em chamada aninhada: o simulador força `userId = 0`, então `kbCardCriar` sempre cai em `origem: 'sistema'`. Se a plataforma propagar a sessão, o `sgcAgendaProcessarManual` cria o card em nome de quem clicou, não de quem agendou (RN-009 da 004). | `simulator/runtime.mjs`, `add-007-agenda.mjs`, `smoke/004-agenda.mjs` |
| R-007 | Se `sgcEsc*` chamadas só por id executarem para o usuário business direto pelo SDK, elas saem do perfil (`add-002`). | `add-002-perfil-acesso.mjs` |

**Aberto — dívida de código (sem risco funcional hoje)**

| Id | O que é | Onde |
|---|---|---|
| D-01 | Abrir card custa 3 execuções (RNF-001 pede 2): `QuadroPage` e `PedidoProvider` carregam a capa cada um. Marcado com `ponytail:`. | `QuadroPage.tsx`, `abas/PedidoProvider.tsx` |
| D-02 | `sgcPersonaAtual` fora do cache de `lib/persona.ts` em `PedidoProvider`, `CoberturasPage` e `AgendaPage` (a Agenda refaz a cada filtro). | idem |
| D-05 | `escrever()` do add-005/add-007 não desembrulha `output` em string; o `chamar()` do add-006 desembrulha. Uniformizar num helper de `lib/`. | `add-005`, `add-006`, `add-007` |
| D-06 | `sgcAlertasGerar` aceita `usuarioId` do input como identidade quando `:VAR_USER` não resolve. Só alcançável sem sessão; fechar antes de liberar `criadoPor` em produção. | `add-006-itens.mjs` |
| D-08 | `sgcAnaliseSair` grava (zerados, total, reprovações) antes de a tela chamar `ctx.mover`; movimento recusado depois deixa o pedido já alterado. Assumido (D-013 da 003). | `add-006`, `QuadroPage.tsx` |
| D-09 | `CHECK_INPUT` é um objeto só (vale a última chave), então o `sim:check` nunca exercita o ramo "filtro desligado" da 001. Cobertura menor, não erro. | `simulator/config.mjs` |
| D-13 | `DATA_ENVIO_REAL VARCHAR(19)` guarda `AAAA-MM-DD` (10 caracteres). Convenção; não mexer no setup. | `setup-backend.mjs`, `add-007` |
| D-14 | Texto de carregamento com Tailwind solto repetido nas abas Itens e Alertas, em vez de um primitivo de `page.tsx`. | `abas/Itens.tsx`, `abas/Alertas.tsx` |
| — | Seed da 003 cria cards sem `VALORES_JSON`; `alertas_pendentes` e `motivo_cancelamento` (campos do quadro) continuam editáveis no formulário da lib. | `simulator/seed/003-itens.mjs`, `add-005` |

## Onda 2 — contrato (2026-09-15)

Nada foi publicado na plataforma ainda (decisão do usuário: o sandbox só recebe o projeto quando as
ondas terminarem). Por isso a onda 2 **edita o `CREATE TABLE` das tabelas da onda 1** em vez de usar
`ALTER TABLE`, e a lib pode ganhar uma versão nova sem migração em produção.

### Specs

| Spec | Assunto | Regras (`regras.md`) | Origem no p-45547 |
|---|---|---|---|
| `005-notas-fiscais-e-faturamento` | detecção automática de NF de entrada (cron 30 min), registro híbrido pelo número, conferência NF × pedido (uma ocorrência por comparação, inclusive conforme), faturamento medido em valor e quantidade, cobrança do faturamento pendente (dias úteis 3 / 5 / +5, contatos, e-mail manual) | O2-01, O2-02, O2-03, O2-07 | 009 inteira, 010 HU-5 |
| `006-transito-e-recebimento` | previsão de recebimento por nota (prazo do fornecedor), sincronização com o WinThor a cada 2 h, alerta de atraso uma vez por dia por nota, Trânsito → Faturamento automático com 100 % recebido, painel de NFs em atraso, regra de conclusão | O2-04, O2-05 | 010 HU-1..HU-4 |
| `007-produtos-em-bo` | itens indisponíveis com previsão de liberação, carta de falta, clientes impactados nos últimos 60 dias, painel consolidado visível a todas as personas, alerta diário enquanto o card estiver em B.O. | O2-06 | `add-bo-fase-produtos.mjs` (SFs 418–426) |

Ordem lógica: 005 → 006 → 007 (trânsito e B.O. leem as NFs da 005). Na prática as três rodam
em paralelo sobre este contrato; as abas do card e os blocos do gancho são ligados pelo integrador.

### Decisões da onda 2 (R-021..R-034)

| Id | Decisão |
|---|---|
| R-021 | **Movimento por processo (lib 1.4.0, spec 014 da lib)**: `kbCardMover` ganha `movidoPor` (int) e `origem: 'sistema'`, que só valem sem sessão — a mesma premissa de `kbCardCriar` na 013. Nesse ramo não passa pelo gancho `podeMover` (a regra ligada é sobre pessoas) nem pela RN-004 (sair de fase final), mas valida obrigatórios, condição de entrada e roda as automações de `card_movido` com `origem` `sistema` em `KB_MOVIMENTO`. Única consumidora na onda 2: o cron da 006 (Trânsito → Faturamento). Até o usuário publicar a 1.4.0, os dois lados usam a lib local por `npm link` (a dependência continua `^1.3.0` no `package.json`; vira `^1.4.0` na release). |
| R-022 | **B.O. é fase do próprio pedido** (F-01), sem card filho (o legado criava um card filho por `ID_CARD_PAI`). Entra só de Faturamento e sai para Faturamento ou Concluídas — os pares já existem em `PARES` (002) e em `transicoes.ts`. Item em B.O. é `SGC_PEDIDO_ITEM.STATUS = 'bo'` (valor novo) mais uma linha em `SGC_BO_ITEM`. |
| R-023 | **Avisos de processo** (faturamento pendente, NF atrasada, NF recebida, previsão de B.O. atingida) vão para uma tabela só, `SGC_AVISO`, gravada por `sgcEscAvisoInserir` (005) chamada **por id** pelos crons das três specs. Cron não tem sessão nem persona: a guarda dessa escrita é só a idempotência (`CHAVE` única por tipo + card + dia). Risco aceito e registrado: quem chamar por id consegue, no máximo, enfileirar um aviso; se o sandbox provar que chamada por id dispensa o perfil (R-007), ela sai do perfil business. O feed `/notificacoes` ganha o ramo `SGC_AVISO` na `notificacoesUniao()` (integrador, S4) a partir de `backend/sql/notificacoes-avisos.sql` da 005: aviso para `PARA_USUARIO_ID = :VAR_USER`, ou para os responsáveis do card quando `PARA_USUARIO_ID = 0`, ou para a persona em `PARA_PERSONA` (`gestor` no alerta consolidado de 5 dias). Além do aviso, todo cron registra `kbNotaRegistrar` no card. |
| R-024 | **Faixas de id e scripts**: 005 → 75xx (`add-008-notas-fiscais.mjs`), 006 → 76xx (`add-009-transito.mjs`), 007 → 77xx (`add-010-bo.mjs`); leituras/JS em x01–x30, escritas em x50–x79. `PUBLISH_ORDER` cresce nessa ordem; `add-002` continua por último e fora dele. |
| R-025 | **Dias úteis** = segunda a sexta, sem feriados (D-4/E-2 do legado). Uma implementação só de cada lado, criada na base (S2) a partir do plan da 005: `backend/lib/dias-uteis.mjs` (fragmentos SQL MySQL que também rodam no dialeto do simulador: `diasUteisEntre(colInicio, colFim)` e `somarDiasUteis(col, n)`) e `frontend/src/lib/dias-uteis.ts` (puro, testado) — 006 importa, não reimplementa. Conferência de referência: 2026-08-24 (segunda) + 15 dias úteis = 2026-09-14. |
| R-026 | **Tabelas da onda 2** (todas no `setup-backend.mjs` pela base): `SGC_NF`, `SGC_NF_ITEM`, `SGC_NF_OCORRENCIA`, `SGC_NF_SUGESTAO`, `SGC_CONTATO_FATURAMENTO` (005); `SGC_BO_ITEM`, `SGC_BO_PREVISAO`, `SGC_BO_DOCUMENTO` (007); `SGC_AVISO` (005, compartilhada). `SGC_PEDIDO` ganha `DT_PRIMEIRO_FATURAMENTO`, `VL_FATURADO`, `PERC_FATURADO_VALOR`, `PERC_FATURADO_QTD`, `ALERTA_FATURAMENTO_NIVEL` (0/3/5), `ALERTA_FATURAMENTO_EM` (005) e `DT_PREVISAO_BO`, `ALERTA_BO_EM` (007) — no `CREATE`, sem `ALTER`. Modelo abaixo. |
| R-027 | **WinThor no simulador**: `schema-winthor.mjs` (integrador) ganha `PCNFENT` (`NUMTRANSENT`, `NUMNOTA`, `SERIE`, `CODFORNEC`, `CODFILIAL`, `DTEMISSAO`, `DTENT`, `DTCANCEL`, `VLTOTAL`, `CHAVENFE`, `PRAZO`, `ESPECIE`) e `PCLANC` (`NUMTRANSENT`, `NUMNOTA`, `CODFORNEC`, `DTEMISSAO`, `DTVENC`, `VALOR`, `DUPLIC`, `NUMPARCELAMENTO`); `PCMOV` ganha `NUMTRANSENT`, `NUMNOTA`, `SERIE`, `NUMLOTE`, `DATAVALIDADE`; `PCPRODUT` ganha `CODFAB`, `CODAUXILIAR` (EAN). `PCDADOSXML` fica fora (o EAN vem de `CODAUXILIAR`). Linhas: a 005 semeia as entradas (`PCNFENT`, `PCMOV` com `CODOPER = 'E'`, `PCLANC`); a 007 semeia só vendas (`CODOPER = 'S'`) dos últimos 60 dias com `CODCLI` distintos, sem tocar as linhas da 003 (R-017 vale aqui). |
| R-028 | **Personas na onda 2**: NF, faturamento e trânsito são operados por admin, analista e gestor; diretoria vê; comercial não vê. B.O.: o painel `/bo` é visível a **todas** as personas (O2-06, inclusive comercial); marcar item, registrar previsão e carta de falta é de admin, analista e gestor. `RESTRICTED` só os próprios cards; `READ_ONLY` não opera. Chaves novas em `lib/permissoes.ts` (base, S2): `verNotasFiscais`, `operarNf`, `verFaturamentoPendente`, `registrarContato`, `verNfsAtraso`, `verBo`, `operarBo`. |
| R-029 | **Abas do card**: 005 entrega `AbaNotasFiscais` (sugestões, NFs vinculadas, ocorrências com decisão, contatos e cobrança), 006 entrega `AbaRecebimento` (previsão e status por nota, "Verificar entrada no WinThor"), 007 entrega `AbaBo` (itens, previsões, carta de falta, clientes impactados). Todas `AbaExtra` da lib recebendo o `ExtensaoContexto`, ligadas em `abasExtras` do `QuadroPage` pelo integrador (S4). Ação de fase (marcar B.O., validar NF) vive dentro da aba e usa `ctx.mover`/`ctx.recarregar`; `AcoesDoPedido` (002) não muda. |
| R-030 | **Gancho `sgcPodeMover`** ganha três blocos, fragmentos SQL entregues em `backend/sql/` e compostos pelo integrador (o mesmo padrão de `pendencias-analise.sql`): `enviado>transito` exige ≥ 1 NF vinculada (`pendencias-transito.sql`, 005; RN-1 da 010); `faturamento>bo` exige ≥ 1 item marcado em B.O. (`pendencias-bo-entrada.sql`, 007); `faturamento>concluido` e `bo>concluido` exigem zero ocorrência de NF com decisão pendente (`pendencias-conclusao-nf.sql`, 005) e zero item de B.O. em aberto (`pendencias-conclusao-bo.sql`, 007). `transicoes.ts` (tela) espelha com os mesmos textos; os textos novos entram em `MOTIVOS`/`M` pelo integrador, e o teste de 500 combinações (RNF-005 da 002) continua valendo. |
| R-031 | **Trânsito → Faturamento**: automático pelo cron `sgcRecebimentoSincronizar` (006) via `kbCardMover` com `origem: 'sistema'` e `movidoPor` = primeiro responsável do card (ou o criador), quando 100 % das NFs vinculadas têm `DT_RECEBIMENTO`; o movimento manual continua permitido sem exigência (a pendência de NF é na entrada em Trânsito). NF cancelada no WinThor (`DTCANCEL`) não conta como recebida. |
| R-032 | **Faturamento**: NF só conta quando entrou no WinThor (`PCNFENT`, D-2); o registro híbrido (número + fornecedor) busca a nota **sem** exigir entrada (`sgcWintNfBuscar`) e o recebimento continua dependendo de `DTENT`. Percentual em valor e em quantidade; 100 % em valor encerra o monitoramento. Preço: delta 0 → `conforme`, até 1 % → `atencao`, acima → `divergente`; item não pedido, quantidade maior, validade curta (120 dias da emissão, ou `VALIDADE_MINIMA_DIAS` do fornecedor) e prazo divergente (parcelas de `PCLANC`, fallback `PCNFENT.PRAZO`) são `conforme`/`divergente`. Divergência não bloqueia o vínculo. Nenhum vínculo sem confirmação humana; NF já vinculada a qualquer card não é sugerida de novo. |
| R-033 | **E-mails**: nenhum e-mail automático ao fornecedor (D-9). A cobrança manual sai por `sgcCobrancaEnviar` (005, JS, `sendEmailMitra` com cópia fixa compras@), grava `SGC_COMUNICACAO` (`TIPO = 'cobranca'`) e `SGC_CONTATO_FATURAMENTO`. |
| R-034 | **Carta de falta** e outros documentos do B.O. sobem pelo mesmo transporte dos documentos do fornecedor (001) e ficam em `SGC_BO_DOCUMENTO`. |

### Modelo de dados da onda 2

| Tabela | Conteúdo | Spec |
|---|---|---|
| `SGC_NF` (N:1 card, `UNIQUE (ID_CARD, NUMNOTA, SERIE)`) | `ID_CARD`, `NUMNOTA`, `SERIE`, `CHAVENFE`, `NUMTRANSENT` (WinThor), `CODFORNEC`, `CODFILIAL`, `DT_EMISSAO`, `DT_ENTRADA` (`PCNFENT.DTENT` na vinculação), `DT_RECEBIMENTO` (006: entrada consolidada; nasce igual a `DT_ENTRADA` quando a NF já entrou), `VL_TOTAL`, `PRAZO_PARCELAS` (`"28/35/42"`), `ORIGEM` (`automatica`/`hibrida`/`manual`), `ALERTA_ATRASO_EM` (006), `VINCULADO_POR`, `VINCULADO_EM` | 005 (+006) |
| `SGC_NF_ITEM` (N:1 NF, `UNIQUE (ID_NF, CODPROD, NUMLOTE)`) | `ID_NF`, `ID_CARD`, `CODPROD`, `CODFAB`, `EAN`, `DESCRICAO`, `QT_FATURADA`, `PRECO_FATURADO`, `NUMLOTE`, `DT_VALIDADE`, `CASADO_POR` (`codprod`/`codfab`/`ean`/`nenhum`) | 005 |
| `SGC_NF_OCORRENCIA` (N:1 NF) | `ID_NF`, `ID_CARD`, `CODPROD` (0 = regra do pedido), `TIPO` (`item_nao_pedido`, `validade_curta`, `preco_divergente`, `qtd_maior`, `prazo_divergente`, `valor_total_divergente`, `percentual_faturado`), `RESULTADO` (`conforme`/`atencao`/`divergente`), `VALOR_ESPERADO`, `VALOR_ENCONTRADO`, `DELTA_PERC`, `DECISAO` (`pendente`/`aceito`/`recusado`), `JUSTIFICATIVA`, `DECIDIDO_POR`, `DECIDIDO_EM`, `CRIADO_EM` | 005 |
| `SGC_NF_SUGESTAO` (`UNIQUE (CHAVENFE, ID_CARD)`) | `CHAVENFE`, `NUMTRANSENT`, `NUMNOTA`, `SERIE`, `CODFORNEC`, `CODFILIAL`, `VL_TOTAL`, `DT_EMISSAO`, `DT_ENTRADA`, `ID_CARD`, `NUMPED_WINTHOR`, `ORIGEM` (`pedido`/`heuristica`), `SCORE` (0–100), `STATUS` (`sugerida`/`validada`/`recusada`/`ignorada`), `MOTIVO`, `DECIDIDO_POR`, `DECIDIDO_EM`, `CRIADO_EM` | 005 |
| `SGC_CONTATO_FATURAMENTO` (N:1 card) | `ID_CARD`, `DT_CONTATO`, `CANAL` (`email`/`telefone`/`whatsapp`/`portal`), `RESUMO`, `PREVISAO_FATURAMENTO`, `REGISTRADO_POR`, `CRIADO_EM` | 005 |
| `SGC_AVISO` (`UNIQUE (CHAVE)`) | `ID_CARD`, `TIPO` (`faturamento_3`, `faturamento_5`, `faturamento_diario`, `nf_atrasada`, `nf_recebida`, `bo_previsao`), `CHAVE` (`tipo:card:AAAA-MM-DD[:nf]`), `PARA_USUARIO_ID` (0 = responsáveis do card), `PARA_PERSONA` (`''` ou `gestor`), `TEXTO`, `CRIADO_EM` | 005 (todas gravam por id) |
| `SGC_BO_ITEM` (N:1 card, `UNIQUE (ID_CARD, CODPROD)`) | `ID_CARD`, `CODPROD`, `DESCRICAO`, `QT_PENDENTE`, `OBSERVACAO`, `STATUS` (`aberto`/`liberado`/`cancelado`), `CLIENTES_IMPACTADOS`, `QT_VENDIDA_60D` (foto do WinThor ao marcar), `CRIADO_POR`, `CRIADO_EM`, `RESOLVIDO_POR`, `RESOLVIDO_EM` | 007 |
| `SGC_BO_PREVISAO` (N:1 card) | `ID_CARD`, `DT_PREVISAO`, `OBSERVACAO`, `REGISTRADO_POR`, `REGISTRADO_EM` — cada previsão nova reinicia o alerta (`SGC_PEDIDO.DT_PREVISAO_BO` espelha a última) | 007 |
| `SGC_BO_DOCUMENTO` (N:1 card) | `ID_CARD`, `TIPO` (`carta_falta`/`outro`), `NOME_ARQUIVO`, `URL`, `ENVIADO_POR`, `ENVIADO_EM` | 007 |

Campo do quadro novo: `faturamento` (texto, capa: `R$ 72.000 (60 %) · saldo R$ 48.000`), criado pelo
`add-008` idempotente por chave, atualizado por `sgcEscPedidoFaturamento` junto das colunas de
`SGC_PEDIDO`. `alertas_pendentes` continua da 003.

### Server functions da onda 2 (nomes definitivos nos plans; estes são fixos)

| Spec | Leitura / JS | Escrita (SQL) | Crons (UTC) |
|---|---|---|---|
| 005 | `sgcWintNfEntradas` (candidatas por `NUMPED` e por fornecedor + filial + emissão ≥ envio), `sgcWintNfItens`, `sgcWintNfParcelas`, `sgcWintNfBuscar` (híbrido, sem exigir entrada), `sgcNfSugestoesListar`/`Total`, `sgcNfListar` (do card, com itens e ocorrências numa execução), `sgcFaturamentoPendenteListar`/`Total`, `sgcContatosListar`, `sgcNfDetectar` (JS, cron), `sgcNfVincular` (JS: grava NF + itens, roda as 7 regras, recalcula faturamento, nota), `sgcOcorrenciaDecidir` (JS: aceitar/recusar, "aceitar conformes" em lote), `sgcFaturamentoMonitorar` (JS, cron), `sgcCobrancaEnviar` (JS) | `sgcEscNfInserir`, `sgcEscNfItemInserir`, `sgcEscOcorrenciaInserir`, `sgcEscOcorrenciaDecidir`, `sgcEscSugestaoInserir`, `sgcEscSugestaoDecidir`, `sgcEscContatoInserir`, `sgcEscPedidoFaturamento`, `sgcEscPedidoAlertaFaturamento`, `sgcEscAvisoInserir` | `sgcNfDetectar` `0 */30 * * * *`; `sgcFaturamentoMonitorar` `0 0 11 * * *` |
| 006 | `sgcNfsRecebimentoCard` (previsão e status por nota: `recebida`, `atrasada`, `em_transito`, `dentro_prazo`, `sem_prazo`), `sgcNfsRecebimentoPendente`, `sgcNfsEmAtraso`/`Total`, `sgcWintNfEntradasConfirmadas` (por `NUMTRANSENT`/`NUMNOTA` + fornecedor, `DTENT` não nulo, `DTCANCEL` nulo), `sgcRecebimentoSincronizar` (JS: cron e "Verificar entrada" por `cardId`) | `sgcEscNfRecebimento`, `sgcEscNfAlertaAtraso` (por id, `{{usuarioId}}` do responsável) | `sgcRecebimentoSincronizar` `0 25 6-20/2 * * *` |
| 007 | `sgcBoItensCard`, `sgcBoPainel`/`Total` (todos os cards em `bo`), `sgcBoPrevisoesCard`, `sgcBoDocumentosCard`, `sgcWintClientesImpactados` (`PCMOV` `CODOPER = 'S'`, 60 dias, por lista de `CODPROD`), `sgcBoMarcar` (JS: marca itens, foto dos clientes impactados, status `bo` no item), `sgcBoMonitorar` (JS, cron) | `sgcEscBoItemInserir`, `sgcEscBoItemResolver`, `sgcEscBoPrevisaoInserir`, `sgcEscBoDocumentoInserir`, `sgcEscPedidoPrevisaoBo`, `sgcEscItemStatusBo` (item do pedido → `bo` e volta) | `sgcBoMonitorar` `0 5 11 * * *` |

Quem chama o quê: tela → SQL guardada por `:VAR_USER`; JS (vínculo, decisão, cron) → escritas por
id com `{{usuarioId}}` e a guarda de persona única (R-013) — no cron, `{{usuarioId}}` é o responsável
do card (ou o criador) e a persona conferida é a dele; `sgcEscAvisoInserir` é a exceção (R-023).
Consultas Oracle no smoke provam contagem > 0.

### Telas da onda 2

| Rota | Tela | Persona | Spec |
|---|---|---|---|
| `/notas-fiscais` | sugestões (Pedido · Fornecedor · Fase · NF · Score · Status · Validar / Ver / Recusar) + busca híbrida por número | admin, analista, gestor; diretoria lê | 005 |
| `/faturamentos-pendentes` | total, filtros 0 contato / 3 / 5 / +5 dias úteis, busca, exportar CSV, Registrar contato, Enviar cobrança | idem | 005 |
| `/nfs-em-atraso` | notas vencidas dos cards em Enviado e Trânsito: total e valor, faixas até 3 / 4–7 / +7 dias, busca, CSV, "Sincronizar com o WinThor" | idem | 006 |
| `/bo` | painel consolidado dos produtos em B.O. (previsão, clientes impactados, card) | todas, inclusive comercial | 007 |
| card | abas Notas fiscais (005), Recebimento (006), B.O. (007) | conforme R-028 | — |

Menu (`AdminLayout`, base S2): grupo **Fiscal** (Notas fiscais, Faturamentos pendentes, NFs em atraso)
e **Produtos em B.O.** no grupo Compras. Capa do card: etiqueta "Faturamento pendente" a partir de 3 dias
úteis vem do campo `faturamento` e de `ALERTA_FATURAMENTO_NIVEL` na capa da 002 (o integrador liga).

### Decisões tomadas durante as specs da onda 2 (R-035..R-038)

| Id | Decisão |
|---|---|
| R-035 | **Crons em UTC.** `sgcRecebimentoSincronizar` = `0 25 9-23/2 * * *` (6h25–20h25 de Brasília, de 2 em 2 h); `sgcFaturamentoMonitorar` `0 0 11 * * *` e `sgcBoMonitorar` `0 5 11 * * *` (8h/8h05 de Brasília); `sgcNfDetectar` `0 */30 * * * *`. |
| R-036 | **Linhas `PC*` por spec** (R-017 aplicado a linha, não a tabela): cada spec insere as notas dos seus cenários em faixa de `NUMNOTA` reservada — 005 abaixo de 90000, 006 em 90001–90015; a 007 não semeia NF e as suas vendas em `PCMOV` usam `CODCLI` ≥ 900 e `NUMTRANSITEM` ≥ 900000 para não colidir com a 003. |
| R-037 | **CSV** uma vez só: `frontend/src/lib/csv.ts` na base (`textoCsv(cabecalho, linhas)`, `baixarCsv(nome, texto)`), usado por `/faturamentos-pendentes`, `/nfs-em-atraso` e `/bo`. |
| R-038 | **Assinaturas fixas entre specs:** `sgcEscAvisoInserir { idCard, tipo, chave, paraUsuarioId, paraPersona, texto, criadoEm }` idempotente por `CHAVE`; `backend/lib/dias-uteis.mjs` exporta `somarDiasUteis(col, n)`, `somarDiasCorridos(col, n)` (`n` literal ou coluna; fragmento SQL que roda no MySQL e no dialeto do simulador; base em fim de semana recua para sexta) e `diasUteisEntre(colInicio, colFim)`; NF vinculada que já entrou no ERP nasce com `DT_RECEBIMENTO = DT_ENTRADA`; `operarNf` governa também "Verificar entrada"/"Sincronizar" da 006; `verNotasFiscais`, `verFaturamentoPendente` e `verNfsAtraso` incluem a diretoria (leitura); `verBo` inclui todas as personas. |
