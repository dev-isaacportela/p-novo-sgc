# Spec: Compras inteligentes — o que comprar hoje, por fornecedor e filial

**ID:** 011-compras-inteligentes · **Status:** rascunho · **Data:** 2026-09-16 · **Revisão:** 2026-10-30 (layout do sistema antigo, R-117)

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
- **E** o chip "Silenciados N" da lista mostra só os silenciados **em "Todos"** (ligá-lo troca a visão; clicar de novo volta à visão de antes; escolher um card desliga o filtro; com 0 ele não clica), e o painel de detalhe e a Análise do Produto mostram o bloco "Silenciado até dd/mm/aaaa · Motivo: …" (ou "Sem motivo informado") com "Devolver à fila" para quem parametriza

**C-013 — Venda atípica desconsiderada baixa o consumo**
- **Dado que** o produto vendeu 60 unidades num único dia para um cliente que não volta, e a compradora marca essa venda como desconsiderada com o motivo
- **Quando** a lista é recarregada
- **Então** a venda da janela cai **60 unidades**, o consumo diário cai, a sugestão cai junto, e a venda aparece na lista de desconsideradas com quem marcou e quando — até ela reconsiderar, quando tudo volta ao que era

**C-014 — Licitação dentro ou fora, por escolha de quem olha**
- **Dado que** o produto tem consumo diário de **2,0** no total, sendo **0,5** de vendas a órgãos públicos, e 30 em estoque disponível
- **Quando** a compradora liga "desconsiderar licitação"
- **Então** o consumo passa a **1,5**, o estoque máximo cai de 70 para **52,5**, a sugestão cai de 48 para **24** e a situação passa de baixa exposição para **adequado**; desligando o seletor, tudo volta

**C-015 — Duas curvas ABC, dentro do fornecedor e da filial, e a pior das duas vale**
- **Dado que** o fornecedor tem 5 produtos com faturamento na janela de R$ 500, R$ 250, R$ 150, R$ 70 e R$ 30 (total R$ 1.000) e rentabilidade de R$ 30, R$ 500, R$ 250, R$ 150 e R$ 70 (total R$ 1.000)
- **Quando** as curvas são calculadas
- **Então** pela curva de **faturamento** os dois primeiros são **A** (acumulado 50 % e 75 %), o terceiro é **B** (90 %) e os dois últimos são **C**; pela curva de **rentabilidade** o primeiro é **C** e os demais são **A, A, B, C**; a curva do produto — a que define o alvo de cobertura e viaja com o item do pedido — é a **pior das duas**: C, A, B, C, C. A lista mostra as duas letras lado a lado, com a que vale em destaque
- **E** se a consulta ainda não devolve faturamento e rentabilidade (função não republicada), as duas curvas são a antiga, venda × custo

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
- **Então** nasce **um** pedido na primeira fase do quadro, com o título no padrão do sistema, prioridade **alta** (por causa da ruptura), o período igual à janela da tela, o valor total do carrinho na capa e os 3 itens já na lista **completos** — quantidade escolhida, quantidade sugerida, custo, curva, descrição, embalagem, unidade, departamento, seção, unidades por caixa, venda, estoque, trânsito, cobertura futura e limite de cobertura, nenhum campo em branco —, e o pedido fica marcado como originado das compras inteligentes

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

**C-026 — As visões são cards com contagem**
- **Dado que** a lista do fornecedor na filial foi calculada
- **Quando** a compradora olha o topo da tela
- **Então** vê quatro cards — **A comprar**, **Completar compra**, **Todos** e **Em trânsito** —, cada um com a quantidade de produtos que mostra, e clicar num card troca o recorte da lista sem nova consulta

**C-027 — Completar a compra com o que vai faltar em breve**
- **Dado que** um produto tem sugestão zero, nada em trânsito, giro, e 75 em estoque disponível com consumo de 2 por dia (cobertura de 37,5 dias, dentro de cobertura de 35 + lead de 9)
- **Quando** a compradora abre "Completar compra"
- **Então** o produto aparece com uma caixa cheia pré-carregada como complemento; o produto com 200 em estoque (cobertura de 100 dias), o silenciado, o sem giro e o que tem trânsito não aparecem

**C-028 — Carrinho salvo e retomada**
- **Dado que** a compradora montou um carrinho com 3 itens em 2 pedidos e fechou a tela
- **Quando** ela volta
- **Então** vê "Você tem um carrinho salvo", com itens, pedidos, valor e quando foi aberto, e escolhe **continuar** (o carrinho volta inteiro, com quantidades e motivos) ou **descartar** (com confirmação)

**C-029 — Pedido mínimo do fornecedor no carrinho**
- **Dado que** o fornecedor foi parametrizado com pedido mínimo de R$ 1.000 e o grupo do carrinho soma R$ 300
- **Quando** a compradora abre o carrinho
- **Então** o grupo mostra "Faltam R$ 700 para o mínimo" com a barra em 30 %; com R$ 1.200 mostra "Pedido mínimo atingido"; fornecedor sem mínimo parametrizado está sempre atingido

**C-030 — Arquivo de importação do WinThor**
- **Dado que** o carrinho tem itens de dois fornecedores
- **Quando** a compradora pede o arquivo de importação
- **Então** recebe um arquivo por fornecedor e filial, uma linha por item no formato `CODPROD;PRECO;QTD`, sem cabeçalho, preço com ponto decimal e duas casas, quantidade inteira, e item com quantidade zero fica de fora

**C-031 — Painel de detalhe fixo**
- **Dado que** a lista carregou
- **Quando** a compradora clica numa linha (o primeiro produto já vem selecionado)
- **Então** o painel à direita mostra código e descrição, embalagem e fornecedor, quatro números — estoque e trânsito, cobertura e nível (disponível ÷ máximo, 50 de 70 é 71 %), situação, prioridade e gatilho —, o gráfico de compras × vendas e as seções recolhidas de "Mais detalhes"; selecionar um produto custa três consultas, uma vez por produto

