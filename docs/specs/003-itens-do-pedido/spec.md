# Spec: Itens do pedido — análise de montagem, alertas e prazo de pagamento

**ID:** 003-itens-do-pedido · **Status:** rascunho · **Data:** 2026-09-15

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

Montar um pedido de compra é a decisão mais cara do processo: define quanto dinheiro fica
parado em estoque pelos próximos meses. Hoje a compradora abre o ERP, olha venda, estoque e
trânsito produto a produto, calcula a quantidade na cabeça ou numa planilha à parte, e só
depois digita o pedido. O que ela não vê no momento da decisão — que existe lote vencendo em
dois meses, que outra filial está sentada em cem dias de estoque do mesmo item, que a condição
de pagamento que ela negociou é pior do que a de sempre — aparece só quando o pedido já chegou
à aprovação, ou não aparece nunca.

O custo é duplo: compra a mais (dinheiro parado, produto que vence) e compra a menos (ruptura
de venda). E como cada montagem é um esforço manual, o comprador acaba repetindo o pedido
anterior em vez de recalcular.

## Resultado esperado

Ao abrir a aba de itens de um pedido, a compradora vê a lista inteira dos produtos daquele
fornecedor naquela filial já com venda, estoque, trânsito, quantidade sugerida, curva e
cobertura calculadas; ajusta o que quiser; é avisada do que está errado antes de enviar; e o
pedido só sai da Análise quando tudo que exigia leitura ou justificativa foi tratado.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| analista (comprador) | montar a lista de itens, ajustar quantidades e custos, ler alertas, justificar o que foge do padrão, definir o prazo acordado | diária |
| gestor (gerência de compras) | o mesmo do analista, e conferir na aprovação técnica o que foi justificado | diária |
| diretoria | ver a lista, o total e as justificativas antes de aprovar | semanal |
| admin (TI) | manter os limites de cobertura por fornecedor, departamento, seção e produto | eventual |
| quem tem acesso somente-leitura | consultar a lista e os alertas, sem alterar nada | eventual |

O perfil **comercial** não aparece nesta tabela de propósito: ele não vê o quadro nem os
pedidos, e portanto não usa nada desta feature.

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa.

**C-001 — A análise chega inteira, em uma consulta**
- **Dado que** existe um pedido do fornecedor 101 para a filial 1 com período de 01/08/2026 a 14/09/2026 (45 dias), e o fornecedor tem 20 produtos, sendo 1 marcado como inativo e 1 do departamento 4
- **Quando** a compradora abre a aba de itens
- **Então** a lista mostra 18 produtos, cada um com venda do período, venda de licitação, estoque, trânsito, custo da última entrada, unidades por caixa, curva, sugestão e cobertura

**C-002 — Sugestão com giro normal**
- **Dado que** o produto vendeu 18 unidades no período de 45 dias (12 por mês), tem 5 em estoque e 2 em trânsito
- **Quando** a análise é calculada
- **Então** a sugestão é **21** (necessidade de 2 meses = 24, menos a posição de 3)

**C-003 — Giro lento compra 2,5 meses**
- **Dado que** o produto vendeu 6 unidades no período de 45 dias (4 por mês, abaixo de 5), sem estoque e sem trânsito
- **Quando** a análise é calculada
- **Então** a sugestão é **10** (4 × 2,5 meses, arredondado para cima)

**C-004 — Arredondamento por caixa**
- **Dado que** a sugestão do produto é 21 e a gestão de custos informa 12 unidades por caixa
- **Quando** a análise é calculada
- **Então** a sugestão apresentada é **24** (2 caixas cheias), e não 21

**C-005 — Estoque já cobre a necessidade**
- **Dado que** o produto vende 12 por mês e tem 30 em estoque, sem trânsito
- **Quando** a análise é calculada
- **Então** a sugestão é **0** e o item entra na lista com quantidade zerada

**C-006 — Curva ABC por valor, com os cortes 80 % e 95 %**
- **Dado que** o pedido tem 5 produtos com valor de venda (venda × custo) de R$ 500, R$ 250, R$ 150, R$ 70 e R$ 30 — total R$ 1.000
- **Quando** a curva é calculada
- **Então** os dois primeiros são **A** (acumulado 50 % e 75 %), o terceiro é **B** (90 %) e os dois últimos são **C** (97 % e 100 %)

**C-007 — Cobertura futura acima do limite exige justificativa**
- **Dado que** o produto vende 30 por mês (1 por dia), tem 10 em estoque, nada em trânsito, o limite de cobertura é 35 dias e a compradora pede 30 unidades
- **Quando** a quantidade é salva
- **Então** a cobertura mostrada é **40 dias**, o item fica marcado como acima do limite e o pedido não sai da Análise enquanto não houver justificativa nesse item

**C-008 — Vale o limite de cobertura mais específico**
- **Dado que** existe limite de 60 dias para o departamento 2 e de 20 dias para o produto 5001, que é desse departamento, e nenhum limite para o produto 5002
- **Quando** a análise é calculada
- **Então** o produto 5001 usa **20 dias**, o produto 5002 usa **60 dias** e um produto de outro departamento sem parametrização nenhuma usa **35 dias**

**C-009 — Adicionar produto que não veio na análise**
- **Dado que** a compradora quer incluir um produto que não é do fornecedor do pedido
- **Quando** ela busca por código ou por parte do nome
- **Então** aparecem no máximo 20 resultados, só de produtos ativos e fora dos departamentos 4 e 7, e o escolhido entra na lista com quantidade zero

**C-010 — Editar quantidades e salvar de uma vez**
- **Dado que** a compradora alterou a quantidade de 7 itens e o custo de 2
- **Quando** ela salva
- **Então** as 9 alterações são gravadas numa única operação, o total do pedido passa a ser a soma de quantidade × custo de todos os itens, e esse total aparece no cartão do pedido no quadro

**C-011 — Alerta de lote a vencer**
- **Dado que** um produto da lista tem um lote com saldo e validade daqui a 60 dias na filial 2, e o pedido é da filial 1
- **Quando** os alertas são gerados
- **Então** o item recebe um alerta de vencimento dizendo o lote, a filial, a quantidade e os dias que faltam

**C-012 — Alerta de excesso em outra filial**
- **Dado que** um produto da lista tem 300 unidades na filial 2 e vendeu 270 nos últimos três meses lá (3 por dia, 100 dias de estoque), e o pedido é da filial 1
- **Quando** os alertas são gerados
- **Então** o item recebe um alerta de excesso citando a filial 2 e os 100 dias de estoque

**C-013 — Alerta não lido barra a saída**
- **Dado que** o pedido tem 2 alertas e nenhum foi marcado como lido
- **Quando** a compradora tenta enviar o pedido para a aprovação técnica
- **Então** o envio é recusado com "Leia os 2 alertas deste pedido antes de enviar para aprovação" e o pedido continua na Análise

**C-014 — Item alertado que continua no pedido exige justificativa**
- **Dado que** todos os alertas foram lidos, e o item alertado do C-011 continua com quantidade 30
- **Quando** a compradora tenta enviar para a aprovação técnica
- **Então** o envio é recusado citando o produto, e passa a ser aceito assim que ela justificar por que comprar mesmo com o lote a vencer

**C-015 — Prazo acordado diferente do padrão exige justificativa**
- **Dado que** o prazo padrão do fornecedor para o valor deste pedido é "30/60" e a compradora acordou "28/35/42"
- **Quando** ela tenta enviar para a aprovação técnica sem justificar
- **Então** o envio é recusado informando que a média cai de 45 para 35 dias, e só é aceito com uma justificativa de pelo menos 10 caracteres

**C-016 — "À vista" é zero dia, não é ausência de prazo**
- **Dado que** o padrão é "30 dias" e o acordado é "à vista"
- **Quando** a comparação é feita
- **Então** o sistema trata como divergência de 30 dias a menos e exige justificativa — nunca como igualdade

**C-017 — Pedido sem nenhuma quantidade não sai da Análise**
- **Dado que** todos os itens do pedido estão com quantidade zero
- **Quando** a compradora tenta enviar para a aprovação técnica
- **Então** o envio é recusado com "Informe a quantidade de pelo menos um item antes de enviar para aprovação"

**C-018 — Saída liberada arruma a lista e deixa registro**
- **Dado que** alertas lidos, justificativas preenchidas, prazo resolvido e 8 itens com quantidade em 20 da lista
- **Quando** a compradora envia para a aprovação técnica
- **Então** o pedido muda de fase, os 12 itens zerados saem da lista, o total é recalculado e o histórico do pedido ganha uma linha com a data, quem enviou, quantos itens, o total e quantos itens foram justificados

**C-019 — Cancelar não passa pelas travas**
- **Dado que** o pedido tem alertas não lidos e nenhum item com quantidade
- **Quando** a compradora cancela a compra informando o motivo
- **Então** o cancelamento acontece normalmente: nenhuma exigência da Análise se aplica a ele

**C-020 — Manter os limites de cobertura**
- **Dado que** o gestor abre a tela de limites de cobertura
- **Quando** ele cadastra 20 dias para o produto 5001 e salva
- **Então** o limite passa a valer na próxima análise que contiver esse produto, e um analista que abre a mesma tela vê os limites sem poder alterá-los

**C-021 — Tipo de preço por item**
- **Dado que** um item foi negociado com preço especial
- **Quando** a compradora marca o tipo de preço "especial" e salva
- **Então** o item fica marcado como especial na lista e continua assim na aprovação e no envio à indústria

**C-022 — Reenvio depois de reprovação técnica**
- **Dado que** o pedido voltou da aprovação técnica com motivo e 3 produtos marcados como reprovados, e a compradora zerou esses 3
- **Quando** ela envia de novo para a aprovação técnica
- **Então** os 3 itens zerados saem da lista, o motivo da reprovação anterior é limpo e o total é recalculado

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE montar a análise do pedido numa única consulta ao ERP, por fornecedor, filial e período | Com 300 produtos no fornecedor, a lista aparece inteira sem consulta por produto (C-001) | must |
| RF-002 | A análise DEVE trazer, por produto: venda total do período, venda de licitação, estoque, trânsito, quantidade já pedida no ERP, custo da última entrada, datas de última entrada e saída, embalagem e unidade | Cada coluna tem valor ou traço, nunca zero inventado (C-001) | must |
| RF-003 | O sistema DEVE considerar apenas produtos ativos e fora dos departamentos 4 e 7 | Produto inativo e produto do departamento 4 não aparecem na lista nem na busca (C-001, C-009) | must |
| RF-004 | A venda de clientes de órgão público DEVE aparecer separada como licitação, sem deixar de contar na venda total | Produto vendido 18 no total, sendo 6 para órgão público, mostra 18 e 6 (C-001) | must |
| RF-005 | O sistema DEVE calcular a quantidade sugerida por produto | Os números de C-002, C-003 e C-005 batem | must |
| RF-006 | A sugestão DEVE ser arredondada para cima em caixas cheias quando houver unidades por caixa | Sugestão 21 com caixa de 12 vira 24 (C-004) | must |
| RF-007 | O sistema DEVE classificar cada produto da análise em curva A, B ou C pelo valor de venda | Os cortes de 80 % e 95 % de C-006 | must |
| RF-008 | O sistema DEVE calcular a cobertura futura em dias a partir da quantidade pedida | 40 dias no cenário C-007 | must |
| RF-009 | O limite de cobertura DEVE ser parametrizável por fornecedor, departamento, seção e produto, valendo o mais específico; sem parametrização, 35 dias | C-008 | must |
| RF-010 | Item com cobertura acima do limite e quantidade maior que zero DEVE exigir justificativa antes de o pedido sair da Análise | C-007 | must |
| RF-011 | O sistema DEVE permitir adicionar produto por busca (código ou parte do nome), remover item e editar quantidade, custo, tipo de preço e observação | Busca devolve no máximo 20 resultados (C-009) | must |
| RF-012 | As alterações de itens DEVEM ser gravadas em lote, numa operação só | 9 alterações = 1 gravação (C-010) | must |
| RF-013 | O total do pedido DEVE ser a soma de quantidade × custo dos itens e aparecer no cartão do pedido no quadro | C-010 | must |
| RF-014 | O sistema DEVE gerar alerta de vencimento para lote com saldo e validade em até 90 dias, em qualquer filial | C-011 | must |
| RF-015 | O sistema DEVE gerar alerta de excesso para produto com mais de 80 dias de estoque numa filial diferente da do pedido | C-012 | must |
| RF-016 | Os alertas DEVEM ser regerados ao salvar a lista e de novo ao tentar enviar para a aprovação técnica, preservando o que já foi lido e justificado | Alerta lido continua lido depois de nova geração (C-013) | must |
| RF-017 | Todo alerta DEVE ser marcado como lido, com quem leu e quando, antes de o pedido sair da Análise | C-013 | must |
| RF-018 | Item com alerta que continua no pedido com quantidade maior que zero DEVE exigir justificativa | C-014 | must |
| RF-019 | O pedido DEVE guardar o prazo de pagamento padrão do fornecedor e o acordado neste pedido | Os dois aparecem lado a lado com a diferença em dias (C-015) | must |
| RF-020 | Prazo acordado divergente do padrão DEVE exigir justificativa de pelo menos 10 caracteres | C-015, C-016 | must |
| RF-021 | O pedido não DEVE sair da Análise sem ao menos um item com quantidade maior que zero | C-017 | must |
| RF-022 | As exigências de saída DEVEM ser verificadas no servidor, não só na tela, e a recusa DEVE dizer qual exigência falhou | Recusa por outro caminho que não a tela devolve a mesma mensagem (C-013 a C-017) | must |
| RF-023 | O cancelamento da compra não DEVE ser barrado por nenhuma exigência da Análise | C-019 | must |
| RF-024 | Ao sair da Análise, os itens com quantidade zero DEVEM sair da lista e o total DEVE ser recalculado | C-018, C-022 | must |
| RF-025 | Ao sair da Análise, o histórico do pedido DEVE receber um resumo da lista: quantos itens, total, quantos justificados | C-018 | must |
| RF-026 | Cada item DEVE ter uma situação que acompanha a fase do pedido: em montagem, aprovado (depois da diretoria), enviado, reprovado ou removido | C-021, C-022 | should |
| RF-027 | Os limites de cobertura DEVEM ser mantidos numa tela própria, editável por admin e gestor e só de leitura para os demais | C-020 | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Salvar a lista custa **uma** chamada ao servidor, qualquer que seja o número de itens alterados, mais no máximo uma segunda quando o total do pedido muda | Contador de chamadas com 1, 9 e 60 itens alterados: sempre ≤ 2 |
| RNF-002 | Abrir um pedido não custa nenhuma chamada por item: a lista, os alertas e o prazo vêm junto com a capa | Contador de chamadas ao abrir um pedido com 40 itens: as mesmas de um pedido vazio |
| RNF-003 | A análise de um fornecedor com 300 produtos volta em uma consulta e é desenhada em até 3 s | Cronômetro sobre o fornecedor com mais produtos |
| RNF-004 | Nenhuma operação sobre o ERP escreve: análise, busca, lotes, excesso e prazo são leitura | Revisão das consultas; nenhuma altera dado do ERP |
| RNF-005 | A verificação de saída da Análise responde em até 1 s, porque roda a cada tentativa de mover | Cronômetro sobre um pedido com 60 itens e 10 alertas |

## Entidades do domínio

- **Item do pedido** — um produto dentro de um pedido, com o que a análise apurou (venda, estoque, trânsito, custo, curva), o que a compradora decidiu (quantidade, custo negociado, tipo de preço, observação) e a sua situação no fluxo. Pertence a um pedido e a um produto do ERP; um produto aparece no máximo uma vez por pedido.
- **Alerta** — aviso automático ligado a um produto do pedido, de vencimento ou de excesso em outra filial. Nasce da análise, precisa ser lido e, quando o produto continua no pedido com quantidade, justificado.
- **Limite de cobertura** — quantos dias de estoque futuro são aceitáveis sem justificativa. É parametrizado por nível (fornecedor, departamento, seção ou produto) e vale sempre o mais específico.
- **Prazo de pagamento** — o padrão do fornecedor para a faixa de valor deste pedido e o acordado nesta negociação, mais a justificativa da diferença.
- **Análise de montagem** — a fotografia do fornecedor na filial dentro de um período: é a origem dos itens, recalculável a qualquer momento enquanto o pedido está na Análise.

## Regras de negócio

- **RN-001 — Quantidade sugerida.** Venda mensal = venda total do período ÷ meses do período (mínimo 1 mês). Cobertura alvo = 2 meses, ou 2,5 meses quando a venda mensal é menor que 5. Necessidade = venda mensal × alvo, arredondada para cima. Posição = estoque − trânsito, nunca negativa. Sugestão = necessidade − posição, nunca negativa; havendo venda e posição que não cobre nem um mês, sugere ao menos 1. A base é a venda **total**, licitação inclusive.
- **RN-002 — Arredondamento por caixa.** Havendo mais de uma unidade por caixa, a sugestão sobe para o próximo múltiplo. Unidades por caixa vêm da gestão de custos; sem informação lá, são lidas da embalagem ("CX 12" = 12); sem nenhuma das duas, 1.
- **RN-003 — Curva ABC.** Valor = venda do período × custo da última entrada. Os produtos são ordenados por valor decrescente; enquanto o acumulado for até 80 % do valor total é A, até 95 % é B, o resto é C. Sem valor total, todos são C.
- **RN-004 — Cobertura futura.** Venda diária = venda do período ÷ meses ÷ 30. Sem venda diária não há cobertura a calcular. Estoque futuro = estoque − trânsito + quantidade pedida, nunca negativo. Cobertura em dias = estoque futuro ÷ venda diária.
- **RN-005 — Limite de cobertura.** Vale o limite do produto; na falta, o da seção; na falta, o do departamento; na falta, o do fornecedor; na falta de todos, **35 dias**.
- **RN-006 — Comparação de prazo.** A comparação usa as parcelas em dias extraídas do texto ("28/35/42 dias" → 28, 35, 42). "À vista" é uma parcela de zero dia. Texto igual, ou mesmas parcelas na mesma ordem, é igualdade. Um lado sem número nenhum é divergência, nunca igualdade. A diferença é medida pela média simples das parcelas.
- **RN-007 — Justificativa de prazo.** Parcelas diferentes, prazo médio menor ou condição não comparável exigem justificativa de pelo menos 10 caracteres. A verificação lê o que está gravado no pedido, não o formulário aberto.
- **RN-008 — Total do pedido.** Soma de quantidade pedida × custo de cada item que ainda está na lista. É o valor mostrado no cartão do pedido.
- **RN-009 — Alerta de vencimento.** Lote com saldo maior que zero e validade em até 90 dias, em **qualquer** filial, gera alerta no produto correspondente do pedido.
- **RN-010 — Alerta de excesso.** Produto com mais de 80 dias de estoque (estoque ÷ venda diária dos três últimos meses) numa filial **diferente** da do pedido gera alerta. Produto com estoque e sem venda nos três meses conta como excesso.
- **RN-011 — Recorte do ERP.** Em toda consulta: produto ativo (sem marcação de inativo) e fora dos departamentos 4 e 7; venda é só saída com quantidade positiva; cliente de órgão público (atividades 11 a 15 e 20) sai da venda comum e entra como licitação.
- **RN-012 — Saída da Análise.** O pedido só sai da Análise para a aprovação técnica quando, nesta ordem: (1) todo alerta está lido; (2) todo item alertado com quantidade maior que zero está justificado; (3) todo item com cobertura acima do limite e quantidade maior que zero está justificado; (4) prazo padrão e acordado estão preenchidos e, divergentes, justificados com pelo menos 10 caracteres; (5) existe ao menos um item com quantidade maior que zero. A recusa cita a primeira exigência que falhou. Nenhuma delas se aplica ao cancelamento.
- **RN-013 — Situação do item.** O item nasce em montagem, vira aprovado quando a diretoria aprova, e enviado quando o pedido entra em Enviado para Indústria. Item marcado como reprovado na aprovação técnica volta para montagem quando o pedido é reenviado.
- **RN-014 — Itens zerados.** Item com quantidade zero sai da lista quando o pedido deixa a Análise e não vai para a indústria.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | A consulta de análise do fornecedor 101 na filial 1, período 01/08–14/09/2026, devolve 18 linhas (não 20): o inativo e o do departamento 4 ficaram de fora; a contagem é maior que zero | regra de negócio |
| C-002 | venda 18, meses 1,5, estoque 5, trânsito 2 → sugestão 21 | regra de tela |
| C-003 | venda 6, meses 1,5, estoque 0, trânsito 0 → sugestão 10 | regra de tela |
| C-004 | sugestão 21 com 12 unidades por caixa → 24; com 1 unidade por caixa → 21 | regra de tela |
| C-005 | venda 18, meses 1,5, estoque 30, trânsito 0 → sugestão 0 | regra de tela |
| C-006 | 5 produtos com valores 500, 250, 150, 70 e 30 → A, A, B, C, C | regra de tela |
| C-007 | venda 45, meses 1,5, estoque 10, trânsito 0, pedida 30 → 40 dias; com limite 35 a verificação de saída recusa citando o produto | regra de tela + regra de negócio |
| C-008 | limites [departamento 2 = 60, produto 5001 = 20] → produto 5001 usa 20, produto 5002 (mesmo departamento) usa 60, produto 7001 (sem nada) usa 35 | regra de tela |
| C-009 | busca por "creme" devolve entre 1 e 20 linhas, nenhuma do departamento 4 nem inativa; busca por código 5001 devolve exatamente 1 | regra de negócio |
| C-010 | gravar 9 itens numa chamada e ler de volta as 9 quantidades; o total do pedido passa de 0 para 1.234,50 | regra de negócio |
| C-011 | com lote de 30 unidades vencendo em 60 dias na filial 2, a geração cria 1 alerta de vencimento para o produto, com a filial e os dias na mensagem | regra de negócio |
| C-012 | com 300 em estoque e 270 de venda em três meses na filial 2, a geração cria 1 alerta de excesso citando 100 dias | regra de negócio |
| C-013 | com 2 alertas não lidos a verificação de saída devolve "não pode" e a mensagem contém "2 alertas"; marcando os dois como lidos, a mesma verificação libera | regra de negócio |
| C-014 | item alertado com quantidade 30 e sem justificativa → verificação recusa citando a descrição do produto; com justificativa → libera | regra de negócio |
| C-015 | padrão "30/60" × acordado "28/35/42" → divergente, média 45 → 35, diferença −10, exige justificativa; com justificativa de 9 caracteres a verificação de saída recusa, com 10 libera | regra de tela + regra de negócio |
| C-016 | padrão "30 dias" × acordado "à vista" → parcelas [30] × [0], divergente, exige justificativa | regra de tela |
| C-017 | pedido com 3 itens todos com quantidade 0 → verificação recusa com a mensagem de quantidade | regra de negócio |
| C-018 | pedido com 20 itens, 8 com quantidade → depois da saída restam 8 itens na lista, o total é a soma dos 8 e existe uma linha de histórico contendo "8 itens" | regra de negócio |
| C-019 | a verificação de saída não é consultada no caminho de cancelamento: o pedido com 2 alertas não lidos e nenhum item vai para cancelado | regra de negócio |
| C-020 | gravar limite 20 para o produto 5001 e ler de volta o limite resolvido daquele produto = 20 | regra de negócio |
| C-021 | gravar tipo de preço "especial" em 1 de 3 itens e ler de volta: 1 especial, 2 padrão | regra de negócio |
| C-022 | pedido com 3 itens zerados marcados como reprovados → depois do reenvio restam só os itens com quantidade e o motivo de reprovação está vazio | regra de negócio |
| RN-001 | tabela de entradas (venda do período, estoque, trânsito, meses): (0, 0, 0, 6) → 0; (120, 10, 0, 6) → 30; (12, 0, 0, 6) → 5; (120, 50, 20, 6) → 10; (120, 500, 0, 6) → 0 | regra de tela |
| RN-002 | "CX 12" → 12; "FRASCO 100 ML" → 1; gestão de custos com 6 vence a embalagem "CX 12" | regra de tela |
| RN-003 | lista vazia → mapa vazio; todos com valor zero → todos C | regra de tela |
| RN-004 | venda 180, meses 6, estoque 10, trânsito 5, pedida 20 → 25 dias; venda 0 → sem cobertura | regra de tela |
| RN-005 | com limites de fornecedor 90, departamento 60, seção 45 e produto 20 → vale 20; apagando o do produto → 45; sem nenhum → 35 | regra de tela |
| RN-006 | "28/35/42 dias" → [28,35,42]; "à vista" → [0]; "conforme contrato" → []; "30/60" × "30/60 dias" → iguais | regra de tela |
| RN-007 | divergente com justificativa de 9 caracteres → bloqueia; com 10 → libera; padrão vazio → bloqueia citando o padrão | regra de tela |
| RN-008 | 3 itens (10 × 2,50; 4 × 10,00; 0 × 8,00) → total 65,00 | regra de tela |
| RN-009 | lote com validade em 91 dias não gera alerta; em 90, gera | regra de negócio |
| RN-010 | 79 dias de estoque em outra filial não gera alerta; 81 gera; 100 dias na própria filial do pedido não gera | regra de negócio |
| RN-011 | a consulta de análise não traz produto com marcação de inativo nem dos departamentos 4 e 7; a venda de um cliente de atividade 12 aparece só na coluna de licitação e dentro da venda total | regra de negócio |
| RN-012 | as cinco exigências verificadas uma a uma, cada uma sozinha, devolvem "não pode" com a sua mensagem; todas satisfeitas devolvem "pode" com motivo vazio | regra de negócio |
| RN-013 | item em montagem vira aprovado na aprovação da diretoria e enviado na entrada em Enviado | regra de negócio |
| RN-014 | com 20 itens e 8 com quantidade, a limpeza de saída deixa 8 na lista | regra de negócio |

- O que só olho humano verifica fica em **Verificação manual**:
  - [ ] C-001 — a tabela de itens com 300 linhas rola sem travar, com os números alinhados à direita e o código do produto discreto
  - [ ] C-007 — item acima do limite de cobertura sinalizado com ponto e texto, legível nos dois temas
  - [ ] C-013 — a contagem de alertas pendentes aparece na aba e no cartão do quadro
  - [ ] C-020 — a tela de limites de cobertura nos dois temas, com o formulário desabilitado para quem só lê

## Fora de escopo

- [ ] **Curva ABC dentro do limite de cobertura** — o limite por curva (A mais apertado que C) é da onda 4; aqui o limite é por fornecedor, departamento, seção e produto.
- [ ] **Nota fiscal contra pedido, faturamento e recebimento** — onda 2. Aqui o item para na situação "enviado".
- [ ] **Produtos em B.O.** — onda 2.
- [ ] **Carrinho das Compras Inteligentes** como origem de itens — onda 4.
- [ ] **Escrita no ERP** — o pedido não é lançado no WinThor por este sistema; o número do pedido do ERP é digitado no envio (spec 002).
- [ ] **Histórico de cada edição de item** — só o resumo ao sair da Análise (decisão AN-10 A).
- [ ] **Arrastar item entre pedidos, copiar lista de outro pedido, importar planilha.**
- [ ] **Sugestão de preço ou negociação de custo assistida** — o custo é digitado.

## Pendências

Cada item aqui **bloqueia** o `plan.md`.

- Nenhuma.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-013 a C-017)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto
