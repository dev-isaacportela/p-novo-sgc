# Spec: Coberturas por curva — alvo e tolerância por curva ABC, com auditoria

**ID:** 012-coberturas-por-curva · **Status:** rascunho · **Data:** 2026-09-16

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

O limite de cobertura — quantos dias de estoque futuro a compradora pode deixar num item
sem precisar justificar — hoje é **um número só por alvo**. O mesmo teto vale para o
produto que responde por metade do faturamento e para o que vende três unidades por mês.
Na prática isso erra nas duas pontas: o teto que é confortável para o item de giro alto é
frouxo demais para a cauda longa (dinheiro parado que ninguém precisa justificar), e o teto
que segura a cauda longa barra o item de giro alto toda semana, num pedido em que a compra
maior é a decisão certa.

A empresa já classifica cada item do pedido em curva A, B ou C pelo valor de venda, e essa
classificação hoje só decora a lista: não muda nenhuma decisão. E as mudanças na
parametrização não deixam rastro — quando um limite aparece diferente do combinado, não há
como saber quem mudou, quando, e de quanto para quanto.

## Resultado esperado

Quem mantém a parametrização informa, para cada alvo (fornecedor, departamento, seção ou
produto), **três pares de números**: quantos dias de cobertura a compra mira em cada curva
(o alvo) e quanto de folga é tolerado acima dele sem justificativa (a tolerância em %). A
tela mostra o teto resultante em dias, para ninguém ter que fazer a conta de cabeça. A
montagem do pedido passa a cobrar cada item contra o teto **da curva daquele item**, com a
mesma mensagem de sempre. E toda alteração fica registrada campo a campo, com quem fez,
quando, e o valor antes e depois.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| gestor (gerência de compras) | definir alvo e tolerância por curva para fornecedores, departamentos, seções e produtos; conferir o histórico de alterações; exportar a lista | mensal |
| admin (TI) | o mesmo do gestor, e corrigir parametrização errada | eventual |
| analista (comprador) | **não** entra nesta tela; sente o efeito na montagem do pedido, onde o item fora do teto da sua curva passa a exigir justificativa | diária (efeito) |

O **nível de acesso** que a plataforma dá a cada pessoa continua valendo acima do perfil:
quem tem acesso somente-leitura abre a tela e vê tudo, com todos os controles de escrita
desabilitados. Os perfis **diretoria** e **comercial** não veem esta tela, como já hoje.

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa.

**C-001 — O teto sai do alvo mais a tolerância, por curva**
- **Dado que** o departamento 2 está parametrizado com alvo 35 dias e tolerância 20 % na curva A, alvo 45 e tolerância 10 % na B, e alvo 60 e tolerância 5 % na C
- **Quando** a montagem calcula o teto de um item desse departamento
- **Então** o item de curva A é cobrado contra **42 dias**, o de curva B contra **49,5** e o de curva C contra **63**

**C-002 — Vale a parametrização mais específica, dentro da mesma curva**
- **Dado que** o departamento 2 tem alvo 45 / tolerância 10 % na curva B, e o produto 5001, que é desse departamento, tem alvo 25 / tolerância 0 na curva B
- **Quando** o item 5001 é classificado como curva B
- **Então** o teto dele é **25 dias**, não 49,5 — a parametrização do produto vence a do departamento

**C-003 — Item sem curva é cobrado pela curva C**
- **Dado que** um produto entrou no pedido sem classificação de curva (foi adicionado por busca, fora da análise) e o departamento dele tem alvo 60 / tolerância 5 % na curva C
- **Quando** o teto é calculado
- **Então** vale **63 dias**, o teto da curva C — a curva mais tolerante, nunca a mais apertada

**C-004 — Sem nenhuma parametrização alcançável, 35 dias**
- **Dado que** um produto não tem parametrização de produto, seção, departamento nem fornecedor
- **Quando** o teto é calculado
- **Então** o alvo é **35 dias**, a tolerância é **0** e o teto é **35 dias**

**C-005 — Parametrização sem alvo naquela curva não segura o item**
- **Dado que** a seção 21 foi parametrizada só na curva A (alvo 10 dias) e ficou com alvo zero em B e C, e o departamento 2 tem 45 / 10 % na curva B
- **Quando** um item da seção 21 é classificado como curva B
- **Então** o teto é **49,5 dias**, o do departamento: a parametrização da seção não vale para a curva que ela deixou em branco

**C-006 — A trava de saída passa a cobrar o teto da curva, com a mesma mensagem**
- **Dado que** um pedido na Análise tem um item de curva A com 45 dias de cobertura futura, quantidade maior que zero e teto de 42 dias, sem justificativa
- **Quando** a compradora tenta enviar o pedido para a aprovação técnica
- **Então** o envio é recusado com a mesma frase de sempre — "Justifique os itens com cobertura acima do limite (1), a começar por …" — e passa a ser aceito assim que ela justificar esse item

**C-006b — A fração do teto sobrevive até a trava**
- **Dado que** o mesmo pedido tem um item de curva B com **49,2 dias** de cobertura futura, quantidade maior que zero e teto de **49,5 dias**, sem justificativa
- **Quando** a compradora tenta enviar o pedido para a aprovação técnica
- **Então** esse item **não** barra nada: 49,2 está abaixo de 49,5. Meio dia de tolerância que se perde no caminho vira uma justificativa que ninguém entende por que foi pedida

**C-007 — Comprar mira o alvo, não o teto**
- **Dado que** o departamento 2 tem alvo 35 dias e tolerância 20 % na curva A
- **Quando** a sugestão de compra de um item de curva A desse departamento calcula o estoque máximo
- **Então** ela usa **35 dias** (o alvo) e não 42 (o teto sem justificativa) — o teto só existe para decidir o que precisa de justificativa

**C-008 — Alterar as três curvas deixa seis linhas de histórico**
- **Dado que** o departamento 2 está em A 35/20, B 45/10 e C 60/5
- **Quando** o gestor troca os três alvos e as três tolerâncias e salva
- **Então** o histórico ganha **seis linhas**, uma por número alterado, cada uma com o valor antes, o valor depois, quem alterou, quando, e a ação "alterou"

**C-009 — Criar uma parametrização registra o que nasceu preenchido**
- **Dado que** não existe parametrização para o produto 5004
- **Quando** o gestor cadastra descrição e os três pares e salva
- **Então** a parametrização passa a valer e o histórico ganha uma linha por campo preenchido, com o valor anterior vazio e a ação "criou"

**C-010 — Desativar tira da resolução; regravar reativa**
- **Dado que** o produto 5001 tem parametrização ativa com teto 25 dias na curva B e o departamento dele tem 49,5 na mesma curva
- **Quando** o gestor desativa a parametrização do produto
- **Então** o histórico ganha uma linha com a ação "desativou" e o item 5001 de curva B passa a ser cobrado contra **49,5 dias**
- **E quando** ele filtra a lista por "Inativas", encontra a parametrização desativada e a regrava
- **Então** o histórico ganha "reativou" — não "criou" — e o teto volta a 25

**C-011 — Quem mantém, quem lê e quem não entra**
- **Dado que** um analista tenta abrir a tela de coberturas pelo endereço direto, e um gestor com acesso somente-leitura abre a mesma tela
- **Quando** as duas tentativas acontecem
- **Então** o analista recebe uma recusa de acesso e não vê a lista; o gestor somente-leitura vê a lista inteira com todos os controles de escrita desabilitados, nenhum escondido

**C-012 — Exportar a lista**
- **Dado que** a lista tem parametrizações de níveis diferentes
- **Quando** o gestor exporta
- **Então** o arquivo traz uma linha por parametrização com nível, código, descrição, situação e, por curva, alvo em dias, tolerância em % e o teto resultante

**C-013 — O teto aparece calculado, não digitado**
- **Dado que** o gestor está preenchendo a curva B com alvo 45 e tolerância 10 %
- **Quando** ele termina de digitar os dois campos
- **Então** o painel da curva B mostra "49,5 dias" como máximo sem justificativa, antes de salvar; faltando um dos dois números, mostra um traço

**C-014 — O histórico responde "quem mudou o quê"**
- **Dado que** houve alterações em parametrizações diferentes ao longo do mês
- **Quando** o gestor abre o histórico
- **Então** vê as alterações da mais recente para a mais antiga, cada uma com o alvo, o campo, o valor antes, o valor depois, a ação, quem fez e quando; e pode ver só as de uma parametrização escolhida

**C-015 — Mudar a régua não reescreve pedido já montado**
- **Dado que** um pedido na Análise já tem um item de curva B com teto **49,5** gravado e o gestor troca a parametrização daquele alvo para 30 dias sem tolerância depois disso
- **Quando** a compradora reabre o pedido
- **Então** o item continua com os 49,5 que a análise gravou, e é contra eles que a trava de saída decide; o teto novo passa a valer quando ela montar a análise de novo

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | Cada parametrização de cobertura DEVE guardar, por curva A, B e C, um alvo em dias e uma tolerância em percentual | A tela cadastra os seis números num salvamento só (C-008, C-009) | must |
| RF-002 | O teto sem justificativa DEVE ser o alvo acrescido da tolerância, arredondado a duas casas | 35 com 20 % = 42; 45 com 10 % = 49,5; 60 com 5 % = 63 (C-001) | must |
| RF-003 | O teto de um item DEVE sair da parametrização mais específica que alcance o item **e** tenha alvo para a curva dele: produto, depois seção, depois departamento, depois fornecedor | C-002, C-005 | must |
| RF-004 | Item sem curva classificada DEVE ser cobrado pelo teto da curva C | C-003 | must |
| RF-005 | Sem nenhuma parametrização alcançável, o alvo DEVE ser 35 dias e a tolerância 0 | C-004 | must |
| RF-006 | A trava de saída da Análise DEVE comparar a cobertura futura do item contra o teto da curva **daquele** item, sem mudar a mensagem mostrada à compradora | C-006 | must |
| RF-006b | O teto DEVE chegar à trava com a fração que tem: meia casa de tolerância não pode ser perdida entre a tela e a decisão | item de curva B com 49,2 dias contra teto 49,5 passa (C-006b) | must |
| RF-007 | O alvo em dias DEVE ficar disponível, separado do teto, para o cálculo do estoque máximo da sugestão de compra | C-007 | must |
| RF-008 | Toda alteração de parametrização DEVE gerar uma linha de histórico **por campo alterado**, com valor antes, valor depois, quem e quando | Seis números alterados = seis linhas (C-008); campo não alterado não gera linha | must |
| RF-009 | A ação do histórico DEVE ser derivada do que aconteceu: criou, alterou, desativou ou reativou | C-008, C-009, C-010 | must |
| RF-010 | A tela DEVE listar as parametrizações com nível, alvo, situação e, por curva, alvo, tolerância e o teto calculado, com filtro por situação (todas, ativas, inativas) | C-001, C-010, C-013 | must |
| RF-011 | O formulário DEVE mostrar o máximo sem justificativa de cada curva antes de salvar | C-013 | must |
| RF-012 | Exclusão DEVE ser desativação: a parametrização sai da resolução e o histórico permanece; regravar o mesmo alvo reativa | C-010 | must |
| RF-013 | A tela DEVE ser mantida por gestor e admin e recusar quem não tem acesso, inclusive por endereço direto; quem tem acesso somente-leitura vê e não grava | C-011 | must |
| RF-014 | A tela DEVE exportar a lista em arquivo de planilha simples | C-012 | should |
| RF-015 | O histórico DEVE ser consultável na própria tela, do mais recente para o mais antigo, com recorte por parametrização | C-014 | must |

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Abrir a tela custa **duas** chamadas ao servidor: a lista e a identidade de quem abriu; trocar de página ou de filtro custa **uma** | Contador de chamadas ao abrir e ao paginar |
| RNF-002 | Salvar uma parametrização custa **uma chamada de gravação, mais uma por campo alterado, mais uma releitura da lista** — no pior caso 9, com os sete campos mudados. A releitura não é opcional: é ela que mostra o que de fato ficou gravado quando o servidor recusa em silêncio | Contador de chamadas em três salvamentos: 1 campo (3), 6 campos (8), criação completa (9) |
| RNF-003 | Abrir o histórico custa **uma** chamada, qualquer que seja o número de linhas | Contador de chamadas com 1 e com 200 linhas de histórico |
| RNF-004 | Resolver o teto de um item não custa chamada nenhuma: a lista de parametrizações já veio junto da análise | Contador de chamadas ao montar a análise de um fornecedor com 300 produtos: o mesmo de hoje |
| RNF-005 | Um salvamento recusado por falta de permissão não deixa linha de histórico órfã | Tentativa como analista: zero linha gravada nos dois lugares |

## Entidades do domínio

- **Parametrização de cobertura** — o teto de estoque futuro aceitável para um alvo. O alvo é um fornecedor, um departamento, uma seção ou um produto. Guarda três pares alvo/tolerância, um por curva, e pode estar ativa ou inativa. Um alvo tem no máximo uma parametrização.
- **Curva do item** — a classificação A, B ou C que a análise de montagem atribui ao item pelo valor de venda. É ela que escolhe qual dos três pares vale para aquele item.
- **Alvo de cobertura** — quantos dias de estoque a compra mira. É o número que a sugestão de compra usa para o estoque máximo.
- **Teto sem justificativa** — o alvo mais a tolerância. É o número contra o qual a cobertura futura do item é comparada na saída da Análise.
- **Registro de alteração** — uma linha por campo alterado numa parametrização: o campo, o valor antes, o valor depois, a ação, quem e quando.

## Regras de negócio

- **RN-001 — Teto sem justificativa.** Teto = alvo × (1 + tolerância ÷ 100), arredondado a duas casas. Tolerância 0 é válida e significa "nenhuma folga": o teto é o próprio alvo.
- **RN-002 — Precedência.** Vale a parametrização do produto; na falta, a da seção; na falta, a do departamento; na falta, a do fornecedor. Só entra na disputa a parametrização **ativa**, que alcance o item e que tenha alvo maior que zero **para a curva do item**. Sem nenhuma, alvo 35 dias e tolerância 0.
- **RN-003 — Curva ausente.** Item sem curva A, B ou C classificada é cobrado pela coluna da curva C.
- **RN-004 — Alvo × teto.** O alvo é a mira da compra (estoque máximo da sugestão); o teto é a fronteira da justificativa. São dois números diferentes e nunca se substituem: com alvo 35 e tolerância 20 %, a compra mira 35 dias e só exige justificativa acima de 42.
- **RN-005 — Trava de saída.** As cinco exigências de saída da Análise não mudam, nem a ordem, nem as mensagens. Muda só o número contra o qual a cobertura futura do item é comparada, que passa a ser o teto da curva do item.
- **RN-006 — Histórico campo a campo.** Cada campo cujo valor mudou gera uma linha; campo inalterado não gera nada. Na criação, todo campo preenchido conta como alterado, com o valor anterior vazio.
- **RN-007 — Ação derivada.** Não existia e passou a existir: "criou". Estava ativa e ficou inativa: "desativou". Estava inativa e voltou: "reativou". Qualquer outra mudança de valor: "alterou". A ação é a mesma para todas as linhas de um salvamento.
- **RN-008 — Quem mantém.** Gestor e admin mantêm e leem; nenhum outro perfil abre a tela. Acesso somente-leitura vê e não grava, qualquer que seja o perfil. A recusa vale também por endereço direto, e o servidor recusa a gravação de quem não pode, independentemente da tela.
- **RN-009 — O teto é fotografado no item.** A análise grava no item a curva e o teto vigentes naquele momento. Alterar a parametrização não reescreve pedido já montado: o teto novo vale na próxima montagem da análise, e a trava de saída cobra sempre o teto gravado no item.
- **RN-010 — Desativação.** Exclusão é desativação: a parametrização sai da resolução e o histórico permanece. Regravar o mesmo alvo reativa com os valores enviados.

## Testes

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | parametrização do departamento 2 com A 35/20, B 45/10, C 60/5 → item de curva A recebe teto 42, o de curva B 49,5 e o de curva C 63 | regra de tela |
| C-002 | com departamento 2 em B 45/10 e produto 5001 em B 25/0, o item 5001 de curva B recebe teto 25 e a origem "produto" | regra de tela |
| C-003 | item sem curva, do departamento 2 (C 60/5) → teto 63 e curva usada "C" | regra de tela |
| C-004 | produto sem parametrização nenhuma → alvo 35, tolerância 0, teto 35, origem "padrão" | regra de tela |
| C-005 | seção 21 com A 10/0 e B/C zerados, departamento 2 com B 45/10 → item da seção 21 de curva B recebe 49,5 e origem "departamento" | regra de tela |
| C-006 | item de curva A gravado com cobertura 45 e teto 42, sem justificativa → a verificação de saída recusa com a frase "Justifique os itens com cobertura acima do limite (1), a começar por" e o nome do produto; gravada a justificativa, a mesma verificação libera com motivo vazio | regra de negócio |
| C-006b | item de **curva B** gravado com cobertura 49,2 e teto **49,5**, sem justificativa → a verificação de saída libera ("pode", motivo vazio). Teto truncado para 49 recusaria: é este o teste que pega a perda da fração | regra de negócio |
| C-007 | a resolução do teto devolve, junto, alvo 35 e tolerância 20 para o item de curva A — o alvo é 35, não 42 | regra de tela |
| C-008 | comparação de uma parametrização A 35/20, B 45/10, C 60/5 contra A 30/10, B 40/5, C 50/0 → seis linhas, ação "alterou", cada uma com campo, antes e depois; gravadas, o histórico devolve as seis | regra de tela + regra de negócio |
| C-009 | criação do produto 5004 com descrição e os três pares → sete linhas com valor anterior vazio e ação "criou" | regra de tela + regra de negócio |
| C-010 | desativar o produto 5001 → o histórico ganha 1 linha "desativou", a listagem filtrada por ativas deixa de trazê-lo (a filtrada por inativas traz, com a situação) e o item de curva B passa a resolver 49,5; regravar a partir da linha inativa lida da própria listagem → ação **derivada** "reativou" (nunca "criou") e teto 25 de volta | regra de negócio |
| C-011 | a gravação chamada como analista não altera nada (nem parametrização, nem histórico); chamada como gestor altera; a matriz de permissão dá a tela a admin e gestor e nega a analista, diretoria e comercial, inclusive com acesso somente-leitura no caso de gestor (vê, não grava) | regra de negócio + regra de tela |
| C-012 | as linhas do arquivo exportado para uma parametrização A 35/20, B 45/10, C 60/5 trazem 35; 20; 42; 45; 10; 49,5; 60; 5; 63 | regra de tela |
| C-013 | alvo 45 com tolerância 10 → "49,5"; alvo 45 com tolerância vazia → traço; alvo vazio → traço | regra de tela |
| C-014 | o histórico devolve as linhas da mais recente para a mais antiga e, filtrado por uma parametrização, só as dela; a contagem é apurada no próprio banco, nunca por número absoluto | regra de negócio |
| C-015 | item de curva B gravado com teto 49,5; alterada a parametrização para 30/0, a verificação de saída continua decidindo pelos 49,5 gravados | regra de negócio |
| RN-001 | (35, 20) → 42; (45, 10) → 49,5; (60, 5) → 63; (35, 0) → 35; (0, 20) → sem teto (a linha não vale) | regra de tela |
| RN-002 | com produto 20/0, seção 45/0, departamento 60/0 e fornecedor 90/0 na mesma curva → vale 20; sem a do produto → 45; só a do fornecedor → 90; nenhuma → 35 | regra de tela |
| RN-003 | curva vazia, curva inválida ("D") e curva ausente resolvem todas pela coluna C | regra de tela |
| RN-004 | a resolução devolve alvo e teto separados em todos os casos, inclusive no padrão (35 e 35) | regra de tela |
| RN-005 | as cinco exigências de saída continuam devolvendo as mesmas mensagens, na mesma ordem, com a parametrização por curva no lugar | regra de negócio |
| RN-006 | comparação de uma parametrização com ela mesma → zero linha; com um único número diferente → uma linha | regra de tela |
| RN-007 | inexistente → "criou"; ativa → inativa → "desativou"; inativa → ativa → "reativou"; valores diferentes com a mesma situação → "alterou" | regra de tela |
| RN-008 | gravação e desativação chamadas por analista, comercial e diretoria não alteram nada; por gestor e admin, alteram | regra de negócio |
| RN-009 | alterada a parametrização depois da análise, o item mantém curva e teto gravados; remontada a análise, o item recebe o teto novo | regra de tela + regra de negócio |
| RN-010 | desativada, a parametrização não aparece na listagem e não entra na resolução; regravada, volta com os valores enviados | regra de negócio |

- O que só olho humano verifica fica em **Verificação manual**:
  - [x] C-013 — as três curvas numa tabela (uma linha por curva: alvo, tolerância e o máximo sem justificativa), com nível e código lado a lado e as dicas uma vez só; legível nos dois temas *(revisado em 2026-10-30 a pedido do usuário: os três painéis lado a lado ficavam apertados na janela)*
  - [ ] C-010 — parametrização inativa sinalizada por texto, nunca só por cor, e nunca em vermelho
  - [ ] C-011 — formulário inteiro desabilitado (não escondido) para quem só lê, com o motivo visível
  - [ ] C-014 — a aba de histórico com muitas linhas rola sem empurrar o cabeçalho da página

## Fora de escopo

- [ ] **Segunda curva por rentabilidade e "a pior das duas"** — a curva é uma só, a do valor de venda que a montagem já calcula. A curva dupla do sistema antigo fica registrada como dívida da onda 5.
- [ ] **Nível "BU" separado da seção** — a seção já é o nível intermediário; o sistema antigo tinha os dois e desligou o BU.
- [ ] **Recalcular pedidos já montados** quando a parametrização muda — vale na próxima montagem (RN-009).
- [ ] **Parâmetros de compra por SKU e por fornecedor** (cobertura, lead time, gatilho, silenciamento) — são de outra tela, a das compras inteligentes.
- [ ] **Exportação em planilha de escritório e em PDF** — a exportação é o arquivo simples que as outras telas já usam.
- [ ] **Curva por filial** — a parametrização não tem dimensão de filial; o alvo é fornecedor, departamento, seção ou produto.
- [ ] **Justificativa com histórico próprio** — a justificativa do item continua como está na montagem do pedido.
- [ ] **Alerta ou aviso quando um limite muda** — o histórico é consultado, não notifica.

## Pendências

Cada item aqui **bloqueia** o `plan.md`.

- Nenhuma.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-005, C-010, C-011, C-015)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto
