# Spec: Fila de e-mail com novas tentativas e aviso de pedido pronto para concluir

**ID:** 016-fila-email-e-aviso-conclusao · **Status:** proposta; perguntas P-01..P-09 com a opção recomendada implementada, aguardando aprovação do usuário · **Data:** 2026-11-03 · **Onda:** 5 (lacunas do levantamento legado × SGC 2) · **Origem:** p-60523, `docs/regras-de-negocio/13-fila-email-comunicacoes.md` (RN-EM-01..27, rotina `email_fila_processar`) e `10-nf-automacao-faturamento.md` (B5, RN-NF-34, rotina `sgc_cron_pedidos_prontos_conclusao`)

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

Duas rotinas de fundo do SGC antigo não vieram para o SGC 2.

1. **E-mail que falha se perde.** O pedido à indústria e a cobrança de faturamento saem por
   e-mail na hora do clique. Se o servidor de e-mail recusar ou cair naquele instante, o
   envio do pedido não é registrado, o comprador vê um erro técnico e precisa tentar de novo
   até dar certo — e, enquanto o e-mail não sai, o pedido não avança para "Enviado para
   Indústria". No sistema antigo o e-mail entrava numa fila: o sistema tentava de novo
   sozinho, até três vezes, e, se não conseguisse, deixava o registro da falha no pedido.
2. **Ninguém avisa que o pedido pode ser concluído.** Quando a última nota do pedido entra
   no ERP e não sobra pendência, o pedido continua parado em Faturamento até alguém abrir o
   card e perceber que "pronto para conclusão" apareceu. No sistema antigo, todo dia às
   08h10 uma rotina avisava o comprador de cada pedido nessa situação.

## Resultado esperado

1. **E-mail com nova tentativa automática.** O pedido à indústria e a cobrança continuam
   saindo na hora *(P-01)*. Se o e-mail não sair, o envio é registrado do mesmo jeito, quem
   enviou fica sabendo que o e-mail está na fila, e o sistema tenta de novo a cada 5 minutos,
   até 3 tentativas no total *(P-02)*. Se a terceira falhar, o histórico do pedido registra a
   falha com o motivo e quem enviou recebe um aviso para reenviar *(P-03)*. Um e-mail que sai
   numa nova tentativa também fica no histórico.
2. **Aviso diário de pedido pronto para concluir.** Todo dia às 08h10 *(P-09)* o sistema
   procura os pedidos em Faturamento em Andamento ou em Produtos em B.O. *(P-05)* que já
   passariam na trava de conclusão — 99,5 % do valor coberto, nenhuma conferência de nota sem
   decisão e nenhum item em B.O. em aberto (as regras R-144 e anteriores) — e com ao menos uma
   nota *(P-06)*, e avisa os responsáveis do pedido *(P-08)*, uma vez por dia enquanto ele
   continuar pronto *(P-07)*. O pedido **não** é movido sozinho.

## Usuários

| Persona | O que muda |
|---|---|
| Analista, gestor e admin (quem envia pedido e cobrança) | o envio não trava quando o e-mail falha; recebe o aviso de falha definitiva do e-mail que enviou |
| Responsáveis do pedido (em geral o analista) | recebem "pronto para concluir" no sino de notificações |
| Diretoria, comercial, somente leitura | nada muda |
| Sistema (rotinas de fundo) | tenta de novo os e-mails da fila a cada 5 min; procura pedidos prontos às 08h10 |

## Cenários

### Fila de e-mail

**C-001 — E-mail que sai na hora não passa pela fila**
- **Dado que** o analista registra o envio do pedido por e-mail e o servidor de e-mail aceita
- **Quando** ele confirma
- **Então** o e-mail sai para o contato e para a cópia de compras, o envio é registrado e nada entra na fila (como hoje)

**C-002 — E-mail do pedido que falha entra na fila e o envio é registrado**
- **Dado que** o servidor de e-mail recusa o envio do pedido à indústria
- **Quando** o analista confirma o envio
- **Então** a data, o número do pedido e a comunicação são registrados, o pedido pode seguir para "Enviado para Indústria", o histórico diz que o e-mail não saiu e entrou na fila, e a mensagem na tela diz que o sistema tenta de novo a cada 5 minutos

**C-003 — Cobrança que falha entra na fila**
- **Dado que** o servidor de e-mail recusa a cobrança de faturamento
- **Quando** quem opera a nota envia a cobrança
- **Então** a cobrança fica registrada como comunicação e como contato — o contato diz que o e-mail está na fila de nova tentativa —, e o e-mail entra na fila

**C-004 — A nova tentativa manda o mesmo e-mail registrado**
- **Dado que** há um e-mail na fila e o servidor voltou
- **Quando** a rotina de 5 minutos roda
- **Então** sai o mesmo e-mail (destinatário, cópia de compras, assunto e texto) que ficou registrado no envio, a fila marca "enviado" e o histórico do pedido diz em que tentativa saiu

**C-005 — Três tentativas no total, depois falha definitiva**
- **Dado que** o e-mail falhou no clique (tentativa 1)
- **Quando** a rotina falha nas tentativas 2 e 3
- **Então** depois da 2ª o e-mail continua na fila; depois da 3ª ele para de ser tentado, o histórico do pedido registra "o e-mail … para … não saiu após 3 tentativas. Último erro: …" e quem enviou recebe um aviso com o mesmo texto

**C-006 — Uma rodada não envia o mesmo e-mail duas vezes**
- **Dado que** a rotina reservou um lote de e-mails
- **Quando** outra rodada roda ao mesmo tempo
- **Então** ela não pega os e-mails já reservados; cada rodada pega no máximo 20, do mais antigo para o mais novo

**C-007 — E-mail preso conta como tentativa falha**
- **Dado que** uma rodada parou no meio e um e-mail ficou "enviando" há mais de 30 minutos
- **Quando** a rotina roda de novo
- **Então** esse e-mail conta uma tentativa falha ("Envio interrompido antes da confirmação") e volta para a fila (ou falha de vez, se era a 3ª)

**C-008 — Fila vazia não gasta execução**
- **Dado que** não há e-mail esperando nem preso
- **Quando** a rotina roda
- **Então** ela termina sem chamar nenhuma outra função

**C-009 — Só entra na fila e-mail de verdade, e uma vez**
- **Dado que** alguém tenta pôr na fila uma comunicação de plataforma (sem e-mail), uma comunicação de quem não envia pedido (comercial) ou a mesma comunicação duas vezes
- **Então** nada entra na fila

### Pedido pronto para concluir

**C-010 — Pedido pronto recebe o aviso**
- **Dado que** um pedido em Faturamento em Andamento tem nota vinculada, 100 % faturado, nenhuma conferência sem decisão e nenhum B.O. em aberto
- **Quando** a rotina das 08h10 roda
- **Então** os responsáveis do pedido recebem "Pedido de <fornecedor> (pedido <nº>) pronto para concluir: <N> nota(s), <x> % do valor coberto. Confira e mova o card para Compras Concluídas." e o card não sai do lugar

**C-011 — Pendência impede o aviso**
- **Dado que** o pedido tem uma conferência de nota sem decisão, ou um item em B.O. em aberto, ou menos de 99,5 % do valor coberto
- **Então** não há aviso — a mesma trava que impede de mover o card para Compras Concluídas

**C-012 — 99,5 % conta como 100 %, e B.O. que não vem mais conta como coberto**
- **Dado que** o pedido tem 99,6 % faturado, ou 90 % faturado e o saldo marcado em B.O. como "não vem mais"
- **Então** ele recebe o aviso

**C-013 — Pedido sem nota não recebe aviso** *(P-06)*

**C-014 — Pedido em Produtos em B.O. também** *(P-05)*
- **Dado que** o pedido está em Produtos em B.O., com todos os itens resolvidos e o valor coberto
- **Então** recebe o aviso

**C-015 — Um aviso por dia** *(P-07)*
- **Dado que** o pedido já foi avisado hoje
- **Quando** a rotina roda de novo no mesmo dia
- **Então** não nasce outro aviso; no dia seguinte, se ele continuar pronto, nasce um novo

**C-016 — Fora das fases de conclusão não há aviso**
- **Dado que** o pedido está concluído, cancelado ou em Trânsito, mesmo 100 % faturado
- **Então** não há aviso

## Requisitos funcionais

| Id | Requisito | Aceite |
|---|---|---|
| RF-001 | O e-mail do pedido à indústria e o da cobrança de faturamento que não sair no clique entram numa fila de nova tentativa, e o registro do envio acontece mesmo assim | C-002, C-003 |
| RF-002 | A tela diz quando o e-mail ficou na fila | C-002, C-003 |
| RF-003 | A cada 5 minutos o sistema tenta de novo os e-mails da fila, até 3 tentativas contando a do clique | C-004, C-005 |
| RF-004 | Falha definitiva fica no histórico do pedido e vira aviso para quem enviou | C-005 |
| RF-005 | Rodadas simultâneas não mandam o mesmo e-mail; e-mail preso há 30 min conta como tentativa falha | C-006, C-007 |
| RF-006 | Todo dia às 08h10 os responsáveis de cada pedido pronto para concluir recebem um aviso; o pedido não é movido | C-010..C-016 |

## Requisitos não-funcionais

| Id | Requisito | Aceite |
|---|---|---|
| RNF-001 | A rotina de 5 minutos com a fila vazia não gasta mais que a própria execução (teto de 300 execuções/min da plataforma) | C-008 |
| RNF-002 | "Pronto para concluir" é a mesma regra da trava de conclusão — não existe uma segunda conta | C-011, C-012 |

## Regras de negócio

| Id | Regra |
|---|---|
| RN-001 | Tentativas: 1 no clique + até 2 da rotina; a 3ª falha é definitiva (RN-EM-17 do legado: 3 tentativas). |
| RN-002 | O reenvio manda exatamente o e-mail registrado no envio: o destinatário, a cópia de compras@benenutri.com, o assunto e o texto (RN-EM-03: a fila não aceita e-mail livre). |
| RN-003 | Só entra na fila comunicação por e-mail, com endereço válido, gravada por quem envia pedido (admin, analista, gestor), uma vez por comunicação. |
| RN-004 | Lote de 20 por rodada, do mais antigo; preso há mais de 30 minutos conta como tentativa falha (RN-EM-15, RN-EM-19). |
| RN-005 | Pronto para concluir = fase Faturamento em Andamento ou Produtos em B.O., ≥ 1 nota, nenhuma conferência de nota pendente, nenhum B.O. em aberto e faturado + B.O. que não vem mais ≥ 99,5 % do valor (R-144). |
| RN-006 | Um aviso de pronto por pedido por dia; o aviso não move o card (legado: "o sistema NÃO move o card sozinho"). |

## Perguntas ao usuário (divergências do legado) — opção recomendada implementada

| # | Pergunta | Recomendado (implementado) | Alternativa |
|---|---|---|---|
| P-01 | O e-mail sai na hora ou sempre pela fila? | **Na hora; a fila só entra quando falha.** O comprador não espera 5 min pelo pedido e o envio não trava. | Como o legado: tudo pela fila, "sai em até 5 minutos". |
| P-02 | Quantas tentativas? | **3 no total, contando a do clique** (até ~10 min até a falha definitiva); preso há 30 min conta como falha, com o risco raro de e-mail duplicado que o legado aceitou. | 3 tentativas da rotina além da do clique (4 no total). |
| P-03 | O que acontece na falha definitiva? | **Registro no histórico do pedido e aviso no sino para quem enviou**, com o último erro e "reenvie ao fornecedor". Sem botão de reenvio nesta spec. | Só o histórico (legado), ou um botão "Tentar de novo". |
| P-04 | E os e-mails do próprio quadro (automação de fase, menção no chat, novo responsável, tarefa)? | **Ficam como estão**: são da biblioteca do kanban, que não tem nova tentativa e não se edita daqui. Fica a proposta à biblioteca: guardar o e-mail que falhou e tentar de novo do mesmo jeito. | — |
| P-05 | Em que fases o pedido pode estar pronto? | **Faturamento em Andamento e Produtos em B.O.** — as duas concluem com a mesma trava (R-144). | Só Faturamento, como o legado. |
| P-06 | Precisa ter nota? | **Sim, ao menos uma nota vinculada**, como o legado; pedido coberto só por B.O. que não vem mais é caso de revisar, não de "pronto". | Basta passar na trava. |
| P-07 | Repete? | **Um aviso por pedido por dia, enquanto continuar pronto.** O aviso do SGC 2 não tem "lido"; o legado repetia no dia seguinte depois de lido. | Um aviso só por pedido. |
| P-08 | Quem recebe? | **Os responsáveis do pedido** (o sino já entrega a eles o aviso sem destinatário). | Só quem criou o pedido. |
| P-09 | Horário | **08h10**, como o legado (depois da rotina de faturamento das 08h02). | Outro horário. |

## Testes

| Cenário / regra | Onde |
|---|---|
| C-001..C-009, RN-001..RN-004 | `backend/simulator/smoke/016-fila-email.mjs` (SF real, banco descartável, e-mail simulado que falha) |
| C-010..C-016, RN-005, RN-006, RNF-002 | `backend/simulator/smoke/016-fila-email.mjs` |
| RF-002 (texto da tela) | `frontend/tests/fila-email.test.mjs` |

## Fora de escopo

- Tela da fila de e-mail (listar, filtrar, reenviar); botão "Tentar de novo" (P-03).
- Fila para os e-mails da biblioteca do kanban (P-04) e para a ação "Enviar e-mail" das automações.
- E-mail do pedido de empenho (o e-mail à indústria dos empenhos ficou para a próxima onda da 015).
- Mover o pedido para Compras Concluídas sozinho.
- Saber se o e-mail chegou à caixa do fornecedor: "enviado" é "o servidor aceitou".

## Pendências

- Aprovação das propostas P-01..P-09 pelo usuário.

## Checklist de revisão

- [x] Sem stack, tabela ou componente no texto
- [x] Todo requisito com aceite verificável
- [x] Fora de escopo declarado
- [x] Divergências do legado como perguntas, com a recomendada implementada
