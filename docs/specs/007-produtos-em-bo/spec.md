# Spec: Produtos em B.O. — itens indisponíveis, previsão de liberação e impacto no cliente

**ID:** 007-produtos-em-bo · **Status:** rascunho · **Data:** 2026-09-15

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

Uma parte do pedido quase sempre não vem. A indústria fatura 80 % e o resto fica em
"B.O." — produto em falta, com previsão de liberação que muda toda semana. Hoje esse
saldo vive na cabeça da compradora e num e-mail solto: ninguém sabe, olhando o sistema,
quais produtos estão faltando em todos os pedidos abertos, há quantos dias, para quando
o fornecedor prometeu, e — o que mais dói — **quantos clientes compraram aquele produto
nos últimos meses** e vão ficar sem.

O custo aparece em três lugares: o comercial descobre a falta pelo cliente reclamando,
não pelo sistema; a compradora perde o dia da previsão prometida porque nada a lembra; e
o pedido é dado por concluído com itens que nunca chegaram, apagando o rastro de quem
deveria cobrar. A carta de falta, que é o documento que o comercial usa para justificar
ao cliente, fica em pasta de rede.

## Resultado esperado

O que faltou no pedido fica marcado item a item, com a quantidade pendente, a previsão
que a indústria deu e quantos clientes compraram aquele produto nos últimos 60 dias.
Enquanto a previsão não se cumpre, o sistema cobra sozinho, todo dia. Qualquer pessoa da
empresa — inclusive o comercial — abre uma tela só e vê tudo que está em falta, de todos
os pedidos, ordenado por quem está sem previsão e por quem está mais atrasado. E nenhum
pedido é concluído deixando item em aberto para trás.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| analista (comprador) | marcar o que faltou, registrar a previsão que a indústria deu, anexar a carta de falta, liberar o item quando chegar | diária |
| gestor (gerência de compras) | o mesmo do analista, e acompanhar no painel o que está sem previsão ou vencido | diária |
| comercial | consultar o painel para saber o que está em falta e quantos clientes são afetados, antes de prometer prazo | diária |
| diretoria | ver o painel e a situação de cada pedido, sem operar | semanal |
| admin (TI) | tudo | eventual |

O **nível de acesso** que a plataforma dá a cada pessoa continua valendo além do perfil:
quem tem acesso somente-leitura consulta tudo e não altera nada; quem tem acesso restrito
só opera os pedidos que criou. O comercial é a novidade: esta é a **primeira tela do
sistema que ele enxerga** — o painel, e só ele.

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa.

**C-001 — Marcar o que faltou**
- **Dado que** um pedido do fornecedor 1042 para a filial 1 está em Faturamento em Andamento com 4 itens enviados
- **Quando** o gestor marca 2 deles como em B.O. — 40 unidades pendentes de um e 15 do outro, com observação
- **Então** os 2 passam a constar como em B.O. com a quantidade pendente, a observação e a fotografia de quantos clientes compraram cada produto nos últimos 60 dias; os outros 2 itens seguem como estavam; e o pedido pode ser movido para Produtos em B.O.

**C-002 — Clientes impactados nos últimos 60 dias**
- **Dado que** o produto A foi vendido 7 vezes nos últimos 30 dias para 4 clientes diferentes (um deles comprou 3 vezes), 70 unidades no total, e vendido uma oitava vez para um 5º cliente há 61 dias; e que houve também uma **entrada** desse produto no período
- **Quando** o produto é marcado em B.O.
- **Então** o sistema registra **4 clientes impactados** e **70 unidades vendidas** — a venda de 61 dias atrás e a entrada não entram

**C-003 — Não se entra em B.O. sem item marcado**
- **Dado que** um pedido está em Faturamento em Andamento e nenhum item foi marcado
- **Quando** alguém tenta movê-lo para Produtos em B.O.
- **Então** o movimento é recusado com "Marque ao menos um item em B.O. antes de mover o pedido para Produtos em B.O."; depois de marcar um item, o mesmo movimento é aceito

**C-004 — Registrar a previsão de liberação**
- **Dado que** um pedido está em Produtos em B.O. e a indústria informou 05/10/2026
- **Quando** a analista registra essa previsão com a observação "confirmado pelo representante"
- **Então** 05/10/2026 passa a ser a previsão vigente do pedido, aparece no painel, e a anterior continua visível no histórico com quem registrou e quando

**C-005 — Previsão nova reinicia a cobrança**
- **Dado que** a previsão venceu, o sistema já avisou hoje e o pedido continua em B.O.
- **Quando** a analista registra uma previsão nova para daqui a 7 dias
- **Então** a cobrança recomeça do zero: nenhum aviso sai enquanto a data nova não chegar

**C-006 — Carta de falta**
- **Dado que** a indústria enviou a carta de falta do pedido
- **Quando** a analista anexa o arquivo escolhendo o tipo "Carta de falta"
- **Então** o documento passa a constar no pedido com o nome do arquivo, quem enviou e quando, e pode ser aberto por qualquer pessoa que veja o pedido; um tipo que não seja "Carta de falta" é registrado como "Outro"

**C-007 — Liberar o item que chegou**
- **Dado que** um pedido em B.O. tem 2 itens em aberto
- **Quando** a analista libera um deles
- **Então** esse item volta à situação de enviado na lista do pedido, sai da contagem de abertos (que passa a 1) e o registro guarda quem liberou e quando; a previsão e o histórico permanecem

**C-008 — Não se conclui com item em aberto**
- **Dado que** um pedido tem 2 itens de B.O. em aberto
- **Quando** alguém tenta concluí-lo, seja a partir de Faturamento em Andamento, seja a partir de Produtos em B.O.
- **Então** o movimento é recusado com "Resolva os 2 itens em B.O. antes de concluir o pedido."; um pedido cujos itens foram todos liberados é concluído normalmente

**C-009 — Voltar para Faturamento não exige nada**
- **Dado que** um pedido em B.O. ainda tem 2 itens em aberto
- **Quando** a compradora o move de volta para Faturamento em Andamento (a indústria voltou a faturar)
- **Então** o movimento é aceito: a exigência de zero item em aberto vale só para concluir

**C-010 — O sistema cobra sozinho, uma vez por dia**
- **Dado que** um pedido está em B.O. com 2 itens em aberto e previsão vencida há 2 dias
- **Quando** a verificação diária roda
- **Então** os responsáveis do pedido recebem **um** aviso citando a previsão e os 2 itens em aberto, o pedido ganha uma linha no histórico, e uma segunda verificação no mesmo dia **não** gera um segundo aviso

**C-011 — A cobrança não incomoda quem está em dia**
- **Dado que** existem um pedido em B.O. com previsão para daqui a 10 dias, um pedido em B.O. sem previsão nenhuma e um pedido em Faturamento com previsão vencida
- **Quando** a verificação diária roda
- **Então** nenhum dos três é avisado

**C-012 — O painel consolidado**
- **Dado que** existem 3 produtos em B.O. em aberto, 2 num pedido com previsão vencida e 1 num pedido sem previsão
- **Quando** alguém abre o painel de produtos em B.O.
- **Então** vê as 3 linhas — produto, pedido, fornecedor, filial, quantidade pendente, clientes impactados, previsão e situação —, o total 3, e o produto **sem previsão aparece primeiro**; filtrando por previsão vencida sobram 2

**C-013 — O comercial enxerga o painel, e só ele**
- **Dado que** Leo é do comercial
- **Quando** ele entra no sistema
- **Então** o menu dele tem exatamente **um** item, o painel de produtos em B.O., e o painel mostra as mesmas 3 linhas que o gestor vê

**C-014 — A diretoria vê e não opera**
- **Dado que** Dora é da diretoria e abre um pedido em B.O.
- **Quando** ela olha os itens, as previsões e os documentos
- **Então** vê tudo, e os controles de marcar, liberar, registrar previsão e anexar aparecem **desabilitados com o motivo**, nunca escondidos

**C-015 — A regra de perfil vale fora da tela**
- **Dado que** a marcação de itens é acionada por fora da tela
- **Quando** quem aciona é do comercial, é da diretoria, ou tem acesso somente-leitura
- **Então** nada é gravado e a resposta diz que o perfil não opera o B.O.; acionada pelo gestor, grava

**C-016 — Marcar o mesmo produto duas vezes não duplica**
- **Dado que** um produto já está marcado em B.O. com 40 unidades pendentes
- **Quando** a compradora corrige para 25 unidades
- **Então** continua havendo **um** registro desse produto no pedido, agora com 25

**C-017 — Só se marca B.O. de um pedido que chegou lá**
- **Dado que** um pedido está em Análise/Montagem
- **Quando** alguém tenta marcar itens dele em B.O.
- **Então** a marcação é recusada informando que o pedido não está em Faturamento nem em Produtos em B.O., e nada é gravado

**C-018 — A fase B.O. abre com as datas e o que está pendente** *(R-141)*
- **Dado que** o pedido tem 2 itens em aberto, a previsão da indústria era 30/10 e hoje é 03/11, sem carta de falta
- **Quando** o comprador abre o card
- **Então** vê o aviso "Previsão de liberação vencida há 4 dias", as datas da fase (envio, previsão, carta de falta "Pendente"), os itens em cartões e o total pendente dos itens em aberto; no Concluído sem item em B.O., o bloco não aparece

**C-019 — "Não vem mais" encerra o saldo em B.O.** *(R-144, P-6; P-2 do levantamento: o B.O. continua sendo fase do próprio pedido)*
- **Dado que** a indústria avisou que um item em B.O. não será entregue
- **Quando** o comprador clica "Não vem mais" e confirma
- **Então** o item sai do aberto como "Não vem mais", deixa de travar a conclusão como B.O. em aberto e o valor dele conta como coberto na trava de 99,5 % da 005 (RN-016); "Liberar" continua sendo o caminho de quando o produto volta

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE permitir marcar itens do pedido como em B.O., com quantidade pendente e observação | C-001; um produto aparece no máximo uma vez por pedido (C-016) | must |
| RF-002 | A quantidade pendente DEVE ser maior que zero e não maior que a quantidade pedida do item | 40 de um item de 100 é aceito; 0 e 120 são recusados citando o produto | must |
| RF-003 | Ao marcar, o sistema DEVE guardar quantos clientes distintos compraram o produto e quanto foi vendido nos últimos 60 dias | Os números de C-002 (4 clientes, 70 unidades) | must |
| RF-004 | A marcação DEVE ser possível apenas com o pedido em Faturamento em Andamento ou em Produtos em B.O. | C-017 | must |
| RF-005 | O pedido não DEVE entrar em Produtos em B.O. sem ao menos um item em B.O. em aberto | C-003, com a frase exata da recusa | must |
| RF-006 | O sistema DEVE registrar previsões de liberação com data e observação, guardando o histórico e quem registrou | C-004 | must |
| RF-007 | A previsão registrada por último DEVE ser a previsão vigente do pedido e DEVE reiniciar a cobrança automática | C-005 | must |
| RF-008 | O sistema DEVE avisar os responsáveis do pedido **uma vez por dia** enquanto o pedido estiver em Produtos em B.O. e a previsão vigente já tiver chegado | C-010; duas verificações no mesmo dia = 1 aviso | must |
| RF-009 | Cada aviso automático DEVE deixar também uma linha no histórico do pedido | C-010 | must |
| RF-010 | Pedido sem previsão, com previsão futura ou fora da fase de B.O. não DEVE ser avisado | C-011 | must |
| RF-011 | O sistema DEVE permitir anexar a carta de falta e outros documentos ao pedido, com nome, autor e data | C-006 | must |
| RF-012 | O sistema DEVE permitir liberar um item de B.O., devolvendo-o à situação de enviado e registrando quem liberou e quando | C-007 | must |
| RF-013 | O pedido não DEVE ser concluído, nem a partir de Faturamento nem a partir de B.O., com item de B.O. em aberto | C-008, com a frase exata e a contagem | must |
| RF-014 | Voltar de Produtos em B.O. para Faturamento em Andamento não DEVE ter exigência | C-009 | must |
| RF-015 | O sistema DEVE oferecer um painel com **uma linha por produto em B.O.** de todos os pedidos, com pedido, fornecedor, filial, quantidade pendente, clientes impactados, previsão e situação | C-012 | must |
| RF-016 | O painel DEVE ordenar quem não tem previsão primeiro e, depois, da previsão mais antiga para a mais recente | C-012 | must |
| RF-017 | O painel DEVE ter busca por produto, pedido ou fornecedor, filtro por situação da previsão e por situação do item, total e paginação | C-012 | must |
| RF-018 | O painel DEVE ser visível a **todas** as personas, inclusive o comercial, que passa a ter esse único item de menu | C-013 | must |
| RF-019 | Marcar, liberar, registrar previsão e anexar documento DEVE ser permitido a admin, analista e gestor; diretoria e comercial só consultam | C-014, C-015 | must |
| RF-020 | As exigências de perfil DEVEM ser verificadas no servidor, não só na tela | C-015 | must |
| RF-021 | Nenhuma exigência de B.O. DEVE se aplicar ao cancelamento do pedido | pedido com 2 itens em aberto é cancelado normalmente | must |
| RF-022 | O painel DEVE indicar a situação da previsão de cada linha: sem previsão, vencida, vence hoje ou no prazo | C-012 | should |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Abrir a área de B.O. de um pedido custa **uma** chamada ao servidor, qualquer que seja o número de itens, previsões e documentos | Contador de chamadas com 1, 10 e 60 itens: sempre 1 |
| RNF-002 | Marcar ou liberar N itens custa **uma** chamada da tela e no máximo 4 operações no servidor, qualquer que seja N | Contador com 1, 5 e 50 itens marcados de uma vez |
| RNF-003 | A consulta de clientes impactados é **uma** consulta ao ERP por marcação, nunca uma por produto | Marcar 50 itens: 1 consulta (fatiada só acima de 500 produtos) |
| RNF-004 | A verificação diária processa no máximo 30 pedidos por rodada, não consulta o ERP e a falha em um pedido não impede os outros | 3 pedidos vencidos, o do meio com defeito: 2 avisados, 1 erro relatado |
| RNF-005 | O painel responde em até 2 s com 500 produtos em B.O., paginado | Cronômetro sobre a carga de teste |
| RNF-006 | Nenhuma operação sobre o ERP escreve | Revisão das consultas; nenhuma altera dado do ERP |

## Entidades do domínio

- **Item em B.O.** — um produto de um pedido que a indústria não entregou, com a quantidade que ficou pendente, uma observação e a situação (em aberto, liberado ou cancelado). Pertence a um pedido e a um produto; um produto aparece no máximo uma vez por pedido. Carrega a **fotografia de impacto** tirada no momento da marcação: quantos clientes compraram e quanto se vendeu nos últimos 60 dias.
- **Previsão de liberação** — a data que a indústria prometeu para o pedido, com observação, quem registrou e quando. O pedido guarda o histórico; a última registrada é a vigente.
- **Documento do B.O.** — arquivo anexado ao pedido, do tipo carta de falta ou outro, com nome, autor e data.
- **Aviso de previsão** — a cobrança automática que sai uma vez por dia para os responsáveis do pedido enquanto a previsão vigente estiver vencida e o pedido continuar em B.O.
- **Painel de produtos em B.O.** — a leitura consolidada, produto a produto, de tudo que está faltando em todos os pedidos abertos do sistema.

## Regras de negócio

- **RN-001 — Item em B.O.** O produto entra com quantidade pendente maior que zero e menor ou igual à quantidade pedida daquele item no pedido; a observação é opcional. Marcar de novo o mesmo produto do mesmo pedido **atualiza** o registro existente, não cria outro.
- **RN-002 — Fotografia de impacto.** Na marcação o sistema grava, por produto: o número de **clientes distintos** que o compraram e a **quantidade vendida** nos últimos 60 dias corridos, contando apenas saídas com quantidade positiva. É fotografia: não se recalcula depois, porque é ela que explica a decisão tomada naquele dia.
- **RN-003 — Entrada em B.O.** O pedido entra em Produtos em B.O. **somente** vindo de Faturamento em Andamento e **somente** com ao menos um item em B.O. em aberto.
- **RN-004 — Previsão vigente.** A previsão registrada por último é a vigente. Registrá-la zera a cobrança: a contagem recomeça a partir da data nova.
- **RN-005 — Situação da previsão.** Sem previsão quando não há data; **vencida** quando a data é anterior a hoje; **vence hoje** quando é hoje; **no prazo** quando é futura.
- **RN-006 — Cobrança diária.** Enquanto o pedido estiver em Produtos em B.O. e a previsão vigente for de hoje ou anterior, sai **um** aviso por dia para os responsáveis do pedido, com a previsão e a contagem de itens em aberto, e uma linha no histórico do pedido. Pedido sem previsão nunca é avisado. Nenhum e-mail sai para o fornecedor.
- **RN-007 — Liberação.** Item liberado volta à situação **enviado** na lista de itens do pedido, deixa de contar como aberto e guarda quem liberou e quando. Liberar não move o pedido: quem move é a pessoa.
- **RN-008 — Conclusão.** O pedido não é concluído com item de B.O. em aberto, venha o movimento de Faturamento em Andamento ou de Produtos em B.O. A recusa diz quantos itens faltam. Voltar de B.O. para Faturamento não tem exigência.
- **RN-009 — Quem opera.** Marcar, liberar, registrar previsão e anexar documento é de admin, analista e gestor. Diretoria e comercial consultam. Acesso somente-leitura não opera; acesso restrito opera apenas os pedidos que a própria pessoa criou. A regra vale na tela e no servidor.
- **RN-010 — Painel.** Uma linha por produto em B.O., de todos os pedidos, sem recorte por quem está olhando. Ordem: primeiro os pedidos **sem previsão**, depois por previsão crescente (a mais antiga antes), e dentro do mesmo pedido por descrição do produto.
- **RN-011 — Documentos.** O arquivo é enviado para um endereço público e o pedido guarda o nome, o endereço, o tipo (carta de falta ou outro), quem enviou e quando. Tipo diferente de "carta de falta" é registrado como "outro".
- **RN-012 — Cancelamento.** Nenhuma exigência de B.O. se aplica ao cancelamento do pedido, em qualquer fase.
- **RN-013 — Não vem mais (R-144).** Item em B.O. encerrado como `cancelado` ("não vem mais") não é esperado: não trava a conclusão (RN-008) e o seu valor (quantidade pendente × custo do item) entra na cobertura da RN-016 da 005. O `sgcBoMarcar` já aceitava `cancelado`; a tela ganhou o botão, com confirmação.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | marcar 2 dos 4 itens de um pedido em Faturamento devolve `marcados: 2`; a releitura traz 2 itens em aberto com quantidade 40 e 15, e a lista de itens do pedido mostra 2 em B.O. e 2 ainda enviados | regra de negócio |
| C-002 | a consulta de impacto dos produtos A e B devolve 2 linhas (contagem > 0): A com 4 clientes e 70 unidades, B com 2 clientes e 10 unidades | regra de negócio |
| C-003 | com zero item marcado, a verificação do movimento Faturamento → B.O. devolve "não pode" e a mensagem exata "Marque ao menos um item em B.O. antes de mover o pedido para Produtos em B.O."; com 1 item marcado, devolve "pode" e motivo vazio | regra de negócio |
| C-004 | registrar a previsão 2026-10-05 com observação deixa o histórico com 2 linhas (a anterior e a nova) e a previsão vigente do pedido em 2026-10-05 | regra de negócio |
| C-005 | com a cobrança já marcada para hoje, registrar previsão para hoje+7 apaga a marcação; a verificação diária seguinte não avisa esse pedido | regra de negócio |
| C-006 | anexar um documento tipo "carta de falta" devolve 1 linha na releitura com nome, endereço, autor e data; tipo "planilha" é gravado como "outro" | regra de negócio |
| C-007 | liberar 1 de 2 itens deixa 1 em aberto e 1 liberado com quem e quando; o item correspondente do pedido volta a "enviado" e o outro continua em "bo" | regra de negócio |
| C-008 | com 2 itens em aberto, Faturamento → Concluídas e B.O. → Concluídas devolvem "não pode" com "Resolva os 2 itens em B.O. antes de concluir o pedido."; no pedido sem item em aberto, os dois devolvem "pode" | regra de negócio |
| C-009 | com 2 itens em aberto, B.O. → Faturamento devolve "pode" e motivo vazio | regra de negócio |
| C-010 | a verificação diária devolve `avisados: 1`; há 1 aviso do tipo previsão de B.O. para o pedido, endereçado aos responsáveis, com a data da previsão e "2 itens" no texto; o pedido fica marcado como avisado hoje e ganha 1 linha de histórico; a segunda chamada devolve `avisados: 0` e a contagem de avisos continua 1 | regra de negócio |
| C-011 | na mesma rodada, o pedido com previsão futura, o sem previsão e o que está em Faturamento não recebem aviso: a contagem de avisos deles é 0 | regra de negócio |
| C-012 | entre os pedidos deste cenário, o painel devolve as 3 linhas em aberto e a do pedido sem previsão vem antes das outras; filtrando por "vencida" sobram 2; sem filtro de situação do item são 4 (3 em aberto e 1 liberado); o total declarado bate com o que existe em B.O. no momento do teste |  regra de negócio |
| C-013 | o painel chamado pelo usuário do comercial devolve exatamente as mesmas linhas que devolve para o gestor; o menu do comercial devolve exatamente 1 item, o do painel de B.O. | regra de negócio + regra de tela |
| C-014 | a matriz de permissões da diretoria devolve "vê o B.O." verdadeiro e "opera o B.O." falso; a do gestor devolve os dois verdadeiros; a de quem tem acesso somente-leitura devolve "vê" verdadeiro e "opera" falso | regra de tela |
| C-015 | marcar itens como comercial e como diretoria devolve recusa citando o perfil e deixa zero item gravado; como gestor grava; com acesso somente-leitura, recusa | regra de negócio |
| C-016 | marcar o mesmo produto com 25 depois de 40 deixa 1 registro com quantidade 25 | regra de negócio |
| C-017 | marcar itens de um pedido na fase de Análise devolve recusa citando a fase e deixa zero item gravado | regra de negócio |
| RN-001 | quantidade 0 e quantidade 120 num item de 100 pedidos são recusadas citando o produto; 40 é aceita | regra de tela |
| RN-002 | a consulta de impacto ignora a venda de 61 dias atrás e a entrada do período: A fica em 4 clientes e 70 unidades | regra de negócio |
| RN-003 | coberto por C-003 (marcado) e pela ausência do par Enviado → B.O. na tabela de transições | regra de negócio |
| RN-004 | registrar duas previsões seguidas deixa a segunda como vigente e o histórico com as duas, na ordem do registro | regra de negócio |
| RN-005 | previsão vazia → "sem previsão"; ontem → "vencida"; hoje → "vence hoje"; amanhã → "no prazo" | regra de tela |
| RN-006 | texto do aviso montado com previsão 2026-10-05 e 2 itens contém a data e "2 itens"; pedido sem previsão não gera texto | regra de tela + regra de negócio |
| RN-007 | coberto por C-007 | regra de negócio |
| RN-008 | a frase da recusa para 1 item é "Resolva o 1 item em B.O. antes de concluir o pedido." e para 3 é "Resolva os 3 itens em B.O. antes de concluir o pedido." | regra de negócio |
| RN-009 | coberto por C-014 (tela) e C-015 (servidor); e marcar num pedido de outra pessoa com acesso restrito é recusado | regra de negócio |
| RN-010 | coberto por C-012 (ordem e ausência de recorte por persona) | regra de negócio |
| RN-011 | coberto por C-006 | regra de negócio |
| RN-012 | pedido em B.O. com 2 itens em aberto: a verificação do movimento para Canceladas devolve "pode" | regra de negócio |
| C-018 | `bo.test.mjs`: total pendente só dos abertos, a carta de falta mais recente e o aviso de previsão vencida com a conta de dias certa entre meses | regra de tela |
| C-019 / RN-013 | smoke `005-notas-fiscais.mjs` (C-033): o saldo em B.O. cancelado cobre a trava e o liberado não | regra de negócio |

- O que só olho humano verifica fica em **Verificação manual**:
  - [ ] C-012 — o painel nos dois temas, com a situação da previsão sinalizada por ponto **e** texto, e a coluna de clientes impactados alinhada à direita
  - [ ] C-013 — o comercial entra e vê um menu com um item só, sem link morto para o quadro
  - [ ] C-014 — os controles desabilitados mostram o motivo ao passar o mouse, e nenhum some da tela
  - [ ] C-006 — o aviso de endereço público aparece **antes** de escolher o arquivo

## Fora de escopo

- [ ] **Pedido separado para o B.O.** — o B.O. é uma fase do próprio pedido; nada de um segundo pedido "filho" como no sistema anterior.
- [ ] **Entrada automática em B.O.** a partir da recusa de validade na conferência de nota fiscal — a marcação é sempre uma decisão de quem compra.
- [ ] **Recalcular a fotografia de clientes impactados** depois da marcação — ela é a foto do dia da decisão.
- [ ] **Cancelar um item de B.O. pela tela** — a situação existe no dado para um futuro "não vem mais", mas a tela desta onda só libera.
- [ ] **Excluir documento anexado** — anexa e lista; remover fica para quando houver pedido.
- [ ] **E-mail ao fornecedor** cobrando a liberação — nenhum e-mail automático sai para a indústria.
- [ ] **Substituição de produto, remanejamento entre filiais e reserva para o cliente impactado** — a lista de clientes afetados é informação, não ação.
- [ ] **Indicadores de B.O.** (tempo médio de liberação, ranking de fornecedor) — onda 3.
- [ ] **Nota fiscal, faturamento, cobrança, trânsito e recebimento** — specs irmãs da mesma onda.

## Pendências

Cada item aqui **bloqueia** o `plan.md`.

- Nenhuma.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-003, C-008, C-015, C-017)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto
