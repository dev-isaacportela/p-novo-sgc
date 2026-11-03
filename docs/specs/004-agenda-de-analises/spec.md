# Spec: Agenda de análises

**ID:** 004-agenda-de-analises · **Status:** rascunho · **Data:** 2026-09-15

> Escrito para quem usa e para quem paga. **Proibido** citar stack, tabela,
> endpoint, componente ou biblioteca. Isso é assunto do `plan.md`.

## Problema

A compra de cada fornecedor tem uma data certa para ser analisada — janela de
fechamento, prazo de entrega, periodicidade combinada com a indústria. Hoje esse
calendário existe, mas quem compra precisa lembrar de abrir o pedido no dia: se
ninguém abrir, a análise atrasa e a compra sai fora da janela. Também não há
lugar único que mostre o que está previsto, o que já virou pedido e o que
venceu sem ninguém tocar — a gestão descobre o atraso quando o fornecedor
cobra.

## Resultado esperado

Quem compra agenda a análise uma vez (com recorrência, quando ela se repete) e
o pedido aparece sozinho na fase de Análise no dia marcado, em nome de quem
agendou. A tela da agenda mostra, em uma lista só, o que está previsto, o que
está atrasado, o que já virou pedido e o que foi cancelado.

## Usuários

| Perfil | O que precisa fazer | Frequência |
|---|---|---|
| analista (comprador) | agendar a análise de um fornecedor numa filial, definir período e recorrência, acompanhar atrasos, disparar o processamento de um recorte | diária |
| gestor (gerência de compras) | o mesmo que o analista, e cancelar agendamento que não vai acontecer | semanal |
| diretoria | ver a previsão da semana e do mês, cancelar agendamento | semanal |
| admin (TI) | tudo o que o analista faz, e destravar um processamento que falhou | eventual |
| comercial | não usa esta tela: a agenda não aparece no menu dele, e uma ação disparada em nome dele é recusada | — |

## Cenários

Formato Given/When/Then — cada cenário é verificável por uma pessoa.

**C-001 — Agendar uma análise com o período padrão**
- **Dado que** a analista escolheu o fornecedor Fresenius Kabi, a filial Benenutri Matriz e a data de análise 20/10/2026
- **Quando** ela deixa o período de vendas no padrão de 45 dias e salva
- **Então** o agendamento é gravado com período de 05/09/2026 a 20/10/2026, sem recorrência, e aparece na lista como **pendente**

**C-002 — Período de vendas invertido**
- **Dado que** a analista informou período de 20/10/2026 a 05/09/2026 (fim antes do início)
- **Quando** ela tenta salvar
- **Então** o sistema recusa, nada é gravado e a mensagem cita "período"

**C-003 — Data-limite da recorrência antes da análise**
- **Dado que** a analista marcou recorrência semanal para 20/10/2026 com data-limite 10/10/2026
- **Quando** ela tenta salvar
- **Então** o sistema recusa, nada é gravado e a mensagem cita "data-limite"

**C-004 — Recorrência mensal em dia que não existe no mês seguinte**
- **Dado que** existe um agendamento mensal para 31/01/2026
- **Quando** ele é processado
- **Então** a próxima ocorrência fica em 28/02/2026 (último dia do mês, porque 31/02 não existe) e, quando esta for processada, a seguinte fica em 28/03/2026

**C-005 — Recorrência quinzenal chega à data-limite**
- **Dado que** existe um agendamento quinzenal para 05/10/2026 com data-limite 25/10/2026
- **Quando** ele é processado
- **Então** a próxima ocorrência é criada em 19/10/2026; e quando a de 19/10/2026 for processada, nenhuma nova é criada, porque 02/11/2026 passa da data-limite

**C-006 — O sistema processa sozinho o que venceu**
- **Dado que**, em 15/09/2026, existem três agendamentos pendentes: 14/09 (semanal), 15/09 (quinzenal) e 20/09 (sem recorrência)
- **Quando** a verificação automática roda
- **Então** dois pedidos são criados na fase Análise (um para cada vencido), os dois agendamentos ficam **processados** com o pedido gerado, duas próximas ocorrências nascem (21/09 e 29/09) e o agendamento de 20/09 continua pendente e sem pedido

