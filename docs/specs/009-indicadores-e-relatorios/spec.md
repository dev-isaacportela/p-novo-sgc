# Spec: Indicadores e relatórios — o painel de gestão de compras

**ID:** 009-indicadores-e-relatorios · **Status:** rascunho · **Data:** 2026-09-15

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

A gestão de compras enxerga o processo um pedido de cada vez. Para responder
"quantos pedidos estão parados", "de quem é o atraso — nosso ou da indústria",
"quanto compramos contra quanto vendemos" ou "quanto do que o comercial pediu
virou compra", alguém abre o quadro, conta cartão por cartão e monta uma
planilha à mão. A conta muda de pessoa para pessoa, sai diferente na reunião da
semana seguinte, e ninguém consegue dizer se piorou ou melhorou.

O atraso é o caso mais caro. Hoje o sistema só sabe dizer que o pedido está há
N dias numa fase; não sabe dizer se **esse** fornecedor prometeu faturar em 1 ou
em 5 dias úteis, nem separar o tempo que é responsabilidade de Compras (montar e
enviar o pedido) do tempo que é da indústria (faturar e entregar). Sem essa
separação, a cobrança vira discussão: a indústria diz que o pedido chegou tarde
e a área de compras diz que a indústria demorou a faturar, e não há número que
resolva.

Do lado das consultas recorrentes é pior: cada pergunta nova ("os pedidos da
filial Norte acima de R$ 50 mil do trimestre") é um pedido de TI ou uma
exportação manual do quadro, e a resposta não fica guardada em lugar nenhum.

## Resultado esperado

A gestão abre uma tela e lê, em números que todo mundo enxerga igual: quantos
pedidos estão em cada etapa, quais envios saíram fora da data combinada, onde o
prazo estourou e **de quem** é o atraso, quanto se comprou contra quanto se
vendeu por fornecedor, e quanto do que o comercial pediu foi efetivamente
atendido. Quem precisa de um recorte próprio monta o relatório uma vez, salva,
compartilha com a equipe e abre de novo na semana seguinte — ou exporta a mesma
lista que está vendo na tela.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| gestor (gerência de compras) | acompanhar atrasos por etapa, cobrar a indústria com número na mão, comparar fornecedores, exportar o recorte da reunião | diária |
| diretoria | ver a saúde da carteira, o cumprimento de prazo por fornecedor e a aderência do que o comercial pede | semanal |
| analista (comprador) | consultar os indicadores do próprio recorte de trabalho e reaproveitar relatórios salvos | semanal |
| admin (TI) | tudo, e conferir se os números batem com o que o processo registrou | eventual |

O **nível de acesso** da plataforma continua valendo além do perfil: quem tem
acesso somente leitura vê tudo e não salva relatório; quem tem acesso restrito
só enxerga, em qualquer indicador ou relatório, os pedidos que criou. O perfil
**comercial** não aparece na tabela de propósito: ele não vê nenhuma das duas
telas — o que ele acompanha são as próprias solicitações.

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa.

**C-001 — O painel de indicadores abre com os números do período**
- **Dado que** existem pedidos em várias etapas, agendamentos de análise, notas em atraso e produtos em falta
- **Quando** a gestão abre o painel de indicadores no período padrão
- **Então** lê, sem contar nada à mão, quantos pedidos estão abertos e o valor que representam, quantos envios saíram fora da data combinada, quantos pedidos estão sem faturamento completo, quantas notas estão atrasadas, quantos itens estão em falta e quantos fornecedores têm pedido em andamento — e cada um desses números é igual ao que a lista correspondente devolve quando ela é aberta

**C-002 — Um bloco que falha não derruba o painel**
- **Dado que** a consulta de um dos blocos do painel falha
- **Quando** a tela termina de carregar
- **Então** todos os outros blocos aparecem normalmente, o bloco que falhou mostra a mensagem de falha com a ação de tentar de novo, e a tela **não** fica em branco
- **E** um bloco que respondeu sem nenhuma linha diz "sem dados no período", que é uma frase diferente de "não foi possível carregar"

**C-003 — O filtro de filial vale para a tela inteira**
- **Dado que** há pedidos da Matriz e da Filial Norte
- **Quando** a gestão escolhe a Filial Norte no cabeçalho
- **Então** todos os blocos da aba visível passam a contar só os pedidos daquela filial, e voltar para "Todas as filiais" traz os números anteriores

**C-004 — O período nunca envelhece**
- **Dado que** o calendário passou para um mês que ninguém previu quando a tela foi escrita
- **Quando** a gestão abre o seletor de período
- **Então** o mês corrente está lá, junto dos onze anteriores e dos trimestres já iniciados do ano — a lista é derivada da data de hoje, não escrita à mão
- **E** o painel de indicadores usa um intervalo livre de datas (padrão: os últimos 90 dias até hoje), enquanto a comparação de compras e vendas usa mês ou trimestre fechado

**C-005 — Compras contra vendas exige uma filial**
- **Dado que** o cabeçalho está em "Todas as filiais"
- **Quando** a gestão abre a comparação de compras e vendas
- **Então** a tela assume a primeira filial da lista e **diz qual**, em vez de mostrar um número consolidado que não existe

**C-006 — Compras contra vendas por fornecedor**
- **Dado que** no período escolhido a filial 1 comprou 500 unidades de um fornecedor e vendeu 800 unidades de produtos dele
- **Quando** a comparação é carregada
- **Então** aparece uma linha por fornecedor com o comprado e o vendido do período, em quantidade e em valor, ordenada pelo maior vendido, com a venda de licitação numa coluna própria — e o mesmo conteúdo está disponível como tabela, não só como gráfico

**C-007 — Etapa concluída dentro e fora da meta**
- **Dado que** um pedido de um fornecedor com meta de **1 dia útil** para a análise foi criado em 08/09/2026 e enviado em 09/09/2026, e outro pedido do mesmo fornecedor foi criado em 08/09/2026 e enviado em 11/09/2026
- **Quando** a gestão abre a aba de prazos dos pedidos
- **Então** o primeiro aparece com a etapa Análise "no prazo" (1 de 1 dia útil) e o segundo com "concluída com atraso" (3 de 1 dia útil)

**C-008 — Etapa aberta além da meta aponta o responsável**
- **Dado que** um pedido foi enviado em 09/09/2026, o fornecedor tem meta de **5 dias úteis** para faturar e hoje é 18/09/2026 sem nenhuma nota
- **Quando** a lista é carregada
- **Então** a etapa Faturamento aparece como "prazo vencido" (7 de 5 dias úteis) e o pedido inteiro é classificado como **atrasado (fornecedor)**
- **E** se o que estivesse vencido fosse a etapa Análise, o pedido seria **atrasado (compras)**

**C-009 — Último dia da meta é aviso, não atraso**
- **Dado que** o mesmo pedido enviado em 09/09/2026, com meta de 5 dias úteis, é consultado em 16/09/2026
- **Quando** a lista é carregada
- **Então** a etapa aparece como "vence hoje" e o pedido como "atenção", não como atrasado

**C-010 — Fornecedor sem prazo de entrega cadastrado**
- **Dado que** um fornecedor não tem prazo de entrega parametrizado
- **Quando** um pedido dele já tem a primeira nota emitida
- **Então** a etapa Entrega aparece como **"sem meta"**, não como atrasada nem como no prazo, e ela **não entra** no cálculo da nota do pedido

**C-011 — A nota do pedido**
- **Dado que** um pedido gastou 2 dias úteis numa análise de meta 1, faturou em 5 dias úteis com meta 5 e tem a entrega sem meta
- **Quando** a lista é carregada
- **Então** a nota do pedido é **75** (média de 50 e 100, com a entrega fora da conta); com a entrega em 10 dias corridos contra meta de 7, a nota passa a **90** (média de 100, 100 e 70)

**C-012 — Pedido cancelado fica fora**
- **Dado que** um pedido foi cancelado
- **Quando** qualquer número de prazo é calculado
- **Então** ele não entra em nenhuma contagem, nem em nenhuma média, nem na lista

**C-013 — Os números do topo e a lista contam a mesma coisa**
- **Dado que** o mesmo período e a mesma filial estão escolhidos
- **Quando** a gestão compara o número "atrasados" do topo com a lista filtrada por atrasados
- **Então** os dois são iguais, e continuam iguais depois de trocar o período — porque saem da mesma conta, não de duas

**C-014 — Aderência à agenda de análise**
- **Dado que** um pedido nasceu de uma análise agendada para 10/09/2026 e o envio à indústria saiu em 14/09/2026
- **Quando** a lista de prazos é carregada
- **Então** esse pedido aparece como "enviado com atraso", com **4 dias** de diferença; um pedido enviado até a data planejada aparece como "na data planejada"; um pedido sem agendamento aparece como "sem agenda"

**C-015 — A linha do tempo do pedido**
- **Dado que** um pedido passou por três etapas
- **Quando** a gestão expande esse pedido na lista
- **Então** vê cada passagem na ordem em que aconteceu, com a data de entrada e quantos dias ele ficou em cada etapa — a última contada até hoje

**C-016 — Funil e aderência das solicitações do comercial**
- **Dado que** no período existem 20 solicitações: 8 atendidas, 4 esperando avaliação, 2 recusadas e 6 em andamento no fluxo
- **Quando** a gestão abre a aba de solicitações
- **Então** lê a aderência **geral de 40,0 %** (8 de 20) e a aderência **de fluxo de 57,1 %** (8 de 14, sem as que esperam avaliação e as recusadas), mais o tempo médio até a avaliação e o funil por situação de atendimento
- **E** as que ainda não viraram pedido aparecem separadas por decisão (esperando avaliação, recusada, cancelada, aprovada na fila), porque todas elas têm a mesma situação de atendimento: "sem pedido"

**C-017 — Ranking por vendedor**
- **Dado que** três vendedores registraram solicitações no período
- **Quando** o ranking é carregado
- **Então** cada vendedor aparece com total, pendentes, em fluxo, atendidas, não atendidas, recusadas e a própria aderência — **por contagem de solicitações, sem valor em reais**

**C-018 — Criar um relatório salvo**
- **Dado que** a gestão montou um recorte (filtros, colunas, agrupamento e gráfico) que quer repetir
- **Quando** salva com um título
- **Então** o relatório passa a aparecer na galeria com o autor e a data, e abrir de novo reproduz exatamente o recorte salvo — inclusive depois de sair e voltar

**C-019 — Quem edita e quem exclui um relatório**
- **Dado que** um relatório foi criado por uma pessoa
- **Quando** outra pessoa o abre
- **Então** ela consegue usar o relatório, e os botões de editar e excluir aparecem **desabilitados com o motivo**; a pessoa que criou e o administrador conseguem editar e excluir
- **E** tentar alterar por outro caminho é recusado, sem alterar nada

**C-020 — Compartilhar**
- **Dado que** um relatório está marcado como compartilhado e outro não
- **Quando** um colega abre a galeria
- **Então** ele vê o compartilhado e **não** vê o que não foi compartilhado; o autor vê os dois

**C-021 — A consulta do relatório, paginada e com filtros desligados**
- **Dado que** um relatório não tem nenhum filtro preenchido
- **Quando** ele é executado
- **Então** devolve os pedidos da primeira página com o total geral ao lado, e preencher um filtro (etapa, fornecedor, filial, responsável, prioridade ou período de criação) reduz o resultado sem mudar nada mais
- **E** navegar para a segunda página traz linhas diferentes, sem repetir nem pular

**C-022 — Agrupar e medir**
- **Dado que** o relatório está agrupado por etapa
- **Quando** a medida é trocada entre "quantidade de pedidos", "valor total" e "média de dias na etapa"
- **Então** o gráfico e a tabela mostram um valor por etapa, coerente com as linhas da consulta — e trocar o agrupamento para fornecedor, filial, responsável ou prioridade reagrupa o mesmo conjunto

**C-023 — Exportar o que está na tela**
- **Dado que** o relatório devolveu 40 linhas na página e a gestão escolheu 6 colunas
- **Quando** clica em exportar
- **Então** o arquivo traz o mesmo cabeçalho e as mesmas 40 linhas, nas mesmas colunas e na mesma ordem em que estão na tela

**C-024 — Todo gráfico tem tabela**
- **Dado que** qualquer bloco visual do painel está na tela
- **Quando** a pessoa escolhe a visão de tabela daquele bloco
- **Então** vê os mesmos dados em números, com os mesmos rótulos e a mesma ordem — a tabela é a versão acessível do gráfico, não um extra

**C-025 — Quem pode o quê**
- **Dado que** o comercial, a diretoria, um usuário somente leitura e um usuário de acesso restrito abrem o sistema
- **Quando** procuram as duas telas
- **Então** o comercial não vê nenhuma das duas, nem pelo menu nem pelo endereço direto; a diretoria vê tudo com os botões de salvar, editar e excluir relatório desabilitados; o somente leitura idem; e o acesso restrito vê as telas contando **apenas os pedidos que criou**

**C-026 — Perfil de desempenho por fornecedor**
- **Dado que** dois fornecedores tiveram pedidos no período
- **Quando** a gestão abre o bloco de perfil por fornecedor
- **Então** vê, por fornecedor, quantos pedidos, a média de dias de cada etapa e o percentual de pedidos que terminaram no prazo — ordenado do que mais tem pedido para o que menos tem

**C-027 — Tempo médio por etapa do processo**
- **Dado que** os pedidos passaram por várias etapas no período
- **Quando** a gestão abre o bloco de tempo por etapa
- **Então** vê quantos dias, em média, um pedido fica em cada etapa do processo e quantas passagens sustentam cada média

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE agregar todos os indicadores no servidor e exibir valores prontos, sem recontar na tela | Nenhum número do painel é somado a partir de uma lista carregada por outro motivo (C-001) | must |
| RF-002 | Cada bloco DEVE carregar de forma independente e em paralelo; a falha de um NÃO DEVE impedir os demais | Com um bloco falhando, os outros aparecem e o que falhou mostra o erro (C-002) | must |
| RF-003 | O sistema DEVE distinguir "sem dados no período" de "não foi possível carregar" | Duas frases diferentes, verificáveis na tela (C-002) | must |
| RF-004 | O filtro de filial DEVE ficar no cabeçalho e valer para todos os blocos da aba | Trocar a filial recorta todos os blocos (C-003) | must |
| RF-005 | A lista de períodos DEVE ser derivada da data corrente | O mês corrente sempre está na lista (C-004) | must |
| RF-006 | A comparação de compras e vendas DEVE exigir uma filial e, sem escolha, assumir a primeira **dizendo qual** | Subtítulo do bloco nomeia a filial assumida (C-005) | must |
| RF-007 | O sistema DEVE medir cada pedido em três etapas — Análise (compras), Faturamento (fornecedor) e Entrega (fornecedor) — contra as metas cadastradas do fornecedor, em dias úteis (Entrega também em dias corridos, conforme o cadastro) | C-007, C-008, C-010 | must |
| RF-008 | Cada etapa DEVE receber exatamente um destes sete estados: no prazo, concluída com atraso, em andamento, vence hoje, prazo vencido, não iniciada, sem meta | Nenhuma etapa aparece sem estado ou com um oitavo (RN-002) | must |
| RF-009 | O pedido DEVE ser classificado como atrasado (compras), atrasado (fornecedor), concluído, atenção ou no prazo, nessa ordem de precedência | C-008, C-009 | must |
| RF-010 | O sistema DEVE calcular uma nota de 0 a 100 por pedido, como média das etapas iniciadas que têm meta | 75 e 90 nos dois exemplos (C-011) | must |
| RF-011 | Pedidos cancelados NÃO DEVEM entrar em nenhuma leitura de prazo | C-012 | must |
| RF-012 | Os números do topo e a lista de prazos DEVEM sair da mesma conta | Total do topo = total da lista sem filtro, em qualquer período (C-013) | must |
| RF-013 | O sistema DEVE comparar a data planejada da análise agendada com a data real do envio e classificar a aderência | C-014 | must |
| RF-014 | O sistema DEVE mostrar a passagem do pedido por etapa, com data de entrada e dias em cada uma | C-015 | must |
| RF-015 | O sistema DEVE apresentar o funil das solicitações do comercial por situação, o tempo médio até a avaliação e as duas aderências (geral e de fluxo), por contagem | 40,0 % e 57,1 % no exemplo (C-016) | must |
| RF-016 | O sistema DEVE apresentar o ranking por vendedor solicitante, sem valor em reais | C-017 | must |
| RF-017 | O sistema DEVE permitir salvar, abrir, editar, excluir e compartilhar relatórios com filtros, colunas, agrupamento, gráfico e visão | C-018, C-019, C-020 | must |
| RF-018 | Editar e excluir um relatório DEVEM ser possíveis só para quem o criou e para o administrador, verificado no servidor | C-019 | must |
| RF-019 | A consulta do relatório DEVE ser paginada, com total, e aceitar todos os filtros desligados | C-021 | must |
| RF-020 | O sistema DEVE agregar a consulta do relatório por etapa, fornecedor, filial, responsável ou prioridade, com contagem, soma de valor e média de dias na etapa | C-022 | must |
| RF-021 | O sistema DEVE exportar a consulta do relatório com o mesmo cabeçalho, as mesmas colunas e as mesmas linhas mostradas | C-023 | must |
| RF-022 | Toda visualização DEVE ter alternativa em tabela | C-024 | must |
| RF-023 | As duas telas DEVEM ser vistas por admin, gestor, diretoria e analista; salvar relatório é de admin, gestor e analista; o comercial não vê nenhuma das duas, nem pelo endereço direto | C-025 | must |
| RF-024 | Quem tem acesso restrito DEVE ver apenas os pedidos que criou em todos os indicadores e relatórios | C-025 | must |
| RF-025 | O sistema DEVE apresentar o perfil por fornecedor (pedidos, média por etapa, percentual no prazo) e o tempo médio por etapa do processo | C-026, C-027 | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Abrir uma aba custa no máximo **5** consultas ao servidor, disparadas em paralelo; trocar a filial ou o período recarrega só a aba visível | Contador de chamadas ao abrir cada uma das quatro abas |
| RNF-002 | As duas listagens paginadas respondem em até 2 s com 2 mil pedidos; nenhuma outra consulta desta feature devolve mais de 50 linhas | Cronômetro e limite declarado em cada consulta |
| RNF-003 | Nenhuma leitura desta feature escreve nada, nem no sistema nem no ERP | Revisão das consultas |
| RNF-004 | A régua de prazo existe uma vez para os números e uma vez para a tela, e as duas dão o mesmo resultado para os mesmos marcos | Teste que compara as duas, linha a linha, sobre os pedidos existentes |
| RNF-005 | Nenhum texto de consulta é montado na tela: o recorte do relatório é um conjunto fechado de filtros | Revisão do que a tela envia |
| RNF-006 | Cor de série vem da paleta de dados; estado nunca é sinalizado só por cor | Revisão visual e checklist do sistema visual |

## Entidades do domínio

- **Indicador** — um número agregado sobre um período e uma filial (pedidos abertos, envios atrasados, faturamentos pendentes, notas em atraso, itens em falta, fornecedores com pedido). Não é guardado: é sempre recalculado da operação.
- **Etapa do pedido** — um trecho medido da vida do pedido, com um marco de início, um marco de fim, uma meta do fornecedor e um estado. São três: Análise, Faturamento e Entrega.
- **Prazo do pedido** — a leitura das três etapas juntas: de quem é o atraso e a nota de 0 a 100.
- **Aderência à agenda** — a comparação entre a data planejada da análise e a data real do envio.
- **Funil de solicitações** — a distribuição das solicitações do comercial por situação de atendimento, e a fração delas que terminou atendida.
- **Relatório salvo** — um recorte nomeado (filtros, colunas, agrupamento, gráfico e visão) que pertence a quem o criou e pode ser compartilhado com a equipe.

## Regras de negócio

- **RN-001 — Os marcos de cada etapa.** Análise vai da criação do pedido até o envio à indústria; Faturamento vai do envio até a **primeira** nota do pedido; Entrega vai da primeira nota até o recebimento consolidado — que só existe quando todas as notas do pedido foram recebidas e o pedido está 100 % faturado em valor, ou quando o pedido foi concluído. Enquanto o marco de fim não existe, a etapa é medida **até hoje**; se o pedido foi concluído sem que ela fechasse, é medida **até a conclusão do pedido**, nunca até hoje.
- **RN-002 — Os sete estados de uma etapa.** `não iniciada` (o marco de início não existe); `sem meta` (o fornecedor não tem aquele prazo cadastrado — só acontece na Entrega); `no prazo` e `concluída com atraso` (etapa fechada, dentro ou fora da meta); `prazo vencido`, `vence hoje` e `em andamento` (etapa aberta, com dias acima, iguais ou abaixo da meta). Não existe um oitavo estado.
- **RN-003 — Dias úteis.** Dia útil é de segunda a sexta; feriado não conta. A contagem conta o dia de chegada e não o de partida (sexta para segunda = 1; segunda para sábado = 4; mesmo dia = 0). Conferência: 24/08/2026 mais 15 dias úteis é 14/09/2026. A etapa Entrega conta em dias úteis ou corridos, conforme o cadastro do fornecedor; as outras duas sempre em dias úteis.
- **RN-004 — Metas padrão.** Sem parametrização, a meta da Análise é **1 dia útil** e a do Faturamento **5 dias úteis**. A Entrega **não** tem padrão: sem prazo cadastrado ela é `sem meta` e não pontua.
- **RN-005 — Classificação do pedido.** Análise vencida faz o pedido **atrasado (compras)**; na falta dela, Faturamento ou Entrega vencida faz **atrasado (fornecedor)**; na falta das duas, pedido concluído é **concluído**; qualquer etapa em "vence hoje" é **atenção**; o resto é **no prazo**. Nessa ordem.
- **RN-006 — A nota do pedido.** Por etapa iniciada e com meta, a nota é `menor entre 100 e (100 × meta ÷ dias gastos)`, arredondada; a nota do pedido é a média dessas notas, arredondada. Etapa não iniciada ou sem meta fica fora da média. Pedido sem nenhuma etapa medida tem nota 0.
- **RN-007 — Cancelado fora.** Pedido na etapa de cancelados não entra em nenhuma leitura de prazo: nem nos números, nem nas médias, nem na lista.
- **RN-008 — Aderência à agenda.** `na data planejada` (o envio saiu até a data planejada), `enviada com atraso` (saiu depois), `pendente e atrasada` (ainda não saiu e a data já passou), `dentro do planejado` (ainda não saiu e a data não chegou), `sem agenda` (o pedido não nasceu de um agendamento). Os dias de atraso são dias corridos entre a data planejada e o envio — ou hoje, se ainda não houve envio —, nunca negativos.
- **RN-009 — Aderência das solicitações.** É contagem, nunca valor: aderência **geral** = atendidas ÷ todas as solicitações do período; aderência **de fluxo** = atendidas ÷ (todas − as que esperam avaliação − as recusadas). Sem solicitações no período, as duas ficam vazias, não zero. O funil precisa de **duas leituras** da mesma solicitação para essa conta: a **decisão** (esperando avaliação, aprovada, recusada, cancelada) e a **situação de atendimento** — quem ainda não virou pedido tem todas a mesma situação ("sem pedido"), e só a decisão as separa.
- **RN-010 — Situação da solicitação é derivada.** A situação de atendimento vem da etapa do pedido a que a solicitação está ligada e do estado do item, calculada na hora da consulta. Esta feature **lê** essa situação da mesma régua que a tela de solicitações usa; não tem régua própria.
- **RN-011 — Períodos derivados de hoje.** A comparação de compras e vendas oferece os doze meses terminados no mês corrente e os trimestres já iniciados do ano, sempre calculados a partir de hoje; o padrão é o mês corrente. O painel de indicadores usa intervalo livre, com padrão dos últimos 90 dias até hoje.
- **RN-012 — Filial na comparação de compras e vendas.** Essa comparação casa movimento de entrada com movimento de saída por filial e não existe consolidada: sem filial escolhida, vale a primeira da lista, e a tela diz qual.
- **RN-013 — Dono do relatório.** Edita e exclui quem criou, e o administrador. Relatório compartilhado é visível a todos que enxergam a tela; relatório não compartilhado só ao autor. Título vazio é recusado.
- **RN-014 — Filtro desligado, período e limite.** Filtro não preenchido não filtra — e "não filtra" quer dizer que o resultado é o mesmo de não ter mandado o filtro, nunca uma lista vazia. O **período** é a exceção declarada: nos indicadores ele é obrigatório (todo bloco diz de que período está falando), e só o período de criação do relatório pode ficar em branco. As duas listagens paginadas trazem o total ao lado; os blocos de gráfico trazem no máximo 50 linhas, com o corte declarado no bloco.
- **RN-015 — Recorte por acesso restrito.** Quem tem acesso restrito vê, em qualquer indicador, lista ou relatório desta feature, só os pedidos que criou — a mesma regra que já vale no quadro.
- **RN-016 — A régua é uma só.** Os números do topo, a lista e o perfil por fornecedor saem da mesma conta de etapas; a tela não recalcula prazo por conta própria — quando ela precisa mostrar o estado de uma etapa, usa a mesma régua, conferida contra a do servidor por teste.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | cada número do resumo é conferido contra uma contagem feita no próprio teste sobre os mesmos dados (pedidos abertos, envios fora da data, faturamentos pendentes, notas atrasadas, itens em falta, fornecedores) — nenhum literal absoluto | regra de negócio |
| C-002 | com um bloco resolvido e outro rejeitado, a função que monta o painel devolve o primeiro com linhas e o segundo com erro; bloco sem linha devolve "vazio", não "erro" | regra de tela |
| C-003 | o resumo com filial `1` e com filial `2` devolve números diferentes, e cada um bate com a contagem da própria filial feita no teste | regra de negócio |
| C-004 | a lista de períodos gerada para 15/09/2026 tem 12 meses terminando em setembro/2026 e 3 trimestres; gerada para 02/01/2027 tem janeiro/2027 no topo e 1 trimestre | regra de tela |
| C-005 | sem filial, a função que escolhe o recorte devolve a primeira da lista e o texto "Filial: <nome>"; com filial escolhida, devolve a escolhida e nenhum aviso | regra de tela |
| C-006 | a comparação da filial 1 no período do seed devolve **mais de zero** linhas, com quantidade comprada e vendida por fornecedor e a coluna de licitação; a consulta ao ERP nunca volta vazia | regra de negócio |
| C-007 | criação 08/09, envio 09/09, meta 1 → 1 dia e `no prazo`; criação 08/09, envio 11/09, meta 1 → 3 dias e `concluída com atraso` | regra de tela + regra de negócio |
| C-008 | envio 09/09, sem nota, hoje 18/09, meta 5 → 7 dias, `prazo vencido` e pedido `atrasado (fornecedor)`; com a Análise vencida, pedido `atrasado (compras)` | regra de tela + regra de negócio |
| C-009 | envio 09/09, sem nota, hoje 16/09, meta 5 → 5 dias, `vence hoje` e pedido `atenção` | regra de tela + regra de negócio |
| C-010 | fornecedor sem prazo de entrega → etapa `sem meta`, fora da média da nota | regra de tela + regra de negócio |
| C-011 | (2 dias/meta 1) + (5/5) + sem meta → nota 75; (1/1) + (5/5) + (10 corridos/meta 7) → nota 90 | regra de tela + regra de negócio |
| C-012 | o pedido na etapa de cancelados do seed não aparece na lista de prazos nem entra no total do topo | regra de negócio |
| C-013 | para o mesmo período e filial, o total do topo é igual ao total da listagem sem filtro, e o número de atrasados é igual à contagem da listagem filtrada por atrasados | regra de negócio |
| C-014 | pedido ligado a um agendamento com data planejada e envio 4 dias depois → `enviada com atraso` e 4 dias; envio até a data → `na data planejada`; pedido sem agendamento → `sem agenda` | regra de negócio |
| C-015 | a linha do tempo de um pedido com N passagens devolve N linhas, na ordem, com dias em cada etapa e a última contada até hoje | regra de negócio |
| C-016 | funil com 8 atendidas, 4 esperando avaliação, 2 recusadas e 6 em fluxo → geral 40,0 % e fluxo 57,1 %, com as 4 e as 2 lidas da **decisão** e as 8 e as 6 da **situação**; funil vazio → as duas vazias, não zero | regra de tela |
| C-017 | o ranking devolve uma linha por vendedor do período, com total, pendentes, em fluxo, atendidas, não atendidas, recusadas e aderência, e nenhuma coluna de valor | regra de negócio |
| C-018 | salvar devolve o relatório na listagem com título, autor e o recorte gravado; reler devolve o mesmo recorte, campo a campo | regra de negócio |
| C-019 | editar e excluir como o autor funciona; como outra pessoa não altera nada (contagem e conteúdo iguais antes e depois); como administrador funciona; a listagem marca quem pode editar cada relatório | regra de negócio |
| C-020 | relatório não compartilhado não aparece para outra pessoa e aparece para o autor; compartilhado aparece para os dois | regra de negócio |
| C-021 | consulta com todos os filtros desligados devolve a 1ª página e o total; cada filtro isolado reduz o resultado; a 2ª página não repete nenhuma linha da 1ª | regra de negócio |
| C-022 | agregar por etapa devolve uma linha por etapa presente, com contagem, soma de valor e média de dias coerentes com as linhas da consulta; trocar o campo reagrupa | regra de negócio |
| C-023 | o arquivo exportado tem o cabeçalho das colunas escolhidas e uma linha por linha da tela, na mesma ordem | regra de tela |
| C-024 | a série de cada gráfico e a tabela alternativa saem da mesma função: mesmos rótulos, mesmos valores, mesma ordem | regra de tela |
| C-025 | as chaves de permissão por persona batem com a matriz; salvar como diretoria e como somente leitura é recusado sem gravar; como acesso restrito, o resumo e a listagem contam só os pedidos criados por quem chama | regra de tela + regra de negócio |
| C-026 | o perfil devolve uma linha por fornecedor do período, com contagem de pedidos e médias, e a contagem bate com a feita no teste | regra de negócio |
| C-027 | o tempo por etapa devolve uma linha por etapa com passagens e média; a contagem de passagens bate com a do histórico de movimentação | regra de negócio |
| RN-001 | pedido sem envio mede a Análise até hoje; pedido concluído sem nota mede o Faturamento até a conclusão, não até hoje | regra de tela + regra de negócio |
| RN-002 | as sete entradas de estado devolvem os sete rótulos; um estado desconhecido cai em "sem estado" sem quebrar | regra de tela |
| RN-003 | 24/08/2026 + 15 dias úteis = 14/09/2026; entre 24/08 e 14/09 há 15; sexta→segunda 1; segunda→sábado 4; mesmo dia 0 | regra de tela + regra de negócio |
| RN-004 | fornecedor sem metas cadastradas → 1 e 5 dias úteis; Entrega sem prazo → `sem meta` | regra de negócio |
| RN-005 | as cinco combinações de precedência devolvem a classificação certa, inclusive análise vencida + faturamento vencido → `atrasado (compras)` | regra de tela |
| RN-006 | (2,1)+(5,5) → 75; (1,1)+(5,5)+(10,7) → 90; nenhuma etapa medida → 0; etapa com 0 dias não divide por zero | regra de tela |
| RN-007 | o pedido cancelado do seed não aparece em nenhuma das quatro consultas de prazo | regra de negócio |
| RN-008 | as cinco situações de agenda e os dias de atraso, inclusive o caso "envio antes da data planejada" com 0 dias | regra de tela + regra de negócio |
| RN-009 | 8/20 → 40,0 e 8/14 → 57,1, separando as que esperam avaliação das recusadas pela decisão (as duas têm a mesma situação); total zero → vazio, não zero | regra de tela |
| RN-010 | a soma do funil por situação é igual à contagem das solicitações do período lidas pela tela de solicitações, situação a situação | regra de negócio |
| RN-011 | a lista de períodos derivada de 15/09/2026 e de 02/01/2027; o intervalo padrão dos indicadores tem 90 dias e termina hoje | regra de tela |
| RN-012 | a consulta de compras e vendas com filial vazia devolve zero linhas, e a tela nunca a chama assim | regra de tela + regra de negócio |
| RN-013 | título vazio é recusado; alterar relatório de outra pessoa não grava; excluir o próprio grava | regra de negócio |
| RN-014 | o período de criação em branco na consulta do relatório devolve o **mesmo** total que a contagem de todos os pedidos feita no teste (não reduz, não zera); os demais filtros desligados idem; o total acompanha o filtro; cada bloco de gráfico devolve no máximo 50 linhas | regra de negócio |
| RN-015 | como usuário de acesso restrito, o resumo e a listagem só contam os pedidos criados por ele; como usuário normal, contam todos | regra de negócio |
| RN-016 | para **cada** pedido devolvido pela listagem, a régua da tela reproduz, a partir dos mesmos marcos, os três estados e a nota que o servidor calculou | regra de tela + regra de negócio |

- O que só olho humano verifica fica em **Verificação manual**:
  - [ ] C-001 — o painel nas duas alturas (números no topo, gráficos abaixo), nos dois temas
  - [ ] C-002 — um bloco com erro ao lado de blocos com dado, sem a tela parecer quebrada
  - [ ] C-024 — o par gráfico/tabela em cada bloco, e a legenda a partir de duas séries
  - [ ] C-019 / C-025 — botões desabilitados com o motivo (nunca escondidos) para a diretoria e para o somente leitura
  - [ ] C-022 — o construtor de relatório: escolher colunas, agrupar, trocar a medida e o tipo de gráfico

## Fora de escopo

- [ ] **Planilha do Excel (`.xlsx`)** — a exportação é em texto separado por ponto e vírgula, que o Excel abre; nenhuma biblioteca de planilha entra (decisão do 000).
- [ ] **Gráfico de pizza, rosca e área polar** — o mesmo dado cabe numa barra ordenada, que ainda mostra o valor.
- [ ] **Faixas de cor para o percentual de compras sobre vendas** (35 % / 58 % / 100 % do sistema anterior) — os cortes nunca foram decididos como regra de negócio; a tela mostra o percentual e não julga.
- [ ] **Consulta livre escrita pelo usuário** — o recorte do relatório é um conjunto fechado de filtros e campos; ninguém digita o texto da consulta.
- [ ] **Agendar o envio de um relatório por e-mail** — nenhuma rotina automática nasce aqui.
- [ ] **Lotes promocionais a vencer** — indicador do sistema anterior que pertence a Compras Inteligentes (onda 4).
- [ ] **Sugestão de compra, curva ABC e cobertura** — onda 4.
- [ ] **Indicadores de movimentação, perdas e ruptura** — onda 5.
- [ ] **Escrita de qualquer tipo sobre pedidos, notas ou solicitações** — esta feature só lê; a única coisa que ela grava é o próprio relatório salvo.
- [ ] **Feriados na contagem de dias úteis** — segunda a sexta, sem calendário de feriados.
- [ ] **Histórico dos indicadores** — nada é fotografado no tempo; todo número é recalculado da operação.

## Pendências

Cada item aqui **bloqueia** o `plan.md`.

- Nenhuma.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-002, C-005, C-010, C-012, C-019, C-020, C-025)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto
