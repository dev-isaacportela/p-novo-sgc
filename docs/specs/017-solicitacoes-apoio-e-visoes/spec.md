# Spec: Solicitações — apoio à avaliação e visões agrupadas

**ID:** 017-solicitacoes-apoio-e-visoes · **Status:** aprovada (2026-11-03): P-01..P-09 aprovadas como implementadas, R-181 · **Data:** 2026-11-03

**Estende:** [`008-solicitacoes-do-comercial`](../008-solicitacoes-do-comercial/spec.md). Tudo que a
008 fixou (quem registra, quem avalia, o recorte do comercial, a situação de atendimento derivada)
continua valendo; esta spec só acrescenta duas leituras à mesma tela.

**Origem no legado:** RN-SOL-19 (apoio à avaliação) e RN-SOL-16 (visões Por vendedor, Por
fornecedor e Por filial) de `docs/regras-de-negocio/03-solicitacoes-comercial.md` do SGC
anterior, e a tela de solicitações dele.

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

A compradora avalia uma solicitação lendo só o que o vendedor escreveu: produto, quantidade,
cliente e justificativa. Para saber se aquele produto de fato vende naquela filial — e para quem —
ela abre outra tela, procura o produto, troca a filial e volta. Na prática, ou ela aprova no
escuro, ou adia a avaliação para quando tiver tempo de pesquisar, e a fila envelhece.

Do lado da gestão, a fila é uma lista de linhas. Perguntas simples — qual vendedor mais pede e
quanto do que ele pede vira compra, qual fornecedor concentra a demanda parada, qual filial tem
mais solicitação pendente — exigem exportar e montar uma tabela à mão. O sistema anterior
respondia isso com um clique, e a reescrita ainda não.

## Resultado esperado

Ao abrir a avaliação de uma solicitação, a compradora já vê, sem sair dali, as vendas daquele
produto na filial da solicitação mês a mês nos últimos seis meses, os cinco clientes que mais
compraram, se o cliente da própria solicitação está entre eles e quanto há em estoque e a caminho
na filial. E qualquer um que lê a fila troca a lista detalhada por um quadro agrupado por
vendedor, por fornecedor ou por filial, com quantas solicitações cada grupo tem em cada situação —
e abre o grupo para ver as linhas dele.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| analista (comprador) | avaliar a solicitação com as vendas do produto à vista; olhar a fila por fornecedor e por filial | diária |
| gestor (gerência de compras) | o mesmo, e olhar a fila por vendedor para saber quem pede e o que vira compra | semanal |
| comercial (vendedor) | olhar as próprias solicitações agrupadas por fornecedor e por filial | eventual |
| diretoria | ler a fila agrupada, sem operar | mensal |
| admin (TI) | tudo | eventual |

A matriz de quem pode o quê é a da 008 (RN-018): só quem avalia abre a avaliação, e por isso só
quem avalia vê o apoio; as visões agrupadas são leitura e valem para todo perfil que lê a fila,
com o comercial enxergando **apenas o que ele registrou** também nelas.

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa.

**C-01 — As vendas de seis meses na filial da solicitação**
- **Dado que** o produto 5311 "SUPLEMENTO PROTEICO SEM SABOR 400 G" vendeu na Filial Sul, nos seis meses fechados, 20, 40, 10, 50, 35 e 40 unidades a clientes privados, e 20 até hoje no mês corrente
- **Quando** a compradora abre a avaliação de uma solicitação do 5311 para a Filial Sul
- **Então** ela vê sete barras, cada uma com o seu valor escrito em cima — os seis meses fechados e o corrente marcado como parcial —, o total de 195 unidades nos seis meses, a média de 32,5 por mês e a nota "sem órgão público"

**C-02 — O que não é venda não entra**
- **Dado que**, na mesma filial e janela, o 5311 também saiu 200 unidades para um órgão público, 300 para uma filial da própria rede, 100 numa remessa de entrega futura, 500 para um cliente na Filial Matriz e entrou 1.000 unidades de compra
- **Quando** a avaliação é aberta
- **Então** nenhuma dessas quantidades aparece nas barras nem na lista de clientes: as barras continuam as do C-01

**C-03 — Os cinco maiores clientes**
- **Dado que** seis clientes privados compraram o 5311 na Filial Sul nos meses do gráfico — 70, 50, 40, 30, 20 e 5 unidades — e o órgão público e a filial da rede compraram mais que todos eles
- **Quando** a avaliação é aberta
- **Então** a lista mostra os cinco primeiros, do que mais levou para o que menos, cada um com código, nome, quantidade, número de notas e data da última compra; o sexto (5 unidades), o órgão público e a filial da rede não aparecem

**C-04 — O cliente da solicitação, à vista**
- **Dado que** há quatro solicitações do 5311 na Filial Sul: uma do cliente que mais comprou (70), uma do cliente que levou 5 (fora dos cinco maiores), uma de um cliente que não comprou nada nos meses do gráfico e uma sem cliente informado
- **Quando** a compradora abre a avaliação de cada uma
- **Então** ela lê, respectivamente: o cliente marcado como "cliente desta solicitação" na lista dos cinco; "O cliente desta solicitação levou 5 un. em 1 nota nos meses do gráfico (fora dos cinco maiores)"; "O cliente desta solicitação não comprou este produto nesta filial nos meses do gráfico"; e "Sem cliente informado" — nunca "não comprou"

**C-05 — Estoque e o que está a caminho**
- **Dado que** a Filial Sul tem 80 unidades do 5311, das quais 10 bloqueadas e 5 reservadas, 24 em pedido ao fornecedor e 12 em trânsito
- **Quando** a avaliação é aberta
- **Então** ela lê estoque disponível de 65 unidades, 36 a caminho e cobertura de 60 dias pela média dos seis meses; produto sem venda nenhuma mostra "sem giro", nunca uma cobertura inventada

**C-06 — Consulta que falha não vira zero**
- **Dado que** a leitura das vendas (ou dos clientes, ou do estoque) não responde
- **Quando** a avaliação é aberta
- **Então** aquela parte do apoio mostra que não pôde ser carregada, as outras partes aparecem normalmente, e aprovar e recusar continuam disponíveis — o apoio informa, não bloqueia a decisão

**C-07 — Produto sem venda**
- **Dado que** o produto da solicitação não vendeu nada na filial nos meses do gráfico
- **Quando** a avaliação é aberta
- **Então** as sete barras aparecem em zero com o zero escrito (aqui zero é verdade, o produto não vendeu), e a lista de clientes diz que não houve venda a cliente privado no período

**C-08 — A fila agrupada por vendedor**
- **Dado que** o vendedor Leo registrou 4 solicitações de um fornecedor — uma pendente, uma aprovada sem pedido, uma num pedido já enviado ao fornecedor e uma recusada — e o admin registrou 3 do mesmo fornecedor — uma num pedido concluído, uma num pedido cancelado e uma cancelada por ele
- **Quando** o gestor escolhe a visão "Por vendedor", filtrada por esse fornecedor
- **Então** ele vê duas linhas, Leo primeiro: Leo com 4 solicitações, 2 produtos, 1 pendente, 1 na fila, 1 em compra, 0 atendida, 0 não atendida e 1 recusada ou cancelada; o admin com 3, sendo 1 atendida, 1 não atendida e 1 recusada ou cancelada — e em cada linha as seis colunas de situação somam o total

**C-09 — Por fornecedor e por filial**
- **Dado que** as mesmas 7 solicitações estão 3 na Filial Matriz e 4 na Filial Norte
- **Quando** o gestor escolhe "Por fornecedor" e depois "Por filial", com o mesmo filtro
- **Então** "Por fornecedor" mostra uma linha com o nome do fornecedor e 7 solicitações; "Por filial" mostra a Norte (4) antes da Matriz (3), cada uma com o nome da filial

**C-10 — Os filtros valem para os grupos**
- **Dado que** a visão "Por vendedor" está aberta com o fornecedor do C-08
- **Quando** o gestor filtra a situação "Pendentes", ou o atendimento "Atendida", ou busca pelo nome do produto
- **Então** os grupos são recontados só sobre o que passou no filtro — com "Pendentes", só Leo, com 1; com "Atendida", só o admin, com 1 —, as fichas de filtro continuam acima do quadro e limpar o filtro reconta

**C-11 — O comercial só agrupa o que é dele**
- **Dado que** Leo abre a visão "Por vendedor" com o mesmo filtro
- **Quando** o quadro é desenhado
- **Então** ele vê uma linha só, a dele, com as suas 4 — as do admin não aparecem nem somadas, mesmo tentando pela URL

**C-12 — Abrir um grupo é filtrar a lista**
- **Dado que** a visão "Por vendedor" mostra a linha de Leo
- **Quando** o gestor clica nela
- **Então** a tela volta para a lista detalhada filtrada por Leo — com a ficha "Vendedor: Leo Comercial" acima da tabela, removível —, mostrando as 4 solicitações dele com os demais filtros mantidos; o mesmo vale para fornecedor e filial, com a ficha do grupo aberto

**C-13 — Os grupos paginam**
- **Dado que** o filtro deixa 2 vendedores
- **Quando** o quadro é pedido de 1 em 1 grupo
- **Então** a primeira página traz Leo, a segunda o admin, e o total informado é 2 grupos

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-01 | A avaliação de uma solicitação DEVE mostrar as vendas do produto na filial da solicitação mês a mês, nos seis meses fechados e no corrente como parcial, com o valor em cada barra, total e média | C-01 | must |
| RF-02 | A venda do apoio DEVE ser a venda válida do sistema, sem órgão público, sem venda entre filiais da rede e sem remessa de entrega futura, e só na filial da solicitação | C-02 | must |
| RF-03 | A avaliação DEVE mostrar os cinco clientes que mais compraram o produto na filial nos mesmos meses do gráfico, com código, nome, quantidade, notas e última compra | C-03 | must |
| RF-04 | A avaliação DEVE dizer onde está o cliente da solicitação nessa leitura — entre os cinco, fora deles com a quantidade, sem compra, ou sem cliente informado | C-04 | must |
| RF-05 | A avaliação DEVE mostrar o estoque disponível, o que está a caminho e a cobertura em dias na filial, e "sem giro" quando não há venda | C-05 | must |
| RF-06 | Falha de uma leitura do apoio DEVE aparecer como falha daquela parte, sem zerar nada e sem impedir aprovar ou recusar | C-06 | must |
| RF-07 | A fila DEVE ter quatro visões: detalhada (a da 008), por vendedor, por fornecedor e por filial | C-08, C-09 | must |
| RF-08 | Cada grupo DEVE mostrar total de solicitações, produtos distintos, pendentes, na fila, em compra, atendidas, não atendidas, recusadas ou canceladas e a data da mais recente; as seis situações somam o total | C-08 | must |
| RF-09 | As visões agrupadas DEVEM obedecer aos mesmos filtros e ao mesmo recorte do comercial da lista detalhada, aplicados no servidor | C-10, C-11 | must |
| RF-10 | Abrir um grupo DEVE voltar à lista detalhada filtrada por ele, com a ficha do filtro removível | C-12 | must |
| RF-11 | As visões agrupadas DEVEM ser paginadas com o total de grupos, do grupo com mais solicitações para o com menos | C-13 | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-01 | Abrir a avaliação custa no máximo **três** consultas ao sistema de origem (vendas por mês, clientes, estoque), qualquer que seja o produto; reabrir a mesma solicitação na mesma visita à tela não consulta de novo | Contador de chamadas ao abrir e reabrir a avaliação |
| RNF-02 | Abrir a tela de solicitações não custa nenhuma consulta a mais por causa desta spec; a visão agrupada custa duas (grupos e total), só quando escolhida | Contador ao abrir a tela e ao trocar de visão |
| RNF-03 | Nenhuma operação desta spec escreve em lugar nenhum | Revisão das consultas |
| RNF-04 | A leitura de clientes cobre até 3.000 notas na janela; acima disso a tela avisa que a lista é parcial | Teste com 3.000 notas |

## Entidades do domínio

- **Apoio à avaliação** — uma leitura, feita no momento da avaliação, do produto na filial da
  solicitação: vendas por mês, os cinco maiores clientes, a posição do cliente da solicitação e o
  estoque. Não é gravada: é lida a cada abertura.
- **Grupo** — o recorte da fila por um vendedor (quem registrou), um fornecedor ou uma filial, com
  as contagens por situação das solicitações que caem nele.

## Regras de negócio

- **RN-01 — A venda do apoio.** É a venda válida do sistema (a mesma da análise do produto e das
  Compras inteligentes): saída de venda com quantidade, fora a venda para a própria rede (ramo
  "filial" ou cliente que é filial do grupo) e fora a remessa de entrega futura, que já contou na
  nota de venda. O órgão público (ramos 11 a 15) fica fora sempre, como no quadro de compras — não
  há seletor. Só conta a filial da solicitação.
- **RN-02 — A janela.** Os seis meses fechados mais o mês corrente, este marcado como parcial; total
  e média são dos seis fechados. A lista de clientes usa **os mesmos sete meses** do gráfico, para a
  soma por cliente bater com as barras. (P-02)
- **RN-03 — Os cinco maiores.** Ordenados pela quantidade, da maior para a menor; empate pelo valor e
  depois pelo código do cliente. Sem venda a cliente privado, a lista diz isso em vez de ficar vazia.
- **RN-04 — O cliente da solicitação.** Sem cliente informado: "Sem cliente informado". Entre os cinco:
  a linha dele marcada. Fora dos cinco, com compra: a quantidade e o número de notas dele. Sem
  compra: "não comprou este produto nesta filial nos meses do gráfico". Nunca se afirma que o
  cliente não comprou quando não há cliente. (P-05)
- **RN-05 — Estoque.** Disponível = físico menos bloqueado, avariado e reservado, nunca negativo. A
  caminho = pedido ao fornecedor mais trânsito. Cobertura = disponível ÷ (média mensal ÷ 30), em
  dias inteiros; média zero é "sem giro". Filial sem posição de estoque mostra "sem posição". (P-04)
- **RN-06 — Falha e vazio.** Cada uma das três leituras falha sozinha e diz que falhou; nenhuma vira
  zero. Vazio de verdade (não vendeu) é zero escrito nas barras. Acima de 3.000 notas, a lista de
  clientes avisa que é parcial.
- **RN-07 — Situações do grupo.** Cada solicitação cai em exatamente uma: **pendente** (aguarda
  avaliação), **na fila** (aprovada, sem pedido), **em compra** (aprovada, num pedido ainda em
  andamento — da montagem ao faturamento), **atendida**, **não atendida** e **recusada ou
  cancelada**. As seis somam o total do grupo. A situação de atendimento é a da 008 (RN-008),
  derivada a cada leitura. (P-06)
- **RN-08 — Rótulo do grupo.** Vendedor: o nome de quem registrou. Fornecedor: o nome gravado na
  solicitação (a foto da RN-004 da 008). Filial: o nome gravado, ou o código quando não há nome.
- **RN-09 — Filtros e recorte.** Os filtros da lista (situação, atendimento, fornecedor, filial,
  autoria, busca e o vendedor do grupo aberto) valem para os grupos. O comercial agrupa só o que
  registrou, no servidor. (P-08)
- **RN-10 — Ordem e paginação.** Do grupo com mais solicitações para o com menos; empate pela
  solicitação mais recente e depois pela chave. 20 grupos por página, com o total. (P-09)
- **RN-11 — Abrir o grupo.** Aplica o filtro do grupo (vendedor, fornecedor ou filial) e volta à
  lista detalhada; os outros filtros ficam. O filtro de vendedor aparece como ficha removível. (P-07)

## Propostas (decisões de negócio em aberto)

Cada proposta foi implementada com a opção recomendada; o usuário pode trocar qualquer uma.

| # | Pergunta | Recomendada (implementada) | Alternativas |
|---|---|---|---|
| P-01 | Onde o apoio aparece? | Na janela **Avaliar** da fila de solicitações — é ali que se decide. O bloco de solicitações do pedido em montagem não ganha o apoio: o card já tem a análise completa do produto. | Também no registro da solicitação, como o legado (o vendedor veria antes de pedir); também no detalhe, para quem só lê |
| P-02 | Que meses entram nos cinco maiores clientes? | Os **mesmos sete do gráfico** (seis fechados e o corrente), para a soma bater com as barras | Os seis meses corridos até hoje, como o legado (`ADD_MONTHS(-6)`), que não batem com nenhuma barra |
| P-03 | O órgão público entra? | **Fora sempre**, sem seletor, como no quadro de compras (R-131); venda entre filiais e remessa futura também fora | Seletor "com órgão público", como nas Compras inteligentes |
| P-04 | O que mais o apoio mostra além de vendas e clientes? | **Estoque disponível, a caminho e cobertura** na filial (o legado mostrava estoque, trânsito e pedido em aberto) | Também a previsão de chegada e o estoque bloqueado por lote (o legado mostrava os dois) — ficam para depois |
| P-05 | O cliente da solicitação é destacado? | **Sim**: marcado na lista se estiver entre os cinco, e uma linha com a quantidade dele se estiver fora — é a pergunta que a avaliação faz | Não destacar, como o legado |
| P-06 | Quais colunas o grupo tem? | Total, **produtos distintos** e as **seis situações que somam o total** (pendente, na fila, em compra, atendida, não atendida, recusada ou cancelada), mais a data da mais recente | As do legado: quantidade total (soma unidades de produtos diferentes, um número sem unidade), pendentes, em compra, atendidas e os nomes dos três produtos principais |
| P-07 | O que acontece ao abrir um grupo? | **Filtra a lista detalhada** pelo grupo, com ficha removível | Uma janela com as solicitações do grupo, como o legado |
| P-08 | Onde se agrupa? | **No servidor**, sobre a fila inteira filtrada e com o recorte do comercial — a lista do SGC 2 é paginada no servidor, e agrupar só a página à vista mentiria | Em memória sobre a página, como o legado (que carregava tudo) |
| P-09 | Em que ordem vêm os grupos? | **Mais solicitações primeiro**, empate pela mais recente (o legado) | Alfabética |

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-01 | as vendas do 5311 na filial 3 devolvem, nos sete meses, 20, 40, 10, 50, 35, 40 e 20 sem o público (contagem > 0); a série do gráfico tem 7 pontos com o último parcial, total 195 e média 32,5 | regra de negócio + regra de tela |
| C-02 | as notas do 5311 na filial 3 sem público não trazem o órgão público, a filial da rede, a remessa futura, a venda da filial 1 nem a entrada; com o público, o órgão público aparece | regra de negócio |
| C-03 | os cinco maiores devolvem 9311 (70), 9312 (50), 9313 (40), 9314 (30), 9315 (20), sem o 9316, e com quantidade, notas e última compra | regra de negócio + regra de tela |
| C-04 | cliente 9311 → marcado na lista; 9316 → fora dos cinco, 5 un. em 1 nota; 9399 → não comprou; 0 → sem cliente informado | regra de tela |
| C-05 | o estoque da filial 3 devolve disponível 65 e a caminho 36; com média 32,5 a cobertura é 60 dias; média 0 é sem giro; filial ausente é sem posição | regra de negócio + regra de tela |
| C-06 | leitura com falha devolve o estado de falha daquela parte e as outras seguem; nada vira zero | regra de tela |
| C-07 | sem notas, a lista de clientes é vazia com o aviso; a série tem 7 zeros | regra de tela |
| C-08 | a visão por vendedor com o fornecedor 1099 devolve 2 grupos, Leo (4: 1/1/1/0/0/1, 2 produtos) antes do admin (3: 0/0/0/1/1/1); as seis colunas somam o total em toda linha | regra de negócio + regra de tela |
| C-09 | por fornecedor: 1 grupo de 7 com o nome do fornecedor; por filial: Norte (4) antes de Matriz (3), com os nomes | regra de negócio |
| C-10 | com status pendente, só Leo com 1; com atendimento atendida, só o admin com 1; com a busca pelo produto, só as do produto | regra de negócio |
| C-11 | Leo chamando a mesma visão recebe 1 grupo, o dele, com 4 | regra de negócio |
| C-12 | abrir o grupo de vendedor, de fornecedor e de filial devolve o filtro certo (vendedor, codfornec, codfilial) e a visão detalhada | regra de tela |
| C-13 | com limite 1, a página 1 é Leo e a 2 é o admin; o total é 2 | regra de negócio |
| RN-01 | ver C-02 | regra de negócio |
| RN-02 | a janela dos clientes vai do dia 1 do sexto mês fechado até hoje, os mesmos 7 meses da série | regra de tela |
| RN-03 | empate na quantidade desempata pelo valor e depois pelo código | regra de tela |
| RN-04 | ver C-04 | regra de tela |
| RN-05 | ver C-05; disponível nunca negativo | regra de negócio + regra de tela |
| RN-06 | 3.000 notas marcam a lista como parcial; 2.999, não | regra de tela |
| RN-07 | a partição em seis situações soma o total; em compra exclui sem pedido, atendida e não atendida | regra de negócio + regra de tela |
| RN-08 | rótulo vazio vira "Sem vendedor", "Sem fornecedor" ou o código da filial | regra de tela |
| RN-09 | ver C-10 e C-11 | regra de negócio |
| RN-10 | ver C-08, C-09 e C-13; dimensão desconhecida devolve nenhum grupo | regra de negócio |
| RN-11 | ver C-12 | regra de tela |

- O que só olho humano verifica fica em **Verificação manual**:
  - [x] C-01..C-05 — o apoio na janela Avaliar (gráfico com o valor em cada barra, clientes, estoque), nos dois temas (simulador 3111/5181, 2026-11-03)
  - [x] C-08..C-12 — o alternador de visões, o quadro agrupado e a ficha do grupo aberto, nos dois temas (idem)

## Fora de escopo

- [ ] **Apoio no registro da solicitação ou no detalhe** — P-01; o legado mostrava no registro.
- [ ] **Previsão de chegada e estoque bloqueado por lote no apoio** — P-04.
- [ ] **Seletor de órgão público no apoio** — P-03.
- [ ] **Gráfico das visões agrupadas** — o quadro é tabela; o ranking por vendedor com aderência já existe nas análises (009).
- [ ] **Quantidade total e produtos principais por grupo** — P-06.
- [ ] **Exportar a visão agrupada** — não foi pedido; a exportação do rastreio (008) continua.
- [ ] **Apoio no bloco de solicitações do pedido em montagem** — o card já tem a análise do produto (P-01).
- [ ] **Qualquer escrita** — as duas funções desta spec só leem.

## Pendências

Cada item aqui **bloqueia** o `plan.md`.

- Nenhuma. As decisões em aberto são as propostas P-01..P-09, implementadas com a opção recomendada.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-06, C-07, C-11)
- [x] Seção "Testes" preenchida: todo C-NN e toda RN-NN com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto
