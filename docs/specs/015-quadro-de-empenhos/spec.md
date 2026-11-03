# Spec: Quadro de empenhos — do empenho do órgão público ao pedido por fornecedor

**ID:** 015-quadro-de-empenhos · **Status:** aprovada; perguntas P-01..P-14 aprovadas pelo usuário em 2026-11-03 (R-162) · **Data:** 2026-11-03 · **Onda:** 5 (mapa das ondas do 000) · **Origem:** p-60523, Kanban de Empenhos (`docs/regras-de-negocio/20-kanban-empenhos.md`, RN-EMP-01..119), telas `/empenhos`, `/empenhos/novo`, `/empenhos/pregoes`, `/empenhos/indicadores`

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

A Benenutri vende a órgãos públicos por licitação. Ganho o pregão, cada **empenho** que o
órgão emite é uma ordem de entrega com prazo: tantos produtos, a tal preço, até tal data.
Para cumprir, compras precisa decidir item a item de onde sai a mercadoria (estoque da
filial, transferência de outra filial ou compra da indústria), saber se o custo cabe no
preço do contrato (o CMV), passar pela gerência e pela diretoria, pedir a cada indústria a
sua parte e acompanhar até tudo chegar. No sistema antigo isso era um quadro próprio, ao
lado do de compras. O SGC 2 só tem o quadro de compras: hoje o empenho não tem onde nascer,
e a pergunta "este contrato está dentro do prazo e da margem?" não tem resposta.

## Resultado esperado

Um segundo quadro, **Empenhos**, ao lado do de compras, com o mesmo jeito de usar (card
aberto, histórico, chat, tarefas, anexos), e quatro coisas que só ele tem:

1. **Pregão** — o cadastro da licitação (edital, órgão comprador, fim da vigência), uma tela
   com o histórico de empenhos de cada pregão e uma aba no card.
2. **Novo empenho** — a janela que cria o card a partir do pregão, com filial, recebimento,
   prazo de entrega, os itens (produto, quantidade, preço do contrato e custo negociado) e o
   CMV calculado na hora.
3. **O fluxo do empenho** — Análise (de onde sai cada item, com o estoque de todas as
   filiais), Aprovação Técnica, Aprovação da Diretoria (que congela o CMV) e o
   **desmembramento**: um card por indústria e um card de transferência entre filiais, que
   andam sozinhos (envio, aguardando, trânsito, pendência) até o empenho voltar a ser um só,
   concluído ou cancelado.
4. **Indicadores** — empenhos em aberto, valor de contrato, CMV, prazos vencendo, por órgão,
   e a venda pública ao lado da privada mês a mês.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| analista (comprador) | cadastrar pregão e empenho, decidir de onde sai cada item, enviar para aprovação, pedir às indústrias, abrir e fechar pendências, cancelar | diária |
| gestor (gerência de compras) | tudo do analista **e** aprovar ou reprovar tecnicamente | diária |
| diretoria | aprovar ou reprovar na própria fase (e só nela); ler tudo | semanal |
| admin (TI) | tudo, e administrar o quadro (nome e cor das fases, campos, automações) | eventual |
| comercial | **não** entra no quadro, nos pregões nem nos indicadores de empenho | — |

O nível de acesso da plataforma continua valendo acima do perfil: somente-leitura vê e não
grava nem move; acesso restrito só move os cards que criou.

## Cenários

Formato Dado/Quando/Então. **CMV** é custo ÷ preço do contrato (custo de quanto se paga à
indústria, preço de quanto o órgão paga). **Custo efetivo** de um item: o negociado, se foi
informado e é maior que zero e a pessoa não escolheu "pedir pelo padrão"; senão o especial
do órgão, se existe; senão o custo padrão do Gestão de Custos (R-128). **Venda válida** é a
da R-131 (sem venda para a própria rede e sem remessa de entrega futura).

### Acesso e quadro

**C-001 — O comercial não entra**
- **Dado que** a pessoa tem o perfil comercial
- **Quando** abre o menu ou digita o endereço do quadro de empenhos, dos pregões ou dos indicadores
- **Então** não vê os itens no menu e a página diz que o perfil não tem acesso

**C-002 — Dez fases, por chave**
- **Dado que** o quadro de empenhos foi instalado
- **Quando** alguém o abre
- **Então** vê, nesta ordem: Análise, Aprovação Técnica, Aprovação da Diretoria, Empenho em pedidos, Envio para Indústria, Aguardando Indústria, Em Trânsito para BN, Pedidos com Pendência, Empenhos Concluídos (sucesso) e Empenhos Cancelados (cancelado) *(P-01)*; o administrador pode renomear e recolorir sem quebrar regra nenhuma

**C-003 — O quadro de compras não muda**
- **Dado que** existe o quadro de empenhos
- **Quando** alguém move, exclui ou cria pedido no quadro de compras
- **Então** vale exatamente a regra de hoje do quadro de compras

### Pregão

**C-004 — Cadastrar pregão**
- **Dado que** o analista digita um edital que não existe
- **Quando** escolhe o órgão na busca de clientes do ERP (2 letras ou o código), informa o fim da vigência e salva
- **Então** o pregão nasce ativo, com o nome do órgão e o código do cliente, e já fica escolhido no novo empenho

**C-005 — Edital repetido**
- **Dado que** já existe o pregão "PE 12/2026"
- **Quando** alguém tenta cadastrar outro com o mesmo edital
- **Então** o sistema recusa com "Já existe um pregão com este edital" e não cria nada

**C-006 — Histórico do pregão**
- **Dado que** o pregão tem três empenhos
- **Quando** alguém abre a tela de pregões e escolhe o pregão
- **Então** vê os três empenhos (número, filial, recebimento, limite de entrega, fase, valor, CMV) e o consolidado: quantidade, valor de contrato, custo e CMV pela razão das somas (C-021); a lista de pregões é paginada e filtrada por edital ou órgão

**C-007 — Aba Pregão no card**
- **Dado que** o card de um empenho (ou de um pedido desmembrado dele) está aberto
- **Quando** a pessoa abre a aba Pregão
- **Então** vê o pregão, o alerta de vigência (vencida, em N dias) e os **outros** empenhos do mesmo pregão; o deste card não aparece na lista

### Novo empenho

**C-008 — Criar empenho**
- **Dado que** o analista escolheu o pregão, a filial do contrato, a data de recebimento e acrescentou ao menos um item
- **Quando** clica Criar empenho
- **Então** nasce um card na Análise com o título "edital · nº do empenho" (ou "sem número"), o prazo do card na data limite de entrega, o órgão, a filial e o valor do contrato na capa, e os itens gravados com o custo padrão e o especial de hoje

**C-009 — Sem o mínimo não cria**
- **Dado que** falta pregão, filial, recebimento ou item
- **Quando** o analista olha o botão Criar empenho
- **Então** o botão está desabilitado e a janela diz o que falta

**C-010 — Prazo e data limite se preenchem um a partir do outro**
- **Dado que** o recebimento é 08/09/2026
- **Quando** o analista digita 15 dias corridos
- **Então** a data limite vira 23/09/2026; em dias úteis vira 29/09/2026 (sábado e domingo pulados, sem feriado); digitar a data limite preenche o prazo; a data limite gravada não muda depois sozinha

**C-011 — Filial do pedido**
- **Dado que** o contrato é da filial 1
- **Quando** o analista não toca na filial do pedido
- **Então** a filial do pedido acompanha a do contrato; quando escolhe outra, os pedidos às indústrias saem por ela

**C-012 — Item pelo ERP, custo pelo Gestão de Custos**
- **Dado que** o analista busca "dieta" (ou o código)
- **Quando** escolhe o produto
- **Então** o item entra com o código de fábrica e a indústria do cadastro, o custo padrão do Gestão de Custos e, se o órgão tem preço especial vigente para o produto, o custo especial; produto repetido não entra duas vezes

**C-013 — CMV na hora, aviso acima de 70 %**
- **Dado que** o item tem 35 un. a R$ 132,52 no contrato e custo efetivo de R$ 96,28
- **Quando** o analista olha o resumo
- **Então** vê valor de contrato R$ 4.638,20, custo R$ 3.369,80 e CMV 72,65 %, com o aviso "acima dos 70 % de referência" — que não bloqueia nada

### Análise

**C-014 — Estoque de todas as filiais**
- **Dado que** o card está na Análise
- **Quando** a pessoa abre a seção de itens
- **Então** vê, por item, o disponível (físico menos bloqueado e reservado, nunca negativo), a venda dos últimos 45 dias, a cobertura em dias ("sem venda" sem venda) e a última venda, primeiro na filial do contrato e depois nas outras filiais com saldo ou venda *(P-02)*

**C-015 — Decidir de onde sai**
- **Dado que** o item tem 100 un. no empenho
- **Quando** o analista põe 60 em comprar da indústria, 30 em transferir da filial 2 e 10 em usar o estoque
- **Então** a decisão fecha e salva; com soma 90 aparece "Faltam 10 un. para fechar"; com 110, "A soma passou 10 un."; transferência sem filial de origem pede a filial; "Comprar tudo" põe as 100 em compra

**C-016 — Custo para pedir**
- **Dado que** o item tem custo negociado
- **Quando** o analista escolhe "pedir pelo padrão"
- **Então** o custo efetivo, o CMV da linha e o do empenho passam a ignorar o negociado, antes e depois de salvar

**C-017 — Salvar a análise em lote**
- **Dado que** o analista mudou cinco itens
- **Quando** salva
- **Então** os cinco são gravados de uma vez, o valor do contrato, o custo e o CMV da capa são recalculados e o histórico do card registra quem salvou

**C-018 — Sair da Análise pede tudo decidido**
- **Dado que** um item ainda não fecha a quantidade, não tem preço do contrato ou tem transferência sem filial
- **Quando** alguém tenta mover para Aprovação Técnica (pelo botão ou por "Mover para")
- **Então** o movimento é recusado com o motivo e até três produtos citados; empenho sem item também não sai; o servidor recusa a mesma coisa

**C-019 — Editar o cabeçalho na Análise**
- **Dado que** o empenho ainda está na Análise
- **Quando** o analista corrige o número do empenho, o recebimento, o prazo, a filial do pedido ou "aceita parcial"
- **Então** grava, e o título e o prazo do card acompanham *(P-11)*

### Aprovações

**C-020 — Aprovação técnica**
- **Dado que** o empenho está na Aprovação Técnica
- **Quando** o gestor (ou admin) aprova
- **Então** o sistema grava quem e quando e move para a Diretoria; analista e diretoria veem o botão desabilitado com o motivo, e o servidor recusa o movimento sem a aprovação gravada

**C-021 — Aprovação da diretoria congela e desmembra**
- **Dado que** o empenho está na Aprovação da Diretoria com itens a comprar de duas indústrias e um a transferir
- **Quando** a diretoria (ou admin) aprova
- **Então** o valor de contrato, o custo e o CMV são congelados naquele instante; nascem dois cards "edital · indústria" em Envio para Indústria e um card "edital · Transferência entre filiais" em Pedidos com Pendência, com uma pendência por item a transferir ("Transferir N un. de X da filial F"); o empenho vai para Empenho em pedidos com "faltam 3 de 3" *(P-01)*

**C-022 — Nada a pedir não desmembra**
- **Dado que** todos os itens são "usar estoque"
- **Quando** a diretoria aprova
- **Então** o sistema avisa que não há pedido a gerar e o empenho vai direto para Empenhos Concluídos, com o CMV congelado *(P-07)*

**C-023 — Reprovar devolve à Análise**
- **Dado que** o empenho está numa aprovação
- **Quando** quem decide a fase reprova com um motivo de ao menos 10 caracteres
- **Então** o motivo e quem reprovou ficam gravados e no histórico, as aprovações já dadas são apagadas, e o empenho volta à Análise; sem motivo ou por quem não decide aquela fase, nada é gravado e nada se move *(P-07)*

**C-024 — A diretoria só mexe na própria fase**
- **Dado que** a pessoa é diretoria
- **Quando** abre um card fora da Aprovação da Diretoria
- **Então** os destinos de "Mover para" estão desabilitados com "Você só movimenta cards na fase Aprovação da Diretoria"

### Pedidos por indústria (cards desmembrados)

**C-025 — Enviar à indústria**
- **Dado que** o card da indústria está em Envio para Indústria
- **Quando** o analista informa o número do pedido e a data do envio e confirma
- **Então** os dois ficam gravados e o card vai para Aguardando Indústria; sem um dos dois, o movimento é recusado na tela e no servidor *(P-04)*

**C-026 — Faturado e em trânsito**
- **Dado que** o card está em Aguardando Indústria
- **Quando** o analista informa a previsão de chegada
- **Então** o card vai para Em Trânsito para BN; sem a previsão, não vai

**C-027 — Recebido na BN**
- **Dado que** o card está em Em Trânsito sem pendência aberta
- **Quando** o analista marca recebido
- **Então** grava a data do recebimento e o card vai para Empenhos Concluídos

**C-028 — Pendência segura o card**
- **Dado que** o card tem uma pendência aberta
- **Quando** alguém tenta avançar o card (envio, trânsito, recebido)
- **Então** o movimento é recusado com "Feche as pendências abertas antes de avançar"

**C-029 — Abrir pendência leva a Pedidos com Pendência**
- **Dado que** o card está em Envio, Aguardando ou Trânsito
- **Quando** o analista abre uma pendência (falta na indústria ou venda pendente), com descrição de ao menos 10 caracteres e previsão opcional
- **Então** a pendência nasce aberta e o card vai para Pedidos com Pendência

**C-030 — Fechar a última pendência volta ao trânsito**
- **Dado que** o card está em Pedidos com Pendência com uma pendência aberta
- **Quando** o analista a resolve (ou cancela)
- **Então** grava quem e quando e o card volta a Em Trânsito para BN — nunca direto a Concluídos

**C-031 — Transferência entre filiais**
- **Dado que** o card de transferência nasceu com duas pendências de transferência
- **Quando** as duas são resolvidas
- **Então** o card vai para Em Trânsito; não tem envio à indústria; mostra a filial de origem de cada item

**C-032 — O empenho volta a ser um só**
- **Dado que** o empenho tem três cards desmembrados
- **Quando** o último deles chega a Concluídos ou Cancelados
- **Então** o empenho vai para Empenhos Concluídos (ou Cancelados, se **todos** foram cancelados); enquanto faltar algum, a capa do empenho diz "faltam N de M" e a de cada pedido "pedido K de M"

**C-033 — Cancelar o empenho leva todos**
- **Dado que** o empenho está em qualquer fase aberta
- **Quando** quem pode cancela, com um motivo de ao menos 10 caracteres *(P-13)*
- **Então** o empenho e todos os seus cards abertos vão para Empenhos Cancelados com o motivo; não existe cancelar uma indústria só

**C-034 — Excluir só o rascunho**
- **Dado que** o empenho está na Análise, sem card desmembrado
- **Quando** admin, gestor ou diretoria exclui
- **Então** o card é excluído; card desmembrado e empenho fora da Análise não mostram Excluir, e o servidor recusa

### Prazos e capa

**C-035 — Alerta de prazo e de vigência**
- **Dado que** faltam 2 dias para a data limite de entrega (ou 20 para o fim da vigência)
- **Quando** alguém olha o card ou os indicadores
- **Então** vê "entrega em 2 d" em crítico (≤ 3 dias), atenção até 7 dias (vigência: até 30), "entrega atrasada" depois da data, "vence hoje" no dia; prevalece o mais grave e, no empate, a vigência; sem data não há alerta

### Indicadores

**C-036 — Os números do período**
- **Dado que** a pessoa escolhe um período e, opcionalmente, uma filial
- **Quando** abre os indicadores
- **Então** vê empenhos em aberto, valor de contrato, custo e CMV (vermelho acima de 70 %) dos empenhos recebidos no período, os prazos de entrega dos abertos (mais atrasado primeiro, paginado), o resumo por órgão (contrato, custo, CMV pela razão) e o gráfico mês a mês da venda a órgão público ao lado da privada, em barras lado a lado, com o valor escrito em cada barra *(P-03, P-05, P-14)*

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O quadro de empenhos DEVE existir ao lado do de compras, com as dez fases por chave e o mesmo card aberto | C-002 | must |
| RF-002 | Quadro, pregões e indicadores DEVEM ser vistos por admin, analista, gestor e diretoria e recusados ao comercial, inclusive por endereço | C-001 | must |
| RF-003 | A regra do quadro de compras NÃO DEVE mudar | C-003 | must |
| RF-004 | DEVE haver cadastro de pregão com edital único e órgão do ERP, uma tela de pregões paginada e a aba Pregão no card | C-004..C-007 | must |
| RF-005 | O empenho DEVE nascer por uma janela sobre o quadro, com pregão, filial, recebimento, prazo/data limite e itens | C-008..C-012 | must |
| RF-006 | O CMV DEVE aparecer na criação, na análise e nas aprovações, com o aviso de 70 % que não bloqueia | C-013, C-016 | must |
| RF-007 | A Análise DEVE mostrar o estoque e a venda de todas as filiais e a decisão em três destinos, salva em lote | C-014..C-017 | must |
| RF-008 | Sair da Análise DEVE exigir a decisão completa, na tela e no servidor | C-018 | must |
| RF-009 | O cabeçalho DEVE ser editável enquanto o empenho estiver na Análise | C-019 | should |
| RF-010 | As duas aprovações DEVEM ser gravadas antes de mover, conferidas no servidor, e a reprovação DEVE exigir motivo | C-020, C-023, C-024 | must |
| RF-011 | A aprovação da diretoria DEVE congelar valores e CMV e desmembrar em um card por indústria e um de transferência | C-021, C-022 | must |
| RF-012 | Cada card desmembrado DEVE andar sozinho, com as travas de envio, previsão, recebimento e pendência na tela e no servidor | C-025..C-031 | must |
| RF-013 | O empenho DEVE voltar a ser um só quando o último pedido terminar, e a capa DEVE dizer quanto falta | C-032 | must |
| RF-014 | Cancelar DEVE levar o empenho inteiro, com motivo | C-033 | must |
| RF-015 | Excluir DEVE valer só para o empenho em rascunho | C-034 | should |
| RF-016 | Prazo de entrega e vigência DEVEM aparecer como alerta com rótulo, nunca só cor | C-035 | must |
| RF-017 | Os indicadores DEVEM seguir um período só, com a venda pública e a privada lado a lado e o valor em cada barra | C-036 | must |
| RF-018 | Toda lista DEVE ser paginada | C-006, C-036 | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Abrir um card de empenho custa a leitura do card do quadro **mais uma** chamada do empenho; o estoque das filiais custa uma chamada a mais, só na Análise | Contador de chamadas ao abrir |
| RNF-002 | Salvar a análise é uma chamada, qualquer que seja o número de itens alterados | Contador ao salvar 20 itens |
| RNF-003 | O quadro se atualiza a cada 60 s; a capa não custa chamada por cartão | Contador com o quadro parado |
| RNF-004 | A busca de produto e de órgão espera meio segundo depois da última tecla | 6 letras seguidas = uma chamada |
| RNF-005 | Desmembrar custa três chamadas por card gerado (criar, registrar, mover) mais uma por pendência de transferência | Contador na aprovação |

## Entidades do domínio

- **Pregão** — a licitação ganha: edital (único), órgão comprador (cliente do ERP), fim da vigência.
- **Empenho** — a ordem de entrega de um órgão dentro de um pregão: número, filial do contrato e do pedido, recebimento, prazo e data limite de entrega, aceita parcial, itens, aprovações, valores e CMV (vivos até a diretoria, congelados depois).
- **Item do empenho** — produto, quantidade, preço do contrato, custo negociado, especial e padrão, o "custo para pedir", e a decisão: comprar, transferir (de qual filial) e usar estoque.
- **Pedido do empenho** — o card desmembrado: de uma indústria (com número, data do envio, previsão e recebimento) ou de transferência entre filiais.
- **Pendência** — o que segura um pedido: falta na indústria, venda pendente ou transferência; aberta, resolvida ou cancelada.

## Regras de negócio

- **RN-001 — Custo efetivo.** "Pedir pelo padrão" → especial (> 0) senão padrão. Senão: negociado (> 0) → especial (> 0) → padrão; zero no negociado é "não negociei". Uma conta só em toda a tela e no servidor *(P-06)*.
- **RN-002 — CMV.** Do item: custo efetivo ÷ preço do contrato (sem preço: traço). Do empenho: Σ(qtd × custo efetivo) ÷ Σ(qtd × preço) — razão das somas, nunca média. Aviso acima de 70 %; não bloqueia.
- **RN-003 — Valores vivos e congelados.** Até a aprovação da diretoria, valor de contrato, custo e CMV são vivos (recalculados a cada salvar). Na aprovação, os três ficam congelados com data. Pregão e indicadores mostram o congelado quando existe, senão o vivo *(P-05)*.
- **RN-004 — Data limite.** Corridos: recebimento + N dias. Úteis: pula sábado e domingo, sem feriados. Prazo negativo é inválido. O inverso conta os dias entre as datas na mesma unidade. A data limite gravada é a que vale.
- **RN-005 — Estoque e venda das filiais.** Disponível = físico − bloqueado − reservado, mínimo 0; filial 99 fora. Venda de 45 dias e última venda: venda válida **com** o órgão público *(P-02)*. Cobertura = disponível ÷ (venda 45 d ÷ 45), arredondada; sem venda, "sem venda". Filial relevante: disponível > 0 ou venda > 0.
- **RN-006 — Decisão.** compra + transferência + estoque = quantidade do empenho, com tolerância de 0,0005; soma zero: "Distribua a quantidade entre as decisões"; transferência > 0 exige filial de origem. A origem principal do item é a maior das três, compra vence o empate.
- **RN-007 — Prontidão da Análise.** Todo item com decisão fechada, transferência com filial e preço do contrato > 0; ao menos um item. A mensagem cita até três produtos.
- **RN-008 — Transições.** Empenho: Análise → Técnica (RN-007); Técnica → Diretoria (aprovação técnica gravada) ou → Análise (reprovação gravada); Diretoria → Empenho em pedidos (aprovação gravada e desmembrado) ou → Concluídos (C-022) ou → Análise (reprovação gravada); Empenho em pedidos → Concluídos ou Cancelados só pelo reagrupamento (RN-012); qualquer fase aberta → Cancelados com motivo. Pedido da indústria: Envio → Aguardando (nº e data); Aguardando → Trânsito (previsão); Trânsito → Concluídos (sem pendência aberta); Envio, Aguardando ou Trânsito → Pendência (com pendência aberta); Pendência → Trânsito (nenhuma aberta); Aguardando → Envio e Trânsito → Aguardando (voltar); qualquer aberta → Cancelados só pelo cancelamento do empenho. Transferência: Pendência ↔ Trânsito pela mesma regra de pendência; Trânsito → Concluídos sem pendência. O pedido recém-gerado sai da Análise para a sua fase de entrada. Nenhum outro par vale *(P-04)*.
- **RN-009 — Quem move.** Admin, analista e gestor movem em qualquer fase (como no quadro de compras do SGC 2); diretoria só na Aprovação da Diretoria; comercial e somente-leitura não movem; restrito só os próprios *(P-12)*. Aprovar técnica: admin e gestor. Aprovar diretoria: admin e diretoria.
- **RN-010 — Desmembramento.** Um pedido por indústria com algum item a comprar (> 0), com os itens e as quantidades a comprar; valor = Σ compra × preço, custo = Σ compra × custo efetivo. Um pedido de transferência, se algum item tem transferência > 0, com uma pendência de transferência por item (quantidade e filial de origem). O item dividido entre compra e transferência fica no pedido da indústria pela parte comprada e no de transferência pela parte transferida. "Usar estoque" não gera pedido. Só se marca "desmembrado" depois de gerar ao menos um pedido *(P-07)*.
- **RN-011 — Pendência.** Tipos: falta na indústria, venda pendente (manuais) e transferência (automática). Abrir: descrição ≥ 10 caracteres. Só pendência aberta se fecha (resolvida ou cancelada), com quem e quando.
- **RN-012 — Reagrupamento.** Pedidos do empenho contados pelo vínculo do próprio empenho (uma fonte só, *P-08*). Quando todos estão em fase final: o empenho vai a Cancelados se **todos** foram cancelados, senão a Concluídos.
- **RN-013 — Alertas de prazo.** Dias restantes: < 0 vencido, ≤ 3 crítico, ≤ 7 atenção (vigência ≤ 30), senão sem alerta; o pior dos dois vale, empate da vigência. Contado no fuso de Brasília.
- **RN-014 — Indicadores.** Período pela data de recebimento do empenho. Em aberto = empenho fora das fases finais. Valor, custo e CMV pela RN-003, CMV pela razão. Prazos: abertos, mais atrasado primeiro. Por órgão: a mesma razão. Venda pública = venda válida a órgão público (ramos 11 a 15); privada = venda válida aos demais; a rede fica fora dos dois lados *(P-03)*; compras = entradas por compra. Tudo pelo mesmo período *(P-14)*.

## Perguntas ao usuário (divergências do legado) — aprovadas pelo usuário em 2026-11-03

O usuário aprovou as 14 propostas em 2026-11-03 ("Aprovar todas", R-162); cada proposta é o que
está implementado, e trocar uma é mexer num ponto só. Fonte: `20-kanban-empenhos.md` e `99-divergencias-spec-codigo.md` do legado.

| # | O legado | Proposta (implementada) | Por quê |
|---|---|---|---|
| P-01 | Depois do desmembramento o card do empenho some do quadro e só os pedidos aparecem (D20, RN-EMP-75) | **Fase própria "Empenho em pedidos"** onde o empenho espera, com "faltam N de M" na capa, e de onde vai sozinho a Concluídos ou Cancelados | O quadro do SGC 2 não esconde card (é a mesma lib do quadro de compras, que não se edita daqui); a coluna dá a visão por contrato que hoje só existia no detalhe |
| P-02 | A venda de 45 dias da análise conta toda saída (inclusive venda à rede e remessa de entrega futura) | **Venda válida da R-131 com o órgão público** | O empenho é venda pública: tirar o público esconderia o giro que importa; rede e remessa duplicam venda |
| P-03 | Indicadores tratam público como ramos 11 a 15 **e 20** | **11 a 15**; o ramo 20 (filial) fica fora dos dois lados | R-131: o ramo 20 é a própria rede |
| P-04 | As travas de operação (nº e data do pedido, previsão, pendência aberta) só existem no painel; "Mover card" passa por cima (div. 6, RN-EMP-82) | **As travas valem também no servidor**, nos pares fixos da RN-008 | Regra que só a tela cobra não é regra |
| P-05 | Valor e custo do empenho são recalculados a cada salvar, inclusive depois da aprovação; só o CMV congela (div. 3) | **Os três congelam na aprovação da diretoria**; pregão e indicadores mostram o congelado quando existe | O número aprovado é o que se audita |
| P-06 | Os painéis de operação e de nota ignoram o "custo para pedir" (div. 4) | **Uma conta só (RN-001)** em todo lugar | Valor do pedido diferente do aprovado |
| P-07 | "Desmembrado" é carimbado mesmo sem gerar card; reprovar não confere se gravou (div. 8 e 9) | **Carimba só com pedido gerado** (sem nada a pedir, conclui direto, C-022); **reprovar só move se gravou** | Evitam empenho travado e rodada apagada sem registro |
| P-08 | Duas contagens de pedidos do empenho, que divergem (div. 11) | **Uma**, pelo vínculo do empenho | — |
| P-09 | Estoque bloqueado pela função de bloqueios (que diz o motivo) segundo a spec; o código desconta direto (div. 5) | **Desconta direto**, sem motivo | O que o legado de fato fazia |
| P-10 | Anexo do empenho sobe como arquivo público (div. 2) | **Sem campo de anexo próprio**: o documento vai na aba Anexos do card, que já avisa que o arquivo fica em endereço público | Não duplicar o que o card já tem |
| P-11 | O cabeçalho do empenho não se edita depois de criado (div. 16) | **Editável na Análise** | Erro de digitação no número ou no prazo hoje exige recriar |
| P-12 | No quadro de empenhos o gestor só move na Aprovação Técnica e só vê os próprios cards e essa fila (RN-EMP-117/118) | **Gestor como no quadro de compras do SGC 2**: vê tudo e move em qualquer fase | Uma persona, uma regra, nos dois quadros |
| P-13 | Cancelar o empenho não pede motivo (D14) | **Motivo de ao menos 10 caracteres**, gravado e no histórico | Igual ao quadro de compras; cancelamento sem motivo não se explica depois |
| P-14 | Os números do topo dos indicadores são de todo o histórico e só o gráfico segue o período (div. 15) | **Tudo segue o período** | Leitura consistente |

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | matriz: `verEmpenhos` falso só para comercial; menu do comercial sem os itens; a página barra pelo mesmo predicado | regra de tela |
| C-002 | o quadro do seed tem as 10 chaves na ordem, com os tipos sucesso/cancelado nas duas finais | regra de negócio |
| C-003 | o gancho devolve para um card de compras exatamente o que devolvia (par inválido recusado, par válido livre) | regra de negócio |
| C-004, C-005 | criar pregão como Ana grava; repetir o edital não cria a segunda linha; Leo (comercial) não grava | regra de negócio |
| C-006 | a lista de pregões filtra por órgão e traz QT_EMPENHOS e valores; empenhos do pregão com a fase | regra de negócio |
| C-007 | `outrosEmpenhos` tira o empenho do card; `nivelDaVigencia` | regra de tela |
| C-008 | empenho criado como Ana sobre um card do quadro de empenhos grava; sobre card de compras não grava | regra de negócio |
| C-009 | `validarNovoEmpenho` lista o que falta | regra de tela |
| C-010 | `dataLimite`/`prazoEmDias` corridos e úteis (08/09 + 15 = 23/09 e 29/09), negativo inválido | regra de tela |
| C-012 | busca de produto no ERP devolve código de fábrica e indústria; WinThor real com contagem > 0 | regra de negócio |
| C-013, RN-001, RN-002 | `custoEfetivo` nas quatro pontas; `totaisEmpenho` com 35 × 96,28 / 35 × 132,52 = 72,65 %; `cmvAcimaDaReferencia` | regra de tela |
| C-014, RN-005 | estoque das filiais: disponível sem bloqueado e reservado, filial 99 fora, venda 45 d sem rede e sem remessa e com público; `resumoDaFilial` cobertura e relevância; WinThor real com contagem > 0 | regra de negócio + regra de tela |
| C-015, RN-006 | `validarDecisao` nas quatro mensagens; `origemPrincipal` com empate | regra de tela |
| C-017, RNF-002 | gravar 3 itens numa chamada atualiza os três e recalcula VL_TOTAL/VL_CUSTO; comercial não grava | regra de negócio |
| C-018, RN-007 | `prontidaoDaAnalise`; o gancho recusa Análise → Técnica com item aberto e libera com tudo fechado | regra de tela + regra de negócio |
| C-019 | atualizar cabeçalho na Análise grava; fora dela não | regra de negócio |
| C-020, C-024, RN-009 | aprovação técnica por Gil grava, por Ana não; o gancho recusa Técnica → Diretoria sem aprovação e libera com ela; diretoria fora da fase recusada | regra de negócio + regra de tela |
| C-021, RN-003, RN-010 | `planoDeDesmembramento` (2 indústrias, 1 transferência, item dividido); congelar grava os três valores; registrar pedido e pendências; o gancho libera Diretoria → Empenho em pedidos só desmembrado | regra de tela + regra de negócio |
| C-022 | `planoDeDesmembramento` vazio; o gancho libera Diretoria → Concluídos só sem nada a pedir | regra de tela + regra de negócio |
| C-023 | reprovar com motivo curto não grava; com motivo grava e limpa as aprovações; o gancho só libera a volta com reprovação gravada | regra de negócio |
| C-025..C-031, RN-008, RN-011 | o gancho em cada par de pedido (nº/data, previsão, pendência aberta, transferência); abrir e fechar pendência; `destinoAoAbrirPendencia`/`destinoAoFecharPendencia` | regra de negócio + regra de tela |
| C-032, RN-012 | `destinoDoReagrupamento` (concluído, cancelado, nada); o gancho libera Empenho em pedidos → final só com todos os pedidos finais | regra de tela + regra de negócio |
| C-033 | cancelar sem motivo não grava; com motivo grava; o gancho libera → Cancelados só com o motivo gravado | regra de negócio |
| C-034 | o gancho de excluir: empenho na Análise sem pedido por Gil pode; pedido desmembrado não; Ana não | regra de negócio |
| C-035, RN-013 | `nivelDoPrazo`, `alertaDoEmpenho` com empate | regra de tela |
| C-036, RN-014 | resumo, prazos e por órgão no período; venda pública × privada mês a mês com a rede fora; WinThor real com contagem > 0 | regra de negócio |
| RN-004 | casos de C-010 | regra de tela |

- O que só olho humano verifica fica em **Verificação manual**:
  - [x] O quadro, o novo empenho, a análise, a aba Pregão, os pregões e os indicadores no simulador com o WinThor real, nos dois temas
  - [x] Gráfico dos indicadores com o valor escrito em cada barra (R-116)
  - [x] Seções em card recolhidas com resumo (R-126)
  - [x] Botões sem permissão desabilitados com o motivo, nunca escondidos

## Fora de escopo

Fica para a próxima onda do quadro de empenhos (o legado tinha; nada aqui impede):

- [ ] **E-mail do pedido à indústria e arquivo de importação do WinThor** — nesta onda o número e a data do envio são informados à mão.
- [ ] **Nota fiscal do fornecedor**: sugestão, conferência contra o pedido, ocorrências e "nota que ainda não veio".
- [ ] **Extrato do empenho** em PDF e planilha.
- [ ] **Histórico de fotos da análise** (o que se viu a cada salvar).
- [ ] **Prazo padrão da indústria** (parametrização ou média histórica) e o alerta "não cabe na data limite".
- [ ] **Validade dos lotes** sob demanda na análise.
- [ ] **Reprovar item a item** na aprovação (aqui a aprovação e a reprovação são do empenho inteiro).
- [ ] **Liberar pedido para faturamento parcial** (o "aceita parcial" é gravado e mostrado, sem ação).
- [ ] **Apoio à decisão** nas aprovações (economia, compras × vendas do público por indústria).

Fora do SGC 2: escrever no WinThor; importar planilha do empenho; migrar os empenhos do sistema antigo.

## Pendências

Nenhuma: P-01..P-14 aprovadas pelo usuário em 2026-11-03 (R-162), como implementadas.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem caminho de erro (C-005, C-009, C-018, C-023, C-028)
- [x] Seção "Testes" preenchida: todo C-0NN e toda RN-0NN com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto (as perguntas têm proposta)