**C-032 — Compras × vendas com projeção e valores escritos**
- **Dado que** o produto vendeu 10 em agosto e 20 em setembro e entrou 24 em agosto, com consumo diário de 2
- **Quando** o gráfico é desenhado em 6 meses
- **Então** mostra 6 meses medidos (zero onde não houve movimento) e 3 meses de projeção (62, 60 e 62 para out, nov e dez), cada barra e cada ponto com o valor escrito em cima, com a opção de 13 meses e de ver a mesma série em tabela, e o rodapé soma 3, 6 e 12 meses de vendas e compras e a projeção do próximo mês

**C-033 — Filiais com excesso**
- **Dado que** o produto tem, noutra filial, 120 em estoque e venda de 90 em 3 meses (cobertura de 120 dias) e, numa terceira, 10 em estoque sem venda
- **Quando** a compradora abre "Filiais com excesso" com teto de 42 dias
- **Então** vê as duas filiais, a sem giro primeiro; a filial da tela e a que tem 35 em estoque com a mesma venda (35 dias) não aparecem

**C-034 — Simulação de compra**
- **Dado que** o produto tem 50 disponíveis, consumo de 2 por dia, máximo de 70, caixa de 12 e custo de R$ 10
- **Quando** a compradora simula 50 unidades
- **Então** vê 60 unidades (5 caixas), R$ 600, cobertura de 55 dias e nível de 157 % depois da compra, e pode jogar essa quantidade no carrinho

**C-035 — Produto que já está num pedido aberto**
- **Dado que** o fornecedor tem um pedido em análise na filial com 5 produtos
- **Quando** a lista é desenhada
- **Então** cada um desses 5 produtos traz a nota "Pedido #N aberto, ainda sem trânsito" enquanto não tiver trânsito; para a filial cujo pedido já foi enviado não há nota

**C-036 — O seletor de fornecedor já diz quanto há para comprar**
- **Dado que** há fornecedores parametrizados
- **Quando** a compradora abre o seletor
- **Então** cada opção traz o número de itens ativos e uma **estimativa** do valor sugerido, apurada numa consulta só para todos os fornecedores, sem depender da filial

**C-037 — Unidades ou caixas como referência**
- **Dado que** a sugestão de um produto é 48 com caixa de 12
- **Quando** a compradora alterna a referência para caixas
- **Então** a sugestão passa a ler "4 cx · 48 un." e o campo de quantidade passa a mostrar e receber **caixas** (4; digitar 5 grava 60 unidades; fração sobe para a caixa cheia) — o cabeçalho diz "Qtd. (cx)"; produto avulso continua em unidades; o que fica guardado é sempre em unidades

**C-038 — Ordem, movimentação e silenciados**
- **Dado que** a lista tem produtos com e sem venda, com e sem estoque e com trânsito
- **Quando** a compradora ordena por código, nome ou curva, filtra por movimentação ou clica na ficha "Silenciados"
- **Então** a lista muda na hora, sem consulta, e as fichas de sugestão (unidades), rupturas e silenciados continuam contando o recorte

**C-039 — Custo atual contra o da última entrada**
- **Dado que** o custo da última entrada de um produto foi R$ 12 e o custo atual do ERP é R$ 11, e noutro foi R$ 10 e hoje é R$ 10,50
- **Quando** o carrinho é desenhado com 24 do primeiro e 10 do segundo
- **Então** o primeiro mostra variação de −8,3 % (caiu) e o segundo +5 % (subiu), e a "economia no custo" do carrinho é R$ 24 — só o que caiu conta

**C-041 — Vendedor e pedido ao ERP nas consultas do produto** *(R-123)*
- **Dado que** a compradora abre a Análise do Produto
- **Quando** a lista de vendas e as últimas compras voltam do ERP
- **Então** cada venda traz o código e o nome do vendedor ao lado do cliente, e cada entrada traz o número do pedido ao ERP, a data de emissão (solicitação) e a previsão de entrega — entrada sem pedido casado vem sem essas datas

**C-042 — Análise do Produto, a janela do sistema antigo** *(R-123)*
- **Dado que** a compradora selecionou um produto na lista (o painel já carregou histórico, compras e filiais)
- **Quando** ela clica no olho do painel
- **Então** abre a janela "Análise do Produto": cabeçalho com código, descrição, embalagem, fornecedor e situação; Estoque | Em trânsito | Cobertura | Cobertura futura e Necessidade | Sugestão | Custo; a aba **Análise** com simulação de compra (quantidade, caixas, valor previsto, estoque final, cobertura, Parâmetros e Adicionar ao carrinho), Compras × vendas (6m/13m, Caixas/Unidades quando há caixa, Gráfico/Tabela, legenda que esconde a série, a série Desconsideradas, o aviso "Ainda não há dados suficientes para análise histórica consistente." com menos de 3 meses com movimento), análise de venda futura, o aviso de excesso em até 6 outras filiais, compras do produto (a última em mini-cartões, com a previsão em atenção quando a entrada atrasou; histórico de 5 entradas e "Ver todas as N entradas") e os parâmetros do cálculo; a aba **Vendas (N)** com vendas listadas, quantidade e valor desconsiderados, os meses em pílula ("Outubro de 2026 · N vendas · R$ X"), a tabela com cliente e vendedor e Desconsiderar/Reconsiderar, a linha desconsiderada em fundo de atenção, "Carregando…" e "Nenhuma venda encontrada para o período atual."
- **E** abrir a janela não custa consulta nova — só a aba Vendas custa 1, ao abrir
- **E** as seções em card (Simulação de compra, Análise de venda futura, Compras do produto, Parâmetros do cálculo e Oportunidade com preço especial) nascem **recolhidas**, com um resumo de uma linha no cabeçalho e o cabeçalho inteiro como botão (teclado e `aria-expanded`); trocar de produto recolhe tudo; o card do gráfico continua aberto

**C-043 — A série da previsão** *(R-124)*
- **Dado que** o produto aberto no painel tem histórico mensal e vendas desconsideradas
- **Quando** a previsão é montada
- **Então** entram só os meses **fechados** (anteriores ao mês de hoje), do mais antigo ao mais recente, no máximo 12, cada um com as vendas do mês menos as desconsideradas dele (nunca abaixo de zero); com 4 ou mais pontos, o mês acima de média + 2 desvios vira a média e conta como outlier ajustado; com menos de 3 pontos não há projeção e a sugestão segue o consumo ponderado

**C-044 — Os cinco modelos** *(R-124)*
- **Dado que** a série ajustada tem 3 ou mais pontos
- **Quando** cada modelo é calculado
- **Então** a média móvel simples e a ponderada (3 últimos; pesos 50/30/20), a suavização exponencial (alpha de 0,1 a 0,9), o Holt (alpha e beta em 0,2 a 0,8) e o Holt-Winters aditivo (período 4, ou 6 com 12 pontos; sem dois períodos cai no Holt "sem sazonalidade") devolvem a previsão do próximo mês (nunca negativa) e os erros de um passo, de onde saem MAD, MAPE, erro acumulado e tracking signal; os parâmetros são os de menor MAD

**C-045 — Best Fit e a sugestão projetada** *(R-124)*
- **Dado que** os cinco modelos foram calculados para o produto aberto
- **Quando** a compradora deixa o seletor em Best Fit (o padrão) ou escolhe um modelo
- **Então** o Best Fit é o de menor MAD e o seletor diz qual venceu; a seção "Análise de venda futura" do painel e da Análise do Produto mostra projeção mensal, MAD com o MAPE, tracking signal com o limite ±4 e o estado (sob controle / fora), e a sugestão projetada com as caixas; mostra os pontos usados, os outliers ajustados, alpha/beta/gamma e as médias de 3, 6 e 12 meses da série ajustada; a última barra do gráfico passa a ser a projeção do modelo; a linha selecionada, a quantidade do simulador e o "adicionar ao carrinho" desse produto partem da sugestão projetada — as demais linhas seguem no consumo ponderado; a escolha do modelo é estado da tela e não é gravada
- **E** a seção tem dois blocos com rótulo — "Previsão pelo modelo" (seletor, ajuda, Projeção mensal, MAD/MAPE, Tracking Signal, Sugestão projetada, e os fatos em pílulas: meses usados, outliers, médias 3/6/12) e "Regra de ressuprimento (consumo ponderado)" (consumo diário, projeção do mês, segurança, ponto de pedido, máximo, lead time medido) —, números inteiros onde é estoque ou alvo, 1 casa no consumo, no MAPE e no TS, 0 no MAD, e subtítulos curtos sem corte (a explicação longa fica no `title`); recolhida, o resumo é "Best Fit → <modelo> · N un./mês · sugestão N un. (N cx) · TS sob controle"

**C-046 — As políticas de preço especial vigentes** *(R-125)*
- **Dado que** o Gestão de Custos tem políticas de preço especial com itens e clientes
- **Quando** a lista carrega
- **Então** o sistema lê, por produto da lista, só as políticas vigentes (custo > 0, situação não encerrada, dentro das datas), com o cliente de cada uma — o cliente da lista da política, o cliente da própria política ou, sem nenhum dos dois, a política aberta para qualquer cliente — e a venda de cada cliente a esses produtos na janela, na filial, sem órgão público; nada disso custa mais que duas consultas por lote de 500 produtos

**C-047 — A venda de cada cliente por produto** *(R-125)*
- **Dado que** a filial vendeu um produto a vários clientes na janela
- **Quando** a venda por cliente é consultada
- **Então** vem uma linha por produto e cliente com o nome e a quantidade (só saídas positivas), sem órgão público por padrão e com ele quando pedido

**C-048 — Oportunidade com preço especial no produto** *(R-125)*
- **Dado que** um produto da lista tem política vigente para um cliente que comprou na janela, com custo especial abaixo do custo atual
- **Quando** a compradora olha a lista e abre o produto
- **Então** a linha mostra o selo "Especial N un." (ou "Especial N tabelas", em atenção, quando não há quantidade segura); o painel e a Análise do Produto mostram a seção "Oportunidade com preço especial", aberta, com o resumo (tabelas e ganho estimado), Comprar padrão | Tabelas especiais | Especial total, as tabelas em pílula e o card de cada uma (política, clientes, quantidade a comprar com caixas, risco, uso do limite seguro com compra especial e folga, o gráfico da venda do cliente por mês com a projeção segura, os 5 clientes com média, teto e projeção, o rodapé com limite, custo, ganho, "limitado por", ganho restante e validade); "Adicionar especial" põe no carrinho uma linha própria com o custo da política e o selo dela; o saldo fica como compra padrão
- **E** o card do gráfico tem abas em pílula — "Compras × vendas" (o padrão, com 6m/13m, Gráfico/Tabela e o rodapé) e "Preço especial" (só quando há oportunidade: os KPIs, as tabelas e o card com o gráfico do cliente) — um gráfico por vez; trocar de produto volta para "Compras × vendas"

**C-049 — A visão Em trânsito mostra a quantidade em trânsito**
- **Dado que** a compradora abre o card "Em trânsito"
- **Quando** a lista é mostrada
- **Então** a grade é própria, como no sistema antigo: Produto · Situação · Estoque · **Em trânsito** (a quantidade em destaque, em caixas na referência Caixas, e embaixo "N dias com o trânsito" — (disponível + trânsito) ÷ consumo diário — ou "Sem consumo") · Preço compra (o custo atual; na falta, o da última entrada; senão "Sem custo", em perigo) · Sugestão (só leitura, na referência) · Ações (carrinho e silenciar); curvas e cobertura saem dessa visão, e as demais visões não mudam

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
| RF-009 | O sistema DEVE classificar os produtos em duas curvas A, B ou C — pelo faturamento e pela rentabilidade da janela —, dentro do fornecedor e da filial, mostrar as duas e usar a pior delas como a curva do produto | Os cortes de 80 % e 95 % e a pior das duas de C-015 | must |
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
| RF-020 | O detalhe do produto DEVE ser a janela "Análise do Produto" do sistema antigo — a versão expandida do painel (cabeçalho, métricas, aba Análise com simulação, Compras × vendas, venda futura, excesso em outras filiais, compras do produto e parâmetros; aba Vendas com os meses em pílula, cliente, vendedor e desconsiderar) sobre os dados que o painel já carregou | C-021, C-041, C-042 | must |
| RF-021 | O sistema DEVE apurar a aderência do comprador: o percentual de itens de pedidos originados das compras inteligentes em que a quantidade pedida ficou dentro de 20 % para mais ou para menos da sugerida, por comprador e período | C-022 | should |
| RF-022 | A tela DEVE ser aberta por analista, gestor, admin e diretoria (esta só lê); a parametrização e o silenciamento, só por admin e gestor; o comercial não DEVE alcançá-la | C-023 | must |
| RF-023 | A lista visível DEVE poder ser exportada | C-024 | should |
| RF-024 | O seletor de fornecedor DEVE mostrar, por fornecedor, o número de itens ativos e uma estimativa do valor sugerido, apurada numa consulta só | C-036 | should |
| RF-025 | A lista DEVE sinalizar o produto que já está num pedido aberto do fornecedor na filial e ainda sem trânsito | C-035 | should |
| RF-026 | A lista DEVE ter quatro visões com contagem — a comprar, completar compra, todos e em trânsito —, ordenação por código, nome ou curva, filtro de movimentação e ficha de silenciados, tudo sem consulta | C-026, C-027, C-038 | must |
| RF-027 | A tela DEVE ter um painel de detalhe fixo com os quatro números, o gráfico sempre aberto e as seções de simulação, atributos e estoque, compras do produto, vendas do período, filiais com excesso e parâmetros do cálculo | C-031, C-033, C-034 | must |
| RF-028 | O gráfico de compras × vendas DEVE mostrar 6 ou 13 meses, a projeção dos 3 meses seguintes, o valor escrito em cada barra e ponto, a visão em tabela e o rodapé de 3, 6 e 12 meses | C-032 | must |
| RF-029 | O carrinho DEVE ficar guardado no navegador de quem o abriu, com quem e quando, e ser oferecido para continuar ou descartar na volta | C-028 | must |
| RF-030 | O carrinho DEVE mostrar, por grupo, o quanto falta para o pedido mínimo do fornecedor | C-029 | must |
| RF-031 | O carrinho DEVE gerar o arquivo de importação do WinThor, um por fornecedor e filial | C-030 | should |
| RF-032 | A medida DEVE trazer o custo atual do ERP e o código de fábrica; o carrinho mostra a variação e a economia no custo | C-039 | should |
| RF-033 | O produto aberto no painel DEVE ter previsão de venda por modelo (MMS, MMP, SE, Holt, Holt-Winters e Best Fit) sobre os meses fechados, com MAD, MAPE e tracking signal, e a sugestão projetada dele; a escolha do modelo é da compradora, Best Fit por padrão | C-043, C-044, C-045 | must |
| RF-034 | O sistema DEVE mostrar as oportunidades de compra com custo especial do Gestão de Custos — por produto e cliente, com quantidade segura, risco e ganho — e deixar a compradora pôr a quantidade especial no carrinho com o custo da política | C-046, C-047, C-048 | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Abrir a tela custa no máximo **4** chamadas ao servidor (R-117: fornecedores, eficiência, quadro e o resumo por fornecedor); escolher o fornecedor **1**; escolher a filial **8** (R-120: a oitava é a das unidades por caixa do Gestão de Custos, em lotes de até 1000 produtos); selecionar um produto **3**, uma vez por produto — nenhuma chamada por linha | Contador de chamadas com um fornecedor de 20 e outro de 300 produtos: o mesmo número |
| RNF-002 | Criar o pedido a partir do carrinho custa **3** chamadas por fornecedor e filial, qualquer que seja o número de itens | Contador com 1 e com 60 itens no carrinho: sempre 3 |
| RNF-003 | Selecionar um produto na lista custa **3** chamadas, uma vez por produto (o detalhe completo reusa o que já veio); abrir a lista de vendas para desconsiderar, mais **1**; desconsiderar ou reconsiderar uma venda, **3** (gravar, reler a lista do que ficou desconsiderado e refazer a medida) | Contador ao selecionar, ao abrir o diálogo de vendas e ao marcar uma venda |
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
- **RN-010 — Curvas.** Duas curvas pela mesma régua da montagem do pedido (ordenar por valor decrescente dentro do fornecedor e da filial; acumulado até 80 % é A, até 95 % é B, o resto é C; sem valor total, todos C): a de **faturamento**, cujo valor é o que o produto vendeu na janela (quantidade × preço de cada venda), e a de **rentabilidade**, cujo valor é a margem da janela (quantidade × (preço − custo financeiro) de cada venda; margem negativa vale zero). A **curva do produto** é a pior das duas (A < B < C) — é ela que escolhe o alvo de cobertura (RN-004), vai no item do pedido (RN-015) e ordena a lista. A venda desconsiderada (RN-012) e a devolução ficam fora dos dois valores. Sem os dois valores na consulta, as duas curvas são a antiga: venda × custo da última entrada.
- **RN-011 — Licitação.** A venda a clientes de órgão público (atividades 11 a 15 e 20) entra na demanda por padrão e aparece à parte. O seletor "desconsiderar licitação" subtrai a parte pública do consumo e recalcula tudo na tela, sem nova consulta.
- **RN-012 — Venda desconsiderada.** A venda marcada é tirada da demanda na origem, antes de qualquer média — não é descontada depois. No máximo 500 vendas desconsideradas por consulta.
- **RN-013 — Silenciamento.** Silenciar guarda a data até quando e o motivo; o padrão são **30 dias** a partir de hoje. Produto silenciado sai da aba "a comprar" e continua na aba "todos" com a marca, o motivo e a data. Restaurar apaga a data. O chip "Silenciados" filtra sempre sobre "todos" — "a comprar" os exclui por definição —, e o painel mostra a data, o motivo e "Devolver à fila".
- **RN-014 — Recorte do ERP.** Produto ativo (sem marcação de inativo) e fora dos departamentos 4 e 7; o fornecedor genérico nunca entra; venda é só saída com quantidade positiva.
- **RN-015 — Carrinho.** Um pedido por fornecedor e filial. Título no padrão do sistema (filial e fornecedor em maiúsculas). Prioridade alta quando houver ao menos um produto em ruptura no grupo, normal nos demais casos. Período igual à janela da tela. Cada item nasce **completo**: a quantidade escolhida, a quantidade sugerida no momento da escolha, o custo, a curva e tudo o que a lista já sabe do produto — descrição, embalagem, unidade, departamento, seção, unidades por caixa, venda do período, venda pública, estoque e trânsito medidos, a cobertura futura calculada com a quantidade escolhida e o limite de cobertura que vale para ele. Campo que nascer vazio continua vazio quando o pedido for reaberto e a análise remontada (RN-017) — e some das verificações de saída da montagem.
- **RN-016 — Pedido aberto bloqueia.** Existe pedido aberto quando há pedido daquele fornecedor e filial em qualquer fase anterior ao envio à indústria (análise, aprovação técnica, aprovação da diretoria ou envio). A recusa cita o pedido e a fase.
- **RN-017 — O carrinho manda.** Ao montar a análise dentro do pedido, o produto que já está na lista mantém a quantidade que tem; só os produtos novos entram zerados.
- **RN-018 — Aderência.** Um item é aderente quando a quantidade pedida fica entre 80 % e 120 % da sugerida, limites inclusive, e a sugerida é maior que zero. A aderência é o percentual de itens aderentes entre os itens de pedidos originados das compras inteligentes, no período e por comprador.
- **RN-019 — Permissões.** Ver a tela: admin, analista, gestor e diretoria. Operar (carrinho, edição de quantidade, desconsiderar venda): admin, analista e gestor, zerado por acesso somente-leitura. Parametrizar e silenciar: admin e gestor. Comercial não vê. Acesso restrito opera e o pedido criado é dele.

- **RN-020 — Completar compra.** Entra na visão o produto com sugestão zero, não silenciado, sem trânsito, com giro, e cobertura atual menor ou igual a `cobertura + lead time`: é o que vai entrar na fila no próximo ciclo. O complemento proposto é **uma caixa cheia** (uma unidade no avulso). Ordem: menor cobertura primeiro.
- **RN-021 — Carrinho salvo.** O carrinho fica guardado no navegador, por usuário, com os itens, as quantidades, os motivos, quem abriu, quando abriu e quando foi salvo pela última vez. Na volta, com o carrinho da tela vazio, a tela oferece continuar ou descartar; descartar exige confirmação. Guardar no servidor (retomar de outra máquina) é dívida registrada.
- **RN-022 — Pedido mínimo.** O mínimo do grupo é o pedido mínimo parametrizado do fornecedor (spec 001) no momento em que o item entrou. Falta = mínimo − total do grupo, nunca negativa; sem mínimo parametrizado, está sempre atingido.
- **RN-023 — Arquivo do WinThor.** Um arquivo por fornecedor e filial, uma linha por item com quantidade, `CODPROD;PRECO;QTD`, sem cabeçalho, preço com ponto decimal e duas casas (o custo atual do ERP, ou o da última entrada na falta dele), quantidade inteira.
- **RN-024 — Valor escrito em cada marca.** Em todo gráfico do sistema, cada barra e cada ponto de linha mostram o seu valor escrito em cima, inclusive a série de projeção (decisão do usuário, R-116).
- **RN-025 — Filial com excesso.** Cobertura da filial = estoque disponível ÷ (venda de 3 meses ÷ 90). Há excesso quando a cobertura passa do teto (a cobertura alvo do produto) ou quando há estoque sem venda nenhuma. A filial da tela nunca entra. Sem giro primeiro, depois a maior cobertura.
- **RN-026 — Resumo por fornecedor.** É estimativa: venda dos últimos 90 dias sem ponderação, cobertura de 35 dias, estoque disponível e pedido ao ERP somados em todas as filiais, custo da última entrada, nenhum parâmetro de SKU nem curva. Serve ao rótulo do seletor; a sugestão exata é a da lista.
- **RN-027 — Variação e economia.** Variação = (custo atual − custo da última entrada) ÷ custo da última entrada; vermelho quando subiu, verde quando caiu; sem um dos dois custos não há variação. Economia no custo = soma de (última entrada − atual) × quantidade só nos itens em que o custo caiu.
- **RN-028 — Unidades por caixa (R-120).** A caixa de cada produto vem do Gestão de Custos quando ele a tem; senão do cadastro do ERP; senão da embalagem; senão é avulso — a mesma cadeia da montagem do pedido (RN-002 da 003). A tela mostra de onde veio, e a sugestão, a referência Unidades/Caixas e a simulação usam a caixa resolvida.
- **RN-029 — Série da previsão.** Até 12 meses fechados (mês < mês de hoje) de vendas do produto na filial, em ordem crescente, cada mês menos as vendas desconsideradas dele, com piso zero. Com 4 ou mais pontos: média e desvio populacional; ponto acima de média + 2 desvios vira a média (outlier ajustado). Com menos de 3 pontos não há projeção.
- **RN-030 — Modelos e erros.** MMS: média dos últimos w = min(3, n−1). MMP: pesos 0,5/0,3/0,2 do mais recente ao mais antigo, truncados a w e normalizados. SE: nível = s0, a cada passo prev = nível e nível = α·s + (1−α)·nível, α de 0,1 a 0,9. Holt: L = s0, T = s1−s0; prev = L+T; L' = α·s + (1−α)(L+T); T = β(L'−L) + (1−β)T; α, β em {0,2; 0,4; 0,6; 0,8}. Holt-Winters aditivo: m = 6 com 12 pontos, senão 4; com n < 2m devolve o Holt "sem sazonalidade"; L0 = média(m primeiros), T0 = (média(m seguintes) − L0)/m, S_k = s_k − L0; prev = L+T+S_k, atualizações com α, β, γ em {0,2; 0,4; 0,6}. Cada modelo devolve a previsão do próximo mês (máx(0, 2 casas)) e os erros real − previsto; MAD = Σ|e|/n; MAPE só sobre reais > 0; CE = Σe; TS = CE/MAD (0 sem MAD); sob controle ⇔ |TS| ≤ 4. Os parâmetros são os de menor MAD (empate: o primeiro). Best Fit = o modelo de menor MAD; é o padrão.
- **RN-031 — Sugestão projetada.** Demanda diária = previsão/30. Sugestão projetada = arredonda à caixa cheia (demanda × cobertura − disponível − trânsito), nunca negativa, com a cobertura que o item já resolve (RN-004). Alvo no lead time = demanda × lead time + estoque de segurança. Vale só para o produto aberto no painel: a linha selecionada, a quantidade do simulador e o "adicionar ao carrinho" dele; as demais linhas e a consulta seguem na RN-001. A projeção manual em % (badge) não altera o cálculo.
- **RN-032 — Oportunidade por produto × cliente.** Exige cliente, venda do cliente no período, custo especial e economia unitária = máx(0, custo atual − especial) > 0 (sem custo atual, vale o da última entrada). Cobertura segura = clamp(cobertura resolvida ou 30, 1, 45). Projeção do cliente = teto(venda do cliente ÷ dias do período × cobertura segura). Quantidade segura qs = mín(sugestão, projeção do cliente). Risco: qs ≤ 0 Monitorar; venda ≥ 2·qs Seguro; senão Moderado. Ganho = qs × economia. Ordem por ganho.
- **RN-033 — Sugestão segura por tabela.** Fator de cobertura = clamp(cobertura, 1, 45)/30; venda mensal do SKU = consumo diário × 30; cap recente do SKU = mediana dos 6 últimos meses fechados com venda, até 25 % acima dela e nunca acima do pico; fator de previsão = projeção do modelo ÷ venda mensal do SKU (1 sem um dos dois). Por cliente: participação = mín(1, venda do cliente ÷ soma dos últimos 12 meses com venda); mensais do cliente = meses × participação; média e cap do cliente = mín(máx mensal, máx(média, mediana × 1,25)); base = média, ou projeção do cliente ÷ fator de cobertura; teto = mín(cap do cliente ou base × 1,05, cap do SKU × participação); projeção mensal = teto(mín(base × fator de previsão, teto)); seguro = à caixa(projeção × fator de cobertura); crescimento = projeção ÷ base; risco Seguro (crescimento ≤ 1 e seguro ≤ projeção do cliente), Moderado (≤ 1,05) ou Arriscado; "limitado por" cliente, SKU ou ambos.
- **RN-034 — Tabelas e distribuição.** Agrupa por política + custo: soma os seguros e o ganho potencial, junta os clientes, fica com o pior risco e a menor validade. Ficam as tabelas com seguro > 0, por maior economia e depois maior seguro. A quantidade simulada (à caixa) se distribui: cada tabela recebe mín(restante, seguro) e ganho = quantidade × economia; o que sobra é compra padrão. A linha especial do carrinho tem chave própria (produto, filial, política, custo), o custo da política e o tipo de preço especial no item do pedido.

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
| C-012 | gravar silenciamento até hoje+30 e ler de volta a data e o motivo; a regra tira o produto de "a comprar" e o mantém em "todos"; restaurar apaga a data e o produto volta; o chip liga o filtro e leva a "todos" (de "trânsito" volta a "trânsito"), escolher um card desliga | regra de negócio + regra de tela |
| C-013 | consulta sem exclusão → venda 90; com a venda de 60 na lista de exclusão → venda 30 e consumo menor; a lista de desconsideradas traz 1 linha com o motivo; reconsiderar deixa a lista vazia e a venda volta a 90 | regra de negócio |
| C-014 | consumo total 2,0 e público 0,5, disponível 30: com licitação → máximo 70, sugerida 48, `baixa_exposicao`; sem licitação → consumo 1,5, máximo 52,5, sugerida 24, `adequado` | regra de tela |
| C-015 | faturamento 500/250/150/70/30 e rentabilidade 30/500/250/150/70 → faturamento A, A, B, C, C; rentabilidade C, A, A, B, C; curva do produto C, A, B, C, C; sem os dois valores, venda × custo nas duas | regra de tela |
| C-016 | sem parâmetro nenhum, alvo da curva A = 35 → máximo 70; curva B = 45 → 90; curva C = 60 → 120; sem regra alcançável → 35 | regra de tela |
| C-017 | sugestão 48 e caixa 12: quantidade digitada 50 → 60; digitada 48 → 48; digitada 0 → 0 | regra de tela |
| C-018 | criar o pedido a partir de um carrinho de 3 itens (um em ruptura) devolve 1 card na fase de análise, com origem `compras_inteligentes`, prioridade `alta`, período da janela, valor total igual à soma e 3 itens gravados completos: quantidade pedida, sugerida, custo e curva, **e** descrição não vazia e limite de cobertura maior que zero nos três | regra de negócio |
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
| RN-014 | a consulta não traz produto marcado como inativo nem de departamento 4 ou 7; o produto que tem uma devolução de 5 unidades na janela (quantidade negativa) mostra só as saídas positivas na venda do período | regra de negócio |
| RN-015 | 3 itens do mesmo fornecedor e filial com 1 em ruptura → 1 grupo, prioridade `alta`; sem ruptura → `normal`; 2 filiais → 2 grupos | regra de tela |
| RN-016 | a consulta lista pedido nas fases análise, técnica, diretoria e envio, e não lista nas fases enviado, trânsito, faturamento, B.O., concluído e cancelado | regra de negócio |
| RN-017 | mesclar a lista montada com a existente mantém a quantidade da existente e zera só as novas | regra de tela |
| RN-018 | (100, 100) → aderente; (100, 80) → aderente; (100, 120) → aderente; (100, 79) → não; (100, 121) → não; (0, 10) → não | regra de tela |
| RN-019 | a matriz de C-023, perfil a perfil e nível a nível | regra de tela |
| C-026, C-027, RN-020 | quatro medidas (20, 75, 200 e 30 com trânsito 20) → contagens 1 / 1 / 4 / 1; completar devolve só o de 75, com uma caixa (12) de complemento; silenciado, sem giro e com trânsito nunca entram; ordem por menor cobertura | regra de tela |
| C-028, RN-021 | o texto guardado volta ao carrinho só com versão 1 e ao menos um item com quantidade; texto inválido vira `null`; ida e volta sem perda; resumo de 3 itens em 2 filiais = 3 · 2 · total | regra de tela |
| C-029, RN-022 | (300, 1000) → falta 700, 30 %; (1200, 1000) → atingido; (10, 0) → atingido; mínimo do grupo = maior entre os itens | regra de tela |
| C-030, RN-023 | 3 itens (um com quantidade 0) → `5401;12.00;24\r\n5403;10.46;12`; nome `winthor-1042-filial-1-2026-09-16.txt` | regra de tela |
| C-031 | nível: 50 de 70 → 71,4 %; máximo 0 → nulo | regra de tela |
| C-032, RN-024 | série de 6 meses + 3 de projeção (62, 60, 62 a consumo 2); 13 meses dão 16 pontos; rodapé 3m/6m/12m/projeção com os números da tabela de casos | regra de tela |
| C-033, RN-025 | posições de 5 filiais com teto 42 → excesso nas filiais 4 (sem giro) e 2 (120 d), nessa ordem | regra de tela |
| C-034 | simular 50 → 60 un., 5 cx, R$ 600, 55 d, 157 %; sem giro → cobertura nula | regra de tela |
| C-035 | a consulta de itens em pedido aberto devolve os 5 produtos do pedido em análise do 1042 na filial 1, com card e fase pela chave, e nada para a filial 2 (enviado) | regra de negócio |
| C-036, RN-026 | o resumo do 1042 devolve os itens ativos do catálogo menos o inativo e o do departamento 4, e valor estimado > 0 | regra de negócio |
| C-037 | (48, 12, unidades) → "48 un. · 4 cx"; (48, 12, caixas) → "4 cx · 48 un."; (48, 1) → "48 un."; campo: 315 un. com caixa 15 em "caixas" mostra 21, digitar 22 grava 330, 1,5 grava 22,5 e o blur sobe a 30; avulso e "unidades" em unidades | regra de tela |
| C-038 | ordem por código, nome e curva (A, B, C); cada filtro de movimentação devolve só as linhas certas | regra de tela |
| C-040 | consulta do ressuprimento: o 5410 (50 un. a 20 com custo financeiro 12) devolve faturamento 1000 e rentabilidade 400; devolução e venda desconsiderada ficam fora dos dois; produto sem venda tem 0 e 0 | regra de negócio |
| C-041 | `sgcWintProdutoVendas` do 5408 → 4 vendas, todas com `CODUSUR` > 0 e `VENDEDOR`; `sgcWintProdutoUltimasCompras` do 5403 → a entrada do pedido 970001 com `DT_SOLICITACAO`, `DT_PREVISAO` e a entrada depois da previsão | regra de negócio |
| C-042 | meses de vendas: 2 em outubro (R$ 1.400) e 1 em setembro, do mais recente ao mais antigo, filtro por mês e resumo do que está fora (60 un., R$ 1.200); série Desconsideradas por mês só quando pedida, em caixas dividida por 12 com 1 decimal; 2 meses com movimento → histórico insuficiente, 3 → suficiente; entrada em 04/09 com previsão 02/09 atrasou, sem previsão não; necessidade 70 − 30 − 0 = 40, inteira e nunca negativa | regra de tela |
| C-043 | histórico com outubro (mês corrente), setembro 20 com 25 desconsideradas, agosto 30 com 10, julho 5, jan/25 1 → série [1, 5, 20, 0]; 14 meses → ficam os 12 mais recentes | regra de tela |
| RN-029 | 7 meses de 10 e um de 100 → média 21,25, σ 29,76, o 100 vira 21,25 e conta 1; com 3 pontos nada muda | regra de tela |
| C-044 | 10, 20, 30, 40, 50: MMS prevê 40 (erros 20, 20 → MAD 20, MAPE 45, CE 40, TS 2) e MMP 43 (MAD 17); SE com 10, 20 → alpha 0,1 e previsão 11; Holt na série linear 10, 20, 30 → 40 com MAD 0; Holt-Winters com 5 pontos cai no Holt "sem sazonalidade" e com 8 constantes prevê 10 com MAD 0 | regra de tela |
| RN-030 | erros 5 ×5 → MAD 5, CE 25, TS 5 fora de controle; MAPE só sobre reais > 0; sem MAD, TS 0 | regra de tela |
| C-045 | série linear 10..50 → Best Fit = Holt (MAD 0); "bestfit" resolve para ele; com 2 pontos não há modelos; médias 3/6/12 da série ajustada | regra de tela |
| C-046 | `sgcCustoEspeciaisProdutos` para 5401..5405 → 5401 e 5403 (9301, tabela 1), 5405 aberta (0, tabela 4); inativa e vencida fora; lista vazia → nada | regra de negócio |
| C-047 | `sgcWintVendasClientesProdutos` 5408/5409 → 9303 60, 9301 20, 9302 10, 9301 12; com órgão público, também 9304 6 | regra de negócio |
| RN-032 | tabela A para o 9301 (custo 11 − 8 = 3, projeção 70, qs 48, seguro, ganho 144); política aberta para cada cliente; sem economia nada; venda < 2·qs moderado; sugestão 0 monitorar; cobertura 90 vira 45 | regra de tela |
| C-048 | selo "Especial 113 un." (positivo) com quantidade segura, "Especial 2 tabelas" (atenção) sem ela, nada sem oportunidade; chave da linha especial `5401-1-especial-7-8`; lotes de 500; a aba "Preço especial" só existe com oportunidade e sem ela a escolha cai em "Compras × vendas" | regra de tela |
| RN-033 | cliente com 85 % do SKU (306 de 360 em 6 meses de 60): média 51, caps 51, projeção 51, seguro 60 (caixa 12), crescimento 1, seguro, limitado por ambos; previsão 120 não passa do teto; sem série, base 60 e limitado pelo SKU; cap recente 31,25 para 10/20/30/100 | regra de tela |
| RN-034 | tabelas 1-8 (economia 3, seguro 60) e 2-6 (economia 5, seguro 12 + 12, pior risco arriscado, validade 15/11) com quantidade 100 → 2-6 compra 24, 1-8 compra 60, padrão 16, ganho 300; tabela com seguro 0 fica fora; carrinho: total 24 × 10 + 12 × 8, item especial com preço 8 e tipo especial | regra de tela |
| C-049 | 50 disponíveis + 100 em trânsito a 2/dia → 75 dias; sem consumo → nulo; preço: atual 11 → 11 (atual), só última 12 → 12 (última), nenhum → nulo | regra de tela |
| C-045 (resumo) | série 10..50: "Best Fit → Holt · 40 un./mês · sugestão 312 un. (26 cx) · TS sob controle"; modelo escolhido vem só com o nome; sem histórico "…"; com 2 pontos avisa; `numeroPt(1234,5, 1)` = "1.234,5" | regra de tela |
| RN-031 | previsão 300 → 10/dia; cobertura 35, estoque 100, trânsito 50, caixa 12 → 200 → 204; alvo no lead time (9 d, segurança 20) = 110; nunca negativa | regra de tela |
| C-039, RN-027 | a consulta devolve custo atual 11 (última 12) no 5401, 10,5 no 5403 e código de fábrica; variação −8,3 % e +5 %; economia de 24 só com o que caiu | regra de negócio + regra de tela |
| RN-028 | produto com 6 no Gestão de Custos e "CX 12" na embalagem fica com caixa 6 e origem gestão (sugestão em múltiplos de 6); sem o mapa, 12 pela embalagem; com 24 no ERP, origem ERP; a integração no simulador devolve 12 e 24 para 5001 e 5002 e nada para 5010 | regra de tela + regra de negócio |

- O que só olho humano verifica fica em **Verificação manual**:
  - [ ] C-001 — a lista com 300 produtos rola sem travar, com os números alinhados à direita e o código do produto discreto
  - [ ] C-002 a C-006 — a situação aparece com ponto **e** texto, legível nos dois temas, sem depender só da cor
  - [ ] C-012 — o produto silenciado aparece marcado na aba "todos", com o motivo no rótulo
  - [ ] C-018 — o pedido criado abre no quadro com os itens já dentro
  - [ ] C-023 — quem só lê vê os controles desabilitados, com o motivo, nunca escondidos

## Fora de escopo

- [x] ~~**Previsão de demanda** (modelos estatísticos, corte de outlier, escolha por menor erro)~~ Entrou (R-124): os cinco modelos do legado, o cap de outliers e o Best Fit, só para o produto aberto no painel (C-043..C-045).
- [ ] **Estoque de segurança estatístico** (fator de serviço sobre a volatilidade) — a volatilidade é medida e mostrada, mas não entra na fórmula; dívida registrada.
- [ ] **Na Análise do Produto (R-123)**: o fator Z do estoque de segurança fica para a onda 5. ~~A oportunidade com preço especial~~ entrou (R-125); ~~o seletor de modelos de previsão~~ entrou (R-124).
- [x] ~~**Oportunidades de custo especial** e políticas de preço por cliente — dependem do módulo de custos.~~ Entrou (R-125): C-046..C-048, RN-032..RN-034, com o módulo de custos ligado (conexão gestao-de-custos, projeto 60574).
- [ ] **Diálogo de bloqueios de lote** — **adiado** (R-117): o layout do sistema antigo o tinha; entra numa rodada futura, com consulta própria aos lotes.
- [x] ~~**Exportação para o ERP** ("gerar exportação WinThor") — nunca existiu de fato no sistema antigo.~~ Existia (R-117): entrou como RF-031 / C-030.
- [ ] **Planilha (xlsx) e PDF** — a exportação é em texto separado por ponto e vírgula, como nas demais telas.
- [x] ~~**Curva por rentabilidade e "a pior das duas"** — a curva é uma só, a mesma da montagem do pedido.~~ Entrou (R-122): RN-010 e C-015 têm as duas curvas e a pior das duas; a montagem do pedido (003) segue com a régua única até a consulta dela trazer os dois valores.
- [ ] **Custo padrão vindo da gestão de custos** — o custo é o da última entrada, como na montagem; dívida registrada.
- [x] ~~**"Completar compra"** (sugestão complementar para atingir pedido mínimo) e **pedido mínimo por fornecedor.**~~ Entraram (R-117): RF-026 / C-027 e RF-030 / C-029; o mínimo é o da parametrização do fornecedor (001).
- [x] ~~**Selo de "custo especial"** no carrinho — adiado.~~ Entrou (R-125): a linha especial do carrinho leva o selo da política e o custo dela.
- [ ] **Carrinho guardado no servidor** (retomar de outra máquina ou de outro usuário) — **adiado**: o carrinho fica no navegador (RN-021); custaria uma tabela e três leituras/escritas.
- [ ] **Juntar itens a um pedido já aberto** — **adiado**: a lista sinaliza o pedido aberto (RF-025); o carrinho continua recusado enquanto ele existir (RF-018).
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
