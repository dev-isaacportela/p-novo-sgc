# Spec: Solicitações do comercial — registro, avaliação, vínculo ao pedido e rastreio

**ID:** 008-solicitacoes-do-comercial · **Status:** rascunho · **Data:** 2026-09-15

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

Quando um cliente pede um produto que a Benenutri não tem em estoque, o vendedor avisa
compras por WhatsApp, e-mail ou no corredor. O pedido some: quem recebeu esquece, quem não
recebeu nunca soube, e duas semanas depois o vendedor pergunta "e aquele produto?" sem que
exista um lugar onde a resposta esteja escrita. Quando a demanda chega formalmente, ela
chega de novo — o mesmo produto solicitado por três vendedores vira três conversas.

Do outro lado, a compradora monta o pedido do fornecedor olhando só venda, estoque e
trânsito. A demanda que o comercial acabou de prometer a um cliente não aparece em lugar
nenhum da montagem: ou ela lembra, ou o produto fica de fora do pedido que estava sendo
fechado naquele minuto — e a próxima janela daquele fornecedor é dali a um mês.

E não há aprendizado. Nada diz, depois, se o cliente que motivou a compra de fato comprou.
O comprador leva a fama de ter trazido o que encalhou; o vendedor leva a fama de pedir o
que não vende. Sem o número, a discussão se repete todo trimestre com as duas partes
convencidas de que estão certas.

## Resultado esperado

O vendedor registra a demanda do cliente em um formulário curto e acompanha o que
aconteceu com ela até o produto chegar. A compradora vê, dentro do pedido que está
montando, as solicitações pendentes daquele mesmo fornecedor e filial, e inclui a que
quiser com um clique — a quantidade solicitada vira item do pedido. E, meses depois,
qualquer um consegue ler numa tela só se o cliente que motivou a compra comprou, e se o
que foi trazido está parado na prateleira.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| comercial (vendedor) | registrar a demanda do cliente, acompanhar a situação de atendimento das suas solicitações, cancelar a que não vale mais | diária |
| analista (comprador) | avaliar a fila, recusar com motivo o que não entra, incluir no pedido em montagem o que entra | diária |
| gestor (gerência de compras) | o mesmo do analista, e olhar o rastreio pós-aprovação para saber o que virou venda e o que encalhou | semanal |
| diretoria | ler a fila, a situação de atendimento e o rastreio, sem operar | mensal |
| admin (TI) | tudo | eventual |

O **nível de acesso** da plataforma continua valendo além do perfil: quem tem acesso
somente leitura vê tudo e não opera nada; um comprador com acesso restrito só inclui
solicitação nos pedidos que ele mesmo criou. O comercial vê **apenas as solicitações que
ele registrou** — é o único recorte por autoria em uma listagem do sistema, e existe porque
a carteira de um vendedor não é assunto do outro.

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa.

**C-001 — Registrar uma solicitação com cliente**
- **Dado que** o vendedor Leo tem um cliente (código 9201) pedindo o produto 5301 "BEBIDA LACTEA ZERO LACTOSE 200 ML", do fornecedor Nestlé
- **Quando** ele registra a solicitação com quantidade 24, filial 1, prioridade alta e a justificativa "Cliente 9201 pediu 24 unidades para o mês; estamos sem estoque desde a semana passada."
- **Então** a solicitação nasce **pendente**, com ele como vendedor, com a data e a hora do registro, com o fornecedor **Nestlé copiado do próprio produto** (ele não escolhe fornecedor) e com o cliente gravado por **código e nome**; o histórico dela ganha a linha "criada"

**C-002 — Registrar sem cliente**
- **Dado que** o vendedor quer antecipar um giro que enxerga na região, sem um cliente específico por trás
- **Quando** ele registra a solicitação deixando o cliente em branco
- **Então** a solicitação é aceita e passa a constar como **"sem cliente informado"** em toda tela — nunca como "cliente não comprou"

**C-003 — Registro incompleto é recusado sem perder o que foi digitado**
- **Dado que** o vendedor preencheu produto e cliente mas deixou a quantidade em zero e a justificativa com 5 caracteres
- **Quando** ele tenta gravar
- **Então** o registro é recusado apontando os dois campos (quantidade maior que zero, justificativa de pelo menos 10 caracteres), **nada é gravado** e o formulário continua com tudo que ele digitou

**C-004 — Aprovar põe na fila, não vincula a pedido nenhum**
- **Dado que** existe uma solicitação pendente do produto 5303 para a filial 1
- **Quando** a compradora aprova pela tela de solicitações
- **Então** a solicitação fica **aprovada e sem pedido**, esperando a próxima montagem daquele fornecedor; **nenhum** pedido é criado, nenhum item é criado, e o histórico ganha a linha "aprovada" com autor e data

**C-005 — Recusar exige motivo**
- **Dado que** uma solicitação pendente pede um produto que a última compra já cobriu
- **Quando** a compradora recusa sem escrever nada, ou com menos de 10 caracteres
- **Então** a recusa é negada pedindo o motivo; com o motivo "Produto já coberto pelo pedido 998877, chega em 12 dias.", a recusa é gravada com autor, data e o motivo visível ao vendedor

**C-006 — Cancelar a própria solicitação pendente**
- **Dado que** o vendedor registrou uma solicitação e o cliente desistiu
- **Quando** ele cancela
- **Então** a solicitação fica **cancelada** e sai da fila de avaliação; **cancelar a solicitação de outro vendedor é recusado**, e **cancelar uma já aprovada, recusada ou cancelada também é recusado** — depois de avaliada, quem desfaz é compras

**C-007 — O pedido em montagem mostra as solicitações daquele fornecedor e filial**
- **Dado que** há um pedido em Análise/Montagem do fornecedor Nestlé para a filial 1, e na fila existem 3 solicitações ativas desse mesmo fornecedor e filial — uma urgente (5303, aprovada e sem pedido), uma alta (5301, pendente) e uma normal (5302, pendente)
- **Quando** a compradora abre o pedido
- **Então** ela lê as 3, **nessa ordem de prioridade**, cada uma com produto, quantidade, cliente (código e nome), prioridade, vendedor e justificativa — e esse bloco aparece **só** enquanto o pedido está na montagem

**C-008 — "Incluir no pedido" cria o item e vincula**
- **Dado que** a solicitação pendente do produto 5301 com quantidade 24 aparece no pedido em montagem
- **Quando** a compradora clica em "Incluir no pedido"
- **Então** o pedido ganha o item 5301 com **quantidade pedida 24** (que ela ajusta como qualquer outro item), a solicitação passa a **aprovada e vinculada àquele pedido**, some do bloco, o histórico dela ganha "aprovada" e "vinculada", e o histórico do pedido registra a inclusão com o nome do vendedor

**C-009 — Item removido desfaz o vínculo**
- **Dado que** a solicitação do C-008 está vinculada ao item 5301 do pedido em montagem
- **Quando** a compradora remove esse item da lista
- **Então** a solicitação **volta para a fila** (aprovada, sem pedido), reaparece no bloco do pedido, e o histórico dela ganha a linha "desvinculada" — o mesmo acontece quando o item fica com quantidade zero e é removido ao enviar o pedido para a aprovação técnica

**C-010 — Recusar pelo próprio pedido em montagem**
- **Dado que** a compradora está montando o pedido e uma das solicitações do bloco não faz sentido
- **Quando** ela recusa ali mesmo, com motivo
- **Então** a solicitação fica recusada, sai do bloco e o vendedor lê o motivo na tela dele — sem precisar abrir outra tela

**C-011 — A situação de atendimento acompanha o pedido**
- **Dado que** uma solicitação está vinculada a um pedido
- **Quando** o pedido anda pelo fluxo
- **Então** a situação da solicitação, lida a cada consulta, é: montagem → **em análise**; aprovação técnica e aprovação da diretoria → **em aprovação**; envio para indústria → **em envio**; enviado → **enviada**; em trânsito → **em trânsito**; faturamento → **em faturamento**; produtos em B.O. → **em faturamento**, ou **não atendida** quando é justamente aquele produto que ficou em B.O.; concluído → **atendida**; cancelado → **não atendida**. Solicitação sem pedido aparece como **sem pedido**

**C-012 — Solicitação de outro fornecedor ou de outra filial não entra no pedido**
- **Dado que** existem uma solicitação do mesmo fornecedor para a **filial 2** e outra da **filial 1** mas de outro fornecedor
- **Quando** a compradora abre o pedido do fornecedor Nestlé para a filial 1
- **Então** nenhuma das duas aparece no bloco, e não há como incluí-las naquele pedido

**C-013 — Uma solicitação vira um item só**
- **Dado que** a solicitação do produto 5301 já foi incluída no pedido
- **Quando** alguém tenta incluí-la de novo, no mesmo pedido ou em outro
- **Então** a inclusão é recusada dizendo que a solicitação já está vinculada a um pedido; e quando o produto **já estava** no pedido com quantidade, o vínculo é gravado no item existente **sem sobrescrever a quantidade que a compradora já tinha decidido**

**C-014 — O cliente comprou?**
- **Dado que** seis solicitações foram aprovadas para a filial 3 — uma cujo cliente comprou naquela filial (12 unidades 20 dias depois da aprovação), uma cujo cliente comprou **em outra filial**, uma cujo cliente não comprou nada, uma cujo produto vendeu na filial mas **para outro cliente**, uma **sem cliente informado** e uma aprovada há **10 dias**
- **Quando** o painel de rastreio é aberto com o limite de carência em 30 dias
- **Então** elas aparecem, respectivamente, como **cliente comprou**, **comprou em outra filial**, **cliente não comprou**, **cliente não comprou** (a venda a terceiro é contexto, nunca a resposta), **sem cliente informado** e **aguardando giro**

**C-015 — O que foi comprado encalhou?**
- **Dado que** as mesmas seis solicitações têm, na filial, estoque de 20 unidades com saída há 5 dias; estoque zero; 40 unidades sem nenhuma saída há 80 dias; 300 unidades girando 1 unidade por dia; estoque zero; e 20 unidades numa aprovação de 10 dias atrás
- **Quando** o painel é aberto com os limites de 60 dias sem saída e 90 dias de cobertura
- **Então** elas aparecem como **girando**, **sem estoque**, **parado na filial**, **em excesso** (300 dias de cobertura), **sem estoque** e **girando** (dentro da carência não se cobra resultado) — e esta leitura é **independente** da do cliente: as duas aparecem lado a lado e nenhuma anula a outra

**C-016 — Consulta que falha não vira "sem alerta"**
- **Dado que** a consulta de rastreio de um lote falha
- **Quando** o painel é desenhado
- **Então** as solicitações daquele lote aparecem como **sem dado** nos dois eixos, com um aviso de que parte do rastreio não pôde ser lida — **nunca** como "cliente não comprou" ou "estoque normal"

**C-017 — Mudar o limite reclassifica sem consultar de novo**
- **Dado que** o painel já está desenhado com 90 dias de cobertura e uma solicitação classificada como girando com 95 dias de cobertura
- **Quando** o gestor baixa o limite de cobertura para 60 dias
- **Então** aquela solicitação passa a **em excesso** imediatamente, **sem nenhuma nova consulta** ao sistema de origem

**C-018 — Encontrar o cliente por código, nome ou CNPJ**
- **Dado que** o cliente 9201 se chama "Nutrivida Clinica Ltda" e tem o CNPJ 12.345.678/0001-90
- **Quando** o vendedor digita `9201`, `nutrivida` ou `12345678000190` no campo de cliente
- **Então** os três caminhos encontram o mesmo cliente, no máximo 20 resultados aparecem por busca, e o que fica gravado na solicitação é **código, nome e CNPJ**

**C-019 — Quem pode o quê**
- **Dado que** o comercial, um analista, a diretoria e um usuário somente leitura abrem a tela de solicitações
- **Quando** tentam operar
- **Então** o comercial registra e cancela as **suas** e não avalia nenhuma; o analista avalia e inclui no pedido e **não registra**; a diretoria vê tudo com todos os botões desabilitados; o somente leitura idem; e um analista de acesso restrito só inclui solicitação nos pedidos que ele criou

**C-020 — A lista, os filtros e a paginação**
- **Dado que** existem 14 solicitações no sistema desta feature — 4 pendentes, 7 aprovadas sem pedido, 1 aprovada e vinculada, 1 recusada e 1 cancelada
- **Quando** o gestor abre a lista
- **Então** ela vem paginada com o total; o filtro de situação própria "pendente" devolve 4 e o de "recusada" devolve 1; o filtro de fornecedor Nestlé recorta a lista; a busca por "BEBIDA LACTEA" encontra as do produto 5301; e a soma das páginas é o total informado

**C-021 — O comercial só enxerga o que registrou**
- **Dado que** o vendedor Leo registrou 4 solicitações e existem outras de outros autores
- **Quando** ele abre a lista sem nenhum filtro
- **Então** ele vê **apenas as 4 dele**, mesmo tentando pela URL ou trocando o filtro; um analista, na mesma lista, vê todas e tem um filtro "minhas" para recortar quando quiser

**C-022 — O histórico conta o que aconteceu**
- **Dado que** uma solicitação foi criada, aprovada, vinculada a um pedido, desvinculada e vinculada de novo
- **Quando** alguém abre o detalhe dela
- **Então** lê as 5 linhas em ordem, cada uma com o evento, quem fez, quando e o detalhe (o número do pedido no vínculo, o motivo na recusa)

**C-023 — Exportar o rastreio**
- **Dado que** o painel de rastreio está desenhado com as seis solicitações do C-014
- **Quando** o gestor exporta
- **Então** o arquivo traz exatamente as linhas mostradas, com produto, cliente (código e nome), filial, data de aprovação, situação do cliente, situação do estoque, quantidade vendida ao cliente, estoque atual e dias de cobertura

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O comercial DEVE registrar uma solicitação com produto, quantidade, filial, justificativa, prioridade e, opcionalmente, cliente | C-001, C-002 | must |
| RF-002 | O produto e o cliente DEVEM vir do cadastro do ERP por busca, e o fornecedor DEVE ser o do produto, nunca escolhido à mão | C-001, C-018 | must |
| RF-003 | O cliente DEVE ser buscável por código, por parte do nome e por CNPJ, com no máximo 20 resultados | C-018 | must |
| RF-004 | Quantidade zero ou justificativa com menos de 10 caracteres DEVEM impedir o registro sem perder o que foi digitado | C-003 | must |
| RF-005 | Compras DEVE poder aprovar (pondo na fila) ou recusar (com motivo de pelo menos 10 caracteres) uma solicitação pendente | C-004, C-005 | must |
| RF-006 | Aprovar NÃO DEVE criar pedido nem item: a solicitação aprovada espera a montagem | C-004 | must |
| RF-007 | O vendedor DEVE poder cancelar a própria solicitação enquanto ela estiver pendente, e só ela | C-006 | must |
| RF-008 | O pedido em montagem DEVE mostrar as solicitações ativas do mesmo fornecedor e da mesma filial, ordenadas por prioridade | C-007, C-012 | must |
| RF-009 | "Incluir no pedido" DEVE aprovar a solicitação pendente, criar o item com a quantidade solicitada e vincular os dois, em uma operação | C-008 | must |
| RF-010 | Uma solicitação DEVE estar vinculada a no máximo um item de um pedido | C-013 | must |
| RF-011 | Remover ou zerar o item DEVE desfazer o vínculo e devolver a solicitação à fila | C-009 | must |
| RF-012 | A situação de atendimento DEVE ser derivada da etapa do pedido e da situação do item a cada consulta, sem rotina de sincronização | C-011 | must |
| RF-013 | A solicitação DEVE ter histórico de criação, aprovação, recusa, vínculo, desvínculo e cancelamento, com autor, data e detalhe | C-022 | must |
| RF-014 | O rastreio pós-aprovação DEVE responder, por solicitação, se o cliente solicitante comprou desde a aprovação — na filial e em qualquer filial | C-014 | must |
| RF-015 | O rastreio DEVE responder, em eixo separado, se o estoque na filial está parado, em excesso, girando ou zerado | C-015 | must |
| RF-016 | Os três limites do rastreio (carência, dias sem saída, dias de cobertura) DEVEM ser parâmetros da tela e reclassificar sem nova consulta | C-017 | must |
| RF-017 | Lote de rastreio que falha DEVE aparecer como "sem dado", nunca como ausência de alerta | C-016 | must |
| RF-018 | A listagem DEVE ser paginada com total e ter filtros por situação própria, situação de atendimento, fornecedor, filial, autoria e busca livre | C-020 | must |
| RF-019 | O comercial DEVE ver somente as solicitações que registrou, com o recorte aplicado no servidor | C-021 | must |
| RF-020 | As personas DEVEM obedecer à matriz de C-019, com controles desabilitados (nunca escondidos) para quem não opera | C-019 | must |
| RF-021 | O rastreio DEVE ser exportável com as mesmas linhas mostradas | C-023 | should |
| RF-022 | O item criado a partir de uma solicitação DEVE mostrar, na lista de itens do pedido, de quem veio a solicitação | C-008 | should |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Abrir um pedido em montagem custa **uma** consulta a mais por causa deste bloco, qualquer que seja o número de solicitações | Contador de chamadas ao abrir um pedido com 3 solicitações ativas: 1 |
| RNF-002 | "Incluir no pedido" custa no máximo **5** operações no servidor, qualquer que seja o tamanho do pedido | Contador na inclusão de uma solicitação num pedido de 40 itens |
| RNF-003 | O rastreio de uma página de solicitações custa **uma** consulta ao sistema de origem por lote de **120** solicitações, e o texto enviado nunca passa de **4000** caracteres | 120 solicitações = 1 consulta; 121 = 2 |
| RNF-004 | Mudar um limite do rastreio não gera nenhuma consulta nova | Contador de consultas ao trocar o limite: 0 |
| RNF-005 | A listagem responde em até 2 s com 5 mil solicitações, sempre paginada e com total | Cronômetro sobre a lista com volume de teste |
| RNF-006 | Nenhuma operação desta feature escreve no ERP | Revisão das consultas |

## Entidades do domínio

- **Solicitação** — a demanda de compra que um vendedor registra: produto, quantidade,
  filial, justificativa, prioridade, o cliente que a motivou (ou a ausência dele), o
  fornecedor do produto, quem registrou e quando. Tem uma **situação própria**
  (pendente, aprovada, recusada, cancelada) e uma **situação de atendimento** que não é
  gravada: é lida da etapa do pedido a que ela se ligou.
- **Histórico da solicitação** — a sequência do que aconteceu com ela: criada, aprovada,
  recusada, vinculada, desvinculada, cancelada — cada linha com autor, data e detalhe.
- **Vínculo** — a ligação entre uma solicitação aprovada e **um** item de **um** pedido.
  Nasce na montagem, desfaz-se quando o item sai, e é o que faz a solicitação herdar a
  situação de atendimento.
- **Rastreio pós-aprovação** — a leitura, feita meses depois, de dois fatos independentes
  sobre uma solicitação aprovada: o cliente que a motivou comprou o produto desde a
  aprovação? e o estoque que entrou na filial está girando?

## Regras de negócio

- **RN-001 — Campos da solicitação.** Produto, quantidade maior que zero, filial e
  justificativa de pelo menos 10 caracteres são obrigatórios. Cliente e prioridade não:
  sem prioridade vale **normal**, sem cliente vale **sem cliente informado**.
- **RN-002 — O vendedor é quem registra.** Não existe campo "vendedor": o autor da
  solicitação é o vendedor, e é o nome dele que aparece na fila, no bloco do pedido e na
  etiqueta de origem do item. Não há vendedor externo ao sistema.
- **RN-003 — Cliente ausente não é cliente que não comprou.** Solicitação sem cliente é
  lida como "sem cliente informado" em todo lugar; afirmar que o cliente não comprou, nesse
  caso, seria inventar uma resposta. O cliente é sempre mostrado com **código e nome**,
  porque o rastreio segue o código e o nome gravado pode divergir do cadastro.
- **RN-004 — Fornecedor vem do produto.** O vendedor escolhe produto e filial; o fornecedor
  é o do produto, copiado no momento do registro junto com descrição, embalagem e unidade
  — uma foto, para a fila não mudar de assunto se o cadastro mudar depois.
- **RN-005 — Aprovar não é vincular.** Aprovar põe a solicitação na fila, sem pedido. O
  vínculo é uma decisão da montagem, não da avaliação.
- **RN-006 — Recusa exige motivo.** Motivo com pelo menos 10 caracteres, gravado com autor
  e data, visível ao vendedor. Recusa sem motivo não é gravada.
- **RN-007 — Cancelamento.** Só o autor cancela, e só enquanto a solicitação estiver
  pendente. Depois de avaliada, quem desfaz é compras (recusando, ou desvinculando).
- **RN-008 — Situação de atendimento (derivada).** Sem pedido vinculado: **sem pedido**.
  Com pedido: montagem → **em análise**; aprovação técnica ou da diretoria → **em
  aprovação**; envio → **em envio**; enviado → **enviada**; trânsito → **em trânsito**;
  faturamento → **em faturamento**; produtos em B.O. → **em faturamento**, salvo se o item
  daquele produto estiver em B.O., caso em que é **não atendida**; concluído → **atendida**;
  cancelado → **não atendida**. Nada disso é gravado: é lido a cada consulta, e por isso não
  existe rotina de sincronização nem status envelhecido.
- **RN-009 — Uma solicitação, um item, um pedido.** Solicitação já vinculada não se vincula
  de novo. Dois vendedores que pedem o mesmo produto geram duas solicitações e, se as duas
  entrarem no mesmo pedido, **um** item — a segunda vincula ao item que já existe.
- **RN-010 — Quantidade ao vincular.** O item nasce com a quantidade solicitada, e o
  comprador a ajusta como em qualquer item. Se o produto **já estava** no pedido com
  quantidade maior que zero, a quantidade é preservada: quem decide quanto comprar é a
  montagem, e uma inclusão nunca sobrescreve uma decisão já tomada.
- **RN-011 — Desvínculo.** Item removido, ou zerado e removido ao sair da montagem, desfaz
  o vínculo: a solicitação volta a aprovada e sem pedido, e o histórico registra
  "desvinculada". Ela reaparece no bloco do próprio pedido, porque voltou a ser demanda em
  aberto daquele fornecedor e filial.
- **RN-012 — O bloco da montagem.** Aparece só na etapa de montagem, mostra só as
  solicitações **ativas** (pendentes, ou aprovadas e sem pedido) do **mesmo fornecedor e da
  mesma filial** do pedido, ordenadas por prioridade (urgente, alta, normal) e, dentro da
  prioridade, da mais antiga para a mais nova. Só quem pode editar aquele pedido opera o
  bloco.
- **RN-013 — Rastreio, eixo do cliente.** Sem cliente na solicitação: **sem cliente
  informado**. Com venda ao cliente na filial da solicitação desde a aprovação: **cliente
  comprou**. Sem venda na filial mas com venda ao mesmo cliente em qualquer outra:
  **comprou em outra filial**. Sem venda nenhuma e aprovação mais nova que o limite de
  carência: **aguardando giro**. Sem venda nenhuma e fora da carência: **cliente não
  comprou**. Venda do produto na filial para **outros** clientes é contexto mostrado ao
  lado, nunca a resposta.
- **RN-014 — Rastreio, eixo do estoque.** Estoque zero na filial: **sem estoque** — o que
  foi comprado saiu, e isso nunca é alerta. Dentro da carência: **girando**. Com estoque e
  sem nenhuma saída há mais dias que o limite (ou sem saída registrada): **parado na
  filial**. Com estoque cujo giro cobre mais dias que o limite de cobertura, ou com giro
  zero: **em excesso**. Caso contrário: **girando**. O giro diário é o maior entre o giro
  dos últimos 90 dias registrado na filial e o giro observado desde a aprovação — um item
  que voltou a vender agora não pode ser classificado como excesso por falta de registro.
- **RN-015 — Data de referência.** Só conta a venda ocorrida a partir da **data de
  aprovação** da solicitação; antes disso a venda não tem relação com a compra decidida.
  Solicitação sem data de aprovação não entra no rastreio.
- **RN-016 — Lotes e limites.** O rastreio consulta o sistema de origem em lotes de **120**
  solicitações, com no máximo 4000 caracteres por consulta. Lote que falha classifica as
  suas solicitações como **sem dado** nos dois eixos, e o painel diz que parte do rastreio
  não pôde ser lida. Os três limites (carência, dias sem saída, dias de cobertura) são
  parâmetros da tela; mudar um deles reclassifica o que já está na tela, sem consultar de
  novo. Os padrões são **30**, **60** e **90** dias.
- **RN-017 — Prioridade.** Três níveis — normal, alta, urgente —, o mesmo vocabulário da
  prioridade do pedido. A prioridade ordena a fila e o bloco da montagem; não muda nenhuma
  regra de aprovação.
- **RN-018 — Quem faz o quê.** Registrar e cancelar a própria: comercial e admin. Avaliar,
  incluir no pedido e recusar: admin, analista e gestor. Ler: todas as personas, inclusive o
  comercial (que lê só as suas) e a diretoria (que só lê). Acesso somente leitura não opera
  nada; acesso restrito só inclui solicitação em pedido que criou.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | registrar 5301 com quantidade 24, cliente 9201 e justificativa de 90 caracteres grava 1 solicitação pendente com o vendedor, o fornecedor 1042 "Nestlé", o cliente 9201 com nome e CNPJ, e 1 linha "criada" no histórico | regra de negócio |
| C-002 | registrar sem cliente grava cliente 0 e nome vazio; a leitura devolve situação de cliente "sem cliente informado" e nunca "não comprou" | regra de negócio + regra de tela |
| C-003 | quantidade 0 é recusada; justificativa com 9 caracteres é recusada; a contagem de solicitações não muda em nenhum dos dois casos; a validação de tela aponta os dois campos de uma vez | regra de negócio + regra de tela |
| C-004 | aprovar a pendente do 5303 deixa status "aprovada" com pedido 0, avaliador e data; a contagem de pedidos e de itens do sistema não muda; 1 linha "aprovada" no histórico | regra de negócio |
| C-005 | recusar com 9 caracteres devolve "não pode" citando o motivo; com 10, grava status "recusada", motivo, autor e data, e 1 linha "recusada" | regra de negócio |
| C-006 | Leo cancela a sua pendente e ela fica "cancelada"; Leo tentando cancelar a de outro autor não grava nada; cancelar uma já aprovada não grava nada | regra de negócio |
| C-007 | o bloco do pedido em montagem (Nestlé, filial 1) devolve exatamente 3 linhas, na ordem 5303 (urgente), 5301 (alta), 5302 (normal), cada uma com cliente, vendedor e justificativa | regra de negócio |
| C-008 | incluir a solicitação do 5301 devolve o item criado, o pedido passa a ter 1 item 5301 com quantidade pedida 24 e a origem da solicitação, a solicitação fica aprovada e vinculada àquele pedido e ao item, o bloco passa a devolver 2 linhas, e o histórico do pedido ganha 1 nota citando "Leo" | regra de negócio |
| C-009 | remover o item 5301 devolve a solicitação à fila (pedido 0, item 0, status aprovada), o bloco volta a 3 linhas e o histórico dela ganha "desvinculada"; zerar o item e sair da montagem produz o mesmo resultado | regra de negócio |
| C-010 | recusar pelo bloco deixa a solicitação "recusada" com o motivo e o bloco passa a devolver 2 linhas | regra de negócio |
| C-011 | com a solicitação vinculada, mover o pedido pelas 10 etapas devolve, na ordem: em análise, em aprovação, em aprovação, em envio, enviada, em trânsito, em faturamento, em faturamento, atendida, não atendida; com o item daquele produto em B.O. na etapa de B.O., devolve não atendida | regra de negócio |
| C-012 | o bloco do pedido Nestlé/filial 1 não traz a solicitação Nestlé/filial 2 nem a do fornecedor 1015/filial 1; incluir qualquer uma das duas nesse pedido é recusado citando fornecedor e filial | regra de negócio |
| C-013 | incluir a mesma solicitação duas vezes devolve "não pode" na segunda e o pedido continua com 1 item; incluir uma solicitação de um produto que já está no pedido com quantidade 30 mantém a quantidade em 30 e grava a origem | regra de negócio |
| C-014 | as 6 solicitações do rastreio devolvem, na ordem do seed: cliente comprou (12 unidades), comprou em outra filial (8), cliente não comprou, cliente não comprou (com 30 unidades vendidas a terceiros no contexto), sem cliente informado, aguardando giro | regra de tela + regra de negócio |
| C-015 | as mesmas 6 devolvem: girando, sem estoque, parado na filial (80 dias sem saída), em excesso (300 dias de cobertura), sem estoque, girando | regra de tela + regra de negócio |
| C-016 | a classificação de uma solicitação sem linha correspondente devolve "sem dado" nos dois eixos, e o resumo do painel conta quantas ficaram sem dado | regra de tela |
| C-017 | a mesma linha classificada com cobertura de 90 dias dá "girando" e com 60 dá "em excesso"; a função de classificação é chamada de novo sobre os mesmos dados, sem entrada nova | regra de tela |
| C-018 | a busca por 9201, por "nutrivida" e por "12345678000190" devolve, cada uma, pelo menos 1 linha com o mesmo código, nome e CNPJ; a busca devolve no máximo 20 linhas | regra de negócio |
| C-019 | registrar como analista é recusado; avaliar como comercial e como diretoria é recusado; incluir no pedido como comercial, diretoria e somente leitura é recusado; incluir como analista restrito em pedido de outro é recusado citando acesso restrito; a matriz de permissões devolve as chaves certas por persona | regra de negócio + regra de tela |
| C-020 | as 14 solicitações desta feature aparecem recortadas pelos seus próprios códigos (nunca por total absoluto); o filtro "pendente" devolve 4, "recusada" devolve 1, o de fornecedor 1042 recorta, a busca por "BEBIDA LACTEA" devolve as do 5301, e o total bate com a contagem feita no próprio teste | regra de negócio |
| C-021 | a mesma listagem, sem filtro, devolve só as 4 de Leo quando quem chama é Leo, e todas quando quem chama é o gestor; o filtro "minhas" do gestor devolve as dele | regra de negócio |
| C-022 | a solicitação que passou por criada, aprovada, vinculada, desvinculada e vinculada devolve 5 linhas em ordem, com autor, data e o número do pedido no detalhe do vínculo | regra de negócio |
| C-023 | as linhas exportadas são exatamente as 6 do painel, com as 9 colunas da regra, na mesma ordem da tela | regra de tela |
| RN-001 | quantidade 0 → mensagem citando quantidade; justificativa de 9 caracteres → mensagem citando justificativa; produto ausente → mensagem; tudo preenchido → sem mensagem; prioridade vazia vira normal | regra de tela |
| RN-002 | a solicitação criada por Leo devolve Leo como vendedor na listagem, no bloco e na etiqueta do item | regra de negócio |
| RN-003 | cliente 0 → "sem cliente informado" nos dois eixos de rótulo, e nunca "cliente não comprou" | regra de tela |
| RN-004 | registrar o 5301 grava fornecedor 1042 e "Nestlé" sem que o registro receba fornecedor nenhum como entrada | regra de negócio |
| RN-005 | aprovar não cria pedido nem item: as contagens antes e depois são iguais | regra de negócio |
| RN-006 | recusa com 9 caracteres não grava; com 10, grava motivo, autor e data | regra de negócio |
| RN-007 | cancelar pendente do próprio autor grava; de outro autor, não; já aprovada, não | regra de negócio |
| RN-008 | a tabela etapa → situação das 10 etapas, mais "sem pedido" quando não há vínculo e "não atendida" quando o item está em B.O. | regra de negócio |
| RN-009 | duas solicitações do mesmo produto no mesmo pedido produzem 1 item; a segunda vincula ao item existente | regra de negócio |
| RN-010 | incluir sobre item com quantidade 30 mantém 30; sobre item removido ou com quantidade 0, passa a valer a quantidade solicitada | regra de negócio |
| RN-011 | remover o item devolve a solicitação à fila; zerar e sair da montagem também; solicitação de item que continua vivo não é desvinculada | regra de negócio |
| RN-012 | o bloco devolve só ativas do mesmo fornecedor e filial, ordenadas urgente → alta → normal e, dentro delas, da mais antiga para a mais nova; recusada, cancelada e vinculada ficam fora | regra de negócio |
| RN-013 | (cliente 0) → sem cliente; (venda na filial > 0) → comprou; (venda na filial 0, venda geral > 0) → comprou em outra filial; (sem venda, 10 dias, carência 30) → aguardando; (sem venda, 45 dias) → não comprou | regra de tela |
| RN-014 | (estoque 0) → sem estoque; (10 dias, carência 30) → girando; (estoque 40, 80 dias sem saída, limite 60) → parado; (estoque 300, giro 1/dia, limite 90) → excesso; (estoque 20, giro 1/dia, saída há 5 dias) → girando; (estoque 20, giro 0) → excesso | regra de tela |
| RN-015 | solicitação sem data de aprovação fica fora dos pares montados; a data usada é a da aprovação, não a da criação; venda anterior à aprovação não conta | regra de tela + regra de negócio |
| RN-016 | 120 solicitações produzem 1 lote e 121 produzem 2; nenhum texto de lote passa de 4000 caracteres; lote ausente vira "sem dado"; os padrões são 30, 60 e 90 | regra de tela |
| RN-017 | a ordenação por prioridade devolve urgente, alta, normal; prioridade desconhecida vira normal | regra de tela |
| RN-018 | a matriz por persona e por nível de acesso, com as três chaves novas, e o menu do comercial com exatamente dois itens | regra de tela |

- O que só olho humano verifica fica em **Verificação manual**:
  - [ ] C-001 — o formulário de nova solicitação com as buscas de produto e de cliente, nos dois temas
  - [ ] C-007 — o bloco de solicitações acima dos itens no pedido em montagem, nos dois temas
  - [ ] C-014/C-015 — o painel de rastreio com os dois eixos lado a lado, sem que um pareça sobrepor o outro
  - [ ] C-019 — os botões desabilitados (nunca escondidos) para a diretoria, para o comercial e para o acesso somente leitura
  - [ ] C-021 — o menu do comercial com Solicitações e Produtos em B.O., e nada mais

## Fora de escopo

- [ ] **Formulário público, sem login** — descartado no contrato do sistema; quem registra tem conta.
- [ ] **Vendedor vindo de outro sistema** — o vendedor é o usuário que registrou; não há integração de força de vendas aqui.
- [ ] **Indicadores, funil e ranking por vendedor** — é a spec 009, que lê as solicitações desta.
- [ ] **Editar uma solicitação depois de registrada** — cancela-se e registra-se de novo; o histórico não se reescreve.
- [ ] **Solicitar produto que não existe no cadastro do ERP** — cadastro novo é outro processo.
- [ ] **Avisar o vendedor por e-mail a cada mudança de situação** — a situação é derivada e está na tela dele; e-mail automático ao comercial não foi pedido.
- [ ] **Rastreio em dinheiro** — o rastreio responde sim/não e quantidade; a leitura de valor é da spec 009.
- [ ] **Os status gravados do sistema anterior** — a situação de atendimento é derivada, e nenhum estado intermediário é persistido.
- [ ] **Migração das solicitações do sistema anterior** — o sistema começa vazio.
- [ ] **Escrita no ERP** — tudo que esta feature faz sobre o ERP é leitura.

## Pendências

Cada item aqui **bloqueia** o `plan.md`.

- Nenhuma.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-003, C-005, C-006, C-012, C-013, C-016, C-019)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto
