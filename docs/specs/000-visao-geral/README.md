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
| `leitura` | consulta | só lê |

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
| `SGC_PEDIDO` (1:1 `KB_CARD`) | `ID_CARD`, `CODFORNEC`, `FORNECEDOR`, `CODFILIAL`, `FILIAL`, `PERIODO_INICIO/FIM` (padrão 45 dias, AN-11), `VL_TOTAL`, `PRIORIDADE`, prazo de pagamento (`PRAZO_PADRAO`, `PRAZO_ACORDADO`, `PRAZO_JUSTIFICATIVA`), aprovação técnica (`TEC_POR`, `TEC_EM`, `TEC_MOTIVO`, `TEC_PRODUTOS_REPROVADOS`), diretoria (`DIR_POR`, `DIR_EM`, `DIR_MOTIVO`), envio (`DT_ENVIO`, `CANAL`, `EMAIL_ENVIO`, `NUMPED_WINTHOR`), cancelamento (`CANC_MOTIVO`, `CANC_POR`, `CANC_EM`), `ORIGEM` (`manual`/`agenda`), `ID_AGENDA` | 002 |
| `SGC_PEDIDO_ITEM` (N:1 card) | `CODPROD`, `DESCRICAO`, `EMBALAGEM`, `UNIDADE`, `UN_POR_CAIXA` (gestão de custos, AN-05 B), `QT_VENDA_TOTAL`, `QT_VENDA_LICITACAO`, `QT_ESTOQUE`, `QT_TRANSITO`, `QT_SUGERIDA`, `QT_PEDIDA`, `PRECO_CUSTO`, `TIPO_PRECO` (AN-08 B), `CURVA_ABC`, `COBERTURA_DIAS`, `COBERTURA_LIMITE`, `COBERTURA_JUSTIFICATIVA`, `OBSERVACAO`, `STATUS` (`montagem`, `aprovado`, `reprovado`, `enviado`, `removido`) | 003 |
| `SGC_ALERTA` (N:1 card) | `ID_ITEM`, `TIPO` (`vencimento` RN-02, `excesso` RN-03), `MENSAGEM`, `LIDO`, `LIDO_POR`, `LIDO_EM`, `JUSTIFICATIVA` | 003 |
| `SGC_COBERTURA` | limite de cobertura futura por `NIVEL` (`fornecedor`, `departamento`, `secao`, `sku`) e `CODIGO`; vale a mais específica; sem parametrização, 35 dias (AN-07) | 003 |
| `SGC_COMUNICACAO` (N:1 card) | e-mails e envios registrados (EN-06 B): `TIPO`, `PARA`, `CC`, `ASSUNTO`, `CORPO`, `ENVIADO_POR`, `ENVIADO_EM` | 002 |
| `SGC_FORNECEDOR` + `_FILIAL`, `_LINHA`, `_LINHA_CONTATO`, `_FAIXA_PRAZO`, `_DOCUMENTO`, `_LOG` | parametrização própria sobre o cadastro do WinThor: CNPJ, prazo de entrega (úteis/corridos), pedido mínimo, janela de fechamento, link da plataforma, validade mínima, SLA de análise (1) e faturamento (5) dias úteis; filiais atendidas; linhas com contatos de envio; faixas de valor com opções de prazo (`"30/60/90"`); documentos; log campo a campo (FO-06 B) | 001 |
| `SGC_AGENDA` + `SGC_AGENDA_PARTICIPANTE` | `CODFORNEC`, `CODFILIAL`, `DATA_ANALISE`, `PERIODO_INICIO/FIM`, `RECORRENCIA` (`nenhuma`/`semanal`/`quinzenal`/`mensal`), `DATA_LIMITE_RECORRENCIA`, `ATIVO`, `PROCESSADO_EM`, `ID_CARD_GERADO`, `CANCELADO_EM`; participantes (AG-02 B) | 004 |

Convenções: colunas em UPPERCASE; datas em `VARCHAR(10)`/`VARCHAR(19)`; chaves
estrangeiras por convenção (sem `FOREIGN KEY` — o simulador e a plataforma não dependem
delas); `ID` autoincremento; tabela de log com `CAMPO`, `DE`, `PARA`, `POR`, `EM`.
`KB_BOARD.CONFIG_JSON` não guarda nada do SGC.

Campos do quadro `compras` (criados pelo `add-005`, chave estável): `fornecedor`,
`filial`, `valor_total` (moeda), `prioridade` (seleção: normal/alta/urgente, C-07). São
espelho de `SGC_PEDIDO` para a capa, a busca e o filtro não custarem SF por cartão; a
gravação do pedido atualiza os dois (uma SF).

## Server functions

Prefixo `sgc`. Uma faixa de id local por spec (o `sync-server-function-map` traz os reais):

| Spec | Faixa | Leitura (SQL/JS) | Escrita SQL guardada por `:VAR_USER` | JS (orquestração, e-mail, cron) |
|---|---|---|---|---|
| 001 fornecedores | 71xx | `sgcFornecedorListar`, `sgcFornecedorListarTotal`, `sgcFornecedorCarregar` (uma execução: parametrização + filhas), `sgcWintFornecedores`, `sgcWintFiliais` | `sgcEscFornecedor*` (uma instrução por SF) | `sgcFornecedorSalvar` (grava o pai e as filhas, log campo a campo) |
| 002 quadro | 72xx | `sgcPersonaAtual`, `sgcPersonasListar`, `sgcFasesListar`, `sgcPedidoCarregar` (capa + itens + alertas), `sgcPodeMover`/`sgcPodeExcluir` (SQL ligadas nos ganchos da lib), `sgcComunicacoesListar` | `sgcEscPedido*` (capa, aprovação técnica, diretoria, cancelamento, envio, persona) | `sgcPedidoCriar` (tela: `kbCardCriar` + capa), `sgcEnvioIndustriaRegistrar` (`sendEmailMitra` com cópia fixa compras@) |
| 003 itens | 73xx | `sgcWintAnaliseMontagem`, `sgcWintBuscarProduto`, `sgcWintLotesAVencer`, `sgcWintExcessoOutrasFiliais`, `sgcWintPrazoPagamento`, `sgcCoberturaListar` | `sgcEscItem*`, `sgcEscAlerta*`, `sgcEscCobertura*` | `sgcItensGravar` (lote), `sgcAlertasGerar` |
| 004 agenda | 74xx | `sgcAgendaListar`, `sgcAgendaListarTotal`, `sgcAgendaCarregar` | `sgcEscAgenda*` | `sgcAgendaProcessar` (cron `0 */30 * * * *`, cria o card com `origem: 'sistema'`), `sgcAgendaProcessarManual` (quatro recortes, AG-06 B) |

Oracle (WinThor): `add-003-jdbc-winthor.mjs` cria a conexão com as credenciais do `.env`
do sandbox; as `sgcWint*` recebem o `jdbcId` resolvido por nome no `isEntrypoint()`. No
simulador, as tabelas `PC*` existem em SQLite com os mesmos nomes e colunas, e o dialeto
tem os shims `NVL`, `TO_DATE`, `TO_CHAR`, `TRUNC`, `SYSDATE`, `ROWNUM`; cada teste de
consulta Oracle prova contagem > 0.

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
| `/notificacoes` | novo responsável, card movido, mensagem nova nos meus cards (UI-07 B) | 002 |
| `/seguranca` | personas por usuário (admin) | 002 |

Layout, tokens e primitivos: `docs/design.md`. Sem arrastar cartão (UI-01), sem toast
(UI-02), seletor de data próprio sobre os tokens (UI-03 B).

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
