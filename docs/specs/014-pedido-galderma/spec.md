# Spec: Pedido Galderma — mesa de negociação, acompanhamento e composição

**ID:** 014-pedido-galderma · **Status:** rascunho (perguntas abertas na seção *Perguntas ao usuário*) · **Data:** 2026-11-03

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.
>
> Origem: o módulo Galderma do sistema antigo (mesa de negociação, acompanhamento
> e composição por filial), regras `18-pedido-galderma.md` e
> `19-acompanhamento-galderma.md` do legado, conferidas contra o código vivo. É a
> onda 5 do mapa (O5-05 de `regras.md`: "Manter").

## Problema

A Galderma não compra como os outros fornecedores. Todo mês a indústria manda uma
**proposta**: por produto, quanto ela espera vender ao consumidor final (sell-out),
quanto quer que a Benenutri compre (sell-in) e a que preços (sell-out, net, lista e
lista com desconto). A compradora precisa decidir, **filial por filial**, quanto
pedir de cada produto, olhando ao mesmo tempo o que a indústria propôs, o que já foi
comprado no mês, o estoque e o giro de cada filial — e chegar a um total que não
fuja demais da proposta.

Hoje isso vive numa planilha mensal que se copia de um mês para o outro: o estoque e
a venda são colados à mão, a conta de cobertura é refeita por quem digita, o pedido
de cada filial é redigitado no quadro de compras, e no mês seguinte ninguém sabe ao
certo quanto da proposta foi cumprido, nem quanto do sell-out a indústria esperava
contra o que de fato vendeu.

## Resultado esperado

Uma tela de **negociação mensal** com a proposta da indústria (importada da planilha
dela ou digitada), a posição de cada filial lida do ERP na hora (estoque disponível,
trânsito, venda do mês, giro do trimestre anterior, compra do mês) e um campo de
pedido por filial — com sugestão pela cobertura alvo, simulação instantânea do saldo
e da cobertura futura, e trava de caixa fechada. Quando a decisão está tomada, um
botão gera **um pedido de compra por filial** no quadro de compras, já na Análise,
com os itens e os preços negociados; a negociação fica fechada para sempre.

Ao lado, duas leituras de acompanhamento: o **acompanhamento mensal** (proposta ×
realizado por produto, sell-out com meta e semáforo, sell-in proposto × pedido
enviado, com o sell-out da meta ajustável e auditado) e a **composição por filial**
(quanto de compra e de venda cada filial representa, e o estoque de agora a custo).

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| analista (comprador) | abrir a negociação do mês, importar a proposta, decidir o pedido por filial, gerar os pedidos, lançar o sell-out ajustado, acompanhar | mensal (negociação) · semanal (acompanhamento) |
| gestor (gerência de compras) | o mesmo do analista, e conferir o histórico de decisões | mensal |
| admin (TI) | o mesmo, e corrigir negociação errada | eventual |
| diretoria | ler a negociação, o acompanhamento e a composição | mensal |

O **nível de acesso** da plataforma continua valendo acima do perfil: quem tem
acesso somente-leitura vê tudo e não grava nada. O perfil **comercial** não vê o
módulo (P-03 de `regras.md`: "Comercial não vê … Galderma").

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa. Os números de
exemplo são os casos verificados do sistema antigo.

### Mesa de negociação

**C-001 — Abrir a negociação do mês**
- **Dado que** a compradora abre uma negociação nova sem mexer em nada
- **Quando** ela confere o formulário
- **Então** a competência é o mês corrente, a data do pedido é hoje, a descrição é "Pedido Galderma AAAA-MM", a cobertura alvo é 35 dias, "considerar o trânsito como compra do mês" vem desmarcado e as filiais com estoque ou venda Galderma vêm marcadas
- **E quando** ela desmarca todas as filiais e salva
- **Então** a negociação não é criada e a tela diz "Selecione ao menos uma filial — o pedido é digitado por filial."

**C-002 — A posição de cada filial vem do ERP, nunca digitada**
- **Dado que** a filial 1 tem 150 unidades físicas de um produto, 10 bloqueadas e 8 reservadas, 20 em pedido de compra pendente e 5 em trânsito
- **Quando** a negociação carrega
- **Então** o estoque mostrado é **132** (físico − bloqueado − reservado, nunca negativo), com o físico ao lado, o trânsito é **25** (pedido pendente + trânsito) e o estoque total é **157**

**C-003 — Venda do mês e giro do trimestre anterior, só a venda válida**
- **Dado que** a competência é 2026-08 e a filial 1 vendeu, de 01/05 a 31/07, 900 unidades a clientes comuns, mais 40 a órgão público, 30 a outra filial do grupo e 20 em remessa de entrega futura
- **Quando** a negociação carrega
- **Então** a venda do trimestre é **900**, a média mensal **300**, a média diária **10**, e o que foi vendido em agosto até agora aparece como venda do mês, pelo mesmo recorte

**C-004 — Sugestão pela cobertura alvo**
- **Dado que** a filial tem estoque disponível 132, nenhum trânsito, 900 vendidos no trimestre e cobertura alvo de 35 dias
- **Quando** a linha da filial é calculada
- **Então** a cobertura atual é **13,2 dias**, a sugestão é **218** unidades (10 × 35 − 132, arredondado para cima) e, pedindo 218, a cobertura futura fica em **35 dias**

**C-005 — Saldo a comprar contra a proposta**
- **Dado que** a proposta de sell-in de um produto é 1.440 e as filiais já compraram 1.080 no mês
- **Quando** o grupo é consolidado
- **Então** o saldo a comprar é **360**
- **E quando** a negociação considera o trânsito como compra e há 70 em trânsito
- **Então** o saldo é **290**
- **E quando**, além disso, a negociação é filha de outra que já pediu 150 desse produto
- **Então** o saldo é **140** (1.440 − 1.080 − 70 − 150)

**C-006 — Pedido só em caixa fechada**
- **Dado que** o produto vem em caixas de 12
- **Quando** a compradora digita 25 e confirma
- **Então** nada é gravado e a tela diz "múltiplo de 12 · use 24"; com 31 sugere 36, com 3 sugere 12; com 24 grava

**C-007 — Simular não grava; confirmar grava e deixa rastro**
- **Dado que** a filial 1 tinha 120 gravados num produto
- **Quando** a compradora digita 144, sem sair do campo
- **Então** o saldo simulado, a cobertura futura e os valores em reais mudam na hora, e nada é gravado
- **E quando** ela confirma (sai do campo ou Enter)
- **Então** o pedido vira 144 e o histórico de decisões ganha uma linha "Produto · Filial — de 120 para 144", com quem e quando
- **E quando** ela confirma de novo o mesmo 144
- **Então** nada é gravado e nenhuma linha nova aparece no histórico

**C-008 — Usar a sugestão respeita a caixa** *(provisório — pergunta P-04)*
- **Dado que** a sugestão da filial é 218 e o produto vem em caixas de 12
- **Quando** a compradora clica em "usar sugestão"
- **Então** o pedido gravado é **228** (a caixa fechada logo acima), nunca 218

**C-009 — Importar a planilha da indústria**
- **Dado que** a planilha da Galderma tem duas linhas de cabeçalho, uma linha com EAN de 13 dígitos de um produto cadastrado, uma com EAN que o ERP não conhece e uma linha de total sem EAN, com números como " R$ 1,184.02 " e " 8,857 "
- **Quando** a compradora importa
- **Então** o resumo diz "3 linhas lidas · 1 gravada · 1 sem produto" (a linha sem EAN não conta), o EAN desconhecido aparece com o SKU da planilha, e o item gravado tem preço 1184,02 e quantidade 8857

**C-010 — Reimportar não apaga o que foi digitado à mão** *(provisório — pergunta P-05)*
- **Dado que** um item tem preço de lista, meta de sell-in e observação digitados à mão
- **Quando** a planilha é importada de novo
- **Então** os números que a planilha traz são atualizados e o preço de lista, a meta de sell-in e a observação continuam como estavam

**C-011 — O modelo da planilha volta pelo importador**
- **Dado que** a compradora baixa o modelo da competência 2026-08
- **Quando** ela preenche e importa o próprio modelo
- **Então** cada produto Galderma com EAN volta casado ao seu produto, sem nenhuma coluna trocada

**C-012 — Um produto só uma vez; todo item tem produto**
- **Dado que** o produto 1818 já está na negociação
- **Quando** a compradora tenta incluí-lo de novo, ou salvar um item sem escolher o produto
- **Então** o 1818 não aparece na lista de escolha e o item sem produto é recusado com "Selecione o produto no cadastro do ERP — todo item precisa de código."

**C-013 — Fechar, reabrir, excluir**
- **Dado que** a negociação está aberta
- **Quando** a compradora fecha
- **Então** itens e pedidos por filial ficam somente-leitura, e o cabeçalho (inclusive o trânsito como compra) continua editável *(provisório — pergunta P-06)*; reabrir devolve tudo a editável
- **E quando** ela exclui uma negociação que nunca gerou pedido
- **Então** a negociação, os itens e os pedidos por filial somem; o histórico de decisões fica

**C-014 — Gerar os pedidos no quadro de compras**
- **Dado que** a negociação tem pedido gravado maior que zero nas filiais 1 e 2 e nada na filial 6
- **Quando** a compradora clica em "Gerar pedidos", confere a janela (filial, produtos, unidades, valor) e confirma
- **Então** nascem **dois** pedidos no quadro, um da filial 1 e um da filial 2, na fase de Análise, fornecedor Galderma, com os itens e as quantidades gravadas, o preço com desconto da proposta como custo *(provisório — pergunta P-01)* e o valor total na capa
- **E** a negociação fica **convertida**: nenhum botão de escrita, nenhum campo editável, e uma faixa "Convertida em pedido" com o número de cada pedido

**C-015 — Só o que foi gravado vai para o pedido**
- **Dado que** a compradora digitou 25 numa filial (fora da caixa, recusado) sobre 24 gravados
- **Quando** ela gera os pedidos
- **Então** o pedido nasce com **24**, o valor gravado, e nunca com a simulação

**C-016 — Gerar de novo depois de uma falha não duplica**
- **Dado que** a geração criou o pedido da filial 1 e falhou antes do da filial 2
- **Quando** a compradora clica em "Gerar pedidos" de novo
- **Então** só o da filial 2 nasce, a janela avisa "filial 1 já gerada" e a negociação passa a convertida; nunca existem dois pedidos da mesma negociação para a mesma filial

**C-017 — Convertida não volta**
- **Dado que** a negociação está convertida
- **Quando** alguém tenta reabrir, editar o cabeçalho, mudar um item ou um pedido por filial, por qualquer caminho
- **Então** nada muda: a recusa vale também no servidor *(provisório — pergunta P-07)*

**C-018 — Negociação complementar herda o que já foi pedido**
- **Dado que** a negociação de agosto foi convertida com 150 unidades de um produto na filial 1
- **Quando** a compradora cria uma negociação nova de agosto "a partir de" ela
- **Então** a sugestão da filial 1 cai 150 unidades e o saldo a comprar do produto cai 150 (C-005)
- **E quando** ela tenta criar uma segunda negociação a partir da mesma *(provisório — pergunta P-08)*
- **Então** a negociação de origem não aparece mais como opção: uma de origem serve a uma complementar só

**C-019 — Valores da negociação em reais**
- **Dado que** um produto tem proposta de sell-in 100, preço net 10, preço de lista com desconto 12, sem preço de lista cheio e sem meta digitada, e 20 unidades compradas e 30 vendidas no mês a preço de sell-out 50
- **Quando** a compradora pede 60
- **Então** a meta de sell-in é **R$ 1.200** (100 × 12), o comprado no mês **R$ 240**, falta comprar **R$ 960**, o pedido a preço net **R$ 600**, a preço de lista cheio **R$ 720** (sem lista cheio vale a com desconto), com desconto **R$ 720** e o vendido no mês **R$ 1.500**

**C-020 — Semáforo da cobertura, sempre com texto**
- **Dado que** a cobertura alvo é 35 dias
- **Quando** a cobertura de uma filial é 0, 10, 35 ou 80 dias, ou a filial não tem giro
- **Então** a filial aparece como **ruptura**, **atenção** (abaixo da metade do alvo), **adequado**, **excesso** (acima do dobro do alvo) ou **sem giro**, escrito ao lado do número

**C-021 — Extrato por filial e arquivo**
- **Dado que** a negociação tem pedido nas filiais 1 e 2
- **Quando** a compradora abre o extrato ou exporta
- **Então** o extrato mostra um bloco por filial com pedido (código, produto, quantidade, preço com desconto, valor e total) e o arquivo traz uma linha por produto × filial com estoque, trânsito, venda do mês, previsão de sell-out, média do trimestre, coberturas, sugestão, pedido, proposta e saldos

### Acompanhamento mensal

**C-022 — Proposta contra realizado, por produto e mês**
- **Dado que** em agosto a proposta de sell-out de um produto foi 200 e as filiais venderam 150, e a proposta de sell-in foi 300 e o pedido enviado somou 240
- **Quando** a compradora abre o acompanhamento em agosto
- **Então** o sell-out está em **75 %** da meta (**atenção**, entre 70 e 99 %), faltam **25 %**, o sell-in está em **80 %**, faltam **60 unidades** e o valor delas a preço com desconto

**C-023 — Ajustar o sell-out da meta deixa rastro**
- **Dado que** a meta de sell-out de agosto veio da mesa com 200
- **Quando** a compradora lança 180
- **Então** a meta passa a 180, o percentual e o semáforo se recalculam e o histórico do sell-out ganha "de 200 (mesa) para 180", com quem e quando; a proposta da mesa não muda
- **E quando** ela apaga o lançamento
- **Então** a meta volta a 200 e o histórico ganha "lançamento removido (era 180)"

**C-024 — Média do trimestre pelo ERP**
- **Dado que** o acompanhamento mostra de junho a agosto
- **Quando** a tabela de junho é aberta
- **Então** a média do trimestre pelo ERP de junho usa março, abril e maio, mesmo esses meses estando fora do período, e esses meses não viram linha, ponto de gráfico nem opção de filial

**C-025 — Totais pela razão das somas**
- **Dado que** um produto tem meta 100 e vendeu 50, outro não tem meta e vendeu 30
- **Quando** o total é calculado
- **Então** o realizado total é 80, a meta total 100 e o percentual total **80 %** (soma do realizado sobre soma da meta), nunca a média dos percentuais

**C-026 — Estoque inicial reconstruído contra o informado**
- **Dado que** a Galderma informou estoque inicial 210 para um produto e o ERP reconstrói 202 (estoque de hoje menos as entradas mais as saídas desde o início do mês, sem cancelados)
- **Quando** a compradora passa o mouse na célula
- **Então** vê "−8 em relação ao que a Galderma informou (210)"; igual, "Bate com o que a Galderma informou."

**C-027 — Negociação complementar não duplica a meta** *(provisório — pergunta P-09)*
- **Dado que** agosto tem a negociação de origem com proposta 300 e uma complementar com proposta 100 para o mesmo produto
- **Quando** o acompanhamento de agosto soma as propostas
- **Então** a meta de sell-in e de sell-out é a da negociação de origem (300) e o pedido enviado soma as duas

**C-028 — Mês sem negociação com meta lançada continua aparecendo**
- **Dado que** setembro não teve negociação e a compradora lançou meta de sell-out para um produto
- **Quando** o acompanhamento mostra setembro
- **Então** a linha do produto aparece, com a meta lançada e o realizado, marcada "sem meta da mesa"

### Composição por filial

**C-029 — Quanto cada filial representa**
- **Dado que** no período a filial 1 comprou R$ 60 mil e a filial 2 R$ 40 mil da Galderma, e venderam R$ 30 mil e R$ 10 mil
- **Quando** a compradora abre a composição em reais, por filial
- **Então** o sell-in mostra 60 % e 40 %, as vendas 75 % e 25 %, cada barra com o seu valor; em "grupo", uma linha só com os totais; em unidades, as mesmas contas em unidades

**C-030 — Estoque de agora a custo padrão**
- **Dado que** a filial 1 tem 100 unidades disponíveis (120 físicas) de um produto cujo custo padrão no Gestão de Custos é R$ 50
- **Quando** a composição carrega
- **Então** o painel de estoque mostra R$ 5.000 disponível e R$ 6.000 físico, com o aviso "Posição de agora — não acompanha o período filtrado"; produto sem custo aparece como "Sem custo" e não soma; se o Gestão de Custos não responder, "Erro custo" e nenhum valor em reais

### Acesso

**C-031 — Quem opera, quem lê, quem não entra**
- **Dado que** um comercial abre o endereço do módulo, uma diretora abre a negociação e um analista com acesso somente-leitura também
- **Quando** cada um tenta operar
- **Então** o comercial recebe recusa de acesso e não vê nada; a diretora e o analista somente-leitura veem tudo, com todos os controles de escrita desabilitados *(diretoria: provisório — pergunta P-10)*; e o servidor recusa qualquer escrita dos três

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | A negociação DEVE ser exclusiva da Galderma, mensal, com competência, data, descrição, filiais participantes, cobertura alvo, "trânsito como compra", meta de sell-out em reais e observação | C-001 | must |
| RF-002 | A posição de cada produto × filial DEVE vir do ERP na abertura e no botão "Atualizar": estoque disponível e físico, bloqueado, reservado, trânsito, venda do mês, venda do trimestre anterior e compra do mês | C-002, C-003 | must |
| RF-003 | A venda DEVE seguir o recorte de venda válida do sistema, sem órgão público, sem venda entre filiais e sem remessa de entrega futura | C-003 | must |
| RF-004 | A linha de cada filial e o consolidado do produto DEVEM ser calculados como nas regras RN-001..RN-006 | C-004, C-005 | must |
| RF-005 | O pedido por filial DEVE ser o único número digitável da decisão, aceitar só caixa fechada e simular sem gravar até ser confirmado | C-006, C-007 | must |
| RF-006 | Cada mudança efetiva de pedido por filial DEVE gerar uma linha de histórico com antes, depois, quem e quando, consultável na tela | C-007 | must |
| RF-007 | Os itens da proposta DEVEM poder ser digitados um a um ou importados da planilha da indústria, casando pelo EAN, com relatório do que não casou | C-009, C-010, C-012 | must |
| RF-008 | A tela DEVE oferecer o modelo da planilha da competência, lido de volta pelo importador | C-011 | should |
| RF-009 | A negociação DEVE poder ser fechada, reaberta e excluída enquanto não for convertida | C-013 | must |
| RF-010 | "Gerar pedidos" DEVE criar um pedido de compra por filial com pedido gravado maior que zero, no quadro de compras, na Análise, e converter a negociação | C-014, C-015 | must |
| RF-011 | A geração DEVE ser retomável e nunca criar dois pedidos para a mesma negociação e filial | C-016 | must |
| RF-012 | Negociação convertida DEVE ser somente-leitura para sempre, também no servidor | C-017 | must |
| RF-013 | Uma negociação complementar DEVE herdar, por produto × filial, o que a de origem pediu | C-018 | must |
| RF-014 | A tela DEVE mostrar os valores da negociação em reais (meta de sell-in e de sell-out, comprado, falta comprar, pedido nas três bases de preço, vendido) e os indicadores do topo | C-019 | must |
| RF-015 | A cobertura DEVE ter semáforo por texto, nunca só por cor | C-020 | must |
| RF-016 | A tela DEVE ter extrato por filial e exportar um arquivo simples de planilha | C-021 | should |
| RF-017 | O acompanhamento DEVE mostrar, por produto e competência, proposta × realizado de sell-out e de sell-in, com percentuais, faltas, semáforo de meta e totais | C-022, C-025 | must |
| RF-018 | A meta de sell-out DEVE poder ser ajustada por produto e competência sem tocar a proposta da mesa, com histórico auditável | C-023 | must |
| RF-019 | O acompanhamento DEVE mostrar a média do trimestre pelo ERP e o estoque inicial reconstruído, com a diferença contra o informado | C-024, C-026 | must |
| RF-020 | O acompanhamento DEVE ter filtros de competência final, período (3, 6, 12, 24 meses), filial e produto, uma competência por vez na tabela, gráficos do período e blocos de colunas que se escondem | C-022, C-024 | must |
| RF-021 | A composição DEVE mostrar compra e venda por filial (ou grupo), em reais ou unidades, com participação, e o estoque de agora a custo padrão | C-029, C-030 | must |
| RF-022 | O módulo DEVE ser operado por admin, analista e gestor, lido pela diretoria e por quem tem acesso somente-leitura, e invisível ao comercial | C-031 | must |
| RF-023 | Todo gráfico DEVE mostrar o valor de cada barra e de cada ponto | verificação manual | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Abrir a mesa custa **3** chamadas (negociações, filiais, identidade); escolher uma negociação custa no máximo **7** (itens, pedidos por filial, posição do ERP, caixas, custo padrão, herdado, pedidos gerados) | Contador de chamadas ao abrir e ao trocar de negociação |
| RNF-002 | Digitar o pedido não custa chamada nenhuma; confirmar custa **2** (gravação e histórico); confirmar o mesmo valor custa **0** | Contador ao digitar e confirmar |
| RNF-003 | Gerar os pedidos custa **4 por filial** (criar o pedido, o vínculo, a capa, os itens) mais **3** (a leitura do quadro, os pedidos já gerados e a conversão) | Contador numa geração de 3 filiais: 15 |
| RNF-004 | Abrir o acompanhamento custa **5** chamadas (histórico da mesa, realizado do ERP, metas lançadas, filiais, estoque inicial); a composição **3** (composição, estoque, custo padrão) | Contador ao abrir cada tela |
| RNF-005 | Importar uma planilha de N linhas custa **1** leitura do catálogo e **1** gravação por linha casada | Contador numa importação de 21 linhas |
| RNF-006 | Uma escrita recusada por permissão ou por negociação convertida não deixa linha de histórico | Tentativa como diretora e sobre convertida: zero linha nova |

## Entidades do domínio

- **Negociação** — a mesa de um mês com a Galderma: competência, filiais, cobertura alvo, se o trânsito conta como compra, meta de sell-out em reais e a situação (aberta, fechada, convertida). Pode ser complementar de outra da mesma competência.
- **Item da proposta** — um produto da negociação com o que a indústria propôs: preços (sell-out, net, lista, lista com desconto), estoque inicial informado, média de sell-out, previsão de sell-out, proposta de sell-in, meta de sell-in em reais e observação.
- **Pedido por filial** — a decisão: quantas unidades de um item a filial pede.
- **Posição da filial** — o que o ERP sabe do produto na filial: estoque, trânsito, venda, compra. Nunca digitada.
- **Histórico de decisões** — uma linha por mudança efetiva de pedido por filial.
- **Pedido gerado** — o vínculo entre a negociação, a filial e o pedido de compra que nasceu no quadro.
- **Meta de sell-out lançada** — o ajuste da previsão de sell-out por produto e competência, que prevalece sobre a da mesa; com o seu histórico.

## Regras de negócio

- **RN-001 — Linha da filial.** Estoque total = disponível + trânsito. Média mensal = venda do trimestre ÷ 3; média diária = venda do trimestre ÷ 90. Falta vender = média mensal − venda do mês; estoque líquido = estoque total − falta vender. Cobertura = estoque total ÷ média diária ("sem giro" sem média). Sugestão = máximo(0, arredondado para cima(média diária × alvo − estoque total) − herdado). Cobertura futura = (estoque total + pedido) ÷ média diária. Custo do pedido = preço com desconto × pedido. Venda sempre em valor absoluto.
- **RN-002 — Consolidado do produto.** Soma das filiais, exceto a falta vender, que é previsão de sell-out − venda do mês do grupo. Saldo a comprar = proposta de sell-in − (compra do mês + trânsito, se a negociação considera o trânsito) − herdado. Saldo simulado = saldo − pedido total (pode ser negativo). Desvio = pedido total − saldo. Cobertura e cobertura futura sobre as somas.
- **RN-003 — Caixa fechada.** Pedido é múltiplo das unidades por caixa (caixa ≤ 1 = avulso). Fora do múltiplo, a sugestão é o múltiplo mais próximo, nunca abaixo de uma caixa (25/12 → 24; 31/12 → 36; 3/12 → 12; 0 → 0). As unidades por caixa vêm do Gestão de Custos, depois do cadastro do ERP, depois da embalagem — a mesma cadeia do pedido de compra.
- **RN-004 — Semáforo da cobertura.** Sem giro; ≤ 0 ruptura; abaixo da metade do alvo atenção; acima do dobro do alvo excesso; senão adequado.
- **RN-005 — Períodos.** Mês = do dia 1 ao último dia da competência; trimestre = os três meses anteriores à competência (2026-08 → 01/05 a 31/07). O corte é o dia inteiro, inclusive o último.
- **RN-006 — Valores em reais.** Meta de sell-in do item = a digitada, ou proposta × (preço com desconto, ou net). Preço de lista cheio = o de lista, ou o com desconto. Pedido em três bases (net, lista cheio, com desconto); comprado no mês = compra × preço com desconto; vendido no mês = venda × preço de sell-out; falta comprar = meta − comprado.
- **RN-007 — Situação da negociação.** Aberta ⇄ fechada; aberta ou fechada → convertida, só pela geração completa dos pedidos; convertida é terminal. Excluir só antes de convertida.
- **RN-008 — Herdado.** A complementar soma, por produto × filial, o pedido gravado da de origem (um nível); a de origem precisa estar convertida e ser da mesma competência.
- **RN-009 — Geração dos pedidos.** Um pedido por filial com pedido **gravado** > 0, na fase de Análise, fornecedor Galderma, prioridade normal, período dos três meses anteriores até hoje, itens com quantidade pedida = sugerida = pedido gravado e custo = preço com desconto. Filial já gerada é pulada. A negociação só converte quando nenhuma filial com pedido ficou pendente.
- **RN-010 — Importação.** Aba "Planilha1" (ou a primeira); duas linhas de cabeçalho; linha válida = EAN com 8 ou mais dígitos; colunas por posição (EAN, SKU, preço sell-out, preço net, preço com desconto, estoque inicial, média de sell-out, previsão de sell-out, proposta de sell-in); números no formato americano, "R$", espaços e vírgula de milhar saem, vazio e traço viram 0.
- **RN-011 — Meta de sell-out.** Meta em vigor = a lançada, ou a previsão da mesa. Percentual = realizado ÷ meta × 100, sem número quando não há meta. Semáforo: ≥ 100 % dentro; ≥ 70 % atenção; < 70 % abaixo; sem meta. Falta % = máximo(0, 100 − percentual).
- **RN-012 — Acompanhamento.** Por produto e competência: a proposta da mesa (preços, estoque inicial informado, previsão e proposta), o pedido enviado (soma dos pedidos por filial), o realizado do ERP (venda válida e compra, em unidades e reais) das filiais filtradas e a meta lançada. A linha existe se há proposta, realizado ou meta lançada. Média do trimestre pelo ERP = venda dos três meses anteriores ÷ 3. Sell-in: percentual = pedido enviado ÷ proposta; falta = máximo(0, proposta − pedido enviado), em unidades e a preço com desconto. Totais pela razão das somas.
- **RN-013 — Estoque inicial reconstruído.** Estoque físico de hoje − entradas + saídas físicas desde o primeiro dia da competência, sem movimento cancelado; a nota de venda de entrega futura não conta como saída física (quem tira do estoque é a remessa).
- **RN-014 — Composição.** Sell-in = compras do ERP; vendas = venda válida sem órgão público; em reais (quantidade × preço) ou unidades; por filial ou grupo; participação = parte ÷ total. Estoque de agora: disponível e físico por filial, a custo padrão do Gestão de Custos.
- **RN-015 — Quem.** Operam admin, analista e gestor; leem também diretoria; comercial não vê. Somente-leitura vê e não grava. O servidor recusa a escrita de quem não pode e toda escrita sobre negociação convertida.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | cabeçalho padrão (competência do mês, hoje, "Pedido Galderma AAAA-MM", 35, desmarcado); validação recusa zero filiais com a frase; a gravação devolve a negociação aberta | regra de tela + regra de negócio |
| C-002 | produto com físico 150, bloqueado 10, reservado 8, pedido pendente 20, trânsito 5 → disponível 132, físico 150, trânsito 25, total 157 | regra de negócio |
| C-003 | trimestre de 2026-08 = 2026-05-01..2026-07-31; venda de 900 comuns + 40 públicas + 30 a filial + 20 em remessa → 900 | regra de tela + regra de negócio |
| C-004 | (132, 0, 900, 35) → cobertura 13,2, sugestão 218; pedido 218 → cobertura futura 35 | regra de tela |
| C-005 | 1440 − 1080 = 360; com trânsito 70 = 290; com herdado 150 = 140 | regra de tela |
| C-006 | (25, 12) recusa e sugere 24; 31 → 36; 3 → 12; 24 aceita | regra de tela |
| C-007 | simulação muda saldo e cobertura sem gravar; gravar 120 → 144 deixa uma linha de histórico com antes e depois; o mesmo valor não muda nada | regra de tela + regra de negócio |
| C-008 | sugestão 218 com caixa 12 → 228 | regra de tela |
| C-009 | parser: 3 lidas, 1 casada, 1 sem produto, " R$ 1,184.02 " → 1184,02, " 8,857 " → 8857; a gravação da linha casada aparece na listagem | regra de tela + regra de negócio |
| C-010 | importar sobre item com lista, meta e observação digitadas mantém os três e atualiza os números da planilha | regra de negócio |
| C-011 | as linhas do modelo, passadas pelo parser, voltam com o mesmo EAN e as mesmas colunas | regra de tela |
| C-012 | a lista de escolha tira os produtos já usados; item sem produto recusado; a mesma gravação duas vezes deixa um item só | regra de tela + regra de negócio |
| C-013 | fechar e reabrir mudam a situação; com fechada, gravar pedido por filial não muda nada; excluir apaga negociação, itens e pedidos por filial e mantém o histórico | regra de negócio |
| C-014 | montagem dos pedidos por filial (só filiais com pedido > 0, produtos por código, custo = preço com desconto); a capa nasce com origem Galderma; o vínculo e a conversão gravam | regra de tela + regra de negócio |
| C-015 | pedidos por filial montados de uma linha com simulação 25 sobre gravado 24 → 24 | regra de tela |
| C-016 | registrar a mesma filial duas vezes deixa um vínculo só; converter com filial pendente não converte | regra de negócio |
| C-017 | atualizar, mudar situação, gravar item e pedido por filial sobre convertida não alteram nada | regra de negócio |
| C-018 | o herdado soma o pedido da de origem por produto × filial; a de origem já usada não serve a outra complementar | regra de negócio |
| C-019 | os oito valores do cenário | regra de tela |
| C-020 | 0, 10, 35, 80 e sem giro → ruptura, atenção, adequado, excesso, sem giro | regra de tela |
| C-021 | extrato só com filiais com pedido, totais; linha do arquivo com as colunas do cenário | regra de tela |
| C-022 | 150/200 → 75 %, atenção, falta 25 %; sell-in 240/300 → 80 %, falta 60 | regra de tela |
| C-023 | lançar 180 sobre a mesa 200 grava a meta e o histórico com origem anterior "mesa"; apagar remove e registra "lançamento removido" | regra de tela + regra de negócio |
| C-024 | a média do trimestre de junho usa março a maio; meses fora do período não viram linha | regra de tela |
| C-025 | (100, 50) + (sem meta, 30) → 80 % | regra de tela |
| C-026 | a reconstrução do ERP devolve estoque inicial = hoje − entradas + saídas desde o início, sem cancelados nem nota de entrega futura; tooltip −8 / "Bate" | regra de negócio + regra de tela |
| C-027 | a leitura do acompanhamento com origem 300 e complementar 100 devolve proposta 300 e o pedido das duas | regra de negócio |
| C-028 | competência sem proposta, com meta lançada, gera a linha marcada | regra de tela |
| C-029 | composição por filial e grupo, em reais e unidades; participação 60/40 e 75/25 | regra de negócio + regra de tela |
| C-030 | estoque × custo padrão: 100 × 50 e 120 × 50; sem custo não soma; falha do custo → nenhum valor | regra de tela |
| C-031 | as escritas chamadas por diretora e comercial não alteram nada; por analista, alteram; a matriz dá ver a admin/analista/gestor/diretoria e operar a admin/analista/gestor, somente-leitura vê e não opera, comercial não vê | regra de negócio + regra de tela |
| RN-001..RN-006 | casos do sistema antigo: sugestão 218, cobertura futura 35, saldo 360/290, caixa 24/36/12/0, semáforo, períodos 2026-08 e cruzando o ano (2026-01 → 2025-10..2025-12) | regra de tela |
| RN-007 | aberta → fechada → aberta; convertida não volta; excluir convertida não apaga | regra de negócio |
| RN-008 | herdado de um nível e só de origem convertida da mesma competência | regra de negócio |
| RN-009 | ver C-014..C-016 | regra de tela + regra de negócio |
| RN-010 | ver C-009..C-011; aba "Planilha1" escolhida quando existe | regra de tela |
| RN-011 | percentual sem número com meta 0, negativa ou ausente; 100 → dentro, 70 → atenção, 69,9 → abaixo | regra de tela |
| RN-012 | união proposta ∪ realizado ∪ lançamento; filtro de filial; razão das somas | regra de tela |
| RN-013 | ver C-026 | regra de negócio |
| RN-014 | ver C-029, C-030 | regra de negócio + regra de tela |
| RN-015 | ver C-031 | regra de negócio + regra de tela |

- Consulta ao ERP real: cada leitura do ERP desta spec prova contagem > 0 para a Galderma.
- O que só olho humano verifica fica em **Verificação manual**:
  - [ ] RF-023 — cada barra e cada ponto dos gráficos com o seu valor escrito, nos dois temas
  - [ ] C-020 — semáforo com texto ao lado; nenhum estado só por cor
  - [ ] C-031 — controles de escrita desabilitados (não escondidos) para quem só lê, com o motivo visível
  - [ ] A mesa com 21 produtos × 3 filiais rola sem empurrar o cabeçalho; o bloco da filial abre e fecha

## Fora de escopo

- [ ] **Variação de sell-out mês a mês e o "Dentro do mês"** (ritmo diário, projeção de fechamento, meta vigente por dia) — o sistema antigo tem essa terceira tela; esta entrega traz o pedido, o acompanhamento e a composição *(pergunta P-11)*.
- [ ] **Valor faturado por nota fiscal** na negociação — no sistema antigo nunca foi feito; continua fora.
- [ ] **Observação por filial no pedido** — no sistema antigo o campo existia e nunca era gravado *(pergunta P-12)*.
- [ ] **Outros fornecedores na mesa** — a mesa é da Galderma; outro fornecedor com o mesmo modelo é outra spec.
- [ ] **Escrever no ERP** — a mesa gera pedido no quadro; o pedido no ERP segue o caminho de sempre do quadro.
- [ ] **Histórico de mudança de proposta, cabeçalho e situação** — o histórico registra o pedido por filial, como no sistema antigo *(pergunta P-13)*.
- [ ] **Gráfico de pizza ou rosca** na composição — o sistema visual não tem pizza em tela operacional; a participação é mostrada em barras com o percentual.
- [ ] **Planilha de escritório nativa** (importar e baixar o modelo no formato do Excel) — a entrada e o modelo são o arquivo simples de planilha (separado por ponto e vírgula), que o Excel abre e salva *(pergunta P-03)*.

## Perguntas ao usuário

Regras do sistema antigo que parecem erro ou que divergem do SGC 2. Cada uma tem um
**padrão provisório** (o que esta entrega faz até a resposta) e é barata de trocar.

| # | Pergunta | Padrão provisório |
|---|---|---|
| P-01 | O custo do item no pedido gerado é o **preço com desconto negociado** com a Galderma naquele mês (como no sistema antigo) ou o **custo padrão do Gestão de Custos** (R-128)? | preço com desconto negociado, marcado como preço especial no item |
| P-02 | A venda de **entrega futura**: o sistema antigo conta a quantidade na **remessa** (quando sai do estoque); o recorte de venda válida do SGC 2 (R-131) conta na **nota de venda** e tira a remessa. Muda o mês em que a venda aparece. Qual vale para a Galderma? | o da R-131 (nota de venda) |
| P-03 | A planilha da indústria e o modelo: aceitar só o arquivo simples (ponto e vírgula, que o Excel abre e salva) ou exigir o formato nativo do Excel, como no sistema antigo? | arquivo simples (nenhuma dependência nova) |
| P-04 | "Usar sugestão" no sistema antigo grava a sugestão crua, fora da caixa fechada. Arredondar para a caixa de cima? | arredonda para a caixa de cima |
| P-05 | Reimportar a planilha no sistema antigo zera preço de lista, meta de sell-in e observação digitados à mão. Preservar? | preserva |
| P-06 | Com a negociação **fechada**, o sistema antigo deixa editar o cabeçalho e o trânsito como compra (a spec antiga dizia que não). Qual vale? | cabeçalho editável, itens e pedidos travados (o código antigo) |
| P-07 | A conversão é irreversível só na tela, no sistema antigo. Travar também no servidor? | trava no servidor |
| P-08 | A mesma negociação de origem pode servir a várias complementares no sistema antigo, e o herdado é descontado em dobro. Uma de origem para uma complementar só? | uma só |
| P-09 | No acompanhamento, origem + complementar do mesmo mês somam a proposta e duplicam a meta. Usar só a proposta da de origem? | só a de origem; o pedido enviado soma as duas |
| P-10 | A **diretoria** opera a mesa no sistema antigo; no SGC 2 ela não cria pedido de compra. Ela só lê o módulo? | só lê |
| P-11 | A terceira tela do sistema antigo (variação de sell-out mês a mês e "dentro do mês") entra nesta onda ou fica para depois? | fica para depois |
| P-12 | A observação por filial, que nunca foi gravada no sistema antigo: some? | some |
| P-13 | O histórico registra só a mudança do pedido por filial. Registrar também mudanças de proposta, cabeçalho e situação? | só o pedido por filial |
| P-14 | A capa do pedido gerado leva a origem "galderma". Para não mexer na criação de pedido do quadro, a mesa grava a capa por um caminho próprio. Prefere que a criação de pedido do quadro passe a aceitar a origem "galderma"? | caminho próprio da mesa |

## Pendências

Cada item aqui **bloqueia** o `plan.md`.

- Nenhuma bloqueante: as perguntas acima têm padrão provisório reversível, aplicado nesta entrega e listado no relatório.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem caminhos de erro (C-001, C-006, C-012, C-016, C-017, C-031)
- [x] Seção "Testes" preenchida: todo C-0NN e toda RN-0NN com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto (as perguntas têm padrão provisório)
