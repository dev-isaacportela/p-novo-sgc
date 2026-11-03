# Spec: Projeção manual — o comprador ajusta a venda futura de um produto, com prazo

**ID:** 019-projecao-manual · **Status:** rascunho (propostas P-01..P-09 implementadas, aguardando aprovação) · **Data:** 2026-11-03 · **Estende:** [011-compras-inteligentes](../011-compras-inteligentes/spec.md)

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

As compras inteligentes sugerem quanto comprar olhando para trás: a venda dos últimos cinco
meses, com mais peso na recente, ou a projeção de um modelo sobre os meses fechados. O
comprador sabe coisas que o passado não mostra: a campanha do mês que vem, o cliente novo
que começa a comprar, o concorrente que voltou a ter o produto. Hoje ele não tem como dizer
isso ao sistema. Ou ele corrige a quantidade de cabeça a cada compra, e na semana seguinte a
sugestão volta ao número de antes, ou ele confia na sugestão e compra pouco.

O sistema antigo tinha o campo "Influência de projeção (%)" com uma data de validade, mais um
filtro "Projeção ativa" na lista. Só que o percentual **não entrava em conta nenhuma**. Ele
virava um selo na linha e mais nada: a sugestão, a cobertura e a previsão continuavam
iguais. Também não dava para tirar o ajuste depois de gravado, porque o zero não era salvo.

## Resultado esperado

O comprador abre um produto, informa "esta venda vai ser 20 % maior até o dia 30" e o
motivo. A partir daí a sugestão, a cobertura, a situação e a previsão do produto partem da
venda ajustada. A linha mostra o selo "Projeção +20 %". Na data marcada o ajuste deixa de
valer sozinho, e antes disso pode ser removido a qualquer momento. Um filtro da lista mostra
só os produtos com ajuste valendo. O que aconteceu de fato (o histórico de vendas, a curva e
o erro dos modelos) continua o que foi.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| gestor (gerência de compras) | ajustar a projeção de um produto, alterar e remover o ajuste | semanal |
| admin (TI) | o mesmo do gestor | eventual |
| analista (comprador) | ver o selo, filtrar os ajustados e comprar pela sugestão ajustada | diária |
| diretoria | ver o selo e o efeito na sugestão | semanal |

Quem ajusta é quem já parametriza cobertura, lead time e silenciamento na 011 *(P-06)*. Quem
tem acesso somente leitura vê o ajuste e não altera. O comercial não vê a tela.

## Cenários

Salvo dito, os números seguem a base da 011: consumo de **2 unidades por dia**, lead time de
**9 dias**, cobertura de **35 dias** e caixa de **12 unidades**. Sem ajuste, isso dá estoque de
segurança 18, ponto de pedido 36 e estoque máximo 70.

**C-001 — Ajuste para cima aumenta a sugestão**
- **Dado que** o produto tem 50 em estoque disponível, nada em trânsito, e sugere **24** (situação adequado, cobertura de 25 dias, gatilho de 7 dias)
- **Quando** o gestor ajusta a projeção em **+20 %** até hoje + 30, com o motivo "campanha de novembro"
- **Então** o consumo usado passa a **2,4 por dia**, o estoque máximo a **84**, a sugestão a **36** (84 − 50 = 34, arredondado para 3 caixas), a cobertura atual a **20,8 dias** e o gatilho a **2 dias**; a situação continua adequado
- **E** a linha mostra o selo "Projeção +20 %", e o painel e a Análise do Produto mostram "Projeção manual +20 % até dd/mm/aaaa · Motivo: campanha de novembro", com o consumo medido (2,0) ao lado do ajustado (2,4)

**C-002 — O ajuste muda a situação**
- **Dado que** o produto tem 30 em estoque, nada em trânsito, e está em **baixa exposição** (15 dias de cobertura cobrem os 9 de lead time), sugerindo 48
- **Quando** o gestor ajusta em **+100 %**
- **Então** o consumo vira 4 por dia, a cobertura cai para 7,5 dias, a situação passa a **elevada exposição** e a sugestão a **120** (140 − 30 = 110, arredondado para 10 caixas)

**C-003 — Ajuste para baixo**
- **Dado que** o produto tem 50 em estoque e sugere 24
- **Quando** o gestor ajusta em **−50 %**
- **Então** o consumo vira 1 por dia, o estoque máximo 35, a situação **excesso** e a sugestão **0**

**C-004 — O ajuste vence sozinho**
- **Dado que** o ajuste de +20 % valia até **ontem**
- **Quando** a lista é calculada hoje
- **Então** o produto volta à sugestão de **24**, sem o selo, e não aparece no filtro de projeção manual; no último dia (validade = **hoje**) o ajuste ainda vale

**C-005 — O que se pode gravar**
- **Dado que** o gestor abre o ajuste de um produto
- **Quando** informa **0 %**, **−95 %** ou **+350 %**, uma data anterior a hoje, uma data depois de um ano, ou um motivo com menos de 5 letras
- **Então** nada é gravado e a janela diz o que corrigir: o percentual vai de −90 % a +300 % e não pode ser zero (para tirar o ajuste existe "Remover ajuste"); a validade é obrigatória, entre hoje e hoje + 365, e nasce em hoje + 30; o motivo é obrigatório *(P-02, P-03, P-05)*
- **E** a janela mostra antes de gravar o efeito no consumo e no estoque máximo ("2,0 → 2,4 un./dia · máximo 70 → 84 un.")

**C-006 — Remover o ajuste**
- **Dado que** o produto tem ajuste de +20 % valendo
- **Quando** o gestor clica em "Remover ajuste"
- **Então** a sugestão volta a 24, o selo some e o produto sai do filtro; o ajuste pode ser gravado de novo depois *(P-04)*

**C-007 — Filtro de projeção manual**
- **Dado que** três produtos do fornecedor têm ajuste gravado: um valendo, um vencido ontem e um removido
- **Quando** a compradora escolhe "Com projeção manual" no filtro de movimentação
- **Então** a lista mostra só o primeiro, sem nova consulta *(P-09)*

**C-008 — A previsão por modelo também é ajustada**
- **Dado que** o produto vendeu 60 unidades em cada um dos 6 últimos meses fechados, tem 50 em estoque e o Best Fit projeta **60 por mês**
- **Quando** o ajuste de +20 % está valendo
- **Então** a projeção mensal mostrada passa a **72** ("60 pelo modelo · +20 % manual"), a sugestão projetada a **36** (72 ÷ 30 = 2,4 por dia × 35 = 84 − 50 = 34, arredondado para 3 caixas) e a barra de projeção do gráfico a 72, com o valor escrito em cima
- **E** o modelo vencedor, o MAD, o MAPE, o tracking signal, as médias de 3, 6 e 12 meses e as barras de venda dos meses passados **não mudam**: o ajuste é sobre o futuro, e o erro do modelo é medido contra o que de fato vendeu *(P-01)*

**C-009 — Produto sem venda não ganha sugestão pelo ajuste**
- **Dado que** o produto não vendeu nada na janela
- **Quando** o gestor ajusta em +50 %
- **Então** a sugestão continua **0**: o ajuste é um percentual sobre a venda, e 50 % de zero é zero. Para produto novo, o caminho continua sendo a quantidade digitada

**C-010 — Trânsito continua mandando**
- **Dado que** o produto tem 30 em estoque, **20 em trânsito** e ajuste de +20 %
- **Quando** a lista é calculada
- **Então** a sugestão continua **0** (o que está a caminho não se compra de novo), e a visão Em trânsito mostra "20,8 dias com o trânsito" (50 ÷ 2,4) no lugar dos 25 dias sem ajuste

**C-011 — Cobertura futura da simulação**
- **Dado que** o produto tem 50 em estoque, ajuste de +20 % e a compradora simula a compra de 36
- **Quando** a simulação é calculada
- **Então** a cobertura futura é **35,8 dias** ((50 + 36) ÷ 2,4), não os 43 dias sem o ajuste

**C-012 — Licitação primeiro, ajuste depois**
- **Dado que** o produto tem consumo total de 2,0 por dia, dos quais 0,5 de venda a órgão público, e ajuste de +20 %
- **Quando** a venda a órgão público está desconsiderada (o padrão)
- **Então** o consumo usado é **1,8** ((2,0 − 0,5) × 1,2); com a venda pública dentro, **2,4**

**C-013 — Quem pode**
- **Dado que** o produto tem ajuste valendo
- **Quando** cada perfil abre o produto
- **Então** admin e gestor ajustam, alteram e removem; analista e diretoria veem o selo, o bloco e o efeito, com o botão desabilitado e o motivo; quem tem acesso somente leitura também; o servidor recusa a gravação de quem não pode, mesmo que a tela seja contornada *(P-06)*

**C-014 — O ajuste é do produto naquele fornecedor e naquela filial**
- **Dado que** o produto tem ajuste de +20 % na filial 1
- **Quando** a compradora abre o mesmo fornecedor na filial 2
- **Então** o produto aparece sem ajuste *(P-07)*

**C-015 — Do carrinho ao pedido**
- **Dado que** o produto com ajuste de +20 % sugere 36 e vai ao carrinho
- **Quando** o pedido é aberto no quadro
- **Então** o item nasce com sugerida **36**, que é a referência da aderência do comprador. A sugestão da montagem dentro do card continua com a fórmula do card (R-134) e não aplica o ajuste. A Análise do Produto aberta de dentro do card mostra o bloco do ajuste e a conta ajustada, como nas compras inteligentes *(P-08)*

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE permitir gravar, para um produto de um fornecedor numa filial, um ajuste percentual da venda projetada, com validade e motivo | C-001, C-014 | must |
| RF-002 | Enquanto vale, o ajuste DEVE multiplicar a venda projetada do produto (consumo diário usado na sugestão e projeção mensal dos modelos), e tudo que olha para frente DEVE partir dela: estoque de segurança, ponto de pedido, estoque máximo, sugestão, cobertura atual, cobertura futura, gatilho e situação | C-001, C-002, C-003, C-008, C-010, C-011 | must |
| RF-003 | O ajuste NÃO DEVE mudar o que é passado: venda da janela, histórico, curvas, vendas desconsideradas e o erro dos modelos (MAD, MAPE, tracking signal, Best Fit) | C-008 | must |
| RF-004 | O ajuste DEVE deixar de valer sozinho depois da validade, e poder ser removido antes | C-004, C-006 | must |
| RF-005 | O percentual DEVE ficar entre −90 % e +300 %, diferente de zero; a validade DEVE ser obrigatória, entre hoje e hoje + 365, começando em hoje + 30; o motivo DEVE ser obrigatório | C-005 | must |
| RF-006 | A lista DEVE mostrar o selo "Projeção ±N %" no produto com ajuste valendo, e o filtro de movimentação DEVE ter a opção "Com projeção manual" | C-001, C-007 | must |
| RF-007 | O painel e a Análise do Produto DEVEM mostrar o ajuste (percentual, validade, motivo) e o consumo medido ao lado do ajustado; o botão de ajustar fica no painel e na janela | C-001, C-008 | must |
| RF-008 | Só admin e gestor DEVEM gravar e remover o ajuste, na tela e no servidor | C-013 | must |
| RF-009 | A exportação da lista DEVE trazer o percentual do ajuste valendo | C-001 | should |

## Requisitos não-funcionais

| ID | Requisito | Critério de aceite |
|---|---|---|
| RNF-001 | Trocar de filial custa **uma** consulta a mais, com todos os ajustes do fornecedor na filial; nada por linha | contagem das chamadas no plan |
| RNF-002 | Filtrar, ver o selo e recalcular com o ajuste não custam consulta | o filtro e a conta são regra de tela |
| RNF-003 | Gravar ou remover custa uma escrita e uma releitura dos ajustes, sem refazer a consulta ao ERP | contagem das chamadas no plan |

## Entidades do domínio

| Entidade | O que é |
|---|---|
| Ajuste de projeção | percentual, validade e motivo de um produto, num fornecedor e numa filial, com quem gravou e quando; no máximo um por produto, fornecedor e filial |

## Regras de negócio

| ID | Regra |
|---|---|
| RN-001 | O ajuste vale quando o percentual é diferente de zero e a validade é hoje ou depois (comparação de data, sem hora). Fora disso, o fator é 1 |
| RN-002 | Fator = 1 + percentual ÷ 100. Ele multiplica o consumo diário **depois** da escolha de incluir ou não a venda pública (C-012) e **antes** de toda conta da régua da 011 (RF-006 a RF-008 da 011) |
| RN-003 | Na previsão por modelo, a série e o ajuste do modelo usam a venda real; a previsão do próximo mês de cada modelo é multiplicada pelo fator. O Best Fit (menor erro) é o mesmo com ou sem ajuste |
| RN-004 | Percentual de −90 a +300, com até uma casa decimal, diferente de zero; validade obrigatória, de hoje a hoje + 365, padrão hoje + 30; motivo obrigatório, de 5 a 500 caracteres |
| RN-005 | Remover zera o percentual e a validade e registra quem removeu; o vencimento não apaga nada, só deixa de valer |
| RN-006 | O ajuste é por produto, fornecedor e filial; o fornecedor inteiro não tem ajuste |
| RN-007 | Gravar e remover: admin e gestor (o mesmo de parametrizar e silenciar na 011) |
| RN-008 | O selo mostra o percentual com sinal e sem casa quando inteiro ("Projeção +20 %", "Projeção −12,5 %") |

## Perguntas ao usuário (divergências do legado) — propostas implementadas, aguardando aprovação

Cada proposta é o que está implementado, e trocar uma é mexer num ponto só. Fonte: RN-CI-23 e a máquina de estados da "Projeção manual" em `06-compras-inteligentes.md` do legado, e o formulário de parâmetros do produto em `ComprasInteligentesPage.tsx`.

| # | O legado | Proposta (implementada) | Por quê |
|---|---|---|---|
| P-01 | O percentual é **só um selo**: não entra na sugestão, na cobertura nem nos modelos ("cálculo inalterado") | **Multiplica a venda projetada**: o consumo da régua e a projeção mensal dos modelos; daí saem sugestão, cobertura, gatilho e situação. O passado e o erro dos modelos não mudam (RN-002, RN-003) | Um campo chamado "influência de projeção" que não influencia nada engana quem preenche. O legado guardava o percentual ao lado da projeção mensal, sinal de que a intenção era essa. Alternativas: (b) manter só o selo, como o legado; (c) aplicar só na previsão por modelo do produto aberto |
| P-02 | Validade vazia = ajuste sem prazo | **Validade obrigatória**, de hoje a hoje + 365, padrão hoje + 30 | Ajuste esquecido distorce a compra para sempre |
| P-03 | Qualquer número | **−90 % a +300 %**, diferente de zero | −100 % zera a demanda, e para isso existe o silenciamento; acima de +300 % é quase sempre erro de digitação |
| P-04 | Zero não é gravado, então o ajuste não se tira | **"Remover ajuste"** zera percentual e validade | Defeito do legado |
| P-05 | Sem motivo | **Motivo obrigatório** (5 a 500 caracteres), mostrado no painel | Como silenciar e desconsiderar venda: é o motivo que explica a compra maior na semana seguinte |
| P-06 | Quem abre a tela ajusta (admin, analista, diretoria, gestor) | **Admin e gestor**, como parametrizar e silenciar na 011 (RF-022 da 011) | Muda a sugestão de todos os compradores daquele produto; é parâmetro, não operação |
| P-07 | Por produto, fornecedor e filial | **O mesmo**, sem ajuste do fornecedor inteiro | Campanha e cliente novo são de produto; o fornecedor inteiro já tem a cobertura |
| P-08 | Não se aplica (o card tinha a própria conta) | **O card do pedido não aplica o ajuste na fórmula dele** (R-134); o item que vem do carrinho leva a sugerida ajustada, e a Análise do Produto aberta do card mostra a conta ajustada | A sugestão do card e a das compras inteligentes já não precisam bater (R-134); aplicar no card pede uma consulta a mais ao abrir o card, que tem teto de chamadas |
| P-09 | Filtro "Projeção ativa" no filtro de movimentação e selo "Proj. N%" na linha | **Opção "Com projeção manual" no mesmo filtro e selo "Projeção +N %"** | O mesmo lugar do legado |

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001, RN-002 | `calcularRessuprimento` com fator 1,2 sobre a base da 011: consumo 2,4, máximo 84, sugestão 36, cobertura 20,8, gatilho 2, adequado; `montarRessuprimento` com o ajuste no mapa liga a linha | regra de tela |
| C-002 | fator 2 com estoque 30: elevada exposição, sugestão 120 | regra de tela |
| C-003 | fator 0,5 com estoque 50: excesso, sugestão 0 | regra de tela |
| C-004, RN-001 | `projecaoAtiva` com validade ontem, hoje, vazia e percentual 0 | regra de tela |
| C-005, RN-004 | `validarProjecao` nas seis recusas e no caso válido; `validadePadrao` = hoje + 30; `previaDaProjecao` | regra de tela |
| C-005, RN-004 | o servidor recusa percentual fora da faixa, zero, validade vazia e motivo curto (0 linhas gravadas) | regra de negócio |
| C-006, RN-005 | remover como gestor zera percentual e validade; a releitura não traz ajuste valendo | regra de negócio |
| C-007 | `filtrarMovimentacao(…, 'projecao')` com três produtos | regra de tela |
| C-008, RN-003 | `preverVendas` com fator 1,2: previsão 72, base 60, MAD/TS/Best Fit iguais aos sem fator; `projetadaDoSku` sugere 36 | regra de tela |
| C-009 | fator 1,5 com consumo 0: sugestão 0 | regra de tela |
| C-010 | fator 1,2 com trânsito: sugestão 0 e `coberturaComTransito` 20,8 | regra de tela |
| C-011 | `coberturaFuturaComCompra` com fator 1,2 e 36: 35,8 | regra de tela |
| C-012 | fator 1,2 com público 0,5: 1,8 desconsiderando, 2,4 com o público | regra de tela |
| C-013, RN-007 | gestor grava; analista, diretoria e comercial não (0 linhas); remover por analista não remove | regra de negócio |
| C-014, RN-006 | a lista da filial 2 não traz o ajuste da filial 1; regravar no mesmo produto atualiza a linha (uma só) | regra de negócio |
| C-015 | `itemDoCarrinho` de linha com fator 1,2 leva sugerida 36 | regra de tela |
| RN-008 | `textoDoSelo` com +20, −12,5 e +100 | regra de tela |
| RF-009 | `linhaCsv` traz o percentual na última coluna | regra de tela |

- O que só olho humano verifica fica em **Verificação manual**:
  - [x] Selo na linha, bloco no painel e na Análise do Produto, janela de ajuste com a prévia, nos dois temas
  - [x] Botão desabilitado com o motivo para analista e diretoria, nunca escondido (mesmo predicado `parametrizarCompras` do botão Parâmetros)
  - [x] Barra de projeção do gráfico com o valor ajustado escrito em cima (simulador, 5407: 93 → 112 com +20 %)

## Fora de escopo

- [ ] Ajuste por fornecedor inteiro, por seção ou por departamento (P-07).
- [ ] Ajuste na fórmula de sugestão do card do pedido (P-08).
- [ ] Histórico dos ajustes de um produto (quem mudou de quanto para quanto). Fica registrado só o último: quem gravou, quando e o motivo.
- [ ] Ajuste por mês (curva sazonal manual). O percentual é um só até a validade.
- [ ] O valor sugerido estimado do seletor de fornecedor (calculado antes de abrir a filial) não considera ajuste.
- [ ] Migrar os ajustes do sistema antigo (lá eles não tinham efeito).

## Pendências

- Aprovação das propostas P-01..P-09 pelo usuário.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem caminho de erro (C-005, C-013)
- [x] Seção "Testes" preenchida: todo C-0NN e toda RN-0NN com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto (as perguntas têm proposta)
