# Plan: 016 — Fila de e-mail e aviso de pedido pronto para concluir

**Spec:** [`spec.md`](spec.md) · **Data:** 2026-11-03 · **Script:** `backend/add-018-fila-email-conclusao.mjs` · **Faixa de id local:** 87xx (escritas 8750–8753, JAVASCRIPT 8780–8781) · **Decisões:** R-170..R-172 no 000

## Constitution Check

| Princípio | Como a 016 atende |
|---|---|
| I. Spec antes de código | spec commitada com o código; P-01..P-09 com a recomendada implementada, aguardando aprovação |
| II. Requisito testável | C-001..C-016 e RN-001..RN-006 com teste de id no título (`smoke/016-fila-email.mjs`, `tests/fila-email.test.mjs`) |
| III. Fora de escopo | seção da spec |
| IV. Migrations | nenhuma tocada; DDL em `setup-backend.mjs` (`DDL_016`), executado só no sandbox |
| V. Duas camadas | nenhuma tela nova; duas linhas de tela trocam o texto por função pura |
| VI. Tokens | nada visual |
| VII. Simplicidade | uma tabela, quatro escritas SQL e duas rotinas; reaproveita a comunicação gravada (o conteúdo do e-mail), o `sgcEscAvisoInserir` da 005, o `kbNotaRegistrar` da lib e os fragmentos da trava de conclusão |

## A lib não tem nova tentativa (P-04)

`@benenutri/mitra-kanban` 1.9.2 (`backend/funcoes.mjs`, `enviarPeloModelo` e a ação `enviar_email`) chama `sendEmailMitra` uma vez: na automação a falha vira "erro" da ação; menção, novo responsável e tarefa engolem a falha (`emailFalhou: true`). README, seção **E-mail (spec 016 da lib)**: "Falha no envio nunca desfaz a gravação". Nada aqui muda a lib. Proposta à lib (fora deste repositório): gravar o e-mail que falhou numa fila própria (`KB_EMAIL_FILA`) e expor uma SF de rodada que o consumidor agende — o mesmo desenho desta spec.

## Modelo de dados (`DDL_016` no fim do array do `setup-backend.mjs`)

| Tabela | Conteúdo |
|---|---|
| `SGC_EMAIL_FILA` | `ID`, `ID_COMUNICACAO` (único: uma entrada por comunicação, C-009), `ID_CARD`, `STATUS` (`pendente` → `enviando` → `enviado` \| `falha`), `TENTATIVAS`, `ULTIMO_ERRO` (2000), `LOTE`, `CRIADO_POR`, `CRIADO_EM`, `ATUALIZADO_EM`, `ENVIADO_EM`; índice (`STATUS`, `ID`) |

A fila **não guarda o e-mail** (RN-002, RN-EM-03 do legado): o destinatário, a cópia, o assunto e o corpo são os de `SGC_COMUNICACAO`, que o envio já gravava. Ninguém põe na fila um e-mail livre — só uma comunicação por e-mail que existe, gravada por quem envia pedido. Limite conhecido: `SGC_COMUNICACAO.CORPO` guarda até 20.000 caracteres (o `slice` do `add-005`/`add-008`); acima disso a nova tentativa sai com o corpo cortado (`ponytail:` no `add-018`; o pedido de hoje fica abaixo de 2.000).

O aviso de pronto e o de falha definitiva vão para `SGC_AVISO` (R-023), que o sino já lê (`notificacoes-avisos.sql`): `PARA_USUARIO_ID = 0` sem persona = responsáveis do card (P-08); `PARA_USUARIO_ID = quem enviou` no de falha (P-03). Tipos `pronto_conclusao` (chave `pronto_conclusao:<card>:<AAAA-MM-DD>`, P-07) e `email_falha` (chave `email_falha:<card>:<id da fila>`).

## Server functions (`add-018-fila-email-conclusao.mjs`)

| Id | Nome | Tipo | O quê |
|---|---|---|---|
| 8750 | `sgcEscEmailFilaInserir` | SQL | entra na fila a comunicação `idComunicacao` com `TENTATIVAS 1` (a do clique) e o erro; só `TIPO IN ('email','cobranca')`, `PARA` com `@`, `ENVIADO_POR` admin/analista/gestor não somente-leitura, e ainda não enfileirada (RN-003) |
| 8751 | `sgcEscEmailFilaReservar` | SQL | `pendente → enviando` com o `LOTE` da rodada, os 20 mais antigos (`ID IN (SELECT ID FROM (… LIMIT 20) X)`: MySQL não aceita `LIMIT` em subconsulta `IN` nem a tabela-alvo sem a derivada; SQLite aceita igual) |
| 8752 | `sgcEscEmailFilaEnviado` | SQL | `enviando → enviado`, `TENTATIVAS + 1`, `ENVIADO_EM` |
| 8753 | `sgcEscEmailFilaFalhou` | SQL | `TENTATIVAS + 1` e `pendente` ou, na 3ª, `falha`; o `STATUS` vem **antes** do `TENTATIVAS` no `SET` e soma `+ 1` por conta própria — o MySQL avalia o `SET` da esquerda para a direita e o SQLite sobre a linha antiga, e assim os dois dão o mesmo |
| 8780 | `sgcEmailFilaProcessar` | JAVASCRIPT, cron `0 */5 * * * *` | 1 consulta conta pendentes e presos; zero → termina (RNF-001, C-008). Senão reserva, envia um a um pelo conteúdo da comunicação com `sendEmailMitra`, marca enviado (com nota "saiu na Nª tentativa") ou falha; depois os presos há 30 min viram falha. Falha definitiva: `kbNotaRegistrar` em nome de quem enviou + `sgcEscAvisoInserir` para ele |
| 8781 | `sgcConclusaoProntosAvisar` | JAVASCRIPT, cron `0 10 11 * * *` (08h10 BRT) | 1 consulta acha os prontos (RN-005) já sem os avisados hoje; um `sgcEscAvisoInserir` por pronto. `hoje` opcional (`AAAA-MM-DD`, validado) para o smoke |

As escritas 8751–8753 não têm guarda de persona, como o `sgcEscAvisoInserir` (R-023): o cron não tem sessão. O pior que um usuário consegue chamando-as direto é gastar tentativas de um e-mail da fila — que então vira aviso de falha para quem enviou. Chamar as duas rotinas direto só antecipa a rodada (o lote é atômico; o aviso é um por dia).

**"Pronto" é a trava de conclusão** (RNF-002): a consulta da 8781 cola as colunas `PENDENCIAS_NF`, `PENDENCIAS_BO_ABERTOS` e `PENDENCIAS_FATURADO` de `backend/sql/pendencias-conclusao-{nf,bo,faturado}.sql` — os mesmos arquivos que o `sgcPodeMover` cola no `contextoDoCard()` —, sem as colunas `_MOTIVO`. O smoke prova a paridade: para cada card do cenário, aviso ⇔ `sgcPodeMover` libera `faturamento>concluido`. `lib/conclusao.ts` é o espelho de tela da mesma trava (R-144) e não muda.

## Envio na hora, fila na falha (P-01) — o que muda no `add-005` e no `add-008`

`sgcEnvioIndustriaRegistrar` (add-005) e `sgcCobrancaEnviar` (add-008) trocam o `await sendEmailMitra(...)` por `try/catch`:

1. Sai → como hoje (C-001; C-027 da 002 e C-025 da 005 continuam verdes).
2. Falha → grava a comunicação (e, no envio, a capa) como antes, chama `sgcEscEmailFilaInserir` com o id da comunicação, confere que a linha da fila existe e devolve `emailNaFila: true`; a nota do histórico diz que o e-mail entrou na fila. Se a fila recusar, lança `O e-mail não saiu e não entrou na fila de nova tentativa: …` (o envio já gravado fica; registrar de novo grava outra comunicação e tenta de novo).
3. `add-005`: sem `IDS.sgcEscEmailFilaInserir` (add-018 nunca publicado), relança o erro do e-mail — o comportamento de hoje.

Tela: `lib/fila-email.ts` (puro) — `textoDoEnvioRegistrado(emailNaFila)` no aviso do `registrar-envio.ts`, `resumoComFila(resumo, emailNaFila)` no contato que o diálogo de cobrança grava (`nf-dialogos.tsx`). Nenhum componente novo.

## Simulador

- `config.mjs`: `add-018-fila-email-conclusao.mjs` no fim do `PUBLISH_ORDER`. Nenhuma leitura SQL (as rotinas leem por `runQueryMitra`), então nada no `CHECK_INPUT`.
- Smoke `smoke/016-fila-email.mjs`, **por último** no `smoke.mjs`: a rotina de pronto vê todo card do banco compartilhado e avisaria pedidos de outras suítes que contam `SGC_AVISO`. As asserções olham só os cards da própria suíte. O e-mail que falha é simulado trocando `ctx.emails.push` por um que lança (o `onEmail` do `base.mjs` chama `emails.push`), sem tocar no `base.mjs`.
- Portas desta sessão: simulador 3110, Vite 5180.

## Ordem no sandbox

`node setup-backend.mjs` (cria `SGC_EMAIL_FILA`) → `node add-018-fila-email-conclusao.mjs` → `node add-005-quadro-compras.mjs` → `node add-008-notas-fiscais.mjs` (as duas JAVASCRIPT injetam o id real da 8750 por nome) → `node add-002-perfil-acesso.mjs` → `node sync-server-function-map.mjs`.

## Complexity Tracking

| Desvio | Por quê |
|---|---|
| Arquivos de outras features tocados (`add-005`, `add-008`, `registrar-envio.ts`, `nf-dialogos.tsx`) | a tarefa é exatamente trocar o envio direto desses dois pontos; a mudança é o `try/catch` e o texto, sem regra nova |

## Riscos

- E-mail duplicado quando a rotina cai depois de enviar e antes de marcar (preso há 30 min volta à fila) — o legado aceitou (RN-EM-19, P-02).
- `sendEmailMitra` que demora e estoura o tempo da SF na tela: o erro chega como falha da SF, sem passar pelo `catch`, e o envio não é registrado — como hoje.
