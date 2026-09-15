# Spec: Fornecedores — cadastro do ERP e parametrização de compra

**ID:** 001-fornecedores · **Status:** em revisão · **Data:** 2026-09-15

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

Um pedido de compra só existe se o fornecedor estiver parametrizado: sem prazo
de entrega, pedido mínimo, janela de fechamento, contato de envio e faixa de
prazo de pagamento, a analista monta o pedido no escuro, negocia prazo sem
referência e o envio vira e-mail digitado na hora, para quem alguém lembrar.
Esse dado hoje mora no SGC anterior e **não migra**: o SGC 2 começa vazio. Ao
mesmo tempo, o cadastral (nome, CNPJ, filiais) já existe no ERP WinThor e
redigitá-lo é convite a divergência entre o que o sistema mostra e o que o ERP
fatura.

## Resultado esperado

Quem cuida de compras acha o fornecedor pelo cadastro do ERP, parametriza tudo
o que o pedido precisa em uma tela só, e depois consegue responder "quem mudou
o pedido mínimo deste fornecedor, quando e de quanto para quanto".

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| gestor de compras | parametrizar fornecedor novo, corrigir prazo, pedido mínimo, contatos e faixas de prazo | semanal |
| diretoria | mesma parametrização, principalmente prazo de pagamento e pedido mínimo | mensal |
| admin (TI) | destravar parametrização, corrigir CNPJ e documentos | eventual |
| analista (compradora) | consultar o que está parametrizado antes de montar o pedido | diária |

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa.

**C-001 — Parametrizar um fornecedor novo vindo do ERP**
- **Dado que** o fornecedor de código 1088 existe no cadastro do ERP e ainda não
  tem parametrização no SGC
- **Quando** o gestor escolhe esse fornecedor, informa CNPJ `49.324.221/0001-04`,
  prazo de entrega 7 dias úteis, pedido mínimo R$ 5.000,00, janela de fechamento
  do dia 7 ao 15, validade mínima 120 dias, marca as filiais 1 e 2, cria a linha
  "Nutrição Enteral" com o contato `captacao.pedidos@fresenius-kabi.com` e a faixa
  "qualquer valor" com a opção `30/60/90`, e salva
- **Então** o fornecedor 1088 passa a aparecer na lista com pedido mínimo
  R$ 5.000,00, 2 filiais e 1 linha, e o histórico registra a criação com o nome
  de quem salvou

**C-002 — Achar o fornecedor na lista**
- **Dado que** existem 3 fornecedores parametrizados: 1015 e 1042 ativos, 1088 inativo;
  1015 atende as filiais 1 e 2, 1042 atende 1, 2 e 3 e 1088 atende só a 1
- **Quando** a analista filtra pela filial 2
- **Então** a lista devolve 2 fornecedores (1015 e 1042) e diz "2 fornecedores";
  filtrando só por ativos, devolve 2 (1015 e 1042); sem filtro nenhum, 3

**C-003 — Analista consulta, não altera**
- **Dado que** a analista abre a parametrização do fornecedor 1015
- **Quando** ela tenta salvar uma alteração no pedido mínimo
- **Então** o sistema recusa dizendo que só admin, gestor e diretoria
  parametrizam fornecedor, o pedido mínimo continua R$ 5.000,00 e nada entra no
  histórico; o mesmo salvamento feito pelo gestor é aceito

**C-004 — Dado inválido não grava nada**
- **Dado que** o fornecedor 1015 está parametrizado com pedido mínimo R$ 5.000,00,
  2 filiais e 2 linhas
- **Quando** o gestor troca o pedido mínimo por R$ 0,00 e salva
- **Então** o sistema recusa com uma mensagem que cita "pedido mínimo", e o
  fornecedor continua com R$ 5.000,00, as 2 filiais e as 2 linhas intactas

**C-005 — Salvar vale pela parametrização inteira**
- **Dado que** o fornecedor 1015 tem as linhas "Nutrição Enteral" (2 contatos) e
  "Nutrição Parenteral" (1 contato e 4 faixas)
- **Quando** o gestor apaga a linha "Nutrição Parenteral" na tela e salva
- **Então** o fornecedor passa a ter 1 linha, 2 contatos e 1 faixa, e nenhum
  resto da linha apagada volta a aparecer ao reabrir a tela

**C-006 — Histórico campo a campo**
- **Dado que** o fornecedor 1015 tem pedido mínimo R$ 5.000,00 e validade mínima
  120 dias
- **Quando** a diretoria muda o pedido mínimo para R$ 8.000,00 e a validade
  mínima para 90 dias e salva
- **Então** o histórico ganha 2 linhas novas — uma por campo alterado, cada uma
  com o valor anterior, o novo, quem salvou e quando — e o campo que não mudou
  não gera linha

**C-007 — Documento do fornecedor**
- **Dado que** o gestor está na parametrização do fornecedor 1015
- **Quando** ele envia o arquivo "Contrato comercial 2026", marca o tipo
  "Documento" e o vencimento 31/03/2027, e salva
- **Então** o documento passa a constar com nome, tipo, vencimento e o endereço
  do arquivo enviado, e a tela avisa, antes do envio, que o arquivo fica em um
  endereço público

**C-008 — O cadastro vem do ERP**
- **Dado que** o ERP tem fornecedores e filiais cadastrados
- **Quando** o gestor abre o seletor para parametrizar um fornecedor novo
- **Então** a lista de fornecedores do ERP vem com pelo menos 1 registro, a de
  filiais também, o fornecedor genérico 999999 e a filial 99 não aparecem, e o
  fornecedor já parametrizado abre a parametrização existente em vez de começar
  do zero

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE listar os fornecedores parametrizados, de 20 em 20, com busca por nome, CNPJ ou código | busca por "fresenius" com 3 fornecedores cadastrados devolve só o 1015; a contagem exibida é a do filtro, não a da página | must |
| RF-002 | O sistema DEVE filtrar a lista por filial atendida e por situação (ativo/inativo), mostrando o filtro ativo e permitindo limpá-lo | filtro filial 2 → 2 de 3; filtro "ativos" → 2 de 3; limpar → 3 | must |
| RF-003 | A lista DEVE mostrar, por fornecedor: código, nome, CNPJ, prazo de entrega, pedido mínimo, quantidade de filiais, quantidade de linhas, situação e a data da última alteração | linha do 1015 mostra "7 dias úteis", "R$ 5.000,00", "2 filiais", "2 linhas" | must |
| RF-004 | O sistema DEVE deixar escolher um fornecedor do cadastro do ERP para parametrizar, com busca por nome ou código | escolher o 1088 abre a parametrização em branco; escolher o 1015, já parametrizado, abre o que está gravado | must |
| RF-005 | O sistema DEVE guardar, por fornecedor: CNPJ, prazo de entrega em dias e o tipo (úteis ou corridos), pedido mínimo, janela de fechamento (dia inicial e final), link da plataforma de pedidos, validade mínima em dias, prazo de SLA de análise e de faturamento em dias úteis | reabrir a tela após salvar mostra os 8 valores exatamente como foram digitados | must |
| RF-006 | O sistema DEVE guardar as filiais que o fornecedor atende, escolhidas entre as filiais do ERP | marcar as filiais 1 e 2 e salvar → a lista mostra "2 filiais" e o filtro por filial 2 acha o fornecedor | must |
| RF-007 | O sistema DEVE guardar linhas de produto por fornecedor, cada uma com nome | linha sem nome é recusada com mensagem que cita "linha" | must |
| RF-008 | O sistema DEVE guardar, por linha, os contatos que recebem o pedido (nome e e-mail) | contato com e-mail `elaine@` é recusado citando o nome da linha; com `elaine.santos@fresenius-kabi.com` é aceito | must |
| RF-009 | O sistema DEVE guardar, por linha, faixas de valor do pedido (de / até) e, em cada faixa, uma ou mais opções de prazo de pagamento com rótulo e parcelas em dias no formato `30/60/90` | faixa R$ 45.000,00 sem teto com as opções "Opção A" `30/45/60` e "Opção B" `30/60` reabre com as duas | must |
| RF-010 | O sistema DEVE deixar enviar documentos do fornecedor pela própria tela, guardando nome, tipo (Documento ou Modelo de envio de pedido), endereço do arquivo e vencimento | documento enviado aparece na lista com o vencimento 31/03/2027 e abre pelo endereço guardado | must |
| RF-011 | Salvar DEVE substituir a parametrização inteira do fornecedor (parâmetros, filiais, linhas, contatos, faixas e documentos); dado recusado não grava nada | C-005 e C-004 | must |
| RF-012 | O sistema DEVE mostrar o histórico de alterações campo a campo, do mais recente para o mais antigo, com campo, valor anterior, valor novo, quem e quando (últimas 20 alterações) | após C-006, as duas primeiras linhas do histórico são "Pedido mínimo 5000,00 → 8000,00" e "Validade mínima 120 dias → 90 dias" | must |
| RF-013 | Só admin, gestor e diretoria DEVEM conseguir salvar; a analista vê a parametrização em modo leitura, e a recusa acontece também no servidor | C-003, com a recusa reproduzida quando a chamada não passa pela tela | must |
| RF-014 | O sistema DEVE informar qual faixa e quais opções de prazo valem para um valor de pedido | pedido de R$ 20.000,00 na linha "Nutrição Parenteral" cai na faixa 20.000–45.000 e devolve a opção `30/45`; R$ 50.000,00 devolve `30/45/60` e `30/60` | must |
| RF-015 | Prazo de SLA não preenchido DEVE ser exibido como o padrão do sistema: 1 dia útil para análise e 5 para faturamento | campo vazio mostra "padrão do sistema (1 dia útil)" e "padrão do sistema (5 dias úteis)" | should |
| RF-016 | Toda recusa DEVE citar o campo ou a linha que a causou | "Pedido mínimo deve ser maior que zero."; "E-mail inválido no contato da linha Nutrição Enteral." | must |

> `must` = sem isso a feature não entrega valor. `should` = entra se couber.
> `could` = registrado, não prometido.

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | A lista responde em até 2 s com 2.000 fornecedores parametrizados | cronômetro, base de teste com 2.000 registros, página de 20 |
| RNF-002 | Abrir a parametrização de um fornecedor com 5 linhas, 20 contatos, 30 faixas e 10 documentos custa **uma** ida ao servidor | contador de chamadas na tela aberta |
| RNF-003 | Salvar um fornecedor desse tamanho cabe no orçamento de 300 execuções por minuto do projeto | contagem de execuções por salvamento ≤ 40 |
| RNF-004 | O seletor de fornecedores do ERP abre em até 3 s e filtra enquanto se digita, sem nova ida ao servidor | cronômetro com o cadastro cheio do ERP |
| RNF-005 | As duas telas funcionam nos temas claro e escuro e a partir de 400 px de largura, sem rolagem horizontal | verificação manual nos dois temas |

## Entidades do domínio

- **Fornecedor** — a indústria que vende para a Benenutri. Existe no ERP; o SGC
  só acrescenta a parametrização de compra, presa ao código do fornecedor no ERP.
- **Filial atendida** — filial da Benenutri que aquele fornecedor atende.
  Um fornecedor atende zero ou mais filiais, escolhidas entre as filiais do ERP.
- **Linha de produto** — recorte do catálogo do fornecedor ("Nutrição Enteral",
  "Sondas"). Cada linha tem os seus contatos e as suas faixas de prazo, porque na
  prática cada linha é negociada com gente diferente.
- **Contato de envio** — nome e e-mail que recebem o pedido daquela linha. Só
  contato cadastrado recebe pedido (EN-02 A).
- **Faixa de prazo** — intervalo de valor do pedido e, dentro dele, as opções de
  prazo de pagamento acordadas (rótulo + parcelas em dias). É o "prazo padrão"
  que a montagem do pedido compara com o prazo negociado.
- **Documento** — arquivo do fornecedor (contrato, tabela, modelo de pedido) com
  tipo, endereço e vencimento.
- **Alteração** — uma linha de histórico por campo alterado em um salvamento:
  campo, valor anterior, valor novo, quem e quando.

## Regras de negócio

- **RN-001** — O fornecedor do SGC é sempre um fornecedor do ERP: a identidade é
  o código do fornecedor no ERP, e o nome cadastral vem de lá, não é digitado
  (FO-01).
- **RN-002** — CNPJ tem 14 dígitos e dígitos verificadores válidos; qualquer
  outra coisa é recusada (FO-02).
- **RN-003** — Pedido mínimo é maior que zero (FO-02).
- **RN-004** — A janela de fechamento usa dois dias entre 1 e 31 (FO-02).
  `[NEEDS CLARIFICATION: a janela pode virar o mês (ex.: do dia 28 ao 5)? Se não puder, o dia inicial nunca é maior que o final e a regra ganha essa checagem.]`
- **RN-005** — Prazo de SLA não preenchido vale o padrão do sistema: 1 dia útil
  para a análise e 5 dias úteis para o faturamento (FO-02).
- **RN-006** — O prazo de entrega é um número de dias mais o tipo de contagem,
  úteis ou corridos, e sempre aparece com o tipo junto ("7 dias úteis") (FO-02).
- **RN-007** — Contato de envio precisa de nome e de e-mail válido; o pedido só
  vai para contato cadastrado na linha, nunca para endereço digitado na hora
  (FO-04, EN-02 A).
- **RN-008** — As faixas de valor de uma mesma linha não se sobrepõem; no máximo
  uma faixa fica sem teto, e ela é a última (FO-04).
- **RN-009** — Uma opção de prazo é uma sequência de parcelas em dias, todas
  maiores que zero, escrita como `30/60/90` — o mesmo formato que a comparação de
  prazo do pedido lê (FO-04, PZ-02).
- **RN-010** — A faixa que vale para um pedido é a que contém o valor total do
  pedido: o limite inferior conta (R$ 20.000,00 entra na faixa que começa em
  20.000) e o superior não (R$ 20.000,00 não entra na faixa que termina em
  20.000). A faixa sem teto pega todo valor acima do seu início (FO-04, PZ-01).
- **RN-011** — Documento tem tipo "Documento" ou "Modelo de envio de pedido",
  nome, endereço do arquivo e vencimento opcional; o arquivo enviado fica em
  endereço público e a tela avisa isso antes do envio (FO-05, UI-06).
- **RN-012** — Parametrizam admin, gestor e diretoria; a analista só consulta.
  A decisão é conferida no servidor, não só na tela (FO-07, P-12).

## Testes

**Obrigatório.** Todo sistema e toda feature nascem com testes automatizados:
cenário sem teste é cenário não entregue, e uma spec sem esta seção
preenchida não é aprovada. Aqui se decide **o quê** precisa de evidência
automática e com que números; **como** (arquivo, ferramenta) é do `plan.md`.

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 · RN-001 | Salvar a parametrização do fornecedor 1088 (CNPJ 49324221000104, prazo 7 úteis, mínimo 5000,00, fechamento 7–15, validade 120, filiais 1 e 2, 1 linha com 1 contato e 1 faixa `30/60/90`) devolve sucesso; ler de volta pelo código 1088 traz pedido mínimo 5000,00, 2 filiais, 1 linha, 1 contato, 1 faixa e 1 linha de histórico | regra de negócio |
| C-002 | Com 3 fornecedores (1015 e 1042 ativos, 1088 inativo): sem filtro a lista devolve 3 e o total 3; filtrando filial `2` devolve 2 e total 2; filtrando situação "ativo" devolve 2; busca "fresenius" devolve 1 | regra de negócio |
| C-003 · RN-012 | O mesmo salvamento feito pela analista devolve recusa com mensagem que cita "gestor" e não altera o pedido mínimo (continua 5000,00) nem cria linha de histórico; feito pelo gestor devolve sucesso | regra de negócio |
| C-004 · RN-003 | Salvar o fornecedor 1015 com pedido mínimo 0 devolve recusa com mensagem que casa com /pedido mínimo/i; depois da tentativa o fornecedor continua com 5000,00, 2 filiais e 2 linhas | regra de negócio |
| C-005 | Salvar o 1015 sem a linha "Nutrição Parenteral" deixa 1 linha, 2 contatos e 1 faixa; nenhuma das 4 faixas nem o contato da linha apagada sobrevivem | regra de negócio |
| C-006 | Mudar pedido mínimo 5000,00 → 8000,00 e validade 120 → 90 grava exatamente 2 linhas de histórico, com os valores anterior e novo de cada campo e o id de quem salvou; um segundo salvamento sem mudança não acrescenta linha de campo | regra de negócio |
| C-007 · RN-011 | Salvar com um documento (nome "Contrato comercial 2026", tipo "Documento", vencimento 2027-03-31, endereço não vazio) devolve 1 documento na releitura, com os quatro valores; tipo fora dos dois aceitos é normalizado para "Documento" | regra de negócio |
| C-008 | A consulta de fornecedores do ERP devolve mais de 0 registros e não traz o código 999999; a de filiais devolve mais de 0 e não traz a filial 99; buscar "nestle" devolve 1 | regra de negócio |
| RN-002 · RN-004 · RN-005 · RN-006 | CNPJ `49324221000104` é válido, `49324221000105` e `4932422100010` não; fechamento 7 e 15 é válido, 0 e 32 não; SLA vazio devolve 1 e 5 com origem "padrão"; SLA 3 devolve 3 com origem "parametrizado"; prazo 7 + `uteis` vira "7 dias úteis" e 1 + `corridos` vira "1 dia corrido" | regra de tela |
| RN-007 · RN-008 · RN-009 · RN-010 | `elaine@` é recusado e `elaine.santos@fresenius-kabi.com` aceito; as faixas 0–20000 e 20000–45000 passam, 0–20000 e 10000–30000 são recusadas com o motivo, duas faixas sem teto são recusadas; `30/60/90` vira [30,60,90], `0/30` e `trinta` são recusados; valor 20000 cai na faixa 20000–45000 (`30/45`), valor 50000 devolve as 2 opções da faixa sem teto e valor 19999,99 cai na faixa 0–20000 | regra de tela |

- Cada cenário C-00N e cada regra RN-00N tem pelo menos uma linha.
- Toda linha tem entrada e resultado concretos; "executa sem erro" não é evidência.
- **Camada** diz onde a regra mora: *regra de negócio* (o que o sistema grava
  e devolve) ou *regra de tela* (cálculo, formatação, máscara que a pessoa vê).
- O que só olho humano verifica (layout, tema, navegação) fica em
  **Verificação manual**, listado aqui:
  - [ ] C-002 — lista, busca, filtros e paginação nos temas claro e escuro, e a 400 px de largura
  - [ ] C-007 — o aviso de endereço público aparece antes do envio do arquivo
  - [ ] C-003 — a analista vê a tela inteira em modo leitura, sem botão de salvar habilitado
  - [ ] C-001 — o diálogo de linha de produto (contatos e faixas) abre, rola só no miolo e cabe no celular

## Fora de escopo

Obrigatório. O que não estiver listado como incluído está excluído.

- [ ] **Migrar a parametrização do SGC anterior** — o SGC 2 começa vazio, por decisão do 000.
- [ ] **Escrever no ERP** — o SGC só lê o cadastro de fornecedores e filiais.
- [ ] **Cadastrar fornecedor novo** — fornecedor nasce no ERP; aqui só se parametriza o que já existe.
- [ ] **Enviar o pedido ao fornecedor** — a fase de envio é da spec 002; aqui só se cadastram os contatos e o link que ela usa.
- [ ] **Comparar prazo acordado × prazo padrão no pedido** — é da montagem do pedido (spec 003, PZ-01 a PZ-04); aqui só se cadastram as faixas e se responde qual vale para um valor.
- [ ] **Cobertura futura, curva ABC e ponto de pedido por fornecedor** — ondas 3 e 4.
- [ ] **Recebimento médio do fornecedor** (calculado do histórico do ERP) — onda 3.
- [ ] **Parametrização por produto/SKU** — onda 4.
- [ ] **Lembrete ou bloqueio por documento vencido** — o vencimento é guardado e exibido; nenhuma rotina age sobre ele.
- [ ] **Indicadores de SLA de análise e faturamento** — os prazos são parametrizados aqui e consumidos pelos indicadores da onda 3.
- [ ] **Anexar documento a um pedido específico** — anexo de pedido é do card (spec 002).

## Pendências

Cada item aqui **bloqueia** o `plan.md`.

- [ ] `[NEEDS CLARIFICATION: a persona "leitura" do 000 é a mesma "comercial" das regras P-01/P-03? Se for, ela não vê o módulo Fornecedores (P-03); se não for, ela vê as duas telas em modo leitura. Enquanto não decidir, a spec só afirma o que FO-07 decide: admin, gestor e diretoria salvam; analista consulta.]`
- [ ] `[NEEDS CLARIFICATION: o que "fornecedor inativo" impede fora desta tela? Ele deixa de ser oferecido na criação de pedido (spec 002) e no agendamento (spec 004), ou a situação é só um filtro de organização da lista?]`
- [ ] `[NEEDS CLARIFICATION: a janela de fechamento pode virar o mês (do dia 28 ao 5)? Ver RN-004.]`
- [ ] `[NEEDS CLARIFICATION: documento vencido precisa de algum sinal na tela (marca na lista, aviso ao abrir o fornecedor) ou basta a data cadastrada? FO-05 só define o campo.]`

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-003, C-004)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [ ] Zero `[NEEDS CLARIFICATION]` em aberto — 4 pendências abertas, nenhuma bloqueia o modelo de dados nem os contratos