**C-007 — Rodar de novo não duplica**
- **Dado que** a verificação automática de C-006 já rodou
- **Quando** ela roda de novo no mesmo dia
- **Então** nenhum pedido novo é criado, nenhuma ocorrência nova é criada e o resultado informa 0 processados

**C-008 — Processar um agendamento específico, mesmo futuro**
- **Dado que** a analista abre o processamento manual em 15/09/2026 e escolhe o recorte "um agendamento", apontando o de 20/09/2026
- **Quando** ela confirma
- **Então** só aquele agendamento é processado (1 pedido criado) e os demais ficam como estavam

**C-009 — Processar um intervalo de datas**
- **Dado que** existem agendamentos pendentes em 14/09, 15/09 e 20/09/2026
- **Quando** a analista processa o intervalo de 14/09/2026 a 16/09/2026
- **Então** 2 pedidos são criados e o de 20/09 continua pendente

**C-010 — Processar o mês vigente**
- **Dado que** existem agendamentos pendentes em 14/09, 20/09 e 03/10/2026, e hoje é 15/09/2026
- **Quando** a analista processa sem escolher recorte (o padrão é o mês vigente)
- **Então** 2 pedidos são criados (14/09 e 20/09) e o de outubro continua pendente

**C-011 — Processar os próximos dias**
- **Dado que** hoje é 15/09/2026 e existem agendamentos pendentes em 14/09, 16/09 e 30/09/2026
- **Quando** a analista processa o recorte "próximos 7 dias"
- **Então** 1 pedido é criado (16/09); o de 14/09 está fora do recorte por ser anterior a hoje e o de 30/09 por ser posterior ao sétimo dia

**C-012 — Quem não pode processar**
- **Dado que** quem chama tem perfil comercial, que nem enxerga a agenda no menu
- **Quando** o processamento manual é disparado em nome dele, por fora da tela
- **Então** o sistema recusa com mensagem de permissão e nenhum pedido é criado

**C-013 — Cancelar um agendamento**
- **Dado que** o gestor abriu um agendamento pendente de 20/09/2026
- **Quando** ele cancela
- **Então** o agendamento passa a **cancelado**, continua na lista com essa situação (o registro não some) e a verificação automática deixa de processá-lo

**C-014 — Cancelar sem permissão**
- **Dado que** quem está na tela é a analista que criou o agendamento
- **Quando** ela tenta cancelar
- **Então** o sistema recusa: cancelar é da gerência, da diretoria ou do admin, e o agendamento continua pendente

**C-021 — Fornecedor inativo não entra em agendamento novo**
- **Dado que** o fornecedor Danone foi inativado no cadastro e já tem um agendamento para 20/09/2026
- **Quando** a analista abre a escolha de fornecedor para agendar
- **Então** Danone não aparece entre as opções e um agendamento novo para ele é recusado; o agendamento de 20/09/2026 que já existia continua na lista, continua sendo processado e continua editável nos demais campos

**C-015 — Agendamento atrasado**
- **Dado que** existe um agendamento de 14/09/2026 ainda sem pedido gerado e hoje é 15/09/2026
- **Quando** alguém abre a agenda
- **Então** ele aparece como **atrasado**, e o filtro de situação "atrasado" devolve esse registro

**C-016 — O envio do pedido acerta a agenda**
- **Dado que** o pedido gerado pelo agendamento de 20/10/2026 foi enviado à indústria em 22/10/2026
- **Quando** o envio é registrado
- **Então** a agenda passa a mostrar 22/10/2026 como data do envio e guarda 20/10/2026 como a data planejada original; um segundo envio registrado não sobrescreve a planejada original

**C-017 — Participantes da análise**
- **Dado que** a analista gravou o agendamento com três participantes
- **Quando** ela reabre, deixa dois e salva
- **Então** a agenda passa a listar exatamente esses dois, e a próxima ocorrência criada pela recorrência nasce com os mesmos dois

**C-018 — Lista filtrada e paginada**
- **Dado que** existem 6 agendamentos: 2 atrasados, 1 pendente, 1 processado, 1 cancelado e 1 futuro
- **Quando** alguém filtra pela situação "atrasado"
- **Então** a lista devolve 2 registros e a contagem total mostra 2

**C-019 — O pedido nasce em nome de quem agendou**
- **Dado que** o agendamento foi criado pela analista Ana
- **Quando** a verificação automática gera o pedido
- **Então** o pedido consta como criado por Ana, com Ana como responsável inicial, com o título "FILIAL · FORNECEDOR", marcado como vindo da agenda, e o registro de entrada na fase Análise consta como feito pelo sistema, não por uma pessoa

**C-020 — Falha em um agendamento não derruba os outros**
- **Dado que** três agendamentos vencidos serão processados e o segundo foi criado por uma pessoa que não existe mais no sistema
- **Quando** a verificação automática roda
- **Então** o primeiro e o terceiro geram pedido, o segundo continua pendente (sem pedido e sem marcação) e o resultado informa 2 processados e 1 erro

**C-022 — Visão de calendário** *(2026-10-30, R-121)*
- **Dado que** a agenda tem um agendamento sem recorrência em 05/11 e um semanal que começou em 29/10
- **Quando** a pessoa alterna a agenda para "Calendário" e abre novembro
- **Então** vê a grade do mês com o agendamento de 05/11 e as quatro ocorrências do semanal (5, 12, 19 e 26), estas marcadas como recorrência; a situação aparece com ponto e texto, como na lista; clicar num agendamento pendente ou atrasado abre a edição; as setas mudam o mês e "Hoje" volta ao mês atual

## Requisitos funcionais

| ID | Requisito | Critério de aceite | Prioridade |
|---|---|---|---|
| RF-001 | O sistema DEVE permitir agendar a análise de um fornecedor numa filial, com data da análise e período de vendas | Agendamento gravado com fornecedor, filial, data e período; os quatro são obrigatórios (C-001) | must |
| RF-002 | O período de vendas DEVE vir preenchido com o padrão de 45 dias terminando na data da análise, e ser editável | Data 20/10/2026 sugere 05/09/2026 a 20/10/2026; alterar para outro intervalo válido é aceito (C-001) | must |
| RF-003 | O sistema DEVE recusar período invertido e data-limite anterior à data da análise, dizendo qual campo está errado | Mensagem cita "período" (C-002) ou "data-limite" (C-003); nada é gravado | must |
| RF-004 | O sistema DEVE aceitar recorrência nenhuma, semanal, quinzenal ou mensal, com data-limite opcional | Semanal +7 dias, quinzenal +14, mensal mesmo dia do mês seguinte (C-004, C-005) | must |
| RF-005 | O sistema DEVE registrar participantes da análise, escolhidos entre as pessoas do sistema | A lista salva é exatamente a que ficou na tela, sem sobra da edição anterior (C-017) | must |
| RF-006 | O sistema DEVE verificar sozinho, a cada 30 minutos, os agendamentos vencidos e não processados e gerar o pedido de cada um na fase Análise | Dois vencidos e um futuro em 15/09 geram 2 pedidos (C-006) | must |
| RF-007 | O pedido gerado DEVE nascer em nome de quem agendou, com o título "FILIAL · FORNECEDOR", com fornecedor, filial e período do agendamento, e marcado como originado da agenda | Pedido de Ana consta criado por Ana, responsável Ana, origem agenda, entrada na fase registrada como feita pelo sistema (C-019) | must |
| RF-008 | Depois de gerar o pedido, o sistema DEVE marcar o agendamento como processado, guardando quando e qual pedido | A situação vira "processado" e o número do pedido gerado aparece na lista (C-006) | must |
| RF-009 | Havendo recorrência dentro da data-limite, o sistema DEVE criar a próxima ocorrência ao processar a atual, com o período recalculado para a nova data e os mesmos participantes | 05/10 quinzenal com limite 25/10 gera 19/10; a de 19/10 não gera nova (C-005, C-017) | must |
| RF-010 | Processar duas vezes NÃO DEVE gerar dois pedidos para o mesmo agendamento | Segunda rodada informa 0 processados (C-007) | must |
| RF-011 | O sistema DEVE permitir disparar o processamento manualmente por um dos quatro recortes: mês vigente, intervalo de datas, próximos N dias ou um agendamento | Cada recorte processa só o que cai nele (C-008 a C-011) | must |
| RF-012 | O processamento manual NUNCA DEVE rodar sobre a base inteira sem recorte | Sem escolha, o padrão é o mês vigente; intervalo invertido é recusado (C-010) | must |
| RF-013 | O sistema DEVE permitir cancelar um agendamento ainda não processado, preservando o registro | Situação vira "cancelado", o registro continua na lista e deixa de ser processado (C-013) | must |
| RF-014 | O sistema DEVE mostrar a situação de cada agendamento entre pendente, atrasado, processado e cancelado | Agendamento de ontem sem pedido aparece como atrasado (C-015) | must |
| RF-015 | A tela DEVE listar os agendamentos com paginação e filtros por fornecedor, filial, período e situação | Filtro "atrasado" sobre 6 registros devolve 2 e total 2 (C-018) | must |
| RF-016 | Quando o pedido gerado é enviado à indústria, a agenda DEVE passar a mostrar a data real do envio e guardar a data planejada original quando as duas diferirem | Envio em 22/10 de análise planejada para 20/10: agenda mostra 22/10 e guarda 20/10; segundo envio não sobrescreve a planejada (C-016) | must |
| RF-017 | Criar, editar e processar manualmente DEVE ser de admin, analista e gestor; cancelar DEVE ser de admin, gestor e diretoria; quem não tem a agenda no perfil não opera | Analista é recusada ao cancelar (C-014); comercial é recusado ao processar (C-012) | must |
| RF-018 | A data da análise, o período e a data-limite DEVEM ser informados por um seletor de data do próprio sistema, operável por teclado | Digitar 20/10/2026 no campo e escolher no calendário levam ao mesmo valor; todo o fluxo funciona sem mouse | must |
| RF-019 | O resultado do processamento DEVE dizer quantos agendamentos foram processados e quais falharam | Três vencidos com um defeituoso informam 2 processados e 1 erro (C-020) | should |
| RF-020 | Fornecedor inativo NÃO DEVE ser oferecido ao agendar, e agendamento novo para ele é recusado; o que já estava agendado segue valendo | Com um dos três fornecedores inativado, a escolha mostra 2; agendamento novo para o inativo é recusado e o antigo continua sendo processado (C-021) | must |

> `must` = sem isso a feature não entrega valor. `should` = entra se couber.
> `could` = registrado, não prometido.

## Requisitos não-funcionais

| ID | Requisito | Como se mede |
|---|---|---|
| RNF-001 | Processar um agendamento custa no máximo 5 operações de gravação: 3 no caso simples, 4 com recorrência, 5 com recorrência e participantes | Contador de chamadas ao servidor no teste automatizado do processamento |
| RNF-002 | Uma rodada automática processa no máximo 30 agendamentos; o que sobra fica para a rodada seguinte (30 minutos depois) | Com 40 vencidos, a primeira rodada processa 30 e a segunda 10 |
| RNF-003 | O processamento é idempotente: repetir a rodada não cria pedido, ocorrência nem marcação nova | Rodar duas vezes seguidas e comparar a contagem de pedidos (C-007) |
| RNF-004 | Falha em um agendamento não interrompe os demais da mesma rodada | C-020 |
| RNF-005 | A listagem responde em até 2 s com 5.000 agendamentos, paginada de 50 em 50 | Cronômetro sobre volume de teste |
| RNF-006 | O dia usado para decidir o que venceu é o dia no horário de Brasília, não o dia do relógio universal | Agendamento de hoje não é tratado como vencido às 22h de ontem em Brasília (00:00 UTC) |

## Entidades do domínio

Conceitos do negócio e como se relacionam — **sem** schema, tipo ou tabela.

- **Agendamento de análise** — o compromisso de analisar a compra de um fornecedor para uma filial numa data, com o período de vendas que a análise vai olhar. Pode se repetir (recorrência) até uma data-limite. Nasce pendente, fica atrasado se a data passa sem processamento, vira processado quando gera o pedido, ou cancelado quando alguém o encerra antes.
- **Participante** — pessoa do sistema convidada a acompanhar aquela análise. É um registro de quem participa: a agenda não envia convite nem marca ninguém como responsável pelo pedido.
- **Ocorrência seguinte** — agendamento novo criado pela recorrência ao processar o atual; herda fornecedor, filial, recorrência, data-limite e participantes, com a data avançada e o período recalculado.
- **Pedido gerado** — o pedido de compra que nasce do agendamento na fase Análise. Relaciona-se com o agendamento por origem: o pedido sabe de qual agendamento veio e o agendamento sabe qual pedido gerou.
- **Recorte de processamento** — a fatia que o processamento manual aceita: mês vigente, intervalo de datas, próximos N dias ou um agendamento.

## Regras de negócio

- **RN-001** — Recorrência mensal é o **mesmo dia do mês seguinte**; quando o dia não existe no mês de destino, vale o último dia dele (31/01/2026 → 28/02/2026). A contagem seguinte parte do dia gravado, não do dia original (28/02/2026 → 28/03/2026).
- **RN-002** — Recorrência semanal avança 7 dias; quinzenal, 14.
- **RN-003** — A recorrência para na data-limite: ocorrência posterior a ela não é criada. Sem data-limite, a recorrência não tem fim.
- **RN-004** — Cancelar é marcar, nunca apagar: o agendamento cancelado continua consultável e deixa de ser processado. Agendamento já processado não se cancela.
- **RN-005** — A situação é derivada, nesta ordem: cancelado; senão processado (já gerou pedido); senão atrasado (data da análise anterior a hoje); senão pendente.
- **RN-006** — O período de vendas exige início menor ou igual ao fim. O padrão, quando ninguém mexe, é 45 dias terminando na data da análise.
- **RN-007** — Um agendamento gera no máximo um pedido. Agendamento que já tem pedido não é processado de novo, mesmo que a marcação de processado tenha falhado.
- **RN-008** — A ocorrência seguinte recalcula o período mantendo a duração do anterior: o fim passa a ser a nova data da análise e o início recua a mesma quantidade de dias.
- **RN-009** — O pedido gerado nasce em nome de quem criou o agendamento, que é também o responsável inicial; a entrada na fase Análise fica registrada como feita pelo sistema.
- **RN-010** — A lista de participantes é regravada inteira a cada gravação (limpa e reinsere), nunca parcialmente.
- **RN-011** — Criar, editar e processar manualmente é de admin, analista e gestor (a gerência monta pedido, então também agenda); cancelar é de admin, gestor e diretoria; comercial não opera a agenda e quem tem acesso só de leitura não opera nada. A regra vale também quando a ação chega por fora da tela.
- **RN-012** — O envio do pedido à indústria atualiza o agendamento que o gerou: grava a data real do envio e, quando ela difere da data planejada, guarda a planejada original (uma vez só) e a data da análise passa a ser a real.
- **RN-013** — O dia que decide vencimento no processamento automático é o dia no horário de Brasília; a tela mostra a situação pelo dia de quem está olhando. Na virada do dia, para quem estiver em outro fuso, as duas leituras podem divergir por no máximo uma rodada (30 minutos) — e nunca no que é gravado.
- **RN-014** — O processamento manual opera sobre a data do agendamento dentro do recorte, inclusive datas futuras; a verificação automática opera só sobre o que venceu.
- **RN-015** — Fornecedor inativo não entra em agendamento novo. O que já estava agendado segue: continua na lista, é processado e pode ser editado nos demais campos, e a recorrência dele continua criando as próximas ocorrências — inativar fornecedor não mexe na agenda já gravada.

## Testes

**Obrigatório.** Todo sistema e toda feature nascem com testes automatizados:
cenário sem teste é cenário não entregue, e uma spec sem esta seção
preenchida não é aprovada. Aqui se decide **o quê** precisa de evidência
automática e com que números; **como** (arquivo, ferramenta) é do `plan.md`.

| Cenário / regra | Evidência automática exigida | Camada |
|---|---|---|
| C-001 | Agendamento de 20/10/2026 gravado com período 05/09/2026–20/10/2026 e situação pendente; a lista devolve 1 | regra de negócio |
| C-002 | Salvar com 20/10/2026 a 05/09/2026 devolve recusa e a mensagem contém "período"; a lista continua com 0 | regra de negócio |
| C-003 | Salvar semanal 20/10/2026 com limite 10/10/2026 devolve recusa e a mensagem contém "data-limite" | regra de tela |
| C-004 | Mensal a partir de 31/01/2026 devolve 28/02/2026; a partir de 28/02/2026 devolve 28/03/2026; a partir de 31/01/2028 devolve 29/02/2028 | regra de tela |
| C-005 | Quinzenal 05/10/2026 com limite 25/10/2026 devolve 19/10/2026; a partir de 19/10/2026 devolve vazio | regra de tela |
| C-006 | Rodada com 3 agendamentos (14/09 semanal, 15/09 quinzenal, 20/09 sem recorrência) cria 2 pedidos na fase Análise, marca 2 como processados e cria 2 ocorrências, em 21/09 e 29/09; o de 20/09 continua pendente | regra de negócio |
| C-007 | Segunda rodada seguida devolve 0 processados; a contagem de pedidos do quadro não muda | regra de negócio |
| C-008 | Manual com o recorte "um agendamento" sobre o de 20/09 devolve 1 processado e os outros dois continuam pendentes | regra de negócio |
| C-009 | Manual com intervalo 14/09–16/09 devolve 2 processados e deixa o de 20/09 pendente | regra de negócio |
| C-010 | Manual sem recorte, em 15/09, devolve 2 processados (14/09 e 20/09) e deixa o de 03/10 pendente | regra de negócio |
| C-011 | Manual com "próximos 7 dias", em 15/09, devolve 1 processado (16/09); 14/09 e 30/09 ficam pendentes | regra de negócio |
| C-012 | Processamento manual em nome de uma pessoa de perfil comercial devolve recusa citando permissão e 0 pedidos criados | regra de negócio |
| C-013 | Cancelamento pelo gestor devolve sucesso, a situação vira cancelado e a rodada seguinte devolve 0 processados | regra de negócio |
| C-014 | Cancelamento pela analista devolve recusa e a situação continua pendente | regra de negócio |
| C-015 | Com hoje = 15/09/2026, o agendamento de 14/09 sem pedido tem situação atrasado; o filtro "atrasado" devolve 1 | regra de tela e regra de negócio |
| C-016 | Envio em 22/10/2026 de análise planejada para 20/10/2026 grava data de envio 22/10, planejada original 20/10 e data da análise 22/10; um segundo envio em 23/10 mantém a planejada original 20/10 | regra de negócio |
| C-017 | Gravar com 3 participantes e regravar com 2 deixa exatamente 2; a ocorrência criada pela recorrência nasce com os mesmos 2 | regra de negócio |
| C-018 | Com 6 agendamentos semeados, o filtro situação "atrasado" devolve 2 linhas e o total devolve 2 | regra de negócio |
| C-019 | O pedido criado tem criador = id da analista, responsável = id da analista, título "BENENUTRI MATRIZ · FRESENIUS KABI BRASIL LTDA" (filial e fornecedor em maiúsculas, como todo pedido), origem "agenda" e o registro de entrada na fase Análise com origem "sistema" | regra de negócio |
| C-020 | Rodada com 3 vencidos, o do meio inválido, devolve 2 processados e 1 erro; o inválido continua sem pedido e sem marcação | regra de negócio |
| C-021 | Com 3 fornecedores, um inativado: a escolha do agendamento devolve 2; gravar agendamento novo para o inativo não grava nada; o agendamento que ele já tinha continua na lista e é processado na rodada seguinte | regra de negócio |
| C-022 | `ocorrenciasNoMes`: sem recorrência só a base; semanal de 29/10 cai em 5, 12, 19 e 26/11; quinzenal com limite 10/11 só em 5/11; mensal de 31/10 cai em 30/11; fora do mês nada; `agruparPorDia` marca a projetada como recorrente | regra de tela |
| RN-001 | 31/01/2026 mensal → 28/02/2026; 30/03/2026 mensal → 30/04/2026 | regra de tela |
| RN-002 | 20/10/2026 semanal → 27/10/2026; quinzenal → 03/11/2026 | regra de tela |
| RN-003 | Semanal 20/10/2026 com limite 25/10/2026 → vazio (27/10 passa do limite) | regra de tela |
| RN-004 | Cancelar um agendamento já processado devolve recusa; cancelar um pendente preserva o registro na lista | regra de negócio |
| RN-005 | Cancelado e vencido → cancelado; processado e vencido → processado; pendente e vencido → atrasado; pendente e futuro → pendente | regra de tela |
| RN-006 | Início 20/10/2026 e fim 05/09/2026 → inválido; padrão de 45 dias sobre 20/10/2026 → 05/09/2026–20/10/2026 | regra de tela |
| RN-007 | Agendamento com pedido gerado e marcação apagada à mão não gera segundo pedido na rodada seguinte | regra de negócio |
| RN-008 | Ocorrência seguinte de 05/10/2026 (período 21/08–05/10, 45 dias) em 19/10/2026 nasce com período 04/09–19/10 | regra de tela |
| RN-009 | Ver C-019 | regra de negócio |
| RN-010 | Ver C-017 | regra de negócio |
| RN-011 | Matriz: admin cria/edita/processa e cancela; analista cria/edita/processa e não cancela; gestor cria/edita/processa e cancela; diretoria só cancela; comercial não faz nada; acesso só de leitura não faz nada | regra de tela e regra de negócio |
| RN-012 | Ver C-016 | regra de negócio |
| RN-013 | Com o relógio em 2026-09-16T01:00 universal (22h de 15/09 em Brasília), o agendamento de 16/09 não é tratado como vencido | regra de tela |
| RN-014 | Ver C-008 (futuro processado no manual) e C-006 (futuro intocado no automático) | regra de negócio |
| RN-015 | Ver C-021; além disso, um agendamento semanal vencido de fornecedor inativado gera o pedido e a ocorrência seguinte normalmente | regra de negócio |

- Cada cenário C-00N e cada regra RN-00N tem pelo menos uma linha.
- Toda linha tem entrada e resultado concretos; "executa sem erro" não é evidência.
- **Camada** diz onde a regra mora: *regra de negócio* (o que o sistema grava
  e devolve) ou *regra de tela* (cálculo, formatação, máscara que a pessoa vê).
- O que só olho humano verifica (layout, tema, navegação) fica em
  **Verificação manual**, listado aqui:
  - [ ] C-001 — o seletor de data abre, navega por mês, escolhe 20/10/2026 e fecha só com o teclado (Tab, setas, Enter, Esc)
  - [ ] C-018 — a lista com as quatro situações nos dois temas, sem cor quebrada e sem situação sinalizada só por cor
  - [ ] C-013 — a confirmação de cancelamento e o aviso de resultado aparecem no fluxo da tela, sem aviso passageiro
  - [ ] C-011 — o diálogo de processamento manual mostra os quatro recortes e explica o que cada um faz

## Fora de escopo

Obrigatório. O que não estiver listado como incluído está excluído.

- [ ] **Convite por e-mail ou calendário aos participantes** — a onda 1 só registra quem participa; avisar é assunto de outra onda.
- [ ] **Reunião sem fornecedor** (reunião interna, compromisso pessoal) — a agenda do SGC 2 é de análise de compra: todo registro tem fornecedor, filial e período.
- [ ] **Visão de calendário mensal** — a onda 1 entrega lista com filtros; o calendário do legado não volta agora.
- [ ] **Hora de início e fim da análise** — a agenda trabalha por dia.
- [ ] **Agendamento em lote** (vários fornecedores de uma vez, importação de planilha).
- [ ] **Monte do pedido pela agenda** — o agendamento gera o pedido vazio na fase Análise; os itens são da spec 003.
- [ ] **Regra de dia útil, feriado ou janela de fechamento do fornecedor** — a data agendada é a que a pessoa escolheu; a parametrização do fornecedor (spec 001) não desloca a data nesta onda.
- [ ] **Reprocessar um agendamento já processado** (gerar um segundo pedido) — quem precisa de outro pedido cria pela tela de criação manual.
- [ ] **Aviso de atraso por e-mail** — o atraso aparece na tela e no filtro; não dispara mensagem.

## Pendências

Cada item aqui **bloqueia** o `plan.md`.

- Nenhuma.

## Checklist de revisão

- [x] Nenhuma menção a tecnologia, tabela ou componente
- [x] Todo RF tem critério de aceite verificável
- [x] Seção "Fora de escopo" preenchida
- [x] Cenários cobrem pelo menos um caminho de erro (C-002, C-003, C-012, C-014, C-020)
- [x] Seção "Testes" preenchida: todo C-00N e toda RN-00N com evidência concreta
- [x] Zero `[NEEDS CLARIFICATION]` em aberto
