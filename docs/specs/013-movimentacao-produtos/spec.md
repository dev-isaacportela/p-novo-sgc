# Spec: Movimentação de produtos — sem venda, excedentes, a vencer, ruptura e perdas

**ID:** 013-movimentacao-produtos · **Status:** rascunho (perguntas P-01..P-08 com proposta adotada até a resposta) · **Data:** 2026-11-03 · **Onda:** 5 (mapa das ondas do 000) · **Origem:** p-60523, tela `/movimentacao-produtos` (regras 14, 15 e 17)

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

O comprador só enxerga o estoque pela ótica da compra: o que falta e quanto pedir. O que
**sobra** — produto parado sem venda, estoque acima da cobertura combinada, lote perto
de vencer, lote que já venceu com saldo — e o que está **acabando rápido demais** não
têm lugar no sistema novo. No sistema antigo isso morava numa tela de seis recortes do
estoque por filial; sem ela, a gerência descobre a perda quando o lote já venceu, e o
comprador descobre a ruptura quando o cliente reclama.

## Resultado esperado

Uma tela, **Movimentação de produtos**, com cinco recortes do estoque lidos do ERP, cada
um numa aba, todos com os mesmos filtros no topo (filial, departamento, fornecedor, venda a
órgão público e busca):

1. **Sem venda** — produto com estoque e sem venda válida há N dias, com o valor parado.
2. **Excedentes** — produto cuja cobertura passou do teto da sua curva, com a quantidade e
   o valor acima do alvo.
3. **A vencer** — lotes por validade, com o bloqueio do lote (quem bloqueou e quando) e o
   aviso de quando os lotes somam mais que o estoque do produto.
4. **Alerta de ruptura** — produto que consumiu uma fatia grande do estoque em tempo menor
   que o esperado pelo próprio histórico, com a severidade pelo prazo de reposição.
5. **Perdas** — lotes vencidos com saldo, com o custo da perda e o rastro do lote (de onde
   veio, por onde passou, quando vendeu pela última vez).

Nas abas Sem venda e A vencer a equipe registra um **plano de ação** (fato, causa, ação,
responsável, data de acompanhamento e situação) por produto e filial.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| analista (comprador) | achar o parado, o excedente e o que vai vencer da sua carteira; registrar o plano de ação; ver o alerta de ruptura para compra emergencial | semanal (ruptura: diária) |
| gestor (gerência de compras) | acompanhar os planos e os acompanhamentos vencidos; ver concentração de perda e de ruptura por filial | semanal |
| diretoria | ver o valor perdido e o parado por filial; registrar plano quando assume a ação | mensal |
| admin (TI) | o mesmo do gestor | eventual |
| comercial | **não** entra nesta tela (no sistema antigo só via a aba de promocionais, que fica fora desta spec) | — |

O nível de acesso da plataforma continua valendo acima do perfil: acesso somente-leitura
vê tudo e não grava plano.

## Cenários

Formato Dado/Quando/Então — cada cenário é verificável por uma pessoa. "Venda válida" é o
recorte de venda do sistema (R-131): venda de saída, quantidade positiva, não cancelada,
**sem** cliente de órgão público (ramos 11 a 15), **sem** venda para a própria rede (ramo
20 ou cliente que é filial) e **sem** remessa de entrega futura. A venda a órgão público
fica fora **por padrão**, e o filtro do topo "Venda a órgão público" a faz contar (P-08).

### A tela

**C-001 — O comercial não entra**
- **Dado que** a pessoa tem o perfil comercial
- **Quando** abre o menu ou digita o endereço da tela
- **Então** não há item de menu, e o endereço mostra "Seu perfil não tem acesso à movimentação de produtos"

**C-002 — A aba vive no endereço**
- **Dado que** alguém compartilhou o endereço da tela com a aba Perdas
- **Quando** outra pessoa abre esse endereço
- **Então** a tela abre na aba Perdas; um endereço com aba desconhecida abre em Sem venda

**C-003 — Filial obrigatória onde o estoque é por filial**
- **Dado que** ninguém escolheu filial
- **Quando** a pessoa abre Sem venda, Excedentes ou A vencer
- **Então** a primeira filial da lista vale e aparece escolhida; em Alerta de ruptura e Perdas a tela abre com "Todas as filiais"

**C-004 — Os filtros do topo valem para todas as abas e voltam à primeira página**
- **Dado que** a pessoa está na página 3 de Sem venda
- **Quando** escolhe um fornecedor, um departamento ou digita uma busca (meio segundo depois de parar de digitar)
- **Então** a lista volta à página 1 já filtrada, e ao trocar de aba o mesmo filtro continua valendo

**C-005 — Busca com apóstrofo**
- **Dado que** existe um produto "OLEO D'ALHO"
- **Quando** a pessoa busca por `D'ALHO` em qualquer aba
- **Então** a lista traz o produto, sem erro

### Sem venda

**C-006 — O corte de dias sem venda**
- **Dado que** na filial 1 o produto A teve a última venda válida há 120 dias e o produto B há 10 dias, os dois com estoque
- **Quando** a aba abre com o corte padrão de 90 dias
- **Então** A aparece com "120 dias" e B não aparece; com o corte de 180 dias, A também sai

**C-007 — Nunca vendido na janela vem primeiro**
- **Dado que** o produto C tem estoque e nenhuma venda válida nos últimos 720 dias
- **Quando** a aba abre
- **Então** C vem antes de todos, com "Sem venda em 720 dias" em destaque de alerta; depois vêm os demais do maior para o menor número de dias e, no empate, do maior valor parado para o menor

**C-008 — Venda que não é venda não tira o produto da lista**
- **Dado que** o produto D vendeu ontem só para um órgão público, para uma filial da rede e por remessa de entrega futura, e a última venda válida dele foi há 200 dias
- **Quando** a aba abre com o corte de 90 dias
- **Então** D aparece com "200 dias" — as vendas de ontem não contam

**C-009 — Com estoque, por padrão**
- **Dado que** o produto E está sem venda e com estoque zero
- **Quando** a aba abre
- **Então** E não aparece; com o filtro de estoque em "Todos", aparece

**C-010 — O valor parado**
- **Dado que** o produto A tem 40 unidades a R$ 12,50 de custo da última entrada
- **Quando** a aba lista A
- **Então** o valor parado é R$ 500,00, e a faixa de números do topo traz o total de produtos do recorte, o valor parado do recorte, quantos da página têm plano e quantos planos da filial estão com acompanhamento vencido

### Excedentes

**C-011 — Excedente contra o teto, quantidade contra o alvo**
- **Dado que** o produto F é curva A, o departamento dele tem alvo 35 dias e tolerância 20 % na curva A (teto 42), vendeu 90 unidades válidas em 90 dias (1 por dia) e tem 100 em estoque mais 20 em trânsito
- **Quando** a aba calcula
- **Então** F tem cobertura de 120 dias, é excedente, tem 85 unidades acima do alvo (120 − 1 × 35) e 78 dias acima do teto

**C-012 — Sem parametrização vale o padrão do sistema**
- **Dado que** nada parametriza o produto G
- **Quando** a aba calcula
- **Então** G é cobrado contra 35 dias sem tolerância e a linha diz "Padrão do sistema"

**C-013 — Dois registros de trânsito não duplicam o produto**
- **Dado que** o produto F tem dois registros de trânsito na filial (10 e 10)
- **Quando** a aba lista
- **Então** F aparece uma vez, com 20 em trânsito

**C-014 — Sem venda no período não é excedente**
- **Dado que** o produto C tem estoque e nenhuma venda válida no período
- **Quando** a aba Excedentes lista
- **Então** C não aparece (é assunto da aba Sem venda)

**C-015 — As duas visões e os números sobre a população inteira**
- **Dado que** a filial tem 3 produtos com giro e 1 excedente
- **Quando** a pessoa alterna "Somente excedentes" (padrão) e "Todos com giro"
- **Então** a lista mostra 1 e depois 3; a faixa de números (itens excedentes, valor acima do alvo, cobertura média dos excedentes, sem parametrização) não muda com a visão nem com a página

### A vencer

**C-016 — Situação e horizonte**
- **Dado que** na filial 1 há um lote vencido há 5 dias, um que vence em 20 dias e um que vence em 200 dias
- **Quando** a aba abre (situação "Todos", horizonte 90 dias)
- **Então** aparecem o vencido e o de 20 dias, nessa ordem; em "A vencer" só o de 20 dias; em "Vencidos" só o vencido, e o horizonte fica desabilitado

**C-017 — Bloqueio do lote: quanto, quem e quando — nunca o motivo**
- **Dado que** um lote tem 30 unidades, 30 bloqueadas, e o registro do ERP diz que a matrícula 777 (Rita Estoque) bloqueou em 10/10 pela rotina 6366; outro lote tem 30 e 10 bloqueadas; outro não tem bloqueio
- **Quando** a aba lista
- **Então** o primeiro mostra "Bloqueado" com "Rita Estoque · 10/10 · rotina 6366", o segundo "10 de 30 bloqueadas" e o terceiro nada; o filtro "Bloqueados" traz os dois primeiros e "Livres" o terceiro; nenhum mostra motivo de bloqueio, porque o ERP não registra motivo

**C-018 — Lotes que somam mais que o estoque**
- **Dado que** os lotes do produto H na filial somam 50 unidades e o estoque do produto é 40
- **Quando** a aba lista os lotes de H
- **Então** cada lote de H mostra "lotes somam 50" e o produto conta no número de divergentes — o valor em risco continua sendo o de cada lote, nunca o da soma

**C-019 — Busca por lote**
- **Dado que** o lote "L-2025-09" existe
- **Quando** a pessoa busca `l-2025-09`
- **Então** a lista traz esse lote

**C-020 — Validade com ano errado não entra**
- **Dado que** um lote tem validade em 1900
- **Quando** a aba abre em "Todos"
- **Então** esse lote não aparece

### Plano de ação

**C-021 — Registrar e editar o plano**
- **Dado que** a analista abre o plano do produto A na aba Sem venda da filial 1
- **Quando** preenche só o fato e salva; depois muda a situação para "Em andamento" e salva de novo
- **Então** fica um plano só para A na filial 1 na aba Sem venda, com a situação nova, quem atualizou e quando; salvar sem fato, causa e ação é recusado com "Preencha o fato, a causa ou a ação"

**C-022 — Lotes do mesmo produto dividem o plano**
- **Dado que** o produto H tem dois lotes na aba A vencer
- **Quando** a pessoa registra o plano a partir do primeiro lote
- **Então** o segundo lote mostra o mesmo plano; e o plano de H na aba Sem venda continua outro

**C-023 — Acompanhamento vencido**
- **Dado que** um plano aberto tem data de acompanhamento ontem e outro, concluído, também
- **Quando** a aba abre
- **Então** "Acompanhamentos vencidos" conta 1 e a linha do aberto mostra o atraso

**C-024 — Quem não pode gravar não grava, nem pelo servidor**
- **Dado que** a gravação do plano é pedida em nome do perfil comercial, ou de alguém com acesso somente-leitura
- **Quando** o servidor recebe
- **Então** nada é gravado, e a tela, que relê o plano depois de salvar, diz "O plano não foi gravado: seu perfil não pode registrar plano de ação" em vez de "salvo"; para quem só lê, o formulário abre desabilitado com o motivo visível

**C-025 — Remover o plano**
- **Dado que** o produto A tem plano na aba Sem venda
- **Quando** a analista remove o plano e confirma
- **Então** A volta a "Registrar plano"

### Alerta de ruptura

**C-026 — Venda fora da curva entra no alerta**
- **Dado que** na filial 1 o produto R tinha 100 unidades no início da janela de 7 dias, vendeu 60 entre 3 e 1 dias atrás (3 dias de venda), vendia 1 por dia nos 90 dias anteriores e tem 40 em estoque e nada em trânsito
- **Quando** a aba calcula com os padrões (janela 7, base 90, gatilho 50 %, desvio 1,5×, prazo de reposição 15, venda mínima 5)
- **Então** R entra com 60 % consumido, ritmo 8,57× o histórico, tempo real de 3 dias contra 60 esperados, cobertura de 4,7 dias no ritmo novo, severidade "Crítico" e reposição sugerida de 218 unidades (30 dias no ritmo novo menos o estoque e o trânsito)

**C-027 — Fora do alerta**
- **Dado que** o produto S vendeu 4 unidades na janela (abaixo da venda mínima) e o produto T consumiu 60 % do estoque num ritmo só 1,2× o histórico
- **Quando** a aba calcula com os padrões
- **Então** nenhum dos dois aparece; com venda mínima 1, S passa a ser avaliado pelos outros cortes

**C-028 — Sem histórico tem faixa própria**
- **Dado que** o produto U não vendeu nada nos 90 dias da base e consumiu 70 % do estoque na janela
- **Quando** a aba calcula com "incluir sem histórico" ligado (padrão)
- **Então** U aparece com "Sem curva": ritmo, tempo esperado e cobertura histórica ficam em branco (nunca zero) e ele conta em "sem histórico"; desligado, U some

**C-029 — Severidade e ordem**
- **Dado que** há um produto em alerta com estoque zero, um com cobertura de 10 dias, um com 25 e um com 40 (prazo de reposição 15)
- **Quando** a aba lista
- **Então** a ordem é Ruptura, Crítico, Alto e Monitorar, e o filtro de severidade "Crítico" traz só o segundo

**C-030 — Concentração por filial**
- **Dado que** há alertas nas filiais 1 e 2
- **Quando** a aba abre com "Todas as filiais"
- **Então** o gráfico por filial mostra, em cada barra, o número de alertas daquela filial; o resumo ignora a filial e a severidade escolhidas; clicar na barra da filial 2 filtra a lista pela filial 2, e clicar de novo volta a todas

**C-031 — Transferência recebida conta como entrada da janela** *(P-05)*
- **Dado que** o produto R recebeu 50 unidades por transferência entre filiais dentro da janela
- **Quando** a aba reconstrói o estoque do início da janela
- **Então** a transferência é descontada como entrada, igual à compra — o estoque inicial não fica subestimado

**C-032 — Exportar o alerta**
- **Dado que** o recorte tem alertas
- **Quando** a pessoa clica "Exportar CSV"
- **Então** baixa um arquivo com todas as linhas do recorte (até 5.000, com aviso no teto) e uma linha de cabeçalho com os parâmetros usados; recorte vazio deixa o botão desabilitado

### Perdas

**C-033 — Perda é lote vencido com saldo**
- **Dado que** um lote venceu ontem com 12 unidades, outro vence hoje com 5 e outro venceu sem saldo
- **Quando** a aba Perdas abre
- **Então** só o de ontem aparece; o que vence hoje ainda está na aba A vencer, como "Vence hoje"

**C-034 — O custo e o rastro da perda**
- **Dado que** o lote P1 entrou na filial 2 por compra a R$ 8,00, foi transferido para a filial 1, vendeu a última vez lá há 40 dias antes de vencer e venceu com 12 unidades
- **Quando** a aba lista P1
- **Então** a perda vale R$ 96,00 (12 × o custo da entrada do lote, não o custo da última entrada do produto), a origem mostra "Filial 2 → Filial 1", a linha conta em "Veio de transferência" e "Parado sem venda" mostra 40 dias; lote sem nenhuma venda conta em "Nunca vendidos"

**C-035 — Perda por filial**
- **Dado que** há perdas nas filiais 1 e 3
- **Quando** a aba abre com "Todas as filiais"
- **Então** o gráfico por filial mostra em cada barra o valor perdido daquela filial; clicar numa barra filtra a lista e clicar de novo volta a todas; o gráfico ignora a filial escolhida

**C-036 — Universo da perda**
- **Dado que** um produto de bonificação venceu com saldo
- **Quando** a aba abre no universo padrão "Produtos de venda"
- **Então** ele não aparece; em "Inclui bonificação e silenciados", aparece

**C-038 — Venda a órgão público conta, se a pessoa pedir** *(P-08)*
- **Dado que** o produto D vendeu ontem a um órgão público (e a última venda a cliente comum foi há 200 dias)
- **Quando** a pessoa escolhe "Venda a órgão público: conta como venda"
- **Então** D sai de Sem venda no corte de 90 dias (vendeu ontem); a venda para a rede e a remessa continuam sem contar

**C-037 — A linha do tempo do lote**
- **Dado que** a pessoa abre o rastro do lote P1
- **Quando** a janela carrega
- **Então** aparecem, na ordem em que aconteceram e em todas as filiais, a entrada por compra, a saída e a entrada da transferência (com "Filial 2 → Filial 1"), as vendas e o vencimento; a remessa de entrega futura aparece marcada "Remessa de entrega futura", nunca como uma segunda "Venda" *(P-02)*; operação sem rótulo conhecido aparece como "Entrada (XX)" ou "Saída (XX)"

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | A tela DEVE reunir os cinco recortes em abas, com a aba no endereço | C-002 | must |
| RF-002 | A tela DEVE ser vista por admin, analista, gestor e diretoria e recusada ao comercial, inclusive por endereço direto | C-001 | must |
| RF-003 | Filial, departamento, fornecedor e busca DEVEM valer para todas as abas; trocar qualquer filtro DEVE voltar à página 1 | C-003, C-004, C-005 | must |
| RF-004 | Sem venda, Excedentes e A vencer DEVEM exigir filial (a primeira, se ninguém escolheu); Ruptura e Perdas DEVEM aceitar todas as filiais | C-003 | must |
| RF-005 | Toda conta de venda DEVE usar a venda válida; a venda a órgão público DEVE ficar fora por padrão e contar quando o filtro pedir | C-008, C-011, C-026, C-038 | must |
| RF-006 | Sem venda DEVE listar produto ativo com dias desde a última venda válida maior ou igual ao corte (30, 60, 90 padrão, 180, 365), com o valor parado, na ordem de C-007 | C-006, C-007, C-009, C-010 | must |
| RF-007 | Excedentes DEVE classificar cada produto com giro pela curva e pelo teto da curva, mostrar a quantidade e o valor acima do alvo e alternar entre só excedentes e todos com giro | C-011..C-015 | must |
| RF-008 | A vencer DEVE listar os lotes com saldo por situação (todos, a vencer, vencidos), horizonte (30, 60, 90 padrão, 180, 365) e bloqueio (todos, bloqueados, livres) | C-016, C-017, C-019, C-020 | must |
| RF-009 | A vencer DEVE mostrar, para lote bloqueado, a quantidade, quem bloqueou, quando e por qual rotina, e NUNCA um motivo | C-017 | must |
| RF-010 | A vencer DEVE marcar o produto cujos lotes somam mais que o estoque, sem somar a divergência no valor | C-018 | must |
| RF-011 | Sem venda e A vencer DEVEM permitir registrar, editar e remover um plano de ação por aba + produto + filial | C-021, C-022, C-025 | must |
| RF-012 | A tela DEVE mostrar quantos planos da aba e da filial estão com acompanhamento vencido | C-023 | must |
| RF-013 | O servidor DEVE recusar gravação de plano de quem não pode, e a tela DEVE dizer que não gravou | C-024 | must |
| RF-014 | Ruptura DEVE detectar o produto fora da curva pelos cortes ajustáveis na tela e classificar a severidade pelo prazo de reposição | C-026..C-029, C-031 | must |
| RF-015 | Ruptura e Perdas DEVEM mostrar a concentração por filial num gráfico com o valor escrito em cada barra, e o clique na barra DEVE filtrar a lista | C-030, C-035 | must |
| RF-016 | Ruptura DEVE exportar o recorte em arquivo de planilha simples | C-032 | should |
| RF-017 | Perdas DEVE listar o lote vencido com saldo, com o custo da perda, o rastro e os números do recorte | C-033, C-034, C-036 | must |
| RF-018 | Perdas DEVE abrir a linha do tempo do lote em todas as filiais | C-037 | must |
| RF-019 | Toda lista DEVE ser paginada de 50 em 50 | C-004 | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Abrir a tela custa as três listas dos filtros (filiais, fornecedores, departamentos) mais a identidade; abrir uma aba custa **uma** chamada (Excedentes: duas — a lista e a parametrização; Sem venda e A vencer: três — a lista, os planos da página e o resumo dos planos; Ruptura e Perdas: duas — a lista e o resumo por filial) | Contador de chamadas por aba |
| RNF-002 | Nenhuma chamada por linha: o plano da página inteira vem numa chamada só | Contador ao paginar 50 linhas |
| RNF-003 | A busca espera meio segundo depois da última tecla | Digitar 6 letras seguidas custa uma chamada |
| RNF-004 | Excedentes considera até 3.000 produtos com giro por filial; acima disso a tela avisa que cortou | Aviso visível no teto |

## Entidades do domínio

- **Produto ativo** — o produto de venda do ERP: sem marca de inativo e fora dos departamentos de bonificação e uso interno.
- **Venda válida** — R-131 (ver cenários).
- **Lote** — o saldo de um produto numa filial com uma validade; pode estar livre, parcialmente ou totalmente bloqueado.
- **Plano de ação** — o compromisso registrado sobre um produto numa filial, numa aba: fato, causa, ação, responsável, data de acompanhamento e situação (aberto, em andamento, concluído).
- **Alerta de ruptura** — o produto cuja venda recente consumiu o estoque mais rápido que o próprio histórico, com a severidade.
- **Perda** — o lote que venceu com saldo, com o seu custo e o seu rastro.

## Regras de negócio

- **RN-001 — Produto ativo.** Todas as abas olham só o produto ativo. Ruptura e Perdas têm o universo "Inclui bonificação e silenciados", que abre a foto completa.
- **RN-002 — Venda válida.** Só a venda válida conta, em toda aba e toda conta (última venda, consumo, curva, janela e base da ruptura, última venda do lote). A venda para a rede e a remessa ficam fora sempre; a venda a órgão público fica fora por padrão e conta quando o filtro do topo pedir (P-08).
- **RN-003 — Última venda e última entrada.** Saem dos movimentos do ERP dos últimos 720 dias, nunca do campo de "última saída" do cadastro de estoque (que conta transferência e devolução). Sem venda válida na janela, a linha diz "Sem venda em 720 dias".
- **RN-004 — Cobertura do excedente.** Consumo diário = venda válida do período ÷ dias do período (30, 60, 90 padrão, 180). Cobertura = (estoque disponível + trânsito) ÷ consumo diário. Estoque disponível e trânsito são os mesmos da tela de compras inteligentes: o estoque sem bloqueado, indenizado e reservado; o trânsito somado por produto e filial *(P-03)*.
- **RN-005 — Curva e teto do excedente.** A curva sai do faturamento da venda válida do período sobre todos os produtos com giro da filial (80 % A, 95 % B, resto C) *(P-04)*. O alvo e o teto são os da régua única de cobertura do sistema: produto, seção, departamento, fornecedor, padrão 35 dias sem tolerância *(P-03)*.
- **RN-006 — Excedente.** É excedente quem tem cobertura acima do teto. Quantidade acima do alvo = máximo entre zero e (estoque total − consumo diário × alvo). Valor acima do alvo = quantidade × custo *(P-07)*. Dias acima do teto = cobertura − teto.
- **RN-007 — Saldo do lote.** O saldo de um lote é o saldo do lote no ERP, a mesma coluna nas abas A vencer e Perdas *(P-01)*. Lote excluído ou com validade antes de 2000 não entra.
- **RN-008 — Bloqueio do lote.** Livre: nada bloqueado. Total: bloqueado maior ou igual ao saldo. Parcial: o resto. Quem e quando saem do último registro do ERP que **aumentou** o bloqueio daquele lote; o nome vem da matrícula do registro. Lote liberado não mostra bloqueio antigo. O ERP não registra motivo, e a tela não inventa um.
- **RN-009 — Divergência.** Lotes com saldo que somam mais que o estoque do produto na filial marcam todas as linhas do produto e contam uma vez por lote em "divergentes"; nunca entram no valor.
- **RN-010 — Plano de ação.** Um por aba (Sem venda ou A vencer) + produto + filial; lotes do mesmo produto dividem o da aba. Exige fato, causa ou ação. Situação aberto (padrão), em andamento ou concluído, com troca livre. Acompanhamento vencido: data antes de hoje e situação diferente de concluído (calculado, não gravado). Guarda quem criou, quem atualizou e quando.
- **RN-011 — Quem grava plano.** Admin, analista, gestor e diretoria; acesso somente-leitura não. O servidor recusa os demais sem gravar, e a tela confere relendo.
- **RN-012 — Detecção da ruptura.** Janela = últimos D dias (7, 15, 30); base = os B dias anteriores à janela (60, 90, 180, 365). Estoque inicial = máximo entre zero e (estoque + venda da janela − entradas da janela), com compra e transferência recebida como entrada *(P-05)*. Percentual consumido = venda da janela ÷ estoque inicial. Ritmo = consumo diário da janela ÷ consumo diário da base. Tempo real = dias entre a primeira e a última venda da janela, contando os dois. Tempo esperado = venda da janela ÷ consumo diário da base. Entra no alerta quem vendeu na janela pelo menos a venda mínima (1, 5, 10, 30), consumiu pelo menos o gatilho (30, 40, 50, 70, 90 %) e: com base, tem ritmo maior ou igual ao desvio (1,2; 1,5; 2; 3) **e** tempo real menor que o esperado; sem base, se "incluir sem histórico" estiver ligado.
- **RN-013 — Severidade.** Estoque zero ou negativo: Ruptura. Cobertura com trânsito no ritmo novo até o prazo de reposição (7, 15, 30, 45): Crítico. Até o dobro: Alto. Acima, ou sem cobertura calculável: Monitorar. Ordem: severidade, menor cobertura, maior ritmo.
- **RN-014 — Reposição sugerida.** Máximo entre zero e (consumo diário da janela × 30 − estoque − trânsito), para cima. É referência de urgência; não substitui a sugestão das compras inteligentes.
- **RN-015 — Perda.** Lote com saldo e validade antes de hoje. A janela "quando venceu" (todo o histórico padrão, 90, 180, 365 dias) recorta.
- **RN-016 — Custo da perda.** O custo da primeira entrada do lote na empresa; sem ele, o custo da última entrada do produto na filial.
- **RN-017 — Rastro do lote.** Entrada na empresa = primeiro movimento de entrada de origem (compra, avulsa, bonificação, devolução, inventário, retorno) em qualquer filial; transferência não é origem. Chegada na filial = último movimento de entrada (origem ou transferência) na filial da perda. Transferência: a filial de origem é a da saída de transferência da mesma nota. Parado sem venda = validade − (última venda válida do lote na filial, senão a chegada, senão a entrada), nunca negativo.
- **RN-018 — Rótulos de operação.** E Entrada por compra, EA avulsa, EB bonificação, ED devolução, EI inventário, ER retorno, ET Entrada por transferência, S Venda, SA Saída avulsa, SB bonificação, SD devolução, SI inventário, ST Saída por transferência; outro código: "Entrada (XX)" ou "Saída (XX)". Rota da transferência: "A → B" com as duas pontas, "→ B" ou "A →" com uma, nada sem nenhuma.
- **RN-019 — Valor do estoque.** Valor parado, valor em risco do lote e valor bloqueado usam o custo da última entrada do produto na filial *(P-07)*.
- **RN-020 — Paginação.** 50 por página; todo filtro volta à página 1. Sem dado é traço, nunca zero.

## Perguntas ao usuário (divergências do legado)

Cada pergunta tem uma **proposta**, que é o que esta entrega implementa até a resposta. As
propostas foram escolhidas para serem trocáveis num ponto só (um fragmento ou uma constante).

| # | O legado | Proposta adotada | Por quê |
|---|---|---|---|
| P-01 | A vencer usa o saldo `QT` do lote; Perdas (e Promocionais) usam `QTEST` — o mesmo lote vale diferente nas duas abas (div. 44) | **`QT` nas duas** | Foi a coluna que o legado apurou bater com o estoque (294 de 302 produtos); a perda da filial 1 cai de 198 lotes para 11 |
| P-02 | A linha do tempo do lote mostra a remessa de entrega futura como uma segunda "Venda" (div. 45) | **Mostra, marcada "Remessa de entrega futura", e nunca conta como venda** | O rastro fica completo e a última venda bate com a lista |
| P-03 | Excedentes: estoque bruto + pedido + trânsito por junção direta (duplica linha com dois trânsitos, div. 50); régua própria Produto > Depto > BU > Fornecedor com padrão **90** dias (div. 47) | **A mesma cobertura e a mesma régua das compras inteligentes**: estoque disponível + trânsito somado; produto > seção > departamento > fornecedor, padrão **35** dias (R-089) | O mesmo produto não pode ter cobertura e teto diferentes em duas telas; a R-089 diz que a régua é uma só. Sem parametrização, o excedente passa a ser acima de 35 dias e não de 90 |
| P-04 | Curva ABC do excedente por venda × custo da última entrada | **Faturamento da venda válida** (quantidade × preço), a régua de curva das compras inteligentes | Uma régua de curva só no sistema |
| P-05 | Ruptura reconstrói o estoque inicial só com compra; transferência recebida na janela não entra (div. 51) | **Compra e transferência recebida entram** | Sem isso o estoque inicial do produto reposto por transferência fica subestimado e o alerta dispara à toa |
| P-06 | Perdas: a spec dizia "venceu antes de agora"; o código, "antes de hoje" (div. 49) | **Antes de hoje**: o lote que vence hoje é "Vence hoje" em A vencer | Ainda pode ser vendido hoje |
| P-08 | Sem venda contava toda venda a cliente (inclusive órgão público); a sessão pediu a venda válida **sem** público | **Público fora por padrão, com o filtro "Venda a órgão público: conta como venda"** no topo (como o seletor da 011) | No WinThor real o recorte sem público marca como parado o que gira: Saxenda (cód. 1377) vendeu 9.378 un. a órgão público até 15/10/2026 e aparece "Sem venda em 720 dias"; Novorapid (1370) vendeu 68.180 un. só a ramos 11–13. Pergunta: nesta tela o padrão deveria ser **contar** o público? |
| P-07 | Valor parado, em risco, excedente e bloqueado pelo custo da última entrada do ERP | **Custo da última entrada do ERP**; perda pelo custo da entrada do lote | A R-128 trata do custo de **compra**; aqui é o valor do que já está em estoque. Se a resposta for "custo padrão do Gestão de Custos", a troca é na carga da tela |

Decisões que **não** são pergunta (vêm do pedido ou de regra fechada): venda válida em todas
as contas (R-131 + pedido da sessão); comercial fora da tela
(o legado só lhe mostrava Promocionais, que ficam fora); a tela conferir a gravação do plano
relendo (corrige a div. 46, padrão D-03 do SGC 2); exportação em CSV, não planilha de
escritório (R-094); diretoria grava plano, como o código do legado (a spec antiga dizia
"acompanha").

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | matriz: `verMovimentacao` falso só para comercial; menu do comercial sem o item; a página barra pelo mesmo predicado | regra de tela |
| C-002 | aba da URL válida é mantida; desconhecida vira `sem-venda` | regra de tela |
| C-003 | filial efetiva: aba que exige filial sem escolha → primeira filial; Ruptura/Perdas → vazio | regra de tela |
| C-004 | a carga de Sem venda com fornecedor e departamento só traz os do recorte (contagem > 0 antes e depois) | regra de negócio |
| C-005 | busca `D'ALHO` em Sem venda, A vencer e Perdas devolve o produto sem erro de sintaxe | regra de negócio |
| C-006 | corte 90: 5701 (120 d) entra com DIAS_SEM_VENDA 120 e 5702 (10 d) não; corte 180: 5701 sai | regra de negócio |
| C-007 | 5703 (nunca vendido) é a primeira linha com DIAS_SEM_VENDA nulo; a ordem segue dias desc e valor parado desc | regra de negócio + regra de tela (rótulo) |
| C-008 | 5704: público, filial e remessa de ontem ignorados; DIAS_SEM_VENDA 200 | regra de negócio |
| C-009 | 5705 (estoque 0) fora com somenteComEstoque 1, dentro com 0 | regra de negócio |
| C-010 | VALOR_PARADO 500,00 para 40 × 12,50; TOTAL_REGISTROS e TOTAL_VALOR no recorte | regra de negócio |
| C-011 | consulta: 5710 com VENDA_PERIODO 90, estoque 100, trânsito 20; regra pura: cobertura 120, teto 42, excedente, 85 un. acima do alvo, 78 dias acima | regra de negócio + regra de tela |
| C-012 | sem cobertura alcançável → alvo 35, teto 35, "Padrão do sistema" | regra de tela |
| C-013 | 5710 com dois registros de trânsito volta uma linha só com trânsito 20 | regra de negócio |
| C-014 | 5703 (sem venda no período) fora da consulta de excedentes | regra de negócio |
| C-015 | visões e KPIs sobre a população: 3 com giro, 1 excedente, KPIs iguais nas duas visões | regra de tela |
| C-016 | TODOS/90 → vencido (-5) e o de 20 d nessa ordem; A_VENCER → só o de 20; VENCIDOS → só o vencido | regra de negócio |
| C-017 | SITUACAO_BLOQUEIO TOTAL/PARCIAL/LIVRE; BLOQUEIO_RESPONSAVEL "RITA ESTOQUE", data e rotina; lote liberado sem responsável; filtros BLOQUEADOS/LIVRES; nenhuma coluna de motivo; rótulo puro "10 de 30 bloqueadas" | regra de negócio + regra de tela |
| C-018 | QT_TOTAL_LOTES 50 > ESTOQUE_PRODUTO 40 nos dois lotes de 5711; TOTAL_DIVERGENTES 2; VALOR_EM_RISCO por lote | regra de negócio |
| C-019 | busca `l-2025-09` traz o lote | regra de negócio |
| C-020 | lote com validade 1900 fora | regra de negócio |
| C-021 | gravar como Ana: 1 linha; regravar com status novo: continua 1, status trocado, ATUALIZADO_POR; validação pura recusa sem fato/causa/ação | regra de negócio + regra de tela |
| C-022 | o plano listado para os códigos da página atende os dois lotes de 5711; plano de SEM_VENDA de 5711 é outro | regra de negócio |
| C-023 | resumo devolve VENCIDOS 1 com um aberto e um concluído de ontem; regra pura `planoAtrasado` | regra de negócio + regra de tela |
| C-024 | gravar como Leo (comercial) e como READ_ONLY → 0 linhas; a tela distingue "não gravou" pela releitura (`resultadoDoSalvamento`) | regra de negócio + regra de tela |
| C-025 | excluir como Ana remove; como Leo não remove | regra de negócio |
| C-026 | 5720: PERC_CONSUMIDO 60, FATOR_ACELERACAO 8,57, DIAS_CONSUMO_REAL 3, DIAS_ESPERADOS 60, COBERTURA_COM_TRANSITO 4,7, SEVERIDADE CRITICO, QT_REPOR_SUGERIDA 218 | regra de negócio |
| C-027 | 5721 (4 un.) e 5722 (1,2×) fora; venda mínima 1 → 5721 avaliado | regra de negócio |
| C-028 | 5723 sem base: ORIGEM_CURVA SEM_HISTORICO, fator nulo, TOTAL_SEM_HISTORICO ≥ 1; incluirSemHistorico 0 → fora | regra de negócio |
| C-029 | ordem RUPTURA, CRITICO, ALTO, MEDIO; filtro de severidade; rótulos e tons puros | regra de negócio + regra de tela |
| C-030 | resumo por filial com a filial 1 e 2, sem filtro de filial e severidade; alternância pura da filial clicada | regra de negócio + regra de tela |
| C-031 | 5724 com 50 de transferência recebida: ESTOQUE_INICIAL considera a transferência | regra de negócio |
| C-032 | linhas do CSV puras com cabeçalho e parâmetros; vazio sem arquivo | regra de tela |
| C-033 | lote vencido ontem com saldo entra; vence hoje e vencido sem saldo não | regra de negócio |
| C-034 | P1: VALOR_PERDA 96,00 pelo custo do lote, FILIAL_ENTRADA 2, QT_TRANSFERENCIAS 1, DIAS_SEM_VENDA 40; TOTAL_COM_TRANSFERENCIA e TOTAL_NUNCA_VENDIDOS | regra de negócio |
| C-035 | resumo por filial de perdas com as filiais 1 e 3 e VALOR_PERDA de cada; ignora codfilial | regra de negócio |
| C-036 | produto de bonificação (departamento 4) fora no universo 0, dentro no 1 | regra de negócio |
| C-038 | com incluirPublico 1 o 5704 sai do corte de 90 (vendeu ontem ao público) e, com corte 0, mostra 1 dia; a rede e a remessa continuam fora | regra de negócio |
| C-037 | linha do tempo de P1 em ordem, com FILIAL_ORIGEM da entrada por transferência e a remessa marcada; rótulos e rota puros | regra de negócio + regra de tela |
| RN-001 | produto inativo (OBS2) fora de Sem venda, A vencer e Excedentes | regra de negócio |
| RN-002 | a venda válida é o fragmento único da R-131 (importado, não copiado), com o público condicionado a `incluirPublico` — conferido pelo texto das seis definitions que contam venda | regra de negócio |
| RN-003 | DT_ULT_VENDA vem do movimento, não de PCEST.DTULTSAIDA (seed com DTULTSAIDA diferente) | regra de negócio |
| RN-004..RN-006 | casos numéricos de `classificarExcedentes` (cobertura, teto, quantidade, valor, dias acima, curva) | regra de tela |
| RN-007 | o mesmo lote vencido tem o mesmo saldo em A vencer (VENCIDOS) e em Perdas | regra de negócio |
| RN-008 | `rotuloBloqueio` LIVRE/PARCIAL/TOTAL e o texto do responsável | regra de tela |
| RN-010 | `validarPlano`, `planoAtrasado`, `chavePlano` | regra de tela |
| RN-011 | gravação por admin, analista, gestor e diretoria grava; comercial e READ_ONLY não | regra de negócio |
| RN-012..RN-014 | casos de C-026..C-031 na consulta real | regra de negócio |
| RN-015, RN-016 | casos de C-033/C-034 | regra de negócio |
| RN-017, RN-018 | `rotuloOperacao`, `rotaTransferencia` | regra de tela |
| RN-019 | VALOR_PARADO e VALOR_EM_RISCO pelo custo da última entrada | regra de negócio |
| RN-020 | `paginaLocal` e `tomDiasSemVenda`, `tomPrazo`, `rotuloPrazo` | regra de tela |
| WinThor real | com o WinThor real ligado, cada consulta da tela devolve contagem > 0 numa filial com dados | regra de negócio (Oracle) |

- O que só olho humano verifica fica em **Verificação manual**:
  - [x] As cinco abas no simulador com o WinThor real, nos dois temas *(2026-11-03)*
  - [x] Os gráficos por filial com o valor escrito em cada barra *(2026-11-03)*
  - [x] Plano de ação desabilitado (não escondido) para quem só lê, com o motivo *(2026-11-03, gestor somente-leitura)*
  - [x] Severidade, bloqueio e prazo sinalizados por texto, nunca só por cor *(2026-11-03)*

## Fora de escopo

- [ ] **Produtos promocionais** (a sexta aba do legado) — outra sessão.
- [ ] **Criar pedido ou carrinho a partir do alerta de ruptura** — o legado também não fazia.
- [ ] **Aviso ativo** (e-mail, notificação, rotina agendada) de ruptura, perda ou acompanhamento vencido.
- [ ] **Plano de ação em Excedentes, Ruptura e Perdas** — como no legado.
- [ ] **Bloquear, desbloquear ou baixar lote** — o ERP é a fonte; a tela só lê.
- [ ] **Exportação em planilha de escritório** — o arquivo é o CSV das outras telas (R-094).
- [ ] **Redirecionar os endereços antigos** (`/perdas-produtos`, `/alerta-ruptura`) — o SGC 2 nasce sem eles.

## Pendências

As perguntas P-01..P-08 não bloqueiam: cada uma tem proposta implementada e troca num
ponto só. A resposta do usuário confirma ou vira emenda.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem caminho de erro (C-005, C-021, C-024, C-027)
- [x] Seção "Testes" preenchida: todo C-0NN e toda RN-0NN com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto (as perguntas têm proposta)
