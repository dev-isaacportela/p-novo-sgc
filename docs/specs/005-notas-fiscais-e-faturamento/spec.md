# Spec: Notas fiscais e faturamento — detecção, conferência e cobrança

**ID:** 005-notas-fiscais-e-faturamento · **Status:** rascunho · **Data:** 2026-09-15

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

Depois que o pedido sai para a indústria, o sistema perde o pedido de vista. A nota fiscal
que a indústria emite só entra no SGC se alguém digitar número, série, data, valor e depois
item a item com quantidade, preço, lote e validade — trabalho que ninguém faz por inteiro, e
que quando é feito chega tarde. O resultado é que a compradora só descobre que o preço veio
1,5 % acima do negociado, que o lote vence em oitenta dias ou que o prazo de pagamento não é o
combinado quando a mercadoria já está no armazém e a duplicata já está lançada.

O acompanhamento do atraso tem o mesmo defeito: conta dias corridos desde o envio, não guarda
histórico de quem ligou para a indústria e quando, e dispara e-mail automático ao fornecedor —
que a área de compras não quer. Um pedido de R$ 120 mil pode passar duas semanas sem uma linha
de nota fiscal sem que ninguém seja avisado.

O custo é dinheiro: diferença de preço aceita por omissão, produto com validade curta que vira
perda, prazo de pagamento pior do que o negociado e ruptura de venda porque a indústria não
faturou e ninguém cobrou.

## Resultado esperado

O pedido enviado passa a se acompanhar sozinho: o sistema encontra a nota fiscal da indústria,
propõe o vínculo com o pedido certo, e — depois que uma pessoa confirma — compara a nota com o
pedido item a item e entrega uma lista de conferências para aceitar ou recusar. O cartão do
pedido mostra quanto já foi faturado e quanto falta; quem precisa cobrar a indústria vê, numa
tela só, todos os pedidos parados, há quantos dias úteis e quando foi o último contato.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| analista (comprador) | validar a nota sugerida, registrar nota pelo número, decidir as conferências, registrar contato com a indústria, enviar cobrança | diária |
| gestor (gerência de compras) | o mesmo do analista, e acompanhar a lista consolidada dos pedidos parados há 3 e há 5 dias úteis | diária |
| diretoria | ver o percentual faturado e o saldo pendente da carteira, sem operar | semanal |
| admin (TI) | tudo, e acompanhar a rotina automática de detecção | eventual |

O **nível de acesso** da plataforma continua valendo além do perfil: quem tem acesso somente
leitura vê as notas, as conferências e os painéis e não decide nada; quem tem acesso restrito
só opera os pedidos que criou. O perfil **comercial** não aparece na tabela de propósito: ele
não vê nota fiscal nem faturamento.

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa.

**C-001 — A nota é encontrada pelo número do pedido**
- **Dado que** o pedido do fornecedor 1015 para a filial 1 foi enviado em 08/09/2026 com o número de pedido 998901 registrado, e a indústria emitiu a nota 7001 contra esse número
- **Quando** a rotina automática de detecção roda
- **Então** aparece uma sugestão de vínculo da nota 7001 com esse pedido, com pontuação **100** e a origem "pelo número do pedido", e **nada** é vinculado sem uma pessoa confirmar

**C-002 — Sem número de pedido, a nota é encontrada pelos itens**
- **Dado que** um pedido enviado não tem número de pedido registrado, e existe uma nota do mesmo fornecedor e filial, emitida depois do envio, em que 4 dos 5 produtos do pedido aparecem
- **Quando** a detecção roda
- **Então** aparece uma sugestão com origem "por semelhança" e pontuação **88** (48 pela cobertura de 4 em 5, 20 pela emissão dentro de 45 dias do envio, 20 porque o valor cabe no saldo a faturar), e o motivo mostrado diz "4 de 5 itens do pedido estão na NF"

**C-003 — Nota já vinculada não é sugerida de novo**
- **Dado que** a nota 7004 já está vinculada a outro pedido
- **Quando** a detecção roda
- **Então** essa nota não vira sugestão para nenhum pedido, e tentar vinculá-la à mão é recusado com a mensagem de que ela já pertence a outro pedido

**C-004 — Nota cancelada no ERP é ignorada**
- **Dado que** a nota 7003 do fornecedor está cancelada no ERP
- **Quando** a detecção roda
- **Então** ela não aparece como sugestão, nem entra em nenhum cálculo de faturamento

**C-005 — Nenhuma nota encontrada**
- **Dado que** um pedido enviado não tem nenhuma nota candidata
- **Quando** a compradora abre a aba de notas fiscais do pedido
- **Então** ela lê "Nenhuma nota fiscal encontrada" e continua podendo registrar a nota informando o número

**C-006 — Registro pelo número, antes de a nota dar entrada**
- **Dado que** a indústria faturou a nota 7005, que ainda não deu entrada no armazém
- **Quando** a compradora digita o número 7005 no pedido do fornecedor 1015
- **Então** o sistema devolve série, data de emissão, valor total e os itens (quantidade, preço, lote e validade) já preenchidos, e o registro é aceito mesmo sem entrada confirmada

**C-007 — Validar a sugestão grava a nota, os itens e as conferências**
- **Dado que** existe a sugestão do C-001 para uma nota com 3 itens
- **Quando** a compradora clica em "Validar"
- **Então** a nota passa a constar no pedido com os 3 itens (lote e validade incluídos), são criadas **as conferências de todos os itens e as 3 conferências de pedido** (prazo de pagamento, valor total e percentual faturado), todas com decisão pendente, e o histórico do pedido ganha a linha do vínculo

**C-008 — O item casa por código de fábrica ou por código de barras**
- **Dado que** a nota traz um produto cujo código não existe no pedido, mas cujo código de fábrica é o de um item do pedido
- **Quando** a nota é conferida
- **Então** o item é casado por código de fábrica e a conferência do item fica em **atenção**, dizendo por qual código ele casou; o mesmo vale para o código de barras, nessa ordem de tentativa

**C-009 — Item faturado que não foi pedido**
- **Dado que** a nota traz um produto que não está no pedido por nenhum dos três códigos
- **Quando** a nota é conferida
- **Então** é registrada uma conferência **divergente** dizendo que o item faturado não consta no pedido, com a quantidade faturada

**C-010 — Preço com tolerância de 1 %**
- **Dado que** o pedido tem três itens a R$ 10,0000, R$ 20,0000 e R$ 30,0000 e a nota os faturou a R$ 10,0000, R$ 20,1600 (0,8 %) e R$ 30,4500 (1,5 %)
- **Quando** a nota é conferida
- **Então** o primeiro fica **conforme**, o segundo em **atenção** e o terceiro **divergente**, cada um com o valor esperado, o encontrado e a diferença percentual

**C-011 — Validade mínima contada da emissão**
- **Dado que** a nota foi emitida em 11/09/2026 e traz um lote com validade 01/02/2027 (143 dias) e outro com 01/12/2026 (81 dias)
- **Quando** a nota é conferida para um fornecedor cuja validade mínima cadastrada é de **90 dias**
- **Então** o primeiro lote fica **conforme** e o segundo **divergente**
- **E quando** a mesma dupla de lotes é conferida para um fornecedor cuja validade mínima cadastrada é de **180 dias**, os dois ficam **divergentes**
- **E** o padrão de **120 dias** só é usado quando o fornecedor não tem validade mínima cadastrada

**C-012 — Quantidade maior é divergência, menor é faturamento parcial**
- **Dado que** um item foi pedido em 100 unidades e a nota faturou 120, e outro foi pedido em 100 e a nota faturou 60
- **Quando** a nota é conferida
- **Então** o primeiro fica **divergente** ("quantidade faturada acima da pedida") e o segundo **conforme** ("faturamento parcial, saldo de 40")

**C-013 — Prazo de pagamento da nota contra o acordado**
- **Dado que** o pedido foi fechado com prazo "28/35/42" e as duplicatas da nota vencem em 28, 35 e 42 dias da emissão
- **Quando** a nota é conferida
- **Então** a conferência de prazo fica **conforme**; com duplicatas de 30 e 60 dias, fica **divergente** mostrando "28/35/42" contra "30/60"

**C-014 — Valor total e percentual faturado**
- **Dado que** o pedido vale R$ 120.000,00 em 2.000 unidades e a nota vinculada traz R$ 72.000,00 em 1.200 unidades
- **Quando** a nota é conferida
- **Então** a conferência de valor total fica **conforme** (o faturado não passou do pedido) e a de percentual registra **60 % em valor e 60 % em quantidade**

**C-015 — Aceitar todos os conformes num clique**
- **Dado que** a nota gerou 12 conferências, sendo 9 conformes, 2 em atenção e 1 divergente
- **Quando** a compradora clica em "Aceitar todos os conformes"
- **Então** as 9 conformes passam a aceitas numa única operação, e as 3 restantes continuam pendentes, cada uma com decisão individual

**C-016 — Recusar exige justificativa; divergência não impede o vínculo**
- **Dado que** existe uma conferência divergente de preço
- **Quando** a compradora recusa sem escrever nada
- **Então** a recusa é negada pedindo uma justificativa de pelo menos 10 caracteres; com a justificativa, a recusa é gravada com autor e data — e a nota continua vinculada ao pedido nos dois casos

**C-017 — Entrar em Trânsito exige ao menos uma nota**
- **Dado que** um pedido está em "Enviado para Indústria" sem nenhuma nota vinculada
- **Quando** alguém tenta mover o pedido para "Em Trânsito para BN"
- **Então** o movimento é recusado com "Vincule ao menos uma nota fiscal ao pedido antes de mover para Em Trânsito para BN.", e passa a ser aceito assim que uma nota é vinculada

**C-018 — Concluir exige toda conferência decidida**
- **Dado que** um pedido em "Faturamento em Andamento" tem 3 conferências sem decisão
- **Quando** alguém tenta concluir o pedido
- **Então** o movimento é recusado citando as 3 conferências pendentes; decididas as três, a conclusão é aceita — e o mesmo vale saindo de "Produtos em B.O."

**C-019 — O cartão do pedido mostra o faturamento**
- **Dado que** o pedido de R$ 120.000,00 recebeu a nota de R$ 72.000,00 em 11/09/2026
- **Quando** alguém olha o cartão do pedido no quadro
- **Então** lê `R$ 72.000,00 (60 %) · saldo R$ 48.000,00`, e a data do primeiro faturamento aparece no pedido

**C-020 — 100 % em valor encerra o acompanhamento**
- **Dado que** um pedido estava marcado como faturamento pendente há 6 dias úteis e recebe notas que somam 100 % do valor
- **Quando** a rotina diária roda
- **Então** a etiqueta de faturamento pendente sai do cartão, nenhum aviso novo é gerado para esse pedido e ele some da lista de faturamentos pendentes

**C-021 — Três dias úteis sem faturamento avisam o comprador**
- **Dado que** um pedido foi enviado há 3 dias úteis e não tem nenhuma nota
- **Quando** a rotina diária roda
- **Então** os responsáveis pelo pedido recebem um aviso citando o fornecedor e os 3 dias úteis, o cartão ganha a etiqueta "Faturamento pendente" e o histórico do pedido registra o aviso

**C-022 — Cinco dias úteis avisam também a gerência**
- **Dado que** um pedido está há 5 dias úteis sem faturamento
- **Quando** a rotina diária roda
- **Então** além do aviso ao comprador é gerado um aviso para a gerência, e o pedido aparece na lista consolidada do gestor

**C-023 — Acima de cinco dias o aviso é diário, uma vez por dia**
- **Dado que** um pedido está há 8 dias úteis sem faturamento e já foi avisado hoje
- **Quando** a rotina diária roda de novo no mesmo dia
- **Então** nenhum aviso novo é criado para ele naquele dia; no dia seguinte, um novo aviso é criado

**C-024 — Registrar contato com a indústria**
- **Dado que** a compradora ligou para o fornecedor e ele prometeu faturar em 20/09/2026
- **Quando** ela registra o contato informando canal, resumo e previsão
- **Então** o contato entra no histórico do pedido com data, canal, autor e resumo, os contatos anteriores continuam lá, e a lista de faturamentos pendentes passa a mostrar a data do último contato

**C-025 — Cobrança por e-mail é manual, nunca automática**
- **Dado que** um pedido está há 5 dias úteis sem faturamento
- **Quando** a compradora escolhe um contato do fornecedor e envia a cobrança
- **Então** o e-mail sai para esse contato com cópia para compras@benenutri.com, fica registrado como comunicação do pedido e vira um contato no histórico — e **nenhum** e-mail é enviado ao fornecedor sem esse clique

**C-026 — A lista de faturamentos pendentes**
- **Dado que** 9 pedidos estão sem faturamento completo: 2 sem nenhum contato (1 e 2 dias úteis), 4 com 3 ou 4 dias úteis, 1 com 5, 1 com 9 e 1 em produtos em B.O. com 7
- **Quando** o gestor abre a lista
- **Então** os 9 aparecem, o filtro "sem contato" devolve os 2, o de "3 dias úteis" devolve os 4, o de "5" devolve 1 e o de "+5" devolve 2 (o de 9 e o que está em B.O.), a busca por fornecedor recorta a lista e a exportação devolve as mesmas linhas mostradas

**C-027 — Quem pode o quê**
- **Dado que** o comercial, a diretoria e um usuário somente leitura abrem o sistema
- **Quando** procuram notas fiscais e faturamentos
- **Então** o comercial não vê nenhum dos dois; a diretoria vê tudo com os botões de validar, decidir, registrar contato e cobrar desabilitados; o somente leitura idem; e um usuário de acesso restrito só opera os pedidos que criou

**C-028 — Pedido em B.O. não recebe dois alertas por dia**
- **Dado que** um pedido está na etapa "Produtos em B.O." há 7 dias úteis sem faturamento completo, e o B.O. tem o seu próprio aviso diário
- **Quando** a rotina diária de faturamento roda
- **Então** nenhum aviso de faturamento é criado para ele — mas ele **continua** na lista de faturamentos pendentes, mostrando a previsão de liberação registrada no B.O. e quantos itens ainda estão em aberto

### O card no Faturamento e no Concluído (R-150)

**C-029 — Saldo por item que a indústria ainda não faturou**
- **Dado que** o pedido 8372 tem 28 produtos e a nota 1954868 faturou menos do que o pedido em 4 deles
- **Quando** o comprador abre o card em Faturamento
- **Então** "Itens pendentes de faturamento", recolhido, diz "4 produtos com saldo"; aberto, cada um traz pedida, faturada, pendente e a barra do %

**C-030 — O que falta para concluir, com a mesma trava do servidor**
- **Dado que** o pedido tem conferências sem decisão, item em B.O. em aberto e saldo a faturar
- **Quando** o comprador abre o card em Faturamento ou em Produtos em B.O.
- **Então** vê "Pendências para concluir o pedido" com as conferências e o B.O. marcados como trava e o saldo como aviso; sem conferência pendente e sem B.O. em aberto, "Pedido pronto para conclusão" (o saldo não trava — P-6 do levantamento)

**C-031 — O pedido concluído lista o que chegou**
- **Dado que** o pedido 8401 foi concluído com 4 notas
- **Quando** alguém abre o card em Compras Concluídas
- **Então** vê valor faturado, itens faturados e recusados, e cada item com a nota, lote, validade, quantidade × preço, subtotal e a decisão das conferências daquele item naquela nota

**C-032 — Selos de validade 90/120 do legado** *(R-152, P-5)*
- **Dado que** a nota tem um lote que vence em 85 dias, um em 110 e um em 300
- **Quando** o comprador abre o card
- **Então** cada item mostra o selo "Validade crítica" (abaixo de 90 dias), "Validade em atenção" (até 120) ou "Validade conforme", com os dias até vencer, e o resumo de faturamento conta quantos itens há em cada selo; a conferência de validade contra o mínimo do fornecedor (RN-005) continua igual

**C-033 — Só conclui com 99,5 % do valor coberto** *(R-153, P-6)*
- **Dado que** o pedido de R$ 120.000,00 tem R$ 72.000,00 faturados, nenhuma conferência pendente e nenhum item em B.O. em aberto
- **Quando** alguém tenta mover para Compras Concluídas, de Faturamento ou de Produtos em B.O.
- **Então** o servidor recusa com "Falta faturar R$ 48.000,00 (60,0 % coberto; o mínimo para concluir é 99,5 %). Registre a nota complementar ou marque o saldo em B.O. como \"não vem mais\"."; com 99,5 % libera; e o saldo marcado em B.O. como "não vem mais" conta como coberto

**C-034 — Notificar gestor a partir de 5 dias úteis** *(R-155, P-3)*
- **Dado que** o pedido está há 9 dias úteis sem faturamento completo
- **Quando** a Ana abre o card em Trânsito, clica "Notificar gestor" e escolhe o Gil
- **Então** o Gil recebe o aviso nas notificações, entra nos responsáveis do card e o histórico registra quem notificou; de novo no mesmo dia não duplica; abaixo de 5 dias úteis, com 100 % faturado, para quem não é gestor ou por quem não opera a nota, nada é gravado

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE varrer automaticamente as notas fiscais de entrada do ERP a cada 30 minutos e propor o vínculo com os pedidos enviados | Rodada com 5 pedidos monitorados devolve as sugestões sem vincular nada (C-001, C-002) | must |
| RF-002 | A sugestão DEVE casar pelo número do pedido quando ele existe e, na falta dele, pelos itens do pedido presentes na nota, com pontuação e motivo visíveis | Pontuação 100 na origem por pedido; 88 no caso de C-002 | must |
| RF-003 | Nota já vinculada a qualquer pedido, ou cancelada no ERP, NÃO DEVE ser sugerida nem vinculada | C-003, C-004 | must |
| RF-004 | Nenhum vínculo DEVE ser efetivado sem confirmação de uma pessoa | Nenhuma nota aparece vinculada sem clique (C-001) | must |
| RF-005 | O sistema DEVE permitir registrar a nota pelo número, buscando o resto no ERP mesmo antes da entrada, e manter o preenchimento manual quando a nota não existir lá | C-005, C-006 | must |
| RF-006 | Ao vincular, o sistema DEVE gravar a nota, os seus itens (com lote e validade) e uma conferência por comparação, **inclusive quando o resultado é conforme** | 3 itens geram as conferências de item mais as 3 de pedido (C-007) | must |
| RF-007 | O item da nota DEVE ser casado com o item do pedido por código do produto, depois código de fábrica, depois código de barras | C-008 | must |
| RF-008 | Preço e valor total DEVEM ser classificados por diferença percentual: zero conforme, até 1 % atenção, acima de 1 % divergente | C-010, C-014 | must |
| RF-009 | Item não pedido, quantidade maior que a pedida, validade curta e prazo divergente DEVEM ser classificados só como conforme ou divergente, sem escala | C-009, C-011, C-012, C-013 | must |
| RF-010 | A validade DEVE ser medida da emissão da nota, com mínimo de 120 dias ou o mínimo do fornecedor quando houver | C-011 | must |
| RF-011 | O sistema DEVE oferecer "Aceitar todos os conformes" em uma operação, sem impedir a decisão individual | 9 de 12 aceitas num clique (C-015) | must |
| RF-012 | Recusar uma conferência DEVE exigir justificativa de pelo menos 10 caracteres, e gravar autor e data da decisão | C-016 | must |
| RF-013 | Divergência NÃO DEVE bloquear o vínculo da nota | C-016 | must |
| RF-014 | Entrar em "Em Trânsito para BN" DEVE exigir ao menos uma nota vinculada, verificado no servidor | C-017 | must |
| RF-015 | Concluir o pedido, vindo de Faturamento ou de B.O., DEVE exigir zero conferência de nota sem decisão, verificado no servidor | C-018 | must |
| RF-016 | O pedido DEVE guardar a data do primeiro faturamento, o valor faturado e o percentual faturado em valor e em quantidade | C-014, C-019 | must |
| RF-017 | O cartão do pedido no quadro DEVE mostrar o faturado, o percentual e o saldo, sem custo por cartão | C-019 | must |
| RF-018 | O atraso de faturamento DEVE ser contado em dias úteis (segunda a sexta, sem feriados) desde a data de envio à indústria | 24/08/2026 mais 15 dias úteis é 14/09/2026 (RN-001) | must |
| RF-019 | Aos 3 dias úteis o sistema DEVE avisar os responsáveis pelo pedido e marcar o cartão; aos 5, avisar também a gerência; acima de 5, repetir uma vez por dia. Pedido na etapa de produtos em B.O. NÃO DEVE receber esse aviso | C-021, C-022, C-023, C-028 | must |
| RF-020 | Os avisos DEVEM parar quando o pedido atingir 100 % do valor faturado | C-020 | must |
| RF-021 | Cada aviso automático DEVE aparecer no histórico do pedido e no feed de notificações de quem ele endereça | C-021 | must |
| RF-022 | O sistema DEVE registrar contatos com a indústria (data, canal, autor, resumo e previsão), preservando todos os anteriores | C-024 | must |
| RF-023 | A cobrança por e-mail DEVE ser manual, com cópia fixa para compras@benenutri.com, e ficar registrada como comunicação do pedido | C-025 | must |
| RF-024 | O sistema DEVE ter uma lista de sugestões de nota (pedido, fornecedor, etapa, nota, pontuação, situação, validar/ver/recusar) com busca por número | C-001, C-005 | must |
| RF-025 | O sistema DEVE ter uma lista de faturamentos pendentes com total, filtros por 0 contato / 3 / 5 / +5 dias úteis, busca e exportação | C-026 | must |
| RF-026 | Notas, conferências, contatos e cobrança DEVEM ser operados por admin, analista e gestor; a diretoria vê e não opera; o comercial não vê | C-027 | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Abrir a aba de notas fiscais de um pedido custa **uma** consulta ao servidor, qualquer que seja o número de notas, itens, conferências e contatos | Contador de chamadas ao abrir a aba de um pedido com 3 notas e 40 conferências: 1 |
| RNF-002 | A rotina de detecção trata no máximo 30 pedidos por rodada e faz **uma** consulta ao ERP por fornecedor e filial, não por pedido | 30 pedidos de 4 fornecedores em uma rodada = 4 consultas ao ERP |
| RNF-003 | A rotina diária de cobrança trata no máximo 30 pedidos por rodada e não consulta o ERP | Contador de consultas ao ERP na rodada: 0 |
| RNF-004 | Nenhuma operação sobre o ERP escreve: notas, itens, parcelas e busca por número são leitura | Revisão das consultas |
| RNF-005 | As duas listas são paginadas com total, e respondem em até 2 s com 2 mil pedidos | Cronômetro sobre a lista de faturamentos pendentes |
| RNF-006 | Um erro de consulta ao ERP em um fornecedor não derruba a rodada dos outros | Rodada com um fornecedor inexistente devolve as sugestões dos demais e o erro na lista de erros |

## Entidades do domínio

- **Nota fiscal do pedido** — a nota que a indústria emitiu contra o pedido, com número, série, chave, emissão, entrada, valor e a forma como entrou no sistema (automática, pelo número ou manual). Pertence a um pedido; um pedido tem várias notas, uma nota pertence a um pedido só.
- **Item da nota** — um produto faturado: quantidade, preço, lote, validade e por qual código ele casou com o item do pedido.
- **Conferência** — o resultado de uma comparação entre a nota e o pedido: o que se esperava, o que veio, a diferença, e a decisão de uma pessoa (pendente, aceita ou recusada, com justificativa). Toda comparação vira conferência, inclusive a conforme.
- **Sugestão de vínculo** — a proposta de que uma nota do ERP pertence a um pedido, com origem, pontuação, motivo e situação (sugerida, validada, recusada).
- **Contato de faturamento** — o registro de uma tentativa de cobrar a indústria: data, canal, autor, resumo e a previsão que ela deu.
- **Aviso de processo** — a mensagem que uma rotina automática endereça a alguém (aos responsáveis pelo pedido, a uma pessoa ou a uma persona), com um texto e uma identidade que impede repetir o mesmo aviso no mesmo dia.

## Regras de negócio

- **RN-001 — Dias úteis.** Dia útil é de segunda a sexta; feriado não conta. A contagem de atraso é em dias úteis a partir da data de envio à indústria, sem contar o próprio dia do envio. Conferência de referência: 24/08/2026 (segunda) mais 15 dias úteis é **14/09/2026**.
- **RN-002 — Pontuação da sugestão.** Nota casada pelo número do pedido vale **100**. Nas demais: `pontos = arredondar(cobertura × 60) + 20 se a emissão estiver entre 0 e 45 dias depois do envio + 20 se o valor dos itens do pedido dentro da nota couber no saldo a faturar com folga de 1 %`, onde `cobertura` é a fração dos produtos do pedido presentes na nota. O resultado é limitado entre 5 e 95. Nota sem nenhum produto do pedido não vira sugestão.
- **RN-003 — Casamento do item.** Primeiro pelo código do produto; não achando, pelo código de fábrica; não achando, pelo código de barras. Casamento por código de fábrica ou de barras é **atenção**, nunca conforme. Sem casamento, o item é "não pedido".
- **RN-004 — Classificação por diferença.** `diferença = |encontrado − esperado| ÷ |esperado|`. Zero é **conforme**, até 1 % é **atenção**, acima de 1 % é **divergente**. Esperado zero com encontrado diferente de zero é divergente. A escala vale só para preço unitário e valor total; as demais comparações são conforme ou divergente.
- **RN-005 — Validade.** Dias de validade = validade do lote menos emissão da nota. Abaixo de **120 dias** é divergente; o mínimo do fornecedor, quando cadastrado e maior que zero, substitui os 120. Nota sem data de validade no item fica em atenção.
- **RN-006 — Quantidade.** Quantidade faturada acumulada maior que a pedida é divergente; menor é conforme, com o saldo no texto; igual é conforme.
- **RN-007 — Prazo de pagamento.** O prazo da nota são os dias entre a emissão e o vencimento de cada duplicata; não havendo duplicatas, o prazo declarado na própria nota. É comparado com o prazo acordado no pedido pelas mesmas regras de parcelas já usadas na montagem: mesmas parcelas na mesma ordem é conforme, qualquer outra coisa é divergente; um dos lados sem número é atenção.
- **RN-008 — Percentual faturado.** Em valor: soma das notas vinculadas ÷ valor do pedido. Em quantidade: soma das quantidades faturadas dos itens casados ÷ soma das quantidades pedidas. **100 % em valor** encerra o acompanhamento de faturamento pendente.
- **RN-009 — Escalonamento.** A partir de 3 dias úteis sem 100 % de faturamento o pedido é marcado e os responsáveis avisados; a partir de 5, a gerência também; acima de 5, o aviso se repete **uma vez por dia**. O mesmo aviso não é criado duas vezes no mesmo dia para o mesmo pedido. **Pedido na etapa de produtos em B.O. fica de fora do aviso de faturamento** — o B.O. tem o seu próprio aviso diário, e dois avisos por dia sobre o mesmo pedido foi defeito corrigido no sistema anterior. Ele continua na lista de faturamentos pendentes, com a previsão de liberação e a contagem de itens em aberto.
- **RN-010 — Confirmação humana.** Nenhuma nota é vinculada por rotina automática. Nota já vinculada a qualquer pedido não é sugerida nem aceita em outro.
- **RN-011 — Divergência e conclusão.** Divergência não bloqueia o vínculo. Conferência sem decisão bloqueia a conclusão do pedido, venha ele de Faturamento ou de B.O.
- **RN-012 — Entrada em Trânsito.** O pedido só entra em "Em Trânsito para BN" com ao menos uma nota vinculada.
- **RN-013 — Linha do faturamento no cartão.** Sem nota vinculada e com menos de 3 dias úteis de atraso, o cartão não mostra linha de faturamento. Com nota: `R$ <faturado> (<percentual> %) · saldo R$ <saldo>`. Sem nota e com 3 dias úteis ou mais: `Faturamento pendente · <n> dias úteis`.
- **RN-014 — Cobrança.** O sistema nunca envia e-mail ao fornecedor por conta própria. A cobrança é um clique, sai com cópia para compras@benenutri.com e vira comunicação e contato do pedido.
- **RN-015 — Nota cancelada.** Nota cancelada no ERP não é sugerida, não é vinculada e não conta no faturamento.
- **RN-016 — Conclusão coberta (R-153, P-6).** Faturamento → Concluídas e B.O. → Concluídas exigem `(faturado nas notas + saldo em B.O. cancelado × custo do item) ≥ 99,5 % do valor do pedido` (RN-NF-34 do legado: 99,5 % conta como 100 %). A trava é do servidor (`pendencias-conclusao-faturado.sql` no `sgcPodeMover`), depois das de conferência e de B.O. em aberto, e a recusa diz quanto falta em reais e o % coberto. Pedido de valor zero não trava aqui. B.O. liberado não cobre: volta a esperar nota.
- **RN-017 — Notificar gestor (R-155, P-3).** A partir do nível 5 (5 dias úteis desde o envio, contados como na RN-001) e abaixo de 100 % faturado, nas fases Enviado, Trânsito e Faturamento, quem opera a nota (admin, analista, gestor) grava um aviso para UM usuário com a persona gestor, no máximo um por gestor por pedido por dia (`sgcEscGestorNotificar`, guarda `:VAR_USER`). A tela põe o gestor nos responsáveis do card. A escalada automática do cron (RF-019/RF-020) continua igual.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | a rodada de detecção sobre o pedido com número 998901 cria 1 sugestão da nota 7001 com pontuação 100 e origem "pedido"; nenhuma nota aparece vinculada | regra de negócio |
| C-002 | pedido sem número, nota com 4 de 5 produtos, emissão 3 dias depois do envio, valor dentro do saldo → 1 sugestão com pontuação 88 e origem "heuristica" | regra de negócio + regra de tela |
| C-003 | com a nota 7004 já vinculada a outro pedido, a rodada não cria sugestão dela; o vínculo manual devolve "não pode" citando o outro pedido | regra de negócio |
| C-004 | a nota 7003 (cancelada) não aparece entre as candidatas do ERP nem entre as sugestões | regra de negócio |
| C-005 | pedido sem candidata devolve 0 sugestões e a busca por número 7005 devolve 1 linha | regra de negócio |
| C-006 | a busca pelo número 7005 devolve série, emissão, valor e 2 itens, com a nota ainda sem data de entrada | regra de negócio |
| C-007 | validar a sugestão grava 1 nota, 3 itens e 15 conferências (4 por item + 3 de pedido), todas com decisão pendente, e 1 linha no histórico do pedido | regra de negócio |
| C-008 | item da nota com código 9001 e código de fábrica "FK-123" casa com o item do pedido 5001 e a conferência do item fica em atenção citando "código de fábrica"; o mesmo por código de barras | regra de tela + regra de negócio |
| C-009 | item da nota sem casamento nenhum gera 1 conferência divergente do tipo "item não pedido" | regra de negócio |
| C-010 | 10,0000 × 10,0000 → conforme, diferença 0; 20,0000 × 20,1600 → atenção, diferença 0,8 %; 30,0000 × 30,4500 → divergente, diferença 1,5 % | regra de tela + regra de negócio |
| C-011 | emissão 11/09/2026 → 143 dias com validade 01/02/2027 e 81 dias com 01/12/2026; com o mínimo do fornecedor em 90 dias, conforme e divergente; com o mínimo em 180, os dois divergentes; o padrão de 120 é exercitado só na regra pura, sem fornecedor cadastrado | regra de tela + regra de negócio |
| C-012 | pedida 100 e faturada 120 → divergente; pedida 100 e faturada 60 → conforme com "saldo de 40" no texto | regra de tela |
| C-013 | acordado "28/35/42" com duplicatas 28/35/42 → conforme; com 30/60 → divergente mostrando os dois lados | regra de tela + regra de negócio |
| C-014 | pedido de 120.000,00 e 2.000 unidades com nota de 72.000,00 e 1.200 unidades → 60 % em valor, 60 % em quantidade, saldo 48.000,00 e conferência de valor total conforme | regra de tela + regra de negócio |
| C-015 | 12 conferências (9 conformes) → "aceitar conformes" deixa 9 aceitas e 3 pendentes numa operação | regra de negócio |
| C-016 | recusa com 9 caracteres é negada; com 10 grava decisão, autor e data; a nota continua vinculada nos dois casos | regra de negócio |
| C-017 | pedido em "enviado" sem nota → a regra de movimento devolve "não pode" com o texto de Trânsito; com 1 nota vinculada, libera | regra de negócio |
| C-018 | pedido em "faturamento" com 3 conferências pendentes → conclusão recusada citando 3; decididas, libera; o mesmo saindo de "bo" | regra de negócio |
| C-019 | pedido de 120.000,00 com nota de 72.000,00 → texto do cartão `R$ 72.000,00 (60 %) · saldo R$ 48.000,00` e data do primeiro faturamento 11/09/2026 | regra de tela + regra de negócio |
| C-020 | pedido com 100 % em valor → a rodada diária não cria aviso, zera o nível e o pedido sai da lista de pendentes | regra de negócio |
| C-021 | pedido enviado há 3 dias úteis → 1 aviso para os responsáveis com "3 dias úteis" e o fornecedor no texto, nível 3 gravado e 1 nota no histórico | regra de negócio |
| C-022 | pedido há 5 dias úteis → 2 avisos (responsáveis e gerência), nível 5 gravado | regra de negócio |
| C-023 | rodar a rotina duas vezes no mesmo dia sobre o pedido de 8 dias úteis cria 1 aviso, não 2; com a data do dia seguinte, cria o segundo | regra de negócio |
| C-024 | registrar 2 contatos no mesmo pedido devolve os 2 na leitura, em ordem decrescente de data, e a lista de pendentes mostra a data do último | regra de negócio |
| C-025 | enviar cobrança dispara 1 e-mail com o contato do fornecedor e compras@benenutri.com nos destinatários, grava 1 comunicação do tipo cobrança e 1 contato; a rotina diária não dispara e-mail nenhum | regra de negócio |
| C-026 | os 9 pedidos deste cenário aparecem na listagem; entre eles, "sem contato" devolve 2, "3" devolve 4, "5" devolve 1 e "+5" devolve 2; busca por "Fresenius" recorta; a exportação usa as mesmas linhas da listagem. A contagem é sempre **sobre os pedidos deste cenário**, nunca um total absoluto do sistema | regra de negócio + regra de tela |
| C-027 | vincular como comercial e como somente leitura devolve "não pode"; como diretoria, idem para operar; a matriz de permissões devolve as chaves certas por persona | regra de negócio + regra de tela |
| C-028 | pedido em B.O. com 7 dias úteis sem faturamento → a rodada diária não cria aviso nenhum para ele; a lista de faturamentos pendentes continua trazendo esse pedido, com a previsão de liberação e a contagem de itens em aberto | regra de negócio |
| RN-001 | 24/08/2026 + 15 dias úteis = 14/09/2026; entre 24/08 e 14/09 há 15 dias úteis; sexta para segunda = 1; segunda para sábado = 4; mesmo dia = 0 | regra de tela + regra de negócio |
| RN-002 | cobertura 4/5, emissão +3 dias, valor dentro do saldo → 88; cobertura 1/5, emissão +60 dias, valor acima → 12; cobertura 0 → sem sugestão; casamento por número do pedido → 100 | regra de tela |
| RN-003 | casa por código; sem código, por código de fábrica; sem os dois, por código de barras; sem nenhum, "não pedido" | regra de tela |
| RN-004 | (10, 10) → conforme 0; (10, 10,05) → atenção 0,5 %; (10, 11) → divergente 10 %; (0, 5) → divergente; (0, 0) → conforme | regra de tela |
| RN-005 | (emissão 11/09/2026, validade 01/02/2027, mínimo 120) → conforme; mínimo 180 → divergente; validade vazia → atenção | regra de tela |
| RN-006 | (100, 120) → divergente; (100, 60) → conforme com saldo 40; (100, 100) → conforme | regra de tela |
| RN-007 | duplicatas 28/35/42 contra "28/35/42" → conforme; 30/60 contra "28/35/42" → divergente; sem duplicata e sem prazo na nota → atenção | regra de tela |
| RN-008 | 72.000 de 120.000 → 60 %; 1.200 de 2.000 → 60 %; pedido de valor zero → 0 % sem divisão por zero; 120.000 de 120.000 → 100 % e acompanhamento encerrado | regra de tela + regra de negócio |
| RN-009 | 2 dias úteis → nenhum aviso; 3 → nível 3; 5 → nível 5; 8 com aviso de hoje → nenhum aviso novo; pedido em B.O. com 7 dias úteis → nenhum aviso | regra de tela + regra de negócio |
| RN-010 | a rodada de detecção não vincula nada: a contagem de notas do pedido continua zero depois dela | regra de negócio |
| RN-011 | com conferência divergente e decidida, concluir libera; com qualquer conferência pendente, recusa | regra de negócio |
| RN-012 | zero notas → recusa de Trânsito; uma nota → libera | regra de negócio |
| RN-013 | sem nota e 2 dias úteis → texto vazio; com nota → `R$ 72.000,00 (60 %) · saldo R$ 48.000,00`; sem nota e 4 dias úteis → `Faturamento pendente · 4 dias úteis` | regra de tela |
| RN-014 | a rotina diária de cobrança não envia nenhum e-mail; a cobrança manual envia 1, com a cópia fixa | regra de negócio |
| RN-015 | nota com cancelamento no ERP não aparece nas candidatas nem no valor faturado | regra de negócio |
| C-029 | `conclusao.test.mjs`: saldo soma todas as notas, ignora quantidade zero, não fica negativo e ordena pelo maior pendente | regra de tela |
| C-030 | `conclusao.test.mjs`: conferência pendente e B.O. em aberto travam; saldo só avisa; sem nada, pronto | regra de tela |
| C-031 | `conclusao.test.mjs`: item faturado com nota, subtotal, lote e decisão (recusa vence pendente, pendente vence aceito) | regra de tela |
| C-032 | `nf.test.mjs`: selo por dias até vencer (89 crítica, 90 e 120 atenção, 121 conforme, vencido crítico, sem data nada) e a contagem do resumo | regra de tela |
| C-033 / RN-016 | smoke `005-notas-fiscais.mjs`: 60 % recusa com a frase exata dos dois lados (Faturamento e B.O.), 99,4 % recusa, 99,5 % libera, B.O. cancelado cobre e liberado não; `conclusao.test.mjs` com a MESMA frase | regra de negócio e de tela |
| C-034 / RN-017 | smoke `005-notas-fiscais.mjs`: 1 aviso para o gil, sem duplicar no dia, no feed dele; alvo não gestor, comercial, diretoria, < 5 dias e 100 % não gravam; `acompanhamento.test.mjs` com o limiar, a lista de gestores e os responsáveis | regra de negócio e de tela |

- O que só olho humano verifica fica em **Verificação manual**:
  - [ ] C-007 — a aba de notas fiscais com 3 notas e 40 conferências, agrupadas por item, legível nos dois temas
  - [ ] C-015 — o botão "Aceitar todos os conformes" e as decisões individuais lado a lado, sem ambiguidade
  - [ ] C-019 — a linha de faturamento e a etiqueta no cartão do quadro, nos dois temas
  - [ ] C-026 — a lista de faturamentos pendentes com os quatro filtros e a exportação, nos dois temas
  - [ ] C-027 — os botões desabilitados (nunca escondidos) para a diretoria e para o acesso somente leitura

## Fora de escopo

- [ ] **Previsão de recebimento, atraso de nota e sincronização de entrada** — é a spec 006; aqui a nota é registrada e conferida, não acompanhada até o armazém.
- [ ] **Produtos em B.O.** — é a spec 007.
- [ ] **Nota apenas emitida (manifesto do destinatário)** — o sistema só enxerga a nota que existe no ERP; o caminho para a nota em trânsito é o registro pelo número.
- [ ] **Prorrogação de título e negociação financeira** — o registro continua no ERP.
- [ ] **Escrita no ERP** — tudo que esta feature faz sobre o ERP é leitura.
- [ ] **E-mail automático ao fornecedor** — decisão de negócio, não limitação.
- [ ] **Feriados na contagem de dias úteis** — segunda a sexta, sem calendário de feriados.
- [ ] **Conferência de nota de devolução, bonificação ou remessa** — só nota de entrada de compra.
- [ ] **Migração das notas do sistema anterior** — o sistema começa vazio.

## Pendências

Cada item aqui **bloqueia** o `plan.md`.

- Nenhuma.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-003, C-004, C-005, C-016, C-017, C-018, C-027)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto
