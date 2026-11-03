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
Além dos perfis, o **nível de acesso** que a plataforma dá a cada pessoa continua valendo: quem
tem acesso somente-leitura vê a lista e os alertas e não altera nada, qualquer que seja o seu
perfil. O perfil **comercial** não aparece na tabela de propósito: ele não vê o quadro nem os
pedidos, e portanto não usa nada desta feature.

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa.

**C-001 — A análise chega inteira, em uma consulta**
- **Dado que** existe um pedido do fornecedor 1015 para a filial 1 com período de 01/08/2026 a 14/09/2026 (45 dias), e o fornecedor tem 20 produtos, sendo 1 marcado como inativo e 1 do departamento 4
- **Quando** a compradora abre a aba de itens
- **Então** a lista mostra 18 produtos, cada um com venda do período, venda de licitação, estoque, trânsito, custo da última entrada, unidades por caixa, curva, sugestão e cobertura

**C-002 — Sugestão com giro normal** *(R-134: fórmula do legado)*
- **Dado que** o produto vendeu 18 unidades válidas, nenhuma para órgão público, em 1,5 mês (0,4 por dia), tem 5 em estoque e 2 em trânsito, e não há cobertura parametrizada (alvo 35 dias)
- **Quando** a análise é calculada
- **Então** a sugestão é **7** (necessidade 0,4 × 35 = 14, menos a posição de 7 — estoque **mais** trânsito)

**C-003 — Giro lento compra pelo mesmo alvo** *(R-134: o alvo de 2,5 meses saiu)*
- **Dado que** o produto vendeu 6 unidades em 1,5 mês, sem estoque e sem trânsito
- **Quando** a análise é calculada
- **Então** a sugestão é **5** com o alvo padrão de 35 dias (6 ÷ 1,5 ÷ 30 × 35 = 4,67, para cima), e **8** se a cobertura da curva do produto for 60 dias — o giro lento não ganha alvo maior

**C-004 — Arredondamento por caixa**
- **Dado que** a sugestão do produto é 21 e a gestão de custos informa 12 unidades por caixa
- **Quando** a análise é calculada
- **Então** a sugestão apresentada é **24** (2 caixas cheias), e não 21

**C-005 — Estoque já cobre a necessidade**
- **Dado que** o produto vendeu 18 em 1,5 mês (necessidade de 14 no alvo de 35 dias) e tem 30 em estoque, sem trânsito
- **Quando** a análise é calculada
- **Então** a sugestão é **0** *(R-134: e o produto só entra no pedido se a compradora o adicionar — RF-034)*

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

**C-023 — O pedido voltou reprovado (R-133)**
- **Dado que** a aprovação técnica reprovou o pedido com o motivo "A quantidade do 55 passa de 4 meses de cobertura e o 1210 está com custo acima da tabela vigente" e citou os produtos 55 e 1210
- **Quando** a compradora abre o card na Análise
- **Então** o topo mostra "Pedido reprovado na aprovação técnica", a instrução, o motivo e "Produtos com reprovação (2)" com a descrição e o código de cada um — o motivo não fica só no histórico; a reprovação da diretoria aparece do mesmo jeito, antes da técnica

**C-024 — Resumo do pedido e aderência à sugestão (R-133)**
- **Dado que** o pedido tem 4 itens montados pela análise — 12 de 12, 24 de 12, 6 de 12 e 5 com sugestão 0 — e 1 item vindo de solicitação do comercial
- **Quando** a compradora abre o card
- **Então** vê Itens, Valor total, Preço especial e Alertas não lidos; a aderência mostra 50 % em âmbar e "2 de 4 seguem · 2 alterados" (o item do comercial fica fora da conta); "Aceitar sugestão (2)" leva o de 6 a 12 e tira do pedido o de sugestão 0, sem gravar até Salvar; as faixas dizem quantos vencimentos e excessos há ("ver na seção Alertas"), quantos itens têm preço especial e quantos vêm de solicitação comercial, com as unidades

**C-025 — A análise em tela ampla (R-133)**
- **Dado que** o card é estreito e o fornecedor tem 79 produtos na filial
- **Quando** a compradora abre o card
- **Então** o card mostra só "65 produtos com saída · 14 sem saída", "Abrir tela ampla", Recalcular e a lista enxuta dos itens do pedido (Produto, Pedido, Custo, Total), sem rolagem horizontal; a tela ampla tem a aba Análise — chips (com saída, sem saída, com sugestão, no pedido), busca ("/" foca; Esc limpa e, no segundo Esc, fecha), Embalagem mínima / Caixa cheia, ordenação por coluna em três passos com "Ordenado ✕", densidade, grupos *Vendas no período*, *Posição atual* e *Cobertura e custo*, Produto e Ação fixos com a rolagem horizontal no meio, seleção em lote e rodapé com produtos, a comprar, A/B/C e somas — e a aba Itens do pedido, com diferença, dias, observação e custo; salvar continua sendo uma gravação só

**C-026 — A venda dividida em privado, PF e público (R-133)**
- **Dado que** o produto 5002 vendeu, no período, 6 a uma empresa privada, 8 a uma pessoa física, 3 a órgão público, 5 a uma filial da própria rede e 4 numa remessa de entrega futura
- **Quando** a análise é montada
- **Então** as colunas mostram Privado 6, PF 8 e Público 3 — a venda para a própria rede e a remessa ficam fora das três —, a venda válida é 17 e a base da sugestão (R-134, sem o público) é 14

**C-027 — O custo do item (R-133)**
- **Dado que** o produto 54 tem custo padrão de R$ 57,23 e tabelas especiais vigentes a R$ 40,50 e R$ 44,08
- **Quando** a compradora abre o seletor de custo do item
- **Então** escolhe entre Padrão, cada tabela vigente (uma por tabela e valor, da mais barata) e Manual (com o campo do valor); a escolha fica gravada no item como padrão, especial ou manual, e o item especial aparece com fundo de atenção na aba Itens do pedido

**C-028 — Drill-in do produto (R-133)**
- **Dado que** a compradora está na tela ampla, na lista dos itens ou num cartão de solicitação
- **Quando** clica no nome do produto
- **Então** abre a mesma Análise do Produto das Compras inteligentes, com o bloco "Item no pedido" no topo (quantidade, custo, total e observação editáveis) ou "Qtd. + Observação + Adicionar" quando o produto ainda não está no pedido, e a aba Vendas mostra os clientes que compraram (os 10 que mais levaram no mês, com as vendas de cada um)

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
| RF-011 | O sistema DEVE permitir adicionar produto por busca (código ou parte do nome), remover item e editar quantidade, custo, tipo de preço e observação | Busca devolve no máximo 20 resultados (C-009). *Emendado pela R-133: o tipo de preço é padrão, especial ou manual (RF-032).* | must |
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
| RF-028 | O pedido que voltou reprovado DEVE mostrar no topo da Análise o motivo e os produtos citados, da técnica e da diretoria (R-133) | C-023 | must |
| RF-029 | O topo da Análise DEVE mostrar Itens, Valor total, Preço especial, Alertas não lidos, a aderência à sugestão com "Aceitar sugestão" e as faixas de aviso (R-133) | C-024 | must |
| RF-030 | A análise de produtos DEVE abrir em tela ampla, com as abas Análise e Itens do pedido; o card estreito DEVE mostrar só o cabeçalho da análise e a lista enxuta dos itens, sem rolagem horizontal (R-133) | C-025 | must |
| RF-031 | A análise DEVE mostrar a venda válida dividida em privado, pessoa física e órgão público (R-133); a base da sugestão é a venda válida sem o público (R-134) | C-026 | must |
| RF-032 | O custo de cada item DEVE ser escolhido entre o padrão, uma tabela especial vigente do produto e um valor manual (R-133) | C-027 | must |
| RF-033 | O nome do produto DEVE abrir a Análise do Produto das Compras inteligentes com o item do pedido no topo (R-133) | C-028 | must |
| RF-034 | Montar ou recalcular a análise NÃO DEVE pôr produto nenhum no pedido: entra só o que a compradora adiciona (R-133) | C-025 | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Salvar a lista custa **três** chamadas ao servidor no máximo — gravar os itens, recalcular os alertas e atualizar o cartão (total e alertas pendentes) —, qualquer que seja o número de itens alterados | Contador de chamadas com 1, 9 e 60 itens alterados: sempre ≤ 3 |
| RNF-002 | Abrir um pedido não custa nenhuma chamada por item: a lista, os alertas e o prazo vêm junto com a capa | Contador de chamadas ao abrir um pedido com 40 itens: as mesmas de um pedido vazio |
| RNF-003 | A análise de um fornecedor com 300 produtos volta em uma consulta e é desenhada em até 3 s | Cronômetro sobre o fornecedor com mais produtos |
| RNF-004 | Nenhuma operação sobre o ERP escreve: análise, busca, lotes, excesso e prazo são leitura | Revisão das consultas; nenhuma altera dado do ERP |
| RNF-005 | A verificação de saída da Análise responde em até 1 s, porque roda a cada tentativa de mover | Cronômetro sobre um pedido com 60 itens e 10 alertas |

## Entidades do domínio

- **Item do pedido** — um produto dentro de um pedido, com o que a análise apurou (venda, estoque, trânsito, custo, curva), o que a compradora decidiu (quantidade, custo negociado, tipo de preço, observação) e a sua situação no fluxo. Pertence a um pedido e a um produto do ERP; um produto aparece no máximo uma vez por pedido.
- **Alerta** — aviso automático ligado a um produto do pedido, de vencimento ou de excesso em outra filial. Nasce da análise, precisa ser lido e, quando o produto continua no pedido com quantidade, justificado.
- **Limite de cobertura** — quantos dias de estoque futuro são aceitáveis sem justificativa. É parametrizado por nível (fornecedor, departamento, seção ou produto) e vale sempre o mais específico.
- **Prazo de pagamento** — o padrão do fornecedor para a faixa de valor deste pedido e o acordado nesta negociação, mais a justificativa da diferença.
- **Análise de montagem** — a fotografia do fornecedor na filial dentro de um período: é a origem dos itens, recalculável a qualquer momento enquanto o pedido está na Análise. *R-133: a análise mostra e sugere; o produto só vira item quando a compradora o adiciona (RF-034).*

## Regras de negócio

- **RN-001 — Quantidade sugerida.** *Reescrita pela R-134 (fórmula do legado; a anterior — alvo de 2 ou 2,5 meses, venda total com licitação, posição = estoque − trânsito, "ao menos 1" — foi revogada).* Venda base = a venda **válida** do período (R-131: sem a venda para a própria rede nem a remessa de entrega futura) **sem o órgão público** — o mesmo recorte das Compras inteligentes. Venda diária = venda base ÷ meses ÷ 30. Alvo = a cobertura-alvo resolvida do item pela parametrização por curva da 012 — a regra mais específica vence (produto > seção > departamento > fornecedor), como nas Compras inteligentes; sem regra, alvo e limite de **35 dias**. A resolução do legado (fornecedor vence, limite 90) foi considerada e não adotada, por decisão do usuário. Necessidade = venda diária × alvo, com o produto arredondado a 6 casas e depois para cima. Posição = estoque + trânsito (o trânsito **soma**: o em trânsito e o pedido ao ERP), nunca negativa. Sugestão = necessidade − posição, nunca negativa. Meses do período = (fim − início) ÷ 30,44 dias, com duas casas e no mínimo 1; período ausente ou inválido vale 3.
- **RN-002 — Arredondamento por caixa.** Havendo mais de uma unidade por caixa, a sugestão sobe para o próximo múltiplo. Unidades por caixa vêm da gestão de custos; sem informação lá, são lidas da embalagem ("CX 12" = 12); sem nenhuma das duas, 1. *Emendada pela R-134: a sugestão sobe à caixa cheia só quando a tela mostra Caixa cheia; em Embalagem mínima, fica em unidades.*
- **RN-003 — Curva ABC.** Valor = venda do período × custo da última entrada. Os produtos são ordenados por valor decrescente; enquanto o acumulado for até 80 % do valor total é A, até 95 % é B, o resto é C. Sem valor total, todos são C. *Emendada pela R-128: o custo que pesa a curva e que nasce no item é o custo padrão do Gestão de Custos (sem ele, 0), não o custo da última entrada do ERP.*
- **RN-004 — Cobertura futura.** *Reescrita pela R-134.* Venda diária = a **mesma** venda base da sugestão ÷ meses ÷ 30 (o legado usava aqui a venda total; com a mesma base dos dois lados, comprar a sugestão leva exatamente ao alvo). Sem venda diária não há cobertura a calcular. Estoque futuro = estoque + trânsito + quantidade pedida, nunca negativo. Cobertura em dias = estoque futuro ÷ venda diária.
- **RN-005 — Limite de cobertura.** Vale o limite do produto; na falta, o da seção; na falta, o do departamento; na falta, o do fornecedor; na falta de todos, **35 dias**.
- **RN-006 — Comparação de prazo.** A comparação usa as parcelas em dias extraídas do texto ("28/35/42 dias" → 28, 35, 42). "À vista" é uma parcela de zero dia. Texto igual, ou mesmas parcelas na mesma ordem, é igualdade. Um lado sem número nenhum é divergência, nunca igualdade. A diferença é medida pela média simples das parcelas.
- **RN-007 — Justificativa de prazo.** Parcelas diferentes, prazo médio menor ou condição não comparável exigem justificativa de pelo menos 10 caracteres. A verificação lê o que está gravado no pedido, não o formulário aberto.
- **RN-008 — Total do pedido.** Soma de quantidade pedida × custo de cada item que ainda está na lista. É o valor mostrado no cartão do pedido.
- **RN-009 — Alerta de vencimento.** Lote com saldo maior que zero e validade em até 90 dias, em **qualquer** filial, gera alerta no produto correspondente do pedido.
- **RN-010 — Alerta de excesso.** Produto com mais de 80 dias de estoque (estoque ÷ venda diária dos três últimos meses) numa filial **diferente** da do pedido gera alerta. Produto com estoque e sem venda nos três meses conta como excesso.
- **RN-011 — Recorte do ERP.** Em toda consulta: produto ativo (sem marcação de inativo) e fora dos departamentos 4 e 7; venda é só saída com quantidade positiva; cliente de órgão público (atividades 11 a 15 e 20) sai da venda comum e entra como licitação. *Emendada pela R-134: a venda é a válida da R-131 e a licitação é só a dos ramos 11 a 15 — o ramo 20 (filial) e a remessa de entrega futura ficam fora da venda.*
- **RN-012 — Saída da Análise.** O pedido só sai da Análise para a aprovação técnica quando, nesta ordem: (1) todo alerta está lido; (2) todo item alertado com quantidade maior que zero está justificado; (3) todo item com cobertura acima do limite e quantidade maior que zero está justificado; (4) prazo padrão e acordado estão preenchidos e, divergentes, justificados com pelo menos 10 caracteres; (5) existe ao menos um item com quantidade maior que zero. A recusa cita a primeira exigência que falhou. Nenhuma delas se aplica ao cancelamento.
- **RN-013 — Situação do item.** O item nasce em montagem, vira aprovado quando a diretoria aprova, e enviado quando o pedido entra em Enviado para Indústria. Item marcado como reprovado na aprovação técnica volta para montagem quando o pedido é reenviado.
- **RN-014 — Itens zerados.** Item com quantidade zero sai da lista quando o pedido deixa a Análise e não vai para a indústria.
- **RN-015 — Aderência à sugestão (R-133).** Conta os itens no pedido (quantidade > 0) montados pela análise; o item vindo de solicitação do comercial fica fora. Segue quem tem sugestão > 0 e quantidade ≥ a sugerida; os demais são alterados (inclusive o de sugestão 0 no pedido). Aderência = seguem ÷ conta, arredondada; verde a partir de 80 %, âmbar a partir de 50 %, vermelha abaixo. "Aceitar sugestão" grava a sugerida nos alterados — sugestão 0 leva a quantidade a 0 e tira o item do pedido.
- **RN-016 — Divisão da venda (R-133).** Na venda válida da 011 (R-131: fora a venda para a própria rede e a remessa de entrega futura): Público = cliente dos ramos 11 a 15; PF = pessoa física fora deles; Privado = o resto. A venda total e a licitação da RN-001 e da RN-011 não mudam.
- **RN-017 — Ordenação da tela ampla (R-133).** Clicar na coluna ordena no padrão dela (nome e curva em ordem crescente, A antes de C; Dias do menor para o maior, sem venda por último; os números do maior para o menor); o segundo clique inverte; o terceiro volta à ordem da análise. Outra coluna recomeça no padrão.
- **RN-018 — Unidade exibida (R-133).** Em Caixa cheia, as colunas de quantidade mostram caixas (unidades ÷ unidades por caixa, com fração quando não fecha) e o que se digita em Comprar é caixa; em Embalagem mínima, unidades. Quantidade diferente da sugerida mostra, embaixo, a outra unidade e a sugestão.
- **RN-019 — Coluna Dias (R-133).** A cobertura futura da RN-004 com a quantidade de Comprar: perigo abaixo de 30 dias, atenção acima do teto da curva, "s/ venda" sem venda e "> 365 d" acima de um ano.
- **RN-020 — Seletor de custo (R-133).** As tabelas especiais vigentes do produto são as sem data de fim ou com fim a partir de hoje, uma por tabela e valor, da mais barata para a mais cara. Padrão grava o custo do Gestão de Custos (sem ele, 0); tabela grava o valor dela como especial; Manual guarda o valor digitado. Item especial com valor que nenhuma tabela vigente tem aparece como "Especial R$ x" (tabela fora da vigência).

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | A consulta de análise do fornecedor 1015 na filial 1, período 01/08–14/09/2026, devolve 18 linhas (não 20): o inativo e o do departamento 4 ficaram de fora; a contagem é maior que zero | regra de negócio |
| C-002 | (R-134) venda base 18, meses 1,5, estoque 5, trânsito 2, alvo 35 → sugestão 7 | regra de tela |
| C-003 | (R-134) venda base 6, meses 1,5, sem estoque nem trânsito → 5 com alvo 35; 8 com alvo 60 | regra de tela |
| C-004 | sugestão 21 com 12 unidades por caixa → 24; com 1 unidade por caixa → 21 | regra de tela |
| C-005 | (R-134) venda base 18, meses 1,5, estoque 30 → sugestão 0 | regra de tela |
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
| RN-001 | (R-134) venda base 120 em 6 meses, estoque 10, alvo 35 → necessidade 24, sugestão 14; alvo 60 → 30; 60 das 120 para órgão público → 2; com 5 em trânsito → 9 (o trânsito soma); 4 por dia × 35 = 140, nunca 141; em Caixa cheia de 12, 14 → 24, em Embalagem mínima fica 14; sem venda → 0 | regra de tela |
| RN-002 | "CX 12" → 12; "FRASCO 100 ML" → 1; gestão de custos com 6 vence a embalagem "CX 12" | regra de tela |
| RN-003 | lista vazia → mapa vazio; todos com valor zero → todos C | regra de tela |
| RN-004 | (R-134) venda base 180 em 6 meses, estoque 10, trânsito 5, pedida 20 → 35 dias; comprar a sugestão leva ao alvo e uma unidade a menos fica abaixo; sem venda → sem cobertura | regra de tela |
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
| C-023 | reprovação técnica com produtos "55, 1210" e da diretoria → duas faixas, a da diretoria primeiro; os códigos citados no texto livre viram [55, 1210] | regra de tela |
| C-024 | 4 itens montados (12/12, 24/12, 6/12, 5/0) e 1 de solicitação → base 4, seguem 2, 50 %, âmbar, alterados [6/12, 5/0]; aceitar → 12 e 0, aderência 100 %; números: 3 itens com quantidade, 30 un., R$ 300, 1 especial, 2 alertas não lidos; faixas 1 vencimento / 2 excesso | regra de tela |
| C-025 | linhas = montados + itens da busca no fim, item zerado fora do pedido; chips somam e a busca casa nome sem acento ou código; rodapé com 3 produtos, 2 a comprar, A/B/C e somas; diferença −2 perigo, +2 atenção; rodapé dos itens "1 esp. · 1 man."; título do trânsito separa WinThor e Kanban | regra de tela |
| C-026 | a análise do 1015 na filial 1 devolve o 5002 com privado 6, PF 8, público 3, venda válida 17 e licitação 3 (R-134); o 5001 com as três somando 18; no WinThor real (Fresenius 119, filial 1), privado > 0 e as três somando a venda válida; em toda linha Privado + PF + Público = Venda; o item que a análise não trouxe fica sem divisão (traço), nunca 0 / 0 / 0 | regra de negócio + regra de tela |
| C-027 | gravar o item com tipo de preço manual lê de volta manual; valor desconhecido lê padrão; a escolha "esp:2:8.5" grava 8,50 especial, "padrao" grava o custo do Gestão de Custos | regra de negócio + regra de tela |
| C-028 | sem o detalhe do SKU pronto não há previsão nem projeção; clientes que compraram em outubro = [9: 45 un., 12: 30 un., 0: 1 un.], cada um com as vendas da mais recente para a mais antiga | regra de tela |
| RN-015 | ver C-024; verde a partir de 80, âmbar a partir de 50, vermelho abaixo; sem item da análise no pedido → "Nenhum item da análise no pedido" | regra de tela |
| RN-016 | ver C-026 | regra de negócio |
| RN-017 | Venda: 1º clique do maior para o menor, 2º invertido, 3º sem ordem; Produto A a Z sem acento; curva A antes de C; Dias do menor para o maior com sem venda por último | regra de tela |
| RN-018 | 36 un. com caixa de 12 → 3 cx; 2 cx digitadas → 24 un.; 48 com sugestão 36 → "4 cx · sug. 36" (embalagem) e "48 un · sug. 3 cx" (caixa) | regra de tela |
| RN-019 | sem venda → "s/ venda"; 12 d perigo; 40 d com teto 45 neutro; 50 d atenção; 900 d → "> 365 d" | regra de tela |
| RN-020 | 6 políticas do produto 5 (uma repetida para outro cliente, uma vencida, uma de custo 0, uma de outro produto) → 2 tabelas, da mais barata; as opções são padrão, tabelas, a especial fora da vigência e manual | regra de tela |

- O que só olho humano verifica fica em **Verificação manual**:
  - [ ] C-001 — a tabela de itens com 300 linhas rola sem travar, com os números alinhados à direita e o código do produto discreto
  - [ ] C-007 — item acima do limite de cobertura sinalizado com ponto e texto, legível nos dois temas
  - [ ] C-013 — a contagem de alertas pendentes aparece na aba e no cartão do quadro
  - [ ] C-020 — a tela de limites de cobertura nos dois temas, com o formulário desabilitado para quem só lê
  - [x] C-023 a C-025, C-028 — num pedido real da Fresenius × filial 1 na Análise, nos dois temas: o card estreito sem rolagem horizontal (1600, 1280 e 1024 px), a tela ampla nas duas abas e o drill-in (R-133)

## Fora de escopo

- [ ] **Curva ABC dentro do limite de cobertura** — o limite por curva (A mais apertado que C) é da onda 4; aqui o limite é por fornecedor, departamento, seção e produto.
- [ ] **Nota fiscal contra pedido, faturamento e recebimento** — onda 2. Aqui o item para na situação "enviado".
- [ ] **Produtos em B.O.** — onda 2.
- [ ] **Carrinho das Compras Inteligentes** como origem de itens — onda 4.
- [ ] **Escrita no ERP** — o pedido não é lançado no WinThor por este sistema; o número do pedido do ERP é digitado no envio (spec 002).
- [ ] **Histórico de cada edição de item** — só o resumo ao sair da Análise (decisão AN-10 A).
- [ ] **Arrastar item entre pedidos, copiar lista de outro pedido, importar planilha.**
- [ ] **Sugestão de preço ou negociação de custo assistida** — o custo é digitado. *R-133: o custo agora também se escolhe entre o padrão e as tabelas especiais vigentes (RF-032); negociação assistida continua fora.*


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
