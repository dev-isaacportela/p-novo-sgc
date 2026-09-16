# Spec: Compras inteligentes — o que comprar hoje, por fornecedor e filial

**ID:** 011-compras-inteligentes · **Status:** rascunho · **Data:** 2026-09-16

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

O pedido de compra do SGC começa quando alguém decide que está na hora de comprar daquele
fornecedor. Essa decisão — a mais cara do processo, porque define quanto dinheiro fica parado
e o que vai faltar na prateleira — hoje não tem apoio nenhum: a compradora abre um pedido em
branco, escolhe fornecedor e filial, e só então vê a lista de produtos com venda, estoque e
trânsito. Antes disso ela não sabe **de qual fornecedor** deveria comprar hoje, nem quais dos
300 produtos dele estão perto de furar o estoque.

O resultado é conhecido: compra-se por calendário e por memória. Item que vendeu o dobro no
último mês é comprado na média dos últimos meses e rompe; item que parou de vender é comprado
de novo porque "sempre se comprou" e fica seis meses no estoque. Quando o item rompe, a venda
perdida não aparece em lugar nenhum — e quando sobra, o dinheiro parado também não.

Falta ainda a memória das exceções: o produto que está em falta na indústria e não adianta
sugerir toda semana; a venda de 600 unidades para um cliente que fechou e nunca mais vai se
repetir; o item que leva 30 dias para chegar e não os 9 de sempre.

## Resultado esperado

A compradora escolhe fornecedor e filial e vê, numa lista só, todos os produtos daquele
fornecedor com a situação de cada um (rompeu, está exposto, está adequado, sobrou), quanto o
sistema sugere comprar e em quantos dias o item fura o estoque de segurança. Ela ajusta o que
quiser, joga no carrinho e o pedido nasce no quadro de compras já com os itens dentro,
pronto para a montagem. O que ela ensinou ao sistema — este item leva 20 dias, esta venda foi
atípica, este produto está silenciado até o mês que vem — vale na próxima vez.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| analista (comprador) | ver o que comprar hoje por fornecedor, ajustar a quantidade, montar o carrinho e abrir o pedido | diária |
| gestor (gerência de compras) | o mesmo do analista, e ajustar cobertura, lead time, gatilho e silenciamento por fornecedor e por produto | semanal |
| admin (TI) | o mesmo do gestor | eventual |
| diretoria | acompanhar exposição, rupturas e a aderência do comprador à sugestão | semanal |

O **nível de acesso** da plataforma continua valendo: quem tem acesso somente-leitura vê a
lista e não opera nada; quem tem acesso restrito opera normalmente, e o pedido que ele abre é
dele. O perfil **comercial** não aparece na tabela de propósito: ele não vê esta tela.

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa. Salvo dito, os números
abaixo usam consumo de **2 unidades por dia**, lead time de **9 dias**, cobertura de **35
dias** e caixa de **12 unidades** — de onde saem estoque de segurança **18**, ponto de pedido
**36** e estoque máximo **70**.

**C-001 — A lista chega inteira, numa consulta só**
- **Dado que** o fornecedor tem 20 produtos na filial escolhida, sendo 1 marcado como inativo e 1 de departamento excluído
- **Quando** a compradora escolhe fornecedor e filial
- **Então** aparecem os 18 produtos restantes, cada um com estoque disponível, trânsito, venda da janela, consumo diário, situação, curva, cobertura atual, dias de gatilho e sugestão — e nenhuma consulta a mais é feita por produto

**C-002 — Situação adequada**
- **Dado que** o produto tem 50 em estoque disponível e nada em trânsito
- **Quando** a lista é calculada
- **Então** a situação é **adequado**, a sugestão é **24** (70 − 50 = 20, arredondado para 2 caixas de 12), a cobertura atual é **25 dias** e o gatilho é **7 dias**

**C-003 — Ruptura**
- **Dado que** o produto está com estoque disponível **zero** e nada em trânsito
- **Quando** a lista é calculada
- **Então** a situação é **ruptura**, a sugestão é **72** (70 arredondado para 6 caixas) e o gatilho é **−18 dias**

**C-004 — Excesso**
- **Dado que** o produto tem 100 em estoque disponível e nada em trânsito
- **Quando** a lista é calculada
- **Então** a situação é **excesso** (100 passa do máximo de 70), a sugestão é **0** e a cobertura atual é **50 dias**

**C-005 — Baixa exposição**
- **Dado que** o produto tem 30 em estoque disponível e nada em trânsito
- **Quando** a lista é calculada
- **Então** a situação é **baixa exposição** (30 está abaixo do ponto de pedido de 36, mas os 15 dias de cobertura ainda cobrem os 9 dias de lead time) e a sugestão é **48**

**C-006 — Elevada exposição**
- **Dado que** o produto tem 10 em estoque disponível e nada em trânsito
- **Quando** a lista é calculada
- **Então** a situação é **elevada exposição** (5 dias de cobertura não cobrem os 9 de lead time) e a sugestão é **60**

**C-007 — O que já está a caminho não é comprado de novo**
- **Dado que** o produto tem 30 em estoque disponível e **20 em trânsito**
- **Quando** a lista é calculada
- **Então** a sugestão é **0**, e o produto aparece na aba de itens em trânsito com a situação de baixa exposição

**C-008 — Venda recente pesa mais que venda antiga**
- **Dado que** três produtos venderam **20 unidades** cada dentro de uma janela de 2 dias: o primeiro 10 ontem e 10 hoje, o segundo 20 ontem, o terceiro 20 hoje
- **Quando** o consumo diário é apurado
- **Então** os três mostram venda 20 na janela, mas o consumo é **10,0000**, **9,1892** e **10,8108** — a venda de ontem vale 85 % da de hoje

**C-009 — Lead time medido vence o padrão**
- **Dado que** o produto recebeu duas entradas nos últimos 12 meses, uma 4 dias depois do pedido e outra 6 dias depois, e tem 30 em estoque disponível
- **Quando** a lista é calculada
- **Então** o lead time usado é **5 dias** (não os 9 do padrão), o estoque de segurança cai de 18 para **10**, o ponto de pedido de 36 para **20**, a situação passa de baixa exposição para **adequado** e o gatilho de −3 para **5 dias**; um produto sem nenhuma entrada casada continua com os 9 dias do padrão

**C-010 — Parâmetro do fornecedor vale para todos os produtos dele**
- **Dado que** o fornecedor foi parametrizado com cobertura de **20 dias**
- **Quando** a lista é calculada
- **Então** o estoque máximo de cada produto passa a ser 40 (20 × 2) e o produto com 50 em estoque, que era adequado, passa a **excesso** com sugestão **0**

**C-011 — Parâmetro do produto vence o do fornecedor**
- **Dado que** o fornecedor tem cobertura de 20 dias e **este produto** tem cobertura de **45 dias**, com 50 em estoque disponível
- **Quando** a lista é calculada
- **Então** o estoque máximo deste produto é **90** e a sugestão é **48** (90 − 50 = 40, arredondado para 4 caixas de 12), enquanto os demais produtos do fornecedor continuam com máximo 40

**C-012 — Silenciar tira o produto da fila de compra, não da lista**
- **Dado que** o produto está sugerindo 48 unidades e a compradora sabe que a indústria não entrega antes do mês que vem
- **Quando** ela silencia o produto com o motivo
- **Então** o produto some da aba "a comprar" por **30 dias**, continua na aba "todos" marcado como silenciado com o motivo e a data, e volta à fila assim que ela o restaura

**C-013 — Venda atípica desconsiderada baixa o consumo**
- **Dado que** o produto vendeu 60 unidades num único dia para um cliente que não volta, e a compradora marca essa venda como desconsiderada com o motivo
- **Quando** a lista é recarregada
- **Então** a venda da janela cai **60 unidades**, o consumo diário cai, a sugestão cai junto, e a venda aparece na lista de desconsideradas com quem marcou e quando — até ela reconsiderar, quando tudo volta ao que era

**C-014 — Licitação dentro ou fora, por escolha de quem olha**
- **Dado que** o produto tem consumo diário de **2,0** no total, sendo **0,5** de vendas a órgãos públicos, e 30 em estoque disponível
- **Quando** a compradora liga "desconsiderar licitação"
- **Então** o consumo passa a **1,5**, o estoque máximo cai de 70 para **52,5**, a sugestão cai de 48 para **24** e a situação passa de baixa exposição para **adequado**; desligando o seletor, tudo volta

**C-015 — Curva ABC por valor, dentro do fornecedor e da filial**
- **Dado que** o fornecedor tem 5 produtos com valor de venda na janela (venda × custo) de R$ 500, R$ 250, R$ 150, R$ 70 e R$ 30 — total R$ 1.000
- **Quando** a curva é calculada
- **Então** os dois primeiros são **A** (acumulado 50 % e 75 %), o terceiro é **B** (90 %) e os dois últimos são **C** (97 % e 100 %)

**C-016 — Sem parâmetro, a cobertura é o alvo da curva do produto**
- **Dado que** o produto não tem parâmetro próprio nem o fornecedor tem, e a curva dele é **A**, cujo alvo é 35 dias
- **Quando** a lista é calculada
- **Então** o estoque máximo usa **35 dias** — o alvo, nunca o teto de 42 dias que dispensa justificativa na montagem do pedido; um produto de curva B usa 45 dias e um de curva C, 60

**C-017 — Sugestão editada respeita a caixa**
- **Dado que** a sugestão do produto é 48 e a caixa tem 12 unidades
- **Quando** a compradora digita **50**
- **Então** a quantidade vira **60** (5 caixas cheias), e a tela mostra o mesmo número em unidades e em caixas

**C-018 — Carrinho vira pedido no quadro**
- **Dado que** o carrinho tem 3 produtos do mesmo fornecedor e filial, um deles em ruptura, e a janela da tela é de 153 dias
- **Quando** a compradora clica em criar o pedido
- **Então** nasce **um** pedido na primeira fase do quadro, com o título no padrão do sistema, prioridade **alta** (por causa da ruptura), o período igual à janela da tela, o valor total do carrinho na capa e os 3 itens já na lista, cada um com a quantidade escolhida, a quantidade sugerida, o custo e a curva — e o pedido fica marcado como originado das compras inteligentes

**C-019 — Já existe pedido aberto para esse fornecedor e filial**
- **Dado que** existe um pedido daquele fornecedor e filial ainda não enviado à indústria
- **Quando** a compradora tenta jogar um produto no carrinho
- **Então** a ação é recusada com uma mensagem que cita o pedido aberto e a fase em que ele está; pedidos já enviados, concluídos ou cancelados não bloqueiam

**C-020 — Abrir o pedido não apaga o que o carrinho decidiu**
- **Dado que** o pedido nasceu do carrinho com 3 itens e quantidades escolhidas
- **Quando** a compradora abre esse pedido e manda montar a análise do fornecedor
- **Então** a lista cresce com os demais produtos do fornecedor, e as quantidades dos 3 itens que vieram do carrinho continuam exatamente as que ela escolheu

**C-021 — Detalhe do produto**
- **Dado que** a compradora quer entender por que o sistema sugeriu aquela quantidade
- **Quando** ela abre o detalhe do produto
- **Então** vê a posição de estoque aberta (total, bloqueado, avariado, reservado, disponível, pedido, trânsito), o histórico mensal de vendas e entradas dos últimos 12 meses, as últimas compras do produto e o estoque dele nas outras filiais — cada bloco custando uma consulta, e só ao abrir o detalhe

**C-022 — Eficiência do comprador**
- **Dado que** 5 itens de pedidos nascidos das compras inteligentes tiveram sugestão 100 e quantidades pedidas de 100, 80, 120, 79 e 121
- **Quando** o indicador é apurado no período
- **Então** a aderência é **60 %** — 80 e 120 estão dentro da faixa de 20 % para mais ou para menos, 79 e 121 estão fora

**C-023 — Quem pode o quê**
- **Dado que** pessoas de perfis diferentes abrem o sistema
- **Quando** cada uma tenta usar a tela
- **Então** analista, gestor e admin operam; a diretoria vê tudo e não altera nada; o comercial não encontra a tela nem pelo endereço direto; quem tem acesso somente-leitura vê e não opera; quem tem acesso restrito opera e o pedido criado é dele; e só admin e gestor alteram cobertura, lead time, gatilho e silenciamento

**C-024 — Exportar o que está na tela**
- **Dado que** a compradora filtrou a lista por situação
- **Quando** ela exporta
- **Então** o arquivo traz exatamente as linhas visíveis, com produto, situação, curva, consumo diário, estoque disponível, trânsito, cobertura atual, dias de gatilho, sugestão e custo

**C-025 — Fornecedor sem venda nenhuma na janela**
- **Dado que** um produto do fornecedor não teve venda nenhuma na janela e tem 40 em estoque disponível
- **Quando** a lista é calculada
- **Então** a situação é **excesso**, a sugestão é **0**, e cobertura atual e dias de gatilho aparecem como "sem giro" — nunca como um número inventado

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE listar, para um fornecedor e uma filial, todos os produtos ativos daquele fornecedor com as medidas de estoque, trânsito, venda, consumo e lead time apuradas numa consulta só ao ERP | Com 300 produtos, a lista aparece inteira sem nenhuma consulta por produto (C-001) | must |
| RF-002 | O estoque considerado DEVE ser o disponível — o total menos o bloqueado, o avariado e o reservado, nunca negativo —, e o trânsito DEVE somar o já pedido ao ERP e o efetivamente em trânsito | Produto com 100 total, 10 bloqueado, 5 avariado e 5 reservado mostra 80 disponível (C-001) | must |
| RF-003 | O sistema DEVE considerar apenas produtos ativos, fora dos departamentos 4 e 7, e ignorar o fornecedor genérico | O inativo e o do departamento 4 não aparecem (C-001) | must |
| RF-004 | O consumo diário DEVE ser a média da venda diária ponderada por recência, com peso de 0,85 por dia de distância do fim da janela, sobre uma janela de 153 dias encerrada hoje, contando inclusive os dias sem venda | Os três casos de C-008 | must |
| RF-005 | O sistema DEVE medir o lead time do produto pela média das entradas dos últimos 12 meses (da emissão do pedido ao ERP até a entrada da mercadoria), com mínimo de 1 dia, e usar o padrão quando não houver entrada casada | C-009 | must |
| RF-006 | O sistema DEVE calcular, por produto: estoque de segurança (lead × consumo), ponto de pedido (2 × lead × consumo), estoque máximo (cobertura × consumo), quantidade sugerida, cobertura atual em dias e dias de gatilho | Os números de C-002 a C-007 | must |
| RF-007 | A quantidade sugerida DEVE ser zero quando há trânsito, zero quando não há venda nem consumo, e nunca negativa; nos demais casos é o que falta para o estoque máximo, arredondado para cima em caixas cheias | C-002 a C-007, C-025 | must |
| RF-008 | Cada produto DEVE receber uma das cinco situações: ruptura, excesso, elevada exposição, baixa exposição ou adequado | C-002 a C-007 | must |
| RF-009 | O sistema DEVE classificar os produtos em curva A, B ou C pelo valor de venda da janela, dentro do fornecedor e da filial | Os cortes de 80 % e 95 % de C-015 | must |
| RF-010 | Cobertura, lead time e gatilho DEVEM ser parametrizáveis por fornecedor e por produto, valendo o mais específico; sem parâmetro, a cobertura é o alvo da curva do produto, o lead time é o medido e, na falta dele, 9 dias, e o gatilho é 15 dias | C-010, C-011, C-016 | must |
| RF-011 | O sistema DEVE permitir silenciar um produto por um prazo, com motivo, tirando-o da fila de compra sem tirá-lo da lista, e restaurá-lo a qualquer momento | C-012 | must |
| RF-012 | O sistema DEVE permitir desconsiderar uma venda específica do cálculo da demanda, com motivo, e reconsiderá-la | C-013 | must |
| RF-013 | A venda a órgãos públicos DEVE contar na demanda por padrão e poder ser desconsiderada por um seletor da tela, que recalcula tudo sem nova consulta ao ERP | C-014 | must |
| RF-014 | A lista DEVE ter três recortes: a comprar (sugestão maior que zero, sem os silenciados), todos (com filtro por situação) e em trânsito | C-007, C-012 | must |
| RF-015 | O produto cujo gatilho é menor ou igual ao parâmetro de gatilho DEVE aparecer sinalizado como urgente e primeiro na ordem | Produto com gatilho 7 e parâmetro 15 vem antes e sinalizado; com gatilho 32, não (C-002, C-004) | should |
| RF-016 | A quantidade sugerida DEVE ser editável e sempre reajustada para cima até a caixa cheia | C-017 | must |
| RF-017 | O carrinho DEVE criar um pedido por fornecedor e filial, na primeira fase do quadro, com período igual à janela da tela, prioridade alta quando houver ruptura no grupo, valor total na capa e os itens já gravados com quantidade pedida, quantidade sugerida, custo e curva, marcado como originado das compras inteligentes | C-018 | must |
| RF-018 | O carrinho DEVE ser recusado quando já houver pedido aberto (ainda não enviado à indústria) para aquele fornecedor e filial, citando o pedido e a fase | C-019 | must |
| RF-019 | A montagem da análise dentro do pedido não DEVE sobrescrever a quantidade que veio do carrinho | C-020 | must |
| RF-020 | O detalhe do produto DEVE mostrar posição de estoque aberta, histórico de 12 meses, últimas compras e estoque nas outras filiais | C-021 | must |
| RF-021 | O sistema DEVE apurar a aderência do comprador: o percentual de itens de pedidos originados das compras inteligentes em que a quantidade pedida ficou dentro de 20 % para mais ou para menos da sugerida, por comprador e período | C-022 | should |
| RF-022 | A tela DEVE ser aberta por analista, gestor, admin e diretoria (esta só lê); a parametrização e o silenciamento, só por admin e gestor; o comercial não DEVE alcançá-la | C-023 | must |
| RF-023 | A lista visível DEVE poder ser exportada | C-024 | should |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Abrir a tela custa no máximo **8** chamadas ao servidor, e trocar de fornecedor ou de filial no máximo **6**, qualquer que seja o número de produtos — nenhuma chamada por linha | Contador de chamadas com um fornecedor de 20 e outro de 300 produtos: o mesmo número |
| RNF-002 | Criar o pedido a partir do carrinho custa **3** chamadas por fornecedor e filial, qualquer que seja o número de itens | Contador com 1 e com 60 itens no carrinho: sempre 3 |
| RNF-003 | Abrir o detalhe de um produto custa **3** chamadas; a lista de vendas para desconsiderar, mais **1**, e só quando esse diálogo é aberto | Contador ao abrir o detalhe e ao abrir o diálogo de vendas |
| RNF-004 | A lista de um fornecedor com 300 produtos volta em uma consulta e é desenhada em até 3 s | Cronômetro sobre o fornecedor com mais produtos |
| RNF-005 | Ligar e desligar o seletor de licitação, trocar de aba, filtrar por situação e ordenar não DEVEM custar nenhuma chamada ao servidor | Contador durante a interação: zero |
| RNF-006 | Nenhuma operação desta tela escreve no ERP | Revisão das consultas: todas são leitura |

## Entidades do domínio

- **Medida de ressuprimento** — a fotografia de um produto num fornecedor e numa filial dentro da janela: estoque disponível e suas parcelas, trânsito, venda total, venda pública, consumo diário, volatilidade, lead time medido, custo e datas da última entrada e saída. É medida, não decisão: nada nela depende de parâmetro.
- **Parâmetro de compra** — o que a empresa ensina ao sistema sobre um fornecedor ou sobre um produto: cobertura, lead time, gatilho e silenciamento. Vale sempre o mais específico; o do produto vence o do fornecedor.
- **Venda desconsiderada** — uma venda específica, identificada de forma única, que a compradora tirou do cálculo da demanda, com motivo e autoria.
- **Sugestão de ressuprimento** — o resultado do cruzamento entre a medida e os parâmetros: segurança, ponto de pedido, estoque máximo, quantidade sugerida, cobertura atual, dias de gatilho e situação. Não é guardada: é recalculada a cada carga da tela.
- **Carrinho** — o conjunto de produtos escolhidos, agrupado por fornecedor e filial; cada grupo vira um pedido de compra.
- **Curva do produto** — a classificação A, B ou C pelo valor de venda dentro do fornecedor e da filial, na janela da tela. É ela que decide qual alvo de cobertura vale quando não há parâmetro.

## Regras de negócio

- **RN-001 — Consumo diário.** É a média da venda diária ponderada por recência: cada dia da janela pesa `0,85` elevado ao número de dias que o separam do fim da janela, e o consumo é a soma das vendas ponderadas dividida pela soma dos pesos. A janela padrão tem **153 dias** e termina hoje. Dia sem venda entra na conta com venda zero — é ele que faz a média ser diária e não "por dia com venda".
- **RN-002 — Estoque e trânsito.** Estoque considerado = total − bloqueado − avariado − reservado, nunca negativo. Trânsito = quantidade já pedida ao ERP + quantidade em trânsito.
- **RN-003 — Lead time.** Vale o do produto; na falta, o do fornecedor; na falta, o medido (média das entradas dos últimos 12 meses, da emissão do pedido ao ERP até a entrada da mercadoria, mínimo 1 dia, arredondada para cima); na falta de tudo, **9 dias**.
- **RN-004 — Cobertura.** Vale a do produto; na falta, a do fornecedor; na falta, o **alvo da curva** do produto; na falta de regra alcançável, **35 dias**. É o alvo que entra no estoque máximo, nunca o teto que dispensa justificativa na montagem.
- **RN-005 — Gatilho.** Vale o do produto; na falta, o do fornecedor; na falta, **15 dias**. Produto com dias de gatilho menor ou igual ao parâmetro é urgente.
- **RN-006 — As três grandezas.** Estoque de segurança = lead × consumo. Ponto de pedido = 2 × lead × consumo. Estoque máximo = cobertura × consumo.
- **RN-007 — Quantidade sugerida.** Com trânsito maior que zero, é **0**. Sem venda na janela e sem consumo, é **0**. Nos demais casos, é `máximo − disponível − trânsito`, arredondado para cima, nunca negativo, e depois arredondado para a caixa cheia. Unidades por caixa seguem a mesma regra da montagem do pedido.
- **RN-008 — Cobertura atual e dias de gatilho.** Cobertura atual = disponível ÷ consumo. Dias de gatilho = parte inteira de `(disponível + trânsito − segurança) ÷ consumo − lead`. Sem consumo, as duas não existem: a tela mostra "sem giro", nunca um número.
- **RN-009 — Situação.** Avaliada nesta ordem: **ruptura** (disponível ≤ 0); **excesso** (disponível + trânsito maior que o máximo); **elevada exposição** (disponível ≤ ponto de pedido e cobertura atual menor que o lead time); **baixa exposição** (disponível ≤ ponto de pedido); senão **adequado**.
- **RN-010 — Curva.** Valor = venda da janela × custo da última entrada. Os produtos do fornecedor e da filial são ordenados por valor decrescente; enquanto o acumulado for até 80 % do total é A, até 95 % é B, o resto é C. Sem valor total, todos são C. É a mesma régua da montagem do pedido.
- **RN-011 — Licitação.** A venda a clientes de órgão público (atividades 11 a 15 e 20) entra na demanda por padrão e aparece à parte. O seletor "desconsiderar licitação" subtrai a parte pública do consumo e recalcula tudo na tela, sem nova consulta.
- **RN-012 — Venda desconsiderada.** A venda marcada é tirada da demanda na origem, antes de qualquer média — não é descontada depois. No máximo 500 vendas desconsideradas por consulta.
- **RN-013 — Silenciamento.** Silenciar guarda a data até quando e o motivo; o padrão são **30 dias** a partir de hoje. Produto silenciado sai da aba "a comprar" e continua na aba "todos" com a marca, o motivo e a data. Restaurar apaga a data.
- **RN-014 — Recorte do ERP.** Produto ativo (sem marcação de inativo) e fora dos departamentos 4 e 7; o fornecedor genérico nunca entra; venda é só saída com quantidade positiva.
- **RN-015 — Carrinho.** Um pedido por fornecedor e filial. Título no padrão do sistema (filial e fornecedor em maiúsculas). Prioridade alta quando houver ao menos um produto em ruptura no grupo, normal nos demais casos. Período igual à janela da tela. Cada item nasce com a quantidade escolhida, a quantidade sugerida no momento da escolha, o custo e a curva.
- **RN-016 — Pedido aberto bloqueia.** Existe pedido aberto quando há pedido daquele fornecedor e filial em qualquer fase anterior ao envio à indústria (análise, aprovação técnica, aprovação da diretoria ou envio). A recusa cita o pedido e a fase.
- **RN-017 — O carrinho manda.** Ao montar a análise dentro do pedido, o produto que já está na lista mantém a quantidade que tem; só os produtos novos entram zerados.
- **RN-018 — Aderência.** Um item é aderente quando a quantidade pedida fica entre 80 % e 120 % da sugerida, limites inclusive, e a sugerida é maior que zero. A aderência é o percentual de itens aderentes entre os itens de pedidos originados das compras inteligentes, no período e por comprador.
- **RN-019 — Permissões.** Ver a tela: admin, analista, gestor e diretoria. Operar (carrinho, edição de quantidade, desconsiderar venda): admin, analista e gestor, zerado por acesso somente-leitura. Parametrizar e silenciar: admin e gestor. Comercial não vê. Acesso restrito opera e o pedido criado é dele.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | A consulta de ressuprimento do fornecedor na filial 1 devolve contagem > 0 e exatamente **18** dos 20 produtos da faixa desta spec; nenhuma linha com departamento 4 ou 7 | regra de negócio |
| C-002 | medida (disponível 50, trânsito 0, consumo 2) + parâmetros (lead 9, cobertura 35, caixa 12) → `adequado`, sugerida 24, cobertura atual 25, gatilho 7 | regra de tela |
| C-003 | disponível 0 → `ruptura`, sugerida 72, gatilho −18 | regra de tela |
| C-004 | disponível 100 → `excesso`, sugerida 0, cobertura atual 50 | regra de tela |
| C-005 | disponível 30 → `baixa_exposicao`, sugerida 48 | regra de tela |
| C-006 | disponível 10 → `elevada_exposicao`, sugerida 60 | regra de tela |
| C-007 | disponível 30 e trânsito 20 → sugerida 0 e situação `baixa_exposicao` | regra de tela |
| C-008 | janela de 2 dias: venda 20 nos três produtos; consumo 10,0000 (10+10), 9,1892 (20 ontem) e 10,8108 (20 hoje); volatilidade 0, 10 e 10 | regra de negócio |
| C-009 | consulta: lead medido 5 para o produto com entradas de 4 e 6 dias, 0 (sem medida) para o produto sem entrada; regra: com lead 5 → `adequado` e gatilho 5; com lead 9 (sem medida) → `baixa_exposicao` e gatilho −3; entrada no mesmo dia da emissão conta 1 | regra de negócio + regra de tela |
| C-010 | parâmetro de fornecedor cobertura 20 → máximo 40 e, com disponível 50, `excesso` e sugerida 0 | regra de tela |
| C-011 | parâmetro de produto cobertura 45 sobre fornecedor 20 → máximo 90 e sugerida 48; produto sem parâmetro próprio continua em 40 | regra de tela |
| C-012 | gravar silenciamento até hoje+30 e ler de volta a data e o motivo; a regra tira o produto de "a comprar" e o mantém em "todos"; restaurar apaga a data e o produto volta | regra de negócio + regra de tela |
| C-013 | consulta sem exclusão → venda 90; com a venda de 60 na lista de exclusão → venda 30 e consumo menor; a lista de desconsideradas traz 1 linha com o motivo; reconsiderar deixa a lista vazia e a venda volta a 90 | regra de negócio |
| C-014 | consumo total 2,0 e público 0,5, disponível 30: com licitação → máximo 70, sugerida 48, `baixa_exposicao`; sem licitação → consumo 1,5, máximo 52,5, sugerida 24, `adequado` | regra de tela |
| C-015 | 5 produtos com valores 500, 250, 150, 70 e 30 → A, A, B, C, C | regra de tela |
| C-016 | sem parâmetro nenhum, alvo da curva A = 35 → máximo 70; curva B = 45 → 90; curva C = 60 → 120; sem regra alcançável → 35 | regra de tela |
| C-017 | sugestão 48 e caixa 12: quantidade digitada 50 → 60; digitada 48 → 48; digitada 0 → 0 | regra de tela |
| C-018 | criar o pedido a partir de um carrinho de 3 itens (um em ruptura) devolve 1 card na fase de análise, com origem `compras_inteligentes`, prioridade `alta`, período da janela, 3 itens gravados com quantidade pedida, sugerida, custo e curva, e valor total igual à soma | regra de negócio |
| C-019 | com pedido do mesmo fornecedor e filial na fase de análise, a consulta de pedido aberto devolve 1 linha com o título e a fase; com o pedido em "enviado", devolve 0 | regra de negócio |
| C-020 | pedido nascido do carrinho com quantidade 24 no produto X: depois de montar a análise, o produto X continua com 24 e os demais entram com 0 | regra de tela |
| C-021 | as três consultas do detalhe devolvem contagem > 0 para um produto semeado: 12 linhas de histórico mensal no máximo, ao menos 1 compra e ao menos 2 filiais com estoque | regra de negócio |
| C-022 | 5 itens com sugerida 100 e pedidas 100, 80, 120, 79, 121 → aderência 60 %, tanto na regra de tela quanto na apuração do servidor sobre os mesmos itens | regra de tela + regra de negócio |
| C-023 | a matriz devolve ver para admin, analista, gestor e diretoria e não para comercial; operar só para admin, analista e gestor e zerado em somente-leitura; parametrizar só admin e gestor; a gravação de parâmetro feita por analista não grava nada e feita por gestor grava | regra de tela + regra de negócio |
| C-024 | a exportação de 3 linhas filtradas produz cabeçalho com 10 colunas e 3 linhas, com ponto e vírgula e aspas escapadas | regra de tela |
| C-025 | consumo 0 e disponível 40 → `excesso`, sugerida 0, cobertura atual e gatilho nulos | regra de tela |
| RN-001 | pesos: dia do fim = 1; um dia antes = 0,85; dois = 0,7225; janela de 2 dias com vendas 10 e 10 → consumo 10 | regra de negócio |
| RN-002 | total 100, bloqueado 10, avariado 5, reservado 5 → disponível 80; total 5 e reservado 20 → disponível 0; pedido 3 + trânsito 7 → trânsito 10 | regra de negócio |
| RN-003 | produto 45, fornecedor 20, medido 5 → 45; sem o do produto → 20; sem os dois → 5; sem os três → 9 | regra de tela |
| RN-004 | produto 45, fornecedor 20, alvo da curva 35 → 45; sem o do produto → 20; sem os dois → 35 | regra de tela |
| RN-005 | produto 5, fornecedor 10 → 5; sem o do produto → 10; sem os dois → 15; gatilho 7 com parâmetro 15 é urgente, gatilho 32 não é | regra de tela |
| RN-006 | lead 9, consumo 2, cobertura 35 → 18, 36 e 70; consumo 0 → 0, 0 e 0 | regra de tela |
| RN-007 | (máximo 70, disponível 50, trânsito 0, caixa 12) → 24; trânsito 20 → 0; venda 0 e consumo 0 → 0; máximo 10 e disponível 50 → 0; caixa 1 → 20 | regra de tela |
| RN-008 | (disponível 50, trânsito 0, segurança 18, consumo 2, lead 9) → cobertura 25 e gatilho 7; consumo 0 → os dois nulos | regra de tela |
| RN-009 | a ordem é testada uma a uma: disponível 0 com máximo 0 → `ruptura` (não `excesso`); disponível 10 com cobertura 5 e lead 9 → `elevada_exposicao` (não `baixa_exposicao`) | regra de tela |
| RN-010 | lista vazia → mapa vazio; todos com custo 0 → todos C | regra de tela |
| RN-011 | a consulta devolve venda pública 6 dentro de venda total 18 e consumo público dentro do consumo total; a regra subtrai um do outro e nunca fica negativa | regra de negócio + regra de tela |
| RN-012 | a exclusão acontece na consulta: com a venda na lista, ela não aparece em nenhuma das colunas de venda nem no consumo | regra de negócio |
| RN-013 | silenciado até amanhã com hoje → silenciado; até ontem → não; data vazia → não | regra de tela |
| RN-014 | a consulta não traz produto marcado como inativo nem de departamento 4 ou 7; venda com quantidade negativa não entra | regra de negócio |
| RN-015 | 3 itens do mesmo fornecedor e filial com 1 em ruptura → 1 grupo, prioridade `alta`; sem ruptura → `normal`; 2 filiais → 2 grupos | regra de tela |
| RN-016 | a consulta lista pedido nas fases análise, técnica, diretoria e envio, e não lista nas fases enviado, trânsito, faturamento, B.O., concluído e cancelado | regra de negócio |
| RN-017 | mesclar a lista montada com a existente mantém a quantidade da existente e zera só as novas | regra de tela |
| RN-018 | (100, 100) → aderente; (100, 80) → aderente; (100, 120) → aderente; (100, 79) → não; (100, 121) → não; (0, 10) → não | regra de tela |
| RN-019 | a matriz de C-023, perfil a perfil e nível a nível | regra de tela |

- O que só olho humano verifica fica em **Verificação manual**:
  - [ ] C-001 — a lista com 300 produtos rola sem travar, com os números alinhados à direita e o código do produto discreto
  - [ ] C-002 a C-006 — a situação aparece com ponto **e** texto, legível nos dois temas, sem depender só da cor
  - [ ] C-012 — o produto silenciado aparece marcado na aba "todos", com o motivo no rótulo
  - [ ] C-018 — o pedido criado abre no quadro com os itens já dentro
  - [ ] C-023 — quem só lê vê os controles desabilitados, com o motivo, nunca escondidos

## Fora de escopo

- [ ] **Previsão de demanda** (modelos estatísticos, corte de outlier, escolha por menor erro) — dívida registrada para a onda 5; aqui a projeção é a tendência ponderada de RN-001.
- [ ] **Estoque de segurança estatístico** (fator de serviço sobre a volatilidade) — a volatilidade é medida e mostrada, mas não entra na fórmula; dívida registrada.
- [ ] **Oportunidades de custo especial** e políticas de preço por cliente — dependem do módulo de custos.
- [ ] **Diálogo de bloqueios de lote.**
- [ ] **Exportação para o ERP** ("gerar exportação WinThor") — nunca existiu de fato no sistema antigo.
- [ ] **Planilha (xlsx) e PDF** — a exportação é em texto separado por ponto e vírgula, como nas demais telas.
- [ ] **Curva por rentabilidade e "a pior das duas"** — a curva é uma só, a mesma da montagem do pedido.
- [ ] **Custo padrão vindo da gestão de custos** — o custo é o da última entrada, como na montagem; dívida registrada.
- [ ] **"Completar compra"** (sugestão complementar para atingir pedido mínimo) e **pedido mínimo por fornecedor.**
- [ ] **Bloco novo no card do pedido** — esta tela existe antes do pedido; o único ponto de contato é a criação pelo carrinho.
- [ ] **Alterar o alvo e a tolerância por curva** — é a tela de coberturas (spec 012); aqui a curva só é consumida.
- [ ] **Sugerir de qual fornecedor comprar hoje** (o painel comparativo entre fornecedores) — fornecedor e filial continuam sendo escolha de quem abre a tela.

## Pendências

Cada item aqui **bloqueia** o `plan.md`.

- Nenhuma.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-019, C-023, C-025)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto
